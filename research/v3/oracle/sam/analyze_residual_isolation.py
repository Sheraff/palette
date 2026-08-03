"""Residual isolation: does subtracting every mask leave the background and nothing else?

CPU only. Reads the dynamic run and the stored static run, writes one analysis JSON and a
readable text report. Modifies no stored run.

    .venv/bin/python analyze_residual_isolation.py \
        --run sam-eval-142-v3-dynamic --static-run sam-eval-142-v2

FOUR CONDITIONS, ALL FROM THE SAME RUN. `static` and `dynamic` are both computed from the
dynamic run's own rows — the static half is simply the regions whose `concept_is_dynamic` is
false. That is deliberate: comparing against the separately-stored `sam-eval-142-v2` would
confound the prompt change with a different model load and a different decode. The stored v2 run
is still read, and used for one thing only — to check that adding prompts did not perturb the
static answers (`--static-run`). If that check fails, the whole comparison is void and the report
says so.

GUARD ON AND GUARD OFF, BOTH REPORTED. `config.CALIBRATED_MAX_AREA_FRACTION = 0.5` rejects any
region covering more than half the cover. Its own comment records the exposure: corpus-wide, 5 of
the 6 big-area regions that clear the score cut are `person`, "a person filling most of a cover is
an ordinary artwork", and whether people should be exempt is loose end A6 — undecided. Residual
isolation is exactly the use where a big correct subject mask is the point, so neither variant is
treated as the answer here.
"""

from __future__ import annotations

import argparse
import collections
import json
import statistics
from pathlib import Path

import numpy as np

import common
import config
import dynamic_concepts

# [REVIEWED] Concepts that mask a depicted subject, static or dynamic. Used only for the
# contamination proxy below — a cover whose subject has no mask has its subject in the residual.
SUBJECT_CONCEPTS = ("person", "face", "dyn-animal", "dyn-vehicle", "dyn-object", "dyn-building")

# [REVIEWED] The `subject_kind` values that a maskable noun exists for. `abstract_shape` is
# excluded because dynamic_concepts.py deliberately gives it no prompt, and `not_applicable`
# because the cover has no subject to leak.
MASKABLE_SUBJECT_KINDS = ("person", "animal", "vehicle", "object", "building_or_structure")

# [UNCALIBRATED] Below this share of the cover, a group's calibrated union is treated as "nothing
# survived" rather than as a small mask. Chosen as a round 0.2% of the cover — smaller than every
# per-cover text union this corpus produces when text IS masked, and larger than a stray pixel
# run. It only selects which covers get COUNTED as a text gap; no threshold in config moves.
EMPTY_UNION_FRACTION = 0.002


def load_run(stem: str) -> tuple[dict[str, dict], dict[str, list[dict]]]:
    rows = common.read_jsonl(config.DATA_DIR / f"{stem}.jsonl")
    images = {r["image_path"]: r for r in rows
              if r.get("record_type") == config.RECORD_TYPE_IMAGE and r.get("status") == "ok"}
    regions: dict[str, list[dict]] = collections.defaultdict(list)
    for r in rows:
        if r.get("record_type") == config.RECORD_TYPE_REGION:
            regions[r["image_path"]].append(r)
    return images, dict(regions)


def keep(region: dict, guard: bool) -> bool:
    """The calibrated cut, with the area guard on or off. Per-group thresholds always apply."""
    return config.passes_calibrated_cut(
        region["score"], region["area_fraction"], region["concept"],
        max_area_fraction=config.CALIBRATED_MAX_AREA_FRACTION if guard else None)


def residual_of(regions: list[dict], height: int, width: int) -> float:
    """1 - (area of the union of these regions). Recomputed from the RLEs, never from a stored
    aggregate, so every condition is measured the same way."""
    if not regions:
        return 1.0
    union = np.zeros((height, width), dtype=np.uint8)
    for r in regions:
        union |= common.rle_decode(r["mask_rle"], r["mask_height"], r["mask_width"])
    return 1.0 - float(union.sum()) / float(height * width)


def check_static_unperturbed(dyn_regions: dict[str, list[dict]],
                             static_stem: str) -> dict:
    """Did adding prompts change the static answers? It must not: predict_multi shares one
    backbone pass and applies NMS per prompt, never across prompts. Verified, not assumed.

    One expected and harmless difference is classified rather than counted as a failure.
    `sam-eval-142-v2` was run under concept set **v2** (9 concepts); this run uses **v2.1**, which
    added `barcode` — config.py's own note says a v2 run must be re-run before an analysis reads
    it alongside barcode rows. So a cover whose only difference is `barcode` regions is a
    concept-set difference, not a perturbation. A difference in any concept BOTH runs asked is a
    real perturbation and voids the comparison.
    """
    v2_images, v2_regions = load_run(static_stem)
    if not v2_images:
        return {"checked": False, "reason": f"{static_stem} not readable"}

    def sig(rows):
        return sorted((r["concept"], r["instance_idx"], round(r["score"], 4),
                       round(r["area_fraction"], 6)) for r in rows)

    shared_concepts = {r["concept"] for rows in v2_regions.values() for r in rows}
    compared = matched = added_only = 0
    perturbed = []
    for path, rows in dyn_regions.items():
        if path not in v2_regions:
            continue
        static_only = [r for r in rows if not r.get("concept_is_dynamic")]
        compared += 1
        a, b = sig(static_only), sig(v2_regions[path])
        if a == b:
            matched += 1
            continue
        # Restrict both sides to concepts the older run actually asked.
        a_shared = [t for t in a if t[0] in shared_concepts]
        if a_shared == b:
            added_only += 1
            continue
        perturbed.append({"image_path": path,
                          "only_in_dynamic_run": sorted(set(a) - set(b))[:6],
                          "only_in_static_run": sorted(set(b) - set(a))[:6]})
    return {"checked": True, "source": static_stem, "images_compared": compared,
            "identical": matched,
            "differ_only_by_concepts_absent_from_the_older_run": added_only,
            "concepts_only_in_this_run": sorted(
                {c for c, _ in config.CONCEPT_PROMPTS} - shared_concepts),
            "perturbed": len(perturbed), "examples": perturbed[:5]}


def analyze(run: str, static_run: str, table_name: str) -> dict:
    images, regions = load_run(run)
    table = dynamic_concepts.load(config.DATA_DIR / table_name)
    answers = dynamic_concepts._pilot_answers()

    per_cover = []
    for path, image_row in sorted(images.items()):
        rows = regions.get(path, [])
        h, w = image_row["height"], image_row["width"]
        cover = table[path]
        cell = {"image_path": path, "artwork_id": image_row["artwork_id"],
                "width": w, "height": h,
                "subject_kind_agreed": cover["subject_kind_agreed"],
                "overlays_agreed": cover["overlays_agreed"],
                "dynamic_concepts": cover["dynamic_concepts"]}

        for guard in (True, False):
            gk = "guard_on" if guard else "guard_off"
            kept = [r for r in rows if keep(r, guard)]
            static_kept = [r for r in kept if not r.get("concept_is_dynamic")]
            dyn_kept = [r for r in kept if r.get("concept_is_dynamic")]
            cell[f"residual_static_{gk}"] = round(residual_of(static_kept, h, w), 9)
            cell[f"residual_dynamic_{gk}"] = round(residual_of(kept, h, w), 9)
            cell[f"n_regions_{gk}"] = len(kept)
            cell[f"n_dynamic_regions_{gk}"] = len(dyn_kept)
            cell[f"dynamic_concepts_firing_{gk}"] = sorted({r["concept"] for r in dyn_kept})
            # Group unions at this cut, for the contamination proxies.
            for group, concepts in config.CONCEPT_GROUPS.items():
                sub = [r for r in kept if r["concept"] in concepts]
                cell[f"{group}_union_{gk}"] = round(1.0 - residual_of(sub, h, w), 9)
            subj = [r for r in kept if r["concept"] in SUBJECT_CONCEPTS]
            cell[f"subject_union_{gk}"] = round(1.0 - residual_of(subj, h, w), 9)
            cell[f"has_subject_mask_{gk}"] = bool(subj)

        # Best score each asked dynamic concept reached ANYWHERE on this cover, including below
        # every cut. A concept that returns nothing at all at the 0.3 capture floor is a
        # different failure from one that returns a region and loses it to the cut, and the
        # asked-vs-fired table cannot tell them apart.
        cell["dynamic_best_score_by_concept"] = {
            tag: round(max((r["score"] for r in rows if r["concept"] == tag), default=0.0), 6)
            for tag in cover["dynamic_concepts"]}

        # Regions the guard alone removed, and what they were.
        guarded_out = [r for r in rows if keep(r, False) and not keep(r, True)]
        cell["guarded_out"] = [{"concept": r["concept"], "score": r["score"],
                                "area_fraction": r["area_fraction"]} for r in guarded_out]

        # -- contamination proxies, guard-off (the variant that gives isolation its best shot) --
        has_text = dynamic_concepts._agreed_single(answers.get(path, {}), "has_text")
        cell["has_text_agreed"] = has_text
        causes = []
        kind = cover["subject_kind_agreed"]
        if kind in MASKABLE_SUBJECT_KINDS and not cell["has_subject_mask_guard_off"]:
            causes.append("subject_unmasked")
        if has_text == "yes" and cell["text_like_union_guard_off"] < EMPTY_UNION_FRACTION:
            causes.append("text_below_cut")
            # Two very different failures wear the same label, so they are split here. The
            # `text_like` group cut is 0.697295, well above the pooled 0.578: a cover whose text
            # masks sit between the two is lost to a THRESHOLD CHOICE and is recoverable by
            # changing it. A cover with nothing above 0.578 at all is the A12 shape — the class
            # "chinese characters" tops out at 0.472 anywhere — and no threshold in force recovers
            # it. Only the second is a gap in the instrument.
            text_rows = [r for r in rows if r["concept"] in config.CONCEPT_GROUPS["text_like"]]
            at_pooled = [r for r in text_rows
                         if r["score"] >= config.CALIBRATED_SCORE_THRESHOLD]
            cell["text_gap_recoverable_at_pooled_cut"] = bool(at_pooled)
            cell["text_best_score"] = round(max((r["score"] for r in text_rows), default=0.0), 6)
            if not at_pooled:
                causes.append("text_below_pooled_cut_too")
        if kind is None:
            causes.append("subject_kind_variants_disagree")
        elif kind == "abstract_shape":
            causes.append("abstract_shape_no_noun")
        cell["contamination_causes"] = causes
        cell["contaminated"] = bool(causes)
        per_cover.append(cell)

    return {
        "meta": {
            "run": run,
            "table": table_name,
            "generated_at": common.utc_now(),
            "git_head": common.git_head(),
            "covers": len(per_cover),
            "calibrated_cut": {
                "score_threshold": config.CALIBRATED_SCORE_THRESHOLD,
                "group_thresholds": dict(config.CALIBRATED_GROUP_THRESHOLDS),
                "max_area_fraction_when_guard_on": config.CALIBRATED_MAX_AREA_FRACTION,
                "dynamic_concepts_use_pooled_threshold": True,
            },
            "empty_union_fraction": EMPTY_UNION_FRACTION,
            "static_unperturbed_check": check_static_unperturbed(regions, static_run),
        },
        "covers": per_cover,
    }


def report(doc: dict) -> str:
    covers = doc["covers"]
    out = []
    A = out.append
    A(f"RESIDUAL ISOLATION — {doc['meta']['run']}, {len(covers)} covers")
    chk = doc["meta"]["static_unperturbed_check"]
    if chk.get("checked"):
        A(f"static-answers-unperturbed check vs {chk['source']}: "
          f"{chk['identical']}/{chk['images_compared']} byte-identical, "
          f"{chk['differ_only_by_concepts_absent_from_the_older_run']} differ only by "
          f"{','.join(chk['concepts_only_in_this_run']) or '(none)'} "
          f"(added after that run), {chk['perturbed']} genuinely perturbed")
    A("")

    A("residual_field_fraction, mean / median (higher = more subtracted away is NOT the goal;")
    A("the goal is that what remains is field, which only the review round can say)")
    A(f"{'condition':28s} {'mean':>8s} {'median':>8s} {'min':>8s} {'max':>8s}")
    for gk in ("guard_on", "guard_off"):
        for arm in ("static", "dynamic"):
            vals = [c[f"residual_{arm}_{gk}"] for c in covers]
            A(f"{arm + ' / ' + gk:28s} {statistics.mean(vals):8.4f} "
              f"{statistics.median(vals):8.4f} {min(vals):8.4f} {max(vals):8.4f}")
    A("")

    A("what dynamic prompting newly captured (residual_static - residual_dynamic)")
    for gk in ("guard_on", "guard_off"):
        d = [c[f"residual_static_{gk}"] - c[f"residual_dynamic_{gk}"] for c in covers]
        moved = [x for x in d if x > 0.001]
        A(f"  {gk:9s} mean {statistics.mean(d):+.4f}  median {statistics.median(d):+.4f}  "
          f"max {max(d):+.4f}  covers moved >0.001: {len(moved)}")
        with_dyn = [c for c in covers if c["dynamic_concepts"]]
        dd = [c[f"residual_static_{gk}"] - c[f"residual_dynamic_{gk}"] for c in with_dyn]
        if dd:
            A(f"            over the {len(with_dyn)} covers that HAD a dynamic concept: "
              f"mean {statistics.mean(dd):+.4f}  median {statistics.median(dd):+.4f}")
    A("")

    A("dynamic concepts: asked vs fired above the calibrated cut (guard_off)")
    asked = collections.Counter(t for c in covers for t in c["dynamic_concepts"])
    fired = collections.Counter(t for c in covers for t in c["dynamic_concepts_firing_guard_off"])
    A(f"  {'concept':16s} {'asked':>6s} {'fired':>6s} {'rate':>7s}")
    for tag in sorted(asked):
        A(f"  {tag:16s} {asked[tag]:6d} {fired.get(tag, 0):6d} "
          f"{fired.get(tag, 0) / asked[tag]:7.2f}")
    A("  best score reached per asked cover (0.00 = the concept returned nothing at all,")
    A("  even at the 0.3 capture floor):")
    for tag in sorted(asked):
        vals = sorted((c["dynamic_best_score_by_concept"][tag] for c in covers
                       if tag in c["dynamic_best_score_by_concept"]), reverse=True)
        A(f"    {tag:16s} {[round(v, 2) for v in vals]}")
    A("")

    A("area guard: what it removes")
    g = collections.Counter(x["concept"] for c in covers for x in c["guarded_out"])
    total = sum(g.values())
    A(f"  {total} regions removed by the guard, on "
      f"{sum(1 for c in covers if c['guarded_out'])} covers")
    for k, n in g.most_common():
        A(f"    {k:16s} {n:4d}")
    A("")

    A("contaminated residuals (proxy, guard_off — NOT a pixel judgment)")
    bad = [c for c in covers if c["contaminated"]]
    A(f"  {len(bad)} of {len(covers)} covers carry at least one cause")
    causes = collections.Counter(x for c in covers for x in c["contamination_causes"])
    for k, n in causes.most_common():
        A(f"    {k:32s} {n:4d}")
    A("")
    tb = [c for c in covers if "text_below_cut" in c["contamination_causes"]]
    rec = [c for c in tb if c.get("text_gap_recoverable_at_pooled_cut")]
    A(f"  of the {len(tb)} text_below_cut covers: {len(rec)} are recoverable at the POOLED cut "
      f"(the raised text_like cut of {config.CALIBRATED_GROUP_THRESHOLDS['text_like']:.4f} is the "
      f"cause), {len(tb) - len(rec)} have nothing above the pooled cut either — the A12 shape")
    A("")
    A("  subject_unmasked, by agreed subject_kind:")
    by_kind = collections.Counter(c["subject_kind_agreed"] for c in covers
                                  if "subject_unmasked" in c["contamination_causes"])
    for k, n in by_kind.most_common():
        A(f"    {str(k):32s} {n:4d}")
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", default="sam-eval-142-v3-dynamic")
    ap.add_argument("--static-run", default="sam-eval-142-v2")
    ap.add_argument("--table", default="dynamic-concepts-eval-142.json")
    ap.add_argument("--out", default="residual-isolation-analysis")
    args = ap.parse_args()

    doc = analyze(args.run, args.static_run, args.table)
    (config.DATA_DIR / f"{args.out}.json").write_text(
        json.dumps(doc, indent=2, sort_keys=True) + "\n")
    text = report(doc)
    (config.DATA_DIR / f"{args.out}.txt").write_text(text + "\n")
    print(text)
    print(f"\nwrote {config.DATA_DIR / (args.out + '.json')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
