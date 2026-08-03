/**
 * The human probe round — `oracle-probe-gold-1` (PREMISE_NEXT.md §12).
 *
 * The same 30 gold artworks, asked the six `group-a.probes.v1.1` probes instead of the one six-way
 * question, in six contiguous passes. Two pre-registered uses: a probe-native gold with no
 * construct-match caveat, and the model-free reliability test — the reviewer's probe-derived tags
 * against the reviewer's own direct answers on the same images.
 *
 * Both uses die the same way, and that is what this file guards:
 *
 *  - **the wording must be the model's wording, byte for byte** — a comparison between a human and a
 *    model who were asked differently-worded questions measures the wording; and
 *  - **the round must be unanchored** — no earlier direct answer, no model answer, no flag anywhere
 *    the reviewer can see. Use (b) compares two instruments; showing one to the other while it is
 *    being read is not a comparison.
 */
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { validateRecord, type OracleLabelRecord } from "../src/warehouse/records.ts"
import {
	PREMISE_DISAMBIGUATION_BATCH_ID,
	PREMISE_DISAMBIGUATION_FIXTURE_PATH,
	PREMISE_DISAMBIGUATION_FIXTURE_VERSION,
	PROBE_GOLD_BATCH_ID,
	PROBE_GOLD_FIXTURE_PATH,
	PROBE_GOLD_SEED,
	PROBE_INSTRUCTION,
	PROBE_LABEL_SCHEMA_VERSION,
	PROBE_ORDER,
	buildPremiseDisambiguationFixture,
	buildProbeGoldFixture,
	serializeFixture,
	validateFixture,
} from "../src/review-server/oracle-validation.ts"
import { seedProbeGoldRound } from "../src/review-server/server.ts"
import { readJsonl } from "../src/review-server/store.ts"
import { call, openPage, startHarness, type FakePage, type Harness } from "../src/review-server/test-support.ts"
import type { StoredOracleBatch } from "../src/review-server/types.ts"

const BATCH = PROBE_GOLD_BATCH_ID
const ORACLE_PAGE = fileURLToPath(new URL("../review-ui/oracle.js", import.meta.url))
const NODE_IDS = ["reconcile-prior", "reconcile-conflict", "preamble", "framing", "question", "instruction", "progress", "mapping", "stage", "undokey", "status"] as const
const PROMPT_DIR = fileURLToPath(new URL("../oracle/premise/prompts/", import.meta.url))

const fixture = await buildProbeGoldFixture()
const gold = await buildPremiseDisambiguationFixture()

/** The probe's block as the prompt file renders it, straight from the file. */
async function promptBlock(file: string): Promise<string> {
	const raw = JSON.parse(await readFile(new URL(file, `file://${PROMPT_DIR}`), "utf8")) as {
		prompt: string
		referent_preamble: string
		unsure_framing: string
	}
	const marker = "One question only.\n\n"
	return raw.prompt.slice(raw.prompt.indexOf(marker) + marker.length).split("\n\nReply with JSON only.")[0]
}

describe("probe-gold fixture", () => {
	it("is deterministic and matches the committed file", async () => {
		assert.deepEqual(await buildProbeGoldFixture(), fixture)
		assert.equal(
			await readFile(PROBE_GOLD_FIXTURE_PATH, "utf8"),
			serializeFixture(fixture),
			"the committed probe fixture is not what the generator produces — regenerate with --fixture probe-gold --write",
		)
	})

	it("is 30 gold artworks x 6 probes, under the spec's identity", () => {
		assert.equal(fixture.batchId, "oracle-probe-gold-1")
		assert.equal(fixture.purpose, "oracle-validation")
		assert.equal(fixture.fixtureVersion, PREMISE_DISAMBIGUATION_FIXTURE_VERSION)
		assert.equal(fixture.labelSchemaVersion, PROBE_LABEL_SCHEMA_VERSION)
		assert.equal(fixture.labelSchemaVersion, "group-a.probes.v1.1")
		assert.equal(fixture.seed, PROBE_GOLD_SEED)
		assert.equal(fixture.questions.length, 6)
		assert.equal(fixture.items.length, 180)
		assert.equal(fixture.selection.counts.artworks, 30)
		assert.equal(fixture.selection.counts.probes, 6)
	})

	it("reuses the gold-30 rows verbatim, so both joins are exact", () => {
		// Same imagePath and same sha256 as the direct round: use (b) compares the same human on the
		// same images, and the model arm joins on the hash.
		const goldByHash = new Map(gold.items.map((item) => [item.sha256, item]))
		assert.equal(goldByHash.size, 30)
		for (const item of fixture.items) {
			const source = goldByHash.get(item.sha256)
			assert.ok(source !== undefined, `${item.itemId} is not one of the gold 30`)
			assert.equal(item.imagePath, source.imagePath)
			assert.equal(item.imageId, source.imageId)
			assert.equal(item.artworkId, source.artworkId)
			assert.deepEqual(item.rendition, source.rendition)
			assert.equal(item.stratum, source.stratum)
		}
		for (const probe of PROBE_ORDER) {
			assert.equal(fixture.items.filter((item) => item.questionKey === probe).length, 30)
		}
	})

	it("asks the probes in bundled-p's order, in six contiguous passes", () => {
		assert.deepEqual(
			fixture.questions.map((question) => question.key),
			[...PROBE_ORDER],
		)
		assert.deepEqual(
			[...PROBE_ORDER],
			["bg_visible", "one_colour", "continuous_change", "separate_areas", "motif_or_material", "depicted_place"],
		)
		const order = fixture.serveOrder.map((id) => fixture.items.find((item) => item.itemId === id)!.questionKey)
		const runs: string[] = []
		for (const key of order) if (runs.at(-1) !== key) runs.push(key)
		assert.deepEqual(runs, [...PROBE_ORDER], "the passes must be contiguous and in the recorded order")
		// Shuffled inside each pass, so the artworks are not walked in the same order six times.
		const firstPass = fixture.serveOrder.slice(0, 30)
		assert.notDeepEqual(
			firstPass,
			fixture.items.filter((item) => item.questionKey === PROBE_ORDER[0]).map((item) => item.itemId),
		)
		assert.doesNotThrow(() => validateFixture(fixture))
	})

	it("carries the prompt files' wording byte for byte — stem, glosses, preamble, framing", async () => {
		for (const question of fixture.questions) {
			const file = `group-a.probes.v1.1.solo-${question.key.replace(/_/gu, "-")}.json`
			const block = await promptBlock(file)
			const [stem, ...optionLines] = block.split("\n")
			// The stem, including the probe id the model was shown.
			assert.equal(question.question, stem, `${question.key}: stem is not the prompt file's`)
			assert.equal(
				optionLines.length,
				question.answers.length,
				`${question.key}: the fixture offers a different number of answers than the prompt`,
			)
			for (const [index, line] of optionLines.entries()) {
				const trimmed = line.trim()
				const answer = question.answers[index]
				assert.equal(
					trimmed,
					`${answer.key} - ${answer.gloss}`,
					`${question.key}: option ${index} does not render as the prompt file does`,
				)
			}
			const raw = JSON.parse(await readFile(new URL(file, `file://${PROMPT_DIR}`), "utf8")) as {
				referent_preamble: string
				unsure_framing: string
			}
			assert.equal(question.preamble, raw.referent_preamble, `${question.key}: preamble differs from the prompt file`)
			assert.equal(question.framing, raw.unsure_framing, `${question.key}: unsure framing differs from the prompt file`)
			// v1.1's whole point: a plural referent. If this line ever reverts to "the large area" the
			// four whole-region probes stop being answerable on a split background.
			assert.match(question.preamble!, /taken AS A WHOLE/u)
		}
	})

	it("uses the same preamble, framing and instruction on every pass", () => {
		const preambles = new Set(fixture.questions.map((question) => question.preamble))
		const framings = new Set(fixture.questions.map((question) => question.framing))
		assert.equal(preambles.size, 1, "the referent must be fixed once, not per probe")
		assert.equal(framings.size, 1)
		for (const question of fixture.questions) {
			assert.equal(question.instruction, PROBE_INSTRUCTION)
			// The anti-coherence instruction: the reviewer has seen these artworks and answered a
			// six-way question about them, and the derivation only means something per probe.
			assert.match(question.instruction, /Do not try to make your answers across questions tell one story/u)
			assert.match(question.instruction, /answer unsure — it is a real answer/u)
		}
	})

	it("is an enum with y / n / u, because a probe has three answers", () => {
		for (const question of fixture.questions) {
			// `boolean` would be wrong: BOOLEAN_HOTKEYS is fixed at two keys and there are three answers.
			assert.equal(question.kind, "enum")
			assert.deepEqual(
				question.answers.map((answer) => [answer.hotkey, answer.key]),
				[
					["y", "yes"],
					["n", "no"],
					["u", "unsure"],
				],
			)
			for (const answer of question.answers) assert.ok(answer.gloss.length > 0)
		}
	})

	it("carries no answer from any other instrument", () => {
		// Scoped to what the round is made of. `selection.rule` names `ground_type` because that is the
		// tag these six probes derive — a statement about the design, not an answer about an artwork.
		const text = JSON.stringify({ questions: fixture.questions, items: fixture.items })
		for (const forbidden of ["ground_type", "gradient", "shaded_field", "flat_field", "contradiction"]) {
			assert.ok(!text.includes(forbidden), `the probe fixture leaks ${forbidden}`)
		}
	})
})

describe("probe-gold round in the review server", () => {
	let harness: Harness
	let stored: StoredOracleBatch

	before(async () => {
		harness = await startHarness()
		assert.equal(await seedProbeGoldRound(harness.handle.service), BATCH)
		stored = (await readJsonl<StoredOracleBatch>(harness.batchLogPath))[0] as StoredOracleBatch
	})

	after(async () => {
		await harness?.stop()
	})

	it("serves six questions with their preamble and framing, and 180 items in pass order", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		assert.equal(payload.status, 200)
		assert.equal(payload.body.items.length, 180)
		assert.equal(payload.body.questions.length, 6)
		for (const [index, question] of payload.body.questions.entries()) {
			assert.equal(question.key, PROBE_ORDER[index])
			assert.equal(question.itemCount, 30)
			assert.equal(question.preamble, fixture.questions[index].preamble)
			assert.equal(question.framing, fixture.questions[index].framing)
			assert.equal(question.instruction, PROBE_INSTRUCTION)
			assert.deepEqual(
				question.answers.map((answer: any) => answer.hotkey),
				["y", "n", "u"],
			)
		}
		assert.deepEqual(
			payload.body.items.map((item: any) => stored.answerTokens[item.token]),
			[...fixture.serveOrder],
		)
	})

	it("is unanchored: no earlier answer, no model answer, no flag", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		const text = JSON.stringify(payload.body)
		for (const forbidden of [
			// The reviewer's own direct six-way answers, and the round they live in.
			"ground_type",
			PREMISE_DISAMBIGUATION_BATCH_ID,
			// The two sides the direct round was adjudicating.
			"gradient",
			"flat_field",
			"shaded_field",
			"multiple_distinct_fields",
			"contradiction",
			"sidedWith",
			// And the joins that would let a curious page fetch any of it.
			"sha256",
			...fixture.items.map((item) => item.itemId),
		]) {
			assert.ok(!text.includes(forbidden), `the served payload leaks ${forbidden}`)
		}
		for (const item of payload.body.items) {
			assert.deepEqual(Object.keys(item).sort(), ["answer", "height", "media", "questionKey", "revision", "token", "width"])
			assert.equal(item.answer, null)
		}
	})

	it("records a probe answer under the probe schema, keyed by question and image", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		const first = payload.body.items[0]
		const response = await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${first.token}/answer`, {
			answer: "unsure",
		})
		assert.equal(response.status, 200)
		const record = harness.records().at(-1) as OracleLabelRecord
		assert.doesNotThrow(() => validateRecord(record))
		assert.equal(record.labelSchemaVersion, "group-a.probes.v1.1")
		assert.equal(record.questionKey, "bg_visible")
		assert.equal(record.answer, "unsure", "unsure is a real answer, recorded as one")
		assert.equal(record.author.kind, "human")
		assert.equal(record.batch?.id, BATCH)
		assert.equal(record.batch?.itemCount, 180)

		// The same artwork will be asked five more times; the answers must not collide.
		const itemId = stored.answerTokens[first.token]
		const item = fixture.items.find((entry) => entry.itemId === itemId)!
		const siblings = fixture.items.filter((entry) => entry.sha256 === item.sha256)
		assert.equal(siblings.length, 6)
		const sibling = siblings.find((entry) => entry.questionKey === "one_colour")!
		const siblingToken = Object.entries(stored.answerTokens).find(([, id]) => id === sibling.itemId)![0]
		await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${siblingToken}/answer`, { answer: "yes" })
		const after_ = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		const served = new Map(after_.body.items.map((entry: any) => [stored.answerTokens[entry.token], entry.answer]))
		assert.equal(served.get(item.itemId), "unsure", "the second probe overwrote the first probe's answer")
		assert.equal(served.get(sibling.itemId), "yes")
	})

	it("refuses an answer outside the probe vocabulary", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		const bad = await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${payload.body.items[2].token}/answer`, {
			answer: "maybe",
		})
		assert.equal(bad.status, 400)
		assert.match(bad.body.error, /yes \| no \| unsure/u)
	})
})

describe("probe-gold page, driven by keystrokes", () => {
	let harness: Harness
	let page: FakePage

	before(async () => {
		harness = await startHarness()
		await seedProbeGoldRound(harness.handle.service)
		page = await openPage(harness.base, ORACLE_PAGE, NODE_IDS)
	})

	after(async () => {
		await harness?.stop()
	})

	it("puts the referent preamble and the unsure framing on the page, above the question", () => {
		assert.equal(page.nodes.preamble.textContent, fixture.questions[0].preamble)
		assert.equal(page.nodes.framing.textContent, fixture.questions[0].framing)
		assert.equal(page.nodes.question.textContent, fixture.questions[0].question)
		assert.equal(page.nodes.instruction.textContent, PROBE_INSTRUCTION)
		assert.match(page.nodes.progress.textContent, /^bg_visible · 1 \/ 30/u)
	})

	it("keeps them there on every item and across the pass boundary", async () => {
		// Answer the whole first pass; the preamble must still be on screen on the last item of it and
		// on the first item of the next — that is the failure the v1.1 fix exists to prevent.
		for (let item = 1; item <= 29; item++) {
			assert.equal(page.nodes.preamble.textContent, fixture.questions[0].preamble, `preamble vanished at item ${item}`)
			await page.press("y")
		}
		assert.match(page.nodes.progress.textContent, /^bg_visible · 30 \/ 30/u)
		assert.equal(page.nodes.preamble.textContent, fixture.questions[0].preamble)
		await page.press("n")
		// Into pass 2: new question, same preamble and framing.
		assert.match(page.nodes.progress.textContent, /^one_colour · 1 \/ 30/u)
		assert.equal(page.nodes.question.textContent, fixture.questions[1].question)
		assert.equal(page.nodes.preamble.textContent, fixture.questions[1].preamble)
		assert.equal(page.nodes.framing.textContent, fixture.questions[1].framing)
	})

	it("maps y / n / u to yes / no / unsure for the artwork on screen", async () => {
		const before = harness.records().length
		await page.press("u")
		const record = harness.records().at(-1) as OracleLabelRecord
		assert.equal(record.answer, "unsure")
		assert.equal(record.questionKey, "one_colour")
		assert.equal(harness.records().length, before + 1)
		assert.match(page.nodes.status.textContent, /recorded unsure/u)
	})

	it("moves undo off u, because u is an answer here, and says so on screen", async () => {
		assert.equal(page.nodes.undokey.textContent, "backspace", "the footer must name the key that actually undoes")
		const count = harness.records().length
		await page.press("Backspace")
		assert.match(page.nodes.status.textContent, /stepped back/u)
		assert.equal(harness.records().length, count, "stepping back writes nothing")
		await page.press("y")
		const record = harness.records().at(-1) as OracleLabelRecord
		assert.equal(record.answer, "yes", "answering again replaces the previous answer")
	})

	it("shows the answer mapping with its glosses at all times", () => {
		const lines = page.nodes.mapping.children.map((child) => child.textContent)
		assert.equal(lines.length, 3)
		for (const [index, answer] of fixture.questions[1].answers.entries()) {
			assert.ok(lines[index].includes(answer.hotkey))
			assert.ok(lines[index].includes(answer.gloss), `${answer.key}'s gloss is not on screen`)
		}
	})
})
