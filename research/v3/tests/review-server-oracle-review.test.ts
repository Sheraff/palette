/**
 * The post-release adjudication view.
 *
 * The answering pass exists to withhold what this page shows. That makes one property load-bearing
 * above all others: **it exists only for a released batch.** An open round has no adjudication view
 * at all — not an empty one, not a partial one — because serving this payload while the reviewer is
 * still answering would unblind live judging with the round's own answer key.
 *
 * Everything else here is about the annotation channel: it must be a `note` and never a second
 * answer, its vocabulary must be symmetric, and pressing a key must file the note against the item
 * that was on screen.
 */
import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { validateRecord, type NoteRecord, type WarehouseRecord } from "../src/warehouse/records.ts"
import {
	ADJUDICATION_SECTIONS,
	ADJUDICATION_TAG,
	ADJUDICATION_VERDICTS,
	seedOracleValidationRound,
} from "../src/review-server/server.ts"
import {
	PREMISE_DISAMBIGUATION_BATCH_ID,
	buildPremiseDisambiguationFixture,
	readPremiseRun,
} from "../src/review-server/oracle-validation.ts"
import { readJsonl } from "../src/review-server/store.ts"
import { call, openPage, startHarness, type FakePage, type Harness } from "../src/review-server/test-support.ts"
import type { StoredOracleBatch } from "../src/review-server/types.ts"

const BATCH = PREMISE_DISAMBIGUATION_BATCH_ID
const REVIEW_PAGE = fileURLToPath(new URL("../review-ui/oracle-review.js", import.meta.url))
const NODE_IDS = ["question", "totals", "sections", "status"] as const
const fixture = await buildPremiseDisambiguationFixture()

/** Answer the whole round so it can be released, then release it. */
async function answerAndRelease(harness: Harness): Promise<void> {
	const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
	const stored = (await readJsonl<StoredOracleBatch>(harness.batchLogPath))[0] as StoredOracleBatch
	const premise = await readPremiseRun()
	for (const served of payload.body.items) {
		const item = fixture.items.find((entry) => entry.itemId === stored.answerTokens[served.token])!
		const source = premise.get(item.sha256)!
		// A spread of answers, so all three sections have something in them: side with whatever
		// variant A said, which agrees with the oracle on some items and the flag on others.
		const answer = source.byVariant.get("A") ?? "flat_field"
		await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${served.token}/answer`, { answer })
	}
	const released = await call(harness.base, "POST", `/api/batches/${BATCH}/release`)
	assert.equal(released.status, 200)
}

describe("oracle adjudication view — released only", () => {
	it("does not exist for an open batch, on either endpoint", async () => {
		const harness = await startHarness()
		try {
			await seedOracleValidationRound(harness.handle.service)
			const payload = await call(harness.base, "GET", `/api/oracle-review/${BATCH}`)
			assert.equal(payload.status, 404, "an open round must have no adjudication view")
			assert.match(payload.body.error, /not released/u)

			// Not even after every item is answered — answering is not releasing, and the round is still
			// editable until the reviewer says otherwise.
			const served = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
			const stored = (await readJsonl<StoredOracleBatch>(harness.batchLogPath))[0] as StoredOracleBatch
			for (const item of served.body.items) {
				await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${item.token}/answer`, {
					answer: "flat_field",
				})
			}
			const stillClosed = await call(harness.base, "GET", `/api/oracle-review/${BATCH}`)
			assert.equal(stillClosed.status, 404, "answered is not released")

			// And the annotation endpoint is shut too, or an open round could be annotated into evidence.
			const note = await call(
				harness.base,
				"PUT",
				`/api/oracle-review/${BATCH}/items/${Object.keys(stored.answerTokens)[0]}/note`,
				{ verdict: "oracle-defensible" },
			)
			assert.equal(note.status, 404)
			assert.equal(harness.records().filter((record) => record.type === "note").length, 0)

			// An unknown batch is a 404 as well, not a 500.
			assert.equal((await call(harness.base, "GET", "/api/oracle-review/no-such-round")).status, 404)
		} finally {
			await harness.stop()
		}
	})
})

describe("oracle adjudication view", () => {
	let harness: Harness
	let stored: StoredOracleBatch

	before(async () => {
		harness = await startHarness()
		await seedOracleValidationRound(harness.handle.service)
		stored = (await readJsonl<StoredOracleBatch>(harness.batchLogPath))[0] as StoredOracleBatch
		await answerAndRelease(harness)
	})

	after(async () => {
		await harness?.stop()
	})

	it("shows every answered item once, grouped by who the reviewer sided with", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-review/${BATCH}`)
		assert.equal(payload.status, 200)
		assert.equal(payload.body.released, true)
		assert.deepEqual(
			payload.body.sections.map((section: any) => section.key),
			ADJUDICATION_SECTIONS.map((section) => section.key),
		)
		const items = payload.body.sections.flatMap((section: any) => section.items)
		assert.equal(items.length, fixture.items.length)
		assert.equal(payload.body.totals.items, fixture.items.length)
		assert.equal(new Set(items.map((item: any) => item.token)).size, items.length, "no item may appear twice")
		for (const section of payload.body.sections) {
			for (const item of section.items) {
				assert.equal(item.sidedWith, section.key, `${item.fileName} is filed under the wrong section`)
			}
		}
		// Answering with variant A's own label puts every item where A stood, so the "sided with the
		// oracle" section must be non-empty — otherwise the grouping is not being computed at all.
		const oracleSection = payload.body.sections.find((section: any) => section.key === "oracle")
		assert.ok(oracleSection.items.length > 0)
	})

	it("shows the reviewer's answer, both variants, the flag and the outcome", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-review/${BATCH}`)
		const premise = await readPremiseRun()
		for (const item of payload.body.sections.flatMap((section: any) => section.items)) {
			assert.deepEqual(Object.keys(item).sort(), [
				"annotation",
				"fileName",
				"flag",
				"height",
				"media",
				"oracle",
				"reviewer",
				"sidedWith",
				"stratum",
				"token",
				"width",
			])
			const source = fixture.items.find((entry) => entry.itemId === stored.answerTokens[item.token])!
			const truth = premise.get(source.sha256)!
			assert.equal(item.reviewer, truth.byVariant.get("A"), "the reviewer's own answer, verbatim")
			assert.deepEqual(
				item.oracle.map((entry: any) => [entry.variant, entry.groundType]),
				[...truth.byVariant].map(([variant, groundType]) => [variant, groundType]),
			)
			assert.equal(item.flag, truth.truth ? "gradient" : "flat")
			assert.ok(["oracle", "flag", "neither"].includes(item.sidedWith))
			// At least one variant must be marked as the one the flag contradicted — that is why the
			// artwork is in the round.
			assert.ok(item.oracle.some((entry: any) => entry.contradicted))
			assert.equal(item.annotation, null)
			assert.match(item.media, /^\/media\//u)
		}
	})

	it("serves the artwork bytes for an item on the page", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-review/${BATCH}`)
		const item = payload.body.sections.flatMap((section: any) => section.items)[0]
		const media = await call(harness.base, "GET", item.media)
		assert.equal(media.status, 200)
		assert.ok(typeof media.body === "string" && media.body.length > 1000)
	})

	it("records an annotation as a note record the warehouse accepts", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-review/${BATCH}`)
		const item = payload.body.sections.flatMap((section: any) => section.items)[0]
		const response = await call(harness.base, "PUT", `/api/oracle-review/${BATCH}/items/${item.token}/note`, {
			verdict: "oracle-defensible",
		})
		assert.equal(response.status, 200)

		const record = harness.records().at(-1) as NoteRecord
		assert.doesNotThrow(() => validateRecord(record))
		// A note, never an oracle-label: this is an opinion about the answer, not another answer, and
		// folding the two together would corrupt every agreement number computed from the labels.
		assert.equal(record.type, "note")
		assert.equal(record.author.kind, "human")
		assert.equal(record.batch?.id, BATCH)
		assert.equal(record.itemId, stored.answerTokens[item.token])
		assert.equal(record.artwork?.sha256, fixture.items.find((entry) => entry.itemId === record.itemId)!.sha256)
		assert.deepEqual(record.tags, [ADJUDICATION_TAG, "oracle-defensible"])
		assert.ok(record.text.includes("also defensible"), "the note carries its own words, not only a tag")
		assert.equal(record.derived, null, "a keystroke from the reviewer is raw evidence, not a derived record")
		// No label was written: the round's answers are frozen.
		assert.equal(
			harness.records().filter((entry) => entry.type === "oracle-label").length,
			fixture.items.length,
			"annotating must not add or change an answer",
		)
	})

	it("offers a symmetric vocabulary, and refuses anything outside it", async () => {
		// REVIEW_UI.md §4: for every expressible complaint its opposite must exist. A page that could
		// only record "the oracle misread this" would measure willingness to complain.
		assert.deepEqual([...ADJUDICATION_VERDICTS], ["oracle-defensible", "oracle-misread"])
		const payload = await call(harness.base, "GET", `/api/oracle-review/${BATCH}`)
		assert.deepEqual(payload.body.verdicts, [...ADJUDICATION_VERDICTS])
		const item = payload.body.sections.flatMap((section: any) => section.items)[1]
		const bad = await call(harness.base, "PUT", `/api/oracle-review/${BATCH}/items/${item.token}/note`, {
			verdict: "oracle-is-fine-ish",
		})
		assert.equal(bad.status, 400)
		const unknown = await call(harness.base, "PUT", `/api/oracle-review/${BATCH}/items/deadbeef/note`, {
			verdict: "oracle-misread",
		})
		assert.equal(unknown.status, 404)
	})

	it("lets the reviewer change their mind, latest note winning, nothing deleted", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-review/${BATCH}`)
		const item = payload.body.sections.flatMap((section: any) => section.items)[0]
		assert.equal(item.annotation, "oracle-defensible", "the earlier annotation is read back")

		await call(harness.base, "PUT", `/api/oracle-review/${BATCH}/items/${item.token}/note`, {
			verdict: "oracle-misread",
		})
		const after_ = await call(harness.base, "GET", `/api/oracle-review/${BATCH}`)
		const again = after_.body.sections.flatMap((section: any) => section.items).find((entry: any) => entry.token === item.token)
		assert.equal(again.annotation, "oracle-misread")
		const notes = harness.records().filter((record): record is NoteRecord => record.type === "note")
		assert.equal(notes.length, 2, "the log is append-only; the earlier note stays as evidence")
		assert.equal(after_.body.totals.annotated, 1)
		assert.equal(after_.body.totals["oracle-misread"], 1)
		assert.equal(after_.body.totals["oracle-defensible"], 0)
	})

	it("is optional: a round with no annotations at all is a valid state", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-review/${BATCH}`)
		const unannotated = payload.body.sections
			.flatMap((section: any) => section.items)
			.filter((item: any) => item.annotation === null)
		assert.equal(unannotated.length, fixture.items.length - 1, "no completeness is required or implied")
		assert.equal(payload.body.totals.annotated, 1)
	})

	it("survives a restart with its notes intact", async () => {
		const before_ = await call(harness.base, "GET", `/api/oracle-review/${BATCH}`)
		harness = await harness.restart()
		const after_ = await call(harness.base, "GET", `/api/oracle-review/${BATCH}`)
		assert.deepEqual(after_.body, before_.body)
	})
})

describe("oracle adjudication page, driven by keystrokes", () => {
	let harness: Harness
	let page: FakePage

	before(async () => {
		harness = await startHarness()
		await seedOracleValidationRound(harness.handle.service)
		await answerAndRelease(harness)
		page = await openPage(harness.base, REVIEW_PAGE, NODE_IDS)
	})

	after(async () => {
		await harness?.stop()
	})

	it("opens on the released round, with all three sections and every item", () => {
		assert.match(page.nodes.totals.textContent, new RegExp(`^${fixture.items.length} items`, "u"))
		assert.match(page.nodes.status.textContent, new RegExp(BATCH, "u"))
		for (const section of ADJUDICATION_SECTIONS) {
			assert.ok(page.nodes.sections.textContent.includes(section.title), `${section.key} section is missing`)
		}
		const articles = page.nodes.sections.children.flatMap((section) =>
			section.children.filter((child) => child.tagName === "article"),
		)
		assert.equal(articles.length, fixture.items.length)
	})

	it("shows the artwork and all five facts for each item", () => {
		const article = page.nodes.sections.children
			.flatMap((section) => section.children)
			.find((child) => child.tagName === "article")!
		const image = article.children.find((child) => child.tagName === "img")!
		assert.equal(image.className, "adj-art")
		assert.match(image.src, /^\/media\//u)
		assert.ok(image.width > 0 && image.height > 0)
		for (const label of ["you answered", "oracle A", "oracle B", "published flag", "you sided with", "annotation"]) {
			assert.ok(article.textContent.includes(label), `the item does not show "${label}"`)
		}
	})

	it("files d and m against the item the reviewer is looking at, and advances", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-review/${BATCH}`)
		const order = payload.body.sections.flatMap((section: any) => section.items)

		await page.press("d")
		assert.match(page.nodes.status.textContent, /recorded "oracle-defensible"/u)
		await page.press("m")
		assert.match(page.nodes.status.textContent, /recorded "oracle-misread"/u)

		const notes = harness.records().filter((record): record is NoteRecord => record.type === "note")
		assert.equal(notes.length, 2)
		const stored = (await readJsonl<StoredOracleBatch>(harness.batchLogPath))[0] as StoredOracleBatch
		assert.equal(notes[0].itemId, stored.answerTokens[order[0].token], "the first key annotated the wrong item")
		assert.equal(notes[0].tags[1], "oracle-defensible")
		assert.equal(notes[1].itemId, stored.answerTokens[order[1].token], "the page did not advance before the second key")
		assert.equal(notes[1].tags[1], "oracle-misread")
		assert.match(page.nodes.totals.textContent, /2 annotated \(1 defensible, 1 misread\)/u)
	})

	it("skips without recording, and walks back and forth", async () => {
		const count = harness.records().length
		await page.press("s")
		await page.press("j")
		await page.press("k")
		assert.equal(harness.records().length, count, "moving must never write a record")
		assert.match(page.nodes.status.textContent, /^\d+ of \d+$/u)
	})

	it("ignores a key it does not bind", async () => {
		const before = page.visible()
		for (const key of ["x", "1", "r"]) {
			await assert.rejects(() => page.press(key), new RegExp(`the page ignored the ${key} key`, "u"))
		}
		assert.equal(page.visible(), before)
	})

	it("writes nothing but notes — the round's answers are frozen", () => {
		const kinds = new Set((harness.records() as WarehouseRecord[]).map((record) => record.type))
		assert.deepEqual([...kinds].sort(), ["batch-complete", "note", "oracle-label"])
		assert.equal(
			harness.records().filter((record) => record.type === "oracle-label").length,
			fixture.items.length,
			"the adjudication pass must not have touched a single answer",
		)
	})
})
