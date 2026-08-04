# Arm E′ — one measure, one energy, one quantisation

## 1. The paradigm

**A palette is a quantised answer to a continuous question, and this problem's instability is a consequence of quantising early.** So this proposal quantises exactly once. The image is reduced to a single continuous object — the joint measure over *(a pixel's colour, the colour of its surround at each of a fixed ladder of scales, its position in the frame)*, which I call the **figure–ground measure** — and all four roles, the gradient boolean and the stops are read out of it as the single constrained minimiser of one energy, searched over the artwork's own pixel triples. No clustering, no colour extraction, no candidate family, no per-role stage, no repair pass. The claim someone can disagree with: **role assignment is not a labelling problem over a set of extracted colours, because there is no such set. Every distinct 8-bit triple in the artwork is feasible for every role at all times, and the only thing that ever removes one is an admissible bound inside an exact search.** If that is right, candidacy walls are not a defect to patch but a category error, and robustness is not a property to tune for but an arithmetic consequence of every decision variable being an area integral.

## 2. Image to contract

### 2.0 Decode, and the two questions the brief leaves open

Decode at native resolution with the pinned decoder; dimensions from the header. Convert sRGB to linear with an exact 256-entry table — the input is 8-bit, so this is exact arithmetic — then to OKLab. Real transparency is **refused loudly**, per §1 and invariant 5.

The brief's two open questions. **Flattening:** a matte must not be a constant — white and black are each wrong on some artworks, and the choice silently decides what the image *is*. The matte should be the palette's own background, found as a fixed point: compute on the opaque support, matte the alpha region with that background, recompute, publish only if the two passes agree within the same-colour bar. Otherwise refuse. **Colour-blind legibility:** it should not become a scoring axis, and my design does not need it to be one — the accent term below is anisotropic toward lightness (§2.4), which is both the direction `perception-4` measured for accent function and the direction that survives deuteranopia. I would expose a CVD simulation as a *report-only* diagnostic (§8) and let the reviewer decide whether it earns a constraint.

### 2.1 The scale ladder and the surround field

Build a ladder of Gaussian-blurred versions of the linear-light image at scales σ₁ … σ_K, geometrically spaced from about half the short edge down to about a sixty-fourth of it, by repeated small-kernel blurs at full resolution (no decimation — nothing here resamples the image). Convert each to OKLab; write ĉ_k(x) for the surround colour of pixel x at scale k. Every pixel then carries a *figure–ground pair* at each scale and a displacement d_k(x) = c(x) − ĉ_k(x), decomposed into (ΔL, ΔC, ΔH) — the same decomposition the contract's perception work uses, so the vocabularies do not drift.

That decomposition is the whole semantic engine. A pixel whose displacement is near zero at every scale **is its own surround** — it is field. One whose displacement is large and **lightness-dominant** is ink. One whose displacement is large and **chroma/hue-dominant but lightness-small** is a mark — which open question 1 identifies as exactly the fragile case, a good reason for it to be a named quantity rather than an accident.

This is the representational commitment. It is not a histogram (which throws away where things sit) and not a segmentation (which commits to boundaries, and boundaries are the least stable object in a re-encoded JPEG — the boundary moves and every region statistic moves with it). Blur is the stable surrogate for "what is this sitting on".

### 2.2 Turning the measure into fields over colour

I never materialise the measure. What the energy needs, for any candidate triple v, is a handful of numbers of one shape: an area integral of a pixel statistic against a smooth kernel K_h centred on v in OKLab.

- **Presence mass** M(v) = ∫ K_h(c(x) − v) dx — v's neighbourhood share. The corpus facts anchor this: the median endorsed role colour's same-colour-bar neighbourhood share is 1.91 × 10⁻², against an exact-triple share of 8.89 × 10⁻⁵. Endorsed colours live in neighbourhoods carrying about two percent of the image while being individually rare. That two-hundred-fold gap **is** the robustness problem in one line, and it puts h at the scale of the same-colour bar.
- **Ground mass** G(v) — the same integral over the *coarsest surround* colour: how much of the image is sitting on v.
- **Ink energy** E_L(v) and **mark energy** E_C(v) — M-weighted integrals of |ΔL| and of √(ΔC² + ΔH²) over the ladder.
- **Habitual ground** B(v) — the mass-weighted mean surround of v's pixels: the colour v most often sits on, which makes "would this work as text" answerable before the background is known.
- **Spatial spread** and **border affinity** — the trace of the normalised second spatial moment of v's weighted pixel set, and its mass fraction in a border annulus over that annulus's area fraction (1.0 = no preference). Both frame-normalised and scale-free.

Computationally these are one object: splat all channels trilinearly onto a coarse uniform OKLab lattice (about 48³ cells, cell width well below h), then convolve the stack once with a separable Gaussian of bandwidth h. Every candidate's every statistic is then a trilinear read. The lattice is a **quadrature grid, not a decision** — the bandwidth spans several cells, so each read is Lipschitz in the pixels and no cell boundary can flip an outcome. I say this explicitly because it is precisely where binning would quietly reintroduce the instability the design exists to remove.

Separately, enumerate the artwork's **distinct triples** in one pass over a 2²⁴-bit set. That list — typically 10⁴ to 10⁵ entries — is the feasible set, and it is never filtered.

### 2.3 The field model: flat or gradient, and where the stops come from

Restrict attention to *field-like* mass: pixels whose displacement is small at every scale. Their colours form an area-weighted measure Φ on OKLab, and the gradient question is a question about Φ's **dimension**. Fit two models and compare description lengths, with the noise scale set by the contract's own same-colour bar:

- a **0-dimensional** model — Φ is one point plus noise;
- a **1-dimensional** model — Φ's mass lies along a segment, *and* position along that segment is a monotone function of a spatial direction. The second half is not optional: two flat areas of different colour produce an elongated covariance exactly as a ramp does, and only the spatial regression separates them. Project each field pixel onto Φ's leading eigenvector to get t(x), fit t against image coordinates, and let the 1-D model pay for its extra parameters out of the variance that regression explains.

Three consequences. **The colour threshold in this decision is inherited, not free**: if the segment's ends are within the same-colour bar they are the same colour, the ramp is degenerate, and the 0-D model wins by construction. **Which end is the background follows the artwork's own orientation** — the consumer renders a 135° linear gradient and the first stop is the background by ruling, so the background is the end whose mass sits toward the top-left under the fitted regression. That is free, and it also populates the optional `geometry` field opportunistically as §2 requires. **A collapsed surface cannot produce a gradient**, which falls out rather than being enforced.

Stops beyond the second come only from the contract's one admissible reason. With the ends fixed (they *are* background and surface), sample the straight OKLab segment and compute its **excursion**: at each t, the distance to the nearest populated artwork colour, read from the same lattice. If the maximum exceeds the contract's excursion bar, insert one interior stop — the artwork triple that most reduces that maximum, at the t where it peaked — and re-measure until the profile clears the bar. A genuine three-colour ramp is the case where the 1-D fit is better served by a polyline with one knot, and it lands on the same machinery. A fourth stop is *reported with its excursion evidence and not published*: the contract makes it negotiable-on-proof rather than granted.

### 2.4 The energy

The whole contract is now one constrained minimisation over tuples (background, surface, foreground, accent) drawn from the artwork's distinct triples, together with the collapse flags and the field hypothesis.

**Unary terms**, per role and candidate:

1. **Belonging** — a decreasing function of M(v), with *no cutoff*. Open question 2 says no computable rule matches the reviewer's sense of which colours belong to an artwork, and the rule that dropped colours for rarity had no discriminating power. My structural answer is to stop making it a rule: belonging is a **cost**, monotone in neighbourhood mass, which a rare colour can outweigh by being right about everything else. A wall cannot do that; a term in an objective can.
2. **Role fitness** — one integral per role. Background and surface: field-likeness × spatial spread × border affinity. Foreground: ink energy E_L, weighted by how much of that ink's habitual ground B(v) coincides with the chosen field — the artwork's own lettering colour is the natural winner, and this is the "text is luminance-driven, no colour rescue" ruling expressed as an objective rather than a gate. Accent: mark energy E_C times saliency-per-unit-area times the same sits-on-the-field weight, with the lightness component **up-weighted** relative to chroma, because `perception-4` measured that an accent which also moves in lightness works about twice as often. Entered as a direction, never as the confounded coefficient.
3. **Representativeness** — distance from v to the mass-weighted centroid of its own neighbourhood. The smallest term and the most dangerous: it is where naive pixel-snapping would sneak back in, and it is admissible only because it sits *inside the joint energy* rather than correcting a colour already chosen. A triple wins by being simultaneously a good representative and a good role-filler, or it does not win.

**Pairwise terms**, all inherited from the contract and none of them mine:

4. **Distinctness** — a hard barrier at the region-dependent same-colour bar for every published pair, with the two sanctioned exception classes. The direction-aware ellipsoid runs alongside as a report-only challenger, mirroring the contract's own provisional status; I do not enforce it and do not depend on the bar's exact value in either direction.
5. **Contrast** — foreground against background, surface and the whole rendered OKLab ramp; accent likewise with its own floor and its one escape at `ACCENT_FUNCTIONAL_DISTANCE`; barriers at the parameters' ε floors. Because the ramp is fixed before foreground and accent are chosen, the *minimum over the whole ramp* factorises into a unary constraint on each — which matters, since it is the expensive one.
6. **Identity coverage** — over the whole tuple: the mass-weighted transport cost from the artwork's chromatic mass to the published set. This is P5, the most frequent complaint class, moved out of the census and into the objective. Being mass-weighted and floorless, a major hue direction with no published colour near it is expensive while a minor one pulls almost nothing — the asymmetry the pathology asks for, and the reason it must not be an invariant.
7. **Foreground–accent separation**, at the inherited distance.

**Collapse** is a move, not a fallback: the tuple with surface exactly equal to background and the flag set competes in the same energy as every distinct-surface tuple, and wins when no surface earns its coverage contribution. Same for accent-to-foreground. There is no branch, so collapse rates become a readout of one term rather than an artefact of a control-flow path.

**The escape** is admitted as one extra candidate for background or foreground only when the constrained problem over the artwork's own triples is **infeasible**. The search being exact over an explicit finite set with admissible bounds, infeasibility is decidable here — the closest checkable shadow of "genuinely no other way" this architecture can produce. I claim the shadow, not the thing.

### 2.5 Solving it

Score all unary terms for all distinct triples by lattice reads — linear in the triple count. Seed an incumbent with a fast greedy feasible tuple. Then prune by **admissible bound**: every pairwise term is either a barrier (which can only increase the total) or the non-negative coverage term, so any candidate whose unary cost alone exceeds the incumbent's total cannot appear in the optimum. This is branch-and-bound, not filtering — no colour is removed by fiat, and "the whole artwork is feasible for every role" survives literally.

Carry a small number of field hypotheses — the 0-D model, the 1-D model, the best alternative second-field candidates — and evaluate the full energy under each, so the field decision is not taken before the roles that depend on it. Ties are broken by a declared total order on the 8-bit triple, reachable only on exact ties and reading nothing outside the pixel values.

### 2.6 Why this is robust, argued rather than asserted

Every decision variable is an area integral over a smooth kernel of bandwidth about the same-colour bar. A ±1 LSB dither displaces each pixel by a small fraction of that bandwidth, so every integral moves by a few percent and nothing flips. A JPEG re-encode preserves low-frequency spatial structure and the coarse colour distribution, which is all the ladder and the lattice read. Relabeling changes nothing: no term reads a filename, no ordering is by count or iteration index. Resize is absorbed because every statistic is an area fraction or a normalised coordinate and the ladder is in units of the short edge.

The honest limit: a dither changes *which exact triples exist*, so the published hex can move — but only to a triple within the perturbation's own displacement, the energy being Lipschitz and the feasible set having moved by exactly that much. So I cannot promise byte-identical hexes under dither; I promise agreement **on the contract's bar**, which is what the harness measures and what "same palette" means to the reviewer. The one residual discontinuity is a bifurcation between near-equal minima — and where two tuples score equally, principle 1 says both are valid.

## 3. Where the decisions live

Every judgment call is in the energy, and the energy is one object: which integrals count as field-likeness, ink-likeness and mark-likeness; the exchange rates between belonging, role fitness and coverage; the description-length exchange rate in the field model; the collapse cost; the declared tie-break order. Nothing else decides anything. The barriers are not judgments — they are the contract, inherited digit for digit, and if the reviewer moves one, my design moves with it without a line of new reasoning.

Two things look like mechanism and are decisions. The **lattice resolution** is a quadrature choice, legitimate only while bounded well below the bandwidth; if anyone tunes it, the design has been violated. The **representativeness term** is the reintroduction point for pixel-snapping and must stay small and inside the joint energy.

## 4. Free parameters

Seven independent decisions a human must make, plus two I expect an auditor to charge me for.

1. **Neighbourhood bandwidth h.** Anchored to the contract's same-colour bar, and *checkable*: at the right h, endorsed role colours should sit near the corpus's measured 1.91 × 10⁻² neighbourhood share. A falsifiable calibration, not a preference.
2. **The scale ladder's extent** (two digits, one decision). Anchored by geometry: the coarsest scale large enough that a field is its own surround, the finest small enough that lettering reads as figure. Checkable at dev time against the oracle's `ground_type` and `text_dominance` strata.
3. **Belonging-versus-role-fitness exchange rate.** The one that most needs a human. Anchor: a review round on pairs that trade them — a rare-but-perfect accent against a common-but-dull one.
4. **Coverage weight.** Anchor: the P5 complaint rate, set so the corpus rate of "a signature colour reached no published role" matches what the reviewer tolerates, measured by a targeted round rather than chosen.
5. **Accent lightness/chroma anisotropy.** `perception-4` gives the direction and forbids the coefficient, so a human must pick a magnitude. Ships `[UNCALIBRATED]` by construction; the parameter I would most want the deferred round to settle.
6. **The field model's description-length exchange rate** between colour fit and spatial coherence — how much monotone spatial structure a ramp must show to pay for itself. Anchor: the gradient-rate neutrality census plus a small round of borderline ramps.
7. **Collapse cost.** Anchor: corpus collapse rates against reviewer verdicts on borderline collapses.

The two I will not pretend away: the **border-annulus width** (I claim it belongs to decision 2; an auditor may reasonably call it an eighth), and the **number of field hypotheses carried forward**, which trades cost against optimality and can in principle be argued to convergence rather than chosen.

Inherited and not mine, but load-bearing: the region-dependent same-colour bar, both ε contrast floors, `ACCENT_FUNCTIONAL_DISTANCE`, `FOREGROUND_ACCENT_SEPARATION_DISTANCE`, the P1 excursion multiplier, the stop maximum.

## 5. Cost

**Priced at 1000 × 1000 = 10⁶ pixels**, single-threaded, in TypeScript over typed arrays, cold, nothing precomputed. Per stage: decode ≈ 30 ms (JPEG; AVIF materially more, and not mine to control); sRGB→linear→OKLab ≈ 40 ms with the exact 8-bit table; six-level full-resolution blur ladder ≈ 100 ms; trilinear splat of ten accumulator channels ≈ 150 ms; lattice convolution ≈ 30 ms; distinct-triple enumeration ≈ 20 ms; unary scoring ≈ 30 ms; field-model fit ≈ 40 ms; pruning, pair search, excursion profile and emission ≈ 30 ms. **Total ≈ 0.4 s**, of which decode is a tenth.

The defence, proportionate to where that lands: about eleven sweeps of the pixel array plus a fixed amount of work on objects whose size does not depend on the image (a 48³ lattice; a triple list bounded by 2²⁴, in practice 10⁴–10⁵). Ordinary per-file image code with a small, enumerable pass count, an order of magnitude below the seconds-scale band the reviewer ruled slow, needing no model, cache, index or prior pass.

The honest scaling problem: the sweeps are linear in pixels, so a 3000 × 3000 rendition costs about 2.5–3 s and **does** cross into the band that owes very good reasons. I will not claim an optimisation I have not measured. What I will say is that §1 sanctions exactly one remedy — downscale above some width, admissible only with measured proof of palette-equivalence — and that my architecture makes it unusually clean, because the *statistics* and the *feasible set* are separate objects: the ladder and lattice could be computed on a reduced image while the candidate triples stay native pixels, leaving invariant 2 untouched by construction. Whether the statistics survive that reduction is a measurement the resolution ladder can make, and I treat it as an obligation, not an assumption. Memory is ~12 MB of OKLab plus blur buffers at 10⁶ pixels and ~110 MB at 9 × 10⁶, which wants tiling.

## 6. Build cost

Decode and colour conversion, half a day; blur ladder, splat and lattice convolution, one to two days, mostly performance and determinism; the figure–ground statistics, two days; the field model — description-length selection, spatial regression, orientation, stop insertion, excursion profile — three days, the fiddliest part; the energy, barriers and branch-and-bound, two to three days; contract emission with collapse, escape and metadata, one day; wiring to the dev loop's candidate interface and an adjudication JSONL export, half a day; determinism hardening (fixed reduction order, declared tie-break, and the repeated-extraction canary the robustness harness says is still unbuilt), one to two days.

**Twelve to sixteen engineer-days**, with a first end-to-end contract-valid palette — ugly but real — in three to four, because the energy runs with only the belonging term and the contract barriers, and everything else is additive.

## 7. Expected failures and falsifier

Expected to be bad at: **full scenes with no readable ground**, where the field model fits a one-dimensional model to a rich photograph and publishes a ramp between two arbitrary ends; **typography-heavy covers**, where the ink is large, border-touching and spread, so it is mistaken for a field and becomes the background; **small dark saturated marks**, where a chromatic accent has little measurable chroma energy and loses to a brighter, blander candidate — the fragile case open question 1 says has no number; and **duotone or near-monochrome covers**, where the same-colour bar empties the feasible set and the escape fires more often than it should.

**Falsifier for the paradigm, not the tuning:** if, on the robustness harness's perturbation arms, palettes still move above the contract's bar at a rate comparable with the incumbent's, the paradigm is wrong — its whole premise is that decisions taken from area integrals are stable, and if a ±1 LSB dither still moves published colours by more than a bar, the instability was never in the quantisation stage and my diagnosis was mistaken. Pre-registered: **dither agreement ≥ 0.98 and jpeg-q92 agreement ≥ 0.95 on the regional bar.** Second falsifier, on completeness: if adjudication's reachability ever reports that the pruned search excluded a reviewer-endorsed role colour, "the whole artwork is feasible" is false in practice and the admissible-bound argument has a hole in it.

## 8. Exposable intermediate work

Every item below is an object the computation already produces, renderable beside the artwork and inspectable in seconds.

- **The figure–ground map**: the artwork recoloured three ways — field, ink, mark. A reviewer can say "no, the letters are not the background" knowing nothing about the algorithm, which is a round that grades a *stage* rather than a palette.
- **The belonging map**: the artwork recoloured by neighbourhood mass. Puts open question 2 in front of the reviewer directly.
- **The surround ladder**, as a strip of blurred images, making the scale decisions visible.
- **The per-role survivor table**: the top few dozen candidate triples with their unary terms broken out, as ordered swatches. "Is the winner the right one of these?" is a far cheaper question than "is this palette right".
- **The excursion profile**: distance from the straight OKLab ramp to the nearest populated artwork colour over t, with the bar drawn on it. Literally the quantity the guide-stop rule is about, and it makes every third-stop decision auditable.
- **The infeasibility certificate** when the escape fires: which barriers every tuple violated. It proves infeasibility under my energy's barriers — not "no other way" in the reviewer's sense, and I will not let it be read as that.

## 9. What I asked for

**Two things, both definitions rather than findings.**

**(a) The measured resolution floors.** `PHASE_0_DECISIONS.md`'s own scope line lists "measured resolution floors" among the document's contents; the delivered §§1–6 state none. My design turns on this at one point: the finest ladder scale and the accent's mark-energy term both need to know at what area fraction a mark stops being resolvable — the same quantity §1's informed-versus-chaotic classifier uses to decide whether a lost accent is expected or a failure. **Assumption I proceeded under:** the finest ladder scale is a sixty-fourth of the short edge, and an accent whose neighbourhood mass falls below roughly 10⁻⁴ of frame area is at risk of being resolution-informed rather than chosen. Both are placeholders for the measured floors.

**(b) The committed derivation table from the six ground probes to `ground_type`**, withheld from the question inventory. My field model makes the same 0-D / 1-D / multiple-fields distinction those probes compose into, and the table is a human-authored statement of how they compose — a definition, not a measurement. Without it my model selection and the oracle's categories may not name the same partition, and the P6 cross-check degrades into a category mismatch that will read as disagreement. **Assumption I proceeded under:** `flat_field`, `shaded_field` and `multiple_distinct_fields` map onto my 0-D model, my 1-D model with spatial coherence, and my 1-D model without it, and `pattern_or_texture` maps onto the 0-D model over a high-variance field.

**One contradiction, reported rather than asked about.** `PHASE_1_AUTHOR_BRIEF.md` §3.1 says the SAM cost "to quote is ~6.2 s per cold call", then prices the exceptional end of the cost bracket four paragraphs later at "roughly 2.7–4.3 s per image" — which §6.1 identifies as the *warm* figure and says is not the row to quote. The bracket's upper end is stated at two different numbers in one section; I designed against 6.2 s, §6.1 being newer and more specific.

## 10. Why this one

Four alternatives, rejected. **Clustering or quantisation in a perceptual space** (k-means, mean-shift, median cut, octree) is the default, and the default is what produced a system a ±1 LSB dither moved 114 times out of 114: its decisions are discrete assignments over near-tied bins, and it emits a colour *list* needing a separate role-assignment stage — which is where candidacy walls come from. **Segmentation-first, including runtime SAM**: 6.2 s cold owes "very good reasons" I do not have, condition 4 is unmet because plain code is nowhere near exhausted, and region boundaries are the least stable object in a re-encoded JPEG, so a design built on them buys its semantics at the price of the property v3 is trying to win. I use blur where segmentation would use a boundary, deliberately. **Analysis by synthesis** — the palette minimising the difference between the artwork and something rendered from it — has a fictional objective: nobody renders the artwork from the palette; the palette renders a player, so reconstruction error measures a thing no one judges. **Topological persistence of the colour density** I took seriously, since it carries the best stability theorem available here, and rejected as the primary frame because persistence tells you which structures survive, not which role they fill. Its idea survives as the scale ladder.

The brief's three goals are one goal. Instability, tunability and structural incompleteness are all downstream of the same move: turning the image into a discrete object early and then reasoning over it with rules. Keep everything continuous until a single argmin, make the feasible set the artwork itself, put the judgments in one energy — and robustness becomes arithmetic, the parameter count becomes the term count, and reachability becomes trivially total. That is one idea. Everything above is its consequence.
