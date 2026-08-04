# Arm F′ — the palette is a choice of four regions, not a choice of four colours

## 1. The paradigm

**An album cover is not a bag of pixels with a colour distribution; it is a set of nested shapes, and
a palette is a selection of four of those shapes.** I propose building, from the single cold file, the
complete *inclusion tree of level-set components* — the tree of shapes — of the image, pruning it by
one area threshold, and then choosing four nodes from that tree to be background, surface, foreground
and accent. Colour never drives the search. Colour is read *off* the chosen regions at the very end,
as an exact pixel of the artwork. The claim someone can disagree with is this: **every colour a
reviewer would endorse is the colour of a spatially coherent, nested region of the artwork, and the
palette problem is therefore a region-selection problem wearing a colour-selection costume.** If that
is false — if endorsed accents routinely correspond to no coherent region at any scale — this
paradigm is not under-tuned, it is wrong, and §7 says how to find out in three days.

The reason to bet on this is the robustness goal. The incumbent's three failures (re-encode, ±1-LSB
dither, id relabeling) are all failures of *point estimates in colour space*: a centroid, a bin
boundary, a rarity cutoff, a seeded tie-break. Region topology has none of those. A ±1-LSB dither
perturbs shape *levels* by one and creates a haze of single-pixel shapes; it does not change which
regions of a cover are large, nested, glyph-shaped or chromatic. One area filter removes the haze in
a single operation whose effect is monotone in the noise amplitude. That is a *structural* answer,
which is what goal 1 asks for.

## 2. Image to contract

### 2.1 The representation

Decode to 8-bit sRGB at full resolution. Convert to OKLab. Box-downsample (area-average, exact
integer accumulation) to a working grid whose cell count is fixed by the single scale parameter *A*
(§5): the target is that a feature of area *A* in the original occupies on the order of a dozen cells
at working resolution. For a 1000×1000 cover with *A* set near the smallest legible text stroke, this
lands around 512×512. Area-averaging is itself the first dither killer: ±1-LSB noise averages out
over a box, exactly, before any decision is made.

On this grid, build the **multivariate tree of shapes**: marginal trees of shapes on L, a, b, merged
through a shape-inclusion graph into a single self-dual inclusion tree, in the manner of Carlinet and
Géraud. Properties that matter here and that I am relying on rather than inventing: the tree is
*complete* (no image information is discarded — the image is exactly reconstructible from it), it is
*self-dual* (it does not privilege bright-on-dark over dark-on-bright, which matters because album
covers come both ways in equal measure), and its structure is *invariant to monotone contrast change*
— which is most of what a re-encode does to a flat field.

Then apply the **grain filter**: delete every node whose area is below *A*. This is a filter on the
tree, not on the image, and it is the only noise-handling step in the whole design. Everything
downstream sees a tree of typically 10²–10³ surviving nodes. Each surviving node carries, accumulated
in one bottom-up pass: area; boundary length; bounding box and centroid; depth and parent; the mean
and covariance of its OKLab values over the pixels that belong to it and to no surviving descendant
(its *own* pixels, not its subtree's); and the count of surviving children.

Everything that follows is a decision over this node set. **Every node is eligible for every role.**
There is no candidacy filter, no lane, no wall — which is the direct structural answer to goal 3.
Roles are assigned as one joint choice over four nodes, not as a cascade in which an early rejection
makes a colour unreachable.

### 2.2 Fields: background, surface, and the gradient boolean

Call a node a **field candidate** if its own-pixel area exceeds fraction *F* of the image. Typically a
handful survive; for a busy photographic cover, possibly only the root.

The gradient boolean is decided by *topology first*, and this is where the paradigm earns its keep.
A smooth ramp across a cover produces a **monotone chain**: a path of nested field candidates, each
slightly smaller than its parent, with level advancing steadily and no dominant area drop between
consecutive members. A hard two-colour split produces **siblings**: two large nodes under a common
parent, with a large level gap. A flat field carrying an object produces a huge node followed by a
sharp area cliff. These are three different tree shapes, not three settings of one threshold.

So: find the longest chain of nested field candidates. Its outermost member is the **background**
candidate and its innermost the **surface** candidate. The contract makes this obligatory rather than
convenient — the first stop *is* background and the last stop *is* surface — and here the two ends of
the ramp and the two field roles are the *same objects*, so the invariants `I1.first-stop-not-background`
and `I1.last-stop-not-surface` are satisfied by construction and never by a repair pass. If the
longest chain has length one, there is no ramp; the second field, if any, is the largest sibling.

Now verify the ramp rather than assume it. Take the chain's per-node canonical colours in OKLab as a
polyline in the order of nesting. Simplify it by Ramer–Douglas–Peucker with tolerance equal to the
contract's same-colour bar. Then test the claim: sample the field's pixels, project each onto the
simplified polyline, and require the residual at quantile *Q* to fall under the bar. If it does,
`gradient = true` and the polyline's vertices are the stops. If it does not, the field is not a ramp
and `gradient = false`.

RDP with a fixed tolerance is, I think, an unusually exact match to the reviewer's guide-stop
semantics. It *only* inserts a vertex at the point of maximum deviation from the current straight
segment — which is literally excursion reduction, the one admissible reason. It cannot meander,
because it never invents a point off the measured chain and never adds a vertex whose removal would
leave the fit within tolerance. It cannot expand colourspace coverage or fit a metric, because its
objective is deviation from a straight line and nothing else. It naturally produces two stops for a
straight ramp, three for a ramp with one genuine knee — the "genuine 3-color linear gradient" — and
it reaches four only when a chain has two knees, at which point the proposal owes the reviewer the
residual figures for the 2-, 3- and 4-stop fits, which is exactly the "proven utility" evidence the
fourth stop is negotiable on. Interior vertices are then snapped to the nearest exact artwork pixel
*within the chain node they came from*; if that snap moves the vertex further than the bar, the vertex
is dropped rather than published, because a stop that cannot be realised on-artwork has no standing.

Surface collapses to background — exact hex equality, `collapse.surfaceCollapsed` declared — when the
chain is a single node, or when the two ends fall inside the same-colour bar. The contract's
consequence follows automatically: **a collapsed surface forces `gradient = false`**, because the two
ends of the ramp would be one colour, and my chain has already told me they are.

### 2.3 Foreground: read the typography, do not optimise legibility

Foreground is text. In the tree of shapes, text has a signature that is *scale-invariant*, and this is
the structural handling of "giant text" the goals ask for: the same test finds 8pt credits and a
glyph spanning the whole cover, because none of its terms mention size.

The signature has three parts. First, a high isoperimetric ratio — boundary length squared over area,
normalised — because glyphs are strokes, not blobs. Second, **counters**: in a saturated inclusion
tree, the hole in an "o" or "a" is not absent, it is a nested child shape whose level sits on the far
side of the parent's from the grandparent's. A node with such children is almost certainly a glyph or
a ring. Third, **line structure**: several sibling nodes at near-equal level with near-equal heights
and near-collinear centroids. Any two of the three is a strong glyph verdict; the threshold *T* sits
on a single composite of the first two, with line structure as a corroborator rather than a
requirement, so that a solitary giant glyph is not disqualified for having no line to sit in.

The foreground is the canonical colour of the glyph-shaped node set with the largest total area —
that is, the artwork's dominant lettering. Note what this does *not* do: it does not search for the
most legible colour. The contract says contrast is deliberately low with a user-set minimum defaulting
near zero, and a region-first paradigm can honour that literally, because it returns the colour the
designer actually set type in, whatever its contrast. The user's minimum acts only as a filter: if the
chosen foreground fails it, fall back through the glyph set, then to the ranking below.

When a cover has no text at all — common — foreground falls back to the non-field node, or field-chain
extremum, most distinct from the background under the same-colour bar's metric. When *nothing* is
distinct from the background (a genuinely monochrome image), we are in escape territory (§2.5).

Two structural benefits fall out here for free. **Overlays**: when type sits on a translucent scrim
over busy art, the scrim is the glyph nodes' *parent*, so the field a text node is evaluated against
is its parent node — always, with no special case, no scrim detector, and no patch. **Frames**: a
border is a field candidate most of whose area is accounted for by a single child; the child is the
true field and the border is a legitimate surface candidate, which is the right answer and again not
a patch.

### 2.4 Accent

The accent is a small, chromatically distinct, *non*-glyph node — a logo mark, a colour block, a
saturated object. Candidates are nodes below the field floor that fail the glyph test. They are ranked
by a salience that combines chroma relative to the parent field with area, and — this is the one place
open question 1 touches the design — the ranking is **lexicographic, not weighted**: among candidates
that clear the same-colour bar against both the foreground and their own parent field, those that
differ from their field *in lightness as well as chroma* are preferred over those that differ only in
hue and chroma. The brief says the lightness effect is a direction, confounded with stratum, and
explicitly not a coefficient. A lexicographic preference consumes a direction and refuses to invent
the coefficient. I introduce no accent-distance constant at all; `ACCENT_FUNCTIONAL_DISTANCE` has no
successor here, and the only bar in play is the contract's inherited same-colour bar.

The accent collapses to exactly the foreground colour, declared, when no candidate clears that bar.

### 2.5 Realisation, and the escape

Only now does the algorithm return to full resolution. Each of the four chosen nodes has a mask;
upsample it by nearest-neighbour to the original grid, and in **one** pass over the original pixels
accumulate, per role, the multiplicity of each exact 8-bit triple inside that role's mask, restricted
to pixels within the same-colour bar of the node's own-pixel mean. The published colour is the
highest-multiplicity triple in that set, with ties broken lexicographically on (R,G,B) — an intrinsic
rule, never on scan position, never on a seed, never on anything derived from the filename. That is
the whole answer to the id-relabeling failure: **no quantity anywhere in this design is a function of
anything but the pixel array.** Choosing by multiplicity rather than by proximity to a centroid also
sidesteps open question 2: the algorithm never has to decide whether a colour "belongs" to the
artwork, because it only ever publishes the *most common* value inside a region it already decided
matters spatially. Rarity is never consulted, so there is no rarity rule to be wrong.

The escape is reached only in the degenerate case: a single flat field, no glyph nodes, no accent
candidates — the image is effectively one colour. Then background is that colour, surface is collapsed
to it, foreground is `#ffffff` or `#000000` (whichever is further from the background and verifiably
absent from the artwork — the presence check is a single scan, already available from the realisation
pass), accent is collapsed to foreground, `palette.escape` is declared, and gradient is false. I read
the contract as requiring *all* of this together: "only when there is genuinely no other way to produce
a 2-colour palette" means both collapses, not one. I also read "exactly one colour not present in the
artwork" as one *value*, which may legitimately occupy two role slots when foreground carries the
escape and accent collapses onto it. Both readings are stated here because they are readings, and if
either is wrong the escape branch changes and nothing else does.

## 3. Where the decisions live

Four places, and they are deliberately unequal in weight.

**The grain filter** decides what is noise. This is the most consequential judgment in the design and
it is a single number applied uniformly, which is the point: one place to be wrong, one place to
audit.

**The field floor** decides what "large area" means, i.e. what can be a field at all.

**The glyph test** decides what is type. This is the design's one genuinely semantic classifier and
the one most likely to be the source of a bad palette.

**The gradient verification** decides whether a ramp claim survives contact with the field's actual
pixels. Note this is a *verification*, not a detector — the topology proposes and the residual test
disposes, so a false chain costs a false gradient only if the pixels also agree.

Everything else — which node is background, which colour is published, when things collapse — is
mechanical given those four, or is inherited from the contract. In particular, the same-colour bar is
consumed in four different roles (collapse test, RDP tolerance, gradient residual bar, accent
admissibility) and is not mine to set. I have deliberately reused it rather than introducing siblings
of it, which is a parameter-economy choice with a real risk attached: the brief warns the bar is
conservative in chroma and permissive in lightness, so every one of those four uses inherits that
anisotropy. I accept that as preferable to four new uncalibrated constants, and note that the brief's
own warning — never share one ruler between "same colour?" and "works as an accent?" — is respected,
because the accent's *ranking* is lexicographic and only its *admissibility* uses the bar.

## 4. Free parameters

Five independent human decisions.

1. **A, the grain area** (fraction of image area below which a shape is noise). Two independent
   anchors: run the ±1-LSB dither corpus and find the smallest *A* at which the surviving tree is
   unchanged; independently, compute the area of the thinnest legible text stroke at the render size
   album art is actually displayed at. If the two anchors disagree by much, that disagreement is
   itself a finding. *A* also fixes the working resolution, so it is one decision, not two.
2. **F, the field area floor** (what "large area" means for a field role). Anchored on reviewer
   verdicts for covers where the field is ambiguous — a wide border, a half-and-half split — by
   sweeping *F* and finding the interval that reproduces the verdicts.
3. **T, the glyph/blob boundary** — one threshold on one composite of isoperimetric ratio and counter
   presence. Anchored by a dev-time measurement: render a corpus of typefaces, logotypes and
   non-glyph shapes, measure the composite's distribution on each, and place *T* at the separating
   point. This is a measurement of geometry, not of taste, which is the strongest provenance available
   to any of the five.
4. **Q, the gradient residual quantile** (what fraction of a field's pixels must lie on the stop
   polyline for the gradient claim to stand). Anchored on reviewer gradient/not-gradient verdicts.
   This is the weakest-anchored of the five and I would expect it to be the first thing challenged.
5. **The accent preference ordering** — that a lightness-moving accent outranks a purely chromatic one.
   Not a number; a direction, anchored on `perception-4`'s 0.750 against 0.361, deliberately encoded
   as an ordering so that the confounded effect size never becomes a coefficient.

Inherited and *not* counted, because they are the contract's: the same-colour bar, the user's contrast
minimum, the 2–4 stop limits, the collapse and escape conditions.

## 5. Cost

**Pricing 1,000,000 pixels — a 1000×1000 cover — cold, in TypeScript with typed arrays, single
threaded.**

| stage | cost |
|---|---|
| decode to RGB | 20–60 ms |
| box downsample to ~512×512, OKLab conversion | 15–30 ms |
| multivariate tree of shapes on the working grid | 250–400 ms |
| bottom-up attribute accumulation | 30–60 ms |
| grain filter, chain search, role assignment, RDP | 10–25 ms |
| full-resolution masked realisation pass | 20–40 ms |
| **total** | **≈ 350–620 ms** |

The tree build dominates and is where the estimate could be wrong; it is three marginal trees on
immersed grids of roughly one million cells each, plus a merge, all quasi-linear with hierarchical
queues and union-find. If the merge proves more expensive than I have allowed, the honest number is
nearer 800 ms.

The argument that this is reasonable: it sits an order of magnitude below the seconds-scale end the
reviewer called slow, it is a single family of linear-time morphological passes with no model, no
table, no network and no prior pass, and its constant buys something specific — *all* nested regions
of the image at *all* levels, computed once, after which every subsequent decision is a lookup on a
few hundred nodes. The alternative shape, running many independent heuristics over the pixels, pays a
similar total in several passes and gets no shared structure for it. The cost is also *tunable along a
known curve* rather than by guesswork: cost scales linearly in working-grid cells, and the working
grid is derived from *A*, so a 2× speed demand is a stated 2× coarsening of the smallest feature the
system can see, which is a decision someone can make with their eyes open. I would not claim this
needs no defence; I claim the defence is short.

## 6. Build cost

**Days 1–3: the falsifier, before anything else.** A scalar tree of shapes on lightness alone is a
fraction of the full implementation, and it is enough to run §7's representation-recall test. If the
recall is low, the paradigm dies for three days of work rather than five weeks.

After that gate: the multivariate tree of shapes in TypeScript is the real expense — the immersion,
the hierarchical queue, canonicalisation and the marginal merge are fiddly and easy to get subtly
wrong; budget 2–3 weeks including a reconstruction test (rebuild the image from the tree, require
exact equality) which is the only honest way to know it is correct. Attributes and the grain filter,
3 days. Role assignment, chain search, RDP fitting and gradient verification, 1 week. Realisation,
contract emission and invariant wiring, 3 days. Parameter anchoring runs alongside — the glyph corpus
for *T* and the dither sweep for *A* are independent of the rest and can be done by someone else in
parallel.

**Total to real palettes: 4–6 weeks, with a kill gate at day 3.**

## 7. Expected failures, and the falsifier

**The falsifier.** Take every reviewer-endorsed palette. For each endorsed colour, ask whether *any*
node of the tree of shapes, at *any* grain size in a sweep, has a canonical colour within the
same-colour bar of it. This tests the representation and nothing else — it is entirely independent of
my field floor, glyph test, ranking and gradient logic, all of which could be replaced without
touching it. If endorsed colours are recoverable for the large majority of covers, the paradigm is
sound and everything above is tuning. If they are recoverable for well under half, then the right
answers are not in the representation, no policy built on it can emit them, and this is exactly the
"structurally unpublishable" failure that goal 3 exists to prevent — repeated, by me. That is the
result that would tell me the paradigm is wrong rather than under-tuned. It is cheap, it is
pre-registerable, and it should be run first.

**Expected weaknesses.** *Continuous-tone photography with no flat regions* is the worst case: a
portrait or a film still has few large coherent nodes, the grain filter has to be aggressive, and the
fields degrade toward whatever survives. *Halftone, film grain and heavy texture* fragment the tree in
the same way. *Two-axis gradients and vignetting* break the monotone-chain assumption — the chain
branches, and the two field ends become genuinely ambiguous; I expect false negatives on the gradient
boolean here rather than false positives, which is the safer direction. *Equal-lightness chromatic
accents* — the fragile case the brief names — will be found as nodes but demoted by my lexicographic
preference, so I predict under-emission precisely on the class the reviewer cares about; that is a
named, checkable prediction and the first thing I would measure after the falsifier. *A solitary giant
glyph with no counter* (a bare "X", a wordmark set in a geometric sans with no closed forms) is the
glyph test's blind spot. And on the dither test specifically, note what I am *not* promising in §8.

## 8. Exposable intermediate work

This paradigm is unusually rich here, because its intermediate object is an image, not a number.

- **The seen-image**: every surviving node painted with its canonical colour. This is literally what
  the algorithm sees, side by side with the artwork, and most bad palettes will be diagnosable from
  this one picture alone.
- **The candidate table**: every surviving node with area, level, depth, parent, shape statistics,
  canonical exact colour, and its score for *each of the four roles*. Because every node is eligible
  for every role, a reviewer pointing at a row and saying "that should have been the accent" produces
  a directly actionable number — the score gap — rather than an architectural excuse.
- **The field chain and its fit**: the chain's OKLab trajectory plotted against the fitted polyline,
  with the residual profile and the excursion each inserted stop removed. This makes the gradient
  boolean and every stop beyond the second individually auditable against the reviewer's own stated
  justification.
- **Provenance pixels**: for every published colour, the coordinates of a pixel carrying it and its
  multiplicity in the full-resolution image. This verifies the exact-pixel invariant mechanically and
  reports how present each colour is *without* reintroducing a rarity rule.
- **The grain sweep**: the same palette recomputed at several grain sizes. The tree is built once, so
  this costs only repeated pruning — a few milliseconds. It yields a **per-file self-reported
  robustness readout**: which roles are stable across scales and which flip. I think this is the most
  valuable artifact on the list, because it turns robustness from a corpus-level statistic into a
  per-image warning the system can emit about its own answer.
- **The glyph mask and each text node's parent field**, which exposes the overlay/scrim reasoning
  directly.

## 9. What was missing

Four things, all outside the packet by design, and I proceeded as follows.

**`PHASE_0_DECISIONS.md` §§1–5** — the normative contract, input policy, metrics, invariants and
corpus policy. §3.1 is described as a design-sufficient summary and I took it at its word. What I
would most have wanted from §2 is the exact serialisation shape (are stops role colours plus interior
vertices, or a full list including the ends?) and from §4 the full pathology census, because a census
is a list of things that have already gone wrong and would have sharpened §7's expected-failure list
considerably. I assumed stops are a list whose first and last elements *are* the background and
surface colours, since that is what the ruling's wording most directly supports. Nothing in my design
turns on it beyond emission format.

**`src/contract/PERCEPTION_VERDICT.md`** — cited as canonical for open question 3. §3.1 gave me the
numbers and the warnings, which is all I consumed. I did not need it and I am not requesting it.

**`V3_PLAN.md` §§1–2** — quoted sufficiently.

**The one that mattered.** §3.1 states the same-colour bar is a scalar today (`sameColorBar()`), with
the ellipsoidal form running report-only as a challenger. My design consumes the bar in four places
and would behave differently under the scalar and the ellipsoid — most visibly in the collapse test,
where the scalar's permissiveness in lightness means near-identical fields will collapse when the
ellipsoid would keep them apart, which changes the gradient boolean. I assumed the frozen scalar, and
built so that swapping in the ellipsoid is a substitution at one call site with no other change. I
flag it as the single place where a contract change would move my outputs.

**One thing I could not fully resolve.** Exact-pixel publication and ±1-LSB dither invariance are in
tension *in principle*: if a dither perturbs the pixels, the set of exact triples present in the image
changes, and a system obliged to publish an exact pixel cannot in general publish the identical triple.
I therefore do not claim bit-identical stability and I do not think any conforming system can. What I
claim, and what I would ask the robustness harness to measure, is stability of the *decisions* — role
identity (which region became which role), the gradient boolean, the stop count, and the collapse and
escape flags — with published colours required to move less than the same-colour bar. If the harness
currently scores dither robustness as hex equality, that metric is unsatisfiable under the exact-pixel
rule and, by the standing rule that an instrument which blocks good work is the thing that gives way,
I would argue the metric rather than the paradigm.

## 10. Why this one

I considered three alternatives seriously. **Clustering in a perceptual space** (k-means, mean-shift,
or a Gaussian mixture on OKLab with spatial priors) is the obvious route and is what I believe the
incumbent's failure modes are diagnostic *of*: cluster counts, initialisations and bin boundaries are
exactly the point estimates that a one-LSB dither walks across, and no amount of care makes a centroid
a stable object. **Saliency-and-segmentation** — superpixels, graph cuts, or SAM under its conditional
exception — buys spatial coherence but pays for it with either a model at runtime (forbidden without
very good reasons I do not have, at ~6.2 s cold, when plain code is manifestly not exhausted) or with
a segmentation whose own parameters are as numerous as the ones I would be removing. **A pixels-first
statistical route**, working from order statistics over the raw array with no intermediate structure,
is genuinely robust and genuinely cheap, but it has no vocabulary for "this is type", "this is a
frame", "this is a scrim" — and goal 3 asks for those semantic classes to be handled *structurally*,
which means the representation has to be able to say the word.

The tree of shapes is the only representation I know that is simultaneously complete, self-dual,
contrast-invariant, parameter-free to construct, linear to compute, and *spatial* — so that noise
lives in an identifiable corner of it that one filter removes, and so that "large area", "nested",
"glyph-shaped" and "sits on top of" are all things the structure can express directly rather than
things a heuristic has to infer. It gives the gradient contract's hardest constraint — that the ramp's
two ends *are* the two field roles — for free, by construction, because the chain that is the gradient
is the same object as the two fields. That single coincidence is what convinced me.
