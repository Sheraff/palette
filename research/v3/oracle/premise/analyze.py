"""Agreement analysis for the premise test: the oracle's ground_type vs the warehouse's
human-accepted gradient boolean.

    .venv/bin/python analyze.py --results <results.jsonl> [--out <report.json>]

The question this answers, and the only one worth asking first (V3_PLAN.md §5):
does the VLM's reading of ground structure track the human-accepted gradient decision at all?
"Poor agreement there = an afternoon spent, not a week."

WHAT IS COMPARED, AND WHY IT IS NOT A CLEAN MATCH
The oracle answers what the artwork IS. The warehouse holds what the algorithm PUBLISHED and
a human accepted. PHASE_0_DECISIONS.md §4 P6 is explicit that this is never an exact-match
test, because several palettes can be valid for one artwork. It sorts each (label, decision)
pair into three buckets — contradiction, agreement, can't-tell — and this script reports all
three separately rather than folding them into one accuracy number.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DATA_DIR, VOCABULARIES, read_jsonl  # noqa: E402

# [REVIEWED] The coarse binary map, per the premise-test brief. `flat_field` and
# `multiple_distinct_fields` are both "not one shaded surface", so both predict a flat
# publication; `shaded_field` predicts a gradient. This is the map under test — v2-3's
# founding gradient rule ("shadows on one surface" vs "the sky and the grass are different
# areas") in one line.
GRADIENT_MAP: dict[str, str] = {
    "shaded_field": "gradient",
    "flat_field": "flat",
    "multiple_distinct_fields": "flat",
    # Deliberately unmapped. A depicted scene, an all-over pattern, or nothing discernible
    # does not predict a gradient decision in either direction; forcing them into the binary
    # would manufacture agreement or disagreement that the label does not contain.
    "full_scene": "unmapped",
    "pattern_or_texture": "unmapped",
    "none_discernible": "unmapped",
}

# [REVIEWED] PHASE_0_DECISIONS.md §4 P6, applied cell by cell. `underdetermined` is P6's
# bucket 3 ("can't tell"): the label cannot distinguish a good merge (sky+sea as one blue
# ramp) from a bad one (sky+grass merged). Those cells are reported and counted, never
# scored — watching the bucket's SIZE is the intended instrument, not per-item flags.
P6_BUCKETS = {
    # (ground_type, published gradient) -> bucket
    ("flat_field", True): "contradiction_hard",         # flat background, gradient published
    ("flat_field", False): "agreement",
    ("shaded_field", True): "agreement",
    ("shaded_field", False): "contradiction_soft",      # one shaded surface, flat published
    ("multiple_distinct_fields", True): "underdetermined",
    ("multiple_distinct_fields", False): "agreement",
    ("full_scene", True): "underdetermined",
    ("full_scene", False): "underdetermined",
    ("pattern_or_texture", True): "underdetermined",
    ("pattern_or_texture", False): "underdetermined",
    ("none_discernible", True): "underdetermined",
    ("none_discernible", False): "underdetermined",
}

# [MEASURED] Resolution strata. Pipeline §7.1: every agreement metric must be stratified by
# tier, because a difference between tiers could be resolution rather than content.
def tier_of(source_long_edge: int) -> str:
    if source_long_edge <= 320:
        return "thumbnail_<=320"
    if source_long_edge <= 640:
        return "standard_<=640"
    return "large_>640"


def cohens_kappa(pairs: list[tuple[bool, bool]]) -> float | None:
    """Two binary raters over the same items. Reported instead of raw accuracy because the
    set is roughly balanced but a degenerate all-one-answer oracle would still score ~50%."""
    n = len(pairs)
    if n == 0:
        return None
    observed = sum(1 for a, b in pairs if a == b) / n
    pa_true = sum(1 for a, _ in pairs if a) / n
    pb_true = sum(1 for _, b in pairs if b) / n
    expected = pa_true * pb_true + (1 - pa_true) * (1 - pb_true)
    if expected >= 1.0:
        return None
    return (observed - expected) / (1 - expected)


def mcc(tp: int, tn: int, fp: int, fn: int) -> float | None:
    denominator = math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn))
    if denominator == 0:
        return None
    return (tp * tn - fp * fn) / denominator


def binary_scores(pairs: list[tuple[bool, bool]]) -> dict:
    """pairs = (human gradient boolean, oracle-predicted gradient boolean)."""
    tp = sum(1 for h, o in pairs if h and o)
    tn = sum(1 for h, o in pairs if not h and not o)
    fp = sum(1 for h, o in pairs if not h and o)
    fn = sum(1 for h, o in pairs if h and not o)
    n = len(pairs)
    return {
        "n": n,
        "agreement": round((tp + tn) / n, 4) if n else None,
        "cohens_kappa": round(k, 4) if (k := cohens_kappa(pairs)) is not None else None,
        "matthews_corr": round(m, 4) if (m := mcc(tp, tn, fp, fn)) is not None else None,
        "confusion": {
            "human_gradient_oracle_gradient": tp,
            "human_flat_oracle_flat": tn,
            "human_flat_oracle_gradient": fp,
            "human_gradient_oracle_flat": fn,
        },
        "oracle_says_gradient_rate": round((tp + fp) / n, 4) if n else None,
        "human_says_gradient_rate": round((tp + fn) / n, 4) if n else None,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--include-conflicted-truth", action="store_true",
                        help="include artworks whose accepted palettes disagreed on the gradient "
                             "boolean and were resolved by recency (default: reported separately)")
    args = parser.parse_args()

    rows = [r for r in read_jsonl(args.results) if not r.get("is_canary")]
    ok = [r for r in rows if r.get("status") == "ok" and r.get("parsed")]

    health = {
        "rows": len(rows),
        "ok": len(ok),
        "failed": sum(1 for r in rows if r.get("status") == "failed"),
        "parse_failed": sum(1 for r in rows if r.get("parse_failed")),
        "attempts_gt_1": sum(1 for r in rows if (r.get("attempts") or 1) > 1),
        "by_variant": dict(Counter(r["prompt_variant"] for r in rows)),
        "constrained_decoding": sorted({bool(r.get("constrained_decoding")) for r in rows}),
        "model_revisions": sorted({r.get("model_revision", "?") for r in rows}),
        "prompt_hashes": {v: sorted({r["prompt_hash"] for r in rows if r["prompt_variant"] == v})
                          for v in sorted({r["prompt_variant"] for r in rows})},
        "run_ids": sorted({r.get("run_id", "?") for r in rows}),
    }

    canary_rows = [r for r in read_jsonl(args.results) if r.get("is_canary")]
    canary = {
        "count": len(canary_rows),
        "distinct_parsed_answers": len({json.dumps(r.get("parsed"), sort_keys=True) for r in canary_rows}),
        "distinct_raw_texts": len({r.get("raw_text", "") for r in canary_rows}),
        "stable": len({r.get("raw_text", "") for r in canary_rows}) <= 1,
    }

    # ---- index by (image, variant) ------------------------------------------------
    by_image: dict[str, dict] = defaultdict(dict)
    meta: dict[str, dict] = {}
    for r in ok:
        by_image[r["image_sha256"]][r["prompt_variant"]] = r["parsed"]
        meta[r["image_sha256"]] = {
            "image_path": r["image_path"],
            "artwork_id": r["artwork_id"],
            "gradient_truth": r["gradient_truth"],
            "conflicted": bool(r.get("gradient_truth_conflicted")),
            "tier": tier_of(r["source_long_edge_px"]),
            "source_long_edge_px": r["source_long_edge_px"],
        }

    variants = sorted({r["prompt_variant"] for r in ok})

    # ---- per-variant agreement on the gradient boolean ----------------------------
    def variant_report(variant: str, images: list[str]) -> dict:
        strict: list[tuple[bool, bool]] = []
        mapped_only: list[tuple[bool, bool]] = []
        buckets: Counter = Counter()
        contingency: Counter = Counter()
        unmapped = 0
        for sha in images:
            parsed = by_image[sha].get(variant)
            if parsed is None:
                continue
            truth = meta[sha]["gradient_truth"]
            ground = parsed["ground_type"]
            contingency[(ground, truth)] += 1
            buckets[P6_BUCKETS.get((ground, truth), "underdetermined")] += 1
            mapped = GRADIENT_MAP[ground]
            if mapped == "unmapped":
                unmapped += 1
                # Strict view still needs a prediction: an unmapped label is scored as "flat"
                # because none of full_scene / pattern_or_texture / none_discernible is a
                # claim that the ground is one shaded surface. Reported separately below so
                # the choice can be undone.
                strict.append((truth, False))
            else:
                strict.append((truth, mapped == "gradient"))
                mapped_only.append((truth, mapped == "gradient"))
        return {
            "strict_all_labels": binary_scores(strict),
            "mapped_labels_only": binary_scores(mapped_only),
            "unmapped_label_count": unmapped,
            "p6_buckets": dict(buckets),
            "p6_scored_share": round(
                (buckets["agreement"] + buckets["contradiction_hard"] + buckets["contradiction_soft"])
                / max(1, sum(buckets.values())), 4),
            "contingency_ground_type_x_human_gradient": {
                f"{g}|{'gradient' if t else 'flat'}": n for (g, t), n in sorted(contingency.items())
            },
            "ground_type_distribution": dict(Counter(
                by_image[s][variant]["ground_type"] for s in images if variant in by_image[s])),
        }

    all_images = [s for s in by_image if meta[s]["gradient_truth"] is not None]
    primary_images = all_images if args.include_conflicted_truth else [
        s for s in all_images if not meta[s]["conflicted"]]
    conflicted_images = [s for s in all_images if meta[s]["conflicted"]]

    report: dict = {
        "results_file": str(args.results),
        "health": health,
        "canary": canary,
        "gradient_map": GRADIENT_MAP,
        "p6_buckets_map": {f"{g}|{'gradient' if t else 'flat'}": b for (g, t), b in P6_BUCKETS.items()},
        "notes": [
            "PHASE_0_DECISIONS.md §4 P6: this is never an exact-match test. `underdetermined` cells "
            "are counted, not scored; their SIZE is the instrument.",
            "`strict_all_labels` forces every label into the binary (unmapped -> flat). "
            "`mapped_labels_only` drops flat_field/shaded_field/multiple_distinct_fields' three "
            "siblings entirely. Quote both or neither.",
            "Ground truth is an accepted algorithm decision, not an elicited human label — see "
            "eval-set.json meta.groundTruthEpistemology before reading a low number as oracle failure.",
            "Artworks whose accepted palettes disagreed on the gradient boolean are excluded from the "
            "primary numbers by default and reported under `conflicted_truth_subset`.",
        ],
        "population": {
            "images_with_at_least_one_ok_answer": len(all_images),
            "primary": len(primary_images),
            "conflicted_truth_excluded": len(conflicted_images),
            "distinct_artworks": len({meta[s]["artwork_id"] for s in primary_images}),
            "by_tier": dict(Counter(meta[s]["tier"] for s in primary_images)),
        },
        "per_variant": {v: variant_report(v, primary_images) for v in variants},
        "per_variant_by_tier": {
            v: {tier: variant_report(v, [s for s in primary_images if meta[s]["tier"] == tier])
                for tier in sorted({meta[s]["tier"] for s in primary_images})}
            for v in variants
        },
        "conflicted_truth_subset": {v: variant_report(v, conflicted_images) for v in variants}
        if conflicted_images else {},
    }

    # ---- inter-variant agreement, per question -----------------------------------
    if len(variants) >= 2:
        a, b = variants[0], variants[1]
        both = [s for s in primary_images if a in by_image[s] and b in by_image[s]]
        per_question = {}
        for field in ("ground_type", "shading_geometry", "field_texture", "enclosure", "confidence"):
            same = sum(1 for s in both if by_image[s][a][field] == by_image[s][b][field])
            # Chance-corrected over the observed marginals (multi-class kappa).
            ca = Counter(by_image[s][a][field] for s in both)
            cb = Counter(by_image[s][b][field] for s in both)
            n = len(both)
            expected = sum(ca[k] * cb[k] for k in VOCABULARIES[field]) / (n * n) if n else 0
            observed = same / n if n else 0
            per_question[field] = {
                "n": n,
                "raw_agreement": round(observed, 4),
                "cohens_kappa": round((observed - expected) / (1 - expected), 4) if n and expected < 1 else None,
                "disagreement_pairs": dict(Counter(
                    f"{by_image[s][a][field]}->{by_image[s][b][field]}"
                    for s in both if by_image[s][a][field] != by_image[s][b][field]).most_common(12)),
            }
        report["inter_variant_agreement"] = {
            "variants": [a, b],
            "per_question": per_question,
        }

        # ---- variants-agree breakdown on the gradient boolean --------------------
        def mapped(sha, v):
            return GRADIENT_MAP[by_image[sha][v]["ground_type"]]

        agree_ground = [s for s in both if by_image[s][a]["ground_type"] == by_image[s][b]["ground_type"]]
        agree_binary = [s for s in both if mapped(s, a) == mapped(s, b)]
        disagree_binary = [s for s in both if mapped(s, a) != mapped(s, b)]

        def scored(images):
            pairs = [(meta[s]["gradient_truth"], mapped(s, a) == "gradient") for s in images]
            return binary_scores(pairs)

        report["variants_agree_breakdown"] = {
            "both_answered": len(both),
            "identical_ground_type": {
                "n": len(agree_ground),
                "share": round(len(agree_ground) / len(both), 4) if both else None,
                "scores_vs_human": scored(agree_ground),
            },
            "same_binary_mapping": {
                "n": len(agree_binary),
                "share": round(len(agree_binary) / len(both), 4) if both else None,
                "scores_vs_human": scored(agree_binary),
            },
            "variants_disagree_on_binary": {
                "n": len(disagree_binary),
                "share": round(len(disagree_binary) / len(both), 4) if both else None,
                "human_gradient_rate_here": round(
                    sum(1 for s in disagree_binary if meta[s]["gradient_truth"]) / len(disagree_binary), 4)
                if disagree_binary else None,
                "note": "Pipeline §3 routes exactly this subset to the dense adjudicator. Its size is the "
                        "first thing to look at: a large one means the bulk model is not settled on the "
                        "question, independently of who is right.",
            },
        }

        # ---- per-item disagreements, for the reviewer ----------------------------
        report["disagreements"] = sorted(
            (
                {
                    "image_path": meta[s]["image_path"],
                    "image_sha256": s,
                    "human_gradient": meta[s]["gradient_truth"],
                    "tier": meta[s]["tier"],
                    "A": by_image[s].get(a),
                    "B": by_image[s].get(b),
                    "p6_bucket_A": P6_BUCKETS.get(
                        (by_image[s][a]["ground_type"], meta[s]["gradient_truth"]), "underdetermined")
                    if a in by_image[s] else None,
                }
                for s in both
                if P6_BUCKETS.get((by_image[s][a]["ground_type"], meta[s]["gradient_truth"]),
                                  "underdetermined").startswith("contradiction")
                or P6_BUCKETS.get((by_image[s][b]["ground_type"], meta[s]["gradient_truth"]),
                                  "underdetermined").startswith("contradiction")
            ),
            key=lambda d: d["image_path"],
        )

    # ---- by self-reported confidence ---------------------------------------------
    # Worth its own cut: if the oracle's `low` answers are where it disagrees with the human,
    # the confidence field is doing real work and can gate the algorithmic feature path (§4).
    report["by_confidence"] = {
        v: {level: scored_for_variant(by_image, meta, primary_images, v, level)
            for level in VOCABULARIES["confidence"]}
        for v in variants
    }

    out = args.out or DATA_DIR / (args.results.stem + ".agreement.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent="\t") + "\n")

    headline = {
        "population": report["population"],
        "health": {k: health[k] for k in ("rows", "ok", "failed", "parse_failed")},
        "canary_stable": canary["stable"],
        "per_variant_strict": {v: report["per_variant"][v]["strict_all_labels"] for v in variants},
        "per_variant_p6": {v: report["per_variant"][v]["p6_buckets"] for v in variants},
    }
    if "variants_agree_breakdown" in report:
        headline["variants_agree"] = {
            k: {kk: vv for kk, vv in report["variants_agree_breakdown"][k].items() if kk != "scores_vs_human"}
            for k in ("identical_ground_type", "same_binary_mapping", "variants_disagree_on_binary")
        }
    print(json.dumps(headline, indent="\t"))
    print(f"wrote {out}")
    return 0


def scored_for_variant(by_image, meta, images, variant, level) -> dict:
    subset = [s for s in images if variant in by_image[s] and by_image[s][variant]["confidence"] == level]
    pairs = [(meta[s]["gradient_truth"], GRADIENT_MAP[by_image[s][variant]["ground_type"]] == "gradient")
             for s in subset]
    return binary_scores(pairs)


if __name__ == "__main__":
    raise SystemExit(main())
