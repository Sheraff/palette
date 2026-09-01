"""Pointing -> SAM: run a pointing model over the 15-cover set and segment from its points.

Usage:  python pointing_probe.py --pointer qwen [--limit N]
        python pointing_probe.py --pointer molmo

One process holds both models. SAM is 3.5 GB and Qwen3-VL-30B-A3B-6bit is ~26 GB, which
co-reside comfortably on 103 GB, so no cross-process hand-off is needed.

What gets scored, and what deliberately does not
------------------------------------------------
Three of these covers have NO correct answer — the synthesis calls them genuinely
ambiguous and the reviewer could not commit to a ground even in prose. Scoring those for
correctness would manufacture a result. They are scored for BEHAVIOUR only: does the model
decline, does it scatter, is it consistent across the three prompt phrasings. Per the
scout's §6, a pointer that is confident where a careful human was not is exhibiting a
prior, not a perception, and that is reported as a finding about the instrument.

For the rest, two objective checks run without a human:

1. **Points land inside a stored SAM instance mask.** The v4-noun run already segmented
   these covers for `person`, `face`, `words`, `display-text`, `emblem` and the dynamic
   nouns. A ground point that lands inside a `person` or `face` mask has landed on the
   figure — that is the scout's pre-registered FAIL condition, measured rather than
   eyeballed. `words`/`display-text` are reported separately and NOT counted as failure:
   applied text sits ON the ground, so a point under a lyric line is not obviously wrong.
2. **Mask sanity and agreement.** Area fraction of the SAM mask grown from the points,
   whether it contains the points it was grown from, and how far the three prompt
   phrasings agree with each other (IoU between their masks) — agreement across
   independent phrasings is the only self-check available without a human.

Everything else is for the sheets and a reviewer round.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

import common
import config
import point_prompt as pp
import point_sheets
import pointing_covers as pc
import pointing_parse as ppar

# Stored SAM run used for the objective "did the point land on a figure?" check.
STORED_RUN = config.DATA_DIR / "sam-eval-142-v4-nouns.jsonl"

# Concepts that mean "this pixel belongs to a depicted subject". `words`, `letter`,
# `lettering`, `display-text`, `barcode`, `parental-advisory`, `sticker` and `emblem` are
# applied marks that sit ON a ground, so a ground point under them is not a failure; they
# are tallied separately.
FIGURE_CONCEPTS = {"person", "face"}
MARK_CONCEPTS = {"words", "letter", "lettering", "display-text", "emblem", "sticker",
                 "parental-advisory", "barcode"}

QWEN_REPO = "mlx-community/Qwen3-VL-30B-A3B-Instruct-6bit"
QWEN_REVISION = "f31102655767c89366f63d3eab2a5e2a8fd6d293"
MOLMO_REPO = "mlx-community/MolmoPoint-8B-8bit"
MOLMO_REVISION = "e295e68b2ee56c2d9a912453b5130633bd35aa4b"

#: Qwen sees the cover at the campaign's 640 px cap (premise `RESOLUTION_CAP_PX`); SAM
#: sees it full-res, deliberately (see the palette design constraints). Points are carried
#: between them as normalized fractions, so the two resolutions never have to agree.
POINTER_CAP_PX = 640
MAX_TOKENS = 256


# --------------------------------------------------------------------------- pointers


class QwenPointer:
    name = "qwen3-vl-30b-a3b-6bit"
    repo, revision = QWEN_REPO, QWEN_REVISION

    def __init__(self):
        from mlx_vlm import load
        from mlx_vlm.utils import load_config, get_model_path
        started = time.time()
        self.path = Path(get_model_path(self.repo, revision=self.revision))
        self.model, self.processor = load(str(self.path))
        self.config = load_config(str(self.path), trust_remote_code=True)
        self.load_seconds = time.time() - started

    def point(self, image, prompt: str) -> tuple[ppar.PointSet, dict]:
        from mlx_vlm import generate
        from mlx_vlm.prompt_utils import apply_chat_template
        formatted = apply_chat_template(
            self.processor, self.config, [{"role": "user", "content": prompt}],
            num_images=1)
        started = time.time()
        out = generate(self.model, self.processor, formatted, image=[image],
                       max_tokens=MAX_TOKENS, temperature=0.0, verbose=False)
        text = out.text if hasattr(out, "text") else str(out)
        meta = {"seconds": time.time() - started,
                "generation_tokens": int(getattr(out, "generation_tokens", 0) or 0),
                "prompt_tokens": int(getattr(out, "prompt_tokens", 0) or 0)}
        return ppar.parse_qwen(text), meta


class MolmoPointer:
    name = "molmopoint-8b-8bit"
    repo, revision = MOLMO_REPO, MOLMO_REVISION

    def __init__(self):
        from mlx_vlm import load
        from mlx_vlm.utils import load_config, get_model_path
        started = time.time()
        self.path = Path(get_model_path(self.repo, revision=self.revision))
        self.model, self.processor = load(str(self.path))
        self.config = load_config(str(self.path), trust_remote_code=True)
        self.load_seconds = time.time() - started

    def point(self, image, prompt: str) -> tuple[ppar.PointSet, dict]:
        from mlx_vlm import generate
        from mlx_vlm.prompt_utils import apply_chat_template
        formatted = apply_chat_template(
            self.processor, self.config, [{"role": "user", "content": prompt}],
            num_images=1)
        started = time.time()
        out = generate(self.model, self.processor, formatted, image=[image],
                       max_tokens=MAX_TOKENS, temperature=0.0, verbose=False)
        text = out.text if hasattr(out, "text") else str(out)
        # The processor stashes pointing metadata on ITSELF during __call__ and overwrites
        # it on the next call, so it must be read here, immediately.
        meta_obj = getattr(self.processor, "_pointing_metadata", None)
        w, h = image.size
        parsed = (ppar.parse_molmo(text, meta_obj, w, h) if meta_obj is not None
                  else ppar.PointSet(status=ppar.UNPARSED, raw=text,
                                     note="processor exposed no _pointing_metadata"))
        meta = {"seconds": time.time() - started,
                "generation_tokens": int(getattr(out, "generation_tokens", 0) or 0),
                "prompt_tokens": int(getattr(out, "prompt_tokens", 0) or 0),
                "had_metadata": meta_obj is not None}
        return parsed, meta


POINTERS = {"qwen": QwenPointer, "molmo": MolmoPointer}


# --------------------------------------------------------------------------- stored masks


def load_stored_masks(cover_ids: set[str]) -> dict[str, list[dict]]:
    """Instance masks from the v4-noun run, for the objective figure/mark check."""
    if not STORED_RUN.exists():
        return {}
    wanted = {}
    for cover in pc.COVERS:
        wanted[common.ImageRef.from_rel(cover.path).artwork_id] = cover.id
    out: dict[str, list[dict]] = {cid: [] for cid in cover_ids}
    with STORED_RUN.open() as fh:
        for line in fh:
            if '"record_type": "region"' not in line and '"region"' not in line:
                continue
            row = json.loads(line)
            cid = wanted.get(row.get("artwork_id"))
            if cid is None or row.get("record_type") != "region":
                continue
            out.setdefault(cid, []).append(row)
    return out


def concepts_at(rows: list[dict], px: float, py: float, width: int, height: int) -> list[str]:
    """Which stored instance masks contain this point."""
    hits = []
    for row in rows:
        h, w = int(row["mask_height"]), int(row["mask_width"])
        try:
            mask = common.rle_decode(row["mask_rle"], h, w)
        except Exception:
            continue
        x = int(min(max(px / width * w, 0), w - 1))
        y = int(min(max(py / height * h, 0), h - 1))
        if mask[y, x]:
            hits.append(row["concept"])
    return sorted(set(hits))


def iou(a: np.ndarray, b: np.ndarray) -> float:
    inter = int(np.logical_and(a, b).sum())
    union = int(np.logical_or(a, b).sum())
    return (inter / union) if union else 0.0


# --------------------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pointer", choices=sorted(POINTERS), required=True)
    ap.add_argument("--limit", type=int, default=0, help="first N covers only (debug)")
    ap.add_argument("--tag", default="", help="suffix for output filenames")
    args = ap.parse_args()

    from PIL import Image

    started_all = time.time()
    covers = list(pc.COVERS)[: args.limit] if args.limit else list(pc.COVERS)

    print(f"loading pointer {args.pointer} …")
    pointer = POINTERS[args.pointer]()
    print(f"  {pointer.name} loaded in {pointer.load_seconds:.1f}s from {pointer.path}")

    print("loading SAM 3.1 …")
    runtime = common.load_sam()
    common.register_image_plugins()
    print(f"  loaded in {runtime.load_seconds:.1f}s")

    stored = load_stored_masks({c.id for c in covers})
    print(f"  stored instance masks for {sum(1 for v in stored.values() if v)}"
          f"/{len(covers)} covers")

    rows: list[dict] = []
    tiles: list = []
    pointer_seconds = 0.0

    for cover in covers:
        path = config.REPO_ROOT / cover.path
        full = Image.open(path).convert("RGB")
        W, H = full.size
        small = full.copy()
        if max(small.size) > POINTER_CAP_PX:
            small.thumbnail((POINTER_CAP_PX, POINTER_CAP_PX), Image.LANCZOS)
        encoded = pp.encode_image(runtime, full)
        print(f"\n{cover.id} ({cover.role}, {W}x{H})  reviewer: {cover.reviewer_ground}")

        masks_by_prompt: dict[str, np.ndarray] = {}
        for prompt_key, prompt_text in pc.PROMPTS:
            pset, meta = pointer.point(small, prompt_text)
            pointer_seconds += meta["seconds"]

            row: dict = {
                "cover_id": cover.id, "role": cover.role,
                "decidable": cover.decidable,
                "reviewer_ground": cover.reviewer_ground,
                "prompt_key": prompt_key, "prompt": prompt_text,
                "pointer": pointer.name,
                "status": pset.status, "n_points": pset.n,
                "n_in_frame": pset.n_in_frame,
                "raw_output": pset.raw if pc.RECORD_RAW_OUTPUT else None,
                "parse_note": pset.note,
                "pointer_seconds": round(meta["seconds"], 3),
                "generation_tokens": meta["generation_tokens"],
                "points_normalized": [[round(p.x, 4), round(p.y, 4), p.group]
                                      for p in pset.points],
            }

            if pset.status == ppar.POINTS and pset.n_in_frame:
                pts = pset.pixels(W, H)
                row["points_pixels"] = [[round(x, 1), round(y, 1)] for x, y in pts]
                row["concepts_at_points"] = [
                    concepts_at(stored.get(cover.id, []), x, y, W, H) for x, y in pts]
                row["on_figure"] = any(set(c) & FIGURE_CONCEPTS
                                       for c in row["concepts_at_points"])
                row["on_mark"] = any(set(c) & MARK_CONCEPTS
                                     for c in row["concepts_at_points"])

                seg = pp.segment_from_points(runtime, full, pts, encoded=encoded)
                mask = seg.best_mask
                masks_by_prompt[prompt_key] = mask
                row.update({
                    "sam_area_fraction": round(seg.best_area_fraction, 4),
                    "sam_iou_pred": round(seg.best_iou, 3),
                    "sam_obj_score": round(seg.obj_score, 3),
                    "sam_contains_points": seg.best_contains_points,
                    "sam_candidate": seg.best_index,
                    "sam_selection": seg.selection,
                    "sam_seconds": round(seg.seconds, 3),
                })
                flag = ("FIGURE" if row["on_figure"] else
                        ("mark" if row["on_mark"] else "ground?"))
                print(f"  {prompt_key:13s} {pset.n} pt  area {seg.best_area_fraction:.3f}"
                      f"  in-mask {'Y' if seg.best_contains_points else 'N'}  {flag}"
                      f"   {pset.raw[:70]!r}")
                tiles.append(point_sheets.tile(
                    full, mask, pts, [1] * len(pts),
                    caption=(f"{cover.id} [{cover.role}] {prompt_key}\n"
                             f"{pset.n}pt area {seg.best_area_fraction:.2f} {flag}")))
            else:
                print(f"  {prompt_key:13s} {pset.status.upper():9s} "
                      f"{pset.raw[:70]!r}")
                tiles.append(point_sheets.tile(
                    full, None, [], [],
                    caption=(f"{cover.id} [{cover.role}] {prompt_key}\n"
                             f"{pset.status.upper()} — no mask")))
            rows.append(row)

        # Agreement between prompt phrasings on the same cover.
        keys = sorted(masks_by_prompt)
        for i in range(len(keys)):
            for j in range(i + 1, len(keys)):
                rows.append({"cover_id": cover.id, "record": "prompt_agreement",
                             "pointer": pointer.name,
                             "pair": [keys[i], keys[j]],
                             "mask_iou": round(iou(masks_by_prompt[keys[i]],
                                                   masks_by_prompt[keys[j]]), 4)})

    tag = args.tag or args.pointer
    sheet_path = config.DATA_DIR / "sheets" / f"pointing-{tag}.png"
    point_sheets.sheet(tiles, sheet_path, cols=len(pc.PROMPTS),
                       title=f"{pointer.name} -> SAM 3.1 point prompts — "
                             f"{len(covers)} covers x {len(pc.PROMPTS)} phrasings")
    print(f"\nsheet: {sheet_path}")

    summary = summarize(rows, covers)
    elapsed = time.time() - started_all
    out = config.DATA_DIR / f"pointing-probe-{tag}.json"
    out.write_text(json.dumps({
        "generated": common.utc_now(),
        "git_head": common.git_head(),
        "pointer": {"name": pointer.name, "repo": pointer.repo,
                    "revision": pointer.revision,
                    "load_seconds": round(pointer.load_seconds, 2),
                    "cap_px": POINTER_CAP_PX, "max_tokens": MAX_TOKENS},
        "sam": {"repo": config.MODEL_REPO, "revision": config.MODEL_REVISION,
                "coord_space": pp.DEFAULT_COORD_SPACE,
                "selection": pp.DEFAULT_SELECTION,
                "decoder": pp.DECODER_INTERACTIVE, "fpn": pp.FPN_INTERACTIVE},
        "prompts": [{"key": k, "text": t} for k, t in pc.PROMPTS],
        "stored_run": str(STORED_RUN.relative_to(config.REPO_ROOT)),
        "figure_concepts": sorted(FIGURE_CONCEPTS),
        "mark_concepts": sorted(MARK_CONCEPTS),
        "elapsed_seconds": round(elapsed, 1),
        "pointer_seconds_total": round(pointer_seconds, 1),
        "summary": summary,
        "rows": rows,
        "sheet": str(sheet_path.relative_to(config.REPO_ROOT)),
    }, indent=2) + "\n")

    print("\n" + "=" * 74)
    for line in summary["lines"]:
        print(line)
    print("=" * 74)
    print(f"wrote {out}")
    print(f"total {elapsed:.1f}s   pointer {pointer_seconds:.1f}s")
    return 0


def summarize(rows: list[dict], covers) -> dict:
    calls = [r for r in rows if r.get("record") != "prompt_agreement"]
    agree = [r for r in rows if r.get("record") == "prompt_agreement"]
    by_id = {c.id: c for c in covers}

    def frac(sel, pool):
        pool = list(pool)
        return (sum(1 for r in pool if sel(r)), len(pool))

    produced, n_calls = frac(lambda r: r["status"] == ppar.POINTS, calls)
    declined, _ = frac(lambda r: r["status"] == ppar.DECLINED, calls)
    unparsed, _ = frac(lambda r: r["status"] == ppar.UNPARSED, calls)

    with_pts = [r for r in calls if r.get("points_pixels")]
    on_fig, n_pt = frac(lambda r: r.get("on_figure"), with_pts)
    on_mark, _ = frac(lambda r: r.get("on_mark"), with_pts)

    dec = [r for r in with_pts if by_id[r["cover_id"]].decidable]
    dec_fig, n_dec = frac(lambda r: r.get("on_figure"), dec)

    amb_ids = [c.id for c in covers if not c.decidable]
    amb = [r for r in calls if r["cover_id"] in amb_ids]
    amb_decl, n_amb = frac(lambda r: r["status"] == ppar.DECLINED, amb)

    ctrl = [r for r in calls if r["role"] == "control" and r["cover_id"] != "skap"]
    ctrl_pts, n_ctrl = frac(lambda r: r["status"] == ppar.POINTS, ctrl)

    # Per-phrasing breakdown. Without this, a decline rate reads as a statement about the
    # covers when it may be a statement about the wording — which is exactly what the
    # first Qwen run turned out to be.
    by_prompt = {}
    for key, _text in pc.PROMPTS:
        sub = [r for r in calls if r.get("prompt_key") == key]
        if not sub:
            continue
        by_prompt[key] = {
            "calls": len(sub),
            "produced_points": sum(1 for r in sub if r["status"] == ppar.POINTS),
            "declined": sum(1 for r in sub if r["status"] == ppar.DECLINED),
            "unparsed": sum(1 for r in sub if r["status"] == ppar.UNPARSED),
        }

    # Are the points perceived, or stereotyped? A pointer that answers "background" with
    # near-symmetric frame corners is exhibiting a prior. EDGE = within 15% of any edge;
    # CORNERISH = within 20% of a corner.
    all_pts = [(p[0], p[1]) for r in with_pts for p in r["points_normalized"]]
    edge = sum(1 for x, y in all_pts
               if min(x, 1 - x) < 0.15 or min(y, 1 - y) < 0.15)
    corner = sum(1 for x, y in all_pts
                 if min(x, 1 - x) < 0.20 and min(y, 1 - y) < 0.20)

    ious = [r["mask_iou"] for r in agree]
    areas = [r["sam_area_fraction"] for r in with_pts if "sam_area_fraction" in r]
    contains = frac(lambda r: r.get("sam_contains_points"), with_pts)

    lines = [
        f"calls                        {n_calls}",
        f"  produced points            {produced}/{n_calls}",
        f"  explicitly DECLINED        {declined}/{n_calls}",
        f"  unparsed (not a decline)   {unparsed}/{n_calls}",
        f"points landed on a FIGURE    {on_fig}/{n_pt}   "
        f"(pre-registered FAIL condition)",
        f"  ... on the 11 decidable    {dec_fig}/{n_dec}",
        f"points landed on applied mark {on_mark}/{n_pt}   (not a failure; reported)",
        f"controls produced points     {ctrl_pts}/{n_ctrl}   "
        f"(stop rule: if controls fail, the 9 are not interpreted)",
        f"ambiguous covers declined    {amb_decl}/{n_amb}   "
        f"(behaviour, not correctness)",
        f"SAM mask contains its points {contains[0]}/{contains[1]}",
        f"mean SAM mask area           {np.mean(areas):.3f}" if areas else
        "mean SAM mask area           n/a",
        f"prompt-phrasing mask IoU     mean {np.mean(ious):.3f}  median "
        f"{np.median(ious):.3f}  (n={len(ious)})" if ious else
        "prompt-phrasing mask IoU     n/a",
        "by phrasing:  " + "   ".join(
            f"{k}={v['produced_points']}pt/{v['declined']}dec" for k, v in by_prompt.items()),
        f"points near an edge (<15%)   {edge}/{len(all_pts)}   "
        f"near a corner (<20%) {corner}/{len(all_pts)}   "
        f"(uniform-random baseline: 51% and 16%)",
    ]
    return {
        "by_phrasing": by_prompt,
        "points_total": len(all_pts),
        "points_near_edge": edge,
        "points_near_corner": corner,
        "edge_baseline_uniform": 0.51,
        "corner_baseline_uniform": 0.16,
        "calls": n_calls, "produced_points": produced, "declined": declined,
        "unparsed": unparsed,
        "points_on_figure": on_fig, "point_calls": n_pt,
        "points_on_figure_decidable": dec_fig, "decidable_point_calls": n_dec,
        "points_on_mark": on_mark,
        "controls_produced_points": ctrl_pts, "control_calls": n_ctrl,
        "ambiguous_declined": amb_decl, "ambiguous_calls": n_amb,
        "sam_contains_points": contains[0], "sam_calls": contains[1],
        "mean_sam_area": round(float(np.mean(areas)), 4) if areas else None,
        "prompt_agreement_iou_mean": round(float(np.mean(ious)), 4) if ious else None,
        "prompt_agreement_iou_median": round(float(np.median(ious)), 4) if ious else None,
        "lines": lines,
    }


if __name__ == "__main__":
    sys.exit(main())
