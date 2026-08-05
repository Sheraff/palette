/**
 * # What the demo-20 run actually emitted, re-checked from the artifact
 *
 * Two of the M2 brief's four required tests live here, and both are assertions about a **run's
 * output file** rather than about a fresh computation:
 *
 * - *"feasibility — every emitted palette passes validatePalette hard mode"*
 * - *"escape-never-fires on demo-20"*
 *
 * Reading the artifact is the point, not a shortcut. `DESIGN.md`'s verification discipline is that
 * *"every load-bearing layer gets an independent verifier that re-derives from artifacts, not from
 * the implementer's claims"*. A test that re-ran the emitter would be re-asking the emitter; this one
 * takes the palettes that were actually written to `data/emitter/`, re-decodes the artworks they name,
 * and puts them through the contract with the image facts supplied.
 *
 * ## "Hard mode", defined
 *
 * `validatePalette` with **both** image-side facts supplied — a `PixelSource` over the artwork and the
 * decoder's transparency report — so invariant 2's existence clause and invariant 5 actually run.
 * `src/emit/feasibility.ts` is explicit that a deferral is not a pass, so the assertion is:
 *
 * - `valid` is true, and
 * - the only deferral is `I2.spatial-spread`, which is deferred *permanently* for want of thresholds
 *   and is deferred for every palette anyone will ever validate.
 *
 * That is strictly stronger than what the search's inner loop checks, which is the whole reason to
 * check it here.
 *
 * If the artifact is missing the test **fails**, with the command to produce it. A skipped test that
 * silently passes on an absent file is how a corpus gate comes to report a clean sweep.
 */

import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { validatePalette } from "../../../../src/contract/invariants.ts"
import { DEFERRED_SPATIAL_SPREAD } from "../../../../src/contract/invariants.ts"
import type { Palette } from "../../../../src/contract/types.ts"
import { measureImage } from "../../src/measure/index.ts"
import { imageFactsOf } from "../../src/search/image-facts.ts"
import { EMITTER_DATA_DIR } from "../../src/search/run-emitter.ts"
import type { Diagnostics } from "../../src/search/types.ts"

type Row = {
	kind: string
	index?: number
	imagePath?: string
	ok?: boolean
	palette?: Palette
	diagnostics?: Diagnostics
	error?: string | null
}

/** Every demo-20 emitter artifact in the data directory, newest name last. */
function artifacts(): string[] {
	if (!existsSync(EMITTER_DATA_DIR)) return []
	return readdirSync(EMITTER_DATA_DIR)
		.filter((name) => name.endsWith(".jsonl") && name.includes("demo-20"))
		.sort()
		.map((name) => join(EMITTER_DATA_DIR, name))
}

function readRows(path: string): { header: Row; rows: Row[]; footer: Row } {
	const lines = readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Row)
	const rows = lines.filter((line) => line.kind === "p1-emitter-row")
	const header = lines.find((line) => line.kind === "p1-emitter-run-header") as Row
	const footer = lines.find((line) => line.kind === "p1-emitter-run-footer") as Row
	return { header, rows, footer }
}

const files = artifacts()

test("a demo-20 emitter artifact exists for both arms", () => {
	assert.ok(
		files.length > 0,
		`no demo-20 artifact in ${EMITTER_DATA_DIR}. Produce one with:\n` +
			`  node --experimental-strip-types prototypes/p1-mdl/src/search/run-emitter.ts --arm both --set demo-20 --as-of <YYYY-MM-DD>`,
	)
	const arms = files.map((file) => (readRows(file).header as unknown as { arm: string }).arm)
	assert.deepEqual([...new Set(arms)].sort(), ["a", "aprime"])
})

for (const file of files) {
	const { header, rows, footer } = readRows(file)
	const arm = (header as unknown as { arm: string }).arm

	test(`arm ${arm}: every image in demo-20 produced a palette`, () => {
		assert.equal(rows.length, 20, "demo-20 is twenty covers")
		const failed = rows.filter((row) => row.ok !== true)
		assert.deepEqual(
			failed.map((row) => `${row.imagePath}: ${row.error}`),
			[],
			"emit() threw on some covers",
		)
		assert.equal((footer as unknown as { okCount: number }).okCount, 20)
	})

	test(`arm ${arm}: the escape branch never fired on demo-20`, () => {
		// `DESIGN.md` decision 6: 1,396 of 1,397 endorsed role colours are exact source triples, so the
		// escape is expected to essentially never fire. A hit here is not a failure of the escape — it
		// is an artwork whose entire reached in-artwork feasible set was empty, and it wants looking at.
		const escaped = rows.filter((row) => row.diagnostics?.escape.used === true)
		assert.deepEqual(escaped.map((row) => row.imagePath), [])
		assert.equal((footer as unknown as { escapeCount: number }).escapeCount, 0)
	})

	test(`arm ${arm}: every emitted palette passes the contract in hard mode`, async () => {
		for (const row of rows) {
			assert.ok(row.palette !== undefined && row.imagePath !== undefined)
			const measurement = await measureImage(row.imagePath)
			const facts = imageFactsOf(measurement)
			const result = validatePalette(row.palette, {
				source: facts.source,
				transparency: facts.transparency,
				throwOnTransparentInput: true,
			})
			assert.deepEqual(
				result.violations.map((violation) => violation.code),
				[],
				`${row.imagePath} emitted a palette with violations`,
			)
			assert.equal(result.valid, true)
			assert.deepEqual(
				[...result.deferred].sort(),
				[DEFERRED_SPATIAL_SPREAD],
				`${row.imagePath}: something other than the permanently-deferred spatial-spread clause was skipped`,
			)
		}
	})

	test(`arm ${arm}: every row carries the v0 certificate and both ink contrast reports`, () => {
		for (const row of rows) {
			const diagnostics = row.diagnostics as Diagnostics
			assert.equal(diagnostics.searchCertificate, "UNCERTIFIED-V0")
			assert.ok(Number.isFinite(diagnostics.apca.foreground.minAbsRaw))
			assert.ok(Number.isFinite(diagnostics.apca.accent.minAbsRaw))
			assert.ok(diagnostics.runnerUps.every((runnerUp) => runnerUp.gap >= 0))
			assert.equal(typeof diagnostics.knownBetterFeasible.underSearched, "boolean")
		}
	})
}
