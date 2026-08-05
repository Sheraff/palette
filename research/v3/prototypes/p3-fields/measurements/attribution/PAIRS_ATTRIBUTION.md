# Where the 0.3.0 **rendition-pair** disagreements are born

**Question.** 0.3.0's full robustness sweep improved every perturbation arm and *regressed the
rendition pairs*: agreement 14.5 % → 9.0 %, and 54 of the 88 remaining all-four-role flips are pair
flips. Every attribution pass before this one — `ATTRIBUTION.md`, `attribution-0.3.0.json`,
`K_DECISION.md` — ran on the perturbation arms only. Nobody has ever looked at a pair. This file
looks.

**Answer in one line: the hypothesis is REFUTED as a mechanism and confirmed as a site.** The floor is
the first divergence of 16 of 84 selected pairs and owns 10 of the 54 all-four flips, its units are
resolution-coupled exactly as predicted (slope +0.874), and re-expressing it scale-free changes pair
agreement by **nothing at all** — 9.0 % → 9.0 %, 54 → 55 all-four flips. `e1-colour` owns 43 of the 54
flips, and the site actually driving it is the one nobody declared: the **fixed-scale k = 3 edge
neighbourhood**, whose edge fraction is resolution-coupled at slope −0.212 and drifts twice as much
between renditions as under a JPEG re-encode.

**Prime hypothesis under test (not assumed).** 0.3.0 introduced `DEGENERATE_DEPTH_FLOOR_PX = 1`, an
absolute pixel-scale rule that takes a declared exemption from `CONVENTIONS.md`'s scale-free default
and fires on 94 of 220 coverage artworks. Rendition pairs differ in **resolution** — 172 of the 200
pairs in `pair-set-1` do — so the β-quantile depth compared against a 1-pixel floor could fire on one
rendition and not the other, switching F's whole membership rule between the two sides of a pair.

---

## 1. What produced these numbers

| | |
|---|---|
| source report | `../robustness-p3-fields-0.3.0.json` — 600 trials, `barMode: regional`, written 2026-08-04T22:26:52Z |
| pairs in it | 200 compared, **18 agreed (9.0 %)**, 182 disagreeing, **54 all-four-role** |
| selection | `pairs-select.ts` → `pairs-selected-0.3.0.json` (84 pairs), `perturb-selected-0.3.0.json` (20 trials) |
| decision chains | `src/diagnostics.ts` under `P3_DIAG`, `data/devloop/p3-diag-pairs-0.3.0`, **193 / 193 images, 0 failed** |
| attribution | `pairs-attribute.ts` → `pairs-attribution-0.3.0.json`, 84 + 20 rows, **0 `MISSING-DIAGNOSTIC`** |
| candidate | `p3-fields-0.3.0` (`src/candidate.ts`), working tree; output-neutrality proved in §9 |

### The selection rule, so it is reproducible without the script

- **Census** — all **54** all-four-role pair disagreements. No sampling.
- **Sample** — **30** of the remaining 128, stratified by roles-moved, largest-remainder allocation
  (1-role 28 → 6, 2-role 46 → 11, 3-role 54 → 13), taken at evenly spaced ranks
  `round(i·(n−1)/(k−1))` of each stratum sorted by `trialId`. No RNG, no seed.
- **Perturbation control** — **20** perturbation disagreements, 5 per arm, same evenly-spaced rank
  rule. These are same-resolution by construction, which is what makes them the control.

Because the all-four stratum is a census and the rest is a 30-of-128 draw, raw counts over the 84
rows over-represent flips by construction. Every table below therefore carries **both** the raw count
and the count **projected onto all 182 disagreeing pairs** (weight = stratum size ÷ rows drawn; the
all-four column is exact, the rest are estimates).

### Divergence is a discrete outcome, never "differs"

Same definition and the same regional same-colour bar as `ATTRIBUTION.md`: a stage counts as
diverging only when a boolean, a label, a rank cursor, or a published pixel colour judged by the
contract's own bar disagrees. Continuous quantities travel with the row as evidence, never as the
verdict. A stage is credited only when every stage above it agreed.

**One stage is new.** `field-rule` — *which membership rule built F* — is a discrete label 0.3.0
introduced and the earlier passes never had. It is placed where the pipeline decides it: after
`escape`, above every colour. §4 reports what the table looks like credited the other way.

---

## 2. What the pair regression is actually made of

Before attributing it, it is worth seeing what moved. The pair block of both full sweeps, by how many
roles the pair disagreed on:

| roles moved | 0.1.0 | 0.3.0 | change |
|---|---|---|---|
| 0 (**agreed**) | **29** | **18** | **−11** |
| 1 | 19 | 28 | +9 |
| 2 | 39 | 46 | +7 |
| 3 | 49 | 54 | +5 |
| 4 (**all-four**) | **64** | **54** | **−10** |

**The all-four pair flips went *down*, 64 → 54 (−15.6 %).** The 14.5 % → 9.0 % agreement regression is
made entirely of pairs that used to agree on all four roles and now disagree on one, two or three.
Both facts in the brief are true and they point in opposite directions: 0.3.0 traded eleven exact
agreements for ten fewer catastrophes. Nothing below changes that arithmetic; it is context for how
much a fix to the catastrophe path can be expected to buy.

## 3. First-divergence stage × count

| stage | rows (of 84) | projected (of 182) | all-four (of 54) |
|---|---|---|---|
| `field-rule` | 16 | 35.0 | **10** |
| `e1-colour` | 51 | 76.3 | **43** |
| `e2-colour` | 3 | 12.5 | 0 |
| `fg-cascade` | 4 | 17.2 | 0 |
| `fg-cursor` | 3 | 13.5 | 0 |
| `accent-cascade` | 2 | 9.3 | 0 |
| `accent-cursor` | 1 | 4.7 | 0 |
| `ends-collapsed` | 1 | 4.2 | 0 |
| `gradient-flag` | 1 | 4.2 | 0 |
| `fg-regime` | 1 | 4.2 | 0 |
| `prevalence-order` | 1 | 1.0 | **1** |

Stages never reached by a pair (`escape`, `ends-step`, `gradient-geometry`, `guide-stops`,
`fg-band`, `fg-band-rule`, `accent-collapse`, `accent-tier`) are omitted, and so is
`none-of-the-above`, which fired **0** times: every pair disagreement is explained by a discrete
stage in this chain.

**The ends still own the catastrophes.** `e1-colour` is 43 of the 54 all-four flips (79.6 %) —
the same finding the perturbation arms gave at 0.2.0, unmoved by everything 0.3.0 did. The field
ends are 44 of 54 (81.5 %) with `prevalence-order`; the whole foreground block is 0, the whole
accent block is 0.

---

## 4. THE CROSS-TAB — degenerate rule firing × all-four flip

| firing | all-four | not all-four | total | all-four share |
|---|---|---|---|---|
| **one-side-only** | **10** | 6 | 16 | 62.5 % |
| **both** | 18 | 2 | 20 | 90.0 % |
| **neither** | 26 | 22 | 48 | 54.2 % |

Projected onto all 182 disagreeing pairs:

| firing | all-four | not all-four | total |
|---|---|---|---|
| one-side-only | 10 | 25.0 | 35.0 |
| both | 18 | 8.4 | 26.4 |
| neither | 26 | 94.7 | 120.7 |

**The base rate is 54 of 84 = 64.3 % in the selection.** The one-side-only cell sits at 62.5 % —
*at* the base rate, not above it. The cell that is actually enriched is **both sides fired**: 18 of
20 rows there are all-four flips (90.0 %). So the degenerate fallback is associated with flips
mostly when it fires on **both** renditions, i.e. on artwork where the depth field carries no
information at all, and not distinctively when it fires asymmetrically.

**Every one-side-only row is a `field-rule` first divergence, and no other row is.** The
`stage × firing` table is perfectly separated: `field-rule` 16/16 one-side-only; `e1-colour` 31
neither + 20 both; every other stage neither. So the rule flip and the stage credit are the same
16 pairs, which makes the hypothesis's own claim countable without ambiguity: **the
degenerate-depth floor is the first divergence of 16 of 84 selected pairs (≈ 35 of 182 projected)
and owns 10 of the 54 all-four pair flips — 18.5 %.**

### Credited the other way

`field-rule` sits above `e1-colour` in the chain, so it takes rows that would otherwise be credited
to the ends. Of the 16 `field-rule` rows, **14 also diverge at `e1-colour`**, 1 at `e2-colour`, and
**1 has both ends agreeing**. Of the 10 all-four `field-rule` rows, **9 also diverge at `e1`**.
Credited the other way — ends first, rule second — the table would read `e1-colour` 65,
`e2-colour` 4, `field-rule` 1. The ends block is 44+ of the all-four flips either way.

Crediting the rule first is the causally right order (F is the population the ends are ranks over,
so a rule flip is upstream of an end flip), but the reader is owed the number: **9 of the 10
all-four flips attributed to the floor also have a diverged e₁, so "the floor caused them" is an
upstream-credit claim, not an isolated one.** §6 tests it by intervention instead.

---

## 5. VERDICT ON THE PRIME HYPOTHESIS — **REFUTED as a mechanism, partially confirmed as a site**

The hypothesis has two parts. They come apart.

### (a) "The floor fires one-side-only and that switches the whole F rule" — **TRUE, and it costs 10 of 54 flips**

16 of 84 selected pairs, ≈ 35 of 182 projected, 10 of 54 all-four flips. This is a real,
previously unattributed cause, and it did not exist before 0.3.0. When it fires one-side-only the
field-set size fraction moves between the two renditions by a median **0.291 log units** (≈ 34 %,
against a median 0.063 over all 84 pairs) — the ends on the two sides are ranks over materially
different populations.

### (b) "The cause of the asymmetry is the absolute pixel scale" — **FALSE**

Five measurements. The first two confirm the hypothesis's *diagnosis of the units*; the last three
refute the *conclusion drawn from it*.

**1. The pixel-scale quantity is resolution-coupled — as predicted.** Regressing
`log(scalar_left / scalar_right)` on `log(longEdge_left / longEdge_right)` over the 84 pairs:

| scalar | n | correlation | slope |
|---|---|---|---|
| β-quantile depth **in pixels** | 63 | +0.487 | **+0.874** |
| β-quantile depth **as a fraction of the long edge** | 63 | −0.080 | −0.126 |
| edge fraction | 84 | −0.403 | −0.212 |
| field-set size fraction | 84 | −0.258 | −0.401 |

A slope of +0.874 says the β-quantile depth *in pixels* is very nearly proportional to the pixel
grid: double the resolution and it roughly doubles. Compared against a constant 1 px, that is a
comparison against resolution. The fraction form has slope −0.126 and correlation −0.08 — no
systematic resolution coupling at all. **The hypothesis's diagnosis of the units is correct.**

**2. And the direction of firing follows it.** Of the 16 one-side-only pairs, the fallback fires on
the **lower-resolution** side 11 times, the higher-resolution side 4 times, and 1 pair is
same-resolution. That is the predicted bias, at 11:4.

**3. But re-expressing the floor scale-free does not remove the asymmetry.** Applying both rules to
the 84 pairs' recorded thresholds — no re-run needed, the counterfactual is arithmetic on the chains:

| rule | pairs where the two sides take different membership rules |
|---|---|
| `depth · longEdge ≤ 1 px` (shipped) | **16** |
| `depth ≤ 1/320` (count-preserving scale-free) | **17** |

**The scale-free form is not better. It is one row worse.** The reason is in the stability numbers:
the β-quantile depth drifts between renditions by a **median 0.34 log units in fraction form and
0.46 in pixel form** (n = 63 pairs where both sides are non-zero) — and it drifts by **0.32 log units
under a same-resolution JPEG or dither** (n = 10 of the 20 controls, same figure in both forms
because the grid is identical). Removing the systematic resolution coupling leaves a noise floor that
is almost the whole of the drift. A threshold sitting inside a distribution that wide flips about as
often wherever it is put and whatever its units are.

**4. One-side-only firing happens at identical resolution too** (§7): 2 of 20 perturbation
disagreements, both same-resolution, same file, invisible perturbation.

**5. And no placement of the floor, in either form, is rendition-stable.** Sweeping both forms across
the usable range — how much of the 220-artwork coverage sweep the fallback fires on, against how many
of the 84 pairs then take different membership rules:

| coverage firing | pixel form | pair rule disagreements | fraction form | pair rule disagreements |
|---|---|---|---|---|
| 22 % | 0.5 px | 8 / 84 | 1/1280 | 9 / 84 |
| 35 % | — | — | 1/640 | 13 / 84 |
| 40 % | — | — | 1/450 | 17 / 84 |
| **43 %** | **1 px (shipped)** | **16 / 84** | **1/320** | **17 / 84** |
| 47 % | 1.5 px | 18 / 84 | — | — |
| 53 % | 2 px | 16 / 84 | 1/226 | 13 / 84 |
| 58–68 % | 3–5 px | 12 / 84 | 1/160 – 1/113 | 9–11 / 84 |
| 74–76 % | 8 px | 7 / 84 | 1/80 | 6 / 84 |
| 84 % | 12 px | 8 / 84 | 1/40 | 3 / 84 |

Both ends of a sweep like this are degenerate — a floor that never fires and a floor that always
fires each disagree zero times, and neither is a rule. In the band where a "degenerate case" clause
means anything (a nameable minority of covers, say 20–50 %), **every cut in either form disagrees on
8–18 of 84 pairs, and neither form is systematically better than the other.** The disagreement only
falls below that once the fallback is firing on three-quarters of the corpus, at which point it is
not a fallback but a redesign of F — the exact objection `DEGENERATE_DEPTH_FLOOR_PX`'s own docstring
raised against 0.01.

> **Verdict.** The floor is a genuine and previously unattributed contributor — 10 of the 54
> all-four pair flips, 18.5 % — and its units are genuinely resolution-coupled in exactly the way
> the hypothesis says. But it is **not** what the pair regression is made of (`e1-colour` is,
> 43 of 54), and **the asymmetry is not caused by the units**: the quantity being thresholded is
> unstable between renditions at ~0.34 log units regardless of how the threshold is expressed, and
> fires one-side-only under same-resolution noise as well. Changing the floor's units is not a fix —
> and §6 confirms it by intervention: **9.0 % → 9.0 %, 54 → 55 all-four flips, 0 pairs newly
> agreeing.**

### Why "1/longEdge" is not a candidate at all

The task's suggested variant — "the same 1 px expressed per-image as 1/longEdge" — is the shipped
rule written differently: `depth · longEdge ≤ 1` and `depth ≤ 1/longEdge` are the same inequality.
Any variant that removes the asymmetry has to compare the *scale-free* depth against a constant that
does **not** depend on the image, which is why the candidate measured here is
`depth ≤ DEGENERATE_DEPTH_FLOOR_FRACTION` with the constant fixed at **1/320**, chosen to be
count-preserving: it fires on exactly the same 94 of 220 coverage artworks the 1-px rule fires on
(the next distinct cut up, 1/313, takes 96). Holding the strictness fixed is what makes the
measurement a test of the rule's *form* alone.

---

## 6. FIX-CANDIDATE MEASUREMENT — the intervention, not the counterfactual

The counterfactual in §5.3 is arithmetic on recorded thresholds; it says the *rule label* flips as
often either way. It does not say what happens to *published palettes*, because the scale-free floor
also changes which covers take the fallback at all, and that changes F on both sides. So the pair
block was re-run under the override — and a **control** run first, with the override unset, so the
comparison is two runs of the same working tree on the same day and not a comparison against a
report from yesterday.

`--skip-perturbations`, default `barMode: regional`, 200 pair trials each, 0 errored.
**`DEGENERATE_DEPTH_FLOOR_PX` was not changed; the scale-free branch is reached only through
`P3_DEPTH_FLOOR_MODE=scale-free`.**

| | baseline `robustness-p3-fields-0.3.0.json` | **control** (override unset) | **scale-free** (`1/320`) |
|---|---|---|---|
| pair agreement | 9.0 % (18/200) | **9.0 % (18/200)** | **9.0 % (18/200)** |
| 95 % interval | [5.8–13.8] | [5.8–13.8] | [5.8–13.8] |
| disagreeing pairs | 182 | 182 | 182 |
| **all-four flips** | **54** | **54** | **55** |
| 3-role / 2-role / 1-role | 54 / 46 / 28 | 54 / 46 / 28 | 53 / 46 / 28 |
| wall | — | 1010.9 s | 1008.1 s |

**The control reproduces the baseline trial-for-trial** — the same 182 `trialId`s disagree, the same
role-count histogram — which is the harness-level restatement of §9's neutrality proof: nothing W11b
added to `src/` moves a palette.

**The fix candidate moves nothing that matters.**

- Agreement: **18 → 18**. The *same 18 pairs* agree; **0 newly agreeing, 0 newly disagreeing**.
- All-four flips: **54 → 55**. Three pairs left the all-four set and four entered — churn, not repair.
- 34 of the 182 shared trials published different colours somewhere, and 10 changed how many roles
  moved. The rule change is doing real work on individual covers; none of it nets out as stability.

> **The fix candidate is measured and it does not work.** Expressing the degenerate-depth floor
> scale-free, at the constant that holds its firing rate on the coverage corpus fixed, leaves
> rendition-pair agreement at exactly 9.0 % and adds one all-four flip. **0.4.0 should not spend its
> change budget on the floor's units.** Whether the floor should exist at all is a separate question
> this measurement does not answer — §5.5 shows no cut of it in either form is rendition-stable, and
> §8 says why.

---

## 7. PERTURBATION-SIDE BALANCE — does the rule fire one-side-only at identical resolution?

20 perturbation disagreements, 5 per arm, **20 of 20 same-resolution** by construction.

| firing | all-four | not all-four | total |
|---|---|---|---|
| one-side-only | 1 | 1 | **2** |
| both | 1 | 10 | 11 |
| neither | 0 | 7 | 7 |

The two one-side-only rows:

| trial | long edge | rule left → right | β-depth px | first divergence | roles moved |
|---|---|---|---|---|---|
| `000606d3a5c7da73c3887268 / dither-lsb1` | 640 \| 640 | `beta-quantile` → `degenerate-depth` | 2.00 \| 1.00 | `field-rule` | 4 |
| `dea5add5f0ac48c56f403a2d4ed7097d / jpeg-q85` | 700 \| 700 | `beta-quantile` → `degenerate-depth` | 2.24 \| 1.00 | `field-rule` | 3 |

**A ±1-LSB dither, which cannot change a single pixel coordinate, moves the β-quantile depth from
2 px to 1 px and flips the membership rule — and all four roles with it.** The firing is therefore
**noise-dependent, not only resolution-dependent**. Resolution roughly doubles the rate rather than
creating it:

| population | one-side-only rate |
|---|---|
| perturbations (same file, same grid) | 2 / 20 = **10 %** |
| pairs at the **same** resolution | 1 / 8 = **13 %** |
| pairs at **different** resolutions | 15 / 76 = **20 %** |

(The same-resolution pair cell is 8 rows; it is a direction, not a measurement.)

---

## 8. THE OTHER RESOLUTION-SENSITIVE SITE — the edge field, and it is upstream of everything

`CONVENTIONS.md`'s scale-free default was checked against four sites.

- **Band widths are τ-relative and safe.** `ENDS_BAND_TAU_MULTIPLE`, `RANK_STEP_FRACTION` and
  `TRIM_LEVEL` are fractions of a rank population, not of a pixel grid, and **no band width appears
  in a single first divergence** over the 84 pairs (`fg-band` 0, `fg-band-rule` 0, `ends-step` 0).
- **The depth floor** is the declared exemption, covered above.
- **`INK_ANNULUS_MIN_RADIUS_PX = 2` is the second declared exemption, and it is resolution-sensitive
  — but bounded out of the flips.** `foreground.ts:212` computes
  `radius = max(2, round(INK_ANNULUS_RATIO · d · longEdge))`: the main term is scale-relative, but
  the 2-px clamp binds only at low resolution and small depth, and `Math.round` to an integer pixel
  radius quantises the annulus differently on the two sides of a pair. It can only act through the
  ink path, and the ink path's entire first-divergence footprint over the 84 pairs is
  `fg-cascade` 4 + `fg-cursor` 3 + `fg-regime` 1 = **8 of 84, with 0 all-four flips**. Even
  attributing all eight to the clamp, it cannot account for any of the 54 pair catastrophes. Named,
  bounded, and not pursued.
- **The fourth site is undeclared, and it is the load-bearing one.**

**The k = 3 edge neighbourhood is fixed-scale by nature, and the edge fraction it produces is
resolution-coupled: slope −0.212 on `log(longEdge ratio)`, correlation −0.403 (n = 84).** The same
artwork at higher resolution yields a *lower* edge fraction, because a fixed 8-neighbourhood rank
filter sees gentler per-pixel gradients when the same content is spread over more pixels. The drift
this produces is not small and it is not the same as noise drift:

| population | median \|log ratio\| of edge fraction |
|---|---|
| perturbations (same file, same grid) | **0.058** |
| pairs (84 selected) | **0.122** |

Two renditions of the same artwork disagree about which pixels are edges **twice as much as a JPEG
re-encode does**, and systematically with resolution. Everything the prototype publishes is
downstream of that map: depth is the distance transform of it, F is a quantile of depth, the ends
are ranks over F, and `e1-colour` is 43 of the 54 all-four pair flips. In the 16 `field-rule` rows
the pattern is visible by eye — the side that takes the degenerate fallback is the side with the
higher edge fraction in **16 of 16**:

```
0d2fb5e0…~2eef445   1000|700   beta|dege   px 3.00|0.00     edge 53.7%|79.9%   4 roles
161e9846…~2ba70b1   1000|640   beta|dege   px 3.61|1.00     edge 56.2%|67.1%   4 roles
21a154a8…~6ca0445    640|300   beta|dege   px 1.41|1.00     edge 61.2%|73.0%   4 roles
5186f0af…~c3fb5b0    600|700   dege|beta   px 1.00|2.00     edge 74.1%|55.3%   4 roles
5bdcf1c0…~deea713    300|700   dege|beta   px 1.00|11.00    edge 66.2%|39.8%   4 roles
6d84485a…~89a2eab    300|700   beta|dege   px 2.24|0.00     edge 55.7%|84.9%   4 roles
7457cb79…~e779180   1000|640   dege|beta   px 1.00|3.00     edge 63.2%|45.1%   4 roles
747587e9…~f78c65e    640|512   beta|dege   px 1.41|1.00     edge 60.6%|69.4%   4 roles
b9c1f5f6…~fbd4567   1425|500   beta|dege   px 2.00|0.00     edge 53.6%|88.5%   4 roles
e0650408…~f8af013    640|700   dege|beta   px 1.00|7.81     edge 72.9%|32.6%   4 roles
```

**The depth floor is a symptom of the edge map, not an independent site.** That is the strongest
reason the units fix fails: 0.3.0 put a threshold on the output of an unstable measurement instead
of on the instability.

### `e1-colour`, the 51 rows the floor does not explain

Median \|ΔL\| of e₁ across the pair: **0.067** (p10 0.020, p90 0.377). Median published worst-role
move for those rows: **0.456 OKLab**. The chain amplifies exactly as `ATTRIBUTION.md` found on the
perturbation arms — a small end move publishes a large role move — and 20 of the 51 have the
degenerate rule firing on **both** sides, i.e. the ends are being read over the wide fallback set on
both renditions and still land differently.

---

## 9. Diagnostics and override output-neutrality

W11b added to `src/`: three fields on the `P3_DIAG` chain record (`longEdge`, `depthThresholdPx`,
`depthFloorMode`), the measurement-only constant `DEGENERATE_DEPTH_FLOOR_FRACTION`, and the dev-only
`P3_DEPTH_FLOOR_MODE` branch in `computeFieldSet`. The claim that none of it changes published output
is **checked, not asserted** — `verify-neutrality.ts` runs demo-20 three ways in one process against
`_pinned-1ec99b6/` (`git show 1ec99b6:…/src/*.ts`, imports re-depthed, nothing else touched):

```
images: 20
pinned 1ec99b6              7598 bytes
working tree, P3_DIAG unset 7598 bytes, first differing row -1
working tree, P3_DIAG set   7598 bytes, first differing row -1
NEUTRAL — every published palette is byte-identical to the committed code, diagnostics off and on
```

A second, independent check at the harness level: the §6 **control** run of the pair block on the
working tree reproduces `robustness-p3-fields-0.3.0.json` exactly — 18/200 agreed, the *same 182
`trialId`s* disagreeing, the same 28/46/54/54 role-count histogram, 0 errored. Twenty images
byte-identical is a proof about demo-20; two hundred pairs identical trial-for-trial is a proof about
the corpus the claims in this file are made on.

`DEGENERATE_DEPTH_FLOOR_PX` is **unchanged at 1**. The scale-free branch is reachable only through
the environment variable, and an unrecognised value throws rather than silently returning the
baseline.

---

## 10. Line tensions, reported not smoothed

1. **The 30-of-128 sample carries real error.** Every projected count in this file is an estimate
   from 30 rows; the all-four column is exact because it is a census. A projected total of 35.0 for
   `field-rule` should be read as "roughly a fifth of the disagreeing pairs", not as 35.
2. **`field-rule` is credited above `e1-colour` by fiat of chain order.** 14 of its 16 rows also
   diverge at e₁ (§4). The intervention in §6 is what decides between the two credits; the stage
   table alone cannot.
3. **The count-preserving constant 1/320 is a choice with one degree of freedom.** It holds the
   firing rate fixed on the 220-artwork coverage sweep, which is the corpus the 1-px rule was set
   against — but a different reference corpus gives a different constant, and the pair result in §6
   is a measurement of that constant, not of every scale-free floor.
4. **`pairs-attribute.ts` duplicates `attribute.ts`'s `STAGES` list rather than importing it.**
   `attribute.ts` is a script with top-level effects. An edit to one must be mirrored in the other,
   and nothing enforces that.
5. **The `field-rule` stage did not exist in `attribution-0.3.0.json`.** Its perturbation-arm
   numbers therefore credit these divergences to whichever stage came next, most often `e1-colour`.
   The two files' stage tables are not directly comparable at the `e1-colour` row.
6. **`DEGENERATE_DEPTH_FLOOR_PX`'s own docstring anticipated a fraction and rejected it** on a 0.01
   trial that fired on 39 of 64. That rejection stands for 0.01, which is three times wider than the
   pixel rule; it is not evidence about 1/320, which is why 1/320 was measured rather than assumed
   dead.

---

## 11. Command lines

```sh
cd /Users/Flo/GitHub/palette/.worktrees/p3-fields/research/v3

# 1 — select the pairs and the perturbation control
NODE_NO_WARNINGS=1 node --experimental-strip-types \
  prototypes/p3-fields/measurements/attribution/pairs-select.ts \
  prototypes/p3-fields/measurements/robustness-p3-fields-0.3.0.json \
  prototypes/p3-fields/measurements/attribution
# 182 disagreeing, 54 all-four, 30 sampled (1-role:6 2-role:11 3-role:13) → 84 selected
# 317 perturbation disagreements → 20 selected · 193 distinct images

# 2 — the decision chains (P3_DIAG, --no-cache: a cache hit runs no pipeline and writes no chain)
mkdir -p data/devloop/p3-diag-pairs-0.3.0
P3_DIAG=$PWD/data/devloop/p3-diag-pairs-0.3.0 \
NODE_NO_WARNINGS=1 node --experimental-strip-types src/devloop/run.ts \
  --candidate prototypes/p3-fields/src/candidate.ts \
  --set prototypes/p3-fields/measurements/attribution/pairs-paths-0.3.0.txt \
  --workers 6 --no-cache \
  --out prototypes/p3-fields/measurements/attribution/run-pairs-193-0.3.0.jsonl
# 193 ok · 0 failed · 1 cache hit · 199 877 ms
# the one cache hit wrote no chain; that image was re-run alone under P3_DIAG → 193/193 chains

# 3 — attribute
NODE_NO_WARNINGS=1 node --experimental-strip-types \
  prototypes/p3-fields/measurements/attribution/pairs-attribute.ts \
  prototypes/p3-fields/measurements/attribution/pairs-selected-0.3.0.json \
  prototypes/p3-fields/measurements/attribution/perturb-selected-0.3.0.json \
  $PWD/data/devloop/p3-diag-pairs-0.3.0 \
  prototypes/p3-fields/measurements/attribution/pairs-attribution-0.3.0.json

# 4 — the fix candidate, pair block only, control first
NODE_NO_WARNINGS=1 node --experimental-strip-types src/robustness/check.ts \
  --candidate prototypes/p3-fields/src/candidate.ts --skip-perturbations \
  --out prototypes/p3-fields/measurements/attribution/robustness-pairs-0.3.0-control.json
P3_DEPTH_FLOOR_MODE=scale-free \
NODE_NO_WARNINGS=1 node --experimental-strip-types src/robustness/check.ts \
  --candidate prototypes/p3-fields/src/candidate.ts --skip-perturbations \
  --out prototypes/p3-fields/measurements/attribution/robustness-pairs-0.3.0-scalefree.json

# 5 — output-neutrality of everything W11b added to src/
cd /Users/Flo/GitHub/palette/.worktrees/p3-fields
NODE_NO_WARNINGS=1 node --experimental-strip-types \
  research/v3/prototypes/p3-fields/measurements/attribution/verify-neutrality.ts \
  research/v3/data/devloop/sets/demo-20.txt
```

## 12. Files

| file | what |
|---|---|
| `pairs-select.ts` | the selection rule |
| `pairs-selected-0.3.0.json` | 84 pairs with their selection stratum |
| `perturb-selected-0.3.0.json` | the 20-trial same-resolution control |
| `pairs-paths-0.3.0.txt` | 193 image paths, the diagnostic set |
| `run-pairs-193-0.3.0.jsonl` | the dev-loop run that wrote the chains |
| `pairs-attribute.ts` | first-divergence, cross-tab, coupling, counterfactual |
| `pairs-attribution-0.3.0.json` | every table above plus all 104 rows |
| `robustness-pairs-0.3.0-control.json` | pair block, shipped floor |
| `robustness-pairs-0.3.0-scalefree.json` | pair block, `P3_DEPTH_FLOOR_MODE=scale-free` |
| `verify-neutrality.ts`, `_pinned-1ec99b6/` | the output-neutrality proof |
