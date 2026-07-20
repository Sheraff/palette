# Gradient Eligibility 0.8.6 Sealed Validation

## Purpose

The `06/` artwork set is independent validation data for frozen candidate `gradient-eligibility-0.8.6-dev`. Music artwork and `00/` through `05/` are development data. The `07/` corpus is an untouched reserve and is not inspected or bound by this round. No version 0.8.6 threshold or bound implementation file may change after the `06/` manifest is sealed.

## Corpus Seal

- The source cohort must come from the deployment artwork distribution and must not be selected from candidate outcomes or known failure modes.
- Extensionless sources are accepted only when decoded metadata identifies JPEG content.
- Sources are grouped by the stable artwork identifier encoded after the first 16 filename characters.
- The preferred family anchor is the `ab67616d0000b273` source, then `ab67616d00001e02`, then any other source. Larger sources break ties.
- Every source byte hash and original dimension is recorded and every family variant is reverified during evaluation.
- Separate artwork identifiers sharing an exact source hash are deduplicated; the lexically first identifier is retained.
- Families overlapping `00/` through `05/` by artwork identifier or exact byte hash are excluded.
- Families exactly matching any source in the music manifest are excluded.
- Internal source variants remain attached to one family and only the preferred anchor is evaluated.
- The manifest binds this protocol, prior-corpus inventory, canonical and candidate implementation files, versions, thresholds, and runtime.

## Evaluation

Canonical `region-graph-0.17.0` and the frozen candidate run together from one analysis context. The evaluator verifies that only the spatial gradient boolean changes and that every sealed source still matches the manifest.

Human review first covers every candidate-removed canonical gradient. If there are more than 25 removals, deterministic batches continue until all are reviewed. Only if removal safety passes does review continue with deterministic candidate-retained samples. Every batch contains at most 25 cases, compares gradient and flat treatments with randomized placement, and does not identify the candidate decision. Judgments apply only to the displayed background-surface pair. Selected-colors-not-identifiable remains distinct from either-way and no-visible-difference, and every presented case must receive a stored response.

## Interpretation

The candidate can be recommended for promotion only when all conditions hold:

1. Every candidate-removed case is reviewed and none receives a decisive gradient judgment.
2. At least 20 sampled candidate-retained cases receive a decisive gradient or flat judgment.
3. No more than 10% of decisive sampled candidate-retained cases receive a flat judgment.
4. Every presented case receives a stored response.

If a retained batch yields fewer than 20 cumulative decisive responses, deterministic retained batches continue without changing the candidate. Either-way, no-visible-difference, and selected-colors-not-identifiable responses do not enter the retained error-rate denominator. Any classifier adjustment after sealing invalidates this round for promotion and requires another independent corpus. Canonical 0.17 remains unchanged until an explicit promotion change.
