# M4 — the selector's elected palette vs the fixed best single member

**Round kind:** pairwise (two blinded sides on the real mock; 4-grade + preference + veto).
**Items:** 8. **Declared purpose:** `mechanism`. **Payload:** `items.json`.
**Decode key:** `mapping.private.json` — never served, never copied into a batch.
**Staging record and caveats:** `STAGING.md`. **Validation:** `validate.ts`, 30/30 PASS.

## 1. The question this round answers

`SPEC.md` §3, verbatim, is the falsifier on the table:

> **F3 — the selector earns nothing:** the selector only matters where members disagree. If, on
> disagreement covers, the reviewer's verdicts do not prefer the selector's choice over the fixed
> best single member (P3 as of its STATE.md), the portfolio adds risk without value. Measured by the
> round protocol in §5.

So: **side A is the selector's elected palette, side B is `p3-fields`'s palette, on eight covers
where they differ materially.** Nothing else is under test. The members are the campaign's own judged
prototypes; the currency that picked between them is what earns or loses its existence here.

## 2. What is in the payload, and why those eight

Every item satisfies all five eligibility rules, re-derived in `select-covers.ts` and re-checked in
`validate.ts`: the elected member is not `p3-fields`; the two served palettes differ at the
contract's own regional bar (`compareRole`, M1's ruler); both members published; the cover is
coverage-set-1, not demo-20, and its stem is the campaign's 40-hex id; and the cover has **not** been
staged in any other prototype's round (13 covers were dropped for that alone — one of them would
otherwise have been an item here with `p5-fieldfit` on side A, and the reviewer has already graded
`p5-fieldfit` on it).

| # | cover (stem tail) | elected (side A) | margin (bits) | band | win fraction / resamples | note |
|---|---|---|---|---|---|---|
| 1 | `…2590bed1b2` | `p2-tree` | **972** | narrow | 0.214 / 14 | **the flip cover** — M3 §3.1 |
| 2 | `…e78a7dda49` | `p5-fieldfit` | 8 053 | narrow | 1.000 / 4 | |
| 3 | `…93d1073d33` | `p5-fieldfit` | 12 173 | mid | 0.875 / 8 | figure/ground class |
| 4 | `…d8a3783eee` | `p2-tree` | 98 724 | mid | 1.000 / 4 | figure/ground class; 3 roles differ |
| 5 | `…757a275520` | `p5-fieldfit` | 116 917 | large | 1.000 / 4 | figure/ground class |
| 6 | `…10224c5ca4` | `p2-tree` | 493 699 | large | 1.000 / 4 | figure/ground class |
| 7 | `…fd71ab8a6b` | `p5-fieldfit` | 1 712 030 | huge | 0.646 / 48 | |
| 8 | `…285a15a23d` | `p2-tree` | 6 283 764 | huge | 1.000 / 4 | figure/ground class |

Composition is the brief's: **4 covers the selector elects `p5-fieldfit` on, 3 it elects `p2-tree`
on, and 1 where the bootstrap-semantics fix flipped the election** (item 1 — the fallback 4/4 split
was not needed). Margins span **972 bits to 6.3 million**, two items per decade band, so a
margin-size read is possible at all. Five of the eight are the two-gradient figure/ground class of
`NOTES-cross-arm.md` note 2 — a served side publishes a gradient field whose figure pair sits farther
from its ground pair than either pair sits from itself.

**One limitation, stated before the round runs.** Item 1 is the cover where the fix changed *which*
member is elected (`p5-fieldfit` → `p2-tree`). This round asks the reviewer to compare the elected
palette with P3's, so it tests the ruling's *output* on that cover, not the flip itself: adjudicating
the flip direction would need `p5-fieldfit` against `p2-tree`, which is a different pair and a
different round. No verdict here will be read as evidence for or against the ruling's direction.

## 3. Pre-registered outcome branches

Scored per item from the pairwise preference: **+1** the selector's side, **−1** P3's side, **0**
no-preference. "Majority" below means a strict majority of the eight items.

**(a) The selector's sides preferred on a majority → F3 survives; the selector earns its existence.**
Next: M5 membership ablations per SPEC §6 — does the portfolio need all three members, and does the
retention rule (arm-c′ free-param 2) delete one? No change to the currency.

**(b) P3's sides preferred on a majority → F3 FIRES.** The portfolio adds risk without value: on the
covers where the selector is the only thing doing any work, the reviewer prefers the single member it
overruled. Reported as **MECHANISM-FALSIFIED** with these verdicts as the evidence, the currency
untouched (no re-tuning: a falsifier that gets "fixed" was decoration). Membership ablations are
cancelled — there is nothing to ablate — and the campaign learns that description length does not
select palettes a human prefers.

**(c) Mixed → the per-cover read against margin size, and the rule is fixed now.** Rank the eight
items by margin ascending — the order in §2 — and split at the median into the four narrower
(972…98 724 bits) and the four wider (116 917…6 283 764 bits). Report each half's net score.

- **Margin-size dependence is declared only if** the two halves' net scores differ by **≥ 4** (two
  items' worth of swing) **and** the wider half's net is positive. That is the pre-registered
  threshold; it is stated here, before any verdict, and it will not move.
- Kendall's tau-b between margin rank and item score is reported beside it as a **descriptive**
  number with no threshold attached, because n = 8 cannot carry one.
- Any other mixed pattern is reported as **"no read at n = 8"**, and the next round is a
  margin-stratified re-run over narrow-margin covers only — where the read rule says the information
  is — rather than a larger mixed round.
- Secondary, reported and not tested: the split by measured decisiveness (five items separated at win
  fraction 1.000, three at 0.214 / 0.646 / 0.875).

**(d) A within-pair family-sharing complaint** — the reviewer objecting that a side gives
background/surface or foreground/accent "the same colour twice" — is handled in
`NOTES-cross-arm.md` note 2's vocabulary: **family separation is evaluated figure-vs-ground, never
within a pair**, and within-pair sharing can be exactly right (the reviewer's own stated ideal on a
two-gradient artwork is two greys and two blues). Such a complaint is recorded as evidence about the
*members'* outputs, not as a defect of the selection, and it does **not** license a family term in
the currency: that would be a new decision outside arm-c′'s eight and would trip F2 as specified.

## 4. The escape, and the blinding

**Every forced choice has one:** the pairwise verdict's preference set is `a | b | no-preference`
(`src/warehouse/records.ts`), and the veto is available per item. `no-preference` is a real answer
here, not a failure: on a cover where both palettes are acceptable the selector's choice cost
nothing, and branch (c)'s scoring reads it as the 0 it is.

**Blinding, disclosed rather than assumed.** `src/review-server/blinding.ts` is explicit that the
salted shuffle is unguessable but *the arms may still be recognisable* whenever they differ
systematically in a served field. On this payload the elected side publishes a gradient on **7 of 8**
items and P3's side on **4 of 8** — overlapping, not separating, but not independent either. The
fixture's own side order is randomized per item from a private salt (elected side first on 5 of 8),
the server re-shuffles with its own salt at push time, and the served fingerprints are neutral and
identical in everything but position. No prototype, round, member or mechanism token appears in any
served string, and the scan that says so is armed against a fabricated leak.
