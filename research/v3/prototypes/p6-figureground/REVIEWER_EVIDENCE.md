# Reviewer evidence relayed 2026-08-04 (P5 calibration + P2 pairwise rounds) — and P6's answer

**Standing rule first (falsifier obligation, README):** none of this tunes an exchange rate. These
are tests of whether P6's *stated principles* already produce the graded-up behaviour. If they do
not, that is reported as a finding about the mechanism — the fix is never "move the rate toward
the verdicts", which is the documented relapse.

| # | reviewer evidence | where P6's design already answers it | the check to run when palettes exist |
|---|---|---|---|
| 1 | Foreground readability on the field is the dominant failure class ("barely registers", "unreadable"); contrast priced very high; principled form = min APCA over whole rendered ramp | Min-APCA-over-ramp is a **hard barrier** (inherited contract floors, W4 barriers.ts, 600/600 equivalence) — stronger than a price. Above the floor, foreground fitness IS lightness displacement (ink energy), so the mechanism intrinsically prefers readable foregrounds | On demo-20 solutions: distribution of fg min-APCA margin above the ε floor. If winners cluster AT the floor, the belonging/coverage terms are outbidding readability — report as finding |
| 2 | Indistinguishable sibling pairs forbidden; collapse via contract machinery, never twins | Distinctness is a hard barrier at `sameColorBar` per pair; collapse is a *move* competing in the same energy — twins are infeasible by construction | Assert zero published sub-bar pairs across demo-20 (should be structurally impossible; test it anyway) |
| 3 | Palettes must carry the artwork's identity: vivid accents mined from the artwork, only shades that exist in it | Feasible set = the artwork's distinct triples, never filtered (invariant 2, structural); coverage term is mass-weighted transport toward the artwork's chromatic mass; accent fitness = chroma displacement (mark energy) | Known fragile case (proposal §7): small dark saturated marks lose to brighter blander candidates. Count it on demo-20 — this is the failure the reviewer will see first if it exists |
| 4 | A gradient on a flat artwork is a graded-down error | DL model selection requires monotone spatial structure (two flat regions ≠ ramp — tested); repaired rate 0.33 sits mid-band; W6 task-4: 3/3 real covers flat-first, synthetic ramp gradient-first | Gradient-first rate across demo-20 and coverage-set vs the gradient-rate neutrality census; false-positive gradients enumerated individually |

## Addendum — third round (another prototype's calibration), relayed 2026-08-04

| # | reviewer evidence | where P6's design answers it | the check |
|---|---|---|---|
| 5 | Accent readability graded down against BOTH surface and background — readability is not foreground-specific | Proposal §2.4 term 5 already says accent contrasts against "background, surface and the whole rendered OKLab ramp" — verify W4's implementation actually covers accent-vs-surface in the flat-distinct-surface case. Probe already caught accent #0b0b0b on bg #000000 passing a near-zero floor: accent floor-clustering is live | Extend check 1: accent min-APCA margin vs background AND surface separately, distribution over demo-20; floor-clustering reported the same way as foreground's |
| 6 | The reviewer notices ROLE-ASSIGNMENT errors specifically (asked for a fg↔accent swap of colours already in the palette — ordering, not extraction, was the error) | Role assignment IS P6's constrained readout — this evidence targets the mechanism's core claim. A correct answer with a fragile ordering is invisible to the energy but visible to the reviewer | Per cover: the energy gap between the winning (fg, accent) assignment and the swapped one, holding everything else fixed. Small or negative-margin gaps enumerated — they are the covers where the ordering is one verdict away from wrong |
| 7 | A hedged false-gradient note cost zero grade once — gradient-wrongness pricing is unpredictable | Nothing to build. Explicitly recorded so nobody reads round-to-round gradient pricing as a signal to tune toward (or away from) | none — a caution, not a check |

If any check fails, the report says *which principle failed and why*, with the measurement. The
sensitivity harness (README falsifier 3) stays the only process that ever moves a rate, and it
moves rates to *measure* them, not to improve verdict agreement.
