# Contract defects found by the Phase 1 authors — a decision packet

**Second pass, 2026-08-04.** The first pass carried ten items (D1–D10) from six authors. Since then
**eight more proposals** have landed — six round-2 "primes" (A′–F′) and two round-3 arms (E³, F³) —
and **four analysis passes**: the round-2 divergence map, the round-2/3 confinement audit, the stress
test, and a dedicated investigation of the robustness harness's dither metric. This pass folds all of
that in, re-ranks the whole set by consequence, and adds seven items (N1–N9, minus the two that are
packet-integrity rather than contract).

**Nothing has been renumbered.** D1–D10 keep their identifiers and their text; where a corroboration
count or a status changed it is marked. N1–N5 keep the identifiers `DIVERGENCE_MAP_2.md` §7 assigned
them; N6–N9 are new here. Every item is tagged **new**, **changed** or **unchanged** against the first
pass.

**What it asks of you.** Seventeen rulings. Most are still of the form *"here are two sentences that
disagree — which one stands?"* and take a word each. Four are genuine design decisions and are marked
as such. Two are corrections to normative text that has already been read by fourteen author-runs, so
they are the ones with the longest tail.

**Nothing here is fixed by the person who noticed it.** Recording is this document's job. In
particular: `PHASE_1_AUTHOR_BRIEF.md`, `PHASE_0_DECISIONS.md`, `V3_PLAN.md` and `src/robustness/**`
were **not** modified by this pass, and one item below (N4) is a defect *in* two of them.

**Terms are glossed where used.** No invariant number, constant name, round name, metric name or
ledger id appears without a plain-language gloss beside it. You should not have to open anything to
answer.

---

## The two buckets, and the new axis

| bucket | what it means | what you are being asked |
|---|---|---|
| **INCONSISTENCY** | Two texts in this repo say different things about the same rule, and one of them is simply stale or wrong. There is a right answer already; nobody has written it down in both places. | *Which text stands.* Usually one word. |
| **DESIGN GAP** | The documents agree, and what they agree on is incomplete: a rule with no instrument, a band nobody has decided the width of, a number nobody has measured. | *A decision.* No amount of editing settles it. |

**New in this pass — the side an item falls on.** The first pass ranked purely by "what may a
prototype publish". Four of the new items do not touch emission at all; they change the *ruler a
prototype will be measured with*, which is a different kind of consequence and was not separable in
the old ordering.

| side | what it means |
|---|---|
| **EMITS** | Resolving it changes the set of palettes a Phase 2 prototype may legally publish, or which one it will choose. |
| **JUDGED** | Resolving it changes how a prototype's output will be scored, priced or compared — the palette is the same either way; the verdict on it is not. |
| **PACKET** | About what an author could find out, or about the experiment's own record. Neither emission nor scoring, but it is the mechanical cause of several items that are both. |

## The table

Ranked by consequence across the whole set — old and new together. Rank changes from the first pass
are shown; a dash means the item is new to this pass.

| # | defect | bucket | side | verified | rank | was | status |
|---|---|---|---|---|---|---|---|
| D1 | Foreground↔accent is governed by two distances and no text says which binds | INCONSISTENCY | EMITS | **true** | 1 | 1 | unchanged |
| N4 | The brief's headline robustness sentence prints an ε figure and an identity figure as one claim | INCONSISTENCY | JUDGED | **true** | 2 | — | **changed — inverted** |
| D3 | Invariant 2 names a two-part test; one part was retired, the other never built | INCONSISTENCY + DESIGN GAP | EMITS | **true** | 3 | 3 | changed (corroborated) |
| D2 | The 0.07444 dead band around the foreground: nothing states its width is intended | DESIGN GAP | EMITS | **true** | 4 | 2 | unchanged |
| N2 | §2's *quoted* accent ruling removes colour distance; §2 and invariant 4 both retain it | INCONSISTENCY | EMITS | **true** | 5 | — | **new** |
| D4 | Invariant 4's closing clause still points the accent floor at a mechanism that moved | INCONSISTENCY | EMITS | **true** | 6 | 4 | changed (N2 survives its fix) |
| N5 | Promoting the direction-aware challenger would move the gradient boolean, not only the checks | DESIGN GAP | EMITS | **true** | 7 | — | **changed — promoted** |
| N6 | The brief's tool catalog lists three robustness arms that do not exist | INCONSISTENCY | JUDGED | **true** | 8 | — | **new** |
| D5 | `FOREGROUND_ACCENT_SEPARATION_DISTANCE` is excluded from measurement by the rounds' own construction | DESIGN GAP | EMITS | **partly** — see below | 9 | 5 | unchanged |
| D6 | The white/black escape reads as unsatisfiable; the code says otherwise | INCONSISTENCY | EMITS | **partly** — ambiguity, not a contradiction | 10 | 6 | changed (corroborated) |
| D9 | The tool catalog labels `src/contract/` "built" against a definition it does not satisfy | INCONSISTENCY | PACKET → EMITS | **true** | 11 | 9 | changed (now ledger row B45) |
| N1 | The delivered `PHASE_0_DECISIONS.md` extract's Scope line advertises material the trim removed | INCONSISTENCY | PACKET → EMITS | **true** | 12 | — | **new** |
| N7 | "The ramp's ends *are* the field roles" and "every published colour is an exact pixel" are unordered | DESIGN GAP | EMITS | **true** | 13 | — | **new** |
| D10 | The brief's problem shape implies a flat field still emits stops | INCONSISTENCY | EMITS | **true** | 14 | 10 | unchanged |
| N8 | The metric ruling names two pairs for colour distance; a named constant exists for one | INCONSISTENCY | EMITS | **true** | 15 | — | **new** |
| D8 | The brief quotes the warm SAM cost where it means the cold one | INCONSISTENCY | JUDGED | **true** | 16 | 8 | changed (now 13 of 14 arms) |
| D7 | The brief's anisotropy advice and its own numbers use opposite framings in one paragraph | INCONSISTENCY | EMITS | **partly** — equivocation, not an error | 17 | 7 | unchanged |
| — | **Closed:** the harness scores dither by hex equality (N4's original form) | — | — | **shown false** | — | — | **closed** |
| — | **Closed:** "no conforming system can republish an identical triple" (F′) | — | — | **measured; overstated** | — | — | **closed** |
| — | Stop count: "2 or 3 (4 negotiable)" vs `MAX_GRADIENT_STOPS = 4` | — | — | **not a defect** | — | — | unchanged |
| — | `PHASE_0_DECISIONS.md` §6's "See §8" | — | — | **not a defect** | — | — | unchanged |

**Separately, and not ranked with the above** — two packet-integrity items, in their own section at
the end, because they are about the experiment rather than the product: **N3** (the de-leaked manifest
mis-states its own coverage) and **N9** (the blind packet's manifest was de-leaked after round 1, so
the file arm F actually read survives only in a transcript).

**Glossary for the table.** *Invariant 1* = schema validity (is the object the right shape). *Invariant
2* = source support (is every published colour a real pixel of the image). *Invariant 3* = palette-wide
distinctness (do any two published colours read as the same colour). *Invariant 4* = no published pair
at zero luminance contrast. *The same-colour bar* = the OKLab distance below which the reviewer calls
two colours the same; four values by colour region, 0.00932 (dark neutrals) to 0.02293 (light
saturated), frozen 2026-08-03. *`[REVIEWED]` / `[INHERITED]` / `[UNCALIBRATED]`* = audit tags meaning
"measured on this question" / "measured on a different question and borrowed" / "placeholder, never
measured". *perception-4* = the 148-item reviewer round of 2026-08-04. *B31, B42, B43, B45, A4, A16,
A17* = rows in the open-items ledger `PHASE_0_LOOSE_ENDS.md`, which authors did not receive.
*A–F* = the six round-1 arms; *A′–F′* = the six round-2 arms, same seats, fresh authors; *E³, F³* =
the two round-3 arms (`arm-e-r3.md`, `arm-f-r3.md`). *F, F′, F³* are the **blind** arms — they receive
only the brief's §§2–3 constraint sheet, no contract document. Fourteen author-runs in total.

**Glossary for the metric items (N4, N6), because three different rulers are in play.**

| ruler | definition | who uses it |
|---|---|---|
| **regional bar agreement** | two palettes agree iff **all four role colours** are within their pair's regional same-colour bar (0.00932–0.02293). | the **v3 robustness harness**, on every arm, always |
| **exact-hex** | two palettes agree iff the hex strings are identical | a v3 diagnosis-only flag, documented *"never a live mode"* |
| **ε-agreement (v2-3)** | the **mean** of the four roles' OKLab distances is ≤ 0.04 | the *previous* campaign, source of "72.8%" |
| **byte-identity (v2-3)** | four role hexes + gradient boolean + midpoint hex all string-equal | the *previous* campaign, source of "0 of 114" |

*Robustness arms* = the perturbations the harness applies: re-encode at JPEG q92 / q85 / q75, a ±1-LSB
blue-channel dither (`dither-lsb1`), and matched real rendition pairs. **Five arms, and that is the
complete list** — which is N6.

---

## D1 — Two rulers govern the foreground↔accent pair, and no normative text says which binds

**Bucket: INCONSISTENCY. Side: EMITS. Rank 1, unchanged.** There is a right answer, it is in the code
and in a ledger row, and it is in neither document an author was given.

**The two texts.**

`PHASE_0_DECISIONS.md` §3 (Metrics), on where the retired accent-visibility number went:

> 0.0744 `[REVIEWED]` has moved to the **foreground↔accent** pair as
> `FOREGROUND_ACCENT_SEPARATION_DISTANCE` `[INHERITED]` — a pair it was never measured on, though a
> detection-class pair, which is the class it *was* measured on (loose end **B31**).

`PHASE_0_DECISIONS.md` §4, invariant 3, governing the same pair:

> **Palette-wide distinctness.** Every pair of published colors distinct above the same-color bar,
> with exactly two exception classes: — *Sanctioned collapses:* surface→background and
> accent→foreground — **exact** equality with the collapse flag set […]

So one text puts 0.07444 on the pair and the other puts the same-colour bar (0.009–0.023) on it.
Neither says how they compose. **The answer exists in two places outside the packet, and they agree**:
`src/contract/invariants.ts`, `validateDistinctness` —

> `const bar = separated ? Math.max(sameColor, foregroundAccentSeparation) : sameColor`

— and ledger row B31: *"The bar is applied as `Math.max(sameColorBar, separation)`, not as a
replacement — a region whose same-colour bar exceeded the separation distance would still bind."*
The elevated band gets its own violation code, `I3.foreground-accent-not-separated`, so the two bands
stay countable apart.

**Cost.** Under the packet alone, an accent 0.03 from its foreground is legal by invariant 3 and
illegal by §3. That is a 0.07444-radius difference in what a prototype may publish — larger than the
entire same-colour bar in every region.

**Who is blocked.** Arm B and arm E, independently. Arm B proceeded "under the stricter reading that
both hold", which is `max` and is correct. Arm E lists it first among three things it could not
reconcile and its design lands in the disputed band routinely (see D2).

**RECOMMENDATION.** Write `Math.max(same-colour bar, FOREGROUND_ACCENT_SEPARATION_DISTANCE)` into §4
invariant 3 as a third clause. **Reasoning:** it is what ships, it is what B31 records, it is what the
one arm that guessed guessed, and it is the only composition that cannot be gamed — two colours a
region already calls identical cannot be two roles whatever the separation number says. This is a
transcription fix, not a decision; the decision it exposes is D2.

---

## N4 — The brief's headline robustness sentence prints two different rulers as one claim — new, and it replaces a claim that inverted

**Bucket: INCONSISTENCY. Side: JUDGED. Rank 2. Status: CHANGED — the item `DIVERGENCE_MAP_2.md` §7
recorded has been inverted by measurement, and what is left is a different and larger defect.**

**What was claimed, and what happened to it.** Round 2's map recorded, loudly, N4 as *"the robustness
harness's dither metric may be unsatisfiable under the exact-pixel rule"* — F′'s argument that a system
obliged to publish an exact pixel of the artwork cannot republish the identical pixel after a dither
has changed every pixel, so a harness scoring hex equality would be scoring an impossibility.
`DITHER_METRIC_QUESTION.md` settled it by reading the code and running a pre-registered check.

**The harness is fine, and the two halves of the claim are closed.** See the closed-items section
below for both: the harness has never scored hex equality, and F′'s universal claim is measurably
overstated. **No change to `src/robustness/` is warranted.**

**What is not fine is the figure.** `PHASE_1_AUTHOR_BRIEF.md` §2, goal 1 — the rewrite's first goal,
the sentence that motivates the whole phase (canonical `:53-54`, packet copy `:60-61`):

> The incumbent is stable per file and collapses across encodings: **72.8% palette agreement on
> re-encode, a ±1-LSB dither moved all 114 test palettes**, an ASCII id relabeling moved 55.85% of the
> corpus.

Both figures come from **one table** in the v2-3 campaign's `EXPERIMENT.md` §6.1 (commit `56506d0`),
n = 114 artworks, which reports **two columns**:

| v2-3 contrast | identical (byte-identity) | agree within ε = 0.04 |
| --- | --- | --- |
| re-encode, JPEG q92 4:4:4, same size | 22 (19.3%) | **83 (72.8%)** |
| **±1 LSB dither, blue channel** | **0 (0%)** | **86 (75.4%)** |

**The brief takes 72.8% from the ε column and 0 from the identity column and prints them as one
claim.** On the same ruler as 72.8%, the dither reads **75.4%** — a number that sits alongside
re-encode rather than screaming past it. The qualitative finding (v2-3 is fragile under a one-bit
dither) survives; the rhetorical force of "moved *all 114*" is substantially a statement about the
**relation**, not about the algorithm.

**The same pairing is reprinted in the instrument's own README**, which is in the author packet
verbatim:

- `src/robustness/README.md:104` — *"The baselines: re-encode **72.8%**, dither **0 of 114**
  unchanged"* — one ε number and one identity number, presented as one row of baselines.
- `src/robustness/README.md:131-134` — *"The toy survives the dither far better than v2-3 did (92% vs
  0 of 114)"* — a **regional-bar** rate against a **byte-identity** count. The comparable v2-3 figure
  is 75.4%, so the honest sentence is "92% against 75.4% on a looser relation": same direction,
  17 points instead of 92.
- `README.md:66-68` already warns that v2-3's ε and the regional bar *"compare in magnitude and
  direction, not decimal places"*. That covers the 72.8%-vs-69.0% comparison honestly. It does **not**
  cover the dither comparison, because that one crosses a category — a distance criterion against an
  identity criterion — rather than a calibration.

**The size of the metric effect, measured on the live instrument.** The committed harness was run
twice on its own frozen 100-cover perturbation set with the dev loop's toy candidate, changing **only**
the bar mode (reports written outside the repository; nothing in `src/` or `data/` modified):

| arm | `regional` (the default, and the only live mode) | `exact-hex` (diagnosis only) |
| --- | --- | --- |
| `jpeg-q92` | 69.0% | 5.0% |
| `jpeg-q85` | 51.0% | 6.0% |
| `jpeg-q75` | 45.0% | 7.0% |
| **`dither-lsb1`** | **92.0%** | **0.0% (0 of 100)** |

The regional column reproduces the README exactly. The exact-hex column reproduces v2-3's *"0 of 114"*
— as 0 of 100 — **on a completely different candidate and a completely different sample.** That is the
demonstration: the alarming figure is the ruler, not the algorithm. Note also that exact-hex carries
almost no signal — the JPEG arms stop decaying with quality (5%, 6%, 7%) because they are pinned at
the floor, where the regional bar decays cleanly (69%, 51%, 45%).

**Cost, and this is why it ranks second.** Three compounding reasons:

1. **It is the headline evidence for goal 1.** Every proposal in this phase argues, in §10 or its
   equivalent, that its paradigm answers the dither failure. Fourteen author-runs reasoned against
   "moved all 114" without being told what "moved" meant.
2. **Robustness pre-registrations are already stated against relations their authors had to guess.**
   Six author-runs have a stake and they do not agree: **A** predicts *"near-total agreement at the
   same-colour bar and materially less at exact hex"* and warns *"if exact-hex agreement is read as
   the headline, this design will look worse than it is"*; **E′** pre-registers absolute numbers **on
   the regional bar** and says *"I cannot promise byte-identical hexes under dither; I promise
   agreement on the contract's bar"*; **F′** says no conforming system can promise hex equality;
   **B′** pre-registers *"more than 10% of palettes move"* **with no relation named**; **E³**
   pre-registers *"jpeg-q92 agreement ≥ 90% and dither agreement ≥ 98%"* **with no relation named**;
   **F³** asks outright for both to be reported, saying *"hex-level agreement across re-encodings will
   show churn from the projection step that the contract's own same-colour rule says is not a colour
   change."* Two of those six are numbers that cannot be scored without asking their author which
   ruler they meant.
3. **The answer was in the packet and went unread.** `phase-1/packet/catalog/src/robustness/README.md`
   carries decision 1 — *"'Same palette' is the contract's regional same-colour bar, per role"* — in
   full, marked "Delivered in full" in the manifest. This is not an information-withholding failure.
   It is a one-line goal statement being far more prominent than a catalog README's numbered-decision
   list, which is a fact about where readers look and will recur in Phase 2 unless the sentence moves.

**RECOMMENDATION, two parts, both cheap, neither mine to make.**

(a) **Correct the two README sentences.** `:104` — say which relation each figure is on and add the
dither arm's ε figure (86 of 114, 75.4%) so a reader can compare like with like. `:131-134` — the
comparable v2-3 number is 75.4%, not 0. **What this invalidates: nothing measured.** Every number the
harness has produced was produced under `regional` and stands exactly as reported. The brief's §2
sentence needs the same treatment, and it is the one that actually reached the authors.

(b) **State the metric once, wherever Phase 2 pre-registrations are collected**: *"the harness scores
every arm as all four role colours within their regional same-colour bar; exact-hex is diagnosis
only."* One sentence. It **rescues** the pre-registrations of A, E′ and F³, which were stated on the
bar and would otherwise be read against a bar those authors explicitly disclaimed. B′'s and E³'s
remain unresolvable without asking them, and should be recorded as such rather than assigned a
relation.

**Two further options exist and are not recommended without a ruling from you** —
reporting exact-hex as a labelled second column (risks being quoted as a gate: it would read 0.0% for
a candidate the live bar scores at 92%), and folding the decision flags into the verdict as F′ asked.
Note the direction of the second: it makes the harness **stricter**, since it adds conjuncts to an
already-conjunctive verdict, so it is not the relief the "unsatisfiable metric" argument was reaching
for. Both are laid out in `DITHER_METRIC_QUESTION.md` §6 with costs.

---

## D3 — Invariant 2 requires a test whose two halves are, respectively, retired and never built

**Bucket: INCONSISTENCY (first half) + DESIGN GAP (second half). Side: EMITS. Rank 3, unchanged.
Status: corroborated again in round 2 by D′.**

**The text authors were given.** `PHASE_0_DECISIONS.md` §4, invariant 2:

> **Source support.** Every published color (roles and stops) is an exact pixel of the input, **meeting
> the population floor and spatial-spread test** (thresholds need provenance; shape settled).

**Half one — the population floor — was retired the same week, and §4 was not updated.** The brief's own
open question 2 says so:

> The rule that used to drop colours for being too rare was tested against the reviewer's own judgments
> and had no discriminating power at any setting, so it was demoted to a reported figure. Nothing has
> replaced it.

And the implementation is blunter (`src/contract/invariants.ts`, invariant 2's docstring):
*"**`I2.population-below-floor` is retired as a violation code.** It is never emitted."* The demotion is
your own ruling, given mid-round in `dropped-colors-1` — *"i stopped reviewing, your color maths is
fucked, everything i've seen belongs"* — quantified by `BELONGS_STUDY.md` (the floor was refusing 340 of
351 palettes whose colours you endorsed) and closed as ledger row **A17** on 2026-08-04. **§4 still
states it as a condition of validity.**

**Half two — the spatial-spread test — has never existed.** It is reported as `deferred` on every
validation (`DEFERRED_SPATIAL_SPREAD = "I2.spatial-spread"`), and ledger row **A4** says the blocker
*"is not code but provenance: a threshold here has to come from measurement or from the reviewer, and
neither has happened"*, adding that whoever picks it up *"will find the job is to create the seam, not
to fill it"*.

**Cost, and it is the largest on this list after D1.** §4 is the normative statement of what a palette
must satisfy. As written it tells every author that published colours pass a rarity-and-spread gate.
Three paradigms have now built on that sentence.

**Who is blocked.**
- **Arm A**, whose *primary* and only substantive request is this test's definition, and whose central
  claim depends on the answer: its design *prices* rarity instead of thresholding it, so this floor
  would be the only rarity rule in its system. Its stated assumption — *"the floor admits colours at
  [the endorsed median] share"* — is correct by accident, because there is no floor at all. It records:
  *"If the floor is in fact tighter than the endorsed median, my 'price, don't threshold' claim is
  partly false."*
- **Arm D** is worse off: its entire repair mechanism is this test. §2.7 — *"one pass counts the pixels
  within the same-colour bar of it and accumulates their positional quantiles — invariant 2's population
  floor and spatial-spread test, directly"* — and a colour that fails causes the algorithm to *step the
  rank*. It lists the test among parameters it *"implements rather than re-decides"*. There is nothing to
  implement.
- **Arm D′ reproduces D's reliance exactly, from a clean start** — *"it is unclear whether an enforced
  population floor exists. This matters directly: it decides whether a rare-but-spatially-corroborated
  pixel is publishable, which is the crux of my corroboration answer. I proceeded on the assumption
  that there is no enforced population floor"* — and adds an argument nobody made in round 1: *"the
  corpus fact in §4 (median endorsed exact-triple area share 8.89e-5) is hard to reconcile with any
  population floor set on exact triples."* That is a second, independent route to the right answer.
- **Arm C** flagged it and routed around it, making belonging structural rather than numeric.

**RECOMMENDATION, two parts.** (a) Amend §4 invariant 2 to state what is true: the existence clause is
hard, the population figure is computed and reported and decides nothing (A17), and the spatial-spread
half is deferred pending provenance (A4). This is transcription. (b) The spread half is a **design gap**
and I do not recommend a threshold — §4 itself forbids inventing one. But a prototype cannot be asked to
satisfy a deferred test, so the ruling worth having now is simply *"deferred means not required in
Phase 2"*, stated rather than inferred.

---

## D2 — The dead band: an accent may be at 0, or above 0.07444, and nothing states the gap is intended

**Bucket: DESIGN GAP. Side: EMITS. Rank 4 — demoted one place, not because it got smaller but because
N4 outranks it on reach.** Following D1, the rule is unambiguous — and nobody has written down that its
consequence is the one that was wanted.

**The mechanism.** A sanctioned accent→foreground collapse must be **exact hex equality with the flag
set** (`PHASE_0_DECISIONS.md` §2: *"must be exact hex equality — a near-match is not a collapse, it is
two colours that look alike"*). Above 0.07444 the accent is a separate role. Between them, nothing is
publishable. That exclusion zone is wider than the entire distinctness bar and no document says its
width was chosen.

**Arm E, verbatim** (`phase-1/proposals/arm-e.md` §closing):

> With the sanctioned collapse at exact equality, that leaves a **dead band**: an accent may sit at
> distance 0 (collapsed) or above 0.07444 (separated), and everything between is unstated. My design
> lands there regularly and currently resolves it by collapsing, which may be wrong.

**What is already known, and it is more than the authors could see.** The band has been adjudicated
once, on a real palette. `endorsement-recheck-1` (2026-08-04, two items) put an endorsed palette in
front of you whose foreground and accent sat at OKLab **0.0504** — squarely inside the band. You
overrode the round in conversation, verbatim, recorded as
`d-2026-08-04-endorsement-recheck-1-resolved-by-chat-two-endorsements-retired`:

> ignore my review of endorsement-recheck, the rule is right in both cases - item 1: foreground and
> accent *are too close* - item 2: accent on surface *is unreadable*

The endorsement was retired rather than the rule demoted. **So the band is intended at 0.0504.** What
has never been decided is where it ends.

**Cost.** Arm E collapses on landing in the band, which converts every marginal accent into no accent
at all — a systematic bias toward collapse in exactly the stratum the campaign says is fragile. Any
prototype must pick a behaviour here and there is no stated one.

**No recommendation on the width.** This is intent, not consistency: 0.07444 is an `[INHERITED]`
number (D5) and the only human reading of the band is one artwork. **What I do recommend** is stating,
in §4, that the band is a refusal region and that landing in it is a signal to collapse or to re-select
— not a licence to publish. Two arms guessed opposite ways; one sentence removes the guess.

---

## N2 — The reviewer's *quoted* accent ruling removes colour distance; §2's own text and invariant 4 both retain it — new

**Bucket: INCONSISTENCY. Side: EMITS. Rank 5. Raised independently by A′, B′ and D′ — the
most-reported *contract* defect of round 2.**

**The two texts, in the same bullet of the same section.** `PHASE_0_DECISIONS.md` §2 quotes you,
2026-08-04:

> the contrast limit between foreground and background/surface/gradient, and between accent and
> background/surface/gradient should be about APCA contrast, **not APCA *and* color distance**. Color
> distance is used between background and surface, or between foreground and accent.

Read plainly, that **removes** the colour-distance dimension from the accent's contrast clause. The
surrounding text of §2 then **retains** it, as a pointwise conjunction running on
`ACCENT_FUNCTIONAL_DISTANCE` (0.14591, `[UNCALIBRATED]`), and §4's invariant 4 does the same. §2
explains that only the *identity* of the distance changed (0.07444 → 0.14591) — but the quoted
sentence says the dimension should not be there at all, not that it should be there with a different
number.

**Why this is not D4, and why D4's fix does not touch it.** D4 concerns invariant 4's *closing
paragraph* — a stale clause pointing the accent floor at "colour distance (already enforced by
distinctness)" — and its recommendation is to strike that clause and point at §2's rewording. **After
that fix, §2 still contains the quoted ruling and still contains the conjunction.** N2 is what is left.

**Cost, and it is measurable in the feasible set.** All three primes designed against the *retained*
mechanism, because that is what the invariants implement, and all three said so and said why. A′ states
the consequence exactly: *"if the plain reading of the ruling is correct, my feasible set is slightly
larger than it should be and nothing else changes."* B′: *"a paradigm leaning on the colour-distance
escape leans on the disputed half."* D′ designed so as to lean on the escape *"as little as the artwork
allows"* — a design distortion caused by an ambiguity rather than by a rule.

**RECOMMENDATION: none — this one is yours, and it is one word.** The quoted sentence is yours and the
retained mechanism is the code's; there is no dated ordering that settles it, because both are in the
same bullet of the same day's rewrite. Either the accent's escape is APCA-only (and
`ACCENT_FUNCTIONAL_DISTANCE` loses its one live consumer, which would moot half of the
`[UNCALIBRATED]`-placeholder concern in the closing section), or the conjunction stands and the quoted
sentence should carry a clause saying the accent's *escape* is the exception to it. Three authors read
it and none could tell.

---

## D4 — Invariant 4 still says the accent floor "may properly live in colour distance"; §2 moved it

**Bucket: INCONSISTENCY. Side: EMITS. Rank 6 — demoted from 4, because N2 is the live half of this
area and D4's cost is latent.** A stale clause in the invariant text, contradicted by a ruling recorded
forty lines earlier in the same document.

**The stale text.** `PHASE_0_DECISIONS.md` §4, invariant 4, closing paragraph:

> Open measurement question for the accent: text readability at equal luminance is luminance-driven, but
> chromatic icons at equal luminance can be visible — the accent floor **may properly live in color
> distance (already enforced by distinctness)** or at a lower luminance epsilon; the bracketing round
> shows flat equal-luminance chromatic accent pairs and the reviewer's eyes decide.

**What contradicts it.** §2's 2026-08-04 rewording, on your own ruling that detection is the wrong
criterion for a contrast escape:

> the accent keeps exactly one escape, running on **`ACCENT_FUNCTIONAL_DISTANCE` (0.14591,
> `[UNCALIBRATED]`)** rather than on the retired `ACCENT_VISIBILITY_COLOR_DISTANCE` (0.07444) it used
> from 2026-08-02 to 2026-08-04.

Three things in the stale clause are now false. The accent's second dimension does **not** live in
"colour distance already enforced by distinctness" — distinctness (invariant 3) judges the accent against
the *foreground* at 0.07444 and against the field only at the same-colour bar, while the floor's escape
runs on 0.14591, a different quantity 6–16× larger. The question is not "open" in the sense the clause
implies — it was ruled on. And *"the bracketing round … and the reviewer's eyes decide"* has since
happened twice (`accent-real-1`, then `perception-4`) and both rounds **refused** to produce the number.

**Cost.** This is the paragraph an author reads to learn where the accent's floor lives, and it names
the wrong mechanism. Nobody built on it — the arms all read §2's rewording instead — so the cost is
latent rather than paid.

**RECOMMENDATION.** Strike the clause and replace it with a pointer to §2's rewording plus a one-line
statement that the escape distance is `ACCENT_FUNCTIONAL_DISTANCE`, `[UNCALIBRATED]`, twice refused.
**Reasoning:** §2 is dated later, carries the verbatim ruling, and matches the code. There is no version
conflict to adjudicate — only a paragraph nobody deleted. **Note:** this fix does not settle N2, and
whichever way N2 goes changes what the replacement sentence should say, so **rule N2 first**.

---

## N5 — Promoting the direction-aware challenger would change the gradient boolean, not merely the checks — promoted

**Bucket: DESIGN GAP. Side: EMITS. Rank 7. Status: CHANGED — the first pass carried arm B's version of
this in the closing "worth your attention anyway" section, at bookkeeping severity. F′ supplies a
second, independent route with a named consequence for a contract field, which makes it an item.**

**What the challenger is, in one sentence.** The same-colour bar is today a **scalar**: one number per
colour region, so "how different are these two colours" ignores *which direction* the difference runs
in. `perception-4` measured that the direction matters a great deal in `dark-neutral` — a pure
*lightness* step must reach 0.02063 to read as different, pure *chroma* only 0.00717 — and a
**direction-aware** rule (an ellipsoid rather than a sphere) now runs **report-only** beside the frozen
scalar on every pair invariant 3 judges (`src/contract/challengers.ts`).

**Arm B's route (carried forward).** B's paradigm uses the bar for *pixel connectivity*, so promoting
the challenger would change its **parse**, not merely its checks. And the challenger's weights were
measured in `dark-neutral` only and are applied in all four regions, which `PERCEPTION_VERDICT.md`
warns against twice.

**F′'s route, and it is the reason for the promotion.** F′ consumes the bar in four places and names
the one that reaches an output field:

> most visibly in the collapse test, where the scalar's permissiveness in lightness means
> **near-identical fields will collapse when the ellipsoid would keep them apart, which changes the
> gradient boolean.**

That chain is worth spelling out because it crosses from checker to product: surface collapses onto
background → both ends of the ramp are the same colour → **a collapsed surface means no gradient**
(the brief states this consequence explicitly) → `gradient: null`. So the choice of bar shape decides,
on some artworks, whether the published object has a gradient at all. F′ reached this **having never
seen `PERCEPTION_VERDICT.md`** — it is in the blind seat and worked from the brief's §3.1 summary.

**The standing deferral this attaches to.** Ledger row **B42**: the confirming round for the
direction-aware bar is **DEFERRED**, neither scheduled nor cancelled, and its trigger is a *counter* —
disagreements between the frozen bar and the challengers accumulating into
`data/contract/challenger-disagreements.json`, to be read before deciding whether the round is worth
your bandwidth. B42 already states that *"invariant 3 consumes `sameColorBar()` as a **scalar**, and a
direction-aware rule has no single bar to return, so either invariant 3 changes shape or the scalar
goes on existing beside it"*, and that this must be decided **before any constant lands enforced**.

**Two things make the trigger unreliable right now, and they are already ledger rows.** **B43**:
nothing calls the ledger on a schedule — the accumulator has no caller except an explicit runner and
the tests, so *"an empty or stale `challenger-disagreements.json` reads as 'the rules agree' to anyone
who does not know nothing wrote it."* **B44**: the tally stores `disagreedByRegion` and no
`judgedByRegion`, so a per-region *rate* — the exact reading B42 says to take, given the
`dark-neutral`-only measurement — is not computable from the ledger alone.

**Cost.** Inert today: the challenger is report-only and F′ built so that swapping in the ellipsoid is
*"a substitution at one call site with no other change"*. The cost is entirely forward-looking, and it
is that a Phase 2 prototype's gradient booleans are conditional on a decision that is currently
deferred behind a counter nobody is running.

**NO RECOMMENDATION on the bar's shape** — B42 is right that it is a decision no measurement supplies.
**What I do recommend recording** is the reclassification: promoting the challenger is a **behaviour
change to a contract output field**, not a checker becoming stricter, and any Phase 2 prototype should
be told that the bar's shape is an open contract question so it does not hard-code the scalar's
lightness permissiveness into its collapse test.

---

## N6 — The brief's tool catalog lists three robustness arms that do not exist — new

**Bucket: INCONSISTENCY. Side: JUDGED. Rank 8. Found while settling N4; not raised by any author,
because no author could have known.**

**The two texts.** `PHASE_1_AUTHOR_BRIEF.md` §5, the tool catalog (packet copy `:308`):

> | **Robustness harness** (`src/robustness/`) | How much a palette moves under changes that should not
> matter: re-encode, quality change, **resize, 1-px crop**, dither, **id relabeling**, and the matched
> real-rendition pairs already on disk. This is success criterion 1 measured directly. | see
> `src/robustness/` | **in flight** |

The harness has **re-encode at three qualities, the ±1-LSB dither, and rendition pairs. Five arms.**
Resize, 1-px crop and id relabeling **do not exist**, and `src/robustness/README.md:169-170` says so
for the one that matters most: relabel invariance — *"the third perturbation gate, which moved 55.85%
of v2-3's corpus"* — **is not built here**.

**The status column says `in flight`, and that decides the fix.** This is a *plan read as an
inventory*, not a false claim. The catalog is honest at the row level and misleading at the sentence
level, because the sentence enumerates arms in the present tense and the status word sits three columns
away. That distinction matters: the fix is to move the roadmap items out of the description (or mark
them "planned" inline), not to build three arms.

**Cost, and it is not hypothetical.** The relabeling failure is quoted as one third of goal 1 in §2
(*"an ASCII id relabeling moved 55.85% of the corpus"*), so authors correctly treat relabel invariance
as a design target — **nine of the fourteen author-runs claim it as a structural property of their
paradigm** (A, C, C′, D, E, E³, F, F′, F³), several in the strong form *"relabel invariance is not
tested for, it is structural"* (E³). **Those claims are currently uncheckable**, and the arm that would
check them is the one the catalog implies exists.

Two sharper consequences:

- **Round-1 arm F budgeted to build it.** *"The real cost is not the algorithm. It is the
  invariance-interval harness … and the **robustness harness** (re-encode, ±1 LSB dither, **relabel**,
  and report perceptual *and* byte agreement separately): ~4 days"* — an author pricing four days of
  build for an instrument the catalog told the other five arms was in flight. (Arm F is blind and had
  no catalog; it converged on the same arm list from the goals sentence.)
- **F³ is the only author to name resize, and it names it as a threat to its own design:** *"my lattice
  subsample assumes geometry is stable across the perturbations robustness is measured under (true for
  re-encode and dither, **false for a resize**)"*. So the phantom row is not inert — believed, it
  changes what a designer thinks they must survive.

**RECOMMENDATION.** Correct the row to the five arms that exist, and say separately which of resize /
crop / relabel are planned and which are not. **Then decide whether relabel invariance gets built**,
because nine of fourteen proposals make a claim only that arm can falsify, and the alternative is
accepting those claims on their architecture. That second half is a decision, not a transcription —
which is why this is ranked with the judging-side items rather than with D9.

---

## D5 — 0.07444 has been excluded from measurement by the construction of every round that could have measured it

**Bucket: DESIGN GAP. Side: EMITS. Rank 9 — demoted from 5, because nothing is blocked on it and four
newer items are.** Verified in substance; the strong form of the claim ("could never move") is too
strong and the correction matters.

**What is verified.** `src/contract/PERCEPTION_VERDICT.md`, in the round's own table of refusals:

> | **Anything about the foreground↔accent bar (B31)** | Not asked. Every accent was held ≥ 0.07444 from
> its foreground precisely so it could not be. |

And the pre-registration says why (`data/calibration/perception-round-4-preregistration.md` §3.3): the
isoluminant ladder imports `accent-real-1`'s solver unchanged, including *"its foreground-separation
floor (0.07444, so no item can be answered 'no' because the accent became a second foreground — that is
B31, and B31 is not in this round)"*. **So the constant is a construction constraint on the stimuli of
the rounds that measure everything adjacent to it.** Any future round reusing that solver inherits the
exclusion automatically.

**What is not verified — and this is the correction.** It does not follow that no round could move it.
Ledger row **B31** names exactly the round that would: a third stimulus type, *"a foreground and an
accent side by side"*, which has never been shown to anyone. The exclusion is a scope decision, disclosed
in advance each time, not a seal. And the constant has had one adverse adjudication in its favour: the
0.0504 pair of D2, which you ruled *"too close"*.

**Cost.** The number is `[INHERITED]` — measured for *"are the icons clearly visible on this
background?"*, an accent sitting on a field, and applied to a pair nobody has ever been asked about. It
now sets the width of D2's exclusion band and has already retired one of your own endorsements. It is a
detection-class number doing a detection-class job, which B31 correctly calls better collateral than the
loan it replaced — but it is one geometric midpoint of a completely-separated 0.06300–0.08796 band,
fitted on ten points.

**Who is blocked.** Nobody, directly — no arm's design turns on the digits, in fourteen runs. This is a
standing debt against the contract, not a Phase 1 blocker.

**NO RECOMMENDATION.** Whether to spend a review round on B31 is an allocation of your bandwidth, which
is the campaign's binding constraint, and B31 already notes the saving: it is the same protocol as A16's
functional-distance round on a different stimulus, so running them together is most of the cost. That
trade is yours. What I will say is that D2's band width cannot be settled without it, so the two
questions are one question.

---

## D6 — The white/black escape reads as unsatisfiable; it is satisfiable, and the resolving text is in code

**Bucket: INCONSISTENCY (ambiguity). Side: EMITS. Rank 10 — demoted from 6. Status: corroborated again
by C′, with the same reading and the same declared dependence.** Checked: the escape works. The wording
does not say so, and every arm that used it had to guess.

**The text.** `PHASE_0_DECISIONS.md` §2:

> a palette may introduce **exactly one** color not present in the artwork — pure white (`#ffffff`) or
> pure black (`#000000`) **only**, used as **background or foreground only** (with surface or accent
> collapsed correspondingly), **only when there is genuinely no other way to produce a 2-color palette.**

**The apparent contradiction.** A sanctioned collapse is exact hex equality. So if the escape colour is
published at `foreground` and `accent` is collapsed onto it, `accent` publishes that same non-source
colour — and invariant 2 ("every published colour is an exact pixel of the input") sees two published
slots holding a colour the artwork does not contain.

**The resolution, from `src/contract/invariants.ts`.** `sanctionedEscape()` requires the partner role to
publish the escape colour — it checks `partnerHex === escape.color` and returns
`paths: new Set(["roles.<role>", "roles.<partner>"])`, exempting **both** slots. So "exactly one" counts
**colours**, not published slots: one invented colour, appearing in two roles because the collapse says
they are one role. The escape is usable.

**Cost.** Low in outcome, universal in incidence: arms B, C, D, E, F and C′ all reached for the escape
and all six silently assumed the correct reading. Arm C stated the risk first
(`phase-1/proposals/arm-c.md`, closing): *"I read that as one colour in two roles rather than two
invented colours; my floor member depends on the reading, and if it is wrong the escape is unusable as
written and the floor member has no last resort on a genuinely one-colour image."* C′ reached the same
place independently and put the argument the other way round — *"I assumed a collapse counts as one
introduced colour, since the alternative makes the sanctioned combination self-contradictory"* — which
is the stronger form: the rival reading makes a clause you wrote inoperative.

**RECOMMENDATION.** Add six words to §2 and to §4 invariant 2: the exemption covers the escape role
**and its collapsed partner**, because a collapse means they are one colour. **Reasoning:** this is not a
choice between readings — C′'s argument is decisive and the code already implements the operative one.

---

## D9 — The tool catalog labels `src/contract/` "built" against a definition it does not satisfy

**Bucket: INCONSISTENCY. Side: PACKET → EMITS. Rank 11 — held roughly where it was (was 9). Status:
now also carried as ledger row B45, added 2026-08-04, still open.** It is the mechanical cause of D3
blocking arm A, and of D1's answer being unreachable.

**The two texts**, both `PHASE_1_AUTHOR_BRIEF.md` §5:

> **Built** means the instrument has a README of its own, **which is the authority on what it currently
> does**; this brief does not restate status for code another workstream owns.

> | **Contract invariants** (`src/contract/`) | […] | `import` from `src/contract/`;
> `tests/contract-*.test.ts` | built |

Every other "built" row names its README (`src/adjudication/README.md`, `src/honesty/README.md`,
`src/review-server/README.md`). `src/contract/` has none — re-verified this pass, the directory holds
`BELONGS_STUDY.md`, `PERCEPTION_MODEL_STUDY.md`, `PERCEPTION_VERDICT.md` and no README. The packet
manifest records this honestly under `catalogEntriesWithNoDoc`, and records the same for
`src/warehouse/`.

**What B45 adds to the first pass's version.** The error is not a broken link — *"the authority is
asserted by a **label**, and an author who follows the label finds nothing. Two of the ten catalog rows
are in this state."* And the packet's substitution (`PERCEPTION_VERDICT.md` in place of the contract
row, nothing at all for warehouse) is sensible **and undocumented in the brief**, so *"an author
reading the catalog and an author reading the packet see two different authorities."* B45 also carries
a timing rule worth having in front of you before any fix: *"an amendment after an author has launched
is not the same act as one before, and only the second kind is free."*

**Cost.** The brief promises that the authority on the contract module's current behaviour is a document,
declines to restate that behaviour on the strength of that promise, and the document does not exist. Both
D3 and D1 have answers living only in `invariants.ts`, which no author could read. Arm A's request names
the mechanism precisely: *"neither is in my packet and the catalog's `src/contract/` row names no
README."*

**RECOMMENDATION.** Either write `src/contract/README.md` — the retired population floor, the deferred
spread test, the elevated foreground↔accent cell, the escape's two-slot exemption; every answer in this
packet lives there — or drop the "built means it has a README" promise. **Reasoning:** the first is
cheap and repays itself immediately; **five of the seventeen items here would not have been findable as
defects if it existed**, because the authors would have had the resolving text.

---

## N1 — The delivered `PHASE_0_DECISIONS.md` extract advertises material the packet trim removed — new, and mine

**Bucket: INCONSISTENCY (packet construction). Side: PACKET → EMITS. Rank 12. Raised by E′; the
error is the orchestrator's, i.e. mine, and is recorded as such.**

**The text, verified at `phase-1/packet/PHASE_0_DECISIONS.md` line 27 — inside the delivered §§1–6,
on the document's first screen:**

> **Scope:** input policy · output contract · metrics · corpus/legacy data · oracle label semantics ·
> **measured resolution floors**. Referenced from `V3_PLAN.md` §6.

**§7, which carried the floors, was trimmed out of the packet. So the delivered document promises
material it does not contain, in its own table of contents.** E′ verbatim: *"`PHASE_0_DECISIONS.md`'s
own scope line lists 'measured resolution floors' among the document's contents; the delivered §§1–6
state none."*

**Cost, and it is why this is not a footnote.** This is the **third independent route** by which the
resolution material has been reported missing — A, B and D asked for it in round 1; A′, E′ and E³
asked again in rounds 2 and 3 — and it is worse than a gap, because **it tells an author the answer is
inside a document they have been given**, so the author spends effort looking rather than declaring an
assumption. `CONFINEMENT_AUDIT_2.md` traces three of round 2/3's stub requests to this one line and
disposes of it as a leak (it is a topic name in a kept file, not a finding) while naming it as the
visible cause.

**One consequence for the audit trail, which is why the line is worth striking rather than tolerating.**
A′ **misattributed** it: it wrote *"the manifest records that resolution floors were among the material
stripped from the inventory"*, where the de-leaked manifest says only `"removed": "§7, §7.1 and §8:
source lines 604 to 807."` A′ inferred the *content* of a withheld section from a line range plus the
Scope line. That is a false trail — a future search for manifest-sourced influence would flag that
sentence and be wrong about where it came from.

**RECOMMENDATION.** One line, either way: strike the clause from the *extract's* Scope line (the
canonical document's is correct, because the canonical document does contain §7), or add "measured
resolution floors" to the provenance header's list of withheld sections. **Reasoning:** the second is
better — it converts a false promise into a disclosed absence, which is what the header is for, and it
leaves the extract diffable against the canonical text.

---

## N7 — "The ramp's ends *are* the field roles" and "every published colour is an exact pixel" interact, and nothing orders them — new

**Bucket: DESIGN GAP. Side: EMITS. Rank 13. Raised by F³, the round-3 blind arm.**

**The two rules, both from the brief's §3.1 constraint sheet, both quoting you verbatim.**

> when the field is a gradient, the first stop is the `background` and the last stop is the `surface`.

on which the brief comments: *"So the ramp's two ends **are** the two field roles — exactly, not
approximately — and a fitter does not get to choose them independently."* Enforced as
`I1.first-stop-not-background` and `I1.last-stop-not-surface`.

And invariant 2: **every published colour is an exact pixel of the input.**

**Why they interact.** A design that fits a continuous ramp to the artwork gets *fitted* endpoints,
which are real-valued and will not in general be pixels of the image. Two operations must therefore
happen — **project** the endpoints onto exact pixels, and **test** whether the ramp is a good enough
description of the field to publish a gradient at all — and **nothing in any document says which comes
first.**

**F³, verbatim, naming its own resolution and what turns on it:**

> the constraint sheet says the ends of a gradient *are* the field roles exactly, and also that every
> published colour is an exact pixel — these interact, and the resolution I adopted is that **the
> fitted endpoints must be projected onto exact pixels *before* the excursion test runs**, since the
> rendered ramp interpolates published colours. **If the intended order is the reverse, §2.4 changes.**

§2.4 is F³'s stop section — what justifies a third stop, and where it goes.

**Cost.** Both orders are defensible and they disagree on real artworks. Projecting first is the
honest one — the player interpolates between *published* colours, so the excursion that matters is the
one from the published ramp, not the fitted one — and it makes the test strictly harder to pass, since
projection adds error the excursion must then absorb. Testing first measures the model rather than the
emission, and will publish gradients whose realised ramps drift further from the field than the test
allowed. **This decides stop values and stop counts, not just internal bookkeeping**, on any paradigm
that fits a continuous field rather than clustering one out of a histogram — which is most of the
round-2 and round-3 inventory.

**RECOMMENDATION.** State the order in §2 alongside the first-stop/last-stop rule: **project, then
test.** **Reasoning:** the contract's subject is the published object, every other invariant is stated
on published colours, and it is the conservative direction — a design cannot buy a gradient by
measuring something it will not emit. But this is a design gap rather than a transcription, so it is
your call and not a recording; the recommendation is the direction I would defend, not a fact I
verified.

---

## D10 — The brief's problem shape implies a flat field still emits stops

**Bucket: INCONSISTENCY. Side: EMITS. Rank 14 — held (was 10). Brief only. Found by the blind arm, and
it is the one gap that actually bit it.**

**The two texts.** `PHASE_1_AUTHOR_BRIEF.md` §3, the fixed problem shape:

> **four roles** (background, surface, foreground, accent) plus a **gradient boolean** and **stops**

`PHASE_0_DECISIONS.md` §2, the schema:

> `gradient: null | {stops: [2..4]}`

A flat field publishes `gradient: null` and emits **no stops at all**. The brief's phrasing reads as
"stops are always present", and stops-when-flat is unanswerable from §2 and §3 of the brief alone —
which is exactly the blind arm's packet.

**Who is blocked.** Arm F, and it says so (`phase-1/proposals/arm-f.md` §9): *"**Stops when the gradient
boolean is false.** Unknown schema. I assumed a single stop equal to the background […] This is the one
gap that actually bit: if stops must always number at least two, my flat-field emission is wrong in form
though not in content."* Its answer is wrong; the contract emits `null`.

**The round-2 descendant, same family, smaller.** F′ asks the adjacent serialisation question — *"are
stops role colours plus interior vertices, or a full list including the ends?"* — and assumes the full
list, correctly, *"since that is what the ruling's wording most directly supports"*; it says nothing in
its design turns on it beyond emission format. The D10 fix covers it. (The round-3 blind arm F³ had the
first-stop/last-stop quote in its constraint sheet, which is why its version of this question became
N7 — an ordering question — rather than a schema one. That is the briefing improvement working.)

**Cost.** Confined to the blind arms, by construction — every other arm had §2. But the blind arm is the
control on the whole briefing design, and a control that fails on a schema question tells you less about
anchoring than it should.

**RECOMMENDATION.** Add four words to §3: *"…plus a gradient boolean and, when it is true, stops."*
**Reasoning:** the contract is unambiguous; only the brief's summary is not, and the fix costs nothing.
Arm F's related assumption — that a distinct non-gradient `surface` (a panel, a frame, a split field) is
legitimate — is **correct** under §2, which puts roles and gradient in separate fields; that one needs no
change beyond the same sentence.

---

## N8 — The metric ruling names two pairs for colour distance; a named constant exists for one of them — new

**Bucket: INCONSISTENCY (a symmetry the constants do not have). Side: EMITS. Rank 15. Raised by E³.**

**The text.** The 2026-08-04 metric ruling, quoted in `PHASE_0_DECISIONS.md` §2 and reaching every
author through the brief:

> Color distance is used **between background and surface, or between foreground and accent.**

Two pairs, one sentence, parallel construction. **A named constant exists only for the second.**
Verified in `src/contract/constants.ts`: `FOREGROUND_ACCENT_SEPARATION_DISTANCE` at `:407` (aliased to
`ACCENT_VISIBILITY_COLOR_DISTANCE`, 0.07444, `:369`). There is no `BACKGROUND_SURFACE_*` distance
anywhere; the only thing governing that pair is `SAME_COLOR_BAR_BY_REGION` at `:153`, which governs
**every** published pair via invariant 3.

**E³, verbatim:** *"a named constant exists for the second pair but not the first; I proceeded on the
assumption that background↔surface uses the same-colour bar itself, which is also what invariant 3
already requires of every published pair."*

**Cost, and it is small but it is real.** E³'s assumption is almost certainly right, and it is what the
code does. The defect is that **the ruling's parallel construction implies the two pairs are governed
alike, and they are not**: one has an elevated bar 3–8× the same-colour bar, the other has nothing
beyond the floor every pair already gets. An author who read the symmetry literally would look for a
background↔surface separation constant, not find one, and either invent a number or conclude the
packet was incomplete — the D9/N1 failure mode in a smaller frame. Note also the interaction: **if the
background↔surface pair had an elevated bar, it would create a second dead band** with exactly D2's
shape, since surface→background is the other sanctioned exact-equality collapse.

**RECOMMENDATION.** One clause in §3, where the metric ruling is transcribed: say that the
background↔surface pair is governed by the same-colour bar (invariant 3's ordinary floor) and the
foreground↔accent pair by `Math.max(same-colour bar, FOREGROUND_ACCENT_SEPARATION_DISTANCE)` — which
is D1's fix, so the two are one edit. **Reasoning:** it is what ships, and stating both halves in one
sentence removes the false symmetry rather than leaving the reader to infer it from an absence.

---

## D8 — The brief's cost bracket quotes the warm SAM number where it means the cold one

**Bucket: INCONSISTENCY. Side: JUDGED. Rank 16 — demoted from 8, on the strength of thirteen authors
getting it right. Status: it is now the most-reported defect of the phase, and the least costly.**

**The two texts**, both `PHASE_1_AUTHOR_BRIEF.md` §3.1:

> **(3) is the number to quote: ~6.2 s per cold call**, because runtime is cold and the model load is
> paid every time

> **The exceptional end.** SAM measures at roughly **2.7–4.3 s per image**, and the reviewer ruled that
> this **counts as slow** […]

**`PHASE_0_DECISIONS.md` §6.1 reconciles them and names the winner:** *"The 2.7–4.3 s band the ruling was
given on is the **warm** inference cost […] Under the cold frame stated below there is no resident process
to hide behind, so the model load is paid on every call: **≈ 6.2 s per cold call** […] **A proposal that
wants runtime masking quotes 6.2 s.**"* The second bullet is the one that sets the exceptional end of the
bracket every author sizes their cost against, and it quotes the number §6.1 says is *not* the row to
quote.

**Cost: none realised, in fourteen runs.** Raised explicitly by **A′, B′, C′, D′, E′, E³ and F³** —
seven of the eight newer proposals, everything except the round-2 blind arm — and all six round-1 arms
cited 6.2 s. Round-1 arm F, which never saw §6.1, cited both correctly: *"SAM at ~2.7–4.3 s warm, ~6.2
s cold"*. **Thirteen of fourteen author-runs priced against the cold figure**, several saying in as
many words that they read the bracket as anchored at 6.2 s despite what it says. A′ names the residual
risk precisely: *"It does not affect me — I am at the other end — but a proposal landing near that
boundary would not know which figure it was being measured against."* No proposal landed there; all
fourteen are orders of magnitude below either number.

**RECOMMENDATION.** Change the exceptional-end bullet to ~6.2 s cold, keeping 2.7–4.3 s as parenthetical
warm context. **Reasoning:** §6.1 is explicit about which figure a proposal quotes, and the correction
moves the bar the *stricter* way, so it cannot advantage anything already written. **Its real value is
now diagnostic**: seven of eight authors spent a paragraph of a scarce proposal on it, which is a
measure of how much attention a visible inconsistency costs even when nobody is misled by it.

---

## D7 — The brief's anisotropy advice and its own numbers use opposite framings in one paragraph

**Bucket: INCONSISTENCY (wording). Side: EMITS. Rank 17 — demoted from 7; nobody in fourteen runs was
misdirected.** Checked carefully: **the numbers are right and the advice is right.** They are stated in
frames that are exact opposites, one sentence apart, and two readers took it as a contradiction.

**The two sentences**, both `PHASE_1_AUTHOR_BRIEF.md` §3.1, open question 3:

> The contract's committed `dark-neutral` bar of 0.00932 sits *between* those thresholds: **too loose for
> chroma**, less than half of what lightness needs.

> Treat "these two colours are the same" as a rule that is currently **conservative in the chroma
> direction** and permissive in the lightness direction […]

**Which way round it actually is.** The measured thresholds (perception-4 arm B, in `dark-neutral` only,
Holm-clean): a pure **lightness** step must reach **0.02063** to read as a different colour, pure
**chroma** only **0.00717**, pure **hue** **0.00759**. The enforced bar is **0.00932**. So:

- **Chroma.** The bar (0.00932) is **1.30× larger** than perception needs (0.00717). Two colours 0.008
  apart in pure chroma look different to you and the contract calls them the same → invariant 3 condemns
  a pair you would accept. The bar is a **loose tolerance** and therefore a **strict gate**.
- **Lightness.** The bar is **0.45× of** what perception needs (0.02063). Two colours 0.015 apart in pure
  lightness look the same to you and the contract calls them distinct → invariant 3 passes a palette you
  would read as publishing one colour twice. A **tight tolerance**, a **permissive gate**.

Both sentences are true. "Too loose for chroma" describes the *tolerance*; "conservative in the chroma
direction" describes the *gate*. Arm F reached the same reconciliation independently
(`phase-1/proposals/arm-f.md` §9): *"They reconcile only if 'conservative/permissive' is read as being
about **declaring a difference** rather than about declaring sameness."*

**Cost.** The design advice is correct as intended, so nobody was misdirected — arm F says *"I designed
against the numbers, which are unambiguous"*. But an author who took the other frame would have added
margin in exactly the wrong direction. **This is the paragraph N5 depends on**: it is where the blind
arms learn the bar's anisotropy, and F′ built its collapse test against these numbers.

**RECOMMENDATION.** Keep the advice; disambiguate the frame in the sentence itself — *"the rule demands
more chroma separation than you need, and less lightness separation than you need"*. **Reasoning:** this
is a wording repair with a known right answer, and the plain-language form has no frame to get wrong.

---

## Checked, and not a defect

**Closed this pass — the harness does not score the dither arm by hex equality, and never has.**
`DITHER_METRIC_QUESTION.md` §3 settles the conditional F′'s argument rested on, by reading the code.
`check.ts:482` resolves comparison options **once per run** and hands the same object to every trial;
`runTrial` is arm-agnostic and **there is no per-arm branch anywhere in the comparison path**. The
default is `barMode: "regional"` (`src/robustness/compare.ts:35-38`), marked `[REVIEWED]` with your own
wording — *"same-palette = every role within its regional same-colour bar"* — and the per-role test is
`same: distance < bar` where `bar` comes from the contract's own `sameColorBar()`, imported rather than
reimplemented (`compare.ts:58-60`). `exact-hex` exists as one of four bar modes and its own docstring
says *"Present for one purpose only: reproducing hit counts computed before the bar landed. **Never a
live mode.**"* Reaching it requires a CLI flag the README labels *"diagnosis only"*, and every report
records the mode it ran under. **No change to `src/robustness/` is warranted by this.** What survives
the closure is N4, which is about two sentences in a README and one in the brief.

**Closed this pass — "no conforming system can republish an identical triple" is overstated.** F′'s
in-principle claim was checked against a pre-registration written and committed *before* the run (all
100 covers of the harness's own frozen perturbation set). Verdict against the pre-registered bands:
**true for a class.** The dither is genuinely destructive of exact colours as a population — on a
typical artwork ~86% of distinct triples cease to exist and ~73% of pixels no longer wear a surviving
colour — but the **modal triple survives on 55 of 100 covers**, every cover retains some triples, and
the covers where nothing survives are the low-colour-diversity ones (the two worst have 280 and 256
distinct triples). **And it does not bind the instrument**, which was pre-registered as a separate
question: when a triple is lost, the forced move to the nearest guaranteed-present neighbour has a
pixel-weighted p99 of **0.008527 on the worst cover** against a smallest regional bar of **0.00932** —
**0 of 100 covers reach the bar**, and the pixel mass whose forced move reaches its own pair's bar is
**0.000476%**. A sweep of all 16,711,680 adjacent-blue pairs in the 8-bit cube finds **27** whose step
reaches their bar, all with every channel ≤ 10. **A ±1-LSB dither cannot force an exact-pixel-conforming
system across the same-colour bar**, so the standing rule that an instrument blocking good work is the
thing that gives way is **not triggered**. One caveat, pre-registered so it could not be blurred
afterwards: this measures the *availability of colours*, not the *behaviour of algorithms*. A design can
still fail the dither arm by flipping a tie or crossing a cluster boundary — what is established is that
when it does, **it cannot blame the exact-pixel rule.**

**The stop count is not ambiguous.** The 2026-08-04 ruling (*"A gradient can have 2 or 3 stops (4 is
negociable if proven utility)"*) and `MAX_GRADIENT_STOPS = 4` are reconciled explicitly in the bullet
that carries both, `PHASE_0_DECISIONS.md` §2: *"the 4th stop is **negotiable on proven utility** rather
than granted, so reaching for it owes evidence that three could not do the job. `MAX_GRADIENT_STOPS` is
unchanged at 4."* All twelve arms of rounds 1 and 2 read it that way and **all twelve decline to emit a
fourth stop**; four publish the residual excursion that a negotiation for one would need — the E arms
and the F arms, and nobody else. **One residual, and it is small:** invariant 1
admits stops 2–4 with no test of utility, so nothing distinguishes a justified fourth stop from an
unjustified one at validation time. That is a named condition with no instrument, in the same family as
D3, but no prototype currently wants it. The separate question — whether a false gradient boolean emits
one stop — is answered by §2 (`gradient: null`, no stops) and is carried above as D10.

**`PHASE_0_DECISIONS.md` §6's "See §8" is not dangling.** In the canonical document §8 exists and carries
the bulk-model bullet the pointer promises. It dangles only in the *packet extract*, where §§7–8 were
deliberately withheld — and the packet manifest declares exactly that under `danglingCrossReference`,
naming the line and stating where a reader who follows it lands. Arm D checked and reached the same
conclusion: *"the manifest flags it as a known dangling reference, so it is disclosed rather than
contradictory."* No ruling needed. **Contrast N1**, which is the same document's Scope line advertising
material with no such disclosure — the difference between the two is exactly the manifest entry, which
is why N1's fix is to add one.

---

## Packet integrity — about the experiment, not the product

Neither of these changes what a prototype may emit or how it will be scored. Both are about whether
this phase's own record can be trusted, and they are kept out of the ranked table for that reason.

**N3 — the de-leaked manifest mis-describes what the packet carries. Raised by B′.** *"`MANIFEST.json`
lists `ground_type` among the questions carried 'by id only';
`catalog/ORACLE_QUESTION_INVENTORY.md` §A.1 carries its full vocabulary, per-value definitions and
criterion text. The claim holds for §A.2's derived form, not for the file."*

**Why it is worth your attention despite being low-cost.** It is an accuracy defect **in the rebuilt,
re-verified manifest** — the artifact whose whole purpose is to state what an author received. The
manifest carries a `selfCheck` block asserting *"String-match of this file against every disclosure
marker enumerated in the Phase 1 confinement audit … Zero matches required"*, and
`CONFINEMENT_AUDIT_2.md` re-ran it independently: **zero matches, on all eighteen of round 1's
markers, against every round-2 and round-3 transcript and proposal.** The de-leak held. What N3 shows
is the **shape of that verification's coverage**: it checked for disclosure markers and did **not**
check the manifest's own claims about what it carries. Those are different properties and only the
first was tested. **Fix:** correct the row, and add "does the manifest describe its own contents
correctly" to whatever check runs before the next packet ships.

**N9 — the blind packet's manifest was de-leaked after round 1, so the file arm F actually read
survives only in a transcript. Found by `CONFINEMENT_AUDIT_2.md`; nobody raised it.**

Round 1's arm F knew it was the blind control from two sources: its packet path `packet-blind/`, and a
manifest note reading *"arm F is the control on the brief, so a control that is mostly one campaign
artifact measures that artifact."* Both were fixed — `packet-two/` renames the path, and the note is
absent from both `packet-two/MANIFEST.json` and the **current** `packet-blind/MANIFEST.json`. The fix
worked: F′ and F³ received no statement about the experiment's design at all, and neither transcript
contains "control on the brief", "packet-blind", "round 1" or "arm F". **They are cleaner units than F
was.**

**The consequence for the record.** The current `packet-blind/MANIFEST.json` is **1,860 bytes**; the
file round-1 F read was **1,771 bytes**. They are not the same file. **Round 1's finding about it is
recoverable from F's transcript and not from disk** — so anyone re-checking that finding by opening the
repository will find a file that does not contain the defect and may conclude the finding was wrong.
**Fix:** either keep the round-1 blind manifest under a versioned path, or record in
`COMMISSIONING.md` that `packet-blind/MANIFEST.json` was amended between rounds and name the
transcript as the authority for its round-1 state. This is the general hazard of fixing a packet
in place while the finding that motivated the fix is still being cited.

---

## Raised by an author, disclosed in the packet, and worth your attention anyway

Not a document defect. A live design consequence the arms surfaced. *(The direction-aware challenger
entry that stood here in the first pass has been promoted to N5 and is no longer in this section.)*

**`ACCENT_FUNCTIONAL_DISTANCE` is an uncalibrated placeholder enforced inside a hard gate.** 0.14591,
`[UNCALIBRATED]`, refused adoption twice (`accent-real-1`, then `perception-4`, both for the same
pre-registered reason — the quantity is `stratum-dependent` and one hue third identifies no threshold
anywhere), and it nonetheless decides whether an accent gets its one escape from the contrast floor. The
packet discloses all of this. Arm E's response is a stated intent
(`phase-1/proposals/arm-e.md`, closing): *"I expect to trip it on exactly the accents the H↑ lane exists
to find, and intend to invoke the standing demotion rule rather than tune around it."* That is the
standing rule working as designed — an invariant that blocks an endorsed palette is demoted — and it is
a prediction you may want on the record before Phase 2 rather than after. **Note the interaction with
N2:** if the quoted ruling stands and the accent's escape becomes APCA-only, this constant loses its
only live consumer and the concern evaporates. If the conjunction stands, it does not.

---

## What each arm did about what it found

Cheapness of a resolution is best read off what an author already built around it. Fourteen
author-runs; blind arms marked.

| arm | round | defects it hit | what it did | what that says |
|---|---|---|---|---|
| A | 1 | D3, D9, N4 | Asked for the test; assumed the floor admits colours at the endorsed median share; warned that exact-hex robustness would misprice it | The assumption is right by accident. Cheap: the answer is "there is no floor". |
| B | 1 | D1 | Assumed both bars hold (= `max`) | Guessed the shipping rule. Cheap: confirm it. |
| C | 1 | D3, D6 | Made belonging structural rather than numeric; floor member depends on the escape reading | D3 costs it nothing; D6 costs it its last resort if the reading is wrong. Cheap: confirm. |
| D | 1 | D3 | Built the verify-and-step repair loop *on* the test | Expensive: the loop has no predicate. Needs D3's ruling before prototyping. |
| E | 1 | D1, D2 | Collapses the accent whenever it lands in the band | Expensive if wrong — it biases the whole design toward collapse in the fragile stratum. |
| F *(blind)* | 1 | D7, D10, N6 | Designed against the numbers, not the wording; assumed one stop for a flat field; budgeted 4 days to build a robustness harness including a relabel arm | D7 costs nothing; D10 is a form error it would have to unwind; N6 is an author pricing an instrument the catalog says exists. |
| A′ | 2 | N1, N2, D8 | Designed against the retained conjunction; priced at 6.2 s | N2 costs it a slightly-too-large feasible set, by its own statement. Cheap: one word. |
| B′ | 2 | N2, N3, D8 | Designed against the conjunction; pre-registered *"more than 10% move"* with no relation named | Its robustness pre-registration is currently unscoreable — the clearest cost of N4. |
| C′ | 2 | D6, D8 | Argued the escape reading from the other side: the rival reading makes the clause self-contradictory | Makes D6 a transcription rather than a choice. |
| D′ | 2 | D3, N2, D8 | Proceeded assuming no enforced floor; added the 8.89e-5 corpus argument | Reproduces D's exposure from a clean start, and supplies the argument for D3's ruling. |
| E′ | 2 | N1, D8, N4 | Asked for the resolution floors by name; pre-registered robustness **on the regional bar**, explicitly disclaiming hex | N4(b) rescues its pre-registration; N1 is why it had to ask. |
| F′ *(blind)* | 2 | N4, N5, D10-family | Argued the dither metric was unsatisfiable; named the collapse-test/gradient-boolean consequence of the bar's shape | The metric claim is closed against it; the N5 finding is its most valuable contribution and it made it blind. |
| E³ | 3 | N1, N8, D8 | Assumed background↔surface uses the same-colour bar; pre-registered dither ≥ 98% with no relation named | N8 is cheap; its pre-registration has B′'s problem. |
| F³ *(blind)* | 3 | N7, N6, D8, N4 | Projected endpoints onto exact pixels *before* the excursion test, and flagged that the reverse order changes its stop section; named resize as a threat to its lattice; asked for both metrics to be reported | N7 is a real fork with different outputs. Its metric request is Option 3 of the dither investigation, arrived at independently. |

---

## What changed since the first pass

For someone who read the ten-item version and wants the diff.

**Seven items added.** N1, N2, N5 (promoted from a closing-section note), N6, N7, N8 in the ranked
table; N3 and N9 in the new packet-integrity section. N1–N5 keep the identifiers
`DIVERGENCE_MAP_2.md` §7 assigned; N6–N9 are new here.

**One item inverted.** **N4** was recorded in round 2 as *"the harness's dither metric may be
unsatisfiable"* — a suspected instrument defect. It is not. The harness scores the regional same-colour
bar on every arm and always has, and `exact-hex` is documented as never a live mode. **What replaced it
is bigger:** the brief's §2 goal-1 sentence and `src/robustness/README.md:104, :131-134` each print an
ε-distance figure (72.8%) beside a byte-identity figure (0 of 114) as if they were one measurement. On
the same ruler, the dither reads 75.4%. Live on the current harness, the dither arm reads 92.0%
regional against 0.0% exact-hex — the alarming number is the ruler, not the algorithm. N4 enters at
rank 2 as a **judging-side** defect of two documents, with no change warranted to the instrument.

**One claim closed by measurement.** F′'s *"no conforming system can republish an identical triple"*
was checked against a pre-registration: **true for a class, overstated as stated**, and — separately
pre-registered — **it does not bind the harness** (worst cover's forced-move p99 0.008527 against a
smallest bar of 0.00932; 0 of 100 covers reach the bar).

**A new axis.** Every item now carries **EMITS / JUDGED / PACKET** — whether resolving it changes what
a prototype may publish, how it will be scored, or what an author could find out. The first pass ranked
on emission alone, which had no place to put N4 or N6.

**A new section.** Packet-integrity items (N3, N9) are separated from contract defects, because they
are about the experiment's record rather than the product.

**Rank movements, and why.**

| item | was | now | why |
|---|---|---|---|
| N4 | — | **2** | Fourteen author-runs reasoned against the figure; ≥ 6 have robustness pre-registrations at stake, two of them unscoreable as written; it is goal 1's headline evidence. |
| D2 | 2 | 4 | Unchanged in substance; displaced by N4 and by D3's fresh corroboration. |
| D4 | 4 | 6 | Its fix leaves N2 standing, so N2 is now the live half of the accent-distance question and outranks it. |
| N5 | closing section | **7** | F′ showed the challenger's promotion moves the **gradient boolean**, not just the checks — a contract output field, not bookkeeping. Cross-referenced to ledger rows B42 (deferral), B43 (nothing runs the counter), B44 (the per-region rate is not computable). |
| N6 | — | **8** | Nine of fourteen author-runs claim relabel invariance structurally, and the arm that would check it does not exist. |
| D5 | 5 | 9 | Nothing is blocked on it in fourteen runs; four newer items are. |
| D6 | 6 | 10 | C′'s independent argument makes it a transcription rather than a choice, which lowers the cost of leaving it. |
| D9 | 9 | 11 | Substantively unchanged; now also ledger row **B45**, which adds the timing rule (*an amendment after an author has launched is not the same act as one before*). |
| D8 | 8 | 16 | Now the most-reported defect of the phase — 7 of the 8 newer proposals — and the least costly: **13 of 14 author-runs priced against the correct figure anyway.** Its value is now diagnostic. |
| D7 | 7 | 17 | Nobody in fourteen runs was misdirected. |

**Corroboration counts, for the items that gained them.** D8: 7 of 8 newer proposals (was 6 of 6
round-1 arms citing it correctly). N2: 3 independent primes. D3: D′ reproduces D's exposure and adds a
new argument. D6: C′, with the decisive form of the argument. D10: F′'s serialisation variant.

**What did not change.** D1 stays at rank 1 — it is still the largest difference between two readings
of what a prototype may publish, and its answer still lives only in code and a ledger row no author
received. The two "not a defect" findings from the first pass (the stop count, the "See §8" pointer)
are unchanged and re-verified.

---

*Compiled 2026-08-04, second pass, from `phase-1/proposals/arm-a.md` … `arm-f.md`, `arm-a-prime.md` …
`arm-f-prime.md`, `arm-e-r3.md`, `arm-f-r3.md`; and from `phase-1/DIVERGENCE_MAP_2.md` §7,
`phase-1/DITHER_METRIC_QUESTION.md`, `phase-1/CONFINEMENT_AUDIT_2.md`. Verified against
`PHASE_0_DECISIONS.md`, `PHASE_1_AUTHOR_BRIEF.md`, `PHASE_0_LOOSE_ENDS.md` (rows B31, B42–B46, A4,
A16, A17), `phase-1/packet/PHASE_0_DECISIONS.md`, `src/contract/PERCEPTION_VERDICT.md`,
`src/contract/invariants.ts`, `src/contract/constants.ts`, `src/robustness/README.md`,
`src/robustness/compare.ts`, `data/decisions/decisions.json` and
`data/oracle-validation/endorsement-recheck-1.json`. **Nothing in those files was modified by this
pass**, and no normative or instrument file was edited by the pass that found the defects in it.*
