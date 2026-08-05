# W-P10 — proposed `types.ts` additions (v0.6.0)

`src/types.ts` is frozen; these are the fields v0.6 measures and prints but cannot yet carry in
`Diagnostics`. Everything below is **implemented and live** — it hangs off `Analysis` in
`candidate.ts` and is printed by `diagnose.ts` — so adopting the proposal is a move, not a build.
Nothing reads any of it: both blocks are computed after the palette is assembled.

## 1. The t-continuity discriminator (SPEC decision 5, ruling 2026-08-05)

`RampContinuity` is exported from `src/ramp.ts` today (module-local types are the `components.ts`
precedent). If it moves into `types.ts`, `Diagnostics` gains one field:

```ts
/** What the t-continuity discriminator measured, or null when the chord never left the artwork. */
continuity: RampContinuity | null
```

```ts
export type RampContinuity = Readonly<{
	/** Inlier mass in the chord's middle third, over the inlier mass inside the chord's span. */
	middleBandMass: number
	/** Inlier mass inside the chord's span, over all inlier mass. */
	spanMassFraction: number
	/** middleBandMass < CONTINUOUS_MIDDLE_BAND_MASS: two blocks, not one bent field. */
	bimodal: boolean
}>
```

Why it belongs in the sidecar: since the ruling, `bimodal` is the **only** route from `readRamp` to
`twoBlockFallback`, so this is the number that says *why* a cover reads as a ramp or as two blocks.
`twoBlockFallback` alone can no longer answer it, and the constant it is compared against is
`[UNCALIBRATED]` with exactly two anchor covers.

## 2. Margins (round-3 cross-arm note 6)

```ts
/** Distance, bar and ratio for every pair the contract judges, plus the two prototype gates. */
margins: MarginReport
```

`MarginReport`, `PairMargin` are exported from `candidate.ts` today; they import nothing the
prototype does not already import. Six pairs (`background×surface`, `foreground×accent` at the
elevated bar, foreground and accent against each end), each with `distance`, `bar`, `ratio` and a
`collapsed` flag; plus `foregroundLegibility` (`min|raw APCA|` over the published ramp at the
**contract's** sampling density, its floor, their ratio) and `accentTwin` (distance, bar, ratio,
`ACCENT_FG_EXCLUSION_MULTIPLE`, clearance).

## 3. One export request outside `types.ts`

`candidate.ts` currently mirrors two `const`s from `src/overlay.ts` to report them:
`FOREGROUND_MIN_RAW_APCA = 15` and `ACCENT_FG_EXCLUSION_MULTIPLE = 8` (as
`REPORTED_FOREGROUND_MIN_RAW_APCA` / `REPORTED_ACCENT_FG_EXCLUSION_MULTIPLE`). Exporting them from
`overlay.ts` — a one-word change, no behaviour — deletes the mirror and the drift risk. `overlay.ts`
is not W-P10's path, so it is left alone.
