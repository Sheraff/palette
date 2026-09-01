# v4 Working Rules

## Goal

Build a workbench and library of many interchangeable algorithmic mechanisms. Do not select, reduce, or converge on one fixed or simple pipeline. The product spans the full path from an artwork image file, through progressively higher-level mechanisms, to a full UI palette.

Start with foundations that consume the artwork file. Validate their outputs, then progressively build later layers from those validated mechanism outputs. At every layer, try multiple competing mechanisms independently before the full algorithm exists.

Once mechanisms are individually validated, combine them into alternative end-to-end permutations. Tune those permutations and continue introducing replacements and new mechanisms.

## Mechanism Requirements

Every mechanism, or brick, must have:

- Known-good inputs.
- A robust, typed product input/output API.
- An independent, human-reviewable visualization.
- Its own performance score based on human feedback.
- Evidence for judging whether it is correct or buggy, useful or useless, and informative or noisy.
- Product output suitable for downstream mechanisms.

Visualization, scoring, and evaluation are essential test sidecars for independent validation. They do not count as downstream product connectivity. A mechanism must have both isolated testability and credible product integration. Do not judge a mechanism only through an unfinished full palette, and do not call a test-sidecar output a product sink.

## Graph Rules

The graph must map mechanisms, typed product handoffs, per-mechanism test sidecars, and exact missing upstream and downstream handoffs. A box is a mechanism. A product line is a typed handoff. Keep process, custody, diagnostics, and governance secondary and visually separate from the product mechanism graph.
