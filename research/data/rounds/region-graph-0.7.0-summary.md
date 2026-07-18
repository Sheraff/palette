# Region Graph 0.7.0 Review

The complete immutable round is in `region-graph-0.7.0.json`.

The single perceptually changed 0.7-versus-0.6 pair was reviewed under presentation version 2.

## Iteration Comparison

- 0.7 preferred: 0
- 0.6 preferred: 1
- No preference: 0
- Only 0.7 shippable: 0
- Only 0.6 shippable: 0
- Both shippable: 0
- Neither shippable: 1

## Finding

For Disney, forcing a distinct accessible surface selected `#a51d66`, a shadow from the pink field, rather than one of the artwork's other large orange, blue, or green fields. The prior unified `#c72690` background and surface was preferred even though neither palette was considered shippable.

The exact bright alternate fields cannot share the artwork's white foreground while satisfying the 4.5:1 surface contrast gate. Introducing more Disney-specific exceptions on this small development corpus would overfit without resolving that role-model constraint.

## Decision

- Reject the multi-background distinct-surface scoring rule.
- Restore the 0.6 solver behavior as 0.8.
- Accept unified pink background and surface as the conservative Disney fallback.
- Retain the orange accent, exact source-color policy, WCAG gates, and accent-separation invariant.
- Do not request another human comparison for the exact restored palette already preferred in this review.
