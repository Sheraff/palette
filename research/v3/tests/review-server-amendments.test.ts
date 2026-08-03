/**
 * Post-release amendments (REVIEW_UI.md §1, §2).
 *
 * The property that makes this safe, and the reason the orchestrator can trigger on release without
 * waiting for the reviewer to be certain: an amendment is a **new record pointing at the original**,
 * the latest one wins at query time, and `recheckFundedBy` flags every decision funded by
 * since-amended evidence. Nothing is rewritten and nothing is deleted, so a downstream decision can
 * always be re-checked rather than silently invalidated.
 *
 * The bound on what may change is the warehouse's `AMENDABLE_FIELDS`, not this server's opinion: an
 * amendment expresses a second thought about a *judgement*, never about what the record was *about*.
 * The artwork, the palettes shown and the fingerprints are frozen at append time — a verdict is
 * always about the exact palettes shown.
 */
import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import type { AmendmentRecord, BatchCompleteRecord, VerdictRecord } from "../src/warehouse/records.ts"
import { recheckFundedBy, resolve } from "../src/warehouse/warehouse.ts"
import {
	COMPLETE_VERDICT,
	call,
	makeBatch,
	openPage,
	startHarness,
	type FakePage,
	type Harness,
} from "../src/review-server/test-support.ts"

const BATCH = "amend-batch"
const PAGE = fileURLToPath(new URL("../review-ui/amend.js", import.meta.url))
const NODE_IDS = ["batch-line", "batch-nav", "items", "status"] as const

/** The resolved verdict for one item: what a query would see after every amendment is applied. */
function resolvedVerdict(harness: Harness, itemId: string) {
	const entries = resolve(harness.records()).filter(
		(entry) => entry.record.type === "verdict" && (entry.record as VerdictRecord).itemId === itemId,
	)
	return entries.at(-1)!
}

describe("post-release amendments", () => {
	let harness: Harness
	let fundingIds: string[]

	before(async () => {
		harness = await startHarness()
		await call(harness.base, "POST", "/api/batches", makeBatch(BATCH, 3))
		for (const itemId of ["item-0", "item-1", "item-2"]) {
			await call(harness.base, "PUT", `/api/batches/${BATCH}/items/${itemId}/verdict`, COMPLETE_VERDICT)
		}
	})

	after(async () => {
		await harness?.stop()
	})

	it("refuses an amendment while the batch is open — items are directly editable then", async () => {
		const refused = await call(harness.base, "POST", `/api/batches/${BATCH}/items/item-0/amend`, {
			patch: { gradeA: "weak" },
			reason: "too early",
		})
		assert.equal(refused.status, 409)
		assert.match(refused.body.error, /not released/u)
		assert.equal(harness.records().filter((record) => record.type === "amendment").length, 0)
	})

	it("replaces the old 409: after release, an edit is an amendment and the error says where", async () => {
		const released = await call(harness.base, "POST", `/api/batches/${BATCH}/release`, { note: "first pass" })
		assert.equal(released.status, 200)
		fundingIds = released.body.fundingRecordIds

		const direct = await call(harness.base, "PUT", `/api/batches/${BATCH}/items/item-0/verdict`, COMPLETE_VERDICT)
		assert.equal(direct.status, 409)
		assert.match(direct.body.error, /items\/<itemId>\/amend/u, "the refusal must name the route that does work")
	})

	it("amends grades, preference and comment, and the latest wins at query time", async () => {
		const original = resolvedVerdict(harness, "item-0")
		assert.equal((original.record as VerdictRecord).gradeA, "strong")

		const amended = await call(harness.base, "POST", `/api/batches/${BATCH}/items/item-0/amend`, {
			patch: { gradeA: "acceptable", gradeB: "acceptable", preference: "no-preference", comment: "on a second look they are the same palette" },
			reason: "I magnified the artwork and the difference is display text only",
		})
		assert.equal(amended.status, 200)
		assert.equal(amended.body.targetId, original.original.id)
		assert.equal(amended.body.retracted, false)

		const entry = resolvedVerdict(harness, "item-0")
		const record = entry.record as VerdictRecord
		assert.equal(record.gradeA, "acceptable")
		assert.equal(record.gradeB, "acceptable")
		assert.equal(record.preference, "no-preference")
		assert.equal(record.comment, "on a second look they are the same palette")
		assert.deepEqual(entry.changedFields, ["gradeA", "gradeB", "preference", "comment"])
		assert.equal(entry.retracted, false)

		// The original line is untouched on disk: the amendment is a second record.
		const raw = harness.records().find((candidate) => candidate.id === original.original.id) as VerdictRecord
		assert.equal(raw.gradeA, "strong")
		// And what the verdict was ABOUT never moved.
		assert.equal(raw.sideA.paletteHash, (entry.record as VerdictRecord).sideA.paletteHash)
		assert.equal(raw.artwork.sha256, (entry.record as VerdictRecord).artwork.sha256)
	})

	it("refuses to amend anything that is not a judgement", async () => {
		for (const patch of [
			{ artwork: { path: "/tmp/other.jpg" } },
			{ sideA: { paletteHash: "0".repeat(64) } },
			{ mode: "absolute" },
			{ itemId: "item-2" },
		]) {
			const refused = await call(harness.base, "POST", `/api/batches/${BATCH}/items/item-0/amend`, {
				patch,
				reason: "trying to rewrite what this was about",
			})
			assert.equal(refused.status, 400, JSON.stringify(patch))
			assert.match(refused.body.error, /not amendable/u)
		}
	})

	it("refuses a patch whose values are outside the vocabulary", async () => {
		// `AMENDABLE_FIELDS` bounds the field names; nothing re-validates the patched record, so a
		// grade of "banana" would be accepted by the log and only found by whatever tried to count it.
		for (const patch of [{ gradeA: "banana" }, { preference: "maybe" }, { confound: "yes" }]) {
			const refused = await call(harness.base, "POST", `/api/batches/${BATCH}/items/item-0/amend`, {
				patch,
				reason: "nonsense value",
			})
			assert.equal(refused.status, 400, JSON.stringify(patch))
		}
		const confoundWithoutNote = await call(harness.base, "POST", `/api/batches/${BATCH}/items/item-0/amend`, {
			patch: { confound: true, confoundNote: "   " },
			reason: "flag without the defect",
		})
		assert.equal(confoundWithoutNote.status, 400)
		assert.match(confoundWithoutNote.body.error, /which unrelated defect/u)
	})

	it("requires a reason, and refuses an amendment that changes nothing", async () => {
		const noReason = await call(harness.base, "POST", `/api/batches/${BATCH}/items/item-1/amend`, {
			patch: { gradeA: "weak" },
			reason: "  ",
		})
		assert.equal(noReason.status, 400)
		assert.match(noReason.body.error, /reason/u)

		const noChange = await call(harness.base, "POST", `/api/batches/${BATCH}/items/item-1/amend`, {
			patch: {},
			reason: "changed my mind about nothing",
		})
		assert.equal(noChange.status, 400)
	})

	it("retracts a verdict: it stops being the reviewer's position and funds nothing", async () => {
		const retracted = await call(harness.base, "POST", `/api/batches/${BATCH}/items/item-1/amend`, {
			patch: {},
			retract: true,
			reason: "this comparison was against a palette I had already vetoed the artwork for",
		})
		assert.equal(retracted.status, 200)
		assert.equal(retracted.body.retracted, true)

		const entry = resolvedVerdict(harness, "item-1")
		assert.equal(entry.retracted, true)
		// Nothing deleted.
		assert.ok(harness.records().some((record) => record.id === entry.original.id))

		const payload = await call(harness.base, "GET", `/api/batches/${BATCH}`)
		const item = payload.body.items.find((entry_: any) => entry_.itemId === "item-1")
		assert.equal(item.verdict.retracted, true)
	})

	it("flags every decision that was funded by since-amended evidence", async () => {
		// This is the standing gate query REVIEW_UI.md §1 promises: the orchestrator triggered on
		// release, and the reviewer's second thoughts arrive afterwards without racing it.
		const release = harness.records().find((record) => record.type === "batch-complete")!
		const decision = { id: "integration-2026-08-03", ts: release.ts, kind: "integration", fundedBy: fundingIds }
		const hits = recheckFundedBy([decision], harness.records())
		assert.equal(hits.length, 1)
		const hit = hits[0]
		assert.equal(hit.decisionId, "integration-2026-08-03")
		assert.deepEqual(hit.missing, [])
		// item-0 was amended, item-1 retracted, item-2 untouched.
		assert.equal(hit.stale.length, 2)
		assert.ok(hit.stale.some((entry) => entry.retracted))
		assert.ok(hit.stale.some((entry) => entry.changedFields.includes("gradeA")))
	})

	it("amends a veto's reason and withdraws it after release", async () => {
		await call(harness.base, "POST", "/api/batches", makeBatch("amend-veto", 1))
		await call(harness.base, "PUT", "/api/batches/amend-veto/items/item-0/veto", { reason: "disc scan" })
		await call(harness.base, "POST", "/api/batches/amend-veto/release")

		const reworded = await call(harness.base, "POST", "/api/batches/amend-veto/items/item-0/amend", {
			target: "veto",
			patch: { reason: "back cover scan, not the front" },
			reason: "the original reason was wrong about which side",
		})
		assert.equal(reworded.status, 200)
		let payload = await call(harness.base, "GET", "/api/batches/amend-veto")
		assert.equal(payload.body.items[0].veto.reason, "back cover scan, not the front")
		assert.equal(payload.body.items[0].veto.active, true)

		const withdrawn = await call(harness.base, "POST", "/api/batches/amend-veto/items/item-0/amend", {
			target: "veto",
			patch: {},
			retract: true,
			reason: "it is usable after all",
		})
		assert.equal(withdrawn.status, 200)
		payload = await call(harness.base, "GET", "/api/batches/amend-veto")
		assert.equal(payload.body.items[0].veto.active, false)
	})

	it("amends the batch-level note on the release record", async () => {
		const amended = await call(harness.base, "POST", `/api/batches/${BATCH}/release-note`, {
			note: "first pass — item-1 retracted afterwards, see the amendment",
			reason: "the release note should say what happened to item-1",
		})
		assert.equal(amended.status, 200)

		const complete = harness.records().find((record) => record.type === "batch-complete") as BatchCompleteRecord
		assert.equal(complete.note, "first pass", "the original release line is untouched")
		const resolved = resolve(harness.records()).find((entry) => entry.original.id === amended.body.targetId)!
		assert.equal((resolved.record as BatchCompleteRecord).note, "first pass — item-1 retracted afterwards, see the amendment")
	})

	it("rebuilds every amendment from the log after a restart", async () => {
		const before = await call(harness.base, "GET", `/api/batches/${BATCH}`)
		harness = await harness.restart()
		const after_ = await call(harness.base, "GET", `/api/batches/${BATCH}`)
		assert.deepEqual(after_.body.items.map((item: any) => item.verdict), before.body.items.map((item: any) => item.verdict))
		const item = after_.body.items.find((entry: any) => entry.itemId === "item-0")
		assert.equal(item.verdict.gradeA, "acceptable")
		assert.equal(item.verdict.amendmentCount, 1)
		assert.ok(item.verdict.amendedAt !== null)
	})

	it("keeps every amendment resolvable: no orphans, no cycles", () => {
		const records = harness.records()
		const amendments = records.filter((record): record is AmendmentRecord => record.type === "amendment")
		assert.ok(amendments.length >= 5)
		const byId = new Map(records.map((record) => [record.id, record]))
		for (const amendment of amendments) {
			assert.ok(byId.has(amendment.targetId), `amendment ${amendment.id} points at nothing`)
			assert.ok(amendment.reason.trim().length > 0, "every amendment carries a reason")
		}
	})
})

describe("the amend page, driven by keystrokes", () => {
	let harness: Harness
	let page: FakePage

	before(async () => {
		harness = await startHarness()
		await call(harness.base, "POST", "/api/batches", makeBatch("amend-page", 2))
		for (const itemId of ["item-0", "item-1"]) {
			await call(harness.base, "PUT", `/api/batches/amend-page/items/${itemId}/verdict`, COMPLETE_VERDICT)
		}
		await call(harness.base, "POST", "/api/batches/amend-page/release", { note: "released for the amend page test" })
		page = await openPage(harness.base, PAGE, NODE_IDS, `${harness.base}/amend?batch=amend-page`)
	})

	after(async () => {
		await harness?.stop()
	})

	it("lists released batches read-only, showing what was judged", () => {
		assert.ok(page.nodes["batch-line"].textContent.includes("amend-page"))
		assert.ok(page.nodes["batch-line"].textContent.includes("released for the amend page test"))
		// The palettes as they were judged, through the shared mock renderer: amending a grade without
		// seeing what it was about is guessing.
		assert.equal(page.nodes.items.byClass("mock").length, 4, "two items, two sides each")
		assert.ok(page.nodes.items.textContent.includes("grade A"))
		assert.ok(page.nodes.items.textContent.includes("edit this verdict"), "read-only until an item is opened")
	})

	it("opens an editor with `e` and refuses to save without a reason", async () => {
		await page.press("e")
		assert.ok(page.nodes.items.textContent.includes("reason for the amendment"))
		await page.press("3")
		await page.press("s")
		assert.match(page.nodes.status.textContent, /needs a reason/u)
		assert.equal(harness.records().filter((record) => record.type === "amendment").length, 0)
	})

	it("saves the amendment once a reason is typed", async () => {
		// The reason field is a real input the reviewer types into, so the test types into it: set the
		// value and fire `input`, exactly as a keystroke would, and let the page's own handler read it.
		const reason = page.nodes.items.descendants().find((node) => node.attrs.placeholder?.includes("changing this"))!
		reason.enter("the artwork is a photo of a screen; both palettes are wrong for a different reason")
		await page.press("2")
		await page.press("s")
		const amendments = harness.records().filter((record): record is AmendmentRecord => record.type === "amendment")
		assert.equal(amendments.length, 1)
		assert.equal(amendments[0].patch.gradeA, "acceptable")
		assert.match(page.nodes.status.textContent, /amended item-0/u)
	})
})
