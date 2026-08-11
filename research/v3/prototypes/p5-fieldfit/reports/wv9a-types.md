# W-V9a — type proposals for `src/types.ts` (the orchestrator's file; nothing moved)

Everything below currently lives in `src/marks.ts` and is exported from there. `types.ts` is not
this pass's file, so this is a proposal, and nothing depends on where the shapes live.

## 1. The four shapes

| shape | what it is | where it belongs |
|---|---|---|
| `PixelBox` | inclusive pixel box | a general shape; `FieldComponent` could use one too |
| `MarkRegion` | one piece of material: a field-like component taken whole, or a connected group of the fit's rejections | beside `OverlayCluster` — it is the third member of the candidate union |
| `MarkScaleChoice` | the scale sweep's whole `N(r)` curve, the chosen rung and which criterion chose it | beside `RampContinuity`, for the same reason: an `[UNCALIBRATED]` criterion whose curve must be readable in the sidecar |
| `MarkReading` | the entries, the scale, `massRetained` | beside `OverlayReading` / `FieldReading` |

## 2. Two fields that need a ruling, not just a home

**`MarkRegion.mass` is in pixel-weight units** — `Σ w` over a region's claim, `Σ(1 − w)` over a
mark's support. That is `componentPoolEntry`'s existing precedent for the two halves of one fit, and
it makes regions and marks rankable against each other. But `IdentityFamily.mass` is a **pixel
count**, so `identityFamiliesV2` publishes an `IdentitySet` whose mass is not v1's quantity. Both are
measured (`MarkRegion.pixels` beside `mass`); which one the identity set should rank on is the
orchestrator's, and the report's §(b) table is the evidence.

**`MarkRegion.inkShaped` beside `inkLike`.** `inkLike` is SPEC decision 15a's verdict, unchanged.
V9a measures it to be **inert at the mark site**: `groundAdjacency` is 1.000 on every mark of all
seven probed covers, because a mark is the field's complement and its whole outward boundary is
therefore field-claimed. `inkShaped` is the same instrument with that conjunct dropped —
`erosionMortality ≥ COMPONENT_INK_MORTALITY`, no new constant — which is arm-e-r3's original
polarity recovered at the one site where an ink really does sit on a ground. **Proposed, not
adopted**; nothing reads it.

## 3. If V9b wires it

`Analysis` would carry `marks: MarkReading | null` exactly as v0.7.1 carried `PathExcursionReport`
and v0.8.0 carried `AssignmentTrace`: measured by the decision, printed by `diagnose.ts`, read by
nothing that decides — until V9b's accent candidacy and foreground preference read it, which is the
change that needs `ALGORITHM_VERSION` to move.
