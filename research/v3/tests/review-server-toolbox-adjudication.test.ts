/*
 * The toolbox adjudication round, driven the way the reviewer drives it.
 *
 * **Why this file exists.** `PHASE_0_LOOSE_ENDS.md` L-i: "a review-UI page can crawl clean and be
 * key-dead, and nothing checks that it is not", revived by "any new review-UI page or interaction
 * mode is served to the reviewer". `verify-live` establishes that a module is SERVED; it cannot
 * establish that the module RUNS. `ground-freetext-1` loaded, rendered, crawled green and was
 * completely unresponsive to the keyboard.
 *
 * The page is a `round-kit.js` config, so the kit's own suite already covers fetch, keys,
 * navigation, undo, resume and release. What is asserted here is what the kit cannot know: that THIS
 * round's words reach the screen, that its stimulus is prose rather than the carrier image, and that
 * its four answers are the ones the fixture binds.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { batchReviewPaths } from "../src/review-server/server.ts"
import { call, openPage, startHarness, type FakePage, type Harness } from "../src/review-server/test-support.ts"
import {
	buildToolboxAdjudicationRound,
	framingFor,
	questionKeyFor,
	readAdjudicationItems,
	TOOLBOX_ADJUDICATION_BATCH_ID,
	TOOLBOX_ADJUDICATION_LABEL_SCHEMA_VERSION,
	TOOLBOX_ANSWERS,
	TOOLBOX_INSTRUCTION,
} from "../src/review-server/toolbox-adjudication.ts"

const PAGE = fileURLToPath(new URL("../review-ui/toolbox-adjudication.js", import.meta.url))
const MARKUP = fileURLToPath(new URL("../review-ui/toolbox-adjudication.html", import.meta.url))
const STYLESHEET = fileURLToPath(new URL("../review-ui/styles.css", import.meta.url))

/**
 * Every class name the stylesheet defines a rule for.
 *
 * The harness has no CSS engine, so a class that matches no rule renders identically here and
 * catastrophically in the browser — which is how the endorsement page's hotkey grid collapsed into a
 * run-on line with every assertion green.
 */
const STYLED_CLASSES = new Set(
	[...readFileSync(STYLESHEET, "utf8").matchAll(/\.([a-zA-Z][\w-]*)/gu)].map((match) => match[1]),
)

/** Every node the page names. A missing id here is a silent no-op on the real page. */
const NODE_IDS = ["question", "preamble", "instruction", "progress", "stage", "mapping", "pending", "status", "keymap"] as const

describe("the toolbox adjudication fixture", () => {
	it("asks one question per proposal, with the criterion, the description and my call on screen", async () => {
		const { fixture } = await buildToolboxAdjudicationRound()
		const items = await readAdjudicationItems()
		assert.equal(fixture.batchId, TOOLBOX_ADJUDICATION_BATCH_ID)
		assert.equal(fixture.labelSchemaVersion, TOOLBOX_ADJUDICATION_LABEL_SCHEMA_VERSION)
		assert.equal(fixture.items.length, items.length)
		assert.equal(fixture.questions.length, items.length)
		for (const question of fixture.questions) {
			assert.equal(question.kind, "enum")
			// REVIEW_UI.md §4, 2026-08-04: the round's own text states the answering CRITERION.
			assert.equal(question.instruction, TOOLBOX_INSTRUCTION)
			// The plain-language description, served from the fixture, so the words the reviewer read
			// travel with the answers.
			assert.ok(question.preamble && question.preamble.trim().length > 0, `${question.key} shows no description`)
			// Cost, phase and my recommendation are on screen while they answer — the recommendation
			// especially, because an unstated recommendation is one they cannot overrule.
			assert.match(question.framing ?? "", /^What it serves — .*\nWhat it costs — .*\nMy call — .*\nFrom — /su)
			// §4's escape answer exists and does not shadow undo.
			assert.deepEqual(
				question.answers.map((answer) => answer.hotkey),
				["1", "2", "3", "4"],
			)
			assert.ok(!question.answers.some((answer) => answer.hotkey === "u"), "an answer took the undo key")
		}
	})

	it("states each proposal once, in its own words", async () => {
		const { fixture } = await buildToolboxAdjudicationRound()
		const descriptions = new Set(fixture.questions.map((question) => question.preamble))
		assert.equal(descriptions.size, fixture.questions.length, "two items share a description")
		const items = await readAdjudicationItems()
		// The facts panel is the builder's string and nothing else composes it, so a change to either
		// side is a change to both.
		assert.equal(fixture.questions[0].framing, framingFor(items[0]))
		assert.equal(fixture.questions[0].preamble, items[0].plain)
	})

	it("points every item at the round's own carrier panel, not at an artwork", async () => {
		const { fixture } = await buildToolboxAdjudicationRound()
		// The push path decodes an image per item and there is no imageless shape. Borrowing an album
		// cover would write 42 rows claiming to be about an artwork they are not about.
		for (const item of fixture.items) {
			assert.match(item.imagePath, /toolbox-adjudication-carrier\.png$/u)
			assert.equal(item.collection, "review-round-assets")
		}
		assert.equal(new Set(fixture.items.map((item) => item.imageId)).size, 1)
	})

	it("is routed to its own page, because /oracle would draw the carrier panel", () => {
		const paths = batchReviewPaths({
			batchId: TOOLBOX_ADJUDICATION_BATCH_ID,
			kind: "oracle-validation",
			labelSchemaVersion: TOOLBOX_ADJUDICATION_LABEL_SCHEMA_VERSION,
		})
		assert.equal(paths.page, `/toolbox-adjudication?batch=${TOOLBOX_ADJUDICATION_BATCH_ID}`)
		assert.equal(paths.payload, `/api/oracle-validation/${TOOLBOX_ADJUDICATION_BATCH_ID}`)
	})
})

describe("the toolbox adjudication page, executing", () => {
	let harness: Harness
	let page: FakePage
	let itemCount = 0

	before(async () => {
		harness = await startHarness()
		const { fixture } = await buildToolboxAdjudicationRound()
		itemCount = fixture.items.length
		await harness.handle.service.pushOracleValidation(fixture, [])
		page = await openPage(
			harness.base,
			PAGE,
			NODE_IDS,
			`${harness.base}/toolbox-adjudication?batch=${TOOLBOX_ADJUDICATION_BATCH_ID}`,
		)
	})

	after(async () => {
		await harness?.stop()
	})

	it("gets past its loading state, on the first proposal", () => {
		assert.notEqual(page.nodes.question.textContent, "loading…", "STUCK: the page never left its loading state")
		assert.match(page.nodes.question.textContent, /^TB-01 — /u)
		assert.ok(page.nodes.preamble.textContent.length > 0, "no description on screen")
		assert.ok(page.nodes.instruction.textContent.length > 0, "no criterion on screen")
	})

	it("shows what the item serves, what it costs and my call — where the reviewer can overrule it", () => {
		const stage = page.stage()
		assert.equal(stage.byClass("round-text-panel").length, 1, "no facts panel")
		assert.match(stage.textContent, /What it serves — /u)
		assert.match(stage.textContent, /What it costs — /u)
		// The reviewer cannot overrule a recommendation they were never shown.
		assert.match(stage.textContent, /My call — build now: /u)
		assert.match(stage.textContent, /From — gap-scan/u)
	})

	it("never draws the carrier panel", () => {
		// The round's image is a flat grey rectangle that exists only because the push path needs one.
		// Drawing it would put a meaningless picture above a question about a tool.
		const images = page.stage().descendants().filter((node) => node.tagName === "img")
		assert.deepEqual(images, [], "the page rendered the carrier panel")
	})

	it("draws every element with a class the stylesheet actually styles", () => {
		const drawn = [...page.stage().descendants(), ...page.nodes.mapping.descendants()]
		const unstyled = new Set<string>()
		for (const node of drawn) {
			for (const token of node.className.split(" ").filter(Boolean)) {
				if (!STYLED_CLASSES.has(token)) unstyled.add(token)
			}
		}
		assert.deepEqual([...unstyled], [], "these classes match no rule in styles.css, so they render unstyled")
	})

	it("puts the four answers in the styled hotkey grid, and generates its own key hints", () => {
		assert.equal(page.nodes.mapping.byClass("oracle-map").length, TOOLBOX_ANSWERS.length)
		assert.match(page.nodes.mapping.textContent, /1.*build now/su)
		// The footer is generated from the same table the dispatcher reads, so it cannot advertise a key
		// the page has stopped binding — which is what the endorsement page's hand-written footer did.
		const markup = readFileSync(MARKUP, "utf8")
		const footer = markup.slice(markup.indexOf("<footer"))
		assert.doesNotMatch(footer, /<b>[a-z]<\/b>/u, "the footer hand-writes key names; they will drift from the bindings")
		assert.match(markup, /id="keymap"/u, "there is no node for the generated keymap")
		for (const expected of ["build now", "discuss", "undo one", "release when finished"]) {
			assert.ok(page.nodes.keymap.textContent.includes(expected), `the generated keymap never mentions "${expected}"`)
		}
	})

	it("moves between proposals WITHOUT answering", async () => {
		// The kit's directions, not this page's: `j` and `→` go forward, `k` and `←` go back, and the
		// footer is generated from the same table, so the two can never disagree.
		await page.press("j")
		assert.match(page.nodes.question.textContent, /^TB-02 — /u, "STUCK: j did not reach the second proposal")
		assert.match(page.nodes.progress.textContent, /· 0 done/u, "moving recorded an answer")
		await page.press("k")
		assert.match(page.nodes.question.textContent, /^TB-01 — /u, "k did not go back")
	})

	it("records an answer on its hotkey and advances", async () => {
		await page.press("1")
		assert.match(page.nodes.progress.textContent, /· 1 done/u, "STUCK: the answer key did not advance")
		assert.match(page.nodes.status.textContent, /recorded build_now/u)
	})

	it("answers on the AZERTY row too", async () => {
		// `é` is the key printed `2` on the reviewer's French Mac. Both rows answer everywhere.
		await page.press("é")
		assert.match(page.nodes.progress.textContent, /· 2 done/u)
		assert.match(page.nodes.status.textContent, /recorded defer/u)
	})

	it("steps back on undo and lets the ruling be replaced", async () => {
		await page.press("u")
		assert.match(page.nodes.status.textContent, /stepped back/u)
		// Undo deletes nothing: the answer stands until a new one supersedes it.
		assert.match(page.nodes.progress.textContent, /· 2 done/u)
		await page.press("4")
		assert.match(page.nodes.status.textContent, /recorded discuss/u)
	})

	it("records the escape answer as an ordinary answer, so its share is countable", async () => {
		const { body } = await call(harness.base, "GET", `/api/oracle-validation/${TOOLBOX_ADJUDICATION_BATCH_ID}`)
		const items = body.items as { questionKey: string; answer: string | null }[]
		const answers = new Map(items.map((item) => [item.questionKey, item.answer]))
		assert.equal(answers.get(questionKeyFor("TB-01")), "build_now")
		// The replacement stands, and the superseded answer is history rather than a live second row.
		assert.equal(answers.get(questionKeyFor("TB-02")), "discuss")
		assert.equal(items.filter((item) => item.answer !== null).length, 2, `of ${itemCount} items, only two are ruled`)
	})

	it("refuses to release while proposals are unruled, and says so", async () => {
		await page.press("r")
		assert.match(page.nodes.status.textContent, /refused|pending|unanswered/iu)
	})
})
