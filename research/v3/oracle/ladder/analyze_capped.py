"""Resolution-ladder RE-SCORE against a viewing-plausible (capped) answer key.

    ../premise/.venv/bin/python analyze_capped.py \
        --results ../../data/oracle-ladder/ladder-sample-1.jsonl \
        --results ../../data/oracle-ladder/ladder-codec-control-1.jsonl \
        --pairs   ../../data/oracle-ladder/ladder-pairs-1.jsonl \
        --out     ../../data/oracle-ladder/ladder-sample-1.capped-reference.analysis.json

Why this file exists — unrealized-ideas item 5, and before it the ladder README's own smoke
finding: the published floors (PHASE_0_DECISIONS.md §7) score every rung against the artwork's
LARGEST rendition, which for 223 of the 400 sampled artworks is bigger than 640 px. The
instrument never sees a pixel above 640 (`oracle/premise/common.py: RESOLUTION_CAP_PX = 640`,
downscale-only), so those floors are graded against an answer key holding information no
downstream consumer of the label — and no viewer — ever has. At 3,000 px the model called one
smoke artwork `pattern_or_texture` where every smaller rendition said `flat_field`: paper grain.

What this script does NOT do: re-run anything. It re-keys the SAME stored answers. Every number
here comes out of `analyze.py`'s own scoring functions, imported and never re-implemented, so a
difference between the two columns is a difference of answer key and of nothing else.

    column A  "published"  reference = the artwork's largest rendition          (analyze.py)
    column B  "capped"     reference = the artwork's largest rendition <= 640px (here)

Both columns are always emitted. This file never overwrites `ladder-sample-1.analysis.json`.

---- the two honest difficulties, stated up front, neither of them hidden in a footnote ----

1. THE CAPPED KEY IS A PROXY, NOT THE INSTRUMENT'S OWN VIEW. The pipeline would take a 3,000 px
   file and downscale it to 640. We have no inference for that image (it would need the GPU this
   analysis is forbidden). What we have is the CDN's own ~483 px or ~333 px rendition of the same
   artwork — a different resampler and a different codec reaching a similar size. The size of that
   proxy error is measured, not assumed: it is exactly what the same-size codec control measures
   (ground_type 0.903 / field_texture 0.922 / enclosure 0.961 / shading_geometry 0.857), and it is
   reported alongside every capped number.

2. THE PUBLISHED `REFERENCE_MIN_LONG_EDGE_PX = 500` RULE CANNOT SURVIVE THE CAP. Measured on this
   run: of the 223 sampled artworks whose reference exceeds 640 px, ZERO have a rendition in
   500..640 — the CDN derives ~147 / ~333 / ~483 px and then jumps to the original, so the
   561-680 px bin is structurally empty (README §144) and the 441-560 band holds only 483s.
   Keeping 500 under the cap would not tighten the analysis, it would silently delete every
   artwork the cap was supposed to be about, leaving exactly the artworks the cap does not touch.
   So the capped column reports a LADDER of reference floors (500 / 441 / 300 / 0) rather than one
   number, and the headline capped column is declared by --capped-reference-min. This is a
   deviation from the published constant and is stamped as such in the output.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common_ladder import DATA_DIR, bin_of, load_manifest  # noqa: E402

# `common_ladder` puts the premise directory on sys.path (it imports the shared model/JSONL
# machinery from there), and premise ships its OWN `analyze.py`. Importing by name would silently
# pick up the wrong module, so the ladder's analyzer is loaded by explicit path — the whole point
# of this file is that column A comes from the published scorer and no other.
import importlib.util as _importlib_util  # noqa: E402

_analyze_path = Path(__file__).resolve().parent / "analyze.py"
_spec = _importlib_util.spec_from_file_location("ladder_analyze", _analyze_path)
analyze = _importlib_util.module_from_spec(_spec)
sys.modules["ladder_analyze"] = analyze
_spec.loader.exec_module(analyze)

BIN_ORDER = analyze.BIN_ORDER
CONDITIONAL_QUESTIONS = analyze.CONDITIONAL_QUESTIONS
DEFAULT_AGREEMENT_FLOOR = analyze.DEFAULT_AGREEMENT_FLOOR
GRADIENT_MAP = analyze.GRADIENT_MAP
MIN_BIN_N = analyze.MIN_BIN_N
QUESTIONS = analyze.QUESTIONS
REFERENCE_MIN_LONG_EDGE_PX = analyze.REFERENCE_MIN_LONG_EDGE_PX
curve = analyze.curve
load_answers = analyze.load_answers
matched_contrast_comparisons = analyze.matched_contrast_comparisons
comparisons_from_pairs = analyze.comparisons_from_pairs
rate = analyze.rate
resolution_floor = analyze.resolution_floor
score = analyze.score
score_gradient = analyze.score_gradient
transfer_check = analyze.transfer_check

# [MEASURED] oracle/premise/common.py: RESOLUTION_CAP_PX = 640, downscale-only. This is the
# largest number of pixels the instrument can ever be shown, on any corpus, in any run.
PIPELINE_RESOLUTION_CAP_PX = 640

# [ANALYSIS-CHOICE, deviates from analyze.py's 500 — see the module docstring, difficulty 2]
# 441 is a published bin edge (441-560) and the largest reference floor that still admits the
# ~482/483 px capped keys. At 500 the capped column retains none of the 223 affected artworks.
DEFAULT_CAPPED_REFERENCE_MIN_PX = 441

# Every reference floor the capped column is reported at, so the choice above is visible as one
# row of a table rather than as a constant someone has to trust.
CAPPED_REFERENCE_MIN_LADDER = (500, 441, 300, 0)

ALL_QUESTIONS = list(QUESTIONS) + ["gradient_boolean"]


def _scorer(question: str):
    return score_gradient if question == "gradient_boolean" else (lambda cs: score(cs, question))


# ---------------------------------------------------------------- capped re-keying

def capped_reference(artwork: dict[str, Any], cap_px: int) -> dict[str, Any] | None:
    """The artwork's largest rendition at or below the instrument's cap.

    Ties (the CDN re-encoded the same size twice) are broken deterministically and in the
    published analyzer's own order of preference: the manifest's reference first, then the rung
    representative, then the smallest sha256. The tie-break can only matter through codec noise,
    which is the quantity the codec control measures."""
    eligible = [r for r in artwork["renditions"] if r["longEdgePx"] <= cap_px]
    if not eligible:
        return None
    best = max(r["longEdgePx"] for r in eligible)
    same = [r for r in eligible if r["longEdgePx"] == best]
    same.sort(key=lambda r: (not r.get("isReference"), not r.get("isRungRepresentative"), r["sha256"]))
    return same[0]


def comparisons_capped(manifest: dict[str, Any], answers: dict[str, dict[str, Any]],
                       cap_px: int) -> list[dict[str, Any]]:
    """One record per (rung, that artwork's capped reference), for rungs strictly below it.

    Rungs ABOVE the cap are dropped, not scored: they are images the pipeline cannot be given.
    Rungs at exactly the reference size are dropped for the same reason analyze.py drops them —
    they are the codec control, not a resolution measurement."""
    out: list[dict[str, Any]] = []
    for artwork in manifest["ladder"]:
        reference = capped_reference(artwork, cap_px)
        if reference is None:
            continue
        reference_answer = answers.get(reference["sha256"])
        if reference_answer is None:
            continue
        for rendition in artwork["renditions"]:
            if rendition["longEdgePx"] >= reference["longEdgePx"]:
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
                "published_reference_long_edge_px": artwork["referenceLongEdgePx"],
                "reference_was_capped": artwork["referenceLongEdgePx"] > cap_px,
                "same_size_as_reference": False,
                "answer": answer,
                "reference_answer": reference_answer,
            })
    return out


def codec_control_capped(manifest: dict[str, Any], answers: dict[str, dict[str, Any]],
                         cap_px: int) -> list[dict[str, Any]]:
    """The published codec control, restricted to sizes the instrument can actually be shown.
    A same-size disagreement measured at 1,440 px is not this corpus's noise floor."""
    return [c for c in analyze.codec_control_comparisons(manifest, answers)
            if c["long_edge_px"] <= cap_px and c["reference_long_edge_px"] <= cap_px]


# ---------------------------------------------------------------- the odd-one-out census

def odd_one_out_census(manifest: dict[str, Any], answers: dict[str, dict[str, Any]],
                       cap_px: int) -> dict[str, Any]:
    """"How often is the largest rendition the odd one out?" — unrealized-ideas item 5's first
    question, which nobody had ever counted.

    Two rates per question, over artworks whose published reference exceeds the cap:
      `key_changed`   — the published key and the capped key simply disagree.
      `odd_one_out`   — the strong form: the published key disagrees with its capped key AND
                        every one of that artwork's <=cap rungs is unanimous against it. That is
                        the paper-grain signature: one answer at the top, one answer everywhere a
                        viewer could ever be."""
    out: dict[str, Any] = {}
    for question in ALL_QUESTIONS:
        def value(answer):
            if question == "gradient_boolean":
                return GRADIENT_MAP.get(answer.get("ground_type"))
            return answer.get(question)

        condition = CONDITIONAL_QUESTIONS.get(question)
        considered = changed = odd = unanimous_below = 0
        examples: list[dict[str, Any]] = []
        for artwork in manifest["ladder"]:
            if artwork["referenceLongEdgePx"] <= cap_px:
                continue
            published = next((r for r in artwork["renditions"] if r["isReference"]), None)
            capped = capped_reference(artwork, cap_px)
            if published is None or capped is None:
                continue
            published_answer = answers.get(published["sha256"])
            capped_answer = answers.get(capped["sha256"])
            if published_answer is None or capped_answer is None:
                continue
            # Conditioned questions are censused on the same condition the curve uses, applied to
            # the PUBLISHED key — the key whose behaviour is under suspicion.
            if condition is not None and published_answer.get(condition[0]) != condition[1]:
                continue
            top, below_key = value(published_answer), value(capped_answer)
            if top is None or below_key is None:
                continue
            considered += 1
            below = [value(answers[r["sha256"]]) for r in artwork["renditions"]
                     if r["longEdgePx"] <= cap_px and r["sha256"] in answers
                     and value(answers[r["sha256"]]) is not None]
            if len(set(below)) == 1:
                unanimous_below += 1
            if top != below_key:
                changed += 1
                if len(set(below)) == 1:
                    odd += 1
                    if len(examples) < 12:
                        examples.append({
                            "artwork_id": artwork["id"],
                            "published_reference_px": published["longEdgePx"],
                            "capped_reference_px": capped["longEdgePx"],
                            "published_answer": top,
                            "answer_everywhere_below": below[0],
                            "rungs_below_cap": sorted({r["longEdgePx"] for r in artwork["renditions"]
                                                       if r["longEdgePx"] <= cap_px}, reverse=True),
                        })
        out[question] = {
            "artworks_considered": considered,
            "key_changed": rate(changed, considered),
            "odd_one_out_vs_unanimous_below": rate(odd, considered),
            "artworks_with_unanimous_answer_below_cap": unanimous_below,
            "examples": examples,
        }
    return out


def key_change_direction(manifest: dict[str, Any], answers: dict[str, dict[str, Any]],
                         cap_px: int) -> dict[str, Any]:
    """WHICH WAY the answer key is wrong — unrealized-ideas item 5 says the bias runs "in an
    unknown direction", and this is the measurement that makes it known.

    Every `ground_type` disagreement between the published key and the capped key, as an ordered
    transition, plus the two aggregates that matter: how often the big rendition sees STRUCTURE
    (`shaded_field` / `pattern_or_texture`) where the viewable one sees `flat_field`, and how
    often it runs the other way. A large asymmetry means the published ladder was scoring small
    renditions against a key that sees gradients and grain no viewer ever sees, and marking them
    wrong for agreeing with what is actually there."""
    structure = {"shaded_field", "pattern_or_texture"}
    transitions: Counter = Counter()
    for artwork in manifest["ladder"]:
        if artwork["referenceLongEdgePx"] <= cap_px:
            continue
        published = next((r for r in artwork["renditions"] if r["isReference"]), None)
        capped = capped_reference(artwork, cap_px)
        if published is None or capped is None:
            continue
        published_answer, capped_answer = answers.get(published["sha256"]), answers.get(capped["sha256"])
        if published_answer is None or capped_answer is None:
            continue
        top, below = published_answer.get("ground_type"), capped_answer.get("ground_type")
        if top and below and top != below:
            transitions[(top, below)] += 1
    to_flat = sum(n for (top, below), n in transitions.items()
                  if top in structure and below == "flat_field")
    from_flat = sum(n for (top, below), n in transitions.items()
                    if top == "flat_field" and below in structure)
    return {
        "question": "ground_type",
        "transitions_published_to_capped": {f"{top} -> {below}": n
                                            for (top, below), n in transitions.most_common()},
        "total_disagreements": sum(transitions.values()),
        "structure_at_top_flat_below": to_flat,
        "flat_at_top_structure_below": from_flat,
        "asymmetry_ratio": round(to_flat / from_flat, 2) if from_flat else None,
        "reading": "The published answer key is biased TOWARD seeing structure. Where the two keys "
                   "disagree, the >640 px rendition reports a gradient or a texture and every "
                   "viewable rendition reports a flat field far more often than the reverse. The "
                   "published ladder therefore scored small renditions against gradients and paper "
                   "grain that are not present at any size the pipeline or a viewer ever sees.",
    }


# ---------------------------------------------------------------- reporting

def question_block(comparisons: list[dict[str, Any]], control: list[dict[str, Any]],
                   question: str, floor: float) -> dict[str, Any]:
    points = curve(comparisons, question)
    scorer = _scorer(question)
    return {
        "curve": points,
        "resolution_floor": resolution_floor(points, floor),
        "pooled": scorer(comparisons),
        "codec_control_same_size": scorer(control),
    }


def floor_fragility(block: dict[str, Any], floor: float) -> dict[str, Any]:
    """Which bins actually SETTLE their verdict and which only appear to.

    A bin whose 95% interval contains the agreement floor has not decided anything — the verdict
    it produces is a coin landing on the point estimate. This is reported because the floor is
    `[UNCALIBRATED]` (loose end A2): a verdict that flips inside its own confidence interval
    cannot be used to argue the floor is right, in either column."""
    out = {}
    for name, point in block["curve"].items():
        low, high = point["ci95"]
        out[name] = {
            "n": point["n"],
            "agreement": point["agreement"],
            "ci95": point["ci95"],
            "clears_floor": (point["agreement"] or 0) >= floor,
            "ci_contains_floor": low <= floor <= high,
            "settled": not (low <= floor <= high) and point["n"] >= MIN_BIN_N,
        }
    return out


def floors_table(published: dict[str, Any], capped: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for question in ALL_QUESTIONS:
        a = published[question]["resolution_floor"]
        b = capped[question]["resolution_floor"]
        rows.append({
            "question": question,
            "published_verdict": a.get("verdict"),
            "published_unanswerable_below_px": a.get("unanswerable_below_px"),
            "published_lowest_passing_bin": a.get("lowest_passing_bin"),
            "published_pooled": published[question]["pooled"]["agreement"],
            "capped_verdict": b.get("verdict"),
            "capped_unanswerable_below_px": b.get("unanswerable_below_px"),
            "capped_lowest_passing_bin": b.get("lowest_passing_bin"),
            "capped_pooled": capped[question]["pooled"]["agreement"],
            "floor_moved": a.get("unanswerable_below_px") != b.get("unanswerable_below_px")
                           or a.get("verdict") != b.get("verdict"),
        })
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--results", action="append", type=Path, required=True)
    parser.add_argument("--pairs", action="append", type=Path, default=None)
    parser.add_argument("--manifest", type=Path, default=None)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--agreement-floor", type=float, default=DEFAULT_AGREEMENT_FLOOR)
    parser.add_argument("--cap-px", type=int, default=PIPELINE_RESOLUTION_CAP_PX)
    parser.add_argument("--capped-reference-min", type=int, default=DEFAULT_CAPPED_REFERENCE_MIN_PX)
    parser.add_argument("--no-verify-column-a", action="store_true",
                        help="skip the parity check against the published analysis (it is on by "
                             "default and failing it is meant to stop the run)")
    args = parser.parse_args()

    manifest = load_manifest(args.manifest) if args.manifest else load_manifest()
    result_paths = list(args.results) + list(args.pairs or [])
    answers, health = load_answers(result_paths)
    cap = args.cap_px

    # -- column A: the published key, reproduced through analyze.py's own code ---------------
    ladder_all = analyze.comparisons_from_ladder(manifest, answers)
    published_primary = [c for c in ladder_all
                         if c["reference_long_edge_px"] >= REFERENCE_MIN_LONG_EDGE_PX
                         and not c["same_size_as_reference"]]
    published_control = analyze.codec_control_comparisons(manifest, answers)

    # -- column B: the capped key ------------------------------------------------------------
    capped_all = comparisons_capped(manifest, answers, cap)
    capped_control = codec_control_capped(manifest, answers, cap)
    capped_by_refmin = {
        str(minimum): [c for c in capped_all if c["reference_long_edge_px"] >= minimum]
        for minimum in CAPPED_REFERENCE_MIN_LADDER
    }
    capped_primary = capped_by_refmin[str(args.capped_reference_min)]

    matched = matched_contrast_comparisons(manifest, answers)
    pairs = comparisons_from_pairs(manifest, answers) if args.pairs else []

    # The headline column with near-ties removed. It exists because 30 of the 221 comparisons in
    # the 441-560 bin are a 482 px rung against that artwork's own 483 px key — the bin that
    # decides `shading_geometry`, so the question "does the verdict survive without them?" has to
    # be answerable without re-running anything.
    capped_strict = [c for c in capped_primary
                     if c["long_edge_px"] / c["reference_long_edge_px"] <= 0.9]

    published: dict[str, Any] = {}
    capped: dict[str, Any] = {}
    capped_no_near_ties: dict[str, Any] = {}
    sensitivity: dict[str, Any] = {}
    for question in ALL_QUESTIONS:
        capped_no_near_ties[question] = question_block(
            capped_strict, capped_control, question, args.agreement_floor)
        published[question] = question_block(published_primary, published_control, question,
                                             args.agreement_floor)
        capped[question] = question_block(capped_primary, capped_control, question,
                                          args.agreement_floor)
        if pairs or matched:
            published[question]["transfer_check"] = transfer_check(
                published_primary, matched, pairs, question)
            capped[question]["transfer_check"] = transfer_check(
                capped_primary, matched, pairs, question)
        sensitivity[question] = {
            str(minimum): {
                "n_comparisons": len(subset),
                "pooled": _scorer(question)(subset),
                "curve": curve(subset, question),
                "resolution_floor": resolution_floor(curve(subset, question), args.agreement_floor),
            }
            for minimum, subset in ((m, capped_by_refmin[str(m)]) for m in CAPPED_REFERENCE_MIN_LADDER)
        }

    # Counted over artworks that actually CONTRIBUTE a capped comparison — an artwork whose
    # renditions were never inferred (outside the sample) moves no number and must not be
    # reported as if it had.
    contributing = {c["artwork_id"] for c in capped_all}
    capped_reference_sizes = Counter()
    affected = 0
    for artwork in manifest["ladder"]:
        if artwork["id"] not in contributing:
            continue
        reference = capped_reference(artwork, cap)
        if reference is None:
            continue
        if artwork["referenceLongEdgePx"] > cap:
            affected += 1
            capped_reference_sizes[reference["longEdgePx"]] += 1

    # A "resolution comparison" between a 332 px rung and a 333 px key is a codec control wearing
    # the wrong hat. It cannot arise in the headline column (keys there are >= 441 px and the next
    # rung down is ~333) but it does at the lower sensitivity settings, so it is counted openly.
    near_tie = [c for c in capped_primary
                if c["long_edge_px"] / c["reference_long_edge_px"] > 0.9]
    near_tie_by_refmin = {
        key: sum(1 for c in subset if c["long_edge_px"] / c["reference_long_edge_px"] > 0.9)
        for key, subset in capped_by_refmin.items()
    }

    in_sample = [a for a in manifest["ladder"] if a["inSample"]]
    document = {
        "what": "Resolution-ladder RE-SCORE against a viewing-plausible (640 px capped) answer "
                "key, beside the published largest-rendition key. Unrealized-ideas item 5.",
        "generated_by": "research/v3/oracle/ladder/analyze_capped.py",
        "generated_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
                        .isoformat(timespec="seconds").replace("+00:00", "Z"),
        "does_not_supersede": "research/v3/data/oracle-ladder/ladder-sample-1.analysis.json",
        "no_model_was_run": "Re-keying of stored answers only. Same rows, same model revision, "
                            "same prompt hash, zero new inferences.",
        "settings": {
            "agreement_floor": args.agreement_floor,
            "agreement_floor_status": "[UNCALIBRATED] — loose end A2, unchanged by this re-score",
            "min_bin_n": MIN_BIN_N,
            "cap_px": cap,
            "cap_provenance": "oracle/premise/common.py RESOLUTION_CAP_PX = 640, downscale-only",
            "published_reference_min_long_edge_px": REFERENCE_MIN_LONG_EDGE_PX,
            "capped_reference_min_long_edge_px": args.capped_reference_min,
            "capped_reference_min_is_a_deviation": args.capped_reference_min != REFERENCE_MIN_LONG_EDGE_PX,
            "capped_reference_min_rationale":
                "No artwork whose published reference exceeds 640 px owns a rendition in 500..640 "
                "(the 561-680 bin is structurally empty and the 441-560 band holds only ~483s), so "
                "the published 500 px rule would delete every capped artwork instead of restricting "
                "it. Reported at 500/441/300/0 under `capped_reference_min_sensitivity`.",
            "long_edge_bins": BIN_ORDER,
        },
        "health": health,
        "population": {
            "sampled_artworks": len(in_sample),
            "sampled_artworks_with_reference_above_cap": sum(
                1 for a in in_sample if a["referenceLongEdgePx"] > cap),
            "artworks_whose_key_moved": affected,
            "capped_reference_size_histogram": dict(sorted(capped_reference_sizes.items())),
            "published_primary_comparisons": len(published_primary),
            "capped_comparisons_all": len(capped_all),
            "capped_primary_comparisons": len(capped_primary),
            "capped_comparisons_by_reference_min": {k: len(v) for k, v in capped_by_refmin.items()},
            "published_codec_control_comparisons": len(published_control),
            "capped_codec_control_comparisons": len(capped_control),
            "matched_contrast_comparisons": len(matched),
            "sharded_pair_comparisons": len(pairs),
            "rungs_dropped_as_above_cap": sum(
                1 for c in ladder_all
                if c["long_edge_px"] > cap and not c["same_size_as_reference"]),
            "artworks_in_published_primary": len({c["artwork_id"] for c in published_primary}),
            "artworks_in_capped_primary": len({c["artwork_id"] for c in capped_primary}),
            "artworks_that_leave_the_analysis_under_the_cap": len(
                {c["artwork_id"] for c in published_primary} - {c["artwork_id"] for c in capped_all}),
            "artworks_that_leave_note":
                "Their only rendition at or below the cap is their smallest one (typically 147 px), "
                "so under the cap they own a key and no rung beneath it. They are unscoreable "
                "against a viewing-plausible key, which is a fact about the collection, not a "
                "result — the CDN gave them nothing between ~147 px and the original.",
            "near_tie_comparisons_in_headline_column": len(near_tie),
            "capped_primary_comparisons_excluding_near_ties": len(capped_strict),
            "near_tie_comparisons_by_reference_min": near_tie_by_refmin,
            "near_tie_definition": "rung/reference long-edge ratio > 0.9 — a size step too small "
                                   "to be a resolution measurement (e.g. a 332 px rung against a "
                                   "333 px key); reported so the low sensitivity settings are read "
                                   "with it in mind",
        },
        "floors_published_vs_capped": floors_table(published, capped),
        "per_question_published_key": published,
        "per_question_capped_key": capped,
        "per_question_capped_key_excluding_near_ties": capped_no_near_ties,
        "capped_reference_min_sensitivity": sensitivity,
        "odd_one_out_census": odd_one_out_census(manifest, answers, cap),
        "key_change_direction": key_change_direction(manifest, answers, cap),
        "floor_fragility": {
            question: {
                "published_key": floor_fragility(published[question], args.agreement_floor),
                "capped_key": floor_fragility(capped[question], args.agreement_floor),
            }
            for question in ALL_QUESTIONS
        },
        "notes": [
            "Column A is reproduced with analyze.py's own functions, so it must match "
            "ladder-sample-1.analysis.json exactly. If it does not, this file is wrong, not that one.",
            "The capped key is the CDN's own rendition near the cap, NOT the large file downscaled "
            "to the cap — that image was never inferred and inferring it needs a GPU. The size of "
            "that proxy error is the same-size codec control, reported in every block.",
            "Bins above the cap (681-900, 901-1400, 1401+) are absent from the capped column by "
            "construction: the pipeline cannot be shown those images.",
            "The 0.85 agreement floor remains [UNCALIBRATED] (loose end A2). This re-score changes "
            "the answer key, not the floor; every capped verdict moves with the floor exactly as "
            "every published verdict does.",
        ],
    }

    # -- column A must BE the published analysis, not merely resemble it ----------------------
    # This file's whole claim is "the only difference is the answer key". If column A ever drifts
    # from `ladder-sample-1.analysis.json`, the claim is false and the re-score is worthless, so
    # it fails loudly here rather than being discovered in a review.
    parity: dict[str, Any] = {"checked": False}
    published_path = DATA_DIR / "ladder-sample-1.analysis.json"
    if published_path.exists() and not args.no_verify_column_a:
        reference_document = json.loads(published_path.read_text())
        mismatches = []
        for question, block in reference_document.get("per_question", {}).items():
            mine = published.get(question)
            if mine is None:
                mismatches.append(f"{question}: missing from column A")
                continue
            for there, here in (("curve_vs_largest_rendition", "curve"),
                                ("pooled_primary", "pooled"),
                                ("codec_control_same_size", "codec_control_same_size"),
                                ("resolution_floor", "resolution_floor")):
                if block.get(there) != mine.get(here):
                    mismatches.append(f"{question}.{there}")
        if mismatches:
            raise SystemExit("column A does not reproduce the published analysis: "
                             + ", ".join(mismatches))
        parity = {"checked": True, "identical_to": str(published_path), "fields_compared":
                  ["curve", "pooled", "codec_control_same_size", "resolution_floor"],
                  "questions": sorted(reference_document.get("per_question", {}))}

    document["column_a_parity_with_published_analysis"] = parity

    out_path = args.out or (DATA_DIR / "ladder-sample-1.capped-reference.analysis.json")
    if out_path.name == "ladder-sample-1.analysis.json":
        raise SystemExit("refusing to overwrite the published analysis")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(document, indent="\t", sort_keys=False) + "\n")

    # -- console ------------------------------------------------------------------------------
    print(json.dumps(document["population"], indent="\t"))
    print("\n=== floors: published key -> capped key "
          f"(floor {args.agreement_floor}, capped ref >= {args.capped_reference_min}px)")
    for row in document["floors_published_vs_capped"]:
        print(f"  {row['question']:<18} "
              f"{str(row['published_unanswerable_below_px']):>5} px ({row['published_verdict']}) "
              f"-> {str(row['capped_unanswerable_below_px']):>5} px ({row['capped_verdict']})"
              f"{'   MOVED' if row['floor_moved'] else ''}")
    for question in ALL_QUESTIONS:
        print(f"\n--- {question}")
        for label, block in (("published", published[question]), ("capped", capped[question])):
            print(f"  {label:<9} pooled={block['pooled']} codec={block['codec_control_same_size']}")
            for name, point in block["curve"].items():
                thin = "  (thin)" if point["n"] < MIN_BIN_N else ""
                print(f"      {name:>10} px  n={point['n']:<5} agree={point['agreement']}{thin}")
        census = document["odd_one_out_census"][question]
        print(f"  odd-one-out: key_changed={census['key_changed']['agreement']} "
              f"({census['key_changed']['agree']}/{census['artworks_considered']})  "
              f"unanimous-below odd-one-out={census['odd_one_out_vs_unanimous_below']['agreement']}")
    print(f"\nwrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
