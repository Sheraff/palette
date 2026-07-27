# Next Palette Ordered Field-Pair Hypothesis

## Status

This document predeclares one development-only ablation after the rejection of
`region-graph-next-0.1.0-dev`. It does not authorize candidate freezing, new human review,
reserve access, or canonical promotion.

The successor identity is `region-graph-next-0.2.0-dev`.

## Failure Class

Eighteen of the 23 commented `0.1.0` cases selected exact surface collapse. Fifteen of those
18 had at least one distinct source surface that remained feasible with the selected
background, foreground, accent, APCA constraints, distance constraints, and cardinality.

The failed candidate scored a distinct surface from standalone node support. Its collapse
score was the complement of the strongest feasible standalone surface support. Pair topology
and gradient evidence could not compensate when standalone surface support was the minimax
bottleneck.

## Single Change

Keep perception, the evidence graph, policy, complete tuple domain, hard constraints, the
other five objectives, minimax comparison, and output construction unchanged.

Replace objective slot 3 with support for the directed ordered field pair. For a distinct
`background -> surface` edge:

```text
endpoint = clamp01(edge.field.topology.features.endpointSupport)
coverage = clamp01(edge.field.topology.histogram.absolutePairCoverage)
endpointMass = endpoint * coverage
ownership = clamp01(edge.field.topology.features.fieldOwnership)
orderedFieldPairSupport = 1 - (1 - endpointMass) * (1 - ownership)
```

The parameter-free union permits either broad endpoint mass for hard flat fields or active
field ownership for interpolated fields. Weighting endpoint balance by absolute pair coverage
prevents a small balanced pair from receiving complete support. The formula does not use the
gradient model score, so gradient classification remains isolated in objective slot 6.

For exact surface collapse, objective slot 3 is:

```text
1 - max(orderedFieldPairSupport(background -> alternativeSurface))
```

The maximum ranges over the same distance-, APCA-, accent-distance-, and
cardinality-feasible alternatives used by `0.1.0`.

## Invariants

- No source ID, filename, review label, named hue, target color, or old output enters inference.
- Every non-fallback color remains an exact normalized source pixel.
- Tuple enumeration and every hard-constraint rejection are unchanged from `0.1.0` for the
  same graph and policy.
- Pair support is finite, bounded, directed, and recomputable from the selected field edge.
- Collapsed fields remain flat and carry no field edge.
- Gradient state remains part of complete joint inference.
- There is no output mutation or repair after selection.

## Predeclared Evaluation

1. Synthetic and structural tests must pass with zero violations.
2. For every one of the 392 authorized development sources, complete-domain counts,
   feasibility counts, and hard-constraint rejection counts must exactly equal `0.1.0`.
3. The 15 commented feasible-collapse cases are the primary technical stopping cohort.
4. At least 8 of those 15 cases must select a distinct surface to establish a material effect.
5. No case may select a distinct surface whose recomputed ordered-pair support is below `0.5`.
6. Existing human judgments transfer only when the complete successor palette exactly matches
   a previously reviewed baseline or `0.1.0` palette. Every novel complete palette remains
   unknown.
7. New review is considered only if all structural stops pass, the primary technical stop
   passes, and review reuse does not show a known regression excess over known improvements.

## Explicitly Deferred

- Candidate-family expansion for unavailable small identity families.
- Representative-fidelity changes.
- Consumer-specific foreground typography policy.
- Accent feasibility or family-coverage changes.
- Gradient-model threshold or feature changes.
- Generated-foreground authorization changes.
