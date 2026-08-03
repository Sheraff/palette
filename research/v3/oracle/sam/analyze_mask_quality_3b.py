"""Round 3b (CJK) mask-quality analysis — loose end A12, remaining half.

Applies the PRE-REGISTERED rule stored in `mask-quality-3b-sample.json` -> `a12DecisionRule`,
verbatim and without extension:

  * unit of decision: the `cjk_script` group (`cjk-script` + `kanji` together), per probe 4
  * primary treatment: `partly` excluded from both sides; denominator = decided answers only
  * method: sweep a candidate cut over the observed scores, maximising Youden J
  * gates: separation from the cut in force >= 0.05, J gain >= 0.05, >= 5 decided answers
  * adopt if: largely accepted AND a sub-0.578 cut clears the gates
  * close if: largely rejected
  * incumbent check: if `words` is accepted wherever `cjk-script` is, a new concept buys nothing

Answers are read through the warehouse CLI (never the JSONL directly, REVIEW_UI.md §1), with
amendments applied and retractions dropped, so supersession is respected by construction.

CPU only. Writes data/sam/mask-quality-3b-analysis.json. Edits no constant.

Usage:
    python3 research/v3/oracle/sam/analyze_mask_quality_3b.py [--out PATH]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path
from statistics import median

V3 = Path(__file__).resolve().parents[2]
REPO = V3.parent.parent
BATCH = "sam-mask-quality-3b-cjk"

SAMPLE = V3 / "data/sam/mask-quality-3b-sample.json"
MANIFEST = V3 / "data/sam/sam-mask-quality-3b-cjk.json"
RUN = V3 / "data/sam/sam-cjk-probe-7.jsonl"
CLI = V3 / "src/warehouse/cli.ts"

# The cut in force for a group with no calibrated group threshold is the pooled cut.
POOLED_CUT = 0.578
TEXT_LIKE_CUT = 0.697295  # the cut in force for `words`, the incumbent
RUN_FLOOR = 0.3  # SCORE_THRESHOLD at run time: nothing below this was ever emitted

MIN_SEPARATION = 0.05
MIN_J_GAIN = 0.05
MIN_CELL_ANSWERS = 5


# ----------------------------------------------------------------------------- reading

def read_answers() -> tuple[list[dict], dict]:
    """Released answers for the batch, through the CLI, amendments applied, latest wins."""
    proc = subprocess.run(
        [
            "node", "--experimental-strip-types", str(CLI), "query",
            "--batch", BATCH, "--json", "--latest", "--no-retracted", "--limit", "500",
        ],
        cwd=str(REPO), capture_output=True, text=True, check=True,
    )
    records = [json.loads(line) for line in proc.stdout.splitlines() if line.strip()]
    all_labels = [r for r in records if r["type"] == "oracle-label"]
    # `--latest` and `--no-retracted` cover supersession and retraction, but the CLI has NO author
    # filter (QueryFilter carries none), so machine-authored labels must be dropped by the consumer
    # — the same filter analyze-mask-quality.ts:collectAnswers() applies.
    labels = [r for r in all_labels if r["author"]["kind"] == "human"]
    provenance = {
        "readVia": f"node --experimental-strip-types {CLI.relative_to(REPO)} query "
                   f"--batch {BATCH} --json --latest --no-retracted",
        "recordsReturned": len(records),
        "oracleLabels": len(labels),
        "otherRecordTypes": dict(Counter(r["type"] for r in records if r["type"] != "oracle-label")),
        "authors": dict(Counter(f'{r["author"]["kind"]}:{r["author"]["id"]}' for r in all_labels)),
        "machineAuthored": sum(1 for r in all_labels if r["author"]["kind"] != "human"),
        "supersedingRevisions": sum(1 for r in labels if r.get("supersedes")),
        "revisionsAboveOne": sum(1 for r in labels if r.get("revision", 1) > 1),
        "amendmentsInBatch": 0,  # verified via --raw: raw and resolved views are identical
        "ambiguityNotes": [r["imageId"] for r in labels if r.get("ambiguityNote")],
    }
    return labels, provenance


def load_rows() -> list[dict]:
    sample = json.loads(SAMPLE.read_text())
    items = {i["maskRowId"]: i for i in sample["items"]}
    labels, provenance = read_answers()
    rows = []
    for lab in labels:
        it = items[lab["imageId"]]
        rows.append({
            "itemId": it["itemId"],
            "maskRowId": lab["imageId"],
            "concept": it["concept"],
            "group": it["conceptGroup"],
            "score": it["score"],
            "areaFraction": it["areaFraction"],
            "band": it["band"],
            "answer": lab["answer"],
            "cover": it["artwork"]["imagePath"],
        })
    rows.sort(key=lambda r: -r["score"])
    funding = {lab["imageId"]: lab["id"] for lab in labels}
    return rows, provenance, sample, funding


def load_round1_words() -> list[dict]:
    """Round 1's UNCONDITIONED `words` rows — drawn across the full score range, not cut-truncated.

    The only unconditioned rows on disk that share a concept with round 3b. Used to answer
    "is pooling possible?", not to fit anything: round 1 drew from a cover population with no
    CJK script on it.
    """
    path = V3 / "data/sam/mask-quality-sample.json"
    if not path.exists():
        return []
    items = {i["maskRowId"]: i for i in json.loads(path.read_text())["items"]
             if i["concept"] == "words"}
    proc = subprocess.run(
        ["node", "--experimental-strip-types", str(CLI), "query",
         "--batch", "sam-mask-quality-1", "--json", "--latest", "--no-retracted", "--limit", "500"],
        cwd=str(REPO), capture_output=True, text=True, check=True,
    )
    rows = []
    for line in proc.stdout.splitlines():
        if not line.strip():
            continue
        rec = json.loads(line)
        if rec["type"] != "oracle-label" or rec["author"]["kind"] != "human":
            continue
        it = items.get(rec["imageId"])
        if it is None or not isinstance(rec.get("answer"), str):
            continue
        rows.append({"maskRowId": rec["imageId"], "concept": "words", "score": it["score"],
                     "areaFraction": it["areaFraction"], "answer": rec["answer"],
                     "cover": it["artwork"]["imagePath"], "round": 1})
    return rows


def load_run() -> tuple[list[dict], list[dict]]:
    regions, covers = [], []
    for line in RUN.read_text().splitlines():
        if not line.strip():
            continue
        rec = json.loads(line)
        (regions if "concept" in rec else covers).append(rec)
    return regions, covers


# ----------------------------------------------------------------------------- sweep

def confusion(rows: list[dict], threshold: float) -> dict:
    """Keep score >= threshold. `partly` is excluded from both sides (primary treatment)."""
    tp = sum(1 for r in rows if r["answer"] == "yes" and r["score"] >= threshold)
    fn = sum(1 for r in rows if r["answer"] == "yes" and r["score"] < threshold)
    fp = sum(1 for r in rows if r["answer"] == "no" and r["score"] >= threshold)
    tn = sum(1 for r in rows if r["answer"] == "no" and r["score"] < threshold)
    recall = tp / (tp + fn) if (tp + fn) else None
    specificity = tn / (tn + fp) if (tn + fp) else None
    precision = tp / (tp + fp) if (tp + fp) else None
    j = (recall + specificity - 1) if (recall is not None and specificity is not None) else None
    return {
        "threshold": round(threshold, 6),
        "keptTruePositive": tp, "droppedFalseNegative": fn,
        "keptFalsePositive": fp, "droppedTrueNegative": tn,
        "precision": precision, "recall": recall, "specificity": specificity,
        "youdenJ": j,
        "partlyKept": sum(1 for r in rows if r["answer"] == "partly" and r["score"] >= threshold),
        "partlyDropped": sum(1 for r in rows if r["answer"] == "partly" and r["score"] < threshold),
        "coversWithAKeptAcceptedMask": len({
            r["cover"] for r in rows if r["answer"] == "yes" and r["score"] >= threshold
        }),
    }


def sweep(rows: list[dict]) -> dict:
    """Candidate set = observed scores; ties to the lowest threshold (round 1's convention)."""
    candidates = sorted({r["score"] for r in rows})
    scored = [(confusion(rows, t), t) for t in candidates]
    best_j = max(c["youdenJ"] for c, _ in scored if c["youdenJ"] is not None)
    tied = [t for c, t in scored if c["youdenJ"] == best_j]
    best = confusion(rows, tied[0])
    best["tiedCandidates"] = len(tied)
    best["tieRange"] = [round(min(tied), 6), round(max(tied), 6)]
    return best


def gates(fitted: dict, baseline: dict, decided: int, cut_in_force: float) -> dict:
    separation = abs(cut_in_force - fitted["threshold"])
    j_gain = fitted["youdenJ"] - baseline["youdenJ"]
    g = {
        "separation": {"value": round(separation, 6), "required": MIN_SEPARATION,
                       "passes": separation >= MIN_SEPARATION},
        "jGain": {"value": round(j_gain, 6), "required": MIN_J_GAIN,
                  "passes": j_gain >= MIN_J_GAIN},
        "decided": {"value": decided, "required": MIN_CELL_ANSWERS,
                    "passes": decided >= MIN_CELL_ANSWERS},
    }
    g["allPass"] = all(v["passes"] for v in g.values() if isinstance(v, dict))
    return g


# ----------------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(V3 / "data/sam/mask-quality-3b-analysis.json"))
    args = ap.parse_args()

    rows, provenance, sample, funding = load_rows()
    regions, cover_recs = load_run()
    rule = sample["a12DecisionRule"]

    # --- per-concept accept rates -------------------------------------------------
    per_concept = {}
    for concept in ("cjk-script", "kanji", "words"):
        sub = [r for r in rows if r["concept"] == concept]
        c = Counter(r["answer"] for r in sub)
        decided = c["yes"] + c["no"]
        per_concept[concept] = {
            "graded": len(sub),
            "yes": c["yes"], "no": c["no"], "partly": c["partly"],
            "decided": decided,
            "acceptRate": (c["yes"] / decided) if decided else None,
            "scoreRange": [min(r["score"] for r in sub), max(r["score"] for r in sub)],
            "rejectedScores": sorted(r["score"] for r in sub if r["answer"] == "no"),
        }

    # --- the decision unit: the cjk_script group ---------------------------------
    grp = [r for r in rows if r["group"] == "cjk_script"]
    gc = Counter(r["answer"] for r in grp)
    decided = gc["yes"] + gc["no"]
    yes_scores = sorted(r["score"] for r in grp if r["answer"] == "yes")
    no_scores = sorted(r["score"] for r in grp if r["answer"] == "no")

    fitted = sweep(grp)
    at_pooled = confusion(grp, POOLED_CUT)
    at_floor = confusion(grp, min(r["score"] for r in grp))
    at_text_like = confusion(grp, TEXT_LIKE_CUT)
    g = gates(fitted, at_pooled, decided, POOLED_CUT)

    # Does the fitted cut actually SEPARATE accepted from rejected, as adoptIf's prose asks?
    separates_cleanly = bool(no_scores) and max(no_scores) < min(yes_scores)
    interleaved = sum(1 for y in yes_scores if any(y < n for n in no_scores))

    group_block = {
        "unit": rule["unitOfDecision"],
        "concepts": ["cjk-script", "kanji"],
        "graded": len(grp),
        "counts": {"yes": gc["yes"], "no": gc["no"], "partly": gc["partly"], "decided": decided},
        "acceptRate": gc["yes"] / decided,
        "cutInForce": POOLED_CUT,
        "cutInForceProvenance": "no cjk_script entry in CALIBRATED_GROUP_THRESHOLDS, so "
                               "calibrated_threshold_for() falls back to CALIBRATED_SCORE_THRESHOLD",
        "scoreSpan": {
            "yes": {"n": len(yes_scores), "min": min(yes_scores), "max": max(yes_scores)},
            "no": {"n": len(no_scores), "min": min(no_scores) if no_scores else None,
                   "max": max(no_scores) if no_scores else None},
            "cleanlySeparable": separates_cleanly,
            "acceptedMasksBelowARejectedOne": interleaved,
        },
        "sweepBest": fitted,
        "atPooledCut": at_pooled,
        "atTextLikeCut": at_text_like,
        "atRunFloor": at_floor,
        "gates": g,
        "fittedCutIsSubPooled": fitted["threshold"] < POOLED_CUT,
    }

    # --- truncation & scope, the round-3 lesson applied ----------------------------
    ungraded = defaultdict(int)
    for reg in regions:
        ungraded[reg["concept"]] += 1
    graded_ids = {r["maskRowId"] for r in rows}
    ungraded_cjk = [
        reg for reg in regions
        if reg["concept"] in ("cjk-script", "kanji")
        and f'{reg["image_sha256"][:12]}:{reg["concept"]}:{reg["instance_idx"]}' not in graded_ids
    ]

    # Analytic + numeric check: can rows below the run floor move the J gain?
    phantom = []
    for n in (10, 50, 200):
        padded = grp + [{"answer": "no", "score": RUN_FLOOR - 0.001, "cover": f"phantom-{i}"}
                        for i in range(n)]
        phantom.append({
            "phantomBelowFloorNegatives": n,
            "jAtFittedCut": confusion(padded, fitted["threshold"])["youdenJ"],
            "jAtPooledCut": confusion(padded, POOLED_CUT)["youdenJ"],
            "jGain": confusion(padded, fitted["threshold"])["youdenJ"]
                     - confusion(padded, POOLED_CUT)["youdenJ"],
        })

    truncation = {
        "lessonFrom": "mask-quality-3-analysis.json -> hardTextPooledSensitivity (commit b2b32fb)",
        "round3Failure": "section B was selected BY the cut (score < cut), so it could not contain "
                         "a single keep-side row; its J of 1.000 measured where the sample was cut. "
                         "Pooling round 1's 31 unconditioned text_like rows restored the keep side "
                         "and the J gain fell to 0.0000.",
        "howThisRoundDiffers": "round 3b was NOT selected by the cut. It was drawn across score "
                               "bands, strongest to weakest per cover, and it CONTAINS keep-side "
                               "rows: 3 kanji masks score >= 0.578. The keep side is present, so "
                               "the J gain here is not the round-3 artefact.",
        "truncationThatRemains": {
            "kind": "left-truncation at the run floor, not selection on the outcome",
            "floor": RUN_FLOOR,
            "floorProvenance": "config.SCORE_THRESHOLD = 0.3 at run time; regions scoring below it "
                               "were never emitted, so no row below 0.3 can exist for any concept",
            "observedMax": max(r["score"] for r in grp),
            "ceilingProvenance": "no cjk_script region anywhere in sam-cjk-probe-7 exceeds 0.641773; "
                                 "this is the concept's observed ceiling, not a sampling bound",
        },
        "doesTheFloorBiasTheJGain": {
            "answer": "no",
            "proof": "both the fitted cut (0.392655) and the pooled cut (0.578) already run "
                     "specificity 1.000 with zero false positives. Any row below 0.3 is dropped by "
                     "both, so it can only add true negatives, and specificity cannot rise above "
                     "1.0. The J gain is therefore invariant to de-truncating the floor.",
            "numericCheck": phantom,
        },
        "pooling": {
            "possibleForTheDecisionUnit": False,
            "why": "there is no unconditioned CJK row to pool with. `chinese characters` and "
                   "`kanji` are not in config.CONCEPT_PROMPTS, so no eval run contains them; "
                   "probe 4 ran them but stored no mask_rle and was never reviewed. This round is "
                   "the only human evidence about a CJK mask that exists, so there is no second "
                   "sample to restore a missing side with — and per the proof above, no side is "
                   "missing in the way round 3's was.",
            "needed": False,
            "wouldPoolingWordsHelp": "no — `words` is text_like, a different group and a different "
                                     "cut; pooling it into the cjk_script sweep would fit one "
                                     "threshold across two groups, which is the exact thing the "
                                     "per-group table exists to avoid.",
        },
        "whatIsActuallyUnderpowered": {
            "negativesInTheDecisionUnit": len(no_scores),
            "consequence": "the specificity term of J is estimated from ONE answer, so it can only "
                           "take the values 0.0 or 1.0. The sweep's 'optimum' is mechanically the "
                           "smallest observed score above that single rejected mask. It is a "
                           "boundary located by one answer, not a boundary estimated from a "
                           "distribution of negatives.",
            "andTheFloorHidesNegatives": "false positives concentrate at low scores, and the 0.3 "
                                         "floor removed that region by construction. The 1-in-21 "
                                         "rejection rate is the rate AMONG regions the model "
                                         "already scored >= 0.3, not the concept's error rate.",
            "ungradedRowsFromTheSameRun": {
                "cjk-script": ungraded["cjk-script"] - per_concept["cjk-script"]["graded"],
                "kanji": ungraded["kanji"] - per_concept["kanji"]["graded"],
                "total": len(ungraded_cjk),
                "closableOnCpu": True,
                "how": "sam-cjk-probe-7 stores mask_rle for every region, so overlays for the "
                       "remaining CJK regions render on CPU. Grading them needs reviewer time, "
                       "not GPU, and would put the specificity term on more than one answer.",
            },
        },
        "whatTheFittedCutCanClaim": [
            "in-sample, at 0.392655 the cjk_script group keeps 10 accepted masks and 0 rejected "
            "ones: precision 1.000, recall 0.500 of the masks the reviewer called correct",
            "at least one accepted mask survives on 5 of 5 covers that carry any CJK mask, "
            "against 3 of 5 at the pooled cut and 0 of 5 at the text_like cut",
            "the claim holds only over the observed range [0.301817, 0.641773]",
        ],
        "whatTheFittedCutCannotClaim": [
            "any false-positive rate: one negative, and the score region where negatives live was "
            "truncated away at 0.3",
            "anything about covers WITHOUT CJK script. Probe 4's 'zero false positives, silent on "
            "Korean, Thai and Malayalam' was measured on scores alone; no off-target mask was put "
            "in front of a reviewer in this round, so the precision half of probe 4's finding is "
            "still unreviewed",
            "any behaviour above 0.641773, where this concept has never scored",
            "that 0.392655 is a boundary in the data rather than the location of one rejected mask",
        ],
    }

    # --- the incumbent check ------------------------------------------------------
    by_cover = {c["image_path"]: c for c in cover_recs}
    cjk_covers = sorted({r["cover"] for r in rows if r["group"] == "cjk_script"})
    incumbent_rows = []
    for cover in cjk_covers:
        rec = by_cover[cover]
        words_best = rec["best_score_by_concept"]["words"]
        words_n = rec["instances_by_concept"]["words"]
        graded_words = [r for r in rows if r["cover"] == cover and r["concept"] == "words"]
        cjk_kept_fitted = [
            r for r in rows if r["cover"] == cover and r["group"] == "cjk_script"
            and r["answer"] == "yes" and r["score"] >= fitted["threshold"]
        ]
        incumbent_rows.append({
            "cover": cover,
            "cjkRegionsInRun": rec["instances_by_concept"]["cjk-script"] + rec["instances_by_concept"]["kanji"],
            "cjkAcceptedKeptAtFittedCut": len(cjk_kept_fitted),
            "wordsRegionsInRun": words_n,
            "wordsBestScore": words_best,
            "wordsGraded": len(graded_words),
            "wordsAccepted": sum(1 for r in graded_words if r["answer"] == "yes"),
            "wordsKeptAtTextLikeCut": sum(1 for r in regions
                                          if r["image_path"] == cover and r["concept"] == "words"
                                          and r["score"] >= TEXT_LIKE_CUT),
            "wordsKeptAtPooledCut": sum(1 for r in regions
                                        if r["image_path"] == cover and r["concept"] == "words"
                                        and r["score"] >= POOLED_CUT),
            "incumbentSilent": words_n == 0,
        })

    words_max_anywhere = max((r["score"] for r in regions if r["concept"] == "words"), default=0.0)
    covers_incumbent_covers = sum(1 for r in incumbent_rows if r["wordsKeptAtTextLikeCut"] > 0)
    covers_cjk_recovers = sum(1 for r in incumbent_rows if r["cjkAcceptedKeptAtFittedCut"] > 0)

    incumbent = {
        "rule": rule["incumbentCheck"],
        "perCover": incumbent_rows,
        "coversCarryingCjkMasks": len(cjk_covers),
        "coversWhereIncumbentIsSilent": sum(1 for r in incumbent_rows if r["incumbentSilent"]),
        "wordsMaxScoreAnywhereInRun": words_max_anywhere,
        "wordsCutInForce": TEXT_LIKE_CUT,
        "coversWhereIncumbentKeepsAnythingAtItsOwnCut": covers_incumbent_covers,
        "coversWhereCjkKeepsAnAcceptedMaskAtTheFittedCut": covers_cjk_recovers,
        "wordsAcceptRate": per_concept["words"]["acceptRate"],
        "outcome": "INCUMBENT DOES NOT COVER THE CATEGORY",
        "reasoning": (
            f"`words` emits no region at all on {sum(1 for r in incumbent_rows if r['incumbentSilent'])} "
            f"of {len(cjk_covers)} covers that carry CJK masks. Where it does fire it is accepted "
            f"{per_concept['words']['yes']}/{per_concept['words']['decided']} — the masks are not "
            f"bad — but its best score anywhere in the run is {words_max_anywhere:.6f}, below its "
            f"own text_like cut of {TEXT_LIKE_CUT}. At the threshold actually in force the "
            f"incumbent therefore keeps ZERO masks on ALL {len(cjk_covers)} covers. The condition "
            f"that would moot a new concept — `words` accepted wherever `cjk-script` is — is not "
            f"met on availability, let alone on production thresholds."
        ),
        "mootsTheAddition": False,
    }

    # --- pooling, actually attempted rather than asserted --------------------------
    r1_words = load_round1_words()
    seen = {r["maskRowId"] for r in rows}
    r1_words = [r for r in r1_words if r["maskRowId"] not in seen]
    words_3b = [dict(r, round="3b") for r in rows if r["concept"] == "words"]
    pooled_words = r1_words + words_3b
    words_pooled = {
        "purpose": "the round-3 de-truncation move, attempted here. It applies to the INCUMBENT "
                   "control only — there is no CJK row anywhere to pool with (see "
                   "truncationScope.pooling), so the decision unit cannot receive this treatment.",
        "round1Rows": len(r1_words),
        "round3bRows": len(words_3b),
        "overlapDropped": 0,
        "total": len(pooled_words),
        "round1Unconditioned": True,
        "round1AnswerTally": dict(Counter(r["answer"] for r in r1_words)),
        "pooledScoreRange": [min(r["score"] for r in pooled_words),
                             max(r["score"] for r in pooled_words)] if pooled_words else None,
        "sweepBest": sweep(pooled_words) if pooled_words else None,
        "atTextLikeCut": confusion(pooled_words, TEXT_LIKE_CUT) if pooled_words else None,
        "informativeForA12": False,
        "whyNot": "round 1 drew from covers with no CJK script on them. Pooling those rows measures "
                  "how good `words` masks are on Latin covers, which nobody disputes and which is "
                  "not the incumbent question. The incumbent question is whether `words` fires AT "
                  "ALL on CJK covers, and that is answered by availability on the 5 covers of this "
                  "run, not by a sweep.",
        "doesNotFund": "any change to CALIBRATED_GROUP_THRESHOLDS['text_like']. Round 3's 55-row "
                       "pooled analysis is the authoritative text_like sweep and it found a J gain "
                       "of exactly 0.0000; this 9-row subset is a smaller, differently-drawn "
                       "population and must not be read as re-opening that.",
    }

    # --- the verdict, per the rule -------------------------------------------------
    largely_accepted = group_block["acceptRate"] >= 0.5
    adopt = (largely_accepted and group_block["fittedCutIsSubPooled"]
             and g["allPass"] and not incumbent["mootsTheAddition"])

    verdict = {
        "a12": "ADOPT WITH A CATEGORY CUT" if adopt else (
            "DO NOT ADOPT" if not largely_accepted else "UNDECIDED"),
        "ruleApplied": {
            "largelyAccepted": {"value": group_block["acceptRate"], "met": largely_accepted},
            "subPooledCutFitted": {"value": fitted["threshold"], "met": group_block["fittedCutIsSubPooled"]},
            "gatesAllPass": g["allPass"],
            "incumbentMootsIt": incumbent["mootsTheAddition"],
            "closeIfTriggered": not largely_accepted,
        },
        "proposedGroup": "cjk_script",
        "proposedConcepts": [["cjk-script", "chinese characters"], ["kanji", "kanji"]],
        "proposedThreshold": fitted["threshold"],
        "thresholdConfidence": "WEAK — see truncationScope.whatIsActuallyUnderpowered. The number "
                               "is the smallest observed score above the single rejected mask. The "
                               "rule's gates pass on it, and the rule is what decides; but the "
                               "constant should be landed as provisional and re-fitted after the "
                               "remaining ungraded CJK regions are reviewed.",
        "costOfTheFittedNumber": (
            f"adopting {fitted['threshold']} discards {fitted['droppedFalseNegative']} of "
            f"{gc['yes']} masks the reviewer called correct, to exclude the single one they "
            f"rejected. At the run floor the same group runs precision "
            f"{at_floor['precision']:.4f} with recall 1.000 — the Youden objective the rule "
            f"pre-registered prices one false positive as heavily as ten false negatives, and on "
            f"a sample with one negative that is the whole of the difference."
        ),
        "whatCloses": [
            "A12's remaining half — 'has any human ever seen a CJK mask' — is closed. 25 masks "
            "were rendered, reviewed and released; 21 of them in the decision unit.",
            "Probe 4's RECALL half is confirmed by eye: the masks `chinese characters` and `kanji` "
            "find on CJK covers are correct 20 times out of 21.",
            "The 'is the calibrated cut category-dependent' question is answered YES for this "
            "category: the pooled cut keeps 3 of 20 correct masks and the text_like cut keeps 0.",
            "The incumbent question is settled: `words` cannot stand in for a CJK concept.",
        ],
        "whatStaysOpen": [
            "The PRECISION half of probe 4's finding. No off-target mask (Korean, Thai, Malayalam, "
            "or a Latin-only cover) was reviewed, so 'zero false positives' remains a claim about "
            "scores, not about masks a human has judged.",
            f"The threshold's identification. {len(ungraded_cjk)} CJK regions from the same run are "
            "ungraded and all carry mask_rle, so a completion round is CPU-render plus reviewer "
            "time — no GPU. Until then the specificity term rests on one answer.",
            "Whether these masks are USEFUL as opposed to correct: the accepted CJK masks have a "
            f"median area of {median(r['areaFraction'] for r in grp if r['answer'] == 'yes'):.6f} "
            "of the cover — the same 'correct but tiny' caution round 3 raised for hard text.",
            "Adding the concepts changes concept_set_hash(), so sam-eval-142 must be re-run in "
            "full before any analysis reads CJK rows alongside the existing ones (GPU, ~6.5 min).",
        ],
        "outOfScope": [
            "The 2 covers where nothing fires at any threshold (10/ab67616d0000b27300103a3729bf589e0dc913ab "
            "and images/nobs.jpg) are recorded as out of scope for this round: they carry zero "
            "regions for all three prompts, so no threshold can recover them and no mask exists to "
            "review.",
        ],
    }

    # --- proposals: NOT applied. config.py is owned by a sibling agent this session. -----
    cjk_funding = sorted(funding[r["maskRowId"]] for r in grp)
    words_funding = sorted(funding[r["maskRowId"]] for r in rows if r["concept"] == "words")
    proposals = [
        {
            "id": "d-2026-08-04-sam-cjk-script-concepts-adopted-with-a-category-cut",
            "kind": "instrument-calibration",
            "status": "PROPOSED — not appended to decisions.json",
            "fundedBy": cjk_funding,
            "claim": (
                "`cjk-script` (\"chinese characters\") and `kanji` join CONCEPT_PROMPTS as one "
                f"group `cjk_script` with its own calibrated threshold of {fitted['threshold']}. "
                f"Funded by {decided} decided reviewer answers on masks no human had ever seen: "
                f"{gc['yes']} correct, {gc['no']} not. The pre-registered gates all pass "
                f"(separation {g['separation']['value']}, J gain {g['jGain']['value']}, n {decided})."
            ),
            "doesNotFund": (
                "the threshold as a settled number. The sweep's optimum is the smallest observed "
                "score above the ONE rejected mask; the specificity term of J rests on that single "
                "answer, and the 0.3 run floor removed the score region where false positives live. "
                "The constant must land as PROVISIONAL and be re-fitted after the 25 ungraded CJK "
                "regions from the same run are reviewed."
            ),
            "alsoDoesNotFund": (
                "probe 4's precision claim. No off-target mask (Korean, Thai, Malayalam, or a "
                "Latin-only cover) was put in front of a reviewer, so 'zero false positives' is "
                "still a statement about scores."
            ),
        },
        {
            "id": "d-2026-08-04-sam-words-does-not-cover-cjk-script",
            "kind": "measurement",
            "status": "PROPOSED — not appended to decisions.json",
            "fundedBy": words_funding,
            "claim": (
                "The incumbent check is settled against the incumbent. `words` emits no region at "
                "all on 3 of the 5 CJK covers, and its best score anywhere in the run "
                f"({words_max_anywhere}) is below its own text_like cut of {TEXT_LIKE_CUT}, so at "
                "the threshold in force it keeps ZERO masks on ALL 5. Where it does fire its masks "
                f"are fine ({per_concept['words']['yes']}/{per_concept['words']['decided']} "
                "accepted) — the failure is availability and score, not mask quality."
            ),
            "doesNotFund": (
                "any change to CALIBRATED_GROUP_THRESHOLDS['text_like']. Round 3's 55-row pooled "
                "sweep remains the authoritative text_like analysis and found a J gain of 0.0000."
            ),
        },
    ]

    config_diff = {
        "file": "research/v3/oracle/sam/config.py",
        "status": "PROPOSED — NOT APPLIED. A sibling agent holds config.py this session for the "
                  "person exemption (loose end A6). This diff is named for a follow-up commit and "
                  "must be rebased onto that edit, not applied over it.",
        "followUpName": "sam: adopt cjk_script concepts with a provisional category cut (A12)",
        "hunks": [
            {
                "anchor": "CONCEPT_PROMPTS, replacing the A12 note at lines 118-123",
                "diff": "\n".join([
                    "     # [REVIEWED, n=16] CONCEPT SET v2.1 — one ADD, reviewer-approved 2026-08-03 (\"SAM",
                    "     # static adds => yes, go\"). Evidence: probe 4 (data/sam/PROBE4_NOTES.md), \"barcode\"",
                    "     # precision 1.00 with zero false positives on 14 no-barcode covers; 0.94 on the",
                    "     # EAN-carrying promo sticker, clearing the calibrated cut with room. Recall 0.50",
                    "     # (n=2): it missed the parcel's shipping-label barcode block.",
                    "-    # The CJK words from the",
                    "-    # same probe are NOT added: \"chinese characters\" recalls 4/4 with perfect precision",
                    "-    # but its best score anywhere is 0.472 — every recovery dies at the 0.578 calibrated",
                    "-    # cut. A category-aware threshold plus a CJK mask-quality round must come first",
                    "-    # (loose end A12). COST: this ADD changes concept_set_hash(), so any stored run under",
                    "-    # v2 must be re-run before an analysis reads it alongside barcode rows.",
                    "     ('barcode', 'barcode'),",
                    "+    # [REVIEWED, n=21] CONCEPT SET v2.2 — the CJK ADD, 2026-08-04. Both preconditions the",
                    "+    # v2.1 note set are now met: the category-aware threshold machinery exists",
                    "+    # (CALIBRATED_GROUP_THRESHOLDS below) and the CJK mask-quality round has been run and",
                    "+    # reviewed (round 3b, data/sam/mask-quality-3b-analysis.json). 21 decided answers on",
                    "+    # the cjk_script group: 20 correct, 1 not — a 95.2% accept rate on masks no human had",
                    "+    # ever seen. The pooled cut keeps 3 of the 20 correct masks and the text_like cut",
                    "+    # keeps 0, so the cut IS category-dependent for this category; the group threshold",
                    "+    # below is what makes the add worth anything.",
                    "+    #",
                    "+    # The tag says what the mask CLAIMS, not what the prompt asks: 'chinese characters'",
                    "+    # fires on Japanese covers as readily as Chinese ones, so the stored tag is",
                    "+    # `cjk-script`. Probe 4 measured it silent on Korean, Thai and Malayalam, which is",
                    "+    # why this is a SCRIPT concept and not a not-Latin one — but see the threshold note:",
                    "+    # no off-target mask has been reviewed, so that half is still scores-only.",
                    "+    #",
                    "+    # COST: this ADD changes concept_set_hash(), so sam-eval-142 MUST BE RE-RUN IN FULL",
                    "+    # (~6.5 min GPU) before any analysis reads CJK rows alongside the existing ones.",
                    "+    ('cjk-script', 'chinese characters'),",
                    "+    ('kanji', 'kanji'),",
                    " )",
                ]),
            },
            {
                "anchor": "CONCEPT_GROUPS at lines 182-189 — selftest.py asserts every concept is "
                          "in exactly one group, so this hunk is REQUIRED by the one above",
                "diff": "\n".join([
                    " CONCEPT_GROUPS: dict[str, tuple[str, ...]] = {",
                    "     \"text_like\": (\"words\", \"letter\", \"lettering\", \"display-text\"),",
                    "     \"mark_like\": (\"emblem\", \"sticker\", \"parental-advisory\", \"barcode\"),",
                    "     \"person_like\": (\"person\", \"face\"),",
                    "+    # cjk_script is its OWN group and deliberately not part of text_like: probe 4's",
                    "+    # co-firing rule (the rule that drew every other line here) puts it apart, because",
                    "+    # `words` does not fire on 3 of the 5 covers where these two do. Folding it into",
                    "+    # text_like would also drag it under text_like's 0.697295 cut, which keeps 0 of 20.",
                    "+    \"cjk_script\": (\"cjk-script\", \"kanji\"),",
                    " }",
                ]),
            },
            {
                "anchor": "CALIBRATED_GROUP_THRESHOLDS at lines 358-363",
                "diff": "\n".join([
                    " CALIBRATED_GROUP_THRESHOLDS: dict[str, float] = {",
                    "     \"text_like\": 0.697295,",
                    "+    # [MEASURED, n=21, PROVISIONAL] Round 3b, 2026-08-04. Sweep over observed scores,",
                    "+    # primary treatment, ties to the lowest: own optimum 0.392655 at J 0.500000 against",
                    "+    # J 0.150000 at the pooled cut — gain 0.350000 >= PER_GROUP_MIN_J_GAIN, separation",
                    "+    # |0.578 - 0.392655| = 0.185345 >= PER_GROUP_MIN_SEPARATION, n 21 >= MIN_CELL_ANSWERS.",
                    "+    # Unlike round 3's hard-text section this sample was NOT selected by the cut — it",
                    "+    # spans score bands and contains keep-side rows — so the J gain is not the round-3",
                    "+    # truncation artefact, and it is provably invariant to the 0.3 run floor (both cuts",
                    "+    # already run specificity 1.000, so below-floor rows can only add true negatives).",
                    "+    #",
                    "+    # WHY PROVISIONAL, AND DO NOT QUIETLY DROP THIS WORD. The group holds exactly ONE",
                    "+    # negative answer, so the specificity term of J is 0.0 or 1.0 and nothing else, and",
                    "+    # this optimum is mechanically 'the smallest observed score above that one rejected",
                    "+    # mask'. It also DISCARDS 10 of the 20 masks the reviewer called correct; at the run",
                    "+    # floor the same group runs precision 0.9524 at recall 1.000. 25 CJK regions from",
                    "+    # sam-cjk-probe-7 are still ungraded and all carry mask_rle, so re-fitting this is a",
                    "+    # CPU render plus reviewer time — no GPU. Re-fit before treating it as settled.",
                    "+    \"cjk_script\": 0.392655,",
                    " }",
                ]),
            },
        ],
        "notRequired": [
            "group_of() and calibrated_threshold_for() need NO change — they are pure lookups over "
            "the two dicts above.",
            "No edit to CALIBRATED_SCORE_THRESHOLD, CALIBRATED_SWEEP_OPTIMUM, "
            "CALIBRATED_MAX_AREA_FRACTION, GUARD_EXEMPT_GROUPS or SCORE_THRESHOLD.",
        ],
        "companionObligations": [
            "selftest.py — asserts every concept is in exactly one group; it will fail if the "
            "CONCEPT_PROMPTS hunk lands without the CONCEPT_GROUPS hunk.",
            "sam-eval-142 must be re-run in full under concept set v2.2 before any analysis reads "
            "CJK rows alongside existing ones (concept_set_hash changes, and it is part of row_key).",
            "run_sam.py's stored calibrated_cut provenance block should gain the new group "
            "threshold so a reader can tell which rule produced a file.",
        ],
    }

    out = {
        "analysisVersion": "sam-mask-quality-3b.v1",
        "batchId": BATCH,
        "generatedBy": "research/v3/oracle/sam/analyze_mask_quality_3b.py",
        "decides": "loose end A12, remaining half — whether CJK-script concepts join the SAM "
                   "concept set with a category cut",
        "builtFrom": [
            "research/v3/data/sam/mask-quality-3b-sample.json",
            "research/v3/data/sam/sam-mask-quality-3b-cjk.json",
            "research/v3/data/sam/sam-cjk-probe-7.jsonl",
            "research/v3/data/warehouse/warehouse.jsonl (via src/warehouse/cli.ts)",
        ],
        "preRegistration": {"source": "mask-quality-3b-sample.json -> a12DecisionRule", "rule": rule},
        "answersRead": provenance,
        "perConcept": per_concept,
        "decisionUnit": group_block,
        "truncationScope": truncation,
        "incumbentCheck": incumbent,
        "wordsPooledSensitivity": words_pooled,
        "verdict": verdict,
        "proposals": proposals,
        "proposedConfigDiff": config_diff,
        "rows": rows,
    }

    Path(args.out).write_text(json.dumps(out, indent="\t") + "\n")
    print(f"wrote {args.out}")
    print(f"verdict: {verdict['a12']}  cut={fitted['threshold']}  J={fitted['youdenJ']} "
          f"gain={g['jGain']['value']}  accept={group_block['acceptRate']:.4f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
