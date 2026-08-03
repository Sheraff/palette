"""SAM geometry stage with PER-COVER DYNAMIC concepts — the residual-isolation experiment.

Same instrument as `run_sam.py`, one difference: the prompt list handed to the model is the
static concept set v2.1 PLUS the concepts derived for that specific cover from the VLM's own
answers (`dynamic_concepts.py`). The question this serves is R-3: does subtracting every mask
leave a residual that is cleanly the background?

    .venv/bin/python run_sam_dynamic.py --eval-set \
        --table dynamic-concepts-eval-142.json --out sam-eval-142-v3-dynamic

WHY THIS IS A SEPARATE SCRIPT AND NOT A FLAG ON run_sam.py. `run_sam.py` produced every stored
run on disk and its behaviour is what three review rounds were judged against. A per-cover prompt
list changes row identity, the per-concept count dict and the group unions — three things that
script asserts are fixed. Forking it costs some duplication and risks nothing; editing it would
put a ratified instrument and an experiment in the same file.

ROW IDENTITY. PROBE5_NOTES.md is explicit: a per-cover prompt makes the effective question set
per-cover, so the identity needs its own field rather than a `concept_set_hash` whose meaning
silently changes per image. So `row_key` here is the static key plus the cover's
`dynamic_set_hash`, and `concept_set_hash` keeps meaning exactly what it means everywhere else —
the identity of the STATIC union. Every row carries the full provenance block.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import traceback
import uuid
from pathlib import Path

import common
import config
import dynamic_concepts

# [REVIEWED] Kept distinct from config.SCHEMA_VERSION. The row shape here is the stage's shape
# plus the dynamic block, and a consumer must be able to tell the two apart without inspecting
# keys. Not a bump of the stage's own version: no stored run's schema changes.
SCHEMA_VERSION = "sam-regions-dynamic.v1"


def dynamic_row_key(image_sha256: str, dyn_hash: str) -> str:
    """Resume identity. The static key, plus which dynamic prompts this cover was asked."""
    return "|".join([common.row_key(image_sha256), f"dyn:{dyn_hash[:16]}"])


def instance_row(ref: common.ImageRef, inst: common.Instance, meta: dict,
                 image_sha256: str, height: int, width: int, dyn: dict) -> dict:
    x, y, w, h = inst.bbox
    return {
        "record_type": config.RECORD_TYPE_REGION,
        "collection": ref.collection,
        "image_id": ref.image_id,
        "artwork_id": ref.artwork_id,
        "image_path": ref.rel_path,
        "image_sha256": image_sha256,
        "run_id": meta["run_id"],
        "schema_version": SCHEMA_VERSION,
        "concept": inst.concept,
        # True for the concepts this cover alone was asked, so every downstream split between
        # "what the static set found" and "what the VLM's noun added" is a field lookup and never
        # a string-prefix guess.
        "concept_is_dynamic": inst.concept in dyn["dynamic_concepts"],
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
               dynamic_tags: tuple[str, ...], suffix: str = "") -> dict:
    """Union, masked fraction, residual and per-group unions — plus the dynamic-only unions.

    `static_*` and `dynamic_*` are reported beside the total so the experiment's central
    comparison — how much foreground the VLM's nouns newly captured — is readable off one row
    without re-deriving anything from the RLEs.
    """
    pixel_area = float(height * width)
    union = common.union_mask(instances, height, width)
    masked_fraction = float(union.sum()) / pixel_area

    static_insts = [i for i in instances if i.concept not in dynamic_tags]
    dyn_insts = [i for i in instances if i.concept in dynamic_tags]
    static_union = common.union_mask(static_insts, height, width)
    dyn_union = common.union_mask(dyn_insts, height, width)

    out = {
        f"masked_area_fraction{suffix}": round(masked_fraction, 9),
        f"residual_field_fraction{suffix}": round(1.0 - masked_fraction, 9),
        f"union_mask_rle{suffix}": common.rle_encode(union),
        f"union_mask_rle_format{suffix}": config.MASK_RLE_FORMAT,
        # The static set's own residual, computed on the SAME run so the static-vs-dynamic
        # comparison is never confounded by a different model load or a different image decode.
        f"static_masked_area_fraction{suffix}": round(
            float(static_union.sum()) / pixel_area, 9),
        f"static_residual_field_fraction{suffix}": round(
            1.0 - float(static_union.sum()) / pixel_area, 9),
        f"dynamic_union_area_fraction{suffix}": round(
            float(dyn_union.sum()) / pixel_area, 9),
        # Pixels the dynamic concepts found that no static concept covered — the experiment's
        # headline quantity, per cover.
        f"dynamic_newly_masked_fraction{suffix}": round(
            float(((dyn_union != 0) & (static_union == 0)).sum()) / pixel_area, 9),
    }
    for group, concepts in config.CONCEPT_GROUPS.items():
        sub = [i for i in instances if i.concept in concepts]
        group_union = common.union_mask(sub, height, width)
        out[f"{group}_union_area_fraction{suffix}"] = round(
            float(group_union.sum()) / pixel_area, 9)
    return out


def summary_row(ref: common.ImageRef, result: common.ImageResult, meta: dict,
                image_sha256: str, source_long_edge: int, processed_long_edge: int,
                key: str, attempt: int, dyn: dict) -> dict:
    height, width = result.height, result.width
    dynamic_tags = tuple(dyn["dynamic_concepts"])

    # The guard-ON calibrated set, matching run_sam.py exactly. The guard-OFF variant is NOT
    # written here: it is derivable on CPU from the per-region rows, and the area guard's person
    # exemption is an open question (loose end A6). Writing only the derivable one keeps the file
    # from asserting an answer the reviewer has not given.
    calibrated = [
        inst for inst in result.instances
        if config.passes_calibrated_cut(inst.score, inst.area_fraction, inst.concept)
    ]

    all_tags = [c for c, _ in config.CONCEPT_PROMPTS] + list(dynamic_tags)
    counts = {c: 0 for c in all_tags}
    for inst in result.instances:
        counts[inst.concept] = counts.get(inst.concept, 0) + 1
    counts_calibrated = {c: 0 for c in all_tags}
    for inst in calibrated:
        counts_calibrated[inst.concept] = counts_calibrated.get(inst.concept, 0) + 1

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
        "schema_version": SCHEMA_VERSION,
        "source_long_edge_px": source_long_edge,
        "processed_long_edge_px": processed_long_edge,
        "width": width,
        "height": height,
        "instances_total": len(result.instances),
        "instances_by_concept": counts,
        "concepts_with_zero_instances": sorted(c for c, n in counts.items() if n == 0),
        "calibrated_cut": {
            "score_threshold": config.CALIBRATED_SCORE_THRESHOLD,
            "group_thresholds": dict(config.CALIBRATED_GROUP_THRESHOLDS),
            "max_area_fraction": config.CALIBRATED_MAX_AREA_FRACTION,
            # Stated, because it is the one thing a reader would otherwise assume wrongly: a
            # dynamic concept is in no CONCEPT_GROUPS group, so config.group_of() returns None
            # and it is cut at the POOLED threshold. No mask-quality round has ever seen one of
            # these prompts, so it gets the default, never text_like's raised cut.
            "dynamic_concepts_use_pooled_threshold": True,
        },
        "instances_total_calibrated": len(calibrated),
        "instances_by_concept_calibrated": counts_calibrated,
        "seconds_total": round(result.seconds_total, 3),
        "seconds_by_concept": {k: round(v, 3) for k, v in result.seconds_by_concept.items()},
        "decoded_at": common.utc_now(),
    }
    row.update(aggregates(result.instances, height, width, dynamic_tags))
    row.update(aggregates(calibrated, height, width, dynamic_tags, suffix="_calibrated"))
    row.update(meta)
    row.update(dynamic_provenance(dyn))
    return row


def dynamic_provenance(dyn: dict) -> dict:
    """The per-cover block every row carries, per CONVENTIONS' provenance rule."""
    return {
        "dynamic_concepts": list(dyn["dynamic_concepts"]),
        "dynamic_prompts": [list(p) for p in dyn["dynamic_prompts"]],
        "dynamic_set_hash": dyn["dynamic_set_hash"],
        "dynamic_subject_kind": dyn["subject_kind_agreed"],
        "dynamic_overlays": dyn["overlays_agreed"],
        "dynamic_derivation": dyn["derivation"],
    }


def canary_digest(result: common.ImageResult) -> str:
    payload = [
        [i.concept, i.instance_idx, round(i.score, 5), round(i.area_fraction, 7),
         [round(v, 5) for v in i.bbox]]
        for i in sorted(result.instances, key=lambda x: (x.concept, x.instance_idx))
    ]
    return common.sha256_bytes(json.dumps(payload, separators=(",", ":")).encode())


def build_queue(args) -> list[common.ImageRef]:
    if args.list:
        return common.read_list_file(Path(args.list))[:args.limit or None]
    if args.eval_set:
        return common.eval_set_refs()[:args.limit or None]
    raise SystemExit("one of --list / --eval-set is required")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_argument_group("work list")
    src.add_argument("--list", help="file of repo-relative image paths, one per line")
    src.add_argument("--eval-set", action="store_true",
                     help="the 142 included premise eval-set images")
    ap.add_argument("--table", default="dynamic-concepts-eval-142.json",
                    help="the derivation table under research/v3/data/sam/")
    ap.add_argument("--out", required=True, help="output stem under research/v3/data/sam/")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--canary", default=None)
    ap.add_argument("--canary-every", type=int, default=config.CANARY_EVERY)
    ap.add_argument("--no-verify-weights", action="store_true")
    ap.add_argument("--progress-every", type=int, default=1)
    ap.add_argument("--estimate-only", action="store_true",
                    help="print the prompt-count budget and exit without loading the model")
    args = ap.parse_args()

    table_path = config.DATA_DIR / args.table
    if not table_path.exists():
        raise SystemExit(f"missing derivation table: {table_path}. Run dynamic_concepts.py first.")
    table_doc = json.loads(table_path.read_text())
    table = {c["image_path"]: c for c in table_doc["covers"]}

    refs = build_queue(args)
    missing = [r.rel_path for r in refs if r.rel_path not in table]
    if missing:
        raise SystemExit(f"{len(missing)} queued images have no row in {args.table}; "
                         f"first: {missing[0]}")

    static_n = len(config.CONCEPT_PROMPTS)
    extra = sum(len(table[r.rel_path]["dynamic_concepts"]) for r in refs)
    print(f"[sam-dyn] queue={len(refs)} static_prompts={static_n} "
          f"extra_dynamic_prompts={extra} "
          f"covers_with_dynamic={sum(1 for r in refs if table[r.rel_path]['dynamic_concepts'])}",
          flush=True)
    if args.estimate_only:
        # [MEASURED] sam-eval-142-v2: 604.1 s over 142 images, 4.25 s/image at 10 prompts.
        # PROBE5: per-image cost is ~2.8 s + 0.037 s per prompt, so extra prompts are cheap and
        # the fixed per-image term dominates.
        est = len(refs) * 4.25 + extra * 0.037
        print(f"[sam-dyn] estimate {est:.0f}s ({est / 60:.1f} min) "
              f"= {len(refs)}x4.25s + {extra}x0.037s", flush=True)
        return 0

    out_path = config.DATA_DIR / f"{args.out}.jsonl"
    attempts_path = config.DATA_DIR / f"{args.out}.attempts.jsonl"
    done = common.completed_keys(out_path)
    ledger = common.AttemptLedger(attempts_path)
    sink = common.JsonlSink(out_path)

    run_id = uuid.uuid4().hex
    meta = common.provenance(run_id)
    meta = {**meta,
            "schema_version": SCHEMA_VERSION,
            "dynamic_rules_version": table_doc["meta"]["rules_version"],
            "dynamic_source_run": table_doc["meta"]["source_run"],
            "dynamic_source_run_sha256": table_doc["meta"]["source_run_sha256"],
            "dynamic_table": args.table,
            "dynamic_agreement_variants": table_doc["meta"]["agreement_variants"]}

    print(f"[sam-dyn] out={out_path} already_done={len(done)}", flush=True)

    runtime = None
    canary_ref = (common.ImageRef.from_rel(args.canary) if args.canary
                  else (refs[0] if refs else None))
    canary_baseline: str | None = None
    seen_paths: set[str] = common.completed_paths(out_path)
    processed = 0
    failed = 0
    started_run = time.time()

    try:
        for ref in refs:
            dyn = table[ref.rel_path]
            prompts = tuple(config.CONCEPT_PROMPTS) + tuple(
                (t, p) for t, p in (tuple(x) for x in dyn["dynamic_prompts"]))

            if not ref.abs_path.exists():
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
            key = dynamic_row_key(image_sha256, dyn["dynamic_set_hash"])
            if key in done:
                dedup_key = f"duplicate|{ref.rel_path}"
                if ref.rel_path not in seen_paths:
                    sink.write({"record_type": config.RECORD_TYPE_IMAGE, "status": "duplicate",
                                "image_path": ref.rel_path, "image_id": ref.image_id,
                                "collection": ref.collection, "artwork_id": ref.artwork_id,
                                "image_sha256": image_sha256, "row_key": dedup_key,
                                "duplicate_of_row_key": key, "attempt": 0,
                                "note": "identical bytes AND identical dynamic prompt list to an "
                                        "image already processed; regions are stored under "
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
                            "error_message": f"{config.MAX_ATTEMPTS} attempts", **meta})
                done.add(key)
                failed += 1
                continue

            try:
                image, source_long_edge, processed_long_edge = common.decode_image(ref.abs_path)
                if runtime is None:
                    runtime = common.load_sam(verify_weights=not args.no_verify_weights)
                    base = common.provenance(run_id, runtime)
                    meta = {**meta, **{k: v for k, v in base.items()
                                       if k in ("runtime_version", "mlx_version")}}
                    print(f"[sam-dyn] model loaded in {runtime.load_seconds:.1f}s "
                          f"from {runtime.snapshot_path}", flush=True)
                result = common.segment_concepts(runtime, image, prompts=prompts)
                row = summary_row(ref, result, meta, image_sha256,
                                  source_long_edge, processed_long_edge, key, attempt, dyn)
                for inst in result.instances:
                    sink.write(instance_row(ref, inst, meta, image_sha256,
                                            result.height, result.width, dyn))
                sink.write(row)
                done.add(key)
                processed += 1

                if args.progress_every and processed % args.progress_every == 0:
                    print(f"[sam-dyn] {processed}/{len(refs)} {ref.rel_path} "
                          f"{result.width}x{result.height} "
                          f"dyn={','.join(dyn['dynamic_concepts']) or '-'} "
                          f"n={len(result.instances)} "
                          f"masked={row['masked_area_fraction']:.3f} "
                          f"new={row['dynamic_newly_masked_fraction']:.3f} "
                          f"{result.seconds_total:.2f}s", flush=True)

                if canary_ref is not None and args.canary_every:
                    is_first = canary_baseline is None
                    due = processed % args.canary_every == 0
                    if is_first or due:
                        canary_dyn = table[canary_ref.rel_path]
                        canary_prompts = tuple(config.CONCEPT_PROMPTS) + tuple(
                            (t, p) for t, p in (tuple(x) for x in canary_dyn["dynamic_prompts"]))
                        canary_image, _, _ = common.decode_image(canary_ref.abs_path)
                        digest = canary_digest(common.segment_concepts(
                            runtime, canary_image, prompts=canary_prompts))
                        if canary_baseline is None:
                            canary_baseline = digest
                        sink.write({"record_type": "canary", "run_id": run_id,
                                    "image_path": canary_ref.rel_path,
                                    "after_images": processed, "digest": digest,
                                    "baseline": canary_baseline,
                                    "match": digest == canary_baseline,
                                    "checked_at": common.utc_now()})
                        if digest != canary_baseline:
                            print(f"[sam-dyn] CANARY MISMATCH after {processed} images: "
                                  f"{digest} != {canary_baseline}. Halting (§5.3).",
                                  file=sys.stderr, flush=True)
                            raise SystemExit(2)

            except SystemExit:
                raise
            except Exception as exc:  # noqa: BLE001
                traceback.print_exc()
                sink.write({"record_type": config.RECORD_TYPE_IMAGE, "status": "failed",
                            "image_path": ref.rel_path, "image_id": ref.image_id,
                            "collection": ref.collection, "artwork_id": ref.artwork_id,
                            "image_sha256": image_sha256, "row_key": key,
                            "attempt": attempt,
                            "error_class": type(exc).__name__,
                            "error_message": str(exc)[:2000], **meta})
                failed += 1
    finally:
        sink.close()
        ledger.close()

    elapsed = time.time() - started_run
    per_image = elapsed / processed if processed else float("nan")
    print(f"[sam-dyn] done processed={processed} failed={failed} "
          f"elapsed={elapsed:.1f}s per_image={per_image:.2f}s", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
