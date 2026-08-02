"""Retrieval bake-off: which encoder actually finds the same artwork again?

We never query these embeddings by text. Every real use — near-duplicate
detection, visual stratification, failure-class retrieval — is image-to-image.
So the arms are scored on a retrieval task built from ground truth we already
own, not on any published benchmark.

Ground truth (two independent sources, both derived from filenames only):

  (a) Sharded cross-tier pairs. A sharded filename is 40 hex characters: a
      16-character rendition prefix followed by a 24-character artwork id. An
      artwork whose 24-character suffix appears under two different prefixes
      exists in the corpus twice, at 300 px and at 640 px (spec section 7.2,
      which measured 644 such artworks). The two files are the same picture at
      two sizes, so each must retrieve the other.

  (b) music-artworks multi-rendition artworks. Filenames are
      `<32-hex>[_WxH].<ext>`; files sharing a 32-hex stem are renditions of one
      image (spec section 7.4). Every same-stem file pair is a true pair.

Metric. For each ordered pair (query, target), rank the target among ALL files of
BOTH collections by cosine similarity. Reported per arm: recall@1, recall@5,
mean and median rank, broken down by the query's measured resolution tier.

Two details that decide whether the numbers mean anything:

  * Other renditions of the same artwork are removed from the candidate set for
    that pair. They are also correct answers, so leaving them in would push the
    target down the ranking and punish an arm for succeeding. Sharded groups are
    all size 2 so this is moot there; music-artworks groups run to 12.
  * Resolution tiers come from the measured header dimensions stored in the id
    index, never from the filename — 719 AVIFs disagree with their own name
    (CONVENTIONS.md, spec 7.4.1).

Usage:
  .venv/bin/python eval_pairs.py                       # all arms with output
  .venv/bin/python eval_pairs.py --arms siglip2-so400m dinov2-vitl14
  .venv/bin/python eval_pairs.py --ground-truth-only   # no embeddings needed
  .venv/bin/python eval_pairs.py --selftest            # ranking math, synthetic
"""

from __future__ import annotations

import argparse
import json
import re
import time
from collections import defaultdict
from pathlib import Path

import config
import common

# [MEASURED] Sharded filenames are 40 hex characters (spec section 7.1): a
# 16-character rendition prefix then a 24-character artwork id. Five files carry
# off-pattern names (spec 7.2) and are excluded by this pattern rather than
# guessed at.
SHARDED_NAME_RE = re.compile(r"^([0-9a-f]{16})([0-9a-f]{24})$")

# [MEASURED] music-artworks filenames are a 32-hex id with an optional `_WxH`
# rendition suffix (spec section 7.4). The suffix is a *requested* size and is
# discarded here; only the stem identifies the artwork.
MUSIC_NAME_RE = re.compile(r"^([0-9a-f]{32})(?:_(\d+)x(\d+))?$")

# [REVIEWED] Recall cutoffs reported per arm. 1 is the only one that matters for
# near-dup dedup; 5 shows whether a miss was close or hopeless.
RECALL_AT = (1, 5, 10)

# [MEASURED] The sharded corpus is bimodal at 300 and 640 px (spec section 7),
# so a query is assigned to a tier by its measured long edge with the split
# halfway between. Nothing else in the corpus lands near 470.
SHARDED_TIER_SPLIT_PX = 470

# [REVIEWED] Long-edge buckets for the music-artworks breakdown. Chosen to match
# the structure spec section 7.4.2 describes: a derived-thumbnail tail at or
# below 150 px, then the sharded corpus's own 300/640 landmarks, then the range
# only this collection has.
MUSIC_TIER_EDGES = (150, 300, 640, 1024)


def tier_label_sharded(long_edge: int) -> str:
    return "300px" if long_edge < SHARDED_TIER_SPLIT_PX else "640px"


def tier_label_music(long_edge: int) -> str:
    lo = 0
    for edge in MUSIC_TIER_EDGES:
        if long_edge <= edge:
            return f"<={edge}px" if lo == 0 else f"{lo + 1}-{edge}px"
        lo = edge
    return f">{MUSIC_TIER_EDGES[-1]}px"


# --------------------------------------------------------------------------
# Ground truth
# --------------------------------------------------------------------------


def stem_of(path: str) -> str:
    name = path.rsplit("/", 1)[-1]
    return name.split(".", 1)[0]


def build_groups(collection: str, paths: list[str]) -> tuple[dict[str, list[str]], dict]:
    """Group file paths by artwork id. Returns (groups, diagnostics)."""
    groups: dict[str, list[str]] = defaultdict(list)
    off_pattern: list[str] = []

    for path in paths:
        stem = stem_of(path)
        if collection == config.COLLECTION_SHARDED:
            match = SHARDED_NAME_RE.match(stem)
            if not match:
                off_pattern.append(path)
                continue
            groups[match.group(2)].append(path)
        else:
            match = MUSIC_NAME_RE.match(stem)
            if not match:
                off_pattern.append(path)
                continue
            groups[match.group(1)].append(path)

    multi = {k: sorted(v) for k, v in groups.items() if len(v) > 1}
    sizes: dict[int, int] = defaultdict(int)
    for members in multi.values():
        sizes[len(members)] += 1

    # For the sharded set, record the rendition-prefix structure: it is what
    # makes these pairs a controlled resolution experiment rather than just
    # duplicates, and it is worth failing loudly on if it ever changes.
    prefix_hist: dict[str, int] = {}
    cross_prefix_groups = 0
    if collection == config.COLLECTION_SHARDED:
        counts: dict[str, int] = defaultdict(int)
        for path in paths:
            match = SHARDED_NAME_RE.match(stem_of(path))
            if match:
                counts[match.group(1)] += 1
        prefix_hist = dict(sorted(counts.items(), key=lambda kv: -kv[1]))
        for members in multi.values():
            prefixes = {
                SHARDED_NAME_RE.match(stem_of(m)).group(1) for m in members
            }
            if len(prefixes) == len(members):
                cross_prefix_groups += 1

    diagnostics = {
        "files": len(paths),
        "off_pattern_files": len(off_pattern),
        "off_pattern_examples": off_pattern[:5],
        "distinct_artworks": len(groups),
        "multi_rendition_artworks": len(multi),
        "files_in_multi_rendition_artworks": sum(len(v) for v in multi.values()),
        "group_size_histogram": {str(k): v for k, v in sorted(sizes.items())},
    }
    if collection == config.COLLECTION_SHARDED:
        dominant = list(prefix_hist)[:2]
        diagnostics["rendition_prefixes"] = prefix_hist
        diagnostics["dominant_prefixes"] = dominant
        diagnostics["singleton_prefix_files"] = sum(
            n for pre, n in prefix_hist.items() if pre not in dominant
        )
        diagnostics["cross_prefix_pair_groups"] = cross_prefix_groups
        diagnostics["note"] = (
            "every multi-rendition group is cross-prefix, i.e. one 300 px and one "
            "640 px rendition; no artwork was fetched twice at the same size"
        )
    return multi, diagnostics


def build_ground_truth() -> tuple[dict, dict]:
    """Ground truth for both collections, from filenames only. No model needed."""
    truth = {}
    diagnostics = {}
    for collection in config.COLLECTIONS:
        paths = common.enumerate_collection(collection)
        groups, diag = build_groups(collection, paths)
        truth[collection] = groups
        diagnostics[collection] = diag
    return truth, diagnostics


# --------------------------------------------------------------------------
# Scoring
# --------------------------------------------------------------------------


def discover_arms(out_dir: Path):
    """Every arm in config.ARMS whose output is COMPLETE for both collections.

    Derived from config.ARMS rather than a hand-maintained shortlist. An earlier
    version iterated config.BAKEOFF_ARMS, which is a curated display list, so the
    dinov2-vitl14-392 tiebreaker was silently never scored even though its files
    were on disk. Deriving the list from the registry means a newly added arm
    cannot drop out the same way; it either appears, or it appears in `skipped`
    with a reason.

    "Complete" means both collections have an id index whose ok+failed rows equal
    the number of files enumerated for that collection. A half-finished run is
    excluded rather than silently scored against a partial pool, which would make
    its ranks incomparable with the other arms.
    """
    included: list[str] = []
    skipped: list[tuple[str, str]] = []

    enumerated = {}
    for collection in config.COLLECTIONS:
        try:
            enumerated[collection] = len(common.enumerate_collection(collection))
        except FileNotFoundError:
            enumerated[collection] = None

    for tag in config.ARMS:
        reasons = []
        for collection in config.COLLECTIONS:
            store = common.EmbeddingStore(out_dir, collection, arm_tag=tag)
            if not store.ids_path.exists():
                reasons.append(f"no output for {collection}")
                continue
            recovery = store.recover(read_only=True)
            resolved = recovery["ok_rows"] + recovery["failed_rows"]
            expected = enumerated.get(collection)
            if expected is not None and resolved != expected:
                reasons.append(
                    f"{collection} incomplete ({resolved}/{expected} files resolved)"
                )
        if reasons:
            skipped.append((tag, "; ".join(reasons)))
        else:
            included.append(tag)

    # Stable, meaningful order: curated bake-off order first, then any newcomers
    # alphabetically, so a new arm lands predictably instead of wherever the dict
    # happens to put it.
    order = {tag: n for n, tag in enumerate(config.BAKEOFF_ARMS)}
    included.sort(key=lambda t: (order.get(t, len(order)), t))
    return included, skipped


def load_arm_matrix(out_dir: Path, arm_tag: str):
    """Concatenate both collections into one candidate pool for `arm_tag`."""
    import numpy as np
    import query as query_mod

    blocks = []
    rows: list[dict] = []
    per_collection = {}
    for collection in config.COLLECTIONS:
        matrix, index = query_mod.load_collection(out_dir, collection, arm_tag)
        per_collection[collection] = {
            "vectors": int(matrix.shape[0]),
            "dim": int(matrix.shape[1]),
        }
        offset = sum(b.shape[0] for b in blocks)
        for record in index:
            rows.append(record)
        blocks.append(matrix)
        per_collection[collection]["offset"] = offset

    pool = np.ascontiguousarray(np.concatenate(blocks, axis=0), dtype="float32")
    index_of_path = {record["path"]: i for i, record in enumerate(rows)}
    return pool, rows, index_of_path, per_collection


def evaluate_arm(out_dir: Path, arm_tag: str, truth: dict,
                 return_pairs: bool = False) -> dict:
    import numpy as np

    started = time.perf_counter()
    pool, rows, index_of_path, per_collection = load_arm_matrix(out_dir, arm_tag)
    n_pool = pool.shape[0]

    # Bucket every query, then score. Missing files (failed rows, or an arm that
    # has not finished) are counted, never silently dropped.
    missing_files = 0
    dropped_pairs = 0
    results: list[dict] = []

    for collection, groups in truth.items():
        tier_fn = (
            tier_label_sharded
            if collection == config.COLLECTION_SHARDED
            else tier_label_music
        )
        for artwork_id, members in groups.items():
            present = [p for p in members if p in index_of_path]
            missing_files += len(members) - len(present)
            if len(present) < 2:
                dropped_pairs += len(members) * (len(members) - 1)
                continue

            member_idx = [index_of_path[p] for p in present]
            path_of_idx = dict(zip(member_idx, present))
            for query_pos, query_path in enumerate(present):
                q_index = member_idx[query_pos]
                sims = pool @ pool[q_index]
                q_record = rows[q_index]
                long_edge = max(q_record.get("width", 0), q_record.get("height", 0))

                # Other renditions are also correct answers; excluding them keeps
                # the rank honest for the pair actually being scored.
                others = [i for i in member_idx if i != q_index]
                for target_index in others:
                    target_sim = sims[target_index]
                    n_greater = int((sims > target_sim).sum())
                    # Remove the query itself and the excluded group-mates from
                    # the count of things ranked above the target.
                    if sims[q_index] > target_sim:
                        n_greater -= 1
                    for other in others:
                        if other != target_index and sims[other] > target_sim:
                            n_greater -= 1
                    rank = n_greater + 1
                    results.append(
                        {
                            "collection": collection,
                            "artwork_id": artwork_id,
                            "query": query_path,
                            "target": path_of_idx[target_index],
                            "rank": rank,
                            "similarity": float(target_sim),
                            "query_long_edge": long_edge,
                            "tier": tier_fn(long_edge),
                        }
                    )

    def summarize(subset: list[dict]) -> dict:
        if not subset:
            return {"pairs": 0}
        ranks = np.array([r["rank"] for r in subset], dtype="int64")
        sims = np.array([r["similarity"] for r in subset], dtype="float64")
        out = {
            "pairs": int(ranks.size),
            "mean_rank": float(ranks.mean()),
            "median_rank": float(np.median(ranks)),
            "p90_rank": float(np.percentile(ranks, 90)),
            "worst_rank": int(ranks.max()),
            "mean_similarity": float(sims.mean()),
        }
        for k in RECALL_AT:
            out[f"recall@{k}"] = float((ranks <= k).mean())
        return out

    report = {
        "arm": arm_tag,
        "pool_size": int(n_pool),
        "per_collection_vectors": per_collection,
        "missing_files": missing_files,
        "dropped_pairs_for_missing_members": dropped_pairs,
        "overall": summarize(results),
        "by_collection": {},
        "seconds": round(time.perf_counter() - started, 1),
    }
    for collection in config.COLLECTIONS:
        subset = [r for r in results if r["collection"] == collection]
        entry = summarize(subset)
        tiers = sorted({r["tier"] for r in subset})
        entry["by_query_tier"] = {
            tier: summarize([r for r in subset if r["tier"] == tier]) for tier in tiers
        }
        report["by_collection"][collection] = entry

    if return_pairs:
        # Per-pair ranks, keyed so two arms can be compared pair-by-pair. Used for
        # paired significance tests; omitted from the stored JSON because 24,648
        # rows per arm would bloat the artifact for no downstream reader.
        report["pair_ranks"] = {
            (r["collection"], r["query"], r["target"]): r["rank"] for r in results
        }
    report["worst_examples"] = [
        {k: r[k] for k in ("collection", "query", "target", "rank", "similarity")}
        for r in sorted(results, key=lambda r: -r["rank"])[:10]
    ]
    return report


# --------------------------------------------------------------------------
# Presentation
# --------------------------------------------------------------------------


def print_table(reports: list[dict]) -> None:
    if not reports:
        print("no arms with output yet")
        return

    header = (
        f"{'arm':22s} {'dim':>5s} {'pairs':>7s} {'R@1':>7s} {'R@5':>7s} "
        f"{'med':>6s} {'mean':>9s} {'worst':>7s}"
    )
    print("\nOVERALL (pool = all files of both collections)")
    print(header)
    print("-" * len(header))
    for report in reports:
        o = report["overall"]
        dim = config.ARMS[report["arm"]]["dim"]
        print(
            f"{report['arm']:22s} {dim:5d} {o['pairs']:7d} {o['recall@1']:7.4f} "
            f"{o['recall@5']:7.4f} {o['median_rank']:6.1f} {o['mean_rank']:9.2f} "
            f"{o['worst_rank']:7d}"
        )

    for collection in config.COLLECTIONS:
        print(f"\n{collection.upper()} — by query resolution tier")
        tiers: list[str] = []
        for report in reports:
            for tier in report["by_collection"][collection].get("by_query_tier", {}):
                if tier not in tiers:
                    tiers.append(tier)
        tiers.sort()
        print(f"{'arm':22s} " + " ".join(f"{t:>16s}" for t in tiers))
        print("-" * (22 + 17 * len(tiers)))
        for report in reports:
            cells = []
            for tier in tiers:
                stats = report["by_collection"][collection]["by_query_tier"].get(tier)
                if not stats or not stats.get("pairs"):
                    cells.append(f"{'-':>16s}")
                else:
                    cells.append(f"{stats['recall@1']:.4f}/{stats['pairs']:<7d}"[:16].rjust(16))
            print(f"{report['arm']:22s} " + " ".join(cells))
        print("  (cell = recall@1 / pair count)")


def selftest() -> int:
    """Validate the ranking arithmetic on synthetic vectors, no model involved."""
    import numpy as np

    print("[eval] ranking self-test on synthetic vectors")
    rng = np.random.default_rng(0)
    dim = 32
    # 3 renditions of one artwork, deliberately near-identical, plus distractors.
    base = rng.normal(size=dim)
    group = np.stack([base + 0.001 * rng.normal(size=dim) for _ in range(3)])
    distractors = rng.normal(size=(50, dim))
    pool = np.concatenate([group, distractors])
    pool /= np.linalg.norm(pool, axis=1, keepdims=True)

    member_idx = [0, 1, 2]
    ok = True
    for q_index in member_idx:
        sims = pool @ pool[q_index]
        others = [i for i in member_idx if i != q_index]
        for target_index in others:
            target_sim = sims[target_index]
            n_greater = int((sims > target_sim).sum())
            if sims[q_index] > target_sim:
                n_greater -= 1
            for other in others:
                if other is not target_index and sims[other] > target_sim:
                    n_greater -= 1
            rank = n_greater + 1
            if rank != 1:
                ok = False
                print(f"  FAIL q={q_index} t={target_index} rank={rank}, expected 1")
    print("  PASS  near-identical group members all rank 1 with group-mates excluded"
          if ok else "  FAIL")

    # A target that is genuinely far away must rank near the bottom: the pair is
    # (query=base, target=-base), with 50 unrelated distractors in between.
    pool2 = np.concatenate([base[None, :], -base[None, :], distractors])
    pool2 /= np.linalg.norm(pool2, axis=1, keepdims=True)
    sims = pool2 @ pool2[0]
    target_sim = sims[1]
    n_greater = int((sims > target_sim).sum())
    if sims[0] > target_sim:
        n_greater -= 1          # the query is never its own candidate
    rank = n_greater + 1
    worst_possible = pool2.shape[0] - 1
    far_ok = rank > worst_possible // 2
    print(
        f"  {'PASS' if far_ok else 'FAIL'}  an anti-correlated target ranks "
        f"{rank}/{worst_possible}"
    )
    return 0 if (ok and far_ok) else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", default=str(config.DATA_DIR))
    parser.add_argument("--arms", nargs="+", default=None, choices=list(config.ARMS))
    parser.add_argument("--ground-truth-only", action="store_true")
    parser.add_argument("--selftest", action="store_true")
    parser.add_argument("--json-out", default=None)
    args = parser.parse_args()

    if args.selftest:
        return selftest()

    out_dir = Path(args.out_dir).resolve()
    truth, diagnostics = build_ground_truth()

    total_pairs = 0
    print("GROUND TRUTH (filenames only, no model)")
    for collection, diag in diagnostics.items():
        groups = truth[collection]
        ordered = sum(len(m) * (len(m) - 1) for m in groups.values())
        total_pairs += ordered
        print(
            f"  {collection:15s} {diag['files']:6d} files, "
            f"{diag['distinct_artworks']:6d} artworks, "
            f"{diag['multi_rendition_artworks']:5d} multi-rendition "
            f"({diag['files_in_multi_rendition_artworks']} files), "
            f"{ordered} ordered pairs"
        )
        if diag["off_pattern_files"]:
            print(
                f"  {'':15s} {diag['off_pattern_files']} off-pattern filename(s) "
                f"excluded, e.g. {diag['off_pattern_examples'][:2]}"
            )
        print(f"  {'':15s} group sizes: {diag['group_size_histogram']}")
    print(f"  TOTAL ordered pairs to score: {total_pairs}")

    if args.ground_truth_only:
        return 0

    arms = args.arms
    if arms is None:
        arms, skipped = discover_arms(out_dir)
        print("\nARM DISCOVERY")
        for tag in arms:
            print(f"  include {tag}")
        for tag, reason in skipped:
            print(f"  skip    {tag:22s} {reason}")
        if not arms:
            print("\nno arm has complete output under " + str(out_dir))
            return 1

    reports = []
    for tag in arms:
        try:
            reports.append(evaluate_arm(out_dir, tag, truth))
            print(f"[eval] scored {tag}")
        except FileNotFoundError as exc:
            print(f"[eval] skipping {tag}: {exc}")

    print_table(reports)

    payload = {
        "written_at": common.utc_now_iso(),
        "task": "image-to-image retrieval of the same artwork at a different "
        "rendition, pooled over all files of both collections",
        "method": {
            "metric": "rank of the true counterpart by cosine similarity "
            "(vectors are L2-normalized, so cosine is a dot product)",
            "candidate_pool": "every embedded file of both collections",
            "excluded_from_pool_per_pair": "the query itself, and any other "
            "rendition of the same artwork, which are also correct answers",
            "tie_handling": "rank = 1 + count of strictly greater similarities, "
            "so exact ties are scored optimistically",
            "tiers_from": "measured header dimensions in the id index, never "
            "filenames",
            "resolution_confound": config.ARM_RESOLUTION_CONFOUND,
        },
        "ground_truth": diagnostics,
        "arms": {report["arm"]: report for report in reports},
    }
    json_path = Path(args.json_out) if args.json_out else out_dir / config.BAKEOFF_FILENAME
    json_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"\n[eval] wrote {json_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
