"""Pin the oracle model: resolve the snapshot, hash every weight file, write the manifest.

    .venv/bin/python pin-model.py [--out <path>]

Writes research/v3/data/oracle-premise/model-manifest.json. Per pipeline §5.2 the run's rows
carry `model_revision` (the HF commit hash, never a tag); this manifest is what lets a later
reader check that the bytes behind that hash are the bytes that were actually used.

Hashing ~26 GB takes a couple of minutes and is done once, not per run.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    MODEL_MANIFEST_PATH, MODEL_QUANTIZATION, MODEL_REPO, MODEL_REVISION,
    _pkg_version, sha256_bytes, sha256_file, utc_now,
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=MODEL_MANIFEST_PATH)
    args = parser.parse_args()

    from huggingface_hub import snapshot_download

    snapshot = Path(snapshot_download(MODEL_REPO, revision=MODEL_REVISION))
    files = sorted(p for p in snapshot.rglob("*") if p.is_file())
    entries = []
    for path in files:
        rel = str(path.relative_to(snapshot))
        print(f"hashing {rel} ...", flush=True)
        entries.append({
            "file": rel,
            "bytes": path.stat().st_size,
            "sha256": sha256_file(path),
        })

    # One hash over the sorted (file, sha256) list: a single value a row can carry.
    digest_input = "\n".join(f"{e['file']} {e['sha256']}" for e in entries).encode("utf-8")
    manifest = {
        "purpose": "Weight provenance for the oracle premise test (pipeline doc §5.2).",
        "generated_by": "research/v3/oracle/premise/pin-model.py",
        "generated_at": utc_now(),
        "model_id": MODEL_REPO,
        "model_revision": MODEL_REVISION,
        "quantization": MODEL_QUANTIZATION,
        "snapshot_path": str(snapshot),
        "total_bytes": sum(e["bytes"] for e in entries),
        "weights_manifest_sha256": sha256_bytes(digest_input),
        "runtime": {
            "mlx_vlm": _pkg_version("mlx-vlm"),
            "mlx": _pkg_version("mlx"),
            "mlx_metal": _pkg_version("mlx-metal"),
            "transformers": _pkg_version("transformers"),
            "llguidance": _pkg_version("llguidance"),
            "pillow": _pkg_version("pillow"),
            "pillow_avif_plugin": _pkg_version("pillow-avif-plugin"),
        },
        "files": entries,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(manifest, indent="\t") + "\n")
    print(json.dumps({k: v for k, v in manifest.items() if k != "files"}, indent="\t"))
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
