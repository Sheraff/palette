# Native Complete-Palette Protocol 0.2.5

Status: Phase 2 independent-verifier correction freeze for
`native-complete-palette-0.2.5-development`. One fresh sealed Phase 5 development matrix is
authorized. Human review, review artifacts, reserve access, calibration, promotion, canonical
changes, and production integration remain unauthorized.

## Predecessor

This protocol succeeds the verifier-stopped `native-complete-palette-0.2.4-development`:

- policy SHA-256: `f745f80c4bdb6a250850a7955bd64c8c86c8f189da8e8026e5d036539b8d9e28`;
- protocol SHA-256: `235a93f3e4b21e5875c8e7d4a819a573816938a7a3c7fef769e7405e4046b9d5`;
- failure SHA-256: `7806520a2b64602df9c6a497a84716016d8eeea56f24d1e18516eefd02c2bf62`;
- generated manifest SHA-256: `5289146441fce06643f938878f7d5ba73a23378fe3ffef535e2d5b5c4bf966`;
- generated results SHA-256: `06a5b70c0942085378191b9988b53047b49e15974a636a65b7e52b370c1a66d8`;
- generated analysis SHA-256: `1abf245223675355602f334d36b2244f6887bfa224a28e314e86db19e4972813`;
- generated certificate-index SHA-256:
  `5c7f5dc33b6c7b4be5c54064bcadacb89d37ab4b9b0c49101bfb379277864911`.

Version 0.2.4 completed all 391 base groups and all 92 diagnostics, generated the complete staged
artifact, and then stopped during independent certificate verification. No candidate palette output
was inspected. The stopped namespace remains immutable and non-resumable; version 0.2.5 does not
reuse any candidate result, certificate, analysis, or diagnostic from it.

## Sole Change

The certificate producer creates all eight declared ablations in frozen policy order. Canonical
stable JSON intentionally serializes object keys in ASCII order. After parsing those bytes, JavaScript
therefore exposes the same exact keys in serialized order rather than declaration order.

Version 0.2.5 changes only independent certificate validation:

- compare the sorted actual ablation names with the sorted frozen names;
- continue to reject a missing, extra, duplicated, or misspelled name;
- continue to validate every ablation value in frozen policy order;
- add a test that validates a complete certificate after a stable-JSON round trip.

The correction changes no certificate bytes, tuple, component, threshold, block, Pareto decision,
tie order, diagnostic, Gate A rule, child process, resource ceiling, or scientific output.

## Unchanged Science And Execution

- Policy remains `native-complete-palette-policy-v2.3`, SHA-256
  `f745f80c4bdb6a250850a7955bd64c8c86c8f189da8e8026e5d036539b8d9e28`.
- APCA remains finite signed comparative evidence with no magnitude floor.
- Full main and eight ablation ledgers remain exact.
- Synthetic ablation science remains SHA-256
  `7e82ecb8a1be82bfbaccea9ecf3e59a209826bb5ba72a656ce7182c446201691`.
- Concurrency remains four, aggregate child RSS ceiling remains 5 GiB, and each child retains the
  600000-millisecond wall limit and 1.25 GiB RSS limit.
- Candidate: `native-complete-palette-0.2.5-development`.
- Protocol: `native-complete-palette-protocol-v2.5`.
- Canonical remains `region-graph-0.19.0`.
- Only `images` and `00` are authorized; roots `10` through `14` remain sealed.

The closure binds this protocol, its preparer, recursive runtime imports, focused tests, package
files, the threshold-free policy authority, and the complete 0.2.4 stop and rejection records. Any
further change requires another candidate identity. Human Pause 1 is reached only after a fresh,
complete, independently verified Gate A pass.
