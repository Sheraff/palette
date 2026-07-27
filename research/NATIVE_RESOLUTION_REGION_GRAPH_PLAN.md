# Native-Resolution Region Graph Development Plan

## Status

This plan freezes a development-only follow-up to the published native scale-space evidence audit. It authorizes palette extraction and a blinded review of changed development outputs. It does not authorize a canonical change, holdout disclosure, tuning from individual review responses, or promotion.

The frozen canonical algorithm remains `region-graph-0.19.0`.

An initial `region-graph-0.19.0-native-resolution-0.1.0-development` artifact was mechanically published and then stopped before review, with zero feedback, because its additive loader modified `research/src/image.ts`. That shared file belongs to the published native scale-space audit's frozen recursive closure, so the otherwise additive change correctly tripped the predecessor's generic artifact verifier. Version `0.1.1` moves the byte-identical native decode policy into an experiment-owned module, restores the predecessor closure exactly, and uses new experiment, policy, scientific, artifact, pair, and review identities. The stopped `0.1.0` output is historical execution evidence only and is not review-authorized.

## Question

Does allowing `region-graph-0.19.0` to discover regions and candidates at the decoded native dimensions recover materially different candidates that produce preferable spatial palettes, when every downstream candidate-scoring, role-enumeration, role-selection, contrast, surface, accent, and gradient policy remains unchanged?

The experiment ID is:

`region-graph-0.19.0-native-resolution-0.1.1-development`

## Frozen Baseline

| Contract | Value |
| --- | --- |
| Algorithm | `region-graph-0.19.0` |
| Development artifact | `research/data/results.json` |
| Raw artifact SHA-256 | `546a53979c651f7b20d6a741e0c60c63e6bb97869f93a22918e1de4b5e488fec` |
| Source count | `37` |
| Decode and analysis dimensions | Sharp `0.33.5`, oriented and alpha-flattened sRGB, max-edge `224` |

The baseline artifact is read, hash-checked, and never recomputed by the comparison runner.

## Frozen Treatment

The treatment changes only the raster supplied to the existing `extractPalette` function:

1. Decode through the installed Sharp runtime with orientation, alpha flattening onto white, sRGB conversion, and three uchar channels.
2. Do not resize.
3. Require positive dimensions and no more than `2,100,000` decoded pixels.
4. Invoke the unchanged `region-graph-0.19.0` extraction implementation on that native raster.
5. Change only the emitted experiment version to `region-graph-0.19.0-native-resolution-0.1.1-development`.

The treatment policy is `region-graph-native-resolution-policy-v2`. The policy adds only the implementation-isolation declaration; its canonical policy SHA-256 is exported by `research/src/native-resolution-extract.ts` and bound into protocol and manifest artifacts before execution.

No scale-dependent threshold, SLIC parameter, candidate cap, candidate score, family rule, solver rule, role constraint, contrast floor, gradient rule, or selector order may change under this identity. The iterative maximum over region labels is an exact implementation repair for native-size arrays; it does not alter label values.

## Cohort And Execution

Run the exact ordered 37-entry development roster from the frozen baseline artifact. Each source runs in a fresh child process so retained native planes cannot accumulate across sources.

| Limit | Bound |
| --- | --- |
| Source bytes | Existing native loader byte bound |
| Decoded pixels | `2,100,000` |
| Child timeout | `120,000` ms |
| Child maximum RSS | `1,073,741,824` bytes |
| Child stdout | `4,194,304` characters |
| Child stderr | `1,048,576` characters |

Any source failure invalidates the complete 37-source artifact. Limited runs are smoke tests and cannot be published as the development result.

## Difference Definitions

Exact candidate differences are multiset differences over `(rgb, lowercaseHex)`, preserving duplicate multiplicity.

Material candidate differences use deterministic maximum-cardinality one-to-one bipartite matching. A baseline and treatment candidate may match when their OKLab Euclidean distance is at most `0.025`; adjacency is ordered by distance and then treatment index. Unmatched treatment candidates are materially added and unmatched baseline candidates are materially removed.

For palette roles, a role materially changes when its generated status differs or its OKLab Euclidean distance is greater than `0.025`. A method materially changes when any role materially changes or its gradient `isGradient` boolean changes. Scores and continuous gradient diagnostics are recorded but do not independently enter the review queue.

The `0.025` boundary is inherited unchanged from the repository's established pairwise review policy in `research/src/review-queue.ts`; it was not selected from this experiment's outputs.

## Artifact

The complete artifact namespace is:

`research/data/experiments/region-graph-0.19.0-native-resolution-0.1.1-development/`

It contains immutable protocol, comparison, treatment-result, review-manifest, and manifest files. The manifest binds raw SHA-256 values for every immutable file, the baseline artifact, source bytes, the recursively discovered local static-import closure, declared test/presentation extras, package lockfiles, policy identity, and review identity. Publication uses exclusive staging and atomic rename; an existing final namespace is never overwritten.

Processing time and maximum RSS are retained as diagnostics. Timestamps and timing are excluded from scientific identity. Treatment results retain the complete extraction payload needed to verify hard gates and render review palettes.

## Review Queue

The primary endpoint is the spatial palette because it is the canonical product method. Expressive and quantized differences remain diagnostics and are not reviewed under this protocol.

A source enters the review queue exactly when:

1. Its frozen baseline entry has `review: true`.
2. At least one spatial role materially changes, or the spatial gradient `isGradient` boolean changes.

Entries with `review: false`, including generated diagnostic variants, remain in the comparison artifact but cannot enter review. Unchanged palettes cannot enter review. Queue membership and order are frozen in `review-manifest.json` before the first response.

Review identity is `native-resolution-spatial-pair-review-v2`. For each source, left/right assignment is deterministic from SHA-256 over the review identity, a NUL byte, the immutable comparison scientific identity, a NUL byte, and the source-relative path. Algorithm labels, versions, diagnostics, candidate lists, and changed-role markers are hidden during judgment.

The reviewer sees the source artwork and equally rendered left/right complete theme previews. For each pair the reviewer records:

- preference: `left`, `right`, or `tie`;
- shippability: `left`, `right`, `both`, or `neither`;
- zero or more fixed reasons: `background`, `foreground`, `surface`, `accent`, `unfaithful`, `flat`, `unreadable`, `tiny-detail-dominates`, `missing-gradient`, `unnecessary-gradient`, `unnecessary-surface`, or `missing-source-color`;
- an optional note of at most 500 characters.

Responses are append-only and bound to the source hash, pair hash, review identity, presentation version, and side assignment. Analysis unblinds only after every queued pair has one valid response.

## Decision Rule

This development review cannot promote the treatment.

After complete review, count baseline-preferred and treatment-preferred responses; ties do not count as wins. Separately count each side as shippable when the response is that side only or both.

The exact native-resolution treatment may advance to a new, independently frozen validation identity only if:

1. treatment-preferred responses strictly exceed baseline-preferred responses; and
2. treatment-shippable responses are at least baseline-shippable responses; and
3. all structural, source, memory, timeout, and existing extraction hard gates pass.

Otherwise this exact native-resolution treatment stops. Individual development responses may motivate a separately planned mechanism, but they cannot tune or rerun this identity.

Even if the development rule passes, validation must evaluate the complete frozen `00/` roster before output-aware inspection, account for native runtime and memory costs, and use a new experiment identity. No claim about generalization or canonical quality follows from this difficult 37-source development cohort.

## Verification Order

1. Focused native loader, adapter, comparison, output, artifact, and review tests.
2. Scoped strict TypeScript over every new or changed native experiment file.
3. Largest-source extraction smoke test.
4. Three-source isolated comparison smoke test.
5. Complete 37-source no-publish comparison.
6. Exclusive publication of the complete development artifact.
7. Generic artifact verification from manifest contents.
8. Blinded review tooling smoke test without submitting feedback.
9. Human completion of the frozen queue.
10. Unblinded analysis and application of the fixed decision rule.
