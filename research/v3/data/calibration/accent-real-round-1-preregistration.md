# Accent functional visibility on REAL stimuli — round 1, pre-registered

**Batch id:** `accent-real-1`
**Written:** 2026-08-04, **before the batch was pushed** and therefore before any answer to it can
exist. The fixture was generated first so that this document quotes the **realized** ladder and the
**realized** balance rather than intended ones; nothing below was chosen after seeing an answer,
because there are none.

**Fixture:** `research/v3/data/calibration/accent-real-round-1.json`
**Truth (never served):** `research/v3/data/calibration/accent-real-round-1-truth.json`
**Render side-car (served, carries no truth):** `research/v3/review-ui/accent-real-1.data.json`
**Generator:** `research/v3/src/review-server/accent-real.ts --write`
**Analysis:** `research/v3/data/calibration/analyze-accent-real-round-1.ts`
**Ledger row:** `PHASE_0_LOOSE_ENDS.md` **A16**

---

## 1. Why this round exists, and what it is repairing

`accent-functional-1` was the cleanest round this repository has run — 39 of 39 items answered in one
pass, controls 4/4 correct, repeats 4/4 agreed — and it **refused its own fit**. Verdict
`contradicts-retraction`, threshold **0.04554**, and the four pixel-identical anchors came back
**4/4 on the diagonal**.

On the **same day**, shown a real cover, the reviewer called an accent at OKLab **0.121** — about
twice the distance of the synthetic ones — *"unreadable"*.

`d-2026-08-04-accent-calibration-is-a-stimulus-realism-problem` reconciles those two positions and
commissions this round:

> *"THE DIAGNOSIS IS THE STIMULUS, NOT THE WORDING AND NOT THE CRITERION. Synthetic flat-field panels
> flatter isoluminant accents: a uniform field gives the eye an uninterrupted edge and no competing
> structure … THE RECALIBRATION ROUND IS REBUILT ON REAL COVERS — a mock player over real artwork
> surfaces, with a few synthetic anchors retained SOLELY to measure the lab-versus-real gap."*

**The two bodies of evidence point in opposite directions, and that is the honest state.** The
synthetic round excluded the placeholder 0.14591 at 95% **from below**; the real-cover judgement says
0.121 is unreadable, which points **above** it. This round is built so that either outcome is
representable, adoptable and reportable — see §6.4, which pre-registers a threshold *above* the
placeholder as an ordinary adoptable result rather than a surprise.

**The diagnosis is a hypothesis and this round is its test, not its confirmation.** Its own funding
caveat says so: *"Nobody has run the same accent at the same distance on a flat panel and on a real
cover and compared the answers."* §3.3 is that experiment.

## 2. The criterion and the wording — byte-identical to round 1, deliberately

**Question, on screen:**

> **Does this work as an accent at a glance?**

**Instruction, on screen:**

> Not "can you see the difference" — assume you can. At a glance, without hunting: is this colour
> doing an accent's job here — does it pick these elements out as something the eye lands on? If you
> only find it by looking for it, or it reads as a difference rather than as an accent, answer no.

**Not one character differs from `accent-functional-1`.** This is a design decision and the single
most load-bearing line in the round. The six anchors (§3.3) measure the **lab-versus-real gap**, and
that measurement only holds if *everything except the stimulus* is held constant. Adding a clause
like *"judge the accent among the content"* would read better and would destroy the instrument: any
anchor difference would then be attributable to wording, which is precisely the confound the anchors
exist to exclude. Round 1's §4 refused the same trade in the opposite direction, and this round
inherits its reasoning.

The criterion string travelling with every answer:

> functional-visibility on real stimuli — does this work as an accent at a glance; the same criterion
> and the same wording as accent-functional-1, asked of the whole mock player over a real cover
> instead of a synthetic flat panel

### 2.1 The answers: y/n plus the escape

`kind: "enum"` with three options — `works` (**1**), `does_not_work` (**2**), `cant_tell` (**3**).
Not `boolean`: `BOOLEAN_HOTKEYS` is fixed at `y`/`n` and `validateFixture` refuses a third answer on
it, so the house standard for "y/n with an escape" is a three-option enum (`dropped-colors`,
`endorsement-recheck`, `sam-mask-quality`).

The escape is mandatory, not a courtesy — REVIEW_UI.md §4, added 2026-08-04 from the reviewer's own
words: *"answers for those cases are not reliable (even with human feedback) unless we add an escape
answer choice"*. Its gloss is the standard one, carried verbatim: *"Genuinely undecidable from what is
on screen. Not a way of skipping a hard one — this answer's share is reported as a result of the
round."* **Its share is a first-class result, reported per stratum and never subtracted** (§6.1 G4).

**One declared imperfection in the bridge.** Round 1 offered yes/no and nothing else; the escape rule
landed after it. So an anchor answered `cant_tell` here has no counterpart in round 1's two-valued
record. §6.3 handles that by excluding escapes from the anchor 2×2 and **reporting the count**, rather
than folding them into either column. This is stated here rather than discovered later.

## 3. Design — 45 items, one pass, one question

| group | n | role | what it is for |
|---|---|---|---|
| **real ladder** | **30** | `ladder` | locating the threshold on real stimuli — **the only items fitted** |
| **synthetic anchors** | **6** | `anchor` | the lab-versus-real gap; **never pooled into the fit** |
| **the Sunshine item** | **1** | `sunshine` | the one item with a known prior verdict; **never pooled** |
| **controls** | **4** | `control-obvious` ×2, `control-identical` ×2 | proving the pass was attended |
| **repeats** | **4** | `repeat` | the reviewer's own answer noise |

**41 distinct covers**, one per item that uses one; no cover appears twice.

### 3.1 The stimulus is the whole player, over a real cover

Thirty ladder items, the Sunshine item and all four controls are rendered by the **pinned mock**
(`review-ui/mock.js`, layout revision 3) through the kit's `mockPlayer`, which imports the one
`/mock.js`. Real cover, real endorsed palette, real content — album title, artist, track row, timing,
"up next" caption, the artwork thumbnail — with **only the accent replaced**.

The palettes are real endorsements from `data/legacy/endorsements.json` (full four-role palettes
only). The accent is the one thing constructed; background, surface and foreground are exactly what
the reviewer once endorsed for that cover.

**On the Sunshine palette being a retired endorsement.** `22e959d5164750bd` was retired as quality
evidence on 2026-08-04. Retirement says *"NO CONSUMER MAY COUNT A MATCH TO THEM AS A WIN"* — it
removes evidence *for* the palette. This round matches nothing to it and scores nothing by it; it
re-shows the reviewer a stimulus they have already judged, which is the opposite of counting it as a
win. Using a retired entry as a **stimulus** is not using it as **evidence**.

### 3.2 Isoluminance against a real field — the construction, precisely

**The mock places the accent in nine elements across three different fields.** Read off
`renderMock()`:

| placement | elements | the colour underneath |
|---|---|---|
| two top icons + the three-icon bottom transport | 5 | `side.fieldCss` |
| the surface card's play and bars icons | 2 | `roles.surface` |
| the two progress-rail fills | 2 | `roles.background` |

**No single colour can be isoluminant to all three**, and on a real palette they are far apart by
construction — invariant 4 forces background and surface to carry contrast. So "an isoluminant accent
at a controlled distance" is not a property an item can have globally. It is a property of **one
accent-field pair**, and every item names which.

That is not a compromise forced by the mock. **It is what the constant already is:** the escape rule
is `escapeDenied = pair.distance < ACCENT_FUNCTIONAL_DISTANCE` and it is evaluated **per pair**. And
the reviewer has already demonstrated they judge it that way — the Sunshine accent has |Lc| **76**
against the black background rail and they condemned it anyway, on the surface pair, naming the
placement: *"accent on surface *is unreadable*"*. The weak pair decided the verdict.

**The governing field role** of each ladder item is therefore `surface` or `background`, stratified
15/15 (§3.4). The construction, per item:

1. Take the governing field colour **F** — the real palette's `surface` or `background` hex. Because
   the field is rendered **flat** (§3.5), F is exactly the colour rendered under those accent
   elements; there is no sampling and no local average to approximate.
2. Take the rung's target distance **d** and a hue direction θ inside the item's assigned hue third.
3. Displace in the OKLab (a, b) plane from F's lab coordinates by d at angle θ, then **solve for
   lightness**: bisect OKLab L over [0, 1] for 40 steps until APCA's Y matches F's. Lightness is
   solved for, never chosen — moving in chroma alone changes Y, and Y is the thing that must not move.
4. Round to 8 bits, then **measure what survived**. Nothing is assumed.

**This is `accent-functional.ts`'s `equalLuminanceAccent`, arithmetic for arithmetic.** Re-stated
rather than imported only because that copy is module-private. Reusing it is deliberate: the six
anchors were produced by this arithmetic, and a real item built by different arithmetic would not be
the same kind of object as the panel it is being compared with.

**The tolerances, and what they realized.** All measured on the **final 8-bit pair**, after rounding:

| budget | rule | realized across all 41 isoluminant items |
|---|---|---|
| APCA Y | `|ΔY| ≤ PART2_MAX_DELTA_Y = 0.0025` | **max 0.00162** |
| APCA raw | `|raw| ≤ APCA_RAW_IDENTICAL_CEILING = 1.98152` | **max 1.95012** |
| public APCA | — | **`apcaLc == 0` on every single item** |
| ladder target | relative error ≤ 0.06 | **max 0.0360** |
| gamut | a constructed point clamped by more than 0.01 OKLab is rejected | enforced per draw |
| foreground | `okLabDistance(accent, foreground) ≥ 0.07444` | enforced per draw |

`APCA_RAW_IDENTICAL_CEILING` is the |raw| that two *literally identical* colours already produce.
Staying under it is what makes `apcaLc` come out at **exactly 0** — on the public APCA scale these
accents carry *no luminance contrast at all*, which is the regime where the escape is the only thing
between the palette and a refusal.

The foreground guard matters: without it an item could be answered "no" because the accent had become
a second foreground, which is a **different** failure with its own open question (B31, the
foreground↔accent bar) and is not what this round is measuring.

**The fit uses the achieved distance, never the target.**

### 3.3 The anchors — six of round 1's panels, replayed unchanged

Six items are `accent-functional-1`'s own stimuli, drawn by the **same renderer**:
`review-ui/accent-panel.js` is `bracketing.js`'s `renderAccent()` lifted into a module that both
pages import. One renderer, two callers — not a copy that agrees today. Same three shapes, same
classes, same colours, same stylesheet rules.

**They are chosen on DISTANCE, never on how they were answered.** Selecting anchors by their round-1
answers would be selection on the outcome and would void the bridge. The rule, fixed before the draw:
take the round-1 `ladder` item nearest each of six probe distances **0.06, 0.09, 0.12, 0.15, 0.20,
0.28**, no duplicates. Realized:

| probe | replays | achieved distance |
|---|---|---|
| 0.06 | `af-ladder-r00-h1-mid` | 0.06057 |
| 0.09 | `af-ladder-r02-h1-mid` | 0.08989 |
| 0.12 | `af-ladder-r03-h1-dark` | 0.11147 |
| 0.15 | `af-anchor-p2-ladder-08` | 0.14813 |
| 0.20 | `af-ladder-r06-h0-mid` | 0.20043 |
| 0.28 | `af-ladder-r08-h1-dark` | 0.28867 |

The probes span the ladder rather than clustering at a crux, because the quantity wanted is a
**curve** — how far the answers move between lab and real, *at each distance* — and a bridge measured
at one rung cannot see a shift that varies with distance.

`af-anchor-p2-ladder-08` is itself a replay (round 1 replayed it from
`bracketing-round-1-clarified`), so those pixels will now carry three answers under two criteria and
two stimulus classes. That is a bonus, not a design goal.

An anchor has **no artwork**. The fixture schema requires every item to name an image, so each anchor
carries a distinct otherwise-unused cover reference and **never renders it** — the panel renderer
ignores `item.media` entirely. Distinct rather than shared because `validateFixture` refuses a
repeated `(questionKey, imageId)` pair.

The anchors are **shuffled in with everything else**. A replay the reviewer could recognise as a
replay would be answered from memory of round 1, and that memory is exactly the confound they exist
to exclude.

### 3.4 Stratification — realized, and asserted by the generator

Ten rungs, log-spaced 0.06 → 0.30, three items each. **Realized span 0.05997 → 0.30244.**

Cell assignment, rung `i` slot `j`, asserted by `assertBalanced()` rather than trusted to this
paragraph:

- `band = (i + j) mod 3` — **every rung covers all three lightness bands exactly once**, so field
  lightness can never be confounded with distance. Bands are OKLab L of the **governing field**:
  dark [0, 0.5) · mid [0.5, 0.7) · light [0.7, 1].
- `hueThird = (i + 2j) mod 3` — **every rung covers all three accent hue thirds exactly once**
  (`2j mod 3` is `{0, 2, 1}`, all distinct). Boundaries are round 2's, 0°/120°/240°, and the third is
  re-derived from the **finished 8-bit accent** and used as a rejection criterion — a stratum label
  that does not survive rounding is a label about the intent, not the stimulus.
- `role = (i + [j == 1]) mod 2` — each rung carries **both** governing roles, and over ten rungs the
  split is exactly **15 surface / 15 background**.

Realized marginals: bands **10/10/10**, hue thirds **10/10/10**, governing roles **15/15**. The
band × role cross-tab runs 4–6 per cell (background: 6 dark / 5 mid / 4 light; surface: 4 dark / 5 mid
/ 6 light) — it cannot be exactly flat, because real palettes have dark backgrounds and light
surfaces and the corpus is what it is. That residual imbalance is reported, not hidden, and §6.4
condition 3 tests for stratum dependence regardless.

Covers are assigned by a seeded scan: the first cover that **admits** an isoluminant accent in the
required cell takes it. Admission depends on the field colour and the gamut — **never on any answer**,
which is what `selectionRelationToVariable: "independent-of-the-variable"` will assert to
`fitWithDeclaredSupport` in §6.2.

### 3.5 The field is rendered flat, and that is a declared deviation

`fieldCss` is the background hex and nothing else, exactly as `endorsement-recheck.ts:402` does it.
Two reasons, the second load-bearing:

1. **An accent cannot be isoluminant to a ramp.** A gradient field has a different luminance under the
   top icons than under the bottom ones, so a gradient item could not carry a controlled distance at
   all — it would be an uncontrolled stimulus wearing a ladder's label.
2. **The Sunshine item's prior verdict was given on a flat render.** `endorsement-recheck-1` showed
   that palette flat and said so in its own `gradientNote`; *that* is the stimulus the reviewer called
   unreadable. Re-rendering it with a ramp would mean the one item with a known prior answer no longer
   replays what was answered.

**Consequence, stated plainly: this round says nothing about accents on gradient stops.** The contract
checks that pair too. It is not in this fixture and is not settled by it.

### 3.6 Controls and repeats

Controls are built on **real covers, in the mock**, like everything else — a control rendered as a
synthetic panel would vouch for the reviewer's attention to *panels*, which is not the pass that needs
vouching for. One of each direction on each governing role:

| item | direction | governing | distance | must be answered |
|---|---|---|---|---|
| `ar-control-obvious-0` | obvious | surface | 0.70389 (Lc −103.4) | **yes** |
| `ar-control-obvious-1` | obvious | background | 0.94005 (Lc 94.2) | **yes** |
| `ar-control-identical-0` | identical | surface | 0.00000 | **no** |
| `ar-control-identical-1` | identical | background | 0.00000 | **no** |

`control-identical` sets the accent to *exactly* the governing field colour, so those accent elements
vanish into it. Both directions must hold under any reading of any criterion.

Four repeats, drawn from rungs 2–7 where answers can actually disagree — a repeat at either end of the
ladder measures boredom, not noise. Each is separated from its twin by ≥ 12 served items; realized
**13, 30, 13, 23**. A repeat carries a **new** question key, because `validateFixture` refuses a
repeated `(questionKey, imageId)` pair and two answers under one key would collide.

## 4. What is served, and what is not

The render side-car `review-ui/accent-real-1.data.json` is a **static file the browser can read in
full**, so everything in it is effectively on screen. It carries exactly four keys per item:
`questionKey`, `stimulus`, and one of `side` / `panel`. **No rung, no target distance, no stratum, no
governing role, no achieved distance.** The question keys are opaque seeded slugs, never indices —
`accent_real_00` in generation order would spell out the ladder.

The truth lives in `accent-real-round-1-truth.json`, which is **never served**, and it carries the
full `placementProfile`: |APCA raw|, Lc and OKLab distance for the accent against the field, the
surface, the background **and** the foreground. Nothing about the non-governing placements is hidden
from the analysis.

## 5. What this round does **not** settle

- **Accents on gradient stops.** §3.5. The contract checks that pair; this fixture does not contain it.
- **The foreground.** The refinement of 2026-08-04 is explicit that an isoluminant foreground *"will
  not be fine at all"*. Nothing here licenses any foreground escape at any distance.
- **B31, the foreground↔accent bar.** A different pair on a different criterion. The construction
  actively excludes it (§3.2's foreground guard).
- **Anything above the epsilon.** A caller who raises `minAccentContrast` is asking for luminance
  contrast specifically; this round speaks only to the zero-contrast escape.
- **Whether "realism" or "surface role" is the operative variable.** The realism decision's own third
  caveat names this rival: *"a straightforward surface-versus-field effect where what matters is the
  SURFACE ROLE the accent sits on rather than realism as such."* §3.4's 15/15 governing-role split and
  §6.4 condition 3 give the round a chance to **see** it; a single round cannot fully separate it from
  realism, and this document does not claim it will.

## 6. The fitting rule — pre-registered in full, before any answer exists

Evaluated in the order given; the first gate that trips decides the verdict.

### 6.1 Validity gates, checked before the fit is looked at

- **G1 — controls.** Every control that **has been answered** must be answered correctly:
  `control-obvious` **works**, `control-identical` **does_not_work**. Any *wrong* answer ⇒ verdict
  **`void`**; no threshold is reported and the round is re-run. `cant_tell` on a control is a **wrong**
  answer: both are unambiguous under any reading. A control that is merely *unanswered* is not a
  failure — that is G3's business, and "the reviewer was not attending" and "the reviewer is not
  finished" must not share a verdict.
- **G2 — repeat consistency.** At least **3 of 4** repeats must agree with their twin. At ≤ 2 of 4 ⇒
  verdict **`noise-dominated`**: the fit is computed and reported as **exploratory only**, and the
  constant is not changed on it. Repeats with only one of the pair answered are not counted either way.
- **G3 — coverage.** At least **27 of the 30** real ladder items answered **and all four controls
  answered**. Below either ⇒ verdict **`incomplete`**, no adoption.
- **G4 — escape share.** If `cant_tell` exceeds **half** of the answered real ladder items, verdict
  **`no-reliable-rate`** and no threshold is adopted (REVIEW_UI.md §4: *"A stratum whose escape share
  exceeds half has no reliable rate and is reported as having none"*, machine-supported by
  `ESCAPE_SHARE_NO_RELIABLE_RATE_ABOVE` in `src/stats`). The share is reported **per stratum** whether
  or not it fires, and it is never subtracted from anything.

### 6.2 The primary fit

**Population: the 30 `ladder` items and nothing else.** The six anchors and the Sunshine item are
bridge measurements and are **never pooled into the fit** — they are a different stimulus class and a
known prior answer respectively, and pooling either would let the lab side move the real number.
Repeats are excluded too: they measure noise, not location, and a duplicated point double-weights one
rung. Items answered `cant_tell` are excluded from the fit and counted in G4.

**Estimator: `fitLogistic` from `src/review-server/analyze-bracketing.ts`, unchanged**, on the
**achieved** governing-pair `okLabDistance`, direction `"increasing"`. Unchanged is the point: this
round's threshold has to be comparable with 0.04554 and 0.07444, and that requires the same estimator,
not a similar one.

**Wrapped in `fitWithDeclaredSupport` from `src/stats`** — that is what the shared module is for, and
the row it offers for exactly this is *"a fit or a threshold | `fitWithDeclaredSupport` | fit to a
sample its own variable truncated"*. The declared support, fixed here:

- `variableUnderTest`: `"OKLab distance between the accent and its governing field"`
- `claimDomain`: `{ min: 0.06, max: 0.30 }`
- `selectionRule`: the §3.4 seeded-scan rule, verbatim from the fixture's `selection.rule`
- `selectionRelationToVariable`: **`independent-of-the-variable`** — admission depends on the field
  colour and the gamut, never on any answer.

`assessSupport`'s verdict and `extrapolatedBeyondSample` are **reported in the headline**, not
buried. A threshold outside the observed range is an extrapolation regardless of how clean the fit is.

**The calibrated value is `fit.threshold`, rounded to five decimals.** Under complete separation
`fitLogistic` reports the geometric midpoint of the separation interval and sets `separated: true`;
that is used as-is, and `separated` is reported in the headline — a bracket is not a measurement.

### 6.3 The bridge measurements — reported separately, always, and never pooled

Three of them, and they are the round's second deliverable:

1. **The lab-versus-real gap.** The six anchors' answers here against the same items' answers in
   `accent-functional-1`, re-collected from the warehouse at analysis time. Paired on identical pixels,
   so **`mcnemarExact` from `src/stats`** is the test — the pairs, not the items, are the n, and the
   module refuses to let that be misreported. Escapes are excluded from the 2×2 and **counted**
   (§2.1). Reported as a 2×2 plus a per-anchor table with distances.
   **The pre-registered prediction:** if the realism diagnosis is right, anchors should be answered
   *more* favourably than real items at the same distance — the flat panel flatters. A null result
   here is a real finding and would put the diagnosis itself back on the table.
2. **`realVsSynthetic = realThreshold − 0.04554`**, reported with sign and with the real threshold's
   95% interval. The realism diagnosis predicts this is **positive**. An interval containing zero means
   the round did not separate the two stimulus classes.
3. **The Sunshine item.** Its answer, against its known prior verdict `does_not_work` at 0.12117.
   Reported on its own. It is one item and it is reported as one item.

### 6.4 Adoption, the window, and the six ways it is refused

If G1–G4 pass and the fit converges, the proposal is
`ACCENT_FUNCTIONAL_DISTANCE := round(fit.threshold, 5)`, tag `[UNCALIBRATED]` → `[REVIEWED]`,
provenance citing this round and this document.

**THE ADOPTION WINDOW IS `[0.04554, 0.30244]`, AND A VALUE ABOVE THE PLACEHOLDER 0.14591 IS INSIDE
IT.** This sentence is the reason the window is stated as a range rather than as "near the
placeholder". The real-cover evidence points **up**: the reviewer called 0.121 unreadable, and if the
diagnosis is right the real threshold sits above 0.14591 and the constant should **rise**. That
outcome is pre-registered here as an **ordinary adoptable result**, in advance, so that nobody can
later treat a rise as a surprise to be explained away — and equally so that a rise cannot be claimed
as a prediction confirmed if the number in fact lands low. Both directions were writable before any
answer existed, and both are written.

**Refused, and reported as such, if:**

1. **`threshold < 0.04554`** — real stimuli would need *less* separation than flat synthetic panels,
   which falsifies the premise that commissioned this round. Verdict **`contradicts-realism-diagnosis`**.
   This is a **finding, not a failure**, and a valuable one: it would mean the realism diagnosis is
   wrong and round 1's reading 2 (*"the wording landed and the retraction was a priori"*) is back in
   play. No constant moves on it; the reviewer rules.
2. **`threshold > 0.30244`** — above the largest distance any stimulus in either round has ever
   carried. Verdict **`refuses-endorsed`**: it would refuse accents the reviewer endorsed on synthetic
   panels at 0.24181 and above, and the repair is a wider ladder, not adoption.
3. **Stratum dependence.** If any per-band, per-hue-third or **per-governing-role** fit's threshold
   falls outside the **pooled 95% interval**, verdict **`stratum-dependent`** and **no single scalar is
   adopted**. The governing-role cut is the one that matters most here: it is the round's handle on
   §5's surface-role rival, and a disagreement between the surface and background halves would be a
   finding about *what the constant is a function of*, not a nuisance.
4. **`separated: true` with a separation interval wider than 1.5×** round 1 part 2's pooled interval
   (0.05211–0.10564, width 0.05353) — a bracket too loose to call a measurement. Verdict
   **`bracketed-only`**: the interval is reported, the placeholder stays, the ladder is refined.
5. **`contradicts-sunshine`.** If the adopted threshold would **grant** the escape at 0.12117 (i.e.
   `threshold ≤ 0.12117`) **while the Sunshine item is answered `does_not_work` in this round**, the
   round would be re-granting an escape the reviewer has now denied **twice** on the same pixels — once
   in chat, once inside a blinded ladder. No value is adopted; the contradiction is the headline and
   the reviewer rules. (If the Sunshine item is answered `works` this time, that is a **retraction of
   the chat ruling** and is reported as such — loudly — because it would change the standing of
   `d-2026-08-04-endorsement-recheck-1-resolved-by-chat-two-endorsements-retired`.)
6. **`assessSupport` returns anything other than `supports-the-claim`** *and* the fitted threshold is
   `extrapolatedBeyondSample`. Verdict **`unsupported-claim`**: a number outside the range the sample
   covers is not a measurement of that range.

**Adoption is the reviewer's act, not an agent's.** The analysis writes `DECISION PENDING` and
proposes; it does not edit the constant.

### 6.5 Exploratory — reported, never used to pick the headline

Per-band, per-hue-third and per-governing-role fits; the escape share per stratum; the distance at
which the fitted probability first exceeds 0.9; the full `placementProfile` summary (how much contrast
the *non*-governing placements carried, per item, which is the round's own measure of how much a "yes"
could have leaked from elsewhere); and the anchor table in full. Labelled exploratory in the output;
none of them can change the verdict.

## 7. Output

`research/v3/data/calibration/accent-real-round-1-analysis.json`, schema
`accent-real-round-1-analysis/v1`, written by `data/calibration/analyze-accent-real-round-1.ts`. It
echoes this document's rule verbatim under `preRegisteredRule` and records `answerHygiene` so that a
clean round is visibly clean.

---

*Section 8 — Results — will be appended after the round is answered, and not before.*
