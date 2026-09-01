# Native Complete-Palette Protocol 0.2

Status: Phase 2 scientific freeze for `native-complete-palette-0.2.0-development`. Implementation,
synthetic verification, and one sealed Phase 5 development matrix are authorized. Human review,
review artifacts, reserve access, calibration, promotion, and canonical changes remain unauthorized.

## Successor Boundary

This protocol succeeds the development-rejected `native-complete-palette-0.1.0-development`. It
retains the complete tuple domain, noncompensatory blocks, incumbent-relative Pareto rule, custody,
resources, diagnostics, controls, certificates, and stop rules frozen by:

- `research/NATIVE_COMPLETE_PALETTE_PROTOCOL.md`, SHA-256
  `046b3d17d149be5a805c99d258c6e78d557d62c770f26d58d48d04cc7e398d2c`;
- its protocol artifact, SHA-256
  `1bd672e2599f33fcaebe1afa677f5fdb33873db6897fe4a042dd85ee945b6e29`;
- its failure artifact, SHA-256
  `ca74422360dc0bfb131675428006a6876747f0e7a66309a316cfb535e96884f5`;
- its rejection artifact, SHA-256
  `fc8c1a3e433b356828526aa2756fbdf2269356c7bcd42659e15fba8aebc9f2b5`.

Version 0.2 changes exactly one architectural hypothesis: fixed APCA magnitude floors are removed
from feasibility and semantic-block acceptance. This restores the threshold-free contrast direction
already declared by `research/NEXT_PALETTE_SOFT_CONTRAST_PLAN.md`, SHA-256
`8f42e5b797e3935be744ab1cc7e5399eb9f8d4b8e672df5a9b6bf75e478f8785`.

## APCA Policy

APCA is signed comparative evidence, not a font-independent accessibility veto.

- Every evaluated foreground-to-field and accent-to-field APCA value must be finite and exactly
  recomputable with the bound `apca-w3` implementation.
- No positive or negative APCA magnitude is required for admission. Both declared minima are zero.
- Polarity is the sign of `Lc`; values within numeric epsilon of zero have `none` polarity.
- The signed decision margin is `abs(Lc)` and every finite decision passes the APCA evidence contract.
- Foreground APCA components retain `clamp01(abs(Lc)/120)` as monotonic comparison evidence.
- Accent APCA components retain `clamp01(abs(Lc)/20)` as monotonic comparison evidence.
- All four APCA component acceptance thresholds are zero. Their normalizers are not consumer floors.
- A challenger may win only through the unchanged componentwise Pareto rule; stronger APCA cannot
  compensate for a failed non-APCA component, and weaker APCA cannot dominate stronger APCA.
- Canonical incumbents and challengers are never rejected solely for low finite APCA magnitude.

For each field treatment, an exact-source foreground is structurally eligible when its APCA values
are finite, its role domain is permitted, its RGB differs from both fields, and at least one permitted
exact-source accent can complete the tuple under the frozen duplicate and distance constraints.
Generated black or white remains legal only when no such source foreground can form a complete tuple
for that treatment. Accent remains exact-source-only. All existing role-duplicate and distance
constraints are applied during complete-tuple feasibility.

## Unchanged Scientific Policy

All other 0.1 policy statements remain byte-semantically unchanged:

- jointly select `(background, surface, fieldState, foreground, accent)`;
- maximum four distinct emitted colors;
- primary-only field roles and overlay-only connected families;
- exact native source provenance for every nonfallback selected color;
- complete collapsed, distinct-flat, and gradient field treatment enumeration;
- no generated accent or newly introduced foreground/accent collapse;
- exact collapse, gradient, distance, cardinality, finite-evidence, and immutability constraints;
- the same 27-component order and all 23 non-APCA component thresholds;
- five noncompensatory blocks and strict componentwise incumbent dominance;
- the same deterministic tie order and eight constrained ablations;
- no postselection mutation, repair, veto, named-source branch, comment target, or hidden label.

## Identity And Custody

- Candidate: `native-complete-palette-0.2.0-development`.
- Protocol: `native-complete-palette-protocol-v2`.
- Policy: `native-complete-palette-policy-v2`.
- Canonical comparator: `region-graph-0.19.0`, SHA-256
  `546a53979c651f7b20d6a741e0c60c63e6bb97869f93a22918e1de4b5e488fec`.
- Source roster, native graph, family query, topology scorer, evidence inventory, controls, runtime,
  resource ceilings, ordering, and changed frontier are unchanged from 0.1.
- Only roots `images` and `00` are authorized for the matrix.
- Roots `10` through `14` remain forbidden and must not be listed, read, hashed, decoded, rendered,
  inferred over, or reviewed.

The implementation closure includes this protocol, the preparation script, evaluator, child,
candidate module, recursive local runtime imports, package files, and the three focused tests. Its
exact paths and raw hashes must be frozen in `protocol.json` before any 0.2 candidate output exists.

## Phase 5 And Stop Rules

The Phase 5 process, repeat determinism, certificate transport, source schedule, diagnostics,
artifact ceilings, publication, and Gate A rules remain unchanged except for their 0.2 identities
and paths. A low finite APCA magnitude is not a hard accessibility violation. Nonfinite or
irreproducible APCA remains a technical violation.

The evaluator must stop before candidate inspection on any structural, provenance, role-domain,
distance, cardinality, collapse, determinism, resource, custody, certificate, or publication failure.
It must reject without review after a complete matrix if Gate A fails. Human Pause 1 is reached only
after a complete Gate A pass. Any further scientific change requires a new candidate identity.
