# Album Artwork UI Palette Candidate Protocol V2 0.5.1

Status: predeclared bounded development ranking experiment. Normative product direction remains
`research/ALBUM_ARTWORK_UI_PALETTE_PLAN_V2.md`. This protocol does not authorize Phase 4, Phase 5,
promotion, persistence, future-sample opening, or full-roster execution.

## Purpose

Candidate `album-artwork-first-principles-0.5.1` isolates one soft complete-treatment ranking change.
Candidate `0.5.0` admitted distinct accents with peak APCA observability while preserving mean and
worst-sample contrast as soft evidence, but its first top-one priority considered foreground utility and
not distinct-accent utility. On the bounded development panel, that allowed a treatment with weak
accent utility to win before the accent-utility priority was reached.

This experiment changes only the `treatmentFoundation` formula. It does not change source analysis,
field or role hypotheses, contrast sampling or admission, candidate availability, Pareto blocks,
evidence resolution, priority-block order, diversity retention, or execution bounds.

## Active-Role Foundation

- `activeRoleUtility = min(foregroundUtility, accentUtility)`.
- `treatmentFoundation = cbrt(fieldStructure * artworkIdentity * activeRoleUtility)`.
- `foregroundUtility` and `accentUtility` retain their `0.5.0` formulas, including every applicable
  rendered field sample.
- A collapsed accent retains `accentUtility = foregroundUtility`, so its treatment foundation is
  numerically unchanged from `0.5.0`.
- A distinct accent whose utility is at least foreground utility is also unchanged.
- A distinct accent whose utility is weaker than foreground utility lowers the first ranking block
  continuously. The accent remains legal and may remain Pareto-optimal or win on the complete evidence.
- No new contrast floor, utility cutoff, fitted coefficient, gradient bonus, signature-color bonus, or
  source-specific branch is introduced.

This makes the weakest active text role part of complete-treatment foundation without promoting raw
accent utility to the globally dominant objective. It implements the plan requirement that a distinct
optional role earn its place while preserving artwork identity as a coequal foundation term.

## Frozen Mechanisms

- Candidate `0.5.0` peak-observability admission and pre-quota availability closure remain unchanged.
- Gradient contrast positions remain `0`, `0.25`, `0.5`, `0.75`, and `1` with OKLab interpolation.
- Pareto dominance continues to use the existing nine evidence blocks at `0.04` resolution.
- Top-one priority order remains `treatmentFoundation`, `fieldIdentity`, `fieldFidelity`,
  `fieldStructure`, `accentFidelity`, `accentUtility`, `artworkIdentity`, `foregroundUtility`,
  `representativeness`, `coherence`, and `economy`.
- The eight-treatment slate and 1,500-complete-treatment per-source bound remain unchanged.

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

- Generic tests prove that treatment foundation uses the lower active-role utility.
- Generic tests prove that collapsed accents preserve the `0.5.0` foundation exactly.
- Generic tests prove that lowering distinct-accent utility cannot increase treatment foundation and
  does not make a mixed-zero but peak-observable accent illegal.
- The bounded development run has the same per-source complete-candidate and Pareto-frontier counts as
  `0.5.0`.
- Every returned foreground and distinct accent continues to satisfy the `0.5.0` peak-observability
  contract, and all complete treatments remain within the 1,500-candidate bound.
- The run reports every changed winner, gradient state, field treatment, retained treatment, and score
  delta against `0.5.0`.
- No result from an opened or future directional sample participates in a gate.

## Human Checkpoint

Every development source whose top treatment changes from `0.5.0` must receive a blinded paired review
of the `0.5.0` and `0.5.1` winners. The reviewer records relative preference, absolute quality for both
treatments, declared issue tags, and an optional comment before identities are revealed.

The ranking revision may advance to candidate freeze only when:

- every changed `0.5.1` winner is rated `strong` or `acceptable`;
- no changed pair rates the `0.5.0` winner stronger; and
- every changed pair rates the `0.5.1` winner stronger or similarly valid.

Any predecessor-stronger result, weak-fallback or unacceptable new winner, custody failure, or mechanical
gate failure returns the work to development. Passing this checkpoint does not open future sample 02;
future-sample execution requires a separately frozen candidate and one-way execution step.
