/**
 * Release semantics. Batch completion is an explicit reviewer action, never an implicit last-item
 * event; until release every item is freely editable with no forced summary screen; release
 * appends the `batch-complete` record, and that record is the orchestrator's trigger
 * (REVIEW_UI.md §1).
 */
import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import type { BatchCompleteRecord, VerdictRecord } from "../src/warehouse/records.ts"
import { batchSummaries, isBatchReleased, resolve, supersededVerdictIds } from "../src/warehouse/warehouse.ts"
import { COMPLETE_VERDICT, call, makeBatch, startHarness, type Harness } from "../src/review-server/test-support.ts"

const BATCH = "release-batch"

describe("review server release", () => {
	let harness: Harness

	before(async () => {
		harness = await startHarness()
		assert.equal((await call(harness.base, "POST", "/api/batches", makeBatch(BATCH, 3))).status, 201)
	})

	after(async () => {
		await harness?.stop()
	})

	it("refuses to release a batch with unjudged items, and writes nothing", async () => {
		const refused = await call(harness.base, "POST", `/api/batches/${BATCH}/release`)
		assert.equal(refused.status, 409)
		assert.match(refused.body.error, /unjudged items/u)
		assert.equal(harness.records().length, 0)

		await call(harness.base, "PUT", `/api/batches/${BATCH}/items/item-0/verdict`, COMPLETE_VERDICT)
		await call(harness.base, "PUT", `/api/batches/${BATCH}/items/item-1/verdict`, COMPLETE_VERDICT)

		const stillRefused = await call(harness.base, "POST", `/api/batches/${BATCH}/release`)
		assert.equal(stillRefused.status, 409)
		assert.match(stillRefused.body.error, /item-2/u)
		assert.equal(isBatchReleased(harness.records(), BATCH), false)
	})

	it("lets every item be re-graded and rewritten right up to release", async () => {
		for (const grade of ["acceptable", "weak", "strong"] as const) {
			const response = await call(harness.base, "PUT", `/api/batches/${BATCH}/items/item-0/verdict`, {
				...COMPLETE_VERDICT,
				gradeA: grade,
				comment: `now I think ${grade}`,
			})
			assert.equal(response.status, 200, "an item should stay editable before release")
		}
		const payload = await call(harness.base, "GET", `/api/batches/${BATCH}`)
		const item = payload.body.items.find((entry: any) => entry.itemId === "item-0")
		assert.equal(item.verdict.gradeA, "strong")
		assert.equal(item.verdict.revision, 4, "three edits after the first write")
		assert.equal(payload.body.released, false)
	})

	it("counts a vetoed artwork as judged", async () => {
		const veto = await call(harness.base, "PUT", `/api/batches/${BATCH}/items/item-2/veto`, {
			reason: "disc scan, not album artwork",
		})
		assert.equal(veto.status, 200)
		const queue = await call(harness.base, "GET", "/api/queue")
		const entry = queue.body.batches.find((batch: any) => batch.batchId === BATCH)
		assert.equal(entry.judgedCount, 3)
		assert.equal(entry.released, false)
	})

	it("appends one batch-complete record, last, listing the released items", async () => {
		const released = await call(harness.base, "POST", `/api/batches/${BATCH}/release`)
		assert.equal(released.status, 200)

		const records = harness.records()
		const completes = records.filter((record): record is BatchCompleteRecord => record.type === "batch-complete")
		assert.equal(completes.length, 1)
		const complete = completes[0]
		assert.equal(complete.batchId, BATCH)
		assert.equal(complete.purpose, "mechanism")
		assert.equal(complete.itemCount, 3)
		assert.deepEqual(complete.fundedBy, ["review-server tests"])
		assert.deepEqual(complete.releasedItemIds, ["item-0", "item-1", "item-2"])
		// The batch-complete record is last: a watcher that tails the file sees it after its evidence.
		assert.equal(records.at(-1)?.type, "batch-complete")
		assert.equal(isBatchReleased(records, BATCH), true)

		// The release response hands back the evidence a downstream decision should cite.
		const latest = new Map<string, string>()
		for (const entry of resolve(records)) {
			if (entry.record.type === "verdict") latest.set((entry.record as VerdictRecord).itemId, entry.original.id)
		}
		const superseded = supersededVerdictIds(resolve(records))
		for (const id of released.body.fundingRecordIds) {
			assert.ok(!superseded.has(id), "a release cited a superseded draft verdict")
		}
		assert.deepEqual(
			released.body.fundingRecordIds.filter((id: string) => [...latest.values()].includes(id)).sort(),
			[...latest.values()].sort(),
		)
	})

	it("agrees with the warehouse's own batch summary", async () => {
		const summary = batchSummaries(harness.records()).find((entry) => entry.batchId === BATCH)!
		assert.equal(summary.itemCount, 3)
		// A veto is a decision, not a gap: the warehouse counts item-2 as reviewed even though it
		// carries no verdict, which is exactly how this server counts it for release.
		assert.equal(summary.reviewed, 3)
		assert.equal(summary.pending, 0)
		// item-0: one write plus three re-grades; item-1: one write. Drafts are kept, never counted twice.
		assert.equal(summary.verdicts, 5)
		assert.equal(summary.vetoes, 1)
		assert.ok(summary.released !== null)
	})

	it("closes the batch: no further edits, no second release", async () => {
		const edit = await call(harness.base, "PUT", `/api/batches/${BATCH}/items/item-0/verdict`, COMPLETE_VERDICT)
		assert.equal(edit.status, 409)
		assert.match(edit.body.error, /amendment/u)

		const veto = await call(harness.base, "PUT", `/api/batches/${BATCH}/items/item-1/veto`, { reason: "too late" })
		assert.equal(veto.status, 409)

		const again = await call(harness.base, "POST", `/api/batches/${BATCH}/release`)
		assert.equal(again.status, 409)
		assert.equal(harness.records().filter((record) => record.type === "batch-complete").length, 1)

		const payload = await call(harness.base, "GET", `/api/batches/${BATCH}`)
		assert.equal(payload.body.released, true)
		assert.ok(Date.parse(payload.body.releasedAt) > 0)
	})

	it("keeps the batch released after a restart", async () => {
		harness = await harness.restart()
		const payload = await call(harness.base, "GET", `/api/batches/${BATCH}`)
		assert.equal(payload.body.released, true)
		const edit = await call(harness.base, "PUT", `/api/batches/${BATCH}/items/item-0/verdict`, COMPLETE_VERDICT)
		assert.equal(edit.status, 409)
	})

	it("reports commentless items on release without blocking on them", async () => {
		const second = makeBatch("release-batch-silent", 1)
		assert.equal((await call(harness.base, "POST", "/api/batches", second)).status, 201)
		await call(harness.base, "PUT", "/api/batches/release-batch-silent/items/item-0/verdict", {
			...COMPLETE_VERDICT,
			comment: "",
		})
		const released = await call(harness.base, "POST", "/api/batches/release-batch-silent/release")
		assert.equal(released.status, 200)
		assert.deepEqual(released.body.itemsWithoutComment, ["item-0"])
	})
})
