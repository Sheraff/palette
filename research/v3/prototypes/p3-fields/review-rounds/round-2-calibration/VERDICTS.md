# Round-2 verdicts (phase2-cal-006) — decode and actions

Analyst decode against the released warehouse payload + post-release batch log; mapping clean,
no vetoes/escapes/leakage (served items carry no variantId/fingerprint — verified against
ITEM_FIELD_ALLOWLIST). Grades: 4 strong / 2 acceptable / 3 weak.

## The headline

**All four re-grades: weak→strong (00, 02, 07) and acceptable→strong (19), zero repeat
complaints.** The 0.3.0 quality fixes are judge-validated. Credit per the `_diag-regrade/`
diagnostics (staging flag 1): item-1's strong credits the SWAP COMPARATOR (not the lump clause);
item-3's strong credits the ink cascade landing on black unaided; item-5 is luminance-cascade
evidence; item-7's pre-registered "accent complaint repeats" expectation was REFUTED at min-ramp
7.55 (accent floor not implicated).

## New failure classes (fresh covers — none is a fitted defect)

1. **Stop-spacing banding** (r2-item-0, weak, held at unacceptable for 7 drafts): 4-stop
   gradient with stops 3.1% apart → "very significant banding (purple at 71.9%, green at
   74.7%)". A rendering-consequence class no branch anticipated: excursion insertion can place
   guide stops adjacent. 0.4.0: minimum stop spacing / merge adjacent guide stops (selection-
   side, within the line). (Radial-rendered-as-linear is by ruling — consumer renders 135° —
   so the spacing is ours, not the mock's.)
2. **Identity-coverage: a distinct chromatic colour present in the artwork is missing from the
   palette** (r2-item-4 weak: "very distinct purple … we could use instead (as the accent)";
   r2-item-2 acceptable: "some pink and blue … missing for a complete palette identity").
   Indicts the lexicographic lightness-first accent tiers: any L-moving qualifier beats every
   chromatic mark by construction. With r2-item-8 (swap-demoted ex-foreground unreadable as
   accent) this makes accent the round's dominant defect site — and accent is already the
   robustness-worst role (69.5% instability, attribution block 22). **Accent redesign is
   0.4.0's quality centerpiece**: chromatic-lump preference among qualified accents, tempered
   by perception-4's direction (lightness helps function) as a tie-break rather than a tier
   wall. Needs a careful design note before implementation.
3. **False gradient at ρ 0.769** (r2-item-6, weak): "there is no red-to-white gradient in this
   artwork" — ρ* threshold work cannot fix a ramp whose ENDPOINTS don't correspond to a
   perceived artwork gradient; the Spearman can be high on structure that isn't a field ramp.
   Hold for round-3 (phase2-pair-007) verdicts before redesigning the boolean; this cover is
   the concrete counter-example to threshold-only calibration. Note r2-item-7's inverse: the
   reviewer ASKS for a gradient where none was published. Both directions are live.
4. **Twin siblings fired twice** (r2-item-7 #ededed/#f6f6f6 — noticed, prescribed as gradient,
   still strong; r2-item-4 #4b4b4b/#7a7a7a). Collapse-width calibration count now 2. Still
   evidence-gathering, not yet a number change.

## Branch decode summary

(a) swap-validation: both swap items ≥3 — unchallenged at 0.012 margin, residual complaint on
the DEMOTED side at 95.96 (feeds accent redesign). (b) salience watch: did not fire at the
busiest cover; diagnostic stays deferred. (c) identity-vs-legibility: unresolved — item-6's
weak is gradient-confounded, its 6.12 ink drew no readability note; bracket unpurchased. (d)
re-grades: fires, all strong. (e) overfit trigger literal-fires; substantively: fitted defects
fixed, new classes on fresh covers — keep drawing fresh. (f) twins: two counts.

## Staging lesson

ROUND.md mischaracterised r2-item-4 as "greyscale" — the cover carries a prominent purple
subtitle, so the round's only ρ-confident-end test was answered on chroma absence instead.
Future staging: contact-sheet reads get a cheap max-chroma-lump check before classing a cover
as neutral.
