# Building a UI palette extractor for album artworks, from scratch — the field guide

This document distills everything the v2-2 → v2-3 research campaign learned, written for
someone building this algorithm again from nothing. The goal is that a re-implementation
following this guide would skip our detours, avoid our mistakes, and arrive at a better and
more robust result faster. Everything in here is backed by either a human verdict, a
measurement over the full corpus (~7,600 artworks), or a decisive null result — and where a
claim is one of ours rather than a measurement, it says so.

The campaign took the algorithm from 70.6% acceptable-or-better to a measured ~97%
(n=60 unbiased calibration, drift confirmed tail-only by a repeats design) over roughly two
days of intensive iteration, ~60 review batches, ~500 warehouse verdicts, and about forty
experimental arms. This is what we'd tell ourselves at the start.

---

## 1. What you are actually building

- **The output shape is small and fixed, and that is a feature.** Four colors — background,
  surface, foreground, accent — plus a gradient boolean and, when a gradient fires, an
  optional third "midpoint" stop. Every improvement fits inside this contract. Resist adding
  fields; we never needed to.
- **Role semantics matter more than color quality.** The foreground is *text*. The accent is
  *icons and UI elements*, explicitly not text — its readability stakes are lower, and the
  human confirmed "slight distinguishability loss there is not a huge deal." The background
  and surface are *fields* — large areas, sometimes rendered as one gradient. Getting a
  beautiful color into the wrong role is a failure; a duller color in the right role often
  wins.
- **Ground truth is one human's judgment, and that is the correct spec.** "We're making an
  algorithm for me." Do not substitute WCAG, design-system conventions, or aesthetic priors
  for the reviewer. Every rule in this guide that looks arbitrary is a human verdict.
- **Two-color palettes are legitimate.** The surface may collapse onto the background and
  the accent onto the foreground. Collapse is a deliberate published form, not a failure —
  but *pricing* collapse correctly (when is two colors better than four?) is a real,
  reviewable decision.

## 2. Non-negotiable design constraints (learned the hard way, then confirmed repeatedly)

1. **Work at full resolution.** Downsampling caused "incomplete artwork identity" losses —
   small-but-load-bearing colors (thin text, small logos) vanish. Accuracy beats speed as
   long as runtime isn't the iteration bottleneck (we ended at ~0.7 s/artwork after two
   byte-identical performance passes; that is fast enough for everything).
2. **Every published color must be source-supported with real representativity.** Never snap
   to a lone pixel: one pixel can be noise, JPEG ringing, or an aberration. Demand a
   population floor (we used ≥0.1% of the artwork within one quantization cell) and a
   spatial-spread test (the color's pixels must be spread like a *material*, not one speck).
3. **Contrast is deliberately low, but exact-zero is a pathology.** This is not an
   accessibility project; palettes at APCA Lc ≈ 9 were repeatedly graded good. Keep any hard
   minimum as a user parameter defaulting to ~0. But a foreground/surface pair at *exactly*
   zero contrast (unreadable text over a large area) is invalid regardless of hue. Know the
   APCA dead band (§7) before you write any threshold.
4. **Gradient neutrality.** A wrongly allowed gradient is exactly as bad as a wrongly
   prevented one. The goal is to represent what the artwork *is*. Enforce neutrality **by
   construction** — run gradient-color mechanisms *after* the gradient boolean is decided —
   not by measuring and hoping. Every mechanism we built this way was provably neutral;
   the one we built inside candidate generation broke neutrality immediately.
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
   white/near-white foregrounds; fight it with typography evidence.
10. **An artwork can have multiple valid palettes.** Moving off a reviewed-strong palette is
    NOT automatically a regression — it is one only if the *destination* was reviewed
    negatively or compared inferior. This single rule ("never move TO known-worse", not
    "never move") is what let the campaign keep improving instead of freezing. Our early
    conservative auto-kill rule ("any strong palette moved → arm dead") was audited later:
    it had discarded arms of which **21% were revivable wins** — "the expensive quarter."

## 3. The architecture that emerged — and the one thing we would change

The pipeline that works: **evidence → color families → field hypotheses → role obligations →
candidate slate → ranking → winner → post-winner passes**.

- **Families**: quantize in OKLab (bin step 0.04 — a measured pervasive cliff; pin it),
  build per-family evidence (population, spatial statistics, region observations).
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
valid direction (a dominant family, then chromatic candidates, twice). Worse, any rule
enforced during candidate generation cascades: when we filtered zero-contrast candidates
early, **149 artworks moved to fix 14** — 10:1 collateral on artworks that had no defect,
because the capacity-bounded slate re-shuffled admissions. The same rule enforced at the
**final-winner stage** moved *exactly* the 14 defective artworks and zero others, verified
over the full corpus.

**The pattern to adopt from day one:** generation and ranking stay *generous and neutral*;
every opinionated policy (contrast floors, pathology repairs, user parameters) runs as a
**last-minute repair on the published winner**, re-picking from the already-ranked slate
when needed. Zero cascade by construction. If we rebuilt from scratch, user-facing
parameters would *never* touch pre-selection.

Also: keep pre-selection bounds generous (they exist only for compute); if you must bound,
measure how often the bound binds and what it cuts, *before* trusting it.

## 4. The process that actually produced progress

This mattered as much as any algorithm. In rough order of importance:

1. **Build the evaluation harness first.** A verdict warehouse (append-only JSONL), a
   blinded A/B review UI, and a batch builder were the force multipliers for everything
   else. Every reviewed palette, note, and correction is a permanent, queryable asset —
   we adjudicated later mechanisms against verdicts recorded days earlier, constantly.
2. **Small blinded batches, always.** 4–10 items per batch, A/B sides shuffled per item by
   content hash, the unblinding key never served. The reviewer grades faster and more
   honestly than in big batches; 16+ item sessions caused fatigue and noise. Serve two
   batches on two ports in parallel when the queue builds up.
3. **Corrections are gold.** The review UI lets the reviewer submit "the palette I'd
   endorse" — these endorsed samples became integration targets, adjudication references,
   and the seed of multiple mechanisms. 7 of 7 checkable corrected accents were *already in
   the candidate pool* — corrections mostly reveal ranking failures, not generation gaps.
4. **Record everything, including conversation.** Design principles stated in passing
   ("a gradient is shadows on one surface") go into the warehouse as note-only records with
   tags. Half our best rules started as offhand reviewer remarks.
5. **Isolated experimental arms with strict briefs.** Every mechanism is built by an agent
   in an isolated worktree, behind a flag constant defaulting OFF, with byte-identical
   output when off (verified from committed states, never dirty trees). The arm reports:
   the mechanism, the corpus blast radius, every mover's before/after, and movers checked
   against the warehouse. Only then does anything reach human review.
6. **Destination adjudication before serving.** For every mover, classify the destination:
   matches an endorsement → win; matches a reviewed-bad palette → regression; unknown →
   reviewable. Only destination-known-worse counts against a mechanism automatically.
7. **Integrate verdict-gated, pin immediately.** A mechanism integrates only after its
   movers are adjudicated. Every integrated constant gets a pin in a configuration test
   with an honest provenance tag: `[REVIEWED]` (human verdict), `[MEASURED]` (corpus
   sweep), `[n=1]`, `[INHERITED]`, `[UNCALIBRATED]`, `[HELD]`. The pin comment states what
   was measured, what wasn't, and what would break at ±20%. This is the single best defense
   against the "rationale written after the fact" failure mode (§8).
8. **Independent verification of everything.** The orchestrator re-extracts both sides of
   every batch label before serving (labels go stale the moment trunk moves), re-runs
   byte-identity checks itself before merging, and treats every agent claim as unverified
   until reproduced. Every stale-label incident we caught, we caught this way.
9. **Calibration rounds with repeats.** Periodically grade N never-reviewed artworks
   absolutely (not A/B), and *re-include* some previously graded ones. The repeats measure
   drift: is the trunk quietly getting worse on artworks you once liked? (Answer in our
   campaign: two real tail casualties, net quality holding — worth knowing, cheap to ask.)
10. **Fresh artworks against reviewer fatigue.** Aesthetic fatigue on repeatedly-reviewed
    artworks is real ("a lot of these are artworks I personally dislike"). Rotate in fresh
    never-reviewed artworks; let the reviewer veto artworks they never want to see again.
11. **Try the ideas.** The reviewer's standing instruction — "if we have improvement ideas,
    we should at least try them" — outperformed conservatism every time it was applied.
    Cheap decisive nulls are *valuable*; the graveyard audit showed the cost of not trying.
12. **Plain language everywhere.** Briefs, reports, code comments. The moment explanations
    got clever, the human flagged them ("pseudo-intellectual speech that is hard to
    understand"). If the reviewer can't follow the reasoning, the review signal degrades.

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
  major directions ("one hue, one direction" prevented obligation crowding). A palette that
  misses the artwork's dominant identity direction reads as "incomplete artwork identity".
- **Field concentration and quadrant coverage** — the field score blend (population 0.28,
  borderCoverage 0.22, familyConcentration 0.22, quadrantCoverage 0.13, edgeDensity 0.15).
- **Authority symmetry** — if identity evidence can promote a candidate, the same evidence
  must be able to demote its rivals (`carriesIdentityDirection` both ways). One-sided
  credit created untouchable incumbents.

Signals that were tried and **refuted**:

- **Contextual accent-ness** ("a neutral is accent-like when the whole palette is
  chromatic") — measured across 250 verdicts: endorsed accents sit *closer* in hue to the
  other roles (27.7°) than complained-about ones (37.2°); ~40% of endorsed palettes share
  the feature without complaint. Correct as a description of individual artworks, wrong as
  a rule. The *real* accent signal in corrections is **artwork-salience match** (39% of
  accent corrections) — a ranking question.
- **Vividness boosts** — a global "prefer vivid" lever deleted accents on 31.5% of the
  corpus and was rejected 7:1 in review.
- **Areal/scale-dependent constants** — every constant tied to absolute pixel areas broke
  under resolution changes; the divergence is encoding-level (JPEG of the small cover ≠
  downscaled large cover), so "just rescale the constant" does not work either.

## 6. Gradients — the hardest third of the problem

Everything about gradients required more rounds than roles did (10+ dedicated rounds).
What survived:

- **The boolean** (does a gradient exist) is a semantic question (§2.5). Statistical
  proxies (ratio tests + abstention + "ground ownership") got to 17/18 on the reviewed set
  after many rounds; a "spread rescue" refinement that helped in-sample failed
  out-of-sample. Expect diminishing returns and lean on review.
- **Endpoints are systematically too narrow.** Band-representative endpoints are the
  average of each end's band, *and* our line was read at positions 0.1/0.9 (an uncommented
  literal whose "deliberate overshoot" rationale turned out to be written after the fact).
  The true ramp extends beyond both endpoints. The fix that works: walk each endpoint
  *outward* along the field's own local shading direction (principal axis of the field
  domain's pixels — NOT the whole image; restricting to the field's own pixels is what
  makes it sound), stepping while source support holds. Merely re-aiming the band read at
  0.0/1.0 does ~nothing (−5.8% aggregate): the candidate pool, not the aim point, is the
  binding constraint.
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
  that pulls the ramp back on-artwork (choose by: excursion reduction, population,
  distinctness from both endpoints). This mechanism measured the reviewer's own complaint
  (found the exact grey-mauve they described at t=0.5) and found their requested
  carpaccio-red stop from pixels alone. Blast radius: 2 artworks corpus-wide. It only ever
  *adds* a stop — existing midpoints are themselves large excursions, so a replace-mode
  criterion cannot distinguish them from defects.
- **42% of published midpoints sit outside their endpoints' lightness span.** Do not assume
  midpoint-between-endpoints geometry anywhere.
- **Know your render.** Ours: 135° oklab linear-gradient; 2-stop = background 35% →
  surface 100%; 3-stop = background 10%, midpoint 55%, surface 100% (tuned by the reviewer
  to make the background visible in the preview UI). Contrast sampled along the continuum,
  not at 5 points — 5-point sampling missed real crossings.
- **Decoupling render stops from role colors is probably right and we never did it.**
  Background/surface have meaning beyond being gradient endpoints (they render flat
  elsewhere). Extending *render stops* while keeping role colors at their representatives
  would resolve the tension that made endpoint extension end at an even record. If building
  from scratch: design the output contract so gradient stops and role colors can differ.

## 7. Math and tools — what to use, what to know about each

**Use:**
- **OKLab** for all perceptual math: quantization, distances, interpolation, principal
  axes. It held up everywhere.
- **CIE76 over sRGB** for coarse "same color to a human" bars — 3.3 was our
  reviewer-calibrated same-color bar; it needs no more sophistication.
- **APCA for text contrast — but learn its dead band.** APCA cannot emit any magnitude
  strictly between 0 and ~7.3: everything with |raw| < 10 clamps to 0. Consequences:
  (a) every threshold inside (0, 7.3) is the *same rule* as "exactly zero" — nothing there
  is tunable; (b) an accessibility-creep floor is structurally impossible below 7.3;
  (c) the **raw pre-clamp value** is continuous, monotonic, cheap, and useful — expose it;
  no corpus fg/surface pair was at truly identical lightness (min raw 1.19), and raw values
  rank repair candidates well. Also: check contrast for **all four role pairs** and
  **against published stop colors**, not just fg/surface — we found 8 fg-midpoint and 37
  accent-midpoint violations that no existing check had ever seen.
- **Pareto frontier + banded comparator** for ranking — works, with one caution: the
  Pareto filter can veto the comparator's #1 choice (measured on real artworks). Know which
  of the two is authoritative and test the disagreement case explicitly.
- **Power iteration** for principal axes (seeded deterministically — we seeded with the
  chord so ties resolve stably without an eigensolver).
- **Sequential early stopping for parameter sweeps** — a per-direction stopping rule saved
  47% of extractions with zero classification changes (validated 335/335), and 42% on a
  second tier. Large sweeps are affordable; build the rule before the sweep.
- **Bradley-Terry / recall-vs-ranking splits** for making review data go further (from the
  literature review; we used the recall/ranking split concept more than the model itself).

**Avoid or distrust:**
- **k-means/gap-statistic style global clustering** as the primary structure (the v2-2
  approach) — it has no notion of role, region, or provenance; v2-3's evidence
  architecture replaced it wholesale.
- **Any constant that depends on absolute scale** (pixel areas, absolute counts) — see
  §5 refuted list.
- **ASCII/lexicographic tie-breaks on content-derived ids** — our family ids tie-broke by
  ASCII, and a pure *relabeling* (same colors, new id strings) moved **55.85% of the
  corpus**. If ordering falls through to an id comparison, your algorithm is secretly
  keyed to id spelling. Tie-break on content, and test invariance under relabeling.
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
   codebase is the more dangerous half.
4. **A perfect discriminator found late.** Enumerating two-clause rules over 8 adjudicated
   artworks produced **162 perfect separators** — i.e., with few data points and free
   thresholds, perfect separation is the *expected* outcome and means nothing. If a rule
   wasn't hypothesized before looking, demand out-of-sample confirmation.
5. **A silent fallback under the same name.** "field-ramp" quietly fell back to a
   whole-image corridor for domain kinds it couldn't rebuild — 10% of gradient artworks ran
   a *different algorithm under the same label*, inflating the win record. Fallbacks must
   be loud (refuse or rename), and reconstructions must self-check against the builder's
   own counts (that self-check found a second, shipped, 14%-of-the-image reconstruction
   bug).
6. **Asymmetric perturbation of duplicated code.** Sweeping one side of a duplicated
   comparator (or one copy of a duplicated formula) produces garbage fragility numbers.
   Before sweeping, map duplicates; after sweeping, audit top findings for this artifact
   class (8 of our 33 top cliffs were this).
7. **Labels vs a moving trunk.** Review materials extracted yesterday are stale the moment
   trunk integrates anything. Re-extract and re-verify both sides of every batch against
   the exact commit being reviewed, at serve time.
8. **Identifier ambiguity between image variants.** Every cover exists at multiple
   resolutions with near-identical ids; token-prefix matching silently picked thumbnails —
   9 of 30 panel items were the wrong file, one "byte-identical" artwork was actually a
   four-role mover. Key on full paths + content hashes, never prefixes.
9. **Nondeterminism.** One extraction in ~200 disagreed with itself, once, unreproduced.
   Every byte-identity gate assumes determinism; build a repeated-extraction canary early
   and treat any flake as a stop-the-line bug (also: `Date`/randomness bans in harness
   code, deterministic seeds in iterative numeric code).
10. **The reviewer grading around a defect.** "I have to give the win to A because B has
    [unrelated defect]" — that comparison is *confounded*; record the confound and re-run
    it after the defect is fixed (our 8:2 result was plausibly 9:1 because of exactly
    this).
11. **The metric improves while specific artworks get worse.** Track named artworks the
    reviewer loved; aggregate acceptability can rise while two favorites quietly churn to
    unendorsed palettes (drift is tail-shaped). The repeats design (§4.9) is the detector.

## 9. Signs you are going the right direction

- **Corrections shrink into refinements.** Early corrections replace whole palettes; late
  corrections say "even better if the accent were X" or endorse an alternative while
  accepting yours. Watch the correction *size* distribution.
- **The reviewer is surprised on hard artworks.** "I was genuinely impressed by [four
  artworks], those are truly hard, and the palettes seem very faithful to the vibe" —
  unprompted praise on known-hard cases is worth more than ten acceptable grades.
- **Mechanisms ship with tiny, fully-adjudicated blast radii.** The best late-campaign
  mechanism moved 2 artworks corpus-wide, both adjudicated favorably, with a threshold
  validated on both sides (its negative anchor was *designed to refute it* and survived).
  That is the shape of a mature improvement.
- **Nulls close classes decisively.** A sign-inverted null (the mechanism helps the cases
  it was supposed to hurt and vice versa), a 40-quantity ordering null, a falsified
  hypothesis with a measured effect direction — these end debates permanently and are
  progress, not failure.
- **Repeats hold.** Re-graded artworks keep their grades across weeks of trunk movement.
- **New evidence types stop appearing.** Late in the campaign, every new complaint mapped
  to an already-known signal or an already-parked mechanism — the ontology had closed.

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
  white-text prior *and* the statistical accent-shape prior.
- **Pointillist / textured lettering**: text made of many small blobs defeats naive
  compactness; needs region observations that aggregate.
- **Texture vs structure** (the scrambled-cover test): scrambling an artwork should change
  gradient/field decisions; if it doesn't, the field machinery is reading global statistics
  instead of structure. Keep scrambled twins in the corpus, excluded from quality metrics.
- **Sky-and-grass**: two adjacent large areas that are NOT one shaded surface — must stay
  flat; the founding gradient-semantics case.
- **One-surface shading** (product shots, vignettes): must become a gradient even when the
  two ends quantize to different families.
- **The black-bar artwork** (bars/frames overlaying a rich image): the frame wins
  population contests and steals the background role from the artwork's actual field. We
  never fully solved this (it blocks a thrice-requested gradient); a from-scratch design
  should treat "large uniform bar/frame" as its own provenance class early.
- **Overlaid badges/labels**: excluded from identity by provenance (§2.8).
- **Duplicate covers at multiple resolutions**: same artwork, different encodings, subtly
  different pixels — a robustness class (and a review-tooling hazard, §8.8).
- **Emergency/degenerate artworks**: single-color covers, two-color covers, covers where
  quantization yields one family — every stage needs a defined degenerate path (our
  zero-variant crash appeared only on artwork #~7,000 of the corpus; sweep the full corpus
  for crashes early, it costs an hour).

## 11. Performance, sweeps, and hygiene

- **Performance work only with byte-identical proof.** Both perf passes (1.86× total)
  shipped with full-corpus stash-compare byte-identity from committed states. Also:
  measure the speedup *honestly* (wall clock, controlled load) — "don't keep performance
  attempts that don't actually measure any real improvement."
- **Perf passes create hazards elsewhere**: one pass duplicated a color-conversion function
  and the parameter sweep later flagged the copy's matrix coefficients as "tunable
  constants". Keep derived-math exclusions keyed to something better than function names.
- **Parameter sweeps are worth it and affordable.** Two tiers over ~1,100 sites classified
  every constant as inert / load-bearing / cliff / safely-placed. Highest-value outputs:
  the cliff list (pin them), the inert list (delete them — we deleted a whole wave of
  decorative weights), and the dead-module list (two modules whose 75 sites moved nothing).
  Anonymous literals first — they are cliffier than named constants (50% load-bearing vs
  17%).
- **Instrument reconstruction code with self-checks** (§8.5) and **make byte-identity a
  reusable gate harness** — ours (108 artworks: panel + scrambled + off-panel shards)
  ran dozens of times.

## 12. What "done" looked like, and the debts we chose consciously

The campaign ends with: ~97% acceptable-or-better (n=60, repeats holding), eight-plus
mechanisms integrated verdict-gated, five mechanism classes closed by decisive nulls,
every integrated constant pinned with provenance, and a dormant repair layer awaiting one
coverage decision. Known conscious debts at close: the black-bar background class (§10),
role-correction follow-ups on a handful of named artworks, the slate-architecture
generosity question (§3) designed but unlaunched, and stop-vs-role decoupling (§6) as the
likely next structural win.

If you are building from scratch and want the short version of everything above: fix the
output contract; build the review harness and corpus first; keep generation generous and
neutral; put every policy at the winner stage; make every constant carry provenance from
birth; verify everything twice, including your own tooling; and let one human's blinded
verdicts — recorded forever — be the only judge that counts.
