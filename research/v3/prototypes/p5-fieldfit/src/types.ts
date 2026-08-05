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
	accentChromaOnly: boolean
	offArtwork: Readonly<Record<"background" | "surface" | "foreground" | "accent", boolean>>
	escape: boolean
}>
