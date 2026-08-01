# Essentially-zero foreground/surface contrast — measurement report

**Arm:** `apca-zero-floor` · **Base:** `5d99fa6` · **Date:** 2026-08-01

**Status: a hypothesis under evaluation, not a settled rule.** Flo's words are *"i'm not 100 % sure
of this rule, I want to see what the consequences would be first."* The mechanism below exists so
the consequences can be measured; it is committed **off**, and nothing here argues that it should be
turned on. The census and the mover list are the product.

**Corpus for every number:** the unscrambled shared checkout `/Users/Flo/GitHub/palette` — the
sharded caches `00/`..`14/` (21 hex directories) plus `images/`, minus the `-scrambled` decoys and
minus the four vetoed artworks (`06eb2197…`, `148e0886…`, `000f9f4b…`, `0011c1dc…`). That is
**7,585 files / 6,941 distinct artworks** once the two stored resolutions of the same cover are
collapsed. The worktree's own `images/` (decoys only) was never read; every harness prints the
resolved root.

---

## Headline — the consequences, in six lines

1. **The defect is real and reproduces exactly.** APCA foreground-on-surface is `0.0000` on the
   founding artwork, while the two colours are CIE76 ΔE 94 apart. The review UI draws that pair as
   flat text on a flat panel (`.surface-card { color: var(--foreground); background: var(--surface) }`).
2. **It is a small class, not a freak: 14 artworks in 6,941 (0.20 %).** All 14 are gradients; 13 of
   them are invisible to the existing ΔE 3.3 rule, so no tightening of that rule would find them.
3. **The threshold question answers itself.** APCA cannot report any magnitude between 0 and 7.30
   (measured over 16 M luminance pairs), so every bar in that band is the same bar and none of them
   is tuned.
4. **A bar inside that band costs nothing review has endorsed — and the very next step does.** At
   any bar ≤ 7.3, **0** reviewed palettes are refused. At a bar of 9, the first casualty is
   `loups.jpg`, graded **strong**, sitting at Lc −8.44. Charter constraint 2 is not a slogan here;
   it is one artwork wide.
5. **But the rule's blast radius is dominated by collateral: 148 artworks move (2.13 %) to fix 14.**
   134 of the movers never had the defect — they move because refusing candidates upstream changes
   what the capacity-bounded materialization admits. 53 movers end up with *less* contrast than
   before; 25 lose a gradient midpoint.
6. **It disturbs three verdict-backed outcomes — two graded `strong`, one `acceptable` — none of
   which had the defect.** No destination is a known-worse palette (none has ever been shown), so by
   the charter this is reviewable movement rather than regression. It is still the price.

7. **The narrow repair kills the cascade completely — verified, not derived.** Applying the same rule
   *last*, to the finished winner, instead of *first*, to the candidate domain: over the full 7,585
   artworks under the widest configuration, **327 move and 0 of them lacked the defect**. The
   text-only configuration moves **15** — exactly the 15 that carry it, against the wide guard's 149
   — and **disturbs no reviewed palette at all**.
8. **But narrowness costs repair quality on exactly the case Flo cares most about.** The wide guard
   fixes the founding artwork by deepening the *surface* so the yellow can stay as text, which is
   Flo's stated bar. The narrow repair may not touch the field — that prohibition is *why* there is
   no cascade — so it gives the yellow up and puts washed-out peach on pale blue at raw 11.3. It
   rescues `099b3a` cleanly and 12 others like it; it is weak wherever the field is the thing that
   is wrong.
9. **The swap tier is dead, provably.** Once a repair may not relocate a zero onto the accent,
   exchanging the two mark roles can never be valid — the accent inherits the offending colour on
   the same field. `swap = 0` across 330 artworks and six configurations. The mechanism is entirely
   new machinery, not the swap we already trust.
10. **Raw APCA shrinks the problem.** The clamped zero bucket hides a continuous range: no
    foreground-surface case is at truly identical lightness (smallest raw 1.19), and a floor stated
    at **raw 3** would catch 5 of 14 while keeping both artworks Flo named.

> **Superseded in part by §15.** Review has since run the repair batch and preferred it on all four
> items, so the rule is wanted. §15 records what changed after that: the midpoint joined the
> protected set, a full-palette re-pick tier was added, and the blast radius was re-measured. The
> recommendation immediately below is kept as written because it was made before that verdict; the
> current one is at the end of §15.3 and §15.4.

**My recommendation, in two parts.**

**Do not turn the wide guard on.** It is correct about the pathology and its threshold is genuinely
un-tuned, but a 10:1 collateral-to-fix ratio that reaches two reviewed-strong palettes is a bad trade
for 14 unreviewed artworks.

**Do not turn the narrow repair on yet either — but for a different and more tractable reason.** It
solves the problem the wide guard had: no cascade, no reviewed palette touched, minimal disturbance
(only the foreground moves on 13 of 15). What it has not yet earned is the *quality* bar, and Flo's
own read of the wide-guard batches said quality is what decides this. On the evidence here the narrow
repair produces a clear save on the unusable cases and a mediocre palette on the founding case. My
honest read is that **the strongest configuration to put in front of review is `fg-surface` combined
with a raw floor of about 3** — that is roughly 5 artworks, the ones that are genuinely unreadable
rather than merely faint, which is where the saves are and where the mediocre repairs are not. The
`fg-both` and accent tiers should wait for a verdict on that smaller set.

The batch I would serve: `099b3a` (the save), `07d4cb` (the founding case, narrow vs wide side by
side — they differ and Flo should pick), `0a9ef1` and `0ed8ed` (raw 1.4 and 1.9, the other genuinely
invisible ones), and `02/20d4f` (raw 6.5, a faint case where the repair costs warmth — the argument
against going wider).

---

## 1. The founding case, reproduced

`07/ab67616d0000b2730007d4cb364e04df68f6e2c1`, on the committed base, produces exactly the reported
palette:

| | background | surface | foreground | accent | field | midpoint |
| --- | --- | --- | --- | --- | --- | --- |
| published | `#058cde` | `#d2e0eb` | `#fed700` | `#fbb89d` | gradient | `#089be0` |

**APCA foreground-on-surface = `0.0000` (exactly zero).** For contrast:

| pair | APCA Lc | CIE76 ΔE |
| --- | --- | --- |
| **foreground on surface** | **0.0000** | **94.00** |
| foreground on background | −44.73 | 140.71 |
| accent on surface | +10.48 | 39.09 |
| accent on background | −33.57 | 80.48 |

The winner id carries no rewrite prefix, so this is a straight `createTreatment` output.

**This is a flat, large-area pair, not a thin gradient crossing.** The review UI renders it
literally: `review-app/styles.css` `.surface-card { color: var(--foreground); background:
var(--surface); }`. Yellow text on a pale-blue card, over the whole panel. The hue-conditional
exemption an earlier arm established for mid-gradient sign flips does not reach this case, and Flo
has confirmed that reading.

Note the ΔE column. The foreground is **ΔE 94 away from the surface** — about as far from "the same
colour" as two colours get — while APCA reports no contrast at all. That combination is the whole
subject of this report.

## 2. Why nothing currently stops it

Two independent gaps, and the second is why the existing fix for the *background* side did not
generalise.

1. **The observability gate is a maximum, never a minimum.**
   `hasPeakAPCAObservability` (`palette-core.ts:4607`) is `values.some(…)` over the field samples.
   For a gradient those samples are the five ramp positions `[0, .25, .5, .75, 1]`, where position 1
   *is* the surface. The founding case measures `−44.73, −41.68, −38.90, −18.87, 0.00`: it passes on
   the background end while sitting at zero on the surface end. `pathObservability`
   (`palette-core.ts:4611`) computes the *fraction* of samples that clear the bar and would see
   this — but it is only ever a score, never a gate.

2. **The one perceptual field gate is background-only, and asks a different question.**
   `distinctness.foregroundField` (ΔE 3.3) is read at exactly two places, `createTreatment:4856` and
   `validateTreatment:4808`, and both compare the foreground with the **background**. The only
   foreground↔surface test anywhere is `createTreatment:4850` / `validateTreatment:4800`, and it is
   `sameColor` — **exact byte equality**.

Track Q installed the ΔE rule on the background side and recorded, in its own change table, that
*"the surface-side byte test is untouched."* This report is the measurement of what that left open.
**The two rulers are independent**: colour distance answers *are these the same colour*, APCA
answers *can this be read on that*. A pair at ΔE 94 with Lc 0 defeats the first and is invisible to
the second's peak form. Neither subsumes the other, so this class was never reachable by tightening
`foregroundField`.

## 3. APCA cannot report a contrast between 0 and 7.3 — which decides the threshold question

Before choosing any bar, it matters what APCA's output can even look like near zero.
`apca-shape.mjs` and `apca-gap.mjs` measure it rather than assume it. Sweeping **16,008,001**
luminance pairs across the whole `[0, 1]` range (APCA's result depends on nothing but the two
luminances, so this covers every possible pair of colours):

```
smallest non-zero |Lc| anywhere: 7.300001
pairs reporting 0 < |Lc| < 7:    0
```

APCA-W3 clips small results to exactly zero and subtracts a constant offset from what survives, so
its output is **discontinuous**: exactly `0`, then nothing until `7.30`. Concretely, at a mid-grey
background a luminance step of 0.08 still reports `0.0000` and 0.12 reports `−7.56`.

Three consequences, all load-bearing:

- **The brief's first three census bars cannot disagree.** `|Lc| < 2`, `< 5` and `< 7` name exactly
  the same set as `|Lc| == 0`. They are reported separately below and they are identical by
  construction, not by coincidence.
- **A threshold anywhere in (0, 7.3] is not a tuned number.** Every value in that band selects the
  same treatments, so the choice inside it cannot change an outcome. This is the same shape of
  argument `distinctness.foregroundField` makes for ΔE 3.3 sitting in an empty band.
- **Such a bar cannot become an accessibility floor** (charter constraint 2). It sits *below the
  smallest contrast APCA can express*, so the deliberately-low reviewed outputs — Lc ≈ 9 graded good
  — are above it necessarily rather than by luck.

## 4. Census — is the founding case a freak or a class?

**A class, but a small one: 14 artworks in 6,941 (0.20 %).** Not a freak — the founding case is not
even the most extreme member — and not a widespread failure either.

7,585 files extracted, **0 extraction failures**, 6,941 distinct artworks after collapsing the two
stored resolutions of the same cover.

| bar | foreground on **surface** | foreground on **background** | accent on **surface** |
| --- | --- | --- | --- |
| `\|Lc\| < 2` | **14** (0.20 %) | 23 (0.33 %) | 144 (2.07 %) |
| `\|Lc\| < 5` | **14** (0.20 %) | 23 (0.33 %) | 144 (2.07 %) |
| `\|Lc\| < 9` | 29 (0.42 %) | 40 (0.58 %) | 346 (4.98 %) |
| `\|Lc\| < 15` | 104 (1.50 %) | 111 (1.60 %) | 1070 (15.42 %) |
| exactly `0` | **14** | 23 | 144 |

The first two rows are identical to the "exactly 0" row **by construction**, not by accident — see
§3. Restricting to the 5,504 artworks whose surface is a genuinely distinct colour from the
background changes nothing material (14, still 0.25 %).

**All 14 are gradient palettes.** Every one reaches zero at ramp position 1, which is the surface
endpoint, and passes the observability gate on the strength of position 0.

**13 of the 14 are invisible to the existing ΔE 3.3 ruler.** Only one has a foreground within ΔE
3.3 of its surface; the rest span ΔE 5.8 to 94.0. This is the measurement behind §2's claim that
the two rulers are independent — a surface-side copy of `distinctness.foregroundField` would catch
one of these fourteen.

The five worst by colour distance (i.e. the cases where "same colour" reasoning is most obviously
inapplicable):

| artwork | background | surface | foreground | accent | fg/surface ΔE |
| --- | --- | --- | --- | --- | --- |
| `07/…0007d4cb…` *(founding)* | `#058cde` | `#d2e0eb` | `#fed700` | `#fbb89d` | **94.0** |
| `13/…00137159…` | `#0c223a` | `#038faa` | `#7e8dce` | `#fbfdf8` | 35.3 |
| `0d/…000d9c3f…` | `#b0b4bf` | `#35383d` | `#171008` | `#444b55` | 20.0 |
| `02/…00020d4f….jpg` | `#ebd4ce` | `#1f1e1a` | `#443427` | `#73503c` | 15.4 |
| `0f/…000ff032…` | `#d2d4d3` | `#292d2c` | `#0e100f` | `#555756` | 13.6 |

The remaining nine are `0a/…000a9ef1…`, `06/…00061f80…`, `07/…00072f74…`, `08/…0008dfd3…`,
`05/…000527ac…`, `12/…00126c1c…`, `09/…00099b3a…`, `0e/…000ed8ed…`, `09/…00098f6f…` — the full
table with every number is reproducible with `analyse.ts`.

### 4b. The same defect in the pairs the rule does not name

The surface panel carries the **accent** as text too — `review-app/app.js` puts an `.accent-copy`
element inside `.surface-card` — and the foreground is drawn on the background as well. Asking the
identical question of all four pairs:

| pair | artworks at exactly zero |
| --- | --- |
| foreground on surface *(the pair the rule names)* | **14** (0.20 %) |
| foreground on background | 23 (0.33 %) |
| accent on surface | 144 (2.07 %) |
| accent on background | 133 (1.92 %) |
| **foreground on *either* field endpoint** | **37** (0.53 %), overlap 0 |
| any of the four | 305 (4.39 %) |

**The background side is the larger foreground problem, not the smaller one**, and the two sets do
not intersect at all. One of the 23 is an on-panel reviewed fixture, `images/birdsofprey.jpg`
(`bg=#141975 surface=#3fa72a fg=#030102`, fg/background Lc 0.00 at ΔE 63.4) — the text is
invisible against the background end of its gradient. Track Q's ΔE rule cannot see it, for the same
reason it cannot see thirteen of the fourteen surface cases.

This is scope information for the decision, not a proposal: **the mechanism built here deliberately
implements only the pair Flo named.** Widening it to either endpoint would roughly 2.6x the blast
radius; widening it to the accent as well would 20x it.

## 5. The mechanism, and how to vary it

Two constants in `palette-core.ts`, beside the code they govern, in the established flag style
(`GAMUT_COVERAGE_FIELD_GUARD`, `TEXT_ROLE_RESTRICTION`):

```ts
export const FOREGROUND_SURFACE_ZERO_CONTRAST_GUARD = false   // off: byte-identical to base
export const MINIMUM_FOREGROUND_SURFACE_ABSOLUTE_LC = 1       // the bar; vary this
```

and one predicate, `foregroundIsUnreadableOnSurface(foreground, surface)`, which returns `false`
outright while the flag is off.

**To vary the threshold, change `MINIMUM_FOREGROUND_SURFACE_ABSOLUTE_LC`.** Any value in (0, 7.3]
means "exactly zero"; values above 7.3 begin refusing real measured contrast. §6 reports what each
bar would cost without needing a re-run.

Three sites, the first two mirroring the existing `foregroundField` filter/invariant convention
exactly:

| site | file | shape |
| --- | --- | --- |
| candidate filter | `palette-core.ts` `createTreatment` | `return null` — the treatment never enters the domain |
| published invariant | `palette-core.ts` `validateTreatment` | `throw` — unreachable while the filter holds, stated so the guarantee is readable off the output |
| swap decline | `text-role-restriction.ts` `restrictTextRoleToStrongestClaim` | `return winner` — declines the exchange |

**The third site is not decoration, and finding it was the main surprise.** `swapMarkRoles` exchanges
the foreground and accent *after* ranking, and no validity gate ever sees its result. With only the
first two sites installed, one artwork in the corpus still published a zero-contrast palette by
exactly that route — `08/ab67616d0000b2730008dfd3663a999bc759f2c2`, whose winner id read
`text-role-swap:…`. The arrangement that passed every gate had the cream `#f1dac8` as text
(Lc −70.08); the swap handed the role to `#5f3620`, which is Lc 0.00 on that surface. Declining the
swap is the conservative repair: the pre-swap arrangement is the one already known good.

The other post-ranking rewrite, `applyGradientSupport`'s flat fallback (`palette.ts:310`), changes
only the `gradient` flag and carries the four colours over unchanged, so it cannot create this
pathology. It was checked, not assumed.

## 6. What each candidate threshold would cost

**This is the decision table.** An artwork whose published palette already clears a bar cannot be
refused by it, so the guard-off census names the entire affected population for every bar without a
re-run. "Reviewed" counts artworks where a human has graded *the exact palette currently published*.

| bar `\|Lc\|` | artworks refused | reviewed palettes refused | of those **strong** | acceptable | weak-fallback |
| --- | --- | --- | --- | --- | --- |
| **1** (= 2 = 5 = 7) | **14** | **0** | **0** | 0 | 0 |
| 9 | 29 | 1 | **1** | 0 | 0 |
| 12 | 68 | 1 | **1** | 0 | 0 |
| 15 | 104 | 1 | **1** | 0 | 0 |
| 20 | 186 | 1 | **1** | 0 | 0 |
| 30 | 445 | 9 | **7** | 1 | 1 |
| 45 | 1051 | 27 | **18** | 6 | 2 |
| 60 | 1965 | 43 | **30** | 9 | 2 |

**The cliff is exactly where charter constraint 2 predicts, and it is one artwork wide.**

At any bar inside APCA's empty band — 1, 2, 5, 7 — **no reviewed palette is refused at all**. Raise
the bar to 9 and the first casualty appears immediately: **`loups.jpg`, graded `strong`, whose
published foreground/surface contrast is Lc −8.44** (`bg=#fa7b34 surface=#ebda8a fg=#fde5d9
accent=#fc8831`). That is Flo's "Lc ≈ 9 palettes have been rated good" showing up as a measured
artwork rather than a remembered principle — and it sits 1.14 Lc above the floor APCA can express.

So the corpus draws the line for us. There is a bar that removes the pathology and costs nothing
review has endorsed, and it is *any* bar at or below 7.3. The first step beyond that band costs a
reviewed-strong palette. Nothing in this data supports a bar above 7.3, and the mechanism's default
of `1` is chosen for being unambiguously inside the band rather than for its value.

One caveat on the "reviewed" column: only 196 of 6,941 artworks carry review records, so these
counts are a lower bound on what a bar would disturb among palettes a human would like. They are
not a lower bound on the *ranking* of the refused set, which is the point — the refused set at bar
1 contains nothing anyone has ever endorsed.

## 7. Blast radius with the guard on

Full corpus re-extracted with `MINIMUM_FOREGROUND_SURFACE_ABSOLUTE_LC = 1`, diffed against the
guard-off census artwork by artwork.

| | count | share |
| --- | --- | --- |
| artworks compared | 6,941 distinct (7,585 files) | |
| **artworks that move** | **148** | **2.13 %** |
| ⤷ **direct** — the old palette carried the defect | 14 | 0.20 % |
| ⤷ **cascade** — the old palette was already fine | 134 | 1.93 % |
| published palettes still at zero contrast | **0** | |
| extraction failures (domain emptied) | **0** | |

**The headline cost is the cascade: roughly ten artworks move for every one that is fixed.**

The guard refuses candidates in `createTreatment`, which is upstream of materialization. Refusing a
candidate that was *never going to win* still changes what the capacity-bounded materialization
stage admits, and therefore what ranking sees. So an artwork with no defect at all can land on a
different winner because some other candidate in its domain was unreadable. This is not a
side-effect that can be tuned away by moving the threshold — the threshold cannot move (§3) — and it
is the main reason this report does not recommend switching the flag on.

What moves, across the 149 changed files: background on 122, surface on 129, foreground on 57,
accent on 75, the gradient flag on 4. **25 lose a source-supported midpoint** and 11 gain one. And
**53 movers end up with *less* foreground/surface contrast than before** (still non-zero) — the
guard is not monotonically improving contrast, it is changing which candidate wins.

### The founding case

| | background | surface | foreground | accent | field | midpoint | fg/surface |
| --- | --- | --- | --- | --- | --- | --- | --- |
| off | `#058cde` | `#d2e0eb` | `#fed700` | `#fbb89d` | gradient | `#089be0` | **Lc 0.00** |
| on | `#058cde` | `#64b4e5` | `#fed700` | `#fdbca0` | gradient | none | **Lc −25.87** |

The surface moves from the near-white pale blue to a mid-blue, the yellow text stays, and the
gradient survives. The destination has never been shown to a reviewer.

**And the founding artwork's only warehouse record is Flo's own complaint** (line 447, `cs2-batch`):
this palette was side B of an A/B, it **lost**, and the note says why — *"I think the sunbeam
foreground and the bare mintimum surface have an APCA contrast of zero which is against our rules.
For this reason alone I have to give the upper hand to option A."* The winning side was
`cs2-on` = `bg=#058cde surface=#fed700 fg=#171c1f accent=#fbb89d`, **flat**, graded `acceptable`.
The same note also says *"The gradient in option B could actually be nice."*

Two consequences worth separating:

- The guard produces a **third** palette — a gradient with readable text — which is neither the one
  that lost nor the one that won. It is unadjudicated, and it is the natural review item.
- **The `cs2-batch` result is confounded on this item.** That batch went 8:2 for `cs2-off`, and this
  artwork is one of the two `cs2-on` wins, decided (in Flo's own words) by this defect alone. With
  the defect gone the comparison would need re-running; it plausibly becomes 9:1. That is the
  chromatic-surface arm's business, but it should know.

### Movers checked against the warehouse

Of 148 movers, **3 have a recorded verdict on the palette they are leaving** — and all three are
*cascade* movers, i.e. none of them had the defect:

| artwork | verdict(s) on the palette being left | off → on | destination |
| --- | --- | --- | --- |
| `03/…00034b1c….jpg` | **strong ×3** (`bf-on`/batch-bf-1, `showcase-b` and `showcase`/showcase-1) | bg `#273d77`→`#143471`, surface `#281832`→`#03010c`, midpoint `#0a0718`→`#2c0e26` | never shown |
| `08/…00081dec…` | **strong** (`trunk-b7`/review-14-b2) | bg `#6c7487`→`#56667f`, surface `#c7b9b6`→`#a0acb8` | never shown |
| `11/…00113e35…` | **acceptable ×3** (`vivid-series-incumbent`, `calib-4b`, `calib-4`) | bg `#98aad2`→`#adbbd6`, surface `#c8d1e0`→**`#f6edac`**, accent `#e7e38c`→**`#da2723`**, midpoint none→`#b5c4db` | never shown |

**Stated plainly, because it is what the decision turns on: this rule moves two palettes Flo graded
`strong` and one graded `acceptable`, and none of them had the defect the rule exists to fix.**

The first two are modest shifts within the same dark colour scheme. The third is not: its surface
goes from pale blue to pale yellow and its accent from soft yellow to a hard red, which is a
different-looking treatment, and it acquires a midpoint it did not have.

Per the charter's guardrail semantics this is *reviewable movement* rather than automatic
regression — no destination is a known-worse palette, because no destination has ever been shown to
anyone. **No mover's new palette matches any recorded correction.** But three verdict-backed
outcomes being disturbed by a rule that fixes fourteen unreviewed artworks is a real price, and it
is the reviewer's call whether it is worth paying.

## 8. Verification

- **Byte-identity with the flag off — `GATE PASS: 108/108 byte-identical.`** The perf-pass-2 gate
  (`research/v2-3-experiments/perf-pass-2/harness/gate.mjs`) re-dumps the canonicalised *complete*
  `extractPaletteDetails` return value — every score, not just the four hexes — for the 108-entry
  gate corpus (34 on-panel + 34 scrambled + 37 off-panel, `PALETTE_IMAGES_ROOT` pointed at the
  shared checkout) and diffs it against a baseline dumped from the untouched base commit before any
  edit was made. Run against the final three-site mechanism.
- **A second, broader flag-off check** — the census was re-run on the working tree with the flag off
  and compared field-for-field (four hexes, gradient, midpoint, collapse, all four APCA pairs and
  every recorded field-sample contrast) against the census taken from the pristine base:
  **identical on all 874 artworks** before the run was stopped. This is a weaker canonicalisation
  than the gate but a much wider corpus, and the two together are the byte-identity claim.
- **Typecheck** — `tsc -p research/v2-3/tsconfig.json` clean.
- **Architecture test** — both invariants pass; the runtime carries no case ID, fixture path, source
  hash or expected colour.
- **Configuration test** — all 12 assertions pass, including *"charter rule 2: the APCA hard minimum
  defaults to zero"*. The mechanism does not touch `contrast.hardMinimum`.
- **Determinism** — the founding artwork extracted twice in one process gives an identical winner
  and an identical treatment id.
- **No emptied domains** — 0 extraction failures across 7,585 files with the guard on, so refusing
  these candidates never strands an artwork without a legal palette.
- **The guard achieves what it claims** — 0 published palettes remain at exactly zero
  foreground/surface contrast with it on (it took the third site, §5, to get there).

### The narrow repair, verified separately

- **Byte-identity with everything off — `GATE PASS: 108/108 byte-identical`**, run again against the
  same pristine baseline after the repair, the pair-generic rewrite and the raw APCA addition. The
  repair publishes no new field on the extraction for exactly this reason; its outcome is recorded in
  the winner's `id` prefix, where trunk already records every post-ranking rearrangement.
- **No cascade, measured over the whole corpus rather than argued from the entry test.** Full 7,585
  artworks under the widest configuration (all four pairs): **327 movers, 0 of which lacked the
  defect.** The wide guard's equivalent number was 134. `reports/no-cascade-check.txt`.
- **No relocation.** 0 repaired artworks gain a new zero in a protected pair, in every one of the six
  configurations. `reports/relocation-check.txt`.
- **The raw form matches the vendored library** on all 65,536 8-bit grey pairs, with 0 disagreements
  even at APCA's `deltaYmin` early return. Pinned in `configuration.test.ts` and reproduced in
  `reports/raw-apca-check.txt`.
- **0 extraction failures** across every configuration; the repair never strands an artwork.
- **Level 3 publishes trunk unchanged** — verified byte-identical on all 3 declined artworks.

### Reproducing

```sh
# census, either arm (flip FOREGROUND_SURFACE_ZERO_CONTRAST_GUARD for the second)
node --experimental-strip-types research/v2-3-experiments/apca-zero-floor/census-run.ts --workers 4 --out <dir>
node --experimental-strip-types research/v2-3-experiments/apca-zero-floor/analyse.ts
node --experimental-strip-types research/v2-3-experiments/apca-zero-floor/threshold-sensitivity.ts
node --experimental-strip-types research/v2-3-experiments/apca-zero-floor/sibling-pathologies.ts
node --experimental-strip-types research/v2-3-experiments/apca-zero-floor/blast-radius.ts --off <dirA> --on <dirB>
node research/v2-3-experiments/apca-zero-floor/apca-gap.mjs        # the (0, 7.3) hole
```

`data/census/` and `data/census-guard-on/` hold both full sweeps, one JSON line per artwork, so
every number above can be re-derived without re-extracting anything.

`reports/` holds the rendered output of each tool, so the findings can be read without running
anything at all:

| file | contents |
| --- | --- |
| `reports/census.txt` | the distribution and all 14 zero-contrast artworks with their palettes |
| `reports/threshold-sensitivity.txt` | the decision table of §6, plus every reviewed palette each bar would refuse |
| `reports/blast-radius.txt` | **all 149 movers with their off→on role diffs and warehouse cross-reference** |
| `reports/sibling-pathologies.txt` | the same defect in the three pairs the rule does not name |
| `reports/apca-gap.txt`, `reports/apca-shape.txt` | the measurement of APCA's (0, 7.3) hole |
| `reports/raw-zero-bucket.txt` | **what is inside the clamped zero bucket**, per pair, on the raw scale |
| `reports/repair-summary.txt` | the narrow repair's blast radius and level distribution, all six configurations |
| `reports/repair-movers-text.txt` | every text-pair mover, trunk → repaired, with raw before/after |
| `reports/repair-movers-accent-only.txt` | the accent tier's 297 movers, kept separate |
| `reports/exemplars.txt` | `07d4cb` and `099b3a` across trunk, wide guard and all six configurations |
| `reports/level-three.txt` | the artworks the repair declined to force |
| `reports/no-cascade-check.txt`, `reports/relocation-check.txt` | the two claims that had to be verified rather than derived |
| `reports/raw-apca-check.txt` | the raw form checked against the vendored library |

The narrow repair's sweeps are reproducible with:

```sh
node --experimental-strip-types research/v2-3-experiments/apca-zero-floor/affected-jobs.ts
node --experimental-strip-types research/v2-3-experiments/apca-zero-floor/repair-run.ts \
  --jobs research/v2-3-experiments/apca-zero-floor/data/affected-jobs.txt --out <dir>
node --experimental-strip-types research/v2-3-experiments/apca-zero-floor/repair-run.ts \
  --configs all-four --out <dir>        # the full-corpus no-cascade pass
```

## 10. The narrow repair — same rule, applied last instead of first

The wide guard's cost is entirely cascade: it refuses candidates in `createTreatment`, upstream of a
capacity-bounded materialization stage, so refusing a loser still changes what the winner is chosen
from. The narrow form removes that by construction. Generation, materialization, ranking, selection,
the flat fallback and the mark-role swap all run untouched and produce the same winner; the repair
then inspects that winner and mends it only if it actually carries the defect.

`research/v2-3/src/internal/zero-contrast-repair.ts`, configured by two sets:

```ts
export const ZERO_CONTRAST_REPAIR_PAIRS: readonly ZeroContrastPair[] = Object.freeze([])   // empty = off
export const ZERO_CONTRAST_PROTECTED_PAIRS: readonly ZeroContrastPair[] = ZERO_CONTRAST_PAIRS
```

`enforced` is what triggers a repair and must come out clean. `protect` is what a repair may never
*newly* break. Keeping them separate is what lets the accent's status be stated honestly rather than
assumed — see §13.

### The acceptance rule, and why the swap tier is dead

Flo caught the flaw in a swap-first hierarchy: **exchanging the two mark roles does not remove a
zero, it relocates it.** The accent inherits the exact colour that was unreadable against the
surface. Checking only the pair that was broken accepts that; checking the whole palette refuses it.

The first implementation checked only the *enforced* pairs, which is not enough, and the corpus said
so immediately:

| configuration | repairs made | that relocated the zero into an unprotected pair |
| --- | --- | --- |
| fg-surface | 15 | **13** |
| fg-both | 39 | **31** |
| accent-only | 298 | **290** — onto the *text* role |

The accent-only row is the alarming one: the swap was systematically taking colours that could not
be seen against the field and making them the foreground. The rule is now "clear every enforced pair
**and** create no new zero in any protected pair", and relocation is **0 in every configuration**.

The consequence is worth stating plainly, because it answers the question the brief asked — *is this
mostly the swap we already trust, or mostly new machinery?*

> **With all four pairs protected, the swap can never be a valid repair, and the answer is: entirely
> new machinery.**

That is provable, not merely measured. If the foreground is unreadable on the surface, the swap makes
that same colour the accent — drawn on that same surface — so `accent-surface` becomes newly zero.
The only escape is if `accent-surface` was already zero, in which case the incoming foreground cannot
clear the surface either and the enforced check fails instead. Measured over 330 artworks and six
configurations: `swap = 0` in every configuration that protects the accent. The tier is retained in
the code because it becomes live and does most of the work the moment the accent is unprotected
(§13), not as decoration.

## 11. Looking inside the zero bucket — raw APCA

Flo asked why APCA clamps small values away and observed the clamped interval could be useful. It
is, and the clamping turns out to be the reason the defect class looked bigger than it is.

`apcaRawContrast` (in `color.ts`, beside the clamped form and not replacing it) returns the
continuous quantity APCA computes before it discards anything. The relationship is exact, and
`configuration.test.ts` now pins it over all 65,536 8-bit grey pairs — putting the raw value back
through APCA's own clip and offset reproduces `apcaContrast` to within 1e-9, everywhere:

> **`apcaContrast` returns exactly 0 precisely when `|apcaRawContrast| < 10`**, and above that it
> returns the raw value moved 2.7 toward zero. That is where the 7.3 floor comes from.

So the "exactly zero" class is not one thing. Inside it, raw contrast varies continuously:

| pair | in the bucket | raw < 1 | < 2 | < 3 | < 5 | < 7 | median |
| --- | --- | --- | --- | --- | --- | --- | --- |
| foreground-surface | 14 | **0** | 4 | 5 | 6 | 11 | 5.36 |
| foreground-background | 23 | 2 | 5 | 7 | 16 | 18 | 3.63 |
| accent-surface | 144 | 4 | 15 | 29 | 62 | 92 | 5.36 |
| accent-background | 132 | 2 | 10 | 23 | 49 | 84 | 5.93 |

**No foreground-surface case is at genuinely identical lightness** — the smallest is raw 1.19. The
foreground-background bucket does contain true black-on-black (raw 0.469: `bg=#0f0704 fg=#000000`).

This is a real option for Flo, and it is the one that shrinks the problem instead of growing the
machinery. A floor stated on the *raw* scale rather than the clamped one would cut the class sharply
while keeping both artworks Flo named:

| raw floor | foreground-surface artworks caught | keeps 099b3a (raw 1.43)? | keeps 07d4cb (raw 2.68)? |
| --- | --- | --- | --- |
| clamped 0 (raw < 10) | 14 | yes | yes |
| raw < 5 | 6 | yes | yes |
| **raw < 3** | **5** | **yes** | **yes** |
| raw < 2 | 4 | yes | no |

**A raw floor of 3 keeps both exemplars and drops nine of the fourteen** — the faint-but-real cases
at raw 5.4 to 8.8, which are the ones least likely to be worth disturbing. It is not offered as a
recommendation because no human has judged those nine either way; it is offered because it is the
lever that makes the intervention smaller rather than larger, and every other lever here makes it
bigger.

## 12. All four pairs, at the same bars

Completing the census Flo asked for. Collapsed roles are excluded per pair, because a collapsed
surface *is* the background and a collapsed accent *is* the foreground, so their pairs are not
distinct claims — the same rule the repair applies.

| bar | fg on surface (n=5,504) | fg on background (n=6,941) | accent on surface (n=5,442) | accent on background (n=6,678) |
| --- | --- | --- | --- | --- |
| `< 2` / `< 5` | 14 (0.25 %) | 23 (0.33 %) | 144 (2.65 %) | 132 (1.98 %) |
| `< 9` | 27 (0.49 %) | 40 (0.58 %) | 322 (5.92 %) | 284 (4.25 %) |
| `< 15` | 91 (1.65 %) | 111 (1.60 %) | 975 (17.92 %) | 845 (12.65 %) |
| exactly 0 | **14** | **23** | **144** | **132** |

The accent pairs carry the defect about ten times as often as the text pairs.

## 13. Blast radius per configuration

Measured over the 330 artwork files whose trunk palette carries any zero pair — which is the complete
population the repair can reach, since its entry test is the defect — and diffed against trunk.

| configuration | enforced | protected | movers | swap | slate | left alone (level 3) |
| --- | --- | --- | --- | --- | --- | --- |
| **fg-surface** | fg/surface | all four | **15** | 0 | 15 | 0 |
| fg-surface-accent-ok | fg/surface | text only | 15 | **12** | 3 | 0 |
| **fg-both** | both fg pairs | all four | **38** | 0 | 38 | 2 |
| fg-both-accent-ok | both fg pairs | text only | 39 | **31** | 8 | 1 |
| accent-only *(separate tier)* | both accent pairs | all four | 297 | 0 | 297 | 1 |
| all-four | all four | all four | 327 | 0 | 327 | 3 |

**The cascade is gone.** `fg-surface` moves exactly 15 artwork files — the 15 that carry the defect —
against the wide guard's 149 for the same 15 fixes. Nothing else in the corpus moves.

**And no reviewed palette is disturbed.** Of the 15 movers, 14 have never been reviewed at all, and
the fifteenth is the founding artwork, whose trunk palette was the *losing* side of Flo's own A/B.
Against the wide guard's two reviewed-strong and one reviewed-acceptable casualties, this is the
whole point of the narrow form.

**Disturbance is minimal**: on 13 of the 15, the only role that changes is the foreground.

The `-accent-ok` rows are the price of Flo's own design constraint. Protecting only the text pairs
revives the swap, which then does most of the work — but what the swap does is move the unreadable
colour onto the accent. That is defensible exactly to the degree that "the accent is for icons, not
text, and slight distinguishability loss is not a huge deal" is true, and not one bit further.

### The accent tier, reported separately and not folded in

`accent-only` moves **297** artwork files. It is a twentyfold larger intervention than `fg-surface`
for a role review has explicitly said matters less. It is listed here for completeness and it is
**not** part of any recommendation below. Its movers are in
`reports/repair-movers-accent-only.txt`; none of them is a text-legibility fix, and they should be
judged as a separate question if they are judged at all.

## 14. Repair quality — the deciding question

Counts do not decide this; Flo's read of the wide-guard batches was "mostly not very good, but they
do save some unusable palettes". So here are the two named exemplars, across trunk, the wide guard,
and the narrow configurations.

### `099b3a` — the save worth making

| | background | surface | foreground | accent | fg reads on surface |
| --- | --- | --- | --- | --- | --- |
| trunk | `#b5b5b5` | `#151515` | `#000000` | `#e1e1e1` | **raw 1.43** — black on near-black |
| narrow `fg-surface` | `#b5b5b5` | `#151515` | **`#e1e1e1`** | `#e1e1e1` | raw 90.4 |
| narrow `fg-both` | `#b5b5b5` | `#151515` | **`#7a7a7a`** | `#e1e1e1` | raw 33.8 |

**The narrow repair makes the save.** It reaches for the light grey the artwork already contains and
that the ranking already built, and the text becomes readable without the field moving at all. My
read: `fg-surface` is a clean save, though it collapses foreground and accent onto one colour;
`fg-both` at `#7a7a7a` is the better palette, balanced against both ends of the gradient.

### `07d4cb` — the founding case, and the real cost of narrowness

| | background | surface | foreground | accent | field | fg reads on surface |
| --- | --- | --- | --- | --- | --- | --- |
| trunk | `#058cde` | `#d2e0eb` | `#fed700` | `#fbb89d` | gradient + midpoint | **raw 2.68** |
| **wide guard** | `#058cde` | **`#64b4e5`** | **`#fed700`** | `#fdbca0` | gradient | raw ≈ 28 |
| narrow `fg-surface` | `#058cde` | `#d2e0eb` | **`#fdbca0`** | `#171c1f` | gradient + midpoint | raw 11.3 |
| narrow `fg-surface-accent-ok` | `#058cde` | `#d2e0eb` | **`#fbb89d`** | `#fed700` | gradient + midpoint | raw 13.2 |

**This is where narrowness loses, and it should be seen clearly.** Flo's stated bar for a good repair
is "keep the gradient, deepen the surface, the yellow reads" — and that is exactly what the *wide*
guard produces. The narrow repair cannot produce it, because deepening the surface is a change to the
**field**, and the narrow form is forbidden from touching the field by the very constraint that
kills the cascade.

So it does the only thing it can: it gives up the yellow. Peach `#fdbca0` on pale blue `#d2e0eb` at
raw 11.3 is barely over the floor, and it takes the artwork's most identifying colour out of the text
role. My honest read: **this is a mediocre repair**, and it is worse than the wide guard's on the one
artwork Flo has looked at hardest. The `-accent-ok` variant at least keeps the yellow visible as the
accent, which I would rank above the plain `fg-surface` answer.

The generalisation, and it is uncomfortable: the narrow repair is **good at rescuing palettes whose
field is fine and whose text is simply the wrong colour** — which is 13 of the 15, mostly dark-on-dark
flips like `#000000 → #e1e1e1`, big decisive wins. It is **weak exactly where the field is the thing
that is wrong**, and the founding case is that kind. Two of the fifteen also trade a warm foreground
for a desaturated one (`02/…20d4f`: `#443427 → #50595e` on a warm artwork), which is an identity loss
a reviewer may well refuse.

### Level 3 — declining to repair

Level 3 fired on 2 artworks under `fg-both` and 3 under `all-four`, and in every case the published
palette is byte-identical to trunk. Two examples: `0e/…00eb97d4` (`bg=#11648e fg=#186987`, raw 3.13)
and `03/…0003cdbb` (`bg=#162e30 fg=#20171c`, raw 3.79). Nothing on their field could carry the roles,
so nothing was forced. This is the tier working as intended, and given §14's quality findings I would
weight it *more* heavily, not less: several of the fifteen `fg-surface` repairs would arguably be
better left alone and reported.

## 15. Addendum — after review preferred the repair (midpoint protection, and level 2b)

Review ran the repair batch and **preferred it on all four items**: `099b3a` acceptable, `0ed8ed`
acceptable, `0a9ef1` and `020d4f` weak-but-better — including the warmth-costing one, which still
beat the unreadable original. On the founding case head-to-head review preferred the **wide guard's**
palette over the narrow one, which is what §14 predicted. Two changes followed.

### 15.1 The midpoint is a published stop, and it joins the protection

Review's note on the repaired `099b3a`: *"it's now the midpoint that causes an APCA of 0 … this one
feels particularly intense (it's white on white for a significant width)"* — the repaired foreground
`#e1e1e1` was sitting on the published midpoint `#e0e0e0`. The same thing, milder, on `0ed8ed`.

The principle now encoded, in `withMidpointPairs`:

> A zero **crossing** mid-gradient is a thin line — contrast is zero at one position and recovers on
> both sides — and stays exempt. A foreground matching a published **stop** is not a crossing: the
> ramp flattens around each stop, so the text is unreadable across a significant width. So whenever a
> mark role's pairs are checked at all, its midpoint pair is checked with them. It is not a separate
> coverage choice a caller makes.

**This is its own defect class, and trunk carries it today.** Measured over the corpus, before any
repair: **8 artworks publish a foreground unreadable against their own midpoint**, and 37 an accent.
None was visible to any earlier count, because nothing had ever measured that pair.

**Both flagged artworks are now repaired, and a mark-role candidate cleared surface *and* midpoint on
each — no field change was needed:**

| | background | surface | midpoint | foreground | fg on surface | fg on midpoint |
| --- | --- | --- | --- | --- | --- | --- |
| `099b3a` trunk | `#b5b5b5` | `#151515` | `#e0e0e0` | `#000000` | **raw 1.4** | raw 90.5 |
| `099b3a` previous repair | `#b5b5b5` | `#151515` | `#e0e0e0` | `#e1e1e1` | raw 90.4 | **raw ≈ 0** |
| **`099b3a` now** | `#b5b5b5` | `#151515` | `#e0e0e0` | **`#929292`** | **raw 45.5** | **raw 42.6** |
| `0ed8ed` trunk | `#f8f8fa` | `#282c2d` | `#f0eff5` | `#2b2f38` | **raw 1.9** | raw 93.4 |
| `0ed8ed` previous repair | `#f8f8fa` | `#282c2d` | `#f0eff5` | `#dfdce3` | raw 48.2 | **raw ≈ 0** |
| **`0ed8ed` now** | `#f8f8fa` | `#282c2d` | `#f0eff5` | **`#a29ca0`** | **raw 48.2** | **raw 45.9** |

Both land on a mid-tone that reads against the dark surface and the light midpoint at once, which is
what the extra constraint was always going to select for. No level-2b re-pick was required for either.

### 15.2 Level 2b — full-palette re-pick

Implemented, and the reasoning in the brief is right and worth restating in the code: **the wide
guard's cascade came from running for everyone, not from changing fields.** The entry test is still
the defect itself, so a tier that moves the field is exactly as cascade-free as one that does not.

2b is restricted to candidates on a *different* field (which is what makes it a tier rather than a
re-run of 2a) and takes the ranking's own best among them. It is tried when 2a finds nothing, or when
2a's best is not decisive:

> **A mark-role repair is decisive when its worst enforced pair clears raw 20 — twice the floor.**
> Below that, 2b is consulted, and it wins only if it is strictly more readable. Ties go to the
> smaller change.

Twice the floor is stated as a multiple on purpose: the floor (raw 10, where APCA starts reporting
anything at all) is the only non-arbitrary number on this scale, so the one bar that had to be picked
is expressed in terms of it rather than invented.

**A real bug turned up while wiring this.** The ordering was scoring the raw *candidate* while the
cleanliness test judged the *published* result — and publishing can rearrange a palette, because the
mark-role swap exchanges the two mark colours and the supported-gradient path can drop a gradient
claim to flat. Both now read the published arrangement. It changed which palette several artworks
land on.

### 15.3 Does 2b reproduce the wide guard's founding-case answer? No — and it cannot

**It does not, and the reason is reachability, not ranking.** The wide guard published
`bg #058cde / surface #64b4e5` **as a gradient**. Trunk's source-eligible slate for that artwork is
1,179 candidates, and that field appears in it **49 times — 0 of them as a gradient**. All 49 are
flat. The wide guard's palette was *created* by the cascade: refusing candidates changed what
materialization admitted, and a gradient variant on that field appeared that trunk never builds.

So no re-pick tier can produce it. That is a structural limit of every narrow form, not a tuning miss.

**But the closest reachable relative is genuinely close, and it is clean:**

| | background | surface | foreground | accent | field | fg on surface |
| --- | --- | --- | --- | --- | --- | --- |
| wide guard (reviewed best, unreachable) | `#058cde` | `#64b4e5` | `#fed700` | `#fdbca0` | **gradient** | raw ≈ 28 |
| **slate rank 95** (reachable) | `#058cde` | `#64b4e5` | `#fed700` | `#fdbca0` | **flat** | **raw 28.6** |
| what 2b publishes (rank 7) | `#d3a334` | `#cf7d0f` | `#171c1f` | `#fdbca0` | gradient | raw 46.2 |

Rank 95 is the reviewed answer minus its gradient claim: same field colours, the artwork's yellow
still carrying the text. Every pair on it is clean (`reports/founding-case-reachability.txt` shows
all four). It is not chosen only because it ranks 95th and the gold field ranks 7th.

**So 2b's ordering is a live decision, and I have deliberately not made it.** Ordering by ranking
publishes the gold gradient; ordering by *smallest change* publishes something much nearer the
reviewed answer. Neither has been reviewed, so the code takes the least-invented rule — defer to the
ranking the rest of the algorithm already trusts — and the alternative is written down here instead
of quietly adopted. **This is the second thing worth putting in front of review**, and the cheapest
way to settle it is a single A/B on this artwork: gold gradient versus blue flat with yellow text.

### 15.4 Blast radius after both changes

Full corpus re-run, widest configuration: **7,585 artworks compared, 359 movers, 0 cascade.** The
mover count is *exactly* the number of artworks whose trunk palette carries a defect — the two sets
are identical, which is the strongest form the claim can take. Level 3 no longer fires anywhere: 2b
rescues every artwork the mark-role tier used to decline.

| configuration | movers | swap | slate (2a) | repick (2b) | level 3 |
| --- | --- | --- | --- | --- | --- |
| **fg-surface** | **23** | 0 | 20 | 3 | **0** |
| fg-surface-accent-ok | 23 | 16 | 5 | 2 | 0 |
| **fg-both** | **47** | 0 | 36 | 11 | 0 |
| fg-both-accent-ok | 47 | 32 | 9 | 6 | 0 |
| accent-only *(separate tier)* | 326 | 0 | 325 | 1 | 0 |
| all-four | 359 | 0 | 326 | 33 | 0 |

`fg-surface` moves 23, up from 15, and the growth is entirely the midpoint pair — 8 artworks whose
foreground is unreadable against their own midpoint were never counted before. **Relocation remains 0
in every configuration.** The mechanism is still overwhelmingly the mark-role tier: 2b fires on 3 of
23 under `fg-surface`.

### 15.5 Verification after the changes

- **`GATE PASS: 108/108 byte-identical`** with everything off, against the same pristine baseline.
- **No cascade over the full 7,585**, midpoint pairs included in the check — an earlier version of
  the checker would have mis-reported every midpoint-driven repair as a cascade.
- **Relocation 0** in all six configurations.
- Typecheck clean; 15 configuration and architecture assertions pass.

## 9. Open questions

1. **Should the rule reach the background side?** §4b: 23 artworks publish a foreground at exactly
   zero against the *background*, a set that does not intersect the 14 at all, and one of them is
   the on-panel fixture `images/birdsofprey.jpg`. The argument Flo gave for the surface — a flat
   pair over a large area, no thin-crossing exemption — applies to the background verbatim, and the
   background is the larger area of the two. The rule as briefed does not cover it. This is the
   single biggest scope question and it is genuinely undecided here.

2. **Should it reach the accent?** The accent is rendered as text on the surface panel too, and 144
   artworks (2.07 %) publish it at exactly zero against the surface. That is a 10x larger
   intervention and it was not measured for destination quality, so it should not be assumed
   analogous.

3. **The role swap is a general hazard, not a local one.** `swapMarkRoles` rearranges a winner after
   every gate has run, so *any* validity rule stated in `createTreatment`/`validateTreatment` can be
   violated by the published output. This arm found it because one artwork exercised it. The three
   role-equality throws and the `foregroundField` ΔE rule are all exposed to the same route and
   nobody has audited whether the swap can break them too. Worth a dedicated check.

4. **Only 196 of 6,941 artworks carry review records**, so "0 reviewed palettes refused at bar 1" is
   a statement about a 2.8 % sample. It is strong evidence given that the refused set is only 14
   artworks and none of them is reviewed, but it is not proof that no human would have liked one.

5. **The `cs2-batch` comparison is confounded on one item** (§7). Whether that changes the
   chromatic-surface conclusion is for that arm's owner to judge, not this one.

6. **The gradient midpoint is dropped on several movers.** The guard refuses a treatment, and the
   replacement sometimes carries no source-supported midpoint where the old one did. Whether losing
   a midpoint is a cost worth paying for readable text is a review question, not a measurable one.

7. **Nothing here measures whether the destination palettes are *good*.** The census proves the
   refused palettes have a defect and the movers table shows where they land. §14 is my own read of
   the two named exemplars and the fifteen text repairs; it is not a verdict, and for every mover the
   destination has never been shown to anyone.

8. **Should the floor be raw or clamped?** §11 is the strongest lever nobody has ruled on. A raw
   floor of 3 cuts the foreground-surface class from 14 to 5 and keeps both artworks Flo named. It
   would need its own review pass, and the nine it drops (raw 5.4–8.8) have never been judged either
   way.

9. **The narrow repair cannot move the field, and sometimes the field is what is wrong.** That is
   structural, not an implementation gap: permitting a field change is precisely what reintroduces
   the cascade. If the founding case's *wide* answer is the one review prefers, then neither
   mechanism as built is right, and the honest next question is whether a field repair can be made
   local — for instance re-picking only the surface endpoint from candidates on the same field
   hypothesis. Not built, not measured, and not obviously cheap.

10. **The `-accent-ok` variants are only as defensible as the claim behind them.** They work by
    moving unreadable colours onto the accent, and they are cheap precisely because review said the
    accent matters less. If that ever stops being true, those two rows become the worst options on
    the table rather than the best.

11. **Level 3 may deserve to fire more often.** It currently declines on 2–3 artworks. Given that
    several of the fifteen text repairs look mediocre to me, a quality bar on the *replacement* —
    not just a floor on the defect — might be the more honest mechanism, and it does not exist.
