# Arm D — the palette as order statistics of the pixel array

## 1. The paradigm

**A palette is four order statistics of one image.** Every published colour is the pixel that occupies
a *designated rank* in a scalar field defined at every pixel — not a representative, not a centroid,
not the winner of a shortlist, not the nearest neighbour of a computed target. Selection happens by
ranking, and a rank is redeemed by reading the pixel that holds it. The claim someone can disagree
with is this: **the reason the incumbent moves under a ±1-LSB dither is that somewhere in it a colour
was *created* — a bin, a centroid, a mean — and created colours are discontinuous functions of the
input, whereas order statistics of a large population are not.** Rewrite the whole pipeline in rank
statistics and robustness stops being something you tune for and becomes something you cannot avoid.

**Where I drew the intermediate-summary line.** The rule I hold myself to is narrower than "no
clustering" and I think it is the honest form of the seat:

> **Nothing colour-bearing is ever created.** Every object the algorithm builds is either a pixel of
> the artwork or a *number attached to a pixel*. All aggregation happens in the scalar domain.

That line answers the brief's test cases without a technicality. A **sorted array of pixels** is not a
summary: it is a permutation, and no element stands in for another. A **CDF of a scalar field** is
allowed — it summarises numbers, not colours; you cannot publish out of it, it names a rank, and the
rank must be redeemed against a real pixel. A **spatial gradient field** is allowed: same cardinality,
purely local, colour-free output. A **colour histogram is banned**, because its bins are colour-bearing
entities standing in for pixels, and "the modal bin" is a published bin however you dress it. k-means,
median cut, octree quantisation and any "top-N distinct colours" stage go with it. And — the clause
with teeth — **a local mean colour is banned too**, so I cannot measure flatness against a
neighbourhood average. Every local statistic here compares other pixels *to the pixel itself*, or ranks
them. That bans every linear filter on colour, which costs me the usual toolbox and buys the central
robustness property: linear filters are exactly what makes a ±1-LSB dither visible downstream; rank
filters annihilate it.

One consequence belongs before the mechanism, because it is the answer to goal 3: **the eligible set
for every role is all N pixels, always.** There is no candidacy wall anywhere in this design, because
there is no candidacy. A colour the reviewer would have chosen cannot be structurally unpublishable
here; it can only be badly *ranked*, which is a tuning failure and not an architectural one.

## 2. Image to contract

### 2.0 Decode

Native resolution, no resampling, dimensions from the decoder header. Alpha: **refused loudly**, per
invariant 5. The brief (§7) asks for a view on flattening, and my seat produces one better than picking
a matte. *Compositing creates colours*, so under my own line it is inadmissible — a pixel at α = 0.5
over white is not a pixel of the artwork and can never be published. The only consistent treatment is
**eligibility**: pixels with α < 255 take no part in any rank, can never be selected, and are excluded
from their neighbours' local statistics. The matte question then never arises, because no matte is
ever mixed. If transparency policy reopens, that is my proposal: not a matte, an exclusion.

### 2.1 Two per-pixel fields, computed at full resolution

Convert every pixel to OKLab (the contract's space). Then compute two scalar fields, both the same
cardinality as the image, both purely local, both colour-free in their output.

**The edge indicator.** At each pixel p, take the OKLab distances from p to the eight pixels of its
3×3 neighbourhood — distances *to p*, never to an average. Take the k-th largest of those eight (a
rank filter, not a maximum). Pixel p is an **edge** if that value exceeds the same-colour bar for p's
region. Reusing the contract's calibrated ruler is deliberate: "the colour changes here" and "these
read as two colours" should be one question, and the contract has already answered it with reviewer
evidence. The rank order k is what survives dither: a ±1-LSB checkerboard perturbs a minority of the
neighbours, so reading the k-th largest rather than the largest ignores it by construction. In
near-black regions a single LSB is a genuinely large OKLab step, so this is not free and k has to be
measured (§4) — but a rank filter is the only family in which that measurement can come out well.

**The depth field.** Let `depth(p)` be the exact Euclidean distance from p to the nearest edge pixel,
divided by the image's long edge so it is scale-free (§1's rule: normalised coordinates, never raw
pixel counts). Two linear passes. Depth answers "how deep inside a region of unchanging colour am I",
and it treats a flat field and a smooth gradient *identically*, because a gentle progression has a tiny
local derivative and produces no edges. The contract's "field" is exactly the depth field's high
ground, constant or ramping.

### 2.2 The selection primitive

Two primitives do all the work, and neither can create a colour.

**Trimmed rank selection.** Given any scalar field s and a level, take the sub-population of pixels
above the corresponding quantile of s. Quantiles, never extrema: an extremum is one pixel and usually
a compression artifact; a quantile of a million values is a stable functional of the distribution.

**The rank cascade.** Given a sub-population Ω, its *cascade pixel* is obtained by taking the median of
Ω's OKLab L values, restricting to the pixels attaining it, taking the median a of that subset,
restricting again, then the median b. This terminates on a single colour, that colour is attained by an
actual pixel, and the procedure is a pure order statistic — permutation-invariant, free of any
floating-point accumulation, and therefore identical under any parallelisation or relabelling of the
input. It is how a *population* becomes *one exact 8-bit triple* without a candidate set ever
existing. (The incumbent's ASCII-id relabelling moved 55.85% of the corpus. Here nothing but pixel
values enters any decision, and multiset order statistics are permutation-invariant by definition, so
that failure class is unreachable rather than fixed.)

### 2.3 Background and surface — the two ends of one field

The endpoint ruling says the ramp's ends *are* the two field roles. So I do not select them
independently; they are **one question with two answers**, which makes the flat and collapse cases fall
out instead of being special-cased. Let F be the **field set**: pixels whose depth exceeds the β
quantile. Then:

1. Let m be the cascade pixel of F — the field's median colour, an actual pixel.
2. Let e₁ be the pixel of F at the (1 − τ) quantile of OKLab distance from m. This is the field's
   far end, read at a trimmed rank rather than at the maximum.
3. Let u be the unit direction from m's colour toward e₁'s colour. (A *direction* is three numbers and
   is not colour-bearing: never published, never compared to a pixel, never a proxy for one. I draw
   the line here explicitly rather than quietly.)
4. Let e₂ be the pixel of F at the τ quantile of the projection of F's colours onto u — the opposite
   end of the same progression.
5. Order the pair by **prevalence rank**: count, for each end, the pixels of F within the same-colour
   bar of it. Larger count is the **background**; the other is the **surface**.

If e₁ and e₂ are within the same-colour bar, the field is one colour: **surface collapses to
background, exactly, flag set, no gradient publishable** — the contract's own consequence, arrived at
rather than encoded.

### 2.4 The gradient boolean, t, and the stops

Define, for every pixel of F, `t(p)` = its projection onto u, rescaled by the τ and (1 − τ) quantiles
of that projection so that t runs [0, 1] with the background at 0 and the surface at 1 — the contract's
required span and endpoints, structurally.

**The boolean.** A field whose ends differ is either *one progression* or *two distinct areas*, and the
discriminator is whether t is explained by position. Compute the **Spearman rank correlation** between
t and each of a small fixed dictionary of spatial parameterisations — linear along fixed directions,
radial from the image centre and from F's spatial cascade location. The gradient boolean is true when
the best rank correlation exceeds ρ\*. Rank correlation again: no fit, no residual, no created colour,
nothing a dither can move. The winning parameterisation *is* the optional `geometry` field, populated
because fitting computed it anyway and for no other reason — the contract's "opportunistic" clause.

**The stops.** Sample t at a fixed grid. At each sample t₀, let c(t₀) be the cascade pixel of the field
pixels whose t lies in a narrow band around t₀ — again an actual artwork pixel. The 2-stop straight
line in OKLab from background to surface is the flattest possible path; its **excursion** at t₀ is the
distance from that line at t₀ to c(t₀). If the maximum excursion over the grid exceeds the excursion
bar, insert one guide stop at the arg-max t, coloured c at that t, and re-measure on the two
sub-segments; repeat at most once more. This is Ramer–Douglas–Peucker on the artwork's own colour path,
and its properties are the ruling's properties: every insertion **strictly reduces** maximum excursion
and insertion halts the moment the bar is met, so the result is the flattest path that stays
on-artwork; **meandering is not merely forbidden, it is unreachable**, since no stop can be added that
does not reduce excursion; and colourspace coverage and metric fitting never enter, because the only
quantity consulted is distance-from-the-chord. A fourth stop is reached only when three left the bar
unmet — which is the evidence the ruling asks for before granting it.

### 2.5 Foreground

Foreground is text, and text is a *shape* fact before a colour fact. Text pixels sit at small but
non-zero depth (strokes have interiors) and are surrounded, at a slightly larger radius, by a coherent
field. So define an **ink** score over pixels whose depth falls in a band above zero and below the
field: for a pixel p at depth d, take the annulus of radius proportional to d around p, form its
cascade pixel, and score p by the fraction of the annulus within the same-colour bar of it. High ink
score means "a small coherent thing on a coherent ground" — a stroke, a glyph, a mark.

The foreground is the cascade pixel of the top-τ sub-population of the ink score. Where the artwork has
text, this publishes *the designer's ink colour*. Where it does not, the ink population fails
source-support verification (§2.7) and the algorithm falls to its second regime: the cascade pixel of
the top-τ sub-population of **|raw APCA| against the background**, restricted to pixels with
non-trivial depth — "the artwork's most text-like tone", not "the single darkest pixel", which would be
a JPEG artifact. Note what is absent: no colour rescue at any distance, per the 2026-08-04 ruling that
text is luminance-driven.

### 2.6 Accent

The accent is a chromatic departure from the field with real support. Its score is a **lexicographic**
rank, not a weighted sum, and the reason is `perception-4`: it measured that a lightness-moving accent
works about twice as often at matched distance, and said in the same breath to read that as a direction
and not a coefficient. So I encode the direction and refuse the coefficient. Two tiers:

- **Tier 1** — pixels that clear the same-colour bar from *both* field ends **and** differ from them
  in lightness by more than in chroma. Within tier 1, rank by OKLab distance from the nearer field
  end; publish the cascade pixel of its top-τ population.
- **Tier 2** — reached only when tier 1 is empty after verification: pixels that clear the bar
  chromatically only. Published, and **declared as the fragile case** in the exposed intermediates.

If tier 2 is also empty after verification, the **accent collapses to exactly the foreground**, flag
set — "genuinely no valid accent exists" arrived at as an empty population rather than asserted. The
qualification level is the contract's *calibrated* same-colour bar, not `ACCENT_FUNCTIONAL_DISTANCE`:
that quantity has refused measurement twice and is `stratum-dependent`, so a paradigm needing it as a
selection constant is betting on a number the campaign has twice declined to produce. Mine consumes it
only where the contract already imposes it — invariant 4's escape, at publication time — and never to
choose anything.

Incidentally, tier 1's preference for lightness-moving accents is also the colour-vision-deficient
choice, since lightness contrast survives all common CVD types and hue contrast does not. That is my
whole view on the brief's second withheld question: the paradigm gets CVD partial-credit for free, and
I would ship no separate CVD diagnostic until someone measures whether one is wanted.

### 2.7 Verification, repair, and the escape

Selection is cheap and local; **verification is a full pass and there are only a handful of them**. For
each published colour, one pass counts the pixels within the same-colour bar of it and accumulates
their positional quantiles — invariant 2's population floor and spatial-spread test, directly. A colour
that fails is not adjusted; the algorithm **steps the rank** — moves to the next quantile in the same
ordering — and re-verifies. Two properties the contract asks for by name follow. "Any repair
re-validates the entire palette": a stepped role re-runs everything downstream of it, so a relocated
defect is impossible rather than hoped against. And §2's paradigm-neutral parameter requirement holds
structurally, because contrast floors act only as **verification predicates** — at their defaults the
output is byte-identical to the unparameterised algorithm, and raising a floor can only step the rank
on artworks that actually fail it. Zero collateral by construction, not by testing.

The **escape** is reached only when the whole image lies within the same-colour bar of itself: one
colour, no second end, no ink, no accent. Then background is that pixel, surface collapsed, foreground
is `#ffffff` or `#000000` — whichever the artwork verifiably does not contain and gives the larger
|raw APCA| — accent collapsed, `palette.escape` declared. All four of the contract's conditions are
checked on the way rather than asserted after.

## 3. Where the decisions live

Six places, and I would rather name them than let them pass as mechanism.

1. **"A field is a region of low local colour derivative."** A judgment about what a UI field *is*, and
   the load-bearing one: it says a large soft vignette is a field and a large busy texture is not, even
   if the texture covers more area. It lives entirely in the depth field's definition — one auditable
   place.
2. **Depth rather than area.** A long thin band has area without depth. I chose depth because a
   background you can put text on needs an inscribed region, not a total. This is a preference and I
   cannot presently defend it with evidence.
3. **One field, two ends.** The endpoint ruling forces this when a gradient publishes; I extend it to
   the flat and two-area cases too, which is a choice — an artwork with two unrelated large fields is
   described here as one progression between them.
4. **The two-regime foreground.** Ink where ink exists, luminance extreme where it does not. The regime
   test is "does the ink population survive source-support verification" — a decision wearing a
   predicate's clothes.
5. **The accent's tier ordering.** Lightness-moving accents outrank chroma-only ones categorically: a
   measured direction converted into a total order rather than a weight.
6. **The universal trim level τ.** That one notion of "ignore the outer fraction" serves every order
   statistic in the pipeline. A parsimony bet, and it may be wrong in one place.

## 4. Free parameters

**Five independent human decisions**, plus three inherited from the contract with existing provenance.

| # | decision | what anchors it |
|---|---|---|
| 1 | **τ**, the trim level used at *every* order statistic | A measurement, not a preference: the smallest τ at which re-encode and dither agreement plateaus on the robustness harness. Sweeping τ is a one-dimensional curve with a knee. |
| 2 | **k**, the rank order of the local difference filter | The smallest k for which a ±1-LSB dither creates no new edge pixels on the perturbation set, measured per resolution tier. No human taste enters. |
| 3 | **β**, the depth quantile that separates field from non-field | A review round over a β-ladder: is the published background the background of this artwork. This is the one that genuinely needs the reviewer. |
| 4 | **ρ\***, the rank-correlation level above which a field is a gradient | Reviewer verdicts on flat-vs-gradient palette *pairs* for the same artwork. It has to be pairs, because §6 rules the gradient flag palette-conditional rather than an artwork label. |
| 5 | **The ink annulus ratio** — surround radius as a multiple of stroke depth | Dev-time: sweep against text-bearing strata of the corpus and pick the ratio maximising ink-mask agreement with the reviewer's own foreground endorsements. See §9. |

Inherited and used unchanged: the **same-colour bar** (regional, `[REVIEWED]`) as edge test, collapse
test, accent qualification and verification radius — one ruler, four jobs, no new digits; the **P1
excursion bar**, gating guide stops; and **invariant 2's support floors**, which my verification pass
implements rather than re-decides.

Deliberately absent: no per-role weights, no blend coefficients, no candidate limits, no family
thresholds, no `ACCENT_FUNCTIONAL_DISTANCE` in the selection path. The count is low not from discipline
but from the paradigm — a weighted sum needs weights and a lexicographic rank does not.

## 5. Cost

Cold, per file, single-threaded, ordinary plain code. The pipeline is **linear in pixel count** with a
small constant and a handful of full passes; there is nothing to precompute, nothing to look up, and
no artifact from any earlier run.

Per-pixel: OKLab conversion (three dot products, three cube roots, an sRGB linearisation table built at
startup from constants alone) ≈ 15–30 ns; the 3×3 rank filter (eight distances, a partial sort of
eight) ≈ 50–100 ns; the exact Euclidean distance transform (two separable passes) ≈ 10–20 ns; six to
eight further linear passes for quantiles, projection, t, the excursion grid and verification ≈ 30 ns
in total. The ink annulus is the only super-linear term and runs **only on pixels inside the depth
band** — typically well under a fifth of the image — at ≈ 50 samples each. Summing: **roughly
0.15–0.30 µs per pixel all-in, plus decode.**

Honestly, then: 640×640 ≈ **60–120 ms**; 1000×1000 ≈ **150–250 ms**; a 3000×3000 master ≈
**1.2–2.5 s**. The last figure is real and I will not assume it away — "no resampling, ever" means the
largest renditions cost what they cost, and at that end this design is in seconds-scale territory
despite containing no model. Two things bound it. The work is embarrassingly parallel (every field is
local, the transform separable), and the rank-statistic design means parallelism cannot change the
answer. Memory is the sharper constraint: OKLab as three Float32 planes is 12 bytes per pixel, so a
4000² input is ~200 MB transient and would want a tiled implementation. Placed in the brief's bracket:
at typical rendition sizes this is unambiguously the *ordinary per-file image code* end and needs no
defence; at master resolution it approaches the exceptional end, and it does so linearly and
predictably, which SAM's flat ~6.2 s does not.

## 6. Build cost

To real palettes over the coverage set, as a dev-loop candidate: **8–12 engineer-days.** Two to three
for the field machinery (colour conversion, rank filter, exact distance transform, quantile selection,
the cascade); two to three for the selection cascade and the verify-and-step loop; three to four for t,
the gradient discriminator and excursion-driven stop insertion, the fiddliest part and the one I expect
to iterate; one to two for contract emission, collapses, the escape and metadata. The exposed
intermediates (§8) are near-free — they are images already in memory.

The parameters are not on that path. Parameters 1 and 2 are measured against the robustness harness
with no reviewer involvement and can be swept the day the candidate runs. Parameters 3 and 4 need two
review rounds, which are bandwidth-bound rather than engineering-bound; until they land the candidate
runs on declared-provisional values. The largest risk to the estimate is the ink detector — a third
iteration there costs another two days.

## 7. Expected failures and falsifier

**Expected bad at.** Full scenes and busy collages, where the depth distribution has no plateau and the
β quantile returns whichever patch is smoothest — the background will be defensible but arbitrary, and
unstable between renditions in a way that shows as *chaotic* rather than *informed* disagreement.
Anti-aliased text at small renditions, where every ink pixel is a blend and the published foreground is
a halo tone rather than the designer's ink. Accents that are large soft glows rather than compact
saturated marks, which the accent score under-ranks by construction. And artworks whose two large
fields are unrelated, which §3(3) treats as one progression and will occasionally publish a gradient
between two things that are not a ramp.

**Falsifier**, pre-registered, and it separates refutation from under-tuning. Reachability with
`availableColors` set to every distinct colour in the image is trivially satisfied and tells us
nothing. The real test is one step further: for each of the 351 endorsed palettes' role colours,
compute *where in my field's rank order* the pixels bearing that colour sit. **If those rank positions
are distributed roughly uniformly rather than concentrated near the ends of the corresponding field,
the paradigm is wrong** — because no setting of τ or β is a re-ordering. Tuning moves *where I cut*,
never *what the order is*. A palette that is stable and wrong is under-tuned; a palette that is stable
and whose endorsed answers sit in the *middle* of every ordering I can construct refutes
selection-by-rank-of-a-local-field. I would run this before writing the selection cascade.

## 8. Exposable intermediate work

There is a tension here and I want to answer it rather than dodge it: my seat forbids intermediate
summaries, and this question asks what my intermediates are. The resolution is that **a summary
substitutes for the image; a field annotates it**. Everything this design computes is a full-resolution
map, and a full-resolution map is the most inspectable object in the problem — so this paradigm
exposes *more* than a clustering one, not less, and none of it is a candidate set.

Displayable beside the artwork, all already in memory: the **edge map** (enough for a reviewer to say
"you are seeing edges in a photograph's grain"); the **depth field** as a heat map; the **field mask**
at the chosen β, which makes parameter 3 visually arguable rather than numerically asserted; the
**t-parameterisation** as a false-colour image, which is the gradient claim made visible and directly
answers "one progression or two areas"; the **excursion curve**, a 1-D plot of distance-from-the-chord
against t, showing exactly why a third stop was or was not added; the **ink mask**; and the accent's
tier-1 and tier-2 masks, with tier-2 declared fragile.

Two are unusual enough to name separately. **Every published colour has a location**, because it is a
pixel: the reviewer can be shown a marker on the artwork saying "this is the pixel we published",
converting the correction channel from "this colour is wrong" to "not that pixel, *that* one" — a far
richer signal, and one the existing free-text note field could carry today. And **every published
colour has a rank position**, so "how far would we have to walk before we changed our mind" is a number
per role per artwork; a role sitting on a cliff is fragile and can be flagged before any reviewer sees
it. Neither needs a new instrument to be useful — both are an image and a number a human can look at.

## 9. What I asked for

**Two requests, both against stubs, and I proceeded on stated assumptions rather than waiting.**

**(a) From `ORACLE_QUESTION_SET.md`: the reliability of `has_text` and `text_dominance`, and nothing
else.** Free parameter 5 anchors the ink annulus ratio by sweeping against text-bearing strata, and
whether that anchor is worth anything depends entirely on whether those two fields are reliable enough
to *stratify* by. The inventory gave me their wording, which told me they exist; what was stripped is
the one thing that decides whether I can lean on them. **Assumption:** per `PHASE_0_DECISIONS.md` §6
they are never per-item truth but are legitimate as strata, so parameter 5's anchor is written as a
stratified sweep validated against the reviewer's own foreground endorsements rather than against the
labels. If they are poor even as strata, the anchor becomes a small review round — more expensive, not
blocking.

**(b) From `ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md`: the corpus rendition-size distribution.** §5's
cost is linear in pixel count, so a per-file figure is meaningless without knowing what a typical file
*is*, and the stub says that document's §7 carries a corpus survey. This is the one place a withheld
document directly weakens a section the brief asked me to be honest about. **Assumption:** I quoted
cost as a per-pixel rate with three worked sizes, so the estimate is re-derivable against any size
distribution rather than being wrong for the real one.

Nothing was needed from `REVIEW_UI.md` or the review-server README; both stubs say so, and both are
right.

---

**One packet note.** `PHASE_0_DECISIONS.md` §6's closing pointer to §8 lands in removed text; the
manifest flags it as a known dangling reference, so it is disclosed rather than contradictory. Nothing
else contradicted itself in a way that affected this design. The one live tension I built on is worth
restating: the same-colour criterion is anisotropic toward chroma and the accent-function criterion
toward lightness, same space, opposite directions. §2.6 honours both without pooling them — the
qualification uses the identity ruler, the ordering uses the functional direction, and they never
touch.
