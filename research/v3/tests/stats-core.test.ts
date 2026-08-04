/**
 * The shared statistics module: the arithmetic.
 *
 * Two kinds of check here, and the second is the one that carries weight:
 *
 *  1. **Golden values** from R / SciPy, written out in full. If a refactor moves one of these, it
 *     moved the answer.
 *  2. **BigInt oracles.** `exactTwoSidedByBigInt` and `fisherTwoSidedByBigInt` recompute the same
 *     p-values in exact integer arithmetic — no logs, no gamma function, no floating point until the
 *     final division. They are slow and could never ship, which is precisely why they make good
 *     independent witnesses: they share no code and no numerical strategy with the implementation
 *     they check. A Lanczos coefficient typo would sail past any golden value I could have derived
 *     from the implementation itself; it cannot survive these.
 *
 * `stats-adversarial.test.ts` holds the historical bugs. `stats-migration.test.ts` holds the two
 * migrated analyzers' published numbers.
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
	bucketedAgreement,
	bucketPairs,
	type AgreementBucket,
} from "../src/stats/agreement.ts"
import { exactBinomialTest, wilsonInterval } from "../src/stats/binomial.ts"
import { bootstrapCI, clusterBootstrapCI } from "../src/stats/bootstrap.ts"
import { fisherExact2x2 } from "../src/stats/fisher.ts"
import { cohensKappa } from "../src/stats/kappa.ts"
import { mcnemarExact } from "../src/stats/mcnemar.ts"
import { logGamma, probit, quantileSorted, zFor } from "../src/stats/numeric.ts"
import { honestLine } from "../src/stats/types.ts"

/* --------------------------------------------------------------------------------------------- */
/* Exact oracles in integer arithmetic, used to witness the floating-point implementations         */
/* --------------------------------------------------------------------------------------------- */

function bigChoose(n: number, k: number): bigint {
	if (k < 0 || k > n) return 0n
	let result = 1n
	for (let i = 0n; i < BigInt(k); i++) {
		result = (result * (BigInt(n) - i)) / (i + 1n)
	}
	return result
}

/** Exact two-sided binomial p against p=0.5, as a rational reduced to a float only at the end. */
function exactTwoSidedByBigInt(k: number, n: number): number {
	const observed = bigChoose(n, k)
	let numerator = 0n
	for (let i = 0; i <= n; i++) {
		const mass = bigChoose(n, i)
		if (mass <= observed) numerator += mass
	}
	return Number(numerator) / 2 ** n
}

/** Exact two-sided Fisher p, all arithmetic in BigInt until the final division. */
function fisherTwoSidedByBigInt(a: number, b: number, c: number, d: number): number {
	const rowOne = a + b
	const rowTwo = c + d
	const columnOne = a + c
	const total = a + b + c + d
	const denominator = bigChoose(total, columnOne)
	const observed = bigChoose(rowOne, a) * bigChoose(rowTwo, columnOne - a)
	let numerator = 0n
	for (let x = Math.max(0, columnOne - rowTwo); x <= Math.min(rowOne, columnOne); x++) {
		const mass = bigChoose(rowOne, x) * bigChoose(rowTwo, columnOne - x)
		if (mass <= observed) numerator += mass
	}
	return Number(numerator) / Number(denominator)
}

const distinct = { trialsAreDistinctUnits: true } as const

describe("numeric primitives", () => {
	it("logGamma reproduces exact log-factorials", () => {
		// log(10!) and log(20!), to 12 places.
		assert.ok(Math.abs(logGamma(11) - 15.104412573075516) < 1e-12)
		assert.ok(Math.abs(logGamma(21) - 42.335616460753485) < 1e-11)
	})

	it("zFor(0.95) is the textbook 1.959964", () => {
		assert.ok(Math.abs(zFor(0.95) - 1.959963984540054) < 1e-8)
		assert.ok(Math.abs(zFor(0.99) - 2.5758293035489004) < 1e-7)
	})

	it("rejects an alpha passed where a confidence level belongs", () => {
		// The historical direction of the mistake: 0.05 where 0.95 was meant produces a plausible,
		// badly wrong interval rather than an error. It errors here.
		assert.throws(() => zFor(0.05), /confidence level/)
	})

	it("probit is symmetric about the median", () => {
		assert.ok(Math.abs(probit(0.3) + probit(0.7)) < 1e-9)
		assert.ok(Math.abs(probit(0.5)) < 1e-9)
	})

	it("quantileSorted uses the numpy/R type-7 convention", () => {
		const sample = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
		assert.equal(quantileSorted(sample, 0.025), 1.225)
		assert.equal(quantileSorted(sample, 0.975), 9.775)
		assert.equal(quantileSorted(sample, 0.5), 5.5)
	})
})

describe("exact binomial test", () => {
	it("matches R's binom.test on the two-sided golden values", () => {
		const cases: ReadonlyArray<readonly [number, number, number, number]> = [
			// successes, trials, null p, R's two-sided p
			[9, 9, 0.5, 0.00390625],
			[7, 10, 0.5, 0.34375],
			[3, 10, 0.5, 0.34375],
			[60, 100, 0.5, 0.056887933640982],
			[5, 10, 0.5, 1],
		]
		for (const [successes, trials, nullProbability, expected] of cases) {
			const result = exactBinomialTest({
				successes,
				trials,
				nullProbability,
				alternative: "two-sided",
				...distinct,
			})
			assert.ok(result.ok)
			assert.ok(
				Math.abs(result.pValue - expected) < 1e-12,
				`${successes}/${trials}: got ${result.pValue}, expected ${expected}`,
			)
		}
	})

	it("matches R's binom.test on the one-sided golden values", () => {
		const greater = exactBinomialTest({
			successes: 8,
			trials: 10,
			nullProbability: 0.5,
			alternative: "greater",
			directionFixedInAdvance: "test fixture",
			...distinct,
		})
		assert.ok(greater.ok)
		assert.ok(Math.abs(greater.pValue - 0.0546875) < 1e-12)

		const less = exactBinomialTest({
			successes: 2,
			trials: 10,
			nullProbability: 0.5,
			alternative: "less",
			directionFixedInAdvance: "test fixture",
			...distinct,
		})
		assert.ok(less.ok)
		assert.ok(Math.abs(less.pValue - 0.0546875) < 1e-12)
	})

	it("agrees with exact integer arithmetic across the whole range of n=1..40", () => {
		// The independent witness: no logs, no gamma, no floating point until the last division.
		for (let n = 1; n <= 40; n++) {
			for (let k = 0; k <= n; k++) {
				const result = exactBinomialTest({
					successes: k,
					trials: n,
					nullProbability: 0.5,
					alternative: "two-sided",
					...distinct,
				})
				assert.ok(result.ok)
				const exact = Math.min(1, exactTwoSidedByBigInt(k, n))
				assert.ok(
					Math.abs(result.pValue - exact) < 1e-11,
					`n=${n} k=${k}: float ${result.pValue} vs exact ${exact}`,
				)
			}
		}
	})

	it("refuses on zero trials instead of returning a p-value", () => {
		const result = exactBinomialTest({
			successes: 0,
			trials: 0,
			nullProbability: 0.5,
			alternative: "two-sided",
			...distinct,
		})
		assert.equal(result.ok, false)
		assert.ok(!result.ok && result.reason === "no-trials")
		// The refusal carries no numeric field to reach for.
		assert.ok(!("pValue" in result))
	})

	it("records a one-sided test's pre-registration in the caveats", () => {
		const result = exactBinomialTest({
			successes: 8,
			trials: 10,
			nullProbability: 0.5,
			alternative: "greater",
			directionFixedInAdvance: "prereg §6.2",
			...distinct,
		})
		assert.ok(result.ok)
		assert.match(honestLine(result), /prereg §6\.2/)
	})
})

describe("Wilson interval", () => {
	it("matches the published bounds for 60/100 and 9/9", () => {
		const hundred = wilsonInterval(60, 100)
		assert.ok(hundred.ok)
		assert.ok(Math.abs(hundred.low - 0.5020025867119933) < 1e-12)
		assert.ok(Math.abs(hundred.high - 0.690598713635121) < 1e-12)

		const perfect = wilsonInterval(9, 9)
		assert.ok(perfect.ok)
		assert.ok(Math.abs(perfect.low - 0.7008549512424007) < 1e-12)
		assert.equal(perfect.high, 1)
	})

	it("never collapses to a point on a perfect score, the way Wald does", () => {
		const result = wilsonInterval(9, 9)
		assert.ok(result.ok)
		assert.ok(result.high - result.low > 0.25, "a 9/9 interval must still admit doubt")
	})

	it("stays inside the unit interval at both extremes", () => {
		for (const [k, n] of [
			[0, 5],
			[5, 5],
			[0, 1],
			[1, 1],
		] as const) {
			const result = wilsonInterval(k, n)
			assert.ok(result.ok)
			assert.ok(result.low >= 0 && result.high <= 1, `${k}/${n} left the unit interval`)
		}
	})

	it("refuses an empty denominator rather than calling the rate zero", () => {
		const result = wilsonInterval(0, 0)
		assert.equal(result.ok, false)
		assert.ok(!result.ok && result.reason === "empty-denominator")
	})

	it("annotates a denominator below the n=10 floor", () => {
		const result = wilsonInterval(3, 4)
		assert.ok(result.ok)
		assert.ok(result.provenance.caveats.some((caveat) => caveat.includes("denominator is 4")))
	})
})

describe("Cohen's kappa", () => {
	it("computes the textbook value on a worked table", () => {
		// 6 yes/yes, 2 no/no, 1 yes/no, 1 no/yes. po=0.8, pe=0.58, kappa=0.22/0.42.
		const pairs: (readonly [string, string])[] = [
			...Array.from({ length: 6 }, () => ["yes", "yes"] as const),
			...Array.from({ length: 2 }, () => ["no", "no"] as const),
			["yes", "no"] as const,
			["no", "yes"] as const,
		]
		const result = cohensKappa(pairs)
		assert.ok(result.ok)
		assert.ok(Math.abs(result.rawAgreement - 0.8) < 1e-12)
		assert.ok(Math.abs(result.expectedAgreement - 0.58) < 1e-12)
		assert.ok(Math.abs(result.kappa - 0.22 / 0.42) < 1e-12)
	})

	it("returns kappa 1 on perfect agreement with two categories in play", () => {
		const pairs: (readonly [string, string])[] = [
			...Array.from({ length: 6 }, () => ["yes", "yes"] as const),
			...Array.from({ length: 6 }, () => ["no", "no"] as const),
		]
		const result = cohensKappa(pairs)
		assert.ok(result.ok)
		assert.equal(result.kappa, 1)
	})

	it("refuses a degenerate one-value table instead of reporting zero", () => {
		const pairs = Array.from({ length: 12 }, () => ["yes", "yes"] as const)
		const result = cohensKappa(pairs)
		assert.equal(result.ok, false)
		assert.ok(!result.ok && result.reason === "undefined-on-this-table")
		// Raw agreement survives — it is the honest number here.
		assert.ok(!result.ok && result.rawAgreement === 1)
	})

	it("always reports raw agreement alongside kappa", () => {
		const pairs: (readonly [string, string])[] = [
			...Array.from({ length: 8 }, () => ["a", "a"] as const),
			...Array.from({ length: 4 }, () => ["a", "b"] as const),
		]
		const result = cohensKappa(pairs)
		assert.ok(result.ok)
		assert.match(result.summary, /raw agreement/)
	})
})

describe("bucketed agreement", () => {
	it("reports both denominators and never a single pooled rate", () => {
		const buckets: AgreementBucket[] = [
			...Array.from({ length: 8 }, () => "agreement" as const),
			...Array.from({ length: 2 }, () => "disagreement" as const),
			...Array.from({ length: 10 }, () => "cant_tell" as const),
		]
		const result = bucketedAgreement(buckets)
		assert.equal(result.counts.total, 20)
		assert.equal(result.counts.decided, 10)
		// 40% of all, 80% of decided. Both true, both present.
		assert.ok(Math.abs(result.agreementOfAll.rate! - 0.4) < 1e-12)
		assert.ok(Math.abs(result.agreementOfDecided.rate! - 0.8) < 1e-12)
		assert.ok(!("rate" in result), "the result must not carry one pooled rate")
	})

	it("prints the house counts line", () => {
		const result = bucketedAgreement(["agreement", "agreement"])
		assert.equal(result.countsLine, "2 agreement · 0 disagreement · 0 can't-tell  (n=2)")
	})

	it("reports no reliable rate when the escape share exceeds half", () => {
		const buckets: AgreementBucket[] = [
			...Array.from({ length: 4 }, () => "agreement" as const),
			...Array.from({ length: 6 }, () => "cant_tell" as const),
		]
		const result = bucketedAgreement(buckets)
		assert.equal(result.decidedRateReliable, false)
		assert.match(result.summary, /no reliable rate/)
		assert.ok(result.provenance.caveats.some((caveat) => caveat.includes("NO RELIABLE RATE")))
	})

	it("keeps the kappa vector and the decided denominator in step", () => {
		const rows: (readonly [string, string])[] = [
			["yes", "yes"],
			["yes", "no"],
			["not_applicable", "yes"],
			["no", "not_applicable"],
		]
		const { buckets, decidedPairs } = bucketPairs(rows, (answer) => answer === "not_applicable")
		const agreement = bucketedAgreement(buckets)
		assert.equal(decidedPairs.length, agreement.counts.decided)
		assert.equal(agreement.counts.cantTell, 2)
	})
})

describe("Fisher exact 2x2", () => {
	it("matches the tea-tasting golden values", () => {
		const twoSided = fisherExact2x2({
			table: { a: 3, b: 1, c: 1, d: 3 },
			alternative: "two-sided",
			pairing: "independent-groups",
		})
		assert.ok(twoSided.ok)
		assert.ok(Math.abs(twoSided.pValue - 0.4857142857142857) < 1e-12)

		const greater = fisherExact2x2({
			table: { a: 3, b: 1, c: 1, d: 3 },
			alternative: "greater",
			directionFixedInAdvance: "Fisher 1935",
			pairing: "independent-groups",
		})
		assert.ok(greater.ok)
		assert.ok(Math.abs(greater.pValue - 0.24285714285714285) < 1e-12)
	})

	it("agrees with exact integer arithmetic over a grid of tables", () => {
		for (let a = 0; a <= 6; a++) {
			for (let b = 0; b <= 6; b++) {
				for (let c = 0; c <= 6; c++) {
					for (let d = 0; d <= 6; d++) {
						if (a + b === 0 || c + d === 0 || a + c === 0 || b + d === 0) continue
						const result = fisherExact2x2({
							table: { a, b, c, d },
							alternative: "two-sided",
							pairing: "independent-groups",
						})
						assert.ok(result.ok)
						const exact = Math.min(1, fisherTwoSidedByBigInt(a, b, c, d))
						assert.ok(
							Math.abs(result.pValue - exact) < 1e-11,
							`[${a} ${b} / ${c} ${d}]: float ${result.pValue} vs exact ${exact}`,
						)
					}
				}
			}
		}
	})

	it("refuses a degenerate margin rather than returning p=1 as evidence", () => {
		const result = fisherExact2x2({
			table: { a: 4, b: 0, c: 6, d: 0 },
			alternative: "two-sided",
			pairing: "independent-groups",
		})
		assert.equal(result.ok, false)
		assert.ok(!result.ok && result.reason === "degenerate-margin")
	})
})

describe("McNemar exact", () => {
	it("rests on the discordant pairs, not the pairs compared", () => {
		const result = mcnemarExact({
			counts: {
				bothSucceeded: 20000,
				onlyFirstSucceeded: 12,
				onlySecondSucceeded: 8,
				neitherSucceeded: 4628,
			},
			alternative: "two-sided",
			pairLabel: "query",
		})
		assert.ok(result.ok)
		assert.equal(result.discordantPairs, 20)
		assert.equal(result.totalPairs, 24648)
		assert.equal(result.provenance.n, 20, "the n must be the discordant count")
		// The same p as a two-sided binomial on the 20 discordant pairs.
		const equivalent = exactBinomialTest({
			successes: 12,
			trials: 20,
			nullProbability: 0.5,
			alternative: "two-sided",
			...distinct,
		})
		assert.ok(equivalent.ok)
		assert.ok(Math.abs(result.pValue - equivalent.pValue) < 1e-15)
	})

	it("refuses when nothing is discordant, rather than reporting p=1", () => {
		const result = mcnemarExact({
			counts: { bothSucceeded: 500, onlyFirstSucceeded: 0, onlySecondSucceeded: 0, neitherSucceeded: 20 },
			alternative: "two-sided",
		})
		assert.equal(result.ok, false)
		assert.ok(!result.ok && result.reason === "no-discordant-pairs")
	})
})

describe("bootstrap", () => {
	const mean = (sample: readonly number[]) =>
		sample.length === 0 ? null : sample.reduce((sum, value) => sum + value, 0) / sample.length

	it("is deterministic for a given seed", () => {
		const units = Array.from({ length: 40 }, (_, index) => index)
		const spec = {
			units,
			statistic: mean,
			resamples: 2000,
			seed: 20260804,
			independenceBasis: "test fixture",
		}
		const first = bootstrapCI(spec)
		const second = bootstrapCI(spec)
		assert.ok(first.ok && second.ok)
		assert.equal(first.low, second.low)
		assert.equal(first.high, second.high)
	})

	it("refuses below the resample floor", () => {
		const result = bootstrapCI({
			units: [1, 2, 3],
			statistic: mean,
			resamples: 100,
			seed: 1,
			independenceBasis: "test fixture",
		})
		assert.equal(result.ok, false)
		assert.ok(!result.ok && result.reason === "too-few-resamples")
	})

	it("gives a wider interval when clustered data is resampled by cluster", () => {
		// 20 artworks, 8 colours each. Colours inside an artwork are near-identical, so treating
		// 160 colours as 160 independent draws reports an interval far too narrow. This is the
		// belongs-study defect, reproduced.
		const clusters = Array.from({ length: 20 }, (_, artwork) =>
			Array.from({ length: 8 }, () => artwork / 20),
		)
		const flat = clusters.flat()

		const naive = bootstrapCI({
			units: flat,
			statistic: mean,
			resamples: 4000,
			seed: 20260804,
			independenceBasis: "deliberately wrong, for the test",
		})
		const clustered = clusterBootstrapCI({
			clusters,
			statistic: mean,
			resamples: 4000,
			seed: 20260804,
			clusterBy: "artwork",
		})
		assert.ok(naive.ok && clustered.ok)
		assert.ok(
			clustered.high - clustered.low > (naive.high - naive.low) * 2,
			`cluster interval ${clustered.high - clustered.low} should dwarf the naive ${naive.high - naive.low}`,
		)
		assert.equal(clustered.resamplingUnits, 20)
		assert.equal(naive.resamplingUnits, 160)
	})

	it("names the resampling unit in the provenance", () => {
		const clusters = Array.from({ length: 26 }, (_, index) => [index, index + 1])
		const result = clusterBootstrapCI({
			clusters,
			statistic: mean,
			resamples: 2000,
			seed: 20260804,
			clusterBy: "artwork",
		})
		assert.ok(result.ok)
		assert.match(honestLine(result), /artwork/)
		assert.equal(result.provenance.n, 26)
	})
})
