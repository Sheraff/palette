/**
 * The residual-purity round — `residual-purity-1` (RESIDUAL_EXPERIMENT_NOTES.md §11.11).
 *
 * The round funds a **pre-registered** adoption bar, so it dies in three ways and this file guards
 * all three:
 *
 *  - **the reviewer must not be able to read the residual.** Every number the bar is computed from —
 *    `residual_guard_on`, `residual_guard_off`, the static comparison, the contamination causes, the
 *    noun that was subtracted — has to stay out of the fixture and out of the served payload. A
 *    reviewer who can see that a panel scored 0.98 is not a second opinion about it.
 *  - **the pair must survive the join.** An answer is about one (sheet, panel); the guard-ON and
 *    guard-OFF answers for one sheet are the between-variant comparison §11.11's second clause is
 *    about, and if the two items shared a (question, image) key they would overwrite each other.
 *  - **the page must actually work.** Loose end L-i: `review-ui/freetext.js` crawled clean under
 *    `verify-live` and was completely dead to the keyboard. L-i's revival condition is "any new
 *    review-UI page or interaction mode is served to the reviewer", and a new answer vocabulary is
 *    exactly that — so the last describe block drives the real `review-ui/oracle.js` and presses
 *    `p`, `m`, `n` and `u` for real.
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
	RESIDUAL_PURITY_ANSWERS,
	RESIDUAL_PURITY_BATCH_ID,
	RESIDUAL_PURITY_FIXTURE_PATH,
	RESIDUAL_PURITY_FRAMING,
	RESIDUAL_PURITY_FUNDED_BY,
	RESIDUAL_PURITY_INSTRUCTION,
	RESIDUAL_PURITY_LABEL_SCHEMA_VERSION,
	RESIDUAL_PURITY_PREAMBLE,
	RESIDUAL_PURITY_SEED,
	SHEET_COLLECTION,
	buildResidualPurityFixture,
	questionKeyFor,
	readResidualSample,
	seedResidualPurityRound,
} from "../src/review-server/residual-purity.ts"
import { REPO_ROOT } from "../src/review-server/server.ts"
import { readJsonl } from "../src/review-server/store.ts"
import { call, openPage, startHarness, type FakePage, type Harness } from "../src/review-server/test-support.ts"
import type { StoredOracleBatch } from "../src/review-server/types.ts"
import type { OracleLabelRecord } from "../src/warehouse/records.ts"

const BATCH = RESIDUAL_PURITY_BATCH_ID
const ORACLE_PAGE = fileURLToPath(new URL("../review-ui/oracle.js", import.meta.url))

/**
 * The sheets are PNGs and the repository ignores `*.png`, so they are build products, not commits.
 * Everything below needs them on disk; fail with the command that makes them rather than with fifty
 * confusing hash errors.
 */
const manifest = await readResidualSample()
const missingSheets = manifest.items.filter((entry) => !existsSync(`${REPO_ROOT}/${entry.sheet}`))
assert.equal(
	missingSheets.length,
	0,
	`${missingSheets.length} sheets are not on disk. Run: research/v3/oracle/sam/.venv/bin/python research/v3/oracle/sam/build_residual_sheets_v4.py`,
)

const fixture = await buildResidualPurityFixture()

/** Everything the reviewer must not be able to read, as it is spelled in the manifest. */
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
			if (entry.subject_noun_prompt !== null && entry.subject_noun_prompt.length > 3) {
				assert.ok(!text.includes(`"${entry.subject_noun_prompt}"`), `the fixture leaks the noun ${entry.subject_noun_prompt}`)
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
			assert.deepEqual(Object.keys(item).sort(), ["answer", "height", "media", "questionKey", "revision", "token", "width"])
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
