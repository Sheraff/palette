/**
 * The per-area growth rule (build item 15).
 *
 * Two halves, and the split matters:
 *
 * 1. **The rule, on synthetic fixtures.** Phase 0 gates nothing, so the live half below cannot
 *    exercise a single failure path — it passes vacuously and would keep passing if
 *    `compareAreaGrowth` returned `ok: true` unconditionally. These fixtures are what actually pin
 *    the behaviour, including the failure that will matter the day an area is promoted.
 * 2. **The live check.** Re-runs the census over the real tree and compares it against the committed
 *    report. This is the test that fails on the machine of whoever adds an untagged constant to a
 *    gated area. It is a normal local test on purpose — the reviewer's ruling on item 15 rules out a
 *    CI dependency.
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { compareAreaGrowth, describeRegressions } from "../src/honesty/growth.ts"
import { AREA_CONFIG, areaOf, gateFor } from "../src/honesty/areas.ts"
import { V3_ROOT, runCensus } from "../src/honesty/cli.ts"
import type { AreaRow } from "../src/honesty/report.ts"
import type { HonestyReport } from "../src/honesty/report.ts"

/** A minimal area row; only `area` and `untagged` are load-bearing for the growth rule. */
function row(area: string, untagged: number, tunableSites = untagged): AreaRow {
	const { gate, workstream, configured } = gateFor(area)
	return {
		area,
		gate,
		configured,
		workstream,
		files: 1,
		tunableSites,
		tagged: tunableSites - untagged,
		decisionTraced: 0,
		documented: tunableSites - untagged,
		untagged,
		anchored: 0,
		documentedFraction: 0,
		anchoredFraction: 0,
	}
}

/**
 * `compareAreaGrowth` reads gates from live config, so exercising the GATED path means overriding
 * one. Rather than mutate the frozen-by-convention config, these fixtures name an area that config
 * genuinely marks GATED — and since Phase 0 marks none, the tests below drive the comparison
 * through a locally-shadowed gate lookup by constructing rows for a *hypothetical* gated area.
 *
 * That is done by monkey-patching the module's config array in place for the duration of the block:
 * `AREA_CONFIG` is a readonly array of plain objects, and flipping one entry's `gate` is the exact
 * one-word edit a real promotion would be. Restored after each test so nothing leaks.
 */
const GATED_FIXTURE_AREA = "src/contract"

function withGatedArea<T>(area: string, run: () => T): T {
	const entry = AREA_CONFIG.find((c) => c.area === area)
	assert.ok(entry, `fixture area ${area} must exist in AREA_CONFIG`)
	const previous = entry.gate
	;(entry as { gate: string }).gate = "GATED"
	try {
		return run()
	} finally {
		;(entry as { gate: string }).gate = previous
	}
}

describe("areaOf", () => {
	test("maps a file to its owning top-level directory under the scan root", () => {
		assert.equal(areaOf("src/contract/invariants.ts"), "src/contract")
		assert.equal(areaOf("oracle/premise/glm_probe.py"), "oracle/premise")
		assert.equal(areaOf("src/review-server/deep/nested/file.ts"), "src/review-server")
	})

	test("a file loose in a scan root is surfaced, not dropped", () => {
		assert.equal(areaOf("src/stray.ts"), "src/(root)")
	})
})

describe("gate configuration", () => {
	test("Phase 0 marks every configured area INFORMATIONAL", () => {
		const gated = AREA_CONFIG.filter((c) => c.gate === "GATED")
		assert.deepEqual(
			gated.map((c) => c.area),
			[],
			"Phase 0 config must gate nothing (reviewer's ruling on build item 15)",
		)
	})

	test("an unlisted area is informational and flagged as unconfigured", () => {
		const unknown = gateFor("src/does-not-exist-yet")
		assert.equal(unknown.gate, "INFORMATIONAL")
		assert.equal(unknown.configured, false)
	})

	test("area names are unique and sorted", () => {
		const names = AREA_CONFIG.map((c) => c.area)
		assert.deepEqual(names, [...new Set(names)], "duplicate area entries")
		assert.deepEqual(names, [...names].sort(), "AREA_CONFIG must stay sorted for reviewability")
	})
})

describe("compareAreaGrowth", () => {
	test("informational areas never regress, however much they grow", () => {
		const before = [row("src/warehouse", 3)]
		const after = [row("src/warehouse", 300)]
		const result = compareAreaGrowth(before, after)
		assert.equal(result.ok, true)
		assert.deepEqual(result.regressions, [])
		assert.deepEqual(result.gatedAreas, [])
	})

	test("a gated area that grows is a regression, with the arithmetic reported", () => {
		withGatedArea(GATED_FIXTURE_AREA, () => {
			const result = compareAreaGrowth(
				[row(GATED_FIXTURE_AREA, 10)],
				[row(GATED_FIXTURE_AREA, 13)],
			)
			assert.equal(result.ok, false)
			assert.equal(result.regressions.length, 1)
			assert.deepEqual(result.regressions[0], {
				area: GATED_FIXTURE_AREA,
				workstream: "contract schema + gates",
				baselineUntagged: 10,
				currentUntagged: 13,
				growth: 3,
			})
			assert.match(describeRegressions(result), /src\/contract.*10 -> 13 untagged \(\+3\)/s)
		})
	})

	test("a gated area holding steady or shrinking passes — a floor, not a ratchet", () => {
		withGatedArea(GATED_FIXTURE_AREA, () => {
			assert.equal(
				compareAreaGrowth([row(GATED_FIXTURE_AREA, 10)], [row(GATED_FIXTURE_AREA, 10)]).ok,
				true,
			)
			assert.equal(
				compareAreaGrowth([row(GATED_FIXTURE_AREA, 10)], [row(GATED_FIXTURE_AREA, 2)]).ok,
				true,
			)
		})
	})

	test("growth in tagged sites is free: only untagged is watched", () => {
		withGatedArea(GATED_FIXTURE_AREA, () => {
			const before = [row(GATED_FIXTURE_AREA, 4, 10)]
			const after = [row(GATED_FIXTURE_AREA, 4, 900)]
			assert.equal(compareAreaGrowth(before, after).ok, true)
		})
	})

	test("a gated area with no baseline row is new, not a regression from zero", () => {
		withGatedArea(GATED_FIXTURE_AREA, () => {
			const result = compareAreaGrowth([], [row(GATED_FIXTURE_AREA, 7)])
			assert.equal(result.ok, true)
			assert.deepEqual(result.newGatedAreas, [GATED_FIXTURE_AREA])
		})
	})

	test("a gated area that disappears is reported, never a failure", () => {
		withGatedArea(GATED_FIXTURE_AREA, () => {
			const result = compareAreaGrowth([row(GATED_FIXTURE_AREA, 7)], [])
			assert.equal(result.ok, true)
			assert.deepEqual(result.vanishedGatedAreas, [GATED_FIXTURE_AREA])
		})
	})

	test("describeRegressions is honest when there is nothing to report", () => {
		assert.equal(
			describeRegressions(compareAreaGrowth([row("src/warehouse", 1)], [row("src/warehouse", 9)])),
			"no gated area grew",
		)
	})
})

describe("live census — no gated area has grown", () => {
	test("current tree vs committed report", () => {
		const committed = JSON.parse(
			readFileSync(join(V3_ROOT, "data/honesty/honesty-report.json"), "utf8"),
		) as HonestyReport
		assert.ok(
			Array.isArray(committed.body.byArea),
			"the committed report predates per-area reporting — regenerate it: node --experimental-strip-types src/honesty/cli.ts",
		)
		// A fixed timestamp: the comparison reads `body` only, and a wall-clock read here would be the
		// one nondeterministic thing in a test about determinism.
		const current = runCensus(V3_ROOT, committed.meta.generatedAt)
		const comparison = compareAreaGrowth(committed.body.byArea, current.body.byArea)
		assert.ok(comparison.ok, describeRegressions(comparison))
	})

	test("every area the census finds is classified in areas.ts", () => {
		const committed = JSON.parse(
			readFileSync(join(V3_ROOT, "data/honesty/honesty-report.json"), "utf8"),
		) as HonestyReport
		const unconfigured = committed.body.byArea.filter((r) => !r.configured).map((r) => r.area)
		assert.deepEqual(
			unconfigured,
			[],
			`areas under a scan root with no entry in src/honesty/areas.ts: ${unconfigured.join(", ")}`,
		)
	})
})
