"""Render the 48-tile typical-strata round and write its manifest. CPU only.

    .venv/bin/python pointing_typical_round.py            # report, write nothing
    .venv/bin/python pointing_typical_round.py --write    # write manifest + panels

Step 2 of three. Step 1 is `pointing_typical_probe.py` (the GPU run); step 3 is
`build-pointing-typical-fixture.ts`, which turns this manifest into the served fixture.

Never loads a model: every dot and every mask comes from the stored RLEs in
`data/sam/pointing-typical-1-run.json`. Re-pointing would draw a different sample and the
reviewer must judge the sample the policies were actually compared on.

The panel is the round-1 panel, imported rather than reimplemented
--------------------------------------------------------------------
§13.8 requires "the identical panel (no caption, no number, no phrasing, no model name)".
The strongest available guarantee of that is to call `pointing_round_1.panel` itself, so
this file cannot drift from the round it is compared against. Same 480 px panels, same
pink wash (`point_sheets.MASK_RGB/MASK_ALPHA`), same green dot geometry.

What differs, and it is the whole design (§14.7 addition 3): three tiles per cover —
`containing`, `ground`, `union` — grown from **identical points**. The dot pattern is
therefore constant across a cover's three tiles, so the reviewer's keypress separates the
policies rather than the pointer. Tile order is shuffled so policy identity is not cued by
position, and **no panel says which policy it is**.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import sys

from PIL import Image

import common
import config
import pointing_round_1 as r1
import pointing_typical_probe as ptp

BATCH_ID = ptp.BATCH_ID

RUN_PATH = ptp.RUN_PATH
MANIFEST_PATH = config.DATA_DIR / "pointing-typical-1-sample.json"
PANEL_DIR = config.DATA_DIR / "review-panels-typical-1"

#: [REVIEWED] PREREG §5. Tile shuffle seed. Distinct from the draw seed by construction.
SHUFFLE_SEED = ptp.SEED + 1


def item_id(cover_id: str, policy: str) -> str:
    digest = hashlib.sha256(f"{BATCH_ID}|{cover_id}|{policy}".encode("utf-8")).hexdigest()
    return f"pt1-{digest[:12]}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    run = json.loads(RUN_PATH.read_text())
    if run["batch_id"] != BATCH_ID:
        raise SystemExit(f"run batch_id {run['batch_id']} != {BATCH_ID}")
    rows = run["rows"]
    print(f"{BATCH_ID}: {len(rows)} covers x {len(ptp.POLICIES)} policies = "
          f"{len(rows) * len(ptp.POLICIES)} tiles")
    if run.get("aborted_on_budget"):
        print("  WARNING: the GPU run aborted on its budget; this round is partial.")

    if args.write:
        PANEL_DIR.mkdir(parents=True, exist_ok=True)
    common.register_image_plugins()

    items = []
    for row in rows:
        image = Image.open(config.REPO_ROOT / row["image_path"]).convert("RGB")
        points = [(float(x), float(y)) for x, y in row["points_pixels"]]
        for policy in ptp.POLICIES:
            pol = row["policies"][policy]
            iid = item_id(row["cover_id"], policy)
            entry = {
                "itemId": iid,
                "coverId": row["cover_id"],
                "policy": policy,
                "stratum": row["stratum"],
                "nDistinctPoints": row["n_distinct_points"],
                "pointsShortfall": row["points_shortfall"],
                # --- server-side only, never served: this is the round's answer-adjacent data
                "maskAreaFraction": pol["area_fraction"],
                "maskStrategy": pol.get("strategy"),
                "sameCandidateAsContaining": pol.get("same_candidate_as_containing"),
                "artwork": {
                    "imagePath": row["image_path"],
                    "artworkId": row["artwork_id"],
                    "collection": row["collection"],
                    "width": row["width"], "height": row["height"],
                },
                "panel": None,
            }
            if args.write:
                mask = common.rle_decode(pol["mask_rle"], pol["mask_height"], pol["mask_width"])
                canvas = r1.panel(image, mask, points)
                path = PANEL_DIR / f"{iid}.png"
                canvas.save(path, optimize=True)
                data = path.read_bytes()
                entry["panel"] = {
                    "path": str(path.relative_to(config.REPO_ROOT)),
                    "sha256": common.sha256_bytes(data),
                    "bytes": len(data),
                    "width": canvas.width, "height": canvas.height,
                }
            items.append(entry)

    order = [i["itemId"] for i in items]
    random.Random(SHUFFLE_SEED).shuffle(order)

    manifest = {
        "manifestVersion": "pointing-round-sample.v1",
        "batchId": BATCH_ID,
        "seed": SHUFFLE_SEED,
        "generatedBy": "research/v3/oracle/sam/pointing_typical_round.py",
        "builtFrom": [
            "research/v3/oracle/sam/POINTING_TYPICAL_PREREG.md",
            "research/v3/data/sam/pointing-typical-1-run.json",
        ],
        "sourceRun": "research/v3/data/sam/pointing-typical-1-run.json",
        "prereg": "research/v3/oracle/sam/POINTING_TYPICAL_PREREG.md",
        "implements": "POINTING_PROBE_NOTES.md §13.8 as refined by §14.7",
        "draw": run["draw"],
        "substitutions": run["substitutions"],
        "pointer": run["pointer"],
        "sam": run["sam"],
        "policies": list(ptp.POLICIES),
        "tileOrder": order,
        "preRegisteredBar": {
            "source": "research/v3/oracle/sam/POINTING_TYPICAL_PREREG.md §6",
            "fixedBefore": "the GPU run — committed in e4e1553 before any inference",
            "B1_dotRightMin": 12,
            "B2_dotRightAndWashRightMinPerPolicy": 8,
            "of": 16,
            "B3_rule": "route carries forward only if B1 holds AND at least one policy clears B2",
            "B4_defaultMoves": "challenger clears B2, beats containing by >=3 covers of 16, and "
                               "breaks at most 1 cover containing got both-right",
            "coverDotVerdict": "majority of the cover's three tile answers; a tie is dot-wrong",
            "comparisonBias": "pointing-ground-1's 7/8 and 3/8 were answered leniently and are "
                              "ceilings; this round is answered strictly, so the comparison is "
                              "biased AGAINST this round and a tie reads as an improvement",
        },
        "panelRenderer": {
            "importedFrom": "research/v3/oracle/sam/pointing_round_1.py:panel",
            "panelPx": r1.PANEL_PX, "gutterPx": r1.GUTTER_PX,
            "maskRgb": list(r1.point_sheets.MASK_RGB), "maskAlpha": r1.point_sheets.MASK_ALPHA,
            "dotRgb": [60, 255, 140],
            "captions": "none — no caption, no area number, no phrasing, no model name, "
                        "and no policy name appears on any panel",
        },
        "items": items,
    }

    if args.write:
        MANIFEST_PATH.write_text(json.dumps(manifest, indent="\t") + "\n")
        print(f"wrote {MANIFEST_PATH}")
        print(f"wrote {len(items)} panels to {PANEL_DIR}")
    else:
        print("dry run: nothing written. Pass --write.")
    for entry in items[:6]:
        print(f"  {entry['itemId']}  {entry['coverId']}  {entry['policy']:11s} "
              f"area {entry['maskAreaFraction']:.3f}")
    print(f"  … {len(items)} tiles total, shuffled with seed {SHUFFLE_SEED}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
