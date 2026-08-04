"""Spread-wording mini-pilot worker: 4 arms x 19 hand-picked covers, one JSONL row each.

    .venv/bin/python run_spread_pilot.py --out ../../data/oracle-premise/spread-wording-pilot-1.jsonl
                                         [--list spread-pilot-19.txt] [--limit N] [--dry-run]

SCHEMA_V2_PROPOSAL.md §4. Three candidate wordings (A/B/C) of `signature_carrier`'s spread
value, plus arm N which drops the value entirely to supply §4's without-the-value baseline.
The arms are byte-identical outside question 13 — `make_spread_pilot_prompts.py` proves it.

Why this does not go through `run_premise.py`. That worker's queue is the eval set filtered by
`included`, its prompt sets come from the `PROMPT_SETS` registry, and it enforces one schema
version per file. All three are correct for a real run and all three are wrong here: the probe
set is hand-picked rather than sampled, the arms are deliberately unregistered (they are an
instrument, not a question set), and `common.py` is owned by another workstream this week and
must not be edited. So this worker reads the list file directly and computes its own row keys.

It keeps the hygiene that matters (pipeline §5): one flushed+fsynced line per row, resume by
reading back completed keys, never truncate an existing file, `failed` is a status and never an
absence of rows. It drops the canary — 76 inferences at temperature 0 in a single process is
inside the window a canary exists to police, and no canary image belongs to this probe set.

Model: whatever `common.py` pins — Qwen3-VL-30B-A3B-Instruct-6bit at the pinned revision.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    MAX_ATTEMPTS, PROMPTS_DIR, REPO_ROOT, RESOLUTION_CAP_PX,
    JsonlSink, Oracle, load_model_manifest, load_prompt_variant, new_run_id, normalize_image,
    read_jsonl, sha256_file, utc_now,
)

PILOT_SCHEMA_VERSION = "spread-wording-pilot.v1"
ARMS = ("A", "B", "C", "N")
DEFAULT_LIST = Path(__file__).resolve().parent / "spread-pilot-19.txt"


def read_list(path: Path) -> list[dict]:
    """`<group>\\t<repo-relative path>\\t<what the eye saw>`, `#` comments, blank lines ignored."""
    items = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        assert len(parts) >= 2, f"malformed list line (needs tabs): {line!r}"
        group, rel = parts[0].strip(), parts[1].strip()
        assert group in ("multi", "single", "none"), f"unknown group {group!r}"
        abs_path = REPO_ROOT / rel
        assert abs_path.exists(), f"listed image does not exist: {abs_path}"
        items.append({
            "group": group,
            "image_path": rel,
            "absolute_path": abs_path,
            "eye_note": parts[2].strip() if len(parts) > 2 else "",
        })
    assert items, f"{path} yielded no images"
    rels = [i["image_path"] for i in items]
    assert len(set(rels)) == len(rels), "the list repeats an image"
    return items


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--list", type=Path, default=DEFAULT_LIST)
    parser.add_argument("--arm", action="append", default=None, choices=list(ARMS))
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--long-edge", type=int, default=RESOLUTION_CAP_PX)
    parser.add_argument("--max-attempts", type=int, default=MAX_ATTEMPTS)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    items = read_list(args.list)
    arms = tuple(args.arm) if args.arm else ARMS
    variants = {a: load_prompt_variant(
        PROMPTS_DIR / "spread-wording-pilot" / f"spread-pilot.{a}.json", PILOT_SCHEMA_VERSION)
        for a in arms}

    # Guard the whole point of the experiment: the arms must differ only in the carrier vocabulary.
    schemas = {a: json.dumps(v.json_schema, sort_keys=True).replace(
        json.dumps(v.vocabularies["signature_carrier"]), "<CARRIER>") for a, v in variants.items()}
    assert len(set(schemas.values())) == 1, "arms differ outside signature_carrier — invalid probe"

    existing = read_jsonl(args.out, require=False)
    bad = {r.get("schema_version") for r in existing if r.get("schema_version")} - {PILOT_SCHEMA_VERSION}
    assert not bad, f"{args.out} already holds other schema version(s) {sorted(bad)}; use a new file"
    done = {r["row_key"] for r in existing if r.get("status") == "ok"}

    queue = [(item, a) for item in items for a in arms
             if f"{item['image_path']}|{PILOT_SCHEMA_VERSION}|{a}" not in done]

    print(json.dumps({
        "list": str(args.list), "images": len(items), "arms": list(arms),
        "groups": {g: sum(1 for i in items if i["group"] == g) for g in ("multi", "single", "none")},
        "already_done": len(done), "queued": len(queue), "out": str(args.out),
        "carrier_vocabularies": {a: list(v.vocabularies["signature_carrier"])
                                 for a, v in variants.items()},
    }, indent="\t"), flush=True)

    if args.dry_run:
        return 0
    if not queue:
        print("nothing to do", flush=True)
        return 0

    manifest = load_model_manifest()
    print(f"loading {manifest['model_id']} @ {manifest['model_revision'][:12]} ...", flush=True)
    oracle = Oracle(manifest)
    print(f"model loaded in {oracle.load_seconds:.1f}s", flush=True)

    run_id = new_run_id()
    sink = JsonlSink(args.out)
    processed = 0
    started = time.time()
    try:
        for item, arm in queue:
            if args.limit is not None and processed >= args.limit:
                break
            variant = variants[arm]
            image, source_edge, processed_edge = normalize_image(item["absolute_path"], args.long_edge)
            answer = oracle.ask(image, variant, max_attempts=args.max_attempts, constrained=True)
            sink.write({
                "row_key": f"{item['image_path']}|{PILOT_SCHEMA_VERSION}|{arm}",
                "run_id": run_id,
                "probe": "spread-wording-pilot-1",
                "arm": arm,
                "arm_role": "control_no_spread_value" if arm == "N" else "candidate",
                "group": item["group"],
                "eye_note": item["eye_note"],
                "image_path": item["image_path"],
                "image_sha256": sha256_file(item["absolute_path"]),
                "source_long_edge_px": source_edge,
                "processed_long_edge_px": processed_edge,
                "resolution_cap": args.long_edge,
                "schema_version": PILOT_SCHEMA_VERSION,
                "prompt_variant": arm,
                "prompt_hash": variant.prompt_hash,
                "schema_hash": variant.schema_hash,
                "file_hash": variant.file_hash,
                "carrier_vocabulary": list(variant.vocabularies["signature_carrier"]),
                "model_id": manifest["model_id"],
                "model_revision": manifest["model_revision"],
                "quantization": manifest["quantization"],
                "temperature": 0.0,
                "constrained_decoding": True,
                "status": answer.status,
                "parsed": answer.parsed,
                "raw_text": answer.raw_text,
                "attempts": answer.attempts,
                "parse_failed": answer.parse_failed,
                "error_class": answer.error_class,
                "error_message": answer.error_message,
                "prompt_tokens": answer.prompt_tokens,
                "generation_tokens": answer.generation_tokens,
                "generation_seconds": round(answer.generation_seconds, 4),
                "peak_memory_gb": answer.peak_memory_gb,
                "decoded_at": utc_now(),
            })
            processed += 1
            carrier = (answer.parsed or {}).get("signature_carrier")
            rate = (time.time() - started) / processed
            print(f"[{processed}/{len(queue)}] {item['image_path']:52s} arm={arm} "
                  f"{item['group']:6s} {answer.status} {answer.generation_seconds:5.1f}s "
                  f"({rate:.1f}s/item) carrier={carrier}", flush=True)
    finally:
        sink.close()

    elapsed = time.time() - started
    print(json.dumps({
        "processed": processed, "elapsed_seconds": round(elapsed, 1),
        "seconds_per_inference": round(elapsed / processed, 2) if processed else None,
        "run_id": run_id,
    }, indent="\t"), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
