/**
 * The cascade ground-truth round: the primary judge answering the question the policy is about.
 *
 * `reviews/phase-0-adversarial/cascade-basis.md` established that the "take D only on
 * `multiple_distinct_fields`" policy rests entirely on the published accepted-palette gradient flag,
 * that the flag agrees with the reviewer on 14 of 24 gold-30 items (κ=0.0625), and that **0** of the
 * 19 corpus-wide `multiple_distinct_fields` covers — and 0 of the 8 the policy would commit — carry
 * a reviewer `ground_type` answer with a usable binary. This round is the missing elicitation.
 *
 * Two things can silently ruin it, and both are asserted here rather than trusted:
 *
 *   1. **The wrong population.** If the policy's 8 were not inside the 19, deduplicating to 19 would
 *      drop the very covers the decision commits.
 *   2. **The wrong words.** `ground_type` was asked under two different criteria. v1 ("continuous
 *      shading within one physical surface") is what `premise-disambiguation-1` served; v2 is
 *      §A.2's correction, which explicitly demotes surface identity and is what variant D was run
 *      under. An answer is only comparable to D's row if it was given under D's criterion, so the
 *      criterion served here is checked against `ORACLE_QUESTION_SET.md` itself, character for
 *      character.
 */
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import {
	CASCADE_GROUND_TRUTH_BATCH_ID,
	CASCADE_GROUND_TRUTH_FIXTURE_PATH,
	CASCADE_LABEL_SCHEMA_VERSION,
	GROUND_TYPE_QUESTION,
	GROUND_TYPE_V2_CRITERION,
	GROUND_TYPE_V2_INSTRUCTION,
	GROUND_TYPE_V2_QUESTION,
	PREMISE_DISAMBIGUATION_FIXTURE_PATH,
	buildCascadeGroundTruthFixture,
	readPolicySliceShas,
	readVariantDAnswers,
	serializeFixture,
	type OracleValidationFixture,
} from "../src/review-server/oracle-validation.ts"
import { startHarness, type Harness } from "../src/review-server/test-support.ts"

const QUESTION_SET_PATH = fileURLToPath(new URL("../ORACLE_QUESTION_SET.md", import.meta.url))

const fixture = await buildCascadeGroundTruthFixture()

/**
 * §A.2's blockquote, as plain text.
 *
 * Markdown emphasis and backticks are the only thing dropped — the same reduction §A.2 itself
 * describes for the prompt files ("the prompt rendering differs … only in typography"). If a word
 * ever changes on either side, this parse and the constant stop matching, which is the point.
 */
async function criterionParagraphsFromTheQuestionSet(): Promise<string[]> {
	const doc = await readFile(QUESTION_SET_PATH, "utf8")
	const heading = doc.indexOf("### A.2 The criterion")
	assert.ok(heading > 0, "ORACLE_QUESTION_SET.md has no §A.2")
	const lines = doc.slice(heading).split("\n")
	const quoted: string[] = []
	let started = false
	for (const line of lines) {
		if (line.startsWith(">")) {
			started = true
			quoted.push(line.replace(/^>\s?/u, ""))
		} else if (started && line.trim().length === 0 && quoted.at(-1) === "") break
		else if (started && !line.startsWith(">")) break
	}
	return quoted
		.join("\n")
		.split(/\n\s*\n/u)
		.map((paragraph) => paragraph.replaceAll(/[*`]/gu, "").split(/\s+/u).join(" ").trim())
		.filter((paragraph) => paragraph.length > 0)
}

describe("cascade ground-truth fixture", () => {
	it("matches the committed file", async () => {
		assert.equal(serializeFixture(fixture), await readFile(CASCADE_GROUND_TRUTH_FIXTURE_PATH, "utf8"))
	})

	it("is deterministic — the same sources give the same round", async () => {
		assert.deepEqual(await buildCascadeGroundTruthFixture(), fixture)
	})

	it("selects every corpus-wide multiple_distinct_fields cover, and no other", async () => {
		const dAnswers = await readVariantDAnswers()
		const selected = new Set(fixture.items.map((item) => item.sha256))
		for (const [sha256, groundType] of dAnswers) {
			if (!selected.has(sha256)) continue
			assert.equal(groundType, "multiple_distinct_fields", `${sha256} is in the round without being D's answer value`)
		}
		assert.equal(fixture.items.length, 19)
		assert.equal(fixture.selection.counts.corpus_wide_multiple_distinct_fields, 19)
		// D emitted the value 20 times; the 20th artwork's own accepted palettes disagree on the
		// gradient boolean, so it is outside the primary population the audited numbers were computed
		// over. Stated as a number in the fixture rather than left as a silent difference.
		assert.equal(fixture.selection.counts.d_answered_multiple_distinct_fields, 20)
		assert.equal(fixture.selection.counts.excluded_not_in_primary_population, 1)
	})

	it("contains all 8 covers the policy would commit — the deduplication drops none of them", async () => {
		const policy = await readPolicySliceShas()
		assert.equal(policy.size, 8)
		const selected = new Set(fixture.items.map((item) => item.sha256))
		for (const sha256 of policy) assert.ok(selected.has(sha256), `the policy commits ${sha256} and the round never asks about it`)
		assert.equal(fixture.selection.counts.policy_slice_inside_the_corpus_wide_set, 8)
	})

	it("identifies every artwork by path and content hash, never by id prefix", () => {
		assert.equal(new Set(fixture.items.map((item) => item.sha256)).size, fixture.items.length)
		for (const item of fixture.items) {
			assert.match(item.sha256, /^[0-9a-f]{64}$/u)
			assert.ok(item.imagePath.length > 0)
			assert.ok(item.rendition.longEdgePx > 0)
			assert.equal(item.rendition.source, "research/v3/data/oracle-premise/eval-set.json")
		}
	})

	it("carries no model answer, no flag, no route and no bucket", () => {
		const serialized = serializeFixture(fixture)
		for (const leak of ["shaded_field\":", "flag_gradient", "b_unmapped", "cascade_binary", "D_ground_type", "truth_binary", "in_gold30"]) {
			assert.ok(!serialized.includes(leak), `the fixture leaks ${leak}`)
		}
		for (const item of fixture.items) {
			assert.deepEqual(Object.keys(item).sort(), [
				"artworkId",
				"collection",
				"imageId",
				"imagePath",
				"itemId",
				"questionKey",
				"rendition",
				"sha256",
				"stratum",
			])
		}
	})

	it("joins to variant D's rows: the reviewer's schema is the model's schema", () => {
		assert.equal(fixture.labelSchemaVersion, CASCADE_LABEL_SCHEMA_VERSION)
		assert.equal(fixture.labelSchemaVersion, "group-a.v2")
		// Not the disambiguation round's schema — that round asked a different criterion, and §A.2
		// records that no re-reading of its numbers is legitimate under this wording.
		assert.notEqual(fixture.labelSchemaVersion, "group-a.v1")
	})

	it("serves ORACLE_QUESTION_SET.md §A.2 — the reviewer-signed corrected criterion — word for word", async () => {
		const paragraphs = await criterionParagraphsFromTheQuestionSet()
		assert.equal(paragraphs.length, 4, "§A.2's block is not four paragraphs any more")
		assert.equal(GROUND_TYPE_V2_CRITERION, paragraphs.slice(0, 3).join("\n\n"))
		assert.equal(GROUND_TYPE_V2_INSTRUCTION, paragraphs[3])
		assert.equal(fixture.questions[0].preamble, GROUND_TYPE_V2_CRITERION)
		assert.equal(fixture.questions[0].instruction, GROUND_TYPE_V2_INSTRUCTION)
	})

	it("does not serve the v1 criterion the disambiguation round used", async () => {
		const v1 = JSON.parse(await readFile(PREMISE_DISAMBIGUATION_FIXTURE_PATH, "utf8")) as OracleValidationFixture
		const served = `${fixture.questions[0].preamble} ${fixture.questions[0].instruction}`
		assert.notEqual(fixture.questions[0].instruction, v1.questions[0].instruction)
		assert.ok(!served.includes("within one physical surface"), "the round serves the superseded v1 criterion")
		assert.ok(served.includes("neither required nor decisive"), "the round does not serve the correction")
	})

	it("does not serve any prompt variant's wording", async () => {
		const served = `${fixture.questions[0].preamble} ${fixture.questions[0].instruction} ${fixture.questions[0].question}`
		for (const variant of ["group-a.v2.variant-c.json", "group-a.v2.variant-d.json"]) {
			const prompt = JSON.parse(
				await readFile(fileURLToPath(new URL(`../oracle/premise/prompts/${variant}`, import.meta.url)), "utf8"),
			) as { prompt: string }
			// The variants add a precedence rule of their own on top of the shared block. Quoting the
			// question set means that rule is absent here; quoting a variant would mean it leaked in.
			assert.ok(!served.includes("WHICH ANSWERS ARE FOR WHAT"), `the round serves ${variant}'s own framing`)
			assert.ok(!prompt.prompt.includes(fixture.questions[0].question), `${variant} renders this round's stem`)
		}
	})

	it("reuses the disambiguation round's stem, keys, labels and hotkeys byte for byte", async () => {
		assert.equal(GROUND_TYPE_V2_QUESTION.question, GROUND_TYPE_QUESTION.question)
		assert.equal(GROUND_TYPE_V2_QUESTION.key, GROUND_TYPE_QUESTION.key)
		assert.deepEqual(
			GROUND_TYPE_V2_QUESTION.answers.map((answer) => [answer.key, answer.label, answer.hotkey]),
			GROUND_TYPE_QUESTION.answers.map((answer) => [answer.key, answer.label, answer.hotkey]),
		)
		// The glosses are the ONE thing that changes, and only where v1's described the corrected prior.
		assert.notEqual(GROUND_TYPE_V2_QUESTION.answers[1].gloss, GROUND_TYPE_QUESTION.answers[1].gloss)
	})

	it("keeps all three escape values on the keyboard", () => {
		const keys = fixture.questions[0].answers.map((answer) => answer.key)
		for (const escape of ["full_scene", "pattern_or_texture", "none_discernible"]) {
			assert.ok(keys.includes(escape), `${escape} is not offered; the round would manufacture a commit`)
		}
		assert.equal(new Set(fixture.questions[0].answers.map((answer) => answer.hotkey)).size, 6)
	})

	it("is one by-question pass, as §6 asks", () => {
		assert.equal(fixture.serveMode, undefined)
		assert.equal(fixture.questions.length, 1)
		assert.equal(new Set(fixture.serveOrder).size, fixture.items.length)
		for (const item of fixture.items) assert.equal(item.reconciliation, undefined)
	})
})

describe("cascade ground-truth round in the review server", () => {
	let harness: Harness

	before(async () => {
		harness = await startHarness()
	})

	after(async () => {
		await harness?.stop()
	})

	it("pushes with batch metadata that says what it tests", async () => {
		const pushed = await harness.handle.service.pushOracleValidation(fixture, ["what it tests: the cascade policy decision"])
		assert.equal(pushed.batchId, CASCADE_GROUND_TRUTH_BATCH_ID)
		assert.equal(pushed.itemCount, 19)
		const payload = harness.handle.service.oracleValidationPayload(CASCADE_GROUND_TRUTH_BATCH_ID)
		assert.equal(payload.purpose, "oracle-validation")
		assert.equal(payload.serveMode, "by-question")
		assert.equal(payload.questions[0].preamble, GROUND_TYPE_V2_CRITERION)
		assert.equal(payload.items.length, 19)
	})

	it("records an answer under variant D's schema, so the two rows join", async () => {
		const payload = harness.handle.service.oracleValidationPayload(CASCADE_GROUND_TRUTH_BATCH_ID)
		await harness.handle.service.putOracleAnswer(CASCADE_GROUND_TRUTH_BATCH_ID, payload.items[0].token, "multiple_distinct_fields")
		const label = harness.records().filter((record) => record.type === "oracle-label").at(-1)
		assert.ok(label !== undefined)
		assert.equal(label.labelSchemaVersion, "group-a.v2")
		assert.equal(label.questionKey, "ground_type")
		assert.equal(label.answer, "multiple_distinct_fields")
		assert.equal(label.author.kind, "human")
		assert.equal(label.supersedes, null)
	})
})
