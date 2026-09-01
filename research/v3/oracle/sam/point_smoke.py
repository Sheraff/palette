"""GPU smoke for the point-prompt path, plus the wiring A/B.

Two things get settled here, both with an objective automatic criterion rather than an
eyeball:

1. **Does the gate's verdict survive end to end?** `gate_point_coords.py` settled the
   coordinate frame against the positional-encoding weights alone. That proves the point
   token lands where we think it does; it does not prove the whole decoder path works. The
   criterion is **point-in-mask**: prompt a single foreground point at a known pixel and
   ask whether the returned mask contains that pixel. A correct path is at or near 100%.
   An aliased coordinate lands the mask somewhere unrelated, so it scores at chance —
   which for masks covering a fair fraction of the frame is well below 100% but not zero,
   hence several points per cover rather than one.

2. **Which wiring is right**, among choices mlx-vlm does not make for us: interactive vs
   propagation FPN, interactive vs propagation decoder, the `interactivity_no_mem_embed`
   that upstream SAM adds when a frame has no memory and `track_step` never does, and the
   high-res skip connections that mlx-vlm passes in an order its own shape guards reject.

Synthetic points only — no pointing model is involved and nothing is downloaded.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np

import config
import common
import point_prompt as pp
import point_sheets

# Two controls from the scout's set: the flat_field cover (easiest possible target) and an
# exact-match multiple_distinct_fields cover (so a "mask = whole image" degenerate pass
# cannot score 100% on both).
SMOKE_COVERS = [
    ("000bc98f", "0b/ab67616d0000b273000bc98f315aba36374f9f93", "flat_field"),
    ("0002dfdc", "02/ab67616d0000b2730002dfdcde2cb0a75822168c.jpg", "multiple_distinct_fields"),
    ("0000269e", "00/ab67616d00001e020000269ead63cf2376a6b67d.jpg", "multiple_distinct_fields"),
    ("skap", "images/skap.jpg", "full_scene"),
]

# A 5x5 grid inset from the edges. 25 points x 4 covers = 100 trials per condition, which
# is what it takes to separate wirings that differ by a few percent; the first pass of this
# smoke used 5 points x 2 covers and could not tell two of them apart.
PROBE_POINTS = [(x, y)
                for y in (0.10, 0.30, 0.50, 0.70, 0.90)
                for x in (0.10, 0.30, 0.50, 0.70, 0.90)]

# A mask that is everything, or nothing, is not a segmentation. Used to disqualify
# degenerate configs that would otherwise score 100% on point-in-mask trivially.
SANE_AREA = (0.002, 0.90)


def probe_points_for(image) -> list[tuple[float, float]]:
    w, h = image.size
    return [(fx * w, fy * h) for fx, fy in PROBE_POINTS]


def run_condition(runtime, images, *, coord_space, decoder, fpn, high_res,
                  add_no_mem_embed, cache) -> dict:
    """One wiring, five points per cover, scored by point-in-mask and mask sanity."""
    by_sel = {s: {"hits": 0, "degenerate": 0, "areas": [], "ious": []}
              for s in pp.SELECTIONS}
    total = 0
    secs = []
    any_contains = 0
    per_cover: dict = {}

    for cover_id, rel, _kind in SMOKE_COVERS:
        image = cache[cover_id]["image"]
        key = (cover_id, fpn)
        if key not in cache:
            cache[key] = pp.encode_image(runtime, image, fpn=fpn)
        encoded = cache[key]

        cover_rows = []
        for (px, py) in probe_points_for(image):
            seg = pp.segment_from_points(
                runtime, image, [(px, py)],
                coord_space=coord_space, decoder=decoder, fpn=fpn,
                high_res=high_res, add_no_mem_embed=add_no_mem_embed,
                encoded=encoded,
            )
            total += 1
            secs.append(seg.seconds)
            any_contains += int(seg.contains_points.any())
            row = {"point": [round(px, 1), round(py, 1)],
                   "obj_score": round(seg.obj_score, 3),
                   "candidate_ious": [round(float(v), 3) for v in seg.iou_scores],
                   "candidate_areas": [round(float(v), 4) for v in seg.area_fractions],
                   "candidate_contains": [bool(v) for v in seg.contains_points]}
            for s in pp.SELECTIONS:
                k = seg.select(s)
                a = float(seg.area_fractions[k])
                by_sel[s]["hits"] += int(seg.contains_points[k])
                by_sel[s]["areas"].append(a)
                by_sel[s]["ious"].append(float(seg.iou_scores[k]))
                if not (SANE_AREA[0] <= a <= SANE_AREA[1]):
                    by_sel[s]["degenerate"] += 1
                row[f"sel_{s}"] = {"candidate": k, "in_mask": bool(seg.contains_points[k]),
                                   "area_fraction": round(a, 4)}
            cover_rows.append(row)
        per_cover[cover_id] = {"rows": cover_rows}

    selections = {s: {"point_in_mask": v["hits"], "of": total,
                      "point_in_mask_rate": round(v["hits"] / total, 3),
                      "degenerate_masks": v["degenerate"],
                      "mean_area_fraction": round(float(np.mean(v["areas"])), 4),
                      "mean_iou": round(float(np.mean(v["ious"])), 4)}
                  for s, v in by_sel.items()}

    default = selections[pp.DEFAULT_SELECTION]
    return {
        "coord_space": coord_space, "decoder": decoder, "fpn": fpn,
        "high_res": high_res, "no_mem_embed": add_no_mem_embed,
        "of": total,
        # "any candidate contains the point" — the wiring-level signal, independent of
        # which candidate a policy happens to pick.
        "any_candidate_contains": any_contains,
        "any_candidate_contains_rate": round(any_contains / total, 3),
        "point_in_mask": default["point_in_mask"],
        "point_in_mask_rate": default["point_in_mask_rate"],
        "degenerate_masks": default["degenerate_masks"],
        "mean_iou": default["mean_iou"],
        "mean_area_fraction": default["mean_area_fraction"],
        "median_decode_seconds": round(float(np.median(secs)), 4),
        "selections": selections,
        "per_cover": per_cover,
    }


def main() -> int:
    from PIL import Image

    started_all = time.time()
    print("loading SAM 3.1 …")
    runtime = common.load_sam()
    print(f"  loaded in {runtime.load_seconds:.1f}s  "
          f"(mlx-vlm {runtime.runtime_version}, mlx {runtime.mlx_version})")

    common.register_image_plugins()
    cache: dict = {}
    for cover_id, rel, _kind in SMOKE_COVERS:
        img = Image.open(config.REPO_ROOT / rel).convert("RGB")
        cache[cover_id] = {"image": img, "rel": rel}
        print(f"  {cover_id}: {img.size[0]}x{img.size[1]}")

    results = {"phase_a_convention": [], "phase_b_wiring": []}

    # ---- Phase A: does the gate's verdict hold end to end? ----
    print("\nPhase A — coordinate convention, end to end "
          "(interactive FPN + interactive decoder)")
    for space in pp.COORD_SPACES:
        r = run_condition(runtime, cache, coord_space=space, decoder=pp.DECODER_INTERACTIVE,
                          fpn=pp.FPN_INTERACTIVE, high_res=True, add_no_mem_embed=True,
                          cache=cache)
        results["phase_a_convention"].append(r)
        print(f"  {space:8s}  ANY-candidate-contains {r['any_candidate_contains']:2d}/{r['of']}"
              f" ({r['any_candidate_contains_rate']:.0%})   selected in-mask "
              f"{r['point_in_mask']:2d}/{r['of']} ({r['point_in_mask_rate']:.0%})  "
              f"mean area {r['mean_area_fraction']:.3f}  degenerate {r['degenerate_masks']}")

    # The convention question is about *wiring*, so it is decided on the wiring-level
    # metric — whether the decoder produces any candidate at the prompted pixel — not on
    # whichever candidate a selection heuristic happens to like.
    best_a = max(results["phase_a_convention"],
                 key=lambda r: (r["any_candidate_contains_rate"], r["point_in_mask_rate"]))
    space = best_a["coord_space"]
    print(f"  => end-to-end winner: {space.upper()} "
          f"({best_a['point_in_mask_rate']:.0%}); gate said {pp.DEFAULT_COORD_SPACE.upper()}")

    # ---- Phase B: the wiring choices mlx-vlm leaves open ----
    print(f"\nPhase B — wiring A/B at coord_space={space}")
    grid = [
        (pp.DECODER_INTERACTIVE, pp.FPN_INTERACTIVE, True, True),
        (pp.DECODER_INTERACTIVE, pp.FPN_INTERACTIVE, True, False),
        (pp.DECODER_INTERACTIVE, pp.FPN_INTERACTIVE, False, True),
        (pp.DECODER_INTERACTIVE, pp.FPN_PROPAGATION, True, True),
        (pp.DECODER_PROPAGATION, pp.FPN_PROPAGATION, True, True),
        (pp.DECODER_PROPAGATION, pp.FPN_PROPAGATION, True, False),
        (pp.DECODER_PROPAGATION, pp.FPN_INTERACTIVE, True, True),
    ]
    for dec, fpn, high_res, no_mem in grid:
        r = run_condition(runtime, cache, coord_space=space, decoder=dec, fpn=fpn,
                          high_res=high_res, add_no_mem_embed=no_mem, cache=cache)
        results["phase_b_wiring"].append(r)
        print(f"  dec={dec:11s} fpn={fpn:11s} hires={int(high_res)} nomem={int(no_mem)}  "
              f"any {r['any_candidate_contains']:2d}/{r['of']}  "
              f"sel {r['point_in_mask']:2d}/{r['of']}  "
              f"area {r['mean_area_fraction']:.3f}  "
              f"degen {r['degenerate_masks']}  {r['median_decode_seconds']*1000:.0f}ms")

    def rank(r):
        return (r["any_candidate_contains_rate"], r["point_in_mask_rate"],
                -r["degenerate_masks"])
    best_b = max(results["phase_b_wiring"], key=rank)
    print(f"\n  => wiring winner: decoder={best_b['decoder']} fpn={best_b['fpn']} "
          f"high_res={best_b['high_res']} no_mem={best_b['no_mem_embed']} "
          f"(any {best_b['any_candidate_contains_rate']:.0%}, "
          f"sel {best_b['point_in_mask_rate']:.0%})")

    # ---- Phase C: which candidate-selection policy, under the winning wiring ----
    print("\nPhase C — candidate selection policy (same forward passes, re-ranked)")
    for s, m in best_b["selections"].items():
        print(f"  {s:12s}  in-mask {m['point_in_mask']:2d}/{m['of']} "
              f"({m['point_in_mask_rate']:.0%})  mean area {m['mean_area_fraction']:.3f}  "
              f"degenerate {m['degenerate_masks']}")
    # Ties go to the module default rather than to whichever policy the dict lists first —
    # a tie is a tie, and letting iteration order decide it would silently look like a result.
    best_sel = max(best_b["selections"].items(),
                   key=lambda kv: (kv[1]["point_in_mask_rate"], -kv[1]["degenerate_masks"],
                                   kv[0] == pp.DEFAULT_SELECTION))[0]
    tied = [s for s, m in best_b["selections"].items()
            if (m["point_in_mask_rate"], -m["degenerate_masks"])
            == (best_b["selections"][best_sel]["point_in_mask_rate"],
                -best_b["selections"][best_sel]["degenerate_masks"])]
    print(f"  => selection winner: {best_sel}"
          + (f"  (tied with {[s for s in tied if s != best_sel]}; "
             f"tie broken toward the module default)" if len(tied) > 1 else ""))
    results["selection_winner"] = best_sel

    # ---- Sheets: one tile per (cover, probe point) under the winning wiring ----
    tiles = []
    for cover_id, rel, kind in SMOKE_COVERS:
        image = cache[cover_id]["image"]
        encoded = cache[(cover_id, best_b["fpn"])]
        for (px, py) in probe_points_for(image):
            seg = pp.segment_from_points(
                runtime, image, [(px, py)], coord_space=space,
                decoder=best_b["decoder"], fpn=best_b["fpn"],
                high_res=best_b["high_res"], add_no_mem_embed=best_b["no_mem_embed"],
                selection=best_sel, encoded=encoded)
            tiles.append(point_sheets.tile(
                image, seg.best_mask, [(px, py)], [1],
                caption=(f"{cover_id} {kind}  cand{seg.best_index}\n"
                         f"area {seg.best_area_fraction:.3f}  iou {seg.best_iou:.2f}  "
                         f"in-mask {'Y' if seg.best_contains_points else 'N'}")))
    sheet_path = config.DATA_DIR / "sheets" / "point-smoke-synthetic.png"
    point_sheets.sheet(tiles, sheet_path, cols=len(PROBE_POINTS),
                       title=f"SAM 3.1 point prompts — synthetic probe points, "
                             f"coord={space}, dec={best_b['decoder']}, fpn={best_b['fpn']}")
    print(f"\nsheet: {sheet_path}")

    elapsed = time.time() - started_all
    out = config.DATA_DIR / "point-smoke-synthetic.json"
    out.write_text(json.dumps({
        "generated": common.utc_now(),
        "git_head": common.git_head(),
        "model_repo": config.MODEL_REPO,
        "model_revision": config.MODEL_REVISION,
        "load_seconds": round(runtime.load_seconds, 2),
        "elapsed_seconds": round(elapsed, 1),
        "covers": [{"id": c, "path": r, "ground_type": k} for c, r, k in SMOKE_COVERS],
        "probe_points_fractional": PROBE_POINTS,
        "sane_area_band": SANE_AREA,
        "gate_verdict_coord_space": pp.DEFAULT_COORD_SPACE,
        "end_to_end_winner_coord_space": space,
        "selection_winner": best_sel,
        "default_selection": pp.DEFAULT_SELECTION,
        "wiring_winner": {k: best_b[k] for k in
                          ("decoder", "fpn", "high_res", "no_mem_embed",
                           "point_in_mask_rate", "mean_iou", "mean_area_fraction")},
        "results": results,
        "sheet": str(sheet_path.relative_to(config.REPO_ROOT)),
        "high_res_order_note": pp.HIGH_RES_ORDER_NOTE,
    }, indent=2) + "\n")
    print(f"wrote {out}   total {elapsed:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
