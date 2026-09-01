"""Recompute a stored run's per-image aggregates at the CALIBRATED cut, from the stored RLEs.

    .venv/bin/python derive_calibrated_aggregates.py --run sam-eval-142-v2
    .venv/bin/python derive_calibrated_aggregates.py --run sam-eval-142-v2 --no-area-guard
    .venv/bin/python derive_calibrated_aggregates.py --run sam-eval-142-v2 --uniform-guard

CPU ONLY. No model, no GPU, no network: every number here comes out of the run's own JSONL.

WHY THIS EXISTS. `run_sam.py` computes `masked_area_fraction`, `residual_field_fraction`,
`union_mask_rle` and every `<group>_union_area_fraction` over ALL instances at the low run-time
`SCORE_THRESHOLD` (0.3), while `config.py` tells consumers to filter at the calibrated cut. A
consumer that obeys gets regions at the calibrated cut and a residual at 0.3. The summary columns
are not filterable — they can only be recomputed from the per-instance RLEs — and until 2026-08-03
nothing said so (phase-0 adversarial review, finding 4). `run_sam.py` now writes both sets for
future runs; this script produces the same fields for runs already on disk.

THE STORED JSONL IS NEVER TOUCHED. It is immutable evidence. Output goes to a NEW file,
`<run>.calibrated-aggregates.jsonl`, one row per image, keyed by `row_key` and `image_sha256` so it
joins 1:1 back to the run. Both the stored value and the recomputed value are carried in every row,
so the delta is readable without a second join.

THE GUARD IS NO LONGER UNIFORM (2026-08-04). `config.GUARD_EXEMPT_GROUPS` scopes the area guard
OFF for `person_like` (mask round 3, loose end A6), and this script honours it by default, so a
big correct person mask now counts toward the calibrated union and the residual on those covers is
SMALLER than a derivation made before that date. Every row states the rule it was derived under in
`calibrated_cut.guard_exempt_groups`; an absent key means the file predates the exemption.
`--uniform-guard` reproduces the old rule exactly. Nothing under `--no-area-guard` moves.

VERIFICATION. The script first recomputes the UNSUFFIXED aggregates the same way and checks them
against what the run stored. If those do not reproduce exactly, the arithmetic here is wrong and
the calibrated numbers are worthless, so the run is refused rather than half-trusted.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict

import numpy as np

import common
import config

# [MEASURED] Stored fractions are rounded to 9 decimals by run_sam.py, so an exact float compare
# would fail on the rounding alone. Anything larger than this is a real disagreement.
ROUNDING_TOLERANCE = 5e-10


def union_fraction(rows: list[dict], height: int, width: int) -> tuple[float, np.ndarray]:
    """Union of a set of region rows' masks, and the fraction of the image it covers."""
    union = np.zeros((height, width), dtype=np.uint8)
    for row in rows:
        union |= common.rle_decode(row["mask_rle"], row["mask_height"], row["mask_width"])
    return float(union.sum()) / float(height * width), union


def aggregates_for(rows: list[dict], height: int, width: int) -> dict:
    masked, union = union_fraction(rows, height, width)
    out = {
        "masked_area_fraction": round(masked, 9),
        "residual_field_fraction": round(1.0 - masked, 9),
        "union_mask_rle": common.rle_encode(union),
        "union_mask_rle_format": config.MASK_RLE_FORMAT,
    }
    for group, concepts in config.CONCEPT_GROUPS.items():
        sub = [r for r in rows if r["concept"] in concepts]
        fraction, _ = union_fraction(sub, height, width)
        out[f"{group}_union_area_fraction"] = round(fraction, 9)
    return out


def check_stored(image_row: dict, recomputed: dict) -> list[str]:
    """The stored (0.3-cut) aggregates, recomputed the same way. Any mismatch is disqualifying."""
    problems = []
    for field in ("masked_area_fraction", "residual_field_fraction"):
        stored = image_row.get(field)
        if stored is None:
            continue
        if abs(stored - recomputed[field]) > ROUNDING_TOLERANCE:
            problems.append(f"{field}: stored {stored} != recomputed {recomputed[field]}")
    for group in config.CONCEPT_GROUPS:
        field = f"{group}_union_area_fraction"
        stored = image_row.get(field)
        if stored is not None and abs(stored - recomputed[field]) > ROUNDING_TOLERANCE:
            problems.append(f"{field}: stored {stored} != recomputed {recomputed[field]}")
    if image_row.get("union_mask_rle") is not None and image_row["union_mask_rle"] != recomputed["union_mask_rle"]:
        problems.append("union_mask_rle: stored union differs from the recomputed union")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", required=True, help="output stem under research/v3/data/sam/")
    ap.add_argument("--out", default=None,
                    help="output stem (default: <run>.calibrated-aggregates)")
    ap.add_argument("--no-area-guard", action="store_true",
                    help="score cut only — reproduces a pre-guard artifact")
    ap.add_argument("--pooled-threshold-only", action="store_true",
                    help="ignore CALIBRATED_GROUP_THRESHOLDS and cut every concept at the pooled value")
    ap.add_argument("--uniform-guard", action="store_true",
                    help="apply the area guard to every group, ignoring config.GUARD_EXEMPT_GROUPS "
                         "— reproduces a guard-on artifact derived before 2026-08-04")
    args = ap.parse_args()

    run_path = config.DATA_DIR / f"{args.run}.jsonl"
    if not run_path.exists():
        raise SystemExit(f"{run_path} does not exist")
    out_path = config.DATA_DIR / f"{args.out or (args.run + '.calibrated-aggregates')}.jsonl"

    max_area = None if args.no_area_guard else config.CALIBRATED_MAX_AREA_FRACTION

    # Groups the guard does not apply to, as this invocation will actually behave. Empty when the
    # guard is off outright (--no-area-guard), when the exemption is suppressed (--uniform-guard),
    # or when concepts are pooled away (--pooled-threshold-only passes concept=None, so no group is
    # known and the exemption cannot fire). Recorded per row so a derived file states its own rule.
    exempt_groups = (
        [] if (args.no_area_guard or args.uniform_guard or args.pooled_threshold_only)
        else sorted(config.GUARD_EXEMPT_GROUPS)
    )

    def keeps(row: dict) -> bool:
        concept = None if args.pooled_threshold_only else row["concept"]
        return config.passes_calibrated_cut(row["score"], row["area_fraction"], concept,
                                            max_area_fraction=max_area,
                                            apply_group_exemptions=not args.uniform_guard)

    rows = common.read_jsonl(run_path)
    regions: dict[str, list[dict]] = defaultdict(list)
    images: list[dict] = []
    hashes: set[str] = set()
    for row in rows:
        if row.get("record_type") == config.RECORD_TYPE_REGION:
            regions[row["image_sha256"]].append(row)
        elif row.get("record_type") == config.RECORD_TYPE_IMAGE and row.get("status") == "ok":
            images.append(row)
            if row.get("concept_set_hash"):
                hashes.add(row["concept_set_hash"])

    if len(hashes) > 1:
        raise SystemExit(f"{args.run} mixes concept sets: {sorted(hashes)}. Refusing.")
    run_hash = next(iter(hashes), None)
    if run_hash is not None and run_hash != common.concept_set_hash():
        # Not fatal: the cut is a query over stored scores and does not need the current prompt
        # set. But a group threshold is defined over CONCEPT_GROUPS, so say it out loud.
        print(f"[note] run concept set {run_hash[:12]} is not the current {common.concept_set_hash()[:12]}; "
              "group thresholds are applied using the CURRENT CONCEPT_GROUPS", flush=True)

    sink = common.JsonlSink(out_path)
    failures = 0
    deltas: list[float] = []
    try:
        for image in sorted(images, key=lambda r: r["image_path"]):
            height, width = image["height"], image["width"]
            all_rows = regions.get(image["image_sha256"], [])
            recomputed_stored = aggregates_for(all_rows, height, width)
            problems = check_stored(image, recomputed_stored)
            if problems:
                failures += 1
                print(f"[FAIL] {image['image_path']}: {'; '.join(problems)}", file=sys.stderr, flush=True)
                continue

            kept = [r for r in all_rows if keeps(r)]
            calibrated = aggregates_for(kept, height, width)
            delta = image["residual_field_fraction"] - calibrated["residual_field_fraction"]
            deltas.append(abs(delta))

            out = {
                "record_type": "image_calibrated_aggregates",
                "derived_by": "research/v3/oracle/sam/derive_calibrated_aggregates.py",
                "derived_at": common.utc_now(),
                "source_run": args.run,
                "collection": image["collection"],
                "image_id": image["image_id"],
                "artwork_id": image["artwork_id"],
                "image_path": image["image_path"],
                "image_sha256": image["image_sha256"],
                "row_key": image["row_key"],
                "run_id": image["run_id"],
                "schema_version": image["schema_version"],
                "concept_set_hash": image.get("concept_set_hash"),
                "height": height,
                "width": width,
                "calibrated_cut": {
                    "score_threshold": config.CALIBRATED_SCORE_THRESHOLD,
                    "group_thresholds": {} if args.pooled_threshold_only else dict(config.CALIBRATED_GROUP_THRESHOLDS),
                    "max_area_fraction": max_area,
                    # Absent key = derived before 2026-08-04, when the guard was uniform.
                    "guard_exempt_groups": exempt_groups,
                },
                "score_threshold_at_run": image.get("score_threshold"),
                "instances_total_at_run": len(all_rows),
                "instances_total_calibrated": len(kept),
                "instances_by_concept_calibrated": {
                    concept: sum(1 for r in kept if r["concept"] == concept)
                    for concept, _ in config.CONCEPT_PROMPTS
                },
                # Both sides in every row, so the delta needs no second join.
                "stored_masked_area_fraction": image["masked_area_fraction"],
                "stored_residual_field_fraction": image["residual_field_fraction"],
                "residual_field_fraction_delta": round(delta, 9),
            }
            out.update({f"{k}_calibrated": v for k, v in calibrated.items()})
            for group in config.CONCEPT_GROUPS:
                field = f"{group}_union_area_fraction"
                out[f"stored_{field}"] = image.get(field)
            sink.write(out)
    finally:
        sink.close()

    if failures:
        print(f"[derive] {failures} image(s) failed the stored-aggregate check — output is NOT trustworthy",
              file=sys.stderr, flush=True)
        return 1
    over_01 = sum(1 for d in deltas if d > 0.01)
    over_10 = sum(1 for d in deltas if d > 0.10)
    print(f"[derive] {len(deltas)} images -> {out_path}")
    print(f"[derive] stored-vs-calibrated residual: mean {np.mean(deltas):.4f} "
          f"median {np.median(deltas):.4f} max {np.max(deltas):.4f}; "
          f"{over_01} images differ by more than 0.01, {over_10} by more than 0.10")
    return 0


if __name__ == "__main__":
    sys.exit(main())
