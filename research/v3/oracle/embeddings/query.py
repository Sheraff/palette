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


def collection_provenance(out_dir: Path, collection: str,
                          arm_tag: str = config.DEFAULT_ARM) -> dict:
    """Where this collection's vectors come from, and whether it is complete.

    Why (adversarial review 2026-08-03, MINOR-12): `load_collection` falls back
    to the append-only shard file when the finalized `.npy` is absent, so a
    half-finished arm loads and clusters exactly like a finished one, and the
    pool size printed in a gallery header reads as authoritative. Two arms
    clustered at different pool sizes produce side-by-side pages that are not
    comparable, and nothing said so. Every caller that shows or stores a pool
    size should carry this dict alongside it.
    """
    store = common.EmbeddingStore(out_dir, collection, arm_tag=arm_tag)
    ok_rows = failed_rows = 0
    if store.ids_path.exists():
        for record in common.read_jsonl(store.ids_path):
            status = record.get("status")
            if status == "ok":
                ok_rows += 1
            elif status == "failed":
                failed_rows += 1
    try:
        expected = len(common.enumerate_collection(collection))
        expected_source = "enumerated"
    except common.CorpusSizeMismatch as exc:
        expected = config.EXPECTED_FILE_COUNTS.get(collection)
        expected_source = f"pinned (corpus drift: {exc})"
    except FileNotFoundError:
        expected = config.EXPECTED_FILE_COUNTS.get(collection)
        expected_source = "pinned (collection directory missing)"

    if store.npy_path.exists():
        source = "npy"
    elif store.shard_path.exists():
        source = "append-only shard (RUN NOT FINALIZED)"
    else:
        source = "missing"

    resolved = ok_rows + failed_rows
    return {
        "collection": collection,
        "arm": arm_tag,
        "vector_source": source,
        "ok_rows": ok_rows,
        "failed_rows": failed_rows,
        "expected_files": expected,
        "expected_source": expected_source,
        "complete": expected is not None and resolved == expected,
    }


def require_complete(out_dir: Path, collections, arm_tag: str,
                     allow_partial: bool = False) -> list[dict]:
    """Provenance for each collection, raising unless every one is complete.

    `allow_partial` downgrades the failure to a printed warning, so an
    exploratory query on a running embed job stays possible — but it is an
    explicit act, and the caller is expected to record the returned dicts in
    whatever artifact it writes.
    """
    provenance = [
        collection_provenance(out_dir, collection, arm_tag)
        for collection in collections
    ]
    partial = [p for p in provenance if not p["complete"]]
    if partial:
        detail = "; ".join(
            f"{p['collection']}/{p['arm']}: {p['ok_rows']}+{p['failed_rows']} of "
            f"{p['expected_files']} files resolved, from {p['vector_source']}"
            for p in partial
        )
        if not allow_partial:
            raise RuntimeError(
                "refusing to compute over a partial pool — " + detail + ". "
                "Finish embed.py, or pass the caller's --allow-partial and "
                "accept that the result is not comparable with any other arm."
            )
        print(f"[query] WARNING partial pool: {detail}", flush=True)
    return provenance


def load_collection(out_dir: Path, collection: str,
                    arm_tag: str = config.DEFAULT_ARM):
    """Return (matrix, rows) where rows[i] describes matrix[i].

    Reads the finalized .npy when it exists and falls back to the append-only
    shard file, so a partially-completed run is queryable without finalizing.
    Completeness is NOT checked here — call `collection_provenance` or
    `require_complete` for that; this stays permissive because `embed.py`'s own
    resume path depends on loading a half-written store.
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
    unavailable: list[dict] = []
    for collection in args.search:
        try:
            loaded[collection] = load_collection(out_dir, collection, args.arm)
        except FileNotFoundError as exc:
            print(f"[query] {exc}")
            unavailable.append({"collection": collection, "reason": str(exc)})

    # The pool actually searched, stated whenever a result is emitted. Silently
    # searching a reduced pool and reporting the hits as if they came from the
    # whole corpus is the failure this reports (review 2026-08-03, MINOR-12).
    provenance = [
        collection_provenance(out_dir, collection, args.arm)
        for collection in loaded
    ]
    pool_note = {
        "arm": args.arm,
        "collections_requested": list(args.search),
        "collections_searched": list(loaded),
        "collections_unavailable": unavailable,
        "complete_pool": bool(loaded)
        and not unavailable
        and all(p["complete"] for p in provenance)
        and set(loaded) == set(config.COLLECTIONS),
        "per_collection": provenance,
    }
    if not pool_note["complete_pool"]:
        print(
            "[query] WARNING searching a REDUCED pool: "
            + json.dumps(pool_note["per_collection"])
            + f" unavailable={unavailable}",
            flush=True,
        )

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
        # First line describes the pool, so a consumer of the JSON can never
        # mistake a partial search for a full one.
        print(json.dumps({"pool": pool_note}))
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
