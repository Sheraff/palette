# E2 build brief — recursive field-like components (v0.5 field reading)

**Authored by the P5 orchestrator, 2026-08-04.** Source design: arm-f §2.2 (recursive field-like
extraction) and §2.5 (two-component reading). Pulled forward from deferral by round-2 evidence
(SPEC decision 12's E2 paragraph — the four covers and their notes). This brief is the contract
for the E2 worker; SPEC.md still governs everything it does not override.

## The mechanism

Today the field is one global robust fit, and when it explains < half the image the pipeline
retreats (flat mass colour) or rescues (two blocks). Round 2 showed what that loses: a sunset sky
that IS a gradient over 40% of the frame, an autumn-sky painting whose identity is its sky, a
vivid ground the global fit averaged away, a depicted polaroid that is literally a surface.

v0.5: when the global fit's explained fraction < 0.5, do not stop — **extract field-like
components recursively** (arm-f §2.2): run the same robust affine fit on the unexplained residual
support, repeatedly, collecting components that are both *extensive* and *smooth*; stop when no
remaining component qualifies. Then read roles off the component pool:

- **Background** = the colour/ramp of the most extensive field-like component.
- **Gradient** = that component's own ramp (its affine term over its own support), by the existing
  ramp machinery restricted to the component's support — the sunset's sky ramp, not a global fit.
- **Surface** = a second extensive component when one exists and separates (arm-f §2.5's
  two-component reading — the polaroid case); else the ramp's far end (existing rules); else
  collapsed.
- **Retreat** fires only when no component qualifies as field-like. The two-block rescue becomes a
  special case of the two-component reading and should merge into it, not survive beside it.
- Overlay/foreground/accent measure against the *local* component (the component a cluster sits
  on), which is arm-f's original local-field semantics — the existing affine `localField`
  approximation upgrades to component-local.

## Definitions the worker must pin (state each in code with provenance)

- **Extensive**: component support ≥ a stated fraction of the image (suggest 0.15, [UNCALIBRATED],
  diagnostics-reported). **Smooth**: component's own explained fraction over its support ≥ 0.5
  using the existing 4×bar radius (reuse the two constants; add none if possible).
- **Recursion depth**: hard cap (suggest 4) with the loop provably terminating (each iteration
  must claim a minimum support or stop).
- **Determinism**: identical to the rest of the prototype — no randomness, ties end at packed int.
- Component search must remain a *fit*, never a segmentation pass — no connected components, no
  masks as primitives; support = the pixels the robust fit's weights claim (soft, thresholded only
  at the stated points). The paradigm line (SPEC "Never segment first") still binds.

## Interface

`src/types.ts` gains `FieldComponent` and a `FieldReading` that carries the component pool; the
orchestrator updates types.ts on request — propose the exact types in your report BEFORE
implementing against them if they differ from: `FieldComponent { coefficients, support mass,
explainedFractionOwn, meanX, meanY, fieldAt(x,y) }`.

## Verification obligations

Synthetic: (a) an image that is 40% smooth ramp + 60% texture must yield the ramp component as
background WITH its gradient, not a retreat; (b) a flat panel over a distinct flat ground (the
polaroid shape) must yield the two-component reading with the panel as surface; (c) the v0.3
two-block covers must not regress (the two-component reading should subsume them); (d) full-image
smooth field must reproduce the current single-fit result bit-identically (the global fit is the
first component). Real: diagnose on the four evidence covers (`908479200b`, `16a8247378`,
`b948ee7f1b` stem, `28279e9184`) with expected qualitative outcomes stated per cover before
running. Determinism and full robustness run as always.

## Boundaries

Worker owns `src/fieldfit.ts` (component recursion), `src/ramp.ts` (support-restricted reading),
`candidate.ts` wiring, their tests. Everything else read-only. No commits. Report to
`reports/we2-pass1.md`, ≤400 words, data first. The orchestrator gates any types.ts change.
