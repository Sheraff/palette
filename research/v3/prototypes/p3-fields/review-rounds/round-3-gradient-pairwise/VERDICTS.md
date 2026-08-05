# Round-3 verdicts (phase2-pair-007) — decode and actions

Analyst decode, unblinded via batch log (pushed index 0 = gradient confirmed on all 8; mapping
unambiguous; zero confounds/vetoes/missing). Flat-preferred: 048 (.6498), 181 (.6385), 188
(.6217). Gradient-preferred: 208 (.6323), 130 (.6228), 168 (.6221). No-pref: 039, 114.

## ρ*: UNCHANGED, per the pre-registered rule

The orderings interleave (flat-preferred .6217 sits below all three gradient-preferred), so the
rule surfaces the contradiction and refuses a number. **ρ* stays 0.62.** No average computed.

## The hidden variable: stop count, not ρ

Banding was named on exactly the four 4-stop covers (048, 181, 114, 188) and none of the four
2-stop covers; preference splits on the same line — 4-stop → flat or no-pref (gradient side
graded unacceptable all four times), 2-stop → gradient (3) or no-pref (1). The round measured
the guide-stop machinery, not the boolean. Constructive reading:

- **CORRECTED (reviewer clarification, 2026-08-05, superseding this file's first reading and
  commit f6a7fee's message):** the round proved the MISUSE cost the guide-stop doctrine already
  predicts — stops acting as new colours, tight spacing, meander — not stop-count dis-utility
  per se. Reviewer verbatim: "the 3rd and 4th stops... are mostly to help guide the linear
  interpolation in OKLab space through colors that fit the artwork, not to introduce new colors
  or meander around the color space." 0.4.0 therefore does NOT hard-cap at 3. The canon shape:
  every stop beyond 2 requires an excursion-reduction justification (the 2-stop chord
  demonstrably passing through off-artwork colours — recorded per stop in diagnostics), minimum
  spacing and monotone progression stand on this round's evidence, and the 4th requires proven
  utility (default: not reached). The 0.3.0 implementation is nominally excursion-driven
  already, so the defect to find is WHY insertion fired into adjacent/meandering stops on these
  covers — likely wandering t-paths on covers whose "gradient" is questionable to begin with
  (see 048's endpoint mismatch) — before constraining it.
  Interaction to investigate in 0.4.0 (from main, C7: 42% of legacy midpoints sat outside the
  endpoints' lightness span): the I4.ramp-below-contrast-floor class (19 covers) is judged on
  the rendered ramp BETWEEN stops — properly-used guide stops that pull the ramp on-artwork may
  be the fix for part of that class, not a competing concern.
- **The boolean near 0.62 looks serviceable for 2-stop ramps** (gradient-preferred at
  .6221–.6323). Re-anchoring ρ* properly wants a post-fix re-run; not queued until after the
  banding fix ships.
- **One meander sighting** (048: "there is no blue-to-red-to-blue gradient in that artwork") —
  excursion insertion built an out-and-back path; the merge/cap work must also enforce
  monotone-progression (the ruling's "meandering is forbidden" made checkable at insertion).
- **One endpoint-identity error** (114: "the background of this artwork is not white, it is
  red") — an e1/e2-or-prevalence selection error under a live gradient; goes to the ends
  workstream, one concrete cover.

## Identity-coverage: five more counts (running total 7)

039 "magenta color / white text" missing; 208 "missing the significant yellow (album title,
artist name)"; 130 "beautiful brown colors (cinnamon, coffee)... instead of Holy Crow black";
168 "the accent would be better within the blue family instead of... the same color family as
the background and surface"; 188 "missing some significant colors to reflect the full artwork's
identity". Note 208's missing yellow is TEXT — title/artist ink — so identity-coverage spans
fg-adjacent territory, not accent alone. 168 adds a new shape: accent should sit in a
DIFFERENT colour family from bg/surface. All feed the 0.4.0 accent redesign note.

## Anomalies (upward)

Batch pushed with `purpose: "mechanism"` (ROUND.md pre-registered calibration purpose) and
free-text `fundedBy` — installer-side deviations, cosmetic but worth noting for warehouse
queryability. 4/8 preferences are `prefilled` (derived from unequal grades — the kit's design,
not an anomaly; recorded for stats hygiene).
