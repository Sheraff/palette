# Arm A′ — the palette as the shortest description of the artwork

## 1. The paradigm

**A palette is a lossy description of the artwork written in the contract's own vocabulary, and the
right palette is the one that describes the artwork in the fewest bits.** One scalar energy is
defined over the *entire* contract object at once — four role colours, the gradient boolean, the stop
list, the collapse flags — as the number of bits needed to (a) write that object down under the
contract's own serialization and (b) reconstruct the image from it. The published palette is the
argmin of that energy over the set of contract-legal objects. There is no stage, no shortlist, no
role decided before another; every colour present in the image is a live candidate for every role
until one number ranks the whole configuration.

This is a claim someone can disagree with, and I want it stated so they can. **Nothing here asks
whether a colour is a *good* background. It asks how much of the image that colour, in that role,
accounts for.** Aesthetics are not modelled, contrast is never rewarded (only bounded), and no term
in the energy encodes taste. If the reviewer's judgment is not, at bottom, a preference for palettes
that account for the artwork compactly, this paradigm is wrong in a way that no tuning will repair —
and §7 says how to find that out cheaply.

---

## 2. Image to contract

### 2.1 What is measured from the pixels

Decode at native resolution with the pinned decoder, dimensions from the header. Refuse genuinely
transparent input loudly rather than flattening it (invariant 5). Everything downstream is built
from **two linear passes**, and no pass depends on any artifact computed before this file arrived.

*Pass one* builds a table over the image's **distinct 8-bit triples**. For each triple it accumulates
the exact integer count and the integer spatial moments Σx, Σy, Σx², Σxy, Σy² of the pixels carrying
it. These are integer sums of integers: exact, associative, order-free. That single choice satisfies
the determinism gate and the iteration-order invariance gate by construction, and it survives
parallelisation across scanlines without a reduction-order caveat.

From the per-triple moments alone, the whole-image first- and second-order colour-position moments
follow by summation, and from those the **field geometry** is solved in closed form: a least-squares
plane fit of each OKLab channel against position gives the linear direction; the isotropic component
of the quadratic form gives a radial centre; the residual against angle around that centre gives a
conic. Three geometric parameterisations, no search, no iteration, from statistics that are integrals
over every pixel in the image.

*Pass two*, given those candidate geometries, accumulates the joint distribution of (position
parameter *t*, colour) — a coarse colour lattice against a fixed number of *t* quantile bins. This is
the only thing the energy needs that first-order moments cannot supply: how a colour's pixels are
distributed *along* the ramp, which is what distinguishes a colour that lies on the field from a
colour that sits on top of it.

Positions enter as normalised coordinates and all masses as area fractions, so every content statistic
is scale-free (§1's resolution-agnosticism requirement). One absolute pixel-scale quantity is
admitted and individually justified: the ±1-LSB channel noise floor, which is a genuine
sensor/compression phenomenon and belongs in the residual model rather than in any content statistic.

### 2.2 The description

The image is described as a **field** plus **ink** plus **the unexplained**.

- The **field** predicts a colour at each position. Under the flat hypothesis it predicts the
  background everywhere. Under the ramp hypothesis it predicts γ(t(x)), where γ is the piecewise-linear
  path in OKLab through the published stops and t is the geometry's position parameter, normalised so
  the ramp spans exactly [0,1].
- **Ink** is the pixels the field does not predict, described by referencing one of the two named mark
  colours — foreground and accent — plus a support map saying where the ink is.
- **The unexplained** is everything left: photographic detail, faces, gradients within objects. It is
  coded generically, against the image's own smoothed colour density. This term is large for a
  photograph and small for a poster, and that is correct: it is the part the contract's four colours
  were never going to carry.

The energy is the total code length of image-plus-palette:

> **E(P) = L(pixels | P) + λ · L(P)**

where L(P) is the bit-length of the contract object itself under a fixed code — 24 bits per named
colour, the gradient boolean, the stop count, the positions, the collapse flags, the escape
declaration — and λ is the exchange rate between the two halves (§5, parameter 1). Because L(P) is
literally the output schema's serialization cost, **the contract's own shape is the model's prior**.
A gradient must earn its bits. A third stop must earn more. Collapsing surface into background is
strictly cheaper than not, so a collapse is the null model winning rather than a fallback firing.

### 2.3 Why this makes a small vivid colour beat a large dull one

This is the mechanism the paradigm turns on, so it is worth stating precisely.

Naming a colour is worth doing when the pixels near it become cheaper to code. Under the generic
code, a pixel's cost is −log of the image's own smoothed colour density at that point. A large mass
sitting in a dense part of colour space is already cheap generically, so naming it saves little per
pixel. A **chromatically isolated** cluster — a signature red on an otherwise desaturated cover —
sits where the density is near zero, so every one of its pixels is expensive generically and becomes
cheap once named. Total saving is mass × per-pixel saving, and a small isolated cluster can beat a
large typical one.

Three things fall out of that, each of which the packet flags as an open problem or a patch class:

- **"Does this colour belong to the artwork?"** (brief §3.1, open question 2) is answered as: it
  belongs if it pays for its own name. No rarity rule, no area threshold with no discriminating power
   — one derived criterion in the same currency as everything else.
- **Invariant 2's population floor and spatial-spread test** stop being thresholds in need of
  provenance and become consequences of the naming cost, since a colour's mass *and* its spatial
  concentration both enter its coding gain.
- **Identity coverage (P5)** — the incumbent's most frequent complaint class — is not a check bolted
  on afterwards. A major hue direction with large mass and high isolation is, by construction, the
  largest available coding gain in the image; a configuration that fails to name it loses to one that
  does. There is no "candidacy wall" to make it unpublishable, because there is no candidacy.

### 2.4 The feasible set — legality is a constraint, never a reward

Everything the contract mandates defines the set the argmin runs over, and enters the energy nowhere:
source support (every published colour an exact triple of this image), pairwise distinctness above the
frozen regional same-colour bar with the two sanctioned exception classes, the gradient endpoint rules
(first stop exactly the background, last exactly the surface), no gradient when the surface is
collapsed, the whole-ramp minimum-contrast floors for foreground and accent evaluated in OKLab, and
the escape's four conditions.

Keeping contrast out of the objective is deliberate and is a substantive difference from anything that
scores palettes. The brief is explicit that contrast is *deliberately low*, with the hard minimum a
user parameter defaulting near zero. A system that rewards contrast will drift upward under every
other pressure. Here, the foreground is legible because it is **the colour the artwork already used
for its text**, recovered by reconstruction, and the floor only refuses the pathological cases. The
user parameters therefore act exactly as §2 requires: at defaults the feasible set is the invariant's
own boundary and the output is byte-identical to the unparameterised algorithm; raising a floor shrinks
the feasible set and can only move artworks that actually violate it — zero collateral, structurally.

### 2.5 How the four roles, the boolean and the stops come out

The configuration is a single object and is scored as one. Its parts are decided by *which coding is
cheaper*, not by an ordering of steps.

**Field versus ink.** A role's identity is a fact about how its pixels are distributed. The support of
a field role is broad and low-frequency and is cheap under a coarse support code; the support of an
ink role is stroke-like — small area, long boundary per unit area — and is cheap under an edge/run
code. Assigning a colour to a field role or an ink role therefore changes L(pixels | P) directly. No
separate classifier exists.

**Background and surface.** Under the flat hypothesis, the background is the field colour and the
surface collapses to it unless a second broad support pays for a second name. Under the ramp
hypothesis the two field roles *are* the ends of the fitted path, which is precisely what the
2026-08-04 endpoint ruling requires — the ends are not chosen by a fitter, they are read off the
description at t = 0 and t = 1, as the exact image triples maximising the smoothed colour density in
the neighbourhood of the path's endpoints.

**The gradient boolean.** Published iff the ramp description costs fewer total bits than the flat one.
Nothing else decides it. This is the neutrality property the census wants: the boolean moves only when
the artwork's own residual moves.

**Stops three and four.** A stop is added only when it reduces the excursion of the rendered OKLab
interpolation from the artwork's own colour path — which is the contract's one admissible reason —
and only when that reduction buys more bits than the stop's serialization costs. Curvature has no
reward term at all, so a meandering path can never win: extra knots cost bits and buy nothing unless
they remove genuine excursion. "The flattest path that stays on-artwork" is not a rule I implement; it
is what minimising this energy does. The fourth stop is reachable in principle and will essentially
never be selected, which matches its "negotiable on proven utility" status.

**Foreground and accent.** Both are ink. Which is which is decided first by feasibility — the
foreground has no colour rescue at any distance while the accent has exactly one, so one of the two
assignments is often simply illegal — and, when both are legal, by an **ordering** rather than a
threshold: the accent is the assignment whose ink colour moves further from the field in lightness,
with chroma as the secondary key. That ordering is where `perception-4`'s finding enters — an accent
that also moves in lightness does its job about twice as often — used as a direction, which is all it
was ever licensed to be, and never as a coefficient. The identity ruler (same-colour bar) and the
functional ruler (accent findability) are never pooled; the first governs distinctness inside the
feasible set, the second governs one tie-break inside the prior. They are anisotropic in opposite
directions and this design never lets them touch.

**Collapse.** Collapsing is a configuration with fewer named colours and therefore fewer bits. It wins
whenever the extra name does not pay. The declared flags are what that configuration serialises to.

### 2.6 The search — and why bounding is not elimination

The seat forbids stages that eliminate candidates before a later stage can see them. It does not
forbid *proof*. The search is a branch-and-bound over the configuration space that returns a
**certified** optimum: a coarse colour lattice is used only to compute rigorous upper and lower bounds
on the energy contribution of any exact triple inside a cell, never to select a representative of it.
A cell is discarded only when its **best possible** energy is worse than an already-realised
configuration. That cannot discard the optimum, and the certificate is emitted with the palette.

The distinction matters architecturally, not philosophically. A heuristic stage that drops a colour is
irreversible and invisible; a bound that drops a region is checkable, and a bug in it shows up as the
certificate failing rather than as a palette nobody can explain. It also makes the search's own
constants — lattice resolution, bin counts, queue depth — **testable to irrelevance**: refine them and
the answer must not change. If it does, the bound was wrong. Those are not tuning knobs and I do not
count them in §5.

Cost is controlled by the fact that almost all of the energy is precomputable from the tables of §2.1:
once the per-triple moments and the (t, colour) joint exist, evaluating a configuration is a handful
of table lookups, independent of pixel count.

### 2.7 When the image has no good answer

Degenerate images are not a special path. A near-uniform black cover simply has an energy landscape
where every extra name loses, so the argmin is a collapsed two-colour configuration, declared. If even
that is infeasible — no two triples in the image clear the same-colour bar with a legal contrast
relation — the only remaining feasible configurations are the escape ones, and they carry a large
fixed serialization penalty precisely because a non-source colour is an expensive thing to write down.
So the escape wins **only when nothing else is feasible**, which is the reviewer's own "no other way"
condition given a computable shadow rather than a fake quantification.

### 2.8 The two questions the brief hands to the algorithm

**Alpha matting.** I decline to choose a matte, because a matte is a parameter of the description and
this paradigm resolves parameters of the description inside the argmin. Fully transparent regions
contribute nothing; partially transparent pixels contribute to the ink layer weighted by coverage; the
composite the consumer will actually render is over *the published background*, which is itself part
of the configuration. The matte is therefore the background role, resolved self-consistently, at the
cost of zero new parameters. Today's contract refuses such input outright, so this is a statement of
what the paradigm would do if the policy changed, not a request to change it.

**Colour-blind legibility.** It must not be a term in the energy. Adding it would smuggle a second
criterion into a single-objective design and make it a scoring axis nobody voted for. It belongs, if
anywhere, in the **feasible set** — a caller-supplied constraint exactly like `minTextContrast`, off by
default, byte-identical when off, and able to shrink the legal set without rewarding anything. The
paradigm can then report what CVD-safety *cost*, in bits, by comparing the constrained and
unconstrained optima on the same image. That is a measurement the reviewer could be shown before
anyone decides whether to want it.

---

## 3. Where the decisions live

**All judgment is in the energy. The search has none.** That is the architectural claim, and it is the
inverse of a pipeline, where judgment is smeared across stage boundaries and the interesting decisions
are the ones nobody wrote down.

Inside the energy, judgment concentrates in four places, and each is a single named quantity rather
than a family: the residual scale of the colour code, the exchange rate λ, the spatial code that
separates field supports from ink supports, and two orderings (ramp orientation; foreground/accent
tie-break). Everything else is either the contract's own serialization, an integral over pixels, or a
constant the contract module already owns and I inherit rather than choose — the regional same-colour
bar, the raw-APCA ε floors, `ACCENT_FUNCTIONAL_DISTANCE`. I name those three because a reader is
entitled to know my design reads them; I do not count them as mine, and my design does not depend on
the exact value of any of them. In particular nothing here depends on the same-colour bar's digits in
either direction, which is what the provisional direction-aware challenger warns against.

---

## 4. Free parameters

Five independent human decisions.

1. **λ — the code temperature.** The exchange rate between description bits and serialization bits;
   sets how much explanatory work a colour must do to earn a name. *Anchor:* the endorsed population
   itself — median endorsed role colour exact-triple area share 8.89e-5, same-colour-bar neighbourhood
   share 1.91e-2 — gives a bracket in which endorsed colours must remain namable; a three-rung review
   round at λ/2, λ, 2λ closes it.
2. **σ — the residual scale in OKLab.** The width of the per-pixel colour noise model, and the same
   quantity as the density-smoothing bandwidth. *Anchor:* the contract's frozen regional bar as a
   starting value, then the robustness harness — the correct σ is the one that maximises re-encode and
   dither agreement without merging clusters the reviewer calls distinct. It is measurable without a
   review round, which is why it is the cheapest of the five.
3. **The field/ink spatial scale.** The extent, as a fraction of the image diagonal, above which a
   support is described as field rather than ink. *Anchor:* a review round stratified on the oracle's
   `enclosure` and `text_dominance` labels, because thick frames and giant display type are exactly
   where it bites. *I expect to eliminate this one*: replacing the scale with a context-model binary
   code for the support map makes "broad" versus "stroke-like" fall out of the map's own entropy, at
   which point the count drops to four.
4. **Ramp orientation.** Which end of the fitted path is published as the background. Binary, visible
   to a viewer because the consumer renders 135° linear regardless. *Anchor:* one review round showing
   both orientations of the same ramp.
5. **The foreground/accent ordering.** Which of two legal ink assignments is preferred. *Anchor:*
   `perception-4`'s measured direction, used as an ordering; confirmed by a review round. An ordering
   has no digits to calibrate, which is the general principle this design follows wherever it can —
   **prefer an ordering to a threshold**, because an ordering costs no constant.

Honest caveat: a prototype will contain more literals than five. They will be lattice resolutions, bin
counts and queue depths, and they are distinguishable from the above by a property no v2-3 constant
had — the certificate says changing them must not change the output. That is a testable claim, and if
it ever fails it is a bug report, not a tuning opportunity.

---

## 5. Cost

**Priced at 1024 × 1024 = 1,048,576 pixels**, cold, single-threaded, no warm cache, no precomputed
artifact, no model.

| stage | estimate |
|---|---|
| decode, native resolution | 15–40 ms |
| pass one — per-triple counts and integer spatial moments | 25–50 ms |
| pass two — (t, colour) joint over three candidate geometries | 30–60 ms |
| density estimation on a colour lattice (separable, small) | 5–15 ms |
| closed-form geometry fits, path estimation | < 5 ms |
| certified branch-and-bound over configurations | 30–150 ms |
| **total** | **≈ 0.15–0.35 s** |

The two pixel passes scale linearly and the rest scales with the count of distinct triples, which
grows far slower than area. A 3000 × 3000 (9 MP) rendition therefore lands at roughly **0.8–1.6 s**,
dominated by decode and the two passes.

Where that sits in the bracket the brief describes: this is **ordinary per-file image code**, at the
cost such code naturally has. Two linear passes with a handful of integer operations each, then an
optimisation over a table whose size is set by the image's colour diversity rather than its size. It
needs no exceptional justification at typical sizes. At the top of the resolution range it approaches
the second, and the honest defence is that essentially all of that second is decode plus two passes —
the irreducible cost of looking at every pixel, which §1's no-resampling rule mandates for any
paradigm. The optimisation itself does not grow with the image. No model is loaded, so nothing here
carries the ~6.2 s cold-call debt that runtime masking would.

---

## 6. Build cost

- **Days 1–2: the energy alone, no search.** The energy is a *function of a palette*, so it can be
  computed for palettes it did not produce. Scoring the 351 endorsed palettes, the 166 acceptable and
  the 37 known-bad against each other needs pass one, pass two and the code-length arithmetic — no
  optimiser. This is where the falsifier in §7 runs, before any prototype emits anything.
- **Days 3–6: a first emitter.** Exhaustive search over a coarse lattice instead of branch-and-bound
  (feasible at that resolution, just slow), the contract module imported for feasibility, contract-legal
  palettes out, wired to the dev loop's candidate interface — one module exporting an id and a
  path-to-palette function. Runnable against the robustness harness and auto-adjudication on day 6.
- **Weeks 2–3: the parts that are actually hard.** Proven bounds and the certificate; the ink support
  code; the piecewise-linear path estimation and stop selection with excursion measured against the
  pinned OKLab renderer.
- **Ongoing:** the five parameters, in the order σ (harness, no reviewer time), λ (one round), the
  orderings (one round each), the field/ink scale (the expensive one, or its elimination).

The sequencing is the point: **the paradigm can be falsified in two days at a cost of zero reviewer
bandwidth**, because scoring is enormously cheaper than searching.

---

## 7. Expected failures and falsifier

**Expected to be bad at:** photographic covers and full scenes, where the field model describes nothing
well and the field roles get decided by whatever weak structure survives — I expect over-publication of
gradients on covers with skies. Thick frames and bordered artwork, where a frame is a broad support
that the field/ink code will happily call a field, and a radial geometry fit will happily agree.
Giant display typography, where letterforms are broad enough to be described as field, putting the
text colour in the background role. Those three are the semantic classes the brief names, and they all
land on the same seam — parameter 3 — which is why I flagged it as the one I most want to eliminate.

**Falsifier.** The energy orders palettes. Run it on the endorsed corpus and on the known-bad corpus
and ask whether it orders them the way the reviewer did — not whether my search finds the endorsed
palette, only whether the endorsed palette *scores better* than the alternatives it was preferred to.
If endorsed palettes sit at systematically lower energy than known-bad ones for the same artwork, the
paradigm is right and everything remaining is search quality and tuning. **If endorsed palettes are
distributed through the energy range indistinguishably from known-bad ones — no rank correlation, with
no single term identifiable as the culprit — then description length is not the currency the reviewer's
judgment is denominated in, and this paradigm is wrong.** That result would not be fixable by changing
λ, σ or any ordering, because it would be a statement about the objective's shape rather than its
constants. It is pre-registrable today, it needs no prototype, and it can be run in two days.

---

## 8. Exposable intermediate work

The paradigm's central object is a *function that scores any palette*, which makes almost everything
inspectable:

- **The energy of any palette, including one this system did not produce.** Another arm's output, a
  reviewer's hand-corrected palette, an endorsed legacy palette — all scoreable and directly
  comparable. This makes the design useful to Phase 2 even if it loses Phase 2.
- **The energy broken into its terms** — field bits, ink bits, generic bits, naming bits, serialization
  bits — per palette, so a disagreement can be attributed to a term rather than to the system.
- **The certified runner-up list**: the top-k configurations with their exact energy gaps. A small gap
  is a machine-generated, calibrated request for reviewer bandwidth — "these two are within n bits,
  which do you want?" — and it fits the 4–10 item blinded batch format the review channel already runs.
- **The naming-gain curve**: for every colour in the image, bits saved by naming it. This is the
  identity-coverage diagnostic (P5) in its most direct form, and it can be read against the reviewer's
  own corrected accents to see whether the right answer was even *ranked* highly.
- **The reconstruction**: the fitted field rendered as an image, the ink support map, and the residual.
  These are pictures. A reviewer can look at them and say the field is wrong without knowing anything
  about bits.
- **The bound certificate**: the proof that no unexplored region of the configuration space could have
  won. Machine-checkable, and the thing that distinguishes this from a search that merely did not look.

---

## 9. What I asked for

Two requests, both against the withheld oracle documents, and I proceeded past both.

**1. From `ORACLE_QUESTION_SET.md`: the per-question reliability of `enclosure` and `text_dominance`.**
My riskiest free parameter is the field/ink spatial scale (§4, parameter 3), and its failure classes are
thick frames and giant type. The cheapest calibration I can design is a review round *stratified* on
those two labels — a sanctioned use under §6, which permits strata and forbids verdicts. But a
stratification built on a label that is noisy in an unknown direction is worthless, and the inventory I
received deliberately carries the vocabularies without any statement of how well the questions perform.
*Assumption I proceeded under:* that `enclosure` and `text_dominance` are usable as corpus-scale strata
and unusable per item — i.e. exactly the reliability §6 already asserts for the instrument as a whole.
Under that assumption the design is unchanged; only the efficiency of calibrating parameter 3 moves,
and the round gets larger.

**2. From `ORACLE_QUESTION_SET.md` (and possibly its pipeline companion): the measured resolution
floors.** The manifest records that resolution floors were among the material stripped from the
inventory. They bear on this design directly, because the naming cost is what decides whether a small
support survives at a small rendition, and that decision *is* the informed-versus-chaotic
classification in §1's cross-rendition metric. Knowing the floor would let me set λ so that
"informed" disagreements land where the reviewer already agrees they should. *Assumption I proceeded
under:* that the naming cost stays expressed scale-free, in area fractions, with the sole absolute
pixel-scale term being the ±1-LSB noise floor, individually justified under §1's carve-out. The
consequence I accept is that my cross-rendition behaviour is a prediction rather than a calibration
until the resolution ladder measures it.

I did not need anything from `REVIEW_UI.md` or `src/review-server/README.md`. Both stubs say those
describe how a proposal is judged rather than machinery it must design against, and that is correct
for this proposal.

---

## Two things in the packet I could not reconcile

**The accent's second dimension.** `PHASE_0_DECISIONS.md` §2 quotes the reviewer, 2026-08-04:
*"the contrast limit between foreground and background/surface/gradient, and between accent and
background/surface/gradient should be about APCA contrast, not APCA **and** color distance. Color
distance is used between background and surface, or between foreground and accent."* Read plainly,
that removes the colour-distance dimension from the accent's contrast clause. The surrounding text and
§3 then retain it, as a conjunction running on `ACCENT_FUNCTIONAL_DISTANCE`. The quoted ruling and the
retained mechanism point in different directions and I could not tell which governs. I designed against
the retained mechanism, since it is the one the invariants implement; if the plain reading of the
ruling is correct, my feasible set is slightly larger than it should be and nothing else changes.

**The cost bracket's exceptional end.** The brief's §3.1 defines the exceptional end of the cost
bracket by *"SAM measures at roughly 2.7–4.3 s per image"*, while the same section and
`PHASE_0_DECISIONS.md` §6.1 both insist that the quotable figure under the cold frame is ~6.2 s and
that the 2.7–4.3 s band is warm context and *"not the row to quote"*. The bracket's upper anchor is
therefore stated in the number the packet elsewhere forbids quoting. It does not affect me — I am at
the other end — but a proposal landing near that boundary would not know which figure it was being
measured against.
