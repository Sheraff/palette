# Next Palette Relation Architecture

## Status

This document defines `region-graph-next-0.3.0-dev`, a development-only successor to the
rejected `region-graph-next-0.2.0-dev`. It does not authorize human review, reserve access,
candidate freezing, canonical promotion, or output-specific adjustment.

## Preserved Principles

- Perception and pair analysis produce source evidence, not selected roles.
- Every non-fallback color is an exact normalized source pixel.
- Accessibility is non-compensable for every relation explicitly required by the consumer.
- Complete joint inference selects all colors and presentation state once.
- Surface and accent collapse are ordinary alternatives.
- There are no incumbents, repairs, post-selection thresholds, or output mutations.
- Every result has a deterministic recomputable certificate.

## Removed Assumptions

- Field ownership is not sufficient field-pair evidence.
- Every non-typography candidate is not automatically a field.
- A distinct flat surface and a gradient do not share one evidence formula.
- Gradient endpoints do not inherit the flat-surface `0.025` distance requirement.
- Foreground and accent are not assumed to render over every field.
- The fitted gradient model is not active inference evidence.

## Harmonic Conjunction

For bounded evidence `x1 ... xn`:

```text
H(x1 ... xn) = 0                              if any xi = 0
H(x1 ... xn) = n / sum(1 / xi for every xi) otherwise
```

Every input is necessary. Strong evidence cannot erase a missing prerequisite. This replaces
the rejected noisy-OR field objective and does not introduce a post-selection floor.

## Field Eligibility

For one source node:

```text
connected = max(spatial.field, familySpatial.field)
detail = max(spatial.detail, familySpatial.detail)
frame = max(spatial.frame, familySpatial.frame)
broad = max(background, connected)

support = H(broad, 1 - detail, 1 - frame)

eligible when the node is not typography-only and no other source node has:
  more broad evidence,
  no more detail evidence,
  and no more frame evidence
```

Eligibility is source-derived role membership. It does not select background or surface.
Typography, symbols, and local identity details retain ordinary APCA edges for foreground and
accent inference but do not automatically receive field-relation edges. Broad dominance is
relative to the source and introduces no scalar field threshold or implicit fallback. Equally
broad endpoints remain eligible even when their detail evidence differs, preserving subtle fields.

## Field Relation Evidence

Every eligible ordered pair is projected onto its exact OKLab endpoint segment. Positive
endpoint distance is sufficient for analysis; equal endpoints return zero evidence.

Evidence includes:

- absolute pair coverage
- balanced endpoint presence and endpoint mass
- intermediate distribution continuity
- absolute intermediate extent
- monotone endpoint-rooted region connectivity
- progression
- source field ownership from both endpoints

The monotone relation graph permits a region transition only in endpoint-coordinate order.
It therefore cannot use a route that repeatedly reverses the selected color progression.

## Presentation States

### Collapsed

Background and surface are the same source node. Only the collapsed state is legal.

```text
Rcollapsed = 1 - max(Rflat, Rgradient for every complete feasible distinct alternative)
```

### Distinct Flat

Background and surface are different source nodes and satisfy the consumer flat-field distance
constraint.

```text
endpointClause = endpointMass
fieldClause = H(backgroundFieldSupport, surfaceFieldSupport)
flatTopology = 1 - max(distributionContinuity, progression)

Rflat = H(endpointClause, fieldClause, flatTopology)
```

### Gradient

Background and surface are different source nodes with any positive endpoint distance.

```text
endpointClause = endpointMass
fieldClause = H(backgroundFieldSupport, surfaceFieldSupport)
gradientTopology = H(distributionContinuity, monotoneConnectivity, progression)

Rgradient = H(endpointClause, fieldClause, gradientTopology)
```

Flat and gradient support are not complements. Both may be weak, in which case collapse can
win complete inference.

## Consumer Relations

Policy declares non-empty canonical APCA adjacency for each overlay role:

```text
foreground -> [background], [surface], or [background, surface]
accent     -> [background], [surface], or [background, surface]
```

Only declared relations are hard constraints. Every undeclared APCA value remains a signed
certificate diagnostic.

The development diagnostic policy declares foreground and accent over background only. It is
not a generic production default. Generated black and white enter a field-pair domain only
when no single source foreground passes every declared foreground relation.

## Joint Inference

The complete tuple is:

```text
(background, foreground, surface, accent, fieldState)
```

The objective vector is:

1. background representativeness
2. foreground support
3. state-specific field relation support
4. accent identity support
5. represented family coverage

Selection minimizes maximum deficit, then total deficit, then presentation complexity
(`collapsed`, `distinct-flat`, `gradient`), then the stable semantic key.

## Initial Scope

This candidate intentionally retains the frozen 12-center perception shortlist. Small-family
preservation remains required before review, but it is evaluated as a separate perception
boundary change after relation and consumer-policy behavior are structurally measured. No
review is requested while known identity families remain unavailable.

## Required Counterexamples

- Uniform artwork cannot gain a second field from ownership alone.
- A disconnected or wrong endpoint sequence cannot become a strong gradient.
- A hard two-field split prefers `distinct-flat` over `gradient`.
- A broad linear field prefers `gradient` over `distinct-flat`.
- A local object ramp ranks below a broad field relation.
- A subtle same-family gradient below `0.025` remains legal and nonzero.
- Exact equal endpoints remain collapse-only.
- Background-only APCA policy does not reject a chromatic surface solely because the global
  foreground or accent fails on that undeclared surface relation.
- Every declared APCA relation remains a hard signed constraint.

## Evaluation

1. Run synthetic structural controls.
2. Evaluate all 392 already-authorized sources.
3. Reuse prior judgments only for exact complete semantic matches.
4. Evaluate every submitted comment case technically without inferring target colors.
5. Add component-local identity preservation before requesting review.
6. Do not open `10/` through `14/`.
