"""Overlay sheets for the residual-purity proposal: artwork | residual guard-on | guard-off.

CPU only. Renders a stratified sample the reviewer can judge, and writes the sample manifest.
This builds SHEETS AND A PROPOSAL. It does not push a review round — the round spec lives in
RESIDUAL_EXPERIMENT_NOTES.md and pushing it is the reviewer's call.

    .venv/bin/python build_residual_sheets.py --analysis residual-isolation-analysis --write

Rendering follows round 2's decisions rather than overlay.py's, for one measured reason recorded
there: overlay.py fills removed pixels with black, which is illegible on a dark cover, so round 2
switched to a grey checkerboard. Residual purity is judged by looking at what is LEFT, so the
"removed" fill must never be mistakable for artwork.

Both guard variants are shown side by side, deliberately. The area guard's person exemption is
undecided (loose end A6) and a big correct subject mask is exactly what residual isolation wants,
so the sheets put the choice in front of the reviewer instead of picking for them.
"""

from __future__ import annotations

import argparse
import collections
import json
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

import common
import config
import review_round as rr
import review_round_2 as rr2

# [REVIEWED] Seeded so the sample is reproducible and so re-running does not quietly show the
# reviewer a different set. Distinct from round 1 and round 2's seeds.
SEED = 20260803

# [REVIEWED] Strata: the experiment's own question is whether dynamic prompting fixed the covers
# the static set was blind on, so the sample must not be dominated by the 95 covers where nothing
# dynamic was even asked. Quotas are per stratum, filled round-robin.
QUOTAS: tuple[tuple[str, int], ...] = (
    ("dynamic-fired", 8),        # a dynamic concept fired above the cut — did it take the subject?
    ("dynamic-silent", 5),       # a dynamic concept was asked and returned nothing
    ("contaminated", 6),         # a contamination proxy fired — the cases most likely to fail
    ("static-only-clean", 5),    # no dynamic concept asked, no proxy — the control
)

ITEM_PREFIX = "resid-"


def stratum_of(cover: dict) -> str:
    fired = bool(cover["dynamic_concepts_firing_guard_off"])
    asked = bool(cover["dynamic_concepts"])
    if cover["contaminated"]:
        return "contaminated"
    if fired:
        return "dynamic-fired"
    if asked:
        return "dynamic-silent"
    return "static-only-clean"


def residual_panel(base: Image.Image, union: np.ndarray, scale: int) -> Image.Image:
    """The artwork with every masked pixel replaced by the checkerboard."""
    arr = np.array(base).copy()
    h, w = arr.shape[:2]
    board = rr2.checkerboard(h, w, rr2.REMOVED_CHECK_PX * scale)
    sel = union.astype(bool)
    arr[sel] = board[sel]
    return Image.fromarray(arr)


def union_at(regions: list[dict], height: int, width: int, guard: bool) -> np.ndarray:
    out = np.zeros((height, width), dtype=np.uint8)
    for r in regions:
        if config.passes_calibrated_cut(
                r["score"], r["area_fraction"], r["concept"],
                max_area_fraction=config.CALIBRATED_MAX_AREA_FRACTION if guard else None):
            out |= common.rle_decode(r["mask_rle"], r["mask_height"], r["mask_width"])
    return out


def render(image_row: dict, regions: list[dict]) -> Image.Image:
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
    # ASCII only. PIL's default bitmap font has no em dash and draws a .notdef box for it, which
    # a reviewer reads as a rendering fault on a sheet whose whole job is to be trusted.
    for guard, label in ((True, "what remains - area guard ON"),
                         (False, "what remains - area guard OFF")):
        union = union_at(regions, height, width, guard)
        up = np.asarray(
            Image.fromarray(union * 255).resize((panel_w, panel_h), Image.Resampling.NEAREST)
        ) > 127
        panels.append((label, residual_panel(big, up, scale)))

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


def build(analysis_stem: str, run: str, write: bool) -> dict:
    doc = json.loads((config.DATA_DIR / f"{analysis_stem}.json").read_text())
    covers = {c["image_path"]: c for c in doc["covers"]}

    rows = common.read_jsonl(config.DATA_DIR / f"{run}.jsonl")
    images = {r["image_path"]: r for r in rows
              if r.get("record_type") == config.RECORD_TYPE_IMAGE and r.get("status") == "ok"}
    regions: dict[str, list[dict]] = collections.defaultdict(list)
    for r in rows:
        if r.get("record_type") == config.RECORD_TYPE_REGION:
            regions[r["image_path"]].append(r)

    pools: dict[str, list[dict]] = collections.defaultdict(list)
    for path, cover in covers.items():
        pools[stratum_of(cover)].append(cover)

    rng = random.Random(SEED)
    picked: list[dict] = []
    for stratum, quota in QUOTAS:
        pool = sorted(pools.get(stratum, []), key=lambda c: c["image_path"])
        rng.shuffle(pool)
        picked += pool[:quota]

    out_dir = config.DATA_DIR / "residual-sheets"
    if write:
        out_dir.mkdir(parents=True, exist_ok=True)

    items = []
    for cover in picked:
        path = cover["image_path"]
        item_id = ITEM_PREFIX + common.sha256_bytes(path.encode())[:12]
        sheet_path = out_dir / f"{item_id}.png"
        if write:
            render(images[path], regions.get(path, [])).save(sheet_path)
        items.append({
            "item_id": item_id,
            "image_path": path,
            "artwork_id": cover["artwork_id"],
            "stratum": stratum_of(cover),
            "sheet": str(sheet_path.relative_to(config.REPO_ROOT)),
            "subject_kind_agreed": cover["subject_kind_agreed"],
            "dynamic_concepts_asked": cover["dynamic_concepts"],
            "dynamic_concepts_fired": cover["dynamic_concepts_firing_guard_off"],
            "residual_guard_on": cover["residual_dynamic_guard_on"],
            "residual_guard_off": cover["residual_dynamic_guard_off"],
            "residual_static_guard_off": cover["residual_static_guard_off"],
            "contamination_causes": cover["contamination_causes"],
        })

    manifest = {
        "meta": {
            "built_by": "oracle/sam/build_residual_sheets.py",
            "built_at": common.utc_now(),
            "git_head": common.git_head(),
            "run": run,
            "analysis": analysis_stem,
            "seed": SEED,
            "quotas": {k: v for k, v in QUOTAS},
            "pool_sizes": {k: len(v) for k, v in sorted(pools.items())},
            "note": "A PROPOSAL. No review round is pushed by this script; the pre-registered "
                    "spec is in oracle/sam/RESIDUAL_EXPERIMENT_NOTES.md.",
        },
        "items": items,
    }
    if write:
        (config.DATA_DIR / "residual-sheets-sample.json").write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    return manifest


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--analysis", default="residual-isolation-analysis")
    ap.add_argument("--run", default="sam-eval-142-v3-dynamic")
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    manifest = build(args.analysis, args.run, args.write)
    print(f"pool sizes: {manifest['meta']['pool_sizes']}")
    counts = collections.Counter(i["stratum"] for i in manifest["items"])
    print(f"picked {len(manifest['items'])} items: {dict(counts)}")
    if args.write:
        print(f"wrote {config.DATA_DIR / 'residual-sheets'} "
              f"and {config.DATA_DIR / 'residual-sheets-sample.json'}")
    else:
        print("(dry run — pass --write to render)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
