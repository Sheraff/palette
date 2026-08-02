"""Stage 1 of the oracle pipeline: SigLIP 2 embeddings for both corpora.

Embeds every FILE (not every artwork) in both collections, because per-file
vectors are what near-duplicate detection across renditions needs (spec section
6.1). Vectors are L2-normalized on write, so cosine similarity is a dot product.

The run is resumable from its own output and can be killed at any moment: see the
module docstring of common.py for the storage shape. Per-file failures become
`failed` rows after MAX_ATTEMPTS_PER_FILE attempts counted across restarts; they
are never silent skips.

Usage:
  .venv/bin/python embed.py --collections sharded music_artworks
  .venv/bin/python embed.py --limit 50 --out-dir /tmp/smoke   # smoke test
  .venv/bin/python embed.py --finalize-only
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


def embed_batch(model, preprocess, device: str, images: list) -> "object":
    import torch

    tensors = [preprocess(image) for image in images]
    batch = torch.stack(tensors).to(device)
    with torch.no_grad():
        vectors = model.encode_image(batch)
        # L2-normalize on write, always (spec section 6.2).
        vectors = vectors / vectors.norm(dim=-1, keepdim=True)
    return vectors.to("cpu").float().numpy()


def run_collection(
    collection: str,
    out_dir: Path,
    device: str,
    batch_size: int,
    limit: int | None,
    model,
    preprocess,
    only_paths: set[str] | None = None,
) -> dict:
    store = common.EmbeddingStore(out_dir, collection)
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
        f"[embed] {collection}: {len(all_paths)} files, "
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
            vectors = embed_batch(
                model, preprocess, device, [item[1].rgb for item in decoded]
            )
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


def write_manifest(out_dir: Path, device: str, batch_size: int, per_collection: dict) -> Path:
    weights_path = common.model_weights_path()
    manifest = {
        "stage": "oracle-stage-1-embeddings",
        "spec": "research/v3/ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md sections 2.1, 6",
        "written_at": common.utc_now_iso(),
        "model": {
            "open_clip_model_name": config.MODEL_NAME,
            "open_clip_pretrained_tag": config.PRETRAINED_TAG,
            "hf_repo": config.MODEL_HF_REPO,
            "hf_revision": config.MODEL_HF_REVISION,
            "observed_hf_revision": common.observed_model_revision(),
            "weights_filename": config.MODEL_WEIGHTS_FILENAME,
            "weights_sha256": config.MODEL_WEIGHTS_SHA256,
            "weights_path_present": weights_path is not None,
        },
        "versions": common.runtime_versions(),
        "embedding": {
            "dim": config.EMBED_DIM,
            "dtype": "float32",
            "l2_normalized": True,
            "device": device,
            "batch_size": batch_size,
            "torch_dtype": config.TORCH_DTYPE,
        },
        "preprocessing": {
            "description": (
                "PIL open; EXIF orientation applied; images with an alpha channel "
                f"composited onto {list(config.ALPHA_FLATTEN_BACKGROUND_RGB)} then "
                "converted to RGB, others converted directly to RGB; then the "
                "transform open_clip ships with this checkpoint: bicubic resize to "
                f"{config.MODEL_INPUT_SIDE_PX}x{config.MODEL_INPUT_SIDE_PX} "
                "(square, aspect ratio not preserved), to float tensor, normalize "
                "with mean 0.5 and std 0.5 per channel."
            ),
            "input_side_px": config.MODEL_INPUT_SIDE_PX,
            "aspect_ratio_preserved": False,
            "resolution_cap_applied": None,
            "alpha_flatten_background_rgb": list(config.ALPHA_FLATTEN_BACKGROUND_RGB),
            "exif_transpose": True,
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
        },
        "identity": {
            "row_key": "file path relative to the repository root, plus sha256 of "
            "the file bytes",
            "note": "one row per FILE, not per artwork; renditions of the same "
            "artwork each get their own row (spec section 6.1)",
        },
        "collections": {},
    }

    for collection in config.COLLECTIONS:
        store = common.EmbeddingStore(out_dir, collection)
        recovery = store.recover()
        try:
            enumerated = len(common.enumerate_collection(collection))
        except FileNotFoundError:
            enumerated = None
        manifest["collections"][collection] = {
            "root": (
                "{00..09,0a..0f,10..14}/"
                if collection == config.COLLECTION_SHARDED
                else config.MUSIC_ARTWORKS_DIR_NAME + "/"
            ),
            "files_enumerated": enumerated,
            "files_embedded": recovery["ok_rows"],
            "files_failed": recovery["failed_rows"],
            "npy": f"{collection}.npy",
            "ids": f"{collection}.ids.jsonl",
            "complete": enumerated is not None
            and recovery["ok_rows"] + recovery["failed_rows"] == enumerated,
        }
        if collection in per_collection:
            manifest["collections"][collection]["last_run"] = per_collection[collection]

    manifest_path = out_dir / config.MANIFEST_FILENAME
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--collections", nargs="+", default=list(config.COLLECTIONS),
        choices=list(config.COLLECTIONS),
    )
    parser.add_argument("--out-dir", default=str(config.DATA_DIR))
    parser.add_argument("--device", default="auto")
    parser.add_argument("--batch-size", type=int, default=config.DEFAULT_BATCH_SIZE)
    parser.add_argument(
        "--limit", type=int, default=None,
        help="consider only the first N files of each collection, in enumeration order. A prefix, not a quota: killing and resuming a limited run converges on the same N files (smoke tests).",
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
        "--no-verify-revision", action="store_true",
        help="skip the check that the cached model weights match the pinned revision",
    )
    args = parser.parse_args()

    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    signal.signal(signal.SIGINT, _request_stop)
    signal.signal(signal.SIGTERM, _request_stop)

    if args.manifest_only:
        path = write_manifest(out_dir, common.resolve_device(args.device), args.batch_size, {})
        print(f"[embed] manifest: {path}")
        return 0

    if args.finalize_only:
        for collection in args.collections:
            store = common.EmbeddingStore(out_dir, collection)
            store.recover()
            array = store.finalize_npy()
            print(f"[embed] {collection}: wrote {store.npy_path} {array.shape}")
        print(f"[embed] manifest: {write_manifest(out_dir, args.device, args.batch_size, {})}")
        return 0

    device = common.resolve_device(args.device)
    print(f"[embed] device={device} model={config.MODEL_NAME}/{config.PRETRAINED_TAG}", flush=True)
    t0 = time.perf_counter()
    model, preprocess = common.load_model(device, verify_revision=not args.no_verify_revision)
    print(f"[embed] model loaded in {time.perf_counter() - t0:.1f}s", flush=True)

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
            collection, out_dir, device, args.batch_size, args.limit, model,
            preprocess, only_paths,
        )
        per_collection[collection] = stats
        print(f"[embed] {collection} stats: {json.dumps(stats)}", flush=True)
        if _stop_requested:
            break

    manifest_path = write_manifest(out_dir, device, args.batch_size, per_collection)
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
