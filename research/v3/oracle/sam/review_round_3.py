"""Build mask-quality round 3: the area guard (loose end A6) and hard-to-read text (A12).

    .venv/bin/python review_round_3.py                    # report the composition, write nothing
    .venv/bin/python review_round_3.py --write            # write the manifest and the overlays
    .venv/bin/python review_round_3.py --run other-stem   # read a differently-named run

CPU only. This script never loads a model and never touches the GPU. It reads a finished run that
is already on disk and renders panels from its stored RLEs.

Why this round exists
---------------------
Two loose ends were left open by rounds 1 and 2, and both are open for the same structural reason:
**the thing the decision rests on was never put in front of a human.**

  A6 — the area guard. `config.CALIBRATED_MAX_AREA_FRACTION = 0.5` rejects any region covering more
  than half the cover. It was calibrated on round 1's 60 masks, of which 5 had area > 0.5 and the
  reviewer rejected 5 of 5 — but those five are 3 `sticker`, 1 `emblem` and 1 `face`, and contain
  **no `person`**. Corpus-wide the guard's effect is almost entirely on `person`: of the 6 regions it
  removes that would otherwise clear the score cut, **5 are `person`**. The reviewer's own instinct on
  reading that was *"it wouldn't be too surprising to have 90% of the image be 'a face' or 'a car'"*.
  A person filling most of a cover is an ordinary artwork. So the guard may be deleting correct masks
  on a concept its calibration never tested, and the pending refinement is **per-concept-group
  scoping** — keep the guard for marks and text, exempt subjects. This round shows the reviewer every
  big-area mask in the run and asks the question that decision actually needs.

  A12 — CJK / small hard text. `chinese characters` recalls 4/4 CJK covers with zero false positives
  and tops out at **0.472**, below the pooled cut of 0.578 and far below `text_like`'s group cut of
  0.697295, so every recovery dies. The residual experiment then found an **11-cover class** whose
  text has nothing above the pooled cut either, of which CJK is one member among rotated type,
  hairline type and incidental scene text. A category-aware cut cannot be calibrated from masks
  nobody has graded, so this round shows the **below-cut** masks — the ones the current thresholds
  throw away — and asks whether they are correct.

What is deliberately NOT here
-----------------------------
The CJK-prompt masks themselves. `chinese characters` and `kanji` are not in `CONCEPT_PROMPTS`, so
no eval run contains them, and probe 4's rows store only `score`/`bbox`/`area_fraction` — **no
mask RLE** — so they cannot be rendered from anything on disk. Two of probe 4's four CJK covers are
not in the eval set at all. Closing that gap needs a small GPU run; it is specified in the round
report and in ROUND_3_GPU_GAP below, and is not attempted here.

Outputs
-------
  * `research/v3/data/sam/mask-quality-3-sample.json` — the manifest, in the shape round 1 wrote, so
    `buildSamMaskQualityFixture({ samplePath })` reads its `items` unchanged. Server-side and
    analysis-side only: it holds the scores, the areas and the roles that the answers are joined
    against, and nothing derived from it may reach the browser.
  * `research/v3/data/sam/review-overlays-3/<itemId>.png` — one panel per mask, rendered by
    `review_round.render_overlay` (the two-panel, three-layer format the reviewer knows), in its own
    directory so rounds 1 and 2 cannot be overwritten.

The guard section reuses the SAME overlay files as the big-area mask items: it is the same pixels
being asked a second, different question, and re-rendering identical bytes under a second name would
only invite the two to drift.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path

import common
import config
import review_round as rr

# --------------------------------------------------------------------------------- identity

# [REVIEWED] Named for what it decides, not for its position — the same convention round 2 adopted
# so that a fourth round is never ambiguous with it.
BATCH_ID = "sam-mask-quality-3-area-guard-and-hard-text"

# [REVIEWED] The run this round reads, and the ONLY one it needs.
#
# The task asked for big-area masks "across the runs" (`sam-eval-142-v2` and `sam-eval-142-v3-dynamic`).
# Measured: v2's big-area set is a strict SUBSET of v3-dynamic's, at both thresholds — 10 of 12 at
# area > 0.5 and 12 of 15 at area > 0.4, with identical scores and areas, and zero masks unique to v2.
# v3-dynamic adds `barcode` (concept set v2.1) and the `dyn-*` regions, and nothing else moves,
# because `predict_multi` shares one backbone pass and applies NMS per prompt (RESIDUAL_EXPERIMENT_NOTES
# §4 verified 137 of 140 covers byte-identical, 3 differing only by `barcode`, 0 perturbed).
#
# Decisive on top of that: v3-dynamic's `concept_set_hash` EQUALS the current config's, and v2's does
# not (it predates the v2.1 `barcode` add). Building a human round on the stale run would stratify by
# the current groups over rows that were never asked the current questions — exactly what
# `check_run_concept_set` refuses. So the union is v3-dynamic's set, and reading one in-step run is
# both simpler and more defensible than merging two.
SOURCE_RUN = "sam-eval-142-v3-dynamic"

MANIFEST_PATH = config.DATA_DIR / "mask-quality-3-sample.json"
OVERLAY_DIR = config.DATA_DIR / "review-overlays-3"

# [UNCALIBRATED] Seed for every ordering choice here. Fixed so the sample is reproducible; distinct
# from rounds 1 and 2 so tie-breaks are not correlated across rounds.
SEED = 20260805

# --------------------------------------------------------------------------------- section A: the guard

# [REVIEWED] The guard itself. Not re-derived: this is the constant under test, read from config so
# the round cannot drift from the thing it is about.
GUARD_AREA_FRACTION = config.CALIBRATED_MAX_AREA_FRACTION

# [REVIEWED] How far below the guard to reach for context. The guard decision is about a boundary,
# and a boundary judged only from one side is judged with no sense of where it sits: if the reviewer
# calls a 0.52-area person a real subject and a 0.46-area person a real subject too, the answer is
# "this concept fills frames", not "0.5 is the wrong number". These items are context and are marked
# as such; they are never counted in the exemption arithmetic below.
CONTEXT_MIN_AREA_FRACTION = 0.4

ROLE_OVER_GUARD = "over-guard"
ROLE_NEAR_GUARD = "near-guard-context"

# --------------------------------------------------------------------------------- section B: hard text

# [MEASURED, n=11] The A12 class, recomputed from `data/sam/residual-isolation-analysis.json`: the
# covers the VLM says carry text, on which NO `text_like` mask survives the pooled cut of 0.578 —
# `text_below_cut` AND NOT `text_gap_recoverable_at_pooled_cut`. 26 covers carry the text gap, 15 are
# recoverable by lowering `text_like` back to the pooled cut, and these 11 are the ones where no
# threshold in force helps. Derived here rather than hardcoded so it tracks the analysis file.
RESIDUAL_ANALYSIS_PATH = config.DATA_DIR / "residual-isolation-analysis.json"

# [REVIEWED] How many below-cut masks to show per cover, and which ones. Three, spread over the
# cover's own score range — its strongest, its median and its weakest.
#
# Not "the top three": a cut is calibrated from the SHAPE of the correct/incorrect boundary, so the
# round has to show masks the model is confident about beside masks it is not. Showing only the top
# three would ask the reviewer to grade the easy end and leave the actual boundary unobserved. Three
# rather than more because one cover carries 35 text masks and an even sample of the population would
# spend the entire round on two busy covers.
HARD_TEXT_PER_COVER = 3

# [REVIEWED] The cut these masks are below, and the reason they are worth showing. `text_like` is the
# only group with its own calibrated threshold, and it moves the cut UP, so every mask under it is
# discarded twice over: once by the group cut, and for most of them again by the pooled cut.
TEXT_LIKE_CUT = config.CALIBRATED_GROUP_THRESHOLDS.get("text_like", config.CALIBRATED_SCORE_THRESHOLD)

TEXT_LIKE_CONCEPTS = tuple(config.CONCEPT_GROUPS["text_like"])

# --------------------------------------------------------------------------------- dynamic concepts

# [REVIEWED] `dyn-*` tags belong to no `CONCEPT_GROUPS` group — `config.group_of()` returns None and
# `passes_calibrated_cut()` gives them the pooled cut, which is deliberate and recorded in every row.
# But this round has to NAME their group, because the whole A6 question is per-concept-group scoping
# and a big-area `dyn-building` mask is evidence about "subject nouns" or it is evidence about
# nothing. So the round declares its own group for them, for the manifest and the analysis only.
# Nothing here is written back to config.py, and no threshold is derived from this name.
DYNAMIC_GROUP = "dynamic_subject"

# [REVIEWED] Panel colours for the dynamic tags. `overlay.CONCEPT_COLORS` asserts it equals the static
# concept set, so it cannot carry these; they are supplied here and merged for rendering only. Chosen
# away from every static colour so a dyn mask cannot be mistaken for a `person` or an `emblem` at a
# glance. Human-facing only, exactly like the table they join.
DYNAMIC_CONCEPT_COLORS: dict[str, tuple[int, int, int]] = {
    "dyn-building": (255, 140, 60),
    "dyn-animal": (170, 120, 255),
    "dyn-vehicle": (60, 220, 200),
    "dyn-watermark": (200, 200, 120),
    "dyn-object": (150, 150, 150),
}


def group_of(concept: str) -> str:
    """The group this round files a concept under. `dyn-*` get one of their own; see DYNAMIC_GROUP."""
    group = config.group_of(concept)
    if group is not None:
        return group
    if concept.startswith("dyn-"):
        return DYNAMIC_GROUP
    raise KeyError(f"concept {concept!r} is in no group and is not a dynamic tag")


def concept_label(concept: str) -> str:
    """What the panel calls this concept. The stored tag's plain-language name, never the prompt.

    Round 2 established that the panel names the STORED TAG (`display-text`, not "album title"), and
    round 3 keeps it so the two rounds' answers are about the same words. `dyn-*` tags print without
    their prefix: the prefix is row-identity machinery and means nothing to a looker.
    """
    override = {"display-text": "main display text", "parental-advisory": "parental advisory mark"}
    if concept in override:
        return override[concept]
    if concept.startswith("dyn-"):
        return concept[len("dyn-"):]
    return concept


# --------------------------------------------------------------------------------- reading the run


def read_run(run: str) -> tuple[list[dict], dict[str, dict]]:
    """Read a run WITHOUT `review_round.read_run`'s static-concept-set refusal.

    `rr.read_run` raises when a run carries concepts that are not in `config.CONCEPT_PROMPTS`, which
    is right for a static run — it is the guard that catches a v1 run being read under a v2 config.
    But every dynamic run carries `dyn-*` tags by construction, so that check would refuse
    `sam-eval-142-v3-dynamic` unconditionally and there is no config it would ever accept.

    The check that actually matters here is the STATIC one, and it is kept: the run's recorded
    `concept_set_hash` must equal the current config's. That is the property `check_run_concept_set`
    tests, and it is exact — dynamic prompts are hashed separately into `dynamic_set_hash` precisely
    so that `concept_set_hash` keeps meaning what it means everywhere else.
    """
    rows = common.read_jsonl(config.DATA_DIR / f"{run}.jsonl")
    regions = [r for r in rows if r.get("record_type") == config.RECORD_TYPE_REGION]
    stale = sorted(
        {r["concept"] for r in regions}
        - {c for c, _ in config.CONCEPT_PROMPTS}
        - {c for c in {r["concept"] for r in regions} if c.startswith("dyn-")}
    )
    if stale:
        raise SystemExit(
            f"{run}.jsonl carries non-dynamic concepts that are not in the current set: {stale}. "
            "That run predates the current concept set; round 3 must be built on an in-step run."
        )
    rr.check_run_concept_set(run, rows)
    images = {
        r["image_sha256"]: r
        for r in rows
        if r.get("record_type") == config.RECORD_TYPE_IMAGE and r.get("status") == "ok"
    }
    return regions, images


def a12_covers() -> tuple[list[str], dict]:
    """The 11-cover A12 class, from the residual experiment's committed analysis."""
    if not RESIDUAL_ANALYSIS_PATH.exists():
        raise SystemExit(
            f"{RESIDUAL_ANALYSIS_PATH} does not exist. It is written by "
            "oracle/sam/analyze_residual_isolation.py (CPU) and is where the A12 class is defined."
        )
    analysis = json.loads(RESIDUAL_ANALYSIS_PATH.read_text())
    text_gap = [
        cover for cover in analysis["covers"]
        if "text_below_cut" in cover.get("contamination_causes", [])
    ]
    hard = [cover for cover in text_gap if not cover["text_gap_recoverable_at_pooled_cut"]]
    hard.sort(key=lambda cover: (-cover["text_best_score"], cover["image_path"]))
    provenance = {
        "source": str(RESIDUAL_ANALYSIS_PATH.relative_to(config.REPO_ROOT)),
        "textBelowCutCovers": len(text_gap),
        "recoverableAtPooledCut": len(text_gap) - len(hard),
        "hardTextCovers": len(hard),
        "rule": (
            "covers the VLM says carry text, on which no text_like mask clears the pooled cut of "
            f"{config.CALIBRATED_SCORE_THRESHOLD:g} — `text_below_cut` and not "
            "`text_gap_recoverable_at_pooled_cut`"
        ),
    }
    return [cover["image_path"] for cover in hard], provenance


# --------------------------------------------------------------------------------- probe-4 CJK covers

# [MEASURED, n=4] Probe 4's four CJK covers, with the best score any CJK phrasing reached on each.
# Recorded here because the round REPORTS them as a gap rather than showing them: see ROUND_3_GPU_GAP.
# Paths and scores are read from the probe's own rows, never retyped.
PROBE_4_ROWS = config.DATA_DIR / "probe-4-scripts-objects.jsonl"
CJK_PHRASINGS = ("chinese characters", "kanji", "hanzi", "calligraphy")


def probe_4_cjk_covers() -> list[dict]:
    """Probe 4's CJK covers and their best CJK-phrasing scores, from the probe's stored rows."""
    if not PROBE_4_ROWS.exists():
        return []
    out: list[dict] = []
    for row in common.read_jsonl(PROBE_4_ROWS):
        if "cjk" not in row.get("image_contains", []):
            continue
        best = {
            phrasing: max((hit["score"] for hit in row["per_prompt"].get(phrasing, [])), default=0.0)
            for phrasing in CJK_PHRASINGS
        }
        out.append({
            "imagePath": row["image_path"],
            "imageSha256": row["image_sha256"],
            "imageKind": row["image_kind"],
            "bestByCjkPhrasing": best,
        })
    out.sort(key=lambda cover: cover["imagePath"])
    return out


# --------------------------------------------------------------------------------- item ids


def item_id(row: dict) -> str:
    """Opaque, content-derived id for a mask item. Distinct from rounds 1 and 2 for the same mask."""
    digest = hashlib.sha256(f"{BATCH_ID}|{rr.mask_row_id(row)}".encode("utf-8")).hexdigest()
    return f"smq3-{digest[:12]}"


def guard_item_id(row: dict) -> str:
    """Opaque id for the SECOND question about the same mask.

    Salted apart from `item_id` so the two items about one mask cannot collide and neither id can be
    guessed from the other. They deliberately share an `imageId` (the mask row id) in the fixture:
    the server keys an answer by (question, image), so a shared image under two question keys is
    exactly how one stimulus carries two questions.
    """
    digest = hashlib.sha256(f"{BATCH_ID}|guard|{rr.mask_row_id(row)}".encode("utf-8")).hexdigest()
    return f"smq3g-{digest[:12]}"


# --------------------------------------------------------------------------------- the sample


def build_big_area_sample(regions: list[dict]) -> tuple[list[tuple[dict, str]], dict]:
    """Every big-area mask in the run, plus near-boundary context. Not a sample — a census.

    A6 is not a rate question and must not be sampled. The population is 12 masks over the guard and
    3 more in the context strip; showing all of them costs 15 items and removes the one objection
    that sank the previous verdict — that the evidence was computed over a force-included subset that
    could not have produced a counterexample.
    """
    over = [r for r in regions if r["area_fraction"] > GUARD_AREA_FRACTION]
    near = [
        r for r in regions
        if CONTEXT_MIN_AREA_FRACTION < r["area_fraction"] <= GUARD_AREA_FRACTION
    ]
    over.sort(key=lambda r: (-r["area_fraction"], rr.mask_row_id(r)))
    near.sort(key=lambda r: (-r["area_fraction"], rr.mask_row_id(r)))
    selected = [(r, ROLE_OVER_GUARD) for r in over] + [(r, ROLE_NEAR_GUARD) for r in near]

    by_group_over: dict[str, int] = defaultdict(int)
    for row in over:
        by_group_over[group_of(row["concept"])] += 1
    by_concept: dict[str, int] = defaultdict(int)
    for row, _ in selected:
        by_concept[row["concept"]] += 1

    # What the guard actually removes today: masks that clear their own calibrated score cut and are
    # rejected by the area guard alone. These are the only masks whose fate the guard decides, and
    # the round's arithmetic below is about them.
    decided_by_guard = [
        r for r in over
        if r["score"] >= config.calibrated_threshold_for(r["concept"])
    ]
    composition = {
        "population": "census, not a sample: every region in the run above the context floor",
        "guardAreaFraction": GUARD_AREA_FRACTION,
        "contextMinAreaFraction": CONTEXT_MIN_AREA_FRACTION,
        "overGuard": len(over),
        "nearGuardContext": len(near),
        "overGuardByGroup": dict(sorted(by_group_over.items())),
        "drawnByConcept": dict(sorted(by_concept.items())),
        "removedByGuardAlone": len(decided_by_guard),
        "removedByGuardAloneByConcept": dict(sorted(
            defaultdict(int, {
                concept: sum(1 for r in decided_by_guard if r["concept"] == concept)
                for concept in {r["concept"] for r in decided_by_guard}
            }).items()
        )),
        "notes": [],
    }
    if not over:
        composition["notes"].append("no region in the run exceeds the guard; A6 has nothing to decide on this run")
    return selected, composition


def spread_three(rows: list[dict], count: int) -> list[dict]:
    """The strongest, the median and the weakest of a cover's masks, in that order.

    Deterministic and seedless: it is a function of the scores alone. With fewer than `count` rows it
    returns them all.
    """
    ranked = sorted(rows, key=lambda r: (-r["score"], rr.mask_row_id(r)))
    if len(ranked) <= count:
        return ranked
    if count == 1:
        return [ranked[0]]
    # Evenly spaced positions across the ranked list, endpoints included.
    picks = {round(index * (len(ranked) - 1) / (count - 1)) for index in range(count)}
    return [ranked[index] for index in sorted(picks)]


def build_hard_text_sample(
    regions: list[dict], covers: list[str]
) -> tuple[list[tuple[dict, str]], dict]:
    """Below-cut `text_like` masks on the A12 covers: up to three per cover, spread over its range."""
    by_cover: dict[str, list[dict]] = defaultdict(list)
    for row in regions:
        if row["concept"] in TEXT_LIKE_CONCEPTS and row["score"] < TEXT_LIKE_CUT:
            by_cover[row["image_path"]].append(row)

    selected: list[tuple[dict, str]] = []
    silent: list[str] = []
    per_cover: dict[str, int] = {}
    for image_path in covers:
        candidates = by_cover.get(image_path, [])
        if not candidates:
            silent.append(image_path)
            per_cover[image_path] = 0
            continue
        drawn = spread_three(candidates, HARD_TEXT_PER_COVER)
        per_cover[image_path] = len(drawn)
        for row in drawn:
            selected.append((row, f"hard-text|{image_path}"))

    notes: list[str] = []
    if silent:
        notes.append(
            f"{len(silent)} of {len(covers)} A12 covers carry NO text_like mask at all, even at the "
            f"run-time floor of {config.SCORE_THRESHOLD:g} — there is no below-cut mask to show for "
            "them, and a category-aware cut cannot recover a region the model never returned. These "
            "are the covers that need the CJK-prompt GPU run: " + ", ".join(sorted(silent))
        )
    composition = {
        "coversInClass": len(covers),
        "coversWithMasks": len(covers) - len(silent),
        "coversSilent": len(silent),
        "silentCovers": sorted(silent),
        "perCoverCap": HARD_TEXT_PER_COVER,
        "belowCutOf": TEXT_LIKE_CUT,
        "masksPerCover": per_cover,
        "totalBelowCutAvailable": sum(len(rows) for rows in by_cover.values() if rows),
        "notes": notes,
    }
    return selected, composition


# --------------------------------------------------------------------------------- the GPU gap

# [MEASURED] What this round CANNOT show from anything on disk, and the exact run that would fix it.
# Written into the manifest so the gap travels with the round instead of living in a chat message.
ROUND_3_GPU_GAP = {
    "whatIsMissing": (
        "the CJK-prompt masks themselves. `chinese characters` and `kanji` are not in "
        "config.CONCEPT_PROMPTS, so no eval run contains them; probe 4 ran them but its rows store "
        "only score, bbox and area_fraction with NO mask_rle, so nothing on disk can be rendered as "
        "an overlay. Two of probe 4's four CJK covers are also absent from the eval set entirely."
    ),
    "whyItMatters": (
        "A12 asks where a category-aware cut for CJK should go. The masks this round CAN show are "
        "the incumbent Latin-glyph concepts firing weakly on hard covers, which calibrates the "
        "text_like cut but says nothing about a CJK concept — the evidence that `chinese characters` "
        "is 4/4 with perfect precision at a top score of 0.472 has never been seen by a human."
    ),
    "exactRunNeeded": {
        "script": "research/v3/oracle/sam/probe_scripts_objects.py (or a run_sam.py pass with these prompts)",
        "prompts": ["chinese characters", "kanji", "words"],
        "promptsNote": "`words` is the incumbent control — it is what the current set would have caught",
        "covers": "the 4 probe-4 CJK covers + the A12 covers that carry no text_like mask at all",
        "mustStore": "mask_rle per instance, at the run-time floor SCORE_THRESHOLD = 0.3",
        "estimatedGpu": (
            "~7 covers x 3 prompts. Probe 4 measured 16 covers x 14 phrasings at 51.6 s of "
            "inference, so this is on the order of 5-15 s of inference and well under a minute wall."
        ),
    },
}


# --------------------------------------------------------------------------------- manifest

SELECTION_RULE = (
    "Two sections, one batch, both about thresholds that were set without a human ever seeing the "
    "masks they decide. SECTION A (area guard, loose end A6) is a CENSUS, not a sample: every region "
    f"in the run covering more than {GUARD_AREA_FRACTION:g} of its cover, plus every region between "
    f"{CONTEXT_MIN_AREA_FRACTION:g} and {GUARD_AREA_FRACTION:g} as boundary context. The guard was "
    "calibrated on a round whose big-area masks contained no `person` at all, yet 5 of the 6 regions "
    "it removes corpus-wide are `person` — a person filling most of a cover is an ordinary artwork, "
    "so the guard may be deleting correct masks on a concept its calibration never tested. Each of "
    "these masks is asked TWICE: the usual mask question, and the question the guard decision "
    "actually needs. SECTION B (hard text, loose end A12) shows BELOW-CUT masks — up to three per "
    "cover, spread over the cover's own range from strongest to weakest — on the 11 covers where the "
    "VLM says there is text and no text_like mask survives the pooled cut. Showing masks the current "
    "thresholds throw away is the only way a category-aware cut can be calibrated, because a cut "
    "cannot be fitted to regions nobody has graded. The panel names the STORED TAG, not the prompt."
)

GUARD_QUESTION_KEY = "big_area_is_real_subject"

# [REVIEWED] How the guard answers map to the A6 decision, fixed BEFORE any answer is seen.
#
# The unit of decision is the CONCEPT GROUP, because the pending refinement is per-group scoping —
# guard marks and text, exempt subjects — and because a per-concept rule on 1-5 masks would be
# fitting noise. Only `over-guard` items count; the near-guard context items are read as context and
# never enter the arithmetic, since they describe masks the guard does not touch.
#
# Primary treatment matches rounds 1 and 2: the middle answer is excluded from BOTH sides, so the
# denominator is the decided answers only. That is the discipline the existing calibration used and
# changing it here would make the two rounds incomparable.
GUARD_DECISION_RULE = {
    "unitOfDecision": "concept group (person_like / mark_like / text_like / dynamic_subject)",
    "countsToward": ROLE_OVER_GUARD,
    "contextOnly": ROLE_NEAR_GUARD,
    "primaryTreatment": "the middle answer is excluded from both sides; the denominator is decided answers only",
    "minimumDecided": 3,
    "exemptIf": (
        "the group's `real-subject` share of decided answers is >= 0.70 — the guard is then scoped "
        "OFF for that group (max_area_fraction=None), because it is deleting masks the reviewer calls "
        "real subjects filling the frame"
    ),
    "keepIf": (
        "the group's `real-subject` share is <= 0.30 — the guard stays ON for that group, which is "
        "what round 1 already found for the mark-shaped concepts it did test at big area"
    ),
    "undecidedIf": (
        "the share falls between 0.30 and 0.70, or fewer than 3 answers are decided — the guard stays "
        "ON unchanged and the group is recorded as unresolved. A round that cannot separate must say "
        "so rather than move a constant on a coin flip."
    ),
    "crossCheck": (
        "an item answered `yes` to the mask question and `whole-image` to the guard question is a "
        "contradiction and is reported per item, never averaged away: it means the mask is a correct "
        "instance of the concept AND covers the whole picture, which is the case the guard exists for."
    ),
    "notAdopted": (
        "no threshold in config.py is edited by this round. The outcome is a proposal to the reviewer, "
        "and per-group scoping is a change to `passes_calibrated_cut`'s contract, not a number."
    ),
}

# [REVIEWED] How the hard-text answers map to the A12 decision, likewise fixed in advance. The
# machinery already exists — `config.CALIBRATED_GROUP_THRESHOLDS` — and so do its gates, so this
# round reuses them rather than inventing a second standard.
HARD_TEXT_DECISION_RULE = {
    "method": (
        "sweep a candidate cut over the observed scores of the graded below-cut masks, primary "
        "treatment (middle answer excluded both sides), maximising Youden J — the same sweep that "
        "produced the pooled cut and the text_like group cut."
    ),
    "gates": (
        "adopt a LOWERED text_like cut only if it clears the gates already written into the analysis: "
        "separation from the incumbent >= 0.05, J gain >= 0.05, and at least 5 decided answers."
    ),
    "expectedOutcome": (
        "genuinely open. If the reviewer accepts most of these below-cut masks, the text_like cut of "
        f"{TEXT_LIKE_CUT:g} is too high and is discarding correct text; if the reviewer rejects them, "
        "the cut is doing its job and the A12 recovery has to come from a CJK-specific concept with "
        "its own threshold, not from moving a general one."
    ),
    "limit": (
        "these are Latin-glyph concepts firing weakly on hard covers. They calibrate the text_like "
        "cut. They are NOT evidence about a CJK concept — see gpuGap."
    ),
}


def manifest_entry(row: dict, role: str, image_row: dict, overlay_path: Path, section: str) -> dict:
    overlay: dict | None = None
    if overlay_path.exists():
        overlay_bytes = overlay_path.read_bytes()
        from PIL import Image
        with Image.open(overlay_path) as opened:
            overlay_w, overlay_h = opened.size
        overlay = {
            "path": str(overlay_path.relative_to(config.REPO_ROOT)),
            "sha256": hashlib.sha256(overlay_bytes).hexdigest(),
            "bytes": len(overlay_bytes),
            "width": overlay_w,
            "height": overlay_h,
            "scale": rr.panel_scale(row["mask_width"], row["mask_height"]),
        }
    group = group_of(row["concept"])
    if section == "big-area":
        stratum = f"big-area|{group}|{role}"
    else:
        stratum = f"hard-text|{rr.band_of(row['score'])}"
    return {
        "itemId": item_id(row),
        "guardItemId": guard_item_id(row) if section == "big-area" else None,
        "maskRowId": rr.mask_row_id(row),
        "section": section,
        "concept": row["concept"],
        "conceptPhrase": concept_label(row["concept"]),
        "conceptGroup": group,
        "conceptIsDynamic": bool(row.get("concept_is_dynamic", False)),
        "selectionRole": role,
        # Everything from here to `maskRef` is the answer key: it is what the reviewer's answer is
        # joined against after release. Manifest-side only, exactly as in rounds 1 and 2.
        "score": row["score"],
        "areaFraction": row["area_fraction"],
        "band": rr.band_of(row["score"]),
        "calibratedCutForConcept": config.calibrated_threshold_for(row["concept"]),
        "clearsScoreCut": row["score"] >= config.calibrated_threshold_for(row["concept"]),
        "removedByAreaGuard": row["area_fraction"] > GUARD_AREA_FRACTION,
        "stratum": stratum,
        "forcedSuspicious": row["area_fraction"] > rr.SUSPICIOUS_AREA_FRACTION and row["score"] < rr.SUSPICIOUS_SCORE,
        "maskRef": {
            "run": SOURCE_RUN,
            "runId": row["run_id"],
            "schemaVersion": row["schema_version"],
            "imageSha256": row["image_sha256"],
            "instanceIdx": row["instance_idx"],
            "bbox": {"x": row["bbox_x"], "y": row["bbox_y"], "w": row["bbox_w"], "h": row["bbox_h"]},
        },
        "artwork": {
            "imagePath": row["image_path"],
            "imageId": row["image_id"],
            "artworkId": row["artwork_id"],
            "collection": row["collection"],
            "sha256": row["image_sha256"],
            "width": image_row["width"],
            "height": image_row["height"],
        },
        "overlay": overlay,
    }


def build(run: str, write: bool) -> dict:
    run_path = config.DATA_DIR / f"{run}.jsonl"
    if not run_path.exists():
        raise SystemExit(f"{run_path} does not exist. Round 3 reads a finished run; it never triggers one.")
    regions, images = read_run(run)

    big_area, big_area_composition = build_big_area_sample(regions)
    covers, a12_provenance = a12_covers()
    hard_text, hard_text_composition = build_hard_text_sample(regions, covers)
    hard_text_composition["classProvenance"] = a12_provenance

    # Render with the dynamic colours merged in. `render_overlay` reads the module-level table in
    # `review_round`, so the merge happens there; the static entries are untouched, so rounds 1 and 2
    # would still render byte-identically.
    rr.CONCEPT_COLORS = {**rr.CONCEPT_COLORS, **DYNAMIC_CONCEPT_COLORS}
    labels = {row["concept"]: concept_label(row["concept"]) for row, _ in big_area + hard_text}

    if write:
        OVERLAY_DIR.mkdir(parents=True, exist_ok=True)

    entries: list[dict] = []
    for selected, section in ((big_area, "big-area"), (hard_text, "hard-text")):
        for row, role in selected:
            overlay_path = OVERLAY_DIR / f"{item_id(row)}.png"
            if write:
                rr.render_overlay(row, images[row["image_sha256"]], phrases=labels).save(
                    overlay_path, optimize=True
                )
            entries.append(manifest_entry(row, role, images[row["image_sha256"]], overlay_path, section))
    entries.sort(key=lambda entry: entry["itemId"])

    missing = [entry["itemId"] for entry in entries if entry["overlay"] is None]
    if write and missing:
        raise RuntimeError(f"{len(missing)} overlays did not render: {missing[:3]}")

    guard_entries = [
        {
            "itemId": entry["guardItemId"],
            "maskRowId": entry["maskRowId"],
            "concept": entry["concept"],
            "conceptPhrase": entry["conceptPhrase"],
            "conceptGroup": entry["conceptGroup"],
            "selectionRole": entry["selectionRole"],
            "stratum": entry["stratum"],
            "artwork": entry["artwork"],
            # Deliberately the SAME overlay file as the mask item: same pixels, second question.
            "overlay": entry["overlay"],
        }
        for entry in entries
        if entry["section"] == "big-area"
    ]
    guard_entries.sort(key=lambda entry: entry["itemId"])

    # Concept groups as THIS round files them, including the dynamic group. The fixture builder walks
    # this to decide the pass order, so a concept missing here would silently drop its masks.
    concept_groups = {group: list(concepts) for group, concepts in config.CONCEPT_GROUPS.items()}
    dynamic_present = sorted({
        row["concept"] for row, _ in big_area + hard_text if row["concept"].startswith("dyn-")
    })
    if dynamic_present:
        concept_groups[DYNAMIC_GROUP] = dynamic_present

    return {
        "manifestVersion": "sam-mask-quality-sample.v1",
        "batchId": BATCH_ID,
        "seed": SEED,
        "generatedBy": "research/v3/oracle/sam/review_round_3.py",
        "builtFrom": [
            f"research/v3/data/sam/{run}.jsonl",
            "research/v3/data/sam/residual-isolation-analysis.json",
            "research/v3/data/sam/probe-4-scripts-objects.jsonl",
            "research/v3/oracle/sam/config.py",
            "research/v3/oracle/sam/review_round.py",
        ],
        "sourceRun": run,
        "conceptSetHash": common.concept_set_hash(),
        "conceptSetVersion": "v2.1",
        "renderer": {
            "pillow": rr.PIL_VERSION,
            "minPanelPx": rr.MIN_PANEL_PX,
            "maxPanelScale": rr.MAX_PANEL_SCALE,
            "maskAlpha": rr.MASK_ALPHA,
            "bboxWidthPx": rr.BBOX_WIDTH_PX,
            "haloWidthPx": rr.HALO_WIDTH_PX,
            "locatorRingMaxExtent": rr.LOCATOR_RING_MAX_EXTENT,
            "conceptLabels": labels,
            "conceptColors": {concept: list(colour) for concept, colour in rr.CONCEPT_COLORS.items()},
        },
        "scoreThresholdAtRun": config.SCORE_THRESHOLD,
        "calibratedScoreThreshold": config.CALIBRATED_SCORE_THRESHOLD,
        "calibratedGroupThresholds": dict(config.CALIBRATED_GROUP_THRESHOLDS),
        "calibratedMaxAreaFraction": GUARD_AREA_FRACTION,
        "scoreBands": [{"band": name, "low": low, "high": high} for name, low, high in rr.SCORE_BANDS],
        "conceptGroups": concept_groups,
        "selection": {
            "rule": SELECTION_RULE,
            "composition": {
                "bigArea": big_area_composition,
                "hardText": hard_text_composition,
                "shortfall": 0,
                "notes": big_area_composition["notes"] + hard_text_composition["notes"],
            },
        },
        "items": entries,
        # The second question, over section A's masks. A separate key, not more `items`: the shared
        # fixture builder asks one mask question per concept about everything in `items`, and this is
        # a different question about the same pixels. build-round-3-fixture.ts appends it as its own
        # pass, exactly as round 2's residual section is appended.
        "guardSection": {
            "questionKey": GUARD_QUESTION_KEY,
            "rule": (
                "Every section-A mask, asked the question the area-guard decision needs: is this a "
                "real subject filling the frame, or a mask thrown over the whole picture? The mask "
                "question alone cannot decide it — a mask can be a correct `person` and still be the "
                "whole cover, and that is precisely the case the guard was added for."
            ),
            "decisionRule": GUARD_DECISION_RULE,
            "items": guard_entries,
        },
        "hardTextDecisionRule": HARD_TEXT_DECISION_RULE,
        "gpuGap": {**ROUND_3_GPU_GAP, "probe4CjkCovers": probe_4_cjk_covers()},
    }


def report(manifest: dict) -> None:
    items = manifest["items"]
    big = [i for i in items if i["section"] == "big-area"]
    hard = [i for i in items if i["section"] == "hard-text"]
    guard = manifest["guardSection"]["items"]
    print(f"{manifest['batchId']}: run={manifest['sourceRun']}")
    print(f"  section A (big area): {len(big)} masks, each asked twice -> {len(big) + len(guard)} items")
    counts: dict[tuple[str, str], int] = defaultdict(int)
    for item in big:
        counts[(item["conceptGroup"], item["concept"], item["selectionRole"])] += 1  # type: ignore[index]
    for (group, concept, role), count in sorted(counts.items()):  # type: ignore[misc]
        print(f"    {group:16s} {concept:14s} {role:20s} {count:3d}")
    composition = manifest["selection"]["composition"]["bigArea"]
    print(f"    removed by the guard ALONE (clears its score cut, area over the guard): "
          f"{composition['removedByGuardAlone']} {composition['removedByGuardAloneByConcept']}")

    print(f"\n  section B (hard text): {len(hard)} masks from "
          f"{len({i['artwork']['imagePath'] for i in hard})} covers")
    hard_composition = manifest["selection"]["composition"]["hardText"]
    print(f"    A12 class: {hard_composition['coversInClass']} covers, "
          f"{hard_composition['coversWithMasks']} with below-cut masks, "
          f"{hard_composition['coversSilent']} silent")
    print(f"    below the text_like cut of {hard_composition['belowCutOf']:g}; "
          f"{hard_composition['totalBelowCutAvailable']} available, capped at "
          f"{hard_composition['perCoverCap']} per cover")
    by_concept: dict[str, int] = defaultdict(int)
    for item in hard:
        by_concept[item["concept"]] += 1
    for concept, count in sorted(by_concept.items()):
        print(f"    {concept:16s} {count:3d}")

    print(f"\n  TOTAL items: {len(items) + len(guard)}")
    for note in manifest["selection"]["composition"]["notes"]:
        print(f"  NOTE {note}")
    print(f"  GPU GAP: {manifest['gpuGap']['whatIsMissing'][:100]}...")


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--run", default=SOURCE_RUN, help="run stem under research/v3/data/sam/")
    parser.add_argument("--write", action="store_true", help="write the manifest and the overlays")
    args = parser.parse_args()
    manifest = build(args.run, args.write)
    report(manifest)
    if args.write:
        MANIFEST_PATH.write_text(json.dumps(manifest, indent="\t", sort_keys=False) + "\n")
        print(f"wrote {MANIFEST_PATH}")
        print(f"wrote {len(manifest['items'])} overlays to {OVERLAY_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
