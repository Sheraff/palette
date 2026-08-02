"""Census of near-duplicate pairs that cross artwork-id boundaries.

Why this exists. The ground truth for "same artwork" is filename-derived: a
24-character suffix in the sharded corpus, a 32-hex stem in music-artworks. That
identifies renditions of one file, and nothing else. It does not know about
reissues, regional variants, deluxe editions, template artwork, or the same cover
re-fetched under a different hash -- all of which are pixel-near-identical and all
of which leak across any split drawn on artwork id.

This script measures that leak. It finds every pair of files whose cosine
similarity is at or above a threshold but whose artwork ids differ, then crosses
the result against the frozen holdout to count how much of the holdout is
compromised.

Determinism. Cosines are computed in float64 and rounded before thresholding, and
the output is sorted. numpy on Apple Silicon uses Accelerate, whose reduction
order is not fixed, so an unrounded comparison against a threshold can include or
exclude a borderline pair from run to run.

Scope. The census is computed per arm and then combined, so "is this pair real or
is it one model's artifact?" is answered with a measurement rather than assumed.

Usage:
  .venv/bin/python near_dup_census.py
  .venv/bin/python near_dup_census.py --primary-arm dinov2-vitl14
"""

from __future__ import annotations

import os

# Single-threaded BLAS before numpy loads, for reproducibility (see module note).
for _blas_var in (
    "OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS",
    "VECLIB_MAXIMUM_THREADS", "NUMEXPR_NUM_THREADS",
):
    os.environ.setdefault(_blas_var, "1")

import argparse
import json
from collections import defaultdict
from pathlib import Path

import config
import common
import eval_pairs
import gallery

# [REVIEWED] Primary census threshold. 0.95 is well above the corpus's own
# similarity scale on every finalist (mean pairwise cosine 0.065-0.367) and was
# the level at which spot checks showed genuinely the same picture rather than
# merely the same genre of picture.
NEAR_DUP_THRESHOLD = 0.95

# [REVIEWED] Stricter near-identity bar, reported alongside so the reviewer can
# see how the size of any remedy scales with the threshold.
STRICT_THRESHOLD = 0.98

# [MEASURED] Decimal places cosines are rounded to before thresholding. float64
# reduction noise over a 1024-length dot product is ~1e-13, so rounding at 1e-6
# is far above the noise and far below any meaningful similarity difference.
COSINE_ROUND_DECIMALS = 6

# [REVIEWED] Rows per block in the pairwise scan. 2048 x 16145 float64 is ~265 MB
# per block, which keeps peak memory modest on any machine.
SCAN_BLOCK_ROWS = 2048

# [REVIEWED] Connected components at or above this size are called out by name in
# the census. A component this large is a template or a heavily reissued cover,
# not an incidental pair.
NAMED_COMPONENT_MIN_SIZE = 8

HOLDOUT_PATH = config.REPO_ROOT / "research" / "v3" / "data" / "holdout" / "holdout.json"
CENSUS_FILENAME = "near-dup-census.json"


def load_pool(out_dir: Path, arm_tag: str):
    """All embedded files of both collections, as one float64 matrix."""
    import numpy as np
    import query as query_mod

    blocks, rows = [], []
    for collection in config.COLLECTIONS:
        matrix, index = query_mod.load_collection(out_dir, collection, arm_tag)
        blocks.append(matrix)
        rows.extend(index)
    pool = np.ascontiguousarray(np.concatenate(blocks, axis=0), dtype="float64")
    return pool, rows


def scan_pairs(pool, artwork_ids, threshold: float):
    """Every i<j pair at or above `threshold` whose artwork ids differ.

    Returns {(i, j): rounded_cosine} plus the count of same-artwork pairs seen,
    which is the context number: how many duplicates the ground truth DOES know.
    """
    import numpy as np

    crossing: dict[tuple[int, int], float] = {}
    same_artwork_pairs = 0
    n = pool.shape[0]

    for start in range(0, n, SCAN_BLOCK_ROWS):
        block = pool[start : start + SCAN_BLOCK_ROWS] @ pool.T
        np.round(block, COSINE_ROUND_DECIMALS, out=block)
        for row in range(block.shape[0]):
            i = start + row
            hits = np.flatnonzero(block[row] >= threshold)
            hits = hits[hits > i]
            if hits.size == 0:
                continue
            same_mask = artwork_ids[hits] == artwork_ids[i]
            same_artwork_pairs += int(same_mask.sum())
            for j in hits[~same_mask]:
                crossing[(i, int(j))] = float(block[row][int(j)])
    return crossing, same_artwork_pairs


def connected_components(pairs, node_count: int):
    """Union-find over the near-dup graph, so clusters of copies are visible."""
    parent = list(range(node_count))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i, j in pairs:
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[max(ri, rj)] = min(ri, rj)

    groups = defaultdict(list)
    for node in {n for pair in pairs for n in pair}:
        groups[find(node)].append(node)
    return {root: sorted(members) for root, members in groups.items()}


def main() -> int:
    import numpy as np

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", default=str(config.DATA_DIR))
    parser.add_argument("--primary-arm", default=config.ARM_DINOV2,
                        choices=list(config.ARMS))
    parser.add_argument("--arms", nargs="+", default=list(gallery.FINALIST_ARMS),
                        choices=list(config.ARMS))
    args = parser.parse_args()
    out_dir = Path(args.out_dir).resolve()

    # ---- corpus and identity -------------------------------------------------
    pool, rows = load_pool(out_dir, args.primary_arm)
    paths = [record["path"] for record in rows]
    index_of_path = {path: i for i, path in enumerate(paths)}
    keys = [gallery.artwork_key(record["collection"], record["path"]) for record in rows]
    key_ids = {key: n for n, key in enumerate(dict.fromkeys(keys))}
    artwork_ids = np.array([key_ids[key] for key in keys])
    print(f"[census] pool {pool.shape[0]} files, {len(key_ids)} distinct artwork ids")

    # ---- per-arm scans -------------------------------------------------------
    per_arm: dict[str, dict] = {}
    same_counts: dict[str, int] = {}
    for arm_tag in args.arms:
        matrix = pool if arm_tag == args.primary_arm else load_pool(out_dir, arm_tag)[0]
        crossing, same = scan_pairs(matrix, artwork_ids, NEAR_DUP_THRESHOLD)
        per_arm[arm_tag] = crossing
        same_counts[arm_tag] = same
        print(
            f"[census] {arm_tag:16s} crossing pairs >= {NEAR_DUP_THRESHOLD}: "
            f"{len(crossing):6d}   (same-artwork pairs: {same})"
        )
        if arm_tag != args.primary_arm:
            del matrix

    primary = per_arm[args.primary_arm]
    union = sorted(set().union(*(set(p) for p in per_arm.values())))
    intersection = set(primary)
    for arm_tag, crossing in per_arm.items():
        intersection &= set(crossing)

    # Cosine of every union pair under every arm, so the record is comparable.
    left = np.array([i for i, _ in union])
    right = np.array([j for _, j in union])
    cos_by_arm: dict[str, "np.ndarray"] = {}
    for arm_tag in args.arms:
        matrix = pool if arm_tag == args.primary_arm else load_pool(out_dir, arm_tag)[0]
        values = (matrix[left] * matrix[right]).sum(axis=1)
        cos_by_arm[arm_tag] = np.round(values, COSINE_ROUND_DECIMALS)
        if arm_tag != args.primary_arm:
            del matrix

    # ---- holdout -------------------------------------------------------------
    holdout = json.loads(HOLDOUT_PATH.read_text(encoding="utf-8"))
    held_artwork_ids = {entry["id"] for entry in holdout["artworks"]}
    held_files = {
        file_entry["path"]
        for entry in holdout["artworks"]
        for file_entry in entry["files"]
    }
    held_rows = {index_of_path[p] for p in held_files if p in index_of_path}
    print(
        f"[census] holdout: {len(held_artwork_ids)} artworks, {len(held_files)} files, "
        f"{len(held_rows)} of them embedded"
    )

    def side_of(row_index: int) -> str:
        if row_index in held_rows:
            return "holdout"
        return (
            "working_set"
            if rows[row_index]["collection"] == config.COLLECTION_MUSIC_ARTWORKS
            else "sharded_corpus"
        )

    def holdout_report(threshold: float, criterion: str = "primary") -> dict:
        """criterion 'primary' = the primary arm's cosine clears the bar.
        criterion 'any_arm'  = ANY finalist's cosine clears it.

        Both are reported because spot checks at the 0.95 boundary found true
        duplicates that only one of the three arms detected, so the primary-arm
        count is a floor and the any-arm count is the better estimate of the real
        leak."""
        crossing_pairs = []
        for position, (i, j) in enumerate(union):
            if criterion == "primary":
                value = cos_by_arm[args.primary_arm][position]
            else:
                value = max(cos_by_arm[a][position] for a in args.arms)
            if value < threshold:
                continue
            side_i, side_j = side_of(i), side_of(j)
            if "holdout" not in (side_i, side_j):
                continue
            if side_i == side_j == "holdout":
                kind = "holdout_to_holdout"
            else:
                kind = "holdout_to_" + (side_j if side_i == "holdout" else side_i)
            crossing_pairs.append((position, i, j, kind))

        leaking = [p for p in crossing_pairs if p[3] != "holdout_to_holdout"]
        affected_artworks = set()
        quarantine_files = set()
        for position, i, j, kind in leaking:
            for node in (i, j):
                if node in held_rows:
                    stem = eval_pairs.stem_of(rows[node]["path"])
                    match = eval_pairs.MUSIC_NAME_RE.match(stem)
                    affected_artworks.add(match.group(1) if match else stem)
                else:
                    quarantine_files.add(paths[node])
        by_kind: dict[str, int] = defaultdict(int)
        for _, _, _, kind in crossing_pairs:
            by_kind[kind] += 1
        return {
            "threshold": threshold,
            "criterion": criterion,
            "pairs_touching_holdout": len(crossing_pairs),
            "pairs_by_kind": dict(sorted(by_kind.items())),
            "leaking_pairs": len(leaking),
            "distinct_holdout_artworks_affected": len(affected_artworks),
            "distinct_holdout_artworks_affected_pct_of_414": round(
                100.0 * len(affected_artworks) / max(1, len(held_artwork_ids)), 2
            ),
            "distinct_files_to_quarantine": len(quarantine_files),
            "quarantine_files_by_collection": {
                collection: sum(
                    1
                    for path in quarantine_files
                    if rows[index_of_path[path]]["collection"] == collection
                )
                for collection in config.COLLECTIONS
            },
            "affected_holdout_artwork_ids": sorted(affected_artworks),
            "quarantine_file_paths": sorted(quarantine_files),
        }

    reports = {
        f"at_{NEAR_DUP_THRESHOLD}": holdout_report(NEAR_DUP_THRESHOLD),
        f"at_{STRICT_THRESHOLD}": holdout_report(STRICT_THRESHOLD),
        f"at_{NEAR_DUP_THRESHOLD}_any_arm": holdout_report(
            NEAR_DUP_THRESHOLD, "any_arm"
        ),
        f"at_{STRICT_THRESHOLD}_any_arm": holdout_report(STRICT_THRESHOLD, "any_arm"),
    }

    # ---- components ----------------------------------------------------------
    components = connected_components(list(primary), pool.shape[0])
    named = []
    for members in sorted(
        components.values(), key=lambda m: (-len(m), paths[m[0]])
    ):
        if len(members) < NAMED_COMPONENT_MIN_SIZE:
            continue
        artworks = sorted({keys[m] for m in members})
        named.append(
            {
                "files": len(members),
                "distinct_artwork_ids": len(artworks),
                "holdout_files": sum(1 for m in members if m in held_rows),
                "collections": sorted({rows[m]["collection"] for m in members}),
                "example_paths": [paths[m] for m in members[:6]],
            }
        )

    # ---- write ---------------------------------------------------------------
    pair_records = []
    for position, (i, j) in enumerate(union):
        pair_records.append(
            {
                "cosine": float(cos_by_arm[args.primary_arm][position]),
                "cosine_by_arm": {
                    arm_tag: float(cos_by_arm[arm_tag][position])
                    for arm_tag in args.arms
                },
                "found_by_arms": sorted(
                    arm for arm, crossing in per_arm.items() if (i, j) in crossing
                ),
                "a": {
                    "path": paths[i],
                    "artwork_id": keys[i],
                    "collection": rows[i]["collection"],
                    "side": side_of(i),
                },
                "b": {
                    "path": paths[j],
                    "artwork_id": keys[j],
                    "collection": rows[j]["collection"],
                    "side": side_of(j),
                },
            }
        )
    pair_records.sort(key=lambda r: (-r["cosine"], r["a"]["path"], r["b"]["path"]))

    payload = {
        "what": "pairs of files that are near-identical but carry DIFFERENT "
        "artwork ids, i.e. duplicates the filename-derived ground truth does not "
        "know about",
        "written_at": common.utc_now_iso(),
        "method": {
            "primary_arm": args.primary_arm,
            "primary_arm_rationale": "won the retrieval bake-off (R@1 0.7892); "
            "see bakeoff.json",
            "arms_scanned": list(args.arms),
            "scope_note": "the census is computed independently on each finalist "
            "and then combined, so cross-arm agreement is MEASURED here rather "
            "than assumed. Counts headlined elsewhere are the primary arm's; the "
            "union and intersection below say how arm-dependent that is.",
            "threshold": NEAR_DUP_THRESHOLD,
            "strict_threshold": STRICT_THRESHOLD,
            "similarity": "cosine; vectors are L2-normalized so this is a dot "
            "product",
            "determinism": f"float64 accumulation, cosines rounded to "
            f"{COSINE_ROUND_DECIMALS} decimals before thresholding, output sorted",
            "identity": "artwork id is the 24-char suffix (sharded) or 32-hex "
            "stem (music-artworks); pairs sharing an id are EXCLUDED as already "
            "known",
        },
        "counts": {
            "files_in_pool": int(pool.shape[0]),
            "distinct_artwork_ids": len(key_ids),
            "same_artwork_pairs_known_to_ground_truth": same_counts[args.primary_arm],
            "crossing_pairs_primary_arm": len(primary),
            "crossing_pairs_union_of_arms": len(union),
            "crossing_pairs_all_arms_agree": len(intersection),
            "per_arm_crossing_pairs": {
                arm: len(crossing) for arm, crossing in per_arm.items()
            },
            "undercount_vs_ground_truth_pct": round(
                100.0 * len(primary) / max(1, same_counts[args.primary_arm]), 1
            ),
            "distinct_files_involved_primary_arm": len(
                {n for pair in primary for n in pair}
            ),
        },
        "holdout_crossing": reports,
        "named_components": {
            "min_size": NAMED_COMPONENT_MIN_SIZE,
            "note": "connected components of the near-dup graph at the primary "
            "threshold. A large component with many distinct artwork ids is "
            "template artwork or a heavily reissued cover, not an incidental pair.",
            "components": named,
        },
        "pairs": pair_records,
    }

    census_path = out_dir / CENSUS_FILENAME
    census_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"[census] wrote {census_path} ({census_path.stat().st_size // 1024} KB)")

    for threshold_key, report in reports.items():
        print(
            f"[census] holdout {threshold_key}: {report['leaking_pairs']} leaking pairs, "
            f"{report['distinct_holdout_artworks_affected']} holdout artworks "
            f"({report['distinct_holdout_artworks_affected_pct_of_414']}%), "
            f"{report['distinct_files_to_quarantine']} files to quarantine"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
