# Arm C — a portfolio of accounts, and a selector that audits them

## 1. The paradigm

An album cover is not a colour distribution to be summarised; it is a picture with a *structure*, and
there are only a handful of structures. So do not build one extractor that must be right about every
structure. Build several, each of which **asserts** exactly one structure and would be embarrassing
on the others, and then elect the one whose assertion this particular image actually supports. The
claim worth disagreeing with is the selection principle: **the winning account is the one that
reconstructs the largest share of the artwork to within this project's own definition of "the same
colour", among the accounts that survive being asked twice.** The selector never asks whether a
palette is *good*. It asks whether an account of the image is *true of the image*. There is no
aesthetic model in this design, no learned prior, and no member ever reports a confidence.

Two consequences follow immediately. The **gradient boolean stops being a detector** — it is simply
the identity of the member that won, decided by the same statistic that decides everything else. And
**there is no repair stage**: when a palette fails a contract invariant, the answer is a different
member, not a patch. v2-3's repairs relocated the defect in 13 of 15 cases (§4 meta-rules); a
portfolio replaces repair with re-election.

I am keeping the seat as commissioned.

## 2. Image to contract

Four stages: one shared substrate, a portfolio of labellers, one shared reader, one selector.

### 2.1 The substrate — one pass, and everything else is derived

Decode once at native resolution (no resampling; dimensions from the decoder's header, never a
filename). Transparent input is refused loudly, not flattened. Then make **one traversal of the
pixels** and build:

- **The exact-triple histogram.** Each 24-bit sRGB triple present in the file, with its pixel count.
  This is the source-support oracle: every colour this system can ever publish is a key in it, so
  invariant 2 holds by construction rather than by a check bolted on afterwards. It is also exactly
  the `availableColors` set adjudication wants for reachability.
- **A normalized cell grid**, in *normalized* coordinates so that nothing in the system carries a
  pixel constant. Each cell stores not a mean but a **short list of its own colour modes with their
  masses** — the few exact triples whose same-colour neighbourhoods carry the most mass inside that
  cell, plus the residual mass that fell in no listed mode. That per-cell distribution, rather than a
  per-cell average, is the single choice that makes the selector cheap (§2.4).
- **Per-cell texture mass**: the share of a cell's mass outside its listed modes — a scale-free proxy
  for edge and grain density.
- **Border-ring bookkeeping**, kept separately so a border can be subtracted without a second pass.

The grid is a *summary*, never an image. No published colour is read off it; colours come from the
histogram, always, and always as exact triples.

**Colour identity everywhere is the contract's own same-colour relation, in OKLab, and it is used for
identity questions only.** Per `PERCEPTION_VERDICT.md` the identity and accent-function criteria are
anisotropic in *opposite* directions, so they never share a ruler here: nothing in §2.4 touches an
accent question, and nothing in §2.3's accent rule touches the identity bar. Nor does anything depend
on the bar's exact width — §2.3's reader is built so that narrowing or widening it moves no maximum.

### 2.2 The portfolio — members assert, they do not decide

A member is a **labeller**, not a palette producer. It partitions the grid (and, through the grid, the
histogram mass) into `field`, `ink`, `accent-carrier` and `ignore`, and it names a **field model**:
either *flat* (one colour) or *ramp* (a one-dimensional path in OKLab, parameterised by position along
a fitted image-space direction). That is the entire output of a member. Members emit no score, no
confidence and no palette.

This is the answer to "a portfolio multiplies free parameters". A member does not decide whether its
premise holds — it **asserts** the premise and lets the selector test it. The ramp member needs no
"is this gradient enough" threshold; it fits its ramp and loses if the ramp does not explain the
picture. Where a member genuinely would need a threshold, the move is to instantiate it twice at two
settings and let the selector choose per image: **a free parameter can be spent as a portfolio member
instead.** That trade is not free — it buys compute and moves risk onto the ranking statistic — but it
converts a human decision into a runtime one, which is what success criterion 2 asks for.

The roster I would seat:

1. **Flat field** — the field is what the border ring and the largest same-colour neighbourhood agree
   on. Typography-on-colour, studio covers, badges.
2. **Ramp field** — cell modes regressed against normalized position; the field is the fitted path.
   Gradients, vignettes, sky-and-sea.
3. **Two-mode split** — two chromatic modes with a spatially coherent boundary; the larger is
   background, the smaller surface. Split compositions, strong figure-on-ground.
4. **Ink-first** — works from shape rather than mass: the population that is *thin and widespread*
   (present in many cells, small share within each) is ink, and the field is whatever surrounds it.
   The member for giant text and overlays — the semantic classes the plan asks to be handled
   structurally rather than patched.
5. **Frame-aware** — detects an enclosing ring or bars, labels it `ignore`, re-runs the flat and ramp
   constructions on the interior. Framed and letterboxed artwork.
6. **Mass member** — assumes no coherent field: the field is the largest chromatically coherent mass,
   its lighter and darker satellites carry surface and foreground. Photographs and patterns.
7. **The floor member** — the most conservative account possible: one flat field, one ink, surface and
   accent collapsed. Always admissible, in the worst case through the contract's sanctioned escape
   (pure white or black, only when that literal is genuinely absent from the histogram), maximally
   stable by construction, and at the bottom of the claim lattice. **This is how "no member is
   confident" resolves without any new mechanism**: it wins precisely when nothing beats it, and on a
   genuinely two-colour artwork it wins on the merits.

### 2.3 The shared reader — the contract lives here, once

One rule turns any labelling into a contract palette. Because it is shared, contract compliance is one
implementation rather than seven, and two members that see the same structure cannot produce different
palettes.

**Choosing a colour is a two-step act, and the order is the robustness argument.** First pick a
*neighbourhood*: within a label's mass, find the same-colour neighbourhood carrying the most mass —
an argmax over a smoothed density, so it does not move when a ±1 LSB dither redistributes mass
between adjacent triples, and it does not move when the bar's width changes slightly. Only then pick
the *exact triple*: the most populous triple inside that neighbourhood, ties broken lexicographically
on the 24-bit value. Nothing reads a file name, an id, or an iteration order, which is why the
relabeling failure class cannot occur here.

This order also answers the open question about which colours "belong" to an artwork, for which the
packet says no instrument exists. My answer is structural, not numeric: a colour reaches a role only
by being the densest triple of the densest neighbourhood of a labelled region, so a stray or
compression-artefact triple is unreachable. The corpus fact this leans on: the median endorsed role
colour occupies 8.89e-5 of its image as an exact triple but 1.91e-2 as a same-colour neighbourhood.
Endorsed colours are rare as triples and common as neighbourhoods; a reader that thresholds on triple
mass rejects them, one that thresholds on neighbourhood mass and *then* descends accepts them.

**Roles.** Background comes from the field's dominant neighbourhood; surface from its second, or from
the ramp's far end; foreground from the ink label; accent from the accent-carrier label. Surface
collapses to exactly the background when the field offers no second neighbourhood, accent to exactly
the foreground when no accent-carrier survives the accent rule. Both are declared and exact.

**The accent rule** is where I take a position on an open question. There is no functional threshold
and a single constant has been refused twice, so: publish an accent when its candidate neighbourhood
**moves in lightness** relative to the field it sits on, or when it clears the contract's standing
placeholder distance while being chromatic. When the only candidate differs in hue and chroma alone —
perception-4's fragile case, 0.361 against 0.750 at matched distance — **collapse**. A deliberate bias
toward the weaker claim exactly where the evidence says the claim is unreliable, and the same
conservatism the selector applies in §2.4.

**Gradient and stops.** A flat winner publishes `gradient: null`. A ramp winner publishes stops whose
first is exactly the background and whose last is exactly the surface — the endpoints are not the
fitter's to choose, so the fitter fits the *interior*. A third stop is added only under the contract's
one admissible reason: sample the straight OKLab segment between the ends, find the point whose
distance to the nearest populated artwork colour is worst, and if that excursion exceeds the
contract's excursion criterion, place one interior stop there, snapped to the mass-dominant
neighbourhood nearest it, then re-measure and stop when the excursion clears. I do not reach for a
fourth stop; the packet makes it negotiable on proven utility and I have no utility to prove. A
collapsed surface forbids a gradient outright, so a ramp member whose two ends read as the same
colour is not a gradient member on that image — it is a flat member with a worse story, and it loses.

**Contrast floors** are evaluated by the reader over the whole rendered OKLab ramp, at the parameters'
defaults, as a *filter*: a palette that undershoots is inadmissible and its member loses. It is never
lifted, nudged or repaired.

### 2.4 The selector — three uniform tests and one ordering

The selector is the only complex part, and its complexity is bounded by a rule I will state before
describing it: **the selector contains no per-member logic and no per-member constants.** It reads
three member-agnostic quantities and one fixed ordering. Adding an eighth member adds no line to it.

**Test 1 — Admissibility, a filter.** Does the member's palette satisfy the contract's invariants?
Structure, source support, distinctness, the contrast floors, the gradient endpoint rules. Binary. It
introduces no constant of its own; it reuses the contract's.

**Test 2 — Coverage, the ranking.** Reconstruct the image from the member's own account: field cells
take the field model's colour at their position, ink cells the foreground, accent cells the accent.
Then ask what fraction of the image's *mass* that reconstruction gets right, "right" being the
contract's same-colour relation. Because the substrate stores a per-cell mode distribution rather than
an average, this is a sum over cells of listed-mode masses and needs **no second look at the pixels** —
which is what makes running every member on every image affordable.

The property that matters most about coverage is what it is *not*: it is never compared across
images. The selector only ever ranks members against each other **within one image**, so it never
needs a threshold calibrated on a corpus, and there is no number in it that a human tunes. A rich
photograph scores every member low and a flat cover scores several members high; neither fact ever
leaves the image it was measured on. This is the main defence against the selector becoming the deep
brittle procedure the portfolio was meant to replace.

Coverage is also non-degenerate at both ends, which the robustness harness's warning makes essential:
a member returning the same four colours for every image on earth would be perfectly stable and score
near zero here, while the floor member — which is that member, honestly labelled — scores *highest*
exactly on the two-colour artworks where it is right.

**Test 3 — Stability, a veto with no threshold.** Rebuild the substrate under a small ensemble of
nuisance variants of this same file: a ±1 LSB dither, the two halves of a deterministic checkerboard
partition of the pixels, and a one-pixel border crop — the perturbations the project already declares
should not matter. Re-run every member on every variant and compare each member's palette to its own
clean palette on the contract's relation. Then partition members by **how many trials they survived
intact** — an integer, not a rate, and no cut to choose. Among members that survived *all* trials,
coverage ranks; if none survived all, members are ordered lexicographically by trials survived, then
coverage. Stability never adds to a score; it only gates and orders.

**Disagreement.** Two members disagreeing is not something to average; it is two accounts of one
picture. Because the reader is shared, they cannot disagree about how to *read* a structure — only
about what the structure is, which is the disagreement worth having, and coverage decides it. The
stability ensemble also hands the selector, for free, a **per-image sampling spread of the coverage
statistic**: each member's coverage across its own replicates. If the leader's margin over the
runner-up is smaller than that spread, the ranking is noise and the selector must not pretend
otherwise.

**When the margin is noise, the claim lattice decides.** Prefer the account that claims less: flat
before ramp, fewer stops before more, collapsed before distinct, no accent before accent. One fixed
partial order, decided once by a human, applied without parameters — not a scoring function and not a
rule per case. It is Occam, and it agrees with the contract's own posture, which treats extra stops as
things to be justified and collapses as legitimate.

## 3. Where the decisions live

- **Substrate:** no decisions except its own fidelity (grid resolution, modes per cell).
- **Members:** assertions, not decisions. Each states one premise and is silent about whether it holds.
- **Reader:** every contract decision, once — collapse, escape, endpoints, guide stops, floors — plus
  the one genuine judgment call about the fragile isoluminant-chromatic accent.
- **Selector:** three judgment calls, all visible. That coverage is the right ranking; that stability
  vetoes rather than scores; and the claim lattice's ordering.
- **The roster:** the largest judgment call in the design, and the only one I cannot fully anchor. It
  is also the most *testable* one, because a member can be deleted and nothing needs retuning.

## 4. Free parameters

Independent decisions a human must make for the paradigm, honestly counted for the whole system.

1. **Substrate fidelity** — grid resolution and modes per cell. One decision (they trade off against
   each other). *Anchor:* refine until the selector's member ranking stops changing on the tuning
   bench; the finest setting that changes no ranking is the answer. Measurable, not chosen.
2. **The nuisance ensemble** — which perturbations, and how many. *Anchor:* the robustness harness's
   own arms. These are already the project's declared statement of what should not matter; I am not
   inventing a set, I am adopting one.
3. **The claim lattice's ordering.** *Anchor:* the contract's own text — guide stops are justified not
   granted, the fourth stop is negotiable, collapses are sanctioned. The ordering restates a posture
   the reviewer already holds.
4. **That coverage is measured as area-at-same-colour** rather than as a graded residual. *Anchor:*
   reuse of the identity ruler, so it introduces no number; the decision is the *shape*, and it is
   falsifiable by §7's test.
5. **The fragile-accent stance** — collapse when the only candidate is isoluminant and chromatic.
   *Anchor:* perception-4's 0.750-against-0.361 direction, read as a direction and not a coefficient,
   which is all the packet permits.
6. **The roster** — which structures get a member. *Anchor:* one member per structurally distinct
   account of "what the field is", plus an empirical deletion rule: a member that never wins, or never
   wins on an image where the others fail, is removed. Deletion is safe because nothing recalibrates.

**Six.** Two involve a number and both are settled by measurement rather than taste (1, and 5 only in
the degenerate sense that it inherits an existing placeholder); the other four are structural choices.
The honest caveat is about the shape of the claim, not the count: members do carry internal structure,
and I am asserting rather than proving that it never becomes tunable — because no member emits a
number the selector reads, so no member can be tuned to win; because a member facing a real threshold
is duplicated rather than tuned; and because the selector's ranking is within-image, so no threshold
in it can be fitted to a corpus. What I am actually buying is not *few* parameters but **removable**
ones: every member can be deleted and the system still runs, which no constant in a monolith can
claim, and which the honesty instrument plus a per-member ablation measures directly.

## 5. Cost

Cold, one file, nothing precomputed — which is the frame I have designed against throughout.

The cost is **one decode plus roughly one enriched traversal of the pixels**. Everything after the
traversal — all seven members, all coverage evaluations, all stability comparisons — reads the
substrate, which is thousands of cells and a histogram, not millions of pixels. The nuisance ensemble
looks like it should multiply the traversal and does not: a pixel's dithered value is a function of
its own position and value, so it accumulates into a second histogram during the same visit; the
checkerboard halves partition that same visit; and the crop substrate is the clean substrate minus the
border-ring bookkeeping already kept. Four nuisance substrates cost roughly twice the arithmetic of
one, in one pass, not five passes.

For a typical cover at native resolution this lands in the **low hundreds of milliseconds, dominated
by the decoder** — the cost ordinary per-file image code naturally has, at the target end of the
bracket. It needs no exceptional justification because it asks for none: no model runs, at runtime or
anywhere else. I quote no budget, because none exists; I am saying where in the bracket this sits.

**Members run always, never conditionally**, and this costs almost nothing. Gating members on a
precondition would make the selector's comparison basis differ from image to image — precisely the
image-dependent branching this paradigm exists to avoid. The expensive thing is the pixels, and they
are visited once regardless of how many members exist.

## 6. Build cost

The shared reader is most of the work: gradient endpoints, guide-stop excursion, whole-ramp contrast
floors, collapses and the escape's four conditions are the fiddly contract-bound parts, and they must
be right before any member's output means anything. The substrate is straightforward but wants care
about typed arrays and a single traversal. Members are genuinely small, and the selector is the
smallest piece in the system — the whole point of making it uniform.

Order of work: substrate and reader together, then three members (flat, ramp, floor) to close the loop
end to end, then the selector, then the remaining four — each additive, none requiring the others to
be revisited. The skeleton is reachable well before the portfolio is complete, which matters because
Phase 2 judges trajectory: a three-member portfolio with a working selector is already a measurable
system that runs through the dev loop, the robustness harness and adjudication unchanged.

## 7. Expected failures and falsifier

**Expected failures.** Coverage is mass-driven, so this design will systematically under-rank accounts
hinging on a small but semantically decisive colour — the logo red, the one stripe, the signature
colour on a small element. I expect identity-coverage shortfall to be my most frequent complaint
class. I also expect the claim lattice to bias me toward timidity: a pre-registered prediction is that
**my collapse rate will come out too high and my gradient rate too low** relative to what the reviewer
endorses, and that corrections will more often say "you should have published a gradient / an accent"
than the reverse. And on full-scene photographs every member scores low, margins fall inside the
replicate spread, and the lattice hands the picture to the mass or floor member — sometimes right,
sometimes a beige palette for a vivid photograph.

**Falsifier.** Run the portfolio over the reviewer-endorsed fixtures and record, per artwork, which
member's palette comes closest to the endorsement. Two comparisons then decide the paradigm:

- If a **post-hoc oracle selector** — choosing, with the endorsement in hand, whichever member matched
  best — is far better than my selector, *and* my selector is no better than **always using one fixed
  member**, then selection adds nothing and the portfolio is an expensive way to run one extractor.
  That kills the paradigm, not a setting in it.
- If **coverage rank and reviewer preference are uncorrelated or anti-correlated** there, then the
  ranking principle in §1 is false and no amount of member-writing rescues it.

Both are measurable with the adjudication tool as built, before any review round is spent, and both
are stated so that "the members are still immature" answers neither.

## 8. Exposable intermediate work

This paradigm's intermediates are unusually inspectable, because the intermediate is a *picture*.

- **The per-member labelling**, drawn on the normalized grid beside the artwork: what each member
  thinks the field is.
- **The per-member reconstruction and its residual map** — "here is the artwork as this member
  believes it to be". The most reviewable artifact in the design, because judging whether an account
  is a fair description of a picture is much easier than judging whether a palette is beautiful, and
  it can be asked of a member that lost.
- **The selector's scoreboard**: per member, admissible or not (and which invariant refused it),
  coverage, trials survived, replicate spread, claim weight, winning margin. When a contract gate
  eliminates the account the reviewer would have endorsed, the scoreboard says so explicitly — exactly
  the evidence the standing demotion rule wants, and the structural answer to the goal about candidacy
  walls: **nothing in this system is unpublishable in silence.**
- **The runner-up palette** — a ready-made blinded pair item for a review round at no extra machinery:
  two palettes for one artwork, from one run, differing because two accounts disagreed.
- **The histogram's dominant neighbourhoods**, which are precisely the `availableColors` set
  adjudication's reachability check asks for.

**On the two questions the packet says are algorithm material.** *Transparency:* refuse it loudly, per
the contract — but this architecture answers the matte question in its own idiom if it ever must:
matte-over-white and matte-over-black become two members, and the selector picks per image rather than
a human picking once for all images. *Colour-blind legibility:* I would not ship a diagnostic in
Phase 1, and I record that here it would enter as a fourth uniform selector filter beside
admissibility, touching no member — a reason to leave it out now, not a reason to include it.

## 9. What I asked for

**From `ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md`: the corpus-level distribution of `ground_type`
and `enclosure` over the candidate set — the counts alone, not the oracle's accuracy on them.** My
design turns on this at exactly the point I was least able to anchor: the roster (free parameter 6) is
my largest human decision, and its only honest anchor is "one member per structurally distinct kind of
image, sized to how often that kind occurs". `ground_type`'s vocabulary is very nearly my member
taxonomy, so its corpus counts would say directly which members earn a seat and which answer a
question the corpus does not ask. Counts, not accuracies: the accuracies are a conclusion and would
anchor me, while a histogram of what the corpus contains is a fact about the problem.

**The assumption I proceeded under:** that all five readable `ground_type` values are individually
non-negligible, and that enclosures are common enough to justify a dedicated member. Hence one member
per ground structure, plus a frame member and a floor member. If the true distribution is lopsided,
the response is not to redesign anything but to **delete members** — which this architecture permits
without recalibration, and which is the concrete reason the roster is the free parameter I am least
worried about being wrong on.

---

*Two things in the packet I could not fully reconcile, recorded rather than resolved silently.*
**First:** invariant 2 requires every published colour to meet a "population floor and spatial-spread
test", while open question 2 says the only rule ever built for that judgment had no discriminating
power at any setting and nothing replaced it — so the invariant names a test with no threshold and no
instrument. I proceeded by making the question structural instead of numeric, as §2.3 describes.
**Second:** the escape permits "exactly one" non-source colour at background or foreground with the
partner collapsed, but a sanctioned collapse is exact hex equality, so the collapsed partner
necessarily publishes that same non-source colour too. I read that as one colour in two roles rather
than two invented colours; my floor member depends on the reading, and if it is wrong the escape is
unusable as written and the floor member has no last resort on a genuinely one-colour image.
