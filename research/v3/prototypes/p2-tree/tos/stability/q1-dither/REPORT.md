# Q1 — where the `dither-lsb1` churn lives

**Worker G, cycle 2, 2026-08-04. Measurement only; nothing was fixed.** Pinned to commit
`4d7c9d89` (`tos/pipeline.ts` blob `99706e2b3e79`) — the state that produced
`data/robustness/reports/p2-tos.json` and the round-1 outcome. `pipeline.ts` and `candidate.ts` have
since been rewritten by sibling workers; `q1-dither/trace.ts` asserts its re-derivation of the role
stage against the pipeline's own published pools on every image, and 100 of 100 traces are clean, so
the pinned code is provably what ran. Re-running `collect.ts` against the current working tree
raises `TraceMismatch` on the first three covers, which is the intended failure.

## One correction to the brief

The brief says "the 34 covers where p2-tos disagreed". **34 is the agreement count** — `byPairType`
reads `agreed 34 / compared 100`. The disagreements list holds **66** dither covers. All 100 were
traced; the 66 are what is attributed below.

## Attribution of the 66 published failures

Both sides of every trial were re-run from the harness's own materialised PNGs, node sets matched by
centroid + area (default gate: 10% area ratio, 0.02 image-widths), and every published role colour
traced back to the node that supplied it.

| stage | what it means | covers | share |
|---|---|---|---|
| `c-winner` | both supplying nodes survived; the **ranking picked a different node** | 54 | 82% |
| `e-repair` | co-factor: `candidate.ts`'s walk moved the colour off the parse's first choice | 19 | 29% |
| `a-node-set` | the supplying node has no counterpart on the other side | 17 | 26% |
| `b-repr` | same region on both sides, **representative moved** past the bar | 10 | 15% |

Combinations (covers): `c` 26, `c+e` 13, `a` 7, `a+c` 7, `b` 4, `a+c+e` 3, `b+c` 3, `b+c+e` 2,
`b+e` 1. Role-level, `c-winner` is 35 accent + 31 foreground + 5 background + 5 surface; **58 of its
76 role failures are identity swaps in which *both* nodes' representatives held**. 62 of the 80
foreground/accent failures keep the **same pool rank** — rank 0 stays rank 0 and is a different
cluster.

## Per-stage rates over all 100 covers, all matched nodes

| quantity | rate | n |
|---|---|---|
| retained nodes unmatched (left / right) | 7.50% / 7.43% (Jaccard 0.861) | 71,132 / 71,080 |
| **representative moved past the bar, matched nodes** | **7.62% [7.42-7.82]** | 65,800 |
| ... by area: `<0.001` / `<0.005` / `<0.02` / `<0.1` / fields | 7.41 / 7.92 / 8.17 / 6.87 / 5.06 % | - |
| top-`MARK_NODE_LIMIT` mark survives into the other side's top-64 | 90.1% | 6,381 |
| ground-chain node survives on the other chain | 94.2% | 1,932 |
| ground-chain **length** changes | 69% | 100 |
| field/mark class flips across `FIELD_AREA_FRACTION` | 0.006% | 65,800 |
| field verdict changes | 11% | 100 |
| role-supplying node identity changes (bg / surf / fg / accent) | 13 / 17 / 35 / 48 % | 100 |
| parse-level role colour moves (bg / surf / fg / accent) | 12 / 11 / 35 / 45 % | 100 |

Matcher sensitivity: at the tight gate (2%, 0.005) Jaccard 0.775 and repr churn 6.27%; at the loose
gate (25%, 0.05) Jaccard 0.894 and repr churn 8.76%. The ordering of the stages is unchanged.

## What this says

**The round-1 note's suspect is the wrong one.** The SPEC's shared bar-density-mode representative
rule is charged with 15% of the failures. It contributes a real floor — 7.6% of *surviving* regions
change colour past the bar under a ±1-LSB dither — but that floor is **flat across area**, slightly
*lower* for the small nodes than for mid-sized ones and lowest of all for fields, so "small-node
churn" is not what the data shows either.

The instability is downstream, in the **role stage**: a mark population whose top-64 turns over at
10% and whose ground chain changes length on 69% of covers, feeding a lexicographic cluster ranking
that has no stability term at all. 82% of the failures are that ranking naming a different node
while the colours themselves stand still. That both families fired the falsifier is still consistent
with a shared cause — but the shared component to look at is *thinness-ranked mark clustering over a
truncated mark set*, not the colour-picking rule.

## Reproduce

```sh
NODE_NO_WARNINGS=1 node --experimental-strip-types prototypes/p2-tree/tos/stability/q1-dither/collect.ts
NODE_NO_WARNINGS=1 node --experimental-strip-types prototypes/p2-tree/tos/stability/q1-dither/attribute.ts
```

`out/traces.jsonl` (100 covers x 2 sides), `report.json` (rates + a row per failing cover).
