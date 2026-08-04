/**
 * # The attribution reader's tests
 *
 * `attribution.ts` computes no energy and measures no image. Everything it can get wrong is a
 * *reading* error: pairing the wrong entries, decomposing a total into terms that do not add back
 * up, or quietly disagreeing with the pre-registered counts it claims to be explaining. So the
 * suite is three reconciliations and a determinism check, and nothing else — there is no new
 * arithmetic here worth a golden value.
 *
 * 1. **The decomposition is a decomposition.** Both arms' term vectors are stored at λ=1; if they
 *    do not sum to `totals["1"]` *exactly*, every per-term delta in the report is a delta of
 *    something other than the margin that decided the pair, and the whole analysis is void. Exact,
 *    not within a tolerance: these are the same additions the energies themselves performed.
 * 2. **The counts reconcile with the pre-registered run.** The attribution's win/loss/tie counts
 *    are recomputed from the entry totals, independently of `compare.ts`'s `outcome` strings. If
 *    they differ from `m1-summary.json`, the reader is pairing something the falsifier did not, and
 *    a term attribution over the wrong pairs would look exactly as plausible as a right one.
 * 3. **The argmax counts are conserved.** Every losing pair contributes exactly one argmax, so the
 *    per-term argmax counts must sum to the number of losing pairs. This is the cheap check that
 *    catches a filter applied in one place and not another.
 * 4. **Determinism.** Two runs, byte-identical outputs. The program is a pure reader with no RNG
 *    and no clock, and this is the assertion that keeps it that way.
 *
 * ```sh
 * cd research/v3
 * NODE_NO_WARNINGS=1 node --experimental-strip-types --test prototypes/p1-mdl/tests/falsifier/attribution.test.ts
 * ```
 */

import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"
import { PROTOTYPE_ROOT } from "../../src/emit/paths.ts"

const DATA_DIR = join(PROTOTYPE_ROOT, "data", "falsifier")
const SCRIPT = join(PROTOTYPE_ROOT, "src", "falsifier", "attribution.ts")

const read = (name: string) => readFileSync(join(DATA_DIR, name), "utf8")
const readJson = (name: string) => JSON.parse(read(name)) as Record<string, any>

function runAttribution(): void {
	execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", SCRIPT], { stdio: "pipe" })
}

describe("M1 attribution reader", () => {
	test("the stored term vectors sum to the compared total exactly, at λ=1", () => {
		const results = readJson("m1-results.json")
		const termsOf: Record<string, string[]> = {
			p1a: ["field", "ink", "structural", "escape"],
			p1ap: ["fieldColorBits", "fieldSupportBits", "inkColorBits", "inkSupportBits", "genericBits", "paletteBits"],
		}
		for (const entry of results.entries) {
			for (const arm of ["p1a", "p1ap"]) {
				let sum = 0
				for (const term of termsOf[arm]!) sum += entry[arm].terms[term]
				assert.equal(
					sum,
					entry[arm].totals["1"],
					`${entry.entryId} ${arm}: terms sum to ${sum}, total is ${entry[arm].totals["1"]}`,
				)
			}
		}
	})

	test("the attribution's win/loss/tie counts reconcile with the pre-registered comparison", () => {
		const results = readJson("m1-results.json")
		const attribution = readJson("m1-attribution.json")
		const byId = new Map<string, any>(results.entries.map((e: any) => [e.entryId, e]))

		for (const row of attribution.q1TermAttribution) {
			const comparison = results.comparisons.find(
				(c: any) =>
					c.id === `${row.family}|${row.arm}|lambda=1|stratum=all|${row.selection}`,
			)
			assert.ok(comparison !== undefined, `no λ=1 comparison for ${row.family}/${row.arm}/${row.selection}`)

			// Recompute the outcome from the entry totals rather than trusting `outcome`, so the two
			// paths into the same fact are genuinely independent.
			let wins = 0
			let losses = 0
			let ties = 0
			for (const pair of comparison.rows) {
				const left = byId.get(pair.leftEntryId)![row.arm].totals["1"] as number
				const right = byId.get(pair.rightEntryId)![row.arm].totals["1"] as number
				if (left === right) ties += 1
				else if (left < right) wins += 1
				else losses += 1
			}
			assert.deepEqual(
				{ wins, losses, ties },
				{ wins: row.counts.wins, losses: row.counts.losses, ties: row.counts.ties },
				`${row.family}/${row.arm}/${row.selection}: attribution counts disagree with the totals`,
			)
			assert.deepEqual(
				{ wins, losses, ties },
				{ wins: comparison.counts.wins, losses: comparison.counts.losses, ties: comparison.counts.ties },
				`${row.family}/${row.arm}/${row.selection}: attribution counts disagree with m1-results.json`,
			)
			assert.equal(row.pairs, comparison.rows.length)
		}
	})

	test("every losing and winning pair contributes exactly one argmax", () => {
		const attribution = readJson("m1-attribution.json")
		for (const row of attribution.q1TermAttribution) {
			for (const which of ["losses", "wins"] as const) {
				const total = row[which].terms.reduce((s: number, t: any) => s + t.argmaxCount, 0)
				assert.equal(
					total,
					row[which].n,
					`${row.family}/${row.arm}/${row.selection} ${which}: argmax counts sum to ${total}, expected ${row[which].n}`,
				)
				for (const t of row[which].terms) assert.equal(t.n, row[which].n)
			}
		}
	})

	test("the gradient cross-tab cells partition the pairs", () => {
		const attribution = readJson("m1-attribution.json")
		for (const block of attribution.q2Reconstruction.crossTabByPairSet) {
			const cellTotal = block.cells.reduce((s: number, c: any) => s + c.n, 0)
			const row = attribution.q1TermAttribution.find(
				(r: any) => r.family === block.family && r.selection === block.selection && r.arm === block.arm,
			)
			if (row === undefined) continue
			assert.equal(cellTotal, row.pairs, `${block.family}/${block.arm}: cross-tab cells cover ${cellTotal} of ${row.pairs}`)
		}
	})

	test("the run is deterministic: two invocations produce byte-identical artifacts", () => {
		runAttribution()
		const firstJson = read("m1-attribution.json")
		const firstMd = read("m1-attribution.md")
		runAttribution()
		assert.equal(read("m1-attribution.json"), firstJson, "m1-attribution.json differs between runs")
		assert.equal(read("m1-attribution.md"), firstMd, "m1-attribution.md differs between runs")
	})

	test("the readable report stays inside its length budget", () => {
		const lines = read("m1-attribution.md").split("\n")
		// Trailing newline produces one empty final element; the budget is on content lines.
		const content = lines[lines.length - 1] === "" ? lines.length - 1 : lines.length
		assert.ok(content <= 120, `m1-attribution.md is ${content} lines, budget is 120`)
	})
})
