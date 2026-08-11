# Round-6 verdicts (phase2-cal-022) — decode and actions

8/8 graded, 0 vetoes/confounds; stems unrewritten; orchestrator-only fields stripped; purpose
honoured. Grades: 2 strong / 1 weak / 5 unacceptable.

## The arbitration: LEGIBILITY WINS — unanimous, no split

All four conflict covers (min-ramp 2.67/3.07/3.27/4.93) graded unacceptable with text-readability
notes; three PRESCRIBE the foreground ("we should use black as the foreground", "the main text
is white... we should have a white foreground" ×2). The pre-registered legibility branch fires:
**the chromatic-mark hold rule gains a floor clause; the swap partially returns.** Bracket: the
floor is unbounded above within the tested span (highest complaining min-ramp 4.93; no
non-complaining conflict cover); pre-registered constraint stands: a floor above 3.07 removes
039's magenta from the accent — but note the reviewer's 039 prescription is a WHITE FOREGROUND,
which coexists with a magenta accent if fg selection finds the text colour. Root-cause question
for 0.4.3: on all three prescribed covers the artwork's main text colour (white/black) exists —
why did fg selection land elsewhere? The deeper fix may be fg selection, not the swap.

## Re-grades

- **Purple: acceptable → STRONG**, no note — the shade-band fix validated, no twin complaint.
- **Fresh cover: STRONG** — first fresh ≥3 since round-2 (one cover, not a rate).
- **Cover-19: strong → unacceptable — regression CONFIRMED** ("there aren't 2 shades of yellow
  on that artwork... Taxi Yellow, Torch Red, black (Soot is ok), white"). The accent redesign's
  chromatic ordering elected a second yellow against a yellow field — family-separation defect
  on this cover; diagnose why hue-separation didn't exclude it.
- **168: acceptable → weak, "the foreground should be blue." RESOLVED post-decode by reviewer
  ground truth (2026-08-05):** the target is a PAIRED-FAMILY palette — two dark greys as the
  field pair (gradient:true), two blues as fg + accent. The prescription never moved; we only
  ever published one blue, so the unfilled seat complained each round. Principle recorded as
  EVIDENCE item 13 (figure-family vs ground-family separation); W23's scope amended — 168 is an
  active diagnosis target (reachability of the paired shape, no special-casing).

## Off-branch

Row 0's counterfactual ("then the palette will be 'strong'") — the reviewer grades the palette
as repairable by one role change. Row 7 graded partly from served colour NAMES (Taxi Yellow /
Torch Red / Soot vs "Laser Lemon") — colour naming is part of the judged surface; noted.

## Actions (0.4.3, W23)

1. Floor clause per the branch: hold only when displaced fg clears [UNCALIBRATED provisional
   5.0, anchor: the 4.93 bracket + future rounds]; below it the swap returns.
2. FG-selection root cause on the three prescribed covers (white/black text present, missed).
3. Cover-19 family-separation diagnosis + local fix.
4. 168: no action; upward.
