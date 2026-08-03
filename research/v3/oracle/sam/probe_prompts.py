"""Prompt-phrasing probe. Not part of the run — evidence for choosing CONCEPT_PROMPTS.

§8.3 says SAM 3's weakness is low recall and the mitigation is unioning phrasings. That
only helps if some phrasing actually fires. This measures, per image, which of a
candidate list produces any instance at all, and at what score.

    .venv/bin/python probe_prompts.py --list smoke-10.txt --out probe-1
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import common
import config

CANDIDATES = [
    "text", "a text", "written text", "text overlay",
    "lettering", "typography", "word", "a word", "words",
    "letter", "letters", "title", "album title", "caption",
    "label", "logo", "sticker", "person", "face",
]


def _render_probe(image, result, prompts, ref, out_dir: Path) -> None:
    """One row: original, then one panel per prompt with its masks blended in."""
    import numpy as np
    from PIL import Image, ImageDraw

    out_dir.mkdir(parents=True, exist_ok=True)
    base = np.array(image)
    cell = 240
    panels = [("original", image)]
    for p in prompts:
        canvas = base.copy()
        hits = [i for i in result.instances if i.concept == p]
        for inst in hits:
            sel = inst.mask.astype(bool)
            canvas[sel] = (canvas[sel] * 0.45 +
                           np.array([255, 40, 40], dtype=np.float32) * 0.55).astype(np.uint8)
        panels.append((f"{p} n={len(hits)}", Image.fromarray(canvas)))
    sheet = Image.new("RGB", (len(panels) * cell, cell + 16), "white")
    draw = ImageDraw.Draw(sheet)
    for i, (label, img) in enumerate(panels):
        thumb = img.copy()
        thumb.thumbnail((cell, cell))
        sheet.paste(thumb, (i * cell, 0))
        draw.text((i * cell + 2, cell + 3), label, fill="black")
    sheet.save(out_dir / f"{Path(ref.rel_path).stem[:24]}.png")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--prompts", nargs="*", default=CANDIDATES)
    ap.add_argument("--overlay-dir", default=None,
                    help="also render one overlay per image, one panel per prompt")
    args = ap.parse_args()

    refs = common.read_list_file(Path(args.list))
    runtime = common.load_sam(verify_weights=False)
    prompts = tuple((p, p) for p in args.prompts)

    sink = common.JsonlSink(config.DATA_DIR / f"{args.out}.jsonl")
    fired: dict[str, int] = {p: 0 for p in args.prompts}
    try:
        for ref in refs:
            image, _, _ = common.decode_image(ref.abs_path)
            result = common.segment_concepts(runtime, image, prompts=prompts)
            per_prompt: dict[str, list] = {p: [] for p in args.prompts}
            for inst in result.instances:
                per_prompt[inst.concept].append(
                    {"score": round(inst.score, 4), "area": round(inst.area_fraction, 5)})
            for p, hits in per_prompt.items():
                if hits:
                    fired[p] += 1
            sink.write({"image_path": ref.rel_path, "width": result.width,
                        "height": result.height, "seconds": round(result.seconds_total, 2),
                        "per_prompt": per_prompt})
            if args.overlay_dir:
                _render_probe(image, result, args.prompts, ref,
                              Path(args.overlay_dir))
            print(f"{ref.rel_path[:52]:54} " +
                  " ".join(f"{p}={len(h)}" for p, h in per_prompt.items() if h), flush=True)
    finally:
        sink.close()

    print("\nimages (of %d) where the prompt fired at all:" % len(refs))
    for p, n in sorted(fired.items(), key=lambda kv: -kv[1]):
        print(f"  {n:2d}  {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
