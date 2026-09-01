"""Resolve the pinned SAM snapshot, verify its hashes, and write the manifest.

    .venv/bin/python pin_model.py

Downloads the weights if they are not cached. Writes research/v3/data/sam/model-manifest.json.
Fails loudly if what is on disk does not match the pins in config.py — the point of the
manifest is that a run can assert it did not silently move to different weights (§5.2).
"""

from __future__ import annotations

import json
import platform
import sys

import common
import config


def main() -> int:
    path = common.snapshot_path()
    weights = path / config.MODEL_WEIGHTS_FILE
    cfg = path / "config.json"

    weights_sha = common.sha256_file(weights)
    config_sha = common.sha256_file(cfg)
    size = weights.stat().st_size

    manifest = {
        "model_id": config.MODEL_REPO,
        "model_revision": config.MODEL_REVISION,
        "snapshot_path": str(path),
        "weights_file": config.MODEL_WEIGHTS_FILE,
        "weights_sha256": weights_sha,
        "weights_bytes": size,
        "config_sha256": config_sha,
        "quantization": config.MODEL_QUANTIZATION,
        "weight_load_note": config.WEIGHT_LOAD_NOTE,
        "runtime": {
            "package": config.RUNTIME_PACKAGE,
            "version": common._pkg_version("mlx-vlm"),
            "mlx": common._pkg_version("mlx"),
            "python": platform.python_version(),
            "platform": platform.platform(),
        },
        "concepts": [c for c, _ in config.CONCEPT_PROMPTS],
        "concept_prompts": [list(p) for p in config.CONCEPT_PROMPTS],
        "concept_set_hash": common.concept_set_hash(),
        "score_threshold": config.SCORE_THRESHOLD,
        "schema_version": config.SCHEMA_VERSION,
        "pinned_at": common.utc_now(),
        "git_head": common.git_head(),
    }

    problems = []
    if weights_sha != config.MODEL_WEIGHTS_SHA256:
        problems.append(f"weights sha256 {weights_sha} != pinned {config.MODEL_WEIGHTS_SHA256}")
    if config_sha != config.MODEL_CONFIG_SHA256:
        problems.append(f"config sha256 {config_sha} != pinned {config.MODEL_CONFIG_SHA256}")
    if size != config.MODEL_WEIGHTS_BYTES:
        problems.append(f"weights bytes {size} != pinned {config.MODEL_WEIGHTS_BYTES}")

    config.MODEL_MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    config.MODEL_MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(json.dumps(manifest, indent=2, sort_keys=True))
    if problems:
        for p in problems:
            print(f"MISMATCH: {p}", file=sys.stderr)
        return 1
    print(f"\nOK — manifest written to {config.MODEL_MANIFEST_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
