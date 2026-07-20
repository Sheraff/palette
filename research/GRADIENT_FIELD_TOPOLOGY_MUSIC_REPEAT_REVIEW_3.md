# Gradient Field Topology 3.0.0 Music Repeat Review

## Purpose and scope

This is a blinded repeat-label consistency study over exact directed pairs already labeled in the v3 development registry. Every case comes from a registry entry with temporal review cohort `music` and a `music-artworks/` source. Every case therefore has a hidden historical label and is development evidence, not independent validation data.

The study measures reviewer consistency, review-UI behavior, and exact-pair identifiability. Its selected sample is label-balanced and deliberately enriched for model disagreements and boundary cases. It must not be used as an independent model validation, a deployment-prevalence sample, a calibration sample, or an estimate of population label/error prevalence. The old registry labels remain immutable; repeat responses are supplemental observations and are never written back automatically.

The frozen historical music-label totals are 190: 65 `should-be-gradient`, 86 `should-not-be-gradient`, 38 `either-way`, 1 `uncertain`, 0 `no-visible-difference`, and 0 `selected-colors-not-identifiable`. The uncertain case is excluded. The fixed review allocation is exactly 10 prior `should-be-gradient`, 10 prior `should-not-be-gradient`, and 5 prior `either-way` cases.

## Frozen identities and exact pairs

Canonical extraction remains `region-graph-0.17.0`. The runtime scorer remains `gradient-field-topology-model-3.0.0-dev`, variant `unified-owned-continuity`, with evidence `gradient-field-topology-evidence-3.0.0-dev`, threshold `0.25629320384844717`, and selected parameter identity `98d0a0d89e83d1e66a211c05557db74467f13bf4cb1d99766a650f29178fbc11`. The development artifact identity is `2722e5a99b8b218b3d28c975f5ae00624862420acae790da71f2cadfa3ec1983`. There is no model refit, feature change, threshold change, or label mutation in this study.

An exact directed pair is identified as:

`SHA-256(sourceSha256 + NUL + background RGB CSV + NUL + surface RGB CSV)`

Direction is material. The seal verifies that each eligible entry is one of the unique 412 development-registry pairs, has cohort `music`, has a `music-artworks/` source, and has one of the three allocated historical labels. The source bytes must match the registry SHA-256. The exact directed background and surface RGBs and computed pair SHA-256 must match the registry entry. Duplicate source-pair identities are errors. Stored v3 evidence is scored only through `src/gradient-field-topology-model.ts`; evidence is not regenerated and scorer formulas are not copied. An old 0.8.6 decision is included only if directly recoverable from already-bound provenance without changing or rerunning historical labels; it is not required for this consistency study.

The manifest binds exact bytes and SHA-256 hashes for the v3 development and fit artifacts, protocol, preparer/analyzer, dedicated renderer and server, runtime scorer, source artworks, package declaration, Node and native runtime versions, and selected parameter identity. All generated outputs use refuse-overwrite.

## Deterministic selection

All ordering ties use ascending directed `pairSha256`. Historical labels and selection cells remain private.

For each decisive historical-label cell (`should-be-gradient` and `should-not-be-gradient`) with target 10:

1. Define model disagreement against that historical decisive label using the frozen v3 decision.
2. Select `min(5, disagreement count)` disagreement cases first, ordered by ascending `pairSha256`. This caps disagreement enrichment at half the cell and avoids making the sample entirely hard or boundary-selected.
3. Split the remaining slots into `ceil(remaining / 2)` nearest-margin slots and the rest hash-order slots.
4. Fill nearest-margin slots from all unselected cases in the historical-label cell by ascending absolute v3 margin, then pair SHA-256.
5. Fill hash-order slots from the remaining cases by ascending pair SHA-256.
6. If a pool is unexpectedly short, include all available cases and fail the workflow unless the exact fixed cell target can still be met from that same historical-label cell. Cross-label fallback is prohibited.

For the prior `either-way` cell with target 5:

1. Partition cases by frozen v3 gradient/flat outcome.
2. When both outcomes have at least two cases, select one nearest-margin and one ascending-pair-hash case from each outcome, with no duplicate pair. The fifth case is the smallest absolute-margin case remaining across both outcomes.
3. If an outcome has fewer than two cases, include all cases from that outcome. Fill unfilled slots from the other outcome, alternating one nearest-margin choice then one ascending-pair-hash choice until five cases are selected.
4. If only one outcome exists, apply the same alternating nearest-margin/hash ordering to that outcome.
5. Fail if the historical either-way cell cannot supply five unique cases.

The private evaluation records every eligible registry pair, hidden historical label, v3 score/decision/margin, private label/model cell, selection lane, intended allocation, actual allocation, and any balancing limitation. Public order and `gradientFirst` are independently deterministic from the manifest ID and exact pair SHA-256.

## Blinded review and interpretation

Public `review.json` contains exactly 25 entries. Each entry contains only family ID, source anchor path/SHA-256/bytes, exact directed pair SHA-256, exact rendering colors/palette, and randomized `gradientFirst`. The public JSON and UI hide historical labels, v3 and 0.8.6 decisions, scores, margins, eligibility, reasons, and selection cells.

The review presents the same exact pair as gradient and flat Options A/B and offers exactly five responses: `should-be-gradient`, `should-not-be-gradient`, `either-way`, `no-visible-difference`, and `selected-colors-not-identifiable`. The dedicated server binds only `127.0.0.1`, verifies exact public-plan keys, render-plan and HTML hashes, source containment, source bytes, and SHA-256 before listening, serves only selected anchors, never serves private evaluation data, and atomically stores separately bound feedback. Intended port is 3118 but remains an explicit argument.

Analysis requires exactly 25 responses and a separately recorded interpretation artifact bound to exact review, HTML, and feedback hashes. It reports the complete historical-by-current five-way agreement matrix, exact five-way agreement, decisive repeat agreement among pairs where both labels are decisive, decisive-to-nondecisive changes, `should-be-gradient` to `should-not-be-gradient` flips, reverse flips, v3 correctness against historical decisive labels and repeat decisive labels, newly observed no-visible-difference and selected-colors-not-identifiable responses, and private historical-label/model-cell and selection-lane breakdowns. `Uncertain` is excluded from selection and cannot be silently mapped to a five-way label. Analysis is descriptive and performs no refit, threshold change, promotion decision, or automatic replacement of development-registry labels.
