"""Build the 8-tile pointing reviewer round: render the panels and write the manifest.

    .venv/bin/python pointing_round_1.py            # report the composition, write nothing
    .venv/bin/python pointing_round_1.py --write    # write the manifest and the panels

CPU only. It never loads a model: every dot and every mask comes from the stored RLEs in
`data/sam/pointing-phrasing-sweep-molmo.json`, which the GPU sweep already produced. That is
deliberate and not merely thrifty — re-running the pointer would draw a *second* sample from a
temperature-0 process, and the reviewer must judge the sample the pick was actually made from.

What this round decides
-----------------------
`POINTING_PROBE_NOTES.md` §7.1: every quality number about the pointing route so far is a proxy —
point-in-mask, not-on-a-face, phrasing agreement. The pre-registered PASS criterion needs a human
and has never been scored. This round scores it.

The bar was fixed in `POINTING_PHRASING_PREREG.md` §5 before any answer was seen:
**carry pointing forward as a ground route only if dot-right >= 6/8 AND dot-right-and-wash-right
>= 4/8.** The dot and the wash are asked separately on purpose — a right dot under a bad wash is a
SAM candidate-selection problem (probe §2.4), a wrong dot is a pointer problem, and the two have
different fixes. Pooling them would hide which one we have.

The panel
---------
Two panels, left the bare artwork, right the same artwork with the SAM mask as a pink wash and the
prompted point as a green dot — the house format (`src/review-server/sam-mask-quality.ts`: "the
served image is a two-panel PNG"). **No caption, no number, no phrasing printed on the panel.** The
reviewer is being asked whether the pixels are ground; telling them the model's mask area or which
sentence produced it would measure the label instead of the mask.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

import common
import config
import point_sheets
import pointing_covers as pc

# --------------------------------------------------------------------------------- identity

BATCH_ID = "pointing-ground-1"

SWEEP_PATH = config.DATA_DIR / "pointing-phrasing-sweep-molmo.json"
MANIFEST_PATH = config.DATA_DIR / "pointing-round-1-sample.json"
PANEL_DIR = config.DATA_DIR / "review-panels-pointing-1"

# [UNCALIBRATED] Fixed so the sample is reproducible. Distinct from every previous round's seed.
SEED = 20260810

# [REVIEWED] PREREG §5: the 6 palette-decidable misfit covers from GROUND_FREETEXT_SYNTHESIS.md.
# These are the covers where the reviewer's own prose fixes which pixels are ground, so they are
# the only ones on which "is the dot on the background?" has an answer key at all.
DECIDABLE_SIX: tuple[str, ...] = (
    "00014fb4", "00030075", "00066a61", "00075841", "000f0a78", "artofficial",
)

# [REVIEWED] PREREG §5: two more tiles, the covers where the picked phrasing and its closest
# rival produce the MOST different SAM masks — a disagreement is where a human eye is worth most.
# Chosen by mask IoU, computed from the stored RLEs, excluding the six above.
EXTRA_TILES = 2

# [REVIEWED] Panel geometry. Larger than the contact-sheet tile (320) because this one is judged,
# not skimmed, and the reviewer zooms natively (REVIEW_UI.md §3).
PANEL_PX = 480
GUTTER_PX = 12
BG_RGB = (0, 0, 0)   # REVIEW_UI.md §3: review chrome is strictly black and white.


def panel(image: Image.Image, mask: np.ndarray, points_xy) -> Image.Image:
    """Left: the bare artwork. Right: the same artwork, mask washed, prompted point ringed."""
    def fit(img: Image.Image) -> tuple[Image.Image, float, int, int]:
        w, h = img.size
        scale = PANEL_PX / max(w, h)
        sw, sh = max(1, int(w * scale)), max(1, int(h * scale))
        return img.resize((sw, sh), Image.LANCZOS), scale, (PANEL_PX - sw) // 2, (PANEL_PX - sh) // 2

    bare, _, bx, by = fit(image.convert("RGB"))
    washed, scale, wx, wy = fit(point_sheets.wash(image, mask))

    canvas = Image.new("RGB", (PANEL_PX * 2 + GUTTER_PX, PANEL_PX), BG_RGB)
    canvas.paste(bare, (bx, by))
    canvas.paste(washed, (PANEL_PX + GUTTER_PX + wx, wy))

    from PIL import ImageDraw
    draw = ImageDraw.Draw(canvas)
    for px, py in points_xy:
        cx = PANEL_PX + GUTTER_PX + wx + px * scale
        cy = wy + py * scale
        r = 9
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(60, 255, 140),
                     outline=(10, 10, 10), width=4)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255), width=2)
    return canvas


def item_id(cover_id: str, phrasing_key: str) -> str:
    digest = hashlib.sha256(f"{BATCH_ID}|{cover_id}|{phrasing_key}".encode("utf-8")).hexdigest()
    return f"pg1-{digest[:12]}"


def mask_of(row: dict) -> np.ndarray:
    return common.rle_decode(row["mask_rle"], row["mask_height"], row["mask_width"])


def iou(a: np.ndarray, b: np.ndarray) -> float:
    union = int(np.logical_or(a, b).sum())
    return (int(np.logical_and(a, b).sum()) / union) if union else 0.0


def choose_tiles(rows_by: dict, pick: str, rival: str) -> tuple[list[str], list[dict]]:
    """The six decidable covers, plus the `EXTRA_TILES` covers where pick and rival disagree most."""
    disagreement = []
    for cover in pc.COVERS:
        if cover.id in DECIDABLE_SIX:
            continue
        a, b = rows_by.get((cover.id, pick)), rows_by.get((cover.id, rival))
        if a is None or b is None or "mask_rle" not in a or "mask_rle" not in b:
            continue
        disagreement.append({"cover_id": cover.id,
                             "mask_iou": round(iou(mask_of(a), mask_of(b)), 4)})
    disagreement.sort(key=lambda d: (d["mask_iou"], d["cover_id"]))
    extra = disagreement[:EXTRA_TILES]
    return list(DECIDABLE_SIX) + [d["cover_id"] for d in extra], disagreement


def build(pick: str, rival: str, write: bool) -> dict:
    if not SWEEP_PATH.exists():
        raise SystemExit(f"{SWEEP_PATH} does not exist. Run the sweep first:\n"
                         "    .venv/bin/python pointing_phrasing_sweep.py --pointer molmo")
    sweep = json.loads(SWEEP_PATH.read_text())
    rows_by = {(r["cover_id"], r["phrasing_key"]): r for r in sweep["rows"]}

    tile_ids, disagreement = choose_tiles(rows_by, pick, rival)
    if write:
        PANEL_DIR.mkdir(parents=True, exist_ok=True)
    common.register_image_plugins()

    entries = []
    for cover_id in tile_ids:
        cover = pc.BY_ID[cover_id]
        row = rows_by.get((cover_id, pick))
        if row is None or "mask_rle" not in row:
            raise SystemExit(f"{cover_id}: the picked phrasing {pick!r} produced no mask; "
                             "it cannot be a tile")
        path = PANEL_DIR / f"{item_id(cover_id, pick)}.png"
        full = Image.open(config.REPO_ROOT / cover.path).convert("RGB")
        if write:
            panel(full, mask_of(row), row["points_pixels"]).save(path, optimize=True)

        rendered = None
        if path.exists():
            data = path.read_bytes()
            with Image.open(path) as opened:
                pw, ph = opened.size
            rendered = {"path": str(path.relative_to(config.REPO_ROOT)),
                        "sha256": hashlib.sha256(data).hexdigest(),
                        "bytes": len(data), "width": pw, "height": ph}

        entries.append({
            "itemId": item_id(cover_id, pick),
            "coverId": cover_id,
            "role": cover.role,
            "decidable": cover.decidable,
            "inDecidableSix": cover_id in DECIDABLE_SIX,
            # Manifest-side only, exactly as every previous round does it: the answer key and the
            # provenance live here and are stripped before anything reaches the browser.
            "phrasingKey": pick,
            "phrasing": next(c["text"] for c in sweep["candidates"] if c["key"] == pick),
            "pointer": sweep["pointer"]["name"],
            "reviewerGround": cover.reviewer_ground,
            "groundRegions": list(cover.ground_regions),
            "subjectRegions": list(cover.subject_regions),
            "pointsNormalized": row["points_normalized"],
            "samAreaFraction": row["sam_area_fraction"],
            "samContainsPoints": row["sam_contains_points"],
            "onFigure": row["on_figure"],
            "onMark": row["on_mark"],
            "conceptsAtPoints": row["concepts_at_points"],
            "artwork": {"imagePath": cover.path,
                        "artworkId": common.ImageRef.from_rel(cover.path).artwork_id,
                        "collection": common.collection_of(cover.path),
                        "width": full.width, "height": full.height},
            "stratum": ("decidable-six" if cover_id in DECIDABLE_SIX else "phrasing-disagreement"),
            "panel": rendered,
        })

    return {
        "manifestVersion": "pointing-round-sample.v1",
        "batchId": BATCH_ID,
        "seed": SEED,
        "generatedBy": "research/v3/oracle/sam/pointing_round_1.py",
        "builtFrom": [
            "research/v3/data/sam/pointing-phrasing-sweep-molmo.json",
            "research/v3/oracle/sam/pointing_phrasing_sweep.py",
            "research/v3/oracle/sam/POINTING_PHRASING_PREREG.md",
            "research/v3/oracle/sam/pointing_covers.py",
            "research/v3/oracle/sam/point_prompt.py",
            "research/v3/oracle/premise/GROUND_FREETEXT_SYNTHESIS.md",
        ],
        "sourceSweep": str(SWEEP_PATH.relative_to(config.REPO_ROOT)),
        "pointer": sweep["pointer"],
        "sam": sweep["sam"],
        "pickedPhrasing": pick,
        "rivalPhrasing": rival,
        "phrasingDisagreement": disagreement,
        "preRegisteredBar": {
            "source": "research/v3/oracle/sam/POINTING_PHRASING_PREREG.md §5",
            "fixedBefore": "any answer was seen",
            "dotRightMin": 6,
            "dotRightAndWashRightMin": 4,
            "of": 8,
            "rule": ("carry pointing forward as a ground route only if dot-right >= 6/8 AND "
                     "dot-right-and-wash-right >= 4/8"),
            "whySeparated": ("a right dot under a bad wash is a SAM candidate-selection problem "
                             "(probe §2.4); a wrong dot is a pointer problem; the two have "
                             "different fixes and pooling them would hide which one we have"),
        },
        "panelRenderer": {"panelPx": PANEL_PX, "gutterPx": GUTTER_PX,
                          "maskRgb": list(point_sheets.MASK_RGB),
                          "maskAlpha": point_sheets.MASK_ALPHA,
                          "dotRgb": [60, 255, 140],
                          "captions": "none — no number or phrasing is printed on the panel"},
        "items": entries,
    }


def report(manifest: dict) -> None:
    print(f"{manifest['batchId']}: {len(manifest['items'])} tiles, "
          f"phrasing={manifest['pickedPhrasing']!r} (rival {manifest['rivalPhrasing']!r})")
    print(f"  {'cover':13s} {'stratum':22s} {'area':>6s} {'onFig':>6s} {'pts':>4s}  reviewer")
    for entry in manifest["items"]:
        print(f"  {entry['coverId']:13s} {entry['stratum']:22s} "
              f"{entry['samAreaFraction']:>6.3f} {str(entry['onFigure']):>6s} "
              f"{len(entry['pointsNormalized']):>4d}  {entry['reviewerGround'][:44]}")
    print("\n  phrasing disagreement (pick vs rival, mask IoU), covers outside the decidable six:")
    for row in manifest["phrasingDisagreement"]:
        mark = "  <- in round" if row["cover_id"] in {e["coverId"] for e in manifest["items"]} else ""
        print(f"    {row['cover_id']:13s} {row['mask_iou']:.3f}{mark}")
    missing = [e["itemId"] for e in manifest["items"] if e["panel"] is None]
    if missing:
        print(f"\n  {len(missing)} panels not yet rendered (run with --write)")
    bar = manifest["preRegisteredBar"]
    print(f"\n  BAR (fixed {bar['fixedBefore']}): {bar['rule']}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pick", required=True, help="the phrasing key the sweep picked")
    ap.add_argument("--rival", required=True, help="the closest cleared phrasing")
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()
    manifest = build(args.pick, args.rival, args.write)
    report(manifest)
    if args.write:
        MANIFEST_PATH.write_text(json.dumps(manifest, indent="\t") + "\n")
        print(f"\nwrote {MANIFEST_PATH}")
        print(f"wrote {len(manifest['items'])} panels to {PANEL_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
