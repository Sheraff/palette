/**
 * P5 field-fit prototype — shared interfaces. AUTHORED SPEC, frozen.
 *
 * This file is the interface contract between the wave-1 modules (see `../SPEC.md` for the design
 * and for who owns which module). It contains types only — no logic, no constants. Change it only
 * via the P5 orchestrator.
 */

import type { OkLab, Rgb8 } from "../../../src/contract/types.ts"

// ---------------------------------------------------------------------------------------------
// Decode + inventory (W-CORE, `decode.ts`)
// ---------------------------------------------------------------------------------------------

export type DecodedRaster = Readonly<{
	width: number
	height: number
	format: string
	/** OKLab per pixel, row-major, 3 floats per pixel. */
	lab: Float32Array
	/** Packed 24-bit sRGB per pixel (`r << 16 | g << 8 | b`), row-major. */
	packed: Uint32Array
}>

/** Per-distinct-triple statistics. Positions are normalized to [-1, 1] on both axes. */
export type TripleStats = Readonly<{
	packed: number
	rgb: Rgb8
	lab: OkLab
	count: number
	/** Sum of normalized x over the triple's pixels (divide by count for the mean). */
	sumX: number
	sumY: number
}>

export type Inventory = Readonly<{
	/** Keyed by packed 24-bit value. */
	triples: ReadonlyMap<number, TripleStats>
	has(packed: number): boolean
	totalPixels: number
}>

// ---------------------------------------------------------------------------------------------
// Robust field fit (W-FIT, `fieldfit.ts`)
// ---------------------------------------------------------------------------------------------

export type FieldFit = Readonly<{
	/** 0 = constant field, 1 = affine field. The order the model selection kept. */
	order: 0 | 1
	/**
	 * Row-major 3×3: for each OKLab channel c, `[intercept, coefX, coefY]` over normalized
	 * position in [-1, 1]². For order 0 the position coefficients are exactly 0.
	 */
	coefficients: Float64Array
	/** Field colour at a normalized position. */
	fieldAt(x: number, y: number): OkLab
	/** Tukey weight in [0, 1] per pixel, row-major, full resolution. */
	weights: Float32Array
	/** Fraction of pixels with weight above 0.5. */
	inlierFraction: number
	/** Final robust residual scale σ̂ (OKLab norm units). */
	residualScale: number
	/** Robust-RMS improvement of order 1 over order 0, in multiples of the pooled bar. */
	marginBars: number
	/**
	 * Fraction of full-res pixels whose residual norm against the kept field is below
	 * 4 × POOLED_SAME_COLOR_BAR — "how much of the image the field explains, in perceptual units".
	 * Absolute, never self-normalized (SPEC decision 9, ruling of 2026-08-04).
	 */
	fieldExplainedFraction: number
	/** No-field verdict per SPEC decision 9: fieldExplainedFraction < 0.5. */
	noField: boolean
}>

// ---------------------------------------------------------------------------------------------
// Ramp reading (W-READ, `ramp.ts`)
// ---------------------------------------------------------------------------------------------

export type StopTarget = Readonly<{
	/** Continuous OKLab target, pre-snap. */
	target: OkLab
	/** Ramp position in [0, 1]; 0 is background, 1 is surface. */
	position: number
}>

/**
 * What the t-continuity discriminator measured (SPEC decision 5, ruling 2026-08-05).
 *
 * Reported whenever the excursion test had to decide anything. Since the ruling, `bimodal` is the
 * **only** route from `readRamp` to the two-block fallback, so this is the number that says *why* a
 * cover reads as one bent field or as two blocks — and the constant it is compared against is
 * `[UNCALIBRATED]` with exactly two anchor covers, which is the other reason it is published rather
 * than kept inside `ramp.ts`.
 */
export type RampContinuity = Readonly<{
	/** Inlier mass in the chord's middle third, over the inlier mass inside the chord's span. */
	middleBandMass: number
	/** Inlier mass inside the chord's span, over all inlier mass — how much of the field the chord covers. */
	spanMassFraction: number
	/** `middleBandMass < CONTINUOUS_MIDDLE_BAND_MASS`: two blocks, not one bent field. */
	bimodal: boolean
}>

export type RampReading = Readonly<{
	/** False when flat, when ends do not separate, or on the two-block fallback. */
	gradientCandidate: boolean
	/** Unit image-plane direction of fastest field change, null for order-0 fields. */
	direction: readonly [number, number] | null
	backgroundTarget: OkLab
	surfaceTarget: OkLab
	/** Margin of the orientation decision (weighted-median-t statistic), for diagnostics. */
	orientationMargin: number
	/** 2 or 3 entries, ends first and last; empty when gradientCandidate is false. */
	stops: readonly StopTarget[]
	/** Max OKLab distance from the straight chord to the nearest occupied artwork colour. */
	excursionMax: number
	thirdStopAccepted: boolean
	/** Excursion remaining after the accepted polyline (equals excursionMax when no third stop). */
	residualExcursion: number
	/** True when no polyline fixed the excursion — two-block fallback taken (SPEC decision 5). */
	twoBlockFallback: boolean
}>

// ---------------------------------------------------------------------------------------------
// Overlay reading (W-MARKS, `overlay.ts`)
// ---------------------------------------------------------------------------------------------

export type OverlayCluster = Readonly<{
	/** Representative (highest-overlay-mass) member triple, packed. */
	representative: number
	lab: OkLab
	/** Σ(1 − w) over member triples' pixels. */
	overlayMass: number
	/** Mean normalized position of the cluster's pixels. */
	meanX: number
	meanY: number
	/** Field colour at (meanX, meanY) — the local field this cluster is measured against. */
	localField: OkLab
	/** Displacement from local field, decomposed. */
	deltaL: number
	deltaC: number
	deltaH: number
	memberCount: number
}>

export type OverlayReading = Readonly<{
	clusters: readonly OverlayCluster[]
	/** Null ⇒ no distinct foreground exists ⇒ escape path (SPEC decision 10). */
	foreground: OverlayCluster | null
	/** Null ⇒ accent collapses to foreground. */
	accent: OverlayCluster | null
	accentChromaOnly: boolean
}>

// ---------------------------------------------------------------------------------------------
// Snap (W-CORE, `snap.ts`)
// ---------------------------------------------------------------------------------------------

export type SnapResult = Readonly<{
	rgb: Rgb8
	lab: OkLab
	/** True when the bar-ball around the target contained no artwork colour. */
	offArtwork: boolean
	/** OKLab distance from target to the published triple. */
	distance: number
}>

// ---------------------------------------------------------------------------------------------
// Margin reporting (assembled by `candidate.ts`)
// ---------------------------------------------------------------------------------------------
//
// Round-3's cross-arm note 6: *"the reviewer grades margins; optimizers sit on floors"* — another arm
// published six pairs clearing `sameColorBar` by 1e-4 to 3e-3 and the reviewer called all six
// indistinguishable. A pass/fail scorecard cannot tell an epsilon-pass from a comfortable one, so a
// round analysis cannot correlate a complaint with a margin. These shapes carry the ratio for every
// pair the contract judges, and for the two prototype gates that are not the contract's.
//
// **Reporting only, and structurally so**: `candidate.ts` fills them on the finished palette, after
// every decision, and nothing above reads the result.

/** One judged pair: what was measured, what it had to clear, and by what factor it cleared it. */
export type PairMargin = Readonly<{
	/** `roles.foreground` × `roles.accent`, in the contract's own path spelling. */
	pair: string
	first: string
	second: string
	distance: number
	/** The bar this pair is judged against — elevated for foreground↔accent, per invariant 3. */
	bar: number
	/** `distance / bar`. Below 1 is a violation; at 1.0 the palette is sitting on the floor. */
	ratio: number
	/** A sanctioned collapse: the pair is one published colour, so no distinctness is claimed. */
	collapsed: boolean
}>

export type MarginReport = Readonly<{
	pairs: readonly PairMargin[]
	/**
	 * The foreground's own legibility, measured the way `overlay.ts` selected it but at the
	 * contract's density rather than selection density — so this is invariant 4's number, not the
	 * ranking's approximation of it.
	 */
	foregroundLegibility: Readonly<{ minRawApca: number; floor: number; ratio: number }>
	/**
	 * SPEC decision 14's twin test on the published pair: `distance / sameColorBar`, against the
	 * multiple that excludes the foreground's family. Below the multiple the accent would have been
	 * excluded — so on a published palette this is always ≥ 1 unless the accent collapsed.
	 */
	accentTwin: Readonly<{
		distance: number
		bar: number
		ratio: number
		exclusionMultiple: number
		/** `ratio / exclusionMultiple`: how far past the gate the published accent actually is. */
		clearance: number
		collapsed: boolean
	}>
}>

// ---------------------------------------------------------------------------------------------
// Diagnostics sidecar (assembled by `candidate.ts` / `diagnose.ts`)
// ---------------------------------------------------------------------------------------------

export type Diagnostics = Readonly<{
	noField: boolean
	inlierFraction: number
	fieldExplainedFraction: number
	/** Number of field-like components the v0.5 reading extracted (0 when the global fit sufficed). */
	fieldComponents: number
	/** True only when the declared retreat published the palette (distinguishes it from a flat component). */
	retreat: boolean
	residualScale: number
	marginBars: number
	orientationMargin: number
	gradient: boolean
	excursionMax: number
	thirdStopAccepted: boolean
	residualExcursion: number
	twoBlockFallback: boolean
	/**
	 * What the t-continuity discriminator measured, or `null` when the straight chord never left the
	 * artwork and the question never arose.
	 */
	continuity: RampContinuity | null
	accentChromaOnly: boolean
	offArtwork: Readonly<Record<"background" | "surface" | "foreground" | "accent", boolean>>
	escape: boolean
	/** Distance, bar and ratio for every pair the contract judges, plus the two prototype gates. */
	margins: MarginReport
}>
