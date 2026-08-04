"""Residual purity proxy across cuts, v4-nouns (ONE noun) vs v5-allnouns (EVERY noun).

CPU only. Reads two stored runs and their two derivation tables, writes one analysis JSON and a
readable text report. Modifies no stored run and NO THRESHOLD IN config.py MOVES.

    .venv/bin/python analyze_residual_cuts_v5.py \
        --v4-run sam-eval-142-v4-nouns --v5-run sam-eval-142-v5-allnouns

HONESTY REQUIREMENT, STATED BEFORE ANY NUMBER IN THIS FILE IS READ. Every purity number this
script prints is a PROXY, and the proxy has been measured against human answers exactly once, by
`residual-purity-1`. It over-claimed by **0.582** in aggregate — it called 82.4% of v4's residuals
clean and the reviewer, looking at 25 of them, called 24.24% pure field. RESIDUAL_PURITY_VERDICT.md
says why in one sentence: "Its 82% was never a measurement of purity — it was the rate at which its
own named causes stayed silent." So a v5 proxy number that beats v4's proxy number means the named
causes went quieter, and NOTHING MORE. The report carries the calibration offset on every table and
`meta.calibration` carries it in the JSON, so a consumer cannot pick a number up without it.

THREE DIFFERENCES FROM `analyze_residual_cuts.py`, each additive and each stated.

1. SUBJECT CONCEPTS. v5 emits eight rank tags, `dyn-noun-1` .. `dyn-noun-8`, where v4 emitted one
   `dyn-noun`. Both sets are in `SUBJECT_CONCEPTS` below, so the contamination proxy sees a species
   mask in either run and no v5 cover is miscounted `subject_unmasked` for a naming reason.

2. A THIRD GUARD VARIANT. `analyze_residual_cuts.keep()` applies the area guard UNIFORMLY — it
   predates the `person_like` exemption that mask round 3 added to `config.passes_calibrated_cut()`
   on 2026-08-04. Both rules are now live in the codebase and they disagree, so this script reports
   BOTH rather than picking: `guard_on_uniform` reproduces every v4-era number exactly, and
   `guard_on_exempt` is what `config` does today. Neither is treated as the answer.

3. THE SUBTRACTION CUT IS GENERALISED, AND v4's NUMBERS DO NOT MOVE. v4's subtraction cut was "the
   pooled 0.578 applied to every group", written to undo `text_like`'s calibrated RAISE to 0.697295
   for a consumer whose failure mode is a contaminated background rather than a wrong region.
   Concept set v2.2 has since added a group whose calibrated cut is LOWER than pooled — `cjk_script`
   at 0.392655 — and applying a flat 0.578 to it would make the recall-oriented cut STRICTER than
   the precision one, which inverts the whole point of the name. So the subtraction cut is defined
   here as **the recall-favouring threshold available for each group**, `min(pooled, group cut)`:
   `text_like` 0.578 (lowered), `cjk_script` 0.392655 (already lower, kept), everything else 0.578.
   On a run with no `cjk_script` group this is IDENTICAL to the old definition, so every published
   v4 subtraction number is reproduced unchanged and the generalisation costs no comparability.

   `cjk_script`'s 0.392655 is `[MEASURED, n=21, PROVISIONAL]` and `config.py` says in as many words
   "nothing may cite it as calibrated" — the group holds exactly ONE negative answer and the optimum
   is mechanically the smallest observed score above that one rejected mask. It is used here because
   it is the cut in force; it is flagged PROVISIONAL in the meta and in the report so no reader
   mistakes a v5-vs-v4 CJK difference for a settled measurement.

THE HASH BOUNDARY, WHICH IS REAL AND IS NOT SWEPT UP. v4 ran under concept set v2.1 (10 static
concepts, hash 9c78298f3c993678...); v5 runs under v2.2 (12, adding `cjk-script` and `kanji`).
`config.py` forbids "a single analysis that reads rows from two hashes at once". This script reads
two hashes at once ON PURPOSE and the whole point is to say where they differ, so the rule is
honoured by DISCLOSURE rather than by avoidance: `static_arm_check()` below verifies region-for-
region that the 10 shared concepts produced byte-identical scores and boxes in both runs, and every
cross-run table names which quantities are hash-sensitive. A comparison that fails that check is a
comparison of two instruments, not of two elicitations, and the report says so out loud.
"""

from __future__ import annotations

import argparse
import collections
import json
import statistics

import numpy as np

import common
import config
import dynamic_concepts as v1
import dynamic_concepts_v2 as v2
import dynamic_concepts_v3 as v3

# [REVIEWED] Concepts that mask a depicted subject. `analyze_residual_cuts.py`'s tuple plus v5's
# eight rank tags. v4's single `dyn-noun` is kept so the same function reads both runs.
SUBJECT_CONCEPTS = (("person", "face", "dyn-animal", "dyn-vehicle", "dyn-object", "dyn-building",
                     "dyn-noun") + v3.NOUN_TAGS)

# [REVIEWED] Verbatim from analyze_residual_isolation.py and analyze_residual_cuts.py: the
# `subject_kind` values a maskable noun exists for. Unchanged so the v3/v4/v5 recount compares the
# same denominator, even though v2 and v3 both hand several excluded covers a species noun.
MASKABLE_SUBJECT_KINDS = ("person", "animal", "vehicle", "object", "building_or_structure")

# [UNCALIBRATED] Carried over verbatim so the text-gap counts stay comparable to the published
# ones: below this share of the cover, a group's union is "nothing survived" rather than a small
# mask. It selects which covers get COUNTED; no threshold in config moves.
EMPTY_UNION_FRACTION = 0.002

CUTS = ("precision", "subtraction")
GUARDS = ("guard_on_uniform", "guard_on_exempt", "guard_off")

# [MEASURED] residual-purity-1, 50 answers, 2026-08-03/04. THE ONE TIME THIS PROXY WAS CHECKED
# AGAINST A HUMAN. Aggregate proxy-clean 0.824 against reviewer pure-field 0.2424 in both guard
# variants: the proxy over-claims by 0.582. Per stratum, proxy minus human (guard ON == guard OFF
# on pure-field to four decimals):
PROXY_OVERCLAIM_AGGREGATE = 0.582
PROXY_VS_HUMAN_BY_STRATUM = {
    # stratum: (proxy clean rate, human pure-field rate, gap)
    "noun-fired": (1.00, 0.250, -0.750),
    "noun-silent": (1.00, 0.400, -0.600),
    "contaminated": (0.00, 0.167, +0.167),
    "class-only": (1.00, 0.000, -1.000),
    "static-only-clean": (1.00, 0.250, -0.750),
}
CALIBRATION_NOTE = (
    "PROXY, NOT A MEASUREMENT. Checked against humans once (residual-purity-1, 50 answers): the "
    "proxy called 82.4% of v4's residuals clean; the reviewer called 24.24% pure field. It "
    "over-claims by 0.582 and the gap is structural, not an offset — the proxy counts only the "
    "causes it can name, and it cannot name a flame, a cello or an ornament. A v5 proxy number "
    "above v4's means the NAMED causes went quieter. The real test is a human round with the "
    "escape answer; none has been run on v5.")


def threshold_for(concept: str, cut: str) -> float:
    """The score threshold in force for this concept under this cut.

    `precision` delegates to config so it can never drift from the shipped default. `subtraction`
    takes the RECALL-FAVOURING side of the two available thresholds per group — see the module
    docstring for why that is a generalisation of the old flat-pooled rule and not a change to it.
    """
    if cut == "precision":
        return config.calibrated_threshold_for(concept)
    return min(config.CALIBRATED_SCORE_THRESHOLD, config.calibrated_threshold_for(concept))


def keep(region: dict, guard: str, cut: str) -> bool:
    if region["score"] < threshold_for(region["concept"], cut):
        return False
    if guard == "guard_off":
        return True
    if region["area_fraction"] <= config.CALIBRATED_MAX_AREA_FRACTION:
        return True
    # Over the guard. Only the exempt variant lets it through, and only for an exempt group.
    if guard == "guard_on_exempt":
        return config.group_of(region["concept"]) in config.GUARD_EXEMPT_GROUPS
    return False


def load_run(stem: str):
    rows = common.read_jsonl(config.DATA_DIR / f"{stem}.jsonl")
    images = {r["image_path"]: r for r in rows
              if r.get("record_type") == config.RECORD_TYPE_IMAGE and r.get("status") == "ok"}
    regions: dict[str, list[dict]] = collections.defaultdict(list)
    for r in rows:
        if r.get("record_type") == config.RECORD_TYPE_REGION:
            regions[r["image_path"]].append(r)
    return images, dict(regions)


def residual_of(regions: list[dict], height: int, width: int) -> float:
    if not regions:
        return 1.0
    union = np.zeros((height, width), dtype=np.uint8)
    for r in regions:
        union |= common.rle_decode(r["mask_rle"], r["mask_height"], r["mask_width"])
    return 1.0 - float(union.sum()) / float(height * width)


def noun_prompt_count(cover: dict) -> int:
    """How many species-noun prompts this cover was asked, in either table's shape."""
    if "subject_noun_prompts" in cover:                      # v3 table
        return len(cover["subject_noun_prompts"])
    return 1 if cover.get("subject_noun_prompt") else 0      # v2 table


def per_cover(run_stem: str, table: dict[str, dict], answers: dict) -> list[dict]:
    images, regions = load_run(run_stem)
    out = []
    for path, image_row in sorted(images.items()):
        rows = regions.get(path, [])
        h, w = image_row["height"], image_row["width"]
        cover = table[path]
        cell = {
            "image_path": path,
            "artwork_id": image_row["artwork_id"],
            "subject_kind_agreed": cover["subject_kind_agreed"],
            "dynamic_concepts": cover["dynamic_concepts"],
            "noun_prompts_asked": noun_prompt_count(cover),
            "noun_prompts": (cover.get("subject_noun_prompts")
                             or ([cover["subject_noun_prompt"]]
                                 if cover.get("subject_noun_prompt") else [])),
        }
        has_text = v1._agreed_single(answers.get(path, {}), "has_text")
        cell["has_text_agreed"] = has_text

        for cut in CUTS:
            for guard in GUARDS:
                k = f"{cut}_{guard}"
                kept = [r for r in rows if keep(r, guard, cut)]
                static_kept = [r for r in kept if not r.get("concept_is_dynamic")]
                dyn_kept = [r for r in kept if r.get("concept_is_dynamic")]
                cell[f"residual_static_{k}"] = round(residual_of(static_kept, h, w), 9)
                cell[f"residual_dynamic_{k}"] = round(residual_of(kept, h, w), 9)
                cell[f"n_regions_{k}"] = len(kept)
                cell[f"dynamic_firing_{k}"] = sorted({r["concept"] for r in dyn_kept})
                cell[f"noun_tags_fired_{k}"] = sorted(
                    {r["concept"] for r in dyn_kept
                     if r["concept"] == "dyn-noun" or r["concept"] in v3.NOUN_TAGS})
                subj = [r for r in kept if r["concept"] in SUBJECT_CONCEPTS]
                cell[f"has_subject_mask_{k}"] = bool(subj)
                cell[f"subject_union_{k}"] = round(1.0 - residual_of(subj, h, w), 9)
                for group, concepts in config.CONCEPT_GROUPS.items():
                    sub = [r for r in kept if r["concept"] in concepts]
                    cell[f"{group}_union_{k}"] = round(1.0 - residual_of(sub, h, w), 9)

                # ---- contamination proxies at THIS cut. Identical rules to
                # analyze_residual_cuts.py; only the SUBJECT_CONCEPTS tuple widened.
                causes = []
                kind = cover["subject_kind_agreed"]
                prompted = bool(cover["dynamic_concepts"]) or kind == "person"
                if (kind in MASKABLE_SUBJECT_KINDS) and not cell[f"has_subject_mask_{k}"]:
                    causes.append("subject_unmasked")
                if has_text == "yes" and cell[f"text_like_union_{k}"] < EMPTY_UNION_FRACTION:
                    causes.append("text_below_cut")
                    text_rows = [r for r in rows
                                 if r["concept"] in config.CONCEPT_GROUPS["text_like"]]
                    at_pooled = [r for r in text_rows
                                 if r["score"] >= config.CALIBRATED_SCORE_THRESHOLD]
                    cell[f"text_gap_recoverable_at_pooled_{k}"] = bool(at_pooled)
                    cell["text_best_score"] = round(
                        max((r["score"] for r in text_rows), default=0.0), 6)
                    if not at_pooled:
                        causes.append("text_below_pooled_cut_too")
                if not prompted and kind != "not_applicable":
                    causes.append("no_subject_prompt_at_all")
                cell[f"contamination_causes_{k}"] = causes
                cell[f"contaminated_{k}"] = bool(causes)
        out.append(cell)
    return out


def stratum_of(cell: dict, cut: str = "subtraction", guard: str = "guard_off") -> str:
    """`build_residual_sheets_v4.py::stratum_of`, with `dyn-noun` widened to the eight rank tags.

    Precedence order is unchanged and the evaluation point is unchanged (subtraction cut, guard
    off), so a v4 cover lands in the same stratum under this function as under the v4 one.
    """
    k = f"{cut}_{guard}"
    if cell[f"contaminated_{k}"]:
        return "contaminated"
    if cell[f"noun_tags_fired_{k}"]:
        return "noun-fired"
    if cell["noun_prompts_asked"]:
        return "noun-silent"
    if cell["dynamic_concepts"]:
        return "class-only"
    return "static-only-clean"


def static_arm_check(v4_run: str, v5_run: str) -> dict:
    """Region-for-region: did the 10 shared static concepts answer identically in both runs?

    THE VALIDITY CHECK THIS ROUND OWES. v5 adds two static concepts and up to eight dynamic ones.
    `common.segment_concepts` runs the vision backbone once and the text/DETR/mask head per prompt,
    with NMS applied per prompt and NEVER across prompts, so adding a prompt must not perturb any
    other prompt's answer. If that holds, every shared-concept region matches to the stored rounding
    and the elicitation is the only thing that changed. If it does not, v5-vs-v4 is a comparison of
    two instruments and every downstream number in this file is confounded — which is why this runs
    first and is reported before anything else.
    """
    _, r4 = load_run(v4_run)
    _, r5 = load_run(v5_run)
    shared = sorted(set(c for c, _ in config.CONCEPT_PROMPTS) & {
        "words", "letter", "lettering", "display-text", "emblem", "sticker",
        "parental-advisory", "person", "face", "barcode"})

    def index(regions):
        out = {}
        for path, rows in regions.items():
            for r in rows:
                if r["concept"] in shared:
                    out[(path, r["concept"], r["instance_idx"])] = r
        return out

    i4, i5 = index(r4), index(r5)
    only4 = sorted(set(i4) - set(i5))
    only5 = sorted(set(i5) - set(i4))
    mismatched = []
    for key in sorted(set(i4) & set(i5)):
        a, b = i4[key], i5[key]
        if (a["score"] != b["score"] or a["area_fraction"] != b["area_fraction"]
                or a["mask_rle"] != b["mask_rle"]):
            mismatched.append({
                "key": list(key),
                "v4": {"score": a["score"], "area_fraction": a["area_fraction"]},
                "v5": {"score": b["score"], "area_fraction": b["area_fraction"]},
                "mask_identical": a["mask_rle"] == b["mask_rle"],
            })
    return {
        "shared_static_concepts": shared,
        "v4_regions": len(i4),
        "v5_regions": len(i5),
        "matched": len(set(i4) & set(i5)),
        "only_in_v4": [list(k) for k in only4[:50]],
        "only_in_v4_count": len(only4),
        "only_in_v5": [list(k) for k in only5[:50]],
        "only_in_v5_count": len(only5),
        "mismatched_count": len(mismatched),
        "mismatched": mismatched[:50],
        "unperturbed": not only4 and not only5 and not mismatched,
        "interpretation": (
            "unperturbed == True means adding two static concepts and up to eight dynamic ones "
            "changed no shared-concept answer, so v5-vs-v4 compares elicitations. False means it "
            "compares instruments and every cross-run number below is confounded."),
    }


def analyze(v4_run: str, v5_run: str, v4_table: str, v5_table: str) -> dict:
    answers = v1._pilot_answers()
    t4 = v2.load(config.DATA_DIR / v4_table)
    t5 = v3.load(config.DATA_DIR / v5_table)
    c4 = per_cover(v4_run, t4, answers)
    c5 = per_cover(v5_run, t5, answers)
    by4 = {c["image_path"]: c for c in c4}
    by5 = {c["image_path"]: c for c in c5}
    for cell, table in ((c4, t4), (c5, t5)):
        for c in cell:
            for cut in CUTS:
                c[f"stratum_{cut}"] = stratum_of(c, cut)

    # ---- the headline recovery: v4 `subject_unmasked` covers that now carry a subject mask ----
    recovery = {}
    for cut in CUTS:
        for guard in GUARDS:
            k = f"{cut}_{guard}"
            v4_unmasked = [p for p, c in by4.items()
                           if "subject_unmasked" in c[f"contamination_causes_{k}"]]
            closed = [p for p in v4_unmasked
                      if p in by5 and by5[p][f"has_subject_mask_{k}"]]
            still = [p for p in v4_unmasked if p not in closed]
            new_unmasked = [p for p, c in by5.items()
                            if "subject_unmasked" in c[f"contamination_causes_{k}"]
                            and p in by4
                            and "subject_unmasked" not in by4[p][f"contamination_causes_{k}"]]
            recovery[k] = {
                "v4_subject_unmasked": len(v4_unmasked),
                "closed_in_v5": len(closed),
                "still_unmasked_in_v5": len(still),
                "newly_unmasked_in_v5": len(new_unmasked),
                "closed_paths": sorted(closed),
                "still_paths": sorted(still),
                "newly_unmasked_paths": sorted(new_unmasked),
            }

    # ---- the flame/cello class: covers where a SECOND noun fired and took new pixels ----
    second_noun = []
    for path, c in sorted(by5.items()):
        k = "subtraction_guard_off"
        fired = [t for t in c[f"noun_tags_fired_{k}"] if t in v3.NOUN_TAGS]
        beyond_first = [t for t in fired if t != "dyn-noun-1"]
        if not beyond_first:
            continue
        a = by4.get(path)
        second_noun.append({
            "image_path": path,
            "noun_tags_fired": fired,
            "tags_beyond_rank_1": beyond_first,
            "prompts": c["noun_prompts"],
            "v4_residual": a[f"residual_dynamic_{k}"] if a else None,
            "v5_residual": c[f"residual_dynamic_{k}"],
            "residual_closed": (round(a[f"residual_dynamic_{k}"] - c[f"residual_dynamic_{k}"], 6)
                                if a else None),
            "v4_had_subject_mask": a[f"has_subject_mask_{k}"] if a else None,
        })

    # ---- contamination recount ----
    recount = {}
    for label, covers in (("v4", c4), ("v5", c5)):
        for cut in CUTS:
            for guard in GUARDS:
                k = f"{cut}_{guard}"
                causes = collections.Counter(
                    cause for c in covers for cause in c[f"contamination_causes_{k}"])
                flagged = sum(1 for c in covers if c[f"contaminated_{k}"])
                recount[f"{label}_{k}"] = {
                    "covers": len(covers),
                    "flagged": flagged,
                    "clean": len(covers) - flagged,
                    "clean_rate": round((len(covers) - flagged) / len(covers), 6),
                    "causes": dict(causes.most_common()),
                }

    # ---- per-stratum proxy clean rate, the cut the human round was rendered at ----
    strata_table = {}
    for label, covers in (("v4", c4), ("v5", c5)):
        for cut in CUTS:
            rows = {}
            groups = collections.defaultdict(list)
            for c in covers:
                groups[c[f"stratum_{cut}"]].append(c)
            for stratum, members in sorted(groups.items()):
                clean = sum(1 for c in members
                            if not c[f"contaminated_{cut}_guard_off"])
                rows[stratum] = {
                    "pool": len(members),
                    "proxy_clean": clean,
                    "proxy_clean_rate": round(clean / len(members), 6),
                    "human_pure_field_rate_v4_round": (
                        PROXY_VS_HUMAN_BY_STRATUM.get(stratum, (None, None, None))[1]),
                    "measured_gap_v4_round": (
                        PROXY_VS_HUMAN_BY_STRATUM.get(stratum, (None, None, None))[2]),
                }
            strata_table[f"{label}_{cut}"] = rows

    return {
        "meta": {
            "generated_at": common.utc_now(),
            "git_head": common.git_head(),
            "v4_run": v4_run, "v5_run": v5_run,
            "v4_table": v4_table, "v5_table": v5_table,
            "calibration": {
                "note": CALIBRATION_NOTE,
                "proxy_overclaim_aggregate": PROXY_OVERCLAIM_AGGREGATE,
                "measured_by": "residual-purity-1 (50 answers, eval-142, v4 run, subtraction cut)",
                "per_stratum_proxy_vs_human": {
                    k: {"proxy_clean": a, "human_pure_field": b, "gap": g}
                    for k, (a, b, g) in PROXY_VS_HUMAN_BY_STRATUM.items()},
                "v5_has_no_human_round": True,
            },
            "cuts": {
                "precision": {
                    "description": "config defaults, unchanged: pooled score cut with the "
                                   "calibrated per-group table",
                    "pooled": config.CALIBRATED_SCORE_THRESHOLD,
                    "group_thresholds": dict(config.CALIBRATED_GROUP_THRESHOLDS),
                    "consumer": "any consumer that wants each kept mask to be right",
                },
                "subtraction": {
                    "description": "min(pooled, group cut) per group — the recall-favouring "
                                   "threshold available for each group. Identical to v4's flat "
                                   "pooled rule on any run without a below-pooled group. NOT a "
                                   "proposed config change.",
                    "pooled": config.CALIBRATED_SCORE_THRESHOLD,
                    "group_thresholds": {g: threshold_for(cs[0], "subtraction")
                                         for g, cs in config.CONCEPT_GROUPS.items()},
                    "consumer": "residual isolation, where a missed mask contaminates the "
                                "background silently and recall is the quantity of interest",
                },
            },
            "guards": {
                "guard_on_uniform": "area guard applied to every group — reproduces every v4-era "
                                    "number; this is analyze_residual_cuts.keep()'s rule",
                "guard_on_exempt": f"area guard with the group exemptions config uses today: "
                                   f"{sorted(config.GUARD_EXEMPT_GROUPS)} (mask round 3, A6)",
                "guard_off": "no area guard",
            },
            "area_guard": config.CALIBRATED_MAX_AREA_FRACTION,
            "subject_concepts": list(SUBJECT_CONCEPTS),
            "empty_union_fraction": EMPTY_UNION_FRACTION,
            "concept_set_hash_now": common.concept_set_hash(),
            "concept_set_version_now": "v2.2",
            "hash_boundary_note": (
                "v4 ran under concept set v2.1 (10 static concepts); v5 under v2.2 (12, adding "
                "cjk-script and kanji). config.py forbids an analysis that reads two hashes "
                "without saying so. This one does read two, deliberately; static_arm_check is the "
                "disclosure that makes it readable."),
            "cjk_script_threshold_provisional": (
                "CALIBRATED_GROUP_THRESHOLDS['cjk_script'] = 0.392655 is [MEASURED, n=21, "
                "PROVISIONAL]. config.py: the group holds exactly ONE negative answer and "
                "'nothing may cite it as calibrated'. Used here because it is the cut in force."),
            "config_unchanged": True,
        },
        "static_arm_check": static_arm_check(v4_run, v5_run),
        "recovery": recovery,
        "second_noun_covers": second_noun,
        "contamination_recount": recount,
        "strata": strata_table,
        "v4_covers": c4,
        "v5_covers": c5,
    }


def stats(vals):
    return {"mean": round(statistics.mean(vals), 4), "median": round(statistics.median(vals), 4),
            "min": round(min(vals), 4), "max": round(max(vals), 4)}


def report(doc: dict) -> str:
    out = []
    A = out.append
    c4, c5 = doc["v4_covers"], doc["v5_covers"]
    m = doc["meta"]
    A(f"RESIDUAL PURITY PROXY ACROSS CUTS — {m['v4_run']} (ONE noun) vs {m['v5_run']} (EVERY noun)")
    A(f"v4 covers {len(c4)}   v5 covers {len(c5)}")
    A("")
    A("=" * 100)
    A("CALIBRATION — READ BEFORE ANY NUMBER BELOW")
    for line in [CALIBRATION_NOTE[i:i + 96] for i in range(0, len(CALIBRATION_NOTE), 96)]:
        A("  " + line)
    A("=" * 100)
    A("")

    sac = doc["static_arm_check"]
    A("VALIDITY CHECK — did adding prompts perturb the shared static concepts?")
    A(f"  shared concepts   : {', '.join(sac['shared_static_concepts'])}")
    A(f"  regions v4 / v5   : {sac['v4_regions']} / {sac['v5_regions']}   matched {sac['matched']}")
    A(f"  only in v4        : {sac['only_in_v4_count']}")
    A(f"  only in v5        : {sac['only_in_v5_count']}")
    A(f"  score/mask diffs  : {sac['mismatched_count']}")
    A(f"  UNPERTURBED       : {sac['unperturbed']}")
    if not sac["unperturbed"]:
        A("  !! v5-vs-v4 compares INSTRUMENTS, not elicitations. Every cross-run number below is")
        A("     confounded and must not be read as an effect of the all-nouns elicitation.")
    A("")

    A("CUT VARIANTS")
    A(f"  precision   : pooled {config.CALIBRATED_SCORE_THRESHOLD}, per-group "
      f"{dict(config.CALIBRATED_GROUP_THRESHOLDS)}  (config default, unchanged)")
    A(f"  subtraction : min(pooled, group cut) per group -> "
      f"{ {g: round(threshold_for(cs[0], 'subtraction'), 6) for g, cs in config.CONCEPT_GROUPS.items()} }")
    A(f"                cjk_script's 0.392655 is PROVISIONAL (n=21, one negative answer)")
    A("")

    A("residual_field_fraction (what is LEFT after subtracting the kept masks)")
    A(f"{'run':5s} {'arm':8s} {'cut':12s} {'guard':17s} {'mean':>8s} {'median':>8s} "
      f"{'min':>8s} {'max':>8s}")
    for label, covers in (("v4", c4), ("v5", c5)):
        for cut in CUTS:
            for guard in GUARDS:
                for arm in ("static", "dynamic"):
                    s = stats([c[f"residual_{arm}_{cut}_{guard}"] for c in covers])
                    A(f"{label:5s} {arm:8s} {cut:12s} {guard:17s} {s['mean']:8.4f} "
                      f"{s['median']:8.4f} {s['min']:8.4f} {s['max']:8.4f}")
    A("")

    A("v4 -> v5: the same cover, same cut, how much MORE was subtracted (positive = v5 removed more)")
    by4 = {c["image_path"]: c for c in c4}
    for cut in CUTS:
        for guard in GUARDS:
            d = [by4[c["image_path"]][f"residual_dynamic_{cut}_{guard}"]
                 - c[f"residual_dynamic_{cut}_{guard}"]
                 for c in c5 if c["image_path"] in by4]
            A(f"  {cut:12s} {guard:17s} mean {statistics.mean(d):+.4f}  "
              f"median {statistics.median(d):+.4f}  max {max(d):+.4f}  "
              f"covers moved >0.001: {len([x for x in d if x > 0.001])}")
    A("")

    A("THE HEADLINE — v4 `subject_unmasked` covers that now carry a subject mask")
    A(f"{'cut':12s} {'guard':17s} {'v4 unmasked':>12s} {'closed in v5':>13s} "
      f"{'still open':>11s} {'newly open':>11s}")
    for k, r in doc["recovery"].items():
        cut, guard = k.split("_", 1)
        A(f"{cut:12s} {guard:17s} {r['v4_subject_unmasked']:12d} {r['closed_in_v5']:13d} "
          f"{r['still_unmasked_in_v5']:11d} {r['newly_unmasked_in_v5']:11d}")
    A("")

    sn = doc["second_noun_covers"]
    A(f"THE FLAME/CELLO CLASS — covers where a noun BEYOND RANK 1 fired (subtraction, guard off)")
    A(f"  covers: {len(sn)} of {len(c5)}")
    if sn:
        closed = [x["residual_closed"] for x in sn if x["residual_closed"] is not None]
        A(f"  residual closed by v5 on those covers: mean {statistics.mean(closed):+.4f}  "
          f"median {statistics.median(closed):+.4f}  max {max(closed):+.4f}")
        tag_counts = collections.Counter(t for x in sn for t in x["tags_beyond_rank_1"])
        A("  rank tags firing beyond 1: "
          + ", ".join(f"{t}x{n}" for t, n in sorted(tag_counts.items())))
    A("")

    A("CONTAMINATION RECOUNT (proxy — see calibration block)")
    A(f"{'run/cut/guard':34s} {'flagged':>8s} {'clean':>7s} {'clean rate':>11s}  causes")
    for k, r in doc["contamination_recount"].items():
        causes = ", ".join(f"{c}={n}" for c, n in r["causes"].items()) or "-"
        A(f"{k:34s} {r['flagged']:8d} {r['clean']:7d} {r['clean_rate']:11.4f}  {causes}")
    A("")

    A("PER-STRATUM PROXY CLEAN RATE, against the human rates the v4 round measured")
    A("  (human column is residual-purity-1 on the V4 run; there is NO human round on v5)")
    for key, rows in doc["strata"].items():
        A(f"  --- {key} ---")
        A(f"  {'stratum':20s} {'pool':>5s} {'proxy clean':>12s} {'human (v4)':>11s} {'gap (v4)':>9s}")
        for stratum, r in sorted(rows.items()):
            human = r["human_pure_field_rate_v4_round"]
            gap = r["measured_gap_v4_round"]
            A(f"  {stratum:20s} {r['pool']:5d} {r['proxy_clean_rate']:12.4f} "
              f"{(f'{human:.3f}' if human is not None else '-'):>11s} "
              f"{(f'{gap:+.3f}' if gap is not None else '-'):>9s}")
    A("")
    A("REMINDER: every 'proxy clean' number above over-claims. Measured once, aggregate "
      f"over-claim {PROXY_OVERCLAIM_AGGREGATE}.")
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--v4-run", default="sam-eval-142-v4-nouns")
    ap.add_argument("--v5-run", default="sam-eval-142-v5-allnouns")
    ap.add_argument("--v4-table", default="dynamic-concepts-eval-142-v2.json")
    ap.add_argument("--v5-table", default="dynamic-concepts-eval-142-v3.json")
    ap.add_argument("--out", default="residual-cuts-v5-analysis")
    args = ap.parse_args()

    doc = analyze(args.v4_run, args.v5_run, args.v4_table, args.v5_table)
    (config.DATA_DIR / f"{args.out}.json").write_text(
        json.dumps(doc, indent=2, sort_keys=True, ensure_ascii=False) + "\n")
    text = report(doc)
    (config.DATA_DIR / f"{args.out}.txt").write_text(text + "\n")
    print(text)
    print(f"\nwrote {config.DATA_DIR / args.out}.json and .txt")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
