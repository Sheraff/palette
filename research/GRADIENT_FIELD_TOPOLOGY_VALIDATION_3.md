# Gradient Field Topology 3.0.0 Sealed Review

## Frozen identities

This protocol governs the first permitted use of the `07/` artwork batch. The following identities are frozen before any `07/` source is listed, read, decoded, or hashed:

- Canonical extraction: `region-graph-0.17.0`, implemented by `src/extract.ts` and its bound canonical dependencies. Canonical role selection and the canonical gradient decision are not changed by this workflow.
- Runtime model: `gradient-field-topology-model-3.0.0-dev`, variant `unified-owned-continuity`, implemented only by `src/gradient-field-topology-model.ts`.
- Evidence: `gradient-field-topology-evidence-3.0.0-dev`, implemented by `src/gradient-field-topology.ts` with its exported frozen topology constants.
- Selected parameter identity: `98d0a0d89e83d1e66a211c05557db74467f13bf4cb1d99766a650f29178fbc11`.
- Frozen threshold: `0.25629320384844717`, with decision rule `score >= threshold`. The score is a balanced-prior discrimination score, not a calibrated prevalence probability.
- Training artifact: `2722e5a99b8b218b3d28c975f5ae00624862420acae790da71f2cadfa3ec1983`.
- Fitting configuration: `ea380df441f2473b2ad2ee18db7954cf10844019af95c6e74f968a008d559dc4`.
- Comparator: the unchanged `gradient-eligibility-0.8.6-dev` exact-pair decision implemented by `src/gradient-eligibility.ts`.

The seal records SHA-256 hashes for this protocol, the preparer, dedicated renderer and server, runtime scorer, topology evidence implementation, canonical implementation, old comparator, development registry, fit artifact, package declaration, and selected parameter identity. A hash mismatch stops evaluation. The runtime scorer is the sole v3 scorer; this workflow must not reproduce its formulas, coefficients, threshold, or decision logic.

## Population and exact-pair semantics

`07/` is treated as a temporal review batch drawn from the same theoretically uniform deployment artwork source population as prior numbered batches. It is not a distinct semantic cohort. Batch differences may reflect finite sampling, changing source delivery, adaptive prior review, and reviewer drift. Reviewer judgments can therefore drift over time even when the theoretical source population is uniform.

The review population is canonical `region-graph-0.17.0` gradients only. For each sealed family anchor, the workflow runs canonical extraction once, resolves the canonical background and surface RGBs to exactly one candidate each in the same extraction context, and evaluates that directed background-to-surface pair with both v3 and 0.8.6. Missing or non-unique exact candidate matches are errors. Direction is material.

The exact-pair identity is:

`SHA-256(sourceSha256 + NUL + background RGB CSV + NUL + surface RGB CSV)`

Pairs duplicated within `07/` are rejected. Any pair already present in the frozen 412-entry v3 development registry is excluded from eligibility. Canonical-flat anchors remain in the private evaluation inventory but are not part of the review population.

## Corpus seal

- All intended outputs are preflighted with refuse-overwrite before any `07/` corpus access.
- Sources are grouped by the stable artwork identifier encoded after the first 16 filename characters, matching batches 04-06.
- Anchor preference is `ab67616d0000b273`, then `ab67616d00001e02`, then any other source; larger minimum dimension and area break ties, followed by lexical path order.
- Extensionless files are accepted only when decoded as JPEG. Other accepted formats are JPEG, PNG, AVIF, and WebP.
- Every source records its relative path, original dimensions, byte count, and SHA-256. All family variants are retained in the inventory.
- Separate artwork identifiers sharing exact source bytes are deduplicated; the lexically first identifier owns the bytes.
- Artwork-family and exact-byte overlaps with `00/` through `06/` are excluded. Exact-byte overlaps with the frozen music manifest are excluded.
- The manifest records included and excluded families, exclusion reasons, prior and music inventory bindings, runtime identity, all frozen implementation and artifact hashes, and a content-derived manifest ID.
- Evaluation revalidates every selected anchor's byte count and SHA-256 before decoding it.

No `08/` or later source may be listed, read, decoded, or hashed by this workflow.

## Private allocation

The private evaluation contains all eligible exact pairs, v3 scores and margins, v3 and 0.8.6 decisions, strata, exclusions, and selection rationale. It selects exactly 25 unique pairs with this intended allocation:

1. 6 old-gradient/v3-flat removals.
2. 6 old-flat/v3-gradient recoveries.
3. 5 both-gradient controls.
4. 5 both-flat controls.
5. 3 closest remaining cases by absolute v3 threshold margin.

For each of the first four strata, `ceil(target / 2)` cases are selected by smallest absolute v3 margin, with pair SHA-256 as the tie-breaker. The remainder is selected by deterministic SHA-256 ordering from that stratum's unselected cases. If a stratum is short, every available case is included and the deficit is filled first from the closest-margin unselected eligible pairs across strata, then from deterministic-hash-ordered unselected controls. The final three threshold cases are the closest-margin eligible pairs still unselected. The evaluation records intended and actual source-stratum allocations, selection lanes, deficits, and reasons. Fewer than 25 eligible pairs is a hard failure.

The v3 threshold, parameters, features, and comparator are never refit or adjusted on `07/`, during selection, or after review. Selection is intentionally disagreement- and threshold-enriched. Consequently, this 25-case review is not a prevalence sample and must not be used to estimate deployment gradient prevalence, overall error prevalence, calibration, or population accuracy.

## Blinding and feedback

Public `review.json` has exactly 25 entries. An entry contains only its family ID, source anchor path/SHA-256/bytes, directed pair SHA-256, rendering colors, and deterministic randomized `gradientFirst` flag. It contains no score, threshold margin, model or comparator decision, reason, stratum, eligibility state, or selection rationale. Top-level provenance hash-binds the plan to the manifest, private evaluation, runtime model file and model identity, and selected parameter identity without disclosing predictions.

The dedicated renderer emits no-overwrite Option A/B HTML and a render binding containing the exact review-plan and HTML hashes. Gradient and flat options use the same directed background and surface colors. Option placement is deterministic and blinded. Exactly one judgment is required per case:

- `should-be-gradient`: the displayed directed pair should use the gradient treatment.
- `should-not-be-gradient`: the displayed directed pair should use the flat treatment.
- `either-way`: both treatments are acceptable; this is nondecisive.
- `no-visible-difference`: the treatments are not visibly distinguishable; this is nondecisive.
- `selected-colors-not-identifiable`: one or both displayed endpoint colors cannot be identified in the source artwork; this is nondecisive and distinct from either-way.

The dedicated server binds only `127.0.0.1`, verifies the complete public-plan schema, render binding, selected source containment, bytes, and SHA-256 before listening, serves only the 25 selected anchors, never accepts or serves the private evaluation, and atomically stores feedback bound to the exact review and HTML hashes.

## Interpretation

Analysis requires all 25 stored responses and a separately recorded interpretation artifact bound to the review, HTML, and feedback hashes. Decisive judgments are `should-be-gradient` and `should-not-be-gradient`. The other three labels remain separate nondecisive categories and never silently become either class.

For decisive cases, analysis reports exact-pair confusion outcomes separately for v3 and 0.8.6. A paired improvement is a case where 0.8.6 is wrong and v3 is correct; a paired regression is a case where 0.8.6 is correct and v3 is wrong. Unchanged-correct and unchanged-wrong are reported separately. Results are also broken down by private source stratum and absolute v3 margin bands `<0.02`, `0.02-<0.05`, `0.05-<0.10`, and `>=0.10`. Nondecisive labels are reported by model decisions, stratum, and margin band but do not count as improvements or regressions.

Interpretation is descriptive evidence for these exact selected pairs only. It must explicitly retain the selection-enriched, non-prevalence limitation, possible temporal reviewer drift, and the prohibition on refitting from `07/`.
