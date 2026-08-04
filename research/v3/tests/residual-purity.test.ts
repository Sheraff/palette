/**
 * The residual-purity rounds — `residual-purity-1` (RESIDUAL_EXPERIMENT_NOTES.md §11.11) and
 * `residual-purity-2` (RESIDUAL_V5_NOTES.md §12.9).
 *
 * Each round funds a **pre-registered** adoption bar, so it dies in three ways and this file guards
 * all three, for both:
 *
 *  - **the reviewer must not be able to read the residual.** Every number the bar is computed from —
 *    the guard-ON and guard-OFF residuals, the static comparison, the contamination causes, the
 *    noun(s) that were subtracted — has to stay out of the fixture and out of the served payload. A
 *    reviewer who can see that a panel scored 0.98 is not a second opinion about it.
 *  - **the pair must survive the join.** An answer is about one (sheet, panel); the guard-ON and
 *    guard-OFF answers for one sheet are the between-variant comparison the bar's second clause is
 *    about, and if the two items shared a (question, image) key they would overwrite each other.
 *  - **the page must actually work.** Loose end L-i: `review-ui/freetext.js` crawled clean under
 *    `verify-live` and was completely dead to the keyboard. L-i's revival condition is "any new
 *    review-UI page or interaction mode is served to the reviewer", and a new answer vocabulary is
 *    exactly that — so each round's last describe block drives the real `review-ui/oracle.js` and
 *    presses its own keys for real. Round 2 adds a fourth (`c`), which is a new answer vocabulary and
 *    therefore re-arms L-i on its own account.
 *
 * ## What round 2's blocks are actually checking, beyond repeating round 1's
 *
 * Round 2 is the same instrument with one deliberate change and one deliberate non-change, and both
 * halves are falsifiable here.
 *
 *  - **The change:** four answers, not three; `c` for `cant_tell`; a framing that routes figure/ground
 *    ambiguity to the escape instead of to `mostly field`; and `residual-purity.v2` as the label
 *    schema, because a fourth answer drains the other three and the two rounds' answers must not pool.
 *  - **The non-change:** the stem, preamble, instruction, panels, cut, strata, quotas and bar. Those
 *    are asserted **equal to round 1's**, not merely well-formed — the round's whole claim is that it
 *    tests the same bar under a corrected elicitation, and a stem that drifted by a word would make it
 *    a different question with an inherited threshold.
 *
 * Named `residual-purity` rather than `review-server-*` on purpose, following `sam-mask-quality`:
 * the review-server workstream owns that test glob, and this round is the oracle workstream's.
 *
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/v3/tests/residual-purity.test.ts
 */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { PREMISE_DISAMBIGUATION_FIXTURE_VERSION, serializeFixture, validateFixture } from "../src/review-server/oracle-validation.ts"
import {
	RESIDUAL_PANELS,
	RESIDUAL_PURITY_2_ANSWERS,
	RESIDUAL_PURITY_2_BATCH_ID,
	RESIDUAL_PURITY_2_FIXTURE_PATH,
	RESIDUAL_PURITY_2_FRAMING,
	RESIDUAL_PURITY_2_FUNDED_BY,
	RESIDUAL_PURITY_2_LABEL_SCHEMA_VERSION,
	RESIDUAL_PURITY_2_SAMPLE_PATH,
	RESIDUAL_PURITY_2_SEED,
	RESIDUAL_PURITY_ANSWERS,
	RESIDUAL_PURITY_BATCH_ID,
	RESIDUAL_PURITY_FIXTURE_PATH,
	RESIDUAL_PURITY_FRAMING,
	RESIDUAL_PURITY_FUNDED_BY,
	RESIDUAL_PURITY_INSTRUCTION,
	RESIDUAL_PURITY_LABEL_SCHEMA_VERSION,
	RESIDUAL_PURITY_PREAMBLE,
	RESIDUAL_PURITY_ROUND_1,
	RESIDUAL_PURITY_ROUND_2,
	RESIDUAL_PURITY_SEED,
	SHEET_COLLECTION,
	buildResidualPurityFixture,
	questionKeyFor,
	readResidualSample,
	seedResidualPurity2Round,
	seedResidualPurityRound,
} from "../src/review-server/residual-purity.ts"
import { REPO_ROOT } from "../src/review-server/server.ts"
import { readJsonl } from "../src/review-server/store.ts"
import { call, openPage, startHarness, type FakePage, type Harness } from "../src/review-server/test-support.ts"
import type { StoredOracleBatch } from "../src/review-server/types.ts"
import type { OracleLabelRecord } from "../src/warehouse/records.ts"

const BATCH = RESIDUAL_PURITY_BATCH_ID
const BATCH_2 = RESIDUAL_PURITY_2_BATCH_ID
const ORACLE_PAGE = fileURLToPath(new URL("../review-ui/oracle.js", import.meta.url))

/**
 * The sheets are PNGs and the repository ignores `*.png`, so they are build products, not commits.
 * Everything below needs them on disk; fail with the command that makes them rather than with fifty
 * confusing hash errors.
 */
const manifest = await readResidualSample()
const manifest2 = await readResidualSample(RESIDUAL_PURITY_2_SAMPLE_PATH)
for (const [builder, entries] of [
	["build_residual_sheets_v4.py", manifest.items],
	["build_residual_sheets_v5.py", manifest2.items],
] as const) {
	const missing = entries.filter((entry) => !existsSync(`${REPO_ROOT}/${entry.sheet}`))
	assert.equal(
		missing.length,
		0,
		`${missing.length} sheets are not on disk. Run: research/v3/oracle/sam/.venv/bin/python research/v3/oracle/sam/${builder}`,
	)
}

const fixture = await buildResidualPurityFixture()
const fixture2 = await buildResidualPurityFixture({ round: RESIDUAL_PURITY_ROUND_2 })

/** Everything the reviewer must not be able to read, as it is spelled in the v4 manifest. */
const ANSWER_KEY_FIELDS = [
	"residual_guard_on",
	"residual_guard_off",
	"residual_static_guard_off",
	"contamination_causes",
	"dynamic_concepts_asked",
	"dynamic_concepts_fired",
	"subject_noun_prompt",
	"subject_noun_raw",
	"subject_noun_disposition",
	"subject_kind_agreed",
]

/**
 * The same, as the v5 manifest spells it.
 *
 * v5 renamed or pluralised most of them and added four of its own, so reusing the v4 list would have
 * left `residual_guard_on_uniform`, `noun_tags_fired` and `v4_single_noun_prompt` unguarded while
 * every assertion still passed. Enumerated from the manifest's own keys below, so a builder that adds
 * a fifteenth field cannot slip past this list by being forgotten.
 */
const ANSWER_KEY_FIELDS_2 = [
	"residual_guard_on_uniform",
	"residual_guard_on_exempt",
	"residual_guard_off",
	"residual_static_guard_off",
	"contamination_causes",
	"dynamic_concepts_asked",
	"dynamic_concepts_fired",
	"noun_tags_fired",
	"subject_kind_agreed",
	"subject_noun_prompts",
	"subject_nouns_all_raw",
	"subject_nouns_barred_count",
	"subject_nouns_used_count",
	"v4_single_noun_prompt",
]

describe("residual-purity sample", () => {
	/**
	 * The round is pre-registered, and this is the assertion that says which registration.
	 *
	 * §11.11 fixed the seed at 20260804 **deliberately not** §8's 20260803, so that an overlap
	 * between the v3 and v4 samples could never be read as a paired design. A sample built under any
	 * other seed is a different sample and the pre-registered bar was not set for it.
	 */
	it("is the v4 sample §11.11 pre-registered, at its own seed and cut", () => {
		assert.equal(manifest.meta.seed, 20260804)
		assert.equal(manifest.meta.run, "sam-eval-142-v4-nouns")
		assert.equal(manifest.meta.panel_cut, "subtraction")
		assert.equal(manifest.meta.built_by, "oracle/sam/build_residual_sheets_v4.py")
		assert.equal(manifest.items.length, 25)
		for (const entry of manifest.items) assert.equal(entry.panel_cut, "subtraction")
	})

	it("holds the five named strata, at the quotas the pools allow", () => {
		const counted = new Map<string, number>()
		for (const entry of manifest.items) counted.set(entry.stratum, (counted.get(entry.stratum) ?? 0) + 1)
		assert.deepEqual(
			[...counted].sort(),
			[
				["class-only", 2],
				["contaminated", 6],
				["noun-fired", 8],
				["noun-silent", 5],
				["static-only-clean", 4],
			],
		)
		// The one place the drawn sample is allowed to fall short of the quota, and only there: a
		// stratum can never yield more sheets than its pool holds. `class-only` asked for 3 and the
		// whole population is 2. Any other shortfall is a broken draw, not a small pool.
		for (const [stratum, count] of counted) {
			const quota = manifest.meta.quotas[stratum]
			const pool = manifest.meta.pool_sizes[stratum]
			assert.equal(count, Math.min(quota, pool), `${stratum} drew ${count} from a pool of ${pool} against a quota of ${quota}`)
		}
		// The reweighting the bar is applied to needs the pool sizes, so they must all be there.
		for (const stratum of counted.keys()) assert.ok(manifest.meta.pool_sizes[stratum] > 0)
	})

	it("names a sheet on disk for every item, hashed as the fixture serves it", async () => {
		for (const entry of manifest.items) {
			assert.match(entry.sheet, /^research\/v3\/data\/sam\/residual-sheets-v4\/resid4-[0-9a-f]{12}\.png$/u)
			const bytes = await readFile(`${REPO_ROOT}/${entry.sheet}`)
			const sha256 = createHash("sha256").update(bytes).digest("hex")
			const items = fixture.items.filter((item) => item.imageId === entry.item_id)
			assert.equal(items.length, RESIDUAL_PANELS.length)
			for (const item of items) assert.equal(item.sha256, sha256, `${entry.item_id}: the fixture was built against other bytes`)
		}
	})
})

describe("residual-purity fixture", () => {
	it("is deterministic and matches the committed file", async () => {
		assert.deepEqual(await buildResidualPurityFixture(), fixture)
		assert.equal(
			await readFile(RESIDUAL_PURITY_FIXTURE_PATH, "utf8"),
			serializeFixture(fixture),
			"the committed fixture is not what the generator produces — regenerate with --write",
		)
	})

	it("carries the round's identity", () => {
		assert.equal(fixture.batchId, "residual-purity-1")
		assert.equal(fixture.purpose, "oracle-validation")
		// The server accepts exactly one oracle-validation fixture version; this round rides it.
		assert.equal(fixture.fixtureVersion, PREMISE_DISAMBIGUATION_FIXTURE_VERSION)
		assert.equal(fixture.labelSchemaVersion, RESIDUAL_PURITY_LABEL_SCHEMA_VERSION)
		assert.equal(fixture.labelSchemaVersion, "residual-purity.v1")
		assert.equal(fixture.seed, RESIDUAL_PURITY_SEED)
		assert.equal(fixture.seed, manifest.meta.seed, "the round must be reproducible from the sample's own seed")
		// 25 sheets, two residual panels each. REVIEW_UI.md §6: an item is one (image, question).
		assert.equal(fixture.items.length, 50)
		assert.equal(new Set(fixture.items.map((item) => item.imageId)).size, 25)
		assert.doesNotThrow(() => validateFixture(fixture))
	})

	it("serves the three-panel sheet, and names the sheet as the image", () => {
		const artworkPaths = new Set(manifest.items.map((entry) => entry.image_path))
		for (const item of fixture.items) {
			assert.match(item.imagePath, /^research\/v3\/data\/sam\/residual-sheets-v4\/resid4-[0-9a-f]{12}\.png$/u)
			assert.ok(!artworkPaths.has(item.imagePath), "the bare artwork must never be the served image")
			assert.equal(item.collection, SHEET_COLLECTION)
			assert.match(item.imageId, /^resid4-[0-9a-f]{12}$/u)
			assert.equal(item.rendition.sourceEntryId, item.imageId)
			assert.equal(item.itemId, `${item.imageId}.${item.questionKey.replace("residual_is_field.", "")}`)
			// A three-panel sheet is wider than it is tall by construction. A square one would mean the
			// builder wrote a single panel and the reviewer would be judging the artwork.
			assert.ok(item.rendition.width > item.rendition.height * 2, `${item.itemId} is not a three-panel sheet`)
		}
	})

	it("pairs the two panels of one sheet without letting them overwrite each other", () => {
		for (const entry of manifest.items) {
			const pair = fixture.items.filter((item) => item.imageId === entry.item_id)
			assert.deepEqual(
				pair.map((item) => item.questionKey).sort(),
				RESIDUAL_PANELS.map((panel) => questionKeyFor(panel.key)).sort(),
			)
			// Same file, same hash, same stratum, same artwork — one subtraction seen twice.
			assert.equal(new Set(pair.map((item) => item.imagePath)).size, 1)
			assert.equal(new Set(pair.map((item) => item.stratum)).size, 1)
			// …and two distinct (question, image) keys, which is what keeps them two answers.
			assert.equal(new Set(pair.map((item) => `${item.questionKey} ${item.imageId}`)).size, 2)
		}
	})

	it("carries no residual, no contamination cause and no noun", () => {
		const text = JSON.stringify({ items: fixture.items, questions: fixture.questions, selection: fixture.selection })
		for (const field of ANSWER_KEY_FIELDS) assert.ok(!text.includes(field), `the fixture leaks ${field}`)
		// The numbers themselves, not just their field names: a stray residual would decide the answer
		// whatever it was called.
		for (const entry of manifest.items) {
			for (const value of [entry.residual_guard_on, entry.residual_guard_off, entry.residual_static_guard_off]) {
				// Only the values that are actually distinguishing. A residual of exactly 1 prints as "1"
				// and would match any width or hash on the page; asserting on it tests nothing and fails
				// everything.
				if (String(value).length < 6) continue
				assert.ok(!text.includes(String(value)), `the fixture leaks the residual ${value}`)
			}
			// `!= null`, not `!== null`: the field is optional on the shared entry type because only the
			// v4 builder writes it, so a v5 entry has it `undefined` rather than `null`.
			const noun = entry.subject_noun_prompt
			if (noun != null && noun.length > 3) {
				assert.ok(!text.includes(`"${noun}"`), `the fixture leaks the noun ${noun}`)
			}
		}
		// `stratum` legitimately stays — the bar's reweighting is keyed on it — but it is never served.
		// The payload test below is what actually enforces that.
		for (const item of fixture.items) {
			assert.equal(Object.keys(item).sort().join(","), "artworkId,collection,imageId,imagePath,itemId,questionKey,rendition,sha256,stratum")
		}
	})

	it("asks §11.11's question once per panel, in contiguous passes, with p / m / n", () => {
		assert.equal(fixture.questions.length, 2)
		for (const [index, question] of fixture.questions.entries()) {
			const panel = RESIDUAL_PANELS[index]
			assert.equal(question.key, questionKeyFor(panel.key))
			assert.equal(question.kind, "enum", "three answers cannot be a boolean question")
			assert.deepEqual(
				question.answers.map((answer) => [answer.hotkey, answer.key]),
				[
					["p", "pure_field"],
					["m", "mostly_field"],
					["n", "not_field"],
				],
			)
			// `u` stays free, so the page keeps undo on `u` instead of moving it to Backspace; `r` stays
			// free, or the answer would silently shadow release (oracle.js checks the answer first).
			for (const reserved of ["u", "r"]) {
				assert.ok(!question.answers.some((answer) => answer.hotkey === reserved), `an answer binds ${reserved}`)
			}
			for (const answer of question.answers) assert.equal(answer.hotkey, answer.hotkey.toLowerCase(), "an uppercase hotkey is unreachable")
			// The stem names the panel by the label the sheet builder draws under it, so the reviewer
			// finds it by reading rather than by counting from the left.
			assert.ok(question.question.includes(`"${panel.label}"`), `${question.key} does not quote its panel label`)
			// …and the question itself is §11.11's, verbatim. A stem that drifts from the spec that
			// pre-registered the bar is not the round the bar was set for.
			assert.ok(
				question.question.endsWith(
					"is everything still visible here background — is there nothing left that belongs to a depicted " +
						"subject, to display text, or to an applied mark?",
				),
				`${question.key} does not ask §11.11's question`,
			)
			assert.equal(question.instruction, RESIDUAL_PURITY_INSTRUCTION)
			assert.equal(question.preamble, RESIDUAL_PURITY_PREAMBLE)
			assert.equal(question.framing, RESIDUAL_PURITY_FRAMING)
			// The three things the wording has to carry, each one a way the round would otherwise be
			// answered differently by different sheets.
			assert.match(question.preamble!, /checkerboard/u)
			assert.match(question.instruction, /Whether too much was removed is not this question/u)
			assert.match(question.framing!, /answer mostly field/u)
		}
		const byId = new Map(fixture.items.map((item) => [item.itemId, item]))
		const runs: string[] = []
		for (const id of fixture.serveOrder) {
			const key = byId.get(id)!.questionKey
			if (runs.at(-1) !== key) runs.push(key)
		}
		assert.deepEqual(runs, fixture.questions.map((question) => question.key), "the passes must be contiguous, guard ON first")
	})

	it("does not serve the same 25 sheets in the same order twice", () => {
		const byId = new Map(fixture.items.map((item) => [item.itemId, item]))
		const passes = fixture.questions.map((question) =>
			fixture.serveOrder.filter((id) => byId.get(id)!.questionKey === question.key).map((id) => byId.get(id)!.imageId),
		)
		assert.equal(passes[0].length, 25)
		assert.deepEqual([...passes[0]].sort(), [...passes[1]].sort(), "both passes must cover every sheet")
		// The reviewer meets each sheet twice. Same order twice would make pass 2 a memory test.
		assert.notDeepEqual(passes[0], passes[1], "the two passes serve the sheets in the same order")
		const sameSlot = passes[0].filter((imageId, index) => passes[1][index] === imageId).length
		assert.ok(sameSlot <= 5, `${sameSlot} of 25 sheets land in the same slot in both passes`)
	})

	it("interleaves the strata inside each pass, except where only one is left", () => {
		const byId = new Map(fixture.items.map((item) => [item.itemId, item]))
		for (const question of fixture.questions) {
			const strata = fixture.serveOrder.filter((id) => byId.get(id)!.questionKey === question.key).map((id) => byId.get(id)!.stratum)
			let run = 1
			for (let index = 1; index < strata.length; index++) {
				run = strata[index] === strata[index - 1] ? run + 1 : 1
				// Round-robin over five strata cannot stack two anywhere the strata are all still live.
				// It CAN at the tail: `noun-fired` holds 8 of the 25 sheets, so once the four smaller
				// strata are exhausted there is nothing left to interleave with and the last few items
				// are necessarily one stratum. The bound is on where a run may happen, not on nothing
				// ever repeating — a flat "no run of three" assertion would only be sayable by
				// unstratifying the shuffle.
				const inTail = index >= strata.length - 5
				assert.ok(run <= 2 || inTail, `${question.key} serves ${run} of one stratum back to back at item ${index + 1}`)
				assert.ok(run <= 3, `${question.key} serves ${run} of one stratum back to back`)
			}
		}
	})

	it("says what it is testing and what funded it (REVIEW_UI.md §7)", () => {
		assert.match(fixture.selection.rule, /pre-registered per-stratum quotas/u)
		assert.match(fixture.selection.rule, /stratum-reweighted rate/u)
		assert.match(fixture.selection.rule, /SUBTRACTION cut/u)
		assert.match(fixture.selection.rule, /not a proposal to change/u)
		assert.equal(fixture.selection.counts.sheets, 25)
		assert.equal(fixture.selection.counts.panels, 2)
		const funded = RESIDUAL_PURITY_FUNDED_BY.join("\n")
		assert.match(funded, /§11\.11/u, "the round must name the pre-registration that set its bar")
		assert.match(funded, /sam-eval-142-v4-nouns/u, "the round must name the run that produced its sheets")
		assert.match(funded, /R-3/u)
		assert.match(funded, /A6/u)
		assert.deepEqual(
			[...fixture.builtFrom].sort(),
			[
				"research/v3/data/sam/residual-sheets-v4-sample.json",
				"research/v3/data/sam/sam-eval-142-v4-nouns.jsonl",
				"research/v3/oracle/sam/RESIDUAL_EXPERIMENT_NOTES.md",
				"research/v3/oracle/sam/build_residual_sheets_v4.py",
			].sort(),
		)
	})
})

describe("residual-purity round in the review server", () => {
	let harness: Harness
	let stored: StoredOracleBatch

	before(async () => {
		harness = await startHarness()
		assert.equal(await seedResidualPurityRound(harness.handle.service), BATCH)
		stored = (await readJsonl<StoredOracleBatch>(harness.batchLogPath))[0] as StoredOracleBatch
	})

	after(async () => {
		await harness?.stop()
	})

	it("serves fifty items in pass order and nothing else", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		assert.equal(payload.status, 200)
		assert.equal(payload.body.items.length, 50)
		assert.equal(payload.body.questions.length, 2)
		assert.deepEqual(
			payload.body.items.map((item: any) => stored.answerTokens[item.token]),
			[...fixture.serveOrder],
		)
		for (const question of payload.body.questions) assert.equal(question.itemCount, 25)
		for (const item of payload.body.items) {
			assert.match(item.media, /^\/media\//u)
			assert.ok(item.width > 0 && item.height > 0)
		}
		// A by-question round carries neither block, and the page must not be handed either.
		for (const item of payload.body.items) {
			// `itemRef` is `<batch>/<token>`: the opaque handle again, so the reviewer can name a panel in
			// a message without the page ever showing which arm it came from. An id-based ref would have
			// leaked exactly that — these item ids end in `.guard_on` / `.guard_off`.
			assert.deepEqual(Object.keys(item).sort(), ["answer", "height", "itemRef", "media", "questionKey", "revision", "token", "width"])
		}
	})

	it("leaks no residual, no stratum and no item id to the browser", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		const text = JSON.stringify(payload.body)
		for (const field of ANSWER_KEY_FIELDS) assert.ok(!text.includes(field), `the payload leaks ${field}`)
		for (const entry of manifest.items) {
			for (const value of [entry.residual_guard_on, entry.residual_guard_off]) {
				if (String(value).length < 6) continue
				assert.ok(!text.includes(String(value)), `the payload leaks the residual ${value}`)
			}
		}
		for (const stratum of new Set(fixture.items.map((item) => item.stratum))) {
			assert.ok(!text.includes(stratum), `the payload leaks the stratum ${stratum}`)
		}
		for (const item of fixture.items) {
			assert.ok(!text.includes(item.itemId), `the payload leaks the item id ${item.itemId}`)
			assert.ok(!text.includes(item.imageId), `the payload leaks the sheet id ${item.imageId}`)
			assert.ok(!text.includes(item.sha256), `the payload leaks the sheet hash ${item.sha256}`)
		}
	})

	it("serves the sheet bytes as a PNG", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		const response = await fetch(`${harness.base}${payload.body.items[0].media}`)
		assert.equal(response.status, 200)
		assert.equal(response.headers.get("content-type"), "image/png")
		assert.ok(Number(response.headers.get("content-length")) > 1000)
	})

	it("records an answer as an oracle-label keyed by the sheet and the panel", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		const first = payload.body.items[0]
		const item = fixture.items.find((entry) => entry.itemId === stored.answerTokens[first.token])!
		const put = await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${first.token}/answer`, { answer: "pure_field" })
		assert.equal(put.status, 200)
		const label = harness.records().find((record) => record.type === "oracle-label") as OracleLabelRecord
		assert.equal(label.labelSchemaVersion, "residual-purity.v1")
		assert.equal(label.questionKey, item.questionKey)
		assert.equal(label.imageId, item.imageId)
		assert.equal(label.stratum, item.stratum)
		assert.equal(label.answer, "pure_field")
		assert.equal(label.author.kind, "human")
		assert.equal(label.batch?.purpose, "oracle-validation")
	})

	it("keeps the two panels of one sheet as two independent answers", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		const tokenFor = new Map<string, string>()
		for (const item of payload.body.items) tokenFor.set(stored.answerTokens[item.token], item.token)
		const sheet = manifest.items[0].item_id
		const on = tokenFor.get(`${sheet}.guard_on`)!
		const off = tokenFor.get(`${sheet}.guard_off`)!
		assert.equal((await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${on}/answer`, { answer: "not_field" })).status, 200)
		assert.equal((await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${off}/answer`, { answer: "pure_field" })).status, 200)
		const after = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		const answerFor = new Map<string, string | null>()
		for (const item of after.body.items) answerFor.set(stored.answerTokens[item.token], item.answer)
		// The whole between-variant comparison lives or dies here: one answer must not be the other.
		assert.equal(answerFor.get(`${sheet}.guard_on`), "not_field")
		assert.equal(answerFor.get(`${sheet}.guard_off`), "pure_field")
	})

	it("refuses an answer outside the vocabulary", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		const rejected = await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${payload.body.items[3].token}/answer`, {
			answer: "unsure",
		})
		assert.equal(rejected.status, 400)
		assert.match(JSON.stringify(rejected.body), /pure_field \| mostly_field \| not_field/u)
	})

	it("shows up on the dashboard as an oracle page, with no after-release view it cannot render", async () => {
		const dashboard = await call(harness.base, "GET", "/api/dashboard")
		assert.equal(dashboard.status, 200)
		const entry = [...dashboard.body.open, ...dashboard.body.released].find((candidate: any) => candidate.batchId === BATCH)
		assert.ok(entry !== undefined, "the round is not on the dashboard")
		assert.equal(entry.page, `/oracle?batch=${BATCH}`)
		assert.equal(entry.payload, `/api/oracle-validation/${BATCH}`)
		// The revisit view only knows the oracle's own schema; a round with its own gets none, and a
		// link that rendered "could not load" is the failure that guard was added for.
		assert.equal(entry.afterRelease, null)
	})
})

/**
 * The L-i guard: the page, executed.
 *
 * `verify-live` proves `oracle.js` is *served*. It cannot prove it *runs* — that is exactly how
 * `freetext.js` reached the reviewer dead to the keyboard. This block runs the real page module
 * against the real server and presses the round's own keys.
 */
describe("residual-purity page, driven by keystrokes", () => {
	const NODE_IDS = ["reconcile-prior", "reconcile-conflict", "preamble", "framing", "question", "instruction", "progress", "mapping", "stage", "undokey", "status"] as const
	let harness: Harness
	let stored: StoredOracleBatch
	let page: FakePage

	before(async () => {
		harness = await startHarness()
		await seedResidualPurityRound(harness.handle.service)
		stored = (await readJsonl<StoredOracleBatch>(harness.batchLogPath))[0] as StoredOracleBatch
		page = await openPage(harness.base, ORACLE_PAGE, NODE_IDS, `${harness.base}/oracle?batch=${BATCH}`)
	})

	after(async () => {
		await harness?.stop()
	})

	it("opens on the panel question, the preamble and the whole answer mapping", () => {
		assert.ok(page.nodes.question.textContent.includes("what remains - area guard ON"))
		assert.equal(page.nodes.instruction.textContent, RESIDUAL_PURITY_INSTRUCTION)
		assert.equal(page.nodes.preamble.textContent, RESIDUAL_PURITY_PREAMBLE)
		assert.equal(page.nodes.framing.textContent, RESIDUAL_PURITY_FRAMING)
		const lines = page.nodes.mapping.children.map((child) => child.textContent)
		assert.equal(lines.length, 3)
		for (const [index, answer] of RESIDUAL_PURITY_ANSWERS.entries()) {
			assert.ok(lines[index].includes(answer.hotkey), `${answer.key} does not show its key`)
			assert.ok(lines[index].includes(answer.label), `${answer.key} does not show its label`)
			assert.ok(lines[index].includes(answer.gloss), `${answer.key} does not show its gloss`)
		}
		assert.match(page.nodes.progress.textContent, /^residual_is_field\.guard_on · 1 \/ 25 · 0 done/u)
		// No answer binds `u`, so undo stays on `u` and the footer must say so.
		assert.equal(page.nodes.undokey.textContent, "u")
	})

	it("shows the three-panel sheet, and its bytes really load", async () => {
		const image = page.nodes.stage.children.find((child) => child.tagName === "img")
		assert.ok(image !== undefined, "the stage shows no image")
		assert.match(image.src, /^\/media\//u)
		const first = fixture.items.find((item) => item.itemId === fixture.serveOrder[0])!
		assert.equal(image.width, first.rendition.width)
		assert.equal(image.height, first.rendition.height)
		const response = await fetch(new URL(image.src, harness.base))
		assert.equal(response.status, 200)
		assert.equal(response.headers.get("content-type"), "image/png")
	})

	it("maps p / m / n to their answers, auto-advances, and records what was on screen", async () => {
		const pressed: { itemId: string; expected: string }[] = []
		for (const [index, answer] of RESIDUAL_PURITY_ANSWERS.entries()) {
			pressed.push({ itemId: fixture.serveOrder[index], expected: answer.key })
			assert.match(page.nodes.progress.textContent, new RegExp(`^residual_is_field\\.guard_on · ${index + 1} / 25`, "u"))
			await page.press(answer.hotkey)
			assert.match(page.nodes.status.textContent, new RegExp(`recorded ${answer.key}`, "u"))
		}
		assert.match(page.nodes.progress.textContent, /· 4 \/ 25 · 3 done/u, "the page did not auto-advance")
		const labels = harness.records().filter((record): record is OracleLabelRecord => record.type === "oracle-label")
		assert.equal(labels.length, 3)
		for (const [index, entry] of pressed.entries()) {
			const item = fixture.items.find((candidate) => candidate.itemId === entry.itemId)!
			assert.equal(labels[index].answer, entry.expected, `key ${RESIDUAL_PURITY_ANSWERS[index].hotkey} wrote the wrong answer`)
			// The pairing is what matters: the answer must belong to the sheet that was on screen.
			assert.equal(labels[index].artwork?.sha256, item.sha256, `answer ${index + 1} landed on the wrong sheet`)
			assert.equal(labels[index].imageId, item.imageId)
			assert.equal(labels[index].questionKey, item.questionKey)
		}
	})

	it("steps back on u and replaces the answer without deleting anything", async () => {
		const before = harness.records().length
		await page.press("u")
		assert.match(page.nodes.progress.textContent, /· 3 \/ 25 /u, "u did not step back")
		await page.press("p")
		const labels = harness.records().filter((record): record is OracleLabelRecord => record.type === "oracle-label")
		assert.equal(harness.records().length, before + 1, "the replaced answer must be a new record, not an edit")
		assert.equal(labels.at(-1)!.answer, "pure_field")
		assert.equal(labels.at(-1)!.imageId, fixture.items.find((item) => item.itemId === fixture.serveOrder[2])!.imageId)
	})

	it("resumes where the reviewer stopped", async () => {
		const reopened = await openPage(harness.base, ORACLE_PAGE, NODE_IDS, `${harness.base}/oracle?batch=${BATCH}`)
		assert.match(reopened.nodes.progress.textContent, /· 4 \/ 25 /u, "the round did not resume at the first unanswered item")
		assert.match(reopened.nodes.status.textContent, /resuming at item 4/u)
	})
})

/* =============================================================================================== */
/* residual-purity-2 — the same instrument, one answer wider (RESIDUAL_V5_NOTES.md §12.9)          */
/* =============================================================================================== */

describe("residual-purity-2 sample", () => {
	/**
	 * Which pre-registration this round is, asserted rather than assumed.
	 *
	 * §12.9 fixed the seed at 20260805 **deliberately not** §11.11's 20260804 and not §8's 20260803,
	 * so that an overlap between any two of the three samples could never be read as a paired design.
	 * A sample built under another seed, or drawn from another run, is a different sample and the
	 * pre-registered bar was not set for it. The builder now refuses both cases; this says so out loud.
	 */
	it("is the v5 sample §12.9 pre-registered, at its own seed, run and cut", () => {
		assert.equal(manifest2.meta.seed, 20260805)
		assert.equal(manifest2.meta.seed, RESIDUAL_PURITY_2_SEED)
		assert.equal(manifest2.meta.run, "sam-eval-142-v5-allnouns")
		assert.equal(manifest2.meta.panel_cut, "subtraction")
		assert.equal(manifest2.meta.built_by, "oracle/sam/build_residual_sheets_v5.py")
		assert.equal(manifest2.meta.proposed_round_id, "residual-purity-2")
		assert.equal(manifest2.items.length, 24)
		for (const entry of manifest2.items) assert.equal(entry.panel_cut, "subtraction")
		// Not the v4 sample under a new name: the two samples are drawn from different runs and must
		// not share a single sheet id.
		const v4Ids = new Set(manifest.items.map((entry) => entry.item_id))
		for (const entry of manifest2.items) assert.ok(!v4Ids.has(entry.item_id))
	})

	it("refuses to build against the other round's sample", async () => {
		await assert.rejects(
			() => buildResidualPurityFixture({ round: RESIDUAL_PURITY_ROUND_2, samplePath: RESIDUAL_PURITY_ROUND_1.samplePath }),
			/pre-registered against sam-eval-142-v5-allnouns, but the sample names sam-eval-142-v4-nouns/u,
		)
	})

	/**
	 * The quotas are §11.11's, held and not rebalanced, and this is the assertion that would catch a
	 * rebalance.
	 *
	 * The v5 pools moved a long way — `static-only-clean` collapsed from 28 covers to 7 and
	 * `class-only` from 2 to 1, because the all-nouns elicitation prompts almost every cover — so the
	 * round draws 24 sheets rather than 25, entirely because `class-only`'s quota of 3 has a pool of 1.
	 * Moving a quota to recover the round number would be tuning the sampling design to a target,
	 * which is the same class of move as moving a bar; the shortfall is the honest outcome.
	 */
	it("holds §11.11's quotas over the v5 pools, and takes the 24-sheet shortfall", () => {
		// Typed as the record they are, not left as object literals. `assert.deepEqual` is declared
		// `asserts actual is T`, so a bare literal here would narrow `meta.quotas` to a five-key type
		// with no index signature and the `[stratum]` lookups below would stop compiling.
		const expectedQuotas: Readonly<Record<string, number>> = { "class-only": 3, contaminated: 6, "noun-fired": 8, "noun-silent": 5, "static-only-clean": 4 }
		const expectedPools: Readonly<Record<string, number>> = { "class-only": 1, contaminated: 20, "noun-fired": 102, "noun-silent": 12, "static-only-clean": 7 }
		assert.deepEqual(manifest2.meta.quotas, expectedQuotas)
		assert.deepEqual(manifest2.meta.quotas, manifest.meta.quotas, "the quotas must be the ones the last round used")
		assert.deepEqual(manifest2.meta.pool_sizes, expectedPools)
		const counted = new Map<string, number>()
		for (const entry of manifest2.items) counted.set(entry.stratum, (counted.get(entry.stratum) ?? 0) + 1)
		assert.deepEqual(
			[...counted].sort(),
			[
				["class-only", 1],
				["contaminated", 6],
				["noun-fired", 8],
				["noun-silent", 5],
				["static-only-clean", 4],
			],
		)
		// A stratum can never yield more sheets than its pool holds, and may never yield fewer for any
		// other reason. `class-only` is the only shortfall and its pool is 1.
		for (const [stratum, count] of counted) {
			const quota = manifest2.meta.quotas[stratum]
			const pool = manifest2.meta.pool_sizes[stratum]
			assert.equal(count, Math.min(quota, pool), `${stratum} drew ${count} from a pool of ${pool} against a quota of ${quota}`)
		}
		for (const stratum of counted.keys()) assert.ok(manifest2.meta.pool_sizes[stratum] > 0)
	})

	it("names a v5 sheet on disk for every item, hashed as the fixture serves it", async () => {
		for (const entry of manifest2.items) {
			assert.match(entry.sheet, /^research\/v3\/data\/sam\/residual-sheets-v5\/resid5-[0-9a-f]{12}\.png$/u)
			const bytes = await readFile(`${REPO_ROOT}/${entry.sheet}`)
			const sha256 = createHash("sha256").update(bytes).digest("hex")
			const items = fixture2.items.filter((item) => item.imageId === entry.item_id)
			assert.equal(items.length, RESIDUAL_PANELS.length)
			for (const item of items) assert.equal(item.sha256, sha256, `${entry.item_id}: the fixture was built against other bytes`)
		}
	})

	/**
	 * The blinding list has to be complete, and "complete" is checkable rather than assertable.
	 *
	 * Every key a v5 entry carries is either identity (which the fixture legitimately uses) or an
	 * answer key (which it must not). A builder that adds a fifteenth field would otherwise ship it
	 * unguarded with every test still green, which is precisely how the v4 list would have missed
	 * `residual_guard_on_uniform`.
	 */
	it("has an answer-key list that covers every non-identity field the builder writes", () => {
		const identity = ["item_id", "artwork_id", "image_path", "sheet", "stratum", "panel_cut"]
		for (const entry of manifest2.items) {
			for (const key of Object.keys(entry)) {
				assert.ok(
					identity.includes(key) || ANSWER_KEY_FIELDS_2.includes(key),
					`${key} is neither identity nor a guarded answer key — add it to ANSWER_KEY_FIELDS_2 or to the identity list`,
				)
			}
		}
	})
})

describe("residual-purity-2 fixture", () => {
	it("is deterministic and matches the committed file", async () => {
		assert.deepEqual(await buildResidualPurityFixture({ round: RESIDUAL_PURITY_ROUND_2 }), fixture2)
		assert.equal(
			await readFile(RESIDUAL_PURITY_2_FIXTURE_PATH, "utf8"),
			serializeFixture(fixture2),
			"the committed fixture is not what the generator produces — regenerate with --round 2 --write",
		)
	})

	it("carries its own identity, and does not borrow round 1's", () => {
		assert.equal(fixture2.batchId, "residual-purity-2")
		assert.notEqual(fixture2.batchId, fixture.batchId)
		assert.equal(fixture2.purpose, "oracle-validation")
		assert.equal(fixture2.fixtureVersion, PREMISE_DISAMBIGUATION_FIXTURE_VERSION)
		assert.equal(fixture2.seed, RESIDUAL_PURITY_2_SEED)
		assert.equal(fixture2.seed, manifest2.meta.seed, "the round must be reproducible from the sample's own seed")
		assert.notEqual(fixture2.seed, fixture.seed)
		// 24 sheets, two residual panels each.
		assert.equal(fixture2.items.length, 48)
		assert.equal(new Set(fixture2.items.map((item) => item.imageId)).size, 24)
		assert.doesNotThrow(() => validateFixture(fixture2))
	})

	/**
	 * The schema bump, and why it is not bureaucracy.
	 *
	 * `cant_tell` does not draw only from the panels round 1 would have called ambiguous — it drains
	 * `pure_field`, `mostly_field` and `not_field` alike, in proportions nobody knows. Under one
	 * schema a consumer could concatenate 50 v4 answers and 48 v5 answers into a single rate and
	 * report a mixture of two instruments as one measurement.
	 */
	it("declares residual-purity.v2, because the answer vocabulary changed", () => {
		assert.equal(fixture2.labelSchemaVersion, RESIDUAL_PURITY_2_LABEL_SCHEMA_VERSION)
		assert.equal(fixture2.labelSchemaVersion, "residual-purity.v2")
		assert.notEqual(fixture2.labelSchemaVersion, RESIDUAL_PURITY_LABEL_SCHEMA_VERSION)
	})

	it("serves the v5 three-panel sheet, and names the sheet as the image", () => {
		const artworkPaths = new Set(manifest2.items.map((entry) => entry.image_path))
		for (const item of fixture2.items) {
			assert.match(item.imagePath, /^research\/v3\/data\/sam\/residual-sheets-v5\/resid5-[0-9a-f]{12}\.png$/u)
			assert.ok(!artworkPaths.has(item.imagePath), "the bare artwork must never be the served image")
			assert.equal(item.collection, SHEET_COLLECTION)
			assert.match(item.imageId, /^resid5-[0-9a-f]{12}$/u)
			assert.equal(item.rendition.source, "research/v3/data/sam/residual-sheets-v5-sample.json")
			assert.equal(item.rendition.sourceEntryId, item.imageId)
			assert.equal(item.itemId, `${item.imageId}.${item.questionKey.replace("residual_is_field.", "")}`)
			assert.ok(item.rendition.width > item.rendition.height * 2, `${item.itemId} is not a three-panel sheet`)
		}
	})

	it("pairs the two panels of one sheet without letting them overwrite each other", () => {
		for (const entry of manifest2.items) {
			const pair = fixture2.items.filter((item) => item.imageId === entry.item_id)
			assert.deepEqual(
				pair.map((item) => item.questionKey).sort(),
				RESIDUAL_PANELS.map((panel) => questionKeyFor(panel.key)).sort(),
			)
			assert.equal(new Set(pair.map((item) => item.imagePath)).size, 1)
			assert.equal(new Set(pair.map((item) => item.stratum)).size, 1)
			assert.equal(new Set(pair.map((item) => `${item.questionKey} ${item.imageId}`)).size, 2)
		}
	})

	it("carries no residual, no contamination cause and no noun", () => {
		const text = JSON.stringify({ items: fixture2.items, questions: fixture2.questions })
		for (const field of ANSWER_KEY_FIELDS_2) assert.ok(!text.includes(field), `the fixture leaks ${field}`)
		for (const entry of manifest2.items) {
			for (const value of [entry.residual_guard_on_uniform, entry.residual_guard_on_exempt, entry.residual_guard_off, entry.residual_static_guard_off]) {
				// Only the values that are actually distinguishing: a residual of exactly 1 prints as "1"
				// and would match any width or hash on the page.
				if (value === undefined || String(value).length < 6) continue
				assert.ok(!text.includes(String(value)), `the fixture leaks the residual ${value}`)
			}
			// v5 prompts a list, not a single noun, so every entry of it has to stay out — the flame and
			// the cello are exactly the second-ranked nouns this round exists to have subtracted.
			for (const noun of entry.subject_noun_prompts ?? []) {
				if (noun.length <= 3) continue
				assert.ok(!text.includes(`"${noun}"`), `the fixture leaks the noun ${noun}`)
			}
		}
		for (const item of fixture2.items) {
			assert.equal(Object.keys(item).sort().join(","), "artworkId,collection,imageId,imagePath,itemId,questionKey,rendition,sha256,stratum")
		}
	})

	/**
	 * The fourth answer, and the three keys it must not have taken.
	 *
	 * `u` must stay undo, or `oracle.js` displaces it to Backspace mid-round; `r` must stay release,
	 * or the answer silently shadows it, because the page checks the answer map first. `c` is the
	 * initial of the answer, like `p`, `m` and `n` before it.
	 */
	it("offers four answers, p / m / n / c, with u and r left alone", () => {
		assert.equal(fixture2.questions.length, 2)
		for (const question of fixture2.questions) {
			assert.equal(question.kind, "enum")
			assert.deepEqual(
				question.answers.map((answer) => [answer.hotkey, answer.key]),
				[
					["p", "pure_field"],
					["m", "mostly_field"],
					["n", "not_field"],
					["c", "cant_tell"],
				],
			)
			for (const reserved of ["u", "r"]) {
				assert.ok(!question.answers.some((answer) => answer.hotkey === reserved), `an answer binds ${reserved}`)
			}
			for (const answer of question.answers) assert.equal(answer.hotkey, answer.hotkey.toLowerCase(), "an uppercase hotkey is unreachable")
			assert.equal(new Set(question.answers.map((answer) => answer.hotkey)).size, 4)
		}
		// The escape is what §12.9 says it is, in the reviewer's own words.
		const escape = RESIDUAL_PURITY_2_ANSWERS.at(-1)!
		assert.equal(escape.key, "cant_tell")
		assert.equal(escape.label, "can't tell what is field here")
		assert.ok(escape.gloss.length > 40, "the escape needs a gloss saying what it is, or it becomes a general-purpose shrug")
	})

	/**
	 * The first three answers are round 1's, to the byte.
	 *
	 * The round's whole claim is that it tests the same bar under a corrected elicitation. If
	 * `pure_field`'s gloss drifted by a word while the bar stayed at 0.75, the comparison against
	 * round 1's 0.2424 would be between two questions rather than two runs.
	 */
	it("leaves round 1's three answers untouched", () => {
		assert.deepEqual(RESIDUAL_PURITY_2_ANSWERS.slice(0, 3), RESIDUAL_PURITY_ANSWERS)
		assert.equal(RESIDUAL_PURITY_2_ANSWERS.length, RESIDUAL_PURITY_ANSWERS.length + 1)
	})

	/**
	 * The stem, the preamble and the instruction are round 1's, to the byte; only the framing moved.
	 *
	 * Asserted against round 1's live fixture rather than against a literal, so the two cannot drift
	 * apart in a later edit that changes one of them.
	 */
	it("asks §11.11's question verbatim, and changes only the framing", () => {
		for (const [index, question] of fixture2.questions.entries()) {
			const panel = RESIDUAL_PANELS[index]
			const roundOne = fixture.questions[index]
			assert.equal(question.key, questionKeyFor(panel.key))
			assert.equal(question.question, roundOne.question, "the stem must be the one the bar was pre-registered for")
			assert.equal(question.instruction, roundOne.instruction)
			assert.equal(question.preamble, roundOne.preamble)
			assert.equal(question.instruction, RESIDUAL_PURITY_INSTRUCTION)
			assert.equal(question.preamble, RESIDUAL_PURITY_PREAMBLE)
			assert.ok(question.question.includes(`"${panel.label}"`), `${question.key} does not quote its panel label`)
			assert.ok(
				question.question.endsWith(
					"is everything still visible here background — is there nothing left that belongs to a depicted " +
						"subject, to display text, or to an applied mark?",
				),
				`${question.key} does not ask §11.11's question`,
			)
			assert.match(question.preamble!, /checkerboard/u)
			assert.match(question.instruction, /Whether too much was removed is not this question/u)
			// The framing is the one thing that HAD to move: round 1's sentence sent every undecidable
			// panel to `mostly field`, which is the slot the escape answer exists to unburden.
			assert.equal(question.framing, RESIDUAL_PURITY_2_FRAMING)
			assert.notEqual(question.framing, RESIDUAL_PURITY_FRAMING)
			assert.ok(!question.framing!.includes(RESIDUAL_PURITY_FRAMING), "round 1's framing must not survive beside the escape")
		}
	})

	/**
	 * The framing has to hold a line in both directions, and each direction breaks the round if it slips.
	 *
	 * **Down:** an ambiguous panel must never reach `pure field` — the bar is a floor on the pure rate,
	 * so a rule that swept "I cannot tell" into the numerator would raise the very quantity being
	 * tested. **Up:** `cant_tell` is not a general-purpose "not sure" — a cover whose field is visible,
	 * where the only doubt is whether one leftover trace belongs to it, is still `mostly field`, and
	 * letting the escape eat those would inflate an ambiguity share §12.9 publishes as a measurement.
	 */
	it("routes ambiguity to the escape, keeps mostly field for a doubtful trace, and never loosens pure field", () => {
		assert.match(RESIDUAL_PURITY_2_FRAMING, /answer can't tell/u)
		assert.match(RESIDUAL_PURITY_2_FRAMING, /not as a skip/u)
		assert.match(RESIDUAL_PURITY_2_FRAMING, /one leftover trace belongs to it, answer mostly field/u)
		assert.match(RESIDUAL_PURITY_2_FRAMING, /Keep pure field for panels where you are sure nothing is left/u)
	})

	it("does not serve the same 24 sheets in the same order twice", () => {
		const byId = new Map(fixture2.items.map((item) => [item.itemId, item]))
		const passes = fixture2.questions.map((question) =>
			fixture2.serveOrder.filter((id) => byId.get(id)!.questionKey === question.key).map((id) => byId.get(id)!.imageId),
		)
		assert.equal(passes[0].length, 24)
		assert.deepEqual([...passes[0]].sort(), [...passes[1]].sort(), "both passes must cover every sheet")
		assert.notDeepEqual(passes[0], passes[1], "the two passes serve the sheets in the same order")
		const sameSlot = passes[0].filter((imageId, index) => passes[1][index] === imageId).length
		assert.ok(sameSlot <= 5, `${sameSlot} of 24 sheets land in the same slot in both passes`)
		// Contiguous passes, guard ON first: the between-variant comparison needs to know which pass
		// carries the anchoring, and saying so beats leaving it to the RNG.
		const runs: string[] = []
		for (const id of fixture2.serveOrder) {
			const key = byId.get(id)!.questionKey
			if (runs.at(-1) !== key) runs.push(key)
		}
		assert.deepEqual(runs, fixture2.questions.map((question) => question.key), "the passes must be contiguous, guard ON first")
	})

	it("interleaves the strata inside each pass, except where only one is left", () => {
		const byId = new Map(fixture2.items.map((item) => [item.itemId, item]))
		for (const question of fixture2.questions) {
			const strata = fixture2.serveOrder.filter((id) => byId.get(id)!.questionKey === question.key).map((id) => byId.get(id)!.stratum)
			let run = 1
			for (let index = 1; index < strata.length; index++) {
				run = strata[index] === strata[index - 1] ? run + 1 : 1
				// As in round 1: the bound is on WHERE a run may happen. `noun-fired` holds 8 of 24 sheets,
				// so once the four smaller strata are exhausted the tail is necessarily one stratum.
				const inTail = index >= strata.length - 5
				assert.ok(run <= 2 || inTail, `${question.key} serves ${run} of one stratum back to back at item ${index + 1}`)
				assert.ok(run <= 3, `${question.key} serves ${run} of one stratum back to back`)
			}
		}
	})

	/**
	 * What the round says about itself (REVIEW_UI.md §7).
	 *
	 * Four things a reader cannot reconstruct later and must therefore find in the record: that the bar
	 * is held rather than moved, that the escape's scoring was fixed before any answer was seen, that
	 * this is not a corpus estimate, and which pre-registration the whole thing hangs on.
	 */
	it("says what it is testing and what funded it", () => {
		assert.match(fixture2.selection.rule, /SAME pre-registered per-stratum quotas/u)
		assert.match(fixture2.selection.rule, /stratum-reweighted rate/u)
		assert.match(fixture2.selection.rule, /SUBTRACTION cut/u)
		assert.match(fixture2.selection.rule, /not a proposal to change/u)
		assert.match(fixture2.selection.rule, /held and not moved/u)
		assert.match(fixture2.selection.rule, /FOUR answers, not three/u)
		assert.match(fixture2.selection.rule, /excluded from both the numerator and the denominator/u)
		assert.match(fixture2.selection.rule, /PAIRED question/u)
		assert.equal(fixture2.selection.counts.sheets, 24)
		assert.equal(fixture2.selection.counts.panels, 2)
		const funded = RESIDUAL_PURITY_2_FUNDED_BY.join("\n")
		assert.match(funded, /§12\.9/u, "the round must name the pre-registration that set its bar")
		assert.match(funded, /sam-eval-142-v5-allnouns/u, "the round must name the run that produced its sheets")
		assert.match(funded, /0\.2424/u, "the round must name the result its bar has already been returned against")
		assert.match(funded, /0\.582/u, "the round must name the proxy's measured over-claim")
		assert.match(funded, /d-2026-08-04-purity-rounds-need-escape-answer/u)
		assert.match(funded, /R-3/u)
		assert.match(funded, /A6/u)
		assert.notEqual(funded, RESIDUAL_PURITY_FUNDED_BY.join("\n"), "the two rounds must not be funded by one story")
	})

	/**
	 * The provenance names `RESIDUAL_V5_NOTES.md` and not `RESIDUAL_EXPERIMENT_NOTES.md`.
	 *
	 * §12 could not be appended to the notes file — it was carrying another agent's parked staged edit,
	 * and appending would have committed their work under this round's message or dropped it. So the
	 * pre-registration this round's bar comes from lives in its own file, and the fixture says so.
	 * When the parked set lands and §12 is folded in as §12, this one line moves.
	 */
	it("names the file its pre-registration actually lives in", () => {
		assert.deepEqual(
			[...fixture2.builtFrom].sort(),
			[
				"research/v3/data/sam/residual-sheets-v5-sample.json",
				"research/v3/data/sam/sam-eval-142-v5-allnouns.jsonl",
				"research/v3/oracle/sam/RESIDUAL_V5_NOTES.md",
				"research/v3/oracle/sam/build_residual_sheets_v5.py",
			].sort(),
		)
		assert.ok(!fixture2.builtFrom.includes("research/v3/oracle/sam/RESIDUAL_EXPERIMENT_NOTES.md"))
		assert.match(RESIDUAL_PURITY_2_FUNDED_BY.join("\n"), /RESIDUAL_V5_NOTES\.md §12\.9/u)
	})
})

describe("residual-purity-2 round in the review server", () => {
	let harness: Harness
	let stored: StoredOracleBatch

	before(async () => {
		harness = await startHarness()
		assert.equal(await seedResidualPurity2Round(harness.handle.service), BATCH_2)
		stored = (await readJsonl<StoredOracleBatch>(harness.batchLogPath))[0] as StoredOracleBatch
	})

	after(async () => {
		await harness?.stop()
	})

	it("serves forty-eight items in pass order and nothing else", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH_2}`)
		assert.equal(payload.status, 200)
		assert.equal(payload.body.items.length, 48)
		assert.equal(payload.body.questions.length, 2)
		assert.deepEqual(
			payload.body.items.map((item: any) => stored.answerTokens[item.token]),
			[...fixture2.serveOrder],
		)
		for (const question of payload.body.questions) assert.equal(question.itemCount, 24)
		for (const item of payload.body.items) {
			assert.match(item.media, /^\/media\//u)
			assert.ok(item.width > 0 && item.height > 0)
			// `itemRef` is `<batch>/<token>`: the opaque handle again, so the reviewer can name a panel in
			// a message without the page ever showing which arm it came from. An id-based ref would have
			// leaked exactly that — these item ids end in `.guard_on` / `.guard_off`.
			assert.deepEqual(Object.keys(item).sort(), ["answer", "height", "itemRef", "media", "questionKey", "revision", "token", "width"])
		}
	})

	it("hands the browser all four answers, and their keys", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH_2}`)
		for (const question of payload.body.questions) {
			assert.deepEqual(
				question.answers.map((answer: any) => [answer.hotkey, answer.key]),
				[
					["p", "pure_field"],
					["m", "mostly_field"],
					["n", "not_field"],
					["c", "cant_tell"],
				],
			)
		}
	})

	it("leaks no residual, no stratum and no item id to the browser", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH_2}`)
		const text = JSON.stringify(payload.body)
		for (const field of ANSWER_KEY_FIELDS_2) assert.ok(!text.includes(field), `the payload leaks ${field}`)
		for (const entry of manifest2.items) {
			for (const value of [entry.residual_guard_on_uniform, entry.residual_guard_on_exempt, entry.residual_guard_off]) {
				if (value === undefined || String(value).length < 6) continue
				assert.ok(!text.includes(String(value)), `the payload leaks the residual ${value}`)
			}
		}
		for (const stratum of new Set(fixture2.items.map((item) => item.stratum))) {
			assert.ok(!text.includes(stratum), `the payload leaks the stratum ${stratum}`)
		}
		for (const item of fixture2.items) {
			assert.ok(!text.includes(item.itemId), `the payload leaks the item id ${item.itemId}`)
			assert.ok(!text.includes(item.imageId), `the payload leaks the sheet id ${item.imageId}`)
			assert.ok(!text.includes(item.sha256), `the payload leaks the sheet hash ${item.sha256}`)
		}
	})

	it("serves the sheet bytes as a PNG", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH_2}`)
		const response = await fetch(`${harness.base}${payload.body.items[0].media}`)
		assert.equal(response.status, 200)
		assert.equal(response.headers.get("content-type"), "image/png")
		assert.ok(Number(response.headers.get("content-length")) > 1000)
	})

	/**
	 * The escape has to survive the whole path to the warehouse, not just the page.
	 *
	 * §12.9 reports its share per stratum as a first-class result, so a `cant_tell` that the store
	 * rejected, coerced or dropped would silently delete the measurement the round was extended for —
	 * and it would look like an unanswered item rather than like a lost answer.
	 */
	it("records cant_tell as an oracle-label under residual-purity.v2, with its stratum", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH_2}`)
		const first = payload.body.items[0]
		const item = fixture2.items.find((entry) => entry.itemId === stored.answerTokens[first.token])!
		const put = await call(harness.base, "PUT", `/api/oracle-validation/${BATCH_2}/items/${first.token}/answer`, { answer: "cant_tell" })
		assert.equal(put.status, 200)
		const label = harness.records().find((record) => record.type === "oracle-label") as OracleLabelRecord
		assert.equal(label.labelSchemaVersion, "residual-purity.v2")
		assert.equal(label.questionKey, item.questionKey)
		assert.equal(label.imageId, item.imageId)
		// The stratum is what the escape share is reported per, so it has to be on the record.
		assert.equal(label.stratum, item.stratum)
		assert.equal(label.answer, "cant_tell")
		assert.equal(label.author.kind, "human")
		assert.equal(label.batch?.purpose, "oracle-validation")
	})

	it("accepts every one of the four answers", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH_2}`)
		for (const [index, answer] of ["pure_field", "mostly_field", "not_field", "cant_tell"].entries()) {
			const put = await call(harness.base, "PUT", `/api/oracle-validation/${BATCH_2}/items/${payload.body.items[index + 4].token}/answer`, { answer })
			assert.equal(put.status, 200, `${answer} was refused`)
		}
	})

	it("keeps the two panels of one sheet as two independent answers", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH_2}`)
		const tokenFor = new Map<string, string>()
		for (const item of payload.body.items) tokenFor.set(stored.answerTokens[item.token], item.token)
		const sheet = manifest2.items[0].item_id
		const on = tokenFor.get(`${sheet}.guard_on`)!
		const off = tokenFor.get(`${sheet}.guard_off`)!
		assert.equal((await call(harness.base, "PUT", `/api/oracle-validation/${BATCH_2}/items/${on}/answer`, { answer: "cant_tell" })).status, 200)
		assert.equal((await call(harness.base, "PUT", `/api/oracle-validation/${BATCH_2}/items/${off}/answer`, { answer: "pure_field" })).status, 200)
		const after = await call(harness.base, "GET", `/api/oracle-validation/${BATCH_2}`)
		const answerFor = new Map<string, string | null>()
		for (const item of after.body.items) answerFor.set(stored.answerTokens[item.token], item.answer)
		assert.equal(answerFor.get(`${sheet}.guard_on`), "cant_tell")
		assert.equal(answerFor.get(`${sheet}.guard_off`), "pure_field")
	})

	it("refuses an answer outside the vocabulary, and names all four in the refusal", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH_2}`)
		const rejected = await call(harness.base, "PUT", `/api/oracle-validation/${BATCH_2}/items/${payload.body.items[3].token}/answer`, {
			answer: "unsure",
		})
		assert.equal(rejected.status, 400)
		assert.match(JSON.stringify(rejected.body), /pure_field \| mostly_field \| not_field \| cant_tell/u)
	})

	it("shows up on the dashboard as an oracle page, with no after-release view it cannot render", async () => {
		const dashboard = await call(harness.base, "GET", "/api/dashboard")
		assert.equal(dashboard.status, 200)
		const entry = [...dashboard.body.open, ...dashboard.body.released].find((candidate: any) => candidate.batchId === BATCH_2)
		assert.ok(entry !== undefined, "the round is not on the dashboard")
		assert.equal(entry.page, `/oracle?batch=${BATCH_2}`)
		assert.equal(entry.payload, `/api/oracle-validation/${BATCH_2}`)
		assert.equal(entry.afterRelease, null)
	})
})

/**
 * The L-i guard for round 2's own vocabulary.
 *
 * A fourth answer is "a new interaction mode served to the reviewer" in L-i's sense, so the page is
 * driven for real again rather than inherited from round 1: `c` has never been pressed on this page,
 * and `undoIsTaken()` is exactly the function that would have quietly moved undo to Backspace if the
 * escape had been given `u`.
 */
describe("residual-purity-2 page, driven by keystrokes", () => {
	const NODE_IDS = ["reconcile-prior", "reconcile-conflict", "preamble", "framing", "question", "instruction", "progress", "mapping", "stage", "undokey", "status"] as const
	let harness: Harness
	let stored: StoredOracleBatch
	let page: FakePage

	before(async () => {
		harness = await startHarness()
		await seedResidualPurity2Round(harness.handle.service)
		stored = (await readJsonl<StoredOracleBatch>(harness.batchLogPath))[0] as StoredOracleBatch
		page = await openPage(harness.base, ORACLE_PAGE, NODE_IDS, `${harness.base}/oracle?batch=${BATCH_2}`)
	})

	after(async () => {
		await harness?.stop()
	})

	it("opens on the panel question, the new framing and all four answers", () => {
		assert.ok(page.nodes.question.textContent.includes("what remains - area guard ON"))
		assert.equal(page.nodes.instruction.textContent, RESIDUAL_PURITY_INSTRUCTION)
		assert.equal(page.nodes.preamble.textContent, RESIDUAL_PURITY_PREAMBLE)
		assert.equal(page.nodes.framing.textContent, RESIDUAL_PURITY_2_FRAMING)
		const lines = page.nodes.mapping.children.map((child) => child.textContent)
		assert.equal(lines.length, 4, "the escape is not on screen")
		for (const [index, answer] of RESIDUAL_PURITY_2_ANSWERS.entries()) {
			assert.ok(lines[index].includes(answer.hotkey), `${answer.key} does not show its key`)
			assert.ok(lines[index].includes(answer.label), `${answer.key} does not show its label`)
			assert.ok(lines[index].includes(answer.gloss), `${answer.key} does not show its gloss`)
		}
		assert.match(page.nodes.progress.textContent, /^residual_is_field\.guard_on · 1 \/ 24 · 0 done/u)
		// No answer binds `u`, so undo stays on `u` and the footer must say so. This is the assertion
		// that fails if someone ever gives the escape a more obvious-looking key.
		assert.equal(page.nodes.undokey.textContent, "u")
	})

	it("shows the three-panel sheet, and its bytes really load", async () => {
		const image = page.nodes.stage.children.find((child) => child.tagName === "img")
		assert.ok(image !== undefined, "the stage shows no image")
		assert.match(image.src, /^\/media\//u)
		const first = fixture2.items.find((item) => item.itemId === fixture2.serveOrder[0])!
		assert.equal(image.width, first.rendition.width)
		assert.equal(image.height, first.rendition.height)
		const response = await fetch(new URL(image.src, harness.base))
		assert.equal(response.status, 200)
		assert.equal(response.headers.get("content-type"), "image/png")
	})

	it("maps p / m / n / c to their answers, auto-advances, and records what was on screen", async () => {
		const pressed: { itemId: string; expected: string }[] = []
		for (const [index, answer] of RESIDUAL_PURITY_2_ANSWERS.entries()) {
			pressed.push({ itemId: fixture2.serveOrder[index], expected: answer.key })
			assert.match(page.nodes.progress.textContent, new RegExp(`^residual_is_field\\.guard_on · ${index + 1} / 24`, "u"))
			await page.press(answer.hotkey)
			assert.match(page.nodes.status.textContent, new RegExp(`recorded ${answer.key}`, "u"))
		}
		assert.match(page.nodes.progress.textContent, /· 5 \/ 24 · 4 done/u, "the page did not auto-advance")
		const labels = harness.records().filter((record): record is OracleLabelRecord => record.type === "oracle-label")
		assert.equal(labels.length, 4)
		for (const [index, entry] of pressed.entries()) {
			const item = fixture2.items.find((candidate) => candidate.itemId === entry.itemId)!
			assert.equal(labels[index].answer, entry.expected, `key ${RESIDUAL_PURITY_2_ANSWERS[index].hotkey} wrote the wrong answer`)
			assert.equal(labels[index].artwork?.sha256, item.sha256, `answer ${index + 1} landed on the wrong sheet`)
			assert.equal(labels[index].imageId, item.imageId)
			assert.equal(labels[index].questionKey, item.questionKey)
		}
		// The escape reached the warehouse as itself, which is the one thing the round was extended for.
		assert.equal(labels.at(-1)!.answer, "cant_tell")
	})

	it("steps back on u and replaces the answer without deleting anything", async () => {
		const before = harness.records().length
		await page.press("u")
		assert.match(page.nodes.progress.textContent, /· 4 \/ 24 /u, "u did not step back")
		await page.press("c")
		const labels = harness.records().filter((record): record is OracleLabelRecord => record.type === "oracle-label")
		assert.equal(harness.records().length, before + 1, "the replaced answer must be a new record, not an edit")
		assert.equal(labels.at(-1)!.answer, "cant_tell")
		assert.equal(labels.at(-1)!.imageId, fixture2.items.find((item) => item.itemId === fixture2.serveOrder[3])!.imageId)
	})

	it("resumes where the reviewer stopped", async () => {
		const reopened = await openPage(harness.base, ORACLE_PAGE, NODE_IDS, `${harness.base}/oracle?batch=${BATCH_2}`)
		assert.match(reopened.nodes.progress.textContent, /· 5 \/ 24 /u, "the round did not resume at the first unanswered item")
		assert.match(reopened.nodes.status.textContent, /resuming at item 5/u)
	})
})
