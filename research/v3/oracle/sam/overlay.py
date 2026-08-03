"""Render mask overlays from a run's JSONL so a human can look at what SAM actually did.

    .venv/bin/python overlay.py --run sam-smoke-1 --image 06/ab6...jpg --out /tmp/o.png
    .venv/bin/python overlay.py --run sam-smoke-1 --all --out-dir ../../data/sam/overlays

Each panel is: original | per-concept masks | residual field (§8.3 subtractive view).
Colours here are for human eyes only; nothing downstream reads them.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import common
import config

# Distinct enough to tell apart on a busy cover. Human-facing only.
CONCEPT_COLORS = {
    "text": (255, 64, 64),
    "lettering": (255, 160, 0),
    "typography": (255, 232, 0),
    "logo": (0, 200, 255),
    "sticker": (255, 0, 220),
    "person": (0, 255, 120),
    "face": (120, 100, 255),
}


def blend(base: np.ndarray, mask: np.ndarray, color, alpha=0.5) -> np.ndarray:
    out = base.copy()
    sel = mask.astype(bool)
    out[sel] = (out[sel] * (1 - alpha) + np.array(color, dtype=np.float32) * alpha).astype(np.uint8)
    return out


def render(rows: list[dict], summary: dict, image_path: Path) -> Image.Image:
    common.register_image_plugins()
    original = Image.open(image_path).convert("RGB")
    base = np.array(original)
    h, w = base.shape[:2]

    by_concept: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_concept[r["concept"]].append(r)

    panels: list[tuple[str, Image.Image]] = [("original", original)]

    for concept, _ in config.CONCEPT_PROMPTS:
        instances = by_concept.get(concept, [])
        canvas = base.copy()
        for r in instances:
            mask = common.rle_decode(r["mask_rle"], r["mask_height"], r["mask_width"])
            canvas = blend(canvas, mask, CONCEPT_COLORS[concept])
        img = Image.fromarray(canvas)
        draw = ImageDraw.Draw(img)
        for r in instances:
            x = r["bbox_x"] * w
            y = r["bbox_y"] * h
            draw.rectangle([x, y, x + r["bbox_w"] * w, y + r["bbox_h"] * h],
                           outline=CONCEPT_COLORS[concept], width=max(1, w // 200))
            draw.text((x + 2, max(0, y - 10)), f"{r['score']:.2f}",
                      fill=CONCEPT_COLORS[concept])
        panels.append((f"{concept} n={len(instances)}", img))

    union = common.rle_decode(summary["union_mask_rle"], summary["height"], summary["width"])
    residual = base.copy()
    residual[union.astype(bool)] = 0
    panels.append((f"residual {summary['residual_field_fraction']:.3f}",
                   Image.fromarray(residual)))

    cell = 260
    cols = len(panels)
    sheet = Image.new("RGB", (cols * cell, cell + 16), "white")
    draw = ImageDraw.Draw(sheet)
    for i, (label, img) in enumerate(panels):
        thumb = img.copy()
        thumb.thumbnail((cell, cell))
        x = i * cell
        sheet.paste(thumb, (x, 0))
        draw.text((x + 2, cell + 3), label, fill="black")
    return sheet


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True, help="output stem under research/v3/data/sam/")
    ap.add_argument("--image", help="repo-relative image path")
    ap.add_argument("--all", action="store_true", help="every image in the run")
    ap.add_argument("--out", help="output PNG (with --image)")
    ap.add_argument("--out-dir", help="output directory (with --all)")
    args = ap.parse_args()

    rows = common.read_jsonl(config.DATA_DIR / f"{args.run}.jsonl")
    regions = defaultdict(list)
    summaries = {}
    for r in rows:
        if r.get("record_type") == config.RECORD_TYPE_REGION:
            regions[r["image_path"]].append(r)
        elif r.get("record_type") == config.RECORD_TYPE_IMAGE and r.get("status") == "ok":
            summaries[r["image_path"]] = r

    targets = list(summaries) if args.all else [args.image]
    for i, rel in enumerate(targets):
        summary = summaries[rel]
        sheet = render(regions.get(rel, []), summary, config.REPO_ROOT / rel)
        if args.all:
            out_dir = Path(args.out_dir or (config.DATA_DIR / "overlays"))
            out_dir.mkdir(parents=True, exist_ok=True)
            out = out_dir / f"{i:02d}-{Path(rel).stem[:24]}.png"
        else:
            out = Path(args.out)
        sheet.save(out)
        print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
