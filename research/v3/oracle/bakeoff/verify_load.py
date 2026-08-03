"""Load-verification for one bake-off arm: does it load, and does it answer coherently once?

    .venv/bin/python verify_load.py --arm qwen3-32b-dense

This is the ONLY GPU work the setup phase is allowed: one model load and one forward pass per
arm, on one image. It is not a benchmark and not a pre-flight; the §11 checklist (determinism,
batch-composition invariance, poison pills, resume) runs later, under the orchestrator's GPU
queue, on the arms that survive.

What it establishes, per arm:
  1. the pinned revision resolves and the weights load in this venv;
  2. whether llguidance can build a JSON-schema mask from THIS model's tokenizer — pipeline
     §9.3's preferred path is per-family, not universal, so it is measured, never inherited;
  3. one answer, decoded and validated against the frozen closed vocabularies;
  4. if the grammar did not bind: the same image under the validate-and-retry fallback, so
     the fallback is known to work before a run depends on it;
  5. the numbers a run projection needs — load seconds, generation seconds, peak memory.

The test image is the premise run's pinned canary, so every arm is verified on the same
picture and the answers are directly comparable.

Writes research/v3/data/oracle-bakeoff/arm-verification.<arm>.json, which run_bakeoff.py
reads to decide the arm's decoding path.
"""

from __future__ import annotations

import argparse
import json
import platform
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402
from bakeoff_common import (  # noqa: E402
    MAX_ATTEMPTS, RESOLUTION_CAP_PX, ArmOracle, GpuFault, default_variants, load_arm_manifest,
    load_canary_item, load_items, premise_common, utc_now,
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--arm", required=True, choices=sorted(config.ARMS))
    parser.add_argument("--variant", default=None,
                        help="which prompt wording to verify with; default A")
    parser.add_argument("--all-variants", action="store_true",
                        help="verify with both wordings (doubles the forward passes)")
    parser.add_argument("--long-edge", type=int, default=RESOLUTION_CAP_PX)
    args = parser.parse_args()

    spec = config.arm_config(args.arm)
    if not spec.get("available"):
        print(json.dumps({"arm": args.arm, "blocked": spec.get("blocked_reason")}, indent="\t"))
        return 1

    variants = default_variants()
    if args.variant:
        variants = [v for v in variants if v.variant == args.variant]
    elif not args.all_variants:
        # One wording is enough to prove the arm loads, binds the grammar and answers inside
        # the vocabulary. Setup-phase GPU time is minutes, not a benchmark.
        variants = variants[:1]
    assert variants, "no prompt variant selected"

    item = load_canary_item(load_items(config.ITEMS_EVAL142))
    manifest = load_arm_manifest(args.arm)

    print(f"loading {spec['hf_repo']} @ {spec['hf_revision'][:12]} ...", flush=True)
    oracle = ArmOracle(args.arm, manifest)
    print(f"model loaded in {oracle.load_seconds:.1f}s", flush=True)

    grammar = oracle.grammar_status(variants[0])
    print(f"grammar: {'AVAILABLE' if grammar.available else 'UNAVAILABLE'} — {grammar.detail}",
          flush=True)

    image, source_edge, processed_edge = premise_common.normalize_image(item.absolute_path, args.long_edge)

    passes = []
    for variant in variants:
        for constrained in ([True, False] if grammar.available else [False]):
            started = time.time()
            try:
                answer = oracle.ask(image, variant, max_attempts=MAX_ATTEMPTS,
                                    constrained=constrained)
            except GpuFault as fault:
                # The Metal context is dead for the rest of this process, so there is nothing
                # to learn from the remaining passes. Record it and stop — a verification that
                # ran against a poisoned context would report a false negative.
                passes.append({
                    "prompt_variant": variant.variant,
                    "constrained_decoding": constrained,
                    "status": "gpu_fault",
                    "parsed": None,
                    "raw_text": "",
                    "attempts": None,
                    "parse_failed": False,
                    "error_class": "GpuFault",
                    "error_message": str(fault)[:500],
                    "prompt_tokens": None,
                    "generation_tokens": None,
                    "wall_seconds": round(time.time() - started, 3),
                    "peak_memory_gb": None,
                    "system_turn": oracle.system_turn,
                })
                print(json.dumps(passes[-1], indent="\t"), flush=True)
                print("GPU FAULT — is another job using the GPU? This machine runs one at a "
                      "time. Re-run when it is idle.", flush=True)
                break
            passes.append({
                "prompt_variant": variant.variant,
                "constrained_decoding": constrained,
                "status": answer.status,
                "parsed": answer.parsed,
                "raw_text": answer.raw_text,
                "attempts": answer.attempts,
                "parse_failed": answer.parse_failed,
                "error_class": answer.error_class,
                "error_message": answer.error_message,
                "prompt_tokens": answer.prompt_tokens,
                "generation_tokens": answer.generation_tokens,
                "wall_seconds": round(time.time() - started, 3),
                "peak_memory_gb": answer.peak_memory_gb,
                "system_turn": oracle.system_turn,
            })
            print(json.dumps(passes[-1], indent="\t"), flush=True)
            # Only the first (variant, constrained) combination is strictly required; the
            # unconstrained pass is what proves the §9.3 fallback works on this family.

    ok_passes = [p for p in passes if p["status"] == "ok"]
    faults = [p for p in passes if p["status"] == "gpu_fault"]
    constrained_passes = [p for p in ok_passes if p["constrained_decoding"]]
    fallback_passes = [p for p in ok_passes if not p["constrained_decoding"]]
    verification = {
        "purpose": "One-forward-pass load verification for a bake-off arm.",
        "generated_by": "research/v3/oracle/bakeoff/verify_load.py",
        "generated_at": utc_now(),
        "arm": args.arm,
        "model_id": spec["hf_repo"],
        "model_revision": spec["hf_revision"],
        "quantization": spec["quantization"],
        "architecture": spec["architecture"],
        "weights_manifest_sha256": manifest["weights_manifest_sha256"],
        "snapshot_path": manifest["snapshot_path"],
        "runtime_version": f"mlx-vlm {oracle.runtime_version}",
        "mlx_version": premise_common._pkg_version("mlx"),
        "python_version": platform.python_version(),
        "load_seconds": round(oracle.load_seconds, 2),
        "grammar": {"available": grammar.available, "detail": grammar.detail},
        "system_turn": oracle.system_turn,
        "test_image": {
            "image_path": item.image_path,
            "image_sha256": item.image_sha256,
            "source_long_edge_px": source_edge,
            "processed_long_edge_px": processed_edge,
            "why_this_image": "the premise run's pinned canary — same picture for every arm",
        },
        "passes": passes,
        "gpu_faults": len(faults),
        "verdict": {
            "loads": True,
            "constrained_ok": bool(constrained_passes),
            "fallback_ok": bool(fallback_passes),
            "decoding_path_for_runs": "constrained" if grammar.available else "validate-and-retry",
        },
        "projection_inputs": {
            # The FIRST forward pass of a process pays for Metal kernel compilation, so it is
            # not the rate a 284-inference run will see. Both numbers are recorded and the
            # gold30 run (60 inferences) is what actually calibrates the projection.
            "first_pass_seconds": passes[0]["wall_seconds"] if passes else None,
            "later_passes_seconds": [p["wall_seconds"] for p in ok_passes[1:]],
            "peak_memory_gb": max(
                [p["peak_memory_gb"] for p in passes if p["peak_memory_gb"]] or [0]),
        },
    }
    out = config.verification_path(args.arm)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(verification, indent="\t") + "\n")
    print(json.dumps({k: v for k, v in verification.items() if k != "passes"}, indent="\t"))
    print(f"wrote {out}")
    if faults:
        return 5
    return 0 if verification["verdict"]["constrained_ok"] or verification["verdict"]["fallback_ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
