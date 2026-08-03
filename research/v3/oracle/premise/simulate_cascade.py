"""Offline simulation of the two-stage cascade oracle, composed from data already on disk.

    .venv/bin/python simulate_cascade.py [--out <cascade-sim-1.json>]

THE DESIGN UNDER TEST
Stage 1 (bulk): Qwen3-VL-30B-A3B answers `ground_type` twice, under two independently worded
prompts — variant B (`group-a.v1`, premise run 1) and variant D (`group-a.v2`, the criterion
arm). Both answers are pushed through the coarse binary map (`analyze.GRADIENT_MAP`).
  - Both map, and to the same side  -> that is the label. No further inference.
  - Both map, to opposite sides     -> route to stage 2.
  - B lands on an unmapped value while D commits -> route to stage 2.
Stage 2 (adjudicator): Qwen3-VL-32B-dense, variant A, from the bake-off run. Its answer is the
label. If it too lands on an unmapped value the item ends UNDETERMINED — the cascade declines,
it does not guess.

NOTHING HERE IS A NEW INFERENCE. Every answer is read from a committed results file; this
script only re-composes them. The point is to find out whether the composition is worth
running for real before any GPU time is spent on it.

HOW IT IS SCORED
PHASE_0_DECISIONS.md §4 P6: never one accuracy number. Every comparison is reported in the
same two views `analyze.py` uses, and both must be quoted or neither:
  - `strict_all_labels`   — every item scored; a non-committal label counts as "flat".
  - `mapped_labels_only`  — items where the arm actually committed to a side; the rest dropped.
Plus a `common_committed_subset` view, which scores the composition and all three components
on the identical set of items where every one of them commits — the only strictly
apples-to-apples comparison, since the arms commit on different numbers of items.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from analyze import (  # noqa: E402
    GRADIENT_MAP,
    P6_BUCKETS,
    binary_scores,
    tier_of,
)
from common import DATA_DIR, REPO_ROOT, read_jsonl  # noqa: E402

# ---------------------------------------------------------------------------------------
# Inputs. Every one is an existing committed results file; this script writes only its own
# report and never touches them.
# ---------------------------------------------------------------------------------------

# [MEASURED] premise run 1, the six-way question, group-a.v1. Variant B is the bulk arm's
# first reading of ground_type.
BULK_B_RESULTS = DATA_DIR / "premise-run-1.jsonl"
BULK_B_VARIANT = "B"

# [MEASURED] the criterion arm, group-a.v2, run on the same 142 artworks with the same model
# and the same seed policy. Variant D is the bulk arm's second, independently worded reading.
BULK_D_RESULTS = DATA_DIR / "premise-run-cd.jsonl"
BULK_D_VARIANT = "D"

# [MEASURED] the bake-off's dense 32B arm. Carries both item sets (gold30 + eval142); variant A
# is the adjudicator's answer. Coverage of all 142 is asserted at load, not assumed.
ADJUDICATOR_RESULTS = REPO_ROOT / "research" / "v3" / "data" / "oracle-bakeoff" / "qwen3-32b-dense.jsonl"
ADJUDICATOR_VARIANT = "A"

# [REVIEWED] The reviewer's own ground_type call on the 30 hardest artworks — the only
# elicited human label in this workstream. `reviewerBinary` is null where the reviewer chose a
# value the binary map does not cover, and those items are dropped from binary comparisons.
GOLD30_ANALYSIS = REPO_ROOT / "research" / "v3" / "data" / "oracle-validation" / "premise-disambiguation-1-analysis.json"

DEFAULT_OUT = DATA_DIR / "cascade-sim-1.json"

# ---------------------------------------------------------------------------------------
# Cost model
# ---------------------------------------------------------------------------------------

# [MEASURED] Per-inference wall time handed down by the orchestrator as the planning figure.
# The in-file medians of exactly these rows are reported alongside every derived cost, because
# they are not the same number: variant D is a longer prompt than B and the dense arm's median
# here is above 17.5 s. Nothing in this report uses only one of the two.
BULK_SECONDS_PLANNING = 2.9
DENSE_SECONDS_PLANNING = 17.5

# [REVIEWED] The production corpus the cascade would have to run over. V3_PLAN.md's target set.
CORPUS_ARTWORKS = 6900

# ---------------------------------------------------------------------------------------
# The cascade rule
# ---------------------------------------------------------------------------------------

# [REVIEWED] Route names. `d_unmapped_b_committed` and `both_unmapped` are the two cells the
# stated rule does not name. The rule says "route when they disagree, or when B is unmapped
# while D commits"; a cascade still needs a committed side, so the mirror-image cell is routed
# too, and the cell where NEITHER bulk answer commits is left undetermined at bulk rather than
# escalated on no evidence. Both cells are EMPTY in this data (n=0 each, see `route_table`), so
# neither choice moves any number in this report.
ROUTE_BULK_AGREEMENT = "bulk_agreement"
ROUTE_ADJ_BD_DISAGREE = "adjudicated:bd_binary_disagree"
ROUTE_ADJ_B_UNMAPPED = "adjudicated:b_unmapped_d_committed"
ROUTE_ADJ_D_UNMAPPED = "adjudicated:d_unmapped_b_committed"
ROUTE_UNDETERMINED_BULK = "undetermined_at_bulk:both_unmapped"

ADJUDICATED_ROUTES = (ROUTE_ADJ_BD_DISAGREE, ROUTE_ADJ_B_UNMAPPED, ROUTE_ADJ_D_UNMAPPED)


def cascade(b_ground: str, d_ground: str, a_ground: str | None) -> dict:
    """Compose one item. Returns the route, the source that supplied the label, the composed
    binary ('gradient' / 'flat' / None), and the composed ground_type under both tiebreaks."""
    b_bin = GRADIENT_MAP[b_ground]
    d_bin = GRADIENT_MAP[d_ground]
    b_commits = b_bin in ("gradient", "flat")
    d_commits = d_bin in ("gradient", "flat")

    if b_commits and d_commits and b_bin == d_bin:
        return {
            "route": ROUTE_BULK_AGREEMENT,
            "label_source": "bulk",
            "binary": b_bin,
            # Bulk agreement is agreement on the BINARY, not necessarily on the exact
            # ground_type (flat_field and multiple_distinct_fields both read as flat). The
            # exact label therefore needs a tiebreak, and both are carried so the choice is
            # visible and reversible.
            "ground_type_b_first": b_ground,
            "ground_type_d_first": d_ground,
            "bulk_exact_agree": b_ground == d_ground,
            "adjudicator_used": False,
        }

    if b_commits and d_commits:
        route = ROUTE_ADJ_BD_DISAGREE
    elif d_commits:  # B unmapped, D committed
        route = ROUTE_ADJ_B_UNMAPPED
    elif b_commits:  # D unmapped, B committed
        route = ROUTE_ADJ_D_UNMAPPED
    else:
        return {
            "route": ROUTE_UNDETERMINED_BULK,
            "label_source": "none",
            "binary": None,
            "ground_type_b_first": None,
            "ground_type_d_first": None,
            "bulk_exact_agree": b_ground == d_ground,
            "adjudicator_used": False,
        }

    if a_ground is None:
        # No adjudicator row for this item. Asserted impossible at load; kept so a future
        # partial adjudicator file degrades to "undetermined" rather than to a crash or, worse,
        # a silent bulk guess.
        return {
            "route": route,
            "label_source": "none:adjudicator_missing",
            "binary": None,
            "ground_type_b_first": None,
            "ground_type_d_first": None,
            "bulk_exact_agree": b_ground == d_ground,
            "adjudicator_used": False,
        }

    a_bin = GRADIENT_MAP[a_ground]
    if a_bin in ("gradient", "flat"):
        return {
            "route": route,
            "label_source": "adjudicator",
            "binary": a_bin,
            "ground_type_b_first": a_ground,
            "ground_type_d_first": a_ground,
            "bulk_exact_agree": b_ground == d_ground,
            "adjudicator_used": True,
        }
    return {
        "route": route,
        "label_source": "none:adjudicator_unmapped",
        "binary": None,
        "ground_type_b_first": a_ground,
        "ground_type_d_first": a_ground,
        "bulk_exact_agree": b_ground == d_ground,
        "adjudicator_used": True,
    }


# ---------------------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------------------

def two_view_scores(items: list[tuple[bool, str | None]]) -> dict:
    """items = (human gradient boolean, arm's committed side or None).

    Mirrors `analyze.variant_report` exactly: `strict_all_labels` forces a non-committal
    answer to "flat" so every item is scored; `mapped_labels_only` drops it."""
    strict = [(truth, side == "gradient") for truth, side in items]
    mapped = [(truth, side == "gradient") for truth, side in items if side is not None]
    return {
        "strict_all_labels": binary_scores(strict),
        "mapped_labels_only": binary_scores(mapped),
        "uncommitted_count": sum(1 for _, side in items if side is None),
        "committed_share": round(len(mapped) / len(items), 4) if items else None,
    }


def p6_buckets(pairs: list[tuple[str | None, bool]]) -> dict:
    """pairs = (arm's ground_type or None, human gradient boolean). A None ground_type is an
    arm that produced no label at all — its own bucket, never folded into "underdetermined"."""
    counts: Counter = Counter()
    for ground, truth in pairs:
        if ground is None:
            counts["no_label"] += 1
        else:
            counts[P6_BUCKETS.get((ground, truth), "underdetermined")] += 1
    total = sum(counts.values())
    scored = counts["agreement"] + counts["contradiction_hard"] + counts["contradiction_soft"]
    return {
        "counts": dict(sorted(counts.items())),
        "scored_share": round(scored / total, 4) if total else None,
    }


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# ---------------------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    # ---- load the three arms ----------------------------------------------------------
    def arm_rows(path: Path, variant: str) -> dict[str, dict]:
        rows = [r for r in read_jsonl(path)
                if r.get("prompt_variant") == variant
                and not r.get("is_canary")
                and r.get("status") == "ok"
                and r.get("parsed")]
        by_sha: dict[str, dict] = {}
        for r in rows:
            assert r["image_sha256"] not in by_sha, f"{path.name}: duplicate row for {r['image_sha256']}"
            by_sha[r["image_sha256"]] = r
        return by_sha

    b_rows = arm_rows(BULK_B_RESULTS, BULK_B_VARIANT)
    d_rows = arm_rows(BULK_D_RESULTS, BULK_D_VARIANT)
    a_rows = arm_rows(ADJUDICATOR_RESULTS, ADJUDICATOR_VARIANT)

    # ---- population -------------------------------------------------------------------
    # The bulk B arm defines the item universe; both other arms must cover it.
    universe = sorted(b_rows)
    coverage = {
        "bulk_B_rows": len(b_rows),
        "bulk_D_rows": len(d_rows),
        "adjudicator_rows": len(a_rows),
        "adjudicator_covers_all_bulk_items": sorted(set(universe) - set(a_rows)) == [],
        "adjudicator_missing_shas": sorted(set(universe) - set(a_rows)),
        "bulk_D_missing_shas": sorted(set(universe) - set(d_rows)),
        "adjudicator_item_sets": dict(Counter(a_rows[s].get("item_set") for s in universe if s in a_rows)),
        "adjudicator_extra_shas": sorted(set(a_rows) - set(universe)),
    }
    assert not coverage["bulk_D_missing_shas"], "variant D does not cover the B universe"

    meta: dict[str, dict] = {}
    for sha in universe:
        r = b_rows[sha]
        meta[sha] = {
            "artwork_id": r["artwork_id"],
            "image_path": r["image_path"],
            "gradient_truth": r["gradient_truth"],
            "conflicted": bool(r.get("gradient_truth_conflicted")),
            "tier": tier_of(r["source_long_edge_px"]),
        }

    # Primary population, exactly as analyze.py defines it: a non-null accepted gradient
    # boolean, and artworks whose accepted palettes disagreed with each other excluded.
    primary = [s for s in universe if meta[s]["gradient_truth"] is not None and not meta[s]["conflicted"]]
    conflicted = [s for s in universe if meta[s]["conflicted"]]

    # ---- gold-30 ----------------------------------------------------------------------
    gold_doc = json.loads(GOLD30_ANALYSIS.read_text())
    gold: dict[str, dict] = {x["sha256"]: x for x in gold_doc["perArtwork"] if x.get("answered")}
    gold_shas = [s for s in universe if s in gold]

    # ---- compose ----------------------------------------------------------------------
    per_item: list[dict] = []
    composed: dict[str, dict] = {}
    for sha in universe:
        b_ground = b_rows[sha]["parsed"]["ground_type"]
        d_ground = d_rows[sha]["parsed"]["ground_type"]
        a_ground = a_rows[sha]["parsed"]["ground_type"] if sha in a_rows else None
        out = cascade(b_ground, d_ground, a_ground)
        composed[sha] = out
        per_item.append({
            "image_sha256": sha,
            "artwork_id": meta[sha]["artwork_id"],
            "image_path": meta[sha]["image_path"],
            "tier": meta[sha]["tier"],
            "in_primary": sha in primary,
            "conflicted_truth": meta[sha]["conflicted"],
            "in_gold30": sha in gold,
            "flag_gradient": meta[sha]["gradient_truth"],
            "reviewer_ground_type": gold[sha]["reviewerGroundType"] if sha in gold else None,
            "reviewer_binary": gold[sha]["reviewerBinary"] if sha in gold else None,
            "bulk_B_ground_type": b_ground,
            "bulk_B_binary": GRADIENT_MAP[b_ground],
            "bulk_D_ground_type": d_ground,
            "bulk_D_binary": GRADIENT_MAP[d_ground],
            "adjudicator_ground_type": a_ground,
            "adjudicator_binary": GRADIENT_MAP[a_ground] if a_ground else None,
            **out,
        })
    per_item.sort(key=lambda x: x["image_sha256"])

    # ---- 1. route populations ---------------------------------------------------------
    def route_table(shas: list[str]) -> dict:
        routes = Counter(composed[s]["route"] for s in shas)
        adjudicated = [s for s in shas if composed[s]["route"] in ADJUDICATED_ROUTES]
        undetermined = [s for s in shas if composed[s]["binary"] is None]
        n = len(shas)
        return {
            "n": n,
            "by_route": {k: routes.get(k, 0) for k in (
                ROUTE_BULK_AGREEMENT, ROUTE_ADJ_BD_DISAGREE, ROUTE_ADJ_B_UNMAPPED,
                ROUTE_ADJ_D_UNMAPPED, ROUTE_UNDETERMINED_BULK)},
            "resolved_at_bulk": routes.get(ROUTE_BULK_AGREEMENT, 0),
            "resolved_at_bulk_share": round(routes.get(ROUTE_BULK_AGREEMENT, 0) / n, 4) if n else None,
            "routed_to_adjudicator": len(adjudicated),
            "routed_share": round(len(adjudicated) / n, 4) if n else None,
            "adjudicator_committed": sum(1 for s in adjudicated if composed[s]["binary"] is not None),
            "adjudicator_unmapped_still_undetermined": sum(
                1 for s in adjudicated if composed[s]["label_source"] == "none:adjudicator_unmapped"),
            "undetermined_after_whole_cascade": len(undetermined),
            "undetermined_share": round(len(undetermined) / n, 4) if n else None,
            "bulk_agreement_also_exact": sum(
                1 for s in shas if composed[s]["route"] == ROUTE_BULK_AGREEMENT and composed[s]["bulk_exact_agree"]),
            "label_sources": dict(sorted(Counter(composed[s]["label_source"] for s in shas).items())),
            "composed_binary_distribution": dict(sorted(
                Counter(str(composed[s]["binary"]) for s in shas).items())),
        }

    routes_report = {
        "all_142": route_table(universe),
        "primary": route_table(primary),
        "conflicted_truth_excluded": route_table(conflicted),
        "gold30": route_table(gold_shas),
        "primary_by_tier": {t: route_table([s for s in primary if meta[s]["tier"] == t])
                            for t in sorted({meta[s]["tier"] for s in primary})},
        # What the two bulk answers actually looked like when they sent an item upstairs, and
        # what the dense model then said about it.
        "routed_items_answer_triples_primary": dict(sorted(Counter(
            f"B={b_rows[s]['parsed']['ground_type']}"
            f" | D={d_rows[s]['parsed']['ground_type']}"
            f" -> A={a_rows[s]['parsed']['ground_type'] if s in a_rows else 'missing'}"
            for s in primary if composed[s]["route"] in ADJUDICATED_ROUTES).items())),
    }

    # ---- arms as (truth, committed side) ----------------------------------------------
    def side_of(ground: str | None) -> str | None:
        if ground is None:
            return None
        m = GRADIENT_MAP[ground]
        return m if m in ("gradient", "flat") else None

    def arm_side(name: str, sha: str) -> str | None:
        if name == "composed":
            return composed[sha]["binary"]
        if name == "bulk_B":
            return side_of(b_rows[sha]["parsed"]["ground_type"])
        if name == "bulk_D":
            return side_of(d_rows[sha]["parsed"]["ground_type"])
        if name == "adjudicator_dense_A":
            return side_of(a_rows[sha]["parsed"]["ground_type"]) if sha in a_rows else None
        raise KeyError(name)

    def arm_ground(name: str, sha: str) -> str | None:
        if name == "composed":
            return composed[sha]["ground_type_b_first"]
        if name == "composed_d_first":
            return composed[sha]["ground_type_d_first"]
        if name == "bulk_B":
            return b_rows[sha]["parsed"]["ground_type"]
        if name == "bulk_D":
            return d_rows[sha]["parsed"]["ground_type"]
        if name == "adjudicator_dense_A":
            return a_rows[sha]["parsed"]["ground_type"] if sha in a_rows else None
        raise KeyError(name)

    ARMS = ["composed", "bulk_B", "bulk_D", "adjudicator_dense_A"]

    # ---- 2. composed vs the accepted flags --------------------------------------------
    def vs_flags(shas: list[str]) -> dict:
        out = {}
        for name in ARMS:
            items = [(meta[s]["gradient_truth"], arm_side(name, s)) for s in shas]
            out[name] = two_view_scores(items)
            out[name]["p6_buckets"] = p6_buckets([(arm_ground(name, s), meta[s]["gradient_truth"]) for s in shas])
        # The only strictly like-for-like cut: items where every arm commits.
        common = [s for s in shas if all(arm_side(n, s) is not None for n in ARMS)]
        out["common_committed_subset"] = {
            "n": len(common),
            "share_of_population": round(len(common) / len(shas), 4) if shas else None,
            "scores": {n: binary_scores([(meta[s]["gradient_truth"], arm_side(n, s) == "gradient")
                                         for s in common]) for n in ARMS},
        }
        return out

    flags_report = {
        "population_primary_n": len(primary),
        "primary": vs_flags(primary),
        "primary_by_tier": {t: vs_flags([s for s in primary if meta[s]["tier"] == t])
                            for t in sorted({meta[s]["tier"] for s in primary})},
        "conflicted_truth_subset": vs_flags(conflicted) if conflicted else {},
        "all_142_including_conflicted": vs_flags([s for s in universe if meta[s]["gradient_truth"] is not None]),
    }

    # ---- 3. composed vs the reviewer's gold-30 ----------------------------------------
    def vs_gold(shas: list[str]) -> dict:
        out: dict = {}
        for name in ARMS + ["composed_d_first"]:
            exact_n = 0
            exact_hit = 0
            for s in shas:
                g = arm_ground(name, s)
                if g is None:
                    continue
                exact_n += 1
                exact_hit += int(g == gold[s]["reviewerGroundType"])
            out[name] = {
                "exact_ground_type": {
                    "n_with_a_label": exact_n,
                    "no_label": len(shas) - exact_n,
                    "matched": exact_hit,
                    "rate": round(exact_hit / exact_n, 4) if exact_n else None,
                },
            }
            if name == "composed_d_first":
                continue
            # Binary comparison only where the REVIEWER committed to a side; six of the
            # thirty are pattern_or_texture / none_discernible, for which the reviewer made no
            # gradient prediction at all and there is nothing to agree or disagree with.
            scorable = [s for s in shas if gold[s]["reviewerBinary"] in ("gradient", "flat")]
            items = [(gold[s]["reviewerBinary"] == "gradient", arm_side(name, s)) for s in scorable]
            out[name]["binary_vs_reviewer"] = two_view_scores(items)
            out[name]["binary_vs_reviewer"]["reviewer_scorable_n"] = len(scorable)
            out[name]["binary_vs_reviewer"]["reviewer_no_prediction_n"] = len(shas) - len(scorable)
        common = [s for s in shas
                  if gold[s]["reviewerBinary"] in ("gradient", "flat")
                  and all(arm_side(n, s) is not None for n in ARMS)]
        out["common_committed_subset"] = {
            "n": len(common),
            "scores": {n: binary_scores([(gold[s]["reviewerBinary"] == "gradient", arm_side(n, s) == "gradient")
                                         for s in common]) for n in ARMS},
        }
        # The reviewer and the accepted flag are two different ground truths; how often they
        # disagree bounds what any oracle can score against both at once.
        out["reviewer_vs_flag"] = binary_scores(
            [(meta[s]["gradient_truth"], gold[s]["reviewerBinary"] == "gradient")
             for s in shas if gold[s]["reviewerBinary"] in ("gradient", "flat")])
        return out

    gold_report = {
        "population_n": len(gold_shas),
        "note_on_exact_match": "The composed EXACT ground_type is defined even on items where the "
                               "composed BINARY is undetermined: the reviewer answered from the full "
                               "six-value vocabulary, so `full_scene` or `pattern_or_texture` is a "
                               "real answer to the exact question even though it commits to neither "
                               "side of the binary. On an adjudicated item the exact label is the "
                               "dense model's; on a bulk-agreed item it is B's (`composed`) or D's "
                               "(`composed_d_first`) — both are reported because bulk agreement is "
                               "agreement on the binary, not on the exact value.",
        "reviewer_ground_type_distribution": dict(sorted(
            Counter(gold[s]["reviewerGroundType"] for s in gold_shas).items())),
        "scores": vs_gold(gold_shas),
    }

    # ---- 4. the adjudicator's marginal value ------------------------------------------
    # On the routed subset only. Three policies compete for the same seat: pay for the dense
    # model, or just take one of the two bulk answers already in hand for free.
    def marginal(shas: list[str], truth_of, label: str) -> dict:
        policies = {
            "take_adjudicator_dense_A": lambda s: arm_side("adjudicator_dense_A", s),
            "take_D_always": lambda s: arm_side("bulk_D", s),
            "take_B_always": lambda s: arm_side("bulk_B", s),
            # Two free baselines: a cascade that guesses the same way every time. If the dense
            # model cannot beat these on the routed slice, the routing is what is broken, not
            # the model.
            "always_flat": lambda s: "flat",
            "always_gradient": lambda s: "gradient",
        }
        out: dict = {"population": label, "n": len(shas)}
        for name, fn in policies.items():
            items = [(truth_of(s), fn(s)) for s in shas]
            out[name] = two_view_scores(items)
        # Head-to-head on the items where the dense model and D both commit.
        both = [s for s in shas if arm_side("adjudicator_dense_A", s) and arm_side("bulk_D", s)]
        out["dense_vs_D_head_to_head"] = {
            "n": len(both),
            "same_answer": sum(1 for s in both
                               if arm_side("adjudicator_dense_A", s) == arm_side("bulk_D", s)),
            "dense_right_D_wrong": sum(
                1 for s in both
                if (arm_side("adjudicator_dense_A", s) == "gradient") == truth_of(s)
                and (arm_side("bulk_D", s) == "gradient") != truth_of(s)),
            "D_right_dense_wrong": sum(
                1 for s in both
                if (arm_side("bulk_D", s) == "gradient") == truth_of(s)
                and (arm_side("adjudicator_dense_A", s) == "gradient") != truth_of(s)),
            "both_right": sum(1 for s in both
                              if (arm_side("adjudicator_dense_A", s) == "gradient") == truth_of(s)
                              and (arm_side("bulk_D", s) == "gradient") == truth_of(s)),
            "both_wrong": sum(1 for s in both
                              if (arm_side("adjudicator_dense_A", s) == "gradient") != truth_of(s)
                              and (arm_side("bulk_D", s) == "gradient") != truth_of(s)),
        }
        return out

    routed_primary = [s for s in primary if composed[s]["route"] in ADJUDICATED_ROUTES]
    routed_gold = [s for s in gold_shas if composed[s]["route"] in ADJUDICATED_ROUTES]
    routed_gold_scorable = [s for s in routed_gold if gold[s]["reviewerBinary"] in ("gradient", "flat")]

    adjudicator_report = {
        "vs_flags_routed_primary": marginal(
            routed_primary, lambda s: meta[s]["gradient_truth"], "routed subset, primary population"),
        "vs_flags_routed_primary_by_cause": {
            cause: marginal([s for s in routed_primary if composed[s]["route"] == cause],
                            lambda s: meta[s]["gradient_truth"], f"routed subset, {cause}")
            for cause in ADJUDICATED_ROUTES
            if any(composed[s]["route"] == cause for s in routed_primary)
        },
        "vs_reviewer_routed_gold30": marginal(
            routed_gold_scorable,
            lambda s: gold[s]["reviewerBinary"] == "gradient",
            "routed subset, gold-30 with a reviewer binary"),
        "bulk_agreement_slice_for_contrast": {
            "note": "The easy slice the adjudicator never sees. If it scores far above the routed "
                    "slice, the router is finding the hard items, which is what a router is for.",
            "vs_flags": two_view_scores([
                (meta[s]["gradient_truth"], composed[s]["binary"])
                for s in primary if composed[s]["route"] == ROUTE_BULK_AGREEMENT]),
        },
    }

    # ---- 4b. alternative routings ------------------------------------------------------
    # Read straight off the per-cause table: the adjudicator behaves completely differently on
    # the two route causes, so "is it worth it" has two answers, and the obvious repairs are
    # worth costing before anyone runs the design as stated.
    def policy_label(sha: str, policy: str) -> tuple[str | None, bool]:
        """Returns (committed side or None, whether the dense model was consulted)."""
        route = composed[sha]["route"]
        if route == ROUTE_BULK_AGREEMENT:
            return composed[sha]["binary"], False
        if policy == "as_designed":
            return composed[sha]["binary"], route in ADJUDICATED_ROUTES
        if policy == "adjudicate_disagree_only__D_on_b_unmapped":
            if route == ROUTE_ADJ_BD_DISAGREE:
                return composed[sha]["binary"], True
            return arm_side("bulk_D", sha), False
        if policy == "adjudicate_disagree_only__decline_on_b_unmapped":
            if route == ROUTE_ADJ_BD_DISAGREE:
                return composed[sha]["binary"], True
            return None, False
        if policy == "no_adjudicator__D_breaks_ties":
            return arm_side("bulk_D", sha), False
        if policy == "no_adjudicator__decline_on_conflict":
            return None, False
        raise KeyError(policy)

    POLICIES = [
        "as_designed",
        "adjudicate_disagree_only__D_on_b_unmapped",
        "adjudicate_disagree_only__decline_on_b_unmapped",
        "no_adjudicator__D_breaks_ties",
        "no_adjudicator__decline_on_conflict",
    ]

    def policy_report(shas: list[str], truth_of) -> dict:
        out = {}
        for p in POLICIES:
            sides = [policy_label(s, p) for s in shas]
            dense_calls = sum(1 for _, used in sides if used)
            block = two_view_scores([(truth_of(s), side) for s, (side, _) in zip(shas, sides)])
            block["dense_calls"] = dense_calls
            block["dense_call_rate"] = round(dense_calls / len(shas), 4) if shas else None
            block["seconds_per_item_planning"] = round(
                2 * BULK_SECONDS_PLANNING + (dense_calls / len(shas)) * DENSE_SECONDS_PLANNING, 3
            ) if shas else None
            block["corpus_hours_planning"] = round(
                block["seconds_per_item_planning"] * CORPUS_ARTWORKS / 3600, 2) if shas else None
            out[p] = block
        return out

    alternative_routings = {
        "note": "All five keep the same stage-1 pair (B and D) and differ only in what happens "
                "to a routed item. `dense_calls` is what the expensive model would actually be "
                "asked, so the cost column is directly comparable.",
        "vs_flags_primary": policy_report(primary, lambda s: meta[s]["gradient_truth"]),
        "vs_reviewer_gold30": policy_report(
            [s for s in gold_shas if gold[s]["reviewerBinary"] in ("gradient", "flat")],
            lambda s: gold[s]["reviewerBinary"] == "gradient"),
    }
    adjudicator_report["alternative_routings"] = alternative_routings

    # ---- 5. cost model ----------------------------------------------------------------
    def median(xs: list[float]) -> float:
        xs = sorted(xs)
        n = len(xs)
        return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2

    measured = {
        "bulk_B_median_s": round(median([b_rows[s]["generation_seconds"] for s in universe]), 3),
        "bulk_D_median_s": round(median([d_rows[s]["generation_seconds"] for s in universe]), 3),
        "adjudicator_median_s": round(median([a_rows[s]["generation_seconds"] for s in universe if s in a_rows]), 3),
        "bulk_B_mean_s": round(sum(b_rows[s]["generation_seconds"] for s in universe) / len(universe), 3),
        "bulk_D_mean_s": round(sum(d_rows[s]["generation_seconds"] for s in universe) / len(universe), 3),
        "adjudicator_mean_s": round(
            sum(a_rows[s]["generation_seconds"] for s in universe if s in a_rows) / len(a_rows), 3),
    }

    route_rate = routes_report["all_142"]["routed_share"]

    def cost_block(bulk_b_s: float, bulk_d_s: float, dense_s: float, label: str) -> dict:
        composed_per_item = bulk_b_s + bulk_d_s + route_rate * dense_s
        options = {
            "composed_cascade_B+D+routed_dense": composed_per_item,
            "bulk_B_alone": bulk_b_s,
            "bulk_D_alone": bulk_d_s,
            "bulk_B+D_no_adjudicator": bulk_b_s + bulk_d_s,
            "dense_A_alone_every_item": dense_s,
            "dense_on_every_item_plus_bulk_pair": bulk_b_s + bulk_d_s + dense_s,
        }
        return {
            "assumption": label,
            "seconds_per_inference": {"bulk_B": bulk_b_s, "bulk_D": bulk_d_s, "dense": dense_s},
            "route_rate_used": route_rate,
            "per_item_seconds": {k: round(v, 3) for k, v in options.items()},
            "corpus_hours": {k: round(v * CORPUS_ARTWORKS / 3600, 2) for k, v in options.items()},
            "cascade_vs_dense_everywhere_speedup": round(
                options["dense_A_alone_every_item"] / composed_per_item, 2),
            "cascade_premium_over_bulk_pair": round(
                composed_per_item / options["bulk_B+D_no_adjudicator"], 3),
            "cascade_premium_over_single_bulk": round(composed_per_item / bulk_b_s, 3),
        }

    cost_report = {
        "corpus_artworks": CORPUS_ARTWORKS,
        "measured_in_file": measured,
        "planning_figures": cost_block(
            BULK_SECONDS_PLANNING, BULK_SECONDS_PLANNING, DENSE_SECONDS_PLANNING,
            "orchestrator's planning constants: 2.9 s bulk (both variants), 17.5 s dense"),
        "in_file_medians": cost_block(
            measured["bulk_B_median_s"], measured["bulk_D_median_s"], measured["adjudicator_median_s"],
            "medians of exactly the rows composed here; variant D is a longer prompt than B "
            "and the dense median exceeds the 17.5 s planning figure"),
        "caveat": "Wall time is per-inference generation time on one machine with one model "
                  "resident. It excludes model load, image decode, and — the item this model "
                  "does not capture — the fact that a cascade keeps TWO models on disk and "
                  "swaps between them unless both fit in memory at once.",
    }

    # ---- 6. caveats -------------------------------------------------------------------
    b_and_a_same_family = b_rows[universe[0]]["model_id"].split("/")[-1].split("-")[:2] == \
        a_rows[universe[0]]["model_id"].split("/")[-1].split("-")[:2]
    bulk_dense_agreement_on_routed = round(
        sum(1 for s in routed_primary
            if arm_side("bulk_B", s) is not None
            and arm_side("adjudicator_dense_A", s) == arm_side("bulk_B", s))
        / max(1, sum(1 for s in routed_primary if arm_side("bulk_B", s) is not None)), 4)

    # The sharpest available measurement of bulk/adjudicator correlation: how much more often
    # the dense model declines to commit when the bulk B arm has already declined.
    b_unmapped = [s for s in primary if arm_side("bulk_B", s) is None]
    b_mapped = [s for s in primary if arm_side("bulk_B", s) is not None]
    correlation = {
        "P_dense_uncommitted": round(
            sum(1 for s in primary if arm_side("adjudicator_dense_A", s) is None) / len(primary), 4),
        "P_dense_uncommitted_given_B_uncommitted": round(
            sum(1 for s in b_unmapped if arm_side("adjudicator_dense_A", s) is None)
            / max(1, len(b_unmapped)), 4),
        "P_dense_uncommitted_given_B_committed": round(
            sum(1 for s in b_mapped if arm_side("adjudicator_dense_A", s) is None)
            / max(1, len(b_mapped)), 4),
        "n_B_uncommitted": len(b_unmapped),
        "n_B_committed": len(b_mapped),
        "identical_ground_type_rate_B_vs_dense_A": round(
            sum(1 for s in primary if arm_ground("bulk_B", s) == arm_ground("adjudicator_dense_A", s))
            / len(primary), 4),
    }

    caveats = [
        {
            "id": "same_model_family",
            "what": "The bulk arm and the adjudicator are the same family: "
                    f"{b_rows[universe[0]]['model_id']} and {a_rows[universe[0]]['model_id']}. "
                    f"Same-family: {b_and_a_same_family}.",
            "why_it_matters": "An adjudicator that shares the bulk model's training data and "
                              "visual priors is correlated with the thing it is adjudicating. It "
                              "will tend to make the SAME mistakes on the same images, which is "
                              "exactly the population routed to it. A truly independent "
                              "adjudicator (different family, or a human) would be a stronger "
                              "test of the design and could give a different verdict.",
            "measured_here": {
                "dense_A_agrees_with_bulk_B_on_routed_items": bulk_dense_agreement_on_routed,
                "abstention_correlation": correlation,
                "reading": "This is not a soft worry, it is the dominant finding. The dense "
                           "adjudicator declines to commit on about half the primary population "
                           "in general, but on the items where bulk B already declined it "
                           "declines almost always — it inherits B's 'this is a depicted scene' "
                           "prior rather than resolving it. That is precisely the 'B unmapped, D "
                           "commits' route, which is the majority of routed traffic, and it is "
                           "where the adjudicator contributes nothing.",
            },
        },
        {
            "id": "gold30_is_a_hard_slice",
            "what": "The gold-30 is not a random sample. It is the disambiguation set — items "
                    "picked because the oracle and the accepted flag contradicted each other.",
            "why_it_matters": "Absolute rates on it read low for every arm and are NOT comparable "
                              "to the 137-item primary numbers. Its legitimate use is relative: "
                              "which arm does better on the items that were already known to be "
                              "hard. n=30, and only 24 carry a reviewer binary at all.",
        },
        {
            "id": "ground_truth_is_an_accepted_decision",
            "what": "The 137-item 'flags' truth is a v2-3 palette a human accepted, not an "
                    "elicited label of the artwork (eval-set.json meta.groundTruthEpistemology).",
            "why_it_matters": "A low agreement number is not automatically oracle failure — P6 "
                              "exists because several palettes can be valid for one artwork. The "
                              "gold-30 exists precisely because this truth is soft.",
        },
        {
            "id": "no_new_inference",
            "what": "Every answer is replayed from a committed results file. The cascade was "
                    "never actually executed as a pipeline.",
            "why_it_matters": "This simulation assumes the three runs are exchangeable with three "
                              "stages of one run. They were run at different times under different "
                              "prompt-set loads; all three are temperature 0.0 with constrained "
                              "decoding, so replay is a fair reconstruction, but it is still a "
                              "reconstruction.",
        },
        {
            "id": "D_never_lands_unmapped",
            "what": "Variant D's vocabulary is the same six values as B's, but on these 142 "
                    "artworks D emitted only flat_field / shaded_field / multiple_distinct_fields "
                    "— never full_scene, pattern_or_texture, or none_discernible.",
            "why_it_matters": "D always commits here, so the 'B unmapped, D commits' route is "
                              "driven entirely by B, and the two unnamed cells of the rule "
                              "(D unmapped, and both unmapped) are empty and untested. A "
                              "different corpus could exercise them. It also means D's high "
                              "commit rate may be a prompt artefact — a prompt that never says "
                              "'I cannot tell' is not the same as one that never needs to.",
        },
        {
            "id": "strict_view_rewards_never_abstaining",
            "what": "In `strict_all_labels` a non-committal answer is scored as 'flat'. Variant D "
                    "never abstains on this corpus, so it is the only arm that pays nothing for "
                    "that rule, and it is the arm that wins the strict view.",
            "why_it_matters": "The composition beats every component on the committed views and on "
                              "the common-committed subset, but it does NOT beat D on strict "
                              "kappa. Whether that is a real loss depends on what an undetermined "
                              "item costs downstream — a labeller that says 'I don't know' on a "
                              "third of the corpus is a different product from one that always "
                              "answers, and no number in this report decides which is wanted.",
        },
        {
            "id": "route_rate_measured_on_142",
            "what": f"The route rate driving the cost model ({route_rate}) is measured on these "
                    "142 artworks, which are the eval set, not the 6,900-artwork corpus.",
            "why_it_matters": "The eval set was built from artworks with an accepted palette and "
                              "is not a uniform sample of the corpus. A corpus with more scenes "
                              "and photographs would push B toward unmapped values and raise the "
                              "route rate, and with it the cost.",
        },
        {
            "id": "single_run_no_variance",
            "what": "One decode per (image, variant). Temperature 0.0, but no repeat-decode "
                    "variance estimate, and no confidence interval anywhere in this report.",
            "why_it_matters": "Differences of a few items between arms on n=137 are inside the "
                              "noise a resampling estimate would show. Read the direction, not "
                              "the third decimal.",
        },
    ]

    # ---- report -----------------------------------------------------------------------
    report = {
        "what_this_is": "Offline simulation of the two-stage cascade oracle, composed from "
                        "committed results files. No inference was run.",
        "cascade_rule": {
            "stage_1_bulk": f"{b_rows[universe[0]]['model_id']} — ground_type under prompt "
                            f"variants {BULK_B_VARIANT} ({b_rows[universe[0]]['schema_version']}) "
                            f"and {BULK_D_VARIANT} ({d_rows[universe[0]]['schema_version']}), "
                            "both pushed through the coarse binary map",
            "stage_2_adjudicator": f"{a_rows[universe[0]]['model_id']} — ground_type under prompt "
                                   f"variant {ADJUDICATOR_VARIANT}, consulted only on routed items",
            "routes": {
                ROUTE_BULK_AGREEMENT: "B and D both commit, to the same side -> that is the label",
                ROUTE_ADJ_BD_DISAGREE: "B and D both commit, to opposite sides -> adjudicate",
                ROUTE_ADJ_B_UNMAPPED: "B lands on an unmapped value, D commits -> adjudicate",
                ROUTE_ADJ_D_UNMAPPED: "mirror image; not named by the stated rule; empty here",
                ROUTE_UNDETERMINED_BULK: "neither bulk answer commits -> the cascade declines "
                                         "rather than escalate on no evidence; empty here",
            },
            "gradient_map": GRADIENT_MAP,
        },
        "inputs": {
            "bulk_B": {"path": str(BULK_B_RESULTS.relative_to(REPO_ROOT)), "variant": BULK_B_VARIANT,
                       "sha256": sha256_of(BULK_B_RESULTS)},
            "bulk_D": {"path": str(BULK_D_RESULTS.relative_to(REPO_ROOT)), "variant": BULK_D_VARIANT,
                       "sha256": sha256_of(BULK_D_RESULTS)},
            "adjudicator": {"path": str(ADJUDICATOR_RESULTS.relative_to(REPO_ROOT)),
                            "variant": ADJUDICATOR_VARIANT, "sha256": sha256_of(ADJUDICATOR_RESULTS)},
            "gold30": {"path": str(GOLD30_ANALYSIS.relative_to(REPO_ROOT)),
                       "sha256": sha256_of(GOLD30_ANALYSIS)},
            "eval_set": {"path": "research/v3/data/oracle-premise/eval-set.json",
                         "note": "the accepted-flag truth is carried on every results row as "
                                 "`gradient_truth` / `gradient_truth_conflicted`; this file is "
                                 "where those came from and is not re-read here"},
            "determinism": "No timestamp is written. Re-running against the same four input "
                           "hashes reproduces this file byte for byte.",
        },
        "coverage": coverage,
        "population": {
            "images_total": len(universe),
            "primary": len(primary),
            "conflicted_truth_excluded": len(conflicted),
            "gold30_present": len(gold_shas),
            "gold30_in_primary": sum(1 for s in gold_shas if s in primary),
            "by_tier": dict(sorted(Counter(meta[s]["tier"] for s in primary).items())),
            "flag_gradient_rate_primary": round(
                sum(1 for s in primary if meta[s]["gradient_truth"]) / len(primary), 4),
        },
        "section_1_routes": routes_report,
        "section_2_vs_accepted_flags": flags_report,
        "section_3_vs_gold30": gold_report,
        "section_4_adjudicator_marginal_value": adjudicator_report,
        "section_5_cost": cost_report,
        "section_6_caveats": caveats,
        "per_item": per_item,
    }

    args.out.write_text(json.dumps(report, indent="\t", sort_keys=False) + "\n")

    headline = {
        "routes_primary": routes_report["primary"]["by_route"],
        "routed_share_all_142": route_rate,
        "vs_flags_mapped_only": {
            n: flags_report["primary"][n]["mapped_labels_only"]["agreement"] for n in ARMS},
        "vs_flags_kappa_mapped_only": {
            n: flags_report["primary"][n]["mapped_labels_only"]["cohens_kappa"] for n in ARMS},
        "vs_flags_strict": {n: flags_report["primary"][n]["strict_all_labels"]["agreement"] for n in ARMS},
        "common_subset": flags_report["primary"]["common_committed_subset"]["n"],
        "gold30_exact": {n: gold_report["scores"][n]["exact_ground_type"]["rate"] for n in ARMS},
        "adjudicator_on_routed": {
            k: adjudicator_report["vs_flags_routed_primary"][k]["mapped_labels_only"]["agreement"]
            for k in ("take_adjudicator_dense_A", "take_D_always", "take_B_always",
                      "always_flat", "always_gradient")},
        "corpus_hours_planning": cost_report["planning_figures"]["corpus_hours"],
        "adjudicator_by_cause_mapped_only": {
            cause: {
                "n_routed": blk["n"],
                "dense_committed": blk["take_adjudicator_dense_A"]["mapped_labels_only"]["n"],
                "dense_agreement": blk["take_adjudicator_dense_A"]["mapped_labels_only"]["agreement"],
                "take_D_agreement": blk["take_D_always"]["mapped_labels_only"]["agreement"],
            }
            for cause, blk in adjudicator_report["vs_flags_routed_primary_by_cause"].items()
        },
        "alternative_routings_primary": {
            p: {
                "committed_share": blk["committed_share"],
                "mapped_agreement": blk["mapped_labels_only"]["agreement"],
                "mapped_kappa": blk["mapped_labels_only"]["cohens_kappa"],
                "strict_kappa": blk["strict_all_labels"]["cohens_kappa"],
                "dense_call_rate": blk["dense_call_rate"],
                "corpus_hours": blk["corpus_hours_planning"],
            }
            for p, blk in alternative_routings["vs_flags_primary"].items()
        },
        "abstention_correlation": correlation,
    }
    print(json.dumps(headline, indent="\t"))
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
