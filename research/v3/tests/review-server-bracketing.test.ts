/**
 * The same-colour-bar bracketing round.
 *
 * Blinding does not apply here — there are no sides to shuffle — but two properties matter just as
 * much and are tested instead:
 *
 *  - **the fixture is deterministic**, so the committed file, the batch under review and any later
 *    re-derivation are the same round; and
 *  - **nothing the reviewer must not know is served**. The stakes are the same as blinding's: an
 *    item id reading `p1-dark-neutral-04` would announce the stratum and the rung, and
 *    `…-control-0` / `…-repeat-1` would announce the controls and the silent repeats, which is what
 *    the reviewer-noise measurement depends on not happening.
 */
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { after, before, describe, it } from "node:test"
import {
	apcaRaw,
	okLabDistance,
	rgbToApcaY,
	rgbToOkLab,
} from "../src/contract/color.ts"
import { validateRecord, type OracleLabelRecord } from "../src/warehouse/records.ts"
import { isBatchReleased, resolve } from "../src/warehouse/warehouse.ts"
import {
	BRACKETING_ACTIVE_BATCH_ID,
	BRACKETING_CRITERION,
	BRACKETING_FIXTURE_PATH,
	BRACKETING_FIXTURE_VERSION,
	PART_PROMPTS,
	PART1_DISTANCE_MAX,
	PART1_DISTANCE_MIN,
	PART1_LADDER_STEPS,
	PART2_MAX_APCA_RAW,
	PART2_MAX_DELTA_Y,
	PART2_STRATUM,
	QUADRANTS,
	QUADRANT_CHROMA_BOUNDARY,
	QUADRANT_LIGHTNESS_BOUNDARY,
	generateBracketingFixture,
	serializeFixture,
	type BracketingFixture,
} from "../src/review-server/bracketing.ts"
import { seedBracketingRound } from "../src/review-server/server.ts"
import { readJsonl } from "../src/review-server/store.ts"
import { call, startHarness, type Harness } from "../src/review-server/test-support.ts"
import type { StoredBracketingBatch } from "../src/review-server/types.ts"

const fixture = generateBracketingFixture()
const part1 = fixture.items.filter((item) => item.part === "same-color")
const part2 = fixture.items.filter((item) => item.part === "accent-visible")

describe("bracketing fixture generation", () => {
	it("is deterministic — the same seed gives the same round, byte for byte", () => {
		assert.deepEqual(generateBracketingFixture(), generateBracketingFixture())
		assert.notDeepEqual(generateBracketingFixture("other", 1).items, fixture.items)
	})

	it("matches the committed file", async () => {
		const committed = await readFile(BRACKETING_FIXTURE_PATH, "utf8")
		assert.equal(
			committed,
			serializeFixture(fixture),
			"the committed fixture is not what the generator produces — regenerate it with --write",
		)
	})

	it("carries the criterion and the exact wording the reviewer was shown", () => {
		// The first pass was abandoned because the criterion was ambiguous on screen. What was asked
		// now travels with the answers: a threshold means nothing apart from the question behind it.
		assert.equal(fixture.criterion, BRACKETING_CRITERION)
		assert.match(fixture.criterion, /register-as-same/u)
		assert.deepEqual(fixture.prompts, PART_PROMPTS)
		assert.equal(fixture.prompts["same-color"].question, "Same color?")
		assert.match(fixture.prompts["same-color"].instruction, /not whether you can detect any difference at the seam/u)
		assert.match(fixture.prompts["accent-visible"].instruction, /work as UI elements/u)
	})

	it("has the shape the round asks for", () => {
		assert.equal(fixture.fixtureVersion, BRACKETING_FIXTURE_VERSION)
		assert.equal(part1.length, 60, "4 quadrants × (12 ladder + 1 control + 2 repeats)")
		assert.equal(part2.length, 12, "10 ladder rungs + 2 controls")
		for (const quadrant of QUADRANTS) {
			const inQuadrant = part1.filter((item) => item.stratum === quadrant)
			assert.equal(inQuadrant.filter((item) => item.role === "ladder").length, PART1_LADDER_STEPS)
			assert.equal(inQuadrant.filter((item) => item.role === "control-identical").length, 1)
			assert.equal(inQuadrant.filter((item) => item.role === "repeat").length, 2)
		}
		assert.equal(part2.filter((item) => item.role === "ladder").length, 10)
		assert.equal(part2.filter((item) => item.role === "control-obvious").length, 1)
		assert.equal(part2.filter((item) => item.role === "control-identical").length, 1)
	})

	it("puts every part 1 pair in the quadrant it claims, by the documented boundaries", () => {
		for (const item of part1) {
			for (const rgb of [item.first, item.second]) {
				const lab = rgbToOkLab(rgb)
				const dark = lab[0] < QUADRANT_LIGHTNESS_BOUNDARY
				const neutral = Math.hypot(lab[1], lab[2]) < QUADRANT_CHROMA_BOUNDARY
				const expected = `${dark ? "dark" : "light"}-${neutral ? "neutral" : "saturated"}`
				assert.equal(expected, item.stratum, `${item.itemId} sits outside ${item.stratum}`)
			}
		}
	})

	it("records the distance actually shown, not the ladder target", () => {
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
		// The ladder is a sampling plan: achieved distances stay inside the bracket it spans, with room
		// for the 8-bit grid pushing the smallest rungs around.
		const ladder = part1.filter((item) => item.role === "ladder").map((item) => item.truth.okLabDistance)
		assert.ok(Math.min(...ladder) < PART1_DISTANCE_MIN * 1.3, "the ladder never reaches its low end")
		assert.ok(Math.max(...ladder) > PART1_DISTANCE_MAX * 0.7, "the ladder never reaches its high end")
	})

	it("makes the controls and repeats what they claim to be", () => {
		for (const item of fixture.items.filter((entry) => entry.role === "control-identical")) {
			assert.deepEqual(item.first, item.second, `${item.itemId} is not an identical pair`)
			assert.equal(item.truth.okLabDistance, 0)
			assert.equal(item.truth.identical, true)
		}
		for (const item of part1.filter((entry) => entry.role === "repeat")) {
			const source = part1.find((entry) => entry.itemId === item.repeatOf)
			assert.ok(source !== undefined, `${item.itemId} repeats an item that does not exist`)
			assert.deepEqual([item.first, item.second], [source.first, source.second], "a repeat must show the same colours")
			assert.equal(source.role, "ladder", "a repeat should re-ask a ladder rung")
		}
	})

	it("holds part 2 at equal luminance, varying only colour", () => {
		for (const item of part2.filter((entry) => entry.role === "ladder")) {
			assert.ok(
				Math.abs(item.truth.apcaRaw) <= PART2_MAX_APCA_RAW,
				`${item.itemId} carries a luminance signal: raw ${item.truth.apcaRaw}`,
			)
			assert.ok(item.truth.deltaApcaY <= PART2_MAX_DELTA_Y, `${item.itemId} luminances differ by ${item.truth.deltaApcaY}`)
			assert.equal(item.truth.apcaRaw, apcaRaw(item.second, item.first), "raw APCA is measured accent-on-field")
			assert.equal(item.truth.deltaApcaY, Math.abs(rgbToApcaY(item.first) - rgbToApcaY(item.second)))
			assert.equal(item.stratum, PART2_STRATUM)
		}
		const chroma = part2.filter((item) => item.role === "ladder").map((item) => item.truth.chromaDistance)
		assert.ok(Math.max(...chroma) / Math.min(...chroma) > 10, "the chroma ladder should span more than a decade")
		// The obvious control is the opposite case: a large luminance difference, which is what makes it
		// obvious. It is not an equal-luminance pair and must never be fitted as one.
		const obvious = part2.find((item) => item.role === "control-obvious")!
		assert.ok(Math.abs(obvious.truth.apcaRaw) > 50, "the obvious control should be plainly visible")
	})

	it("serves every item exactly once, part 1 before part 2, in a shuffled order", () => {
		assert.equal(fixture.serveOrder.length, fixture.items.length)
		assert.equal(new Set(fixture.serveOrder).size, fixture.items.length)
		const part1Ids = new Set(part1.map((item) => item.itemId))
		const firstPart2 = fixture.serveOrder.findIndex((id) => !part1Ids.has(id))
		assert.equal(firstPart2, part1.length, "the two questions must not interleave")
		assert.notDeepEqual(fixture.serveOrder.slice(0, part1.length), part1.map((item) => item.itemId))
	})
})

describe("bracketing round in the review server", () => {
	let harness: Harness
	let stored: StoredBracketingBatch

	before(async () => {
		harness = await startHarness()
		const seeded = await seedBracketingRound(harness.handle.service)
		// The active round is a fresh pass over the committed pairs, not the fixture's own batch id:
		// the first pass was abandoned and must never be the one the reviewer lands on.
		assert.equal(seeded, BRACKETING_ACTIVE_BATCH_ID)
		assert.notEqual(BRACKETING_ACTIVE_BATCH_ID, fixture.batchId)
		stored = (await readJsonl<StoredBracketingBatch>(harness.batchLogPath))[0] as StoredBracketingBatch
	})

	after(async () => {
		await harness?.stop()
	})

	it("serves the two colours and nothing else", async () => {
		const payload = await call(harness.base, "GET", "/api/bracketing/bracketing-round-1-clarified")
		assert.equal(payload.status, 200)
		assert.equal(payload.body.items.length, fixture.items.length)

		const text = JSON.stringify(payload.body)
		for (const forbidden of [
			"okLabDistance",
			"targetDistance",
			"chromaDistance",
			"apcaRaw",
			"apcaLc",
			"deltaApcaY",
			"truth",
			"stratum",
			"repeatOf",
			"control",
			"repeat",
			"ladder",
			...QUADRANTS,
			// The real item ids would give away rung, stratum and role all at once.
			...fixture.items.map((item) => item.itemId),
		]) {
			assert.ok(!text.includes(forbidden), `the served payload leaks ${forbidden}`)
		}
		for (const item of payload.body.items) {
			assert.deepEqual(Object.keys(item).sort(), ["answer", "first", "part", "revision", "second", "token"])
			assert.match(item.first, /^#[0-9a-f]{6}$/u)
			assert.match(item.second, /^#[0-9a-f]{6}$/u)
		}
	})

	it("serves the criterion and the exact wording, from the fixture", async () => {
		const payload = await call(harness.base, "GET", "/api/bracketing/bracketing-round-1-clarified")
		assert.deepEqual(payload.body.prompts, PART_PROMPTS)
		assert.equal(payload.body.criterion, BRACKETING_CRITERION)
	})

	it("serves the items in the fixture's seeded order", async () => {
		const payload = await call(harness.base, "GET", "/api/bracketing/bracketing-round-1-clarified")
		const resolved = payload.body.items.map((item: any) => stored.answerTokens[item.token])
		assert.deepEqual(resolved, [...fixture.serveOrder])
	})

	it("records an answer as an oracle-label the warehouse accepts", async () => {
		const payload = await call(harness.base, "GET", "/api/bracketing/bracketing-round-1-clarified")
		const first = payload.body.items[0]
		const response = await call(
			harness.base,
			"PUT",
			`/api/bracketing/bracketing-round-1-clarified/items/${first.token}/answer`,
			{ answer: true },
		)
		assert.equal(response.status, 200)
		assert.equal(response.body.revision, 1)

		const record = harness.records().at(-1) as OracleLabelRecord
		assert.doesNotThrow(() => validateRecord(record))
		assert.equal(record.type, "oracle-label")
		assert.equal(record.labelSchemaVersion, BRACKETING_FIXTURE_VERSION)
		assert.equal(record.questionKey, "same-color")
		assert.equal(record.answer, true)
		assert.equal(record.artwork, null, "there is no artwork — the stimulus is two flat colours")
		// The borrowed fields: the pair id stands in for an image id, the quadrant for a stratum.
		const itemId = stored.answerTokens[first.token]
		assert.equal(record.imageId, itemId)
		assert.equal(record.stratum, fixture.items.find((item) => item.itemId === itemId)!.stratum)
		assert.equal(record.batch?.id, "bracketing-round-1-clarified")
		assert.equal(record.batch?.purpose, "calibration")
		assert.equal(record.batch?.itemCount, fixture.items.length)
	})

	it("supersedes an answer when the reviewer steps back and answers again", async () => {
		const payload = await call(harness.base, "GET", "/api/bracketing/bracketing-round-1-clarified")
		const first = payload.body.items[0]
		const again = await call(
			harness.base,
			"PUT",
			`/api/bracketing/bracketing-round-1-clarified/items/${first.token}/answer`,
			{ answer: false },
		)
		assert.equal(again.status, 200)
		assert.equal(again.body.revision, 2)

		const labels = harness
			.records()
			.filter((record): record is OracleLabelRecord => record.type === "oracle-label")
		assert.equal(labels.length, 2, "undo appends, it never deletes")
		const after_ = await call(harness.base, "GET", "/api/bracketing/bracketing-round-1-clarified")
		assert.equal(after_.body.items[0].answer, false, "the latest answer is the reviewer's position")
	})

	it("refuses an unknown token and a non-boolean answer", async () => {
		const bad = await call(harness.base, "PUT", "/api/bracketing/bracketing-round-1-clarified/items/deadbeef/answer", { answer: true })
		assert.equal(bad.status, 404)
		const payload = await call(harness.base, "GET", "/api/bracketing/bracketing-round-1-clarified")
		const wrong = await call(
			harness.base,
			"PUT",
			`/api/bracketing/bracketing-round-1-clarified/items/${payload.body.items[1].token}/answer`,
			{ answer: "yes" },
		)
		assert.equal(wrong.status, 400)
	})

	it("appears in the queue and releases through the normal flow", async () => {
		const queue = await call(harness.base, "GET", "/api/queue")
		const entry = queue.body.batches.find((batch: any) => batch.batchId === "bracketing-round-1-clarified")
		assert.equal(entry.kind, "bracketing")
		assert.equal(entry.purpose, "calibration")
		assert.equal(entry.itemCount, fixture.items.length)
		assert.equal(entry.judgedCount, 1)

		const refused = await call(harness.base, "POST", "/api/batches/bracketing-round-1-clarified/release")
		assert.equal(refused.status, 409)
		assert.match(refused.body.error, /unjudged items/u)

		const payload = await call(harness.base, "GET", "/api/bracketing/bracketing-round-1-clarified")
		for (const item of payload.body.items) {
			if (item.answer !== null) continue
			await call(harness.base, "PUT", `/api/bracketing/bracketing-round-1-clarified/items/${item.token}/answer`, { answer: true })
		}
		const released = await call(harness.base, "POST", "/api/batches/bracketing-round-1-clarified/release")
		assert.equal(released.status, 200)
		assert.equal(released.body.itemCount, fixture.items.length)
		assert.equal(released.body.fundingRecordIds.length, fixture.items.length)
		assert.ok(isBatchReleased(harness.records(), "bracketing-round-1-clarified"))

		const closed = await call(
			harness.base,
			"PUT",
			`/api/bracketing/bracketing-round-1-clarified/items/${payload.body.items[0].token}/answer`,
			{ answer: false },
		)
		assert.equal(closed.status, 409, "a released round takes no more answers")
	})

	it("rebuilds every answer after a restart", async () => {
		const before_ = await call(harness.base, "GET", "/api/bracketing/bracketing-round-1-clarified")
		harness = await harness.restart()
		const after_ = await call(harness.base, "GET", "/api/bracketing/bracketing-round-1-clarified")
		assert.deepEqual(after_.body, before_.body)
		// The tokens are part of the stored batch, so they survive too — a page left open still works.
		assert.equal(after_.body.items[0].token, before_.body.items[0].token)
	})

	it("never pools an abandoned pass over the same pairs into the fit", async () => {
		const { analyzeBracketing } = await import("../src/review-server/analyze-bracketing.ts")
		// The real situation this guards: the first pass was answered under a *detection* criterion
		// ("can I see any difference at the seam"), which is a far tighter bar, and abandoned. Its
		// answers are still in the log because the log is append-only. Pooling them would drag the
		// threshold down by a factor of three and nothing about the output would look wrong.
		const aborted = await startHarness()
		try {
			await seedBracketingRound(aborted.handle.service, BRACKETING_FIXTURE_PATH, "aborted-pass")
			await seedBracketingRound(aborted.handle.service, BRACKETING_FIXTURE_PATH, BRACKETING_ACTIVE_BATCH_ID)
			const answerAll = async (batchId: string, bar: number) => {
				const payload = await call(aborted.base, "GET", `/api/bracketing/${batchId}`)
				const stored = (await readJsonl<StoredBracketingBatch>(aborted.batchLogPath)).find(
					(entry) => entry.batchId === batchId,
				)!
				for (const item of payload.body.items) {
					const source = fixture.items.find((entry) => entry.itemId === stored.answerTokens[item.token])!
					if (source.part !== "same-color") continue
					await call(aborted.base, "PUT", `/api/bracketing/${batchId}/items/${item.token}/answer`, {
						answer: source.truth.okLabDistance < bar,
					})
				}
			}
			await answerAll("aborted-pass", 0.005)
			await answerAll(BRACKETING_ACTIVE_BATCH_ID, 0.014)

			const records = aborted.records()
			const clean = analyzeBracketing(fixture as BracketingFixture, records, {
				warehousePath: aborted.warehousePath,
				fixturePath: BRACKETING_FIXTURE_PATH,
				batchId: BRACKETING_ACTIVE_BATCH_ID,
			})
			assert.equal(clean.batchId, BRACKETING_ACTIVE_BATCH_ID)
			assert.equal(clean.part1.answered, 60)
			assert.ok(clean.skipped.otherBatch > 0, "the abandoned pass should have been read and skipped")
			assert.ok(
				clean.part1.pooled.threshold !== null && Math.abs(clean.part1.pooled.threshold - 0.014) < 0.003,
				`the clean pass should recover its own bar, got ${clean.part1.pooled.threshold}`,
			)

			// Scoped the other way it recovers the other bar — which is the proof that the two passes
			// really are different data and that the scoping is what keeps them apart.
			const stale = analyzeBracketing(fixture as BracketingFixture, records, {
				warehousePath: aborted.warehousePath,
				fixturePath: BRACKETING_FIXTURE_PATH,
				batchId: "aborted-pass",
			})
			assert.ok(
				stale.part1.pooled.threshold !== null && stale.part1.pooled.threshold < 0.008,
				`the abandoned pass sat at a much tighter bar, got ${stale.part1.pooled.threshold}`,
			)
		} finally {
			await aborted.stop()
		}
	})

	it("hands the analysis a set of records it can read", async () => {
		const { analyzeBracketing } = await import("../src/review-server/analyze-bracketing.ts")
		const labels = resolve(harness.records()).filter((entry) => entry.record.type === "oracle-label")
		assert.equal(labels.length, fixture.items.length + 1, "every item answered, plus the one superseded answer")
		const analysis = analyzeBracketing(fixture as BracketingFixture, harness.records(), {
			warehousePath: harness.warehousePath,
			fixturePath: BRACKETING_FIXTURE_PATH,
			batchId: BRACKETING_ACTIVE_BATCH_ID,
		})
		assert.equal(analysis.part1.answered, 60)
		assert.equal(analysis.part2.answered, 12)
		assert.ok(analysis.summaryLines.length > 0)
	})
})
