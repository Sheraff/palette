"""One pass-group of the SAM determinism measurement. GPU JOB — hold the slot before running.

    .venv/bin/python determinism_probe.py --condition a --reps 3 --out determinism-1-a

Each invocation is ONE PROCESS. Conditions (b) and the cold-load number are measured by running
this script several times; conditions (a), (c) and (d) vary within one process. See
DETERMINISM_PREREG.md sec 3 for the full run plan, fixed before any of it ran.

WHAT "BYTE-IDENTICAL" MEANS HERE, precisely. For every detected region this script builds a
canonical byte string:

    {"area":"<float.hex>","bbox":["<hex>","<hex>","<hex>","<hex>"],"concept":"...",
     "idx":N,"rle":"<the COCO compressed-RLE string>","score":"<float.hex>"}

`float.hex()` is used rather than a rounded decimal because it is exact: two floats print the
same hex if and only if they are the same IEEE-754 double. A rounded decimal — which is what
run_sam.canary_digest uses, at 5 places — would hide a last-bit difference, and a last-bit
difference is exactly the shape a non-deterministic reduction produces. The regions' canonical
strings are concatenated in three orders and SHA-256'd:

    emit_digest    - emission order, unchanged. The strictest reading of the claim.
    keyed_digest   - sorted by (concept, instance_idx). This is the digest that governs STORED
                     ROWS, because run_sam keys every row on (image, concept, instance).
    content_digest - the instance_idx field deleted, then sorted. The pure multiset of masks,
                     scores and boxes: it answers "are these the same regions" independently of
                     what order they arrived in or what index they were handed.

Byte-identity is established by SHA-256 over those blobs and NOT by storing the blobs. Storing
every mask RLE for every pass would be ~41 MB of duplicated bytes to prove they are duplicates.
Per-region field digests ARE stored, so any mismatch can be localised to the region and the
field without re-running.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import random
import sys
import time
import uuid
from pathlib import Path

import common
import config

# [REVIEWED] Permutation seed, fixed in DETERMINISM_PREREG.md sec 3 before any pass ran.
ORDER_SEED = 20260804


def canonical_instance(inst: common.Instance, rle: str) -> dict:
    return {
        "area": float(inst.area_fraction).hex(),
        "bbox": [float(v).hex() for v in inst.bbox],
        "concept": inst.concept,
        "idx": inst.instance_idx,
        "rle": rle,
        "score": float(inst.score).hex(),
    }


def blob(items: list[dict]) -> bytes:
    return b"".join(
        json.dumps(it, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        for it in items
    )


def digests(canon: list[dict]) -> dict:
    emit = blob(canon)
    keyed = blob(sorted(canon, key=lambda c: (c["concept"], c["idx"])))
    stripped = [{k: v for k, v in c.items() if k != "idx"} for c in canon]
    content = blob(sorted(stripped, key=lambda c: json.dumps(c, sort_keys=True)))
    return {
        "emit_digest": hashlib.sha256(emit).hexdigest(),
        "keyed_digest": hashlib.sha256(keyed).hexdigest(),
        "content_digest": hashlib.sha256(content).hexdigest(),
        "emit_blob_bytes": len(emit),
        "keyed_blob_bytes": len(keyed),
        "content_blob_bytes": len(content),
    }


def permutations(n: int, count: int, seed: int, tag: str) -> list[list[int]]:
    """`count` DISTINCT non-identity permutations of range(n), seeded and reproducible."""
    rng = random.Random(f"{seed}:{tag}")
    identity = list(range(n))
    out: list[list[int]] = []
    guard = 0
    while len(out) < count and guard < 10_000:
        guard += 1
        p = identity[:]
        rng.shuffle(p)
        if p != identity and p not in out:
            out.append(p)
    if len(out) < count:
        raise SystemExit(f"could not build {count} distinct permutations of {n}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--condition", required=True,
                    help="a|b|c|d — recorded on every row, does not by itself change behaviour")
    ap.add_argument("--sample", default=str(config.DATA_DIR / "determinism-1-sample.json"))
    ap.add_argument("--out", required=True, help="output stem under research/v3/data/sam/")
    ap.add_argument("--reps", type=int, default=1)
    ap.add_argument("--permute-images", action="store_true",
                    help="rep k uses image permutation k (rep 0 stays canonical order)")
    ap.add_argument("--permute-concepts", action="store_true",
                    help="rep k uses concept permutation k (rep 0 stays canonical order)")
    ap.add_argument("--verify-weights", action="store_true",
                    help="re-hash the 3.5 GB safetensors during load; off by default so the "
                         "load number is the load, not the hash")
    args = ap.parse_args()

    doc = json.loads(Path(args.sample).read_text())
    entries = doc["entries"]
    n = len(entries)
    run_id = f"determinism-1-{args.condition}-{uuid.uuid4().hex[:8]}"
    out_path = config.DATA_DIR / f"{args.out}.jsonl"
    sink = common.JsonlSink(out_path)

    img_perms = permutations(n, max(args.reps, 1), ORDER_SEED, "images") if args.permute_images else []
    base_prompts = list(config.CONCEPT_PROMPTS)
    cp_perms = (permutations(len(base_prompts), max(args.reps, 1), ORDER_SEED, "concepts")
                if args.permute_concepts else [])

    common.register_image_plugins()

    # Decode every image ONCE, before the model exists, so decode cost is never inside a
    # measured inference and the exact same pixel buffer is handed to every pass. Decode
    # determinism is a separate question and is checked here rather than assumed: the
    # decoded bytes are hashed and the hash is stored on every pass row.
    decoded = []
    for e in entries:
        image, source_long_edge, processed_long_edge = common.decode_image(Path(e["absolute_path"]))
        decoded.append({
            "entry": e,
            "image": image,
            "pixel_sha256": hashlib.sha256(image.tobytes()).hexdigest(),
            "source_long_edge": source_long_edge,
            "processed_long_edge": processed_long_edge,
        })

    t_load0 = time.time()
    runtime = common.load_sam(verify_weights=args.verify_weights)
    load_wall = time.time() - t_load0

    meta = common.provenance(run_id, runtime)
    sink.write({
        "record_type": "run",
        "run_id": run_id,
        "condition": args.condition,
        "pid": os.getpid(),
        "started_at": common.utc_now(),
        "reps": args.reps,
        "permute_images": args.permute_images,
        "permute_concepts": args.permute_concepts,
        "verify_weights": args.verify_weights,
        "model_load_seconds": round(runtime.load_seconds, 4),
        "model_load_wall_seconds": round(load_wall, 4),
        "sample_n": n,
        "sample_file": Path(args.sample).name,
        "order_seed": ORDER_SEED,
        "image_permutations": img_perms,
        "concept_permutations": cp_perms,
        "platform": platform.platform(),
        "python": sys.version.split()[0],
        **meta,
    })
    print(f"[det] {run_id} cond={args.condition} pid={os.getpid()} "
          f"load={load_wall:.2f}s reps={args.reps}", flush=True)

    for rep in range(args.reps):
        order = img_perms[rep] if (args.permute_images and rep < len(img_perms)) else list(range(n))
        if args.permute_concepts and rep < len(cp_perms):
            prompts = tuple(base_prompts[i] for i in cp_perms[rep])
            concept_order = [c for c, _ in prompts]
        else:
            prompts = tuple(base_prompts)
            concept_order = [c for c, _ in prompts]

        for pos, idx in enumerate(order):
            d = decoded[idx]
            e = d["entry"]
            t0 = time.time()
            result = common.segment_concepts(runtime, d["image"], prompts=prompts)
            infer_seconds = time.time() - t0

            t1 = time.time()
            canon = [canonical_instance(inst, common.rle_encode(inst.mask))
                     for inst in result.instances]
            rle_seconds = time.time() - t1

            per_instance = [{
                "concept": c["concept"],
                "idx": c["idx"],
                "score_hex": c["score"],
                "bbox_hex": c["bbox"],
                "area_hex": c["area"],
                "rle_sha256": hashlib.sha256(c["rle"].encode()).hexdigest(),
                "rle_len": len(c["rle"]),
            } for c in canon]

            row = {
                "record_type": "pass",
                "run_id": run_id,
                "condition": args.condition,
                "pid": os.getpid(),
                "rep": rep,
                "process_position": pos,
                "rel_path": e["rel_path"],
                "image_sha256": e["image_sha256"],
                "pixel_sha256": d["pixel_sha256"],
                "stratum": e["stratum"],
                "width": result.width,
                "height": result.height,
                "n_instances": len(canon),
                "concept_order": concept_order,
                "image_order": order,
                "infer_seconds": round(infer_seconds, 6),
                "segment_seconds_total": round(result.seconds_total, 6),
                "rle_encode_seconds": round(rle_seconds, 6),
                "instances": per_instance,
                **digests(canon),
            }
            sink.write(row)
            print(f"[det] rep={rep} {pos+1}/{n} {e['rel_path'][:52]:52s} "
                  f"n={len(canon):3d} {infer_seconds:.2f}s {row['emit_digest'][:12]}", flush=True)

    sink.write({"record_type": "done", "run_id": run_id, "finished_at": common.utc_now()})
    sink.close()
    print(f"[det] done -> {out_path}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
