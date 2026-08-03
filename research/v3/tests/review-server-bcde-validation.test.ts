/**
 * The group-BCDE reviewer validation round — `bcde-validation-1` (PREMISE_NEXT.md §15.9).
 *
 * Two things are new here and both can fail silently, which is what this file is for.
 *
 *  - **`kind: "multi"`.** §15.9 called it "the one blocker, and it is real": the mode supported one
 *    keystroke per answer, and a reviewer cannot pick several answers under a one-keystroke
 *    auto-advance UI. Option A was preferred — toggle keys plus one commit key — because it is the
 *    only shape that asks the reviewer the same question the model was asked. A multi-select that
 *    silently records the last key pressed, or records an order-sensitive array, is worse than the
 *    per-value decomposition it replaced.
 *  - **The corpus moved.** The round is drawn from the coverage set's core, not from eval-142. Only
 *    three core artworks were ever decoded by the pilot, so the fixture must pin all three and the
 *    analysis must never quietly pool them with the seventeen that have no model answer.
 *
 * And the two standing rules from the earlier rounds, which apply unchanged: the wording the
 * reviewer reads must be the model's wording byte for byte, and the round must be unanchored.
 */
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { validateRecord, type OracleLabelRecord } from "../src/warehouse/records.ts"
import {
	analyzeBcdeValidation,
	BCDE_VALIDATION_ANALYSIS_PATH,
	CONTRADICTION_CEILING,
	cohenKappa,
	collectBcdeAnswers,
	ELICITATION_MODE_CLARIFICATION,
	GATE_CONSISTENCY_RULES,
	jaccard,
	JOINED_GRADES,
	readPilotAnswers,
	sameAnswer,
	verifyPilotOverlap,
} from "../src/review-server/analyze-bcde-validation.ts"
import {
	BCDE_INSTRUCTION,
	BCDE_LABEL_SCHEMA_VERSION,
	BCDE_VALIDATION_ARTWORKS,
	BCDE_VALIDATION_BATCH_ID,
	BCDE_VALIDATION_FIXTURE_PATH,
	BCDE_VALIDATION_OMITTED_REASONS,
	BCDE_VALIDATION_QUESTION_REASONS,
	BCDE_VALIDATION_SEED,
	COVERAGE_SET_PATH,
	DIGIT_HOTKEYS,
	PREMISE_DISAMBIGUATION_FIXTURE_VERSION,
	bcdeQuestionOrder,
	buildBcdeValidationFixture,
	readGroupBcdePrompt,
	serializeFixture,
	tierQuotas,
	validateFixture,
	type OracleQuestion,
	type OracleValidationFixture,
} from "../src/review-server/oracle-validation.ts"
import { REPO_ROOT, seedBcdeValidationRound } from "../src/review-server/server.ts"
import { readJsonl } from "../src/review-server/store.ts"
import { call, openPage, startHarness, type FakePage, type Harness } from "../src/review-server/test-support.ts"
import type { StoredOracleBatch } from "../src/review-server/types.ts"

const BATCH = BCDE_VALIDATION_BATCH_ID
const ORACLE_PAGE = fileURLToPath(new URL("../review-ui/oracle.js", import.meta.url))
/** `pending` is new: it is where a multi-select says what it is about to record. */
const NODE_IDS = ["reconcile-prior", "reconcile-conflict", "preamble", "framing", "question", "instruction", "progress", "mapping", "stage", "undokey", "pending", "status"] as const
const PROMPT_PATH = fileURLToPath(new URL("../oracle/premise/prompts/group-bcde.v1.variant-e.json", import.meta.url))

const fixture = await buildBcdeValidationFixture()
const prompt = readGroupBcdePrompt(PROMPT_PATH)
const overlays = fixture.questions.find((question) => question.key === "overlays")!

/**
 * The committed analysis of the real round.
 *
 * Read from the file rather than recomputed, because the assertions below are about what the *repo*
 * says: an analysis that reports the right thing only when a test recomputes it is not on the record.
 */
const committed = JSON.parse(await readFile(BCDE_VALIDATION_ANALYSIS_PATH, "utf8"))
function committedAnalysis(): any {
	return committed
}

describe("bcde-validation fixture", () => {
	it("is deterministic and matches the committed file", async () => {
		assert.deepEqual(await buildBcdeValidationFixture(), fixture)
		assert.equal(
			await readFile(BCDE_VALIDATION_FIXTURE_PATH, "utf8"),
			serializeFixture(fixture),
			"the committed fixture is not what the generator produces — regenerate with --fixture bcde --write",
		)
	})

	it("is 20 artworks x 8 questions = 160 items, the lever §15.9 priced as preferred", () => {
		assert.equal(fixture.batchId, "bcde-validation-1")
		assert.equal(fixture.purpose, "oracle-validation")
		assert.equal(fixture.fixtureVersion, PREMISE_DISAMBIGUATION_FIXTURE_VERSION)
		assert.equal(fixture.labelSchemaVersion, BCDE_LABEL_SCHEMA_VERSION)
		assert.equal(fixture.labelSchemaVersion, "group-bcde.v1", "the reviewer's rows carry the MODEL's schema")
		assert.equal(fixture.seed, BCDE_VALIDATION_SEED)
		assert.equal(fixture.questions.length, 8)
		assert.equal(fixture.selection.counts.selected, BCDE_VALIDATION_ARTWORKS)
		assert.equal(fixture.items.length, 160)
		assert.doesNotThrow(() => validateFixture(fixture))
	})

	it("asks the eight questions the pilot scoped, and no others", () => {
		assert.deepEqual(
			[...fixture.questions.map((question) => question.key)].sort(),
			Object.keys(BCDE_VALIDATION_QUESTION_REASONS).sort(),
		)
		// The four the pilot showed do NOT need reviewer time. Their absence is a decision on record.
		for (const omitted of ["has_text", "medium", "physical_media_scan", "text_roles"]) {
			assert.ok(omitted in BCDE_VALIDATION_OMITTED_REASONS, `${omitted} has no recorded reason for being left out`)
			assert.ok(
				!fixture.questions.some((question) => question.key === omitted),
				`${omitted} was scoped out and is being asked anyway`,
			)
		}
		for (const question of fixture.questions) {
			assert.ok((BCDE_VALIDATION_QUESTION_REASONS[question.key] ?? "").length > 40, `${question.key} has no recorded reason`)
		}
	})

	it("runs the passes in variant E's own question order, contiguous", () => {
		assert.deepEqual(
			fixture.questions.map((question) => question.key),
			bcdeQuestionOrder(prompt),
		)
		// Not hand-written: E's order with the five unasked questions removed.
		assert.deepEqual(
			fixture.questions.map((question) => question.key),
			prompt.questionOrder.filter((key) => key in BCDE_VALIDATION_QUESTION_REASONS),
		)
		const order = fixture.serveOrder.map((id) => fixture.items.find((item) => item.itemId === id)!.questionKey)
		const runs: string[] = []
		for (const key of order) if (runs.at(-1) !== key) runs.push(key)
		assert.deepEqual(runs, fixture.questions.map((question) => question.key))
		// Shuffled inside each pass, so the artworks are not walked in the same order eight times.
		assert.notDeepEqual(
			fixture.serveOrder.slice(0, BCDE_VALIDATION_ARTWORKS),
			fixture.items.filter((item) => item.questionKey === fixture.questions[0].key).map((item) => item.itemId),
		)
	})

	it("carries variant E's wording byte for byte — stem and every gloss", async () => {
		const raw = JSON.parse(await readFile(PROMPT_PATH, "utf8")) as { prompt: string; vocabularies: Record<string, string[]> }
		for (const question of fixture.questions) {
			// The stem, exactly as the prompt renders it, with only the "N. " enumerator dropped: this
			// round has eight passes and the prompt's numbering names a position that does not exist here.
			assert.ok(
				raw.prompt.includes(`. ${question.question}\n`),
				`${question.key}: the stem is not a line of the prompt file`,
			)
			for (const answer of question.answers) {
				assert.ok(
					raw.prompt.includes(`   ${answer.key} - ${answer.gloss}\n`),
					`${question.key}/${answer.key}: the gloss is not the prompt file's`,
				)
			}
			// The vocabulary is the file's own declared one, in order — not just a set that happens to match.
			assert.deepEqual(
				question.answers.map((answer) => answer.key),
				raw.vocabularies[question.key],
				`${question.key}: vocabulary or order differs from the prompt file`,
			)
		}
	})

	it("puts all eight shared blocks on the page, the same on every pass", () => {
		const preambles = new Set(fixture.questions.map((question) => question.preamble))
		assert.equal(preambles.size, 1, "the definitions must be fixed once, not per question")
		const preamble = fixture.questions[0].preamble!
		assert.equal(prompt.sharedBlocks.length, 8)
		for (const block of prompt.sharedBlocks) {
			assert.ok(preamble.includes(block), "a shared block is missing from the preamble")
		}
		// §15.9 names these two specifically: they are what make subject_kind answerable at all.
		assert.match(preamble, /THE MAIN SUBJECT\./u)
		assert.match(preamble, /ONE PICTURE, ONE MEDIUM\./u)
		assert.match(preamble, /THE SIGNATURE COLOUR\./u)
		for (const question of fixture.questions) {
			assert.equal(question.instruction, BCDE_INSTRUCTION)
			assert.match(question.instruction, /Do not try to make your answers across questions tell one story/u)
		}
	})

	it("makes overlays a multi-select on digits, and every other question a single-answer enum", () => {
		assert.equal(overlays.kind, "multi")
		assert.deepEqual(prompt.multiSelectFields, ["text_roles", "overlays"])
		assert.deepEqual(
			overlays.answers.map((answer) => [answer.hotkey, answer.key]),
			[
				["1", "parental_advisory"],
				["2", "label_logo"],
				["3", "barcode_or_price"],
				["4", "watermark"],
				["5", "none"],
			],
		)
		for (const question of fixture.questions) {
			if (question.key === "overlays") continue
			assert.equal(question.kind, "enum", `${question.key} is not a multi-select in this round`)
			// Digits only, everywhere: `u` must stay undo on every pass of the round.
			for (const answer of question.answers) {
				assert.ok((DIGIT_HOTKEYS as readonly string[]).includes(answer.hotkey), `${question.key} binds ${answer.hotkey}`)
			}
		}
	})

	it("binds the same digit row the page decodes", async () => {
		// `DIGIT_HOTKEYS` is mirrored from `review-ui/keys.js` because a fixture builder that could not
		// check its own hotkeys would be checking nothing. This is the assertion that keeps the mirror
		// honest — a fixture that bound a key the page does not decode would be unanswerable.
		const keys = (await import("../review-ui/keys.js")) as { DIGIT_ROW: string[] }
		assert.deepEqual([...DIGIT_HOTKEYS], keys.DIGIT_ROW)
	})

	it("refuses a multi-select that binds anything but a digit", () => {
		const broken: OracleValidationFixture = {
			...fixture,
			questions: [
				{ ...overlays, answers: overlays.answers.map((answer, index) => (index === 0 ? { ...answer, hotkey: "u" } : answer)) },
				...fixture.questions.slice(1),
			] as readonly OracleQuestion[],
		}
		assert.throws(() => validateFixture(broken), /binds u.*digits only/su)
	})

	it("draws from the coverage-set core, spread over clusters and tiers", async () => {
		const coverage = JSON.parse(await readFile(COVERAGE_SET_PATH, "utf8")) as {
			artworks: { role: string; sha256: string; artworkId: string; tier: string; cluster: number | null; path: string }[]
		}
		const core = new Map(coverage.artworks.filter((artwork) => artwork.role === "core").map((artwork) => [artwork.sha256, artwork]))
		assert.equal(core.size, 200)
		const chosen = [...new Set(fixture.items.map((item) => item.sha256))]
		assert.equal(chosen.length, BCDE_VALIDATION_ARTWORKS)
		for (const sha256 of chosen) {
			const artwork = core.get(sha256)
			assert.ok(artwork !== undefined, `${sha256} is not in the coverage-set core`)
			// Enrichment artworks never enter a rate or a distribution (COVERAGE_SET.md).
			assert.equal(artwork.role, "core")
		}
		// One cluster each: with 20 picks over 36 clusters there is no reason to double up.
		const clusters = chosen.map((sha256) => core.get(sha256)!.cluster)
		assert.equal(new Set(clusters).size, BCDE_VALIDATION_ARTWORKS, "two picks landed in one cluster")
		// The strata are the coverage set's own tiers, apportioned to the core's own mix.
		const populations: Record<string, number> = {}
		for (const artwork of core.values()) populations[artwork.tier] = (populations[artwork.tier] ?? 0) + 1
		const quotas = tierQuotas(populations, BCDE_VALIDATION_ARTWORKS)
		const drawn: Record<string, number> = {}
		for (const sha256 of chosen) {
			const tier = core.get(sha256)!.tier
			drawn[tier] = (drawn[tier] ?? 0) + 1
		}
		assert.deepEqual(drawn, Object.fromEntries(Object.entries(quotas).filter(([, count]) => count > 0)))
		for (const item of fixture.items) assert.equal(item.stratum, core.get(item.sha256)!.tier)
	})

	it("pins every core artwork the pilot actually decoded — all three of them", async () => {
		const pilot = await readPilotAnswers()
		const chosen = [...new Set(fixture.items.map((item) => item.sha256))]
		const byArtwork = new Map(fixture.items.map((item) => [item.sha256, item.artworkId]))
		const joined = chosen.filter(
			(sha256) => pilot.bySha.has(sha256) || (byArtwork.get(sha256) !== null && pilot.byArtwork.has(byArtwork.get(sha256)!)),
		)
		// The finding this round is built around: the coverage-set core and eval-142 barely overlap.
		assert.equal(fixture.selection.counts.core_in_pilot_exact_bytes, 2)
		assert.equal(fixture.selection.counts.core_in_pilot_same_artwork_other_rendition, 1)
		assert.equal(fixture.selection.counts.pinned, 3)
		assert.equal(joined.length, 3, "a joinable artwork was left out; all of them are pinned")
	})

	it("carries no model answer and no SAM data", () => {
		const text = JSON.stringify({ questions: fixture.questions, items: fixture.items })
		for (const forbidden of [
			"prompt_variant",
			"variant",
			"parsed",
			"sam-",
			"sam_",
			"mask",
			"exact_bytes",
			"same_artwork_other_rendition",
			"pilot",
		]) {
			assert.ok(!text.includes(forbidden), `the fixture leaks ${forbidden} to the page`)
		}
	})
})

describe("bcde-validation round in the review server", () => {
	let harness: Harness
	let stored: StoredOracleBatch

	before(async () => {
		harness = await startHarness()
		assert.equal(await seedBcdeValidationRound(harness.handle.service), BATCH)
		stored = (await readJsonl<StoredOracleBatch>(harness.batchLogPath))[0] as StoredOracleBatch
	})

	after(async () => {
		await harness?.stop()
	})

	it("serves eight questions with their kind and preamble, and 160 items in pass order", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		assert.equal(payload.status, 200)
		assert.equal(payload.body.items.length, 160)
		assert.equal(payload.body.questions.length, 8)
		for (const [index, question] of payload.body.questions.entries()) {
			assert.equal(question.key, fixture.questions[index].key)
			assert.equal(question.kind, fixture.questions[index].kind)
			assert.equal(question.itemCount, BCDE_VALIDATION_ARTWORKS)
			assert.equal(question.preamble, fixture.questions[index].preamble)
			assert.equal(question.instruction, BCDE_INSTRUCTION)
		}
		assert.deepEqual(
			payload.body.items.map((item: any) => stored.answerTokens[item.token]),
			[...fixture.serveOrder],
		)
	})

	it("is unanchored: no model answer, no join key, no selection counts", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		const text = JSON.stringify(payload.body)
		for (const forbidden of ["sha256", "imagePath", "artworkId", "cluster", "selection", "pilot", "counts", ...fixture.items.map((item) => item.itemId)]) {
			assert.ok(!text.includes(forbidden), `the served payload leaks ${forbidden}`)
		}
		for (const item of payload.body.items) {
			assert.deepEqual(Object.keys(item).sort(), ["answer", "height", "media", "questionKey", "revision", "token", "width"])
			assert.equal(item.answer, null)
		}
	})

	/** The token of the first served item of one question's pass. */
	async function tokenFor(questionKey: string, offset = 0): Promise<string> {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		return payload.body.items.filter((item: any) => item.questionKey === questionKey)[offset].token
	}

	it("records a multi-select answer as a sorted array in one oracle-label record", async () => {
		const token = await tokenFor("overlays")
		const response = await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${token}/answer`, {
			// Deliberately out of vocabulary order: the record must not depend on which key was pressed first.
			answer: ["watermark", "label_logo"],
		})
		assert.equal(response.status, 200)
		const record = harness.records().at(-1) as OracleLabelRecord
		assert.doesNotThrow(() => validateRecord(record))
		assert.equal(record.type, "oracle-label")
		assert.equal(record.labelSchemaVersion, "group-bcde.v1")
		assert.equal(record.questionKey, "overlays")
		assert.deepEqual(record.answer, ["label_logo", "watermark"], "the array must be sorted, and it must be one record")
		assert.equal(record.author.kind, "human")
		assert.equal(record.batch?.id, BATCH)
		assert.equal(record.batch?.itemCount, 160)
		assert.equal(
			harness.records().filter((entry) => entry.type === "oracle-label").length,
			1,
			"a multi-select is ONE record with an array, not one record per value",
		)
	})

	it("serves the array back, so a step-back shows what was recorded", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		const answered = payload.body.items.filter((item: any) => item.answer !== null)
		assert.equal(answered.length, 1)
		assert.deepEqual(answered[0].answer, ["label_logo", "watermark"])
	})

	it("refuses the wrong shape in either direction, and a bad list", async () => {
		const multi = await tokenFor("overlays", 1)
		const single = await tokenFor("subject_kind")
		const put = (token: string, answer: unknown) =>
			call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${token}/answer`, { answer })

		const flat = await put(multi, "watermark")
		assert.equal(flat.status, 400)
		assert.match(flat.body.error, /multi-select/u)

		const listed = await put(single, ["person"])
		assert.equal(listed.status, 400)
		assert.match(listed.body.error, /not a list/u)

		const empty = await put(multi, [])
		assert.equal(empty.status, 400)
		assert.match(empty.body.error, /at least one value/u)

		const repeated = await put(multi, ["watermark", "watermark"])
		assert.equal(repeated.status, 400)
		assert.match(repeated.body.error, /lists a value twice/u)

		const stray = await put(multi, ["watermark", "sticker"])
		assert.equal(stray.status, 400)
		assert.match(stray.body.error, /parental_advisory \| label_logo/u)

		const shaped = await put(multi, [7])
		assert.equal(shaped.status, 400)
	})

	it("says plainly that the adjudication view has nothing to show for this schema", async () => {
		// The after-release page is the premise test's three-way join; a group-BCDE round has no premise
		// row for its artworks. A named 404 beats a 500 out of the analyzer.
		const response = await call(harness.base, "GET", `/api/oracle-review/${BATCH}`)
		assert.equal(response.status, 404)
	})
})

describe("bcde-validation page, driven by keystrokes", () => {
	let harness: Harness
	let page: FakePage

	/** The mapping lines, which is where a toggle has to become visible. */
	const mapping = () => page.nodes.mapping.children.map((child) => child.textContent)

	before(async () => {
		harness = await startHarness()
		await seedBcdeValidationRound(harness.handle.service)
		page = await openPage(harness.base, ORACLE_PAGE, NODE_IDS)
	})

	after(async () => {
		await harness?.stop()
	})

	it("opens on the first pass with the shared blocks above the question", () => {
		assert.equal(page.nodes.preamble.textContent, fixture.questions[0].preamble)
		assert.equal(page.nodes.question.textContent, fixture.questions[0].question)
		assert.equal(page.nodes.instruction.textContent, BCDE_INSTRUCTION)
		assert.match(page.nodes.progress.textContent, /^grain_or_noise · 1 \/ 20/u)
		// An enum: no pending line, because there is nothing pending — the keystroke IS the answer.
		assert.equal(page.nodes.pending.textContent, "")
	})

	it("answers the first pass one keystroke per item, as every earlier round does", async () => {
		for (let item = 0; item < 20; item++) await page.press("1")
		assert.match(page.nodes.progress.textContent, /^overlays · 1 \/ 20/u)
		assert.equal(page.nodes.question.textContent, overlays.question)
	})

	it("toggles a multi-select with digits and does not advance", async () => {
		const before_ = page.nodes.progress.textContent
		await page.press("2")
		assert.equal(page.nodes.progress.textContent, before_, "a toggle must not auto-advance")
		assert.match(page.nodes.pending.textContent, /^label_logo · enter or space records$/u)
		assert.ok(mapping()[1].includes("on"), "the toggled value is not marked on screen")
		await page.press("4")
		// Vocabulary order, not press order: the mapping is read top to bottom.
		assert.match(page.nodes.pending.textContent, /^label_logo, watermark · enter or space records$/u)
		// Pressing it again turns it off.
		await page.press("2")
		assert.match(page.nodes.pending.textContent, /^watermark · enter or space records$/u)
		assert.ok(!mapping()[1].includes("on"))
		assert.equal(harness.records().filter((entry) => entry.type === "oracle-label").length, 20, "a toggle wrote a record")
	})

	it("commits on enter, sorted, as one record, and advances", async () => {
		await page.press("2")
		await page.press("Enter")
		await page.settle()
		const record = harness.records().at(-1) as OracleLabelRecord
		assert.equal(record.questionKey, "overlays")
		assert.deepEqual(record.answer, ["label_logo", "watermark"])
		assert.match(page.nodes.progress.textContent, /^overlays · 2 \/ 20/u)
		assert.match(page.nodes.status.textContent, /recorded label_logo, watermark/u)
		// The next item starts empty — the selection does not leak forward.
		assert.match(page.nodes.pending.textContent, /^select every value that applies/u)
	})

	it("commits on space too", async () => {
		await page.press("5")
		await page.press(" ")
		await page.settle()
		const record = harness.records().at(-1) as OracleLabelRecord
		assert.deepEqual(record.answer, ["none"])
		assert.match(page.nodes.progress.textContent, /^overlays · 3 \/ 20/u)
	})

	it("refuses to commit nothing, and says why", async () => {
		const before_ = harness.records().length
		await page.press("Enter")
		await page.settle()
		assert.equal(harness.records().length, before_, "an empty commit wrote a record")
		assert.match(page.nodes.status.textContent, /nothing selected/u)
		assert.match(page.nodes.progress.textContent, /^overlays · 3 \/ 20/u)
	})

	it("steps back onto an answered multi item with its set reloaded", async () => {
		await page.press("u")
		assert.match(page.nodes.progress.textContent, /^overlays · 2 \/ 20/u)
		assert.match(page.nodes.pending.textContent, /^none · enter or space records$/u)
		// Editing it: turn `none` off, turn `barcode_or_price` on, commit. The new answer supersedes.
		await page.press("5")
		await page.press("3")
		await page.press("Enter")
		await page.settle()
		const record = harness.records().at(-1) as OracleLabelRecord
		assert.deepEqual(record.answer, ["barcode_or_price"])
		assert.match(page.nodes.progress.textContent, /^overlays · 3 \/ 20/u)
	})

	it("answers the AZERTY digit row the same way", async () => {
		// The reviewer's French Mac sends `é` for the key printed `2`; an enum that needs a modifier
		// held down is an enum answered wrong (keys.js).
		await page.press("é")
		assert.match(page.nodes.pending.textContent, /^label_logo · enter or space records$/u)
		await page.press("é")
		assert.match(page.nodes.pending.textContent, /^select every value that applies/u)
	})
})

describe("bcde-validation analysis", () => {
	it("compares sets order-insensitively and refuses a kappa it cannot support", () => {
		assert.ok(sameAnswer(["b", "a"], ["a", "b"]))
		assert.ok(!sameAnswer("a", ["a"]))
		assert.equal(jaccard(["a", "b"], ["a"]), 0.5)
		assert.equal(jaccard(["a"], ["a"]), 1)

		const tiny = cohenKappa([
			["yes", "yes"],
			["no", "yes"],
		])
		assert.equal(tiny.kappa, null)
		assert.equal(tiny.n, 2)
		assert.match(tiny.reason!, /below the 10-row floor/u)

		// A table where both raters used one value is 0/0, not zero.
		const degenerate = cohenKappa(Array.from({ length: 12 }, () => ["yes", "yes"] as [string, string]))
		assert.equal(degenerate.kappa, null)
		assert.match(degenerate.reason!, /one value only/u)

		const real = cohenKappa([
			...Array.from({ length: 8 }, () => ["yes", "yes"] as [string, string]),
			...Array.from({ length: 4 }, () => ["no", "no"] as [string, string]),
		])
		assert.equal(real.kappa, 1)
	})

	it("runs on an unanswered round and reports the join width rather than a rate", async () => {
		const analysis = analyzeBcdeValidation(fixture, [], await readPilotAnswers(), {
			warehousePath: "(none)",
			fixturePath: BCDE_VALIDATION_FIXTURE_PATH,
			pilotRunPath: "(pilot)",
		})
		assert.equal(analysis.counts.artworks, 20)
		assert.equal(analysis.counts.items, 160)
		assert.equal(analysis.counts.answers, 0)
		assert.equal(analysis.counts.unanswered, 160)
		// The finding, carried in the numbers and not only in prose.
		assert.equal(analysis.counts.joinExactBytes, 2)
		assert.equal(analysis.counts.joinOtherRendition, 1)
		assert.equal(analysis.counts.joinNone, 17)
		assert.equal(analysis.perQuestion.length, 8)
		for (const question of analysis.perQuestion) {
			for (const variant of ["E", "F"] as const) {
				for (const grade of JOINED_GRADES) {
					assert.equal(question.perVariant[variant][grade].kappa.kappa, null)
				}
			}
		}
		// The scoping claim is that the two join grades are never pooled. That is a claim about the
		// SHAPE of the output, so it is checked as one: no joined statistic exists that is not keyed by
		// a grade, which makes a pooled number unwritable rather than merely absent today.
		for (const question of analysis.perQuestion) {
			for (const variant of ["E", "F"] as const) {
				assert.deepEqual(Object.keys(question.perVariant[variant]).sort(), [...JOINED_GRADES].sort())
			}
			assert.deepEqual(Object.keys(question.variantAgreementSubset).sort(), [...JOINED_GRADES].sort())
			assert.deepEqual(Object.keys(question.variantSplitSubset).sort(), [...JOINED_GRADES].sort())
		}
		// Never one accuracy number: the scoping says so before any figure is printed.
		assert.ok(analysis.scoping.some((note) => note.startsWith("NEVER ONE ACCURACY NUMBER")))
		assert.ok(analysis.summaryLines.some((line) => line.startsWith("JOIN TO THE PILOT:")))
	})

	it("buckets a reviewer answer against each variant, and splits the E-and-F-agree subset out", async () => {
		const harness = await startHarness()
		try {
			await seedBcdeValidationRound(harness.handle.service)
			const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
			const stored = (await readJsonl<StoredOracleBatch>(harness.batchLogPath))[0] as StoredOracleBatch
			const pilot = await readPilotAnswers()
			// Answer `subject_kind` on the two artworks the pilot decoded on identical bytes.
			const joined = fixture.items.filter((item) => item.questionKey === "subject_kind" && pilot.bySha.has(item.sha256))
			assert.equal(joined.length, 2)
			for (const item of joined) {
				const token = Object.entries(stored.answerTokens).find(([, id]) => id === item.itemId)![0]
				const model = pilot.bySha.get(item.sha256)!.get("E")!.subject_kind as string
				await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${token}/answer`, { answer: model })
			}
			const analysis = analyzeBcdeValidation(fixture, harness.records(), pilot, {
				warehousePath: harness.warehousePath,
				fixturePath: BCDE_VALIDATION_FIXTURE_PATH,
				pilotRunPath: "(pilot)",
			})
			const subject = analysis.perQuestion.find((question) => question.key === "subject_kind")!
			assert.equal(subject.answered, 2)
			assert.equal(subject.unanswered, 18)
			// Both answered artworks are exact-byte joins, so the exact-byte grade carries both and the
			// rendition grade carries none. Nothing anywhere adds the two together.
			assert.equal(subject.perVariant.E.exact_bytes.buckets.agreement, 2, "the reviewer echoed E and did not land in its bucket")
			assert.equal(subject.perVariant.E.exact_bytes.buckets.disagreement, 0)
			assert.equal(subject.perVariant.E.same_artwork_other_rendition.n, 0, "the rendition row was never answered here")
			// E and F both said `object` on these two, so both rows are in the agreement subset.
			assert.equal(subject.variantAgreementSubset.exact_bytes.n, 2)
			assert.equal(subject.variantAgreementSubset.same_artwork_other_rendition.n, 0)
			assert.equal(subject.variantSplitSubset.exact_bytes.n, 0)
			assert.equal(subject.perVariant.E.exact_bytes.kappa.kappa, null, "a kappa on two rows is an artefact")
			assert.deepEqual(
				subject.perArtwork.filter((row) => row.joinGrade === "exact_bytes").length,
				2,
			)
			assert.equal(subject.perArtwork.filter((row) => row.joinGrade === "same_artwork_other_rendition").length, 1)
			// The other-rendition row names the file the pilot actually decoded, so it cannot be mistaken
			// for an identical-bytes comparison.
			const other = subject.perArtwork.find((row) => row.joinGrade === "same_artwork_other_rendition")!
			assert.ok(other.pilotImagePath !== null && other.pilotImagePath !== other.imagePath)
		} finally {
			await harness.stop()
		}
	})

	it("keeps array answers as arrays through the warehouse reader", async () => {
		const harness = await startHarness()
		try {
			await seedBcdeValidationRound(harness.handle.service)
			const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
			const token = payload.body.items.filter((item: any) => item.questionKey === "overlays")[0].token
			await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${token}/answer`, {
				answer: ["watermark", "parental_advisory"],
			})
			const collected = collectBcdeAnswers(harness.records(), BATCH)
			assert.equal(collected.byQuestionAndImage.size, 1)
			const [answer] = [...collected.byQuestionAndImage.values()]
			assert.deepEqual(answer, ["parental_advisory", "watermark"])
			const analysis = analyzeBcdeValidation(fixture, harness.records(), await readPilotAnswers(), {
				warehousePath: harness.warehousePath,
				fixturePath: BCDE_VALIDATION_FIXTURE_PATH,
				pilotRunPath: "(pilot)",
			})
			const question = analysis.perQuestion.find((entry) => entry.key === "overlays")!
			assert.equal(question.kind, "multi")
			assert.equal(question.multi!.meanSize, 2)
			assert.equal(question.multi!.singletonRate, 0)
			assert.deepEqual(question.reviewerDistribution, { "parental_advisory+watermark": 1 })
			// One spelling of an answer, everywhere. The distribution key, the kappa token and the set
			// comparison used to canonicalize independently — source order, sorted, sorted — and agreed
			// only because every array in the real round has length 1. This one has two.
			assert.deepEqual(Object.keys(question.reviewerDistribution), ["parental_advisory+watermark"])
		} finally {
			await harness.stop()
		}
	})

	it("files a reviewer refusal as can't-tell, never as 'agreed with neither wording'", () => {
		// The manifest case from the real round: signature_carrier on 0e/…29f5b2b4 — the reviewer said
		// not_applicable, E said `text`, F said `background`. The variants split, and the old split
		// subset reported `reviewerWithNeither: 1`, which reads as a substantive human answer that
		// missed both wordings. The human declined to answer. That is the exact pooling the third
		// bucket exists to prevent, and it happened inside the file whose header says so.
		const analysis = committedAnalysis()
		const carrier = analysis.perQuestion.find((entry: any) => entry.key === "signature_carrier")!
		const split = carrier.variantSplitSubset.exact_bytes
		assert.equal(split.n, 1, "E and F split on exactly one exact-byte row")
		assert.equal(split.reviewerCantTell, 1, "the reviewer refused")
		assert.equal(split.reviewerWithNeither, 0, "and refusing is not disagreeing with both")
		assert.equal(split.reviewerWithE, 0)
		assert.equal(split.reviewerWithF, 0)
		// Same row, same reading, in the buckets: can't-tell there too, and left out of the kappa
		// vector entirely, because a kappa has two categories and no third.
		assert.equal(carrier.perVariant.E.exact_bytes.buckets.cant_tell, 1)
		assert.equal(carrier.perVariant.E.exact_bytes.n, 2, "two exact-byte rows carry a comparison")
		assert.equal(carrier.perVariant.E.exact_bytes.kappa.n, 1, "only one of them is scorable as agreement")
	})

	it("reports the gate contradictions against the pre-registered ceiling, rather than omitting them", () => {
		// CR-2. The reviewer's own answers break §15.6-(3)'s ceiling by more than four times, and the
		// committed analysis computed no gate-consistency section at all — the word "contradiction"
		// appeared only inside prose. This is the human reference standard the VLM is to be graded
		// against; whatever the right reading is, it has to be on the record first.
		const gates = committedAnalysis().gateConsistency
		assert.equal(gates.ceiling, CONTRADICTION_CEILING)
		assert.equal(gates.rowsConsidered, 20)
		assert.equal(gates.totalContradictions, 9)
		assert.equal(gates.artworksWithAnyContradiction, 8)
		assert.equal(gates.withinCeiling, false, "45% against a 10% ceiling")
		const byRule = new Map(gates.rules.map((rule: any) => [rule.id, rule]))
		assert.equal(byRule.get(9).contradictions, 5, "#9 — a noun for a subject it said was absent")
		assert.equal(byRule.get(4).contradictions, 1)
		assert.equal(byRule.get(5).contradictions, 1)
		assert.equal(byRule.get(6).contradictions, 2, "#6 — the accent question refusing itself")
		assert.equal(byRule.get(10).contradictions, 0, "not every rule fired, and the zero is stated")
		// Every row of the pre-registered table appears, including the ones this round cannot check:
		// "we did not measure it" and "it did not fire" are different facts.
		assert.deepEqual(
			gates.rules.map((rule: any) => rule.id),
			GATE_CONSISTENCY_RULES.map((rule) => rule.id),
		)
		for (const id of [1, 2, 3, 11, 12]) {
			assert.equal(byRule.get(id).evaluable, false)
			assert.match(byRule.get(id).notEvaluableBecause, /did not ask/u)
		}
		// The corroborating detail §15.6-(3) asks for: the abstention value never fired where its own
		// gate had just made it the only consistent answer.
		const abstention = gates.abstentionUse.find((entry: any) => entry.questionKey === "subject_kind")
		assert.equal(abstention.refusalsUsed, 0)
		assert.equal(abstention.opportunities, 5)
		// The reading of that 45%, revised 2026-08-03 on the reviewer's own account of it. It used to say
		// "THIS IS THE HUMAN REFERENCE STANDARD, and it is internally inconsistent by more than the bar
		// set for the machine" — which reads as a defect in the reviewer, and the reviewer says it is
		// not one. The rate stays; the reading is that the ceiling was pre-registered for the MODEL's
		// joint constrained decode, where coherence is structural, and that the gate/dependent pairs
		// conflate existence-of-a-dominant-X with kind-of-the-best-available-X. Both figures and both
		// sentences are pinned, because the number without this reading is the misquote.
		assert.match(gates.reading, /CATEGORY ERROR AND THIS RATE IS NOT A REVIEWER DEFECT/u)
		assert.match(gates.reading, /THE PAIRS CONFLATE TWO VARIABLES/u)
		assert.match(gates.reading, /loose end L-b/u)
		assert.match(gates.ceilingSource, /architecture rather than accuracy/u)
		assert.ok(
			gates.contradictions.every((entry: any) => typeof entry.imageId === "string" && typeof entry.gateAnswer === "string"),
			"reported per artwork, so a reading can be argued from the rows rather than from the rate",
		)
	})

	it("checks the stored answers against the vocabulary, not only against 'string or string[]'", () => {
		const check = committedAnalysis().vocabulary
		assert.equal(check.checked, 160)
		assert.deepEqual(check.offVocabulary, [])
		assert.deepEqual(check.unsortedArrays, [])
		assert.deepEqual(check.duplicateValues, [])
		assert.deepEqual(check.emptyArrays, [])
		assert.deepEqual(check.wrongShape, [])
		assert.deepEqual(check.orphanAnswers, [])
	})

	it("catches a hand-appended answer that never went through the server", async () => {
		// The gap this closes: write-time enforcement is sound and could not be got past, but the
		// analyzer type-checked the shape and nothing else, so a row appended to the warehouse by hand
		// with a value outside the vocabulary would have passed the analysis in silence.
		const harness = await startHarness()
		try {
			await seedBcdeValidationRound(harness.handle.service)
			const item = fixture.items.find((entry) => entry.questionKey === "grain_or_noise")!
			const forged = {
				id: "ol-forged-1",
				type: "oracle-label",
				ts: new Date().toISOString(),
				schema: "v3.0",
				author: { kind: "human", id: "test-reviewer" },
				batch: { id: BATCH, purpose: "oracle-validation" },
				questionKey: "grain_or_noise",
				imageId: item.imageId,
				imagePath: item.imagePath,
				sha256: item.sha256,
				stratum: item.stratum,
				labelSchemaVersion: BCDE_LABEL_SCHEMA_VERSION,
				answer: "maybe",
				confidence: null,
				ambiguityNote: null,
				fundedBy: [],
			}
			const analysis = analyzeBcdeValidation(
				fixture,
				[...harness.records(), forged as never],
				await readPilotAnswers(),
				{ warehousePath: harness.warehousePath, fixturePath: BCDE_VALIDATION_FIXTURE_PATH, pilotRunPath: "(pilot)" },
			)
			assert.deepEqual(analysis.vocabulary.offVocabulary, [
				{ questionKey: "grain_or_noise", imageId: item.imageId, value: "maybe" },
			])
			assert.match(analysis.vocabulary.reading, /did not come through the server/u)
		} finally {
			await harness.stop()
		}
	})

	it("verifies the three-artwork overlap against the image bytes, not against id prefixes", async () => {
		// MA-8. The join is `artworkId` string equality across three mixed id namespaces — the exact
		// pattern CONVENTIONS.md forbids ("identify artworks by full path + content hash, never by id
		// prefix"), in the join that produces the headline. The answer was right; the method was not.
		const verification = await verifyPilotOverlap(fixture, await readPilotAnswers(), REPO_ROOT)
		assert.deepEqual(verification.roundHashMismatches, [], "every round artwork hashes to what it declares")
		assert.deepEqual(verification.pilotHashMismatches, [])
		assert.deepEqual(verification.unresolvedPaths, [])
		assert.equal(verification.pairs.length, 3)
		assert.equal(verification.pairs.filter((pair) => pair.proposedGrade === "exact_bytes").length, 2)
		const rendition = verification.pairs.find((pair) => pair.proposedGrade === "same_artwork_other_rendition")!
		assert.ok(rendition.lumaCorrelation !== null && rendition.lumaCorrelation > 0.98, "0.9862 in the audit's own sweep")
		assert.ok(verification.pairs.every((pair) => pair.accepted))

		// And an id match the pictures do not support is not a join: it drops to `none` rather than
		// contributing a comparison nobody checked.
		const rejected = {
			...verification,
			pairs: verification.pairs.map((pair) =>
				pair.proposedGrade === "same_artwork_other_rendition" ? { ...pair, accepted: false, reason: "test" } : pair,
			),
		}
		const analysis = analyzeBcdeValidation(
			fixture,
			[],
			await readPilotAnswers(),
			{ warehousePath: "(none)", fixturePath: BCDE_VALIDATION_FIXTURE_PATH, pilotRunPath: "(pilot)" },
			() => new Date(0),
			rejected,
		)
		assert.equal(analysis.counts.joinOtherRendition, 0)
		assert.equal(analysis.counts.joinNone, 18)
		assert.equal(analysis.counts.joinExactBytes, 2)
	})

	it("says plainly when a run was given no verification at all", async () => {
		const analysis = analyzeBcdeValidation(fixture, [], await readPilotAnswers(), {
			warehousePath: "(none)",
			fixturePath: BCDE_VALIDATION_FIXTURE_PATH,
			pilotRunPath: "(pilot)",
		})
		assert.equal(analysis.overlapVerification, null)
		// `null`, not `false`: "no verification was supplied to this run" and "checked and fine" are
		// different statements, and only one of them may be inferred from silence.
		assert.ok(
			analysis.perQuestion.every((question) => question.perArtwork.every((row) => row.joinVerified === null)),
			"every row says it was not checked",
		)
		assert.ok(analysis.summaryLines.some((line) => line.includes("JOIN NOT VERIFIED IN THIS RUN")))
	})
})

/**
 * Cross-batch supersession — a reconciliation round's answers reaching an earlier round's analysis.
 *
 * The defect this pins. `collectBcdeAnswers` scoped every record to the analyzed batch BEFORE it
 * resolved supersession, so a superseder written by another batch was counted as `skipped.otherBatch`
 * and never reached the chain. `bcde-gate-reconciliation-1` is exactly that: a separate batch whose
 * records name `bcde-validation-1`'s in `supersedes`, by design — "answers supersede
 * bcde-validation-1's for the same (question, artwork); nothing is edited or deleted". The analysis
 * therefore went on reporting superseded answers as current after the reconciliation was released.
 *
 * The fix is NOT to make the old figures move. Both readings are produced and both are kept:
 *
 *  - AS GIVEN (`gateConsistency`, `perQuestion`) — what this round's by-question passes recorded. It
 *    is the measurement of that elicitation design, and it must survive any later re-asking, because
 *    it is the only evidence for whether the contradiction rate was an artefact of the design.
 *  - STANDING (`reconciliation.standing.*`) — the end of every chain, wherever the chain goes. It is
 *    the reviewer's current position and the only reading a downstream consumer may use.
 *
 * A test that only checked "standing moved" would pass against an implementation that overwrote the
 * as-given figures, which is the failure mode that would destroy the round's own measurement. Every
 * assertion below is therefore paired: standing changed AND as-given did not.
 */
describe("cross-batch supersession", () => {
	const ORIGINAL_BATCH = "cross-batch-source-1"
	const RECONCILIATION_BATCH = "cross-batch-reconciliation-1"
	const LATER_BATCH = "cross-batch-reconciliation-2"

	/** The fixture's own item for a (question, artwork), so a synthetic record lands in a real column. */
	function itemFor(questionKey: string, index = 0) {
		const items = fixture.items.filter((item) => item.questionKey === questionKey)
		assert.ok(items.length > index, `the round asks ${questionKey}`)
		return items[index]
	}

	let serial = 0
	function label(options: {
		questionKey: string
		imageId: string
		answer: string | string[]
		batchId: string
		supersedes?: string
		revision?: number
		author?: { kind: "human" | "agent"; id: string }
	}): OracleLabelRecord {
		serial += 1
		const item = fixture.items.find((entry) => entry.questionKey === options.questionKey && entry.imageId === options.imageId)!
		const record = {
			id: `o-xbatch-${String(serial).padStart(4, "0")}`,
			type: "oracle-label" as const,
			// Ascending, so file order and the `supersedes` chain agree; the reader must not need them to.
			ts: new Date(Date.UTC(2026, 7, 3, 0, 0, serial)).toISOString(),
			schema: "v3.0",
			author: options.author ?? { kind: "human" as const, id: "flo" },
			imageId: options.imageId,
			artwork: {
				// The fixture stores repo-root-relative paths; the warehouse identifies artworks by full path.
				path: `${REPO_ROOT}/${item.imagePath}`,
				sha256: item.sha256,
				rendition: { width: 300, height: 300, format: "jpeg", bytes: 1, collection: "sharded-corpus", artworkId: item.artworkId },
			},
			labelSchemaVersion: fixture.labelSchemaVersion,
			questionKey: options.questionKey,
			answer: options.answer,
			confidence: null,
			ambiguityNote: null,
			stratum: item.stratum,
			supersedes: options.supersedes ?? null,
			revision: options.revision ?? 1,
			batch: { id: options.batchId, purpose: "oracle-validation", itemCount: 1, fundedBy: ["a synthetic round, for this test only"] },
		}
		// Synthetic records that the warehouse itself would refuse prove nothing about the reader.
		validateRecord(record as unknown as Parameters<typeof validateRecord>[0])
		return record as unknown as OracleLabelRecord
	}

	/** Rule 9's contradiction: a noun for a subject the gate said was absent. */
	const gate = itemFor("has_dominant_subject")
	const dependent = fixture.items.find((item) => item.questionKey === "subject_kind" && item.imageId === gate.imageId)!

	const asGivenRecords = [
		label({ questionKey: "has_dominant_subject", imageId: gate.imageId, answer: "none", batchId: ORIGINAL_BATCH }),
		label({ questionKey: "subject_kind", imageId: dependent.imageId, answer: "person", batchId: ORIGINAL_BATCH }),
	]
	/** The reconciliation: the reviewer saw the pair together and repaired the dependent. */
	const superseder = label({
		questionKey: "subject_kind",
		imageId: dependent.imageId,
		answer: "not_applicable",
		batchId: RECONCILIATION_BATCH,
		supersedes: asGivenRecords[1].id,
		revision: 2,
	})

	it("carries the standing answer across the batch boundary, and leaves the as-given answer where it was", () => {
		const collected = collectBcdeAnswers([...asGivenRecords, superseder], ORIGINAL_BATCH)
		const key = `subject_kind ${dependent.imageId}`
		assert.equal(collected.byQuestionAndImage.get(key), "person", "the as-given reading must not be rewritten by a later batch")
		assert.equal(collected.standingByQuestionAndImage.get(key), "not_applicable", "the standing reading must follow the chain out of the batch")
		// The gate was not re-asked, so both readings agree on it — and it is reported in neither diff.
		assert.equal(collected.byQuestionAndImage.get(`has_dominant_subject ${gate.imageId}`), "none")
		assert.equal(collected.standingByQuestionAndImage.get(`has_dominant_subject ${gate.imageId}`), "none")
		assert.deepEqual(collected.supersedingBatchIds, [RECONCILIATION_BATCH])
		assert.equal(collected.crossBatchSupersessions.length, 1)
		const [crossed] = collected.crossBatchSupersessions
		assert.equal(crossed.questionKey, "subject_kind")
		assert.equal(crossed.imageId, dependent.imageId)
		assert.equal(crossed.asGiven, "person")
		assert.equal(crossed.standing, "not_applicable")
		assert.equal(crossed.changed, true)
		assert.deepEqual(
			crossed.chain.map((link) => link.batchId),
			[ORIGINAL_BATCH, RECONCILIATION_BATCH],
		)
	})

	it("follows a chain through several batches, and the latest link wins", () => {
		const later = label({
			questionKey: "subject_kind",
			imageId: dependent.imageId,
			answer: "abstract_shape",
			batchId: LATER_BATCH,
			supersedes: superseder.id,
			revision: 3,
		})
		const collected = collectBcdeAnswers([...asGivenRecords, superseder, later], ORIGINAL_BATCH)
		const key = `subject_kind ${dependent.imageId}`
		assert.equal(collected.byQuestionAndImage.get(key), "person")
		assert.equal(collected.standingByQuestionAndImage.get(key), "abstract_shape", "the END of the chain stands, not its first link")
		assert.deepEqual(collected.supersedingBatchIds, [RECONCILIATION_BATCH, LATER_BATCH])
		assert.deepEqual(
			collected.crossBatchSupersessions[0].chain.map((link) => link.batchId),
			[ORIGINAL_BATCH, RECONCILIATION_BATCH, LATER_BATCH],
		)
	})

	it("does not let a machine-authored record from another batch supersede a human answer", () => {
		// The batch filter was doing this work by accident. Dropping it must not open a door the other
		// three checks were closing: a VLM row that names a human row is not a re-answer.
		const machine = label({
			questionKey: "subject_kind",
			imageId: dependent.imageId,
			answer: "vehicle",
			batchId: RECONCILIATION_BATCH,
			supersedes: asGivenRecords[1].id,
			revision: 2,
			author: { kind: "agent", id: "some-vlm" },
		})
		const collected = collectBcdeAnswers([...asGivenRecords, machine], ORIGINAL_BATCH)
		assert.equal(collected.standingByQuestionAndImage.get(`subject_kind ${dependent.imageId}`), "person")
		assert.deepEqual(collected.crossBatchSupersessions, [])
	})

	it("reports the gate contradiction as given AND its repair as standing, under names that cannot be swapped", async () => {
		const analysis = analyzeBcdeValidation(fixture, [...asGivenRecords, superseder], await readPilotAnswers(), {
			warehousePath: "(none)",
			fixturePath: BCDE_VALIDATION_FIXTURE_PATH,
			pilotRunPath: "(pilot)",
			batchId: ORIGINAL_BATCH,
		})

		// AS GIVEN — the by-question round's own measurement. It stays on the record.
		assert.equal(analysis.gateConsistency.totalContradictions, 1)
		assert.equal(analysis.gateConsistency.artworksWithAnyContradiction, 1)
		assert.equal(new Map(analysis.gateConsistency.rules.map((rule) => [rule.id, rule])).get(9)!.contradictions, 1)
		assert.equal(analysis.perQuestion.find((question) => question.key === "subject_kind")!.reviewerDistribution.person, 1)

		// STANDING — the reviewer's position after the reconciliation.
		const standing = analysis.reconciliation.standing
		assert.equal(standing.gateConsistency.totalContradictions, 0)
		assert.equal(standing.gateConsistency.artworksWithAnyContradiction, 0)
		assert.equal(new Map(standing.gateConsistency.rules.map((rule) => [rule.id, rule])).get(9)!.contradictions, 0)
		const standingSubject = standing.perQuestion.find((question) => question.key === "subject_kind")!
		assert.equal(standingSubject.reviewerDistribution.not_applicable, 1)
		assert.equal(standingSubject.reviewerDistribution.person, undefined)

		// The diff names both, and the per-rule row carries the as-given count beside the standing one.
		assert.deepEqual(analysis.reconciliation.supersedingBatchIds, [RECONCILIATION_BATCH])
		assert.equal(analysis.reconciliation.answersSuperseded, 1)
		assert.equal(analysis.reconciliation.answersChanged, 1)
		assert.equal(analysis.reconciliation.gateComparison.asGiven.totalContradictions, 1)
		assert.equal(analysis.reconciliation.gateComparison.standing.totalContradictions, 0)
		const rule9 = analysis.reconciliation.gateComparison.perRule.find((rule) => rule.id === 9)!
		assert.equal(rule9.asGivenContradictions, 1)
		assert.equal(rule9.standingContradictions, 0)
		assert.equal(rule9.resolved, 1)
		const moved = analysis.reconciliation.changedDistributions.find((entry) => entry.questionKey === "subject_kind")!
		assert.deepEqual(moved.moved, [
			{ value: "not_applicable", asGiven: 0, standing: 1 },
			{ value: "person", asGiven: 1, standing: 0 },
		])

		// And the prose keeps them apart, so a reader skimming the summary cannot pick up the wrong one.
		assert.ok(analysis.reconciliation.asGivenLabel.startsWith("INDEPENDENT ELICITATION"))
		assert.ok(analysis.reconciliation.standingLabel.startsWith("JOINT ELICITATION"))
		assert.ok(analysis.summaryLines.some((line) => line.startsWith("GATE CONSISTENCY [INDEPENDENT ELICITATION")))
		assert.ok(analysis.summaryLines.some((line) => line.startsWith("GATE CONSISTENCY [JOINT ELICITATION")))
		assert.ok(analysis.scoping.some((note) => note.startsWith("TWO ELICITATION MODES, LABELLED, NEVER BLENDED")))
	})

	it("frames the two states as elicitation modes, never as errors and their correction", async () => {
		// The reviewer's own reading, 2026-08-03, and the reason this test exists: "if you ask me *not
		// to make a story* then I will give you those 2 answers, but if you ask me *jointly* then I will
		// change my answers so they are coherent together." Both are honest. `none + animal` says
		// *nothing dominates, but an animal is present* — strictly more than the reconciled answer can
		// carry. An analysis that calls the first pass wrong throws that away, and the wording is the
		// only thing standing between a future reader and that conclusion.
		const analysis = analyzeBcdeValidation(fixture, [...asGivenRecords, superseder], await readPilotAnswers(), {
			warehousePath: "(none)",
			fixturePath: BCDE_VALIDATION_FIXTURE_PATH,
			pilotRunPath: "(pilot)",
			batchId: ORIGINAL_BATCH,
		})
		const prose = [
			analysis.reconciliation.reading,
			analysis.reconciliation.whatThisIs,
			analysis.gateConsistency.reading,
			analysis.gateConsistency.ceilingSource,
			...analysis.scoping,
		].join("\n")
		// The clarification is quoted verbatim and dated, not paraphrased — a paraphrase drifts straight
		// back into "the first answers were wrong".
		assert.ok(analysis.reconciliation.reading.includes(ELICITATION_MODE_CLARIFICATION))
		assert.ok(ELICITATION_MODE_CLARIFICATION.startsWith("reviewer, 2026-08-03:"))
		assert.ok(prose.includes("NOT A DRAFT AND A CORRECTION"))
		// L-b's reading of the 45%: the ceiling was written for the model's joint constrained decode, so
		// carrying it across to independent human passes compares two instruments.
		assert.ok(analysis.gateConsistency.reading.includes("CATEGORY ERROR"))
		assert.ok(analysis.gateConsistency.reading.includes("CONFLATE TWO"))
		assert.ok(analysis.gateConsistency.ceilingSource.includes("architecture rather"))
		// No word in the whole output may call one reading correct and the other mistaken.
		for (const banned of [/\bcorrected\b/iu, /\bthe correct answers\b/iu, /\breviewer error\b/iu, /\bfixed the mistake\b/iu]) {
			assert.doesNotMatch(prose, banned, `the analysis calls one elicitation mode the other's correction: ${banned}`)
		}
	})

	it("says so when nothing supersedes the round, rather than omitting the block", async () => {
		const analysis = analyzeBcdeValidation(fixture, asGivenRecords, await readPilotAnswers(), {
			warehousePath: "(none)",
			fixturePath: BCDE_VALIDATION_FIXTURE_PATH,
			pilotRunPath: "(pilot)",
			batchId: ORIGINAL_BATCH,
		})
		// "Nothing superseded it" and "nobody looked" are different facts, and an absent field reads as
		// the second one.
		assert.deepEqual(analysis.reconciliation.supersedingBatchIds, [])
		assert.deepEqual(analysis.reconciliation.crossBatchSupersessions, [])
		assert.equal(analysis.reconciliation.standing.gateConsistency.totalContradictions, analysis.gateConsistency.totalContradictions)
		assert.ok(analysis.reconciliation.standingLabel.includes("equals the independent reading"))
	})
})
