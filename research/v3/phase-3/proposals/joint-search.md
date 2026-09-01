# Joint search under artwork-derived requirements

*Seed angle kept. One departure: the "hard structural requirements" are not a fixed set but a
**relaxation ladder** — a fixed set has no defined behaviour when infeasible, and that is where
candidacy walls grow back.* **Evidence:** the 206 `phase2-*` warehouse rows are autosave snapshots and
deduplicate to **61 distinct judgements, 40 noted** (17 of the 21 unnoted are `strong`; the note field
is a defect log). Class shares below are over those 40; every verdict claim cites its batch.

## 1. The design in one paragraph

Decode at full resolution. Fit a robust field (P5) and, from its residual plus a tree of shapes over
the residual pixels (P2), read out a small set of **populations** — coherent colour groups with
spatial support, each tagged *ground* or *mark*. One λ-priced model-order decision (P1's salvaged λ,
applied to the field fit only) says how much field structure the artwork supports: one ground
(surface collapses), two flat grounds, or one shaded ground (ramp) — fixing the gradient boolean
before any colour is chosen. The populations then **write a requirement set**: boolean predicates
over a whole palette saying which population class may fill which seat, that the published colours'
family structure mirrors the artwork's, and that every population the decomposition accepted is
covered. Requirements are ordered into a ladder of bundles, crossed with a ladder of margin rungs. An
exact search (P6's branch-and-bound substrate, with the **margin profile** as the bound instead of an
energy) returns the palette from the highest feasible rung of the strongest feasible bundle; ties break
by leximin on margins, then a mass-maximising snap. No scalar objective, no weighted sum, no election
between rival palettes: one decomposition, one ladder, one feasible set, one search.

## 2. Mechanism

**Terms.** *Population* — pixels the decomposition accepted as one thing, with a colour distribution;
a spatial object with a colour, not a cluster of colour space. *Ground population* — one the fit
explains; *mark population* — one it rejects, grouped spatially. *Family* — populations whose
representatives are within the contract's region-dependent `sameColorBar`. *Requirement* — a boolean
predicate over a complete palette; never a term, never a score. *Rung* — an integer level on one
dyadic separation ladder, in multiples of the pair's own bar. *Level* — one (bundle, rung) pair.

### Step 1 — decode and fit *(salvage: P5 `fieldfit.ts`)*

Full-resolution decode, OKLab. Tukey-IRLS affine field fit and its recursive component peel
(`fitFieldComponents`, `MAX_COMPONENT_DEPTH`, `EXTENSIVE_SUPPORT_FRACTION`) with the component ink
veto. **Computes:** ground components with claim masks, residual weights, fitted colour path, and the
absolute explained-fraction verdict (`NO_FIELD_EXPLAINED_FRACTION`). **Decides:** whether there is a
field. Strongest robustness evidence in the fleet: bg/surface bit-identical across nine P5 versions,
field path bit-stable under dither at ≤1.06× amplification (P5 STATE.md §3).

### Step 2 — populations *(salvage: P5 `marks.ts`; P2 tree of shapes; P3 coherence eligibility)*

Mark populations from two enumerators, unioned: (1) P5's `readMarks`/`groupAtScale` over the
fit-rejected pixels at the chosen grouping scale; (2) P2's tree of shapes on **the residual pixels
only**, with its chromatic lanes and antialias-ineligibility rule (the measured accidental-shadow
class). The tree is a *population enumerator only* — its judge-proven half is reachability (91.9% of
1,397 endorsed role slots; falsifier 1.7% vs 36.4% control), its unproven half is election, and
nothing here elects off node structure.

Each population carries a **representative** (the maximum-mass exact triple inside its own bar
neighbourhood), a support mask, spatial extent, and P2's glyph attributes (thinness, counters,
collinearity) rolled into a *typographic* flag.

**Two consequences.** (i) **Every published colour is a population's representative, so it is
locatable by construction** — and non-locatability is 20% of noted judgements: *"only present in the
very small label logo at the bottom"* (`phase2-cal-025`), *"its presence in the artwork looks
accidental"* (`phase2-pair-023`), *"i'm not sure where in the artwork it's coming from"*
(`phase2-cal-026`), *"there is no grey in that artwork"* (`phase2-pair-019`). (ii) Taking the max-mass
triple *inside* the population, not a rank-extreme of a field, answers the shade-drift note *"the
accent is darker than the real purple in the artwork"* (`phase2-cal-017`). **No mass floor anywhere:**
a population is accepted because the decomposition accepted it (P3's coherence-shaped eligibility;
median endorsed role colour has exact-triple share 8.9e-5). Mass appears twice only — picking a
representative, and the final tie-break in step 7 — never as an eligibility cost (P6
REOPENING_ANALYSIS, inheritance note).

### Step 3 — structure *(salvage: P1's λ; P5's t-continuity discriminator)*

Three hypotheses about the field: `COLLAPSE` (one ground, `surfaceCollapsed`), `TWO_FLAT` (two flat
grounds, `gradient: null`), `RAMP` (one shaded ground). Each has a parameter count and a residual over
the ground pixels; choose by `L(residual | model) + λ·L(model)`, λ = 0.1 (P1's measured value, 72-cell
probe; re-measure here). The `TWO_FLAT`/`RAMP` boundary additionally consults P5's t-continuity
two-block-vs-ramp discriminator (zero false gradients across six published ramps, `phase2-cal-013`).

**This is all of P1 I keep, and it decides one thing: how much field structure the artwork deserves.**
It touches no role assignment and no mark colour. It is the field guide's own recommended-never-built
neutrality mechanism (§6, "price the gradient claim symmetrically inside the fit itself") and gives
§2.4 neutrality by construction — the boolean is a function of the fit alone, decided before any
colour-supply mechanism runs. False gradients outnumber missed ones **5:1** in the phase-2 notes
(`phase2-cal-017`, `pair-019`, `pair-023`, `pair-024`), so the risky direction is publishing one.

### Step 4 — the requirement set the artwork writes *(new; reframing from GRAFT_INVENTORY)*

Booleans over a complete palette.

- **P (provenance).** `background`/`surface` lie within the bar of some ground population's pixels;
  `foreground`/`accent` within the bar of some mark population's. Under `RAMP` the field pair are the
  two ends of the *same* ground component's colour path (contract: `stops[0] == background`,
  `stops[last] == surface`); under `TWO_FLAT`, two different ground populations. **P reproduces the
  reviewer's own seat rule** — *"the Zen grey is not a foreground or accent color… it must be either
  background or surface"* (`phase2-pair-019`): a large smooth neutral is a ground population, and P
  makes those the only seats it can take.
- **P-fg (seat).** If any mark population is typographic, `foreground` comes from one. P2's text-led
  election: text-led fg on 16/20; the corpus's most-repeated prescription is this rule (*"the main
  text is white in this artwork… we should have a white foreground"*, three notes across
  `phase2-cal-022` and `pair-023`); P3's white-type-on-photo failures are the counter-evidence.
- **P-ac (seat).** `accent` from a mark population in a *different family* from the foreground's;
  otherwise `accentCollapsed`.
- **F (family mirror).** The number of distinct families among published colours equals the number
  among accepted populations, capped at four; background/surface share a family iff the ground is one
  component. This is GRAFT_INVENTORY's corrected reframing stated as a predicate, not as a universal
  two-family form: 168's two paired families and `phase2-cal-022`'s four named colours (*"The colors
  are Taxi Yellow, Torch Red, black (Soot is ok), white"*) are both expressible.
- **I (identity coverage).** Every accepted population's representative is within the bar of some
  published colour. **The decomposition, not a threshold, decides prominence** — the fix for P5's
  near-inert coverage at bar granularity (`coverageDecided` 0/27; "one black = 70 families"):
  populations are spatial objects and do not fragment the way colour families do. This is the
  reviewer's stated endorsement criterion (*"capture all the main colors of the artwork"*) and his
  mandatory-colour asks (*"at least one color must be pink"*), both `phase2-pair-019`.
- **C (contract).** Invariants 1–4 verbatim: schema, source support, pairwise distinctness above the
  bar with the two sanctioned collapses, and `min |raw APCA|` over the *whole rendered OKLab ramp* for
  foreground and accent. **C is never relaxed.**

### Step 5 — the ladder *(new)*

Bundles, strongest first: **B0** = C,P,P-fg,P-ac,F,I · **B1** = B0−F · **B2** = B1−I · **B3** = B2−P-ac
· **B4** = B3−P-fg · **B5** = B4−P for the mark roles · **B6** = C only (every artwork pixel feasible
for every role) · **B7** = C with the declared escape permitted.

Margin rungs, dyadic in each pair's own bar: `r3` 8×, `r2` 4×, `r1` 2×, `r0` 1× (the bar itself). A
level is `(Bk, rj)`; the order is `(B0,r3), (B0,r2), (B0,r1), (B0,r0), (B1,r3), …` — **structural
correctness outranks margins**, because the reviewer puts it there (*"incorrect background, the rest
is hard to judge in front of that incorrect background"*, `phase2-cal-017`; background is the
most-cited defect at 28%, and all 12 `unacceptable` notes cite a wrong background or an unreadable
foreground). Nothing is ever permanently excluded: every exclusion is a requirement the *whole
palette* failed, and requirements drop in this published order until the set is non-empty. B6 is P6's
measured property — "the whole artwork is feasible for every role", falsifier 2 never fired.

### Step 6 — the exact search *(salvage: P6 `src/energy/solve.ts`, structure only)*

The feasible set is the tuples `(background, surface, foreground, accent)` over the artwork's distinct
exact triples under the fixed structure. Under `RAMP` the ramp is determined by the field pair plus
guide stops, so — exactly as P6's solver documents — the whole-ramp contrast requirement **factorises
into a unary predicate** on foreground and on accent once the field pair is fixed.

1. Unary lists per role: provenance (bundle-dependent) and escape legality, O(|E|) each.
2. Outer enumeration over (background, surface); inner over (foreground, accent), with arc
   consistency on the six binary predicates (bg–sf, fg–ac, each mark role against each field role).
3. **Bound.** The incumbent's margin profile bounds the search: each role's list is sorted descending
   by best achievable separation, so once a position cannot improve the incumbent's smallest entry,
   the loop breaks. This is P6's admissible-bound-and-break machinery with the bound quantity swapped
   from energy to margin, and its verified property transfers: exact, bit-identical to exhaustive
   enumeration (280M tuples costed, 5–249 visited). That equivalence test becomes a gate here.

At B0–B4 provenance lists are tiny (pixels near a population's representative) and the search is
trivial; only at B5–B6 does |E| bite, and there the bound and arc consistency do the work.

### Step 7 — ordering within the winning level *(new; snap from P5)*

The level fixes the collapse pattern, so every survivor publishes the same set of pairs and the
profiles are comparable. Two profiles, compared in order, never summed:

1. **Distinctness profile** — each published pair's OKLab distance ÷ *that pair's own* region bar.
   Dimensionless, one type. Compare **leximin** (sort ascending; larger first-differing entry wins).
2. **Contrast profile** — foreground's and accent's `min |raw APCA|` over the rendered ramp ÷ ε.
   Dimensionless, one type. Leximin.
3. **Final tie-break** — greatest total mass inside the chosen triples' own bar neighbourhoods (P5's
   mass-maximising snap, built as an anti-dither device). A stabiliser; not evidence, not eligibility.

Distinctness before contrast is anchored in the contract: the distinctness bar is a calibrated
`[REVIEWED]` invariant, the contrast floors are deliberately near-zero user parameters callers are
expected to raise (PHASE_0 §2). One held bit, not an exchange rate. And leximin is the reviewer's own
stated preference between two otherwise-passing palettes: *"this works, but the foreground is
unnecessarily close to the background and surface color, when the artwork has other possible colors to
pick from that wouldn't be so 'on the edge'"* (`phase2-cal-020`, acceptable) — literally "prefer the
feasible palette with the larger smallest margin".

### Step 8 — guide stops, then re-validate *(salvage: P2 guide-stop machinery; P1/P6 excursion probes)*

Only under `RAMP`, only after the palette is chosen: sample the OKLab segment between the published
ends, measure the worst excursion from populated artwork colours, insert an interior stop **only if**
it reduces that excursion, subject to monotone chord-progression and minimum spacing — never to add
coverage. P2's owed-stop census was zero on demo-20 + fresh-40 against a 42% legacy figure. Any
insertion re-validates the whole palette against C (PHASE_0 §4 meta-rule); if it cannot, it is refused.

**Where the contract enters. Before**, as the feasible set's definition (exact artwork pixels; escape
only at B7) — contract as feasible set, never a term, the one structural property of P1 that its own
falsification left intact. **During**, as the bundle never relaxed and the ruler the rungs and
profiles are expressed in.
**After**, only guide-stop insertion, with full re-validation. The four roles and the gradient are one
object because every requirement but escape legality is a predicate on the *tuple*: F and I are
whole-palette, provenance is joint under `RAMP`, the contrast requirement is over the ramp the field
pair defines, and both tie-break profiles are properties of the palette, not of any role.

## 3. Why it does not die the way the six died

1. **No scalar currency judges.** No two quantities of different type are ever summed or compared. The
   only orderings are a fixed ladder of boolean bundles and leximin within one dimensionless profile
   at a time. P1 and P4 died because one number had authority over role assignment and over palette
   choice; here seats are booleans and no number ranks palettes until the level is already settled.
2. **Role assignment is a separate competence, exercised separately.** Seats come from P-fg/P-ac,
   predicates over a *different kind of evidence* (typographic support, family difference) from the
   one that finds colours. P1's kill was swap-indifference — its energy moved by ~0 under a swap.
   Here a swap flips a boolean: put the typographic mark in the accent seat and P-fg is violated, so
   the palette is not in the level at all. P6's role degeneracy (fg fitness ≡ accent fitness, rel-gap
   3e-16, worsening monotonically with anisotropy) cannot occur, because the seats are not two
   weightings of one measure.
3. **Optimizers sit on floors; this one is pushed off them.** Leximin *maximises the smallest margin*,
   so barrier-hugging is the worst outcome under the ordering, not the optimum — and the ladder tries
   "8× the bar on every pair" before anything looser. P6's pathology (5/6 "indistinguishable"
   complaints at 1e-4–3e-3 over the bar) is unreachable while a roomier feasible palette exists, and
   the pricing is not hand-set: rungs are dyadic multiples of the contract's calibrated ruler.
4. **No selector.** One decomposition, one ladder, one feasible set, one search. Descending is
   *relaxation*, not election between rival whole-palette answers; the field subsystem pins the ground
   and the structure, the mark subsystem supplies the figure populations, and neither proposes a
   palette for the other to judge (GRAFT_INVENTORY constraint 4). **Honest exposure:** step 7's
   leximin compares surviving tuples. I claim that is a tie-break inside one answer set, not a
   selector over rival answers; it is the place to attack this proposal.
5. **No mass or population floor anywhere**, and **F is a predicate, not a universal form** — it
   matches the artwork's family count and never imposes two families.

## 4. Robustness argument

| discrete decision | stabiliser | inherited risk |
|---|---|---|
| field fit / component peel | integrals over large pixel sets; P5-measured bit-stable under dither (≤1.06× amplification), bg/surface bit-identical across nine versions | low |
| structure (λ) | a ratio of residual sums over the whole ground; **and** a contract fact: under `TWO_FLAT`↔`RAMP` the ramp's ends *are* background and surface, so a flip changes the boolean and interior stops, not the four role colours | the `COLLAPSE`↔`TWO_FLAT` boundary *does* move the surface; genuine |
| mark grouping scale | √2 geometric ladder; a one-rung move changes group membership, not population identity, for well-separated marks | P5's marks pipeline measurably added discrete surface (39.0% overall at v0.9.2) |
| tree populations | enumeration only; a node appearing or vanishing changes the palette only if it changes which requirements are satisfiable | region boundaries are the least stable object under re-encode (PHASE_2_HANDOFF §2) — inherited but defanged |
| ladder level | **quantised**: rungs are dyadic bands, so a dither-sized change cannot move the level unless a margin sits on a rung boundary | genuine; expected dominant residual |
| tie-break | leximin over continuous margins is knife-edge; the mass-maximising snap is the designed answer | genuine |

**Causes removed:** P3's edge/depth substrate (slope −0.212 vs resolution; β-depth drift 0.34 log
units across renditions); P6's lattice quadrature knobs (bandwidth ×½/×2 moved 63–67% of palettes);
P2's election over cluster members. None are used.

**Cause inherited:** discrete selection near thresholds, the fleet's shared cause (P5: *"the leak is
discrete selections near thresholds… the argmax-near-margins shape, not any one rule"*). My answer is
*quantisation plus a stable fallback*: the level is a band, not a point, and a tied band falls to a
mass-maximising snap rather than an argmax over near-equal reals. I do not claim this closes the gap —
it moves instability from a continuous argmax onto a band boundary, a smaller measure of the input
space. **The design's main empirical bet; measure it in week 2, before round 2.**

## 5. Free parameters

| constant | value / source | anchor | if wrong |
|---|---|---|---|
| λ (structure model order) | 0.1 | MEASURED, P1's 72-cell probe; re-measure on this fit | gradient rate drifts; the distribution census catches it |
| Tukey biweight c | 4.685 | standard statistics, via P5 | fit robustness degrades gracefully |
| `NO_FIELD_EXPLAINED_FRACTION`, `EXPLAINED_RADIUS` | 0.5; 4 × pooled bar | MEASURED (P5 decision 9); the radius derives from the contract ruler | photographs stop retreating or block covers start; visible as a rate |
| `EXTENSIVE_SUPPORT_FRACTION`, `MAX_COMPONENT_DEPTH` | 0.1, 4 | MEASURED, P5 | too few/many ground components |
| mark scale ladder (min/max/ratio) | 0.002 / 0.05 diag, √2 | MEASURED, P5 sweep | mark grouping fragments or merges |
| rung base | dyadic {1,2,4,8} × `sameColorBar` | DERIVED from the contract ruler; dyadic is scale-free, nothing fitted | coarser ⇒ more ties ⇒ more reliance on the snap; finer ⇒ less stability |
| ladder order (B0…B7; margins inner) | **HELD** | the reviewer's structure-before-margins framing (`phase2-cal-017`) | the design's largest hand-authored object and its top falsification target |
| distinctness before contrast | **HELD**, one bit | contract: distinctness is a calibrated invariant, contrast a near-zero user floor | readable-but-twinned instead of distinct-but-dim |
| ε_text, ε_accent, bars, `ACCENT_FUNCTIONAL_DISTANCE` | contract | REVIEWER-OWNED | the contract's problem, not the algorithm's |
| P2 text-detector attributes | inherited | MEASURED in P2 | P-fg fires wrongly; B4 catches it by relaxation |

Roughly 12 tunable sites plus the ladder order, against v2-3's ~900. **The human decisions live in**
the ladder's order, the two-profile priority, and the population-class-to-seat map — three structural
statements an implementer can read and a reviewer can dispute, not coefficients.

## 6. The failure classes

- **Wrong field colour / wrong background (28%, largest class)** — **PARTIAL.** The ground comes from
  the fit, not from population contests, and P plus the structure decision make it a structural claim.
  But the sharpest instances are semantic — *"the Sushi Rice beige is the face of the subject on this
  artwork, not a background"* (`phase2-cal-026`, three rounds running) — and **that is NOT HANDLED**:
  the fleet's confirmed shared inexpressible, with P5's ink veto as partial mitigation only.
- **Identity coverage (25%)** — **STRUCTURAL,** predicate I, with the fragmentation cause of P5's
  inert coverage removed by defining prominence spatially.
- **Unreadable foreground / accent (23%)** — **STRUCTURAL.** C's whole-ramp minimum is never relaxed;
  the contrast profile then pushes above it. The graft's caveat holds — floor stands, identity picks
  *within* it — because P-fg outranks every margin rung. `phase2-pair-018` (*"the contrast is indeed
  too low… However there are valid picks in the image such as Charcoal or Putty"*) is a feasibility
  statement, which is what this design searches for.
- **Illegitimate source: logo, accidental, unlocatable (20%)** — **MOSTLY STRUCTURAL** via §2's
  locatability property: "I can't find this in the artwork" and "there is no grey in that artwork"
  become unreachable. The residue is the **label logo** — genuinely present, genuinely locatable,
  still refused (`phase2-cal-025`; P3 EVIDENCE 14: title text eligible, corner logo not). **Not
  handled.** I propose P2's unimplemented overlay ordering (D19), unvalidated. A **guess**, flagged
  and not to be built before round 1: a badge is axis-aligned, canvas-clipped and compositionally
  isolated, so a B0-only clause on canvas-clipped mark populations may capture it.
- **Right colours, wrong roles (18%)** — **STEP 4, P-fg/P-ac.** Corroboration: one colour set graded
  `acceptable` with blue as foreground (`phase2-cal-017`) and `weak` with blue as accent
  (`phase2-cal-022`, *"the foreground should be blue"*) — seats, not colours, were the difference.
  Where provenance is silent (no typographic mark) both orders are feasible and step 7 decides; that
  is the weakest point of the seat story and I say so.
- **False / missed gradient (15%, false:missed = 5:1)** — **STRUCTURAL,** step 3: boolean from the fit
  alone, before colour supply, both directions priced by the same λ comparison.
- **Two near-identical shades (10%)** — **STRUCTURAL:** rungs plus leximin (§3.3), and additionally F,
  which fails a palette publishing two families where the artwork has one (*"there aren't 2 shades of
  yellow on that artwork"*, `phase2-cal-022`).
- **Collapse abuse (10%)** — **STRUCTURAL,** and this class is why I and F are worth their cost:
  *"having the surface collapsed with the background misses some of the artwork's identity"*
  (`phase2-cal-026`), *"especially if it occupies 2 slots… when this artwork contains much stronger
  colors"* (`phase2-cal-020`). Collapse is not an escape hatch here — reachable only when P-ac finds
  no distinct-family mark population, and I and F both fail a collapsed palette that leaves
  populations uncovered.
- **Served colour names** — out of scope for the algorithm, but 43% of notes reason in display names,
  so the naming layer is judged surface and must ship unchanged with the review UI.
- **Field guide §10 cases I consider decisive.** *Black-bar / frame* — **NOT HANDLED**: the frame is a
  ground component and largest-support ordering reproduces the legacy failure that blocked the
  campaign's most-requested palette. *Sky-and-grass* — handled: two ground components ⇒ `TWO_FLAT`,
  never a ramp. *One-surface shading* — handled by λ even when the ends quantise to different
  families. *Giant coloured display text* — P-fg. *All-one-hue* — F asks for the artwork's family
  count, so a neutral accent is correct and no second hue forced. *Scrambled twins* — fit and tree are
  both structural, so scrambling changes the decomposition; a week-1 self-test. *Degenerate covers* —
  the ladder terminates at B7 by construction.

## 7. Cost

- **300 px: ~0.9 s.** Fit + peel ~0.35 s (P5 measured), marks ~0.2 s, tree over residual pixels ~0.2 s
  (P2 measured ~0.67 s full-image; the residual is a fraction), search + ramp <0.05 s.
- **3000 px: ~8–12 s,** the honest risk. P5 measures 4.2 s for the fit at 3000²; the tree is the
  unknown (quasi-linear with a large constant, never run at that size). **Mitigation as a design
  decision, not a hope:** the tree runs on a bounded-resolution copy for *population discovery only*;
  every published colour is still an exact full-resolution pixel and the residual-mark enumerator runs
  at full resolution, so the field guide's full-resolution rule holds where it matters (a thin vivid
  title survives as a mark population even if the tree misses it). If the tree cannot pay, drop it —
  P5's residual marks alone are a complete enumerator.

## 8. Expected failures and falsifier

**Expected bad at:** collage and photography with no field (the retreat publishes little);
face-as-field; the label-logo class; the black-bar/frame class; artworks whose ideal palette needs a
semantic read of *what the picture is*. I also expect early rounds to sit lower on the ladder than I
would like, because the bundles are strong.

**Pre-registerable falsifiers, before round 1:**

1. **Seat errors.** If the dominant complaint class on the first 8-item round is *right colours in the
   wrong seats*, at a rate comparable to P3's swap arc (three rounds plus ground truth to converge),
   the central claim — that the decomposition determines seats — is wrong. Design falsification, not
   under-building: P-fg/P-ac *are* the mechanism, not a tuning site.
2. **Ladder inertness.** If >60% of 200 covers land at B5 or below, the artwork is not writing usable
   requirements and the requirement idea has no content.
3. **Rungs are exchange rates in disguise.** Re-run with the rung base at ×½ and ×2 (P6's own
   sensitivity convention). If either moves >25% of palettes beyond the bar, the dyadic ladder is
   load-bearing without principle and this has relapsed into P6's shape. **The test I most expect to
   be uncomfortable with.**
4. **Robustness.** If ±1-LSB dither moves palettes at a rate no better than P5's 39% overall, the
   quantisation-plus-snap bet in §4 is false and the fleet's located cause is untouched.

## 9. Build plan

- **Week 1 — palettes in front of the reviewer.** Fit + peel + λ structure + a *minimal* requirement
  set (C, P, P-fg with a crude typographic flag) + the exact search + ramp ends. Marks from P5's
  residual enumerator only; no tree, no F, no I, no guide stops. End-to-end, reusing P5 and P6 code
  nearly whole, plus the scrambled-twin self-test. **Round 1 here.**
- **Week 2 — the measurements that decide the design.** Falsifiers 2, 3 and 4 on 200 covers, *before*
  adding capability: three of the six arms added capability faster than they measured stability and
  all three closed with stabilisation as their largest unpriced debt.
- **Week 3 — F, I, and the tree enumerator.** F and I carry the two largest non-background complaint
  classes (identity 25%, collapse abuse 10%); the tree is the recall behind them. Round 2.
- **Week 4 — guide stops, overlay ordering, the escape path**, each with re-validation. Round 3.
- **Effort:** ~4 weeks to a judged record, roughly half of it integration of existing prototype code —
  discounted per the reviewer's standing note that all six Phase 1 proposals *"understate the
  difficulty of the task at hand"*.
