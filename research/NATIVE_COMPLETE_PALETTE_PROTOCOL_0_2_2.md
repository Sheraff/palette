# Native Complete-Palette Protocol 0.2.2

Status: Phase 2 exact evaluation-architecture freeze for
`native-complete-palette-0.2.2-development`. One sealed Phase 5 development matrix is authorized.
Human review, review artifacts, reserve access, calibration, promotion, canonical changes, and
production integration remain unauthorized.

## Predecessor

This protocol succeeds the resource-stopped `native-complete-palette-0.2.1-development`:

- policy SHA-256: `cc1a44c481700a009b231a56e4cf0946f282cb68b5a9f8323b0c0ee15ff93552`;
- protocol SHA-256: `917fcd6169d15871977eee05b9e6bf2b0da6ba10c7a13fb2773c79dbc8bfaf12`;
- failure SHA-256: `4e5ce9c1f65851e882e76c1cb40ed34bfb263de499d09c82805ba38c9d4ef083`;
- rejection SHA-256: `f0250f83df3083cf26caac45958dd650f5169c7fcf4132a718d5865dbadaafb1`;
- protocol source SHA-256:
  `4f2ecb94dcf04d745951efffabe262cb8bc8e09456cfb402ef5fda1d6453e1c9`.

Version 0.2.1 passed the APCA-policy and unchanged-incumbent stop points, completed 19 exact-source
groups, and then exceeded the frozen 120-second child ceiling in a two-source window containing the
largest known exposed native graph. That graph has 276 field hypotheses and 54 representatives. The
old implementation could evaluate up to `276 * 54 * 54 = 804816` tuples separately for the main
selection and each of eight ablations, for a nine-pass upper bound of 7243344 evaluations before the
mandatory deterministic repeat.

## Exact Two-Stream Evaluation

Version 0.2.2 changes only the exhaustive research evaluation architecture:

1. Enumerate the standard complete-tuple domain once in the original field, foreground, and accent
   order.
2. Route each attempted tuple to independent accumulators for the main result and every applicable
   canonical-background, canonical-surface, canonical-field-state, canonical-field-block,
   canonical-foreground, canonical-accent, and canonical-overlay-block ablation.
3. Preserve each accumulator's independent counts, feasible-domain hash, dominance witnesses,
   admitted-domain hash, exact Pareto frontiers, and selection.
4. Enumerate one separate `without-connected-family-local` stream because removing connected
   representatives can change per-treatment generated-foreground necessity and therefore changes the
   tuple domain rather than merely filtering it.

Tuple routing preserves the exact relative order each former independent pass observed. No tuple is
pruned, approximated, cached across sources, ranked early, or omitted. The two streams retain the
same hard-feasibility decisions, component values, block decisions, hashes, witnesses, frontiers,
and winners that nine independent streams produced.

The frozen synthetic complete fixture's eight-ablation scientific projection must remain SHA-256
`7e82ecb8a1be82bfbaccea9ecf3e59a209826bb5ba72a656ce7182c446201691` after excluding only the renamed
execution declaration (`freshRun` becomes `independentAccumulator`).

## Scientific Policy

All palette science remains unchanged from 0.2.1:

- APCA is finite signed comparative evidence with no magnitude admission floor;
- all 27 component formulas and thresholds are unchanged;
- all five noncompensatory blocks and strict incumbent-relative Pareto rules are unchanged;
- complete field, foreground, accent, and tuple domains are unchanged;
- generated foreground necessity, provenance, role, distance, collapse, cardinality, tie, and
  immutability rules are unchanged;
- unchanged canonical output remains exact and challenger hard constraints remain challenger-only.

Policy `native-complete-palette-policy-v2.1`, SHA-256
`36c007c65ce6141247a1e236da5580c2d397664022e62b17d14fb1b91d53c588`, differs from v2 only by its
honest declaration of independent exact ablation accumulators and the two-stream execution rule.

## Research Boundary

This exhaustive solver is a research oracle for testing the complete-tuple hypothesis and producing
reconstructable certificates. It is not a proposed production runtime. A later standalone or
production candidate must use a bounded selector, compiled ranking policy, or separately proven
dominance-safe pruning strategy under a new identity and must reproduce the frozen scientific result
on its bound corpus.

## Execution And Custody

- Candidate: `native-complete-palette-0.2.2-development`.
- Protocol: `native-complete-palette-protocol-v2.2`.
- Canonical: unchanged `region-graph-0.19.0`.
- Roster: unchanged 392 paths and 391 exact-source groups.
- The 120-second/1.25-GiB child bounds, concurrency two, repeat requirement, diagnostics, controls,
  changed frontier, artifact limits, publication, and Gate A rules remain unchanged.
- Only roots `images` and `00` are authorized.
- Roots `10` through `14` remain sealed and forbidden.

The closure binds this protocol, its preparer, recursive runtime imports, focused tests, package
files, the threshold-free policy authority, and the complete 0.2.1 stop record. Any further change
requires another candidate identity. Human Pause 1 is reached only after a complete Gate A pass.
