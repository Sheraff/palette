"""Residual purity across CUT VARIANTS, and v3-dynamic (class words) vs v4-nouns (class + species).

CPU only. Reads two stored runs and their two derivation tables, writes one analysis JSON and a
readable text report. Modifies no stored run and NO THRESHOLD IN config.py MOVES.

    .venv/bin/python analyze_residual_cuts.py \
        --v3-run sam-eval-142-v3-dynamic --v4-run sam-eval-142-v4-nouns

WHY THIS IS A SECOND SCRIPT AND NOT AN EDIT TO analyze_residual_isolation.py. That script produced
the numbers in RESIDUAL_EXPERIMENT_NOTES.md §5 and is the record of the v3 run; it is also owned by
the residual workstream and may be read by a sibling. Two things here would change its output:
`dyn-noun` has to join SUBJECT_CONCEPTS or every noun mask is invisible to the contamination proxy,
and a second cut variant has to exist. Both are additive elsewhere and destructive in place.

TWO CUTS, AND THEY BELONG TO DIFFERENT CONSUMERS. This is the point of the round.

  * PRECISION CUT — `config`'s own defaults, unchanged: the pooled 0.578 with `text_like` raised to
    0.697295. Calibrated by the mask-quality round for a consumer that wants each kept mask to be
    RIGHT. Every stored artifact and every published number uses this. It stays the default here
    and nothing about it is being proposed.

  * SUBTRACTION CUT — the pooled 0.578 applied to every group, `text_like` included. This is NOT a
    better calibration and it is NOT proposed as a config change. It is what a DIFFERENT consumer
    wants. Residual isolation subtracts masks and keeps what is left, so a missed text mask does
    not cost a wrong region — it costs a contaminated background, silently. That asymmetry makes
    recall the quantity of interest, and RESIDUAL_EXPERIMENT_NOTES.md §5.4 already priced it:
    **15 of the 26 text-contaminated residuals have text masks sitting between 0.578 and
    0.697295**, lost to a threshold choice rather than to the instrument. The remaining 11 are the
    A12 shape and no threshold in force recovers them.

    Stated as plainly as possible: raising `text_like` to 0.697295 was right for the consumer it
    was calibrated for. Subtraction is a different consumer. Naming the cut after its consumer,
    rather than proposing one cut for both, is the whole content of this section.
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

# [REVIEWED] Concepts that mask a depicted subject. `analyze_residual_isolation.py`'s tuple plus
# `dyn-noun`, without which every species mask this round exists to measure would be invisible to
# the contamination proxy and every noun cover would be miscounted as `subject_unmasked`.
SUBJECT_CONCEPTS = ("person", "face", "dyn-animal", "dyn-vehicle", "dyn-object", "dyn-building",
                    "dyn-noun")

# [REVIEWED] Verbatim from analyze_residual_isolation.py: the `subject_kind` values a maskable noun
# exists for. `abstract_shape` and `not_applicable` are excluded there because v1 gave them no
# prompt at all; they stay excluded here so the v3-vs-v4 recount compares the same denominator,
# even though v2 does now hand several of them a species noun.
MASKABLE_SUBJECT_KINDS = ("person", "animal", "vehicle", "object", "building_or_structure")

# [UNCALIBRATED] Carried over verbatim from analyze_residual_isolation.py so the text-gap counts
# here are comparable to the ones already published: below this share of the cover, a group's union
# is "nothing survived" rather than a small mask. It selects which covers get COUNTED; no threshold
# in config moves.
EMPTY_UNION_FRACTION = 0.002

CUTS = ("precision", "subtraction")


def threshold_for(concept: str, cut: str) -> float:
    """The score threshold in force for this concept under this cut.

    `precision` delegates to config so it can never drift from the shipped default. `subtraction`
    is the pooled value for every group — deliberately ignoring the calibrated per-group raise,
    for the consumer reason in the module docstring.
    """
    if cut == "precision":
        return config.calibrated_threshold_for(concept)
    return config.CALIBRATED_SCORE_THRESHOLD


def keep(region: dict, guard: bool, cut: str) -> bool:
    if region["score"] < threshold_for(region["concept"], cut):
        return False
    if guard and region["area_fraction"] > config.CALIBRATED_MAX_AREA_FRACTION:
        return False
    return True


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
            "subject_noun_prompt": cover.get("subject_noun_prompt"),
            "subject_noun_disposition": cover.get("subject_noun_disposition"),
        }
        has_text = v1._agreed_single(answers.get(path, {}), "has_text")
        cell["has_text_agreed"] = has_text

        for cut in CUTS:
            for guard in (True, False):
                k = f"{cut}_{'guard_on' if guard else 'guard_off'}"
                kept = [r for r in rows if keep(r, guard, cut)]
                static_kept = [r for r in kept if not r.get("concept_is_dynamic")]
                dyn_kept = [r for r in kept if r.get("concept_is_dynamic")]
                cell[f"residual_static_{k}"] = round(residual_of(static_kept, h, w), 9)
                cell[f"residual_dynamic_{k}"] = round(residual_of(kept, h, w), 9)
                cell[f"n_regions_{k}"] = len(kept)
                cell[f"dynamic_firing_{k}"] = sorted({r["concept"] for r in dyn_kept})
                subj = [r for r in kept if r["concept"] in SUBJECT_CONCEPTS]
                cell[f"has_subject_mask_{k}"] = bool(subj)
                cell[f"subject_union_{k}"] = round(1.0 - residual_of(subj, h, w), 9)
                for group, concepts in config.CONCEPT_GROUPS.items():
                    sub = [r for r in kept if r["concept"] in concepts]
                    cell[f"{group}_union_{k}"] = round(1.0 - residual_of(sub, h, w), 9)

                # ---- contamination proxies at THIS cut, guard-off being the variant that gives
                # isolation its best shot; both are computed so neither has to be assumed.
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
                # v1 counted `subject_kind_variants_disagree` and `abstract_shape_no_noun` as
                # causes because those covers could not be prompted AT ALL. Under v2 most of them
                # carry a species noun, so the honest cause is "nothing was ever asked", not "the
                # class enum was unusable". Renamed and re-derived rather than carried over.
                if not prompted and kind != "not_applicable":
                    causes.append("no_subject_prompt_at_all")
                cell[f"contamination_causes_{k}"] = causes
                cell[f"contaminated_{k}"] = bool(causes)
        out.append(cell)
    return out


def stats(vals):
    return {"mean": round(statistics.mean(vals), 4), "median": round(statistics.median(vals), 4),
            "min": round(min(vals), 4), "max": round(max(vals), 4)}


def analyze(v3_run: str, v4_run: str, v3_table: str, v4_table: str) -> dict:
    answers = v1._pilot_answers()
    t3 = v1.load(config.DATA_DIR / v3_table)
    t4 = v2.load(config.DATA_DIR / v4_table)
    c3 = per_cover(v3_run, t3, answers)
    c4 = per_cover(v4_run, t4, answers)

    by_path3 = {c["image_path"]: c for c in c3}
    by_path4 = {c["image_path"]: c for c in c4}

    # ---- the headline: the 24 `object` covers, the class word's measured dead end ----
    object_paths = [p for p, c in t4.items() if c["subject_kind_agreed"] == "object"]
    object_recovery = []
    for p in sorted(object_paths):
        a, b = by_path3.get(p), by_path4.get(p)
        if a is None or b is None:
            continue
        object_recovery.append({
            "image_path": p,
            "noun_prompt": t4[p].get("subject_noun_prompt"),
            "noun_disposition": t4[p].get("subject_noun_disposition"),
            "v3_subject_mask": a["has_subject_mask_precision_guard_off"],
            "v4_subject_mask": b["has_subject_mask_precision_guard_off"],
            "v4_noun_fired": "dyn-noun" in b["dynamic_firing_precision_guard_off"],
            "v3_residual": a["residual_dynamic_precision_guard_off"],
            "v4_residual": b["residual_dynamic_precision_guard_off"],
        })

    return {
        "meta": {
            "generated_at": common.utc_now(),
            "git_head": common.git_head(),
            "v3_run": v3_run, "v4_run": v4_run,
            "v3_table": v3_table, "v4_table": v4_table,
            "cuts": {
                "precision": {
                    "description": "config defaults, unchanged: pooled score cut with the "
                                   "calibrated per-group raise for text_like",
                    "pooled": config.CALIBRATED_SCORE_THRESHOLD,
                    "group_thresholds": dict(config.CALIBRATED_GROUP_THRESHOLDS),
                    "consumer": "any consumer that wants each kept mask to be right",
                },
                "subtraction": {
                    "description": "pooled score cut applied to EVERY group, text_like included. "
                                   "NOT a proposed config change; a different consumer's cut.",
                    "pooled": config.CALIBRATED_SCORE_THRESHOLD,
                    "group_thresholds": {},
                    "consumer": "residual isolation, where a missed mask contaminates the "
                                "background silently and recall is therefore the quantity of "
                                "interest",
                },
            },
            "area_guard": config.CALIBRATED_MAX_AREA_FRACTION,
            "subject_concepts": list(SUBJECT_CONCEPTS),
            "empty_union_fraction": EMPTY_UNION_FRACTION,
            "config_unchanged": True,
        },
        "v3_covers": c3,
        "v4_covers": c4,
        "object_recovery": object_recovery,
    }


def report(doc: dict) -> str:
    L, A = [], None
    out = []
    A = out.append
    c3, c4 = doc["v3_covers"], doc["v4_covers"]
    A(f"RESIDUAL PURITY ACROSS CUT VARIANTS — {doc['meta']['v3_run']} vs {doc['meta']['v4_run']}")
    A(f"v3 covers {len(c3)}   v4 covers {len(c4)}")
    A("")
    A("CUT VARIANTS")
    A(f"  precision   : pooled {config.CALIBRATED_SCORE_THRESHOLD}, text_like raised to "
      f"{config.CALIBRATED_GROUP_THRESHOLDS['text_like']:.6f}  (config default, unchanged)")
    A(f"  subtraction : pooled {config.CALIBRATED_SCORE_THRESHOLD} for EVERY group "
      f"(recall-oriented; a different consumer's cut, NOT a config proposal)")
    A("")

    A("residual_field_fraction (what is LEFT after subtracting the kept masks)")
    A(f"{'run':6s} {'arm':8s} {'cut':12s} {'guard':9s} {'mean':>8s} {'median':>8s} "
      f"{'min':>8s} {'max':>8s}")
    for label, covers in (("v3", c3), ("v4", c4)):
        for cut in CUTS:
            for guard in ("guard_on", "guard_off"):
                for arm in ("static", "dynamic"):
                    key = f"residual_{arm}_{cut}_{guard}"
                    s = stats([c[key] for c in covers])
                    A(f"{label:6s} {arm:8s} {cut:12s} {guard:9s} {s['mean']:8.4f} "
                      f"{s['median']:8.4f} {s['min']:8.4f} {s['max']:8.4f}")
    A("")

    A("what the SPECIES noun newly captured, v4 dynamic vs v4 static, per cut")
    for cut in CUTS:
        for guard in ("guard_on", "guard_off"):
            d = [c[f"residual_static_{cut}_{guard}"] - c[f"residual_dynamic_{cut}_{guard}"]
                 for c in c4]
            moved = [x for x in d if x > 0.001]
            A(f"  {cut:12s} {guard:9s} mean {statistics.mean(d):+.4f}  "
              f"median {statistics.median(d):+.4f}  max {max(d):+.4f}  "
              f"covers moved >0.001: {len(moved)}")
    A("")

    A("v3 -> v4: the same cover, same cut, how much more was subtracted")
    by3 = {c["image_path"]: c for c in c3}
    for cut in CUTS:
        d = [by3[c["image_path"]][f"residual_dynamic_{cut}_guard_off"]
             - c[f"residual_dynamic_{cut}_guard_off"]
             for c in c4 if c["image_path"] in by3]
        A(f"  {cut:12s} mean {statistics.mean(d):+.4f}  median {statistics.median(d):+.4f}  "
          f"max {max(d):+.4f}  covers moved >0.001: {len([x for x in d if x > 0.001])}")
    A("")

    A("dynamic concepts: asked vs fired above the cut (guard_off)")
    for label, covers, table_key in (("v3", c3, "v3"), ("v4", c4, "v4")):
        asked = collections.Counter(t for c in covers for t in c["dynamic_concepts"])
        for cut in CUTS:
            fired = collections.Counter(
                t for c in covers for t in c[f"dynamic_firing_{cut}_guard_off"])
            A(f"  {label} / {cut}")
            for tag in sorted(asked):
                A(f"    {tag:16s} asked {asked[tag]:4d}  fired {fired.get(tag, 0):4d}  "
                  f"rate {fired.get(tag, 0) / asked[tag]:5.2f}")
    A("")

    A("THE OBJECT COVERS — the class word's measured dead end (0 of 24 under v3)")
    rec = doc["object_recovery"]
    v3m = sum(1 for r in rec if r["v3_subject_mask"])
    v4m = sum(1 for r in rec if r["v4_subject_mask"])
    v4n = sum(1 for r in rec if r["v4_noun_fired"])
    A(f"  {len(rec)} covers whose agreed subject_kind is `object`")
    A(f"  v3 (class word only) : {v3m} carry a subject mask at the precision cut, guard off")
    A(f"  v4 (class + species) : {v4m} carry a subject mask   <- the recovery count")
    A(f"  of which the species noun itself fired: {v4n}")
    nonoun = [r for r in rec if not r["noun_prompt"]]
    A(f"  covers with no usable noun at all: {len(nonoun)} "
      f"({collections.Counter(r['noun_disposition'] for r in nonoun).most_common()})")
    A("")
    A("  per cover (noun -> did a subject mask survive):")
    for r in rec:
        A(f"    {r['image_path'][-28:]:28s} {str(r['noun_prompt'])[:18]:18s} "
          f"v3={'Y' if r['v3_subject_mask'] else 'n'} v4={'Y' if r['v4_subject_mask'] else 'n'} "
          f"noun_fired={'Y' if r['v4_noun_fired'] else 'n'} "
          f"resid {r['v3_residual']:.3f}->{r['v4_residual']:.3f}")
    A("")

    A("CONTAMINATION RECOUNT, by cause, per run and cut (guard_off)")
    for label, covers in (("v3", c3), ("v4", c4)):
        for cut in CUTS:
            key = f"contamination_causes_{cut}_guard_off"
            bad = [c for c in covers if c[key]]
            causes = collections.Counter(x for c in covers for x in c[key])
            A(f"  {label} / {cut:12s}: {len(bad)} of {len(covers)} covers carry a cause "
              f"({len(covers) - len(bad)} clean by proxy)")
            for k, n in causes.most_common():
                A(f"      {k:34s} {n:4d}")
    A("")
    A("  the text gap, split (v4):")
    for cut in CUTS:
        key = f"contamination_causes_{cut}_guard_off"
        tb = [c for c in c4 if "text_below_cut" in c[key]]
        rec2 = [c for c in tb if c.get(f"text_gap_recoverable_at_pooled_{cut}_guard_off")]
        A(f"    {cut:12s} text_below_cut {len(tb):3d}  of which recoverable at the pooled cut "
          f"{len(rec2):3d}  A12 shape {len(tb) - len(rec2):3d}")
    A("")
    A("  subject_unmasked by agreed subject_kind (v4, precision, guard_off):")
    bk = collections.Counter(c["subject_kind_agreed"] for c in c4
                             if "subject_unmasked" in c["contamination_causes_precision_guard_off"])
    for k, n in bk.most_common():
        A(f"    {str(k):32s} {n:4d}")
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--v3-run", default="sam-eval-142-v3-dynamic")
    ap.add_argument("--v4-run", default="sam-eval-142-v4-nouns")
    ap.add_argument("--v3-table", default="dynamic-concepts-eval-142.json")
    ap.add_argument("--v4-table", default="dynamic-concepts-eval-142-v2.json")
    ap.add_argument("--out", default="residual-cuts-analysis")
    args = ap.parse_args()
    doc = analyze(args.v3_run, args.v4_run, args.v3_table, args.v4_table)
    (config.DATA_DIR / f"{args.out}.json").write_text(json.dumps(doc, indent=2, sort_keys=True) + "\n")
    text = report(doc)
    (config.DATA_DIR / f"{args.out}.txt").write_text(text + "\n")
    print(text)
    print(f"\nwrote {config.DATA_DIR / (args.out + '.json')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
