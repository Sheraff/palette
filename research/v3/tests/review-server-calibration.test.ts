/**
 * Calibration mode — absolute grading (REVIEW_UI.md §5).
 *
 * "Periodic absolute grading (not A/B) of never-reviewed artworks, with re-inclusion of previously
 * graded ones — the repeats measure drift and reviewer noise. Same grade scale, same warehouse."
 *
 * The load-bearing property is that an absolute verdict can never be mistaken for half a comparison:
 * `mode: "absolute"`, side B / grade B / preference null, and the warehouse refuses the record
 * outright if any of them is present. Everything else — push, queue, release, veto, restart — is the
 * pairwise flow, deliberately, because everything else about the job is the same.
 */
import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { batchSummaries, isBatchReleased, resolve, supersededVerdictIds } from "../src/warehouse/warehouse.ts"
import type { BatchCompleteRecord, VerdictRecord } from "../src/warehouse/records.ts"
import {
	call,
	openPage,
	startHarness,
	TEST_IMAGES,
	type FakePage,
	type Harness,
} from "../src/review-server/test-support.ts"

const BATCH = "calibration-round-1"
const PAGE = fileURLToPath(new URL("../review-ui/calibration.js", import.meta.url))
const NODE_IDS = ["batch-line", "item-nav", "prev", "next", "release", "release-note", "item", "status"] as const

/** A calibration push: one artwork, one palette, one true variant id that is never served. */
function makeCalibrationBatch(batchId: string, itemCount: number) {
	const hex = (index: number, offset: number) => {
		const value = (index * 53 + offset * 71) % 256
		return `#${value.toString(16).padStart(2, "0").repeat(3)}`
	}
	return {
		batchId,
		purpose: "calibration",
		fundedBy: ["calibration drift check"],
		items: Array.from({ length: itemCount }, (_, index) => ({
			itemId: `cal-${index}`,
			imagePath: TEST_IMAGES[index % TEST_IMAGES.length],
			variantId: "CALIBRATION-VARIANT-SECRET",
			fingerprint: {
				algorithmVersion: "CALIBRATION-VERSION-SECRET",
				preprocessingVersion: "preprocessing-test",
				gitCommit: "0".repeat(40),
				dirty: false,
			},
			palette: {
				background: hex(index, 0),
				surface: hex(index + 1, 0),
				foreground: hex(index + 2, 0),
				accent: hex(index + 3, 0),
				gradient:
					index % 2 === 0
						? null
						: { stops: [{ color: hex(index, 0), position: 0 }, { color: hex(index + 1, 0), position: 1 }] },
				surfaceCollapsed: false,
				accentCollapsed: false,
			},
		})),
	}
}

describe("calibration mode — absolute grading", () => {
	let harness: Harness

	before(async () => {
		harness = await startHarness()
		const pushed = await call(harness.base, "POST", "/api/calibration", makeCalibrationBatch(BATCH, 3))
		assert.equal(pushed.status, 201)
		assert.deepEqual(pushed.body, { batchId: BATCH, itemCount: 3 })
	})

	after(async () => {
		await harness?.stop()
	})

	it("takes a pushed round like a pairwise push, and shows it in the same queue", async () => {
		const queue = await call(harness.base, "GET", "/api/queue")
		const entry = queue.body.batches.find((batch: any) => batch.batchId === BATCH)
		assert.equal(entry.kind, "calibration")
		assert.equal(entry.purpose, "calibration")
		assert.equal(entry.itemCount, 3)
		assert.equal(entry.judgedCount, 0)
		assert.equal(entry.released, false)

		const duplicate = await call(harness.base, "POST", "/api/calibration", makeCalibrationBatch(BATCH, 1))
		assert.equal(duplicate.status, 409)
	})

	it("refuses a malformed push, and reads dimensions from the file header", async () => {
		const noPalette = await call(harness.base, "POST", "/api/calibration", {
			batchId: "cal-bad",
			items: [{ itemId: "x", imagePath: TEST_IMAGES[0], variantId: "v", fingerprint: {} }],
		})
		assert.equal(noPalette.status, 400)

		const payload = await call(harness.base, "GET", `/api/calibration/${BATCH}`)
		assert.equal(payload.status, 200)
		assert.equal(payload.body.mode, "absolute")
		for (const item of payload.body.items) {
			assert.ok(item.artwork.width > 0 && item.artwork.height > 0)
			assert.match(item.artwork.sha256, /^[0-9a-f]{64}$/u)
			assert.equal(item.artwork.format, "jpeg")
		}
	})

	it("serves one palette per item and nothing that names the algorithm", async () => {
		const payload = await call(harness.base, "GET", `/api/calibration/${BATCH}`)
		const raw = JSON.stringify(payload.body)
		// There is nothing to blind with one palette — but the grade is supposed to be about the
		// palette, and an algorithm version on screen makes it about a label.
		assert.ok(!raw.includes("CALIBRATION-VARIANT-SECRET"), "the variant id must not be served")
		assert.ok(!raw.includes("CALIBRATION-VERSION-SECRET"), "the fingerprint must not be served")
		for (const item of payload.body.items) {
			assert.equal(item.sides, undefined, "there is no side A/B in absolute grading")
			assert.deepEqual(
				item.side.roles.map((role: any) => role.role),
				["background", "surface", "foreground", "accent"],
			)
			// Every colour named via colornames-oklab, and the pinned field renderer's output pasted.
			for (const role of item.side.roles) assert.ok(role.name.length > 0)
			assert.ok(typeof item.side.fieldCss === "string" && item.side.fieldCss.length > 0)
		}
		// The [REVIEWED] display mapping is the same one the pairwise page gets.
		const gradient = payload.body.items.find((item: any) => item.side.gradient !== null)
		assert.ok(gradient.side.fieldCss.includes("linear-gradient(135deg in oklab"))
		assert.equal(gradient.side.gradient.stops[0].displayPosition, 0.35)
	})

	it("serves its artworks and their colours through the shared item routes", async () => {
		// A calibration item is an item: the media route, the composer's swatch grid and its eyedropper
		// all work on it without a second implementation.
		const media = await fetch(`${harness.base}/media/${BATCH}/cal-0`)
		assert.equal(media.status, 200)
		assert.equal(media.headers.get("content-type"), "image/jpeg")

		const colors = await call(harness.base, "GET", `/api/batches/${BATCH}/items/cal-0/colors`)
		assert.equal(colors.status, 200)
		assert.ok(colors.body.swatches.length > 0)
		const pixel = await call(harness.base, "GET", `/api/batches/${BATCH}/items/cal-0/pixel?x=0.5&y=0.5`)
		assert.equal(pixel.status, 200)
		assert.match(pixel.body.hex, /^#[0-9a-f]{6}$/u)
	})

	it("writes an absolute verdict: no side B, no grade B, no preference", async () => {
		const saved = await call(harness.base, "PUT", `/api/calibration/${BATCH}/items/cal-0/verdict`, {
			grade: "acceptable",
			comment: "the surface is close to the background, but it reads",
		})
		assert.equal(saved.status, 200)
		assert.equal(saved.body.revision, 1)

		const verdict = harness.records().find((record) => record.type === "verdict") as VerdictRecord
		assert.equal(verdict.mode, "absolute")
		assert.equal(verdict.gradeA, "acceptable")
		assert.equal(verdict.gradeB, null)
		assert.equal(verdict.sideB, null)
		assert.equal(verdict.preference, null)
		assert.equal(verdict.confound, false)
		assert.equal(verdict.batch.purpose, "calibration")
		assert.equal(verdict.batch.itemCount, 3)
		// The side that WAS shown is fully recorded, variant id included — that never reaches the
		// browser, but adjudication is impossible without it.
		assert.equal(verdict.sideA.variantId, "CALIBRATION-VARIANT-SECRET")
		assert.equal(verdict.sideA.fingerprint.algorithmVersion, "CALIBRATION-VERSION-SECRET")
		assert.match(verdict.sideA.paletteHash, /^[0-9a-f]{64}$/u)
		assert.ok(verdict.sideA.palette !== null && verdict.sideA.palette !== undefined)
	})

	it("refuses pairwise fields rather than silently dropping them", async () => {
		for (const body of [
			{ grade: "strong", gradeB: "weak" },
			{ grade: "strong", preference: "a" },
			{ grade: "strong", confound: true },
			{ gradeA: "strong" },
			{ grade: "excellent" },
		]) {
			const refused = await call(harness.base, "PUT", `/api/calibration/${BATCH}/items/cal-1/verdict`, body)
			assert.equal(refused.status, 400, JSON.stringify(body))
		}
		assert.equal(harness.records().filter((record) => record.type === "verdict").length, 1)
	})

	it("stays freely editable until release, appending every time", async () => {
		for (const grade of ["weak", "acceptable", "strong"] as const) {
			const response = await call(harness.base, "PUT", `/api/calibration/${BATCH}/items/cal-0/verdict`, {
				grade,
				comment: `now I think ${grade}`,
			})
			assert.equal(response.status, 200)
		}
		const payload = await call(harness.base, "GET", `/api/calibration/${BATCH}`)
		const item = payload.body.items.find((entry: any) => entry.itemId === "cal-0")
		assert.equal(item.verdict.mode, "absolute")
		assert.equal(item.verdict.grade, "strong")
		assert.equal(item.verdict.gradeA, undefined, "an absolute verdict is not served as half a pairwise one")
		assert.equal(item.verdict.revision, 4)
		// The drafts stay in the log and are superseded, never counted twice.
		const superseded = supersededVerdictIds(resolve(harness.records()))
		assert.equal(superseded.size, 3)
	})

	it("counts a veto as judged, through the same route the pairwise page uses", async () => {
		const veto = await call(harness.base, "PUT", `/api/batches/${BATCH}/items/cal-1/veto`, {
			reason: "promotional text card, not album artwork",
		})
		assert.equal(veto.status, 200)
		const queue = await call(harness.base, "GET", "/api/queue")
		assert.equal(queue.body.batches.find((batch: any) => batch.batchId === BATCH).judgedCount, 2)
	})

	it("refuses release while an item is unjudged, then releases through the shared flow", async () => {
		const refused = await call(harness.base, "POST", `/api/batches/${BATCH}/release`)
		assert.equal(refused.status, 409)
		assert.match(refused.body.error, /cal-2/u)

		await call(harness.base, "PUT", `/api/calibration/${BATCH}/items/cal-2/verdict`, { grade: "weak", comment: "" })
		const released = await call(harness.base, "POST", `/api/batches/${BATCH}/release`, {
			note: "drift check after the arm-3 landing",
		})
		assert.equal(released.status, 200)
		assert.deepEqual(released.body.itemsWithoutComment, ["cal-2"])

		const records = harness.records()
		const complete = records.at(-1) as BatchCompleteRecord
		assert.equal(complete.type, "batch-complete")
		assert.equal(complete.batchId, BATCH)
		assert.equal(complete.purpose, "calibration")
		assert.equal(complete.itemCount, 3)
		assert.equal(complete.note, "drift check after the arm-3 landing")
		assert.deepEqual(complete.releasedItemIds, ["cal-0", "cal-1", "cal-2"])
		assert.equal(isBatchReleased(records, BATCH), true)

		// The warehouse's own summary agrees, without knowing this mode exists.
		const summary = batchSummaries(records).find((entry) => entry.batchId === BATCH)!
		assert.equal(summary.itemCount, 3)
		assert.equal(summary.reviewed, 3)
		assert.equal(summary.pending, 0)
		assert.ok(summary.released !== null)
	})

	it("closes the round, and survives a restart", async () => {
		const late = await call(harness.base, "PUT", `/api/calibration/${BATCH}/items/cal-0/verdict`, {
			grade: "weak",
			comment: "",
		})
		assert.equal(late.status, 409)
		assert.match(late.body.error, /amend/u)

		harness = await harness.restart()
		const payload = await call(harness.base, "GET", `/api/calibration/${BATCH}`)
		assert.equal(payload.body.released, true)
		assert.equal(payload.body.releaseNote, "drift check after the arm-3 landing")
		assert.equal(payload.body.items.find((entry: any) => entry.itemId === "cal-0").verdict.grade, "strong")
		assert.equal(payload.body.items.find((entry: any) => entry.itemId === "cal-1").veto.active, true)
	})
})

describe("calibration page, driven by keystrokes", () => {
	let harness: Harness
	let page: FakePage

	before(async () => {
		harness = await startHarness()
		await call(harness.base, "POST", "/api/calibration", makeCalibrationBatch("calibration-page", 2))
		page = await openPage(harness.base, PAGE, NODE_IDS, `${harness.base}/?batch=calibration-page`)
	})

	after(async () => {
		await harness?.stop()
	})

	it("opens the newest unreleased calibration round and shows one palette", () => {
		assert.ok(page.nodes["batch-line"].textContent.includes("calibration-page"))
		assert.ok(page.nodes["batch-line"].textContent.includes("absolute"))
		assert.equal(page.nodes.item.byClass("mock").length, 1, "one palette per item, so one mock")
		// No side letter: naming it "side A" would imply a side B that does not exist.
		assert.ok(!page.nodes.item.textContent.includes("side A"))
	})

	it("grades with 1-4 and writes an absolute verdict for the item on screen", async () => {
		await page.press("2")
		const verdicts = harness.records().filter((record): record is VerdictRecord => record.type === "verdict")
		assert.equal(verdicts.length, 1)
		assert.equal(verdicts[0].mode, "absolute")
		assert.equal(verdicts[0].gradeA, "acceptable")
		assert.equal(verdicts[0].itemId, "cal-0")
	})

	it("moves to the next item and grades that one, not the first", async () => {
		await page.press("j")
		await page.press("1")
		const verdicts = harness.records().filter((record): record is VerdictRecord => record.type === "verdict")
		assert.equal(verdicts.length, 2)
		assert.equal(verdicts[1].itemId, "cal-1")
		assert.equal(verdicts[1].gradeA, "strong")
	})

	it("has no pairwise keys: b and n do nothing here", async () => {
		const before = harness.records().length
		for (const key of ["b", "n", "6"]) {
			let prevented = false
			// `press` insists on a visible response; these keys must produce none at all.
			await assert.rejects(async () => {
				await page.press(key)
				prevented = true
			})
			assert.equal(prevented, false)
		}
		assert.equal(harness.records().length, before, "a pairwise key must not write anything in absolute mode")
	})
})
