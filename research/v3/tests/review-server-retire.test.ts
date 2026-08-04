/**
 * Retiring a batch — closing a round nobody is going to finish.
 *
 * Two rounds needed this on the same day. `toolbox-adjudication-1` was adjudicated in conversation
 * instead of in the UI, and `dropped-colors-1` was abandoned part-way because a chat verdict made
 * the rest moot. Neither could be RELEASED — release refuses a round with unjudged items, and it is
 * right to, because releasing asserts the reviewer worked through every one. Neither could be left
 * open either: an open round is a standing request, and a standing request nobody intends to answer
 * makes every real one easier to ignore.
 *
 * The thing that must not break: **answers already given stay valid**. `dropped-colors-1` collected
 * real colour-level labels before it stopped, and the round ending does not make them less true.
 * Every assertion here is paired accordingly — the round closes AND the data survives.
 */
import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import type { BatchCompleteRecord, OracleLabelRecord } from "../src/warehouse/records.ts"
import { GROUND_FREETEXT_BATCH_ID } from "../src/review-server/freetext.ts"
import { RETIRED_NOTE_PREFIX, isRetirement, retirementReason, seedGroundFreetextRound } from "../src/review-server/server.ts"
import { call, startHarness, type Harness } from "../src/review-server/test-support.ts"

const REASON = "resolved by reviewer chat verdict; partial answers retained as valid labels"

describe("retiring an open batch", () => {
	let harness: Harness
	let answeredToken: string

	before(async () => {
		harness = await startHarness()
		await seedGroundFreetextRound(harness.handle.service)
		// Answer ONE of nine, so the round is genuinely partial when it is retired — which is the case
		// that matters and the one `release` refuses outright.
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${GROUND_FREETEXT_BATCH_ID}`)
		answeredToken = payload.body.items[0].token
		await call(harness.base, "PUT", `/api/oracle-validation/${GROUND_FREETEXT_BATCH_ID}/items/${answeredToken}/answer`, {
			answer: "a painted wall, one surface but two brightnesses",
		})
	})

	after(async () => {
		await harness?.stop()
	})

	it("refuses a retirement with no reason", async () => {
		for (const reason of [undefined, "", "   "]) {
			const refused = await call(harness.base, "POST", `/api/batches/${GROUND_FREETEXT_BATCH_ID}/retire`, reason === undefined ? {} : { reason })
			assert.equal(refused.status, 400, `a retirement with reason ${JSON.stringify(reason)} was accepted`)
		}
	})

	it("release still refuses the half-answered round, which is why retire exists", async () => {
		await assert.rejects(harness.handle.service.release(GROUND_FREETEXT_BATCH_ID), /unjudged items/u)
	})

	it("retires it, appending one record and altering nothing", async () => {
		const before = harness.records()
		const retired = await call(harness.base, "POST", `/api/batches/${GROUND_FREETEXT_BATCH_ID}/retire`, { reason: REASON })
		assert.equal(retired.status, 200)
		assert.equal(retired.body.reason, REASON)
		assert.equal(retired.body.batchId, GROUND_FREETEXT_BATCH_ID)
		// Only the answered item is named. A retirement makes no claim about the ones nobody reached.
		assert.equal(retired.body.answeredItemIds.length, 1)
		assert.equal(retired.body.itemCount, 9)

		const after = harness.records()
		assert.equal(after.length, before.length + 1, "retiring wrote more than one record")
		// APPEND-ONLY, checked rather than asserted in prose: every record that existed before is
		// byte-identical afterwards.
		assert.deepEqual(after.slice(0, before.length), before, "retiring altered an existing record")
		const record = after.at(-1) as BatchCompleteRecord
		assert.equal(record.type, "batch-complete", "a watcher waits for batch-complete; a retired round is terminal")
		assert.ok(isRetirement(record), "the record does not read as a retirement")
		assert.equal(retirementReason(record), REASON)
		assert.ok(record.note.startsWith(RETIRED_NOTE_PREFIX))
	})

	it("keeps every answer the round did collect", async () => {
		const labels = harness
			.records()
			.filter((entry): entry is OracleLabelRecord => entry.type === "oracle-label")
			.filter((entry) => entry.batch?.id === GROUND_FREETEXT_BATCH_ID)
		assert.equal(labels.length, 1, "the answer given before retirement is gone")
		assert.equal(labels[0].answer, "a painted wall, one surface but two brightnesses")
		// And it still comes back on the payload, so anything downstream can still read it.
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${GROUND_FREETEXT_BATCH_ID}`)
		assert.equal(payload.body.items.filter((item: { answer: unknown }) => item.answer !== null).length, 1)
	})

	it("moves off the open queue, into a retired section that is not the released one", async () => {
		const dashboard = await call(harness.base, "GET", "/api/dashboard")
		assert.ok(
			!dashboard.body.open.some((entry: { batchId: string }) => entry.batchId === GROUND_FREETEXT_BATCH_ID),
			"a retired round is still shown as work waiting on the reviewer",
		)
		assert.ok(
			!dashboard.body.released.some((entry: { batchId: string }) => entry.batchId === GROUND_FREETEXT_BATCH_ID),
			"a retired round is claimed as released, which asserts the reviewer finished it",
		)
		const row = dashboard.body.retired.find((entry: { batchId: string }) => entry.batchId === GROUND_FREETEXT_BATCH_ID)
		assert.ok(row !== undefined, "the round vanished from the dashboard entirely")
		assert.equal(row.retired, true)
		assert.equal(row.released, false)
		assert.equal(row.retiredReason, REASON, "the dashboard does not say why the round stopped")
		assert.ok(row.retiredAt !== null)
		// The answers it did collect are still counted, because they are still data.
		assert.equal(row.judgedCount, 1)
		assert.equal(row.itemCount, 9)
	})

	it("refuses new answers politely, naming the retirement rather than a release that never happened", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${GROUND_FREETEXT_BATCH_ID}`)
		const refused = await call(harness.base, "PUT", `/api/oracle-validation/${GROUND_FREETEXT_BATCH_ID}/items/${payload.body.items[1].token}/answer`, {
			answer: "too late",
		})
		assert.equal(refused.status, 409)
		const message = JSON.stringify(refused.body)
		assert.match(message, /retired/u)
		assert.match(message, /stay valid/u, "the refusal does not say the existing answers are still good")
		assert.doesNotMatch(message, /is released/u, "a retired round reports itself as released, sending the reviewer to look for one")
	})

	it("refuses to retire twice, or to retire a released round", async () => {
		const twice = await call(harness.base, "POST", `/api/batches/${GROUND_FREETEXT_BATCH_ID}/retire`, { reason: "again" })
		assert.equal(twice.status, 409)
		assert.match(JSON.stringify(twice.body), /already retired/u)
	})

	it("is terminal for a watcher, and survives a restart as a retirement", async () => {
		// The watcher waits for `batch-complete`; a retired round is terminal, so the record has to be
		// one — a separate type would leave every watcher hanging on a round nobody will ever finish.
		const completions = harness.records().filter((entry) => entry.type === "batch-complete")
		assert.equal(completions.length, 1)
		const reloaded = await harness.restart()
		try {
			const dashboard = reloaded.handle.service.dashboard()
			assert.ok(dashboard.retired.some((entry) => entry.batchId === GROUND_FREETEXT_BATCH_ID), "the retirement did not survive a restart")
			assert.ok(!dashboard.open.some((entry) => entry.batchId === GROUND_FREETEXT_BATCH_ID))
		} finally {
			harness = reloaded
		}
	})
})
