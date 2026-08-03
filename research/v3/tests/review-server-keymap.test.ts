/**
 * The keyboard, on the keyboard the reviewer actually has.
 *
 * The reviewer works on a French Mac (AZERTY), where the unshifted digit row sends `&é"'(§è!çà`
 * rather than `1234567890`. Every review page binds digits somewhere — grades on the pairwise and
 * calibration pages, swatches in the composer, closed vocabularies in oracle validation — so on that
 * keyboard every one of those bindings needed a modifier held down. Their words, 2026-08-03:
 *
 *   "we should accept keys &é\"'(§è!çà mapped to 1234567890 (in order)"
 *
 * Two things are asserted here, and the second is the one that will still matter in a year:
 *
 *  1. **The mapping is right, in order.** An off-by-one in a digit map is invisible in every other
 *     test and writes a grade or a closed-vocabulary answer nobody gave.
 *  2. **It collides with nothing.** Four of the ten characters are letters (`é è ç à`), which is
 *     exactly how a keymap quietly steals a binding. The check reads the *page sources* for their
 *     literal key bindings rather than a list someone remembered to update.
 *
 * The pages are driven through their real modules against the real server, as everywhere else here.
 */
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import type { OracleLabelRecord, VerdictRecord } from "../src/warehouse/records.ts"
import { GROUND_TYPE_QUESTION } from "../src/review-server/oracle-validation.ts"
import { seedOracleValidationRound } from "../src/review-server/server.ts"
import {
	call,
	makeBatch,
	openPage,
	startHarness,
	TEST_IMAGES,
	type FakePage,
	type Harness,
} from "../src/review-server/test-support.ts"
// The module under test is the one the browser loads: same file, same path, no copy.
import { AZERTY_DIGIT_ROW, DIGIT_ROW, RESERVED_LETTER_KEYS, digitFor, normalizeKey } from "../review-ui/keys.js"

const UI_ROOT = new URL("../review-ui/", import.meta.url)
const APP_PAGE = fileURLToPath(new URL("app.js", UI_ROOT))
const CALIBRATION_PAGE = fileURLToPath(new URL("calibration.js", UI_ROOT))
const ORACLE_PAGE = fileURLToPath(new URL("oracle.js", UI_ROOT))

const PAIRWISE_NODE_IDS = ["batch-line", "item-nav", "prev", "next", "release", "release-note", "item", "status"] as const
const ORACLE_NODE_IDS = ["preamble", "framing", "question", "instruction", "progress", "mapping", "stage", "undokey", "status"] as const

/** The reviewer's sequence, verbatim. If this literal is ever edited, it is a new reviewer decision. */
const REVIEWER_SEQUENCE = "&é\"'(§è!çà"

describe("the shared keymap", () => {
	it("maps the reviewer's sequence to 1234567890, in order", () => {
		assert.equal(AZERTY_DIGIT_ROW.join(""), REVIEWER_SEQUENCE)
		assert.deepEqual(DIGIT_ROW, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"])
		for (const [index, key] of AZERTY_DIGIT_ROW.entries()) {
			assert.equal(digitFor(key), DIGIT_ROW[index], `${key} should answer as ${DIGIT_ROW[index]}`)
		}
		// Spelled out once, so a reordering of either array cannot pass by agreeing with itself.
		assert.equal(digitFor("&"), "1")
		assert.equal(digitFor("é"), "2")
		assert.equal(digitFor('"'), "3")
		assert.equal(digitFor("'"), "4")
		assert.equal(digitFor("("), "5")
		assert.equal(digitFor("§"), "6")
		assert.equal(digitFor("è"), "7")
		assert.equal(digitFor("!"), "8")
		assert.equal(digitFor("ç"), "9")
		assert.equal(digitFor("à"), "0")
	})

	it("leaves every other key exactly as it was", () => {
		for (const digit of DIGIT_ROW) assert.equal(digitFor(digit), digit, "a digit stands for itself")
		for (const key of ["a", "b", "n", "T", "t", "Escape", "ArrowLeft", "Backspace", "F1", " "]) {
			assert.equal(digitFor(key), null)
			assert.equal(normalizeKey(key), key)
		}
		// `T` and `t` are different bindings in the composer, and nothing here may fold them together.
		assert.notEqual(normalizeKey("T"), normalizeKey("t"))
		assert.equal(digitFor(undefined as unknown as string), null)
	})

	it("collides with no key any page binds — read from the pages themselves", async () => {
		const pages = ["app.js", "calibration.js", "amend.js", "composer.js", "oracle.js", "bracketing.js", "oracle-review.js"]
		const bound = new Set<string>()
		for (const page of pages) {
			const source = await readFile(fileURLToPath(new URL(page, UI_ROOT)), "utf8")
			// Every literal the pages compare a key against: `key === "x"`, and the object-literal grade
			// maps (`{ 1: "strong", … }`) are digits by construction and covered by the mapping test.
			for (const match of source.matchAll(/key === "([^"]+)"/gu)) bound.add(match[1])
			for (const match of source.matchAll(/hotkey === "([^"]+)"/gu)) bound.add(match[1])
		}
		assert.ok(bound.size > 10, `only found ${bound.size} key bindings; the scan is probably not matching`)
		for (const key of AZERTY_DIGIT_ROW) {
			assert.ok(!bound.has(key), `${key} is both a digit-row key and a page binding — one of them will lose`)
		}
		// The hand-written list in keys.js is what a reader consults; keep it honest against the scan.
		for (const key of bound) {
			if (key.length !== 1 || !/\p{L}/u.test(key)) continue
			assert.ok(RESERVED_LETTER_KEYS.includes(key), `${key} is bound by a page but missing from RESERVED_LETTER_KEYS`)
		}
	})
})

describe("the pages answer on both digit rows", () => {
	let harness: Harness

	before(async () => {
		harness = await startHarness()
	})

	after(async () => {
		await harness?.stop()
	})

	it("serves the keymap as a module, so every page gets the same one", async () => {
		const served = await call(harness.base, "GET", "/keys.js")
		assert.equal(served.status, 200)
		assert.ok(String(served.body).includes(REVIEWER_SEQUENCE.slice(0, 2)), "the served file is not the keymap")
	})

	it("grades both sides from the AZERTY row on the pairwise page", async () => {
		await call(harness.base, "POST", "/api/batches", makeBatch("azerty-pairwise", 1))
		const page = await openPage(harness.base, APP_PAGE, PAIRWISE_NODE_IDS, `${harness.base}/?batch=azerty-pairwise`)
		// `&` is the key printed `1` — grade A strong. `è` is the key printed `7` — grade B acceptable.
		await page.press("&")
		await page.press("è")
		for (let attempt = 0; attempt < 200 && harness.records().length === 0; attempt++) {
			await new Promise((done) => setTimeout(done, 5))
		}
		const verdict = harness.records().find((record): record is VerdictRecord => record.type === "verdict")
		assert.ok(verdict !== undefined, "no verdict was written from the AZERTY keys")
		assert.equal(verdict.gradeA, "strong")
		assert.equal(verdict.gradeB, "acceptable")
	})

	it("assigns a swatch from the AZERTY row inside the composer", async () => {
		await call(harness.base, "POST", "/api/batches", makeBatch("azerty-composer", 1))
		const page = await openPage(harness.base, APP_PAGE, PAIRWISE_NODE_IDS, `${harness.base}/?batch=azerty-composer`)
		await page.press("e")
		// The grid is a round trip to the server (the artwork is decoded there, at full resolution), so
		// wait for it the way the reviewer does: until swatches are on screen.
		for (let attempt = 0; attempt < 300 && page.nodes.item.byClass("composer-swatch").length === 0; attempt++) {
			await new Promise((done) => setTimeout(done, 5))
		}
		// The digits address the swatch grid while the composer is open. `é` is the key printed `2`, so
		// it must pick the same swatch `2` does — read off the status line, which names the colour.
		await page.press("é")
		const viaAzerty = page.nodes.status.textContent
		assert.match(viaAzerty, /#[0-9a-f]{6}/u, "the AZERTY digit did not reach the swatch grid")
		const colors = await call(harness.base, "GET", "/api/batches/azerty-composer/items/item-0/colors")
		assert.ok(viaAzerty.includes(colors.body.swatches[1].hex), "é must pick swatch 2, not another one")
	})

	it("grades from the AZERTY row on the calibration page", async () => {
		const batchId = "azerty-calibration"
		await call(harness.base, "POST", "/api/calibration", {
			batchId,
			purpose: "calibration",
			fundedBy: [],
			items: [
				{
					itemId: "cal-0",
					imagePath: TEST_IMAGES[0],
					variantId: "CALIBRATION-VARIANT-SECRET",
					fingerprint: {
						algorithmVersion: "cal-algo",
						preprocessingVersion: "pp-1",
						gitCommit: "0".repeat(40),
						dirty: false,
					},
					palette: {
						background: "#101010",
						surface: "#202020",
						foreground: "#f0f0f0",
						accent: "#c04040",
						gradient: null,
						surfaceCollapsed: false,
						accentCollapsed: false,
					},
				},
			],
		})
		const page = await openPage(harness.base, CALIBRATION_PAGE, PAIRWISE_NODE_IDS, `${harness.base}/calibration?batch=${batchId}`)
		// `'` is the key printed `4` — unacceptable, the grade furthest from a default.
		await page.press("'")
		for (let attempt = 0; attempt < 200; attempt++) {
			if (harness.records().some((record) => record.type === "verdict" && record.batch?.id === batchId)) break
			await new Promise((done) => setTimeout(done, 5))
		}
		const verdict = harness
			.records()
			.find((record): record is VerdictRecord => record.type === "verdict" && record.batch?.id === batchId)
		assert.ok(verdict !== undefined, "no calibration verdict was written from the AZERTY key")
		assert.equal(verdict.mode, "absolute")
		assert.equal(verdict.gradeA, "unacceptable")
	})

	it("answers a closed vocabulary from the AZERTY row on the oracle page", async () => {
		const oracleHarness = await startHarness()
		try {
			await seedOracleValidationRound(oracleHarness.handle.service)
			const page: FakePage = await openPage(oracleHarness.base, ORACLE_PAGE, ORACLE_NODE_IDS)
			// `(` is the key printed `5`, and the vocabulary binds `5` to one specific answer. The
			// expectation is read from the fixture, so it cannot drift with the question's wording.
			const expected = GROUND_TYPE_QUESTION.answers.find((answer) => answer.hotkey === "5")
			assert.ok(expected !== undefined, "the fixture question should bind 5")
			assert.ok(page.nodes.mapping.textContent.includes(expected.label), "the mapping is not on screen")
			await page.press("(")
			const label = oracleHarness
				.records()
				.find((record): record is OracleLabelRecord => record.type === "oracle-label")
			assert.ok(label !== undefined, "no oracle label was written from the AZERTY key")
			assert.equal(label.answer, expected.key, "( wrote an answer the key 5 is not bound to")
			assert.match(page.nodes.progress.textContent, /^2 \/ 30/u, "the page did not auto-advance")
		} finally {
			await oracleHarness.stop()
		}
	})
})
