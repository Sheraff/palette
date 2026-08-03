/**
 * The bracketing page, driven end to end by keystrokes, on round 2.
 *
 * The same shape as the oracle-validation page's test and for the same reason: this page is
 * keyboard-only, so the only place the y/n mapping can be checked is by pressing the keys and
 * reading back what was written for the pair that was on screen. Round 2 is the first round to
 * carry a stratified design (hue thirds, a direction probe), which makes an off-by-one between the
 * served order and the recorded item worse than it was in round 1: it would quietly assign answers
 * to the wrong stratum and the fits would still look reasonable.
 *
 * The DOM shim lives in `test-support.ts`; everything above it — the page module, the HTTP, the
 * server, the records — is genuine.
 */
import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import type { OracleLabelRecord } from "../src/warehouse/records.ts"
import { isBatchReleased } from "../src/warehouse/warehouse.ts"
import {
	BRACKETING_ROUND_2_BATCH_ID,
	PART_PROMPTS,
	generateBracketingRound2Fixture,
} from "../src/review-server/bracketing.ts"
import { seedBracketingRound2 } from "../src/review-server/server.ts"
import { readJsonl } from "../src/review-server/store.ts"
import { openPage, startHarness, type FakePage, type Harness } from "../src/review-server/test-support.ts"
import type { StoredBracketingBatch } from "../src/review-server/types.ts"

const BRACKETING_PAGE = fileURLToPath(new URL("../review-ui/bracketing.js", import.meta.url))
/** The page's node ids; the status line comes last, because that is what `openPage` waits on. */
const NODE_IDS = ["question", "instruction", "progress", "stage", "status"] as const

const fixture = generateBracketingRound2Fixture()

/** The two colour fields on the stage, in the order the page renders them. */
function fieldColours(page: FakePage): string[] {
	return page.nodes.stage.children
		.flatMap((child) => (child.className === "pair" ? child.children : []))
		.filter((child) => child.className === "pair-field")
		.map((child) => child.style.background)
}

describe("bracketing page, driven by keystrokes (round 2)", () => {
	let harness: Harness
	let stored: StoredBracketingBatch
	let page: FakePage

	before(async () => {
		harness = await startHarness()
		assert.equal(await seedBracketingRound2(harness.handle.service), BRACKETING_ROUND_2_BATCH_ID)
		stored = (await readJsonl<StoredBracketingBatch>(harness.batchLogPath))[0] as StoredBracketingBatch
		page = await openPage(harness.base, BRACKETING_PAGE, NODE_IDS)
	})

	after(async () => {
		await harness?.stop()
	})

	it("lands on round 2, not on round 1 or the abandoned pass", () => {
		assert.match(page.nodes.status.textContent, new RegExp(BRACKETING_ROUND_2_BATCH_ID, "u"))
		assert.match(page.nodes.progress.textContent, /^1 \/ 80/u)
	})

	it("shows the question and the criterion the fixture carries, verbatim", () => {
		assert.equal(page.nodes.question.textContent, PART_PROMPTS["same-color"].question)
		assert.equal(page.nodes.instruction.textContent, PART_PROMPTS["same-color"].instruction)
		assert.match(page.nodes.instruction.textContent, /not whether you can detect any difference at the seam/u)
	})

	it("shows two flat fields and nothing else", () => {
		const colours = fieldColours(page)
		assert.equal(colours.length, 2)
		const first = fixture.items.find((item) => item.itemId === fixture.serveOrder[0])!
		assert.deepEqual(colours, [first.firstHex, first.secondHex])
	})

	it("records y and n against the pair that was on screen, and auto-advances", async () => {
		const answered: { itemId: string; expected: boolean }[] = []
		for (const [index, key] of ["y", "n", "y", "n", "n"].entries()) {
			assert.match(page.nodes.progress.textContent, new RegExp(`^${index + 1} / 80`, "u"))
			const served = fixture.serveOrder[index]
			// The colours on screen must be this item's, or the answer is about to be filed under the
			// wrong stratum — which is exactly what a stratified round cannot survive.
			const item = fixture.items.find((entry) => entry.itemId === served)!
			assert.deepEqual(fieldColours(page), [item.firstHex, item.secondHex], `item ${index + 1} shows the wrong colours`)
			await page.press(key)
			answered.push({ itemId: served, expected: key === "y" })
		}
		assert.match(page.nodes.progress.textContent, /^6 \/ 80/u, "the page did not auto-advance")

		const labels = harness.records().filter((record): record is OracleLabelRecord => record.type === "oracle-label")
		assert.equal(labels.length, answered.length)
		for (const [index, entry] of answered.entries()) {
			assert.equal(labels[index].imageId, entry.itemId, `answer ${index + 1} landed on the wrong pair`)
			assert.equal(labels[index].answer, entry.expected)
			assert.equal(labels[index].batch?.id, BRACKETING_ROUND_2_BATCH_ID)
			// The stratum travels with the answer — that is what makes the per-quadrant fit possible.
			assert.equal(labels[index].stratum, fixture.items.find((item) => item.itemId === entry.itemId)!.stratum)
		}
	})

	it("steps back on u and replaces the answer without deleting anything", async () => {
		const before = harness.records().length
		await page.press("u")
		assert.match(page.nodes.status.textContent, /stepped back/u)
		assert.match(page.nodes.progress.textContent, /^5 \/ 80 · answered no/u)
		await page.press("y")
		const records = harness.records()
		assert.equal(records.length, before + 1, "undo appends; it never deletes")
		const fifth = fixture.serveOrder[4]
		const forItem = records.filter(
			(record): record is OracleLabelRecord => record.type === "oracle-label" && record.imageId === fifth,
		)
		assert.deepEqual(forItem.map((record) => record.answer), [false, true])
	})

	it("ignores a key the round does not bind", async () => {
		const before = page.visible()
		const count = harness.records().length
		for (const key of ["1", "q", "z"]) {
			await assert.rejects(() => page.press(key), new RegExp(`the page ignored the ${key} key`, "u"))
		}
		assert.equal(page.visible(), before)
		assert.equal(harness.records().length, count)
	})

	it("resumes at the first unanswered pair when the page is reopened", async () => {
		const reopened = await openPage(harness.base, BRACKETING_PAGE, NODE_IDS)
		assert.match(reopened.nodes.progress.textContent, /^6 \/ 80/u)
		assert.match(reopened.nodes.status.textContent, /resuming at item 6/u)
		page = reopened
	})

	it("refuses to release while pairs are unanswered, then releases on r", async () => {
		await page.press("r")
		assert.match(page.nodes.status.textContent, /release refused: .*unjudged items/u)

		for (let remaining = 6; remaining <= fixture.items.length; remaining++) await page.press("y")
		assert.match(page.nodes.question.textContent, /every item answered/u)

		await page.press("r")
		assert.match(page.nodes.status.textContent, /^released at /u)
		assert.ok(isBatchReleased(harness.records(), BRACKETING_ROUND_2_BATCH_ID))

		const answeredIds = new Set(
			harness
				.records()
				.filter((record): record is OracleLabelRecord => record.type === "oracle-label")
				.map((record) => record.imageId),
		)
		assert.equal(answeredIds.size, fixture.items.length)
		assert.equal(Object.keys(stored.answerTokens).length, fixture.items.length)
	})
})
