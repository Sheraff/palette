# Region Graph 0.6.0 Review

The complete immutable round is in `region-graph-0.6.0.json`.

All three perceptually changed 0.6-versus-0.5 iteration pairs were reviewed under presentation version 2.

## Iteration Comparison

- 0.6 preferred: 3
- 0.5 preferred: 0
- No preference: 0
- Only 0.6 shippable: 1
- Only 0.5 shippable: 0
- Both shippable: 1
- Neither shippable: 1
- Total shippable for 0.6: 2
- Total shippable for 0.5: 1

YBBB's restored black accent was preferred and made only 0.6 shippable. Toxicity's red accent was preferred while both versions remained shippable. Disney's orange accent was preferred, but neither version was shippable.

## Findings

- Disney still collapses background and surface to pink despite four large background fields. Representing another field as accent is helpful but does not solve the surface-role failure.
- The saturated-title and dark-detail accent rules are supported on their targeted cases.
- Four additional spatial-versus-quantized submissions repeated unchanged 0.5 pairs and are excluded as new algorithm evidence.
- Baseline and expressive queues must preserve judgments when neither candidate changed perceptually; tying completion only to algorithm version causes unnecessary duplicate review.

## Reviewer Change

- Carry the latest baseline or expressive judgment forward when both candidate palettes remain within `0.025` OKLab per role and retain the same gradient decision.
- Re-queue changed pairs, presentation changes, and comparisons with no prior judgment.
- Keep the source algorithm version in carry-forward metadata rather than copying or rewriting feedback records.
- Remove already-completed comparisons from the active queue and reject duplicate submissions server-side.

## Post-Archive Addendum

Three duplicate iteration judgments were submitted after the immutable archive was created because completed pairs were still displayed. They repeat the original Disney, Toxicity, and YBBB decisions exactly, remain preserved in the append-only feedback store, and are not counted as additional independent evidence. The archive was not rewritten.

Disney's multi-background surface problem remains open for a later solver experiment.
