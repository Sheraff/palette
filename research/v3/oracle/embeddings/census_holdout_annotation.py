"""Re-annotate the frozen near-duplicate census against the CURRENT holdout.

Why this exists (adversarial review 2026-08-03, MAJOR-2). `near-dup-census.json`
was written at 2026-08-02T20:17:36Z, while holdout **1.0.0** was still the frozen
list. Two parts of that file are holdout-dependent and are therefore stale:

  * `holdout_crossing` -- the four threshold/criterion reports. Read today at
    face value they say the current holdout leaks catastrophically (1,533
    leaking pairs, 224 artworks). It does not. Those numbers are the DIAGNOSIS
    OF THE BUG THAT WAS ALREADY FIXED: they are why 1.0.0 was voided and 2.0.0
    was drawn over whole near-duplicate components.
  * `pairs[].a.side` / `pairs[].b.side` -- per-endpoint `holdout` /
    `working_set` / `sharded_corpus` labels, also computed against 1.0.0.
    2,875 of the 12,472 music-artworks endpoints disagree with 2.0.0.

The `pairs` themselves -- the graph, the cosines, `found_by_arms` -- are
holdout-independent and correct. They are what every consumer actually reads.

WHY A SIDECAR AND NOT A REGENERATED CENSUS. The census file is pinned by sha256
as live evidence in three places:

  1. `research/v3/data/holdout/holdout.json` `header.nearDuplicateCensus.sha256`
  2. `research/v3/data/coverage-set/coverage-set-1.json` `header.inputs[]`
  3. `research/v3/data/decisions/decisions.json` `d-2026-08-02-holdout-v2-redraw`

and asserted at build time by `src/coverage-set/build-coverage-set.ts` (the
census on disk must be the one the holdout was frozen against, or selecting
against a different graph would make the leak assertion meaningless). Rewriting
the census -- even to add one `holdout_version` line -- changes its sha256 and
breaks all three, two of which live in other workstreams' owned paths and one of
which is an append-only decision record. The bytes of the census are evidence.
So the correction goes BESIDE the file, not INTO it, and the pins keep holding.

Forward fix: `near_dup_census.py` now stamps `holdout_version` into every census
it writes, so a future census cannot repeat this.

What this writes:
  data/embeddings/near-dup-census.holdout-v2.json

Usage:
  .venv/bin/python census_holdout_annotation.py
  .venv/bin/python census_holdout_annotation.py --check   # non-zero if stale
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path

import config
import common

# [INHERITED] The census's own thresholds, restated here so the sidecar's
# reports line up row-for-row with the block it supersedes. Source:
# `near_dup_census.py` NEAR_DUP_THRESHOLD / STRICT_THRESHOLD.
NEAR_DUP_THRESHOLD = 0.95
STRICT_THRESHOLD = 0.98

# [MEASURED] The holdout version the frozen census's own `holdout_crossing`
# block and `side` labels were computed against. Established from the file's
# `written_at` (2026-08-02T20:17:36Z) against holdout 2.0.0's freeze time
# (22:47 the same day) and confirmed numerically: recomputing the block against
# 2.0.0 gives entirely different counts (see `disagreement` in the output).
CENSUS_EMBEDDED_HOLDOUT_VERSION = "1.0.0"

CENSUS_PATH = config.DATA_DIR / "near-dup-census.json"
SIDECAR_PATH = config.DATA_DIR / "near-dup-census.holdout-v2.json"
HOLDOUT_PATH = (
    config.REPO_ROOT / "research" / "v3" / "data" / "holdout" / "holdout.json"
)


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def side_of(path: str, collection: str, held_files: set[str]) -> str:
    """The same three-valued label the census uses, recomputed against v2."""
    if path in held_files:
        return "holdout"
    if collection == config.COLLECTION_MUSIC_ARTWORKS:
        return "working_set"
    return "sharded_corpus"


def build(census: dict, holdout: dict) -> dict:
    held_artwork_ids = {entry["id"] for entry in holdout["artworks"]}
    held_files = {
        file_entry["path"]
        for entry in holdout["artworks"]
        for file_entry in entry["files"]
    }
    quarantined_ids = set(
        holdout["header"]["nearDuplicateCensus"]["nonCandidateQuarantine"]["artworkIds"]
    )
    arms = list(census["method"]["arms_scanned"])
    pairs = census["pairs"]

    # ---- corrected side labels ------------------------------------------------
    corrected: list[dict] = []
    disagreeing_endpoints = 0
    music_endpoints = 0
    for position, pair in enumerate(pairs):
        entry = {"index": position}
        changed = False
        for end in ("a", "b"):
            node = pair[end]
            if node["collection"] == config.COLLECTION_MUSIC_ARTWORKS:
                music_endpoints += 1
            now = side_of(node["path"], node["collection"], held_files)
            entry[end] = now
            if now != node["side"]:
                disagreeing_endpoints += 1
                changed = True
        entry["changed"] = changed
        corrected.append(entry)

    # ---- holdout_crossing, recomputed ----------------------------------------
    def report(threshold: float, criterion: str) -> dict:
        crossing = []
        for position, pair in enumerate(pairs):
            value = (
                pair["cosine"]
                if criterion == "primary"
                else max(pair["cosine_by_arm"][a] for a in arms)
            )
            if value < threshold:
                continue
            side_a, side_b = corrected[position]["a"], corrected[position]["b"]
            if "holdout" not in (side_a, side_b):
                continue
            if side_a == side_b == "holdout":
                kind = "holdout_to_holdout"
            else:
                kind = "holdout_to_" + (side_b if side_a == "holdout" else side_a)
            crossing.append((position, kind))

        leaking = [c for c in crossing if c[1] != "holdout_to_holdout"]
        affected: set[str] = set()
        quarantine_files: set[str] = set()
        partner_quarantined = 0
        partner_working_set = 0
        for position, _kind in leaking:
            pair = pairs[position]
            for end in ("a", "b"):
                node = pair[end]
                artwork = node["artwork_id"].split(":", 1)[-1]
                if corrected[position][end] == "holdout":
                    affected.add(artwork)
                else:
                    quarantine_files.add(node["path"])
                    if artwork in quarantined_ids:
                        partner_quarantined += 1
                    else:
                        partner_working_set += 1
        by_kind: dict[str, int] = defaultdict(int)
        for _position, kind in crossing:
            by_kind[kind] += 1
        return {
            "threshold": threshold,
            "criterion": criterion,
            "pairs_touching_holdout": len(crossing),
            "pairs_by_kind": dict(sorted(by_kind.items())),
            "leaking_pairs": len(leaking),
            "leaking_pairs_whose_non_holdout_end_is_quarantined": partner_quarantined,
            "leaking_pairs_whose_non_holdout_end_is_a_working_set_candidate": (
                partner_working_set
            ),
            "distinct_holdout_artworks_affected": len(affected),
            "distinct_holdout_artworks_affected_pct_of_413": round(
                100.0 * len(affected) / max(1, len(held_artwork_ids)), 2
            ),
            "distinct_files_to_quarantine": len(quarantine_files),
            "affected_holdout_artwork_ids": sorted(affected),
            "quarantine_file_paths": sorted(quarantine_files),
        }

    reports = {
        f"at_{NEAR_DUP_THRESHOLD}": report(NEAR_DUP_THRESHOLD, "primary"),
        f"at_{STRICT_THRESHOLD}": report(STRICT_THRESHOLD, "primary"),
        f"at_{NEAR_DUP_THRESHOLD}_any_arm": report(NEAR_DUP_THRESHOLD, "any_arm"),
        f"at_{STRICT_THRESHOLD}_any_arm": report(STRICT_THRESHOLD, "any_arm"),
    }

    # ---- what the superseded block claimed, next to what is true --------------
    old = census["holdout_crossing"]
    old_any = old[f"at_{NEAR_DUP_THRESHOLD}_any_arm"]
    new_any = reports[f"at_{NEAR_DUP_THRESHOLD}_any_arm"]
    still_held = [
        i for i in old_any["affected_holdout_artwork_ids"] if i in held_artwork_ids
    ]

    return {
        "what": "holdout-v2 re-annotation of near-dup-census.json. The census's "
        "own `holdout_crossing` block and `pairs[].side` labels were computed "
        "against holdout 1.0.0 and are SUPERSEDED by this file. The census's "
        "`pairs` array is holdout-independent and is NOT superseded.",
        "written_at": common.utc_now_iso(),
        "generated_by": "research/v3/oracle/embeddings/census_holdout_annotation.py",
        "supersedes": {
            "file": "research/v3/data/embeddings/near-dup-census.json",
            "sha256": sha256_of(CENSUS_PATH),
            "written_at": census["written_at"],
            "blocks": ["holdout_crossing", "pairs[].a.side", "pairs[].b.side"],
            "computed_against_holdout_version": CENSUS_EMBEDDED_HOLDOUT_VERSION,
            "not_superseded": [
                "pairs[].cosine",
                "pairs[].cosine_by_arm",
                "pairs[].found_by_arms",
                "pairs[].a.path / .artwork_id / .collection",
                "pairs[].b.path / .artwork_id / .collection",
                "counts",
                "named_components",
            ],
            "why_the_census_was_not_regenerated": "its sha256 is pinned as live "
            "evidence in holdout.json (header.nearDuplicateCensus.sha256), "
            "coverage-set-1.json (header.inputs) and decisions.json "
            "(d-2026-08-02-holdout-v2-redraw), and asserted at build time by "
            "src/coverage-set/build-coverage-set.ts. Rewriting the bytes would "
            "break three pins, two of them in other workstreams' owned paths, to "
            "add information that belongs beside the evidence rather than inside "
            "it.",
        },
        "holdout": {
            "file": "research/v3/data/holdout/holdout.json",
            "sha256": sha256_of(HOLDOUT_PATH),
            # `scriptVersion` is what freeze-holdout.ts stamps ("2.0.0").
            "version": holdout["header"].get("scriptVersion"),
            "supersedes": holdout["header"].get("supersedes"),
            "artworks": len(held_artwork_ids),
            "files": len(held_files),
            "quarantined_artwork_ids": sorted(quarantined_ids),
        },
        "disagreement_with_the_superseded_block": {
            "note": "how far the embedded labels are from the truth today. "
            "Recomputed from the census's own pairs, so it is a property of the "
            "two holdout lists and not of any re-scan.",
            "pair_endpoints_total": 2 * len(pairs),
            "music_artworks_endpoints": music_endpoints,
            "music_artworks_endpoints_whose_side_label_is_wrong": (
                disagreeing_endpoints
            ),
            "music_artworks_endpoints_wrong_pct": round(
                100.0 * disagreeing_endpoints / max(1, music_endpoints), 2
            ),
            "pairs_with_at_least_one_wrong_side_label": sum(
                1 for c in corrected if c["changed"]
            ),
            "superseded_at_0.95_any_arm_headline": {
                "leaking_pairs": old_any["leaking_pairs"],
                "distinct_holdout_artworks_affected": old_any[
                    "distinct_holdout_artworks_affected"
                ],
                "distinct_files_to_quarantine": old_any["distinct_files_to_quarantine"],
            },
            "current_at_0.95_any_arm_headline": {
                "leaking_pairs": new_any["leaking_pairs"],
                "distinct_holdout_artworks_affected": new_any[
                    "distinct_holdout_artworks_affected"
                ],
                "distinct_files_to_quarantine": new_any["distinct_files_to_quarantine"],
            },
            "ids_listed_as_affected_holdout_artworks_that_are_held_out_today": len(
                still_held
            ),
            "ids_listed_as_affected_holdout_artworks_that_are_working_set_today": (
                len(old_any["affected_holdout_artwork_ids"]) - len(still_held)
            ),
        },
        "holdout_crossing": reports,
        "corrected_sides": {
            "note": "index is the position in near-dup-census.json `pairs`. `a` "
            "and `b` are the side labels as of the holdout pinned above; "
            "`changed` is true where at least one differs from the label stored "
            "in the census.",
            "pairs": corrected,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="exit non-zero if the sidecar on disk is missing or stale "
        "(census or holdout sha256 moved) instead of rewriting it",
    )
    args = parser.parse_args()

    census = json.loads(CENSUS_PATH.read_text(encoding="utf-8"))
    holdout = json.loads(HOLDOUT_PATH.read_text(encoding="utf-8"))
    payload = build(census, holdout)

    if args.check:
        if not SIDECAR_PATH.exists():
            print(f"[annot] MISSING {SIDECAR_PATH}")
            return 1
        on_disk = json.loads(SIDECAR_PATH.read_text(encoding="utf-8"))
        stale = []
        if on_disk["supersedes"]["sha256"] != payload["supersedes"]["sha256"]:
            stale.append("census sha256 moved")
        if on_disk["holdout"]["sha256"] != payload["holdout"]["sha256"]:
            stale.append("holdout sha256 moved")
        if on_disk["holdout_crossing"] != payload["holdout_crossing"]:
            stale.append("recomputed holdout_crossing differs")
        if stale:
            print("[annot] STALE: " + "; ".join(stale))
            return 1
        print("[annot] sidecar is current")
        return 0

    SIDECAR_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"[annot] wrote {SIDECAR_PATH}")
    dis = payload["disagreement_with_the_superseded_block"]
    print(
        f"[annot] superseded side labels wrong on "
        f"{dis['music_artworks_endpoints_whose_side_label_is_wrong']}"
        f"/{dis['music_artworks_endpoints']} music-artworks endpoints "
        f"({dis['music_artworks_endpoints_wrong_pct']}%)"
    )
    for key, rep in payload["holdout_crossing"].items():
        print(
            f"[annot] {key}: {rep['leaking_pairs']} leaking pairs "
            f"({rep['leaking_pairs_whose_non_holdout_end_is_quarantined']} onto "
            f"quarantined non-candidates, "
            f"{rep['leaking_pairs_whose_non_holdout_end_is_a_working_set_candidate']} "
            f"onto working-set candidates), "
            f"{rep['distinct_holdout_artworks_affected']} holdout artworks"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
