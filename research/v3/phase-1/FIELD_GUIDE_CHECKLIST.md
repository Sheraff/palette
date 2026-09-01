# Phase 1 — the field guide as adversarial checklist

**Written 2026-08-04 by the Phase 1 orchestrator. `phase-1/proposals/` did not exist when this
document was written** — checked, not assumed: the directory was absent at 15:51 local, and the six
authors were still writing. That timing is the only property that makes this document worth
anything. A checklist assembled after reading proposals would be indistinguishable from a list of
the things those particular proposals happened to miss, and nobody — including whoever wrote it —
would be able to tell the difference afterwards. It is the same argument
`PHASE_1_AUTHOR_BRIEF.md` and `phase-1/COMMISSIONING.md` make about their own dates, and it is
being made here for the same reason.

The obligation this discharges is `V3_PLAN.md` §6, Phase 1: *"The orchestrator then stress-tests
each proposal against the field guide as adversarial checklist."*

## Blueprint versus checklist

The field guide (`../ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md`) is a very good description of one
system's answers. Read forward, it tells you to build families, obligations, slates, evidence
blends and a winner-stage repair layer — and a design built that way is v2-3 again with better
hygiene, which `V3_PLAN.md` §2 correctly calls incremental at best. Read backwards, the same
document is a list of *the places where an album artwork defeats a colour algorithm*: a frame that
wins an area contest it should have lost, a ramp that renders through a colour the artwork does not
contain, a decision that changes because a byte changed. Those places do not belong to v2-3. They
belong to the problem, and every paradigm walks into them, whether or not it has a name for them.

So this document keeps the second reading and throws away the first. Each entry below is a
**question**, phrased so that it can be put to a scene parser, a global optimiser, a portfolio of
extractors or a pixels-only computation without deforming any of them. **A proposal that answers
"my paradigm does not need that, and here is the structural reason" has passed the challenge.** A
proposal that never confronts the question has not — not because the guide's answer was right, but
because the artwork will ask anyway. Where the guide's own vocabulary was load-bearing to its
answer rather than to the hazard, it has been stripped: *family*, *obligation*, *slate*, *evidence
blend*, *winner stage*, *field hypothesis* are v2-3's names for things, not the things.

## Three rules this document is bound by

**1. It decides nothing and scores nothing.** There is no weighting, no pass mark, and no total.
`d-2026-08-04-phase-1-authors-receive-a-tool-catalog` and `COMMISSIONING.md` §7 both leave "how
proposals are judged" deliberately open until the six have landed, and a checklist with weights on
it would quietly answer that question a day early — from the incumbent's own document, which is the
one source the whole phase was designed to keep off the scale. Use these as prompts for a
conversation with each proposal. Do not add them up.

**2. The guide is not evidence, and it is not uniformly good evidence.** `V3_PLAN.md` §7 records
the fact-check's finding: unverifiable material concentrates in the guide's **§4, §8 and §11** —
the process, canary and hygiene sections — while the architecture lessons are strong and the
anecdotes are directional. Every challenge below therefore carries a sourcing mark:

| mark | meaning |
|---|---|
| **[measured]** | a corpus-scale measurement, a census, or arithmetic that can be re-derived. The strongest tier the guide has. |
| **[reviewed]** | a human verdict or a reviewer ruling. This campaign's only ground truth — but censored, relative and rendition-scoped, per `V3_PLAN.md` §2. |
| **[reported]** | the guide's own account of what its code or its campaign did. Specific, plausible, and not traced to a primary record in the fact-check. |
| **[asserted]** | advice, opinion, or a single anecdote. Directional at best. |

**A challenge marked [reported] or [asserted] may raise a question. It may never sink a proposal.**
If applying one of those produces a criticism, the honest output is "this is worth asking about",
not "this is a defect".

**3. Nothing is faulted that the authors were never told.** Every challenge was cross-checked
against `PHASE_1_AUTHOR_BRIEF.md` and the packet it points at (`PHASE_0_DECISIONS.md` §§1–6, which
`COMMISSIONING.md` §3.1 confirms is what arms A–E received; arm F received brief §2 and §3 only).
Much of the guide's contract and structural material *has* already reached the authors, restated
paradigm-neutrally — the pathology census names identity-coverage shortfall, collapse on rich
artwork and the cascade canary; the distribution census names gradient-rate neutrality and the
16% role-permutation rate; the gates name determinism, relabel invariance and the degenerate sweep.
Where a hazard did **not** reach them, the challenge stays but is flagged **`not owed`**, and
applying it reads as *a question to explore with the author*, never as a defect. Arm F is blinder
than A–E on almost everything below; read its answers against §3 of the brief alone.

---

# Group A — Semantic hazards

*The questions where pixel statistics have a ceiling. `V3_PLAN.md` §3.2 states this
architecture-neutrally: the hardest failures are semantic, and the incumbent's residual debt list
(bars, giant text, badges) is exactly the semantic residue.*

### A1. What makes a region "the field", when the largest region is not it?

**Question.** Your paradigm has to name the large areas the UI will render as background and
surface. What property decides that a region is one of those, and can that property be satisfied by
a region the viewer would never call the background of this image?

**Hazard.** Area, coverage and border contact are the obvious tests, and each one has a common
album-cover configuration in which the right answer loses: an object occupying most of the frame, a
photographic backdrop that is not uniform, a large mark that touches every border.

**Good answer.** A stated criterion, plus the configuration that defeats it and what the paradigm
does there. "Largest connected mass" is a fine criterion if the proposal knows what it costs.
**Evasion.** Describing the *machinery* that finds fields (segmentation, clustering, energy terms)
without ever stating the property being detected — the question is what makes a region the field,
not how the region is computed.

**Source.** Guide §5 (border clearance vs interior margin; field-score blend), §10 (frame class).
**Sourcing: [measured]** — the field statistics are reported as measured load-bearing signals, and
the failure class is reviewed. Owed: the brief's §2 goal 3 names fields and semantic classes.

### A2. Continuous shading on one surface, versus two things that happen to touch

**Question.** Some images contain one surface whose colour varies across it; some contain two
adjacent regions of different colour. Both produce a smooth-looking colour distribution over a
large area. What in your paradigm distinguishes them, and what does it publish when it cannot tell?

**Hazard.** The whole gradient decision rests on this distinction and it is not a colour statistic.
The guide's own summary is a reviewer sentence — shadows on one surface, versus the sky and the
grass being different areas. Statistical proxies reached 17/18 on the reviewed set after many
rounds and a refinement that helped in-sample failed out-of-sample.

**Good answer.** Either a mechanism that reads structure rather than colour distribution, or an
explicit abstention with a stated default, or a frank statement that the paradigm will publish flat
in the ambiguous case and why that is the cheaper error. **Evasion.** A smoothness, ratio or
goodness-of-fit test presented as if it answered the semantic question. Smoothness is what both
configurations have in common; it is the confound, not the discriminator.

**Source.** Guide §2.5, §6 (the boolean), §10 (sky-and-grass; one-surface shading).
**Sourcing: [reviewed]** for the distinction itself (the reviewer's own words, repeatedly),
**[reported]** for the 17/18 figure. **Partly `not owed`:** the distinction reaches authors only
inside the oracle cross-check bullet (`PHASE_0_DECISIONS.md` §4, P6, which contrasts "one shaded
surface" with "several distinct areas" and names sky-plus-grass as the bad merge) — never as a
design constraint. An author who read that carefully was told; an author who read it as a census
note was not.

### A3. Colours that are on the image but not of the artwork

**Question.** A record-label badge, a streaming watermark, a parental-advisory sticker and a logo
are all genuinely present in the pixels. Does your paradigm have any way to treat a colour as
present-but-not-belonging, and if not, what stops such a colour from being published?

**Hazard.** Overlay marks are small, saturated, high-contrast and spatially compact — which is
close to the profile of a genuine signature colour. A paradigm with no notion of provenance will
sometimes publish the label's red as the artwork's accent.

**Good answer.** Any structural handle — layering, repetition across unrelated covers being
unavailable at runtime, edge/geometry regularity, position priors — with an honest note on its
error modes. Also acceptable: "my paradigm cannot distinguish these and will occasionally publish
them; here is why that is tolerable." **Evasion.** Relying on area or rarity thresholds to exclude
them. The relevant measurement cuts the other way: the median endorsed role colour's exact-triple
area share is 8.89e-5 (brief §4), so smallness does not mark a colour as illegitimate.

**Source.** Guide §2.8, §10 (overlaid badges/labels). **Sourcing: [reviewed]**, and thin — it rests
on one quoted reviewer sentence, not a census. **`not owed` in detail**: brief §2 goal 3 names
"overlays" as a class to be handled structurally, so the topic is owed; nothing told the authors
what the failure looks like.

### A4. A large uniform bar or frame that wins the area contest

**Question.** Some covers put a black bar, a border, a matte or an enclosure over a rich image. By
area, uniformity, border contact and connectivity, that bar beats the actual artwork on every
statistic a field detector is likely to use. What does your paradigm publish, and does it have any
way to prefer the enclosed image over the enclosure?

**Hazard.** The frame is not noise and not an overlay mark — it is a legitimately huge, legitimately
uniform region that is nonetheless not what the palette is about. This is named in the guide as
never solved, and as having blocked the campaign's single most-requested palette across three
identical asks.

**Good answer.** Either an explicit provenance class for enclosures, or a reason the paradigm's
field criterion is not area-driven and therefore does not fall for it, or an honest "this will fail
and here is the shape of the failure". **Evasion.** Treating it as a tuning problem — a uniformity
penalty, an area cap — without saying what stops the same penalty from firing on a genuinely flat
background, which is a common and correct answer.

**Source.** Guide §10 (black-bar/frame class), §12 (named as a conscious debt at close).
**Sourcing: [reviewed]** — three identical reviewer asks are the evidence, and the guide is candid
that no solution was found. Owed in name (brief §2 goal 3 says "frames"), **`not owed` in detail**.

### A5. When the text is the subject

**Question.** On many covers the title is the largest, most vivid thing in the frame, and the
correct foreground is that lettering rather than a neutral. What in your paradigm can tell that a
region is type, and what happens when the type is cursive, textured, pointillist, or made of many
disconnected marks?

**Hazard.** Two priors point the wrong way at once. The statistical prior favours white or
near-white foregrounds because that is what most covers do; the shape prior favours small compact
marks, so genuinely giant type looks like a field rather than text. The guide reports its own
typography detector actively penalising large type — fighting the rule it was built to serve — and
that this was shipped and never fixed. Separately, per-letter analysis cannot parse cursive
(letters merge into word blobs) or pointillist lettering (one letter is many specks).

**Good answer.** A stated notion of "this is type" that does not reduce to size or compactness, and
an answer for the two named degenerate scripts — including "my paradigm has no text detector, so
giant type is handled as *X* instead". **Evasion.** Asserting that typography evidence will
outweigh the white prior without saying what produces the typography evidence, or what happens when
it is absent.

**Source.** Guide §2.9, §5 (typography vs signature cues), §10 (giant colored display text;
pointillist/cursive). **Sourcing: [reviewed]** for the rule (giant display text is the foreground),
**[reported]** for the detector's large-type penalty and the cliff-density claim. Owed in name
(brief §2 goal 3: "giant text"), **`not owed` in detail**.

### A6. Would scrambling the image change your answer?

**Question.** Take an artwork, cut it into tiles, shuffle them, and run your paradigm on the result.
Which of its outputs should change, and which should not? If the field and gradient decisions come
out the same, what were they reading?

**Hazard.** A pipeline can look structural while actually consuming global colour statistics —
histograms, moments, covariances — all of which are scramble-invariant. The scrambled twin is a
cheap falsifier for "my paradigm reads structure", and it costs nothing to answer in a proposal.

**Good answer.** A prediction: these outputs move, those do not, and here is why that is the right
split. A paradigm that *should* be scramble-invariant (some role assignment is genuinely about the
colour set, not its arrangement) passes by saying so. **Evasion.** Claiming structural sensitivity
while every named input is a global statistic.

**Source.** Guide §10 (texture vs structure — the scrambled-cover test). **Sourcing: [asserted]** —
the guide proposes the test and reports no measurement from it. Use it as a probe, never as a
finding. **`not owed`.**

### A7. Coverage of the artwork's colour directions, without inventing one

**Question.** When an artwork clearly has several distinct colour directions, does your paradigm
owe any of them representation in the four roles? And on an artwork that genuinely has one hue —
or none — what stops the same mechanism from manufacturing a second?

**Hazard.** Both errors are real and they pull in opposite directions. Under-coverage — a major
direction of the artwork with no published colour anywhere near it — was the incumbent's single
most frequent complaint class (27 warehouse notes). Over-coverage forces a second hue onto a
monochrome cover, where the correct accent is often a neutral.

**Good answer.** A stated position on whether coverage is an objective term, a constraint, a
tie-break or nothing, with the all-one-hue case answered explicitly. **Evasion.** A diversity or
spread term with no stated behaviour at the degenerate end. Maximising spread on a monochrome
artwork is exactly the failure.

**Source.** Guide §5 (identity directions), §10 (all-one-hue artworks), §12 (identity coverage
never made first-class). **Sourcing: [measured]** for the complaint count and the shipped
gamut-coverage term's AUC 0.872; **[reviewed]** for the all-one-hue rule. Owed —
`PHASE_0_DECISIONS.md` §4 P5 states both halves, including "minor hues must never be
force-included", and brief §2 goal 3 says identity coverage is first-class.

### A8. What the image *is*, where it is transparent

**Question.** If an input has genuinely transparent pixels, what colour is behind them, and who
decided? Does that decision change the palette?

**Hazard.** Whatever an alpha region is composited onto becomes, for a large cutout, the field
colour itself — so the matte is not a preprocessing detail, it is a palette decision taken before
the algorithm starts. The guide reports an unconditional white flatten that decided the field
colour of every transparent artwork for a whole campaign, documented in one prose line, never
reviewed and never conditional.

**Good answer.** A position: a named matte with a reason, a refusal, a per-image decision, or an
argument that the paradigm is matte-invariant. Any of those. **Evasion.** Silence, or "standard
compositing" — there is no standard that is neutral here.

**Source.** Guide §8.5 (the white alpha-flatten), §10 (transparent artworks).
**Sourcing: [reported]** — §8 is the least-sourced section, and this is the guide's account of its
own code. Owed, and unusually explicitly: brief §7 hands this question to the authors by name
(`d-2026-08-04-alpha-matte-and-cvd-are-algorithm-material`), and `PHASE_0_DECISIONS.md` §1 refuses
silent flattening at the input policy level.

---

# Group B — Structural hazards

*How decisions compose, and where cliffs and order-dependence enter. `V3_PLAN.md` §3.1 states the
root cause architecture-neutrally: the chaos comes from stacking many discrete, thresholded,
order-dependent decisions, and hygiene labels cliffs without removing them.*

### B1. Can anything be removed before the thing that needed it exists?

**Question.** Walk the path from image to published palette and name every point at which a
possibility stops being available. For each one: what later step might have wanted it, and how do
you know it would not have?

**Hazard.** The guide's sharpest measurement. The same rule — reject palettes whose foreground has
zero contrast — moved **148 artworks to fix 14** when applied during candidate generation, and
moved *exactly* the defective artworks and zero others when applied to the finished palette. The
collateral was not error; it was healthy artworks re-shuffled by the change in what was admitted
upstream.

**Good answer.** Either "nothing is eliminated early, by construction" with the construction
stated, or an inventory of the elimination points with the collateral argument for each. A
paradigm with real early elimination passes by naming the sites and their blast shape.
**Evasion.** "The stages are independent" or "the ranking would have recovered it" without a
mechanism that makes the recovery possible.

**Source.** Guide §3 (policy enforced early; the 148-to-fix-14 number), §8.1 (the innocent-mover
canary). **Sourcing: [measured]**. Owed, and in a strong form: `PHASE_0_DECISIONS.md` §2's last
bullet makes it a bake-off criterion — parameters at defaults must be byte-identical, and enabling
a floor may change only artworks that violate it, **zero collateral** — and §4's distribution census
names mover-set composition as the cascade canary.

### B2. Does anything have a fixed capacity?

**Question.** Is there any point in your paradigm with a fixed number of slots — top-*k*, a cap, a
shortlist, a beam, a budget? If so: what happens to the *k+1*th thing, and does adding a new source
of candidates make an existing one worse?

**Hazard.** A cap turns an addition into a subtraction. The guide reports a shortlist of four seats
that accreted three reserved-seat patches over one campaign, each added because a measurement showed
the bound cutting a valid direction, and a mechanism that cost five artworks 50–230 candidates
before the cap was raised. Displacement — not the size of the search space — is what the review
record punished.

**Good answer.** No caps, with the reason it can afford none; or caps with a stated eviction policy
and an argument that eviction is monotone. **Evasion.** Calling a cap a performance decision. It is
a correctness decision with a performance excuse; the question is what it evicts.

**Source.** Guide §3 (four seats, three patches; `representativesPerRole`; the additive-cap
episode). **Sourcing: [reported]** — specific and internally consistent, in the guide's architecture
section rather than its process sections, but traced to the campaign's own account.
**`not owed`** — capacity bounds appear nowhere in the packet.

### B3. Can every colour reach every role it deserves?

**Question.** For each of the four roles, name what could carry a colour into it. Then take a
colour that the reviewer would have put in that role and trace it: is there a path? Are there
colours that can reach some roles but structurally never others?

**Hazard.** This is the guide's most consequential structural finding and it was discovered at
close. Wanted accents mostly never reached an accent slot at all — 0 of 19 published against a
standing ask under four configurations — and a chromatic supporting colour could reach accent or
foreground but could structurally never become a surface at any rank, with 14 complaints tracing to
one constructor that only ever built (background, surface) pairs from one source. The colours
existed in the pool; the architecture could not emit them. Note the guide's own correction here: an
earlier audit concluded the opposite ("the colours are present, so it is a ranking problem") and
was retracted. **Presence is not reachability.**

**Good answer.** A reachability argument per role, ideally structural rather than empirical — "any
colour meeting *X* can occupy any role" is a strong answer if true. **Evasion.** "All candidates
are scored against all roles" without saying what generates candidates *for* a role; the incumbent
also scored everything against everything and still had walls.

**Source.** Guide §5 (the retracted claim and its reversal), §10 (role reachability), §12.
**Sourcing: [measured]**. Owed — brief §2 goal 3 states it as a success criterion in these words,
and the adjudication tool reports reachability directly (brief §5).

### B4. Does the same evidence cut both ways, and can anything only subtract?

**Question.** Take any signal your paradigm uses to favour a colour for a role. Can the same signal,
in its absence or its opposite, demote a rival? And separately: is there any mechanism that can
remove something from the output but never put it back?

**Hazard.** Two related asymmetries, both measured. One-sided credit creates incumbents nothing can
dislodge. And a one-way lever is structurally invisible to sampled review: the guide's vividness
mechanism collapsed the accent on 31.5% of everything it touched and never un-collapsed, while its
review batch sampled the defect exactly once. The direction it encoded was endorsed 4:1; the
implementation was rejected 7:1. Direction and asymmetry are separable, and the asymmetry is what
killed it.

**Good answer.** An argument that the paradigm's evidence is symmetric by construction (a global
objective usually gets this for free — say so), or an inventory of one-way effects with a detection
plan. **Evasion.** Treating "it only removes bad colours" as a safety property. That is precisely
the profile that hides its own damage.

**Source.** Guide §5 (authority symmetry; vividness), §4.10 (asymmetric mechanisms need a census).
**Sourcing: [measured]** for the 31.5%, **[reported]** for the census rule (§4).
Owed thinly — `PHASE_0_DECISIONS.md` §4's distribution census names collapse rates per role as the
asymmetric-lever detector, so the shape of the hazard is in the packet even though the story is not.

### B5. Where are the cliffs, and what sits on them?

**Question.** Name every place where your paradigm makes a discrete choice over a continuous
quantity — a threshold, a bin edge, an argmax, a branch. For each, what is the quantity's
distribution near the boundary, and how much of the corpus sits within a perturbation's distance
of it?

**Hazard.** This is success criterion 1's mechanism. A ±1-LSB dither — visually nothing — changed
**every one of 114** test palettes, and the losers lost by a median of 8 utility bands, so this is
not knife-edge ties that hysteresis could smooth. Re-encoding the same pixels at the same size
dropped agreement to 72.8%. The guide also names a specific and instructive instance: its
quantisation grid's origin sat exactly on the neutral axis, so every neutral colour lived on a bin
*boundary* and pure blacks and whites flapped half their pixels under a one-bit dither — the defect
was where the boundaries fell, not how coarse they were.

**Good answer.** Either "the decisions are few, global and over smooth quantities" with the
smoothness argued, or a boundary inventory with an argument about where the mass sits. Best of all:
a named prediction about what the robustness harness will show. **Evasion.** Promising post-hoc
stabilisation — snapping, hysteresis, seeded tie-breaks — as the answer. The measurement says the
losers lose by a wide margin, so smoothing the margin does not address it.

**Source.** Guide §1 (the stability envelope; the quantisation-origin defect), §7.
**Sourcing: [measured]**. Owed — brief §2 goal 1 quotes 72.8% and the 114 palettes and says the
failure is architectural, not tunable. The grid-origin detail is **`not owed`**.

### B6. What happens if the internal names change?

**Question.** Does any decision in your paradigm depend on the identity, order or label of an
internal object rather than on its content? If two internal objects are equivalent under your
criteria, what breaks the tie?

**Hazard.** The guide's most alarming single number: family identifiers tie-broke by ASCII string
comparison, and a pure *relabelling* — same colours, new id strings, no other change — moved
**55.85% of the corpus**. Diagnosed on day one, measured mid-campaign, never fixed, and no
invariance test in the suite at close.

**Good answer.** Content-derived tie-breaks, or an argument that ties are measure-zero and what
happens when they are not, or an explicit statement that the paradigm is order-dependent and where.
**Evasion.** "Ties do not happen in practice." They happened to 55.85% of a real corpus.

**Source.** Guide §7 (ASCII tie-breaks), §12. **Sourcing: [measured]**. Owed — brief §2 goal 1
quotes 55.85%, and `PHASE_0_DECISIONS.md` §3 makes relabel/iteration-order invariance a **binary
gate** that blocks integration.

### B7. The same file twice, and the images that are barely images

**Question.** Does your paradigm produce byte-identical output from the same input on two runs, by
construction or by testing? And what does it emit for a single-colour cover, a two-colour cover, an
image whose analysis produces exactly one group, or an image with no structure at all?

**Hazard.** Two failures with the same root — undefined behaviour at the boundary of the design.
The guide reports one unresolved same-buffer nondeterminism flake at roughly one in 200, and a
degenerate-artwork crash that surfaced only at artwork ~7,000 of the corpus. Any stage that assumes
"at least two of something" is a latent crash.

**Good answer.** Determinism by construction (no RNG, no unordered iteration, no parallel reduction
over floats) or by gate; plus a named degenerate path per stage — including what a *gradient*
means when there is nothing to shade. **Evasion.** Not mentioning it. There is nothing to evade
here; it is simply often skipped.

**Source.** Guide §8.11 (nondeterminism canary), §10 (emergency/degenerate artworks).
**Sourcing: [reported]**. Owed — `PHASE_0_DECISIONS.md` §3 makes determinism and a zero-crash
degenerate sweep binary gates.

### B8. When the main mechanism does not apply

**Question.** For each substantial mechanism in your paradigm: what happens on an image where it
cannot run? Does something else run instead, and is that visible in the output or the record?

**Hazard.** A silent fallback launders itself into the main mechanism's win record. The guide
reports a domain reconstruction quietly falling back to a whole-image approximation for shapes it
could not rebuild — 10% of gradient artworks ran a different algorithm under the same label — and a
second reconstruction bug affecting 14% of an image, both found only by self-checks against the
builder's own counts.

**Good answer.** Fallbacks that refuse, or that rename themselves, or that are counted; plus
reconstruction self-checks where anything is rebuilt. **Evasion.** Framing a fallback as
robustness. A fallback that is *invisible* is not robustness, it is an unmeasured second algorithm.

**Source.** Guide §8.5. **Sourcing: [reported]** — §8 is the least-sourced section and this is the
guide's account of its own bug. **`not owed`.**

### B9. What is the unit, and what does it read?

**Question.** At what resolution does your paradigm make its decisions, and is any quantity it uses
expressed in absolute pixels? If the same artwork arrives at 300 px and 1400 px, which of your
numbers change?

**Hazard.** Two directions. Downsampling first loses small load-bearing colours — thin text, small
logos — which is exactly the giant-type and signature-colour evidence. And any constant with
absolute-pixel units silently means something different per rendition. The guide is candid that its
own two refutations of scale-dependence were protocol-flawed (one constant swapped while every
downstream weight stayed calibrated for the old units) and that the honest status is **unresolved**
— convert all scale-covariant statistics simultaneously and recalibrate jointly, a test designed
and never run.

**Good answer.** Scale-free content statistics with any absolute constant individually justified as
a genuine pixel-scale phenomenon. **Evasion.** "It resizes to *N* px first" without an account of
what is lost, given that the input policy forbids resampling outright.

**Source.** Guide §2.1 (full resolution), §5 and §7 (areal constants, refutations contested).
**Sourcing: [measured]** for the contested status of the refutations, **[reported]** for the
downsampling losses. Owed — `PHASE_0_DECISIONS.md` §1 states "no resampling, ever", native
resolution, and resolution agnosticism with scale-free content statistics as a design constraint.

---

# Group C — Contract hazards

*The four roles, the gradient rules, exact-pixel support, and the collapses. Most of this group is
owed: the packet's `PHASE_0_DECISIONS.md` §§2–4 is the normative contract and the authors have it.
The challenges are here because having the contract is not the same as having designed against it.*

### C1. What makes a colour "supported by" the artwork?

**Question.** Every published colour must be an exact 8-bit triple present in the image. Beyond
existence: does your paradigm require a colour to be *representative*, and if so, what is the test
and what does it do to a colour that occupies a vanishingly small area?

**Hazard.** Both errors are live. Publishing a single stray pixel means publishing JPEG ringing or
sensor noise. But the opposite test is measurably worse than it looks: the toolbox review found the
**source-support invariant as specified would refuse 96.9% of the reviewer's own endorsed palettes**
(`V3_PLAN.md` §5, loose end A17), and the median endorsed role colour occupies an exact-triple area
share of 8.89e-5. A population floor is not a free safety measure; the reviewer's own endorsements
live below the obvious ones.

**Good answer.** A representativity notion that is not raw area — spatial spread, neighbourhood
mass under the same-colour bar (median 1.91e-2, two orders of magnitude above the exact-triple
figure, and the reason the distinction matters), or structural support — plus an acknowledgement
that the bar is contested. **Evasion.** Adopting a population floor as if it were settled. It is
the one gate currently known to be measurably wrong, and brief §3 says outright that a gate which
blocks an endorsed palette is demoted.

**Source.** Guide §2.2 (population floor, spatial spread, never snap to a lone pixel), §7
(mean-emitting quantizers publish colours that do not exist). **Sourcing: [measured]** for the
counter-evidence, **[reviewed]** for the no-lone-pixel rule. Owed — invariant 2 and brief §3.1.

### C2. Which colour goes where, as opposed to which colours

**Question.** Suppose your paradigm has found exactly the right four colours. What now decides
which is the foreground and which is the accent, which is the background and which the surface?
Is that decision made by the same machinery that found the colours, or by something else?

**Hazard.** Getting a beautiful colour into the wrong role is a failure, and a duller colour in the
right role often wins. **16% of the reviewer's corrections were pure permutations of
already-published colours** — the colours were right and the relationships wrong. The roles are not
interchangeable slots: the foreground is *text* (luminance-driven, no colour rescue at any
distance), the accent is *icons and UI* with explicitly lower stakes, and the two field roles are
large areas that may render as one ramp.

**Good answer.** An assignment step with its own stated criteria, or an objective whose role terms
are genuinely distinct per role. **Evasion.** A single quality score applied to four slots, ranked.
That is the machine that produces permutation errors.

**Source.** Guide §1 (role semantics; the 16% figure). **Sourcing: [measured]**. Owed —
`PHASE_0_DECISIONS.md` §4's distribution census tracks role-permutation rate and cites the 16%.

### C3. Low contrast on purpose, and the difference from invisible

**Question.** This project deliberately publishes low-contrast palettes — a hard minimum exists but
defaults to approximately zero. So what stops your paradigm from publishing text that cannot be
read at all, and what is the difference between "deliberately subtle" and "invisible"?

**Hazard.** The obvious guard is an accessibility floor, and it is wrong here: palettes at very low
contrast were repeatedly graded good, and the first reviewed-strong palette any floor would destroy
sits at Lc 8.4. But a pair at genuinely zero luminance contrast over a large area is invalid
regardless of hue. Two pieces of arithmetic constrain any threshold anyone writes: **APCA cannot
emit any magnitude strictly between 0 and ~7.3** — everything with |raw| < 10 clamps to 0 — so every
threshold inside that interval is *the same rule* as "exactly zero", and an accessibility-style
floor is structurally unavailable below 7.3. And identical colours do not produce raw 0: the
formula leaves a residue peaking at 1.98152, so an epsilon below that lets a literally identical
pair pass.

**Good answer.** Working on the raw pre-clamp scale, or on an explicitly different visibility
notion, with the dead band acknowledged. **Evasion.** Naming any Lc threshold between 0 and 7.3 as
if it were a tuning choice. It is not a number; it is the same rule as zero, wearing a decimal.

**Source.** Guide §2.3, §2.7, §7 (the APCA dead band). **Sourcing: [measured]** — this is
arithmetic and re-derivable. Owed — `PHASE_0_DECISIONS.md` §2 and §4 state the dead band, the raw
scale and the 1.98152 ceiling explicitly.

### C4. Which pairs, and where along the ramp

**Question.** Which colour pairs does your paradigm check for readability? Does that include the
accent? Does it include the colours that exist only *between* published stops?

**Hazard.** A check that looks complete usually is not. The guide reports finding **8
foreground-midpoint and 37 accent-midpoint violations that no existing check had ever seen**, and
the reviewer's own ruling was that per-stop checking checks the corners of a picture and calls it
the picture. There is a mathematical trap under this: APCA's luminance uses mixed-sign cone
coefficients, so contrast along a ramp is **non-monotone** wherever chroma swings — measured on 5.8%
of test segments, failing in the dangerous direction — which means endpoint algebra is unsafe. And
a sampling artifact in the other direction: two samples straddling the zero-clamp plateau report a
**phantom sign flip** that is never actually traversed.

**Good answer.** A minimum over the whole interpolated ramp, computed on raw values, in the space
the ramp is actually rendered in. **Evasion.** Checking endpoints, or checking stops, and calling
it whole-ramp coverage.

**Source.** Guide §7 (all four role pairs and stop colours; non-monotonicity), §6 (contrast
sampling; the phantom flip). **Sourcing: [measured]**. Owed — `PHASE_0_DECISIONS.md` §2 enforces
both floors as a minimum over the entire interpolated ramp in OKLab, and names the phantom-flip
artifact.

### C5. Does anything that picks gradient colours also decide whether there is a gradient?

**Question.** Trace the gradient boolean. Is there any mechanism that both influences whether a
gradient is published *and* which colours it uses? If your paradigm decides both at once — a global
objective might — what prices the gradient claim, and is that price symmetric?

**Hazard.** A wrongly allowed gradient is exactly as bad as a wrongly prevented one, and mechanisms
that touch gradient colours leak into the boolean unless prevented by construction. The guide's
sharpest case: a mechanism looked perfectly neutral on a 63-artwork panel — zero flips in either
direction — and at corpus scale **destroyed 24 gradients against 1 allowed** while moving 17.6% of
the corpus. **Panel neutrality is not corpus neutrality; only a census settles it.**

**Good answer.** Neutrality by construction (colour choice strictly downstream of the boolean), or a
symmetric price inside a single objective — the guide's own never-built suggestion is an MDL term
that charges for the gradient claim the same way it charges for anything else — plus a census plan.
**Evasion.** "It only affects gradients that already exist." That is the exact shape of the 24-to-1
failure.

**Source.** Guide §2.4, §6 (the MDL idea). **Sourcing: [measured]**. Owed thinly —
`PHASE_0_DECISIONS.md` §4's distribution census names "gradient rate moved in either direction
(neutrality census)", so the instrument is in the packet; the panel-versus-corpus lesson is not.

### C6. Where does the shading actually end?

**Question.** When your paradigm publishes a ramp, what determines its two ends? Are they the ends
of the visible shading, or the ends of whatever your fitting procedure happened to look at?

**Hazard.** Systematically too narrow. The incumbent read its endpoints at fixed positions 0.1/0.9
of a fitted band — an uncommented literal whose confident "deliberate overshoot" rationale turned
out to have been written days later, by the commit that named it — while the true ramp extended
beyond both. Two useful corrections travel with it. Re-aiming the read at 0.0/1.0 achieved
essentially nothing (−5.8%): the candidate pool, not the aim point, was binding. And extending an
endpoint outward can land on a colour already published in another role — "we end up with black
olive as both the surface and the accents" — so any extension must be checked against the whole
published palette, on the *snapped* pixel rather than the walk target.

**Note the contract has moved under this one.** The guide recommends decoupling render stops from
role colours; the reviewer's 2026-08-04 ruling pins the first stop to the background and the last to
the surface exactly, so the decoupling survives for the ramp's interior only. Do not fault a
proposal for obeying the current contract, and do not treat the guide's recommendation as live.

**Good answer.** A stated criterion for where shading ends that is a property of the image rather
than of the fit, plus a distinctness check against the other published colours. **Evasion.** A
fitted range with fixed read positions and no argument about what is outside it. The guide's own
record on its fix was 4 wins / 3 losses / 7 ties — real but not decisive — so this challenge asks
for awareness, not a solution.

**Source.** Guide §6 (endpoints; guard every extension). **Sourcing: [measured]** for the record and
the −5.8%, **[reviewed]** for the black-olive collision. Owed — brief §3.1 states the endpoint
ruling verbatim.

### C7. What the ramp renders *through*

**Question.** Between two published stops the renderer interpolates. What colours does that
interpolation pass through, and does your paradigm know whether they exist in the artwork?

**Hazard.** A straight line in colour space between two real artwork colours can pass through a
colour the artwork does not contain, and the viewer sees the excursion as a colour that "doesn't
feel like part of the artwork" — the incumbent's reviewer named a specific grey-mauve at t=0.5
before any instrument measured it, and the instrument then found exactly that colour. Two facts
constrain the fix: interior stops exist **only** to pull the ramp back onto the artwork (excursion
reduction), never for coverage, metric-fitting or meandering, and curvature costs banding, so the
winner is the flattest path that stays on-artwork. Also: **42% of published midpoints sat outside
their endpoints' lightness span**, so any assumption that an interior stop lies "between" its
neighbours is false.

**Good answer.** An explicit excursion criterion, measured in the interpolation space actually
rendered (OKLab), with a stated bar. **Evasion.** Treating interior stops as extra expressive
capacity. Under the contract they are guides, and the fourth is negotiable on proven utility rather
than granted.

**Source.** Guide §6 (midpoints; the 42% figure). **Sourcing: [measured]**. Owed — the guide-stop
semantics are quoted verbatim in brief §3.1 and `PHASE_0_DECISIONS.md` §2, and pathology P1 is the
excursion census.

### C8. When is two colours the right answer?

**Question.** Your paradigm can publish four distinct colours or collapse the surface onto the
background and the accent onto the foreground. What decides? What makes a two-colour palette better
than a four-colour one on the same artwork, rather than merely easier?

**Hazard.** Collapse is a legitimate published form, not a failure — but it is also what an
under-confident system does when it cannot find a fourth colour, and the two are indistinguishable
in the output. Collapse must be *exact* hex equality with the flag set; near-identical-but-unequal
is not a collapse, it is two colours that look alike, and it is a violation. There is one escape
from source-support — a single pure white or pure black, at background or foreground only, partner
collapsed, only when there is genuinely no other way to make two colours — and an escape declared
over a colour the artwork *does* contain is itself a violation.

**Good answer.** A stated pricing: what makes the fourth colour worth publishing. **Evasion.**
Collapse as a fallback for "found nothing". That is the same output as the correct answer with none
of the reasoning, and it is invisible to any check.

**Source.** Guide §1 (two-colour palettes are legitimate; pricing collapse is a real decision).
**Sourcing: [reviewed]**. Owed — brief §3.1 states both collapses and the escape with all four
conditions.

### C9. How many rulers do you have?

**Question.** How many distinct notions of "these two colours are different" does your paradigm
use? Does any single threshold serve more than one purpose?

**Hazard.** Two failure modes, opposite in shape. Too many rulers: the incumbent shipped a second,
unreviewed same-colour literal that overruled the reviewed one in a single code path — two rulers
disagreeing is a defect class. Too few: **"is this the same colour?" and "does this accent do its
job?" are anisotropic in opposite directions.** The perception round measured that a lightness step
must be about **2.9× larger than a chromatic one** to register as a different colour, while a
lightness step is worth about **3.9× a chromatic one** for making an accent findable. Same space,
same decomposition, opposite anisotropy. A single distance function cannot serve both.

**Good answer.** A declared inventory of rulers with the purpose of each. **Evasion.** One ΔE
threshold used for distinctness, collapse detection, accent visibility and gradient stop spacing.
**Do not** fault a proposal for not knowing the committed digits: they are region-dependent, one of
them is `[UNCALIBRATED]`, and brief §3.1 explicitly tells authors not to build anything that
depends on the bar's exact value.

**Source.** Guide §7 (keep ONE ruler), plus brief §3.1 open question 3, which is newer than the
guide and partly contradicts it. **Sourcing: [measured]** — and this is the one place where the
brief's own material is stronger evidence than the guide's. Owed.

---

# Group D — Process and parameter hazards

*Where free parameters accumulate. `V3_PLAN.md` §3.3, architecture-neutrally: any architecture whose
iteration loop is "add a weighted term" will re-create the ~900-sites-against-11-anchors ratio.
Caution: this group draws on the guide's §4/§8/§11, its least-sourced sections. Several entries are
[reported] or [asserted] and are questions, not tests.*

### D1. Which numbers decide, and what would anchor each?

**Question.** List the independent decisions your paradigm needs a human to make. For each: what
evidence could set it, and what happens to the output if it moves 20%?

**Hazard.** The incumbent carried roughly 900 tunable sites against 11 human-anchored values —
about 8.5 free parameters per human judgment. Two findings sharpen it. **Anonymous inline literals
were five times cliffier than named constants** (50% load-bearing against 17%), so the unnamed half
of a codebase is the more dangerous half. And the fragility ranking and the pinned-constant set
were *nearly disjoint*: you pin what you argued about, not what actually decides.

**Good answer.** A count of paradigm-level decisions — not literals — each with a proposed anchor,
including "this one has no anchor and would be arbitrary". **Evasion.** Counting only the numbers
the proposal happens to name. The question is how many independent choices the paradigm *needs*.

**Source.** Guide §8.3, §11 (parameter sweeps), §4.11 (provenance pins).
**Sourcing: [measured]** for the site counts and the anonymous-literal ratio; **[reported]** for
the pinning practice. Owed, and prominently — brief §1 asks for exactly this and calls a proposal
that cannot answer it one that has not been thought through.

### D2. What is the repair, when this paradigm is wrong?

**Question.** A reviewer looks at your output and says it is wrong. What is the shape of the fix?
Walk through it: does the fix add a term, a weight, a threshold, a special case — or does it change
something structural?

**Hazard.** This is the parameter-accumulation mechanism itself. If every repair is "add a weighted
term", the site count grows monotonically with every review round and the ratio returns regardless
of the starting architecture. The guide's own record shows the accretion: reserved-seat patches on
a shortlist, a second same-colour ruler, an inert weight layer still shipping at close.

**Good answer.** A repair story with a name — refit one global term, add a constraint, extend a
parse category — plus an honest statement of what the paradigm's cheap repair is and why it does
not compound. **Evasion.** "It would be retrained/refit" without saying what data, or a repair
story that is a different mechanism every time. Also worth noting rather than penalising: a
paradigm whose only repair is expensive has a different problem — it may be unimprovable at
review speed.

**Source.** Guide §3 (accreted patches), §12 (the debts at close); framing from `V3_PLAN.md` §3.3.
**Sourcing: [reported]**. **`not owed`** — nothing asked authors to describe their iteration loop.

### D3. What would show that this is fitted to what it has already seen?

**Question.** Your paradigm will be developed against a corpus and a warehouse of past verdicts.
What measurement would tell you it had become specific to those artworks rather than to the
problem?

**Hazard.** The incumbent measured **1.61× more perturbation-stable on reviewed artwork than on
unseen** (2.50× for the core quality weights) — a direct, quantified overfitting signal that nobody
had thought to look for until late. The corresponding trap on the verdict side: a "strong" grade
means "this is good", not "everything else is worse", and 32 artworks were graded strong having
only ever been shown one palette — one unreviewed fixture alone killed six mechanisms.

**Good answer.** Any named detector — the reviewed-versus-unseen stability ratio, held-out
behaviour, a prediction about which artworks will look worse. **Evasion.** "It has few parameters,
so it cannot overfit." Parameter count and fitting to a corpus are different things; a paradigm
with three constants chosen by looking at forty covers is fitted to forty covers.

**Source.** Guide §8.3 (the 1.61× measurement), §4.3 (grade-strength is not preference-strength).
**Sourcing: [measured]** for the ratio, **[reported]** for the warehouse epistemology.
Owed — brief §2 goal 2 quotes the 1.61× figure. (Note for the applier: `V3_PLAN.md` §6 rows 4/5
record that this ratio is currently **tracked by no instrument** and moves to the Phase 2 entry
condition, so no proposal can be checked against it yet.)

### D4. If you want weights fitted from verdicts, what data would that need?

**Question.** Does your paradigm expect any of its numbers to be learned from the reviewer's
judgments? If so, what would each judgment have to vary for the fit to be identifiable?

**Hazard.** A decisive null, and the reason matters more than the result. About 150 verdicts
yielded only **54 usable pairwise constraints against 12 coefficients**, and fitting made held-out
agreement *worse* (66.7% → 51.9%) — because the batches had been designed to answer "is this
palette acceptable", so most scoring axes barely varied within a compared pair and were
unidentifiable at any sample size. **This was a data-design failure, not a method failure**, and it
is fixable only from day one, by designing review batches that move one axis at a time.

**Good answer.** Either no fitted weights, or a stated data design — which comparisons would have
to exist for the fit to work. **Evasion.** Assuming the existing warehouse can supervise a fit. It
demonstrably could not, and its verdicts are censored and relative besides.

**Source.** Guide §7 (the fitting null), §4.3. **Sourcing: [measured]**.
**`not owed`** — the brief tells authors the warehouse and auto-adjudication exist and that
adjudication *gates nothing*; it deliberately does not tell them fitting was tried and failed.
This is a conclusion, and §7 of the brief withholds conclusions on purpose.

### D5. What would you do with a rule that separates your failures perfectly?

**Question.** Suppose that during development you find a two-clause rule that perfectly separates
the cases you got wrong from the cases you got right, over the dozen artworks you were staring at.
What happens next in your paradigm's process?

**Hazard.** With few data points and free thresholds, perfect separation is the *expected* outcome
and means nothing: enumerating two-clause rules over 8 adjudicated artworks produced **162 perfect
separators**. A rule that was not hypothesised before looking needs out-of-sample confirmation
before it is anything at all.

**Good answer.** Pre-registration, held-out confirmation, or an argument that the paradigm's
structure does not admit post-hoc clauses. **Evasion.** Treating this as a discipline question
rather than an architectural one — an architecture that makes post-hoc clauses cheap to add will
accumulate them regardless of anyone's discipline.

**Source.** Guide §8.4. **Sourcing: [reported]** — the 162 figure is the guide's own account,
in its least-sourced section, though the underlying statistics are uncontroversial.
**`not owed`.**

### D6. Which of your claims are structural, and which are arguments?

**Question.** Your proposal will assert properties — neutral, deterministic, robust to *X*, free of
cascades. For each: is it a property of the construction, or a belief about the implementation?

**Hazard.** The guide's most self-critical entry, and it applies to whoever applies this checklist
as much as to any author: the orchestrator's own algebraic derivation of a contrast minimum was
measured wrong, in the dangerous direction, because APCA is non-monotone along a chromatic ramp.
An elegant argument that is not measured is a hypothesis. And a related trap in the same family:
"deliberate design" derived from inherited code — the 0.1/0.9 read positions had a confident
rationale that `git log` showed was written days after the literals appeared.

**Good answer.** A separated list: proved by construction versus expected and checkable, with the
check named. A proposal that says "I believe this and here is how you would falsify it" has passed.
**Evasion.** Confident prose. This is the challenge that exists to catch the thing all the other
evasion lines have in common.

**Source.** Guide §8.13, §7 (trust `git log`, not comments). **Sourcing: [asserted]** — a pair of
anecdotes. Use it as a reading posture, not as a finding. **`not owed`.**

---

# What was deliberately left out

The guide contains hazards that are not carried into challenges above. Listed with the reason,
because what was dropped is as much a decision as what was kept.

| dropped | reason |
|---|---|
| **The whole of §4** except where a lesson has an architectural face (harness first, small blinded batches, correction handling, recording conversation, isolated arms, calibration rounds with repeats, fresh-artwork mining, operational hygiene) | These are how the *campaign* runs, not how an architecture works. A proposal cannot answer them and faulting it for silence would be a category error. Phase 3 inherits them verbatim (`V3_PLAN.md` §6). |
| **§7's avoid-list as prescriptions** (k-means, HCT tone synthesis, hue-harmony templates, SLIC, mean-shift, diffusion curves, CAM16 migration) | These are feature prescriptions — exactly what a checklist must not become. Their architecture-neutral residue survives inside C1 (publish exact pixels, never bin means) and B5 (discretisation). A paradigm choosing k-means with an argument has passed C1, and the guide's opinion of k-means is not evidence against it. |
| **Learned saliency's non-transferability** | Nearly moot: brief §3.1 bans runtime models with one narrow SAM exception, so a paradigm reaching for a saliency model already owes the four SAM conditions. The guide's finding (face/horizon detectors fail on stylised art; frequency-tuned saliency degenerates when the salient object is large, which is the album-cover case) is worth mentioning to any proposal that reaches for one — but as context, not a challenge. |
| **§8.6 sweep artifacts, §8.8 stale labels, §8.9 stale tooling, §8.10 identifier ambiguity, §8.15 uncommitted policy, §8.16 profilers lie** | Instrument and tooling hazards. They bind the orchestrator and Phase 2's harness, not a paradigm. |
| **§11 performance findings** (recomputation, byte-identical proof, CPU-time methodology, perf passes duplicating code) | Optimisation of an existing implementation. There is nothing to optimise in a proposal, and the only live question — cold per-file cost — is already asked by brief §3.1 and returned by every author under `COMMISSIONING.md` §4. |
| **§9 "signs you are going the right direction"** | A progress narrative about a campaign in flight. Nothing in it is answerable before a prototype exists. |
| **§12's debt ledger as a list** | It is an inventory of the incumbent's unfinished work. Every item in it that is a *hazard* appears above as a challenge (frames A4, reachability B3, identity coverage A7, tie-breaks B6, scale-dependence B9, stop decoupling C6); the rest is v2-3's homework. |
| **The canonical-input-policy decision** (§1: "decide it on day one") | Already decided and handed to the authors — `PHASE_0_DECISIONS.md` §1 (no resampling, native resolution, pinned decoder, per-rendition scoping). Asking an author to decide it would invite them to contradict the contract. |
| **The ~97% acceptability figure and everything scaled to it** | Withdrawn by the reviewer on 2026-08-04 as fake, and `V3_PLAN.md` §1 and brief §2 both forbid quoting it. It cannot be a challenge, a baseline, or a comparison. |
| **§3's pipeline shape** (evidence → families → field hypotheses → obligations → slate → ranking → winner → post-winner passes) | This is the blueprint. Dropping it is the entire point of the exercise. Its two *structural* lessons — no early elimination, no fixed capacity — survive as B1 and B2, stated without any of those nouns. |

---

# The one-page version

For applying in a sitting. **Sourcing marks bind: [reported] and [asserted] challenges raise
questions and cannot sink a proposal.** `not owed` means the hazard was withheld from authors by
design — explore it, never score it.

| # | challenge | sourcing | owed? |
|---|---|---|---|
| A1 | What makes a region the field | [measured] | owed |
| A2 | One shaded surface vs two adjacent areas | [reviewed] / [reported] | partly not owed |
| A3 | Colours present but not belonging (badges, logos) | [reviewed], thin | not owed in detail |
| A4 | Bars and frames that win the area contest | [reviewed] | not owed in detail |
| A5 | When the text is the subject | [reviewed] / [reported] | not owed in detail |
| A6 | Would scrambling change the answer | [asserted] | not owed |
| A7 | Colour-direction coverage without inventing one | [measured] / [reviewed] | owed |
| A8 | What the image is where it is transparent | [reported] | owed |
| B1 | Early elimination and collateral | [measured] | owed |
| B2 | Fixed capacity and eviction | [reported] | not owed |
| B3 | Role reachability | [measured] | owed |
| B4 | Symmetric evidence; one-way levers | [measured] / [reported] | owed thinly |
| B5 | Cliffs, boundaries, and what perturbs across them | [measured] | owed (grid detail not owed) |
| B6 | Relabelling and tie-breaks | [measured] | owed |
| B7 | Determinism and degenerate inputs | [reported] | owed |
| B8 | Silent fallbacks | [reported] | not owed |
| B9 | Resolution, and absolute-pixel units | [measured] / [reported] | owed |
| C1 | What "supported by the artwork" means | [measured] / [reviewed] | owed |
| C2 | Role assignment vs colour selection | [measured] | owed |
| C3 | Low contrast vs invisible; the APCA dead band | [measured] | owed |
| C4 | Which pairs, and the whole ramp | [measured] | owed |
| C5 | Gradient-claim neutrality; panel vs census | [measured] | owed thinly |
| C6 | Where the shading actually ends | [measured] / [reviewed] | owed |
| C7 | What the ramp renders through | [measured] | owed |
| C8 | Pricing the two-colour palette | [reviewed] | owed |
| C9 | How many rulers | [measured] | owed |
| D1 | Which numbers decide, and their anchors | [measured] / [reported] | owed |
| D2 | The repair loop | [reported] | not owed |
| D3 | Detecting fit to what has been seen | [measured] / [reported] | owed |
| D4 | Fitting weights from verdicts | [measured] | not owed |
| D5 | Perfect separators over few points | [reported] | not owed |
| D6 | Structural claims vs arguments | [asserted] | not owed |

**32 challenges: 8 semantic, 9 structural, 9 contract, 6 process.** By strongest mark carried:
19 [measured], 5 [reviewed], 6 [reported], 2 [asserted]. Twelve are flagged `not owed` in whole or
in part (A2, A3, A4, A5, A6, B2, B5, B8, D2, D4, D5, D6); two more (B4, C5) are owed only thinly —
the instrument reached the authors, the lesson did not.

**A closing note to whoever applies this.** The failure mode of an adversarial checklist is that it
finds fault everywhere, because every question can be asked of every proposal and no proposal
answers all of them. A proposal is not weaker for confronting a hazard and choosing to live with
it — `PHASE_1_AUTHOR_BRIEF.md` §1 says an immature idea that fails interestingly is worth more here
than a safe one that scores, and `V3_PLAN.md` §6 says Phase 2 judges trajectory and ceiling rather
than first-round scores. Ask what a paradigm's *failures* would look like and whether they are
fixable from inside it. That is the question this checklist is for.
