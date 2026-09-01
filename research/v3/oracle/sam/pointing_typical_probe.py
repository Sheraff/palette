"""Typical-strata pointing probe — MolmoPoint points, three SAM selection policies.

    .venv/bin/python pointing_typical_probe.py --dry-run     # draw + projection, no model
    .venv/bin/python pointing_typical_probe.py               # the GPU run

Pre-registered in `POINTING_TYPICAL_PREREG.md`, written before this ran. Implements
`POINTING_PROBE_NOTES.md` §13.8 as refined by §14.7.

What this answers
-----------------
`pointing-ground-1` failed its bar on the **misfit tail**, leniently answered. Its four
decidable failures were all the wash, never the dot. Two questions follow and this probe
asks both at once:

1. Does the wash failure rate hold on **ordinary** covers, or is it a property of the tail?
   Hence the draw: eval-142 minus the whole 15-cover pointing set, at random, n=16.
2. **Which selection policy is right?** `SELECT_CONTAINING`, `SELECT_GROUND` and
   `segment_ground_union` are grown from **identical points**, so the dot is constant across
   a cover's three tiles and the reviewer's keypress separates the policy from the pointer.

Three things this file does that no prior pointing run did
---------------------------------------------------------
- **Every candidate is persisted**, pixels included (§14.7 addition 1). Every previous run
  wrote `seg.best_mask` and threw the other three away, which is what made the question
  "was a better candidate available from the shipped point?" unanswerable across the entire
  campaign. `candidate_records(rle_encode=...)` exists for exactly this and it is not
  optional here.
- **>= 3 points per cover** (§14.7 addition 2). See `draw_points`: the spec's proposed route
  does not work as written and the deviation is pre-registered rather than improvised.
- **`containing` and `ground` share one forward pass.** They are the same four candidates
  under two rankings, so a difference between those tiles is a *selection* difference and
  nothing else. `.with_selection()` recomputes no inference.

CPU/GPU split: this file does inference only. `pointing_typical_round.py` renders the panels
and writes the manifest from the JSON this leaves behind, so a rendering bug never costs a
second GPU slot.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time

import numpy as np

import common
import config
import point_prompt as pp
import pointing_covers as pc
import pointing_parse as ppar
import pointing_probe as probe

# --------------------------------------------------------------------------------- identity

BATCH_ID = "pointing-typical-1"

RUN_PATH = config.DATA_DIR / "pointing-typical-1-run.json"
CANDIDATES_PATH = config.DATA_DIR / "pointing-typical-1-candidates.json"

#: [REVIEWED] PREREG §2. Written down before the draw. Every derived seed is this + a small
#: integer, so one number in the pre-registration reproduces the whole round.
SEED = 20260804

#: [REVIEWED] PREREG §2. n=16; §13.8 argues n=8 was tolerable for a route under suspicion but
#: a *generalization* claim needs more.
N_COVERS = 16
#: Substitutes only for a cover that yields zero points across every draw. PREREG §2.
N_RESERVES = 4

#: [REVIEWED] PREREG §3. `plain` — the sweep settled the phrasing and §12.3 explains why there
#: is nothing left to turn. Unchanged, deliberately.
PHRASING_KEY = "plain"
PHRASING = "point to the background"

#: [REVIEWED] PREREG §3. Draw 1 is temperature 0 — the shipped point, bit-identical to what any
#: run at this pin produces. Draws 2+ are samples, because the shipped path is temperature 0 and
#: "repeat the plain call" would otherwise record one point three times.
SHIPPED_TEMPERATURE = 0.0
SAMPLE_TEMPERATURE = 0.7
SAMPLE_TOP_P = 0.95
MIN_DISTINCT_POINTS = 3
MAX_DRAWS = 5

#: [REVIEWED] PREREG §5/§7. The three policies, one tile each.
POLICY_CONTAINING = "containing"
POLICY_GROUND = "ground"
POLICY_UNION = "union"
POLICIES = (POLICY_CONTAINING, POLICY_GROUND, POLICY_UNION)

#: [REVIEWED] PREREG §7 stop rule. The slot is single-owner; overrunning it is a cost to
#: somebody else, so the run aborts and writes partial results rather than pressing on.
BUDGET_SECONDS = 25 * 60

#: [MEASURED] §12.7, MolmoPoint over 120 calls. Projection only — never a reported number.
EXPECTED_POINTER_SECONDS = 3.9


# --------------------------------------------------------------------------------- the draw


def draw_covers() -> dict:
    """PREREG §2: eval-142, minus the whole pointing set by artwork id, shuffled by SEED.

    Returns the draw as a record, not just a list — the sample, the reserves, the excluded
    ids and the frame size all go into the output so the draw can be audited without
    re-running anything.
    """
    frame = common.eval_set_refs()
    excluded = {common.ImageRef.from_rel(c.path).artwork_id for c in pc.COVERS}

    eligible = [r for r in frame if r.artwork_id not in excluded]
    eligible.sort(key=lambda r: r.artwork_id)

    order = list(eligible)
    random.Random(SEED).shuffle(order)

    sample = order[:N_COVERS]
    reserves = order[N_COVERS:N_COVERS + N_RESERVES]
    return {
        "frame": "research/v3/data/oracle-premise/eval-set.json (included entries)",
        "frame_size": len(frame),
        "excluded_ids": sorted(excluded),
        "excluded_hit_in_frame": sorted({r.artwork_id for r in frame
                                         if r.artwork_id in excluded}),
        "eligible_size": len(eligible),
        "seed": SEED,
        "method": "eligible artwork ids sorted ascending, random.Random(SEED).shuffle, "
                  "first 16 sampled, next 4 held as reserves in order",
        "sample": [r.rel_path for r in sample],
        "reserves": [r.rel_path for r in reserves],
        "_sample_refs": sample,
        "_reserve_refs": reserves,
    }


# --------------------------------------------------------------------------------- pointing


def point_once(pointer, image, prompt: str, *, temperature: float,
               seed: int | None) -> tuple[ppar.PointSet, dict]:
    """One MolmoPoint call, with the sampler exposed.

    Deliberately duplicates `pointing_probe.MolmoPointer.point` rather than editing it. That
    class is the shipped path for every prior run in this campaign and its temperature-0
    behaviour is what those results mean; adding a parameter to it would silently make old
    and new rows different things. Twelve duplicated lines are the cheaper honesty.
    """
    import mlx.core as mx
    from mlx_vlm import generate
    from mlx_vlm.prompt_utils import apply_chat_template

    if seed is not None:
        mx.random.seed(seed)

    formatted = apply_chat_template(
        pointer.processor, pointer.config, [{"role": "user", "content": prompt}], num_images=1)
    started = time.time()
    kwargs: dict = {"max_tokens": probe.MAX_TOKENS, "temperature": temperature, "verbose": False}
    if temperature > 0:
        kwargs["top_p"] = SAMPLE_TOP_P
    out = generate(pointer.model, pointer.processor, formatted, image=[image], **kwargs)
    text = out.text if hasattr(out, "text") else str(out)
    # The processor stashes pointing metadata on ITSELF during __call__ and overwrites it on
    # the next call, so it must be read here, immediately.
    meta_obj = getattr(pointer.processor, "_pointing_metadata", None)
    w, h = image.size
    parsed = (ppar.parse_molmo(text, meta_obj, w, h) if meta_obj is not None
              else ppar.PointSet(status=ppar.UNPARSED, raw=text,
                                 note="processor exposed no _pointing_metadata"))
    return parsed, {"seconds": time.time() - started, "had_metadata": meta_obj is not None}


def draw_points(pointer, small, full_size: tuple[int, int]) -> dict:
    """PREREG §3: up to `MAX_DRAWS` calls until `MIN_DISTINCT_POINTS` distinct points.

    Draw 1 is the shipped, temperature-0 point. The rest are samples of the identical prompt.
    Deduplication is at the full-res pixel level; a repeat that lands on a pixel already held
    is recorded and dropped, so `n_distinct` is an honest count and never padded.
    """
    W, H = full_size
    draws: list[dict] = []
    points: list[tuple[float, float]] = []
    seen: set[tuple[int, int]] = set()
    seconds = 0.0

    for i in range(1, MAX_DRAWS + 1):
        temperature = SHIPPED_TEMPERATURE if i == 1 else SAMPLE_TEMPERATURE
        seed = None if i == 1 else SEED + i
        pset, meta = point_once(pointer, small, PHRASING, temperature=temperature, seed=seed)
        seconds += meta["seconds"]

        added: list[list[float]] = []
        if pset.status == ppar.POINTS and pset.n_in_frame:
            for x, y in pset.pixels(W, H):
                key = (int(round(x)), int(round(y)))
                if key in seen:
                    continue
                seen.add(key)
                points.append((float(x), float(y)))
                added.append([round(float(x), 1), round(float(y), 1)])

        draws.append({
            "draw": i,
            "temperature": temperature,
            "mx_seed": seed,
            "is_shipped_point": i == 1,
            "status": pset.status,
            "n_points": pset.n,
            "n_in_frame": pset.n_in_frame,
            "points_normalized": [[round(p.x, 4), round(p.y, 4), p.group] for p in pset.points],
            "added_pixels": added,
            "duplicate_of_earlier_draw": pset.status == ppar.POINTS and bool(pset.n_in_frame)
                                         and not added,
            "raw_output": pset.raw,
            "parse_note": pset.note,
            "seconds": round(meta["seconds"], 3),
        })
        if len(points) >= MIN_DISTINCT_POINTS:
            break

    return {"draws": draws, "points_pixels": [[round(x, 1), round(y, 1)] for x, y in points],
            "n_distinct": len(points), "pointer_seconds": round(seconds, 3),
            "shortfall": len(points) < MIN_DISTINCT_POINTS, "_points": points}


# --------------------------------------------------------------------------------- segmenting


def segment_all_policies(runtime, full, points, encoded) -> tuple[dict, dict]:
    """The three policies on identical points. Returns (per-policy rows, candidate records).

    `containing` and `ground` are one decode read two ways — `with_selection` recomputes
    nothing — so any difference between those two tiles is a selection difference by
    construction rather than by care. `union` is K separate decodes over the shared backbone
    pass, because a multi-point prompt asks SAM for one object containing every point and a
    multi-region ground is not one object (see `segment_ground_union`).
    """
    seg = pp.segment_from_points(runtime, full, points, selection=pp.SELECT_CONTAINING,
                                 encoded=encoded)
    ground = seg.with_selection(pp.SELECT_GROUND)
    union = pp.segment_ground_union(runtime, full, points, encoded=encoded)

    rows = {
        POLICY_CONTAINING: {
            "policy": POLICY_CONTAINING,
            "selection": pp.SELECT_CONTAINING,
            "best_index": int(seg.best_index),
            "area_fraction": round(seg.best_area_fraction, 4),
            "iou_pred": round(seg.best_iou, 3),
            "contains_points": bool(seg.best_contains_points),
            "mask_rle": common.rle_encode(seg.best_mask),
            "mask_height": int(seg.best_mask.shape[0]),
            "mask_width": int(seg.best_mask.shape[1]),
            "seconds": round(seg.seconds, 3),
        },
        POLICY_GROUND: {
            "policy": POLICY_GROUND,
            "selection": pp.SELECT_GROUND,
            "best_index": int(ground.best_index),
            "area_fraction": round(ground.best_area_fraction, 4),
            "iou_pred": round(ground.best_iou, 3),
            "contains_points": bool(ground.best_contains_points),
            "mask_rle": common.rle_encode(ground.best_mask),
            "mask_height": int(ground.best_mask.shape[0]),
            "mask_width": int(ground.best_mask.shape[1]),
            "same_candidate_as_containing": int(ground.best_index) == int(seg.best_index),
            "seconds": 0.0,
        },
        POLICY_UNION: {
            "policy": POLICY_UNION,
            "selection": pp.SELECT_GROUND,
            "strategy": union.strategy,
            "note": union.note,
            "admitted": [int(i) for i in union.admitted],
            "n_points": len(union.segmentations),
            "area_fraction": round(union.area_fraction, 4),
            "mask_rle": common.rle_encode(union.mask),
            "mask_height": int(union.mask.shape[0]),
            "mask_width": int(union.mask.shape[1]),
            "per_point_area_fractions": [round(s.best_area_fraction, 4)
                                         for s in union.segmentations],
            "seconds": round(sum(s.seconds for s in union.segmentations), 3),
        },
    }

    # §14.7 addition 1, the non-negotiable one: every candidate, with pixels, for the
    # multi-point decode AND for each per-point decode the union is built from.
    candidates = {
        "multipoint": seg.candidate_records(rle_encode=common.rle_encode),
        "per_point": [{"point_index": i, "point_pixels": [round(float(points[i][0]), 1),
                                                          round(float(points[i][1]), 1)],
                       "candidates": s.candidate_records(rle_encode=common.rle_encode)}
                      for i, s in enumerate(union.segmentations)],
    }
    return rows, candidates


# --------------------------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="report the draw and the projection; load nothing")
    ap.add_argument("--limit", type=int, default=0, help="first N covers only (debug)")
    ap.add_argument("--budget-seconds", type=float, default=BUDGET_SECONDS)
    ap.add_argument("--no-verify-weights", action="store_true",
                    help="skip the SAM weights sha256. PREREG §7 licenses this ONLY after a "
                         "verified load in the same session; recorded in the output either way")
    args = ap.parse_args()

    started_all = time.time()
    draw = draw_covers()
    sample = draw["_sample_refs"][: args.limit] if args.limit else draw["_sample_refs"]
    reserves = list(draw["_reserve_refs"])

    print(f"draw: frame {draw['frame_size']} -> eligible {draw['eligible_size']} "
          f"(excluded {len(draw['excluded_hit_in_frame'])} pointing covers present in frame, "
          f"of {len(draw['excluded_ids'])} excluded by id), seed {SEED}")
    for i, ref in enumerate(sample, 1):
        print(f"  {i:2d}. {ref.artwork_id}  {ref.rel_path}")
    print(f"  reserves: {[r.artwork_id for r in reserves]}")

    projected = len(sample) * MIN_DISTINCT_POINTS * EXPECTED_POINTER_SECONDS
    print(f"projected pointer time {projected/60:.1f} min "
          f"({len(sample)} covers x >={MIN_DISTINCT_POINTS} calls)")
    if args.dry_run:
        print("dry run: nothing loaded, nothing written.")
        return 0

    from PIL import Image

    print("loading pointer molmo …")
    pointer = probe.MolmoPointer()
    print(f"  {pointer.name} loaded in {pointer.load_seconds:.1f}s")

    print(f"loading SAM 3.1 … (weights sha256 verify: "
          f"{'OFF' if args.no_verify_weights else 'on'}) — §12.7: the hash runs BEFORE the "
          f"reported timer and the first load of a session looks exactly like a wedged process")
    sam_started = time.time()
    runtime = common.load_sam(verify_weights=not args.no_verify_weights)
    common.register_image_plugins()
    sam_wall = time.time() - sam_started
    print(f"  loaded in {sam_wall:.1f}s wall ({runtime.load_seconds:.1f}s excluding the hash)")

    rows: list[dict] = []
    candidates_out: list[dict] = []
    substitutions: list[dict] = []
    pointer_seconds = 0.0
    aborted = False

    queue = list(sample)
    idx = 0
    while idx < len(queue):
        ref = queue[idx]
        idx += 1
        if time.time() - started_all > args.budget_seconds:
            print(f"\nBUDGET STOP: {args.budget_seconds/60:.1f} min elapsed (PREREG §7). "
                  f"Writing partial results.")
            aborted = True
            break

        full = Image.open(ref.abs_path).convert("RGB")
        W, H = full.size
        small = full.copy()
        if max(small.size) > probe.POINTER_CAP_PX:
            small.thumbnail((probe.POINTER_CAP_PX, probe.POINTER_CAP_PX), Image.LANCZOS)

        drawn = draw_points(pointer, small, (W, H))
        pointer_seconds += drawn["pointer_seconds"]

        if not drawn["_points"]:
            # PREREG §2 reserve rule — the ONLY permitted substitution, and both halves of it
            # are recorded. A cover is never dropped for being inconvenient.
            note = {"failed_cover": ref.rel_path, "artwork_id": ref.artwork_id,
                    "reason": "zero in-frame points across all draws",
                    "draws": drawn["draws"]}
            if reserves:
                sub = reserves.pop(0)
                note["replaced_by"] = sub.rel_path
                queue.append(sub)
                print(f"  {ref.artwork_id}: NO POINTS -> reserve {sub.artwork_id}")
            else:
                note["replaced_by"] = None
                print(f"  {ref.artwork_id}: NO POINTS and no reserve left")
            substitutions.append(note)
            continue

        encoded = pp.encode_image(runtime, full)
        policies, cands = segment_all_policies(runtime, full, drawn["_points"], encoded)

        rows.append({
            "cover_id": ref.artwork_id,
            "artwork_id": ref.artwork_id,
            "image_path": ref.rel_path,
            "image_id": ref.image_id,
            "collection": ref.collection,
            "width": W, "height": H,
            "stratum": "typical",
            "phrasing_key": PHRASING_KEY, "phrasing": PHRASING,
            "pointer": pointer.name,
            "n_distinct_points": drawn["n_distinct"],
            "points_shortfall": drawn["shortfall"],
            "points_pixels": drawn["points_pixels"],
            "draws": drawn["draws"],
            "pointer_seconds": drawn["pointer_seconds"],
            "encode_seconds": round(encoded.seconds, 3),
            "policies": policies,
        })
        candidates_out.append({"cover_id": ref.artwork_id, "image_path": ref.rel_path,
                               "points_pixels": drawn["points_pixels"], **cands})

        areas = " ".join(f"{p}={policies[p]['area_fraction']:.3f}" for p in POLICIES)
        same = policies[POLICY_GROUND]["same_candidate_as_containing"]
        print(f"  {ref.artwork_id} {W}x{H} {drawn['n_distinct']}pt  {areas}  "
              f"{'(ground==containing)' if same else '(ground!=containing)'}  "
              f"union:{policies[POLICY_UNION]['strategy']}")

    elapsed = time.time() - started_all
    summary = summarize(rows)

    RUN_PATH.write_text(json.dumps({
        "generated": common.utc_now(),
        "git_head": common.git_head(),
        "batch_id": BATCH_ID,
        "prereg": "research/v3/oracle/sam/POINTING_TYPICAL_PREREG.md",
        "implements": "POINTING_PROBE_NOTES.md §13.8 as refined by §14.7",
        "aborted_on_budget": aborted,
        "draw": {k: v for k, v in draw.items() if not k.startswith("_")},
        "substitutions": substitutions,
        "pointer": {"name": pointer.name, "repo": pointer.repo, "revision": pointer.revision,
                    "cap_px": probe.POINTER_CAP_PX, "max_tokens": probe.MAX_TOKENS,
                    "phrasing_key": PHRASING_KEY, "phrasing": PHRASING,
                    "shipped_temperature": SHIPPED_TEMPERATURE,
                    "sample_temperature": SAMPLE_TEMPERATURE, "sample_top_p": SAMPLE_TOP_P,
                    "min_distinct_points": MIN_DISTINCT_POINTS, "max_draws": MAX_DRAWS,
                    "deviation": "PREREG §3 — draws 2+ are temperature samples because the "
                                 "shipped pointer path is temperature 0 and repeating it "
                                 "would record one point three times"},
        "sam": {"repo": config.MODEL_REPO, "revision": config.MODEL_REVISION,
                "coord_space": pp.DEFAULT_COORD_SPACE,
                "default_selection": pp.DEFAULT_SELECTION,
                "ground_min_area": pp.GROUND_MIN_AREA, "ground_max_area": pp.GROUND_MAX_AREA,
                "weights_sha256_verified_this_run": not args.no_verify_weights,
                "load_seconds_wall": round(sam_wall, 1),
                "load_seconds_reported": round(runtime.load_seconds, 1)},
        "policies": list(POLICIES),
        "elapsed_seconds": round(elapsed, 1),
        "pointer_seconds_total": round(pointer_seconds, 1),
        "summary": summary,
        "rows": rows,
    }, indent=2) + "\n")

    CANDIDATES_PATH.write_text(json.dumps({
        "generated": common.utc_now(),
        "batch_id": BATCH_ID,
        "note": "§14.7 addition 1. Every candidate mask from every decode, pixels included. "
                "Every prior pointing run persisted only the selected mask, which is what made "
                "the candidate-level counterfactual unanswerable across the whole campaign.",
        "rle_format": "coco_compressed_rle (common.rle_encode)",
        "covers": candidates_out,
    }, indent=2) + "\n")

    print("\n" + "=" * 88)
    for line in summary["lines"]:
        print(line)
    print("=" * 88)
    print(f"wrote {RUN_PATH}")
    print(f"wrote {CANDIDATES_PATH}")
    print(f"total {elapsed/60:.1f} min   pointer {pointer_seconds/60:.1f} min   "
          f"sam load {sam_wall/60:.1f} min")
    return 0


def summarize(rows: list[dict]) -> dict:
    """Proxies only, and they are labelled proxies.

    §12.5/§13.9: the only human-free correctness signal this route has ever had fired zero
    times in 120 calls. Nothing below is a correctness number and none of it touches the bar,
    which is human and lives in PREREG §6. These describe what the policies DID.
    """
    per: dict[str, dict] = {}
    for policy in POLICIES:
        sub = [r["policies"][policy] for r in rows if policy in r["policies"]]
        if not sub:
            continue
        areas = [s["area_fraction"] for s in sub]
        in_band = sum(1 for a in areas
                      if pp.GROUND_MIN_AREA <= a <= pp.GROUND_MAX_AREA)
        per[policy] = {
            "tiles": len(sub),
            "mean_area": round(float(np.mean(areas)), 4),
            "median_area": round(float(np.median(areas)), 4),
            "min_area": round(float(np.min(areas)), 4),
            "max_area": round(float(np.max(areas)), 4),
            "in_ground_band": in_band,
            "over_max_area": sum(1 for a in areas if a > pp.GROUND_MAX_AREA),
            "under_min_area": sum(1 for a in areas if a < pp.GROUND_MIN_AREA),
        }
    if POLICY_UNION in per:
        strategies: dict[str, int] = {}
        for r in rows:
            s = r["policies"][POLICY_UNION]["strategy"]
            strategies[s] = strategies.get(s, 0) + 1
        per[POLICY_UNION]["strategies"] = strategies

    differs = sum(1 for r in rows
                  if not r["policies"][POLICY_GROUND]["same_candidate_as_containing"])
    lines = [f"{'policy':12s} {'tiles':>6s} {'meanArea':>9s} {'medArea':>8s} "
             f"{'inBand':>7s} {'over':>5s} {'under':>6s}"]
    for policy in POLICIES:
        v = per.get(policy)
        if v is None:
            continue
        lines.append(f"{policy:12s} {v['tiles']:>6d} {v['mean_area']:>9.3f} "
                     f"{v['median_area']:>8.3f} {v['in_ground_band']:>7d} "
                     f"{v['over_max_area']:>5d} {v['under_min_area']:>6d}")
    lines.append(f"ground picked a DIFFERENT candidate than containing on {differs}/{len(rows)} "
                 f"covers — these are the tiles where the policy comparison has any content")
    lines.append("PROXIES ONLY. The bar is human and lives in POINTING_TYPICAL_PREREG.md §6.")
    return {"per_policy": per, "ground_differs_from_containing": differs,
            "covers": len(rows), "lines": lines}


if __name__ == "__main__":
    sys.exit(main())
