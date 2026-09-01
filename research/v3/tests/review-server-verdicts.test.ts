/**
 * What lands in the warehouse. Records are built by the review server and written by the
 * warehouse library (`append`), so these tests assert the joint result: append-only JSONL, one
 * record per line, un-blinded server-side, every pre-release edit a new verdict record whose
 * predecessor is superseded rather than rewritten (REVIEW_UI.md §1, §2).
 */
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { after, before, describe, it } from "node:test"
import {
	WAREHOUSE_SCHEMA_VERSION,
	validateRecord,
	type VerdictRecord,
	type VetoRecord,
} from "../src/warehouse/records.ts"
import { gradesByVariant, preferredVariant, resolve, supersededVerdictIds } from "../src/warehouse/warehouse.ts"
import { readJsonl } from "../src/review-server/store.ts"
import { COMPLETE_VERDICT, call, makeBatch, startHarness, type Harness } from "../src/review-server/test-support.ts"
import type { StoredBatch } from "../src/review-server/types.ts"

describe("review server verdict records", () => {
	let harness: Harness

	before(async () => {
		harness = await startHarness()
		assert.equal((await call(harness.base, "POST", "/api/batches", makeBatch("verdict-batch", 2))).status, 201)
	})

	after(async () => {
		await harness?.stop()
	})

	it("writes one complete, valid, self-contained JSONL line per verdict", async () => {
		const response = await call(harness.base, "PUT", "/api/batches/verdict-batch/items/item-0/verdict", COMPLETE_VERDICT)
		assert.equal(response.status, 200)
		assert.equal(response.body.revision, 1)

		const text = await readFile(harness.warehousePath, "utf8")
		assert.equal(text.split("\n").filter((line) => line.length > 0).length, 1, "one write, one line")
		assert.ok(text.endsWith("\n"), "records end with a newline")

		const record = harness.records()[0] as VerdictRecord
		// The warehouse's own validator is the authority on shape — including that this is not a
		// v2-3-format record.
		assert.doesNotThrow(() => validateRecord(record))
		assert.equal(record.schema, WAREHOUSE_SCHEMA_VERSION)
		assert.equal(record.type, "verdict")
		assert.equal(record.mode, "pairwise")
		assert.deepEqual(record.author, { kind: "human", id: "test-reviewer" })
		assert.equal(record.batch.id, "verdict-batch")
		assert.equal(record.batch.purpose, "mechanism")
		assert.equal(record.batch.itemCount, 2)
		assert.equal(record.itemId, "item-0")
		assert.equal(record.gradeA, "strong")
		assert.equal(record.gradeB, "weak")
		assert.equal(record.comment, COMPLETE_VERDICT.comment)
		assert.equal(record.confound, false)
		assert.equal(record.confoundNote, null)
		assert.ok(Date.parse(record.ts) > 0)
	})

	it("carries header-derived rendition facts on the artwork identity", async () => {
		const record = harness.records()[0] as VerdictRecord
		assert.ok(record.artwork.path.startsWith("/"), "the artwork is identified by full path")
		assert.match(record.artwork.sha256, /^[0-9a-f]{64}$/u)
		// 300x300 comes from the JPEG header, never from the filename (CONVENTIONS.md).
		assert.equal(record.artwork.rendition.width, 300)
		assert.equal(record.artwork.rendition.height, 300)
		assert.equal(record.artwork.rendition.format, "jpeg")
		assert.equal(record.artwork.rendition.collection, "sharded-corpus")
		assert.ok(record.artwork.rendition.bytes > 1000)
	})

	it("resolves the blinded sides back to the true variant ids", async () => {
		const stored = (await readJsonl<StoredBatch>(harness.batchLogPath))[0]
		const item = stored.items[0]
		const record = harness.records()[0] as VerdictRecord

		for (const [side, recorded] of [
			["A", record.sideA],
			["B", record.sideB!],
		] as const) {
			const pushed = stored.batch.items[0].sides[item.blinding[side]]
			assert.equal(recorded.variantId, pushed.variantId)
			assert.equal(recorded.paletteHash, item.paletteHashes[item.blinding[side]])
			assert.deepEqual(recorded.fingerprint, pushed.fingerprint)
			assert.deepEqual(recorded.palette, pushed.palette, "the palette shown travels with the verdict")
		}
		assert.equal(record.preference, "a")
		// The warehouse's own helpers must read the record without ever seeing the blinding key.
		assert.equal(preferredVariant(record), record.sideA.variantId)
		assert.deepEqual(gradesByVariant(record), {
			[record.sideA.variantId]: "strong",
			[record.sideB!.variantId]: "weak",
		})
	})

	it("keeps a 'no preference' verdict free of any variant", async () => {
		await call(harness.base, "PUT", "/api/batches/verdict-batch/items/item-1/verdict", {
			...COMPLETE_VERDICT,
			preference: "no-preference",
			gradeA: "acceptable",
			gradeB: "acceptable",
		})
		const record = harness.records().at(-1) as VerdictRecord
		assert.equal(record.itemId, "item-1")
		assert.equal(record.preference, "no-preference")
		assert.equal(preferredVariant(record), null)
	})

	it("appends on every edit and never rewrites a line; the earlier draft is superseded", async () => {
		const first = harness.records()[0] as VerdictRecord
		const firstLine = (await readFile(harness.warehousePath, "utf8")).split("\n")[0]

		await call(harness.base, "PUT", "/api/batches/verdict-batch/items/item-0/verdict", {
			...COMPLETE_VERDICT,
			gradeB: "acceptable",
			comment: "second thoughts: B is fine too",
		})
		const forItem = harness
			.records()
			.filter((record): record is VerdictRecord => record.type === "verdict" && record.itemId === "item-0")
		assert.equal(forItem.length, 2)
		assert.notEqual(forItem[1].id, first.id)
		assert.equal(
			(await readFile(harness.warehousePath, "utf8")).split("\n")[0],
			firstLine,
			"an earlier line was rewritten",
		)

		// Downstream must count one position per item, not two.
		const superseded = supersededVerdictIds(resolve(harness.records()))
		assert.ok(superseded.has(first.id), "the earlier draft is not marked superseded")
		assert.ok(!superseded.has(forItem[1].id), "the latest verdict must not be superseded")

		// The served payload shows the latest, which is what the reviewer sees on revisit.
		const payload = await call(harness.base, "GET", "/api/batches/verdict-batch")
		const item = payload.body.items.find((entry: any) => entry.itemId === "item-0")
		assert.equal(item.verdict.revision, 2)
		assert.equal(item.verdict.gradeB, "acceptable")
		assert.equal(item.verdict.comment, "second thoughts: B is fine too")
	})

	it("refuses an incomplete or invalid verdict without writing anything", async () => {
		const before_ = harness.records().length
		for (const body of [
			{ ...COMPLETE_VERDICT, gradeA: "excellent" },
			{ ...COMPLETE_VERDICT, gradeB: null },
			{ ...COMPLETE_VERDICT, preference: "A" },
			// A confound flag without the defect is unqueryable.
			{ ...COMPLETE_VERDICT, confound: true, confoundNote: "  " },
			{},
		]) {
			const response = await call(harness.base, "PUT", "/api/batches/verdict-batch/items/item-0/verdict", body)
			assert.equal(response.status, 400, `${JSON.stringify(body)} should be refused`)
		}
		assert.equal(harness.records().length, before_, "a refused verdict wrote a record")
	})

	it("records an artwork veto, and withdraws it with a retracting amendment", async () => {
		const vetoed = await call(harness.base, "PUT", "/api/batches/verdict-batch/items/item-1/veto", {
			reason: "not album artwork — a press photo cutout",
		})
		assert.equal(vetoed.status, 200)
		const veto = harness.records().at(-1) as VetoRecord
		assert.equal(veto.type, "veto")
		assert.equal(veto.itemId, "item-1")
		assert.equal(veto.scope, "artwork")
		assert.equal(veto.reason, "not album artwork — a press photo cutout")
		assert.equal(veto.batch?.id, "verdict-batch")

		const withdrawn = await call(harness.base, "PUT", "/api/batches/verdict-batch/items/item-1/veto", { active: false })
		assert.equal(withdrawn.status, 200)
		const amendment = harness.records().at(-1)
		assert.equal(amendment?.type, "amendment")
		assert.equal((amendment as any).targetId, veto.id)
		assert.equal((amendment as any).retract, true)
		// Nothing was deleted: the veto line is still there, now resolved as retracted.
		const entry = resolve(harness.records()).find((candidate) => candidate.original.id === veto.id)
		assert.equal(entry?.retracted, true)

		const payload = await call(harness.base, "GET", "/api/batches/verdict-batch")
		const item = payload.body.items.find((entry_: any) => entry_.itemId === "item-1")
		assert.equal(item.veto.active, false)
	})

	it("rebuilds every verdict from the files after a restart", async () => {
		const before_ = await call(harness.base, "GET", "/api/batches/verdict-batch")
		harness = await harness.restart()
		const after_ = await call(harness.base, "GET", "/api/batches/verdict-batch")
		assert.deepEqual(after_.body, before_.body)
	})
})
