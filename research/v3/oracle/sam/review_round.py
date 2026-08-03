"""Build the SAM mask-quality review round: the stratified sample, and one overlay per mask.

    .venv/bin/python review_round.py            # report the composition, write nothing
    .venv/bin/python review_round.py --write    # write the manifest and the overlays

This script never loads a model and never touches the GPU. It reads the finished eval-142 run
(`research/v3/data/sam/sam-eval-142.jsonl`, schema `sam-regions.v1`) and produces two things:

  * `research/v3/data/sam/mask-quality-sample.json` — the sample manifest. Holds the score, the
    area fraction, the band and the mask row reference for every sampled mask. **Server-side and
    analysis-side only**: it is the answer key this round exists to test, so nothing that reaches
    the browser may be derived from it.
  * `research/v3/data/sam/review-overlays/<itemId>.png` — one panel per sampled mask: the untouched
    artwork on the left, the same artwork with THAT ONE mask blended on the right. No score, no
    area fraction and no band is ever drawn on the panel.

The question the round asks is "is this mask actually the thing it claims to be?", so the panel
names the concept and nothing else. What calibrates `config.SCORE_THRESHOLD` is the join between
the reviewer's answers and the scores this file kept back — see `analyze-mask-quality.ts`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from collections import defaultdict
from pathlib import Path

import numpy as np
import PIL
from PIL import Image, ImageDraw, ImageFont

import common
import config
from overlay import CONCEPT_COLORS, blend

PIL_VERSION = PIL.__version__

# --------------------------------------------------------------------------------- what we read

# [MEASURED] The finished eval run: 142 image rows (all `ok`), 4,853 region rows, 140 images with
# at least one region. This is the only run a reviewer round can be drawn from — the smoke runs
# predate the current concept set.
SOURCE_RUN = "sam-eval-142"

DATA_DIR = config.DATA_DIR
OVERLAY_DIR = DATA_DIR / "review-overlays"
MANIFEST_PATH = DATA_DIR / "mask-quality-sample.json"

# --------------------------------------------------------------------------------- the sample

# [UNCALIBRATED] The round's size. Chosen as the largest number of "look at one mask and answer
# one question" items that fits the reviewer round budget the campaign has been using (the probe
# round was 180 items over six passes; this one is one question per item and much slower per item,
# because it is a looking task rather than a recall task). Nothing downstream depends on the exact
# value: the analysis reports its own confidence from the counts it actually gets.
TARGET_SAMPLE_SIZE = 60

# [REVIEWED] The score bands the round stratifies over, as half-open [lo, hi) intervals. The lower
# edge is `config.SCORE_THRESHOLD` because no row below it exists in the run — the run applied it.
# The band boundaries are where a calibrated threshold could plausibly land: 0.45 and 0.60 bracket
# the reported hallucination range (0.30-0.43), 0.80 separates the scores SAM is confident about.
SCORE_BANDS: tuple[tuple[str, float, float], ...] = (
    ("0.30-0.45", 0.30, 0.45),
    ("0.45-0.60", 0.45, 0.60),
    ("0.60-0.80", 0.60, 0.80),
    ("0.80+", 0.80, 1.01),
)

# [REVIEWED] The hallucination signature named in the round's brief: a mask that covers most of the
# image while the model is not confident about it. On eval-142 this cell holds exactly 3 rows, and
# every one of them is force-included — a class this small cannot survive proportional sampling,
# and it is the class whose fate the calibrated threshold has to decide.
SUSPICIOUS_AREA_FRACTION = 0.5
SUSPICIOUS_SCORE = 0.5

# [REVIEWED] At most this many masks from any one artwork. 60 masks drawn from 140 images with no
# cap would let a few busy covers (one has 100+ `letter` instances) supply most of the round, and
# an answer about one artwork is not an independent answer about the model.
MAX_MASKS_PER_ARTWORK = 2

# [UNCALIBRATED] Seed for every random choice in this file. Fixed so the sample is reproducible;
# any fixed value works. The build date, matching the other v3 fixtures.
SEED = 20260803

# --------------------------------------------------------------------------------- the overlays

# [REVIEWED] Minimum on-screen size of one panel. The review page never upscales past the file
# (`styles.css` .oracle-art), so a 300x300 cover served at native size is judged at 300px — too
# small to tell a mask that follows the glyphs from one that boxes them. Integer upscaling fixes
# that without moving a single mask edge: the artwork is resampled with LANCZOS (it only has to
# look like itself) and the mask with NEAREST (an integer nearest upscale of a binary mask is the
# same region, exactly).
MIN_PANEL_PX = 640
MAX_PANEL_SCALE = 2

# [REVIEWED] The mask is drawn as a translucent fill plus an opaque boundary. Fill alone hides
# where the mask stops on a busy cover; boundary alone hides holes. Colour per concept, from
# overlay.CONCEPT_COLORS, human-facing only.
MASK_ALPHA = 0.5

# [REVIEWED] The locator. A plain 2px box in the concept colour was measured against the round's own
# panels and failed: an orange box round a 20x10px glyph on a warm cover is invisible at a glance,
# and a mask the reviewer has to hunt for is judged differently from one they were handed. Three
# fixes, all of them functions of the mask and therefore carrying no information about its
# correctness: the box is thick, it is haloed in black so it reads on any background, and a mask
# smaller than LOCATOR_RING_MAX_EXTENT of the panel also gets a ring around it.
BBOX_WIDTH_PX = 4
HALO_WIDTH_PX = 3
HALO_COLOUR = (0, 0, 0)
LOCATOR_RING_MAX_EXTENT = 0.25
LOCATOR_RING_MIN_RADIUS_PX = 22
LOCATOR_RING_SCALE = 1.8

# [REVIEWED] Review chrome is black and white (REVIEW_UI.md §3). The panel's surround matches the
# page so the artwork is the only colour on screen besides the mask.
SHEET_BG = (0, 0, 0)
SHEET_FG = (255, 255, 255)
PANEL_GAP_PX = 14
LABEL_STRIP_PX = 34
LABEL_FONT_PX = 20

CONCEPT_PHRASE = dict(config.CONCEPT_PROMPTS)
CONCEPT_GROUP = {concept: group for group, concepts in config.CONCEPT_GROUPS.items() for concept in concepts}


def band_of(score: float) -> str:
    for name, low, high in SCORE_BANDS:
        if low <= score < high:
            return name
    raise ValueError(f"score {score} falls outside the declared bands")


def mask_row_id(row: dict) -> str:
    """The row key of one (image, concept, instance) triple — the join key back into the run."""
    return f"{row['image_sha256'][:12]}:{row['concept']}:{row['instance_idx']}"


def item_id(row: dict) -> str:
    """Opaque, content-derived item id. Says which mask; says nothing about score, band or cell."""
    digest = hashlib.sha256(mask_row_id(row).encode("utf-8")).hexdigest()
    return f"smq-{digest[:12]}"


def check_run_concept_set(run: str, rows: list[dict], strict: bool = True) -> dict:
    """The OTHER direction of the stale-run check, and the one that used to be missing.

    The guard in `read_run` computes `{run concepts} - {config concepts}` — it catches a run with
    EXTRA concepts (a v1 run under a v2 config) and never a config with extra concepts. A v2 run
    (9 concepts) therefore passed cleanly under a v2.1 config (10): a rebuild would quietly produce
    3 groups x 4 bands = 12 strata where the round was built on 8, and zero `barcode` masks, with
    no word said (phase-0 adversarial review, finding 6).

    Every summary row carries the run's own `concept_set_hash` and `concepts`, so the check does
    not have to be inferred from which tags happened to fire — a run where a concept simply found
    nothing is indistinguishable from a run that never asked. Compare the recorded identity.

    `strict=True` (building a human round) refuses. `strict=False` (a derived analysis over stored
    scores) returns the mismatch so the caller can print it and write it into its own output: an
    analysis is reproducible and its denominator can be disclosed, a human round cannot be re-asked.
    Returns the run's recorded identity either way.
    """
    hashes = {r["concept_set_hash"] for r in rows
              if r.get("record_type") == config.RECORD_TYPE_IMAGE and r.get("concept_set_hash")}
    if len(hashes) > 1:
        raise SystemExit(f"{run}.jsonl mixes concept sets: {sorted(hashes)}. Refusing to build a round on it.")
    if not hashes:
        raise SystemExit(
            f"{run}.jsonl records no concept_set_hash, so there is no way to tell which question "
            "set it was run under. Refusing to build a round on it."
        )
    run_hash = next(iter(hashes))
    run_concepts = next(
        (r.get("concepts", []) for r in rows
         if r.get("record_type") == config.RECORD_TYPE_IMAGE and r.get("concepts")), [])
    current = [c for c, _ in config.CONCEPT_PROMPTS]
    identity = {
        "run": run,
        "runConceptSetHash": run_hash,
        "configConceptSetHash": common.concept_set_hash(),
        "inStep": run_hash == common.concept_set_hash(),
        "runConcepts": sorted(run_concepts),
        "configConcepts": sorted(current),
        "askedByConfigButNotByTheRun": sorted(set(current) - set(run_concepts)),
        "askedByTheRunButNotByConfig": sorted(set(run_concepts) - set(current)),
    }
    if identity["inStep"]:
        return identity
    message = (
        f"{run}.jsonl was run under concept set {run_hash[:12]}, the current config is "
        f"{common.concept_set_hash()[:12]}.\n"
        f"  run asked for  : {sorted(run_concepts)}\n"
        f"  config asks for: {sorted(current)}\n"
        f"  missing from the run: {identity['askedByConfigButNotByTheRun']}\n"
    )
    if strict:
        raise SystemExit(
            message
            + "A round built on this would be stratified by the CURRENT groups over rows that were "
            "never asked the current questions. Re-run the eval set under this config first "
            "(a GPU job, the orchestrator's to schedule), or check out the config the run was made "
            "under. Frozen rounds are in data/sam/mask-quality-sample.json and "
            "data/sam/mask-quality-2-sample.json and must not be regenerated."
        )
    print("[stale-run] " + message.replace("\n", "\n[stale-run] ")
          + "Every group membership below is the CURRENT one; concepts the run never asked "
            "contribute nothing and are not a measured zero.", flush=True)
    return identity


def read_run(run: str = SOURCE_RUN) -> tuple[list[dict], dict[str, dict]]:
    rows = common.read_jsonl(DATA_DIR / f"{run}.jsonl")
    regions = [r for r in rows if r.get("record_type") == config.RECORD_TYPE_REGION]
    # This file was built for concept set v1 and `sam-eval-142` holds v1 rows: `album-title`,
    # `logo`, and no `parental-advisory`. Under concept set v2 (config.py, 2026-08-03) those
    # tags are not in CONCEPT_GROUP or CONCEPT_COLORS and every lookup below would KeyError
    # somewhere unhelpful. Round 1's manifest and fixture are committed and pinned by
    # tests/sam-mask-quality.test.ts — they are the record of that round and must not be
    # regenerated. Say so here rather than crash.
    stale = sorted({r["concept"] for r in regions} - {c for c, _ in config.CONCEPT_PROMPTS})
    if stale:
        raise SystemExit(
            f"{run}.jsonl carries concepts that are not in the current set: {stale}. "
            "That run predates concept set v2. Round 1 is frozen in "
            "data/sam/mask-quality-sample.json; for a v2 round use review_round_2.py "
            "against a run made under the current config."
        )
    check_run_concept_set(run, rows)
    images = {
        r["image_sha256"]: r
        for r in rows
        if r.get("record_type") == config.RECORD_TYPE_IMAGE and r.get("status") == "ok"
    }
    return regions, images


def allocate(budget: int, cells: list[str], populations: dict[str, int]) -> dict[str, int]:
    """Split `budget` as evenly as possible over `cells`; the remainder goes to the biggest cells.

    Even allocation, not proportional: the population is wildly skewed (4,323 text_like rows against
    530 person_like, and 3,147 of the text_like rows are the single concept `letter`), and a
    proportional sample would spend the whole round on one concept in one band and answer nothing
    about the cells where the threshold actually has to be drawn.
    """
    base, remainder = divmod(budget, len(cells))
    quota = {cell: base for cell in cells}
    for cell in sorted(cells, key=lambda cell: (-populations.get(cell, 0), cell))[:remainder]:
        quota[cell] += 1
    return quota


def draw_cell(
    candidates: list[dict],
    quota: int,
    taken_per_artwork: dict[str, int],
    rng: random.Random,
) -> list[dict]:
    """Draw `quota` rows from one cell, round-robin over the concepts present in it.

    Round-robin rather than a flat shuffle for the same reason the allocation is even: inside the
    text_like bands `letter` outnumbers everything else six to one, and a flat shuffle would return
    a cell made almost entirely of single glyphs.
    """
    by_concept: dict[str, list[dict]] = defaultdict(list)
    for row in candidates:
        by_concept[row["concept"]].append(row)
    for concept in by_concept:
        by_concept[concept].sort(key=mask_row_id)
        rng.shuffle(by_concept[concept])

    taken_in_cell: dict[str, int] = {concept: 0 for concept in by_concept}
    drawn: list[dict] = []
    while len(drawn) < quota:
        live = [concept for concept in by_concept if by_concept[concept]]
        if not live:
            break
        # Fewest taken in this cell first; ties broken by the smaller concept, then by name, so the
        # order is a function of the data and the seed and nothing else.
        concept = min(live, key=lambda c: (taken_in_cell[c], len(by_concept[c]), c))
        queue = by_concept[concept]
        picked = None
        while queue:
            row = queue.pop(0)
            if taken_per_artwork[row["image_sha256"]] < MAX_MASKS_PER_ARTWORK:
                picked = row
                break
        if picked is None:
            by_concept.pop(concept)
            continue
        drawn.append(picked)
        taken_in_cell[concept] += 1
        taken_per_artwork[picked["image_sha256"]] += 1
    return drawn


def build_sample(regions: list[dict]) -> tuple[list[dict], dict]:
    """The stratified sample: forced suspicious rows first, then even quotas over band x group."""
    rng = random.Random(SEED)
    taken_per_artwork: dict[str, int] = defaultdict(int)

    # 1. The hallucination signature, force-included whole. Sorted by row key so the set is
    #    order-independent; the serve order is shuffled later and elsewhere.
    forced = sorted(
        (r for r in regions if r["area_fraction"] > SUSPICIOUS_AREA_FRACTION and r["score"] < SUSPICIOUS_SCORE),
        key=mask_row_id,
    )
    selected: list[dict] = []
    forced_ids: set[str] = set()
    for row in forced:
        taken_per_artwork[row["image_sha256"]] += 1
        forced_ids.add(mask_row_id(row))
        selected.append(row)

    # 2. Even quotas over the eight band x group cells, drawn from what is left.
    remaining = [r for r in regions if mask_row_id(r) not in forced_ids]
    cells: dict[str, list[dict]] = defaultdict(list)
    for row in remaining:
        cells[f"{CONCEPT_GROUP[row['concept']]}|{band_of(row['score'])}"].append(row)
    cell_names = [f"{group}|{band}" for group in sorted(config.CONCEPT_GROUPS) for band, _, _ in SCORE_BANDS]
    populations = {name: len(cells.get(name, [])) for name in cell_names}
    quota = allocate(TARGET_SAMPLE_SIZE - len(selected), cell_names, populations)

    shortfall = 0
    for name in cell_names:
        drawn = draw_cell(sorted(cells.get(name, []), key=mask_row_id), quota[name], taken_per_artwork, rng)
        shortfall += quota[name] - len(drawn)
        selected.extend(drawn)

    composition = {
        "targetSampleSize": TARGET_SAMPLE_SIZE,
        "forcedSuspicious": len(forced),
        "cellPopulations": populations,
        "cellQuotas": quota,
        "cellShortfall": shortfall,
    }
    return selected, composition


# --------------------------------------------------------------------------------- rendering


def panel_scale(width: int, height: int) -> int:
    longest = max(width, height)
    return max(1, min(MAX_PANEL_SCALE, -(-MIN_PANEL_PX // longest)))


def boundary(mask: np.ndarray, thickness: int) -> np.ndarray:
    """The mask's inner edge, `thickness` pixels wide. Pure numpy — no scipy in this venv."""
    m = mask.astype(bool)
    eroded = m.copy()
    for _ in range(max(1, thickness)):
        shrunk = eroded.copy()
        shrunk[1:, :] &= eroded[:-1, :]
        shrunk[:-1, :] &= eroded[1:, :]
        shrunk[:, 1:] &= eroded[:, :-1]
        shrunk[:, :-1] &= eroded[:, 1:]
        eroded = shrunk
    return m & ~eroded


def draw_locator(panel: Image.Image, row: dict, colour: tuple[int, int, int]) -> None:
    """Mark where the mask is: a haloed box, plus a ring when the mask is small.

    A locator, not a cue. Both shapes are derived from the mask's own bounding box, so they tell the
    reviewer nothing the highlight does not already say — they only make it findable.
    """
    width, height = panel.size
    draw = ImageDraw.Draw(panel)
    # The outline is drawn *outside* the bounding box. PIL strokes inward, and many of these masks
    # are 10px across — an inward 7px stroke would paint over the very mask being judged.
    pad = BBOX_WIDTH_PX + HALO_WIDTH_PX + 2
    left = max(0, row["bbox_x"] * width - pad)
    top = max(0, row["bbox_y"] * height - pad)
    right = min(width - 1, row["bbox_x"] * width + row["bbox_w"] * width - 1 + pad)
    bottom = min(height - 1, row["bbox_y"] * height + row["bbox_h"] * height - 1 + pad)
    # Halo first, colour on top: the box has to read on a black cover and on a white one.
    draw.rectangle([left, top, right, bottom], outline=HALO_COLOUR, width=BBOX_WIDTH_PX + HALO_WIDTH_PX)
    draw.rectangle([left, top, right, bottom], outline=colour, width=BBOX_WIDTH_PX)

    if max(row["bbox_w"], row["bbox_h"]) >= LOCATOR_RING_MAX_EXTENT:
        return
    centre_x = (left + right) / 2
    centre_y = (top + bottom) / 2
    radius = max(LOCATOR_RING_MIN_RADIUS_PX, LOCATOR_RING_SCALE * max(right - left, bottom - top))
    box = [centre_x - radius, centre_y - radius, centre_x + radius, centre_y + radius]
    draw.ellipse(box, outline=HALO_COLOUR, width=BBOX_WIDTH_PX + HALO_WIDTH_PX)
    draw.ellipse(box, outline=colour, width=BBOX_WIDTH_PX)


def render_overlay(row: dict, image_row: dict, phrases: dict[str, str] | None = None) -> Image.Image:
    """One panel: the untouched artwork, then the same artwork with this one mask on it.

    `phrases` overrides what the panel says the mask claims to be. It defaults to the prompt
    string, which is right whenever the stored tag and the prompt are the same word. Concept
    set v2 broke that tie on purpose — `display-text` is asked for with the prompt "album
    title" and `emblem` with "logo" — so a round that means to test the stored name has to be
    able to print the stored name. review_round_2.py passes its own labels; round 1 does not,
    and its overlays render byte-identically to before this parameter existed.
    """
    common.register_image_plugins()
    # decode_image, so the base is EXIF-transposed exactly as the run's masks are. The size check
    # below catches 90°/270° but never 180° or a mirror. See overlay.py's note (finding 14).
    original, _, _ = common.decode_image(config.REPO_ROOT / row["image_path"])
    height, width = row["mask_height"], row["mask_width"]
    if original.size != (width, height):
        # The mask is stored at the decoded native size; a mismatch means the file on disk is not
        # the file the run saw, and every judgement about the mask would be about the wrong pixels.
        raise ValueError(f"{row['image_path']}: file is {original.size}, the run's mask is {(width, height)}")

    scale = panel_scale(width, height)
    big = original.resize((width * scale, height * scale), Image.Resampling.LANCZOS)
    base = np.array(big)

    mask = common.rle_decode(row["mask_rle"], height, width)
    mask_big = np.array(
        Image.fromarray((mask.astype(np.uint8) * 255)).resize(
            (width * scale, height * scale), Image.Resampling.NEAREST
        )
    ) > 127

    colour = CONCEPT_COLORS[row["concept"]]
    painted = blend(base, mask_big, colour, alpha=MASK_ALPHA)
    painted[boundary(mask_big, scale)] = colour
    masked = Image.fromarray(painted)

    panel_w, panel_h = big.size
    draw_locator(masked, row, colour)
    sheet = Image.new("RGB", (panel_w * 2 + PANEL_GAP_PX, panel_h + LABEL_STRIP_PX), SHEET_BG)
    sheet.paste(big, (0, 0))
    sheet.paste(masked, (panel_w + PANEL_GAP_PX, 0))

    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=LABEL_FONT_PX)
    # The panel says what the mask claims to be and nothing else. Its score, its area fraction and
    # its band are what the round is testing; a reviewer who can read them is not a second opinion.
    draw.text((2, panel_h + 6), "artwork", fill=SHEET_FG, font=font)
    draw.text(
        (panel_w + PANEL_GAP_PX + 2, panel_h + 6),
        f'highlighted: "{(phrases or CONCEPT_PHRASE)[row["concept"]]}"',
        fill=colour,
        font=font,
    )
    return sheet


# --------------------------------------------------------------------------------- manifest


def manifest_entry(row: dict, image_row: dict, overlay_path: Path, forced: bool) -> dict:
    overlay: dict | None = None
    if overlay_path.exists():
        overlay_bytes = overlay_path.read_bytes()
        with Image.open(overlay_path) as opened:
            overlay_w, overlay_h = opened.size
        overlay = {
            "path": str(overlay_path.relative_to(config.REPO_ROOT)),
            "sha256": hashlib.sha256(overlay_bytes).hexdigest(),
            "bytes": len(overlay_bytes),
            "width": overlay_w,
            "height": overlay_h,
            "scale": panel_scale(row["mask_width"], row["mask_height"]),
        }
    return {
        "itemId": item_id(row),
        "maskRowId": mask_row_id(row),
        "concept": row["concept"],
        "conceptPhrase": CONCEPT_PHRASE[row["concept"]],
        "conceptGroup": CONCEPT_GROUP[row["concept"]],
        "score": row["score"],
        "areaFraction": row["area_fraction"],
        "band": band_of(row["score"]),
        "stratum": f"{CONCEPT_GROUP[row['concept']]}|{band_of(row['score'])}",
        "forcedSuspicious": forced,
        "maskRef": {
            "run": SOURCE_RUN,
            "runId": row["run_id"],
            "schemaVersion": row["schema_version"],
            "imageSha256": row["image_sha256"],
            "instanceIdx": row["instance_idx"],
            "bbox": {"x": row["bbox_x"], "y": row["bbox_y"], "w": row["bbox_w"], "h": row["bbox_h"]},
        },
        "artwork": {
            "imagePath": row["image_path"],
            "imageId": row["image_id"],
            "artworkId": row["artwork_id"],
            "collection": row["collection"],
            "sha256": row["image_sha256"],
            "width": image_row["width"],
            "height": image_row["height"],
        },
        "overlay": overlay,
    }


SELECTION_RULE = (
    "A stratified sample of the eval-142 region rows. Every row whose mask covers more than "
    f"{SUSPICIOUS_AREA_FRACTION:g} of the image while scoring below {SUSPICIOUS_SCORE:g} is force-included "
    "(the hallucination signature); the rest of the budget is split evenly over the eight "
    "score-band x concept-group cells, and inside each cell round-robin over the concepts present, "
    f"with at most {MAX_MASKS_PER_ARTWORK} masks from any one artwork. Even rather than proportional, "
    "because the population is dominated by one concept in one band and the threshold has to be drawn "
    "in the cells the population is thinnest in."
)


def build(write: bool) -> dict:
    regions, images = read_run()
    selected, composition = build_sample(regions)
    forced_ids = {
        mask_row_id(r)
        for r in regions
        if r["area_fraction"] > SUSPICIOUS_AREA_FRACTION and r["score"] < SUSPICIOUS_SCORE
    }

    if write:
        OVERLAY_DIR.mkdir(parents=True, exist_ok=True)
    entries: list[dict] = []
    for row in selected:
        overlay_path = OVERLAY_DIR / f"{item_id(row)}.png"
        if write:
            render_overlay(row, images[row["image_sha256"]]).save(overlay_path, optimize=True)
        entries.append(manifest_entry(row, images[row["image_sha256"]], overlay_path, mask_row_id(row) in forced_ids))
    entries.sort(key=lambda entry: entry["itemId"])
    missing = [entry["itemId"] for entry in entries if entry["overlay"] is None]
    if write and missing:
        raise RuntimeError(f"{len(missing)} overlays did not render: {missing[:3]}")

    return {
        "manifestVersion": "sam-mask-quality-sample.v1",
        "batchId": "sam-mask-quality-1",
        "seed": SEED,
        "generatedBy": "research/v3/oracle/sam/review_round.py",
        "builtFrom": [
            f"research/v3/data/sam/{SOURCE_RUN}.jsonl",
            "research/v3/oracle/sam/config.py",
            "research/v3/oracle/sam/overlay.py",
        ],
        "sourceRun": SOURCE_RUN,
        # The overlays are PNGs, and the repository ignores `*.png` — they are build products, not
        # commits. The fixture pins their hashes, so a re-render that produces different bytes fails
        # the push loudly rather than silently serving a different stimulus. These are the knobs and
        # the renderer version that determine those bytes.
        "renderer": {
            "pillow": PIL_VERSION,
            "minPanelPx": MIN_PANEL_PX,
            "maxPanelScale": MAX_PANEL_SCALE,
            "maskAlpha": MASK_ALPHA,
            "bboxWidthPx": BBOX_WIDTH_PX,
            "haloWidthPx": HALO_WIDTH_PX,
            "locatorRingMaxExtent": LOCATOR_RING_MAX_EXTENT,
            "conceptColors": {concept: list(colour) for concept, colour in CONCEPT_COLORS.items()},
        },
        "scoreThresholdAtRun": config.SCORE_THRESHOLD,
        "scoreBands": [{"band": name, "low": low, "high": high} for name, low, high in SCORE_BANDS],
        "conceptGroups": {group: list(concepts) for group, concepts in config.CONCEPT_GROUPS.items()},
        "selection": {"rule": SELECTION_RULE, "composition": composition},
        "items": entries,
    }


def report(manifest: dict) -> None:
    items = manifest["items"]
    print(f"{manifest['batchId']}: {len(items)} masks from {len({i['artwork']['sha256'] for i in items})} artworks")
    print(f"  forced suspicious: {sum(1 for i in items if i['forcedSuspicious'])}")
    print("  band x group:")
    counts: dict[str, int] = defaultdict(int)
    for item in items:
        counts[item["stratum"]] += 1
    for group in sorted(manifest["conceptGroups"]):
        for band in [b["band"] for b in manifest["scoreBands"]]:
            print(f"    {group:12s} {band:10s} {counts[f'{group}|{band}']:3d}")
    print("  concept:")
    by_concept: dict[str, int] = defaultdict(int)
    for item in items:
        by_concept[item["concept"]] += 1
    for concept, _ in config.CONCEPT_PROMPTS:
        print(f"    {concept:14s} {by_concept[concept]:3d}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="write the manifest and the overlays")
    args = parser.parse_args()
    manifest = build(args.write)
    report(manifest)
    if args.write:
        MANIFEST_PATH.write_text(json.dumps(manifest, indent="\t", sort_keys=False) + "\n")
        print(f"wrote {MANIFEST_PATH}")
        print(f"wrote {len(manifest['items'])} overlays to {OVERLAY_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
