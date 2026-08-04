/**
 * Oracle-validation mode, and its first batch — the premise-test disambiguation round.
 *
 * Two properties carry the round, and they are what this file is mostly about:
 *
 *  - **the fixture is deterministic and derived from committed sources**, so the file in the repo,
 *    the batch under review and any later re-derivation are the same 30 artworks; and
 *  - **nothing the reviewer must not know is served**. The stakes here are higher than the
 *    bracketing round's. This batch exists to break a tie between the oracle and the accepted
 *    palette's gradient flag, and its answer decides the premise verdict. A payload that leaked
 *    what the oracle said, or what the algorithm published, would not weaken the measurement — it
 *    would replace it with a measurement of the reviewer's agreeableness.
 */
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { after, before, describe, it } from "node:test"
import { validateRecord, type OracleLabelRecord } from "../src/warehouse/records.ts"
import { isBatchReleased, resolve } from "../src/warehouse/warehouse.ts"
import {
	GRADIENT_MAP,
	GROUND_TYPE_INSTRUCTION,
	GROUND_TYPE_QUESTION,
	MAX_ENUM_ANSWERS,
	ORACLE_LABEL_SCHEMA_VERSION,
	P6_BUCKETS,
	PREMISE_AGREEMENT_PATH,
	PREMISE_DISAMBIGUATION_BATCH_ID,
	PREMISE_DISAMBIGUATION_FIXTURE_PATH,
	PREMISE_DISAMBIGUATION_FIXTURE_VERSION,
	buildPremiseDisambiguationFixture,
	p6Bucket,
	readPremiseRun,
	serializeFixture,
	tierOf,
	validateFixture,
	type OracleValidationFixture,
} from "../src/review-server/oracle-validation.ts"
import { seedOracleValidationRound } from "../src/review-server/server.ts"
import { readJsonl } from "../src/review-server/store.ts"
import { call, startHarness, type Harness } from "../src/review-server/test-support.ts"
import type { StoredOracleBatch } from "../src/review-server/types.ts"

const fixture = await buildPremiseDisambiguationFixture()
const BATCH = PREMISE_DISAMBIGUATION_BATCH_ID

describe("oracle-validation fixture generation", () => {
	it("is deterministic — the same sources give the same round", async () => {
		assert.deepEqual(await buildPremiseDisambiguationFixture(), fixture)
		// A different seed is a different serve order over the same items, which is what a second pass
		// over the same artworks would need.
		const reseeded = await buildPremiseDisambiguationFixture({ seed: 1, batchId: "other" })
		assert.deepEqual(
			reseeded.items.map((item) => item.itemId).sort(),
			[...fixture.items].map((item) => item.itemId).sort(),
		)
		assert.notDeepEqual(reseeded.serveOrder, fixture.serveOrder)
	})

	it("matches the committed file", async () => {
		const committed = await readFile(PREMISE_DISAMBIGUATION_FIXTURE_PATH, "utf8")
		assert.equal(
			committed,
			serializeFixture(fixture),
			"the committed fixture is not what the generator produces — regenerate it with --write",
		)
	})

	it("selects exactly the premise test's contradictions, under either prompt variant", async () => {
		const premise = await readPremiseRun()
		const expected = new Set<string>()
		for (const [sha256, entry] of premise) {
			if (entry.conflicted) continue
			for (const groundType of entry.byVariant.values()) {
				if (p6Bucket(groundType, entry.truth).startsWith("contradiction")) expected.add(sha256)
			}
		}
		assert.deepEqual(new Set(fixture.items.map((item) => item.sha256)), expected)
		assert.equal(fixture.items.length, 30, "the round is the 30 artworks the two sources cannot both be right about")
		// Deduplicated across variants: 19 under A and 20 under B, overlapping on 9.
		assert.equal(fixture.selection.counts.contradiction_hard_or_soft_under_A, 19)
		assert.equal(fixture.selection.counts.contradiction_hard_or_soft_under_B, 20)
		assert.equal(fixture.selection.counts.contradiction_under_both_variants, 9)
		assert.equal(fixture.selection.counts.selected, fixture.items.length)
	})

	it("keeps the conflicted-truth artworks out, matching the premise analysis's primary population", async () => {
		const premise = await readPremiseRun()
		for (const item of fixture.items) {
			assert.equal(premise.get(item.sha256)!.conflicted, false, `${item.imagePath} has self-contradicting ground truth`)
		}
		assert.equal(fixture.selection.counts.conflicted_truth_excluded, 5)
	})

	it("reproduces the premise analysis's own bucket counts from the same maps", async () => {
		// The maps are copied into this workstream rather than imported from Python. This is the guard
		// that they are still the same maps: re-derive every bucket and check the totals against the
		// numbers the premise analysis published.
		const published = JSON.parse(await readFile(PREMISE_AGREEMENT_PATH, "utf8")) as {
			gradient_map: Record<string, string>
			p6_buckets_map: Record<string, string>
			per_variant: Record<string, { p6_buckets: Record<string, number> }>
		}
		assert.deepEqual({ ...GRADIENT_MAP }, published.gradient_map)
		assert.deepEqual({ ...P6_BUCKETS }, published.p6_buckets_map)

		const premise = await readPremiseRun()
		for (const [variant, report] of Object.entries(published.per_variant)) {
			const counts: Record<string, number> = {}
			for (const entry of premise.values()) {
				if (entry.conflicted) continue
				const groundType = entry.byVariant.get(variant)
				if (groundType === undefined) continue
				const bucket = p6Bucket(groundType, entry.truth)
				counts[bucket] = (counts[bucket] ?? 0) + 1
			}
			assert.deepEqual(counts, report.p6_buckets, `variant ${variant} re-derives different buckets`)
		}
	})

	it("asks the exact question the oracle was asked, in the exact vocabulary", () => {
		assert.equal(fixture.questions.length, 1)
		assert.deepEqual(fixture.questions[0], GROUND_TYPE_QUESTION)
		assert.deepEqual(
			GROUND_TYPE_QUESTION.answers.map((answer) => answer.key),
			["flat_field", "shaded_field", "multiple_distinct_fields", "full_scene", "pattern_or_texture", "none_discernible"],
		)
		assert.equal(GROUND_TYPE_QUESTION.instruction, GROUND_TYPE_INSTRUCTION)
		assert.match(GROUND_TYPE_QUESTION.instruction, /shadows on the same surface/u)
		assert.match(GROUND_TYPE_QUESTION.instruction, /sky and the grass are different areas/u)
		// The schema is the oracle's own: these rows are meant to be compared to the VLM's row for row.
		assert.equal(fixture.labelSchemaVersion, ORACLE_LABEL_SCHEMA_VERSION)
		assert.equal(fixture.labelSchemaVersion, "group-a.v1")
	})

	it("binds one keystroke per answer, with the whole vocabulary reachable", () => {
		const hotkeys = GROUND_TYPE_QUESTION.answers.map((answer) => answer.hotkey)
		assert.deepEqual(hotkeys, ["1", "2", "3", "4", "5", "6"])
		assert.ok(hotkeys.length <= MAX_ENUM_ANSWERS, "more than nine answers cannot be one keystroke each")
		for (const answer of GROUND_TYPE_QUESTION.answers) assert.ok(answer.gloss.length > 0, `${answer.key} has no gloss`)
	})

	it("names the rendition it serves, and only renditions the eval set chose", () => {
		for (const item of fixture.items) {
			assert.equal(item.rendition.source, "research/v3/data/oracle-premise/eval-set.json")
			assert.ok(item.rendition.sourceEntryId.length > 0)
			assert.equal(item.rendition.longEdgePx, Math.max(item.rendition.width, item.rendition.height))
			assert.equal(item.stratum, tierOf(item.rendition.longEdgePx))
			assert.match(item.sha256, /^[0-9a-f]{64}$/u)
			assert.ok(!item.imagePath.startsWith("/"), "fixture paths are repo-root-relative, so the file is portable")
		}
	})

	it("carries no answer from either side it is meant to adjudicate", () => {
		// The fixture is committed, so this is not only about the payload: the file itself must not be
		// a place where a curious reviewer can read off the answer. The batch-level counts and the
		// selection rule stay — they describe the round, not any one artwork — but nothing per item may
		// say what the oracle answered or what the algorithm published.
		for (const item of fixture.items) {
			assert.deepEqual(
				Object.keys(item).sort(),
				["artworkId", "collection", "imageId", "imagePath", "itemId", "questionKey", "rendition", "sha256", "stratum"],
			)
			const text = JSON.stringify(item)
			for (const forbidden of ["gradient", "flat", "shaded", "scene", "pattern", "contradiction", "truth", "bucket"]) {
				assert.ok(!text.includes(forbidden), `${item.itemId} leaks ${forbidden}`)
			}
		}
		// Nor may the item ids: they are content-derived, and say nothing about why the item is here.
		for (const item of fixture.items) assert.equal(item.itemId, `gt-${item.sha256.slice(0, 12)}`)
	})

	it("serves one question at a time, shuffled inside the pass", () => {
		assert.doesNotThrow(() => validateFixture(fixture))
		assert.equal(fixture.serveOrder.length, fixture.items.length)
		assert.equal(new Set(fixture.serveOrder).size, fixture.items.length)
		assert.notDeepEqual(fixture.serveOrder, fixture.items.map((item) => item.itemId))
	})

	it("refuses a fixture whose questions interleave, or that binds a key twice", () => {
		const twoQuestions: OracleValidationFixture = {
			...fixture,
			questions: [GROUND_TYPE_QUESTION, { ...GROUND_TYPE_QUESTION, key: "has_text" }],
			items: [
				{ ...fixture.items[0], itemId: "a", questionKey: "ground_type" },
				{ ...fixture.items[1], itemId: "b", questionKey: "has_text" },
				{ ...fixture.items[2], itemId: "c", questionKey: "ground_type" },
			],
			serveOrder: ["a", "b", "c"],
		}
		assert.throws(() => validateFixture(twoQuestions), /interleaves questions/u)
		assert.doesNotThrow(() => validateFixture({ ...twoQuestions, serveOrder: ["a", "c", "b"] }))

		const clashing: OracleValidationFixture = {
			...fixture,
			questions: [
				{
					...GROUND_TYPE_QUESTION,
					answers: GROUND_TYPE_QUESTION.answers.map((answer) => ({ ...answer, hotkey: "1" })),
				},
			],
		}
		assert.throws(() => validateFixture(clashing), /binds 1 twice/u)
	})
})

describe("oracle-validation round in the review server", () => {
	let harness: Harness
	let stored: StoredOracleBatch

	before(async () => {
		harness = await startHarness()
		assert.equal(await seedOracleValidationRound(harness.handle.service), BATCH)
		stored = (await readJsonl<StoredOracleBatch>(harness.batchLogPath))[0] as StoredOracleBatch
	})

	after(async () => {
		await harness?.stop()
	})

	it("materializes artwork identity from the file header, and checks custody against the fixture", () => {
		assert.equal(Object.keys(stored.artworks).length, fixture.items.length)
		for (const item of fixture.items) {
			const artwork = stored.artworks[item.itemId]
			assert.equal(artwork.sha256, item.sha256, "the push must verify the bytes are the bytes the round was built on")
			assert.ok(artwork.path.startsWith("/"), "the record carries the full path")
			assert.ok(artwork.path.endsWith(item.imagePath))
			// Dimensions come from the header, never the filename or the fixture's copy.
			assert.equal(artwork.rendition.width, item.rendition.width)
			assert.equal(artwork.rendition.height, item.rendition.height)
			assert.ok(artwork.rendition.bytes > 0)
			assert.equal(artwork.rendition.artworkId, item.artworkId)
		}
	})

	it("serves the question, the mapping and the images — and nothing from either side of the tie", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		assert.equal(payload.status, 200)
		assert.equal(payload.body.items.length, fixture.items.length)
		assert.equal(payload.body.questions.length, 1)
		assert.equal(payload.body.questions[0].itemCount, fixture.items.length)
		assert.equal(payload.body.questions[0].instruction, GROUND_TYPE_INSTRUCTION)
		assert.deepEqual(
			payload.body.questions[0].answers.map((answer: any) => [answer.hotkey, answer.key]),
			GROUND_TYPE_QUESTION.answers.map((answer) => [answer.hotkey, answer.key]),
		)

		// `itemRef` is the ONE field allowed to carry a form of a join key, added 2026-08-04 so the
		// reviewer can name the item in front of them. It is stripped before the leak scan, so the scan
		// still proves nothing ELSE carries an id or a hash — see ITEM_FIELD_ALLOWLIST for the reasoning.
		const text = JSON.stringify(payload.body, (key, value) => (key === "itemRef" ? undefined : value))
		for (const forbidden of [
			// What the oracle said, and the words that would give it away one item at a time.
			"gradient_truth",
			"contradiction",
			"underdetermined",
			"p6_bucket",
			"variant",
			"prompt",
			// The selection counts describe the batch's composition; the reviewer does not need them.
			"selection",
			"conflicted",
			// The join keys to both truth sources, and the real item ids.
			"sha256",
			"entryId",
			...fixture.items.map((item) => item.itemId),
			...fixture.items.map((item) => item.sha256),
		]) {
			assert.ok(!text.includes(forbidden), `the served payload leaks ${forbidden}`)
		}
		for (const item of payload.body.items) {
			assert.deepEqual(Object.keys(item).sort(), ["answer", "height", "itemRef", "media", "questionKey", "revision", "token", "width"])
			assert.equal(item.questionKey, "ground_type")
			assert.match(item.media, /^\/media\//u)
		}
		// The gradient flag is a boolean per artwork; a payload that carried it would carry the answer.
		assert.ok(!Object.keys(payload.body).includes("flag"))
	})

	it("serves the items in the fixture's seeded order", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		const resolved = payload.body.items.map((item: any) => stored.answerTokens[item.token])
		assert.deepEqual(resolved, [...fixture.serveOrder])
	})

	it("serves the artwork bytes by token, not by item id", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		const first = payload.body.items[0]
		const media = await call(harness.base, "GET", first.media)
		assert.equal(media.status, 200)
		assert.ok(typeof media.body === "string" && media.body.length > 0)
		const byItemId = await call(harness.base, "GET", `/media/${BATCH}/${stored.answerTokens[first.token]}`)
		assert.equal(byItemId.status, 404, "the browser never learns an item id, so it must not be able to ask by one")
	})

	it("records an answer as an oracle-label with the oracle's own provenance columns", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		const first = payload.body.items[0]
		const response = await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${first.token}/answer`, {
			answer: "shaded_field",
		})
		assert.equal(response.status, 200)
		assert.equal(response.body.revision, 1)

		const record = harness.records().at(-1) as OracleLabelRecord
		assert.doesNotThrow(() => validateRecord(record))
		assert.equal(record.type, "oracle-label")
		assert.equal(record.questionKey, "ground_type")
		assert.equal(record.answer, "shaded_field")
		assert.equal(record.labelSchemaVersion, ORACLE_LABEL_SCHEMA_VERSION)
		// Authorship is what separates this row from the VLM's; the schema deliberately does not.
		assert.equal(record.author.kind, "human")
		assert.equal(record.author.id, "test-reviewer")

		const itemId = stored.answerTokens[first.token]
		const item = fixture.items.find((entry) => entry.itemId === itemId)!
		assert.equal(record.imageId, item.imageId)
		assert.equal(record.stratum, item.stratum)
		assert.equal(record.artwork?.sha256, item.sha256)
		assert.ok(record.artwork?.path.endsWith(item.imagePath), "artworks are identified by full path + content hash")
		assert.equal(record.artwork?.rendition.width, item.rendition.width)
		assert.equal(record.batch?.id, BATCH)
		assert.equal(record.batch?.purpose, "oracle-validation")
		assert.equal(record.batch?.itemCount, fixture.items.length)
	})

	it("refuses an answer outside the closed vocabulary, and an unknown token", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		const wrong = await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${payload.body.items[1].token}/answer`, {
			answer: "sort of shaded",
		})
		assert.equal(wrong.status, 400)
		assert.match(wrong.body.error, /flat_field \| shaded_field/u)
		const nonString = await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${payload.body.items[1].token}/answer`, {
			answer: true,
		})
		assert.equal(nonString.status, 400)
		const unknown = await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/deadbeef/answer`, {
			answer: "flat_field",
		})
		assert.equal(unknown.status, 404)
	})

	it("supersedes an answer when the reviewer steps back and answers again", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		const first = payload.body.items[0]
		const again = await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${first.token}/answer`, {
			answer: "full_scene",
		})
		assert.equal(again.body.revision, 2)
		const labels = harness.records().filter((record) => record.type === "oracle-label")
		assert.equal(labels.length, 2, "undo appends, it never deletes")
		const after_ = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		assert.equal(after_.body.items[0].answer, "full_scene", "the latest answer is the reviewer's position")
	})

	it("resumes where the reviewer stopped, across a restart", async () => {
		const before_ = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		harness = await harness.restart()
		const after_ = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		assert.deepEqual(after_.body, before_.body)
		// The tokens are part of the stored batch, so a page left open still works after a restart.
		assert.equal(after_.body.items[0].token, before_.body.items[0].token)
		// "Resumable anywhere" is the first unanswered item, which is what the page opens at.
		assert.equal(after_.body.items.findIndex((item: any) => item.answer === null), 1)
	})

	it("appears in the queue and releases through the normal flow", async () => {
		const queue = await call(harness.base, "GET", "/api/queue")
		const entry = queue.body.batches.find((batch: any) => batch.batchId === BATCH)
		assert.equal(entry.kind, "oracle-validation")
		assert.equal(entry.purpose, "oracle-validation")
		assert.equal(entry.itemCount, fixture.items.length)
		assert.equal(entry.judgedCount, 1)

		const refused = await call(harness.base, "POST", `/api/batches/${BATCH}/release`)
		assert.equal(refused.status, 409)
		assert.match(refused.body.error, /unjudged items/u)

		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		for (const item of payload.body.items) {
			if (item.answer !== null) continue
			await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${item.token}/answer`, { answer: "flat_field" })
		}
		const released = await call(harness.base, "POST", `/api/batches/${BATCH}/release`)
		assert.equal(released.status, 200)
		assert.equal(released.body.itemCount, fixture.items.length)
		assert.equal(released.body.fundingRecordIds.length, fixture.items.length)
		assert.deepEqual(released.body.itemsWithoutComment, [], "a by-question pass has no free-text channel to be missing")
		assert.ok(isBatchReleased(harness.records(), BATCH))

		const closed = await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${payload.body.items[0].token}/answer`, {
			answer: "flat_field",
		})
		assert.equal(closed.status, 409, "a released round takes no more answers")
	})

	it("refuses a fixture version it does not know, and a batch id already in the queue", async () => {
		const duplicate = await call(harness.base, "POST", "/api/oracle-validation", {})
		assert.equal(duplicate.status, 409)
		const wrongVersion = await call(harness.base, "POST", "/api/oracle-validation", {
			fixture: { ...fixture, fixtureVersion: "made-up", batchId: "made-up-round" },
		})
		assert.equal(wrongVersion.status, 400)
		assert.match(wrongVersion.body.error, /Unknown oracle-validation fixture version/u)
		assert.equal(PREMISE_DISAMBIGUATION_FIXTURE_VERSION, "oracle-validation-1")
	})

	it("hands the analysis a set of records it can read", async () => {
		const { analyzeOracleValidation } = await import("../src/review-server/analyze-oracle-validation.ts")
		const labels = resolve(harness.records()).filter((entry) => entry.record.type === "oracle-label")
		assert.equal(labels.length, fixture.items.length + 1, "every item answered, plus the one superseded answer")
		const analysis = analyzeOracleValidation(fixture, harness.records(), await readPremiseRun(), {
			warehousePath: harness.warehousePath,
			fixturePath: PREMISE_DISAMBIGUATION_FIXTURE_PATH,
			premiseRunPath: "premise-run-1.jsonl",
			batchId: BATCH,
		})
		assert.equal(analysis.answered, fixture.items.length)
		assert.equal(analysis.unanswered, 0)
		assert.equal(analysis.skipped.superseded, 1)
		assert.ok(analysis.summaryLines.length > 0)
		assert.equal(analysis.artworkLines.length, fixture.items.length)
	})
})

describe("oracle-validation analysis", () => {
	// A synthetic round, so the join can be checked against answers whose right result is known by
	// construction. The real round's numbers are the reviewer's; these are the arithmetic's.
	it("reports who the reviewer sided with on each contradiction", async () => {
		const { analyzeOracleValidation } = await import("../src/review-server/analyze-oracle-validation.ts")
		const harness = await startHarness()
		try {
			await seedOracleValidationRound(harness.handle.service)
			const premise = await readPremiseRun()
			const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
			const stored = (await readJsonl<StoredOracleBatch>(harness.batchLogPath))[0] as StoredOracleBatch

			// Answer every item with the label the *oracle's contradicting variant* implies: the reviewer
			// siding with the oracle every single time.
			for (const served of payload.body.items) {
				const item = fixture.items.find((entry) => entry.itemId === stored.answerTokens[served.token])!
				const source = premise.get(item.sha256)!
				const contradicting = [...source.byVariant.values()].find((groundType) =>
					p6Bucket(groundType, source.truth).startsWith("contradiction"),
				)!
				await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${served.token}/answer`, {
					answer: contradicting,
				})
			}
			const sidedWithOracle = analyzeOracleValidation(fixture, harness.records(), premise, {
				warehousePath: harness.warehousePath,
				fixturePath: PREMISE_DISAMBIGUATION_FIXTURE_PATH,
				premiseRunPath: "premise-run-1.jsonl",
				batchId: BATCH,
			})
			assert.equal(sidedWithOracle.totals.contradictionVerdict.oracle, fixture.items.length)
			assert.equal(sidedWithOracle.totals.contradictionVerdict.flag ?? 0, 0)
			assert.equal(sidedWithOracle.totals.binaryAgreementWithFlag.agreed, 0)
			assert.match(sidedWithOracle.summaryLines.join("\n"), /the oracle\s+30 of 30 \(100%\)/u)
			assert.match(sidedWithOracle.summaryLines.join("\n"), /premise survives/u)
			// Every item's per-artwork row agrees with the total, and names the flag it disagreed with.
			for (const entry of sidedWithOracle.perArtwork) {
				assert.equal(entry.contradictionVerdict, "oracle")
				assert.equal(entry.flagAgrees, false)
				assert.ok(Object.values(entry.oracle).some((view) => view.contradicted))
			}

			// The same records read under a different batch id must produce nothing: rounds are never
			// pooled, exactly as the bracketing analysis learned the hard way.
			const scoped = analyzeOracleValidation(fixture, harness.records(), premise, {
				warehousePath: harness.warehousePath,
				fixturePath: PREMISE_DISAMBIGUATION_FIXTURE_PATH,
				premiseRunPath: "premise-run-1.jsonl",
				batchId: "some-other-round",
			})
			assert.equal(scoped.answered, 0)
			assert.equal(scoped.skipped.otherBatch, fixture.items.length)
			assert.match(scoped.summaryLines.join("\n"), /no answers/u)
		} finally {
			await harness.stop()
		}
	})

	it("ignores a machine-authored row in the same batch — the rater is not the subject", async () => {
		const { analyzeOracleValidation } = await import("../src/review-server/analyze-oracle-validation.ts")
		const { append } = await import("../src/warehouse/warehouse.ts")
		const harness = await startHarness()
		try {
			await seedOracleValidationRound(harness.handle.service)
			const stored = (await readJsonl<StoredOracleBatch>(harness.batchLogPath))[0] as StoredOracleBatch
			const item = fixture.items[0]
			// The VLM's own rows carry the same labelSchemaVersion by design; only authorship separates them.
			append(harness.warehousePath, {
				type: "oracle-label",
				author: { kind: "agent", id: "qwen3-vl-30b" },
				imageId: item.imageId,
				artwork: stored.artworks[item.itemId],
				labelSchemaVersion: ORACLE_LABEL_SCHEMA_VERSION,
				questionKey: "ground_type",
				answer: "shaded_field",
				confidence: "high",
				ambiguityNote: null,
				stratum: item.stratum,
				batch: { id: BATCH, purpose: "oracle-validation", itemCount: fixture.items.length, fundedBy: [] },
			} as never)
			const analysis = analyzeOracleValidation(fixture, harness.records(), await readPremiseRun(), {
				warehousePath: harness.warehousePath,
				fixturePath: PREMISE_DISAMBIGUATION_FIXTURE_PATH,
				premiseRunPath: "premise-run-1.jsonl",
				batchId: BATCH,
			})
			assert.equal(analysis.answered, 0)
			assert.equal(analysis.skipped.machineAuthored, 1)
		} finally {
			await harness.stop()
		}
	})
})
