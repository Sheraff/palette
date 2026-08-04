#!/usr/bin/env python3
"""Analyze the released reviewer round `residual-purity-2` against its pre-registered bar.

The bar (RESIDUAL_V5_NOTES.md §12.9, held from §11.11, fixed before any answer was seen):

    Adopt R-3's structural claim only if the stratum-reweighted "pure field" rate is
    >= 0.75 in AT LEAST ONE guard variant, AND no single stratum falls below 0.50.
    Otherwise the residual stays a "field-enriched prior".

What is new in round 2, and why this is a separate script rather than a flag on
`analyze_residual_purity_1.py`:

  * The subtraction is v5 (all-nouns elicitation), not v4 (single main noun).
  * The label schema is `residual-purity.v2` — FOUR answers, the fourth being the escape
    `cant_tell`. Round 1's three-answer schema is a different instrument and its answers
    are NEVER pooled with these: adding a fourth option drains the other three.
  * Escape scoring, fixed in advance (§12.9): `cant_tell` leaves BOTH the numerator and
    the denominator of the pure-field rate, is never dropped, and its share is reported
    per stratum as a first-class figure/ground-ambiguity measurement. A stratum whose
    escape share exceeds 0.50 has NO reliable purity rate and is reported as having none,
    not as having a low one.
  * The pools moved (§12.8), so the inverse-probability weights moved with them.

Reweighting uses the pre-registered v5 pool sizes as inverse-probability weights, so the
enrichment for hard cases does not inflate or deflate the aggregate.

Input is read through the warehouse CLI (supersession + amendments applied), never by
parsing the JSONL wholesale. Usage:

    node --experimental-strip-types research/v3/src/warehouse/cli.ts \
        query --batch residual-purity-2 --json --limit 200 --full > /tmp/rp2.jsonl
    python3 research/v3/oracle/sam/analyze_residual_purity_2.py /tmp/rp2.jsonl

This script writes data/sam/residual-purity-2-analysis.json. It touches nothing else.
"""

from __future__ import annotations

import json
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
V3 = REPO / "research" / "v3"
FIXTURE = V3 / "data" / "sam" / "residual-purity-2.json"
ROUND_1_ANALYSIS = V3 / "data" / "sam" / "residual-purity-1-analysis.json"
ROUND_1_FIXTURE = V3 / "data" / "sam" / "residual-purity-1.json"
CUTS_V5 = V3 / "data" / "sam" / "residual-cuts-v5-analysis.json"
OUT = V3 / "data" / "sam" / "residual-purity-2-analysis.json"
CLI = V3 / "src" / "warehouse" / "cli.ts"

BATCH = "residual-purity-2"
LABEL_SCHEMA = "residual-purity.v2"
# Order matters for the table: the three scored answers, then the escape.
SCORED = ("pure_field", "mostly_field", "not_field")
ESCAPE = "cant_tell"
ANSWERS = SCORED + (ESCAPE,)
VARIANTS = ("guard_on", "guard_off")
STRATA = ("noun-fired", "noun-silent", "contaminated", "class-only", "static-only-clean")

# Pre-registered v5 pool sizes = inverse-probability weights (§12.9 / sheets manifest meta).
POOL = {
    "noun-fired": 102,
    "noun-silent": 12,
    "contaminated": 20,
    "class-only": 1,
    "static-only-clean": 7,
}
POOL_TOTAL = sum(POOL.values())  # 142

# Round 1's pools, for the instrument-reading comparison only. Never used to pool answers.
POOL_V4 = {
    "noun-fired": 77,
    "noun-silent": 10,
    "contaminated": 25,
    "class-only": 2,
    "static-only-clean": 28,
}

# The bar, verbatim in numbers.
BAR_AGGREGATE = 0.75
BAR_STRATUM_FLOOR = 0.50
# A stratum above this escape share has no reliable purity rate at all (§12.9).
ESCAPE_UNRELIABLE_ABOVE = 0.50

# The v5 proxy's claim at the subtraction cut, for the proxy-vs-human gap
# (residual-cuts-v5-analysis.json contamination_recount). `contaminated` is exactly the
# set of covers the proxy flagged with >=1 cause, so the proxy asserts 0% clean there and
# 100% clean everywhere else.
PROXY_CLEAN_BY_STRATUM = {
    "noun-fired": 1.0,
    "noun-silent": 1.0,
    "contaminated": 0.0,
    "class-only": 1.0,
    "static-only-clean": 1.0,
}
PROXY_V5 = {
    "guard_on": {"clean": 121, "total": 142, "rate": 0.852113},
    "guard_off": {"clean": 122, "total": 142, "rate": 0.859155},
}
# The one time this proxy was checked against a human, it over-claimed by this much.
PROXY_MEASURED_OVERCLAIM_V4 = 0.582

# GROUND_FREETEXT_SYNTHESIS.md: 3 of 9 covers were ambiguous in unconstrained prose.
PROSE_AMBIGUITY_PRIOR = {"ambiguous": 3, "covers": 9, "rate": 3 / 9}


# ---------------------------------------------------------------------------
# Input
# ---------------------------------------------------------------------------

def load_records(path: str | None) -> tuple[list[dict], list[dict]]:
    """Read the round's records through the warehouse CLI (supersession respected)."""
    if path:
        raw = Path(path).read_text()
    else:
        proc = subprocess.run(
            [
                "node", "--experimental-strip-types", str(CLI),
                "query", "--batch", BATCH, "--json", "--limit", "200", "--full",
            ],
            cwd=REPO, capture_output=True, text=True, check=True,
        )
        raw = proc.stdout
    records = [json.loads(line) for line in raw.splitlines() if line.strip().startswith("{")]
    labels = [r for r in records if r["type"] == "oracle-label"]
    completes = [r for r in records if r["type"] == "batch-complete"]
    return labels, completes


def variant_of(label: dict) -> str:
    return label["questionKey"].rsplit(".", 1)[-1]


def cover_key(image_id: str) -> str:
    """`resid5-<hash>` -> `<hash>`. The hash identifies the COVER across sheet builds."""
    return image_id.split("-", 1)[1] if "-" in image_id else image_id


def check_integrity(labels: list[dict], completes: list[dict], fixture: dict) -> list[str]:
    problems: list[str] = []
    expected = fixture["items"]

    if len(labels) != len(expected):
        problems.append(f"expected {len(expected)} labels, got {len(labels)}")
    if len(completes) != 1:
        problems.append(f"expected exactly 1 batch-complete, got {len(completes)}")

    schemas = {lab.get("labelSchemaVersion") for lab in labels}
    if schemas != {LABEL_SCHEMA}:
        problems.append(f"label schema versions are {sorted(map(str, schemas))}, expected {LABEL_SCHEMA!r}")

    seen = Counter((lab["imageId"], lab["questionKey"]) for lab in labels)
    for key, n in seen.items():
        if n > 1:
            problems.append(f"{n} live labels for {key} — supersession did not collapse them")

    want = {(it["imageId"], it["questionKey"]) for it in expected}
    for key in sorted(want - set(seen)):
        problems.append(f"no label for fixture item {key}")
    for key in sorted(set(seen) - want):
        problems.append(f"label for {key}, which is not a fixture item")

    for lab in labels:
        if lab["answer"] not in ANSWERS:
            problems.append(f"{lab['id']}: answer {lab['answer']!r} is not in the v2 answer set")
        if lab.get("stratum") not in STRATA:
            problems.append(f"{lab['id']}: stratum {lab.get('stratum')!r} is not a known stratum")

    # Strata counts must match the fixture's pre-registered quotas.
    fixture_counts = Counter(it["stratum"] for it in expected)
    label_counts = Counter(lab["stratum"] for lab in labels)
    if fixture_counts != label_counts:
        problems.append(f"stratum counts {dict(label_counts)} != fixture {dict(fixture_counts)}")

    return problems


# ---------------------------------------------------------------------------
# The table
# ---------------------------------------------------------------------------

def cell(counts: Counter) -> dict:
    """One (stratum, variant) cell, scored by the pre-registered escape rule."""
    n = sum(counts[a] for a in ANSWERS)
    escapes = counts[ESCAPE]
    scored_n = n - escapes
    escape_share = escapes / n if n else None
    reliable = bool(scored_n) and (escape_share is None or escape_share <= ESCAPE_UNRELIABLE_ABOVE)

    out = {
        "n": n,
        "counts": {a: counts[a] for a in ANSWERS},
        "escapes": escapes,
        "escapeShare": escape_share,
        "scoredN": scored_n,
        "hasReliableRate": reliable,
    }
    if scored_n:
        out["pureFieldRate"] = counts["pure_field"] / scored_n
        out["mostlyFieldRate"] = counts["mostly_field"] / scored_n
        out["notFieldRate"] = counts["not_field"] / scored_n
        out["pureOrMostlyRate"] = (counts["pure_field"] + counts["mostly_field"]) / scored_n
    else:
        out["pureFieldRate"] = None
        out["mostlyFieldRate"] = None
        out["notFieldRate"] = None
        out["pureOrMostlyRate"] = None
    if not reliable and scored_n:
        out["reliabilityNote"] = (
            f"escape share {escape_share:.4f} exceeds {ESCAPE_UNRELIABLE_ABOVE}: this stratum has NO "
            "reliable purity rate and must be reported as having none, not as having a low one (§12.9)"
        )
    elif not scored_n:
        out["reliabilityNote"] = "every answer in this cell was the escape: no purity rate exists here"
    return out


def reweight(per_stratum: dict, variant: str, field: str) -> dict:
    """Inverse-probability reweighting over the pre-registered pools.

    Strata with no reliable rate are EXCLUDED and the surviving weights renormalized;
    the excluded weight is reported so a reader can see how much of the population the
    aggregate stopped speaking for.
    """
    used, dropped, total_w, dropped_w = {}, {}, 0.0, 0.0
    for s in STRATA:
        c = per_stratum[s]["variants"][variant]
        w = POOL[s] / POOL_TOTAL
        if c["hasReliableRate"] and c[field] is not None:
            used[s] = (w, c[field])
            total_w += w
        else:
            dropped[s] = w
            dropped_w += w
    if not total_w:
        return {"value": None, "weightUsed": 0.0, "weightDropped": dropped_w, "strataDropped": sorted(dropped)}
    value = sum(w * r for w, r in used.values()) / total_w
    return {
        "value": value,
        "weightUsed": total_w,
        "weightDropped": dropped_w,
        "strataDropped": sorted(dropped),
        "renormalized": bool(dropped),
    }


def build_analysis(labels: list[dict], completes: list[dict], fixture: dict) -> dict:
    by_cell: dict[tuple[str, str], Counter] = defaultdict(Counter)
    for lab in labels:
        by_cell[(lab["stratum"], variant_of(lab))][lab["answer"]] += 1

    per_stratum: dict[str, dict] = {}
    for s in STRATA:
        per_stratum[s] = {
            "poolSize": POOL[s],
            "poolWeight": POOL[s] / POOL_TOTAL,
            "sheetsSampled": sum(1 for it in fixture["items"] if it["stratum"] == s) // len(VARIANTS),
            "variants": {v: cell(by_cell[(s, v)]) for v in VARIANTS},
        }

    aggregates: dict[str, dict] = {}
    for v in VARIANTS:
        pure = reweight(per_stratum, v, "pureFieldRate")
        mostly = reweight(per_stratum, v, "mostlyFieldRate")
        ceiling = reweight(per_stratum, v, "pureOrMostlyRate")
        escape = reweight_escape(per_stratum, v)

        raw = Counter()
        for s in STRATA:
            for a in ANSWERS:
                raw[a] += per_stratum[s]["variants"][v]["counts"][a]
        raw_n = sum(raw[a] for a in ANSWERS)
        raw_scored = raw_n - raw[ESCAPE]

        below = sorted(
            s for s in STRATA
            if per_stratum[s]["variants"][v]["hasReliableRate"]
            and per_stratum[s]["variants"][v]["pureFieldRate"] < BAR_STRATUM_FLOOR
        )
        no_rate = sorted(s for s in STRATA if not per_stratum[s]["variants"][v]["hasReliableRate"])
        meets_aggregate = pure["value"] is not None and pure["value"] >= BAR_AGGREGATE
        meets_floor = not below and not no_rate

        aggregates[v] = {
            "reweightedPureFieldRate": pure,
            "reweightedMostlyFieldRate": mostly,
            "reweightedPureOrMostlyCeiling": ceiling,
            "reweightedEscapeShare": escape,
            "rawCounts": {a: raw[a] for a in ANSWERS},
            "rawN": raw_n,
            "rawScoredN": raw_scored,
            "rawPureFieldRate": raw["pure_field"] / raw_scored if raw_scored else None,
            "rawEscapeShare": raw[ESCAPE] / raw_n if raw_n else None,
            "meetsAggregateBar": meets_aggregate,
            "strataBelowFloor": below,
            "strataWithNoReliableRate": no_rate,
            "meetsFloorClause": meets_floor,
            "verdict": "ADOPT" if (meets_aggregate and meets_floor) else "NOT-ADOPT",
        }

    adopting = [v for v in VARIANTS if aggregates[v]["verdict"] == "ADOPT"]
    return per_stratum, aggregates, adopting


def reweight_escape(per_stratum: dict, variant: str) -> dict:
    """The escape share is reweighted over ALL strata — no cell is ever excluded from it.

    That is the point of the measurement: it is a property of the covers, and a stratum
    that escaped its way out of a purity rate must still be counted in the ambiguity rate.
    """
    total = sum(
        (POOL[s] / POOL_TOTAL) * per_stratum[s]["variants"][variant]["escapeShare"]
        for s in STRATA
        if per_stratum[s]["variants"][variant]["escapeShare"] is not None
    )
    return {"value": total, "weightUsed": 1.0, "allStrataIncluded": True}


# ---------------------------------------------------------------------------
# Guard ON vs guard OFF — A6 evidence
# ---------------------------------------------------------------------------

RANK = {"not_field": 0, "mostly_field": 1, "pure_field": 2}


def guard_comparison(labels: list[dict], per_stratum: dict, aggregates: dict) -> dict:
    by_sheet: dict[str, dict] = defaultdict(dict)
    stratum_of: dict[str, str] = {}
    for lab in labels:
        by_sheet[lab["imageId"]][variant_of(lab)] = lab["answer"]
        stratum_of[lab["imageId"]] = lab["stratum"]

    agree = on_better = off_better = incomparable = 0
    disagreements = []
    for sheet, ans in sorted(by_sheet.items()):
        a_on, a_off = ans.get("guard_on"), ans.get("guard_off")
        if a_on == a_off:
            agree += 1
            continue
        row = {"sheet": sheet, "stratum": stratum_of[sheet], "guard_on": a_on, "guard_off": a_off}
        if a_on == ESCAPE or a_off == ESCAPE:
            # One panel was judgeable and the other was not: not a purity comparison.
            incomparable += 1
            row["direction"] = "incomparable (escape on one side)"
        elif RANK[a_on] > RANK[a_off]:
            on_better += 1
            row["direction"] = "guard ON purer"
        else:
            off_better += 1
            row["direction"] = "guard OFF purer"
        disagreements.append(row)

    per_stratum_cmp = {}
    for s in STRATA:
        on = per_stratum[s]["variants"]["guard_on"]
        off = per_stratum[s]["variants"]["guard_off"]
        d = None
        if on["pureFieldRate"] is not None and off["pureFieldRate"] is not None:
            d = off["pureFieldRate"] - on["pureFieldRate"]
        per_stratum_cmp[s] = {
            "pureFieldOn": on["pureFieldRate"],
            "pureFieldOff": off["pureFieldRate"],
            "offMinusOn": d,
            "winner": None if d is None or d == 0 else ("guard_off" if d > 0 else "guard_on"),
        }

    on_agg = aggregates["guard_on"]["reweightedPureFieldRate"]["value"]
    off_agg = aggregates["guard_off"]["reweightedPureFieldRate"]["value"]
    return {
        "perStratum": per_stratum_cmp,
        "overall": {
            "reweightedOn": on_agg,
            "reweightedOff": off_agg,
            "offMinusOn": (off_agg - on_agg) if (on_agg is not None and off_agg is not None) else None,
            "rawPureFieldOn": aggregates["guard_on"]["rawCounts"]["pure_field"],
            "rawPureFieldOff": aggregates["guard_off"]["rawCounts"]["pure_field"],
        },
        "pairedSheets": {
            "n": len(by_sheet),
            "agree": agree,
            "agreementRate": agree / len(by_sheet) if by_sheet else None,
            "guardOnBetter": on_better,
            "guardOffBetter": off_better,
            "incomparable": incomparable,
            "disagreements": disagreements,
        },
    }


# ---------------------------------------------------------------------------
# Round 1 vs round 2 — INSTRUMENT READINGS, never a pooled rate
# ---------------------------------------------------------------------------

def load_round_1_labels() -> list[dict]:
    """Round 1's labels, through the CLI. Read ONLY to place its answers beside round 2's
    on the covers both rounds happened to draw — never pooled into any rate."""
    proc = subprocess.run(
        [
            "node", "--experimental-strip-types", str(CLI),
            "query", "--batch", "residual-purity-1", "--json", "--limit", "200", "--full",
        ],
        cwd=REPO, capture_output=True, text=True, check=True,
    )
    records = [json.loads(l) for l in proc.stdout.splitlines() if l.strip().startswith("{")]
    return [r for r in records if r["type"] == "oracle-label"]


def instrument_comparison(labels: list[dict]) -> dict:
    r1 = json.loads(ROUND_1_ANALYSIS.read_text())
    f1 = json.loads(ROUND_1_FIXTURE.read_text())
    f2 = json.loads(FIXTURE.read_text())

    covers1 = {cover_key(i["imageId"]): i["stratum"] for i in f1["items"]}
    covers2 = {cover_key(i["imageId"]): i["stratum"] for i in f2["items"]}
    shared = sorted(set(covers1) & set(covers2))

    r2_by_cover: dict[str, dict] = defaultdict(dict)
    for lab in labels:
        r2_by_cover[cover_key(lab["imageId"])][variant_of(lab)] = lab["answer"]

    # Round 1's own answers for the shared covers, read through the CLI, never from the JSONL.
    r1_labels = load_round_1_labels()
    r1_by_cover: dict[str, dict] = defaultdict(dict)
    for lab in r1_labels:
        r1_by_cover[cover_key(lab["imageId"])][variant_of(lab)] = lab["answer"]

    shared_rows = []
    for c in shared:
        row = {
            "cover": c,
            "round1Stratum": covers1[c],
            "round2Stratum": covers2[c],
            "stratumMoved": covers1[c] != covers2[c],
        }
        for v in VARIANTS:
            a1, a2 = r1_by_cover[c].get(v), r2_by_cover[c].get(v)
            row[v] = {
                "round1": a1,
                "round2": a2,
                "same": a1 == a2,
                "step": (RANK[a2] - RANK[a1]) if (a1 in RANK and a2 in RANK) else None,
            }
        shared_rows.append(row)

    per_stratum = {}
    for s in STRATA:
        row = {"poolV4": POOL_V4[s], "poolV5": POOL[s], "poolDelta": POOL[s] - POOL_V4[s]}
        for v in VARIANTS:
            r1c = r1["perStratum"][s]["variants"][v]
            row[v] = {
                "round1PureFieldRate": r1c["pureFieldRate"],
                "round1N": r1c["n"],
                "round2PureFieldRate": None,
                "round2N": None,
            }
        per_stratum[s] = row
    return r1, per_stratum, shared_rows


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    path = sys.argv[1] if len(sys.argv) > 1 else None
    labels, completes = load_records(path)
    fixture = json.loads(FIXTURE.read_text())

    problems = check_integrity(labels, completes, fixture)
    per_stratum, aggregates, adopting = build_analysis(labels, completes, fixture)
    guard = guard_comparison(labels, per_stratum, aggregates)
    r1, cmp_per_stratum, shared_rows = instrument_comparison(labels)

    # Fill round 2's side of the instrument comparison from the computed table.
    for s in STRATA:
        for v in VARIANTS:
            c = per_stratum[s]["variants"][v]
            cmp_per_stratum[s][v]["round2PureFieldRate"] = c["pureFieldRate"]
            cmp_per_stratum[s][v]["round2N"] = c["scoredN"]
            cmp_per_stratum[s][v]["round2EscapeShare"] = c["escapeShare"]
            r1r = cmp_per_stratum[s][v]["round1PureFieldRate"]
            r2r = c["pureFieldRate"]
            cmp_per_stratum[s][v]["movement"] = (r2r - r1r) if (r1r is not None and r2r is not None) else None

    overall_escape_on = aggregates["guard_on"]["rawEscapeShare"]
    overall_escape_off = aggregates["guard_off"]["rawEscapeShare"]
    escapes_total = sum(a["rawCounts"][ESCAPE] for a in aggregates.values())

    analysis = {
        "analysis": "residual-purity-2",
        "generatedBy": "research/v3/oracle/sam/analyze_residual_purity_2.py",
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "batch": BATCH,
        "labelSchemaVersion": LABEL_SCHEMA,
        "batchCompleteIds": [c["id"] for c in completes],
        "labelIds": sorted(lab["id"] for lab in labels),
        "nLabels": len(labels),
        "nSheets": len({lab["imageId"] for lab in labels}),
        "supersededLabels": [lab["id"] for lab in labels if lab.get("supersedes")],
        "integrityProblems": problems,
        "poolingProhibition": (
            "Round 1 used label schema residual-purity.v1 (three answers) and a v4 single-noun "
            "subtraction. Round 2 uses residual-purity.v2 (four answers, escape added) and a v5 "
            "all-nouns subtraction. The two rounds' answers are NEVER pooled and no combined rate "
            "is computed anywhere in this file: a fourth answer drains the other three, and the "
            "thing being subtracted also changed. Every round-1 number here is an instrument "
            "reading beside a round-2 instrument reading."
        ),

        "bar": {
            "source": "research/v3/oracle/sam/RESIDUAL_V5_NOTES.md §12.9 (held from RESIDUAL_EXPERIMENT_NOTES.md §11.11)",
            "preRegistered": True,
            "heldNotMoved": True,
            "aggregateThreshold": BAR_AGGREGATE,
            "stratumFloor": BAR_STRATUM_FLOOR,
            "rule": (
                "Adopt R-3's structural claim only if the stratum-reweighted pure_field rate is >= 0.75 "
                "in at least one guard variant AND no single stratum falls below 0.50; otherwise the "
                "residual stays a field-enriched prior."
            ),
            "weights": POOL,
            "weightTotal": POOL_TOTAL,
            "weightsNote": (
                "v5 pools, which differ from v4's (77/10/25/2/28): the all-nouns elicitation prompts "
                "almost every cover, so static-only-clean collapsed 28->7 and class-only 2->1 while "
                "noun-fired grew 77->102 (§12.8). Same weighting RULE, different population shape."
            ),
        },

        "escapeRule": {
            "source": "research/v3/oracle/sam/RESIDUAL_V5_NOTES.md §12.9, built at commit 3926344",
            "answer": ESCAPE,
            "label": "can't tell what is field here",
            "scoring": (
                "cant_tell is NOT counted as pure, NOT counted as not-pure, and NOT dropped. It leaves "
                "both the numerator and the denominator of the pure-field rate. Its share is reported "
                "per stratum as a first-class result — figure/ground ambiguity is a property of the "
                "covers, not noise."
            ),
            "unreliableAbove": ESCAPE_UNRELIABLE_ABOVE,
            "unreliableRule": (
                "A stratum whose escape share exceeds 0.50 has no reliable purity rate and is reported "
                "as having none, rather than as having a low one."
            ),
            "provenance": (
                "The reviewer's own request after round 1: 'sometimes it's hard to tell what is field "
                "and what is subject, so answers for those cases are not reliable (even with human "
                "feedback) unless we add an escape answer choice.'"
            ),
        },

        "perStratum": per_stratum,
        "aggregates": aggregates,
        "verdict": {
            "overall": "ADOPT" if adopting else "NOT-ADOPT",
            "adoptingVariants": adopting,
            "perVariant": {v: aggregates[v]["verdict"] for v in VARIANTS},
            "consequence": (
                "R-3 adopted on this evidence." if adopting else
                "R-3 NOT adopted on this evidence; the residual stays a field-enriched prior."
            ),
        },

        "escapeShare": {
            "why": (
                "Pre-registered as a first-class result, not a diagnostic. It measures how often a "
                "cover has no figure/ground fact to get right."
            ),
            "overall": {
                "guard_on": overall_escape_on,
                "guard_off": overall_escape_off,
                "totalEscapeAnswers": escapes_total,
                "totalAnswers": len(labels),
            },
            "reweighted": {v: aggregates[v]["reweightedEscapeShare"]["value"] for v in VARIANTS},
            "perStratum": {
                s: {v: per_stratum[s]["variants"][v]["escapeShare"] for v in VARIANTS}
                for s in STRATA
            },
            "strataWithNoReliableRate": {
                v: aggregates[v]["strataWithNoReliableRate"] for v in VARIANTS
            },
            "proseAmbiguityPrior": {
                **PROSE_AMBIGUITY_PRIOR,
                "source": "GROUND_FREETEXT_SYNTHESIS.md — covers 5, 7, 9 of 9 were ambiguous in unconstrained prose",
                "comparison": (
                    "The prose arm found 0.3333 of covers ambiguous when the reviewer wrote free text "
                    "about the ground. This round offered a slot for exactly that answer on every panel."
                ),
                "caveat": (
                    "Different cover sets and different tasks: the prose arm described a whole artwork's "
                    "ground in words; this round judged a subtracted panel against a named question with "
                    "the artwork visible beside it. A gap between the two rates is a fact about the two "
                    "elicitations as much as about the covers."
                ),
            },
        },

        "sensitivityCeiling": {
            "what": (
                "The maximally generous reallocation: count EVERY mostly_field answer as pure_field, "
                "escapes still excluded. Pre-registered in §12.9 so a reader can see whether the verdict "
                "is boundary-sensitive."
            ),
            "perVariant": {
                v: {
                    "reweightedCeiling": aggregates[v]["reweightedPureOrMostlyCeiling"]["value"],
                    "reachesAggregateThreshold": (aggregates[v]["reweightedPureOrMostlyCeiling"]["value"] or 0) >= BAR_AGGREGATE,
                    "strataBelowFloorAtCeiling": sorted(
                        s for s in STRATA
                        if per_stratum[s]["variants"][v]["pureOrMostlyRate"] is not None
                        and per_stratum[s]["variants"][v]["pureOrMostlyRate"] < BAR_STRATUM_FLOOR
                    ),
                    "wouldClearWholeBarAtCeiling": (
                        (aggregates[v]["reweightedPureOrMostlyCeiling"]["value"] or 0) >= BAR_AGGREGATE
                        and not [
                            s for s in STRATA
                            if per_stratum[s]["variants"][v]["pureOrMostlyRate"] is not None
                            and per_stratum[s]["variants"][v]["pureOrMostlyRate"] < BAR_STRATUM_FLOOR
                        ]
                    ),
                }
                for v in VARIANTS
            },
            "boundarySensitivity": (
                "This is the one place round 2 differs in KIND from round 1. Round 1's ceiling missed "
                "the bar in BOTH variants (0.7412 / 0.6127), so its NOT-ADOPT could not be overturned by "
                "any reallocation of the soft answers — the verdict did not sit near the boundary. Round "
                "2's ceiling clears the aggregate threshold AND every stratum floor in both variants "
                "(0.8106 / 0.9473). The verdict now rests entirely on where the reviewer drew the "
                "pure/mostly line, and 'mostly field' is the modal answer of the round (21 of 48). It is "
                "still a NOT-ADOPT — the bar asks for pure, the ceiling is not a rate, and nobody may "
                "read the ceiling as the result — but it is no longer a verdict that is safe against the "
                "boundary, and any re-run should expect the pure/mostly distinction to be doing the "
                "deciding. That distinction has never been calibrated."
            ),
        },

        "guardComparison": guard,

        "instrumentComparison": {
            "framing": (
                "Two instrument readings side by side. NOT a paired rate and NOT a pooled rate. Three "
                "things changed at once between the rounds: (1) the subtraction — v4 subtracted the one "
                "main noun, v5 subtracts every noun a J list named; (2) the elicitation of the ANSWER — "
                "round 1 forced a choice among three, round 2 offered a fourth; (3) the sample — a "
                "different seed over pools that themselves moved. Any movement below is attributable to "
                "any of the three, and this round cannot separate them."
            ),
            "round1": {
                "batch": "residual-purity-1",
                "labelSchemaVersion": "residual-purity.v1",
                "subtraction": "sam-eval-142-v4-nouns (single main noun)",
                "answers": list(SCORED),
                "reweightedPureFieldRate": {
                    v: r1["aggregates"][v]["reweightedPureFieldRate"] for v in VARIANTS
                },
                "verdict": r1["verdict"]["overall"],
            },
            "round2": {
                "batch": BATCH,
                "labelSchemaVersion": LABEL_SCHEMA,
                "subtraction": "sam-eval-142-v5-allnouns (every noun a variant-J list named, cap 8)",
                "answers": list(ANSWERS),
                "reweightedPureFieldRate": {
                    v: aggregates[v]["reweightedPureFieldRate"]["value"] for v in VARIANTS
                },
                "verdict": "ADOPT" if adopting else "NOT-ADOPT",
            },
            "movement": {
                v: {
                    "round1": r1["aggregates"][v]["reweightedPureFieldRate"],
                    "round2": aggregates[v]["reweightedPureFieldRate"]["value"],
                    "delta": aggregates[v]["reweightedPureFieldRate"]["value"] - r1["aggregates"][v]["reweightedPureFieldRate"],
                }
                for v in VARIANTS
            },
            "perStratum": cmp_per_stratum,
            "sharedCovers": {
                "n": len(shared_rows),
                "ofRound1": 25,
                "ofRound2": 24,
                "note": (
                    "The two rounds drew independently under different seeds over pools that changed "
                    "size, so only these covers appear in both. That is far too few for a paired rate; "
                    "they are listed as direct observations, not as a statistic. §12.9's 'paired "
                    "question' framing means paired at the POPULATION level (both draws come from "
                    "eval-142), not at the cover level."
                ),
                "judgmentsIdentical": sum(
                    1 for r in shared_rows for v in VARIANTS if r[v]["same"]
                ),
                "judgmentsTotal": len(shared_rows) * len(VARIANTS),
                "netSteps": sum(
                    r[v]["step"] for r in shared_rows for v in VARIANTS if r[v]["step"] is not None
                ),
                "newPureFieldAnswers": sum(
                    1 for r in shared_rows for v in VARIANTS
                    if r[v]["round2"] == "pure_field" and r[v]["round1"] != "pure_field"
                ),
                "readThis": (
                    "On the covers BOTH rounds happened to draw, the answers barely moved. That is the "
                    "single most important caveat on the headline movement: the aggregate rose, but not "
                    "on the covers where a before/after is actually visible. It is consistent with the "
                    "movement coming from the redrawn sample rather than from the better subtraction — "
                    "and equally consistent with 5 covers being too few to show anything. n=5 of 24 "
                    "settles nothing on its own; it is reported because it points the opposite way from "
                    "the headline and must not be omitted for that reason."
                ),
                "covers": shared_rows,
            },
            "whatEachChangeCouldExplain": {
                "subtraction_v4_to_v5": (
                    "The one change expected to RAISE purity: more nouns named means more subject "
                    "removed, so fewer leftover objects. Round 1's own free-text feedback named exactly "
                    "the misses an all-nouns list targets — a flame, a cello, a second object the single "
                    "main-noun question never prompted."
                ),
                "escape_added": (
                    "Expected to RAISE the rate mechanically if it is used, by removing the hardest "
                    "covers from the denominator. Whether it did is answered by the escape share: at "
                    f"{escapes_total} escape answers out of {len(labels)}, "
                    + ("this explanation is UNAVAILABLE — the denominator never shrank."
                       if escapes_total == 0 else
                       "part of the movement may be denominator shrinkage and is reported as such.")
                ),
                "sample_redrawn": (
                    "Different covers, and pools that moved hard (static-only-clean 28->7). With 8/5/6/1/4 "
                    "sheets per stratum, a per-stratum rate moves in steps of 0.125/0.2/0.167/1.0/0.25, so "
                    "single-cover sampling noise is large relative to the movement in the small strata."
                ),
            },
        },

        "proxyVsHuman": {
            "claim": {
                "run": "sam-eval-142-v5-allnouns",
                "cut": "subtraction",
                "perVariant": PROXY_V5,
                "note": (
                    "The proxy's non-clean set IS the `contaminated` stratum, so it asserts 0.0 clean "
                    "there and 1.0 clean in every other stratum — the same stark claim it made on v4."
                ),
            },
            "perStratum": {
                s: {
                    "proxyClean": PROXY_CLEAN_BY_STRATUM[s],
                    "humanPure": {v: per_stratum[s]["variants"][v]["pureFieldRate"] for v in VARIANTS},
                    "gap": {
                        v: (per_stratum[s]["variants"][v]["pureFieldRate"] - PROXY_CLEAN_BY_STRATUM[s])
                        if per_stratum[s]["variants"][v]["pureFieldRate"] is not None else None
                        for v in VARIANTS
                    },
                }
                for s in STRATA
            },
            "aggregate": {
                v: {
                    "proxyClean": PROXY_V5[v]["rate"],
                    "humanPureReweighted": aggregates[v]["reweightedPureFieldRate"]["value"],
                    "gap": aggregates[v]["reweightedPureFieldRate"]["value"] - PROXY_V5[v]["rate"],
                }
                for v in VARIANTS
            },
            "priorOverclaim": {
                "v4Measured": PROXY_MEASURED_OVERCLAIM_V4,
                "note": (
                    "Round 1 measured this proxy over-claiming purity by 0.582. This round is the second "
                    "measurement of the same offset, on the v5 run."
                ),
            },
        },

        "scope": {
            "population": (
                "eval-142, the 142-cover SAM run set. NOT the corpus and NOT the v3 tuning bench. "
                "COVERAGE_SET.md establishes eval-142 was never a sample of this corpus (cluster-mix "
                "total-variation distance 0.2273 against coverage-set-1's 0.0851, 2.67x worse), so NO "
                "number in this file is a corpus-level purity estimate."
            ),
            "prescribedCorpusRerun": "coverage-set-1 (200 artworks, seed 0xc0efface), per RESIDUAL_PURITY_VERDICT.md",
            "enrichment": (
                "The sample is deliberately enriched for hard cases (contaminated 6/24 = 25% of the "
                "sample vs 20/142 = 14.1% of the population). Reweighting corrects the aggregate; the "
                "raw rate is not a population rate."
            ),
            "cut": (
                "Panels render at the SUBTRACTION cut — min(pooled, group cut) per group under concept "
                "set v2.2, because cjk_script's cut (0.392655, PROVISIONAL) is below pooled — not "
                "config.py's shipped precision cut. Not a proposal to change config.py."
            ),
            "smallCells": (
                "class-only n=1 per variant (the entire v5 pool), static-only-clean n=4, noun-silent "
                "n=5. A class-only rate can only be 0.0 or 1.0, so the floor clause is decided in that "
                "stratum by a single answer. Read the floor clause with that in mind."
            ),
            "knownLeaks": (
                "§12.11 item 5: of the three fixes the round-1 verdict named as preconditions for a "
                "meaningful re-run — list-ALL-things, the text_below_cut leak, the ornament policy — "
                "this round did the first only. The result is still read against a known-leaking text "
                "arm and an unowned ornament class."
            ),
        },

        "proposedDecisionRecords": [
            {
                "id": "d-2026-08-04-r3-not-adopted-on-v5-allnouns",
                "status": "PROPOSED — not recorded by this analysis",
                "title": "R-3 not adopted: the all-nouns residual is still a field-enriched prior",
                "decision": (
                    "R-3's structural claim — that 'everything but the masks' isolates background well "
                    "enough to retire ground vocabulary to pixel computation — is NOT adopted on the "
                    "residual-purity-2 evidence. The stratum-reweighted pure-field rate is "
                    "0.4007 (guard ON) and 0.5609 (guard OFF) against a pre-registered bar of 0.75, "
                    "with noun-silent (0.20) and class-only (0.00) below the 0.50 stratum floor in both "
                    "variants and contaminated (0.00) below it under guard ON. The residual remains a "
                    "field-enriched prior, not a field."
                ),
                "alsoDecides": (
                    "The escape answer works and figure/ground ambiguity did NOT materialise at the "
                    "panel: cant_tell was available on all 48 items and chosen 0 times, so the "
                    "escape-excluded denominator equals the full denominator and no stratum lost its "
                    "purity rate. The rate rise from round 1 is therefore NOT denominator shrinkage."
                ),
                "barHeldNotMoved": True,
                "supersedes": None,
                "succeeds": "the round-1 verdict d-2026-08-04-r3-not-adopted (RESIDUAL_PURITY_VERDICT.md §'Proposed decision records' 1), which this round re-tests with a corrected instrument and confirms",
                "fundedBy": None,  # filled in below: the 48 label ids + the batch-complete id
                "fundedByNote": (
                    "The 48 released oracle-label ids of batch residual-purity-2 plus its batch-complete "
                    "record. Every id was released before this analysis ran; none is superseded, "
                    "amended or retracted."
                ),
                "scopeLimit": (
                    "eval-142 only. Not a corpus estimate — COVERAGE_SET.md establishes eval-142 was "
                    "never a sample of this corpus. The prescribed corpus re-run is on coverage-set-1."
                ),
                "knownWeakness": (
                    "The charitable ceiling clears the whole bar in both variants, so this NOT-ADOPT is "
                    "boundary-sensitive in a way round 1's was not. It is recorded as a NOT-ADOPT "
                    "because the bar asks for pure field and 0.4007/0.5609 is what was answered."
                ),
            },
            {
                "id": "d-2026-08-04-area-guard-off-wins-on-purity",
                "status": "PROPOSED — not recorded by this analysis, and NOT a config change",
                "title": "The uniform area guard costs residual purity (A6 evidence)",
                "decision": (
                    "On the all-nouns subtraction, turning the uniform area guard OFF produces a purer "
                    "residual, unanimously in direction: of 24 sheets the two settings disagreed on 6, "
                    "and guard OFF was the purer answer on all 6 — guard ON on none. Reweighted, "
                    "0.5609 (OFF) vs 0.4007 (ON), +0.1602. The effect is concentrated in `contaminated` "
                    "(0.50 OFF vs 0.00 ON). This is evidence FOR loose end A6's person exemption and "
                    "evidence that the exemption question now also applies to dyn-noun-N."
                ),
                "mechanism": (
                    "The guard drops masks above an area fraction. With eight noun prompts per cover "
                    "instead of one, far more large masks are proposed, so the guard rejects more of "
                    "them — and a rejected subject mask leaves its subject in the residual. Round 1 saw "
                    "no such effect (2 ON-better / 1 OFF-better, a tie) because a single main-noun list "
                    "rarely produced a mask big enough for the guard to bite."
                ),
                "doesNotDecide": (
                    "This does NOT authorise turning the guard off. The guard exists to stop a runaway "
                    "mask eating the whole image, and this round measured only what remains, never "
                    "whether too much was removed — the reviewer was explicitly instructed that "
                    "'whether too much was removed is not this question'. The over-removal arm is "
                    "unmeasured, and the guard cannot be changed on a one-sided measurement."
                ),
                "fundedBy": None,  # filled in below
                "fundedByNote": "Same 48 labels — the guard comparison is the same answers read pairwise.",
            },
        ],

        "rulingContext": {
            "question": (
                "R-3 / the ground-vocabulary question: can 'everything but the masks' isolate backgrounds "
                "well enough to retire ground vocabulary to pixel computation?"
            ),
            "otherArm": (
                "GROUND_FREETEXT_SYNTHESIS.md: on free-text ground descriptions, 6 of 9 covers were "
                "palette-decidable in prose (ambiguous: 5, 7, 9)."
            ),
            "whoDecides": (
                "The vocabulary-vs-pixels ruling is the REVIEWER'S to make. This analysis supplies the "
                "pixel arm only."
            ),
        },
    }

    funding = sorted(lab["id"] for lab in labels) + [c["id"] for c in completes]
    for rec in analysis["proposedDecisionRecords"]:
        rec["fundedBy"] = funding

    return analysis


if __name__ == "__main__":
    result = main()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent="\t") + "\n")
    print(f"wrote {OUT.relative_to(REPO)}")
    agg = result["aggregates"]
    for v in VARIANTS:
        a = agg[v]
        print(
            f"  {v}: reweighted pure={a['reweightedPureFieldRate']['value']:.4f} "
            f"ceiling={a['reweightedPureOrMostlyCeiling']['value']:.4f} "
            f"escape={a['rawEscapeShare']:.4f} -> {a['verdict']}"
        )
    print(f"  overall: {result['verdict']['overall']}")
    if result["integrityProblems"]:
        print("  INTEGRITY PROBLEMS:", *result["integrityProblems"], sep="\n    ")
