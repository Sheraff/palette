# Phase 1 — the divergence map

**Written 2026-08-04, after all six proposals landed and before any of them was judged.**

This document exists to make Phase 1's stated success criterion judgeable. That criterion is
**distinctness, not quality** (`PHASE_1_AUTHOR_BRIEF.md` §1; `phase-1/COMMISSIONING.md` §1), and
Phase 2 prototypes "the 2–3 most distinct ones" judging "trajectory and ceiling, not first-round
scores" (`V3_PLAN.md` §6).

**This document does not rank the proposals and does not recommend any of them.**
`COMMISSIONING.md` §7 leaves open how proposals are judged, which 2–3 go forward, and whether the
seats worked; a ranking here would quietly settle the first two. What follows is evidence:
mechanisms side by side, groupings argued from mechanism, and the specific things a Phase 2
prototype of each paradigm would have to demonstrate. Where a judgment is mine it is labelled as
mine.

**Two scoping notes.**

- Several arms found genuine defects in the contract documents. Those are handled in
  `phase-1/CONTRACT_DEFECTS.md`. This document notes in one line where a defect materially shapes a
  proposal's design (§8) and goes no further.
- The authors were confined to a packet by instruction, not by sandbox (`COMMISSIONING.md` §3), and
  a separate audit measures whether that held. **This document does not assume the arms were cleanly
  independent.** Where agreement is close enough to be worth a second look, §7.3 hands it to the
  audit as a question rather than banking it as convergence.

---

## 1. The mechanism table

One row per arm. Cells are terse by design — the table's job is to make same-versus-different
visible without argument. Expansions for the cells that need them follow in §2.

| | **object the palette is read off** | **what makes a colour eligible** | **what decides the gradient boolean** | **how exact-8-bit is satisfied** | **where the roles come from** | **when the image has no good answer** |
|---|---|---|---|---|---|---|
| **A** | A **fitted generative model** of the joint colour-position measure. The published palette is the whole configuration `x` minimising one scalar (expected coding cost, nats per unit mass). | **Every exact triple in the image, for every role, at every moment.** No eligibility rule exists; rarity is *priced* by the objective, never thresholded. Only the contract's feasible set can make a colour unpublishable. | **Model order inside the one objective.** Flat / two-flat-areas / ramp are competing orders; the ramp is published iff its explanatory gain repays `λ`. One `λ` also governs both collapses and every stop beyond the second. | **Minimised over the discrete occupied colour set directly** (branch and bound over a hierarchical partition). The continuous relaxation exists only to bound; "it never answers". No snapping step. | The model's **structural slots**: the field path's two ends are background and surface; two ink kernels are foreground and accent, with the F/A labelling itself a binary dimension of `x` scored like any other. | Residual (uniform on gamut) absorbs the unexplained mass; the field fits a shallow low-confidence pair. Collapse orders pay no `λ` and win when structure does not repay. Search is anytime and publishes a **certified optimality gap**. |
| **B** | A **typed nesting tree of spatial regions** — `field / enclosure / mark / subject / grain` — built as quasi-flat zones over the pixel adjacency graph. Roles are names for parts. | Every **node representative** is a candidate for every role; overlays sort last but are never excluded. Sub-floor zones fold into their parent as `grain`. *Eligibility granularity is the node, not the pixel.* | **Model adequacy in a fixed order**, stopping at the first model whose residual falls under one bar: flat → linear → radial/conic → none. Gradient is true iff no single colour represents the field within the ruler and a progression does. | Per-region **representative rule**: bar-scale density mode → bar-mode centroid → publish the exact triple present in the region nearest that centroid, lexicographic tie-break. | **Four lexicographic orders over structural predicates**, one per role, with a bar-width indifference band at every level. Explicitly never a weighted sum. | Field typed `none` → a **degenerate branch** reads the four roles from whole-image bar-scaled colour modes by area, ordered by luminance, and ships the artwork labelled `unparsed`. "Dull, stable, valid." |
| **C** | A **labelling of a normalized cell grid** — `field / ink / accent-carrier / ignore` plus a field model — produced by whichever portfolio member was **elected**. The object is an *account*, not a structure. | Keys of the exact-triple histogram, reachable only by being the densest triple of the densest same-colour neighbourhood of a labelled region. Belonging is made structural rather than numeric. | **The identity of the winning member.** "The gradient boolean stops being a detector." A ramp member whose ends read as one colour is a flat member with a worse story and loses on coverage. | The **shared reader's two-step act**: argmax over a smoothed density for the *neighbourhood*, then the most populous exact triple *inside* it, lexicographic tie-break. | **One shared reader**, applied once to the winning member's labels: background = field's dominant neighbourhood; surface = its second or the ramp's far end; foreground = ink; accent = accent-carrier. | The **floor member** — one flat field, one ink, both collapses — is always admissible and wins when nothing beats it. When the leader's margin falls inside the replicate spread, the **claim lattice** (prefer the account claiming less) decides. |
| **D** | A **designated rank in a scalar field defined at every pixel**. Every published colour is the pixel that holds that rank. No intermediate object exists at all. | **All N pixels, always.** "There is no candidacy wall anywhere in this design, because there is no candidacy." Only `α < 255` pixels are excluded, and by exclusion rather than by matting. | **Spearman rank correlation** between the ramp coordinate `t` and a small fixed dictionary of spatial parameterisations; true when the best correlation exceeds `ρ*`. The winning parameterisation *is* the `geometry` field. | The **rank cascade** — successive medians of L, then a, then b, restricting each time to the pixels attaining the previous median. Terminates on a colour an actual pixel carries. Nothing is ever created. | Designated ranks in designated fields: background/surface are the two ends of the depth-quantile field set ordered by prevalence rank; foreground is the top-τ ink cascade (or top-τ \|raw APCA\| in regime 2); accent is a two-tier lexicographic cascade. | The depth distribution has no plateau, so the β quantile "returns whichever patch is smoothest — the background will be defensible but arbitrary", and unstable between renditions as **chaotic** rather than informed. No degenerate branch; the arm names this as its expected failure. |
| **E** | A **layer in a component tree** — four max/min-trees over four scalar "evidence lanes". The ground image after the peel, and the figure layers the peel removed. | A colour **belongs iff it is the value of a node with high persistence in at least one lane**, on either axis (area persistence or dynamics). Adding a lane can only add candidates, never remove one; no filter sits between a lane and role assignment. | **Same-colour graph on the field's colour set**: connected under the ruler but with diameter above it = gradient ("a path in colour space every step of which is below the ruler"), plus a rank-correlation monotonicity test against the render axis to separate gradient from texture. | **By construction** — connected/attribute filters never invent levels, so there is "no snapping step anywhere" — plus the **representative pixel** rule: argmax of area-weighted density smoothed at the ruler's bandwidth over the region's distinct triples. | Read off the **layer order**. Field ends → background/surface. Figures ranked by **rank-sum of {dynamics, dispersion, area}** with equal weights by declaration: foreground maximises `rank(dynamics)+rank(dispersion)`, accent maximises `rank(dynamics)+rank(−dispersion)`. | The log-α stability curve is flat, no plateau wins convincingly, "and the field is whatever survives" — expected worst stratum, and expected to be **visible in the intermediate work rather than silent**. Fallback chain: no figure layer → field colour furthest from background → escape. |
| **F** | A **fitted affine colour-over-position model** (three OKLab planes over x,y by robust IRLS) plus the marks the fit does not explain — a pool of field-like components and mean-shift mark colour groups. | Every colour group in the image is in the pool for every role. "There is no filter that can remove a colour from consideration, only a competition it can lose." *Eligibility granularity is the colour group, not the pixel.* | **Penalised model selection** among three readings (ramped single field / two field-like components / flat single field), with affine-versus-constant settled by a **statistical test on the robust fit at a stated confidence level** — explicitly not a magnitude threshold. | **Snapping as a final projection**: a ball of radius = the bar around the continuous target, take the artwork triple maximising kernel-smoothed support mass inside it. "Satisfied once, at the very end… never as the substrate of a decision." Empty ball → nearest triple, flagged. | A **ranking over one unbarriered pool**, with all four roles solved **jointly and exhaustively** as a small assignment problem over the top few candidates per role. | "The robust fit will converge on *something* — the largest smooth-ish patch — and background and surface will be arbitrary rather than wrong-in-a-legible-way, **which is worse**." No degenerate branch, no floor account, no `unparsed` label. |

---

## 2. Reading the table

Four columns discriminate; two mostly do not.

**Column 2 (eligibility) does not discriminate on intent — all six refuse candidacy walls — but it
discriminates sharply on *granularity*.** A and D admit every exact triple / every pixel with no
intermediate object at all. E admits any triple that is a persistent node's value in any of four
lanes. B admits node representatives, C admits densest-triples-of-densest-neighbourhoods of labelled
regions, F admits mean-shift colour groups. So there are three eligibility regimes, not one: *no
gate and no summary* (A, D), *a gate that is provably additive* (E), and *whatever the intermediate
object happened to produce* (B, C, F). The third regime is a real restriction the three arms in it
each describe as an absence, and that is worth carrying into Phase 2 — a reachability measurement
against the endorsed set answers it directly, and four of the six arms have proposed exactly that
measurement as their own falsifier (§9).

**Column 4 (exact-8-bit) is the sharpest single discriminator in the phase**, and it splits the six
into three incompatible commitments:

- **Never create a colour** — D ("nothing colour-bearing is ever created", which bans local mean
  colours and therefore every linear filter on colour), A ("minimising over the discrete set
  directly rather than optimising in the continuum and snapping"), E ("with no snapping step
  anywhere").
- **Compute a region, then choose its exact representative by a bar-bandwidth density mode** — B,
  C, E's §2.6. This is one algorithm appearing in three proposals (see §7.1).
- **Compute a continuous target, then project** — F, explicitly and deliberately: the requirement is
  "satisfied once, at the very end, as a projection".

A and F, which §3 groups as the same paradigm family, take *opposite* sides of this line and each
argues the other side is the mistake. That is the strongest mechanical evidence that they have not
collapsed into one another.

**Column 6 (no good answer) is the column most likely to decide ceilings, and it is the column the
arms treat most unevenly.** Three arms build an explicit degenerate path and ship a label with it —
B (`unparsed`), C (the floor member plus the claim lattice), A (a low-confidence pair plus a
published optimality gap). E degrades without a named branch but insists the degradation is visible
in the intermediates. D and F have no degenerate branch at all and say so plainly; F goes further
and calls its own degenerate behaviour "worse" than being wrong-in-a-legible-way. **What fraction of
the corpus lands in each arm's degenerate path is the single measurement that most changes a
paradigm's estimated ceiling, and it costs no review round** (§9).

**Columns 1, 3 and 5 are what §3 groups on.**

---

## 3. Distinctness assessment

### 3.1 The grouping

Grouped by the object that mediates between pixels and roles — column 1, corroborated by columns 3
and 5.

| group | arms | the mediating object |
|---|---|---|
| **I — fitted colour-over-position models** | **A**, **F** | A parametric model of colour as a function of image position, whose slots are the roles. Gradient boolean is model selection. |
| **II — hierarchical spatial decompositions** | **B**, **E** | A tree of nested connected regions built by union-find, with a ground/figure split read off it. Roles are properties of regions or layers. |
| **III — per-pixel scalar fields and ranks** | **D** | No mediating object. A scalar field at every pixel and a designated rank in it. |
| **IV — plural accounts plus a selector** | **C** | Several competing labellings, one elected. Distinctness lives in the selector, not the members. |

**My judgment: no two arms collapse into one paradigm.** But two adjacencies are real, and each has
a specific separator that I name below and classify as structural or as a matter of degree. There is
also one arm (C) whose distinctness rests on a narrower base than its length suggests, and saying so
is part of the map.

### 3.2 Group I — A and F are adjacent, and separated structurally

**What they share, at mechanism level.** Both fit a model of colour as a function of position over
the whole image. Both use a *soft or robust* field membership rather than a hard mask (A's logistic
prior in the extent statistic; F's redescending Tukey biweight with the loss scale set to the bar).
Both set the gradient boolean by model selection rather than by a detector. Both make the ramp's
ends *be* the two field roles so the endpoint invariants hold by construction rather than by repair.
Both are explicit that a fixed matte would inject an off-artwork colour. This is a genuine family
resemblance and it should not be talked away.

**Separator 1 — one joint objective versus a staged pipeline. Structural.** A's objective is a
single scalar over the *entire* answer at once: the field path, its ends, both ink colours, the
collapse flags, the geometry, and the number of stops. There is no stage that picks a background and
hands the remainder onward. F is a pipeline in the ordinary sense — fit the field, recursively
extract field-like components from the residual, group marks by mean-shift, rank, assign, snap — and
its four-role joint assignment is a small exhaustive search *over an already-shortlisted pool*, not
a joint optimisation over the image. This is precisely A's seat, and A defends the boundary
explicitly ("elimination by certified bound is not a pipeline stage": branch and bound discards a
region only after proving it cannot contain the optimum of the whole objective, whereas a stage
discards before a later rule could speak).

**Separator 2 — discrete-domain optimisation versus continuous-then-project. Structural, and the
two arms contradict each other on it.** Quoted in §2. A refuses continuous-then-snap; F adopts it as
a design principle. These cannot both be right about the same requirement, and Phase 2 can measure
which is right by the dither and re-encode arms.

**Separator 3 — one constant versus three criteria. Structural, and pre-registered as falsifiable.**
A's `λ` alone governs the gradient boolean, both collapses and every stop beyond the second, and A
pre-registers that if no single `λ` yields an acceptable gradient rate and collapse rate
simultaneously, "the rate-distortion framing is wrong rather than under-tuned, and `λ` should never
be quietly split into four". F uses three separate mechanisms for the same three decisions: a
penalised-likelihood complexity price, a frequentist test at a stated confidence level, and the
excursion bar.

**Separator 4 — what the field model is. Degree, not structure.** A's field is a *path* in colour
space with 0–2 interior stops, positionally coupled through per-colour second moments and evaluated
as an integral along the rendered path. F's is *degree-1 by commitment* — three planes over (x,y),
"because the contract's gradient is a straight OKLab ramp and the flattest hypothesis is the one the
guide-stop semantics ask for". A's family strictly contains F's. This is the one difference between
them that a change of constants could close, which is why I classify it as degree.

**Net.** Same family, opposed on two design commitments each arm argues is load-bearing. Taking both
into Phase 2 would test the *same* hypothesis (that colour-as-a-function-of-position is the right
mediating object) twice; taking one tests it once and leaves the fit/project and joint/staged
questions unexamined. That trade is the reviewer's, and I am not making it here.

### 3.3 Group II — B and E are the closest pair in the phase

**What they share, at mechanism level.** Both build a hierarchy of nested connected regions by
union-find after a counting sort — near-linear, deterministic, no iterative solver. Both fold out
small regions before anything else (B's `grain` area floor; E's peel). Both split the image into a
ground and the marks/figures laid on it, and read the four roles off that split. Both rank figures
by structural attributes with **no weights** — B by lexicographic orders, E by rank-sum with equal
weights by declaration. Both refuse a fourth stop. Both use the *same* representative-pixel rule
(§7.1). And both state, in nearly the same words, that the designer already solved the problem: B —
"the artwork usually contains a worked solution to our own problem: its title text already sits on
its own field at a contrast a designer chose"; E — "the designer already solved our problem when
they decided what colour to lay on what".

This is close enough that the map should say so plainly: **if only one region-decomposition paradigm
goes to Phase 2, B and E are the pair to choose between, and a prototype of either will reuse a
substantial fraction of the other's machinery.** Three separators are nonetheless structural.

**Separator 1 — which tree. Structural.** B builds *one* hierarchy on **inter-pixel dissimilarity**
(quasi-flat zones; α-connectivity on an edge-weighted adjacency graph). E builds *four* hierarchies
on **scalar level sets** (max/min-trees on L↑, L↓, C↑, H↑). These are different mathematical
objects, and the difference has a visible consequence: the α-tree's famous chaining pathology — a
smooth gradient collapses into one zone — is *unavailable* to a component tree, which nests by level
rather than by step size. B makes that pathology the load-bearing feature of its gradient rule; E
cannot and does not.

**Separator 2 — what stops the decomposition. Structural.** B's field is **what reaches the frame**
— one union-find query on border pixels, a positional and topological criterion. E's ground is the
reconstruction at **the widest plateau in log α** of colour mass moved — a scale-selection argmax,
with no threshold in it. These disagree by construction on a whole class of images: a large central
subject inside a thin border is *field* to B (it touches the frame) and is likely *figure* to E (it
has enormous area persistence and the plateau sits above it).

**Separator 3 — how figures are ranked. Structural.** B builds a bespoke geometric **text detector**
— distance transform, stroke width as twice the median ridge distance, components grouped by
agreement of stroke width, height, collinearity and colour, four or more components being
text-shaped — and states outright that mediocre recall is acceptable because only one colour is
being recovered. E has **no notion of text at all**: text falls out as "what spreads across a cover
while being expensive to remove", i.e. high dynamics plus high dispersion. B's mechanism can be
wrong about type specifically; E's cannot be, because it never claims to see type.

**Where they do *not* separate.** The representative-pixel rule is the same algorithm in both
(§7.1) — a convergence, not a divergence. Their gradient definitions are also closer than they look:
both define a gradient as *a chain of below-bar steps whose total span exceeds the bar*, B in image
adjacency and E in colour space. I classify the venue difference as structural (B's chain requires
spatial adjacency; E's does not, so E's rule fires on a spatially scattered but colour-connected
field, and E adds a separate monotonicity veto to catch exactly that) but a reader could
reasonably call it degree, and it is the one place in this section where I would not argue hard.

### 3.4 Group III — D is the clean outlier

D is the only arm with no spatial-region object, no fitted model, no colour-space grouping and no
candidate pool of any kind. Three of its mechanisms appear nowhere else in the phase: the **rank
cascade** (successive coordinate medians restricting to the attaining pixels) as the operator that
turns a population into an exact triple; the **depth field** (distance to the nearest edge pixel,
normalised by the long edge) as the definition of "field"; and **Spearman rank correlation against a
dictionary of spatial parameterisations** as the entire gradient boolean. E uses a rank-correlation
test too, but as a secondary texture veto on top of a colour-graph rule, not as the boolean itself.

D also did the most non-obvious work on its own seat, which is worth recording because it is
evidence about the seats. The seat says "no intermediate summary". D narrowed it to a rule it could
defend — *"nothing colour-bearing is ever created; every object the algorithm builds is either a
pixel of the artwork or a number attached to a pixel"* — and then followed it into a cost it did not
have to accept: a **local mean colour is banned**, which removes every linear filter on colour from
D's toolbox and forces every local statistic to compare other pixels *to the pixel itself* or rank
them. An author reshaping a seat to make it *harder* is a different signal from an author reshaping
one to make it livable.

### 3.5 Group IV — C is distinct in kind, and its distinctness has a narrow base

C is the only arm whose top-level object is plural: several accounts, none of which is the answer,
plus machinery that elects one. Nothing else in the phase has that shape, and "the gradient boolean
is the identity of the winning member" is a genuinely different answer to column 3.

But the map should be precise about *where* C's distinctness lives, because it is not in the
members. C's roster is: flat field, ramp field, two-mode split, ink-first, frame-aware, mass, floor.
Members 1 and 2 are simplified versions of F's flat and ramped readings; member 5 is B's enclosure
carve; member 4 is a coarser cousin of D's ink score and B's marks. **C is not a seventh mechanism;
it is a meta-mechanism, and the proposal that has to survive Phase 2 is the selector**, not the
roster. C's author accepts this framing — the roster is named as "the largest judgment call in the
design, and the only one I cannot fully anchor" — and C's own falsifier is exactly the right test:
if C's selector is no better than always using one fixed member, "selection adds nothing and the
portfolio is an expensive way to run one extractor."

Two things in C are genuinely unavailable elsewhere and are the reason the arm is not reducible.
First, the selector's ranking is **within-image only** — coverage is never compared across images,
so no threshold in it can ever be fitted to a corpus, and there is no number in it a human tunes.
Second, the explicit trade **"a free parameter can be spent as a portfolio member instead"**:
instantiate a member twice at two settings and let the selector choose per image, converting a human
decision into a runtime one. That is a direct, quotable attack on success criterion 2 that no other
arm offers.

### 3.6 Summary of adjacency

Ordered by how much machinery a Phase 2 prototype pair would share, most to least:

1. **B ↔ E** — same tree-building discipline, same representative rule, same designer-solved-it
   premise; separated by tree type, ground criterion, and text detection.
2. **A ↔ F** — same mediating object and same model-selection posture; separated by joint-versus-staged,
   discrete-versus-projected, and one-constant-versus-three.
3. **C ↔ {B, D, F}** — C's members are thin versions of the others' designs, but the selector is not.
4. **D ↔ everything** — shares the goals and the contract, and essentially no machinery.

---

## 4. Free-parameter comparison

**These counts are not comparable numbers and must not be added, averaged, or ranked.** Every arm
answered the brief's question honestly — "how many independent decisions your *paradigm* needs a
human to make" — and every arm answered a slightly different question, because the brief's phrasing
leaves four things open that the arms resolved differently. The counts are recorded below with each
arm's own definition attached; the divergences follow, and **the divergence is itself the finding**,
because success criterion 2 is measured on this axis in Phase 3.

| arm | self-reported | the arm's own definition | counts things others exclude | excludes things others count |
|---|---|---|---|---|
| **A** | **4 + 1 compute budget** | "Each is a decision the *paradigm* needs a human to make." | The **search node budget** — "a compute knob rather than a behaviour knob, but it can change an answer when it binds, so I count it rather than hide it." Only arm to count compute. | The residual density; the geometry families; the ramp axis; **per-image nuisance parameters** ("estimated is not chosen"); tie-breaks; numeric quantisation; every contract threshold. |
| **B** | **5** | "Independent decisions a human must make for the *paradigm* to be specified… two are inherited from quantities the campaign has already anchored and three are mine." | Inherited quantities are **inside** the total (the ruler as #1; the excursion multiple as #5). | **All four lexicographic role orders** ("Deliberately *not* parameters: every role order"); the gradient boolean; collapse conditions; the escape; the contrast floors; tie-breaks. |
| **C** | **6** | "Independent decisions a human must make for the paradigm, honestly counted for the whole system." | Four of the six are **structural choices with no number in them** (the ensemble, the claim lattice ordering, the shape of the coverage statistic, the roster). | **Member-internal structure** — flagged by the arm itself as "asserting rather than proving that it never becomes tunable". The ruler does not appear in the count at all. |
| **D** | **5, plus three inherited** | "Five independent human decisions, plus three inherited from the contract with existing provenance." | Nothing unusual; all five are numbers requiring measurement (τ, k, β, ρ*, the annulus ratio). | The **inherited three are listed outside the count** (the bar, the excursion bar, invariant 2's floors) — the opposite convention to B. |
| **E** | **5** | "Not five constants — five decisions, and I have tried to make each one a *choice among named alternatives* rather than a number, because a choice can be settled by one review round and a number needs a calibration campaign." | The ruler is counted (P1) though inherited. The **figure ranking key** is counted (P2). | Excursion bar, contrast ε, region partition, accumulator resolution, all persistences. |
| **F** | **5, "of which one is derived and one is a rule rather than a value"** | "Independent decisions the *paradigm* needs a human to make, honestly." | Nothing unusual. Uniquely adds a **reporting discipline**: each parameter ships with its per-image **invariance interval** — the range over which the emitted palette is byte-identical. | The ruler and the user's contrast parameter — "Two further numbers enter but are not mine." The opposite convention to A, B and E. |

### 4.1 The four axes on which the definitions diverge

**(a) Does the inherited same-colour ruler count?** A counts it (#1), B counts it (#1), E counts it
(P1). D lists it outside the count, F declares it "not mine", C never lists it. **Three arms count
the same object; three do not.** On a base of four to six, this is a 17–25% swing produced entirely
by a definitional choice.

**(b) Does a compute budget count?** Only A. A's reasoning — that it can change an answer when it
binds — would, if applied uniformly, add an item to D (which concedes a 4000² input wants a tiled
implementation) and arguably to C (whose cost is a function of roster size).

**(c) Does a *rule* count the same as a *value*?** C (4 of 6), E (all 5, by explicit design) and F (2
of 5) count structural choices and named alternatives. A and D count quantities that need
measurement or a review round. **These are not the same unit.** E states the reasoning outright:
"a choice can be settled by one review round and a number needs a calibration campaign." A count
that mixes the two prices a cheap decision and an expensive one identically.

**(d) Does an ordering count?** This axis is the sharpest, because **B and E make opposite decisions
about the same object.** Both rank figures/roles by structural attributes with no weights. E counts
that ranking key as P2 and buys it a review round ("~40 items"). B counts its four lexicographic
orders as **zero**, on the ground that a lexicographic order carries no constants. Both arguments
are internally sound. They cannot both be applied to a comparison table.

### 4.2 What this means for Phase 3

Success criterion 2 is measured in Phase 3 against the incumbent's "~900 tunable sites against 11
anchors". Measuring it on self-reported counts under six definitions would produce a number with no
meaning. Two observations, offered as evidence and not as a proposal:

- **A normalisation rule would have to be written down before the counts are compared**, and writing
  it after the proposals exist is the same goalpost move `COMMISSIONING.md` was built to avoid. The
  rule at minimum has to settle (a)–(d) above.
- **F proposed an instrument that makes the question empirical rather than definitional.** The
  invariance interval — sweep each parameter per image and record the range over which the emitted
  palette is byte-identical — measures whether a declared parameter is *actually* free, and F states
  the consequence: "A parameter whose interval covers the whole plausible range is not free in any
  meaningful sense, and saying so with evidence is the difference between five parameters and five
  excuses." This is applicable to any of the six paradigms, not only F's, and it is the only
  proposal in the phase that offers a way to judge its own parameter claim.

---

## 5. Cost comparison

**Same treatment: these figures are not comparable as stated**, because they rest on different
assumed image sizes and different notions of what a typical cover is. The assumed size is the
dominant term in five of the six estimates.

| arm | self-reported cold per-file estimate | assumed image size | form of the estimate |
|---|---|---|---|
| **A** | "Low hundreds of milliseconds for a typical album cover… comfortably under two seconds at 3000 px" | **≤768 px**, stated with provenance — A used the "0.00% of corpus images exceed 768 px" figure disclosed in the packet `MANIFEST.json`'s trim rationale, and flagged that "a leaked headline is not a distribution" | Prose bracket, plus a stage list |
| **B** | "Tens of milliseconds, single-threaded… on the largest renditions, low hundreds" | **unstated** — "a typical square cover" | Machine-independent: "**passes over the pixel array**", ~10 linear passes |
| **C** | "Low hundreds of milliseconds, dominated by the decoder" | **unstated** — "a typical cover at native resolution" | Prose bracket. Includes 7 members × 4 nuisance substrates, argued to cost ~2× the arithmetic of one pass |
| **D** | **0.15–0.30 µs/px**, worked at 640² ≈ 60–120 ms; 1000² ≈ 150–250 ms; 3000² ≈ **1.2–2.5 s** | **all three, explicitly** | The only **rate**, chosen so the estimate is re-derivable against any size distribution |
| **E** | 640² ≈ **90–180 ms**; 1500² ≈ **0.4–0.85 s** | **640² and 1500², explicitly** | A **stage-by-stage table** at two sizes, plus a 2–4× penalty for a first TypeScript prototype |
| **F** | 100–150 ms per megapixel, "so about **0.2–0.4 s** for a typical 2 Mpx cover" | **2 Mpx (~1414²)** | Per-megapixel rate with one worked size |

### 5.1 Who priced the same thing

- **D and E priced comparable things.** Both give an explicit 640² tier and both decompose by stage.
  Their 640² figures (60–120 ms and 90–180 ms) are directly comparable. Their larger tiers (1000²
  and 1500²) bracket each other rather than matching.
- **A, B and C did not state a pixel count.** All three say "typical cover" and land in "tens" (B)
  or "low hundreds" (A, C) of milliseconds. Without the assumed size these three figures are not
  comparable to each other or to D and E. A is the only one of the three to disclose an assumption,
  and disclosed that its source was a leak in the manifest rather than the withheld distribution.
- **F priced a different image.** F's 2 Mpx assumption is ~3.4× A's assumed pixel count and ~4.9×
  D's and E's 640² tier. **Normalised to 640², F's rate gives roughly 60–120 ms — the same band as D
  and E, not the 2–4× slower figure its headline suggests.** F's estimate looks worse than A's, B's
  and C's only because F assumed a bigger cover.

### 5.2 The fact every cost estimate needed, and nobody had

**No arm was given the corpus resolution distribution.** It lives in
`ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md` §7 and `PHASE_0_DECISIONS.md` §7, both withheld or
trimmed. Three arms asked for it as their stub request — A (secondary), B (via the measured
resolution floors), D (request b) — and A found the headline leaked in the packet's own
`MANIFEST.json` trim rationale and said so. **This is the clearest measured cost of the packet trim
in the phase, and it is confined to §5 of each proposal.** F, blind to the corpus facts entirely,
guessed 2 Mpx; the rest guessed lower or declined to guess.

### 5.3 The one thing every arm did the same

**All six anchor against the same reference point — the ~6.2 s cold SAM figure — place themselves at
the "target" end of the bracket, and decline the model exception.** Three (B, C, E) explicitly frame
their own proposal as the plain-code exhaustion that condition 4 demands; B goes furthest: "If this
arm is prototyped and *fails*, that failure is itself the evidence condition 4 asks for." This
unanimity is **brief-supplied** — §3.1 carries the bracket and the SAM figure, and F received §3.1 —
so it is weak evidence of independent convergence and strong evidence that §3.1 successfully set the
cost frame. Its consequence for the roster is in §7.2(12).

---

## 6. Convergences worth noticing

Where several arms independently reached the same conclusion, that is stronger evidence than any
single arm's claim — precisely because they could not see each other. But it is only stronger if the
packet did not hand it to them. Each item below is labelled **[independent]** (the conclusion is not
in the packet material) or **[supplied]** (the packet stated it, so the agreement is weak evidence
about the arms and strong evidence about the brief).

### 6.1 The strongest convergence in the phase — the representative-pixel rule **[independent]**

**Six of six arms reject the modal exact triple. Five reach the same mechanism.**

B (§2.5), C (§2.3), E (§2.6) and F (§2.8) independently specify the *same two-step algorithm*: find
the mode of a colour density **smoothed at the bar's bandwidth**, then descend to an exact triple
inside it — never the argmax of a sparse histogram. A reaches the identical conclusion in its own
idiom ("all mass in the objective is read through a kernel of the identity bar's width… nothing in
the objective ever counts an exact bin"). D reaches it by a different route entirely (the rank
cascade) with the same stated motivation (an extremum "is one pixel and usually a compression
artifact"; a quantile of a million values is stable).

**What makes this convergence strong rather than supplied.** B, C and E cite the same corpus pair as
the reason — the median endorsed role colour occupies 8.89e-5 of its image as an exact triple but
1.91e-2 as a same-colour neighbourhood — and that pair is in the brief's §4, which all three
received. **F reached the same rule with no corpus fact at all**, from a pure dither-stability
argument ("nearest-neighbour chases a single dithered pixel, whereas the mass-maximising choice is
an integral"). So the corpus fact turns out not to have been necessary to reach the design
conclusion it was supposed to motivate. That is worth recording twice: once as the phase's most
robust technical finding, and once as evidence about what §4 actually bought (§7.2).

### 6.2 Candidacy walls are replaced by rankings **[supplied premise, independent mechanism]**

All six refuse eligibility gates, and the goal is stated in §2 which all six received, so the
*refusal* is supplied. What is not supplied is the shared answer to *what replaces a gate*: all six
independently say **a ranking**. A prices instead of excluding; B lets overlays "sort last" rather
than be excluded ("candidacy walls made the reviewer's own corrections unpublishable"); C makes
nothing "unpublishable in silence"; D has "no candidacy"; E constructs its lanes so that "adding a
lane can only add candidates, never remove one"; F allows "only a competition it can lose". Six
arms, six mechanisms, one conclusion about the shape of the fix.

### 6.3 User contrast parameters must be a feasibility predicate, never a repair **[independent mechanism]**

Six of six. A ("user parameters act **only** by tightening this set; the objective never changes"), B
("a *re-run of that role's order with the floor as a filter*, not a nudge of the winning colour"), C
("as a *filter*… It is never lifted, nudged or repaired"), D ("contrast floors act only as
**verification predicates**"), E ("a *feasibility predicate* on the assignment, not a post-hoc
repair"), F ("as a filter on candidates; at its default it filters nothing"). §3.1 states the
*requirement* (byte-identity at defaults, zero collateral when raised); it does not state the
mechanism. All six independently identified the same mechanism and gave the same argument for it —
that a filter makes the requirement structural rather than tested.

### 6.4 Guide stops are admitted only by monotone excursion reduction **[supplied criterion, convergent algorithm]**

B, C, D, E and F all specify the same procedure: measure the maximum distance from the chord to the
artwork's occupied colours or true colour path, insert **one** stop at the argmax, re-measure, accept
only if the excursion falls. D names it: Ramer–Douglas–Peucker on the artwork's own colour path. A
prices stops under `λ` and reaches the same behaviour without the algorithm. §3.1 supplied the
excursion criterion and the meandering prohibition; the RDP-shaped implementation and the
"insertion strictly reduces excursion, so meandering is *unreachable* rather than forbidden" framing
are the arms' own, and appear in three of them almost verbatim.

### 6.5 The fourth stop is refused, unanimously and for the same reason **[independent]**

B, C, D, E and F all decline to emit a fourth stop by default, and B, C and E give the identical
reason: the contract makes it negotiable on proven utility and they have no utility to prove. **E
turns the refusal into a design contribution** — publish the residual excursion after the third
stop, because that residual *is* the evidence a negotiation would need. F does the same with a
second excursion lobe. No arm reached for the fourth stop, and none had to be told not to.

### 6.6 A gradient is a chain of below-bar steps whose total span exceeds the bar **[independent]**

B (§2.3, via α-connectivity in image space) and E (§2.4, via same-colour-graph diameter in colour
space) state this almost identically, and both note that it introduces no new constant. B: "on a
smooth gradient every step is below any bar, so the whole ramp chains into one zone — and here it is
the single most useful thing the structure does." E: "the field's colour varies in steps every one
of which is invisible while the whole span is visible. **That is what a gradient is** — a path in
colour space every step of which is below the ruler." Two arms, two spaces, one definition.

### 6.7 The gradient boolean is a by-product of model selection, not a test **[independent]**

Five of six. A (model order in the objective), B (model adequacy in a fixed order), C ("the gradient
boolean stops being a detector — it is simply the identity of the member that won"), E (colour-graph
connectivity plus a monotonicity veto), F (penalised model selection with a confidence test). **Only
D retains an explicit threshold on a computed statistic** (`ρ*`), and D names it as free parameter 4
requiring a dedicated review round on flat-versus-gradient *pairs*. That is a clean, discriminating
disagreement rather than an oversight.

### 6.8 If a matte were ever required it must be derived from the image, never fixed **[independent — and the clearest case in the phase]**

The plan left this to the authors on purpose (`V3_PLAN.md` §6: "part of the algorithm, not
tooling"), so nothing in the packet answers it. Five arms answered, by five different derivations,
and all five reached the same conclusion:

- **A** — the matte is one more variable of the configuration, chosen by the same objective, because
  "deciding the matte in advance decides what the image *is*".
- **B** — the field's own representative, because "a global matte injects a colour the artwork does
  not contain and would either violate invariant 2 or launder itself through the escape".
- **C** — matte-over-white and matte-over-black become two members and the selector picks per image.
- **E** — the reconstructed ground extended under the alpha region, because "a constant matte
  injects a colour that then becomes eligible for publication".
- **D** — refuses the premise: compositing *creates* a colour, so `α < 255` pixels are excluded from
  every rank and every neighbour's statistics. "Not a matte, an exclusion."

**F alone declines** and records it as "a real gap" — consistent with F being the arm that received
no instruction to answer it (the transparency and CVD questions are flagged in `V3_PLAN.md` §6 and
in the brief's non-blind sections). Five independent derivations of one conclusion is the strongest
answer this phase produced to a question the plan deliberately left open.

### 6.9 Colour-vision deficiency must not become a scoring axis **[independent]**

Five of five who answered. A (an optional narrowing of the feasible set, off by default,
byte-identical when off), B (no diagnostic at all — the contract already denies the foreground any
chromatic rescue, so text is luminance-carried and CVD-safe by construction), C (would enter as a
fourth uniform selector filter — "a reason to leave it out now, not a reason to include it"), D
(partial credit for free from the tier-1 lightness preference; ship no separate diagnostic until
someone measures whether one is wanted), E (report-only, never a gate and never a parameter). F is
silent. This is exactly the outcome the reviewer's stated reason for leaving it open was designed to
protect.

### 6.10 Scale-free spatial quantities, everywhere **[supplied requirement, unanimous discipline]**

All six refuse resampling and normalise every spatial quantity — short edge, long edge, image
diagonal, area fraction — rather than carrying a pixel constant. Three state it as a rule of their
own before deriving anything from it. §3.1 supplied "no resampling"; the never-a-pixel-count
discipline is the arms'.

### 6.11 Nobody wants the oracle's conclusions **[independent, and it is evidence about the packet]**

Five arms filed stub requests, and every one of them volunteered, unprompted, that it wanted *what
an instrument measures* and not *what it found*: C — "Counts, not accuracies: the accuracies are a
conclusion and would anchor me"; B — "The table, not any accuracy figure… The format, not the
oracle's performance"; E — "I asked for none of the oracle's *results* and do not want them"; D —
asked for reliability only insofar as it decides whether a field can be used as a *stratum*; A —
asked for nothing from the oracle at all and said why. **The distinction the packet trim was built
on was legible to the authors without being explained to them.** Two arms also confirmed the trim's
own guess that the review-channel stubs cost nothing ("they told me not to spend a request there and
they were right").

### 6.12 Every arm declines the model exception **[supplied frame, unanimous outcome]** — see §5.3 and §7.2(12).

---

## 7. Three questions layered on the map

### 7.1 Did the seats work? — E's evidence, read both ways

**The seats.** A ("one global objective"), B ("parse, then assign"), C ("a portfolio and a
selector"), D ("pixels only"). All four authors took their seat; C says so explicitly ("I am keeping
the seat as commissioned"), and D reshaped its seat to make it *stricter* (§3.4), which is the only
reshaping in the roster and is declared.

**E's §10 is the passage.** E is titled "Why this one", it considered five families, and it rejected
four — three of which are seats another arm was made to occupy. Quoted:

> **Clustering and quantisation** … place decision boundaries throughout colour space and take an
> argmax across them — precisely the shape that lets a ±1-LSB dither move a palette. No amount of
> care removes boundaries from a partition, so that family can have a careful robustness story but
> never a structural one. **Runtime segmentation** is barred by cost… **Semantic parse-then-assign**
> needs a runtime model, banned outright. **Global optimisation over candidate palettes** — an
> energy with terms for harmony, coverage, contrast, identity — is what I came closest to taking,
> and I rejected it because its weights *are* its free parameters: goal 2 asks for an order of
> magnitude fewer human decisions, and a weighted objective loses that fight by construction however
> good its palettes are. **Pure pixels-first statistics** discards the spatial relation, and the
> spatial relation is the entire content of "this is the text and that is the ground".

So E rejected **seat B**, **seat A** and **seat D**, in that order, and did not consider seat C.

**Reading 1 — the seats bought paradigms a free author would have discarded.** Two of E's three
rejections rest on premises the seated arm's own proposal falsifies:

- E rejects parse-then-assign because it "needs a runtime model, banned outright." **B's proposal is
  a parse-then-assign with no model at all** — a morphological nesting hierarchy plus a
  stroke-width mark detector — and B argues explicitly that plain code is "not remotely exhausted"
  and that its own failure would itself be the evidence condition 4 demands. E's stated reason is
  simply not true of the arm that occupied the seat.
- E rejects pixels-first because it "discards the spatial relation". **D's proposal is built on two
  spatial scalar fields** (an edge indicator and a depth field) and sets its gradient boolean by
  correlating against spatial parameterisations. Again, the stated reason is falsified by the seated
  arm. (F, independently, made the same rejection of pixels-first on a related ground — "the same
  paradigm as mine without the commitment" — so the misreading is not idiosyncratic to E.)

E's third rejection is different in kind and is **not** a misreading: the objection to a global
objective is that "its weights *are* its free parameters." That is a substantive, testable claim,
and A's entire §4 is an attempt to defeat it — one `λ`, everything else derived, inherited, or a
per-image nuisance parameter, plus a pre-registered falsifier on exactly the one-constant claim.
**A and E disagree on a specific proposition that Phase 2 can decide**, and that is the sharpest
cross-arm disagreement the phase produced.

**Reading 2 — the seats may have bought three paradigms a strong author judged dead.** The same
passage read the other way: one capable author, reasoning freely from the same contract, discarded
three of the four seated directions in a single paragraph. If E's instincts are right, Phase 2 may
be prototyping paradigms whose ceilings a first-principles filter already identified. The brief asked
for this to be cut both ways and it does cut both ways; nothing in Phase 1 decides it.

**Where E actually landed — and this is the finding that matters most.** E did *not* land somewhere
none of A–D reached. **E landed in group II, adjacent to B** (§3.3), and E's own §1 describes its
mechanism as "peeling the image apart… and reads the four roles off the *layer order*" — while B's
§1 describes its mechanism as "recover that nesting from one cold file in plain code, and then read
the four roles off it by a fixed structural order." These are near-paraphrases. **E independently
reinvented seat B's structure while explicitly rejecting seat B's name**, because it read
"parse-then-assign" as implying a runtime model.

My read, offered as a judgment: this is evidence that seat B's *direction* was not costing the phase
a paradigm — a free author converges on it — and simultaneously that seat B's *one-sentence
phrasing* was readable as requiring a model. Both statements are about the wording of the seat, not
about its worth. And E is one arm; `COMMISSIONING.md` §2 already states that both controls "are
single arms and therefore produce anecdotes, not measurements."

### 7.2 Did the brief anchor anyone? — F, with the caveat stated first

**Stated plainly, and first, because the map must not quietly upgrade it: F is one arm. It produces
an anecdote, not a measurement.** `PHASE_1_AUTHOR_BRIEF.md` §8 says exactly this — "this is **one
arm**, so it produces an anecdote, not a measurement" — and `COMMISSIONING.md` §2 repeats it.
Nothing below is a rate, a proportion, or a finding about the brief's effect in general.

**What F actually received, verified against the packets.** `packet-blind/` contains one file: §2 and
§3 of the brief, including §3.1. Checked directly: **the 6.2 s SAM figure, the 114 dithered palettes,
the ~900 tunable sites, perception-4's 0.750-against-0.361, the phrase "Read that as a direction and
not as a coefficient", the excursion criterion, the meandering prohibition, `ACCENT_FUNCTIONAL_DISTANCE`,
and goal 3's "the right answer existed and the architecture could not emit it" are all inside F's
packet.** Every one of F's citations that looks like campaign knowledge traces to §2 or §3.1. There
is no evidence in F's text of anything outside its packet.

**A confound the map has to name.** F's document has the full ten-section shape — paradigm, image to
contract, where decisions live, free parameters, cost, build cost, expected failures and falsifier,
exposable intermediate work, what was missing, why this one. That shape comes from the brief's §1 and
§6, **which F did not receive**; it therefore came from F's launch instruction. **So structural
similarity of headings across the six is not evidence about anchoring at all**, and any reading of
the blind arm that points at F's section list is reading the launch instruction, not the brief.

**Where F looks like the others.**

- **Paradigm family.** F is in group I with A (§3.2) — a fitted colour-over-position model. The
  blind arm did not produce a paradigm outside the space the seated arms occupy.
- **Concern set.** Dither, re-encode and relabel robustness; the exact-triple output alphabet;
  candidacy walls; the gradient boolean falling out structurally; refusing the fourth stop; refusing
  a threshold for the fragile accent; contrast parameters as a filter. Every one of these is
  §2 or §3.1 material, which F had. **This is the analytic core of the blind result:** almost the
  entire shared concern-set lives in §2 and §3, and F received §2 and §3. The blind as constructed
  therefore measures the marginal effect of **§4 (corpus facts), §5 (tool catalog), §7 and the §6
  template lines** — not of the brief as a whole.
- **Vocabulary.** F uses "same-colour bar" eleven times. That phrase is not in the blind packet
  (§3.1 says only "bar"); it *is* in the full packet's `PERCEPTION_VERDICT.md` and
  `src/robustness/README.md`. F coined it from §3.1's language. This is convergent coinage, not
  evidence of a leak — and F's independent arrival at the representative-pixel rule (§6.1) argues
  the same way, since a leaked source would have supplied the corpus fact too.

**Where F looks materially different — four places, each traceable to a specific withheld section.**

1. **No corpus-fact anchoring anywhere.** Where A, B, C and E anchor the representative-pixel rule
   to the 8.89e-5 / 1.91e-2 pair, F asserts from general knowledge that "album art typically has
   10⁴–10⁶ distinct triples" and derives the same rule from robustness alone. **§4's headline fact
   turned out not to be necessary to reach the design conclusion it motivates.** That is the single
   most interesting thing the blind arm produced.
2. **No instrument awareness, with a measurable cost.** F names no campaign instrument, and budgets
   **~4 days to build an "invariance-interval harness" and a "robustness harness"** — one of which
   already exists. Every other arm wires to the dev loop and adjudication as given. This is a direct,
   priced cost of withholding §5, and it is exactly the hidden-rubric risk `V3_PLAN.md` §6 names:
   "an author who does not know a robustness harness exists will not design for robustness and will
   be judged by it anyway."
3. **Contract precision lost.** F's §9 lists four assumptions it had to invent because §3's schema
   pointers into `PHASE_0_DECISIONS.md` §4 were unreachable — most consequentially "**Stops when the
   gradient boolean is false. Unknown schema**", which F names as "the one gap that actually bit",
   and whether a non-gradient `surface` may be a distinct panel, which F calls load-bearing for its
   own two-component reading.
4. **F found a defect in §3.1 that no other arm flagged.** F reports that §3.1's instruction to treat
   the same-colour rule as "conservative in the chroma direction and permissive in the lightness
   direction" is self-contradictory against the same paragraph's numbers unless
   "conservative/permissive" is read as being about *declaring a difference* rather than declaring
   sameness. Arms A–E had `PERCEPTION_VERDICT.md` and did not hit the ambiguity. **This is the blind
   arm functioning exactly as designed** — it read the constraint sheet as a standalone document,
   which is what it is for an author with no supporting library, and found a place where it does not
   stand alone.

**My read, one arm, offered as a judgment and not a measurement.** F reads as **anchored on §2 and
§3, and not anchored on §4–§8** — its paradigm family, its concern set and its vocabulary all track
the sections it received, and it diverges from the other five precisely and only where the withheld
sections would have supplied evidence, instruments or schema. The brief's goals and constraint sheet
shaped the answer; the corpus facts and the tool catalog supplied *anchoring for claims* rather than
*direction for designs*, with the notable exception of the tool catalog, whose absence cost F four
days of duplicated instrument-building. The one honest conclusion available from a single arm is
that the blind was pointed at the wrong half of the document: §2 is where the anchoring lives, and
every arm had it.

### 7.3 Handed to the confinement audit, not concluded here

I found no citation in any proposal that traces outside its packet; every number I checked resolves
to a packet file. Three items are nonetheless worth the audit's attention, framed as questions:

**(a) Arm A's use of "0.00% of images exceed 768 px".** A discloses this and names its source: the
packet's own `MANIFEST.json`, in the trim rationale for the withheld oracle pipeline document. That
is in-packet and therefore not a confinement breach — but it means **the manifest leaked a
conclusion the trim existed to withhold**, and A's cost section is the only one anchored on it.
*Question for the audit: is the manifest the whole route, and did any other arm read it?*

**(b) The four near-identical representative-pixel rules** (B §2.5, C §2.3, E §2.6, F §2.8 — §6.1).
This is the closest agreement in the phase, down to the shared two-step structure and the shared
justification. B, C and E share a sufficient in-packet premise (§4's corpus pair), and F's arrival
*without* that premise argues against a shared external source. I read it as genuine convergence and
have recorded it as the phase's strongest finding — **which is exactly why the audit should confirm
the four runs were clean before it is banked.**

**(c) B and E flag the 0.07444 dead-band defect in near-identical terms.** Both received
`PHASE_0_DECISIONS.md` §3 and `PERCEPTION_VERDICT.md`, which is a sufficient shared source. Low
concern; listed for completeness.

I have not looked at tool-call logs and this section is not an audit finding.

---

## 8. Where a contract defect materially shaped a design

One line each, per the scoping rule. `phase-1/CONTRACT_DEFECTS.md` owns these.

- **The `FOREGROUND_ACCENT_SEPARATION_DISTANCE` (0.07444) versus same-colour-bar dead band** —
  **E** states its design "lands there regularly and currently resolves it by collapsing, which may
  be wrong"; **B** proceeds "under the stricter reading that both hold."
- **Invariant 2's unspecified population floor and spatial-spread test** — **A** made this its
  primary request and states that if the floor is tighter than the endorsed median, its central
  "price, don't threshold" claim "is partly false and the contract is doing rarity work I have
  credited to the objective"; **C** made the question structural rather than numeric because of it.
- **The escape publishing a non-source colour into a collapsed partner** — **C**'s floor member
  depends on reading this as one colour in two roles, and C states that if the reading is wrong "the
  escape is unusable as written and the floor member has no last resort."
- **`ACCENT_FUNCTIONAL_DISTANCE` `[UNCALIBRATED]` but enforced in a hard gate** — **E** expects "to
  trip it on exactly the accents the H↑ lane exists to find, and intend[s] to invoke the standing
  demotion rule rather than tune around it."
- **§3.1's conservative/permissive wording against its own numbers** — **F** only, and only F was in
  a position to hit it (§7.2).

---

## 9. What each arm uniquely brings

One paragraph each: the idea this arm has that no other arm has. Where an arm's headline *insight*
is shared but its *mechanism* is not, that is said. No arm came out with nothing.

**A — a certificate, and a scoring function that works on palettes it did not produce.** A is the
only arm that can say "this answer is optimal, and here is the proof": branch and bound with
Lipschitz-derived lower bounds over a hierarchical partition of the occupied colour set, publishing
a **certified optimality gap per run** and pruning certificates behind it. A nonzero gap becomes a
fact about that artwork rather than an error. The second unique item may matter more for Phase 2
than the first: because the objective is a scalar over arbitrary contract-legal palettes, **A can
score the reviewer's 351 endorsed palettes in the same units as its own** — the only arm in the
phase that can evaluate a palette it did not generate, which makes its falsifier runnable on day one
and would make it a measurement instrument for the other five paradigms regardless of which wins.

**B — a text detector that reads type's manufacture rather than its meaning, and a shipped
self-diagnosis.** The headline insight — the artwork contains a worked solution because a designer
already chose a colour that reads on that ground — is **shared with E** and is not B's alone. What
is B's alone is the mechanism: a pre-model **stroke-width and stable-region pipeline** (distance
transform, stroke width as twice the median ridge distance, components grouped by agreement of
stroke width, height, collinearity and colour under the bar), with the explicit and unusual
concession that mediocre recall is fine "because I am not reading the text, only recovering one
colour a designer already validated against this field". Second, and unique in the phase: B ships a
**parse-type census** as an output, so a corpus reading can separate "the parse failed" from "the
parse succeeded and the reading was wrong". No other arm ships a label that distinguishes its own
failure modes, and B states the reason — "a system that cannot tell those apart cannot be steered."

**C — spending a free parameter as a portfolio member, and a ranking that can never be corpus-fitted.**
The portfolio shape itself is sketched in `V3_PLAN.md` §4 (which C did not see), and C's members are
thin versions of other arms' designs (§3.5) — so C's uniqueness is concentrated, deliberately, in
the selector. Two things there exist nowhere else. First, **coverage is a within-image ranking
only**: members are compared against each other on one image and never across images, so no
threshold in the selector can ever be calibrated on a corpus and there is no number in it a human
tunes. Second, **"a free parameter can be spent as a portfolio member instead"** — a member facing a
real threshold is instantiated twice at two settings and the selector chooses per image, converting a
human decision into a runtime one. That is the only direct architectural attack on success criterion
2 in the phase. Third, nearly free: C's **runner-up palette** is a ready-made blinded pair item —
two palettes for one artwork from one run, differing because two accounts disagreed.

**D — nothing is ever created, and every published colour has an address.** D holds the strictest
commitment in the phase and worked out its own boundary honestly, including the parts that hurt: a
sorted array is a permutation and admissible; a CDF of a scalar field is admissible; **a local mean
colour is banned**, which removes every linear filter on colour from D's toolbox. The unique
mechanism is the **rank cascade** — successive medians of L, then a, then b, restricting each time
to the attaining pixels — which turns a population into an exact triple with permutation-invariance
*by definition* rather than by test, and therefore makes the ASCII-relabelling failure class
unreachable rather than fixed. And uniquely in the phase, **every published colour has a location
and a rank position**: a reviewer can be shown the pixel on the artwork, turning a correction from
"this colour is wrong" into "not that pixel, *that* one", and "how far would we have to walk before
we changed our mind" becomes a number per role per artwork that flags a fragile role before any
reviewer sees it.

**E — a stability theorem instead of a stability argument, and a peel with no threshold in it.** E is
the only arm whose robustness claim is a theorem rather than an argument: the persistence structure
of a function changes by no more than the sup-norm of the perturbation, and E computes the numbers —
a ±1-LSB dither is ~0.002–0.004 in OKLab against a smallest bar of ~0.009. The unique mechanism is
the **four evidence lanes** (L↑, L↓, C↑, and H↑ on the image's *own* dominant chromatic axis, so no
fixed hue constant enters), constructed so that **adding a lane can only add candidates and never
remove one** — the cleanest architectural discharge of goal 3 in the phase, and the only one aimed
directly at the fragile hue-only accent. Second: the **peel's stopping rule has no threshold at
all** — the field is the reconstruction at the widest plateau in log α of colour mass moved, a
maximally-stable-region argmax whose choice is by definition the one a perturbation is least able to
move. Third, and cheap: E is the only arm proposing to put **the ground image itself** in front of a
human and ask "is this what is behind the stuff?" — grading the design's single largest decision in
isolation, by someone who knows nothing about palettes.

**F — the invariance interval, and margins on every binary decision.** F is the only arm that offers
an instrument for judging its own parameter claim: **every free parameter ships with its per-image
invariance interval**, the range over which the emitted palette is byte-identical, and F states the
consequence — "a parameter whose interval covers the whole plausible range is not free in any
meaningful sense, and saying so with evidence is the difference between five parameters and five
excuses." This is paradigm-agnostic and applies to all six. Second, F is the only arm to
systematically **publish a margin on all four discontinuous declarations** (the gradient test
statistic, both collapse distances to the bar, the accent's lead over the runner-up, plus a
chromatic-only flag with its lightness delta), having first conceded the honest boundary that "a
binary decision on a continuous quantity flips somewhere" — so near-boundary images become
identifiable rather than silently unstable. A has a partial version (the runner-up list and the
optimality gap) and E another (the persistence diagram), but only F ties margins to all four
declarations by name. Third: F is the only arm to settle affine-versus-constant by a **statistical
test against a sampling distribution at a stated confidence level**, chosen specifically against the
false-positive mode it most fears — JPEG-blocky skies and lens vignettes, which produce small but
systematic planes that a magnitude threshold would either over-call or need per-corpus tuning.

---

## 10. Open questions for Phase 2

Framed as **what a prototype would have to demonstrate to move each paradigm forward**. Not a
ranking, and not a shortlist: every arm is listed, and the questions are the ones each arm's own
mechanism makes decisive. Five of six arms pre-registered a falsifier that separates "the paradigm
is wrong" from "the paradigm is under-tuned" (the §6 template line, which `V3_PLAN.md` §6 recorded
the reviewer as unsure was worth anything); those falsifiers are the backbone of this section and
they are, in my judgment, the most reusable thing Phase 1 produced.

**A — the bounds, the objective, and the one constant.**
(i) **Are the lower bounds valid?** A names this as the riskiest component itself — "an incorrect
bound prunes the answer silently and looks like a merely mediocre palette" — and specifies the test:
an exhaustive minimiser over a coarsened colour set, compared against branch and bound on a few
dozen covers, asserting identical configurations. Nothing else in A means anything until this
passes. (ii) **Does the objective measure what the reviewer measures?** A's falsifier: score the 351
endorsed palettes under `E(x)` and check the disagreements — if a *feasible* endorsed palette ranks
worse than A's own in the majority of them, no search improvement rescues the paradigm; if endorsed
palettes come out systematically *lower*, the objective is right and the search is broken, which is
a much cheaper problem. (iii) **Can one `λ` produce an acceptable gradient rate and collapse rate
simultaneously?** Pre-registered: if the two demand values that do not overlap, the rate-distortion
framing is wrong rather than under-tuned. (iv) **Does the certified gap actually come out at zero?**
A shallow, near-degenerate landscape is A's own predicted failure, and the gap is published per run,
so this is measurable on the first corpus sweep at no cost.

**B — reachability from nodes, and the size of the degenerate bucket.**
(i) **Are the endorsed colours recoverable as node representatives?** B's falsifier is the cheapest
paradigm-level test in the phase and has a built-in control: hand the parse's node representatives
to adjudication as `availableColors` and read reachability *against* the reachability of an
unstructured whole-image colour set. If endorsed palettes are unreachable from nodes while remaining
reachable from the unstructured set, "the endorsed colours do not live in spatial parts and §1's
premise is false — no re-parsing fixes that." (ii) **Does field-model adequacy predict the
reviewer's gradient endorsements better than chance?** B pre-registers that chance-level agreement
kills the ramp half of the contract for this paradigm even if the flat half survives. (iii) **How
often does the `unparsed` branch fire?** B expects photographic covers to be its largest
mediocre-but-not-wrong bucket, and the size of that bucket bounds the ceiling. (iv) **The dark
stratum.** B predicts it will be B's *worst* robustness cell — α-connectivity is fragile where one
8-bit step is a large OKLab step — which is the opposite of what most arms predict for themselves,
so it is a discriminating measurement rather than a shared risk.

**C — whether selection adds anything at all.**
(i) **The only question that matters**, and C states it as its own falsifier: compare (a) a post-hoc
oracle selector that picks, with the endorsement in hand, whichever member matched best; (b) C's
actual selector; (c) always using one fixed member. If (a) ≫ (b) and (b) ≈ (c), "selection adds
nothing and the portfolio is an expensive way to run one extractor. That kills the paradigm, not a
setting in it." (ii) **Is coverage rank correlated with reviewer preference at all?** If it is
uncorrelated or anti-correlated, §1's ranking principle is false and no amount of member-writing
rescues it. (iii) **The pre-registered distribution prediction** — C predicts its own collapse rate
will come out too high and its gradient rate too low, and that corrections will more often say "you
should have published a gradient / an accent" than the reverse. That is a census, not a review
round, and it costs nothing. (iv) A prototype must show a **three-member portfolio with a working
selector** end to end, because C's build order makes that the point at which trajectory becomes
readable.

**D — the rank-position test, run before anything else is built.**
(i) **D's falsifier is the only one that can be run before the paradigm is implemented**, and D says
it would run it first: for each of the 351 endorsed palettes' role colours, compute *where in D's
field rank orders* the pixels bearing that colour sit. Concentrated near the ends of the
corresponding field = tunable. Roughly uniform = refuted, "because no setting of τ or β is a
re-ordering. Tuning moves *where I cut*, never *what the order is*." (ii) **Does the depth
distribution have a usable plateau on undesigned covers?** D concedes that on full scenes the β
quantile "returns whichever patch is smoothest", producing chaotic rather than informed cross-rendition
disagreement — the one failure mode the robustness metric penalises hardest. (iii) **The cost and
memory story at master resolution.** D is the only arm to admit a seconds-scale figure at 3000² and
a ~200 MB transient at 4000² wanting a tiled implementation; whether that matters depends entirely
on the resolution distribution nobody had (§5.2). (iv) **Anti-aliased text at small renditions**,
where every ink pixel is a blend and D's published foreground becomes a halo tone rather than the
designer's ink — D's most specific predicted failure and directly measurable.

**E — reachability against a matched control, and whether the theorem transfers.**
(i) **E's falsifier has the only matched-size control in the phase**: run the full persistence-ranked
candidate pool through adjudication's reachability channel *against a plain frequency-ranked colour
set of the same size*. If persistence is no better, "persistence identifies belonging" is false and
the paradigm is wrong rather than under-tuned — with no threshold, no role assignment and no tuning
in between. (ii) **Does the stability theorem transfer at 8 bits?** E's cheaper second falsifier: if
the selected ground level and the published colours are not measurably more stable under dither and
re-encode than an argmax-over-bins baseline on the same images, §1's structural argument is void.
(iii) **Does the log-α plateau exist on real covers**, or is "widest plateau" a coin flip on
photographs? E predicts photographic covers are its worst stratum and predicts the failure will be
*visible in the intermediates rather than silent*; both halves of that prediction are checkable.
(iv) **Component-tree correctness**, which E names as the real build risk because "a subtly wrong
tree fails silently and plausibly", with a cheap test already specified (compare against a naive
quadratic implementation on 32×32 images).

**F — whether endorsed colours are in the pool, and whether the intervals are wide.**
(i) **F pre-registers the only numeric refutation threshold among the falsifiers**: if 30% or more
of endorsed accents are not recoverable as *some* component's colour at *any* admissible setting —
if the reviewer's accents are systematically blends, or the colour of a scattered non-contiguous set
with no spatial coherence — the root claim is false. F is also explicit about why this separates
cleanly from under-tuning: "if the endorsed colours *are* in the pool but I rank them second or
third, that is scoring, and scoring is tunable." (ii) **Are endorsed surfaces on gradient covers
ramp *ends* or ramp *interiors*?** F's sharper second falsifier, and it is worth running whichever
paradigm goes forward, because every arm in groups I and II makes the ramp's ends *be* the two field
roles. If the reviewer's practice disagrees, the disagreement is at the core of four proposals at
once. (iii) **Do the invariance intervals actually come out wide?** If they do, F's five parameters
are fewer than five — and the instrument should be lifted for use on whichever paradigm wins,
regardless of whether F is it.

### 10.1 Three cross-cutting questions Phase 2 can answer for all six at once

1. **What fraction of the corpus lands in the degenerate path?** Every arm has one and they differ
   enormously in what they publish there (§2, column 6). This is the measurement that most changes a
   ceiling estimate, it requires no review round, and it is comparable across paradigms in a way
   almost nothing else in this map is.
2. **The cost figures are not comparable and could be made so cheaply.** Fixing one image size and
   one decoder would do it. D and E are already priced comparably; A, B and C would need to restate
   at a named size (§5.1).
3. **Three arms want an instrument nobody has built**, and all three are review-channel items: A's
   "score an arbitrary contract-legal palette in the paradigm's own currency", C's per-member
   reconstruction plus residual map, and E's ground image shown beside the artwork. All three share
   the same underlying request — *let a human grade an intermediate rather than a palette* — which
   is precisely the property `COMMISSIONING.md` §5 added the exposable-intermediates line to
   surface, on the ground that Phase 2 judges trajectory.

---

## 11. What this map does not settle

How the proposals are judged; which 2–3 go to Phase 2; whether the seats worked as a matter of
policy rather than of evidence; and whether the incumbent-paradigm gap flagged in `COMMISSIONING.md`
§6(a) should be filled. All four remain the reviewer's, exactly as `COMMISSIONING.md` §7 left them.

One observation is offered as evidence for §6(a) specifically, because the map surfaced it and it
belongs nowhere else: **the bake-off as constituted contains no arm that would use the semantic
oracle at runtime.** All six decline it; three explicitly frame themselves as the plain-code
exhaustion condition 4 requires. `V3_PLAN.md` §4's scene-parse sketch said "the oracle (and SAM masks
specifically) is what makes this paradigm evaluable at all", and B — the arm seated on scene-parse —
wants SAM at development time only, as the reference against which its own mark detector's recall is
measured. Whether that is the roster working as intended or a gap in it is not mine to say.
