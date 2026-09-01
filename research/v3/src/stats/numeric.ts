/**
 * The numerical primitives the tests in this module rest on: log-gamma, log binomial coefficient,
 * the normal quantile, a seeded RNG, and sample quantiles.
 *
 * Nothing here is house policy — it is the arithmetic, kept in one file so the policy files read as
 * policy. Every routine is deterministic and dependency-free (`CONVENTIONS.md`: never install
 * packages), and the RNG is seeded explicitly rather than reading a clock, so a bootstrap CI in a
 * committed analysis output reproduces exactly.
 */

/**
 * Lanczos coefficients, g=7, n=9.
 *
 * [INHERITED] The standard published Lanczos series (Numerical Recipes / Boost use the same
 * constants). Not tuned here and not tunable: changing any digit changes `logGamma` into an
 * approximation of nothing in particular. Relative accuracy is about 1e-15 over the range this
 * module uses, which is far inside the 1e-7 tolerance the exact tests compare p-values at.
 */
const LANCZOS_G = 7
const LANCZOS_COEFFICIENTS = [
	0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
	-176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
	1.5056327351493116e-7,
] as const

/** Natural log of the gamma function. `logGamma(n + 1)` is `log(n!)`. */
export function logGamma(x: number): number {
	if (!Number.isFinite(x)) throw new RangeError(`logGamma expects a finite argument, got ${x}`)
	// Reflection, because the series is only valid to the right of 0.5.
	if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x)
	const z = x - 1
	let series = LANCZOS_COEFFICIENTS[0]
	for (let i = 1; i < LANCZOS_COEFFICIENTS.length; i++) series += LANCZOS_COEFFICIENTS[i]! / (z + i)
	const t = z + LANCZOS_G + 0.5
	return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(series)
}

/** Natural log of n choose k. Returns `-Infinity` outside `0 <= k <= n`, so a pmf there is 0. */
export function logChoose(n: number, k: number): number {
	if (k < 0 || k > n) return Number.NEGATIVE_INFINITY
	return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1)
}

/**
 * Binomial probability mass, P(X = k) for X ~ Binomial(n, p).
 *
 * Computed in logs and exponentiated once, so it is well behaved for the large n and small p where
 * a naive product of factorials overflows to `Infinity / Infinity`.
 */
export function binomialPmf(k: number, n: number, p: number): number {
	if (k < 0 || k > n || !Number.isInteger(k)) return 0
	if (p === 0) return k === 0 ? 1 : 0
	if (p === 1) return k === n ? 1 : 0
	return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log1p(-p))
}

/**
 * Rational-approximation coefficients for the inverse normal CDF (Acklam, 2003).
 *
 * [INHERITED] Published constants, relative error below 1.15e-9 across the whole line. That is
 * many orders of magnitude finer than anything a confidence interval on human agreement data can
 * resolve, so no Halley refinement step is applied — it would add an `erfc` implementation to
 * maintain in exchange for digits nothing here reads.
 */
const ACKLAM_A = [
	-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
	-3.066479806614716e1, 2.506628277459239,
] as const
const ACKLAM_B = [
	-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
	-1.328068155288572e1,
] as const
const ACKLAM_C = [
	-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
	4.374664141464968, 2.938163982698783,
] as const
const ACKLAM_D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416] as const

/** Where Acklam's central branch gives way to the tail branches. [INHERITED] from the paper. */
const ACKLAM_TAIL_BREAK = 0.02425

/** The inverse standard normal CDF: the z with P(Z <= z) = p. */
export function probit(p: number): number {
	if (!(p > 0 && p < 1)) throw new RangeError(`probit expects 0 < p < 1, got ${p}`)
	if (p < ACKLAM_TAIL_BREAK) {
		const q = Math.sqrt(-2 * Math.log(p))
		return (
			((((ACKLAM_C[0] * q + ACKLAM_C[1]) * q + ACKLAM_C[2]) * q + ACKLAM_C[3]) * q + ACKLAM_C[4]) * q +
			ACKLAM_C[5]
		) / ((((ACKLAM_D[0] * q + ACKLAM_D[1]) * q + ACKLAM_D[2]) * q + ACKLAM_D[3]) * q + 1)
	}
	if (p > 1 - ACKLAM_TAIL_BREAK) return -probit(1 - p)
	const q = p - 0.5
	const r = q * q
	return (
		((((((ACKLAM_A[0] * r + ACKLAM_A[1]) * r + ACKLAM_A[2]) * r + ACKLAM_A[3]) * r + ACKLAM_A[4]) * r +
			ACKLAM_A[5]) *
			q) /
		(((((ACKLAM_B[0] * r + ACKLAM_B[1]) * r + ACKLAM_B[2]) * r + ACKLAM_B[3]) * r + ACKLAM_B[4]) * r + 1)
	)
}

/**
 * The two-sided normal critical value for a confidence level: `zFor(0.95)` is 1.959963...
 *
 * Confidence is given as a level (0.95), never as an alpha, because every historical mix-up in the
 * reviewed analyzers ran in that direction — a 0.05 passed where a 0.95 was meant produces a
 * plausible-looking, badly wrong interval instead of an error.
 */
export function zFor(confidence: number): number {
	if (!(confidence > 0 && confidence < 1)) {
		throw new RangeError(
			`zFor expects a confidence level strictly between 0 and 1 (0.95, not 0.05), got ${confidence}`,
		)
	}
	if (confidence < 0.5) {
		throw new RangeError(
			`zFor was given ${confidence}, which is below 0.5 and is almost certainly an alpha. Pass the confidence level: 0.95 for a 95% interval.`,
		)
	}
	return probit(1 - (1 - confidence) / 2)
}

/**
 * A seeded, deterministic uniform generator (mulberry32).
 *
 * [INHERITED] Published small-state PRNG. It is not cryptographic and does not need to be; it needs
 * to be reproducible across machines and Node versions, which `Math.random` is not. Every bootstrap
 * in this module takes a seed so that a CI printed into a committed analysis output can be
 * regenerated byte-identically years later.
 */
export function makeRng(seed: number): () => number {
	if (!Number.isInteger(seed)) throw new RangeError(`makeRng expects an integer seed, got ${seed}`)
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * The q-th quantile of a sample, by linear interpolation between order statistics.
 *
 * This is the `numpy.percentile` / R type-7 definition. Stated explicitly because bootstrap
 * percentile intervals differ in the third digit between quantile conventions, and a difference
 * that small is exactly the kind that gets attributed to the bootstrap rather than to the
 * convention.
 */
export function quantileSorted(sorted: readonly number[], q: number): number {
	if (sorted.length === 0) throw new RangeError("quantileSorted expects a non-empty sample")
	if (!(q >= 0 && q <= 1)) throw new RangeError(`quantileSorted expects 0 <= q <= 1, got ${q}`)
	if (sorted.length === 1) return sorted[0]!
	const position = q * (sorted.length - 1)
	const lower = Math.floor(position)
	const upper = Math.ceil(position)
	if (lower === upper) return sorted[lower]!
	return sorted[lower]! + (position - lower) * (sorted[upper]! - sorted[lower]!)
}

/**
 * Sums an array in ascending order of magnitude.
 *
 * The exact tests add hundreds of very unequal probabilities together. Summing them in index order
 * loses the small ones into the rounding of the large ones; sorting first keeps the p-value stable
 * enough that the golden values in the tests hold across platforms.
 */
export function stableSum(values: readonly number[]): number {
	const ordered = [...values].sort((a, b) => Math.abs(a) - Math.abs(b))
	let total = 0
	for (const value of ordered) total += value
	return total
}

/** Clamps into [0, 1]. Probabilities computed by subtraction can land a rounding step outside. */
export function clampUnit(value: number): number {
	if (value < 0) return 0
	if (value > 1) return 1
	return value
}
