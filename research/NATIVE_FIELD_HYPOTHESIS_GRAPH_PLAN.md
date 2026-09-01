# Native Field Hypothesis Graph Plan

Status: frozen for `native-field-hypothesis-graph-0.1.0-development` implementation and exposed-development evaluation. Resource amendment 1 composes the same candidate and connected-family primitives over one owned native analysis snapshot instead of invoking defensive-copy perception getters at native size.

## Purpose

Build an evidence-only graph of source-supported field hypotheses. This experiment does not allocate foreground or accent, select a palette, compare against canonical roles during inference, or authorize promotion.

The graph must make three currently conflated questions explicit:

1. Which native source families are available as broad fields or connected overlays?
2. Does an artwork support one field or two perceptually distinct fields?
3. If two fields are supported, is their exact ordered relation distinct-flat or gradient-like across observation scales?

## Inputs And Authority

- The bounded native RGB raster is authoritative for source colors, candidate identity, masks, families, connected components, representative pixels, and provenance.
- Observation rasters are deterministic area-box reductions of the decoded native RGB raster at maximum edges 448, 224, and 112 without enlargement.
- Observation rasters provide only field, text, saliency, topology, and scale-stability evidence over frozen native identities.
- `region-graph-0.19.0` output is not loaded by graph construction. It may be joined later for diagnostic comparison only.

## Native Perception

Run `analyzeRegions`, role-aware `buildCandidateContext`, and `buildConnectedFamilyCandidateAvailability` directly on the native raster. The composition must use the same 12-candidate, stable-family-anchor, typography, and connected-family policies as `perceivePaletteImageWithConnectedFamilies`, while retaining one owned analysis snapshot rather than repeatedly cloning raster-sized planes through public defensive getters.

The graph has two family domains:

- `primary-field`: original Lloyd-family masks whose anchor candidate has `fieldRoleAllowed: true`. These masks retain the complete non-overlapping native field partition.
- `connected-overlay`: connected-family reserve masks. These are available for overlay-complementarity evidence and representative discovery but are never field eligible in this experiment.

Light typography candidates remain overlay representatives attached to their source family. They cannot become field endpoints.

## Bounded Representative Frontier

Every family exposes at most eight exact native representatives selected by these declared criteria:

1. `population`: representative of the largest role-eligible member mask;
2. `largest-component`: exact pixel nearest the OKLab center of the largest four-connected family-mask component;
3. `saliency`: role candidate with maximum native saliency evidence;
4. `text`: role candidate with maximum native text evidence;
5. `chroma`: role candidate with maximum representative chroma;
6. `darkest`: role candidate with minimum representative OKLab lightness;
7. `lightest`: role candidate with maximum representative OKLab lightness;
8. `center`: exact family-mask pixel nearest the complete family-mask OKLab center.

Exact ties resolve by lower native representative index, then lower candidate ID. Representatives with the same native pixel index collapse and retain every selecting criterion.

Every representative records exact RGB, OKLab, native pixel index, family identity, source construction, field-role permission, and selecting criteria. No representative color may be synthesized.

## Observation Projection

For every observation profile:

- Project primary family masks by exact rational source-cell area coverage.
- Resolve each observation cell to the greatest primary-family coverage, breaking exact ties by stable family key.
- Require primary projected labels to form a complete partition.
- Project connected-overlay masks independently and retain cells with at least one-half area coverage.
- Derive family population, background, saliency, text, and spatial evidence on the observation lattice.
- Preserve native family identity and representative colors unchanged.

## Field Evidence

For each primary field family and profile, record:

- projected population;
- broad, connected, detail, frame, and harmonic field support;
- native-to-profile population movement;
- source field eligibility as evidence, not as a filter.

For each ordered pair of distinct primary field families and profile, run the unchanged `analyzeFieldRelation` evidence decomposition and record:

- endpoint distance, presence, balance, and mass;
- distribution continuity, intermediate extent, and progression;
- monotone connectivity;
- joint field support;
- distinct-flat and gradient support.

## One-Field / Two-Field Evidence

This version introduces declared diagnostic evidence, not a calibrated classifier.

For one field:

- `explainedMass = projected population`;
- `oneFieldFit = H(clamp(population / 0.5), field support)`.

For an ordered two-field pair:

- `pairMass = background population + surface population`;
- `balance = 1 - |background - surface| / pairMass`;
- `distinguishability = clamp(endpoint OKLab distance / 0.18)`;
- `incrementalSurfaceIdentity = H(clamp(surface population / 0.15), surface field support, distinguishability)`;
- `twoFieldFit = H(background field support, surface field support, clamp(pairMass / 0.6), balance, distinguishability)`.

The graph records these independent values. It must not declare collapse merely as `1 - best two-field alternative`.

## Scale Summary

For every scalar tracked across 448, 224, and 112, record minimum, maximum, mean, and range.

For every ordered pair, record the profile-local larger state support (`distinct-flat`, `gradient`, or `tie`) and agreement as the largest state count divided by profile count. Disagreement remains explicit evidence and is never silently resolved by choosing 224.

## Overlay Complementarity

For every field hypothesis, rank overlay representatives using only role-local diagnostic evidence:

- overlay evidence: `max(text, saliency, spatial detail)`;
- identity distance: minimum OKLab distance from every selected field endpoint, normalized by 0.18;
- identity strength: `max(clamp(chroma / 0.18), text)`;
- complementarity: harmonic conjunction of overlay evidence, identity distance, and identity strength.

Retain at most the three strongest overlay representatives with deterministic stable-key ties. This evidence cannot authorize an overlay role or change field-state support.

## Graph Domain

For `F` primary field families:

- collapsed hypotheses: `F`;
- ordered distinct-flat hypotheses: `F * (F - 1)`;
- ordered gradient hypotheses: `F * (F - 1)`;
- total hypotheses: `F + 2 * F * (F - 1)`, bounded by 276 for `F <= 12`.

Each distinct-flat and gradient hypothesis references one shared ordered relation record. No heuristic shortlist is allowed.

## Required Certificate

Each graph records:

- algorithm and policy identities;
- encoded-source and decoded-native SHA-256 identities;
- native and profile dimensions and raster hashes;
- family and representative stable keys and mask hashes;
- exact family, representative, relation, and hypothesis counts;
- the complete logical-domain count and bound;
- scale-profile identities;
- invariants proving exact-source representatives, primary native and projected partitions, overlay-only connected reserves, bounded frontiers, complete ordered relation enumeration, complete state enumeration, no generated colors, no palette output, and no canonical role use.

## Structural Evaluation

Run the 37-source exposed development corpus in isolated children with a 120-second timeout and 1 GiB RSS bound.

Report:

- family, representative, relation, and hypothesis count distributions;
- scale disagreement distributions;
- field-support and one/two-field evidence ranges;
- overlay reserve availability;
- exact-source and partition violations;
- runtime and memory maxima;
- diagnostic evidence for Maroon 5, `once`, `knuckles`, `birdsofprey`, and `krafty`.

## Stop Conditions

Stop before any selector or human review if:

- any field representative is not an exact native source pixel;
- primary native or projected masks fail to partition;
- a connected reserve is field eligible;
- any family retains more than eight representatives;
- ordered relations or hypotheses are incomplete;
- evidence is non-finite or outside declared normalized domains;
- graph construction reads canonical palette output;
- a resource bound is exceeded.

Passing this experiment authorizes only a later field-state calibration plan. It does not authorize palette output, ranking thresholds, reserve-root access, or review.
