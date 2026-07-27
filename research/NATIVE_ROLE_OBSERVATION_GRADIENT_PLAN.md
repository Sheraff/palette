# Native Role / Observation Gradient Palette Plan

Status: frozen for `region-graph-0.19.0-native-role-observation-gradient-0.3.0-development` implementation and development evaluation.

## Decision Context

- Raw native extraction `region-graph-0.19.0-native-resolution-0.1.1-development` was stopped after blinded review: canonical was preferred 13 times, treatment 5 times, with 7 ties; canonical was shippable in 25/25 pairs and treatment in 21/25.
- Two of the four raw-native treatment failures had explicit and opposite gradient errors: `birdsofprey.jpg` missed a gradient and `krafty.jpg` emitted an unnecessary gradient.
- Full scale-aware inference `region-graph-0.19.0-scale-aware-native-0.2.1-development` reduced six raw-native gradient disagreements to one, but was also stopped: canonical was preferred 12 times, treatment 6 times, with 6 ties; canonical was shippable in 23/24 reviewed pairs and treatment in 19/24.
- The scale-aware treatment introduced role-allocation regressions in previously shippable native outputs, including `horrorwood.jpg` and `infected.jpg`.
- Exhaustive foreground counterfactual diagnostics over all 24 reviewed scale-aware pairs found that three of five unshippable treatments had no feasible foreground replacement with the other roles frozen. Foreground evidence distributions also overlapped substantially between failed and successful treatments. A foreground-only admission threshold is therefore not identified by the evidence.
- The canonical 224 palette is a comparator, not an oracle. No canonical role color or canonical palette decision may enter treatment inference.

## Hypothesis

Native-scale evidence is useful for source-exact candidate identity and complete role allocation, while native raster density is specifically unreliable for gradient classification. Recomputing only the selected native background/surface gradient relation on a bounded 224-scale observation raster should correct the demonstrated density-dependent gradient errors without introducing the role churn caused by full scale-aware reinference.

This is a strict responsibility split:

- native raster: candidate discovery, families, role allocation, role colors, role score, role metrics, expressive palette, and quantized palette;
- 224 observation raster: only the spatial palette's gradient evidence for the already-selected native background and surface colors.

## Frozen Treatment

1. Decode the source at native resolution with the existing Sharp `0.33.5` native contract and 2,100,000-pixel bound.
2. Run the unchanged `region-graph-0.19.0` extraction pipeline on that native raster.
3. Decode the same source independently with the canonical bounded observation contract: orientation normalization, white flattening, sRGB conversion, Lanczos3 resize inside a 224-pixel maximum edge without enlargement, alpha removal, and raw unsigned 8-bit RGB output.
4. Run `analyzeRegions` directly on the observation raster. Do not run canonical palette extraction as part of treatment inference.
5. Resolve the native spatial palette's selected background and surface RGB values against the native extraction candidate universe by exact RGB equality. At least one exact source candidate must exist for each endpoint. RGB aliases are equivalent for gradient computation because their RGB and OKLab coordinates are identical.
6. If selected background and surface RGB values are equal, emit the frozen flat evidence `{ isGradient: false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 }`.
7. Otherwise run the unchanged `detectGradient` relation over the selected native endpoints and the 224 observation `RegionAnalysis`, including its existing smooth-gradient fallback.
8. Emit the native extraction unchanged except for:
   - the algorithm version;
   - spatial gradient evidence replaced by step 6 or 7;
   - processing time updated to cover both domains.
9. Preserve native spatial role colors, generated flags, source distances, score, and metrics exactly. The metrics are role-color metrics and contain no gradient field.
10. Preserve native expressive and quantized methods exactly.

## Prohibited Inputs And Decisions

- No canonical 224 role color, palette, candidate assignment, gradient decision, score, or metric may enter treatment inference.
- No full scale-aware role inference, projected role score, canonical-relative dominance, pair-specific feedback branch, filename branch, postselection role fallback, or review-label branch is allowed.
- No role may be changed in response to observation evidence.
- No generated field endpoint or unmatched native field endpoint may be silently accepted.

## Required Certificate

Each extraction records:

- treatment, native baseline, native decode, and observation policy identities;
- encoded source SHA-256 plus decoded native and observation raster SHA-256 identities;
- exact native candidate IDs matching each selected field endpoint;
- native and observation gradient evidence;
- whether the gradient decision or any gradient evidence field changed;
- invariants proving native spatial roles, score, metrics, expressive method, and quantized method were preserved;
- an explicit `canonicalRoleColorsUsed: false` invariant.

## Structural Evaluation

Run all 37 development sources in isolated child processes with:

- a 120-second per-source timeout;
- a 1 GiB maximum RSS gate;
- exact source identity checks;
- exact native-role preservation checks against a fresh native extraction;
- exact native-source checks for every non-generated spatial role;
- the established spatial hard gates;
- comparison to the frozen canonical and raw-native artifacts only after treatment output is complete.

Report at minimum:

- sources materially changed from canonical, raw native, and scale-aware native;
- exact role changes from raw native, which must be zero;
- gradient evidence and decision changes from raw native;
- canonical gradient disagreements;
- hard-gate violations;
- review-eligible sources;
- maximum child elapsed time and RSS.

## Development Stop / Review Gates

Stop without review if any of these occurs:

- any raw-native spatial role color, generated flag, source distance, score, or metric changes;
- expressive or quantized output changes from fresh native extraction;
- any non-generated spatial role is not an exact native source pixel;
- any treatment inference dependency uses canonical palette output;
- any hard-gate violation occurs;
- either known raw-native gradient error remains unchanged;
- more canonical gradient disagreements are emitted than the scale-aware predecessor's one disagreement;
- resource limits are exceeded.

If all gates pass, prepare a blinded review only for pairs not already covered by an exact rendered canonical/treatment pair with valid prior feedback. Exact pairs may carry prior feedback by source hash, role colors, generated flags, gradient evidence, renderer identity, and pair hash. Do not infer a preferred target from the canonical comparator.

## Advancement Rule

This development identity advances only if blinded evidence shows that observation-scale gradient correction improves the raw-native treatment without reducing treatment shippability. Exact output carries are valid evidence; novel gradient pairs require fresh review. Preference is secondary to shippability and explicit gradient-error correction.
