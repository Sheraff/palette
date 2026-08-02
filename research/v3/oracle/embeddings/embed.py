"""Stage 1 of the oracle pipeline: image embeddings for both corpora.

Runs one MODEL ARM at a time (config.ARMS). The arms are a bake-off: our three
uses -- near-duplicate detection, visual stratification, failure-class retrieval
-- are all image-to-image, and we never query by text, so a pure-vision encoder
may beat a text-aligned one. eval_pairs.py scores them against ground truth we
own. Everything below the model is shared: enumeration, decode, store, resume.

Embeds every FILE (not every artwork) in both collections, because per-file
vectors are what near-duplicate detection across renditions needs (spec section
6.1). Vectors are L2-normalized on write, so cosine similarity is a dot product.

The run is resumable from its own output and can be killed at any moment: see the
module docstring of common.py for the storage shape. Per-file failures become
`failed` rows after MAX_ATTEMPTS_PER_FILE attempts counted across restarts; they
are never silent skips.

Usage:
  .venv/bin/python embed.py --arm dinov2-vitl14
  .venv/bin/python embed.py --arm pe-core-l14 --limit 50 --out-dir /tmp/smoke
  .venv/bin/python embed.py --arm dinov2-vitl14 --finalize-only
  .venv/bin/python embed.py --list-arms
"""

from __future__ import annotations

import argparse
import json
import signal
import time
from pathlib import Path

import config
import common

# [REVIEWED] How often the run prints a progress line. Purely cosmetic; chosen so
# a full run produces a readable log rather than 16,000 lines.
PROGRESS_EVERY_N_FILES = 200

_stop_requested = False


def _request_stop(signum, frame):  # noqa: ARG001
    global _stop_requested
    _stop_requested = True
    print(f"\n[embed] signal {signum} received; finishing this batch and exiting.", flush=True)


def build_queue(store: common.EmbeddingStore, all_paths: list[str]):
    """Work queue = everything not already resolved, minus anything out of attempts."""
    queue: list[str] = []
    exhausted: list[str] = []
    for path in all_paths:
        if path in store.ok_paths or path in store.failed_paths:
            continue
        if store.attempts_by_path.get(path, 0) >= config.MAX_ATTEMPTS_PER_FILE:
            exhausted.append(path)
            continue
        queue.append(path)
    return queue, exhausted


def embed_batch(arm: common.ArmRuntime, images: list) -> "object":
    """Encode one batch. L2-normalization happens inside the arm (spec 6.2)."""
    return arm.encode(images)


def run_collection(
    collection: str,
    out_dir: Path,
    device: str,
    batch_size: int,
    limit: int | None,
    arm: common.ArmRuntime,
    only_paths: set[str] | None = None,
) -> dict:
    store = common.EmbeddingStore(out_dir, collection, arm_tag=arm.tag)
    recovery = store.recover()

    all_paths = common.enumerate_collection(collection)
    if only_paths is not None:
        all_paths = [path for path in all_paths if path in only_paths]
    if limit is not None:
        # The limit selects a fixed prefix of the enumeration, not a quota of new
        # work, so a limited run that is killed and resumed converges on exactly
        # the same set of files rather than embedding `limit` more each time.
        all_paths = all_paths[:limit]
    queue, exhausted = build_queue(store, all_paths)

    print(
        f"[embed] [{arm.tag}] {collection}: {len(all_paths)} files, "
        f"{recovery['ok_rows']} already embedded, "
        f"{recovery['failed_rows']} already failed, "
        f"{len(queue)} queued, {len(exhausted)} out of attempts"
        + (
            f", repaired {recovery['truncated_bytes']} torn bytes"
            if recovery["truncated_bytes"]
            else ""
        ),
        flush=True,
    )

    store.open()
    stats = {
        "collection": collection,
        "arm": arm.tag,
        "queued": len(queue),
        "embedded": 0,
        "failed": 0,
        "decode_seconds": 0.0,
        "encode_seconds": 0.0,
        "wall_seconds": 0.0,
    }
    started = time.perf_counter()

    try:
        # Anything that burned its attempt budget on hard crashes gets its row now,
        # so "attempted and failed" survives into the warehouse (spec section 5.1).
        for path in exhausted:
            store.append_id_row(
                {
                    "collection": collection,
                    "row": None,
                    "path": path,
                    "sha256": None,
                    "status": "failed",
                    "error_class": "MaxAttemptsExceeded",
                    "error": (
                        f"{store.attempts_by_path.get(path, 0)} attempts recorded "
                        "with no outcome; the process did not survive them"
                    ),
                    "attempts": store.attempts_by_path.get(path, 0),
                    "embedded_at": common.utc_now_iso(),
                }
            )
            stats["failed"] += 1

        # A path that already has attempts recorded but no outcome crashed the
        # process last time. Give it a batch of its own so a batch-mate is never
        # blamed for it.
        suspect = [p for p in queue if store.attempts_by_path.get(p, 0) > 0]
        clean = [p for p in queue if store.attempts_by_path.get(p, 0) == 0]
        if suspect:
            print(
                f"[embed] {collection}: {len(suspect)} path(s) crashed a previous "
                "run; retrying them one at a time first.",
                flush=True,
            )

        batches: list[list[str]] = [[p] for p in suspect]
        batches += [clean[i : i + batch_size] for i in range(0, len(clean), batch_size)]

        done = 0
        for batch_paths in batches:
            if _stop_requested:
                break

            decoded: list[tuple[str, common.DecodedImage, str, int]] = []
            for path in batch_paths:
                abs_path = config.REPO_ROOT / path
                store.record_attempt(path)
                t0 = time.perf_counter()
                try:
                    image = common.decode_image(abs_path)
                    sha = common.sha256_file(abs_path)
                    size_bytes = abs_path.stat().st_size
                except Exception as exc:  # noqa: BLE001 - any decode failure is a row
                    store.append_id_row(
                        {
                            "collection": collection,
                            "row": None,
                            "path": path,
                            "sha256": None,
                            "status": "failed",
                            "error_class": type(exc).__name__,
                            "error": str(exc)[:500],
                            "attempts": store.attempts_by_path.get(path, 0),
                            "embedded_at": common.utc_now_iso(),
                        }
                    )
                    stats["failed"] += 1
                    continue
                finally:
                    stats["decode_seconds"] += time.perf_counter() - t0
                decoded.append((path, image, sha, size_bytes))

            if not decoded:
                done += len(batch_paths)
                continue

            t0 = time.perf_counter()
            vectors = embed_batch(arm, [item[1].rgb for item in decoded])
            stats["encode_seconds"] += time.perf_counter() - t0

            rows = store.append_vectors(vectors)
            for row, (path, image, sha, size_bytes) in zip(rows, decoded):
                store.append_id_row(
                    {
                        "collection": collection,
                        "row": row,
                        "path": path,
                        "sha256": sha,
                        "status": "ok",
                        "width": image.width,
                        "height": image.height,
                        "format": image.format_name,
                        "bytes": size_bytes,
                        "attempts": store.attempts_by_path.get(path, 0),
                        "embedded_at": common.utc_now_iso(),
                    }
                )
                stats["embedded"] += 1

            done += len(batch_paths)
            if done % PROGRESS_EVERY_N_FILES < batch_size:
                elapsed = time.perf_counter() - started
                rate = done / elapsed if elapsed else 0.0
                remaining = (len(queue) - done) / rate if rate else 0.0
                print(
                    f"[embed] {collection}: {done}/{len(queue)} "
                    f"({rate:.1f} img/s, ~{remaining / 60:.1f} min left)",
                    flush=True,
                )
    finally:
        store.close()

    stats["wall_seconds"] = time.perf_counter() - started

    remaining_queue, _ = build_queue(store, all_paths)
    stats["remaining"] = len(remaining_queue)
    stats["total_rows"] = store.n_rows
    if not remaining_queue and not _stop_requested:
        array = store.finalize_npy()
        stats["npy"] = str(store.npy_path)
        stats["npy_shape"] = list(array.shape)
        print(f"[embed] {collection}: wrote {store.npy_path} {array.shape}", flush=True)
    else:
        print(
            f"[embed] {collection}: {len(remaining_queue)} file(s) still queued; "
            "not finalizing .npy yet.",
            flush=True,
        )
    return stats




def arm_manifest_entry(out_dir: Path, tag: str, device: str, batch_size: int,
                       per_collection: dict) -> dict:
    """Describe one arm from what is actually on disk."""
    spec = config.ARMS[tag]
    weights_path = common.model_weights_path(
        spec["hf_repo"], spec["hf_revision"], spec["weights_filename"]
    )
    if spec["loader"] == "open_clip":
        preprocess_description = (
            "the transform open_clip ships with this checkpoint: resize to "
            f"{spec['input_side_px']}x{spec['input_side_px']} in 'squash' mode "
            "(whole frame, aspect ratio not preserved, no crop), to float tensor, "
            "normalize with mean 0.5 and std 0.5 per channel"
        )
    else:
        preprocess_description = (
            f"bicubic resize of the whole frame to {spec['input_side_px']}x"
            f"{spec['input_side_px']} (no center crop -- deliberately unlike the "
            "stock DINOv2 processor, which would discard a border ring holding "
            "titles and badges), to float tensor, ImageNet mean/std normalize"
        )

    entry = {
        "model": {
            "loader": spec["loader"],
            "model_id": spec["model_id"],
            "pretrained_tag": spec["pretrained"],
            "hf_repo": spec["hf_repo"],
            "hf_revision": spec["hf_revision"],
            "observed_hf_revision": common.observed_model_revision(spec["hf_repo"]),
            "weights_filename": spec["weights_filename"],
            "weights_sha256": spec["weights_sha256"],
            "weights_hash_pinned": spec.get("weights_sha256") is not None,
            "weights_path_present": weights_path is not None,
            "gated": bool(spec.get("gated")),
            "readiness": common.arm_readiness(tag),
            "text_aligned": spec["text_aligned"],
        },
        "embedding": {
            "dim": spec["dim"],
            "dtype": "float32",
            "l2_normalized": True,
            "device": device,
            "batch_size": batch_size,
            "torch_dtype": config.TORCH_DTYPE,
            "pooling": spec["pooling"],
        },
        "preprocessing": {
            "description": (
                "PIL open; EXIF orientation applied; images with an alpha channel "
                f"composited onto {list(config.ALPHA_FLATTEN_BACKGROUND_RGB)} then "
                "converted to RGB, others converted directly to RGB; then "
                + preprocess_description
                + "."
            ),
            "input_side_px": spec["input_side_px"],
            "aspect_ratio_preserved": False,
            "center_cropped": False,
            "resolution_cap_applied": None,
            "alpha_flatten_background_rgb": list(config.ALPHA_FLATTEN_BACKGROUND_RGB),
            "exif_transpose": True,
        },
        "collections": {},
    }

    for collection in config.COLLECTIONS:
        store = common.EmbeddingStore(out_dir, collection, arm_tag=tag)
        # Never repair from here: a manifest rewrite can run while a job is live.
        recovery = store.recover(read_only=True)
        try:
            enumerated = len(common.enumerate_collection(collection))
        except FileNotFoundError:
            enumerated = None
        entry["collections"][collection] = {
            "root": (
                "{00..09,0a..0f,10..14}/"
                if collection == config.COLLECTION_SHARDED
                else config.MUSIC_ARTWORKS_DIR_NAME + "/"
            ),
            "files_enumerated": enumerated,
            "files_embedded": recovery["ok_rows"],
            "files_failed": recovery["failed_rows"],
            "npy": store.npy_path.name,
            "ids": store.ids_path.name,
            "complete": enumerated is not None
            and recovery["ok_rows"] + recovery["failed_rows"] == enumerated,
        }
        if collection in per_collection:
            entry["collections"][collection]["last_run"] = per_collection[collection]
    return entry


def write_manifest(out_dir: Path, device: str, batch_size: int,
                   per_collection: dict, arm_tag: str | None = None) -> Path:
    """Rebuild manifest.json from disk. Disk is the source of truth, so this is
    safe to call at any time and never loses another arm's provenance."""
    manifest = {
        "stage": "oracle-stage-1-embeddings",
        "spec": "research/v3/ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md sections 2.1, 6",
        "written_at": common.utc_now_iso(),
        "versions": common.runtime_versions(),
        "bakeoff": {
            "why": "near-dup detection, visual stratification and failure-class "
            "retrieval are all image-to-image; we never query by text, so a "
            "pure-vision arm may beat a text-aligned one",
            "arms_compared_by_default": list(config.BAKEOFF_ARMS),
            "resolution_confound": config.ARM_RESOLUTION_CONFOUND,
            "dinov3_unavailable": {
                "repo": config.DINOV3_REPO_BLOCKED,
                "reason": config.DINOV3_BLOCK_REASON,
                "fallback": config.ARM_DINOV2,
                "unblock": "accept the licence on the model page and export "
                "HF_TOKEN, then add a dinov3 entry to config.ARMS",
            },
        },
        "determinism": {
            "same_batch_composition": "bit-identical, both on repeat within one "
            "process and across two separate processes (measured 2026-08-02 with "
            "determinism_check.py on three images: JPEG, AVIF, large PNG)",
            "different_batch_composition": "not bit-identical. Changing the batch "
            "size or an image's neighbours moves components by up to ~1e-6 "
            "absolute; cosine similarity to the batch-of-1 vector stays >= "
            "0.9999999. Reproduced on the CPU device, so this is float reduction "
            "order in the batched matmul, not an MPS defect.",
            "consequence": "neighbour rankings and any threshold on cosine "
            "similarity are unaffected. A byte-identical .npy requires one "
            "uninterrupted pass at a fixed batch size; a resumed run re-batches "
            "and will differ in the last ~6 decimal places for the files embedded "
            "after the restart.",
            "measured_on_arm": config.ARM_SIGLIP2,
        },
        "identity": {
            "row_key": "file path relative to the repository root, plus sha256 of "
            "the file bytes",
            "note": "one row per FILE, not per artwork; renditions of the same "
            "artwork each get their own row (spec section 6.1)",
        },
        "arms": {},
    }

    for tag in config.ARMS:
        entry = arm_manifest_entry(
            out_dir, tag, device, batch_size,
            per_collection if tag == arm_tag else {},
        )
        any_output = any(
            c["files_embedded"] or c["files_failed"]
            for c in entry["collections"].values()
        )
        entry["has_output"] = any_output
        manifest["arms"][tag] = entry

    manifest_path = out_dir / config.MANIFEST_FILENAME
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest_path


def migrate_legacy_names(out_dir: Path) -> list[tuple[str, str]]:
    """Rename the pre-bake-off untagged SigLIP2 output to the tagged contract.

    Run this only once the SigLIP2 job has finished -- renaming files out from
    under a live writer would strand its open handles.
    """
    moved: list[tuple[str, str]] = []
    shard_dir = out_dir / config.SHARD_SUBDIR_NAME
    tag = config.ARM_SIGLIP2
    for collection in config.COLLECTIONS:
        pairs = [
            (out_dir / f"{collection}.ids.jsonl", out_dir / f"{collection}.{tag}.ids.jsonl"),
            (out_dir / f"{collection}.npy", out_dir / f"{collection}.{tag}.npy"),
            (shard_dir / f"{collection}.f32", shard_dir / f"{collection}.{tag}.f32"),
            (
                shard_dir / f"{collection}.attempts.jsonl",
                shard_dir / f"{collection}.{tag}.attempts.jsonl",
            ),
        ]
        for old, new in pairs:
            if old.exists() and not new.exists():
                old.rename(new)
                moved.append((old.name, new.name))
    return moved


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--arm", default=config.DEFAULT_ARM, choices=list(config.ARMS),
        help="which model arm to embed with",
    )
    parser.add_argument(
        "--list-arms", action="store_true",
        help="list arms and whether each can run right now (offline check)",
    )
    parser.add_argument(
        "--pin-arm-weights", metavar="ARM", default=None, choices=list(config.ARMS),
        help="download the arm's checkpoint if needed, hash it, and print the "
        "weights_sha256 line to paste into config.ARMS",
    )
    parser.add_argument(
        "--collections", nargs="+", default=list(config.COLLECTIONS),
        choices=list(config.COLLECTIONS),
    )
    parser.add_argument("--out-dir", default=str(config.DATA_DIR))
    parser.add_argument("--device", default="auto")
    parser.add_argument("--batch-size", type=int, default=config.DEFAULT_BATCH_SIZE)
    parser.add_argument(
        "--limit", type=int, default=None,
        help="consider only the first N files of each collection, in enumeration "
        "order. A prefix, not a quota: killing and resuming a limited run "
        "converges on the same N files (smoke tests).",
    )
    parser.add_argument(
        "--paths-file",
        help="restrict the run to the repo-relative paths listed in this file, one "
        "per line. For smoke tests and targeted re-runs; use a separate --out-dir.",
    )
    parser.add_argument("--finalize-only", action="store_true")
    parser.add_argument(
        "--manifest-only", action="store_true",
        help="rewrite manifest.json from whatever is already on disk, no model load",
    )
    parser.add_argument(
        "--migrate-legacy-names", action="store_true",
        help="rename the pre-bake-off untagged SigLIP2 output to <collection>."
        "<arm>.* . Only when that job is finished.",
    )
    parser.add_argument(
        "--no-verify-revision", action="store_true",
        help="skip the check that the cached model weights match the pinned revision",
    )
    parser.add_argument(
        "--verify-weights", action="store_true",
        help="also sha256 the checkpoint before loading (adds a few seconds)",
    )
    args = parser.parse_args()

    if args.list_arms:
        for tag, spec in config.ARMS.items():
            mark = " (default)" if tag == config.DEFAULT_ARM else ""
            r = common.arm_readiness(tag)
            if r["ready"]:
                state = "READY"
            elif not r["weights_cached"] and r["gated"]:
                state = "GATED/absent"
            elif not r["weights_cached"]:
                state = "not downloaded"
            else:
                state = "UNPINNED hash"
            print(
                f"{tag:22s} dim={spec['dim']:5d} in={spec['input_side_px']:4d}px  "
                f"{'text-aligned' if spec['text_aligned'] else 'vision-only ':13s} "
                f"{state:14s} {spec['model_id']}{mark}"
            )
        return 0

    if args.pin_arm_weights:
        try:
            info = common.pin_arm_weights(args.pin_arm_weights)
        except Exception as exc:  # noqa: BLE001 - the message is the product here
            tag = args.pin_arm_weights
            spec = config.ARMS[tag]
            print(f"[embed] could not pin {tag}: {type(exc).__name__}")
            if "Gated" in type(exc).__name__ or "401" in str(exc):
                print(
                    f"[embed] {spec['hf_repo']} is still gated for this machine.\n"
                    f"[embed]   1. accept the licence at "
                    f"https://huggingface.co/{spec['hf_repo']}\n"
                    f"[embed]   2. put a read token at ~/.cache/huggingface/token "
                    f"(`huggingface-cli login`) or export HF_TOKEN\n"
                    f"[embed]   3. re-run: embed.py --pin-arm-weights {tag}"
                )
            else:
                print(f"[embed] {str(exc)[:300]}")
            return 1
        print(json.dumps(info, indent=2))
        if info["already_pinned"] is None:
            print(
                f'\nPaste into config.ARMS["{info["arm"]}"]:\n'
                f'        "weights_sha256": (\n'
                f'            "{info["sha256"]}"\n'
                f'        ),'
            )
        elif not info["matches_pin"]:
            print("\nWARNING: the downloaded weights do NOT match the pinned hash.")
        else:
            print("\nMatches the existing pin.")
        return 0

    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    signal.signal(signal.SIGINT, _request_stop)
    signal.signal(signal.SIGTERM, _request_stop)

    if args.migrate_legacy_names:
        moved = migrate_legacy_names(out_dir)
        for old, new in moved:
            print(f"[embed] renamed {old} -> {new}")
        print(f"[embed] {len(moved)} file(s) renamed")
        print(f"[embed] manifest: {write_manifest(out_dir, args.device, args.batch_size, {})}")
        return 0

    if args.manifest_only:
        path = write_manifest(out_dir, common.resolve_device(args.device), args.batch_size, {})
        print(f"[embed] manifest: {path}")
        return 0

    if args.finalize_only:
        for collection in args.collections:
            store = common.EmbeddingStore(out_dir, collection, arm_tag=args.arm)
            store.recover()
            array = store.finalize_npy()
            print(f"[embed] [{args.arm}] {collection}: wrote {store.npy_path} {array.shape}")
        print(f"[embed] manifest: {write_manifest(out_dir, args.device, args.batch_size, {}, args.arm)}")
        return 0

    device = common.resolve_device(args.device)
    spec = config.ARMS[args.arm]
    print(f"[embed] device={device} arm={args.arm} model={spec['model_id']}", flush=True)
    t0 = time.perf_counter()
    arm = common.load_arm(
        args.arm, device,
        verify_revision=not args.no_verify_revision,
        verify_weights=args.verify_weights,
    )
    print(f"[embed] model loaded in {time.perf_counter() - t0:.1f}s (dim {arm.dim})", flush=True)

    only_paths = None
    if args.paths_file:
        only_paths = {
            line.strip()
            for line in Path(args.paths_file).read_text(encoding="utf-8").splitlines()
            if line.strip()
        }

    per_collection = {}
    for collection in args.collections:
        stats = run_collection(
            collection, out_dir, device, args.batch_size, args.limit, arm, only_paths,
        )
        per_collection[collection] = stats
        print(f"[embed] {collection} stats: {json.dumps(stats)}", flush=True)
        if _stop_requested:
            break

    manifest_path = write_manifest(
        out_dir, device, args.batch_size, per_collection, args.arm
    )
    print(f"[embed] manifest: {manifest_path}", flush=True)

    if _stop_requested:
        print("[embed] stopped on request; rerun the same command to resume.", flush=True)
        return 130
    incomplete = [c for c, s in per_collection.items() if s.get("remaining")]
    if incomplete and args.limit is None:
        print(f"[embed] incomplete: {incomplete}", flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
