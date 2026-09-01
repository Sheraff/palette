"""Contact sheets of find_noun_covers.py candidates, so a human can confirm content by eye.

Probe 5's selection rule is the same as probe 4's: a text search SUGGESTS covers, a person
OPENS them, and only what the person recognised goes on the probe list. This renders the
suggestions as labelled grids (one row per noun) so that step is cheap.

    .venv/bin/python contact_sheet_search.py --search ../../data/sam/probe-5-search.json \
        --out-dir ../../data/sam/probe-5-search-sheets --per-sheet 4

No GPU, no model, no network.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import common
import config

CELL_PX = 260
LABEL_H = 16
ROW_LABEL_W = 130


def render_selection(list_path: Path, out_dir: Path, cols: int) -> int:
    """The final probe list as one grid, each cell captioned with what is in it.

    This is the artifact that lets a reviewer re-check the ground truth the scoring rests
    on without opening 32 files: the caption under each cover is exactly the `contains`
    list the precision and recall numbers are computed against.
    """
    from PIL import Image, ImageDraw

    import probe_noun_breadth as probe

    out_dir.mkdir(parents=True, exist_ok=True)
    refs = common.read_list_file(list_path)
    rows = (len(refs) + cols - 1) // cols
    caption_h = 2 * LABEL_H
    sheet = Image.new("RGB", (cols * CELL_PX, rows * (CELL_PX + caption_h)), "white")
    draw = ImageDraw.Draw(sheet)
    for i, ref in enumerate(refs):
        meta = probe.IMAGE_KINDS[ref.rel_path]
        px = (i % cols) * CELL_PX
        py = (i // cols) * (CELL_PX + caption_h)
        image, _, _ = common.decode_image(ref.abs_path, cap_px=CELL_PX)
        thumb = image.copy()
        thumb.thumbnail((CELL_PX, CELL_PX))
        sheet.paste(thumb, (px, py))
        contains = ",".join(meta["contains"]) or "(none)"
        marginal = ",".join(meta["marginal"])
        draw.text((px + 2, py + CELL_PX + 2), f"{meta['kind']}: {contains}"[:44], fill="black")
        draw.text((px + 2, py + CELL_PX + 2 + LABEL_H),
                  (f"marginal: {marginal}" if marginal else "")[:44], fill="gray")
    out = out_dir / "probe-5-selection.png"
    sheet.save(out)
    print(out)
    return 0


def main() -> int:
    from PIL import Image, ImageDraw

    ap = argparse.ArgumentParser()
    ap.add_argument("--search", help="find_noun_covers.py output to render")
    ap.add_argument("--selection", help="a probe list file: render the FINAL picks instead, "
                                        "labelled with their confirmed-by-eye ground truth")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--per-sheet", type=int, default=4, help="nouns per sheet")
    ap.add_argument("--cols", type=int, default=6, help="candidates per noun")
    args = ap.parse_args()

    if args.selection:
        return render_selection(Path(args.selection), Path(args.out_dir), args.cols)

    doc = json.loads(Path(args.search).read_text())
    results: dict[str, list] = doc["results"]
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    nouns = list(results)
    sheets = [nouns[i:i + args.per_sheet] for i in range(0, len(nouns), args.per_sheet)]

    for si, group in enumerate(sheets):
        width = ROW_LABEL_W + args.cols * CELL_PX
        height = len(group) * (CELL_PX + LABEL_H)
        sheet = Image.new("RGB", (width, height), "white")
        draw = ImageDraw.Draw(sheet)
        for ri, noun in enumerate(group):
            py = ri * (CELL_PX + LABEL_H)
            draw.text((4, py + CELL_PX // 2), noun, fill="black")
            for ci, hit in enumerate(results[noun][: args.cols]):
                path = config.REPO_ROOT / hit["path"]
                try:
                    image, _, _ = common.decode_image(path, cap_px=CELL_PX)
                except Exception as exc:  # noqa: BLE001
                    draw.text((ROW_LABEL_W + ci * CELL_PX + 4, py + 4), f"ERR {exc}", fill="red")
                    continue
                thumb = image.copy()
                thumb.thumbnail((CELL_PX, CELL_PX))
                sheet.paste(thumb, (ROW_LABEL_W + ci * CELL_PX, py))
                draw.text((ROW_LABEL_W + ci * CELL_PX + 2, py + CELL_PX + 2),
                          f"{noun}#{ci} {hit['similarity']:.3f}", fill="black")
        out = out_dir / f"sheet-{si:02d}-{'-'.join(group)}.png"
        sheet.save(out)
        print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
