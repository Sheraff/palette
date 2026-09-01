"""Three-panel residual sheets for the v4-nouns run — artwork | guard ON | guard OFF.

CPU only. Builds SHEETS AND A PROPOSAL. It does not push a review round; the pre-registered spec
lives in RESIDUAL_EXPERIMENT_NOTES.md §11 and pushing it is the reviewer's call.

    .venv/bin/python build_residual_sheets_v4.py --write

WHY A SECOND BUILDER. `build_residual_sheets.py` writes to fixed paths — `data/sam/residual-sheets/`
and `data/sam/residual-sheets-sample.json` — which are the artifacts RESIDUAL_EXPERIMENT_NOTES.md
§8 points at for the v3 round. Rebuilding in place would silently replace the v3 record with v4
content while §8 still described it. This writes to `residual-sheets-v4/` and
`residual-sheets-v4-sample.json`; the v3 sheets stay exactly where §8 left them. Rendering,
checkerboard, panel scale, label strip and font are REUSED from that module rather than
re-implemented, so the two rounds' sheets are the same instrument.

THE ONE INSTRUMENT CHANGE, AND IT IS DELIBERATE. The v3 sheets rendered their panels at the
PRECISION cut — config's default, with `text_like` raised to 0.697295. These render at the
SUBTRACTION cut (the pooled 0.578 for every group). The reason is that the round's question is
whether what REMAINS is background, and RESIDUAL_EXPERIMENT_NOTES.md §5.4 measured that 15 of the
26 text-contaminated residuals have text masks sitting between the two thresholds. Showing a
reviewer a residual still holding text that a differently-calibrated threshold would have removed
asks them to judge a threshold choice while believing they are judging an instrument. The cut is
named on every sheet's label strip and in the manifest, so nothing about it is implicit.

This is NOT a proposal to change `config.py`. The precision cut remains the default everywhere and
is what every stored artifact uses; `analyze_residual_cuts.py` reports both.
"""

from __future__ import annotations

import argparse
import collections
import json
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFont

import build_residual_sheets as brs
import common
import config
import review_round as rr

# [REVIEWED] A distinct seed from the v3 round (20260803). If the two rounds shared a seed, an
# overlapping sample would look like a deliberate paired design when it was an accident of the
# RNG. Different seed, independently drawn sample, stated.
SEED = 20260804

# [REVIEWED] Strata carry over from the v3 round so the two are readable side by side, with one
# renamed: `dynamic-fired` / `dynamic-silent` now turn on whether ANY dynamic concept fired,
# species or class. The quota shifts weight toward `noun-fired` because that is the stratum this
# round exists to judge — 102 of 142 covers now carry a species noun, against 47 carrying anything
# at all under v3.
QUOTAS: tuple[tuple[str, int], ...] = (
    ("noun-fired", 8),          # the species noun fired above the cut — did it take the subject?
    ("noun-silent", 5),         # a species noun was asked and returned nothing
    ("contaminated", 6),        # a contamination proxy fired — the cases most likely to fail
    ("class-only", 3),          # a class word but no usable noun — v3's condition, for contrast
    ("static-only-clean", 4),   # nothing dynamic asked, no proxy — the control
)

ITEM_PREFIX = "resid4-"

# The cut the panels are rendered at. See the module docstring.
PANEL_CUT = "subtraction"


def stratum_of(cover: dict, cut: str) -> str:
    fired = cover[f"dynamic_firing_{cut}_guard_off"]
    if cover[f"contaminated_{cut}_guard_off"]:
        return "contaminated"
    if "dyn-noun" in fired:
        return "noun-fired"
    if cover.get("subject_noun_prompt"):
        return "noun-silent"
    if cover["dynamic_concepts"]:
        return "class-only"
    return "static-only-clean"


def union_at(regions: list[dict], height: int, width: int, guard: bool, cut: str) -> np.ndarray:
    """The union of every region surviving this cut. Mirrors build_residual_sheets.union_at, with
    the threshold taken from the cut variant rather than always from config's per-group table."""
    import analyze_residual_cuts as arc
    out = np.zeros((height, width), dtype=np.uint8)
    for r in regions:
        if arc.keep(r, guard, cut):
            out |= common.rle_decode(r["mask_rle"], r["mask_height"], r["mask_width"])
    return out


def render(image_row: dict, regions: list[dict], cut: str) -> Image.Image:
    common.register_image_plugins()
    original, _, _ = common.decode_image(config.REPO_ROOT / image_row["image_path"])
    width, height = image_row["width"], image_row["height"]
    if original.size != (width, height):
        raise ValueError(f"size mismatch for {image_row['image_path']}: "
                         f"{original.size} != {(width, height)}")

    scale = rr.panel_scale(width, height)
    panel_w, panel_h = width * scale, height * scale
    big = original.resize((panel_w, panel_h), Image.Resampling.LANCZOS)

    panels = [("artwork", big)]
    # ASCII only, for build_residual_sheets.py's reason: PIL's default bitmap font draws a
    # .notdef box for an em dash, which a reviewer reads as a rendering fault.
    for guard, label in ((True, "what remains - area guard ON"),
                         (False, "what remains - area guard OFF")):
        union = union_at(regions, height, width, guard, cut)
        up = np.asarray(
            Image.fromarray(union * 255).resize((panel_w, panel_h), Image.Resampling.NEAREST)
        ) > 127
        panels.append((label, brs.residual_panel(big, up, scale)))

    n = len(panels)
    sheet = Image.new("RGB",
                      (panel_w * n + rr.PANEL_GAP_PX * (n - 1), panel_h + rr.LABEL_STRIP_PX),
                      rr.SHEET_BG)
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=rr.LABEL_FONT_PX)
    for i, (label, panel) in enumerate(panels):
        x = i * (panel_w + rr.PANEL_GAP_PX)
        sheet.paste(panel, (x, 0))
        draw.text((x + 2, panel_h + 6), label, fill=rr.SHEET_FG, font=font)
    return sheet


def build(analysis_stem: str, run: str, table_name: str, cut: str, write: bool) -> dict:
    import dynamic_concepts_v2 as v2
    doc = json.loads((config.DATA_DIR / f"{analysis_stem}.json").read_text())
    covers = {c["image_path"]: c for c in doc["v4_covers"]}
    table = v2.load(config.DATA_DIR / table_name)

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

    out_dir = config.DATA_DIR / "residual-sheets-v4"
    if write:
        out_dir.mkdir(parents=True, exist_ok=True)

    items = []
    for cover in picked:
        path = cover["image_path"]
        item_id = ITEM_PREFIX + common.sha256_bytes(path.encode())[:12]
        sheet_path = out_dir / f"{item_id}.png"
        if write:
            render(images[path], regions.get(path, []), cut).save(sheet_path)
        items.append({
            "item_id": item_id,
            "image_path": path,
            "artwork_id": cover["artwork_id"],
            "stratum": stratum_of(cover, cut),
            "sheet": str(sheet_path.relative_to(config.REPO_ROOT)),
            "panel_cut": cut,
            "subject_kind_agreed": cover["subject_kind_agreed"],
            "subject_noun_prompt": cover.get("subject_noun_prompt"),
            "subject_noun_disposition": cover.get("subject_noun_disposition"),
            "subject_noun_raw": table[path].get("subject_noun_raw"),
            "dynamic_concepts_asked": cover["dynamic_concepts"],
            "dynamic_concepts_fired": cover[f"dynamic_firing_{cut}_guard_off"],
            "residual_guard_on": cover[f"residual_dynamic_{cut}_guard_on"],
            "residual_guard_off": cover[f"residual_dynamic_{cut}_guard_off"],
            "residual_static_guard_off": cover[f"residual_static_{cut}_guard_off"],
            "contamination_causes": cover[f"contamination_causes_{cut}_guard_off"],
        })

    manifest = {
        "meta": {
            "built_by": "oracle/sam/build_residual_sheets_v4.py",
            "built_at": common.utc_now(),
            "git_head": common.git_head(),
            "run": run,
            "analysis": analysis_stem,
            "derivation_table": table_name,
            "seed": SEED,
            "panel_cut": cut,
            "panel_cut_note": (
                "Panels are rendered at the SUBTRACTION cut — the pooled "
                f"{config.CALIBRATED_SCORE_THRESHOLD} applied to every group, text_like included. "
                "This is NOT config's default and NOT a proposed change to it; the default "
                "precision cut raises text_like to "
                f"{config.CALIBRATED_GROUP_THRESHOLDS['text_like']:.6f}. The round asks whether "
                "what remains is background, and 15 of the 26 text-contaminated residuals sit "
                "between the two thresholds, so rendering at the precision cut would ask the "
                "reviewer to judge a threshold choice while believing they were judging an "
                "instrument."),
            "quotas": {k: v for k, v in QUOTAS},
            "pool_sizes": {k: len(v) for k, v in sorted(pools.items())},
            "supersedes": "residual-sheets-sample.json (the v3 round's sample, left in place)",
            "note": "A PROPOSAL. No review round is pushed by this script; the pre-registered "
                    "spec is in oracle/sam/RESIDUAL_EXPERIMENT_NOTES.md §11.",
        },
        "items": items,
    }
    if write:
        (config.DATA_DIR / "residual-sheets-v4-sample.json").write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    return manifest


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--analysis", default="residual-cuts-analysis")
    ap.add_argument("--run", default="sam-eval-142-v4-nouns")
    ap.add_argument("--table", default="dynamic-concepts-eval-142-v2.json")
    ap.add_argument("--cut", default=PANEL_CUT, choices=("precision", "subtraction"))
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    manifest = build(args.analysis, args.run, args.table, args.cut, args.write)
    print(f"pool sizes: {manifest['meta']['pool_sizes']}")
    counts = collections.Counter(i["stratum"] for i in manifest["items"])
    print(f"picked {len(manifest['items'])} items at the {args.cut} cut: {dict(counts)}")
    if args.write:
        print(f"wrote {config.DATA_DIR / 'residual-sheets-v4'} "
              f"and {config.DATA_DIR / 'residual-sheets-v4-sample.json'}")
    else:
        print("(dry run — pass --write to render)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
