/**
 * The adjudication CLI, the v3-era warehouse loader, and the run-versus-run movement guardrail.
 *
 * The warehouse tests build a throwaway log with the warehouse's own fixture builders rather than
 * reading the real one, so they assert the *loader's* behaviour — including that demo-fixture records
 * are excluded — without depending on what happens to be in `data/warehouse/` on any given day.
 */

import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { adjudicateRun, compareRuns, readCandidateRun } from "../src/adjudication/adjudicate.ts"
import { parseArgs, runCli, UsageError } from "../src/adjudication/cli.ts"
import { loadEvidence, loadWarehouseEvidence } from "../src/adjudication/evidence.ts"
import {
	counterIds,
	makeArtwork,
	makeFingerprint,
	makePalette,
	makeSide,
	makeVerdict,
	stepClock,
} from "../src/warehouse/fixtures.ts"
import type { CodeFingerprint, PaletteSnapshot, VerdictSide } from "../src/warehouse/records.ts"
import { appendMany } from "../src/warehouse/warehouse.ts"

const FIXTURES = fileURLToPath(new URL("./adjudication-fixtures", import.meta.url))
const LEGACY_DIR = resolve(FIXTURES, "legacy")
const NO_WAREHOUSE = resolve(FIXTURES, "no-such-warehouse.jsonl")
const CANDIDATES = resolve(FIXTURES, "candidates.jsonl")
const BASELINE = resolve(FIXTURES, "candidates-baseline.jsonl")

const CURRENT_SHA = "1".repeat(64)

/**
 * `makeSide` hashes the palette you give it but stores `palette: null` — the inline copy is optional
 * in the schema. Adjudication reads the inline copy, so these tests put it back.
 */
function sideWithPalette(
	variantId: string,
	palette: PaletteSnapshot,
	fingerprint?: CodeFingerprint,
): VerdictSide {
	return { ...makeSide(variantId, { palette, ...(fingerprint ? { fingerprint } : {}) }), palette }
}

function temp(): string {
	return mkdtempSync(resolve(tmpdir(), "adjudication-"))
}

/** A warehouse holding one real graded pair, one demo fixture, and one regraded palette. */
function buildWarehouse(dir: string): string {
	const file = resolve(dir, "warehouse.jsonl")
	const ids = counterIds()
	const now = stepClock("2026-08-03T10:00:00.000Z")
	const artwork = makeArtwork({ path: "/tmp/current.jpg", sha256: CURRENT_SHA })
	const good = makePalette({ background: "#101018", surface: "#1c1c2a", foreground: "#e8e6f0", accent: "#c94f3d" })
	const regraded = makePalette({ background: "#900000", surface: "#a01010", foreground: "#fff0f0", accent: "#00ff00" })

	appendMany(
		file,
		[
			makeVerdict({
				itemId: "real-1",
				artwork,
				sideA: sideWithPalette("arm/one", good),
				sideB: null,
				mode: "absolute",
				gradeA: "strong",
				gradeB: null,
				preference: null,
				comment: "clean",
			}),
			makeVerdict({
				itemId: "demo-1",
				artwork,
				sideA: sideWithPalette(
					"demo",
					makePalette({ background: "#020202" }),
					makeFingerprint({ algorithmVersion: "demo-fixture-alpha" }),
				),
				sideB: null,
				mode: "absolute",
				gradeA: "strong",
				gradeB: null,
				preference: null,
			}),
			makeVerdict({
				itemId: "regrade-1",
				artwork,
				sideA: sideWithPalette("arm/two", regraded),
				sideB: null,
				mode: "absolute",
				gradeA: "strong",
				gradeB: null,
				preference: null,
			}),
			makeVerdict({
				itemId: "regrade-2",
				artwork,
				sideA: sideWithPalette("arm/two", regraded),
				sideB: null,
				mode: "absolute",
				gradeA: "weak",
				gradeB: null,
				preference: null,
			}),
		],
		{ idFactory: (type) => ids(type), now },
	)
	return file
}

// ---------------------------------------------------------------------------------------------
// The v3 era
// ---------------------------------------------------------------------------------------------

test("warehouse verdicts load as v3-era evidence, tiered by grade", () => {
	const file = buildWarehouse(temp())
	const loaded = loadWarehouseEvidence(file, "2026-08-04T00:00:00.000Z")
	assert.equal(loaded.excludedDemoFixtures, 1)
	assert.equal(loaded.entries.length, 2)
	for (const entry of loaded.entries) {
		assert.equal(entry.provenance.era, "v3")
		assert.equal(entry.provenance.contract, "v3")
		assert.ok(entry.provenance.recordedAt)
	}
	const tiers = loaded.entries.map((entry) => entry.tier).sort()
	assert.deepEqual(tiers, ["endorsement", "known-bad"])
})

test("the v3 loader applies the same recency rule: latest grade decides the tier", () => {
	const file = buildWarehouse(temp())
	const loaded = loadWarehouseEvidence(file, null)
	const regraded = loaded.entries.find((entry) => entry.roleSignature.startsWith("#900000"))!
	assert.equal(regraded.tier, "known-bad", "graded strong, then weak — the later grade stands")
	assert.equal(regraded.resolution.standingGrade, "weak")
	assert.deepEqual(regraded.resolution.distinctGrades, ["strong", "weak"])
	assert.equal(regraded.resolution.resolvedByRecency, true)
	assert.equal(regraded.resolution.history.length, 2, "the superseded grade is kept, not deleted")
})

test("demo-fixture records are excluded by default and countable when asked for", () => {
	const file = buildWarehouse(temp())
	const included = loadWarehouseEvidence(file, null, { includeDemoFixtures: true })
	assert.equal(included.entries.length, 3)
	assert.equal(included.excludedDemoFixtures, 0)
})

test("an absent warehouse is an empty current regime, not an error", () => {
	const loaded = loadWarehouseEvidence(NO_WAREHOUSE, null)
	assert.deepEqual(loaded.entries, [])
	assert.equal(loaded.sources.length, 3)
	assert.equal(loaded.sources.every((source) => source.entryCount === 0), true)
})

test("the two eras adjudicate side by side without mixing", () => {
	const dir = temp()
	const file = buildWarehouse(dir)
	const run = resolve(dir, "run.jsonl")
	writeFileSync(
		run,
		[
			// matches the v3 endorsement
			JSON.stringify({
				arm: "proto",
				palette: {
					roles: { background: "#101018", surface: "#1c1c2a", foreground: "#e8e6f0", accent: "#c94f3d" },
					metadata: { inputContentHash: CURRENT_SHA, sourceRendition: { path: "/tmp/current.jpg" } },
				},
			}),
			// matches the v2-3 endorsement e1 on a different file
			JSON.stringify({
				arm: "proto",
				palette: {
					roles: { background: "#101018", surface: "#1c1c2a", foreground: "#e8e6f0", accent: "#c94f3d" },
					metadata: { inputContentHash: "a".repeat(64), sourceRendition: { path: "fixtures/artwork-a.jpg" } },
				},
			}),
		].join("\n"),
	)

	const corpus = loadEvidence({ legacyDir: LEGACY_DIR, warehouseFile: file, asOf: "2026-08-04T00:00:00.000Z" })
	const report = adjudicateRun(readCandidateRun(run), corpus, { asOf: "2026-08-04T00:00:00.000Z" })
	const current = report.aggregate.byEra.find((row) => row.era === "v3")!
	const legacy = report.aggregate.byEra.find((row) => row.era === "v2-3")!
	assert.equal(current.wins.candidates, 1)
	assert.equal(legacy.wins.candidates, 1)
	// The same palette wins in one era and is unseen in the other — the split is never collapsed.
	const first = report.perCandidate.find((verdict) => verdict.artworkSha256 === CURRENT_SHA)!
	assert.equal(first.byEra.find((row) => row.era === "v3")!.outcome, "endorsement-match")
	assert.equal(first.byEra.find((row) => row.era === "v2-3")!.outcome, "unseen")
})

// ---------------------------------------------------------------------------------------------
// Movement — the "never move TO known-worse" guardrail
// ---------------------------------------------------------------------------------------------

test("movement reports files that moved to known-bad, as a list and not a score", () => {
	const corpus = loadEvidence({ legacyDir: LEGACY_DIR, warehouseFile: NO_WAREHOUSE, asOf: null })
	const candidate = adjudicateRun(readCandidateRun(CANDIDATES), corpus, {}).perCandidate
	const baseline = adjudicateRun(readCandidateRun(BASELINE), corpus, {}).perCandidate

	const forward = compareRuns(candidate, baseline, BASELINE)
	assert.deepEqual(forward.movedToKnownBad.map((row) => row.artworkSha256).sort(), [
		"b".repeat(64),
		"c".repeat(64),
	])
	assert.equal(forward.movedOffKnownBad.length, 0)
	assert.deepEqual(forward.movedToKnownBad[0]!.entryIds, ["k1"])
	assert.ok(forward.onlyInCandidate.length > 0, "files the baseline never covered are scoped out, not counted")

	const backward = compareRuns(baseline, candidate, CANDIDATES)
	assert.equal(backward.movedToKnownBad.length, 0)
	assert.equal(backward.movedOffKnownBad.length, 2)
})

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

test("the CLI exits 0 even when the run reproduces known-bad palettes", () => {
	const result = runCli(["run", CANDIDATES, "--legacy-dir", LEGACY_DIR, "--warehouse", NO_WAREHOUSE])
	assert.equal(result.exitCode, 0, "this tool does not gate")
	assert.match(result.text, /LOSS matches known-bad k1/)
	assert.match(result.text, /Gating: none/)
	// the principles are the first thing a reader meets
	assert.ok(result.text.indexOf("many valid palettes") < result.text.indexOf("RESULTS BY ERA"))
})

test("the CLI emits parseable JSON", () => {
	const result = runCli([
		"run",
		CANDIDATES,
		"--legacy-dir",
		LEGACY_DIR,
		"--warehouse",
		NO_WAREHOUSE,
		"--format",
		"json",
		"--as-of",
		"2026-08-04T00:00:00.000Z",
	])
	const report = JSON.parse(result.text)
	assert.equal(report.gating, "none")
	assert.equal(report.perCandidate.length, 10)
	assert.equal(report.options.asOf, "2026-08-04T00:00:00.000Z")
	assert.equal(report.schemaVersion, "adjudication-report-0.1.0")
})

test("the CLI is deterministic across invocations", () => {
	const argv = ["run", CANDIDATES, "--legacy-dir", LEGACY_DIR, "--warehouse", NO_WAREHOUSE, "--format", "json"]
	assert.equal(runCli(argv).text, runCli(argv).text)
})

test("explain scopes the report to one artwork", () => {
	const result = runCli([
		"explain",
		CANDIDATES,
		"--artwork",
		"b".repeat(64),
		"--legacy-dir",
		LEGACY_DIR,
		"--warehouse",
		NO_WAREHOUSE,
	])
	assert.equal(result.exitCode, 0)
	assert.match(result.text, /artwork-b\.jpg/)
	assert.equal(/artwork-c\.jpg/.test(result.text), false)
})

test("explain says so when the artwork is not in the run", () => {
	const result = runCli([
		"explain",
		CANDIDATES,
		"--artwork",
		"9".repeat(64),
		"--legacy-dir",
		LEGACY_DIR,
		"--warehouse",
		NO_WAREHOUSE,
	])
	assert.equal(result.exitCode, 2)
})

test("corpus censuses the evidence and its contradictions", () => {
	const result = runCli(["corpus", "--legacy-dir", LEGACY_DIR, "--warehouse", NO_WAREHOUSE])
	assert.equal(result.exitCode, 0)
	assert.match(result.text, /total entries: 11/)
	assert.match(result.text, /tier-overlap\s+1/)
	assert.match(result.text, /The current regime has NO standing palette verdicts yet/)
})

test("the CLI reports movement when given a baseline", () => {
	const result = runCli([
		"run",
		CANDIDATES,
		"--baseline",
		BASELINE,
		"--legacy-dir",
		LEGACY_DIR,
		"--warehouse",
		NO_WAREHOUSE,
	])
	assert.match(result.text, /moved TO known-bad:\s+2/)
})

test("argument parsing rejects what it cannot honour", () => {
	assert.throws(() => parseArgs(["run"]), UsageError)
	assert.throws(() => parseArgs(["run", CANDIDATES, "--bar", "nope"]), UsageError)
	assert.throws(() => parseArgs(["run", CANDIDATES, "--roles", "backdrop"]), UsageError)
	assert.throws(() => parseArgs(["run", CANDIDATES, "--era", "v1"]), UsageError)
	assert.throws(() => parseArgs(["run", CANDIDATES, "--near-misses", "-1"]), UsageError)
	assert.throws(() => parseArgs(["explain", CANDIDATES]), UsageError)
	assert.throws(() => parseArgs(["run", CANDIDATES, "--nope"]), UsageError)
})

test("a numeric --bar selects the fixed mode", () => {
	const parsed = parseArgs(["run", CANDIDATES, "--bar", "0.03"])
	assert.equal(parsed.match.barMode, "fixed")
	assert.equal(parsed.match.fixedBar, 0.03)
})

test("--help prints usage and exits 0", () => {
	const result = runCli(["--help"])
	assert.equal(result.exitCode, 0)
	assert.match(result.text, /Exit status is 0 whenever adjudication completed/)
})
