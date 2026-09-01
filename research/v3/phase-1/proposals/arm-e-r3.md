# Arm E — the palette as a recovered composition

## 1. The paradigm

**An album cover is a rendering of a small layered design, and the palette is the recovery of that
design's own colour decisions — not a summary of the image's colour statistics.** The algorithm fits,
cold and per file, the simplest *generative* model that explains the image: a **ground** (one flat
colour, two flat colours, or a smooth path through colour space), plus a handful of **ink layers**
over it, plus an **unexplained residue** it makes no claim about. The four roles and the gradient
boolean are then *read off the fitted model* rather than selected from a ranked list of colours.
Every decision is a **model-order comparison** — does this richer model buy more than one same-colour
bar of explanation? — never a threshold on a raw statistic and never an argmax over histogram bins.
The sentence to disagree with is the premise: most album covers are photographs rather than designs,
so a compositional model may be a bad prior for the corpus. §7 says what would settle that.

Two consequences are load-bearing. The gradient boolean stops being a detector with a threshold and
becomes **model selection** inside a single ladder — which is also where "two flat fields" and
"surface collapses" come from, so field structure and the gradient flag are one decision rather than
three. And robustness stops being a property to test for and becomes a property of the *kind* of
quantity compared: sums over millions of pixels, judged against a calibrated perceptual bar, with the
margin recorded.

---

## 2. Image to contract

### 2.0 Decode, refuse, and inventory

Decode at native resolution through the pinned decoder; dimensions come from the header. If any pixel
carries alpha < 255, refuse loudly (invariant 5). No resampling of the input, ever.

One pass over the pixels builds the **exact-triple inventory**: a map from the packed 24-bit RGB
value to its pixel count and its first and second spatial moments (Σx, Σy, Σx², Σxy, Σy²). This one
structure does four jobs. It is the only place exact 8-bit identity lives, so every published colour
is by construction an exact pixel. Its moments carry invariant 2's population floor and
spatial-spread test. It lets sRGB→OKLab be computed **once per distinct triple** rather than once per
pixel — 10⁵ distinct triples against 10⁶–10⁷ pixels, so the cube roots are paid an order of magnitude
less often. And it turns the image into a 32-bit index array that every later pass reads instead of
touching channels. (sRGB linearisation is a 256-entry exact lookup, since the channels are 8-bit.
Nothing else in the algorithm reads a table.)

### 2.1 The field-scale map — what is field, what is detail

Build an internal **box pyramid** whose level 0 is the native image and whose level *j* holds
2ʲ×2ʲ block means in OKLab. This is not a resampling of the input: every native pixel contributes to
every level, level 0 *is* the native image, and **no published colour is ever read from a pyramid
level** — published colours come only from the exact-triple inventory. The pyramid is an internal
analysis structure, and the resolution ladder is the test that says whether that distinction held.

At each level, for each cell, fit a **local affine model of OKLab against position** over a small
neighbourhood of cells and record the residual. Define a pixel's **field scale** σ(x, y) as the
coarsest level at which its block still agrees with that local affine model to within the
**contract's regional same-colour bar**. Expressed as a fraction of the short side, σ is
resolution-agnostic: the same structure has the same field scale in a 300 px and a 1400 px rendition.

Detrending, rather than measuring flatness, is what makes a gradient count as field: a smooth ramp is
locally affine at every scale, a texture is not, and a photograph's busy region is not. So σ
separates *designed field* from *depicted or textured content* with no texture model and no new
constant.

Each pixel then carries a natural weight: **the area of the largest locally-affine neighbourhood it
belongs to**, normalised by canvas area. That is a definition, not a knob — chosen precisely so that
no exponent or weighting function has to be picked, and the first of several places a constant could
have hidden and did not.

### 2.2 The ground ladder — field roles and the gradient boolean, in one decision

Fit a family of ground models to the field-scale-weighted pixels, in increasing order of complexity:

- **G₀ — one constant.** The weighted geometric median of OKLab over the whole canvas. Robust by
  construction to outliers and to a symmetric dither.
- **G₂ — two constants.** A split of the canvas into two field regions with one colour each, obtained
  by a weighted two-way partition of the colour cloud with spatial contiguity supplied by the
  pyramid.
- **G_ramp(k) — a path.** A scalar field t(x, y) — affine in position (linear), radial about the
  weighted centroid, or conic — and a piecewise-linear path γ: [0,1] → OKLab with k ∈ {2, 3, 4}
  knots, with I ≈ γ(t).

The ramp fits are **closed form, one pass each**. The best linear direction is the leading singular
vector of the 2×3 weighted covariance matrix between position and OKLab; radial and conic substitute
r = ‖p − p̄‖ and the polar angle for the position coordinate. No direction search, no iteration —
nothing for a seed or an ordering to perturb. Whichever parameterisation explains most is kept, ties
to linear; since the fit computed it anyway, the optional `geometry` field is populated, exactly as
the contract permits and never for its own sake.

**Selection runs entirely in bar units.** A richer model is adopted only when it reduces the
field-weighted RMS residual by more than the margin (§4, parameter 4) *expressed as multiples of the
regional same-colour bar for the colours involved*. Two further gates fall out of the contract rather
than being added: a ramp whose ends are the *same colour* by the contract's own rule is degenerate
and refused, and a G₂ whose two constants are within the bar is just G₀.

The ladder's outcome *is* the field half of the contract. G₀ publishes its constant as the
background, collapses the surface to exact equality with the flag set, and emits no gradient. G₂
publishes its two fields as background and surface with no gradient. G_ramp(k) publishes γ(0) as the
background, γ(1) as the surface, and the k knots as the stops.

The reviewer's endpoint ruling is satisfied **by construction, not by repair**: stops[0] and
stops[last] are not chosen independently and then checked, they are literally the same objects as
background and surface. And "a collapsed surface means no gradient" is not a rule the design has to
remember — G₀ has no second end to publish.

### 2.3 Stops beyond the second

A third knot is admitted on one ground only: **excursion reduction**. Sample the rendered OKLab
straight-line path densely; for each sample measure its distance to the nearest **populated** artwork
colour, using a coarse occupancy grid over OKLab built once from the inventory. If the worst
excursion exceeds the criterion, insert a knot at the worst position, snapped to the nearest
populated colour, and keep it only if (a) the worst excursion falls by more than a bar and (b) the
path is still monotone in t — the operational meaning of "meandering is forbidden". A path that
wanders to reduce an excursion it does not have is refused by (a); one that doubles back, by (b).

The same test is *evaluated* for a fourth knot but **the design declines to publish it by default**,
emitting the measured reduction instead: the reviewer made the fourth stop negotiable on proven
utility, and the honest form of that is to produce the evidence and not the stop. Colourspace
coverage and metric fitting never enter — no metric is being fitted, and the only quantity a knot can
improve is distance-to-artwork.

### 2.4 Ink recovery — the layers over the ground

Subtract the fitted ground: D(x, y) = I(x, y) − G(x, y). Pixels with ‖D‖ below the bar *are* ground.
The rest is marks plus residue.

Over the non-ground pixels, agglomerate exact triples into **bar-neighbourhoods**: process triples in
descending area order (ties broken by the packed 24-bit integer, so the order is total and canonical)
and merge each into an existing cluster if it lies within the regional bar of that cluster's current
centre, else open a new one. This is the contract's own ruler doing the clustering, so there is no
bin grid, no k, and no seed. It also has a property the design leans on hard: **a sub-bar perturbation
cannot change the partition**, because anything a dither splits apart is by definition closer than the
merge radius and gets re-merged.

Each cluster then carries, cheaply: **area fraction** and **spatial spread** from the inventory's
moments; **erosion mortality**, the fraction of its support that fails to survive a morphological
erosion at the ink scale (§4, parameter 3) — text and line art nearly vanish, a subject's body does
not, and this is a shape measurement rather than a semantic one; and **ground adjacency**, the
fraction of its boundary whose outward neighbour is ground, because an ink sits *on* the ground while
a depicted region abuts other depicted regions.

High mortality plus high ground adjacency identifies a recovered ink layer: the artwork's own text,
logo, sticker, rule or graphic mark. Everything else is residue, and the residue may be almost the
entire canvas — on a full-bleed photograph the model reports a smooth ground, no inks and a large
residue, which is a correct description of a photograph rather than a failure to describe it.

### 2.5 Role assignment — one pool, one ordering, no walls

The **candidate pool** is *every* bar-neighbourhood cluster in the image — ground, ink and residue
clusters alike, typically a few dozen to a few hundred. **Every candidate is eligible for every
role.** Nothing is ever filtered out; the ink/residue labels change *priorities*, never
*eligibility*. This is the structural answer to candidacy walls: the reachable set is the pool, the
pool is everything above the population floor, and a colour the reviewer would have chosen cannot be
structurally unpublishable.

Assignment is **lexicographic, not a weighted score.** A weighted score is a parameter farm; an
ordering is one decision, and a human can be shown two palettes differing by one adjacent swap. The
order:

1. **Contract feasibility** (hard) — distinctness above the bar, the contrast floors evaluated as
   minima over the *whole rendered ramp* in OKLab, source support.
2. **Field truth** — background and surface are the ground's own colours, per §2.2. Not negotiable:
   the ground is what the image's large areas *are*.
3. **Legibility** — foreground maximises the minimum raw APCA over the entire published ramp. Ties
   within the bar prefer a recovered ink layer, on the argument that the artwork's designer already
   solved legibility against this same ground.
4. **Identity** — accent maximises the artwork's *unrepresented* colour mass: the area-weighted mass
   of image colours whose nearest already-published colour lies beyond the bar. This turns the
   identity-coverage complaint into the accent's own objective instead of a census flag raised
   afterwards. Among candidates tied within the bar on that mass, **prefer the one whose separation
   from the field carries more lightness** — read as a direction, not a coefficient, exactly as the
   perception round's confounding requires.
5. **Coarseness** — remaining ties go to the larger area and the coarser field scale. This is the
   tie-break that buys stability: it always resolves toward the more massive, more persistent
   structure.

**Collapses fall out rather than being decided.** No admissible second field ⇒ surface collapses (G₀).
No candidate clears the accent's functional separation from the field ⇒ accent collapses to the
foreground, exactly, with the flag set. **The escape is the only place the design searches
exhaustively**, and deliberately: pure white or pure black is admitted only after enumerating every
pair in the pool and finding none that clears the contrast floor — so the contract's unquantifiable
"no other way" condition has, for this paradigm, an actually checkable shadow, and the escape is
refused outright if the literal occurs anywhere in the inventory.

### 2.6 Publishing an exact pixel

A chosen cluster publishes the exact triple maximising **bar-neighbourhood area mass** within it, not
the nearest triple to its centre. Naive nearest-pixel snapping is fragile exactly where this must not
be: a ±1 LSB dither splits a flat region's modal triple into two half-mass neighbours, so a
mode-of-exact-triples pick flips, while neighbourhood mass does not move because both halves sit
inside each other's neighbourhood. Ties resolve by distance to the cluster's weighted geometric
median, then by the packed integer.

The honest consequence: under dither the published triple may still move by one LSB — order 0.001 in
OKLab against a bar of 0.009–0.023, so it is *the same colour* under the contract's rule and under
the harness's comparison. **What must not move is which structure the palette describes**, and that
is decided one layer up, by aggregates a dither cannot shift.

If a chosen triple fails invariant 2's population floor or spread test, the next-best triple in the
same cluster is taken and the **entire palette is re-validated**, per the standing meta-rule.

### 2.7 Why this is robust, stated as four mechanisms

1. **Every structural decision is an aggregate against a calibrated bar.** A ±1 LSB dither perturbs
   each aggregate by O(1/255) in one channel, orders below the bar; a q92 re-encode perturbs more
   pixels but leaves million-pixel sums essentially fixed. Contrast an argmax over histogram bins,
   where a dither moves mass across a boundary and flips a winner.
2. **Bar-neighbourhood agglomeration is idempotent under sub-bar perturbation** — the merge radius
   exceeds any perturbation smaller than the bar. This is the direct structural answer to "a dither
   moved 114 of 114 palettes".
3. **Every tie-break is a canonical total order ending in the packed 24-bit integer.** No hash-map
   iteration, filename, id or label is read anywhere; relabel invariance is not tested for, it is
   unreachable.
4. **Every content statistic is an area fraction or a normalised scale.** A structure that genuinely
   disappears at a small rendition falls below the population floor and stops being a candidate —
   which the cross-rendition metric classes as *informed* loss, the target behaviour.

### 2.8 Two questions the brief declared algorithm material

**Transparency.** The contract refuses transparent input loudly and I keep that. But if the policy
ever changes, this paradigm has a specific answer and it is neither white nor black: matte the alpha
region with **the fitted ground extended underneath it**, because the ground is exactly what the
model already estimates and a designer's cutout was cut *out of* something. White or black invents a
field the artwork never had and then publishes it as a role.

**Colour-blind legibility.** Not a gate and not a scoring axis, but free here: the accent's separation
from the field is already held as a decomposition (ΔL, ΔC, ΔH), so the CVD question is exactly *what
fraction of the separation ΔL carries*. Report the fraction; do not enforce it. It points the same
way as the perception round's functional finding — an accent that moves in lightness is both more
findable and more CVD-robust — so the diagnostic costs nothing and contradicts nothing.

---

## 3. Where the decisions live

Field-versus-detail (§2.1) is a *measurement* against an inherited bar. Flat / two-field / ramp and
the stop count (§2.2–2.3) is **model selection** under one margin. Ramp geometry is the best-fitting
of three closed forms, ties to linear. Ink-versus-depicted (§2.4) is two shape statistics at one
anchored scale. Which colour gets which role (§2.5) is **a lexicographic ordering** — the design's
central judgment. Collapse and escape are consequences of infeasibility plus one exhaustive search.
The published 8-bit triple (§2.6) is a robust argmax with a canonical tie-break.

The concentration is deliberate: almost all judgment lives in **one ordering** and **one margin**.
Everything else is either inherited from the contract or definitional. The two places judgment could
have leaked and was closed off by definition rather than by a constant are the field-scale weighting
(defined as the affine neighbourhood's area) and the agglomeration order (defined as descending area
with an integer tie-break).

---

## 4. Free parameters

Five independent decisions a human must make. Not five literals — five *choices no measurement in the
packet settles for me*.

1. **The lexicographic priority order** over {feasibility, field truth, legibility, identity,
   coarseness}. *Anchor:* forced-choice review rounds on palette pairs that differ only by one
   adjacent swap of priorities. Three swaps carry essentially all the disagreement, so three 6–8 item
   rounds anchor it.
2. **The field-role orientation convention** — which end of the ground becomes `background` and which
   `surface`. The reviewer ruled the *stop order*; nothing rules which physical end of the artwork's
   ramp is stop 0. My provisional convention is that the darker end is background. *Anchor:* one
   round showing role-swapped palettes on two-field and ramped covers. This is worth naming loudly
   because role permutation was a real correction class.
3. **The ink scale** — the erosion radius, as a fraction of the short side, at which cluster mortality
   is measured. *Anchor:* the measured stroke-width distribution of designed marks over the corpus at
   development time. This is a measurable property of the corpus, not a taste.
4. **The model-selection margin** — how many same-colour bars a richer ground model must beat the
   simpler one by. *Anchor:* a borderline flat-versus-ramp review round; this is precisely the
   gradient-neutrality question, and the distribution-level gradient-rate census reads it directly.
5. **The accent's functional separation floor.** Inherited as `ACCENT_FUNCTIONAL_DISTANCE`,
   `[UNCALIBRATED]`, refused twice. *Anchor: none exists.* I use it only as a feasibility gate and
   expose the margin, and I expect the stratum-dependence to show up in my output as an accent-collapse
   rate that varies by hue — which is at least a shape a future round could be built on.

**Explicitly not mine, and not counted:** the same-colour bar and its regional partition; the raw
APCA ε floors; invariant 2's population floor and spread test; `MAX_GRADIENT_STOPS`; the OKLab ramp
interpolation space. Each is contract-owned and already carries provenance.

**Places a constant could have hidden and did not:** the number of pyramid levels (determined by
image size), the ramp direction search (closed form, no grid), the cluster count (determined by the
bar), the weighting exponent (definitional), the tie-break (a total order), and the excursion sample
count (any dense sampling gives the same extremum to within the bar).

---

## 5. Cost

**Priced at 1400×1400 = 1.96 Mpx**, single-threaded, ordinary typed-array code, cold, no cache, no
precomputed artifact of any kind. Decode 15–30 ms; the inventory pass plus per-distinct-triple OKLab
20–40 ms; the pyramid and local affine residual over ~8 levels (≈ 4/3 × N cell-updates) 60–150 ms;
the ground ladder's three closed-form fits and knot insertion 30–60 ms; the occupancy grid and
excursion profile ~10 ms; the deviation map, agglomeration, erosion and adjacency passes 80–180 ms;
role assignment over a few hundred candidates under 10 ms.

**Total ≈ 0.25–0.5 s.** Everything is linear in pixel count with a small constant and nothing is
superlinear, so a 640×640 cover (0.41 Mpx) lands near 80–150 ms and a 3000×3000 cover (9 Mpx) near
1.2–2.5 s. Peak memory at 1.96 Mpx is roughly 40 MB: a 32-bit index array plus a float32 pyramid.

**Where that sits in the bracket.** At corpus-typical sizes this is ordinary per-file image code and
needs no defence; it invokes no model, so none of the four SAM conditions is engaged. The one place I
owe an argument is the large-rendition tail: at 9 Mpx the multiscale pass dominates and the total
enters seconds. The lever, if one is needed, is to compute the field-scale statistic from pyramid
level 1 upward while the inventory still reads every native pixel — halving the dominant term and
touching no published colour. That is a performance change with a measurable palette-equivalence
claim attached, which is the only form the input policy admits.

No stage of this design has ever seen the corpus. Everything above is computed from one file.

---

## 6. Build cost

**Four to six focused weeks to emit contract-valid palettes over the coverage set**, with a readable
trajectory earlier than that. Week 1: decode, inventory, OKLab-per-triple, the pyramid and the
field-scale map, with the map shipped as an image in the dev-loop viewer. Week 2: the ground ladder
and the exact-pixel realisation — at which point the candidate emits a *legal but degenerate* palette
on every cover (background from the ground, everything collapsed, no gradient). That is a real
milestone, because it is contract-complete, it runs through adjudication and the robustness harness,
and mechanisms (1)–(4) of §2.7 can be **measured before any of the interesting parts exist**.
Weeks 3–4: stops and excursion, then ink recovery and its two shape statistics — the vaguest part of
the design and the likeliest to need a second attempt. Weeks 5–6: the candidate pool, the
lexicographic assignment, collapse and escape, the intermediate-work exports, and the first review
rounds against parameters 1, 2 and 4.

One supporting artifact worth building on day two and cheap: a **synthetic corpus** of rendered
grounds (flat, two-field, linear/radial/conic ramps with known knots) with known text laid over them.
It gives exact ground truth for the ladder and the ink recovery, which nothing in the corpus can, and
it is the instrument the §7 falsifier's second half runs on.

---

## 7. Expected failures and falsifier

**Expected failures.** Full-bleed photographs and depicted scenes, where the ink lane returns nothing
and the ground fit returns a smooth trend that may be a poor field. Collage and pattern covers, where
there is no ground and the ladder picks whichever model is least wrong. Covers with a hard horizon,
where I expect G₂ to be *over*-selected and a two-field palette published where the reviewer wanted a
gradient or a flat. Monochrome covers, where the identity criterion has nothing to offer the accent
and collapse will fire more often than the reviewer wants. And covers whose designed text is a poor
UI foreground — a thin script in a low-contrast tint — where priority 3's ink tie-break picks a colour
a designer used at 4 pt and a player will use at 14 pt.

**Falsifier for the paradigm.** Pre-registerable, on ≥ 40 covers where the ground ladder selects its
model with a margin of at least 3 bars — i.e. where the fit is unambiguous and tuning is not the
question: **if fewer than half of the reviewer-endorsed backgrounds on those covers lie within the
same-colour bar of the fitted ground's colour, the premise is false.** The claim of this paradigm is
that the palette's field roles *are* the artwork's own ground; if the reviewer's fields are routinely
somewhere the ground fit is not, then the palette is not a recovery of the composition and no
parameter fixes that.

**Falsifier for the robustness mechanism**, separately, because it is a different claim and cheaper to
run: mechanisms (1) and (2) predict near-total stability *unconditionally*, not on average.
**jpeg-q92 agreement ≥ 90% and dither agreement ≥ 98%.** Below either, the "aggregates against a
calibrated bar" story is wrong somewhere and I would want to know which stage leaks before defending
anything else.

---

## 8. Exposable intermediate work

This paradigm is unusually rich here, because every stage produces either an image or a small table:

- **The field-scale map**, as a greyscale image beside the artwork — a literal picture of what the
  algorithm thinks is field and what is detail, judgeable in two seconds with no vocabulary.
- **The fitted ground rendered as an image, and the residual I − G beside it.** If the ground is
  wrong, this shows it without reference to any palette.
- **The ground ladder's table**: each model, its residual, and its margin over the next simpler model
  **in bar units** — not only what was decided but how close it was, which is what predicts
  instability.
- **The recovered ink layers as masks**, each with its colour, mortality and ground adjacency.
- **The candidate pool with its per-candidate statistics, and the lexicographic trace** — which
  criterion eliminated which candidate at which step, so every assignment is explainable in one line.
  This also answers adjudication's reachability question for free: **the pool is the reachable set**,
  so "could this paradigm have produced the endorsed palette at all" is a membership check.
- **The excursion profile** of the published ramp against artwork occupancy — the direct evidence for
  or against every knot, including the fourth one I decline to publish.
- **The accent's separation decomposed into (ΔL, ΔC, ΔH)**, which doubles as the CVD diagnostic.

---

## 9. What I asked for

Two things, both named because my design turns on them, with the assumption I proceeded under.

**(a) The measured resolution floors.** `PHASE_0_DECISIONS.md`'s own scope line lists "measured
resolution floors" among its contents, and the section carrying them is withheld. My design needs
them in a specific place: §2.6's population floor and §2.4's ink recovery both need to know at what
support size a structure stops being resolvable, and that number is exactly what separates *informed*
from *chaotic* cross-rendition disagreement. **Assumption I proceeded under:** a structure is
resolvable when its support exceeds a few hundred pixels *and* its field scale spans at least two
pyramid levels; both are expressed as fractions and both are checkable against the resolution ladder,
so if the real floor differs the correction is a re-anchoring rather than a redesign.

**(b) `ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md`, on SAM's concept set and what it reliably masks
for text.** Free parameter 3 — the ink scale — is anchored on the measured stroke-width distribution
of designed marks, and the cleanest dev-time route to that measurement is SAM's text concepts
(`words`, `letter`, `lettering`, `display-text`). I know from the inventory that those concepts exist;
I do not know whether their masks are tight enough at the boundary to read stroke widths off.
**Assumption I proceeded under:** if they are not, the ink scale is anchored instead on the artwork's
own inventory — the modal thickness of high-contrast thin structures over the corpus, measured with
the same erosion at a sweep of radii. That is a weaker anchor because it is partly circular, and I
would rather have the first.

I did **not** need the review-server or `REVIEW_UI.md` documents: the catalog row is enough, and the
stub is right that they describe how I am judged rather than what I must design against.

**Two things in the packet I could not fully reconcile.** First, the brief's §3.1 quotes SAM at
"roughly 2.7–4.3 s per image" in the cost-bracket bullet while quoting "~6.2 s per cold call" three
paragraphs earlier, and `PHASE_0_DECISIONS.md` §6.1 is explicit that the cold figure is the one to
quote — so the bracket's exceptional end is stated with the warm number. It does not affect my design
(I invoke no model) but it would affect anyone pricing against that end. Second, the 2026-08-04
metric ruling says colour distance is used "between background and surface, or between foreground and
accent", and a named constant exists for the second pair but not the first; I proceeded on the
assumption that background↔surface uses the same-colour bar itself, which is also what invariant 3
already requires of every published pair.

---

## 10. Why this one

I considered four alternatives and rejected each for a stateable reason. **Clustering or quantisation
first** — median-cut, k-means, histogram peaks, then role assignment — makes the palette a function
of an unstable partition of a continuous distribution and has no account of *why* a colour is a field
rather than a mark; it is the family whose knife-edges are the natural explanation for a dither
moving every palette. **Segmentation first**, with SAM or with classical superpixels, is refused on
cost (6.2 s cold, against a bar of "very good reasons") and, more importantly, gives regions without
the *compositional relation* between them — but background, surface and accent are relations, not
regions. **Global optimisation over a scored objective** was the easiest thing to write and is
exactly the shape that produces hundreds of tunable sites against a handful of anchors; a weight
vector is how you fail the parameter-honesty criterion. **Pixels-first statistics with no
intermediate model** is legitimate and someone should write it, but the gradient boolean and the
guide-stop rule are inherently model-selection questions, and a paradigm with no model has to answer
them with thresholds it then defends one at a time.

The layered-composition view is the only one of the five where the contract's own oddities stop being
constraints to satisfy and become *consequences*: the ramp's ends are the field roles because the
ground has two ends; the surface collapses because a one-constant ground has one; a guide stop is
admitted only for excursion because excursion is the only thing a knot can improve. When a design
makes the specification's peculiarities fall out rather than fit in, that is usually a sign the
specification and the design are describing the same object.
