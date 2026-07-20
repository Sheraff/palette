# Gradient Eligibility Sealed Validation

## Purpose

The `01/` artwork set is an independent validation corpus for `gradient-eligibility-0.7.0-dev`. It is not development data. The candidate implementation and source manifest are frozen before extraction or review.

## Corpus Seal

- Source files are grouped by the stable artwork identifier encoded after the first 16 filename characters.
- The preferred family anchor is the `ab67616d0000b273` source, then `ab67616d00001e02`, then any other source. Larger sources break ties.
- Every source byte hash and original dimension is recorded.
- Separate artwork identifiers sharing an exact source hash are deduplicated; the lexically first identifier is retained.
- Families overlapping `00/` by artwork identifier or exact byte hash are excluded.
- Families exactly matching any source in the sealed music manifest are excluded.
- Internal source variants remain attached to one family and only the preferred anchor is evaluated.
- The manifest binds the canonical and candidate implementation files, versions, and thresholds.

## Evaluation

Canonical `region-graph-0.17.0` and the frozen eligibility candidate run together from one analysis context. The evaluator verifies that only the spatial gradient boolean changes. Source hashes must still match the sealed manifest.

Because the candidate is veto-only, every canonical-gradient-to-candidate-flat change is included in human review. Unchanged palettes do not need another comparative judgment: they are byte-for-byte canonical output.

The review presents gradient and flat treatments without identifying which is canonical or candidate output. A reviewer may choose gradient, flat, either way, or skip the case. Skipped and either-way cases do not become binary truth labels.

## Promotion Rule

This round is validation evidence, not a new threshold-fitting set. A decisive preference for the rejected gradient treatment is a sealed false rejection. Any classifier adjustment made in response invalidates version 0.7 for this round and requires another independent corpus for promotion evidence.

Canonical 0.17 remains unchanged regardless of the outcome.
