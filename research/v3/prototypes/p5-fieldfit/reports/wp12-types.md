# W-P12 — proposed additions to `src/types.ts` (ratify-then-move)

Implemented off local declarations in `src/components.ts`, which I own; nothing below is required for
v0.7.0 to work, and nothing outside `components.ts` / `fieldfit.ts` imports these shapes.

## 1. `InkStatistics`

```ts
/** SPEC decision 15's two shape measurements over one support. Never a colour. */
export type InkStatistics = Readonly<{
	/** |support| after the texture closing — the denominator both fractions are taken over. */
	closedPixels: number
	/** 1 − survivors of the erosion at the ink scale, over `closedPixels`. */
	erosionMortality: number
	/** Fraction of the support's outward 4-neighbour boundary whose neighbour is field-claimed. */
	groundAdjacency: number
}>
```

Currently in `src/components.ts` beside `FieldComponent`, the same pattern `FieldComponent` and
`FieldReading` themselves used before `wp10-types.md` ratified them.

## 2. Two fields on `FieldComponent`

`ink: InkStatistics | null` and `inkLike: boolean`. `null` marks a level the ink test never reached
(never accepted, so never measured); `inkLike` is decision 15a's verdict. `FieldComponent` already
lives in `components.ts`, so this is a note rather than a request — it moves whenever that type does.

## 3. Nothing proposed for `Diagnostics`

`diagnose.ts` prints the per-component ink row off `Analysis.fieldComponents`, which already carries
the whole pool. Adding a mirror to `Diagnostics` would be the `REPORTED_` mistake v0.6.1 deleted.

## 4. Withdrawn: the overlay-side shape

An earlier draft of this pass added `InkedOverlayCluster` / `InkedOverlayReading` for decision 15b.
Both are **withdrawn** — 15b is not implemented, because the instrument measures nothing on a
bar-neighbourhood cluster (mortality 1.0000 on 60 of 60 measured candidates; see `wp12.md` §2 and the
block in `src/overlay.ts`). If a mark-level support ever exists — arm-f's deferred scale-space mark
grouping is the shape of the thing that would supply one — the request returns with it.
