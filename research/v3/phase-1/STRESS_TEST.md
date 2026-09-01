# Phase 1 — the proposals against the field guide as adversarial checklist

**Written 2026-08-04, after all six proposals landed.** The obligation is `V3_PLAN.md` §6, Phase 1:
*"The orchestrator then stress-tests each proposal against the field guide as adversarial checklist."*
The checklist is `phase-1/FIELD_GUIDE_CHECKLIST.md`, written **before `phase-1/proposals/` existed**,
which is the only property that makes this exercise worth anything.

**This document does not rank the proposals and produces no total.** `phase-1/COMMISSIONING.md` §7
leaves open how proposals are judged and which go forward; a score column would settle the first of
those quietly, from the incumbent's own document — the one source the phase was built to keep off the
scale. There are per-challenge findings below and there is deliberately no arithmetic over them. The
whole-matrix code distribution is given once, in §1, and is not broken down per arm for the same
reason.

**Three disciplines carried from the checklist, and they bind.**

1. **A proposal that says "my paradigm does not need that, because *X*" has passed.** The test is
   never whether a proposal contains a feature. It is whether it has an answer.
2. **Sourcing marks bind.** A challenge marked `[reported]` or `[asserted]` **may raise a question and
   may never sink a proposal**. Where applying one produced a criticism below, it is written as a
   question.
3. **`not owed` binds.** Twelve of the thirty-two hazards depend on material withheld from the authors
   by design. An unanswered challenge there is a **Phase 2 question, never a defect**. The matrix
   carries the owed status on every row, so every cell inherits it explicitly.

**Two arms need a different denominator, and one of them needs it stated twice.**

- **Arm F is the blind control** and received brief §2 and §3 only — no corpus facts, no tool catalog,
  no `PHASE_0_DECISIONS.md`, no §7. Challenges that presuppose those sections are **flagged, not
  scored**, and marked `⌀` in F's column. Judging F against them would be unfair on its face.
- **F's cost figure is not worse than the others'.** Per `DIVERGENCE_MAP.md` §5.1, F priced a 2 Mpx
  cover while D and E priced 640² and A priced ≤768 px; normalised to 640², F's rate gives the same
  band as D and E. Nothing below treats F's headline as a cost finding.

**Where a challenge is unanswerable because the contract is ambiguous rather than because an author
missed it, this document says so and points at `phase-1/CONTRACT_DEFECTS.md`** rather than faulting
the arm. Two such cases are named in §5.

---

## 1. The matrix

**Codes.**

| code | meaning |
|---|---|
| `ans` | **answered** — the proposal confronts the question and takes a position |
| `bd` | **answered by design** — the paradigm structurally cannot have the hazard, *and says why* |
| `part` | **partial** — confronted, but the answer has a hole |
| `safe` | **silent-safe** — the mechanism plainly precludes the hazard, but the proposal never says so |
| `unc` | **unconfronted** — never addressed, and the hazard is live for this arm |
| `⌀` | **F only** — the gap traces to a brief section withheld from the blind arm: flag, do not score |

**Owed column.** `owed` = the hazard reached the authors through the packet. `not owed` = withheld by
design, so an unanswered cell is a Phase 2 question and never a defect. `thin` = the instrument
reached the authors, the lesson did not.

| # | challenge | src | owed? | **A** | **B** | **C** | **D** | **E** | **F** |
|---|---|---|---|---|---|---|---|---|---|
| A1 | what makes a region the field | meas | owed | `ans` extent statistic, soft | `ans` what reaches the frame | `ans` per-member, elected on mass | `ans` low local colour derivative | `ans` what survives the peel | `ans` affine over large support |
| A2 | one shaded surface vs two areas | rev/rep | partly¹ | `ans` two-flat is its own order | `ans` chaining at the bar | `ans` ramp vs two-mode member | `ans` is *t* explained by position | `ans` graph diameter + monotonicity | `ans` three readings, model selection |
| A3 | present but not belonging | rev, thin | not owed² | `part` priced by smallness | `ans` geometry + corner anchor | `part` overlays are a member's ink | `unc` no provenance notion at all | `part` sticker/logo *are* the accent | `part` panels yes, marks no |
| A4 | bars and frames winning on area | rev | not owed² | `ans` bimodal moment, two-flat | `ans` explicit enclosure re-carve | `part` coverage penalises its own frame member | `part` depth-not-area kills bars, not mattes | `unc` no enclosure notion | `ans` frame = background by rule |
| A5 | when the text is the subject | rev/rep | not owed² | `ans` ink at large scale, no detector | `ans` stroke width, recall conceded | `part` "small share per cell" vs giant type | `part` depth band excludes giant type | `ans` dynamics + dispersion | `ans` unexplained, not small |
| A6 | would scrambling change the answer | **ass** | not owed | `unc` never posed | `part` "evidence is geometric" | `unc` never posed | `part` spatial fields throughout | `part` "text is where it sits" | `part` "layout, not its shadow" |
| A7 | colour-direction coverage | meas/rev | owed | `ans` unexplained mass is the lead term | `part` degenerate end safe, position unstated | `ans` shortfall pre-registered | `part` collapse stated, coverage unstated | `ans` lanes discharge it | `part` collapse stated, coverage unstated |
| A8 | what the image is where transparent | rep | owed | `ans` matte is a variable of *x* | `ans` the field's own representative | `ans` two members, per-image | `ans` exclusion, not a matte | `ans` reconstructed ground | `⌀` §7 withheld; named as a gap |
| B1 | early elimination and collateral | meas | owed | `bd` bound ≠ stage, argued | `ans` one site, endorsement-anchored | `ans` scoreboard names the refuser | `bd` no candidacy at all | `bd` lanes add, never remove | `part` absolute claim, three summarising stages |
| B2 | fixed capacity and eviction | rep | not owed | `ans` budget counted, gap published | `safe` no top-*k* anywhere | `ans` per-cell *k* priced, cannot evict a hex | `ans` "no candidate limits" | `ans` addition is monotone | `part` per-role shortlist, unexamined |
| B3 | role reachability | meas | owed | `bd` every triple, every role | `ans` every node, plus a controlled falsifier | `part` rests on the roster | `bd` all *N* pixels, always | `bd` no filter between lane and role | `ans` one pool + 30% refutation bar |
| B4 | symmetric evidence; one-way levers | meas/rep | thin | `ans` no eliminating filter; escape widens | `part` grain fold + re-carve unexamined | `ans` stability vetoes, never scores | `ans` step the rank, revalidate all | `ans` no repair stage exists | `part` IRLS down-weight, scale cut unexamined |
| B5 | cliffs and what sits on them | meas | owed³ | `bd` continuity + a limited prediction | `ans` dark stratum named as worst | `ans` runs the perturbation per image | `ans` rank filters; per-role rank margin | `bd` stability theorem, with numbers | `ans` margins on all four flips |
| B6 | relabelling and tie-breaks | meas | owed | `bd` no id, hex tie-break | `bd` lexicographic on pixel index | `bd` nothing reads a name or an order | `bd` permutation-invariant by definition | `bd` ties from values and coordinates | `bd` no metadata read anywhere |
| B7 | determinism and degenerate inputs | rep | owed | `ans` structural; escape on empty set | `ans` `unparsed` branch, dull and valid | `ans` floor member always admissible | `ans` escape from one-colour image | `ans` fallback chain + report the rest | `ans` escape; "a bug, not a feature" |
| B8 | silent fallbacks | rep | not owed | `ans` certified gap + differential test | `ans` parse-type census | `ans` scoreboard names the winner | `ans` regime switch named as a decision | `ans` visible in intermediates; tree brute-forced | `part` no-field case unlabelled, conceded |
| B9 | resolution and absolute pixels | meas/rep | owed | `ans` per-unit-mass, short-edge normalised | `ans` integral images, floor↔rendition | `part` fixed grid vs small marks unstated | `ans` rate at three sizes; *k* per tier | `ans` α agreement across renditions | `part⌀` reduced-area multi-start unaccounted |
| C1 | what "supported by" means | meas/rev | owed | `ans` prices rarity; asked for the floor | `ans` bar-mode centroid | `ans` structural, not numeric | `ans` quantiles, never extrema⁴ | `ans` persistence, not rarity | `ans` mass-maximising snap, no corpus fact |
| C2 | which colour goes where | meas | owed | `ans` labelling is a dimension of *x* | `ans` four lexicographic orders | `ans` roles read from labels | `ans` four different fields | `ans` polarity buys a round | `ans` joint four-role assignment |
| C3 | low contrast vs invisible | meas | owed | `part` raw scale, dead band oblique | `ans` "faithful and useless as UI text" | `part` whole-ramp filter, no raw/dead band | `ans` \|raw APCA\|, no colour rescue | `part` defaults bind nothing; dead band unaddressed | `part⌀` prefers, never requires; arithmetic withheld |
| C4 | which pairs, and the whole ramp | meas | owed | `ans` whole ramp, both roles, raw | `ans` dense sample + local refinement | `part` whole ramp, pairs unenumerated | `part` predicate only, coverage unstated | `part` feasibility predicate, coverage unstated | `part⌀` candidate filter; requirement withheld |
| C5 | gradient-claim neutrality | meas | thin | `ans` one λ prices the claim (MDL) | `ans` census would catch it drifting | `ans` boolean *is* the winner; lattice declared | `ans` boolean upstream; anchored on pairs | `ans` census against `ground_type` counts | `part⌀` one place sets both; census withheld |
| C6 | where the shading ends⁵ | meas/rev | owed | `ans` ends are the minimiser's | `ans` ends at the field model's extent | `ans` endpoints not the fitter's | `ans` **trimmed** rank, τ measured | `ans` extremes along the render axis | `ans` extremes of actual support |
| C7 | what the ramp renders through | meas | owed | `ans` path integral = excursion | `ans` revert if excursion does not fall | `ans` insert, re-measure, stop | `ans` RDP; meandering unreachable | `ans` publishes residual excursion | `ans` reports the second lobe |
| C8 | pricing the two-colour palette | rev | owed⁶ | `ans` the order that pays no λ | `ans` structural events, not fallbacks | `ans` claim lattice + pre-registered rate | `ans` empty population, not asserted | `ans` graph component count | `ans` existence rule, enforced on snapped hex |
| C9 | how many rulers | meas | owed | `ans` accent kernel anisotropic the other way | `ans` one ruler + a costless preference | `ans` "never share a ruler here" | `ans` qualification vs ordering, never touch | `part` one ruler for everything, by rule | `ans` "a different ruler… never the same function" |
| D1 | which numbers decide | meas/rep | owed | `ans` 4 + a counted compute budget | `ans` 5, plus a not-parameters list | `ans` 6, with the under-count declared | `ans` 5 + 3 inherited, all measured | `ans` 5 choices, each bought a round | `ans` 5 + the invariance interval |
| D2 | the repair loop | rep | not owed | `ans` refit λ, or the objective is wrong | `ans` reorder; orders carry no constants | `ans` re-election, not repair | `ans` tuning moves the cut, not the order | `ans` no repair stage to attach to | `part` "no stage wants a threshold"; no loop |
| D3 | fit to what has been seen | meas/rep | owed | `part` no detector | `part` census-not-per-item | `part` selector immune; substrate benched | `part` instrument-anchored | `part` matched-size control | `part` synthetic anchor |
| D4 | fitting weights from verdicts | meas | not owed | `ans` none fitted; λ by census round | `ans` round designed on one axis | `ans` no member emits a number | `ans` "it has to be pairs" | `ans` items chosen where attributes disagree | `ans` synthetic experiment with a right answer |
| D5 | perfect separators over few points | rep | not owed | `part` falsifiers, but clauses are cheap | `part` falsifiers, but a level is cheap | `ans` a rule becomes a member; deletion rule | `ans` "tuning moves where I cut" | `ans` nothing else is settable | `ans` no stage wants a threshold |
| D6 | structural claims vs arguments | **ass** | not owed | `ans` argument, then a limited prediction | `ans` "wrong interestingly rather than fixably" | `ans` "asserting rather than proving" | `ans` "a decision wearing a predicate's clothes" | `ans` theorem + the check that voids it | `ans` "five parameters or five excuses" |

¹ A2 is owed only inside `PHASE_0_DECISIONS.md` §4's oracle cross-check bullet; an author who read
that as a census note was not told. All six answered regardless.
² Owed **in name** (brief §2 goal 3 names frames, overlays and giant text), **not owed in detail** —
nothing told the authors what the failure looks like.
³ B5's grid-origin detail is not owed; the rest is (goal 1 quotes 72.8%, 114 palettes).
⁴ D also implements invariant 2's population floor as settled. That reads as C1's named evasion and
is not one — see §5.
⁵ C6's guide recommendation is **stale**, overridden by the reviewer's 2026-08-04 endpoint ruling.
Scored on the live residue only. See §6.
⁶ C8's escape wording is a known contract defect — see §5.

**Whole-matrix code distribution, 192 cells.** `ans` 130 · `part` 42 · `bd` 14 · `unc` 4 · `safe` 1 ·
`⌀` 1. Four further cells carry a `⌀` qualifier on a partial (B9, C3, C4, C5 in F's column) and are
counted as `part`, flagged not scored.

**This distribution is not a result.** It is the shape of an adversarial pass over six proposals that
were each about 350 lines long and each answered a brief that overlaps the checklist heavily. Its only
use is to locate the two rows that are empty of answers, which is §2.

---

## 2. The challenges no arm answered

Two of thirty-two. These are the most valuable output of the exercise, because six authors who could
not see each other all walked past the same hazard — which means the miss is a property of the
briefing or of the problem, not of any author.

### 2.1 A6 — would scrambling the image change your answer?

**The hazard in plain language.** Cut a cover into tiles, shuffle them, run the paradigm on the
result. Some outputs should change and some should not, and which is which is a statement about what
the paradigm is actually reading. A pipeline can look structural while consuming global colour
statistics — histograms, moments, covariances — every one of which survives a shuffle unchanged.

**What the six actually did.** Not one poses the test, and not one predicts the split. Four assert
the *first half* of the answer — that their evidence is spatial rather than colour-statistical — and
they assert it forcefully:

- **B**: *"No colour-statistics paradigm can do this, because the evidence is geometric."*
- **E**: *"text is text because of where it sits, not because of how many pixels it has."*
- **F**: *"any paradigm that works only in colour space is guessing at layout from its shadow."*
- **D** does not say it, and does not need to: an edge indicator, a depth field and a Spearman
  correlation against spatial parameterisations are the whole design.

**A** and **C** never raise it. A's inputs are a colour table — but that table carries spatial moments
and a multi-scale extent profile, so A's answer would move; A simply never says which parts. C's
coverage statistic is a sum over grid cells of per-cell mode masses, which is *nearly*
tile-scramble-invariant, and that is a real and unexamined property of the arm's ranking statistic.

**Why every arm missed it.** The challenge is `[asserted]` — the guide proposes the test and reports
no measurement from it — and it is `not owed`: nothing in any packet mentions it. It also costs one
sentence, which is exactly the class of thing an author writes only when prompted. Six authors were
never prompted.

**What it is: a Phase 2 prototype question, and a cheap one.** The scramble is a perturbation the
robustness harness could carry beside dither, re-encode and relabel at near-zero marginal cost, and
it is the only falsifier for "my paradigm reads structure" that needs no reviewer. Its value is
sharpened by the fact that the correct split is **not** obvious and cuts across four other challenges
at once: role assignment over a fixed colour set (C2) arguably *should* be scramble-invariant; the
representative-pixel rule (C1) *is* scramble-invariant in five of six arms and that is correct; the
field/ink separation (A1) and the gradient boolean (A2, C5) must not be. A prototype that publishes
those four predictions before it is run has made a real pre-registration for the price of a
paragraph.

**Nothing here is a contract item.** The contract says nothing about arrangement and should not.

### 2.2 D3 — what would show that this is fitted to what it has already seen?

**The hazard in plain language.** Every one of these paradigms will be developed against 2,757
candidate artworks, 351 endorsed palettes and a warehouse of past reviewer answers. None of the six
names a measurement that would tell it that it had become good at *those* artworks rather than at the
problem. The incumbent measured itself 1.61× more perturbation-stable on reviewed than on unseen
artwork, and nobody thought to look until late.

**What each arm offered instead, none of which is a detector.**

- **C** gives the strongest thing anyone said, and it is an immunity argument rather than a
  measurement: *"The selector only ever ranks members against each other within one image, so it
  never needs a threshold calibrated on a corpus, and there is no number in it a human tunes."* True,
  and it covers the deepest part of C — but C's substrate fidelity is set by refining *"until the
  selector's member ranking stops changing on the tuning bench"*, which is fitting to 200 artworks.
- **F** anchors its most consequential parameter on synthetic data with a known right answer — *"an
  experiment with a right answer, not a preference"*. That is prevention, not detection, and F never
  frames it as an answer to overfitting.
- **B** and **D** deliberately keep anchors off the reviewer (B's mark-coherence sweep is a *census*,
  "never per item"; D's parameters 1 and 2 are measured against the robustness harness with no
  reviewer involvement). Both nonetheless anchor a parameter directly on the endorsed set — B's area
  floor, D's ink annulus ratio — and both say so.
- **E** anchors P5 on the cross-rendition metric and calls it *"anchored by an instrument, not the
  reviewer — the cheapest anchor available"*.
- **A** names nothing.

All six pre-register a stratum prediction in their §7. Under the checklist's own good-answer wording
— *"a prediction about which artworks will look worse"* — that is materially a detector. But a
stratum prediction is not a seen-versus-unseen measurement, and none of the six offers it as one.
**The named evasion for this challenge — "it has few parameters, so it cannot overfit" — appears in
none of the six.** That is worth recording: the arms avoided the trap and still missed the question.

**Why every arm missed it.** The brief quotes the 1.61× figure in §2 goal 2, but as a *target
statement* ("quantified overfitting") rather than as a question. §7 withholds conclusions on purpose.
And no instrument in the §5 catalog measures the ratio — the checklist says so itself, citing
`V3_PLAN.md` §6 rows 4/5, which move it to the **Phase 2 entry condition**. Six authors were handed
the number and given nothing to design against.

**What it is: half handled, half not.** The instrument half is already a Phase 2 entry condition and
needs nothing from this document. The half that is not handled is small and specific, and it is a
**process item rather than a contract item**: whatever Phase 2 builds should require each prototype
to declare, *before it is tuned*, which of its parameters are being set from artworks it will later
be judged on. Three arms already tune on data they will be measured against and all three said so
plainly, so the declaration costs those three nothing and makes the ratio interpretable when the
instrument exists.

---

## 3. The challenges every arm answered

Thirteen of thirty-two: **A1, A2, B5, B6, B7, C1, C2, C6, C7, C8, D1, D4, D6.** A checklist entry
that six independent authors all answer is telling us one of two things, and the two are worth
separating.

**Eight were supplied — the agreement is evidence about the brief, not about the arms.**

| # | where it reached the authors |
|---|---|
| B5, B6 | brief §2 goal 1 quotes 72.8%, the 114 dithered palettes and the 55.85% relabel figure |
| B7 | `PHASE_0_DECISIONS.md` §3 makes determinism and the degenerate sweep binary gates |
| C1 | brief §4's 8.89e-5 / 1.91e-2 pair — but see below |
| C2 | §3's problem shape plus §4's role-permutation census |
| C6, C7, C8 | the endpoint ruling, guide-stop semantics and the collapse/escape text are verbatim in brief §3.1 |
| D1 | brief §1 asks for exactly this and says a proposal that cannot answer has not been thought through |

Two qualifications. **C1's supply was not necessary**: F reached the same representative-pixel rule
from a pure dither-stability argument with no corpus fact at all (`DIVERGENCE_MAP.md` §6.1), so the
fact that motivated the design conclusion turns out not to have been load-bearing for it. And **B7's
degenerate half was answered by F too**, without the gates.

**Five were not supplied, and the honest reading is that the challenge could not discriminate.**

- **A1 and A2** are not hazards a design can walk past. A paradigm that cannot say what makes a region
  the field, or cannot separate one shaded surface from two adjacent areas, cannot emit the contract
  at all — the gradient boolean depends on the second and both field roles depend on the first. These
  two entries are load-bearing for an *implementation* and near-vacuous for a *proposal*.
- **D4** (fitting weights from verdicts) is `not owed` — the checklist deliberately withholds the
  fitting null — and all six declined fitted weights anyway, four of them specifying the data design
  a round would need. **D** is sharpest: *"It has to be pairs, because §6 rules the gradient flag
  palette-conditional rather than an artwork label."* **E** designs its round on the items *"where the
  attributes disagree"*. The withheld conclusion turned out to be unnecessary — the same shape as
  §6.1's finding about §4, and the second instance of it in this phase.
- **D6** (structural claims versus arguments) is `[asserted]` and `not owed`, and all six separated
  proved from expected without being asked. It is the checklist's most self-critical entry and it is
  the one every author already had.

**The finding worth carrying forward:** D4 and D6 are both `not owed` **and** universally answered,
which is the strongest evidence in this exercise that the `not owed` flag was conservative in at
least two places. The flag cost nothing here; it should not be read as evidence that withholding was
free in general.

---

## 4. Where an answer is an evasion

Four, by the checklist's own definitions. Each is quoted, and each carries its sourcing mark, because
two of the four rest on marks that cannot sink a proposal.

### 4.1 F, on B1 — "no filter can remove a colour" with three summarising stages upstream

**The evasion the checklist names:** *"'The stages are independent' or 'the ranking would have
recovered it' without a mechanism that makes the recovery possible."*

**F, §2.4:** *"Every colour group in the image is in the pool for every role. No role has an
eligibility gate… there is no filter that can remove a colour from consideration, only a competition
it can lose."*

That is an absolute claim, and F's pool is manufactured by three stages that each summarise: a
redescending Tukey biweight that down-weights marks *"to essentially zero"*; a mark grouping whose
scale is chosen by a stability sweep, so material that does not survive the stable scale is not
grouped; and mean-shift mode-seeking in OKLab, so a colour that is not a mode is not a group. F names
no elimination point anywhere. `DIVERGENCE_MAP.md` §2 puts F in the third eligibility regime —
*"whatever the intermediate object happened to produce"* — alongside B and C, and B and C both name
their restriction while F asserts its absence.

**Two things offset it, and both matter.** F's own falsifier measures exactly this, with the phase's
only pre-registered numeric refutation bar (*"I would pre-register 30% of endorsed accents"*), and F
states the separation from under-tuning cleanly: *"if the endorsed colours are in the pool but I rank
them second or third, that is scoring… If they are not in the pool at all, no amount of tuning
reaches them."* So F supplied the mechanism for detecting the failure while asserting it cannot
happen. **Sourcing: B1 is `[measured]` and the hazard is owed to F** — brief §2 goal 3 says *"the
right answer existed and the architecture could not emit it"* and F had §2. The 148-to-fix-14
measurement and the zero-collateral criterion are `PHASE_0_DECISIONS.md` §2 and were not F's to have.

### 4.2 A, on A3 — rarity as the reason a badge loses, against A's own argument

**The evasion the checklist names:** *"Relying on area or rarity thresholds to exclude them. The
relevant measurement cuts the other way: the median endorsed role colour's exact-triple area share is
8.89e-5, so smallness does not mark a colour as illegitimate."*

**A, §2.2:** *"an overlay badge is a small, positionally concentrated ink population the objective
prices and usually declines."*

A prices rather than thresholds, which is a real difference and A is entitled to it. But the price is
paid in explanatory mass, so the mechanism by which a badge loses **is** its smallness — and A's own
§2.1 is the phase's most explicit argument that smallness is the wrong reading: *"Any objective that
reads mass at exact triples is reading a quantity two orders of magnitude smaller… than the one the
reviewer is responding to."* A resolves that tension for *published colours* by reading all mass
through a bar-width kernel, and then leaves it unresolved for *overlays*, where the same smallness is
allowed to be disqualifying. A does not say what stops the same pricing from declining a genuine
signature colour at the same area share.

**Sourcing: A3 is `[reviewed]` and thin — it rests on one quoted reviewer sentence, not a census —
and it is `not owed in detail`. This raises a question and cannot be a defect.** The question is
narrow and answerable in Phase 2 at no cost: score A's objective on the endorsed role colours at or
below the 8.89e-5 median and see whether the ink term declines them.

### 4.3 E, on C9 — one ruler for everything, stated as a virtue

**The evasion the checklist names:** *"One ΔE threshold used for distinctness, collapse detection,
accent visibility and gradient stop spacing."*

**E, §2.0:** *"Every question of the form 'are these close enough?' — anywhere in the pipeline — is
answered with the contract's own same-colour ruler and nothing else. No second radius, no local
epsilon, no tolerance. That is parameter honesty as an architectural rule."*

That is the named evasion, verbatim, framed as a discipline. The measurement it collides with is in
brief §3.1, which E had: a lightness step must be ~2.9× a chromatic one to read as a *different
colour*, while a lightness step is worth ~3.9× a chromatic one for making an accent *findable* —
same space, opposite anisotropy — and §3.1 says outright *"Never share one ruler between 'is this the
same colour?' and 'does this work as an accent?'"*

**What partly rescues E, and where it does not.** E's accent is selected by persistence rank
(`rank(dynamics) + rank(−dispersion)`), not by a distance, so the *findability* question is never
asked as a distance question — that is a genuine structural answer and it is why this is `part` and
not a failure. But E's accent **distinctness gate** — *"distinct from the foreground above the
ruler"* — is the identity ruler doing functional work, and E half-sees this: its own closing note (c)
records that it expects to trip `ACCENT_FUNCTIONAL_DISTANCE` *"on exactly the accents the H↑ lane
exists to find"*. Five of the six arms state the two-ruler split explicitly; E is the one that
declares the opposite rule and then designs around needing it.

**Sourcing: C9 is `[measured]` and owed.** The checklist's own caution applies and is honoured: E is
not faulted for the bar's digits, only for the one-ruler rule.

### 4.4 F, on B2 — a per-role shortlist presented as exhaustiveness

**The evasion the checklist names:** *"Calling a cap a performance decision. It is a correctness
decision with a performance excuse; the question is what it evicts."*

**F, §2.7:** *"I take the top few candidates per role by role-fit score and solve the small four-role
assignment exhaustively, so no ordering artefact enters."*

F does not call it performance — it calls it exhaustiveness, which is the same move one level down: a
shortlist is presented as a completeness property of the search *inside* it. Nothing is said about
what the *k+1*th candidate loses, or whether a new source of candidates can displace an existing one.
This is the phase's only unexamined shortlist; A counts its search budget as a parameter and
publishes a certified gap when it binds, C prices its per-cell mode list as free parameter 1 and shows
it cannot evict a publishable hex, D declares "no candidate limits", and E states that addition is
monotone.

**Sourcing: B2 is `[reported]` and `not owed` — capacity bounds appear nowhere in any packet. This is
a question for F's author, never a defect.**

### 4.5 The one that reads as an evasion and is not

**D, on C1.** C1's named evasion is *"adopting a population floor as if it were settled. It is the one
gate currently known to be measurably wrong."* D adopts it: §2.7 implements *"invariant 2's population
floor and spatial-spread test, directly"*, and §4 lists it among the inherited items *"which my
verification pass implements rather than re-decides."*

**That is not D's defect and this document does not treat it as one.** Invariant 2 is normative and D
is obeying it. `phase-1/CONTRACT_DEFECTS.md` **D3** records that invariant 2 *"requires a test whose
two halves are, respectively, retired and never built"* — so the arm that implements the contract as
written is the arm that inherits the defect. Three other arms hit the same wall from the other side
and said so: **A** made it its primary stub request and pre-registered the consequence (*"my 'price,
don't threshold' claim is partly false and the contract is doing rarity work I have credited to the
objective"*); **C** recorded that *"the invariant names a test with no threshold and no instrument"*;
**E** flagged the adjacent accent-distance gate. The defect belongs to `CONTRACT_DEFECTS.md`, and the
resolution there is what should reach D, not a criticism of D here.

---

## 5. Two more places to read `CONTRACT_DEFECTS.md`, not this document

- **C8, arm C.** C's floor member depends on reading the escape as *"one colour in two roles rather
  than two invented colours"*, and C says outright that *"if it is wrong the escape is unusable as
  written and the floor member has no last resort."* `CONTRACT_DEFECTS.md` **D6** records that the
  escape reads as unsatisfiable and that the resolving text is in code. C confronted the question,
  chose a reading, and declared its dependence on it. There is nothing to fault.
- **B9 and C4, arm F.** F's §9 names *"Stops when the gradient boolean is false. Unknown schema"* as
  *"the one gap that actually bit"*, which is `CONTRACT_DEFECTS.md` **D10**; and the whole-ramp
  contrast requirement and the no-resampling rule both live in `PHASE_0_DECISIONS.md`, which F did not
  have. F's `part⌀` cells on C3, C4, C5 and B9 are flagged for that reason and are not scored.

One item that is neither: **F's reduced-area multi-start** (§5, *"the multi-start stage run at reduced
area and only the winner refined at full resolution"*) is a resampling step, and B9's named evasion is
*"'It resizes to N px first' without an account of what is lost."* The input policy that forbids
resampling is `PHASE_0_DECISIONS.md` §1 and was withheld from F, so this is flagged rather than
scored. The damage is bounded in any case — F's published colours come from the full-resolution triple
map, so only the fit's initialisation sees the reduced image — but the account of what is lost is
missing and is worth asking for.

---

## 6. Staleness: C6 confirmed, and the sweep for others

**C6 is stale as the checklist's author said.** The guide recommends decoupling render stops from role
colours; the reviewer's 2026-08-04 ruling pins the first stop to the background and the last to the
surface exactly. **All six proposals obey the ruling** — every one makes the ramp's ends *be* the two
field roles, and four of them argue that this is why the endpoint invariants hold by construction
rather than by repair. Applying the guide's recommendation would therefore have faulted **all six
compliant proposals at once**, which is exactly the failure mode the checklist warned about. C6 was
scored on its live residue only: a criterion for where shading ends that is a property of the image
rather than of the fit, plus a distinctness check against the rest of the palette. All six pass that,
and **D** passes it best — it is the only arm to read the ramp's ends at a *trimmed* rank rather than
at an extremum, and to name the trim level as a measured parameter.

**Two more entries are stale in the guide and were corrected in place by the checklist.** Both would
have inverted a verdict if the guide's version had been applied:

- **C9.** The guide's advice is *"keep ONE ruler"*. Perception-4 measured the opposite anisotropy and
  brief §3.1 says *"Never share one ruler"*. The checklist notices this — it says outright that
  §3.1 *"is newer than the guide and partly contradicts it"* and applies the newer rule. Had the
  guide's version been applied, **E** — the arm that declares one ruler for everything — would have
  been rewarded, and **A, C, D and F** would have been faulted for carrying two. The verdict in §4.3
  is the reverse of that, and it is correct.
- **C1.** The guide's §2.2 advice is a population floor. `CONTRACT_DEFECTS.md` D3 records that the
  floor is retired and its partner never built, and the toolbox review found the invariant as
  specified would refuse 96.9% of endorsed palettes. The checklist flags this and calls the floor
  *"the one gate currently known to be measurably wrong"*. Had the guide's version been applied, **D**
  would have been rewarded for implementing it and **A, C and E** faulted for refusing it — again the
  reverse of the truth.

**One entry is inapplicable by the checklist's own note.** **D3** cannot be checked against any
instrument, because the reviewed-versus-unseen stability ratio is tracked by none and has moved to the
Phase 2 entry condition (`V3_PLAN.md` §6 rows 4/5). That is a third kind of staleness — a live hazard
with no live measurement — and it is why §2.2's conclusion is a process item rather than a defect
finding.

**I found no fourth entry that is stale and uncorrected.** The remaining `[reviewed]` and `[measured]`
material — the endpoint ruling, the guide-stop semantics, the collapse rules, the APCA dead band, the
16% permutation rate, the 55.85% relabel figure, the excursion criterion, the identity-coverage rule —
all reconcile with `PHASE_0_DECISIONS.md` and brief §3.1 as they currently stand. C6 remains the only
entry where the checklist's own recommended answer is inverted by a live ruling.

---

## 7. Per-arm summaries

One paragraph each. What the arm is strongest against, and the one challenge that hurts it most. These
are not comparable to each other and are not ordered by anything.

**A — the joint objective.** Strongest against the structural group. B1 carries the phase's sharpest
statement of the no-early-elimination property (*"elimination by certified bound is not a pipeline
stage"* — a bound discards only after proving the region cannot contain the optimum of the whole
objective), B5 is the only full continuity derivation in the phase and it ships with a prediction that
has a stated limit (*"if bar agreement is also poor, the continuity argument in §2.6 is empirically
false"*), C8 is the only literal *pricing* of the fourth colour, and C5 independently reinvents the
MDL term the guide names as its own never-built idea. **What hurts most: A3.** It is the one place
where A's "price, don't threshold" posture reverts to smallness as a disqualifier, in direct tension
with its own §2.1 — and A3 is `[reviewed]`, thin, and not owed in detail, so it is a question and not
a defect. The runner-up is C3: A works on the raw pre-clamp scale, which is right, but never states
the dead band or the difference between deliberately subtle and invisible.

**B — the nesting parse.** Strongest against the semantic group, and it is the only clean sweep there:
A1 (*"the field is what reaches the frame"* — a positional and topological criterion, one union-find
query), A3 (overlays typed by achromaticity, axis alignment, corner anchoring and colour-unlinkedness,
and *sorted last rather than excluded*), A4 (an explicit `enclosure` type with a bounded re-carve
inside), A5 (a stroke-width text detector with mediocre recall conceded up front). B also gives the
phase's best answer to B8: the **parse-type census**, which separates *"the parse failed"* from *"the
parse succeeded and the reading was wrong"*, because *"a system that cannot tell those apart cannot be
steered."* **What hurts most: A7.** B has no coverage notion at all and never states that "nothing" is
its position, while the two places a major colour direction could go missing — the grain area floor,
and node granularity — are exactly B's own eliminations. B's falsifier is the right instrument and
measures reachability, which is adjacent but not the same question. B4 is the runner-up: grain folding
and the carve re-entry are one-way and unexamined.

**C — the portfolio and its selector.** Strongest against the process group and against asymmetry. C
is the only arm to declare a one-way lever and bound it (*"Stability never adds to a score; it only
gates and orders"*), the only arm whose repair loop *is* the paradigm (*"when a palette fails a
contract invariant, the answer is a different member, not a patch"*), the only arm with a stated
policy for what happens to a post-hoc rule (it becomes a member, and members carry a deletion rule),
and the only arm to run the perturbation ensemble *at runtime* as a per-image cliff detector. Its
pre-registered distribution prediction — collapse rate too high, gradient rate too low — is a census
that costs no review round. **What hurts most: A4.** C's frame-aware member exists, and the statistic
that elects members works against it: coverage asks what fraction of image *mass* a reconstruction
gets right, and the frame-aware member labels the frame `ignore`, so the account that correctly
discards a matte is scored below the account that models it as field. C never confronts this. It is
the phase's cleanest instance of a selector working against its own roster, and it is fixable inside
the paradigm — which is the question worth asking about it in Phase 2.

**D — order statistics of the pixel array.** Strongest against the mechanical hazards. B3 and B1 carry
the strictest statement in the phase (*"There is no candidacy wall anywhere in this design, because
there is no candidacy"*), B6 is unreachable rather than fixed (multiset order statistics are
permutation-invariant by definition), C9 is the cleanest two-ruler statement anyone made (*"the
qualification uses the identity ruler, the ordering uses the functional direction, and they never
touch"*), and C6 is the only arm to read the ramp's ends at a trimmed rank and to name the trim as a
measured parameter. **What hurts most: A5.** D's ink score lives in a depth band *"above zero and
below the field"*, so a letter big enough to be the subject has field-scale depth and leaves the band
— which is precisely the hazard the checklist names, a shape prior that makes giant type look like a
field. D names anti-aliased small text as a failure and never names giant text. A3 is the sharper hit
in one sense — D is the only arm with no mention of a badge, watermark, logo or overlay anywhere — but
both are `not owed in detail`, and A5's class is owed in name by goal 3.

**E — the layer stack.** Strongest against reachability and robustness. B3 is the cleanest
architectural discharge of goal 3 in the phase (four evidence lanes constructed so that *"adding a
lane can only add candidates, never remove one"*, aimed directly at the fragile hue-only accent), B5
is the only stability *theorem* rather than argument and it comes with the numbers and with the check
that would void it, and C1's persistence criterion is a direct answer to the question the brief says
has no instrument (*"rarity is the wrong axis"*). **What hurts most: A4.** E is the only arm with no
notion of an enclosure at all. A black bar, a matte or a picture frame has enormous area persistence,
would survive the peel into the ground, and would be published as the field with no mechanism
anywhere in E to prefer the enclosed image — and the class is owed in name by goal 3. C9 is the
runner-up and is written up in §4.3.

**F — the blind control, on its own denominator.** Judged only on what §2 and §3 could have told it.
Strongest against the ramp and against its own parameter claim: C6 reads the ends from the
component's *actual support* rather than from the fit's parameterisation, C7 reports the second
excursion lobe as the evidence a fourth stop's negotiation would need, D1 is the only proposal in the
phase that offers an instrument for judging its own parameter claim (*"a parameter whose interval
covers the whole plausible range is not free in any meaningful sense, and saying so with evidence is
the difference between five parameters and five excuses"*), and B5 publishes a margin on all four
discontinuous declarations after conceding that *"a binary decision on a continuous quantity flips
somewhere."* A5 is also strong: giant text is a mark by *non-explanation*, not by size. **What hurts
most: B1**, written up in §4.1 — the only absolute no-elimination claim in the phase, over a pool
built by three summarising stages, with no elimination site named. The hazard is owed to F through §2
goal 3, so this one is scored rather than flagged. F's four `⌀` cells (A8, and the withheld halves of
B9, C3, C4, C5) are the measured cost of the blind and belong to `DIVERGENCE_MAP.md` §7.2, not here.

---

## 8. What this document does not settle

How proposals are judged, which 2–3 go to Phase 2, and whether the seats worked. All three remain
open exactly as `phase-1/COMMISSIONING.md` §7 left them, and nothing above should be read as narrowing
them. In particular: the 42 `partial` cells are not a defect count. `PHASE_1_AUTHOR_BRIEF.md` §1 says
an immature idea that fails interestingly is worth more than a safe one that scores, and `V3_PLAN.md`
§6 says Phase 2 judges trajectory and ceiling rather than first-round scores. The question this
document was built to answer is which hazards a paradigm's failures would fall into and whether they
are fixable from inside it — and on that question its two most useful outputs are the two rows in §2,
which belong to no arm.
