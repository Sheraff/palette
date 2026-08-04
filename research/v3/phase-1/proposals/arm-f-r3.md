# Arm F — the field-and-overlay decomposition

## 1. The paradigm

**An album cover is not a bag of colours; it is a layered picture — a slowly-varying field with things
laid on top of it — and the palette should be recovered by decomposing the image along *spatial
order*, never by clustering its colour histogram.** Concretely: fit a low-order colour surface to the
image with a redescending robust estimator, so that whatever is *painted on top* (type, faces, logos,
a subject) is down-weighted to zero without ever being segmented. What the fit converges to is the
**field**; what it rejects is the **overlay**. Background and surface are then the two ends of the
field's trend along its dominant axis; foreground and accent are the two most consequential
departures from the field, ranked by *how* they depart. The gradient boolean is not a separate
classifier — it is the statement that the field's two endpoints are distinguishable colours under the
project's own same-colour rule. Someone can disagree with this cleanly: they can say colour identity
is what matters and spatial layout is incidental, that a cover is exactly its colour distribution and
where the colours sit is noise. I think that belief is what makes a palette engine fragile, because a
histogram has no continuous parameters and everything downstream of it is a discrete choice.

## 2. Image to contract

Work throughout in OKLab. Positions are normalised image coordinates $x = (u,v) \in [-1,1]^2$.

### 2.1 One pass: decode, transform, ledger

Decode the file to 8-bit sRGB and convert every pixel to OKLab. In the same pass build two structures
that make the exactness clause cheap for the rest of the run:

- a **presence bitset** over the $2^{24}$ possible 8-bit triples (2 MB), answering "does the artwork
  contain exactly this colour?" in one bit; and
- a **colour ledger**, a hash keyed by the 24-bit triple holding: pixel count, and running sums of
  position and of OKLab (which are redundant with the key but are used later, per-colour, against the
  fitted field).

The bitset is the oracle for two contract clauses at once: *every published colour is an exact pixel*
(check before emitting), and *the escape colour is genuinely absent* (check before escaping). Nothing
in the pipeline ever proposes a colour it cannot look up here.

### 2.2 The field: a robust low-order fit

Model the artwork as $c(x) = f(x) + r(x)$, with $f$ a vector-valued polynomial in $x$ of order 0, 1
or 2 (three OKLab channels sharing one basis), and $r$ the residual. Fit $f$ by iteratively
reweighted least squares under Tukey's biweight on the residual norm $\rho(x) = \lVert c(x) -
f(x)\rVert_{\text{OKLab}}$, with the loss scale set from the MAD of $\rho$ recomputed each iteration.
Solve on a deterministic lattice subsample rather than all pixels — a 6-coefficient-per-channel model
does not need two million observations, and a stratified stride puts the endpoint standard error
orders of magnitude below any threshold we will compare it against.

This is the load-bearing step, and it does three jobs at once.

**It segments without segmenting.** The redescending loss drives the weight $w(x)$ of any pixel far
from the emerging surface to exactly zero. A title set in white over a blue-to-teal wash does not
need to be found; it simply fails to influence the wash. There is no mask, no connected-component
pass, no size threshold, no morphology — and therefore none of the boundary instability that makes
segmentation-first pipelines move under re-encoding.

**It gives the overlay for free.** $o(x) = 1 - w(x)$ is a continuous, per-pixel "this is laid on top"
score. It is the only notion of figure/ground the design has, and it is a by-product of the fit rather
than a second algorithm.

**It is structurally stable to the perturbations that broke the incumbent.** Every quantity the fit
produces is an integral over ~$10^5$ observations. A $\pm1$-LSB dither perturbs each observation by
about $10^{-3}$ in OKLab, uncorrelated; the fitted coefficients move by that divided by $\sqrt{n}$ —
orders of magnitude below the same-colour bar. A JPEG re-encode concentrates its damage in high
spatial frequencies, precisely the subspace orthogonal to a degree-1 or degree-2 surface fit; the
field is the part of an image a lossy codec is built to preserve. An id relabelling touches nothing,
because nothing outside the decoded raster is an input.

The residual scale $\hat{\sigma}$ and the inlier fraction are the design's self-diagnosis: large
$\hat\sigma$ and low inlier fraction mean no field was identified (§7).

**Model order.** Fit order 1. Restricting $f$ to a line gives a straight OKLab segment; order 2
restricted to a line gives at most one interior bend, i.e. at most three stops. The stop budget
therefore pins the order cap at 2, which is why order selection is not a tuning knob here.

### 2.3 The ramp, and the gradient boolean

Write the affine part as $f(x) = a + Bx$, $B$ a $3\times2$ matrix. Its largest right singular vector
$d$ is the image-plane direction along which the field's colour moves fastest; the orthogonal
direction carries whatever is left, and the singular-value ratio $\sigma_2/\sigma_1$ says how nearly
one-dimensional the field is. Parameterise the ramp by $t = d \cdot x$ over the image extent, and let
$g(t)$ be the field restricted to that axis.

**Orientation.** The contract fixes that the first stop is background and the last is surface, so
which end is which is a decision I owe. Background is the *larger* field: take the median of $t$ over
inlier weight; whichever end that median leans away from carries more field area and is the
background. Ties break lexicographically on the emitted triples, and the margin of the median test is
reported (§8) so a near-symmetric ramp is visibly a near-symmetric ramp rather than a silent coin
flip.

**The two ends become exact pixels by projection.** $g(t_{\min})$ and $g(t_{\max})$ are real-valued
and generally not pixels of the artwork. Project each: among artwork colours lying within the
same-colour bar of the target, choose the one with the greatest inlier mass in the spatial band
nearest that end; if the ball is empty, take the nearest artwork colour outright. The projection
lands on a real, large-area field colour, not on an isolated triple, which is what keeps the
projection from being the discontinuity that undoes §2.2's stability. **This is the only discrete
choice in the whole path from pixels to field roles**, and it is deliberately made last and made
local.

**Now the boolean.** The gradient is true exactly when the two projected ends are *different colours*
under the project's same-colour rule. This is not a new threshold — it is forced. The contract says a
collapsed surface means no gradient, and a collapse is exact hex equality; two ends that the
same-colour rule cannot separate are a surface that has collapsed in all but name, and rendering a
ramp between them is rendering nothing. So: ends separated ⇒ candidate gradient; ends not separated ⇒
surface collapses to background exactly, gradient false. **I consume `sameColorBar()` as the project
defines it and my design turns on no particular value of it** — which matters, because §3.1 warns the
bar is provisional, conservative in chroma and permissive in lightness, and running as a report-only
challenger.

### 2.4 Stops, and the one admissible reason to add a third

Sample the straight OKLab segment between the two *projected* endpoints (the projection must come
first — the rendered ramp interpolates published colours, not fitted ones). For each sample, ask the
presence bitset for the distance to the nearest colour the artwork actually contains, searched by
expanding shells in 8-bit RGB around the sample. Let $X$ be the maximum of that distance over the
segment: **the off-artwork excursion**, in the contract's own words, of how far the two-stop straight
line passes outside the artwork.

If $X$ is below the same-colour bar, the straight line never leaves the artwork and a third stop has
no justification. Emit two stops.

If $X$ exceeds the bar, a third stop is admissible, and its job is defined: minimise $X$. Enumerate
candidate colours from the bitset in a neighbourhood of the worst-excursion sample, and for each,
recompute the max excursion of the resulting two-segment polyline with the ends held fixed. Accept
the best candidate only if it brings $X$ under the bar or reduces it by a clear factor. Among
candidates that tie on excursion, prefer the one with the smallest total turning angle at the middle
stop — this is the reviewer's "flattest path that stays on-artwork", implemented literally, and it is
what forbids meandering: a stop that does not reduce excursion cannot win, because excursion is the
only thing being minimised. A genuine three-colour ramp arrives at the same place from the other
side: the order-2 fit's $g(t)$ is itself bent, the straight chord between its ends misses the field,
and the bend point is exactly where the excursion peaks.

A fourth stop is not emitted. If $X$ is still above the bar after the third, the residual excursion is
reported as the evidence a fourth stop would need — which is the right posture for something granted
only on proven utility.

**And if no polyline fixes it**, the field is not a ramp. The classic case is a hard two-block cover:
the affine fit spans red and blue, the straight OKLab chord runs through a desaturated purple the
artwork does not contain, and no on-artwork middle stop rescues it because the artwork has no middle.
Then gradient is false, and background and surface are taken as the two highest-mass field colours
(highest $\sum w$ per ledger entry) required to be separated by the bar, surface collapsing if only
one such colour exists. Note the asymmetry this creates and that it is the safe one: a false gradient
renders visibly wrong colour; a missed gradient renders flat.

### 2.5 Foreground and accent: the overlay layer

For each colour $k$ in the ledger, accumulate over its pixels the **overlay mass** $M(k) = \sum_{x:
c(x) = k} o(x)$ and the mean field colour beneath it, $\bar f(k)$. The field-relative displacement is
$\Delta(k) = \mathrm{OKLab}(k) - \bar f(k)$, decomposed into $(\Delta L, \Delta C, \Delta H)$ — the
same decomposition the perception work uses, so the evidence is speakable in the project's existing
vocabulary.

Critically, **every colour in the ledger is eligible for every role.** The role is decided by which
functional selects it, never by a gate that removed it from consideration. A colour with tiny area but
huge field-relative displacement is a live accent candidate; a colour with huge area and no
displacement is a live field candidate. That is the structural-completeness requirement met by
construction rather than by widening walls.

**Foreground** is the overlay colour with the greatest overlay mass whose separation from the field
exceeds the user's hard contrast minimum. Since that minimum defaults near zero, in practice
foreground is simply *the colour the artwork itself uses most for the things it paints on top of its
field* — which is the right thing to hand a UI that will set text in it, and it does not require
finding text in the picture.

**Accent** must be a different colour from foreground and from both field ends under the bar. Among
survivors, take the **Pareto front** in two dimensions: chromatic departure from the field
$\sqrt{\Delta C^2 + \Delta H^2}$, and lightness departure $|\Delta L|$. From the front, choose the
point of greatest overlay mass. I use a Pareto front and not a weighted sum on purpose: `perception-4`
found that an accent moving in lightness works about twice as often at matched distance, but the brief
is explicit that this is *a direction and not a coefficient*, confounded with stratum by design.
Turning it into a weight would be inventing exactly the constant two rounds have refused to measure.
The front honours the direction structurally — a chroma-only candidate reaches the front only when
nothing dominates it — and when the winner's $|\Delta L|$ falls below the measured lightness
same-colour threshold, the palette carries an `accentChromaOnly` flag so the known-fragile case is
visible rather than silent.

If no colour survives the distinctness requirement, accent collapses to foreground exactly.

### 2.6 Assembly, collapses, escape

Four roles, all exact triples verified against the bitset. Both collapses are exact hex equality by
construction because each is an assignment of the identical value, not a near-match. The escape fires
in one situation the design can name precisely: the ledger contains no colour separated from the field
by the bar — a monochrome or near-monochrome cover. Then surface has collapsed, no foreground
candidate exists, and the palette takes pure white or pure black (whichever is further in lightness
from the background) as foreground, with accent collapsed onto it. All four escape conditions are
checkable at that moment: the literal is one of the two, the role is foreground, the partner is
genuinely collapsed, and the bitset says the literal is absent from the artwork. If the bitset says it
is present, the escape is refused and that colour is published as an ordinary pixel of the artwork,
which is the correct reading of the clause.

## 3. Where the decisions live

The judgment calls are few and each sits in one named place.

**What counts as "on top of the field"** lives entirely in the robust loss's rejection point. That is
the single most consequential judgment in the design, and it is one dial, in one place, with a
statistical meaning.

**Which end is background** lives in the median-$t$ orientation test (§2.3). It is a genuine judgment
about semantics, it is stated in one line, and its margin is exposed.

**Whether a colour belongs to the artwork** — open question 2, which the brief says has no
instrument — appears here only as an eligibility floor on overlay mass. I did not solve it; I confined
it, so the unresolved question touches exactly one comparison.

**Everything else is inherited or derived.** The gradient boolean, the stop justification, the
collapse tests and the escape check all resolve against the same-colour bar and the presence bitset,
objects the contract already owns. I add no threshold of my own to any of them — which is this
design's answer to parameter honesty: not "fewer constants", but *fewer places where a constant could
go*.

## 4. Free parameters

Independent decisions a human must make, honestly:

1. **The hard contrast minimum.** Not mine — the contract mandates it as a user parameter defaulting
   near zero. Anchor: the user.
2. **The robust loss's rejection point** (Tukey biweight cut, conventionally $4.685\hat\sigma$).
   Anchor: standard robust statistics — the value giving 95% asymptotic efficiency at the Gaussian —
   with a secondary anchor available from the reviewer: on a handful of covers, the rendered overlay
   mask either does or does not match what a human says is "laid on top", and that is directly
   inspectable (§8).
3. **The overlay-mass eligibility floor.** The one with no instrument behind it. Anchor: express it as
   a fraction of image area so it is resolution-invariant, and set it *one-sidedly* — the largest
   value that has never excluded a colour the reviewer endorsed on the development corpus. A one-sided
   anchor is weaker than a measurement, and I would rather say so than dress it up.
4. **The orientation margin** below which the background/surface assignment is declared unstable and
   reported rather than asserted. Anchor: the standard error of the median-$t$ statistic, so it is a
   statement about the estimate's own precision.

Three further quantities look like parameters and are not free: the **polynomial order cap** is pinned
at 2 by the contract's stop budget; the **excursion and separation thresholds** are the project's
same-colour bar, consumed and not chosen; the **lattice stride** is fixed by requiring the fitted
endpoint standard error to sit an order of magnitude below that bar, which is a computable condition
rather than a preference. I would report all seven with provenance and let the reviewer re-classify
any of them.

## 5. Cost

**Pricing 1400 × 1400 = 1.96 Mpx**, single-threaded, one cold file, nothing precomputed. (A 640 × 640
cover at 0.41 Mpx is roughly a fifth of this and is dominated by fixed costs.)

- JPEG decode at 2 Mpx: **30–60 ms**. This is the largest single term and it is unavoidable.
- sRGB → OKLab for 2 M pixels, with a 256-entry in-run table for the transfer function: **20–40 ms**.
- Presence bitset and colour ledger, same pass: **15–30 ms** (a photographic cover holds $10^5$–$5
  \times 10^5$ distinct triples).
- IRLS fit on a ~$10^5$-pixel lattice sample, 8–12 iterations accumulating $3 \times 6$ normal
  equations: **10–20 ms**.
- Overlay statistics: one full pass, updating the ledger only for pixels with non-trivial $o(x)$
  (typically 10–40% of the image): **15–35 ms**.
- Excursion test over ~64 segment samples with shell search against the bitset, plus the third-stop
  candidate enumeration: **5–15 ms**.
- Role selection over the ledger, Pareto front, assembly: **< 5 ms**.

**Total ≈ 150 ms, with an honest range of 100–300 ms** depending on decoder and cache behaviour —
about 75 ns per pixel. Peak memory ≈ 2 MB for the bitset plus the decoded raster plus a ledger sized
to the distinct-colour count; there is no $2^{24}$ counter array and no k-d tree.

Why that is reasonable: the brief's target end is "ordinary per-file image code at the cost such code
naturally has", and this is six linear passes over the raster plus a fit on a subsample. It is the
same order as the decode it cannot avoid, which is the natural floor for any pixels-first method. It
sits nowhere near the seconds-scale bracket that would owe an exceptional justification, so I owe
none. The design also has no warm path to lose: there is nothing it would have cached, so its cold
cost *is* its cost.

## 6. Build cost

Six components, none research-grade: decode and OKLab transform; bitset and ledger; the IRLS fit;
ramp, excursion and stop search; overlay statistics and role selection; contract assembly with
collapses and escape. Only two need care — the IRLS fit (textbook, but scale update and convergence
want attention) and the shell search against the bitset (fiddly, small). **Two to four days to a
prototype emitting real palettes**, plus two or three days spent *first* on the §8 renderers, because
the decomposition is either visibly right or visibly wrong on a cover and looking is faster than any
metric. No training, no corpus dependency, no model, no precomputation — so nothing sits between
prototype and first review round, and after that the schedule is review rounds rather than code.

## 7. Expected failures and falsifier

**Where I expect this to be bad.**

*Covers with no field.* Dense collage, edge-to-edge photography, heavy grain. The biweight has no
majority to lock onto, the fit converges to something like a mean, and "background" lands on a muddy
average. This is the paradigm's structural weakness and it is not small — a real fraction of album art
has no figure/ground at all. The inlier fraction detects it honestly; the fallback (background = the
highest-mass colour of a heavily smoothed image, surface collapsed) is a retreat, not an answer, and I
would rather ship a declared retreat than a confident average.

*Type-dominant covers*, where lettering covers more area than the ground: the fit can lock onto the
type and report the ground as overlay, inverting figure and field. Unfixable within the paradigm as
stated. *Radial fields* — vignettes, spotlights, centre glows: a dominant-direction line describes
them poorly and the excursion test will refuse the gradient, which is probably right under a contract
whose gradients are linear ramps, but it will read as a miss. *Near-symmetric ramps*, where the
orientation test has no margin and the two field roles can swap: reported, not solved. *Chroma-only
accents*, per open question 1: no design fixes what has twice refused measurement; mine flags it.

**What would tell me the paradigm is wrong, not under-tuned.**

The decisive one: take the reviewer's endorsed palettes, and for each, locate the endorsed background
and surface colours in the image. If the pixels carrying those colours sit in the *overlay* layer —
high $o(x)$ — at a rate materially above chance, then "field = low-order robust trend, overlay =
residual" is simply not the decomposition the reviewer is using, and no rejection point fixes it,
because the failure is in the model's order, not its loss. That experiment needs no palette engine at
all — only the fit and a set of endorsed colours — so it should run first, before anything else is
built.

Two supporting falsifiers. If the gradient boolean derived from endpoint separation disagrees with the
reviewer's gradient calls *at every value of the bar*, then identifying "gradient" with "field
endpoints distinguishable" is wrong as an identification, not mistuned. And if a $\pm1$-LSB dither
moves the *fitted continuous endpoints* by more than the bar, then the claim that integrals are stable
is false in practice and the paradigm's main structural argument collapses; this is a one-afternoon
check and should also run early.

I will note the metric that this design asks to be measured fairly: it aims to be stable *up to the
same-colour bar*, and hex-level agreement across re-encodings will show churn from the projection step
that the contract's own same-colour rule says is not a colour change. Reporting both is the honest
position, and the standing rule that gates are instruments makes that an admissible argument rather
than an excuse.

## 8. Exposable intermediate work

The decomposition is the product, and almost all of it is lookable-at:

- **The three-way image**: artwork = field + overlay, as three pictures. A reviewer sees at a glance
  whether the algorithm's idea of "the ground" matches theirs.
- **The soft overlay mask $o(x)$** as greyscale — the single most useful artefact here, and the anchor
  for free parameter 2.
- **The ramp axis** drawn over the artwork, endpoint bands marked.
- **The OKLab excursion plot**: the field path $g(t)$, the straight chord between the projected ends,
  the nearest-artwork-colour distance along that chord, and $X$ at its peak. This shows *why* a third
  stop was or was not added, in one picture.
- **The accent Pareto front** in (chromatic departure, $|\Delta L|$), sized by overlay mass, winner
  marked, dominated candidates visible.
- **The projection step** per role: continuous target, exact triple chosen, distance between them.
- **Provenance masks**: for each published colour, where its pixels are — so a disagreement can be
  pointed at rather than argued.
- **Scalars with their thresholds beside them**: inlier fraction, robust residual scale, endpoint
  separation vs bar, excursion vs bar, orientation margin, accent $(\Delta L, \Delta C, \Delta H)$,
  `accentChromaOnly`.

## 9. What was missing

My packet cited `PHASE_0_DECISIONS.md` §§1–6.1, `V3_PLAN.md`, `src/contract/`, and
`src/contract/PERCEPTION_VERDICT.md`. None were available; I designed against the §3.1 constraint
sheet alone, treating it as complete, which the manifest states it is.

What actually mattered:

- **§1, the input policy.** I do not know whether the system receives a path or a decoded buffer,
  whether resolution or format is normalised, whether alpha can occur, or the colour-profile policy. I
  assumed an opaque 8-bit sRGB raster at native resolution with no ICC transform. Two things turn on
  this: my lattice subsample assumes geometry is stable across the perturbations robustness is
  measured under (true for re-encode and dither, false for a resize), and "exact pixel" is defined in
  8-bit sRGB. If any of those assumptions are wrong the cost and the projection step both change.
- **§3, the metrics.** I could not see how palette agreement is computed, which matters because §7 asks
  for it to be reported at the same-colour bar as well as at the hex.
- **§4, the invariants and pathology census.** I know only `I1.first-stop-not-background` and
  `I1.last-stop-not-surface`; there may be gates this design trips that I cannot anticipate. For field
  names I used the ones §3.1 quotes verbatim and invented only `accentChromaOnly` as a reported flag.
- **§5, corpus and holdout policy.** I assumed a development corpus exists that may anchor free
  parameter 3 and run §7's falsifiers, and that none of it ships. If that is wrong, parameter 3 has no
  anchor at all and should be reported as unanchored.
- **`PERCEPTION_VERDICT.md`** was not needed: §3.1 warns that nothing should depend on the bar's
  value, and this design consumes `sameColorBar()` without depending on it.

Two things in the brief I could not reconcile. It states SAM costs **~6.2 s per cold call** "because
runtime is cold and the model load is paid every time", and then, four paragraphs later, brackets the
cost discussion with SAM measuring "**roughly 2.7–4.3 s per image**". Under the cold-runtime ruling the
second figure appears to be the warm number, in which case it is the wrong one to bracket a cold cost
with. It does not affect this proposal, which is two orders of magnitude below either. Separately, the
constraint sheet says the ends of a gradient *are* the field roles exactly, and also that every
published colour is an exact pixel — these interact, and the resolution I adopted is that the fitted
endpoints must be projected onto exact pixels *before* the excursion test runs, since the rendered ramp
interpolates published colours. If the intended order is the reverse, §2.4 changes.

## 10. Why this one

I considered three alternatives seriously. **Histogram clustering** (k-means, GMM, mean-shift over the
pixel population) is the obvious route, rejected on the robustness goal: its outputs are argmaxes over
a discrete partition, every bin boundary is a discontinuity, and a $\pm1$-LSB dither is a perturbation
*designed* to cross boundaries — no care with bin widths changes the shape of that failure.
**Segmentation-first** (superpixels, watershed, SAM) buys the spatial structure I wanted but pays in
boundary instability under re-encoding, and in SAM's case a seconds-scale cold cost owing a
justification I could not honestly write. **Render-first optimisation** — the palette as minimiser of
an objective on the simulated UI — is the one I regret rejecting: it optimises the thing that actually
matters, but every term in that objective is a free constant, and parameter honesty constrains the
*number of places a constant can live*, not merely its final count. I chose field-and-overlay because
it is the only one where the contract's own structures do the deciding: the gradient boolean is a
same-colour test, the stop justification is an excursion measurement, the collapses are that same test
again, and exactness is one bitset lookup. Its stability argument is a statement about integrals
rather than a claim about tuning, which is what "structural, not tunable" was asking for. And it fails
in a way I can name in advance — covers with no ground — which I prefer to a method that fails
everywhere a little.
