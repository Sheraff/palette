"""Fresh-shard import drill probe (loose end A11), 2026-08-04.

Answers three questions about a freshly imported shard, WITHOUT touching any
committed artifact:

  1. near-duplicates — max cosine of every fresh vector against the pinned
     16,145-file pool, counted at the census thresholds (0.95 / 0.98);
  2. internal near-duplicates — the same scan inside the fresh shard, which is
     where the 300 px / 640 px rendition pairs of one artwork show up;
  3. cluster placement — the fresh vectors assigned to the nearest centroid of
     the pinned gallery clustering, reproduced from its seed.

Why the clustering is REPRODUCED rather than loaded: `gallery.py` never
serializes centroids (data/embeddings/gallery/summary.json stores cluster
statistics only), so the only way to ask "where does this land" is to re-derive
the same k-means from KMEANS_SEED over the same pool and assign into it. That
is exact, not approximate, because the run is deterministic given the seed --
but it also means this probe is O(full corpus) rather than O(new files).

Output is a JSON report; nothing here writes to data/embeddings/.

  .venv/bin/python fresh_shard_probe.py \
      --fresh-dir ../../data/embeddings-fresh-15 \
      --collection sharded_fresh_15 \
      --out ../../data/embeddings-fresh-15/fresh-shard-probe.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

import common
import config
import gallery
import near_dup_census
import query as query_mod


def load_fresh(fresh_dir: Path, collection: str, arm: str):
    matrix, index = query_mod.load_collection(fresh_dir, collection, arm)
    return np.ascontiguousarray(matrix, dtype="float32"), index


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fresh-dir", required=True)
    parser.add_argument("--collection", default=config.COLLECTION_SHARDED_FRESH_15)
    parser.add_argument("--arm", default="dinov2-vitl14")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    fresh_dir = Path(args.fresh_dir).resolve()
    pinned_dir = config.DATA_DIR

    # ---- the pinned pool, in the exact order gallery.cluster_arm builds it ----
    blocks, pool_rows = [], []
    for collection in config.COLLECTIONS:
        matrix, index = query_mod.load_collection(pinned_dir, collection, args.arm)
        blocks.append(matrix)
        pool_rows.extend(index)
    pool = np.ascontiguousarray(np.concatenate(blocks, axis=0), dtype="float32")
    print(f"[probe] pinned pool {pool.shape}", flush=True)

    fresh, fresh_rows = load_fresh(fresh_dir, args.collection, args.arm)
    print(f"[probe] fresh {fresh.shape}", flush=True)

    # ---- 1. cross near-duplicates: fresh vs pinned pool ----
    # Both sides are L2-normalized by the encoder, so the dot product IS cosine.
    sims = fresh.astype("float64") @ pool.astype("float64").T
    best_idx = sims.argmax(axis=1)
    best_sim = sims[np.arange(sims.shape[0]), best_idx]
    best_sim = np.round(best_sim, near_dup_census.COSINE_ROUND_DECIMALS)

    cross = []
    for row in range(fresh.shape[0]):
        cross.append({
            "fresh_path": fresh_rows[row]["path"],
            "nearest_pinned_path": pool_rows[int(best_idx[row])]["path"],
            "cosine": float(best_sim[row]),
        })
    cross_sorted = sorted(cross, key=lambda r: -r["cosine"])

    n_cross_095 = int((best_sim >= near_dup_census.NEAR_DUP_THRESHOLD).sum())
    n_cross_098 = int((best_sim >= near_dup_census.STRICT_THRESHOLD).sum())

    # ---- 2. internal near-duplicates inside the fresh shard ----
    self_sims = fresh.astype("float64") @ fresh.astype("float64").T
    np.fill_diagonal(self_sims, -1.0)
    self_sims = np.round(self_sims, near_dup_census.COSINE_ROUND_DECIMALS)
    iu = np.triu_indices(fresh.shape[0], k=1)
    pair_sims = self_sims[iu]
    internal_pairs = []
    for pos in np.flatnonzero(pair_sims >= near_dup_census.NEAR_DUP_THRESHOLD):
        a, b = int(iu[0][pos]), int(iu[1][pos])
        pa, pb = fresh_rows[a]["path"], fresh_rows[b]["path"]
        internal_pairs.append({
            "a": pa,
            "b": pb,
            "cosine": float(pair_sims[pos]),
            # Same 24-char artwork id at two rendition prefixes is an expected
            # pair, not a corpus defect (corpus.ts shardedArtworkId).
            "same_artwork_id": Path(pa).stem[16:] == Path(pb).stem[16:],
        })
    internal_pairs.sort(key=lambda r: -r["cosine"])

    # ---- 3. cluster placement against the reproduced pinned clustering ----
    assignments, centers, _distances, iterations = gallery.kmeans(
        pool, gallery.KMEANS_K, gallery.KMEANS_SEED, gallery.KMEANS_MAX_ITERS
    )
    print(f"[probe] reproduced clustering in {iterations} iterations", flush=True)

    centers64 = np.ascontiguousarray(centers, dtype="float64")
    scores = fresh.astype("float64") @ centers64.T
    scores *= 2.0
    scores -= (centers64 ** 2).sum(axis=1)[None, :]
    row_best = scores.max(axis=1, keepdims=True)
    tied = scores >= (row_best - gallery.ASSIGNMENT_TIE_MARGIN)
    fresh_cluster = np.argmax(tied, axis=1).astype("int32")

    # Cosine to the assigned centroid, the same quantity coverage-set-1.json
    # reports per artwork, so the two are directly comparable.
    unit = centers64 / np.linalg.norm(centers64, axis=1, keepdims=True)
    fresh_cos_centroid = (fresh.astype("float64") * unit[fresh_cluster]).sum(axis=1)
    pinned_cos_centroid = (pool.astype("float64") * unit[assignments]).sum(axis=1)

    pinned_sizes = np.bincount(assignments, minlength=gallery.KMEANS_K)
    fresh_sizes = np.bincount(fresh_cluster, minlength=gallery.KMEANS_K)

    per_cluster = []
    for index in range(gallery.KMEANS_K):
        members = fresh_cos_centroid[fresh_cluster == index]
        per_cluster.append({
            "cluster": index,
            "pinned_members": int(pinned_sizes[index]),
            "fresh_members": int(fresh_sizes[index]),
            "fresh_share_pct": round(
                100.0 * fresh_sizes[index] / max(1, fresh.shape[0]), 2
            ),
            "pinned_share_pct": round(
                100.0 * pinned_sizes[index] / pool.shape[0], 2
            ),
            "fresh_mean_cos_to_centroid": (
                round(float(members.mean()), 6) if members.size else None
            ),
        })

    report = {
        "drill": "fresh-shard-import-A11",
        "written_at": common.utc_now_iso(),
        "arm": args.arm,
        "collection": args.collection,
        "fresh_dir": str(fresh_dir),
        "pinned_pool": {
            "rows": int(pool.shape[0]),
            "collections": list(config.COLLECTIONS),
        },
        "fresh_rows": int(fresh.shape[0]),
        "thresholds": {
            "near_dup": near_dup_census.NEAR_DUP_THRESHOLD,
            "strict": near_dup_census.STRICT_THRESHOLD,
        },
        "cross_near_duplicates": {
            "at_0.95": n_cross_095,
            "at_0.98": n_cross_098,
            "max_cosine": float(best_sim.max()),
            "mean_max_cosine": round(float(best_sim.mean()), 6),
            "median_max_cosine": round(float(np.median(best_sim)), 6),
            "top_20": cross_sorted[:20],
        },
        "internal_near_duplicates": {
            "pairs_at_0.95": len(internal_pairs),
            "pairs_same_artwork_id": sum(
                1 for p in internal_pairs if p["same_artwork_id"]
            ),
            "pairs_different_artwork_id": sum(
                1 for p in internal_pairs if not p["same_artwork_id"]
            ),
            "all_pairs": internal_pairs,
        },
        "cluster_placement": {
            "k": gallery.KMEANS_K,
            "seed": gallery.KMEANS_SEED,
            "reproduced_iterations": iterations,
            "clusters_receiving_fresh_files": int((fresh_sizes > 0).sum()),
            "clusters_empty_of_fresh_files": int((fresh_sizes == 0).sum()),
            "fresh_mean_cos_to_centroid": round(float(fresh_cos_centroid.mean()), 6),
            "pinned_mean_cos_to_centroid": round(float(pinned_cos_centroid.mean()), 6),
            "fresh_min_cos_to_centroid": round(float(fresh_cos_centroid.min()), 6),
            "per_cluster": per_cluster,
        },
    }

    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"[probe] wrote {out_path}", flush=True)

    print(
        f"[probe] cross >=0.95: {n_cross_095}  >=0.98: {n_cross_098}  "
        f"max {best_sim.max():.6f}"
    )
    print(
        f"[probe] internal pairs >=0.95: {len(internal_pairs)} "
        f"({report['internal_near_duplicates']['pairs_same_artwork_id']} same artwork id)"
    )
    print(
        f"[probe] clusters receiving fresh files: "
        f"{report['cluster_placement']['clusters_receiving_fresh_files']}/{gallery.KMEANS_K}"
    )
    print(
        f"[probe] mean cos to centroid  fresh {fresh_cos_centroid.mean():.4f}  "
        f"pinned {pinned_cos_centroid.mean():.4f}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
