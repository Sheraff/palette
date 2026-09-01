# Native Complete-Palette Execution Plan

Status: fresh-context execution handoff. Development implementation and evaluation may proceed on already exposed data. This document does not itself authorize human review, reserve access, model promotion, or a canonical code change. Stop at every marked human pause and obtain explicit user approval.

## Mission

Build and validate a deterministic palette extractor that maximizes expected human shippability of the complete rendered UI theme:

```text
(background, surface, fieldState, foreground, accent)
```

The final system must select the tuple jointly. It must not independently select roles, fit isolated field labels, or repair roles after selection.

Successful completion means either:

- a frozen candidate passes development review, output-unseen reserve validation, the final untouched-root release gate, and explicit promotion approval; or
- the candidate direction is rejected at a predeclared stop, canonical `region-graph-0.19.0` remains unchanged, and the negative result is preserved reproducibly.

Failure to promote is a valid completed outcome. Never weaken a gate to force release.

## Current Baseline

Canonical behavior remains `region-graph-0.19.0`.

| Item | Frozen identity or status |
| --- | --- |
| Audit commit | `107af0ac8b6ad03bd2b17cdc5ef46d0305aec1f2` |
| Remote branch | `origin/research/palette-0.9-checkpoint` |
| Canonical comparator | `research/data/results.json` |
| Comparator SHA-256 | `546a53979c651f7b20d6a741e0c60c63e6bb97869f93a22918e1de4b5e488fec` |
| Native graph development SHA-256 | `990b3fb8370cb670831dcd0734b1bfdd1d17f58dd9fd617d3967698cc9fb8281` |
| Native graph analysis SHA-256 | `469b0547896bab3268a600083aa80b0865091d60df3c02d8f094211534bdde61` |
| Exact-pair transfer development SHA-256 | `cf7eede975536aa0fa50645d63c1f8c5158f19c971c3e81a09fe1dc730307d30` |
| Exact-pair transfer analysis SHA-256 | `17c31c78ae172b638e10171f598a10250bdcc89403f0b703546cf37ba177c4ca` |
| Controlled field review | Stopped and development-rejected after 10/72 cases |
| Output-unseen roots | `10` through `14`, sealed |

The worktree contains extensive unrelated changes and untracked research artifacts. Do not revert, overwrite, clean, or reformat work outside this plan.

The last full research suite reported 446 passing tests and 16 established artifact failures caused by the changed `package.json` hash. Confirm that failures remain exactly historical before attributing a new regression.

## Completed Foundations

- Native decode, source identity, masks, families, and exact representative provenance are implemented.
- Native identities are projected into 448, 224, and 112 observation profiles without creating new candidate identities.
- Primary field, connected overlay, typography, and generated-fallback domains are structurally separated.
- Bounded population, component, saliency, typography, chroma, darkest, lightest, and center representatives exist.
- Collapsed, distinct-flat, and gradient field hypotheses are completely enumerated in the native field graph.
- Exact-pair native topology transfer is deterministic and useful as conditional evidence.
- Complete-tuple solver, Pareto, ablation, review, artifact, and certificate infrastructure exists in earlier experiments.
- Broad complete-tuple replacements, factorized pair fitting, multiplicity fitting, and isolated field review have failed.

The native graph passed structurally but explicitly failed ranking authority. Known desired hypotheses were often available but under-ranked. It is an evidence source, not a palette selector.

## Superseded Work

Do not resume or reuse these as supervision:

- `controlled-field-state-supervision-0.1.0-development` review;
- independent ordered-pair human fitting;
- independent one-field versus two-field human fitting;
- independent gradient labels when the complete treatment is invalid;
- free-text comments as labels, target colors, features, gates, or named-case patches;
- broad candidate versions that replace most canonical outputs;
- postselection role repair or gradient patching.

The stopped feedback remains verbatim qualitative stop evidence only. Do not reinterpret its structured `either-way` values from comments.

## Required Reading

Read these before editing implementation:

- `research/PALETTE_EXTRACTION_IMPROVEMENT_PLAN.md`
- `research/COMPLETE_PALETTE_ONLY_PLAN.md`
- `research/NEXT_PALETTE_ARCHITECTURE.md`
- `research/NEXT_PALETTE_JOINT_INFERENCE_PLAN.md`
- `research/NATIVE_FIELD_HYPOTHESIS_GRAPH_PLAN.md`
- `research/NATIVE_EXACT_PAIR_TOPOLOGY_TRANSFER_PLAN.md`
- `research/data/native-field-hypothesis-graph-analysis.json`
- `research/data/native-exact-pair-topology-transfer-analysis.json`
- `research/data/factorized-field-state-analysis.json`
- `research/data/experiments/controlled-field-state-supervision-0.1.0-development/review-v1/batch-01-partial-stop-analysis.json`

## Non-Negotiable Constraints

- Maximum four distinct role colors.
- Background, surface, and gradient state form one coupled field block.
- Foreground and accent are recomputed for every field treatment.
- Every non-fallback selected color has exact source provenance.
- Generated black or white is legal only as a declared foreground fallback when no source foreground is feasible for that field treatment.
- Connected chromatic reserves remain overlay-only unless a separately frozen experiment changes that domain.
- Foreground must satisfy the declared consumer APCA contract over every field where it is rendered.
- Accent must satisfy the declared consumer APCA contract over every field where it is rendered.
- Collapse semantics, role membership, cardinality, and gradient legality are hard constraints.
- No postselection mutation, repair, veto, or fallback to a different algorithm.
- No filename, source-ID, review-case, target-hex, comment, or batch branches.
- No reserve root may be read, decoded, rendered, hashed into candidate evidence, or reviewed before explicit authorization.
- Human review always evaluates complete rendered palettes.

## Phase 0: Rehydrate And Verify

- [ ] Inspect `git status`, recent history, and the scoped implementation diff without modifying unrelated work.
- [ ] Verify every frozen SHA-256 in the baseline table.
- [ ] Verify the native graph and exact-pair transfer artifact tests.
- [ ] Verify the stopped controlled-review analysis and confirm ports 3130 and 3131 are not serving that review.
- [ ] Run the existing structural tests for perception, graph completeness, complete inference, review parsing, and certificates.
- [ ] Run `npm run research:test` and classify only newly introduced failures as regressions.
- [ ] Record runtime, Node version, package-lock identity, platform, and resource limits for the new experiment.

Stop if a frozen identity changed unexpectedly. Do not regenerate a predecessor artifact to make verification pass.

## Phase 1: Complete-Palette Evidence Inventory

Create a read-only inventory before implementing a new selector.

- [ ] Deduplicate all exposed sources by exact encoded-source SHA-256.
- [ ] Group aliases, artwork families, and perceptual near-duplicates without counting them as independent supervision.
- [ ] Inventory only complete-palette absolute quality and pairwise preference events.
- [ ] Exclude factorized field-state events from model supervision.
- [ ] Preserve ties, `neither acceptable`, uncertainty, and unidentifiable outcomes as separate outcomes.
- [ ] Preserve comments as qualitative context only.
- [ ] Report independent source-group counts for absolute quality, decisive pairwise preference, ties, neither-acceptable, and uncertainty.
- [ ] Report exact transfers and repeated presentations separately from independent evidence.
- [ ] Determine whether at least 50 independent source groups support absolute modeling and at least 50 support pairwise modeling.

Deliverables:

- `research/data/experiments/native-complete-palette-0.1.0-development/evidence-inventory.json`
- strict parser and provenance tests for the inventory
- a decision stating whether calibrated complete-palette modeling is currently supportable

Do not fit a model in this phase.

## Phase 2: Freeze Candidate Protocol

Create a versioned protocol before running the complete 392-source development matrix.

- [ ] Name the candidate `native-complete-palette-0.1.0-development` unless that identity already exists.
- [ ] Bind canonical 0.19, native graph policy, topology scorer, source roster, runtime, implementation closure, and this plan.
- [ ] Declare source roots and prove that roots `10` through `14` are excluded.
- [ ] Declare the maximum changed-development frontier as 40 exact source groups for this first conservative candidate.
- [ ] Declare per-source wall-time and RSS limits before the sealed run.
- [ ] Declare all hard constraints and semantic acceptability blocks.
- [ ] Declare deterministic tie order and certificate schema.
- [ ] Declare known technical and complete-palette regression controls.
- [ ] Declare stop conditions before generating final development outputs.

The first candidate is an incumbent-relative migration experiment. It may preserve canonical 0.19 when no complete challenger is admissible. The final standalone selector will remove canonical input in a later phase.

## Phase 3: Implement The Native Complete-Tuple Domain

Prefer a new, separately versioned implementation over modifying frozen predecessor modules.

Recommended implementation boundary:

- `research/src/native-complete-palette.ts`
- `research/evaluate-native-complete-palette.ts`
- `research/tests/native-complete-palette.test.ts`
- `research/tests/native-complete-palette-artifact.test.ts`

### Field Treatments

- [ ] Enumerate collapsed field treatments from eligible primary families and bounded representatives.
- [ ] Enumerate every legal ordered distinct field-family pair.
- [ ] Retain distinct-flat and gradient states for each legal positive-distance pair.
- [ ] Use native graph one-field, two-field, field support, relation, scale stability, and exact-pair topology as evidence only.
- [ ] Reject connected-overlay families from field roles.
- [ ] Deduplicate semantically identical field treatments.

### Overlay Frontiers

- [ ] Recompute source foreground candidates for every field treatment.
- [ ] Require foreground functionality over background and surface according to the frozen consumer policy.
- [ ] Admit generated black or white only when no source foreground passes for that field treatment.
- [ ] Recompute source accent candidates for every field treatment and foreground choice.
- [ ] Require accent functionality over every declared consumer field.
- [ ] Preserve source typography and connected-family candidates in their permitted overlay domains.
- [ ] Do not introduce new foreground or accent collapse in the first challenger version; canonical collapse remains legal only in the incumbent.

### Complete Tuples

- [ ] Compose legal `(background, surface, fieldState, foreground, accent)` tuples.
- [ ] Enforce maximum cardinality, exact collapse semantics, provenance, APCA polarity, role domains, and finite evidence.
- [ ] Compute family coverage and complete-theme composition from the represented source families.
- [ ] Keep every selected tuple immutable after construction.
- [ ] Reconcile attempted, rejected, feasible, Pareto, and selected domain counts.
- [ ] Produce a deterministic certificate for every selected incumbent or challenger.

Bound the domain in two stages if necessary: prune family-level treatments first, then bounded representative combinations. Pruning must retain dominance witnesses and prove that no admissible winner was removed.

## Phase 4: Noncompensatory Acceptability

Define separate semantic blocks. A tuple is inadmissible when any required block fails; strength in another block cannot compensate.

| Block | Required evidence |
| --- | --- |
| Field | Background identity, justified collapse or second field, ordered relation, field-state legality, multiscale stability |
| Foreground | Functionality over every field, typography or role support, source or fallback provenance |
| Accent | Identity support, visibility over declared fields, overlay-role eligibility |
| Composition | Family coverage, role separation, coherent tone/chroma relationships, no accidental duplicate semantics |
| Robustness | Stable source identities and bounded evidence movement across declared transforms |

- [ ] Freeze each block formula and normalization before the sealed matrix run.
- [ ] Use generic source evidence and synthetic controls, never named-case thresholds.
- [ ] Require a challenger to pass every block and Pareto-dominate the canonical incumbent on the declared complete vector.
- [ ] Preserve canonical exactly for incomparable or weaker challengers.
- [ ] Prefer fewer changed semantic blocks, then fewer changed atoms, then deterministic stable identity.
- [ ] Add constrained ablations fixing each canonical block in turn to explain why a challenger won.

Do not add a learned ranker yet.

## Phase 5: Mechanical Development Evaluation

Run the frozen candidate over the 37 exposed development sources and 355 deduplicated `00/` sources.

- [ ] Execute each source in an isolated bounded child process.
- [ ] Repeat successful extraction and compare exact scientific outputs, excluding resource timing fields.
- [ ] Verify zero structural, accessibility, provenance, cardinality, or certificate violations.
- [ ] Verify canonical byte equality for every unchanged source.
- [ ] Report role changes, field-state changes, generated fallbacks, collapses, source-family coverage, and resource bounds.
- [ ] Run resize, crop, re-encode, deterministic noise, and scale-disagreement diagnostics without turning them into hidden quality labels.
- [ ] Recheck known wrong-background, invisible-accent, unidentifiable-endpoint, inappropriate-collapse, multi-hue, Birds of Prey, Krafty, `once`, Knuckles, and Maroon 5 controls.
- [ ] Report controls as classes and diagnostics, not filename branches in inference.

Mechanical Gate A requires:

- zero hard violations;
- exact determinism;
- complete certificate reconciliation;
- at least one material change;
- no more than 40 changed exact source groups;
- no known technical regression;
- no reserve access;
- no interpreted comment target.

Reject candidate version 0.1 without review if Gate A fails. A new version may change one declared architectural hypothesis and must rerun Phases 2 through 5.

## Human Pause 1: Authorize Development Review

Stop and present:

- experiment and implementation hashes;
- changed source count;
- all mechanical gates;
- complete changed-set inventory;
- proposed controls and batch sizes;
- exact review schema and rendered presentation hash;
- confirmation that no reserve root was opened.

Do not generate manifests or start servers until the user explicitly authorizes complete-palette review.

## Phase 6: Complete-Palette Development Review

Reuse the established complete-palette review schema and presentation semantics. Do not reuse the stopped controlled-field UI.

- [ ] Review every materially changed complete palette against canonical 0.19.
- [ ] Add deterministic unchanged accepted, unchanged rejected, and known-failure controls.
- [ ] Use batches of at most 20 cases.
- [ ] Counterbalance A/B assignment deterministically.
- [ ] Include hidden exact repeats when review burden permits.
- [ ] Show source artwork, complete rendered treatment, all role swatches, names, hex values, and gradient state.
- [ ] Record absolute quality for A and B.
- [ ] Record `a-stronger`, `b-stronger`, `both-similarly-valid`, `neither-acceptable`, or `uncertain`.
- [ ] Record optional structured complete-palette failure classes per option.
- [ ] Keep comments qualitative and unanswered cases unanswered.
- [ ] Use multiple reviewers if available and report reviewer identity only as anonymous protocol IDs.

Required failure classes:

- needed source family unavailable;
- wrong background;
- wrong foreground;
- wrong surface;
- wrong accent;
- inappropriate collapse or unnecessary second field;
- insufficient role separation;
- inaccessible foreground or accent contrast;
- incomplete artwork identity;
- selected color not identifiable;
- incorrect flat or gradient treatment;
- complete-palette ranking failure.

Development Review Gate B for the changed candidate set requires:

- complete review coverage;
- zero `weak-fallback` or `unacceptable` candidate ratings;
- zero baseline-stronger judgments;
- at least one candidate-stronger judgment;
- zero cases where a previously positive baseline becomes a negative candidate;
- zero unexplained technical or provenance failures;
- no conversion of ties, neither-acceptable, uncertainty, or comments into directional labels.

Stop the candidate immediately when repeated complete-palette failures make Gate B impossible. Do not ask the reviewer to finish a doomed batch.

## Human Pause 2: Development Disposition

Stop after review analysis. Present absolute quality, paired preference, repeated-case consistency, failure classes, source-group coverage, and every failed gate.

Possible decisions:

| Decision | Action |
| --- | --- |
| Reject | Preserve evidence, keep canonical 0.19, and end or authorize one new architectural hypothesis |
| Refine | Start a new candidate identity at Phase 2; all reviewed data becomes development evidence |
| Pass deterministic candidate | Continue to complete-palette calibration inventory |

Do not fit a model merely because the deterministic candidate passed.

## Phase 7: Complete-Palette Calibration

Proceed only if Phase 1 found sufficient independent supervision and the user approves continued calibration after Gate B.

### Absolute Veto Model

- [ ] Predict complete-palette quality or probability of a negative `weak-fallback`/`unacceptable` outcome.
- [ ] Use only structured complete-palette labels.
- [ ] Preserve `uncertain` separately.
- [ ] Group all folds by exact source, artwork family, and perceptual duplicate group.
- [ ] Standardize inside each training fold.
- [ ] Use a small regularized ordinal logistic or binary veto model with a frozen feature list.

### Pairwise Preference Model

- [ ] Predict complete-palette preference with explicit ties.
- [ ] Use a Davidson/Bradley-Terry or regularized ordinal model.
- [ ] Exclude `neither-acceptable` and uncertain outcomes from directional fitting while reporting them.
- [ ] Keep exact duplicate carries out of independent denominators.
- [ ] Use only complete-tuple structured features available at inference time.

Permitted feature families:

- semantic block values and margins;
- multiscale stability;
- role-local support and provenance;
- family coverage;
- role cardinality and collapse;
- tone, chroma, and role-distance relationships;
- APCA margins under the consumer contract;
- field-state and exact-pair topology evidence;
- complete-tuple ablation results.

Forbidden features:

- filenames, source IDs, batch IDs, review IDs, comments, color names, target hexes, canonical preference labels, and reserve membership.

Calibration Gate C requires:

- at least 50 independent source groups for each fitted model;
- complete grouped prediction coverage;
- source-balanced log loss better than the constant baseline;
- source-balanced log loss better than the frozen deterministic ranker where comparable;
- no directional inversion under source-group folds;
- deterministic coefficients and predictions;
- no known negative complete palette ranked as shippable by the combined veto and preference decision;
- an ablation showing whether each feature family contributes out of source.

If Gate C fails, keep the deterministic complete-tuple selector. Do not tune thresholds on named examples.

## Human Pause 3: Freeze Ranking Strategy

Present deterministic and calibrated rankers side by side, including grouped metrics, calibration, feature ablations, failure cases, and runtime.

The user chooses one frozen direction:

- deterministic noncompensatory ranking;
- interpretable calibrated ranking;
- one authorized visual-reranker ablation;
- stop with canonical 0.19 unchanged.

## Phase 8: Optional Frozen Visual Reranker

Skip this phase unless Human Pause 3 explicitly authorizes it.

- [ ] Freeze a deterministic UI renderer and its exact dimensions, fonts, layout, and color management.
- [ ] Freeze one local visual encoder version, weights, preprocessing, runtime, and license.
- [ ] Encode source artwork and complete rendered treatment.
- [ ] Train only a small regularized ranking head over frozen embeddings plus structured complete-tuple evidence.
- [ ] Use the same source-group folds and complete-palette outcomes as the interpretable model.
- [ ] Measure incremental grouped log loss, calibration, robustness, runtime, and reproducibility.
- [ ] Reject the visual model if improvement is not material, stable, and attributable.

The visual model must not require network access, remote inference, nondeterministic kernels, or unavailable production dependencies.

## Phase 9: Standalone Final Candidate

Remove canonical input from final inference after a ranking strategy is frozen.

- [ ] Enumerate the same complete admissible tuple domain from source evidence alone.
- [ ] Apply the frozen hard constraints and semantic block gates.
- [ ] Select by the frozen deterministic or calibrated complete-palette ranker.
- [ ] Use a source-derived deterministic fallback tuple when all ordinary tuples fail; do not invoke canonical 0.19 internally.
- [ ] Keep canonical 0.19 only as an external migration comparator.
- [ ] Emit a complete certificate reconstructing perception identity, domain pruning, feasibility, block decisions, rank, and fallback.
- [ ] Assign a new standalone candidate and policy identity.

## Phase 10: Final Exposed-Data Freeze

- [ ] Run the standalone candidate over every exposed development source through `0f`.
- [ ] Run all synthetic, structural, accessibility, robustness, duplicate, and resource tests.
- [ ] Compare complete outputs against canonical without using canonical to alter selection.
- [ ] Review every new material difference not exactly covered by prior complete-palette presentation evidence.
- [ ] Freeze code, coefficients, policy, runtime, renderer, review schema, source inventory, deduplication, stop rules, and hashes.
- [ ] Predeclare random-sample size and changed-frontier review policy for reserve validation.

No exposed-data change is allowed after this freeze without creating a new candidate identity.

## Human Pause 4: Authorize First Reserve

Present the complete frozen package and request explicit permission to open root `10` only.

Required package:

- implementation closure and hashes;
- model coefficients or deterministic policy;
- runtime and resource envelope;
- frozen review presentation;
- exact source-group and duplicate policy;
- random-sample design;
- complete changed-frontier policy;
- pass and stop gates;
- confirmation that roots `10` through `14` remain unopened.

## Phase 11: Sequential Output-Unseen Validation

Reserve allocation is fixed as follows:

| Root | Purpose |
| --- | --- |
| `10` | First frozen output-unseen validation |
| `11` | Contingency after one post-`10` candidate change |
| `12` | Contingency after one post-`11` candidate change |
| `13` | Last contingency development reserve |
| `14` | Final untouched release gate |

For each authorized reserve root:

- [ ] Verify custody and inventory identity before decoding.
- [ ] Run the frozen candidate without fitting, threshold changes, or feature changes.
- [ ] Report population-random performance and the complete materially changed frontier separately.
- [ ] Review complete palettes only.
- [ ] Preserve absolute quality, pairwise preference, neither-acceptable, uncertainty, failures, and comments under the frozen interpretation.
- [ ] Stop at the human pause before analyzing promotion implications.

Reserve Gate D requires:

- zero hard technical violations;
- complete deterministic coverage within declared resource bounds;
- no candidate negative where canonical is positive;
- no baseline-stronger changed case;
- no repeated hidden-case contradiction beyond the predeclared tolerance;
- no evidence of a systematic unmodeled complete-palette failure class;
- all predeclared random-sample and changed-frontier endpoints passing.

## Human Pause 5: Reserve Disposition

After each reserve review, present the sealed results before any implementation change.

If a reserve fails:

- the current candidate is rejected;
- that reserve becomes development evidence;
- any change requires a new identity and the next contingency root;
- all exposed and prior reserve tests must rerun;
- the failed root must never be reported as output-unseen again.

If root `10` passes without a candidate change, keep roots `11` through `13` sealed and proceed to root `14` only after explicit final-gate authorization.

If root `13` fails, stop the program without opening root `14`. There is no remaining tuning reserve.

## Phase 12: Final Untouched-Root Gate

Open root `14` only after one earlier reserve passes and the release candidate remains byte-identical.

- [ ] Repeat the frozen mechanical, random-sample, changed-frontier, and complete-palette review protocol.
- [ ] Make no candidate, model, policy, threshold, renderer, or interpretation changes after seeing root `14`.
- [ ] If any predeclared final gate fails, do not promote.
- [ ] Preserve root `14` evidence as the terminal release result.

## Human Pause 6: Promotion Approval

Present:

- complete development history;
- all consumed and untouched reserve identities;
- final root `14` results;
- complete-palette quality and preference metrics;
- technical, robustness, resource, and accessibility gates;
- exact canonical diff;
- known limitations;
- rollback plan;
- proposed production version.

Promotion requires an explicit user instruction. Favorable artifacts do not promote themselves.

## Phase 13: Production Promotion

Only after Human Pause 6 approval:

- [ ] Assign the requested production algorithm version.
- [ ] Integrate the exact frozen scientific payload without refitting or cleanup changes.
- [ ] Preserve canonical 0.19 and predecessor artifacts as historical evidence.
- [ ] Update extraction entry points, certificates, documentation, and package metadata.
- [ ] Run unit, integration, visual, artifact, determinism, resource, and full research suites.
- [ ] Generate a final provenance manifest binding implementation, model, runtime, dependencies, protocol, and reserve decisions.
- [ ] Verify production output equals the frozen release candidate on every bound source.
- [ ] Do not commit, push, release, or create a pull request unless explicitly requested.

## Phase 14: Closeout

- [ ] Record whether the terminal outcome is promoted or rejected.
- [ ] Record every consumed reserve and why it lost output-unseen status.
- [ ] Record all remaining sealed roots.
- [ ] Document residual risks, unsupported consumers, and runtime requirements.
- [ ] Keep future production feedback separate from the frozen release evidence.
- [ ] Require a new candidate identity for every later model, threshold, feature, or role-policy change.

## Review Semantics

Every human review must use these meanings consistently:

| Field | Meaning |
| --- | --- |
| `strong` | Happy to ship this complete treatment |
| `acceptable-not-ideal` | Shippable but visibly improvable |
| `weak-fallback` | Not suitable as a normal shipped result |
| `unacceptable` | Must not ship |
| `both-similarly-valid` | Both complete treatments work |
| `neither-acceptable` | Both complete treatments fail |
| `uncertain` | Reviewer cannot make the requested judgment |

A relative preference never makes an option shippable. Absolute quality is primary.

## Global Stop Conditions

Stop the current candidate without further review when any condition holds:

- frozen predecessor identity changes unexpectedly;
- source or tuple provenance cannot be reconstructed;
- hard accessibility, role-domain, cardinality, or collapse constraints fail;
- execution is nondeterministic or exceeds the frozen resource envelope;
- the first candidate changes more than 40 exposed source groups;
- complete palettes are repeatedly weak or unacceptable;
- a fix requires a filename, artwork, review-case, comment, or target-color branch;
- model evaluation leaks exact sources or duplicate artwork families across folds;
- a calibrated or visual model does not beat its predeclared baseline out of source;
- a reserve gate fails and no contingency root remains;
- root `14` fails any final gate;
- promotion would require changing the frozen scientific payload.

## Definition Of Done

The program is done only when all applicable statements are true:

- the terminal candidate or rejection is provenance-bound and reproducible;
- every human judgment concerns a complete rendered palette;
- no isolated factor feedback enters fitting;
- no free-text comment enters inference;
- every output has a deterministic certificate;
- development and reserve source groups are correctly separated;
- every opened reserve is accounted for;
- canonical 0.19 remains unchanged unless explicit promotion was approved;
- the final status, limitations, and next authorization boundary are documented.
