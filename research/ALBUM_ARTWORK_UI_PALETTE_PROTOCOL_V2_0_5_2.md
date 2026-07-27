# Album Artwork UI Palette Candidate Protocol V2 0.5.2

Status: predeclared bounded development path-continuity ranking experiment. Normative product direction
remains `research/ALBUM_ARTWORK_UI_PALETTE_PLAN_V2.md`. This protocol does not itself authorize future
sample opening, Phase 4, Phase 5, promotion, persistence, or full-roster execution.

## Purpose

Candidate `album-artwork-first-principles-0.5.2` replaces the failed `0.5.1` active-role utility
bottleneck with one narrower soft ranking signal. Its operational predecessor is `0.5.0`; failed
candidate `0.5.1` is used only for exact development-review transfer.

Candidate `0.5.0` legally admits a role when at least one complete-path APCA sample is outside the
library's literal zero-output dead zone. Its mean and worst-sample utilities penalize low contrast, but
its first ranking block does not distinguish a role that is observable over the complete path from one
that disappears at interior samples. This experiment adds that sampled-path continuity distinction
without rejecting either treatment.

## Path Observability

For a nonempty applicable role sample list:

`rolePathObservability = nonzeroAPCASampleCount / applicableSampleCount`.

- Nonzero means finite signed APCA Lc not equal to literal zero.
- Required foreground observability uses every applicable foreground sample.
- Distinct-accent observability uses every applicable accent sample.
- A collapsed accent contributes no independent path and inherits foreground path observability.
- `activeRolePathObservability` is the lower of required-foreground and effective-accent path
  observability.
- A fully observable treatment has `activeRolePathObservability = 1`.
- A mixed-zero treatment remains legal and receives a value strictly between zero and one.
- An all-zero required or distinct role remains illegal under the unchanged `0.5.0` admission rule.

The first priority block becomes:

`treatmentFoundation = cbrt(fieldStructure * artworkIdentity * foregroundUtility * activeRolePathObservability)`.

When path observability is one, this is numerically identical to the `0.5.0` foundation. The factor is
continuous over observed sample coverage, contains no fitted coefficient, and cannot exclude a legal
treatment. Existing mean and worst-sample utility formulas remain unchanged.

## Frozen Mechanisms

- Candidate `0.5.0` contrast sampling, peak-observability admission, and pre-quota availability closure
  remain unchanged.
- No APCA magnitude floor, utility cutoff, target color, gradient bonus, signature-color bonus, or
  source-specific branch is introduced.
- Candidate generation, field and role hypotheses, Pareto blocks, `0.04` evidence resolution,
  top-one priority order, eight-treatment diversity policy, and the 1,500-treatment bound remain fixed.
- Gradient contrast positions remain `0`, `0.25`, `0.5`, `0.75`, and `1` with OKLab interpolation.

## Source Custody

- Development remains restricted to the existing 28-source development panel.
- Development execution must reject every variant hash in both the opened Phase 4 sample and sealed
  future sample 02 before reading a development source.
- Future sample 02 manifest ID:
  `9ac421c0d4931b8fdd24ce8e628609dbac36652addc7c9dfdb65a814aaf20671`.
- Future sample 02 seal commitment:
  `9cfb3abb4719ba356539961d239408a25a91a2cb32e1a36fa803761a3e888846`.
- No future-sample path may be listed, read, hashed, decoded, rendered, or passed to candidate code.
- No opened Phase 4 source or feedback may participate in implementation, tuning, or a gate.

## Mechanical Gates

- Generic tests prove one-, two-, and five-sample path-observability values, including mixed-zero input.
- Generic tests prove that fully observable treatment foundation is exactly the `0.5.0` formula.
- Generic tests prove that mixed-zero coverage lowers foundation without changing peak eligibility.
- Every serialized retained treatment reports the derived active-role path observability and exact
  declared foundation.
- Per-source complete-candidate and Pareto-frontier counts are identical to `0.5.0`.
- Every `0.5.0` winner with full active-role path observability remains the exact `0.5.2` winner.
- Every changed winner, if any, replaces a `0.5.0` winner with mixed-zero active-role observability.
- At least one bounded development winner changes, proving that the mechanism is exercised.
- No winner changes gradient state or field-treatment class.
- Every returned role retains the `0.5.0` admission contract and every source remains within the
  unchanged 1,500-treatment bound.

## Review Transfer

No new human checkpoint is permitted by default. A changed `0.5.2` winner may transfer the completed
`0.5.1` blinded review only when all of the following are exact:

- source SHA-256;
- complete canonical role colors;
- gradient state;
- collapsed-role states;
- `0.5.0` predecessor treatment;
- the reviewed `0.5.1` candidate treatment; and
- a passing per-case `0.5.1` result under the predeclared ranking checkpoint.

Every changed winner must satisfy this transfer. A new or altered treatment, failed reviewed treatment,
fully observable predecessor change, custody failure, or mechanical failure returns the work to
development rather than opening another adaptive review.

## Advancement

Passing every mechanical gate and every exact review transfer makes `0.5.2` eligible for a separately
bound candidate-freeze artifact. It does not by itself open future sample 02. Future-sample execution
requires that frozen artifact and a separate one-way command. A full-roster run still requires a literal
`GO`.
