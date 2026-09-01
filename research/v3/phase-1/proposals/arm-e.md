# Arm E — The layer stack

## 1. The paradigm

An album cover is not a distribution of colours. It is a **stack of things laid on top of other
things**, and the designer already solved our problem when they decided what colour to lay on what.
This proposal recovers that stack literally — by peeling the image apart with connected
(component-tree) filters and measuring, for every piece, how hard it is to remove — and reads the
four roles off the *layer order*, not off any summary of the pixel population. The claim someone can
disagree with is this: **a colour belongs to an artwork exactly to the degree that the artwork's
structure would not survive its removal.** That quantity is persistence, it is computable in plain
code in one pass over one cold file, and it is the *only* thing my design lets decide which colours
are publishable and which role each one takes. Frequency, cluster membership and semantic identity
are all downstream of persistence, and none of them appears anywhere in the pipeline.

Two consequences fall out, and they are why I picked this rather than decorations on it. First,
**every colour a connected filter can produce is a value the input already contained** — attribute
filters and reconstructions never invent levels — so the contract's hardest clause (every published
colour is an exact 8-bit pixel of the artwork) is satisfied *by construction*, with no snapping step
anywhere. Second, persistence has a **stability theorem**: the persistence structure of a function
changes by no more than the sup-norm of the perturbation applied to it. A ±1-LSB dither is a
perturbation of about 0.002–0.004 in OKLab, far below the smallest same-colour bar. Robustness is
goal 1 and the brief asks for a *structural* answer; a stability theorem is the most structural
answer available.

## 2. Image to contract

### 2.0 Two rules I impose on myself

Every question of the form *"are these close enough?"* — anywhere in the pipeline — is answered with
the contract's own same-colour ruler and nothing else. No second radius, no local epsilon, no
tolerance. That is parameter honesty as an architectural rule, and it is what keeps §4 short.

Second, for the relabeling failure mode: **every tie is broken on a quantity computed from pixel
values and image coordinates.** No hash order, no map iteration order, no seeded RNG, no filename, no
content hash; accumulations run in a fixed raster order so float reduction is order-independent by
construction.

### 2.1 Decode, and the colour index

Decode at native resolution from the pinned decoder, dimensions from the header, transparent input
refused loudly. Build the **distinct-triple index**: the distinct 8-bit triples present, with pixel
counts. Covers typically hold tens of thousands of distinct triples against hundreds of thousands of
pixels, so converting to OKLab once *per distinct triple* is a 5–20× saving on the only transcendental
work in the pipeline. Every later colour computation runs on this index; every published colour is an
entry in it, which is why invariant 2 cannot be violated except deliberately (the escape).

### 2.2 The peel — separating ground from figures

A **component tree** over a scalar image records every connected component of every upper (or lower)
level set, nested by inclusion, and is built by union-find after a counting sort of the levels —
near-linear, no parameters, no iterative solver. I build four, and call each an **evidence lane**:

| lane | scalar it is built on | what it can see |
|---|---|---|
| L↑, L↓ | OKLab lightness | anything lighter or darker than its surroundings |
| C↑ | OKLab chroma magnitude | anything more saturated than its surroundings, at equal lightness |
| H↑ | signed projection of chroma onto the image's own dominant chromatic axis | anything of a different hue than its surroundings, at equal lightness and chroma |

The H↑ lane's axis is derived from the image's own colour distribution (the area-weighted principal
direction of the chroma plane), so it carries no fixed hue constant. The lanes exist because a scalar
component tree is blind in the directions its scalar does not vary — and the brief's open question 1
says exactly where that blindness would hurt: *an accent that differs from its field only in hue and
chroma is the fragile case.* **Adding a lane can only add candidates, never remove one**, which is
what "structural completeness" means here: there is no filter between a lane and the role assignment,
so no candidacy wall can exist.

For every node of every tree I compute two attributes. **Area persistence** is the area fraction
(never a pixel count; §1's scale-free requirement) at which the node is absorbed into its parent —
derived exactly from the tree in one traversal, so there is no ladder to sweep and no ladder
resolution to tune. **Dynamics** is how far the node's level must move before it merges with a
component containing a higher extremum: the persistence pairing of the level function, and the
quantity the stability theorem bounds.

These two are the axes of the whole design. Area persistence answers *how big a thing is in the
picture's structure*; dynamics answers *how much colour you must destroy to make it go away*. A
film-grain speck has near-zero of both; a signature red dot at 0.01% area has enormous dynamics and
negligible area. That is the pair the brief's open question 2 says no computable rule has captured —
the old rule dropped colours for being rare and had no discriminating power, because rarity is the
wrong axis. **My answer to "does this colour belong": it belongs iff it is the value of a node with
high persistence in at least one lane, on either axis.**

### 2.3 The ground, and where the peel stops

Filtering out every node below an area-persistence level α and reconstructing gives a **ground image**
G(α): the artwork with everything smaller than α removed and repainted with what encloses it. Because
the repainting takes the enclosing component's own representative value, G(α) is made entirely of the
artwork's real colours.

The peel has to stop somewhere, and I do not want a constant for it. The stopping rule is
**stability**: as α increases, measure the colour mass moved per unit of log α (the area-normalised
OKLab displacement between G(α) and G(α·e)). Designed covers produce plateaus — long stretches of α
over which the ground does not change, because there is genuinely nothing of that size in the picture.
**The field is G(α) at the widest plateau in log α.** This is the maximally-stable-region criterion,
it contains no threshold, and its argmax is by definition the choice a perturbation is least able to
move.

Two objects come out: **the field**, the picture with the stuff taken off it — an image, made of real
pixels, gradeable by a human who knows nothing about palettes (§8) — and **the figure layers**, the
nodes the peel removed, each carrying its lane, both persistences, its colour distribution, its area
and its spatial footprint.

### 2.4 Field → background, surface, and the gradient boolean

Take the field's colour set, weighted by area. Build the **same-colour graph** on it: an edge between
two colours whenever they are within the contract's ruler. Then:

- One connected component of *diameter* below the ruler: one colour. Background is that colour,
  **surface collapses** and is declared, and there is **no gradient** — the contract forces this, since
  both ends would be one colour.
- Connected under the ruler but with diameter above it: the field's colour varies in steps every one
  of which is invisible while the whole span is visible. **That is what a gradient is**, stated without
  a new constant — *a path in colour space every step of which is below the ruler.* A hard join between
  two flat areas is the opposite, one step above the ruler, and yields two flat roles with
  `gradient: null`.
- Disconnected into three or more parts: take the two largest by area, publish flat, and report the
  rest rather than pretending it is absent.

For a gradient, the ramp parameter t is the field's spatial projection onto the **render axis** — the
135° diagonal the consumer actually draws. The gradient is published only if colour order and t are
monotonically related at all (a rank-correlation test through the shared statistics module, not a
hand-set threshold); a field whose colours wander non-monotonically in space is a *texture*, and
textures publish flat. That is the whole gradient boolean, and it is spatial, which is the honest
reason gradient and texture differ.

**Polarity.** The end at the smaller mean projection along the render axis is the background; where
the variation is near-perpendicular and the projection degenerate, the larger-area end takes it. Both
ends are representative pixels by §2.6, so the contract's endpoint identity is exact by construction
rather than by repair.

**Stops beyond the second.** Compute the maximum excursion of the straight OKLab segment from
background to surface away from the populated artwork colours — the contract's own P1 quantity. Under
the excursion bar, publish two stops. Over it, insert **one** interior stop at the t of maximum
excursion, taking the field's representative colour there, and recompute. If three stops still exceed
the bar, **I do not publish a fourth**: I publish three and report the residual excursion, which *is*
the evidence a fourth stop's negotiation would need. No stop is added for coverage or to move a
metric, and a stop that does not reduce excursion is not added at all — so meandering is unreachable
rather than forbidden.

### 2.5 Figures → foreground and accent

Every figure layer, from every lane, enters one pool. Ranking uses three structural attributes and no
weights: **dynamics** (how much colour must be destroyed to remove the layer), **dispersion** (how
widely its components are spread over the field — normalised spatial entropy of its footprint), and
**area fraction**. Aggregate by **rank sum** — equal weights by declaration, which is one decision
rather than three constants (§4, P2). Then:

- **Foreground** maximises rank(dynamics) + rank(dispersion). Text is what spreads across a cover
  while being expensive to remove — a title, a tracklist and an artist name are one colour appearing
  in many places. This is why the artwork's own figures are the right evidence: the designer already
  chose a colour that reads over that ground, and that colour belongs to the artwork by construction.
- **Accent** is the highest-ranked remaining layer that is *localised* — maximising
  rank(dynamics) + rank(−dispersion) — and distinct from the foreground above the ruler. A sticker, a
  logo, a signature colour: expensive to remove, concentrated in one place.
- If no remaining layer clears distinctness, **accent collapses to exactly the foreground** and is
  declared. If no figure layer survives the peel at all, the foreground falls back to the field colour
  furthest from the background above the ruler; if there is none, the **escape** fires — background is
  the field colour, surface collapses, foreground is whichever of pure white or pure black is *absent*
  from the distinct-triple index and further in APCA from the background, and accent collapses to it.
  All four escape conditions are checkable directly from the index, so declaring it is never a guess.

Note what did not happen: no layer was excluded from any role by its size, its lane or its saturation.
A colour found only in the H↑ lane can be the background if it is the field; a colour at 0.01% area
can be the accent. That is goal 3 discharged architecturally.

### 2.6 The representative pixel — where robustness is actually won

Every role and every stop must be one exact triple, and picking one out of a region is where naive
designs break: the endorsed evidence says the median role colour's *exact triple* covers about 9e-5 of
the image while its same-colour neighbourhood covers about 2e-2. The triple is rare; the neighbourhood
is substantial. So do not choose the triple — choose the neighbourhood, then take its mode.

Score each distinct triple in the region by the area-weighted sum, over the region's colours, of a
kernel whose bandwidth is the contract's ruler; publish the argmax, ties broken on lowest lexicographic
RGB. This is the mode of a colour density smoothed at exactly the perceptual radius. **A perturbation
smaller than the ruler cannot move it except through an exact tie, and ties break deterministically** —
the whole robustness story in one sentence, and the reason I expect re-encode and dither agreement here
to differ in kind, not degree, from an argmax over bins. Computationally: a coarse 3-D OKLab
accumulator (bin diagonal below half the smallest ruler value, so the binning derives from the contract
rather than being chosen), three separable box passes for the kernel, then exact scoring among the few
triples in the winning bin's neighbourhood.

### 2.7 Parameters, invariants, and where a raised floor acts

At defaults the contrast floors sit at ε and bind essentially nothing, so the parameterised and
unparameterised algorithms are byte-identical — requirement (a) is met because the floors are a
*feasibility predicate* on the assignment, not a post-hoc repair. When a caller raises a floor, the
predicate tightens and §2.5's ranked assignment re-runs over the same pool. An artwork that did not
violate the floor has an unchanged winner, so requirement (b) — zero collateral — holds structurally.
No repair stage exists anywhere here, so the "first repair relocates the defect" failure mode has
nothing to attach to.

## 3. Where the decisions live

Five places, deliberately concentrated:

1. **The stopping rule for the peel** (§2.3) — what counts as "the ground", the biggest judgment in
   the design. One function, consuming the log-α stability curve, returning one α; everything
   downstream is mechanical given that α.
2. **The gradient/texture discriminator** (§2.4) — one rank-correlation test.
3. **Polarity** (§2.4) — which end of the ramp is the background. One comparison.
4. **The figure ranking key** (§2.5) — which attributes enter the rank sum, and therefore what "this
   is the text colour" means. One list of three names.
5. **The ruler** (§2.0) — inherited from the contract, used everywhere, owned by nobody here.

The two questions the brief flags as algorithm material get answers from the paradigm rather than from
taste. **Alpha matting:** the runtime refuses transparent input; if a matte is ever needed it must be
the *reconstructed ground extended under the alpha region*, never white, black or a blend — a constant
matte injects a colour that then becomes eligible for publication, and this paradigm's guarantee is
that every publishable colour came out of the file. The ground is already computed, so the principled
matte is free. **Colour-blind legibility:** report-only, never a gate and never a parameter. The same
ruler under a published CVD simulation gives an advisory distance for the foreground↔background and
accent↔field pairs, adding no tunable, since the simulation matrices are external standards rather
than values anyone here would fit.

## 4. Free parameters

Five independent human decisions. Not five constants — five decisions, and I have tried to make each
one a *choice among named alternatives* rather than a number, because a choice can be settled by one
review round and a number needs a calibration campaign.

| # | the decision | what anchors it |
|---|---|---|
| P1 | **The ruler** — the radius at which two colours are the same. Kernel bandwidth, gradient-chain step, distinctness gate, smoothness test, accumulator bin size. | Already anchored: the contract's frozen regional bars, plus whatever the direction-aware challenger becomes. I introduce no ruler of my own. |
| P2 | **The figure ranking key** — which of {dynamics, dispersion, area} enter the rank sum for foreground and for accent, and whether aggregation is rank-sum or lexicographic. | One blinded forced-choice round on artworks where the attributes disagree: *which of these two colours is this cover's text colour / accent?* ~40 items. |
| P3 | **Polarity** — which end of the field ramp is the background. | One round on rendered ramps shown both ways round, ~20 items. A single bit, directly askable. |
| P4 | **The gradient/texture discriminator** — that a gradient requires monotone colour order along the render axis. | The gradient-rate census against the oracle's `ground_type` counts (corpus-scale counts, never per-item verdicts), plus a small round on marginal cases. |
| P5 | **The peel's stopping functional** — widest log-α plateau of colour mass moved, rather than some other stability functional. | The cross-rendition informed/chaotic metric: the right functional is the one whose chosen α agrees across renditions. Anchored by an instrument, not the reviewer — the cheapest anchor available. |

Nothing else is settable. The excursion bar, the contrast ε values and the region partition are the
contract's. The accumulator resolution derives from P1 and the persistences from the image. There is
no ladder step, no cluster count, no saturation floor, no minimum area, no rarity cut and no weight
vector anywhere.

## 5. Cost

A cold run, one file, one core, no cache, no companion artifact, nothing precomputed.

| stage | 640×640 | 1500×1500 |
|---|---|---|
| decode | 8–15 ms | 35–60 ms |
| distinct-triple index + OKLab on distinct triples | 3–8 ms | 8–20 ms |
| four component trees (counting sort + union-find) | 60–120 ms | 300–600 ms |
| attributes, persistence, ground reconstruction | 10–20 ms | 50–110 ms |
| representative-colour modes | 5–15 ms | 10–25 ms |
| gradient path, excursion, assembly, validation | 2–5 ms | 4–10 ms |
| **total** | **≈ 90–180 ms** | **≈ 0.4–0.85 s** |

The lanes are independent and embarrassingly parallel, so on four cores the totals fall to roughly
50–90 ms and 0.15–0.35 s. A first TypeScript prototype should be costed at 2–4× the low end.

**The argument this needs is short, because of where it lands.** This is ordinary per-file image code:
the dominant term is four near-linear union-find passes — the same order of work as decoding the file
a few more times — and the transcendental work is bounded by the distinct-triple count, not the pixel
count. It is roughly 30–70× cheaper than the ~6.2 s cold SAM call the reviewer ruled slow, so no
exceptional justification is owed and none is claimed. No model runs; condition 4 — that plain-code
methods be exhausted — is what this proposal is *for*.

## 6. Build cost

| piece | days | risk |
|---|---|---|
| decode, distinct-triple index, OKLab, determinism harness | 1 | low |
| max/min-tree with area and dynamics attributes, tested against brute force | 3–4 | **the real risk** — a subtly wrong tree fails silently and plausibly |
| the four lanes and the chromatic scalars | 1–2 | medium — the H↑ axis needs care on near-neutral covers |
| ground reconstruction, log-α stability curve, plateau selection | 2 | medium |
| representative-colour mode (accumulator, blur, exact refinement) | 1 | low |
| field analysis: same-colour graph, gradient test, polarity, stops, excursion | 2 | medium |
| figure ranking, role assignment, collapses, escape | 1–2 | low |
| contract emission and instrument wiring | 1–2 | low |

**About 8–12 working days to an end-to-end emitter producing real, contract-valid palettes**, and
**3–4 weeks** to something worth putting in front of the reviewer — the extra time being the corpus
sweep, the pathologies, and P5's functional selection against the cross-rendition metric. The build is
front-loaded onto the component tree, which is well-understood literature with a brutal, cheap test:
compare against a naive quadratic implementation on 32×32 images. If that lands correctly, the rest is
bookkeeping over it.

## 7. Expected failures and falsifier

**Expected failures.** Photographic full-scene covers with no ground: the log-α stability curve will be
flat, no plateau wins convincingly, and the field is whatever survives. I expect this to be the worst
stratum and I expect it to be visible in the intermediate work rather than silent. Grain-heavy and
halftone covers, where the peel removes the texture a viewer reads as the artwork's character. Covers
whose designer chose a text colour that is right in the artwork and wrong as a UI foreground —
faithfulness is the whole paradigm, so where faithfulness is wrong it is wrong loudly. And accents
differing from their field only in hue: the H↑ lane is the mitigation, it is also the lane most likely
to be noisy, and the contract's uncalibrated accent-function distance is a hard gate sitting there.

**Falsifier.** Run the candidate colour set — the full persistence-ranked pool, before role assignment
— against the endorsed evidence through the adjudication tool's reachability channel. If the endorsed
role colours are absent from that pool at a rate no better than a plain frequency-ranked colour set of
the same size achieves, then "persistence identifies belonging" is false and the paradigm is wrong
rather than under-tuned — because that claim *is* the paradigm, and reachability measures it directly
with no threshold, no role assignment and no tuning in between.

A cheaper second falsifier, for the robustness half: if the selected ground level and the published
role colours are not measurably more stable under the re-encode and dither arms than an
argmax-over-bins baseline on the same images, then the stability theorem does not transfer to this
data at this bit depth, and §1's structural argument is void.

## 8. Exposable intermediate work

Most of this paradigm's intermediates are **pictures**.

- **The ground image at the selected α**, and at every other plateau. A real image of real pixels,
  showable beside the artwork and gradeable by a human who knows nothing about palettes: *is this what
  is behind the stuff?* The review channel can ask that in a 4–10 item batch, and it grades the
  design's single biggest decision (§3.1) in isolation.
- **The figure layers as masks**, each labelled with its lane, so "which evidence lane found this
  colour" is inspectable per role. An accent found only in H↑ is exactly the fragile case the brief
  names, and this design flags it rather than thresholding on it.
- **The persistence diagram** — dynamics against area fraction, one point per node, each drawn in its
  own colour. One picture saying why every colour was or was not a candidate.
- **The log-α stability curve** with the chosen plateau marked. Overlay two renditions of one artwork
  and the informed-vs-chaotic distinction becomes visible instead of inferred.
- **The field's colour path in OKLab**, with the candidate ramp and the excursion profile along t —
  exactly the evidence a third or fourth stop is meant to be justified by.
- **The rejected candidates with their ranks**, so a reviewer's correction can be checked for
  reachability without re-running anything: either the corrected colour is in the pool at some rank
  (an assignment problem) or it is not (a paradigm problem).

## 9. What I asked for

**From `ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md` — the SAM mask artifact's schema and coverage.**
What a stored region record contains (mask encoding, area, bbox, concept, score), whether masks cover
the whole candidate set or a sample, and at what resolution they were computed. My design turns on
this because SAM's *dev-time* use is sanctioned and §2.3's ground/figure separation is exactly a
segmentation claim SAM's regions could validate corpus-wide, with no review round and without SAM ever
entering the runtime. If masks are at a normalised 640 px while my layers are native, the comparison
needs a stated correspondence rule; if coverage is partial, my validation plan for the riskiest
decision in the design changes shape. I asked for none of the oracle's *results* and do not want them.
**Assumption I proceeded under:** per-image region records exist over a substantial share of the
corpus, carrying at least a mask and an area, at a normalisation mappable back to native coordinates.
If that is wrong, P5 falls back entirely to the cross-rendition metric — weaker but sufficient — and
§6 gains about two days for a hand-built comparison set.

**From `ORACLE_QUESTION_SET.md` — the coverage of `ground_type`**: for how many artworks the label
exists, not how good it is. Whether it covers 137 artworks or 2,757 decides whether P4's census anchor
is an instrument or a pilot. **Assumption:** pilot-scale, so P4 is anchored primarily by the round.

Nothing from the two review-channel stubs; they told me not to spend a request there and they were
right.

## 10. Why this one

Five families considered, four rejected structurally rather than by taste. **Clustering and
quantisation** (k-means, median cut, octree, their gap-statistic relatives) place decision boundaries
throughout colour space and take an argmax across them — precisely the shape that lets a ±1-LSB dither
move a palette. No amount of care removes boundaries from a partition, so that family can have a
careful robustness story but never a structural one. **Runtime segmentation** is barred by cost
(~6.2 s cold, with a standing "very good reasons" debt) and by condition 4 — and this proposal is the
plain-code exhaustion that condition demands, so reaching for SAM first would have been out of order.
**Semantic parse-then-assign** needs a runtime model, banned outright. **Global optimisation over
candidate palettes** — an energy with terms for harmony, coverage, contrast, identity — is what I came
closest to taking, and I rejected it because its weights *are* its free parameters: goal 2 asks for an
order of magnitude fewer human decisions, and a weighted objective loses that fight by construction
however good its palettes are. **Pure pixels-first statistics** discards the spatial relation, and the
spatial relation is the entire content of "this is the text and that is the ground" — text is text
because of where it sits, not because of how many pixels it has. The layer stack is the one paradigm I
found where robustness is a theorem, exact-pixel output is an identity, the free parameters are choices
rather than numbers, and the intermediates are pictures a human can grade.

---

*Three things in the packet I could not reconcile.* **(a)** The foreground↔accent pair is governed by
two distances at once — invariant 3's same-colour bar and `FOREGROUND_ACCENT_SEPARATION_DISTANCE` at
0.07444 — and nothing says which an emitter must satisfy. **(b)** With the sanctioned collapse at
exact equality, that leaves a **dead band**: an accent may sit at distance 0 (collapsed) or above
0.07444 (separated), and everything between is unstated. My design lands there regularly and currently
resolves it by collapsing, which may be wrong. **(c)** `ACCENT_FUNCTIONAL_DISTANCE` is
`[UNCALIBRATED]`, has refused measurement twice, and is nonetheless enforced inside a hard gate —
while the brief says plainly that no number will tell you when a hue-only accent is fragile. I expect
to trip it on exactly the accents the H↑ lane exists to find, and intend to invoke the standing
demotion rule rather than tune around it.
