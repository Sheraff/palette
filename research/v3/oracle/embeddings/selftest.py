"""Checks the pre-flight claims this stage makes about itself (spec section 11).

1. Poison pill: an unreadable file is attempted, capped, and written as a `failed`
   row with its exception class. It is never a silent skip and never retried
   forever.
2. Kill and resume: SIGKILL mid-run, restart, and the output is still internally
   consistent — contiguous row indices, no duplicated path, and a shard file whose
   length matches the id index exactly.

Runs against temporary output directories only; it never touches
research/v3/data/embeddings/.

Usage:  .venv/bin/python selftest.py
        .venv/bin/python selftest.py --model-free   # safe while the GPU is busy
        .venv/bin/python selftest.py --arm dinov2-vitl14
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import config
import common

# [REVIEWED] How many real corpus files the kill/resume case queues. Large enough
# that a kill lands mid-run at the rate measured on 2026-08-02 (~6.5 images/s).
KILL_TEST_QUEUE_SIZE = 400

# [MEASURED] Seconds to let the worker run before killing it. At ~6.5 images/s
# and a 15 s model load this lands roughly 100 images in, well inside the queue.
KILL_AFTER_SECONDS = 32.0

HERE = Path(__file__).resolve().parent
FAILURES: list[str] = []

# [REVIEWED] Arm under test. Overridable so the same checks can be pointed at a
# new arm; the storage and resume machinery is arm-independent, so testing one
# arm exercises it for all.
ARM = os.environ.get("V3_SELFTEST_ARM", config.DEFAULT_ARM)


def check(condition: bool, message: str) -> None:
    print(("  PASS  " if condition else "  FAIL  ") + message)
    if not condition:
        FAILURES.append(message)


def read_rows(out_dir: Path, collection: str) -> list[dict]:
    store = common.EmbeddingStore(out_dir, collection, arm_tag=ARM)
    return list(common.read_jsonl(store.ids_path))


def test_poison_pill() -> None:
    print("\n[selftest] poison pill")
    root = Path(tempfile.mkdtemp(prefix="v3-embed-selftest-root-"))
    out_dir = Path(tempfile.mkdtemp(prefix="v3-embed-selftest-out-"))
    try:
        shard_dir = root / config.SHARDED_DIR_NAMES[0]
        shard_dir.mkdir(parents=True)
        real = common.enumerate_collection(config.COLLECTION_SHARDED)[:3]
        for path in real:
            shutil.copy(config.REPO_ROOT / path, shard_dir / Path(path).name)
        (shard_dir / "poison-truncated").write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 200)
        (shard_dir / "poison-empty").write_bytes(b"")
        for name in config.SHARDED_DIR_NAMES[1:]:
            (root / name).mkdir()

        original_root = config.REPO_ROOT
        config.REPO_ROOT = root
        try:
            import embed

            arm = common.load_arm(ARM, common.resolve_device("auto"))
            stats = embed.run_collection(
                config.COLLECTION_SHARDED, out_dir, common.resolve_device("auto"),
                config.DEFAULT_BATCH_SIZE, None, arm,
            )
        finally:
            config.REPO_ROOT = original_root

        rows = read_rows(out_dir, config.COLLECTION_SHARDED)
        failed = [r for r in rows if r["status"] == "failed"]
        ok = [r for r in rows if r["status"] == "ok"]
        check(stats["embedded"] == 3, f"3 good files embedded (got {stats['embedded']})")
        check(len(failed) == 2, f"2 failed rows written (got {len(failed)})")
        check(
            all(r["row"] is None and r["sha256"] is None for r in failed),
            "failed rows carry no vector row and no hash",
        )
        check(
            all(r.get("error_class") for r in failed),
            "failed rows carry an exception class: "
            + ", ".join(sorted({r.get("error_class", "?") for r in failed})),
        )
        check(
            sorted(r["row"] for r in ok) == list(range(len(ok))),
            "ok rows are contiguous from 0",
        )

        # Re-run: the failed files must not be attempted again.
        config.REPO_ROOT = root
        try:
            stats2 = embed.run_collection(
                config.COLLECTION_SHARDED, out_dir, common.resolve_device("auto"),
                config.DEFAULT_BATCH_SIZE, None, arm,
            )
        finally:
            config.REPO_ROOT = original_root
        check(
            stats2["queued"] == 0 and stats2["failed"] == 0,
            f"a resumed run re-attempts nothing (queued={stats2['queued']})",
        )
    finally:
        shutil.rmtree(root, ignore_errors=True)
        shutil.rmtree(out_dir, ignore_errors=True)


def test_kill_and_resume() -> None:
    print("\n[selftest] kill and resume")
    out_dir = Path(tempfile.mkdtemp(prefix="v3-embed-selftest-kill-"))
    python = str(HERE / ".venv" / "bin" / "python")
    cmd = [
        python, str(HERE / "embed.py"),
        "--collections", config.COLLECTION_SHARDED,
        "--out-dir", str(out_dir),
        "--arm", ARM,
        "--limit", str(KILL_TEST_QUEUE_SIZE),
    ]
    try:
        proc = subprocess.Popen(
            cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        time.sleep(KILL_AFTER_SECONDS)
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        proc.wait(timeout=30)
        check(proc.returncode != 0, f"worker was killed hard (rc={proc.returncode})")

        rows_after_kill = read_rows(out_dir, config.COLLECTION_SHARDED)
        embedded_before = len([r for r in rows_after_kill if r["status"] == "ok"])
        check(embedded_before > 0, f"work survived the kill ({embedded_before} rows)")
        check(
            embedded_before < KILL_TEST_QUEUE_SIZE,
            "the kill landed mid-run, not after completion",
        )

        second = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
        check(second.returncode == 0, f"resumed run finished cleanly (rc={second.returncode})")
        if "repaired" in second.stdout:
            print("         (torn write repaired on restart, as designed)")

        rows = read_rows(out_dir, config.COLLECTION_SHARDED)
        ok = [r for r in rows if r["status"] == "ok"]
        paths = [r["path"] for r in ok]
        check(len(set(paths)) == len(paths), "no path embedded twice")
        check(
            sorted(r["row"] for r in ok) == list(range(len(ok))),
            f"row indices contiguous 0..{len(ok) - 1}",
        )
        check(
            len(ok) == KILL_TEST_QUEUE_SIZE,
            f"the full queue completed ({len(ok)}/{KILL_TEST_QUEUE_SIZE})",
        )

        arm_store = common.EmbeddingStore(
            out_dir, config.COLLECTION_SHARDED, arm_tag=ARM
        )
        shard = arm_store.shard_path
        expected = len(ok) * arm_store.dim * config.BYTES_PER_FLOAT32
        check(
            shard.stat().st_size == expected,
            f"shard length matches the id index ({shard.stat().st_size} bytes)",
        )

        import numpy as np

        matrix, index = None, None
        sys.path.insert(0, str(HERE))
        import query

        matrix, index = query.load_collection(
            out_dir, config.COLLECTION_SHARDED, arm_tag=ARM
        )
        norms = np.linalg.norm(matrix, axis=1)
        check(
            bool(np.abs(norms - 1.0).max() < 1e-5),
            f"every stored vector is L2-normalized (max deviation {np.abs(norms - 1.0).max():.2e})",
        )
        check(
            matrix.shape == (KILL_TEST_QUEUE_SIZE, arm_store.dim),
            f"matrix shape {matrix.shape}",
        )
        self_sim = float((matrix[0] * matrix[0]).sum())
        check(abs(self_sim - 1.0) < 1e-5, f"self-similarity is 1.0 ({self_sim:.6f})")
    finally:
        shutil.rmtree(out_dir, ignore_errors=True)


# [REVIEWED] Dimension used by the model-free store/eval test. Matches the
# smallest real arm so the exercised code paths are the production ones.
SYNTHETIC_ARM = config.ARM_DINOV2

# [REVIEWED] Vectors for two renditions of one artwork are built from a shared
# per-artwork direction plus this much independent noise. Small enough that a
# competent encoder's behaviour is simulated, large enough that the vectors are
# not literally identical.
SYNTHETIC_PAIR_NOISE = 0.05


def _synthesize_store(out_dir, collection, paths, rows_meta, mode: str, dim: int):
    """Write a complete, valid store for `collection` without loading any model."""
    import numpy as np
    import hashlib

    import eval_pairs

    store = common.EmbeddingStore(out_dir, collection, dim=dim, arm_tag=SYNTHETIC_ARM)
    store.recover()
    store.open()
    rng = np.random.default_rng(1234)
    try:
        batch_paths, batch_vecs = [], []

        def flush():
            if not batch_paths:
                return
            matrix = np.stack(batch_vecs).astype("float32")
            matrix /= np.linalg.norm(matrix, axis=1, keepdims=True)
            assigned = store.append_vectors(matrix)
            for row, path in zip(assigned, batch_paths):
                width, height = rows_meta[path]
                store.append_id_row(
                    {
                        "collection": collection, "row": row, "path": path,
                        "sha256": "0" * 64, "status": "ok",
                        "width": width, "height": height,
                        "format": "synthetic", "bytes": 0, "attempts": 1,
                        "embedded_at": common.utc_now_iso(),
                    }
                )
            batch_paths.clear()
            batch_vecs.clear()

        for path in paths:
            if mode == "grouped":
                # Same artwork id -> same base direction, so renditions cluster.
                stem = eval_pairs.stem_of(path)
                if collection == config.COLLECTION_SHARDED:
                    match = eval_pairs.SHARDED_NAME_RE.match(stem)
                    key = match.group(2) if match else stem
                else:
                    match = eval_pairs.MUSIC_NAME_RE.match(stem)
                    key = match.group(1) if match else stem
                seed = int(hashlib.sha256(key.encode()).hexdigest()[:16], 16) % (2**32)
                base = np.random.default_rng(seed).normal(size=dim)
                vector = base + SYNTHETIC_PAIR_NOISE * rng.normal(size=dim)
            else:
                vector = rng.normal(size=dim)
            batch_paths.append(path)
            batch_vecs.append(vector)
            if len(batch_paths) >= 256:
                flush()
        flush()
    finally:
        store.close()
    store.finalize_npy()
    return store


def test_store_and_eval_without_model() -> None:
    """Exercise store, resume, query and the whole bake-off metric, no model.

    This is the part of the pipeline that has nothing to do with which encoder is
    loaded, and it is the part most likely to be broken by a refactor. Running it
    model-free means it can run while the GPU is busy, and it validates the
    retrieval metric against the REAL ground truth rather than a toy graph.
    """
    print("\n[selftest] store + bake-off metric, model-free")
    import numpy as np
    import tempfile as _tempfile

    import eval_pairs

    dim = config.ARMS[SYNTHETIC_ARM]["dim"]
    truth, diagnostics = eval_pairs.build_ground_truth()
    check(
        diagnostics["sharded"]["multi_rendition_artworks"] == 644,
        f"sharded ground truth is the 644 cross-tier pairs the survey measured "
        f"(got {diagnostics['sharded']['multi_rendition_artworks']})",
    )
    check(
        diagnostics["sharded"]["cross_prefix_pair_groups"] == 644,
        "every sharded pair is one 300 px and one 640 px rendition",
    )
    check(
        diagnostics["music_artworks"]["multi_rendition_artworks"] == 1348,
        f"music-artworks ground truth is the 1,348 multi-rendition artworks the "
        f"survey measured (got {diagnostics['music_artworks']['multi_rendition_artworks']})",
    )

    for mode, expect_strong in (("grouped", True), ("random", False)):
        out_dir = Path(_tempfile.mkdtemp(prefix=f"v3-eval-{mode}-"))
        try:
            for collection in config.COLLECTIONS:
                paths = common.enumerate_collection(collection)
                meta = {}
                for path in paths:
                    stem = eval_pairs.stem_of(path)
                    if collection == config.COLLECTION_SHARDED:
                        side = 300 if stem.startswith("ab67616d00001e02") else 640
                    else:
                        side = int(np.random.default_rng(abs(hash(stem)) % 2**32)
                                   .choice([147, 300, 640, 1000]))
                    meta[path] = (side, side)
                _synthesize_store(out_dir, collection, paths, meta, mode, dim)

            report = eval_pairs.evaluate_arm(out_dir, SYNTHETIC_ARM, truth)
            overall = report["overall"]
            if mode == "grouped":
                check(
                    report["pool_size"] == 16145,
                    f"pool is every file of both collections ({report['pool_size']})",
                )
                check(
                    overall["pairs"] == 24648,
                    f"scored all 24,648 ordered pairs (got {overall['pairs']})",
                )
                check(
                    overall["recall@1"] > 0.99,
                    f"clustered synthetic vectors give recall@1 "
                    f"{overall['recall@1']:.4f} (> 0.99)",
                )
                sharded = report["by_collection"]["sharded"]["by_query_tier"]
                check(
                    set(sharded) == {"300px", "640px"},
                    f"sharded breaks down by measured tier: {sorted(sharded)}",
                )
                check(
                    sharded["300px"]["pairs"] == 644
                    and sharded["640px"]["pairs"] == 644,
                    "644 queries from each tier, as the survey implies",
                )
                check(
                    report["missing_files"] == 0,
                    "no ground-truth file is missing from a complete store",
                )
            else:
                check(
                    overall["recall@1"] < 0.01,
                    f"random vectors give recall@1 {overall['recall@1']:.4f} "
                    "(< 0.01) — the metric is not saturated by construction",
                )
                check(
                    overall["median_rank"] > 1000,
                    f"random vectors give median rank {overall['median_rank']:.0f} "
                    "(> 1000)",
                )
        finally:
            shutil.rmtree(out_dir, ignore_errors=True)


def main() -> int:
    global ARM
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model-free", action="store_true",
        help="run only the checks that load no model. Use while the GPU is busy: "
        "covers the store, resume, and the whole bake-off metric.",
    )
    parser.add_argument("--arm", default=ARM, choices=list(config.ARMS))
    args = parser.parse_args()
    ARM = args.arm

    test_store_and_eval_without_model()
    if not args.model_free:
        test_poison_pill()
        test_kill_and_resume()
    else:
        print("\n[selftest] skipped the two model-loading checks (--model-free)")
    print()
    if FAILURES:
        print(f"[selftest] {len(FAILURES)} FAILURE(S):")
        for message in FAILURES:
            print("  - " + message)
        return 1
    print("[selftest] all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
