# Arm C′ — the best description of the image wins

## 1. The paradigm

**A palette is not extracted from an image; it is read off the best available *description* of the image.** This arm carries a small portfolio of rival descriptions — each a compact theory of what the artwork's colour field *is* (one flat field, a linear ramp, a radial glow, two abutting areas, a border around an inner field, or no field at all) — fits every one to the same pixels, and lets them compete on a single currency none of them gets to define: **description length**, in bits. Parameters cost bits, unexplained pixels cost bits, the cheapest total wins. The roles and the gradient then fall out of the winner almost mechanically: the field's two ends *are* background and surface, and foreground and accent come from what the winner failed to explain. The claim someone can disagree with: **"which colours belong to this artwork's field" is a model-selection question, not a clustering question, and it has a right answer computable from one cold file with no taste in the loop.** If aesthetic role assignment is not reducible to explanatory economy, this arm is wrong at the root and adding members will not save it.

I kept the seat as commissioned: small legible methods plus a selector, with the selector as the only complex part.

## 2. Image to contract

### 2.1 One pass, native resolution, no resampling

The file is decoded at native resolution (dimensions from the header, never the name) and traversed **once**, in raster order. Three things accumulate:

- **A lattice of sufficient statistics.** The frame is partitioned into a *C×C* grid of cells in normalised coordinates; each cell accumulates its pixel count and the sums and sums-of-squares of the three OKLab coordinates. This is *not* a downsample: no interpolation occurs, no pixel is dropped, cells straddling a non-divisible edge simply hold unequal counts, and every later fit is count-weighted. The lattice is used only for **fitting** — never to choose a published colour.
- **An exact colour census.** A direct-indexed tally over the 2²⁴ possible 8-bit triples, with each present triple's count and the first and second spatial moments of its occurrences (enough for invariant 2's population floor and spread test). Published colours come only from here, so exactness is structural rather than a snapping step bolted on at the end.
- **A noise estimate.** A robust scale σ from the median absolute difference between horizontally adjacent pixels in OKLab, times the estimator's analytic consistency factor. σ is *measured from this file*, not chosen.

The filename, the artwork id and the enumeration order of anything are never read, so relabel invariance and iteration-order invariance are properties of the computation's shape rather than things to be tested for and patched.

### 2.2 The portfolio: six theories of the field

Every member describes the low-frequency colour field as a function *f(u,v)* into OKLab over normalised coordinates, differing only in the family *f* is drawn from and so in its parameter count *k*:

1. **Constant** — one colour everywhere, *k* = 3. Flat typographic covers.
2. **Ramp** — affine along one fitted direction, *k* = 7. Linear gradients, duotones, fades.
3. **Radial** — a monotone profile in distance from a fitted centre, on a handful of knots. Vignettes, glows, spotlights.
4. **Two-field** — two constant fields split by a boundary from a tiny closed family: horizontal, vertical, centred rectangle, centred disc. Frames, bars, letterboxing, half-and-half covers.
5. **Nested** — a border colour enclosing an inner field that is itself member 1, 2 or 3, recursion capped at depth one. Matted and bordered artwork, a semantic class the contract names explicitly.
6. **Scene** — an explicit *null* member that declines to describe a field at all and charges only for the image's marginal colour statistics. Photographs, collage, busy illustration.

Members 1–5 are **linear in their parameters given their geometry**, so the portfolio is one weighted-least-squares solver plus six design matrices. The only searches are geometric: the ramp's direction (closed form from the weighted second moments), the radial centre (coarse lattice sweep, then local refinement), the two-field boundary (cumulative sums make every split position evaluable in one sweep). Member 6 is a member, not an error branch — it must be, or the system has no honest way to say "there is no field here."

### 2.3 The selector

This is where the work is, so it gets four separate mechanisms rather than one score.

**(a) The common currency.** Each member's total code length is

> L(M) = k_M · ½·log₂(N) + Σ over cells of the residual's negative log-likelihood at scale σ,

where *N* is the number of lattice cells. Three properties matter more than the formula:

- **It is member-independent.** No member declares a weight, a prior, a threshold or a score; a member contributes a design matrix and one integer derived from its own algebra. *Adding a seventh member costs one integer and zero thresholds.* This is the single property that stops the selector becoming the deep brittle procedure the portfolio was meant to replace: **there is nothing in it to tune toward the reviewer.**
- **It has no free scale.** σ comes from the image; the per-parameter charge is fixed by *N*, which is fixed by the lattice. That charge is deliberately *not* keyed to the pixel count — neighbouring pixels are not independent evidence, and pricing them as if they were would make the winning model depend on rendition size, which the input policy forbids and the cross-rendition metric would catch.
- **Its margin is in bits, and a bit means the same thing on every artwork**, so confidence is comparable across the corpus without normalisation.

**(b) Most disagreements are not disagreements.** Before any tie-break, the selector asks the only question that matters: *do the top members produce different palettes?* Each is projected all the way to its four role colours (§2.4) and compared on the contract's own same-colour bar. A ramp and a radial with a distant centre disagree by hundreds of bits and publish identical palettes; a hard-edged duotone is described equally well by the two-field member and by a steep ramp, and both put the same colours at the ends. When outputs agree, **the selection was immaterial and is recorded as such**. This should absorb the large majority of thin margins, and is only possible because members are cheap and the contract is a coarse target — four colours judged on a perceptual bar.

**(c) When outputs do differ, the margin is measured, not asserted.** A **block bootstrap over lattice cells** — resampling contiguous blocks so spatial correlation is respected, refitting the top two members each time — returns the fraction of resamples in which the winner still wins. Refits are 7×7 normal equations over cell aggregates and cost nothing. The rule adds no threshold: the winner stands if it wins a majority, and resampling continues only until the Wilson interval on that fraction excludes one half, or a compute cap is reached. Confidence is *measured in the same currency as the answer*, and published.

**(d) The tie-break is the loss's own principle at its resolution limit.** When the bootstrap cannot separate the top two and their outputs differ, **the member with fewer parameters wins** — not a rule invented for ties but the thing the code length already says, used where the code length can no longer discriminate. Its geometry is stable: simple models have larger basins, so the boundary sits at the edge of the simple model's basin rather than in the middle of contested territory. And it has a checkable corpus consequence — **at the margin the gradient boolean is biased toward false**, which the distribution-level neutrality census measures directly, and which is the conservative direction, a spurious gradient being a visible defect where a missed one is merely a duller palette.

**When nothing is confident,** member 6 wins, outright or by default, and its palette is a legitimate publication rather than a fallback: field roles come from the dominant coherent region the two-field member located, and the residual pathway supplies the rest. Every lane still reaches every role.

### 2.4 From the winning description to the four roles

**Background and surface are the winner's two field ends** — exactly what the endpoint ruling demands, and here they are not chosen at all, they are read. For the constant member the ends coincide, so **surface collapses and no gradient can be published**, which is the consequence the contract itself derives. Which end is background: the one whose *t*-neighbourhood carries the larger pixel mass, and when the masses are within the bootstrap's uncertainty, the darker end. That convention is a free parameter, and the one most cheaply settled by a small reviewer round.

**Exactness is a projection, not a snap.** The fitted end value is a real-valued OKLab point almost certainly not present as a pixel. The published colour comes from the census, restricted to triples that (i) lie within the same-colour bar of the fitted value *and* (ii) actually occur inside that end's spatial support, taking the one with the largest **bar-neighbourhood population** — the count of pixels whose colour lies within the bar of the candidate, not the count of the exact triple. Ties break lexicographically on the triple, a determinism device rather than a judgment.

This carries the arm's central robustness argument, anchored on the packet's own corpus figures: the median endorsed role colour has an exact-triple area share of 8.89·10⁻⁵ but a bar-neighbourhood share of 1.91·10⁻², two orders of magnitude more mass. An argmax over exact triples is precisely the statistic a ±1-LSB dither destroys, since a dither splits every triple's population in two; an argmax over bar-neighbourhood population sees the same pixels redistributed *inside* the ball. Robustness here is a property of which statistic is maximised — which is what "structural, not tunable" has to mean.

**Foreground is what the field could not explain, at text's scale.** The residual — the native-resolution difference between the pixels and the fitted *f* — is thresholded at a multiple of σ and passed through a **granulometry**: successive morphological openings at radii expressed as fractions of the long edge, recording how fast the surviving area collapses. Lettering has a characteristic scale and vanishes at a knee; a subject blob does not. Foreground is the projected representative of the population surviving below that knee. Where no thin structure exists, it falls to the representative of the residual population that clears the contrast floor while being **least extreme** — deliberately not the most contrasting colour, because contrast here is a floor near zero, not an objective.

**Accent is an identity colour that is neither field nor text**, and it is where structural completeness is won or lost. Candidates are *modes of the colour census separated from the field's colour distribution* — isolated in OKLab, spatially compact — with **area entering only through invariant 2's population floor and never as a ranking term.** The packet records that the reviewer's most frequent complaint class was a major artwork colour reaching no published role, and that endorsed role colours are often minute; ranking accents by area is how a system structurally loses small signature colours. Candidates are ordered **lexicographically**: clears the accent floor over the whole rendered ramp; meets the source-support floor; then prefers candidates that move in *lightness* as well as chroma. That last is an ordering, not a weight, precisely because the packet records that the quantity behind it refused measurement twice and that its lightness axis is confounded with stratum by design — an ordering encodes a measured *direction* without inventing the coefficient the round declined to give. If no candidate survives, **accent collapses to foreground**, declared.

### 2.5 Gradient, stops, collapses, escape

**The gradient boolean is a model-selection outcome**, which is the honest form of the question: true exactly when a field member won, its ends are distinct above the same-colour bar, and surface has not collapsed. It is never fitted to satisfy a metric, because nothing here optimises a palette-shaped objective.

**Stops.** Two stops are the projected ends. A third is admitted on exactly the two grounds the contract allows, both already expressed in this paradigm's vocabulary:

- *A genuine three-colour ramp* is a **model comparison**: a ramp-with-one-knot member costs more parameters and must win the bit comparison outright. Not a curve fit that happened to improve.
- *Excursion reduction* is checked by sampling the OKLab segment between the published ends and measuring each sample's distance to the image's populated colour set. If the worst excursion exceeds the contract's inherited bar, one interior stop is admitted, and among stops that reduce that worst excursion the one with **minimum path curvature** is taken — the flattest path that stays on artwork, the ruling verbatim. Meandering cannot occur, because curvature is minimised rather than merely permitted.

I do **not** reach for a fourth stop: it is negotiable on proven utility, and I have no utility to prove.

**Collapses** are exact, declared and structural: surface collapses when the constant member wins, accent when the candidate list empties.

**The escape is essentially unreachable here, provably rather than hopefully.** It is needed only when the census cannot supply two colours distinct above the bar — a monochrome file. Such an artwork cannot contain both pure black and pure white, so at least one literal is genuinely absent and the escape's fourth condition is satisfiable by construction. It goes to foreground, accent collapsed. One reading I could not resolve is noted in §9.

### 2.6 The two withheld questions

**Transparency.** Keep the refusal — but this paradigm has a native answer if it is ever lifted, and it is neither white nor black: **fit the field to the opaque pixels only, then let the field itself be the matte.** A fixed matte decides what the background is before the algorithm has decided what the background is.

**Colour-blind legibility.** No diagnostic. The accent ordering already prefers candidates that move in lightness, and a lightness step is the one separation surviving every dichromacy — the CVD-safe direction and the measured functional direction coincide, so buying the second buys the first.

## 3. Where the decisions live

Judgment sits in exactly four places, each a legible artefact rather than a diffuse policy:

1. **Portfolio membership** — a *set*, edited by adding or deleting a member, each edit inspectable in one sentence. Where a human should intervene, and the only place improvement is meant to come from.
2. **The projection rule** — how a fitted colour becomes an exact artwork pixel, and by which statistic. Where robustness is won; one rule shared by every role and every member.
3. **The candidate orderings** for foreground and accent — lexicographic keys, so the judgment is *the order of the criteria*, which is auditable, rather than weights, which are not.
4. **The selector's tie-break** — prefer simplicity. One sentence, one consequence, measurable corpus-wide.

Everything else — σ, the parameter charge, the bootstrap's stopping rule, the gradient boolean, the stop count — is *derived*. **No judgment lives inside the loss**, which is what makes the selector legible.

Two commitments make this stick. **User parameters never enter an objective; they only prune ordered candidate lists** — so at the default ε nothing is pruned and the output is byte-identical to the unparameterised algorithm, and raising a floor removes only candidates that violate it: both halves of the paradigm-neutral parameter requirement satisfied by construction rather than by test. And **no reduction depends on ordering**: every accumulation runs over pixels in raster order or cells in index order.

## 4. Free parameters

Independent human decisions the paradigm needs — **eight**, for the whole system rather than per member, which is the point of sharing one estimator and one loss across six models.

1. **The lattice resolution *C*.** Anchor: the smallest *C* at which member ranking stops changing across the 200-artwork tuning bench *and* the resolution ladder. A stability sweep, not a taste call.
2. **Portfolio membership.** One decision over a set. Anchor: a retention rule — a member never the outright winner on a non-trivial share of the corpus is deleted. Each *k* is derived from its member's algebra, not chosen.
3. **The noise-scale estimator's form.** Anchor: its consistency factor is analytic; the estimator itself is anchored by the dither arm — the right one is that for which a ±1-LSB dither moves σ by the amount the dither actually injects.
4. **Which field end is background.** A binary convention. Anchor: one small reviewer round; provisionally larger-mass end, darker on tie.
5. **The thin-structure scale band** for the granulometry. Anchor: the corpus's rendered stroke widths, stratified by the oracle's text labels at dev time (§9). Built to degrade into a *search window* around a per-image knee rather than a fixed radius, so a wrong anchor costs precision, not correctness.
6. **The accent ordering key.** The criteria come from the contract and the measured direction; the human decision is their order.
7. **The bootstrap's block geometry.** Anchor: blocks sized to the fitted field's correlation scale. The resample *count* is not free — it is determined by the interval's separation from one half.
8. **The excursion measure** for guide-stop admission. Anchor: **inherited** from the contract's excursion bar rather than invented, with the packet's own warning noted that its multiplier is a lever nobody decided.

Inherited and not mine to choose: the same-colour bar and its regions, both ε floors, the accent functional distance, the source-support floors, the stop cap, the interpolation space. Changing any is a contract change, not a tuning of this arm.

Conspicuously *not* on the list: any per-member weight, prior, threshold or score; any blend coefficient; any confidence threshold. The portfolio does not multiply the count, because members share one estimator, one loss and one projection rule — six models cost one integer each.

## 5. Cost

**Pricing 1000 × 1000 = 1.0 megapixel, cold, single-threaded**, on ordinary consumer hardware, with figures scaling linearly in pixels for the two native-resolution passes and not at all for the rest.

| stage | estimate | scaling |
|---|---|---|
| decode | 10–20 ms | linear |
| pass 1: OKLab conversion, lattice accumulation, exact census, σ | 30–60 ms | linear |
| all six member fits over the lattice, including the radial centre sweep and the two-field boundary sweep | 3–8 ms | flat |
| bootstrap margin (≤ ~200 refits of the top two, on cell aggregates) | 2–5 ms | flat |
| pass 2: residual, granulometry at ~5 radii, masked census | 20–50 ms | linear |
| projection, ramp sampling, contrast and invariant checks | < 2 ms | flat |
| **total** | **≈ 70–145 ms** | |

At 3000 × 3000 (9 MP) the linear parts dominate and the figure lands near **0.6–1.2 s**. I flag that rather than bury it: it is the one place this arm's cost is worth arguing about, and the mitigation is *not* downscaling (forbidden absent proof of palette-equivalence) but confining pass 2 to the residual mask, which on most artwork is a small fraction of the frame.

This is ordinary per-file image code at the cost such code naturally has, roughly fifty times cheaper than the cold figure the packet requires a runtime-masking proposal to quote. **No model runs. Nothing is precomputed, cached, indexed or looked up; the algorithm reads no table.**

**All six members run always** — they share one aggregate and one solver, so a member's marginal cost is one small linear solve, and running them conditionally would save microseconds and cost the selector its evidence. The only conditional work is the two geometry sweeps, skipped when the constant member's residual is already at the noise floor; that early exit provably changes no output, since in that regime no other member can win the bit comparison.

## 6. Build cost

To emit real, contract-valid palettes over the coverage set: decode plus the single pass, lattice, census and σ, ~1 day; the six members and the shared solver including both geometry searches, ~2 days; the description-length comparison, bootstrap margin and output-equivalence check, ~1 day; projection to exact pixels with endpoints, gradient boolean, stop admission and the flattest-path search, ~2 days (the guide-stop logic being the subtle part); the residual pathway — granulometry, foreground, accent generation and ordering — ~2–3 days, and the part most likely to need iteration; contract wiring, a dev-loop candidate module and an adjudication emitter, ~1 day.

≈ **9–12 focused days** to first real palettes; add ~3 days for the robustness numbers and the exposed intermediates in the dev-loop viewer. Call it **two to three weeks** of one person's work before trajectory can be read. No new instrument is needed — the candidate interface, the diff, the robustness harness and adjudication all already consume what this emits.

## 7. Expected failures and falsifier

**Expected bad at:** photographic and collage covers, where the scene member honestly wins and the palette is competent but dull; heavily grained artwork, where inflated σ pushes selection toward the constant member and gradients are under-reported; covers whose field is *semantic* rather than geometric — a face read as the surface, a shadow as a second field; and artwork whose identity colour is both tiny and below the source-support floor, which this arm loses by contract rather than by oversight.

**Falsifier.** Run adjudication's reachability check over the 351 endorsed palettes, supplying as `availableColors` the colours my **field pathway** alone can emit. If more than about a third of endorsed background/surface pairs are unreachable at the regional bar — the endorsed field colours not sitting near either end of *any* member's fitted field — then "the field roles are the two ends of a low-order colour field" is false as a description of what the reviewer endorses, and the paradigm is wrong at the root rather than under-tuned. Adding members cannot repair that; the failure would be in the field/residual carving, not in the model class. Selector-specific second falsifier: if the bootstrap win fraction sits near one half across a large share of the corpus, description length does not discriminate on this data and the selector has no evidence to run on. Mere under-tuning has the opposite signature — high reachability, decisive margins, wrong choices.

## 8. Exposable intermediate work

All by-products of the computation, not instrumentation added for show:

- **The bit table**, per image: each member's parameter count, residual code length and total, with the winner's margin. Directly legible — "this cover is a ramp by 340 bits over flat".
- **The fitted field rendered as an image**, beside the artwork and its residual. A reviewer can look at a fitted field and say "that is not the background" — a verdict about the *middle* of the computation, far cheaper to elicit than a palette verdict. This is the arm's answer to being judged on trajectory rather than first-round scores.
- **The bootstrap win fraction and the outputs-agree flag** — how contested the decision was, and whether it mattered at all.
- **The ordered candidate lists** for foreground and accent, with each candidate's bar-neighbourhood population and floor clearance. The incumbent's structural-completeness failure — the right answer existing but being unpublishable — becomes visible as a *rank*, checkable against the reviewer's own corrected accents.
- **The projection margins**: how far the published triple's neighbourhood population beat the runner-up's. A per-image prediction of instability, and a falsifiable one — it should correlate with the robustness harness's per-image agreement. If it does not, the projection rule is not doing the job I claim for it.

## 9. What I asked for

**Asked: `ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md`'s corpus-survey portion, and from `ORACLE_QUESTION_SET.md` the distributions over `has_text` / `text_dominance` and `has_signature_color` / `signature_carrier`.** Two parts of the design turn on them. Free parameter 5 is anchored on the scale at which lettering actually appears in these renditions, and the oracle's text labels are the only dev-time stratification that could anchor it. The accent lane's refusal to rank by area turns on how often a signature colour is carried by a small element rather than by the subject or the background — if that case is rare, area-ranking would have been simpler and better.

**Assumptions I proceeded under.** (i) Rendered stroke widths occupy roughly 0.2%–2% of the long edge, and the granulometry locates a per-image *knee* inside a search window rather than applying a fixed radius, so a wrong anchor costs precision, not correctness. (ii) A signature colour on a small element is common enough that area-ranked accent selection is unsafe — hence the lexicographic ordering with area entering only through invariant 2's floor. If the distributions say otherwise the accent lane simplifies; nothing else moves.

**Two things I could not fully reconcile**, noted rather than resolved. The escape clause reads "exactly one colour not present in the artwork … used as background or foreground only, with surface or accent collapsed correspondingly" — but a sanctioned collapse is *exact* equality, so a white background with a collapsed surface publishes that non-source colour at two roles; I assumed a collapse counts as one introduced colour, since the alternative makes the sanctioned combination self-contradictory. And the brief's cost bracket quotes SAM's warm 2.7–4.3 s band as its exceptional end while insisting elsewhere that the quotable cold figure is ~6.2 s; I priced against the cold framing, the stricter reading and the one the cold-runtime ruling implies.
