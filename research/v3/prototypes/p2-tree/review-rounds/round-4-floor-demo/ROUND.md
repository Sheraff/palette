# P2 round 4 — the contrast floor, demonstrated

**Kind:** pairwise, blinded. **Items:** 1 cover, two sides, on the real mock player. The two sides
differ in **one role — the foreground — and in nothing else**; `validate.ts` proves it. **Staged
2026-08-11** by the round-4 staging worker; the main orchestrator installs it. Files: `build.ts`,
`items.json`, `mapping.private.json`, `validate.ts`, this document.

> **This document and `mapping.private.json` are not servable.** Everything the fixture deliberately
> does not carry lives here: which side is which, where each foreground came from, the contrast
> numbers, and the waiver below. `validate.ts` scans the served surface and the fixture's raw bytes
> and fails on any of it — including the words *waiver*, *floor*, *I4*, *epsilon*, *APCA*, *halo*,
> *antialias*. The reviewer must judge two foregrounds with no story attached to either.

## Why this round exists — the reviewer's ruling, verbatim

> you need to show me, in general we shouldn't bypass the minimum-contrast floor, but seeing it
> could help us decide if it's the contrast that is wrong or the color pick.

## The question

**Is the contrast floor wrong here, or the colour pick?**

The reviewer answers it in the only currency this round can collect: a preference between two
foregrounds on one artwork, and — if he writes one — a note saying why.

## The background, in five lines

On this cover (`…7960ad020c7a`, the previous round's item 2) the palette was graded **acceptable**,
the round's highest grade, with this note (verbatim):

> The white foreground does not seem to be a color that is part of the artwork, and as a result the
> identity of this artwork is not well conveyed by this palette

`tos/identity/q1` then diagnosed it, and `DECISIONS.md` D12 records the correction: the text
detector was **right**. It elected the artwork's real type, `#1e2221`, at rank 0. Contract invariant
**I4's ε floor (2.5 |raw APCA|) refused it**, the assembly walk descended one step, and what
published was `#fcffff` — a 263-pixel near-white antialias fringe, which is the colour the reviewer
then said is not part of the artwork. D12 escalated this to the main orchestrator as the recorded
"an invariant blocks the reviewer-correct colour" case, and this round is the evidence that
escalation is missing: nobody has yet **seen** the refused colour on the artwork.

## The two sides

| decoded side | foreground | what it is |
|---|---|---|
| **true-ink-floor-waived** | `#1e2221` | the colour the reading elected first and the contract refused — 51 exact pixels of this cover, the artwork's own type |
| **published-halo** | `#fcffff` | the palette as graded, byte-identical to `round-3-quality/items.json` — 263 exact pixels, the fringe around that type |

Both sides publish the same `#131919` background, `#182023` surface, `#492ab3` accent, no gradient,
no collapse. Both foregrounds are exact triples of the artwork, decoded by `validate.ts`'s own
`sharp` call — as is every other colour on both sides.

**Side letters are not in this table on purpose.** The fixture's own order is deterministic (round
1's parity mechanic: one item, index 0, even, so the substituted side takes fixture position A, and
`mapping.private.json` records it), but the review server **reshuffles A/B at push under a fresh
random salt** and writes the shuffle to the batch log. Reading this round means joining
`mapping.private.json` to that blinding index, exactly as the pair-015 analyst did — never assuming
the letter on screen.

## The waiver — recorded, bounded, and creating no precedent

**The `true-ink-floor-waived` side deliberately violates contract invariant I4.** Measured here by
the contract's own APCA path (`src/contract/color.ts` `apcaRawBetween`), against `EPSILON_TEXT_RAW`
= 2.5:

| foreground | against | \|raw APCA\| | shortfall below ε | OKLab |
|---|---|---|---|---|
| `#1e2221` | background `#131919` | **2.0317** | 0.4683 | 0.0404 |
| `#1e2221` | surface `#182023` | **1.1880** | 1.3120 | 0.0141 |
| `#fcffff` | background `#131919` | 109.0564 | — (clears) | 0.7905 |
| `#fcffff` | surface `#182023` | 108.2128 | — (clears) | 0.7608 |

These are the same two numbers the walk recorded when it refused the colour
(`I4.below-contrast-floor`, `parameter: minTextContrast`, `raw: -2.0316643129313854` and
`-1.1880116365726292`). `validate.ts` recomputes both from the shipped bytes and fails if the
declared violation is not the violation.

Four statements bound this waiver:

1. **It exists for this demonstration only.** The reviewer asked to see the refused colour; a
   compliant fixture cannot show it. Nothing else in this round, and nothing in any candidate, is
   permitted to descend below the floor.
2. **No candidate produces this palette.** The waived side is the graded palette with one role
   replaced by a hex read out of the diagnosis. `mapping.private.json` records
   `isPipelineOutput: false`.
3. **The server does not enforce contract invariants at push** — deliberately, and it says so:
   `src/review-server/batch.ts` (`parsePalette`) records that collapse-flag agreement, source-pixel
   stops "or any other contract invariant" are *"[d]eliberately NOT checked here… the review server
   must be able to render an invalid palette, because showing suspected-bad palettes to the reviewer
   is exactly what outlier-mining batches are for."* This round uses that property; it does not
   discover it, and it does not ask for it to be widened.
4. **This creates no precedent for bypassing floors in published candidates.** Whatever the reviewer
   answers, the disposition of I4's ε floor belongs to the contract owners (D12). P2 will not tune
   around the floor, and no P2 candidate ships a below-floor foreground on the strength of this
   round.

### The demonstration's own confound, stated before the answer

`#1e2221` sits **0.0141 OKLab from the surface** — below the 0.02 selection bar D7's margin guard
uses to keep round items off the same-colour boundary. Every earlier round refused to stage a pair
that close; this one stages it, because a colour the instrument would normally refuse to show is
precisely what the reviewer asked to see. The consequence to expect: on the waived side the
foreground may read as *the surface*, not as text. If a note says the two are one colour, that is
this confound speaking and not a fifth role.

## One item, and why there is no second

A second item was to be built **only** if the diagnosis showed another cover of the same clean class
— the detector's own election refused by I4, with a near-white published in its place. It does not.
Every other diagnosed cal-014 foreground is a different mechanism:

| cover | mechanism | same class? |
|---|---|---|
| item 1 `…39b7dbc802fd` | **no text group at all**; the near-white was pool rank 0 and the walk accepted it with **zero refusals** — a blown highlight, nothing was refused | no |
| item 5 `…f57bc46a3680` | **phantom text group** (one physical mark named four times across lanes); published at rank 0, zero refusals — a bypass, not a refusal (D12's cross-lane dedup defect) | no |
| item 6 `…d5fd547eb7f3` | two I4 refusals **but** the accepted rank-2 colour IS the admissible pool maximum — a **field-stage ceiling** set by the published ramp; no halo published | no |

Item 6 is the near miss and is named here so the single-item decision is not read as an oversight:
it refuses on the same invariant, but there is no better colour behind the refusal, so waiving the
floor on it would demonstrate nothing. **One item, deliberately.** A demonstration round is worth
one clean instance and nothing else; padding it with a different mechanism would make the answer
unreadable, which is the failure mode round 3a's per-role rules already hit.

## What the review page actually collects

The pairwise page (`review-ui/index.html`, `app.js`) records, per item: **a grade for side A**
(`1 2 3 4` → strong / acceptable / weak / unacceptable), **a grade for side B** (`6 7 8 9`), **a
preference** (`a` / `b` / `n` → `a` | `b` | `no-preference`), **one free-text comment** (`c`), a
**confound** toggle (`x`), a **veto** on the artwork (`v`), and an optional palette-composer
endorsement (`e`). There are **no per-role grades** and no per-side veto. The outcome table below
reads the preference and the comment; the two grades, the endorsement and the release note are
recorded and reported but do not fire a row.

## What each outcome does — declared before the round is released

**Guard, read first.** If the verdict carries `confound: true` or the artwork is vetoed, **no row
below fires**: the comparison is reported as not-made and the round is re-staged. Every row below is
conditioned on the guard being clear, so the rows are mutually exclusive and collectively exhaustive
over the answers the page can record. Rows name the **decoded** sides, never the letters on screen.

| # | condition (guard clear) | what it changes |
|---|---|---|
| **G** | `confound` set **or** the item vetoed | nothing is read; the demonstration is re-staged before anything is asked of the contract owners |
| **1** | preference = **true-ink-floor-waived**, and the comment names a reason (contrast/readability **or** colour/belonging) | P2 **requests disposition of I4's ε floor from the contract owners** (D12's escalation, now with evidence): this verdict, the two \|raw APCA\| numbers above, and the reviewer's stated axis. The note decides what is being asked — a *belonging* note asks whether identity may outrank the ε floor; a *contrast* note asks for the floor's value, not its existence. P2 changes no floor itself. |
| **2** | preference = **true-ink-floor-waived**, no comment, or a comment naming neither axis | the same request, with weaker evidence: a single-cover preference and no stated reason. Recorded as such — the contract owners are told the axis is unstated. |
| **3** | preference = **published-halo**, and the comment names a reason | **the floor stands; the colour pick is the defect.** P2 builds **antialias-ineligibility** (D12: inradius ≈1 px, boundary fraction ≈1 — the measured accidental-shadow class, 30/113 reachability failures) so the walk lands on a better-than-halo colour instead of the fringe. The note says which property to exclude on. No contract request is made. |
| **4** | preference = **published-halo**, no comment, or a comment naming neither axis | the same: floor stands, antialias-ineligibility is the work, designed on the measured attributes alone. No contract request. |
| **5** | preference = **no-preference**, and the comment names a reason | **the demonstration is inconclusive; no change is requested** of the contract owners and no ineligibility work is funded on this evidence. The note is kept as the one usable content — most likely the confound above (foreground read as the surface), which would say the *demonstration* failed, not that the question is closed. |
| **6** | preference = **no-preference**, no comment | inconclusive, **no change requested**, nothing kept. D12's escalation stays open on the diagnosis alone, and the next attempt at this question needs a different instrument, not a second run of this one. |

Rows 1–6 partition `preference × comment`; `preference` is a closed, always-present field
(`a` | `b` | `no-preference`), and the comment either names one of the two axes or does not. No two
rows can fire together and no answer falls outside them.

## Blinding

`items.json` carries opaque variant labels (`variant-01` / `variant-02`) and opaque algorithm
versions (`blinded-01` / `blinded-02`) — **not** the `p2-tree-…` labels rounds 1 and 3 used. On this
round a label hinting "the published one" versus "the hand-built one" would decode the comparison
for anyone reading the fixture, and the fixture is read by more people than the served payload is.
`variantId` and `fingerprint` never leave the server in any case (`round-kit.ts`
`KNOWN_LEAK_FIELDS`); the true meanings are in `mapping.private.json`, so nothing is lost — it is
moved.

`validate.ts` scans in two tiers: the **served surface** (item id, the media URL built from it, the
artwork file name, every palette hex) against candidate, pipeline, prototype, round, batch and
this-round-vocabulary tokens; and the **whole fixture's raw bytes** against rounds 1 and 3's list
plus *waiver*, *floor*, *I4*, *epsilon*, *APCA*, *halo*, *antialias*. It also asserts the served item
id is a bare 40-hex cover slug — no round or prototype token riding along in the one string the
browser is given.

## Provenance

- **Published side:** `review-rounds/round-3-quality/items.json`, item `…7960ad020c7a` — the exact
  bytes pushed as `phase2-cal-014` and graded *acceptable*. Read from the file, not re-run: a re-run
  under a moving candidate could drift, and then the round would be comparing against a palette
  nobody graded. `validate.ts` proves the shipped side byte-identical to it.
- **Substituted foreground:** `tos/identity/q1/report.json` (`p2-tos-identity/q1@1`, candidate
  `p2-tos-0.3.0-cycle-2-merged`), `items[1].walk.foregroundSteps[0]` — the rank-0 step carrying
  `refusal: "contract-violation"`. `build.ts` asserts that step is still refused, still rank 0, still
  the head of the election pool, and still `provenance: "text-group"`; if the diagnosis is ever
  re-run and that stops being true, the build stops rather than stage a different comparison under
  the same name.
- **Fingerprint:** `gitCommit` and `dirty` read from HEAD at build time (`a8d6ed21…`, `dirty: true`
  — `tos/out/` and `tos/lanes/out/` are untracked). HEAD moves under this worktree while a round is
  staged, so the determinism claim is *at a fixed HEAD* and `validate.ts` fails a rebuild that
  disagrees: rebuild and re-validate immediately before shipping.
- **Freshness:** the cover is absent from `demo-20` and `endorsed-173` (enforced by `validate.ts`,
  not asserted in prose) — it was graded once, in cal-014, and never tuned on. It is deliberately the same cover:
  this round is a re-examination of one verdict, not a fresh-cover sample.

## Reproducing

```sh
node --experimental-strip-types build.ts     # rewrites items.json + mapping.private.json
node --experimental-strip-types validate.ts  # exit 0 or it does not ship
```

`validate.ts` asserts: 1 item, 2 sides, distinct variant ids, one shared preprocessing version; the
item id is the slug of its own basename; every colour a lowercase `#rrggbb`; gradient endpoint
identity (`stops[0]` IS the background, the last stop IS the surface, positions strictly increasing,
no gradient beside a collapsed surface) — kept though this round publishes none; collapse flags equal
to hex equality; **the two sides differ in the foreground and in no other role**; the published side
byte-identical to the graded palette and the substituted colour identical to the diagnosis's refused
election; **the declared violation reproduced** from the shipped bytes by the contract's own APCA
path (under ε on both field roles on the waived side, over it on both on the graded side); both
blinding tiers; the image on disk, repo-relative and never tuned on; **every colour on BOTH sides an
exact triple of the artwork, decoded by this file's own `sharp` call** — which on this round is what
rules out a substituted foreground that was typed rather than read; and a deterministic rebuild,
running `build.ts` twice more and byte-comparing both results against the committed files, restoring
them if they disagree.
