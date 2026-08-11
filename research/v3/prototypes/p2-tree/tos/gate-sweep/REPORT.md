# The coverage gate — sweeping `UNREADABLE_COVERAGE_FRACTION` (D13.2)

**Worker M, cycle 4, 2026-08-11. Measurement only; no constant was changed.** Pinned to commit
`9aab5f28`, run through `pin.sh`; `report.json.pin.clean` is `true`, meaning the git blob id of
every file the measurement depends on — `pipeline.ts`, `tree.ts`, `constants.ts`, `candidate.ts`,
`roles/{indifference,rank}.ts`, W-G's `labels.ts`, `src/adjudication/evidence.ts` — was re-derived
from the bytes that actually executed and matched the pin. 232 covers ran, 0 unrunnable.

The grid is arithmetic over `out/geometry.jsonl`, not 13 re-runs: `collect.ts` reproduces the
pipeline's own `laminarity` to the bit on all 232 covers, and `sweep.ts` refuses to report unless the
current gate reproduces the pipeline's own verdict **and its published field pair** on every one.
That second assertion caught a real defect in the first draft — the twin collapse (`pipeline.ts`
993-1001) runs after the field pair is chosen, and four covers' "published" pair was a fiction
without it. The two laminarity constants are held at 0.15 / 0.8 by D13.1.

## W-G's ceiling reproduces exactly, at the new pin

93 of 144 labelled covers gated out, **52 of 68 legacy ramps**, agreement 45.8%, confusion
8 / 18 / 60 / 58. Identical to Q2's numbers taken at `4d7c9d89`, so nothing between the two pins
moved this gate.

## The ceiling curve, and the agreement curve that ignores it

| gate | pass/144 | **ceiling** | agreement (n=144) | among passing | ramp recall | phantom | false-unreadable | census `unreadable` |
|---|---|---|---|---|---|---|---|---|
| 0 | 144 | **1.000** | 47.2% | 47.2% | 47.1% | 55.6% | 0.0% | 0/60 |
| 0.05 | 143 | **1.000** | 47.2% | 46.9% | 47.1% | 55.6% | 0.7% | 0/60 |
| 0.10 | 142 | **1.000** | 47.2% | 46.5% | 47.1% | 55.6% | 1.4% | 0/60 |
| 0.15 | 141 | **1.000** | 47.9% | 46.8% | 47.1% | 54.9% | 2.1% | 2/60 |
| **0.20** | 138 | **1.000** | 48.6% | 46.4% | 47.1% | 54.3% | 4.2% | 2/60 |
| **0.25** | 119 | 0.931 | **49.3%** | 47.1% | 41.2% | 54.1% | 17.4% | 9/60 |
| 0.30 | 105 | 0.875 | 47.9% | 45.7% | 32.4% | 56.9% | 27.1% | 14/60 |
| 0.35 | 90 | 0.813 | 45.8% | 43.3% | 25.0% | 61.4% | 37.5% | 21/60 |
| 0.40 | 78 | 0.743 | 43.8% | 43.6% | 17.6% | 67.6% | 45.8% | 31/60 |
| 0.45 | 63 | 0.681 | 43.8% | 44.4% | 13.2% | 71.0% | 56.3% | 33/60 |
| **0.50 shipped** | 51 | **0.639** | 45.8% | 49.0% | **11.8%** | 69.2% | **64.6%** | 39/60 |
| 0.55 | 42 | 0.604 | 45.1% | 47.6% | 7.4% | 76.2% | 70.8% | 45/60 |
| 0.60 | 36 | 0.576 | 43.8% | 44.4% | 2.9% | 88.2% | 75.0% | 48/60 |

*Ceiling* = the best agreement any laminarity constants could reach behind that gate: a gated-out
cover publishes `gradient: false`, so a gated-out flat agrees for free and a gated-out ramp is an
error the laminarity stage cannot see. **The ceiling saturates at 1.000 by gate 0.20** — no legacy
ramp has coverage below 0.208 — and costs only 6 of 144 covers to get there. *False-unreadable* =
labelled covers published `unreadable`; the label is a v2-3 human's record of what the artwork's
field *was*, so it is evidence (not proof) that the field was readable. *Census* = demo-20 ∪
`round-3-quality/fresh-40.txt`, 60 covers, 59 of them unlabelled.

**Lifting the ceiling from 63.9% to 100% moves agreement by 2.8 points, from 45.8% to 48.6%.** The
whole curve lives in 43.8%–49.3%; every Wilson interval contains the majority-class baseline (52.8%,
always say "flat") and **no cell of the grid reaches it.** What the gate does move is *recall*: it
suppresses 88% of the legacy ramps (11.8% recall at 0.5, 47.1% at 0.2). Opening it finds four times
as many real ramps and roughly as many new phantoms, so net agreement stands still.

## What the gate excludes at 0.5

93 covers, coverage min 0.048 / median 0.324 / mean 0.329 / max 0.496 — a broad mass just under the
cut, not a tail: 27 of them sit in [0.40, 0.50) and 39 in [0.20, 0.30). Passing covers run
0.502–0.944, median 0.661. **The distribution is bimodal about the gate, and the gate sits in the
gap** — which is why 0.45 and 0.4 buy so little and 0.25 buys so much.

Exclusion tracks the label: **ramps 52/68 = 76.5% [65.1–85.0] gated out vs flats 41/76 = 53.9%
[42.8–64.7]**, Fisher 2x2 [52 16 / 41 35] p=0.0054, odds ratio 2.77. Ramps are gated out
disproportionately, as W-G said, and this is the one association in the study with a small p-value.

Released, the 93 land as **46 laminar / 47 partitioned**, and none as flat or textured. Split by
label the laminarity stage calls 24/52 = 46.2% [33.3–59.5] of the ramps laminar and 22/41 = 53.7%
[38.7–67.9] of the flats — *descriptive, no test run*: the intervals overlap almost entirely. **The
covers the gate hides are ones the laminarity stage cannot sort.**

## Candidate operating points

Chosen by rules declared in `constants.ts` before the grid ran, except where marked. `best-agreement`
selected gate 0.25 and de-duplicated into `ceiling-90`. Flip lists are set files under `out/`.

| point | gate | ceiling | agreement | flips (232 covers) | verdict moved | **field pair moved** | gradient moved | labelled |
|---|---|---|---|---|---|---|---|---|
| current | 0.50 | 0.639 | 45.8% | 0 | 0 | 0 | 0 | 0 |
| **ceiling-90** = best-agreement | 0.25 | 0.931 | 49.3% | 118 | 118 | 78 | 58 | 68 |
| ceiling-saturation *(post-hoc)* | 0.20 | 1.000 | 48.6% | 147 | 147 | 98 | 73 | 87 |
| no-gate | 0 | 1.000 | 47.2% | 155 | 155 | 102 | 76 | 93 |

`textured` and `unreadable` share one role branch, so a cover moving between them publishes the same
two colours — which is why "field pair moved" is two thirds of "verdict moved" and is the column a
round should be built on. On the census, `unreadable` falls 39/60 → 9/60 → 2/60 → 0/60 and published
gradients rise 7/60 → 23/60 → 26/60 → 27/60.

## Holm verdict: 0 survivors, both families

Two families, each declared before the grid ran and each corrected over all 13 cells.

- **vs. the majority-class baseline** (exact binomial, one-sided, direction fixed in `constants.ts`):
  best cell gate=0.25, raw p=0.8208, Holm p=1.0000. **0 of 13 survive at alpha=0.05.**
- **paired against the shipped 0.5** on the same 144 covers (McNemar exact, one-sided): best cell
  gate=0.25, 20 vs 15 discordant, raw p=0.2498, Holm p=1.0000. **0 of 13 survive.**

**No gate on this grid can be adopted as pure measurement on agreement evidence.** W-G's Q2 lesson
holds one level up: the labels do not price this constant either.

## What each point would need

1. **The counts are not the statistics.** "No legacy ramp has coverage below 0.208", "93 of 144
   covers with a recorded human reading of their field are published `unreadable`", and "the gate
   suppresses 88% of legacy ramps" are exact counts over the whole labelled corpus, not estimates,
   and they do not need a p-value. If D13.2's question is *"is 0.5 defensible as written?"*, the
   answer is available now and is no: the constant's own docstring claims arm-b′ §2.5's "a small
   fraction", and 0.5 discards 64.6% of the labelled corpus and two thirds of the census.
2. **What agreement cannot decide, a readability round can.** The label answers "was this a ramp",
   which is the laminarity stage's question, not the gate's. The gate's question is "is this field
   readable at all", and nothing in the repository has ever asked it. A round that shows a
   gated-out cover's shipped `unreadable` fallback pair against its ungated field pair and asks which
   reads the artwork tests the gate directly, on the 78–98 covers whose *published colours* actually
   move.
3. **Item counts, at alpha=0.05 / power 0.80 against a 50% null:** 13 items for an 85% effect,
   18 for 80%, 23 for 75%, 37 for 70%. Round 2 escaped at 3/8 = 37.5% `cant_tell`, so multiply by
   1.6: **≈37 served items for a 75% effect, ≈59 for 70%.** Paired (same cover, two pairs) the n is
   discordant pairs, not items.
4. **What is not worth a round:** separating gated-out ramps from gated-out flats by whether the
   laminarity stage calls them laminar. The observed split is 46.2% vs 53.7%; powering that
   difference needs ~979 items. That door is closed by measurement.

## Reproduce

```sh
sh research/v3/prototypes/p2-tree/tos/gate-sweep/pin.sh collect.ts
sh research/v3/prototypes/p2-tree/tos/gate-sweep/pin.sh sweep.ts
```

`out/geometry.jsonl` (232 covers), `out/labels.json`, `out/curve.txt`, `out/flips-*.txt`,
`report.json` (all 13 cells, both multiplicity blocks, the exclusion characterisation, per-cover
flip detail).
