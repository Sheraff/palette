"""Script / object / overlay probe (probe 4). Evidence only — writes no config.

Same shape as probe_prompts.py (probe 1), probe_vocabulary.py (probe 2) and
probe_salience.py (probe 3): run candidate phrasings as separate prompts over a hand-picked
image list, record every instance's score / area fraction / bbox, render overlays a human
can look at, change nothing.

    .venv/bin/python probe_scripts_objects.py --list probe-4-16.txt \
        --out probe-4-scripts-objects --overlay-dir ../../data/sam/probe-4-overlays

What is different from probes 1-3. Those asked about the categories the concept set already
carries (glyphs, marks, people) and about non-semantic salience. This one asks about the two
things the reviewer WATCHED THE PIPELINE MISS in the residual round
(sam-mask-quality-2-v2-ratification, 7 of 15 residuals judged only "partly" field):

  * a block of Chinese characters left standing in the residual on smq2f-02b3899bac5b, while
    the Latin "Rose Liu" on the same cover was masked. Concept set v2's glyph words are
    "words" / "letter" / "lettering" / "album title" — all four name a LATIN unit. The
    question is whether the model can find non-Latin script under a word that names it.
  * a whole car left standing in the residual on smq2f-3394ee31e933 (residual fraction
    0.969: the cover is a car, and the pipeline called almost all of it field). The concept
    set has no noun for any object that is not a person, a face or a mark. The question is
    whether object nouns work at all — which is the load-bearing assumption under the
    proposed VLM->SAM synergy (the VLM names the subject, SAM masks the named noun).

Two controls travel inside the probe so a hit rate here can be read against something
measured on the same 16 images: "text", which probe 1 measured at 0/10 and which should stay
near zero, and "words", the incumbent glyph concept, which should fire on the Latin covers.

Nothing here imports or mutates config.CONCEPT_PROMPTS. A positive result is a PROPOSAL;
changing the question set is the reviewer's call (loose end A5).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

import common
import config

# [n=1] Candidates, from the reviewer's directive after the residual round. 14 phrasings.
# Grouped by the question each family asks; every phrasing appears in exactly one family.
CJK_PHRASES = (
    "chinese characters",   # the reviewer's own words for the thing that was missed
    "characters",           # the bare noun — does the qualifier carry the meaning?
    "asian text",           # a region word rather than a script word
    "hanzi",                # the script's endonym (Chinese)
    "kanji",                # the script's endonym (Japanese) — 2 covers here are Japanese
    "calligraphy",          # names the rendering, not the script
    "foreign text",         # relative to the model's default, not to anything in the image
)
OBJECT_PHRASES = (
    "car",                  # bare noun
    "vehicle",              # hypernym
    "the car",              # same noun with a definite article — does the determiner matter?
)
OVERLAY_PHRASES = (
    "barcode",
    "watermark",
)
# Controls, measured on these same 16 images so the numbers above have a scale.
# "text": probe 1 measured 0/10 with this model. If it fires here, probe 1's floor moved and
# every other number in this probe has to be re-read.
# "words": the incumbent glyph concept from set v2. It is expected to fire on the Latin
# covers; where it fires on a CJK cover, the CJK phrasings are not adding a new category.
CONTROL_PHRASES = ("text", "words")

CANDIDATES = list(CJK_PHRASES + OBJECT_PHRASES + OVERLAY_PHRASES + CONTROL_PHRASES)

FAMILIES: dict[str, tuple[str, ...]] = {
    "cjk_script": CJK_PHRASES,
    "object_noun": OBJECT_PHRASES,
    "applied_overlay": OVERLAY_PHRASES,
    "control": CONTROL_PHRASES,
}

# What each image is, CONFIRMED BY EYE before the run (see PROBE4_NOTES.md "Selection"), so
# the per-image table reads as evidence and not as hashes. Keys are the repo-relative paths
# in probe-4-16.txt. `kind` drives the by-kind table; `has` is the ground truth a hit rate is
# scored against.
IMAGE_KINDS: dict[str, dict] = {
    "10/ab67616d0000b27300100a3e9c764acf01c16db8":
        {"kind": "cjk-chinese", "has": ["cjk", "latin"], "note": "MISS: 没有你的天冬 left standing"},
    "00/ab67616d0000b27300002947b898e4bd572ac4aa.jpg":
        {"kind": "vehicle", "has": ["car", "latin"], "note": "MISS: whole G-class left standing"},
    "03/ab67616d0000b2730003f2b6590090abe420d104.jpg":
        {"kind": "cjk-chinese", "has": ["cjk", "latin"], "note": "佛前等花开 across the top"},
    "08/ab67616d0000b2730008f7b7f01d9149dbe92fa0":
        {"kind": "cjk-japanese", "has": ["cjk"], "note": "森昌子 / こころ雪, vertical"},
    "10/ab67616d00001e0200106c3252a4c133c0abde36":
        {"kind": "cjk-japanese", "has": ["cjk", "latin"], "note": "言葉を恐れる under FEARING WORDS"},
    "00/ab67616d0000b2730000cb591a0d52d8b88692d9.jpg":
        {"kind": "nonlatin-other", "has": ["nonlatin", "latin"], "note": "Korean hangul"},
    "05/ab67616d0000b2730005230fae1822525e5a5ff6":
        {"kind": "nonlatin-other", "has": ["nonlatin"], "note": "Thai"},
    "00/ab67616d0000b27300009f60aeb150a5db45b47b.jpg":
        {"kind": "nonlatin-other", "has": ["nonlatin", "latin"], "note": "Malayalam"},
    "02/ab67616d00001e020002881a851f1e14c374562b.jpg":
        {"kind": "vehicle", "has": ["car", "latin"], "note": "illustrated yellow sedan"},
    "01/ab67616d0000b2730001adc121d5ed117cfdbd91.jpg":
        {"kind": "vehicle", "has": ["car"], "note": "illustrated Suzuki jeep"},
    "0a/ab67616d0000b273000ae334b447825e117f2e01":
        {"kind": "vehicle", "has": ["car"], "note": "photoreal Lamborghini"},
    "0d/ab67616d00001e02000d676569f781897718a085":
        {"kind": "vehicle", "has": ["car", "latin"], "note": "red saloon + four people"},
    "03/ab67616d0000b2730003580bd2766859c4d81e13.jpg":
        {"kind": "barcode", "has": ["barcode", "latin"], "note": "EAN barcode on a promo sticker"},
    "07/ab67616d0000b27300072f04eb3dae24ba1cc3e8":
        {"kind": "barcode", "has": ["barcode", "latin"], "note": "shipping label + PA mark"},
    "03/ab67616d00001e02000300752f338b6aedff856c.jpg":
        {"kind": "negative", "has": [], "note": "spa photo; set v2 found nothing at all"},
    "images/toxicity.jpg":
        {"kind": "negative", "has": ["latin"], "note": "Latin display type only"},
}

# --------------------------------------------------------------------------- overlays

# The decision-relevant close-ups. Each entry: image, the phrasings to put side by side, and
# a normalized region of interest (x0, y0, x1, y1) around the thing being tested — read off
# the image by eye, so the zoom row shows the target even when the mask misses it.
CJK_WORDS = ("chinese characters", "characters", "asian text", "hanzi", "kanji",
             "calligraphy", "foreign text", "words")
CAR_WORDS = ("car", "vehicle", "the car", "words")
MARK_WORDS = ("barcode", "watermark", "words")

OVERLAY_JOBS: tuple[dict, ...] = (
    {"name": "cjk-roseliu-THE-MISS", "image": "10/ab67616d0000b27300100a3e9c764acf01c16db8",
     "prompts": CJK_WORDS, "roi": (0.55, 0.02, 1.00, 0.60)},
    {"name": "cjk-fofront", "image": "03/ab67616d0000b2730003f2b6590090abe420d104.jpg",
     "prompts": CJK_WORDS, "roi": (0.26, 0.00, 1.00, 0.24)},
    {"name": "cjk-japanese-vertical", "image": "08/ab67616d0000b2730008f7b7f01d9149dbe92fa0",
     "prompts": CJK_WORDS, "roi": (0.48, 0.00, 1.00, 1.00)},
    {"name": "cjk-japanese-inline", "image": "10/ab67616d00001e0200106c3252a4c133c0abde36",
     "prompts": CJK_WORDS, "roi": (0.06, 0.38, 0.94, 0.66)},
    {"name": "car-goals-THE-MISS", "image": "00/ab67616d0000b27300002947b898e4bd572ac4aa.jpg",
     "prompts": CAR_WORDS, "roi": (0.06, 0.26, 0.84, 0.80)},
    {"name": "car-lamborghini", "image": "0a/ab67616d0000b273000ae334b447825e117f2e01",
     "prompts": CAR_WORDS, "roi": (0.00, 0.22, 1.00, 0.92)},
    {"name": "car-vs-people", "image": "0d/ab67616d00001e02000d676569f781897718a085",
     "prompts": CAR_WORDS, "roi": (0.06, 0.42, 1.00, 0.88)},
    {"name": "barcode-sticker", "image": "03/ab67616d0000b2730003580bd2766859c4d81e13.jpg",
     "prompts": MARK_WORDS, "roi": (0.30, 0.40, 0.80, 1.00)},
)

MASK_COLOR = np.array([255, 40, 40], dtype=np.float32)
MASK_ALPHA = 0.55
PANEL_PX = 320


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
        draw.text((px + 2, py + PANEL_PX + 2), label[:48], fill="black")

    place(0, 0, image, "original")
    place(0, 1, image.crop(box), "original (zoom on target)")

    for i, p in enumerate(prompts, start=1):
        hits = [inst for inst in result.instances if inst.concept == p]
        canvas = base.copy()
        for inst in hits:
            canvas = _blend(canvas, inst.mask)
        painted = Image.fromarray(canvas)
        best = max((inst.score for inst in hits), default=0.0)
        area = sum(inst.area_fraction for inst in hits)
        tag = f"{p} n={len(hits)}" + (f" max={best:.2f} a={area:.2f}" if hits else "")
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
    fired_calibrated: dict[str, int] = {p: 0 for p in args.prompts}
    by_kind: dict[str, dict[str, int]] = {}
    kind_counts: dict[str, int] = {}
    rendered: list[str] = []
    seconds_total = 0.0
    try:
        for ref in refs:
            meta = IMAGE_KINDS.get(ref.rel_path, {"kind": "unknown", "has": [], "note": ""})
            kind = meta["kind"]
            by_kind.setdefault(kind, {p: 0 for p in args.prompts})
            kind_counts[kind] = kind_counts.get(kind, 0) + 1
            image, source_long_edge, _ = common.decode_image(ref.abs_path)
            result = common.segment_concepts(runtime, image, prompts=prompts)
            seconds_total += result.seconds_total
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
                "image_contains": meta["has"],
                "image_note": meta["note"],
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
            if args.overlay_dir and ref.rel_path in jobs_by_image:
                rendered.append(str(_render_job(jobs_by_image[ref.rel_path], image, result,
                                                Path(args.overlay_dir))))
            print(f"{kind:15s} {ref.rel_path[-26:]:28} " +
                  " ".join(f"{p}={len(h)}" for p, h in per_prompt.items() if h), flush=True)
    finally:
        sink.close()

    print(f"\nimages (of {len(refs)}) where the phrasing fired, at the stored cut "
          f"{config.SCORE_THRESHOLD} / at the calibrated {config.CALIBRATED_SCORE_THRESHOLD}:")
    for family, members in FAMILIES.items():
        print(f"  [{family}]")
        for p in members:
            print(f"    {fired[p]:2d} / {fired_calibrated[p]:2d}  {p}")
    kinds = sorted(by_kind)
    print("\nby image kind (stored cut), n per kind: " +
          " ".join(f"{k}={kind_counts[k]}" for k in kinds))
    print(f"    {'phrasing':20s} " + " ".join(f"{k[:15]:>16s}" for k in kinds))
    for p in args.prompts:
        print(f"    {p:20s} " + " ".join(f"{by_kind[k][p]:>16d}" for k in kinds))
    print(f"\ninference seconds over {len(refs)} images: {seconds_total:.1f}")
    for path in rendered:
        print("overlay:", path)
    print(json.dumps({"families": {k: list(v) for k, v in FAMILIES.items()}}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
