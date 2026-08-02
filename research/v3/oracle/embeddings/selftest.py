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
"""

from __future__ import annotations

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


def check(condition: bool, message: str) -> None:
    print(("  PASS  " if condition else "  FAIL  ") + message)
    if not condition:
        FAILURES.append(message)


def read_rows(out_dir: Path, collection: str) -> list[dict]:
    return list(common.read_jsonl(out_dir / f"{collection}.ids.jsonl"))


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

            model, preprocess = common.load_model(common.resolve_device("auto"))
            stats = embed.run_collection(
                config.COLLECTION_SHARDED, out_dir, common.resolve_device("auto"),
                config.DEFAULT_BATCH_SIZE, None, model, preprocess,
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
                config.DEFAULT_BATCH_SIZE, None, model, preprocess,
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

        shard = out_dir / config.SHARD_SUBDIR_NAME / f"{config.COLLECTION_SHARDED}.f32"
        expected = len(ok) * config.EMBED_DIM * config.BYTES_PER_FLOAT32
        check(
            shard.stat().st_size == expected,
            f"shard length matches the id index ({shard.stat().st_size} bytes)",
        )

        import numpy as np

        matrix, index = None, None
        sys.path.insert(0, str(HERE))
        import query

        matrix, index = query.load_collection(out_dir, config.COLLECTION_SHARDED)
        norms = np.linalg.norm(matrix, axis=1)
        check(
            bool(np.abs(norms - 1.0).max() < 1e-5),
            f"every stored vector is L2-normalized (max deviation {np.abs(norms - 1.0).max():.2e})",
        )
        check(
            matrix.shape == (KILL_TEST_QUEUE_SIZE, config.EMBED_DIM),
            f"matrix shape {matrix.shape}",
        )
        self_sim = float((matrix[0] * matrix[0]).sum())
        check(abs(self_sim - 1.0) < 1e-5, f"self-similarity is 1.0 ({self_sim:.6f})")
    finally:
        shutil.rmtree(out_dir, ignore_errors=True)


def main() -> int:
    test_poison_pill()
    test_kill_and_resume()
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
