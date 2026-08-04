# Arm F — the field-and-marks paradigm

## 1. The paradigm

**A palette is not a summary of an image's colour statistics; it is a reading of the image's layout.**
The contract already says so and I am taking it literally: fields are large areas, foreground is text,
accent is icons and UI. Those are descriptions of *things laid out in a picture*, not of modes in a
colour histogram. So the computation is a robust decomposition of the image into **a smooth field**
— a colour that is an affine function of position over a large support — **and the marks laid over
it**, with every role colour read off a spatial object rather than off a cluster. The disagreeable
claim, stated so someone can take the other side: *colour-space structure alone does not determine
this palette, and any paradigm that works only in colour space is guessing at layout from its
shadow.* A histogram cannot tell a vignette from a duotone, cannot tell giant text from a second
field, and — decisively — cannot produce a background and a surface that are *the two ends of one
ramp*, because that fact lives in space, not in colour.

Two structural consequences follow immediately, and they are why I chose this. First, the gradient
rule falls out instead of being enforced: if the field is affine in position, its ramp's two ends
*are* background and surface by construction, and a flat field has one end, so a collapsed surface
means no gradient without anyone checking. Second, robustness has a mechanism rather than a hope:
every quantity I estimate is an **area integral or a robust M-estimate over area integrals**, and
integrals are insensitive to ±1 LSB dither in a way that histogram arg-maxima are not. The exact-pixel
requirement is satisfied once, at the very end, as a projection — never as the substrate of a decision.

## 2. Image to contract

Everything below runs at full resolution on one cold file. No randomness, no seeding, no sampling, no
identifier, path, or metadata is read at any point; the only inputs to any tie-break are colour values
themselves.

### 2.0 Decode and space

Decode to 8-bit sRGB, keep the exact triples (they are the output alphabet), and convert to OKLab.
OKLab is the working space throughout because the contract's rulers are stated in it (ΔL, ΔC, ΔH) and
because the *render* interpolates in it — so "does the straight line between two stops pass through
off-artwork colours?" is a question about straight lines in exactly this space. In one pass I also
accumulate a map from each distinct 24-bit triple to its count; album art typically has 10⁴–10⁶
distinct triples, so this is a hash map, not a 16M-entry table.

### 2.1 The field

Model the field colour as **affine in image coordinates**: three OKLab channels, each a plane over
(x, y). Degree one, not more, because the contract's gradient is a straight OKLab ramp and the
flattest hypothesis is the one the guide-stop semantics ask for. Fit it by **iteratively reweighted
least squares with a redescending loss** (Tukey biweight) on the OKLab residual magnitude, with the
loss scale set to the same-colour bar. Marks are down-weighted to essentially zero automatically,
because they are inconsistent with a plane over their own extent; the field wins on area.

IRLS on a redescending loss has basins, so the initialisation set must be principled rather than
random. I use a small deterministic set drawn from the image's own coarse structure: the global
robust centre, and the robust centres of a few nested border annuli and the interior. The border
annuli exist because album fields usually touch the frame, and because a *picture frame* is itself an
annulus and deserves its own basin. Each start converges; the winner is the one with the largest
converged support mass. Ties are broken by lower residual, then lexicographically on the fitted
constant term.

Outputs: a soft field weight `w(x,y) ∈ [0,1]`, the affine field function `F(x,y)`, the residual
`r = pixel − F`, and the support mass `∫w`.

### 2.2 Field-like components: frames, overlays, panels

The low-weight set is not simply "marks". Some of it is *other field*. A picture frame is a large
flat annulus; a translucent overlay panel is a large smooth region; a split-screen half is a large
smooth region. I run the same robust affine fit **recursively on the low-weight residual**, stopping
when no remaining component is both extensive and smooth. The result is a pool of **field-like
components**, each with an affine colour function, a support mask, a support mass, and a flatness
(residual variance after fit).

This is the structural answer to "frames, overlays and giant text as patches". They are not special
cases; they are simply more members of the same pool, discovered by the same operator. Nothing about
a component's *position* or *size* admits or excludes it.

### 2.3 Marks

Whatever survives the field-like extraction is mark material. Group it into components by connectivity
at a scale chosen by **scale-space stability**: sweep a small range of grouping scales and take the
scale at which the component count is flattest, which is where the structure is real rather than an
artefact of the operator. This matters because the alternative — an area threshold — is exactly what
makes giant text a special case. **Mark-ness here is defined by being unexplained by any field model,
not by being small.** Giant text is a mark; a one-pixel speck at the finest scale is not, because it
does not survive the stable scale.

Each mark component carries: mass, its robust colour, its *local* field colour (the field-like
component it sits on, evaluated at its own position), and its separation from that local field.
"Local" is load-bearing: text on an overlay panel is measured against the panel, not against the
global background. That is the structural fix for the candidacy-wall complaint — a mark's separation
is never computed against a field it does not sit on.

### 2.4 One candidate pool

Mark colours are grouped across components by **mean-shift in OKLab with bandwidth equal to the
same-colour bar**. I use mean-shift rather than threshold-and-merge because merging by a bar is
order-dependent and therefore not dither-stable, whereas mode-seeking on a smoothed density is
order-free and continuous. It also means my grouping rule inherits the bar's provisionality instead
of inventing a second one.

Field-like components and mark colour groups are then **unioned into a single candidate pool**. Every
colour group in the image is in the pool for every role. No role has an eligibility gate. Role
assignment is by **ranking on scores**, and a low score is a loss, never an exclusion. This is my
answer to "the right answer existed and the architecture could not emit it": there is no filter that
can remove a colour from consideration, only a competition it can lose.

### 2.5 Background, surface, and the gradient boolean

Three readings of the field compete, and they are chosen between by **penalised model selection**
(residual plus a complexity price), not by thresholds:

- **Ramped single field.** One field-like component dominates and its affine term is real. The ramp
  direction is the unit spatial direction maximising the OKLab magnitude of the directional
  derivative; the field's colour is evaluated at the two extremes of the projection onto that
  direction, *restricted to where the component actually has support*. Those two colours are the
  background and surface targets. **Gradient: true.**
- **Two field-like components.** A panel or frame sits over a background. The larger, enclosing
  component is background; the other is surface. **Gradient: false** — the two field roles are not
  the ends of one ramp here, so no ramp is claimed.
- **Flat single field.** One component, affine term not supported. Surface collapses to background.
  **Gradient: false.**

Orientation within the ramped reading — which end is background — is decided by **field support mass**:
background is the colour the field mostly *is*, surface is the colour it moves *toward*. Where the two
masses are within noise, the darker end takes background. This is a judgment call and I flag it as one
in §3.

The affine-versus-constant question is settled by a **statistical test on the robust fit** (the drop in
robust residual scale from constant to affine, against its sampling distribution under the fitted
noise), at a stated confidence level, rather than by a magnitude threshold on the ramp. That matters
for the false-positive mode I most fear: JPEG-blocky skies and lens vignettes produce small but
systematic planes, and a magnitude threshold would either over-call them everywhere or need tuning per
corpus.

### 2.6 Stops

The ends are fixed by construction: **first stop is exactly the published background, last stop is
exactly the published surface.** The invariants `I1.first-stop-not-background` and
`I1.last-stop-not-surface` cannot be violated because I never compute the ends separately from the
roles; they are the same two numbers.

Interior stops are computed only from **excursion**, exactly as the guide-stop semantics require.
Parameterise the field's true colour path by the ramp coordinate `t ∈ [0,1]` — this is a one-dimensional
curve obtained by binning the field-weighted pixels along `t` and taking the robust colour per bin, so
it is again an integral. The 2-stop render is the chord between the ends. Measure the **maximum OKLab
distance from the true path to the chord**. If that maximum is below the same-colour bar, the straight
line never visibly leaves the artwork and **two stops is the answer**; adding one would be metric
fitting, which is named inadmissible.

If it exceeds the bar, insert **one** interior stop at the argmax of excursion, snap it, and re-measure
against the new two-segment path. This is monotone excursion reduction by construction, and it cannot
meander: the interior stop lies on the fitted field path, which is a smooth low-order curve through
colours the artwork actually has at those positions. The genuine three-colour ramp — a real corner in
the field — appears as a knot in the same one-dimensional fit and is picked up by the same operator,
which is the right unification: both admissible reasons for a third stop are "the true path is not the
chord".

A fourth stop is **not emitted by default**. If a second separated excursion lobe remains above the bar
after the third stop, I report it as evidence — its position, its magnitude, the render error it would
remove — and leave the decision to the negotiation the contract says it is. Reaching for the fourth
stop silently would be exactly the argument I owe evidence for, made without the evidence.

### 2.7 Foreground and accent

The two ink roles are assigned jointly with the field roles, because they interact: accent must differ
from foreground, surface from background. I take the top few candidates per role by role-fit score and
solve the small four-role assignment exhaustively, so no ordering artefact enters.

**Foreground scores on legible mass.** Among candidates that are a *different colour* from their local
field under the same-colour bar, rank by mass, with separation as the secondary term. Mass leads and
contrast does not, because the contract puts the hard minimum near zero by default — the system must
not require contrast, only prefer the group that actually functions as ink. The user's minimum-contrast
parameter enters here and only here, as a filter on candidates; at its default it filters nothing.
Giant text wins this on mass without any size rule, which is the point.

**Accent is decided by ranking, never by a threshold.** This is deliberate, and it is my answer to the
open question that has refused measurement twice. I never ask "is this accent good enough?" — a question
whose answer is a constant that two pre-registered rounds declined to produce — I ask only "is there
another colour, and which of them is most findable?". Existence is decided by a rule that *does* exist:
is there a candidate group that is a different colour from both its local field and the foreground,
under the same-colour bar? If not, **accent collapses to foreground**, declared. Identity is decided by
a findability ranking that weights the lightness component of the separation above the chromatic
components — the direction perception-4 measured, used as a direction and never as a coefficient,
because the ranking depends only on the resulting *order*. Crucially this is a **different ruler** from
the same-colour bar and is anisotropic the opposite way, exactly as the constraint sheet demands; the
two are never allowed to be the same function.

The fragile case the brief names — an accent that moves only in hue and chroma — I do not reject and do
not silently accept. It is **reported**: the accent's lightness delta and a flag that it is chromatic-only
travel with the palette. That is what you do with a quantity that has no threshold.

### 2.8 Snapping, collapses, escape

Each role has a continuous target. To publish, take the ball of radius equal to the same-colour bar
around the target and choose the artwork triple maximising a **kernel-smoothed support mass** inside it,
with OKLab distance as tie-break and the 24-bit integer value as final tie-break. Not nearest-neighbour:
nearest-neighbour chases a single dithered pixel, whereas the mass-maximising choice is an integral and
moves by far less than one LSB under dither. If the ball is empty, take the nearest artwork triple and
flag that the intent was off-artwork — a real diagnostic, since it means the palette wanted a colour the
image does not contain.

Then the interactions are enforced on the *snapped* values, because collapse is defined as exact hex
equality: if surface snaps equal to background, declare `collapse.surfaceCollapsed` and force the
gradient boolean false and drop to a single stop, since both ends would be one colour. If accent snaps
equal to foreground, declare `collapse.accentCollapsed`. If an interior stop snaps onto an end, drop it —
it removes no excursion.

The **escape** is reachable only from one situation: the entire artwork's colour set fits inside a single
same-colour ball, so there is genuinely one colour and no second one to publish. Then background is that
colour; foreground is `#ffffff` or `#000000`, whichever is both absent from the artwork's exact triple set
and further from the field in the findability sense; surface and accent collapse; `palette.escape` is
declared and its four conditions are checked explicitly. If my paradigm reaches the escape on anything
other than a near-solid cover, that is a bug and not a feature.

### 2.9 Why this is robust, structurally

The re-encode, dither and relabel failures each have a named mechanism here. **Dither**: every estimate
is an integral or an M-estimate over integrals, and a ±1 LSB perturbation moves an integral by at most
one LSB and typically by O(1 LSB/√N) — orders below the same-colour bar. The one remaining exposure,
the exact-triple output alphabet, is damped by mass-maximising snapping rather than nearest-neighbour.
**Re-encode**: block artefacts are high-frequency residual; the field fit is a plane over millions of
pixels and does not see them, and the mark grouping takes its scale from the stability plateau, which
sits above the artefact scale. **Relabeling**: no identifier, filename, path, or metadata field is read
anywhere, and no tie-break consults anything but colour values, so an id change cannot move a byte.

The honest boundary: the three binary declarations (gradient, surface collapse, accent collapse) and the
stop count are discontinuous by nature. A binary decision on a continuous quantity flips somewhere. My
claim is only that the *quantities* are stable, so only genuinely near-boundary images flip — and each
decision publishes its margin, so those images are identifiable instead of silently unstable.

## 3. Where the decisions live

Four places, and they are separable on purpose.

1. **The field/mark cut** lives entirely in the robust loss scale of the affine fit. What counts as
   "not the field" is one scale, and I tie it to the same-colour bar rather than choosing it.
2. **The reading of the field** — ramped, panelled, or flat — lives in one penalised model-selection
   comparison. This is the single most consequential judgment in the design, because it sets the gradient
   boolean and both field roles at once, and it is deliberately concentrated in one place where it can be
   audited rather than spread across a decision tree.
3. **Ramp orientation** — which end is background — is a genuine judgment with no measurement behind it.
   It sits in one comparison of support masses with a darkness tie-break.
4. **Role assignment** is a ranking over one unbarriered pool, with the accent's existence decided by the
   same-colour rule and its identity by an anisotropic ordering. There is no eligibility logic anywhere;
   that absence is the design.

## 4. Free parameters

Independent decisions the *paradigm* needs a human to make, honestly:

1. **Robust loss scale for the field fit.** Derived, not free: set equal to the same-colour bar. Anchor:
   the perception rounds that produced the bar. If the bar changes, this changes with it.
2. **Model-selection complexity price** (one field vs two; constant vs affine; when a third stop earns its
   place). One penalty in a penalised-likelihood form. Anchor: a synthetic calibration — a known flat
   field plus known dither must never split, and a known two-panel image must never merge. That is an
   experiment with a right answer, not a preference.
3. **Findability anisotropy** — how much more a lightness step is worth than a chromatic one in the accent
   ranking. Anchor: perception-4's measured direction, used only for ordering. Its honest treatment is the
   **invariance interval**: report the range of the ratio over which the emitted palette is byte-identical,
   and if the winner is stable across the whole plausible range, this is not a knob.
4. **Ramp orientation rule** — support mass, with darkness as tie-break. Not a number but a human choice,
   and it counts. Anchor: reviewer verdicts on gradient covers; it is directly checkable and cheaply
   falsified.
5. **Mark-grouping scale rule** — the scale-space stability criterion needs a sweep range. Anchor: tie the
   range to the image diagonal so it is scale-free, and pick the plateau per image; the human decision is
   the *criterion*, not a constant.

**Five**, of which one is derived and one is a rule rather than a value. Two further numbers enter but are
not mine: the same-colour bar (inherited from the contract, and I depend on its order of magnitude rather
than its value — mean-shift bandwidth and snap radius both degrade gracefully) and the user's
minimum-contrast parameter. Against ~900 tunable sites, this is the order-of-magnitude reduction the goal
asks for, and the reduction is structural: there is no stage in this design that *wants* a threshold,
because every gate has been replaced by a ranking or an integral.

The reporting discipline matters as much as the count. Every one of the five ships with its invariance
interval computed per image. A parameter whose interval covers the whole plausible range is not free in
any meaningful sense, and saying so with evidence is the difference between five parameters and five
excuses.

## 5. Cost

Cold, one file, nothing precomputed. The work is a decode plus a small number of linear passes over the
pixels. Per megapixel, single-threaded, in typed-array code: decode 10–30 ms; sRGB→OKLab ~5–10 ms; the
robust affine fit ~6 IRLS passes at ~5 ms each with the multi-start stage run at reduced area and only the
winner refined at full resolution, so ~40 ms; recursive field-like extraction on the shrinking residual
~20 ms; mark components with the scale-space sweep ~25 ms; the distinct-triple map ~15 ms. The
one-dimensional ramp fit, the mean-shift over a few hundred group seeds, the 4-role assignment over a few
thousand tuples, and the snap queries are all negligible against the pixel passes.

**Roughly 100–150 ms per megapixel, so about 0.2–0.4 s for a typical 2 Mpx cover**, with memory O(pixels):
an OKLab float32 buffer at 12 bytes per pixel plus the triple map.

Why that is reasonable: this sits at the *target* end of the bracket — ordinary per-file image code, a
decode and eight-ish linear passes, with no model, no network, no index, and no prior pass over anything.
It is roughly an order of magnitude cheaper than the exceptional end (SAM at ~2.7–4.3 s warm, ~6.2 s cold),
so no exceptional justification is owed. And nothing in it is warm-cacheable in a way that would flatter
the estimate: the number above *is* the cold number, because there is no other kind of run.

## 6. Build cost

The components are classical and individually well-understood. Robust affine IRLS with multi-start: ~1 day.
Recursive field-like extraction with model selection: ~3 days. Mark components with scale-space stability:
~3 days. Colour-density structure, mean-shift grouping, and the mass-maximising snap: ~2 days. Ramp
parameterisation, excursion measurement, stop insertion: ~2 days. Contract emission — roles, gradient,
stops, declared collapses, the escape and its four conditions: ~2 days. First end-to-end palette in about
a week.

The real cost is not the algorithm. It is the **invariance-interval harness** (sweep each parameter per
image, record byte-identity ranges) and the **robustness harness** (re-encode, ±1 LSB dither, relabel, and
report perceptual *and* byte agreement separately): ~4 days, and they should be built before tuning
anything, because without them the parameter-honesty claim is unverifiable and the whole point is lost.
Call it **three weeks** to real palettes on a corpus with the evidence to defend them.

## 7. Expected failures and falsifier

**What I expect to be bad at.** Covers with no field: a band photographed in a forest, edge-to-edge
texture, a busy collage. The robust fit will converge on *something* — the largest smooth-ish patch — and
background and surface will be arbitrary rather than wrong-in-a-legible-way, which is worse. Multi-panel
collages, where several equally extensive field-like components make model selection near-tied and
therefore unstable. Heavy grain, halftone scans and film texture, where residual has structure everywhere;
scale-space stability mitigates this but does not solve it. And **over-calling gradients** on vignettes and
blocky skies, which is where the statistical test earns its keep or fails to.

**The falsifier for the paradigm, not the tuning.** The paradigm asserts that role colours are the colours
of spatially coherent objects. So: take the reviewer's endorsed palettes, run the decomposition, and ask
of each endorsed colour whether it is recoverable as *some* component's colour at *any* admissible setting
— not whether my ranking chose it. If a substantial share (I would pre-register 30% of endorsed accents)
are not in the pool under any setting — if the reviewer's accents are systematically blends, or the
colour of a scattered non-contiguous set with no spatial coherence — then the reviewer is not reading
layout and my root claim is false. A second, sharper one: on gradient-endorsed covers, if the endorsed
surface is systematically an *interior* colour of the field's spatial ramp rather than an end, then the
spatial reading and the reviewer's practice disagree about what the ramp is, and the disagreement is at
the paradigm's core.

The distinction from under-tuning is clean and that is why I like these two: if the endorsed colours *are*
in the pool but I rank them second or third, that is scoring, and scoring is tunable. If they are not in
the pool at all, no amount of tuning reaches them.

## 8. Exposable intermediate work

Everything here is genuinely mid-computation, not a post-hoc rationalisation of the answer:

- **The field weight map**, as a greyscale overlay — literally "what the algorithm thinks is field", the
  single most diagnostic image in the system.
- **The fitted field rendered as an image**, and the residual image beside it.
- **The field-like component pool**: each component's mask, colour, extent, flatness, and where it placed.
- **The mark atlas**: each component with its colour group, mass, its *local* field, and its separation —
  which shows directly whether a mark was measured against the right thing.
- **The ramp plot**: the field's colour path against `t` in OKLab, the chord, the excursion curve, and the
  stop positions marked on it. This makes the guide-stop justification auditable against "meandering is
  forbidden" by eye, which no scalar can.
- **The snap ledger**: for each role, the ball around the target and the candidate artwork triples with
  their support mass, showing exactly why a hex won.
- **Margins** on all four binary decisions: the gradient test statistic, both collapse distances to the bar,
  the accent's lead over the runner-up, and the chromatic-only flag with its lightness delta.
- **The model-selection ledger**: the competing field readings with their penalised scores.
- **Invariance intervals** per parameter per image.

## 9. What was missing

`PHASE_0_DECISIONS.md` (all sections), `V3_PLAN.md`, `src/contract/` including `PERCEPTION_VERDICT.md` and
`challengers.ts`. My packet was §2 and §3 of the brief only. Assumptions I proceeded under:

- **Stops when the gradient boolean is false.** Unknown schema. I assumed a single stop equal to the
  background, and that stops carry a colour and a normalised position with the ends at 0 and 1. This is the
  one gap that actually bit: if stops must always number at least two, my flat-field emission is wrong in
  form though not in content.
- **Surface as a panel.** §3.1 describes the ends rule only "when the field is a gradient", which implies
  surface exists in non-gradient cases. I assumed a distinct non-gradient surface (a panel, a frame, a
  split field) is legitimate. This is load-bearing — the two-field-like-component reading in §2.5 depends
  on it — and if it is wrong, that reading collapses into "surface collapsed" and the design still runs.
- **Input form.** Assumed an opaque decodable still in sRGB. If alpha is possible, the compositing rule is
  a real gap.
- **The exactness invariant and the escape.** "Every published colour is an exact pixel" is stated
  absolutely while the escape publishes an off-artwork literal. I assumed the exactness check is aware of
  `palette.escape`. Minor.

One thing in the brief reads as self-contradictory until you fix the referent. §3.1 says to treat the
same-colour rule as "conservative in the chroma direction and permissive in the lightness direction", and
in the same breath says the frozen bar is "too loose for chroma, less than half of what lightness needs".
Taken as statements about *splitting*, those are opposites: a bar above the chroma threshold is permissive
about calling chroma differences the same, and a bar below the lightness threshold is aggressive about
splitting lightness. They reconcile only if "conservative/permissive" is read as being about **declaring a
difference** rather than about declaring sameness. I designed against the numbers, which are unambiguous,
and the design is insensitive to the reading because the bar enters only as a scale — a mean-shift
bandwidth, a snap radius, a loss scale — with its invariance interval reported.

## 10. Why this one

I considered three alternatives seriously. **Colour-space clustering** (k-means, GMM, mode-seeking on the
histogram) is the obvious route and I rejected it on the robustness goal alone: hard assignment, seeded
initialisation and count-arg-max are three separate discontinuities, and they are the mechanisms behind a
±1 LSB dither moving all 114 palettes. It also cannot produce a background and surface that are ramp ends,
because the ramp is not in the histogram. **Learned or model-based segmentation** is banned at runtime, and
the one exception is slow, cold, and owes justification I would rather not spend. **A pixels-first route** —
the open question the brief leaves unwritten — is tempting precisely because it is unclaimed, but I think it
is the same paradigm as mine without the commitment: working "directly from the pixels" only becomes a
computation once you say what structure you are reading out of them, and the moment you answer, you have
named a decomposition. I would rather name mine up front and be falsifiable about it. The field-and-marks
reading earns its keep in three places at once: it makes the gradient rule structural instead of enforced,
it makes frames, overlays and giant text ordinary rather than special, and it replaces every candidacy gate
with a ranking over one pool — which is exactly the three goals, in order.
