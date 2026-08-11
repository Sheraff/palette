/**
 * The selector's vocabulary. Every type here describes a *measurement*; none of them carries a
 * score, a weight, or a member's name attached to a number the currency reads.
 *
 * The member-independence property SPEC §2 turns on is visible in these shapes: {@link MemberPrice}
 * is computed from a `Palette` and an image and nothing else, and the only place a member's slug
 * appears is as a label on a result that was already decided.
 */

import type { Palette, RoleName } from "../../../src/contract/types.ts"

// ---------------------------------------------------------------------------------------------
// Substrate
// ---------------------------------------------------------------------------------------------

/** One decoded image, at native resolution. `lab` is measurement; `rgb` is what may be published. */
export type DecodedImage = Readonly<{
	path: string
	width: number
	height: number
	/** Row-major, three 8-bit channels per pixel. */
	rgb: Uint8Array
	/** Row-major, three OKLab coordinates per pixel, from the contract's own `rgbToOkLab`. */
	lab: Float64Array
	/** sha-256 of the file's bytes — the identity the run files join on. */
	contentHash: string
	/** Header format string, for provenance. */
	format: string
}>

/**
 * The C×C lattice of count-weighted OKLab sufficient statistics, plus the noise scale — arm-c′
 * §2.1's single pass.
 *
 * Nothing here depends on any palette: this is the substrate every member is priced against, and
 * it is built once per (image, C).
 */
export type Substrate = Readonly<{
	resolution: number
	cellCount: number
	/** Pixels in each cell. Cells straddling a non-divisible edge simply hold unequal counts. */
	counts: Float64Array
	/** Σ L, Σ a, Σ b per cell, count-weighted by construction. */
	sums: Float64Array
	/** Σ (L² + a² + b²) per cell. */
	sumsOfSquares: Float64Array
	/** The robust noise scale, measured from this file (arm-c′ §2.1). */
	sigma: number
	/** Per-OKLab-coordinate scales, before they are pooled into `sigma`. Reported, not consumed. */
	sigmaPerCoordinate: readonly number[]
}>

// ---------------------------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------------------------

/** The schema price of a palette, itemised so the derivation is auditable. */
export type SchemaPrice = Readonly<{
	bits: number
	/** Distinct published colours: roles that did not collapse, plus interior gradient stops. */
	publishedColors: number
	/** Bits charged for those colours (`publishedColors · OKLAB_DIMENSIONS · ½log₂ N`). */
	colorBits: number
	/** Bits charged for the schema's own discrete fields — the booleans and the stop count. */
	discreteBits: number
	items: readonly Readonly<{ field: string; cardinality: number | null; bits: number }>[]
}>

/** The field a palette implies, as the currency reconstructs it. */
export type ImpliedField = Readonly<{
	kind: "flat" | "gradient"
	/** Fitted axis direction in radians, gradient only. Fitted by residual minimisation, per image. */
	angleRadians: number | null
	/** How many angles the coarse sweep evaluated before the local refine. */
	coarseAngles: number | null
}>

/** What one member's palette costs on one image. */
export type MemberPrice = Readonly<{
	slug: string
	schema: SchemaPrice
	field: ImpliedField
	/** Share of pixels explained at zero marginal residual by the fg/accent same-colour bars. */
	explainedPixelFraction: number
	residualBits: number
	totalBits: number
	/** Residual bits per lattice cell — what the block bootstrap resamples. */
	perCellResidualBits: Float64Array
}>

// ---------------------------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------------------------

/** arm-c′ §2.3b: do the palettes differ at the contract's own bar at all? */
export type MaterialityReport = Readonly<{
	material: boolean
	/** Every unordered pair, with the roles that differ. */
	pairs: readonly Readonly<{ a: string; b: string; differingRoles: readonly RoleName[] }>[]
}>

/** arm-c′ §2.3c: the measured margin. */
export type BootstrapReport = Readonly<{
	blockSide: number
	correlationLengthCells: number
	/** Resamples drawn, including the ties. This is what the compute cap bounds. */
	draws: number
	/** Draws that were informative — `draws − ties`. The Wilson interval's denominator. */
	resamples: number
	/** Draws that came out exactly zero, so favoured neither member. Excluded from the fraction. */
	ties: number
	wins: number
	winFraction: number
	intervalLow: number
	intervalHigh: number
	separatedFromHalf: boolean
	capped: boolean
}>

/**
 * Why a cover could not be priced at all.
 *
 * The currency divides the residual by σ², so an image whose measured σ is zero has no exchange rate
 * between residual bits and schema bits and every member's total comes out `NaN`. That is not a
 * rounding problem to be smoothed: it is the estimator saying this file's noise is below what it can
 * resolve, and the only way to make a number appear is to invent a noise floor — a free scale in the
 * loss, which arm-c′ §2.3a forbids outright (*"it has no free scale"*) and which is the hand-set
 * constant SPEC §3's F2 exists to catch. So the selector refuses the cover, says why, and the
 * refusals are counted in the bit table instead of being averaged away.
 */
export type Unpriceable = Readonly<{ reason: string; sigma: number }>

/** One cover's whole selection. */
export type Selection = Readonly<{
	contentHash: string
	imagePath: string
	/** The measured noise scale. Reported on every cover, priceable or not. */
	sigma: number
	/** Set when the currency is undefined here; `prices` is then empty and `winner` is null. */
	unpriceable: Unpriceable | null
	prices: readonly MemberPrice[]
	/** Assessed from the palettes alone, so it is available even on an unpriceable cover. */
	materiality: MaterialityReport
	winner: string | null
	runnerUp: string | null
	/** Winner's margin over the runner-up, in bits. */
	marginBits: number | null
	/** Set when the totals tied and arm-c′ §2.3d's cheaper-L(palette) rule decided it. */
	tieBrokenBySchemaPrice: boolean
	bootstrap: BootstrapReport | null
}>

/** A member's palette on one cover, as read from an M1 run file. */
export type MemberPalette = Readonly<{ slug: string; palette: Palette }>
