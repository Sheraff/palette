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

**My recommendation: do not turn this on as it stands.** The rule is *correct* about the pathology
and its threshold is genuinely un-tuned, but a 10:1 collateral-to-fix ratio that reaches two
reviewed-strong palettes is a bad trade for 14 unreviewed artworks. The interesting finding is that
the cost is almost entirely cascade, not the rule itself — so the question worth putting to review
is whether a *narrower* intervention exists that repairs the winner without perturbing the candidate
domain (e.g. refusing only at final winner selection, or repairing the surface endpoint in place).
That was not built here and should not be assumed cheap. If the flag is turned on regardless, the
three reviewed movers and the founding case belong in the next batch.

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
   refused palettes have a defect and the movers table shows where they land. Only review can say
   whether the landings are improvements, and for most movers the destination has never been seen.
