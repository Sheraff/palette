# Contract defects found by the Phase 1 authors — a decision packet

**What this is.** Six authors wrote architecture proposals from a sealed packet containing the output
contract and its supporting documents. Between them they found ten things wrong with documents this
project had treated as settled. Every one has been re-checked against the normative text; two turned
out not to be defects and are reported as such rather than dropped. Three more were found in the
proposals and are not on anyone's original list.

**What it asks of you.** Ten rulings. Most are of the form *"here are two sentences that disagree —
which one stands?"* and take a word each. Three are genuine design decisions and are marked as such.
Nothing here is fixed by the person who noticed it; recording is this document's job.

**Terms are glossed where used.** No invariant number, constant name, round name or ledger id appears
without a plain-language gloss beside it. You should not have to open anything to answer.

---

## The two buckets

| bucket | what it means | what you are being asked |
|---|---|---|
| **INCONSISTENCY** | Two texts in this repo say different things about the same rule, and one of them is simply stale or wrong. There is a right answer already; nobody has written it down in both places. | *Which text stands.* Usually one word. |
| **DESIGN GAP** | The documents agree, and what they agree on is incomplete: a rule with no instrument, a band nobody has decided the width of, a number nobody has measured. | *A decision.* No amount of editing settles it. |

## The table

Ranked by consequence — what a Phase 2 prototype is allowed to emit, first.

| # | defect | bucket | verified | rank |
|---|---|---|---|---|
| D1 | Foreground↔accent is governed by two distances and no text says which binds | INCONSISTENCY | **true** | 1 |
| D2 | The 0.07444 dead band around the foreground: nothing states its width is intended | DESIGN GAP | **true** | 2 |
| D3 | Invariant 2 names a two-part test; one part was retired, the other never built | INCONSISTENCY + DESIGN GAP | **true** | 3 |
| D4 | Invariant 4's closing clause still points the accent floor at a mechanism that moved | INCONSISTENCY | **true** | 4 |
| D5 | `FOREGROUND_ACCENT_SEPARATION_DISTANCE` is excluded from measurement by the rounds' own construction | DESIGN GAP | **partly** — see below | 5 |
| D6 | The white/black escape reads as unsatisfiable; the code says otherwise | INCONSISTENCY | **partly** — ambiguity, not a contradiction | 6 |
| D7 | The brief's anisotropy advice and its own numbers use opposite framings in one paragraph | INCONSISTENCY | **partly** — equivocation, not an error | 7 |
| D8 | The brief quotes the warm SAM cost where it means the cold one | INCONSISTENCY | **true** | 8 |
| D9 | The tool catalog labels `src/contract/` "built" against a definition it does not satisfy | INCONSISTENCY | **true** (new) | 9 |
| D10 | The brief's problem shape implies a flat field still emits stops | INCONSISTENCY | **true** (new) | 10 |
| — | Stop count: "2 or 3 (4 negotiable)" vs `MAX_GRADIENT_STOPS = 4` | — | **not a defect** | — |
| — | `PHASE_0_DECISIONS.md` §6's "See §8" | — | **not a defect** | — |

**Glossary for the table.** *Invariant 1* = schema validity (is the object the right shape). *Invariant
2* = source support (is every published colour a real pixel of the image). *Invariant 3* = palette-wide
distinctness (do any two published colours read as the same colour). *Invariant 4* = no published pair
at zero luminance contrast. *The same-colour bar* = the OKLab distance below which the reviewer calls
two colours the same; four values by colour region, 0.00932 (dark neutrals) to 0.02293 (light
saturated), frozen 2026-08-03. *`[REVIEWED]` / `[INHERITED]` / `[UNCALIBRATED]`* = audit tags meaning
"measured on this question" / "measured on a different question and borrowed" / "placeholder, never
measured". *perception-4* = the 148-item reviewer round of 2026-08-04. *B31, A4, A16, A17* = rows in
the open-items ledger `PHASE_0_LOOSE_ENDS.md`, which authors did not receive.

---

## D1 — Two rulers govern the foreground↔accent pair, and no normative text says which binds

**Bucket: INCONSISTENCY.** There is a right answer, it is in the code and in a ledger row, and it is in
neither document an author was given.

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

## D2 — The dead band: an accent may be at 0, or above 0.07444, and nothing states the gap is intended

**Bucket: DESIGN GAP.** Following D1, the rule is unambiguous — and nobody has written down that its
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

## D3 — Invariant 2 requires a test whose two halves are, respectively, retired and never built

**Bucket: INCONSISTENCY (first half) + DESIGN GAP (second half).**

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
Two paradigms built on that sentence.

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
- **Arm C** flagged it and routed around it, making belonging structural rather than numeric.

**RECOMMENDATION, two parts.** (a) Amend §4 invariant 2 to state what is true: the existence clause is
hard, the population figure is computed and reported and decides nothing (A17), and the spatial-spread
half is deferred pending provenance (A4). This is transcription. (b) The spread half is a **design gap**
and I do not recommend a threshold — §4 itself forbids inventing one. But a prototype cannot be asked to
satisfy a deferred test, so the ruling worth having now is simply *"deferred means not required in
Phase 2"*, stated rather than inferred.

---

## D4 — Invariant 4 still says the accent floor "may properly live in colour distance"; §2 moved it

**Bucket: INCONSISTENCY.** A stale clause in the invariant text, contradicted by a ruling recorded
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
conflict to adjudicate — only a paragraph nobody deleted.

---

## D5 — 0.07444 has been excluded from measurement by the construction of every round that could have measured it

**Bucket: DESIGN GAP.** Verified in substance; the strong form of the claim ("could never move") is too
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

**Who is blocked.** Nobody, directly — no arm's design turns on the digits. This is a standing debt
against the contract, not a Phase 1 blocker.

**NO RECOMMENDATION.** Whether to spend a review round on B31 is an allocation of your bandwidth, which
is the campaign's binding constraint, and B31 already notes the saving: it is the same protocol as A16's
functional-distance round on a different stimulus, so running them together is most of the cost. That
trade is yours. What I will say is that D2's band width cannot be settled without it, so the two
questions are one question.

---

## D6 — The white/black escape reads as unsatisfiable; it is satisfiable, and the resolving text is in code

**Bucket: INCONSISTENCY (ambiguity).** Checked: the escape works. The wording does not say so, and every
arm that used it had to guess.

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

**Cost.** Low in outcome, universal in incidence: arms B, C, D, E and F all reached for the escape and
all five silently assumed the correct reading. Arm C alone stated the risk
(`phase-1/proposals/arm-c.md`, closing): *"I read that as one colour in two roles rather than two
invented colours; my floor member depends on the reading, and if it is wrong the escape is unusable as
written and the floor member has no last resort on a genuinely one-colour image."*

**RECOMMENDATION.** Add six words to §2 and to §4 invariant 2: the exemption covers the escape role
**and its collapsed partner**, because a collapse means they are one colour. **Reasoning:** this is not a
choice between readings — the other reading makes the clause you wrote inoperative, and the code already
implements the operative one.

---

## D7 — The brief's anisotropy advice and its own numbers use opposite framings in one paragraph

**Bucket: INCONSISTENCY (wording).** Checked carefully: **the numbers are right and the advice is right.**
They are stated in frames that are exact opposites, one sentence apart, and two readers took it as a
contradiction.

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
margin in exactly the wrong direction.

**RECOMMENDATION.** Keep the advice; disambiguate the frame in the sentence itself — *"the rule demands
more chroma separation than you need, and less lightness separation than you need"*. **Reasoning:** this
is a wording repair with a known right answer, and the plain-language form has no frame to get wrong.

---

## D8 — The brief's cost bracket quotes the warm SAM number where it means the cold one

**Bucket: INCONSISTENCY.** The brief contains both numbers, forty lines apart, and only one is right for
the place it is used.

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

**Cost.** None realised. All six arms cited 6.2 s (arm F, which never saw §6.1, cited both correctly:
*"SAM at ~2.7–4.3 s warm, ~6.2 s cold"*).

**RECOMMENDATION.** Change the exceptional-end bullet to ~6.2 s cold, keeping 2.7–4.3 s as parenthetical
warm context. **Reasoning:** §6.1 is explicit about which figure a proposal quotes, and the correction
moves the bar the *stricter* way, so it cannot advantage anything already written.

---

## D9 — The tool catalog labels `src/contract/` "built" against a definition it does not satisfy — new

**Bucket: INCONSISTENCY.** Not on the original list. It is the mechanical cause of D3 blocking arm A.

**The two texts**, both `PHASE_1_AUTHOR_BRIEF.md` §5:

> **Built** means the instrument has a README of its own, **which is the authority on what it currently
> does**; this brief does not restate status for code another workstream owns.

> | **Contract invariants** (`src/contract/`) | […] | `import` from `src/contract/`;
> `tests/contract-*.test.ts` | built |

Every other "built" row names its README (`src/adjudication/README.md`, `src/honesty/README.md`,
`src/review-server/README.md`). `src/contract/` has none — verified, the directory holds
`BELONGS_STUDY.md`, `PERCEPTION_MODEL_STUDY.md` and `PERCEPTION_VERDICT.md` and no README. The packet
manifest records this honestly under `catalogEntriesWithNoDoc`, and records the same for
`src/warehouse/`.

**Cost.** The brief promises that the authority on the contract module's current behaviour is a document,
declines to restate that behaviour on the strength of that promise, and the document does not exist. Both
D3 and D1 have answers living only in `invariants.ts`, which no author could read. Arm A's request names
the mechanism precisely: *"neither is in my packet and the catalog's `src/contract/` row names no
README."*

**RECOMMENDATION.** Either write `src/contract/README.md` — the retired population floor, the deferred
spread test, the elevated foreground↔accent cell, the escape's two-slot exemption; every answer in this
packet lives there — or drop the "built means it has a README" promise. **Reasoning:** the first is
cheap and repays itself immediately; four of the ten items here would not have been findable as defects
if it existed, because the authors would have had the resolving text.

---

## D10 — The brief's problem shape implies a flat field still emits stops — new

**Bucket: INCONSISTENCY.** Brief only. Found by the blind arm, and it is the one gap that actually bit it.

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

**Cost.** Confined to the blind arm, by construction — every other arm had §2. But the blind arm is the
control on the whole briefing design, and a control that fails on a schema question tells you less about
anchoring than it should.

**RECOMMENDATION.** Add four words to §3: *"…plus a gradient boolean and, when it is true, stops."*
**Reasoning:** the contract is unambiguous; only the brief's summary is not, and the fix costs nothing.
Arm F's related assumption — that a distinct non-gradient `surface` (a panel, a frame, a split field) is
legitimate — is **correct** under §2, which puts roles and gradient in separate fields; that one needs no
change beyond the same sentence.

---

## Checked, and not a defect

**The stop count is not ambiguous.** The 2026-08-04 ruling (*"A gradient can have 2 or 3 stops (4 is
negociable if proven utility)"*) and `MAX_GRADIENT_STOPS = 4` are reconciled explicitly in the bullet
that carries both, `PHASE_0_DECISIONS.md` §2: *"the 4th stop is **negotiable on proven utility** rather
than granted, so reaching for it owes evidence that three could not do the job. `MAX_GRADIENT_STOPS` is
unchanged at 4."* The schema admits four; the licence requires an argument. All six arms read it that way
and five explicitly declined to emit a fourth stop. **One residual, and it is small:** invariant 1 admits
stops 2–4 with no test of utility, so nothing distinguishes a justified fourth stop from an unjustified
one at validation time. That is a named condition with no instrument, in the same family as D3, but no
prototype currently wants it. The separate question — whether a false gradient boolean emits one stop —
is answered by §2 (`gradient: null`, no stops) and is carried above as D10, a brief-wording defect rather
than a contract one.

**`PHASE_0_DECISIONS.md` §6's "See §8" is not dangling.** In the canonical document §8 exists and carries
the bulk-model bullet the pointer promises. It dangles only in the *packet extract*, where §§7–8 were
deliberately withheld — and the packet manifest declares exactly that under `danglingCrossReference`,
naming the line and stating where a reader who follows it lands. Arm D checked and reached the same
conclusion: *"the manifest flags it as a known dangling reference, so it is disclosed rather than
contradictory."* No ruling needed.

---

## Raised by an author, disclosed in the packet, and worth your attention anyway

Neither of these is a document defect. Both are live design consequences the arms surfaced.

**`ACCENT_FUNCTIONAL_DISTANCE` is an uncalibrated placeholder enforced inside a hard gate.** 0.14591,
`[UNCALIBRATED]`, refused adoption twice (`accent-real-1`, then `perception-4`, both for the same
pre-registered reason — the quantity is `stratum-dependent` and one hue third identifies no threshold
anywhere), and it nonetheless decides whether an accent gets its one escape from the contrast floor. The
packet discloses all of this. Arm E's response is a stated intent
(`phase-1/proposals/arm-e.md`, closing): *"I expect to trip it on exactly the accents the H↑ lane exists
to find, and intend to invoke the standing demotion rule rather than tune around it."* That is the
standing rule working as designed — an invariant that blocks an endorsed palette is demoted — and it is
a prediction you may want on the record before Phase 2 rather than after.

**The direction-aware challenger is measured in one colour region and counted in four.** Arm B notes that
the report-only challenger applies `dark-neutral`-derived weights to pairs in every region, which
`PERCEPTION_VERDICT.md` warns against twice (*"MEASURED IN dark-neutral ONLY"*). Fully disclosed, and
inert while the challenger is report-only. Arm B's point is narrower and correct: its paradigm uses the
bar for *pixel connectivity*, so if the direction-aware shape is ever enforced, that extrapolation would
change its parse and not merely its checks. Evidence about who pays if the confirming round ever runs.

---

## What each arm did about what it found

Cheapness of a resolution is best read off what an author already built around it.

| arm | defect it hit | what it did | what that says |
|---|---|---|---|
| A | D3, D9 | Asked for the test; proceeded assuming the floor admits colours at the endorsed median share | The assumption is right by accident. Cheap: the answer is "there is no floor". |
| B | D1 | Assumed both bars hold (= `max`) | Guessed the shipping rule. Cheap: confirm it. |
| C | D3, D6 | Made belonging structural (densest triple of the densest neighbourhood) rather than numeric; floor member depends on the escape reading | D3 costs it nothing; D6 costs it its last resort if the reading is wrong. Cheap: confirm. |
| D | D3 | Built the verify-and-step repair loop *on* the test | Expensive: the loop has no predicate. Needs D3's ruling before prototyping. |
| E | D1, D2 | Collapses the accent whenever it lands in the band | Expensive if wrong — it biases the whole design toward collapse in the fragile stratum. |
| F (blind) | D7, D10 | Designed against the numbers, not the wording; assumed one stop for a flat field | D7 costs nothing; D10 is a form error it would have to unwind. |

---

*Compiled 2026-08-04 from `phase-1/proposals/arm-a.md` … `arm-f.md`, verified against
`PHASE_0_DECISIONS.md`, `PHASE_1_AUTHOR_BRIEF.md`, `PHASE_0_LOOSE_ENDS.md`,
`src/contract/PERCEPTION_VERDICT.md`, `src/contract/invariants.ts`, `data/decisions/decisions.json` and
`data/oracle-validation/endorsement-recheck-1.json`. Nothing in those files was modified.*
