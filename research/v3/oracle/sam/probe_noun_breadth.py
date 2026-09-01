"""Noun-breadth probe (probe 5). Evidence only — writes no config.

The pre-committed follow-up to probe 4. Probe 4 found that the object noun `car` masks at
0.82-0.93 on five vehicle covers and returns nothing on eleven covers without one, and
named the limit itself: n=1 noun class, and "car" is a COCO class that SAM 3.1 has almost
certainly seen a great deal of. The VLM -> SAM synergy design rests on the claim that ANY
noun the VLM emits for `subject_kind` is maskable, so the claim has to be tested across the
vocabulary, not on its friendliest member.

    .venv/bin/python probe_noun_breadth.py --list probe-5-32.txt \
        --out probe-5-noun-breadth --overlay-dir ../../data/sam/probe-5-overlays

21 nouns x 32 covers, every pair run. The nouns sit at the granularity a VLM would
plausibly emit for `subject_kind` (person|animal|vehicle|object|building_or_structure|
abstract_shape): species and artefact names, not the vocabulary's own class words. Whether
that is the right granularity is the question the round answers.

Nothing here imports or mutates config.CONCEPT_PROMPTS. Everything is a PROPOSAL.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

import common
import config

# [n=1] The nouns, from the orchestrator's directive. Grouped by the subject_kind class
# each one would be an instance of, so precision and recall can be read per class rather
# than only per word. `car` is deliberately absent — probe 4 measured it.
ANIMAL_NOUNS = ("dog", "cat", "bird", "horse", "wolf", "snake")
VEHICLE_NOUNS = ("motorcycle", "airplane", "boat", "train")
OBJECT_NOUNS = ("guitar", "skull", "flower", "crown", "sword", "bottle", "hand", "eye")
BUILDING_NOUNS = ("building", "castle", "church")

NOUNS = list(ANIMAL_NOUNS + VEHICLE_NOUNS + OBJECT_NOUNS + BUILDING_NOUNS)

NOUN_CLASS: dict[str, str] = {
    **{n: "animal" for n in ANIMAL_NOUNS},
    **{n: "vehicle" for n in VEHICLE_NOUNS},
    **{n: "object" for n in OBJECT_NOUNS},
    **{n: "building_or_structure" for n in BUILDING_NOUNS},
}

# What each image is, CONFIRMED BY EYE before the run (see probe-5-32.txt and
# PROBE5_NOTES.md "Selection").
#
#   contains  — nouns genuinely present and nameable as the cover's subject. Scored:
#               a hit is a TP, a miss is a FN.
#   marginal  — present but either tiny, a background element, or true only under a
#               hypernym reading (a castle IS a building). NOT scored either way, so one
#               debatable call cannot move a precision number. Reported separately.
#   Anything not in either list is absent: a hit there is a false positive.
IMAGE_KINDS: dict[str, dict] = {
    # animal
    "music-artworks/d/d/9/dd95b18ea17e908b574f979a04f9a57e.jpeg":
        {"kind": "animal", "contains": ["dog"], "marginal": [],
         "note": "Sublime, dalmatian head, photo, 200 px"},
    "0c/ab67616d0000b273000c069d3bcb8bdf56fa13c6":
        {"kind": "animal", "contains": ["dog"], "marginal": [],
         "note": "labrador puppy over a fence, painterly"},
    "0a/ab67616d0000b273000af1c11910420097c7c17d":
        {"kind": "animal", "contains": ["cat"], "marginal": [],
         "note": "3D-render cat in a coat and sunglasses"},
    "music-artworks/0/8/7/0877cba57e0ec2d3c070e98f370f0e14.jpg":
        {"kind": "animal", "contains": ["cat"], "marginal": [],
         "note": "Two Door Cinema Club: cat on a tiled floor, face under the lettering"},
    "0a/ab67616d0000b273000a8fbacb36eb7117fc2c9e":
        {"kind": "animal", "contains": ["bird"], "marginal": [],
         "note": "LANKS: heron, single-line ink drawing"},
    "0a/ab67616d0000b273000a83b7c6800384e7844947":
        {"kind": "animal", "contains": ["horse"], "marginal": ["building", "eye"],
         "note": "rider on a horse, temple ruins behind, an eye pictogram in the logo"},
    "08/ab67616d00001e020008d893f0bd46d92879ecfe":
        {"kind": "animal", "contains": ["wolf"], "marginal": [],
         "note": "TAPX: photoreal grey wolf head. The dog-confusion cover."},
    "06/ab67616d0000b273000607016a75d355ddcda4d5":
        {"kind": "animal", "contains": ["snake"], "marginal": [],
         "note": "line-drawn snake head, mouth open"},
    "05/ab67616d0000b2730005165a15d80c563a8d1ec2":
        {"kind": "animal", "contains": ["snake"], "marginal": [],
         "note": "python in extreme close-up, fills the frame"},
    "10/ab67616d0000b27300103a4dcd62e3dd6f76d123":
        {"kind": "confusion", "contains": [], "marginal": ["dog", "wolf"],
         "note": "CONFUSION: a jackal in sunglasses. Canid, but neither dog nor wolf."},
    # vehicle
    "music-artworks/f/6/e/f6e43b68717bfa885e0184726050e236.jpg":
        {"kind": "vehicle", "contains": ["motorcycle", "guitar"], "marginal": [],
         "note": "man with an acoustic guitar sitting on a Triumph motorcycle"},
    "0c/ab67616d0000b273000c24210b3f9176ec11476d":
        {"kind": "vehicle", "contains": ["motorcycle"], "marginal": [],
         "note": "SOUL RIDER: flat illustrated motorcycle head-on"},
    "0a/ab67616d0000b273000a8d65a3ec806f6fc5ee35":
        {"kind": "vehicle", "contains": ["airplane"], "marginal": [],
         "note": "illustrated airliner, flat blue sky"},
    "0c/ab67616d0000b273000ca1c3255cc995f1a3164e":
        {"kind": "vehicle", "contains": ["boat"], "marginal": [],
         "note": "two cut-paper sailboats on lilac"},
    "04/ab67616d0000b27300041272670218ce2846bb53":
        {"kind": "vehicle", "contains": ["train"], "marginal": ["building"],
         "note": "ALADIAH: rendered futuristic train, skyscrapers behind"},
    "music-artworks/0/4/3/043d90c5ece68ff04f6fb5d1840160f4.jpg":
        {"kind": "confusion", "contains": [], "marginal": ["train", "building"],
         "note": "CONFUSION: WESTBOUND TRAIN — tram rails down a street, no train"},
    # object
    "music-artworks/9/a/c/9ac7fdc2642344cbd5a5872280288849.jpg":
        {"kind": "object", "contains": ["guitar"], "marginal": [],
         "note": "MODERN ROCK: flat black vector electric guitar"},
    "music-artworks/c/5/5/c55f2a22c68d239f35fe4759c8418803.jpeg":
        {"kind": "object", "contains": ["skull"], "marginal": [],
         "note": "Apocalyptica Cult: gold-brown human skull"},
    "13/ab67616d0000b2730013db392206cd6de01f1244":
        {"kind": "object", "contains": ["flower"], "marginal": ["building"],
         "note": "Tam Hoa: one huge rendered lotus, temple roofs behind"},
    "music-artworks/f/8/b/f8bc8ebeb35be8ba72204d7e8836cd6f.jpg":
        {"kind": "object", "contains": ["crown"], "marginal": ["cat"],
         "note": "The Cat Empire: a crown as a flat black logo mark; also reads as a cat face"},
    "05/ab67616d0000b2730005c56a37733366157bded5":
        {"kind": "object", "contains": ["sword"], "marginal": [],
         "note": "broadsword on red velvet"},
    "04/ab67616d0000b2730004540907fd374c565be4fe":
        {"kind": "object", "contains": ["bottle"], "marginal": [],
         "note": "photoreal cognac bottle on white"},
    "music-artworks/f/0/b/f0b30841427761da4a6f4485531ac940.png":
        {"kind": "object", "contains": ["hand"], "marginal": [],
         "note": "open hand, high-contrast cutout on black"},
    "0a/ab67616d0000b273000a771967b5f8e7bac0a72b":
        {"kind": "object", "contains": ["eye"], "marginal": [],
         "note": "macro photograph of a human eye with glitter make-up"},
    "music-artworks/c/9/3/c93879d4eb9c7d253c506bcc5a0da824.jpeg":
        {"kind": "object", "contains": ["eye"], "marginal": [],
         "note": "Here I am: a small painted eye inside a torn slit. Tiny and occluded."},
    # building_or_structure
    "music-artworks/f/0/7/f07445c85d91adecbf3041484ceb2bf9.jpg":
        {"kind": "building_or_structure", "contains": ["building"], "marginal": [],
         "note": "Nada Surf: a row of pencil-drawn apartment blocks at night"},
    "0d/ab67616d0000b273000df513b5836ea38782585e":
        {"kind": "building_or_structure", "contains": ["castle"], "marginal": ["building"],
         "note": "photoreal fairy-tale castle at dusk"},
    "01/ab67616d0000b2730001f963b2198065ea271e75.jpg":
        {"kind": "building_or_structure", "contains": ["church"], "marginal": ["building"],
         "note": "white clapboard church with a steeple and cross"},
    # negatives
    "03/ab67616d00001e02000300752f338b6aedff856c.jpg":
        {"kind": "negative", "contains": [], "marginal": ["building"],
         "note": "spa interior; concept set v2 found nothing at all here"},
    "images/toxicity.jpg":
        {"kind": "negative", "contains": [], "marginal": ["building"],
         "note": "hillside + display lettering + a radio mast on the ridge"},
    "00/ab67616d0000b2730000cb591a0d52d8b88692d9.jpg":
        {"kind": "negative", "contains": [], "marginal": [],
         "note": "[mot]: abstract painted texture and type, no depicted object"},
    "03/ab67616d0000b2730003f2b6590090abe420d104.jpg":
        {"kind": "negative", "contains": [], "marginal": [],
         "note": "woman with wind-blown hair under a Chinese brush title"},
}

# --------------------------------------------------------------------------- overlays

# Seven close-ups, chosen for what they decide rather than for how they look.
CANID_WORDS = ("dog", "wolf", "cat", "horse")
BUILDING_WORDS = ("building", "castle", "church")

OVERLAY_JOBS: tuple[dict, ...] = (
    # a correct animal, photoreal, the easiest case the animal side has
    {"name": "animal-dog-dalmatian",
     "image": "music-artworks/d/d/9/dd95b18ea17e908b574f979a04f9a57e.jpeg",
     "prompts": CANID_WORDS, "roi": (0.30, 0.00, 1.00, 1.00)},
    # a correct animal that is nearly all occluded by lettering
    {"name": "animal-cat-occluded",
     "image": "music-artworks/0/8/7/0877cba57e0ec2d3c070e98f370f0e14.jpg",
     "prompts": CANID_WORDS, "roi": (0.20, 0.15, 1.00, 1.00)},
    # THE confusion: does the right noun for a wolf also come out of `dog`?
    {"name": "confusion-wolf-vs-dog",
     "image": "08/ab67616d00001e020008d893f0bd46d92879ecfe",
     "prompts": CANID_WORDS, "roi": (0.10, 0.05, 0.95, 0.95)},
    # the second confusion: a canid that is neither
    {"name": "confusion-jackal",
     "image": "10/ab67616d0000b27300103a4dcd62e3dd6f76d123",
     "prompts": CANID_WORDS, "roi": (0.05, 0.00, 1.00, 1.00)},
    # two nouns, one cover, plus a person: the partition test
    {"name": "object-guitar-vs-motorcycle",
     "image": "music-artworks/f/6/e/f6e43b68717bfa885e0184726050e236.jpg",
     "prompts": ("motorcycle", "guitar", "airplane"), "roi": (0.00, 0.20, 1.00, 1.00)},
    # building family, and whether the hypernym and the species fight
    {"name": "building-church",
     "image": "01/ab67616d0000b2730001f963b2198065ea271e75.jpg",
     "prompts": BUILDING_WORDS, "roi": (0.05, 0.20, 1.00, 0.95)},
    {"name": "building-castle",
     "image": "0d/ab67616d0000b273000df513b5836ea38782585e",
     "prompts": BUILDING_WORDS, "roi": (0.00, 0.10, 1.00, 1.00)},
    # a target with no background to be tight against
    {"name": "animal-snake-fills-frame",
     "image": "05/ab67616d0000b2730005165a15d80c563a8d1ec2",
     "prompts": ("snake", "bird", "flower"), "roi": (0.00, 0.00, 1.00, 1.00)},
    # --- added after the first pass, to explain three results the tables could not ---
    # `eye` scored 0.42 on a cover that IS an eye, and 0.87 on a 3%-area painted one.
    {"name": "part-noun-eye-macro",
     "image": "0a/ab67616d0000b273000a771967b5f8e7bac0a72b",
     "prompts": ("eye", "hand", "flower"), "roi": (0.10, 0.10, 0.90, 0.70)},
    # `snake` returned NOTHING on a line-drawn snake while `wolf` and `eye` both fired.
    {"name": "lineart-snake-miss",
     "image": "06/ab67616d0000b273000607016a75d355ddcda4d5",
     "prompts": ("snake", "wolf", "eye", "bird"), "roi": (0.35, 0.05, 1.00, 0.75)},
    # `eye` fired 0.87 on a cover with no eye in it that a human can find.
    {"name": "part-noun-eye-on-bottle",
     "image": "04/ab67616d0000b2730004540907fd374c565be4fe",
     "prompts": ("bottle", "eye", "hand"), "roi": (0.25, 0.30, 0.80, 0.80)},
)

MASK_COLOR = np.array([255, 40, 40], dtype=np.float32)
MASK_ALPHA = 0.55
PANEL_PX = 320


def _blend(canvas: np.ndarray, mask: np.ndarray) -> np.ndarray:
    sel = mask.astype(bool)
    canvas[sel] = (canvas[sel] * (1 - MASK_ALPHA) + MASK_COLOR * MASK_ALPHA).astype(np.uint8)
    return canvas


def _render_job(job: dict, image, result, out_dir: Path) -> Path:
    """Two rows: whole image per noun, then the same masks zoomed on the target."""
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


# --------------------------------------------------------------------------- amendments

# [MEASURED] Written AFTER the run, from opening the overlays and the originals again.
# The pre-registered `contains` lists above were built by asking "what is this cover OF".
# Several nouns then fired on things that are genuinely in the picture but are not what the
# cover is of: an ornament in a border, a hand on a handlebar, an eye on a wax seal. Those
# are not model errors, they are errors in the question, and rewriting `contains` in place
# would hide that. So each one is recorded here with the evidence that settles it, and
# `--rescore` reports both scorings side by side.
#
# Disputed cases are deliberately NOT amended and are listed in PROBE5_NOTES.md instead:
# `eye` 0.92 on the Apocalyptica skull (a skull has sockets, not eyes) and `eye` 0.66 on
# the 3D cat (its eyes are behind mirrored sunglasses). Both stay scored as false positives.
AMENDMENTS: tuple[tuple[str, str, str], ...] = (
    ("music-artworks/d/d/9/dd95b18ea17e908b574f979a04f9a57e.jpeg", "flower",
     "engraved rose border down the left edge; seen at full size"),
    ("music-artworks/d/d/9/dd95b18ea17e908b574f979a04f9a57e.jpeg", "eye",
     "the dalmatian's eye"),
    ("0c/ab67616d0000b273000c069d3bcb8bdf56fa13c6", "eye", "the labrador's eyes"),
    ("music-artworks/0/8/7/0877cba57e0ec2d3c070e98f370f0e14.jpg", "eye",
     "the cat's eyes sit inside the two Os of DOOR; seen at full size"),
    ("0a/ab67616d0000b273000a8fbacb36eb7117fc2c9e", "eye", "the drawn heron's eye"),
    ("08/ab67616d00001e020008d893f0bd46d92879ecfe", "eye", "the wolf's eyes"),
    ("10/ab67616d0000b27300103a4dcd62e3dd6f76d123", "eye", "the jackal's eyes"),
    ("06/ab67616d0000b273000607016a75d355ddcda4d5", "eye",
     "the drawn snake's eye; the overlay masks exactly it at area 0.00"),
    ("music-artworks/f/8/b/f8bc8ebeb35be8ba72204d7e8836cd6f.jpg", "eye",
     "the crown logo is drawn as a cat's eye"),
    ("04/ab67616d0000b2730004540907fd374c565be4fe", "eye",
     "two eyes on the face embossed in the red wax seal; seen in the overlay"),
    ("03/ab67616d0000b2730003f2b6590090abe420d104.jpg", "eye", "the woman's visible eye"),
    ("music-artworks/f/6/e/f6e43b68717bfa885e0184726050e236.jpg", "hand",
     "both hands on the guitar; seen at full size"),
    ("0c/ab67616d0000b273000c24210b3f9176ec11476d", "hand",
     "the rider's hands on the handlebars; seen at full size"),
)


def apply_amendments(rows: list[dict]) -> list[dict]:
    """Return a copy of the rows with the amended nouns moved into `image_contains`."""
    by_path: dict[str, list[str]] = {}
    for path, noun, _why in AMENDMENTS:
        by_path.setdefault(path, []).append(noun)
    out = []
    for row in rows:
        amended = dict(row)
        extra = [n for n in by_path.get(row["image_path"], [])
                 if n not in row["image_contains"]]
        amended["image_contains"] = list(row["image_contains"]) + extra
        out.append(amended)
    return out


# --------------------------------------------------------------------------- scoring

def score(rows: list[dict], cut: float) -> dict:
    """Per-noun TP/FP/FN at a score cut, with `marginal` pairs excluded from both."""
    per_noun: dict[str, dict] = {n: {"tp": 0, "fp": 0, "fn": 0, "skip": 0, "fired": 0}
                                 for n in NOUNS}
    for row in rows:
        contains = set(row["image_contains"])
        marginal = set(row["image_marginal"])
        for noun, hits in row["per_prompt"].items():
            fired = any(h["score"] >= cut for h in hits)
            if fired:
                per_noun[noun]["fired"] += 1
            if noun in marginal:
                per_noun[noun]["skip"] += 1
                continue
            if noun in contains:
                per_noun[noun]["tp" if fired else "fn"] += 1
            elif fired:
                per_noun[noun]["fp"] += 1
    return per_noun


def _rate(num: int, den: int) -> str:
    return f"{num / den:.2f}" if den else "  - "


def report(rows: list[dict], cut: float, label: str) -> None:
    per_noun = score(rows, cut)
    print(f"\n=== per noun, cut {cut} ({label}) ===")
    print(f"{'noun':12s} {'class':22s} {'n+':>3s} {'fired':>5s} "
          f"{'TP':>3s} {'FP':>3s} {'FN':>3s} {'prec':>5s} {'rec':>5s}")
    for noun in NOUNS:
        s = per_noun[noun]
        n_pos = s["tp"] + s["fn"]
        print(f"{noun:12s} {NOUN_CLASS[noun]:22s} {n_pos:3d} {s['fired']:5d} "
              f"{s['tp']:3d} {s['fp']:3d} {s['fn']:3d} "
              f"{_rate(s['tp'], s['tp'] + s['fp']):>5s} {_rate(s['tp'], n_pos):>5s}")

    print(f"\n=== per subject_kind class, cut {cut} ({label}) ===")
    print(f"{'class':22s} {'nouns':>5s} {'TP':>3s} {'FP':>3s} {'FN':>3s} "
          f"{'prec':>5s} {'rec':>5s}")
    for cls in ("animal", "vehicle", "object", "building_or_structure"):
        members = [n for n in NOUNS if NOUN_CLASS[n] == cls]
        tp = sum(per_noun[n]["tp"] for n in members)
        fp = sum(per_noun[n]["fp"] for n in members)
        fn = sum(per_noun[n]["fn"] for n in members)
        print(f"{cls:22s} {len(members):5d} {tp:3d} {fp:3d} {fn:3d} "
              f"{_rate(tp, tp + fp):>5s} {_rate(tp, tp + fn):>5s}")


def max_score_table(rows: list[dict]) -> None:
    """Every noun's best score on every cover that contains it, plus the confusions."""
    print("\n=== max score on the covers that contain the noun ===")
    for noun in NOUNS:
        cells = []
        for row in rows:
            if noun not in row["image_contains"]:
                continue
            hits = row["per_prompt"][noun]
            best = max((h["score"] for h in hits), default=None)
            area = sum(h["area_fraction"] for h in hits)
            tag = row["image_note"].split(":")[0][:22]
            cells.append(f"{tag}:{'none' if best is None else f'{best:.2f}/a{area:.2f}'}")
        if cells:
            print(f"  {noun:12s} " + "  ".join(cells))

    print("\n=== every above-cut firing on a cover that does NOT contain the noun ===")
    for row in rows:
        contains = set(row["image_contains"]) | set(row["image_marginal"])
        for noun, hits in row["per_prompt"].items():
            best = max((h["score"] for h in hits), default=0.0)
            if noun not in contains and best >= config.CALIBRATED_SCORE_THRESHOLD:
                print(f"  {noun:12s} {best:.2f}  on  {row['image_note'][:60]}")

    print("\n=== marginal pairs (excluded from scoring), where they fired ===")
    for row in rows:
        for noun in row["image_marginal"]:
            hits = row["per_prompt"][noun]
            best = max((h["score"] for h in hits), default=0.0)
            print(f"  {noun:12s} {best:.2f}  on  {row['image_note'][:60]}")


# --------------------------------------------------------------------------- run

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rescore", help="a probe jsonl: re-run the scoring only, no GPU, "
                                      "under both the pre-registered and the amended "
                                      "ground truth")
    ap.add_argument("--list")
    ap.add_argument("--out")
    ap.add_argument("--prompts", nargs="*", default=NOUNS)
    ap.add_argument("--overlay-dir", default=None)
    args = ap.parse_args()

    if args.rescore:
        rows = common.read_jsonl(Path(args.rescore))
        print(f"### PRE-REGISTERED ground truth ({len(rows)} covers) ###")
        report(rows, config.CALIBRATED_SCORE_THRESHOLD, "calibrated")
        amended = apply_amendments(rows)
        print(f"\n\n### AMENDED ground truth (+{len(AMENDMENTS)} noun-cover pairs "
              "verified by eye after the run) ###")
        for path, noun, why in AMENDMENTS:
            print(f"  + {noun:8s} on {path[-30:]:32s} {why}")
        report(amended, config.CALIBRATED_SCORE_THRESHOLD, "calibrated, amended")
        max_score_table(amended)
        return 0

    if not args.list or not args.out:
        ap.error("--list and --out are required unless --rescore is given")
    refs = common.read_list_file(Path(args.list))
    prompts = tuple((p, p) for p in args.prompts)
    jobs_by_image = {j["image"]: j for j in OVERLAY_JOBS}

    runtime = common.load_sam(verify_weights=False)
    sink = common.JsonlSink(config.DATA_DIR / f"{args.out}.jsonl")
    rows: list[dict] = []
    rendered: list[str] = []
    seconds_total = 0.0
    try:
        for ref in refs:
            meta = IMAGE_KINDS.get(ref.rel_path)
            if meta is None:
                raise KeyError(f"{ref.rel_path} is on the list but has no confirmed-by-eye "
                               "entry in IMAGE_KINDS; the probe refuses to score a cover "
                               "nobody looked at")
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
            row = {
                "probe": args.out,
                "image_path": ref.rel_path,
                "image_kind": meta["kind"],
                "image_contains": meta["contains"],
                "image_marginal": meta["marginal"],
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
                "noun_class": {n: NOUN_CLASS[n] for n in args.prompts if n in NOUN_CLASS},
                "per_prompt": per_prompt,
            }
            sink.write(row)
            rows.append(row)
            if args.overlay_dir and ref.rel_path in jobs_by_image:
                rendered.append(str(_render_job(jobs_by_image[ref.rel_path], image, result,
                                                Path(args.overlay_dir))))
            hit_words = " ".join(f"{p}={len(h)}" for p, h in per_prompt.items() if h)
            print(f"{meta['kind']:22s} {ref.rel_path[-24:]:26} {hit_words}", flush=True)
    finally:
        sink.close()

    report(rows, config.SCORE_THRESHOLD, "stored")
    report(rows, config.CALIBRATED_SCORE_THRESHOLD, "calibrated")
    max_score_table(rows)
    print(f"\ninference seconds over {len(refs)} images x {len(args.prompts)} nouns: "
          f"{seconds_total:.1f}")
    for path in rendered:
        print("overlay:", path)
    print(json.dumps({"noun_class": NOUN_CLASS}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
