"""Resolution-ladder worker: run the oracle over every rendition of an artwork.

    ../premise/.venv/bin/python run_ladder.py --scope {full|sample|pairs} --out <results.jsonl>
                                             [--limit N] [--only-artwork ID ...]
                                             [--include-duplicate-sizes] [--no-canary]
                                             [--long-edge N] [--dry-run]

Same hygiene as the premise runner (ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md §5), because
it is the same machinery — imported, not copied:
  - one line per record, flushed and fsynced immediately; never accumulate in memory
  - resume by reading back completed row keys; the queue is (all - done) at startup
  - never overwrite a run file; a resumed run appends
  - per-image attempt counter persisted BEFORE inference, so a deterministically-crashing
    image is retried MAX_ATTEMPTS times, marked `failed`, and never retried again
  - `failed` is a status in the output, never an absence of rows
  - canary re-run every CANARY_EVERY items, diffed against the run's first canary result;
    a mismatch HALTS the run (exit 3) rather than warning

The one deliberate difference: images run at NATIVE resolution (pipeline §7.5 — resolution
is the independent variable). `--long-edge N` can cap for MEMORY reasons only, and if it is
used the cap is stamped into every row and into the resume key.

Exit codes: 0 done, 1 unexpected error (supervisor should restart), 3 canary mismatch
(supervisor must NOT restart), 4 attempt cap exhausted for everything left.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common_ladder import (  # noqa: E402
    CANARY_EVERY, CANARY_PATH, CANARY_SELECTION_RULE, DATA_DIR, LADDER_LONG_EDGE_CAP_PX,
    LADDER_VARIANT, MANIFEST_PATH, MAX_ATTEMPTS, PROMPT_PATH,
    AttemptLedger, JsonlSink, LadderItem, Oracle,
    bin_of, choose_canary, completed_keys, items_for_scope, ladder_provenance, ladder_row_key,
    load_manifest, load_model_manifest, load_prompt_variant, new_run_id, normalize_image,
    read_jsonl, utc_now,
)


def canary_fingerprint(rows: list[dict]) -> str:
    """What must not drift: the parsed answer and the raw bytes behind it."""
    return json.dumps({"parsed": rows[0]["parsed"], "raw": rows[0]["raw_text"]}, sort_keys=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scope", required=True, choices=("full", "sample", "pairs"),
                        help="full = all ladder-eligible artworks; sample = the frozen "
                             "stratified ~400; pairs = the 644 sharded cross-tier pairs")
    parser.add_argument("--out", type=Path, required=True, help="results JSONL (appended, never truncated)")
    parser.add_argument("--manifest", type=Path, default=MANIFEST_PATH)
    parser.add_argument("--only-artwork", action="append", default=None,
                        help="restrict to these artwork ids (repeatable; used by the smoke test)")
    parser.add_argument("--include-duplicate-sizes", action="store_true",
                        help="also run renditions that repeat a size already covered (codec control)")
    parser.add_argument("--limit", type=int, default=None, help="stop after N inferences this process")
    parser.add_argument("--long-edge", type=int, default=LADDER_LONG_EDGE_CAP_PX,
                        help="cap the long edge. MEMORY ONLY (pipeline §7.5); 0 = native, the default")
    parser.add_argument("--max-attempts", type=int, default=MAX_ATTEMPTS)
    parser.add_argument("--canary-every", type=int, default=CANARY_EVERY)
    parser.add_argument("--no-canary", action="store_true")
    parser.add_argument("--no-constrained", action="store_true",
                        help="exercise the §9.3 validate-and-retry fallback instead of the grammar")
    parser.add_argument("--run-id", default=None, help="reuse a run id when resuming a specific run")
    parser.add_argument("--dry-run", action="store_true", help="print the work queue and exit; loads no model")
    args = parser.parse_args()

    manifest = load_manifest(args.manifest)
    variant = load_prompt_variant(PROMPT_PATH)
    assert variant.variant == LADDER_VARIANT, f"{PROMPT_PATH.name} is variant {variant.variant}"

    items = items_for_scope(manifest, args.scope, args.include_duplicate_sizes)
    if args.only_artwork:
        wanted = set(args.only_artwork)
        items = [i for i in items if i.artwork_id in wanted]
        assert items, f"no items for artworks {sorted(wanted)} in scope {args.scope}"

    done = completed_keys(args.out)
    queue: list[LadderItem] = [i for i in items if ladder_row_key(i.image_sha256, variant, args.long_edge) not in done]

    ledger = AttemptLedger(args.out.with_suffix(".attempts.jsonl"))
    key_of = lambda i: ladder_row_key(i.image_sha256, variant, args.long_edge)  # noqa: E731
    poisoned = [i for i in queue if ledger.attempts(key_of(i)) >= args.max_attempts]
    queue = [i for i in queue if ledger.attempts(key_of(i)) < args.max_attempts]

    by_bin = Counter(bin_of(i.long_edge_px if not args.long_edge else min(i.long_edge_px, args.long_edge))
                     for i in queue)
    print(json.dumps({
        "scope": args.scope,
        "manifest": str(args.manifest),
        "prompt": f"{variant.schema_version}/{variant.variant}",
        "prompt_hash": variant.prompt_hash,
        "artworks": len({i.artwork_id for i in items}),
        "images": len(items),
        "already_done": len(done),
        "queued": len(queue),
        "poisoned_over_attempt_cap": len(poisoned),
        "queued_by_long_edge_bin": dict(sorted(by_bin.items(), key=lambda kv: int(kv[0].split("-")[0].rstrip("+")))),
        "largest_queued_px": max((i.long_edge_px for i in queue), default=0),
        "resolution_policy": "native" if not args.long_edge else f"capped at {args.long_edge}px (MEMORY ONLY)",
        "out": str(args.out),
        "constrained_decoding": not args.no_constrained,
    }, indent="\t"), flush=True)

    if args.dry_run:
        ledger.close()
        return 0

    sink = JsonlSink(args.out)

    # Poison pills first: they get a terminal `failed` row so they leave the queue for good.
    for item in poisoned:
        sink.write({
            "row_key": key_of(item),
            "status": "failed",
            "error_class": "AttemptCapExhausted",
            "error_message": f"{ledger.attempts(key_of(item))} attempts recorded, cap is "
                             f"{args.max_attempts}; no row was ever produced",
            "parse_failed": False,
            "attempts": ledger.attempts(key_of(item)),
            "parsed": None,
            "raw_text": "",
            "is_canary": False,
            "scope": args.scope,
            "run_id": args.run_id or "(pre-load)",
            "collection": item.collection,
            "image_sha256": item.image_sha256,
            "image_path": item.image_path,
            "artwork_id": item.artwork_id,
            "source_long_edge_px": item.long_edge_px,
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

    model_manifest = load_model_manifest()
    print(f"loading {model_manifest['model_id']} @ {model_manifest['model_revision'][:12]} ...", flush=True)
    oracle = Oracle(model_manifest)
    print(f"model loaded in {oracle.load_seconds:.1f}s", flush=True)

    run_id = args.run_id or new_run_id()
    constrained = not args.no_constrained

    canary_item = None if args.no_canary else choose_canary(manifest)
    if canary_item is not None:
        CANARY_PATH.parent.mkdir(parents=True, exist_ok=True)
        CANARY_PATH.write_text(json.dumps({
            "selection_rule": CANARY_SELECTION_RULE,
            "image_path": canary_item.image_path,
            "image_sha256": canary_item.image_sha256,
            "artwork_id": canary_item.artwork_id,
            "long_edge_px": canary_item.long_edge_px,
        }, indent="\t") + "\n")

    def run_one(item: LadderItem, is_canary: bool, index: int) -> dict:
        # A canary row must never satisfy the queue: the canary image is a real ladder
        # rendition, so without the suffix its first canary row would mark that rung done
        # and the analysis (which drops canary rows) would lose it.
        key = key_of(item) + ("|canary" if is_canary else "")
        image, source_edge, processed_edge = normalize_image(item.absolute_path, args.long_edge)
        if not is_canary:
            ledger.record(key, item.image_path)
        answer = oracle.ask(image, variant, max_attempts=args.max_attempts, constrained=constrained)
        row = ladder_provenance(run_id, variant, oracle, item, source_edge, processed_edge, args.long_edge)
        row.update({
            "row_key": key,
            "scope": args.scope,
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
        })
        return row

    # The canary baseline: whatever this run's first canary answer is. Compared against the
    # rest of this run, and against any canary rows an earlier run already wrote.
    canary_baseline: str | None = None
    prior_canary = [r for r in read_jsonl(args.out)
                    if r.get("is_canary") and r.get("status") == "ok"]
    if prior_canary:
        canary_baseline = canary_fingerprint(prior_canary[:1])

    processed = 0
    started = time.time()
    exit_code = 0
    try:
        for index, item in enumerate(queue):
            if args.limit is not None and processed >= args.limit:
                break
            if canary_item is not None and processed % args.canary_every == 0:
                crow = run_one(canary_item, True, index)
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

            row = run_one(item, False, index)
            sink.write(row)
            processed += 1
            rate = (time.time() - started) / processed
            remaining = len(queue) - processed
            print(f"[{processed}/{len(queue)}] {item.artwork_id[:12]} {item.long_edge_px}px "
                  f"{row['status']} {row['generation_seconds']:.1f}s "
                  f"({rate:.1f}s/item avg, ~{remaining * rate / 60:.0f} min left) {row['parsed']}",
                  flush=True)
    finally:
        sink.close()
        ledger.close()

    elapsed = time.time() - started
    print(json.dumps({
        "scope": args.scope,
        "processed_this_process": processed,
        "elapsed_seconds": round(elapsed, 1),
        "seconds_per_inference": round(elapsed / processed, 2) if processed else None,
        "run_id": run_id,
        "exit_code": exit_code,
    }, indent="\t"), flush=True)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
