/*
 * The real-stimulus accent round, driven the way the reviewer drives it.
 *
 * **Why this file exists.** `PHASE_0_LOOSE_ENDS.md` L-i: *"a review-UI page can crawl clean and be
 * key-dead, and nothing checks that it is not"*, revived by *"any new review-UI page or interaction
 * mode is served to the reviewer"*. This round has a new page **and** a new stimulus mode — it draws
 * two different stimulus kinds from one config — so it pays the down payment: the page is imported
 * and executed, and every key it binds is pressed against a real server.
 *
 * `verify-live` establishes that a module is SERVED. It cannot establish that the module RUNS.
 * `/freetext` loaded, rendered, crawled green and was completely unresponsive to the keyboard.
 *
 * The round-specific half is the part that carries the science. `accent-real-1` exists to compare a
 * real stimulus against a synthetic one, and every assertion below about isoluminance, balance and
 * leakage is checking a property the pre-registration COMMITTED TO IN WRITING before the round was
 * pushed. A fixture that quietly drifted from
 * `data/calibration/accent-real-round-1-preregistration.md` would not be a failing round — it would
 * be a round measuring something other than what its own document says it measures, which is worse,
 * because nothing downstream would notice.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import { apcaLc, hexToRgb, okLabDistance, rgbToOkLab } from "../src/contract/color.ts"
import { APCA_RAW_IDENTICAL_CEILING } from "../src/contract/constants.ts"
import {
	ACCENT_REAL_ANSWERS,
	ACCENT_REAL_BATCH_ID,
	ACCENT_REAL_GOVERNING_ROLES,
	ACCENT_REAL_LABEL_SCHEMA_VERSION,
	ACCENT_REAL_LADDER_STEPS,
	ACCENT_REAL_ITEMS_PER_RUNG,
	ACCENT_REAL_MAX_DELTA_Y,
	ACCENT_REAL_MIN_FOREGROUND_DISTANCE,
	ACCENT_REAL_PROMPT,
	ACCENT_REAL_TARGET_TOLERANCE,
	buildAccentRealFixture,
	cellFor,
	SUNSHINE_ENTRY_ID,
	SUNSHINE_EXPECTED_DISTANCE,
} from "../src/review-server/accent-real.ts"
import { ACCENT_FUNCTIONAL_PROMPTS } from "../src/review-server/accent-functional.ts"
import { ITEM_FIELD_ALLOWLIST } from "../src/review-server/round-kit.ts"
import { batchReviewPaths } from "../src/review-server/server.ts"
import { call, openPage, startHarness, type FakePage, type Harness } from "../src/review-server/test-support.ts"

const PAGE = fileURLToPath(new URL("../review-ui/accent-real.js", import.meta.url))
const MARKUP = fileURLToPath(new URL("../review-ui/accent-real.html", import.meta.url))
const STYLESHEET = fileURLToPath(new URL("../review-ui/styles.css", import.meta.url))

/**
 * Every class name the stylesheet defines a rule for.
 *
 * The harness has no CSS engine, so a class that matches no rule renders identically here and
 * catastrophically in the browser — which is what happened to the recheck page's first revision: it
 * invented `oracle-answer`, the footer lost its hotkey column, and the reviewer reported having "no
 * way to answer" while every other assertion passed.
 */
const STYLED_CLASSES = new Set(
	[...readFileSync(STYLESHEET, "utf8").matchAll(/\.([a-zA-Z][\w-]*)/gu)].map((match) => match[1]),
)

const NODE_IDS = [
	"preamble",
	"question",
	"instruction",
	"progress",
	"stage",
	"notebox",
	"noteinput",
	"notemark",
	"itemref",
	"mapping",
	"pending",
	"status",
	"keymap",
] as const

const built = await buildAccentRealFixture()
const truthById = new Map(built.truth.items.map((item) => [item.itemId, item]))
const ladder = built.truth.items.filter((item) => item.role === "ladder")
const isoluminant = built.truth.items.filter((item) => item.role !== "control-obvious")

describe("the accent-real design, as pre-registered", () => {
	it("carries the item counts §3 committed to", () => {
		const counts = built.fixture.selection.counts
		assert.equal(counts.ladder, 30, "the real ladder is not 30 items")
		assert.equal(counts.anchors, 6, "the synthetic anchor bridge is not 6 items")
		assert.equal(counts.sunshine, 1, "the Sunshine item is missing")
		assert.equal(counts.controls, 4, "the controls are not 2 + 2")
		assert.equal(counts.repeats, 4, "the repeats are not 4")
		assert.equal(built.fixture.items.length, 45)
	})

	it("asks round 1's question, byte for byte — the bridge depends on it", () => {
		// §2. Six anchors measure the lab-versus-real gap, and that only holds if EVERYTHING except
		// the stimulus is constant. One improved word in the instruction would make any anchor
		// difference attributable to wording instead, which is the confound they exist to exclude.
		assert.equal(ACCENT_REAL_PROMPT.question, ACCENT_FUNCTIONAL_PROMPTS["accent-visible"].question)
		assert.equal(ACCENT_REAL_PROMPT.instruction, ACCENT_FUNCTIONAL_PROMPTS["accent-visible"].instruction)
		for (const question of built.fixture.questions) {
			assert.equal(question.question, ACCENT_REAL_PROMPT.question)
			assert.equal(question.instruction, ACCENT_REAL_PROMPT.instruction)
		}
	})

	it("offers the escape answer the standing rule requires", () => {
		// REVIEW_UI.md §4, added 2026-08-04: a forced choice must have somewhere to put "I can't tell",
		// and its share is a first-class result. `boolean` cannot carry a third answer, so this is an
		// enum — see the prereg §2.1.
		assert.equal(ACCENT_REAL_ANSWERS.length, 3)
		assert.deepEqual(
			ACCENT_REAL_ANSWERS.map((answer) => answer.key),
			["works", "does_not_work", "cant_tell"],
		)
		for (const question of built.fixture.questions) assert.equal(question.kind, "enum")
		assert.match(ACCENT_REAL_ANSWERS[2].gloss, /share is reported as a result of the round/u)
	})

	it("balances every stratum the pre-registration claims it balances", () => {
		// §3.4. These are the properties that keep lightness and hue from being confounded with
		// distance. The generator asserts them too; this checks the REALIZED fixture, not the plan.
		const byRung = new Map<number, typeof ladder>()
		for (const item of ladder) {
			const rung = item.rung as number
			byRung.set(rung, [...(byRung.get(rung) ?? []), item])
		}
		assert.equal(byRung.size, ACCENT_REAL_LADDER_STEPS)
		for (const [rung, items] of byRung) {
			assert.equal(items.length, ACCENT_REAL_ITEMS_PER_RUNG)
			assert.equal(new Set(items.map((item) => item.band)).size, 3, `rung ${rung} does not cover all three bands`)
			assert.equal(new Set(items.map((item) => item.hueThird)).size, 3, `rung ${rung} does not cover all three hue thirds`)
			assert.equal(new Set(items.map((item) => item.governingRole)).size, 2, `rung ${rung} carries only one governing role`)
		}
		for (const role of ACCENT_REAL_GOVERNING_ROLES) {
			assert.equal(ladder.filter((item) => item.governingRole === role).length, 15, `governing role ${role} is not 15`)
		}
		for (const band of ["dark", "mid", "light"]) {
			assert.equal(ladder.filter((item) => item.band === band).length, 10, `band ${band} is not 10`)
		}
		for (const third of [0, 1, 2]) {
			assert.equal(ladder.filter((item) => item.hueThird === third).length, 10, `hue third ${third} is not 10`)
		}
	})

	it("keeps the cell assignment the document describes", () => {
		for (let rung = 0; rung < ACCENT_REAL_LADDER_STEPS; rung += 1) {
			for (let slot = 0; slot < ACCENT_REAL_ITEMS_PER_RUNG; slot += 1) {
				const cell = cellFor(rung, slot)
				assert.equal(cell.band, (rung + slot) % 3)
				assert.equal(cell.hueThird, (rung + 2 * slot) % 3)
			}
		}
	})

	it("carries NO luminance contrast on any graded stimulus — Lc is exactly zero", () => {
		// §3.2, and the whole reason the round exists: this is the regime where the accent escape is
		// the only thing standing between a palette and a refusal. `apcaLc == 0` is not "small" — it
		// is the public APCA scale reporting that it can see no contrast at all.
		for (const item of isoluminant) {
			assert.equal(item.governing.apcaLc, 0, `${item.itemId} carries Lc ${item.governing.apcaLc}`)
			assert.ok(
				Math.abs(item.governing.deltaApcaY) <= ACCENT_REAL_MAX_DELTA_Y,
				`${item.itemId} moves APCA Y by ${item.governing.deltaApcaY}, over the ${ACCENT_REAL_MAX_DELTA_Y} budget`,
			)
			assert.ok(
				Math.abs(item.governing.apcaRaw) <= APCA_RAW_IDENTICAL_CEILING,
				`${item.itemId} has |raw APCA| ${item.governing.apcaRaw}, over the identical-colour ceiling`,
			)
		}
	})

	it("hits its ladder targets inside the declared tolerance, and reports the achieved distance", () => {
		for (const item of ladder) {
			const target = item.targetDistance as number
			const error = Math.abs(item.governing.okLabDistance - target) / target
			assert.ok(error <= ACCENT_REAL_TARGET_TOLERANCE, `${item.itemId} missed its rung by ${error}`)
		}
		const distances = ladder.map((item) => item.governing.okLabDistance)
		// The span has to bracket every number the round is being read against: round 1's 0.04554, the
		// Sunshine 0.12117, the placeholder 0.14591 and the endorsed 0.24181.
		assert.ok(Math.min(...distances) < 0.0605, "the ladder does not reach low enough")
		assert.ok(Math.max(...distances) > 0.3, "the ladder does not reach past the endorsed rungs")
	})

	it("keeps every constructed accent clear of the palette's own foreground", () => {
		// §3.2. Without this an item could be answered "no" because the accent became a second
		// foreground — a DIFFERENT failure (B31, the foreground-accent bar) with its own open question.
		for (const item of ladder) {
			const foreground = item.placementProfile.find((pair) => pair.fieldRole === "foreground")
			assert.ok(foreground !== undefined, `${item.itemId} has no foreground measurement`)
			const distance = okLabDistance(rgbToOkLab(hexToRgb(item.accentHex as `#${string}`)), rgbToOkLab(hexToRgb(foreground.fieldHex as `#${string}`)))
			assert.ok(
				distance >= ACCENT_REAL_MIN_FOREGROUND_DISTANCE,
				`${item.itemId}'s accent is ${distance} from the foreground, under the ${ACCENT_REAL_MIN_FOREGROUND_DISTANCE} floor`,
			)
		}
	})

	it("records what the NON-governing placements carried, so no 'yes' can leak unmeasured", () => {
		// §4 and §6.5. An accent isoluminant to the surface still has real contrast on the background
		// rail, and the reviewer could answer "yes" from that placement alone. The round cannot prevent
		// it — the mock is the mock — so it MEASURES it. A profile that stopped at the governing pair
		// would leave the round unable to say how much room that reading had.
		for (const item of ladder) {
			const roles = item.placementProfile.map((pair) => pair.fieldRole)
			assert.deepEqual(roles, ["field", "surface", "background", "foreground"], `${item.itemId} has an incomplete placement profile`)
		}
	})

	it("carries the Sunshine case unmodified, at its real 0.12117", () => {
		const sunshine = built.truth.items.find((item) => item.role === "sunshine")
		assert.ok(sunshine !== undefined, "the Sunshine item is not in the round")
		assert.equal(sunshine.entryId, SUNSHINE_ENTRY_ID)
		// Unmodified means unmodified: the accent it ships with is the accent it was endorsed with.
		assert.equal(sunshine.accentHex, sunshine.originalAccentHex, "the Sunshine accent was substituted")
		assert.equal(sunshine.accentHex, "#fac751")
		assert.equal(sunshine.governing.fieldHex, "#d5cebe")
		assert.ok(Math.abs(sunshine.governing.okLabDistance - SUNSHINE_EXPECTED_DISTANCE) < 5e-5)
		assert.equal(apcaLc(hexToRgb("#fac751"), hexToRgb("#d5cebe")), 0, "the motivating case is not isoluminant after all")
	})

	it("replays six round-1 panels by distance, never by how they were answered", () => {
		const anchors = built.truth.items.filter((item) => item.role === "anchor")
		assert.equal(anchors.length, 6)
		assert.equal(new Set(anchors.map((item) => item.replays)).size, 6, "an anchor is replayed twice")
		const distances = anchors.map((item) => item.governing.okLabDistance).sort((a, b) => a - b)
		// Spanning the ladder rather than clustering at a crux: the bridge is a CURVE, and one measured
		// at a single rung cannot see a shift that varies with distance.
		assert.ok(distances[0] < 0.07, "the bridge has no low rung")
		assert.ok(distances.at(-1)! > 0.25, "the bridge has no high rung")
	})

	it("separates every repeat from its twin by at least 12 served items", () => {
		const position = new Map(built.fixture.serveOrder.map((itemId, at) => [itemId, at]))
		for (const item of built.truth.items) {
			if (item.role !== "repeat") continue
			const gap = Math.abs(position.get(item.itemId)! - position.get(item.repeatOf as string)!)
			assert.ok(gap >= 12, `${item.itemId} sits ${gap} items from its twin — that measures recall, not noise`)
		}
	})

	it("puts the two controls of each direction on different governing roles", () => {
		// A pair of controls that both sat on the surface would vouch for the reviewer's attention to
		// surfaces only, and half the ladder is governed by the background.
		for (const role of ["control-obvious", "control-identical"] as const) {
			const controls = built.truth.items.filter((item) => item.role === role)
			assert.equal(controls.length, 2)
			assert.equal(new Set(controls.map((item) => item.governingRole)).size, 2, `both ${role} controls sit on the same role`)
		}
		for (const control of built.truth.items.filter((item) => item.role === "control-identical")) {
			assert.equal(control.governing.okLabDistance, 0, "an identical control is not identical")
			assert.ok(control.governing.identical, "an identical control's colours are not the same triple")
		}
	})

	it("uses each cover at most once, repeats excepted", () => {
		// A repeat is deliberately the same cover a second time — that is what makes it a repeat. Every
		// OTHER item must be a cover the reviewer has not seen in this round, or one stimulus primes
		// the next and the ladder measures recognition instead of visibility.
		const repeats = new Set(built.truth.items.filter((item) => item.role === "repeat").map((item) => item.itemId))
		const covers = built.fixture.items.filter((item) => !repeats.has(item.itemId)).map((item) => item.imageId)
		assert.equal(new Set(covers).size, covers.length, "a cover appears twice outside the repeats")
		assert.equal(covers.length, 41, "the round does not draw 41 distinct covers")
	})

	it("routes to its own page, from the schema and not from the kind", () => {
		const paths = batchReviewPaths({
			batchId: ACCENT_REAL_BATCH_ID,
			kind: "oracle-validation",
			labelSchemaVersion: ACCENT_REAL_LABEL_SCHEMA_VERSION,
		})
		assert.equal(paths.page, `/accent-real?batch=${ACCENT_REAL_BATCH_ID}`)
		assert.equal(paths.payload, `/api/oracle-validation/${ACCENT_REAL_BATCH_ID}`)
	})

	it("keeps the truth out of the side-car the browser can read in full", () => {
		// §4. The side-car is a static file. Anything in it is effectively on screen, so a rung index
		// or a target distance there would hand the reviewer the ladder.
		for (const item of built.pageData.items) {
			assert.deepEqual(
				Object.keys(item).sort(),
				item.stimulus === "panel" ? ["panel", "questionKey", "stimulus"] : ["questionKey", "side", "stimulus"],
				"the side-car carries a field the page does not need to draw",
			)
			assert.ok(!/^accent_real_\d+$/u.test(item.questionKey), "the question key is an index, which spells out the ladder")
		}
	})
})

describe("the accent-real page, executing", () => {
	let harness: Harness
	let page: FakePage

	before(async () => {
		harness = await startHarness()
		await harness.handle.service.pushOracleValidation(built.fixture, [])
		page = await openPage(harness.base, PAGE, NODE_IDS, `${harness.base}/accent-real?batch=${ACCENT_REAL_BATCH_ID}`)
	})

	after(async () => {
		await harness?.stop()
	})

	it("gets past its loading state", () => {
		assert.notEqual(page.nodes.question.textContent, "loading…", "STUCK: the page never left its loading state")
		assert.equal(page.nodes.question.textContent, ACCENT_REAL_PROMPT.question)
		// The criterion is on screen WHILE the reviewer answers — REVIEW_UI.md §4, the more expensive
		// of the two lessons of 2026-08-04.
		assert.match(page.nodes.instruction.textContent, /assume you can/u, "the criterion is not on screen")
	})

	it("draws one of the two stimuli on every single item, and never an empty stage", async () => {
		// The failure this guards is specific and silent: a side-car that did not load leaves a blank
		// judging surface the reviewer would still answer, and the answer would look like data.
		let mocks = 0
		let panels = 0
		for (let at = 0; at < built.fixture.items.length; at += 1) {
			const stage = page.stage()
			const drewMock = stage.byClass("mock").length === 1
			const drewPanel = stage.byClass("accent-stage").length === 1
			assert.ok(drewMock !== drewPanel, `item ${at + 1} drew ${drewMock ? "both" : "neither"} stimulus`)
			assert.equal(stage.byClass("round-error").length, 0, `item ${at + 1} rendered the side-car error panel`)
			if (drewMock) {
				mocks += 1
				assert.equal(stage.byClass("mock-art").length, 1, `item ${at + 1}: the artwork is not in the mock`)
				assert.ok(stage.byClass("mock-card").length > 0, `item ${at + 1}: no surface card, so the accent has no surface context`)
				assert.ok(stage.byClass("swatches").length > 0, `item ${at + 1}: no swatches under the mock`)
			} else {
				panels += 1
				// Three shapes, from the one shared renderer. Round 1 drew exactly these.
				assert.equal(stage.byClass("accent-shape").length, 3, `item ${at + 1}: the panel is not round 1's three shapes`)
			}
			if (at + 1 < built.fixture.items.length) await page.press("j")
		}
		assert.equal(mocks, 39, "the wrong number of items drew the real mock player")
		assert.equal(panels, 6, "the wrong number of items drew the synthetic panel")
		// Back to the first item for the key tests below.
		for (let at = built.fixture.items.length - 1; at > 0; at -= 1) await page.press("k")
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

	it("puts the three answers in the styled hotkey grid, not a run-on line", () => {
		const rows = page.nodes.mapping.byClass("oracle-map")
		assert.equal(rows.length, 3, "the three answers are not in the styled mapping grid")
	})

	it("advertises every key it binds in the markup, so the affordance survives a dead fetch", () => {
		const footer = readFileSync(MARKUP, "utf8")
		// The keymap is GENERATED, so the markup must not hand-write key names — it carries the node
		// the kit fills instead. Both incidents of 2026-08-04 were footers that had drifted.
		assert.match(footer, /id="keymap"/u, "there is no generated keymap node")
		assert.doesNotMatch(footer, /<b>[123jkur]<\/b>/u, "the footer hand-writes key names the kit is meant to generate")
	})

	it("moves between stimuli WITHOUT answering", async () => {
		assert.match(page.nodes.progress.textContent, /· 0 answered/u)
		await page.press("j")
		assert.match(page.nodes.status.textContent, /nothing was recorded/u, "STUCK: j did not step forward")
		assert.match(page.nodes.progress.textContent, /^2 \/ 45/u, "j did not reach the second item")
		assert.match(page.nodes.progress.textContent, /· 0 answered/u, "moving recorded an answer")
		await page.press("k")
		assert.match(page.nodes.progress.textContent, /^1 \/ 45/u, "k did not go back")
	})

	it("records 'works' on its hotkey and advances", async () => {
		await page.press(ACCENT_REAL_ANSWERS[0].hotkey)
		assert.match(page.nodes.progress.textContent, /· 1 answered/u, "STUCK: the answer key did not advance")
		assert.match(page.nodes.status.textContent, /recorded works/u)
	})

	it("records 'does_not_work' from the AZERTY row too", async () => {
		// `é` is the key printed `2` on the reviewer's French Mac. Both rows answer, everywhere.
		await page.press("é")
		assert.match(page.nodes.progress.textContent, /· 2 answered/u)
		assert.match(page.nodes.status.textContent, /recorded does_not_work/u)
	})

	it("records the escape answer as an ordinary answer, so its share is countable", async () => {
		await page.press(ACCENT_REAL_ANSWERS[2].hotkey)
		assert.match(page.nodes.status.textContent, /recorded cant_tell/u)
		const { body } = await call(harness.base, "GET", `/api/oracle-validation/${ACCENT_REAL_BATCH_ID}`)
		const items = body.items as { answer: string | null }[]
		const answered = items.filter((item) => item.answer !== null).map((item) => item.answer).sort()
		assert.deepEqual(answered, ["cant_tell", "does_not_work", "works"])
	})

	it("steps back on undo without deleting anything", async () => {
		await page.press("u")
		assert.match(page.nodes.status.textContent, /stepped back/u)
		assert.match(page.nodes.progress.textContent, /· 3 answered/u, "undo deleted an answer — the log is append-only")
	})

	it("takes a per-item note, and shows the item id the reviewer would quote", async () => {
		// The reviewer, 2026-08-04: "i often want to give feedback about a specific thing and we
		// currently have no way of doing that, which prevents accidental discovery of information."
		assert.match(page.nodes.itemref.textContent, new RegExp(`^${ACCENT_REAL_BATCH_ID}/`, "u"), "no copyable item id on screen")
		await page.press("f")
		assert.equal(page.nodes.notebox.hidden, false, "f did not open the note box")
		page.nodes.noteinput.value = "the accent reads as a smudge here"
		await page.press("Enter")
		assert.equal(page.nodes.notebox.hidden, true, "the box stayed open after saving")
		assert.match(page.nodes.notemark.textContent, /note saved/u, "the note was not acknowledged")
	})

	it("serves only allowlisted item fields, and leaks none of this round's own priors", async () => {
		// The live-payload key smoke, as a test rather than a curl. Asserted against the server's OWN
		// `ITEM_FIELD_ALLOWLIST` rather than a remembered key list, so a deliberate widening of the
		// allowlist does not train anyone to edit the assertion.
		const { body } = await call(harness.base, "GET", `/api/oracle-validation/${ACCENT_REAL_BATCH_ID}`)
		const items = body.items as Record<string, unknown>[]
		assert.equal(items.length, built.fixture.items.length)
		const allowed = new Set<string>(ITEM_FIELD_ALLOWLIST)
		for (const item of items) {
			for (const key of Object.keys(item)) {
				assert.ok(allowed.has(key), `the payload serves ${key}, which is not on ITEM_FIELD_ALLOWLIST`)
			}
			// `stratum` is this round's sharpest prior: it names the governing role and the lightness
			// band, which is the ladder's own stratification. `itemId` would carry the rung in plain text.
			for (const forbidden of ["stratum", "itemId", "sha256", "imagePath", "imageId", "selection", "truth"]) {
				assert.ok(!(forbidden in item), `the payload leaks ${forbidden}`)
			}
		}
	})
})
