# Next Palette Architecture

## Status

This document defines the development contract for a clean successor to `region-graph-0.19.0`. It does not authorize a canonical change. Canonical 0.19 and every configured experiment remain frozen evidence and comparison baselines; they are not implementation stages in the new selector.

The initial candidate identity is `region-graph-next-0.1.0-dev`. It may be evaluated only on existing development sources and synthetic fixtures until the architecture invariants in this document pass. Output-unseen reserves `10/` onward remain sealed until a candidate is frozen.

The structural implementation lives in `src/palette-perception.ts`, `src/palette-evidence-graph.ts`, and `src/next-palette.ts`. Synthetic invariants and an existing-development-source smoke run pass. This implementation status does not authorize review, candidate freezing, reserve access, or canonical promotion.

## Goal

Given one normalized sRGB artwork, return at most four role colors and one background presentation state:

- `background`: the principal application field
- `foreground`: content rendered over background and sometimes surface
- `surface`: a second application field, or exact collapse to background
- `accent`: meaningful controls or identity elements rendered over background and sometimes surface, or exact collapse to foreground
- `gradientState`: `flat` or `gradient` for the selected ordered background-to-surface pair

The algorithm must optimize a complete palette. It must not select roles independently and repair them afterward.

## First Principles

1. Perception produces evidence, not roles.
2. Every non-fallback role color is an exact normalized source pixel.
3. Candidate availability is not role authorization.
4. Accessibility constraints are non-compensable.
5. Signed APCA polarity is evidence; policy decides how each polarity passes.
6. Background, surface, and gradient are one coupled field decision.
7. Artwork identity is a property of the complete represented family set, not only accent chroma.
8. Fewer roles are valid when the source does not support distinct roles.
9. One complete inference pass selects the result. There are no incumbents, guards, forced candidates, repair passes, emission vetoes, or fallback to an older palette.
10. Every selected output has a deterministic certificate that can be recomputed from perception evidence and policy.

## Architecture

### 1. Perception

`perceivePaletteImage(image)` returns:

- immutable region analysis
- exact source-observed candidate nodes
- exact candidate masks
- fine color bins and pixel-to-bin assignments
- explicit color-family records and union evidence
- representative source-pixel indices

Perception may use image geometry, color, saliency, typography evidence, and connected support. It may not import a role solver, contrast policy, `Palette`, incumbent output, human review result, or algorithm-specific role threshold.

The first implementation reuses `analyzeRegions` and the current role-aware candidate clustering only to establish the clean boundary. Candidate-family expansion is a later perception hypothesis and must not be smuggled into inference as a treatment.

### 2. Evidence Graph

`buildPaletteEvidenceGraph(perception)` returns immutable candidate nodes and directed pair edges.

Node evidence includes:

- exact RGB and OKLab
- source-pixel provenance
- population
- background, saliency, and typography evidence
- candidate and family spatial evidence
- family membership

Every ordered color edge retains:

- OKLab distance
- signed APCA `Lc` for first color over second color
- legacy WCAG ratio as a diagnostic only

Every ordered background-to-surface edge additionally retains:

- raw gradient-field topology evidence
- model features and discrimination score
- endpoint distance

No edge decides a role or gradient state.

### 3. Policy

Policy contains only consumer constraints. The development policy is explicit and versioned:

- foreground dark-on-light minimum: `+60 Lc`
- foreground light-on-dark minimum magnitude: `60 Lc`
- accent dark-on-light minimum: `+10 Lc`
- accent light-on-dark minimum magnitude: `10 Lc`
- distinct background/surface minimum OKLab distance: `0.025`
- distinct accent/field minimum OKLab distance: `0.025`
- maximum distinct role colors: `4`

The foreground values are conservative token assumptions, not a claim that APCA is font-independent. A production consumer with known font size and weight must supply its own policy. Positive and negative APCA thresholds remain separate fields even when their initial magnitudes match.

Pure black and pure white may enter only as explicit generated foreground fallbacks when no source foreground passes for a field pair. Accent may collapse to that foreground but may not otherwise invent a color.

### 4. Complete Joint Inference

The solver enumerates complete assignments over:

- every non-typography source background
- every non-typography source surface, including exact background collapse
- every source foreground that passes policy, otherwise explicit black/white fallback candidates
- every source accent that passes policy, plus exact foreground collapse
- both gradient states when fields are distinct; only `flat` when fields collapse

Hard feasibility rejects assignments that violate source provenance, role membership, APCA policy, distinct-role distance, gradient-state legality, or cardinality.

Every feasible tuple receives one declared objective vector:

1. field representativeness
2. foreground support
3. surface support
4. accent identity support
5. represented family coverage
6. gradient-state consistency

The initial selector minimizes maximum objective deficit, then total deficit, then prefers the stable semantic key. This gives every declared objective equal non-compensable standing without fitting scalar weights to named artworks. Objective formulas and normalization constants are part of the candidate identity.

Gradient consistency scores `gradient` from pair topology evidence and `flat` from its complement. Gradient is therefore selected jointly with its endpoints rather than patched onto a selected pair.

### 5. Output

The inference result contains:

- selected role and gradient state
- compatibility `Palette` output
- signed APCA measurements
- complete domain, attempted, and feasible counts
- selected objective vector and stable key
- selected candidate and family IDs
- selected directed field-edge evidence
- hard-constraint rejection counts

The certificate remains separate from `Palette`. Compatibility WCAG metrics in `Palette` are diagnostic and never drive next-generation feasibility.

## Explicit Non-Goals

- No source IDs, artwork names, target hexes, or review labels in inference.
- No promotion of the typography-accent treatment.
- No reuse of legacy role scores or post-solver guards.
- No fifth identity role.
- No threshold adjustment after viewing an output-unseen reserve.
- No claim that the initial topology model is a final gradient model; it is provisional evidence carried across all endpoint pairs.

## Complexity Budget

- one perception pass
- one evidence graph
- one complete inference pass
- at most six ranking objectives
- no output mutation after selection
- no mechanism justified by one artwork
- each new feature requires a failure-class hypothesis, synthetic invariant tests, an ablation, and a predeclared stopping rule

## Development Protocol

1. Prove perception determinism, exact source provenance, population conservation, explicit family coverage, and input nonmutation.
2. Prove graph completeness, directed APCA polarity, ordered pair coverage, finite evidence, and permutation invariance.
3. Prove tuple-domain completeness, hard-constraint enforcement, four-color cardinality, deterministic selection, and no postselection mutation.
4. Run only structural diagnostics on synthetic fixtures and existing `images/` development sources.
5. Build a coupled-failure frontier from already reviewed development evidence.
6. Use a black-and-white review shell; palette colors appear only inside source-independent mock previews and swatches.
7. Mark all acceptable complete palettes non-exclusively and separate availability, feasibility, ranking, role-semantics, endpoint, and gradient failures.
8. Change one architectural hypothesis at a time and report ablation against the same development matrix.
9. Freeze implementation, policy, review presentation, and stopping rules.
10. Open exactly one output-unseen reserve. Any change after viewing it starts a new candidate and consumes a later reserve.

## Promotion Gates

A candidate cannot replace canonical behavior unless:

- every structural invariant passes
- all known technical gates pass
- the changed development set is completely reviewed
- accepted-palette regressions are zero or explicitly accepted
- coupled palette/gradient failures improve as a class
- one untouched reserve passes its predeclared stops
- canonical no-option behavior changes only through an explicit version promotion
