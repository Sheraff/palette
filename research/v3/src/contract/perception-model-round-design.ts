/**
 * PART 2 — sizing the follow-up round, by simulation rather than by rule of thumb.
 *
 * The question this answers is not "is there an effect" — both effects are already measured and
 * both are large. It is "how many items does it take to ESTIMATE the effect well enough to write a
 * number into the contract", which is a precision question, and precision questions are settled by
 * simulating the estimator you are actually going to use.
 *
 * ## Converting the reviewer's repeat consistency into a lapse rate
 *
 * `bracketing-round-3` measured **5 of 6 silent repeats consistent = 83.3%** (rounds 1-2 measured
 * 62.5% over 24 repeats). Consistency is not directly usable as a noise parameter; the lapse rate
 * is. If an item is answered as an independent Bernoulli draw with probability `p`, two showings
 * agree with probability `p² + (1-p)²`. Setting that equal to the measured consistency and solving
 * gives the `p` an item can reach at the extremes, and the lapse rate is `λ = 1 - p`:
 *
 *     0.833 = p² + (1-p)²   =>   p = 0.908   =>   λ = 0.092
 *
 * So the reviewer's answers saturate at about 91%, not 100%, and every simulated observer here
 * carries `P(yes) = λ + (1 - 2λ) · logistic(β · (log τ - log d))`. This matters: a ladder cannot
 * measure a threshold more sharply than the observer's own repeatability allows, and ignoring the
 * ceiling is how a round gets designed for a precision it cannot reach.
 *
 * **The caveat, stated rather than buried.** Round 3's six repeats were all in-band items, i.e.
 * deliberately hard ones. Consistency measured on hard items is a lower bound on consistency over a
 * whole ladder, so `λ = 0.092` is an UPPER bound on the lapse rate and these item counts are
 * therefore conservative. Using the older 62.5% figure instead would imply `λ = 0.31`, at which
 * point no round of any feasible size pins anything; the 83.3% figure is used because it is the
 * most recent measurement and was taken under the exact criterion the follow-up round would use.
 *
 * Deterministic: seeded with `makeRng`, no clock, no `Math.random`.
 */
import { makeRng } from "../stats/index.ts"

import { fitLogisticRidge, type DesignRow } from "./perception-model-numerics.ts"

/** Repeat consistency measured by `bracketing-round-3`, over 6 silent repeats. */
export const MEASURED_REPEAT_CONSISTENCY = 5 / 6

/** Simulation draws per design cell. Fixed before any number was looked at. */
const SIMULATIONS = 600

const SEED = 20260804

/** Solve `consistency = p² + (1-p)²` for the reachable `p`, and return the lapse rate `1 - p`. */
export function lapseRateFromConsistency(consistency: number): number {
	if (consistency <= 0.5 || consistency > 1) {
		throw new Error(`lapseRateFromConsistency: consistency ${consistency} is outside (0.5, 1]`)
	}
	// 2p² - 2p + 1 = consistency  =>  p = (1 + sqrt(2·consistency - 1)) / 2
	const p = (1 + Math.sqrt(2 * consistency - 1)) / 2
	return 1 - p
}

export type LadderPrecision = Readonly<{
	itemsPerLadder: number
	/** Ratio of the estimated threshold to the true one, at the 5th and 95th simulation percentiles. */
	ratioLow: number
	ratioHigh: number
	/** Same, for the ratio between two independently-fitted direction ladders. */
	ratioOfRatiosLow: number
	ratioOfRatiosHigh: number
	/** Share of simulations where the fit was degenerate (all-yes or all-no). */
	degenerateShare: number
}>

/**
 * Simulate one direction ladder and report how precisely it recovers its own threshold.
 *
 * The ladder is log-spaced over [τ/3, 3τ], which is the shape the existing bracketing rounds use
 * and is wide enough that the observer's saturating ends are both sampled.
 */
export function ladderPrecision(
	itemsPerLadder: number,
	trueThreshold: number,
	sharpness: number,
	lapse: number,
	seed: number = SEED,
): LadderPrecision {
	if (itemsPerLadder < 3) throw new Error("ladderPrecision: a ladder needs at least 3 items")
	const rng = makeRng(seed)
	const distances = Array.from({ length: itemsPerLadder }, (_, index) => {
		const t = itemsPerLadder === 1 ? 0.5 : index / (itemsPerLadder - 1)
		return trueThreshold * Math.exp((t * 2 - 1) * Math.log(3))
	})

	const estimateOnce = (threshold: number): number | null => {
		const rows: DesignRow[] = distances.map((distance, index) => {
			const clean = 1 / (1 + Math.exp(-sharpness * (Math.log(threshold) - Math.log(distance))))
			const probability = lapse + (1 - 2 * lapse) * clean
			return { x: [1, Math.log(distance)], y: rng() < probability, cluster: `i${index}` }
		})
		const yes = rows.filter((row) => row.y).length
		if (yes === 0 || yes === rows.length) return null
		const fit = fitLogisticRidge(rows)
		if (fit.beta[1] === 0 || !Number.isFinite(fit.beta[1])) return null
		const estimate = Math.exp(-fit.beta[0] / fit.beta[1])
		return Number.isFinite(estimate) && estimate > 0 ? estimate : null
	}

	const ratios: number[] = []
	const ratiosOfRatios: number[] = []
	let degenerate = 0
	for (let draw = 0; draw < SIMULATIONS; draw++) {
		const first = estimateOnce(trueThreshold)
		// The second ladder stands in for the other direction; its true threshold is irrelevant to
		// the RATIO's precision, so it is simulated at the same value and the ratio's spread around
		// 1 is what gets reported.
		const second = estimateOnce(trueThreshold)
		if (first === null || second === null) {
			degenerate++
			continue
		}
		ratios.push(first / trueThreshold)
		ratiosOfRatios.push(first / second)
	}
	if (ratios.length < SIMULATIONS / 4) {
		throw new Error(`ladderPrecision: ${degenerate} of ${SIMULATIONS} draws were degenerate at n=${itemsPerLadder}`)
	}
	ratios.sort((a, b) => a - b)
	ratiosOfRatios.sort((a, b) => a - b)
	const at = (sorted: number[], q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]

	return {
		itemsPerLadder,
		ratioLow: at(ratios, 0.05),
		ratioHigh: at(ratios, 0.95),
		ratioOfRatiosLow: at(ratiosOfRatios, 0.05),
		ratioOfRatiosHigh: at(ratiosOfRatios, 0.95),
		degenerateShare: degenerate / SIMULATIONS,
	}
}

export type RoundSizing = Readonly<{
	criterion: string
	quantity: string
	trueThreshold: number
	sharpness: number
	lapse: number
	consistencyUsed: number
	rows: readonly LadderPrecision[]
	/** Smallest ladder whose 90% interval on the threshold ratio sits inside [0.75, 1.333]. */
	recommendedItemsPerLadder: number | null
	/** Smallest ladder that can tell a 2x direction ratio from 1x, at the 90% level. */
	itemsToResolveTwoFoldRatio: number | null
}>

const LADDER_SIZES = [8, 10, 12, 14, 16, 20, 24, 30, 40] as const

export function sizeRound(
	criterion: string,
	quantity: string,
	trueThreshold: number,
	sharpness: number,
	consistency: number = MEASURED_REPEAT_CONSISTENCY,
): RoundSizing {
	const lapse = lapseRateFromConsistency(consistency)
	const rows = LADDER_SIZES.map((size, index) =>
		ladderPrecision(size, trueThreshold, sharpness, lapse, SEED + index),
	)
	const recommended =
		rows.find((row) => row.ratioLow >= 0.75 && row.ratioHigh <= 4 / 3)?.itemsPerLadder ?? null
	// To call a 2x ratio different from 1x, the 90% interval on the ratio of two ladders must not
	// contain 2 when the truth is 1 — i.e. its upper end must sit below 2.
	const twoFold = rows.find((row) => row.ratioOfRatiosHigh < 2)?.itemsPerLadder ?? null
	return {
		criterion,
		quantity,
		trueThreshold,
		sharpness,
		lapse,
		consistencyUsed: consistency,
		rows,
		recommendedItemsPerLadder: recommended,
		itemsToResolveTwoFoldRatio: twoFold,
	}
}
