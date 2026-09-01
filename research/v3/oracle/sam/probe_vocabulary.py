"""Concept-vocabulary alignment probe (probe 2). Evidence only — writes no config.

Same shape as probe_prompts.py (which chose the current CONCEPT_PROMPTS): run a list of
candidate phrasings as separate prompts over a hand-picked image list, record every
instance's score / area fraction / bbox, and render overlays a human can look at.

What is different from probe 1: probe 1 asked "does any phrasing fire at all". This one
asks "does the phrasing fire on the THING WE MEAN" — the reviewer's mask-quality round
found the model is willing to fire, but under words that mislabel what it found
(parental-advisory marks arriving as "sticker", artist names arriving as "album title").
So this probe pairs each phrasing against images whose contents were confirmed by eye,
and renders a zoom crop on the target region so the mask can be judged, not just counted.

    .venv/bin/python probe_vocabulary.py --list vocab-probe-15.txt \
        --out probe-2-vocabulary --overlay-dir ../../data/sam/vocab-probe-overlays

Nothing here imports or mutates config.CONCEPT_PROMPTS. Changing the question set is the
reviewer's call (loose end A5).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

import common
import config

# [n=1] Candidate phrasings, from the reviewer's MASK_REVIEW_NOTES.md observations plus two
# the orchestrator judged promising. 16 phrasings, the cap the probe was scoped to.
CANDIDATES = [
    # note 2 — parental-advisory marks are detected but land under "sticker".
    "parental advisory",
    "parental advisory sticker",
    "parental advisory label",
    "advisory sticker",
    "explicit content",          # added: the mark's own second line is EXPLICIT CONTENT
    # note 1 — provenance-neutral words for the emblem idea ("logo" implies whose it is).
    "emblem",
    "badge",
    "brand mark",
    "record label logo",
    "wordmark",                  # added: most album "logos" are in fact letterform marks
    # note 5 — "album title" is really "the main display text".
    "title text",
    "main text",
    "large text",
    # incumbents, as baselines. These three are in CONCEPT_PROMPTS today.
    "album title",
    "logo",
    "sticker",
]

# Which phrasings share a question, for the per-family hit-rate table. Report-only.
FAMILIES: dict[str, tuple[str, ...]] = {
    "parental_advisory": ("parental advisory", "parental advisory sticker",
                          "parental advisory label", "advisory sticker", "explicit content"),
    "emblem": ("emblem", "badge", "brand mark", "record label logo", "wordmark"),
    "main_text": ("title text", "main text", "large text"),
    "incumbent": ("album title", "logo", "sticker"),
}

# --------------------------------------------------------------------------- overlays

# The decision-relevant close-ups. Each entry: image, the phrasings to put side by side,
# and a normalized region of interest (x0, y0, x1, y1) around the thing being tested —
# read off the image by eye, so the zoom row shows the target even when the mask misses it.
PA_WORDS = ("parental advisory", "parental advisory sticker", "parental advisory label",
            "advisory sticker", "explicit content", "sticker")
EMBLEM_WORDS = ("logo", "emblem", "badge", "brand mark", "record label logo", "wordmark")
TEXT_WORDS = ("album title", "title text", "main text", "large text")

OVERLAY_JOBS: tuple[dict, ...] = (
    {"name": "pa-greenday", "image": "images/greenday.jpg",
     "prompts": PA_WORDS, "roi": (0.68, 0.79, 1.00, 1.00)},
    {"name": "pa-dark-photo", "image": "0d/ab67616d0000b273000d8049603d6ab7f5d759bb",
     "prompts": PA_WORDS, "roi": (0.74, 0.81, 1.00, 1.00)},
    {"name": "pa-small-rendition", "image": "0f/ab67616d00001e02000f723f36271de0ed3aa893",
     "prompts": PA_WORDS, "roi": (0.00, 0.83, 0.28, 1.00)},
    {"name": "logo-franz-domino", "image": "images/franz.jpg",
     "prompts": EMBLEM_WORDS, "roi": (0.80, 0.86, 1.00, 1.00)},
    {"name": "emblem-crest", "image": "02/ab67616d0000b2730002dfdcde2cb0a75822168c.jpg",
     "prompts": EMBLEM_WORDS, "roi": (0.18, 0.18, 0.82, 0.88)},
    {"name": "sticker-real", "image": "03/ab67616d0000b2730003580bd2766859c4d81e13.jpg",
     "prompts": ("sticker", "badge", "emblem", "parental advisory sticker",
                 "advisory sticker", "brand mark"),
     "roi": (0.62, 0.47, 1.00, 0.97)},
    {"name": "title-vs-artist", "image": "images/toxicity.jpg",
     "prompts": TEXT_WORDS, "roi": (0.00, 0.30, 1.00, 1.00)},
)

MASK_COLOR = np.array([255, 40, 40], dtype=np.float32)
MASK_ALPHA = 0.55
PANEL_PX = 340


def _blend(canvas: np.ndarray, mask: np.ndarray) -> np.ndarray:
    sel = mask.astype(bool)
    canvas[sel] = (canvas[sel] * (1 - MASK_ALPHA) + MASK_COLOR * MASK_ALPHA).astype(np.uint8)
    return canvas


def _render_job(job: dict, image, result, out_dir: Path) -> Path:
    """Two rows: whole image per phrasing, then the same masks zoomed on the ROI."""
    from PIL import Image, ImageDraw

    out_dir.mkdir(parents=True, exist_ok=True)
    base = np.array(image)
    h, w = base.shape[:2]
    x0, y0, x1, y1 = job["roi"]
    box = (int(x0 * w), int(y0 * h), max(1, int(x1 * w)), max(1, int(y1 * h)))

    prompts = list(job["prompts"])
    cols = len(prompts) + 1
    label_h = 14
    sheet = Image.new("RGB", (cols * PANEL_PX, 2 * (PANEL_PX + label_h)), "white")
    draw = ImageDraw.Draw(sheet)

    def place(col: int, row: int, img, label: str) -> None:
        thumb = img.copy()
        thumb.thumbnail((PANEL_PX, PANEL_PX))
        px = col * PANEL_PX
        py = row * (PANEL_PX + label_h)
        sheet.paste(thumb, (px, py))
        draw.text((px + 2, py + PANEL_PX + 2), label[:46], fill="black")

    place(0, 0, image, "original")
    place(0, 1, image.crop(box), "original (zoom on target)")

    for i, p in enumerate(prompts, start=1):
        hits = [inst for inst in result.instances if inst.concept == p]
        canvas = base.copy()
        for inst in hits:
            canvas = _blend(canvas, inst.mask)
        painted = Image.fromarray(canvas)
        best = max((inst.score for inst in hits), default=0.0)
        tag = f"{p} n={len(hits)}" + (f" max={best:.2f}" if hits else "")
        place(i, 0, painted, tag)
        place(i, 1, painted.crop(box), "zoom")

    out = out_dir / f"{job['name']}.png"
    sheet.save(out)
    return out


# --------------------------------------------------------------------------- run

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--prompts", nargs="*", default=CANDIDATES)
    ap.add_argument("--overlay-dir", default=None)
    args = ap.parse_args()

    refs = common.read_list_file(Path(args.list))
    prompts = tuple((p, p) for p in args.prompts)
    jobs_by_image = {j["image"]: j for j in OVERLAY_JOBS}

    runtime = common.load_sam(verify_weights=False)
    sink = common.JsonlSink(config.DATA_DIR / f"{args.out}.jsonl")
    fired: dict[str, int] = {p: 0 for p in args.prompts}
    rendered: list[str] = []
    try:
        for ref in refs:
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
            sink.write({
                "probe": args.out,
                "image_path": ref.rel_path,
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
                "per_prompt": per_prompt,
            })
            if args.overlay_dir and ref.rel_path in jobs_by_image:
                out = _render_job(jobs_by_image[ref.rel_path], image, result,
                                  Path(args.overlay_dir))
                rendered.append(str(out))
            print(f"{ref.rel_path[:50]:52} " +
                  " ".join(f"{p}={len(h)}" for p, h in per_prompt.items() if h), flush=True)
    finally:
        sink.close()

    print(f"\nimages (of {len(refs)}) where the phrasing fired at all "
          f"(score>={config.SCORE_THRESHOLD}):")
    for p, n in sorted(fired.items(), key=lambda kv: -kv[1]):
        print(f"  {n:2d}  {p}")
    for path in rendered:
        print("overlay:", path)
    print(json.dumps({"families": {k: list(v) for k, v in FAMILIES.items()}}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
