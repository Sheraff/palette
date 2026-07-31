// Track B: what the two-stop and three-stop renders actually differ by.
//
// The endpoint-proximity veto claims a midpoint near an endpoint "would render as the same
// two-stop ramp". This measures the claim.
//
//   node --experimental-strip-types research/v2-3-experiments/track-b/rendered-difference.ts

import { mixOKLab, okDistance } from "../../v2-3/src/internal/color.ts"
import type { OKLab } from "../../v2-3/src/internal/types.ts"

function twoStop(background: OKLab, surface: OKLab, t: number): OKLab {
	return mixOKLab(background, surface, t)
}

function threeStop(background: OKLab, middle: OKLab, surface: OKLab, t: number): OKLab {
	return t <= 0.5
		? mixOKLab(background, middle, t / 0.5)
		: mixOKLab(middle, surface, (t - 0.5) / 0.5)
}

/**
 * Claim: max over t of |threeStop(t) - twoStop(t)| equals the chord deviation exactly,
 * attained at t = 0.5, for every background/midpoint/surface triple.
 *
 * Algebra: for t <= 0.5, threeStop(t) - twoStop(t) = 2t * (M - chordMid); for t >= 0.5 it is
 * 2(1 - t) * (M - chordMid). Both peak at t = 0.5 with value (M - chordMid). So the rendered
 * difference IS the chord deviation, and the first guard already tests it. Where the midpoint
 * sits relative to an endpoint has no bearing on it.
 */
function maximumRenderedDifference(background: OKLab, middle: OKLab, surface: OKLab): number {
	let maximum = 0
	for (let step = 0; step <= 1000; step++) {
		const t = step / 1000
		maximum = Math.max(maximum, okDistance(
			threeStop(background, middle, surface, t),
			twoStop(background, surface, t),
		))
	}
	return maximum
}

// Deterministic sweep over triples spanning the whole OKLab cube, including the degenerate
// cases the veto was aimed at (midpoint exactly on an endpoint).
let worstError = 0
let checked = 0
const axis = [0, 0.25, 0.5, 0.75, 1]
for (const bl of axis) for (const ba of [-0.2, 0, 0.2]) {
	for (const ml of axis) for (const ma of [-0.2, 0, 0.2]) {
		for (const sl of axis) for (const sa of [-0.2, 0, 0.2]) {
			const background: OKLab = [bl, ba, 0.1]
			const middle: OKLab = [ml, ma, -0.1]
			const surface: OKLab = [sl, sa, 0.05]
			const chordDeviation = okDistance(middle, mixOKLab(background, surface, 0.5))
			const rendered = maximumRenderedDifference(background, middle, surface)
			worstError = Math.max(worstError, Math.abs(rendered - chordDeviation))
			checked += 1
		}
	}
}
console.log(`triples checked: ${checked}`)
console.log(`max |maxRenderedDifference - chordDeviation|: ${worstError.toExponential(3)}`)
console.log(worstError < 1e-12
	? "CONFIRMED: the rendered difference is exactly the chord deviation."
	: "REFUTED")

// The specific corpus cases the veto suppressed, from the adversarial probe.
console.log(`\nsuppressed winners (chordDeviation = rendered difference, binStep 0.04):`)
for (const [name, deviation, endpointDistance] of [
	["muse", 0.2689, 0.0000],
	["once", 0.1502, 0.0134],
	["placebo", 0.1251, 0.0177],
	["havana", 0.0422, 0.0149],
	["slim", 0.0421, 0.0101],
] as const) {
	console.log(`  ${name.padEnd(9)} renders ${deviation.toFixed(4)} away from the two-stop ramp ` +
		`(${(deviation / 0.04).toFixed(1)}x the bin step), vetoed for sitting ${endpointDistance.toFixed(4)} from an endpoint`)
}
