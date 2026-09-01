# The perception-model study — do the contract's thresholds have the right shape?

**Written 2026-08-04.** Measurements regenerate with:

```sh
NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/src/contract/perception-model-study.ts --write
```

Data file: `research/v3/data/contract/perception-model-study.json`.
Scripts: `perception-model-study.ts`, `-spaces.ts`, `-numerics.ts`, `-round-design.ts`, `-audit.ts`.
Tests: `research/v3/tests/contract-perception-model.test.ts` (12 tests, including the audit tripwire).

**This study did not change the contract.** It measures. Every proposal below is a proposal for the
reviewer to accept, amend or refuse, and nothing here edits `PHASE_0_DECISIONS.md`,
`data/decisions/decisions.json`, or any constant.

---

## Why this exists

The reviewer's ruling, verbatim:

> it would be good to have all our constraints figured out... in previous attempts discovering a
> constraint late has led to failure of the attempts — we should explore different cutoffs based on
> hue / direction / whatever else — the cutoff could also be linear, not 1 number per quadrant but a
> function of the position in color space — we might also explore other color spaces.

Two measured direction-dependences prompted it, and both were already on the record before this
study started:

- **`bracketing-round-3` returned `anisotropy-confounded`.** At matched OKLab distances inside the
  same band, lightness-dominant pairs read "same colour" **15/21 (0.714)** and chroma-dominant pairs
  **2/21 (0.095, exact p = 0.00022)**. Its own conclusion: *"no scalar combination of two regional
  bars can represent that"*.
- **`accent-real-1` was refused as `stratum-dependent`.** Pooled threshold **0.18630**, 95% CI
  [0.14052, 0.24700], contradicted by hue-third 0 at **0.13417** and hue-third 2 at **0.26385**.

---

## The five findings, in order of how much they should change what happens next

**1. OKLab is the worst space for the identity criterion — but only where it is not allowed to
reweight its own axes, which localises the defect precisely.** The **four lowest-scoring identity
cells of forty-nine are all OKLab**: global constant dead last (**0.5975**), the incumbent four
regional bars next (**0.5743**), then linear-in-position (0.5660) and the frozen contract (0.5594).
At each of the three shapes that keep the space's metric as-is — (a), (b), (c) — **every one of the
seven other spaces beats OKLab.** At the three shapes that reweight the axes — (d), (e), (f) —
OKLab catches up and is mid-table or better. That contrast is the mechanism, not a curiosity:
**OKLab's problem for this criterion is its axis weighting, and nothing else the study can see.**
Give it the reweighting and it is competitive; withhold it and it is last.

**2. Yes — a different space makes a single global constant competitive, which is the reviewer's
question answered directly.** `ICtCp × one global constant` scores **0.4913**, beating the
incumbent four-bar OKLab rule by **+0.0830 nats/answer** (95% cluster-bootstrap CI [0.0174, 0.1461],
raw p = 0.023). **One number in ICtCp predicts held-out human identity judgements better than four
numbers in OKLab.** The caveat is stated in the same breath: that comparison does **not** survive
Holm correction across the declared family of 144 (adjusted p = 1.000). It is a real effect at an
uncorrected level and it is not multiplicity-protected.

**3. Exactly one cell in 144 is significantly better than its incumbent after correction, and the
other eight survivors are significantly *worse*.** `identity × Jzazbz × linear-in-position` wins at
**0.4505**, **+0.1238 nats/answer** over the incumbent (CI [0.0475, 0.1973], Holm p < 0.0001), and
it is also first of forty-nine under leave-one-round-out. The remaining eight Holm survivors are all
over-parameterised shapes fitted to the 30- and 35-item functional rounds, and every one of them is
significantly *worse* than the incumbent — the correction is mostly detecting this study's own
overfitting, which is what it is for.

**4. The winner is not separable from most of the field: the top of the identity table is a
plateau.** The leader is distinguishable from only **16 of 47** other candidate cells. In particular
it is **not** separable from `ICtCp × one global constant` (advantage 0.0408, CI [-0.0222, 0.1047]).
**So the honest reading is: the simplest competitive model — one number, in a better space — cannot
be told apart from the best of forty-nine.** Parsimony, not the minimum of the table, should decide.

**5. For the functional criterion, nothing is separable from anything.** At n = 30 no space is
distinguishable from any other, including the incumbent (best-vs-incumbent CI [-0.0338, 0.1544]),
and no shape richer than a global constant is even identifiable. **The functional criterion cannot
support a shape question at its present sample size, and this study declines to answer one.**

---

## Method

### Unit of analysis, and what is never pooled

**One answered stimulus = one pair of exact 8-bit colours + one binary answer.** Three criteria are
carried separately end to end and no table ever adds them up:

| criterion | question on screen | n | clusters | rounds |
|---|---|---|---|---|
| **identity** | *"Same color?"* — do they register as the same colour | **184** | 154 | `bracketing-round-1-clarified`, `-2`, `-3` |
| **detection** | *"Can you clearly see the shapes?"* | **10** | 10 | `bracketing-round-1-clarified` part 2 |
| **functional (real)** | *"Does this work as an accent at a glance?"* | **30** | 30 | `accent-real-1` |
| **functional (synthetic)** | identical wording, flat panels | **35** | 31 | `accent-functional-1` |

Keeping them apart is not fastidiousness. `bracketing.ts:84-95` records that **72 answers were
already discarded once** over exactly this confusion — a detection criterion answered where an
identity one was intended — and the abandoned `bracketing-round-1` pass is excluded here on batch
id, as every other analysis in this repository excludes it.

The two functional rounds are also kept apart from each other, because they are different stimulus
classes whose measured thresholds differ by **+0.14076**, which is the entire reason the real round
was commissioned.

**`n` is units, not trials.** A silent repeat carries byte-identical pixels to the item it repeats,
so it shares that item's cluster. Every fold assignment respects clusters and every interval is a
cluster bootstrap over them. This is why identity's 184 observations are only 154 clusters.

**Attention checks are excluded from every fit.** `control-identical` items additionally carry a
zero distance, which has no logarithm.

### The candidate spaces, and exactly where each conversion comes from

Every space is reduced to a Cartesian triple whose first axis is lightness-like, so that Euclidean
distance is the space's intended colour difference.

| space | coordinates | source |
|---|---|---|
| **OKLab** (baseline) | the contract's own `rgbToOkLab` | `src/contract/color.ts`, Ottosson. **Deliberately the contract's own function, not colorjs.io**, so the baseline is byte-identical to the ruler the contract actually uses |
| **CIELAB (D65)** | colorjs.io `lab-d65` | colorjs.io 0.5.2. D65, **not** the package's D50 default |
| **CIELAB (D50)** | colorjs.io `lab` | colorjs.io 0.5.2, carried to show the white point decides nothing here |
| **CAM16-UCS** | derived | colorjs.io 0.5.2 ships **CAM16-JMh only — there is no `cam16-ucs` space in this version.** UCS coordinates computed here by Li et al. 2017: `J' = 1.7J/(1+0.007J)`, `M' = ln(1+0.0228M)/0.0228` |
| **ICtCp** | colorjs.io `ictcp`, Ct halved | the `0.5` on Ct is the BT.2124 ΔE_ITP convention |
| **HCT (Cartesianised)** | derived | **HCT was never defined as a ΔE space**; `(T, C cos h, C sin h)` is this study's construction and is flagged as the least standard row |
| **Jzazbz** | colorjs.io `jzazbz` | Safdar et al. 2017 |
| **DIN99d** | **hand-rolled here** | **no DIN99 space or deltaE99 method exists in colorjs.io 0.5.2 or anywhere in this repository**; implemented from Cui et al. 2002 |

**A global rescaling of a space is invisible to this study.** Every model estimates a threshold *in
the space it is fitted in*, on `log d`, so multiplying a whole space by a constant shifts an
intercept and changes nothing else. CIELAB's L\* running 0–100 against OKLab's 0–1 is therefore not
a difference between them. What is compared is the **shape** of each metric — the relative weighting
of lightness against the chromatic plane, and how that weighting moves with position.

**Every space carries a correctness check** (`runSpaceSelfChecks`, asserted in the test suite). The
four with a published ΔE in colorjs.io are pinned to it and agree to **r = 1.000000000**: OKLab
against ΔE_OK, CIELAB-D50 against ΔE76, ICtCp against ΔE_ITP, Jzazbz against ΔE_Jz. DIN99d has no
library to check against, so it carries **r = 0.9637 against ΔE2000** — the formula it was built to
approximate — plus monotonicity and a pinned neutral offset. The L/C/H decomposition identity
`Δ² = ΔL² + ΔC² + ΔH²` holds to **4.2 × 10⁻¹⁶** in every space.

Two declared assumptions rather than tuned choices: colorjs.io's **default viewing conditions** are
used for the appearance-model spaces, and under them even sRGB white carries CAM16 `M = 2.2369`, so
neutrals in CAM16-UCS are not exactly neutral. That residual is ~5% of a saturated colour's chroma
and it slightly inflates the chroma component for near-neutral pairs — which is where three of the
four contract regions live.

### The rule shapes

Every shape is written in the same form — `logit P = β · (log τ(x) − log d)` — so the cells differ
only in what the threshold `τ` is allowed to depend on.

| shape | τ depends on | params |
|---|---|---|
| **(a) global constant** | nothing | 2 |
| **(b) per-region constants** | the contract's 4 colour regions, cross-region resolved by `Math.max` — **the identity incumbent exactly** | 5 |
| **(c) linear in position** | lightness, chroma and two hue harmonics at the pair's midpoint | 6 |
| **(d) direction-aware** | nothing, but distance is `√(ΔL² + w_C·ΔC² + w_H·ΔH²)` | 4 |
| **(e) direction + position** | (c) and (d) together | 8 |
| **(f) per-region + direction** | (b) under (d)'s metric | 7 |
| **(ref) frozen contract** | **nothing is refitted** — the committed constants, only sharpness fitted | 1 |

Shape (d) is worth reading twice: **it is exactly "a different colour space with one global
constant"**, so its fitted weights say what rescaling would make shape (a) work.

The region partition stays the contract's OKLab-defined one **in every space**, deliberately: shape
(b) asks "does this space's distance still need the correction OKLab needs?", so the correction
being tested has to be the contract's actual correction.

**Disclosure on the reference row.** `(ref) frozen contract` was added **after the first run of the
grid**, once it was clear every candidate row refits its bars and none showed the status quo. It is
excluded from the multiplicity family, because it is not competing for the title and counting it as
a candidate would be the post-hoc move this study exists to avoid. Everything else was declared
before any answer was read.

### Scoring

Primary score is **held-out mean negative log-likelihood (nats per answer), 10-fold grouped
cross-validation**, folds dealt by cluster. A richer model always fits its own training data better;
none of these numbers is in-sample. **Leave-one-round-out** is reported alongside as the stronger
test, because the rounds differ in *design*, not only in sampling.

Intervals are **paired cluster bootstraps** (`clusterBootstrapCI` from `src/stats`, 2000 resamples,
seed 20260804) of the per-answer log-loss difference. Multiplicity goes through `sweepThenTest` with
**Holm at α = 0.05 over the true family of 144**. Support is declared through
`assessSupport`, with claim domains fixed to the range each constant is **used** over rather than
the range that happened to be sampled — identity `[0.005, 0.05]`, the accent criteria `[0.06, 0.30]`
reusing `accent-real-round-1-preregistration.md` §6.2 unchanged.

`src/stats` ships no fitter, no cross-validation and no model-comparison routine — by design; it
offers inference, not estimation. Those are written in `perception-model-numerics.ts` and unit-tested
against synthetic data with known answers.

---

## PART 1 — the comparison, per quantity

### Identity (n = 184, 154 clusters, 91 "same")

Held-out log-loss, lower is better. `*` = the contract's incumbent cell.

| space | (a) global | (b) per-region | (c) linear | (d) direction | (e) dir+pos | (f) reg+dir | (ref) frozen |
|---|---|---|---|---|---|---|---|
| **OKLab** | **0.5975** ⟵ worst | **0.5743** \* | 0.5660 | 0.5366 | 0.4704 | 0.5042 | 0.5594 |
| CIELAB (D65) | 0.5351 | 0.5047 | 0.4781 | 0.5461 | 0.4869 | 0.5095 | — |
| CIELAB (D50) | 0.5287 | 0.4983 | 0.4723 | 0.5402 | 0.4797 | 0.5017 | — |
| CAM16-UCS | 0.5348 | 0.5246 | 0.5008 | 0.5172 | 0.4814 | 0.5085 | — |
| **ICtCp** | **0.4913** | 0.4970 | 0.4813 | 0.4700 | 0.4527 | 0.4759 | — |
| HCT (Cart.) | 0.5282 | 0.5238 | 0.4849 | 0.5330 | 0.4903 | 0.5203 | — |
| **Jzazbz** | 0.5034 | 0.4702 | **0.4505** ⟵ best | 0.5069 | 0.4541 | 0.4791 | — |
| DIN99d | 0.5074 | 0.5074 | 0.4788 | 0.4952 | 0.4550 | 0.4889 | — |

**Winner: `Jzazbz × linear-in-position`, 0.4505**, margin **0.1238 nats/answer** over the incumbent,
95% CI [0.0475, 0.1973], Holm p < 0.0001. It is also **rank 1 of 49 under leave-one-round-out**
(0.4611), so it is not a within-round artefact.

**Caveats, all of which matter:**

- **The leader is separable from only 16 of 47 rivals.** It is *not* separable from `ICtCp × global
  constant`, `OKLab × direction+position`, either CIELAB's `linear-in-position`, or CAM16-UCS's
  `direction+position`. The top of this table is one flat plateau roughly 0.45–0.48 wide.
- **n = 184 answers from one reviewer**, whose own measured repeat consistency is 83.3% (round 3)
  and 62.5% (rounds 1–2). No model can beat the observer's own repeatability.
- **Refitting the four bars is not better than leaving them frozen.** `(ref) 0.5594` versus
  `(b) 0.5743`; the difference is not separable (CI [-0.0089, 0.0393]). Four bars fitted on 90% of
  the data cost more variance than they buy.
- The identity sample's support verdict is `supports-the-claim`, coverage 1.00 over [0.005, 0.05],
  observed 0.00315–0.06300.

**Does any space make shape (a) competitive? Yes.** `ICtCp × global constant` at 0.4913 beats the
incumbent's 0.5743 (+0.0830, CI [0.0174, 0.1461], raw p = 0.023) and beats the frozen contract's
0.5594 — **and it is statistically indistinguishable from the best cell in the table.** It does not
survive Holm across the family of 144 (adjusted p = 1.000). Both halves of that sentence are the
result.

#### What rescaling would make one number work — the numbers behind finding 2

Shape (d)'s fitted axis weights, relative to lightness = 1:

| space | w_chroma | w_hue | a unit chroma step costs | threshold τ |
|---|---|---|---|---|
| **OKLab** | **17.40** | **14.75** | **4.17×** a lightness step | 0.04512 |
| CIELAB (D65) | 1.84 | 1.93 | 1.36× | 5.593 |
| CIELAB (D50) | 1.71 | 1.68 | 1.31× | 5.394 |
| CAM16-UCS | 5.28 | 2.66 | 2.30× | 4.673 |
| ICtCp | 4.21 | 3.38 | 2.05× | 0.01764 |
| HCT (Cart.) | 1.48 | 0.92 | 1.22× | 4.775 |
| Jzazbz | 2.54 | 2.56 | 1.59× | 0.01114 |
| DIN99d | 2.04 | 0.90 | 1.43× | 3.822 |

Read the OKLab row as the contract's own ruler, restated: under the reviewer's identity criterion,

> **the same-colour bar in OKLab is ≈ 0.045 for a pure-lightness difference, ≈ 0.0108 for a pure-
> chroma difference, and ≈ 0.0118 for a pure-hue difference** — a **4.2× spread across direction**,
> against a **2.5× spread across the four regions** the contract currently encodes.

**The dimension the contract does not have is larger than the one it does.** That is round 3's
finding, now quantified on the pooled 184 answers rather than on 42, and it explains finding 1
mechanically: every space whose metric already weights chroma more heavily than OKLab scores better
at shapes (a)–(c) **without being given a single extra parameter**, and OKLab closes the gap the
moment shape (d) hands it the same reweighting. The weights are also internally coherent: OKLab's
17.40 against CIELAB-D65's 1.84 is a ratio of 9.5, and CIELAB already weights chroma about 3.2× more
than OKLab by construction — √9.5 = 3.08, which is the same statement twice.

Note the two spaces that need the *least* reweighting (CIELAB, w_C ≈ 1.7–1.8) are also the two that
are **worse** than OKLab at shape (d) — reweighting a space that is already close to right buys
nothing and costs two parameters. That is the expected pattern and it is worth recording as a check
that these fits are behaving.

### Function, on real covers (n = 30, 10 "works")

Only the global-constant column is identifiable at this sample size; every richer shape is flagged
under-identified (fewer than 10 observations per parameter) and several are catastrophically worse.

| space | (a) global constant |
|---|---|
| DIN99d | **0.4327** |
| CAM16-UCS | 0.4335 |
| HCT (Cart.) | 0.4607 |
| **OKLab** | **0.4930** \* |
| Jzazbz | 0.5139 |
| CIELAB (D50) | 0.5165 |
| CIELAB (D65) | 0.5250 |
| ICtCp | 0.5581 |
| *(ref) frozen `ACCENT_FUNCTIONAL_DISTANCE = 0.14591`* | *0.5004* |

**Winner: none.** The leader beats the incumbent by 0.0602 with CI **[-0.0338, 0.1544]** — contains
zero. Against **every** other global-constant cell the leader's interval also contains zero
(widest: vs ICtCp, [-0.0283, 0.2928]). **Everything here is within noise.** The eight functional
cells that do survive Holm are all significantly *worse* than the incumbent.

One thing worth noticing rather than concluding from: **ICtCp is the best space for identity and the
worst for function.** Whatever the right metric is, it is not the same metric for the two criteria —
which is the "never pool the criteria" rule appearing as a number rather than as a principle.

### Function, on synthetic panels (n = 35, 32 "works")

Same picture, same verdict. `ICtCp × global constant` leads at 0.2586 against the incumbent's
0.3845, CI [-0.0231, 0.4006] — contains zero. Not separable. Reported because the round's data is
valid and its own decision record calls it *"the cleanest round this repository has run"*; its
**fit** was refused for a different reason.

### Detection (n = 10)

**Refused.** Ten observations cannot choose between 48 model cells, and this script does not run a
comparison on them — pretending otherwise is exactly the failure this study was commissioned to
prevent. Support verdict `range-restricted`, coverage 0.76. Carried only into the gap map.

---

## PART 2 — the sampling-gap map, and one round design

### Where the existing answers do and do not constrain a fit

Counts by contract region × dominant direction of the difference. `!` = never sampled.

**Identity — well covered, and the only criterion where any of this is measurable.**

| region | lightness | chroma | hue |
|---|---|---|---|
| dark-neutral | 24 | 23 | 11 |
| dark-saturated | 18 | 15 | 14 |
| light-neutral | 16 | 15 | 9 |
| light-saturated | 13 | 9 | 17 |

Every cell is populated; the thinnest are light-saturated chroma (9) and light-neutral hue (9). This
is why the identity comparison is the one that produced separable results.

**Function (real) — the lightness direction has never been sampled at all.**

| region | lightness | chroma | hue |
|---|---|---|---|
| dark-neutral | **0 !** | 3 | 1 |
| dark-saturated | **0 !** | 1 | 9 |
| light-neutral | **0 !** | 2 | 2 |
| light-saturated | **0 !** | **0 !** | 12 |

**This is structural, not accidental, and it is the most important gap in the study.**
`accent-real-1` constructs every accent to be isoluminant with its field — APCA `Lc == 0` on every
item, `|ΔY| ≤ 0.00162` — because that is the regime where the escape is the only thing between the
palette and a refusal. The consequence is that **the lightness axis of the functional threshold is
not merely unmeasured, it is unmeasurable from the existing data**: shape (d) cannot identify a
lightness weight when every observation has ΔL ≈ 0. The functional constant is nonetheless applied
to accent/field pairs of arbitrary lightness relation.

Function (synthetic) and detection show the same pattern with the same cause (5 of 12 cells empty
and 8 of 12 respectively).

### The follow-up round, sized by simulation

Item counts come from simulating the estimator that would actually be used, at the observer noise
that was actually measured. Converting round 3's **83.3% repeat consistency** into a lapse rate via
`consistency = p² + (1−p)²` gives **p = 0.908, λ = 0.092** — the reviewer's answers saturate at about
91%, not 100%. (Rounds 1–2's 62.5% would imply λ = 0.25, at which no feasible round pins anything.
The 83.3% figure is used because it is the most recent and was measured under the exact criterion a
follow-up round would use. It is measured on in-band items only, i.e. hard ones, so it is a lower
bound on consistency and λ = 0.092 is an **upper** bound on the noise — the counts below are
conservative.)

Simulated precision, 600 draws per cell, seeded:

| items per ladder | 90% interval on τ̂/τ | 90% interval on the ratio of two direction ladders |
|---|---|---|
| 8 | [0.39, 2.93] | [0.10, 6.44] |
| 12 | [0.46, 1.95] | [0.38, 3.07] |
| 20 | [0.60, 1.65] | [0.44, 2.07] |
| 30 | [0.68, 1.59] | [0.56, 1.87] |
| 40 | [0.73, 1.39] | [0.64, 1.63] |

**The blunt consequence: at this observer's noise level, no round of feasible size pins an identity
threshold to better than about ±35%, and 30 items per ladder are needed merely to distinguish a 2×
direction ratio from no ratio at all.** Previous rounds ran 39–80 items. A round that genuinely
settles both quantities is roughly **twice the largest round run so far**, and saying so is part of
the deliverable.

#### Proposed round 4 — "the shape round"

Recommended, **148 items**; a minimal fallback at **78** is given below.

| arm | items | what it settles |
|---|---|---|
| **A — identity, discriminating** | 40 | Places every item where `ICtCp × one global constant` and `OKLab × four bars + Math.max` make **opposite** same/different predictions. Reuses round 3's proven design logic — exactly one candidate is right on each item, so accuracy is complementary and the whole arm reduces to one binomial. **This is the cheapest possible test of finding 2** and it does not need a ladder at all. |
| **B — identity, direction ladders** | 36 | 3 directions (lightness-pure, chroma-pure, hue-pure) × 12, **within dark-neutral only** — the best-sampled region with the tightest bar. Estimates the anisotropy ratio directly rather than inferring it. At 12/ladder the ratio interval is [0.38, 3.07] under the null, so it can confirm a ~4× ratio and **cannot** pin it; that limit is declared in advance. |
| **C — functional, hue-crossed** | 60 | 3 accent hue thirds × 20, on real covers, at the size that resolves the 2× spread `accent-real-1` saw. Adds a **declared second arm of non-isoluminant accents** so the lightness axis stops being unmeasurable — kept as a separate stratum, never pooled with the isoluminant ladder, because it is a different regime. |
| **controls + silent repeats** | 12 | 6 attention checks (3 identical, 3 obvious) and 6 silent repeats, matching rounds 1–3, so consistency is re-measured rather than assumed. |

**Minimal fallback (78 items):** arm A (40) + arm C at 3 × 10 (30) + 8 controls/repeats. This
settles the space question for identity decisively and gives only a directional read on functional
hue. It is the version to run if a 148-item sitting is not realistic.

**Not in this round, and deliberately:** **B31**, the foreground↔accent pair that has never been
shown to anyone. It is a third stimulus type and would push the round past 170. The ledger already
notes that B31 and A16 are the same protocol on different stimuli and that running them together is
most of the saving — so the honest options are to accept a larger round or to run B31 as its own
short one. Flagged for the reviewer rather than silently dropped.

#### Pre-registration sketch

Written in full before the fixture generator, per this repository's standing practice.

- **Population.** Arm A: the 40 discriminating items, each at its first showing, repeats not counted
  as independent trials. Arms B and C: their ladder items only. Controls never scored.
- **Arm A decision.** `k` = items answered "same". `accuracy(ICtCp-global) = k/n`,
  `accuracy(OKLab-4-bar) = 1 − k/n`. Decisive iff the two-sided exact binomial against p = 0.5 gives
  p < 0.05; at n = 40 that is `k ≥ 27` or `k ≤ 13`. Anything between is **unresolved** and must not
  be recorded as support for the incumbent.
- **Arm A anisotropy veto**, carried over from round 3 because it fired there: if the
  lightness-dominant and chroma-dominant subgroups fall on opposite sides of 0.5 and either is
  individually decisive, report **anisotropy-confounded** and declare no winner.
- **Arm B.** Three separate logistic fits, one per direction, using the repository's existing
  `fitLogistic` unchanged. Report all three thresholds with intervals and the two ratios. **No
  adoption from arm B** — it is declared under-powered for adoption in advance.
- **Arm C.** Per-hue-third fits wrapped in `fitWithDeclaredSupport`, claim domain [0.06, 0.30],
  `selectionRelationToVariable: independent-of-the-variable`. Refuse adoption if any stratum fit
  falls outside the pooled 95% interval, exactly as `accent-real-1` refused.
- **Validity gates.** All 6 attention checks correct or the round is void. Repeat consistency
  reported regardless and compared against 83.3%.
- **Multiplicity.** Every comparison declared to `sweepThenTest` with Holm at α = 0.05.
- **Refusal is a result.** Any arm may return "unresolved"; none of them may be softened into
  "leans toward" language.

---

## PART 3 — latent-structure audit of every single-number constant

The reviewer's late-discovery failure-mode hunt. **The default classification is
`unknown-untested`**, and a constant only earns `position-independent` on an argument that does not
depend on any human answer — a closed-form derivation, a third-party bound, or a structural fact.
"Nobody has complained" is not an argument.

**Counts: 8 provably independent · 6 possibly dependent · 6 unknown/untested · 20 total.**

A test (`contract-perception-model.test.ts`) enforces that every constant exported from
`constants.ts` is either audited or explicitly listed as out of scope with a reason — **so a
constant added without an audit row fails a test**, which is the only durable defence against the
failure mode this study was commissioned to prevent.

| # | constant | value | class | the short reason |
|---|---|---|---|---|
| 1 | `SAME_COLOR_BAR_BY_REGION` | 4 bars, 0.00932–0.02293 | **possibly** | Position dependence is why there are four; **direction dependence is larger than the position dependence they encode** (4.2× vs 2.5×). No round has ever found it direction-invariant |
| 2 | `REGION_LIGHTNESS_BOUNDARY` | 0.55 | **unknown** | Never measured as a threshold — it is round 1's *stimulus stratum* promoted to a constant. A step fitted to strata reproduces those strata, so the four-bar result cannot distinguish "the bar steps at 0.55" from "we cut the data at 0.55" |
| 3 | `REGION_CHROMA_BOUNDARY` | 0.05 | **unknown** | Identical argument, on the axis round 3 found the bar *most* sensitive to |
| 4 | `sameColorBar()` `Math.max` | policy | **possibly** | Provenance withdrawn (the cited study has no script, seed or output and an independent replication **reverses** it); round 3 then measured it to be the wrong *shape*, not the wrong number |
| 5 | `POOLED_SAME_COLOR_BAR` | 0.01535 | **possibly** | Refuted as a single bar by the same fit that produced it; still published to dashboards under a name that does not say so |
| 6 | `ACCENT_FUNCTIONAL_DISTANCE` | 0.14591 | **possibly** | The strongest direct evidence in the contract: its own round fitted 0.18630 and was **refused** because hue-thirds ran 0.13417 vs 0.26385. The committed 0.14591 is not that fit — it is the geometric midpoint of two rungs from a **detection** round |
| 7 | `FOREGROUND_ACCENT_SEPARATION_DISTANCE` | 0.07444 (on loan) | **unknown** | **Nobody has ever been shown a foreground and an accent side by side.** Better collateralised than the loan it replaced (detection number doing a detection job, applied as `max(bar, separation)`), but the source fit was 10 points and completely separated. **One endorsed palette already fails on this code** |
| 8 | `ACCENT_VISIBILITY_COLOR_DISTANCE` | 0.07444 | **unknown** | Retired as a gate; 10 fitted points, completely separated, published value is the midpoint of a gap, no CI quotable (ridge sweep swings width 2.4× non-monotonically) |
| 9 | `EPSILON_TEXT_RAW` | 2.5 | **possibly** | **The sharpest finding in the audit.** Raw APCA is a function of luminance *only* — blind to hue and chroma by construction. So a fixed raw-APCA epsilon is *provably* position-independent on the quantity it is computed from, and that is precisely the hazard: two pairs at identical \|raw\| can be at wildly different perceptual distances. It is not a perceptually uniform floor and was never claimed to be; the exposure is that it reads as one. Its only stated justification is that it must exceed 1.9815 |
| 10 | `EPSILON_ACCENT_RAW` | 2.5 | **possibly** | Same, plus: documented as a "separate knob by design" and currently the identical number, so the distinction is unexercised. It gates the escape, putting **two uncalibrated numbers in series**, one of them known to be the wrong shape |
| 11 | `APCA_RAW_IDENTICAL_CEILING` | 1.98152 | **independent** | Solved in closed form from the APCA constants; the derivation never mentions a chromatic coordinate. Rounded **up**, so it is a true bound, and it survived refutation of its predecessor by a real 8-bit pair |
| 12 | `APCA_RAW_LOW_CLIP` / `LC_DEAD_BAND_CEILING` / `APCA_LC_TO_RAW_OFFSET` | 10 / 7.3 / 2.7 | **independent** | Exact restatements of vendored apca-w3 constants; 7.3 is a literal precisely because the computed form is one ulp high |
| 13 | **unnamed `1.1`** at `color.ts:347` | 1.1 | **independent** | Independent — it is APCA's own input clamp. **In the census as the folder's one genuine hygiene breach**: `constants.ts:4-7` forbids bare threshold literals, and this one is not in `APCA_G4G`, not named, and not pinned against apca-w3, so it cannot drift-fail loudly. `apcaRaw` deliberately does not apply it, and the docstring calls that gap "the unsafe one" |
| 14 | `CONTRAST_FLOOR_TOLERANCE` | 1e-9 | **independent** | A float round-tripping allowance, not a policy |
| 15 | **P1 excursion bar** | 2.5 × the same-colour bar | **unknown** | **Three bracketing rounds have now passed it by.** Worse than untested: expressed as a *multiple of the bar*, so it silently inherits every position and direction dependence the bar has, with a 2.5× lever and nobody having decided that |
| 16 | `SOURCE_POPULATION_FLOOR` | 0.001 | **independent** | Not a colour-space threshold. Kept as the campaign's worked example of this failure mode: it gated real palettes until `BELONGS_STUDY.md` measured it had **no discriminating power at any threshold** and refused 340 of 351 endorsed palettes. **The constant was never the problem — the quantity was**, and no amount of recalibration would have found that |
| 17 | `RAMP_SAMPLES_PER_SEGMENT` / `RAMP_REFINEMENT_SAMPLES` | 2048 / 4096 | **independent** | Counts with stated worst-case bounds in raw-APCA units, verified against a 16× denser reference with 0 verdict disagreements |
| 18 | `MIN_/MAX_GRADIENT_STOPS` | 2 / 4 | **independent** | Structural caps on output shape; the *reason* for the ceiling (banding) is a perceptual claim and is unmeasured, but no position dependence is expressible |
| 19 | `SINGLETON_NEAR_ONE` | 0.90 | **unknown** | Recorded post-hoc by the ledger's own admission — a distinct failure mode from position dependence and in scope for a late-discovery hunt |
| 20 | Agreement floor | 0.85 | **independent** | Thresholds an agreement rate, not a colour difference. In the census because it is `[UNCALIBRATED]` and §7's published pixel floors were measured *against* it |

### The three things this audit would fix first

1. **The epsilons (#9, #10)** — not because 2.5 is wrong but because the quantity is blind to two of
   the three axes everything else in this study is about, and nothing in the contract says so at the
   point of use. Cheapest fix: a stimulus set varying hue and chroma at fixed \|raw\|. Not in round 4,
   because it is an APCA-domain question rather than a distance-domain one.
2. **The region boundaries (#2, #3)** — the only non-uniformly-applied thresholds in the contract,
   and both are stimulus-design artefacts that were never tested as locations. Round 4 arm A tests
   whether they are needed at all, which is the better question.
3. **The excursion bar (#15)** — the clearest live instance of the reviewer's worry. It is a
   multiplier on a constant now known to have a missing dimension, and three rounds have gone past it.

---

## Proposed decision records — not written, for the reviewer

Proposed only, per the instruction that this change edits no shared doc and no decisions file.

1. **`d-2026-08-04-oklab-is-the-worst-space-for-the-identity-criterion`** — record that on 184
   pooled identity answers the four worst cells of forty-nine are all OKLab, that OKLab is beaten by
   every other space at each shape that does not reweight its axes and recovers at each shape that
   does, and that
   `ICtCp × one global constant` beats the incumbent four-bar rule uncorrected (+0.0830, CI
   [0.0174, 0.1461], raw p = 0.023) while not surviving Holm over 144. **No constant changes on
   this** — it funds round 4 arm A, which is designed to settle it decisively.
2. **`d-2026-08-04-the-identity-bar-is-4x-anisotropic-in-oklab`** — record the pure-direction bars
   (lightness ≈ 0.045, chroma ≈ 0.0108, hue ≈ 0.0118) as the pooled quantification of round 3's
   finding, and note that **the missing dimension is larger than the encoded one**. Amends **B9**
   from "unmeasured" to "measured on pooled data, unencoded".
3. **`d-2026-08-04-the-functional-criterion-cannot-support-a-shape-question-at-n-30`** — record that
   no space is separable from any other on `accent-real-1`, that no shape richer than a global
   constant is identifiable, and that **the lightness direction is structurally unmeasurable** from
   isoluminant stimuli. Amends **A16** with the sample-size finding.
4. **`d-2026-08-04-every-contract-constant-carries-an-audit-row`** — adopt the audit table and its
   test tripwire as standing, so a new constant cannot enter `constants.ts` unaudited.

Ledger rows this study touches without closing: **B9** (corroborated and quantified, still
unencoded), **B10**, **B11**, **B12** (named as the sharpest live instance), **B13** (round 3's
question re-posed as a space question), **B31** (still unmeasured; explicitly not in round 4),
**A3** (the epsilons, now with a shape argument rather than only a calibration one), **A16**.

---

## What this study does not settle

- **It does not license changing any constant.** The one Holm-surviving improvement is a *model
  shape in a different colour space*, not a new value for an existing constant, and adopting it
  would mean changing the contract's ruler — a far larger decision than this evidence supports.
- **It cannot separate the top of the identity table.** 16 of 47; the leader and the simplest
  competitive model are indistinguishable.
- **It says nothing about the functional criterion's shape**, by refusal rather than by omission.
- **It is one reviewer.** Everything here is that observer's thresholds, and the observer's own
  repeatability (83.3% at best) caps what any of it can mean.
- **It does not test the region boundaries' *locations*** — only whether a partition at those
  locations is needed. A boundary in the wrong place and a boundary that should not exist look
  similar at n = 184.
- **DIN99d is hand-rolled** and validated only by correlation with ΔE2000 (r = 0.9637) plus property
  checks. It scores mid-table on both criteria and nothing in the findings depends on it.
