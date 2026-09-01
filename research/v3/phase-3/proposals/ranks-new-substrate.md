# Ranks on an area substrate

*Seed angle: keep P3's exact-pixel rank discipline, replace the substrate. I keep the publication
discipline and the selection primitives; I replace both the substrate **and** the internal "no colour
is ever created" rule, because that rule is what forced the substrate that failed. I also drop
tree-of-shapes from the seed's shortlist, on evidence, in §2.0.*

## 1. The design in one paragraph

Decode at full resolution. Build one **octave ladder of area integrals**: at each of seven
resolution-indexed scales, blur the OKLab image and record, per pixel, how far the pixel's own colour
sits from its blurred surround, expressed in units of the contract's same-colour ruler. Summing the
per-octave agreements gives **extent** — a continuous, threshold-free, scale-free replacement for
P3's binary-edge/EDT depth field, answering the same question ("how deep inside my own material am
I?") with an integral over an area instead of a thresholded difference propagated by a distance
transform. A robust affine fit (P5) of colour against position, weighted by extent, splits the image
into what the field explains and what it rejects; its per-pixel residual is the second field, and its
smooth explained-fraction is the third scalar. **Background, surface and the gradient boolean** are
read off the ground band — the top quantile of extent × eligibility × field-explained — ordered along
the fit's own spatial parameter *t*, with the gradient boolean decided by whether the ramp between
the two ends is supported by ground pixels all the way along it. **Foreground and accent** are read
off the ink field (fine-octave coherence × coarse-octave dissimilarity), elected against the
*rendered* ramp: foreground is the argmax of the minimum |raw APCA| over the ramp among candidates
clearing the contract floor; accent is chosen by a margin-first, identity-within-indifference
lexicographic order in ruler units. Every published colour is the **cascade pixel** (iterated medians
restricted to attaining pixels) of a band, so it is an exact artwork pixel by construction. Collapses,
distinctness and the ramp-end identities are the contract's own tests, evaluated *during* selection,
never as a repair pass.

## 2. Mechanism

### 2.0 The discipline, restated (this is the load-bearing change)

P3 held two rules at once and only one of them earned anything.

- **The publication line — kept verbatim, it is the judge-proven graft.** Every colour that leaves the
  algorithm is an exact pixel of the artwork, selected as the pixel attaining a designated rank in a
  per-pixel scalar field. No candidate colour set, no clustering, no data structure indexed by colour,
  no synthesized colour published, ever. Evidence: zero "shade not in the artwork" complaints across
  seven rounds while other arms drew them (`GRAFT_INVENTORY.md`, judge-proven pieces row 1).
- **The "nothing colour-bearing is ever created" line — replaced.** Its stated justifications
  (p3-fields `README.md`) were: strongest robustness claim, portfolio distinctness, auditability.
  Portfolio distinctness is spent — Phase 2 is over. The robustness claim is the one that *failed*:
  the ban on linear filters over colour left only a k-th-largest 3×3 difference compared against the
  bar as a substrate, and that binary is the located cause of the plateau (P3 `STATE.md` §3: slope
  −0.212 against resolution; degenerate side = higher-edge side 16/16; `e1-colour` owns 43/54 pair
  flips). The replacement line keeps auditability and buys the property the old one was a proxy for:

> **The Lipschitz line.** Every intermediate scalar field is (a) an integral or order statistic over
> an area of at least *A* pixels, (b) free of any binary/thresholded value, and (c) shipped with a
> written bound on how far its value can move per unit of colour perturbation. No field may be
> produced by propagating a thresholded decision (the edge→EDT shape is banned by name).

A created colour is permitted *inside* a field's computation and nowhere else. This is checkable by
an independent reader exactly as the old line was: grep for comparisons that produce booleans, and
for any field whose value depends on a distance transform.

**Why not tree-of-shapes depth**, which my seed offered: the tree is built from level-set thresholds
and its depth-at-a-pixel is an integer that changes discontinuously — the exact shape the Lipschitz
line bans, and P2 measured the consequence (dither 15.0% against its own 10% line, falsifier still
fired at close; P2 `STATE.md` §3). P2's tree earned its keep as a *candidate generator* (91.9%
endorsed reachability) — a job this design does not have, because with no candidate set every pixel
is reachable for every role at all times.

### 2.1 Steps

**S1 — Decode.** Full resolution, no downsampling (field guide §2.1). sRGB → OKLab planes. Pixels
with alpha < 255 get eligibility weight 0 permanently (never matted). *New wrapper around P3's
`decode.ts`.*

**S2 — The smooth ruler.** `bar(p)` is the contract's frozen region-dependent same-colour bar
(dark-neutral 0.00932 / dark-saturated 0.01502 / light-neutral 0.01627 / light-saturated 0.02293,
`PHASE_0_DECISIONS.md` §3) — but **bilinearly interpolated** across the L 0.55 / C 0.05 quadrant
boundaries over a transition band instead of switched. The frozen values are untouched; only the
hand-off between them becomes continuous. Decision: none. Rationale: a hard quadrant switch is a
1.7× jump in the ruler triggered by a ±1-LSB move in L — an inherited instability site that every
Phase 2 arm carried. *New; the constants are the contract's.*

**S3 — The octave ladder (the new substrate).** Scales σ_j = σ₀·2^j for j = 0…6, with
σ₀ = longEdge/512 (floored at 0.5 px) and σ₆ = longEdge/8. Scales are **fractions of the long edge**,
so the ladder measures physical structure, not pixels — this is the specific repair for P3's
resolution coupling. At each scale, mass-normalised separable Gaussian blur of L, a, b (IIR
approximation, O(N) per octave), giving a surround colour `B_j(p)`; then

- `s_j(p) = ‖c_p − B_j(p)‖` (OKLab), the surround dissimilarity at octave j — *this is P6's
  blur-ladder surround, verified salvage (`REOPENING_ANALYSIS.md`, "what this does not say")*;
- `a_j(p) = clamp01(1 − s_j(p) / (κ · bar(p)))`, κ = 2 — agreement at octave j, in ruler units;
- **`E(p) = Σ_j a_j(p)`** — *extent*, in [0, 7]. Replaces `depth`.
- **`w(p) = a_0(p)`** — *eligibility weight*, continuous. Replaces P3's boolean eligibility and P2's
  antialias-ineligibility rule: a pixel whose immediate surround does not resemble it at all is
  ringing, an antialias fringe, or an accidental shadow, and carries weight ≈ 0 — but it is
  down-weighted, never excluded, so there is no candidacy wall.
- **`M(p) = a_0(p) · (1 − a_6(p))`** — *markness*: locally coherent, globally out of place.

Lipschitz bound: each `s_j` moves by at most 2ε under a perturbation bounded by ε in OKLab, so each
`a_j` moves by at most 2ε/(κ·bar) and E by at most 7 times that. A single flipped pixel moves `B_j`
by O(1/σ_j²). Compare with the field it replaces: one flipped edge pixel changes the EDT over its
whole Voronoi cell.

**S4 — Robust field fit.** Tukey-biweight IRLS affine fit of each OKLab channel on (x, y), sample
weights initialised to `E(p)·w(p)`, 12 iterations, scale from the residual MAD. *P5's core, verified
graft (`GRAFT_INVENTORY.md` row 6: bg/surface bit-identical across nine versions).* Outputs:

- `R(p) = ‖c_p − fit(p)‖`, the residual field, and `g(p) = clamp01(1 − R(p)/(κ·bar(p)))`;
- **explained fraction** `X = Σ w·g / Σ w` — the absolute-form detector (P5's reworked version, which
  replaced a provably inert relative one);
- the fit's spatial parameter `t(p)` = projection of p onto the fit's own colour-gradient direction,
  normalised to [0, 1].

Decision: none. Diagnosis only.

**S5 — Ground band.** `Γ(p) = E(p) · w(p) · g(p)`. Ground band = the top τ = 0.25 quantile window of
Γ (P3's trimmed rank sub-population, `primitives.ts:topWindow`). No mass floor anywhere: Γ is entirely
local, so a colour covering 8.9e-5 of the canvas has the same access to the band as one covering half
of it. Decision: which pixels are field. Structural, no threshold on a colour statistic.

**S6 — background, surface, gradient boolean — one decision.** Split the ground band into its
low-*t* and high-*t* quantile windows (τ_end = 0.2 of the band each). Take the **cascade pixel** of
each window (P3 `primitives.ts`: median of L, restrict to attainers, median of a, restrict, median of
b, restrict, lexicographically smallest 8-bit triple). Two exact artwork pixels, A and B.

- **Polarity.** background = whichever of A, B has the larger *ground mass* in its window
  (Σ Γ over the window); surface = the other. Presence mass is used here as evidence about *which
  role*, never as eligibility — the P6 inheritance note's exact licence.
- **Gradient boolean.** Sample the OKLab segment A→B at 9 points. For each sample u, `support(u)` =
  Σ over the ground band of `clamp01(1 − ‖c_q − u‖/(κ·bar(q)))·Γ(q)`. The ramp is real when the
  support profile has no gap: `ρ = min_u support(u) / median_u support(u)`, gradient true iff
  ρ > ρ*. This is P5's t-continuity two-block/ramp discriminator (zero false gradients across six
  published ramps, `phase2-cal-013`), rewritten as an area integral. It is what refuses
  "there is no beige to dark gradient in that artwork" and "no green-to-brown in this artwork"
  (`phase2-pair-023`): a hue pair with no intermediate artwork mass has zero mid-ramp support.
- **Neutrality by construction** (field guide §2.4): A and B are computed identically whether or not
  a gradient publishes, so the boolean cannot feed back into the colours. If A and B are within their
  pair's bar, `surfaceCollapsed` is set and no gradient can publish (contract).
- **Guide stops.** With the ends fixed by contract (`stops[0] == background`, `stops[last] ==
  surface`), find the sample u with the lowest support. If its support is below the profile's median
  by more than the excursion margin, insert one interior stop: the cascade pixel of the ground-band
  pixels nearest u in OKLab. Accept the stop only if it strictly reduces the worst excursion and
  respects the ~3% ramp-spacing floor (banding provenance, two rounds; `GRAFT_INVENTORY.md` learning
  6). A fourth stop requires a second, independent excursion reduction. Interior stops never move the
  ends, so their blast radius is bounded. *P2 / PHASE_0 canon machinery.*

**S7 — ink field.** `ink(p) = w(p) · M(p) · ‖c_p − B_6(p)‖`. A pixel is ink when its own strokes are
coherent at the fine octaves and it is far from its coarse surround. **This is the redesign of P3's
deferred ink score**, and the fix is causal: P3 scored a pixel by the coherence of its *annulus*, so
white display type over a photograph ranked low because the photo ground is incoherent (P3 STATE.md,
structural limitation, rows 5/6). Here only the *pixel's own* fine-scale neighbourhood must be
coherent; the ground may be as noisy as it likes. Giant display type satisfies `a_0…a_2` high and
`a_6` low; a record-label logo's few pixels satisfy `a_0` only.

**S8 — foreground and accent, elected against the rendered ramp.** Form K = 8 candidates: the cascade
pixels of the top-K windows of the ink ordering, stepped one window at a time (P3's **band-then-
cascade**, which took all-four-role flips 114 → 88). Then:

- **foreground = argmax over candidates of min |raw APCA| against the ramp's published stops**, among
  candidates clearing the contract's `minTextContrast` floor; if none clears, the argmax wins
  (defaults sit near zero, `PHASE_0_DECISIONS.md` §2). *P5's rule, independently converged on by P3;
  the floor-vs-identity split is the reviewer's own demonstration verdict — the floor stands, identity
  picks within it.*
- **accent** = among remaining candidates clearing the accent's contract clause over the whole ramp,
  the winner of a two-key order: **margin first, identity within indifference.** Key 1 is
  `min(dist(accent, fg), min-over-ramp dist) / bar` — the separation expressed in *ruler multiples*.
  Two candidates whose key-1 values differ by less than one ruler unit are *indifferent* (P2's
  semiorder-safe election machinery); among indifferent candidates, higher ink rank wins. This is the
  answer to "optimizers sit on floors while the reviewer grades margins": the margin ratio is
  maximised rather than cleared, and the exchange rate between margin and identity is the calibrated
  ruler, not a hand-set weight.
- **Collapses.** `accentCollapsed` when the best admissible accent's key-1 is below 1 (inside the
  ruler) or no candidate clears the accent clause. A displaced candidate must re-qualify at the
  elected accent's own margin level or collapse — P3's 0.4.5 twin containment, imported.
- **Escape.** If after collapses fewer than two distinct colours remain, publish the contract's single
  pure-white/black escape with its four checkable conditions.

### 2.2 How the four roles plus gradient are one palette, and where the contract enters

Two subsystems, composed **structurally and one-way** — never elected between (negative result 4).
The field subsystem owns bg/surface/gradient; the figure subsystem takes the *rendered field ramp* as
its environment and elects fg/accent against it. Nothing ever compares two complete rival palettes.

The palette's family structure mirrors the artwork's *by construction*, which is the corrected
reframing in `GRAFT_INVENTORY.md`: when the artwork's ground is one shaded material the fit explains
it and A/B are two shades of one family (cover-168's reviewer-named ideal: two greys + two blues);
when the ground is two blocks the support profile gaps, the gradient is refused, and A/B are two
different families (cover-19's four named colours). The count of families in the output tracks the
count in the artwork because it is read off the same decomposition.

The contract enters **during** selection, at three places, and nowhere after: the ramp ends *are*
background and surface by construction; the foreground's ranking quantity *is* invariant 4's
whole-ramp minimum; the accent's and the collapses' tests are the contract's own distances. There is
no repair stage — v2-3's first repair relocated the defect in 13 of 15 cases (`PHASE_0_DECISIONS.md`
§4), and a repair pass is also where gradient neutrality dies.

## 3. Why it does not die the way the six died

1. **No scalar currency judges.** Nothing scores a whole palette. Field roles are rank positions in
   fields; figure roles come from a two-key semiorder whose exchange rate is the calibrated ruler.
   The whole pipeline thresholds exactly one derived number (ρ*) plus the contract's own floors.
2. **Role assignment is a separate competence.** It is a separate stage with its own machinery and its
   own asymmetric orders: bg/surface by ground mass along *t*, fg/accent by the ramp-relative
   election. Swap-indifference (P1's kill) is structurally impossible — the two orders are different
   functions, not one function read twice.
3. **Margins, not floors.** The accent's objective is a ratio to the ruler, maximised. Floors only
   ever *admit* candidates; nothing in the design is rewarded for sitting on one.
4. **No selector.** One answer, assembled. There are no rival whole palettes to elect between.
5. **No mass floors.** Eligibility is `w(p) = a_0(p)`, a purely local weight with no global term, and
   it is a weight rather than a gate. A colour at 8.9e-5 exact-pixel share competes on equal terms.

## 4. Robustness argument

**Removed causes.** (i) The binary edge indicator and its EDT — the located cause of P3's plateau —
are gone; extent is an area integral with a stated Lipschitz bound and no propagation. (ii) Resolution
coupling: the ladder is indexed to the long edge, so the same physical structure yields the same
extent at 300 px and 3000 px; P3's 3×3 neighbourhood is a different physical size at every
resolution, which is what the −0.212 slope measures. (iii) The quadrant discontinuity in the ruler
(S2). (iv) The boolean eligibility gate, now a weight. (v) P3's bimodal foreground ordering, already
fixed there and inherited in its fixed form.

**Discrete decisions that remain, and why each is stable.** (a) *ρ\* * — one comparison per image on a
statistic that integrates over the whole ground band; a ±1-LSB dither moves it by far less than its
spread, so it is unstable only for covers genuinely sitting on the boundary. (b) *Guide-stop
insertion* — 0–2 per image, on the same kind of integral, and it cannot move the ramp ends or any
role colour. (c) *Collapse tests* — the contract's, at the reviewer's own bars; a twin-ish cover sits
near them by construction. Inherited, not repairable inside this design. (d) *The fg/accent election*
— an argmax over 8 candidates; the indifference band means near-ties resolve on ink rank rather than
on a coin-flip, and every candidate is a cascade pixel (a median over a whole band), so a rank flip
*inside* a band changes nothing published. (e) *Band membership at the τ quantile* — a pixel crossing
the quantile changes a median over ~25% of the image by nothing.

**Inherited, stated plainly.** The fleet's shared residue — "discrete decisions near thresholds" —
survives at (a) and (c). I claim the substrate no longer *manufactures* threshold-adjacency, not that
threshold-adjacent covers become stable. I also inherit the same-colour bar's near-black
miscalibration (four independent strikes, `GRAFT_INVENTORY.md` learning 3), which is a reviewer-round
item, not mine to fix.

## 5. Free parameters

| # | constant | value | anchor | if wrong |
|---|---|---|---|---|
| 1 | κ, bar softness | 2 | the ruler: 1× bar = same colour, 2× = certainly different | extent saturates (too loose) or goes sparse (too tight); visible in E's dynamic range on the corpus |
| 2 | σ₀ | longEdge/512 | the finest stroke worth calling a mark at any resolution | fine type stops registering as ink |
| 3 | σ_J | longEdge/8 | the scale at which "surround" becomes "the picture" | too coarse: faces read as ground; too fine: the fg/bg polarity blurs |
| 4 | ladder base | 2 (7 octaves) | octave scaling; one sample per doubling | cost only, below 2 |
| 5 | τ_ground | 0.25 | P3's trimmed-rank quantile; anchor by robustness-harness sweep | bg/surface drift toward marks |
| 6 | τ_end | 0.2 of the band | same family; must be wide enough for a stable median | ramp ends narrow (the field guide's known "endpoints too narrow" defect) |
| 7 | K | 8 candidate windows | enough choice for the fg election to have an identity option | identity misses in fg/accent |
| 8 | ρ\* | **reviewer round** | the only constant this design asks the judge for | both gradient error directions are live and complained-about |
| 9 | ramp-spacing floor | ~3% | banding provenance, two rounds | banding (too tight) or unfixed excursions (too loose) |
| 10 | IRLS: Tukey c, iterations | 4.685·MAD, 12 | statistics literature; P5 measured its field bit-identical across nine versions | measured inert in P5 |

Ten, plus the contract's own frozen constants (four bar values, two contrast floors,
`ACCENT_FUNCTIONAL_DISTANCE` which remains `[UNCALIBRATED]` and inherited). The paradigm's human
decisions are three: the Lipschitz line, the ladder's two ends, and the choice to price the accent by
margin rather than admit it by floor.

## 6. The failure classes

| class | status |
|---|---|
| Wrong field colour / face-as-background (8 notes, the largest class: `phase2-cal-017`, `cal-020`, `cal-026`, `pair-023`, `pair-024`) | **Handled by a specific step, incompletely.** A face is a mark: the fit rejects it (`g` low) and it fails `a_6` because at σ = longEdge/8 its surround is the real ground. A face covering most of the canvas still wins. P5 called this structurally inexpressible after three rounds; I claim a partial improvement, not a solution. |
| False gradient (5 notes, `cal-017`, `pair-019`, `pair-023`) | **Structural.** The support profile along *t* must be gap-free; a ramp through colours the artwork does not contain has no mid-ramp support. |
| Missed gradient (2 notes, `pair-024`, `cal-025`) | **By the same step**, from the other side; ρ\* is the one judged constant and both directions are priced against it. |
| Unreadable foreground (6 notes, `cal-022`, `pair-024`, `pair-018`) | **Structural.** The ranking quantity *is* the whole-ramp minimum |APCA|; the contract floor admits. |
| Colour only in a label logo (3 notes, `cal-025`, `pair-023`, `cal-026`) | **Partial.** Octave-extent separates by stroke scale — display type survives 3 octaves, a 40-px logo survives one. A *large* logo still passes. Named in `GRAFT_INVENTORY.md` as the fleet's one confirmed shared inexpressible; I do not claim to have expressed it. |
| Colour "not in the artwork" though exact-pixel (6 notes, e.g. "there is no grey in that artwork", `pair-019`) | **Handled by a specific step.** Exact-pixel is necessary and not sufficient — the colour must be locatable. `w(p) = a_0(p)` down-weights ringing/fringe pixels to ≈0, which is where these picks come from. |
| Strong artwork colour missing (8 notes) | **Structural** on candidacy (no floors, every pixel reachable); **partial** on selection — K = 8 windows may not span a four-family artwork. |
| Right colours, wrong roles (4 notes) | **Partial.** Separate stage, asymmetric orders, no swap-indifference — but this is the campaign's hardest class and I claim only that the mechanism can express the distinction. |
| Two near-identical shades (4 notes) | **Structural.** Margins are the objective in ruler units; the twin-containment rule forces re-qualification or collapse. |
| §10 black-bar/frame class | **Not handled.** A uniform frame is high-extent, field-explained, high ground mass — it wins background. This is my worst case and the field guide says it blocked the previous campaign's most-requested palette. |
| §10 sky-and-grass; one-surface shading | **Structural**, both — the support-gap test is exactly this distinction. |
| §10 giant coloured display text | **Handled** by S7's ink redesign; the old large-type penalty is absent. |
| §10 scrambled-cover test | **Passes structurally**: scrambling destroys both the ladder's coarse agreements and the fit; global colour statistics are never consulted. |
| §10 role reachability; transparent artworks; degenerate covers | Reachability structural (no candidate set); alpha weight 0; degenerate path = seedless ladder → single band → collapses → escape. |

## 7. Cost

At 300 px (90 k px): ladder 7 octaves × 3 channels × 2 IIR passes ≈ 4 M ops; IRLS 12 × 90 k; ink and
band sorts. **~0.2–0.4 s cold.** At 3000 px (9 M px), everything is linear except the sorts:
**~5–9 s cold**, above P5's 4.2 s and P2's 0.67 s. Time goes to the ladder (≈45%), the ground-band
and ink sorts (≈30%), IRLS (≈15%), support/excursion integrals (≈10%). Full resolution is deliberate
(field guide §2.1); if 9 s is unacceptable the honest lever is computing octaves 4–6 on a decimated
grid and bilinearly upsampling the *scalar* `a_j`, which costs a stated approximation and should be
measured, not assumed. I take the reviewer's standing prior that all six Phase 2 proposals
understated difficulty as applying to this estimate too.

## 8. Expected failures and the falsifier

**Expected bad at:** framed and letterboxed covers (§6); photographic covers with no field, where the
fit retreats and the ground band collapses onto the largest smooth patch — P5's named silent-failure
mode and its item-6 "many colors" class; four-family artworks where K = 8 ink windows miss the fourth
colour; large logos.

**Pre-reviewer kill (cheap, run first).** P3 retained a field-drift instrument as the standard
coupling measurement for any future substrate candidate (539 files, shard-verified,
`SUBSTRATE_2_RULING.md` follow-ups). Run it on `E` and on the ordering `E` induces. **If extent's
ordering drift under dither and re-encode is not at least 2× better than the binary edge/depth
substrate's, stop — the substrate hypothesis is refuted and this design has no reason to exist.**
That is the pre-registration the coherence-field attempt is judged by, applied to mine before it costs
reviewer time.

**Reviewer-round falsifier.** The design's central claim is that P3's field-role complaint class and
its robustness leak had *one shared cause* (P3 STATE.md round-5: "the judge's complaints and the
robustness attribution now CONVERGE on the edge/depth substrate"). So: if round 1 shows **field roles
(background/surface/gradient) as the dominant complaint class** — as they were in P3's round 5 at 6 of
9 notes — **and** pooled robustness disagreement is no better than P3's ~16% plateau, the design is
**wrong**, not under-built: the shared-cause claim is false and area integrals bought nothing. If
instead field roles go quiet and the complaints move to figure roles and identity coverage, it is
under-built and iterable in the direction Phase 2 already mapped.

## 9. Build plan

1. **Substrate + gate (~2 days).** Decode, smooth ruler, octave ladder, extent/eligibility/markness.
   Port the field-drift instrument and run the pre-registered kill above. Nothing else is worth
   building until it passes.
2. **Field roles, palettes in front of the reviewer (~2 days).** IRLS fit, ground band, A/B cascade
   pixels, polarity, ρ support test, 2-stop ramps only. Ship with the ink field and the min-|APCA|
   foreground election (both cheap) and the accent collapsed. **A palette with three real roles and a
   judged gradient boolean exists at day 4** — that is the earliest honest reviewer round, and it
   prices the substrate claim where it matters.
3. **Figure roles (~2 days).** K candidates, the margin-first semiorder, accent, twin containment.
4. **Contract completion (~2 days).** Guide stops, escape path, degenerate/full-corpus crash sweep
   (the field guide says this costs an hour and finds real bugs), determinism and byte-identity gates.
5. **Staged later:** interior-stop policy beyond one stop; the decimated coarse-octave optimisation;
   frame/letterbox provenance work.

Rough effort: **8 working days to round 1**, with the kill gate at day 2. Fresh-cover draws are
load-bearing from round 1 (the dev-set trap emerged within ~3 rounds and was confirmed by three
independent instruments), and the reviewer-principle corpus in `PROTOTYPE_RANKING.md` §Cross-arm
assets is the design's acceptance checklist from day one, not from round three.
