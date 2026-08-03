"""Pin a bake-off arm: resolve its snapshot, hash every weight file, write the manifest.

    .venv/bin/python pin_arms.py --arm qwen3-32b-dense
    .venv/bin/python pin_arms.py --all

Writes research/v3/data/oracle-bakeoff/model-manifest.<arm>.json. Per pipeline §5.2 every
output row carries `model_revision` (the HF commit hash, never a tag); this manifest is what
lets a later reader check that the bytes behind that hash are the bytes actually used.

The incumbent arm is a special case, on purpose. Its repo and revision are the premise run's,
its weights are already in the shared Hugging Face cache, and premise/pin-model.py already
hashed all 26 GB of them. Re-hashing would produce the same number for minutes of I/O, so
this script COPIES the premise manifest's digest and records where it came from. No arm's
weights are ever downloaded twice: mlx-vlm, huggingface_hub and both venvs share
~/.cache/huggingface/hub.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402
from bakeoff_common import sha256_bytes, sha256_file, utc_now  # noqa: E402
from bakeoff_common import premise_common  # noqa: E402


def pin_inherited(arm: str, spec: dict) -> dict:
    """The incumbent: inherit the premise workstream's already-computed digest."""
    source = Path(spec["manifest_inherited_from"])
    if not source.exists():
        raise FileNotFoundError(
            f"arm {arm} inherits its manifest from {source}, which does not exist")
    doc = json.loads(source.read_text())
    if doc["model_id"] != spec["hf_repo"] or doc["model_revision"] != spec["hf_revision"]:
        raise RuntimeError(
            f"{source} pins {doc['model_id']}@{doc['model_revision']}, config.py pins "
            f"{spec['hf_repo']}@{spec['hf_revision']}")
    return {
        "purpose": "Weight provenance for a bake-off arm (pipeline doc §5.2).",
        "generated_by": "research/v3/oracle/bakeoff/pin_arms.py",
        "generated_at": utc_now(),
        "arm": arm,
        "model_id": doc["model_id"],
        "model_revision": doc["model_revision"],
        "quantization": doc["quantization"],
        "snapshot_path": doc["snapshot_path"],
        "total_bytes": doc["total_bytes"],
        "weights_manifest_sha256": doc["weights_manifest_sha256"],
        "inherited_from": str(source),
        "inherited_reason": (
            "Same repo, same revision, same bytes as the premise run; premise/pin-model.py "
            "hashed them on 2026-08-02. Re-hashing 26 GB would restate the same digest."),
        "runtime": doc.get("runtime", {}),
        "files": doc.get("files", []),
    }


def pin_downloaded(arm: str, spec: dict, skip_hash: bool) -> dict:
    from huggingface_hub import snapshot_download

    snapshot = Path(snapshot_download(spec["hf_repo"], revision=spec["hf_revision"]))
    files = sorted(p for p in snapshot.rglob("*") if p.is_file())
    entries = []
    for path in files:
        rel = str(path.relative_to(snapshot))
        if skip_hash:
            entries.append({"file": rel, "bytes": path.stat().st_size, "sha256": None})
            continue
        print(f"hashing {rel} ...", flush=True)
        entries.append({"file": rel, "bytes": path.stat().st_size, "sha256": sha256_file(path)})

    # One hash over the sorted (file, sha256) list: a single value a row can carry.
    digest_input = "\n".join(f"{e['file']} {e['sha256']}" for e in entries).encode("utf-8")
    return {
        "purpose": "Weight provenance for a bake-off arm (pipeline doc §5.2).",
        "generated_by": "research/v3/oracle/bakeoff/pin_arms.py",
        "generated_at": utc_now(),
        "arm": arm,
        "model_id": spec["hf_repo"],
        "model_revision": spec["hf_revision"],
        "quantization": spec["quantization"],
        "architecture": spec["architecture"],
        "snapshot_path": str(snapshot),
        "total_bytes": sum(e["bytes"] for e in entries),
        "weights_manifest_sha256": sha256_bytes(digest_input),
        "hashes_computed": not skip_hash,
        "runtime": {
            "mlx_vlm": premise_common._pkg_version("mlx-vlm"),
            "mlx": premise_common._pkg_version("mlx"),
            "mlx_metal": premise_common._pkg_version("mlx-metal"),
            "transformers": premise_common._pkg_version("transformers"),
            "llguidance": premise_common._pkg_version("llguidance"),
            "pillow": premise_common._pkg_version("pillow"),
            "pillow_avif_plugin": premise_common._pkg_version("pillow-avif-plugin"),
            "huggingface_hub": premise_common._pkg_version("huggingface-hub"),
        },
        "files": entries,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--arm", action="append", default=None)
    parser.add_argument("--all", action="store_true", help="every available arm")
    parser.add_argument("--skip-hash", action="store_true",
                        help="record sizes without hashing (diagnostic only; the manifest "
                             "records hashes_computed=false and the runner will refuse it)")
    args = parser.parse_args()

    arms = args.arm or ([a for a, s in config.ARMS.items() if s.get("available")]
                        if args.all else None)
    if not arms:
        parser.error("pass --arm <id> (repeatable) or --all")

    for arm in arms:
        spec = config.arm_config(arm)
        if not spec.get("available"):
            print(f"SKIP {arm}: {spec.get('blocked_reason')}", flush=True)
            continue
        print(f"=== pinning {arm} ({spec['hf_repo']} @ {spec['hf_revision'][:12]})", flush=True)
        manifest = (pin_inherited(arm, spec) if spec.get("manifest_inherited_from")
                    else pin_downloaded(arm, spec, args.skip_hash))
        out = config.manifest_path(arm)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(manifest, indent="\t") + "\n")
        print(json.dumps({k: v for k, v in manifest.items() if k != "files"}, indent="\t"))
        print(f"wrote {out}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
