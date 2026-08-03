"""The CJK mask run — the GPU job round 3's manifest specified in its `gpuGap` block.

    .venv/bin/python run_cjk_probe.py --out sam-cjk-probe-7

Why this run exists, in one paragraph. `chinese characters` recalls 4 of 4 CJK covers with zero
false positives and its best score anywhere is **0.472** — below the pooled cut of 0.578 and far
below `text_like`'s group cut of 0.697295 — so every recovery it offers is discarded before any
consumer sees it. Probe 4 measured that, but probe 4 stored only `score`, `bbox` and
`area_fraction`: **no `mask_rle`**. So the masks behind the strongest precision/recall pair any SAM
probe in this project has produced cannot be drawn, and no reviewer has ever looked at one. Round 3
could not close this from stored rows and reported the exact run needed; this is that run.

What it does NOT do
-------------------
**It does not touch `config.CONCEPT_PROMPTS`.** `concept_set_hash()` is part of `row_key` and of
every stored run's identity, so adding a concept would invalidate `sam-eval-142-v2`,
`sam-eval-142-v3-dynamic` and `sam-eval-142-v4-nouns` as reproducible artifacts, on nothing more
than a hunch that the reviewer will like these masks. Whether `chinese characters` becomes a
concept is the reviewer's call and this run is the evidence for it, not the consequence of it. The
prompt set here is local to this file and is hashed into `probe_concept_set_hash`, a field of its
own, so a reader can never mistake it for the static set.

Row shape
---------
Region rows are the ordinary `sam-regions.v1` shape — same fields, same `mask_rle` in the same COCO
compressed RLE — so `review_round.render_overlay` reads them with no special case, which is the
whole point: the reviewer must see these masks in the SAME three-layer panel as every other round.
Four fields are added and are the only difference: `probe`, `probe_concept_set_hash`,
`probe_prompts` and `concept_is_probe`. The per-image summary row carries the union over this
prompt set only; it deliberately does NOT carry `residual_field_fraction` or the
`<group>_union_area_fraction` family, because those names mean "over the static concept set" and
reusing them for a 3-prompt probe would make two different numbers share one column.
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

# --------------------------------------------------------------------------------- the prompt set

# [REVIEWED] The three prompts, and why exactly these three. From round 3's `gpuGap.exactRunNeeded`.
#
#   `chinese characters` — the finding under test. Probe 4: fires on 4 of 4 CJK covers, on 0 of 12
#     non-CJK covers INCLUDING 3 that are non-Latin (Korean hangul, Thai, Malayalam), which is the
#     property that makes it safe: it means *this script*, not merely *not-Latin*. Best score 0.472.
#   `kanji` — the Japanese counterpart, and the only script word that clears the pooled cut anywhere
#     (0.60 and 0.64, on the two Japanese covers). Two of the four CJK covers are Japanese, so a
#     script endonym covering half the family would be scored unfairly without it. If a category cut
#     is ever calibrated, the union of these two is the candidate probe 4 recommended.
#   `words` — the INCUMBENT CONTROL, and it is not optional. It is what concept set v2.1 actually
#     asks today, so it is the baseline every recovery is measured against: a CJK mask is only worth
#     a new concept if `words` does not already catch it. Probe 4 found `words` blind on the Rose Liu
#     cover and partially sighted on the vertical Japanese one, so the answer differs per cover and
#     has to be measured per cover rather than assumed.
#
# The tag `words` is deliberately the SAME tag the static set uses, because it is the same prompt
# string producing the same pixels; naming it something else would break the comparison this run
# exists to make. `cjk-script` and `kanji` are new tags and belong to no static group.
CJK_PROMPTS: tuple[tuple[str, str], ...] = (
    ("cjk-script", "chinese characters"),
    ("kanji", "kanji"),
    ("words", "words"),
)

# [REVIEWED] The cover list, kept beside this file rather than inlined so the run's input is a
# reviewable artifact and the two cannot drift.
COVER_LIST = config.SAM_DIR / "cjk-probe-7.txt"

PROBE_NAME = "cjk-mask-quality"


def probe_concept_set_hash() -> str:
    """Identity of THIS run's prompt union. Deliberately a different function from
    `common.concept_set_hash()`, over a different list, written into a differently-named field."""
    payload = json.dumps(list(CJK_PROMPTS), separators=(",", ":"))
    return common.sha256_bytes(payload.encode("utf-8"))


def row_key(image_sha256: str) -> str:
    """Resume identity. The static key plus this probe's prompt-set hash.

    Without the suffix a resumed run would collide with the static runs' keys for the same image and
    skip work that was never done under these prompts — the exact failure the static key's own
    docstring warns about, arriving through a different door.
    """
    return f"{common.row_key(image_sha256)}|probe:{PROBE_NAME}:{probe_concept_set_hash()[:16]}"


def provenance(run_id: str, runtime=None) -> dict:
    """§5.2 provenance, with the probe's prompt set named separately from the static one.

    `common.provenance` records `concept_set_hash` and `concepts` from `config`, which are TRUE of
    the config this ran under and FALSE of what was actually asked. Both are kept — a reader needs
    to know which config was in force — and the probe's own set is added beside them under names
    that cannot be confused with the static fields.
    """
    meta = common.provenance(run_id, runtime)
    meta.update({
        "probe": PROBE_NAME,
        "probe_concept_set_hash": probe_concept_set_hash(),
        "probe_concepts": [tag for tag, _ in CJK_PROMPTS],
        "probe_prompts": {tag: text for tag, text in CJK_PROMPTS},
        # Stated explicitly so nobody has to infer it from the absence of a field: this run did not
        # ask the static questions at all, so its rows are not comparable with a static run's rows
        # except through the one tag they share.
        "asked_static_concept_set": False,
        "shares_tag_with_static_set": ["words"],
    })
    return meta


def instance_row(ref: common.ImageRef, inst: common.Instance, meta: dict,
                 image_sha256: str, height: int, width: int) -> dict:
    """One region row, in the ordinary `sam-regions.v1` shape so the overlay renderer reads it."""
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
        # The four probe fields. `concept_is_probe` is the one a consumer should branch on.
        "probe": PROBE_NAME,
        "probe_concept_set_hash": meta["probe_concept_set_hash"],
        "probe_prompt": dict(CJK_PROMPTS)[inst.concept],
        "concept_is_probe": True,
    }


def summary_row(ref: common.ImageRef, result: common.ImageResult, meta: dict, image_sha256: str,
                source_long_edge: int, processed_long_edge: int, key: str, attempt: int) -> dict:
    """One per-image row. Union over THIS prompt set only, under probe-specific names.

    No `residual_field_fraction` and no `<group>_union_area_fraction`: those columns mean "what the
    static concept set left standing", and a three-prompt probe cannot fill them without making the
    name lie. A consumer wanting a residual must recompute it from a static run's rows.
    """
    height, width = result.height, result.width
    pixel_area = float(height * width)
    union = common.union_mask(result.instances, height, width)

    counts = {tag: 0 for tag, _ in CJK_PROMPTS}
    best = {tag: 0.0 for tag, _ in CJK_PROMPTS}
    for inst in result.instances:
        counts[inst.concept] += 1
        best[inst.concept] = max(best[inst.concept], inst.score)

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
        "best_score_by_concept": {tag: round(value, 6) for tag, value in best.items()},
        "concepts_with_zero_instances": sorted(tag for tag, n in counts.items() if n == 0),
        "probe_union_area_fraction": round(float(union.sum()) / pixel_area, 9),
        "probe_union_mask_rle": common.rle_encode(union),
        "probe_union_mask_rle_format": config.MASK_RLE_FORMAT,
        "seconds_total": round(result.seconds_total, 3),
        "seconds_by_concept": {k: round(v, 3) for k, v in result.seconds_by_concept.items()},
        "decoded_at": common.utc_now(),
    }
    row.update(meta)
    return row


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True, help="output stem under research/v3/data/sam/")
    ap.add_argument("--list", default=str(COVER_LIST), help="cover list file")
    ap.add_argument("--no-verify-weights", action="store_true")
    args = ap.parse_args()

    out_path = config.DATA_DIR / f"{args.out}.jsonl"
    attempts_path = config.DATA_DIR / f"{args.out}.attempts.jsonl"

    refs = common.read_list_file(Path(args.list))
    done = common.completed_keys(out_path)
    ledger = common.AttemptLedger(attempts_path)
    sink = common.JsonlSink(out_path)

    run_id = uuid.uuid4().hex
    meta = provenance(run_id)

    print(f"[cjk] queue={len(refs)} already_done={len(done)} out={out_path}", flush=True)
    print(f"[cjk] prompts={[text for _, text in CJK_PROMPTS]} "
          f"score_threshold={config.SCORE_THRESHOLD} "
          f"probe_set={probe_concept_set_hash()[:16]}", flush=True)

    runtime = None
    processed = 0
    failed = 0
    started_run = time.time()

    try:
        for ref in refs:
            if not ref.abs_path.exists():
                print(f"[cjk] MISSING {ref.rel_path}", file=sys.stderr, flush=True)
                failed += 1
                continue

            image_sha256 = common.sha256_file(ref.abs_path)
            key = row_key(image_sha256)
            if key in done:
                print(f"[cjk] skip (done) {ref.rel_path}", flush=True)
                continue

            attempt = ledger.record(key, ref.rel_path)
            if attempt > config.MAX_ATTEMPTS:
                sink.write({"record_type": config.RECORD_TYPE_IMAGE, "status": "failed",
                            "image_path": ref.rel_path, "image_id": ref.image_id,
                            "collection": ref.collection, "artwork_id": ref.artwork_id,
                            "image_sha256": image_sha256, "row_key": key, "attempt": attempt,
                            "error_class": "AttemptCapExceeded",
                            "error_message": f"{config.MAX_ATTEMPTS} attempts", **meta})
                failed += 1
                continue

            try:
                image, source_long_edge, processed_long_edge = common.decode_image(ref.abs_path)
                if runtime is None:
                    runtime = common.load_sam(verify_weights=not args.no_verify_weights)
                    meta = provenance(run_id, runtime)
                    print(f"[cjk] model loaded in {runtime.load_seconds:.1f}s", flush=True)
                result = common.segment_concepts(runtime, image, prompts=CJK_PROMPTS)
                row = summary_row(ref, result, meta, image_sha256,
                                  source_long_edge, processed_long_edge, key, attempt)
                for inst in result.instances:
                    sink.write(instance_row(ref, inst, meta, image_sha256,
                                            result.height, result.width))
                sink.write(row)
                done.add(key)
                processed += 1
                best = row["best_score_by_concept"]
                print(f"[cjk] {processed}/{len(refs)} {ref.rel_path} {result.width}x{result.height} "
                      f"n={len(result.instances)} "
                      f"cjk={best['cjk-script']:.3f} kanji={best['kanji']:.3f} "
                      f"words={best['words']:.3f} {result.seconds_total:.2f}s", flush=True)
            except Exception as exc:  # noqa: BLE001 — every failure must become a row
                traceback.print_exc()
                sink.write({"record_type": config.RECORD_TYPE_IMAGE, "status": "failed",
                            "image_path": ref.rel_path, "image_id": ref.image_id,
                            "collection": ref.collection, "artwork_id": ref.artwork_id,
                            "image_sha256": image_sha256, "row_key": key, "attempt": attempt,
                            "error_class": type(exc).__name__,
                            "error_message": str(exc)[:2000], **meta})
                failed += 1
    finally:
        sink.close()
        ledger.close()

    elapsed = time.time() - started_run
    print(f"[cjk] done processed={processed} failed={failed} elapsed={elapsed:.1f}s", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
