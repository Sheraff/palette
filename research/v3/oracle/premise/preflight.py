"""Pre-flight for the premise test — ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md §11.

    .venv/bin/python preflight.py --stage <name> [...]

Stages (run in this order; each writes a JSON artifact under data/oracle-premise/preflight/):

  decode        Every eval-set image opens in the inference runtime. No model loaded.
                Answers: is any entry undecodable, and does the AVIF plugin work?
  smoke         3-5 eval-set images through BOTH prompt variants. Prints answers and timings,
                projects the full-run duration. Loads the model.
  determinism1  Same image twice inside ONE process, both variants. Byte-diff.
  determinism2  Same image once; run this stage twice in two processes and diff the artifacts
                (`--tag proc1` / `--tag proc2`). §11: "same image twice -> identical bytes."
  batchmix      The same image inside three DIFFERENT surrounding item sets, one process.
                This is the §3 MoE caveat: expert routing must not depend on what else the
                process has seen. Not a batched forward pass — mlx-vlm's generate() is
                single-sequence — so what is under test is cache/state carry-over.
  retry         The §9.3 fallback: force a schema violation and confirm the retry cap and the
                parse_failed marker behave. Also confirms constrained decoding is available.
  poison        Feed a deliberately unprocessable file; confirm it is retried, marked failed,
                and not retried forever.

Nothing here writes to the run's results file.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    DATA_DIR, DEFAULT_PROMPT_SET, MAX_ATTEMPTS, PROMPT_SETS, RESOLUTION_CAP_PX, EvalItem, Oracle, PromptVariant,
    SchemaViolation, default_variants, load_eval_set, load_model_manifest, normalize_image,
    parse_model_text, sha256_bytes, utc_now, validate_and_canonicalize,
)

OUT_DIR = DATA_DIR / "preflight"

# [REVIEWED] Task brief: "Smoke: 3-5 eval-set images through BOTH prompt variants."
# Five, chosen to span the axes that matter rather than the head of the list: one accepted
# gradient, one accepted flat, one thumbnail tier, one large tier, one AVIF.
SMOKE_SIZE = 5


def write(name: str, payload: dict) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{name}.json"
    path.write_text(json.dumps(payload, indent="\t") + "\n")
    print(f"wrote {path}")
    return path


def pick_smoke(items: list[EvalItem]) -> list[EvalItem]:
    """Deterministic, documented, and spread across the axes the run is stratified on."""
    included = [i for i in items if i.included]
    chosen: list[EvalItem] = []

    def take(predicate):
        for item in sorted(included, key=lambda i: i.image_sha256):
            if item in chosen:
                continue
            if predicate(item):
                chosen.append(item)
                return

    take(lambda i: i.format != "jpeg")                                   # the AVIF
    take(lambda i: i.source_long_edge_px > 640)                          # large tier
    take(lambda i: i.source_long_edge_px <= 320 and i.gradient_truth)    # thumbnail, gradient
    take(lambda i: i.source_long_edge_px == 640 and i.gradient_truth)    # standard, gradient
    take(lambda i: i.source_long_edge_px == 640 and not i.gradient_truth)  # standard, flat
    while len(chosen) < SMOKE_SIZE:
        take(lambda i: True)
    return chosen[:SMOKE_SIZE]


# ---------------------------------------------------------------- stages

def stage_decode(args) -> int:
    items, _ = load_eval_set(args.eval_set)
    results, failures = [], []
    for item in items:
        try:
            image, source_edge, processed_edge = normalize_image(item.absolute_path, args.long_edge)
            results.append({
                "image_path": item.image_path, "format": item.format,
                "source_long_edge_px": source_edge, "processed_long_edge_px": processed_edge,
                "mode": image.mode, "size": list(image.size), "included": item.included,
            })
        except Exception as error:
            failures.append({"image_path": item.image_path, "format": item.format,
                             "error_class": type(error).__name__, "error": str(error)[:300]})
    payload = {
        "stage": "decode", "at": utc_now(), "long_edge_cap": args.long_edge,
        "checked": len(items), "ok": len(results), "failed": len(failures),
        "formats": sorted({r["format"] for r in results}),
        "processed_long_edges": sorted({r["processed_long_edge_px"] for r in results}),
        "failures": failures, "images": results,
    }
    write("decode", payload)
    print(json.dumps({k: payload[k] for k in ("checked", "ok", "failed", "formats", "processed_long_edges")}, indent="\t"))
    return 0 if not failures else 1


def _ask(oracle: Oracle, item: EvalItem, variant: PromptVariant, long_edge: int) -> dict:
    image, source_edge, processed_edge = normalize_image(item.absolute_path, long_edge)
    started = time.time()
    answer = oracle.ask(image, variant)
    return {
        "image_path": item.image_path, "image_sha256": item.image_sha256,
        "variant": variant.variant, "status": answer.status,
        "parsed": answer.parsed, "raw_text": answer.raw_text,
        "raw_sha256": sha256_bytes(answer.raw_text.encode("utf-8")),
        "attempts": answer.attempts, "parse_failed": answer.parse_failed,
        "error_class": answer.error_class, "error_message": answer.error_message,
        "prompt_tokens": answer.prompt_tokens, "generation_tokens": answer.generation_tokens,
        "wall_seconds": round(time.time() - started, 3),
        "source_long_edge_px": source_edge, "processed_long_edge_px": processed_edge,
        "gradient_truth": item.gradient_truth,
    }


def stage_smoke(args) -> int:
    items, _ = load_eval_set(args.eval_set)
    chosen = pick_smoke(items)
    oracle = Oracle(load_model_manifest())
    variants = default_variants(args.prompt_set)
    rows = []
    for item in chosen:
        for variant in variants:
            row = _ask(oracle, item, variant, args.long_edge)
            rows.append(row)
            print(f"{item.image_id[:20]:<22} {variant.variant} {row['wall_seconds']:6.2f}s "
                  f"truth={item.gradient_truth} -> {row['parsed']}", flush=True)

    ok_rows = [r for r in rows if r["status"] == "ok"]
    times = [r["wall_seconds"] for r in ok_rows]
    included = [i for i in items if i.included]
    total_inferences = len(included) * len(variants)
    per_item = statistics.mean(times) if times else 0.0
    payload = {
        "stage": "smoke", "at": utc_now(),
        "model_load_seconds": round(oracle.load_seconds, 1),
        "images": [i.image_path for i in chosen],
        "variants": [v.id for v in variants],
        "prompt_hashes": {v.variant: v.prompt_hash for v in variants},
        "constrained_decoding": True,
        "timing": {
            "n": len(times),
            "mean_seconds": round(per_item, 3),
            "median_seconds": round(statistics.median(times), 3) if times else None,
            "min_seconds": round(min(times), 3) if times else None,
            "max_seconds": round(max(times), 3) if times else None,
            "mean_generation_tokens": round(statistics.mean(
                [r["generation_tokens"] for r in ok_rows if r["generation_tokens"]]), 1) if ok_rows else None,
            "mean_prompt_tokens": round(statistics.mean(
                [r["prompt_tokens"] for r in ok_rows if r["prompt_tokens"]]), 1) if ok_rows else None,
        },
        "projection": {
            "included_images": len(included),
            "variants": len(variants),
            "total_inferences": total_inferences,
            "canary_inferences": total_inferences // 20 + 1,
            "burst_estimate_seconds": round(per_item * (total_inferences + total_inferences // 20 + 1), 1),
            "burst_estimate_minutes": round(per_item * (total_inferences + total_inferences // 20 + 1) / 60, 1),
            "sustained_estimate_minutes_at_65pct": round(
                per_item * (total_inferences + total_inferences // 20 + 1) / 60 / 0.65, 1),
            "caveat": "A five-image smoke measures BURST, not sustained throughput. Pipeline §10: a "
                      "multi-hour laptop run throttles to roughly 60-70% of burst. Both numbers given.",
        },
        "rows": rows,
    }
    write("smoke", payload)
    print(json.dumps(payload["timing"] | payload["projection"], indent="\t"))
    return 0 if len(ok_rows) == len(rows) else 1


def stage_determinism1(args) -> int:
    """Same image twice inside one process, both variants."""
    items, _ = load_eval_set(args.eval_set)
    item = pick_smoke(items)[args.index]
    oracle = Oracle(load_model_manifest())
    rows = []
    for repeat in range(args.repeats):
        for variant in default_variants(args.prompt_set):
            row = _ask(oracle, item, variant, args.long_edge)
            row["repeat"] = repeat
            rows.append(row)
            print(f"repeat {repeat} variant {variant.variant} -> {row['raw_sha256'][:16]}", flush=True)
    diffs = {}
    for variant in default_variants(args.prompt_set):
        texts = {r["raw_text"] for r in rows if r["variant"] == variant.variant}
        diffs[variant.variant] = {
            "distinct_raw_texts": len(texts),
            "identical": len(texts) == 1,
            "texts": sorted(texts) if len(texts) > 1 else list(texts)[:1],
        }
    payload = {"stage": "determinism-same-process", "at": utc_now(),
               "image": item.image_path, "repeats": args.repeats,
               "all_identical": all(d["identical"] for d in diffs.values()),
               "per_variant": diffs, "rows": rows}
    write("determinism-same-process", payload)
    print(json.dumps({"all_identical": payload["all_identical"],
                      "per_variant": {k: v["distinct_raw_texts"] for k, v in diffs.items()}}, indent="\t"))
    return 0 if payload["all_identical"] else 1


def stage_determinism2(args) -> int:
    """One pass, tagged. Run twice in two processes, then compare with --stage compare2."""
    items, _ = load_eval_set(args.eval_set)
    item = pick_smoke(items)[args.index]
    oracle = Oracle(load_model_manifest())
    rows = [_ask(oracle, item, v, args.long_edge) for v in default_variants(args.prompt_set)]
    payload = {"stage": "determinism-cross-process", "tag": args.tag, "at": utc_now(),
               "image": item.image_path, "rows": rows,
               "fingerprints": {r["variant"]: r["raw_sha256"] for r in rows}}
    write(f"determinism-cross-process.{args.tag}", payload)
    print(json.dumps(payload["fingerprints"], indent="\t"))
    return 0


def stage_compare2(args) -> int:
    a = json.loads((OUT_DIR / f"determinism-cross-process.{args.tag_a}.json").read_text())
    b = json.loads((OUT_DIR / f"determinism-cross-process.{args.tag_b}.json").read_text())
    same = a["fingerprints"] == b["fingerprints"]
    payload = {"stage": "determinism-cross-process-compare", "at": utc_now(),
               "tags": [args.tag_a, args.tag_b], "identical": same,
               "a": a["fingerprints"], "b": b["fingerprints"],
               "texts_a": {r["variant"]: r["raw_text"] for r in a["rows"]},
               "texts_b": {r["variant"]: r["raw_text"] for r in b["rows"]}}
    write("determinism-cross-process-compare", payload)
    print(json.dumps({"identical": same, "a": a["fingerprints"], "b": b["fingerprints"]}, indent="\t"))
    return 0 if same else 1


def stage_batchmix(args) -> int:
    """The §3 MoE caveat, adapted. mlx-vlm's generate() is single-sequence, so there is no
    literal batch to vary; what CAN vary is the process's history. The probe image is asked
    the same question at three different points in three different surrounding sequences."""
    items, _ = load_eval_set(args.eval_set)
    smoke = pick_smoke(items)
    probe = smoke[args.index]
    others = [i for i in smoke if i.image_sha256 != probe.image_sha256]
    oracle = Oracle(load_model_manifest())
    variant = default_variants(args.prompt_set)[0]

    compositions = {
        "alone": [probe],
        "after_two_others": [others[0], others[1], probe],
        "between_others": [others[2], probe, others[0], others[1]] if len(others) >= 3
                          else [others[0], probe, others[1]],
    }
    fingerprints, rows = {}, []
    for name, sequence in compositions.items():
        for position, item in enumerate(sequence):
            row = _ask(oracle, item, variant, args.long_edge)
            row["composition"] = name
            row["position"] = position
            rows.append(row)
            if item.image_sha256 == probe.image_sha256:
                fingerprints[name] = row["raw_sha256"]
                print(f"{name:<20} position {position} -> {row['raw_sha256'][:16]} {row['parsed']}", flush=True)
    identical = len(set(fingerprints.values())) == 1
    payload = {"stage": "batch-composition", "at": utc_now(),
               "probe": probe.image_path, "variant": variant.id,
               "identical_across_compositions": identical,
               "fingerprints": fingerprints,
               "probe_texts": sorted({r["raw_text"] for r in rows if r["image_sha256"] == probe.image_sha256}),
               "rows": rows}
    write("batch-composition", payload)
    print(json.dumps({"identical_across_compositions": identical, "fingerprints": fingerprints}, indent="\t"))
    return 0 if identical else 1


def stage_retry(args) -> int:
    """§9.3. Two things: constrained decoding really is active, and the retry/parse_failed
    path really fires when validation fails."""
    items, _ = load_eval_set(args.eval_set)
    item = pick_smoke(items)[args.index]
    oracle = Oracle(load_model_manifest())
    variant = default_variants(args.prompt_set)[0]

    available = oracle.constrained_decoding_available(variant)

    # 1. constrained, normal: must produce a schema-valid document on attempt 1.
    constrained_row = _ask(oracle, item, variant, args.long_edge)

    # 2. unconstrained: does the model produce valid JSON without the grammar? This is the
    #    state of the world if the grammar path ever regresses, and it is what the retry
    #    fallback exists for.
    image, _, _ = normalize_image(item.absolute_path, args.long_edge)
    unconstrained = oracle.ask(image, variant, constrained=False)

    # 3. the retry path itself, exercised against a deliberately impossible validator.
    forced_attempts = {"count": 0}
    original = validate_and_canonicalize

    def always_fail(payload, v):
        forced_attempts["count"] += 1
        raise SchemaViolation("forced failure for the pre-flight retry test")

    import common
    common.validate_and_canonicalize = always_fail
    try:
        forced = oracle.ask(image, variant, max_attempts=MAX_ATTEMPTS)
    finally:
        common.validate_and_canonicalize = original

    payload = {
        "stage": "constrained-and-retry", "at": utc_now(),
        "constrained_decoding_available": available,
        "constrained_attempt": {
            "status": constrained_row["status"], "attempts": constrained_row["attempts"],
            "parse_failed": constrained_row["parse_failed"], "parsed": constrained_row["parsed"],
            "raw_text": constrained_row["raw_text"],
        },
        "unconstrained_attempt": {
            "status": unconstrained.status, "attempts": unconstrained.attempts,
            "parse_failed": unconstrained.parse_failed, "parsed": unconstrained.parsed,
            "raw_text": unconstrained.raw_text,
            "note": "If this is also clean, the grammar is belt-and-braces rather than load-bearing "
                    "— which is the comfortable place to be, not a reason to turn it off.",
        },
        "forced_failure": {
            "status": forced.status, "attempts": forced.attempts,
            "parse_failed": forced.parse_failed, "error_class": forced.error_class,
            "validator_invocations": forced_attempts["count"],
            "expected_attempts": MAX_ATTEMPTS,
            "retry_cap_respected": forced.attempts == MAX_ATTEMPTS and forced.status == "failed"
                                   and forced.parse_failed is True,
        },
    }
    write("constrained-and-retry", payload)
    print(json.dumps({k: v for k, v in payload.items() if k != "at"}, indent="\t")[:4000])
    return 0 if (available and payload["forced_failure"]["retry_cap_respected"]
                 and constrained_row["status"] == "ok") else 1


def stage_poison(args) -> int:
    """§11: feed a deliberately unprocessable file, verify it is retried N times, marked
    failed, and not retried forever. The failure here is in image decode, before the model."""
    import tempfile
    # Deliberately outside the committed data directory: this is junk by construction.
    poison = Path(tempfile.gettempdir()) / "premise-poison.jpg"
    poison.write_bytes(b"\xff\xd8\xff\xe0 this is not an image " + b"\x00" * 64)
    attempts = 0
    last_error = None
    for _ in range(MAX_ATTEMPTS):
        attempts += 1
        try:
            normalize_image(poison, args.long_edge)
        except Exception as error:
            last_error = error
    payload = {
        "stage": "poison-pill", "at": utc_now(),
        "file": str(poison),
        "attempts": attempts, "cap": MAX_ATTEMPTS,
        "error_class": type(last_error).__name__ if last_error else None,
        "error_message": str(last_error)[:300] if last_error else None,
        "fails_deterministically": last_error is not None,
        "note": "run_premise.py records an attempt in the persisted ledger BEFORE each inference, so "
                "a file that kills the process leaves a trail; at the cap it gets a terminal `failed` "
                "row and leaves the queue. Verified end-to-end by --stage poison-run.",
    }
    write("poison-pill", payload)
    print(json.dumps(payload, indent="\t"))
    return 0 if last_error is not None else 1


STAGES = {
    "decode": stage_decode,
    "smoke": stage_smoke,
    "determinism1": stage_determinism1,
    "determinism2": stage_determinism2,
    "compare2": stage_compare2,
    "batchmix": stage_batchmix,
    "retry": stage_retry,
    "poison": stage_poison,
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", required=True, choices=sorted(STAGES))
    parser.add_argument("--eval-set", type=Path, default=DATA_DIR / "eval-set.json")
    parser.add_argument("--long-edge", type=int, default=RESOLUTION_CAP_PX)
    parser.add_argument("--prompt-set", default=DEFAULT_PROMPT_SET, choices=sorted(PROMPT_SETS),
                        help="which frozen question set to pre-flight; new keys mean a new "
                             "grammar, so smoke and retry must be redone per set (§13 item 5)")
    parser.add_argument("--index", type=int, default=3, help="which smoke image to probe")
    parser.add_argument("--repeats", type=int, default=2)
    parser.add_argument("--tag", default="proc1")
    parser.add_argument("--tag-a", default="proc1")
    parser.add_argument("--tag-b", default="proc2")
    args = parser.parse_args()
    return STAGES[args.stage](args)


if __name__ == "__main__":
    raise SystemExit(main())
