# Gradient Eligibility 0.8.1 Sealed Validation

## Purpose

The future `03/` artwork set is independent promotion-validation data for frozen candidate `gradient-eligibility-0.8.1-dev`. Music artwork and `00/`, `01/`, and `02/` are development data. No version 0.8.1 threshold or implementation file may change after the `03/` manifest is sealed.

## Corpus Seal

- The source cohort must be sampled independently from the deployment artwork distribution before extraction. It must not be selected from candidate failures or deliberately enriched with physical-disc, CD-ROM, or other visually repetitive source modes.
- Source files are grouped by the stable artwork identifier encoded after the first 16 filename characters.
- The preferred family anchor is the `ab67616d0000b273` source, then `ab67616d00001e02`, then any other source. Larger sources break ties.
- Every source byte hash and original dimension is recorded.
- Separate artwork identifiers sharing an exact source hash are deduplicated; the lexically first identifier is retained.
- Families overlapping `00/`, `01/`, or `02/` by artwork identifier or exact byte hash are excluded.
- Families exactly matching any source in the music manifest are excluded.
- Internal source variants remain attached to one family and only the preferred anchor is evaluated.
- The manifest binds this protocol, prior-corpus inventory, canonical and candidate implementation files, versions, and thresholds.

## Evaluation

Canonical `region-graph-0.17.0` and the frozen candidate run together from one analysis context. The evaluator verifies that only the spatial gradient boolean changes and that every source still matches the sealed manifest.

Every canonical gradient is included in blinded human review, not only candidate removals. The review compares gradient and flat treatments with randomized placement and does not identify the candidate decision. Judgments apply only to the displayed background-surface pair. Every case must receive gradient, flat, either-way, or no-visible-difference; unanswered cases fail completion.

## Promotion Rule

Version 0.8.1 is promotion-eligible only when all conditions hold:

1. No candidate-removed case receives a decisive gradient judgment.
2. Every canonical gradient receives a stored response.
3. At least 40 candidate-retained cases receive a decisive gradient or flat judgment.
4. No more than 10% of decisive candidate-retained cases receive a flat judgment.

Either-way and no-visible-difference responses count toward completion but not the retained error-rate denominator. Any classifier adjustment after sealing invalidates this round for promotion and requires another independent corpus. Canonical 0.17 remains unchanged until an explicit promotion change.
