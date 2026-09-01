# Tree-first: pigments, strata, and one seating

One substrate (the tree of shapes), one decision. I keep P2's candidate half and throw its election
away — including parts P2 still believed in. The driver is P2's own dither autopsy
(`.worktrees/p2-tree/…/tos/stability/q1-dither/REPORT.md`): **82% of its dither failures are
`c-winner` — both supplying nodes survived and the ranking named a different one, while the colours
stood still** (node-set churn 26%, representative movement 15%). P2 did not have a substrate
problem; it had a problem of *what it ranked*: tree nodes, ordered lexicographically on per-node
floats. This design changes the unit of decision from the node to the colour, and the decision from
a ranking to a seating.

## 1. The design in one paragraph

Decode at native resolution. Build the tree of shapes on L and the two chroma lanes (P2, kept), but
retain nodes by **contrast persistence measured against the contract's own same-colour bar** instead
of an area floor plus MSER growth: a shape is kept when its colour differs from its parent's by more
than the amount the reviewer's calibrated eye calls a different colour. Assign every pixel to the
deepest retained shape containing it — a partition into **patches**. Group patches into
**pigments**: a pigment is one artwork colour, holding an exact publishable triple plus *every*
patch carrying it, so its attributes are sums over many shapes rather than properties of one. Elect
the **canvas** by descending the tree while a single child covers a majority of its parent (the
answer to the frame/bar class). Fit a robust affine OKLab surface to the canvas's patches (P5's IRLS
+ absolute explained-fraction detector); the fit decides `flat | two-block | ramp`, and nothing
downstream may change that boolean. Patches the fit rejects are the **figure**. Then make one
decision: a **seating** — the tuple (field form, background, surface, foreground, accent, collapse
flags, escape) — chosen from the set of seatings the contract permits, by a fixed non-compensatory
sequence of tests whose leading term is an integer count of how many of the artwork's own pigments
the palette represents — no scalar objective, no rival palettes, no argmax over a per-node float.

## 2. Mechanism

**2.1 Decode (contract).** sRGB raw at native resolution, no resample, refuse real transparency
loudly (`PHASE_0_DECISIONS.md` §1); OKLab throughout; exact 8-bit triples are the publication unit.

**2.2 Substrate: three trees of shapes (SALVAGE — P2 `tos/tree.ts`, `tos/lanes/`).** Kept verbatim:
the Géraud–Carlinet–Crozet–Najman quasi-linear tree of shapes on three integer rasters — L at 1/255,
a and b at the same step (161 levels). Three lanes, not one joint tree: P2 measured lanes taking
endorsed reachability 86.6% → 91.9% and the falsifier 3.4% → 1.7%, recovering **74 endorsed slots no
L-lane node could reach** (isoluminant blindness). Per node: parent, level, depth, own/subtree area,
bbox, centroid.

**2.3 Retention: persistence at the bar (NEW — replaces `selectStableNodes`).** For node *n*,
persistence `π(n)` = the OKLab distance between its representative and its parent's. **Retain iff
`π(n) ≥ sameColorBar(repr n, repr parent)`** — the contract's frozen regional bar; root always kept.
P2 instead retained on `subtreeArea ≥ 0.0005·N` plus two MSER growth comparisons, and that area
floor is a mass floor (45 px at 300²) while the median endorsed role colour's exact-triple share is
**8.89e-5**, an order of magnitude below it — GRAFT_INVENTORY names mass floors a negative result.
The persistence rule has **no area term** (a 2%-area saturated sticker has enormous persistence; so
does black title text on white) and it subsumes antialias-ineligibility free, since a halo lives
over a razor-thin band of levels between two real colours, so `π < bar` by construction. I keep P2's
topological interior test (zero constants; 30/113 reachability failures antialias-only) as a cheap
check. This rule is the robustness story's foundation (§4).

**2.4 The patch partition (NEW, trivial).** Every pixel belongs to the deepest retained node
containing it; the L lane's assignment is canonical, chroma lanes contribute patches only where they
split an L patch. Per patch: area fraction, bbox, centroid, parent, persistence, boundary adjacency,
has-interior-pixel, and a colour cloud over its **own** pixels (a field's colour is the field minus
the marks on it — P2's rule, kept). Representative colour = P2's `representativeColor` in
bar-density mode, verbatim, which ends by **snapping to the nearest triple actually present in the
cloud** — so every published colour is an exact artwork pixel by construction.

**2.5 Pigments: the unit of decision (NEW — the central change).** A pigment is one artwork colour.
Build by **leader linkage** over patches in descending evidence order: a patch joins the first
pigment whose representative is within `sameColorBar` of its own, else founds a new one. Leader, not
single linkage — P2 established that single linkage chains through a dense population and deletes
the distinction, and P5 measured bar-granularity single linkage fragmenting "one black" into 70
families. A pigment carries, as **sums over every patch that joined it**: `area` (total visible
fraction), `shapes` (an integer), `ink` (patch area weighted by thinness `inradius/√area` —
per-mass, never per-area; P6 salvage moved readable ink rank 39 → 1), `persistence` (max member, in
bar units), `spread`, `interior`, and `colour` (its highest-evidence patch's representative — an
exact triple). Evidence = `area + ink`, for linkage order and last-resort tiebreak only. *Why this
is the fix:* P2's 82% failure mode is "the ranking named a different node". It is unrepresentable
here: two patches of one colour are one pigment, so a swap between them changes nothing published,
and a swap between pigments requires their summed evidence over the whole image to cross — an
aggregate, not a per-node float. P2's node churn (retained Jaccard 0.861, top-64 survival 90.1%)
perturbs a pigment's sums only by the churning patch's weight, and by §2.3 those are the
low-persistence patches.

**2.6 Chromatic supplementation (SALVAGE — `PRIOR_ART_CHECK.md` §8's bounded hue-anchored
supplementation, the late era's only promoted success; P2 must re-earn it).** 12 anchors at 30°;
where an anchor's ±22.5° window holds no pigment, admit the highest-chroma exact triple there whose
within-bar mask has an interior pixel. Append-only, max two.

**2.7 The canvas: majority descent (NEW).** From the L root, **descend to a child while that single
child covers a majority (>1/2) of its parent's area**; where descent stops is the canvas. This
answers field guide §10's frame/bar class — *"a large uniform bar/frame steals the background role;
never solved; it blocked the campaign's most-requested palette"*. A frame or letterbox has one child
(the image inside) holding a majority, so descent passes through it; a background with a face on it
has a largest child holding a minority, so descent stops and the ambient colour is the ground. One
constant, 1/2, and it is a majority, not a tuning. Two children cannot both hold a majority, so
there is no argmax and no tie at any step — unlike P2's ground chain, greedy descent to the largest
child above `areaFraction ≥ 0.10`, whose **length changed on 69% of dither covers**.

**2.8 Field form: bg, surface, gradient as one decision (SALVAGE — P5).** Fit a robust affine OKLab
surface `c(x,y)` by Tukey IRLS over the canvas patch and its descendants, area-weighted **per
patch** (cheaper than per-pixel, and its residuals are aggregates). P5's core — *the field is what
the fit explains, the overlay is what it rejects* — measured bg/surface **bit-identical across nine
versions** and the field path bit-stable under dither at ≤1.06× amplification. P5's **absolute
explained-fraction** detector (the reworked form that replaced a provably-inert relative one and
cleanly split block covers from photographs, both paths judge-graded) chooses among three forms:

- **ramp** — the fit explains the canvas and the residual is continuous in the fitted parameter *t*.
  `gradient = true`; bg and surface are the pigments at *t*'s two extremes, and the ramp's ends
  *are* the field roles (contract §2).
- **two-block** — the fit fails and the canvas's patches separate into two internally-flat groups
  beyond the bar. `gradient = false`; bg and surface are those groups' pigments. P5's t-continuity
  discriminator makes this call; it is the *"the sky and the grass are just different areas"* case,
  the field guide's founding gradient-semantics constraint.
- **flat** — one pigment survives. `surfaceCollapsed = true`, `gradient = false`.

**Gradient neutrality is by construction** (field guide §2.4: a wrongly allowed gradient is exactly
as bad as a wrongly prevented one, and every mechanism built *inside* candidate generation broke
neutrality). The boolean is fixed here from the fit's own statistic, before any stop colour is
drawn; §2.9–§2.10 can only fill seats. I deliberately **do not** carry P2's gradient machinery
forward: its laminarity/monotonicity cascade measured **45.8% agreement against 144 human labels —
worse than always answering "flat" (52.8%)**, phantom rate 69.2%, 0 of 77 grid cells surviving Holm
(`tos/stability/q2-laminarity/REPORT.md`), while P5 drew zero gradient complaints in either
direction over six published ramps (`phase2-cal-013`). That is the evidenced swap.

**2.9 Guide stops (SALVAGE — P2 `gradient/guide-stop.ts`; canon `PHASE_0_DECISIONS.md` §2).** With
the ends fixed, sample the rendered OKLab segment; if a sample's distance to the nearest populated
artwork colour exceeds the bar by the canon's multiple, insert **one** interior stop from the
canvas's own pigments, kept only if overshoot falls, subject to spacing (banding) and monotone
order. P2's owed-stop census: **zero on demo-20 + fresh-40** vs the legacy 42%. Excursion reduction
is the only admissible reason; a fourth stop is never reached for.

**2.10 The seating: the whole palette as one decision (NEW).** The decision variable is one object —
**S = (fieldForm, background, surface, foreground, accent, surfaceCollapsed, accentCollapsed,
escape)**. `fieldForm`, `background` and `surface` are determined by §2.8; that is not staging but
the claim that **the field is measured and the figure is chosen**. What remains free is which
pigments take the ink seats and whether accent collapses.

**Σ, the feasible set**, is every S the contract permits: four exact artwork pixels, every published
pair distinct above `sameColorBar(pair)`, fg and accent clearing their floors as a **minimum over
the whole rendered ramp** (contract §2 — the ruling that it is not "each stop"), collapses
exact-and-declared, the escape's four conditions. Σ is enumerated, never repaired (PHASE_0 §4:
v2-3's first repair *relocated* the defect in 13/15 cases), and it is small — hundreds of pigments,
one free pair — so enumeration is thousands of tuples; P6's verified exact branch-and-bound is on
the shelf if a cover ever needs it. **The choice within Σ is a fixed non-compensatory sequence.**
Each test eliminates or is indifferent; a test that would empty Σ is skipped; no test can overturn
one above it, so no exchange rate exists — which is what killed P6.

| # | test | enforces | evidence |
|---|---|---|---|
| T1 | **Stratum.** fg and accent are pigments carried by figure patches (rejected by §2.8's fit). A field neutral cannot reach an ink seat while any figure pigment is feasible. | *"the Zen grey is not a foreground or accent color. If we must include it, it must be either background or surface"* — `phase2-pair-019/…099e97d1` |
| T2 | **Ink.** If any figure pigment carries a coherent text group (§2.11), fg must be one. | P2's text-led fg was the leading group's colour 16/20; the reviewer prescribes typography colours four times near-verbatim (cal-022, cal-025, pair-023) |
| T3 | **Identity coverage.** Maximise the **integer count of distinct pigments** the four published colours represent. | *"at least one color must be pink"*; *"missing the distinctive red"*; *"surface collapsed with the background misses some of the artwork's identity"* (12 + 3 notes) |
| T4 | **Presence.** Maximise the **minimum persistence, in bar units**, among the seated figure pigments. Persistence, not mass. | *"its presence in the artwork looks accidental"*; *"only present in the very small label logo"* (7 notes); salience beats mass (P5 round 5: a 2%-area sticker strong, mass-1505 rejected for a named mass-306) |
| T5 | **Prominence.** Maximise total `area + ink` of the seated pigments. | last resort only |
| T6 | **Determinism.** Lowest packed RGB. | P2's settled fall-through |

**T3 is load-bearing and does four things at once.** (i) It is an *integer*, so it has wide plateaus
and cannot move on a fifth-decimal jitter — the defect `roles/NOTES.md` names. (ii) It forbids twins
with **no margin constant**: two colours inside one bar are one pigment, so a seating spending two
seats on them covers fewer and loses — *"there aren't 2 shades of yellow on that artwork"* (cal-022)
handled without pricing a margin, the repo's most-relapsed failure and P6's kill. (iii) It makes
collapse a **priced defect, not a neutral outcome**: an uncollapsed seating covers one more pigment,
so collapse survives only when nothing feasible raises the count. (iv) It is set-conditioned, as
asked: *"Black accent could work if all other color picks are very chromatic"* (cal-020) — black
raises the count when the other three are chromatic and not otherwise, with no rule about black
anywhere.

**Ties become structure; they are not broken.** Two large canvas pigments near-tied for "the field"
do not compete — §2.8 seats them as background and surface (two-block), so the most consequential
role pair is never decided by an argmax. Two figure pigments tied under T3–T5 are either within a
bar (same pigment, no consequence) or genuinely interchangeable; T6 decides and the reviewer sees
one of two defensible palettes. Honest: this is where residual instability lives (§4.5). **No
feasible seating?** Relax: ramp → two-block → flat (`surfaceCollapsed`) → `accentCollapsed` →
escape. The **field relaxes first**, because a wrong background poisons everything — *"incorrect
background, the rest is hard to judge in front of that incorrect background"* (`phase2-cal-017`);
the escape is last and declared. **And T1 is a preference, not a wall:** if no figure pigment yields
a feasible seating, field pigments become eligible for the ink seats and Σ is re-enumerated over all
pigments, so every pigment reaches every role (field guide §10.36, goal 3).

**2.11 Text detection (SALVAGE — P2 `roles/text.ts`).** Stroke width from the exact Euclidean
distance transform's ridge, plus height, thinness, centroid; split into rows on centroid and height
agreement; a row is coherent at ≥4 members with bounded stroke-CV, height-CV and collinearity
(recall 19/20 demo covers). Two changes: grouping is by **pigment**, not a re-derived `clusterByBar`
union-find (one pair crossing the bar merges two clusters wholesale); and **size is never a
penalty**, per field guide §2.9, which records the previous detector penalising large type, unfixed.

## 3. Why it does not die the way the six died

- **"No scalar currency judges like the reviewer"** (P1 role-level, P4 selection-level, τ-b −0.342).
  There is no currency: a non-compensatory sequence led by an integer count, nothing traded against
  anything, so no exchange rate exists to misprice; T5, the one continuous quantity, can never
  overturn T3 or T4.
- **"Role assignment is a separate judged competence."** A separate stage of the *same object*:
  extraction yields pigments with no seats attached, the seating is one tuple chosen jointly, and
  seat complaints (class f) are T1+T3 questions over that tuple, not a per-role comparator.
- **"Optimizers sit on floors; the judge grades margins."** The contract's floors bound Σ; inside Σ
  nothing rewards proximity to them. Twins die by T3's pigment count — a *structural* margin — so no
  margin rate is hand-set, the exact relapse that killed P6.
- **"Selectors die"** (fifth confirmation). No rival answers, no members: one substrate, one pigment
  set, one seating, constructed; field and figure subsystems composed structurally through Σ and the
  rendered ramp, as GRAFT_INVENTORY prescribes.
- **"Mass floors block endorsed colours."** §2.3 has no area term; presence is evidence about
  *which* role a colour fills (T4, T5), never eligibility.

## 4. Robustness argument

1. **Node retention (§2.3).** A ±1-LSB dither moves any level by ≤1 and any persistence by ≤2 LSB.
   The cut is the same-colour bar — 0.0093–0.0229 OKLab, roughly 2×–6× the 1/255 L step — so it sits
   several noise units above the noise and only nodes within 2 LSB of it can flip. **Those nodes are
   by definition ones whose colour is within a bar of their parent's** — the reviewer would call
   them the same colour, so losing them cannot change a published colour. This is the central
   structural claim, and it costs zero constants because the cut *is* the contract's calibrated
   ruler. Removes P2's area floor and both MSER growth comparisons.
2. **Pigment aggregation (§2.5)** removes the dominant failure outright: P2's `c-winner` class — 82%
   of dither failures, *"the ranking naming a different node while the colours themselves stand
   still"* — is unrepresentable when the ranked item is the colour. P2 tried the obvious repair
   (indifference classes) and measured **exactly zero movement** (9.0% → 9.0%, dither 23.0% → 23.0%,
   *"the same trials as before, to the trial"*), diagnosing that a band is destabilising when the
   candidate *set* churns, since it hands the decision to every member of the band. Pigments are not
   a band over a churning set: they redefine the ranked item, and its attributes are sums.
3. **Majority descent (§2.7)** removes P2's ground chain, whose length changed on **69%** of dither
   covers: at most one child can hold a majority, so there is no argmax at any step.
4. **Field form (§2.8)** is a fit statistic over area integrals — P5 measured bg/surface
   bit-identical across nine versions, field path stable under dither at ≤1.06× amplification, so
   the reviewer's *blocking* role pair sits on the most stable machinery the campaign produced. And
   **T3, the leading seating test, is an integer count**: a perturbation must change *which pigments
   exist* to move it, which §2.3 bounds.
5. **Inherited instability.** (a) P2 measured **7.6% of surviving regions change representative past
   the bar under ±1-LSB dither** — a floor on any exact-pixel mechanism using bar-density
   representatives; pigment aggregation dampens it (a pigment's colour comes from its
   highest-evidence patch, usually a large one) but does not remove it. (b) T4/T5/T6 ties between
   genuinely different pigments are real, and broken by hex. I expect the residue in the accent
   seat, the least stable role in every arm (P3 68–70%, P5 46.2%, P2 65.8%). No number claimed; the
   measurement is §8.

## 5. Free parameters

| constant | value | anchor | if wrong |
|---|---|---|---|
| `sameColorBar(pair)` | 4 regional values, frozen | **contract**, calibrated Phase 0, 130 fitted points | drives retention, pigments, distinctness, excursion; the upward packet (4 near-black strikes) says it is too tight near black, which would over-split dark pigments |
| majority fraction | 1/2 | **derived** — two children cannot both hold a majority | lower: descent runs into a sub-region; higher: frames win the background |
| explained-fraction cut | measured | **corpus**, P5's absolute form | the one genuinely empirical threshold here; wrong ⇒ false or missed gradients |
| Tukey `c` | 4.685·MAD | **statistical standard**, inherited with the estimator | changes which patches are outliers; not tuned |
| `minTextContrast`, `minAccentContrast` | ε near 0, user-raisable | **contract** §2 | the contract's, not mine |
| `ACCENT_FUNCTIONAL_DISTANCE` | 0.14591 `[UNCALIBRATED]` | **contract** placeholder; two rounds declined to measure it | accent escape too wide or too narrow |
| stop spacing floor | ~3% of ramp | **reviewer round** — tight spacing reads as banding | banding, or a refused legitimate guide stop |
| text-group shape constants (5) | P2's | **held**, unchanged | detector misses a group ⇒ T2 skipped ⇒ fg falls to T3 |
| hue anchors | 12 at 30°, cap 2 | **held**, prior art's shipped form | recall only; append-only, cannot displace |

**The human decisions**, all three: (1) a shape is worth a decision when its contrast to its parent
exceeds the same-colour bar; (2) the canvas is found by majority descent; (3) identity coverage
outranks presence outranks prominence, and ink outranks everything for the fg seat. **~13 free
constants**, 5 the contract's and 5 P2's text detector — against v2-3's ~900 and P2's ~40 live
tunables (1 `[MEASURED]`, most `[UNCALIBRATED]`).

## 6. The failure classes

Classes from the 40 distinct phase2-* reviewer notes (206 warehouse rows dedupe to 82 palettes).

- **(a) Wrong field colour — a face taken as background** (11 notes; dominant and *blocking*; the
  same cover failed identically at P5 0.8.2 and 0.9.2). **Handled structurally — the design's
  strongest claim.** A face is a shape *laid on* the ground: a child in the tree, not holding a
  majority of the canvas, rejected by the affine fit; it reaches the figure stratum, not the field.
  P5 recorded face-as-field as *"structurally inexpressible"* three rounds running and the fleet
  confirmed it; nesting is the expression it was missing. **Caveat:** a full-bleed portrait whose
  face *does* hold a majority defeats this, and I expect real losses there.
- **(b) False / missed gradient** (7 notes, 5 false). §2.8: P5's detector, judge-measured at zero
  gradient complaints either direction; P2's falsified laminarity cascade discarded; neutrality by
  construction. *"it's very clearly all flat"* is the flat branch, *"no green-to-brown"* two-block.
- **(c) Unreadable or wrongly-sourced foreground** (14 notes, the largest class). Contrast: the
  floors bound Σ over the whole rendered ramp, so an unreadable fg is not enumerable. Wrong object:
  T1 + T2. The ruling that *the floor must reject but rejection must fall back to another artwork
  colour, never synthesised black/white* (pair-018) is Σ's relaxation ladder with the escape last.
- **(d) Colour only in a label logo / accidental** (7 notes). **Partially handled, and I say so.**
  Persistence cannot separate a crisp logo from crisp title text; T4 and T2 (a logo rarely forms a
  ≥4-member collinear row of matched strokes) push against it, and the interior test catches
  accidental shadows. GRAFT_INVENTORY names this the fleet's **one confirmed shared inexpressible**;
  not solved.
- **(e) Strong artwork colour missing** (12 notes). T3 directly — the seating maximising pigment
  count carries the pink — plus §2.6's recall guard. **(f) Right colours, wrong seats** (7 notes).
  T1 gives the field/ink split the reviewer's language tracks, and a swap is a different member of Σ
  judged on the same tests.
- **(g) Two near-identical shades** (3 notes) — T3, no margin constant. **(h) Collapse read as a
  defect** (3 notes) — T3 makes collapse cost a pigment.

**Field guide §10 cases I consider decisive.** *Frame/bar* — §2.7. *All-one-hue* — T3 counts
pigments, not hues, so a neutral accent wins on an all-red cover with no rule about neutrals. *Giant
coloured display text* — T2, size never a penalty. *One-surface shading vs sky-and-grass* — the two
branches of §2.8. *Pointillist/cursive lettering* — pigments aggregate across many small patches,
which per-letter analysis cannot; the row test may still miss, and T3 then carries the colour into
the palette if not the fg seat. *Degenerate artworks* — the ladder ends at the declared escape;
crash sweep in week one.

## 7. Cost

| stage | 300 px | 3000 px |
|---|---|---|
| decode + OKLab | ~5 ms | ~0.4 s |
| three trees of shapes | ~180 ms | **~5–9 s** |
| patches + representatives | ~20 ms | ~0.6 s |
| pigments, fit, seating | ~15 ms | ~0.05 s (hundreds of pigments, not millions of pixels) |

| **total** | **~0.25 s** | **~6–10 s** |

Cold, per file, single-threaded, plain image code, no model. P2 measured 617 ms for the merged
3-lane parse at 300² and 627 ms for a full palette; my downstream is cheaper and my retention prunes
harder. **The 3000 px figure is the honest weak point**, landing in the exceptional-justification
bracket (SAM at ~6.2 s "counts as slow"). The tree build is the only superlinear stage. The obvious
mitigation — quantising tree levels to bar granularity — is the repo's known instability source
(v2's 0.04 grid moved 114/114 palettes under dither) and I will not take it without a neutrality
census. The honest alternatives are engineering: the lane trees are independent and embarrassingly
parallel.

## 8. Expected failures and falsifier

**Expect to be bad at:** full-bleed photographs with no shape structure (P2's own recorded mechanism
limit); a portrait whose face holds the majority; logo-vs-title-text (the fleet's inexpressible);
radial shading an affine fit reads as noise; identity carried by texture; latency at 3000 px.

**Pre-registered falsifiers.** (1) *Substrate, before any reviewer sees anything.* ±1-LSB dither on
100 covers; measure how often the **pigment set** changes membership and how often the **canvas
node** changes. If the pigment set churns on >10% of covers, the persistence-at-the-bar claim (§2.3,
§4.1) is false and the whole robustness argument goes with it — *wrong*, not under-built, because
there is no lever: the cut is the contract's ruler, not a parameter. (2) *Judge, first round of 8.*
The novel load-bearing claim is that **field roles are measured (nesting + fit) while ink roles are
chosen (seating)**. If class-(a) complaints are not materially reduced against P5's rate on the same
covers (the beige-face cover `ab67616d0000b27300094a786a28459646be9b20` is the standing probe — it
failed identically at 0.8.2 and 0.9.2), then nesting is not the expression the fleet was missing and
the premise is wrong. Under-built looks different: right stratum, wrong pigment in it. **Not a
falsifier:** weak first-round grades on the ink seats — T2–T5's ordering is what I iterate on.

**Exposable intermediates.** Retained-shape map, patch partition, the pigment list with exact hexes
and supporting shapes highlighted, the canvas node, the field/figure mask, Σ with each test's
eliminations annotated — the reviewer can be shown what the algorithm thinks this artwork's colours
are before any seat is filled.

## 9. Build plan

1. **Week 1 — substrate to pigments.** Lift P2's `tree.ts`, `lanes/`, `representativeColor`,
   `roles/text.ts`, `roles/eligibility.ts` wholesale; replace `selectStableNodes` with §2.3; build
   patches and pigments. Deliverable: per-cover pigment dumps with exact hexes and supporting-shape
   overlays, plus the crash sweep. **Run falsifier 1 here** — a day, and it decides whether the rest
   is worth building.
2. **Week 2 — field and first palettes.** Majority descent, P5's IRLS fit and explained-fraction
   detector, the three field forms, guide stops; seat fg/accent on T1+T3 only. **This is enough for
   the reviewer's first round** — four colours, a gradient boolean, contract-legal. In front of the
   judge here, not after the ordering is done.
3. **Week 3 — the full seating.** Σ enumeration under the contract, T2/T4/T5/T6, the relaxation
   ladder, the escape, hue-anchor supplementation. Second round on fresh covers (the dev-set trap
   emerged within ~3 rounds; fresh draws are load-bearing, not hygiene). **Later:** cost at 3000 px,
   the fourth stop, parallel lane builds.

Three weeks to a judged second round, the substrate falsifier answering in week one. Largest
schedule risk: P5's IRLS fit, the one piece taken from another arm's codebase rather than P2's.
