/**
 * The palette composer (REVIEW_UI.md §4).
 *
 * What matters about this feature is not that a form submits. It is that:
 *
 *  - every colour it offers is an **exact source pixel** of the artwork, from both pickers, and a
 *    palette holding anything else is refused — because the composer's primary use is reachability
 *    diagnosis, and a palette made of colours the artwork does not contain answers no question about
 *    what the algorithm could reach;
 *  - the **preview is the judging renderer**, byte for byte, including the `[REVIEWED]` gradient
 *    display mapping — a palette that only looks right in a different renderer is not endorsed;
 *  - **editing an endorsement appends a new one.** The warehouse refuses an amendment carrying
 *    palette changes; this asserts the server never tries, and that a withdrawal keeps the record.
 */
import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { colorFromHex, colorRegion, sameColorBar } from "../src/contract/color.ts"
import {
	clearImageColorCache,
	containsColor,
	readImageColors,
	sameColorBarByRegion,
	SWATCH_GRID_SIZE,
} from "../src/review-server/composer.ts"
import {
	call,
	COMPLETE_VERDICT,
	makeBatch,
	openPage,
	startHarness,
	TEST_IMAGES,
	type FakePage,
	type Harness,
} from "../src/review-server/test-support.ts"
import type { AmendmentRecord, EndorsedSampleRecord } from "../src/warehouse/records.ts"
import { hashPalette } from "../src/warehouse/records.ts"
import { resolve } from "../src/warehouse/warehouse.ts"

const BATCH = "composer-batch"
const ITEM = "item-0"
const APP_PAGE = fileURLToPath(new URL("../review-ui/app.js", import.meta.url))
const NODE_IDS = ["batch-line", "item-nav", "prev", "next", "release", "release-note", "item", "status"] as const

function itemPath(...parts: string[]): string {
	return ["/api/batches", BATCH, "items", ITEM, ...parts].join("/")
}

describe("palette composer — the artwork's own colours", () => {
	let harness: Harness
	let swatches: Array<{ hex: string; name: string; areaFraction: number }>

	before(async () => {
		harness = await startHarness()
		assert.equal((await call(harness.base, "POST", "/api/batches", makeBatch(BATCH, 1))).status, 201)
		const colors = await call(harness.base, "GET", itemPath("colors"))
		swatches = colors.body.swatches
	})

	after(async () => {
		await harness?.stop()
	})

	it("offers a quantized grid whose every swatch is an exact pixel of the artwork", async () => {
		const colors = await readImageColors(TEST_IMAGES[0], "test-key-grid")
		assert.ok(swatches.length > 0 && swatches.length <= SWATCH_GRID_SIZE)
		for (const entry of swatches) {
			assert.match(entry.hex, /^#[0-9a-f]{6}$/u)
			assert.ok(containsColor(colors, entry.hex), `${entry.hex} is in the grid but not in the artwork`)
			// Named via colornames-oklab, like every colour the reviewer sees (REVIEW_UI.md §3).
			assert.ok(entry.name.length > 0 && entry.name !== entry.hex)
			// Scale-free: an area fraction, never a pixel count (CONVENTIONS.md).
			assert.ok(entry.areaFraction > 0 && entry.areaFraction <= 1)
		}
		// Most-common-first, so the grid's order is the artwork's own order of importance.
		const fractions = swatches.map((entry) => entry.areaFraction)
		assert.deepEqual(fractions, [...fractions].sort((first, second) => second - first))
	})

	it("merges under the contract's one ruler, not a bin size invented here", () => {
		// The merge pass precomputes each colour's region and takes the max of the two bars. That is
		// `sameColorBar()` with the work hoisted out of the inner loop — and this is what keeps the
		// shortcut from drifting away from the ruler it is supposed to be.
		const samples = ["#000000", "#0a0a0a", "#ffffff", "#7f7f7f", "#c81e1e", "#123456", "#f0a0d0", "#204030"]
		for (const first of samples) {
			for (const second of samples) {
				const viaContract = sameColorBar(colorFromHex(first), colorFromHex(second))
				const viaShortcut = sameColorBarByRegion(
					colorRegion(colorFromHex(first)),
					colorRegion(colorFromHex(second)),
				)
				assert.equal(viaShortcut, viaContract, `${first} vs ${second}`)
			}
		}
	})

	it("resolves the eyedropper against the file, in normalized coordinates", async () => {
		const colors = await readImageColors(TEST_IMAGES[0], "test-key-eyedropper")
		for (const [x, y] of [
			[0, 0],
			[0.5, 0.5],
			[1, 1],
			[0.25, 0.75],
		]) {
			const response = await call(harness.base, "GET", `${itemPath("pixel")}?x=${x}&y=${y}`)
			assert.equal(response.status, 200)
			assert.ok(containsColor(colors, response.body.hex), `${response.body.hex} at (${x},${y}) is not in the artwork`)
			// The answer comes back as the sampled pixel's own centre, so the page can mark it.
			assert.ok(response.body.x > 0 && response.body.x < 1)
			assert.ok(response.body.y > 0 && response.body.y < 1)
			assert.ok(response.body.name.length > 0)
		}
		// (1,1) is the last pixel, not one past it — the classic off-by-one, which here would be a
		// silent read of the next row.
		const corner = await call(harness.base, "GET", `${itemPath("pixel")}?x=1&y=1`)
		const inside = await call(harness.base, "GET", `${itemPath("pixel")}?x=0.9999&y=0.9999`)
		assert.equal(corner.body.hex, inside.body.hex)

		const outside = await call(harness.base, "GET", `${itemPath("pixel")}?x=1.5&y=0.5`)
		assert.equal(outside.status, 400)
		assert.match(outside.body.error, /normalized/u)
	})

	it("previews through the same renderer a judged side goes through", async () => {
		const palette = {
			background: swatches[0].hex,
			surface: swatches[1].hex,
			foreground: swatches[2].hex,
			accent: swatches[3].hex,
			surfaceCollapsed: false,
			accentCollapsed: false,
			gradient: { stops: [{ color: swatches[0].hex, position: 0 }, { color: swatches[1].hex, position: 1 }] },
		}
		const preview = await call(harness.base, "POST", itemPath("preview"), { palette })
		assert.equal(preview.status, 200)
		// The [REVIEWED] 2-stop reserve is 35%: the ramp starts at 35%, not at 0.
		assert.match(preview.body.side.fieldCss, /^linear-gradient\(135deg in oklab, /u)
		assert.ok(preview.body.side.fieldCss.includes("35%"), preview.body.side.fieldCss)
		assert.equal(preview.body.side.gradient.stops[0].displayPosition, 0.35)
		assert.equal(preview.body.side.gradient.stops[0].publishedPosition, 0)
		// Every colour named, and the hash the endorsement will carry, before anything is written.
		for (const role of preview.body.side.roles) assert.ok(role.name.length > 0)
		assert.equal(preview.body.paletteHash, hashPalette(palette as never))
		assert.deepEqual(preview.body.foreign, [])
		// A preview writes nothing: it is a preview.
		assert.equal(harness.records().length, 0)
	})

	it("names every colour the artwork does not contain, and refuses to endorse it", async () => {
		const palette = {
			background: "#010203",
			surface: swatches[1].hex,
			foreground: "#040506",
			accent: swatches[3].hex,
			surfaceCollapsed: false,
			accentCollapsed: false,
			gradient: null,
		}
		const preview = await call(harness.base, "POST", itemPath("preview"), { palette })
		// A preview still renders it — the warning is on screen while composing, not a wall.
		assert.equal(preview.status, 200)
		assert.deepEqual(preview.body.foreign, ["#010203", "#040506"])

		const refused = await call(harness.base, "POST", itemPath("endorsement"), { palette, comment: "" })
		assert.equal(refused.status, 400)
		assert.match(refused.body.error, /#010203/u)
		assert.match(refused.body.error, /exact source pixels/u)
		assert.equal(harness.records().filter((record) => record.type === "endorsed-sample").length, 0)
	})

	it("refuses a gradient stop that is not a source pixel either", async () => {
		const refused = await call(harness.base, "POST", itemPath("endorsement"), {
			palette: {
				background: swatches[0].hex,
				surface: swatches[1].hex,
				foreground: swatches[2].hex,
				accent: swatches[3].hex,
				surfaceCollapsed: false,
				accentCollapsed: false,
				gradient: { stops: [{ color: swatches[0].hex, position: 0 }, { color: "#0f0f0f", position: 1 }] },
			},
			comment: "",
		})
		assert.equal(refused.status, 400)
		assert.match(refused.body.error, /#0f0f0f/u)
	})

	it("records an endorsed-sample with full identity, and a second edit as a NEW record", async () => {
		const first = {
			background: swatches[0].hex,
			surface: swatches[1].hex,
			foreground: swatches[2].hex,
			accent: swatches[3].hex,
			surfaceCollapsed: false,
			accentCollapsed: false,
			gradient: null,
		}
		const created = await call(harness.base, "POST", itemPath("endorsement"), {
			palette: first,
			comment: "the accent should come from the sleeve, not the type",
			basedOn: "A",
		})
		assert.equal(created.status, 201)
		assert.equal(created.body.count, 1)

		const second = { ...first, accent: swatches[4].hex }
		const edited = await call(harness.base, "POST", itemPath("endorsement"), {
			palette: second,
			comment: "actually this accent",
			basedOn: "A",
		})
		assert.equal(edited.status, 201)
		assert.equal(edited.body.count, 2)

		const endorsements = harness
			.records()
			.filter((record): record is EndorsedSampleRecord => record.type === "endorsed-sample")
		assert.equal(endorsements.length, 2, "editing a composition must append, never rewrite")
		// No amendment carrying a palette: the warehouse would throw, and the server must never try.
		assert.equal(harness.records().filter((record) => record.type === "amendment").length, 0)

		const [one, two] = endorsements
		assert.equal(one.batch?.id, BATCH)
		assert.equal(one.itemId, ITEM)
		assert.equal(one.author.kind, "human")
		// Full artwork identity: path + content hash + header-derived rendition (CONVENTIONS.md).
		assert.ok(one.artwork.path.startsWith("/"))
		assert.match(one.artwork.sha256, /^[0-9a-f]{64}$/u)
		assert.ok(one.artwork.rendition.width > 0 && one.artwork.rendition.height > 0)
		assert.equal(one.paletteHash, hashPalette(first as never))
		assert.equal(two.paletteHash, hashPalette(second as never))
		assert.notEqual(one.paletteHash, two.paletteHash)
		// It is recorded which shown palette it grew from, by content hash — the side letter is a
		// property of this batch's shuffle and would mean nothing outside it.
		assert.match(String(one.basedOnPaletteHash), /^[0-9a-f]{64}$/u)
		assert.equal(one.comment, "the accent should come from the sleeve, not the type")
	})

	it("withdraws an endorsement with a retracting amendment, keeping the record", async () => {
		const withdrawn = await call(harness.base, "POST", itemPath("amend"), {
			target: "endorsement",
			patch: {},
			retract: true,
			reason: "I misread the artwork; that green is a JPEG artefact",
		})
		assert.equal(withdrawn.status, 200)

		const records = harness.records()
		const amendments = records.filter((record): record is AmendmentRecord => record.type === "amendment")
		assert.equal(amendments.length, 1)
		assert.equal(amendments[0].retract, true)
		assert.deepEqual(amendments[0].patch, {})
		// Nothing deleted: both endorsements are still in the log, the latest one marked retracted.
		assert.equal(records.filter((record) => record.type === "endorsed-sample").length, 2)
		const retracted = resolve(records).filter((entry) => entry.record.type === "endorsed-sample" && entry.retracted)
		assert.equal(retracted.length, 1)

		const payload = await call(harness.base, "GET", `/api/batches/${BATCH}`)
		const item = payload.body.items.find((entry: any) => entry.itemId === ITEM)
		assert.equal(item.endorsements.length, 2)
		assert.equal(item.endorsements[1].retracted, true)
	})

	it("refuses an amendment that would rewrite the endorsed palette", async () => {
		const refused = await call(harness.base, "POST", itemPath("amend"), {
			target: "endorsement",
			patch: { palette: { background: "#000000" } },
			reason: "trying to edit in place",
		})
		assert.equal(refused.status, 400)
		assert.match(refused.body.error, /not amendable/u)
		// The comment is the one amendable field, and it works.
		const allowed = await call(harness.base, "POST", itemPath("amend"), {
			target: "endorsement",
			patch: { comment: "clearer wording" },
			reason: "the note was ambiguous",
		})
		assert.equal(allowed.status, 200)
	})

	it("keeps the endorsements after a restart, and cites them on release", async () => {
		harness = await harness.restart()
		const payload = await call(harness.base, "GET", `/api/batches/${BATCH}`)
		const item = payload.body.items.find((entry: any) => entry.itemId === ITEM)
		assert.equal(item.endorsements.length, 2)
		assert.equal(item.endorsements[1].retracted, true)

		await call(harness.base, "PUT", `/api/batches/${BATCH}/items/${ITEM}/verdict`, COMPLETE_VERDICT)
		const released = await call(harness.base, "POST", `/api/batches/${BATCH}/release`)
		assert.equal(released.status, 200)
		const live = item.endorsements.find((entry: any) => !entry.retracted)
		assert.ok(
			released.body.fundingRecordIds.includes(live.recordId),
			"a release should cite the endorsed samples it stands on",
		)
		const retractedEntry = item.endorsements.find((entry: any) => entry.retracted)
		assert.ok(!released.body.fundingRecordIds.includes(retractedEntry.recordId), "a withdrawn endorsement funds nothing")
	})

	it("refuses a new endorsement on a released batch, but still allows withdrawal", async () => {
		const refused = await call(harness.base, "POST", itemPath("endorsement"), {
			palette: {
				background: swatches[0].hex,
				surface: swatches[1].hex,
				foreground: swatches[2].hex,
				accent: swatches[3].hex,
				surfaceCollapsed: false,
				accentCollapsed: false,
				gradient: null,
			},
			comment: "",
		})
		assert.equal(refused.status, 409)
		assert.match(refused.body.error, /amend/u)

		const withdrawn = await call(harness.base, "POST", itemPath("amend"), {
			target: "endorsement",
			patch: {},
			retract: true,
			reason: "second thoughts after release",
		})
		assert.equal(withdrawn.status, 200, "an endorsement is immutable, so withdrawal is its only correction")
	})
})

describe("palette composer — the page, driven by keystrokes", () => {
	let harness: Harness
	let page: FakePage

	/** Wait for an asynchronous render (the live preview is a debounced round trip to the server). */
	async function waitFor(what: string, predicate: () => boolean): Promise<void> {
		for (let attempt = 0; attempt < 300; attempt++) {
			if (predicate()) return
			await new Promise((done) => setTimeout(done, 5))
		}
		assert.fail(what)
	}

	/** Which gradient shape the composer is on, read off the page rather than assumed. */
	function mode(): string {
		const selected = page.nodes.item
			.byClass("selected")
			.map((node) => node.textContent)
			.filter((text) => ["flat", "2-stop", "3-stop"].includes(text))
		return selected.at(-1) ?? ""
	}

	async function setMode(wanted: string): Promise<void> {
		for (let attempt = 0; attempt < 3 && mode() !== wanted; attempt++) await page.press("g")
		assert.equal(mode(), wanted)
	}

	before(async () => {
		harness = await startHarness()
		await call(harness.base, "POST", "/api/batches", makeBatch("composer-page", 1))
		page = await openPage(harness.base, APP_PAGE, NODE_IDS, `${harness.base}/?batch=composer-page`)
	})

	after(async () => {
		await harness?.stop()
	})

	it("is closed until `e`, and then owns the digits", async () => {
		assert.ok(!page.nodes.item.textContent.includes("t / T target"), "the composer must start closed")
		await page.press("e")
		assert.ok(page.nodes.item.textContent.includes("t / T target"), "`e` should open the composer")
		assert.ok(
			page.nodes.status.textContent.includes("digits pick swatches"),
			"the reviewer must be told the digits changed meaning",
		)
	})

	it("previews the composition in the same mock the sides are judged in", async () => {
		// It opens seeded from side A, so a preview is live immediately — always preview-before-submit.
		await waitFor(
			"the composer should render a live preview mock",
			() => page.nodes.item.byClass("mock").length === 3,
		)
		// The synthetic fixture palettes are not pixels of the real artwork, and the composer says so
		// while composing rather than only at submit time.
		await waitFor("the foreign-colour warning should be on screen", () =>
			page.nodes.item.textContent.includes("not pixels of this artwork"),
		)
	})

	it("walks the targets with `t` and fills each from the swatch grid with a digit", async () => {
		await setMode("flat")
		for (const [position, key] of ["1", "2", "3", "4"].entries()) {
			await page.press(key)
			assert.match(page.nodes.status.textContent, /#[0-9a-f]{6}/u, "the status line should name the picked colour")
			if (position < 3) await page.press("t")
		}
		await waitFor("the preview should stop warning once every colour comes from the artwork", () =>
			!page.nodes.item.textContent.includes("not pixels of this artwork"),
		)
	})

	it("endorses with `s`, recording exactly what was previewed", async () => {
		await page.press("s")
		await waitFor("the endorsement should be appended", () =>
			harness.records().some((record) => record.type === "endorsed-sample"),
		)
		const endorsed = harness.records().find((record) => record.type === "endorsed-sample") as EndorsedSampleRecord
		assert.equal(endorsed.itemId, "item-0")
		assert.equal(endorsed.palette.gradient, null, "the composition was flat when it was submitted")
		assert.equal(endorsed.paletteHash, hashPalette(endorsed.palette))
	})

	it("cycles flat / 2-stop / 3-stop, and a 3-stop endorsement records three stops", async () => {
		await setMode("3-stop")
		await waitFor("the preview should show a three-stop ramp", () =>
			page.nodes.item.byClass("swatches").some((node) => node.textContent.includes("gradient — 3 stops")),
		)
		await page.press("s")
		await waitFor("the second endorsement should be appended", () => {
			return harness.records().filter((record) => record.type === "endorsed-sample").length === 2
		})
		const endorsements = harness
			.records()
			.filter((record): record is EndorsedSampleRecord => record.type === "endorsed-sample")
		assert.equal(endorsements[1].palette.gradient?.stops.length, 3)
		// Editing a composition appends; it never rewrites the first one.
		assert.notEqual(endorsements[0].paletteHash, endorsements[1].paletteHash)
		assert.equal(harness.records().filter((record) => record.type === "amendment").length, 0)
	})

	it("closes on Esc and hands the digits back to the grade scale", async () => {
		await page.press("Escape")
		assert.ok(!page.nodes.item.textContent.includes("t / T target"))
		const endorsementsBefore = harness.records().filter((record) => record.type === "endorsed-sample").length
		await page.press("1")
		// The digit went to the grade scale: an incomplete verdict is refused by the page itself, and
		// no swatch was assigned.
		assert.match(page.nodes.status.textContent, /needs a grade for A, a grade for B, and a preference/u)
		assert.equal(harness.records().filter((record) => record.type === "endorsed-sample").length, endorsementsBefore)
	})
})

// The decoded-artwork cache is an optimization, not state: clear it so no other suite in this
// process can depend on it.
after(() => {
	clearImageColorCache()
})
