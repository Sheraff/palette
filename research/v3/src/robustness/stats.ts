/**
 * The small amount of statistics this harness is allowed to do.
 *
 * There is exactly one reason this file exists: **an agreement rate without an interval invites a
 * reader to compare 23 trials against 200 as though they were the same measurement.** The reviewed
 * stratum of the pair set really is 23 pairs — that is all the corpus holds — and the honest way to
 * publish it is next to an interval wide enough to say so, not to leave it out and not to round it
 * into a headline.
 */

import type { AgreementRate } from "./types.ts"

/**
 * `[INHERITED]` — the standard normal quantile for a two-sided 95% interval. An arithmetic
 * constant of the confidence level, not a tuned value.
 */
export const Z_95 = 1.959963984540054

/**
 * `[UNCALIBRATED]` — below this many comparisons a ratio of two rates is reported but flagged.
 * Chosen as a round "you cannot conclude anything from this" line, not measured. It changes no
 * number; it only decides whether `underpowered` is true.
 */
export const MIN_COMPARISONS_FOR_RATIO = 30

/**
 * Wilson score interval for a binomial proportion.
 *
 * Preferred over the normal approximation because the rates here are expected to sit near 0 or
 * near 1, where the normal interval runs off the end of [0,1] and reports impossible bounds.
 * Returns null for an empty denominator, which is a real state and not a rate of zero.
 */
export function wilsonInterval(successes: number, trials: number, z: number = Z_95): [number, number] | null {
	if (trials <= 0) return null
	const proportion = successes / trials
	const z2 = z * z
	const denominator = 1 + z2 / trials
	const centre = proportion + z2 / (2 * trials)
	const spread = z * Math.sqrt((proportion * (1 - proportion)) / trials + z2 / (4 * trials * trials))
	const low = (centre - spread) / denominator
	const high = (centre + spread) / denominator
	return [Math.max(0, low), Math.min(1, high)]
}

/**
 * Build a reportable rate.
 *
 * `errored` is carried separately and is **never** in the denominator: a trial the candidate could
 * not complete is not evidence that the candidate agreed or disagreed with itself, and folding
 * errors into either bucket would let a crashy candidate buy a good number by failing often.
 */
export function agreementRate(group: string, agreed: number, compared: number, errored: number): AgreementRate {
	return {
		group,
		agreed,
		compared,
		errored,
		rate: compared > 0 ? agreed / compared : null,
		interval: wilsonInterval(agreed, compared),
	}
}
