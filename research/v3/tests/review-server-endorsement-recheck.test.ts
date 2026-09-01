/*
 * The endorsement-recheck round, driven the way the reviewer drives it.
 *
 * **Why this file exists.** `PHASE_0_LOOSE_ENDS.md` L-i: "a review-UI page can crawl clean and be
 * key-dead, and nothing checks that it is not", whose revival condition is "any new review-UI page
 * or interaction mode is served to the reviewer — which is every round with a new answer shape".
 * This is such a round, so it pays the down payment the same way `/freetext` did: the page is
 * imported and executed, and every key it binds is pressed against a real server.
 *
 * `verify-live` establishes that a module is SERVED. It cannot establish that the module RUNS.
 * `/freetext` loaded, rendered, crawled green and was completely unresponsive to the keyboard, and
 * the reviewer was stuck on cover 1 with a working save path underneath. The assertions below are
 * the ones that would have caught that.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import {
	buildEndorsementRecheckFixture,
	ENDORSEMENT_RECHECK_BATCH_ID,
	ENDORSEMENT_RECHECK_LABEL_SCHEMA_VERSION,
	RECHECK_ANSWERS,
	RECHECK_ENTRY_IDS,
} from "../src/review-server/endorsement-recheck.ts"
import { batchReviewPaths } from "../src/review-server/server.ts"
import { call, openPage, startHarness, type FakePage, type Harness } from "../src/review-server/test-support.ts"

const PAGE = fileURLToPath(new URL("../review-ui/endorsement-recheck.js", import.meta.url))
const MARKUP = fileURLToPath(new URL("../review-ui/endorsement-recheck.html", import.meta.url))
const STYLESHEET = fileURLToPath(new URL("../review-ui/styles.css", import.meta.url))

/**
 * Every class name the stylesheet defines a rule for.
 *
 * The harness has no CSS engine, so a class that matches no rule renders identically here and
 * catastrophically in the browser — which is exactly what happened: the first revision of this page
 * invented `oracle-answer`, the footer lost its hotkey column, and the reviewer reported having "no
 * way to answer" while every assertion in this file passed. Reading the stylesheet is how the
 * harness is made to match the behaviour that broke.
 */
const STYLED_CLASSES = new Set(
	[...readFileSync(STYLESHEET, "utf8").matchAll(/\.([a-zA-Z][\w-]*)/gu)].map((match) => match[1]),
)

/** Every node the page writes to. A missing id here is a silent no-op on the real page. */
const NODE_IDS = [
	"failure-label",
	"preamble",
	"framing",
	"question",
	"instruction",
	"progress",
	"stage",
	"mapping",
	"status",
] as const

describe("the endorsement-recheck fixture", () => {
	it("carries both endorsements, one question each, with the criterion and the failure line on screen", async () => {
		const { fixture, pageData } = await buildEndorsementRecheckFixture()
		assert.equal(fixture.batchId, ENDORSEMENT_RECHECK_BATCH_ID)
		assert.equal(fixture.labelSchemaVersion, ENDORSEMENT_RECHECK_LABEL_SCHEMA_VERSION)
		assert.equal(fixture.items.length, RECHECK_ENTRY_IDS.length)
		for (const question of fixture.questions) {
			assert.equal(question.kind, "enum")
			// REVIEW_UI.md §4, 2026-08-04: the round's own text states the answering CRITERION.
			assert.ok(question.instruction.length > 0, `${question.key} states no criterion`)
			// The plain-language statement of what newly fails. It is served from the fixture, so the
			// words the reviewer read travel with the answers.
			assert.ok(question.preamble && question.preamble.length > 0, `${question.key} shows no failure line`)
			assert.match(question.preamble, /2026-08-04/u, `${question.key} does not say which ruling moved`)
			// §4's escape answer must exist and must not shadow undo.
			assert.deepEqual(
				question.answers.map((answer) => answer.hotkey),
				["1", "2", "3"],
			)
			assert.ok(!question.answers.some((answer) => answer.hotkey === "u"), "an answer took the undo key")
		}
		// Every palette the page must draw is joinable on the one field the payload serves.
		const keys = new Set(pageData.items.map((item) => item.questionKey))
		for (const item of fixture.items) assert.ok(keys.has(item.questionKey), `no palette for ${item.questionKey}`)
	})

	it("refuses to build if either palette stops failing", async () => {
		// Not a behaviour test — a statement that the builder re-derives the failure from the contract
		// rather than restating it. `describeFailure` throws when a floor moves under it, so a round
		// cannot outlive the ruling it adjudicates. Building at all is the assertion.
		await assert.doesNotReject(buildEndorsementRecheckFixture())
	})

	it("is routed to its own page, because /oracle renders no palette", () => {
		const paths = batchReviewPaths({
			batchId: ENDORSEMENT_RECHECK_BATCH_ID,
			kind: "oracle-validation",
			labelSchemaVersion: ENDORSEMENT_RECHECK_LABEL_SCHEMA_VERSION,
		})
		assert.equal(paths.page, `/endorsement-recheck?batch=${ENDORSEMENT_RECHECK_BATCH_ID}`)
		assert.equal(paths.payload, `/api/oracle-validation/${ENDORSEMENT_RECHECK_BATCH_ID}`)
	})
})

describe("the endorsement-recheck page, executing", () => {
	let harness: Harness
	let page: FakePage
	/** The opaque per-push tokens, so the id-line test can prove none of them is used as a handle. */
	let answerTokens: string[] = []

	before(async () => {
		harness = await startHarness()
		const { fixture } = await buildEndorsementRecheckFixture()
		await harness.handle.service.pushOracleValidation(fixture, [])
		const { body } = await call(harness.base, "GET", `/api/oracle-validation/${ENDORSEMENT_RECHECK_BATCH_ID}`)
		answerTokens = (body.items as { token: string }[]).map((item) => item.token)
		page = await openPage(
			harness.base,
			PAGE,
			NODE_IDS,
			`${harness.base}/endorsement-recheck?batch=${ENDORSEMENT_RECHECK_BATCH_ID}`,
		)
	})

	after(async () => {
		await harness?.stop()
	})

	it("gets past its loading state, on the first palette", () => {
		assert.notEqual(page.nodes.question.textContent, "loading…", "STUCK: the page never left its loading state")
		assert.match(page.nodes.question.textContent, /endorsement/iu)
		assert.match(page.nodes.progress.textContent, /^0 of 2 answered/u)
		// The criterion and the failure line are both on screen while the reviewer answers.
		assert.ok(page.nodes.instruction.textContent.length > 0, "no criterion on screen")
		assert.match(page.nodes.preamble.textContent, /2026-08-04/u)
	})

	it("shows the per-item failure line, labelled and set apart from the chrome, on BOTH palettes", async () => {
		const markup = readFileSync(MARKUP, "utf8")
		// Every class in the markup has to be a real rule too — the harness builds its nodes from ids
		// alone, so a class named only in the HTML is never seen by any other assertion here.
		for (const match of markup.matchAll(/class="([^"]+)"/gu)) {
			for (const token of match[1].split(" ").filter(Boolean)) {
				assert.ok(STYLED_CLASSES.has(token), `${token} is in the markup but matches no rule in styles.css`)
			}
		}
		const preamble = /<p id="preamble"[^>]*class="([^"]+)"/u.exec(markup)
		assert.ok(preamble, "no #preamble element in the markup")
		// The regression, in one line: `.oracle-preamble` is the class every OTHER round uses for a
		// STANDING preamble — identical on every item, read once, skimmed thereafter. A per-item
		// explanation drawn in it reads as chrome, and the reviewer reported not finding it at all:
		// "i don't know what the failure is on each artwork, so i cannot answer."
		assert.ok(
			!preamble[1].split(" ").includes("oracle-preamble"),
			"the failure line is drawn as a standing preamble again — the reviewer will skim past it",
		)

		// And it reaches the screen, under its label, on both palettes.
		assert.match(page.nodes["failure-label"].textContent, /what newly fails/iu)
		assert.match(page.nodes.preamble.textContent, /separation floor/u, "palette 1's failure line is not on screen")
		await page.press("k")
		assert.match(page.nodes["failure-label"].textContent, /what newly fails/iu)
		assert.match(page.nodes.preamble.textContent, /luminance contrast/u, "palette 2's failure line is not on screen")
		await page.press("j")
	})

	it("renders the real mock player, not a bare artwork", () => {
		const stage = page.stage()
		// `mock.js` is the single renderer; these are its classes. A page that drew its own palette
		// would produce a surface no verdict has ever been scoped to.
		assert.equal(stage.byClass("mock").length, 1, "no mock player on the judging surface")
		assert.equal(stage.byClass("mock-art").length, 1, "the artwork is not in the mock")
		assert.ok(stage.byClass("mock-card").length > 0, "no surface card — the accent has no surface context")
		// Swatches under the mock: the identity check REVIEW_UI.md §3 requires alongside it.
		assert.ok(stage.byClass("swatches").length > 0, "no swatches under the mock")
		// Every colour is named, never hex alone (CONVENTIONS.md).
		assert.match(stage.textContent, /Polar Bear in a Blizzard|Toile/u)
	})

	it("draws every element with a class the stylesheet actually styles", () => {
		// The reviewer-facing failure this file exists to prevent, generalised: an invented class name
		// is invisible to a textContent assertion and fatal on screen.
		const drawn = [...page.stage().descendants(), ...page.nodes.mapping.descendants()]
		const unstyled = new Set<string>()
		for (const node of drawn) {
			for (const token of node.className.split(" ").filter(Boolean)) {
				if (!STYLED_CLASSES.has(token)) unstyled.add(token)
			}
		}
		assert.deepEqual([...unstyled], [], "these classes match no rule in styles.css, so they render unstyled")
	})

	it("shows a copyable id line naming the round, the question and the endorsement hash", () => {
		// "IDs that I can copy paste to you to give feedback about a specific item" — so all three
		// parts have to be ON SCREEN, not merely in the payload. The class-vs-stylesheet guard above
		// separately proves `oracle-item-id` is really styled.
		const line = page.stage().byClass("oracle-item-id")
		assert.equal(line.length, 1, "no id line on the item")
		assert.match(line[0].textContent, new RegExp(ENDORSEMENT_RECHECK_BATCH_ID, "u"))
		assert.match(line[0].textContent, new RegExp(`endorsement_recheck_${RECHECK_ENTRY_IDS[0]}`, "u"))
		assert.match(line[0].textContent, new RegExp(RECHECK_ENTRY_IDS[0], "u"))
		// The answer token is regenerated on every push, so it must never be offered as a handle.
		for (const token of answerTokens) {
			assert.ok(!line[0].textContent.includes(token), "the id line offers the per-push answer token")
		}
	})

	it("puts the answer keys in the styled hotkey grid, not a run-on line", () => {
		const rows = page.nodes.mapping.byClass("oracle-map")
		assert.equal(rows.length, 3, "the three answers are not in the styled mapping grid")
		// The hotkey is its own element, which is what gives it the grid's 1.5em column.
		assert.match(page.nodes.mapping.textContent, /1.*keep the endorsement/su)
	})

	it("advertises every key it binds in the markup, so the affordance survives a dead fetch", () => {
		const footer = readFileSync(MARKUP, "utf8")
		for (const key of ["1", "2", "3", "j", "k", "u", "r"]) {
			assert.match(footer, new RegExp(`<b>${key}</b>`, "u"), `the footer never mentions the ${key} key`)
		}
	})

	it("moves to the second palette WITHOUT answering the first", async () => {
		// The reviewer's exact words: "nor does it have a way for me to go to the 2nd palette". Before
		// the fix, `index` advanced only inside answer(), so this was unreachable.
		assert.match(page.nodes.progress.textContent, /^0 of 2 answered/u)
		await page.press("k")
		assert.match(page.nodes.status.textContent, /palette 2 of 2/u, "STUCK: k did not reach the second palette")
		assert.match(page.nodes.preamble.textContent, /accent/iu, "the second palette's failure line is not on screen")
		// Nothing was recorded by moving.
		assert.match(page.nodes.progress.textContent, /^0 of 2 answered/u, "moving recorded an answer")
		await page.press("j")
		assert.match(page.nodes.status.textContent, /palette 1 of 2/u, "j did not go back")
	})

	it("records an answer on its hotkey and advances", async () => {
		await page.press(RECHECK_ANSWERS[0].hotkey)
		assert.match(page.nodes.progress.textContent, /^1 of 2 answered/u, "STUCK: the answer key did not advance")
		assert.match(page.nodes.status.textContent, /recorded keep_the_endorsement/u)
	})

	it("answers the second palette on the AZERTY row too", async () => {
		// `é` is the key printed `2` on the reviewer's French Mac. Both rows answer everywhere.
		await page.press("é")
		assert.match(page.nodes.progress.textContent, /^2 of 2 answered/u)
		assert.match(page.nodes.status.textContent, /recorded the_rule_is_right/u)
	})

	it("steps back on undo and lets the answer be replaced", async () => {
		await page.press("u")
		assert.match(page.nodes.status.textContent, /stepped back/u)
		// Undo deletes nothing: the answer is still standing until a new one supersedes it.
		assert.match(page.nodes.progress.textContent, /^2 of 2 answered/u)
		await page.press(RECHECK_ANSWERS[2].hotkey)
		assert.match(page.nodes.status.textContent, /recorded cant_tell/u)
	})

	it("records the escape answer as an ordinary answer, so its share is countable", async () => {
		const { body } = await call(harness.base, "GET", `/api/oracle-validation/${ENDORSEMENT_RECHECK_BATCH_ID}`)
		const items = body.items as { questionKey: string; answer: string | null }[]
		const answers = new Map(items.map((item) => [item.questionKey, item.answer]))
		assert.equal(answers.get(`endorsement_recheck_${RECHECK_ENTRY_IDS[0]}`), "keep_the_endorsement")
		// The replacement stands, and the superseded answer is history rather than a live second row.
		assert.equal(answers.get(`endorsement_recheck_${RECHECK_ENTRY_IDS[1]}`), "cant_tell")
	})

	it("releases on r", async () => {
		await page.press("r")
		assert.match(page.nodes.status.textContent, /released at/u)
	})
})
