"""SAM geometry stage runner — oracle pipeline stage 2 (§2.2, §8.3, §9.2).

Per image: run the whole concept-prompt union in one backbone pass, write one JSONL row
per (image, concept, instance) in the artwork_regions shape, then one per-image summary
row carrying the union mask, the total masked fraction and the residual-field fraction
(§8.3's subtractive use: everything not covered by an instance mask is field).

Resumable, flushed per record, attempt-capped, canary-checked (§5.1, §5.3).

Usage:
    .venv/bin/python run_sam.py --eval-set --out sam-eval-142
    .venv/bin/python run_sam.py --list mylist.txt --out sam-smoke --limit 10
    .venv/bin/python run_sam.py --collection sharded --out sam-sharded
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import traceback
import uuid
from pathlib import Path

import numpy as np

import common
import config


def instance_row(ref: common.ImageRef, inst: common.Instance, meta: dict,
                 image_sha256: str, height: int, width: int) -> dict:
    """One artwork_regions row (§9.2): normalized bbox, area_fraction, score, mask RLE."""
    x, y, w, h = inst.bbox
    return {
        "record_type": config.RECORD_TYPE_REGION,
        "collection": ref.collection,
        "image_id": ref.image_id,
        "artwork_id": ref.artwork_id,
        "image_path": ref.rel_path,
        "image_sha256": image_sha256,
        "run_id": meta["run_id"],
        "schema_version": config.SCHEMA_VERSION,
        "concept": inst.concept,
        "instance_idx": inst.instance_idx,
        "bbox_x": round(x, 6),
        "bbox_y": round(y, 6),
        "bbox_w": round(w, 6),
        "bbox_h": round(h, 6),
        "area_fraction": round(inst.area_fraction, 9),
        "score": round(inst.score, 6),
        "mask_rle": common.rle_encode(inst.mask),
        "mask_rle_format": config.MASK_RLE_FORMAT,
        "mask_height": height,
        "mask_width": width,
    }


def summary_row(ref: common.ImageRef, result: common.ImageResult, meta: dict,
                image_sha256: str, source_long_edge: int, processed_long_edge: int,
                key: str, attempt: int) -> dict:
    height, width = result.height, result.width
    pixel_area = float(height * width)

    union = common.union_mask(result.instances, height, width)
    masked_fraction = float(union.sum()) / pixel_area

    group_fractions = {}
    for group, concepts in config.CONCEPT_GROUPS.items():
        sub = [i for i in result.instances if i.concept in concepts]
        group_union = common.union_mask(sub, height, width)
        group_fractions[f"{group}_union_area_fraction"] = round(
            float(group_union.sum()) / pixel_area, 9)

    counts = {c: 0 for c, _ in config.CONCEPT_PROMPTS}
    for inst in result.instances:
        counts[inst.concept] += 1

    row = {
        "record_type": config.RECORD_TYPE_IMAGE,
        "status": "ok",
        "collection": ref.collection,
        "image_id": ref.image_id,
        "artwork_id": ref.artwork_id,
        "image_path": ref.rel_path,
        "image_sha256": image_sha256,
        "row_key": key,
        "attempt": attempt,
        "run_id": meta["run_id"],
        "schema_version": config.SCHEMA_VERSION,
        "source_long_edge_px": source_long_edge,
        "processed_long_edge_px": processed_long_edge,
        "width": width,
        "height": height,
        "instances_total": len(result.instances),
        "instances_by_concept": counts,
        "concepts_with_zero_instances": sorted(c for c, n in counts.items() if n == 0),
        "masked_area_fraction": round(masked_fraction, 9),
        # §8.3: everything not covered by an instance mask is field. This is the number
        # the colorimetry stage runs on.
        "residual_field_fraction": round(1.0 - masked_fraction, 9),
        "union_mask_rle": common.rle_encode(union),
        "union_mask_rle_format": config.MASK_RLE_FORMAT,
        "seconds_total": round(result.seconds_total, 3),
        "seconds_by_concept": {k: round(v, 3) for k, v in result.seconds_by_concept.items()},
        "decoded_at": common.utc_now(),
    }
    row.update(group_fractions)
    row.update(meta)
    return row


def canary_digest(result: common.ImageResult) -> str:
    """§5.3: a stable fingerprint of one image's answer. Inference here is deterministic,
    so any difference mid-run is a real fault and halts the run."""
    payload = [
        [i.concept, i.instance_idx, round(i.score, 5), round(i.area_fraction, 7),
         [round(v, 5) for v in i.bbox]]
        for i in sorted(result.instances, key=lambda x: (x.concept, x.instance_idx))
    ]
    return common.sha256_bytes(json.dumps(payload, separators=(",", ":")).encode())


def build_queue(args) -> list[common.ImageRef]:
    if args.list:
        refs = common.read_list_file(Path(args.list))
    elif args.eval_set:
        refs = common.eval_set_refs()
    elif args.collection:
        refs = common.enumerate_collection(args.collection)
    else:
        raise SystemExit("one of --list / --eval-set / --collection is required")
    if args.limit:
        refs = refs[:args.limit]
    return refs


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_argument_group("work list")
    src.add_argument("--list", help="file of repo-relative image paths, one per line")
    src.add_argument("--eval-set", action="store_true",
                     help="the 142 included premise eval-set images")
    src.add_argument("--collection", choices=[config.COLLECTION_SHARDED,
                                              config.COLLECTION_MUSIC_ARTWORKS])
    ap.add_argument("--out", required=True, help="output stem under research/v3/data/sam/")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--canary", default=None,
                    help="repo-relative path re-run every CANARY_EVERY images "
                         "(default: the first image of the queue)")
    ap.add_argument("--canary-every", type=int, default=config.CANARY_EVERY)
    ap.add_argument("--no-verify-weights", action="store_true",
                    help="skip the 3.5 GB weights hash check (saves ~3 s on restart)")
    ap.add_argument("--progress-every", type=int, default=1)
    args = ap.parse_args()

    out_path = config.DATA_DIR / f"{args.out}.jsonl"
    attempts_path = config.DATA_DIR / f"{args.out}.attempts.jsonl"

    refs = build_queue(args)
    done = common.completed_keys(out_path)
    ledger = common.AttemptLedger(attempts_path)
    sink = common.JsonlSink(out_path)

    run_id = uuid.uuid4().hex
    meta = common.provenance(run_id)

    print(f"[sam] queue={len(refs)} already_done={len(done)} out={out_path}", flush=True)

    runtime = None
    canary_ref = (common.ImageRef.from_rel(args.canary) if args.canary
                  else (refs[0] if refs else None))
    canary_baseline: str | None = None
    processed = 0
    failed = 0
    started_run = time.time()

    try:
        for ref in refs:
            if not ref.abs_path.exists():
                # Terminal and keyed, so a restart skips it instead of re-reporting a
                # failure forever and burning the restart budget.
                missing_key = f"missing|{ref.rel_path}"
                if missing_key not in done:
                    sink.write({"record_type": config.RECORD_TYPE_IMAGE, "status": "failed",
                                "image_path": ref.rel_path, "image_id": ref.image_id,
                                "collection": ref.collection, "artwork_id": ref.artwork_id,
                                "row_key": missing_key, "attempt": 0,
                                "error_class": "FileNotFoundError",
                                "error_message": str(ref.abs_path), **meta})
                    done.add(missing_key)
                    failed += 1
                continue

            image_sha256 = common.sha256_file(ref.abs_path)
            key = common.row_key(image_sha256)
            if key in done:
                continue

            attempt = ledger.record(key, ref.rel_path)
            if attempt > config.MAX_ATTEMPTS:
                sink.write({"record_type": config.RECORD_TYPE_IMAGE, "status": "failed",
                            "image_path": ref.rel_path, "image_id": ref.image_id,
                            "collection": ref.collection, "artwork_id": ref.artwork_id,
                            "image_sha256": image_sha256, "row_key": key,
                            "attempt": attempt, "error_class": "AttemptCapExceeded",
                            "error_message": f"{config.MAX_ATTEMPTS} attempts",
                            **meta})
                done.add(key)
                failed += 1
                continue

            try:
                image, source_long_edge, processed_long_edge = common.decode_image(ref.abs_path)
                if runtime is None:
                    runtime = common.load_sam(verify_weights=not args.no_verify_weights)
                    meta = common.provenance(run_id, runtime)
                    print(f"[sam] model loaded in {runtime.load_seconds:.1f}s "
                          f"from {runtime.snapshot_path}", flush=True)
                result = common.segment_concepts(runtime, image)
                row = summary_row(ref, result, meta, image_sha256,
                                  source_long_edge, processed_long_edge, key, attempt)
                for inst in result.instances:
                    sink.write(instance_row(ref, inst, meta, image_sha256,
                                            result.height, result.width))
                sink.write(row)
                done.add(key)
                processed += 1

                if args.progress_every and processed % args.progress_every == 0:
                    print(f"[sam] {processed}/{len(refs)} {ref.rel_path} "
                          f"{result.width}x{result.height} "
                          f"n={len(result.instances)} "
                          f"masked={row['masked_area_fraction']:.3f} "
                          f"{result.seconds_total:.2f}s", flush=True)

                # -- canary (§5.3) -------------------------------------------------
                if canary_ref is not None and args.canary_every:
                    is_first = canary_baseline is None
                    due = processed % args.canary_every == 0
                    if is_first or due:
                        canary_image, _, _ = common.decode_image(canary_ref.abs_path)
                        digest = canary_digest(common.segment_concepts(runtime, canary_image))
                        if canary_baseline is None:
                            canary_baseline = digest
                        sink.write({"record_type": "canary", "run_id": run_id,
                                    "image_path": canary_ref.rel_path,
                                    "after_images": processed, "digest": digest,
                                    "baseline": canary_baseline,
                                    "match": digest == canary_baseline,
                                    "checked_at": common.utc_now()})
                        if digest != canary_baseline:
                            print(f"[sam] CANARY MISMATCH after {processed} images: "
                                  f"{digest} != {canary_baseline}. Halting (§5.3).",
                                  file=sys.stderr, flush=True)
                            # Exit 2 is the deliberate halt supervise.sh refuses to
                            # restart into. A mid-flight behaviour change is not a
                            # usable artifact and must be looked at by a human.
                            raise SystemExit(2)

            except SystemExit:
                raise
            except Exception as exc:  # noqa: BLE001 — every failure must become a row
                traceback.print_exc()
                sink.write({"record_type": config.RECORD_TYPE_IMAGE, "status": "failed",
                            "image_path": ref.rel_path, "image_id": ref.image_id,
                            "collection": ref.collection, "artwork_id": ref.artwork_id,
                            "image_sha256": image_sha256, "row_key": key,
                            "attempt": attempt,
                            "error_class": type(exc).__name__,
                            "error_message": str(exc)[:2000], **meta})
                # Not marked done: a transient failure gets its remaining attempts on the
                # next restart. The attempt cap above is what stops the spin.
                failed += 1
    finally:
        sink.close()
        ledger.close()

    elapsed = time.time() - started_run
    per_image = elapsed / processed if processed else float("nan")
    print(f"[sam] done processed={processed} failed={failed} "
          f"elapsed={elapsed:.1f}s per_image={per_image:.2f}s", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
