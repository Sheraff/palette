# Scale-Aware Native Palette Development Plan

## Status

This plan freezes a new development experiment informed by the completed blinded review of `region-graph-0.19.0-native-resolution-0.1.1-development`. It does not modify or continue that failed identity.

An initial `region-graph-0.19.0-scale-aware-native-0.2.0-development` artifact passed every scientific and structural gate but was stopped before review with zero feedback. Its carry rule compared hidden score, metric, confidence, and source-distance fields even though the presentation renders only role colors/generated status and the gradient boolean. Version `0.2.1` retains the exact treatment mechanism and outputs while correcting carry identity to the exact rendered payload. The `0.2.0` artifact remains historical execution evidence and is not review-authorized.

The canonical `region-graph-0.19.0` result is a controlled comparator with accumulated review evidence. It is not an output oracle, an incumbent supplied to the treatment solver, or a requirement that changed roles remain frozen. The experiment may recover broad corrections to known canonical defects, but every such change requires fresh review.

The experiment identity is:

`region-graph-0.19.0-scale-aware-native-0.2.1-development`

## Reviewed Basis

The raw native experiment changed only the extraction raster. Its 25-pair review produced 13 canonical preferences, 5 raw-native preferences, and 7 ties; canonical was shippable in 25 cases and raw native in 21. The exact raw-native treatment therefore stopped.

The review supports two mechanism observations without making canonical output ground truth:

1. Native candidate colors can improve a palette. All five raw-native preferences retained coherent fields and gradients; three changed one role and two changed two roles.
2. Native observation scale is unsafe for the existing evidence formulas. None of six gradient flips won, and all four raw-native-only shippability failures involved gradient or broad field-role instability.

Individual output labels may validate that the new mechanism no longer reproduces a known failure. They cannot select thresholds, freeze canonical roles, or authorize promotion.

## Hypothesis

Candidate identity and evidence scale are separate concerns.

- Candidate identity, candidate masks, family membership, and emitted RGB should come from the decoded native raster.
- Spatial, typography, saliency, background, component, and gradient evidence should be evaluated on a declared normalized observation lattice.
- Role selection should run afresh over those native identities with normalized evidence.

This preserves native source colors without asking pixel-neighbor and connected-component formulas tuned around 224-scale observations to operate directly on a multi-megapixel lattice.

## Inputs

For each source, decode two views with the same Sharp `0.33.5` orientation, white alpha-flattening, sRGB, three-channel uchar policy:

| View | Dimensions | Authority |
| --- | --- | --- |
| Native source | Decoded dimensions, at most `2,100,000` pixels | Candidate identities, masks, families, exact emitted RGB |
| Observation | Existing max-edge `224`, Lanczos3, no enlargement | Region graph, projected candidate evidence, gradients, role scoring |

The 224 value is an observation scale inherited from the current evidence calibration. It does not import canonical candidates, canonical roles, or canonical palette choices into treatment inference.

## Native Candidate Universe

Run `analyzeRegions(native)` and `buildCandidateContext(nativeAnalysis, 12, true, { stableFamilyAnchors: true })`.

Freeze:

- each candidate ID, native mask, exact native representative index and RGB;
- native family membership and anchor ID;
- typography-only status;
- native dimensions and source identity.

Every emitted non-generated role RGB must equal the three native source bytes at its frozen representative index. Principal non-typography candidate masks must form an exact native partition.

No canonical candidate is appended or privileged. Native candidates are not matched to canonical candidates during treatment inference.

## Exact Projection

Project the frozen principal native candidate partition onto the exact dimensions emitted by the frozen Sharp max-edge observation decode. Validate no enlargement, a maximum edge of 224 for larger sources, exact identity dimensions for smaller sources, and at most one target-pixel aspect-ratio rounding error; do not replace Sharp's dimension decision with an independently rounded formula.

For target cell `(u,v)`, use the rational native footprint:

```text
x in [u*W/Tw, (u+1)*W/Tw)
y in [v*H/Th, (v+1)*H/Th)
```

Split each axis interval into at most three exact weighted native-pixel segments using the existing `exactAxisSegments` contract. Query candidate mask counts through a `Uint32Array` summed-area table. The exact covered-area numerator is the sum of at most nine rectangle counts multiplied by the x/y overlap numerators.

Assign the target cell to the principal candidate with greatest covered area. Exact ties choose lower frozen candidate ID. Require every target cell to receive exactly one label and every retained principal candidate mask to be derivable from that label plane.

Typography-only masks are overlays rather than members of the principal partition. Project each overlay independently and activate a target cell only when its exact native covered area is at least half of the target footprint. The half threshold is a predeclared majority rule, not a corpus-tuned parameter. A zero-cell typography overlay remains available diagnostically but is excluded from role solving.

## Observation Evidence

Run the unchanged `analyzeRegions` implementation on the exact 224 observation raster.

For each projected candidate mask, recompute:

- population;
- background, saliency, and text as mask-weighted means of observation-region values;
- region IDs;
- components, side coverage, field, detail, and frame through unchanged `spatialEvidence`;
- family spatial evidence from the union of projected principal member masks.

Retain the native candidate RGB/Lab/chroma and native family membership. Do not use native population, native saliency, native text, or native component topology as solver evidence.

## Fresh Inference

Run treatment inference without a canonical incumbent:

1. `solveGuardedPalette(projectedNativeCandidates, observationAnalysis)` creates the treatment's own initial spatial palette.
2. `solveJointPalette(projectedNativeCandidates, observationAnalysis, treatmentGuardedPalette)` performs the unchanged complete joint-role search relative to that treatment-native incumbent.
3. Pair-specific and smooth gradient evidence uses only `observationAnalysis`.

The canonical palette is never supplied to either treatment solver. Existing contrast, role-distance, generated foreground, surface, accent, gradient, Pareto, and tie rules remain unchanged.

The primary endpoint is the treatment spatial palette. Canonical expressive and quantized methods remain frozen controls under this identity and are not review endpoints.

## Structural Gates

Every source must satisfy:

- native and observation bounds and byte identities;
- exact principal native partition;
- exact projected target partition;
- exact native representative membership and bytes;
- finite candidate and family evidence;
- unique candidate IDs and valid family IDs;
- no projected role-solving candidate with zero population;
- no non-generated emitted color outside native source occupancy;
- existing foreground, accent visibility, role-distance, and in-gamut hard gates;
- deterministic output for identical bytes;
- child timeout `120,000` ms and maximum RSS `1,073,741,824` bytes.

Any failure invalidates the run.

## Pre-Review Diagnostics

The complete 37-source development result records comparisons against both canonical and stopped raw-native outputs. These are diagnostics, not scalar quality targets.

Before preparing review:

1. All structural gates must pass.
2. The six previously reviewed raw-native gradient flips must be reported explicitly. Reproducing one is not an automatic rejection because endpoint candidates may legitimately change, but every reproduction enters the review queue regardless of role-distance threshold.
3. The four previously raw-native-unshippable cases must all enter the review queue unless the treatment exactly equals canonical. Exact equality carries only the prior canonical shippability judgment; no preference is carried.
4. Report role churn, candidate availability, gradient transitions, and resource use without an aggregate winner score.

No threshold or policy may change after inspecting this identity's outputs.

## Review

If all structural gates pass, prepare a new blinded spatial-palette comparison against exact canonical `region-graph-0.19.0`.

The immutable artifact namespace is:

`research/data/experiments/region-graph-0.19.0-scale-aware-native-0.2.1-development/`

The review identity is `scale-aware-native-spatial-pair-review-v2`.

The completed raw-native response may carry only when the exact rendered treatment payload is identical to the reviewed raw-native payload: all four role RGB values, hex values, generated flags, and the gradient `isGradient` boolean. The canonical comparison palette, source hash, and presentation version must also be identical. Hidden scores, continuous metrics, source distances, and gradient confidence fields are not presentation inputs and do not block a carry. Carrying remaps the recorded side-dependent response onto explicit canonical/treatment identities and binds the predecessor feedback ID and pair hash. Perceptual similarity is insufficient. No response carries onto a visually new treatment palette.

A review pair is required when:

- any spatial role differs by more than `0.025` OKLab;
- generated status changes;
- gradient `isGradient` differs;
- the source is one of the four prior raw-native-unshippable cases and treatment is not exactly canonical; or
- the treatment reproduces one of the six prior raw-native gradient flips.

After exact carries are removed, side assignment for every novel pair is newly derived from the new scientific identity. Prior raw-native responses are not displayed. The response schema remains independent preference plus per-side shippability, fixed reasons, and optional note.

This development review may reject the mechanism or authorize a separately frozen validation experiment. It cannot promote canonical output.
