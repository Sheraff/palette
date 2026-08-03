/**
 * Pins the honesty report's determinism and its accounting identities.
 *
 * The determinism tests are load-bearing: this metric is meant to be tracked across runs, so a
 * re-run over an unchanged tree must produce a byte-identical body. If it does not, every future
 * comparison is noise.
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { buildReport, renderMarkdown, hashBody } from "../src/honesty/report.ts"
import { buildDecisionIndex } from "../src/honesty/classify.ts"
import type { Candidate, CommentBlock, ContextFlag, ScannedFile } from "../src/honesty/types.ts"

const decisions = buildDecisionIndex({
	decisions: [
		{ id: "d-2026-08-03-funded", fundedBy: ["w-1"] },
		{ id: "d-2026-08-03-verbal", fundedBy: [] },
	],
})

function site(
	file: string,
	line: number,
	comments: CommentBlock[],
	flags: ContextFlag[] = [],
	value = 0.37,
): Candidate {
	return {
		file,
		line,
		column: 1,
		value,
		text: String(value),
		language: file.endsWith(".py") ? "py" : "ts",
		enclosing: { kind: "const", name: "X", functionName: null },
		snippet: `const X = ${value}`,
		comments,
		flags,
		...(file.endsWith(".py") ? { language: "py" as const } : {}),
	}
}

const lead = (text: string): CommentBlock[] => [{ source: "leading", text }]

function corpus(): ScannedFile[] {
	return [
		{
			file: "src/a.ts",
			language: "ts",
			fidelity: "ast",
			lines: 50,
			candidates: [
				site("src/a.ts", 1, lead("/** [REVIEWED] Flo ruled. */")),
				site("src/a.ts", 2, lead("/** [MEASURED] from the pilot. */")),
				site("src/a.ts", 3, lead("/** [INHERITED] from v2-3. */")),
				site("src/a.ts", 4, lead("/** [UNCALIBRATED] a guess. */")),
				site("src/a.ts", 5, []), // untagged
				site("src/a.ts", 6, [], ["comparison-operand"]), // untagged, more suspicious
				site("src/a.ts", 7, lead("// per d-2026-08-03-funded")),
				site("src/a.ts", 8, lead("// per d-2026-08-03-verbal")),
				site("src/a.ts", 9, lead("// per d-2026-08-03-ghost")), // dangling
				site("src/a.ts", 10, [], ["exit-code"], 1), // excluded
				site("src/a.ts", 11, [], ["index-access"], 2), // excluded
			],
		},
		{
			file: "oracle/b.py",
			language: "py",
			fidelity: "lexical",
			lines: 30,
			candidates: [
				site("oracle/b.py", 1, [{ source: "shared-doc-block", text: "# [REVIEWED] pair" }]),
				site("oracle/b.py", 2, []),
			],
		},
	]
}

const options = { roots: ["src", "oracle"], generatedAt: "2026-08-03T00:00:00.000Z" }

describe("determinism", () => {
	test("the same tree hashes identically regardless of timestamp", () => {
		const a = buildReport(corpus(), decisions, options)
		const b = buildReport(corpus(), decisions, {
			...options,
			generatedAt: "2027-01-01T12:34:56.000Z",
		})
		assert.equal(a.bodyHash, b.bodyHash)
		assert.deepEqual(a.body, b.body)
		assert.notEqual(a.meta.generatedAt, b.meta.generatedAt)
	})

	test("the body carries no timestamp", () => {
		const report = buildReport(corpus(), decisions, options)
		const serialized = JSON.stringify(report.body)
		assert.ok(!serialized.includes("2026-08-03T00:00:00"))
		assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(serialized))
	})

	test("file discovery order does not change the body", () => {
		const forward = buildReport(corpus(), decisions, options)
		const reversed = buildReport([...corpus()].reverse(), decisions, options)
		assert.equal(forward.bodyHash, reversed.bodyHash)
	})

	test("the hash is insensitive to key insertion order", () => {
		const report = buildReport(corpus(), decisions, options)

		// Rebuild the same content with keys inserted in reverse order, at the top level and in a
		// nested object. Values are carried over by reference, so only ordering differs.
		const reorder = <T extends object>(obj: T): T => {
			const out = {} as Record<string, unknown>
			for (const key of Object.keys(obj).reverse()) out[key] = (obj as never)[key]
			return out as T
		}
		const reordered = reorder({ ...report.body, totals: reorder(report.body.totals) })

		assert.notEqual(
			JSON.stringify(reordered),
			JSON.stringify(report.body),
			"the fixture must actually differ in key order, or this proves nothing",
		)
		assert.equal(hashBody(reordered), report.bodyHash)
	})
})

describe("accounting identities", () => {
	const report = buildReport(corpus(), decisions, options)
	const t = report.body.totals

	test("candidates split exactly into excluded and tunable", () => {
		assert.equal(t.excluded + t.tunableSites, t.candidates)
		assert.equal(t.candidates, 13)
		assert.equal(t.excluded, 2)
		assert.equal(t.tunableSites, 11)
	})

	test("every tunable site lands in exactly one provenance bucket", () => {
		assert.equal(t.tagged + t.decisionTraced + t.decisionDangling + t.untagged, t.tunableSites)
		assert.equal(t.tagged, 5)
		assert.equal(t.decisionTraced, 2)
		assert.equal(t.decisionDangling, 1)
		assert.equal(t.untagged, 3)
	})

	test("exclusion counts sum to the excluded total, with no silent drops", () => {
		const summed = report.body.exclusions.reduce((n, r) => n + r.count, 0)
		assert.equal(summed, t.excluded)
	})

	test("anchor strengths sum to the tunable total", () => {
		const s = report.body.byAnchorStrength
		assert.equal(s.anchored + s.weak + s.unanchored, t.tunableSites)
		// two [REVIEWED] (one of them in the .py file), one [MEASURED], two resolved decisions
		assert.equal(s.anchored, 5)
		// [INHERITED]
		assert.equal(s.weak, 1)
		// [UNCALIBRATED] + 3 untagged + 1 dangling
		assert.equal(s.unanchored, 5)
	})

	test("the headline fraction is documented over tunable", () => {
		// 5 tagged + 2 decision-traced
		assert.equal(report.body.headline.documentedFraction, round4(7 / 11))
		assert.equal(report.body.headline.anchoredFraction, round4(5 / 11))
	})

	test("decision citations split into recheckable and conversational", () => {
		assert.equal(report.body.decisionCitations.recheckable, 1)
		assert.equal(report.body.decisionCitations.conversational, 1)
		assert.equal(report.body.decisionCitations.dangling.length, 1)
		assert.equal(report.body.decisionCitations.dangling[0].decisionId, "d-2026-08-03-ghost")
	})

	test("shared-doc-block attribution is counted separately", () => {
		assert.equal(report.body.tagAttribution["shared-doc-block"], 1)
		assert.equal(report.body.tagAttribution.leading, 6)
		assert.equal(report.body.tagAttribution.trailing, 0)
	})

	test("per-language fidelity is published, never pooled", () => {
		assert.equal(report.body.corpus.byLanguage.ts.fidelity, "ast")
		assert.equal(report.body.corpus.byLanguage.py.fidelity, "lexical")
		assert.equal(report.body.corpus.byLanguage.ts.files, 1)
		assert.equal(report.body.corpus.lines, 80)
	})
})

describe("the untagged backlog", () => {
	const report = buildReport(corpus(), decisions, options)

	test("includes dangling citations, since they are not real provenance", () => {
		const ids = report.body.untagged.map((e) => `${e.file}:${e.line}`)
		assert.ok(ids.includes("src/a.ts:9"))
		assert.equal(report.body.untagged.length, 4)
	})

	test("is ordered most suspicious first", () => {
		const scores = report.body.untagged.map((e) => e.suspicion)
		assert.deepEqual(scores, [...scores].sort((a, b) => b - a))
		assert.equal(report.body.untagged[0].line, 6, "the comparison operand ranks first")
	})

	test("worstOffenders is the head of the same list", () => {
		assert.deepEqual(report.body.worstOffenders, report.body.untagged.slice(0, 10))
	})

	test("per-file rows agree with the totals", () => {
		const summed = report.body.byFile.reduce((n, r) => n + r.untagged, 0)
		assert.equal(summed, report.body.totals.untagged + report.body.totals.decisionDangling)
	})
})

describe("markdown rendering", () => {
	const report = buildReport(corpus(), decisions, options)
	const md = renderMarkdown(report)

	test("states the headline numbers and the measurement time", () => {
		assert.ok(md.includes("Tunable sites: 11"))
		assert.ok(md.includes("2026-08-03T00:00:00.000Z"))
		assert.ok(md.includes(report.bodyHash.slice(0, 16)))
	})

	test("declares itself generated", () => {
		assert.ok(md.includes("Generated file. Do not edit by hand"))
	})

	test("lists every exclusion rule with its rationale", () => {
		for (const rule of report.body.exclusions) assert.ok(md.includes(rule.id), rule.id)
	})

	test("publishes the lower-bound caveat and the limitations", () => {
		assert.ok(md.includes("lower bound"))
		for (const limitation of report.body.limitations) {
			assert.ok(md.includes(limitation.slice(0, 40)))
		}
	})

	test("names the perturbation-stability ratio as NOT measured here", () => {
		assert.ok(md.includes("perturbation-stability"))
	})
})

function round4(n: number): number {
	return Math.round(n * 10000) / 10000
}
