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

## Addendum 2 — P1 measurement + P5 round-2 principles, relayed 2026-08-04

| # | evidence | where P6's design answers it | the check |
|---|---|---|---|
| 8 | Legacy warehouse contradicts itself at configuration level (27/128 paired comparisons are exact ties filed under different tiers, 9 across good/known-bad) | Adjudication was already a dev aid gating nothing; this prices its W/L counts lower still | Procedural: every W/L count quoted in a P6 report carries this caveat inline. No code |
| 9 | SALIENCE gates identity: colours present only as "accidental shadows" are ineligible for identity roles — presence ≠ eligibility (a spatial-support notion) | P6's unary terms are all spatial-support integrals (presence mass, field-likeness, spread, border affinity, ink/mark energy over the surround ladder) — salience-like by construction. But belonging is deliberately cutoff-free (open question 2), so eligibility is priced, not gated — the design bets the price suffices | On demo-20 survivor tables: find covers with low-mass shadow/shading colours near the top of any role ranking; report whether the energy's existing terms already demote them. If shadow colours WIN roles, that is a mechanism finding (the cutoff-free bet failing), reported — not patched with a gate |
| 10 | Surface may be sourced from a depicted object; and identity outranked legibility once (white fg demanded on a light field) | No per-role source restriction exists in P6 (whole artwork feasible for every role — structural). The identity-vs-legibility tension is the reviewer's to arbitrate case by case; P6 keeps barriers at contract floors + ink-preferring fitness | none — compatibility noted; the legibility/identity trade is explicitly NOT a tuning signal in either direction (see row 7's caution) |

## Addendum 3 — cross-arm round (four verdict-response fixes re-graded STRONG), relayed 2026-08-04

| # | evidence | where P6's design answers it | the check |
|---|---|---|---|
| 11 | Identity-coverage is a grading axis: a distinct chromatic artwork colour missing from the palette draws complaints even when everything published is fine | The coverage term IS this axis, structurally: mass-weighted floorless transport from the artwork's chromatic mass to the published set (proposal term 6, "the most frequent complaint class moved out of the census and into the objective"). Its rate is on the sensitivity sweep | Existing check 3 covers the accent half; the analyst's round template gains: per graded-down item, was there a major chromatic mass with no published colour near it (read off the lattice)? |
| 12 | Adjacent gradient stops 3.1% apart read as "very significant banding" | P6's stop rule is excursion-reduction-only on the flattest on-artwork path — close stops should not arise except in a genuine close-coloured 3-ramp | No P6 gradient published yet (0/18). When one is: analyst reports adjacent-stop OKLab spacing alongside the verdict. No threshold adopted — evidence, not a bar |
| 13 | A false gradient was called at rank-correlation 0.769 — high-correlation structure is not a perceived ramp | Supports P6's stricter criterion: the DL fit demands monotone SPATIAL structure (two flat regions ≠ ramp — the tested hard case), not correlation | none — corroborates an existing guard |
| 14 | The reviewer also asked for a gradient where none was published — both error directions live | P6 published 0/18 gradients while proposing 17/18; the miss direction is untested on demo-20 (no real ramps in the set) | W7's open item "a set with real ramps" gains priority: build it before the second round, so the DL rate's sweep curves have both error directions to land on |

## Addendum 4 — cross-arm pairwise round, relayed 2026-08-04

| # | evidence | where P6's design answers it | the check |
|---|---|---|---|
| 15 | Stop count drove preference: every 4-stop ramp unacceptable ("banding" named), every winner 2-stop; one monotone-progression complaint | Corroborates the excursion-only rule: P6 never publishes a 4th stop (reported-not-published by construction), inserts a 3rd only on excursion-bar violation, and its ramp is the flattest on-artwork path (monotone by the spatial-regression construction) | Constraint adopted for the real-ramps set: predominantly genuine 2-stop ramps, a minority of true 3-colour ramps — matching the reviewer-preferred shape so the set measures the DL rate where verdicts actually live |
| 16 | Identity-coverage spans foreground-adjacent territory (a missing title-text yellow); new shape: accent should sit in a different colour FAMILY than background/surface | Coverage transport is floorless over ALL chromatic mass, ink included — a title-text yellow with mass and no published colour near it is expensive by construction. The family shape touches the coverage term's colour-space structure: OKLab transport distance can be cheaply satisfied by a same-family-different-lightness colour that the reviewer would still call family-uncovered | Analyst template gains: for coverage complaints, report whether the nearest published colour to the complained-about mass differs mainly in lightness (family-satisfied-in-OKLab-only — the gap this evidence names) or in hue (genuine miss). Measurement of the gap, not a term change |

If any check fails, the report says *which principle failed and why*, with the measurement. The
sensitivity harness (README falsifier 3) stays the only process that ever moves a rate, and it
moves rates to *measure* them, not to improve verdict agreement.
