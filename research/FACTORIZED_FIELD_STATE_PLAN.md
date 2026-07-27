# Factorized Field-State Authority Plan

Status: frozen for `factorized-field-state-authority-0.1.0-development` implementation and exposed-data evaluation.

## Purpose

Separate three questions that the prior holistic calibration incorrectly combined:

1. Which ordered source-family pair best represents the artwork?
2. Does the selected field block contain one field or two?
3. If it contains two fields, should the exact selected endpoints render flat or as a gradient?

This experiment may fit diagnostic pair and multiplicity models. It does not enumerate foreground or accent, emit a palette, access reserve roots, authorize human review, or authorize promotion.

## Inputs

- Frozen 37-source graph: `research/data/native-field-hypothesis-graph-development.json`, SHA-256 `990b3fb8370cb670831dcd0734b1bfdd1d17f58dd9fd617d3967698cc9fb8281`.
- Canonical ledger from the explicit allowlist in `research/build-review-evidence.ts`.
- Submitted batch 1 of the field-pair review. Its unopened batch 2 is not an input.
- Completed field-dominance, threshold-free-collapse, and stable-noncollapsed-field ablation reviews.
- Frozen gradient registry `gradient-field-topology-3.0.0-development.json`, SHA-256 `2722e5a99b8b218b3d28c975f5ae00624862420acae790da71f2cadfa3ec1983`.
- Frozen gradient scorer `gradient-field-topology-model-3.0.0-dev`.
- Native-review artifacts only for structured exact-presentation diagnostics such as the `unnecessary-gradient` reason. Free-text comments are not labels.
- No files under roots `10` through `14` and no autonomous feedback.

Every judgment is grouped by exact encoded-source SHA-256. Archive copies, source aliases, repeated presentations, and exact transfers never become independent source groups.

## Native Family Linkage

Reviewed 224-pixel colors may be exact source-supported colors without belonging to the graph's bounded representative frontier. Linkage therefore queries the complete frozen native primary partition without changing it:

1. generated field endpoints are rejected;
2. unique exact RGB membership maps exactly;
3. otherwise the nearest native pixel in each primary family is measured in OKLab;
4. mapping requires distance at most `0.025` and a second-family margin greater than `0.005`;
5. ties, absent colors, and ambiguous family membership are rejected;
6. queried colors never become representatives or inference candidates.

The query is label-blind family linkage only. It must return the same graph as ordinary construction and must not alter masks, families, representatives, evidence, or hypotheses.

## Direct Multiplicity Dataset

Build `collapse-two-field-direct-v1` from comparisons where:

- foreground RGB and generated status are identical on both sides;
- accent RGB and generated status are identical on both sides;
- exactly one side maps to a collapsed hypothesis and the other maps to a two-field hypothesis;
- the preference is decisive;
- both field endpoints map through native family linkage;
- the complete semantic tuple is not an exact transferred duplicate.

Expected raw evidence is 21 judgments over 19 exact source groups: twelve events from the explicit canonical ledger allowlist and nine fresh manifest-review events. The pre-implementation inventory omitted three accepted-archive field-controlled events; amendment 1 includes them before fitting because they satisfy the same frozen criteria. One generated-field comparison is expected to be rejected. The exact transfer of the field-dominance case is provenance only and must not add a row.

Maroon 5, `once`, Knuckles, Birds of Prey, and `krafty` are diagnostic groups and never enter multiplicity fitting.

## State-Free Pair Ranking

The ordered-pair ranker receives only two-field, state-invariant evidence:

1. mean two-field fit;
2. mean incremental surface identity;
3. mean background-family field support;
4. mean surface-family field support;
5. mean pair mass;
6. mean pair balance;
7. endpoint distance normalized by `0.18`;
8. maximum overlay-complementarity support across the flat and gradient aliases.

Collapsed comparisons and comparisons that differ only by flat versus gradient are excluded. Flat and gradient aliases of one ordered family pair must produce identical features and one pair identity.

Fit the same deterministic source-balanced L2 Bradley-Terry procedure as the prior experiment. Standardization is training-fold-local. Evaluation is leave-one-exact-source-group-out and source-balanced.

## One-Field Versus Two-Field Model

Fit only direct multiplicity judgments. Features are graph evidence, not state names or review metadata:

1. selected background one-field fit;
2. selected two-field fit, zero for collapsed;
3. incremental surface identity, zero for collapsed;
4. background-family field support;
5. surface-family field support, zero for collapsed;
6. explained field mass;
7. endpoint distinguishability, zero for collapsed;
8. maximum overlay-complementarity support.

Use deterministic source-balanced L2 Bradley-Terry fitting and leave-one-source-group-out evaluation. No holistic judgment enters this model.

## Flat Versus Gradient Authority

Do not fit a gradient coefficient from whole-palette preferences.

- The frozen v3 topology scorer remains the only gradient classifier in this experiment.
- Its 274 decisive exact directed labels remain the fitting evidence and are not duplicated.
- Birds of Prey, Muse, and Nada are exact graph-distinguishable structured positive checks.
- Doja is retained as an exact positive label but marked graph-state-indistinguishable because both reviewed endpoints map to one native family.
- `krafty` is a structured regression check through its recorded `unnecessary-gradient` outcome and exact raw/final treatment identities, not through its comment.

The topology decision is conditional on an exact selected endpoint pair. Pair ranking cannot override it.

## Gates

All gates must pass:

1. ordinary graph construction is byte-semantically unchanged by native family queries;
2. at least 12 non-diagnostic direct multiplicity groups and 14 mapped decisive comparisons remain;
3. complete grouped prediction coverage for both fitted models;
4. source-balanced pair-ranking accuracy at least `0.60` and mean log loss below `log(2)`;
5. source-balanced multiplicity accuracy at least `0.65` and mean log loss below `log(2)`;
6. the multiplicity model improves over the frozen uncalibrated one/two ordering;
7. every exact graph-distinguishable targeted gradient label is classified as gradient by the frozen topology scorer;
8. the final conditional state rule does not reproduce the structured Krafty unnecessary-gradient failure;
9. no interpreted comment color or filename branch enters fitting or authorization.

Passing authorizes only a complete-tuple evidence and technical-feasibility plan. It does not authorize palette review or reserve access.

## Stop Conditions

Stop if direct multiplicity coverage is too small, family linkage is ambiguous, a grouped metric fails, the topology component fails an exact structured state check, or any diagnostic source enters fitting. Do not tune a coefficient or threshold around a failed named case.
