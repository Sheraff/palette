"""What the bake-off's headline R@1 does and does not measure.

Why this exists (adversarial review 2026-08-03, MINOR-5 and MINOR-6). The
bake-off scores "same artwork, different rendition" retrieval over 24,648
ordered pairs and reports one number per arm. Two facts about the pair set are
not visible in `bakeoff.json`:

  * **A floor.** 246 pairs join two files with the SAME sha256 -- identical
    bytes stored twice under different rendition names. Every one is rank 1 by
    construction; no model can fail them. They inflate every arm's R@1 equally
    by about 0.21 pp.
  * **A stratum.** 1,986 pairs join two files of identical measured width and
    height. A re-encode at the same size is still a different rendition, so they
    belong in the task -- but the bake-off is read as a resolution-robustness
    instrument (it is what settles the 224-vs-392 confound), and on the strictly
    cross-resolution pairs it is meaningfully weaker.

Neither changes a ranking: both affect all arms identically. Both change how the
number should be read.

WHY A SIDECAR. `bakeoff.json`'s sha256 is pinned as live evidence in
`data/decisions/decisions.json` under `d-2026-08-02-embedding-canonical-model`.
Regenerating it to add this block would break that pin, so the measurement goes
beside the artifact. `eval_pairs.py` now carries the same text in
`method.floors_and_strata`, so any FUTURE bake-off states it inline.

No GPU: stored `.npy` vectors and the sha256/width/height already recorded in
the ids files. Runs in a couple of minutes per arm.

Usage:
  .venv/bin/python bakeoff_strata.py
  .venv/bin/python bakeoff_strata.py --arms dinov2-vitl14 pe-core-l14
"""

from __future__ import annotations

import os

# Single-threaded BLAS before numpy loads, matching eval_pairs.py's contract.
for _blas_var in (
    "OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS",
    "VECLIB_MAXIMUM_THREADS", "NUMEXPR_NUM_THREADS",
):
    os.environ.setdefault(_blas_var, "1")

import argparse
import hashlib
import json
from pathlib import Path

import config
import common
import eval_pairs

SIDECAR_FILENAME = "bakeoff-strata.json"


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def file_metadata(out_dir: Path, arm_tag: str) -> dict:
    """path -> (sha256, width, height), straight out of the ids index.

    The sha256 is of the FILE, recorded by embed.py when it read the bytes, so
    "identical bytes" here is a byte-level fact and not an image comparison.
    """
    meta = {}
    for collection in config.COLLECTIONS:
        store = common.EmbeddingStore(out_dir, collection, arm_tag=arm_tag)
        for record in common.read_jsonl(store.ids_path):
            if record.get("status") == "ok":
                meta[record["path"]] = (
                    record["sha256"],
                    record.get("width"),
                    record.get("height"),
                )
    return meta


def measure(out_dir: Path, arm_tag: str, truth: dict) -> dict:
    import numpy as np

    meta = file_metadata(out_dir, arm_tag)
    report = eval_pairs.evaluate_arm(out_dir, arm_tag, truth, return_pairs=True)
    pair_ranks = report["pair_ranks"]

    ranks, identical, same_res = [], [], []
    identical_files: set[str] = set()
    identical_artworks: set[str] = set()
    for (_collection, query, target), rank in pair_ranks.items():
        q_sha, q_w, q_h = meta[query]
        t_sha, t_w, t_h = meta[target]
        ranks.append(rank)
        is_identical = q_sha == t_sha
        identical.append(is_identical)
        same_res.append(q_w == t_w and q_h == t_h)
        if is_identical:
            identical_files.update((query, target))
            identical_artworks.add(eval_pairs.stem_of(query)[:32])

    ranks = np.array(ranks)
    identical = np.array(identical)
    same_res = np.array(same_res)
    hit = ranks <= 1
    total = int(ranks.size)

    return {
        "arm": arm_tag,
        "pairs": total,
        "recall@1_published_shape": float(report["overall"]["recall@1"]),
        "recall@1_all_pairs": float(hit.mean()),
        "identical_bytes": {
            "pairs": int(identical.sum()),
            "pct_of_pairs": round(100.0 * int(identical.sum()) / total, 4),
            "distinct_files": len(identical_files),
            "distinct_artworks": len(identical_artworks),
            "all_rank_1": bool(hit[identical].all()) if identical.any() else None,
            "recall@1_excluding_them": float(hit[~identical].mean()),
            "headline_inflation_pp": round(
                100.0 * (float(hit.mean()) - float(hit[~identical].mean())), 4
            ),
        },
        "resolution_strata": {
            "same_resolution_pairs": int(same_res.sum()),
            "same_resolution_pct": round(100.0 * int(same_res.sum()) / total, 4),
            "recall@1_same_resolution": float(hit[same_res].mean()),
            "recall@1_cross_resolution": float(hit[~same_res].mean()),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", default=str(config.DATA_DIR))
    parser.add_argument("--arms", nargs="+", default=[config.ARM_DINOV2],
                        choices=list(config.ARMS))
    args = parser.parse_args()
    out_dir = Path(args.out_dir).resolve()

    truth, _diagnostics = eval_pairs.build_ground_truth()
    arms = {}
    for arm_tag in args.arms:
        print(f"[strata] measuring {arm_tag} ...", flush=True)
        arms[arm_tag] = measure(out_dir, arm_tag, truth)

    bakeoff_path = out_dir / config.BAKEOFF_FILENAME
    payload = {
        "what": "floors and strata inside the bake-off's pair set. Annotates "
        "bakeoff.json without rewriting it.",
        "written_at": common.utc_now_iso(),
        "generated_by": "research/v3/oracle/embeddings/bakeoff_strata.py",
        "annotates": {
            "file": "research/v3/data/embeddings/bakeoff.json",
            "sha256": sha256_of(bakeoff_path),
            "why_not_written_into_it": "the bake-off's sha256 is pinned as live "
            "evidence in data/decisions/decisions.json under "
            "d-2026-08-02-embedding-canonical-model. Rewriting the file to add "
            "this block would break that pin. eval_pairs.py now carries the same "
            "text in method.floors_and_strata, so any future bake-off states it "
            "inline.",
        },
        "reading": {
            "identical_bytes": "pairs of files with the same sha256. Rank 1 by "
            "construction — a floor under every arm, not a measurement of any.",
            "resolution_strata": "pairs whose two files have identical measured "
            "width and height. Still different renditions, but not a resolution "
            "change; the cross-resolution figure is the resolution-robustness "
            "reading of this instrument.",
            "affects_rankings": "no. Both slices affect every arm identically; "
            "the arm order and every conclusion in "
            "d-2026-08-02-embedding-canonical-model are unchanged.",
        },
        "arms": arms,
    }
    path = out_dir / SIDECAR_FILENAME
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"[strata] wrote {path}")
    for arm_tag, row in arms.items():
        ident = row["identical_bytes"]
        res = row["resolution_strata"]
        print(
            f"[strata] {arm_tag}: R@1 {row['recall@1_all_pairs']:.5f} -> "
            f"{ident['recall@1_excluding_them']:.5f} without "
            f"{ident['pairs']} identical-byte pairs; same-res "
            f"{res['recall@1_same_resolution']:.4f} vs cross-res "
            f"{res['recall@1_cross_resolution']:.4f}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
