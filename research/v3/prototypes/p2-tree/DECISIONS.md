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

## D2 — isoluminant foregrounds: deferred to the integration pass (2026-08-04)

W-E's lanes feed the accent pool only; grafting lane nodes into the text-group foreground
ranking requires per-lane chain-collapse inside pipeline.ts (W-F's file). Scheduled as the
integration worker's task after W-F lands, not as a mid-flight edit. Recorded gap until then:
isoluminant foregrounds remain invisible, as in cycle 1.
