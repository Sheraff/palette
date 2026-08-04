# Arm B — The palette is a reading of the image's nesting structure

## 1. The paradigm

**Roles are properties of *regions*, not of *colours*.** An album cover is, for palette purposes, a
shallow nesting of a handful of spatial parts — a field that runs to the frame, marks laid on it,
occasionally a subject between them — and `background`, `surface`, `foreground` and `accent` are
*names for parts*, not names for points in a colour distribution. So the algorithm's whole job is to
recover that nesting from one cold file in plain code, and then read the four roles off it by a fixed
structural order. The colour arithmetic is downstream and small: once you know which part you are
naming, choosing its exact published pixel is a well-posed, boringly stable question. Someone can
disagree cleanly — they would say the reviewer's endorsed colours are *not* recoverable as the
representatives of spatial parts. If that is true this paradigm is dead, and §7 says how to find out
cheaply.

A sharper commitment falls out of it. **The artwork usually contains a worked solution to our own
problem.** Its title text already sits on its own field at a contrast a designer chose. A parse that
finds those marks does not have to *invent* a foreground — it can *read* one. No colour-statistics
paradigm can do this, because the evidence is geometric: constant stroke width, collinear centroids,
one colour shared across disconnected components.

## 2. Image to contract

### 2.0 What a parse is

A parse is a **typed nesting tree**. Each node is a connected pixel set carrying an area fraction
(never a pixel count), an OKLab colour distribution, second moments and a normalized bounding box, a
boundary length relative to the root of its area, and a parent. Each node has a **type** from a closed
set — `field`, `enclosure`, `mark`, `subject`, `grain` — and an **adequacy**: the residual of the model
that justified the type, expressed in *bars*, multiples of the contract's own regional same-colour bar.
Adequacy is the parse's self-assessment, and §2.8 turns entirely on it. The parse has no nouns and
never asks what anything *is*; it asks what runs to the frame, what encloses what, what is laid on top,
and what is too small to be structure.

### 2.1 Decode

Native resolution, pinned decoder, dimensions from the header. Genuinely transparent input is refused
loudly, not flattened (§3). The sRGB buffer is kept for the whole run, because every published colour
must be an exact triple from it. One pass builds the OKLab image via a 256-entry linearization table,
the fixed 3×3, three cube roots and the second 3×3. Nothing is resampled: where a coarse view is
needed it is a box statistic read from integral images at native resolution, because a decimated image
contains colours the artwork does not and invariant 2 would then be satisfied by luck.

### 2.2 The nesting hierarchy, and why chaining is the feature

Build the pixel adjacency graph (4-connectivity), weight each edge by the OKLab distance across it,
and take the hierarchy of **quasi-flat zones**: at dissimilarity level α, the α-zones are the
connected components of "there is a path between these pixels whose every step is at most α".
Computed once for all α by a Kruskal-style union-find over edges binned by weight — near-linear,
deterministic, with a lexicographic tie-break on pixel index so iteration order cannot matter.

Set α to the same-colour bar, regionally: two adjacent pixels join iff they *read as the same colour*.
This has a famous pathology — on a smooth gradient every step is below any bar, so the whole ramp
chains into one zone — and here it is the single most useful thing the structure does. **A field that
is one flat colour and a field that is one continuous progression are the same object at this level**,
which is exactly the reviewer's own distinction between `flat_field` and `shaded_field`. The parse
does not decide between them yet; §2.3 does, and that decision *is* the gradient boolean.

Zones below a scale-free area floor are typed `grain` and folded into their parent. Grain folding is
where robustness against dither and re-encode is bought: afterwards no surviving node's identity
depends on a pixel-scale event.

### 2.3 The field carve, and the field's model

**The field is what reaches the frame.** Take the α-zone(s) containing border pixels; their union is
the field mask. One union-find query, not a segmentation algorithm — and this is where most stability
comes from, because a one-pixel crop, a re-encode or a ±1 LSB dither cannot change what is connected
to the frame at bar scale. Then type the field by **model adequacy**, in a fixed order, stopping at
the first model whose residual falls under one bar:

1. **Flat** — the constant model; adequate iff the field's spread about its representative is under
   the bar. The field is one colour and the gradient boolean is false.
2. **Linear** — regress each OKLab channel on normalized position: three planes, closed form, one
   pass. The fitted direction gives the ramp's parameter `t`, and incidentally the optional `geometry`
   field the contract says to populate only when fitting computed it anyway.
3. **Radial / conic** — the same regression on radius from the colour-weighted centroid, and on angle.
4. **None** — no progression fits; this is not a field in the contract's sense.

So **the gradient boolean is "no single colour represents this field within the ruler, and a
progression does."** A definition, not a heuristic, using no constant the campaign has not calibrated.

Two structural cases are handled here rather than patched later. **Enclosure:** if the field is an
annulus containing another large zone, it is typed `enclosure` and the carve re-runs inside — frames
and bars stop being special, since what the UI sits on is the enclosed field and the frame becomes a
mark whose colour stays eligible for every role. **Giant type touching the frame** leaks into the
field and drags its colour in; detected by asking whether the field contains a stroke-width-coherent
subset (§2.4) whose removal *reduces* the field's residual. If so, split it off and re-run the carve
once — exactly one re-entry, bounded and declared.

### 2.4 Marks

The field's complement decomposes into connected components. Each gets, in one pass: a distance
transform, from which the **stroke width** is twice the median distance along its ridge; an area
fraction; elongation from second moments; a representative colour. Components then group into **mark
groups** by a conjunction of geometric agreements — stroke widths agreeing within a coefficient of
variation, heights agreeing, centroids near-collinear, colours the same under the bar. Four or more
such components is `text`-shaped. This is the pre-model stroke-width/stable-region text pipeline,
chosen because it needs no model, no dictionary and no training: it detects the *manufacture* of type,
not its meaning. Its recall is mediocre and that is fine — I am not reading the text, only recovering
one colour a designer already validated against this field.

Non-text groups are typed by size: large and compact is `subject`; small and high-chroma is an accent
carrier; small, achromatic, axis-aligned, corner-anchored and colour-linked to nothing else is an
**overlay** (advisory badges, barcodes, watermarks). Overlays are *not excluded* — candidacy walls are
what made the reviewer's own corrections unpublishable. They sort last in §2.6 and can still win a
role if nothing else can.

### 2.5 The representative: which exact pixel a region publishes

Naive pixel-snapping fails here and the corpus says why. The median endorsed role colour occupies
**8.89e-5** of its image as an exact triple but **1.91e-2** as a same-colour-bar neighbourhood:
endorsed colours are rare as triples and dense as neighbourhoods. So a region's representative is not
its modal triple. Find the **density mode** — the OKLab location maximizing the region's mass within
one bar, on a bar-scaled accumulator, one pass, no iteration. Take the **bar-mode centroid**, the mean
of all region pixels within one bar of it; averaging over ~2% of a region's mass is what makes this
immovable under a ±1 LSB dither. Publish the **exact 8-bit triple present in the region nearest that
centroid**, ties broken lexicographically. Exact by construction, and stable because what is being
argmaxed is an average over tens of thousands of pixels rather than the peak of a sparse histogram.

### 2.6 Assignment: a lexicographic reading, never a weighted score

Every node representative is a candidate for **every** role — no walls. What differs per role is the
**order** in which candidates are compared, and every order is **lexicographic over structural
predicates**, never a weighted sum. A weighted sum is a parameter farm whose weights are exactly the
~900 tunable sites the rewrite exists to avoid; a lexicographic order has zero free constants.

One rule makes the orders stable: **comparisons at each level are made against the ruler.** If two
candidates differ by less than the bar on that level's quantity, the level is *indifferent* and the
comparison falls through. No decision rests on a difference the contract itself calls zero — a
structural answer to the relabeling and re-encode failures.

- **Background** — field nodes by area fraction, then border contact, then enclosure depth. When the
  field is a ramp, background is the representative at `t = 0`.
- **Surface** — the field's second zone if the carve found two; else the ramp's `t = 1` end; else the
  largest non-field node distinct from background above the bar; else collapsed.
- **Foreground** — text-shaped groups first by total area fraction, then any mark group, then subject,
  then overlays; within a level, by luminance separation from the field. The contract gives the
  foreground no colour rescue at any distance, so this order is luminance-ordered by construction.
- **Accent** — small high-chroma marks by chroma, then any mark distinct from foreground, then
  overlays. Open question 1 says an accent differing from its field only in hue and chroma is the
  fragile case and no number says when. I do not invent one: within each level, candidates that
  **also move in lightness** relative to the field sort ahead of those that do not. A preference costs
  no constant; a threshold would cost one and be uncalibrated.

### 2.7 The gradient, its stops, and the whole-ramp floors

If §2.3 typed the field as a progression, publish a ramp. The ends are fixed by ruling —
`stops[0] == background`, `stops[last] == surface`, exact equality — so the fitter has freedom only in
the interior.

Start at two stops. Compute the **excursion**: the rendered OKLab interpolation between the ends,
sampled densely in `t`, against the artwork's occupied colour set (a bar-scaled occupancy structure
built in one pass); the excursion at a sample is its distance to the nearest occupied colour. If the
worst excursion is under the excursion bar, publish two stops. If not, the straight line demonstrably
leaves the artwork — the one admissible reason for a third stop. Place it at the `t` of worst
excursion, at the exact artwork pixel nearest the fitted field model there, and re-measure; accept only
if the worst excursion falls materially, otherwise revert. The path cannot meander, expand coverage or
chase a metric, because the only accept test *is* excursion. A fourth stop is refused by default: the
contract makes it negotiable on proven utility and I do not have that evidence.

The contrast floors are enforced as the contract states them — a minimum over the *whole* interpolated
ramp in OKLab, not per stop: sample raw pre-clamp APCA densely in `t`, then refine the minimum
locally, for foreground and, as its pointwise conjunction of both dimensions, for accent. At default ε
they bind almost nothing; when a caller raises one, the repair is a *re-run of that role's order with
the floor as a filter*, not a nudge of the winning colour. That satisfies the contract's parameter
requirement for free — at defaults the output is byte-identical to the unparameterized run, and
raising a floor can only change artworks whose order actually re-resolves.

### 2.8 Collapses, the escape, and what happens when the parse is wrong

A parse is a claim and this one will often be wrong. Three properties bound the damage.

**Wrongness is mostly confined to the gradient boolean.** Background is the representative of the
largest border-connected zone under *every* field typing. Mistaking a shaded field for a flat one, or
the reverse, changes whether a ramp is published and what `surface` is; it does not move `background`.
The most likely parse error is also the least expensive one, and the one the review channel is best
placed to catch.

**Inadequacy is declared, not guessed.** When no model in §2.3 is adequate, the field is typed `none`
and a **degenerate branch** runs: the four roles are read from the whole image's bar-scaled colour
modes by area, ordered by luminance, under the same representative rule and the same contract
constraints. Dull, stable, valid. I would rather publish a dull palette honestly labelled `unparsed`
than a confident one from a structure that was not there — and since the parse type ships as an
intermediate product (§8), a census can separate "the parse failed" from "the parse succeeded and the
reading was wrong".

**Collapses are structural events, not fallbacks.** `surface` collapses to `background` exactly when
the carve found one field zone and no non-field node is distinct from it above the bar; `accent`
collapses to `foreground` when no mark survives distinct from the foreground above the bar. Both are
exact hex equality with the flag set. A collapsed surface makes both ramp ends identical and so forbids
a gradient, which the parse gets right for free: a single field zone that is a progression does not
collapse.

The **escape** has one door: no node's representative can serve as a text colour at all — every
candidate is within the bar of the background — and pure black or white is genuinely absent from the
artwork. Then publish the absent literal at `foreground`, collapse `accent`, declare it. A derived
consequence: an escape at `background` implies `surface` collapsed implies no gradient, so the escape
and the ramp are mutually exclusive by construction.

## 3. Where the decisions live

**The parse's type set is the largest judgment call, and it is not a number.** I assert that
`field / enclosure / mark / subject / grain` is a sufficient vocabulary for this contract — a claim
about album covers, made in advance, and where the design would be wrong interestingly rather than
fixably. **The lexicographic orders are the second:** each encodes a belief — that a text-shaped mark
is better evidence for a foreground than a subject is; that a small high-chroma mark is better evidence
for an accent than a large one. Visible, arguable, reorderable, carrying no constants. **The adequacy
tests are the third**, deliberately parasitic on the contract's ruler, so I introduce no perceptual
quantity of my own. **The representative rule is the fourth**, and the only place the design does what
the corpus told it rather than what structure told it.

Two questions the brief flags as algorithm material get parse-native answers. **Transparency:** the
contract refuses it and so do I — but if flattening were ever authorized, the matte must be the
*field's own representative*, not a fixed white or black, since a global matte injects a colour the
artwork does not contain and would either violate invariant 2 or launder itself through the escape.
The parse is what makes a content-derived matte computable at all. **Colour-vision deficiency:** no
diagnostic, no new axis. The contract already denies the foreground any chromatic rescue, so text
legibility is luminance-carried and CVD-safe by construction, and here the accent is a *spatial* object
found by shape as much as by hue. The contract has made the choice.

## 4. Free parameters

Independent decisions a human must make for the *paradigm* to be specified. Five, of which two are
inherited from quantities the campaign has already anchored and three are mine.

1. **The same-colour ruler** — α for connectivity, the adequacy bar for every model, the indifference
   band in every order, and the radius of the representative's density mode. *Anchor:* already
   reviewer-calibrated and frozen, regionally. Inherited — but load-bearing here in a way it is not
   elsewhere, so enforcing the direction-aware challenger would change my *parse*, not only my checks.
   I depend on the ruler's shape, not its digits.
2. **The structural area floor**, below which a node is grain. Scale-free. *Anchor:* the smallest
   region whose colour the reviewer has ever endorsed — computable at dev time by running the parse
   over the legacy endorsements and taking the area-fraction distribution of the nodes whose
   representatives match endorsed colours. Empirical, with provenance, falsifiable by the same run.
3. **The field-adequacy multiple** — a model is adequate under *k* bars of residual; I propose k = 1.
   *Anchor:* a small review round of the shape the campaign already runs, flat-versus-ramp at residuals
   of 0.5, 1 and 2 bars. This is the one parameter that moves the gradient rate corpus-wide, so it
   deserves its own round, and the distribution-level neutrality census would catch it drifting.
4. **The mark-coherence coefficient** — how tightly stroke widths must agree for components to group
   as text. Dimensionless. *Anchor:* a dev-time sweep against the oracle's `has_text` and
   `text_dominance` labels used as a *census*, never per item, plus (§9) SAM's dev-time text masks as
   a stricter reference. My least principled number, and I say so.
5. **The excursion multiple** — how far off-artwork a rendered ramp may pass before a third stop is
   admitted. *Anchor:* the campaign's existing P1 excursion multiplier, which the perception verdict
   flags as owed its own round with ramp stimuli. Inherited, with a known debt.

Deliberately *not* parameters: every role order (lexicographic, no weights); the gradient boolean (a
model-adequacy outcome); collapse conditions (bar equality); the escape (contract-defined); the
contrast floors (contract user parameters with measured ε); tie-breaks (lexicographic on the triple).
I claim no hidden weights in the assignment stage, and the honesty scanner would catch me lying.

## 5. Cost

The honest unit is **passes over the pixel array** — machine-independent, and checkable. The parse
costs roughly ten linear passes (decode, OKLab conversion, edge weights, the union-find hierarchy,
attribute accumulation, the carve, connected components, one distance transform, the closed-form
regressions, the occupancy structure), then a tail sized by surviving nodes rather than pixels.
Nothing is super-linear: the hierarchy's edge ordering is a counting sort into bar-scaled bins, not a
comparison sort, and the one re-entry (§2.3) at worst doubles the carve, not the run.

On a typical square cover this lands in the **tens of milliseconds**, single-threaded, with the JPEG
decode a meaningful share; on the largest renditions, low hundreds. The brief's bracket asks nothing
of cheap plain code and this sits two orders of magnitude below the ~6.2 s cold SAM figure, so I owe
no cost defence and want none: **I am not asking for the model exception.** Condition 4 requires that
plain-code methods be exhausted, and this proposal is a claim that they are not remotely exhausted —
that a morphological nesting hierarchy plus a stroke-width mark detector recovers most of what a
segmentation model would, with determinism that is a property of the algorithm rather than a
measurement of a pinned stack. If this arm is prototyped and *fails*, that failure is itself evidence
for condition 4, and the next proposal reaching for runtime masking could cite it.

## 6. Build cost

A **walking skeleton** — decode, OKLab, the α-hierarchy, the border carve, flat-field typing, the
representative rule, roles by the degenerate branch, contract emission with collapses — is about three
days and already emits contract-valid palettes for the flat-field stratum. Worth naming, because its
robustness numbers are measurable before any of the interesting parts exist, and those parts should
improve *quality* without touching *stability*.

Beyond that: attribute accumulation and grain folding is several days and the piece most likely to
hide a determinism bug; field model fitting is about a day; marks (components, distance transform,
stroke width, grouping) is the fiddliest week and most likely to need two attempts; ramp fitting with
whole-ramp floors is several days, mostly in getting the raw pre-clamp APCA minimization over the
interpolation right rather than sampling it coarsely and calling it the minimum. Wiring to the dev loop
is two exports. Call it **two to three focused weeks** to real palettes across the coverage set:
skeleton at day three, first robustness reading at day four.

## 7. Expected failures and falsifier

**Expected bad at:** photographic and full-scene covers, where no field exists, the parse declares
`none`, and the degenerate branch produces a valid but unremarkable palette — my largest expected
bucket of mediocre-but-not-wrong results. **Dark, near-black artwork**, where one 8-bit step is a large
OKLab step and the bar is tightest: α-connectivity is genuinely fragile there, and I expect the dark
stratum to be my worst robustness cell, not my best. **Heavy grain and halftone**, where quasi-flat
zones shatter and the area floor does all the work. **Artwork whose own type is deliberately
illegible** — grunge and metal logos — where "the designer already solved it" misfires and yields a
foreground faithful to the artwork and useless as UI text, which the default contrast floor will not
catch.

**Falsifier for the paradigm, not its tuning:** run the parse over the endorsed legacy set, hand the
*node representatives* to adjudication as `availableColors`, and read reachability. If a large share of
endorsed palettes are unreachable from the parse's nodes **while remaining reachable from an
unstructured whole-image colour set**, the endorsed colours do not live in spatial parts and §1's
premise is false — no re-parsing fixes that. Second, independent: if the gradient boolean derived from
field-model adequacy agrees with the reviewer's gradient endorsements at about chance, then "a gradient
is a field with no single-colour representative and an adequate progression" is the wrong definition,
and the ramp half of the contract needs a different paradigm even if the flat half survives.

## 8. Exposable intermediate work

Everything before the palette — and mostly *pictures*, which is what the human channel judges well.

- **The parse map:** a false-colour overlay at native resolution showing field, enclosure, marks,
  subject and grain, with the nesting tree beside it. A reviewer can say "the frame is not the
  background" without knowing anything about colour science.
- **The field model card:** which model won, its residual in bars, and the fitted path drawn over the
  artwork — the gradient boolean's entire reasoning on one page.
- **The candidate table, per role:** every node representative, its structural predicates, and where
  the order placed it, runner-up included. A reviewer who dislikes an accent can point at the one they
  wanted, which the design consumes directly rather than having to interpret a complaint.
- **`availableColors` for free:** the node representatives are exactly what adjudication's reachability
  check wants, so the ceiling question is answerable on day one.
- **The excursion trace:** the rendered ramp against the artwork's occupied colours — the evidence any
  third stop must carry.
- **The parse-type census:** one label per artwork, letting a corpus run separate "the parse failed"
  from "the parse succeeded and the reading was wrong". A system that cannot tell those apart cannot
  be steered.

## 9. What I asked for

Three requests, each with the assumption I proceeded under.

**From `ORACLE_QUESTION_SET.md` (stubbed): the derivation table mapping the six ground probes to
`ground_type`.** My parse computes probe-shaped booleans natively — "essentially one colour all over"
is my flat-adequacy test, "changes continuously across the whole background" is my progression-adequacy
test, "two or more separate areas" is my carve's zone count. I want to emit those three and be scored
through *the committed derivation* rather than one I invent, because inventing one lets me quietly tune
the comparison I am judged by. The table, not any accuracy figure. *Assumption:* I derive `ground_type`
by the obvious precedence in the inventory's own value definitions, flagged as mine and provisional.

**From `ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md` (stubbed): the storage format and per-region
attributes of the dev-time SAM masks.** I want SAM at *development time only*, as the reference against
which my mark detector's recall is measured on the text-shaped concepts the inventory names. That is
precisely the evidence condition 4 asks for — whether plain code is exhausted — and I cannot produce it
without knowing what is on disk. The format, not the oracle's performance. *Assumption:* masks are
per-(image, concept, instance) rows carrying an RLE mask, a score, a bbox and an area, which is what the
determinism measurement describes; I build against that shape.

**From `PHASE_0_DECISIONS.md` §7 (withheld): the measured resolution floors.** My area floor is the
paradigm's second free parameter and interacts directly with what is resolvable at a given rendition
size — which is what the informed-versus-chaotic metric is defined against. *Assumption:* the floor is a
pure area fraction validated by the resolution ladder, and a cross-rendition disagreement caused by a
node dropping below it at the smaller size counts as `informed`, not `chaotic`.

**Two things in the packet I could not resolve.** First, `PHASE_0_DECISIONS.md` §3 relocates the
retired 0.07444 to the foreground↔accent pair as `FOREGROUND_ACCENT_SEPARATION_DISTANCE`, while §4's
invariant 3 requires every published pair to be distinct above the *same-colour bar* — roughly 0.009
to 0.023. Two rulers govern one pair and neither text says which binds; I proceed under the stricter
reading that both hold. Second, the perception verdict's challenger applies a `dark-neutral`-derived
bar to pairs in every region, which the same document warns against twice. Nothing turns on it while
it is report-only, but if the direction-aware shape is ever enforced my α-connectivity inherits that
extrapolation directly, and would need the second region the verdict says is owed.
