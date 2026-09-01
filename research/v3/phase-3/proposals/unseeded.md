# Proposal — ground-and-marks, decided on certified margins

*Unseeded author: no starting angle given. §10 states convergence with the five seeded angles.*

## 1. The design in one paragraph

Read the image at full resolution into a **flared** OKLab (§2.1). Fit one outlier-resistant colour surface to the whole
image; refit recursively on what it fails to explain, giving a few **field components**. Choose the **ground** among them
by two large-scale geometric aggregates — *reach* (how much of the frame border its support covers) and *thickness* (its
inradius): a black bar has reach without thickness, a depicted face has thickness without reach, a real ground has both.
Decide the field's **structure** — flat, two-block or ramp — on the ground's own fit, *before any colour is read*, so the
gradient boolean is neutral by construction. Background and surface follow: the ramp's two ends (which end is background
is forced by the render's direction), the two blocks ordered by reach, a panel, or a declared collapse. What no component
explains is grouped into **marks**; marks eligible by *span or mass* — never mass alone — supply foreground and accent,
chosen jointly with the fixed field pair inside the contract's feasible set, which filters *during* the decision, with no
repair stage. Under all of it: **every comparison is computed as an interval provably containing the quantity under any
±1-LSB perturbation of the input, and a comparison whose intervals overlap is not a decision — it falls through to a
coarser criterion.** The fleet located one shared instability cause (argmax over near-equal margins) and no arm built a
computed-bound fix. §2.8 does; §4 says what it cannot buy.

## 2. Mechanism

### 2.1 Colour space, and the perturbation radius ρ *(both new)*

sRGB → linear → **add a black-flare term `Y0` to each linear channel, renormalise so white is unmoved** → OKLab. Every
distance, bar and residual below lives there.

Why: the same-colour bar is recorded mis-calibrated near black, four independent strikes (`GRAFT_INVENTORY.md`,
high-confidence item 3). I measured the cost. `#000000` vs `#0a0a0a` — two blacks — is **0.1448** in plain OKLab against a
`dark-neutral` bar of **0.00932** (`src/contract/constants.ts`): **15.5× the bar** for a pair a viewer calls one colour.
OKLab's cube root has no toe; CIE L* has one for exactly this reason. With `Y0 = 0.005` (a lit-room display black level —
a physical anchor, not a fit) that pair measures **0.0292**, while a mid-grey pair moves 0.0336→0.0330, near-white
0.0298→0.0297 and a red/orange pair 0.1211→0.1187: one constant, near-zero collateral. *(My arithmetic this session.)*

Per distinct source triple, `ρ` = max over its six ±1-LSB single-channel neighbours of the flared-OKLab distance. Cached;
negligible cost. ρ is the certified radius of "a change that must not matter" — the reviewer's own wording for robustness
(`PHASE_2_HANDOFF.md` §4) — and the unit every interval is built from. It also covers a second defect: below sRGB value ≈5
one grey LSB is itself 0.0175–0.067 OKLab, above the dark bar.

### 2.2 Robust field fit and its recursion *(P5 `fieldfit.ts`, kept nearly whole)*

Per OKLab channel, an order-0 (robust centre) and order-1 (affine in normalised x,y) model, fitted by **Tukey-biweight
IRLS on the residual norm** — one weight per pixel shared by three channels — over a deterministic stratified lattice
subsample, then weights, σ̂ and explained fraction recomputed **at full resolution** against the converged model (P5's
constants inherited). *The fit is the segmentation.* `fieldExplainedFraction` = fraction of all pixels with residual norm
under `EXPLAINED_RADIUS = 4 × bar` — an **absolute** location, not a spread (P5 proved the relative forms inert:
`inlierFraction < 0.5` is unreachable identically). Below 0.5, refit on what nothing has explained yet, to depth 4. This
is the substrate because it is the fleet's strongest stability datum: P5's bg/surface were **bit-identical across nine
versions**, bit-stable under dither at ≤1.06× amplification. Everything that failed in P5 failed *after* the fit.

### 2.3 The ground test: reach × thickness *(new; `reach` re-earns incumbent prior art)*

Per component, take its largest 4-connected support: **reach** = fraction of the image's border pixels it covers;
**thickness** = (max of its exact Euclidean distance transform) ÷ image short side. The **ground** = greatest reach among
components with `thickness ≥ T`; ties fall to the thicker (§2.8 defines a tie).

- a bar, frame or banner has reach ≈ 1, thickness ≈ 0 → **never the ground**; the search descends past it. The field guide
  calls this class unsolved; it blocked the campaign's most-requested palette.
- a depicted face, however smooth or large, has thickness but **reach ≈ 0** → never the ground. This is the fleet's
  declared inexpressible — *"this color is the face of the character and not actually the background"* (`phase2-cal-020`,
  again at `-cal-026` and `-pair-023`; p5 ruling R3 filed it "record-not-build"). It **is** expressible in one aggregate:
  a ground is *behind* things, a subject is *in front of* them, and in a rectangle that difference reaches the border.
- if nothing passes `T`: the **no-ground regime** — P5's declared retreat (highest field-mass triple, background =
  surface, roles from the overlay), flagged, never silent.

`reach` re-earns prior art that mostly worked (`extractColors.ts:208`; border flood; P2's "the field is what reaches the
frame"); `thickness` is new and stops reach handing the ground to a bar. Both are aggregates over a fit-produced support,
not thresholds on a noisy per-pixel map.

### 2.4 Field structure and the gradient boolean *(P1 salvage — λ-priced structure selection)*

Three structures priced for the ground in bar units as `robust residual + λ · parameters`, at P1's measured `λ = 0.1`
(72-cell probe) — the sub-decision the graft inventory sanctions ("never as the whole objective"), and the fleet's best
rendition stability, 8/8 pairs. **flat** = order-0. **ramp** = order-1, admitted only when its improvement over order-0
**exceeds its certified interval** (§2.8); P5 admitted order-1 whenever `marginBars > 0`, a knife edge, and false
gradients outnumber missed ones **5:1** in the reviewer's notes (3 of 5 `unacceptable`: *"there is no gradient in this
artwork, it's very clearly all flat"*) — so the asymmetry goes in the mechanism, not a threshold. **two-block** = the
ground plus a second component also passing reach and thickness.

`gradient = (structure == ramp)`, decided **before any colour is read** — neutrality by construction, which the field
guide says is the only way it ever held. It also delivers the guide's hardest gradient distinction: *one shaded surface*
is one component with an order-1 model; *sky-and-grass* is two components, each order-0 — flat by construction, not by
threshold.

### 2.5 Background and surface *(P5 field ends; field-guide endpoint walk; P3 exact-pixel discipline)*

- **Ramp.** `t` = the ground's pixels projected on the fitted colour gradient's spatial direction, re-parameterised so the
  render's own start (135°) is `t = 0`; **which end is background is therefore forced by geometry, never compared.** Each
  end is the modal exact triple within a bar of the fitted end, then walked outward along the principal axis of *the
  field's own pixels' OKLab colours* while source support holds — the field guide's measured fix for narrow endpoints —
  guarded so no step lands within the publication margin of another published colour, verifying the snapped pixel, not the
  target.
- **Two blocks:** background = greater reach, surface = the other. **Flat:** background = the ground's modal triple;
  surface = the modal triple of the best **panel** (thickness ≥ T, less reach) if one exists, else `surfaceCollapsed` — a
  panel beats a collapse because the reviewer prices collapse (*"having the surface collapsed with the background misses
  some of the artwork's identity"*, `phase2-cal-026`).
- If a ramp's ends fail distinctness at the margin the contract says there is no gradient (`PHASE_2_HANDOFF.md` §5):
  structure backtracks to flat and this step re-runs.

Every published value is an exact source pixel redeemed by index — P3 held that across seven rounds with **zero "shade not
in artwork" complaints** while other arms drew them.

### 2.6 Marks *(P5 `marks.ts`, built and measured but never wired; P3 coherence eligibility)*

**Mark mask** = pixels whose residual to the nearest field model exceeds `max(4 bars, κ·ρ)`. **Grouping** = spatial
connectivity at a scale chosen by scale-space stability: single-linkage under chessboard dilation on a geometric √2 radius
ladder, the scale being the longest run of rungs with unchanged component count. Spatial grouping is what P3 and P5
independently named the one big unbuilt piece; P5 measured why colour clustering cannot substitute (erosion mortality
60/60 — such a "support" is a colour family's scatter, not a mark). Each group carries support, **span** = bbox diagonal ÷
image diagonal, mass, and colour = the modal exact triple within a bar of its robust colour.

**Eligibility: `span ≥ S` OR `mass ≥ M`.** No mass floor gates anything alone — that is the falsified wall (median
endorsed role colour's exact-triple share **8.89e-5**; four reviewer-named marks refused at 0.025–0.060% against a 0.1%
floor). The disjunction is **new**, and is my attempt at the fleet's one confirmed shared inexpressible: **giant title
text has tiny mass but spans the canvas; a 2%-area sticker has small span but real mass; a record-label logo has neither**
— the reviewer's own split (*"they are only present in the very small label logo at the bottom"*, `phase2-cal-025`,
`unacceptable`, against repeatedly endorsed title-text marks). A colour present only as antialiasing or shadow forms no
coherent group at any rung and fails both.

### 2.7 The four roles and the gradient as one palette

Field pair and gradient are fixed by §2.4–2.5. The figure pair is solved **against them**, over eligible mark colours plus
the two sanctioned collapses. The palette is one object because the figure tier is *defined* as what the field's own model
rejects — not because a scoring function ties four independent lanes together. The reviewer stated this architecture
unprompted as their ideal: *"ground pair as one family's two shades (the field ramp's ends), figure pair from the marks
laid over it"* (p5 `STATE.md`). I take it as a two-**tier** claim only, not a two-**family** one: cover-19's ideal puts
the field in two different families, and the tier structure delivers that too.

**The contract enters during, as the feasible set.** An assignment exists only if it satisfies exact-pixel support,
pairwise distinctness at the publication **margin** `μ × bar` (not at the bar), both APCA floors as a **minimum over the
whole rendered ramp**, ramp-end identities and escape legality. Infeasible assignments do not exist. No repair stage — a
repair re-validates everything, and v2-3's first repair *relocated* the defect in 13 of 15 cases (`PHASE_0_DECISIONS.md`
§4). Among feasible assignments, three criteria, strictly ordered, no sum, no exchange rate:

1. **Coverage** — how many distinct identity families (bar-neighbourhood families of the artwork's own colours) the four
   published colours span. A *set* criterion, which per-role argmax structurally cannot express; P5 shipped it. It answers
   the joint-most-frequent complaint class (9 of 39 commented items: *"missing the distinctive red color (could be a good
   pick for the accent)"*).
2. **Foreground ink evidence** — **graft P2's `roles/text.ts` whole**: per mark component, stroke width = 2 × median
   distance-transform value along the ridge; group by conjunction of stroke-width CV ≤ 0.4, height CV ≤ 0.35, centroid
   collinearity ≤ 0.15, colours equal under the bar, ≥ 4 components (17/20 demo covers yield a text group; the foreground
   is the leading group's colour on 13/20). The legibility floor filters, identity picks *within* it — the reviewer's own
   demonstration (*"side A has the right idea to take a color from the artwork for the foreground, but it did not pick the
   correct one… However there are valid picks in the image such as Charcoal or Putty"*, `phase2-pair-018`).
3. **Accent identity** — **per-mass** salience (P6 salvage: per-mass reading moved a readable ink from rank 39 to 1; an
   area integral ranks text by area) × chromatic departure from the field pair, minimum over the two field colours. Accent
   is where arms agree least (P4's M1: 95–100% cross-arm disagreement vs 45–65% on background) and where P5's instability
   concentrated (46.2%), so it gets the most aggregated criterion available.

If no feasible foreground exists the contract's **escape** fires, declared: `#ffffff` or `#000000` at foreground,
whichever maximises the minimum |raw APCA| over the ramp, accent collapsed. That closes `PRIOR_ART_CHECK.md` coverage hole
5 — the escape no proposal ever gave a mechanism.

### 2.8 Certified intervals *(new — §4 answers P2's negative result on the nearest prior attempt)*

Every quantity a decision compares is computed twice, as a **guaranteed lower and upper bound under any ±1-LSB
perturbation of the input**: per-pixel contributions vary within their own ρ, bounding sums and means; **support
membership** can change only for pixels whose residual or connectivity radius sits within ρ of the inclusion radius, and
those are counted and swung both ways; IRLS coefficients get the weighted-least-squares perturbation bound plus the
biweight's Lipschitz weight term.

A comparison is a **decision** only when the intervals are disjoint. Overlapping intervals are a **tie** and the ordering
falls through to the next criterion, which is coarser and separates more widely. The chain ends in a fixed convention (the
darker end; the greater reach) over candidates by then certified within a bar of each other — so a hex difference there is
not a perceptual difference in the harness's own currency (`src/robustness/compare.ts` compares under the regional bar,
not hex; I checked, so the reported instability is real, not a metric artifact). A loose bound produces more ties —
**conservatism, never instability** — which is what makes this affordable before the bounds are tight. Every palette
carries a certificate: how many of its seven decisions were certified.

### 2.9 Guide stops *(P2 `gradient/excursion.ts` + `guide-stop.ts`, grafted whole)*

Excursion is measured on the *rendered* ramp against the nearest exact artwork triple, in bar units, ceiling 2.5. One
interior stop is inserted at the worst excursion from the ground's own pixels, kept only if the overshoot falls by
`min(overshootBefore, one bar)`, under three counted refusal classes (`meander`, `spacing-below-bar`, `no-candidate`) that
make meandering and coverage-expansion *unreachable rather than forbidden*. Owed-stop census: **zero** on demo-20 and
fresh-40 against the 42% legacy figure. Re-validate the palette after each insertion.

## 3. Why it does not die the way the six died

- **No scalar currency judges like the reviewer** (P1, P4). Nothing sums, weights or trades; §2.7's three criteria are
  heterogeneous and strictly ordered. λ appears once, in bar units, at the one sub-decision the salvage sanctions.
- **Role assignment is a separate competence from extraction.** My pushback: it is separate *only when extraction has no
  spatial decomposition*. P1's post-mortem is the evidence: its energy is swap-indifferent **by construction** because the
  code family differs for field↔ink and cannot differ within a family, and *"the reviewer's four demands were field↔ink"*.
  A design whose extraction **is** a field/figure decomposition has that distinction structurally, and the within-tier
  order is then forced by geometry (render start; reach) or ink evidence. P6's role vocabulary was "structurally
  degenerate at every anisotropy" for the same reason. Falsifiable — §8.3.
- **Optimizers sit on floors; the judge grades margins.** No optimizer, and feasibility is at `μ × bar`, so sitting on the
  bar is *infeasible* rather than optimal. Counter-pressure noted: P5's narrowest-ever pairs drew silent STRONGs (1.504×)
  and within-pair family sharing is often right, so μ is a modest publication margin, not a separation reward.
- **Selectors die** (five times). One extractor, one decomposition, one construction; rival whole palettes are never
  built, so nothing elects between them, and §2.7 is backtracking inside one construction under constraints. Honest
  residual risk: §2.7's ordering is a comparator, this repo's most-relapsed shape. My defences — it is P5's shipped shape
  and was never its failure site; level 1 is a set criterion no per-role rule can express; every level decides only on
  certified separation.
- **Mass floors block endorsed colours.** Field colours have no floor; marks are eligible by span **or** mass, so any
  colour forming a coherent mark reaches any figure role.

**Two grafts I decline.** *Exact joint search* (P6) — a solver for a scalar objective, and there is no scalar here; it
also failed to terminate on 2 of demo-20. *Tree of shapes* (P2, 91.9% endorsed reachability) — its benefit is reachability
and nesting, and recursive component fitting plus residual connectivity supplies both without a tree whose node-set churn
P2's own STATE.md calls its hardest open item; its chromatic lanes exist because its tree is built on L, whereas a
three-channel colour residual is not isoluminant-blind. If reachability measures worse than 91.9% on P2's instrument, the
tree comes back.

## 4. Robustness argument

Seven discrete decisions: field structure; which component is the ground; ramp direction and ends; mark grouping scale;
mark eligibility; the (fg, accent) assignment; guide-stop insertion. Each is made on interval-certified comparisons, and
the two most consequential rest on aggregates over thousands of pixels.

**Removed causes.** P3's located cause — *"a bar is a step function of a noisy measurement, and a distance transform is
the operator that takes a one-pixel change in that step and propagates it across a region"* — is gone: no thresholded edge
map exists, and the one distance transform runs on a fit-produced support. P5's located cause — *"argmax over near-equal
margins"*, whose pass-7 measurement cut accent instability **52.5 → 35.5** by moving to a large aggregate — is what §2.8
attacks, generalised to every comparison.

**The negative result I have to answer.** P2 built the nearest thing to §2.8 and it did not pay: *ruler-indifference* —
sort by the quantity, open an indifference class when a candidate falls a full band below its class leader, compare class
indices — moved the topline **not at all** (600 trials: overall 9.0% before and after, dither 23.0% both, all twenty
palettes byte-identical). Two differences, and I claim only these. P2's bands are **fixed inherited constants**; §2.8's
are **computed bounds on that quantity's actual movement on that image**, widening where the evidence is weak, which a
constant band cannot do. And classing **replaces one boundary with another** — a candidate crosses a class edge, then
class indices are compared, so the knife edge survives; §2.8 declines to decide and falls through instead. What it
honestly does *not* buy: the overlap test is itself a boundary, and near it the answer flips between "decided at level 1"
and "decided at level 2". So the claim is bounded — **instability concentrated at one explicit, counted site rather than
spread across every comparison** — and the certificate rate makes it measurable. If P2's result generalises past those two
differences, §8.2 fires.

**Inherited.** The IRLS fit's own sensitivity (the fleet's best case); the grouping ladder's rung choice; and the
no-ground regime, where a photograph has no stable large aggregate to decide on, so I expect that class to stay least
stable and claim nothing else. Scope note: P5's headline "39%" is its **agreement** figure (≈61% disagreement), per p5
`STATE.md` §3; the brief reads it as disagreement.

## 5. Free parameters

| constant | anchor | if wrong |
|---|---|---|
| `Y0` flare (0.005) | physical display black level; measured collateral-free elsewhere | small → near-black pairs still over-separate; large → dark hues flatten |
| same-colour bar | contract, measured | the one ruler; already the most-audited number here |
| `LSB = 1` | format-derived; the reviewer's robustness wording | larger → more ties, more conservatism |
| `EXPLAINED_RADIUS = 4 bars` | P5, judge-graded on both paths | tight → everything is a mark; loose → figures absorbed into the ground |
| `NO_FIELD_FRACTION = 0.5` | P5 | the retreat fires too often or never |
| `T` thickness (≈1/8 short side) | geometric: thicker than any plausible bar or frame | high → narrow grounds retreat; low → the frame class returns |
| minimum ground reach | geometric: a ground touches the border | high → vignetted grounds retreat; low → faces return as background |
| `λ = 0.1` | P1, 72-cell probe | low → false gradients; high → missed gradients |
| `μ` publication margin | reviewer bracket 1.504× silent / 5.42× still complained-about; one round | low → "almost indistinguishable"; high → forced collapses, destroying the within-family pairs the reviewer endorses |
| `S` span, `M` mass | corpus measurement of title-text vs logo vs sticker geometry, then one round | high → the candidacy wall returns; low → logo and shadow colours publish |
| `κ` (ρ multiple in the mark mask) | derived from ρ; default 2 | high → marks lost; low → grain becomes marks |
| excursion 2.5, one-bar stop gain, spacing | P2 census, zero owed stops on demo-20 + fresh-40 | low → guide-stop misuse, read as banding |
| APCA floors; Tukey 4.685, MAD 1.4826, ≤12 iters | contract ε; standard statistics / P5 determinism | contract-owned; cost, not verdicts |

Thirteen against v2-3's ~900. The paradigm's human decisions sit in three places: the flare and the bar (what counts as
one colour), the ground test's two anchors, and μ. The rest is inherited or format-derived.

## 6. The failure classes

- **Wrong field colour, incl. a face as background** (11 of 39 commented items, most frequent): **structural** — the reach
  test; the strongest claim here and the one I most want falsified first.
- **False / missed gradient** (5 vs 1; false is harsher): **structural** — decided before colours are read, one component
  = one surface, only the gradient claim owes a certified margin.
- **Unreadable foreground** (8 of 39, **8/8 `unacceptable`**, harshest): **specific step** — both floors are feasibility
  filters over the true interpolated ramp, identity picking inside the floor.
- **Colour only in a label logo** (5 of 39): **specific step, explicitly at risk** — span-or-mass is my hypothesis for the
  fleet's declared inexpressible; if it fails there is no second answer here.
- **A strong artwork colour missing** (9 of 39, joint-most-frequent): **specific step** — coverage as a set criterion,
  §2.7 level 1.
- **Right colours, wrong roles** (5 of 39): **structural** via the tier decomposition; §8.3 falsifies it. **Two
  near-identical shades where the artwork has one** (4 of 39): **specific step** — publication at `μ × bar`, plus the
  flare, which makes the near-black instances measurable at all.
- Field guide §10 cases I consider decisive, all handled: **black-bar/frame** (why `thickness` exists); **sky-and-grass**
  (two components are never one ramp); **all-one-hue** (coverage counts families that exist, never forces one that does
  not); **the white-text class** (P2's stroke-width detector — precisely where P3's ink-score was stuck: surround
  coherence cannot see white type on a photograph, stroke-width consistency can); and **degenerate artworks** (one
  component, no marks, collapse + escape). **Not handled:** transparent inputs (refused loudly, per contract) and a
  legitimately textured ground no smooth model explains — that retreats and reads as "wrong background".

## 7. Cost

All O(pixels) per pass plus a fit whose solve is O(1) in image size (fixed ≥100k stratified subsample). **300 px: ~0.6–1.0
s** (P5 measured 0.35 s at 300² for one fit; recursion and intervals double to triple it; dominated by IRLS iterations,
which do not shrink). **3000 px: ~8–15 s, the design's weakest number** (P5 measured 4.2 s at 3000²; four recursion levels
and the full-res mark pass are the multiplier). Staged mitigation, not assumed: run *structure* (supports, reach,
thickness, grouping) on a decimated grid and only *colour reads and residual masks* at full resolution — the field guide's
rule constrains the colour read, not the geometry. That should reach ~4–5 s, risking thin-text marks.

## 8. Expected failures and falsifier

Expected bad at: photographs and collage with no fittable ground (the retreat publishes mass-led colours and will keep
drawing "wrong background"); textured grounds that fail the explained fraction; subjects filling the frame edge to edge;
the logo class if span/mass does not cut where the reviewer cuts. Pre-registerable on the first round, on **fresh** covers
drawn that round (the dev-set trap emerged within ~3 rounds, confirmed by three instruments):

1. If the **wrong-field-colour** class does not fall materially against P5's rate on the same covers, the reach×thickness
   ground test is wrong. It is the only structural answer here to the most frequent and most poisoning class (*"incorrect
   background, the rest is hard to judge in front of that incorrect background"*), so failing means **wrong, not
   under-built**.
2. If dither movement stays at or above P3's ~16% **while the certificates report most decisions certified**, the
   instability is not where the fleet located it, §2.8 answers the wrong question, and P2's ruler-indifference result
   generalises. Also **wrong, not under-built**.
3. If role complaints (*"the Zen grey is not a foreground or accent color…"*) persist at the pre-Phase-3 rate, the
   inventory's "role assignment is a separate competence" framing beats mine and §2.7 needs a real role subsystem.

Under-built rather than wrong: excessive ties collapsing onto conventions (bounds too loose); gradients under-firing (λ or
the certified margin mis-set).

## 9. Build plan

1. **Days 1–5 — palettes in front of the reviewer.** Flared OKLab + ρ; P5's `fieldfit.ts` and recursion lifted as-is
   (Phase 2 code is reusable); the ground test; §2.4 structure at plain margins; §2.5 field colours; §2.6 marks from P5's
   unwired `marks.ts`; §2.7 feasibility and three criteria with P2's `roles/text.ts` grafted — **no intervals yet**. A
   complete algorithm, and it answers falsifier 1, the one that matters most and does not need §2.8.
2. **Days 6–9 — certified intervals** at the seven sites, starting with the two P5 measured as the leak (accent, then
   foreground), then the structure margin and the ground choice. Answers falsifier 2; bounds start loose and tighten where
   the tie rate is high.
3. **Days 10–12 — guide stops and excursion** from P2's canon, plus the escape path, which no arm ever exercised on a real
   cover. **Later:** the decimated-structure cost path; opportunistic geometry emission.

~2.5 weeks to a judged round, most of it in the ground test and the interval bounds — with the reviewer's standing prior,
*"they all seem to understate the difficulty of the task at hand"*, applied to that number.

## 10. Convergence and divergence (control note)

**I converge with `field-fit-first` on the substrate, and I think that is a result, not a coincidence.** Read cold, the
only structurally stable object anyone measured is P5's robust fit; everything that went wrong in that arm went wrong
*after* the fit. Where I diverge from that seed: the fit's two famous failures — face-as-field and the unsolved frame
class — are **not** semantic and inexpressible; they are the absence of two geometric aggregates a fit does not compute
(§2.3), and I would bet the arm on that. Where the other angles look exposed:

- **The near-black colour-space defect is fixable with one physically-anchored constant** (§2.1). It is filed as an
  "upward formula packet awaiting a collection moment"; it is four strikes deep, it corrupts every distinctness and margin
  decision in dark artworks, and it costs one line of code.
- **`robustness-first` will likely build stable measurements; the evidence says the leak is in the comparisons.** P3 ruled
  its substrate MECHANISM-limited with "no candidate designed"; P5 queued margin-aware selection and parked it; P2 built
  fixed-band indifference and it moved nothing. The unbuilt option is a *computed* bound per quantity per image.
- **`exact-joint-search-without-a-scalar` may have no object to search.** With no currency the feasible set is small and
  plain enumeration suffices; a branch-and-bound with nothing to bound is machinery in search of a use.
- **`tree-first` buys reachability more expensively than it needs to**, from boundaries a fit places anyway, with a
  node-set churn its own STATE.md calls its hardest open item.
- **`per-pixel-ranks-with-a-new-substrate` bets against a measured negative result.** P3's own substrate replacement
  failed its pre-registered gates and *inverted on its home ground*. Its real asset — exact-pixel publication discipline —
  transfers to any design, and is kept here.

And where I think the inventory over-reads its own evidence: **"role assignment is a separate judged competence" is a
symptom, not a law.** P1's own analysis says its objective could only express field↔ink distinctions and that the
reviewer's role demands were all field↔ink. Every arm that found assignment separate extracted colours without a
ground/figure decomposition, so seats were assigned by comparison afterwards. Falsifier 3 tells us which reading is right.
