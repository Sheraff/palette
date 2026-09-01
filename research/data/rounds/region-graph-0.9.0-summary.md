# Region Graph 0.9.0 Review

The complete immutable development round is in `region-graph-0.9.0.json`.

All nine perceptually changed 0.9-versus-0.8 iteration pairs were reviewed under presentation version 2.

## Iteration Comparison

- 0.9 preferred: 9
- 0.8 preferred: 0
- No preference: 0
- Only 0.9 shippable: 6
- Only 0.8 shippable: 0
- Both shippable: 1
- Neither shippable: 2
- Total shippable for 0.9: 7
- Total shippable for 0.8: 1

Birds of Prey, Disney, Franz, Green Day, Loups, and Skap became only-current shippable. Horsley improved while both remained shippable.

## Remaining Failures

- Elephunk's foreground, background, and accent were supported, but its dark surface still did not look visibly present in the artwork.
- Nobs gained the correct white background and a popping accent, but its yellowish surface still did not look like an artwork color despite being an exact observed pixel.
- Loups was accepted, with a note that its tiny white artwork title would be a better foreground if it could be preserved reliably.

## Decision

Version 0.9 is strongly supported on the difficult development corpus, but the gallery audit showed why corpus-level visual inspection must accompany focused pairwise queues. The solver should not be tuned further on these cases until evaluated on the separate random-artwork holdout cohort.
