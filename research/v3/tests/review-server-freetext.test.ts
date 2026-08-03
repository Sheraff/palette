/**
 * The ground free-text round — `ground-freetext-1` (REVIEW_UI.md §4).
 *
 * This is the first round in the server with no answer vocabulary, and the things that can fail
 * silently here are different from every closed round's.
 *
 *  - **The context block.** The round asks "why did no tag fit", which is unanswerable without
 *    showing which tag the reviewer reached for. If the prior answer is missing, wrong, or shown
 *    unlabelled, the round either cannot be answered or elicits a justification instead of a
 *    description. The join to that prior answer is on **sha256**, because the two rounds spell some
 *    ids differently and an id join would hang the wrong answer on a cover — silently.
 *  - **The open answer.** Every validation the closed path applies — shape against `kind`,
 *    membership, sortedness, no-repeats — would reject every valid answer here. What replaces them
 *    has to still refuse an empty one, because "" and "I see no ground" are different answers and
 *    the field cannot tell them apart. That confusion is the entire reason this round exists.
 *  - **Counting.** The round is stored as `oracle-label` rather than `note` for one measured
 *    reason: the warehouse status CLI counts `reviewed` from verdicts, vetoes and oracle-labels
 *    only. A round stored as notes reports `reviewed=0` forever. That is asserted here, against the
 *    real CLI, because it is the whole justification for the storage choice.
 *  - **The page.** `/oracle` renders a grid of answer options and would show an empty page for a
 *    question with none, so the dashboard must route this round to `/freetext` — and must keep
 *    routing every closed round to `/oracle`.
 */
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import type { OracleLabelRecord } from "../src/warehouse/records.ts"
import {
	CASCADE_BATCH_ID,
	FREETEXT_LABEL_SCHEMA_VERSION,
	FREETEXT_MIN_LENGTH,
	GROUND_FREETEXT_BATCH_ID,
	GROUND_FREETEXT_CONTEXT_LABEL,
	GROUND_FREETEXT_CONTEXT_NOTE,
	GROUND_FREETEXT_FIXTURE_PATH,
	GROUND_FREETEXT_INSTRUCTION,
	GROUND_FREETEXT_PROMPT,
	GROUND_FREETEXT_QUESTION_KEY,
	buildGroundFreetextFixture,
	standingCascadeAnswers,
} from "../src/review-server/freetext.ts"
import { batchReviewPaths, seedGroundFreetextRound } from "../src/review-server/server.ts"
import { validateFixture, type OracleValidationFixture } from "../src/review-server/oracle-validation.ts"
import { call, startHarness, type Harness } from "../src/review-server/test-support.ts"

const run = promisify(execFile)
const WAREHOUSE_CLI = fileURLToPath(new URL("../src/warehouse/cli.ts", import.meta.url))
const CASCADE_FIXTURE_PATH = fileURLToPath(new URL("../data/oracle-validation/cascade-ground-truth-1.json", import.meta.url))

const fixture = JSON.parse(await readFile(GROUND_FREETEXT_FIXTURE_PATH, "utf8")) as OracleValidationFixture

describe("ground free-text fixture", () => {
	it("asks one open question, with no vocabulary at all", () => {
		validateFixture(fixture)
		assert.equal(fixture.batchId, GROUND_FREETEXT_BATCH_ID)
		assert.equal(fixture.labelSchemaVersion, FREETEXT_LABEL_SCHEMA_VERSION)
		assert.equal(fixture.questions.length, 1)
		const [question] = fixture.questions
		assert.equal(question.kind, "freetext")
		assert.equal(question.key, GROUND_FREETEXT_QUESTION_KEY)
		assert.equal(question.question, GROUND_FREETEXT_PROMPT)
		assert.equal(question.instruction, GROUND_FREETEXT_INSTRUCTION)
		// The instrument itself. A free-text question with even one option would be a closed question
		// with extra steps, and the round would measure whether the reviewer accepts a new word rather
		// than which word is missing.
		assert.deepEqual(question.answers, [])
	})

	it("covers exactly the nine covers the cascade verdict named, once each", () => {
		assert.equal(fixture.items.length, 9)
		assert.equal(new Set(fixture.items.map((item) => item.sha256)).size, 9, "a cover asked twice would collect two answers with no rule for choosing")
		assert.deepEqual(fixture.serveOrder, fixture.items.map((item) => item.itemId))
		for (const item of fixture.items) assert.equal(item.questionKey, GROUND_FREETEXT_QUESTION_KEY)
	})

	it("reuses the cascade round's own item rows, so the two answers are about the same bytes", async () => {
		const cascade = JSON.parse(await readFile(CASCADE_FIXTURE_PATH, "utf8")) as OracleValidationFixture
		const byHash = new Map(cascade.items.map((item) => [item.sha256, item]))
		for (const item of fixture.items) {
			const source = byHash.get(item.sha256)
			assert.ok(source !== undefined, `${item.imagePath} is not a cascade cover`)
			assert.equal(item.imagePath, source.imagePath)
			assert.equal(item.imageId, source.imageId)
			assert.equal(item.stratum, source.stratum)
			assert.deepEqual(item.rendition, source.rendition)
		}
	})

	it("carries the reviewer's own standing cascade answer as context on every item", () => {
		for (const item of fixture.items) {
			assert.ok(item.priorAnswer !== undefined, `${item.imagePath} has no context; "why did no tag fit" would name no tag`)
			assert.equal(item.priorAnswer.batchId, CASCADE_BATCH_ID)
			assert.equal(item.priorAnswer.questionKey, "ground_type")
			// Every cover in this round is here BECAUSE the reviewer said `none_discernible` and then
			// said the token did not mean what it says.
			assert.equal(item.priorAnswer.answer, "none_discernible")
		}
		const [question] = fixture.questions
		assert.equal(question.contextLabel, GROUND_FREETEXT_CONTEXT_LABEL)
		assert.equal(question.contextNote, GROUND_FREETEXT_CONTEXT_NOTE)
		// The framing is what keeps the block from reading as an accusation. If it ever stops saying so,
		// the round starts collecting justifications instead of descriptions.
		assert.match(question.contextLabel, /Context, not a question/u)
		assert.match(question.contextNote, /nothing needs correcting/u)
	})

	it("joins the prior answer on the content hash, not on the image id", async () => {
		// The real hazard, with the real data: the cascade fixture spells two of these ids with a `.jpg`
		// the warehouse records drop, so an id join silently loses covers or mismatches them. Feeding
		// the builder a map keyed by hash with ONE entry changed proves the hash is what is read.
		const cascade = JSON.parse(await readFile(CASCADE_FIXTURE_PATH, "utf8")) as OracleValidationFixture
		const priorAnswers = new Map(fixture.items.map((item) => [item.sha256, "none_discernible"]))
		const target = fixture.items[0]
		priorAnswers.set(target.sha256, "flat_field")
		const rebuilt = await buildGroundFreetextFixture({ priorAnswers, cascadeFixturePath: CASCADE_FIXTURE_PATH })
		const moved = rebuilt.items.find((item) => item.sha256 === target.sha256)!
		assert.equal(moved.priorAnswer!.answer, "flat_field")
		assert.equal(rebuilt.items.filter((item) => item.priorAnswer!.answer === "none_discernible").length, 8)
		assert.ok(cascade.items.some((item) => item.imageId.endsWith(".jpg")), "the id-spelling hazard this guards is real in the data")
	})

	it("refuses to build a round whose context line would be blank", async () => {
		await assert.rejects(
			buildGroundFreetextFixture({ priorAnswers: new Map(), cascadeFixturePath: CASCADE_FIXTURE_PATH }),
			/no cascade answer/u,
		)
	})

	it("reads the STANDING cascade answer, not the first one", () => {
		// `artofficial.jpg` carries two answers in the real log — `full_scene`, then `none_discernible`.
		// Showing the superseded one would ask the reviewer why a word they had already moved away from
		// did not fit.
		const artwork = { path: "/x/a.jpg", sha256: "a".repeat(64), rendition: { width: 1, height: 1, format: "jpeg", bytes: 1, collection: "c", artworkId: null } }
		const base = {
			type: "oracle-label" as const,
			schema: "v3.0",
			author: { kind: "human" as const, id: "flo" },
			imageId: "a.jpg",
			artwork,
			labelSchemaVersion: "group-a.v2",
			questionKey: "ground_type",
			confidence: null,
			ambiguityNote: null,
			stratum: null,
			batch: { id: CASCADE_BATCH_ID, purpose: "oracle-validation", itemCount: 1, fundedBy: ["t"] },
		}
		const records = [
			{ ...base, id: "o-1", ts: "2026-08-03T10:00:00.000Z", answer: "full_scene" },
			{ ...base, id: "o-2", ts: "2026-08-03T10:01:00.000Z", answer: "none_discernible" },
		] as unknown as OracleLabelRecord[]
		assert.equal(standingCascadeAnswers(records, CASCADE_BATCH_ID).get("a".repeat(64)), "none_discernible")
		// A different round's answers never leak into this round's context.
		assert.equal(standingCascadeAnswers(records, "some-other-batch").size, 0)
	})
})

describe("ground free-text round in the review server", () => {
	let harness: Harness

	before(async () => {
		harness = await startHarness()
		await seedGroundFreetextRound(harness.handle.service)
	})

	after(async () => {
		await harness?.stop()
	})

	it("serves the question with no answer options, and the context on every item", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${GROUND_FREETEXT_BATCH_ID}`)
		assert.equal(payload.status, 200)
		const [question] = payload.body.questions
		assert.equal(question.kind, "freetext")
		assert.deepEqual(question.answers, [])
		assert.equal(question.contextLabel, GROUND_FREETEXT_CONTEXT_LABEL)
		assert.equal(question.contextNote, GROUND_FREETEXT_CONTEXT_NOTE)
		assert.equal(payload.body.items.length, 9)
		for (const item of payload.body.items) {
			assert.equal(item.priorAnswer.answer, "none_discernible")
			assert.equal(item.priorAnswer.batchId, CASCADE_BATCH_ID)
			// The media handle is an opaque token, as on every other round — the fixture item id and the
			// real path never reach the browser.
			assert.match(item.media, /^\/media\//u)
			assert.equal(item.answer, null)
		}
	})

	it("records free text as an oracle-label under the free-text schema marker", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${GROUND_FREETEXT_BATCH_ID}`)
		const token = payload.body.items[0].token
		const text = "A photographed wall, mostly out of focus, with a bright rim of sky top-left. It is one surface but two brightnesses, so neither flat_field nor multiple_distinct_fields is true."
		const saved = await call(harness.base, "PUT", `/api/oracle-validation/${GROUND_FREETEXT_BATCH_ID}/items/${token}/answer`, { answer: text })
		assert.equal(saved.status, 200)

		const written = harness
			.records()
			.filter((record): record is OracleLabelRecord => record.type === "oracle-label")
			.filter((record) => record.batch?.id === GROUND_FREETEXT_BATCH_ID)
		assert.equal(written.length, 1)
		const [record] = written
		assert.equal(record.answer, text, "the prose is the measurement; anything that reshapes it loses the round's only product")
		assert.equal(record.labelSchemaVersion, FREETEXT_LABEL_SCHEMA_VERSION, "without the marker, a tabulation would group nine sentences as nine categories")
		assert.equal(record.questionKey, GROUND_FREETEXT_QUESTION_KEY)
		assert.equal(record.author.kind, "human")
		assert.ok(record.artwork !== null, "the note has to be retrievable per cover")
		assert.equal(record.batch!.itemCount, 9)
		assert.ok(record.batch!.fundedBy.some((line) => line.includes("WHICH WORDS")), "§7: the batch says what it tests")
		assert.ok(record.batch!.fundedBy.some((line) => line.includes("CASCADE_POLICY_VERDICT")), "§7: and what funded it")
	})

	it("refuses an empty answer, because blank and 'no ground' are different facts", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${GROUND_FREETEXT_BATCH_ID}`)
		const token = payload.body.items[1].token
		for (const answer of ["", "   ", "\n\t"]) {
			const rejected = await call(harness.base, "PUT", `/api/oracle-validation/${GROUND_FREETEXT_BATCH_ID}/items/${token}/answer`, { answer })
			assert.equal(rejected.status, 400, `an empty answer (${JSON.stringify(answer)}) was recorded`)
		}
		const tooShort = await call(harness.base, "PUT", `/api/oracle-validation/${GROUND_FREETEXT_BATCH_ID}/items/${token}/answer`, {
			answer: "x".repeat(FREETEXT_MIN_LENGTH - 1),
		})
		assert.equal(tooShort.status, 400)
		// A list is not prose. The closed path's shape check still has to fire in the other direction.
		const asList = await call(harness.base, "PUT", `/api/oracle-validation/${GROUND_FREETEXT_BATCH_ID}/items/${token}/answer`, {
			answer: ["flat_field"],
		})
		assert.equal(asList.status, 400)
	})

	it("supersedes rather than edits when the reviewer rewrites an answer", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${GROUND_FREETEXT_BATCH_ID}`)
		const token = payload.body.items[2].token
		const first = await call(harness.base, "PUT", `/api/oracle-validation/${GROUND_FREETEXT_BATCH_ID}/items/${token}/answer`, {
			answer: "first thought, half written",
		})
		const second = await call(harness.base, "PUT", `/api/oracle-validation/${GROUND_FREETEXT_BATCH_ID}/items/${token}/answer`, {
			answer: "second thought, and this is the one that stands",
		})
		assert.equal(second.body.revision, first.body.revision + 1)
		const written = harness
			.records()
			.filter((record): record is OracleLabelRecord => record.type === "oracle-label")
			.filter((record) => record.batch?.id === GROUND_FREETEXT_BATCH_ID && record.imageId === fixture.items[2].imageId)
		assert.equal(written.length, 2, "the first draft was edited away instead of superseded")
		assert.equal(written[0].answer, "first thought, half written")
		assert.equal((written[1] as { supersedes?: string | null }).supersedes, written[0].id)
	})

	it("resumes where the reviewer stopped, across a restart", async () => {
		// Everything the page needs to resume comes back from the WAREHOUSE, not from memory — this is
		// what makes the round answerable in ten-minute chunks (REVIEW_UI.md §1). Two answers were
		// written above (the middle item only ever got refusals), and one of them was rewritten.
		harness = await harness.restart()
		const payload = harness.handle.service.oracleValidationPayload(GROUND_FREETEXT_BATCH_ID)
		const answered = payload.items.filter((item) => item.answer !== null)
		assert.equal(answered.length, 2, "the answers written above did not survive the restart")
		assert.ok(
			answered.some((item) => typeof item.answer === "string" && item.answer.startsWith("second thought")),
			"a superseded draft came back instead of the standing answer",
		)
		assert.ok(
			!answered.some((item) => typeof item.answer === "string" && item.answer.startsWith("first thought")),
			"the superseded draft is what came back",
		)
	})

	it("counts in the warehouse status CLI — the whole reason these are oracle-labels", async () => {
		const { stdout } = await run("node", ["--experimental-strip-types", WAREHOUSE_CLI, "status", "--json", "--file", harness.warehousePath], {
			env: { ...process.env, NODE_NO_WARNINGS: "1" },
		})
		// One JSON object per line, as the CLI emits it.
		const rows = stdout
			.split("\n")
			.filter((line) => line.trim().length > 0)
			.map((line) => JSON.parse(line) as { batchId: string; itemCount: number | null; reviewed: number; pending: number | null; labelUnit: string | null })
		const row = rows.find((entry) => entry.batchId === GROUND_FREETEXT_BATCH_ID)
		assert.ok(row !== undefined, "the round is invisible to `warehouse status`")
		assert.equal(row.itemCount, 9)
		// A `note`-backed round would sit at reviewed=0 / pending=9 forever, released or not. That is
		// the bug the labelUnit fix removed on 2026-08-03 and the reason this round is not notes.
		assert.equal(row.reviewed, 2)
		assert.equal(row.pending, 7)
		// One question, so items are keyed by image — the half of the labelUnit fix this round exercises.
		assert.equal(row.labelUnit, "image")
	})

	it("routes to /freetext, and leaves every closed round on /oracle", () => {
		const freetext = batchReviewPaths({
			batchId: GROUND_FREETEXT_BATCH_ID,
			kind: "oracle-validation",
			labelSchemaVersion: FREETEXT_LABEL_SCHEMA_VERSION,
		})
		assert.equal(freetext.page, `/freetext?batch=${GROUND_FREETEXT_BATCH_ID}`)
		assert.equal(freetext.payload, `/api/oracle-validation/${GROUND_FREETEXT_BATCH_ID}`)
		// `/oracle` renders a grid of answer options; for a question with none it renders an empty page.
		for (const schema of ["group-a.v2", "group-bcde.v1"]) {
			const closed = batchReviewPaths({ batchId: "some-round", kind: "oracle-validation", labelSchemaVersion: schema })
			assert.equal(closed.page, "/oracle?batch=some-round")
		}
	})

	it("shows up on the dashboard with its item count and its remaining work", async () => {
		const dashboard = await call(harness.base, "GET", "/api/dashboard")
		const row = [...dashboard.body.open, ...dashboard.body.released].find((entry: { batchId: string }) => entry.batchId === GROUND_FREETEXT_BATCH_ID)
		assert.ok(row !== undefined, "a round the reviewer cannot find on the dashboard is a round that does not get answered")
		assert.equal(row.itemCount, 9)
		assert.equal(row.judgedCount, 2)
		assert.equal(row.remaining, 7)
		assert.equal(row.page, `/freetext?batch=${GROUND_FREETEXT_BATCH_ID}`)
	})

	it("refuses a write after release", async () => {
		// Release refuses a half-answered round, so finish it first — which also exercises the round
		// end to end, all nine covers written.
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${GROUND_FREETEXT_BATCH_ID}`)
		for (const item of payload.body.items) {
			if (item.answer !== null) continue
			const saved = await call(harness.base, "PUT", `/api/oracle-validation/${GROUND_FREETEXT_BATCH_ID}/items/${item.token}/answer`, {
				answer: `a described ground for ${item.questionKey}, in the reviewer's own words`,
			})
			assert.equal(saved.status, 200)
		}
		await harness.handle.service.release(GROUND_FREETEXT_BATCH_ID)

		const refused = await call(harness.base, "PUT", `/api/oracle-validation/${GROUND_FREETEXT_BATCH_ID}/items/${payload.body.items[8].token}/answer`, {
			answer: "too late to write this",
		})
		// Before release everything is freely editable; after it, a second thought changes shape
		// (REVIEW_UI.md §1). The round is not silently accepting writes that nothing will read.
		assert.equal(refused.status, 409)
	})
})
