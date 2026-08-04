/**
 * The exact binomial test and the Wilson score interval.
 *
 * These two are the workhorses of every "did the reviewer agree with the instrument more often than
 * chance" question in this project, and both were hand-rolled more than once before this file
 * existed. The normal approximation is not offered at all: at the n these rounds actually run
 * (9 covers, 16 covers, 50 labels) it is wrong in the direction that flatters the hypothesis, and
 * the exact test costs microseconds.
 */

import { binomialPmf, clampUnit, probit, stableSum, zFor } from "./numeric.ts"
import { provenance, refuse, type Provenance, type Refused } from "./types.ts"

/**
 * Relative slack when deciding which outcomes are "at least as extreme" as the observed one.
 *
 * [INHERITED] The 1e-7 of R's `binom.test`, adopted so that two-sided p-values from this module
 * match R and `scipy.stats.binomtest` digit for digit. Without slack, outcomes whose probability is
 * mathematically equal to the observed one but differs in the last bit fall out of the sum, and the
 * p-value jumps by a whole term for symmetric tables — the worst case being exactly the symmetric
 * ones analysts eyeball to sanity-check the implementation.
 */
const EXTREMENESS_RELATIVE_SLACK = 1e-7

/**
 * What the test is being asked.
 *
 * A one-sided alternative carries `directionFixedInAdvance` and there is no way to spell one
 * without it. This is a structural guard, not a formality: a one-sided p-value chosen after seeing
 * which way the counts fell is half of a two-sided p-value with none of the protection, and it is
 * the single easiest way to turn a null result into a publishable one by accident. The field wants
 * a pointer to where the direction was fixed — a prereg section, a decision record id — and it is
 * echoed into the provenance so the claim travels with the number.
 */
export type BinomialAlternative =
	| { readonly alternative: "two-sided" }
	| { readonly alternative: "greater" | "less"; readonly directionFixedInAdvance: string }

/**
 * Whether the trials are distinct things or repeats of the same things.
 *
 * The review's pseudo-replication finding (`reviews/phase-0-adversarial/contract.md`:358-378)
 * measured the cost: 24 of 120 "points" in a frozen fit were byte-identical repeats counted as
 * independent observations, and dropping them **moved two frozen constants by more than 10%**. A
 * binomial on 120 trials that are really 96 distinct items reports a p-value too small, in the
 * direction that flatters the hypothesis.
 *
 * The gap-scan's design principle for this module is explicit — *"n must be declared as `units` or
 * `trials` (kills pseudo-replication at the type level)"* — so there is no default. Either the
 * trials are distinct units, and you say so, or they are not, and you say how many distinct units
 * there really were.
 */
export type TrialIndependence =
	| { readonly trialsAreDistinctUnits: true }
	| { readonly trialsAreDistinctUnits: false; readonly distinctUnits: number }

export type BinomialTestSpec = BinomialAlternative &
	TrialIndependence & {
		/** Number of successes observed. */
		readonly successes: number
		/** Number of trials. Every trial, including the ones that produced no success. */
		readonly trials: number
		/** The null probability of success on one trial. For "better than a coin", 0.5. */
		readonly nullProbability: number
	}

export type BinomialTestValue = {
	readonly ok: true
	readonly successes: number
	readonly trials: number
	readonly nullProbability: number
	readonly alternative: "two-sided" | "greater" | "less"
	/** Observed success rate. Present for reporting; the test is on the counts, not on this. */
	readonly observedRate: number
	readonly pValue: number
	readonly summary: string
	readonly provenance: Provenance
}

export type BinomialTestResult = BinomialTestValue | Refused<"no-trials">

/**
 * The exact binomial test.
 *
 * Two-sided is the method of small p-values: the p-value is the total probability of every outcome
 * no more likely than the one observed. That is the definition R and SciPy implement, and it is
 * used here in its plain form (sum over all outcomes) rather than R's two-branch optimisation,
 * because at these n the cost is nothing and the plain form is the one a reader can check.
 */
export function exactBinomialTest(spec: BinomialTestSpec): BinomialTestResult {
	const { successes, trials, nullProbability } = spec
	if (!Number.isInteger(successes) || !Number.isInteger(trials)) {
		throw new RangeError(`exactBinomialTest expects integer counts, got ${successes}/${trials}`)
	}
	if (successes < 0 || trials < 0 || successes > trials) {
		throw new RangeError(`exactBinomialTest expects 0 <= successes <= trials, got ${successes}/${trials}`)
	}
	if (!(nullProbability >= 0 && nullProbability <= 1)) {
		throw new RangeError(`exactBinomialTest expects 0 <= nullProbability <= 1, got ${nullProbability}`)
	}

	const method = `exact binomial, ${spec.alternative}${
		spec.alternative === "two-sided" ? " by the method of small p-values" : ""
	}, null p=${nullProbability}`

	if (trials === 0) {
		return refuse(
			"no-trials",
			"Exact binomial test not computed: zero trials. A p-value on an empty sample is not a weak result, it is not a result.",
			provenance(method, 0, { successes, trials, nullProbability, alternative: spec.alternative }),
		)
	}

	const pValue = clampUnit(
		spec.alternative === "greater"
			? tailProbabilityAtLeast(successes, trials, nullProbability)
			: spec.alternative === "less"
				? tailProbabilityAtMost(successes, trials, nullProbability)
				: twoSidedProbability(successes, trials, nullProbability),
	)

	const caveats: string[] = []
	if (spec.alternative !== "two-sided") {
		caveats.push(
			`one-sided p-value; direction fixed in advance per: ${spec.directionFixedInAdvance}. If that reference does not predate the data, this number is not a one-sided test.`,
		)
	}
	if (!spec.trialsAreDistinctUnits) {
		caveats.push(
			`PSEUDO-REPLICATION: ${trials} trials come from only ${spec.distinctUnits} distinct units. The exact test assumes independent trials, so this p-value is smaller than the evidence supports. Treat it as an upper bound on the strength of the finding, or re-run over the ${spec.distinctUnits} units.`,
		)
	}

	const observedRate = successes / trials
	const inputs: Record<string, number | string | boolean> = {
		successes,
		trials,
		nullProbability,
		alternative: spec.alternative,
		distinctUnits: spec.trialsAreDistinctUnits ? trials : spec.distinctUnits,
	}
	if (spec.alternative !== "two-sided") inputs.directionFixedInAdvance = spec.directionFixedInAdvance

	return {
		ok: true,
		successes,
		trials,
		nullProbability,
		alternative: spec.alternative,
		observedRate,
		pValue,
		summary: `${successes}/${trials} (${formatRate(observedRate)}) vs null p=${nullProbability}: p=${formatP(pValue)}`,
		provenance: provenance(method, trials, inputs, [], caveats),
	}
}

/** P(X >= k). */
function tailProbabilityAtLeast(k: number, n: number, p: number): number {
	const terms: number[] = []
	for (let i = k; i <= n; i++) terms.push(binomialPmf(i, n, p))
	return stableSum(terms)
}

/** P(X <= k). */
function tailProbabilityAtMost(k: number, n: number, p: number): number {
	const terms: number[] = []
	for (let i = 0; i <= k; i++) terms.push(binomialPmf(i, n, p))
	return stableSum(terms)
}

/** Total probability of every outcome no more likely than the observed one. */
function twoSidedProbability(k: number, n: number, p: number): number {
	if (p === 0) return k === 0 ? 1 : 0
	if (p === 1) return k === n ? 1 : 0
	const observed = binomialPmf(k, n, p)
	const threshold = observed * (1 + EXTREMENESS_RELATIVE_SLACK)
	const terms: number[] = []
	for (let i = 0; i <= n; i++) {
		const mass = binomialPmf(i, n, p)
		if (mass <= threshold) terms.push(mass)
	}
	return stableSum(terms)
}

export type WilsonIntervalValue = {
	readonly ok: true
	readonly successes: number
	readonly trials: number
	readonly rate: number
	readonly low: number
	readonly high: number
	readonly confidence: number
	readonly summary: string
	readonly provenance: Provenance
}

export type WilsonIntervalResult = WilsonIntervalValue | Refused<"empty-denominator">

/**
 * The Wilson score interval for a proportion.
 *
 * Wilson rather than Wald because Wald's interval on 9-of-9 is `[1.00, 1.00]` — a claim of
 * certainty produced by a formula that has simply run out of road — and every round in this project
 * has denominators in that range. Wilson stays inside [0, 1], never collapses to a point, and is
 * the interval the reviewed analyzers should have been using where they printed a bare rate.
 *
 * The interval is reported alongside the rate, never instead of it, and never without its
 * denominator: {@link Provenance.n} carries the trials.
 */
export function wilsonInterval(successes: number, trials: number, confidence = 0.95): WilsonIntervalResult {
	if (!Number.isInteger(successes) || !Number.isInteger(trials)) {
		throw new RangeError(`wilsonInterval expects integer counts, got ${successes}/${trials}`)
	}
	if (successes < 0 || trials < 0 || successes > trials) {
		throw new RangeError(`wilsonInterval expects 0 <= successes <= trials, got ${successes}/${trials}`)
	}
	const method = `Wilson score interval at ${formatConfidence(confidence)}`
	if (trials === 0) {
		return refuse(
			"empty-denominator",
			"Wilson interval not computed: the denominator is zero. There is no rate to bound.",
			provenance(method, 0, { successes, trials, confidence }),
		)
	}
	const z = zFor(confidence)
	const zSquared = z * z
	const denominator = trials + zSquared
	const centre = (successes + zSquared / 2) / denominator
	const halfWidth =
		(z / denominator) * Math.sqrt((successes * (trials - successes)) / trials + zSquared / 4)
	// At the extremes the algebra collapses exactly: with no successes, centre and half-width are
	// both z^2 / (2(n + z^2)) and the lower bound is 0; with no failures they sum to 1. Floating
	// point leaves a few times 1e-17 behind instead, and a lower bound printed as 1.4e-17 rather
	// than 0 is the kind of detail that makes a reader distrust the rest of the table. These two
	// lines are the exact values, not a tolerance.
	const low = successes === 0 ? 0 : clampUnit(centre - halfWidth)
	const high = successes === trials ? 1 : clampUnit(centre + halfWidth)
	const rate = successes / trials

	const caveats: string[] = []
	if (trials < SMALL_DENOMINATOR_NOTE_BELOW) {
		caveats.push(
			`denominator is ${trials}; the interval spans ${formatRate(high - low)} of the unit line, so it constrains very little`,
		)
	}

	return {
		ok: true,
		successes,
		trials,
		rate,
		low,
		high,
		confidence,
		summary: `${successes}/${trials} = ${formatRate(rate)} (${formatConfidence(confidence)} CI ${formatRate(low)}-${formatRate(high)})`,
		provenance: provenance(method, trials, { successes, trials, confidence, z }, [], caveats),
	}
}

/**
 * Below this denominator a proportion's interval is annotated as barely constraining.
 *
 * [REVIEWED] Same n=10 the kappa floor uses (`kappa.ts`), for the same reason and from the same
 * ruling. Here it annotates rather than refuses: a rate on 7 items is still a fact about those 7
 * items, whereas a kappa on 7 items is a chance-correction estimated from a table too sparse to
 * estimate it from.
 */
const SMALL_DENOMINATOR_NOTE_BELOW = 10

/** Rates print as percentages to one decimal, the form the review rounds already use. */
export function formatRate(rate: number): string {
	return `${(rate * 100).toFixed(1)}%`
}

/** p-values print with a floor rather than as `0`, which no exact test ever actually returns. */
export function formatP(pValue: number): string {
	if (pValue < 1e-4) return "<0.0001"
	return pValue.toFixed(4)
}

/** Confidence levels print as percentages without trailing zeroes: 0.95 becomes "95%". */
export function formatConfidence(confidence: number): string {
	const percent = confidence * 100
	return `${Number.isInteger(percent) ? percent.toString() : percent.toFixed(1)}%`
}

export { probit }
