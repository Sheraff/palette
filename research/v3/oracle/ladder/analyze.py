"""Resolution-ladder analysis (oracle pipeline §7.4.3) + the §7.3 transfer check.

    ../premise/.venv/bin/python analyze.py --results <ladder.jsonl> [--results <more.jsonl> ...]
                                           [--pairs <pairs.jsonl>] [--out <analysis.json>]
                                           [--agreement-floor 0.85]

What it answers, in the order §7.4.3 asks it:

  1. Per question, agreement against the artwork's LARGEST rendition as a function of the
     rendition's long edge, binned. That is the curve.
  2. Per question, "unanswerable below X px": the smallest bin edge above which every bin
     clears the agreement floor. Below X the answer is not a negative, it is
     `below_resolution` (§7.1) and must never enter the label set as a confident value.
  3. The transfer check (§7.3): does the curve, measured on music-artworks, predict the
     300-vs-640 agreement actually observed on the 644 sharded cross-tier pairs? If it
     does, the curve can be trusted corpus-wide; if it does not, fall back to the
     in-distribution 2-point measurement.

Three things this script refuses to do quietly, because each would flatter the result:

  - It never compares a rendition against a reference that is itself low-resolution. The
    answer key has to be the best available look at the artwork, so the primary curve is
    restricted to artworks whose largest rendition clears REFERENCE_MIN_LONG_EDGE_PX. The
    unrestricted numbers are reported next to it, never instead of it.
  - It never reports `shading_geometry` agreement pooled. The value is `not_applicable`
    whenever the ground is not a shaded field, so pooled agreement mostly measures how
    often both sizes agreed the question did not apply. The conditional subset (reference
    said `shaded_field`) is the number that means something.
  - It reports the same-size codec control as the noise floor wherever the run has one.
    A curve that plateaus at 0.88 says nothing until you know two byte-different encodings
    of the SAME size also only agree 0.88 of the time.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common_ladder import (  # noqa: E402
    DATA_DIR, LONG_EDGE_BINS, bin_of, load_manifest, read_jsonl,
)

# ---------------------------------------------------------------- constants

# [REVIEWED] ORACLE_QUESTION_SET.md group A — the four labelled fields. `confidence` and
# `ambiguity_note` are reported separately: confidence as a distribution, the note never
# (human audit only, never read by code).
QUESTIONS = ("ground_type", "field_texture", "enclosure", "shading_geometry")

# [REVIEWED] `shading_geometry` is asked only when the ground is a shaded field, so its
# pooled agreement is dominated by agreed `not_applicable`. Reported conditionally on the
# REFERENCE answer being `shaded_field` — conditioning on the small rendition's answer
# would condition on the very thing resolution is suspected of changing.
CONDITIONAL_QUESTIONS = {"shading_geometry": ("ground_type", "shaded_field")}

# [INHERITED] data/oracle-premise/premise-run-1.agreement.json `gradient_map`: the
# ground_type -> gradient-boolean collapse the premise test used. Carried here so the
# ladder speaks about the decision the question actually feeds, not only about the label.
GRADIENT_MAP = {
    "shaded_field": "gradient",
    "flat_field": "flat",
    "multiple_distinct_fields": "flat",
}

# [UNCALIBRATED] The agreement level below which a question is declared unanswerable at a
# size. There is no measured basis for a specific value yet — that is what this run
# produces — so it is a CLI flag with this default, and every table prints the whole curve
# so a reviewer can move it. Read it together with the codec-control noise floor: a floor
# above the noise floor is unreachable at any resolution.
DEFAULT_AGREEMENT_FLOOR = 0.85

# [REVIEWED] A bin with fewer comparisons than this gets a curve point but never a verdict.
# 30 is the conventional smallest bin anyone quotes a proportion from; with a Wilson
# interval at n=30 the half-width is still ~±0.13, which is why the interval is printed.
MIN_BIN_N = 30

# [REVIEWED] The answer key must be a good look at the artwork. 500 px is below the
# sharded corpus's 640 px ceiling (so the restriction does not silently exclude the
# distribution the transfer check targets) and above the derived-thumbnail sizes.
REFERENCE_MIN_LONG_EDGE_PX = 500

# [MEASURED] build-manifest.ts: the matched-contrast window. A sharded pair is 300 vs 640
# by construction; music-artworks renditions land near but not exactly on those values.
MATCHED_LOW_PX = (280, 340)
MATCHED_HIGH_PX = (600, 680)


# ---------------------------------------------------------------- statistics

def wilson(successes: int, total: int, z: float = 1.96) -> tuple[float, float]:
    """Wilson score interval. Used rather than the normal approximation because the
    interesting bins are the small, high-agreement ones, where the normal interval runs
    past 1.0 and stops meaning anything."""
    if total == 0:
        return (0.0, 1.0)
    p = successes / total
    denominator = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denominator
    half = (z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total))) / denominator
    return (max(0.0, centre - half), min(1.0, centre + half))


def rate(successes: int, total: int) -> dict[str, Any]:
    low, high = wilson(successes, total)
    return {
        "n": total,
        "agree": successes,
        "agreement": round(successes / total, 4) if total else None,
        "ci95": [round(low, 4), round(high, 4)],
    }


# ---------------------------------------------------------------- loading

def load_answers(paths: list[Path]) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    """sha256 -> parsed answer, plus a health block. Canary rows are excluded from the
    answers (they are the same image over and over) but drive the stability check."""
    # Work rows are deduplicated by row_key — a resumed run appends, and the last row for a
    # key wins. Canary rows are NOT: every canary decode shares one row key by design (it is
    # the same image, on purpose, every CANARY_EVERY items), so deduplicating them would
    # collapse the drift check to a single observation and it would always report "stable".
    work_by_key: dict[str, dict[str, Any]] = {}
    canary: list[dict[str, Any]] = []
    for path in paths:
        for row in read_jsonl(path):
            if row.get("is_canary"):
                canary.append(row)
            elif row.get("row_key"):
                work_by_key[row["row_key"]] = row
    work = list(work_by_key.values())
    ok = [r for r in work if r.get("status") == "ok"]

    answers = {r["image_sha256"]: r["parsed"] for r in ok}
    health = {
        "result_files": [str(p) for p in paths],
        "rows": len(work) + len(canary),
        "work_rows": len(work),
        "canary_rows": len(canary),
        "ok": len(ok),
        "failed": sum(1 for r in work if r.get("status") == "failed"),
        "parse_failed": sum(1 for r in work if r.get("parse_failed")),
        "attempts_gt_1": sum(1 for r in work if (r.get("attempts") or 1) > 1),
        "scopes": sorted({r.get("scope") for r in work if r.get("scope")}),
        "collections": dict(Counter(r.get("collection") for r in work)),
        "prompt_hashes": sorted({r.get("prompt_hash") for r in ok}),
        "model_revisions": sorted({r.get("model_revision") for r in ok}),
        "resolution_caps": sorted({r.get("resolution_cap") for r in ok}),
        "canary": {
            "count": len(canary),
            "distinct_parsed_answers": len({json.dumps(r.get("parsed"), sort_keys=True) for r in canary}),
            "stable": len({json.dumps(r.get("parsed"), sort_keys=True) for r in canary}) <= 1,
        },
        "native_resolution": sorted({r.get("resolution_cap") for r in ok}) in ([0], []),
    }
    return answers, health


# ---------------------------------------------------------------- comparisons

def comparisons_from_ladder(manifest: dict[str, Any], answers: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """One record per (rendition, its artwork's largest rendition) pair, both answered."""
    out: list[dict[str, Any]] = []
    for artwork in manifest["ladder"]:
        reference = next(r for r in artwork["renditions"] if r["isReference"])
        reference_answer = answers.get(reference["sha256"])
        if reference_answer is None:
            continue
        for rendition in artwork["renditions"]:
            if rendition["sha256"] == reference["sha256"]:
                continue
            answer = answers.get(rendition["sha256"])
            if answer is None:
                continue
            out.append({
                "artwork_id": artwork["id"],
                "stratum": artwork["stratum"],
                "long_edge_px": rendition["longEdgePx"],
                "bin": bin_of(rendition["longEdgePx"]),
                "reference_long_edge_px": reference["longEdgePx"],
                "reference_bin": bin_of(reference["longEdgePx"]),
                "same_size_as_reference": rendition["width"] == reference["width"]
                and rendition["height"] == reference["height"],
                "answer": answer,
                "reference_answer": reference_answer,
            })
    return out


def codec_control_comparisons(manifest: dict[str, Any], answers: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """The noise floor: two renditions of one artwork at EXACTLY the same pixel size, in
    different bytes (the CDN re-encoded a JPEG as AVIF, §7.4.1 trap 2). Same information,
    different compression — so any disagreement here is not resolution, and every curve
    point has to be read against it. Only populated when the run used
    `--include-duplicate-sizes`; otherwise these renditions were never inferred."""
    out: list[dict[str, Any]] = []
    for artwork in manifest["ladder"]:
        by_size: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for rendition in artwork["renditions"]:
            by_size[f"{rendition['width']}x{rendition['height']}"].append(rendition)
        for size, renditions in by_size.items():
            if len(renditions) < 2:
                continue
            head = renditions[0]
            head_answer = answers.get(head["sha256"])
            if head_answer is None:
                continue
            for other in renditions[1:]:
                other_answer = answers.get(other["sha256"])
                if other_answer is None:
                    continue
                out.append({
                    "artwork_id": artwork["id"],
                    "stratum": artwork["stratum"],
                    "long_edge_px": other["longEdgePx"],
                    "bin": bin_of(other["longEdgePx"]),
                    "reference_long_edge_px": head["longEdgePx"],
                    "reference_bin": bin_of(head["longEdgePx"]),
                    "same_size_as_reference": True,
                    "size": size,
                    "answer": other_answer,
                    "reference_answer": head_answer,
                })
    return out


def comparisons_from_pairs(manifest: dict[str, Any], answers: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """One record per sharded cross-tier pair: the small rendition against the large one."""
    out: list[dict[str, Any]] = []
    for pair in manifest["pairs"]:
        large, small = pair["files"][0], pair["files"][1]
        large_answer, small_answer = answers.get(large["sha256"]), answers.get(small["sha256"])
        if large_answer is None or small_answer is None:
            continue
        out.append({
            "artwork_id": pair["artworkId"],
            "stratum": "sharded-pair",
            "long_edge_px": small["longEdgePx"],
            "bin": bin_of(small["longEdgePx"]),
            "reference_long_edge_px": large["longEdgePx"],
            "reference_bin": bin_of(large["longEdgePx"]),
            "same_size_as_reference": False,
            "answer": small_answer,
            "reference_answer": large_answer,
        })
    return out


def matched_contrast_comparisons(manifest: dict[str, Any], answers: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """The in-distribution mirror of a sharded pair: within one music-artworks artwork,
    its ~300 px rung against its ~640 px rung, whichever of them is the reference."""
    out: list[dict[str, Any]] = []
    for artwork in manifest["ladder"]:
        if not artwork["isMatchedContrast"]:
            continue
        low = next((r for r in artwork["renditions"] if MATCHED_LOW_PX[0] <= r["longEdgePx"] <= MATCHED_LOW_PX[1]), None)
        high = next((r for r in artwork["renditions"] if MATCHED_HIGH_PX[0] <= r["longEdgePx"] <= MATCHED_HIGH_PX[1]), None)
        if low is None or high is None:
            continue
        low_answer, high_answer = answers.get(low["sha256"]), answers.get(high["sha256"])
        if low_answer is None or high_answer is None:
            continue
        out.append({
            "artwork_id": artwork["id"],
            "stratum": artwork["stratum"],
            "long_edge_px": low["longEdgePx"],
            "bin": bin_of(low["longEdgePx"]),
            "reference_long_edge_px": high["longEdgePx"],
            "reference_bin": bin_of(high["longEdgePx"]),
            "same_size_as_reference": False,
            "answer": low_answer,
            "reference_answer": high_answer,
        })
    return out


# ---------------------------------------------------------------- scoring

def eligible(comparison: dict[str, Any], question: str) -> bool:
    condition = CONDITIONAL_QUESTIONS.get(question)
    if condition is None:
        return True
    field, value = condition
    return comparison["reference_answer"].get(field) == value


def agrees(comparison: dict[str, Any], question: str) -> bool:
    return comparison["answer"].get(question) == comparison["reference_answer"].get(question)


def gradient_of(answer: dict[str, Any]) -> str | None:
    return GRADIENT_MAP.get(answer.get("ground_type"))


def score(comparisons: list[dict[str, Any]], question: str) -> dict[str, Any]:
    subset = [c for c in comparisons if eligible(c, question)]
    return rate(sum(1 for c in subset if agrees(c, question)), len(subset))


def score_gradient(comparisons: list[dict[str, Any]]) -> dict[str, Any]:
    subset = [c for c in comparisons
              if gradient_of(c["answer"]) is not None and gradient_of(c["reference_answer"]) is not None]
    return rate(sum(1 for c in subset if gradient_of(c["answer"]) == gradient_of(c["reference_answer"])), len(subset))


BIN_ORDER = [f"{low}-{high}" if high < 10_000 else f"{low}+" for low, high in LONG_EDGE_BINS]


def curve(comparisons: list[dict[str, Any]], question: str) -> dict[str, dict[str, Any]]:
    by_bin: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for c in comparisons:
        by_bin[c["bin"]].append(c)
    out: dict[str, dict[str, Any]] = {}
    for name in BIN_ORDER:
        if name not in by_bin:
            continue
        out[name] = (score_gradient(by_bin[name]) if question == "gradient_boolean"
                     else score(by_bin[name], question))
    return out


def resolution_floor(curve_points: dict[str, dict[str, Any]], floor: float) -> dict[str, Any]:
    """§7.4.3's verdict: the smallest long edge above which every measured bin clears the
    agreement floor. Bins thinner than MIN_BIN_N cannot carry a verdict, so they are
    reported and skipped rather than allowed to set the answer."""
    names = [n for n in BIN_ORDER if n in curve_points]
    thin = [n for n in names if curve_points[n]["n"] < MIN_BIN_N]
    usable = [n for n in names if curve_points[n]["n"] >= MIN_BIN_N]
    if not usable:
        return {"verdict": "insufficient_data", "thin_bins": thin, "usable_bins": []}
    # Walk down from the largest bin; stop at the first that fails.
    passing_from_top: list[str] = []
    for name in reversed(usable):
        if (curve_points[name]["agreement"] or 0) >= floor:
            passing_from_top.append(name)
        else:
            break
    if not passing_from_top:
        return {
            "verdict": "never_clears_floor",
            "floor": floor,
            "thin_bins": thin,
            "note": "no bin, not even the largest, agrees with the reference at the floor — "
                    "either the question is unstable at every size or the floor is above the "
                    "codec-control noise ceiling",
        }
    lowest_passing = passing_from_top[-1]
    lowest_index = usable.index(lowest_passing)
    if lowest_index == 0:
        return {
            "verdict": "answerable_at_every_measured_size",
            "floor": floor,
            "lowest_passing_bin": lowest_passing,
            "unanswerable_below_px": None,
            "thin_bins": thin,
        }
    return {
        "verdict": "unanswerable_below",
        "floor": floor,
        "lowest_passing_bin": lowest_passing,
        "unanswerable_below_px": int(lowest_passing.split("-")[0].rstrip("+")),
        "first_failing_bin": usable[lowest_index - 1],
        "thin_bins": thin,
        "action": "record `below_resolution` for this question on any rendition under "
                  "unanswerable_below_px; never a confident negative (§7.1)",
    }


# ---------------------------------------------------------------- transfer check

def transfer_check(ladder: list[dict[str, Any]], matched: list[dict[str, Any]],
                   pairs: list[dict[str, Any]], question: str) -> dict[str, Any]:
    """Two predictors of the sharded 300-vs-640 agreement, and the observed value.

    Predictor A — the curve: ladder comparisons whose rung sits in the ~300 band and whose
    reference sits in the ~640 band. Same contrast, different collection.
    Predictor B — matched contrast: the same artwork's own ~300 and ~640 rungs, which
    removes the reference-size variation entirely.
    """
    scorer = score_gradient if question == "gradient_boolean" else (lambda cs: score(cs, question))
    curve_subset = [c for c in ladder
                    if MATCHED_LOW_PX[0] <= c["long_edge_px"] <= MATCHED_LOW_PX[1]
                    and MATCHED_HIGH_PX[0] <= c["reference_long_edge_px"] <= MATCHED_HIGH_PX[1]]
    predicted_a = scorer(curve_subset)
    predicted_b = scorer(matched)
    observed = scorer(pairs)

    def verdict(predicted: dict[str, Any]) -> str:
        if not predicted["n"] or not observed["n"]:
            return "not_measurable"
        if predicted["n"] < MIN_BIN_N or observed["n"] < MIN_BIN_N:
            return "underpowered"
        low, high = predicted["ci95"]
        if low <= (observed["agreement"] or 0) <= high:
            return "transfer_holds"
        return "transfer_fails"

    return {
        "question": question,
        "predicted_from_curve": predicted_a,
        "predicted_from_matched_contrast": predicted_b,
        "observed_sharded_pairs": observed,
        "verdict_vs_curve": verdict(predicted_a),
        "verdict_vs_matched_contrast": verdict(predicted_b),
        "note": "§7.4.3 step 2: if the curve predicts the observed sharded agreement, the "
                "curve can be trusted corpus-wide; if not, fall back to the in-distribution "
                "2-point measurement.",
    }


# ---------------------------------------------------------------- main

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--results", action="append", type=Path, required=True,
                        help="ladder results JSONL (repeatable; scope full and/or sample)")
    parser.add_argument("--pairs", action="append", type=Path, default=None,
                        help="scope-pairs results JSONL (repeatable). Omit to skip the transfer check.")
    parser.add_argument("--manifest", type=Path, default=None)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--agreement-floor", type=float, default=DEFAULT_AGREEMENT_FLOOR)
    args = parser.parse_args()

    manifest = load_manifest(args.manifest) if args.manifest else load_manifest()
    result_paths = list(args.results) + list(args.pairs or [])
    answers, health = load_answers(result_paths)

    ladder_all = comparisons_from_ladder(manifest, answers)
    ladder_primary = [c for c in ladder_all
                      if c["reference_long_edge_px"] >= REFERENCE_MIN_LONG_EDGE_PX
                      and not c["same_size_as_reference"]]
    codec_control = codec_control_comparisons(manifest, answers)
    matched = matched_contrast_comparisons(manifest, answers)
    pairs = comparisons_from_pairs(manifest, answers) if args.pairs else []

    questions = list(QUESTIONS) + ["gradient_boolean"]
    per_question: dict[str, Any] = {}
    for question in questions:
        points = curve(ladder_primary, question)
        per_question[question] = {
            "curve_vs_largest_rendition": points,
            "resolution_floor": resolution_floor(points, args.agreement_floor),
            "pooled_primary": (score_gradient(ladder_primary) if question == "gradient_boolean"
                               else score(ladder_primary, question)),
            "pooled_unrestricted": (score_gradient([c for c in ladder_all if not c["same_size_as_reference"]])
                                    if question == "gradient_boolean"
                                    else score([c for c in ladder_all if not c["same_size_as_reference"]], question)),
            "codec_control_same_size": (score_gradient(codec_control) if question == "gradient_boolean"
                                        else score(codec_control, question)),
            "by_reference_band": {
                band: (score_gradient([c for c in ladder_primary if c["reference_bin"] == band])
                       if question == "gradient_boolean"
                       else score([c for c in ladder_primary if c["reference_bin"] == band], question))
                for band in BIN_ORDER
                if any(c["reference_bin"] == band for c in ladder_primary)
            },
        }
        if pairs or matched:
            per_question[question]["transfer_check"] = transfer_check(ladder_primary, matched, pairs, question)

    # Confidence is not an agreement question — it is the model's own hedge, and the useful
    # reading is whether it drops as the image shrinks (it should; if it does not, the model
    # is not aware of the limit §7.1 describes).
    confidence_by_bin: dict[str, dict[str, int]] = {}
    for c in ladder_primary:
        bucket = confidence_by_bin.setdefault(c["bin"], Counter())
        bucket[c["answer"].get("confidence")] += 1
    confidence = {name: dict(confidence_by_bin[name]) for name in BIN_ORDER if name in confidence_by_bin}

    document = {
        "what": "Resolution-ladder analysis (ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md §7.4.3) "
                "and the §7.3 transfer check",
        "generated_by": "research/v3/oracle/ladder/analyze.py",
        "generated_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
                        .isoformat(timespec="seconds").replace("+00:00", "Z"),
        "settings": {
            "agreement_floor": args.agreement_floor,
            "min_bin_n": MIN_BIN_N,
            "reference_min_long_edge_px": REFERENCE_MIN_LONG_EDGE_PX,
            "long_edge_bins": BIN_ORDER,
            "conditional_questions": {k: list(v) for k, v in CONDITIONAL_QUESTIONS.items()},
            "gradient_map": GRADIENT_MAP,
        },
        "health": health,
        "population": {
            "ladder_comparisons_total": len(ladder_all),
            "ladder_comparisons_primary": len(ladder_primary),
            "codec_control_comparisons": len(codec_control),
            "matched_contrast_comparisons": len(matched),
            "sharded_pair_comparisons": len(pairs),
            "artworks_with_an_answered_reference": len({c["artwork_id"] for c in ladder_all}),
        },
        "per_question": per_question,
        "confidence_by_bin": confidence,
        "notes": [
            "Agreement here is agreement with the SAME MODEL at a larger size, never with a "
            "human. It measures how much of the answer survives downscaling, which is exactly "
            "the §7.1 question; it says nothing about whether the large-size answer is right.",
            "Read every curve against `codec_control_same_size`. That is the noise floor: two "
            "byte-different encodings of the same pixels. Agreement cannot exceed it for reasons "
            "of resolution.",
            "`shading_geometry` is conditioned on the reference answering `shaded_field`; its n "
            "is therefore much smaller than the others'.",
        ],
    }

    out_path = args.out or (DATA_DIR / f"{result_paths[0].stem}.analysis.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(document, indent="\t", sort_keys=False) + "\n")

    # -- console summary -----------------------------------------------------
    print(json.dumps(health, indent="\t"))
    print(json.dumps(document["population"], indent="\t"))
    for question in questions:
        block = per_question[question]
        print(f"\n=== {question}")
        print(f"  pooled (reference >= {REFERENCE_MIN_LONG_EDGE_PX}px): {block['pooled_primary']}")
        print(f"  codec control (same size, different bytes): {block['codec_control_same_size']}")
        for name, point in block["curve_vs_largest_rendition"].items():
            flag = "" if point["n"] >= MIN_BIN_N else "  (thin)"
            print(f"    {name:>10} px  n={point['n']:<5} agree={point['agreement']}  "
                  f"ci={point['ci95']}{flag}")
        print(f"  floor verdict: {block['resolution_floor']}")
        if "transfer_check" in block:
            t = block["transfer_check"]
            print(f"  transfer: curve={t['predicted_from_curve']['agreement']} "
                  f"matched={t['predicted_from_matched_contrast']['agreement']} "
                  f"observed={t['observed_sharded_pairs']['agreement']} "
                  f"-> {t['verdict_vs_curve']} / {t['verdict_vs_matched_contrast']}")
    print(f"\nwrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
