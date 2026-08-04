"""Diagnose the `pointing-ground-1` wash failure from masks already on disk. CPU only.

Why this file exists
--------------------
`POINTING_PROBE_NOTES.md` §13 scored the round: the dot half passed (7/8), the wash half
failed (3/8), and on the six covers with an answer key the pointer missed **zero** times
while four of six washes were wrong. §13.6 recommendation 1 is this script: work the wash
on CPU, from masks that already exist, before spending another GPU slot.

What is and is not available, measured not assumed
-------------------------------------------------
The interactive decoder emits K=4 candidates and `PointSegmentation` carries all of them,
but the only `rle_encode` call on a segmentation in this tree is
`pointing_phrasing_sweep.py:198`, `common.rle_encode(seg.best_mask)`. **The three
unselected candidate masks were never written to disk, for any cover, ever.** So a
candidate-level counterfactual — "would candidate 2 have been better than candidate 0" —
is not answerable without re-running SAM, and this pass runs no inference.

What IS on disk, and what this script therefore does instead:

1. **Point-level masks.** Up to 5 phrasings x 1 pointer per cover, each a *selected* mask
   grown from that phrasing's own point. Different points, same image, same policy. Their
   spread bounds what the current pipeline can reach, and their union tests the
   multi-region hypothesis directly.
2. **Candidate-level scalars.** `point-smoke-synthetic.json` stores `candidate_areas[4]`,
   `candidate_ious[4]` and `candidate_contains[4]` per row — 1000 rows over 4 covers. No
   pixels, but enough to measure the *shape* of the candidate family and to say what a
   different selection rule would have picked in area terms.
3. **A ground proxy.** The reviewer's own prose (`GROUND_FREETEXT_SYNTHESIS.md`) turned
   into per-cover geometric predicates, plus the complement of the v4-noun run's
   figure-concept instances.

The predicates and the policy band were both pre-registered in
`data/sam/pointing-wash-prereg.json` before any of this was scored, and both were written
after looking at the eight shipped masks' geometry. **Every number this produces on these
eight tiles is in-sample.** The generalisation test is the typical-strata probe, §13.8,
which stays specified-not-run.
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common  # noqa: E402
import config  # noqa: E402
import pointing_covers as pc  # noqa: E402

DATA = config.DATA_DIR
SWEEP_MOLMO = DATA / "pointing-phrasing-sweep-molmo.json"
SWEEP_QWEN = DATA / "pointing-phrasing-sweep-qwen.json"
SMOKE = DATA / "point-smoke-synthetic.json"
STORED_RUN = DATA / "sam-eval-142-v4-nouns.jsonl"
PREREG = DATA / "pointing-wash-prereg.json"
OUT = DATA / "pointing-wash-diagnosis.json"

#: The eight tiles of pointing-ground-1, and the reviewer's wash verdict on each (§13.4).
ROUND = {
    "00014fb4":   ("decidable-six", True, False),
    "00030075":   ("decidable-six", True, True),
    "00066a61":   ("decidable-six", True, False),
    "00075841":   ("decidable-six", True, False),
    "000f0a78":   ("decidable-six", True, False),
    "artofficial": ("decidable-six", True, True),
    "0002dfdc":   ("phrasing-disagreement", True, True),
    "elephunk":   ("phrasing-disagreement", False, False),
}

#: Pre-registered admissibility band. See pointing-wash-prereg.json.
MIN_AREA = 0.05
MAX_AREA = 0.85

#: Concepts that are figure, not ground. `dyn-*` is excluded on purpose: the dynamic noun
#: head returned `dyn-building` at 0.75 area on the spa room, i.e. the whole room including
#: the wall the reviewer calls the ground, so dynamic concepts cannot serve as a figure key.
FIGURE_CONCEPTS = {"person", "face", "words", "letter", "lettering",
                   "display-text", "emblem", "sticker"}
#: An "instance" covering more than this much of the frame is not a figure.
FIGURE_MAX_AREA = 0.60


# --------------------------------------------------------------------------- loading


def load_sweep_masks() -> dict[str, dict[str, dict]]:
    """cover -> "<pointer>/<phrasing>" -> row, for every row that stored a mask."""
    out: dict[str, dict[str, dict]] = defaultdict(dict)
    for path, tag in ((SWEEP_MOLMO, "molmo"), (SWEEP_QWEN, "qwen")):
        if not path.exists():
            continue
        for row in json.load(path.open())["rows"]:
            if row.get("status") != "points" or not row.get("mask_rle"):
                continue
            out[row["cover_id"]][f"{tag}/{row['phrasing_key']}"] = row
    return out


def load_instances() -> dict[str, list[dict]]:
    """cover -> v4-noun instance rows."""
    by_artwork = {common.ImageRef.from_rel(c.path).artwork_id: c.id for c in pc.COVERS}
    out: dict[str, list[dict]] = defaultdict(list)
    with STORED_RUN.open() as fh:
        for line in fh:
            if '"region"' not in line:
                continue
            row = json.loads(line)
            if row.get("record_type") != "region":
                continue
            cid = by_artwork.get(row.get("artwork_id"))
            if cid:
                out[cid].append(row)
    return out


def instance_mask(row: dict, shape: tuple[int, int]) -> np.ndarray:
    m = common.rle_decode(row["mask_rle"], int(row["mask_height"]), int(row["mask_width"]))
    if m.shape != shape:
        m = np.asarray(Image.fromarray(m * 255).resize((shape[1], shape[0]),
                                                       Image.NEAREST)) > 127
    return m.astype(np.uint8)


def figure_union(rows: list[dict], shape: tuple[int, int]) -> np.ndarray:
    acc = np.zeros(shape, dtype=np.uint8)
    for row in rows:
        if row["concept"] not in FIGURE_CONCEPTS:
            continue
        if float(row["area_fraction"]) > FIGURE_MAX_AREA:
            continue
        acc |= instance_mask(row, shape)
    return acc


def named_union(rows: list[dict], shape, concepts: set[str], min_area=0.0) -> np.ndarray:
    acc = np.zeros(shape, dtype=np.uint8)
    for row in rows:
        if row["concept"] in concepts and float(row["area_fraction"]) >= min_area:
            acc |= instance_mask(row, shape)
    return acc


def central_instance(rows: list[dict], shape, concepts: set[str]) -> np.ndarray:
    """The instance of `concepts` whose bbox centre is nearest the frame centre."""
    best, best_d = None, 1e9
    for row in rows:
        if row["concept"] not in concepts:
            continue
        w, h = float(row["mask_width"]), float(row["mask_height"])
        cx = (float(row["bbox_x"]) + float(row["bbox_w"]) / 2) / w
        cy = (float(row["bbox_y"]) + float(row["bbox_h"]) / 2) / h
        d = (cx - 0.5) ** 2 + (cy - 0.5) ** 2
        if d < best_d:
            best, best_d = row, d
    return (instance_mask(best, shape) if best is not None
            else np.zeros(shape, dtype=np.uint8))


# --------------------------------------------------------------------------- predicates


def row_band(mask: np.ndarray, lo: float, hi: float) -> float:
    h = mask.shape[0]
    return float(mask[int(lo * h):int(hi * h)].mean())


def col_band(mask: np.ndarray, lo: float, hi: float) -> float:
    w = mask.shape[1]
    return float(mask[:, int(lo * w):int(hi * w)].mean())


def left_out(mask: np.ndarray, target: np.ndarray) -> float:
    """Fraction of `target` the mask does NOT cover."""
    t = int(target.sum())
    if not t:
        return float("nan")
    return 1.0 - float(np.logical_and(mask, target).sum()) / t


def predicate(cover: str, mask: np.ndarray, inst: list[dict]) -> tuple[bool, dict]:
    """The pre-registered per-cover ground predicate. Returns (pass, the terms)."""
    shape = mask.shape
    area = float(mask.mean())

    if cover == "00014fb4":                      # two fields, green left / red right
        l, r = col_band(mask, 0.0, 0.5), col_band(mask, 0.5, 1.0)
        return (l >= 0.25 and r >= 0.25), {"left_half": l, "right_half": r, "area": area}

    if cover == "00030075":                      # one wall, "maybe 30%"
        return (0.20 <= area <= 0.45), {"area": area}

    if cover == "00066a61":                      # pink field, logo cut out
        logo = named_union(inst, shape, {"emblem", "display-text", "words"}, min_area=0.20)
        out = left_out(mask, logo)
        return (area >= 0.50 and out >= 0.50), {"area": area, "logo_left_out": out}

    if cover == "00075841":                      # white banner + hardwood floor
        top, bot = row_band(mask, 0.0, 0.15), row_band(mask, 0.80, 1.0)
        return (top >= 0.50 and bot >= 0.25), {"top15": top, "bottom20": bot, "area": area}

    if cover == "000f0a78":                      # three stacked bands
        top, bot = row_band(mask, 0.0, 0.25), row_band(mask, 0.50, 1.0)
        return (top >= 0.40 and bot >= 0.40), {"top25": top, "bottom50": bot, "area": area}

    if cover == "artofficial":                   # everything but the central face
        face = central_instance(inst, shape, {"face"})
        out = left_out(mask, face)
        return (area >= 0.60 and out >= 0.50), {"area": area, "face_left_out": out}

    return False, {"area": area, "scored": False}


# --------------------------------------------------------------------------- scoring


def iou(a: np.ndarray, b: np.ndarray) -> float:
    u = int(np.logical_or(a, b).sum())
    return (int(np.logical_and(a, b).sum()) / u) if u else 0.0


def against_proxy(mask: np.ndarray, ground: np.ndarray) -> dict:
    g, m = int(ground.sum()), int(mask.sum())
    inter = int(np.logical_and(mask, ground).sum())
    return {
        "iou": round(iou(mask, ground), 4),
        "recall": round(inter / g, 4) if g else None,
        "precision": round(inter / m, 4) if m else None,
    }


def admissible(area: float) -> bool:
    return MIN_AREA <= area <= MAX_AREA


# --------------------------------------------------------------------------- policies
#
# R1 is the pre-registered `union_ground`. R2-R4 are POST-HOC variants, added after R1 was
# scored, and they exist to answer one question: is the wash recoverable by *any* rule that
# combines the masks already on disk? They are reported as a family precisely so that no
# single flattering row can be quoted as the fix.


def policy_masks(masks: dict[str, np.ndarray], name: str) -> tuple[np.ndarray, str]:
    keys = sorted(masks)
    adm = [k for k in keys if admissible(float(masks[k].mean()))]
    shape = masks[keys[0]].shape

    if name == "R0_incumbent_plain":
        return masks["molmo/plain"], "the shipped mask: molmo, `plain` phrasing"

    if name == "R4_largest_admissible_single":
        if not adm:
            k = min(keys, key=lambda k: float(masks[k].mean()))
            return masks[k], f"no admissible mask; smallest recorded ({k})"
        k = max(adm, key=lambda k: float(masks[k].mean()))
        return masks[k], f"largest admissible single mask ({k})"

    if name == "R1_union_all_admissible":
        acc = np.zeros(shape, dtype=np.uint8)
        for k in adm:
            acc |= masks[k]
        if not adm:
            k = min(keys, key=lambda k: float(masks[k].mean()))
            return masks[k], f"no admissible mask; smallest recorded ({k})"
        if float(acc.mean()) > MAX_AREA:
            k = max(adm, key=lambda k: float(masks[k].mean()))
            return masks[k], f"union over cap; largest admissible ({k})"
        return acc, f"union of {len(adm)} admissible: {adm}"

    if name == "R2_greedy_union_under_cap":
        acc = np.zeros(shape, dtype=np.uint8)
        taken = []
        for k in sorted(adm, key=lambda k: -float(masks[k].mean())):
            trial = acc | masks[k]
            if float(trial.mean()) <= MAX_AREA:
                acc, _ = trial, taken.append(k)
        if not taken:
            return policy_masks(masks, "R4_largest_admissible_single")
        return acc, f"greedy by area under cap: {taken}"

    if name == "R3_pixel_majority_vote":
        if not adm:
            return policy_masks(masks, "R4_largest_admissible_single")
        votes = np.zeros(shape, dtype=np.int16)
        for k in adm:
            votes += masks[k]
        return (votes * 2 >= len(adm)).astype(np.uint8), f"pixels in >= half of {len(adm)}"

    raise ValueError(name)


POLICIES = ("R0_incumbent_plain", "R1_union_all_admissible", "R2_greedy_union_under_cap",
            "R3_pixel_majority_vote", "R4_largest_admissible_single")


# --------------------------------------------------------------------------- candidates


def candidate_family() -> dict:
    """What the four decoder candidates look like, from the only file that stored them.

    No pixels — `candidate_areas`, `candidate_ious`, `candidate_contains` only. This
    measures the *shape* of the candidate set and what each selection rule picks in area
    terms. It cannot say which candidate was the right ground: these are synthetic probe
    points on four covers, three of which are not in the round.
    """
    if not SMOKE.exists():
        return {"available": False}
    doc = json.load(SMOKE.open())
    rows = []

    def walk(node):
        if isinstance(node, dict):
            if "candidate_areas" in node and "candidate_contains" in node:
                rows.append(node)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(doc.get("results", {}))
    if not rows:
        return {"available": False}

    stats = {"rows": len(rows), "spread": [], "incumbent": [], "ground_rule": [],
             "rule_differs": 0, "no_admissible": 0}
    for r in rows:
        areas = np.asarray(r["candidate_areas"], dtype=float)
        ious = np.asarray(r["candidate_ious"], dtype=float)
        contains = np.asarray(r["candidate_contains"], dtype=bool)
        stats["spread"].append(float(areas.max() - areas.min()))

        ok = np.flatnonzero(contains)
        inc = int(ok[int(np.argmax(ious[ok]))]) if ok.size else int(np.argmax(ious))

        band = np.flatnonzero(contains & (areas >= MIN_AREA) & (areas <= MAX_AREA))
        if band.size:
            new = int(band[int(np.argmax(areas[band]))])
        else:
            under = np.flatnonzero(contains & (areas <= MAX_AREA))
            new = int(under[int(np.argmax(areas[under]))]) if under.size else inc
            stats["no_admissible"] += 1

        stats["incumbent"].append(float(areas[inc]))
        stats["ground_rule"].append(float(areas[new]))
        stats["rule_differs"] += int(new != inc)

    def summarise(key):
        a = np.asarray(stats[key])
        return {"mean": round(float(a.mean()), 4), "median": round(float(np.median(a)), 4)}

    return {
        "available": True,
        "source": SMOKE.name,
        "rows": stats["rows"],
        "caveat": ("synthetic probe points on 000bc98f, 0002dfdc, 0000269e, skap — only "
                   "0002dfdc is in the round, and none of these points came from a "
                   "pointing model. Areas only; no pixels, so no correctness claim."),
        "candidate_area_spread": summarise("spread"),
        "area_picked_by_SELECT_CONTAINING": summarise("incumbent"),
        "area_picked_by_SELECT_GROUND": summarise("ground_rule"),
        "rows_where_the_two_rules_differ": stats["rows"] and round(
            stats["rule_differs"] / stats["rows"], 4),
        "rows_with_no_admissible_containing_candidate": stats["no_admissible"],
    }


# --------------------------------------------------------------------------- main


def main() -> int:
    sweeps = load_sweep_masks()
    instances = load_instances()
    by_id = {c.id: c for c in pc.COVERS}

    report = {
        "analysis": "pointing-wash-1",
        "date": "2026-08-04",
        "inference_run": "none — CPU only, every mask read from disk",
        "prereg": str(PREREG.relative_to(config.REPO_ROOT)),
        "in_sample_warning": (
            "The predicates and the admissibility band were written after looking at the "
            "eight shipped masks' geometry. Every before/after below is IN-SAMPLE tuning "
            "on the tiles it repairs. It generalises to nothing. The typical-strata probe "
            "(POINTING_PROBE_NOTES.md §13.8) stays specified-not-run."),
        "candidate_masks_on_disk": (
            "NONE. Only seg.best_mask was ever serialised (pointing_phrasing_sweep.py:198). "
            "The candidate-level counterfactual is not answerable without new inference; "
            "the reachability claims below are point-level, not candidate-level."),
        "covers": {},
        "candidate_family": candidate_family(),
    }

    for cover, (stratum, dot_ok, wash_ok) in ROUND.items():
        rows = sweeps.get(cover, {})
        plain = rows.get("molmo/plain")
        if plain is None:
            report["covers"][cover] = {"error": "no molmo/plain mask on disk"}
            continue
        h, w = int(plain["mask_height"]), int(plain["mask_width"])
        shape = (h, w)
        inst = instances.get(cover, [])
        fig = figure_union(inst, shape)
        ground_proxy = (1 - fig).astype(np.uint8)
        proxy_usable = 0.10 <= float(ground_proxy.mean()) <= 0.98

        masks, entries = {}, {}
        for key, row in sorted(rows.items()):
            m = common.rle_decode(row["mask_rle"],
                                  int(row["mask_height"]), int(row["mask_width"]))
            if m.shape != shape:
                m = (np.asarray(Image.fromarray(m * 255).resize((w, h), Image.NEAREST))
                     > 127).astype(np.uint8)
            masks[key] = m
            area = float(m.mean())
            ok, terms = predicate(cover, m, inst)
            entries[key] = {
                "point": row.get("points_pixels"),
                "area_fraction": round(area, 4),
                "sam_iou_pred": row.get("sam_iou_pred"),
                "admissible": admissible(area),
                "predicate_pass": bool(ok),
                "predicate_terms": {k: (round(v, 4) if isinstance(v, float) else v)
                                    for k, v in terms.items()},
                "vs_figure_complement": against_proxy(m, ground_proxy) if proxy_usable else None,
            }

        policies = {}
        for name in POLICIES:
            m, note = policy_masks(masks, name)
            ok, terms = predicate(cover, m, inst)
            policies[name] = {
                "note": note,
                "area_fraction": round(float(m.mean()), 4),
                "predicate_pass": bool(ok),
                "predicate_terms": {k: (round(v, 4) if isinstance(v, float) else v)
                                    for k, v in terms.items()},
                "vs_figure_complement": against_proxy(m, ground_proxy) if proxy_usable else None,
            }
        union = policies["R1_union_all_admissible"]
        union_ok = union["predicate_pass"]

        # ORACLE BOUND, not a policy: the best union of any two recorded masks, chosen
        # WITH KNOWLEDGE OF THE ANSWER. It cannot be shipped. Its only job is to separate
        # "two points could reach this ground" from "no pair of recorded points can".
        best_pair, pair_terms, pair_area = None, None, None
        keys = sorted(masks)
        for i in range(len(keys)):
            for j in range(i + 1, len(keys)):
                pair = masks[keys[i]] | masks[keys[j]]
                ok, terms = predicate(cover, pair, inst)
                if ok:
                    best_pair = [keys[i], keys[j]]
                    pair_terms = terms
                    pair_area = float(pair.mean())
                    break
            if best_pair:
                break
        oracle_pair = {
            "is_an_oracle_not_a_policy": True,
            "any_two_recorded_masks_satisfy_the_predicate": best_pair is not None,
            "example_pair": best_pair,
            "area_fraction": round(pair_area, 4) if pair_area is not None else None,
            "predicate_terms": ({k: (round(v, 4) if isinstance(v, float) else v)
                                 for k, v in pair_terms.items()} if pair_terms else None),
        }

        adm = [k for k in masks if admissible(float(masks[k].mean()))]
        singles_pass = [k for k, e in entries.items() if e["predicate_pass"]]
        plain_pass = entries["molmo/plain"]["predicate_pass"]
        all_over_cap = bool(masks) and not adm

        if cover in ("0002dfdc", "elephunk"):
            klass = "not-scored-no-answer-key"
        elif plain_pass:
            klass = "already-passing"
        elif singles_pass:
            klass = "better-candidate-existed"
        elif any(policies[p]["predicate_pass"] for p in POLICIES):
            klass = "multi-region-ground"
        elif all_over_cap:
            klass = "over-coverage-no-point-level-escape"
        else:
            klass = "no-good-candidate"

        report["covers"][cover] = {
            "stratum": stratum,
            "reviewer": {"dot_right": dot_ok, "wash_right": wash_ok},
            "mask_shape": [h, w],
            "figure_complement_area": round(float(ground_proxy.mean()), 4),
            "figure_complement_usable": proxy_usable,
            "shipped_plain_predicate_pass": plain_pass,
            "recorded_masks": entries,
            "n_admissible": len(adm),
            "policies": policies,
            "union": union,
            "oracle_best_pair": oracle_pair,
            "classification": klass,
            "single_masks_that_pass": sorted(singles_pass),
        }

    scored = [c for c, v in report["covers"].items()
              if v.get("classification") not in (None, "not-scored-no-answer-key")]
    report["summary"] = {
        "classification_counts": {
            k: sum(1 for c in scored if report["covers"][c]["classification"] == k)
            for k in ("already-passing", "better-candidate-existed",
                      "multi-region-ground", "over-coverage-no-point-level-escape",
                      "no-good-candidate")},
        "policy_scores_IN_SAMPLE": {
            p: f"{sum(1 for c in scored if report['covers'][c]['policies'][p]['predicate_pass'])}/{len(scored)}"
            for p in POLICIES},
        "policy_per_cover_IN_SAMPLE": {
            p: {c: report["covers"][c]["policies"][p]["predicate_pass"] for c in scored}
            for p in POLICIES},
        "predicate_vs_reviewer": {
            c: {"reviewer_wash_right": ROUND[c][2],
                "predicate_on_shipped_mask": report["covers"][c]["shipped_plain_predicate_pass"]}
            for c in scored},
        "in_sample_before": sum(1 for c in scored
                                if report["covers"][c]["shipped_plain_predicate_pass"]),
        "in_sample_after": sum(1 for c in scored
                               if report["covers"][c]["union"]["predicate_pass"]),
        "n_scored": len(scored),
    }

    OUT.write_text(json.dumps(report, indent=2) + "\n")
    print(f"wrote {OUT}")
    print(json.dumps(report["summary"], indent=2))
    for c in scored:
        v = report["covers"][c]
        print(f"  {c:12s} {v['classification']:26s} "
              f"plain {v['recorded_masks']['molmo/plain']['area_fraction']:.3f} "
              f"{'PASS' if v['shipped_plain_predicate_pass'] else 'fail'}"
              f" -> union {v['union']['area_fraction']:.3f} "
              f"{'PASS' if v['union']['predicate_pass'] else 'fail'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
