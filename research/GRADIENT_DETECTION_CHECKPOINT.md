# Gradient Detection Checkpoint

## Status

Gradient promotion work is paused. Canonical extraction remains `region-graph-0.17.0`; `src/extract.ts` still exports that version, and no topology or eligibility experiment changes canonical output.

Branch context when this checkpoint was written:

- Branch: `research/palette-0.9-checkpoint`
- Canonical HEAD: `12eaeeb` (`Promote reviewed palette algorithm 0.17`)
- Frozen topology runtime: `gradient-field-topology-model-3.0.0-dev`
- Research wrapper: `gradient-field-topology-model-3.0.0-experimental`
- Frozen selected variant: G, `unified-owned-continuity`

The wrapper evaluates only canonical gradients, resolves the canonical directed background/surface pair by unique exact RGB matches, and never promotes a canonical flat palette. Topology v3 is a frozen research baseline, not a canonical replacement.

## Evidence Classes

Keep these categories separate in every future report:

| Class | Meaning |
| --- | --- |
| Development | Music and previously inspected/reviewed batches used to design or select a rule. Fit and LOBO metrics are development diagnostics. |
| Enriched validation | Frozen evaluation on selected disagreement, removal, retained, or threshold strata. It describes those selected cases, not prevalence. |
| Repeat-label consistency | Re-review of an already labeled exact pair. It measures stability and UI behavior, not independent generalization. |
| Qualitative impression | Reviewer commentary without a stored per-case label. It cannot be counted as a label. |
| Unlabeled | No stored response. Visible behavior or a favorable gallery impression is not evidence of correctness. |

No result below is a population-accuracy estimate. The numbered batches are temporal review batches, not known source-population cohorts.

## Canonical Baseline

Canonical 0.17 jointly enumerates feasible four-role tuples against the reviewed 0.16 incumbent. It preserves the incumbent unless a constrained complete-role replacement improves the declared structural objectives. The accepted 100-palette development-facing corpus currently contains 95 shippable and 5 unshippable palettes.

Canonical gradient detection combines endpoint paths with broad smooth low-frequency color variation. The eligibility and topology branches only test whether the already selected directed background/surface pair should remain a gradient. They do not select another pair or repair role assignment.

## Gradient Eligibility Chronology

### 0.1: Pair-Specific Diagnostic and Pilot

The 3,504-family music corpus contained 1,327 canonical gradients. Version 0.1 generated pair-specific evidence and a 24-case review: 16 reviewed gradients, 7 flat-background/isolated-surface false positives, and 1 uncertain case. The earlier pair detector retained only 11/16 gradients and rejected only 2/7 flats. The initial hypothesis was that endpoint-spanning color-path continuity plus flat-background/isolated-surface risk could replace the global smooth fallback.

### 0.2-0.5: Continuity, Occlusion, and Endpoint Dominance

- 0.2 required complete connected core-bin continuity and rejected flat-background/isolated-surface risk at `0.4`; it fit all 23 decisive pilot labels.
- 0.3 relaxed connected continuity to 13/14 bins while requiring at least `0.05` endpoint-spanning component share.
- 0.4 added an occlusion-tolerant disconnected path with 13/14 global bins, intermediate share at least `0.4`, and linear ordering at least `0.4`.
- 0.5 limited the flat-background veto to endpoint-dominated paths with intermediate share below `0.4`.

The hypothesis evolved from strict connectedness to pair-specific continuity that could tolerate an occluding subject without accepting a narrow object-local path.

### 0.6-0.7: Targeted Positives and Fresh Evidence

The targeted `birdsofprey`, `doja`, `muse`, and `nada` pairs were judged gradients; the first three were high confidence and `nada` low confidence. Version 0.6 lowered the endpoint-distance floor to `0.025`, relaxed the occlusion path, and narrowed the flat-background veto. Version 0.7 lowered connected continuity to 11/14 bins.

Initial 0.6/0.7 music counts were invalid because they reused evidence from before the endpoint-floor change. Evidence versioning and stale-evidence rejection were then added. Fresh 0.7 evidence retained 1,205/1,327 music gradients, all 13 reviewed development gradients, and 158/166 development-facing holdout gradients. A 41-response changed-palette review contained 5 gradient, 21 flat, and 15 either-way labels; 9 cases remained intentionally unlabeled.

### 0.7 Independent `01/` Failure

The frozen 0.7 candidate vetoed 14 of 157 canonical gradients in `01/`. Review yielded 8 flat, 1 gradient, 2 either-way, and 3 no-visible-difference outcomes. The one decisive gradient rejection failed the predeclared zero-false-removal rule.

### 0.8 and Independent `02/`

Version 0.8 added a nonlinear broad-field exception for the `01/` false removal and fit 62 accumulated decisive exact-pair labels. Frozen 0.8 then passed the narrow `02/` changed-case protocol: among 16 vetoes, review found 6 flat, 8 either-way, 2 no-visible-difference, and no gradient preference.

That pass did not establish retained precision. The broader music audit recorded one explicit false removal and 102 retained submissions: 43 gradient, 37 flat, and 22 either-way. Promotion was rejected. The hypothesis that changed-case removal safety was sufficient was closed.

### 0.8.1: Sparse Progressive-Field Veto

Version 0.8.1 added a coherent nonlinear recovery and a sparse progressive-field veto. A broader rule caught more reviewed flats but caused larger corpus movement and native-variant instability; the narrower three-signal rule caught 20/37 reviewed false retentions while changing none of the submitted gradient or either-way labels. The 105-case delta queue received 27 individual labels: 22 flat and 5 either-way. The remaining 78 repetitive physical-media cases were described qualitatively and correctly remained unlabeled.

### 0.8.1 Independent `03/` Failure

The `03/` protocol included all 163 canonical gradients. Review stopped after position 64 to avoid an oversized task. There were 59 individual decisions: 27 gradient, 8 flat, and 24 either-way; 5 additional pairs were unidentifiable, and positions 65-163 were unreviewed. Two of six reviewed removals required a gradient, while 6/31 decisive retained cases required flat treatment (`19.35%`), above the predeclared `10%` ceiling.

### 0.8.2-0.8.4: Narrow Development Repairs

- A separate 0.8.2 geometry diagnostic did not safely separate the remaining errors and was rejected.
- Eligibility 0.8.2 added four narrow branches for broad ordered fields, high-separation paths, weak disconnected paths, and fragmented connected paths. Across 206 decisive labels it moved to 97 true gradients, 90 true flats, 19 false retentions, and no false removals.
- A 25-case follow-up found no gradient among 13 removals and found 8 gradient, 2 flat, and 2 either-way among 12 retained cases.
- 0.8.3 added a two-border-flat-field veto. Across 237 decisive labels it had 118 true gradients, 98 true flats, 21 false retentions, and no false removals. In 114 reviewed round-3 cases, the retained flat rate was 4/52 (`7.69%`).
- 0.8.4 added a sparse connected-path veto fitted to one retained street-photo error. Across the same 237 decisive labels it had 118 true gradients, 99 true flats, 20 false retentions, and no false removals.

These were development fits, not independent promotion results.

### Independent `04/`, `05/`, and `06/` Failures

| Frozen candidate | Review population | Removal responses | Failure |
| --- | --- | --- | --- |
| 0.8.4 on `04/` | 145 canonical gradients; 14 removals | 6 flat, 2 gradient, 2 either-way, 3 no-visible-difference, 1 unidentifiable | Two false removals. |
| 0.8.5 on `05/` | 159 canonical gradients; 16 removals | 5 flat, 2 gradient, 5 either-way, 2 no-visible-difference, 2 unidentifiable | Two false removals. |
| 0.8.6 on `06/` | 141 canonical gradients; 14 removals | 4 flat, 2 gradient, 5 either-way, 2 no-visible-difference, 1 unidentifiable | Two false removals. |

Versions 0.8.5 and 0.8.6 each recovered the preceding round's two gradients without changing known flat or nondecisive labels, but the next independent round produced two new false removals. Across the three rounds, 44 reviewed removals contained 15 clear flat fixes, 6 false removals, 19 neutral responses, and 4 unidentifiable pairs.

The supplemental `06/` retained sample contained 11 gradient, 5 flat, 7 either-way, and 2 unidentifiable responses. Only 16 were decisive, below the 20-case target, and 5/16 decisive retained cases were flat (`31.25%`). Frozen 0.8.6 therefore failed both removal safety and the supplemental retained rule. Across all 274 accumulated decisive labels it had 133 true gradients, 114 true flats, 25 false retentions, and 2 false removals.

## Why Narrow Threshold Fitting Closed

The sequence did not converge. A narrow recovery repaired the observed failures while another independent temporal batch exposed new ones. Removal-only review optimized one side; retained review then showed substantial false retention. Pair identifiability and upstream role defects limited label meaning. More threshold exceptions would consume reserve data while increasing branch complexity without adding a feature that explains the conflict.

The closed direction is narrow threshold and exception fitting over the existing eligibility evidence. A future gradient hypothesis must add predeclared ranking evidence, retain the fixed contrasts, avoid batch-specific parameters, and be evaluated only after role extraction improves.

## Topology V1-V3

### Shared Registry

All three generated development artifacts contain the same 412 exact directed pairs: 135 gradient, 139 flat, 111 either-way, 15 no-visible-difference, 11 unidentifiable, and 1 uncertain. Only the 274 decisive gradient/flat labels enter binary fitting. Music and batches 00-06 are temporal development evidence; their differences are not source-population definitions.

### V1: Original Structural Diagnostic

V1 used the original color-distance-difference support representation with six oriented features: endpoint support, mass distribution, topology, progression, field ownership, and `1 - objectLocality`. Its generated fit did not use fold standardization. Pooled leave-one-batch-out sensitivity, specificity, balanced accuracy, and AUC were `0.9556`, `0.6115`, `0.7835`, and `0.9307`.

V1 remained conditional on the selected pair and candidate-derived ownership/locality. It did not validate candidate availability, role correctness, or complete-palette quality. Its large generated development and fit files are historical diagnostics, not runtime or promotion artifacts.

### V2: Projected Pair Geometry

V2 replaced the earlier pair coordinate with orthogonal projection onto the exact background-surface segment, introduced absolute pair coverage and intermediate extent, reciprocal endpoint connectivity, held-out linear/quadratic progression, and training-fold standardization. It retained candidate-dependent field ownership and adverse object locality in the six-feature model.

Its pooled leave-temporal-batch-out sensitivity, specificity, balanced accuracy, and AUC were `0.9704`, `0.3309`, `0.6507`, and `0.8330`. High sensitivity came with 93 false positives among 139 decisive negatives. Candidate-dependent ownership also made the structural decision sensitive to upstream candidate metadata. V2's large generated artifacts are historical diagnostics.

### V3: Candidate-Independent Ownership

V3 keeps exact segment projection. For pixel color `p`, background `b`, surface `s`, and endpoint vector `d = s - b`:

```text
u = clamp(dot(p - b, d) / dot(d, d), 0, 1)
w = exp(-(residual / (sqrt(0.03) * endpointDistance))^2)
intermediateWeight = w * 4 * u * (1 - u)
surfaceWeight = w * u^2
```

Important active quantities are:

```text
distributionContinuity = sqrt(normalizedEntropy * middleMassShare)
intermediateExtent = clamp((3 / 2) * sum(intermediateWeight) / pixelCount, 0, 1)
topology = intermediateExtent * rootedConnectivity
connectedIntermediateContinuity = sqrt(rootedConnectivity * intermediateExtent)
surfaceRoleOwnership = sqrt(surfaceBackgroundAffinity * intermediateLowObject)
spatialFieldOwnership = softOR(areaSpan, oppositeSideSpan)
fieldOwnership = softOR(spatialFieldOwnership, surfaceRoleOwnership)
progression = intermediateExtent * max(heldOutLinearFit, heldOutQuadraticFit)
softOR(a, b) = 1 - (1 - a) * (1 - b)
```

Candidate-derived ownership and object-locality values remain only under `legacyDiagnostics`. Active ownership is candidate-metadata invariant. Tests cover broad directional and radial fields, object-local ramps, unrelated backgrounds, endpoint swapping, rotation/resize, spatially rearranged equal histograms, sparse ownership, and equal-lightness chromatic fields.

## Constrained Variants A-H

All geometric means are exact-zero-preserving `sqrt(x * y)` with no epsilon. `ownedProgression` is `fieldOwnership * max(linearFit, nonlinearFit)`. `ownedConnectivity` is `fieldOwnership * rootedConnectivity`.

| ID | Name | Ordered features | Shippable | Pooled sensitivity | Balanced accuracy | AUC |
| --- | --- | --- | --- | ---: | ---: | ---: |
| A | `positive-structural` | mass distribution, topology, progression, field ownership | yes | 0.9704 | 0.7658 | 0.8909 |
| B | `owned-structural` | distribution continuity, owned progression, owned connectivity | yes | 0.9630 | 0.7872 | 0.9173 |
| C | `role-spatial` | distribution continuity, progression, topology, surface-role ownership, spatial ownership | yes | 0.9407 | 0.8157 | 0.9363 |
| D | `legacy-proxy-benchmark` | distribution continuity, connected intermediate continuity, legacy candidate surface ownership | no | 0.9556 | 0.8015 | 0.9174 |
| E | `owned-all` | `sqrt(distributionContinuity * fieldOwnership)`, owned progression, owned connectivity | yes | 0.9630 | 0.8196 | 0.9285 |
| F | `separate-owned-modes` | surface-owned continuity, spatial-owned continuity, owned progression, owned connectivity | yes | 0.9556 | 0.8231 | 0.9346 |
| G | `unified-owned-continuity` | soft-OR of surface/spatial owned continuity, owned progression, owned connectivity | yes | 0.9630 | 0.8304 | 0.9239 |
| H | `unified-only` | unified owned continuity | yes | 0.9481 | 0.8554 | 0.9311 |

The predeclared rule selected the highest pooled balanced accuracy among shippable variants with sensitivity at least `0.95`, then AUC, then fewer features. H had the highest balanced accuracy but missed the sensitivity gate. G was selected. D was diagnostic and never selectable.

## Frozen V3 Identity

```text
modelVersion = gradient-field-topology-model-3.0.0-dev
variant = unified-owned-continuity
evidenceVersion = gradient-field-topology-evidence-3.0.0-dev
feature order = [unifiedOwnedContinuity, ownedProgression, ownedConnectivity]
intercept = -0.03878414572829437
coefficients = [2.0957691140229535, 0.5506220479091976, 0]
means = [0.5745412789598641, 0.2564454338897794, 0.21306668557921601]
scales = [0.22765616962247104, 0.2006111505833459, 0.1637037677760149]
rawEquivalentIntercept = -6.031798096253494
rawEquivalentCoefficients = [9.205852481390815, 2.74472304409837, 0]
threshold = 0.25629320384844717
decision = score >= threshold
trainingArtifactSha256 = 2722e5a99b8b218b3d28c975f5ae00624862420acae790da71f2cadfa3ec1983
fittingConfigSha256 = ea380df441f2473b2ad2ee18db7954cf10844019af95c6e74f968a008d559dc4
parameterSha256 = 98d0a0d89e83d1e66a211c05557db74467f13bf4cb1d99766a650f29178fbc11
fitArtifactSha256 = 1c25b02de70e38307ae4763757047adac38b5959e7dec656c248a3a697c42f71
runtimeScorerSha256 = 0ec901a4dde9a88e6ae0ce3dc5fb5587a726aea69ef5da023059a27e84a6b09c
topologyEvidenceSha256 = f4458249198161d920603d0a8c7f10c32e7f2164611cd5286c702850668a5237
```

Exact active feature formulas are:

```text
unifiedOwnedContinuity =
  1 - (1 - sqrt(distributionContinuity * surfaceRoleOwnership))
      * (1 - sqrt(distributionContinuity * spatialFieldOwnership))
ownedProgression = fieldOwnership * max(linearFit, nonlinearFit)
ownedConnectivity = fieldOwnership * rootedConnectivity
```

The sigmoid output is a balanced-prior discrimination score, not a calibrated prevalence probability.

## V3 Development and LOBO Metrics

Final all-development fit over 274 decisive labels:

| Sensitivity | Specificity | Balanced accuracy | AUC |
| ---: | ---: | ---: | ---: |
| 0.9556 | 0.7698 | 0.8627 | 0.9371 |

Leave-one-temporal-review-batch-out diagnostics for selected G:

| Group | Positive | Negative | Sensitivity | Specificity | Balanced accuracy | AUC |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Music development batch | 65 | 86 | 1.0000 | 0.6628 | 0.8314 | 0.9394 |
| Temporal batch 03 | 48 | 18 | 1.0000 | 0.4444 | 0.7222 | 0.8819 |
| Pooled temporal batches 04-06 | 17 | 20 | 0.8235 | 0.9000 | 0.8618 | 0.8971 |
| All decisive | 135 | 139 | 0.9630 | 0.6978 | 0.8304 | 0.9239 |

These are development robustness diagnostics over adaptively accumulated temporal labels. They are not population metrics.

## `07/` Enriched Review

The `07/` protocol froze canonical 0.17, topology v3, threshold, runtime scorer, old 0.8.6 comparator, source inventory, and review rendering before corpus access. It reviewed exactly 25 canonical-gradient exact pairs selected across disagreement, control, and near-threshold strata. Selection was intentionally prediction-enriched.

There were 9 decisive and 16 nondecisive responses. V3 was correct on 8/9 decisive pairs; 0.8.6 was correct on 6/9. There were three paired improvements and one paired regression. This is change-focused validation for the exact selected pairs, not a population estimate. `07/` is consumed.

## Music Repeat Consistency

The blinded repeat study sampled 25 already labeled music pairs with fixed historical-label allocation and deliberate disagreement/margin enrichment. It produced:

- 21 exact five-way repeats.
- Agreement on all 17 pairs decisive both times.
- No gradient-to-flat or flat-to-gradient flips.
- Three historical decisive labels becoming nondecisive.
- All six historically flat cases selected because V3 retained them were judged flat again.
- V3 correctness of 13/20 historical decisive labels and 11/17 repeat-decisive labels in this hard sample.

Reviewer drift therefore does not explain the central hard-sample conflict. This remains repeat-label consistency evidence, not independent validation.

## Exposed `images/` Diagnostic

The mechanical diagnostic covered all 34 unsuffixed supported base artworks. Canonical 0.17 marked 13 as gradients; V3 retained 11. The reviewer reported that the exposed results looked very good overall but submitted only one exact label. `muse.jpg` was judged gradient while V3 selected flat. This is one confirmed false removal. The other 33 cases remain unlabeled; the qualitative impression cannot be counted as 33 correct results.

## Fixed Hard Contrast Suite

The redesign suite contains ten exact development contrasts.

Positive targeted pairs:

- `birdsofprey.jpg`
- `doja.jpg`
- `muse.jpg`
- `nada.jpg`

Twice-confirmed music flats:

- `gc-0fe57ca77f27b6cf9b12`
- `gc-535b0c12c20aed0d9863`
- `gc-b99827ae221843eb0578`
- `gc-c79a6d529180b9fdd5c9`
- `gc-d67d2a270d9ef853e69b`
- `gc-e518f46ad5348fac5ad9`

A future feature hypothesis must separate these cases without filename, batch, or threshold exception branches.

## Why No Current Variant or Composition Promotes

G wins the predeclared development selection but still retains all six reaffirmed music flats in the hard repeat sample and removes `muse.jpg` in the exposed diagnostic. H improves the hard music sample but removes both `muse.jpg` and `nada.jpg`. Tested pairwise unions and intersections of A-H do not solve the conflict: compositions preserving all four targeted positives repair at most one of the six reaffirmed flats and introduce other false retentions.

The `07/` result is favorable but enriched and only 9 cases were decisive. Music repeats show stable labels rather than drift. The images set is almost entirely unlabeled. None of these evidence classes supports a population claim or canonical promotion. The remaining conflict points to missing ownership/ranking evidence and upstream role selection, not one more threshold.

## Important Files

### Canonical and Historical Eligibility

- `src/extract.ts`: canonical 0.17 extraction context and version.
- `src/gradient-eligibility.ts`: frozen 0.8.6 evidence and decision logic.
- `src/gradient-eligibility-extract.ts`: research-only 0.8.6 wrapper.
- `GRADIENT_ELIGIBILITY.md`: complete 0.1-0.8.6 chronology.
- `GRADIENT_ELIGIBILITY_VALIDATION*.md`: predeclared sealed protocols.

### Topology V3 Runtime

- `src/gradient-field-topology.ts`: frozen v3 evidence and structural diagnostics.
- `src/gradient-field-topology-model.ts`: exact frozen G scorer and identity.
- `src/gradient-field-topology-extract.ts`: research-only canonical-gradient wrapper and certificate.
- `prepare-gradient-field-topology-development.ts`: provenance-bound 412-pair registry generator.
- `fit-gradient-field-topology-model.ts`: deterministic A-H fitter and selection.

### Tests

- `tests/gradient-field-topology.test.ts`: structural and metamorphic evidence tests.
- `tests/gradient-field-topology-model.test.ts`: exact model identity, formula, score, threshold, and validation tests.
- `tests/gradient-field-topology-extract.test.ts`: canonical-flat, directed endpoint, certificate, and output-preservation tests.
- `tests/gradient-eligibility.test.ts` and `tests/gradient-eligibility-extract.test.ts`: historical eligibility behavior.

### Generated Artifacts

- `data/experiments/gradient-field-topology-1.0.0-development.json`
- `data/experiments/gradient-field-topology-1.0.0-fit.json`
- `data/experiments/gradient-field-topology-2.0.0-development.json`
- `data/experiments/gradient-field-topology-2.0.0-fit.json`
- `data/experiments/gradient-field-topology-3.0.0-development.json`
- `data/experiments/gradient-field-topology-3.0.0-fit.json`

V1 and V2 are large historical diagnostics. V3 is the frozen research baseline. Generated JSON must be recreated by its generator rather than manually edited.

### Review Workflows

- `GRADIENT_FIELD_TOPOLOGY_VALIDATION_3.md` and `prepare-gradient-field-topology-07-review.ts`
- `GRADIENT_FIELD_TOPOLOGY_MUSIC_REPEAT_REVIEW_3.md` and `prepare-gradient-field-topology-music-repeat-review.ts`
- `GRADIENT_FIELD_TOPOLOGY_IMAGES_DIAGNOSTIC_3.md` and `prepare-gradient-field-topology-images-diagnostic.ts`
- Corresponding dedicated renderers, local-only servers, and analyzers under `research/`

## Stable Commands

From the repository root:

```sh
pnpm research:test
pnpm exec tsc -p research/tsconfig.json
NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/tests/gradient-field-topology*.test.ts
```

Development and fit generators refuse overwrite; use a deliberate new output path for verification:

```sh
NODE_NO_WARNINGS=1 node --experimental-strip-types research/prepare-gradient-field-topology-development.ts <output.json>
NODE_NO_WARNINGS=1 node --experimental-strip-types research/fit-gradient-field-topology-model.ts <output.json>
```

Frozen workflow entry points expose their own bound paths and modes:

```sh
NODE_NO_WARNINGS=1 node --experimental-strip-types research/prepare-gradient-field-topology-07-review.ts seal
NODE_NO_WARNINGS=1 node --experimental-strip-types research/prepare-gradient-field-topology-07-review.ts prepare
NODE_NO_WARNINGS=1 node --experimental-strip-types research/prepare-gradient-field-topology-07-review.ts analyze <feedback.json> <review-interpretation.json> <analysis.json>

NODE_NO_WARNINGS=1 node --experimental-strip-types research/prepare-gradient-field-topology-music-repeat-review.ts seal
NODE_NO_WARNINGS=1 node --experimental-strip-types research/prepare-gradient-field-topology-music-repeat-review.ts prepare
NODE_NO_WARNINGS=1 node --experimental-strip-types research/prepare-gradient-field-topology-music-repeat-review.ts analyze <feedback.json> <review-interpretation.json> <analysis.json>

NODE_NO_WARNINGS=1 node --experimental-strip-types research/prepare-gradient-field-topology-images-diagnostic.ts prepare
NODE_NO_WARNINGS=1 node --experimental-strip-types research/prepare-gradient-field-topology-images-diagnostic.ts analyze <feedback.json> <analysis.json>
```

Do not rerun a sealed workflow merely to obtain a fresh timestamp. Preserve the bound artifacts and use a new named experiment for a changed candidate.

## Corpus Status

The numbered `00/` through `0b/` batches are theoretically uniform temporal samples from the deployment artwork source, but finite sampling, source delivery, adaptive review, and reviewer drift may differ over time.

| Corpus | Current use |
| --- | --- |
| Music | Development and repeat-consistency evidence. |
| `00/` | Development-facing palette validation and gradient development evidence. |
| `01/` | Independent negative evidence for 0.7; later development for changed candidates. |
| `02/` | Narrow independent pass for exact 0.8, followed by a failing broader music audit; later development. |
| `03/` | Partial independent negative evidence for 0.8.1; later development. |
| `04/` | Independent negative evidence for 0.8.4; later development. |
| `05/` | Independent negative evidence for 0.8.5; later development. |
| `06/` | Independent negative evidence for 0.8.6; consumed. |
| `07/` | Prediction-enriched validation for frozen topology v3; consumed. |
| `08/`-`0b/` | Untouched reserves. |

No future workflow may inspect a reserve before the candidate, protocol, source exclusions, rendering, runtime, and hashes are frozen.

## Resume After Role Extraction Improves

1. Freeze and version the improved candidate-availability and role-assignment implementation.
2. Attribute every changed hard case to candidate availability, role assignment, role collapse, accessibility, or conditional gradient behavior.
3. Run complete-palette development review with swatch, role, `colornames-oklab` `closest()` name, and hex for every role. Names are versioned communication metadata only and cannot enter algorithmic features, optimization, labels, or identity hashes.
4. Preserve existing gradient labels only for unchanged exact directed pairs using `SHA-256(sourceSha256 + NUL + background RGB CSV + NUL + surface RGB CSV)`. New endpoints require new labels.
5. Re-run frozen v3 without refitting on canonical gradients selected by the improved role pipeline.
6. Require the ten fixed contrasts to pass without threshold exception branches. If they do not, predeclare one new ownership/ranking hypothesis and test it only on development evidence.
7. Freeze the full candidate, role, gradient, rendering, and review stack before accessing `08/`.
8. Review complete palettes and conditional gradient changes on fresh reserve evidence; report enriched and population-like samples separately and make no population claim unless the sampling design supports it.
9. Promote only through an explicit canonical version change after all predeclared gates pass.

If separately improved candidate and role stages still cannot represent the correct interaction, consider joint inference over roles, collapse, and gradient treatment. Keep hard constraints explicit, expose the final exact pair and evidence, compare against the decomposed baseline, and do not use joint inference to bypass the freeze or reserve policy.
