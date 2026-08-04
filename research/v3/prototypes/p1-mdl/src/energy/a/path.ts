/**
 * # γ(t) — the rendered colour path
 *
 * Arm A §2.3 requires the ramp's field density to be *"an **integral along the rendered path**,
 * ∫ κ(φ(c), γ(t)) ν(t) dt, **not** an evaluation at the stops"*, and gives two reasons the rendering
 * has to be the real one: it makes *"the straight segment B→S passes through off-artwork colours"*
 * and *"the ramp's likelihood is poor mid-segment"* the **same quantity**, and it makes the objective
 * and the whole-ramp APCA invariant look at one object.
 *
 * So γ is the contract's rendering and nothing else.
 *
 * [INHERITED] — `src/contract/ramp.ts`: the consumer renders `linear-gradient(135deg in oklab, …)`,
 * and CSS Color 4 defines `in oklab` as **componentwise linear interpolation of L, a and b** between
 * consecutive stops. That is the whole definition of γ, and this module writes no interpolation
 * constant of its own.
 *
 * **Why not call `sampleRamp`.** `src/contract/ramp.ts` samples a `GradientSpec`, whose stops carry
 * branded `HexColor`s and `PaletteColor`s. A search evaluating a lattice of configurations would be
 * minting branded strings and `PaletteColor` objects per node for a piecewise-linear interpolation of
 * three numbers — the same argument `src/emit/types.ts` makes for `Configuration` not being
 * `Palette`. The interpolation rule is one line and is inherited by citation; the *contract's*
 * sampler remains the authority for the invariant checks, which is where it is used.
 */

import { rgbToOkLab } from "../../../../../src/contract/color.ts"
import type { Configuration } from "../../emit/types.ts"

/** The path as a sorted list of OKLab knots. */
export type ColorPath = Readonly<{
	/** Knot positions in `t`, ascending. */
	positions: Float64Array
	/** Knot colours in OKLab, flat `3 · knotCount`. */
	labs: Float64Array
	knotCount: number
}>

/**
 * Build γ from a configuration.
 *
 * Total by construction, because `DESIGN.md` requires the energy to score *any* contract-shaped
 * configuration and the type system permits shapes the contract would reject:
 *
 * - fewer than two stops (including none) falls back to the two field roles at `t = 0` and `t = 1`,
 *   which is what the contract says the endpoints are anyway;
 * - stops are sorted by position, with the original index as the tie-break, so a configuration whose
 *   positions are out of order still has a well-defined rendered path and a deterministic one;
 * - a path whose knots all share a position degenerates to its first colour, which is the honest
 *   reading of a zero-length ramp.
 *
 * None of this is a legality judgement — `feasibility()` owns that, and an illegal configuration
 * still has an energy.
 */
export function buildColorPath(config: Configuration): ColorPath {
	const usable = config.gradient && config.stops.length >= 2
	if (!usable) {
		const background = rgbToOkLab(config.background)
		const surface = rgbToOkLab(config.surface)
		return {
			positions: Float64Array.from([0, 1]),
			labs: Float64Array.from([...background, ...surface]),
			knotCount: 2,
		}
	}

	const order = Array.from({ length: config.stops.length }, (_unused, index) => index).sort(
		(left, right) =>
			config.stops[left].position - config.stops[right].position || left - right,
	)
	const positions = new Float64Array(order.length)
	const labs = new Float64Array(order.length * 3)
	for (let knot = 0; knot < order.length; knot += 1) {
		const stop = config.stops[order[knot]]
		positions[knot] = stop.position
		const lab = rgbToOkLab(stop.rgb)
		labs[knot * 3] = lab[0]
		labs[knot * 3 + 1] = lab[1]
		labs[knot * 3 + 2] = lab[2]
	}
	return { positions, labs, knotCount: order.length }
}

/**
 * γ(t), written into `into`. Clamped outside `[positions[0], positions[last]]`, which is what a CSS
 * gradient does before its first stop and after its last.
 */
export function samplePath(path: ColorPath, t: number, into: Float64Array, offset: number): void {
	const { positions, labs, knotCount } = path
	if (t <= positions[0]) {
		into[offset] = labs[0]
		into[offset + 1] = labs[1]
		into[offset + 2] = labs[2]
		return
	}
	const last = knotCount - 1
	if (t >= positions[last]) {
		into[offset] = labs[last * 3]
		into[offset + 1] = labs[last * 3 + 1]
		into[offset + 2] = labs[last * 3 + 2]
		return
	}
	let segment = 0
	while (segment < last - 1 && t > positions[segment + 1]) segment += 1
	const span = positions[segment + 1] - positions[segment]
	// A zero-length segment cannot be interpolated across; taking its left knot is the limit of the
	// interpolation as the span closes, and is what a renderer shows for a hard stop.
	const alpha = span <= 0 ? 0 : (t - positions[segment]) / span
	for (let channel = 0; channel < 3; channel += 1) {
		const from = labs[segment * 3 + channel]
		const to = labs[(segment + 1) * 3 + channel]
		into[offset + channel] = from + alpha * (to - from)
	}
}
