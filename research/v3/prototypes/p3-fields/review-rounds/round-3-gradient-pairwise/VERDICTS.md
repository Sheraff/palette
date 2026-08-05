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

- **The 4th stop has measured dis-utility.** The contract grants stop 4 only as "negotiable on
  proven utility"; the evidence proves the opposite. 0.4.0: cap at 3 stops, and merge/space
  guide stops (round-2's r2-item-0 banding at 3.1% spacing is the same defect; minimum spacing
  becomes a stated constant with this round as provenance).
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
