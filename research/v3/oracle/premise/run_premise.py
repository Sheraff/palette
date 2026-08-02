"""Premise-test worker: run the oracle over the eval set, one JSONL row per (image, variant).

    .venv/bin/python run_premise.py --out <results.jsonl> [--limit N] [--variant A]
                                   [--only-sha <sha256> ...] [--no-canary] [--dry-run]

Hygiene, all of it from ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md §5:
  - one line per record, flushed and fsynced immediately; never accumulate in memory
  - resume by reading back completed row keys; the queue is (all - done) at startup
  - never overwrite a run file; a resumed run appends
  - per-image attempt counter persisted BEFORE inference, so a deterministically-crashing
    image is retried MAX_ATTEMPTS times, marked `failed`, and never retried again
  - `failed` is a status in the output, never an absence of rows
  - canary re-run every CANARY_EVERY items, diffed against the run's first canary result;
    a mismatch HALTS the run (exit 3) rather than warning

Exit codes: 0 done, 1 unexpected error (supervisor should restart), 3 canary mismatch
(supervisor must NOT restart), 4 attempt cap exhausted for everything left.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    CANARY_EVERY, DATA_DIR, MAX_ATTEMPTS, RESOLUTION_CAP_PX, USE_CONSTRAINED_DECODING,
    AttemptLedger, EvalItem, JsonlSink, Oracle, PromptVariant,
    completed_keys, default_variants, load_eval_set, load_model_manifest, new_run_id,
    normalize_image, provenance, read_jsonl, row_key, utc_now,
)

# [REVIEWED] Pipeline §5.3: "Pick a canary that is typical, not pathological." Without the
# stage-1 embedding clusters (a different workstream), typical is approximated by a pinned,
# deterministic rule over the eval set: among included entries that are 640 px JPEGs whose
# accepted palettes agreed unanimously and were graded more than once, take the
# lexicographically first content hash. Recorded in canary.json so it never silently moves.
CANARY_SELECTION_RULE = (
    "included AND format=jpeg AND longEdgePx=640 AND agreement=unanimous AND observationCount>=2, "
    "then lexicographically smallest image sha256"
)
CANARY_PATH = DATA_DIR / "canary.json"


def choose_canary(items: list[EvalItem], eval_doc_path: Path) -> EvalItem:
    doc = json.loads(eval_doc_path.read_text())
    by_sha = {i.image_sha256: i for i in items}
    eligible = [
        e["image"]["sha256"] for e in doc["entries"]
        if e["included"]
        and e["image"]["format"] == "jpeg"
        and e["image"]["longEdgePx"] == 640
        and e["groundTruth"]["agreementAmongAcceptedPalettes"] == "unanimous"
        and e["groundTruth"]["observationCount"] >= 2
    ]
    assert eligible, "no eval-set entry satisfies the canary selection rule"
    return by_sha[sorted(eligible)[0]]


def canary_fingerprint(rows: list[dict]) -> str:
    """What must not drift: the parsed answer and the raw bytes behind it."""
    return json.dumps({"parsed": rows[0]["parsed"], "raw": rows[0]["raw_text"]}, sort_keys=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True, help="results JSONL (appended, never truncated)")
    parser.add_argument("--eval-set", type=Path, default=DATA_DIR / "eval-set.json")
    parser.add_argument("--variant", action="append", default=None, help="A and/or B; default both")
    parser.add_argument("--only-sha", action="append", default=None, help="restrict to these image sha256s")
    parser.add_argument("--limit", type=int, default=None, help="stop after N inferences this process")
    parser.add_argument("--long-edge", type=int, default=RESOLUTION_CAP_PX)
    parser.add_argument("--max-attempts", type=int, default=MAX_ATTEMPTS)
    parser.add_argument("--canary-every", type=int, default=CANARY_EVERY)
    parser.add_argument("--no-canary", action="store_true")
    parser.add_argument("--no-constrained", action="store_true",
                        help="exercise the §9.3 validate-and-retry fallback instead of the grammar")
    parser.add_argument("--run-id", default=None, help="reuse a run id when resuming a specific run")
    parser.add_argument("--dry-run", action="store_true", help="print the work queue and exit; loads no model")
    args = parser.parse_args()

    items, eval_meta = load_eval_set(args.eval_set)
    included = [i for i in items if i.included]
    if args.only_sha:
        wanted = set(args.only_sha)
        included = [i for i in included if i.image_sha256 in wanted]
    variants = default_variants()
    if args.variant:
        wanted_v = set(args.variant)
        variants = [v for v in variants if v.variant in wanted_v]
    assert variants, "no prompt variant selected"

    done = completed_keys(args.out)
    queue: list[tuple[EvalItem, PromptVariant]] = [
        (item, variant)
        for item in included
        for variant in variants
        if row_key(item.image_sha256, variant) not in done
    ]

    ledger = AttemptLedger(args.out.with_suffix(".attempts.jsonl"))
    poisoned = [(i, v) for (i, v) in queue if ledger.attempts(row_key(i.image_sha256, v)) >= args.max_attempts]
    queue = [(i, v) for (i, v) in queue if ledger.attempts(row_key(i.image_sha256, v)) < args.max_attempts]

    print(json.dumps({
        "eval_set": str(args.eval_set),
        "included_images": len(included),
        "variants": [v.id for v in variants],
        "already_done": len(done),
        "queued": len(queue),
        "poisoned_over_attempt_cap": len(poisoned),
        "out": str(args.out),
        "long_edge_cap": args.long_edge,
        "constrained_decoding": not args.no_constrained,
    }, indent="\t"), flush=True)

    if args.dry_run:
        ledger.close()
        return 0

    sink = JsonlSink(args.out)

    # Poison pills first: they get a terminal `failed` row so they leave the queue for good.
    for item, variant in poisoned:
        sink.write({
            "row_key": row_key(item.image_sha256, variant),
            "status": "failed",
            "error_class": "AttemptCapExhausted",
            "error_message": f"{ledger.attempts(row_key(item.image_sha256, variant))} attempts recorded, "
                             f"cap is {args.max_attempts}; no row was ever produced",
            "parse_failed": False,
            "attempts": ledger.attempts(row_key(item.image_sha256, variant)),
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

    manifest = load_model_manifest()
    print(f"loading {manifest['model_id']} @ {manifest['model_revision'][:12]} ...", flush=True)
    oracle = Oracle(manifest)
    print(f"model loaded in {oracle.load_seconds:.1f}s", flush=True)

    run_id = args.run_id or new_run_id()
    constrained = not args.no_constrained

    canary_item = None if args.no_canary else choose_canary(items, args.eval_set)
    if canary_item is not None:
        CANARY_PATH.parent.mkdir(parents=True, exist_ok=True)
        CANARY_PATH.write_text(json.dumps({
            "selection_rule": CANARY_SELECTION_RULE,
            "image_path": canary_item.image_path,
            "image_sha256": canary_item.image_sha256,
            "artwork_id": canary_item.artwork_id,
        }, indent="\t") + "\n")

    def run_one(item: EvalItem, variant: PromptVariant, is_canary: bool, index: int) -> dict:
        # A canary row must never satisfy the queue. The canary image is itself an eval-set
        # item, so without the suffix its first canary row would mark its real work done and
        # the analysis (which drops canary rows) would silently lose that image's answer.
        key = row_key(item.image_sha256, variant) + ("|canary" if is_canary else "")
        image, source_edge, processed_edge = normalize_image(item.absolute_path, args.long_edge)
        if not is_canary:
            ledger.record(key, item.image_path)
        answer = oracle.ask(image, variant, max_attempts=args.max_attempts, constrained=constrained)
        row = provenance(run_id, variant, oracle, item, source_edge, processed_edge)
        row.update({
            "row_key": key,
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
            "constrained_decoding": constrained,
            "gradient_truth": item.gradient_truth,
            "gradient_truth_conflicted": item.conflicted,
        })
        return row

    # The canary baseline: whatever this run's first canary answer is. Compared against the
    # rest of this run, and (below) against any canary rows an earlier run already wrote.
    canary_variant = variants[0]
    canary_baseline: str | None = None
    prior_canary = [r for r in read_jsonl(args.out)
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
                crow = run_one(canary_item, canary_variant, True, index)
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

            row = run_one(item, variant, False, index)
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
        "processed_this_process": processed,
        "elapsed_seconds": round(elapsed, 1),
        "seconds_per_inference": round(elapsed / processed, 2) if processed else None,
        "run_id": run_id,
        "exit_code": exit_code,
    }, indent="\t"), flush=True)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
