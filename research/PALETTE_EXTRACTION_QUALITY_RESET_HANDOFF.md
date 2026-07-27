# Palette Extraction Quality Reset: Fresh-Agent Handoff

Status: authoritative fresh-agent handoff as of 2026-07-26. This document supersedes the current
native complete-palette product direction and summarizes the relevant history so a new agent does not
need to read the repository's large planning documents. Older artifacts remain immutable evidence.
If an older plan conflicts with this handoff, stop and follow this handoff plus the user's latest
instruction.

This document does not authorize a long run. One additional multi-hour run is available only after
all preflight gates below pass and the user gives a separate explicit `GO`.

## Mission

Improve palette extraction beyond canonical `region-graph-0.19.0` in visible complete-palette
quality. The next milestone is not another audit and not a slower reproduction of 0.19. It is a small,
fast human review showing several genuinely improved complete palettes with no regressions.

The rendered treatment is the unit of quality:

```text
(background, surface, field state, foreground, accent)
```

All roles must be selected jointly. Human feedback evaluates complete palettes, not isolated colors,
field labels, comments, or target hex values.

## User Directives

These constraints are current and non-negotiable:

- The feedback loop must run in seconds or minutes, never hours.
- At most one additional multi-hour research run is allowed after 2026-07-26.
- The one full run must use exactly ten parallel source workers.
- Successful source artifacts must be committed as work progresses.
- A crash or source failure must not require rerunning completed sources or completed stages.
- The full run must be designed and tested extensively on small samples first.
- Human review must happen before the full run whenever novel outputs need quality validation.
- The one full run requires a separate explicit `GO`; general permission to continue is not `GO`.
- The full run is final validation and cache population, not an iteration mechanism.

## Executive Diagnosis

The `native-complete-palette-0.2.x` line is not the desired improved extractor. It is a conservative,
incumbent-relative migration oracle:

- it accepts the 0.19 palette as an inference input;
- it builds an exhaustive native candidate domain;
- it evaluates a 27-component complete-tuple vector in five noncompensatory blocks;
- it replaces 0.19 only when a challenger componentwise strictly dominates the incumbent;
- it otherwise returns the exact canonical object;
- it computes eight exact ablation ledgers and extensive hashes for every source.

This architecture overcorrected for prior broad candidate failures. It optimized auditability and
zero-regression migration rather than visible quality. Version 0.2.5 changed 6/391 exact-source
groups, only 2 materially, and produced one human-preferred improvement. It is effectively a much
slower wrapper around 0.19.

Do not continue `0.2.x` as the product candidate. Preserve it as an exact legality/oracle artifact.

## Current Baseline And Custody

| Item | Current identity |
| --- | --- |
| Audit checkpoint | `107af0ac8b6ad03bd2b17cdc5ef46d0305aec1f2` |
| Canonical algorithm | `region-graph-0.19.0` |
| Development comparator | `research/data/results.json` |
| Development SHA-256 | `546a53979c651f7b20d6a741e0c60c63e6bb97869f93a22918e1de4b5e488fec` |
| `00` comparator | `research/data/holdout-results.json` |
| `00` SHA-256 | `5a7766dc9a41733fe76dcdd40c236ce4c394280143b0a246251570301daa7984` |
| Source roster | 392 paths, 391 exact encoded-source groups |
| Roster artifact SHA-256 | `8cb313d9be72a6f3765f43d2cc4c1cb3021bd09d66cbdebd95d34f44eda0f03d` |
| Roster semantic SHA-256 | `ab017ea6e3cffc52a1a3af94d40ad703afcdd5654bab13ffb7e6a66a3232868c` |
| Allowed exposed roots | `images`, `00` |
| Forbidden reserve roots | `10`, `11`, `12`, `13`, `14` |
| Runtime | Node `v25.8.1`, Darwin arm64 |
| Sharp / libvips | `0.33.5` / `8.15.3` |

Roots `10` through `14` remain source-inventoried but output-unseen. Do not list, read, decode,
render, hash into candidate evidence, or review them. Reserve access requires a later explicit human
authorization and is not part of this handoff.

The worktree is heavily dirty and contains extensive unrelated tracked and untracked research work.
Never reset, clean, revert, or reformat unrelated files.

## Complete-Palette Human Evidence

The read-only evidence inventory is:

```text
research/data/experiments/native-complete-palette-0.1.0-development/evidence-inventory.json
```

SHA-256:

```text
e3d775e15c105af0c94b321ca2a0e3422e30a53a4c86560f407f66f3458bb3ce
```

It reports 256 independent source groups supporting absolute complete-palette modeling and 210
supporting pairwise modeling. It preserves strong, acceptable, weak, unacceptable, ties,
neither-acceptable, and uncertainty separately. Comments are qualitative context only and must never
become target colors, directional labels, features, gates, or named-case patches.

This is enough evidence to attempt a small regularized complete-palette quality veto and pairwise
ranker once candidate alternatives have inference-time features. Do not train on factorized field
labels or free-text comments.

## Native Evidence Foundations

Reusable lower-level work already exists:

- native decode and source identity;
- native families, masks, exact pixel representatives, and role domains;
- observation profiles at maximum edges 448, 224, and 112;
- collapsed, distinct-flat, and gradient field hypotheses;
- connected chromatic overlay families kept out of field roles;
- exact-pair topology evidence;
- complete-tuple legality, provenance, APCA calculation, and certificate code.

Relevant frozen evidence identities:

| Artifact | SHA-256 |
| --- | --- |
| Native graph development | `990b3fb8370cb670831dcd0734b1bfdd1d17f58dd9fd617d3967698cc9fb8281` |
| Native graph analysis | `469b0547896bab3268a600083aa80b0865091d60df3c02d8f094211534bdde61` |
| Exact-pair transfer development | `cf7eede975536aa0fa50645d63c1f8c5158f19c971c3e81a09fe1dc730307d30` |
| Exact-pair transfer analysis | `17c31c78ae172b638e10171f598a10250bdcc89403f0b703546cf37ba177c4ca` |

The native graph is an evidence source, not a ranking authority. Prior analysis found useful desired
hypotheses often available but under-ranked.

## Candidate History

Do not resume an old candidate identity.

| Candidate | Outcome |
| --- | --- |
| `0.1.0` | Invalid provisional APCA `60/10` magnitude floors; rejected. |
| `0.2.0` | Threshold-free APCA fixed; validator applied challenger semantics to unchanged canonical; stopped. |
| `0.2.1` | Validator fixed; 120-second source ceiling failed. |
| `0.2.2` | Exact two-stream accounting added; exhaustive ablation accounting still exceeded 120 seconds. |
| `0.2.3` | 600-second source ceiling worked; external eight-hour command limit interrupted diagnostics. |
| `0.2.4` | Completed all work; independent verifier rejected canonical JSON object-key order incorrectly. |
| `0.2.5` | Mechanical Gate A passed; human Gate B failed. Product direction ends here. |

APCA policy in 0.2.5 is intentional: finite signed comparative evidence with zero magnitude floor.
Do not restore conventional `60 Lc`, `10 Lc`, WCAG, or other fixed contrast admission thresholds
without a new explicit consumer requirement.

## Verified 0.2.5 Artifact

Candidate: `native-complete-palette-0.2.5-development`.

| Item | SHA-256 |
| --- | --- |
| Policy | `f745f80c4bdb6a250850a7955bd64c8c86c8f189da8e8026e5d036539b8d9e28` |
| Protocol | `3ac4f14ee13380a217f6d7a560bd0bbd75f97017bc0e67e10731a390f09628b5` |
| Phase 5 manifest | `1c29c8c146a5c83e24b90a62e9d1b00c98b77604c490fa76c6b36953299cc760` |
| Results | `8141e2e0ae0b5360e1d108f858cdae3bdf44db25a2a4629abddc5caff9fd87a6` |
| Analysis | `13e81f5f16099c42b62270c24c77ef555ad668f0752464e581282acb4361c453` |
| Certificate index | `e34caaa34ab93a870956042b1fdae46cf8f2f8bfca5480307c8de96a54b5b7c3` |
| Certificate aggregate | `15b0f795b939b8722ee4ddfe335955e56252a0561740ffe24779290aee4febe2` |

Artifact root:

```text
research/data/experiments/native-complete-palette-0.2.5-development/phase-5/
```

Mechanical results:

- 391/391 base groups;
- 92/92 transformed diagnostics;
- 483 verified certificate shards;
- zero hard or certificate violations;
- exact canonical equality for unchanged groups;
- six exact changes, two material changes;
- no field-state, gradient, collapse, or generated-status transitions.

The certificate directory is approximately 78 MiB. Certificates retain staged field treatments,
topology queries, admitted vectors, and incumbent-dominating Pareto frontiers. They do not persist the
full `NativeCompletePalettePreparedEvidence` object or all incomparable complete tuples. Therefore
they can support narrow counterfactual analysis but cannot serve as a general standalone candidate
cache.

## 0.2.5 Changed Set And Human Outcome

Role order below is background, foreground, surface, accent.

| Source | Canonical to candidate | Material | Review |
| --- | --- | ---: | --- |
| `00/ab67616d00001e02000060b6aa68cdd9e02567b1.jpg` | `#fff/#000/#fff/#ef7488` to `#fff/#000/#fff/#e83555` | yes | candidate stronger; both strong |
| `00/ab67616d00001e020000fc67f78927f7b3e7f9c6.jpg` | `#fbfbfb/#000/#dadada/#3c3c3c` to `#fbfbfb/#000/#dadada/#131313` | yes | similarly valid; both strong |
| `00/ab67616d0000b2730000b93a4d26294998d82e57.jpg` | foreground `#c7c7c7` to `#cecece` | no | similarly valid; both strong |
| `00/ab67616d00001e02000061ef2044c5ca65d55e76.jpg` | accent `#403229` to `#443123` | no | similarly valid; both strong |
| `00/ab67616d0000b2730000c4e4d278f49bbc995440.jpg` | foreground `#4e4e4e` to `#4c4c4c` | no | similarly valid; both weak-fallback |
| `00/ab67616d00001e0200001ecff3d9ec20cac4b472.jpg` | accent `#838383` to `#858585` | no | similarly valid; both strong |

The weak case received the structured failure class `incomplete-artwork-identity`. Its comment is
qualitative context only. Do not extract the mentioned color as a target or add a source-specific
branch.

Review artifacts:

| Item | SHA-256 |
| --- | --- |
| Review manifest | `493ffd18a20c4794ba617a7fad623f99a14116c63d01dc38fc89a9b8cd44d45c` |
| Feedback | `8a54761fbccb9dab55ed32ae8fc0c4e8b66ae86fb9ba07ecd2fb2b7e42b52b91` |
| Analysis | `11605ef7952c15e5ca027d7d8aac415385bf7366095905be092d57135f37d818` |

Review root:

```text
research/data/experiments/native-complete-palette-0.2.5-development/review-v1/
```

Gate B failed only because candidate quality included one `weak-fallback`. Comparisons were one
candidate-stronger, five similarly valid, and zero baseline-stronger. Both hidden repeats were
consistent.

Seven of the 15 review pairs were intentionally identical unchanged controls. This was valid but
poor review design: it confused the reviewer and consumed nearly half the batch. Future batches may
contain at most three controls per 20 cases and at most two identical A/B controls.

The review server on port 3132 is stopped. Do not restart it unless explicitly needed.

## Runtime And Determinism Findings

The old full evaluator launched 966 child executions:

- 391 base groups twice: 782;
- 92 diagnostics twice: 184.

The second execution was a blanket exact-determinism check. It was not justified by an active random
scientific path:

- no active random-number call was found in native complete-palette inference;
- the repository's image-analysis `Math.random()` is inside uncalled `spatialCoherenceMethod`;
- native resizing and tuple ordering are explicit and deterministic;
- timing and RSS are excluded from scientific identity;
- every 0.2.5 scientific repeat matched exactly.

Observed one-execution workload from 0.2.5:

| Work | Serial hours | P50 | P90 | Maximum |
| --- | ---: | ---: | ---: | ---: |
| 391 base groups | 7.17 | 66.2 s | 113.0 s | 158.3 s |
| 92 diagnostics | 1.41 | 52.9 s | 106.5 s | 136.8 s |

Do not repeat successful full-run tasks. Determinism must be established with bounded preflight
samples, static closure checks, and cached cross-process tests.

## Strategic Reset

Canonical 0.19 becomes an external comparator only. The improved selector must not accept a 0.19
palette as an inference input, require incumbent componentwise domination, or silently reproduce
canonical as its primary strategy.

The new system has four layers:

1. candidate-independent image evidence;
2. bounded complete-palette alternative generation;
3. complete-palette absolute-quality veto and ranking;
4. external comparison against 0.19 for migration and review.

The first proof of progress is a small human review with several candidate wins. No full-roster run
is allowed before that proof.

## Layer 1: Reusable Image Evidence

Create a versioned evidence shard keyed by exact encoded-source SHA-256. It must contain enough
candidate-independent information to generate complete alternatives without opening the image again:

- source and native-raster identity;
- dimensions and canonical comparator binding;
- native families, masks or compact mask evidence, representatives, and exact pixel provenance;
- primary-field versus connected-overlay role domains;
- family support, stability, population, saliency, typography, chroma, and detail features;
- relation and exact topology evidence;
- canonical-independent foreground and accent source candidates;
- corruption-detecting hashes and reconciliation witnesses.

Do not include candidate thresholds, selected outputs, human labels, comments, filenames as features,
or reserve facts.

Implement and persist shards on demand for the small prototype panel. Do not populate all 391 sources
with a slow command before the candidate proves useful. The one final full run may complete the cache.

## Layer 2: Bounded Complete-Palette Alternatives

Build a bounded standalone generator from cached evidence. It must:

- jointly construct background, surface, field state, foreground, and accent;
- preserve hard legality, provenance, cardinality, collapse, and role-domain rules;
- allow at most four distinct role colors;
- use exact source colors except a declared black/white foreground fallback when no source foreground
  is feasible for that field treatment;
- forbid generated accents;
- keep connected-overlay families out of field roles;
- avoid postselection repair and filename-specific branches;
- output several materially distinct complete alternatives, not one exhaustive winner;
- expose complete inference-time feature vectors for ranking and review.

Remove exhaustive rejected-tuple serialization, eight ablation accumulators, and full-domain hashing
from the development path. Keep an image-bound reference implementation for sample parity and final
validation.

The bounded generator's retention rules and ceilings must be frozen only after sample tests prove
that useful exact-oracle candidates and human-acceptable alternatives are not being pruned. Do not
tune a cap around one named artwork.

## Layer 3: Complete-Palette Quality And Ranking

Separate absolute acceptability from preference.

### Absolute veto

Predict whether a complete palette is `weak-fallback` or `unacceptable`. A vetoed candidate cannot
win regardless of pairwise score.

### Pairwise ranker

Rank non-vetoed complete palettes while preserving ties and uncertainty. Use a small interpretable
regularized model, such as ordinal/logistic absolute quality plus Davidson/Bradley-Terry or ordinal
pairwise preference.

Permitted feature families:

- complete role and field-state evidence;
- family coverage and source identity coverage;
- exact provenance and fallback status;
- role distance, tone, and chroma relationships;
- multiscale and topology stability;
- finite signed APCA evidence with no fixed magnitude floor;
- bounded-generator margins and rank features available at inference time.

Forbidden features:

- paths, filenames, source IDs, batch or review IDs;
- comments, color names, target hex values, or reviewer prose;
- canonical preference labels or reserve membership;
- any feature unavailable at production inference.

Group all training and validation by exact source, stable artwork family, and known duplicate group.
Standardize and fit inside each fold. Compare against constant, deterministic, and 0.19 baselines.
If a learned ranker does not improve grouped prediction, retain a deterministic bounded ranker.

## Layer 4: External 0.19 Comparison

Run 0.19 only as an external baseline during development evaluation and human review. It may inform
migration reporting but cannot alter candidate generation or ranking.

The candidate must earn advancement through complete-palette outcomes:

- zero baseline-stronger judgments;
- zero weak-fallback or unacceptable candidate ratings;
- multiple independent candidate-stronger judgments;
- no positive-baseline to negative-candidate transition;
- complete source and provenance reconciliation.

## Required Feedback-Loop Budgets

Reject or redesign the architecture if it cannot meet these budgets on the bound host:

- cached single-source generation and ranking: P95 at most one second;
- cached 391-source candidate evaluation: at most one minute;
- cold 37-source development evaluation with ten workers: at most five minutes;
- review-manifest generation after candidate output: at most one minute;
- no ordinary development command longer than 15 minutes;
- total preflight work in any phase at most 45 minutes before a human checkpoint.

The one final exact run is exempt from these iteration budgets and requires explicit `GO`.

## Execution Plan

### Phase 0: Close And Preserve 0.2.5

- Write a terminal development-rejection record binding the review manifest, feedback, analysis, and
  failed Gate B clause.
- State that scientific legality passed but product quality did not.
- Preserve all phase-5 and review files byte-for-byte.
- Confirm port 3132 is not listening.
- Do not mutate `research/src/native-complete-palette.ts` under the 0.2.5 identity.

### Human Pause 0: Approve Reset Protocol

Before candidate implementation, present a short new protocol containing:

- standalone candidate identity;
- evidence schema identity;
- bounded generator limits;
- feature list and model class;
- small-panel source-selection policy;
- runtime budgets;
- review schema and gates;
- confirmation that the full-run allowance remains unused.

### Phase 1: Evidence Schema Prototype

Use synthetic fixtures plus four exposed real sources: three small/diverse sources and one prior
runtime-tail source. Persist evidence shards immediately.

Gates:

- exact deterministic round-trip;
- image-bound and cached evidence semantic equality;
- corruption, truncation, wrong-source, and wrong-policy tests fail closed;
- cache consumers provably cannot open source image paths;
- restart skips verified evidence shards;
- each command stays below 15 minutes.

### Phase 2: Bounded Alternative Generator

Build alternatives for a frozen 12-source engineering panel covering:

- collapsed, distinct-flat, and gradient treatments;
- generated and source foregrounds;
- chromatic and achromatic artwork;
- known incomplete-identity, wrong-background, collapse, gradient, and multi-hue risk classes;
- accepted diverse controls;
- high-complexity source graphs.

Risk classes select diagnostics only and never become inference branches or target labels.

For each source, emit four to eight materially distinct legal complete alternatives. Produce an
availability report separating:

- no acceptable family or representative available;
- acceptable ingredients available but no legal complete tuple;
- acceptable complete tuple available but under-ranked.

### Human Pause 1: Alternative Availability Review

Review complete alternatives for the 12-source panel. This review may be an absolute-quality gallery
rather than baseline A/B because its purpose is to test whether the domain contains shippable
options.

Record only structured complete-palette quality, uncertainty, and failure classes. Comments remain
qualitative.

Stop if the domain rarely contains an acceptable alternative. Fix candidate generation before any
ranker work.

### Phase 3: Quality Veto And Ranker

- Materialize inference-time features for historical complete-palette treatments.
- Reconcile them to the 256 absolute and 210 pairwise independent groups.
- Fit grouped deterministic cross-validation.
- Report calibration, source-balanced loss, ties, neither-acceptable, uncertainty, and feature
  ablations.
- Compare deterministic and learned rankers.

Stop if neither ranker can separate known acceptable and weak complete palettes out of source.

### Phase 4: Small Candidate Review

Freeze one candidate selector. Create a blinded A/B review against external 0.19 on 12 to 20 exposed
sources.

Review composition:

- every novel material candidate output;
- at most three controls total;
- at most two identical A/B controls;
- hidden repeats only when the total remains at most 20;
- no duplicate source presentations counted as independent evidence.

Gate:

- complete coverage;
- zero weak or unacceptable candidates;
- zero baseline-stronger judgments;
- at least three independent candidate-stronger judgments;
- repeat consistency reported;
- no structured provenance or technical failure.

If this gate fails, iterate from cached evidence. Do not run the full roster.

### Phase 5: Runtime And Parity Sample

Use a frozen 24-source sample containing all small-review changes, controls, prior runtime/RSS tails,
and deterministic diversity fill.

Verify:

- cached and image-bound implementations produce the same new-candidate output on 24/24;
- hard legality, provenance, field state, role domains, and finite APCA reconcile;
- one-worker and ten-worker cached schedules produce identical scientific results;
- interruption and restart skip completed stage receipts;
- cold 24-source wall time remains below 15 minutes;
- no process exceeds resource limits.

Parity means the cached and image-bound implementations of the new candidate agree. It does not mean
the new candidate must reproduce 0.19 or the 0.2.5 selector.

### Phase 6: Exposed Development Evaluation

Run the new candidate cold on the 37 development sources only, using ten workers and durable
per-source evidence. This must finish in at most five minutes. Review every novel material output not
already covered by exact presentation evidence.

Require the small candidate quality gate again. Do not infer broad quality from controls or comments.

### Human Pause 2: Candidate Direction

Present actual improvements, regressions, runtime, availability failures, model metrics, and all
review outcomes. The user chooses:

- refine quickly from cached evidence;
- freeze for the final full run;
- reject the direction.

### Phase 7: Freeze Full-Run Package

Only after the candidate visibly improves development:

- freeze code, policy, evidence schema, bounded selector, ranker, runtime, source roster, diagnostics,
  and implementation closure;
- freeze durable checkpoint and resume semantics;
- prove every preflight test;
- prove the full-run namespace is empty or validly resumable;
- present the exact ten-worker resource budget and predicted wall time.

### Human Pause 3: Explicit Full-Run `GO`

The full run does not start without the literal decision to launch it. The user has authorized one
such run in principle, not its immediate execution.

### Phase 8: The One Full Run

Operational details are summarized below and specified more fully in:

```text
research/NATIVE_COMPLETE_PALETTE_SINGLE_FULL_RUN_PLAN.md
```

That document's current SHA-256 is:

```text
ae7b259efe99d89f88e4e5bd9fd8ddae5275ac00cf3cc0444a0393d2727cf41e
```

The run must:

- use ten isolated workers;
- execute each successful base or diagnostic task once;
- persist evidence, candidate result, reference result, and receipt as separate atomic stages;
- write the receipt last as the completion marker;
- skip every verified completed stage on restart;
- allow same-protocol continuation only for failed or incomplete stages;
- refuse continuation after any code, policy, schema, roster, or runtime change;
- build aggregate indexes only after all source receipts verify;
- write `COMPLETE` last.

Restarting the byte-identical protocol to finish missing stages is continuation of the one run.
Rerunning completed sources is forbidden.

## Full-Run Durable Layout

Use a stable append-only namespace:

```text
full-run/
  protocol.json
  lock
  state.json
  evidence/base/<sha>.json.gz
  evidence/diagnostics/<mode>/<sha>.json.gz
  candidate/base/<sha>.json.gz
  candidate/diagnostics/<mode>/<sha>.json.gz
  reference/base/<sha>.json.gz
  reference/diagnostics/<mode>/<sha>.json.gz
  receipts/base/<sha>.json
  receipts/diagnostics/<mode>/<sha>.json
  failures/<logical-task>/<attempt>.json
  logs/<logical-task>/<attempt>.log
  indexes/
  COMPLETE
```

Flush each stage before atomic rename and flush its containing directory. A valid receipt binds byte
counts and SHA-256 values for all stages. On a source-local failure, stop scheduling new work but let
active valid workers finish and commit. Custody, source drift, protocol drift, or aggregate RSS
violations stop all workers immediately.

## Hard Legality To Preserve

These are not ranking preferences:

- at most four distinct role colors;
- coupled background, surface, and field-state semantics;
- exact collapse and gradient legality;
- exact source provenance for ordinary selected colors;
- generated black or white only as a necessary foreground fallback;
- no generated accent;
- connected-overlay families cannot become fields;
- role separation and cardinality legality;
- finite signed APCA evidence;
- no postselection mutation or repair;
- deterministic source-independent tie order;
- no reserve, filename, source-ID, review-case, target-hex, or comment branches.

Do not automatically preserve all 0.2.5 noncompensatory block thresholds or incumbent-dominance
requirements. Decide which are genuine legality constraints and which should become quality features
or veto evidence.

## Stop Conditions

Stop before the full run if any of these occurs:

- the bounded domain cannot produce acceptable alternatives on the small panel;
- the ranker fails grouped out-of-source prediction;
- small candidate review has any baseline-stronger or weak candidate;
- fewer than three independent candidate wins appear in the small review;
- cached full evaluation exceeds one minute;
- cold 37-source evaluation exceeds five minutes;
- cached/image-bound parity is not 24/24;
- resumability or corruption tests fail;
- implementation requires named examples, comments, or fixed target colors;
- any reserve root is accessed;
- proceeding would require weakening a failed gate.

Failure is useful evidence. Do not spend the remaining full run to discover a problem already visible
on a bounded sample.

## Minimal File Map

Read these files first; the large historical plans are optional unless a conflict must be diagnosed.

| File | Purpose |
| --- | --- |
| `research/PALETTE_EXTRACTION_QUALITY_RESET_HANDOFF.md` | This authoritative strategy and state summary. |
| `research/NATIVE_COMPLETE_PALETTE_SINGLE_FULL_RUN_PLAN.md` | Final-run durability and one-run mechanics. |
| `research/src/native-complete-palette.ts` | Existing exhaustive oracle, evidence types, and legality logic. Do not treat its selector as the product. |
| `research/src/native-field-hypothesis-graph.ts` | Native families, relations, profiles, representatives, and topology evidence. |
| `research/src/native-resolution-image.ts` | Bound native decode. |
| `research/src/native-complete-palette-evidence.ts` | Complete-palette human evidence inventory parser. |
| `research/evaluate-native-complete-palette.ts` | Old slow evaluator and artifact verifier. Never execute its sealed matrix command again. |
| `research/native-complete-palette-child.ts` | Old per-source image-bound child; useful only as a reference. |
| `research/data/experiments/native-complete-palette-0.2.5-development/phase-5/analysis.json` | Mechanical result summary. |
| `research/data/experiments/native-complete-palette-0.2.5-development/review-v1/analysis.json` | Human Gate B result. |
| `research/data/experiments/native-complete-palette-0.1.0-development/evidence-inventory.json` | Grouped complete-palette human evidence. |

## Safe Verification Commands

These are bounded and do not launch the old matrix:

```bash
NODE_NO_WARNINGS=1 node --experimental-strip-types --test \
  research/tests/native-complete-palette.test.ts \
  research/tests/native-complete-palette-evaluation.test.ts
```

Expected: 24/24 passing.

```bash
NODE_NO_WARNINGS=1 node --experimental-strip-types --test \
  research/tests/native-complete-palette-review.test.ts \
  research/tests/native-complete-palette-review-artifact.test.ts
```

Expected: 4/4 passing. The artifact test takes roughly 22 seconds because it verifies all stored
certificate shards.

Never run this command:

```bash
node --experimental-strip-types research/evaluate-native-complete-palette.ts --execute-sealed-matrix
```

It is the obsolete multi-hour 0.2.5 path.

The broad research suite historically had 16 unrelated failures caused by a changed `package.json`
hash. Do not regenerate old artifacts to silence those failures.

## Immediate Next-Agent Actions

1. Read this handoff only, then inspect scoped code and `git status`; do not read every historical plan.
2. Verify the listed hashes and confirm port 3132 is closed.
3. Write the terminal 0.2.5 development-rejection record without changing frozen artifacts.
4. Draft the short standalone quality-reset protocol for Human Pause 0.
5. Define the candidate-independent evidence shard schema and corruption tests.
6. Select the four-source Phase 1 prototype without opening reserve roots.
7. Present the protocol and sample before implementing a broad candidate.
8. Do not launch any full-roster or multi-hour command.

## Definition Of Progress

Progress is not more certificates, more ablations, or closer reproduction of 0.19.

Progress means:

- genuinely different complete alternatives are available;
- human reviewers rate them acceptable or strong;
- several are preferred over 0.19;
- none regress against 0.19;
- ranking learns general complete-palette quality rather than named examples;
- the iteration loop stays within the stated minute-scale budgets;
- the final full run remains unused until this is already demonstrated.
