# Album Artwork UI Palette V2 Phase 4 Future Sample 03 Protocol

Status: predeclared one-way source-independent directional evaluation. This protocol authorizes exactly
one candidate-first extraction of frozen candidate `album-artwork-first-principles-0.6.0` and the frozen
external baseline over the 12 sealed preferred sources in future sample 03. It does not authorize
adaptation, retry, Phase 5, promotion, persistence, or full-roster execution.

## Frozen Candidate

- Candidate version: `album-artwork-first-principles-0.6.0`.
- Implementation SHA-256: `3f25579340ec3dea5efaa0d8aeeceb35483610b7519fa8892a5b99a96261f315`.
- Candidate freeze ID: `d2a06b035931ffe70186c27f8436c0f8f68e14f8245638f741146b8d78a0d843`.
- Candidate freeze raw SHA-256: `d446d606fad926d30ecf702fc9c9c7605cd9444dc054d767aa1e7e91ab1080b8`.
- Frozen runtime: Node `v25.8.1`, Darwin, arm64.
- The runner must revalidate the freeze identity, all declared implementation-file hashes and byte
  counts, and the exact evaluator implementation hash before publishing its execution protocol.
- Execution wrappers are outside the candidate freeze and are bound separately by raw hashes and static
  import closures.

## Future Sample

- Sealed manifest path:
  `research/data/album-artwork-palette-v2-future-sample-03.sealed.json`.
- Raw SHA-256: `690e85ace6377fd154db1124754dfb7d876c64a3c063f8b567e0e219d88f0183`.
- Manifest ID: `bee665792a4ddfaeb3541aa5e58181c8f3a0685836b13475643d9deccace4060`.
- Seal commitment: `139d9c9fe72838c9618f0cb575cda34d1b7b54c8e83a9d1446034c76b35b75ba`.
- Exactly 12 independent root-`11` families are opened.
- Exactly one variant per family is used: the unique variant whose path equals the sealed
  `preferredSourcePath`.
- Alternate variants and reserve roots `12` through `14` remain unopened.
- Before output-directory creation, the runner must rebuild and fully verify the seal from authorized
  metadata inputs without listing or opening root-`11` artwork.

## External Baseline

- Baseline version: `region-graph-0.19.0`.
- Entry points remain `loadImage(bytes)` from `research/src/image.ts` and
  `extractPalette(image).methods.spatial` from `research/src/extract.ts`.
- The complete baseline static import closure is fixed in the execution protocol before candidate
  extraction.
- Historical source-result matching is not used.
- Baseline scientific identity excludes nondeterministic `diagnostics.processingMs`; dimensions,
  algorithm version, and the complete spatial result remain bound.
- No baseline source is opened until every candidate artifact is durably complete and validated.

## One-Way Execution

- Experiment namespace:
  `research/data/experiments/album-artwork-palette-v2-0.6.0-phase-4-future-03`.
- Runner accepts no arguments and refuses an existing namespace.
- The immutable execution protocol is exclusively and durably published before any root-`11` artwork
  source is opened.
- Candidate extraction uses at most six separate child processes.
- Candidate and baseline custody-check and read every selected source independently.
- Baseline extraction is sequential in separate child processes after a durable candidate-complete
  marker.
- There is no force, overwrite, reuse, resume, or automatic retry mode.
- Any partial opening consumes future sample 03. Failure preserves partial output and publishes a
  no-retry failure marker when possible.
- Every source read requires the bound direct-child path, physical non-symlink regular-file identity,
  stable device/inode/size through `O_NOFOLLOW`, exact byte count, and exact SHA-256 before decode.
- Candidate closure must not import the baseline child, `research/src/extract.ts`, or
  `research/src/image.ts`.
- Candidate and baseline output, runtime, scientific payload, presentation, and private provenance are
  hash-bound.

## Side Assignment And Review

- Assignment domain: `album-artwork-palette-v2-phase-4-side-assignment-v1`.
- Assignment key:
  `SHA256(domain || NUL || future seal commitment || NUL || preferred-source SHA-256)`.
- Keys sort in ascending lowercase hexadecimal order; collisions fail closed.
- The first six cases show candidate as A and the last six show candidate as B.
- The shared background-dominant presentation uses all four roles and gradient state; color names are
  presentation-only output from `colornames-oklab@0.6.0`.
- Algorithm identities and assignments remain private during review.
- Review version: `album-artwork-palette-v2-phase-4-future-03-review-v1`.
- Each case records independent absolute quality for A and B, one relative comparison, the three
  declared issue tags, and an optional verbatim comment.
- Every nonempty comment requires a separately recorded technical interpretation bound by comment
  SHA-256 before aggregate analysis.

## Directional Gate

After all 12 responses and comment-bound interpretations are complete, report relative counts,
candidate and baseline quality, issue tags, technical classes, and runtime. Advancement requires all
three conditions:

- candidate-stronger count is greater than baseline-stronger count;
- at least 7 of 12 candidate treatments are `strong` or `acceptable`; and
- no technical failure class occurs at least twice.

This is a small deterministic directional sample, not a population-wide estimate. Passing does not
authorize Phase 5, promotion, persistence, or a full-roster run. Failing triggers the agreed approach
reassessment; no adaptation or rerun on future sample 03 is permitted.
