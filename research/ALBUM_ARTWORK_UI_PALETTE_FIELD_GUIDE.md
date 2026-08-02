# Building a UI palette extractor for album artworks, from scratch — the field guide

This document distills everything the v2-2 → v2-3 research campaign learned, written for
someone building this algorithm again from nothing. The goal is that a re-implementation
following this guide would skip our detours, avoid our mistakes, and arrive at a better and
more robust result faster. Everything in here is backed by either a human verdict, a
measurement over the full corpus (~7,600 artworks), or a decisive null result — and where a
claim is one of ours rather than a measurement, it says so.

**Revision 3.** The first draft was written from the orchestrator's working memory; it was
then corrected against the primary records by two independent audits — a claim-by-claim
fact-check against the pins, warehouse, and experiment records (full verdict list:
`research/v2-3-eval/FIELD_GUIDE_FACTCHECK.md`), and a full read of the raw session
transcript (9,240 lines) that recovered findings the memory compression had flattened or
inverted — followed by a residual pass over the corrected text. Epistemics note: numbers
here are verified against primary records wherever such records exist; a few figures trace
only to the session transcript (a secondary source) and are worded as recollections, not
measurements.

The campaign took the algorithm from 70.6% acceptable-or-better to a measured ~97%
(n=60 unbiased calibration; see §12 for the noise band that number must carry) over roughly
two days of intensive iteration, ~60 review batches, hundreds of warehouse verdicts, and
about forty experimental arms. This is what we'd tell ourselves at the start.

---

## 1. What you are actually building

- **The output shape is small and fixed, and that is a feature.** Four colors — background,
  surface, foreground, accent — plus a gradient boolean and, when a gradient fires, an
  optional third "midpoint" stop. Every improvement fits inside this contract. Resist adding
  fields; we never needed to. (One exception worth designing in from the start: let gradient
  *render stops* differ from the published role colors — see §6.)
- **Role semantics matter more than color quality.** The foreground is *text*. The accent is
  *icons and UI elements*, explicitly not text — its readability stakes are lower, and the
  human confirmed "slight distinguishability loss there is not a huge deal." The background
  and surface are *fields* — large areas, sometimes rendered as one gradient. Getting a
  beautiful color into the wrong role is a failure; a duller color in the right role often
  wins. Relational failures are common: **16% of the reviewer's corrections were pure
  permutations of already-published colors** — the colors were right, the relationships
  wrong.
- **Ground truth is one human's judgment, and that is the correct spec.** "We're making an
  algorithm for me." Do not substitute WCAG, design-system conventions, or aesthetic priors
  for the reviewer. Every rule in this guide that looks arbitrary is a human verdict.
- **Two-color palettes are legitimate.** The surface may collapse onto the background and
  the accent onto the foreground. Collapse is a deliberate published form, not a failure —
  but *pricing* collapse correctly (when is two colors better than four?) is a real,
  reviewable decision.
- **Know your stability envelope, and scope every claim to it.** The campaign's own
  one-line characterization: **stable per file, sensitive per encoding, scoped per
  rendition.** The same file always yields the same palette (up to one measured
  ~1-in-hundreds nondeterminism flake, unresolved at close). But re-encoding the *same
  pixels at the same size* dropped palette agreement to 72.8%, and a ±1-LSB dither —
  visually nothing — changed **every one of 114 test palettes**, with losers losing by a
  median of 8 utility bands (not knife-edge ties a hysteresis could fix). Only 2 of 114
  dual-resolution cover pairs produce identical palettes; the honest cross-rendition
  ceiling was ~67%. Two consequences: every verdict is a verdict about one *rendition*,
  and declaring one resolution canonical retroactively voids every verdict taken on the
  other. Decide your canonical-input policy on day one. (Two known partial causes worth
  fixing early: the quantization grid's origin sits exactly on the neutral axis, so every
  neutral color lives on a bin *boundary* — pure blacks/whites flap 50% of their pixels
  under a one-bit dither; and the darkest bins are so *fine* that each contains at most
  one representable grey — fragmentation, not coarseness, is the dark-toe failure.)

## 2. Non-negotiable design constraints (learned the hard way, then confirmed repeatedly)

1. **Work at full resolution.** Downsampling caused "incomplete artwork identity" losses —
   small-but-load-bearing colors (thin text, small logos) vanish. Accuracy beats speed as
   long as runtime isn't the iteration bottleneck (we ended around 0.7 s median / 1.29 s
   mean per artwork after several byte-identical performance passes; fast enough for
   everything).
2. **Every published color must be source-supported with real representativity.** Never snap
   to a lone pixel: one pixel can be noise, JPEG ringing, or an aberration. Demand a
   population floor (we used ≥0.1% of the artwork within one quantization cell) and a
   spatial-spread test (the color's pixels must be spread like a *material*, not one speck).
3. **Contrast is deliberately low, but exact-zero is a pathology.** This is not an
   accessibility project; palettes at low APCA were repeatedly graded good — the first
   reviewed-strong palette any floor would destroy sits at Lc 8.4 (loups). Keep any hard
   minimum as a user parameter defaulting to ~0. But a foreground/surface pair at *exactly*
   zero contrast (unreadable text over a large area) is invalid regardless of hue. Know the
   APCA dead band (§7) before you write any threshold.
4. **Gradient neutrality.** A wrongly allowed gradient is exactly as bad as a wrongly
   prevented one. The goal is to represent what the artwork *is*. Enforce neutrality **by
   construction** — run gradient-color mechanisms *after* the gradient boolean is decided —
   not by measuring and hoping. Every mechanism we built this way was provably neutral;
   both mechanisms we built inside candidate generation broke neutrality. The sharpest
   case: a generation-stage surface-supply mechanism looked perfectly neutral on a
   63-artwork panel (zero gradient flips either way) and at corpus scale destroyed
   **24 gradients against 1 allowed** while moving 17.6% of the corpus — **panel
   neutrality is not corpus neutrality**; only a census settles it. (A principled
   alternative we never built: price the gradient claim symmetrically inside the fit
   itself — see the MDL idea in §6.)
5. **A gradient means continuous shading within one physical surface** ("shadows on the same
   surface"), never a transition between two distinct areas ("the sky and the grass are just
   different areas"). This distinction is the single most important gradient decision and it
   is *semantic* — no pure color statistic fully captures it.
6. **A midpoint must be visually distinct from both endpoints.** Identical hex is invalid,
   and two near-blacks that a human can't tell apart "should be considered the same color"
   even when measurably different. Our bar: CIE76 ≥ 3.3 *and* the human's squint test.
7. **Zero-contrast crossings are hue-conditional only when thin.** A mid-gradient APCA sign
   flip is fine when hue carries readability ("it's pink on blue, I can still totally read
   it") — the zero-contrast locus is a thin line. But a *flat role pair* at zero, or a
   foreground matching a published *stop* color (the ramp plateaus around stops — "white on
   white for a significant width"), is invalid regardless of hue.
8. **Provenance of a color matters, not just its statistics.** A color that exists only in
   an overlaid record-label badge or logo "doesn't really belong to the artwork itself."
9. **Giant display text is the foreground.** When the title is written huge in a vivid
   color, that color is the foreground role. The natural statistical bias is toward
   white/near-white foregrounds; fight it with typography evidence — and audit your
   typography detector for the failure we shipped and never fixed: ours actively
   *penalized* large type, fighting this very rule.
10. **An artwork can have multiple valid palettes.** Moving off a reviewed-strong palette is
    NOT automatically a regression — it is one only if the *destination* was reviewed
    negatively or compared inferior. This single rule ("never move TO known-worse", not
    "never move") is what let the campaign keep improving instead of freezing. Our early
    conservative auto-kill rule ("any strong palette moved → arm dead") was audited later:
    of 168 killed items, 67% died of real evidence, but **21% had been killed purely on
    movement with destinations never shown** (plus 11% partly so). When that quarter was
    actually adjudicated, most of it produced *closure* rather than recovered wins — the
    lesson is that the expensive quarter was worth adjudicating, not that it was full of
    treasure.

## 3. The architecture that emerged — and the one thing we would change

The pipeline that works: **evidence → color families → field hypotheses → role obligations →
candidate slate → ranking → winner → post-winner passes**.

- **Families**: quantize in OKLab. Our bin step of 0.04 remains, honestly, an
  `[INHERITED]` value: a late derivation arm recovered its *shape* from colorimetric math
  (re-expressing the incumbent, valid over 99.18% of the sRGB cube and 88.2% of the
  lightness range) but did not derive the magnitude independently, and the full
  perceptually-uniform grain mechanism failed 4 of its 8 predictions at a 49.66% blast
  radius and ships OFF. "Derive your quantization from perceptual math" is still the right
  ambition — just don't mistake shape-validation for derivation, as our first draft did.
  The sensitivity is enormous either way (±20% moves ~97% of palettes).
- **Field hypotheses**: which family/families form the background field, flat or gradient,
  with domain reconstruction (which pixels belong to the field).
- **Obligations**: evidence-driven claims that a family deserves a role ("this vivid red is
  the artwork's signature and wants the accent").
- **Candidate slate**: materialized full palettes (~1500 cap), ranked by a Pareto frontier
  plus a banded comparator over quality axes.
- **Post-winner passes, in order**: gradient support (incl. flat fallback) → gradient color
  refinements → midpoint insertion → text-role restriction (fg/accent swap on decisive
  claims) → last-minute repairs. Each pass reads a *decided* palette and can only refine it.

**The one structural mistake to not repeat: policy enforced early.** Our obligation
shortlist had **4 seats** ordered by a single heuristic, and over the campaign it accreted
*three* reserved-seat patches, each added because a measurement showed the bound cutting a
valid direction. A second capacity bound (`representativesPerRole = 2`) was blamed by one
arm directly and implicated by another's "slot-bounded" diagnosis, and never relaxed.
Worse, any rule enforced during candidate generation cascades: when we filtered
zero-contrast candidates early, **148 artworks moved to fix 14** — 10:1 collateral on
artworks that had no defect, because the capacity-bounded slate re-shuffled admissions. The same rule enforced at the **final-winner
stage** moved *exactly* the defective artworks and zero others, verified over the full
corpus. Caps cut both ways: *adding* candidates under a cap silently evicts existing ones
(one mechanism cost five artworks 50–230 trunk candidates before the cap was raised to make
it provably additive — displacement, not domain size, is what the review record punishes).

**The pattern to adopt from day one:** generation and ranking stay *generous and neutral*;
every opinionated policy (contrast floors, pathology repairs, user parameters) runs as a
**last-minute repair on the published winner**, re-picking from the already-ranked slate
when needed. Zero cascade by construction. If we rebuilt from scratch, user-facing
parameters would *never* touch pre-selection.

Credit where due: this central lesson was articulated by the (non-specialist) reviewer in
one line, upon being shown the 149-to-fix-15 blast radius — "if the issue is that we're
preventing colors too early, then let's just not do that, and prevent them at the last
minute." Report blast radii to your reviewer in plain terms; they will diagnose
architecture from them.

## 4. The process that actually produced progress

This mattered as much as any algorithm. In rough order of importance:

1. **Build the evaluation harness first.** A verdict warehouse (append-only JSONL), a
   blinded A/B review UI, and a batch builder were the force multipliers for everything
   else. Every reviewed palette, note, and correction is a permanent, queryable asset —
   we adjudicated later mechanisms against verdicts recorded days earlier, constantly.
2. **Small blinded batches, always — for three reasons, not one.** 4–10 items per batch,
   A/B sides shuffled per item by content hash, the unblinding key never served. The
   reviewer's own reasons: "many small reviews as you work help me witness the progress,
   sometimes catch some issue before we spend too much time on it, and at the very least it
   helps expand our warehouse so the work can be more and more autonomous." Fatigue is the
   third reason. Serve two batches on two ports in parallel when the queue builds up.
3. **Understand what the warehouse is — and is not.** The reviewer's own epistemology,
   stated explicitly: the warehouse holds *censored, relative* judgments. A "strong" grade
   does not mean "the best palette for this artwork" (shown a better one, the reviewer may
   change their mind), and several palettes can be equally valid. Rules that follow:
   a reviewed palette is never a regression *target*; the only fitting signal is "preferred
   over the alternative *actually shown*"; "both equally fine" verdicts contribute **no
   ordering constraint at all**; and when a fitted objective disagrees with a past verdict,
   that is a *review item*, not a fitting error. Related trap, measured: 32 artworks were
   "strong" having only ever been shown one palette — a grade that says "this is good,"
   which the process quietly read as "everything else is worse"; one unreviewed fixture
   alone killed six mechanisms. Grade-strength is not preference-strength.
4. **Corrections are gold — handled with the reviewer's own care.** The review UI lets the
   reviewer submit "the palette I'd endorse." Their conditions, worth adopting verbatim:
   fuzzy comments stay the primary channel ("me suggesting one might feel like biasing a
   little too much towards a specific result"); explicit corrections are labelled
   `endorsed-sample` in the data, not treated as oracles ("many palettes can be valid and I
   can make mistakes"); and the reviewer must be able to *preview* any palette they
   assemble — never make them endorse colors blind.
5. **Record everything, including conversation.** Design principles stated in passing
   ("a gradient is shadows on one surface") go into the warehouse as note-only records with
   tags. Half our best rules started as offhand reviewer remarks.
6. **Isolated experimental arms with strict briefs, staggered at the review gate.** Every
   mechanism is built by an agent in an isolated worktree, behind a flag constant
   defaulting OFF, with byte-identical output when off (verified from committed states,
   never dirty trees). The reviewer's stated rationale for parallelism: it takes a lot of
   work to go from "an improvement idea" to "a human review testing that idea," so run many
   arms that *reach the review stage at different times* — the constraint is reviewer
   bandwidth, not compute. The arm reports: the mechanism, the corpus blast radius, every
   mover's before/after, and movers checked against the warehouse. Only then does anything
   reach human review.
7. **Destination adjudication before serving.** For every mover, classify the destination:
   matches an endorsement → win; matches a reviewed-bad palette → regression; unknown →
   reviewable. Only destination-known-worse counts against a mechanism automatically.
8. **Two integration patterns, both legitimate.** Small mechanisms ship on tiny,
   fully-adjudicated blast radii (the best late mechanism moved 2 artworks, both
   adjudicated, threshold validated on both sides). Big-swing mechanisms (we integrated
   several at 400–2,000 movers, one at 30% of the corpus) use the **big-swing protocol**:
   full-corpus census → destination adjudication against the warehouse → a *sampled* batch
   of the highest-stakes unknowns. A 30%-mover mechanism cannot serve its movement in
   10-item batches; don't pretend it can.
9. **Composition is not free.** Two separately-approved mechanisms composed produced
   outcomes nobody had adjudicated; another pair destroyed 7 adjudicated wins to buy 2.
   A composition batch is mandatory before a second mechanism lands on the first.
10. **Asymmetric mechanisms need a census, not a batch.** A lever that can *remove* X but
    never add X back is structurally invisible to sampled review: our vividness lever's
    batch sampled the accent-deletion defect exactly once while it silently collapsed the
    accent on 31.5% of everything it touched. The planted negative control caught it.
11. **Integrate verdict-gated, pin immediately.** Every integrated constant gets a pin in a
    configuration test with an honest provenance tag: `[REVIEWED]` (human verdict),
    `[MEASURED]` (corpus sweep), `[n=1]`, `[INHERITED]`, `[UNCALIBRATED]`, `[HELD]`. The
    pin states what was measured, what wasn't, and what breaks at ±20%. This is the single
    best defense against the "rationale written after the fact" failure mode (§8).
12. **Independent verification of everything.** The orchestrator re-extracts both sides of
    every batch label before serving (labels go stale the moment trunk moves), re-runs
    byte-identity itself before merging, and treats every agent claim — and its *own*
    proposals (§8.13) — as unverified until reproduced. Also: **records rot.** Before
    reviving or building on any recorded claim, re-derive it — four separate recorded
    "facts" (a standing defect, two casualties, a regression) turned out stale or wrong
    when checked.
13. **Calibration rounds with repeats.** Periodically grade N never-reviewed artworks
    absolutely (not A/B), and *re-include* some previously graded ones. The repeats measure
    both drift (is trunk quietly getting worse on artworks you liked?) and *reviewer
    noise*: our regrades of identical palettes agreed 88% of the time — every single
    verdict carries that error bar (§12).
14. **Fresh artworks are the idle-time default, and mine outliers deliberately.** The
    reviewer's standing rule: whenever blocked on agents, serve a fresh-artwork round —
    "maybe we discover something, or at least we expand our development set." It never once
    failed to name a new target class. Better still, curate by machine: run trunk over
    unseen artworks and auto-flag statistical outliers (two-color collapse on a colorful
    artwork, near-zero-chroma palettes on vivid art, gradient anomalies). Our one
    accidental trial of this had a 25% defect rate inside its picks and seeded a shipped
    mechanism. Let the reviewer veto artworks they never want to see again.
15. **Try the ideas.** The reviewer's standing instruction — "if we have improvement ideas,
    we should at least try them" — outperformed conservatism every time. Cheap decisive
    nulls are *valuable*. And before funding a mechanism, ask the reviewer's own null
    question: *would a one-constant change capture the win?* (Asked once about gradient
    endpoints, it produced a three-way ablation that killed the cheap hypothesis with a
    number.)
16. **Operational hygiene.** One corpus-scale sweep at a time, few workers, image-library
    concurrency pinned to 1, all long sweeps checkpoint-resumable so they can be killed
    freely, and background sweeps yield the moment any new arm is funded. Never block the
    pipeline on a human-held credential (signing keys, logins) — queue the action and
    continue. Plain language everywhere: briefs, reports, commit messages; the moment
    explanations got clever, the reviewer flagged them, and review signal degrades when the
    reviewer can't follow the reasoning.

## 5. The evidence inventory — what actually predicts roles

Signals that earned their place (each was measured as load-bearing — most of their weights
are *pervasive cliffs*, meaning ±20% moves 20–40 artworks; treat every one as pinned):

- **Population / coverage** — how much of the artwork a family covers; log-scaled
  (`log2(population+1)/8`), and combined with **connectivity** (does it hang together as
  one mass) via `sqrt(population × connected)`.
- **Border clearance vs interior margin** (75/25 blend) — fields own borders; marks float.
- **Spatial spread vs the modal color's spread** ("fieldLike") — separates materials from
  specks; the same test gates gradient-endpoint support.
- **Compactness, repetition, chroma, local contrast, signature-graphic observation** — the
  accent evidence blend (0.29 / 0.24 / 0.25 / 0.14 / 0.08, chroma scaled by 0.18). The
  `localContrast` term alone is live on every artwork.
- **Typography cues vs signature cues** — the same five observation features with different
  weights, one asking "is this the text", the other "is this the emblem". Both live in one
  20-line block that contains 12 of the codebase's 17 strongest cliffs. Handle with care.
- **Polarity** (light-on-dark vs dark-on-light), observed across a family's regions —
  crucial for the white-text class and for near-neutral pairs that oppose each other.
- **Identity directions** — the artwork's distinct hue directions; palettes owe coverage to
  major directions ("one hue, one direction" prevented obligation crowding). Incomplete
  identity coverage was the reviewer's single most frequent complaint class (27 warehouse
  notes) — and at campaign close it still reached the winner only bundled inside another
  term, never as a first-class signal. Build it first-class from the start.
- **Whole-palette relational terms** — the reviewer's "looking at the whole thing" ask.
  The one we shipped, **gamut coverage** (does the palette span the artwork's chromatic
  extent), validated at AUC 0.872 against complaints it was never fitted to, monotone
  across verdict grades, ~8% of the corpus affected — and it delivered a long-standing
  named ask (johns' sailor-blue surface). Its siblings (foreground-ness as separability,
  surface-ness as support-for-background) were never tested; the family is bigger than the
  one member we built.
- **Field concentration and quadrant coverage** — the field score blend (population 0.28,
  borderCoverage 0.22, familyConcentration 0.22, quadrantCoverage 0.13, edgeDensity 0.15).
- **Authority symmetry** — if identity evidence can promote a candidate, the same evidence
  must be able to demote its rivals. One-sided credit created untouchable incumbents.

Signals that were tried and **refuted or corrected**:

- **Contextual accent-ness** ("a neutral is accent-like when the whole palette is
  chromatic") — measured across 250 verdicts: endorsed accents sit *closer* in hue to the
  other roles (27.7°) than complained-about ones (37.2°); ~40% of endorsed palettes share
  the feature without complaint. Correct as a description of individual artworks, wrong as
  a rule. The *real* accent signal in corrections is **artwork-salience match** — about
  half of the accent-changing corrections on re-measurement (19/39; the first pass said
  39%).
- **"Corrections reveal ranking failures, not generation gaps" — a seductive early claim we
  later retracted.** The early audit found 7 of 7 checkable corrected accents already in
  the candidate pool. A later, deeper arm reversed it: the wanted accents mostly **never
  reach an accent slot at all — candidacy, not ranking; 0 of 19 published against a
  standing ask under the four configurations tested** (one artwork did publish its
  prescribed accent, discounted for a superseded correction; alternatives were not swept).
  Both facts are true: colors exist in the pool but structurally cannot
  reach the role. Diagnose *reachability*, not just presence, before concluding "ranking".
- **Vividness — two results, keep them apart.** The *direction* ("prefer the vivid
  candidate here") was endorsed 4:1 in its batch. The *implementation* had a structural
  one-way defect — it collapsed (deleted) the accent on 31.5% of everything it touched and
  never un-collapsed — and the follow-up pricing batch rejected that 7:1. The lever died
  of its asymmetry (§4.10), not of its direction.
- **Areal/scale-dependent constants — refuted twice, but the refutations are contested.**
  Both tests swapped one constant at a time while every downstream weight stayed calibrated
  for the old units; the reviewer correctly called this "a protocol defect rather than a
  real math defect." A legitimate test converts all scale-covariant statistics
  simultaneously and recalibrates jointly. That test was designed and never run. Treat
  scale-dependence as *unresolved*, not settled.

## 6. Gradients — the hardest third of the problem

Everything about gradients required more rounds than roles did (10+ dedicated rounds).
What survived:

- **The boolean** (does a gradient exist) is a semantic question (§2.5). Statistical
  proxies (ratio tests + abstention + "ground ownership") got to 17/18 on the reviewed set
  after many rounds; a "spread rescue" refinement that helped in-sample failed
  out-of-sample. Expect diminishing returns and lean on review. Also audit your review
  *instrument*: for most of the campaign every gradient note asked for *more* gradient —
  because the UI had no way to record a gradient objection (§8.7).
- **Endpoints are systematically too narrow.** The published endpoint is an exact source
  pixel (good — never synthesize), but it is chosen as *the band pixel nearest a fitted
  target*, and our target was read at positions 0.1/0.9 — an uncommented literal whose
  "deliberate overshoot" rationale turned out to be written days after the fact, by the
  commit that named it. The true ramp extends beyond both endpoints. The fix that works:
  walk each endpoint *outward* along the field's own local shading direction (the principal
  axis of the field domain's pixels' *OKLab colors* — a color-covariance axis, not a
  spatial one — computed over the field's own pixels, NOT the whole image; restricting to
  the field's pixels is what makes it sound), stepping while source support holds. Merely re-aiming
  the band read at 0.0/1.0 does ~nothing (−5.8% aggregate): the candidate pool, not the
  aim point, is the binding constraint. Final adjudicated record of our walk: 3 wins, 3
  losses, 6 ties among verdicts that transferred to the honestly-measured path, becoming
  4W/3L/7T after the two changed artworks were re-adjudicated — real but not decisive. One candidate
  refinement — a spatial-progression check (accept a step only when its support sits
  *farther along* the shading direction than the current endpoint) — explains one measured
  loss exactly (support from a black suit mid-frame, backward along the axis) but was
  measured NOT to be the general discriminator: it fires on 1 of 3 losses and is
  contradicted by the strongest one.
- **Guard every extension against the published palette.** An endpoint walk that lands on
  the accent's color "found a real color and destroyed the palette" (reviewer: "we end up
  with black olive as both the surface and the accents"). Guard rule: no step may bring an
  endpoint within the same-color bar of any other published color (midpoint included), or
  below the pair's own original distinctness. Also verify the *snapped* pixel, not just the
  walk target.
- **Midpoints: check the straight line against the artwork.** Sample the OKLab segment
  between endpoints; measure each sample's distance to the nearest populated artwork color.
  If the worst excursion exceeds ~2.5 same-color units, the rendered ramp passes through a
  color "that doesn't feel like part of the artwork" — insert a source-supported midpoint
  that pulls the ramp back on-artwork. This mechanism measured the reviewer's own complaint
  (found the exact grey-mauve they described at t=0.5) and found their requested
  carpaccio-red stop from pixels alone. Blast radius: 2 artworks corpus-wide. It only ever
  *adds* a stop — existing midpoints are themselves large excursions, so a replace-mode
  criterion cannot distinguish them from defects.
- **42% of published midpoints sit outside their endpoints' lightness span.** Do not assume
  midpoint-between-endpoints geometry anywhere.
- **Contrast sampling along the ramp: measure before you build.** *Correction from draft 1,
  which had this backwards.* We feared 5-point sampling missed contrast crossings; the
  measurement found the opposite — over every role/gradient pair on the real corpus, the
  5-point set `0/.25/.5/.75/1` is **accidentally exact** (worst minimum error 0.00,
  crossings missed 0), because those positions coincide with the rendered ramp's corner
  set and the V-shaped |Lc| curve attains extremes at segment boundaries. The real hazard
  is the reverse: two samples straddling APCA's zero-clamp plateau report a **phantom**
  sign flip that is never actually traversed. The genuinely useful (built, validated,
  never-shipped) statistic is the **indistinct fraction**: the *length* of ramp where |Lc|
  sits below the adequacy bar — it reproduced the reviewer's own language quantitatively
  (their approved-with-complaint accent measured 31% indistinct), and since t maps linearly
  across the field, ramp-length equals screen-area exposure for free.
- **The from-scratch gradient design we'd actually recommend** (from the literature review,
  never built): fit a spatial parameter t = a·x + b·y + c (or radial) over the field mask
  at native resolution, then run **Douglas–Peucker on the t-sorted OKLab path** at ε ≈ 1
  JND with an MDL stop penalty (residual + λ·#stops). DP's retained vertices are *input
  points*, so stops are observed pixels by construction; the MDL term prices gradient
  claims symmetrically (a principled neutrality mechanism); and it generalizes to
  multi-stop gradients — which the reviewer asked for repeatedly and our 3-stop-at-0.5
  contract could not express. Acceptance statistic: p95 per-pixel ΔE, not mean ("mean
  hides a bad midpoint"). Note also: our detector *detected* radial geometry on most
  gradient winners (8 of 9 on the first dev panel; 6 of 11 on the larger re-measure) and
  threw it away — the render hard-codes 135° linear. Decide deliberately how much geometry
  your output contract keeps.
- **Know your render.** Ours: 135° oklab linear-gradient; 2-stop = background 35% →
  surface 100%; 3-stop = background 10%, midpoint 55%, surface 100% (tuned by the reviewer
  to make the background visible in the preview UI).
- **Decoupling render stops from role colors is probably right and we never did it.**
  Background/surface have meaning beyond being gradient endpoints (they render flat
  elsewhere). Extending *render stops* while keeping role colors at their representatives
  would resolve the tension that left endpoint extension at an even record. If building
  from scratch: design the output contract so gradient stops and role colors can differ.

## 7. Math and tools — what to use, what to know about each

**Use:**
- **OKLab** for all perceptual math: quantization, distances, interpolation, principal
  axes. It held up everywhere. (Resist the CAM16-UCS/HCT migration: measured expectation
  is gains concentrated in blues at the cost of recalibrating every threshold in the
  codebase. Not worth it.)
- **CIE76 over sRGB** for coarse "same color to a human" bars — 3.3 was our
  reviewer-calibrated same-color bar; it needs no more sophistication. (But keep ONE
  ruler: we shipped a second, unreviewed `0.028` OKLab literal that overrules the reviewed
  3.3 bar in one code path — two same-color rulers disagreeing is a defect class.)
- **APCA for text contrast — but learn its dead band and its blind spot.** APCA cannot
  emit any magnitude strictly between 0 and ~7.3: everything with |raw| < 10 clamps to 0.
  Consequences: (a) every threshold inside (0, 7.3) is the *same rule* as "exactly zero" —
  nothing there is tunable; (b) an accessibility-creep floor is structurally impossible
  below 7.3; (c) the **raw pre-clamp value** is continuous, monotonic, cheap, and useful —
  expose it; no corpus fg/surface pair was at truly identical lightness (min raw 1.19).
  Check contrast for **all four role pairs and against published stop colors** — we found
  8 fg-midpoint and 37 accent-midpoint violations no existing check had ever seen. Two
  deeper caveats: APCA's luminance uses mixed-sign cone coefficients, so contrast along a
  gradient is **non-monotone** in the presence of chroma swings (5.8% of test segments;
  failures in the dangerous direction — algebraic shortcuts over endpoints are unsafe);
  and APCA's beta explicitly does not correct for the Helmholtz–Kohlrausch effect, whose
  bias is proportionally largest at the low-contrast range where this project deliberately
  lives, and is *hue-dependent* — chromatic and neutral accents are not judged on the same
  scale. (Caveat on the caveat: our reviewer calibrated on our own outputs, so some H-K
  bias may already be absorbed into the verdicts.)
- **Pareto frontier + banded comparator** for ranking — works, with one caution: the
  Pareto filter can veto the comparator's #1 choice (first pass measured 5 of 34 dev
  artworks; a re-measurement put it at 1 of 34 — rare but real). Know which of the two is
  authoritative and test the disagreement case explicitly.
- **Power iteration** for principal axes (seeded deterministically — we seeded with the
  chord so ties resolve stably without an eigensolver).
- **Sequential early stopping for parameter sweeps** — a per-direction stopping rule
  reproduced all 335/335 site classifications across six independent orderings while
  skipping ~47% of extractions (a stricter variant saved ~43%; the census-prune alone
  saved 24%). Large sweeps are affordable; build the stopping rule before the sweep.

**Avoid or distrust** (our measurements plus the literature review's skeptical-flags table,
which a from-scratch builder should read in full):
- **k-means/gap-statistic style global clustering** as the primary structure (the v2-2
  approach) — no notion of role, region, or provenance; v2-3's evidence architecture
  replaced it wholesale. More generally, **any mean-emitting quantizer** (Wu, WSMeans,
  MMCQ): bin-centre averaging is the textbook cause of muddy palettes; publish exact
  source pixels.
- **HCT/Material-style tone synthesis** — violates source-connectedness by construction
  (chroma pinned, tones synthesized).
- **Learned saliency weighting** — the highest-magnitude feature in the palette-scoring
  literature *and* the least transferable: face/horizon detectors fail on stylized album
  art, and frequency-tuned saliency degenerates exactly when the salient object is large,
  which is the common album-cover case. Our own salience signal came from the reviewer's
  corrections instead.
- **Hue-harmony templates** — worst non-random method for representativeness in the
  literature we reviewed.
- **SLIC superpixels for texture-vs-structure** — "SLIC happily cuts grain"; it does not
  solve the problem it looks like it solves. Mean-shift/quick-shift add RNG exposure.
- **Diffusion curves** — cite, don't implement.
- **Fitting scoring weights from an acceptability-shaped warehouse.** Decisive null: ~150
  verdicts yielded only 54 usable pairwise constraints against 12 coefficients, and
  fitting made held-out agreement *worse* (66.7% → 51.9%) — because batches were designed
  to answer "is this palette acceptable," so most scoring axes barely vary within a
  compared pair and are unidentifiable at any sample size. If you intend to fit weights,
  design batches that move one axis at a time *from day one*. Bradley-Terry is fine as a
  framework; the data design is what decides.
- **Any constant that depends on absolute scale** (pixel areas, absolute counts) — but see
  §5: our refutations were protocol-flawed; the honest status is "unresolved, convert and
  recalibrate jointly."
- **ASCII/lexicographic tie-breaks on content-derived ids** — our family ids tie-broke by
  ASCII, and a pure *relabeling* (same colors, new id strings) moved **55.85% of the
  corpus**. Diagnosed on day one, measured mid-campaign, and — cautionary tale — still
  unfixed at close, with no relabel-invariance test in the suite. Tie-break on content,
  and test invariance under relabeling from the beginning.
- **Deriving "deliberate design" from code you inherited** — the 0.1/0.9 read positions
  had a confident-sounding rationale that was written by the commit that *named* them,
  days after they appeared as bare literals. Trust `git log`, not comments.

## 8. Canary signals — when to be alarmed

Each of these bit us at least once; all are cheap to check:

1. **An innocent artwork moved.** If a mechanism's mover set includes artworks that never
   had the defect the mechanism targets, the mechanism is at the wrong pipeline stage
   (cascade). The fix is architectural, not a smaller threshold.
2. **A repair relocated a defect.** Our first fg/surface repair moved the zero onto the
   accent in 13 of 15 cases (and 290 of 298 under another config). Any repair must validate
   the *entire* published palette, including stops, after the fix.
3. **A "measured" number with no provenance.** Every constant should answer: who set it,
   from what evidence, and what happens at ±20%? Tier-B found the *anonymous inline
   literals* were five times cliffier than the named constants — the unnamed half of the
   codebase is the more dangerous half. Corollary diagnostic worth running on any mature
   codebase: **compare perturbation stability on reviewed vs unseen artworks.** Ours was
   1.61× more stable on reviewed artwork than unseen (2.50× for the core quality weights)
   — a direct overfitting measurement; and at ~908 tunable sites against 11 human-anchored
   values, the codebase carried ~8.5 free parameters per human judgment. The fragility
   ranking and the pinned-constant set were *nearly disjoint* — you pin what you argued
   about, not what actually decides.
4. **A perfect discriminator found late.** Enumerating two-clause rules over 8 adjudicated
   artworks produced **162 perfect separators** — with few data points and free
   thresholds, perfect separation is the *expected* outcome and means nothing. If a rule
   wasn't hypothesized before looking, demand out-of-sample confirmation.
5. **A silent fallback under the same name.** "field-ramp" quietly fell back to a
   whole-image corridor for domain kinds it couldn't rebuild — 10% of gradient artworks ran
   a *different algorithm under the same label*, inflating a win record. Fallbacks must be
   loud (refuse or rename), and reconstructions must self-check against the builder's own
   counts (that self-check found a second, shipped, 14%-of-the-image reconstruction bug).
   Same family: an unconditional **white alpha-flatten** decided the field color of every
   transparent artwork for the entire campaign — documented in one prose line, but never
   reviewed and never conditional.
6. **Sweep artifacts.** Three classes, all silent: perturbing one side of *duplicated*
   code (8 of 33 top "cliffs" were this); perturbing *non-tunable math* (a variance
   exponent, a clamp floor, an accumulator initializer — the same expression swept as
   three "sites" returned three different flip counts); and perturbing typed parameters
   off their type (integers → 1,196 silently failed cells reported as "zero errors").
   Map duplicates and types before sweeping; audit top findings after.
7. **Your instrument determines the sign of your evidence.** All 14 gradient notes in the
   warehouse asked for *more* gradient — because the review UI had no way to record a
   gradient objection. Three arms were misdirected by that gap. If a whole class of
   verdicts points one way, check whether the UI can express the other way.
8. **Labels vs a moving trunk — and verdicts vs a moving campaign.** Review materials
   extracted yesterday are stale the moment trunk integrates anything; re-extract and
   re-verify at serve time. The same applies to *verdicts used as guardrails*: a case
   frozen as a guardrail must be re-checked against the latest verdict (a long-protected
   guardrail turned out to have been reversed by a later batch), and agents will
   self-document rule-driven kills ("killing on the rule, not on judgment") — mine those
   notes routinely.
9. **A founding measurement from stale tooling.** A four-arm architectural thread was
   funded by a "loses on ranking" reading that came from a stale label cache with no code
   fingerprint — the motivating pink accent *did not exist in the candidate pool*.
   Fingerprint every cache with the code that produced it, and re-derive any
   architecture-motivating measurement on a clean tree (and verify against the
   *configuration*, not the branch —
   a branch shipping its lever OFF is byte-identical to trunk, and "verifying" it tests
   nothing).
10. **Identifier ambiguity between image variants.** Every cover exists at multiple
    resolutions with near-identical ids; token-prefix matching silently picked thumbnails —
    9 of 30 panel items were the wrong file, one "byte-identical" artwork was actually a
    four-role mover. Key on full paths + content hashes, never prefixes.
11. **Nondeterminism and encoding sensitivity.** Build a repeated-extraction canary early;
    treat any same-buffer flake as stop-the-line (ours: one in ~200, once, unresolved).
    Separately budget for §1's encoding sensitivity — it is orders of magnitude larger
    than the flake and shapes what "byte-identical" gates can and cannot promise.
12. **The reviewer grading around a defect.** "I have to give the win to A because B has
    [unrelated defect]" — that comparison is *confounded*; record the confound and re-run
    after the defect is fixed (one of our 8:2 results was plausibly 9:1 for this reason).
13. **Your own elegant shortcut.** The orchestrator's algebraic contrast-minimum
    derivation was measured wrong in the dangerous direction (non-monotone APCA, §7).
    Measure your own proposals with the rigor you apply to everyone else's. Also enlarge
    the artwork before calling something a regression — one "regression" dissolved at
    higher zoom (the disputed gold *was* a second display text; the cursive it displaced
    merges into blobs per-letter filters can't parse).
14. **The metric improves while specific artworks get worse.** Track named artworks the
    reviewer loved; aggregate acceptability can rise while favorites quietly churn to
    unendorsed palettes (drift is tail-shaped). The repeats design (§4.13) is the detector.
15. **Uncommitted policy is invisible policy.** Agents in isolated worktrees see committed
    state only: an uncommitted charter edit meant every new arm inherited the *old*
    guardrail rule; branch-only experiment records made provenance undiscoverable. Commit
    policy documents the moment they change. (And after any cross-branch `git apply
    --3way`, grep for the change's own marker — it fails partially and silently; a
    zero-diff after-side is a failed apply until proven otherwise.)
16. **Profilers lie after optimization.** Our CPU sampler misattributed hotspots by 4×;
    an assigned "36.6% leader" was 0.0% self-time after the previous pass. Re-profile from
    scratch after every perf pass, and prefer end-to-end wall-clock deltas as the truth.

## 9. Signs you are going the right direction

- **Corrections shrink into refinements.** Early corrections replace whole palettes; late
  corrections say "even better if the accent were X" or endorse an alternative while
  accepting yours. Watch the correction *size* distribution.
- **The reviewer is surprised on hard artworks.** "I was genuinely impressed by [four
  artworks], those are truly hard, and the palettes seem very faithful to the vibe" —
  unprompted praise on known-hard cases is worth more than ten acceptable grades.
- **Mechanisms ship on evidence proportionate to their size.** Small mechanisms with tiny,
  fully-adjudicated blast radii; big swings through the census → adjudication → sampled
  batch protocol (§4.8). Either way, integration follows verdicts, never vibes.
- **Nulls close classes decisively.** A sign-inverted null, a 40-quantity ordering null, a
  falsified hypothesis with a measured effect direction — these end debates permanently
  and are progress, not failure.
- **Repeats hold.** Re-graded artworks keep their grades across weeks of trunk movement.
- **New complaint classes slow down — but don't expect them to stop.** Late in the
  campaign most new complaints mapped to known signals; yet the final day still surfaced
  two genuinely new structural classes (a role-reachability gap and a quantization-origin
  defect). Treat "the ontology is closed" as a hypothesis you keep trying to refute, not a
  milestone you declare.

## 10. Edge cases that make or break the result

Test set to build on day one (our recurring deciders):

- **All-one-hue artworks** (the all-red cover): the "accent" may correctly be a neutral;
  identity coverage must not force a second hue that isn't there.
- **Black-on-black / near-identical fg-bg**: without a pathology floor the ranking will
  publish unreadable text (raw APCA 1.4) — and the *repair* is usually a decisive
  dark↔light flip of the text color only.
- **The white-text class**: dark artwork, white display text — polarity evidence, not
  population, decides the foreground.
- **Giant colored display text** (title = the artwork): typography evidence must beat the
  white-text prior *and* the statistical accent-shape prior (§2.9 — and audit the detector
  for a large-type penalty).
- **Pointillist / textured lettering**: text made of many small blobs defeats naive
  compactness; needs region observations that aggregate. Same family: cursive text merges
  into word-blobs that per-letter analysis cannot parse.
- **Texture vs structure** (the scrambled-cover test): scrambling an artwork should change
  gradient/field decisions; if it doesn't, the field machinery is reading global statistics
  instead of structure. Keep scrambled twins in the corpus, excluded from quality metrics.
- **Sky-and-grass**: two adjacent large areas that are NOT one shaded surface — must stay
  flat; the founding gradient-semantics case.
- **One-surface shading** (product shots, vignettes): must become a gradient even when the
  two ends quantize to different families.
- **The black-bar / frame class** (bars, frames, enclosures overlaying a rich image): the
  frame wins population contests and steals the background role from the artwork's actual
  field. We never fully solved this — it blocked the campaign's single most-requested
  palette (three identical asks) — and a from-scratch design should treat "large uniform
  bar/frame" as its own provenance class early.
- **Role reachability**: check that every evidence lane can reach every role it should. We
  discovered at close that a chromatic supporting color could reach accent or foreground
  but could structurally *never* become a surface at any rank — 14 warehouse complaints
  traced to one constructor building only (background, surface) pairs from one lane.
- **Overlaid badges/labels**: excluded from identity by provenance (§2.8).
- **Duplicate covers at multiple resolutions**: same artwork, different encodings, subtly
  different pixels — the central robustness class (§1) and a review-tooling hazard (§8.10).
- **Transparent artworks**: whatever you flatten onto IS the field color for these; make it
  a deliberate, documented, reviewed choice (§8.5).
- **Emergency/degenerate artworks**: single-color covers, two-color covers, covers where
  quantization yields one family — every stage needs a defined degenerate path (our
  zero-variant crash appeared only on artwork #~7,000 of the corpus; sweep the full corpus
  for crashes early, it costs an hour).

## 11. Performance, sweeps, and hygiene

- **Look for recomputation before micro-optimizing.** The single biggest finding across
  four byte-identity-proven speedup passes (1.90× → 1.61× → 1.55× → 1.20×; the ≈5.7×
  product compounds different corpora and metrics, one a warm-cache upper bound — treat it
  as an order of magnitude, not a measurement; end state ~0.7 s median / 1.29 s mean per
  artwork): **~45% of every extraction
  was recomputation** — a diagnostic call re-fitting gradients on an already-fitted
  object, and 88% of one module's attempts refusable by an already-computed free gate.
- **Performance work only with byte-identical proof** from committed states, and honest
  measurement — "don't keep performance attempts that don't actually measure any real
  improvement." The method that worked: **process CPU time (user+system), never wall
  clock, with A/B runs interleaved at process granularity** so machine-load drift charges
  both sides equally. Re-profile after every pass (§8.16).
- **Perf passes create hazards elsewhere**: one pass duplicated a color-conversion function
  and the parameter sweep later flagged the copy's matrix coefficients as "tunable
  constants". Keep derived-math exclusions keyed to something better than function names.
- **Parameter sweeps are worth it and affordable.** Two tiers over ~1,100 sites classified
  every constant as inert / load-bearing / cliff / safely-placed. Highest-value outputs:
  the cliff list (pin them), the inert list (delete them — and actually delete them; our
  biggest measured-decorative weight layer was still shipping at close), and the
  dead-module list (75 sites that moved nothing). Anonymous literals first — they are
  cliffier than named constants (50% load-bearing vs 17%).
- **Instrument reconstruction code with self-checks** (§8.5) and **make byte-identity a
  reusable gate harness** — ours (108 artworks: panel + scrambled + off-panel shards) ran
  dozens of times.
- **Machine operations**: see §4.16 — one sweep at a time, checkpoint-resumable, yield to
  funded arms.

## 12. What "done" looked like, and the debts we chose consciously

The campaign ends with: ~97% acceptable-or-better on n=60 unbiased calibration — a number
that must be published with its measured noise band: only ~35% of calibration items were
*clean* strongs (no note, no correction) and the strong rate ~62% (both mid-campaign
snapshots), the reviewer's regrades
of identical palettes agree 88% of the time (so any single verdict carries a ~12% error
bar), and every figure is scoped to the renditions reviewed (§1). Repeats held; drift was
tail-only. Eight-plus mechanisms integrated verdict-gated, five mechanism classes closed by
decisive nulls, every integrated constant pinned with provenance, and a dormant
winner-stage repair layer awaiting one coverage decision.

Known conscious debts at close, so that closing them is a choice and not amnesia: the
black-bar background class and the thrice-requested rich gradient it blocks; a three-times
corrected role pair on one named artwork and a twice-asked giant-yellow-text foreground;
four knowingly-accepted accent regressions from a big-swing integration; two drift
casualties found by the repeats design and never repaired; the ASCII tie-break (§7),
diagnosed day one, measured at 55.85%, never fixed, no invariance test; the candidacy walls
(§5) that keep the reviewer's corrected accents structurally unpublishable; the contested
scale-dependence question (§5); identity coverage still not first-class (§5); the inert
weight layer not yet deleted (§11); and stop-vs-role decoupling (§6) as the likely next
structural win. The full named-artwork ledger lives in the campaign records.

If you are building from scratch and want the short version of everything above: fix the
output contract (with render stops decoupled from roles); build the review harness and
corpus first; know your stability envelope and scope every claim to a rendition; keep
generation generous and neutral; put every policy at the winner stage; make every constant
carry provenance from birth — or better, derive it; verify everything twice, including
your own tooling and your own ideas; and let one human's blinded verdicts — recorded
forever, understood as censored and relative — be the only judge that counts.
