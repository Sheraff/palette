/**
 * The gate-reconciliation round: the by-question instrument answering for its own contradictions.
 *
 * `bcde-validation-1`'s regenerated analysis found **9 gate contradictions across 8 of 20 answered
 * artworks** — a 45% rate against the 10% ceiling `PREMISE_NEXT.md` §15.6-(3) pre-registered. Five
 * of the nine are rule 9 (`has_dominant_subject == none` beside a named `subject_kind`), which
 * §15.6-(3) calls the one that matters most for the SAM handoff.
 *
 * The suspicion this round tests is that the rate is a property of the INSTRUMENT and not of the
 * reviewer: under by-question passes the gate was answered in one pass and its dependant in another,
 * so no arrangement of the screen could have shown the reviewer that their own two answers do not
 * hold together. Walking a gate and its dependants as one contiguous run, with those two answers on
 * screen, is the smallest change that distinguishes the two explanations.
 *
 * What is asserted here, in order of how badly each would hurt if wrong:
 *
 *   - the new answers **supersede** the old ones rather than sitting beside them (a warehouse
 *     holding two live contradicting labels for one artwork is worse than the contradiction);
 *   - the serve order really is artwork-contiguous and gate-first, and the validator refuses every
 *     way of getting that wrong;
 *   - the questions and item rows are `bcde-validation-1`'s own, so a new answer replaces a value
 *     rather than opening a second, incomparable column;
 *   - the page actually renders the prior answers, on the gate and on every dependant.
 */
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import type { OracleLabelRecord } from "../src/warehouse/records.ts"
import {
	BCDE_VALIDATION_BATCH_ID,
	BCDE_VALIDATION_FIXTURE_PATH,
	GATE_RECONCILIATION_BATCH_ID,
	GATE_RECONCILIATION_FIXTURE_PATH,
	buildGateReconciliationFixture,
	readBcdeValidationAnalysis,
	serializeFixture,
	validateFixture,
	type OracleValidationFixture,
} from "../src/review-server/oracle-validation.ts"
import { seedBcdeValidationRound } from "../src/review-server/server.ts"
import { readJsonl } from "../src/review-server/store.ts"
import { openPage, startHarness, type FakePage, type Harness } from "../src/review-server/test-support.ts"
import type { StoredOracleBatch } from "../src/review-server/types.ts"

const ORACLE_PAGE = fileURLToPath(new URL("../review-ui/oracle.js", import.meta.url))
const NODE_IDS = [
	"reconcile-prior",
	"reconcile-conflict",
	"preamble",
	"framing",
	"question",
	"instruction",
	"progress",
	"mapping",
	"stage",
	"undokey",
	"pending",
	"status",
] as const

const fixture = await buildGateReconciliationFixture()
const source = JSON.parse(await readFile(BCDE_VALIDATION_FIXTURE_PATH, "utf8")) as OracleValidationFixture
const analysis = await readBcdeValidationAnalysis()

/** The serve order as (groupId, role, questionKey) triples — the shape the whole round turns on. */
function walk(target = fixture) {
	return target.serveOrder.map((itemId) => {
		const item = target.items.find((entry) => entry.itemId === itemId)!
		return { groupId: item.reconciliation!.groupId, role: item.reconciliation!.role, questionKey: item.questionKey }
	})
}

describe("gate-reconciliation fixture", () => {
	it("matches the committed file", async () => {
		assert.equal(serializeFixture(fixture), await readFile(GATE_RECONCILIATION_FIXTURE_PATH, "utf8"))
	})

	it("is deterministic — the same sources give the same round", async () => {
		assert.deepEqual(await buildGateReconciliationFixture(), fixture)
	})

	it("covers exactly the contradicting artworks the analysis names, and no other", () => {
		const contradicting = new Set(analysis.gateConsistency.contradictions.map((entry) => entry.imageId))
		assert.equal(contradicting.size, analysis.gateConsistency.artworksWithAnyContradiction)
		assert.equal(contradicting.size, 8)
		assert.deepEqual(new Set(fixture.items.map((item) => item.imageId)), contradicting)
		assert.equal(analysis.gateConsistency.totalContradictions, 9)
		assert.equal(analysis.gateConsistency.withinCeiling, false)
	})

	it("asks each artwork its gate and every dependant the contradiction names — 17 items over 8 artworks", () => {
		assert.equal(fixture.items.length, 17)
		assert.equal(new Set(walk().map((entry) => entry.groupId)).size, 8)
		for (const contradiction of analysis.gateConsistency.contradictions) {
			for (const key of [contradiction.gateKey, contradiction.conditionalKey]) {
				assert.ok(
					fixture.items.some((item) => item.imageId === contradiction.imageId && item.questionKey === key),
					`${contradiction.imageId} is never asked ${key}`,
				)
			}
		}
		// The one artwork with two contradicting dependants is one reconciliation of three items,
		// not two reconciliations — the gate is asked once and answered once.
		const groups = new Map<string, number>()
		for (const entry of walk()) groups.set(entry.groupId, (groups.get(entry.groupId) ?? 0) + 1)
		assert.deepEqual([...groups.values()].sort(), [2, 2, 2, 2, 2, 2, 2, 3])
	})

	it("serves each artwork as one contiguous run, gate first", () => {
		assert.equal(fixture.serveMode, "by-artwork")
		const seen = new Set<string>()
		let current: string | null = null
		for (const entry of walk()) {
			if (entry.groupId !== current) {
				assert.ok(!seen.has(entry.groupId), `group ${entry.groupId} is served in two pieces`)
				assert.equal(entry.role, "gate", `group ${entry.groupId} does not open on its gate`)
				seen.add(entry.groupId)
				current = entry.groupId
			} else {
				assert.equal(entry.role, "dependent")
			}
		}
	})

	it("shows the reviewer their own two answers and the rule those answers break", () => {
		for (const item of fixture.items) {
			const context = item.reconciliation!
			assert.ok(context.priorAnswers.length >= 2, `${item.itemId} shows fewer than two prior answers`)
			// The gate's answer comes first, and every dependant this artwork is asked about is present.
			const shown = context.priorAnswers.map((entry) => entry.questionKey)
			const gate = fixture.items.find((entry) => entry.reconciliation!.groupId === context.groupId && entry.reconciliation!.role === "gate")!
			assert.equal(shown[0], gate.questionKey)
			assert.ok(shown.includes(item.questionKey), `${item.itemId} does not show its own previous answer`)
			assert.match(context.conflict, /^rule \d+, /u)
		}
		// Every prior answer is the reviewer's own, exactly as the analysis recorded it.
		for (const contradiction of analysis.gateConsistency.contradictions) {
			const item = fixture.items.find(
				(entry) => entry.imageId === contradiction.imageId && entry.questionKey === contradiction.conditionalKey,
			)!
			const prior = item.reconciliation!.priorAnswers
			assert.equal(prior[0].answer, contradiction.gateAnswer)
			assert.equal(prior.find((entry) => entry.questionKey === contradiction.conditionalKey)!.answer, contradiction.conditionalAnswer)
		}
	})

	it("reuses bcde-validation-1's questions and item rows verbatim", () => {
		assert.equal(fixture.labelSchemaVersion, source.labelSchemaVersion)
		for (const question of fixture.questions) {
			assert.deepEqual(question, source.questions.find((entry) => entry.key === question.key))
		}
		for (const item of fixture.items) {
			const original = source.items.find((entry) => entry.questionKey === item.questionKey && entry.imageId === item.imageId)!
			const { itemId, reconciliation, ...carried } = item
			const { itemId: originalId, ...originalCarried } = original
			assert.deepEqual(carried, originalCarried, `${item.itemId} does not reuse its source row`)
			assert.ok(reconciliation !== undefined)
			assert.notEqual(itemId, originalId, "a reused item id would collide with the round it supersedes")
		}
	})

	it("declares the round whose answers it supersedes", () => {
		assert.equal(fixture.supersedesBatchId, BCDE_VALIDATION_BATCH_ID)
		assert.notEqual(fixture.supersedesBatchId, fixture.batchId)
	})

	it("carries no model answer — the context is the reviewer's own", () => {
		const serialized = serializeFixture(fixture)
		for (const leak of ["variant", "prompt_variant", "kappa", "bulk_E", "bulk_F"]) {
			assert.ok(!serialized.includes(leak), `the fixture leaks ${leak}`)
		}
	})
})

describe("by-artwork fixture validation", () => {
	const mutate = (change: (draft: OracleValidationFixture) => OracleValidationFixture) =>
		change(JSON.parse(JSON.stringify(fixture)) as OracleValidationFixture)

	it("accepts the round as built", () => {
		validateFixture(fixture)
	})

	it("refuses a serve order that splits an artwork's group", () => {
		const draft = mutate((copy) => ({ ...copy, serveOrder: [copy.serveOrder[0], copy.serveOrder[2], copy.serveOrder[1], ...copy.serveOrder.slice(3)] }))
		assert.throws(() => validateFixture(draft), /contiguous run/u)
	})

	it("refuses a group that does not open on its gate", () => {
		const draft = mutate((copy) => ({ ...copy, serveOrder: [copy.serveOrder[1], copy.serveOrder[0], ...copy.serveOrder.slice(2)] }))
		assert.throws(() => validateFixture(draft), /does not open on its gate/u)
	})

	it("refuses a gate with nothing depending on it", () => {
		const draft = mutate((copy) => {
			const keep = copy.items.filter((item) => item.itemId !== copy.serveOrder[1])
			return { ...copy, items: keep, serveOrder: copy.serveOrder.filter((id) => id !== copy.serveOrder[1]) }
		})
		assert.throws(() => validateFixture(draft), /nothing to reconcile/u)
	})

	it("refuses a by-artwork item with no reconciliation context", () => {
		const draft = mutate((copy) => ({
			...copy,
			items: copy.items.map((item, index) => (index === 0 ? { ...item, reconciliation: undefined } : item)),
		}))
		assert.throws(() => validateFixture(draft), /needs reconciliation context/u)
	})

	it("refuses reconciliation context on a by-question round, where it has nowhere to render", () => {
		const draft = mutate((copy) => ({ ...copy, serveMode: "by-question" as const }))
		assert.throws(() => validateFixture(draft), /nowhere to render/u)
	})

	it("refuses a round that claims to supersede itself", () => {
		const draft = mutate((copy) => ({ ...copy, supersedesBatchId: copy.batchId }))
		assert.throws(() => validateFixture(draft), /cannot supersede its own answers/u)
	})
})

describe("gate-reconciliation round in the review server", () => {
	let harness: Harness
	let sourceStored: StoredOracleBatch

	before(async () => {
		harness = await startHarness()
		await seedBcdeValidationRound(harness.handle.service)
		sourceStored = (await readJsonl<StoredOracleBatch>(harness.batchLogPath))[0] as StoredOracleBatch
		// Answer only the contradicting pairs of the round being reconciled — that is all this round
		// supersedes, and answering the other 143 items would prove nothing extra. Deduplicated by
		// (question, image): the artwork with two contradicting dependants names its gate twice, and
		// answering it twice would leave a supersession chain inside the SOURCE round and hide whether
		// the cross-batch link is the thing being tested.
		const toAnswer = new Map<string, { imageId: string; questionKey: string; answer: string }>()
		for (const contradiction of analysis.gateConsistency.contradictions) {
			for (const [questionKey, answer] of [
				[contradiction.gateKey, contradiction.gateAnswer],
				[contradiction.conditionalKey, contradiction.conditionalAnswer],
			]) {
				toAnswer.set(`${questionKey} ${contradiction.imageId}`, { imageId: contradiction.imageId, questionKey, answer })
			}
		}
		for (const entry of toAnswer.values()) {
			const item = sourceStored.fixture.items.find((row) => row.questionKey === entry.questionKey && row.imageId === entry.imageId)!
			const token = Object.entries(sourceStored.answerTokens).find(([, id]) => id === item.itemId)![0]
			await harness.handle.service.putOracleAnswer(BCDE_VALIDATION_BATCH_ID, token, entry.answer)
		}
		await harness.handle.service.pushOracleValidation(fixture, ["what it tests: whether the 45% gate-contradiction rate is an instrument artefact"])
	})

	after(async () => {
		await harness?.stop()
	})

	it("serves the mode and the reconciliation context, item by item", () => {
		const payload = harness.handle.service.oracleValidationPayload(GATE_RECONCILIATION_BATCH_ID)
		assert.equal(payload.serveMode, "by-artwork")
		assert.equal(payload.items.length, 17)
		for (const [index, item] of payload.items.entries()) {
			const expected = fixture.items.find((entry) => entry.itemId === fixture.serveOrder[index])!
			assert.deepEqual((item as { reconciliation?: unknown }).reconciliation, expected.reconciliation)
		}
	})

	it("leaves the by-question rounds' payload shape untouched", () => {
		const payload = harness.handle.service.oracleValidationPayload(BCDE_VALIDATION_BATCH_ID)
		assert.equal(payload.serveMode, "by-question")
		for (const item of payload.items) assert.ok(!("reconciliation" in item), "a by-question item carries a reconciliation key")
	})

	it("appends a superseding oracle-label rather than editing the old one", async () => {
		const contradiction = analysis.gateConsistency.contradictions[0]
		const before = harness
			.records()
			.filter((record): record is OracleLabelRecord => record.type === "oracle-label")
			.filter((record) => record.imageId === contradiction.imageId && record.questionKey === contradiction.gateKey)
		assert.equal(before.length, 1, "the round being reconciled should hold exactly one answer here")

		const payload = harness.handle.service.oracleValidationPayload(GATE_RECONCILIATION_BATCH_ID)
		const item = fixture.items.find((entry) => entry.imageId === contradiction.imageId && entry.questionKey === contradiction.gateKey)!
		const token = payload.items[fixture.serveOrder.indexOf(item.itemId)].token
		const result = await harness.handle.service.putOracleAnswer(GATE_RECONCILIATION_BATCH_ID, token, "single")

		const after = harness
			.records()
			.filter((record): record is OracleLabelRecord => record.type === "oracle-label")
			.filter((record) => record.imageId === contradiction.imageId && record.questionKey === contradiction.gateKey)
		assert.equal(after.length, 2, "the old answer was edited away instead of superseded")
		assert.equal(after[0].id, before[0].id, "the earlier record changed")
		assert.equal(after[0].answer, contradiction.gateAnswer)
		assert.equal(after[1].id, result.recordId)
		assert.equal(after[1].answer, "single")
		// The link is WRITTEN DOWN and crosses the batch boundary — supersession must not depend on
		// file order, and the record it replaces lives in another round.
		assert.equal(after[1].supersedes, before[0].id)
		assert.equal(after[1].batch?.id, GATE_RECONCILIATION_BATCH_ID)
		assert.equal(after[1].labelSchemaVersion, after[0].labelSchemaVersion)
		assert.equal(result.revision, 2)
	})

	it("keeps supersession inside the round for a second answer to the same item", async () => {
		const payload = harness.handle.service.oracleValidationPayload(GATE_RECONCILIATION_BATCH_ID)
		const contradiction = analysis.gateConsistency.contradictions[0]
		const item = fixture.items.find((entry) => entry.imageId === contradiction.imageId && entry.questionKey === contradiction.gateKey)!
		const token = payload.items[fixture.serveOrder.indexOf(item.itemId)].token
		const first = harness.records().filter((record) => record.type === "oracle-label").at(-1)!
		const result = await harness.handle.service.putOracleAnswer(GATE_RECONCILIATION_BATCH_ID, token, "multiple")
		const latest = harness.records().filter((record) => record.type === "oracle-label").at(-1)!
		assert.equal(latest.id, result.recordId)
		assert.equal(latest.supersedes, first.id)
		assert.equal(result.revision, 3)
	})
})

describe("gate-reconciliation page, driven by keystrokes", () => {
	it("oracle.html declares both reconciliation lines", async () => {
		const markup = await readFile(fileURLToPath(new URL("../review-ui/oracle.html", import.meta.url)), "utf8")
		// The page renders the block defensively — a missing element must not take the whole render
		// down — so this is the assertion that stops the tolerance from silently swallowing the block.
		assert.ok(markup.includes('id="reconcile-prior"'), "oracle.html has no #reconcile-prior")
		assert.ok(markup.includes('id="reconcile-conflict"'), "oracle.html has no #reconcile-conflict")
	})

	let harness: Harness
	let page: FakePage

	before(async () => {
		harness = await startHarness()
		await harness.handle.service.pushOracleValidation(fixture, ["gate reconciliation"])
		page = await openPage(harness.base, ORACLE_PAGE, NODE_IDS, `${harness.base}/oracle?batch=${GATE_RECONCILIATION_BATCH_ID}`)
	})

	after(async () => {
		await harness?.stop()
	})

	it("opens on the first artwork's gate, with both previous answers on screen", () => {
		const first = fixture.items.find((item) => item.itemId === fixture.serveOrder[0])!
		const context = first.reconciliation!
		assert.equal(page.nodes.question.textContent, fixture.questions.find((q) => q.key === first.questionKey)!.question)
		for (const prior of context.priorAnswers) {
			assert.ok(
				page.nodes["reconcile-prior"].textContent.includes(`${prior.questionKey} = ${prior.answer}`),
				`the page does not show the previous ${prior.questionKey} answer`,
			)
		}
		assert.match(page.nodes["reconcile-prior"].textContent, /these conflict/u)
		assert.equal(page.nodes["reconcile-conflict"].textContent, context.conflict)
		assert.match(page.nodes.progress.textContent, /^artwork 1 \/ 8 · gate · /u)
	})

	it("keeps the context on the dependant, which is the whole point of the arrangement", async () => {
		const gate = fixture.items.find((item) => item.itemId === fixture.serveOrder[0])!
		const dependant = fixture.items.find((item) => item.itemId === fixture.serveOrder[1])!
		const question = fixture.questions.find((entry) => entry.key === gate.questionKey)!
		await page.press(question.answers[0].hotkey)
		assert.equal(page.nodes.question.textContent, fixture.questions.find((q) => q.key === dependant.questionKey)!.question)
		assert.equal(page.nodes["reconcile-conflict"].textContent, dependant.reconciliation!.conflict)
		assert.match(page.nodes.progress.textContent, /^artwork 1 \/ 8 · dependent · /u)

		const label = harness.records().filter((record): record is OracleLabelRecord => record.type === "oracle-label").at(-1)!
		assert.equal(label.answer, question.answers[0].key)
		assert.equal(label.imageId, gate.imageId)
		assert.equal(label.questionKey, gate.questionKey)
	})

	it("moves to the next artwork only after its group is finished", async () => {
		const dependant = fixture.items.find((item) => item.itemId === fixture.serveOrder[1])!
		const question = fixture.questions.find((entry) => entry.key === dependant.questionKey)!
		await page.press(question.answers[0].hotkey)
		assert.match(page.nodes.progress.textContent, /^artwork 2 \/ 8 · gate · /u)
		assert.match(page.nodes.progress.textContent, /1 artworks done$/u)
	})
})
