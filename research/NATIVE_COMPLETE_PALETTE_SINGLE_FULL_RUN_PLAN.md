# Native Complete-Palette Single Full Run Plan

Status: design freeze pending explicit launch approval. This document records the user's authorization
for at most one additional multi-hour research run after 2026-07-26. It does not launch that run.
Implementation, bounded tests, artifact-only analyses, and small exposed-source samples may proceed
before launch. Reserve access, calibration, promotion, and canonical changes remain unauthorized.

## Decision

The old sealed matrix is not an acceptable development loop. It coupled image evidence extraction,
exhaustive complete-tuple inference, eight exact ablations, duplicate determinism executions,
diagnostics, and terminal publication into one all-or-nothing command.

The replacement has three boundaries:

1. immutable candidate-independent image evidence, persisted once per exact source;
2. a fast bounded selector used for development iteration without image decoding;
3. an exact oracle used only for small parity samples and the one final full run.

The remaining multi-hour allowance is consumed only when the frozen final protocol starts its first
full-roster worker. Restarting that exact protocol to finish missing tasks is continuation of the same
run, not a new run. A code, policy, schema, source-roster, runtime, or implementation-hash change
invalidates continuation and does not authorize another full run.

## Why The Old Run Repeated Everything

Version 0.2.5 ran every successful task twice and compared exact scientific output, excluding only
elapsed time and memory fields. This was a blanket audit precaution against accidental randomness,
worker scheduling effects, unstable ordering, image-library drift, and compression drift.

The runtime audit found:

- no active random-number use in native complete-palette inference;
- the only repository `Math.random()` in image analysis is inside the uncalled
  `spatialCoherenceMethod` function;
- native graph resizing is explicit deterministic integer area-box sampling;
- k-means initialization and iteration are deterministic;
- tuple enumeration and all scientific tie-breaking use explicit stable order;
- timing and RSS are already excluded from scientific identity;
- every 0.2.5 repeat matched exactly.

Repeating every exhaustive solve was therefore disproportionate. The final run executes each task
once. Determinism is proven before launch using synthetic tests, cross-process cached-evidence tests,
worker-count tests, and bounded real-source repeats.

## Existing Runtime Measurement

The verified 0.2.5 artifact contains these observed timings:

| Work | Executions | Serial hours | Median | P90 | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Base, duplicated | 782 | 14.35 | 65.8 s | 113.1 s | 158.4 s |
| Diagnostics, duplicated | 184 | 2.83 | 52.9 s | 115.2 s | 137.6 s |
| Base, one execution projected | 391 | 7.17 | 66.2 s | 113.0 s | 158.3 s |
| Diagnostics, one execution projected | 92 | 1.41 | 52.9 s | 106.5 s | 136.8 s |

The one-execution workload is 8.58 serial hours. Seven workers have a 1.23-hour ideal wall time.
The operational estimate is 1.5 to 2.5 hours after contention, verification, and durable writes.

## Hard Run Budget

- Exactly 391 base exact-source tasks and 92 transform tasks are scheduled.
- No successful task is repeated during the full run.
- Exactly seven isolated workers may execute concurrently.
- Each worker processes one source at a time.
- libvips concurrency is fixed to one per worker to avoid hidden oversubscription.
- Each worker retains the 600000-millisecond wall ceiling and 1.25 GiB RSS ceiling.
- Aggregate declared worker RSS is 8.75 GiB; aggregate live RSS stops at 10 GiB.
- The host binding remains Node 25.8.1, Darwin arm64, Sharp 0.33.5, and libvips 8.15.3.
- Sources remain limited to `images` and `00`; roots `10` through `14` remain forbidden.

## Reusable Evidence Boundary

Each base source produces a candidate-independent evidence shard before candidate selection begins.
The shard is keyed by exact encoded-source SHA-256 and contains:

- encoded-source identity, byte count, native dimensions, and native-raster SHA-256;
- canonical 0.19 extraction binding and canonical complete palette;
- native graph version, policy identity, counts, families, representatives, and relations;
- exact representative pixel indexes, RGB values, provenance, role domains, and support features;
- canonical family queries;
- the complete topology-query input set and exact topology results required by every retained field
  treatment;
- field-treatment identities and candidate-independent field component values;
- hashes and reconciliation witnesses sufficient to verify the shard without decoding the image;
- no candidate policy thresholds, selected tuple, review label, comment, or reserve fact.

The evidence schema must support `selectNativeCompletePaletteFromCachedEvidence` without a native
raster. Exact pixel linkage is trusted only through the frozen extraction implementation, source and
raster hashes, representative witnesses, and artifact verification. The existing
`selectNativeCompletePaletteFromEvidence` remains the image-bound reference implementation.

## Fast Development Evaluator

The fast evaluator consumes only evidence shards and canonical bindings. It must never open source
images. It uses a bounded or dominance-safe selector proven against the exact oracle.

Performance gates before the full run:

- one cached source evaluates in at most one second at P95;
- all 391 cached base sources evaluate in at most five minutes on the bound host;
- changing ranking or an incumbent-relative admission rule does not rebuild image evidence;
- ordinary development output excludes full rejected-tuple ledgers and exhaustive ablation hashing;
- selected tuples, block values, Pareto witnesses, and source provenance remain reconstructable;
- every fast result is deterministic across one-worker and seven-worker schedules.

The existing 0.2.5 certificates are the first exact oracle. Their retained field treatments,
topology queries, complete Pareto frontiers, vectors, and semantic keys support artifact-only
counterfactual tests for changes such as material-difference admission. They are not treated as a
general substitute for the new reusable evidence schema.

## Durable Run Layout

The full run uses one stable append-only namespace rather than a non-resumable staging directory:

```text
research/data/experiments/<candidate>/full-run/
  protocol.json
  lock
  state.json
  evidence/base/<source-sha256>.json.gz
  evidence/diagnostics/<mode>/<source-sha256>.json.gz
  fast/base/<source-sha256>.json.gz
  fast/diagnostics/<mode>/<source-sha256>.json.gz
  exact/base/<source-sha256>.json.gz
  exact/diagnostics/<mode>/<source-sha256>.json.gz
  receipts/base/<source-sha256>.json
  receipts/diagnostics/<mode>/<source-sha256>.json
  failures/<logical-task-key>/<attempt>.json
  logs/<logical-task-key>/<attempt>.log
  indexes/
  COMPLETE
```

For each task, the worker performs these transactions:

1. verify the protocol, implementation closure, source path, source bytes, and canonical binding;
2. write evidence to a unique temporary file, flush it, atomically rename it, and flush its directory;
3. write and flush the fast result;
4. write and flush the exact result and certificate;
5. compare fast and exact output under the frozen parity contract;
6. write the success receipt last, including every byte count and SHA-256;
7. flush the receipt directory before reporting task completion.

A receipt is the sole completion marker. A source with valid evidence but no receipt resumes at the
first missing stage. Existing valid stages are never recomputed. Temporary files are not evidence and
may be removed after their owner process is proven dead.

## Resume And Failure Semantics

The scheduler acquires one physical lock and verifies every existing receipt before launching work.
It skips completed tasks only when protocol, implementation, source, canonical, evidence, fast-result,
and exact-result hashes all match.

Failure handling is class-specific:

- custody, protocol, implementation, or source drift kills all workers immediately;
- aggregate RSS violation kills workers immediately;
- a source-local timeout, process failure, or invalid result stops new scheduling but allows active
  valid workers to finish and commit their receipts;
- process or machine interruption loses only unreceipted stages;
- a failure record retains the exact task, stage, attempt, stderr, resource observations, and hashes;
- continuation may retry only failed or incomplete stages under the byte-identical protocol;
- completed successful stages are never rerun merely to regain determinism confidence.

Final indexes and aggregate analysis are built only after all 483 receipts verify. Publication creates
the `COMPLETE` marker last. Index-generation failure is resumable and never invalidates source shards.

## Pre-Run Phase 1: Remove Nondeterminism Risk

Before candidate work:

- replace or remove the unseeded sampling in the unused legacy function so the scientific closure
  contains no `Math.random()`;
- add a static closure test forbidding random, time, locale-dependent ordering, and environment-driven
  scientific branches;
- require explicit ASCII comparators for scientific sorting;
- freeze libvips and worker concurrency;
- prove gzip output has deterministic headers and bytes;
- verify resource and timing fields are excluded from scientific identity.

No full-roster execution is permitted if any nondeterminism test fails.

## Pre-Run Phase 2: Evidence Prototype

Implement the evidence schema and cached selector on:

- synthetic collapsed, distinct-flat, gradient, generated-foreground, and four-color fixtures;
- three small real exposed sources;
- one high-complexity exposed source from the 0.2.5 timing tail.

Required checks:

- image-bound and cached evidence have exact semantic equality;
- the cache round-trips through stable JSON and gzip;
- corruption, truncation, wrong source, wrong raster, and wrong implementation hashes fail closed;
- no cache consumer opens an image path;
- interrupted writes leave no valid receipt;
- restart skips verified stages and resumes only the missing stage.

Each prototype command has a 15-minute ceiling. Total Phase 2 wall time may not exceed 45 minutes.

## Pre-Run Phase 3: Fast Selector Parity

Use the 0.2.5 artifact to develop and test the intended successor policy without image access.
For material-change admission, filter challengers using the already-frozen 0.025 OKLab,
gradient-state, and generated-status definition before final selection.

Then run exact image-bound parity on a frozen 24-source sample containing:

- all six 0.2.5 exact changed sources;
- all five named matrix controls;
- the highest prior elapsed-time and RSS sources;
- deterministic SHA-selected fill sources;
- collapsed, distinct-flat, gradient, source-foreground, and generated-foreground coverage.

Required gates:

- exact selected palette equality on 24/24;
- exact route, block, vector, and provenance equality on 24/24;
- no source timeout or RSS violation;
- identical cached results with one worker and seven workers;
- restart tests prove completed sample stages are skipped;
- sample wall time remains below 45 minutes.

## Pre-Run Phase 4: Human Development Check

Before the full run, construct the predicted changed frontier from cached/counterfactual evidence.
Reuse existing judgments only when source bytes and both complete visible presentations are exactly
equal to the frozen 0.2.5 review. Present every novel material output in blinded complete-palette
review, with at most 20 cases per batch.

The same Gate B applies:

- complete coverage;
- zero weak-fallback or unacceptable candidate ratings;
- zero baseline-stronger judgments;
- at least one candidate-stronger judgment;
- zero positive-baseline to negative-candidate transitions;
- zero provenance or technical failures;
- ties, neither-acceptable, uncertainty, and comments remain nondirectional.

If predicted development review fails, no full run occurs. Refinement remains fast and cache-based.

## Human Go/No-Go Pause

Immediately before the sole full run, present:

- frozen candidate, policy, evidence-schema, fast-selector, exact-oracle, runtime, and implementation
  hashes;
- all deterministic and corruption-test results;
- 24-source exact parity results;
- predicted full changed frontier and complete development-review disposition;
- measured cached full-corpus runtime;
- seven-worker sample RSS and wall-time projections;
- empty or verified resumable run namespace;
- confirmation that reserve roots remain unopened.

The full run requires a separate explicit `GO` after this package. General approval to continue
research is not launch approval.

## The Single Full Run

After `GO`:

- schedule 391 base tasks once with seven workers;
- durably commit evidence, fast output, exact output, and receipt per source;
- derive the frozen 23-source diagnostic cohort after all base receipts verify;
- schedule its 92 transform tasks once with seven workers;
- independently verify every receipt and shard;
- verify fast/exact parity for every task;
- build indexes and Gate A analysis from receipts;
- write `COMPLETE` last.

No automatic second execution is allowed. A same-protocol continuation processes only missing or
failed stages.

## Final Full-Run Gates

- 391/391 base receipts and 92/92 diagnostic receipts;
- zero hard, certificate, custody, or source violations;
- zero fast/exact selected-palette mismatches;
- zero fast/exact route, vector, and provenance mismatches;
- exact canonical equality for every unchanged source;
- at least one and at most 40 material changed exact-source groups;
- all evidence shards independently verifiable without image decoding;
- all receipt and aggregate hashes reconcile;
- no reserve access and no interpreted comment target;
- cached full-corpus evaluation remains within the five-minute development budget.

Failure does not authorize gate weakening or another full run. Valid completed artifacts remain usable
as research evidence and reusable cache under their exact identities.

## After The Run

Future exposed-data experiments operate from evidence shards. Ranking, admission, and bounded-search
changes must finish in minutes and may use small image-bound parity samples. Another full image run is
outside this authorization.

Reserve validation remains a separate human decision after all development gates pass. Promotion and
canonical changes remain separately authorized decisions.
