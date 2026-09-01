"""Salience / non-semantic phrasing probe (probe 3). Evidence only — writes no config.

Same shape as probe_vocabulary.py (probe 2) and probe_prompts.py (probe 1): run candidate
phrasings as separate prompts over a hand-picked image list, record every instance's score,
area fraction and bbox, render overlays a human can look at.

    .venv/bin/python probe_salience.py --list salience-probe-12.txt \
        --out probe-3-salience --overlay-dir ../../data/sam/salience-probe-overlays

What is different from probes 1 and 2: those asked about *nameable things* — text, marks,
people. Every concept in CONCEPT_PROMPTS is a noun for a thing that is either present or
absent. This probe asks whether the model answers a **non-semantic** question: not "where is
the logo" but "where is the thing that draws the eye", and not "where is the sticker" but
"where is the colour". If a salience phrasing produces coherent masks, the geometry stage
gains an accent lane — a region the palette can be read *from* rather than around — and that
is a different kind of instrument from anything the concept set currently carries.

The hypothesis under test, stated before the run so the result can contradict it: **noun-phrase
salience prompts work, attributive colour prompts do not.** SAM 3 segments things; "the most
prominent object" still names a thing and only adds a superlative, whereas "brightly coloured
object" asks the model to select on an attribute it was never trained to rank. Probe 2 already
showed the failure mode this predicts — every phrasing that named a property rather than a
thing ("brand mark", "wordmark", "large text") returned nothing at all, on 15 of 15.

Nothing here imports or mutates config.CONCEPT_PROMPTS, and a positive result is a PROPOSAL,
not a change: the question set is the reviewer's call.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

import common
import config

# [n=1] Candidates, from the coordinator's brief. Two families, deliberately balanced so the
# hypothesis above can fail cleanly in either direction, plus one control.
SALIENCE_PHRASES = (
    "the main focal point",
    "the most prominent object",
    "the subject",
    "the eye-catching element",
)
COLOUR_PHRASES = (
    "brightly colored object",
    "colorful accent",
    "accent of color",
    "bright spot",
    "colorful detail",
)
# The control. "the background" is the one phrasing whose answer the pipeline already has by
# another route: §8.3 derives field subtractively, as everything no mask covered. If SAM will
# name the background directly, that is a cross-check on the residual — and if it will not,
# that is evidence for the subtractive route being the only one available.
CONTROL_PHRASES = ("the background",)

CANDIDATES = list(SALIENCE_PHRASES + COLOUR_PHRASES + CONTROL_PHRASES)

FAMILIES: dict[str, tuple[str, ...]] = {
    "salience_noun": SALIENCE_PHRASES,
    "colour_attribute": COLOUR_PHRASES,
    "control": CONTROL_PHRASES,
}

# What each image is, confirmed by eye — carried here so the per-image table in the log reads
# as evidence rather than as hashes. Keys are the repo-relative paths in salience-probe-12.txt.
IMAGE_KINDS: dict[str, str] = {
    "images/orelsan.jpg": "strong-subject",
    "10/ab67616d0000b27300103a3729bf589e0dc913ab": "strong-subject",
    "01/ab67616d00001e0200015a7a9909e03141e001e3.jpg": "strong-subject",
    "09/ab67616d0000b2730009448702be55dfc86fde67": "strong-subject",
    "00/ab67616d00001e020000269ead63cf2376a6b67d.jpg": "all-typography",
    "04/ab67616d00001e020004ccf0ae91364130886c02": "all-typography",
    "00/ab67616d00001e02000060b6aa68cdd9e02567b1.jpg": "accent-on-flat",
    "00/ab67616d00001e020000e692a330542f8ed14132.jpg": "accent-on-flat",
    "01/ab67616d00001e0200018a1e2daf68a53f504cb9.jpg": "abstract",
    "09/ab67616d0000b27300097e55f9a93ceb03afa4b2": "abstract",
    "03/ab67616d00001e02000300752f338b6aedff856c.jpg": "scene",
    "02/ab67616d0000b2730002dc280ccc28cadb7d4ae4.jpg": "scene",
}

# The five to render, one per kind plus a second strong subject: the decision here is whether a
# mask is COHERENT (one region, on the thing a person would point at), which no hit rate shows.
OVERLAY_IMAGES = (
    "images/orelsan.jpg",                               # strong subject, dark
    "09/ab67616d0000b2730009448702be55dfc86fde67",      # one object on an empty field
    "00/ab67616d00001e020000e692a330542f8ed14132.jpg",  # bright red object on white
    "00/ab67616d00001e02000060b6aa68cdd9e02567b1.jpg",  # one small coloured mark, near-empty
    "00/ab67616d00001e020000269ead63cf2376a6b67d.jpg",  # no object at all, only type
)

MASK_COLOR = np.array([255, 40, 40], dtype=np.float32)
MASK_ALPHA = 0.55
PANEL_PX = 300
GRID_COLS = 6


def _blend(canvas: np.ndarray, mask: np.ndarray) -> np.ndarray:
    sel = mask.astype(bool)
    canvas[sel] = (canvas[sel] * (1 - MASK_ALPHA) + MASK_COLOR * MASK_ALPHA).astype(np.uint8)
    return canvas


def _render(rel_path: str, image, result, prompts: list[str], out_dir: Path) -> Path:
    """One sheet per image: the original, then the same image under every phrasing."""
    from PIL import Image, ImageDraw

    out_dir.mkdir(parents=True, exist_ok=True)
    base = np.array(image)
    panels: list[tuple[str, "Image.Image"]] = [("original", image)]
    for phrase in prompts:
        hits = [inst for inst in result.instances if inst.concept == phrase]
        canvas = base.copy()
        for inst in hits:
            canvas = _blend(canvas, inst.mask)
        best = max((inst.score for inst in hits), default=0.0)
        area = sum(inst.area_fraction for inst in hits)
        label = f"{phrase} n={len(hits)}"
        if hits:
            label += f" max={best:.2f} a={area:.2f}"
        panels.append((label, Image.fromarray(canvas)))

    label_h = 15
    rows = (len(panels) + GRID_COLS - 1) // GRID_COLS
    sheet = Image.new("RGB", (GRID_COLS * PANEL_PX, rows * (PANEL_PX + label_h)), "white")
    draw = ImageDraw.Draw(sheet)
    for i, (label, img) in enumerate(panels):
        thumb = img.copy()
        thumb.thumbnail((PANEL_PX, PANEL_PX))
        x = (i % GRID_COLS) * PANEL_PX
        y = (i // GRID_COLS) * (PANEL_PX + label_h)
        sheet.paste(thumb, (x, y))
        draw.text((x + 2, y + PANEL_PX + 2), label[:48], fill="black")

    name = IMAGE_KINDS.get(rel_path, "image") + "-" + Path(rel_path).stem[-8:]
    out = out_dir / f"{name}.png"
    sheet.save(out)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--prompts", nargs="*", default=CANDIDATES)
    ap.add_argument("--overlay-dir", default=None)
    args = ap.parse_args()

    refs = common.read_list_file(Path(args.list))
    prompts = tuple((p, p) for p in args.prompts)

    runtime = common.load_sam(verify_weights=False)
    sink = common.JsonlSink(config.DATA_DIR / f"{args.out}.jsonl")
    fired: dict[str, int] = {p: 0 for p in args.prompts}
    fired_calibrated: dict[str, int] = {p: 0 for p in args.prompts}
    by_kind: dict[str, dict[str, int]] = {}
    rendered: list[str] = []
    try:
        for ref in refs:
            kind = IMAGE_KINDS.get(ref.rel_path, "unknown")
            by_kind.setdefault(kind, {p: 0 for p in args.prompts})
            image, source_long_edge, _ = common.decode_image(ref.abs_path)
            result = common.segment_concepts(runtime, image, prompts=prompts)
            per_prompt: dict[str, list] = {p: [] for p in args.prompts}
            for inst in result.instances:
                per_prompt[inst.concept].append({
                    "score": round(inst.score, 4),
                    "area_fraction": round(inst.area_fraction, 6),
                    "bbox": [round(v, 4) for v in inst.bbox],
                })
            for p, hits in per_prompt.items():
                if hits:
                    fired[p] += 1
                    by_kind[kind][p] += 1
                if any(h["score"] >= config.CALIBRATED_SCORE_THRESHOLD for h in hits):
                    fired_calibrated[p] += 1
            sink.write({
                "probe": args.out,
                "image_path": ref.rel_path,
                "image_kind": kind,
                "image_sha256": common.sha256_file(ref.abs_path),
                "artwork_id": ref.artwork_id,
                "collection": ref.collection,
                "width": result.width,
                "height": result.height,
                "source_long_edge": source_long_edge,
                "seconds": round(result.seconds_total, 2),
                "model_revision": config.MODEL_REVISION,
                "score_threshold": config.SCORE_THRESHOLD,
                "calibrated_score_threshold": config.CALIBRATED_SCORE_THRESHOLD,
                "prompts": list(args.prompts),
                "families": {k: list(v) for k, v in FAMILIES.items()},
                "per_prompt": per_prompt,
            })
            if args.overlay_dir and ref.rel_path in OVERLAY_IMAGES:
                rendered.append(str(_render(ref.rel_path, image, result, list(args.prompts),
                                            Path(args.overlay_dir))))
            print(f"{kind:15s} {ref.rel_path[-28:]:30} " +
                  " ".join(f"{p}={len(h)}" for p, h in per_prompt.items() if h), flush=True)
    finally:
        sink.close()

    print(f"\nimages (of {len(refs)}) where the phrasing fired, "
          f"at the stored cut {config.SCORE_THRESHOLD} / at the calibrated "
          f"{config.CALIBRATED_SCORE_THRESHOLD}:")
    for family, members in FAMILIES.items():
        print(f"  [{family}]")
        for p in members:
            print(f"    {fired[p]:2d} / {fired_calibrated[p]:2d}  {p}")
    print("\nby image kind (stored cut):")
    kinds = sorted(by_kind)
    print(f"    {'phrasing':26s} " + " ".join(f"{k[:14]:>15s}" for k in kinds))
    for p in args.prompts:
        print(f"    {p:26s} " + " ".join(f"{by_kind[k][p]:>15d}" for k in kinds))
    for path in rendered:
        print("overlay:", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
