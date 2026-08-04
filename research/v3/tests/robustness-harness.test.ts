/**
 * The harness end to end, against a candidate whose agreement rate is known in advance.
 *
 * Run:
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/v3/tests/robustness-*.test.ts
 *
 * The fixture candidate reads its answer out of the file name, so the pair set below *specifies*
 * the result rather than measuring it: six pairs must agree, three must disagree on the accent, one
 * must fail. If the harness ever reports something else for these inputs, the harness is wrong.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
	check,
	loadCandidate,
	mapWithConcurrency,
	roleInstability,
	stabilityRatioOver,
} from "../src/robustness/check.ts"
import { MIN_COMPARISONS_FOR_RATIO, agreementRate, wilsonInterval } from "../src/robustness/stats.ts"
import type { PairSetFile, Trial } from "../src/robustness/types.ts"

const V3_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const CANDIDATE = path.join(V3_ROOT, "tests/robustness-fixtures/synthetic-candidate.ts")

const AGREE = "101820-1e2a38-f2f4f7-e08a3c"
/** Same three roles, a wildly different accent — one role beyond its bar. */
const DISAGREE = "101820-1e2a38-f2f4f7-3ca0e0"

type PairSpec = { name: string; left: string; right: string; reviewed: boolean }

/** 6 agreeing, 3 disagreeing on accent, 1 that throws. Reviewed: 4 of them. */
const SPECS: PairSpec[] = [
	{ name: "agree-1", left: AGREE, right: AGREE, reviewed: true },
	{ name: "agree-2", left: AGREE, right: AGREE, reviewed: true },
	{ name: "agree-3", left: AGREE, right: AGREE, reviewed: true },
	{ name: "agree-4", left: AGREE, right: AGREE, reviewed: false },
	{ name: "agree-5", left: AGREE, right: AGREE, reviewed: false },
	{ name: "agree-6", left: AGREE, right: AGREE, reviewed: false },
	{ name: "differ-1", left: AGREE, right: DISAGREE, reviewed: true },
	{ name: "differ-2", left: AGREE, right: DISAGREE, reviewed: false },
	{ name: "differ-3", left: AGREE, right: DISAGREE, reviewed: false },
	{ name: "broken-1", left: AGREE, right: "boom", reviewed: false },
]

function fixturePairSet(): PairSetFile {
	const endpoint = (stem: string, reviewed: boolean) => ({
		artworkId: stem,
		collection: "music_artworks" as const,
		path: `${stem}.png`,
		sha256: "0".repeat(64),
		width: 640,
		height: 640,
		format: "png",
		bytes: 1,
		reviewed,
	})
	return {
		what: "fixture",
		writtenAt: "2026-08-04T00:00:00.000Z",
		generatedBy: "test",
		setId: "fixture",
		seed: 1,
		seedHex: "0x1",
		criterion: { cosineThreshold: 0.95, arm: "dinov2-vitl14", holdoutExcluded: true, reviewednessDefinition: "fixture" },
		sources: {},
		counts: {},
		strata: [],
		pairs: SPECS.map((spec) => ({
			pairId: spec.name,
			cosine: 0.99,
			renditionPairsInCensus: 1,
			foundByArms: ["dinov2-vitl14"],
			similarityBand: "0.98-0.995",
			pairReviewedness: spec.reviewed ? ("one-reviewed" as const) : ("neither-reviewed" as const),
			reviewedness: spec.reviewed ? ("reviewed" as const) : ("unseen" as const),
			collection: "music_artworks" as const,
			tierPair: ["401-640", "401-640"] as const,
			a: endpoint(spec.left, spec.reviewed),
			b: endpoint(spec.right, spec.reviewed),
		})),
	} as PairSetFile
}

async function runFixture(root: string) {
	const pairSetPath = path.join(root, "pair-set.json")
	await writeFile(pairSetPath, JSON.stringify(fixturePairSet()))
	return await check({
		candidatePath: CANDIDATE,
		pairSetPath,
		repoRoot: root,
		skipPerturbations: true,
		useFrozenLabels: true,
		now: () => "2026-08-04T00:00:00.000Z",
	})
}

test("the harness reports the agreement the fixtures specify", async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), "robustness-harness-"))
	t.after(async () => await rm(root, { recursive: true, force: true }))
	const report = await runFixture(root)

	assert.equal(report.overall.compared, 9, "the failed trial is not in the denominator")
	assert.equal(report.overall.agreed, 6)
	assert.equal(report.overall.errored, 1)
	assert.equal(report.overall.rate, 6 / 9)
	assert.equal(report.timing.trials, 10)
})

test("errors are their own bucket and never a disagreement", async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), "robustness-harness-errors-"))
	t.after(async () => await rm(root, { recursive: true, force: true }))
	const report = await runFixture(root)

	assert.equal(report.errors.length, 1)
	const failed = report.errors[0]!
	assert.equal(failed.trialId, "pair|broken-1")
	assert.equal(failed.comparison, null)
	assert.equal(failed.error?.stage, "right", "the right-hand image is the one that threw")
	assert.match(failed.error!.message, /asked to fail/)
	// And it is not among the disagreements.
	assert.equal(report.disagreements.some((trial) => trial.trialId === "pair|broken-1"), false)
})

test("the disagreeing covers are listed with both paths, for the diff viewer", async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), "robustness-harness-diff-"))
	t.after(async () => await rm(root, { recursive: true, force: true }))
	const report = await runFixture(root)

	assert.equal(report.disagreements.length, 3)
	assert.deepEqual(
		report.disagreements.map((trial) => trial.trialId).sort(),
		["pair|differ-1", "pair|differ-2", "pair|differ-3"],
	)
	for (const trial of report.disagreements) {
		assert.ok(path.isAbsolute(trial.leftPath))
		assert.ok(path.isAbsolute(trial.rightPath))
		assert.notEqual(trial.leftPath, trial.rightPath)
		assert.deepEqual([...trial.comparison!.disagreeingRoles], ["accent"])
	}
})

test("per-role reporting names the role that actually moved", async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), "robustness-harness-roles-"))
	t.after(async () => await rm(root, { recursive: true, force: true }))
	const report = await runFixture(root)

	const byRole = Object.fromEntries(report.byRole.map((role) => [role.role, role]))
	assert.equal(byRole.accent!.disagreed, 3)
	assert.equal(byRole.accent!.compared, 9)
	assert.equal(byRole.background!.disagreed, 0)
	assert.equal(byRole.surface!.disagreed, 0)
	assert.equal(byRole.foreground!.disagreed, 0)
})

test("the reviewed-vs-unseen split is reported per basis and flagged when thin", async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), "robustness-harness-split-"))
	t.after(async () => await rm(root, { recursive: true, force: true }))
	const report = await runFixture(root)

	const pairRatio = report.stabilityRatios.find((ratio) => ratio.basis === "rendition-pair")!
	// Reviewed: 3 agree + 1 differ = 3/4. Unseen: 3 agree + 2 differ = 3/5 (the broken one errors).
	assert.equal(pairRatio.reviewed.agreed, 3)
	assert.equal(pairRatio.reviewed.compared, 4)
	assert.equal(pairRatio.unseen.agreed, 3)
	assert.equal(pairRatio.unseen.compared, 5)
	assert.equal(pairRatio.ratio, 0.75 / 0.6)
	assert.equal(pairRatio.underpowered, true, "4 and 5 comparisons cannot support a ratio")
	assert.equal(report.reviewedness.source, "frozen-set-file")
})

test("the report records which candidate and which bar produced it", async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), "robustness-harness-prov-"))
	t.after(async () => await rm(root, { recursive: true, force: true }))
	const report = await runFixture(root)

	assert.equal(report.candidate.name, "synthetic-hex-from-filename")
	assert.match(report.candidate.module, /synthetic-candidate\.ts$/)
	assert.equal(report.compare.barMode, "regional")
	assert.match(report.sets.pairSet!.sha256, /^[0-9a-f]{64}$/)
})

// ---------------------------------------------------------------------------
// Loading, concurrency, statistics
// ---------------------------------------------------------------------------

test("a candidate module is validated at load time, not per image", async () => {
	const loaded = await loadCandidate(CANDIDATE)
	assert.equal(loaded.candidateId, "synthetic-hex-from-filename")
	assert.equal(typeof loaded.paletteOf, "function")
	await assert.rejects(
		() => loadCandidate(path.join(V3_ROOT, "src/robustness/stats.ts")),
		/does not export a non-empty string `candidateId`/,
	)
})

test("bounded concurrency preserves input order", async () => {
	const items = [5, 1, 4, 2, 3]
	const out = await mapWithConcurrency(items, 2, async (item) => {
		await new Promise((resolve) => setTimeout(resolve, item))
		return item * 10
	})
	assert.deepEqual(out, [50, 10, 40, 20, 30])
	assert.deepEqual(await mapWithConcurrency([], 4, async (x) => x), [])
})

test("an agreement rate keeps errors out of its denominator", () => {
	const rate = agreementRate("g", 3, 4, 7)
	assert.equal(rate.rate, 0.75)
	assert.equal(rate.compared, 4)
	assert.equal(rate.errored, 7)
	assert.equal(agreementRate("empty", 0, 0, 2).rate, null, "no comparisons is not a rate of zero")
	assert.equal(agreementRate("empty", 0, 0, 2).interval, null)
})

test("the Wilson interval brackets the estimate and stays inside [0,1]", () => {
	const [low, high] = wilsonInterval(50, 100)!
	assert.ok(low < 0.5 && high > 0.5)
	const [zeroLow, zeroHigh] = wilsonInterval(0, 10)!
	assert.equal(zeroLow, 0)
	assert.ok(zeroHigh > 0 && zeroHigh < 1, "a zero rate still has an upper bound")
	const [oneLow, oneHigh] = wilsonInterval(10, 10)!
	// Analytically exactly 1 at p = 1; in floating point it lands one ulp below, which is why this
	// is a tolerance and not an equality.
	assert.ok(Math.abs(oneHigh - 1) < 1e-12, `upper bound should be ~1, got ${oneHigh}`)
	assert.ok(oneLow > 0 && oneLow < 1)
	// A smaller sample must give a wider interval at the same rate.
	const small = wilsonInterval(5, 10)!
	const large = wilsonInterval(500, 1000)!
	assert.ok(small[1] - small[0] > large[1] - large[0])
	assert.equal(wilsonInterval(0, 0), null)
})

test("the stability ratio is null rather than infinite when the unseen arm agrees never", () => {
	const trial = (reviewedness: "reviewed" | "unseen", same: boolean): Trial =>
		({
			trialId: `${reviewedness}-${same}`,
			kind: "perturbation",
			arm: "jpeg-q92",
			artworkId: "x",
			reviewedness,
			collection: "music_artworks",
			leftPath: "/a",
			rightPath: "/b",
			comparison: { same } as never,
			error: null,
			millis: 0,
		}) as Trial

	const ratio = stabilityRatioOver("t", [trial("reviewed", true), trial("unseen", false)])
	assert.equal(ratio.ratio, null, "dividing by a zero rate must not produce Infinity")
	assert.equal(ratio.underpowered, true)
	assert.ok(MIN_COMPARISONS_FOR_RATIO > 1)
})

test("role instability ignores trials that produced no comparison", () => {
	const errored: Trial = {
		trialId: "e",
		kind: "rendition-pair",
		arm: null,
		artworkId: "x",
		reviewedness: "unseen",
		collection: "music_artworks",
		leftPath: "/a",
		rightPath: "/b",
		comparison: null,
		error: { stage: "left", message: "nope" },
		millis: 0,
	}
	for (const role of roleInstability([errored])) {
		assert.equal(role.compared, 0)
		assert.equal(role.rate, null)
	}
})
