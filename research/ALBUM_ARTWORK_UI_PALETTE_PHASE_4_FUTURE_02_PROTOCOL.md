# Album Artwork UI Palette V2 Phase 4 Future Sample 02 Protocol

Status: predeclared one-way fresh directional evaluation. This protocol authorizes exactly one
candidate-first extraction of the frozen `0.5.2` candidate and the frozen external baseline over the
12 sealed preferred sources in future sample 02. It does not authorize adaptation, another attempt,
Phase 5, promotion, persistence, or full-roster execution.

## Frozen Candidate

- Candidate version: `album-artwork-first-principles-0.5.2`.
- Implementation SHA-256: `ea1205ebd2d33abf99d8eed8a0e5e7625f1af6722dbe7879c90350c23d36fd40`.
- Candidate freeze ID: `8a401a451b1c824c70ad1f0394870719b6786f092e27a19eda8a4b626fa7b01b`.
- Candidate freeze raw SHA-256: `782b90d43e001eb04ee7bde89f67095c15e5fa0be346f7db39559d82b5ae7f75`.
- Frozen runtime: Node `v25.8.1`, Darwin, arm64.
- The runner must revalidate the freeze identity, every declared implementation-file hash and byte
  count, and the exact evaluator implementation hash before publishing an execution protocol.
- New execution wrappers are outside the candidate freeze and must be bound separately by raw hashes
  and static import closures.

## Future Sample

- Sealed manifest path:
  `research/data/album-artwork-palette-v2-future-sample-02.sealed.json`.
- Raw SHA-256: `2224603f5a4801cedf9f96375e86f2dd5624ed6895ab941fbcad5c6d8646fc8c`.
- Manifest ID: `9ac421c0d4931b8fdd24ce8e628609dbac36652addc7c9dfdb65a814aaf20671`.
- Seal commitment: `9cfb3abb4719ba356539961d239408a25a91a2cb32e1a36fa803761a3e888846`.
- Exactly 12 independent root-`10` families are opened.
- Exactly one variant per family is used: the unique variant whose path equals the sealed
  `preferredSourcePath`.
- Alternate variants and reserve roots `11` through `14` remain unopened.
- Before output-directory creation, the runner must rebuild and fully verify the seal from its
  authorized metadata inputs without listing or opening artwork.

## External Baseline

- Baseline version: `region-graph-0.19.0`.
- Entry points remain `loadImage(bytes)` from `research/src/image.ts` and
  `extractPalette(image).methods.spatial` from `research/src/extract.ts`.
- The complete baseline static import closure is fixed in the execution protocol before candidate
  extraction.
- Historical POC.10 source-result matching is not applicable to root `10` and is not used.
- Baseline scientific identity excludes nondeterministic `diagnostics.processingMs`; dimensions,
  algorithm version, and the complete spatial result remain bound.
- Baseline code and closure are fixed before candidate output but no baseline source is opened until
  every candidate artifact is durably complete and validated.

## One-Way Execution

- Experiment namespace:
  `research/data/experiments/album-artwork-palette-v2-0.5.2-phase-4-future-02`.
- Runner accepts no arguments and refuses an existing namespace.
- The immutable execution protocol is exclusively and durably published before any root-`10` artwork
  source is opened.
- Candidate extraction uses at most six separate child processes.
- Candidate and baseline read and custody-check every selected source independently.
- Baseline extraction is sequential in separate child processes after a durable candidate-complete
  marker.
- There is no force, overwrite, reuse, resume, or automatic retry mode.
- Any partial opening consumes future sample 02. Failure preserves partial output and publishes a
  no-retry failure marker when possible.
- Every source read requires the bound direct-child path, physical non-symlink regular-file identity,
  stable device/inode/size through `O_NOFOLLOW`, exact byte count, and exact SHA-256 before decode.
- Candidate closure must not import the baseline child, `research/src/extract.ts`, or
  `research/src/image.ts`.
- Candidate and baseline output, runtime, scientific payload, normalized presentation, and all private
  provenance are hash-bound.

## Side Assignment And Review

- Assignment domain: `album-artwork-palette-v2-phase-4-side-assignment-v1`.
- Assignment key:
  `SHA256(domain || NUL || future seal commitment || NUL || preferred-source SHA-256)`.
- Keys sort in ascending lowercase hexadecimal order; collisions fail closed.
- The first six cases show candidate as A and the last six show candidate as B.
- The shared presentation is background-dominant, uses all four roles and the gradient state, and labels
  colors with `colornames-oklab@0.6.0` only after extraction.
- Algorithm identities and assignments remain private during review.
- Review version: `album-artwork-palette-v2-phase-4-future-02-review-v1`.
- Review server uses the explicit future manifest and feedback paths through `REVIEW_MANIFEST_PATH` and
  `REVIEW_FEEDBACK_PATH`; defaults are not used for this round.
- Each case records independent absolute quality for A and B, one relative comparison, the three
  declared issue tags, and an optional verbatim comment.
- Every nonempty comment requires a separately recorded technical interpretation bound by comment
  SHA-256 before aggregate analysis.

## Directional Gate

After all 12 responses and comment-bound interpretations are complete, report relative counts, absolute
candidate and baseline quality, issue tags, technical classes, and runtime. Advancement requires all
three conditions:

- candidate-stronger count is greater than baseline-stronger count;
- at least 7 of 12 candidate treatments are `strong` or `acceptable`; and
- no technical failure class occurs at least twice.

This remains a small deterministic directional sample, not a population-wide estimate. Passing the
gate does not independently authorize Phase 5, promotion, persistence, or a full-roster run; those
require a separate decision. Failing the gate returns development to a newly sealed future sample and
forbids adaptation or rerun on future sample 02.
