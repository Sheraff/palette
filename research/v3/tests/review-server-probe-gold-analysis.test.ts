/**
 * The human probe round's analysis (PREMISE_NEXT.md §12 use (b)).
 *
 * The one thing that must never rot here is the derivation: it is a **lookup** against a committed
 * 729-row table whose digest is pinned, and "an implementation that disagrees with any of the 729
 * entries is wrong, not the table." A TypeScript reimplementation of the rules would be a second
 * source of truth that agrees today and diverges silently later, so these tests check that this file
 * holds no rules — only the table, the pin, and the join.
 */
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import {
	DERIVATION_SHA256,
	DERIVATION_TABLE_SIZE,
	REVIEWER_REPEAT_CONSISTENCY,
	SCOPING_NOTES,
	analyzeProbeGold,
	derive,
	loadDerivation,
} from "../src/review-server/analyze-probe-gold.ts"
import {
	PROBE_GOLD_FIXTURE_PATH,
	PREMISE_DISAMBIGUATION_FIXTURE_PATH,
	PROBE_ORDER,
	type OracleValidationFixture,
} from "../src/review-server/oracle-validation.ts"

const ANALYSIS_PATH = fileURLToPath(new URL("../data/oracle-validation/probe-gold-1-analysis.json", import.meta.url))
const derivation = await loadDerivation()

async function fixture(path: string): Promise<OracleValidationFixture> {
	return JSON.parse(await readFile(path, "utf8")) as OracleValidationFixture
}

describe("probe derivation — lookup, never rules", () => {
	it("loads the pinned table and refuses any other", async () => {
		assert.equal(derivation.sha256, DERIVATION_SHA256)
		assert.equal(Object.keys(derivation.table).length, DERIVATION_TABLE_SIZE)
		assert.equal(derivation.schemaVersion, "group-a.probes.v1")
		// The probe order the fixture asks in must be the order the table is keyed by, or every vector
		// is assembled against the wrong column.
		assert.deepEqual([...derivation.probeOrder], [...PROBE_ORDER])
		await assert.rejects(
			() => loadDerivation(PREMISE_DISAMBIGUATION_FIXTURE_PATH),
			/sha256 .* != pinned/u,
			"a table that is not the pinned one must stop the analysis, not be used",
		)
	})

	it("is total over all 3^6 vectors, and returns the table's own row", () => {
		const codes = ["yes", "no", "unsure"] as const
		let checked = 0
		for (const a of codes) {
			for (const b of codes) {
				for (const c of codes) {
					for (const d of codes) {
						for (const e of codes) {
							for (const f of codes) {
								const answers = Object.fromEntries(
									PROBE_ORDER.map((probe, index) => [probe, [a, b, c, d, e, f][index]]),
								)
								const result = derive(derivation, answers)
								const row = derivation.table[result.probeVector!]
								// Every field comes off the row verbatim; nothing is computed.
								assert.equal(result.groundType, row.ground_type)
								assert.equal(result.fieldTexture, row.field_texture)
								assert.equal(result.disposition, row.disposition)
								assert.deepEqual(result.tensions, row.tensions)
								checked++
							}
						}
					}
				}
			}
		}
		assert.equal(checked, DERIVATION_TABLE_SIZE)
	})

	it("makes a missing probe a named outcome, never a guess", () => {
		const partial = { bg_visible: "yes", one_colour: "no" }
		const result = derive(derivation, partial)
		assert.equal(result.probeVector, null)
		assert.equal(result.groundType, "underdetermined")
		assert.equal(result.disposition, "incomplete")
		assert.deepEqual([...result.probeMissing], PROBE_ORDER.slice(2))
		// An answer outside the vocabulary is missing, not coerced.
		const bogus = derive(derivation, { ...partial, continuous_change: "probably" })
		assert.ok(bogus.probeMissing.includes("continuous_change"))
	})
})

describe("probe-gold analysis", () => {
	it("reproduces the committed analysis from the warehouse", async () => {
		const committed = JSON.parse(await readFile(ANALYSIS_PATH, "utf8")) as {
			generatedAt: string
			warehousePath: string
			[key: string]: unknown
		}
		const { readAll } = await import("../src/warehouse/warehouse.ts")
		const fresh = analyzeProbeGold(
			await fixture(PROBE_GOLD_FIXTURE_PATH),
			await fixture(PREMISE_DISAMBIGUATION_FIXTURE_PATH),
			derivation,
			readAll(committed.warehousePath),
			{ warehousePath: committed.warehousePath },
			() => new Date(committed.generatedAt),
		)
		// The analysis is a pure function of the warehouse plus two committed fixtures: re-running it
		// must give the same file back, or the number in the report is not the number in the repo.
		assert.deepEqual(JSON.parse(JSON.stringify(fresh)), committed)
	})

	it("reports the matrix, not only a rate, and against the pre-registered floor", async () => {
		const committed = JSON.parse(await readFile(ANALYSIS_PATH, "utf8")) as any
		assert.equal(committed.agreement.noiseFloor, REVIEWER_REPEAT_CONSISTENCY)
		assert.equal(REVIEWER_REPEAT_CONSISTENCY, 0.63)
		assert.equal(committed.counts.probeAnswers, 180)
		assert.equal(committed.counts.comparable, 30)
		assert.equal(committed.counts.missingProbeAnswers, 0)
		// A confusion matrix, whose cells sum to the comparable count.
		const total = Object.values(committed.confusion as Record<string, Record<string, number>>)
			.flatMap((row) => Object.values(row))
			.reduce((sum, count) => sum + count, 0)
		assert.equal(total, committed.counts.comparable)
		assert.ok(committed.summaryLines.join("\n").includes("CONFUSION MATRIX"))
		// The pattern is reported per tag, because the pre-registration asks for where it sits.
		assert.ok(Object.keys(committed.pattern.byDirectTag).length > 1)
	})

	it("stamps the scoping notes, including the one that cuts against the result", async () => {
		const committed = JSON.parse(await readFile(ANALYSIS_PATH, "utf8")) as any
		assert.deepEqual(committed.scoping, SCOPING_NOTES)
		const text = SCOPING_NOTES.join("\n")
		assert.match(text, /before reading the derivation table/u, "the clean-on-the-rules condition")
		assert.match(text, /browsed \/oracle-review earlier the same day/u, "the anchoring caveat")
		assert.match(text, /upper bound/u, "and which way that caveat cuts")
		assert.match(text, /NO MODEL IS INVOLVED/u)
	})

	it("judges the unsure channel before reading anything into it", async () => {
		const committed = JSON.parse(await readFile(ANALYSIS_PATH, "utf8")) as any
		assert.equal(committed.ambiguitySurfaced.unsureAnswers, 1)
		// One answer in 180 cannot carry a verdict, and the reading says so rather than averaging it.
		assert.ok(committed.ambiguitySurfaced.unsureUsageRate < 0.05)
		assert.match(committed.ambiguitySurfaced.reading, /UNSURE CHANNEL WENT ESSENTIALLY UNUSED/u)
		assert.match(committed.ambiguitySurfaced.reading, /Nothing below rests on the unsure counts/u)
	})

	it("scopes to the two batches and counts everything it skipped", async () => {
		const committed = JSON.parse(await readFile(ANALYSIS_PATH, "utf8")) as any
		assert.equal(committed.probeBatchId, "oracle-probe-gold-1")
		assert.equal(committed.directBatchId, "oracle-premise-disambiguation-1")
		// Other rounds live in the same warehouse and are read and skipped, never pooled.
		assert.ok(committed.skipped.probe.otherBatch > 0)
		assert.ok(committed.skipped.direct.otherBatch > 0)
		assert.equal(committed.skipped.probe.machineAuthored, 0)
		assert.equal(committed.derivation.sha256, DERIVATION_SHA256)
	})
})
