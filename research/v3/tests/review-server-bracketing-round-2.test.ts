/**
 * Bracketing round 2 — the refinement round.
 *
 * Round 1 found the bar and left four intervals; round 2 spends its whole budget inside them, splits
 * the widest quadrant by hue, and probes whether the bar depends on the *direction* of a difference
 * and not only its size. The properties this file guards:
 *
 *  - **round 1 is untouched** — it is released, its constants are already consumed by the contract,
 *    and its fixture must stay byte-identical after every change made here;
 *  - **the round is built against the posteriors it claims to be built against**, checked against
 *    the committed round-1 analysis rather than trusted;
 *  - **the two rounds are pooled only when they share a criterion**, the standing lesson of the
 *    abandoned first pass; and
 *  - **nothing the reviewer must not know is served**, exactly as in round 1.
 */
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { after, before, describe, it } from "node:test"
import { okLabDistance, rgbToOkLab } from "../src/contract/color.ts"
import type { OracleLabelRecord } from "../src/warehouse/records.ts"
import {
	analyzeBracketing,
	analyzeBracketingRound2,
} from "../src/review-server/analyze-bracketing.ts"
import {
	BRACKETING_ACTIVE_BATCH_ID,
	BRACKETING_CRITERION,
	BRACKETING_FIXTURE_PATH,
	BRACKETING_FIXTURE_VERSION,
	BRACKETING_ROUND_2_BATCH_ID,
	BRACKETING_ROUND_2_FIXTURE_PATH,
	DIRECTION_KINDS,
	HUE_THIRD_BOUNDARIES_DEGREES,
	PART_PROMPTS,
	QUADRANTS,
	ROUND2_CONTROLS_PER_QUADRANT,
	ROUND2_DIRECTION_TARGET,
	ROUND2_LADDER_STEPS,
	ROUND2_LIGHT_SATURATED_STEPS_PER_THIRD,
	ROUND2_PRIOR_SAME_COLOR_BAR,
	ROUND2_PROBE_BASE_MIN_CHROMA,
	ROUND2_REPEATS_PER_QUADRANT,
	ROUND_1_INTERVALS,
	generateBracketingFixture,
	generateBracketingRound2Fixture,
	hueThirdOf,
	serializeFixture,
	type BracketingFixture,
} from "../src/review-server/bracketing.ts"
import { seedBracketingRound, seedBracketingRound2 } from "../src/review-server/server.ts"
import { readJsonl } from "../src/review-server/store.ts"
import { call, startHarness, type Harness } from "../src/review-server/test-support.ts"
import type { StoredBracketingBatch } from "../src/review-server/types.ts"

const fixture = generateBracketingRound2Fixture()
const round1 = generateBracketingFixture()
const ladder = fixture.items.filter((item) => item.role === "ladder")
const probes = fixture.items.filter((item) => item.role === "direction-probe")
const repeats = fixture.items.filter((item) => item.role === "repeat")
const controls = fixture.items.filter((item) => item.role === "control-identical")

/** Total budget: the reviewer answers at about five seconds a pair, so 80 is about seven minutes. */
const ITEM_BUDGET = 80

describe("bracketing round 2 — design", () => {
	it("leaves round 1 byte-identical", async () => {
		const committed = await readFile(BRACKETING_FIXTURE_PATH, "utf8")
		assert.equal(
			committed,
			serializeFixture(round1),
			"round 1 is released; changing what its generator produces would rewrite answered evidence",
		)
	})

	it("is deterministic and matches the committed file", async () => {
		assert.deepEqual(generateBracketingRound2Fixture(), fixture)
		const committed = await readFile(BRACKETING_ROUND_2_FIXTURE_PATH, "utf8")
		assert.equal(
			committed,
			serializeFixture(fixture),
			"the committed round-2 fixture is not what the generator produces — regenerate it with --round 2 --write",
		)
	})

	it("was built against the posteriors it claims, and the committed analysis still says so", async () => {
		const analysis = JSON.parse(
			await readFile(new URL("../data/calibration/bracketing-round-1-analysis.json", import.meta.url), "utf8"),
		) as {
			part1: {
				pooled: { threshold: number }
				quadrants: { quadrant: string; threshold: number; confidenceInterval: { low: number; high: number } }[]
			}
		}
		for (const quadrant of QUADRANTS) {
			const source = analysis.part1.quadrants.find((entry) => entry.quadrant === quadrant)!
			const used = ROUND_1_INTERVALS[quadrant]
			// The constants are the analysis rounded to five decimals; anything further apart means the
			// round was designed against a posterior that has since moved.
			assert.ok(Math.abs(used.low - source.confidenceInterval.low) < 5e-6, `${quadrant} low drifted`)
			assert.ok(Math.abs(used.high - source.confidenceInterval.high) < 5e-6, `${quadrant} high drifted`)
			assert.ok(Math.abs(used.threshold - source.threshold) < 5e-6, `${quadrant} threshold drifted`)
		}
		assert.equal(fixture.refinement?.refines, BRACKETING_ACTIVE_BATCH_ID)
		// Round 2's prior is round 1's *own* pooled threshold, taken from the same analysis file as the
		// windows — not from the contract's `POOLED_SAME_COLOR_BAR`, which the contract re-derives on
		// its own schedule and which already moved once (0.01582 → 0.01535) while this round was being
		// built. A committed fixture cannot depend on a number another workstream can change.
		assert.equal(fixture.prior.sameColorBar, ROUND2_PRIOR_SAME_COLOR_BAR)
		assert.ok(
			Math.abs(fixture.prior.sameColorBar - analysis.part1.pooled.threshold) < 5e-6,
			"the prior drifted from round 1's own pooled threshold",
		)
	})

	it("fits the reviewer's budget and is part 1 only", () => {
		assert.equal(fixture.items.length, ITEM_BUDGET)
		assert.ok(fixture.items.length <= ITEM_BUDGET, "80 pairs is about seven minutes at five seconds a pair")
		assert.equal(fixture.items.filter((item) => item.part === "accent-visible").length, 0, "round 1 answered part 2")
		assert.equal(ladder.length, 48)
		assert.equal(probes.length, DIRECTION_KINDS.length * QUADRANTS.length)
		assert.equal(repeats.length, ROUND2_REPEATS_PER_QUADRANT * QUADRANTS.length)
		assert.equal(controls.length, ROUND2_CONTROLS_PER_QUADRANT * QUADRANTS.length)
		assert.equal(ladder.length + probes.length + repeats.length + controls.length, fixture.items.length)
	})

	it("puts every ladder rung inside round 1's interval for its quadrant", () => {
		for (const quadrant of QUADRANTS) {
			const window = ROUND_1_INTERVALS[quadrant]
			const rungs = ladder.filter((item) => item.stratum === quadrant)
			assert.equal(
				rungs.length,
				quadrant === "light-saturated"
					? ROUND2_LIGHT_SATURATED_STEPS_PER_THIRD * HUE_THIRD_BOUNDARIES_DEGREES.length
					: ROUND2_LADDER_STEPS,
			)
			for (const rung of rungs) {
				assert.ok(
					rung.truth.targetDistance! >= window.low - 1e-9 && rung.truth.targetDistance! <= window.high + 1e-9,
					`${rung.itemId} targets ${rung.truth.targetDistance} outside ${window.low}–${window.high}`,
				)
			}
			// The achieved distances are what the analysis fits, and the 8-bit grid moves them. They must
			// stay near the window, not exactly inside it — see the expressibility floor below.
			const achieved = rungs.map((item) => item.truth.okLabDistance)
			assert.ok(Math.min(...achieved) > window.low * 0.85, `${quadrant} fell far below its window`)
			assert.ok(Math.max(...achieved) < window.high * 1.15, `${quadrant} ran far above its window`)
		}
	})

	it("records the achieved distance, never the target, and stays on the 8-bit grid", () => {
		for (const item of fixture.items) {
			assert.equal(
				item.truth.okLabDistance,
				okLabDistance(rgbToOkLab(item.first), rgbToOkLab(item.second)),
				`${item.itemId} records a distance its colours do not have`,
			)
			for (const channel of [...item.first, ...item.second]) {
				assert.ok(Number.isInteger(channel) && channel >= 0 && channel <= 255, "colours must be 8-bit sRGB")
			}
		}
	})

	it("measures the 8-bit floor and stays clear of it", () => {
		const floors = fixture.refinement!.expressibilityFloor
		for (const quadrant of QUADRANTS) {
			const floor = floors[quadrant]
			assert.ok(floor.p10 <= floor.median && floor.median <= floor.p90, `${quadrant} floor quantiles are unordered`)
			const smallest = Math.min(
				...ladder.filter((item) => item.stratum === quadrant).map((item) => item.truth.okLabDistance),
			)
			// The honest statement: the smallest rung is a few grid steps, not a fraction of one. Below
			// about two steps the ladder would be measuring sRGB rather than the reviewer.
			assert.ok(
				smallest > floor.median * 2,
				`${quadrant}'s smallest rung ${smallest} is under two grid steps (${floor.median})`,
			)
		}
		// Dark-neutral is the tight one, and it is where the caveat belongs: round 1's interval starts
		// at 0.00575 and one grid step there is about a quarter of that.
		assert.ok(floors["dark-neutral"].median / ROUND_1_INTERVALS["dark-neutral"].low > 0.15)
	})

	it("splits light-saturated into three hue thirds, with both colours of a pair in the same third", () => {
		for (let third = 0; third < HUE_THIRD_BOUNDARIES_DEGREES.length; third++) {
			const inThird = ladder.filter((item) => item.hueThird === third)
			assert.equal(inThird.length, ROUND2_LIGHT_SATURATED_STEPS_PER_THIRD)
			for (const item of inThird) {
				assert.equal(item.stratum, "light-saturated")
				assert.equal(hueThirdOf(rgbToOkLab(item.first)), third, `${item.itemId} first colour is in another third`)
				assert.equal(hueThirdOf(rgbToOkLab(item.second)), third, `${item.itemId} second colour is in another third`)
			}
			// Each third gets its own ladder over the same interval, so the three fits are comparable.
			const targets = inThird.map((item) => item.truth.targetDistance!).sort((a, b) => a - b)
			assert.ok(Math.abs(targets[0] - ROUND_1_INTERVALS["light-saturated"].low) < 1e-9)
			assert.ok(Math.abs(targets.at(-1)! - ROUND_1_INTERVALS["light-saturated"].high) < 1e-9)
		}
		// No hue third is claimed for any other quadrant: the split is a light-saturated question.
		for (const item of ladder.filter((entry) => entry.stratum !== "light-saturated")) {
			assert.equal(item.hueThird, undefined)
		}
	})

	it("probes three directions at one distance, and the rounding kept them on their axis", () => {
		for (const kind of DIRECTION_KINDS) {
			const inKind = probes.filter((item) => item.direction === kind)
			assert.equal(inKind.length, QUADRANTS.length, `${kind} is not spread across the quadrants`)
			assert.deepEqual(inKind.map((item) => item.stratum).sort(), [...QUADRANTS].sort())
			for (const item of inKind) {
				const decomposition = item.decomposition!
				assert.equal(decomposition.dominant, kind, `${item.itemId} is dominated by ${decomposition.dominant}`)
				assert.ok(decomposition.purity >= 0.7, `${item.itemId} purity ${decomposition.purity} is too low to attribute`)
				// The whole point is a matched magnitude: a direction effect must not be a size effect.
				const error = Math.abs(item.truth.okLabDistance - ROUND2_DIRECTION_TARGET) / ROUND2_DIRECTION_TARGET
				assert.ok(error <= 0.25, `${item.itemId} sits at ${item.truth.okLabDistance}, not ${ROUND2_DIRECTION_TARGET}`)
				assert.ok(
					Math.hypot(rgbToOkLab(item.first)[1], rgbToOkLab(item.first)[2]) >= ROUND2_PROBE_BASE_MIN_CHROMA - 1e-9,
					`${item.itemId} base is too near grey for a hue rotation to be expressible`,
				)
			}
		}
		const distances = probes.map((item) => item.truth.okLabDistance)
		assert.ok(Math.max(...distances) / Math.min(...distances) < 1.2, "the probe must vary direction, not magnitude")
	})

	it("doubles the silent repeats and keeps them silent", () => {
		assert.equal(repeats.length, 16)
		assert.equal(round1.items.filter((item) => item.role === "repeat").length, 8, "round 1 had half as many")
		for (const repeat of repeats) {
			const source = fixture.items.find((item) => item.itemId === repeat.repeatOf)
			assert.ok(source !== undefined, `${repeat.itemId} repeats an item that does not exist`)
			assert.deepEqual([repeat.first, repeat.second], [source.first, source.second], "a repeat shows the same colours")
			assert.equal(source.role, "ladder", "a repeat re-asks a ladder rung, never a control or a probe")
		}
		// Light-saturated's four are spread over its three hue thirds rather than piled into one.
		const lightSaturated = repeats.filter((item) => item.stratum === "light-saturated")
		assert.equal(new Set(lightSaturated.map((item) => item.hueThird)).size, HUE_THIRD_BOUNDARIES_DEGREES.length)
	})

	it("keeps the identical-pair controls, and they really are identical", () => {
		assert.equal(controls.length, 4)
		for (const control of controls) {
			assert.deepEqual(control.first, control.second)
			assert.equal(control.truth.identical, true)
			assert.equal(control.truth.okLabDistance, 0)
		}
	})

	it("asks the same question under the same criterion, so the rounds can be pooled", () => {
		assert.equal(fixture.criterion, BRACKETING_CRITERION)
		assert.equal(fixture.criterion, round1.criterion)
		assert.deepEqual(fixture.prompts, PART_PROMPTS)
		// Same fixture *format*, so one server, one page and one analysis read both rounds. What keeps
		// them apart is the batch id, which is the mechanism that already exists for exactly this.
		assert.equal(fixture.fixtureVersion, BRACKETING_FIXTURE_VERSION)
		assert.notEqual(fixture.batchId, round1.batchId)
		assert.equal(fixture.batchId, BRACKETING_ROUND_2_BATCH_ID)
		assert.equal(new Set([...fixture.items, ...round1.items].map((item) => item.itemId)).size, 152)
	})

	it("serves every item exactly once, in an order that walks neither quadrant nor ladder", () => {
		assert.equal(fixture.serveOrder.length, fixture.items.length)
		assert.equal(new Set(fixture.serveOrder).size, fixture.items.length)
		assert.notDeepEqual(fixture.serveOrder, fixture.items.map((item) => item.itemId))
		const strata = fixture.serveOrder.map((id) => fixture.items.find((item) => item.itemId === id)!.stratum)
		const runs = strata.filter((stratum, index) => index === 0 || strata[index - 1] !== stratum).length
		assert.ok(runs > fixture.items.length / 2, "the serve order clumps by quadrant")
	})
})

describe("bracketing round 2 in the review server", () => {
	let harness: Harness
	let stored: StoredBracketingBatch

	before(async () => {
		harness = await startHarness()
		assert.equal(await seedBracketingRound(harness.handle.service), BRACKETING_ACTIVE_BATCH_ID)
		assert.equal(await seedBracketingRound2(harness.handle.service), BRACKETING_ROUND_2_BATCH_ID)
		stored = (await readJsonl<StoredBracketingBatch>(harness.batchLogPath)).find(
			(entry) => entry.batchId === BRACKETING_ROUND_2_BATCH_ID,
		)!
	})

	after(async () => {
		await harness?.stop()
	})

	it("serves the two colours and nothing else — including nothing about the new strata", async () => {
		const payload = await call(harness.base, "GET", `/api/bracketing/${BRACKETING_ROUND_2_BATCH_ID}`)
		assert.equal(payload.status, 200)
		assert.equal(payload.body.items.length, fixture.items.length)
		const text = JSON.stringify(payload.body)
		for (const forbidden of [
			"okLabDistance",
			"targetDistance",
			"truth",
			"stratum",
			"repeatOf",
			"decomposition",
			"purity",
			// Round 2's own tells: the hue third and the probe's axis would both announce the design.
			"hueThird",
			"direction",
			"lightness",
			"chroma",
			"hue",
			"refinement",
			"control",
			"repeat",
			"ladder",
			...QUADRANTS,
			...fixture.items.map((item) => item.itemId),
		]) {
			assert.ok(!text.includes(forbidden), `the served payload leaks ${forbidden}`)
		}
		for (const item of payload.body.items) {
			assert.deepEqual(Object.keys(item).sort(), ["answer", "first", "part", "revision", "second", "token"])
		}
	})

	it("serves the items in the fixture's seeded order, under the same criterion", async () => {
		const payload = await call(harness.base, "GET", `/api/bracketing/${BRACKETING_ROUND_2_BATCH_ID}`)
		assert.deepEqual(
			payload.body.items.map((item: any) => stored.answerTokens[item.token]),
			[...fixture.serveOrder],
		)
		assert.equal(payload.body.criterion, BRACKETING_CRITERION)
		assert.deepEqual(payload.body.prompts, PART_PROMPTS)
	})

	it("sits in the queue beside round 1 without disturbing it", async () => {
		const queue = await call(harness.base, "GET", "/api/queue")
		const round2Entry = queue.body.batches.find((batch: any) => batch.batchId === BRACKETING_ROUND_2_BATCH_ID)
		const round1Entry = queue.body.batches.find((batch: any) => batch.batchId === BRACKETING_ACTIVE_BATCH_ID)
		assert.equal(round2Entry.kind, "bracketing")
		assert.equal(round2Entry.itemCount, fixture.items.length)
		assert.equal(round2Entry.judgedCount, 0)
		assert.equal(round1Entry.itemCount, round1.items.length)
		assert.equal(round1Entry.judgedCount, 0, "this harness has no round-1 answers; seeding round 2 must not invent any")
	})

	it("records an answer against round 2's batch, never round 1's", async () => {
		const payload = await call(harness.base, "GET", `/api/bracketing/${BRACKETING_ROUND_2_BATCH_ID}`)
		const first = payload.body.items[0]
		const response = await call(
			harness.base,
			"PUT",
			`/api/bracketing/${BRACKETING_ROUND_2_BATCH_ID}/items/${first.token}/answer`,
			{ answer: true },
		)
		assert.equal(response.status, 200)
		const record = harness.records().at(-1) as OracleLabelRecord
		assert.equal(record.type, "oracle-label")
		assert.equal(record.batch?.id, BRACKETING_ROUND_2_BATCH_ID)
		assert.equal(record.labelSchemaVersion, BRACKETING_FIXTURE_VERSION)
		assert.equal(record.questionKey, "same-color")
		assert.equal(record.imageId, stored.answerTokens[first.token])
	})
})

/* ------------------------------------------------------------------------------------------- */
/* The analysis                                                                                  */
/* ------------------------------------------------------------------------------------------- */

/**
 * Answer a whole round as if the reviewer had a hard threshold at `bar`, optionally with a
 * direction-dependent bar so the probe has something to find.
 */
async function answerRound(
	harness: Harness,
	batchId: string,
	source: BracketingFixture,
	bar: number,
	directionBars: Partial<Record<string, number>> = {},
): Promise<void> {
	const payload = await call(harness.base, "GET", `/api/bracketing/${batchId}`)
	const stored = (await readJsonl<StoredBracketingBatch>(harness.batchLogPath)).find(
		(entry) => entry.batchId === batchId,
	)!
	for (const item of payload.body.items) {
		const original = source.items.find((entry) => entry.itemId === stored.answerTokens[item.token])!
		if (original.part !== "same-color") continue
		const threshold = (original.direction !== undefined ? directionBars[original.direction] : undefined) ?? bar
		await call(harness.base, "PUT", `/api/bracketing/${batchId}/items/${item.token}/answer`, {
			answer: original.truth.okLabDistance < threshold,
		})
	}
}

describe("bracketing round 2 — analysis", () => {
	it("fits round 2 alone, pools it with round 1, and keeps the probe out of both fits", async () => {
		const harness = await startHarness()
		try {
			await seedBracketingRound(harness.handle.service)
			await seedBracketingRound2(harness.handle.service)
			// One consistent reviewer across both rounds, with the direction probe answered on the same
			// bar as everything else: the probe must then find nothing.
			await answerRound(harness, BRACKETING_ACTIVE_BATCH_ID, round1, 0.016)
			await answerRound(harness, BRACKETING_ROUND_2_BATCH_ID, fixture, 0.016)

			const analysis = analyzeBracketingRound2(round1, fixture, harness.records(), {
				warehousePath: harness.warehousePath,
				round1FixturePath: BRACKETING_FIXTURE_PATH,
				round2FixturePath: BRACKETING_ROUND_2_FIXTURE_PATH,
			})
			assert.equal(analysis.criterionMatches, true)
			assert.equal(analysis.poolable, true)

			// (a) round 2 alone.
			assert.equal(analysis.round2.part1.answered, fixture.items.length)
			assert.ok(
				analysis.round2.part1.pooled.threshold !== null &&
					Math.abs(analysis.round2.part1.pooled.threshold - 0.016) < 0.003,
				`round 2 alone should recover its own bar, got ${analysis.round2.part1.pooled.threshold}`,
			)
			// The 12 probe pairs are excluded from the ladder fit, and the 4 controls always were.
			assert.equal(analysis.round2.part1.fittedPoints, fixture.items.length - probes.length - controls.length)

			// (b) pooled.
			assert.equal(analysis.pooled.fromRound1 + analysis.pooled.fromRound2, analysis.pooled.fit.n)
			assert.ok(analysis.pooled.fromRound1 > 0 && analysis.pooled.fromRound2 > 0)
			assert.ok(analysis.pooled.fit.n > analysis.round2.part1.fittedPoints, "pooling must add round 1's points")
			assert.ok(
				analysis.pooled.fit.threshold !== null && Math.abs(analysis.pooled.fit.threshold - 0.016) < 0.003,
				`the pooled fit should recover the same bar, got ${analysis.pooled.fit.threshold}`,
			)
			// (d) one-threshold-survives recomputed on the pooled fit.
			assert.equal(typeof analysis.pooled.oneThresholdSurvives, "boolean")
			assert.ok(analysis.pooled.oneThresholdSentence.includes("pooled"))
			for (const quadrant of analysis.pooled.quadrants) {
				assert.equal(quadrant.fromRound1 + quadrant.fromRound2, quadrant.n)
			}

			// (c) the hue split and the probe are reported on their own.
			assert.equal(analysis.hueSplit.thirds.length, HUE_THIRD_BOUNDARIES_DEGREES.length)
			for (const third of analysis.hueSplit.thirds) {
				assert.equal(third.fromRound2, ROUND2_LIGHT_SATURATED_STEPS_PER_THIRD + repeatsInThird(third.third))
			}
			assert.equal(analysis.hueSplit.round1Assigned + analysis.hueSplit.round1Mixed, 14)
			assert.equal(analysis.directionProbe.answered, probes.length)
			assert.match(analysis.directionProbe.verdict, /No direction effect visible/u)
			assert.ok(analysis.summaryLines.join("\n").includes("HUE SPLIT"))
			assert.ok(analysis.summaryLines.join("\n").includes("8-BIT FLOOR"))

			// Repeats from both rounds, reported separately and combined.
			assert.equal(analysis.repeats.round2.repeats, repeats.length)
			assert.equal(analysis.repeats.round1.repeats, 8)
			assert.ok(analysis.repeats.combinedAgreement !== null)
		} finally {
			await harness.stop()
		}
	})

	it("finds a direction effect when there is one to find", async () => {
		const harness = await startHarness()
		try {
			await seedBracketingRound2(harness.handle.service)
			// A reviewer far more tolerant of a pure-hue difference than of a pure-lightness one, at the
			// same distance. The probe is the only instrument that can see this.
			await answerRound(harness, BRACKETING_ROUND_2_BATCH_ID, fixture, 0.016, {
				lightness: 0.001,
				hue: 0.9,
			})
			const analysis = analyzeBracketingRound2(round1, fixture, harness.records(), {
				warehousePath: harness.warehousePath,
				round1FixturePath: BRACKETING_FIXTURE_PATH,
				round2FixturePath: BRACKETING_ROUND_2_FIXTURE_PATH,
			})
			const byKind = new Map(analysis.directionProbe.directions.map((entry) => [entry.kind, entry]))
			assert.equal(byKind.get("lightness")!.yesRate, 0)
			assert.equal(byKind.get("hue")!.yesRate, 1)
			assert.match(analysis.directionProbe.verdict, /Direction looks like it matters/u)
			assert.match(analysis.directionProbe.verdict, /not a number to use/u, "four pairs is a probe, not a measurement")
			// And it must not have leaked into the threshold fits.
			assert.ok(
				analysis.round2.part1.pooled.threshold !== null &&
					Math.abs(analysis.round2.part1.pooled.threshold - 0.016) < 0.004,
				"the probe's answers must not move the ladder fit",
			)
		} finally {
			await harness.stop()
		}
	})

	it("refuses to pool two rounds answered under different criteria", async () => {
		const harness = await startHarness()
		try {
			await seedBracketingRound2(harness.handle.service)
			await answerRound(harness, BRACKETING_ROUND_2_BATCH_ID, fixture, 0.016)
			const otherCriterion: BracketingFixture = { ...round1, criterion: "detection, the abandoned first pass" }
			const analysis = analyzeBracketingRound2(otherCriterion, fixture, harness.records(), {
				warehousePath: harness.warehousePath,
				round1FixturePath: BRACKETING_FIXTURE_PATH,
				round2FixturePath: BRACKETING_ROUND_2_FIXTURE_PATH,
			})
			assert.equal(analysis.criterionMatches, false)
			assert.equal(analysis.poolable, false)
			assert.equal(analysis.pooled.fromRound1, 0, "a round answered under another question contributes nothing")
			assert.equal(analysis.pooled.fit.n, analysis.pooled.fromRound2)
			assert.match(analysis.summaryLines.join("\n"), /NOT POOLED/u)
		} finally {
			await harness.stop()
		}
	})

	it("runs on a round nobody has answered", () => {
		const analysis = analyzeBracketingRound2(round1, fixture, [], {
			warehousePath: "/nowhere/warehouse.jsonl",
			round1FixturePath: BRACKETING_FIXTURE_PATH,
			round2FixturePath: BRACKETING_ROUND_2_FIXTURE_PATH,
		})
		assert.equal(analysis.round2.part1.answered, 0)
		assert.equal(analysis.pooled.fit.n, 0)
		assert.equal(analysis.directionProbe.answered, 0)
		assert.match(analysis.directionProbe.verdict, /Not answered yet/u)
		assert.ok(analysis.summaryLines.length > 0)
	})

	it("still fits round 1 on its own, unchanged by round 2 existing", async () => {
		const harness = await startHarness()
		try {
			await seedBracketingRound(harness.handle.service)
			await seedBracketingRound2(harness.handle.service)
			await answerRound(harness, BRACKETING_ACTIVE_BATCH_ID, round1, 0.014)
			await answerRound(harness, BRACKETING_ROUND_2_BATCH_ID, fixture, 0.030)
			const only1 = analyzeBracketing(round1, harness.records(), {
				warehousePath: harness.warehousePath,
				fixturePath: BRACKETING_FIXTURE_PATH,
				batchId: BRACKETING_ACTIVE_BATCH_ID,
			})
			assert.equal(only1.part1.answered, 60)
			assert.ok(
				only1.part1.pooled.threshold !== null && Math.abs(only1.part1.pooled.threshold - 0.014) < 0.003,
				`round 1 alone must still recover its own bar, got ${only1.part1.pooled.threshold}`,
			)
			assert.ok(only1.skipped.otherBatch > 0, "round 2's answers were read and skipped")
		} finally {
			await harness.stop()
		}
	})
})

/** How many of round 2's repeats fall in one hue third — they are fitted alongside their sources. */
function repeatsInThird(third: number): number {
	return repeats.filter((item) => item.hueThird === third).length
}
