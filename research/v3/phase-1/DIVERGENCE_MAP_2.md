# Phase 1 — the divergence map, round 2

**Written 2026-08-04, after all twelve proposals landed and before any of them was judged.**

This document extends `phase-1/DIVERGENCE_MAP.md` over the six primes. It does not re-derive round 1:
that map's mechanism table is the starting point, it is treated as evidence, and where I disagree with
it I say so and give the reason (§0.1 collects those).

**This document does not rank the proposals and does not recommend any of them.**
`COMMISSIONING.md` §7 leaves open how proposals are judged, which go to Phase 2, and whether the seats
worked. §4 is an inventory built to make that choice easy; it is not the choice.

**Three scoping notes.**

- Round 2 is **not a pure replication** (`COMMISSIONING.md` §2.1 lists three differences). Every
  comparison below that could be explained by one of them is flagged where it occurs and collected in
  §5.
- **No confinement audit has been run on round 2.** `CONFINEMENT_AUDIT.md` covers the six round-1
  transcripts only. Everything in §1 and §2 that turns on the primes' independence is conditional on
  an audit that does not yet exist, and I do not assume it would come back clean.
- Contract and packet defects the primes raised are in §7, for `CONTRACT_DEFECTS.md`'s next pass. I do
  not edit that document.

---

## 0. The prime mechanism table

Same six columns as `DIVERGENCE_MAP.md` §1, so the two tables can be read side by side.

| | **object the palette is read off** | **what makes a colour eligible** | **what decides the gradient boolean** | **how exact-8-bit is satisfied** | **where the roles come from** | **when the image has no good answer** |
|---|---|---|---|---|---|---|
| **A′** | **The contract object itself**, scored as a code: `E(P) = L(pixels\|P) + λ·L(P)`, where `L(P)` is literally the output schema's serialization cost — 24 bits per named colour, the boolean, the stop list, the flags. **The contract's own shape is the model's prior.** | **Every colour present in the image, for every role, until one number ranks the whole configuration.** Belonging = "it pays for its own name". No rarity rule; invariant 2's floor and spread test become *consequences* of naming cost. | **Cheaper total bits.** Ramp published iff the ramp description costs fewer bits than the flat one. "Nothing else decides it." | **Certified branch-and-bound over exact triples**; a coarse lattice computes rigorous bounds and never selects a representative. Bound-not-elimination argued explicitly against the seat. | Read off the winning code: field ends at *t*=0/1 are background/surface; both inks are ink, F-vs-A settled first by feasibility, then by an **ordering** (accent moves further in lightness, chroma secondary). | No special path. A near-uniform cover has a landscape where every extra name loses, so the argmin is a declared collapsed two-colour configuration; if even that is infeasible, only the escape configurations remain, at a large fixed serialization penalty. |
| **B′** | **The tree of shapes** — marginal level-set inclusion trees on L, a and b, merged, filtered by **MSER stability**, called *the parse*. | Retained nodes' **depth-weighted representative triples** — the colour occupying the shape's interior, weighted away from the antialiased boundary. Belonging = "it is the interior colour of a stable region", and that is the whole criterion. | **The shape of the nested chain**, five-way: flat / **laminar** / partitioned / textured / unreadable. Laminar requires the chain's **centroid to migrate monotonically along a fixed direction in image space**. `gradient` true iff laminar *and* the ends clear the bar. | Argmax over a discrete set with a smooth depth weight, ties on deepest pixel then raster index. Never a snap of a computed centroid. | **Ordinal rules over one shared pool.** Ends of the chain (background = the top-left end under the 135° render axis); foreground = the mark cluster best satisfying text-ness **lexicographically** (thinness → count → collinearity); accent = greatest chromatic distance from its field, lightness movement as tie-break. | **Per role, down the same tree, never a second algorithm.** `textured` → root's retained children by area; `unreadable` → foreground/accent from the **residual** treated as one node. A violated invariant is repaired by taking the next item in the same ranking. |
| **C′** | **The winning member of a portfolio of six field models** — constant / ramp / radial / two-field / nested / **scene (an explicit null member)** — fitted to a lattice of sufficient statistics by one weighted-least-squares solver. | The **exact colour census** (direct-indexed tally over 2²⁴ with spatial moments). Published colours come only from here. Accents are census modes isolated from the field's distribution, with **area entering only through invariant 2's floor and never as a ranking term.** | **Model selection in bits.** True iff a field member won, its ends are distinct above the bar, and surface has not collapsed. "Never fitted to satisfy a metric." | **Projection, not a snap**: triples within the bar of the fitted value *and* occurring in that end's spatial support, taking the largest **bar-neighbourhood population**. | Field ends → background/surface. Foreground = the residual population surviving below a **granulometry knee**. Accent = isolated census modes ordered **lexicographically**. The ink roles are *outside the portfolio*. | **Member 6 (scene) wins**, outright or by default, "a legitimate publication rather than a fallback". Field roles then come from the dominant coherent region the two-field member located. |
| **D′** | **Six per-pixel fields from summed-area tables** — π corroboration scale, ρ ramp strength, φ roughness, ψ surround separation, σ bar support — plus **λ, each field's within-image percentile**. No object at all. | **Every pixel, from the first instruction to the last.** Line drawn at **invertibility**: a structure is a summary iff it is many-to-one over the pixel array. "No data structure in this algorithm is indexed by colour." | **One image-level ratio of accumulators** (field mass carried by high-ρ, low-φ pixels) against **one decision point**. Axis from the structure tensor's principal eigenvector. | **`argmax` over the pixel index set** of a scalar built from per-pixel fields, so the winner is an exact triple by construction. "Not satisfied at the end; unfalsifiable-by-construction from the start." | Four argmaxes, each a **product of percentiles** with feasibility masks — no weights, no conversion constants. Ties within a bar fall to a stated lexicographic order. | No degenerate branch. π never gets large, the background argmax is decided by a weak margin, "and I expect visible instability there". Named as the worst class, with the greedy-lockout risk named before the prototype. |
| **E′** | **One continuous joint measure** over (a pixel's colour, its surround colour at a ladder of scales, its position) — the **figure–ground measure** — splatted onto a 48³ OKLab quadrature lattice. Never materialised. | **The artwork's distinct triples, enumerated once and never filtered.** Belonging is a *cost* monotone in neighbourhood mass, with **no cutoff**: "a rare colour can outweigh it by being right about everything else." | **0-D vs 1-D by description length**, with the 1-D model required to show that position along the segment is a **monotone function of a spatial direction** — "the second half is not optional". | Minimisation over the explicit finite set of artwork triples, with a **representativeness** term inside the joint energy rather than a correction applied after. | **One constrained argmin** over tuples, with unary terms (belonging, role fitness, representativeness) and pairwise terms (distinctness, contrast, **identity coverage as transport cost**, F↔A separation). Collapse is a competing move, not a branch. | No degenerate branch. Full scenes: "the field model fits a one-dimensional model to a rich photograph and publishes a ramp between two arbitrary ends." Escape only when the constrained problem is provably **infeasible**, with an infeasibility certificate. |
| **F′** | **The multivariate tree of shapes** (marginal trees on L, a, b merged through a shape-inclusion graph), pruned by **one grain-area filter**. A palette is a **choice of four nodes**. | **Every surviving node, for every role.** The representation is *complete and exactly invertible*; the only filter is the grain threshold, **named as the design's single most consequential judgment**. | **Topology first, then verification.** A monotone **chain** of nested field candidates = ramp; siblings = two fields; area cliff = flat. Then RDP-simplify the chain's colour polyline at the bar and require the field's residual at quantile *Q* to clear the bar. | **One full-resolution masked pass**: highest-**multiplicity** exact triple inside the role's mask, restricted to pixels within the bar of the node's own-pixel mean. Ties lexicographic on (R,G,B). | A joint choice of four nodes: chain ends → background/surface; **glyph-shaped** node set with largest total area → foreground (isoperimetric ratio + **counters** + line structure); non-glyph chromatic node → accent, **lexicographic**, with no accent-distance constant at all. | Fields "degrade toward whatever survives"; foreground falls back through the glyph set then to the most-distinct non-field node. Escape only on a single flat field with no glyphs and no accent candidates. |

### 0.1 Where I disagree with the round-1 map

Four places, each with the evidence.

1. **§6.5's `[independent]` label on the fourth-stop refusal is too strong.** The refusal is now 12 of
   12, but the packet's "negotiable on proven utility" wording nearly forces it, and three arms (C, C′,
   D′) use the identical phrase *"I have no utility to prove"*. The genuinely independent part is the
   **publish-the-evidence** move, and that is 4 of 12 — and confined to the four unseated arms (§2.3).
2. **§3.3's separators between B and E, applied consistently, separate B from B′.** The map called
   tree type, ground criterion and text detection structural. B′ differs from B on all three and sits
   on E's side of the first. The map is not wrong; its own criteria are simply load-bearing in a place
   it could not apply them. This is what costs the headline its second clause (§1.2).
3. **§2's eligibility regimes need re-membering.** The map put B, C and F in the third regime
   ("whatever the intermediate object happened to produce") and called it a real restriction. Over
   twelve: *no gate* = A, D, A′, D′, E′; *provably additive gate* = E, **F′** (whose tree is complete
   and exactly reconstructible, filtered by one monotone area threshold — a stronger claim than E's
   lanes); *whatever the object produced* = B, C, B′, C′, F. **F′ moves out of F's regime**, which the
   headline's "diverged completely" hides.
4. **§3.5's placement of the A/C boundary at plurality is the wrong place** — see §3. The boundary
   holds, but on scope and set-fixity, not on the shape of the top-level object.

---

## 1. The seat result

The claim reported to the reviewer: *all four seated pairs reproduced their paradigm family, and both
unseated pairs diverged completely.* Tested below on mechanism, clause by clause.

### 1.1 A / A′ — the seat that named the least determined the most

**Shared, at mechanism level, and almost none of it is in the seat.** The seat says: one objective over
the whole image at once, no staged pipeline, no sequential winners, no stage that eliminates candidates
before a later stage sees them. It does not say *coding cost*. Both arms independently produced:

- **Description length as the objective** — A in nats per unit image mass, A′ in bits of image-plus-palette.
- **Certified branch-and-bound**, and *the same defence of the seat's own clause in near-identical
  terms*. A: *"elimination by certified bound is not a pipeline stage"* — a bound discards a region
  only after proving it cannot contain the optimum of the whole objective. A′: *"The seat forbids
  stages that eliminate candidates before a later stage can see them. It does not forbid **proof**."*
- **The contract as the feasible set, never a term in the objective**, and both derive §2's
  paradigm-neutral parameter requirement structurally from that rather than testing for it.
- **The same three-way decomposition** — field, ink, and a residual/unexplained term absorbing what four
  colours were never going to carry.
- **Contrast bounded, never rewarded.** A′ states the reason: a system that rewards contrast drifts
  upward under every other pressure.
- **λ named as the one exchange rate that needs the reviewer**, and in both arms it is the parameter
  the arm says it would take to a round.
- **The same falsifier and the same unique capability** — score palettes the system did not produce,
  and check whether the objective orders the reviewer's own judgments.

**Differences, classified.**

| # | difference | structural or degree |
|---|---|---|
| 1 | **Normalisation.** A prices *per unit image mass*, explicitly so model order cannot depend on pixel count (its stated reason is §1's resolution agnosticism, and it is *why* λ must be a scale-free constant). A′ prices total bits and never addresses resolution-dependence of λ. | **Degree, with a sharp edge** — one line of arithmetic, but it changes cross-rendition behaviour of the gradient boolean, which is a Phase 3 metric. |
| 2 | **What plays the model prior.** A's `Ω(x)` is a hand-listed count of four structural elements. A′'s `L(P)` **is the contract's own serialization**, so the prior is derived rather than declared. | **Structural — inside one paradigm.** It removes a judgment call at the cost of tying the objective to a schema that could change for unrelated reasons. |
| 3 | **Field/ink separation.** A: a continuous multi-scale extent statistic with a logistic prior and a split scale `s*` **optimised jointly inside the argmin**. A′: a **spatial code** on the support map (broad support cheap under a coarse code, stroke-like cheap under an edge/run code), plus a field/ink scale carried as free parameter 3. | **Structural at mechanism level.** A′ names parameter 3 as the one it most wants to eliminate; A demonstrates one way to eliminate it that A′ did not consider. |
| 4 | **Ramp density.** A evaluates the field as an **integral along the rendered path**, which makes "the straight segment passes through off-artwork colours" and "the ramp fits badly mid-segment" the *same quantity*, on the same discretisation the whole-ramp APCA floors use. A′ needs two separate conditions for a stop. | **Structural**, and A's is the sharper idea. |
| 5 | **The `[UNCALIBRATED]` accent distance.** A takes a **coefficient** — an anisotropic accent kernel at a ratio in [1,4] it calls "the parameter I am least happy about". A′ **refuses the magnitude** and spends the direction as an ordering, stating the general rule: *"prefer an ordering to a threshold, because an ordering costs no constant."* | **Structural, and the arms go opposite ways** on the packet's most contested quantity. |

**Verdict.** Same paradigm, and the convergence goes far beyond the seat. Four of the five shared items
above — the currency, the search technique, the feasible-set treatment, and the score-a-foreign-palette
capability — are *not* implied by "one global objective". **This is the least tautological component of
the whole seat result.**

### 1.2 B / B′ — same family, and the round-1 map's own separators split them

Both build a hierarchy of nested regions, fold out small or unstable ones, split ground from marks, and
read roles off the structure by ordinal rules over one pool. Both refuse weighted sums. Both make the
endpoint invariants structural. Both propose a reachability falsifier with a control. The family holds.

**But B′ is not B's tree; B′ is in E's tree family**, and `DIVERGENCE_MAP.md` §3.3 called exactly that
difference structural when it used it to separate B from E:

| round-1 separator (B vs E) | B | B′ |
|---|---|---|
| **1 — which tree.** | One hierarchy on **inter-pixel dissimilarity** (quasi-flat zones, α-connectivity on an edge-weighted adjacency graph). | Three **level-set inclusion trees** on L, a, b, filtered by MSER stability. |
| **the chaining consequence.** The map: *"the α-tree's famous chaining pathology is unavailable to a component tree… B makes that pathology the load-bearing feature of its gradient rule; E cannot and does not."* | B's gradient rule **is** chaining: *"on a smooth gradient every step is below any bar, so the whole ramp chains into one zone — and here it is the single most useful thing the structure does."* | Cannot and does not. B′'s gradient is a **chain-shape plus centroid-migration** test. |
| **2 — what stops the decomposition.** | **What reaches the frame** — one union-find query on border pixels; B says most of its stability comes from there. | The **longest chain of field candidates above an area fraction** — a size criterion, not a border criterion. |
| **3 — how figures are ranked.** The map: *"B's mechanism can be wrong about type specifically; E's cannot be, because it never claims to see type."* | An explicit **stroke-width text detector**, with mediocre recall conceded on purpose. | A **shape signature** ranked lexicographically (thinness → count → collinearity). Closer to E than to B, though the collinearity key is still a line-structure claim. |

**Verdict.** Same paradigm family; **different mechanism on every axis the round-1 map used to
distinguish two arms it declined to merge.** The honest form of the headline's second clause is: *B and
B′ landed in the same family and on different trees, and by the map's own criteria B′ sits closer to E
than B does.*

**Caveat that must travel with this pair.** B is the arm the confinement audit calls a material breach:
it read, in `MANIFEST.json`, the plain-English statement that the semantic route "measures weak" and
that one arm is seated on parse-then-assign — its own seat, quoted back to it. B′ read a de-leaked
packet. **Every B/B′ divergence therefore has a documented alternative explanation and I claim none of
them as evidence about the seat.** What round 2 *does* establish is narrower and worth having: a
clean-packet author given the same seat sentence also builds a plain-code, model-free parse. Seat B's
direction does not need the leak to produce that.

### 1.3 C / C′ — same architecture, opposite currencies

Both: rival accounts, one selector, the selector as the only complex part, members declaring no score
or threshold or weight, adding a member costing the selector nothing, a deletion rule for members, the
gradient boolean as *the identity of what won*, one shared projection rule across every member and
role, no fourth stop. The architecture is reproduced.

Three differences, all structural:

1. **The currency, and the arms take opposite sides.** C's ranking is **coverage** — a within-image
   mass fraction at the identity bar, and C makes the never-compare-across-images property load-bearing:
   *"it never needs a threshold calibrated on a corpus, and there is no number in it that a human
   tunes."* C′'s ranking is **description length in bits**, and C′ claims the reverse: *"a bit means the
   same thing on every artwork, so confidence is comparable across the corpus without normalisation."*
   These are contradictory commitments about the same object — the C/C′ analogue of round 1's A↔F
   contradiction on discrete-versus-projected.
2. **What a member is.** C's members are **labellers** spanning the whole palette (`field / ink /
   accent-carrier / ignore` plus a field model), and they are genuinely different methods — an ink-first
   member that works from shape, a frame-aware member that relabels and re-runs, a floor member at the
   bottom of a claim lattice. C′'s members are **field models only**: six design matrices over one
   solver. **In C′ the portfolio does not decide the ink roles at all** — foreground and accent come
   from a shared residual pathway no member competes over. Half the contract is outside the portfolio.
3. **Margin measurement.** C runs a **nuisance ensemble at runtime** (dither, checkerboard halves,
   border crop, all in the same pass) and uses trials-survived as an integer veto plus a per-image
   replicate spread. Nothing else in twelve proposals does per-image cliff detection at runtime. C′ has
   no runtime perturbation; its margin is a **block bootstrap over lattice cells** with a stopping rule
   (continue until the Wilson interval excludes one half) rather than a resample count.

Convergent despite that: both pre-register the **same corpus consequence** — collapse rate too high,
gradient boolean biased toward false at the margin — from different derivations (C's declared claim
lattice; C′'s fewer-parameters tie-break, which C′ derives from the loss itself).

**Verdict.** Same paradigm; the currency difference is the one that matters, because it is exactly the
question §3 asks. **C′ landed on A/A′'s currency and C did not.**

### 1.4 D / D′ — the tightest seat produced the widest disagreement

Both: every pixel is a candidate for every role at all times; selection is an argmax or rank over the
full pixel index set; no candidate set, no clustering, no histogram; exact-8-bit by construction rather
than by snapping; contract floors as feasibility masks, never a repair; every intermediate a
full-resolution image; every published colour has a location a reviewer can be pointed at. Both
enumerate the brief's probes (histogram / CDF / sorted array / gradient field) and rule on each.

**And they answer the seat's central question with two rules, each of which forbids the other's core
mechanism.**

- **D's line: "nothing colour-bearing is ever created."** D follows it into a cost it did not have to
  accept: *"a **local mean colour is banned** too, so I cannot measure flatness against a neighbourhood
  average… That bans every linear filter on colour, which costs me the usual toolbox and buys the
  central robustness property."*
- **D′'s line: invertibility.** *"A structure is a summary if it is many-to-one over the pixel array."*
  And D′'s entire field battery is built from exactly what D banned: π is *"the largest radius at which
  ĉ(p) stays within one bar of the **mean colour** of the disc"*; ψ is *"distance from ĉ(p) to the
  **mean colour** of a wide disc"*; ρ is a local linear fit. All from summed-area tables — linear
  filters on colour, at every pixel.

That is not a difference of degree. It is at least as sharp as the A↔F contradiction the round-1 map
called *"the strongest mechanical evidence that they have not collapsed into one another."* Three
further mechanism differences follow it:

- **Population → triple.** D's **rank cascade** (successive medians of L, then a, then b, restricting
  each time to the attaining pixels) is permutation-invariant *by definition*, so the relabelling
  failure class is unreachable rather than fixed. D′'s argmax needs a lexicographic tie-break within a
  bar.
- **Combination.** D: lexicographic tiers under a universal trim level τ. D′: **products of
  percentiles**, chosen precisely so that "combining evidence requires no weights and no conversion
  constants".
- **Alpha.** D: exclusion — α<255 pixels take no part in any rank. D′: a per-pixel confidence weight,
  with α<1 pixels ineligible for publication.

**Verdict.** Same seat, same eligibility posture, two incompatible readings of the seat's own
constraint. If this pair counts as "reproducing the paradigm", the phrase is doing very little work.

### 1.5 The tautology accounting

The seats differ enormously in tightness. Ranked by how much of a mechanism the sentence fixes:

| seat | what the sentence fixes | what it leaves open |
|---|---|---|
| **D — "pixels only"** | Bans clustering, quantisation, candidate sets, any intermediate summary. Names the *entire representational commitment*. | What replaces it. |
| **C — "a portfolio and a selector"** | Fixes the top-level architecture outright: plural accounts, an election, the selector as the only complex part. | What the members are; what the currency is. |
| **B — "parse, then assign"** | Fixes the order — structure first, colour arithmetic downstream — and that a structural description exists. | What a parse is; how it is computed. |
| **A — "one global objective"** | Fixes only that there is one objective and no stages. | What the objective is. |

**If convergence tracked tightness, D/D′ would be the most alike and A/A′ the least. The observed order
is the reverse.** A/A′ — the loosest seat — produced the tightest convergence, agreeing on the objective
family, the search technique, the seat-clause defence almost word for word, the feasible-set treatment,
the decomposition, the falsifier and the unique capability. D/D′ — the tightest seat — produced two
designs that disagree about what the seat forbids.

So the honest reading is **not** "the seats did the work". It is closer to: *the problem plus the
contract did the work, and the seats mostly chose which region of it an author started from.*

What **is** tautological, stated without hedging: the seat determines column 1 of the mechanism table in
three of four cases, and the headline's four clauses are unequal in information content —

- **A: informative.** "Both price description length" is a real finding; the seat said nothing about a
  currency.
- **B: informative, with a correction.** "Both build a hierarchical region tree" is true and the seat
  made it near-inevitable; *which* tree was open and the two arms answered differently.
- **C: vacuous.** "Both run a portfolio under a selector" restates the seat verbatim and carries no
  information whatsoever.
- **D: near-vacuous.** "Both take per-pixel ranks with no candidate set" is what the seat forbids
  everything else from being.

Everything *below* column 1 — the currency, the search technique, where the contract lives, the
treatment of the uncalibrated accent distance, the representative rule, the falsifier design — is where
the pairs agree or disagree on their own account, and that is where §2 looks.

### 1.6 n = 1 per cell

Six pairs, one replication each, and the cells are not independent of one another: all twelve arms read
the same contract, and all twelve are the same model family.

**What this design can support:**

- **A single existence claim per cell, in one direction.** A/A′ landing on the same objective family
  shows the seat's space contains at least one strong attractor and that two independent draws hit it.
  It does not estimate how often.
- **A refutation, wherever a pair diverges.** D/D′ disagreeing about the seat's own line is a *proof*
  that the seat under-determines that question — one counterexample suffices. **Divergence is the
  direction where n=1 is enough; convergence is the direction where it is not.**
- Consequently the headline reads the result backwards. *"All four seated pairs reproduced their
  family"* is the **weak** half (four n=1 convergences, each supporting an existence claim). *"Both
  unseated pairs diverged"* is the **strong** half (two n=1 divergences, each a sufficient
  counterexample to "a free author lands in one place").

**What it cannot support at all:** any statement about *rates* — how often a seat reproduces, how much
variance a seat removes, or whether seat tightness predicts convergence. The tightness pattern in §1.5
is four points with no error bars and I record it as a pattern, not a measurement.

**And one cell is not a replication.** B/B′ differ in exposure, not only in draw (§1.2).

### 1.7 The unseated pairs are not unrelated

The headline is right that E/E′ and F/F′ diverged on mechanism. It misses what they share.

**E and E′.** E is a hierarchy of nested connected regions with persistence attributes; E′ is a
continuous joint measure and one energy. Columns 1, 3 and 5 differ completely. But:

- **E′ considered E's paradigm by name and kept its core idea.** E′ §10: *"**Topological persistence of
  the colour density** I took seriously, since it carries the best stability theorem available here, and
  rejected as the primary frame because persistence tells you which structures survive, not which role
  they fill. **Its idea survives as the scale ladder.**"* Two free authors, and the second one's §10 is
  a review of the first one's §1.
- Both put the robustness argument in the same place — every decision variable is an integral or a
  persistence of a bounded function, so a ±1-LSB perturbation cannot move it. E computes the numbers
  (0.002–0.004 in OKLab against a smallest bar of ~0.009); E′ argues Lipschitz continuity of area
  integrals.
- Both refuse to make CVD a scoring axis, both derive the matte from the image, and both refuse the
  fourth stop *while publishing its evidence*.
- Both wrote a §10 rejecting the same four families, and **both rejected clustering/quantisation for the
  identical stated reason** (decision boundaries in colour space are what lets a ±1-LSB dither move a
  palette) and runtime segmentation on cost plus condition 4.
- **They also disagree sharply, and it is worth recording as the phase's sharpest intra-pair
  disagreement:** E rejected global optimisation because *"its weights **are** its free parameters"*.
  E′ built a seven-term energy in which four of its seven free parameters are exchange rates between
  terms. One unseated arm stated the objection; the other unseated arm walked into it.

**F and F′.** F is a robust affine field-plus-marks with continuous targets projected at the end; F′ is
the multivariate tree of shapes with roles as a choice of four nodes. Columns 1 and 4 differ. But:

- **The same disagreeable claim, in different vocabulary.** F: *"A palette is not a summary of an
  image's colour statistics; it is a reading of the image's layout… any paradigm that works only in
  colour space is guessing at layout from its shadow."* F′: *"the palette problem is a region-selection
  problem wearing a colour-selection costume."*
- Both §10s reject the same three alternatives, and **both reject a pixels-first route — seat D — for
  the same stated reason**, that it has no vocabulary for structure. F: *"the same paradigm as mine
  without the commitment… the moment you answer, you have named a decomposition."* F′: *"it has no
  vocabulary for 'this is type', 'this is a frame', 'this is a scrim'."*
- Both make the ramp's two ends and the two field roles **the same objects**, and both name that
  coincidence as the reason they chose the paradigm. F′: *"That single coincidence is what convinced
  me."*
- Both make frames, overlays and giant text ordinary rather than special, and both name it as a reason.
- Both refuse a fourth stop by default and both **report the residual evidence instead** (F: the second
  excursion lobe; F′: the residual figures for the 2-, 3- and 4-stop fits).

**And the fact the headline hides entirely.** **B′ and F′ are the closest pair of proposals in the phase
of twelve, and they sit in different arms of different seats.** Both build the tree of shapes; both cite
the same literature lineage (B′: Monasse and Guichard, Géraud's quasi-linear variant; F′: Carlinet and
Géraud); both prune by an area/stability filter; both read the gradient off the *shape of a nested
chain*; both rank text by a shape signature; both make the ramp ends and the field roles one object.
**F′ received §2 and §3 of the brief and nothing else, and still landed on B′'s representation.** That is
the most interesting mechanism-level fact in round 2, and the headline reports it as one arm reproducing
its family and the other diverging completely — true pairwise, misleading globally.

---

## 2. Cross-round convergence

Anything recurring across twelve — especially across both rounds of *different* seats — is the strongest
evidence this phase can produce. Each item is marked for arm count, whether it crossed seats, whether it
crossed rounds, and whether the packet supplied it. The round-1 map found several were supplied; each is
re-checked over the larger set.

### 2.1 The representative-pixel rule — **12/12 refuse, 10/12 reach one mechanism**

**Arms:** all twelve. **Seats:** all. **Rounds:** both. **Supplied:** the motivating fact, yes; the
conclusion, demonstrably not — *twice*.

Every arm rejects the modal exact triple. Ten reach a **bar-neighbourhood-mass argmax**: A (kernel of
identity-bar width; "nothing in the objective ever counts an exact bin"), B, C, E, F, A′ (σ as the
density-smoothing bandwidth), C′ ("the count of pixels whose colour lies within the bar of the
candidate, **not** the count of the exact triple"), D′ (σ(p), bar support), E′ (presence mass
`M(v) = ∫K_h`), F′ (highest-multiplicity triple *inside the bar of the node's own-pixel mean*). Two
reach it by a different operator with the same stated motivation: **D**'s rank cascade (*"an extremum is
one pixel and usually a compression artifact"*) and **B′**'s depth-weighted interior triple (weighted
away from the antialiased and compression-smeared boundary).

**Why the "supplied" label is now decisively wrong.** The 8.89e-5 / 1.91e-2 corpus pair is in brief §4,
which the ten full-packet arms received and seven cite explicitly. **Both blind arms reached the rule
without it.** F from pure dither stability (*"nearest-neighbour chases a single dithered pixel, whereas
the mass-maximising choice is an integral"*); F′ from a different argument again (*"the algorithm never
has to decide whether a colour belongs… it only ever publishes the most common value inside a region it
already decided matters spatially"*). Round 1 recorded this once. **Round 2 replicates it exactly: two
blind arms, two rounds, no corpus fact, same rule.** This is the phase's strongest technical finding and
its clearest evidence about what §4 actually bought.

### 2.2 The derived matte — **10/10 who answered**

**Arms:** A, B, C, D, E, A′, B′, C′, D′, E′. Both blind arms silent, both rounds, both for the same
structural reason (the question lives in `V3_PLAN.md` §6 and the brief's non-blind sections). **Seats:**
all four plus both E arms. **Rounds:** both. **Supplied: no** — the plan left it to the authors on
purpose and nothing in any packet answers it.

Ten distinct derivations of one conclusion: a matte must come from the image, never be fixed. A (a
variable of the configuration), B (the field's own representative), C (two members, per-image), D
(refuse the premise — exclusion, not a matte), E (the reconstructed ground), A′ (the matte *is* the
background role, resolved self-consistently), B′ (**do not matte, re-root** — alpha is a fourth scalar
field and the parse's root becomes the largest opaque component), C′ (fit to the opaque pixels, then let
the field itself be the matte), D′ (alpha as a per-pixel confidence weight; α<1 ineligible for
publication), E′ (a **fixed point with a refusal condition** — compute, matte, recompute, publish only
if the two agree within the bar, otherwise refuse).

Round 1 called five derivations *"the strongest answer this phase produced to a question the plan
deliberately left open."* It is now ten, with two arms (D, D′) refusing the premise the same way and one
(E′) adding a convergence test that can fail. The conclusion is as well-attested as anything in the
phase.

### 2.3 The fourth stop — **12/12 decline; 4/12 publish its evidence, and all four are unseated**

**Supplied:** the criterion ("negotiable on proven utility") is verbatim in §3.1, and three arms use the
identical phrase *"I have no utility to prove"* — so treat the refusal itself as largely supplied
(§0.1). What is not supplied is turning the refusal into a design contribution: **publish the residual
excursion, because that residual *is* the evidence a negotiation would need.** That appears in E, F, E′
and F′ — **both E arms and both F arms, and nobody else.** The unseated arms are the ones that treated
the reviewer's open negotiation as an obligation the design owes.

### 2.4 The `[UNCALIBRATED]` accent distance — **12/12 consume the direction, 10/12 refuse the coefficient**

**Supplied:** the *instruction* is, verbatim ("read that as a direction and not as a coefficient"), plus
0.750-against-0.361 and `ACCENT_FUNCTIONAL_DISTANCE = 0.14591 [UNCALIBRATED]`, twice refused. **Not
supplied:** any mechanism for spending a direction without a coefficient. The arms invented four.

| device | arms |
|---|---|
| **Lexicographic tiers / levels** — the direction sorts within a level, costing no constant | B, D, B′, C′, F′ |
| **An ordering used as a tie-break** between two otherwise legal assignments | A′, F |
| **A percentile factor in a product**, so the direction enters a score with no weight | D′ |
| **Confining the constant to a collapse gate only**, so its error cannot steer a selection | D′ |
| **A coefficient, taken and flagged** | **A** (ratio in [1,4], "the parameter I am least happy about, and the one I would expose first"), **E′** (parameter 5, "ships `[UNCALIBRATED]` by construction; the parameter I would most want the deferred round to settle") |
| **Eliminated entirely, no successor** | **F′** (*"`ACCENT_FUNCTIONAL_DISTANCE` has no successor here, and the only bar in play is the contract's inherited same-colour bar"*) |

Exactly two of twelve take a magnitude, they are in different seats and different rounds, and **both name
it as their least defensible parameter.** Even the dissent is convergent about its own weakness.

Two devices are new in round 2 and are the most reusable things in this row:

- **D′'s confinement.** *"The floor is used only as a collapse gate, never inside the ordering, so a
  mis-set value changes how often accent collapses and never which accent is chosen. A parameter whose
  error mode is confined to one boolean is a cheaper parameter than one that steers a selection."* That
  is a general technique for any `[UNCALIBRATED]` quantity and it belongs in the phase's output whichever
  paradigm wins.
- **F′'s elimination.** Round 1 produced nobody who removed the constant. F′ removes it and states what
  it costs (one ruler doing four jobs, with the anisotropy inherited into all four) and why that trade is
  the right one.

### 2.5 Description-length pricing — **4 explicit arms across three seats and two rounds, plus one in all but name**

**This is the convergence round 1 could not see, and the brief is right about it.**

| arm | position | form |
|---|---|---|
| **A** | seat A, round 1 | "an expected coding cost, in nats per unit of image mass" — MDL over the whole configuration |
| **A′** | seat A, round 2 | bits of image-plus-palette, with `L(P)` the contract's own serialization |
| **C′** | seat C, round 2 | `L(M) = k·½log₂(N) + Σ residual NLL` — the **selector's entire currency** |
| **E′** | unseated, round 2 | description lengths compared for the 0-D vs 1-D field decision; a "description-length exchange rate" as free parameter 6 |
| **F** | unseated blind, round 1 | **penalised model selection** ("residual plus a complexity price", "a penalised-likelihood form") — the same idea without the vocabulary |

**Crossed seats: yes** (seat A twice, seat C once, unseated twice). **Crossed rounds: yes.**
**Supplied: no** — nothing in any packet proposes MDL, coding cost, bits or a complexity price. The
round-1 stress test recorded that A *"independently reinvents the MDL term the guide names as its own
never-built idea"*, and the guide was withheld from every author in both rounds.

The shape is precise and worth stating: **description length is what three of the four arms that needed
a *model-order* decision reached for**, independently, across two seats and two rounds — and the fourth
reached penalised likelihood, which is the same idea with a different constant. It is always used for
the same three decisions: flat versus ramp, how many stops, whether a second colour earns its name.
**Nobody used it for role assignment.** That boundary is itself the finding, and it feeds §3.

### 2.6 The rest of the list, rebuilt over twelve

| # | convergence | arms | crossed seats | crossed rounds | supplied? |
|---|---|---|---|---|---|
| 1 | **Candidacy walls replaced by rankings** | **12/12** | yes | yes | **Premise supplied** (goal 3, in §2, which both blind arms had); mechanism independent. **Round 2 corrects one round-1 finding:** F asserted absolute no-elimination over a pool built by three summarising stages (`STRESS_TEST.md` §4.1); **F′ names its one elimination point** — *"the grain filter… one place to be wrong, one place to audit."* |
| 2 | **Contrast parameters are a feasibility predicate, never a repair** | **12/12** | yes | yes | Requirement supplied (§3.1); mechanism independent. Now the most uniform result after §2.1. D′ states the consequence best: *"there is no post-hoc fix-up, so the meta-rule that 'any repair re-validates the entire palette' has nothing to apply to."* |
| 3 | **Guide stops by monotone excursion reduction, one at a time, at the argmax** | **11/12** (A prices instead) | yes | yes | Criterion supplied; algorithm convergent. **RDP named explicitly by D and F′**, one seated and one unseated, one per round. **New in round 2:** C′ and D′ *independently* add a **curvature tie-break** among excursion-reducing candidates — "the flattest path that stays on artwork" turned from a prohibition into an objective. |
| 4 | **The gradient boolean is a by-product of model selection, not a detector** | **10/12** | — | — | Independent. **The two exceptions are D and D′ — the same seat, both rounds.** Round 1 called D's `ρ*` *"a clean, discriminating disagreement rather than an oversight"*; round 2 shows it is a **property of the seat**: a paradigm with no model cannot make the boolean fall out of one. This is the clearest case in the phase of a replication buying something round 1 explicitly could not know. |
| 5 | **A gradient is a chain of below-bar steps whose total span exceeds the bar** | **5/12** (B, E, B′, E′, F′) | yes | yes | Independent — **and refined across rounds.** All three round-2 members independently add the same correction: a colour chain alone is not a gradient, it needs **monotone spatial progression**. E′ is explicit: *"two flat areas of different colour produce an elongated covariance exactly as a ramp does, and only the spatial regression separates them. The second half is not optional."* |
| 6 | **CVD must not become a scoring axis** | **10/10 who answered** (both blind arms silent, both rounds) | yes | yes | Independent. **New in round 2:** C′ and D′ both observe that the CVD-safe direction and perception-4's measured functional direction **coincide**, so buying the second buys the first. Round-1 D said it once; there are now three. |
| 7 | **Scale-free spatial quantities, never a pixel constant** | **12/12** | yes | yes | Supplied requirement (§3.1 no resampling), unanimous discipline. |
| 8 | **Decline the model exception; place at the target end of the bracket** | **12/12** | yes | yes | Supplied frame. **Round 2's cost figures are comparable for the first time** — see §5. |
| 9 | **"What an instrument measures, not what it found"** | **10/10 who filed requests** | yes | yes | Independent. E′ states it most crisply: *"Two things, **both definitions rather than findings**."* **And the requests replicate:** the resolution distribution/floors asked for by A, B, D then A′, E′; the probe→`ground_type` derivation table by B then B′, E′; the SAM mask schema by B, E then B′, D′. **Three holes, six arms, two rounds, unchanged** — a replicated measurement of what the trim costs. |
| 10 | **"The artwork contains a worked solution" — do not optimise legibility, read it** | **7/12** (B, E, A′, C′, D′, E′, F′) | four seats | yes | **Independent inference from a supplied premise.** §3.1 supplies "contrast is deliberately low, default near zero"; the inference that the correct foreground is therefore a *recovered fact* is the arms'. F′: *"it does not search for the most legible colour… it returns the colour the designer actually set type in, whatever its contrast."* D′ gets it with no text detector at all, via the surround-separation field. |
| 11 | **Expose an intermediate a human can grade without knowing anything about palettes** | **12/12**, with **8/12** making the argument explicitly | yes | yes | The §8 *template line* is supplied (COMMISSIONING §5, both rounds). The shared design argument — that a picture-shaped intermediate turns a palette question into a structure question a naive reviewer can answer — is not. **Two mechanisms are new and unique:** F′'s **grain sweep** (recompute the palette at several grain sizes; "a **per-file self-reported robustness readout**: which roles are stable across scales and which flip" — the only proposal in twelve that makes robustness a per-image warning the system emits about its own answer), and D′'s **margin map** (the gap between the winning score and the best score outside one bar, predicting per-role instability before the harness measures it). |
| 12 | **A pre-registered falsifier separating "wrong" from "under-tuned"** | **12/12**; **9/12** built on reachability against the endorsed set; **5/12** with a matched control; **2/12** with a numeric refutation bar | yes | yes | Independent — the §6 template line asks for a falsifier, not for its design. Numeric bars: F (30% of endorsed accents) and B′ (25% unreachable *while remaining reachable from all triples at the same area floor*) — one per round, different positions. **And a limitation round 1 could not state: D and D′ both independently identify that reachability is vacuous for their own seat** (D′: *"reachability against the endorsed corpus is 100% by construction and carries **no** information about my arm — I claim nothing from it"*) and both replace it with a rank/percentile-position test. Any cross-paradigm measurement plan needs two instruments, not one. |
| 13 | **"Prefer an ordering to a threshold"** | **9/12 state it as a principle** | all | yes | **Independent, and the phase's clearest self-invented design rule.** A′ states it as a rule: *"prefer an ordering to a threshold, because an ordering costs no constant."* D: *"a weighted sum needs weights and a lexicographic rank does not."* D′: *"how a would-be weight becomes an ordering and stops being a number."* Round 1 mostly *applied* it; round 2 made it explicit. Exceptions: A and E′ (coefficients), C (rules, though its claim lattice is an ordering). |
| 14 | **The free authors' rejection set agrees** | **4/4 unseated arms** (E, F, E′, F′) | both rounds | yes | Independent. All four wrote a "why this one" section; all four rejected **colour-space clustering** with the *same* mechanism (decision boundaries / hard assignment / count-argmax are the discontinuities a ±1-LSB dither walks across) and **runtime segmentation** on cost plus condition 4. F and F′ both rejected **pixels-first (seat D)** for the same reason. E and E′ both rejected **runtime models**. |

---

## 3. Does the A/C boundary survive?

Round 1 judged C a *meta*-mechanism rather than a seventh paradigm, and located its distinctness in the
selector. C′ selects among rival field models by **description length in bits** — the same currency A and
A′ use. So: is "one objective over the whole contract object" genuinely different from "fit rival models,
compare by the same objective"?

### 3.1 The criterion, stated before the answer

Two designs are the same paradigm iff, for every image, there is a single well-defined object over which
**one** comparison is made, and the published palette is the argmin of that comparison over a set that
does not depend on the order in which parts of the answer were decided. Three questions:

1. **Is the comparison over the whole contract object, or over a proper part of it?**
2. **Is the compared set fixed before any part of the answer is decided?**
3. **Does adding a member change the answer only through the comparison, or also through machinery
   outside it?**

The criterion's logic: if a portfolio's members exhaust the configuration space and the selector's
currency *is* the objective, then "fit rivals and compare" is merely *how you compute* the argmin — a
search strategy, not a paradigm. That is A's own position about branch-and-bound, applied consistently.
A portfolio would then be a coarser search over the same landscape: enumerate a few basins, evaluate,
take the best.

### 3.2 Applying it to C′ against A′

**Question 1 — scope. Fails.** A′'s energy spans the *entire* contract object: four role colours, the
gradient boolean, the stop list, the collapse flags, all decision variables inside one argmin. C′'s
description length prices **the field model only** — `k·½log₂N` plus residual NLL over lattice cells.
Foreground and accent are not in it. They come from a **separate residual pathway** (a granulometry knee
for foreground; census modes with a lexicographic ordering for accent) that no bit count ever evaluates.
C′ says so itself: judgment sits in four places, one of which is *"the candidate orderings for foreground
and accent — lexicographic keys."* **C′'s selector decides half the contract in bits and the other half
by an ordering that never enters the currency.**

**Question 2 — set-fixity. Fails.** A′'s feasible set is every contract-legal configuration, and the
bound only prunes with a certificate. C′'s compared set is a **human-curated roster of six families with
a retention rule** — *"a member never the outright winner on a non-trivial share of the corpus is
deleted."* A member that would have won on some image and was deleted is never compared. C′ names
portfolio membership as free parameter 2 and *"the only place improvement is meant to come from."*
A′'s configuration space cannot be edited; C′'s can, and editing it is the design's stated improvement
mechanism.

**Question 3 — additivity. Fails weakly.** C′'s strongest claim is true of the selector: *"Adding a
seventh member costs one integer and zero thresholds."* But a new member also brings a design matrix, a
geometry search and a new pair of field ends feeding the projection rule, so the answer changes through
the comparison **and** through the member's own machinery.

### 3.3 And C fails the same test in the opposite direction

- **Scope: C passes, more than C′ does.** C's coverage is measured over the whole image reconstruction,
  including ink and accent cells, so its currency spans the whole palette.
- **Set-fixity: fails**, same roster-plus-deletion-rule as C′, and C's members are *genuinely different
  methods* rather than rows of one design matrix.
- **But C's currency is not objective-shaped at all, by design.** Coverage is **within-image only**,
  deliberately, *"so it never needs a threshold calibrated on a corpus."* A quantity forbidden to be
  compared across images cannot be minimised over a global feasible set. That is not a defect in C — it
  is C's single most valuable property — but it puts C further from A than C′ is on currency and closer
  on scope.

### 3.4 Verdict

**The boundary survives, and it survives on scope and set-fixity, not on currency.** Round 1 drew it at
plurality; round 2 shows plurality was the wrong place, because C′'s selector is not a meta-mechanism —
it is a bona-fide objective, and a member is not an independent method but a design matrix.

The line that actually holds: **A prices the whole answer; the C family prices the field and hands the
ink roles to something else.** A portfolio that priced the whole contract object in bits over an
exhaustive member set *would* be A with a coarse search — and C′ is one modelling decision away from
being exactly that.

The corollary is worth stating because it constrains Phase 2: **the C family is separated from the A
family twice over, by two different defects, and no single fix closes both.** Make C's coverage
corpus-comparable and you get C′'s currency but lose the within-image property that was C's unique
contribution to success criterion 2. Extend C′'s bits to the ink roles and you get A′ with a curated
basin list.

### 3.5 What a prototype would have to show for the distinction to matter

Three measurements, all cheap, none needing a review round.

1. **Does the portfolio's argmin differ from the objective's argmin?** Score C′'s published palette
   *and its losing members' palettes* under A′'s energy on the same images. If the bit-optimal member is
   also the energy-optimal palette almost everywhere, the portfolio is a search strategy and the
   distinction is bookkeeping. If they disagree materially, the portfolio is reaching configurations the
   global search prunes — or missing ones it finds — and the distinction is real. **A and A′ are the only
   arms in twelve that can run this**, which is the second time the score-a-foreign-palette capability
   turns out to be the phase's most reusable instrument.
2. **How often does the winning member change the ink roles at all?** C′'s architecture says: nearly
   never, since foreground and accent come from the residual pathway. If that is confirmed, the paradigm
   is a **field-model selector** and should be described as one — which shrinks its claim considerably
   and moves the C/A question entirely onto the field decision.
3. **Per-member ablation.** Delete each member in turn; count images whose palette changes above the
   bar. A member whose deletion changes nothing was never worth a paradigm; a member whose deletion
   changes many images is a basin a global search would have to reach on its own. This is C's own
   proposal (free parameter 6) and it doubles as the boundary test.

---

## 4. The paradigm inventory for Phase 2

Six paradigms over twelve arms. Grouped on the mediating object (column 1), corroborated by columns 3
and 5. **No ranking, and no recommendation about which go forward** — `COMMISSIONING.md` §7 leaves that
open. "Best-developed instance" below is an argument about a *specific mechanism*, not a score.

### P1 — One objective over the contract object, priced as description length

**Arms: A, A′.** (C′ is adjacent by currency and excluded by §3. E′ uses description length for the
field decision only and is excluded because its energy is a weighted sum of many non-code-length terms.)

**Best-developed instance: A′**, on one mechanism. `L(P)` **is the output schema's serialization cost**,
so the model's prior is *derived from the contract* rather than declared — where A's `Ω(x)` is a
hand-listed count of four structural elements, i.e. a place a human chose what to charge for. A′ removes
that judgment call, which is the paradigm's own ambition applied to itself. A′ also sequences the work so
the paradigm is **falsifiable in two days at zero reviewer cost**, before any optimiser exists.

**What A uniquely contributes — all four are graftable onto A′:**
- **Mass normalisation.** Nats *per unit image mass*, explicitly so model order cannot depend on pixel
  count. A′ has no such guard and does not address its absence.
- **The path-integral field density**, which collapses "the segment passes through off-artwork colours"
  and "the ramp fits badly mid-segment" into one quantity, on the same discretisation the whole-ramp
  APCA floors use. Removes one of A′'s two stop conditions and unifies objective with invariant check.
- **The soft, jointly-optimised field/ink split** — one way of eliminating A′'s parameter 3, which A′
  itself calls the parameter it most wants gone.
- **The certified optimality gap as a published per-run fact**, plus the differential test against an
  exhaustive minimiser on a coarsened colour set. A names bound validity as the design's riskiest
  component; A′ has the certificate but not the reporting discipline or the harness.

**What A′ uniquely contributes:** the schema-as-prior; the refusal of the accent coefficient; the
two-day falsifier sequencing; the "prefer an ordering to a threshold" rule; and the **naming-gain
curve** (bits saved by naming each colour) as the direct P5 identity-coverage diagnostic.

**A prototype would have to demonstrate:** (i) **the lower bounds are valid** — differential test
against exhaustive search on a coarsened set, because an invalid bound prunes silently and looks like a
merely mediocre palette; (ii) **the objective orders the reviewer's own judgments** — score the endorsed
and known-bad palettes and read the rank correlation, needing no optimiser and no reviewer; (iii)
**one λ produces an acceptable gradient rate and collapse rate simultaneously** — A pre-registers that
failure kills the framing rather than the tuning; (iv) **that the argmin does not move with rendition
size**, which is exactly where A's normalisation and A′'s absence of it diverge measurably.

### P2 — Hierarchical region decomposition

**Arms: B, B′, E, F′.** The largest group in the phase, and it was reached from four different starting
positions: a seated arm, a seated prime, an unseated arm and an unseated *blind* prime.

Sub-split on the round-1 map's own separator 1:
- **P2a — inter-pixel dissimilarity hierarchy: B** alone (quasi-flat zones, α-connectivity).
- **P2b — level-set inclusion trees: B′, E, F′** (trees of shapes on L/a/b; component trees on four
  evidence lanes; the multivariate tree of shapes).

**Best-developed instance: F′**, on stated properties of the representation rather than polish. F′'s tree
is the only one in the group that is **complete and exactly invertible** (*"no image information is
discarded — the image is exactly reconstructible from it"*), **self-dual** (does not privilege
bright-on-dark, and covers come both ways in equal measure), and **invariant to monotone contrast
change** — which is most of what a re-encode does to a flat field. It has exactly one noise-handling
step, names it as the design's most consequential judgment, carries the correctness test the whole group
needs (rebuild the image from the tree, require exact equality), and prices its own **kill gate at three
days**. Against it: F′ box-downsamples to a working grid, which the input policy forbids and F′ (blind)
could not know; and its cost is the group's highest.

**What each uniquely contributes:**

- **B** — the only **text detector reading type's manufacture** (stroke width as twice the median ridge
  distance; components grouped by agreement of stroke width, height, collinearity and colour), with
  mediocre recall conceded on purpose. The **parse-type census** as a shipped output, separating "the
  parse failed" from "the parse succeeded and the reading was wrong" — *"a system that cannot tell those
  apart cannot be steered."* **"The field is what reaches the frame"** — a one-union-find-query stability
  argument no level-set arm has. The **`unparsed` degenerate branch** shipping a dull, valid, honestly
  labelled palette. And the **chaining pathology as the gradient rule**, structurally unavailable to the
  other three.
- **B′** — **MSER stability** as the node filter, converting "which regions are real" from a threshold
  into a local minimum of a derivative. **Three channels, not one**, so a region is invisible only if it
  matches its surround in L *and* a *and* b — the correct blindness, aimed at the fragile isoluminant
  accent. The **five-way field verdict** with **centroid migration** as the gradient condition. The
  argument that **coarsening a tree of shapes merges nodes monotonically** — *"a coarser bin can never
  split a region in two, which is exactly what a k-means bin edge does"* — the group's cleanest statement
  of why quantisation is safe here. A **pre-registered 25% bar with a matched control**, and a
  **verdict→`ground_type` mapping** so the P6 cross-check runs corpus-wide with no reviewer time.
- **E** — the only **stability theorem** in the phase, with the numbers computed. **Four evidence lanes**
  built so that *adding a lane can only add candidates, never remove one*, the H↑ lane's axis derived
  from the image's own dominant chromatic direction so no hue constant enters. The **peel's stopping rule
  with no threshold in it** (widest plateau in log α of colour mass moved). **Persistence on two axes**
  as the answer to belonging — *"rarity is the wrong axis."* And the **ground image** as a review
  stimulus: *"is this what is behind the stuff?"*
- **F′** — completeness, self-duality and contrast-invariance as *stated properties* rather than hoped-for
  behaviours. **RDP as the guide-stop rule**, argued as an exact match to the ruling's semantics rather
  than an implementation of them. **Counters** — the hole in an "o" is a nested child shape on the far
  side of its parent's level — as a scale-invariant glyph signature finding 8pt credits and a
  cover-spanning glyph with the same test. The **grain sweep** as a per-file self-reported robustness
  readout. The **three-day kill gate**. And the only proposal in twelve arguing that the *robustness
  metric* may be the thing that gives way (§7, N4).

**Grafts.**
- **B's parse-type census onto every member of P2** — it is the census that makes the group steerable and
  only B has it.
- **B′'s three-channel construction onto B.** B's single α-hierarchy on OKLab distance is isoluminant-blind
  in exactly the way B′ designs against; E and F′ already have the multi-channel property.
- **F′'s exact-reconstruction correctness test onto B′ and E**, both of which name silent tree bugs as
  their real build risk and propose weaker checks.
- **E's matched-size control onto B and F′** (B′ already has one).
- **B's "what reaches the frame" as a cheap corroborator beside any chain search** — none of the level-set
  arms uses it and it is the most perturbation-proof field criterion in the group.

**A prototype would have to demonstrate:** (i) **reachability of endorsed colours from node
representatives, against a matched control** — three of four propose it and two pre-register bars; it is
the cheapest paradigm-level test in the phase and it clears or kills the whole group at once; (ii) **that
the tree is correct**, by exact reconstruction; (iii) **what fraction of the corpus reaches the degenerate
path**, since every arm here names photographic covers as its worst stratum and the size of that bucket
bounds the ceiling; (iv) **the dither prediction** — B′ pre-registers ≤10% of palettes moving, E predicts
a difference in kind rather than degree; (v) **cost at native resolution**, since this is the phase's
expensive end and both B′ and F′ say so.

### P3 — Per-pixel fields and ranks, no intermediate object

**Arms: D, D′.**

**Best-developed instance: D′**, on two mechanisms — but this is the pair where "best-developed" is least
safe, because D′ buys its battery by permitting exactly what D banned (§1.4). D′'s **percentile-rank
construction** makes evidence combinable with no weights and no conversion constants (*"there is
consequently nowhere for a hundred tuning constants to live"*), a direct mechanical attack on success
criterion 2 that D lacks; and its **six-field battery from summed-area tables** covers field-ness,
ramp-ness, roughness, surround separation and support in one exact-integer machinery, where D has two
fields and reaches for a bespoke ink annulus.

**What D uniquely contributes:** the **stricter line**, worked out against its own interest and followed
into the cost. The **rank cascade**, permutation-invariant by definition, so the relabelling failure class
is unreachable rather than fixed. **Trimmed ranks rather than extrema** at the ramp's ends — round 1's
stress test found D the only arm to do this and to name the trim as a measured parameter. And the
**verify-and-step** loop: a failing colour is not adjusted, the rank steps and everything downstream
re-runs, so a relocated defect is unreachable.

**What D′ uniquely contributes:** percentile products; the **invertibility line as an auditable
operational rule** (*"no data structure in this algorithm is indexed by colour"*) with a **stated
equivalence test** that makes the seat's own boundary checkable rather than argued; the **accent floor
confined to a collapse gate**; the **margin map**; alpha as a per-pixel confidence weight; and the
**greedy-lockout risk named before the prototype**, with the instrument that would expose it.

**Grafts run both ways.** D's rank cascade should replace D′'s argmax-plus-tie-break wherever a
population becomes a triple — it is strictly stronger on the relabel gate. D's trimmed-rank endpoints
should replace any extremum in D′. Conversely D′'s percentile products and its collapse-gate confinement
belong on D, whose universal trim level τ D itself calls *"a parsimony bet, and it may be wrong in one
place."*

**A prototype would have to demonstrate:** (i) **the rankability test, run before anything is built** —
for each endorsed role colour, where in the field's rank order the pixels bearing it sit; concentrated
near the ends = tunable, roughly uniform = refuted, *"because no setting of τ or β is a re-ordering."*
Both arms independently establish that **reachability is vacuous for this paradigm**, so any
cross-paradigm measurement plan must carry a second instrument for P3. (ii) **Which line is the right
line** — the pair's own open question, and decidable: build D′'s π/ψ battery, rebuild it under D's ban
(rank filters only, no local mean), compare on the dither and re-encode arms. If the linear-filter
version is no less stable, D's ban cost a toolbox for nothing; if it is measurably worse, D′ is built on
the operator its own seat should have excluded. (iii) The field-criterion plateau on undesigned covers,
which both arms name as the class where the criterion returns "whichever patch is smoothest". (iv) Cost
and memory at master resolution — both admit seconds-scale at 3000², and D admits ~200 MB transient at
4000².

### P4 — A portfolio of accounts under a selector

**Arms: C, C′.**

**Best-developed instance: C′**, because its selector is **derived rather than declared** — one currency,
one estimator, one projection rule, six design matrices — and because it has a mechanism C lacks: the
**outputs-agree check**, which asks first whether the top members even publish different palettes and
records the selection as *immaterial* when they do not. C′ argues that absorbs the large majority of thin
margins, and it is the only mechanism in either arm that makes a portfolio's central risk mostly
disappear rather than mostly manageable.

**What C uniquely contributes — and it is a lot:**
- **Coverage as a within-image ranking only**, never compared across images, so no threshold in the
  selector can ever be corpus-fitted. C′ explicitly gives this up. **These are opposite commitments and
  only C's answers success criterion 2.**
- **"A free parameter can be spent as a portfolio member instead"** — instantiate a member twice at two
  settings and let the selector choose per image, converting a human decision into a runtime one. Still
  the only direct architectural attack on criterion 2 in twelve proposals.
- **The runtime nuisance ensemble**, with trials-survived as an integer veto and the replicate spread as
  a per-image noise floor on the ranking. Nothing else in twelve does per-image cliff detection at
  runtime.
- **Members that are genuinely different methods** — which is what makes C a portfolio and C′ a
  model-selection procedure.
- **The scoreboard**: per member, admissible or not *and which invariant refused it*. *"Nothing in this
  system is unpublishable in silence"* — the only mechanism in the phase that produces the evidence the
  standing demotion rule needs, automatically.

**What C′ uniquely contributes:** description length as the currency; the outputs-agree check; the block
bootstrap with a **stopping rule rather than a resample count**; the fewer-parameters tie-break derived
from the loss itself; a **measured** noise scale σ from adjacent-pixel differences; and the granulometry
knee for foreground.

**Grafts.** C's within-image coverage and its scoreboard belong on C′ without touching its currency —
record both, and use bits only for the field decision. C's ensemble belongs on C′ beside or instead of the
bootstrap, since C shows it costs roughly 2× the arithmetic in one pass. **C′'s outputs-agree check
belongs on C immediately**: it is cheap, currency-agnostic, and removes most of the contested-selection
risk C names as its own exposure. C′'s deletion criterion is sharper than C's.

**A prototype would have to demonstrate:** (i) **that selection adds anything** — C's own three-way
comparison (post-hoc oracle selector vs the real selector vs always one fixed member); if oracle ≫ real
and real ≈ fixed, *"selection adds nothing and the portfolio is an expensive way to run one extractor"*;
(ii) **whether the ink roles are member-independent** (§3.5); (iii) **per-member ablation**; (iv) whether
the ranking correlates with reviewer preference at all — both arms pre-register that no correlation kills
it.

### P5 — Robust parametric field-over-position plus marks

**Arm: F** alone, now that F′ has moved into P2. Only instance, so "best-developed" does not apply.

**What only F has:**
- **The invariance interval** — every free parameter ships with the per-image range over which the
  emitted palette is byte-identical. *"A parameter whose interval covers the whole plausible range is not
  free in any meaningful sense, and saying so with evidence is the difference between five parameters and
  five excuses."* It is **paradigm-agnostic**, it is the only instrument in twelve for judging a
  parameter claim empirically rather than definitionally, and it is the phase's answer to the problem
  that twelve arms counted parameters under a dozen different definitions.
- **Margins on all four discontinuous declarations**, after conceding openly that *"a binary decision on a
  continuous quantity flips somewhere."*
- **Affine-versus-constant by a statistical test against a sampling distribution at a stated confidence
  level**, chosen specifically against the false-positive mode F most fears — JPEG-blocky skies and lens
  vignettes, which produce small but systematic planes a magnitude threshold would over-call or need
  per-corpus tuning. Nobody else settles it this way.
- **"Local" field**: a mark's separation is measured against the field-like component it actually sits on,
  never a global background — text on an overlay panel is measured against the panel. The candidacy-wall
  fix stated at the right granularity, and only F states it.

**A prototype would have to demonstrate:** (i) the pre-registered 30% bar — are endorsed accents
recoverable as *some* component's colour at *any* admissible setting; (ii) **whether endorsed surfaces on
gradient covers are ramp ends or ramp interiors** — worth running whichever paradigm goes forward, because
**nine of the twelve arms make the ramp's ends *be* the two field roles**, so a disagreement here is at
the core of three paradigms at once; (iii) whether the invariance intervals come out wide, in which case
F's five parameters are fewer than five and the instrument should be lifted onto the winner regardless;
(iv) the elimination question `STRESS_TEST.md` §4.1 raises — F's pool is manufactured by three
summarising stages and F names no elimination site. **F′ shows the fix is available from inside the same
unseated position: name the one filter.**

### P6 — One continuous joint measure over (colour, surround, position)

**Arm: E′** alone.

E′ is deliberately **not** placed in P1 despite using description length, and the reason is the same
criterion §3 uses. E′'s energy has seven named term families with **exchange rates between them that E′
itself counts as free parameters 3, 4, 6 and 7**. A and A′ have one exchange rate and derive or inherit
the rest. Description length appears in E′ only for the 0-D vs 1-D field decision. So E′ is a
**multi-term weighted energy** — precisely the family round-1 E rejected on the ground that *"its weights
**are** its free parameters."*

**What only E′ has:**
- **The figure–ground measure** as the representational commitment, with a direct testable objection to
  the whole of P2: *"boundaries are the least stable object in a re-encoded JPEG — the boundary moves and
  every region statistic moves with it. **Blur is the stable surrogate for 'what is this sitting on'.**"*
  Made by the arm that considered P2's stability theorem and declined it.
- **Habitual ground `B(v)`** — the mass-weighted mean surround of a colour's pixels: the colour it most
  often sits on, *"which makes 'would this work as text' answerable **before the background is known**."*
  Nothing else in twelve can ask that question before the field is decided, and it is what lets E′
  evaluate all four roles jointly without ordering them.
- **Identity coverage as a term in the objective** — a mass-weighted transport cost from the artwork's
  chromatic mass to the published set. P5, the most frequent complaint class, moved out of the census and
  into the loss, *"mass-weighted and floorless… the asymmetry the pathology asks for, and the reason it
  must not be an invariant."* The most direct answer to that hazard in twelve proposals.
- **The lattice-as-quadrature discipline** — cell width well below the kernel bandwidth so every read is
  Lipschitz and no cell boundary can flip an outcome, with the stated consequence that *"if anyone tunes
  it, the design has been violated."* The cleanest statement in twelve of how to use a grid without
  reintroducing a bin edge.
- **The alpha fixed point with a refusal condition.** Ten arms derive the matte from the image; only E′
  makes it a convergence test that can fail.

**A prototype would have to demonstrate:** (i) E′'s pre-registered robustness bars — **dither agreement
≥ 0.98 and jpeg-q92 ≥ 0.95 on the regional bar** — the only absolute numeric robustness targets
pre-registered in the phase (and see §7, N4, on which metric they are stated against); (ii) that the
pruned search never excludes an endorsed colour; (iii) **whether the exchange rates can be anchored at
all** — this is the paradigm's exposure and round-1 E named it in advance; (iv) whether blur really is
more stable than boundaries under re-encode, which is E′'s stated reason for rejecting P2 and is directly
measurable against a P2 prototype.

### 4.1 One cross-paradigm note

**The twelve falsifiers are not all runnable on all paradigms.** Reachability-against-endorsed is the
natural cross-cutting measurement, and P3 establishes — from both arms, independently — that it is
vacuous there. A Phase 2 measurement plan needs at minimum two instruments: **reachability with a matched
control** for P1, P2, P4, P5 and P6, and the **rank/percentile-position test** for P3.

---

## 5. What round 2 cost, and what it bought

**Cost.** Six more authoring runs, one packet rebuild and re-verification against 73 disclosure markers,
one packet rename, and this analysis. **No confinement audit has been run on round 2**, so the pool
doubled while the independence evidence did not.

**Genuinely new material — mechanisms that appear in round 2 and nowhere in round 1:**

1. **The contract schema as the model's prior** (A′).
2. **Description length as a portfolio selector's currency** (C′) — which is what makes §3 answerable.
3. **MSER stability as a node filter**, and the argument that **coarsening a tree of shapes merges
   monotonically** where a k-means bin edge splits (B′).
4. **Percentile-rank products as a weight-free combination rule** (D′).
5. **Confining an uncalibrated constant to a collapse gate** so its error cannot steer a selection (D′).
   Generalisable to any `[UNCALIBRATED]` quantity.
6. **Eliminating `ACCENT_FUNCTIONAL_DISTANCE` entirely, with no successor** (F′). Round 1 produced
   nobody who removed it.
7. **The multivariate tree of shapes** with completeness / self-duality / contrast-invariance as stated
   properties, plus **counters** as a scale-invariant glyph signature (F′).
8. **The grain sweep as a per-file self-reported robustness readout** (F′) — robustness as a per-image
   warning the system emits about its own answer rather than a corpus statistic.
9. **The outputs-agree check** — ask whether the selection was *material* before measuring its margin
   (C′).
10. **Habitual ground** — answerable before the background is decided (E′).
11. **Identity coverage as an objective term** rather than a census (E′).
12. **The alpha fixed point with a refusal condition** (E′).
13. **The three-day kill gate** — a scalar tree on lightness alone suffices to run the representation
    falsifier before the expensive build (F′). The cheapest pre-build gate proposed in twelve.
14. **The curvature tie-break among excursion-reducing stops** (C′ and D′, independently).
15. **The claim that the robustness *metric*, not the paradigm, may be what gives way** under the
    exact-pixel rule (F′) — §7, N4.

**What round 2 restated.** The bulk of it. Every convergence in §2 was already visible in round 1 in some
form; round 2 raised arm counts and, in four cases (the representative rule, the derived matte,
ordering-over-threshold, and gradient-boolean-as-model-selection), converted a six-arm observation into a
twelve-arm one that crosses seats and rounds. **Round 2 produced no new paradigm.** P1–P6 are the same
six families the round-1 map found, with F′ moving from P5 into P2 and E′ opening P6 in a direction
round-1 E had explicitly considered and rejected. **The idea pool doubled; the paradigm count did not.**
That is the honest headline: the reviewer's directive was about the idea pool and it delivered on that;
it did not widen the space.

**The three known differences (`COMMISSIONING.md` §2.1), against what I observe:**

1. **The de-leak.** Bears on exactly one comparison, and I flag it wherever B/B′ differ (§1.2). Round-1 B
   read that the semantic route "measures weak" and that one arm is seated on parse-then-assign; B′ read
   a clean packet. **No B/B′ divergence is claimed as evidence about the seat.** What the de-leak *did*
   buy: a clean-packet author, given the same seat sentence, also builds a plain-code model-free parse —
   so seat B's direction does not require the leak to produce that.
   **A second, downstream effect is visible and worth recording.** Four round-1 arms were told that one
   arm is seated on parse-then-assign, and E — the control on the seats — rejects *"semantic
   parse-then-assign"* in its §10 using a hyphenation that appears nowhere in its packet except the
   manifest (`CONFINEMENT_AUDIT.md` Q2). **E′'s §10 contains no rejection of parse-then-assign at all**;
   it rejects clustering, segmentation-first, analysis-by-synthesis and topological persistence. That is
   exactly what the de-leak predicts. Recorded as consistent, not as proof.
2. **The confinement rule naming the proposals directory.** Round 1 had two self-disclosed listing-only
   accesses. **I cannot say whether round 2 was clean, because no audit exists.** Named as a gap rather
   than assumed away.
3. **Cost sections must state the pixel count.** **This one worked completely, and it is the cleanest
   measurable effect of any round-2 change.** Six of six primes named a pixel count, against three of six
   in round 1. Normalised to ~1 MP the primes land: C′ 0.07–0.145 s · A′ 0.15–0.35 s · E′ ≈0.4 s ·
   F′ 0.35–0.62 s · D′ ≈0.5–0.9 s · B′ 0.4–1.0 s — a spread of about 9×, with **the two tree-of-shapes
   arms at the expensive end**, which is a mechanism fact rather than an estimating-style fact. Round 1
   could not extract this at all: `DIVERGENCE_MAP.md` §5.1 could only report that A, B and C named no
   size. **One sentence in a launch instruction bought a comparable cost axis.**
   A second thing falls out of it: **five of six primes independently flag the same cliff** — no
   resampling at 3000² pushes them into seconds (A′ 0.8–1.6 s, C′ 0.6–1.2 s, E′ 2.5–3 s, B′ and D′ 4–9 s)
   — and **three (B′, D′, E′) independently propose the same remedy and refuse to claim it**: earn §1's
   downscale-above-W carve-out by *measuring* palette-equivalence, and say plainly they have not measured
   it. Round 1 half-had this; round 2 sharpened it into a shared, declined obligation.

**One caveat the commissioning document does not list, carried forward unchanged.** Round-1 F's
ten-section shape came from its launch instruction rather than the brief (`DIVERGENCE_MAP.md` §7.2), and
the same is true of F′. **Structural similarity of headings across the twelve remains evidence about the
launch instructions, not about the brief**, and I have used section shape as evidence nowhere.

---

## 6. The stress test, six proposals later

`STRESS_TEST.md` judged round 1 only and its author flagged the staleness. Not re-run here. Per prime:
would it plainly change a round-1 verdict?

### 6.1 A6 — the scrambled twin. **No prime answers it. 12 authors, 2 rounds, 0 poses of the test.**

Searched every prime for scramble / shuffle / tile / permutation / rearrangement language: nothing. The
round-1 pattern repeats exactly — the primes assert the *first half* (their evidence is spatial, not
colour-statistical) and none poses the test or predicts the split.

- **D′ makes the strongest statement of A6's premise anywhere in twelve proposals** and still never poses
  it: *"A histogram knows that a colour occurred 4,000 times; it has already thrown away that those 4,000
  pixels are the interior of one letterform. **That is the fact the reviewer is looking at.**"*
- **B′**: *"the regions a human can point at… are maximally stable extremal regions of L, a or b."*
- **F′**: *"a region-selection problem wearing a colour-selection costume."*
- **E′**: a blur ladder, position in the frame, border affinity, spatial spread — every one
  scramble-sensitive, none named.
- **A′ and C′ never raise it**, exactly as A and C did not. And the round-1 finding about C sharpens:
  **C′'s exact colour census and its projection rule are fully scramble-invariant while its code length is
  not**, and C′ never says which half of its answer would move.

`STRESS_TEST.md` §2.1 concluded the miss is *"a property of the briefing or of the problem, not of any
author."* **Round 2 confirms it with six independent replications against a different packet.** A6 remains
a Phase 2 prototype question, unchanged in value: near-zero marginal cost beside dither, re-encode and
relabel in the harness, and the only falsifier for "my paradigm reads structure" that needs no reviewer.

### 6.2 D3 — fitted to what has already been seen. **No prime answers it either, and the near-misses replicate one for one.**

- **C′** repeats C's immunity-plus-bench pattern: parameter 1 is *"the smallest C at which member ranking
  stops changing across the **200-artwork tuning bench** and the resolution ladder"* — fitting to
  artworks it will be judged on, stated plainly, with no detector.
- **F′** repeats F's prevention-not-detection pattern: parameter 3 anchored on a **synthetic corpus of
  typefaces and non-glyph shapes**, *"a measurement of geometry, not of taste"*; parameter 1 on the
  dither corpus. Never framed as an answer to overfitting.
- **D′** repeats D's instrument anchoring: parameter 1 swept against the harness's jpeg-q92 and dither
  arms *"without the reviewer"*.
- **B′** repeats B's control-not-detector pattern: a matched control inside the falsifier, no seen/unseen
  split.
- **E′** repeats E's instrument anchor: parameter 2 checkable at dev time against oracle strata.
- **A′** names nothing, exactly as A named nothing — and goes slightly further into the hazard: its
  two-day falsifier scores *"the 351 endorsed palettes, the 166 acceptable and the 37 known-bad **against
  each other**"*, a rank correlation on the set it will be judged on, with no holdout named.

**0 of 12 offer a seen-versus-unseen measurement.** The stress test's conclusion stands and is better
supported: the instrument half is already a Phase 2 entry condition, and the process half — *require each
prototype to declare, before it is tuned, which parameters are being set from artworks it will later be
judged on* — is confirmed cheap, because **six more arms just declared it unprompted.**

**And round 2 gives a cleaner reading of the `not owed` flag than round 1 could.** Both unanswered
challenges are `not owed`, and both remained unanswered when six fresh authors ran against a *de-leaked*
packet. So withholding is not the explanation for these two misses: the packet changed and the misses
were identical.

### 6.3 Round-1 verdicts a prime plainly changes

Six, and two of them matter.

1. **`STRESS_TEST.md` §4.1 (F on B1) is not repeated by F′ — it is answered.** F asserted absolute
   no-elimination over a pool built by three summarising stages and named no elimination site. **F′, from
   the same unseated position and a smaller packet, builds a complete and exactly invertible
   representation, applies one filter, and names it**: *"The grain filter decides what is noise. This is
   the most consequential judgment in the design and it is a single number applied uniformly, which is the
   point: one place to be wrong, one place to audit."* Same position, opposite disclosure behaviour. This
   is the strongest "a prime changes a verdict" result in this pass, and it moves F′ out of the third
   eligibility regime (§0.1).
2. **`STRESS_TEST.md` §4.3 (E on C9, one ruler for everything) does not survive into E′.** E declared the
   named evasion verbatim as a discipline. **E′ carries two rulers by construction** — parameter 1 is the
   bandwidth at the bar, parameter 5 is the accent anisotropy, and E′ states the barriers are inherited
   digit for digit while the anisotropy is its own.
   **But F′ makes a related move and defends it, which is a genuinely new answer to C9:** F′ consumes the
   bar in four roles, names the risk in the same paragraph, and argues compliance with §3.1's warning on
   the ground that *"the accent's **ranking** is lexicographic and only its **admissibility** uses the
   bar."* That is a cleaner answer than E gave, and it generalises: **reusing one ruler is safe exactly
   where the ruler answers an identity question and the functional question is answered by an ordering.**
3. **`STRESS_TEST.md` §4.4 (F on B2, a shortlist presented as exhaustiveness) does not survive.** F′ has no
   per-role shortlist — roles are a joint choice over the whole surviving node set — and its only
   capacity-shaped step is the grain filter, priced as free parameter 1 with **two independent anchors**
   and reported via the grain sweep. The phase's one unexamined shortlist is not repeated.
4. **A4 (bars and frames winning on area) improves in both region-tree primes and does not improve in
   E′.** E was `unc` and the stress test called it E's worst hit. **B′ names enclosure as a first-class
   parse element** (*"a frame is a field-shaped node that is **not** the ground"*); **F′ handles it
   structurally** (*"a border is a field candidate most of whose area is accounted for by a single child;
   the child is the true field and the border is a legitimate surface candidate… again not a patch"*).
   **E′ carries a border-affinity statistic that *rewards* border mass in the field roles** and names no
   enclosure handling — which points the wrong way for a frame. The round-1 verdict against E is
   reproduced and arguably sharpened.
5. **A3 (present but not belonging — overlays, badges, watermarks) becomes a paradigm-level finding.**
   Verified by text search across all twelve. Round 2: **B′** (an overlay sticker is a compact, strongly
   rectangular node near a corner), **D′** (*"an overlay badge is a small high-ψ region that competes for
   accent on its merits"* — an improvement on D's `unc`) and **F′** (scrims handled structurally: *"the
   scrim is the glyph nodes' **parent**, so the field a text node is evaluated against is its parent node
   — always, with no special case, no scrim detector, and no patch"*) all answer it; **A′, C′ and E′ never
   mention an overlay, badge, sticker or watermark at all** — a regression against A, C and E, all of
   which at least confronted it. **Over twelve, A3 is answered by the arms with a region or per-pixel
   spatial vocabulary and unanswered by the arms without one.** That is a property of the paradigm, not of
   the author, and six arms could not show it.
6. **A7 (colour-direction coverage / P5 identity coverage) is answered better than anything in round 1, by
   one arm.** **E′ puts identity coverage into the objective** as a mass-weighted transport cost — *"P5,
   the most frequent complaint class, moved out of the census and into the objective… the asymmetry the
   pathology asks for, and the reason it must not be an invariant."* **A′** adds the diagnostic form: the
   **naming-gain curve**, bits saved by naming each colour, readable against the reviewer's own corrected
   accents. Neither existed in round 1.

---

## 7. New defects, for `CONTRACT_DEFECTS.md`'s next pass

Collected from the primes, de-duplicated against the ten defects that document already carries. **I have
not edited `CONTRACT_DEFECTS.md`.**

### N1 — `PHASE_0_DECISIONS.md`'s Scope line advertises material the trim removed

**Bucket: INCONSISTENCY (packet construction). Raised by E′; also the reviewer's own.**

The delivered extract's Scope line — **verified at `phase-1/packet/PHASE_0_DECISIONS.md` line 27**, inside
the delivered §§1–6 — reads:

> **Scope:** input policy · output contract · metrics · corpus/legacy data · oracle label semantics ·
> **measured resolution floors**. Referenced from `V3_PLAN.md` §6.

§7, which carried the floors, was trimmed. **So the packet promises material it does not contain, on the
document's own first screen.** E′ verbatim: *"`PHASE_0_DECISIONS.md`'s own scope line lists 'measured
resolution floors' among the document's contents; the delivered §§1–6 state none."*

**Cost.** This is the **third independent route** by which the resolution material has been reported
missing — A, B and D asked for it in round 1, A′ and E′ in round 2 — and it is worse than a gap, because it
tells an author the answer is inside a document they have been given. **Fix:** strike the clause from the
extract's Scope line, or add it to the provenance header's list of withheld sections. One line either way.

### N2 — the reviewer's accent ruling and the retained conjunction point different ways

**Bucket: INCONSISTENCY. Raised independently by A′, B′ and D′ — the most-reported defect of round 2.**

`PHASE_0_DECISIONS.md` §2 quotes the reviewer, 2026-08-04: *"the contrast limit between foreground and
background/surface/gradient, and between accent and background/surface/gradient should be about APCA
contrast, **not APCA and color distance**. Color distance is used between background and surface, or
between foreground and accent."* Read plainly, that removes the colour-distance dimension from the
accent's contrast clause. The surrounding text of §2 and §4's invariant 4 then **retain** it, as a
pointwise conjunction running on `ACCENT_FUNCTIONAL_DISTANCE`.

**This is not D4.** D4 concerns invariant 4's *closing paragraph* ("may properly live in color distance
(already enforced by distinctness)") being contradicted by §2's rewording, and its recommendation is to
strike that clause and point at §2. **After that fix, §2 still contains the quoted ruling and still
contains the conjunction**, so N2 is untouched by it.

**Cost.** All three primes designed against the retained mechanism and all three said why. A′ states the
consequence exactly: *"if the plain reading of the ruling is correct, my feasible set is slightly larger
than it should be and nothing else changes."* Three of six primes hit the same wall.

### N3 — the de-leaked manifest mis-describes what the packet carries

**Bucket: INCONSISTENCY (packet construction). Raised by B′.**

*"`MANIFEST.json` lists `ground_type` among the questions carried 'by id only';
`catalog/ORACLE_QUESTION_INVENTORY.md` §A.1 carries its full vocabulary, per-value definitions and
criterion text. The claim holds for §A.2's derived form, not for the file."*

**Cost.** Low in outcome. But it is an accuracy defect **in the rebuilt, re-verified manifest** — evidence
about the coverage of that verification: it checked for disclosure markers and did not check the manifest's
own claims about what it carries. (Confirmed independently here: the round-2 `packet/MANIFEST.json`
string-matches negative on all seven of the round-1 leak markers, so the de-leak itself held.)

### N4 — the robustness harness's dither metric may be unsatisfiable under the exact-pixel rule

**Bucket: DESIGN GAP — and an *instrument* gap rather than a contract-text one, so it needs a third row or
a companion note. Raised by F′. This is the item to raise loudly.**

F′ verbatim:

> Exact-pixel publication and ±1-LSB dither invariance are in tension *in principle*: if a dither perturbs
> the pixels, the set of exact triples present in the image changes, and a system obliged to publish an
> exact pixel cannot in general publish the identical triple. I therefore do not claim bit-identical
> stability and I do not think **any conforming system can**. What I claim… is stability of the
> *decisions* — role identity, the gradient boolean, the stop count, and the collapse and escape flags —
> with published colours required to move less than the same-colour bar. **If the harness currently scores
> dither robustness as hex equality, that metric is unsatisfiable under the exact-pixel rule and, by the
> standing rule that an instrument which blocks good work is the thing that gives way, I would argue the
> metric rather than the paradigm.**

**Why it must be settled before any prototype's robustness number is quoted.** The phase has produced
pre-registered robustness predictions stated against **at least two different metrics**, by authors who
did not agree about which one the harness applies:

- **A** predicts *"near-total agreement **at the same-colour bar** and materially less at exact hex"*, and
  warns: *"if exact-hex agreement is read as the headline, this design will look worse than it is."*
- **E′** pre-registers absolute numbers **on the regional bar** (dither ≥ 0.98, jpeg-q92 ≥ 0.95) and says
  outright: *"I cannot promise byte-identical hexes under dither; I promise agreement on the contract's
  bar."*
- **B′** pre-registers *"more than 10% of palettes move"* without naming the relation.
- **F′** says no conforming system can promise hex equality.

If Phase 2 scores hex equality, **at least three pre-registrations are being read against a bar their
authors explicitly disclaimed.** The fix is not a review round: read `src/robustness/README.md` and state
the answer.

**And the shadow this casts backwards.** The brief's goal 1 quotes *"the ±1-LSB dither moved all 114 test
palettes"*, and **every arm in both rounds reasoned against that figure without being told whether "moved"
means hex or bar.** That ambiguity has been in every packet, in every round.

### N5 — upgrade: enforcing the direction-aware challenger would change contract-visible *outputs*, not only checks

**Raised by F′; `CONTRACT_DEFECTS.md` already carries arm B's version in its closing section, at a lower
severity.**

The existing entry records that B uses the bar for *pixel connectivity*, so enforcing the challenger would
change its parse. **F′ adds a second, different route with a named consequence for a contract field:**

> My design consumes the bar in four places and would behave differently under the scalar and the
> ellipsoid — **most visibly in the collapse test, where the scalar's permissiveness in lightness means
> near-identical fields will collapse when the ellipsoid would keep them apart, which changes the gradient
> boolean.**

The existing entry is framed as *"evidence about who pays if the confirming round ever runs."* F′ makes it
evidence that promoting the challenger is a **behaviour change to the contract's own booleans** — a
different class of thing from a checker becoming stricter, and worth moving out of the closing section in
the next pass. F′ reached it having never seen `PERCEPTION_VERDICT.md`.

### Already carried — recorded so the next pass can dedupe

- **D8 (the SAM cost bracket quoting the warm figure)** — raised again by **A′, B′, C′, D′ and E′**: five
  of six primes. Worth noting as a measure of how visible the defect is; all five priced against the cold
  figure.
- **D6 (the escape as one colour in two roles)** — raised again by C′, with the same reading and the same
  declared dependence.
- **D3 (invariant 2's population floor)** — raised again by D′, which reproduces D's exact reliance on it:
  *"I proceeded on the assumption that there is no enforced population floor."*
- **D10 (stops when the gradient boolean is false)** — F′ raises the adjacent serialisation question (are
  stops role colours plus interior vertices, or a full list including the ends?) and says nothing turns on
  it beyond emission format. Same family; the D10 fix covers it.

### Not defects — for the trim-cost ledger

**A′** asked for the per-question reliability of `enclosure` and `text_dominance`, scoped explicitly to
whether they are usable as *strata*; **D′** asked for the vocabulary of `shading_direction`. Neither
request existed in round 1. Both respect the measures-versus-found line, and both belong with
`CONFINEMENT_AUDIT.md` Q4's tabulation rather than in the defect list.

---

## 8. What this map does not settle

How the proposals are judged; which paradigms go to Phase 2; whether the seats worked as a matter of
policy; and whether the incumbent-paradigm gap in `COMMISSIONING.md` §6(a) should be filled. All four
remain the reviewer's, exactly as §7 of that document left them.

Two things are left open here specifically, and neither is mine to close:

- **Round 2 has no confinement audit.** Every independence claim in §1 and §2 is conditional on one.
- **`DIVERGENCE_MAP.md` §11's observation still holds over twelve:** the bake-off as constituted contains
  **no arm that would use the semantic oracle at runtime.** All twelve decline it. The two round-2 arms
  that mention SAM (B′, D′) want it at development time only, as a reference against which their own
  region or field statistics are validated. Whether that is the roster working as intended or a gap in it
  is still not mine to say.
