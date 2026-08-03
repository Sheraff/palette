/**
 * End-to-end census over a fixture tree with known contents.
 *
 * This pins the file-level rules — which files are scanned at all, and which are skipped and
 * therefore must appear in `body.skippedFiles`. A file-level skip is the easiest place to hide a
 * pile of untagged constants, so the vendored-code and type-declaration skips get the same
 * treatment as the literal-level exclusions: named, counted, listed.
 *
 * Fixture tree (`tests/honesty-fixtures/tree/`):
 *   src/policy.ts        3 named constants — [REVIEWED], [UNCALIBRATED], untagged — + a bare threshold
 *   src/deep/util.ts     a slice(0, 8) — the 0 is excluded, the 8 is a real choice
 *   src/types.d.ts       skipped: type declarations have no runtime behaviour
 *   oracle/tool/config.py                a [MEASURED] constant and a bare one
 *   oracle/tool/.venv/lib/vendored.py    never descended into
 *   oracle/tool/__pycache__/cached.py    never descended into
 *   data/notes.txt                       not source, and outside the scan roots anyway
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import { discoverAndScan, SCAN_ROOTS } from "../src/honesty/cli.ts"
import { buildDecisionIndex } from "../src/honesty/classify.ts"
import { buildReport, renderMarkdown } from "../src/honesty/report.ts"

const TREE = fileURLToPath(new URL("./honesty-fixtures/tree", import.meta.url))

function census() {
	const { scanned, skipped } = discoverAndScan(TREE, SCAN_ROOTS)
	return buildReport(scanned, buildDecisionIndex(null), {
		roots: [...SCAN_ROOTS],
		generatedAt: "2026-08-03T00:00:00.000Z",
		skippedFiles: skipped,
	})
}

describe("file discovery", () => {
	test("scans exactly the source files under the roots", () => {
		const { scanned } = discoverAndScan(TREE, SCAN_ROOTS)
		assert.deepEqual(
			scanned.map((f) => f.file).sort(),
			["oracle/tool/config.py", "src/deep/util.ts", "src/policy.ts"],
		)
	})

	test("never descends into virtualenvs or caches", () => {
		const { scanned, skipped } = discoverAndScan(TREE, SCAN_ROOTS)
		const all = [...scanned.map((f) => f.file), ...skipped.map((s) => s.file)].join("\n")
		assert.ok(!all.includes(".venv"), "vendored dependencies are not this project's parameters")
		assert.ok(!all.includes("__pycache__"))
	})

	test("skips type-declaration files, and says so out loud", () => {
		const { skipped } = discoverAndScan(TREE, SCAN_ROOTS)
		assert.equal(skipped.length, 1)
		assert.equal(skipped[0].file, "src/types.d.ts")
		assert.match(skipped[0].reason, /type-declaration/)
	})

	test("both languages are scanned, each with its own fidelity", () => {
		const report = census()
		assert.equal(report.body.corpus.byLanguage.ts.files, 2)
		assert.equal(report.body.corpus.byLanguage.py.files, 1)
		assert.equal(report.body.corpus.byLanguage.ts.fidelity, "ast")
		assert.equal(report.body.corpus.byLanguage.py.fidelity, "lexical")
	})

	test("discovery is deterministic across runs", () => {
		assert.equal(census().bodyHash, census().bodyHash)
	})
})

describe("end-to-end provenance over the fixture tree", () => {
	const report = census()
	const at = (file: string, line: number) =>
		report.body.untagged.find((e) => e.file === file && e.line === line)

	test("the tagged constants are found and attributed", () => {
		assert.equal(report.body.byTag.REVIEWED, 1)
		assert.equal(report.body.byTag.UNCALIBRATED, 1)
		assert.equal(report.body.byTag.MEASURED, 1)
	})

	test("the untagged constants are the ones with no comment", () => {
		assert.ok(at("src/policy.ts", 12), "MYSTERY_FLOOR has only a plain comment, no tag")
		assert.ok(at("oracle/tool/config.py", 4), "BARE_THRESHOLD has no comment at all")
	})

	test("a bare threshold inside a function is counted", () => {
		const returned = report.body.untagged.find(
			(e) => e.file === "src/policy.ts" && e.value === 0.91,
		)
		assert.ok(returned, "0.91 in `score > 0.91` is a tunable site")
		assert.ok(returned.suspicion >= 6, "a comparison against an odd float should rank high")
	})

	test("slice(0, 8): the origin is excluded, the prefix length is not", () => {
		const eight = report.body.untagged.find(
			(e) => e.file === "src/deep/util.ts" && e.value === 8,
		)
		assert.ok(eight, "a hash prefix length is a real choice and stays counted")
		const zero = report.body.untagged.find(
			(e) => e.file === "src/deep/util.ts" && e.value === 0,
		)
		assert.equal(zero, undefined, "'from the beginning' is not a tunable")
	})

	test("the accounting identities hold on a real scan", () => {
		const t = report.body.totals
		assert.equal(t.excluded + t.tunableSites, t.candidates)
		assert.equal(t.tagged + t.decisionTraced + t.decisionDangling + t.untagged, t.tunableSites)
		assert.equal(
			report.body.exclusions.reduce((n, r) => n + r.count, 0),
			t.excluded,
		)
	})

	test("the markdown renders without throwing and names the skipped file", () => {
		const md = renderMarkdown(report)
		assert.ok(md.includes("Whole files skipped: 1"))
		assert.ok(md.includes("Tunable sites:"))
	})
})
