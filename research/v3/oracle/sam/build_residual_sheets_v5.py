"""Three-panel residual sheets for the v5-allnouns run — artwork | guard ON | guard OFF.

CPU only. Builds SHEETS AND A PROPOSAL for a `residual-purity-2` round. **It does not push a round.**
Pushing is the reviewer's call and this script has no path that does it.

    .venv/bin/python build_residual_sheets_v5.py --write

WHY A THIRD BUILDER. `build_residual_sheets.py` writes the v3 round's fixed paths and
`build_residual_sheets_v4.py` writes `residual-sheets-v4/` + `residual-sheets-v4-sample.json` —
the artifacts `residual-purity-1` was actually run on and that RESIDUAL_PURITY_VERDICT.md points
at. Rebuilding either in place would silently replace a round's record with different content
while the verdict still described it. This writes `residual-sheets-v5/` and
`residual-sheets-v5-sample.json`; both predecessors stay exactly where their rounds left them.
Rendering, checkerboard, panel scale, label strip, font and the panel cut are REUSED from the v4
module rather than re-implemented, so all three rounds' sheets are the same instrument.

THE ONE INSTRUMENT CHANGE, AND IT IS THE FIX THE LAST ROUND ASKED FOR. `residual-purity-1` offered
`pure field / mostly field / not field` and nothing else. After release the reviewer said:

    "sometimes it's hard to tell what is field and what is subject, so answers for those cases are
     not reliable (even with human feedback) unless we add an escape answer choice."

So the proposed answer set here has FOUR options, adding **"can't tell what is field here"**. This
is proposed decision record `d-2026-08-04-purity-rounds-need-escape-answer` and it is required by
the question set's design rule 8 — a slot must be able to record the answer, and on genuinely
ambiguous figure/ground covers no existing slot could. `GROUND_FREETEXT_SYNTHESIS.md` independently
found 3 of 9 covers ambiguous in unconstrained prose, so **the escape share is itself a measurement**
— figure/ground ambiguity signal, not noise — and the spec below says how it is to be reported so it
cannot be quietly folded into a purity rate.

WHAT IS NOT CHANGED, DELIBERATELY. Same three panels, same subtraction cut, same five strata, same
25-sheet size, same inverse-probability reweighting, and **the same bar: reweighted pure-field
>= 0.75 with no stratum below 0.50**. The bar is HELD rather than moved, for the reason
RESIDUAL_EXPERIMENT_NOTES.md §11.11 gives about the last one: moving a pre-registered bar because a
different measurement improved is the exact failure pre-registration exists to prevent. v5's proxy
improved. That is not evidence about purity — the v4 round proved precisely that — so the bar stays
where it was.
"""

from __future__ import annotations

import argparse
import collections
import json
import random

import build_residual_sheets_v4 as v4b
import common
import config
import dynamic_concepts_v3 as v3

# [REVIEWED] A distinct seed from the v3 round (20260803) and the v4 round (20260804), continuing
# the established pattern. If two rounds shared a seed, an overlapping sample would look like a
# deliberate paired design when it was an accident of the RNG. Different seed, independently drawn
# sample, stated.
SEED = 20260805

# [REVIEWED] Strata and quotas carry over from the v4 round UNCHANGED, so the two rounds are
# readable side by side and the reweighting is comparable. `class-only` is quota 3 against a pool
# that has never held 3; it draws the whole pool, exactly as it did in v4, which is why the round
# is 25 sheets and not 26.
QUOTAS = v4b.QUOTAS

ITEM_PREFIX = "resid5-"

# The cut the panels are rendered at, unchanged from v4. See build_residual_sheets_v4's docstring:
# rendering at the precision cut would ask the reviewer to judge a threshold choice while believing
# they were judging an instrument.
PANEL_CUT = v4b.PANEL_CUT

# [REVIEWED] THE PROPOSED ANSWER SET. Four options, not three. The first three are byte-identical to
# `residual-purity-1`'s so the two rounds' answers pool where they can; the fourth is the fix.
PROPOSED_ANSWERS = (
    ("pure_field", "everything still visible is background"),
    ("mostly_field", "mostly background, but something is still left in it"),
    ("not_field", "what is left is not background"),
    ("cant_tell", "can't tell what is field here"),
)

PROPOSED_QUESTION = (
    "Is everything still visible here background — is there nothing left that belongs to a "
    "depicted subject, to display text, or to an applied mark?")

# [REVIEWED] The bar, written down BEFORE any answer exists, and held at the v4 round's value.
PROPOSED_BAR = {
    "aggregate": 0.75,
    "stratum_floor": 0.50,
    "statistic": "stratum-reweighted pure_field rate, pool sizes as inverse-probability weights",
    "adopt_if": "reweighted pure_field >= 0.75 in at least one guard variant AND no stratum below 0.50",
    "held_not_moved": (
        "Identical to RESIDUAL_EXPERIMENT_NOTES.md §11.11, which residual-purity-1 returned "
        "0.2424 against. v5's PROXY improved; the v4 round established that a proxy improvement "
        "is not evidence about purity, so the bar does not move on it."),
    "escape_treatment": (
        "`cant_tell` is NOT counted as pure, NOT counted as not-pure, and NOT dropped. It is "
        "excluded from the numerator and the denominator of the pure_field rate, and its SHARE is "
        "reported per stratum as a first-class result — figure/ground ambiguity is a property of "
        "the covers. Two rates are therefore published per stratum: pure_field among decidable "
        "answers, and the escape share. A stratum whose escape share exceeds 0.50 has no reliable "
        "purity rate and must be reported as such rather than as a low one."),
    "ceiling_disclosure": (
        "Report the charitable ceiling (pure + mostly, escapes excluded) beside the rate, as the "
        "v4 verdict did, so a reader can see whether the verdict is boundary-sensitive."),
}


def stratum_of(cell: dict, cut: str) -> str:
    """v5 strata — `analyze_residual_cuts_v5.stratum_of`, which is v4's with `dyn-noun` widened to
    the eight rank tags and the same precedence order and evaluation point."""
    import analyze_residual_cuts_v5 as arc5
    return arc5.stratum_of(cell, cut, "guard_off")


def union_at(regions, height, width, guard, cut):
    """v4's union, routed through the v5 keep() so the third guard variant and the generalised
    subtraction cut are both available. `guard=True` here means the UNIFORM guard, which is what
    the v4 sheets rendered, so the two rounds' panels stay the same instrument."""
    import analyze_residual_cuts_v5 as arc5
    import numpy as np
    out = np.zeros((height, width), dtype=np.uint8)
    name = "guard_on_uniform" if guard else "guard_off"
    for r in regions:
        if arc5.keep(r, name, cut):
            out |= common.rle_decode(r["mask_rle"], r["mask_height"], r["mask_width"])
    return out


def render(image_row, regions, cut):
    """v4's renderer with v5's keep(). Monkey-patched rather than copied so the two rounds cannot
    drift apart in panel scale, checkerboard, gap, label strip or font."""
    original = v4b.union_at
    v4b.union_at = union_at
    try:
        return v4b.render(image_row, regions, cut)
    finally:
        v4b.union_at = original


def build(analysis_stem: str, run: str, table_name: str, cut: str, write: bool) -> dict:
    doc = json.loads((config.DATA_DIR / f"{analysis_stem}.json").read_text())
    covers = {c["image_path"]: c for c in doc["v5_covers"]}
    table = v3.load(config.DATA_DIR / table_name)

    rows = common.read_jsonl(config.DATA_DIR / f"{run}.jsonl")
    images = {r["image_path"]: r for r in rows
              if r.get("record_type") == config.RECORD_TYPE_IMAGE and r.get("status") == "ok"}
    regions: dict[str, list[dict]] = collections.defaultdict(list)
    for r in rows:
        if r.get("record_type") == config.RECORD_TYPE_REGION:
            regions[r["image_path"]].append(r)

    pools: dict[str, list[dict]] = collections.defaultdict(list)
    for path, cover in covers.items():
        pools[stratum_of(cover, cut)].append(cover)

    rng = random.Random(SEED)
    picked: list[dict] = []
    for stratum, quota in QUOTAS:
        pool = sorted(pools.get(stratum, []), key=lambda c: c["image_path"])
        rng.shuffle(pool)
        picked += pool[:quota]

    out_dir = config.DATA_DIR / "residual-sheets-v5"
    if write:
        out_dir.mkdir(parents=True, exist_ok=True)

    items = []
    for cover in picked:
        path = cover["image_path"]
        item_id = ITEM_PREFIX + common.sha256_bytes(path.encode())[:12]
        sheet_path = out_dir / f"{item_id}.png"
        if write:
            render(images[path], regions.get(path, []), cut).save(sheet_path)
        row = table[path]
        items.append({
            "item_id": item_id,
            "image_path": path,
            "artwork_id": cover["artwork_id"],
            "stratum": stratum_of(cover, cut),
            "sheet": str(sheet_path.relative_to(config.REPO_ROOT)),
            "panel_cut": cut,
            "subject_kind_agreed": cover["subject_kind_agreed"],
            # the v5 species half, in full — the round is judging what these prompts removed
            "subject_nouns_all_raw": row.get("subject_nouns_all_raw"),
            "subject_noun_prompts": row.get("subject_noun_prompts"),
            "subject_nouns_used_count": row.get("subject_nouns_used_count"),
            "subject_nouns_barred_count": row.get("subject_nouns_barred_count"),
            "v4_single_noun_prompt": row.get("v4_single_noun_prompt"),
            "dynamic_concepts_asked": cover["dynamic_concepts"],
            "dynamic_concepts_fired": cover[f"dynamic_firing_{cut}_guard_off"],
            "noun_tags_fired": cover[f"noun_tags_fired_{cut}_guard_off"],
            "residual_guard_on_uniform": cover[f"residual_dynamic_{cut}_guard_on_uniform"],
            "residual_guard_on_exempt": cover[f"residual_dynamic_{cut}_guard_on_exempt"],
            "residual_guard_off": cover[f"residual_dynamic_{cut}_guard_off"],
            "residual_static_guard_off": cover[f"residual_static_{cut}_guard_off"],
            "contamination_causes": cover[f"contamination_causes_{cut}_guard_off"],
        })

    manifest = {
        "meta": {
            "built_by": "oracle/sam/build_residual_sheets_v5.py",
            "built_at": common.utc_now(),
            "git_head": common.git_head(),
            "run": run,
            "analysis": analysis_stem,
            "derivation_table": table_name,
            "seed": SEED,
            "panel_cut": cut,
            "panel_cut_note": (
                "Panels are rendered at the SUBTRACTION cut, unchanged from the v4 round. This is "
                "NOT config's default and NOT a proposed change to it. Note that under concept set "
                "v2.2 the subtraction cut is min(pooled, group cut) per group rather than a flat "
                f"{config.CALIBRATED_SCORE_THRESHOLD}, because cjk_script's calibrated cut "
                "(0.392655, PROVISIONAL) is BELOW pooled and a flat rule would make the "
                "recall-oriented cut stricter than the precision one. On the v4 run the two "
                "definitions coincide, so the v4 sheets are unaffected."),
            "quotas": {k: v for k, v in QUOTAS},
            "pool_sizes": {k: len(v) for k, v in sorted(pools.items())},
            "guard_variants_rendered": ["guard_on_uniform", "guard_off"],
            "guard_variant_note": (
                "The ON panel renders the UNIFORM area guard, identical to the v4 round's panels, "
                "so the two rounds' sheets are the same instrument. config's own rule now exempts "
                "person_like (mask round 3, A6); that variant is computed in the analysis and "
                "stored per item as residual_guard_on_exempt, but it is NOT a third panel — "
                "adding one would change what the round measures while claiming to repeat it."),
            "proposed_round_id": "residual-purity-2",
            "proposed_question": PROPOSED_QUESTION,
            "proposed_answers": [{"id": a, "label": b} for a, b in PROPOSED_ANSWERS],
            "proposed_answers_note": (
                "FOUR answers, not three. The fourth — `cant_tell` — is the fix "
                "residual-purity-1 asked for after release; see the module docstring and proposed "
                "decision record d-2026-08-04-purity-rounds-need-escape-answer."),
            "proposed_bar": PROPOSED_BAR,
            "supersedes": "nothing — residual-sheets-v4-sample.json stays in place as the record "
                          "of the round that actually ran",
            "population_caveat": (
                "This sample is drawn from eval-142. COVERAGE_SET.md establishes that eval-142 "
                "'was never a sample of this corpus' — cluster-mix total-variation distance 0.2273 "
                "against coverage-set-1's 0.0851 — so no number this round produces is a "
                "corpus-level purity estimate. RESIDUAL_PURITY_VERDICT.md's prescribed re-run is "
                "on coverage-set-1. Running it here measures whether the all-nouns elicitation "
                "moved purity ON THE SAME COVERS the v4 round judged, which is the paired question "
                "and is worth answering, but it is not the corpus question."),
            "note": "A PROPOSAL. No review round is pushed by this script and it has no code path "
                    "that pushes one. The reviewer decides whether residual-purity-2 runs, and "
                    "whether it runs here or on coverage-set-1.",
        },
        "items": items,
    }
    if write:
        (config.DATA_DIR / "residual-sheets-v5-sample.json").write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    return manifest


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--analysis", default="residual-cuts-v5-analysis")
    ap.add_argument("--run", default="sam-eval-142-v5-allnouns")
    ap.add_argument("--table", default="dynamic-concepts-eval-142-v3.json")
    ap.add_argument("--cut", default=PANEL_CUT, choices=("precision", "subtraction"))
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    manifest = build(args.analysis, args.run, args.table, args.cut, args.write)
    print(f"pool sizes: {manifest['meta']['pool_sizes']}")
    counts = collections.Counter(i["stratum"] for i in manifest["items"])
    print(f"picked {len(manifest['items'])} items at the {args.cut} cut: {dict(counts)}")
    print(f"proposed answers: {[a for a, _ in PROPOSED_ANSWERS]}")
    print(f"proposed bar: >= {PROPOSED_BAR['aggregate']} reweighted, "
          f"floor {PROPOSED_BAR['stratum_floor']} (HELD from the v4 round)")
    if args.write:
        print(f"wrote {config.DATA_DIR / 'residual-sheets-v5'} "
              f"and {config.DATA_DIR / 'residual-sheets-v5-sample.json'}")
    else:
        print("(dry run — pass --write to render)")
    print("NO ROUND IS PUSHED. This is a spec and a set of sheets.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
