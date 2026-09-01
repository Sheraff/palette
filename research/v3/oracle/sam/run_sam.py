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


def aggregates(instances: list[common.Instance], height: int, width: int,
               suffix: str = "") -> dict:
    """Union mask, masked fraction, residual fraction and per-group unions over `instances`.

    Called twice per image: once over every instance the run kept (SCORE_THRESHOLD = 0.3) and once
    over the instances that pass the calibrated cut. `suffix` names the second set.
    """
    pixel_area = float(height * width)
    union = common.union_mask(instances, height, width)
    masked_fraction = float(union.sum()) / pixel_area

    out = {
        f"masked_area_fraction{suffix}": round(masked_fraction, 9),
        # §8.3: everything not covered by an instance mask is field. This is the number the
        # colorimetry stage runs on.
        f"residual_field_fraction{suffix}": round(1.0 - masked_fraction, 9),
        f"union_mask_rle{suffix}": common.rle_encode(union),
        f"union_mask_rle_format{suffix}": config.MASK_RLE_FORMAT,
    }
    for group, concepts in config.CONCEPT_GROUPS.items():
        sub = [i for i in instances if i.concept in concepts]
        group_union = common.union_mask(sub, height, width)
        out[f"{group}_union_area_fraction{suffix}"] = round(
            float(group_union.sum()) / pixel_area, 9)
    return out


def summary_row(ref: common.ImageRef, result: common.ImageResult, meta: dict,
                image_sha256: str, source_long_edge: int, processed_long_edge: int,
                key: str, attempt: int) -> dict:
    height, width = result.height, result.width

    # Two sets of aggregates, deliberately.
    #
    # The unsuffixed set is computed over EVERY instance the run kept, at the low run-time
    # SCORE_THRESHOLD (0.3). It is what the schema has always carried and what every stored run to
    # date holds — but config.py tells consumers to filter at the calibrated cut, and a consumer
    # that obeys gets regions at the calibrated cut and a residual at 0.3. The summary columns are
    # not filterable; they can only be recomputed from the per-instance RLEs, and nothing said so.
    # Phase-0 adversarial review, finding 4: on sam-eval-142-v2 the stored residual differs from
    # the calibrated one by a mean of 0.0416 and a max of 0.6668, on 70 of 142 images by more than
    # 0.01 — and round 2 rendered its residual panels from the 0.3 union while selecting its mask
    # items at the calibrated cut, so the reviewer judged a 0.3 residual.
    #
    # The `_calibrated` set closes that for every future run. For runs already on disk,
    # derive_calibrated_aggregates.py recomputes the same fields from the stored RLEs into a
    # separate file — the stored JSONLs are immutable evidence and are never rewritten.
    # SCHEMA_VERSION is deliberately NOT bumped for this. It is part of row_key, so a bump re-runs
    # every image on the GPU — and the addition is purely additive: no per-region row changes, no
    # existing summary value changes, and a re-run would reproduce every old column byte for byte.
    # Paying a full GPU run to add columns that can be derived on CPU from the stored RLEs is the
    # wrong trade, and the derivation script exists precisely so it is not needed. A stored run
    # without these columns is not wrong, it is older; `calibrated_cut` below is how a reader tells.
    calibrated = [
        inst for inst in result.instances
        if config.passes_calibrated_cut(inst.score, inst.area_fraction, inst.concept)
    ]

    counts = {c: 0 for c, _ in config.CONCEPT_PROMPTS}
    for inst in result.instances:
        counts[inst.concept] += 1
    counts_calibrated = {c: 0 for c, _ in config.CONCEPT_PROMPTS}
    for inst in calibrated:
        counts_calibrated[inst.concept] += 1

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
        # Which cut the `_calibrated` columns below were computed at, so a reader never has to
        # guess and a later change to the constants is visible in the data.
        "calibrated_cut": {
            "score_threshold": config.CALIBRATED_SCORE_THRESHOLD,
            "group_thresholds": dict(config.CALIBRATED_GROUP_THRESHOLDS),
            "max_area_fraction": config.CALIBRATED_MAX_AREA_FRACTION,
            # Groups the area guard is scoped OFF for (mask round 3, loose end A6, 2026-08-04).
            # Without this key a reader cannot tell a file written before the exemption from one
            # written after: both carry max_area_fraction 0.5, but a big person mask survives in
            # only one of them. An absent key means "written before 2026-08-04, guard uniform".
            "guard_exempt_groups": sorted(config.GUARD_EXEMPT_GROUPS),
        },
        "instances_total_calibrated": len(calibrated),
        "instances_by_concept_calibrated": counts_calibrated,
        "seconds_total": round(result.seconds_total, 3),
        "seconds_by_concept": {k: round(v, 3) for k, v in result.seconds_by_concept.items()},
        "decoded_at": common.utc_now(),
    }
    row.update(aggregates(result.instances, height, width))
    row.update(aggregates(calibrated, height, width, suffix="_calibrated"))
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
    # Paths that already have a terminal row, from this process or an earlier one, so a duplicate
    # row is written for the SECOND path of a content-duplicate pair and never for the first.
    seen_paths: set[str] = common.completed_paths(out_path)
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
                    seen_paths.add(ref.rel_path)
                    failed += 1
                continue

            image_sha256 = common.sha256_file(ref.abs_path)
            key = common.row_key(image_sha256)
            if key in done:
                # The resume key is the CONTENT hash, so two different paths holding identical
                # bytes collide here and the second is skipped. That is right — the answer would
                # be identical and the GPU time is real — but until 2026-08-03 the second path
                # left NO row at all, not even a record that it had been seen (phase-0 adversarial
                # review, finding 15). Immaterial on the 142-image eval set; on a --collection run
                # over 7,550 sharded files a caller joining paths to rows would find paths with no
                # row and no way to tell "deduplicated" from "never queued" or "lost".
                #
                # A terminal status row, keyed by path so it is written exactly once and a restart
                # skips it, and carrying the content hash the real rows are under.
                dedup_key = f"duplicate|{ref.rel_path}"
                if ref.rel_path not in seen_paths:
                    sink.write({"record_type": config.RECORD_TYPE_IMAGE, "status": "duplicate",
                                "image_path": ref.rel_path, "image_id": ref.image_id,
                                "collection": ref.collection, "artwork_id": ref.artwork_id,
                                "image_sha256": image_sha256, "row_key": dedup_key,
                                "duplicate_of_row_key": key, "attempt": 0,
                                "note": "identical bytes to an image already processed in this "
                                        "run or an earlier one; its regions are stored under "
                                        "duplicate_of_row_key",
                                **meta})
                    done.add(dedup_key)
                    seen_paths.add(ref.rel_path)
                continue
            seen_paths.add(ref.rel_path)

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
