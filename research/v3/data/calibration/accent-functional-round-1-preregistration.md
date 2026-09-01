# Accent functional-visibility round 1 — pre-registered

**Batch id:** `accent-functional-1`
**Written:** 2026-08-04, **before the batch was pushed** and therefore before any answer to it can
exist. The fixture was generated first so that this document could quote the realized ladder instead
of an intended one; **nothing below was chosen after seeing an answer**, because there are none.
**Fixture:** `research/v3/data/calibration/accent-functional-round-1.json`
**Generator:** `research/v3/src/review-server/accent-functional.ts --write`
**Analysis:** `research/v3/data/calibration/analyze-accent-functional-round-1.ts`
**Ledger row:** `PHASE_0_LOOSE_ENDS.md` **A16**

---

## 1. The question

`ACCENT_FUNCTIONAL_DISTANCE` (`src/contract/constants.ts:371`) is the OKLab distance at which an
accent carrying **no luminance contrast** still works as an accent. It is the sole escape from
invariant 4's accent APCA floor. It is `[UNCALIBRATED]`, it currently reads `0.14591`, and it is
**in force** — it fails two reviewer-endorsed palettes on the roles matrix today.

Its digits are the geometric midpoint of two rungs of a **detection** ladder. No stimulus has ever
been graded against the criterion the constant is named for. That is the whole defect, and this
round is the repair.

The reviewer's refinement of 2026-08-04, which is the ruling this round implements:

> *"yes, we want to keep that class of accents [isoluminant], but then the color distance must be
> something else than the bracketing calibration tests we've been running. Because if APCA says 0 (or
> close to it) and then we use 'minimal OKLab distance at which I can see the difference' those
> accents will still be hardly perceptible (could sometimes be fine for accents, will not be fine at
> all for foreground)."*

## 2. The criterion, verbatim and load-bearing

This round's entire scientific content is one substituted question. It is recorded here, in the
fixture (`prompts["accent-visible"]`), and in the batch log (`fundedBy`), so that no later reader has
to reconstruct what was asked.

**Question, as shown on screen:**

> **Does this work as an accent at a glance?**

**Instruction, as shown on screen:**

> Not "can you see the difference" — assume you can. At a glance, without hunting: is this colour
> doing an accent's job here — does it pick these elements out as something the eye lands on? If you
> only find it by looking for it, or it reads as a difference rather than as an accent, answer no.

**The criterion string carried with every answer:**

> functional-visibility — does this work as an accent at a glance; explicitly NOT the detection
> criterion of bracketing round 1 part 2 ("are the icons clearly visible on this background")

**What this replaces.** Round 1 part 2 asked *"Can you clearly see the shapes?"* under the
instruction *"Would these icons work as UI elements? If you have to hunt for them or they strain,
answer no."*, and its analysis recorded the question as *"Are the icons clearly visible on this
background?"*. That is a **detection** question, and the reviewer has retracted its answer at 0.08804
as *"hardly perceptible"*.

The instruction's first clause is the one that does the work. *"Not 'can you see the difference' —
assume you can"* **grants the detection question and then declines to ask it**. Without that clause
the two rounds would differ only in tone, and this round would measure nothing new. It is not a hint
about which way to answer: it removes one question from play without favouring either answer to the
other.

## 3. Design

**39 items, one pass, one question**, all of them accent-on-field stimuli (`part: "accent-visible"`).

| group | n | role | what it is for |
|---|---|---|---|
| constructed ladder | 27 | `ladder` | locating the threshold |
| round-1 anchor replays | 4 | `ladder` | measuring the **gap between the two criteria** |
| repeats | 4 | `repeat` | measuring the reviewer's own answer noise |
| controls | 4 | `control-obvious` ×2, `control-identical` ×2 | proving the pass was attended |

### 3.1 The ladder

Nine rungs, log-spaced from **0.06 to 0.30** in OKLab distance, three items per rung — the realized
span is **0.05915 → 0.30218**.

The range brackets the two anchors the reviewer has already spoken to. **0.08804** is the lowest rung
they called clearly visible and have since retracted, so the functional threshold is strictly *above*
it. **0.24181** is the top rung, called visible and **not** retracted — the refinement opens *"we
want to keep that class of accents"* — so a threshold above it would refuse an accent they plainly
endorse. The ladder extends past both ends anyway, so that a threshold landing outside the bracket is
something the round can **see and report**, rather than something it is incapable of representing.

### 3.2 Stratification: 3 accent hue thirds × 3 field lightness bands

A16 leaves stratification to the reviewer and notes the escape is enforced *over a whole rendered
ramp*, so a threshold that held only at mid lightness would be a finding rather than a nuisance.
Bands are OKLab L of the field: **dark [0.35, 0.50) · mid [0.50, 0.65) · light [0.65, 0.80]**. Hue
thirds are those of the **accent** — the colour being asked to do the work — on round 2's boundaries
(0°/120°/240°).

Nine cells, nine rungs, 27 items. Rung *i* takes cells `{i, i+2, i+4} (mod 9)`, cell *c* meaning hue
third `floor(c/3)` and band `c mod 3`. Two properties follow, and the generator asserts both rather
than trusting this paragraph:

1. **Every rung covers all three lightness bands, exactly once** — so lightness can never be
   confounded with distance.
2. **Every cell is used exactly three times.**

Hue third is spread across rungs rather than balanced within them: with three items per rung it
cannot be both, and lightness is the axis the escape is enforced over.

### 3.3 The anchors — this round's sharpest instrument

Four items are **round 1's own stimuli, pixel for pixel**, replayed under the new question. Same
colours, same renderer, same reviewer; one word changed. Any difference in the answers is
attributable to the criterion, because nothing else differs.

| new item | replays | OKLab distance | round 1 answered (detection) | why this rung |
|---|---|---|---|---|
| `af-anchor-p2-ladder-05` | `p2-ladder-05` | 0.06339 | **no** | highest rung detection called invisible |
| `af-anchor-p2-ladder-06` | `p2-ladder-06` | 0.08804 | **yes** | **the crux** — the answer the refinement retracts as "hardly perceptible" |
| `af-anchor-p2-ladder-08` | `p2-ladder-08` | 0.14813 | **yes** | the placeholder 0.14591 sits just below this |
| `af-anchor-p2-ladder-09` | `p2-ladder-09` | 0.24181 | **yes** | endorsed and **not** retracted |

Source batch: `bracketing-round-1-clarified`. The item ids carry the join in plain sight, so no
lookup table decides which old answer a new answer is compared with. The generator recomputes each
distance from the transcribed 8-bit triples and throws if it disagrees with the table above, so a
mistyped channel surfaces as a build failure rather than travelling silently.

The anchors are **shuffled in with everything else**. A replay the reviewer could recognize as a
replay would be answered from memory, and memory of the old answer is precisely the confound these
four exist to exclude.

### 3.4 Isoluminance — the regime the constant actually governs

Every ladder and repeat item is constructed so the accent and field differ in **chroma and hue only**.
Realized across all 31: **max |ΔY| = 0.00215** (budget 0.0025), **max |APCA raw| = 1.98011** (ceiling
`APCA_RAW_IDENTICAL_CEILING` = 1.98152), and **`apcaLc == 0` on every single one**. That last fact is
the point: on the public APCA scale these stimuli carry *exactly zero* luminance contrast, which is
the regime where the accent escape is the only thing standing between the palette and a refusal.

Construction differs from round 1's in one deliberate way. Round 1 drew a near-neutral field and
pushed the accent away from it, which caps reach at the gamut's chroma at that lightness — that is
why its ladder stopped at 0.24181. Here the pair is **split about a centre**: the field sits at
roughly 20–50% of the separation on one side and the accent lands on the other, so each colour needs
only part of the separation's worth of chroma and 0.30 becomes reachable. It also removes an artefact
of round 1's design that nobody chose — that the field was always near-neutral — which for a round
about *fields* would have been a poor thing to bake in.

### 3.5 Controls and repeats

Two controls per direction, double round 1's. A control is the only thing that separates *"the accent
does not work"* from *"the reviewer had drifted into answering a different question"*, and under a
softer, functional criterion that risk is higher. `control-obvious` must be answered **yes** and
`control-identical` (field and accent literally the same colour) must be answered **no** under any
reading of any criterion.

Four repeats, drawn from the middle rungs (2–6) where answers can actually disagree, each separated
from its twin by **≥ 12 served items** (realized: 16, 16, 17, 26). A repeat at either end of the
ladder measures boredom, not noise.

## 4. Rendering: the existing part-2 renderer, unchanged, and why

`review-ui/bracketing.js` `renderAccent()` fills the stage with the **flat field colour** and places
**three accent-coloured elements on it** — a disc, a play-triangle and a ring. That is an accent *in a
role* (it is the transport-control vocabulary of the palette mock itself), and it is emphatically not
a bare swatch pair — the bare pair is `renderPair()`, which part 1 uses and this round never touches.

**A richer mock was considered and deliberately rejected.** It is incompatible with §3.3: identical
stimuli is what makes the four anchors measure the *criterion* gap, and re-rendering them in a new
style would confound criterion with rendering — the one confound this round exists to exclude. So the
rendering stays byte-identical to round 1 and the **question** is the only thing that changes.

*Recorded as a deviation, not hidden as a detail:* the brief that commissioned this round asked for
mock-style stimuli. This is the one place the round does not follow it, for the reason above, and the
substitution is visible on screen the moment anyone opens the page.

## 5. What this round does **not** settle

- **B31, the foreground↔accent bar.** A16 raises it; it is a different pair on a different criterion
  and would need its own stimulus. Not in this fixture, not settled by it.
- **The foreground.** The refinement is explicit that an isoluminant foreground *"will not be fine at
  all"*. Nothing here licenses any foreground escape at any distance.
- **Anything above the epsilon.** A caller who raises `minAccentContrast` is asking for luminance
  contrast specifically; this round speaks only to the zero-contrast escape.

## 6. The fitting rule — how answers become the constant

**Pre-registered in full, before any answer exists.** Evaluated in the order given; the first gate
that trips decides the verdict.

### 6.1 Validity gates, checked before the fit is looked at

- **G1 — controls.** Every control that **has been answered** must be answered correctly:
  `control-obvious` **yes**, `control-identical` **no**. Any *wrong* answer ⇒ verdict **`void`**. No
  threshold is reported and the round is re-run. A control failure is not a data point about colour,
  and it voids the pass the moment it happens rather than at the end.
  *A control that is merely **unanswered** is not a failure* — it is incompleteness, and it is G3's
  business. Keeping those two apart is the difference between "the reviewer was not attending" and
  "the reviewer is not finished", which are not the same finding and must not share a verdict.
- **G2 — repeat consistency.** At least **3 of 4** repeats must agree with their twin. At ≤ 2 of 4 ⇒
  verdict **`noise-dominated`**: the fit is computed and reported as **exploratory only**, and the
  constant is not changed on it. Repeats with only one of the pair answered are not counted either
  way.
- **G3 — coverage.** At least **28 of the 31** fitted items answered **and all four controls
  answered**. Below either ⇒ verdict **`incomplete`**, no adoption.

### 6.2 The primary fit

Logistic regression of the boolean answer on the item's **achieved** `truth.okLabDistance` (never its
ladder target), over the **31 items with `role == "ladder"`** — the 27 constructed plus the 4 anchors.
Repeats are **excluded** from the fit: they measure noise, not location, and including a duplicated
point would double-weight one rung.

The estimator is **`fitLogistic` from `src/review-server/analyze-bracketing.ts`, unchanged** — the same
function that produced `SAME_COLOR_BAR_BY_REGION` and the retired 0.07444. Reusing it is deliberate:
a threshold from this round must be comparable to the thresholds it is being contrasted with, and
that requires the same estimator, not merely a similar one.

**The calibrated value is `fit.threshold`, rounded to five decimals** — the distance at which the
fitted probability of "works as an accent" is 0.5. Five decimals matches every other calibrated
constant in the contract.

**Under complete separation** — every item below some distance answered no and every item above
answered yes — `fitLogistic` reports the **geometric** midpoint of the separation interval and sets
`separated: true`. That is used as-is. It is what round 1 part 2 did (its 0.07444 is
`sqrt(0.06300 × 0.08796)`) and what `constants.ts` already does for this very constant, so a separated
outcome produces a number wrong in the *same documented way* as its predecessors rather than a new
one. `separated: true` is reported in the headline, never buried: a bracket is not a measurement.

### 6.3 The criterion gap — the round's second deliverable

Reported whether or not the fit is adopted, because it is the thing A16 says has never been measured:

- **Per anchor**, a 2×2 of round 1's detection answer against this round's functional answer on the
  identical stimulus. `p2-ladder-06` (0.08804) is the pre-registered crux: detection said **yes**, and
  the refinement predicts function says **no**. That single cell is the criterion gap made visible.
- **`criterionGap = functionalThreshold − 0.07444`**, reported with sign and with the functional
  threshold's 95% interval. The refinement's claim is that this is **positive**. A gap whose interval
  includes zero means the reviewer does not in fact distinguish the two criteria on these stimuli —
  a real and publishable outcome, and one that would put the entire two-tier semantics back on the
  table rather than merely re-tuning a digit.

### 6.4 Adoption, and the four ways it is refused

If G1–G3 pass and the fit converges, the proposal is
`ACCENT_FUNCTIONAL_DISTANCE := round(fit.threshold, 5)`, tag `[UNCALIBRATED]` → `[REVIEWED]`,
provenance citing this round and this document. **Refused, and reported as such, if:**

1. **`threshold < 0.08804`** — it would contradict the reviewer's own retraction of that rung.
   Verdict **`contradicts-retraction`**. The likely cause is that the wording did not land, and the
   repair is a re-worded round, not a smaller number.
2. **`threshold > 0.24181`** — it would refuse an accent the reviewer explicitly endorses. Verdict
   **`refuses-endorsed`**.
3. **Stratum dependence.** If any per-band or per-hue-third fit's threshold falls outside the
   **pooled 95% interval**, verdict **`stratum-dependent`** and **no single scalar is adopted**. This
   is not a new rule: round 1 found one threshold did not survive all four quadrants and round 2 was
   commissioned to refine it, which is exactly the escalation this clause triggers.
4. **`separated: true` with a separation interval wider than 1.5×** the pooled interval of round 1
   part 2 (0.05211–0.10564, width 0.05353) — i.e. a bracket too loose to call a measurement. Verdict
   **`bracketed-only`**: the interval is reported, the placeholder stays, and the ladder is refined
   around the gap.

**Adoption is the reviewer's act, not an agent's.** As with A17, the analysis writes
`DECISION PENDING` and proposes; it does not edit the constant. What the analysis *may* do without
asking is replace a dangling citation with a real one.

### 6.5 Exploratory — reported, never used to pick the headline

Per-hue-third and per-band fits; the distance at which the fitted probability first exceeds 0.9;
answer latency if the warehouse carries it; and the anchor table in full. These are labelled
exploratory in the output and none of them can change the verdict.

## 7. Output

`research/v3/data/calibration/accent-functional-round-1-analysis.json`, schema
`accent-functional-round-1-analysis/v1`, written by
`data/calibration/analyze-accent-functional-round-1.ts`. It echoes this document's rule verbatim
under `preRegisteredRule` and records `answerHygiene` (the `collectAnswers` skip counts) so that a
clean round is visibly clean.

---

# 8. Results — appended 2026-08-04, after the round was answered

*Written by the scoring pass over `accent-functional-1`. The analyzer
(`data/calibration/analyze-accent-functional-round-1.ts`) was **run unmodified** — it did not crash
and nothing in it was touched. Everything below is read off
`data/calibration/accent-functional-round-1-analysis.json`; where this section adds a number the
analyzer did not compute, it is labelled as such and it changes no verdict.*

## 8.1 Headline

**Verdict: `contradicts-retraction`. The constant does not move.**

The fitted functional threshold is **0.04554** (`separated: false`, converged, 95% CI
**[0.01826, 0.11356]**). It is **below** the 0.08804 lower anchor, so §6.4 refusal condition 1 fires
and no value is proposed for `ACCENT_FUNCTIONAL_DISTANCE`.

**The criterion gap is negative: −0.02890.** §6.3 predicted a positive gap — the refinement's whole
claim is that function needs *more* separation than detection. On these stimuli it needed **no more**,
and the point estimate says slightly less. The pooled interval contains 0.07444, so this is precisely
the outcome §6.3 pre-registered as *"the reviewer does not in fact distinguish the two criteria on
these stimuli — a real and publishable outcome, and one that would put the entire two-tier semantics
back on the table rather than merely re-tuning a digit."* That clause was written before any answer
existed, and it is the clause that fired.

## 8.2 The validity gates — all three pass, cleanly

The round is **complete and clean**: 39 of 39 items answered, by `flo`, in one pass on 2026-08-04
07:02:33Z–07:03:54Z.

| gate | requirement | realized | outcome |
|---|---|---|---|
| **G1** controls | every answered control correct | **4/4 answered, 4/4 correct** — both `control-obvious` **yes**, both `control-identical` **no** | **pass** |
| **G2** repeats | ≥ 3 of 4 agree | **4/4 both-answered, 4/4 agreed** (agreement 1.00) | **pass** |
| **G3** coverage | ≥ 28 of 31 fitted answered **and** 4/4 controls | **31/31 fitted**, **4/4 controls** | **pass** |

`answerHygiene` is empty where it should be: `unknownItem` 0, `questionKeyMismatch` 0,
`nonBooleanAnswer` 0, `retracted` 0, `superseded` 0. The 812 `otherLabelSchema` and 286 `otherBatch`
skips are the rest of the warehouse being correctly ignored.

**This matters for how the result is read.** The gates exist to separate *"the accent does not work"*
from *"the reviewer had drifted"*. Nothing drifted. Perfect controls and perfect repeat consistency
mean the answers below are the reviewer attending to the question they were shown, and the negative
gap cannot be dismissed as noise or inattention.

## 8.3 The answers, in full

28 of 31 fitted items **yes**. Only **three** noes, and their placement is the whole story:

| distance | answer | item |
|---|---|---|
| 0.05915 | yes | `af-ladder-r00-h0-dark` |
| **0.06057** | **no** | `af-ladder-r00-h1-mid` |
| 0.06140 | yes | `af-ladder-r00-h0-light` |
| **0.06339** | **no** | `af-anchor-p2-ladder-05` |
| 0.07332 → 0.30218 | **yes on all 26 remaining rungs** | except one |
| **0.13564** | **no** | `af-ladder-r04-h2-light` |

Everything from 0.07332 upward was called a working accent **except a single item at 0.13564**. The
empirical switch sits between 0.06339 (no) and 0.07332 (yes).

**Not computed by the analyzer, and it does not change the verdict:** the geometric midpoint of that
empirical switch is **0.06817**. It is worth writing down because the pooled fit's 0.04554 is partly
an estimator artefact — the lone high-distance "no" at 0.13564 flattens the logistic slope
(2.76 pooled, against 18.9 and 22.3 in the two strata that separate cleanly) and drags the fitted 50%
point below every observed "no". **The refusal is robust to that artefact**: 0.06817 is still below
0.08804 and still below 0.07444, so the verdict and the sign of the gap are the same under the most
favourable reading of the answers available. The reported headline stays `fit.threshold` = 0.04554,
because that is what §6.2 pre-registered and this paragraph is not permitted to replace it.

## 8.4 All four adoption-refusal checks, reported individually

The pre-registered order stops at the first trip, so only condition 1 named the verdict. The other
three are evaluated and reported here anyway, because "not reached" is not the same as "would have
passed" and the record should not have to guess.

| # | condition | value | fires? |
|---|---|---|---|
| **1** | `threshold < 0.08804` | 0.04554 < 0.08804 | **YES — this is the verdict** |
| 2 | `threshold > 0.24181` | 0.04554 ≯ 0.24181 | no |
| 3 | stratum dependence — any band/hue fit outside pooled CI | `disagreeingStrata` **empty**; the three strata that produced a threshold (0.06664, 0.06672, 0.04557) all sit inside [0.01826, 0.11356] | no — **but see §8.6, this is a weak pass** |
| 4 | `separated: true` with gap > 1.5 × 0.05353 | pooled `separated: false`, `separationInterval: null` | not applicable |

## 8.5 The criterion gap and the anchor 2×2 — the round's sharpest instrument, and it came back flat

Four items replayed round 1's stimuli **pixel for pixel** under the substituted question. The join is
in the item ids; round 1's answers were re-collected from the warehouse at analysis time
(`bracketing-round-1-clarified`, hygiene clean: 0 retracted, 0 superseded).

| item | distance | round 1 — **detection** | this round — **function** | flipped yes→no? |
|---|---|---|---|---|
| `af-anchor-p2-ladder-05` | 0.06339 | **no** | **no** | — |
| `af-anchor-p2-ladder-06` | **0.08804** | **yes** | **yes** | **no — the crux prediction failed** |
| `af-anchor-p2-ladder-08` | 0.14813 | **yes** | **yes** | no |
| `af-anchor-p2-ladder-09` | 0.24181 | **yes** | **yes** | no |

**The 2×2 collapses onto its diagonal.** 1 no/no, 3 yes/yes, **0 off-diagonal cells**,
`flippedYesToNo: 0`. §3.3 nominated `p2-ladder-06` as *"the crux — the answer the refinement retracts
as 'hardly perceptible'"*, and §6.3 predicted that cell would flip. It did not. On the identical
pixels, with one word changed, the reviewer gave **the same answer four times out of four**.

`criterionGap = 0.04554 − 0.07444 = **−0.02890**`, `gapIsPositive: false`, and the functional
threshold's 95% interval **[0.01826, 0.11356] contains 0.07444** — so the gap's interval straddles
zero and the two criteria are not separated by this round.

**What the round cannot tell you, stated plainly.** Two readings survive this data and it does not
discriminate between them:

1. **The wording did not land** — the analyzer's canned reason. The reviewer read the functional
   question and answered the detection one anyway. Consistent with the 4/4 anchor reproduction.
2. **The wording landed and the retraction was a priori.** The retraction was written in prose about
   a *class* of accents (*"those accents will still be hardly perceptible"*), not in front of the
   stimulus. Shown the actual 0.08804 stimulus and asked whether it does an accent's job, the reviewer
   said yes. Under this reading the round is a correct measurement that contradicts a prediction, and
   the thing to revise is the prediction.

The gates cannot separate these: perfect controls prove *attention*, not *criterion adoption*. §3.5
anticipated the first risk and doubled the controls for it; the controls came back clean, which
narrows the failure to the criterion itself rather than the pass. **Deciding between reading 1 and
reading 2 is the reviewer's call and it is the single most valuable thing they could say next**, because
reading 1 costs a re-worded round and reading 2 puts the two-tier semantics itself back on the table.

## 8.6 Per-band and per-hue fits vs pooled — half the strata carry no threshold at all

| stratum | n | yes | threshold | separated | interval |
|---|---|---|---|---|---|
| **pooled** | 31 | 28 | **0.04554** | no | CI [0.01826, 0.11356] |
| band dark | 9 | **9** | **none** | — | degenerate: every answer yes |
| band mid | 9 | 8 | 0.06664 | **yes** | sep [0.06057, 0.07332], CI [0.05418, 0.08230] |
| band light | 9 | 8 | **none** | — | **slope negative (−0.0410)** — "the answers do not run the expected way" |
| hue third 0 | 9 | **9** | **none** | — | degenerate: every answer yes |
| hue third 1 | 9 | 8 | 0.06672 | **yes** | sep [0.06057, 0.07349], CI [0.05507, 0.07867] |
| hue third 2 | 9 | 8 | 0.04557 | no | CI [0.00067, **3.08650**] — unbounded in practice |

Guardrail 3 does not fire, and it is important to say *why* it does not: **three of the six strata
produced no threshold to compare**, and a fourth (hue third 2) produced an interval so wide it could
not have disagreed with anything. Absence of evidence is not agreement. The two strata that do
separate cleanly — mid band and hue third 1 — agree with each other closely (0.06664, 0.06672) and
both land near the empirical switch of §8.3 rather than near the pooled 0.04554.

The **light band running backwards** is the one substantive stratum finding: it is where the lone
0.13564 "no" sits, and it is the only cut where more distance did not buy more yeses. On n=9 with one
dissenting answer this is a hint, not a result, and §6.5 labels these exploratory — it cannot and does
not change the verdict.

## 8.7 What this round did settle

Not the constant. But not nothing:

- **The placeholder 0.14591 is excluded at 95%.** The pooled CI is [0.01826, 0.11356] and 0.14591
  lies outside it. The round could not say what the number *is*; it can say the number currently in
  force is **not supported by the only stimuli ever graded against the criterion it is named for**.
  Every verdict resting on 0.14591 was already flagged provisional by its own decision record; this
  round is the first evidence that the flag was warranted, and it points **downward**.
- **The isoluminant accent class is real and the reviewer wants it.** 28 of 31 zero-`Lc` stimuli were
  called working accents, across all three lightness bands and all three hue thirds, on stimuli where
  `apcaLc == 0` on every single item. Whatever replaces 0.14591, an escape clause of some kind is
  clearly warranted — §5's refusal to extend any of this to the foreground is untouched.
- **A16's defect is repaired in one direction.** A stimulus has now been graded against the functional
  criterion. The dangling citation is no longer dangling; what is dangling now is the *prediction*.

## 8.8 What it did not settle, and what a repair round needs

- **The constant.** `ACCENT_FUNCTIONAL_DISTANCE` stays `0.14591` and stays `[UNCALIBRATED]`. No diff
  is proposed. See §8.9.
- **Which of §8.5's two readings is true.** This is a question for the reviewer, not for another
  ladder. A re-worded round built on reading 1 would be wasted effort if reading 2 is the truth.
- **Everything §5 already excluded** — B31, the foreground, and anything above the epsilon — remains
  excluded. Nothing here licenses a foreground escape at any distance.
- **A repair round should not simply re-word and re-run.** The ladder's informative region is now
  known to be **below 0.075**, not the 0.06–0.30 span this round spent 27 items on: 26 of 31 items
  bought no information because they were answered yes and were never in doubt. If a round is built,
  it should concentrate its rungs in 0.04–0.10 and, more importantly, should ask the reviewer to
  adjudicate §8.5 first.

## 8.9 The two pending items that turn on this number

**§6.4's condition for a proposal is not met** — the fitted threshold is outside the adoption window
and refusal condition 1 fired. Therefore:

**The `constants.ts` diff: NOT PROPOSED.** No change to `research/v3/src/contract/constants.ts:371`.
The declaration, its `[UNCALIBRATED]` tag, and its provenance stay exactly as they are. The only
amendment this scoring pass would be permitted to make without asking (§6.4, last line) is replacing a
dangling citation with a real one — and the citation to *"the proposed functional-visibility round in
the loose-end ledger"* (constants.ts:360) is no longer dangling in either direction, so even that is
left for the reviewer to fold in alongside whatever they decide about §8.5.

**Endorsement-recheck item 2 — the Sunshine-on-Beige accent at 0.121: STILL BLOCKED, and this round
does not decide it.** The rule is `escapeDenied = pair.distance < ACCENT_FUNCTIONAL_DISTANCE`
(`src/review-server/endorsement-recheck.ts:289`). Under the placeholder, 0.121 < 0.14591 → the escape
is denied and the endorsed palette fails, which is exactly the state that item is asking the reviewer
about. Since no value is adopted, **the item's premise is unchanged and it remains a live reviewer
question.**

That said, this round carries direct evidence that bears on it, and suppressing it would be dishonest:
**0.121 sits inside a region this round found overwhelmingly functional.** The three ladder items
nearest it — 0.10916, 0.10977, 0.11147 — were all answered **yes**, as was 0.13509, 0.13543 and the
0.14813 anchor; the only nearby "no" is the 0.13564 outlier in the light band. And the fitted threshold,
had it been adoptable, would have put 0.121 well clear (0.121 ≥ 0.04554 → escape granted → the
endorsement stands). So every reading of this round's answers — the pooled fit, the empirical switch
at 0.06817, the two clean strata at ~0.0666 — puts the Sunshine accent **above** the functional bar.
None of that is an adoption, and the item is not resolved by it; it is a statement about which way the
evidence points if and when the reviewer resolves §8.5.

## 8.10 Artifacts

- `research/v3/data/calibration/accent-functional-round-1-analysis.json` — schema
  `accent-functional-round-1-analysis/v1`, written by the unmodified analyzer.
- `research/v3/data/decisions/proposed-accent-functional-1.json` — the **proposed** decision record,
  NOT placed in `decisions.json`. `fundedBy` carries the 39 answered label ids and the
  `batch-complete` record.

**DECISION PENDING.** Adoption — and here, the choice between §8.5's two readings — is the reviewer's
act, not this pass's.
