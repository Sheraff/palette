# Arm B′ — the topographic parse

## 1. The paradigm

**An album cover is not a bag of colours with spatial statistics attached; it is a nested stack of regions, and the palette is a reading of that stack.** I propose to compute, from the cold file, the image's *topographic map* — the containment tree of the connected components of the level sets of three scalar channels — to select from it the nodes that are stable against level perturbation, and to call that filtered tree **the parse**. Roles are then read off the parse by *ordinal* rules over one shared pool of nodes: the ground stack gives background and surface, the mark population gives foreground and accent, the ground stack's geometry gives the gradient boolean and its stops. The disagreeable claim is this: **the regions a human can point at in an album cover are, with few exceptions, maximally stable extremal regions of L, a or b, and nothing else about the image needs to be modelled.** If that is false — if what people name are not extremal regions — this paradigm is wrong at the root and no amount of tuning saves it. That is the bet, and §7 says how to settle it.

The reason to make the bet is robustness (goal 1), and it is structural rather than hopeful. The tree of shapes is invariant under any strictly monotone change of the channel it is built on, and node selection is by *how little a node changes over a range of levels* rather than by where a threshold falls. There is no bin edge anywhere in the region-finding step, so there is nothing for a ±1-LSB dither or a re-encode to tip over. Clustering paradigms have a decision boundary between every pair of adjacent colours in the image; this one has none.

## 2. Image to contract

### 2.1 From bytes to three integer channels

Decode at native resolution (no resample; header dimensions only; transparent input refused loudly, not flattened — §3 says what I would do if that policy moved). Convert every pixel to OKLab. The sRGB→linear step uses a 256-entry table *computed at startup from the transfer function* — arithmetic, not a dataset, so the algorithm still never reads a table in the reviewer's sense.

Quantise each of L, a and b to integer levels, the count chosen so one level is smaller than the smallest measured same-colour threshold (`perception-4`'s pure-chroma 0.00717 in `dark-neutral`). **Quantisation is safe here in a way it is not for clustering**, and this is the property the design leans on: coarsening the levels of a tree of shapes *merges* nodes, monotonically — the node set at a coarser quantisation is a subset of the finer one. A coarser bin can never split a region in two, which is exactly what a k-means bin edge does.

Three channels, not one. A tree on L alone is structurally blind to an accent that is isoluminant with its field, and open question 1 says that case is real and is the fragile one. With trees on both a and b, a region is invisible to the parse only if it matches its surround in L *and* a *and* b — that is, only if it is the same colour, which is the correct blindness. The channels are a **paradigm commitment**, not a tunable.

### 2.2 The tree, and the stability filter

For each channel build the tree of shapes: the inclusion tree of the connected components of the upper and lower level sets, with the image rectangle as root (Monasse and Guichard's fast level-set transform; Géraud's quasi-linear variant is the one to implement). Every visually coherent region appears in this tree, which is what makes the structural-completeness claim (goal 3) available at all: the candidate pool is the *complete* topographic map, filtered only by stability, so no candidacy wall can make a colour structurally unpublishable.

During the union-find merge, accumulate per node: area, perimeter, bounding box, first and second spatial moments, Euler number (hole count), and the exact-triple histogram of its pixels. Then filter by **stability**, in the MSER sense: score node ν by the relative rate at which its area changes as the level moves, |ΔA| / (A · Δλ), over a window Δ, and retain the local minima of that rate along each branch — regions whose boundary is a real edge rather than an arbitrary iso-level. Stability is its own robustness certificate: a ±1-LSB dither perturbs λ by one unit, and a node selected for near-zero area derivative over a window many units wide cannot be moved by that.

Retain also, per node, an **inradius** from the Euclidean distance transform of its own mask, and from it a *thinness* ratio r_in / √A. Letterforms and strokes have small thinness; blobs and fields have large. It is scale-free, so it respects the resolution-agnosticism rule.

### 2.3 The representative colour of a node

Every published colour must be an exact 8-bit triple of the input, and naive snapping of a computed centroid is not how to get one. Instead: the representative colour of node ν is the exact triple t maximising

  Σ over pixels p in ν with colour(p) = t of d(p),

where d(p) is the distance from p to ν's complement, normalised by ν's inradius. In words: **the colour that occupies the interior of the shape**, weighted away from the antialiased and compression-smeared boundary. It is an argmax over a discrete set with a smooth weight, so near-ties are rare; under a dither the winning mode splits into two neighbours of equal depth-weight and the answer moves by one LSB, which sits inside the same-colour bar and so counts as agreement in the robustness harness. Ties break on the deepest pixel, then on raster index — canonical, so iteration order is not a degree of freedom.

### 2.4 The parse object

The parse is a small, inspectable structure:

- **Ground stack** — the retained nodes that are *fields*: shallow in the tree, area fraction above the field/mark split, mutually non-nested at their depth or forming one nested chain. Each carries area fraction, centroid and representative colour.
- **Field verdict** — one of {flat, laminar, partitioned, textured, unreadable}, from the stack's geometry (below).
- **Mark population** — the retained nodes nested inside a field, grouped into clusters by mutual same-colour proximity (the contract's own bar), comparable scale and spatial arrangement. Each cluster carries count, area fraction, mean thinness, mean hole count, the collinearity of its members' centroids, and the field it sits on.
- **Enclosure** — retained nodes that are annuli containing the rest: borders, frames, letterboxing bars. Named separately because a frame is a field-shaped node that is *not* the ground. The semantic classes the incumbent patched are all read off the same attributes: a frame is a node with a hole containing the root's other content; an overlay sticker is a compact, strongly rectangular node near a corner; giant text is a mark cluster with large area and small thinness.
- **Residual** — the pixels explained by no retained node. This is a node too (the complement, inside the root), and it carries the degraded cases.

### 2.5 The field verdict, and therefore the gradient boolean

A shaded field and a flat field differ in the *shape of the nested chain* under the dominant ground node, not in any colour fit:

- **flat** — the chain is short: area jumps from near-zero to near-full within a level span smaller than the same-colour bar. One tone.
- **laminar** — the chain is long, its area grows smoothly and monotonically with level, its boundaries carry low curvature energy (no repeated corners, no letterform signature), and **its centroid migrates monotonically along a fixed direction in image space**. That last condition is the gradient: a monotone spatial progression of tone. Measure it as the residual of the centroid trajectory about its own best-fit line, normalised by the trajectory's length.
- **partitioned** — the chain's area is discontinuous in level, jumping at the boundary between two distinct areas, and the centroid teleports rather than migrating. Two fields, not one ramp.
- **textured** — many retained nodes of similar small scale tile the ground; no dominant member.
- **unreadable** — retained nodes explain a small fraction of the image area.

`gradient` is true exactly when the verdict is **laminar** and the two ends of the chain are distinct above the same-colour bar. This is why a collapsed surface and a gradient are mutually exclusive *by construction* rather than by a check afterwards.

### 2.6 Assignment

All four roles are ranked over the *same* pool — the retained node set plus the residual — so there is no lane that cannot reach a role.

- **background and surface, laminar case.** The two ends of the chain. Which is which is decided geometrically, not by taste: the consumer renders `linear-gradient(135deg in oklab, …)`, whose first stop sits at the top-left. Project each end's centroid onto that axis; the top-left end is stop 0, hence `background`, and the other is `surface`. The rendered ramp then tracks the artwork's own spatial progression. When the artwork's progression runs perpendicular to 135° the margin is near zero and the choice is weakly determined; the declared tie-break chain is larger area, then lower L — canonical and stable, not tuned.
- **background and surface, otherwise.** Partitioned: background is the larger field, surface the second — ordinal. Flat: surface collapses to background, exact equality, flag set.
- **foreground.** The mark cluster best satisfying text-ness, ranked *lexicographically* — thinness, then member count, then centroid collinearity — rather than by a weighted score, so there are no mixing weights to tune.
- **accent.** The remaining mark cluster with the greatest chromatic distance from the field it sits on, with lightness movement as the tie-break — the ordering `perception-4` earned the right to state as a direction, without pretending to a coefficient. If no remaining cluster clears the distinctness bar from the foreground, the accent collapses to it, exactly, flagged.
- **stops.** Ends are fixed by the contract. Then the guide-stop rule, computed literally: sample the OKLab straight segment between the two ends; for each sample find the nearest colour that actually occurs in the field; if the maximum such excursion exceeds the excursion bar, insert **one** interior stop at the argmax position, taking the field's actual chain colour at that parameter — an exact pixel — and re-test. A fourth stop only if it again reduces the maximum excursion by a margin worth arguing, which is the packet's "negotiable on proven utility". Meandering is not expressible, because a stop is only ever placed at the argmax of an excursion the previous configuration failed to cover.
- **the escape.** Reached only when the parse degenerates to a single field node with no mark cluster and no second field — a solid-colour cover. Background is that colour, surface collapses, foreground is pure black or white, whichever clears the APCA floor — *after* checking the literal is genuinely absent from the artwork's exact triples. If it is present, it is used as an ordinary source colour and no escape is declared.

### 2.7 What happens when the parse is wrong

A parse is a claim, and this one will be wrong regularly. The design's answer is that **degradation is per role, down the same tree, and never a second algorithm.**

- Verdict `textured` or scene-like: the ground stack has no dominant member, so background and surface fall back to the *root's* retained children ranked by area — still nodes, still exact interiors, still a coherent answer.
- Verdict `unreadable`, or an empty mark population: foreground and accent come from the **residual**, treated as one node, choosing among its own exact triples the one maximising APCA against the background.
- A violated invariant at assembly is repaired by **taking the next item in the same ranking**, never by inventing or adjusting a colour. This is why repairs here should not relocate the defect the way the incumbent's did: the repair moves within one ordered pool, and the whole palette is re-validated after it.
- The characteristic failure is therefore a *different valid palette*, not an invalid one. Under the reviewer's standing principle that many palettes are valid, a wrong parse mostly costs a win signal rather than producing a loss signal. I would rather be wrong that way than any other.

## 3. Where the decisions live

Four places, and they are deliberately far apart.

1. **Region-finding** makes no judgment calls. The tree is a canonical object; stability is a ranking. This is the largest part of the computation and holds none of the taste.
2. **The field/mark split and the field verdict** hold the two judgments deciding the palette's *shape* — whether there is a second field, whether there is a ramp. Both are decisions about the parse, made before any colour arithmetic, and both are reviewable without showing anyone a palette.
3. **Assignment** holds the two orderings deciding which cluster is text and which is accent. Orderings of keys, not weights — a deliberate reduction of what can be tuned.
4. **The representative-colour rule** holds one judgment about what a region's colour *is*, defined once for all four roles.

Nothing decides whether a colour "belongs" to the artwork in the sense of open question 2, and nothing needs to: a colour is published if it is the interior colour of a stable region, and "stable region" is the whole of the belonging criterion. That replaces an unmeasurable rarity rule with a structural one — an untested substitution, but a falsifiable one.

**Transparency.** Under the current policy there is nothing to do: transparent input is refused. If that moved, this paradigm's answer is *do not matte, re-root* — alpha is a fourth scalar field, its tree's fully-transparent component touching the border is the outside, and the parse's root becomes the largest opaque component rather than the image rectangle. No invented matte colour ever enters the pixel data.

**Colour-vision deficiency.** I do not propose shipping a diagnostic. If it became a criterion, its natural form here is structural: simulate the deficiency and ask whether the accent's node *survives as a stable extremal region* in the simulated channels — a question about the parse, computable with machinery already built.

## 4. Free parameters

Eight independent decisions a human must make. Five are magnitudes, two are orderings, one is a rule choice.

| # | decision | kind | what anchors it |
|---|---|---|---|
| 1 | the stability window Δ — the level span over which a node's area must be near-constant | magnitude | tied by construction to the contract's same-colour bar, expressed in channel units. The decision is the *tying*, not the number |
| 2 | the stability admission cut — how flat "near-constant" is | magnitude | a review round over ranked borderline nodes: "is this one region?" Cheap, because the stimulus is an outlined region, not a palette |
| 3 | the field/mark area split | magnitude | the reviewer's own "fields are large areas": a round asking, of a highlighted region, "is this ground, or a mark on it?" |
| 4 | the laminarity cut — how straight and monotone the centroid trajectory must be | magnitude | directly reviewable, and it is the gradient boolean: rendered flat against rendered ramp, which the review channel already shows side by side |
| 5 | the excursion bar for admitting an interior stop | magnitude | the same quantity as the census's P1 excursion bar, whose multiplier the packet records as undecided; a ramp round settles both at once |
| 6 | the text-ness key order (thinness → count → collinearity) | ordering | a round: "which highlighted region is the text?" |
| 7 | the accent key order (chroma-from-field leads, lightness movement breaks ties) | ordering | `perception-4`'s directional finding, taken as a direction and never as a coefficient |
| 8 | the representative-colour rule (depth-weighted modal triple) | rule choice | measurement, not taste: whichever candidate rule moves least across the robustness harness's four arms |

Not introduced, because consumed: the same-colour bar and its regional structure, the APCA ε floors, `ACCENT_FUNCTIONAL_DISTANCE`, `MAX_GRADIENT_STOPS`. Paradigm commitments rather than parameters: the three channels, OKLab, the tree of shapes as region primitive, and the level counts (derived from the smallest measured same-colour threshold, not chosen).

Honest exposure: decisions 2, 3 and 4 are the ones that would drift under pressure, each being a single number that visibly moves many palettes. Decision 4 is the one to calibrate first and re-check most often.

## 5. Cost

**Priced at 1,000,000 pixels** — a 1000 × 1000 JPEG, a mid-corpus rendition. Cold, single file, nothing cached, TypeScript over typed arrays.

| stage | estimate |
|---|---|
| decode | 10–30 ms (unavoidable, paradigm-independent) |
| sRGB → OKLab, three channels quantised | 15–40 ms |
| three trees of shapes with attribute accumulation | 200–450 ms |
| stability filter and per-node distance transforms, over retained nodes only | 100–300 ms |
| representative colours (exact-triple histograms over retained interiors) | 50–150 ms |
| parse assembly, verdict, clustering, stop fitting, contract validation | 20–50 ms |
| **total** | **≈ 0.4–1.0 s**, first honest implementation |

That lands where the brief says an argument is owed, so here it is. This is **ordinary per-file image code**: no weights, no model load, no second process, no dependency beyond the decoder. It is roughly a sixth of the ~6.2 s cold figure the reviewer called slow, and unlike that figure it carries no fixed load cost — all of it is proportional to pixels, and all of it is linear passes over typed arrays that parallelise trivially across the three channels. An optimised implementation should reach **200–400 ms** at 1 MP without changing the design, since the three tree builds are independent and the per-node passes touch each pixel a small constant number of times.

The honest problem is the no-resampling rule. At a 3000 × 3000 master — 9 MP — this is **4–9 s**, squarely in the territory the reviewer called slow, and I will not pretend otherwise. Two things about it. The cost is linear in pixels with a small constant, so it is predictable rather than cliff-shaped. And this paradigm is unusually well placed to *earn* §1's downscale-above-W carve-out, which is admissible on measured proof of palette-equivalence: the tree of shapes is scale-stable by construction, and the stable nodes of a downscaled image are the stable nodes of the original minus those whose support fell below resolvability — precisely the "informed" class the cross-rendition metric already separates from "chaotic". Supplying that proof is a measurement, not an argument.

## 6. Build cost

Roughly **three focused weeks** to emit real, contract-complete palettes over the coverage set, staged so trajectory is readable early:

- **Days 1–5.** Tree of shapes on integer levels: union-find over sorted levels, attribute accumulation, canonical tie-breaks, tested against a brute-force reference on small images. The only genuinely hard implementation here, and the only piece with real correctness risk.
- **Days 6–8.** Stability filter, distance transforms, thinness, Euler number, representative colours. At the end of this stage the "parse image" (§8) exists and can be looked at, before any palette does.
- **Days 9–14.** Parse assembly: ground stack, field verdict, mark clustering, enclosure, residual. This is where the design risk lives, not the implementation risk.
- **Days 15–18.** Assignment, stops, collapses, escape, contract emission and validation.
- **Days 19–21.** Wire into the dev loop and the robustness harness; first adjudication run with `availableColors` supplied so reachability is assessed from day one.

A cheaper first signal is worth taking: **one week** gets the L-tree only, flat palettes only, no gradient and no chromatic channels — enough to run the robustness harness and the reachability half of adjudication, and therefore enough to test both load-bearing claims (§7) before the other two weeks are spent.

## 7. Expected failures and falsifier

**Expected bad at:** heavy film grain, halftone and dithered or posterised art, where level sets are genuinely fragmented and the ground's own stability collapses; photographic covers with no readable ground, where the stack degenerates and "background" becomes whichever large smooth region (sky, skin, wall) was dominant, which may not be what a person means; very low-contrast art whose field variation sits below the stability window, which will read flat where a person sees a ramp; and busy collage, where the mark population fragments into clusters no ordering separates cleanly.

**Falsifier for the paradigm.** It asserts that the colours humans endorse are interior colours of stable nodes, and adjudication's reachability check measures exactly that if the run supplies `availableColors` as the node-representative set. **Pre-registered, before seeing any result: if more than 25% of the 1,397 endorsed legacy role colours are unreachable from the node-representative set while remaining reachable from the set of all exact triples meeting the same area floor, the parse is not finding what people point at, and the paradigm is wrong rather than under-tuned.** The comparison against the all-triples set is what makes it a test of the *parse* and not of the exact-pixel rule.

**Falsifier for the robustness claim,** which is separate and deserves its own line. Contrast invariance plus stability selection predict *near-total* invariance under a ±1-LSB dither, not merely an improvement on 0-of-114. **Pre-registered: if more than 10% of palettes move under the `dither-lsb1` arm, the structural robustness argument is wrong** — and that argument is the design's main reason for existing, even if its palettes are good.

## 8. Exposable intermediate work

This paradigm's intermediate products are unusually inspectable, and most of them can be looked at *before* any palette exists.

- **The parse image.** Every retained node filled with its representative colour, boundaries drawn. Beside the artwork it asks "is this what the picture is made of?" — a question about structure, with no palette in it and no role vocabulary to learn.
- **The ground stack** as a swatch strip with area fractions, and the **field verdict with its margin** — how far the laminarity statistic sat from its cut. A verdict that is right narrowly looks different from one that is right comfortably.
- **The verdict maps onto the oracle's `ground_type` vocabulary** (flat ↔ `flat_field`, laminar ↔ `shaded_field`, partitioned ↔ `multiple_distinct_fields`, textured ↔ `pattern_or_texture`, unreadable ↔ `none_discernible`/`full_scene`), so P6's three-bucket cross-check runs corpus-wide against the parse itself, consuming no reviewer time and flagging contradictions before a palette is graded.
- **Mark-cluster contact sheets** — crops of the cluster called text and the cluster called accent. The cheapest possible review stimulus for decisions 6 and 7, and it needs no palette either.
- **The excursion curve** for a gradient: distance from the OKLab straight segment to the nearest on-artwork colour as a function of t, with the admitted interior stop marked at its argmax. It makes the guide-stop rule visible as the thing it is, and makes meandering visibly absent rather than merely disclaimed.
- **A per-colour reachability trace**: for any endorsed colour, which node it represents, or the nearest node representative and its distance. This turns §7's falsifier from a corpus rate into a per-file explanation.

## 9. What I asked for

**Two things, both from the withheld oracle documents.**

**First, from `ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md`: the shape of the SAM masks on this corpus** — regions per image, their size distribution, and whether they are predominantly *non-crossing* (nested or disjoint) or predominantly overlapping partial-object masks. My central claim is that human-nameable regions are stable extremal regions, and the dev-time SAM masks are the only existing artifact that could support or falsify it *before three weeks are spent*: I would measure IoU between my retained node set and SAM's regions across the corpus, and a low ceiling would be an early, cheap "this is the wrong region primitive". Dev-time only; nothing about it enters the runtime.

*Assumption I proceed under:* SAM's regions here are predominantly connected and non-crossing at a handful of scales per image, so a containment tree can express them. If they are predominantly crossing, my node set still *covers* them — the topographic map is complete — but my ranking is mis-specified, and the failure would show as good coverage with poor role assignment rather than as unreachability.

**Second, from `ORACLE_QUESTION_SET.md`: the derivation table from the six ground probes to `ground_type`.** My field verdict is a five-way categorical over exactly those distinctions, and knowing how the campaign derived one from the other would let me align it to a cross-check that already exists rather than inventing a sixth vocabulary. *Assumption I proceed under:* the mapping in §8, from the published vocabulary and per-value definitions in my packet.

**Nothing was asked of `REVIEW_UI.md` or `src/review-server/README.md`** — the stubs are right that the review channel is how a proposal is judged, not machinery a proposal designs against.

---

### Two things in the packet that did not cohere

**The SAM cost figure is quoted two ways in one section.** `PHASE_1_AUTHOR_BRIEF.md` §3.1's cost-bracket bullet prices the exceptional end at "roughly 2.7–4.3 s per image", while its SAM bullet a few paragraphs earlier insists the *cold* ~6.2 s is "the number to quote" and that 2.7–4.3 s is warm context. The bracket is anchored on the number the same section says not to cite. §5 is priced against the cold figure.

**The accent's contrast rule and the reviewer's wording of it point different ways.** `PHASE_0_DECISIONS.md` §2 quotes the reviewer, 2026-08-04: the accent's contrast limit "should be about APCA contrast, not APCA **and** color distance" — then, in the same bullet, keeps the accent's escape as a pointwise conjunction of APCA and `ACCENT_FUNCTIONAL_DISTANCE`, as invariant 4 also does. Read literally, the ruling removes the second dimension and the implementation keeps it. I designed against the conjunction, since that is what is enforced; flagged because a paradigm leaning on the colour-distance escape leans on the disputed half.

**A minor manifest mismatch.** `MANIFEST.json` lists `ground_type` among the questions carried "by id only"; `catalog/ORACLE_QUESTION_INVENTORY.md` §A.1 carries its full vocabulary, per-value definitions and criterion text. The claim holds for §A.2's derived form, not for the file.
