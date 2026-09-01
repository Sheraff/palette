/**
 * The historical bugs, as tests.
 *
 * Every case here is a defect the Phase 0 adversarial review actually found and measured, restated
 * against the shared module. The question each one asks is not "is the arithmetic right" — that is
 * `stats-core.test.ts` — but "**would this module have let the mistake happen quietly?**"
 *
 * Sources: `reviews/toolbox-review/gap-scan.md` §3(5) for the table of ten findings, and the
 * per-area reports it aggregates (`reviews/phase-0-adversarial/*.md`).
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { bucketedAgreement } from "../src/stats/agreement.ts"
import { exactBinomialTest, wilsonInterval } from "../src/stats/binomial.ts"
import { bootstrapCI, clusterBootstrapCI } from "../src/stats/bootstrap.ts"
import { fisherExact2x2 } from "../src/stats/fisher.ts"
import { cohensKappa } from "../src/stats/kappa.ts"
import { mcnemarExact } from "../src/stats/mcnemar.ts"
import { sweepThenTest } from "../src/stats/multiplicity.ts"
import { assessSupport, fitWithDeclaredSupport } from "../src/stats/truncation.ts"
import { honestLine } from "../src/stats/types.ts"

const distinct = { trialsAreDistinctUnits: true } as const

describe("historical bug: kappa on n=3", () => {
	it("refuses, and the refusal has no kappa to read", () => {
		const result = cohensKappa([
			["yes", "yes"],
			["yes", "no"],
			["no", "no"],
		])
		assert.equal(result.ok, false)
		assert.ok(!result.ok && result.reason === "below-floor")
		assert.ok(!("kappa" in result), "a below-floor result must not carry a kappa field at all")
	})

	it("still reports the raw agreement, which is meaningful at n=3", () => {
		const result = cohensKappa([
			["yes", "yes"],
			["yes", "no"],
			["no", "no"],
		])
		assert.ok(!result.ok)
		assert.ok(Math.abs(result.rawAgreement! - 2 / 3) < 1e-12)
	})

	it("reproduces the published refusal wording at n=1 and n=2", () => {
		// These two strings appear 83 and 45 times in bcde-validation-1-analysis.json.
		const one = cohensKappa([["yes", "yes"]])
		const two = cohensKappa([
			["yes", "yes"],
			["no", "no"],
		])
		assert.ok(!one.ok && !two.ok)
		assert.equal(one.detail, "n=1 is below the 10-row floor for a kappa")
		assert.equal(two.detail, "n=2 is below the 10-row floor for a kappa")
	})
})

describe("historical bug: the uncorrected sweep", () => {
	/**
	 * `premise-analyses.md`:192-208. A SAM residual-geometry hypothesis was killed properly, by a
	 * max-statistic permutation test over a 364-rule grid (corrected p = 0.2927). The rule that
	 * *replaced* it was then scored with `binom_tail(8, 8, 0.6019) = 0.0172` — a plain one-sided
	 * binomial, no correction of any kind, on the same 43 items that suggested it. Two hypotheses,
	 * one sample, opposite standards of evidence, and the surviving one got the lenient standard.
	 */
	it("reproduces the published uncorrected p of 0.0172", () => {
		const result = exactBinomialTest({
			successes: 8,
			trials: 8,
			nullProbability: 0.6019,
			alternative: "greater",
			directionFixedInAdvance: "reproducing the historical call; the direction was NOT fixed in advance",
			...distinct,
		})
		assert.ok(result.ok)
		assert.equal(Number(result.pValue.toFixed(4)), 0.0172)
	})

	it("does not survive once the family it was found in is declared", () => {
		const result = sweepThenTest([{ id: "D-multiple-distinct-fields", pValue: 0.0172 }], {
			comparisonsRun: 364,
			correction: "holm",
			alpha: 0.05,
			familyDefinition: "the 364-rule grid the replaced hypothesis was corrected against",
		})
		assert.ok(result.ok)
		assert.equal(result.best?.survivesCorrection, false)
		assert.equal(result.survivorCount, 0)
	})

	it("says the family size in the headline, so it cannot be dropped from a report", () => {
		const result = sweepThenTest([{ id: "best-cell", pValue: 0.0172 }], {
			comparisonsRun: 364,
			correction: "holm",
			alpha: 0.05,
			familyDefinition: "26 fields x 14 values",
		})
		assert.ok(result.ok)
		assert.match(result.summary, /best of 364/)
		assert.match(honestLine(result), /family of 364/)
	})

	it("flags the exact shape of the historical mistake: clears alpha raw, fails corrected", () => {
		const result = sweepThenTest([{ id: "best-cell", pValue: 0.0172 }], {
			comparisonsRun: 364,
			correction: "holm",
			alpha: 0.05,
			familyDefinition: "26 fields x 14 values",
		})
		assert.ok(result.ok)
		assert.ok(
			result.provenance.caveats.some((caveat) => caveat.includes("would have cleared alpha uncorrected")),
		)
	})

	it("refuses a family smaller than the cells being reported", () => {
		const result = sweepThenTest(
			[
				{ id: "a", pValue: 0.01 },
				{ id: "b", pValue: 0.02 },
				{ id: "c", pValue: 0.03 },
			],
			{
				comparisonsRun: 2,
				correction: "holm",
				alpha: 0.05,
				familyDefinition: "under-declared on purpose",
			},
		)
		assert.equal(result.ok, false)
		assert.ok(!result.ok && result.reason === "under-declared-family")
	})

	it("refuses to skip correction without a written justification", () => {
		const result = sweepThenTest([{ id: "a", pValue: 0.01 }], {
			comparisonsRun: 15,
			correction: "none",
			alpha: 0.05,
			familyDefinition: "15 arms",
		})
		assert.equal(result.ok, false)
		assert.ok(!result.ok && result.reason === "unjustified-no-correction")
	})

	it("refuses Benjamini-Hochberg on a partial family, since it is a step-up over all of it", () => {
		const result = sweepThenTest([{ id: "a", pValue: 0.001 }], {
			comparisonsRun: 364,
			correction: "benjamini-hochberg",
			alpha: 0.05,
			familyDefinition: "26 fields x 14 values",
		})
		assert.equal(result.ok, false)
		assert.ok(!result.ok && result.reason === "partial-family-needs-full-set")
	})

	it("applies the same family to both hypotheses, which is what the review asked for", () => {
		// The finding was the ASYMMETRY: one hypothesis corrected over 364, the other not at all.
		const both = sweepThenTest(
			[
				{ id: "sam-residual-geometry", pValue: 0.2927 },
				{ id: "D-multiple-distinct-fields", pValue: 0.0172 },
			],
			{
				comparisonsRun: 364,
				correction: "holm",
				alpha: 0.05,
				familyDefinition: "the single 364-cell search both hypotheses came out of",
			},
		)
		assert.ok(both.ok)
		assert.equal(both.survivorCount, 0, "neither hypothesis survives its own search space")
	})
})

describe("historical bug: the truncated-sample fit", () => {
	/**
	 * `MASK_REVIEW_NOTES.md`:213-232. Round 3's section B was selected as `score < cut`, so it could
	 * not contain a single keep-side row. Its sweep reported a perfect J of 1.000 at 0.301998 — a
	 * number that measured where the sample was cut. Pooling round 1's 31 unconditioned rows took
	 * the J gain to exactly zero.
	 */
	it("flags a sample selected on the outcome, and withholds support for the claim", () => {
		const assessment = assessSupport({
			variableUnderTest: "mask score",
			claimDomain: { min: 0.3, max: 1 },
			observedValues: Array.from({ length: 23 }, (_, index) => 0.3 + index * 0.004),
			selectionRule: "masks below the cut (score < 0.4)",
			selectionRelationToVariable: { kind: "selected-on-the-outcome" },
		})
		assert.equal(assessment.verdict, "selected-on-the-outcome")
		assert.equal(assessment.supportsClaimDomain, false)
		assert.ok(assessment.annotations.some((note) => note.includes("SELECTED ON THE OUTCOME")))
	})

	it("puts the annotation where a report cannot print the number without it", () => {
		const guarded = fitWithDeclaredSupport(
			{
				variableUnderTest: "mask score",
				claimDomain: { min: 0.3, max: 1 },
				observedValues: [0.3, 0.32, 0.35, 0.38],
				selectionRule: "masks below the cut",
				selectionRelationToVariable: { kind: "selected-on-the-outcome" },
			},
			() => ({ threshold: 0.301998, youdenJ: 1 }),
			(fit) => fit.threshold,
		)
		assert.equal(guarded.fit.youdenJ, 1)
		// honestLine reads the caveats, so the warning travels with the number automatically.
		assert.match(honestLine(guarded), /SELECTED ON THE OUTCOME/)
	})

	it("accepts round 3b's left-truncation, because it came with a sensitivity check", () => {
		const assessment = assessSupport({
			variableUnderTest: "mask score",
			claimDomain: { min: 0.3, max: 1 },
			observedValues: [0.3, 0.45, 0.578, 0.7, 0.928, 1],
			selectionRule: "everything scored at or above the run floor",
			selectionRelationToVariable: {
				kind: "left-truncated-at-a-run-floor",
				floor: 0.3,
				sensitivityCheck:
					"injecting 10, 50 and 200 phantom below-floor negatives leaves the J gain at exactly 0.350",
			},
		})
		assert.equal(assessment.verdict, "left-truncated-with-sensitivity-check")
		assert.equal(assessment.supportsClaimDomain, true)
		assert.ok(assessment.annotations.some((note) => note.includes("phantom below-floor negatives")))
	})

	it("treats an unchecked selection as indistinguishable from the fatal case", () => {
		const assessment = assessSupport({
			variableUnderTest: "contrast",
			claimDomain: { min: 0, max: 1 },
			observedValues: [0.4, 0.5, 0.6],
			selectionRule: "whatever the generator produced",
			selectionRelationToVariable: { kind: "unknown" },
		})
		assert.equal(assessment.verdict, "selection-unchecked")
		assert.equal(assessment.supportsClaimDomain, false)
	})

	it("flags a fitted threshold that lands outside the sampled range", () => {
		const guarded = fitWithDeclaredSupport(
			{
				variableUnderTest: "delta L",
				claimDomain: { min: 0, max: 100 },
				observedValues: [10, 20, 30, 40],
				selectionRule: "a stratified draw on hue, unrelated to delta L",
				selectionRelationToVariable: { kind: "independent-of-the-variable" },
			},
			() => ({ fiftyPercentPoint: 72 }),
			(fit) => fit.fiftyPercentPoint,
		)
		assert.equal(guarded.extrapolatedBeyondSample, true)
		assert.match(honestLine(guarded), /extrapolation/)
	})
})

describe("historical bug: pseudo-replication", () => {
	/**
	 * `contract.md`:358-378. 24 of 120 "points" in a frozen fit were byte-identical repeats counted
	 * as independent observations; dropping them moved two frozen constants by more than 10%.
	 */
	it("cannot be asked for a binomial without declaring whether the trials are distinct units", () => {
		const honest = exactBinomialTest({
			successes: 78,
			trials: 120,
			nullProbability: 0.5,
			alternative: "two-sided",
			trialsAreDistinctUnits: false,
			distinctUnits: 96,
		})
		assert.ok(honest.ok)
		assert.ok(honest.provenance.caveats.some((caveat) => caveat.includes("PSEUDO-REPLICATION")))
		assert.equal(honest.provenance.inputs.distinctUnits, 96)
		assert.match(honestLine(honest), /120 trials come from only 96 distinct units/)
	})

	it("resampling the unit of observation understates the interval; the cluster version fixes it", () => {
		const clusters = Array.from({ length: 20 }, (_, artwork) =>
			Array.from({ length: 6 }, () => artwork / 20),
		)
		const naive = bootstrapCI({
			units: clusters.flat(),
			statistic: (sample) => sample.reduce((sum, value) => sum + value, 0) / sample.length,
			resamples: 3000,
			seed: 20260804,
			independenceBasis: "deliberately wrong, for the test",
		})
		const clustered = clusterBootstrapCI({
			clusters,
			statistic: (sample) => sample.reduce((sum, value) => sum + value, 0) / sample.length,
			resamples: 3000,
			seed: 20260804,
			clusterBy: "artwork",
		})
		assert.ok(naive.ok && clustered.ok)
		assert.ok(clustered.high - clustered.low > naive.high - naive.low)
	})
})

describe("historical bug: no paired test where one was needed", () => {
	/**
	 * `embeddings-corpus.md`:100-113. Two arms scored on the same 24,648 pairs were compared as
	 * independent samples; McNemar on the pairing collapsed the published ranking to p=0.816.
	 */
	it("Fisher refuses paired data and names the test that fits", () => {
		const result = fisherExact2x2({
			table: { a: 20012, b: 4636, c: 20008, d: 4640 },
			alternative: "two-sided",
			pairing: "paired",
		})
		assert.equal(result.ok, false)
		assert.ok(!result.ok && result.reason === "paired-data")
		assert.match(result.detail, /mcnemarExact/)
	})

	it("the paired test reports the honest n and an unimpressive p", () => {
		const result = mcnemarExact({
			counts: {
				bothSucceeded: 19800,
				onlyFirstSucceeded: 212,
				onlySecondSucceeded: 208,
				neitherSucceeded: 4428,
			},
			alternative: "two-sided",
			pairLabel: "pair",
		})
		assert.ok(result.ok)
		assert.equal(result.discordantPairs, 420)
		assert.ok(result.pValue > 0.8, `expected an unimpressive p, got ${result.pValue}`)
		assert.match(honestLine(result), /not the 24648 pairs compared/)
	})
})

describe("historical bug: vacuous guards over empty input", () => {
	/**
	 * `premise-analyses.md`:77-93 — `canary_stable: true` reported over zero rows. Nothing in this
	 * module returns a passing verdict on an empty sample.
	 */
	it("every entry point refuses an empty sample rather than passing it", () => {
		const kappa = cohensKappa([])
		assert.equal(kappa.ok, false)

		const wilson = wilsonInterval(0, 0)
		assert.equal(wilson.ok, false)

		const binomial = exactBinomialTest({
			successes: 0,
			trials: 0,
			nullProbability: 0.5,
			alternative: "two-sided",
			...distinct,
		})
		assert.equal(binomial.ok, false)

		const fisher = fisherExact2x2({
			table: { a: 0, b: 0, c: 0, d: 0 },
			alternative: "two-sided",
			pairing: "independent-groups",
		})
		assert.equal(fisher.ok, false)

		const boot = bootstrapCI({
			units: [],
			statistic: () => null,
			resamples: 2000,
			seed: 1,
			independenceBasis: "test fixture",
		})
		assert.equal(boot.ok, false)
	})

	it("an all-can't-tell stratum reports no rate rather than 0% or 100%", () => {
		const result = bucketedAgreement(["cant_tell", "cant_tell", "cant_tell"])
		assert.equal(result.agreementOfDecided.rate, null)
		assert.equal(result.decidedRateReliable, false)
	})
})

describe("historical bug: two divergent Wilson spellings", () => {
	/**
	 * `analyze-mask-quality.ts` used z = 1.96 clamped; `analyze-bracketing-round-3.ts` used
	 * z = 1.959963984540054 unclamped; `ladder/analyze.py` used a third. One module, one answer.
	 */
	it("uses the precise z, so the published round-3 bounds reproduce", () => {
		const result = wilsonInterval(17, 42)
		assert.ok(result.ok)
		assert.equal(Number(result.low.toFixed(4)), 0.2704)
		assert.equal(Number(result.high.toFixed(4)), 0.5551)
	})

	it("clamps, which the rounded z would not have reached anyway on these tables", () => {
		const result = wilsonInterval(0, 12)
		assert.ok(result.ok)
		assert.equal(result.low, 0)
	})
})
