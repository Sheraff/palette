"""Compare the determinism passes. CPU ONLY — reads JSONL, never loads a model.

    .venv/bin/python analyze_determinism.py --out ../../data/sam/determinism-1-analysis.json

The comparison rule is DETERMINISM_PREREG.md sec 5, and this file is committed BEFORE the run so
the rule cannot be fitted to the numbers it reads.
"""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path

import common
import config

# [REVIEWED] The reference pass, DETERMINISM_PREREG.md sec 3: condition (a), rep 0.
REFERENCE = ("a", 0)

# [REVIEWED] DETERMINISM_PREREG.md sec 5. (a), (b) and (c) are gated on emit_digest; (d) is
# reported and never gated.
GATED_CONDITIONS = ("a", "b", "c")

STEMS = ("determinism-1-a", "determinism-1-b1", "determinism-1-b2", "determinism-1-b3",
         "determinism-1-c", "determinism-1-d")


def load_passes() -> tuple[list[dict], list[dict]]:
    passes, runs = [], []
    for stem in STEMS:
        p = config.DATA_DIR / f"{stem}.jsonl"
        if not p.exists():
            raise SystemExit(f"missing pass file: {p}")
        for rec in common.read_jsonl(p):
            if rec.get("record_type") == "pass":
                rec["_stem"] = stem
                passes.append(rec)
            elif rec.get("record_type") == "run":
                rec["_stem"] = stem
                runs.append(rec)
    return passes, runs


def pass_label(rec: dict) -> str:
    return f"{rec['_stem']}#rep{rec['rep']}"


def field_diff(ref: dict, other: dict) -> dict:
    """Localise a mismatch to regions and fields, keyed by (concept, idx)."""
    def by_key(rec):
        return {(i["concept"], i["idx"]): i for i in rec["instances"]}
    a, b = by_key(ref), by_key(other)
    only_ref = sorted(set(a) - set(b))
    only_other = sorted(set(b) - set(a))
    field_counts = {"score_hex": 0, "bbox_hex": 0, "area_hex": 0, "rle_sha256": 0}
    differing = []
    for k in sorted(set(a) & set(b)):
        fields = [f for f in field_counts if a[k][f] != b[k][f]]
        for f in fields:
            field_counts[f] += 1
        if fields:
            differing.append({"concept": k[0], "idx": k[1], "fields": fields})
    return {
        "regions_only_in_reference": [list(k) for k in only_ref],
        "regions_only_in_other": [list(k) for k in only_other],
        "regions_differing": differing,
        "regions_differing_count": len(differing),
        "differing_field_counts": field_counts,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    passes, runs = load_passes()
    ref_by_image = {}
    for rec in passes:
        if (rec["condition"], rec["rep"]) == REFERENCE:
            ref_by_image[rec["rel_path"]] = rec
    if not ref_by_image:
        raise SystemExit("no reference pass found")

    comparisons = []
    for rec in passes:
        if (rec["condition"], rec["rep"]) == REFERENCE:
            continue
        ref = ref_by_image.get(rec["rel_path"])
        if ref is None:
            raise SystemExit(f"reference missing for {rec['rel_path']}")
        entry = {
            "condition": rec["condition"],
            "pass": pass_label(rec),
            "pid": rec["pid"],
            "rel_path": rec["rel_path"],
            "stratum": rec["stratum"],
            "n_instances_reference": ref["n_instances"],
            "n_instances": rec["n_instances"],
            "pixel_sha256_match": ref["pixel_sha256"] == rec["pixel_sha256"],
            "emit_identical": ref["emit_digest"] == rec["emit_digest"],
            "keyed_identical": ref["keyed_digest"] == rec["keyed_digest"],
            "content_identical": ref["content_digest"] == rec["content_digest"],
            "emit_blob_bytes_reference": ref["emit_blob_bytes"],
            "emit_blob_bytes": rec["emit_blob_bytes"],
        }
        if not (entry["emit_identical"] and entry["keyed_identical"] and entry["content_identical"]):
            entry["diff"] = field_diff(ref, rec)
        comparisons.append(entry)

    # Also compare the reference against itself across images for the intra-(a) case: A1 and A2
    # are already in `comparisons` because only (a, rep 0) is excluded.

    by_condition = {}
    for cond in ("a", "b", "c", "d"):
        sub = [c for c in comparisons if c["condition"] == cond]
        if not sub:
            continue
        by_condition[cond] = {
            "comparisons": len(sub),
            "distinct_passes": sorted({c["pass"] for c in sub}),
            "emit_identical": sum(1 for c in sub if c["emit_identical"]),
            "emit_differing": sum(1 for c in sub if not c["emit_identical"]),
            "keyed_identical": sum(1 for c in sub if c["keyed_identical"]),
            "keyed_differing": sum(1 for c in sub if not c["keyed_identical"]),
            "content_identical": sum(1 for c in sub if c["content_identical"]),
            "content_differing": sum(1 for c in sub if not c["content_identical"]),
            "pixel_sha256_mismatches": sum(1 for c in sub if not c["pixel_sha256_match"]),
            "region_count_mismatches": sum(
                1 for c in sub if c["n_instances"] != c["n_instances_reference"]),
            "gated": cond in GATED_CONDITIONS,
            "verdict": None,
        }
        if cond in GATED_CONDITIONS:
            by_condition[cond]["verdict"] = (
                "PASS" if by_condition[cond]["emit_differing"] == 0 else "FAIL")

    # (d) reading, per DETERMINISM_PREREG.md sec 5.
    d_reading = None
    if "d" in by_condition:
        d = by_condition["d"]
        if d["content_differing"] > 0:
            d_reading = "d4 - substantive boundary: concept order changes the regions returned"
        elif d["keyed_differing"] > 0:
            d_reading = "d3 - row-key boundary: same regions, different instance_idx assignment"
        elif d["emit_differing"] > 0:
            d_reading = "d2 - cosmetic boundary: emission order only; stored rows unaffected"
        else:
            d_reading = "d1 - no boundary found: concept order does not affect output"

    overall = ("PASS" if all(by_condition[c]["verdict"] == "PASS"
                             for c in GATED_CONDITIONS if c in by_condition) else "FAIL")

    # ---------------------------------------------------------------- speed
    infer = [r["infer_seconds"] for r in passes]
    by_res = {}
    for r in passes:
        key = f"{r['width']}x{r['height']}"
        by_res.setdefault(key, []).append(r["infer_seconds"])

    def dist(xs: list[float]) -> dict:
        xs = sorted(xs)
        return {
            "n": len(xs),
            "min": round(xs[0], 4),
            "median": round(statistics.median(xs), 4),
            "mean": round(statistics.fmean(xs), 4),
            "p95": round(xs[min(len(xs) - 1, int(round(0.95 * (len(xs) - 1))))], 4),
            "max": round(xs[-1], 4),
        }

    loads = [{"stem": r["_stem"], "condition": r["condition"], "pid": r["pid"],
              "verify_weights": r["verify_weights"],
              "load_wall_seconds": r["model_load_wall_seconds"]} for r in runs]

    speed = {
        "per_image_inference_seconds": dist(infer),
        "per_image_inference_by_resolution": {k: dist(v) for k, v in sorted(by_res.items())},
        "rle_encode_seconds": dist([r["rle_encode_seconds"] for r in passes]),
        "model_load": loads,
        "model_load_no_verify_median": round(statistics.median(
            [l["load_wall_seconds"] for l in loads if not l["verify_weights"]]), 4),
    }

    out = {
        "batch": "sam-determinism-1",
        "analyzed_at": common.utc_now(),
        "prereg": "research/v3/oracle/sam/DETERMINISM_PREREG.md",
        "reference_pass": f"condition {REFERENCE[0]}, rep {REFERENCE[1]}",
        "concept_set_hash": common.concept_set_hash(),
        "model_revision": config.MODEL_REVISION,
        "total_inferences": len(passes),
        "images": len(ref_by_image),
        "overall_verdict_gated_abc": overall,
        "by_condition": by_condition,
        "condition_d_reading": d_reading,
        "speed": speed,
        "comparisons": comparisons,
    }
    Path(args.out).write_text(json.dumps(out, indent=2, sort_keys=True) + "\n")

    print(f"[analyze] inferences={len(passes)} images={len(ref_by_image)}")
    for cond, v in sorted(by_condition.items()):
        print(f"  ({cond}) n={v['comparisons']:3d} emit {v['emit_identical']}/{v['comparisons']} "
              f"keyed {v['keyed_identical']}/{v['comparisons']} "
              f"content {v['content_identical']}/{v['comparisons']}  {v['verdict'] or 'reported'}")
    print(f"  (d) reading: {d_reading}")
    print(f"  OVERALL (a,b,c): {overall}")
    print(f"  per-image inference: median {speed['per_image_inference_seconds']['median']}s "
          f"p95 {speed['per_image_inference_seconds']['p95']}s")
    print(f"  -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
