/**
 * Gradient display mapping and the pinned preview renderer.
 *
 * REVIEW_UI.md §3: the background endpoint gets extra room or it loses its importance.
 *
 *     display_pos = reserve + published_pos × (1 − reserve)
 *
 * Display-only: published positions stay the true fitted values everywhere else. The renderer is
 * pinned as part of the output contract (PHASE_0_DECISIONS.md §2) — a gradient verdict is a
 * verdict about a rendered ramp, so the ramp is produced here, server-side, and the browser only
 * pastes the resulting CSS string.
 */
import type { PaletteSnapshot } from "./types.ts"

/** The gradient as the warehouse stores it: stops carry `color` and `position`. */
export type Gradient = NonNullable<PaletteSnapshot["gradient"]>

/**
 * Reserve for a 2-stop ramp. [REVIEWED] — reviewer's tuning in v2-3 batch-34 (2026-08-01),
 * carried into v3 by REVIEW_UI.md §3. Reproduces the reviewed 35→100 rendering exactly.
 */
export const GRADIENT_DISPLAY_RESERVE_TWO_STOP = 0.35

/**
 * Reserve for 3-or-more-stop ramps. [REVIEWED] — same source; reproduces the reviewed
 * 10/55/100 rendering exactly for evenly spaced 3-stop ramps, and generalizes to 4 stops
 * with no new constant.
 */
export const GRADIENT_DISPLAY_RESERVE_MULTI_STOP = 0.10

/** The gradient angle the consumer renders, whatever geometry detection used. REVIEW_UI.md §3. */
export const GRADIENT_DISPLAY_ANGLE_DEGREES = 135

/** The interpolation space of the rendered ramp. Same space as all other palette math. */
export const GRADIENT_DISPLAY_INTERPOLATION = "oklab" as const

/**
 * Decimal places every stop position is canonicalized to, at push time and on the way out.
 *
 * **This is a blinding defence, not a display choice.** A position is served to the browser as a
 * JSON number, so its float *representation* is served with it: `0.35` and `0.35000000000000003`
 * are the same ramp and different strings, and two arms whose fitting code reaches the same position
 * by different arithmetic would be told apart by nothing but the trailing digits. Positions were
 * validated for range and monotonicity and never canonicalized, so that channel was open.
 *
 * 1e-6 of a ramp is a ten-thousandth of a percent of the field — far below anything a fitted
 * position means and far below anything the rendered CSS can express (`percent()` below rounds to
 * two decimals of a percent). So this throws away no information that any consumer had.
 * [UNCALIBRATED] — chosen here; any precision coarser than the arithmetic noise and finer than the
 * rendering closes the channel equally well.
 */
export const GRADIENT_POSITION_DECIMALS = 6

/** A stop position in its canonical numeric form. See `GRADIENT_POSITION_DECIMALS`. */
export function canonicalPosition(position: number): number {
	return Number(position.toFixed(GRADIENT_POSITION_DECIMALS))
}

export function displayReserve(stopCount: number): number {
	if (!Number.isInteger(stopCount) || stopCount < 2) {
		throw new RangeError(`A gradient needs at least 2 stops, got ${stopCount}`)
	}
	return stopCount === 2 ? GRADIENT_DISPLAY_RESERVE_TWO_STOP : GRADIENT_DISPLAY_RESERVE_MULTI_STOP
}

export function displayPosition(publishedPosition: number, stopCount: number): number {
	if (!Number.isFinite(publishedPosition) || publishedPosition < 0 || publishedPosition > 1) {
		throw new RangeError(`Published position must be in [0,1], got ${publishedPosition}`)
	}
	const reserve = displayReserve(stopCount)
	return reserve + publishedPosition * (1 - reserve)
}

export type DisplayStop = Readonly<{
	hex: string
	name: string
	publishedPosition: number
	displayPosition: number
}>

/** Percentages are rounded to two decimals: enough for any display, stable across runs. */
function percent(fraction: number): string {
	return `${Number((fraction * 100).toFixed(2))}%`
}

export function displayStops(gradient: Gradient, colorNames: Record<string, string>): DisplayStop[] {
	return gradient.stops.map((stop) => ({
		hex: stop.color,
		name: colorNames[stop.color] ?? stop.color,
		// Canonicalized on the way out as well as on the way in, so that a palette stored before this
		// rule existed cannot serve its float noise to the browser either. Both numbers are served, so
		// both are canonical: `displayPosition` is derived arithmetic and carries its own trailing
		// digits (0.35 -> 0.5775000000000001).
		publishedPosition: canonicalPosition(stop.position),
		displayPosition: canonicalPosition(displayPosition(stop.position, gradient.stops.length)),
	}))
}

/** The pinned CSS for a gradient field. */
export function gradientCss(stops: readonly DisplayStop[]): string {
	const ramp = stops.map((stop) => `${stop.hex} ${percent(stop.displayPosition)}`).join(", ")
	return `linear-gradient(${GRADIENT_DISPLAY_ANGLE_DEGREES}deg in ${GRADIENT_DISPLAY_INTERPOLATION}, ${ramp})`
}

/** The field a side is shown against: the rendered ramp, or the flat background color. */
export function fieldCss(gradient: Gradient | null, backgroundHex: string, colorNames: Record<string, string>): string {
	if (gradient === null) return backgroundHex
	return gradientCss(displayStops(gradient, colorNames))
}
