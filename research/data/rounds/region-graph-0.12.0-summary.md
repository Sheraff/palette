# Region Graph 0.12.0 Review

The complete immutable development round is in `region-graph-0.12.0.json`.

All four perceptually changed 0.12-versus-0.11 iteration pairs were reviewed under presentation version 2.

## Iteration Comparison

- 0.12 preferred: 0
- 0.11 preferred: 3
- No preference: 1
- Only 0.12 shippable: 0
- Only 0.11 shippable: 1
- Both shippable: 3
- Neither shippable: 0
- Total shippable for 0.12: 3
- Total shippable for 0.11: 4

Artofficial tied with both versions shippable. Horrorwood and Nada preferred 0.11 while both remained shippable. Orelsan preferred 0.11 and marked only 0.11 shippable.

## Decision

Version 0.12 is rejected. Increasing endpoint-path coherence from 0.22 to 0.32 improved one duplicate-resolution diagnostic but removed gradients that were consistently preferred in the rendered UI. Human preference remains the primary endpoint, so 0.11 is restored as the accepted candidate.
