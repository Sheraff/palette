# Arm D′ — No nominations

*An architecture proposal for the v3 album-artwork palette. Pixels only.*

---

## 1. The paradigm

**Every pixel of the artwork is a candidate for every role, from the first instruction to the last, and the published palette is four argmaxes taken over the full pixel index set.** No shortlist is ever drawn, no colour is ever grouped with another colour, and no ideal colour is computed and then snapped to something nearby. The claim someone can disagree with is this: *the information the reviewer uses when judging a palette lives in per-pixel spatial statistics — how large and how flat the region a pixel sits in, how far its colour stands from its own surround, whether its neighbourhood is a ramp or a texture — and a colour-frequency inventory is not a compression of that information but a replacement for it.* A histogram knows that a colour occurred 4,000 times; it has already thrown away that those 4,000 pixels are the interior of one letterform. That is the fact the reviewer is looking at. Arm D′ bets that if you never throw it away, you never need a repair stage to put it back.

**Where I drew the intermediate-summary line: invertibility.** A structure is a *summary* if it is many-to-one over the pixel array — if you cannot, in principle, reconstruct the image from it. A structure is a *field* or a *view* if it is one-to-one, or one-value-per-pixel. Concretely, and answering the brief's own probes:

- A **histogram** is many-to-one over pixels. Forbidden — and forbidden not on a technicality but because it destroys the exact thing this paradigm runs on.
- A **cumulative distribution stored as a table** is many-to-one, so the object is forbidden; but a pixel's **rank** on some scalar is one value per pixel, so the field is allowed. I use ranks heavily and never tabulate them.
- A **spatial gradient field** is one value per pixel. Allowed, and central.
- A **sorted array of pixels** is a permutation. Allowed; it destroys nothing when the index is carried.

The operational form of the line, which is what an auditor should check: **no data structure in this algorithm is indexed by colour, and the only things that exist in memory are per-pixel arrays, permutations of the pixel array, and a fixed number of scalar accumulators.** That single sentence rules out k-means centroids, median cut, octrees, quantisation, top-N-frequent lists, candidate pools, and lookup tables of any kind. It is also the mechanism by which specific pixels get selected without a candidate set: **selection is always `argmax` over the pixel index set of a scalar built from per-pixel fields**, so the winner is an exact 8-bit triple of the artwork by construction rather than by a snapping step afterwards. §3's exact-pixel requirement is not satisfied at the end; it is unfalsifiable-by-construction from the start.

There is one soft joint and I name it here rather than bury it. Counting how many pixels lie within one same-colour bar of a given pixel is most cheaply implemented over a colour-sorted pixel array with identical keys run-length collapsed. Run-length encoding of a sorted array is invertible, so it is inside the line — but it is exactly the shape a candidate set would wear if it were smuggled in. My commitment: it is an **implementation of a count, never a set anything is chosen from**, and the checkable form of that commitment is an equivalence test — the algorithm's output must be bit-identical when the run-length implementation is replaced by a naive per-pixel scan. If that test ever fails, I have broken my own seat.

---

## 2. Image to contract

### 2.1 What is computed, once, from one cold file

Decode at native resolution through the pinned decoder; dimensions from the header. Refuse genuinely transparent input loudly, per §1 and invariant 5. Convert to OKLab, then scale the axes so that a same-colour difference is roughly unit length — I use the direction weights from `perception-4` as a *shape* (lightness less salient than chroma and hue by roughly three), never as a verdict, and nothing below depends on the exact weights or the exact bar, because the bar is used only as a smoothing scale and as a tie band, never as a threshold that decides a role. Call the resulting per-pixel coordinate `ĉ(p)`, and call one unit of it *one bar*.

Then six per-pixel fields, each one value per pixel, each computed from summed-area tables over integer channel values (exact, hence order-independent, hence trivially satisfying the determinism and iteration-order gates):

- **π(p), corroboration scale.** The largest radius `r` at which `ĉ(p)` stays within one bar of the mean colour of the disc of radius `r` centred at `p`. Measured in fractions of the long edge, with a floor at one pixel. This is the field that answers "does this colour belong to the artwork", and it answers it *spatially* rather than by rarity: a lone JPEG-ringing pixel disagrees with its immediate neighbourhood and scores zero; the interior pixel of a two-pixel-wide letter stroke agrees with its neighbourhood at one pixel and scores small-but-nonzero; a background pixel agrees out to a quarter of the frame. Note the useful accident: a *symmetric mean over a linear ramp equals the ramp's value at the centre*, so π stays large across a smooth gradient. Field membership therefore covers flat fields and gradients with one field and no case split.
- **ρ(p), ramp strength**, and **φ(p), residual roughness.** At scale π(p), fit colour as a linear function of position (all six moments come from the same summed-area tables). ρ is the magnitude of the fitted colour gradient in bars per unit length; φ is the fraction of local variance the linear fit fails to explain. Flat field: ρ≈0, φ≈0. Smooth ramp: ρ large, φ≈0. Texture, grain, scene: φ large.
- **ψ(p), surround separation.** Distance in bars from `ĉ(p)` to the mean colour of a wide disc around `p`. High for text, for icons, for anything that stands out from what is behind it — and it answers "what is behind this pixel" without segmenting anything, because it asks the question of the pixel rather than of a region.
- **σ(p), bar support.** The fraction of the image's pixels lying within one bar of `ĉ(p)`. The corpus fact that anchors this choice is in the brief's §4: the median endorsed role colour occupies **8.89e-5** of its image as an exact triple but **1.91e-2** within the same-colour bar. Endorsed colours are, as exact triples, rare. Any design that ranks exact triples by frequency is measuring the wrong quantity by two and a half orders of magnitude; support must be a bar-neighbourhood measure, and mine is.
- **λ(p), rank fields.** Each of the above, converted to the pixel's percentile within this image. This is the parameter-honesty move and it is load-bearing: percentiles are unit-free, scale-free and knee-free, so **combining evidence requires no weights and no conversion constants**. Every role objective below is a *product of percentiles*, not a weighted sum, and there is consequently nowhere for a hundred tuning constants to live.

Three image-level accumulators, each O(1): the total field mass (the sum over pixels of their fieldness), the 2×2 structure tensor of the fitted colour gradient over field pixels, and the extent of the field along that tensor's principal axis.

### 2.2 The gradient boolean, and the ramp

The field is a gradient when its mass is carried by pixels with high ρ and low φ — a single image-level ratio of accumulators, compared to one decision point (free parameter 3). No fitter, no model selection, no candidate ramps.

If it is a gradient, the structure tensor's principal eigenvector gives the ramp axis in the image plane; projecting each pixel's position onto it and normalising over the field's own extent gives **t(p) ∈ [0,1]**, a per-pixel field. Orientation is fixed by one stated rule: **t runs from the end carrying more field mass to the end carrying less**, so the dominant field is the background and the contract's `stops[0] == background` is satisfied by construction rather than by a check. Geometry is opportunistic per §2 of the decisions: I never publish the axis, because the consumer renders 135° regardless; the axis exists only to order two pixels. When the tensor is isotropic (a vignette or a radial glow), t falls back to normalised distance from the field's centroid of ρ-direction — same downstream code, no extra role logic.

### 2.3 The four roles

Each role is one argmax over every pixel. Feasibility factors mask the domain; percentile products order it; **ties smaller than one bar are not ties broken by a weight but by the next criterion in a stated lexicographic order** — which is how a would-be weight becomes an ordering and stops being a number.

- **Background.** Maximise the product of percentiles of π and of σ, over pixels with low φ, and — if a gradient was declared — weighted toward small t. In words: *the most representative pixel of the largest, flattest, best-supported region, at the ramp's dominant end.* Notice what has replaced snapping. v2-3-shaped systems compute an ideal field colour and then find the nearest real pixel; here no ideal colour is ever computed, and the winner wins by already representing its neighbourhood better than any other pixel does.
- **Surface.** If a gradient was declared: the same argmax at large t. If not: the same argmax restricted to pixels more than one bar from the background — the second field. If the winner's fieldness percentile falls below the second-field floor (free parameter 2), **surface collapses to exactly the background** and, per the contract, no gradient can be published.
- **Foreground.** Feasible pixels are those with π above the one-pixel corroboration floor and clearing `minTextContrast` against the background, the surface, *and every point of the interpolated ramp*. Among them, maximise the product of percentiles of APCA contrast against the field, of σ, and of ψ. Ties within a bar go to the larger σ. The `ψ` factor is what makes the artwork's own text colour usually win when the artwork has text, without any text detector existing anywhere in the design.
- **Accent.** Feasible pixels are corroborated, more than one bar from the field roles, more than the inherited foreground↔accent separation from the foreground, and clearing `minAccentContrast` over the whole ramp. Among them, maximise the product of percentiles of chroma relative to the field, of **lightness movement relative to the field**, and of σ. That second factor is `perception-4`'s finding used as a direction and not as a coefficient: at matched OKLab distance an accent that also moves in lightness works about twice as often, and the honest way to spend a direction is as a preference order, not as a threshold. If the best feasible score falls below the accent floor (free parameter 5), **accent collapses to exactly the foreground.**

Contract floors act as **feasibility masks on the argmax domain, never as a repair stage.** This is an architectural claim, not a convenience: there is no post-hoc fix-up, so the meta-rule that "any repair re-validates the entire palette" has nothing to apply to, and the parameter requirement that defaults be byte-identical to the unparameterised algorithm is satisfied by defining the unparameterised algorithm to carry the ε mask. Raising a floor can only shrink one domain, so the zero-collateral requirement is structural too.

### 2.4 Stops

Two stops are the two field roles, already chosen. A third is admitted only under the guide-stop semantics. Sample the straight OKLab segment between them; at each sample ask how far it is from the nearest pixel of the artwork — a nearest-neighbour query over the colour-sorted pixel array, a few dozen queries, no structure indexed by colour. If the maximum excursion exceeds the contract's excursion bar, add exactly one interior stop, chosen as the **argmax over every pixel of excursion reduction, subject to the two-segment path's curvature being the smallest among pixels achieving that reduction** — the flattest path that stays on the artwork, which is the ruling's own phrase. A stop that does not reduce excursion by more than one bar is not admitted, which forecloses meandering and colourspace-coverage motives mechanically. A fourth stop is not reached for; the ruling makes it negotiable on proven utility and I have no utility to prove.

### 2.5 The escape, alpha, and colour vision

The white/black escape is reachable in exactly one situation my architecture can produce: an artwork containing no pair of pixels separated by more than one bar. Then background is the single colour, foreground is whichever of `#ffffff`/`#000000` is genuinely absent and gives contrast, surface and accent are collapsed, and `palette.escape` is declared. Anything less degenerate finds a feasible foreground pixel.

**Alpha.** The contract refuses transparent input, so this is a view rather than a behaviour — but the brief asks, and my paradigm has a native answer that needs no matte colour at all. Every quantity I compute is either a weighted accumulation over pixels or a per-pixel field, so **alpha enters as a per-pixel confidence weight** multiplying a pixel's contribution to surrounds, means and support, while a pixel with α < 1 is ineligible for publication because its colour is not a colour anyone sees. No white matte, no black matte, no blend, and zero new parameters. The question "what matte does an alpha region get" is one my architecture does not have to answer, which I take as evidence for the architecture rather than for the answer.

**Colour vision.** I ship no CVD diagnostic and propose no scoring axis. I note only that the accent objective's preference for lightness movement is, incidentally, the dichromacy-robust preference — an accent separated from its field in lightness survives protanopia and deuteranopia, one separated only in hue does not. I would rather get that as a by-product of a measured perceptual finding than as a bolted-on filter, and I claim nothing more for it.

---

## 3. Where the decisions live

Five places, and they are all small and all named.

1. **The ruler.** The perceptual metric and its identity scale are inherited from the contract, not invented here. My design consumes the bar as a *smoothing width and a tie band*, never as a verdict, so it inherits none of the bar's open questions — §3.1's warning not to depend on the bar's exact value is satisfied by not depending on it.
2. **The corroboration floor** — the one place where "does this colour belong to the artwork" is decided. §3.1's open question 2 says no computable rule matches the reviewer's sense of belonging and nothing has replaced the demoted rarity rule. My answer is that belonging is *spatial corroboration*, not rarity, and it is a claim I am prepared to be wrong about; it is the single most substantive judgment in this proposal.
3. **The four gates** — surface collapse, the gradient boolean, third-stop admission, accent collapse. Each is one number compared to one image-level ratio. They are the only places where the algorithm says "not enough", and they are countable, loggable and individually falsifiable.
4. **The orientation rule** — that background is the ramp end with more field mass. A discrete choice, not a number, made once and stated.
5. **The role objectives themselves** — which percentiles multiply into which role. This is the design's real content, and it is deliberately concentrated into four one-line formulas so that arguing with the design means arguing with four expressions rather than auditing a pipeline.

What is *not* a decision anywhere: relative weights, unit conversions, soft knees, per-family branches, semantic classes. Frames, overlays and giant text are not special-cased; a frame is a field with high π that fails the mass test, an overlay badge is a small high-ψ region that competes for accent on its merits, and giant text is a high-ψ region with large π that will win foreground and might win a field role — which, if the reviewer disagrees, is a fact about my objectives that a review round will surface directly.

---

## 4. Free parameters

Five, plus one inherited. Each is one independent decision a human must make, with what would anchor it.

1. **The corroboration radius floor** (~1 px). Anchored *without the reviewer*: sweep it against the robustness harness's `jpeg-q92` and `dither-lsb1` arms and take the smallest radius at which π is stable under both. This is a genuine pixel-scale phenomenon (decoder and compression noise), which §1 permits as an absolute pixel constant provided it is individually justified and tested under the resolution ladder — and the ladder is exactly the test that would catch me if it is not.
2. **The second-field floor** (surface collapse). Anchored on a review round of borderline one-field/two-field artworks, read against the collapse-rate distribution census.
3. **The ramp decision point** (gradient boolean). Anchored on a review round of borderline flat-versus-shaded artworks, with the gradient-rate neutrality census as the corpus-level guard against drift in either direction.
4. **Third-stop admission** (required excursion reduction). Anchored on the contract's excursion bar as a starting value, and properly on a round with *ramp* stimuli — `perception-4` was explicit that the 2.5× multiplier becomes more open, not less, and must not move as a side effect of the identity bar moving.
5. **The accent floor** (accent collapse). This is the one I expect to be unable to anchor cleanly, and I say so in advance: the quantity has refused measurement twice and is `stratum-dependent`. My mitigation is architectural rather than numerical — the floor is used *only* as a collapse gate, never inside the ordering, so a mis-set value changes how often accent collapses and never which accent is chosen. A parameter whose error mode is confined to one boolean is a cheaper parameter than one that steers a selection.

**Inherited, not mine:** the same-colour bar and its region structure. I list it because my design depends on its *existence*, and honesty about dependence is the point of the count.

**Not parameters, and here is why:** the dyadic scale ladder (determined by image size, from one pixel to the frame); the ramp sample count (refined to convergence at bar resolution); the sort-order variants used to count neighbours (an implementation detail bound by the equivalence test in §1); the combination rule (products of percentiles admit no weights). If I am fooling myself anywhere, it is most likely here, and the honesty scanner is the instrument that would catch it.

---

## 5. Cost

**Pixel count priced: 1,440,000 pixels (1200×1200), with 409,600 (640×640) given alongside.** I do not know the corpus's long-edge distribution — it is not in my packet — so I price per megapixel and let the reader scale.

Per-pixel work, cold, single-threaded TypeScript: sRGB→OKLab with a per-channel linearisation table and an approximated cube root, roughly 80 flops; six integer summed-area tables at about 12 operations per pixel to build; five dyadic scales of local mean, variance and linear fit at roughly 120 row-coherent table reads per pixel, which is the dominant term; a three-pass radix sort on the 24-bit colour key; five or six O(N) argmax sweeps; and, only when a ramp is declared, one pass of a few dozen operations per pixel for the interior-stop search.

That comes to roughly **0.4–0.9 s per megapixel on one core**, plus decode. So **≈0.2–0.4 s for a 640×640 file and ≈0.7–1.3 s for a 1200×1200 file**, cold, with no model to load and no warm state to miss. Every stage is either a local operator or an accumulator sweep, so it parallelises across raster bands almost perfectly; on four cores the 1.44 MP case is ≈0.2–0.4 s. Memory is about 60–80 MB of tables at 1.44 MP.

The argument proportionate to where that lands: this is ordinary per-file image code — linear in pixels, no model, no cold-start penalty beyond the decoder, no I/O beyond the file, and nothing precomputed anywhere. It sits comfortably below the seconds-scale bracket the reviewer called slow, and I am not asking for the "very good reasons" allowance.

**The honest bad news, which I will not price away.** Cost is linear in pixels and §1 forbids resampling, so a 3000×3000 rendition costs 4–9 s single-threaded and *does* enter the exceptional bracket — purely from the no-resampling rule, not from anything my paradigm chose. The contract's own escape (proved palette-equivalence above some width W) is the only lever, and I do not claim it, because claiming it would require the measurement that makes it admissible and I have not made it. What I will say is that this paradigm is unusually well placed to *earn* that escape later: every field it computes is a scale-space quantity with a known behaviour under resampling, so palette-equivalence above W is a testable proposition here rather than a hope.

---

## 6. Build cost

Six pieces, none of them research: decode and colour conversion; the summed-area machinery and the five per-pixel fields; the colour-sorted support count; the four role objectives and their argmaxes; ramp orientation, stops and the whole-ramp contrast minimisation; contract emission with collapse and escape declarations. Call it 1,200–2,000 lines of TypeScript, with no dependency beyond the pinned decoder — nothing here needs a numerical library, and nothing is ported from v2-3 because nothing in v2-3 has this shape.

**To real palettes on a twenty-cover dev-loop set: two to four days.** To running clean through the contract invariants, the robustness harness and adjudication over the 200-artwork coverage set: **one to one and a half weeks**, most of it spent on the whole-ramp contrast minimisation and on the resolution-ladder testing that free parameter 1 owes. After that the schedule constraint is not code at all — it is the **three review rounds** that anchor free parameters 2, 3 and 5, and reviewer bandwidth is the campaign's binding constraint, so that is the number that matters.

---

## 7. Expected failures and falsifier

**Expected failures.** Full-scene photographs with no readable field: π never gets large anywhere, the background argmax is decided by a weak margin, and I expect visible instability there — this is the class where I expect to be worst. Heavy grain, film texture and halftone: φ is high everywhere, fieldness collapses, and the background may come from an accidentally smooth patch. Radial and conic ramps: my structure-tensor axis degenerates and the fallback t is cruder than the linear case. And a specific architectural risk I want on the record before the prototype: **foreground is chosen before accent, so a greedy lockout is possible** — a foreground that consumes the region an endorsed accent lives in, forcing a collapse that should not have happened. Auto-adjudication's reachability report is exactly the instrument that would expose it, and I expect this to be the first thing I have to fix.

**Falsifier for the paradigm rather than its tuning.** The central structural claim is that an argmax of a bar-smoothed field is bar-stable: because every score is Lipschitz in the pixel data at the smoothing scale, near-ties can only occur between pixels whose colours are near-identical, so the winner may change while the *published colour* does not move by more than one bar. **If the robustness harness shows, on the `dither-lsb1` and `jpeg-q92` arms, that the winning pixel's colour moves by more than one same-colour bar on a material fraction of the corpus while the score fields themselves move far less, that claim is false and the paradigm's whole robustness argument fails.** No amount of re-weighting recovers it, because the argument is about the smoothness of the objective, not its content.

A second, independent falsifier, on the completeness side: my paradigm's colour set is every pixel, so reachability against the endorsed corpus is 100% by construction and carries *no* information about my arm — I claim nothing from it. What does carry information is whether the endorsed colours are **rankable**: if a material fraction of the reviewer's endorsed role colours sit in the low percentiles of every one of my five fields — neither corroborated, nor supported, nor separated from their surround — then per-pixel spatial statistics do not carry what the reviewer is using, and the bet in §1 is simply wrong. That is measurable today, on the legacy fixtures, before a single palette is emitted.

---

## 8. Exposable intermediate work

The tension is real and worth stating: a paradigm whose whole claim is "no intermediate summary" is a paradigm that might have nothing to show. The answer is the opposite, and it falls out of the invertibility line. **Every intermediate this design produces is an image the same size as the input.** π, ρ, φ, ψ, σ and t are all viewable as maps; so is each role's score field. A reviewer looking at a palette can be shown *where in the artwork each published colour came from* — a marked pixel on the cover, which is a more concrete thing to disagree with than a cluster centroid has ever been.

Two of these are instruments rather than pictures. The **margin map** — the gap between the winning score and the best score outside one bar of the winner — predicts per-role instability *before* the robustness harness measures it, which makes the paradigm's own falsifier cheap to run. And the **feasibility mask** for each role shows exactly which pixels the contract's floors excluded, so an invariant that ever blocks an endorsed palette can be pointed at precisely, which is what the standing demotion rule needs in order to be exercised. Both are byte-stable and both are already in the shape the dev loop's viewer consumes.

---

## 9. What I asked for

Two things, both from withheld documents, both named because my design turns on them. I proceeded on stated assumptions and did not wait.

**First, from `ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md`: the storage format and resolution of the SAM mask artifacts, and what per-region fields they carry.** Not for runtime — I am not asking for runtime masking and I have no reason to take on that standing debt. For *development*: this proposal's central bet is that per-pixel spatial fields can stand in for segmentation, and the direct dev-time test of that bet is to correlate my π and ψ maps against SAM's masks over the corpus — do my field pixels coincide with the regions SAM does *not* claim, and do my high-ψ pixels coincide with the `words`/`letter`/`lettering` concept masks? Whether that validation is possible at all depends on whether masks are stored at artwork resolution or at the oracle's 640 px normalisation, which is exactly what I cannot see. **Assumption I proceeded under:** masks exist per image with per-region concept labels from the v2.1 ten-concept set, at a resolution adequate for field-scale structures. If they are only at 640 px, my field-scale validation survives and my text-stroke validation does not, and I would drop the second half rather than the whole plan.

**Second, from `ORACLE_QUESTION_SET.md`: the vocabulary of `shading_direction`.** The inventory gives me `shading_geometry` as `linear | radial_or_vignette | irregular`, which is precisely the distinction my structure-tensor orientation makes and fails at; `shading_direction` is listed by id only. It is a small ask. **Assumption:** it encodes a direction compatible with a principal-axis orientation, so the oracle can serve as a corpus-scale flag on my ramp axis. If it cannot, I lose a cheap check and nothing structural.

Nothing from the two review-channel stubs. Their own text says they are how a proposal is judged rather than machinery it must design against, and I agree.

---

### Two things in the packet I could not reconcile

**One contradiction, and it bears on my §3 decision 2.** `PHASE_0_DECISIONS.md` §4 states invariant 2 as requiring every published colour to meet "the population floor and spatial-spread test (thresholds need provenance; shape settled)". The brief's §3.1 open question 2 says the rule that dropped colours for being too rare "had no discriminating power at any setting, so it was demoted to a reported figure. Nothing has replaced it." So it is unclear whether an enforced population floor exists. This matters directly: it decides whether a rare-but-spatially-corroborated pixel is publishable, which is the crux of my corroboration answer. **I proceeded on the assumption that there is no enforced population floor and that belonging is my paradigm's problem**, which is what §3.1 says in as many words — and I note that the corpus fact in §4 (median endorsed exact-triple area share 8.89e-5) is hard to reconcile with any population floor set on exact triples.

**One smaller tension.** §2's contrast bullet quotes the 2026-08-04 ruling as *"about APCA contrast, not APCA **and** color distance"*, and then retains for the accent exactly one colour-distance escape running on `ACCENT_FUNCTIONAL_DISTANCE`. The document explains that only the identity of the distance changed, but the quoted sentence and the retained conjunction do not obviously agree. I designed to the retained machinery (the escape exists, on the functional distance) because that is what the invariants implement, and my accent objective's preference for lightness movement means I lean on the escape as little as the artwork allows. Separately, the brief's §3.1 cost bracket names the *exceptional end* with SAM's warm 2.7–4.3 s while insisting a few lines earlier that ~6.2 s cold is the only number to quote; I read the bracket as being anchored at 6.2 s and priced against that.
