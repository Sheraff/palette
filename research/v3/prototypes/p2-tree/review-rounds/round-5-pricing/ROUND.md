# P2 round 5 — five measured trades, priced

**Kind:** pairwise, blinded. **Items:** 5 covers, two sides each, on the real mock player. On every
item the two sides differ in **exactly one role** and in nothing else; `validate.ts` proves it per
item and names the role. **Staged 2026-08-11** by the round-5 staging worker; the main orchestrator
installs it. Files: `pin.sh`, `patch.ts`, `probe.ts`, `build.ts`, `items.json`,
`mapping.private.json`, `validate.ts`, `out/{base,accent-member,fg-member}.json`, this document.

> **This document and `mapping.private.json` are not servable.** They hold the decode: which fixture
> position is the published palette, what produced the other side, and every measurement behind both.
> `validate.ts` scans the served surface and the fixture's raw bytes and fails on any of it.

## What this round is for

Five trades that were **measured by a worker and refused as a worker's call**. Each one is a place
where the prototype could publish a different colour, the effect is quantified, and the reason not to
take it unilaterally is written down in `DECISIONS.md` or in a worker's notes. None of the five is a
bug and none is a candidate comparison: every side of every item is a palette some build of this one
prototype publishes, and every published colour is an exact pixel triple of its artwork.

## Why five demo-20 covers

`DECISIONS.md` D3 draws P2's rounds beyond demo-20 from round 3 on — *"demo-20 items only where a
specific prior verdict is being re-tested"*. All five items are that exception, and each names the
verdict or the measurement it re-tests: D9's endorsed coral (item 1), round 1's *"black is the
artwork's text"* ruling (item 2), D9's identity-coverage design item on the two covers worker K
flagged as its adverse cases (items 3–4), and worker L's owed item on the cover where the phantom-group
fix left the artwork's own type at |raw APCA| 2.7 (item 5). A fresh-cover sample would not test any of
them.

## The pin — and the drift it caught

Every side is built inside a `git archive` export of

**`734c3f564f16ce9cf829fb420ddbf220fa1103cf`**

(`pin.sh`; the export gets `node_modules` and the corpus shards symlinked beside it and nothing in the
live worktree is written, checked out, stashed or committed). This is not ceremony: a sibling owns
`tos/` and HEAD moved under this worktree *during* this staging pass — `9aab5f2` → `734c3f5` between
two of this worker's own commands. `validate.ts` fails if any side's fingerprint disagrees with the
probe files' pin.

The pin also makes a drift visible, and it is stated here rather than papered over. `tos/coverage/DESIGN.md`
§5 proposed items 3–4 on 2026-08-05 with the accents `#c18d20 → #030e2a` and `#ffbd6f → #242e09`.
At the pinned commit — after worker L's cross-lane dedup and antialias ineligibility landed (`78f0285`)
— the four hexes are `#c18d20 → #362545` and `#fea851 → #242e09`. Three of the four moved. The items
are built from the pinned build's own output, never from the design document's numbers, and the
consequence for what item 4 can price is stated in its own section below.

## The two variant levers, and how they are built

`tos/roles/NOTES.md` (worker J, cycle 3) implemented, measured and reverted two sub-bar publication
rules. A cluster is a set of nodes the contract's own bar calls **one colour**; which *member* of it
publishes is therefore a choice below the bar, and it is currently made by **area** — which the dither
diagnosis measures as one of the churniest orders in the parse.

| lever | the one-line change | measured effect |
|---|---|---|
| **accent-member** | an accent cluster publishes its most **chromatic** member instead of its largest | dither-arm agreement 23% → 24%; the accent moves on **42 of 100** dithered covers against 50 — the largest single stability effect cycle 3 found |
| **fg-member** | a text group publishes its most **readable** member instead of its largest, through the `memberScore` hook `roles/text.ts` keeps for exactly this | on `…d859a69094` the artwork's own `#070506` stops publishing |

`patch.ts` applies each as **one exact substitution at one site** in the exported `tos/pipeline.ts`,
asserting the site occurs exactly once and that exactly one line of the file changed. Both quantities
are already computed in the scope they are inserted into, so neither variant introduces a measurement.
Worker J refused both **on quality** — each sacrifices a colour with a recorded reviewer endorsement —
and recorded them as round material. This is that round.

## What the review page actually collects

The pairwise page (`review-ui/index.html`, `app.js`) records, per item: **a grade for side A**
(`1 2 3 4` → strong / acceptable / weak / unacceptable), **a grade for side B** (`6 7 8 9`), **a
preference** (`a` / `b` / `n` → `a` | `b` | `no-preference`), **one free-text comment** (`c`), a
**confound** toggle (`x`), a **veto** on the artwork (`v`), and an optional palette-composer
endorsement (`e`). There are **no per-role grades** and no per-side veto (round 3's schema defect,
recorded in its OUTCOME.md). The table below reads **the preference and the guard, and nothing else**;
§*Precedence* says why the comment cannot fire a row.

---

## Item 1 — `…35b967964d`, the accent

**The question, in plain words:** two reds, same artwork, everything else in the palette identical.
Which one should the player use as the **accent** — the single saturated colour it puts on highlights?

| decoded side | accent | OKLab chroma from the background | what it is |
|---|---|---|---|
| **published-largest-member** | `#d25068` | 0.16848 | today's palette. D9 quotes the reviewer on this exact hex: *"the correct shade of red (Strawberry Moon)"* |
| **chroma-extremal-member** | `#ee5567` | 0.18996 | the same cluster — the same colour under the contract's bar — published by its most chromatic member instead of its largest |

Everything else, both sides: `background #dfe0d0 · surface #f3f3f3 · foreground #edbab9`, no gradient.
The two accents are **0.05623** apart in OKLab, **2.45×** their own same-colour bar: a visible
difference, and a small one. Both are exact triples of the artwork.

## Item 2 — `…d859a69094`, the foreground — **this round's near case**

**The question:** two near-blacks for the title text, everything else identical. Is one of them the
artwork's black and the other not — or are they one colour?

| decoded side | foreground | min \|raw APCA\| over the rendered field | what it is |
|---|---|---|---|
| **published-largest-member** | `#070506` | 90.4662 | today's palette; the hex round 1 ruled on (*"black is the artwork's text → fg should be black"*) |
| **contrast-extremal-member** | `#050304` | 90.4974 | the same text group published by its most readable member |

Everything else, both sides: `background #ffffff · surface #e0e0e0 · accent #161415`, gradient
`#ffffff → #e0e0e0` on both.

**Three facts declared before the answer.**

1. The sides are **0.016463** apart in OKLab — **1.77×** the contract's own same-colour bar for the
   pair (0.00932), but **under the 0.02 selection margin** every earlier P2 round used to keep items
   off that boundary (D7). This is deliberate: the *whole* question is whether a sub-bar publication
   rule costs anything a reviewer can see, and an item chosen to be comfortably visible would not ask
   it. Expect "can't tell" to be a real answer here, and see row **I2-N**.
2. The readability the variant is named for is worth **0.031 |raw APCA|**, against
   `APCA_RAW_IDENTICAL_CEILING` = 1.98152 — the magnitude the metric returns for two *identical*
   colours. The lever does not buy readability on this cover; it buys a churn-resistant rule.
3. On the **published** side the foreground/accent margin is **0.0747** against the contract's
   `FOREGROUND_ACCENT_SEPARATION_DISTANCE` 0.07444 — it clears by 0.0003. On the variant side it is
   0.0911. If a note says the black and the dark accent are one colour, that is this margin speaking,
   and it speaks *against the published side*, which is the opposite of the direction a staging worker
   would bias.

## Items 3–4 — identity-coverage allocation, on its two adverse covers

**The question (both items):** two accents, everything else identical. Which one belongs on this
artwork? One side takes the most saturated colour the artwork offers; the other deliberately takes a
colour from a **different part of the artwork's colour wheel**, so that the four published colours
between them represent more of the artwork.

That rule is `tos/coverage/` (worker K), D9's cycle-3 design item — the reviewer's own diagnosis on the
Strawberry Moon cover was *"side B has the correct shade of red, but doesn't have the green"*. It is a
design prototype behind its own candidate id and changes nothing the current candidate publishes. These
two covers are the ones its own designer flagged as the cases that **can kill the rule**.

### Item 3 — `…7116a8247378`

| decoded side | accent | chroma from the background | what it is |
|---|---|---|---|
| **published-most-chromatic-accent** | `#c18d20` gold | 0.15529 | today's palette |
| **family-allocated-accent** | `#362545` dark violet | 0.03954 | the allocation's pick: a second colour family, at **25.5%** of the published accent's chroma |

Everything else, both sides: `background #434554 · surface #3a394b · foreground #8e6a52`, no gradient.
The two accents are 0.41645 apart (18.2 bars). Census: **3 families**; the preferred family is rank 1
and carries **4 of the pool's 241 marks**. This is the round's strong adverse case — coverage buys a
family and spends three quarters of the accent's chroma to do it.

### Item 4 — `…1c908479200b`

| decoded side | accent | chroma from the background | what it is |
|---|---|---|---|
| **published-most-chromatic-accent** | `#fea851` warm orange | 0.12188 | today's palette |
| **family-allocated-accent** | `#242e09` dark olive | 0.10795 | the allocation's pick: **88.6%** of the published accent's chroma retained |

Everything else, both sides: `background #8b5964 · surface #8c4936 · foreground #8f5e59`, no gradient.
The two accents are 0.53304 apart (23.2 bars). Census: **2 families**; the preferred family carries
**1 of the pool's 46 marks**.

**What item 4 can and cannot price, stated before the answer.** Worker K staged this as the same trade
"in the other direction of lightness", and at his measurement the published accent was `#ffbd6f`. At the
pinned commit it is `#fea851` and the chroma cost of the swap has largely gone: 88.6% retained is not
"most of the accent's chroma". So item 4 prices a **lightness-and-family** trade at near-equal chroma,
not the chroma trade item 3 prices, and the joint block below is written so the two are not read as two
instances of one thing. Its second job is the census's own falsifiable weakness, which worker K named
and no assertion in his directory can catch: the preferred family here is **one mark**, and if the
reviewer sees no second colour family on this artwork, the family width is what failed, not the rule.

## Item 5 — `…0001073`, the foreground — worker L's owed item

**The question:** the artwork's own title colour, which sits very close in lightness to the background,
against the most readable colour this palette's own ranking offers next. Does the artwork's real text
colour still win when it is *this* hard to read?

| decoded side | foreground | min \|raw APCA\| over the rendered field | what it is |
|---|---|---|---|
| **published-artwork-type** | `#f8dab8` | **2.7188** | today's palette: the detector's text group, published under the identity-over-legibility rule, clearing the contract's `EPSILON_TEXT_RAW` floor of 2.5 by 0.2 |
| **next-in-ranking** | `#16151a` | **87.0059** | rank 1 of the same foreground ranking — what the walk publishes if the type's colour is not taken |

Everything else, both sides: `background #f6d4d5 · surface #fce4e0 · accent #96d7ad`, no gradient. The
two foregrounds are 0.70847 apart (30.9 bars).

**How the alternative was chosen, because `roles/NOTES.md` names the cover and not the colour.**
*Admissible* = this pipeline's own assembly walk settles on it, the contract accepts the whole palette,
and no other role moves; **90** of the pool's candidates qualify. Among them the alternative is the one
the published ranking itself puts next — rank 1 — which is also the most readable candidate at the
ranking's leading eligibility level. Three pool colours score higher raw readability (`#070705` 88.10,
`#080b14` 87.91, `#0f121b` 87.38) and every one of them sits at pool index ≥ 50; under
`rankByFieldContrast`'s own ordering (level, then readability class, then colour) that can only mean a
**worse eligibility level** — the boundary-tracing / low-salience class D12 measured and D14 says a
fallback must never reach for. `build.ts` asserts exactly that (every more-readable candidate ranks
later) rather than asserting the hex, so the derivation fails loudly if the ranking changes.

Context, not a thumb on the scale: D14 has just closed the I4 escalation with the floor **affirmed**,
on a note that also said *"there are valid picks in the image"*. This item asks the same question from
the other side — not whether an under-floor colour may publish, but whether an **over**-floor one at
2.7 should.

---

## What each outcome does — declared before the round is released

### Precedence, denominators, and what the table reads

- **Denominator.** Each item yields exactly **one** verdict. Each block below partitions **that item's
  own answer space** — `confound {set, clear} × veto {set, clear} × preference {published, variant,
  no-preference}`, 12 states — so exactly one row of each block fires per verdict. The joint block J
  partitions the **2 coverage items'** joint space (144 combinations). `validate.ts` enumerates all of
  them and fails if any combination fires zero rows or more than one.
- **Precedence.** Within a block the **guard row wins**: if the verdict carries `confound: true` or the
  artwork is vetoed, that block's other rows are all conditioned on the guard being clear and cannot
  fire. Block J is subordinate to blocks I3 and I4: it fires no action they already fire, and it is not
  read at all while either item's guard is set.
- **The free-text comment fires no row, deliberately.** It is recorded, quoted verbatim in OUTCOME.md,
  and it decides the *wording* of whatever P2 asks next — but it is not a partitionable field, and
  conditioning a row on "the note names a reason" is exactly the ambiguity that made the round-2 and
  round-3 tables defective (D9's and D13.5's process lessons). The two grades and the composer
  endorsement are likewise recorded and reported and fire nothing.
- Rows name the **decoded** sides. The server reshuffles A/B at push under a fresh salt; reading this
  round means joining `mapping.private.json` to the batch log's blinding index, never the letter on
  screen.

### The table

| row | condition | what it changes |
|---|---|---|
| **I1-G** | item 1: confound set **or** vetoed | item 1 is not read; the accent-member lever stays queued (D12) and the item is re-staged |
| **I1-P** | item 1 guard clear, preference = **published-largest-member** | worker J's accent lever is **refused by the judge**, not only by its author: D12's queued cluster-member item closes for the accent, area-member publication stands, and the 23%→24% dither gain is recorded as a cost we decline to pay |
| **I1-V** | item 1 guard clear, preference = **chroma-extremal-member** | the lever is **adopted for the accent** (existing attribute, no constant); D9's endorsement of `#d25068` is superseded by a direct comparison, and `lanes/tests/accent-acceptance.test.ts`'s coral assertion is rewritten to the new hex rather than deleted |
| **I1-N** | item 1 guard clear, preference = **no-preference** | the quality objection that blocked the lever is **not confirmed** at 2.45 bars: the trade goes to integration on the stability numbers alone, and D9's endorsement is scoped to the *shade family* rather than the triple |
| **I2-G** | item 2: confound set **or** vetoed | item 2 is not read. Given §*near case* fact 1, a confound here is the expected answer and is **not** a re-stage: it is recorded as the sub-bar rule being invisible, and blocks I2's other rows only |
| **I2-P** | item 2 guard clear, preference = **published-largest-member** | the foreground's area-member rule stands, confirmed by the judge as well as by worker J's acceptance case; the `memberScore` hook stays defaulted and the fg lever is closed |
| **I2-V** | item 2 guard clear, preference = **contrast-extremal-member** | the readable-member rule is **adopted for text groups** (one line, the existing hook); round 1's *"black is the artwork's text"* ruling is re-scoped from an exact triple to the artwork's type **cluster**, and the acceptance test follows |
| **I2-N** | item 2 guard clear, preference = **no-preference** | a sub-bar publication rule costs nothing visible on the cover it was refused for: worker J's quality objection to the fg lever is measured at 0.016 OKLab and is **not** a reviewer-visible loss, so the lever's disposition moves to stability evidence alone |
| **I3-G** | item 3: confound set **or** vetoed | item 3 is not read; the adverse case is re-staged before any coverage decision is taken |
| **I3-P** | item 3 guard clear, preference = **published-most-chromatic-accent** | coverage **loses its strong adverse case**: buying a family at 25% of the accent's chroma is refused, and if the rule is ever integrated it owes a chroma-retention condition, priced by a round, before it may fire on a cover like this |
| **I3-V** | item 3 guard clear, preference = **family-allocated-accent** | coverage **survives its own worst case**: D9's identity-coverage allocation is confirmed as an accent-slot rule even when the chroma cost is three quarters |
| **I3-N** | item 3 guard clear, preference = **no-preference** | at 18 bars apart, indifference is a statement about the *artwork*, not the rule: this cover leaves the coverage question open and the ranking's next test is item 4's family width, not another chroma trade |
| **I4-G** | item 4: confound set **or** vetoed | item 4 is not read; re-staged |
| **I4-P** | item 4 guard clear, preference = **published-most-chromatic-accent** | the family-and-lightness swap is refused where chroma is *not* the cost (88.6% retained) — which isolates the objection as being about the **family choice** itself, and puts the census's 26.51° family width first in the queue (worker K's own falsifier) |
| **I4-V** | item 4 guard clear, preference = **family-allocated-accent** | the allocation is endorsed on a **one-mark** family: the census's width and its ranking survive their thinnest input, and D4/D5's identity-coverage axis gains its second direct data point |
| **I4-N** | item 4 guard clear, preference = **no-preference** | the second family is not perceptible on this artwork, which is evidence about the **census** and not about the allocation: the family width is measured before the rule is asked about again |
| **I5-G** | item 5: confound set **or** vetoed | item 5 is not read; worker L's owed item stays owed and is re-staged |
| **I5-P** | item 5 guard clear, preference = **published-artwork-type** | **identity outranks legibility all the way down to the contract's floor**: D3's identity-over-legibility rule and text-colour-leads stand unqualified, worker L's owed item closes, and the 2.7 publication is not a defect to be tuned away |
| **I5-V** | item 5 guard clear, preference = **next-in-ranking** | identity does **not** outrank legibility this far down. P2 changes no floor (D14: the floor is the contract owners'), and instead **measures** how many corpus covers publish a text-group foreground within a stated margin of `EPSILON_TEXT_RAW`, bringing a calibrated descend-instead rule to a later round; nothing ships on this verdict alone |
| **I5-N** | item 5 guard clear, preference = **no-preference** | an 84-point readability gap that reads as indifferent is evidence about the **instrument**, not the rule: the mock player's rendering of a low-contrast foreground is re-examined before this question is asked again |
| **J-G** | items 3–4: either item's guard set | the joint coverage reading is **not made** — the denominator is 2 and one of them is missing |
| **J-2** | both guards clear, **2 of 2** prefer the allocated accent | worker K's own pre-declared threshold on the adverse half of his round is met: **integration of `tos/coverage/` into `candidate.ts` is staged**, with the open version-string question (DESIGN.md §4) resolved as part of it |
| **J-1** | both guards clear, **1 of 2** prefers the allocated accent | the rule is real and the **ranking** is wrong: item 3's verdict says whether chroma-retention or family stability should lead, and integration waits on a ranking round |
| **J-0a** | both guards clear, **0 of 2** prefer the allocated accent, and both prefer the published accent | coverage does **not** buy an accent on adverse covers: D1's chroma-first accent stands unqualified there, and D9's coverage mandate is redirected to the foreground/surface slots it explicitly permits |
| **J-0b** | both guards clear, **0 of 2** prefer the allocated accent, and at least one is no-preference | undecided, not negative: no integration and no redirection; the coverage question needs the confirmatory item (`…35b967964d`, DESIGN.md §5 item 1) that this round did not carry |

## Blinding

`items.json` carries opaque variant labels (`variant-01` / `variant-02`) and opaque algorithm versions
(`blinded-01` / `blinded-02`) — round 4's convention, not the `p2-tree-…` labels rounds 1 and 3 used.
The labels follow the **fixture position**, and which decoded side takes position A **alternates by
item index parity**: items 1, 3 and 5 lead with the published palette, items 2 and 4 lead with the
variant. So neither the label nor the position carries the answer. `variantId` and `fingerprint` never
leave the server (`round-kit.ts` `KNOWN_LEAK_FIELDS`) in any case.

Every side's fingerprint carries the **same** commit and `dirty: true`, uniformly: every palette in
this round was built inside an export directory that also holds this round's own scripts, so the flag
is true for all ten sides and distinguishes none of them.

`validate.ts` scans in two tiers, as round 4 did: the **served surface** (item id, the media URL built
from it, the artwork file name, every palette hex) and the **whole fixture's raw bytes**, against
candidate, pipeline, prototype, round and batch tokens plus this round's own vocabulary — *member*,
*cluster*, *chroma*, *contrast*, *coverage*, *family*, *published*, *variant*. It also asserts each
served item id is a bare 40-hex cover slug.

## Provenance

- **Every palette** comes from `probe.ts` run inside a pinned export (`sh pin.sh <variant> probe.ts`),
  written to `out/<variant>.json`. `build.ts` reads only those three files — it runs no pipeline,
  decodes no image and reads no HEAD — which is what lets `validate.ts` re-run it twice and byte-compare.
- **Items 1 and 2's variant sides** come from the two patched exports; `patch.ts` proves each patch is
  one substitution at one site and that exactly one line of `pipeline.ts` changed.
- **Items 3 and 4's variant sides** are `tos/coverage/candidate-coverage.ts`'s own output, unmodified,
  including its run-time assembly-replica check.
- **Item 5's variant side** is the published pipeline's own assembly walk with one pool candidate moved
  to the front of the ranking it already sits in; `probe.ts` first re-runs that walk in the *published*
  order and asserts it reproduces the published palette (worker K's replica check, borrowed).
- `build.ts` asserts, and refuses to build, if: `…35b967964d` stops publishing `#d25068`; the chromatic
  variant stops publishing `#ee5567`; `…d859a69094` stops publishing `#070506`; the allocation is a
  no-op or moves a role other than the accent on either coverage cover; the allocated accent is not the
  lower-chroma side; the published foreground is not rank 0 of its own ranking on item 5; or rank 1 is
  not admissible.

## Reproducing

```sh
sh pin.sh base          probe.ts     # ~9 s; writes out/base.json
sh pin.sh accent-member probe.ts     # writes out/accent-member.json
sh pin.sh fg-member     probe.ts     # writes out/fg-member.json
node --experimental-strip-types build.ts     # rewrites items.json + mapping.private.json
node --experimental-strip-types validate.ts  # exit 0 or it does not ship
```

`validate.ts` asserts: 5 items, 2 sides each, distinct variant ids, one shared preprocessing version,
every fingerprint at the pinned commit; the item id is the slug of its own basename and a bare 40-hex
slug; every colour a lowercase `#rrggbb`; gradient endpoint identity (`stops[0]` **is** the background,
the last stop **is** the surface, positions strictly increasing, none beside a collapsed surface);
collapse flags equal to hex equality; **exactly the declared role differs between the sides, per item,
named per item**; both sides of every item clearing the contract's own
`FOREGROUND_ACCENT_SEPARATION_DISTANCE` and every distinct role pair ≥ 0.02 OKLab (D7); the two sides
of each item **further apart than their own same-colour bar**; side order alternating by item index
parity; both blinding tiers; every image on disk and repo-relative; **every published colour on both
sides an exact triple of its artwork, decoded by this file's own `sharp` call**; the private side-car
agreeing with the artifact and declaring itself unservable; **the outcome table mechanically MECE** —
all 12 answer states of each item block and all 144 of block J enumerated, exactly one row firing in
each; and a deterministic rebuild, running `build.ts` twice more and byte-comparing both results.
