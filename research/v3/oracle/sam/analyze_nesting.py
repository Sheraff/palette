"""How often does a mark-shaped mask sit INSIDE a person? Model-free, no GPU.

    .venv/bin/python analyze_nesting.py --run sam-eval-142-v2 --write

Why this number exists. Reviewer note 1 (MASK_REVIEW_NOTES.md) says a `logo` or a `sticker` may be
"part of the artwork itself, or some sort of added branding", and the reviewer's canonical example
on 2026-08-03 was a blazon on a character's shield: masked as a sticker, and entirely part of the
artwork. A mask cannot tell those apart — that is the whole reason concept set v2 renamed `logo` to
`emblem`. But a mark drawn on a person IS artwork content, and nesting is checkable geometry rather
than an opinion: if the mark's pixels are inside the person's pixels, the mark was painted on the
subject.

This measures whether that signal is worth anything on this corpus, instead of asserting it. Two
containment tests, coarse then exact:

  * **bbox containment** — the fraction of the mark's bounding box that falls inside a person or
    face bounding box. Cheap, and the number the brief asked for (threshold 0.80).
  * **mask containment** — the fraction of the mark's actual MASK pixels inside the person's actual
    mask, computed only for pairs that pass a loose bbox screen. Boxes overlap for things that do
    not: a corner PA badge and a person standing across the cover share a box corner and no pixels.
    Reported beside the bbox number so the gap between them is visible.

Output: `research/v3/data/sam/nesting-in-person.json` with `--write`, and a table either way.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict

import numpy as np

import common
import config
import review_round  # for the shared stale-run guard; imports no model

# [REVIEWED] The brief's threshold: a mark is "inside" a person when at least this much of it is.
# Not 1.0 — a blazon on a shield is routinely clipped by the figure's silhouette, and a mark that
# is 85% on the person and 15% off the edge of them is still painted on them.
CONTAINMENT_THRESHOLD = 0.80

# [REVIEWED] The loose screen before the expensive mask test. A pair whose boxes overlap by less
# than this cannot reach CONTAINMENT_THRESHOLD on pixels, so decoding their RLE would be wasted.
BBOX_SCREEN = 0.5

# The two sides of the question, from config.CONCEPT_GROUPS. Named here rather than hardcoded so a
# regrouping cannot leave this script measuring a group that no longer exists.
MARK_GROUP = "mark_like"
PERSON_GROUP = "person_like"


def bbox_containment(inner: dict, outer: dict) -> float:
    """Fraction of `inner`'s bounding box area that lies inside `outer`'s. Normalized coords."""
    ix0, iy0 = inner["bbox_x"], inner["bbox_y"]
    ix1, iy1 = ix0 + inner["bbox_w"], iy0 + inner["bbox_h"]
    ox0, oy0 = outer["bbox_x"], outer["bbox_y"]
    ox1, oy1 = ox0 + outer["bbox_w"], oy0 + outer["bbox_h"]
    overlap_w = max(0.0, min(ix1, ox1) - max(ix0, ox0))
    overlap_h = max(0.0, min(iy1, oy1) - max(iy0, oy0))
    inner_area = inner["bbox_w"] * inner["bbox_h"]
    return 0.0 if inner_area <= 0 else (overlap_w * overlap_h) / inner_area


def mask_containment(inner: dict, outer: dict) -> float:
    """Fraction of `inner`'s mask PIXELS that lie inside `outer`'s mask."""
    a = common.rle_decode(inner["mask_rle"], inner["mask_height"], inner["mask_width"]).astype(bool)
    b = common.rle_decode(outer["mask_rle"], outer["mask_height"], outer["mask_width"]).astype(bool)
    total = int(a.sum())
    return 0.0 if total == 0 else float(np.logical_and(a, b).sum()) / total


def analyze(run: str, score_cut: float, max_area_fraction: float | None = None) -> dict:
    rows = common.read_jsonl(config.DATA_DIR / f"{run}.jsonl")
    # Stale-run guard. Unlike review_round.py this file had none: pointed at a run made under a
    # different concept set it would silently index config.CONCEPT_GROUPS with the current
    # membership over rows that were never asked the current questions, and compute the rate over
    # a different population without saying so (phase-0 adversarial review, finding 9). The
    # published table was computed under a 3-member `mark_like`; it has 4 members since v2.1.
    # Not strict: this is a query over stored scores, so the honest response to a stale run is to
    # disclose the denominator, not to refuse.
    concept_set = review_round.check_run_concept_set(run, rows, strict=False)
    regions = [r for r in rows if r.get("record_type") == config.RECORD_TYPE_REGION
               and r["score"] >= score_cut
               and (max_area_fraction is None or r["area_fraction"] <= max_area_fraction)]
    marks_by_concept = set(config.CONCEPT_GROUPS[MARK_GROUP])
    people_by_concept = set(config.CONCEPT_GROUPS[PERSON_GROUP])

    by_image: dict[str, list[dict]] = defaultdict(list)
    for row in regions:
        by_image[row["image_sha256"]].append(row)

    per_concept: dict[str, dict[str, int]] = defaultdict(lambda: {"marks": 0, "bbox_nested": 0, "mask_nested": 0})
    examples: list[dict] = []
    images_with_marks: set[str] = set()
    images_with_nesting: set[str] = set()

    for sha, rows_here in by_image.items():
        marks = [r for r in rows_here if r["concept"] in marks_by_concept]
        people = [r for r in rows_here if r["concept"] in people_by_concept]
        if marks:
            images_with_marks.add(sha)
        for mark in marks:
            stats = per_concept[mark["concept"]]
            stats["marks"] += 1
            best_bbox = 0.0
            best_mask = 0.0
            best_person = None
            for person in people:
                bbox_frac = bbox_containment(mark, person)
                if bbox_frac > best_bbox:
                    best_bbox = bbox_frac
                if bbox_frac < BBOX_SCREEN:
                    continue
                mask_frac = mask_containment(mark, person)
                if mask_frac > best_mask:
                    best_mask, best_person = mask_frac, person
            if best_bbox >= CONTAINMENT_THRESHOLD:
                stats["bbox_nested"] += 1
            if best_mask >= CONTAINMENT_THRESHOLD:
                stats["mask_nested"] += 1
                images_with_nesting.add(sha)
                examples.append({
                    "imagePath": mark["image_path"],
                    "markConcept": mark["concept"],
                    "markScore": mark["score"],
                    "markAreaFraction": mark["area_fraction"],
                    "insideConcept": best_person["concept"] if best_person else None,
                    "insideScore": best_person["score"] if best_person else None,
                    # How much of the cover the containing person covers. The metric's own weak
                    # spot: a person mask over most of the artwork contains everything, and
                    # "nested" then means nothing. Carried per example so the rate can be read
                    # against it rather than trusted.
                    "insideAreaFraction": best_person["area_fraction"] if best_person else None,
                    "bboxContainment": round(best_bbox, 4),
                    "maskContainment": round(best_mask, 4),
                })

    totals = {
        "marks": sum(s["marks"] for s in per_concept.values()),
        "bbox_nested": sum(s["bbox_nested"] for s in per_concept.values()),
        "mask_nested": sum(s["mask_nested"] for s in per_concept.values()),
    }
    examples.sort(key=lambda e: (-e["maskContainment"], e["imagePath"]))
    # [MEASURED] The share of the nesting hits that are only nested because the containing person
    # is most of the cover. A rate quoted without this number is not a usable rate.
    dominant = sum(1 for e in examples if (e["insideAreaFraction"] or 0) > 0.5)
    return {
        "run": run,
        "scoreCut": score_cut,
        "maxAreaFraction": max_area_fraction,
        # The denominator, disclosed: which concept set the run was made under, which groups this
        # analysis applied, and which concepts the run was never asked.
        "conceptSet": concept_set,
        "containmentThreshold": CONTAINMENT_THRESHOLD,
        "bboxScreen": BBOX_SCREEN,
        "markGroup": sorted(marks_by_concept),
        "personGroup": sorted(people_by_concept),
        "totals": totals,
        "bboxNestedRate": round(totals["bbox_nested"] / totals["marks"], 4) if totals["marks"] else None,
        "maskNestedRate": round(totals["mask_nested"] / totals["marks"], 4) if totals["marks"] else None,
        "imagesWithMarks": len(images_with_marks),
        "imagesWithNesting": len(images_with_nesting),
        "nestedInsideDominantPerson": dominant,
        "nestedInsideOrdinaryPerson": totals["mask_nested"] - dominant,
        "byConcept": {concept: dict(stats) for concept, stats in sorted(per_concept.items())},
        "examples": examples[:20],
    }


def report(result: dict) -> None:
    totals = result["totals"]
    print(f"{result['run']} @ score>={result['scoreCut']:g}, containment>={result['containmentThreshold']:g}")
    print(f"  mark_like instances: {totals['marks']}  on {result['imagesWithMarks']} images")
    print(f"  nested in a person/face by BBOX: {totals['bbox_nested']}"
          f"  ({result['bboxNestedRate']:.1%})" if totals["marks"] else "  no marks")
    print(f"  nested in a person/face by MASK: {totals['mask_nested']}"
          f"  ({result['maskNestedRate']:.1%})" if totals["marks"] else "")
    print(f"  images carrying at least one nested mark: {result['imagesWithNesting']}")
    print(f"  of the mask-nested: {result['nestedInsideDominantPerson']} sit inside a person covering "
          f">50% of the cover (nesting says little there), {result['nestedInsideOrdinaryPerson']} do not")
    print("  by concept:            marks  bbox  mask")
    for concept, stats in result["byConcept"].items():
        print(f"    {concept:20s} {stats['marks']:5d} {stats['bbox_nested']:5d} {stats['mask_nested']:5d}")
    if result["examples"]:
        print("  strongest examples:")
        for example in result["examples"][:8]:
            print(f"    {example['maskContainment']:.2f} mask / {example['bboxContainment']:.2f} bbox  "
                  f"{example['markConcept']:18s} in {example['insideConcept']:6s}  {example['imagePath']}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", default="sam-eval-142-v2")
    parser.add_argument("--score-cut", type=float, default=config.CALIBRATED_SCORE_THRESHOLD)
    # The area guard is OFF by default here, deliberately. data/sam/nesting-in-person.json and the
    # table in SAM_DESIGN_NOTES.md were computed score-only, before the guard existed, and the
    # default has to keep reproducing them. Pass the flag to see what the guard changes; an
    # addendum in SAM_DESIGN_NOTES.md records the difference.
    parser.add_argument("--max-area-fraction", type=float, default=None,
                        help=f"area guard (config.CALIBRATED_MAX_AREA_FRACTION is "
                             f"{config.CALIBRATED_MAX_AREA_FRACTION}); off by default")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    result = analyze(args.run, args.score_cut, args.max_area_fraction)
    report(result)
    if args.write:
        out = config.DATA_DIR / "nesting-in-person.json"
        out.write_text(json.dumps(result, indent="\t") + "\n")
        print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
