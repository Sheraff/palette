"""Out-of-family probe runner: GLM-4.5V (3-bit MLX) against the pinned Qwen arms.

    .venv/bin/python glm_probe.py --items <sha-list.json> --out <results.jsonl> [--limit N]

WHY A SEPARATE RUNNER AND NOT `--model` ON `run_premise.py`. `common.py` pins the oracle as
module constants (`MODEL_REPO`, `MODEL_REVISION`, `MODEL_QUANTIZATION`, `MODEL_MANIFEST_PATH`) and
that pin is load-bearing: `load_model_manifest` refuses a manifest whose revision disagrees, and
`Oracle.__init__` asserts the resolved snapshot is the manifest's snapshot. Those assertions are
the reason a Qwen row can be trusted, and they should not be softened into a flag that any future
run could set by accident. This module rebinds the four constants ON THE MODULE OBJECT, for its
own process only, and writes to its own manifest path — so every guard still fires, just against
the GLM pin. `common.py` is not edited (it also carries other agents' staged work; see
`run_premise_allnouns.py`'s docstring for the same constraint).

WHAT IS HELD BYTE-IDENTICAL. The prompts. Both variants are loaded through
`common.load_prompt_variant` from the reviewer-signed files on disk, so `prompt_hash`,
`schema_hash` and `file_hash` are RECOMPUTED here and can be compared against the Qwen run rows
rather than trusted. The serve path is `common.Oracle.ask` unchanged: same chat template
application, same greedy decode (temperature 0), same llguidance JSON grammar, same
validate-and-retry with the same attempt cap. Images are normalized by `common.normalize_image`
at the same `RESOLUTION_CAP_PX`. If any of that drifted, the probe would be measuring the harness
rather than the model, and the decorrelation number would be unreadable.

WHAT NECESSARILY DIFFERS, and it is exactly one thing: the weights, and the chat template that
ships with them. `apply_chat_template` reads the processor's own template, so GLM is prompted in
GLM's format with our text inside it. That is the correct comparison — the alternative (forcing
Qwen's literal template onto GLM) would test a broken serve, not another family's judgement.

THREE QUESTIONS, TWO SETS, TWO SEPARATE INFERENCES PER COVER.
  1. `subject-nouns-all.v1` variant J — the open-ended noun list, the live consumer (SAM dynamic
     prompting). One inference.
  2. `group-bcde.v1` variant E — served WHOLE, all thirteen questions, and only
     `has_dominant_subject` and `subject_kind` are read off it. Serving a two-question subset
     would be a different prompt with a different hash, and its answers would not be comparable
     to the Qwen E rows that the decorrelation triangle needs. The extra decode is the price of
     a valid comparison and is stated here so nobody later "optimises" it away.

Exit codes: 0 done, 1 unexpected.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common  # noqa: E402
import run_premise_allnouns  # noqa: E402

# ---------------------------------------------------------------- the GLM pin

# [MEASURED] Read from the HuggingFace model API 2026-08-04. MIT licence. 48.53 GB over 21 files,
# `model_type: glm4v_moe` — 106B parameters, 128 routed experts, which is where the disk goes.
# GLM_PROBE_NOTES.md records the full size table and why no smaller conversion is a substitute.
GLM_MODEL_REPO = "mlx-community/GLM-4.5V-3bit"
# [MEASURED] HF commit hash of GLM_MODEL_REPO, resolved 2026-08-04. §5.2 requires the hash, never
# the tag — `main` moves and a row pinned to it cannot be reproduced.
GLM_MODEL_REVISION = "699c0acbcc49988af87e32c902a631aef99547d3"
# [MEASURED] From the repo name and its config.json quantization block.
GLM_MODEL_QUANTIZATION = "3bit"
# [REVIEWED] Its own manifest file. Sharing `model-manifest.json` would overwrite the Qwen pin
# that every existing run row points at.
GLM_MANIFEST_PATH = common.DATA_DIR / "glm-model-manifest.json"

# [REVIEWED] The two prompt documents, byte-identical to the Qwen arms' — see module docstring.
VARIANT_J_PATH = common.PROMPTS_DIR / "subject-nouns-all.v1.variant-J.json"
VARIANT_E_PATH = common.PROMPTS_DIR / "group-bcde.v1.variant-e.json"


def install_glm_pin() -> None:
    """Rebind the model constants on the `common` module object. Idempotent.

    `Oracle`, `provenance` and `load_model_manifest` all read these as module globals at call
    time, so rebinding here is seen by every one of them — and by nothing outside this process.
    """
    common.MODEL_REPO = GLM_MODEL_REPO
    common.MODEL_REVISION = GLM_MODEL_REVISION
    common.MODEL_QUANTIZATION = GLM_MODEL_QUANTIZATION
    common.MODEL_MANIFEST_PATH = GLM_MANIFEST_PATH
    # The free-text-ARRAY answer shape that variant J needs. Same patch the Qwen J run used, from
    # the same module, so both arms' noun lists are validated by identical code.
    run_premise_allnouns.install()


# ---------------------------------------------------------------- manifest

def write_manifest(out: Path = GLM_MANIFEST_PATH) -> dict[str, Any]:
    """`pin-model.py` for the GLM snapshot. Same fields, same digest construction."""
    from huggingface_hub import snapshot_download

    snapshot = Path(snapshot_download(GLM_MODEL_REPO, revision=GLM_MODEL_REVISION))
    files = sorted(p for p in snapshot.rglob("*") if p.is_file())
    entries = []
    for path in files:
        rel = str(path.relative_to(snapshot))
        print(f"hashing {rel} ...", flush=True)
        entries.append({
            "file": rel,
            "bytes": path.stat().st_size,
            "sha256": common.sha256_file(path),
        })
    digest_input = "\n".join(f"{e['file']} {e['sha256']}" for e in entries).encode("utf-8")
    manifest = {
        "purpose": "Weight provenance for the GLM out-of-family probe (GLM_PROBE_NOTES.md).",
        "generated_by": "research/v3/oracle/premise/glm_probe.py --pin",
        "generated_at": common.utc_now(),
        "model_id": GLM_MODEL_REPO,
        "model_revision": GLM_MODEL_REVISION,
        "quantization": GLM_MODEL_QUANTIZATION,
        "snapshot_path": str(snapshot),
        "total_bytes": sum(e["bytes"] for e in entries),
        "weights_manifest_sha256": common.sha256_bytes(digest_input),
        "runtime": {
            "mlx_vlm": common._pkg_version("mlx-vlm"),
            "mlx": common._pkg_version("mlx"),
            "transformers": common._pkg_version("transformers"),
            "llguidance": common._pkg_version("llguidance"),
        },
        "files": entries,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(manifest, indent="\t") + "\n")
    print(f"wrote {out} ({manifest['total_bytes'] / 1e9:.2f} GB over {len(entries)} files)")
    return manifest


# ---------------------------------------------------------------- items

def load_items(items_path: Path) -> list[common.EvalItem]:
    """The probe item set: a JSON list of image_sha256, resolved against the eval set.

    Order is the list's, not the eval set's, because the draw is deliberate (reviewer-label
    overlap) and a reader must be able to see which covers were chosen and why.
    """
    all_items, _ = common.load_eval_set()
    by_sha = {i.image_sha256: i for i in all_items}
    wanted = json.loads(items_path.read_text())
    shas = wanted["items"] if isinstance(wanted, dict) else wanted
    missing = [s for s in shas if s not in by_sha]
    assert not missing, f"{len(missing)} sha256 not in the eval set: {missing[:3]}"
    return [by_sha[s] for s in shas]


# ---------------------------------------------------------------- run

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--items", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--pin", action="store_true", help="write the manifest and exit")
    args = parser.parse_args()

    install_glm_pin()

    if args.pin:
        write_manifest()
        return 0

    assert args.items and args.out, "--items and --out are required unless --pin"

    variants = [
        common.load_prompt_variant(VARIANT_J_PATH, expected_schema_version="subject-nouns-all.v1"),
        common.load_prompt_variant(VARIANT_E_PATH, expected_schema_version="group-bcde.v1"),
    ]
    for v in variants:
        print(f"variant {v.id}: prompt_hash={v.prompt_hash[:16]} file_hash={v.file_hash[:16]} "
              f"max_tokens={v.max_tokens or common.MAX_TOKENS}", flush=True)

    items = load_items(args.items)
    if args.limit:
        items = items[:args.limit]

    manifest = common.load_model_manifest(GLM_MANIFEST_PATH)
    run_id = common.new_run_id()
    print(f"run_id={run_id}  items={len(items)}  inferences={len(items) * len(variants)}",
          flush=True)

    started_load = time.time()
    oracle = common.Oracle(manifest=manifest)
    print(f"model loaded in {time.time() - started_load:.1f} s", flush=True)
    for v in variants:
        ok = oracle.constrained_decoding_available(v)
        print(f"constrained decoding for {v.id}: {ok}", flush=True)
        assert ok, f"llguidance could not build a grammar for {v.id} — the serve would not match"

    done = common.completed_keys(args.out) if args.out.exists() else set()
    sink = common.JsonlSink(args.out)
    t0 = time.time()
    n_inf = 0
    try:
        for idx, item in enumerate(items, 1):
            image, src_edge, proc_edge = common.normalize_image(
                item.absolute_path, common.RESOLUTION_CAP_PX)
            for variant in variants:
                key = common.row_key(item.image_sha256, variant)
                if key in done:
                    continue
                t_inf = time.time()
                answer = oracle.ask(image, variant)
                elapsed = time.time() - t_inf
                n_inf += 1
                row = common.provenance(run_id, variant, oracle, item, src_edge, proc_edge)
                row.update({
                    "row_key": key,
                    "status": answer.status,
                    "attempts": answer.attempts,
                    "parse_failed": answer.parse_failed,
                    "error_class": answer.error_class,
                    "error_message": answer.error_message,
                    "raw_text": answer.raw_text,
                    "answers": answer.parsed,
                    "prompt_tokens": answer.prompt_tokens,
                    "generation_tokens": answer.generation_tokens,
                    "generation_seconds": round(answer.generation_seconds, 3),
                    "peak_memory_gb": answer.peak_memory_gb,
                })
                sink.write(row)
                print(f"[{idx}/{len(items)}] {variant.variant} {answer.status} "
                      f"{elapsed:.1f}s tok={answer.generation_tokens} "
                      f"mean={(time.time() - t0) / n_inf:.1f}s/inf", flush=True)
    finally:
        sink.close()
    total = time.time() - t0
    print(json.dumps({
        "run_id": run_id,
        "inferences": n_inf,
        "total_seconds": round(total, 1),
        "seconds_per_inference": round(total / n_inf, 2) if n_inf else None,
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
