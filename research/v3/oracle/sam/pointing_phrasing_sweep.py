"""Pointing phrasing sweep — is the figure/ground question recoverable under a plain imperative?

Pre-registered in `POINTING_PHRASING_PREREG.md` (candidates, scoring, pick rule and the
reviewer-round bar were all fixed before this ran). Follows `POINTING_PROBE_NOTES.md` §7.2.

Usage:  .venv/bin/python pointing_phrasing_sweep.py --pointer molmo
        .venv/bin/python pointing_phrasing_sweep.py --pointer qwen

Deliberately reuses `pointing_probe`'s pointers, parser, stored-mask judge and SAM adapter
rather than reimplementing them, so the sweep's numbers are comparable to the probe's by
construction instead of by care. The only things new here are the candidate list, the
factorial bookkeeping and the pick arithmetic.

Masks are stored as RLE in the output so the reviewer round can be built without a second
GPU pass — a re-run would be a second sample of a temperature-0 process, which is a
different (and worse) thing to show a human than the sample the pick was made from.
"""

from __future__ import annotations

import argparse
import json
import sys
import time

import numpy as np

import common
import config
import point_prompt as pp
import pointing_covers as pc
import pointing_parse as ppar
import pointing_probe as probe

# --------------------------------------------------------------------------- candidates
# [REVIEWED] Fixed in POINTING_PHRASING_PREREG.md §2 before the run. Do not reorder or
# edit after a number has been seen; a changed candidate list is a new sweep.
#
# fields: key, text, eligible-for-pick, figure/ground rank, role note
CANDIDATES: tuple[tuple[str, str, bool, int, str], ...] = (
    # --- the 2x2 factorial on what the probe's failing prompt changed at once ---
    ("plain",       "point to the background",                              True,  0,
     "CONTROL / incumbent; probe measured 15/15 molmo, 11/15 qwen"),
    ("surface",     "point to the background surface",                      True,  1,
     "TEST: elaborated noun, no prepositional phrase"),
    ("fg_minimal",  "point to the background behind the subject",           True,  3,
     "TEST: prepositional phrase, plain noun"),
    ("fg_full",     "point to the background surface behind the subject",   True,  4,
     "CONTROL / known failure; probe measured 1/15 on both models"),
    # --- varied noun phrases, per the probe's §7.2 proposal ---
    ("backdrop",    "point to the backdrop",                                True,  0,
     "TEST: generic ground noun from design vocabulary"),
    ("behind",      "point to what is behind the subject",                  True,  2,
     "TEST: the figure/ground relation with no ground noun at all"),
    ("wall",        "point to the wall",                                    False, 0,
     "DIAGNOSTIC ONLY: presupposing. A high answer rate here is evidence AGAINST "
     "the route — most covers have no wall."),
    ("empty_area",  "point to the empty area",                              False, 0,
     "DIAGNOSTIC ONLY: presupposing, same reading as `wall`."),
)

# [REVIEWED] Pre-registered clear bar, PREREG §4. Scored on MolmoPoint only.
CLEAR_MIN_ANSWERS = 13          # of 15
CLEAR_MAX_ON_FIGURE_DECIDABLE = 0
CLEAR_MIN_CONTROLS = 4          # of the 5 non-skap controls

# [REVIEWED] PREREG §6. The sweep aborts rather than silently overrunning the GPU slot.
BUDGET_SECONDS = 20 * 60

# [MEASURED] probe §4.2. Used only for the projection check, never for a reported number.
EXPECTED_SECONDS_PER_CALL = {"molmo": 3.9, "qwen": 1.0}

NON_SKAP_CONTROLS = tuple(c.id for c in pc.CONTROLS if c.id != "skap")


# --------------------------------------------------------------------------- prose bonuses
# PREREG §3. The three prose facts checkable without looking at an image. Reported, never
# part of the pick.


def prose_bonus(cover_id: str, points_normalized: list) -> dict | None:
    xs = [p[0] for p in points_normalized]
    ys = [p[1] for p in points_normalized]
    if cover_id == "00014fb4":
        return {"test": "points in both halves (green left / red right)",
                "hit": any(x < 0.5 for x in xs) and any(x >= 0.5 for x in xs)}
    if cover_id == "000f0a78":
        bands = {min(int(y * 3), 2) for y in ys}
        return {"test": "points in >=2 of 3 horizontal bands (black / champagne / red)",
                "hit": len(bands) >= 2, "bands": sorted(bands)}
    if cover_id == "disney":
        quads = {(int(x >= 0.5), int(y >= 0.5)) for x, y in zip(xs, ys)}
        return {"test": "points in >=3 quadrants (four-quadrant colour blocks)",
                "hit": len(quads) >= 3, "quadrants": len(quads)}
    return None


# --------------------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pointer", choices=sorted(probe.POINTERS), required=True)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--budget-seconds", type=float, default=BUDGET_SECONDS)
    # `common.load_sam` sha256s the 3.5 GB weights file BEFORE its own timer starts, which
    # is why every prior note reports a "0.2 s" SAM load: the hash is not in that number.
    # [MEASURED] 2026-08-04 it dominated this sweep's wall clock. The second pointer in a
    # session re-hashes a file the first pointer verified minutes earlier against the same
    # pin, so the check is skippable there and ONLY there. Default stays on.
    ap.add_argument("--no-verify-weights", action="store_true",
                    help="skip the SAM weights sha256 (only when a prior run in the same "
                         "session already verified it; recorded in the output)")
    args = ap.parse_args()

    from PIL import Image

    started_all = time.time()
    covers = list(pc.COVERS)[: args.limit] if args.limit else list(pc.COVERS)
    n_calls_planned = len(covers) * len(CANDIDATES)
    projected = n_calls_planned * EXPECTED_SECONDS_PER_CALL.get(args.pointer, 4.0)
    print(f"planned: {len(covers)} covers x {len(CANDIDATES)} phrasings = "
          f"{n_calls_planned} calls, projected pointer time {projected/60:.1f} min")
    if projected > args.budget_seconds:
        print(f"ABORT before loading anything: projection {projected/60:.1f} min exceeds "
              f"budget {args.budget_seconds/60:.1f} min (PREREG §6 stop rule).")
        return 3

    print(f"loading pointer {args.pointer} …")
    pointer = probe.POINTERS[args.pointer]()
    print(f"  {pointer.name} loaded in {pointer.load_seconds:.1f}s")

    print(f"loading SAM 3.1 … (weights sha256 verify: "
          f"{'OFF' if args.no_verify_weights else 'on'})")
    sam_started = time.time()
    runtime = common.load_sam(verify_weights=not args.no_verify_weights)
    common.register_image_plugins()
    print(f"  loaded in {time.time() - sam_started:.1f}s wall "
          f"({runtime.load_seconds:.1f}s excluding the weights hash)")

    stored = probe.load_stored_masks({c.id for c in covers})
    print(f"  stored instance masks for {sum(1 for v in stored.values() if v)}/{len(covers)}")

    rows: list[dict] = []
    pointer_seconds = 0.0
    aborted = False

    for cover in covers:
        full = Image.open(config.REPO_ROOT / cover.path).convert("RGB")
        W, H = full.size
        small = full.copy()
        if max(small.size) > probe.POINTER_CAP_PX:
            small.thumbnail((probe.POINTER_CAP_PX, probe.POINTER_CAP_PX), Image.LANCZOS)
        encoded = pp.encode_image(runtime, full)
        print(f"\n{cover.id} ({cover.role}, {W}x{H})  reviewer: {cover.reviewer_ground}")

        for key, text, eligible, fg_rank, note in CANDIDATES:
            if time.time() - started_all > args.budget_seconds:
                print(f"\nBUDGET STOP: {args.budget_seconds/60:.1f} min elapsed "
                      f"(PREREG §6). Writing partial results.")
                aborted = True
                break

            pset, meta = pointer.point(small, text)
            pointer_seconds += meta["seconds"]

            row: dict = {
                "cover_id": cover.id, "role": cover.role, "decidable": cover.decidable,
                "reviewer_ground": cover.reviewer_ground,
                "phrasing_key": key, "phrasing": text,
                "eligible_for_pick": eligible, "figure_ground_rank": fg_rank,
                "candidate_note": note,
                "pointer": pointer.name,
                "status": pset.status, "n_points": pset.n, "n_in_frame": pset.n_in_frame,
                "raw_output": pset.raw, "parse_note": pset.note,
                "pointer_seconds": round(meta["seconds"], 3),
                "points_normalized": [[round(p.x, 4), round(p.y, 4), p.group]
                                      for p in pset.points],
            }

            if pset.status == ppar.POINTS and pset.n_in_frame:
                pts = pset.pixels(W, H)
                concepts = [probe.concepts_at(stored.get(cover.id, []), x, y, W, H)
                            for x, y in pts]
                row["points_pixels"] = [[round(x, 1), round(y, 1)] for x, y in pts]
                row["concepts_at_points"] = concepts
                row["on_figure"] = any(set(c) & probe.FIGURE_CONCEPTS for c in concepts)
                row["on_mark"] = any(set(c) & probe.MARK_CONCEPTS for c in concepts)
                row["all_unclaimed"] = all(not c for c in concepts)
                row["prose_bonus"] = prose_bonus(cover.id, row["points_normalized"])

                seg = pp.segment_from_points(runtime, full, pts, encoded=encoded)
                row.update({
                    "sam_area_fraction": round(seg.best_area_fraction, 4),
                    "sam_iou_pred": round(seg.best_iou, 3),
                    "sam_contains_points": seg.best_contains_points,
                    "sam_selection": seg.selection,
                    "mask_rle": common.rle_encode(seg.best_mask),
                    "mask_height": int(seg.best_mask.shape[0]),
                    "mask_width": int(seg.best_mask.shape[1]),
                })
                flag = ("FIGURE" if row["on_figure"] else
                        ("mark" if row["on_mark"] else "ground?"))
                print(f"  {key:11s} {pset.n}pt  area {seg.best_area_fraction:.3f}  "
                      f"{flag:7s} {pset.raw[:56]!r}")
            else:
                print(f"  {key:11s} {pset.status.upper():9s} {pset.raw[:56]!r}")
            rows.append(row)
        if aborted:
            break

    elapsed = time.time() - started_all
    summary = summarize(rows)
    out = config.DATA_DIR / f"pointing-phrasing-sweep-{args.pointer}.json"
    out.write_text(json.dumps({
        "generated": common.utc_now(),
        "git_head": common.git_head(),
        "prereg": "research/v3/oracle/sam/POINTING_PHRASING_PREREG.md",
        "aborted_on_budget": aborted,
        "pointer": {"name": pointer.name, "repo": pointer.repo,
                    "revision": pointer.revision,
                    "cap_px": probe.POINTER_CAP_PX, "max_tokens": probe.MAX_TOKENS},
        "sam": {"repo": config.MODEL_REPO, "revision": config.MODEL_REVISION,
                "coord_space": pp.DEFAULT_COORD_SPACE,
                "selection": pp.DEFAULT_SELECTION,
                "weights_sha256_verified_this_run": not args.no_verify_weights},
        "candidates": [{"key": k, "text": t, "eligible_for_pick": e,
                        "figure_ground_rank": r, "note": n}
                       for k, t, e, r, n in CANDIDATES],
        "clear_bar": {"min_answers_of_15": CLEAR_MIN_ANSWERS,
                      "max_on_figure_decidable": CLEAR_MAX_ON_FIGURE_DECIDABLE,
                      "min_controls_of_5": CLEAR_MIN_CONTROLS},
        "elapsed_seconds": round(elapsed, 1),
        "pointer_seconds_total": round(pointer_seconds, 1),
        "summary": summary,
        "rows": rows,
    }, indent=2) + "\n")

    print("\n" + "=" * 92)
    for line in summary["lines"]:
        print(line)
    print("=" * 92)
    print(f"wrote {out}")
    print(f"total {elapsed/60:.1f} min   pointer {pointer_seconds/60:.1f} min")
    return 0


def summarize(rows: list[dict]) -> dict:
    per: dict[str, dict] = {}
    for key, text, eligible, fg_rank, _note in CANDIDATES:
        sub = [r for r in rows if r["phrasing_key"] == key]
        if not sub:
            continue
        with_pts = [r for r in sub if r.get("points_pixels")]
        dec_pts = [r for r in with_pts if r["decidable"]]
        ctrl = [r for r in sub if r["cover_id"] in NON_SKAP_CONTROLS]
        answers = len(with_pts)
        on_fig = sum(1 for r in with_pts if r["on_figure"])
        on_fig_dec = sum(1 for r in dec_pts if r["on_figure"])
        answer_rate = answers / len(sub) if sub else 0.0
        on_ground_rate = (answers - on_fig) / answers if answers else 0.0
        controls_answered = sum(1 for r in ctrl if r.get("points_pixels"))
        clears = (eligible
                  and answers >= CLEAR_MIN_ANSWERS
                  and on_fig_dec <= CLEAR_MAX_ON_FIGURE_DECIDABLE
                  and controls_answered >= CLEAR_MIN_CONTROLS)
        areas = [r["sam_area_fraction"] for r in with_pts if "sam_area_fraction" in r]
        bonus = [r["prose_bonus"] for r in with_pts if r.get("prose_bonus")]
        per[key] = {
            "phrasing": text, "eligible_for_pick": eligible,
            "figure_ground_rank": fg_rank,
            "calls": len(sub), "answers": answers,
            "declined": sum(1 for r in sub if r["status"] == ppar.DECLINED),
            "unparsed": sum(1 for r in sub if r["status"] == ppar.UNPARSED),
            "answer_rate": round(answer_rate, 4),
            "on_figure_calls": on_fig,
            "on_figure_decidable": on_fig_dec,
            "on_mark_calls": sum(1 for r in with_pts if r["on_mark"]),
            "all_unclaimed_calls": sum(1 for r in with_pts if r.get("all_unclaimed")),
            "on_ground_rate": round(on_ground_rate, 4),
            "combined_score": round(answer_rate * on_ground_rate, 4),
            "controls_answered": controls_answered, "controls_total": len(ctrl),
            "mean_points_per_answer": round(
                float(np.mean([r["n_in_frame"] for r in with_pts])), 2) if with_pts else None,
            "mean_sam_area": round(float(np.mean(areas)), 4) if areas else None,
            "prose_bonus_hits": sum(1 for b in bonus if b["hit"]),
            "prose_bonus_checked": len(bonus),
            "clears": clears,
        }

    cleared = [k for k, v in per.items() if v["clears"]]
    lines = [
        f"{'phrasing':12s} {'answers':>8s} {'ans.rate':>9s} {'onFig':>6s} "
        f"{'onGnd':>7s} {'score':>7s} {'ctrl':>6s} {'elig':>5s} {'CLEARS':>7s}",
    ]
    for key, v in per.items():
        lines.append(
            f"{key:12s} {v['answers']:>4d}/{v['calls']:<3d} {v['answer_rate']:>9.3f} "
            f"{v['on_figure_calls']:>6d} {v['on_ground_rate']:>7.3f} "
            f"{v['combined_score']:>7.3f} "
            f"{v['controls_answered']}/{v['controls_total']:<4d} "
            f"{'y' if v['eligible_for_pick'] else 'n':>5s} "
            f"{'YES' if v['clears'] else '-':>7s}")

    pick = None
    if cleared:
        # PREREG §4 pick order: combined score, then (filled in by the cross-model step)
        # qwen answer rate, then figure/ground rank, then the incumbent.
        pick = sorted(cleared, key=lambda k: (-per[k]["combined_score"],
                                              -per[k]["figure_ground_rank"],
                                              k != "plain"))[0]
        lines.append(f"provisional pick (this model alone): {pick}  "
                     f"— cross-model tie-break applied in the report, not here")
    else:
        lines.append("NOTHING CLEARS on this model.")
    return {"per_phrasing": per, "cleared": cleared,
            "provisional_pick_single_model": pick, "lines": lines}


if __name__ == "__main__":
    sys.exit(main())
