# P2 orchestrator decisions (append-only; supersede, never edit)

## D1 — accent ordering: chroma leads; the exchange rate goes to the reviewer (2026-08-04)

Conflict surfaced at W-E/W-F fan-in: W-F's rewrite ranks accent by min raw APCA over
{rendered field, surface} first (per the campaign addendum on accent readability); W-E kept
chroma-from-field first (arm-b′ §2.6, and the reviewer's own round-1 note on …35b967964d
naming the missed vivid coral). On that cover the two orders elect different colours: olive
`#6a723f` (chroma 0.052, contrast 59.1) vs coral `#d25068` (chroma 0.190, contrast 44.5).

**Ruling for integration: chroma-first stands** — it matches the only direct reviewer quote
about a specific accent on a specific cover, and readability keeps its guard through the
contract's own accent machinery (invariant 4 at the user floors) plus the twins-must-collapse
enforcement; no new constant is introduced for an uncalibrated exchange rate.

**The exchange rate itself is round material, not a number to invent:** the next quality round
carries one pairwise item — …35b967964d with the two accents (all other roles identical) —
so the readability-vs-identity trade is priced by the judge on the exact cover where the two
orders part. Until that verdict, contrast-first accent ranking is not to be re-introduced.

## D3 — campaign evidence folded into P2 (2026-08-04, via main orchestrator)

- **Adjudication caveat:** the legacy warehouse contradicts itself at configuration level
  (27/128 paired comparisons are exact ties filed under different tiers, 9 across
  good/known-bad — P1's measurement). W/NS/L counts are quoted with that caveat; they gate
  nothing regardless.
- **Salience gates identity (reviewer, P5 round 2):** presence ≠ eligibility — colours present
  only as "accidental shadows" are ineligible for identity roles. P2 translation: node
  attributes (stability, own-area, lane, depth) must carry an eligibility notion for
  fg/accent identity claims; an incidental low-stability node may not carry identity even if
  retained. Integration-pass design input, not a new constant — prefer ordering by existing
  structural attributes over any new threshold.
- **Surface may be a depicted object's surface** (reviewer: "literally a surface: a polaroid
  with white borders"). P2 translation: enclosure/frame-class nodes are legitimate surface
  candidates — do not demote frames categorically. Matches arm-b §2.3's enclosure reasoning;
  keep it reachable in the surface order.
- **Identity can outrank legibility** (white fg demanded on a light field because the
  artwork's title is white). Validates the text-colour-leads foreground rule over pure
  APCA-max ranking; APCA ranking applies among candidates only when the artwork's own text
  colour does not claim the role. Aligns with D1's direction on the accent side.
- **Round composition:** a fresh-cover overfitting flag fired campaign-wide (P5). P2 rounds
  from round 3 on draw beyond demo-20 — fresh covers from coverage-set-1 / unreviewed shards;
  demo-20 items only where a specific prior verdict is being re-tested (e.g. D1's accent
  pairwise item).

## D4 — cross-arm round evidence, folded (2026-08-05, via main orchestrator; no action ordered)

- **Identity-coverage is a grading axis:** a distinct chromatic colour present in the artwork
  but absent from the palette draws complaints even when everything published is fine.
  Strengthens the case the salience-cut round item must carry both directions (a demoted
  accidental shadow vs a demoted identity colour), and validates the lanes/mining work.
- **Stop-spacing banding:** adjacent stops 3.1% apart read as "very significant banding".
  P2 currently publishes 2-stop ramps only; binds the moment a 3rd stop lands — record a
  minimum-spacing consequence check in the excursion work before any 3-stop publication.
- **False gradient at rank-correlation 0.769:** high correlation is not a perceived ramp;
  endpoint mismatch matters beyond thresholds. For tos this attaches to the laminarity /
  monotone-migration calibration (round-2), not to a new number.
- **Both gradient error directions are live:** the reviewer also asked for a gradient where
  none was published. Round-2's pre-declared limit stands (its 8 items only test the
  published-gradient→flat direction); the missed-gradient direction needs items in a later
  round drawn from covers where tos says flat/partitioned and legacy says ramp.

## D5 — cross-arm pairwise-round evidence, folded (2026-08-05; no action ordered)

- **Stop count drove preference:** every 4-stop ramp graded unacceptable ("banding" named);
  every preference-winning gradient was 2-stop. P2's 2-stop-only publication is validated as
  the default; a 3rd stop now needs strong cause (excursion evidence per the guide-stop
  semantics) AND the D4 minimum-spacing check; a 4th is effectively off the table.
- **Meander named by the reviewer** ("no blue-to-red-to-blue"): monotone progression matters
  perceptually, not just contractually. tos's laminar chain is monotone by construction —
  keep it that way; any interior stop must preserve monotone colour order along the ramp.
- **Identity-coverage extends to foreground-adjacent territory** (a missing title-text
  yellow): the text detector's colour recall is graded, not just its geometry — a second
  reason the per-lane graft (D2) and its isoluminant regression matter on fresh covers.
- **New shape: accent should sit in a different colour FAMILY than background/surface.**
  P2 translation: chroma-from-field already pushes this direction; treat "different family"
  as reviewer vocabulary for hue separation, not a new metric — if round evidence recurs,
  it prices a hue-separation preference level in the accent order (ordering, not a constant).

## D6 — guide-stop doctrine, reviewer clarification (2026-08-05) — SUPERSEDES part of D5

D5's "a 4th is effectively off the table" was too strong and is superseded. Reviewer verbatim
(today): stops 3–4 are "mostly to help guide the linear interpolation in OKLab space through
colors that fit the artwork, not to introduce new colors or meander around the color space."
Canon: PHASE_0_DECISIONS.md:62-71 — 3rd stop allowed for a genuine 3-colour ramp; stops 3–4
are otherwise guides, existing only when the 2-stop straight line demonstrably passes through
off-artwork colours; never coverage, never metric-fitting; flattest path that stays
on-artwork; 4th negotiable on proven utility. The cross-arm 4-stop losses were the doctrine's
predicted misuse cost, not evidence against guide stops.

**The symmetric error is P2's live exposure:** 2-stop-always is NOT the safe harbor — a
2-stop ramp whose straight OKLab line leaves the artwork OWES a guide stop (C7: 42% of legacy
midpoints sit outside their endpoints' lightness span). P2 publishes 2-stop-only as a
recorded cycle-1 cut with no excursion test, so today we cannot even detect when we owe one.

**Consequence — cycle-3 work item, promoted from "cut" to "owed":** implement the excursion
machinery (arm-b §2.7 / arm-e §2.4 semantics): sample the rendered 2-stop OKLab line against
the artwork's occupied colours; over the excursion bar, insert ONE interior stop at the
worst-excursion t taking the field's actual colour there (exact pixel), re-test, keep only if
excursion falls materially; D4's minimum-spacing check and monotone colour order are
preconditions for any inserted stop. D5's other three items stand unchanged.

## D7 — margins, not floors (2026-08-05, cross-arm; no action ordered)

Another arm published pairs clearing sameColorBar by 1e-4–3e-3 and the reviewer called them
indistinguishable; its 6/6-low round also exposed a chroma-blind coverage term (missing black
named). Principle: **the reviewer grades margins; optimizers sit on floors.** P2 exposure:
the twins-must-collapse walk enforces distinctness AT the bar — a pair at bar+epsilon
publishes as "distinct" and is a complaint waiting to happen. P2 translation, cycle-3 design
input: report the pairwise margin per published palette (dump + round side-cars), and where
the next candidate in the same ranking has materially larger margin at equal rank-level,
prefer it (ordering preference, not a new constant). Margin audit of the merged demo-20 run
scheduled with round-3 staging so items don't walk into known complaints.

## D8 — population floors block reviewer-requested colours (2026-08-05, cross-arm; no action ordered)

Another arm found 4 of 7 reviewer-named identity marks at rank-0 of its accent order but
excluded by a 0.1% population-support floor — while the corpus median ENDORSED role colour
has exact-triple share 8.89e-5. Principle: **concentration/coherence beats raw population
share; mass floors exclude exactly what the reviewer asks for.** P2 exposure: our area
floors (`MIN_NODE_AREA_FRACTION` 5e-4 [UNCALIBRATED], `TEXT_COMPONENT_LIMIT` 512 area-ordered
cut) are the same shape, mitigated but not cleared by the fact that nodes are bar-coherent
regions (dense ~2e-2 for endorsed colours) rather than exact triples, and that W-E's coral
survived at area rank 602/963 on stability. Cycle-3 targeted check: of the merged pool's 24
falsifier-rate slots (node-unreachable, control-reachable) and 89 unreachable-from-both, how
many are tiny concentrated marks sitting below the node area floor? If material, the floor
moves toward a stability-based (not mass-based) retention criterion — ordering over existing
attributes first, calibrated number only via a round.

## D9 — pair-015 verdicts ruled: coverage reframes the accent question (2026-08-05)

The round-3-tradeoffs outcome tables were found defective on contact with data (overlapping
rows — see that round's OUTCOME.md), so the mechanical row-actions are not executed; this
ruling replaces them, grounded in the reviewer's verbatim notes.

**T1 (coral vs olive, both weak, olive preferred):** the note vindicates NEITHER accent
order. The reviewer prefers olive because that side "represents more of the artwork" (green
AND red present) while naming the coral as "the correct shade of red (Strawberry Moon)". So:
chroma-first found the right accent shade; the palette lost on **identity-coverage across
roles** — one accent slot cannot carry two colour families, and the ordering question was the
wrong question. Consequences:
- **D1 is neither reinstated nor overturned; it is superseded as scope.** Accent stays
  chroma-first pending the coverage redesign (the coral IS the named-correct shade; flipping
  to APCA-first would trade the correct shade away for nothing the note asked for).
- **Cycle-3 design item (new, high priority): identity-coverage allocation** — when the
  artwork carries ≥2 distinct chromatic families beyond the field (green + red here), the
  four roles should be allocated so both are represented (fg/surface can carry the second
  family), subject to the text-colour-leads rule and the contract. D4's identity-coverage
  axis and D5's colour-family shape are the same signal; this is now reviewer-priced twice.
- `accent-acceptance.test.ts` re-scopes from "coral wins the accent" to "coral is present in
  the pool and is the most chromatic admissible candidate" (structural recall — the part the
  reviewer confirmed correct).

**T2 (both acceptable, level-first preferred, no note):** one unexplained preference on one
cover funds W-H's owed calibrated-MSER-cut round item (kept on the queue with per-candidate
numbers already published) but does NOT flip the live ranking — a single note-less preference
is not a calibration. Interim ranking unchanged; the coverage redesign subsumes it.

**Process lesson (binding on future rounds):** outcome tables must be mutually exclusive and
collectively exhaustive, and must describe what the review page actually collects.

## D10 — cal-014 ruled: identity eligibility, polarity, and the fresh-cover verdict (2026-08-05)

Verified decode in round-3-quality/OUTCOME.md. Headline: 5/6 fresh covers at ≤ weak (1
acceptable, 0 strong) — the pre-declared "≥4 of 6 at ≤2" outcome fires. Rulings:

1. **The white-foreground defect is a text-detector colour-recall problem, priced twice**
   (items 1–2: published near-whites "not a color that is part of the artwork" — said about
   exact pixels). D3's identity-over-legibility rule is about *the artwork's own text colour*;
   the detector electing antialiasing/blend whites as "the text colour" is the suspected
   mechanism. Cycle-3 diagnosis mandated before any rule change.
2. **Item 6's "background should be white" is a POLARITY defect, not a contract gap:** the
   contract fixes stops[0]=background but P2 chooses ramp direction; flipping the published
   ramp (#fafafa→#646464) satisfies the note legally. The geometric top-left polarity rule
   mispicked on its first reviewer contact — one data point, design attention in cycle 3, no
   invented constant.
3. **Identity/belonging is now the campaign's dominant P2 signal** (with D9): eligibility
   ordering (salience/stability) + coverage allocation are one design problem. Cycle-3 fleet
   priority 1, ahead of stability work only where they touch the same code.
4. **Item 4** (gradient, unacceptable, no note, grade moved weak→unacceptable in 1.9s) is an
   evidence gap: queue its cover for a future noted round; do not guess.
5. Enclosure-surface question, D7 margin probe, missed-gradient direction: items were in
   front of the reviewer, no decidable evidence returned (margin probe's negative — 0.0304
   survived — is the one usable point). §5 caveat stands.

## D11 — instrument note: robustness --limit slices trials, no hang timeout (2026-08-05)

`check.ts --limit` slices TRIALS (not covers), so limited smokes are trial-biased toward fast
covers — quote them as biased partials only (the cycle-1 alpha `--limit 50` reading was one).
The harness has no timeout: never point it at a candidate that can hang.

## D12 — D10.1 falsified; the I4 escalation; assignment-stability negative ruled (2026-08-05)

**Correction of record (third of the campaign for this orchestrator):** D10.1's suspected
mechanism — text-detector colour recall — is falsified by W-I Q1. The detector was right both
times. Item 2's true mechanism: the detector elected the artwork's real type `#1e2221`;
**contract invariant I4's ε floor (2.5 |raw APCA|) refused it**; the assembly walk descended
to a 1px antialias halo, which the reviewer then graded down as "not a color of the artwork".

**ESCALATED to the main orchestrator (contract-level, standing demotion rule):** this is the
recorded "an invariant that blocks the reviewer-correct colour" case. P2 will not tune around
it; disposition belongs to the reviewer/contract.

**W-J's honest negative ruled:** ruler-indifference landed (correct on its own terms: 92/92,
palettes byte-identical, W-G's matched-repr swaps closed) but the robustness topline did not
move — the residual churn is in candidate-SET membership under perturbation, and the two
levers W-J measured (fall-through: worse; cluster-member publication: moves dither 23→24% and
accent 447→42/100 in variants that each sacrifice a reviewer-endorsed colour) are
**round-priced, not worker calls**. Queue: cluster-member-publication pairwise items (coral
vs #ee5567 chroma-extremal; #070506 vs contrast-extremal fg) alongside W-K's adverse-case
coverage item and T2's salience-cut item.

**Antialias ineligibility (from W-I Q1/Q3, 30/113 reachability failures are halo-only):**
boundary-tracing thin regions (inradius ≈1px, boundary fraction ≈1) are the measured
"accidental shadow" class — D3's salience-gates-identity has its concrete implementation
target; design as ordering/exclusion on existing attributes (inradius, boundary fraction),
constants only via provenance.

**Cross-lane dedup defect (item 5's phantom text group):** small follow-up fix in roles/ —
merge coincident components across lanes before grouping; coincident centroids must not
satisfy collinearity vacuously.

## D13 — field-gradient-labels-1 ruled (2026-08-05)

Verified decode in round-2-flat-vs-ramp/OUTCOME.md. Rulings, all per the pre-declared
mapping except where its non-MECE defect required an orchestrator reading (recorded there):

1. No laminarity constant moves — `MONOTONE_MIGRATION_FRACTION` stays 0.8 [UNCALIBRATED]
   (3–5 split).
2. `UNREADABLE_COVERAGE_FRACTION` is the next constant to MEASURE (≥3 cant_tell trigger;
   converges with W-G's ceiling finding). Work item: sweep the coverage gate over the
   144-labelled corpus, report ceiling movement + verdict-distribution shift; measurement
   first, any residual judgment via a round.
3. The stricter laminarity cuts (monotone-only, best-agreement) are REJECTED as-is: the
   reviewer sided with legacy on both readable ramp regressions — they flip real ramps to
   buy phantom reduction. Phantom-gradient work resumes only after the coverage gate is
   measured.
4. Anchor phantom stands ("neither").
5. REPEAT process defect: second non-MECE outcome table. Binding: every future P2 ROUND.md
   outcome table is MECE with stated denominators, and the requirement now goes into the
   staging-brief template text itself (third strike escalates to the main orchestrator as a
   process failure).

## D14 — floor demonstration ruled: the floor stands, the pick was the defect (2026-08-05)

phase2-pair-018 verified decode in round-4-floor-demo/OUTCOME.md. Reviewer verbatim: the
true ink's contrast "is *indeed* too low and should not pass the minimum hard contrast
floor. However there *are* valid picks in the image such as Charcoal or Putty."

1. **The D12 I4 escalation is CLOSED — no contract change requested.** I4's ε floor is
   reviewer-affirmed. The defect class is the colour pick under refusal, exactly what worker
   L's antialias-ineligibility (`78f0285`) already fixed structurally; the current build
   publishes node-backed `#cba69d` (putty family) on the demonstrated cover — validation
   belongs to the next quality round, not to this verdict.
2. **Generalisable principle recorded:** "take a colour from the artwork" is endorsed as the
   right idea even when the detector's literal ink fails the floor — the fallback must stay
   within artwork-true, structure-backed candidates (never halos, never synthetics). P2's
   assembly walk already has this shape; the eligibility ordering is the load-bearing part.
3. STATE.md §4's first open question is answered; §3 row 1's contract-level cause is
   resolved (floor affirmed + pick fixed). Update at next natural STATE refresh.

## D15 — coverage gate ruled: pick-one-and-state, 0.25, applied at W-N fan-in (2026-08-05)

W-M's sweep (gate-sweep/, pinned `9aab5f2`, reproduces W-G exactly) measured: at 0.5 the
gate false-unreadables 64.6% of reviewer-readable covers and caps the laminarity ceiling at
63.9%; at 0.25 ceiling 93.1%, false-unreadable near-eliminated, ramp recall 11.8%→~47%,
phantom 69.2%→54.3%; laminarity AGREEMENT sits at the majority baseline at every grid point
(0/13 Holm, both tests) — no operating point is measurement-adoptable, and the decisive
round would need ≈37 served items (disproportionate).

**Ruling (the reviewer's own standard: resolve by measurement, or pick one, state it, move
on):** `UNREADABLE_COVERAGE_FRACTION` 0.5 → **0.25**, provenance upgraded [UNCALIBRATED] →
[MEASURED] citing the sweep — with the basis stated honestly: the pick is decided by the
false-unreadable axis (definitionally measured against reviewer labels) and by the
reviewer's demonstrated preference for ramp recall (sided with legacy on readable ramps,
D13.3); it is NOT a laminarity-agreement improvement and must never be quoted as one. 0.25
over the saturated 0.20 keeps a real gate (unreadable census 39→9, not →2).

**Application deferred to W-N fan-in** — W-N is mid-flight on the live tree and a constant
change under its verification would poison its measurements. Sequence: W-N lands → apply
the one-line change (orchestrator exception, genuine one-liner) → full suite + devloop +
robustness + reachability re-verified → the 9 remaining unreadable covers and a sample of
newly-judged flip covers go preferentially into the next quality rounds, so ordinary grading
validates or refutes the pick with zero dedicated reviewer items.

## D2 — isoluminant foregrounds: deferred to the integration pass (2026-08-04)

W-E's lanes feed the accent pool only; grafting lane nodes into the text-group foreground
ranking requires per-lane chain-collapse inside pipeline.ts (W-F's file). Scheduled as the
integration worker's task after W-F lands, not as a mid-flight edit. Recorded gap until then:
isoluminant foregrounds remain invisible, as in cycle 1.
