/**
 * # The field/ink split — π(c), and the ladder's own scale grid
 *
 * Arm A §2.2: *"Membership is never decided. A pixel's prior probability of belonging to the field is
 * π(p) = σ((e(p) − s\*)/w), a logistic in the extent statistic, where the split scale s\* is part of
 * the configuration and optimised jointly with everything else. A colour that is 85% ink-like still
 * carries 15% of its mass into the field term."*
 *
 * Two things this module has to get right, and one it has to state.
 *
 * ## The units of s\*
 *
 * `e` is the ladder's raw statistic, `e(p) = Σ_s 2^-s κ(δ_s(p))`. Its achievable values are not
 * spread evenly: a pixel that stops representing its neighbourhood **at rung k and below** — a stroke
 * of relative width `2^-k` — has
 *
 *     e = Σ_{s=k}^{S-1} 2^-s = 2^{1-k} − 2^{1-S}
 *
 * so the ladder's own scale grid in `e` is *geometric*, from the whole short edge (`e = weightSum`) to
 * a single pixel (`e = 0`). A softness "of one octave" therefore has no fixed width in `e` at all: the
 * gap between adjacent rungs is `2^-k`, a factor of 128 across the ladder.
 *
 * So this module inverts that relation and works in **rungs**:
 *
 *     ê(c) = 1 − log₂(e(c) + 2^{1-S})     ∈ [0, S]
 *
 * `ê = 0` is a colour coherent at the coarsest box — a full-frame field; `ê = S` is a colour that
 * stops representing its neighbourhood at the single-pixel rung — the thinnest possible mark. The
 * map is smooth and strictly decreasing, so this is a *reparameterisation* of arm A's logistic and
 * not a different model: `σ((e − s\*)/w)` in `e` is `σ((ŝ\* − ê)/ŵ)` in rungs. What it buys is that
 * **ŵ = one octave = 1 exactly** (arm A §4.2's anchor, with no digits attached) and that the profile
 * grid for `ŝ\*` is the ladder's own rungs `{0, 1, …, S}` (`DESIGN.md`'s "evaluate on the ladder's
 * scale grid").
 *
 * ## The direction, stated because it inverts
 *
 * In arm A's `e` units a **large** `s\*` makes more of the image ink (§2.2: *"giant display text is
 * ink at a large scale, reached by choosing a large s\*"*). In rung units the same configuration is a
 * **small** `ŝ\*`. `energyOfA` reports both numbers in its nuisance block for exactly this reason:
 * `splitScaleRung` is what it profiled over, `splitScaleExtent` is the equivalent threshold on `e`,
 * which is the one arm A's text is written in.
 *
 * ## What it reads
 *
 * `measurement.derived.meanExtent` — the mass-weighted mean of `e` over each triple's pixels. A
 * colour that appears both as a large area and as a thin stroke has an intermediate mean and a large
 * `varianceExtent`; the mean is what the split reads, and the variance is deliberately *not* used in
 * v0 because splitting a single triple's mass across two extents would need a within-triple model the
 * measurement does not carry. Recorded as a v0 simplification.
 */

import type { Measurement } from "../../measure/types.ts"
import { FIELD_INK_SOFTNESS_OCTAVES } from "./constants.ts"

/** The ladder as this module needs it: how many rungs, and what `e` can reach. */
export type ExtentLadder = Readonly<{
	/** `S`, the number of rungs. */
	rungCount: number
	/** `Σ_s 2^-s`, the largest `e` can be. */
	weightSum: number
	/** `2^{1-S}` — the additive offset that makes the rung transform exact at both ends. */
	tailFloor: number
}>

export function extentLadderOf(measurement: Measurement): ExtentLadder {
	const rungCount = measurement.constants.extentLadderScales
	return {
		rungCount,
		weightSum: measurement.extent.weightSum,
		tailFloor: 2 ** (1 - rungCount),
	}
}

/**
 * `ê(e)` — the extent statistic as a continuous ladder rung in `[0, S]`.
 *
 * Exact at both ends by construction: `e = weightSum = 2 − 2^{1-S}` gives 0, and `e = 0` gives `S`.
 */
export function extentRung(extent: number, ladder: ExtentLadder): number {
	const clamped = extent < 0 ? 0 : extent > ladder.weightSum ? ladder.weightSum : extent
	const rung = 1 - Math.log2(clamped + ladder.tailFloor)
	return rung < 0 ? 0 : rung > ladder.rungCount ? ladder.rungCount : rung
}

/** The inverse: the `e` threshold a rung split corresponds to. Reported in the nuisance block. */
export function rungToExtent(rung: number, ladder: ExtentLadder): number {
	const extent = 2 ** (1 - rung) - ladder.tailFloor
	return extent < 0 ? 0 : extent > ladder.weightSum ? ladder.weightSum : extent
}

/**
 * The profile grid for `ŝ\*`: the ladder's rungs, plus both ends.
 *
 * `S + 1` values `{0, 1, …, S}`. `ŝ\* = 0` puts all but the very coarsest colours in the ink
 * population; `ŝ\* = S` puts essentially everything in the field. Both extremes are kept in the grid
 * on purpose — a configuration that wants to explain the whole image as field must be able to say so
 * in the same currency as one that wants to explain none of it that way.
 */
export function splitScaleGrid(ladder: ExtentLadder): Float64Array {
	const grid = new Float64Array(ladder.rungCount + 1)
	for (let rung = 0; rung <= ladder.rungCount; rung += 1) grid[rung] = rung
	return grid
}

/** `ê(c)` for every triple, in the table's canonical order. */
export function extentRungsPerTriple(measurement: Measurement, ladder: ExtentLadder): Float64Array {
	const { meanExtent } = measurement.derived
	const rungs = new Float64Array(meanExtent.length)
	for (let row = 0; row < meanExtent.length; row += 1) {
		rungs[row] = extentRung(meanExtent[row], ladder)
	}
	return rungs
}

/**
 * `π(c) = σ((ŝ\* − ê(c)) / ŵ)` — the field membership probability, written into `into`.
 *
 * Never 0 and never 1 in exact arithmetic, which is what "membership is never decided" means
 * operationally: every colour contributes to both terms at every split scale.
 */
export function fieldMembership(
	rungs: Float64Array,
	splitScaleRung: number,
	into: Float64Array,
): void {
	for (let row = 0; row < rungs.length; row += 1) {
		into[row] = 1 / (1 + Math.exp((rungs[row] - splitScaleRung) / FIELD_INK_SOFTNESS_OCTAVES))
	}
}
