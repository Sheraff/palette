# Perception round 4 — "the shape round". Pre-registration.

**Batch id:** `perception-4`
**Written:** 2026-08-04, **before the batch was pushed**. Every scoring rule, gate, refusal condition
and adoption window below was fixed before a single answer existed — there are none yet, and the
round has not been shown to anyone.
**Fixture:** `research/v3/data/calibration/perception-round-4.json` (148 items)
**Truth (never served):** `research/v3/data/calibration/perception-round-4-truth.json`
**Render side-car (served, carries no truth):** `research/v3/review-ui/perception-4.data.json`
**Generator:** `research/v3/src/review-server/perception-4.ts` — seeded (`20260804_44`), no clock
**Page:** `/perception-4` — on the round kit; `review-ui/perception-4.js` + `.html`
**Tests:** `research/v3/tests/review-server-perception-4.test.ts` (39 tests, including the
executing-page suite and the live-payload key smoke)
**Commissioned by:** `research/v3/src/contract/PERCEPTION_MODEL_STUDY.md` PART 2, *"Proposed round 4
— the shape round"*, sized by simulation in `src/contract/perception-model-round-design.ts`
**Ledger rows touched:** B9, B10, B11, B13, A16 — none of them closed by this round on its own

---

## 1. Why this round exists

The perception-model study measured two direction-dependences and could settle neither.

- **Identity.** `ICtCp × one global constant` scores **0.4913** held-out nats/answer against the
  contract's incumbent `OKLab × four regional bars + Math.max` at **0.5743** — **+0.0830**, 95%
  cluster-bootstrap CI **[0.0174, 0.1461]**, raw p = 0.023 — and does **not** survive Holm over the
  declared family of 144 (adjusted p = 1.000). It is also statistically indistinguishable from the
  best of forty-nine cells. So the study's own summary is: *one number in a better space predicts
  held-out human identity judgements better than four numbers in OKLab*, at an uncorrected level,
  with no multiplicity protection. That is not a state a contract can be changed from, and it is not
  a state it can be left in either.
- **Anisotropy.** `bracketing-round-3` returned **`anisotropy-confounded`**: at matched OKLab
  distances inside one band, lightness-dominant pairs read "same colour" **15/21 (0.714)** and
  chroma-dominant pairs **2/21 (0.095)**, exact p = 0.00022. Pooled over 184 answers the study
  quantified it: the same-colour bar in OKLab is ≈**0.045** for a pure-lightness difference,
  ≈**0.0108** for pure chroma and ≈**0.0118** for pure hue — a **4.2× spread across direction**
  against the **2.5× spread across the four regions the contract actually encodes**. The dimension
  the contract does not have is larger than the one it does.
- **Function.** `accent-real-1` was refused as **`stratum-dependent`**: pooled threshold **0.18630**,
  CI **[0.14052, 0.24700]**, contradicted by hue-third 0 at **0.13417** and hue-third 2 at
  **0.26385**. And its whole gap map along lightness is empty — not by accident but by construction,
  because every accent in it is isoluminant with its field. The study states the consequence
  plainly: *"the lightness axis of the functional threshold is not merely unmeasured, it is
  unmeasurable from the existing data."*

This round asks each of those three questions with a stimulus set built to answer it.

---

## 2. The criteria, and the exact words on screen

**Two criteria, carried separately end to end, never pooled at any point in the analysis.**
`bracketing.ts:84-95` records the 72 answers already discarded once over exactly this confusion — a
detection criterion answered where an identity one was intended — and this round deliberately puts
both criteria in front of one reviewer in one sitting, so the separation has to be structural rather
than remembered.

### 2.1 Identity — arms A and B, 84 items. **Byte-identical to bracketing rounds 1–3.**

Question:

> Same color?

Instruction:

> Answer whether they register as the same color — not whether you can detect any difference at the
> seam. If you have to hunt along the boundary to find it, they're the same color. If they'd read as
> two different colors in a UI, they're different.

**This is not a paraphrase and not a re-typing.** `IDENTITY_PROMPT` in the generator *is*
`PART_PROMPTS["same-color"]`, and before the fixture is written the generator reads
`bracketing-round-3.json` off disk and refuses to build if either string differs by one byte
(`assertIdentityWordingIsUnchanged`). The test suite makes the same comparison against the fixture
rather than against the constant, because a constant compared to itself only proves a file agrees
with itself. **Comparability is load-bearing here:** this round's identity answers are intended to
pool with rounds 1–3's 184, and a wording change would make the pooling a different measurement
wearing the same name.

Criterion of record, unchanged: `register-as-same, clarified 2026-08-02 after a false start under a
detection criterion`.

### 2.2 Function — arm C, 64 items. `accent-real-1`'s wording **plus** its chat clarification.

Question:

> Does this work as an accent at a glance?

Instruction, as served, in full:

> Not "can you see the difference" — assume you can. At a glance, without hunting: is this colour
> doing an accent's job here — does it pick these elements out as something the eye lands on? If you
> only find it by looking for it, or it reads as a difference rather than as an accent, answer no.
> Clarification, given in chat during accent-real-1 and now on screen: judge only whether the accent
> elements are findable at a glance as the highlights — aesthetic fit to the artwork is explicitly
> excluded, so yes even if the colour looks wrong for the artwork; ignore the foreground relation,
> which is a separate rule; hunting = no.

**The comparability note, stated rather than buried.** The first three sentences are
`ACCENT_REAL_PROMPT.instruction`, character for character. **The fourth sentence is an extension of
`accent-real-1`'s served text and this round does not claim otherwise.** Its content is not new: it
is the clarification the orchestrator gave in chat mid-way through `accent-real-1`, recorded verbatim
in `accent-real-round-1-order-stability.ts` and in that round's §8.0 —

> Judge ONLY whether the accent does its visual job against its field — the eye lands on the accented
> elements without hunting. Aesthetic fit to the artwork is EXPLICITLY EXCLUDED — yes even if the
> colour looks wrong for the artwork. The accent's relation to the FOREGROUND is EXCLUDED — that is a
> separate rule.

— and it is the reading `accent-real-1`'s **scored** answers were given under. That round left the
screen unchanged on purpose, because its six anchors are pixel replays of `accent-functional-1` panels
and they only measure the lab-versus-real gap if everything except the stimulus is held constant. It
paid for that with a disclosed caveat it could not resolve: *"some unknown prefix of the answers may
predate the clarification"*, and answer-versus-question ordering is unavailable because timestamps
mean nothing under the standing ruling.

**Round 4 has no anchors.** Nothing in it replays an earlier stimulus, so there is no instrument a
wording change could destroy, and the reason to keep the clarification off screen is gone. What
remains is the reason to put it on. So:

- arm C's answers are comparable with `accent-real-1`'s **under the clarification that governed
  both**;
- the two rounds' *served strings* are **not** byte-identical, and no analysis may describe them as
  such;
- any comparison of arm C against `accent-real-1` carries this note attached, in the same sentence as
  the number.

Criterion of record: `functional-visibility on real stimuli — does this work as an accent at a
glance; the criterion of accent-functional-1 and accent-real-1, with accent-real-1's mid-round chat
clarification now served on screen rather than given in conversation`.

### 2.3 The answers — the escape, on both kinds

| key | label | hotkey |
|---|---|---|
| `same` / `works` | yes | `1` |
| `different` / `does_not_work` | no | `2` |
| `cant_tell` | I can't tell | `3` |

**Two departures from rounds 1–3, on the identity items, both declared here.**

1. **There is an escape.** Rounds 1–3 offered `y`/`n` and nothing else; the escape rule landed after
   them (`REVIEW_UI.md` §4, from the reviewer's own *"answers for those cases are not reliable (even
   with human feedback) unless we add an escape answer choice"*). Its share is a **first-class
   reported result, per arm and per stratum, never subtracted and never folded into either column.**
   The consequence for pooling is stated in §6.1.
2. **The hotkeys are digits, not `y`/`n`.** A three-answer question cannot bind `y`/`n` —
   `validateFixture` reserves that pair for two-valued booleans — and a round that bound `1/2/3` on
   one item kind and something else on the other would be a keyboard the reviewer has to re-learn
   every few items.

Neither departure touches the criterion. The criterion is the question and the instruction.

### 2.4 The stimulus-type label

Each item carries a one-line `preamble` above the question: **"Colour-patch pair."** or **"Player
mock, real cover."** The two stimulus kinds are visually unmistakable on their own — two flat fields
against a whole player over an artwork — so the label is not what distinguishes them; it makes the
*task switch* explicit at the moment of answering, on a 148-item sitting where the stem changes
without warning. It is a separate fixture field from `question` and `instruction`, it names only the
stimulus, and a test asserts it carries no criterion vocabulary.

---

## 3. The design

148 items. **This is the full round, not the 78-item fallback** the study also priced.

| arm | items | stimulus | criterion |
|---|---|---|---|
| **A** — identity, discriminating | 40 | colour-patch pair | identity |
| **B** — identity, direction ladders | 36 | colour-patch pair | identity |
| **C** — function, hue-crossed | 60 | mock player, real cover | function |
| controls | 6 | 4 pair, 2 mock | both |
| silent repeats | 6 | 4 pair, 2 mock | both |

84 identity items, 64 accent items. Served in **one fully interleaved shuffled pass** — not blocked
by arm, because a block of eighty patch pairs followed by sixty players would let a criterion drift
settle in and stay, and the declared risk of this round is exactly that one question gets answered
under the other's reading.

### 3.1 Arm A — 40 items where the two candidate rules make opposite predictions

Every item is a pair on which **`ICtCp × one global constant` and the contract's `OKLab × four
regional bars + Math.max` disagree**, so exactly one of them is right about it and accuracy is
complementary. The whole arm is therefore one binomial and needs no ladder.

- **The ICtCp threshold is read from the study's own output, not transcribed.**
  `identity × ictcp × global-constant` fits `logit P = b0 + b1·log d`; `τ = exp(−b0/b1)` =
  **0.010264506875655147**. The generator computes it from
  `data/contract/perception-model-study.json` at build time and writes it into the truth file, so no
  hand-copied number is the pivot of a forty-item arm.
- **The OKLab side is the shipping code**, `sameColorBar()` from `src/contract/color.ts` over the
  committed `SAME_COLOR_BAR_BY_REGION` (0.00932 / 0.01502 / 0.01627 / 0.02293). Arm A is a test *of
  the incumbent*, so the incumbent has to be what actually runs.
- **Both colours of every pair sit inside one contract region.** Straddling pairs are round 3's
  question, already asked; mixing them in would put the `Math.max` rule on trial again inside an arm
  about a different thing.
- **Margins.** Every item sits at least **8%** of each rule's own threshold clear of it, on the final
  8-bit pair. An item that discriminated by half a percent would be discriminating on rounding.
- **Achieved:** OKLab distances span 0.00745–0.02733; all 40 disagree; all margins hold.

**Balance, and the two cells that do not exist.**

| | ICtCp says "same" | OKLab says "same" |
|---|---|---|
| **lightness-dominant** | 10 | 10 |
| **chroma-dominant** | 10 | 10 |

10 items in each of the four contract regions. **But two of the sixteen region × rule × direction
cells are structurally empty**, and the counts were redistributed inside their own region before
generation to compensate. A seeded feasibility sweep of 400,000 candidate pairs — **which read no
human answer, because none exists** — found **zero** pairs anywhere in `dark-neutral` or
`light-neutral` where OKLab says "same" and ICtCp says "different" on a *lightness*-dominant pair.
That is a fact about the two rulers, not a budget decision: in a neutral region OKLab's bar is small
(0.00932 / 0.01627) and ICtCp's single 0.01026 is comparable, so a lightness step small enough for
OKLab to forgive is always small enough for ICtCp too. The redistribution keeps every margin, the
20/20 rule split, the 20/20 direction split and the 10-per-region spread. It is recorded here because
someone reading the fixture will notice the asymmetry and should find the reason next to it rather
than have to rediscover it.

### 3.2 Arm B — three pure-direction ladders, 12 rungs each, inside dark-neutral only

Estimates the anisotropy ratio directly instead of inferring it from a mixed sample.

- **Region:** `dark-neutral` only — the best-sampled region with the tightest bar. Both colours of
  every pair are inside it.
- **Centres:** the study's shape-(d) OKLab fit, `τ = 0.04512` with `w_chroma = 17.40`,
  `w_hue = 14.75`, so a pure step crosses at `τ/√w`: lightness **0.04512**, chroma **0.01082**, hue
  **0.01175**. These place the ladders; nothing downstream assumes them.
- **Span:** `[τ/3, 3τ]`, 12 log-spaced rungs — exactly the shape
  `perception-model-round-design.ts` simulated, so its reported precision applies to what was built.
- **Purity ≥ 0.9** of the achieved 8-bit difference along the ladder's own axis, in the CIE
  decomposition `Δ² = ΔL² + ΔC² + ΔH²` with ΔH residual. Stricter than round 3's 0.7 because these
  ladders estimate a *pure*-direction threshold. Achieved minimum: **0.928**.
- **Deviation, declared: two rungs are clamped.** The chroma ladder's nominal bottom rung (0.00361)
  and the hue ladder's (0.00392) are below what the 8-bit sRGB grid can express as a *pure* step in
  this region — a nominal step that size arrives as rounding noise pointing in an arbitrary
  direction. Both are clamped to **0.004** (bracketing round 1's own `PART1_DISTANCE_MIN`) rather
  than dropped, so each ladder still carries twelve rungs, and `clampedToFloor` is recorded per item
  so the clamp is visible in the data rather than hidden in a distance column.

### 3.3 Arm C — 60 accents on real covers, in two strata that are never pooled

**36 isoluminant** (12 rungs × 3 accent hue thirds) **+ 24 non-isoluminant** (3 hue thirds × 8).

- **The isoluminant ladder** is `accent-real-1`'s construction unchanged — its span
  ([0.06, 0.30], 12 log-spaced rungs), its `equalLuminanceAccent` solver imported rather than
  re-implemented, its tolerances, its foreground-separation floor (0.07444, so no item can be
  answered "no" because the accent became a second foreground — that is B31, and B31 is not in this
  round). Achieved: distances 0.06077–0.30010, **max |ΔY| = 0.00209** against the 0.0025 budget,
  **APCA Lc = 0 on every item**.
- **The non-isoluminant stratum** places `ΔL = sign · share · d` and puts the remainder in the
  chromatic plane: 2 distances (0.09, 0.20) × 2 lightness shares (0.45, 0.80) × 2 signs × 3 hue
  thirds. Every other check is the isoluminant solver's, unchanged, so the two strata differ in
  exactly one respect. Achieved: **|ΔY| ≥ 0.0108** on every item — four times the isoluminant
  ceiling, so no item is ambiguous about which stratum it is in — and OKLab lightness steps spanning
  **0.0398 to 0.1662**. These are the first observations ever taken on the functional criterion's
  lightness axis.
- **The hue third is never relaxed.** It is the stratification variable — the quantity
  `accent-real-1` found a 2× spread across — and it is exact: 12/12/12 in the ladder, 8/8/8 in the
  non-isoluminant stratum.
- **Field lightness band and governing role are nuisance controls and they were relaxed.** Declared
  deviation: an isoluminant accent 0.30 from a *dark* field in hue third 1 does not exist in sRGB —
  holding APCA-Y at a dark field's value while moving 0.30 across the chromatic plane leaves the
  gamut. That is physics, not a shortage of covers. The search therefore falls back in a fixed order
  — exact cell, then the right governing role in any band, then any cover — and the achieved
  cross-tab is **band 11 dark / 13 mid / 12 light** and **role 18 surface / 18 background**, which is
  as close to balanced as the gamut allows.
- **Covers.** 62 distinct covers, drawn from the full-palette endorsement corpus. Covers
  `accent-real-1` already showed the reviewer are **deprioritised, not banned**: banning them
  outright is infeasible (144 distinct covers exist, 45 went to `accent-real-1`, and the survivors do
  not contain enough dark-field covers admitting high-distance isoluminant accents in every hue
  third). **63 of the 64 accent items use a cover new to the reviewer; exactly 1 reuses one**, and
  `coverFreshness` records which.

### 3.4 The sizing this round can and cannot claim

From `perception-model-round-design.ts`, at the lapse rate implied by round 3's 83.3% repeat
consistency (λ = 0.092):

| items per ladder | 90% interval on τ̂/τ | 90% interval on the ratio of two ladders |
|---|---|---|
| 12 | [0.46, 1.95] | [0.38, 3.07] |
| 20 | [0.60, 1.65] | [0.44, 2.07] |
| 30 | [0.68, 1.59] | [0.56, 1.87] |

**Stated in advance, because it is the least comfortable fact about this round:** at 12 rungs a
direction ladder can **confirm** a ~4× anisotropy ratio and **cannot pin it**. Thirty per ladder
would be needed to tell a 2× ratio from no ratio at all. Arm B is therefore declared **under-powered
for adoption before it is run** (§6.4).

**And the arithmetic of arm C, said plainly.** PART 2 sized arm C as *"3 accent hue thirds × 20"*.
The 60 items are 20 per hue third **across both strata** — 12 isoluminant and 8 non-isoluminant —
because the same 60-item budget also has to carry the non-isoluminant stratum the same paragraph
commissions. The consequence: the isoluminant per-third n rises from `accent-real-1`'s 10 to **12**,
not to 20, so **arm C confirms or refuses the hue-third spread; it does not pin it either.** The
alternative — 20 isoluminant per third and no lightness axis at all — would have left the study's own
"most important gap in the study" untouched for another round. That trade is made here, in advance,
and it is the one place this build chooses between two readings of the design's single number.

---

## 4. What is served and what is not

**Served:** an opaque per-item token, the question, the instruction, the stimulus-type label, the
three answers, and a render side-car carrying **two hex values** for a patch pair or **a palette** for
a mock.

**Never served:** the arm, the region, the rung, the target distance, the achieved distance, the
stratum, which rule the item was built to favour, the ICtCp threshold, the cover's id or path. The
side-car is a static file the browser can read in full, which matters more on this round than on any
before it: **arm A's items *are* the disagreement**, so an arm label in the side-car would print half
the experiment. Two guards, both tested: question keys are opaque seeded slugs (`p4_<8 hex>`, never an
index and never the arm), and the side-car **contains no number at any depth** — every quantity this
round controls is a number, so that is a complete statement about the leak surface rather than a word
list someone has to remember to extend.

**The non-isoluminant items carry no flag on screen.** Their question, instruction and label are
byte-identical to the isoluminant ones, and a test asserts it. The reviewer has been told the variety
is deliberate; a flag would turn a stratum into a hint about the expected answer, on the one stratum
with no prior at all.

---

## 5. The fitting plan — which model comparisons this round powers

Per `PERCEPTION_MODEL_STUDY.md` PART 2. Declared in full, before any answer.

### 5.1 Arm A — the identity space/shape question, as one binomial

- **Population:** the 40 items with role `arm-a`, each at its **first showing**. Repeats are not
  independent trials. Controls are never scored.
- **Statistic:** `k` = items answered `same`, over `n` = items answered `same` or `different`.
  `accuracy(ICtCp-global) = k′/n` where `k′` counts items whose *answer matches ICtCp's prediction*;
  by construction `accuracy(OKLab-4-bar) = 1 − accuracy(ICtCp-global)` exactly.
- **Decision:** decisive **iff** the two-sided exact binomial test of `k′` against p = 0.5 gives
  **p < 0.05**. At n = 40 that is `k′ ≥ 27` or `k′ ≤ 13`. Anything in between is **unresolved** and
  must not be recorded as support for the incumbent. If `n < 40` because of escapes, the threshold is
  recomputed at the realised `n` **before the count is looked at**.
- **What a decisive result licenses:** a proposed decision record naming ICtCp-with-one-constant, or
  the incumbent, as the better *predictor*. It licenses **no constant change on its own** — changing
  the contract's ruler is a larger decision than one arm can fund, and §7 says what it would cost.
- **What it settles about the region boundaries:** `REGION_LIGHTNESS_BOUNDARY` (0.55) and
  `REGION_CHROMA_BOUNDARY` (0.05) are both audited `unknown-untested` and both are round 1's
  *stimulus strata* promoted to constants. Arm A does not test their **locations**; it tests whether
  a partition at those locations is needed at all. A boundary in the wrong place and a boundary that
  should not exist look similar, and that limit is declared here rather than discovered later.

### 5.2 Arm A — the anisotropy veto, carried over from round 3 because it fired there

`k′` is recomputed over the 20 lightness-dominant and the 20 chroma-dominant items **separately**. If
those rates fall on **opposite sides of 0.5** and at least one subgroup is individually decisive at
α = 0.05, the arm reports **`anisotropy-confounded`**: no winner, and the finding is that which rule
wins depends on the direction of the difference — which neither candidate can express. The 2×2 is
square by construction (10/10/10/10) precisely so this can be computed.

### 5.3 Arm B — three logistic fits, reported, never adopted from

- Three separate fits of `P(same)` on `log d`, one per direction, using the repository's existing
  `fitLogistic` **unchanged**, wrapped in `fitWithDeclaredSupport`.
- Report all three thresholds with 95% cluster-bootstrap intervals, and the two ratios
  (lightness/chroma, lightness/hue) with intervals.
- **Prediction on the record:** if the study's pooled shape-(d) weights are right, the ratios are
  ≈4.2 and ≈3.8. At 12 rungs the ratio interval under the null is [0.38, 3.07], so a ratio of 4 is
  distinguishable from 1 and a ratio of 4 is **not** distinguishable from a ratio of 2.
- **No adoption from arm B**, declared in advance. Its output is a measured ratio with an honest
  interval, which is what amends ledger row **B9** from "unmeasured" to "measured, unencoded".

### 5.4 Arm C — per-hue-third fits, and a separate lightness read

- **Primary:** three per-hue-third logistic fits on the **36 isoluminant** items, wrapped in
  `fitWithDeclaredSupport`, claim domain **[0.06, 0.30]**,
  `selectionRelationToVariable: independent-of-the-variable` — `accent-real-round-1-preregistration.md`
  §6.2 reused unchanged. Plus the pooled fit over the same 36.
- **Refusal condition, copied from the round that fired it:** if **any** stratum fit falls outside
  the pooled 95% interval, adoption is **refused** and the verdict is `stratum-dependent`, exactly as
  `accent-real-1` refused. A replication of that refusal is a result — it makes tier 2 a function of
  the pair rather than a scalar, and changes the shape of `escapeDenied`.
- **Secondary, and never pooled with the above:** the **24 non-isoluminant** items are fitted
  separately, and a direction-aware shape `√(ΔL² + w_C·ΔC²)` is fitted **across the two strata
  jointly** for the sole purpose of estimating `w_C` — the one quantity that is unidentifiable from
  isoluminant data alone. This is the arm's exploratory half. **It is under-identified at n = 60 with
  the strata this unbalanced and it is declared exploratory in advance**; it may produce a
  directional read on whether the functional bar is anisotropic, and it may not produce anything.
- **Comparison against `accent-real-1`** carries the §2.2 wording note attached, in the same
  sentence as any number.

### 5.5 What this round does **not** fit

- **No cross-criterion pooling, ever.** Identity and function are fitted separately end to end. The
  study's own observation that ICtCp is the best space for identity and the **worst** for function is
  the reason stated as a number rather than as a principle.
- **No detection fit.** No detection items exist in this round.
- **No refit of the four regional bars.** The study already showed refitting them is not better than
  leaving them frozen (`(ref) 0.5594` vs `(b) 0.5743`, not separable).

### 5.6 Multiplicity

Every comparison above is declared to `sweepThenTest` with **Holm at α = 0.05** over the family
consisting of: arm A's binomial, its two veto subgroups, arm B's three thresholds and two ratios, arm
C's three per-third fits, its pooled fit, and the joint `w_C` estimate — **13 tests**. The family is
fixed here and may not be extended after the answers are read.

---

## 6. Validity gates — checked before any number in §5 is computed

### 6.1 Gates

1. **All 6 attention checks correct**, or the round is **void**. The 3 `control-identical` items must
   be answered `same` (identity) / `does_not_work` (accent — the accent is exactly the field colour,
   so the accent elements vanish into it). The 3 `control-obvious` items must be answered `different`
   / `works`.
2. **Repeat consistency is reported regardless**, and compared against round 3's **83.3%**. Six
   repeats: **4 identity, 2 accent.** The comparison against 83.3% uses the **4 identity repeats
   only**, because that figure — and the λ = 0.092 that sizes this entire round — is an identity
   measurement. **Four is a thin re-measurement and this round does not pretend otherwise:** it can
   contradict 83.3% loudly, and it cannot confirm it precisely.
3. **Escape share is reported per arm and per stratum**, never subtracted, never folded into either
   column. **If escapes exceed 25% of any arm, that arm's fit is reported as not interpretable** —
   an arm the reviewer could not answer is not an arm that measured something.
4. **Arm B interpretability:** if either the chroma or the hue ladder returns all-same or all-different
   across all twelve rungs, that ladder is degenerate, its threshold is not reported, and its ratio is
   not computed.
5. **Sensitivity:** every scored quantity is re-run with each repeated item's **later** answer
   substituted for its first. If any §5 verdict differs between the two runs, that verdict is
   **unresolved** whatever the primary run said.

### 6.2 Refusal is a result

Any arm may return **unresolved**, and none of them may be softened into "leans toward" language. An
unresolved arm A leaves the incumbent in place **only because it is already there** — not as
evidence for it — and the loose end stays open.

---

## 7. What this round does not settle, and what it must not be read as settling

- **It does not license changing any constant.** Arm A can name a better *predictor*; adopting a
  different colour space as the contract's ruler is a far larger decision than one binomial funds,
  and the study already priced the collateral: adopting a functional value ≥ ≈0.15362 breaks
  `tests/contract-invariants.test.ts:701` outright, and a two-line constants diff is not what
  adoption costs here.
- **It does not test where the region boundaries are** — only whether a partition at those locations
  is needed (§5.1).
- **It is one reviewer**, whose own measured repeatability is 83.3% at best. No model can beat the
  observer's own repeatability, and neither can this round.
- **B31 — the foreground↔accent bar — is not in this round.** Nobody has ever been shown a foreground
  and an accent side by side. It is a third stimulus type and would push the round past 170. Arm C
  actively excludes it: every constructed accent stays ≥ 0.07444 from its palette's foreground, so an
  item cannot be answered "no" because the accent had become a second foreground.

### 7.1 **The excursion bar is out of scope, and is named here so nobody can later claim it was measured**

The P1 excursion bar is **2.5 × the same-colour bar**. The audit (PART 3, row 15) calls it the
clearest live instance of the reviewer's late-discovery worry: it is expressed as a *multiple of the
bar*, so it silently inherits every position and direction dependence the bar has, with a 2.5× lever
that nobody decided; three bracketing rounds have now gone past it.

**This round selects the METRIC — which space and which shape the same-colour bar should live in. It
says nothing whatsoever about the multiplier.** No item in it varies excursion magnitude and no
answer it collects could. Measuring the 2.5 needs **ramp stimuli** — a gradient excursion shown at
graded magnitudes — which is a stimulus family this round does not contain, and it needs its own
round. If arm A moves the metric, the excursion bar's magnitude becomes *more* open, not less,
because a multiplier on a redefined quantity is a different number.

---

## 8. Output

- `perception-round-4-analysis.json` — every quantity in §5, with intervals, plus the §6 gate results,
  written by `analyze-perception-round-4.ts` (to be committed **before** the round is scored, and run
  **as committed**, unmodified, exactly as `accent-real-1`'s analyzer was).
- A proposed decision record per arm, for the reviewer to accept, amend or refuse. **This round
  changes no constant and edits no decisions file on its own.**

---

*Pre-registered 2026-08-04, before the push. `perception-4`, 148 items, seed 20260804_44.*

---

# 9. Results — scored 2026-08-04

**Added after the answers existed. Everything above this line is unchanged from `4c7c891`.**

Artifact: `perception-round-4-analysis.json`, written by `analyze-perception-round-4.ts`.
Answers: 148/148, all human, one revision each, none superseded or retracted.

## 9.0 The analyzer was not committed before scoring — disclosed, not excused

§8 asked for the analyzer to be committed before the round was scored and run as committed, the way
`accent-real-1`'s was. **It was not.** The round was pushed and answered without it, and the analyzer
was written afterwards, with the 148 answers on disk. No claim that it is blind to them is available.

What stands in place of blindness: every rule it implements is quoted from §§5–6 above, which *are*
frozen at `4c7c891` and which fix every threshold, critical value, family size, gate and refusal
condition in advance; and every place this document left something open is listed in the analysis
JSON under `ambiguityResolutions` rather than settled quietly. Those six resolutions are the honest
attack surface of this scoring and they are named so they can be attacked. Two of them changed a
number, and both are flagged at the point of use below.

## 9.1 Gates (§6.1) — all pass; the round is valid

| gate | result |
|---|---|
| 1. all 6 attention checks | **6/6 correct — not void** |
| 2. repeat consistency | identity **4/4 (100%)** vs round 3's 83.3%; accent **1/2**; all six **5/6 (83.3%)** |
| 3. escape share | **0.0% in every arm and every stratum** — no arm is uninterpretable, every n is full |
| 4. degenerate ladders | **none** — all three arm-B ladders return both answers |
| 5. repeat-substitution sensitivity | **no verdict differs** between the first-showing and later-answer runs |

Gate 2 carries the caveat this document put on it in advance: **four identity repeats is a thin
re-measurement**. 4/4 does not confirm 83.3% and nothing downstream re-derives the lapse rate from
it. The one disagreement in the round is an *accent* repeat (`p4-c-iso-20`).

**Ambiguity that changed a number (resolution 1).** "First showing" needed an order, and the
`repeat`-role item is **not** reliably the later showing: by the fixture's `serveOrder`, the repeat
was served *earlier* than its arm counterpart in **three of the six pairs**. Timestamps mean nothing
under the standing ruling, so order comes from `serveOrder` alone. This is not cosmetic — the one
inconsistent pair is one of the three, so `p4-c-iso-20`'s scored answer is `does_not_work` (its
earlier showing), not the `works` its arm-role record carries. Gate 5 brackets the whole question:
both readings were run end to end and no verdict moved.

## 9.2 Arm A (§5.1, §5.2) — decisive at the arm level, not family-wise

- **k′ = 28 of 40 for `ICtCp × one global constant`** — accuracy **0.700**, and therefore
  **0.300** for the contract's `OKLab × four regional bars + Math.max`, exactly complementary by
  construction.
- Two-sided exact binomial **p = 0.0166**. The realised n is 40 (no escapes), so the pre-registered
  critical values stand unrecomputed: **decisive iff k′ ≥ 27 or ≤ 13**. 28 ≥ 27.
- **Arm-level verdict: decisive. ICtCp-with-one-constant is the better predictor on this arm.**
- **Holm over the declared 13: adjusted p = 0.0995. Does not survive.**

**Ambiguity that changed a verdict (resolution 3): §5.1 and §5.6 disagree here, and both are
reported.** §5.1 fixes decisiveness at the arm's own uncorrected binomial; §5.6 puts that same
binomial inside a 13-test Holm family. Neither has been dropped and neither has been softened. The
arm is decisive on its own pre-registered rule **and** fails the pre-registered family-wise
correction. The round did what it was built to do — it cut the family from 144 to 13 and moved the
adjusted p from **1.000 to 0.0995** — and that is still not below 0.05.

**The anisotropy veto (§5.2) does not fire.**

| subgroup | k′ | rate | exact p |
|---|---|---|---|
| lightness-dominant | 16/20 | 0.800 | 0.0118 |
| chroma-dominant | 12/20 | 0.600 | 0.5034 |

Both rates are on the **same** side of 0.5, so the veto's first condition fails and the arm is not
`anisotropy-confounded`. But the two subgroups are not alike: ICtCp's win is carried by the
lightness-dominant half (0.800, individually decisive) and the chroma-dominant half is
indistinguishable from a coin. **Where the two rules disagree about a chroma step, this reviewer
sided with neither.**

## 9.3 Arm B (§5.3) — the anisotropy is real, ~2.9×, and it is the only Holm-clean identity result

Reported, never adopted from — declared under-powered in §3.4 before the round ran.

| ladder | threshold | 95% CI | rank-sum p | smallest p this split can produce |
|---|---|---|---|---|
| lightness | **0.02063** | [0.01606, 0.02666] | 0.0606 | **0.0606** |
| chroma | **0.00717** | [0.00530, 0.00970] | 0.0081 | **0.0081** |
| hue | **0.00759** | [0.00460, 0.01253] | 0.0283 | 0.0081 |

| ratio | estimate | 95% cluster-bootstrap CI | p vs 1 | Holm |
|---|---|---|---|---|
| lightness / chroma | **2.88** | [1.91, 4.39] | 0.0012 | **survives (adj 0.0150)** |
| lightness / hue | **2.72** | [1.65, 5.90] | 0.0012 | **survives (adj 0.0150)** |

Both ratio intervals exclude 1. **The direction-dependence the contract does not encode is measured
and it is real.** §5.3's prediction was ≈4.2 and ≈3.8; the observed 2.88 and 2.72 sit below that,
and both intervals contain the predicted values *and* contain 2 — which is precisely the resolution
§3.4 said 12 rungs would have. **Confirmed, not pinned.** Ledger row **B9** moves from "unmeasured"
to "measured, unencoded".

**Read the middle column before reading the Holm column.** The lightness and chroma ladders are
*perfectly ordered* — every "same" below every "different" — and their p-values **are the smallest
their own yes/no splits can produce**. At 2 "same" among 12, an exact rank-sum cannot return below
0.0606 no matter how clean the data. Those two Holm failures are facts about a 12-rung ladder with a
lopsided split, not about noisy answers. The ratios, which pool both ladders, do not have that
ceiling and they survive.

**Clamp sensitivity (§3.2, resolution 6).** The two clamped bottom rungs were declared to
`fitWithDeclaredSupport` as a left truncation at 0.004 and the required check was computed, not
asserted: refitting with the clamped rung dropped moves the chroma threshold 0.007168 → 0.007160
and the hue threshold 0.007592 → 0.007340. Under 4% on both. The clamp is not carrying the result.

## 9.4 Arm C (§5.4) — refused again, and the lightness axis finally reads

**Primary, 36 isoluminant items.** Pooled threshold **0.18401**, 95% CI **[0.12978, 0.26091]** —
against `accent-real-1`'s pooled **0.18630** [0.14052, 0.24700]. *Carrying §2.2's note in the same
sentence, as required: the two rounds' served strings are **not** byte-identical — round 4 puts
`accent-real-1`'s mid-round chat clarification on screen — so these are comparable under the
clarification that governed both, and not as identical instruments.*

| hue third | threshold | outside the pooled interval? |
|---|---|---|
| 0 | 0.16026 | no |
| 1 | 0.15336 | no |
| 2 | **not identified inside [0.06, 0.30]** | **yes** |

**Ambiguity that changed a number (resolution 5-adjacent).** Hue third 2's unconstrained fit returns
1536.8 with an interval spanning ~180 orders of magnitude. That is not a large threshold; it is the
fit reporting **no relation between distance and the answer anywhere in the sampled range** (its
rank-sum p is exactly 1.000, and it answered "works" 3/12 non-monotonically). The analyzer reports it
as unidentified rather than printing the number.

**The §5.4 refusal condition fires. Verdict: `stratum-dependent`** — the same refusal
`accent-real-1` returned, replicated on fresh covers under an on-screen clarification.
**A replication of that refusal is a result**: tier 2 is a function of the pair, not a scalar, and
the shape of `escapeDenied` is implicated. The refusal is stable under gate 5.

**Secondary — the non-isoluminant stratum, never pooled with the above. These are the first
observations ever taken on the functional criterion's lightness axis (§3.3).**

| | n | works | rate |
|---|---|---|---|
| isoluminant | 36 | 13 | **0.361** |
| non-isoluminant | 24 | 18 | **0.750** |
| at d ≈ 0.09 | 6 iso / 12 non-iso | 2 / 7 | 0.333 vs **0.583** |
| at d ≈ 0.20 | 5 iso / 12 non-iso | 3 / 11 | 0.600 vs **0.917** |

**At matched OKLab distance, an accent that also moves in lightness does its job far more often.**
The joint fit puts a number on it: **`w_C` = 0.0658**, likelihood-ratio p = **0.00149**,
**survives Holm (adj 0.0164)** — a chromatic step is worth about **√0.0658 ≈ 0.26** of a lightness
step of the same OKLab size. Chroma-only reading of ΔC (resolution 5): `w_C` = 0.1268, p = 0.051 —
same side of 1, weaker.

**This is the arm's exploratory half and §5.4 said so in advance, but it needs one more warning that
§5.4 did not anticipate.** `w_C` is identified here almost entirely by the *between-strata* contrast:
ΔL is ~0 by construction for all 36 isoluminant items and large for all 24 non-isoluminant ones, so
"`w_C` is small" and "stratum predicts the answer" are very nearly the same statement in this design.
The number is a real signal about the lightness axis and it is **not** a clean estimate of an
anisotropy weight. It should be read as *"lightness contrast helps an accent, substantially"* and
not as *"the functional bar's chroma weight is 0.066."*

## 9.5 Multiplicity (§5.6) — 5 of the fixed 13 survive Holm

The family was fixed above and was not extended. §5.6 names the thirteen cells but states a null only
for arm A; the nulls used for the other ten are declared in the analysis JSON (resolution 2): a
threshold cell is an exact two-sided Mann-Whitney rank-sum of distance against answer, a ratio cell
is a seeded two-sided cluster bootstrap against 1, and `w_C` is a likelihood-ratio test against 1.

| cell | raw p | adjusted | survives |
|---|---|---|---|
| arm B ratio lightness/chroma | 0.00116 | 0.01504 | **yes** |
| arm B ratio lightness/hue | 0.00116 | 0.01504 | **yes** |
| arm C joint `w_C` | 0.00149 | 0.01639 | **yes** |
| arm C pooled isoluminant | 0.00406 | 0.04059 | **yes** |
| arm C hue third 1 | 0.00505 | 0.04545 | **yes** |
| arm B threshold chroma | 0.00808 | 0.06465 | no *(at its own floor)* |
| arm A veto, lightness subgroup | 0.01182 | 0.08273 | no |
| **arm A binomial** | **0.01659** | **0.09953** | **no** |
| arm B threshold hue | 0.02828 | 0.14141 | no |
| arm B threshold lightness | 0.06061 | 0.24242 | no *(at its own floor)* |
| arm C hue third 0 | 0.10606 | 0.31818 | no |
| arm A veto, chroma subgroup | 0.50344 | 1.00000 | no |
| arm C hue third 2 | 1.00000 | 1.00000 | no |

**Every surviving cell is about direction or about the lightness axis. The cell about *which colour
space* is not among them.**

## 9.6 The fitting plan's downstream integration (§5, and PART 2 of the study)

Re-run of the study's held-out (space × shape) comparison with round 4 folded in —
`perception-model-study.ts --include-round-4`, written to
`data/contract/perception-model-study-with-perception-4.json`. The default run remains byte-identical
to the committed artifact and the contract test suite passes unchanged.

Identity grows 184 → **260** observations; functional-real grows 30 → **90**.

| identity cell (held-out log-loss, lower better) | before | after |
|---|---|---|
| `ICtCp × global-constant` | 0.4913 | 0.4784 |
| `Jzazbz × linear-in-position` | 0.4505 | 0.4427 |
| `OKLab × per-region-constants` (incumbent) | 0.5743 | 0.5829 |
| **leader** | Jzazbz × linear-in-position, 0.4505 | **ICtCp × direction-and-position, 0.4208** |

**Does the plateau break? With arm A, yes — and almost entirely because of arm A.** The leader is now
separable from **33 of 47** rivals, against **16 of 47** before. But arm A is 40 of the 76 new
identity items and it is a sample **selected on exactly the disagreement the comparison measures**.
Re-running with arm A dropped and only arm B's 36 unselected ladder items added: the leader is
separable from **17 of 47** — one better than before. Likewise `ICtCp × global-constant` versus the
incumbent flips to Holm-clean (adj p < 0.001) **only** with arm A in, and stays at adj p = 1.000
without it. **The change in the *identity* of the leader survives dropping arm A; the change in
*confidence* does not.** No adoption should rest on the enriched configuration.

**The three candidates the round was framed around do not separate in the way the framing expected.**
`ICtCp-global`, `Jzazbz-linear` and `OKLab-4-bar` are all beaten by a **direction-aware** ICtCp shape
that was not one of the three. That is the same answer arm B gave from the other end, independently:
the missing dimension is **direction**, not region and not the choice between two isotropic rulers.

**Functional threshold: a hue-dependent escape does *not* separate from a single constant.** With
arm C added, `oklab × linear-in-position` improves on the incumbent by +0.0156 (CI [−0.0563, 0.0843],
p 0.681) and `direction-and-position` by +0.0104 (p 0.834) — neither excludes zero. What does move is
the whole **`direction-aware`** column, which rises to the top (`cam16-ucs × direction-aware` 0.4995,
+0.0887, CI [−0.0033, 0.1784], p 0.058 — still not excluding zero). **So arm C's answer to "hue-
dependent or single constant" is: neither, on this evidence — the axis reweighting is what moved.**
And the non-isoluminant stratum has filled the previously-empty lightness column of the gap map,
which is what §5.4 commissioned it to do.

## 9.7 What this round did not settle

Unchanged from §7 and restated because the results make it tempting to forget: **no constant is
licensed to change by anything above**; the region-boundary *locations* were not tested; the P1
excursion multiplier (§7.1) was not measured and becomes **more** open if the metric moves, not less;
B31 was not asked; and it is one reviewer whose own measured repeatability is 83.3% at best.

*Scored 2026-08-04. Proposals for the reviewer are in `src/contract/PERCEPTION_VERDICT.md` and
`data/decisions/proposed-perception-4.json`. This round changed no constant and edited no decisions
file.*
