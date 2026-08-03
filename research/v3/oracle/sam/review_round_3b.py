"""Build mask-quality round 3b: the CJK masks, finally in front of a reviewer (loose end A12).

    .venv/bin/python review_round_3b.py                 # report the composition, write nothing
    .venv/bin/python review_round_3b.py --write         # write the manifest and the overlays

CPU only. Reads `sam-cjk-probe-7.jsonl`, the run `run_cjk_probe.py` produced, and renders panels
from its stored RLEs. It never loads a model.

What this round decides
-----------------------
`chinese characters` recalls 4 of 4 CJK covers with zero false positives and tops out at **0.472**,
below the pooled cut of 0.578 and far below `text_like`'s group cut of 0.697295. That pair of facts
— perfect precision, perfect recall, every score below every cut — is the strongest argument in the
project that **the calibrated cut is category-dependent**, and it has never been tested the only way
it can be: by a human looking at the masks. Probe 4 could not put them on screen because it stored
no `mask_rle`. Round 3 reported that gap. `run_cjk_probe.py` closed it. This round asks the question.

So the round is deliberately made of masks that **every threshold in force discards**: 0 of the 18
`cjk-script` regions clear the pooled cut. If the reviewer says they are correct masks, the cut is
throwing away a category it was never fitted on, and a category-aware threshold is justified on
evidence rather than on a hunch. If the reviewer says they are not, A12 closes and the incumbent
`words` keeps the field. Both outcomes are decisive and neither is assumed.

The incumbent control is not optional
-------------------------------------
`words` — what concept set v2.1 actually asks today — is run on the same covers and its masks are in
the round, as their own pass. A new concept is only worth its cost if the incumbent does not already
catch the same glyphs, and probe 4 measured that the answer differs per cover: `words` is blind on
the Rose Liu cover and partially sighted on the vertical Japanese one. The reviewer judges both, so
the comparison is made on answers rather than on scores.

Outputs
-------
  * `research/v3/data/sam/mask-quality-3b-sample.json` — the manifest, in the shape round 1 wrote,
    so `buildSamMaskQualityFixture({ samplePath })` reads its `items` unchanged. Server-side and
    analysis-side only: it holds the scores the answers are joined against.
  * `research/v3/data/sam/review-overlays-3b/<itemId>.png` — one panel per mask, rendered by
    `review_round.render_overlay`, the same three-layer format every previous round used.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path

from PIL import Image

import common
import config
import review_round as rr
import run_cjk_probe as probe

# --------------------------------------------------------------------------------- identity

BATCH_ID = "sam-mask-quality-3b-cjk"

SOURCE_RUN = "sam-cjk-probe-7"

MANIFEST_PATH = config.DATA_DIR / "mask-quality-3b-sample.json"
OVERLAY_DIR = config.DATA_DIR / "review-overlays-3b"

# [UNCALIBRATED] Fixed so the sample is reproducible. Distinct from every previous round's seed.
SEED = 20260806

# --------------------------------------------------------------------------------- what to ask

# [REVIEWED] What the panel calls each tag. NOT the prompt string — round 2's rule, kept.
#
# `cjk-script` is asked with the prompt "chinese characters", but probe 4 measured that it fires on
# Japanese covers as readily as Chinese ones (0.472 on 森昌子 / こころ雪, 0.377 on 言葉を恐れる) and is
# silent on Korean, Thai and Malayalam — it means *this script family*, not *this language* and not
# *not-Latin*. Printing "chinese characters" would ask the reviewer to reject a correct mask on a
# Japanese cover for being Japanese, which would measure the label rather than the mask. The panel
# therefore says what the mask actually claims, and the prompt is recorded beside it in the manifest.
#
# `kanji` prints with a gloss for the same reason in reverse: the bare endonym is precise but assumes
# the reader knows it names Japanese characters specifically.
CONCEPT_LABELS: dict[str, str] = {
    "cjk-script": "Chinese or Japanese characters",
    "kanji": "Japanese kanji characters",
    # The incumbent. Unchanged wording, deliberately: it is the same question round 1 asked, so the
    # answers are comparable with round 1's `words` answers.
    "words": "words",
}

# [REVIEWED] The group this round files each tag under. `cjk-script` and `kanji` are in no
# `CONCEPT_GROUPS` group — they are not in the static set at all — so the round declares one for the
# manifest and the analysis. Nothing here is written back to config.py.
#
# They are ONE group on probe 4's evidence, and that is the point: the recommendation probe 4 landed
# on was "add both `chinese characters` and `kanji` as one group and let the union carry it", because
# `kanji` clears the cut on the two Japanese covers where `chinese characters` does not. A group is
# how the union gets a single threshold, so filing them together is what makes that option testable.
CJK_GROUP = "cjk_script"
CONCEPT_GROUPS_3B: dict[str, tuple[str, ...]] = {
    CJK_GROUP: ("cjk-script", "kanji"),
    # `words` keeps its real group, so a per-group analysis compares like with like against round 1.
    "text_like": ("words",),
}

# [REVIEWED] Panel colours for the two new tags. `overlay.CONCEPT_COLORS` asserts it equals the
# static concept set and cannot carry these; they are merged in for rendering only. Chosen far from
# `words`' red, because the whole visual question on a mixed-script cover is which word took which
# glyphs, and two script concepts that looked alike would make that unanswerable at a glance.
PROBE_CONCEPT_COLORS: dict[str, tuple[int, int, int]] = {
    "cjk-script": (0, 210, 255),
    "kanji": (180, 255, 0),
}

# [REVIEWED] How many masks per (cover, concept), and which ones. Three, spread over that cover's own
# score range — its strongest, its median and its weakest.
#
# Spread rather than top-N because the round has to give a category cut a BOUNDARY to be fitted to.
# A round showing only each cover's best mask would collect answers clustered at one end of the score
# axis, and a sweep over them could not distinguish "the cut belongs at 0.35" from "the cut belongs
# at 0.45" — every candidate would separate the same way. The weakest mask on a cover is where the
# boundary actually lives.
PER_COVER_PER_CONCEPT = 3

# --------------------------------------------------------------------------------- selection


def item_id(row: dict) -> str:
    """Opaque, content-derived item id, salted per batch so no mask collides across rounds."""
    digest = hashlib.sha256(f"{BATCH_ID}|{rr.mask_row_id(row)}".encode("utf-8")).hexdigest()
    return f"smq3b-{digest[:12]}"


def group_of(concept: str) -> str:
    for group, concepts in CONCEPT_GROUPS_3B.items():
        if concept in concepts:
            return group
    raise KeyError(f"concept {concept!r} is in none of this round's groups")


def spread(rows: list[dict], count: int) -> list[dict]:
    """The strongest, the median and the weakest, in that order. A function of the scores alone."""
    ranked = sorted(rows, key=lambda r: (-r["score"], rr.mask_row_id(r)))
    if len(ranked) <= count:
        return ranked
    if count == 1:
        return [ranked[0]]
    picks = {round(index * (len(ranked) - 1) / (count - 1)) for index in range(count)}
    return [ranked[index] for index in sorted(picks)]


def read_probe_run(run: str) -> tuple[list[dict], dict[str, dict]]:
    """Read the probe run, checking it was made under THIS probe's prompt set.

    `rr.read_run`'s guard compares against `config.CONCEPT_PROMPTS`, which this run deliberately did
    not ask, so it would refuse unconditionally. The equivalent check here is the one that means the
    same thing: the run's recorded `probe_concept_set_hash` must equal the prompt set
    `run_cjk_probe.py` currently declares. A mismatch means the prompts were edited after the run and
    the masks on disk answer a different question from the one the panel would name.
    """
    rows = common.read_jsonl(config.DATA_DIR / f"{run}.jsonl")
    regions = [r for r in rows if r.get("record_type") == config.RECORD_TYPE_REGION]
    images = {
        r["image_sha256"]: r
        for r in rows
        if r.get("record_type") == config.RECORD_TYPE_IMAGE and r.get("status") == "ok"
    }
    hashes = {r.get("probe_concept_set_hash") for r in rows if r.get("probe_concept_set_hash")}
    expected = probe.probe_concept_set_hash()
    if hashes != {expected}:
        raise SystemExit(
            f"{run}.jsonl was made under probe prompt set(s) {sorted(hashes)}, but run_cjk_probe.py "
            f"now declares {expected}. Re-run the probe, or check out the prompts it was made under; "
            "a round must not name prompts the masks did not come from."
        )
    stale = sorted({r["concept"] for r in regions} - set(CONCEPT_LABELS))
    if stale:
        raise SystemExit(f"{run}.jsonl carries concepts this round has no label for: {stale}")
    return regions, images


def build_sample(regions: list[dict]) -> tuple[list[dict], dict]:
    """Up to `PER_COVER_PER_CONCEPT` masks per (cover, concept), spread over that cell's range."""
    by_cell: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in regions:
        by_cell[(row["image_path"], row["concept"])].append(row)

    selected: list[dict] = []
    # Concept order is the pass order the reviewer will meet: the finding under test first, its union
    # partner second, the incumbent control last.
    concept_order = ["cjk-script", "kanji", "words"]
    covers = sorted({row["image_path"] for row in regions})
    for concept in concept_order:
        for cover in covers:
            selected.extend(spread(by_cell.get((cover, concept), []), PER_COVER_PER_CONCEPT))

    available = {concept: sum(1 for r in regions if r["concept"] == concept) for concept in concept_order}
    drawn = {concept: sum(1 for r in selected if r["concept"] == concept) for concept in concept_order}
    pooled = config.CALIBRATED_SCORE_THRESHOLD
    composition = {
        "perCoverPerConcept": PER_COVER_PER_CONCEPT,
        "availableByConcept": available,
        "drawnByConcept": drawn,
        "coversWithMasks": len(covers),
        "drawnAbovePooledCut": sum(1 for r in selected if r["score"] >= pooled),
        "cjkDrawnAbovePooledCut": sum(
            1 for r in selected if r["concept"] == "cjk-script" and r["score"] >= pooled
        ),
        "scoreRangeByConcept": {
            concept: {
                "min": round(min((r["score"] for r in regions if r["concept"] == concept), default=0.0), 6),
                "max": round(max((r["score"] for r in regions if r["concept"] == concept), default=0.0), 6),
            }
            for concept in concept_order
        },
        "notes": [],
    }
    if composition["cjkDrawnAbovePooledCut"] == 0:
        composition["notes"].append(
            f"every `cjk-script` mask in this round is BELOW the pooled cut of {pooled:g} — which is "
            "the finding under test, not an accident of sampling: 0 of the run's 18 cjk-script "
            "regions clear it"
        )
    return selected, composition


# --------------------------------------------------------------------------------- the yield report

# [MEASURED] What the GPU run found on the three covers round 3 had to report as a gap — the covers
# on which the static concept set produced NO text mask at all, even at the 0.3 floor. Recorded in
# the manifest because it is the direct answer to the question round 3 left open, and because two of
# the three answers are zeros that a round built only from masks would silently not mention.
def silent_cover_yield(regions: list[dict], images: dict[str, dict]) -> list[dict]:
    silent = [
        "07/ab67616d0000b2730007960724fb77c8041c6c13",
        "10/ab67616d0000b27300103a3729bf589e0dc913ab",
        "images/nobs.jpg",
    ]
    by_path = {row["image_path"]: row for row in images.values()}
    out = []
    for path in silent:
        summary = by_path.get(path)
        rows = [r for r in regions if r["image_path"] == path]
        out.append({
            "imagePath": path,
            "regionsFound": len(rows),
            "bestScoreByConcept": summary["best_score_by_concept"] if summary else None,
            "recovered": len(rows) > 0,
        })
    return out


# --------------------------------------------------------------------------------- manifest

SELECTION_RULE = (
    "Every mask comes from `sam-cjk-probe-7`, a 7-cover run of three prompts — `chinese characters`, "
    "`kanji`, and `words` as the incumbent control — made specifically to close the gap round 3 "
    "reported: probe 4 measured that `chinese characters` recalls 4 of 4 CJK covers with zero false "
    "positives and never scores above 0.472, but it stored no mask, so nobody has ever seen one. Up "
    "to three masks per cover per concept, spread from that cell's strongest to its weakest, because "
    "a category-aware cut needs a boundary to be fitted to and a round of best-masks-only would have "
    "none. The round is made almost entirely of masks that every threshold in force DISCARDS: 0 of "
    "the run's 18 `cjk-script` regions clear the pooled cut of 0.578. What it decides: whether the "
    "calibrated cut is category-dependent — if these are correct masks, the cut is throwing away a "
    "category it was never fitted on; if they are not, loose end A12 closes and the incumbent `words` "
    "keeps the field. The panel names what the mask CLAIMS, not the prompt string: the prompt "
    "\"chinese characters\" is printed as \"Chinese or Japanese characters\" because it demonstrably "
    "fires on both and is silent on Korean, Thai and Malayalam."
)

# [REVIEWED] How the answers map to the A12 decision, fixed BEFORE any answer is seen. It reuses the
# gates already written into the analysis rather than inventing a second standard.
A12_DECISION_RULE = {
    "unitOfDecision": (
        f"the `{CJK_GROUP}` group (`cjk-script` + `kanji` together), which is the form probe 4 "
        "recommended: one group, one threshold, the union carrying covers where either word fires"
    ),
    "primaryTreatment": "`partly` excluded from both sides; the denominator is decided answers only",
    "method": (
        "sweep a candidate cut over the observed scores of the graded masks, maximising Youden J — "
        "the same sweep that produced the pooled cut and the text_like group cut"
    ),
    "gates": (
        "propose a CJK group threshold only if it clears the bars the existing analysis already "
        "applies: separation from the pooled cut >= 0.05, J gain >= 0.05, and at least 5 decided "
        "answers in the group"
    ),
    "adoptIf": (
        "the group's masks are largely accepted AND a cut below the pooled 0.578 separates accepted "
        "from rejected — then `cjk-script`/`kanji` are proposed as a concept-set addition WITH their "
        "own group threshold, which is probe 4's second option and its recommendation"
    ),
    "closeIf": (
        "the masks are largely rejected — A12 closes, no concept is added, and the finding is "
        "recorded as a category whose evidence never survived being looked at"
    ),
    "incumbentCheck": (
        "the `words` pass is judged on the same covers. If `words` masks are accepted wherever "
        "`cjk-script` masks are, the incumbent already covers the category and a new concept buys "
        "nothing regardless of how the CJK masks score."
    ),
    "notAdopted": (
        "this round edits no constant. config.CONCEPT_PROMPTS is untouched, so every stored run "
        "stays reproducible; adding a concept is the reviewer's call and a separate, later change."
    ),
}


def manifest_entry(row: dict, image_row: dict, overlay_path: Path) -> dict:
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
        "conceptPhrase": CONCEPT_LABELS[row["concept"]],
        "conceptPrompt": row["probe_prompt"],
        "conceptGroup": group_of(row["concept"]),
        "conceptIsProbe": bool(row.get("concept_is_probe", False)),
        # Answer key from here to `maskRef`: manifest-side only, exactly as in every previous round.
        "score": row["score"],
        "areaFraction": row["area_fraction"],
        "band": rr.band_of(row["score"]),
        "clearsPooledCut": row["score"] >= config.CALIBRATED_SCORE_THRESHOLD,
        "stratum": f"{group_of(row['concept'])}|{rr.band_of(row['score'])}",
        "forcedSuspicious": False,
        "maskRef": {
            "run": SOURCE_RUN,
            "runId": row["run_id"],
            "schemaVersion": row["schema_version"],
            "probeConceptSetHash": row["probe_concept_set_hash"],
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
            f"{run_path} does not exist. It is produced by:\n"
            "    .venv/bin/python run_cjk_probe.py --out sam-cjk-probe-7"
        )
    regions, images = read_probe_run(run)
    selected, composition = build_sample(regions)

    rr.CONCEPT_COLORS = {**rr.CONCEPT_COLORS, **PROBE_CONCEPT_COLORS}

    if write:
        OVERLAY_DIR.mkdir(parents=True, exist_ok=True)
    entries: list[dict] = []
    for row in selected:
        overlay_path = OVERLAY_DIR / f"{item_id(row)}.png"
        if write:
            rr.render_overlay(row, images[row["image_sha256"]], phrases=CONCEPT_LABELS).save(
                overlay_path, optimize=True
            )
        entries.append(manifest_entry(row, images[row["image_sha256"]], overlay_path))
    entries.sort(key=lambda entry: entry["itemId"])

    missing = [entry["itemId"] for entry in entries if entry["overlay"] is None]
    if write and missing:
        raise RuntimeError(f"{len(missing)} overlays did not render: {missing[:3]}")

    return {
        "manifestVersion": "sam-mask-quality-sample.v1",
        "batchId": BATCH_ID,
        "seed": SEED,
        "generatedBy": "research/v3/oracle/sam/review_round_3b.py",
        "builtFrom": [
            f"research/v3/data/sam/{run}.jsonl",
            "research/v3/oracle/sam/run_cjk_probe.py",
            "research/v3/oracle/sam/cjk-probe-7.txt",
            "research/v3/oracle/sam/config.py",
            "research/v3/oracle/sam/review_round.py",
            "research/v3/data/sam/PROBE4_NOTES.md",
        ],
        "sourceRun": run,
        # The STATIC set this ran alongside, unchanged and untouched, so a reader can see that adding
        # these prompts cost no stored run its reproducibility.
        "conceptSetHash": common.concept_set_hash(),
        "probeConceptSetHash": probe.probe_concept_set_hash(),
        "probePrompts": {tag: text for tag, text in probe.CJK_PROMPTS},
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
        "calibratedGroupThresholds": dict(config.CALIBRATED_GROUP_THRESHOLDS),
        "scoreBands": [{"band": name, "low": low, "high": high} for name, low, high in rr.SCORE_BANDS],
        "conceptGroups": {group: list(concepts) for group, concepts in CONCEPT_GROUPS_3B.items()},
        "selection": {"rule": SELECTION_RULE, "composition": composition},
        "a12DecisionRule": A12_DECISION_RULE,
        "silentCoverYield": silent_cover_yield(regions, images),
        "items": entries,
    }


def report(manifest: dict) -> None:
    items = manifest["items"]
    composition = manifest["selection"]["composition"]
    print(f"{manifest['batchId']}: {len(items)} masks from "
          f"{len({i['artwork']['imagePath'] for i in items})} covers, run={manifest['sourceRun']}")
    print(f"  probe prompt set: {manifest['probeConceptSetHash'][:16]}  "
          f"static set UNCHANGED: {manifest['conceptSetHash'][:16]}")
    print("  concept x cover:")
    counts: dict[tuple[str, str], int] = defaultdict(int)
    for item in items:
        counts[(item["concept"], item["artwork"]["imagePath"])] += 1
    for (concept, cover), count in sorted(counts.items()):
        print(f"    {concept:12s} {cover:52s} {count:3d}")
    print(f"  drawn by concept: {composition['drawnByConcept']} of available "
          f"{composition['availableByConcept']}")
    print(f"  score range: {composition['scoreRangeByConcept']}")
    print(f"  above the pooled cut: {composition['drawnAbovePooledCut']} "
          f"(cjk-script: {composition['cjkDrawnAbovePooledCut']})")
    print("  silent-cover yield (the covers round 3 could show nothing for):")
    for entry in manifest["silentCoverYield"]:
        mark = "RECOVERED" if entry["recovered"] else "still nothing"
        print(f"    {entry['imagePath']:52s} n={entry['regionsFound']:2d}  {mark}")
    for note in composition["notes"]:
        print(f"  NOTE {note}")
    print(f"\n  TOTAL items: {len(items)}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--run", default=SOURCE_RUN)
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
