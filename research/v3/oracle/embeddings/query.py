"""Nearest-neighbour lookup over the stored embeddings.

The vectors are L2-normalized on write, so cosine similarity is a plain dot
product (spec section 6.4). Used later for near-duplicate detection (spec section
6.1) and for turning a single bad palette output into a named failure class.

Usage:
  .venv/bin/python query.py --file 00/ab67616d0000....jpg --k 10
  .venv/bin/python query.py --file music-artworks/7/8/1/781....jpg \
      --search sharded music_artworks --k 10
  .venv/bin/python query.py --row 42 --collection sharded --k 5
  .venv/bin/python query.py --stats --arm dinov2-vitl14
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import config
import common


def load_collection(out_dir: Path, collection: str,
                    arm_tag: str = config.DEFAULT_ARM):
    """Return (matrix, rows) where rows[i] describes matrix[i].

    Reads the finalized .npy when it exists and falls back to the append-only
    shard file, so a partially-completed run is queryable without finalizing.
    """
    import numpy as np

    store = common.EmbeddingStore(out_dir, collection, arm_tag=arm_tag)
    rows = [
        record
        for record in common.read_jsonl(store.ids_path)
        if record.get("status") == "ok"
    ]
    rows.sort(key=lambda record: record["row"])

    if store.npy_path.exists():
        matrix = np.load(store.npy_path)
    elif store.shard_path.exists():
        flat = np.fromfile(store.shard_path, dtype="<f4")
        usable = (flat.size // store.dim) * store.dim
        matrix = flat[:usable].reshape(-1, store.dim)
    else:
        raise FileNotFoundError(
            f"no embeddings for {collection}/{arm_tag} under {out_dir}; "
            "run embed.py first"
        )

    if matrix.shape[0] < len(rows):
        raise RuntimeError(
            f"{collection}: {len(rows)} id rows but only {matrix.shape[0]} vectors"
        )
    matrix = matrix[: len(rows)]
    return matrix, rows


def embed_one(path: Path, device: str = "auto",
              arm_tag: str = config.DEFAULT_ARM):
    """Embed a file that is not in the corpus, using the pinned arm."""
    import numpy as np

    resolved = common.resolve_device(device)
    arm = common.load_arm(arm_tag, resolved)
    image = common.decode_image(path)
    return np.asarray(arm.encode([image.rgb])[0], dtype="float32")


def main() -> int:
    import numpy as np

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", default=str(config.DATA_DIR))
    parser.add_argument(
        "--arm", default=config.DEFAULT_ARM, choices=list(config.ARMS),
        help="which model arm's embeddings to search",
    )
    parser.add_argument("--file", help="repo-relative (or absolute) path to query by")
    parser.add_argument("--row", type=int, help="query by row index instead of path")
    parser.add_argument(
        "--collection", choices=list(config.COLLECTIONS),
        help="collection the --row belongs to",
    )
    parser.add_argument(
        "--search", nargs="+", default=list(config.COLLECTIONS),
        choices=list(config.COLLECTIONS), help="collections to search in",
    )
    parser.add_argument("--k", type=int, default=10)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--json", action="store_true", help="emit JSON lines")
    parser.add_argument("--stats", action="store_true", help="describe what is stored")
    args = parser.parse_args()

    out_dir = Path(args.out_dir).resolve()

    loaded = {}
    for collection in args.search:
        try:
            loaded[collection] = load_collection(out_dir, collection, args.arm)
        except FileNotFoundError as exc:
            print(f"[query] {exc}")

    if args.stats or (args.file is None and args.row is None):
        for collection, (matrix, rows) in loaded.items():
            norms = np.linalg.norm(matrix, axis=1) if matrix.shape[0] else np.array([0.0])
            store = common.EmbeddingStore(out_dir, collection, arm_tag=args.arm)
            failed = sum(
                1
                for record in common.read_jsonl(store.ids_path)
                if record.get("status") == "failed"
            )
            print(
                f"{collection} [{args.arm}]: {matrix.shape[0]} vectors x "
                f"{matrix.shape[1]} dims, "
                f"{failed} failed rows, "
                f"L2 norm min={norms.min():.6f} max={norms.max():.6f}"
            )
        return 0

    # Resolve the query vector.
    query_label = None
    query_vector = None
    if args.row is not None:
        if args.collection is None:
            parser.error("--row requires --collection")
        matrix, rows = loaded[args.collection]
        query_vector = matrix[args.row]
        query_label = f"{args.collection}#{args.row} {rows[args.row]['path']}"
    else:
        target = args.file
        for collection, (matrix, rows) in loaded.items():
            for index, record in enumerate(rows):
                if record["path"] == target or record["path"].endswith("/" + target):
                    query_vector = matrix[index]
                    query_label = f"{collection}#{index} {record['path']}"
                    break
            if query_vector is not None:
                break
        if query_vector is None:
            candidate = Path(target)
            if not candidate.is_absolute():
                candidate = config.REPO_ROOT / target
            if not candidate.exists():
                parser.error(f"{target} is neither a stored row nor a readable file")
            print(f"[query] {target} is not in the store; embedding it now", flush=True)
            query_vector = embed_one(candidate, args.device, args.arm)
            query_label = f"(ad hoc) {target}"

    results = []
    for collection, (matrix, rows) in loaded.items():
        if matrix.shape[0] == 0:
            continue
        sims = matrix @ query_vector
        take = min(args.k + 1, sims.shape[0])
        top = np.argpartition(-sims, take - 1)[:take]
        top = top[np.argsort(-sims[top])]
        for index in top:
            results.append((float(sims[index]), collection, rows[index]))

    results.sort(key=lambda item: -item[0])
    results = results[: args.k + 1]

    if args.json:
        for similarity, collection, record in results:
            print(json.dumps({"similarity": similarity, "collection": collection, **record}))
    else:
        print(f"query: {query_label}")
        for similarity, collection, record in results:
            print(
                f"  {similarity:+.4f}  {collection:>14}  row {record['row']:>6}  "
                f"{record['path']}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
