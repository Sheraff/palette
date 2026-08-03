"""Build the concept-set-v2 ratification round: `sam-mask-quality-2-v2-ratification`.

    .venv/bin/python review_round_2.py                    # report the composition, write nothing
    .venv/bin/python review_round_2.py --write            # write the manifest and the overlays
    .venv/bin/python review_round_2.py --run other-stem   # read a differently-named re-run

This script never loads a model and never touches the GPU. It reads a finished run made under
**concept set v2** — by default `research/v3/data/sam/sam-eval-142-v2.jsonl`, which does not exist
yet: the re-run that produces it is the orchestrator's GPU job, and this file is written to be run
after it. Nothing here is a re-run trigger; if the file is missing it says so and stops.

What the round asks, and why it is not another stratified sample
---------------------------------------------------------------
Round 1 (`review_round.py`) had a calibration question — where does the score threshold go — so it
sampled evenly over score bands and concept groups. This round has a **named claim to ratify**. The
reviewer ratified concept set v2 on 2026-08-03 ("new SAM wording sounds good"); the claims that
wording makes are:

  1. `parental-advisory` is a real category this model finds — and finds *only* on covers that
     carry the mark. Reviewer note 2 said the PA marks were arriving as "sticker".
  2. `display-text` is the honest name for what the prompt "album title" returns, because it masks
     the artist name as readily as the title. Reviewer note 5.
  3. `emblem` is the honest name for what the prompt "logo" returns, because the mask cannot know
     whether the mark is part of the artwork or applied to it. Reviewer note 1.

Each claim is checkable by eye on a specific kind of cover, so the sample is **purposive**: the PA
masks (both on the five covers confirmed to carry a mark and on any cover that is not — those are
the false positives the claim would be sunk by), the `display-text` masks on covers where artist and
title compete, and a few `emblem` masks including the two the probe opened by eye (an applied
record-label logo, and a band emblem drawn into the artwork).

Outputs
-------
  * `research/v3/data/sam/mask-quality-2-sample.json` — the manifest, same shape round 1 wrote, so
    the review-server's `buildSamMaskQualityFixture({ samplePath })` reads it unchanged.
    **Server-side and analysis-side only.** It holds the scores, the bands and — new in this round —
    `selectionRole`, which says whether a mask came from a cover confirmed by eye to carry the thing.
    That is an answer key twice over; nothing derived from this file may reach the browser. The
    fixture builder copies a fixed field list and asserts the fixture leaks none of it.
  * `research/v3/data/sam/review-overlays-2/<itemId>.png` — one panel per mask, rendered by
    `review_round.render_overlay`, in a directory of its own so round 1's overlays (whose hashes are
    pinned by `tests/sam-mask-quality.test.ts`) cannot be overwritten.

The panel and the question name the **stored tag**, not the prompt string — see CONCEPT_LABELS.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from collections import defaultdict
from pathlib import Path

from PIL import Image

import common
import config
import review_round as rr

# --------------------------------------------------------------------------------- identity

# [REVIEWED] The batch id the orchestrator's queue and the review server address this round by.
# Named for what it decides, not for its position, because a third round would otherwise be
# ambiguous with it.
BATCH_ID = "sam-mask-quality-2-v2-ratification"

# [REVIEWED] The re-run this round reads. A separate stem from `sam-eval-142` on purpose: the row
# key contains concept_set_hash(), so a v2 run appended to the v1 file would redo every image and
# leave one file holding two incompatible concept sets, with no field distinguishing them at the
# region level. A new stem keeps v1 intact as the evidence behind round 1's calibration.
SOURCE_RUN = "sam-eval-142-v2"

MANIFEST_PATH = config.DATA_DIR / "mask-quality-2-sample.json"
OVERLAY_DIR = config.DATA_DIR / "review-overlays-2"

# [UNCALIBRATED] Seed for every random choice here. Fixed so the sample is reproducible; any fixed
# value works. Distinct from round 1's seed so the two rounds' tie-breaks are not correlated.
SEED = 20260804

# --------------------------------------------------------------------------------- what to ask

# [REVIEWED] What the panel and the question call each concept. NOT the prompt string.
# Concept set v2 deliberately renamed two tags without touching their prompts: `display-text` is
# fetched with "album title" and `emblem` with "logo". This round exists to ratify those names, so
# it has to print them — asking 'is this a correct "album title" mask?' would re-ask round 1's
# question and could not ratify anything. The prompt string still reaches the reviewer indirectly,
# in the sense that it decided which pixels are on screen; what is being judged is the name.
CONCEPT_LABELS: dict[str, str] = {
    "words": "words",
    "letter": "letter",
    "lettering": "lettering",
    "display-text": "main display text",
    "emblem": "emblem",
    "sticker": "sticker",
    "parental-advisory": "parental advisory mark",
    "person": "person",
    "face": "face",
}
assert set(CONCEPT_LABELS) == {tag for tag, _ in config.CONCEPT_PROMPTS}, (
    "CONCEPT_LABELS out of step with config.CONCEPT_PROMPTS"
)

# --------------------------------------------------------------------------------- the sample

# [UNCALIBRATED] Round size, and how it splits. ~25 items is the reviewer's stated appetite for one
# sitting of a looking task (round 1 was 60 and was described as long). The split follows how much
# each claim rests on the round: `parental-advisory` is a brand-new concept and gets the most, and
# it is the only one where a *false positive* would be decisive, so its quota leaves room for masks
# on covers nobody confirmed carry a mark. `display-text` needs pairs, so its quota is even.
PA_QUOTA = 10
DISPLAY_TEXT_QUOTA = 9
EMBLEM_QUOTA = 6
TARGET_SAMPLE_SIZE = PA_QUOTA + DISPLAY_TEXT_QUOTA + EMBLEM_QUOTA

# [REVIEWED] At most this many masks from one artwork, over the whole round. Two rather than round
# 1's two-per-artwork-for-a-different-reason: a `display-text` competition item IS a pair from one
# cover — the artist mask and the title mask, both claimed to be "main display text" — and splitting
# the pair across artworks would not test the claim. Single-mask concepts take one per artwork.
MAX_MASKS_PER_ARTWORK = 2

# [MEASURED, n=15] The covers opened and confirmed by eye during probe 2 (VOCAB_PROBE_NOTES.md,
# "Selection"; the list itself is oracle/sam/vocab-probe-15.txt). These are the only images in the
# eval set whose contents are established independently of the model, which is what makes a mask on
# them checkable as a claim rather than as a picture. Force-included when the run has a mask for
# them; their absence from the run is itself a finding and is reported, never silently skipped.
CONFIRMED_PA_IMAGES: tuple[str, ...] = (
    "images/greenday.jpg",                                      # PA bottom-right, flat black field
    "images/slim.jpg",                                          # PA top-right, over a photo
    "03/ab67616d0000b27300034b60105d8937440211da.jpg",          # PA bottom-right, warm faded photo
    "0d/ab67616d0000b273000d8049603d6ab7f5d759bb",              # PA bottom-right, dark photo
    "0f/ab67616d00001e02000f723f36271de0ed3aa893",              # PA bottom-LEFT, 300px rendition
)
CONFIRMED_COMPETING_TEXT_IMAGES: tuple[str, ...] = (
    "images/toxicity.jpg",                                      # artist huge, title small
    "images/vvbrown.jpg",                                       # artist and title, same banner
)
CONFIRMED_EMBLEM_IMAGES: tuple[str, ...] = (
    "images/franz.jpg",                                         # applied Domino record-label logo
    "images/elephunk.jpg",                                      # band emblem drawn INTO the artwork
)
# [MEASURED, n=15] The two probe negatives: opened by eye, no PA mark, no logo, no sticker, no
# display text. Any mask of any of this round's three concepts on one of these is a false positive
# by construction — so if the run produces one, it is force-included ahead of everything else. This
# costs nothing when the run is clean (probe 2 measured zero instances on both, under all 16
# phrasings, at both thresholds) and is the cheapest possible guard against a flattering sample.
CONFIRMED_NEGATIVE_IMAGES: tuple[str, ...] = (
    "images/orelsan.jpg",                                       # photo only
    "03/ab67616d00001e02000300752f338b6aedff856c.jpg",          # interior photo only
)

# [REVIEWED] A cover shows "competing" display text when at least two `display-text` instances
# survive the calibrated cut. Two strong masks on one cover is the situation reviewer note 5
# describes — one of them is the artist and one is the title, and the tag has to be true of both.
# The cut is config.CALIBRATED_SCORE_THRESHOLD rather than the run threshold because a 0.31 second
# mask is not competition, it is noise.
COMPETITION_MIN_INSTANCES = 2

# [REVIEWED] Roles, recorded per item so the analysis can split "did the reviewer accept masks on
# covers we know carry the thing" from "did the reviewer reject masks on covers we do not". Both
# questions matter and they have opposite failure modes. Answer-key material: server-side only.
ROLE_CONFIRMED = "confirmed-by-eye"
ROLE_UNCONFIRMED = "not-confirmed"
ROLE_NEGATIVE = "confirmed-negative"


def item_id(row: dict) -> str:
    """Opaque, content-derived item id, distinct from round 1's for the same mask.

    Round 1's ids are `smq-<12 hex of sha256(maskRowId)>`. The salt below keeps a mask that appears
    in both rounds from getting one id in two batches — the review server keys answers by item, and
    two rounds asking different questions about the same pixels must never collide.
    """
    digest = hashlib.sha256(f"{BATCH_ID}|{rr.mask_row_id(row)}".encode("utf-8")).hexdigest()
    return f"smq2-{digest[:12]}"


def role_of(image_path: str, confirmed: tuple[str, ...]) -> str:
    if image_path in CONFIRMED_NEGATIVE_IMAGES:
        return ROLE_NEGATIVE
    return ROLE_CONFIRMED if image_path in confirmed else ROLE_UNCONFIRMED


def best_on_image(rows: list[dict], image_path: str, concept: str) -> dict | None:
    """The highest-scoring mask of one concept on one image; ties broken by row key."""
    candidates = [r for r in rows if r["image_path"] == image_path and r["concept"] == concept]
    if not candidates:
        return None
    return sorted(candidates, key=lambda r: (-r["score"], rr.mask_row_id(r)))[0]


def spread_over_bands(
    candidates: list[dict],
    quota: int,
    taken_per_artwork: dict[str, int],
    rng: random.Random,
    per_artwork_cap: int = 1,
) -> list[dict]:
    """Draw `quota` masks spread over the score bands, at most `per_artwork_cap` per artwork.

    Round-robin over bands rather than top-by-score: a ratification round that only showed the
    model's most confident masks would ratify the easy half of the claim. Within a band the order is
    a seeded shuffle of the row keys, so it is a function of the data and the seed and nothing else.
    """
    by_band: dict[str, list[dict]] = defaultdict(list)
    for row in candidates:
        by_band[rr.band_of(row["score"])].append(row)
    for band in by_band:
        by_band[band].sort(key=rr.mask_row_id)
        rng.shuffle(by_band[band])

    taken_in_band = {band: 0 for band in by_band}
    drawn: list[dict] = []
    while len(drawn) < quota:
        live = [band for band in by_band if by_band[band]]
        if not live:
            break
        band = min(live, key=lambda b: (taken_in_band[b], len(by_band[b]), b))
        queue = by_band[band]
        picked = None
        while queue:
            row = queue.pop(0)
            if taken_per_artwork[row["image_sha256"]] < min(per_artwork_cap, MAX_MASKS_PER_ARTWORK):
                picked = row
                break
        if picked is None:
            by_band.pop(band)
            continue
        drawn.append(picked)
        taken_in_band[band] += 1
        taken_per_artwork[picked["image_sha256"]] += 1
    return drawn


def competition_rank(pair: tuple[dict, dict]) -> tuple:
    """Order competing covers: the closest-scoring strong pair first.

    Two display-text masks at 0.71 and 0.69 are the reviewer's note-5 situation exactly — the model
    cannot tell which is the title. A 0.93 and a 0.60 is the same phenomenon, weaker. Sorting by the
    gap puts the sharpest examples of the claim in front of the reviewer while the quota lasts.
    """
    first, second = pair
    return (round(first["score"] - second["score"], 6), -second["score"], rr.mask_row_id(first))


def build_sample(regions: list[dict]) -> tuple[list[tuple[dict, str]], dict]:
    """The purposive sample. Returns (row, role) pairs in a deterministic order."""
    rng = random.Random(SEED)
    taken_per_artwork: dict[str, int] = defaultdict(int)
    selected: list[tuple[dict, str]] = []
    chosen_ids: set[str] = set()
    notes: list[str] = []
    cut = config.CALIBRATED_SCORE_THRESHOLD

    def take(row: dict, role: str) -> bool:
        key = rr.mask_row_id(row)
        if key in chosen_ids or taken_per_artwork[row["image_sha256"]] >= MAX_MASKS_PER_ARTWORK:
            return False
        chosen_ids.add(key)
        taken_per_artwork[row["image_sha256"]] += 1
        selected.append((row, role))
        return True

    # 0. Any mask of this round's three concepts on a confirmed negative. Force-included whole:
    #    the class is expected to be empty and is decisive if it is not.
    round_concepts = ("parental-advisory", "display-text", "emblem")
    for row in sorted(
        (r for r in regions
         if r["image_path"] in CONFIRMED_NEGATIVE_IMAGES and r["concept"] in round_concepts),
        key=rr.mask_row_id,
    ):
        take(row, ROLE_NEGATIVE)
    if selected:
        notes.append(
            f"{len(selected)} mask(s) of {round_concepts} landed on a probe negative and were "
            "force-included; probe 2 measured zero"
        )

    # 1. parental-advisory. The five confirmed covers first, then masks on covers nobody confirmed —
    #    those are where a false positive would show, and they are what the new concept risks.
    pa_rows = [r for r in regions if r["concept"] == "parental-advisory"]
    for image_path in CONFIRMED_PA_IMAGES:
        row = best_on_image(pa_rows, image_path, "parental-advisory")
        if row is None:
            notes.append(f"no parental-advisory mask in the run for confirmed PA cover {image_path}")
            continue
        take(row, ROLE_CONFIRMED)
    unconfirmed_pa = [
        r for r in pa_rows
        if rr.mask_row_id(r) not in chosen_ids and role_of(r["image_path"], CONFIRMED_PA_IMAGES) == ROLE_UNCONFIRMED
    ]
    pa_remaining = PA_QUOTA - sum(1 for _, role in selected if role != ROLE_NEGATIVE)
    for row in spread_over_bands(unconfirmed_pa, max(0, pa_remaining), taken_per_artwork, rng):
        take(row, ROLE_UNCONFIRMED)

    # 2. display-text, in pairs, on covers where two masks compete.
    by_image: dict[str, list[dict]] = defaultdict(list)
    for row in regions:
        if row["concept"] == "display-text":
            by_image[row["image_path"]].append(row)
    pairs: list[tuple[str, tuple[dict, dict]]] = []
    for image_path, rows in by_image.items():
        strong = sorted((r for r in rows if r["score"] >= cut), key=lambda r: (-r["score"], rr.mask_row_id(r)))
        if len(strong) >= COMPETITION_MIN_INSTANCES:
            pairs.append((image_path, (strong[0], strong[1])))
    forced_pairs = [p for p in pairs if p[0] in CONFIRMED_COMPETING_TEXT_IMAGES]
    forced_pairs.sort(key=lambda p: CONFIRMED_COMPETING_TEXT_IMAGES.index(p[0]))
    other_pairs = sorted((p for p in pairs if p[0] not in CONFIRMED_COMPETING_TEXT_IMAGES),
                         key=lambda p: competition_rank(p[1]))
    for image_path in CONFIRMED_COMPETING_TEXT_IMAGES:
        if image_path not in {p[0] for p in pairs}:
            notes.append(
                f"confirmed competing-text cover {image_path} has fewer than "
                f"{COMPETITION_MIN_INSTANCES} display-text masks above {cut:g} in the run"
            )
    text_taken = 0
    for image_path, (first, second) in forced_pairs + other_pairs:
        if text_taken >= DISPLAY_TEXT_QUOTA:
            break
        role = role_of(image_path, CONFIRMED_COMPETING_TEXT_IMAGES)
        for row in (first, second):
            if text_taken < DISPLAY_TEXT_QUOTA and take(row, role):
                text_taken += 1
    if text_taken < DISPLAY_TEXT_QUOTA:
        notes.append(f"display-text short by {DISPLAY_TEXT_QUOTA - text_taken}: too few competing covers")

    # 3. emblem. The two covers the probe opened — one applied label logo, one emblem drawn into the
    #    artwork — then a spread over the bands from everything else.
    emblem_rows = [r for r in regions if r["concept"] == "emblem"]
    emblem_taken = 0
    for image_path in CONFIRMED_EMBLEM_IMAGES:
        row = best_on_image(emblem_rows, image_path, "emblem")
        if row is None:
            notes.append(f"no emblem mask in the run for confirmed emblem cover {image_path}")
            continue
        if take(row, ROLE_CONFIRMED):
            emblem_taken += 1
    rest = [r for r in emblem_rows if rr.mask_row_id(r) not in chosen_ids
            and r["image_path"] not in CONFIRMED_EMBLEM_IMAGES]
    for row in spread_over_bands(rest, EMBLEM_QUOTA - emblem_taken, taken_per_artwork, rng):
        if take(row, ROLE_UNCONFIRMED):
            emblem_taken += 1

    by_concept: dict[str, int] = defaultdict(int)
    by_role: dict[str, int] = defaultdict(int)
    for row, role in selected:
        by_concept[row["concept"]] += 1
        by_role[role] += 1
    composition = {
        "targetSampleSize": TARGET_SAMPLE_SIZE,
        "quotas": {"parental-advisory": PA_QUOTA, "display-text": DISPLAY_TEXT_QUOTA, "emblem": EMBLEM_QUOTA},
        "drawnByConcept": dict(sorted(by_concept.items())),
        "drawnByRole": dict(sorted(by_role.items())),
        "competingCoversAvailable": len(pairs),
        "shortfall": TARGET_SAMPLE_SIZE - len(selected),
        "notes": notes,
    }
    return selected, composition


# --------------------------------------------------------------------------------- manifest

SELECTION_RULE = (
    "A purposive sample from the concept-set-v2 re-run, built to ratify three named claims rather "
    "than to estimate a rate. Every mask of the round's concepts that landed on a probe negative is "
    f"force-included; then up to {PA_QUOTA} parental-advisory masks (the five covers confirmed by eye "
    "to carry a mark, then a band-spread sample of covers nobody confirmed, where a false positive "
    f"would show); up to {DISPLAY_TEXT_QUOTA} display-text masks taken in PAIRS from covers carrying "
    f"two masks above the calibrated cut, so the reviewer judges the artist mask and the title mask of "
    f"the same cover under the same name; and up to {EMBLEM_QUOTA} emblem masks, starting with the "
    "applied record-label logo and the emblem drawn into the artwork that probe 2 opened. At most "
    f"{MAX_MASKS_PER_ARTWORK} masks per artwork. The panel names the STORED TAG, not the prompt "
    "string, because the tag is what is being ratified."
)


def manifest_entry(row: dict, role: str, image_row: dict, overlay_path: Path) -> dict:
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
            "scale": rr.panel_scale(row["mask_width"], row["mask_height"]),
        }
    return {
        "itemId": item_id(row),
        "maskRowId": rr.mask_row_id(row),
        "concept": row["concept"],
        # What the reviewer is asked about: the stored tag's plain-language name, not the prompt.
        "conceptPhrase": CONCEPT_LABELS[row["concept"]],
        "conceptPrompt": dict(config.CONCEPT_PROMPTS)[row["concept"]],
        "conceptGroup": rr.CONCEPT_GROUP[row["concept"]],
        "selectionRole": role,
        "score": row["score"],
        "areaFraction": row["area_fraction"],
        "band": rr.band_of(row["score"]),
        "stratum": f"{rr.CONCEPT_GROUP[row['concept']]}|{rr.band_of(row['score'])}",
        # Kept for shape-compatibility with round 1's manifest type; this round does not select on
        # the hallucination signature, it only records when a drawn mask happens to match it.
        "forcedSuspicious": row["area_fraction"] > rr.SUSPICIOUS_AREA_FRACTION and row["score"] < rr.SUSPICIOUS_SCORE,
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


def build(run: str, write: bool) -> dict:
    run_path = config.DATA_DIR / f"{run}.jsonl"
    if not run_path.exists():
        raise SystemExit(
            f"{run_path} does not exist. This round reads the concept-set-v2 re-run of the eval set; "
            "the re-run is a GPU job and is the orchestrator's to schedule:\n"
            "    cd research/v3/oracle/sam && ./supervise.sh --eval-set --out sam-eval-142-v2"
        )
    regions, images = rr.read_run(run)          # raises if the run predates concept set v2
    selected, composition = build_sample(regions)

    if write:
        OVERLAY_DIR.mkdir(parents=True, exist_ok=True)
    entries: list[dict] = []
    for row, role in selected:
        overlay_path = OVERLAY_DIR / f"{item_id(row)}.png"
        if write:
            rr.render_overlay(row, images[row["image_sha256"]], phrases=CONCEPT_LABELS).save(
                overlay_path, optimize=True
            )
        entries.append(manifest_entry(row, role, images[row["image_sha256"]], overlay_path))
    entries.sort(key=lambda entry: entry["itemId"])
    missing = [entry["itemId"] for entry in entries if entry["overlay"] is None]
    if write and missing:
        raise RuntimeError(f"{len(missing)} overlays did not render: {missing[:3]}")

    return {
        "manifestVersion": "sam-mask-quality-sample.v1",
        "batchId": BATCH_ID,
        "seed": SEED,
        "generatedBy": "research/v3/oracle/sam/review_round_2.py",
        "builtFrom": [
            f"research/v3/data/sam/{run}.jsonl",
            "research/v3/oracle/sam/config.py",
            "research/v3/oracle/sam/overlay.py",
            "research/v3/oracle/sam/review_round.py",
            "research/v3/data/sam/VOCAB_PROBE_NOTES.md",
            "research/v3/oracle/sam/vocab-probe-15.txt",
        ],
        "sourceRun": run,
        "conceptSetHash": common.concept_set_hash(),
        "conceptSetVersion": "v2",
        "renderer": {
            "pillow": rr.PIL_VERSION,
            "minPanelPx": rr.MIN_PANEL_PX,
            "maxPanelScale": rr.MAX_PANEL_SCALE,
            "maskAlpha": rr.MASK_ALPHA,
            "bboxWidthPx": rr.BBOX_WIDTH_PX,
            "haloWidthPx": rr.HALO_WIDTH_PX,
            "locatorRingMaxExtent": rr.LOCATOR_RING_MAX_EXTENT,
            "conceptLabels": CONCEPT_LABELS,
            "conceptColors": {concept: list(colour) for concept, colour in rr.CONCEPT_COLORS.items()},
        },
        "scoreThresholdAtRun": config.SCORE_THRESHOLD,
        "calibratedScoreThreshold": config.CALIBRATED_SCORE_THRESHOLD,
        "scoreBands": [{"band": name, "low": low, "high": high} for name, low, high in rr.SCORE_BANDS],
        "conceptGroups": {group: list(concepts) for group, concepts in config.CONCEPT_GROUPS.items()},
        "selection": {"rule": SELECTION_RULE, "composition": composition},
        "items": entries,
    }


def report(manifest: dict) -> None:
    items = manifest["items"]
    print(f"{manifest['batchId']}: {len(items)} masks from "
          f"{len({i['artwork']['sha256'] for i in items})} artworks, run={manifest['sourceRun']}")
    composition = manifest["selection"]["composition"]
    print("  concept x role:")
    counts: dict[tuple[str, str], int] = defaultdict(int)
    for item in items:
        counts[(item["concept"], item["selectionRole"])] += 1
    for (concept, role), count in sorted(counts.items()):
        print(f"    {concept:20s} {role:20s} {count:3d}")
    print("  band:")
    bands: dict[str, int] = defaultdict(int)
    for item in items:
        bands[item["band"]] += 1
    for band, _, _ in rr.SCORE_BANDS:
        print(f"    {band:12s} {bands[band]:3d}")
    print(f"  shortfall: {composition['shortfall']}")
    for note in composition["notes"]:
        print(f"  NOTE {note}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run", default=SOURCE_RUN, help="run stem under research/v3/data/sam/")
    parser.add_argument("--write", action="store_true", help="write the manifest and the overlays")
    args = parser.parse_args()
    manifest = build(args.run, args.write)
    report(manifest)
    if args.write:
        MANIFEST_PATH.write_text(json.dumps(manifest, indent="\t", sort_keys=False) + "\n")
        print(f"wrote {MANIFEST_PATH}")
        print(f"wrote {len(manifest['items'])} overlays to {OVERLAY_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
