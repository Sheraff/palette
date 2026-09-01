# Field-State Calibration Plan

Status: frozen for `native-field-composition-calibration-0.1.0-development` implementation and exposed-development evaluation.

## Purpose

Test whether the frozen native field-hypothesis graph contains enough evidence to learn a source-general field-composition ordering from existing human judgments. This experiment may fit and score graph hypotheses, but it does not select foreground or accent roles, emit palettes, access reserve roots, authorize human review, or authorize promotion.

## Frozen Inputs

- Native field graph: `research/data/native-field-hypothesis-graph-development.json`, SHA-256 `990b3fb8370cb670831dcd0734b1bfdd1d17f58dd9fd617d3967698cc9fb8281`.
- Canonical review ledger: only the explicit allowlist in `research/build-review-evidence.ts`.
- Final native review chain: the canonical comparator, `region-graph-0.19.0-native-role-observation-gradient-0.3.0-development`, and its final review manifest and feedback. Earlier native-review occurrences enter only through the final manifest's carry provenance and are not counted again.
- Exact source SHA-256 is the source-group identity. Every presentation, algorithm version, duplicate path, and carry for a source stays in one group.
- Roots `10` through `14`, candidate stores excluded by the canonical ledger, free-form comments, and autonomous feedback are not inputs.

## Palette-To-Graph Mapping

Mapping occurs after loading the frozen, label-blind graph.

1. Generated background or surface colors are unmappable.
2. Exact RGB membership in a primary-field representative maps exactly.
3. Otherwise, an endpoint maps only when its nearest primary family representative is within OKLab distance `0.025` and is separated from the second-nearest family by more than `0.005`.
4. Every other endpoint is ambiguous or unmappable and contributes no calibration comparison.
5. Background and surface mapped to one family identify the collapsed hypothesis. Distinct families identify the ordered distinct-flat or gradient hypothesis according to the reviewed palette's exact gradient decision.

The `0.025` radius reuses the repository's established role-level perceptual evidence threshold. The `0.005` family margin was frozen from unlabeled mapping geometry before judgment attachment. No endpoint is moved to a family to preserve a label.

## Features

The ranker receives these declared graph-only features:

1. collapsed-state indicator;
2. gradient-state indicator;
3. mean state support;
4. state-support stability, `1 - range`;
5. mean one-field fit;
6. mean two-field fit, or zero for collapsed hypotheses;
7. mean incremental surface identity, or zero for collapsed hypotheses;
8. mean background-family field support;
9. mean surface-family field support, or zero for collapsed hypotheses;
10. maximum retained overlay-complementarity support.

No canonical role color, algorithm identity, filename, review outcome, diagnostic case identity, or generated color is a feature.

## Labels And Weighting

- Decisive pairwise preferences are weak holistic-composition supervision. A comparison is usable only when both palettes map and their field feature vectors differ.
- Ties and neither-acceptable judgments are retained for reporting but do not become binary labels.
- Absolute shippability judgments are an external discrimination check only. They are not fitted as field labels because foreground and accent can cause the outcome.
- Deduplicated canonical event IDs count once. A final native-chain carry counts once at its original feedback identity. Exact duplicate sources count once.
- Each source group has equal total fitting weight; repeated reviews within a source cannot dominate another source.

## Model And Leakage Control

- Fit a deterministic linear Bradley-Terry ranker with L2 coefficient penalty `0.05` and no intercept.
- Standardize features using endpoint means and population standard deviations computed only from each training fold. Means cancel in pairwise differences but remain recorded for deterministic scoring.
- Optimize weighted logistic loss by fixed-step gradient descent using a declared Hessian upper bound, at most `100000` iterations, and gradient tolerance `1e-9`.
- Evaluate with leave-one-source-group-out predictions. Every event and palette from the held-out source is excluded from its fit. Accuracy and log loss are averaged within source and then across sources, so repeated comparisons do not dominate evaluation.
- Fit the final diagnostic model after removing all five diagnostic source groups: Maroon 5, `once`, `knuckles`, `birdsofprey`, and `krafty`.

## Gates

Calibration authority is withheld unless all conditions pass:

1. at least 12 non-diagnostic source groups and 20 decisive mapped comparisons;
2. complete leave-one-source-group-out prediction coverage;
3. grouped pairwise accuracy at least `0.60`;
4. grouped pairwise accuracy exceeds the frozen harmonic diagnostic ordering by at least `0.03`;
5. grouped pairwise log loss is below `log(2)`;
6. `once` retains a distinct-flat hypothesis in the top five;
7. `krafty` ranks its best non-gradient hypothesis above its best gradient hypothesis;
8. the declared Maroon 5, Knuckles, and Birds of Prey target pairs each improve over the frozen harmonic ordering and enter the top quarter of their complete hypothesis domain.

The three target-pair checks are evaluation anchors from already exposed review findings. They are never training labels.

## Stop Conditions

Stop without palette generation or review if mapping coverage is inadequate, grouped fitting is not deterministic and finite, a gate fails, or any diagnostic source enters a training fold. Passing all gates would authorize only a separate complete-tuple enumeration and technical-gate plan. It would not itself authorize review or promotion.
