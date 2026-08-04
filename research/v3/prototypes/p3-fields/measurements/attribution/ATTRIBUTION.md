# Where the 0.2.0 disagreements are actually born

**Question.** The 0.2.0 tie bands were added at three *suspected* cliff sites and the all-four-role
flip count did not move (19 → 19 on the 150-trial smoke). Guessing had to stop. This file names, for
every disagreeing pair in `../robustness-p3-fields-0.2.0-smoke150.json`, the **first** stage of the
decision chain at which the two sides of the pair stop agreeing — measured, not inferred.

## What produced these numbers

| | |
|---|---|
| source report | `../robustness-p3-fields-0.2.0-smoke150.json` — 150 trials, 122 disagreeing, 0 errored, `barMode: regional`, written 2026-08-04T18:08:06Z |
| candidate | `p3-fields-0.2.0` (`src/candidate.ts`), working tree with the `P3_DIAG` instrumentation applied |
| pairs | `pairs.json` — 122 pairs, 186 distinct images (`collect.ts`) |
| decision chains | one JSON per image path, written by `src/diagnostics.ts` under `P3_DIAG`; run over `paths.txt`, 186 ok / 0 failed, `--no-cache` |
| attribution | `attribute.ts` → `attribution-k3.json`, 122 rows, **0 `MISSING-DIAGNOSTIC`** |
| tables below | `summarise.ts attribution-k3.json` |

**Divergence is defined over discrete outcomes only.** Almost every *continuous* quantity in the
chain differs between a cover and its re-encode — the edge count moves, the field-set size moves,
every ρ moves in the fourth decimal. A table built on "differs" would say `edges` 122 times and
explain nothing. So a stage counts as diverging only when a boolean, a label, a rank cursor, or a
*pixel colour judged by the contract's own regional same-colour bar* disagrees — the same ruler the
robustness harness calls a disagreement with. Continuous quantities travel with each row as
evidence, never as the verdict.

**A stage is credited only when every stage above it agreed.** `fg-cascade` therefore means: the
field ends, the gradient, the regime, the band and the cursor all agreed, *and* the cascade over the
top-τ window still landed on a different colour. That is the 0.2.0 hypothesis, stated as a countable
thing.

## Stage × arm, first divergence

| stage | total | all-four flips | dither-lsb1 | jpeg-q75 | jpeg-q85 | jpeg-q92 |
|---|---|---|---|---|---|---|
| `e1-colour` | 68 | 17 | 14 | 20 | 21 | 13 |
| `fg-cascade` | 13 | 0 | 2 | 3 | 4 | 4 |
| `e2-colour` | 11 | 2 | 3 | 1 | 3 | 4 |
| `accent-cascade` | 5 | 0 | 3 | 1 | 0 | 1 |
| `gradient-flag` | 4 | 0 | 2 | 1 | 1 | 0 |
| `prevalence-order` | 4 | 0 | 2 | 1 | 0 | 1 |
| `fg-cursor` | 4 | 0 | 0 | 1 | 2 | 1 |
| `ends-step` | 4 | 0 | 0 | 2 | 1 | 1 |
| `accent-cursor` | 3 | 0 | 1 | 0 | 0 | 2 |
| `fg-regime` | 3 | 0 | 0 | 1 | 1 | 1 |
| `fg-band` | 1 | 0 | 0 | 0 | 1 | 0 |
| `accent-collapse` | 1 | 0 | 0 | 0 | 0 | 1 |
| `guide-stops` | 1 | 0 | 0 | 0 | 1 | 0 |

**122 rows, 19 all-four flips.** Rows per arm: jpeg-q85 35, jpeg-q75 31, jpeg-q92 29, dither-lsb1 27.
Stages never reached by any pair (`escape`, `ends-collapsed`, `gradient-geometry`, `fg-band-rule`,
`accent-tier`) are omitted; so is `none-of-the-above`, which fired 0 times — every disagreement the
harness saw is explained by a discrete stage in this chain.

### What the table says

- **The field ends are the instability, not the cascade.** `e1-colour` + `e2-colour` +
  `prevalence-order` + `ends-step` = **87 of 122 (71.3 %)**. The whole foreground block is 21, the
  whole accent block 9, the gradient block 5.
- **`e1-colour` owns the catastrophes.** 17 of the 19 all-four-role flips are born there; two more
  at `e2-colour`; **zero** at `fg-cascade`. When e₁ moves, everything downstream is re-anchored, so
  a single rank slip publishes four different colours.
- **The 0.2.0 tie bands were aimed at the wrong stages.** They sit at `prevalence-order` (4 rows),
  `fg-band` (1 row) and the regime margin (`fg-regime`, 3 rows) — 8 rows of 122 between them. That
  is why the all-four count did not move: the bands cannot reach the stage that produces the
  all-four flips.
- **No arm is qualitatively different.** `e1-colour` is the top stage in all four arms
  (dither-lsb1 14/27, jpeg-q75 20/31, jpeg-q85 21/35, jpeg-q92 13/29). The invisible LSB dither
  breaks the ends as readily as q75 does, which is the fact that rules out "JPEG ringing" as the
  story.

## Three examples each, top three stages

### `e1-colour` (68)

- `00009a5acf9fb19544298ce4` / `dither-lsb1` — `ends.e1Hex` `#000000` → `#fcfcfd` (ΔOKLab 0.991);
  published accent `#ffffff` → `#000000` (ΔOKLab 1.000), roles moved background+surface+foreground+accent;
  edge fraction 37.90 % → 88.50 %
- `000606d3a5c7da73c3887268` / `dither-lsb1` — `ends.e1Hex` `#000000` → `#070110` (ΔOKLab 0.116);
  published background `#000000` → `#fefbe9` (ΔOKLab 0.986), roles moved background+surface+foreground+accent;
  edge fraction 60.59 % → 65.36 %
- `000442caec7ec8cb724bf265` / `jpeg-q75` — `ends.e1Hex` `#028014` → `#aefe5f` (ΔOKLab 0.397);
  published background `#cafa58` → `#0f0d0e` (ΔOKLab 0.784), roles moved background+surface+foreground+accent;
  edge fraction 99.51 % → 85.98 %

Note the second row: an e₁ move of 0.116 — small, but past the bar — publishes a background move of
0.986. The chain amplifies; it does not damp.

### `fg-cascade` (13)

- `00066a61bbcbeadd632f7f38` / `jpeg-q85` — `foreground.hex` `#db3589` → `#ed3690` (ΔOKLab 0.036);
  published accent `#f7f9f8` → `#c61f71` (ΔOKLab 0.480), roles moved foreground+accent;
  edge fraction 43.08 % → 49.21 %
- `00015083990110d3b1a4ea8a` / `jpeg-q85` — `foreground.hex` `#b593cf` → `#a98ba5` (ΔOKLab 0.065);
  published accent `#977ba4` → `#53212d` (ΔOKLab 0.306), roles moved foreground+accent;
  edge fraction 94.85 % → 97.69 %
- `00034b60105d8937440211da` / `jpeg-q85` — `foreground.hex` `#603c30` → `#b4976d` (ΔOKLab 0.300);
  published foreground `#603c30` → `#b4976d` (ΔOKLab 0.300), roles moved foreground;
  edge fraction 41.63 % → 52.52 %

The 13 `fg-cascade` rows have published worst-role movements of 0.016–0.480 OKLab, median 0.054. They
are real disagreements and they are *small* ones; none is an all-four flip.

### `e2-colour` (11)

- `0003a265ad51246f00035a87` / `jpeg-q85` — `ends.e2Hex` `#040300` → `#020200` (ΔOKLab 0.015);
  published surface `#fefefe` → `#020200` (ΔOKLab 0.915), roles moved background+surface+accent;
  edge fraction 81.08 % → 85.80 %
- `0003a265ad51246f00035a87` / `jpeg-q75` — `ends.e2Hex` `#040300` → `#020200` (ΔOKLab 0.015);
  published surface `#fefefe` → `#020200` (ΔOKLab 0.915), roles moved background+surface+accent;
  edge fraction 81.08 % → 83.03 %
- `0005a54a9ea60f48619788f1` / `jpeg-q85` — `ends.e2Hex` `#680102` → `#760001` (ΔOKLab 0.033);
  published foreground `#fffefb` → `#690b0b` (ΔOKLab 0.674), roles moved background+surface+foreground+accent;
  edge fraction 10.18 % → 11.41 %

The first two rows are the same artwork under two arms: an e₂ move of **0.015 OKLab** — near the
floor of what the bar can see — flips the published surface by **0.915**. The bar is not the problem;
the role assignment downstream of e₂ is a step function of it.

## What actually moved inside `e1-colour` (68 rows)

e₁ is the rank-(1−τ) pixel of OKLab distance *from the field's own cascade pixel m*. A divergence
there is therefore one of two different facts, and the diagnostics separate them:

| quantity | value |
|---|---|
| e₁ movement ΔOKLab | p10 0.021, median 0.065, p90 0.445, **max 1.000** |
| e₁ rows over 0.5 OKLab | 5 |
| e₁ rows that are all-four flips | 17 |
| the cascade pixel *m* also moved (by the bar) | **32 of 68** |
| *m* held; only the rank moved under it | **36 of 68** |
| ends *also* stepped differently (`endsStep`) | 14 of 68 — two candidate causes, credited to the colour because the stage order tests it first |
| \|Δ\| of the (1−τ) rank's own distance value | median 0.0268, max 0.4082 |
| field-set size drift \|Δ\|/left | median 5.5 %, **max 2789.9 %** |
| published worst-role movement on these rows | median 0.213, p90 0.662, max 1.000 OKLab |

Reading: **the instability is roughly half a moving anchor and half a moving rank.** In 36 of 68 the
field's cascade pixel is the same colour on both sides and the rank-(1−τ) pixel is still a different
colour — that is the order statistic itself being unstable, which is the property the discipline line
claims order statistics have *and* the paradigm's structural robustness claim in its purest testable
form. In the other 32 the anchor moved first. The field-set drift number (max 2789 %, i.e. the
depth-quantile population changing by 28×) says the input to both is not a stable population.

## Bimodal probe — ten worst disagreements

**Hypothesis under test.** If the top-τ window's L-distribution is *bimodal*, the cascade (iterated
medians restricted to attaining pixels) is choosing between two clusters, and an invisible
perturbation can tip it from one to the other. That would make the flips a property of the
population, not of the arithmetic.

**Instrument.** `foreground.topTauDeciles` — the eleven nearest-rank deciles of the L values in the
top-τ window, recorded for both sides of every pair. Bimodality is scored by scalar arithmetic only:
`ratio = largest adjacent-decile gap / (decile₁₀ − decile₀)`. Whether the cascade landed on opposite
sides of that gap is `(L_left < mid) ≠ (L_right < mid)` where `mid` is the gap's midpoint.

**The one declared threshold.** `GAP_RATIO` = **0.25** — `[UNCALIBRATED]`, chosen in `summarise.ts`
on the arithmetic that a uniform population puts ≈ 0.10 of its spread between adjacent deciles, so
0.25 is 2.5× the flat expectation. It is a reading convention for this probe, quoted with the raw
ratios beside it in every row, and nothing in the prototype consumes it.

| # | artwork | arm | stage | worst move | top-τ n (L/R) | gap/spread (L) | gap/spread (R) | fg L (L→R) | crossed the gap |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `00009a5acf9f` | dither-lsb1 | `e1-colour` | 1.000 | 284/101 | 1.00 | 0.99 | 1.000→0.982 | no (bimodal) |
| 2 | `000606d3a5c7` | dither-lsb1 | `e1-colour` | 0.986 | 685/6272 | 0.24 | 0.24 | 0.252→0.710 | yes |
| 3 | `0003a265ad51` | jpeg-q85 | `e2-colour` | 0.915 | 744/571 | 0.17 | 0.18 | 0.725→0.721 | no |
| 4 | `0003a265ad51` | jpeg-q75 | `e2-colour` | 0.915 | 744/685 | 0.17 | 0.28 | 0.725→0.729 | no (bimodal) |
| 5 | `0003a265ad51` | dither-lsb1 | `prevalence-order` | 0.901 | 744/673 | 0.17 | 0.16 | 0.725→0.723 | no |
| 6 | `000442caec7e` | jpeg-q75 | `e1-colour` | 0.784 | 75/2598 | 0.20 | 0.67 | 0.734→0.759 | no (bimodal) |
| 7 | `0002d9c78b43` | jpeg-q85 | `e1-colour` | 0.774 | 358/471 | 0.40 | 0.23 | 0.229→0.997 | yes (bimodal) |
| 8 | `0002d9c78b43` | jpeg-q92 | `e1-colour` | 0.772 | 358/353 | 0.40 | 0.83 | 0.229→0.996 | yes (bimodal) |
| 9 | `00038e79a0ef` | dither-lsb1 | `e1-colour` | 0.679 | 168/69 | 0.31 | 0.42 | 0.820→0.830 | no (bimodal) |
| 10 | `0005a54a9ea6` | jpeg-q85 | `e2-colour` | 0.674 | 230/661 | 0.18 | 0.72 | 0.997→0.335 | yes (bimodal) |

*The ten worst **pairs** cover **7 distinct artworks** — `0003a265ad51` appears three times and
`0002d9c78b43` twice, once per arm. Ranking by pair, not by cover, is what "worst disagreement"
means in a robustness report; the repetition is reported rather than de-duplicated because the same
cover failing under three independent perturbations is itself the finding.*

### Verdict

> **3 of 10 explained.** Of the ten worst pairs, **7** have a top-τ population that is bimodal by
> this test on at least one side; of those, **3** also have the foreground cascade landing on
> opposite sides of the gap. **3 / 10 tested.**

And the qualifier that matters more than the ratio:

- **The hypothesis is aimed at the wrong stage.** Not one of the ten worst pairs is attributed to
  `fg-cascade` — they are 6 `e1-colour`, 3 `e2-colour`, 1 `prevalence-order`. In every one of these
  the foreground cascade is *downstream of an already-diverged anchor*, so "the cascade crossed a
  gap" is a description of the consequence, not the cause.
- **Tested where it actually applies, it explains almost nothing.** Of the 13 pairs whose first
  divergence *is* `fg-cascade`: **9 are bimodal, 1 has the cascade crossing the gap. 1 / 13.**
- **Bimodality is the normal case, so it is weak as a discriminator.** Over all 122 disagreeing
  pairs, **98 are bimodal** by this test and **15** have the cascade crossing. A property held by
  80 % of the population cannot separate the 12 % that flip.

**Conclusion: the bimodal-cascade hypothesis is not the mechanism of the 0.2.0 instability.** The
mechanism named by the attribution table is the **field ends** — e₁ and e₂, rank-(1−τ) pixels of a
distance field whose population (the depth-quantile field set) is itself drifting by up to 28× under
invisible perturbation. Any next iteration that does not touch the ends is tuning downstream of the
break.

## Diagnostics no-op proof

The discipline line requires that published output be byte-identical with diagnostics on and off.
Checked, not asserted, in both directions:

| check | result |
|---|---|
| demo-20, `P3_DIAG` **unset** vs `P3_DIAG` **set** (both `--no-cache`, 20/20 ok) | `deterministicPart` of all 20 rows serialised: **24 070 bytes vs 24 070 bytes, identical; first differing row index −1** |
| same check at `P3_EDGE_RANK=5` | **0 of 20 palettes differ** |
| the `medianHex` / `e1DistanceFromMedian` fields added to the chain after the first diagnostic sweep | re-ran all 186 attribution images: **0 of 186 published palettes differ** from the earlier sweep |
| pinned-code check (`../../review-rounds/round-1-calibration/verify-pinned-code.ts`) | all 20 demo-20 rows reproduce under `cb760d7` with the working-tree diagnostics present — covers the diagnostics-off direction against committed code |

**Answer: yes.** Published output is byte-identical with diagnostics on and off, at both k = 3 and
k = 5.

## Line tensions, reported not smoothed

1. **An earlier version of `attribution-k3.json` carried three columns that were silently
   `undefined`** (`medianHex`, `e1DistanceFromMedian`, `fieldSet.size`), because the diagnostic
   sweep predated those fields in `pipeline.ts` and `attribute.ts`'s `?? 0` fallbacks turned missing
   data into zeros. That file's console said *"the field's own cascade pixel m held in 68 of 68"* and
   *"field-set drift median 0.0 %, max 0.0 %"*. Both were artefacts. The corrected numbers — 36 of 68
   held, drift max 2789.9 % — are in this file, and the JSON has been regenerated from a fresh sweep.
   The failure mode is worth naming: **`?? 0` on a diagnostic field converts a missing measurement
   into a confident finding.**
2. **`GAP_RATIO = 0.25` is uncalibrated and load-bearing for one sentence only** (the "7 of 10
   bimodal" count). Every raw ratio is printed beside it so a reader can move the line; the verdict
   above does not depend on it, because it rests on *which stage* the flips are attributed to.
3. **`e1-colour` rows where `endsStep` also differs (14 of 68) have two candidate causes.** The stage
   order tests the colour before the step, so they are credited to the colour. Credited the other
   way, `e1-colour` would be 54 and `ends-step` 18; the ends block is 87 either way.
4. **The 122 pairs are the disagreeing subset of 150 trials on one smoke sample**, not the 600-trial
   0.1.0 sweep. Counts here are not comparable to `../BASELINE.md`'s.
