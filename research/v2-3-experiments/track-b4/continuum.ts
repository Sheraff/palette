/**
 * Continuum contrast along the rendered ramp.
 *
 * Flo: "if we evaluate APCA contrast at discrete sample points along the gradient, we might
 * unfairly penalize or reward based on our sampling, when the real measurement would be different
 * if taken as a continuum."
 *
 * The ramp is pure 1-D colour maths — `renderedFieldColor` needs only the two endpoints and the
 * earned midpoint, no image access — so evaluating it densely costs nothing measurable.
 *
 * The proposed shortcut (derive the segment minimum from its endpoints, since |Lc(t)| should be
 * V-shaped) is **not used**: `verify-monotonicity.ts` shows Y(t) reverses on 5.8% of segments and
 * the shortcut misreports the minimum on 1.3% of triples, worst case predicting |Lc| 7.43 where
 * the true minimum is 0. It fails towards claiming contrast that is not there, so everything here
 * is measured on a dense grid with bisection refinement instead.
 */
import { APCAcontrast, sRGBtoY } from "apca-w3"

import { renderedFieldColor } from "../../v2-3/src/internal/palette-core.ts"
import type { OKLab, RGB } from "../../v2-3/src/internal/types.ts"

type Midpoint = Parameters<typeof renderedFieldColor>[2]

/** sRGB channels without 8-bit rounding: the continuum, not the quantized staircase. */
export function oklabToFloatSRGB([lightness, a, b]: OKLab): RGB {
	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
	const channels = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	].map((value) => {
		const clamped = Math.max(0, Math.min(1, value))
		return 255 * (clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055)
	})
	return channels as unknown as RGB
}

/** Samples per ramp segment. 256 puts the grid well below one 8-bit step of the rendered ramp. */
const GRID = 256
const BISECTION_STEPS = 40

export type ContinuumProfile = Readonly<{
	minimumAbsoluteLc: number
	meanAbsoluteLc: number
	/** Exact t positions where the signed contrast changes polarity. */
	crossings: readonly number[]
	/** Total t-length where |Lc(t)| falls below the adequacy bar, in [0, 1]. */
	indistinctFraction: number
}>

/**
 * Evaluate a role colour against the whole rendered field.
 *
 * `t` maps linearly across the field, so an interval of t is the same fraction of the gradient's
 * screen area. `indistinctFraction` is therefore literally "the share of the gradient over which
 * this role is not distinguishable" — the quantity review has been describing in words.
 */
export function continuumProfile(
	role: RGB,
	background: OKLab,
	surface: OKLab,
	midpoint: Midpoint,
	adequacyBar: number,
): ContinuumProfile {
	const roleY = sRGBtoY(role)
	const at = (t: number): number => APCAcontrast(roleY, sRGBtoY(oklabToFloatSRGB(
		renderedFieldColor(background, surface, midpoint, t))))

	// A three-stop ramp has a slope discontinuity at t = 0.5; align the grid to it so no cell
	// straddles the corner.
	const segments: ReadonlyArray<readonly [number, number]> = midpoint === null
		? [[0, 1]]
		: [[0, 0.5], [0.5, 1]]

	const solve = (low: number, high: number, predicate: (t: number) => boolean): number => {
		let a = low
		let b = high
		for (let i = 0; i < BISECTION_STEPS; i += 1) {
			const mid = (a + b) / 2
			if (predicate(mid)) b = mid
			else a = mid
		}
		return (a + b) / 2
	}

	const crossings: number[] = []
	let indistinct = 0
	let minimum = Infinity
	let weighted = 0
	let weight = 0

	for (const [start, end] of segments) {
		let previousT = start
		let previous = at(start)
		minimum = Math.min(minimum, Math.abs(previous))
		for (let step = 1; step <= GRID; step += 1) {
			const t = start + (end - start) * (step / GRID)
			const value = at(t)
			minimum = Math.min(minimum, Math.abs(value))
			weighted += (Math.abs(value) + Math.abs(previous)) / 2 * (t - previousT)
			weight += t - previousT

			// Polarity crossing, located exactly rather than counted.
			if ((previous < 0 && value > 0) || (previous > 0 && value < 0)) {
				const startsNegative = previous < 0
				crossings.push(solve(previousT, t, (m) => (startsNegative ? at(m) > 0 : at(m) < 0)))
			}
			// Sub-interval where |Lc| sits below the bar, with its boundaries refined.
			const wasBelow = Math.abs(previous) < adequacyBar
			const isBelow = Math.abs(value) < adequacyBar
			if (wasBelow && isBelow) indistinct += t - previousT
			else if (wasBelow !== isBelow) {
				const boundary = solve(previousT, t, (m) => (wasBelow
					? Math.abs(at(m)) >= adequacyBar
					: Math.abs(at(m)) < adequacyBar))
				indistinct += wasBelow ? boundary - previousT : t - boundary
			}
			previousT = t
			previous = value
		}
	}

	return {
		minimumAbsoluteLc: minimum,
		meanAbsoluteLc: weight > 0 ? weighted / weight : 0,
		crossings,
		indistinctFraction: indistinct,
	}
}
