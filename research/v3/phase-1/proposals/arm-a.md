# Arm A — The palette is the cheapest description of the artwork's colour field

## 1. The paradigm

**A palette is not a selection of colours; it is a fitted model of how the artwork was painted, and the four roles are that model's structural slots.** I propose one scalar objective — an expected coding cost, in nats per unit of image mass — defined over the *entire* structured answer at once: the field's colour path, its two ends, the two ink colours, the collapse flags, the geometry, and the number of stops. The published palette is the feasible minimiser of that objective. There is no stage that picks a background and hands the remainder to a later stage, no candidate list per role, and no eliminating filter: every exact 8-bit triple in the image is admissible for every role at every moment, and the only thing that can make a colour unpublishable is the output contract itself. The claim someone can disagree with is this: **the reviewer's judgment about "does this palette belong to this artwork" is, to first order, a judgment about how much of the artwork's colour mass the palette explains, traded against how much structure the palette had to invent to do it** — and that trade needs exactly one human-set constant, not nine hundred.

## 2. Image to contract

### 2.1 The one pass over pixels

The image is decoded at native resolution (§1 forbids resampling; dimensions come from the decoder's header) and reduced, in a single raster pass plus a small fixed number of separable box passes, to a table indexed by the distinct 8-bit triples that actually occur. This table is the *only* thing the rest of the computation sees. Per triple $c$ it holds:

- $n(c)$ — the exact pixel count;
- $\mu(c), \Sigma(c)$ — the first and second spatial moments of the pixels carrying $c$, in coordinates normalised to the short edge (scale-free, per §1);
- $e(c)$ — a **spatial extent profile**, described below.

The extent profile comes from a dyadic ladder of box means $\bar I_s$ at scales $s$ that are fractions of the short edge, from summed-area tables. For a pixel $p$, let $\delta_s(p)$ be the OKLab distance between its colour and $\bar I_s(p)$, and let $e(p) = \sum_s 2^{-s}\kappa(\delta_s(p))$ with $\kappa$ a smooth kernel of unit width in identity-bar units. Plainly: $e(p)$ is large when a pixel still represents its neighbourhood at coarse scales — the interior of a large area — and small when it stops doing so above a stroke width, which is what thin ink does. A continuous number, never a classification.

**The single most consequential decision in this design lives here, and the packet anchors it.** §4 records that the median endorsed role colour occupies $8.89\times10^{-5}$ of its image as an exact triple, but $1.91\times10^{-2}$ as a same-colour-bar neighbourhood — a factor of roughly 215. Any objective that reads mass at exact triples is reading a quantity two orders of magnitude smaller, and far noisier, than the one the reviewer is responding to. So all mass in the objective is read through a kernel of the identity bar's width: the **smoothed mass** $m(c) = \sum_{c'} n(c')\,\kappa\!\left(d_{\text{id}}(c,c')\right)$, evaluated on a hierarchical partition of the occupied colour set so that it costs $O(K \log K)$ rather than $O(K^2)$. Exactness survives where the contract needs it — the *published* colour is an exact triple — but nothing in the objective ever counts an exact bin.

### 2.2 The model, and what its slots are

The model says the image's colour-position measure was produced by two populations plus a residual.

**The field** is spatially extensive and low-frequency. Its colour behaviour is one of three model orders:

1. **Collapsed** — a single colour $B$, with $S = B$ exactly and `surfaceCollapsed` set.
2. **Two flat areas** — $B \neq S$, no ramp. (The contract permits a distinct surface with `gradient: null`; a model offering only "flat" and "ramped" has no way to say *diptych*.)
3. **A ramp** — a colour path $\gamma(t)$, $t \in [0,1]$, with $\gamma(0)=B$, $\gamma(1)=S$, and zero, one or two interior stops.

**The ink** is small, high-frequency and marks-like: two colours $F$ and $A$, or one when $A = F$ exactly and `accentCollapsed` is set. **The residual** is the uniform density over the sRGB gamut, absorbing mass no four-colour model claims — photographic content, texture, everything the palette is not — at a bounded, parameter-free price.

Membership is never decided. A pixel's prior probability of belonging to the field is $\pi(p) = \sigma\!\left((e(p) - s^\*)/w\right)$, a logistic in the extent statistic, where the split scale $s^\*$ is **part of the configuration and optimised jointly with everything else**. A colour that is 85% ink-like still carries 15% of its mass into the field term. This is what makes the whole thing continuous, and it is also how the awkward semantic classes are handled structurally rather than by patch: *giant display text* is ink at a large scale, reached by choosing a large $s^\*$ rather than by a special case; a *frame or bar* is field mass with a bimodal positional moment, which the two-flat-areas order fits natively; an *overlay badge* is a small, positionally concentrated ink population the objective prices and usually declines.

### 2.3 The objective

Write $x$ for the whole configuration: $(s^\*,\ \text{geometry},\ B,\ S,\ \text{interior stops},\ F,\ A,\ \text{flags})$. The objective is

$$E(x) \;=\; \underbrace{\tfrac{1}{N}\sum_{c}\Big[ n_\pi(c)\,\big(-\log \rho_{\text{field}}(c\mid x)\big) \;+\; \big(n(c)-n_\pi(c)\big)\,\big(-\log \rho_{\text{ink}}(c\mid x)\big)\Big]}_{\text{explanatory cost, nats per unit mass}} \;+\; \lambda\,\Omega(x)$$

minimised over the contract-feasible set, where $n_\pi(c)$ is $c$'s field-weighted mass and $\Omega(x)$ counts structural elements: *surface distinct from background* (1), *ramp rather than two flat areas* (1), *each interior stop* (1 each), *accent distinct from foreground* (1).

The field density $\rho_{\text{field}}$ mixes the residual with a kernel around the field's colour behaviour. For the ramp order this is an **integral along the rendered path**, $\int_0^1 \kappa(\varphi(c),\gamma(t))\,\nu(t)\,dt$, not an evaluation at the stops — which matters twice. It makes "the straight segment $B\!\to\!S$ passes through off-artwork colours" and "the ramp's likelihood is poor mid-segment" *the same quantity*, since off-artwork is precisely where the image has no mass: the contract's one admissible reason to add a stop is then what the objective measures, and meandering earns nothing because a detour through empty colour space explains nothing while still costing $\lambda$. And it is the same discretisation the whole-ramp APCA floors are checked on, so objective and invariant look at one object.

The ramp's positional coupling enters through the moment table: a field pixel's colour should be near $\gamma(t(p))$ with $t(p)$ its normalised coordinate along the ramp axis, and the per-colour positional Gaussian $(\mu(c),\Sigma(c))$ lets that expectation be evaluated in closed form to second order. **The ramp axis is not searched.** For the linear family it is the leading canonical correlation between normalised position and OKLab colour under field weighting — a $2\times3$ problem, closed form. Radial and conic families are the same computation in $\lVert p - \bar p\rVert$ and in polar angle. All three are fitted and compared against flat and two-flat in the same nats; the contract's "geometry is opportunistic, populated only when fitting computed it anyway" is then literally true.

**The output contract's structure is the model's structure, not a post-processing step.** The ends of the field's path *are* the two field roles, so `I1.first-stop-not-background` and `I1.last-stop-not-surface` hold by construction rather than by repair; a collapsed surface cannot publish a gradient because a constant path has one end; and collapse is not a fallback but the model order that pays no $\lambda$, chosen when the second colour does not repay it. Orientation is fixed by the renderer rather than by taste — increasing $t$ runs along the consumer's 135° axis — and in the two-flat order $B$ is the larger field mass. Two bits of convention, named as such in §3.

Which ink is foreground and which is accent is a further binary dimension of $x$, evaluated like every other: both labellings are scored, the feasible minimum wins. The foreground carries the contract's whole-ramp text floor with no colour rescue at any distance; the accent carries its own floor and its one escape. The two ink kernels also push each other apart for free — two kernels within an identity bar of one another explain the ink mass no better than one, so $\lambda$ goes unrepaid and the model collapses them.

### 2.4 The contract is the feasible set, and it is the only wall

Invariants 1–5 are hard constraints on the candidate configuration: schema shape, exact-source support with its population and spatial-spread test, palette-wide distinctness at the same-colour bar with its two sanctioned exception classes, and the raw-APCA floors as minima over the *entire* interpolated ramp for both foreground and accent. User parameters act **only** by tightening this set; the objective never changes. That delivers §2's paradigm-neutral parameter requirement structurally rather than by test: at defaults the feasible set is the invariant set, so the answer is byte-identical to the unparameterised algorithm, and raising a floor can only change an artwork whose optimum was infeasible under it — zero collateral, by construction.

The escape (`#ffffff`/`#000000`) is a widening, not a preference: the search runs over the in-artwork feasible set, and only if that set is *empty* is it re-run over the two escape configurations. "No other way to produce a 2-colour palette" is then not an unquantifiable claim I assert but the literal state the search reported — and forgetting to declare it fails invariant 2 as before. Given that 1,396 of 1,397 endorsed role colours are exact triples of their source, I expect this branch essentially never to fire.

### 2.5 The search

The configuration space is nominally $|C|^4$ with $|C|$ up to $10^6$, so the search has to be real: it is a **branch and bound over a hierarchical partition of the occupied colour set**, with an outer loop over the $\sim\!8 \times 5$ combinations of split scale and field order.

Every term of $E$ is Lipschitz in each published colour with a constant I can write down — OKLab distances are 1-Lipschitz, the kernels have bounded derivative, APCA is smooth in luminance away from its clamp, and smoothed masses are monotone in the tree's stored bounds. So a tree node (a bounding box in OKLab with aggregate mass, moments and extent statistics) yields a valid **lower bound on the energy of every colour inside it**. Nodes whose bound exceeds the incumbent are pruned with a certificate; survivors are split. The coupling between roles is a four-variable pairwise problem, so the bound is assembled per role and relaxed pairwise — the standard construction, tight here because the energy is smooth by design.

**This is the one distinction the seat turns on: elimination by certified bound is not a pipeline stage.** A stage discards a colour because a rule said so before a later rule could speak. Branch and bound discards a region only after proving it cannot contain the optimum of the *whole* objective; where the proof is unavailable — a shallow, near-degenerate landscape, which does happen — the region is searched, not discarded. The search is anytime: it carries a node budget, and if the budget is exhausted the incumbent is still feasible and publishable while the run reports a **certified optimality gap** rather than pretending. A nonzero gap is a fact about that artwork worth looking at, not an error.

There is no RNG, no sampling, no hash-order iteration, and nothing reads a filename, an id or a clock. The colour table is sorted on a canonical key before the tree is built; energies are compared after rounding to a precision derived from the arithmetic's own noise floor; ties break on (smoothed mass descending, hex ascending). Determinism and relabel invariance are therefore structural, not tested-and-hoped.

### 2.6 Why the robustness is structural

Success criterion 1 asks for a structural answer, so here is the argument rather than a hope.

Every quantity entering $E$ is an **integral of a bounded function over pixels** — masses, kernel-smoothed masses, spatial moments, extent profiles. An $\varepsilon$-perturbation of the image (a $\pm1$-LSB dither, a re-encode) perturbs each by $O(\varepsilon)$, hence perturbs $E$ uniformly by $O(\varepsilon)$. Nothing counts an exact bin; nothing takes an argmax over a histogram; nothing thresholds a membership. So the minimiser can only move to a configuration whose energy was already within $O(\varepsilon)$ of the winner — and because the landscape's characteristic colour scale is the identity bar, **a colour that displaces the winner under a dither lies within the same-colour bar of it.** That is exactly the comparison the robustness harness makes, and it yields the prediction and the limit in §7.

The one place discreteness bites is the exact-pixel requirement, handled by minimising over the discrete set directly rather than optimising in the continuum and snapping. The continuous relaxation exists only to bound; it never answers.

## 3. Where the decisions live

Four places, and I would rather name them than have them found.

1. **The extent statistic decides what "field" and "ink" mean.** It is a judgment that spatial scale — not saliency, not semantics — is the right axis separating a background from a mark. It is soft and jointly optimised, so it eliminates nothing; but if scale is the wrong axis, this design is wrong at the root.
2. **$\lambda$ decides how much structure the artwork gets.** One constant governs the gradient boolean, both collapses and every stop beyond the second: the corpus's gradient rate and its collapse rates, in one number. Deliberately so — it is where I want the reviewer's arbitration to land, being the only question here that is taste rather than measurement.
3. **Two conventions of orientation** — increasing $t$ runs along the renderer's 135° axis; the larger field mass is the background when there are two flat areas. Bits, not parameters, but they are the arbitrary part of the answer and they will surface as role-permutation churn if I have them wrong.
4. **The residual is a uniform on the gamut.** A decision about how expensive it should be to leave a photograph unexplained. A heavier tail would make the model more tolerant of scenes; I took the parameter-free option and expect §7's first failure to be the price.

Where decisions deliberately do *not* live: no rarity rule, no "belongs" test, no per-role candidacy, no threshold of mine anywhere in the objective. Open question 2 asks how a paradigm decides whether a colour belongs to an artwork. **This one does not decide; it prices.** A rare colour explains little mass, so it enters weakly and must be paid for by $\lambda$ like any other structure — never excluded, and it wins on the merits when it is the only thing explaining the ink population. Likewise P5, a major hue direction with no published colour near it, is not a check I bolt on: unexplained mass is the leading term of the objective.

## 4. Free parameters

Four, plus one compute budget. Each is a decision the *paradigm* needs a human to make.

1. **The colour kernel's bandwidth**, used identically for colour smoothing, the field/ink kernels and the extent statistic. Anchor: the reviewer's calibrated regional same-colour bars, frozen 2026-08-03, with perception-4's direction-aware form available as a challenger. I introduce no new number; the decision is to make the model's one length scale *be* the measured identity scale. Nothing turns on its exact value, since the objective is smooth in it.
2. **The field/ink softness $w$.** Anchor: one octave of the dyadic ladder — the ladder's own resolution. No sharper value is defensible and a much softer one erases the distinction.
3. **$\lambda$, the model-order cost.** Anchor: one small review round on gradient rate and collapse rate, the two distribution-level censuses §4 already defines. It cannot be derived and cannot be zero, and the reason is §1's resolution agnosticism: the data term is a per-unit-mass cross-entropy precisely so model order does not depend on pixel count, which leaves the structural trade needing its own scale-free constant. One constant for all four structural decisions, and I treat that claim as falsifiable (§7).
4. **The accent kernel's anisotropy.** perception-4 measured a lightness step at roughly 3.9× a chromatic one for findability, refused the constant twice as `stratum-dependent`, and warned never to share a ruler with the identity criterion. So the accent kernel is anisotropic in the *opposite* sense to the identity kernel, at a ratio that is `[UNCALIBRATED]` — used as a direction, with the design required to degrade gracefully across $[1,4]$ rather than turn on a value. The parameter I am least happy about, and the one I would expose first.

**Plus a search budget** (node count) — a compute knob rather than a behaviour knob, but it can change an answer when it binds, so I count it rather than hide it. It is set so the certified gap is zero on effectively every image, and the gap is published per run.

Explicitly *not* free: the residual density (uniform on gamut); the geometry families (compared in nats); the ramp axis (closed form); the per-image field noise scale and residual mixing weight (nuisance parameters estimated per image — estimated is not chosen); the tie-break order and numeric quantisation (derived from float precision and the Lipschitz constants); and every contract threshold, which is the reviewer's and which I inherit without adding to.

## 5. Cost

Cold, per file, one image, nothing precomputed, nothing cached, no companions.

- **Decode** — unavoidable, and for larger renditions the largest single line.
- **One raster pass** building the colour table with counts and spatial moments: $O(N)$, open-addressed on the 24-bit key.
- **The scale ladder**: summed-area tables plus $\sim\!8$ box means — roughly 10–16 linear passes.
- **Tree build and smoothed masses**: $O(K\log K)$ in distinct colours, $K$ typically $10^4$–$10^6$.
- **Fits and search**: the closed-form axis fits are negligible; branch and bound is $10^5$–$10^6$ flops in the ordinary case, plus a whole-ramp feasibility check at a few dozen sample points per candidate ramp.

Everything after the first pass is linear or log-linear in quantities that do not grow with the image, so the estimate is dominated by decode and the ladder. **Low hundreds of milliseconds for a typical album cover, decode a large share of it, and comfortably under two seconds at 3000 px.** The packet's own manifest discloses — in the trim rationale for the withheld oracle pipeline document — that 0.00% of corpus images exceed 768 px; if that survives contact with the deployment distribution, the realistic figure is the low end. I use it and flag its provenance rather than quietly assuming it.

Per §3.1: no millisecond budget exists in v3 and I am not inventing one. This lands at the *target* end of the bracket — ordinary per-file image code, at the cost such code naturally has — roughly an order of magnitude below the ~6.2 s cold figure the reviewer has already called slow, so it owes no exceptional justification. **No model runs at runtime**, so §6.1's four conjunctive conditions do not apply; the only one I engage is condition 4, on the side that says plain code should be exhausted first.

Two honest risks to the number. Branch and bound can degenerate on a near-flat landscape, which is why the budget and the published gap exist. And a very large distinct-colour count ($K$ approaching $10^6$ on a noisy high-resolution photograph) makes the tree build dominant — linear-ish and bounded, not a cliff.

## 6. Build cost

The riskiest component is not the model, it is the **validity of the lower bounds** — an incorrect bound prunes the answer silently and looks like a merely mediocre palette. So the build carries a mandatory differential test: an exhaustive minimiser over a coarsened colour set, compared against the branch-and-bound result on a few dozen covers, asserting identical configurations.

Shape of the work: the colour table, moments and scale ladder are a day or two; the axis fits and energy assembly another two; the feasibility checks largely exist in `src/contract/`; the branch and bound with its bounds and reference harness is the expensive item, perhaps four or five days. Call it **two focused weeks to palettes that flow through the dev loop, the robustness harness and adjudication unchanged**, plus one small review round to set $\lambda$. The candidate interface is a function from image path to `Palette` — exactly what the dev loop consumes — so nothing bespoke is needed to measure it.

## 7. Expected failures and falsifier

**Expected failures.** Full-scene photography with no field: the residual takes most of the mass, the field kernel fits a compromise colour that exists nowhere in particular, and the two field roles become a shallow, low-confidence pair. Duotone and limited-palette design work, where background and surface are genuinely interchangeable: near-degenerate minima, and therefore **role permutation rather than colour error as my dominant instability** — I expect cross-rendition disagreements to be mostly permutations of the same four colours. Poster typography covering most of the canvas: $s^\*$ should handle it, and the field/ink inversion is exactly where I expect it to invert wrongly. And accents differing from their field in hue and chroma only — perception-4 calls that the fragile case and my parameter 4 is uncalibrated, so I expect to be worst precisely there.

**Falsifier, and it separates "objective wrong" from "under-searched".** Evaluate $E$ at the 351 endorsed palettes and at my own published palette for the same file, on the artworks where the two disagree. If the endorsed palette is *feasible* and my energy nonetheless ranks it worse than mine in the majority of disagreements, then no improvement in search, no retuning of $\lambda$ and no better bound rescues this: the objective is not measuring the thing the reviewer is measuring, and the paradigm is wrong. Conversely, if the endorsed palettes come out systematically *lower* in energy than my published ones, the objective is right and the search is broken, which is a different and much cheaper problem. Second falsifier, on the one-constant claim: if no single $\lambda$ can produce a gradient rate and a collapse rate the reviewer accepts simultaneously — if the two demand values that do not overlap — the rate-distortion framing is wrong rather than under-tuned, and $\lambda$ should never be quietly split into four.

**And a prediction with a limit, so it can be checked.** Under a $\pm1$-LSB dither I expect near-total agreement *at the same-colour bar* and materially less at exact hex, because a dither creates new triples adjacent to old ones and the argmin is free to move within a bar. If exact-hex agreement is read as the headline, this design will look worse than it is; if bar agreement is *also* poor, the continuity argument in §2.6 is empirically false and I would want to know that before anything else.

## 8. Exposable intermediate work

Every intermediate here is a real object an instrument can already read, not a promise.

- **The colour table** — every distinct triple with its exact count, smoothed neighbourhood mass, spatial moments and extent profile. A complete statement of what the image offered, and the natural input to adjudication's reachability check.
- **The field/ink responsibility map**, as a greyscale image the size of the artwork. A human can look at it and say "you thought the letters were the wall" without knowing anything about the objective.
- **The energy of any palette, including one the algorithm did not produce.** The objective is a scoring function on arbitrary contract-legal palettes, so the reviewer's endorsements can be scored beside ours. This is the falsifier's mechanism, and it exists from the first prototype.
- **The runner-up list** — the top few feasible configurations with their energies and the gaps between them. When two palettes are within noise of each other that becomes *visible* rather than inferred, before anyone re-encodes anything.
- **The per-term account**, in nats: what the field explained, what the ink explained, what the residual absorbed, what each structural element cost. A gradient published for 0.003 nats is a different fact from one published for 0.3.
- **The certified optimality gap** per run, and the pruning certificates behind it.

## 9. What I asked for

**Primary.** The definition and current thresholds of invariant 2's *population floor and spatial-spread test*. `PHASE_0_DECISIONS.md` §4 says the shape is settled and the thresholds need provenance, but neither is in my packet and the catalog's `src/contract/` row names no README. My design turns on it directly: the objective prices rarity rather than thresholding it, so that floor is the *only* rarity rule in my system, it sits in the feasible set rather than in the objective, and I cannot tell whether a colour at the endorsed median of $8.89\times10^{-5}$ exact-triple share passes it. **Assumption I proceeded under:** the floor admits colours at that median share — loose enough not to exclude the population the reviewer has already endorsed — and the spread test is a function of positional moments, which my table already carries. If the floor is in fact tighter than the endorsed median, my "price, don't threshold" claim is partly false and the contract is doing rarity work I have credited to the objective.

**Secondary.** The corpus resolution distribution from the withheld `ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md` §7. My cost estimate spans an order of magnitude between 640 px and 3000 px inputs and the distribution decides where in that span the honest number sits. The packet's own `MANIFEST.json` discloses the headline ("0.00% of images exceed 768 px") in its trim rationale; I have used it and said so in §5, but a leaked headline is not a distribution.

**Not asked for:** anything from `ORACLE_QUESTION_SET.md` beyond the inventory supplied. This paradigm uses no semantic labels at runtime and does not need to know how well any question performed. The stub was right that the oracle documents are the ones most likely to matter to an author; for this seat they do not.

---

### Two questions the brief says are the algorithm's, not tooling's

**Flattening transparency.** The contract refuses transparent input loudly and I keep that. But the paradigm has a real answer if one is ever wanted, and it is not "white": the matte would be **one more variable of the configuration**, chosen by the same objective — the flatten colour minimising $E$ — rather than fixed in advance. Deciding the matte in advance decides what the image *is*, which is exactly what a global objective should refuse to do on the caller's behalf.

**Colour-blind legibility.** Not a term in the objective. §2's parameter rule requires anything optional to be inert at its default and cost zero collateral when enabled, and only a constraint can promise that — an objective term cannot. So the natural home is an optional narrowing of the feasible set: the accent's findability and the foreground's floor required to hold under a CVD simulation as well as under normal vision. Off by default, byte-identical when off, and when on it can only change artworks that actually fail it.
