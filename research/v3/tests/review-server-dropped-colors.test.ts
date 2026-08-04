/*
 * The dropped-colours round, driven the way the reviewer drives it.
 *
 * **Why this file exists.** `PHASE_0_LOOSE_ENDS.md` L-i: "a review-UI page can crawl clean and be
 * key-dead, and nothing checks that it is not", whose revival condition is "any new review-UI page
 * or interaction mode is served to the reviewer — which is every round with a new answer shape".
 * This round has a new page AND a new answer vocabulary, so it pays the down payment the same way
 * `/freetext` and `/endorsement-recheck` did: the page is imported and executed, and every key it
 * binds is pressed against a real server.
 *
 * `verify-live` establishes that a module is SERVED. It cannot establish that the module RUNS.
 * `/freetext` loaded, rendered, crawled green and was completely unresponsive to the keyboard. The
 * assertions below are the ones that would have caught that.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import { SOURCE_POPULATION_FLOOR } from "../src/contract/constants.ts"
import {
	buildDroppedColorsFixture,
	DROPPED_COLORS_ANSWERS,
	DROPPED_COLORS_BATCH_ID,
	DROPPED_COLORS_ITEM_BUDGET,
	DROPPED_COLORS_LABEL_SCHEMA_VERSION,
	selectAcrossMargin,
} from "../src/review-server/dropped-colors.ts"
import { ITEM_FIELD_ALLOWLIST } from "../src/review-server/round-kit.ts"
import { batchReviewPaths } from "../src/review-server/server.ts"
import { call, openPage, startHarness, type FakePage, type Harness } from "../src/review-server/test-support.ts"

const PAGE = fileURLToPath(new URL("../review-ui/dropped-colors.js", import.meta.url))
const MARKUP = fileURLToPath(new URL("../review-ui/dropped-colors.html", import.meta.url))
const STYLESHEET = fileURLToPath(new URL("../review-ui/styles.css", import.meta.url))

/**
 * Every class name the stylesheet defines a rule for.
 *
 * The harness has no CSS engine, so a class that matches no rule renders identically here and
 * catastrophically in the browser — which is exactly what happened to the recheck page's first
 * revision: it invented `oracle-answer`, the footer lost its hotkey column, and the reviewer
 * reported having "no way to answer" while every other assertion passed.
 */
const STYLED_CLASSES = new Set(
	[...readFileSync(STYLESHEET, "utf8").matchAll(/\.([a-zA-Z][\w-]*)/gu)].map((match) => match[1]),
)

/** Every node the page writes to. A missing id here is a silent no-op on the real page. */
const NODE_IDS = ["preamble", "framing", "question", "instruction", "progress", "stage", "mapping", "status"] as const

describe("the dropped-colours selection", () => {
	it("spans the margin including both endpoints, rather than taking the worst n", () => {
		const sorted = Array.from({ length: 53 }, (_, at) => at)
		const picked = selectAcrossMargin(sorted, 20)
		assert.equal(picked.length, 20)
		assert.equal(picked[0], 0, "the shallowest failure is not in the round")
		assert.equal(picked.at(-1), 52, "the deepest failure is not in the round")
		// Strictly increasing: a stride that repeated an item would quietly shrink the round.
		for (let at = 1; at < picked.length; at += 1) {
			assert.ok(picked[at] > picked[at - 1], `the stride repeated at ${at}`)
		}
	})

	it("returns everything when the population is smaller than the budget", () => {
		assert.deepEqual(selectAcrossMargin([1, 2, 3], 20), [1, 2, 3])
	})
})

describe("the dropped-colours fixture", () => {
	it("asks one question per colour, with the criterion and the drop line on screen", async () => {
		const { fixture, pageData } = await buildDroppedColorsFixture()
		assert.equal(fixture.batchId, DROPPED_COLORS_BATCH_ID)
		assert.equal(fixture.labelSchemaVersion, DROPPED_COLORS_LABEL_SCHEMA_VERSION)
		assert.equal(fixture.items.length, DROPPED_COLORS_ITEM_BUDGET)
		assert.equal(fixture.questions.length, DROPPED_COLORS_ITEM_BUDGET)

		for (const question of fixture.questions) {
			assert.equal(question.kind, "enum")
			// REVIEW_UI.md §4, 2026-08-04: the round's own text states the answering CRITERION. Here the
			// criterion has one job — separate "is it in the artwork" from "does it belong".
			assert.ok(question.instruction.length > 0, `${question.key} states no criterion`)
			assert.match(question.instruction, /belongs/u, `${question.key}'s criterion never says "belongs"`)
			// The drop line: which colour, and the two numbers behind it.
			assert.ok(question.preamble && question.preamble.length > 0, `${question.key} shows no drop line`)
			assert.match(question.preamble, /would drop/u, `${question.key} does not say what would be dropped`)
			assert.match(question.preamble, /#[0-9a-f]{6}/u, `${question.key} names no hex`)
			assert.match(question.preamble, /% of the artwork/u, `${question.key} quotes no population`)
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

	it("shows a whole palette per item, with the dropped colour among its roles", async () => {
		const { pageData } = await buildDroppedColorsFixture()
		for (const item of pageData.items) {
			assert.ok(item.side.roles.length >= 2, `${item.questionKey} draws fewer than two roles`)
			const hexes = item.side.roles.map((role) => role.hex)
			assert.ok(hexes.includes(item.droppedHex), `${item.droppedHex} is not among the roles drawn`)
			// Every colour the reviewer sees is named (CONVENTIONS.md, REVIEW_UI.md §3).
			for (const role of item.side.roles) assert.ok(role.name.length > 0, `${role.hex} is unnamed`)
			assert.ok(item.droppedName.length > 0, "the dropped colour is unnamed")
			// `fieldCss` is pasted, never composed — a flat field is one hex and nothing else.
			assert.match(item.side.fieldCss, /^#[0-9a-f]{6}$/u, "fieldCss was composed rather than pasted")
		}
	})

	it("only asks about colours that really do still fail the floor", async () => {
		const { pageData } = await buildDroppedColorsFixture()
		for (const item of pageData.items) {
			assert.ok(
				item.measurements.neighbourhoodShare < SOURCE_POPULATION_FLOOR,
				`${item.droppedHex} does not fail the neighbourhood rule — the round's premise has moved`,
			)
			// The exact-triple share is shown alongside, because the difference between the two is the
			// whole of B1's argument.
			assert.ok(item.measurements.exactShare >= 0, `${item.droppedHex} has no exact-triple measurement`)
		}
	})

	it("refuses to build if a colour stops failing", async () => {
		// Not a behaviour test — a statement that the builder re-derives every displayed number from
		// the artwork's pixels rather than trusting the study file. `buildDroppedColorsFixture` throws
		// when a selected colour clears the floor, so the round cannot outlive its premise. Building at
		// all is the assertion.
		await assert.doesNotReject(buildDroppedColorsFixture())
	})

	it("records the role as the stratum, which is the axis the study found the rule biased on", async () => {
		const { fixture } = await buildDroppedColorsFixture()
		for (const item of fixture.items) {
			assert.ok(item.stratum && item.stratum.length > 0, `${item.itemId} carries no stratum`)
			assert.match(item.stratum, /background|surface|foreground|accent/u)
		}
	})

	it("is routed to its own page, because /oracle renders no palette", () => {
		const paths = batchReviewPaths({
			batchId: DROPPED_COLORS_BATCH_ID,
			kind: "oracle-validation",
			labelSchemaVersion: DROPPED_COLORS_LABEL_SCHEMA_VERSION,
		})
		assert.equal(paths.page, `/dropped-colors?batch=${DROPPED_COLORS_BATCH_ID}`)
		assert.equal(paths.payload, `/api/oracle-validation/${DROPPED_COLORS_BATCH_ID}`)
	})
})

describe("the dropped-colours page, executing", () => {
	let harness: Harness
	let page: FakePage

	before(async () => {
		harness = await startHarness()
		const { fixture } = await buildDroppedColorsFixture()
		await harness.handle.service.pushOracleValidation(fixture, [])
		page = await openPage(harness.base, PAGE, NODE_IDS, `${harness.base}/dropped-colors?batch=${DROPPED_COLORS_BATCH_ID}`)
	})

	after(async () => {
		await harness?.stop()
	})

	it("gets past its loading state, on the first colour", () => {
		assert.notEqual(page.nodes.question.textContent, "loading…", "STUCK: the page never left its loading state")
		assert.match(page.nodes.question.textContent, /belong/iu)
		assert.match(page.nodes.progress.textContent, new RegExp(`^0 of ${DROPPED_COLORS_ITEM_BUDGET} answered`, "u"))
		// The criterion and the drop line are both on screen while the reviewer answers.
		assert.ok(page.nodes.instruction.textContent.length > 0, "no criterion on screen")
		assert.match(page.nodes.preamble.textContent, /would drop/u, "the drop line is not on screen")
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
	})

	it("calls out the colour under question, by name and hex, with its measurements", () => {
		const stage = page.stage()
		assert.match(stage.textContent, /would be dropped/u, "the colour under question is not called out")
		assert.match(stage.textContent, /#[0-9a-f]{6}/u, "no hex on the judging surface")
		assert.match(stage.textContent, /nearest artwork colour mode/u, "the mode comparison is not shown")
		assert.match(stage.textContent, /away in OKLab/u, "the mode distance is not shown")
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

	it("puts the answer keys in the styled hotkey grid, not a run-on line", () => {
		const rows = page.nodes.mapping.byClass("oracle-map")
		assert.equal(rows.length, 3, "the three answers are not in the styled mapping grid")
		assert.match(page.nodes.mapping.textContent, /1.*belongs/su)
	})

	it("advertises every key it binds in the markup, so the affordance survives a dead fetch", () => {
		const footer = readFileSync(MARKUP, "utf8")
		for (const key of ["1", "2", "3", "j", "k", "u", "r"]) {
			assert.match(footer, new RegExp(`<b>${key}</b>`, "u"), `the footer never mentions the ${key} key`)
		}
	})

	it("moves between colours WITHOUT answering", async () => {
		assert.match(page.nodes.progress.textContent, new RegExp(`^0 of ${DROPPED_COLORS_ITEM_BUDGET} answered`, "u"))
		await page.press("k")
		assert.match(page.nodes.status.textContent, /colour 2 of/u, "STUCK: k did not reach the second colour")
		assert.match(page.nodes.progress.textContent, new RegExp(`^0 of ${DROPPED_COLORS_ITEM_BUDGET} answered`, "u"), "moving recorded an answer")
		await page.press("j")
		assert.match(page.nodes.status.textContent, /colour 1 of/u, "j did not go back")
	})

	it("records 'belongs' on its hotkey and advances", async () => {
		await page.press(DROPPED_COLORS_ANSWERS[0].hotkey)
		assert.match(page.nodes.progress.textContent, /^1 of /u, "STUCK: the answer key did not advance")
		assert.match(page.nodes.status.textContent, /recorded belongs/u)
	})

	it("records 'does not belong' from the AZERTY row too", async () => {
		// `é` is the key printed `2` on the reviewer's French Mac. Both rows answer everywhere.
		await page.press("é")
		assert.match(page.nodes.progress.textContent, /^2 of /u)
		assert.match(page.nodes.status.textContent, /recorded does_not_belong/u)
	})

	it("steps back on undo and lets the answer be replaced", async () => {
		await page.press("u")
		assert.match(page.nodes.status.textContent, /stepped back/u)
		// Undo deletes nothing: the answer is still standing until a new one supersedes it.
		assert.match(page.nodes.progress.textContent, /^2 of /u)
		await page.press(DROPPED_COLORS_ANSWERS[2].hotkey)
		assert.match(page.nodes.status.textContent, /recorded cant_tell/u)
	})

	it("records the escape answer as an ordinary answer, so its share is countable", async () => {
		const { body } = await call(harness.base, "GET", `/api/oracle-validation/${DROPPED_COLORS_BATCH_ID}`)
		const items = body.items as { questionKey: string; answer: string | null }[]
		const answered = items.filter((item) => item.answer !== null)
		assert.equal(answered.length, 2, "the replacement did not supersede in place")
		assert.deepEqual(
			answered.map((item) => item.answer).sort(),
			["belongs", "cant_tell"],
			"the superseded answer is still standing as a live row",
		)
	})

	it("serves only allowlisted item fields, and leaks none of this round's own priors", async () => {
		// The live-payload key smoke, as a test rather than a curl. Asserted against the server's OWN
		// `ITEM_FIELD_ALLOWLIST` rather than a remembered list of key names: the notes that recorded
		// this check quote a seven-key set, and the live payload now serves eight (`itemRef` was added
		// 2026-08-04 so the reviewer can name the item they are reporting on). A test that pinned the
		// remembered list would fail on a deliberate change and teach everyone to edit the assertion.
		const { body } = await call(harness.base, "GET", `/api/oracle-validation/${DROPPED_COLORS_BATCH_ID}`)
		const items = body.items as Record<string, unknown>[]
		assert.equal(items.length, DROPPED_COLORS_ITEM_BUDGET)
		const allowed = new Set<string>(ITEM_FIELD_ALLOWLIST)
		for (const item of items) {
			for (const key of Object.keys(item)) {
				assert.ok(allowed.has(key), `the payload serves ${key}, which is not on ITEM_FIELD_ALLOWLIST`)
			}
			// The fields this particular round would leak a prior through: `stratum` is the role, which
			// is exactly the axis the study found the rule most biased on, and the drop line already
			// names the role in words the reviewer is meant to read — but the payload must not carry it
			// as a machine-readable field the page could group or sort by.
			for (const forbidden of ["stratum", "itemId", "sha256", "imagePath", "imageId", "selection"]) {
				assert.ok(!(forbidden in item), `the payload leaks ${forbidden}`)
			}
		}
	})

	it("refuses to release while colours are unjudged, and names them", async () => {
		// A twenty-item round is the first here big enough for this to matter: releasing early would
		// close a batch whose escape share and per-role rates are both still undefined.
		await page.press("r")
		assert.match(page.nodes.status.textContent, /release refused/u, "released a round with unjudged items")
		assert.match(page.nodes.status.textContent, /unjudged items/u)
	})

	it("releases on r once every colour is answered", async () => {
		// Answer through to the end on the escape key, then release. Driving the whole round is also
		// the only way to know the page survives its last item and renders the release screen.
		for (let remaining = 0; remaining < DROPPED_COLORS_ITEM_BUDGET; remaining += 1) {
			if (!/^\d+ of/u.test(page.nodes.progress.textContent)) break
			const answered = Number(page.nodes.progress.textContent.split(" ")[0])
			if (answered >= DROPPED_COLORS_ITEM_BUDGET) break
			await page.press(DROPPED_COLORS_ANSWERS[2].hotkey)
		}
		assert.match(
			page.nodes.progress.textContent,
			new RegExp(`^${DROPPED_COLORS_ITEM_BUDGET} of ${DROPPED_COLORS_ITEM_BUDGET} answered`, "u"),
			"the page did not carry through to the last colour",
		)
		await page.press("r")
		assert.match(page.nodes.status.textContent, /released at/u)
	})
})
