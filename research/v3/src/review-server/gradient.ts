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
		publishedPosition: stop.position,
		displayPosition: displayPosition(stop.position, gradient.stops.length),
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
