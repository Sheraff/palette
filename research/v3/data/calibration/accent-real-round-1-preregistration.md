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

## 8. Results — scored 2026-08-04

**Verdict: `stratum-dependent` — REFUSED under §6.4 condition 3. No value is adopted.
`ACCENT_FUNCTIONAL_DISTANCE` stays at the placeholder 0.14591 and stays `[UNCALIBRATED]`.**

The analyzer was run **as committed at 45ad472, unmodified**. It did not crash on real data and
needed no fix. Analysis: `accent-real-round-1-analysis.json`.

### 8.0 ROUND CONDITIONS — read this before any number below

**Mid-round the reviewer asked which of three readings of the question to judge under, and the
orchestrator clarified in chat.** The wording **on screen was left unchanged**, deliberately: §2 is
explicit that the six anchors measure the lab-versus-real gap only if everything except the stimulus
is held constant, and a mid-round edit to the on-screen instruction would have destroyed the
instrument. The clarification as given:

> Judge **only** whether the accent does its visual job against its field — the eye lands on the
> accented elements without hunting. **Aesthetic fit to the artwork is explicitly excluded** — yes,
> even if the colour looks wrong for the artwork. **The accent's relation to the foreground is
> excluded** — that is a separate rule.

**The caveat, stated as it must be stated:** *some unknown prefix of the answers may predate the
clarification.* Answer ordering versus the question's timestamp is **not available** — timestamps
mean nothing under the standing ruling, and nothing in this scoring reads a clock to order, split or
infer anything. This condition was not pre-registered, because it had not happened yet. It is
disclosed here rather than absorbed.

**Stability was therefore checked without clocks**, by `fixture.serveOrder` and by the revision
structure of the warehouse records (§8.7). **The short answer: the fit is not sensitive to an
early-versus-late split, but the round does depend on the re-pass.** Both halves of the served order
land inside the pooled 95% interval, and the revised and unrevised items agree to within 0.0024 —
but a counterfactual fit on every item's *first* recorded answer is degenerate. Details and the
honest reading in §8.7.

### 8.1 Validity gates — all four pass

| gate | required | realized | result |
|---|---|---|---|
| **G1** controls | 4/4 correct | **4/4**, none `cant_tell` | pass |
| **G2** repeats | ≥ 3 of 4 agree | **4/4 agreed** | pass |
| **G3** coverage | ≥ 27 of 30 ladder + 4 controls | **30/30 ladder, 4/4 controls** | pass |
| **G4** escape share | `cant_tell` ≤ ½ of answered ladder | **0 of 30, share 0.0000** | pass |

45 of 45 items answered. `answerHygiene` reports **no** unexpected answers, **no** truth item without
a fixture row, and 6 of 6 anchors paired to their round-1 answers.

**The escape was offered on all 45 items and used on none.** Its share is a first-class result under
§2.1 and it is zero, pooled and in every one of the ten reported strata. Under §6.4 refusal 4 the
same fact reads the other way: nothing was undecidable, so nothing was subtracted from anything.

### 8.2 The primary fit — 30 real-ladder items and nothing else

- **Threshold: `0.18630`**
- **95% confidence interval: `[0.14052, 0.24700]`**
- **Separation: `separated: false`** — a fitted curve, not a bracket. n = 30, 10 `works`, converged.
- **Support: `supports-the-claim`**, domain coverage **1.00** over [0.06, 0.30], observed
  0.05997 – 0.30244, **`extrapolatedBeyondSample: false`**.

Anchors, the Sunshine item and the repeats were excluded from this fit, as pre-registered. The fit is
on the **achieved** governing-pair OKLab distance, never the target.

**0.18630 sits above the placeholder 0.14591 — the direction §6.4 pre-registered as an ordinary
adoptable result before any answer existed.** It is inside the adoption window [0.04554, 0.30244].
It is also, on its own, the answer to the round's question. What refuses it is §8.5.

### 8.3 Every refusal condition, checked individually

| # | condition | test | fires? |
|---|---|---|---|
| 1 | `contradicts-realism-diagnosis` | `threshold < 0.04554`? **0.18630 ≥ 0.04554** | **no** |
| 2 | `refuses-endorsed` | `threshold > 0.30244`? **0.18630 ≤ 0.30244** | **no** |
| 3 | `stratum-dependent` | any stratum fit outside the pooled 95% interval? **three are** | **YES** |
| 4 | `bracketed-only` | `separated: true` with width > 0.08030? **`separated: false`** | **no** (N/A) |
| 5 | `contradicts-sunshine` | `threshold ≤ 0.12117` **and** Sunshine `does_not_work`? **0.18630 > 0.12117** | **no** |
| 6 | `unsupported-claim` | support ≠ `supports-the-claim` **and** extrapolated? **`supports-the-claim`, not extrapolated** | **no** |

**Exactly one of the six fires.** Condition 5 deserves its own line because it came closest to
mattering and did not fire for the right reason: the Sunshine item **was** answered `does_not_work`,
so the second half of the conjunction held — the round was one low threshold away from re-granting an
escape the reviewer has now denied twice on the same pixels. It did not, because the fitted threshold
lands **above** 0.12117 and, more than that, the 95% interval `[0.14052, 0.24700]` **excludes**
0.12117 entirely. **The fit and the Sunshine verdict agree**, rather than merely failing to collide.

### 8.4 The bridge measurements — never pooled, reported on their own

**(1) The lab-versus-real gap, as the pre-registered test.** `mcnemarExact` on the six anchors' answers
here against the same panels' answers in `accent-functional-1`:

| | | |
|---|---|---|
| both succeeded | 4 | |
| only lab (round 1) succeeded | 1 | `af-ladder-r02-h1-mid`, 0.08989 |
| only real round succeeded | 1 | `af-ladder-r00-h1-mid`, 0.06057 |
| neither | 0 | |

**2 discordant pairs of 6 compared, p = 1.0000, two-sided. A null.** Escapes excluded: 0. Unanswered:
0. The module's own caveat travels with it — *the n is 2 discordant panels, not 6*.

**What that null means, precisely, and what it does not.** The test as named in §6.3 compares
*anchors here* against *the same anchors in round 1*. A null there says the **identical pixels were
answered the same way in both rounds** — i.e. the instrument did not drift and the byte-identical
wording did not move the reviewer. That is the result §2 spent its argument buying, and it is a good
one.

**§6.3's prediction sentence describes a different contrast from the test §6.3 names.** The
prediction — *"anchors should be answered more favourably than real items at the same distance"* — is
about **anchors versus real items**, not about anchors versus their own round-1 answers. The
pre-registration is internally ambiguous on this point and the analyzer implemented the comparison
that was *named*. The comparison that was *predicted* is reported here as **exploratory**, because it
was not the pre-registered test:

| anchor distance | anchor answer | real ladder items within ±0.03, `works` rate |
|---|---|---|
| 0.06057 | **works** | 0 / 9 |
| 0.08989 | does_not_work | 0 / 12 |
| 0.11147 | **works** | 1 / 9 |
| 0.14813 | **works** | 4 / 9 |
| 0.20043 | **works** | 3 / 6 |
| 0.28867 | **works** | 3 / 3 |

Anchors overall **5 of 6 `works`**; real ladder items over the same span **7 of 27**. The gap is
widest at the bottom of the ladder, exactly where the realism diagnosis said the flat panel flatters:
a synthetic panel at 0.061 works, while every one of nine real covers within ±0.03 of it does not.
**This is exploratory and it is descriptive — no test was pre-registered for it and none is run here.**

**(2) `realVsSynthetic` = 0.18630 − 0.04554 = `+0.14076`, positive**, the sign the realism diagnosis
predicted. The real threshold's 95% interval `[0.14052, 0.24700]` **excludes 0.04554**, so the round
**did** separate the two stimulus classes on the pre-registered comparison.

**(3) The Sunshine item.** `ar-sunshine`, OKLab **0.12117**, `apcaLc == 0`. Answered
**`does_not_work`**. **It reproduces its prior verdict.** The chat ruling — *"item 2: accent on
surface is unreadable"* — is **not** retracted; `d-2026-08-04-endorsement-recheck-1-resolved-by-chat-two-endorsements-retired`
stands undisturbed. One item, reported as one item.

**But see §8.7:** the Sunshine item's *first* recorded answer was `works`. Its final answer is
`does_not_work`. Under the first-pass answers this round would have reported a **retraction of the
chat ruling** — the loudest outcome §6.3 contemplated. It does not, on the standing answers. This is
disclosed rather than left in the warehouse to be found.

### 8.5 The refusal — per-stratum fits, and what disagreed

Pooled 95% interval: **[0.14052, 0.24700]**.

| stratum | n | `works` | threshold | inside pooled CI? |
|---|---|---|---|---|
| **governing-role: surface** | 15 | 5 | **0.17856** | **yes** |
| **governing-role: background** | 15 | 5 | **0.19426** | **yes** |
| band: dark | 10 | 2 | 0.24610 | yes |
| band: light | 10 | 3 | 0.19755 | yes |
| **band: mid** | 10 | 5 | **0.13437** | **NO** (below) |
| **hue-third: 0** | 10 | 5 | **0.13417** | **NO** (below, and `separated: true`) |
| hue-third: 1 | 10 | 3 | 0.20877 | yes |
| **hue-third: 2** | 10 | 2 | **0.26385** | **NO** (above) |

**Three strata fall outside the pooled interval, so §6.4 condition 3 fires and no single scalar is
adopted.**

**The governing-role cut — the one §6.4 called "the one that matters most" — AGREES.** Surface
0.17856 and background 0.19426 both sit inside the pooled interval, 0.0157 apart, on 15 items each
with an identical 5/15 `works` rate. **§5's surface-role rival did not show itself.** The round's
handle on "is this realism or is it just the surface role" came back saying: not the surface role.
That is the single most useful thing the round establishes and it survives the refusal intact.

**What disagreed instead was field lightness and accent hue.** The mid-lightness band and hue-third 0
want a threshold near 0.134; hue-third 2 wants one near 0.264. That is a spread of roughly 2× across
hue thirds, on 10 items per cell.

**Reported honestly, and it does not change the verdict:** all three disagreeing strata have their own
95% intervals, and **every one of them contains the pooled 0.18630** (band:mid [0.09207, 0.19609];
hue-third:0 [0.11180, 0.16101] — which does *not*; hue-third:2 [0.11933, 0.58340]). So two of the
three disagreements are comfortably absorbed by their own uncertainty at n=10, and one — hue-third 0,
which is additionally **completely separated**, its reported value being the middle of a gap rather
than a fitted point — is not. **The pre-registered rule is a point-estimate-versus-pooled-interval
comparison and it was written that way before any answer existed. It is applied as written. It is not
relaxed here, and this paragraph is an observation about the rule's power at n=10, not an argument
against its verdict.**

### 8.6 Exploratory, reported and never used to pick the headline

- **Distance at which the fitted probability first exceeds 0.9: 0.34731** — above the top rung
  (0.30244) and therefore an extrapolation beyond the sample. Reported as such.
- **Escape share by stratum: 0.0000 in all ten**, pooled and per stratum.
- **Placement profile** — the round's own measure of how much a `works` could have leaked from a
  non-governing placement — is in the analysis JSON under `exploratory.placementProfile`.

### 8.7 Order stability, without clocks — the disclosure's own check

Computed by `accent-real-round-1-order-stability.ts`, an **addendum** that is not pre-registered and
**cannot change the verdict**. It reads `fixture.serveOrder` and the records' `revision` counters, and
**never reads `ts`**. Its `pooledFinal` re-fit reproduces the analyzer's **0.18630** exactly, which is
the standing proof that it is reading the round the same way.

**The revision structure is the finding.** Of 45 items, **23 accumulated more than one label
revision**, and they are almost exactly a **prefix of the served order**: revised items occupy served
positions **0–23**, unrevised items occupy **19–44**, and the two ranges overlap on **one** item
(position 19, `ar-ladder-17`, answered `works` and never revised). Six items — the first six served —
carry three revisions. **This is reported as a structural observation. No causal claim is made that
the re-pass was caused by the clarification**; that reading is the reviewer's to make or refuse.

Nine ladder items changed answer between first and last revision, plus the Sunshine item
(`works` → `does_not_work`) and one repeat (`ar-repeat-00`, `does_not_work` → `works`, matching the
same flip in its twin `ar-ladder-21` — the repeat pair agreed both before and after).

| cut | n | `works` | threshold | 95% CI |
|---|---|---|---|---|
| pooled, final answers (reproduction check) | 30 | 10 | **0.18630** | [0.14052, 0.24700] |
| **first half served** (positions 1–19) | 15 | 6 | **0.15213** | [0.10270, 0.22535] |
| **second half served** (positions 21–44) | 15 | 4 | **0.22100** | [0.16791, 0.29089] |
| revised items only | 16 | 6 | **0.18236** | [0.11654, 0.28535] |
| unrevised items only | 14 | 4 | **0.18477** | [0.13435, 0.25410] |
| **counterfactual: every item's FIRST answer** | 30 | 7 | **4.29594** | [0, 76 182 429] |

**Is the fit sensitive to an early-versus-late split? On the standing answers, no.** Both halves' point
estimates fall **inside** the pooled 95% interval — the same test §6.4 condition 3 applies to strata —
and each half's own interval contains the pooled 0.18630. The revised and unrevised halves agree to
**0.0024**, which is the more directly relevant cut: whatever separates re-answered items from
never-re-answered ones, it is not the threshold.

**Does the round depend on the re-pass? Yes, completely, and this is the real limitation.** The
counterfactual fit on every item's *first* recorded answer is **degenerate** — threshold 4.29594 with
an interval seven orders of magnitude wide. The first-pass answers carry essentially **no monotone
relation to the variable under test**. After the re-pass they fit cleanly and converge.

**The honest reading, stated without overclaiming:** the standing answer set is internally coherent and
order-stable; the first-pass set was not. Had there been no re-pass, this round would have produced
nothing fittable. That is consistent with the clarification having sharpened a criterion the reviewer
was applying inconsistently — **but the round cannot demonstrate that**, because it has no clock-free
way to establish that the re-pass followed the clarification rather than accompanying some other
change of mind. **The number 0.18630 is a number about the post-re-pass answers.** It is offered as
nothing else.

### 8.8 Consequence for the two-tier accent semantics — spelled out both ways

The two tiers, as the reviewer mandated them on 2026-08-04 and as `constants.ts` records them:

- **Tier 1 — detection.** *"Can you see the difference?"* → `ACCENT_VISIBILITY_COLOR_DISTANCE`
  **0.07444**, measured, and **retired from the accent escape**; it is now on loan to
  foreground↔accent (`FOREGROUND_ACCENT_SEPARATION_DISTANCE`, loose end **B31**).
- **Tier 2 — function.** *"Does this work as an accent at a glance?"* → `ACCENT_FUNCTIONAL_DISTANCE`,
  the accent's single escape from its APCA epsilon floor, evaluated **per pair** as
  `escapeDenied = pair.distance < ACCENT_FUNCTIONAL_DISTANCE`. Placeholder **0.14591**, a geometric
  midpoint of two borrowed anchors, tagged `[UNCALIBRATED — reviewer-mandated two-tier semantics
  2026-08-04; must be well above the JND bars]`.

**Had the round adopted (it did not):** the constant would have risen 0.14591 → 0.18630, the escape
would have narrowed, and the separation between the tiers would have widened from **1.96×** to
**2.50×** the detection bar. The reviewer's *"well above the JND bars"* would have gone from an
asserted direction to a measured multiple.

**On the refusal, which is what actually happened — the round is still not empty for the two-tier
question, and this is the part that would be lost if the refusal were reported as a null:**

1. **The two tiers are real — and this round un-fires a clause that the synthetic round fired against
   them.** `accent-functional-1` pre-registered `criterionGap = functionalThreshold − 0.07444` with an
   explicit existential clause: *"A gap whose interval includes zero means the reviewer does not in
   fact distinguish the two criteria on these stimuli … and one that would put the entire two-tier
   semantics back on the table rather than merely re-tuning a digit."* **That clause fired.** Round 1
   returned a criterion gap of **−0.02890**, negative, with a pooled interval containing 0.07444 — its
   own §8 says so and names it as the clause that fired. The two-tier semantics has been on the table
   since.

   **This round takes it back off.** The real-stimulus functional threshold's 95% interval
   `[0.14052, 0.24700]` **excludes the detection bar 0.07444 outright**, and the gap is **+0.11186**,
   positive, in the direction the refinement claimed. On real stimuli the reviewer **does** distinguish
   the two criteria, and distinguishes them by a factor of **2.50×**. Until today the claim that
   *function needs more separation than detection* was a reviewer ruling that the one round to test it
   had contradicted. **The mandate is vindicated on real stimuli even though the number is refused** —
   and this is the round's most consequential result, because it is about whether the scheme exists
   rather than about what digit it carries.

   The direction also matters for what the tiers could have done. **The downward risk was an actual
   inversion**: the synthetic round's 0.04554, had it been adopted, would have put tier 2 *below* tier
   1 and made the "functional" bar laxer than the "detection" bar it was created to exceed. Nothing in
   this round points that way.
2. **The placeholder survives this round.** 0.14591 lies **inside** `[0.14052, 0.24700]` — by only
   0.00539, at the very bottom edge, but inside. This matters because the *synthetic* round excluded
   the placeholder at 95% **from below**. The two bodies of evidence pointed in opposite directions,
   §1 said so, and the real-stimulus round is the one built to be believed about real stimuli: it does
   **not** exclude the placeholder. **Leaving 0.14591 in force is now a positively supported holding
   position rather than an unexamined default** — but a placeholder inside a wide interval is still a
   placeholder, and the tag stays `[UNCALIBRATED]`.
3. **The second tier is not yet demonstrably a single scalar.** This is the refusal's real content and
   the cost it imposes on the semantics. The governing-role cut **agrees** — so the tier does *not*
   need to split by field role, and §5's surface-versus-field rival is answered in the semantics'
   favour. But **field lightness and accent hue disagree**, mid-lightness and hue-third 0 wanting
   ≈0.134 against hue-third 2's ≈0.264. If that survives replication, **tier 2 is a function of the
   field's lightness and the accent's hue, not a constant** — and `escapeDenied`, which today compares
   one distance to one scalar, would need to compare it to a value that depends on the pair. That is a
   change to the *shape* of the escape rule, not to its digits, and it is not licensed by 10 items per
   cell. It is a hypothesis this round raises and cannot settle.
4. **The Sunshine case is consistent with the semantics as written.** At 0.12117 with `apcaLc == 0`,
   Sunshine is refused the escape under the placeholder (0.12117 < 0.14591) and refused it under the
   fitted value (0.12117 < 0.18630), and the reviewer refused it too, twice, on the same pixels.
   **Every tier-2 candidate value the round produced denies the escape on the one case with a known
   answer.** The escape rule's behaviour on the only real case anyone has ruled on does not turn on
   which of these numbers is in force.

**Net: the two-tier split is strengthened, its second tier stays uncalibrated, and its open question
changed shape — from "what is the number" to "is it a number".**

### 8.9 The proposed constants diff — NOT applied, and NOT proposed for adoption

Recorded so that the refused value is on the record in the form it would have taken, and so that
nobody has to reconstruct it later. **This diff must not be applied.** The verdict is a refusal;
adoption is the reviewer's act and there is nothing here for them to adopt.

```diff
--- a/research/v3/src/contract/constants.ts
+++ b/research/v3/src/contract/constants.ts
@@ -327,7 +327,7 @@
- * `[UNCALIBRATED — reviewer-mandated two-tier semantics 2026-08-04; must be well above the JND bars;
- * calibrate via a functional-visibility round, criterion "does this work as an accent at a glance",
- * NOT the identity criterion]`
+ * `[REVIEWED — accent-real-1, 2026-08-04; functional-visibility on real stimuli, n=30 real-cover
+ * ladder items, fitted 0.18630, 95% CI [0.14052, 0.24700], separated: false; supersedes the
+ * bracketed placeholder 0.14591]`
@@ -393,1 +393,1 @@
-export const ACCENT_FUNCTIONAL_DISTANCE = 0.14591
+export const ACCENT_FUNCTIONAL_DISTANCE = 0.1863
```

**`constants.ts` is unchanged on disk. Line 393 still reads `0.14591` and the tag still reads
`[UNCALIBRATED]`.**

**And the diff above is not sufficient anyway — a second reason not to apply it.** Adopting 0.1863
would break committed artefacts that the two-line diff does not touch. Found while writing this
section; recorded so the next round budgets for it:

1. **`tests/contract-invariants.test.ts:701` fails.** It asserts
   `colorDistance(foreground, background) > ACCENT_FUNCTIONAL_DISTANCE * 2`. The measured distance is
   **0.30724**, and `0.1863 × 2 = 0.37260`. **This assertion fails for any adopted value ≥ ≈0.15362** —
   which is to say for most of the adoption window, including the placeholder's own upper
   neighbourhood. The assertion is incidental to that test's real point (the foreground gets no escape
   at any distance) but it is a hard failure today.
2. **The tier-2 straddle fixtures collapse.** `accentFunctionalJustUnderDistance` (0.14511) and
   `accentFunctionalJustOverDistance` (0.14672) bracket the *placeholder* by ~0.0008 on each side.
   Both fall below 0.1863, so both become violations and the "one palette violates, the other is
   clean" bracket at `tests/contract-invariants.test.ts:1066-1090` stops being a bracket. Re-pinning
   means re-running the 16.7 M-colour search `fixtures.ts` documents.
3. **Every "1.96×" claim goes stale** — `constants.ts:220`, `:378`, `invariants.ts:987`,
   `PHASE_0_DECISIONS.md:190`, `PHASE_0_LOOSE_ENDS.md:785`, `endorsement-recheck.ts:305` — and becomes
   2.50×. Plus the ratio prose in `fixtures.ts:439`, `:609`, `:639`.
4. **More endorsed palettes fail.** The move to 0.14591 already fails two reviewer-endorsed palettes
   on the roles matrix plus five more on the advisory reconstructed-gradient matrix. The escape is a
   `distance >= threshold` test, so raising the bar widens the condemned band monotonically. The blast
   radius at 0.1863 was not measured here.

**One ceiling worth flagging even though no refusal turned on it.** This round's condition 2 uses
0.30244, the widest stimulus either round carried. Round 1's used **0.24181** — the top rung the
reviewer called clearly visible and never retracted — on the reasoning that a threshold above it
*"would refuse an accent the reviewer plainly endorses"*. **The upper end of this round's confidence
interval, 0.24700, sits just above that ceiling.** The point estimate is comfortably below it and
nothing here trips it, but the interval reaches into territory round 1 pre-registered as
`refuses-endorsed`. A future round should reconcile the two ceilings rather than let each pick its
own.

### 8.10 Proposed decision record — for the reviewer to accept, amend or refuse

**Nothing below has been written into `PHASE_0_DECISIONS.md`.** It is a proposal.

> **`d-2026-08-04-accent-real-1-refused-its-fit-on-stratum-dependence`**
>
> `accent-real-1` put 30 real-cover ladder items, 6 replayed synthetic anchors, the Sunshine case, 4
> controls and 4 repeats in front of the reviewer under wording byte-identical to
> `accent-functional-1`. All 45 were answered, all four validity gates passed, the escape was used
> zero times, and the fit converged at **0.18630, 95% CI [0.14052, 0.24700]**, unseparated and
> supported over its claim domain.
>
> **It is refused under its own pre-registered §6.4 condition 3.** Three of eight strata — band:mid
> (0.13437), hue-third:0 (0.13417, separated) and hue-third:2 (0.26385) — fall outside the pooled
> interval, so no single scalar is adopted. `ACCENT_FUNCTIONAL_DISTANCE` stays **0.14591** and stays
> `[UNCALIBRATED]`. **A16 stays open and changes shape.**
>
> Four things the round established that outlive the refusal: (1) **the two-tier semantics is taken
> back off the table.** `accent-functional-1` fired its own pre-registered existential clause — a
> criterion gap of **−0.02890** whose interval contained 0.07444, i.e. the reviewer not distinguishing
> the two criteria on synthetic panels. On real stimuli the gap is **+0.11186** and the 95% interval
> `[0.14052, 0.24700]` **excludes 0.07444 outright**: the reviewer distinguishes function from
> detection by **2.50×**. This is the round's most consequential result, because it is about whether
> the scheme exists rather than which digit it carries; (2) `realVsSynthetic = +0.14076` with the synthetic 0.04554
> **outside** the real interval — the realism diagnosis of
> `d-2026-08-04-accent-calibration-is-a-stimulus-realism-problem` is **supported**, and the six
> anchors came back **p = 1.0000, a null**, meaning identical pixels were answered identically across
> the two rounds and the wording did not drift; (3) the **governing-role cut agrees** (surface
> 0.17856, background 0.19426, both inside the pooled interval), so §5's surface-role rival is
> answered against and the second tier does **not** need to split by field role; (4) the Sunshine item
> at 0.12117 **reproduces** its `does_not_work` chat verdict inside a blinded ladder, so
> `d-2026-08-04-endorsement-recheck-1-resolved-by-chat-two-endorsements-retired` stands.
>
> The open question moved from *"what is the number"* to *"is it a number"*: lightness band and accent
> hue third disagree by roughly 2×, which if replicated makes tier 2 a function of the pair rather
> than a scalar and changes the shape of `escapeDenied`. Ten items per cell cannot settle that.
>
> **A cost the next round must budget for, independent of the refusal:** adopting any value ≥ ≈0.15362
> breaks `tests/contract-invariants.test.ts:701` outright, and adopting 0.1863 additionally collapses
> the tier-2 straddle fixtures (0.14511 / 0.14672, both pinned around the *placeholder*), restaling
> every "1.96×" claim across six files and widening the band of condemned endorsed palettes by an
> unmeasured amount. **A two-line constants diff is not what adoption costs here.** §8.9.
>
> **Round conditions, disclosed and not absorbed:** a mid-round chat clarification narrowed the
> reading to functional visibility only (aesthetic fit excluded, foreground relation excluded) with
> the on-screen wording deliberately unchanged for anchor comparability; **some unknown prefix of the
> answers may predate it**, and answer-versus-question ordering is unavailable because timestamps mean
> nothing. Checked without clocks: the served-order halves and the revised/unrevised split all agree
> with the pooled fit, but a counterfactual fit on first-pass answers is **degenerate** — the round's
> number is a number about the post-re-pass answers, and it would have had none without the re-pass.
>
> `fundedBy`: the **74** `oracle-label` records carrying `labelSchemaVersion: "accent-real.v1"`
> (`o-mseh9upy-84dbd31f` … `o-msehl7t2-a50df329`; full id list in the analysis JSON under
> `proposedDecisionRecord.fundedBy`), plus the `batch-complete` record **`bc-msehle3f-5b16136d`**.

---

*Scored 2026-08-04 by the committed analyzer at 45ad472, run unmodified, plus a disclosed
non-pre-registered order-stability addendum that cannot change the verdict.*
