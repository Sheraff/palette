# Field and marks — the ground is a fitted field, the figure is what the fit rejects

**Angle kept:** P5's robust field fit supplies background/surface/gradient; the residual supplies
foreground/accent. **Where I depart:** P5's own record says the fit half is stable (bg/surface
19.5/21.0%) and the *pick* half is not (accent 46.2%, *"measured constant (51–53%) across three
selection rules, so it is the argmax-near-margins shape, not any one rule"*, p5 `STATE.md` §3). So
the fit is grafted nearly whole and everything downstream is rebuilt around one rule: **decide on
integrals over whole colour families, never on individual marks** — and the fit is given the test it
never had, because a fit alone cannot tell a background from a face.

## 1. The design in one paragraph

Decode at full resolution into OKLab. Fit a robust affine colour surface (Tukey IRLS) to the whole
image; its inliers are a **layer**; refit on what it rejected, giving an ordered stack of smooth
layers plus a residual of **marks**. Decide which layer is the *ground* not by size or smoothness
but by **enclosure** — flood the canvas from the border through the layer's complement; the ground
is the layer that cuts the most of the rest of the image off from the frame (a face is enclosed by
its surround; the surround is enclosed by nothing). Read the ground's colour path along its own
fitted direction: continuous ⇒ gradient, with background and surface the two ends; bimodal ⇒ two
flat blocks; short ⇒ flat. Take everything the layers rejected, build a tree of shapes on that
residual only, and group its shapes into **mark families** by single-linkage in OKLab at twice the
same-colour bar — so any two families are distinct by construction. Rank families by **ink
evidence** summed over the whole family (thin, stroke-like mass), enumerate all feasible
(foreground, accent) pairs against the *rendered* ramp, and take the lexicographic best under
semiorder bands. Where the contract cannot be satisfied, relax along one fixed chain — accent
collapses, then the gradient is dropped, then the surface collapses, then the white/black escape.
No score is traded against another score anywhere; no two complete palettes are ever compared.

## 2. Mechanism

Terms. **Bar** = `POOLED_SAME_COLOR_BAR` (0.01535 OKLab, `[REVIEWED]`, `src/contract/constants.ts:255`),
the contract's ruler for "a human calls these one colour". **Claim** = the pixel set a fit explains.
**Stratum** = a layer or a mark family. **Medoid** of a pixel set = the exact artwork triple in it
minimising count-weighted summed OKLab distance to the set — a statistic of the whole set, not a
nearest-neighbour snap. **Semiorder band**: two quantities are *tied* when they differ by less than
a stated resolution, and ties fall through to the next key instead of being resolved.

**Step 0 — decode.** Full resolution (field guide §2.1: downsampling loses thin type and logos).
sRGB → OKLab, transparent input refused loudly (PHASE_0 §1), exact-triple inventory built. *P3's
exact-pixel discipline is kept as an output property, not as a ban on internal arithmetic.*

**Step 1 — robust field fit.** *Grafted whole from P5 `fieldfit.ts`.* Per-channel affine model
`lab ≈ c0 + c1·x + c2·y` on normalised coordinates; Tukey biweight IRLS, cut `4.685·σ̂` with
`σ̂ = 1.4826·median(‖r‖)` about zero, ≤12 iterations, coefficient convergence 1e-4; order-0 start
from the coordinate-wise median; solve on a deterministic stratified lattice of ≥100k pixels, then
recompute every weight and residual **at full resolution**. Order 0 vs 1 chosen by residual margin
in bars. Decision made: the model order, and the **claim** = {pixel : ‖residual‖ < 4 bars}.

**Step 2 — layer stack.** *P5's E2 recursion.* Refit on the unclaimed domain; accept a layer if its
claim is **extensive** (≥10% of canvas) and its core fraction passes; remove its claim; repeat to
depth 4. Output: layers `L0…Lk` with claim masks and the **residual** `R`. *Change from P5:* the ink
veto does **not** run here — P5 vetoed ink-shaped components at fit time (`components.ts:375`, two
hard thresholds in conjunction); here anything stroke-shaped simply loses the enclosure test and
re-enters as marks, so one fewer hard gate carries palette-moving weight.

**Step 3 — the underneath test (NEW).** The one new idea, and the answer to the reviewer's repeated
field complaint: *"this color is the face of the character and not actually the background"*
(`phase2-cal-020`, repeated at `phase2-cal-026`, item `ab67616d…46be9b20`) and *"pink is the color
of the face of a person in this picture, it doesn't really fit as a background"* (`phase2-pair-023`,
item `ab67616d…90bed1b2`). For each layer `Li`:

- **enclosure(Li)** — 4-connected flood from every border pixel through the complement of `Li`'s
  claim. `enclosure(Li)` = the fraction of `canvas \ Li` the flood fails to reach. One BFS per
  layer, O(N).
- **girth(Li)** = `max(distance transform of the claim) / sqrt(|claim|)`. Scale-free: a disc gives
  0.564, a thin frame or bar tends to 0.

**Ground** = the layer with the greatest enclosure among layers with `girth ≥ GIRTH_MIN`; ties
within a semiorder band go to the larger claim. A face is enclosed by its surround and encloses
nothing, so it loses. Two half-fields (sky over sea) enclose each other not at all, tie, and fall
through to area — correct, because step 4 then reads them as two blocks. The girth gate keeps a
black bar or frame from stealing the seat by enclosure alone (field guide §10, the class the
previous campaign never solved). Both statistics are area integrals, hence dither-stable.

**Step 4 — how the field reads.** *P5 `ramp.ts`, grafted.* `t` = projection on the dominant
image-plane direction of the fitted position coefficients; chord = the ground's colours at the
weighted 2nd/98th percentiles of `t`; `middleBandMass` = ground mass projecting into the middle
third of that chord. Three branches:

- **continuous** (`middleBandMass ≥ 1/6`) and chord length > 2 bars → `gradient: true`.
- **bimodal** (`< 1/6`) → `gradient: false`, two flat blocks.
- **chord ≤ 2 bars** → `gradient: false`, one flat field.

P5's record on this discriminator: *"Zero false gradients ever: six published ramps across rounds,
no gradient complaint in either direction on any of them"* (p5 `STATE.md` §2). Both error
directions are live in the corpus (*"there is no gradient in this artwork, it's very clearly all
flat"*, `phase2-cal-017`; *"should be a gradient"*, `phase2-pair-024`), and neutrality is by
construction: the boolean is fixed before any gradient-colour machinery runs (field guide §2.4).

**Ends, and polarity.** Take the extreme `t`-bins each holding `max(0.5% of ground mass, 256 px)`
and publish each bin's **medoid**. This replaces P5's percentile-target-then-snap and the field
guide's 0.1/0.9 read (§6: "endpoints are systematically too narrow"), because a bin medoid is a
statistic of a population, not a nearest-pixel projection of a continuous target. **Which end is
the background** is decided by **border occupancy**: the end whose bin's pixels cover more of the
image border. This is a structural answer to a problem P2 recorded as unsolved (*"ramp polarity …
no constant-free mechanism found"*, p2 `STATE.md` §4) and to *"the background of this artwork is
dark, neither candidate chose a dark background"* (`phase2-pair-019`). For the bimodal branch, the
same rule assigns background and surface to the two blocks.

**Step 5 — interior stops.** Only when `gradient: true`. Build `g(t)`: 64 equal-mass bins along
`t`, each represented by its medoid. Run **Douglas–Peucker on the `t`-ordered polyline `g(t)`** at
ε = the excursion bar (2.5× same-colour, PHASE_0 §4 pathology P1); DP retains *input* vertices, so
every stop is an exact pixel by construction. A retained interior vertex is published only if it
(a) reduces the rendered OKLab polyline's maximum excursion from `g`, (b) keeps the chord
progression monotone, (c) sits more than 0.125 of the ramp from its neighbours (P3's
`MIN_GUIDE_STOP_SPACING`, `[MEASURED]` at the widest spacing ever called banding), and (d) repays a
fixed structure price λ. **Cap 3**: the fourth stop stays off by default, because P3 recorded
gradient *unacceptable* on all four of its 4-stop covers, and the contract makes it negotiable on
proven utility rather than granted. *This is the field guide §6 design the previous campaign
recommended and never built, plus P2's and P3's guide-stop canon (owed-stop census zero on demo-20 +
fresh-40) and P1's λ salvage at the measured λ=0.1, used only as the "how much structure does this
artwork deserve" sub-decision — the only use `GRAFT_INVENTORY` sanctions.*

**Step 6 — marks and families.** Build the **tree of shapes on `R` only** (P2's carried family,
tree of shapes on L, a, b). Restricting it to the residual is a cost decision and a stability one:
region boundaries are the least stable object under re-encode (PHASE_2_HANDOFF §2), and here they
only ever feed attributes that are then *summed over a family*. Each shape carries area, perimeter,
component count, bounding extent, hole count, an interior-pixel flag, and its medoid colour. Group
shapes into **mark families** by single-linkage in OKLab at `FAMILY_RADIUS = 2 × bar` over shape
medoids. Two consequences: (i) any two distinct families are separated by more than
`FAMILY_RADIUS` at *every* cross pair, so **foreground↔accent distinctness is guaranteed by
construction rather than checked and repaired**; (ii) single-linkage chaining — which would merge
everything on a smooth image — is safe here precisely because the smooth part has already been
removed by the fit. **Removing the field is what makes the colour clustering well-posed.** This is
also the answer to P5's family-granularity dead end (*"bar-neighbourhood families fragment visual
colours (one black = 70 families)"*, p5 `STATE.md` §3): linkage merges the 70 shades of one black,
a radius ball around an anchor does not.

**Step 7 — eligibility, by spatial extent, never by mass.** A family is eligible iff:
(a) **extent** — the diameter of its shapes' union (or the separation of its two farthest
components) is at least `EXTENT_MIN` of the image diagonal;
(b) **not antialias** — at least one shape with interior pixels (P2's zero-constant
antialias-ineligibility rule), which removes halo and ringing colours;
(c) **not an accidental shadow** — not every shape is adjacent to, and a darker version of, one
neighbouring family (*"its presence in the artwork looks accidental"*, `phase2-pair-023`).
**No population floor and no mass floor exist anywhere in the design.** The median endorsed role
colour covers 8.9e-5 of the image (`GRAFT_INVENTORY`); extent is what separates the reviewer's
title text from *"the very small label logo at the bottom"* (`phase2-cal-025`), and extent is
independent of mass.

**Step 8 — ink evidence.** For each eligible family, `ink(F)` = Σ over its shapes of
`mass × mortality`, where mortality is P5's shape statistic (the fraction of a shape that disappears
under erosion at 3% of the short side): strokes ≈1, blobs ≈0. **Summing over the family is the
load-bearing change.** P5 ranked individual marks (`assignment.ts` `compareAccent`,
`comparePerRole`), so a decision could rest on one 300-pixel mark's support and jitter; `ink(F)` has
the family's entire support, however scattered. It is also why pointillist and cursive lettering
work here (field guide §10) — the family aggregates hundreds of blobs no per-shape compactness test
can parse.

**Step 9 — the seats, decided as one palette.** Candidate strata `S` = eligible mark families ∪
accepted layers not consumed by step 4, each represented by its claim medoid. **Every stratum is
eligible for every seat** — the field guide §10 role-reachability trap (a colour that could reach
accent but never surface) is structurally absent.

- **Surface**, if step 4 did not already fix it: the extensive stratum with the largest claim whose
  distance to the background exceeds `FAMILY_RADIUS`. If none exists → `surfaceCollapsed`. This is
  why *"having the surface collapsed with the background misses some of the artwork's identity"*
  (`phase2-cal-026`) cannot happen on a many-coloured artwork: a second stratum exists, so no
  collapse is emitted.
- **Foreground and accent** are chosen as an ordered pair. Enumerate all pairs from
  `S ∪ {collapse}` (|S| ≤ ~8, so ≤ 72 pairs), keep the **jointly feasible** ones — foreground
  clears `minTextContrast` as a minimum over the *whole rendered ramp* and against both field
  roles; accent clears `minAccentContrast` under the contract's pointwise conjunction; every
  published pair distinct — then order lexicographically with semiorder bands:
  1. `ink(fg)` descending, banded at `TIE_BAND`;
  2. within band, `min |raw APCA| over the rendered ramp` descending — P5's rule, independently
     adopted by P3, judge-validated unacceptable→strong (`GRAFT_INVENTORY`);
  3. `min OKLab distance from accent to {bg, surface, fg}` descending, banded;
  4. within band, accent chroma descending (P5's verdict-scored tie-break, sweep 4–0);
  5. packed 24-bit integer — a total order, so the output is a function of the image.
  Keys 1–2 encode the reviewer's own demonstration verdict (*the floor stands, the pick within it
  was the defect*): feasibility filters, identity decides inside it.
- **Relaxation chain**, entered only when no feasible pair exists, in this fixed order and never as
  a choice: accent collapses → gradient dropped (which shortens the ramp the foreground must clear,
  usually the binding constraint) and the field re-read as two-block or flat → surface collapses →
  the escape (`#ffffff`/`#000000` at foreground or background, partner collapsed, only if the
  literal is genuinely absent from the artwork).

**Step 10 — validation, not repair.** The invariants run on the published object as a *test*; each
is already enforced during construction — exact pixels (medoids), ramp ends as the field roles,
distinctness (family radius plus the surface rule), contrast (feasibility filter), collapses and
escape (relaxation chain). No repair stage: PHASE_0 §4 records that v2-3's first repair relocated
the defect in 13 of 15 cases.

**Where the contract enters, and why there.** *During*, at exactly three sites: the family radius
(distinctness, fixed before any seat is filled, so it can never be a late repair); the feasibility
filter (contrast over the rendered ramp, at the moment the pair is chosen, because the ramp is what
the foreground must survive); and the relaxation chain (collapses, gradient, escape — the contract's
own vocabulary used as the algorithm's answer to "there is nothing here to publish"). The four roles
and the gradient are one object because they are read off **one** decomposition: the number of
published families equals the number of strata the image has, which is the corrected reframing
`GRAFT_INVENTORY` insists on — *the palette's family structure mirrors the artwork's*: two when the
artwork has two (cover-168's greys and blues), four when it has four (*"the 4 colors … are red,
black, yellow and white"*, `phase2-pair-019`).

## 3. Why it does not die the way the six died

1. **No scalar currency (P1, P4).** Nothing is traded against anything: each seat is decided by one
   physical quantity — enclosure for background, `t`-continuity for the gradient, claim extent for
   surface, ink for foreground, colour distance for accent — and the only multi-quantity comparison
   is a lexicographic cascade with no coefficients. *Honest exposure:* top-one lexicographic ranking
   is itself named in the record as a failure site (`PRIOR_ART_CHECK` §P1: "Top-one ranking is the
   main failure"; T3 leximin "0 fixes anywhere on 171 images"). Those orders ranked quantised colour
   candidates on role-generic colour statistics; this one ranks **strata of a spatial decomposition**
   on structural measurements, and is banded rather than knife-edge. If that difference is not real,
   this dies where they died.
2. **Role assignment is a separate competence (P1's kill).** No objective expresses it; it is the
   shape of the cascade, and each seat's deciding quantity is a *different physical measurement*, so
   swap-indifference is impossible by construction.
3. **Optimizers sit on floors (P6's kill).** Nothing optimises toward a floor. Distinctness is 2×
   the bar because the family partition made it so, not because a search stopped there; the measured
   bracket says 1.5× is silent (`GRAFT_INVENTORY`). Contrast is a filter, and the choice inside it
   is by identity.
4. **Selectors die (P4, fifth confirmation).** Two complete palettes are never compared. The
   relaxation chain is a fixed total order over *contract states* entered on infeasibility, not an
   election between rival answers.
5. **Mass floors block endorsed colours.** There are none. Eligibility is extent, interiority and
   non-shadow — all independent of mass. Presence mass appears once, as evidence for the *surface*
   seat (which role a colour fills), never as a cost on eligibility.

## 4. Robustness argument

Every discrete site, its support, and why it holds:

| site | quantity | support | stability |
|---|---|---|---|
| D1 model order | residual margin in bars | whole image | integral; P5 measured field path bit-stable under dither at ≤1.06× amplification |
| D2 layer accept | claim extent ≥10%, core fraction | ≥10% of canvas | integral; step-function at the gate — **inherited** |
| D3 ground identity | enclosure, girth | whole-image floods | integrals; near-ties fall to area |
| D4 ramp/block/flat | middleBandMass vs 1/6 | ground claim | integral; P5's anchors sit 1.79× and 3.74× off the threshold |
| D5 ramp ends | bin medoid | ≥256 px per end | Lipschitz in the bin's colours |
| D6 stop count | DP ε + λ | ramp path | P1 measured λ=0.1 gave the fleet's best rendition stability (8/8 pairs) |
| D7 family partition | single-linkage at 2 bars | all marks | flips only when a colour gap sits within jitter of the radius — **inherited** |
| D8 eligibility | extent, interiority | family's union | integral |
| D9 fg / accent | `ink(F)`, distance, banded | the **whole family** | this is the fix for P5's 46.2% accent |
| D10 published pixel | medoid | stratum | statistic of a population; a ±1-LSB move stays inside the bar, i.e. counts as agreement |

**Causes removed.** P3's binary edge/depth substrate — a bar threshold feeding a distance
transform, *"the operator that takes a one-pixel change in that step and propagates it across a
region"* (p3 `src/coherence.ts:16-18`) — is absent; nothing here thresholds a local difference.
P5's per-mark argmax is replaced by family integrals; P5 measured that swapping the accent *rule*
changed nothing (51–53% across three rules), which is exactly the prediction that support size, not
the rule, is the problem. P5's `barNeighbourhoodMass` snap (an argmax over mass with a
nearest-distance tie-break) becomes a medoid, removing an argmax site. P2's whole-image region
boundaries are confined to the residual and only ever summed.

**The warning I take most seriously**, because it is measured against a cascade like mine: P2's
dither study attributes 82% of its instability to `c-winner` — both nodes survive, the *ranking*
picks a different one — over "a mark population whose top-64 turns over at 10% … feeding a
lexicographic cluster ranking that has no stability term at all"
(`stability/q1-dither/REPORT.md:62-67`; accent churn 48%, background 13%). My two structural
differences from that: the ranked set is **not truncated** (every eligible family is ranked, so
turnover in a top-k cannot move the winner), and the keys are **banded**, which is the stability
term P2's ranking lacked. If those two are not enough, D9 is where this design bleeds.

**Causes inherited, plainly.** Every hard gate is still a step function — layer-accept core
fraction, `middleBandMass` at 1/6, family radius, extent gate. Semiorder bands help *orderings*, not
gates, and I claim no fix for gates. The same-colour bar's near-black mis-calibration (four strikes,
`GRAFT_INVENTORY`) is inherited whole. I predict no number; the claim is that the largest located
leak — small-support argmaxes — is closed, and what remains is gate-shaped and countable.

## 5. Free parameters

| constant | anchor | if wrong |
|---|---|---|
| Tukey cut 4.685, MAD 1.4826 | literature (95% efficiency) `[INHERITED]` | fit claims too much/little; visible as explained-fraction drift |
| IRLS cap 12, tol 1e-4 | numerical; inert at defaults | none if generous |
| claim radius = 4 bars | contract's own ruler × integer | over/under-segmentation of the field |
| extensive = 10% of canvas | held; P5's `EXTENSIVE_SUPPORT_FRACTION` | small true fields become marks (usually harmless — they stay publishable) |
| layer core fraction | P5 `[UNCALIBRATED]`, single-cover anchor — **re-measure on the corpus first** | spurious or missing layers; the weakest inherited constant |
| `GIRTH_MIN` | **held**; the frame class. Anchored only by geometry (disc = 0.564) | frames steal the background, or a genuinely thin ground is refused. My most likely wrong constant |
| `middleBandMass` < 1/6 | P5 measured bracket (0.0446 / 0.2982) | false or missed gradients — both graded classes |
| end-bin size 256 px | dither: √256 = 16, so mean ±1-LSB error falls below 1/16 LSB | narrower ends (the field guide's recorded defect) or over-wide ends |
| `FAMILY_RADIUS` = 2 × bar | margins bracket: 1.5× silent, 5.4× still complained-at | too small ⇒ near-twin publications (the twin class); too large ⇒ two real colours merged |
| `EXTENT_MIN` | reviewer round; separates title text from the label logo | logo colours published (a graded complaint) or title colours refused |
| DP ε = 2.5 × bar | PHASE_0 §4 pathology P1's inherited excursion bar | off-artwork ramps, or meandering stops |
| λ stop price = 0.1 | P1 measured, 72-cell probe | over- or under-published structure |
| `TIE_BAND` | **measured from the robustness harness**: the jitter of the key under dither | too small ⇒ P5's instability returns; too large ⇒ the cascade always falls through |
| contrast floors ε_raw | the contract's, given | not mine |

Fourteen constants against v2-3's ~900; **two are held and named as such** (`GIRTH_MIN`,
`EXTENT_MIN`) and are pre-registered as the first things a reviewer round should price.

## 6. The failure classes

| class | status |
|---|---|
| Wrong field colour — a face taken as the field | **Structural** (step 3, enclosure). The design's whole new idea; if it fails, the proposal fails |
| False / missed gradient | **Structural** (step 4 decides the boolean before any gradient colour work; P5's discriminator has zero recorded false gradients) |
| Unreadable foreground | **Structural** (feasibility filter over the whole rendered ramp, then relaxation) |
| Colour only in a label logo | **Step 7(a)**, spatial extent — mass-independent, so it does not re-erect a candidacy wall |
| Strong artwork colour missing | **Step 9**: strata are consumed distinctly; an extensive unconsumed stratum reaches the accent seat, which is what *"accent should probably be the red color that occupies the bottom half"* (`phase2-cal-020`) asks for |
| Right colours, wrong roles | **Structural** — every stratum reaches every seat; seats are decided by different measurements |
| Two near-identical shades where the artwork has one | **Structural** — the family partition makes them one family (*"there aren't 2 shades of yellow on that artwork"*, `phase2-cal-022`) |
| Served colour names judged as surface | **Not handled.** Names are downstream of the hex; recorded as a known exposure |
| Field guide §10, sky-and-grass; §10 one-surface shading | **Structural** — the bimodal and the continuous branch of step 4 respectively |
| §10 black bar / frame | **Step 3's girth gate only.** Weakest handling in the design; named |
| §10 white-text-on-photograph | **Partly.** Ink evidence + extent should reach it where P3's ink score could not, but antialiased type over a photo may be absorbed into a layer's claim. Not claimed |
| §10 pointillist / cursive lettering | **Structural** — `ink(F)` sums over the family, so blob count is irrelevant |
| §10 all-one-hue | **Structural** — no hue is forced; the accent key is distance, which a neutral can win |
| §10 role reachability | **Structural** — stated above |
| §10 degenerate / single-colour covers | **Structural** — the relaxation chain ends in the sanctioned escape |
| §10 scrambled-cover test | **Passes by construction** — enclosure and the fit are spatial, so scrambling changes them |
| §10 duplicate covers at multiple resolutions | The robustness axis; addressed by §4, not solved |
| "Many colours" on vivid illustrations | **Better than P5's retreat** (which emptied its pool and published 3 colours): with no accepted layer the ground falls back to the largest single-family node set of the tree of shapes, and the marks pipeline runs unchanged. Unproven |

## 7. Cost

Honest, with the reviewer's standing note that these estimates understate. **300 px: ~0.4–0.7 s**
— IRLS ~0.35 s (P5 measured), floods and distance transforms a few ms, tree of shapes on a small
residual ~50 ms (P2's whole-image build is 685 ms median at native resolution; the residual is a
fraction of it), medoids ~20 ms. **3000 px (9 Mpx, full resolution): ~9–14 s.** The recursive fit
dominates — P5 measured 4.2 s for the base fit at 3000² and `SPEC.md` prices its E2 recursion at
≈9 s; floods and distance transforms are O(N) per layer, ~1 s; the tree of shapes on the residual
1–3 s on a mark-heavy cover. Medoids are capped at each set's 1024 most frequent triples, ~10 ms
each — a *computational* restriction on which pixel represents an already-admitted set, never on
which colours may be admitted. Slower than the previous system's 0.7 s median, and I will not
pretend otherwise; the fit recursion is the first thing to profile.

## 8. Expected failures and falsifier

**Expected bad at:** heavy collage and texture, where no layer is extensive and the fallback ground
is a guess; the frame/bar class, held on one constant; white display type over photographs, which
may be absorbed into a layer's claim before it ever becomes a mark; ramp polarity where both ends
touch the border about equally.

**Falsifier, pre-registered for round 1 (8 items, 3 returning + 5 fresh).** Include the two known
face-as-field artworks (`phase2-cal-020`/`cal-026` item `ab67616d…46be9b20`; `phase2-pair-023` item
`ab67616d…90bed1b2`). **If either still publishes the face colour in a field role, the underneath
test — the one new idea — is wrong, and this design is wrong rather than under-built.** Second,
independent, run before the round: accent-slot disagreement under dither. **If it is not below
~25%** (against P5's 46.2% and P3's 68–70%), "aggregate to the family before deciding" is false and
the small-support diagnosis was mine, not the mechanism's.

## 9. Build plan

**Stage A — palettes in front of the reviewer fastest (~5 days).** Steps 0–4 and 9, with the
residual grouped by **connected components** instead of the tree of shapes and `ink` computed from
erosion mortality on those components. Publishes four roles, the gradient boolean, and 2-stop
ramps. P5's `fieldfit.ts` and `ramp.ts` are grafted directly (Phase 2 prototype code is reusable);
the new code is step 3 (two floods and a distance transform), the medoid, and the step-9 cascade.
Round 1 goes out on Stage A.

**Stage B — the figure half (~5 days).** Tree of shapes on the residual (P2's `tos`, ported), mark
families by single-linkage, extent and antialias eligibility, family-level `ink`, DP+λ guide stops.

**Stage C — the edges (~3 days).** The no-field fallback ground, the escape path, the girth gate's
calibration, and an honesty scan over every constant in §5. Both falsifiers in §8 run at the end of
Stage A, before Stage B is written: if the enclosure test does not fix the face, Stage B is work on
the wrong design.
