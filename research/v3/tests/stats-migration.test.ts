/**
 * The two migrations, pinned against their published artifacts.
 *
 * `analyze-bcde-validation.ts` and `data/calibration/analyze-bracketing-round-3.ts` both had their
 * hand-rolled statistics replaced by `src/stats/`. Neither published number was allowed to move,
 * and this file is where that claim is checked rather than asserted.
 *
 * The round-3 numbers are read out of the committed analysis JSON, not copied into the test, so the
 * test cannot drift away from the artifact it is protecting. That is legitimate golden comparison
 * under `CONVENTIONS.md`'s rule — round 3's population was frozen by pre-registration at n=42 on
 * 2026-08-03, so these are fixed artifacts rather than corpus-size-dependent diagnostics. The two
 * fields in that file that *do* move with the corpus (`otherLabelSchema`, `otherBatch`, which count
 * warehouse records skipped for belonging to other rounds) are deliberately not touched here.
 */

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

import { exactBinomialTest, wilsonInterval } from "../src/stats/binomial.ts"
import { cohenKappa, MIN_KAPPA_N } from "../src/review-server/analyze-bcde-validation.ts"

const distinct = { trialsAreDistinctUnits: true } as const

const ROUND_3_ANALYSIS_PATH = fileURLToPath(
	new URL("../data/calibration/bracketing-round-3-analysis.json", import.meta.url),
)

/** The published rounding: p at six places, rates and interval bounds at four. */
const round = (value: number, places: number) => Number(value.toFixed(places))

/** The two-sided exact p against 0.5, as the migrated analyzer now computes it. */
function publishedP(successes: number, trials: number): number {
	const result = exactBinomialTest({
		successes,
		trials,
		nullProbability: 0.5,
		alternative: "two-sided",
		...distinct,
	})
	assert.ok(result.ok)
	return round(result.pValue, 6)
}

function publishedWilson(successes: number, trials: number): { low: number; high: number } {
	const result = wilsonInterval(successes, trials, 0.95)
	assert.ok(result.ok)
	return { low: round(result.low, 4), high: round(result.high, 4) }
}

/**
 * The pre-registered decisive-cut search, re-expressed on the shared module.
 *
 * Identical in structure to the analyzer's `decisiveCuts`: the smallest k above the midpoint whose
 * two-sided exact p clears 0.05 *and* whose Wilson interval excludes 0.5, and its mirror below.
 * Reproduced here rather than imported because the analyzer is a top-level-await script that would
 * run a full analysis on import.
 */
function decisiveCuts(n: number): { favoursMax: number | null; favoursAverage: number | null } {
	let favoursMax: number | null = null
	for (let k = Math.ceil(n / 2); k <= n; k++) {
		const interval = wilsonInterval(k, n, 0.95)
		if (publishedRawP(k, n) < 0.05 && interval.ok && interval.low > 0.5) {
			favoursMax = k
			break
		}
	}
	let favoursAverage: number | null = null
	for (let k = Math.floor(n / 2); k >= 0; k--) {
		const interval = wilsonInterval(k, n, 0.95)
		if (publishedRawP(k, n) < 0.05 && interval.ok && interval.high < 0.5) {
			favoursAverage = k
			break
		}
	}
	return { favoursMax, favoursAverage }
}

function publishedRawP(successes: number, trials: number): number {
	const result = exactBinomialTest({
		successes,
		trials,
		nullProbability: 0.5,
		alternative: "two-sided",
		...distinct,
	})
	return result.ok ? result.pValue : 1
}

type Round3Analysis = {
	primary: {
		n: number
		k: number
		exactBinomialP: number
		wilson95: { low: number; high: number }
		decisiveCutsAtRealizedN: { favoursMax: number; favoursAverage: number }
	}
	anisotropy: {
		lightnessDominant: { n: number; k: number; exactBinomialP: number; wilson95: { low: number; high: number } }
		chromaDominant: { n: number; k: number; exactBinomialP: number; wilson95: { low: number; high: number } }
	}
	sensitivity: { n: number; k: number; exactBinomialP: number }
}

describe("migration: bracketing round 3 reproduces its published analysis", () => {
	it("reproduces every published p-value and Wilson bound from the committed artifact", async () => {
		const published = JSON.parse(await readFile(ROUND_3_ANALYSIS_PATH, "utf8")) as Round3Analysis

		const cells = [
			published.primary,
			published.anisotropy.lightnessDominant,
			published.anisotropy.chromaDominant,
			published.sensitivity,
		]
		for (const cell of cells) {
			assert.equal(
				publishedP(cell.k, cell.n),
				cell.exactBinomialP,
				`exact binomial p for ${cell.k}/${cell.n}`,
			)
		}

		for (const cell of [
			published.primary,
			published.anisotropy.lightnessDominant,
			published.anisotropy.chromaDominant,
		]) {
			assert.deepEqual(
				publishedWilson(cell.k, cell.n),
				{ low: cell.wilson95.low, high: cell.wilson95.high },
				`Wilson bounds for ${cell.k}/${cell.n}`,
			)
		}
	})

	it("reproduces the pre-registered decisive cuts at the realized n", async () => {
		const published = JSON.parse(await readFile(ROUND_3_ANALYSIS_PATH, "utf8")) as Round3Analysis
		assert.deepEqual(decisiveCuts(published.primary.n), {
			favoursMax: published.primary.decisiveCutsAtRealizedN.favoursMax,
			favoursAverage: published.primary.decisiveCutsAtRealizedN.favoursAverage,
		})
	})

	it("pins the headline numbers literally, so a silent artifact rewrite is still caught", () => {
		// The values as quoted in bracketing-round-3-preregistration.md §9 and PHASE_0_LOOSE_ENDS.md.
		assert.equal(publishedP(17, 42), 0.279956)
		assert.deepEqual(publishedWilson(17, 42), { low: 0.2704, high: 0.5551 })
		assert.equal(publishedP(15, 21), 0.078354)
		assert.deepEqual(publishedWilson(15, 21), { low: 0.5004, high: 0.8619 })
		assert.equal(publishedP(2, 21), 0.000221)
		assert.deepEqual(publishedWilson(2, 21), { low: 0.0265, high: 0.2891 })
		assert.equal(publishedP(18, 42), 0.440799)
		assert.deepEqual(decisiveCuts(42), { favoursMax: 28, favoursAverage: 14 })
	})

	it("the tail-doubling the analyzer used is only equal to the general rule because the null is 0.5", () => {
		// The migration replaced "double the smaller tail" with "sum every outcome no more likely
		// than the observed one". At p=0.5 the binomial is symmetric and the two coincide exactly —
		// which is why the old code was right here, and why it would not have been at another null.
		for (let n = 1; n <= 60; n++) {
			for (let k = 0; k <= n; k++) {
				const doubled = Math.min(1, 2 * smallerTailAtHalf(k, n))
				assert.ok(
					Math.abs(publishedRawP(k, n) - doubled) < 1e-12,
					`n=${n} k=${k}: general rule ${publishedRawP(k, n)} vs doubling ${doubled}`,
				)
			}
		}
		// And at a null that is not 0.5, they genuinely differ — so the general rule was the right
		// thing to move to rather than a cosmetic change.
		const asymmetric = exactBinomialTest({
			successes: 2,
			trials: 10,
			nullProbability: 0.3,
			alternative: "two-sided",
			...distinct,
		})
		assert.ok(asymmetric.ok)
		assert.ok(Math.abs(asymmetric.pValue - 1) > 0.15)
	})
})

/** The smaller tail at p=0.5, the way the pre-migration analyzer computed it. */
function smallerTailAtHalf(k: number, n: number): number {
	const logFactorial = (value: number) => {
		let accumulator = 0
		for (let i = 2; i <= value; i++) accumulator += Math.log(i)
		return accumulator
	}
	const pmf = (i: number) =>
		Math.exp(logFactorial(n) - logFactorial(i) - logFactorial(n - i) + n * Math.log(0.5))
	let tail = 0
	if (k * 2 <= n) for (let i = 0; i <= k; i++) tail += pmf(i)
	else for (let i = k; i <= n; i++) tail += pmf(i)
	return tail
}

describe("migration: bcde validation keeps its published kappa shape", () => {
	it("still returns the four published fields, with both numbers at four places", () => {
		const result = cohenKappa([
			...Array.from({ length: 8 }, () => ["a", "a"] as const),
			...Array.from({ length: 4 }, () => ["a", "b"] as const),
		])
		assert.deepEqual(Object.keys(result).sort(), ["kappa", "n", "raw", "reason"])
		assert.equal(result.n, 12)
		assert.equal(result.raw, 0.6667)
		assert.equal(result.reason, null)
		assert.equal(result.kappa, 0)
	})

	it("reproduces the three published refusal strings verbatim", () => {
		assert.equal(cohenKappa([]).reason, "no comparable rows")
		assert.equal(cohenKappa([["y", "y"]]).reason, "n=1 is below the 10-row floor for a kappa")
		assert.equal(
			cohenKappa([
				["y", "y"],
				["n", "n"],
			]).reason,
			"n=2 is below the 10-row floor for a kappa",
		)
		assert.equal(
			cohenKappa(Array.from({ length: 12 }, () => ["yes", "yes"] as const)).reason,
			"both raters used one value only; kappa is 0/0 on that table",
		)
	})

	it("keeps raw agreement below the floor and withholds only the coefficient", () => {
		const below = cohenKappa([
			["y", "y"],
			["y", "n"],
		])
		assert.equal(below.kappa, null)
		assert.equal(below.raw, 0.5)
		assert.equal(below.n, 2)
	})

	it("re-exports the floor from the shared module, so the two cannot drift", () => {
		assert.equal(MIN_KAPPA_N, 10)
	})

	it("honours a caller-supplied floor, as the pre-migration signature did", () => {
		const pairs = Array.from({ length: 4 }, (_, index) =>
			index === 0 ? (["a", "b"] as const) : (["a", "a"] as const),
		)
		assert.equal(cohenKappa(pairs).kappa, null)
		assert.equal(cohenKappa(pairs, 3).reason, null)
	})
})
