# The "belongs" study — can source support be measured well enough to enforce automatically?

**Written 2026-08-04.** Measurements regenerate with:

```sh
NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/src/contract/belongs-study.ts --write
```

Data file: `research/v3/data/contract/belongs-study.json`. Script: `research/v3/src/contract/belongs-study.ts`.

**This study does not change the contract.** It measures. The recommendation at the end is a
proposal for the reviewer, and the round `dropped-colors-1` exists to fund it.

---

## The question, and how it was reframed

Invariant 2 (`validateSourceSupport`, `src/contract/invariants.ts:1064`) requires every published
colour to be an exact 8-bit pixel of the artwork occupying at least `SOURCE_POPULATION_FLOOR` of
it. `reviews/toolbox-review/bias-audit.md` B1 measured that this refuses **96.9% of the reviewer's
own endorsed palettes**, and proposed measuring population within the calibrated same-colour bar
instead.

The reviewer then reframed the target, and the reframing is the whole reason this study exists:

> the real criterion is not "the colour exists in the artwork" but "the colour **feels like it
> belongs** in the artwork" — enforcement "that is not limiting, but also that is automated so I
> don't have to vibe-check every proposed palette."

So the question is not "is B1's fix better than what ships" (it plainly is). It is: **is there a
cheap pixel-level feature that tells endorsed colours apart from bad ones well enough to be a
gate?** If yes, calibrate the invariant on it. If no, the invariant cannot be doing the job it is
currently claimed to do, whatever value its constant takes.

---

## Method

### Unit of analysis

**One distinct `(artwork contentSha256, published hex)` pair.** Every feature below is a pure
function of that pair, so counting a colour once per role — or once per palette that republishes
it — would be pseudo-replication, the exact defect `reviews/toolbox-review/gap-scan.md` §5 records
as having moved two frozen constants by more than 10% elsewhere in this campaign.

Counts at all three levels, so nothing is hidden behind a favourable denominator:

| set | palettes | role-colour instances | distinct (artwork, colour) units | distinct artworks |
|---|---|---|---|---|
| `endorsements.json` | 351 | 1,397 | 877 | 173 |
| `known-bad.json` | 37 | 148 | 107 | 26 |
| `acceptable.json` | 166 | 664 | 439 | 89 |

Artworks are decoded at native resolution via `sharp`, forced to sRGB, alpha removed — the same
decode path as `src/review-server/composer.ts`, and no resizing, per the design constraint that a
downscaled copy offers resampling averages rather than source pixels.

A role that is absent is skipped, never counted as a failure (`data/legacy/README.md` A6). Three
endorsement entries are partial (one has no accent, two are accent-only).

### The five candidate features

Each is oriented in the reporting table so **higher always means "belongs more"**; distances are
negated at read time, and the stored data file keeps the natural sign.

- **(a) `exactShare`** — exact-triple population share. *The rule shipping today.*
- **(b) `neighbourhoodShare`** — summed population of every artwork triple within the pair's
  regional same-colour bar (`sameColorBar` = `Math.max` of the two colours' `SAME_COLOR_BAR_BY_REGION`
  entries). *The B1 fix.* No new constant.
- **(c) `modeDistance`** — OKLab distance to the nearest *substantial colour mode* of the artwork.
- **(d) `hueDistance`** — hue-angle distance to the nearest substantial mode, lightness and chroma
  free. The "same hue, adjusted tone" relation a designer would name.
- **(e) `toneRelaxed`** — (c) with the lightness axis scaled by `wL`. A declared one-parameter
  family whose endpoints are exactly (c) at `wL=1` and "any tone of this hue and chroma" at `wL=0`.

### How modes are defined, and why this way

**Mass-ordered leader clustering in OKLab at radius `R`**, then keep modes whose mass is at least
`m_min` of the artwork. Centroids are mass-weighted means of their members.

Deliberately **not** k-means: k-means needs a `k` that nobody can justify per artwork, and its
centroids drift into the empty space *between* two real modes, which would systematically flatter
feature (c). Leader clustering makes one honest claim — "the heaviest unclaimed colour is a mode,
everything within `R` of it belongs to it" — and has no free parameter beyond `R`.

Colours are pre-binned onto a **0.005-edge OKLab lattice** first, purely so that clustering over
~10⁵ distinct JPEG triples is tractable. 0.005 is below the *tightest* calibrated same-colour bar
(dark-neutral, 0.00932), so pre-binning cannot merge two colours the reviewer's own ruler would
call different. It is an efficiency device, not a perceptual claim.

Sanity check on `01/ab67616d00001e0200015a7a9909e03141e001e3.jpg` (90,000 px, 15,274 distinct
triples): at `R=0.05` it finds 47 modes, of which **9 are ≥1% and together cover 93.4%** of the
artwork — a dark red at 38.9%, a dark brown at 19.7%, an ivory at 19.3%. The endorsed palette for
that cover is `#4d1812` Dried Blood / `#362c23` Cola / `#e8ddcb` Ivory / `#d79b67` Honey. The modes
are the palette. The finder works.

### Free parameters are grids, declared before measurement

`R ∈ {0.03, 0.05, 0.10}` — anchored at both ends by something calibrated: 0.03 sits just above the
loosest same-colour bar (light-saturated, 0.02293), so even the tightest grid cell cannot call two
colours one mode when the reviewer would call them different; 0.10 is roughly 4× that bar, the
scale at which two colours are plainly different colours.

`m_min ∈ {0.005, 0.01, 0.02}`; `wL ∈ {0, 0.25, 0.5, 1}`.

**Every cell of every grid is reported.** Nothing selects a cell by its score — the primary cell
(`R=0.05`, `m_min=0.01`) is the *midpoint*, chosen for being the midpoint. This is the guard
against `gap-scan.md` §5's "post-hoc threshold" defect.

### Statistics

- **AUC** is the Mann-Whitney probability that a random endorsed colour scores above a random
  known-bad colour, ties at half. 0.5 is no separation.
- **Intervals are a cluster bootstrap over artworks**, 2,000 resamples, seeded (`20260804`).
  Colours within one artwork share pixels and a palette and are not independent draws; resampling
  *colours* would report an interval several times too narrow.
- **"Separates" requires the 95% interval to exclude 0.5 entirely.** A demanding bar, on purpose.
- **No p-values are quoted.** With 26 negative clusters there is no test here whose assumptions
  hold well enough to be worth the sentence.

### The caveat that governs every number below

**`known-bad.json` grades palettes, not colours.** It records that the reviewer rejected a
*palette*; it does not record *which colour* was wrong. Labelling all four role colours of a
rejected palette "does not belong" is certainly wrong for some of them — a palette can be rejected
for one bad accent while its background is beyond reproach.

This transfer is **diluting, not biasing**: it mixes genuinely-belonging colours into the negative
class, pushing every measured separation *down* toward 0.5. Therefore:

- a feature that separates **despite** this is real;
- a feature that does not separate has **not been shown to be useless** — the instrument may simply
  be too blunt to see it.

Every null below must be read with that asymmetry. This is the single largest limitation of the
study and no recommendation may quietly forget it.

Two further inherited caveats, both from `data/legacy/README.md`: the v2-3 grades are **censored and
relative** (a grade attaches to the winner of whichever blinded pair the reviewer happened to see,
so `strong` never means "uniquely best"), and 5 known-bad-graded palettes were also graded
`acceptable` or `strong` in some other comparison.

---

## Result 1 — B1 reproduces exactly, independently

Measured 2026-08-04 by this script, which shares no code with the audit's ad-hoc measurement:

| population rule | endorsed palettes refused | endorsed role-colour pass rate |
|---|---|---|
| exact triple (ships today) | **340 / 351 — 96.9%** | 344 / 1,397 — **24.6%** |
| same-colour-bar neighbourhood | **62 / 351 — 17.7%** | 1,324 / 1,397 — **94.8%** |

Every figure matches `bias-audit.md` B1 to the digit. B1's measurement stands.

At the deduplicated unit level the same fix moves colour pass from 191/877 (21.8%) to 824/877
(94.0%), leaving **53 distinct endorsed (artwork, colour) units still failing**. Those 53 are the
subject of round `dropped-colors-1`.

---

## Result 2 — per-feature separation. Nothing separates.

Endorsed (n=877 units, 173 artworks) against known-bad (n=107 units, 26 artworks). Quantiles are in
the feature's natural sign; AUC is oriented so higher = belongs more.

| feature | endorsed median | known-bad median | AUC | 95% cluster CI | separates? |
|---|---|---|---|---|---|
| **(a)** exact-triple share | 8.54e-5 | 6.84e-5 | 0.509 | [0.453, 0.566] | **no** |
| **(b)** same-colour-bar share | 1.68e-2 | 1.80e-2 | 0.479 | [0.423, 0.534] | **no** |
| **(c)** mode distance `r0.05/m0.01` | 0.0120 | 0.0098 | 0.456 | [0.390, 0.523] | **no** |
| **(d)** hue distance `r0.05/m0.01` | 0.95° | 0.87° | 0.491 | [0.394, 0.597] | **no** |
| **(e)** tone-relaxed `wL=0` | — | — | 0.478 | [0.414, 0.542] | **no** |
| **(e)** tone-relaxed `wL=0.5` | — | — | 0.455 | [0.387, 0.524] | **no** |

The full 24-row table over every grid cell is in `belongs-study.json` → `separation`. **Every single
cell's interval contains 0.5.** The best point estimate anywhere in the grid is 0.525
(`d.hueDistance[r0.03/m0.005]`, CI [0.432, 0.621]) and the worst is 0.440 — the spread across 24
cells is itself consistent with noise around 0.5.

Note the direction: several features point the *wrong way* (AUC < 0.5), i.e. known-bad colours sit
marginally closer to artwork modes and occupy marginally more area than endorsed ones. Not
significantly — but there is no hint of the expected effect to be found by looking harder.

### The two features that are genuinely bounded, and the ones that are only underpowered

This distinction matters and is easy to elide:

- **(a) and (b) are measured nulls.** With 877 vs 107 units over 173 vs 26 clusters, their
  intervals are [0.453, 0.566] and [0.423, 0.534]. A strong effect is *excluded* — whatever
  separates good palettes from bad ones, it is not the area a colour occupies, in either the exact
  or the neighbourhood sense.
- **(c), (d) and (e) are underpowered nulls.** Their intervals run to 0.62 in places. They are
  consistent with no effect and also with a weak one. They have not been refuted; they have failed
  to show up on an instrument this blunt.

**Feature (d) has a further problem that would disqualify it as a gate even if it worked: it is
undefined for 48.5% of endorsed colours.** Hue angle is meaningless near the neutral axis, so by
the contract's own `REGION_CHROMA_BOUNDARY` the feature cannot be evaluated for nearly half of
published colours — palettes are full of near-neutral backgrounds and near-white foregrounds. A
gate that abstains on half its inputs is not a gate. (The share is reported rather than papered
over, per `REVIEW_UI.md` §4's rule that an escape's share is a first-class result.)

---

## Result 3 — the rule is quality-blind at every possible calibration

This is the finding that decides the recommendation. Colour-level failure rates, and the difference
with a cluster bootstrap over artworks:

| rule | endorsed colours failing | known-bad colours failing | difference | 95% cluster CI |
|---|---|---|---|---|
| exact triple | 78.2% | 79.4% | −1.2 pp | [−10.2, +7.5] |
| same-colour bar | 6.0% | 4.7% | **+1.4 pp** | [−4.6, +6.0] |

Both rules refuse endorsed and known-bad colours at **statistically indistinguishable rates**, and
both point very slightly the *wrong* way — marginally harsher on the reviewer's endorsements than
on the palettes they rejected. B1 found exactly this for the exact rule (endorsed 96.9%, known-bad
94.6%); the fix does not repair it, it just moves everything down together.

And it is not a matter of picking a better floor. Sweeping the floor across two orders of magnitude:

| floor | endorsed colour pass | known-bad colour pass | acceptable colour pass |
|---|---|---|---|
| 1e-3 (ships today) | 94.0% | 95.3% | 95.4% |
| 5e-4 | 97.1% | 98.1% | 98.6% |
| 2e-4 | 99.1% | 98.1% | 99.8% |
| 1e-4 | 99.8% | 99.1% | 100.0% |
| 5e-5 | 100.0% | 100.0% | 100.0% |

**There is no floor at which the rule prefers endorsed colours to known-bad ones.** The minimum
neighbourhood share among endorsed colours is 6.59e-5 and among known-bad colours is 5.86e-5 — the
two distributions do not merely overlap, they have the same support. Any floor that admits all
endorsed work also admits all rejected work; any floor that excludes some rejected work excludes at
least as much endorsed work.

The three tiers rank identically at every floor. Whatever `acceptable` → `strong` measures, this
feature does not see it.

---

## Result 4 — which endorsed colours still fail, and what they have in common

**53 distinct (artwork, colour) units**, across 42 artworks and 48 endorsement entries. All sit in a
narrow band just under the floor: neighbourhood share from **6.59e-5 to 9.79e-4** (the floor is
1e-3) — under one order of magnitude, so this is a boundary population, not a tail of absurdities.

By role, against that role's share of all endorsed units:

| role | failing | all endorsed units | failure rate |
|---|---|---|---|
| accent | 30 | 271 | **11.1%** |
| foreground | 19 | 228 | 8.3% |
| background | 5 | 221 | 2.3% |
| surface | 2 | 244 | 0.8% |

The gate bites hardest on **accent**, then foreground — v2-3's most-complained role and the one
`V3_PLAN.md` §1 criterion 3 names: *"v2-3's candidacy walls made the reviewer's corrected accents
structurally unpublishable."* B1 found the same ordering for the exact rule. The wall survives the
fix in miniature.

By region: dark-neutral 19, dark-saturated 19, light-saturated 9, light-neutral 6.

**These colours are not near-misses of the mode structure — they are genuinely off-mode.** Their
median distance to the nearest substantial mode is **0.093**, against 0.012 for endorsed colours
overall: nearly 8× further. So the residual is a coherent class, and it is a recognisable one — a
small, deliberately-chosen accent that is *not* one of the artwork's big colour masses. That is
what an accent is for. Whether such a colour "belongs" is exactly the judgement no pixel statistic
in this study can make, and exactly what `dropped-colors-1` asks.

---

## Recommendation: **demote the population floor to advisory.** Keep exact-pixel provenance as a hard gate.

Argued from the measurements above, not from taste.

### What should stay hard

**Exact-pixel provenance.** B1 measured that only **1 of 1,397** endorsed role colours was absent
from its source: v2-3 already published source pixels, essentially without exception. A hard gate
that fires once in 1,397 on endorsed work is cheap, is not limiting, and catches the one thing the
invariant's own docstring is right about — *"a palette colour that is not in the image is an
invention"*. Nothing in this study argues against it.

### What should be demoted

**The population floor, in both its exact and its neighbourhood form.** Three measured reasons:

1. **It does not discriminate quality — at any calibration.** Result 3. Endorsed and known-bad
   colours have the same support and indistinguishable failure rates across two orders of magnitude
   of floor. A gate that fires equally on work the reviewer praised and work they rejected is not
   measuring quality; it is measuring something else (how much of a histogram spike a colour sits
   on) and being read as if it measured quality.
2. **It is structurally biased against the role that matters most.** Result 4: accent fails at
   11.1% against surface's 0.8%. The failing colours are 8× further from the artwork's modes than
   endorsed colours generally — which is the definition of an accent, not a defect in it. Keeping
   this hard re-erects the candidacy wall `V3_PLAN.md` was written to remove, one layer down.
3. **The campaign's own meta-rule already decides it.** `PHASE_0_DECISIONS.md` §4: *"an invariant
   that ever blocks an endorsed palette is demoted — the reviewer outranks the rule."* It blocks
   340 of 351 today and 62 of 351 after the fix. B1 said this; nothing measured since weakens it.

**Demoted means:** `validateSourceSupport` continues to compute the population — using the
same-colour-bar neighbourhood, which is strictly the better measure of "how much of the artwork is
this colour" — and reports it as an advisory finding alongside the deferred `I2.spatial-spread`,
never as a `Violation`. It stays visible, it stays regenerable, it stops refusing publication.

### Why not "calibrate the floor from these verdicts"

Because Result 3 shows there is nothing to calibrate *to*. Calibration presumes a threshold exists
that separates the classes; the two classes have the same support. Fitting a floor to these
verdicts would produce a number with a provenance story and no discriminating power — precisely the
`[FITTED]` hazard `bias-audit.md` B8 asks the honesty census to start scoring. A floor of 5e-5
would admit 100% of endorsed colours, but it would also admit 100% of known-bad ones, and shipping
it as "calibrated against the reviewer" would overstate what it does.

### Why not a hybrid

A hybrid (hard gate at a very low floor, advisory above it) is defensible and is the natural
fallback if the reviewer wants *something* hard. But it buys little: at 5e-5 the gate never fires
on any of the three tiers, so it is an advisory rule wearing a gate's costume, and it carries the
risk that a future reader mistakes its greenness for evidence of quality. If it is adopted, the
floor should be set at **5e-5** — below the minimum observed on *any* tier — and its docstring must
say in terms that it is a noise guard, not a quality signal.

### What the reviewer is actually being asked for

The reframe asked for automated enforcement of *belongs*. **This study did not find a pixel feature
that can carry that.** It found that the strongest candidates (a, b) are measurably not it, and
that the more interesting candidates (c, d, e) are unrefuted but invisible on an instrument
weakened by a palette-level negative label. That is a real result and it should not be dressed up:
**automating "belongs" is not blocked on picking a threshold, it is blocked on not having a
colour-level "does not belong" label to calibrate against.**

`dropped-colors-1` is the cheapest possible first payment on that label. It asks, of 20 of the 53
residual colours, the one question that would let any of this be calibrated: *does this colour
belong in this artwork's palette?* Twenty colour-level verdicts on a boundary population is not a
calibration set, but it is the first colour-level "belongs" data the campaign would own, and it
directly settles whether the 53 are a defect worth gating on or a feature worth protecting.

### Standing limitations of this study

- The negative class is palette-labelled (see Method). Every null is a lower bound.
- 26 negative clusters. Features (c)–(e) are underpowered, not refuted.
- v2-3-contract palettes, censored and relative grades, and the floor was never applied to them.
- Decoder agreement between this `sharp` path and the campaign's Python/PIL path has never been
  checked (`gap-scan.md` §6a); neither applies ICC profiles. All three tiers go through the same
  decoder here, so a decoder bias would have to be *class-dependent* to produce a spurious null —
  but it could inflate or deflate the absolute shares.
- Mode radius, mass floor and lightness weight are `[UNCALIBRATED]` grids. They were never
  selected on score, but nor were they calibrated against anything; a bracketing round on "is this
  one of the artwork's colours?" would be the way to earn them.
