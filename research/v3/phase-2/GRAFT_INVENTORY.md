# Phase 2 graft inventory — pieces for the next attempt

**Written 2026-08-18 by the Phase 2 orchestrator at the reviewer's request.** The premise, per
the reviewer: none of the six prototypes is the base for what comes next; the value is the
pieces. This inventory lists what provided *genuine, evidenced leverage* — judge-validated where
possible, measured otherwise — plus the negative results that should constrain the next design.
Per-arm detail and provenance live in each prototype's `STATE.md`; falsification salvage in
P1/P4/P6's ANALYSIS / RULING / REOPENING files.

## Conventions — read before quoting any number below

**Erratum 2026-08-29.** Two adversarial Phase 3 reviews found that robustness percentages in this
campaign are quoted in BOTH directions by different arms, and that the mixture propagated into
every downstream document. Direction, fixed here, each against the arm's own `STATE.md`:

- **P3's 16.0% / 18.2% are DISagreement** — i.e. ~84% / ~81.8% agreement. Source:
  `p3-fields/STATE.md:26-27` ("full-600 overall 18.2% (0.1.0) → 16.8% (0.3.0) → 16.0% (0.4.1)"),
  cross-checked by `p5-fieldfit/STATE.md:100` quoting "vs P3's 81.8%".
- **P3's accent "68–70%" is AGREEMENT** — the least-stable *role*, not a 68% failure rate.
  Source: `p3-fields/STATE.md:34`.
- **P5's 39.0% / 40.8% are AGREEMENT** (v0.9.2 overall; v0.9-cycle overall) — i.e. ~61% / ~59%
  disagreement. Sources: `p5-fieldfit/STATE.md:22`, `:31`, `:99`. Corroborating arithmetic: accent
  instability alone is 46.2% (`p5-fieldfit/STATE.md:102`) and a four-role palette cannot agree more
  often than its worst role, so 39.0% cannot be a disagreement figure. `PROTOTYPE_RANKING.md` §3's
  "39.0% overall disagreement" is wrong in direction and is corrected at that site.
- **P2's 9.0% overall is AGREEMENT; P2's dither 15.0% is a MOVE RATE**, not an agreement figure
  ("15.0% moved vs the 10% line"). Source: `p2-tree/STATE.md:39-40`, with the arm's own direction
  caveat at `:45` ("topline = agreement; cross-arm comparisons must direction-check").

Cross-arm robustness numbers are therefore **not comparable until direction-checked**, and any
falsifier phrased against a fleet percentage is unusable until it states its direction.

**Warehouse corpus arithmetic — Erratum 2026-08-29.** The **206** `phase2-*` `verdict` rows in
`research/v3/data/warehouse/warehouse.jsonl` are autosave snapshots, not 206 judgements. They
deduplicate to **61 distinct verdicts** (39 carrying a comment, 22 not), covering **82 palettes**
(40 absolute × 1 side + 21 pairwise × 2 sides), alongside **2 endorsed-samples** and **1 veto** —
209 `phase2-*` rows in total. Any count that treats 206 as judgement volume is inflated ~3.4×.
*Method, reproduced from the warehouse for this erratum:* read the file line by line; keep rows
whose `batch.id` starts with `phase2-`; for `type: "verdict"` rows key on `(itemId, batch.id)` and
keep the LAST row at each key by file position; "noted" = non-empty `comment`; palettes = count of
`sideA` plus count of `sideB`. The batch component of the key is load-bearing — item ids repeat
across the 9 phase-2 batches (48 distinct `itemId`s for 61 verdicts), so keying on `itemId` alone
undercounts by 13.

## Judge-proven pieces

| piece | from | evidence |
|---|---|---|
| Exact-pixel publication discipline | P3 | Zero "shade not in artwork" complaints across seven rounds while other arms drew them; made reviewer prescriptions deliverable. Held across 24 workers, audited twice. |
| Coherence-shaped eligibility (no population floors) | P3 | Median endorsed role colour has 8.9e-5 exact-pixel share — any mass floor excludes what the judge endorses. Replacement measured clean; the floor-blocked reviewer-named marks published and graded strong. Needs the spatial-extent semantic caveat (title text eligible, label logo not). |
| Tree of shapes as candidate generator (+ chromatic lanes) | P2 | Endorsed-colour reachability 91.9% / falsifier 1.7% (rival tree 57.4%, control 36.4%), reconfirmed exactly at close, 100% coverage. Lanes recovered 74 endorsed slots incl. isoluminant blindness. |
| Text-led foreground election | P2 | Text-led fg on 16/20; the reviewer prescribes ink/type colours constantly (black-ink, white-type verdicts across three arms). P3's white-type-on-photo failures are the confirming counter-evidence. |
| Guide-stop / excursion machinery | P2 (canon: PHASE_0 §2) | **[Erratum 2026-08-29 — superseded.** Old wording: ~~"Zero owed guide stops on demo-20 + fresh-40"~~, read across the campaign as zero-of-sixty. **The census is n=7.** In `p2-tree/research/v3/prototypes/p2-tree/tos/gradient/out/*.census.jsonl` the `owed` key is present on only **4 of 20** demo-20 rows and **3 of 40** fresh-40 rows; the other **53 rows carry `gradient: null`** — flat palette, no ramp, so the owed question never arises. All seven present values read `"owed": false`. The honest statement: **zero owed stops on the 7 of 60 covers that produced a ramp.** The 42% legacy midpoint-excursion figure (`p2-tree/STATE.md:51`, citing C7) is measured on a different and larger base, so the two are not like-for-like and the guide-stop canon is **not settled** by this census.**] Unchanged and verified: reviewer banding verdicts calibrated the misuse cost (2-stop preferred, tight/many stops lose). |
| Robust-fit field pair + absolute explained-fraction detector | P5 | **[Erratum 2026-08-29 — superseded.** Old wording: ~~"bg/surface bit-identical across nine versions"~~. That claim appears in no primary source and overstates the result. Measured: bg/surface are the arm's *stable* roles at **19.5% / 21.0% per-trial instability** over the 600-trial perturbation suite, with the field path bit-stable under dither at ≤1.06× amplification — stable *relative to* accent's 46.2%, not invariant (`p5-fieldfit/STATE.md:99-102`). The "bit-identical" wording comes from the integration passes and means unchanged **between two consecutive rule sets, one role at a time**: `reports/winteg-pass5.md:79` "Background and surface are bit-identical (120/600, 129/600)" — i.e. 20.0% / 21.5% per-trial instability, delta 0 vs the prior rule set (`:76`); `reports/winteg-pass6.md:82` "Foreground is bit-identical (157/600)" — 26.2%, and about **foreground**, not bg/surface (bg/surface held flat at 20.0% / 21.5%, `:79`). Nothing was measured as identical across nine versions. **The graft survives on the corrected figures** — the field pair is the stable half of the palette and the right substrate to fix first — but no design may assume a bit-exact field pair, and any falsifier written against "bit-identical" must be rewritten against ~20%.**] Detector claim unchanged and verified: it cleanly split block covers (two-block rescue) from photographs (retreat), both paths judge-graded; the reworked absolute form replaced a provably-inert relative one. |
| Foreground = argmax min \|raw APCA\| over the rendered ramp | P5 (converged: P3) | unacceptable→strong on the motivating cover, generalized to fresh covers, independently adopted by P3. Caveat from the floor-demonstration verdict: the legibility floor stands; identity picks WITHIN it (artwork's true ink wins among floor-clearing candidates). |
| Exact joint search (branch-and-bound) | P6 salvage | Bit-identical to exhaustive enumeration at real scale (280M tuples costed, 5–249 visited). Free solver for any future joint objective. |
| Per-mass (not per-area) mark reading | P6 salvage | Moved readable ink rank 39 → 1; corroborated by salience-beats-mass verdicts (2%-sticker palette strong; mass-1505 rejected for named mass-306). |
| λ-priced structure selection (collapse / flat / ramp) | P1 salvage | At measured λ=0.1, produced sensible structure diversity and the fleet's best rendition stability (8/8 pairs). Use as the "how much structure does this artwork deserve" sub-decision only — never as the whole objective. |
| Excursion probes | P1 + P6 salvage | The only working measurements of the off-artwork-ramp pathology the guide-stop canon requires. |

### Erratum 2026-08-29 — P5's cost figure, for anyone grafting the field fit or the marks stage

The figure this campaign repeats, **"0.35 s at 300², 4.2 s at 3000²"**, is stale and mislabelled: it
is a *whole-palette* number from the **v0.6.1** cost pass, not the cost of the fit, and it predates
the v0.9 marks stage that now dominates. Verified figures, with the version each was measured at:

- **v0.6.1** (`p5-fieldfit/reports/wp11.md` §2, "v0.6.1 cost pass", no version bump): whole palette
  *including* the E2 recursion — 300² **232–353 ms** (from 629–902), 640² **969 ms**, 3000²
  **4216 ms** (from 10381). This is where 0.35 s / 4.2 s come from; both are whole-pipeline.
- **v0.9a** (`reports/wv9a.md` §(e), marks instrument built, `ALGORITHM_VERSION` unmoved) splits fit
  from marks for the first time: 300² fit **143–246 ms** + marks **62–524 ms**; 640² fit
  **370–646 ms** + marks **350–498 ms**; 3000² fit **1.63–2.91 s** + marks **3.82–12.43 s**
  (0.38–7.61× the fit). Profile of an 8.2 s 3000² read: `barNeighbourhoodMass` 3.4 s,
  `chessboardDistanceToComplement` 2.7 s, `labelComponents` 2.3 s.
- **v0.9.1** (`reports/wv9c.md` §3, `ALGORITHM_VERSION = "p5-fieldfit-0.9.1"`, byte-identical
  0/31) after the exact snap optimisation: 3000² `readMarks` **9.4 → 6.2 s** and 7.8 → 5.9 s;
  `snap` 5.0 → 1.8 s.

**So the current 3000² cost is roughly fit 1.6–2.9 s *plus* readMarks ~5.9–6.2 s ≈ 8–9 s — about
2× what "4.2 s" implies.** Any design grafting `marks.ts` inherits ~6 s for the mark read alone; any
cost budget or falsifier built on 4.2 s at 3000² is under-set by half. The 300² figure is the one
that survives roughly intact (0.35 s whole palette, of which ~0.15–0.25 s is the fit).

## Negative results as design constraints

1. **No scalar currency judges like the reviewer.** Proven twice in one family (P1 at role
   level, P4 at selection level); P4's margin-independence (τ-b −0.342 — more bits of confidence,
   no more judge agreement) is the sharpest form. No single number gets authority over role
   assignment or palette choice.
2. **Role assignment is a separate judged competence from extraction.** P1's kill condition; the
   reviewer repeatedly certified colours while rejecting seats ("the Zen grey must be background
   or surface"); P3's swap arc needed three rounds and ground truth to converge.
3. **Optimizers sit on floors; the judge grades margins.** Barrier-hugging at 1e-4–3e-3 read as
   one colour; the measured bracket: ~1.5× silent, ~5.4× still complained-about. Margins must be
   priced — but hand-set margin rates are the repo's most-relapsed failure (P6's kill), so the
   pricing must derive from the verdict corpus or format-derived scales.
4. **Selectors die.** Fifth confirmation, strongest form (member-independent, zero-hand-constant
   selection still failed). Compose subsystems structurally (field subsystem + figure subsystem);
   do not elect between rival whole-palette answers.
5. **Population/mass floors block endorsed colours** (see eligibility row above); presence mass
   is evidence about *which role* a colour fills, never an eligibility cost (P6 inheritance note).

## The reframing — corrected after reviewer pushback

An earlier edition of this file over-generalized the reviewer's 168 ground truth into a
universal "two-family palette structure". The evidence does not support the universal form:
cover-19's reviewer-named ideal is yellow/red field + black/white figure (bg and surface in
DIFFERENT families), and the reviewer's own endorsed palette from pair-019 spans four families
(white/green/black/red). What the evidence does support, across all three cases:

**The palette's family structure should mirror the artwork's.** 168's artwork is literally two
colour families (grey swirl ground, blue swirl figure) → its ideal palette is two families with
within-pair sharing. Cover-19's artwork presents four distinct colours → its ideal palette is
four families. The prototypes' shared assumption — four independent roles each optimised for
role-generic properties — misses this: relationships BETWEEN the palette's colours are judged
against relationships between the artwork's colour populations, not against fixed cross-role
rules. (The one fixed relationship that held everywhere: fg/accent must remain mutually
distinguishable, and bg/surface likewise, at margins the eye credits.)

## What we are very sure of — and what we are not

High-confidence learnings (multiple independent evidence sources, reviewer-confirmed — safe to
hand the next architect as observations, each with warehouse provenance):

1. **The reviewer is consistent and measurable.** One direct test-retest (byte-identical palette,
   identical silent strong two rounds apart); prescriptions stable across rounds once read
   correctly (the one apparent contradiction dissolved into consistency when ground truth
   arrived); conditional verdicts are conditional (misreading one cost an arm a regression).
2. **Identity/salience beats mass, with semantic limits.** Small concentrated marks (title text,
   2% stickers) are wanted; equally-small label logos are refused; colours "present only as
   accidental shadows" are ineligible. Pixel statistics alone cannot fully express this — every
   arm that tried hit the same wall (the fleet's one confirmed shared inexpressible).
3. **Margins are graded, bars get sat on.** Bracket measured: ~1.5× the same-colour bar reads
   distinct silently; ~5.4× can still read "almost indistinguishable" in unlucky directions;
   1e-4 over the bar reads identical. Corollary with four independent strikes: the bar itself is
   mis-calibrated near black.
4. **The legibility floor is real AND identity wins within it.** The reviewer's own demonstration
   verdict: the floor stands, the pick was the defect. Among floor-clearing candidates, the
   artwork's true ink/type colour is what the reviewer wants in the foreground seat.
5. **Role assignment is judged separately from extraction** — colours certified, seats rejected,
   across three arms; one mechanism died on its structural indifference to it.
6. **Gradient errors run both directions and stop misuse is priced.** False gradients and missed
   gradients both drew complaints; 2-stop ramps won every preference; tight spacing (~3%) reads
   as banding; guide stops are for excursion reduction only (canon confirmed by verdicts).
   **Erratum 2026-08-29:** the verdict-side half of this learning stands, but the census half does
   not carry the weight the campaign gave it — ~~"zero owed guide stops on demo-20 + fresh-40"~~ is
   **zero-of-seven**, not zero-of-sixty (53 of the 60 census rows have `gradient: null` and no
   `owed` key at all; see the guide-stop row above). Treat "guide stops are rarely owed in practice"
   as **not settled**; it is the weakest item in this list and belongs in the NOT-settled paragraph
   until re-measured on a base of covers that actually produce ramps.
7. **Scalar objectives fail as judges** (two falsifications, one family, margin-independence
   measured) and **selectors fail** (fifth confirmation) — see constraints above.
8. **The dev-set trap is fast.** Overfitting to reviewed covers emerged within ~3 rounds and was
   confirmed by three independent instruments (harness ratio, judge grades on fresh covers, the
   fresh-failure streak). Fresh-cover draws each round are load-bearing, not hygiene.
9. **Served colour names are judged surface.** The reviewer graded partly by display names at
   least twice (naming kept colours, rejecting one partly by its name).
10. **The legacy warehouse contradicts itself at configuration level** (27/128 paired
    comparisons are exact ties filed under different tiers) — its W/L counts are directional
    evidence only, as policy already said and measurement confirmed.

Explicitly NOT settled (do not pass as fact): any specific constant or threshold (the honesty
scanner exists for this); the dither-instability pricing (fired falsifiers in two arms, but the
reviewer never graded it directly); the universal palette-family form (see above); whether the
two deferred design cycles (ink-score redesign, salience-led candidacy) actually pay.

## The spec that isn't code

The **reviewer-principle corpus** (assembled in `PROTOTYPE_RANKING.md` §Cross-arm assets, with
round provenance throughout the warehouse): readability including accent against both field
roles; margins not floors; identity coverage including foreground; salience gates eligibility and
beats mass, with spatial-extent semantics; two-family separation; guide-stop canon; both gradient
error directions live; served colour names are judged surface; one direct test-retest measurement
of reviewer stability (stable). Plus two reviewer-authored endorsed palettes (pair-019 item 5,
pair-023 item 7) and the flat-vs-gradient perception labels (field-gradient-labels-1) as ground
truth. This corpus is the closest thing the campaign has produced to an executable spec of what
the judge grades — the next attempt should be designed against it from day one.
