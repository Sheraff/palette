# Gradient Eligibility 0.8 Sealed Validation

## Purpose

The `02/` artwork set is independent promotion-validation data for `gradient-eligibility-0.8.0-dev`. Version 0.8 and its evidence thresholds are frozen before extraction or review. The prior `00/` and `01/` sets remain development data and are used only for overlap exclusion.

## Corpus Seal

- Source files are grouped by the stable artwork identifier encoded after the first 16 filename characters.
- The preferred family anchor is the `ab67616d0000b273` source, then `ab67616d00001e02`, then any other source. Larger sources break ties.
- Every source byte hash and original dimension is recorded.
- Separate artwork identifiers sharing an exact source hash are deduplicated; the lexically first identifier is retained.
- Families overlapping `00/` or `01/` by artwork identifier or exact byte hash are excluded.
- Families exactly matching any source in the sealed music manifest are excluded.
- Internal source variants remain attached to one family and only the preferred anchor is evaluated.
- The manifest binds the protocol, prior-corpus inventory, canonical and candidate implementation files, versions, and thresholds.

## Evaluation

Canonical `region-graph-0.17.0` and the frozen eligibility candidate run together from one analysis context. The evaluator verifies that only the spatial gradient boolean changes and that every source still matches the sealed manifest.

Because the candidate is veto-only, every canonical-gradient-to-candidate-flat change is included in human review. Unchanged palettes are byte-for-byte canonical output apart from the retained gradient boolean and need no comparative judgment.

The review presents gradient and flat treatments with randomized placement and without identifying candidate output. Judgments apply only to the displayed background-surface pair. The reviewer may choose gradient, flat, either way, or no visible difference. Unanswered cases remain unknown and may represent uncertainty or unusable artwork.

## Promotion Rule

A decisive preference for the rejected gradient treatment is a sealed false rejection and fails version 0.8 promotion. Flat judgments support the veto. Either-way and no-visible-difference judgments show no decisive regression but are excluded from binary accuracy.

Any classifier adjustment made after seeing this round invalidates version 0.8 for promotion and requires another independent sealed corpus.

Canonical 0.17 remains unchanged regardless of the outcome.
