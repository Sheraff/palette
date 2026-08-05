# M3 — prior comparison, released round: analysis

Batch `phase2-pair-010` (staged as `b-20260805-4a2e`), released 2026-08-05T06:46:17Z by `flo`.
Arm **a** = `p1a`, the mass-normalised prior. Arm **a′** = `p1ap`, the schema-derived
serialization prior. Structured decode in `verdicts.json`; quotes below are verbatim.

## 1. Decode verification — PASS

| check | result |
|---|---|
| installed items are exactly our 8 40-hex itemIds | 8/8, all `^[0-9a-f]{40}$`, set-equal to fixture **and** to `KEY.json` |
| per item, installed variantId set == `KEY.json` variantId set | 8/8 |
| served side order == fixture side order | 8/8 identical (the server did not reorder the array) |
| palette bytes installed == fixture | 16/16 sides byte-identical |
| verdict rows referencing an unknown variantId | 0 |
| verdict rows pairing variantIds from different items | 0 |
| artwork sha256 agrees across KEY / warehouse / both emitter runs | 8/8 |
| `batch-complete` releasedItemIds | 8, matching |

Decode is direct and does not rely on the server's blinding map: every warehouse verdict row
carries `sideA.variantId` / `sideB.variantId` verbatim, joined to `KEY.json`. The server applied
its own per-item A/B shuffle under its own salt (`5ad4a267…`, distinct from our `57a665e7…`);
that map (`blinding` in the batch log) was checked as an independent second path and agrees with
the variantId join on 8/8 items. Served A was arm a on 5 items, arm a′ on 3.

17 verdict rows for 8 items: items 1, 2 and 3 were re-saved 6, 4 and 2 times as the reviewer
typed. **Grades and preference are identical across every revision of every item** — only the
comment grew. The last revision per item is used throughout.

`confound` was false on 17/17 rows. Schema v3.0 has no `veto` field (§6.1).

## 2. Tallies

**Preference (de-blinded).** arm a **4** · arm a′ **2** · none **2**.
Read with care: 5 of 8 are `preferenceSource: "prefilled"` — i.e. the server derived them from
the grade ordering, not from an independent click. Only 3 preferences are `explicit`: two
`no-preference` (items 3, 6) and one for arm a′ (item 8, where both grades were `weak`).
**Explicitly chosen: a 0, a′ 1, none 2.** The 4–2 margin is grade arithmetic restated.

**Grades (final revision, per arm).**

| arm | strong | acceptable | weak | unacceptable |
|---|---|---|---|---|
| a (`p1a`) | 0 | 1 | 4 | 3 |
| a′ (`p1ap`) | 0 | 0 | 2 | 6 |

**15 of 16 sides are weak or unacceptable. Neither arm produced a single `strong` palette.**

## 3. Per item

| # | itemId (tail) | A | B | grade a | grade a′ | pref | quote |
|---|---|---|---|---|---|---|---|
| 1 | `…9d397ba3` | a | a′ | acceptable | unacceptable | a (prefilled) | "there is not red-to-white gradient in the artwork, so this field treatment does not reflect the artwork" / "accent and foreground are impossible to distinguish on top of the surface" |
| 2 | `…76a6b67d` | a | a′ | weak | unacceptable | a (prefilled) | "those 2 palette proposals are missing too much of the artwork's identity. The artwork has 4 colors (white, yellow, red, black), and the background is yellow." |
| 3 | `…6cb6dd7d` | a′ | a | unacceptable | unacceptable | none (explicit) | "missing the significant magenta from the artwork\nincorrect background" |
| 4 | `…8479200b` | a | a′ | weak | unacceptable | a (prefilled) | — |
| 5 | `…ac790164` | a | a′ | unacceptable | weak | a′ (prefilled) | — |
| 6 | `…256ce593` | a′ | a | unacceptable | unacceptable | none (explicit) | — |
| 7 | `…279e9184` | a′ | a | weak | unacceptable | a (prefilled) | — |
| 8 | `…798808bf` | a | a′ | weak | weak | a′ (explicit) | — |

Free text exists on 3 of 8 items only; the other 5 are grades alone.

## 4. Reading against the pre-registered classes

**(a) Unreadable foreground → `DESIGN.md` fold item 1 falsifier. FIRES — 1 item in words, 2 more
in grades.** Item 1, arm a′: *"accent and foreground are impossible to distinguish on top of the
surface"* (`#e9e6dd` ink over `#e0e4e5` surface; our own reported min-|APCA| = **2.55** over the
rendered ramp). This is the pre-registered wording, on our output, under current priors. Fold
item 1 states the consequence in advance: it falsifies the ink-recovery story, not the tuning.
Two silent corroborations, graded not written: item 5 arm a is `#feffff` on `#d9e2e1`
(min-|APCA| 20.7) → `unacceptable`; item 3, both arms, is `#000000` on `#363634` (min-|APCA|
8.84) → `unacceptable` on both sides. Per fold item 10 the diagnostic is not itself the finding,
so the load is carried by item 1's sentence; the graded pair is consistent with it, not proof.
Honest status for this class: **MECHANISM-FALSIFIED on one item's words**, pending the reviewer's
own reading.

**(b) Salience / shadow (fold item 8). DOES NOT FIRE.** No verdict names a shadow or an
incidental region. Item 3's *"incorrect background"* (both arms published `#363634` dark grey)
is the nearest candidate and is recorded as unresolved — the complaint names the background, not
its provenance. No evidence either way on this round.

**(c) Accent same-family (fold item 14). DOES NOT FIRE — and the control says something worse.**
No same-family complaint appears. Item 3 was the pre-registered minimal-diff control: background,
surface and foreground byte-identical, **only the accent differs** (`#000000` collapsed onto the
foreground vs. `#fafdff` as a separate fourth colour). The reviewer graded both sides
`unacceptable`, chose `no-preference` explicitly, and complained about neither accent. The accent
axis moved the verdict by exactly zero.

**(d) Missing chromatic colour / identity-coverage (fold item 11). FIRES — 2 items, both arms.**
Item 2: *"those 2 palette proposals are missing too much of the artwork's identity. The artwork
has 4 colors (white, yellow, red, black), and the background is yellow."* (arm a published
yellow-on-white, arm a′ published black/grey/white — red appears in no role on either side).
Item 3: *"missing the significant magenta from the artwork"*. Both complaints are levelled at
**both** arms at once. This is every free-text complaint in the round except the two in item 1:
identity-coverage is the reviewer's dominant currency here, and neither prior prices it.

**(e) Item `…0bbc3367a621256ce593` — the gradient-on-flat probe (fold item 4). NO SIGNAL.**
Arm a′ published a two-stop same-hue-family ramp `#435df0 → #1016f0`; arm a published the
identical blue flat. Both `unacceptable`, `no-preference` explicit, **no comment — the ramp was
not named.** The clean probe returned nothing, so λ gets no calibration from it (fold item 7:
direction only, never grade arithmetic). The gradient class instead fired on item 1, where a′'s
ramp *was* named and rejected — *"there is not red-to-white gradient in the artwork"* — on an
item where all four roles change at once, so it is direction-only evidence that λ is too low for
a′. Countervailing: item 5's a′ ramp (`#d9e2e1 → #70ba27`) was the round's better side (`weak`
vs `unacceptable`) and drew no gradient complaint. Consistent with fold item 12 (errors in both
directions); no λ move is supported. Fold item 13 holds: all three a′ ramps here are 2-stop.

**(f) Coverage-vs-identity vs. M1 (`DESIGN.md` M1 OUTCOME). CORROBORATED, and sharply — but the
within-arm direction is the finding, not the between-arm one.** Between arms, the arm explaining
more mass *won*: `p1a` explains 100% of mass by construction (soft field/ink membership) against
`p1ap`'s 0.1–40%, and `p1a` took the 4–2 margin. That is not the M1 pattern. **Within `p1ap` it
is exactly the M1 pattern.** Sorting a′'s eight palettes by mass explained against its own grade:

| a′ mass explained | 40.0% | 26.3% | 12.5% | 5.2% | 2.7% | 1.2% | 0.9% | 0.1% |
|---|---|---|---|---|---|---|---|---|
| grade | unacc | unacc | unacc | unacc | unacc | **weak** | **weak** | unacc |

Its two best-graded palettes are its two *least*-covering; its three most-covering are all
unacceptable. `genericBits` is 78–99.9% of a′'s total energy on all 8 items. M1's attribution —
*"the residual pays for coverage, the reviewer pays for identity"* — reproduces on fresh palettes
under current priors, which is what M1 said had to wait for M3.

## 5. The consequential finding for the two-prior experiment

**No winner is declarable, and the round's real result is that both priors fail the reviewer at
the same place.** Per `ROUND.md`'s pre-registered reading the outcome is *Mixed* (4/2/2, and the
margin is 5 prefilled preferences deep), so the mixed branch applies and neither energy is
carried into M4 on this evidence. Under that branch the per-cover read is unambiguous: every
free-text complaint in the round is either a missing distinct chromatic colour (items 2, 3, both
arms) or indistinguishable inks (item 1), and **neither prior has a term for either axis**. The
4–2 margin is additionally degenerate as a comparison — `p1a` published `surfaceCollapsed &&
accentCollapsed` on **8 of 8** items, i.e. two colours every time. It wins by publishing less
structure and therefore committing fewer visible errors, not by being right: it still took 3
`unacceptable` and 0 `strong`. Choosing `p1a` on this round would be selecting the degenerate
arm. The pre-registered `MECHANISM-FALSIFIED` status from fold item 1 is live (§4a) and is the
first item for the reviewer, ahead of any prior choice.

## 6. Deviations from the round plan

1. **No veto channel.** Schema v3.0 pairwise verdicts carry no `veto` field, so ROUND.md's
   "in a grade, a veto, or free text" reduced to grades and free text.
2. **5 of 8 preferences are server-prefilled**, not independently expressed. Every conclusion
   above is stated on grades; the preference tally is reported but not leaned on.
3. **Free text on 3 of 8 items.** Classes (b) and (c) are unresolved by absence of comment
   rather than falsified, and are recorded as such.
4. **The fold item 6 read is unavailable.** The F/A swap diagnostic reports `delta: 0` on all 4
   items where the swap was feasible (collapsed accents made it infeasible on the other 4). That
   is expected by construction — `DESIGN.md` decision 3 puts v0's F/A ordering *outside* the
   minimisation — so the diagnostic cannot distinguish near-ties and carries no information this
   round. Flagged for M4.
5. **No λ inference drawn** from item 1's named false gradient, per fold item 7.
