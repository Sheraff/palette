"""Bake-off scoring: every arm against the reviewer's gold 30 and against the accepted flags.

    .venv/bin/python score.py                       # every arm with results on disk
    .venv/bin/python score.py --arm gemma3-27b      # one arm
    .venv/bin/python score.py --items eval142       # one item set

Writes research/v3/data/oracle-bakeoff/scores.json and scores.txt (a plain table), and prints
the table.

WHAT IS COMPARED, AND WHY NEITHER COMPARISON IS A CLEAN MATCH
This wraps research/v3/oracle/premise/analyze.py rather than restating it: GRADIENT_MAP,
P6_BUCKETS, binary_scores, cohens_kappa and tier_of are imported from that file, so both
workstreams score the same arithmetic. Two reference sets, and they answer different questions:

(a) THE REVIEWER'S GOLD 30 — data/oracle-validation/premise-disambiguation-1-analysis.json.
    These are elicited human labels: the reviewer looked at the artwork and named a
    ground_type from the frozen vocabulary. They are the only ground truth here that is
    actually about the artwork. But the 30 were chosen BECAUSE the premise oracle and the
    accepted flag contradicted each other, so the slice is adversarial by construction, and
    the analysis file's own summary calls the outcome "a lean, not a verdict" (the reviewer
    sided with the flag 14/30, with the oracle 10/30, with neither 6/30). Read exact-match
    and binary agreement here as a hard-case probe, never as the ranking.

(b) THE ACCEPTED FLAGS ON THE FULL 142 — data/oracle-premise/eval-set.json. Not elicited
    labels at all: an accepted algorithm decision (eval-set.json meta.groundTruthEpistemology).
    PHASE_0_DECISIONS.md §4 P6 governs it and is explicit that this is NEVER an exact-match
    test, because several palettes can be valid for one artwork. Every (label, decision) pair
    is sorted into P6's three buckets — contradiction / agreement / can't-tell — and the
    buckets are reported separately rather than folded into one accuracy figure. This is the
    bake-off's real question: the whole set, especially its tractable part.

A NUMBER THAT IS NOT A SCORE, AND MATTERS ANYWAY: inter-variant agreement per arm. Pipeline
§3 routes the variant-disagreement subset to the dense adjudicator, so that subset's SIZE is
the adjudicator's bill. An arm that is cheap but unsettled is not cheap.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402
from bakeoff_common import (  # noqa: E402
    VOCABULARIES, gold30_reviewer_labels, load_items, premise_common, read_jsonl, utc_now,
)

# The premise workstream's scoring arithmetic, imported (its directory is already on sys.path
# via bakeoff_common). Importing rather than copying is the point: one definition of "agree".
from analyze import GRADIENT_MAP, P6_BUCKETS, binary_scores, tier_of  # noqa: E402

# [MEASURED] The published gold-30 result, read out of
# premise-disambiguation-1-analysis.json on 2026-08-03. score.py recomputes these from the
# raw premise run and asserts it lands on the same numbers; a mismatch means this scorer and
# the reviewer-facing analysis disagree about what "agreement" means, which must be fixed
# before any arm is ranked. Checked only for the incumbent arm, which is what that file scored.
PUBLISHED_GOLD30 = {
    "exact_match": {"A": (7, 30), "B": (16, 30)},
    "binary_agreement": {"A": (8, 20), "B": (17, 24)},
    "flag_binary_agreement": (14, 24),
}


# ---------------------------------------------------------------- loading

def load_arm_rows(arm: str, item_set: str) -> tuple[list[dict], Path]:
    """One arm's answers for one item set: ok rows only, canaries dropped, arm attributed.

    The incumbent's results file is the premise run, whose rows predate the `arm` column. It
    is attributed from the registry after checking that its model_revision is the one the
    registry pins — an unchecked attribution would silently mislabel another model's answers.
    """
    spec = config.arm_config(arm)
    path = config.results_path(arm, item_set)
    if not path.exists():
        return [], path
    wanted = {i.image_sha256 for i in load_items(item_set)}
    rows = []
    for row in read_jsonl(path):
        if row.get("is_canary"):
            continue
        if row.get("image_sha256") not in wanted:
            continue
        if row.get("arm") is None:
            if row.get("model_revision") != spec["hf_revision"]:
                raise RuntimeError(
                    f"{path.name} holds a row at revision {row.get('model_revision')} but arm "
                    f"{arm} pins {spec['hf_revision']}; refusing to attribute it")
            row = dict(row, arm=arm, item_set=item_set)
        elif row["arm"] != arm:
            continue
        rows.append(row)
    return rows, path


def index_answers(rows: list[dict]) -> tuple[dict[str, dict[str, dict]], dict[str, dict]]:
    """(sha -> variant -> parsed answer, sha -> per-image metadata)."""
    by_image: dict[str, dict[str, dict]] = defaultdict(dict)
    meta: dict[str, dict] = {}
    for row in rows:
        if row.get("status") != "ok" or not row.get("parsed"):
            continue
        by_image[row["image_sha256"]][row["prompt_variant"]] = row["parsed"]
        meta[row["image_sha256"]] = {
            "image_path": row["image_path"],
            "artwork_id": row["artwork_id"],
            "gradient_truth": row.get("gradient_truth"),
            "conflicted": bool(row.get("gradient_truth_conflicted")),
            "tier": tier_of(row["source_long_edge_px"]),
        }
    return by_image, meta


def health_of(rows: list[dict]) -> dict:
    return {
        "rows": len(rows),
        "ok": sum(1 for r in rows if r.get("status") == "ok"),
        "failed": sum(1 for r in rows if r.get("status") == "failed"),
        "parse_failed": sum(1 for r in rows if r.get("parse_failed")),
        "attempts_gt_1": sum(1 for r in rows if (r.get("attempts") or 1) > 1),
        "by_variant": dict(Counter(r["prompt_variant"] for r in rows)),
        "constrained_decoding": sorted({bool(r.get("constrained_decoding")) for r in rows}),
        "model_revisions": sorted({r.get("model_revision", "?") for r in rows}),
        "prompt_hashes": sorted({r.get("prompt_hash", "?") for r in rows}),
        "median_generation_seconds": (
            sorted(r.get("generation_seconds", 0) for r in rows)[len(rows) // 2] if rows else None),
    }


# ---------------------------------------------------------------- (a) the reviewer's gold 30

def gold30_report(by_image: dict, variant: str, labels: dict[str, dict]) -> dict:
    """Exact vocabulary match and binary agreement against the reviewer's own answers.

    `no-prediction` is not a wrong answer. GRADIENT_MAP leaves full_scene, pattern_or_texture
    and none_discernible unmapped on purpose — none of them is a claim about whether the
    ground is one shaded surface — so a pair is scored on the binary only when BOTH sides map.
    The dropped counts are reported, because a model that mostly answers `full_scene` would
    otherwise look accurate on a handful of items.
    """
    exact_hits = 0
    scored: list[tuple[bool, bool]] = []
    flag_pairs: list[tuple[bool, bool]] = []
    dropped = Counter()
    confusion = Counter()
    answered = 0
    sided = Counter()
    for sha, label in labels.items():
        parsed = by_image.get(sha, {}).get(variant)
        if parsed is None:
            dropped["oracle_has_no_answer"] += 1
            continue
        answered += 1
        oracle_label = parsed["ground_type"]
        reviewer_label = label["reviewer_ground_type"]
        confusion[(reviewer_label, oracle_label)] += 1
        exact_hits += int(oracle_label == reviewer_label)

        reviewer_binary = GRADIENT_MAP[reviewer_label]
        oracle_binary = GRADIENT_MAP[oracle_label]
        if reviewer_binary == "unmapped":
            dropped["reviewer_made_no_prediction"] += 1
            continue
        reviewer_gradient = reviewer_binary == "gradient"
        # The flag baseline uses every item the reviewer made a prediction on, which is what
        # the published analysis' 14/24 counts.
        flag_pairs.append((reviewer_gradient, bool(label["flag_gradient"])))
        if oracle_binary == "unmapped":
            dropped["oracle_made_no_prediction"] += 1
            continue
        oracle_gradient = oracle_binary == "gradient"
        scored.append((reviewer_gradient, oracle_gradient))
        oracle_right = oracle_gradient == reviewer_gradient
        flag_right = bool(label["flag_gradient"]) == reviewer_gradient
        sided["both" if (oracle_right and flag_right) else
              "oracle" if oracle_right else
              "flag" if flag_right else "neither"] += 1

    return {
        "n_items": len(labels),
        "answered": answered,
        "exact_vocabulary_match": {
            "matched": exact_hits,
            "n": answered,
            "rate": round(exact_hits / answered, 4) if answered else None,
        },
        "binary_agreement_vs_reviewer": {
            **binary_scores(scored),
            "note": "n < 30: pairs where either side's label predicts nothing are dropped, not scored",
        },
        "flag_baseline_vs_reviewer": binary_scores(flag_pairs),
        "dropped": dict(dropped),
        "who_the_reviewer_agreed_with": dict(sided),
        "reviewer_label_x_oracle_label": {
            f"{r}->{o}": n for (r, o), n in sorted(confusion.items())},
        "reviewer_label_distribution": dict(Counter(
            v["reviewer_ground_type"] for v in labels.values())),
        "oracle_label_distribution": dict(Counter(
            by_image[s][variant]["ground_type"] for s in labels
            if variant in by_image.get(s, {}))),
    }


# ---------------------------------------------------------------- (b) the accepted flags

def flag_report(by_image: dict, meta: dict, variant: str, images: list[str]) -> dict:
    """premise/analyze.py's variant_report, applied to one arm's answers.

    Same three views it reports, for the same reasons: `strict_all_labels` forces every label
    into the binary (unmapped -> flat); `mapped_labels_only` drops the three siblings
    entirely; the P6 buckets count what neither view can score. Quote all three or none.
    """
    strict: list[tuple[bool, bool]] = []
    mapped_only: list[tuple[bool, bool]] = []
    buckets: Counter = Counter()
    contingency: Counter = Counter()
    unmapped = 0
    for sha in images:
        parsed = by_image.get(sha, {}).get(variant)
        if parsed is None:
            continue
        truth = meta[sha]["gradient_truth"]
        ground = parsed["ground_type"]
        contingency[(ground, truth)] += 1
        buckets[P6_BUCKETS.get((ground, truth), "underdetermined")] += 1
        mapped = GRADIENT_MAP[ground]
        if mapped == "unmapped":
            unmapped += 1
            strict.append((truth, False))
        else:
            strict.append((truth, mapped == "gradient"))
            mapped_only.append((truth, mapped == "gradient"))
    scored_buckets = (buckets["agreement"] + buckets["contradiction_hard"]
                      + buckets["contradiction_soft"])
    return {
        "strict_all_labels": binary_scores(strict),
        "mapped_labels_only": binary_scores(mapped_only),
        "unmapped_label_count": unmapped,
        "p6_buckets": dict(buckets),
        "p6_scored_share": round(scored_buckets / max(1, sum(buckets.values())), 4),
        "contingency_ground_type_x_human_gradient": {
            f"{g}|{'gradient' if t else 'flat'}": n for (g, t), n in sorted(contingency.items())},
        "ground_type_distribution": dict(Counter(
            by_image[s][variant]["ground_type"] for s in images if variant in by_image.get(s, {}))),
    }


def inter_variant(by_image: dict, images: list[str], variants: list[str]) -> dict:
    """Pipeline §3's disagreement signal, and the adjudicator's future bill."""
    if len(variants) < 2:
        return {}
    a, b = variants[0], variants[1]
    both = [s for s in images if a in by_image.get(s, {}) and b in by_image.get(s, {})]
    per_question = {}
    for field in ("ground_type", "shading_geometry", "field_texture", "enclosure", "confidence"):
        same = sum(1 for s in both if by_image[s][a][field] == by_image[s][b][field])
        ca = Counter(by_image[s][a][field] for s in both)
        cb = Counter(by_image[s][b][field] for s in both)
        n = len(both)
        expected = sum(ca[k] * cb[k] for k in VOCABULARIES[field]) / (n * n) if n else 0
        observed = same / n if n else 0
        per_question[field] = {
            "n": n,
            "raw_agreement": round(observed, 4),
            "cohens_kappa": round((observed - expected) / (1 - expected), 4)
            if n and expected < 1 else None,
        }
    disagree_binary = [s for s in both
                       if GRADIENT_MAP[by_image[s][a]["ground_type"]]
                       != GRADIENT_MAP[by_image[s][b]["ground_type"]]]
    return {
        "variants": [a, b],
        "both_answered": len(both),
        "per_question": per_question,
        "binary_disagreement": {
            "n": len(disagree_binary),
            "share": round(len(disagree_binary) / len(both), 4) if both else None,
            "note": "pipeline §3 routes exactly this subset to the dense adjudicator; its size "
                    "is what the adjudicator will cost",
        },
    }


# ---------------------------------------------------------------- cross-arm

def cross_arm_agreement(per_arm: dict[str, dict], variant: str) -> dict:
    """How often two arms say the same word. Not a score — a check on whether the arms are
    actually different instruments, or one habit wearing three names."""
    arms = sorted(per_arm)
    out = {}
    for i, a in enumerate(arms):
        for b in arms[i + 1:]:
            ia, ib = per_arm[a]["by_image"], per_arm[b]["by_image"]
            shared = [s for s in ia if variant in ia[s] and s in ib and variant in ib[s]]
            if not shared:
                continue
            same = sum(1 for s in shared
                       if ia[s][variant]["ground_type"] == ib[s][variant]["ground_type"])
            same_binary = sum(1 for s in shared
                              if GRADIENT_MAP[ia[s][variant]["ground_type"]]
                              == GRADIENT_MAP[ib[s][variant]["ground_type"]])
            out[f"{a} vs {b}"] = {
                "n": len(shared),
                "identical_ground_type": round(same / len(shared), 4),
                "same_binary_mapping": round(same_binary / len(shared), 4),
            }
    return out


# ---------------------------------------------------------------- self-check

def check_against_published(report: dict) -> list[str]:
    """Assert this scorer reproduces the reviewer-facing gold-30 analysis for the incumbent."""
    problems: list[str] = []
    arm = config.ARM_QWEN3_30B_A3B
    block = report["per_arm"].get(arm, {}).get("gold30")
    if not block:
        return ["incumbent has no gold30 block; nothing to check"]
    for variant, (matched, n) in PUBLISHED_GOLD30["exact_match"].items():
        got = block.get(variant, {}).get("exact_vocabulary_match")
        if not got or (got["matched"], got["n"]) != (matched, n):
            problems.append(f"exact match {variant}: published {matched}/{n}, computed "
                            f"{got and (got['matched'], got['n'])}")
    for variant, (agreed, n) in PUBLISHED_GOLD30["binary_agreement"].items():
        got = block.get(variant, {}).get("binary_agreement_vs_reviewer")
        if not got:
            problems.append(f"binary agreement {variant}: missing")
            continue
        computed = (round(got["agreement"] * got["n"]), got["n"]) if got["n"] else (0, 0)
        if computed != (agreed, n):
            problems.append(f"binary agreement {variant}: published {agreed}/{n}, computed "
                            f"{computed[0]}/{computed[1]}")
    agreed, n = PUBLISHED_GOLD30["flag_binary_agreement"]
    got = block.get("A", {}).get("flag_baseline_vs_reviewer")
    if got and (round(got["agreement"] * got["n"]), got["n"]) != (agreed, n):
        problems.append(f"flag baseline: published {agreed}/{n}, computed "
                        f"{round(got['agreement'] * got['n'])}/{got['n']}")
    return problems


# ---------------------------------------------------------------- the table

def render_table(report: dict) -> str:
    lines: list[str] = []
    add = lines.append
    add("ORACLE VLM BAKE-OFF — scores")
    add(f"generated {report['generated_at']}  ·  repo head {report['repo_head'][:12]}")
    add("")
    add("ARMS")
    for arm, spec in report["arms"].items():
        state = spec["state"]
        add(f"  {arm:<18} {spec['hf_repo']}")
        add(f"  {'':<18} rev {spec['hf_revision'][:12]} · {spec['quantization']} · "
            f"{spec['params']} · {state}")
        if spec.get("blocked_reason"):
            add(f"  {'':<18} BLOCKED: {spec['blocked_reason']}")
    add("")

    def block_for(arm: str, item_set: str) -> dict | None:
        """gold30 answers can come from a dedicated run or from the eval142 rows."""
        block = report["per_arm"][arm]
        return block.get(item_set) or block.get(item_set + "_from_eval142")

    for item_set in report["item_sets"]:
        arms = [a for a in report["per_arm"] if block_for(a, item_set)]
        if not arms:
            continue
        add(f"=== {item_set.upper()} " + "=" * 52)
        if item_set == config.ITEMS_GOLD30:
            add("  reference: the reviewer's own ground_type answers on 30 hand-labelled")
            add("  artworks, every one of them a case where the premise oracle and the")
            add("  accepted flag contradicted each other. A hard-case probe, not the ranking.")
            add("")
            add(f"  {'arm':<18} {'var':<4} {'exact':>9} {'binary':>11} {'kappa':>7} "
                f"{'no-pred':>8}")
            for arm in arms:
                for variant, block in sorted(block_for(arm, item_set).items()):
                    ex = block["exact_vocabulary_match"]
                    bi = block["binary_agreement_vs_reviewer"]
                    dropped = block["dropped"].get("oracle_made_no_prediction", 0)
                    add(f"  {arm:<18} {variant:<4} "
                        f"{ex['matched']:>4}/{ex['n']:<4} "
                        f"{_frac(bi):>11} "
                        f"{_num(bi['cohens_kappa']):>7} {dropped:>8}")
            flag = None
            for arm in arms:
                for block in block_for(arm, item_set).values():
                    flag = flag or block["flag_baseline_vs_reviewer"]
            if flag:
                add(f"  {'(accepted flag)':<18} {'-':<4} {'-':>9} {_frac(flag):>11} "
                    f"{_num(flag['cohens_kappa']):>7}")
        else:
            add("  reference: the accepted gradient flag on every included artwork. An")
            add("  accepted algorithm decision, not an elicited label (eval-set.json")
            add("  meta.groundTruthEpistemology). P6: the buckets are the instrument.")
            add("")
            add(f"  {'arm':<18} {'var':<4} {'strict':>11} {'kappa':>7} {'mapped':>11} "
                f"{'agree':>6} {'c-hard':>7} {'c-soft':>7} {'undet':>6}")
            for arm in arms:
                for variant, block in sorted(block_for(arm, item_set).items()):
                    st = block["strict_all_labels"]
                    mp = block["mapped_labels_only"]
                    bk = block["p6_buckets"]
                    add(f"  {arm:<18} {variant:<4} {_frac(st):>11} {_num(st['cohens_kappa']):>7} "
                        f"{_frac(mp):>11} {bk.get('agreement', 0):>6} "
                        f"{bk.get('contradiction_hard', 0):>7} "
                        f"{bk.get('contradiction_soft', 0):>7} "
                        f"{bk.get('underdetermined', 0):>6}")
        add("")
        add("  inter-variant (A vs B) — the subset the dense adjudicator would be sent:")
        for arm in arms:
            iv = report["per_arm"][arm].get(f"{item_set}_inter_variant") or {}
            if not iv:
                continue
            gt = iv["per_question"]["ground_type"]
            add(f"  {arm:<18} ground_type agreement {gt['raw_agreement']:.3f} "
                f"(kappa {_num(gt['cohens_kappa'])}) · binary disagreement "
                f"{iv['binary_disagreement']['n']}/{iv['both_answered']}")
        cross = report.get("cross_arm", {}).get(item_set, {})
        if cross:
            add("")
            add("  cross-arm agreement (variant A) — are these different instruments?")
            for pair, v in cross.items():
                add(f"    {pair:<44} same word {v['identical_ground_type']:.3f} · "
                    f"same binary {v['same_binary_mapping']:.3f} (n={v['n']})")
        add("")

    if report.get("self_check"):
        add("SELF-CHECK against the published gold-30 analysis: "
            + ("PASS" if not report["self_check"]["problems"] else "FAIL"))
        for problem in report["self_check"]["problems"]:
            add(f"  {problem}")
        add("")
    add("HEALTH")
    for arm, block in report["per_arm"].items():
        for item_set in report["item_sets"]:
            h = block.get(f"{item_set}_health")
            if not h:
                continue
            add(f"  {arm:<18} {item_set:<8} rows {h['rows']:>4} ok {h['ok']:>4} "
                f"failed {h['failed']:>3} parse_failed {h['parse_failed']:>3} "
                f"retried {h['attempts_gt_1']:>3} median {h['median_generation_seconds']}s")
    return "\n".join(lines)


def _frac(scores: dict) -> str:
    if not scores or not scores.get("n"):
        return "-"
    return f"{round(scores['agreement'] * scores['n'])}/{scores['n']}"


def _num(value) -> str:
    return "-" if value is None else f"{value:+.3f}"


# ---------------------------------------------------------------- main

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--arm", action="append", default=None)
    parser.add_argument("--items", action="append", default=None, choices=list(config.ITEM_SETS))
    parser.add_argument("--out", type=Path, default=config.SCORES_JSON_PATH)
    parser.add_argument("--table-out", type=Path, default=config.SCORES_TABLE_PATH)
    parser.add_argument("--include-conflicted-truth", action="store_true",
                        help="include artworks whose accepted palettes disagreed on the gradient "
                             "boolean and were resolved by recency (default: excluded, as premise does)")
    args = parser.parse_args()

    arms = args.arm or list(config.BAKEOFF_ARMS)
    item_sets = args.items or list(config.ITEM_SETS)
    labels = gold30_reviewer_labels()

    report: dict[str, Any] = {
        "generated_at": utc_now(),
        "generated_by": "research/v3/oracle/bakeoff/score.py",
        "item_sets": item_sets,
        "arms": {},
        "per_arm": {},
        "cross_arm": {},
        "notes": [
            "gold30 is adversarial by construction: every one of its 30 artworks is a case "
            "where the premise oracle and the accepted flag contradicted each other. Its own "
            "analysis calls the outcome a lean, not a verdict. Rank on eval142.",
            "eval142's ground truth is an ACCEPTED ALGORITHM DECISION, not an elicited label "
            "(eval-set.json meta.groundTruthEpistemology).",
            "PHASE_0_DECISIONS.md §4 P6: never an exact-match test. `underdetermined` cells are "
            "counted, not scored; the bucket's SIZE is the instrument.",
            "`strict_all_labels` forces every label into the binary (unmapped -> flat). "
            "`mapped_labels_only` drops the three unmapped siblings entirely. Quote both or neither.",
            "Arms are compared on identical prompts, schema, resolution cap and decoding "
            "temperature; the row-level prompt_hash and prompt_file_sha256 prove it.",
        ],
    }
    report["repo_head"] = premise_common.GIT_HEAD

    for arm in arms:
        spec = config.arm_config(arm)
        report["arms"][arm] = {
            "hf_repo": spec["hf_repo"],
            "hf_revision": spec["hf_revision"],
            "quantization": spec["quantization"],
            "params": spec["params"],
            "architecture": spec["architecture"],
            "role": spec["role"],
            "blocked_reason": spec.get("blocked_reason"),
            "state": "results on disk" if any(
                config.results_path(arm, s).exists() for s in item_sets)
            else ("blocked" if not spec.get("available") else "no results yet"),
        }

    keep_by_item_set: dict[str, dict[str, dict]] = {}
    for item_set in item_sets:
        keep_by_item_set[item_set] = {}
        for arm in arms:
            rows, path = load_arm_rows(arm, item_set)
            if not rows:
                continue
            by_image, meta = index_answers(rows)
            variants = sorted({r["prompt_variant"] for r in rows})
            block = report["per_arm"].setdefault(arm, {})
            block[f"{item_set}_results_file"] = str(path)
            block[f"{item_set}_health"] = health_of(rows)

            images = [s for s in by_image if meta[s]["gradient_truth"] is not None]
            if not args.include_conflicted_truth:
                images = [s for s in images if not meta[s]["conflicted"]]

            if item_set == config.ITEMS_GOLD30:
                block[item_set] = {v: gold30_report(by_image, v, labels) for v in variants}
                block[f"{item_set}_vs_accepted_flag"] = {
                    v: flag_report(by_image, meta, v, images) for v in variants}
            else:
                block[item_set] = {v: flag_report(by_image, meta, v, images) for v in variants}
                block[f"{item_set}_by_tier"] = {
                    v: {tier: flag_report(by_image, meta, v,
                                          [s for s in images if meta[s]["tier"] == tier])
                        for tier in sorted({meta[s]["tier"] for s in images})}
                    for v in variants}
            block[f"{item_set}_inter_variant"] = inter_variant(by_image, images, variants)
            block[f"{item_set}_population"] = {
                "images_with_at_least_one_answer": len(by_image),
                "scored_against_flag": len(images),
                "conflicted_truth_excluded": sum(
                    1 for s in by_image if meta[s]["conflicted"]),
                "by_tier": dict(Counter(meta[s]["tier"] for s in images)),
            }
            keep_by_item_set[item_set][arm] = {"by_image": by_image, "meta": meta}

        if len(keep_by_item_set[item_set]) > 1:
            report["cross_arm"][item_set] = cross_arm_agreement(keep_by_item_set[item_set], "A")

    # The incumbent's gold-30 numbers must reproduce the reviewer-facing analysis exactly.
    incumbent = report["per_arm"].get(config.ARM_QWEN3_30B_A3B, {})
    gold_block = incumbent.get(config.ITEMS_GOLD30) or incumbent.get(
        config.ITEMS_GOLD30 + "_from_eval142")
    if gold_block:
        shim = {"per_arm": {config.ARM_QWEN3_30B_A3B: {"gold30": gold_block}}}
        problems = check_against_published(shim)
        report["self_check"] = {
            "source": str(config.GOLD30_ANALYSIS_PATH),
            "published": PUBLISHED_GOLD30,
            "problems": problems,
            "passed": not problems,
        }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent="\t") + "\n")
    table = render_table(report)
    args.table_out.write_text(table + "\n")
    print(table)
    print(f"\nwrote {args.out}\nwrote {args.table_out}")
    if report.get("self_check") and not report["self_check"]["passed"]:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
