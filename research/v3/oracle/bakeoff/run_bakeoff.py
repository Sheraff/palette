"""Bake-off worker: run one arm over one item set, one JSONL row per (image, variant).

    .venv/bin/python run_bakeoff.py --arm <arm> --items {gold30|eval142} [--variant A]
                                    [--out PATH] [--limit N] [--no-canary] [--dry-run]

Adapted from research/v3/oracle/premise/run_premise.py. Same hygiene, all of it from
ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md §5:
  - one line per record, flushed and fsynced immediately; never accumulate in memory
  - resume by reading back completed row keys; the queue is (all - done) at startup
  - never overwrite a run file; a resumed run appends
  - per-image attempt counter persisted BEFORE inference, so a deterministically-crashing
    image is retried MAX_ATTEMPTS times, marked `failed`, and never retried again
  - `failed` is a status in the output, never an absence of rows
  - canary re-run every CANARY_EVERY items, diffed against this file's first canary result;
    a mismatch HALTS the run (exit 3) rather than warning

Three differences from the premise worker, each forced by the bake-off's question:
  1. --arm selects the weights; the arm is part of every row and of the resume key.
  2. --items selects the population: the reviewer-labelled gold 30, or the full 142.
  3. Constrained decoding is decided PER ARM from that arm's verification artifact
     (verify_load.py) rather than assumed. An arm whose tokenizer llguidance cannot read runs
     the §9.3 validate-and-retry fallback instead, with a repair instruction on attempts 2+,
     and every row says which path produced it.

Exit codes: 0 done, 1 unexpected error (supervisor should restart), 3 canary mismatch
(supervisor must NOT restart), 4 attempt cap exhausted for everything left, 5 GPU fault (the
Metal context died; the supervisor restarts into a fresh process — see GpuFault).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402
from bakeoff_common import (  # noqa: E402
    MAX_ATTEMPTS, RESOLUTION_CAP_PX, ArmOracle, AttemptLedger, EvalItem, GpuFault, JsonlSink,
    PromptVariant, bakeoff_row_key, completed_keys, default_variants, load_arm_manifest,
    load_arm_verification, load_canary_item, load_items, new_run_id, normalize_image,
    provenance, read_jsonl, utc_now,
)


def canary_fingerprint(rows: list[dict]) -> str:
    """What must not drift within one arm's run: the parsed answer and the raw bytes."""
    return json.dumps({"parsed": rows[0]["parsed"], "raw": rows[0]["raw_text"]}, sort_keys=True)


def decide_constrained(arm: str, force_off: bool, force_on: bool,
                       dry_run: bool = False) -> tuple[bool | None, str]:
    """Per-arm constrained-decoding decision, from measurement, not assumption.

    Returns None only for a dry run of an arm that has not been verified yet: printing the
    work queue must not require 36 GB of weights to have been loaded first.
    """
    if force_off:
        return False, "forced off by --no-constrained"
    verification = load_arm_verification(arm)
    if verification is None:
        if force_on:
            return True, "forced on by --constrained with no verification artifact"
        if dry_run:
            return None, ("unknown — this arm has no verification artifact yet; run "
                          f"verify_load.py --arm {arm} before a real run")
        raise FileNotFoundError(
            f"no verification artifact for arm {arm!r} at {config.verification_path(arm)}. "
            f"Run: .venv/bin/python verify_load.py --arm {arm}")
    ok = bool(verification["grammar"]["available"])
    if ok:
        return True, "grammar verified for this arm"
    return False, (f"grammar unavailable for this arm ({verification['grammar']['detail']}); "
                   f"running the §9.3 validate-and-retry fallback")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--arm", required=True, choices=sorted(config.ARMS))
    parser.add_argument("--items", required=True, choices=list(config.ITEM_SETS))
    parser.add_argument("--variant", action="append", default=None, help="A and/or B; default both")
    parser.add_argument("--out", type=Path, default=None,
                        help="results JSONL (appended, never truncated); "
                             "default data/oracle-bakeoff/<arm>.<items>.jsonl")
    parser.add_argument("--only-sha", action="append", default=None)
    parser.add_argument("--limit", type=int, default=None, help="stop after N inferences this process")
    parser.add_argument("--long-edge", type=int, default=RESOLUTION_CAP_PX)
    parser.add_argument("--max-attempts", type=int, default=MAX_ATTEMPTS)
    parser.add_argument("--canary-every", type=int, default=config.CANARY_EVERY)
    parser.add_argument("--no-canary", action="store_true")
    parser.add_argument("--no-constrained", action="store_true",
                        help="exercise the §9.3 validate-and-retry fallback instead of the grammar")
    parser.add_argument("--constrained", action="store_true",
                        help="assume the grammar works without a verification artifact")
    parser.add_argument("--run-id", default=None)
    parser.add_argument("--dry-run", action="store_true", help="print the work queue and exit; loads no model")
    args = parser.parse_args()

    spec = config.arm_config(args.arm)
    if not spec.get("available"):
        print(json.dumps({"arm": args.arm, "blocked": spec.get("blocked_reason")}, indent="\t"))
        return 1

    out = args.out or config.results_path(args.arm, args.items)
    if spec.get("results_override") and args.out is None:
        # The incumbent's results are the premise run file. Refuse to append bake-off rows to
        # a neighbouring workstream's artifact by accident: it is an input here, never an output.
        print(json.dumps({
            "arm": args.arm,
            "refusing": "this arm's results already exist and are owned by another workstream",
            "results_file": str(out),
            "explanation": (
                "The premise run covered this exact repo, revision, prompt pair, schema and "
                "resolution cap over all 142 included items. score.py reads it directly. "
                "Pass an explicit --out to run it again anyway."),
        }, indent="\t"))
        return 0

    items = load_items(args.items)
    if args.only_sha:
        wanted = set(args.only_sha)
        items = [i for i in items if i.image_sha256 in wanted]
    variants = default_variants()
    if args.variant:
        wanted_v = set(args.variant)
        variants = [v for v in variants if v.variant in wanted_v]
    assert variants, "no prompt variant selected"

    constrained, constrained_why = decide_constrained(
        args.arm, args.no_constrained, args.constrained, args.dry_run)

    done = completed_keys(out)
    queue: list[tuple[EvalItem, PromptVariant]] = [
        (item, variant)
        for item in items
        for variant in variants
        if bakeoff_row_key(args.arm, item.image_sha256, variant) not in done
    ]

    def key(i: EvalItem, v: PromptVariant) -> str:
        return bakeoff_row_key(args.arm, i.image_sha256, v)

    ledger_path = out.with_suffix(".attempts.jsonl")
    if args.dry_run:
        # Read-only: a dry run must not create files in the data directory.
        counts: dict[str, int] = {}
        for record in read_jsonl(ledger_path):
            counts[record["row_key"]] = max(counts.get(record["row_key"], 0),
                                            int(record.get("attempt", 0)))
        ledger = None
        attempts_of = counts.get
    else:
        ledger = AttemptLedger(ledger_path)
        attempts_of = ledger.attempts

    poisoned = [(i, v) for (i, v) in queue if (attempts_of(key(i, v)) or 0) >= args.max_attempts]
    queue = [(i, v) for (i, v) in queue if (attempts_of(key(i, v)) or 0) < args.max_attempts]

    print(json.dumps({
        "arm": args.arm,
        "model": spec["hf_repo"],
        "revision": spec["hf_revision"],
        "item_set": args.items,
        "items": len(items),
        "variants": [v.id for v in variants],
        "already_done": len(done),
        "queued": len(queue),
        "poisoned_over_attempt_cap": len(poisoned),
        "out": str(out),
        "long_edge_cap": args.long_edge,
        "constrained_decoding": constrained,
        "constrained_decoding_reason": constrained_why,
    }, indent="\t"), flush=True)

    if args.dry_run:
        return 0
    assert ledger is not None

    sink = JsonlSink(out)

    # Poison pills first: they get a terminal `failed` row so they leave the queue for good.
    for item, variant in poisoned:
        sink.write({
            "row_key": key(item, variant),
            "arm": args.arm,
            "item_set": args.items,
            "status": "failed",
            "error_class": "AttemptCapExhausted",
            "error_message": f"{ledger.attempts(key(item, variant))} attempts recorded, "
                             f"cap is {args.max_attempts}; no row was ever produced",
            "parse_failed": False,
            "attempts": ledger.attempts(key(item, variant)),
            "parsed": None,
            "raw_text": "",
            "is_canary": False,
            "run_id": args.run_id or "(pre-load)",
            "image_sha256": item.image_sha256,
            "image_path": item.image_path,
            "prompt_variant": variant.variant,
            "schema_version": variant.schema_version,
            "prompt_hash": variant.prompt_hash,
            "decoded_at": utc_now(),
        })

    if not queue:
        print("nothing to do", flush=True)
        sink.close()
        ledger.close()
        return 0

    manifest = load_arm_manifest(args.arm)
    if manifest.get("hashes_computed") is False:
        raise RuntimeError(
            f"{config.manifest_path(args.arm)} was written with --skip-hash; "
            f"re-run pin_arms.py without it before producing a real run")
    print(f"loading {manifest['model_id']} @ {manifest['model_revision'][:12]} ...", flush=True)
    oracle = ArmOracle(args.arm, manifest)
    print(f"model loaded in {oracle.load_seconds:.1f}s", flush=True)

    if constrained:
        status = oracle.grammar_status(variants[0])
        if not status.available:
            raise RuntimeError(
                f"arm {args.arm} was recorded as grammar-capable but the processor did not "
                f"build in this process: {status.detail}")

    run_id = args.run_id or new_run_id()
    canary_item = None if args.no_canary else load_canary_item(items)

    def run_one(item: EvalItem, variant: PromptVariant, is_canary: bool, index: int) -> dict:
        # A canary row must never satisfy the queue: the canary image can itself be an item.
        row_key = key(item, variant) + ("|canary" if is_canary else "")
        image, source_edge, processed_edge = normalize_image(item.absolute_path, args.long_edge)
        if not is_canary:
            ledger.record(row_key, item.image_path)
        answer = oracle.ask(image, variant, max_attempts=args.max_attempts, constrained=constrained)
        row = provenance(run_id, args.arm, args.items, variant, oracle, item,
                         source_edge, processed_edge, constrained)
        row.update({
            "row_key": row_key,
            "item_index": index,
            "is_canary": is_canary,
            "status": answer.status,
            "parsed": answer.parsed,
            "raw_text": answer.raw_text,        # verbatim model output (§9.1)
            "attempts": answer.attempts,
            "parse_failed": answer.parse_failed,
            "error_class": answer.error_class,
            "error_message": answer.error_message,
            "prompt_tokens": answer.prompt_tokens,
            "generation_tokens": answer.generation_tokens,
            "generation_seconds": round(answer.generation_seconds, 4),
            "peak_memory_gb": answer.peak_memory_gb,
            "gradient_truth": item.gradient_truth,
            "gradient_truth_conflicted": item.conflicted,
        })
        return row

    canary_variant = variants[0]
    canary_baseline: str | None = None
    prior_canary = [r for r in read_jsonl(out)
                    if r.get("is_canary") and r.get("prompt_variant") == canary_variant.variant
                    and r.get("status") == "ok"]
    if prior_canary:
        canary_baseline = canary_fingerprint(prior_canary[:1])

    processed = 0
    started = time.time()
    exit_code = 0
    try:
        for index, (item, variant) in enumerate(queue):
            if args.limit is not None and processed >= args.limit:
                break
            if canary_item is not None and processed % args.canary_every == 0:
                try:
                    crow = run_one(canary_item, canary_variant, True, index)
                except GpuFault as fault:
                    print(f"GPU FAULT on the canary at item {index}: {fault}", flush=True)
                    exit_code = 5
                    break
                sink.write(crow)
                if crow["status"] != "ok":
                    print(f"CANARY FAILED TO DECODE at item {index}: {crow['error_class']}", flush=True)
                    exit_code = 3
                    break
                fingerprint = canary_fingerprint([crow])
                if canary_baseline is None:
                    canary_baseline = fingerprint
                    print(f"canary baseline set: {crow['parsed']}", flush=True)
                elif fingerprint != canary_baseline:
                    print("CANARY MISMATCH — halting (pipeline §5.3). "
                          f"index={index} now={crow['parsed']}", flush=True)
                    exit_code = 3
                    break

            try:
                row = run_one(item, variant, False, index)
            except GpuFault as fault:
                # No terminal row is written on purpose: `failed` is terminal, and a poisoned
                # Metal context would otherwise mark every remaining item failed in seconds.
                # The attempt ledger already recorded this attempt, so an image that does this
                # three times still becomes a poison pill instead of looping forever.
                print(f"GPU FAULT at item {index} ({item.image_id} {variant.variant}): {fault}",
                      flush=True)
                print("halting this process; the supervisor restarts into a fresh Metal context",
                      flush=True)
                exit_code = 5
                break
            sink.write(row)
            processed += 1
            rate = (time.time() - started) / processed
            print(f"[{processed}/{len(queue)}] {item.image_id} {variant.variant} "
                  f"{row['status']} {row['generation_seconds']:.1f}s "
                  f"({rate:.1f}s/item avg) {row['parsed']}", flush=True)
    finally:
        sink.close()
        ledger.close()

    elapsed = time.time() - started
    print(json.dumps({
        "arm": args.arm,
        "item_set": args.items,
        "processed_this_process": processed,
        "elapsed_seconds": round(elapsed, 1),
        "seconds_per_inference": round(elapsed / processed, 2) if processed else None,
        "run_id": run_id,
        "exit_code": exit_code,
    }, indent="\t"), flush=True)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
