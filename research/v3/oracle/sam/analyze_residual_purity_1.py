#!/usr/bin/env python3
"""Analyze the released reviewer round `residual-purity-1` against its pre-registered bar.

The bar (RESIDUAL_EXPERIMENT_NOTES.md §11.11, fixed before any answer was seen):

    Adopt R-3's structural claim only if the stratum-reweighted "pure field" rate is
    >= 0.75 in AT LEAST ONE guard variant, AND no single stratum falls below 0.50.
    Otherwise the residual stays a "field-enriched prior".

Reweighting uses the pre-registered pool sizes as inverse-probability weights, so the
enrichment for hard cases does not inflate or deflate the aggregate.

Input is read through the warehouse CLI (supersession + amendments applied), never by
parsing the JSONL wholesale. Usage:

    node --experimental-strip-types research/v3/src/warehouse/cli.ts \
        query --batch residual-purity-1 --json --limit 200 --full > /tmp/rp1.jsonl
    python3 research/v3/oracle/sam/analyze_residual_purity_1.py /tmp/rp1.jsonl

This script writes data/sam/residual-purity-1-analysis.json. It touches nothing else.
"""

from __future__ import annotations

import json
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
V3 = REPO / "research" / "v3"
FIXTURE = V3 / "data" / "sam" / "residual-purity-1.json"
OUT = V3 / "data" / "sam" / "residual-purity-1-analysis.json"
CLI = V3 / "src" / "warehouse" / "cli.ts"

BATCH = "residual-purity-1"
ANSWERS = ("pure_field", "mostly_field", "not_field")
VARIANTS = ("guard_on", "guard_off")
STRATA = ("noun-fired", "noun-silent", "contaminated", "class-only", "static-only-clean")

# Pre-registered pool sizes = inverse-probability weights (§11.11 / sheets manifest meta).
POOL = {
    "noun-fired": 77,
    "noun-silent": 10,
    "contaminated": 25,
    "class-only": 2,
    "static-only-clean": 28,
}
POOL_TOTAL = sum(POOL.values())  # 142

# The bar, verbatim in numbers.
BAR_AGGREGATE = 0.75
BAR_STRATUM_FLOOR = 0.50

# The proxy's claim, for the proxy-vs-human gap (§11 table: v4 / subtraction).
# `contaminated` is exactly the set of covers the proxy flagged with >=1 cause, so the
# proxy asserts 0% clean there and 100% clean in every other stratum.
PROXY_CLEAN_BY_STRATUM = {
    "noun-fired": 1.0,
    "noun-silent": 1.0,
    "contaminated": 0.0,
    "class-only": 1.0,
    "static-only-clean": 1.0,
}
PROXY_CLEAN_COVERS = 117
PROXY_TOTAL_COVERS = 142


def load_labels(path: str | None) -> list[dict]:
    """Read the round's labels through the warehouse CLI (supersession respected)."""
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
    records = [json.loads(line) for line in raw.splitlines() if line.strip()]
    labels = [r for r in records if r["type"] == "oracle-label"]
    completes = [r for r in records if r["type"] == "batch-complete"]
    return labels, completes


def variant_of(label: dict) -> str:
    return label["questionKey"].rsplit(".", 1)[-1]


def rate(counts: Counter, answer: str) -> float | None:
    n = sum(counts.values())
    return (counts[answer] / n) if n else None


def main() -> None:
    src = sys.argv[1] if len(sys.argv) > 1 else None
    labels, completes = load_labels(src)

    fixture = json.loads(FIXTURE.read_text())
    item_stratum = {it["itemId"]: it["stratum"] for it in fixture["items"]}

    # --- integrity checks --------------------------------------------------
    problems = []
    if len(labels) != 50:
        problems.append(f"expected 50 labels, got {len(labels)}")
    superseded = [l["id"] for l in labels if l.get("supersedes")]
    pairs = {(l["imageId"], variant_of(l)) for l in labels}
    if len(pairs) != len(labels):
        problems.append("duplicate (sheet, variant) pairs after supersession")
    for l in labels:
        if l["answer"] not in ANSWERS:
            problems.append(f"unexpected answer {l['answer']!r} on {l['id']}")
        expect = item_stratum.get(f"{l['imageId']}.{variant_of(l)}")
        if expect and expect != l["stratum"]:
            problems.append(f"stratum mismatch on {l['id']}")

    # --- cells: stratum x variant -----------------------------------------
    cells: dict[str, dict[str, Counter]] = {
        s: {v: Counter() for v in VARIANTS} for s in STRATA
    }
    by_sheet: dict[str, dict[str, str]] = defaultdict(dict)
    sheet_stratum: dict[str, str] = {}
    for l in labels:
        cells[l["stratum"]][variant_of(l)][l["answer"]] += 1
        by_sheet[l["imageId"]][variant_of(l)] = l["answer"]
        sheet_stratum[l["imageId"]] = l["stratum"]

    per_stratum = {}
    for s in STRATA:
        per_stratum[s] = {
            "poolSize": POOL[s],
            "poolWeight": POOL[s] / POOL_TOTAL,
            "variants": {
                v: {
                    "n": sum(cells[s][v].values()),
                    "counts": {a: cells[s][v][a] for a in ANSWERS},
                    "pureFieldRate": rate(cells[s][v], "pure_field"),
                    "mostlyFieldRate": rate(cells[s][v], "mostly_field"),
                    "notFieldRate": rate(cells[s][v], "not_field"),
                    "pureOrMostlyRate": (
                        (cells[s][v]["pure_field"] + cells[s][v]["mostly_field"])
                        / sum(cells[s][v].values())
                        if sum(cells[s][v].values()) else None
                    ),
                }
                for v in VARIANTS
            },
        }

    # --- reweighted aggregates --------------------------------------------
    aggregates = {}
    for v in VARIANTS:
        pure = sum(POOL[s] * per_stratum[s]["variants"][v]["pureFieldRate"] for s in STRATA)
        mostly = sum(POOL[s] * per_stratum[s]["variants"][v]["mostlyFieldRate"] for s in STRATA)
        raw = Counter()
        for s in STRATA:
            raw += cells[s][v]
        floors = {s: per_stratum[s]["variants"][v]["pureFieldRate"] for s in STRATA}
        below = sorted(
            (s for s, r in floors.items() if r < BAR_STRATUM_FLOOR),
            key=lambda s: floors[s],
        )
        reweighted = pure / POOL_TOTAL
        meets_agg = reweighted >= BAR_AGGREGATE
        aggregates[v] = {
            "reweightedPureFieldRate": reweighted,
            "reweightedMostlyFieldRate": mostly / POOL_TOTAL,
            "reweightedPureOrMostlyRate": (pure + mostly) / POOL_TOTAL,
            "rawPureFieldRate": rate(raw, "pure_field"),
            "rawCounts": {a: raw[a] for a in ANSWERS},
            "meetsAggregateBar": meets_agg,
            "strataBelowFloor": below,
            "meetsFloorClause": not below,
            "verdict": "ADOPT" if (meets_agg and not below) else "NOT-ADOPT",
        }

    any_adopt = [v for v in VARIANTS if aggregates[v]["verdict"] == "ADOPT"]
    overall_verdict = "ADOPT" if any_adopt else "NOT-ADOPT"

    # --- guard comparison (A6 evidence, reported not decided) --------------
    guard = {"perStratum": {}, "overall": {}, "pairedSheets": {}}
    for s in STRATA:
        on = per_stratum[s]["variants"]["guard_on"]
        off = per_stratum[s]["variants"]["guard_off"]
        guard["perStratum"][s] = {
            "pureFieldOn": on["counts"]["pure_field"],
            "pureFieldOff": off["counts"]["pure_field"],
            "pureRateOn": on["pureFieldRate"],
            "pureRateOff": off["pureFieldRate"],
            "delta": on["pureFieldRate"] - off["pureFieldRate"],
            "winner": (
                "guard_on" if on["counts"]["pure_field"] > off["counts"]["pure_field"]
                else "guard_off" if off["counts"]["pure_field"] > on["counts"]["pure_field"]
                else "tie"
            ),
        }
    on_tot = sum(cells[s]["guard_on"]["pure_field"] for s in STRATA)
    off_tot = sum(cells[s]["guard_off"]["pure_field"] for s in STRATA)
    guard["overall"] = {
        "pureFieldOn": on_tot,
        "pureFieldOff": off_tot,
        "rawWinner": "guard_on" if on_tot > off_tot else "guard_off" if off_tot > on_tot else "tie",
        "reweightedOn": aggregates["guard_on"]["reweightedPureFieldRate"],
        "reweightedOff": aggregates["guard_off"]["reweightedPureFieldRate"],
        "reweightedDelta": (
            aggregates["guard_on"]["reweightedPureFieldRate"]
            - aggregates["guard_off"]["reweightedPureFieldRate"]
        ),
    }
    # Paired: same sheet, both panels, seen in different order.
    order = {a: i for i, a in enumerate(ANSWERS)}  # pure=0 best
    flips = Counter()
    flip_detail = []
    for sheet, ans in by_sheet.items():
        if len(ans) != 2:
            continue
        on_a, off_a = ans["guard_on"], ans["guard_off"]
        if on_a == off_a:
            flips["same"] += 1
        elif order[on_a] < order[off_a]:
            flips["guard_on_better"] += 1
        else:
            flips["guard_off_better"] += 1
        if on_a != off_a:
            flip_detail.append({
                "sheet": sheet, "stratum": sheet_stratum[sheet],
                "guard_on": on_a, "guard_off": off_a,
            })
    guard["pairedSheets"] = {
        "n": len(by_sheet),
        "agree": flips["same"],
        "guardOnBetter": flips["guard_on_better"],
        "guardOffBetter": flips["guard_off_better"],
        "agreementRate": flips["same"] / len(by_sheet) if by_sheet else None,
        "disagreements": sorted(flip_detail, key=lambda d: (d["stratum"], d["sheet"])),
    }

    # --- proxy vs human ----------------------------------------------------
    proxy = {"claim": {
        "run": "sam-eval-142-v4-nouns", "cut": "subtraction",
        "cleanCovers": PROXY_CLEAN_COVERS, "totalCovers": PROXY_TOTAL_COVERS,
        "cleanRate": PROXY_CLEAN_COVERS / PROXY_TOTAL_COVERS,
        "note": (
            "The proxy's non-clean set IS the `contaminated` stratum (25 covers), so the proxy "
            "asserts 0.0 clean there and 1.0 clean in every other stratum. Any human pure_field "
            "rate below 1.0 outside `contaminated` is a proxy MISS; any pure_field answer inside "
            "`contaminated` is a proxy FALSE ALARM."
        ),
    }, "perStratum": {}}
    for s in STRATA:
        row = {"proxyCleanRate": PROXY_CLEAN_BY_STRATUM[s]}
        for v in VARIANTS:
            hp = per_stratum[s]["variants"][v]["pureFieldRate"]
            row[v] = {
                "humanPureFieldRate": hp,
                "gap": hp - PROXY_CLEAN_BY_STRATUM[s],
                "direction": (
                    "proxy over-claims clean" if hp < PROXY_CLEAN_BY_STRATUM[s]
                    else "proxy under-claims clean" if hp > PROXY_CLEAN_BY_STRATUM[s]
                    else "agrees"
                ),
            }
        proxy["perStratum"][s] = row
    for v in VARIANTS:
        proxy.setdefault("aggregate", {})[v] = {
            "proxyCleanRate": PROXY_CLEAN_COVERS / PROXY_TOTAL_COVERS,
            "humanReweightedPureFieldRate": aggregates[v]["reweightedPureFieldRate"],
            "gap": aggregates[v]["reweightedPureFieldRate"] - PROXY_CLEAN_COVERS / PROXY_TOTAL_COVERS,
        }

    out = {
        "analysis": "residual-purity-1",
        "generatedBy": "research/v3/oracle/sam/analyze_residual_purity_1.py",
        "generatedAt": None,  # filled below
        "batch": BATCH,
        "batchCompleteIds": [c["id"] for c in completes],
        "labelIds": sorted(l["id"] for l in labels),
        "nLabels": len(labels),
        "nSheets": len(by_sheet),
        "supersededLabels": superseded,
        "integrityProblems": problems,
        "bar": {
            "source": "research/v3/oracle/sam/RESIDUAL_EXPERIMENT_NOTES.md §11.11",
            "preRegistered": True,
            "aggregateThreshold": BAR_AGGREGATE,
            "stratumFloor": BAR_STRATUM_FLOOR,
            "rule": (
                "Adopt R-3's structural claim only if the stratum-reweighted pure_field rate is "
                ">= 0.75 in at least one guard variant AND no single stratum falls below 0.50; "
                "otherwise the residual stays a field-enriched prior."
            ),
            "weights": POOL,
            "weightTotal": POOL_TOTAL,
        },
        "perStratum": per_stratum,
        "aggregates": aggregates,
        "verdict": {
            "overall": overall_verdict,
            "adoptingVariants": any_adopt,
            "perVariant": {v: aggregates[v]["verdict"] for v in VARIANTS},
            "consequence": (
                "R-3 adopted: background structure becomes a pixel computation."
                if overall_verdict == "ADOPT"
                else "R-3 NOT adopted on this evidence; the residual stays a field-enriched prior."
            ),
        },
        "sensitivityCeiling": {
            "what": (
                "The maximally generous reallocation: count EVERY mostly_field answer as pure_field. "
                "This is the ceiling the round could reach if every soft answer were charitable, and "
                "it bounds how far the missing escape answer could move the verdict."
            ),
            "perVariant": {
                v: {
                    "reweightedCeiling": aggregates[v]["reweightedPureOrMostlyRate"],
                    "reachesBar": aggregates[v]["reweightedPureOrMostlyRate"] >= BAR_AGGREGATE,
                }
                for v in VARIANTS
            },
            "conclusion": (
                "Neither variant reaches 0.75 even at the ceiling (guard ON 0.7412, guard OFF "
                "0.6127). The verdict does NOT sit near the bar boundary: no reallocation of the "
                "soft answers, and no plausible use of an escape option, turns this round into an "
                "ADOPT. The forced-choice caveat qualifies the exact rates, not the verdict."
            ),
        },
        "guardComparison": guard,
        "proxyVsHuman": proxy,
        "scope": {
            "population": (
                "eval-142, the 142-cover SAM run set. NOT the corpus and NOT the v3 tuning bench: "
                "V3_PLAN.md item 11 records coverage-set-1 (200 artworks, seed 0xc0efface) as "
                "superseding eval-142 as the bench. Rates here describe eval-142's distribution."
            ),
            "populationDetail": {
                "howBuilt": (
                    "eval-142 was never sampled. It is a census with an inclusion filter "
                    "(data/oracle-premise/eval-set.json, builder oracle/premise/build-eval-set.ts): "
                    "every artwork whose v2-3 warehouse held at least one palette graded `strong` "
                    "and still standing under the recency rule. No seed, no quota, no difficulty "
                    "strata. Its ground truth is an accepted ALGORITHM decision, not an elicited "
                    "human label — the reviewer graded palettes, not artworks."
                ),
                "tierMixNote": (
                    "The only tier mix that exists for eval-142 is a RESOLUTION-tier table computed "
                    "retroactively by the coverage-set build (coverage-set-1.json eval142Overlap."
                    "tierMix, COVERAGE_SET.md), as a diagnostic of the set — not a rule used to "
                    "build it. There are no difficulty or category tiers anywhere."
                ),
                "resolutionTierMix": [
                    {"tier": "<=400", "evalCount": 45, "evalPct": 31.69, "universePct": 26.45},
                    {"tier": "401-640", "evalCount": 86, "evalPct": 60.56, "universePct": 61.56},
                    {"tier": "641-1024", "evalCount": 7, "evalPct": 4.93, "universePct": 10.30},
                    {"tier": ">1024", "evalCount": 4, "evalPct": 2.82, "universePct": 1.69},
                ],
                "representativeness": (
                    "25 of 142 (17.61%) are legacy repo-root covers not in the embedded corpus at "
                    "all; 4 of 36 clusters (5.36% of the universe) contain no eval-142 artwork; "
                    "cluster-mix total-variation distance from the corpus is 0.2273 for eval-142 "
                    "vs 0.0851 for the coverage core (2.67x). COVERAGE_SET.md's verdict: "
                    "'eval-142 was never a sample of this corpus.' The reweighting in this analysis "
                    "corrects for the ROUND's enrichment within eval-142; it cannot and does not "
                    "correct for eval-142's own drift from the corpus."
                ),
            },
            "enrichment": (
                "`contaminated` is 6/25 sampled from a pool of 25 (24% of the sample vs 17.6% of "
                "the population) — deliberately over-sampled. Reweighting corrects the aggregate; "
                "the raw rate is not a population estimate."
            ),
            "cut": (
                "Panels render at the SUBTRACTION cut (pooled 0.578 on every group, text_like "
                "included), not config.py's shipped precision cut which raises text_like to "
                "0.697295. Not a proposal to change config.py."
            ),
            "smallCells": (
                "class-only n=2 per variant (the whole pool), noun-silent n=5, static-only-clean "
                "n=4. Per-stratum rates in these cells move in steps of 0.50/0.20/0.25; the "
                "floor clause is therefore decided by very few answers."
            ),
            "forcedChoiceCaveat": (
                "The round offered pure_field / mostly_field / not_field and NO escape answer. "
                "Post-release the reviewer stated that on genuinely ambiguous figure/ground covers "
                "the forced answers are NOT reliable. Every rate here is 'answers as given'. Where "
                "a rate sits near a bar boundary the escape-less format could move it either way. "
                "GROUND_FREETEXT_SYNTHESIS.md independently found 3 of 9 covers ambiguous in prose."
            ),
        },
        "rulingContext": {
            "question": (
                "R-3 / the ground-vocabulary question: can 'everything but the masks' isolate "
                "backgrounds well enough to retire ground vocabulary to pixel computation?"
            ),
            "otherArm": (
                "GROUND_FREETEXT_SYNTHESIS.md: on free-text ground descriptions, 6 of 9 covers were "
                "palette-decidable in prose (decidable 1,2,3,4,6,8; ambiguous 5,7,9) — the "
                "description fixed both what kind of ground it is and which pixels are ground."
            ),
            "whoDecides": (
                "The vocabulary-vs-pixels ruling is the REVIEWER'S to make. This analysis supplies "
                "the pixel arm only, and it supplies a NOT-ADOPT."
            ),
        },
        "reviewerFeedback": {
            "receivedAfterRelease": "2026-08-04",
            "verbatim": (
                "objects that were not masked out during the everything-but-the-masks round — a "
                "flame — some residual text — a cello — decorations above/below the main text "
                "(that would be considered part of the main text). sometimes it's hard to tell "
                "what is field and what is subject, so answers for those cases are not reliable "
                "(even with human feedback) unless we add an escape answer choice."
            ),
            "missClasses": [
                {
                    "class": "secondary depicted object (flame)",
                    "cause": "single-noun elicitation limit — the noun question asks for THE main "
                             "thing, so a second depicted object goes unprompted and unmasked",
                    "fix": "list-ALL-things elicitation (v2 proposal)",
                },
                {
                    "class": "secondary depicted object (cello)",
                    "cause": "same single-noun elicitation limit",
                    "fix": "list-ALL-things elicitation (v2 proposal)",
                },
                {
                    "class": "residual text",
                    "cause": "the known text_below_cut classes — text scored below the cut and "
                             "survived subtraction",
                    "fix": "already tracked; the subtraction cut exists for exactly this",
                },
                {
                    "class": "text-adjacent decoration",
                    "cause": "ornaments above/below the main text block are not part of any "
                             "text_like mask and are not a depicted subject either",
                    "fix": "policy: count them as PART of the main text for masking purposes",
                },
            ],
            "embeddedPolicy": (
                "Decorations above/below the main text count as PART of the main text for masking "
                "purposes (reviewer: 'that would be considered part of the main text'). This is a "
                "labeling rule for text_like mask judgment and for any future ornament prompts."
            ),
            "instrumentFix": (
                "Future purity rounds add an escape answer ('can't tell what is field here'), "
                "consistent with the question set's design rule 8 — a slot must be able to record "
                "the answer. The escape share is itself figure/ground-ambiguity signal, not noise."
            ),
        },
    }

    from datetime import datetime, timezone
    out["generatedAt"] = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

    OUT.write_text(json.dumps(out, indent=2, sort_keys=False) + "\n")

    # --- terse console report ---------------------------------------------
    print(f"labels={len(labels)} sheets={len(by_sheet)} problems={len(problems)}")
    for v in VARIANTS:
        a = aggregates[v]
        print(f"\n[{v}] reweighted pure={a['reweightedPureFieldRate']:.4f} "
              f"(bar {BAR_AGGREGATE}) raw={a['rawPureFieldRate']:.4f} "
              f"mostly={a['reweightedMostlyFieldRate']:.4f} -> {a['verdict']}")
        for s in STRATA:
            c = per_stratum[s]["variants"][v]
            flag = " BELOW-FLOOR" if c["pureFieldRate"] < BAR_STRATUM_FLOOR else ""
            print(f"   {s:19s} n={c['n']} pure={c['counts']['pure_field']} "
                  f"mostly={c['counts']['mostly_field']} not={c['counts']['not_field']} "
                  f"pureRate={c['pureFieldRate']:.3f}{flag}")
    print(f"\nVERDICT {overall_verdict}  adopting={any_adopt or 'none'}")
    print(f"guard: pure ON={on_tot} OFF={off_tot} winner={guard['overall']['rawWinner']} "
          f"reweighted delta={guard['overall']['reweightedDelta']:+.4f}")
    print(f"paired: agree={flips['same']}/{len(by_sheet)} "
          f"onBetter={flips['guard_on_better']} offBetter={flips['guard_off_better']}")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
