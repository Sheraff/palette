/**
 * Pins the parameter-honesty policy: every exclusion rule by example, the protection rule, and the
 * provenance reader.
 *
 * These tests are the contract a future reader argues with. If an exclusion rule changes, a named
 * test here changes with it and the diff says which judgment moved — which is the point of keeping
 * all policy in one file.
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"
import {
	EXCLUSION_RULES,
	excludedBy,
	provenanceOf,
	suspicionOf,
	buildDecisionIndex,
	type DecisionIndex,
} from "../src/honesty/classify.ts"
import type { Candidate, CommentBlock, ContextFlag } from "../src/honesty/types.ts"

function candidate(overrides: Partial<Candidate> = {}): Candidate {
	return {
		file: "src/example.ts",
		line: 10,
		column: 5,
		value: 0.7,
		text: "0.7",
		language: "ts",
		enclosing: { kind: "const", name: "THING", functionName: null },
		snippet: "const THING = 0.7",
		comments: [],
		flags: [],
		...overrides,
	}
}

function withFlags(flags: ContextFlag[], overrides: Partial<Candidate> = {}): Candidate {
	return candidate({ flags, ...overrides })
}

const noDecisions: DecisionIndex = new Map()

describe("exclusion rules — structure", () => {
	test("every rule has a unique id and a non-trivial rationale", () => {
		const ids = EXCLUSION_RULES.map((r) => r.id)
		assert.equal(new Set(ids).size, ids.length, "rule ids must be unique")
		for (const rule of EXCLUSION_RULES) {
			assert.ok(rule.rationale.length > 40, `${rule.id} needs a real rationale`)
			assert.equal(typeof rule.structural, "boolean")
		}
	})

	test("a plain tuned float in a plain place is NOT excluded", () => {
		assert.equal(excludedBy(candidate()), null)
	})
})

describe("exclusion rules — each rule fires on its own example", () => {
	const cases: { rule: string; candidate: Candidate }[] = [
		{
			rule: "fixture-module",
			candidate: withFlags(["fixture-module"], { file: "src/contract/fixtures.ts" }),
		},
		{
			rule: "colorimetric-spec",
			candidate: withFlags(["colorimetric-spec", "float"], { value: 0.04045, text: "0.04045" }),
		},
		{
			rule: "version-literal",
			candidate: withFlags(["version-literal"], {
				value: 1,
				enclosing: { kind: "property", name: "schemaVersion", functionName: null },
			}),
		},
		{ rule: "exit-code", candidate: withFlags(["exit-code", "call-argument"], { value: 1 }) },
		{
			rule: "http-status",
			candidate: withFlags(["http-status", "call-argument"], { value: 404 }),
		},
		{
			// The review server funnels every response through respond(res, status, ...), which the
			// scanner cannot recognise as a status-code position. Handled in policy, where it is
			// pinned rather than hidden in a scanner heuristic.
			rule: "http-status",
			candidate: withFlags(["call-argument"], {
				value: 200,
				enclosing: { kind: "call-argument", name: "respondJson", functionName: "handler" },
			}),
		},
		{
			rule: "emptiness-comparison",
			candidate: withFlags(["comparison-operand"], {
				value: 0,
				snippet: "if (rows.length > 0) {",
			}),
		},
		{
			rule: "not-found-sentinel",
			candidate: withFlags(["comparison-operand", "negative"], {
				value: -1,
				snippet: "if (names.indexOf(x) === -1) return",
			}),
		},
		{
			rule: "index-access",
			candidate: withFlags(["index-access"], { value: 2, snippet: "process.argv[2]" }),
		},
		{
			rule: "loop-header",
			candidate: withFlags(["loop-header"], { value: 0, snippet: "for (let i = 0; ...)" }),
		},
		{
			rule: "accumulator-init",
			candidate: withFlags(["accumulator-init"], {
				value: 0,
				enclosing: { kind: "let", name: "total", functionName: "sum" },
			}),
		},
		{
			rule: "counter-increment",
			candidate: candidate({ value: 1, text: "1", snippet: "tagged += 1", flags: [] }),
		},
		{
			rule: "unit-conversion",
			candidate: withFlags(["unit-conversion"], { value: 1000, snippet: "elapsed / 1000" }),
		},
		{
			rule: "unit-clamp",
			candidate: withFlags(["unit-clamp", "call-argument"], { value: 1 }),
		},
		{
			rule: "display-format",
			candidate: withFlags(["display-format", "call-argument"], { value: 2 }),
		},
		{
			rule: "display-interpolation",
			candidate: withFlags(["display-interpolation"], { value: 100 }),
		},
		{
			rule: "slice-origin",
			candidate: withFlags(["call-argument"], {
				value: 0,
				enclosing: { kind: "call-argument", name: "slice", functionName: "shortHash" },
			}),
		},
	]

	for (const c of cases) {
		test(`${c.rule} excludes its example`, () => {
			assert.equal(excludedBy(c.candidate), c.rule)
		})
	}

	test("every declared rule is covered by an example above", () => {
		const covered = new Set(cases.map((c) => c.rule))
		const missing = EXCLUSION_RULES.map((r) => r.id).filter((id) => !covered.has(id))
		assert.deepEqual(missing, [], "each exclusion rule needs a pinned example")
	})
})

describe("protection — threshold shape and policy-knob naming beat context", () => {
	test("a SCREAMING_CASE constant is not excluded by a context rule", () => {
		const c = withFlags(["screaming-case-name", "named-constant", "display-interpolation"], {
			value: 100,
		})
		assert.equal(excludedBy(c), null)
	})

	test("a comparison operand is not excluded by unit-conversion", () => {
		const c = withFlags(["comparison-operand", "unit-conversion"], {
			value: 1000,
			snippet: "if (elapsedMs > 1000) warn()",
		})
		assert.equal(excludedBy(c), null)
	})

	test("but a structural rule ignores protection", () => {
		const c = withFlags(["fixture-module", "screaming-case-name", "comparison-operand"], {
			file: "src/warehouse/fixtures.ts",
		})
		assert.equal(excludedBy(c), "fixture-module")
	})

	test("emptiness checks are excluded despite being comparisons", () => {
		const c = withFlags(["comparison-operand"], { value: 0, snippet: "if (len(rows) == 0):" })
		assert.equal(excludedBy(c), "emptiness-comparison")
	})

	test("a real magnitude threshold at zero survives", () => {
		const c = withFlags(["comparison-operand"], { value: 0, snippet: "if (score > 0) keep()" })
		assert.equal(excludedBy(c), null)
	})
})

describe("exclusion rules — deliberately narrow", () => {
	test("accumulator-init spares a mutable knob that is not 0 or 1", () => {
		const c = withFlags(["accumulator-init", "float"], {
			value: 0.7,
			enclosing: { kind: "let", name: "threshold", functionName: null },
		})
		assert.equal(excludedBy(c), null)
	})

	test("slice-origin spares the length argument of the same call", () => {
		const c = withFlags(["call-argument"], {
			value: 8,
			enclosing: { kind: "call-argument", name: "slice", functionName: "shortHash" },
		})
		assert.equal(excludedBy(c), null)
	})

	test("counter-increment spares a real value added to a running total", () => {
		const c = candidate({ value: 0.25, text: "0.25", snippet: "weight += 0.25" })
		assert.equal(excludedBy(c), null)
	})

	test("index-access spares a non-integer subscript", () => {
		const c = withFlags(["index-access", "float"], { value: 1.5 })
		assert.equal(excludedBy(c), null)
	})

	test("unit-conversion spares a multiplier that is not a unit constant", () => {
		const c = withFlags(["unit-conversion"], { value: 137, snippet: "x * 137" })
		assert.equal(excludedBy(c), null)
	})
})

describe("provenance", () => {
	const decisions = buildDecisionIndex({
		decisions: [
			{ id: "d-2026-08-03-real-thing", fundedBy: ["w-1", "w-2"] },
			{ id: "d-2026-08-03-verbal-thing", fundedBy: [] },
			{ id: "d-2026-08-03-dotted-v2.1-thing", fundedBy: [] },
		],
	})

	function comments(...blocks: [CommentBlock["source"], string][]): CommentBlock[] {
		return blocks.map(([source, text]) => ({ source, text }))
	}

	test("reads a tag from the site's own doc block", () => {
		const p = provenanceOf(
			candidate({ comments: comments(["leading", "/** `[MEASURED]` — from the pilot. */"]) }),
			noDecisions,
		)
		assert.equal(p.kind, "tagged")
		assert.equal(p.tag, "MEASURED")
		assert.equal(p.source, "leading")
	})

	test("reads a tag from a trailing comment", () => {
		const p = provenanceOf(
			candidate({ comments: comments(["trailing", "// [REVIEWED] Flo said so"]) }),
			noDecisions,
		)
		assert.equal(p.tag, "REVIEWED")
		assert.equal(p.source, "trailing")
	})

	test("records shared-doc-block attribution distinctly", () => {
		const p = provenanceOf(
			candidate({ comments: comments(["shared-doc-block", "/** `[REVIEWED]` — pair. */"]) }),
			noDecisions,
		)
		assert.equal(p.kind, "tagged")
		assert.equal(p.source, "shared-doc-block")
	})

	test("nearest comment wins", () => {
		const p = provenanceOf(
			candidate({
				comments: comments(
					["trailing", "// [UNCALIBRATED] guess"],
					["leading", "/** [REVIEWED] */"],
				),
			}),
			noDecisions,
		)
		assert.equal(p.tag, "UNCALIBRATED")
		assert.equal(p.source, "trailing")
	})

	test("the n=1 tag survives regex escaping", () => {
		const p = provenanceOf(
			candidate({ comments: comments(["leading", "/** `[n=1]` — one artwork. */"]) }),
			noDecisions,
		)
		assert.equal(p.tag, "n=1")
	})

	test("no comment means untagged — the dishonesty measure", () => {
		const p = provenanceOf(candidate(), noDecisions)
		assert.equal(p.kind, "untagged")
		assert.equal(p.tag, null)
		assert.equal(p.decisionId, null)
	})

	test("a comment without a tag is still untagged", () => {
		const p = provenanceOf(
			candidate({ comments: comments(["leading", "// the cutoff we use"]) }),
			noDecisions,
		)
		assert.equal(p.kind, "untagged")
	})

	test("a resolved decision id with recheckable funding", () => {
		const p = provenanceOf(
			candidate({ comments: comments(["leading", "// see d-2026-08-03-real-thing"]) }),
			decisions,
		)
		assert.equal(p.kind, "decision-traced")
		assert.equal(p.decisionId, "d-2026-08-03-real-thing")
		assert.equal(p.decisionFunding, "recheckable")
	})

	test("a resolved decision id with an empty fundedBy is conversational, not dangling", () => {
		const p = provenanceOf(
			candidate({ comments: comments(["leading", "// see d-2026-08-03-verbal-thing"]) }),
			decisions,
		)
		assert.equal(p.kind, "decision-traced")
		assert.equal(p.decisionFunding, "conversational")
	})

	test("decision ids containing dots resolve", () => {
		const p = provenanceOf(
			candidate({ comments: comments(["leading", "// per d-2026-08-03-dotted-v2.1-thing."]) }),
			decisions,
		)
		assert.equal(p.kind, "decision-traced")
		assert.equal(p.decisionId, "d-2026-08-03-dotted-v2.1-thing")
	})

	test("an unresolvable decision id is dangling, not traced", () => {
		const p = provenanceOf(
			candidate({ comments: comments(["leading", "// see d-2026-08-03-no-such-record"]) }),
			decisions,
		)
		assert.equal(p.kind, "decision-dangling")
		assert.equal(p.decisionFunding, null)
	})

	test("a tag beats a decision citation but keeps it attached", () => {
		const p = provenanceOf(
			candidate({
				comments: comments(["leading", "/** [MEASURED] — d-2026-08-03-real-thing */"]),
			}),
			decisions,
		)
		assert.equal(p.kind, "tagged")
		assert.equal(p.tag, "MEASURED")
		assert.equal(p.decisionId, "d-2026-08-03-real-thing")
	})
})

describe("decision index", () => {
	test("handles the real file's container shape and a bare array", () => {
		const wrapped = buildDecisionIndex({ decisions: [{ id: "d-x", fundedBy: [1] }] })
		assert.equal(wrapped.get("d-x"), "recheckable")
		const bare = buildDecisionIndex([{ id: "d-y", fundedBy: [] }])
		assert.equal(bare.get("d-y"), "conversational")
	})

	test("a missing or malformed file yields an empty index rather than throwing", () => {
		assert.equal(buildDecisionIndex(null).size, 0)
		assert.equal(buildDecisionIndex({ nope: true }).size, 0)
	})
})

describe("suspicion ranking", () => {
	test("an oddly specific float threshold outranks a bare integer", () => {
		const tuned = withFlags(["comparison-operand", "float"], { value: 0.37 })
		const plain = candidate({ value: 3, text: "3", flags: [] })
		assert.ok(suspicionOf(tuned) > suspicionOf(plain))
	})

	test("a round float scores below an odd one", () => {
		const round = withFlags(["float"], { value: 0.5 })
		const odd = withFlags(["float"], { value: 0.37 })
		assert.ok(suspicionOf(odd) > suspicionOf(round))
	})

	test("screaming-case and named-constant do not double count", () => {
		const both = withFlags(["screaming-case-name", "named-constant"], { value: 3, text: "3" })
		assert.equal(suspicionOf(both), 3)
	})

	test("an epsilon scores for being exponent-shaped", () => {
		const eps = withFlags(["exponential", "float"], {
			value: 1e-6,
			text: "1e-6",
			snippet: "const EPS = 1e-6",
		})
		assert.ok(suspicionOf(eps) >= 5)
	})

	test("a float-precision tolerance is down-ranked below a policy threshold", () => {
		// Still counted as a tunable site — only its position in the worklist changes.
		const tolerance = withFlags(["exponential", "float", "comparison-operand"], {
			value: 1e-9,
			text: "1e-9",
			snippet: "if (Math.abs(remainder) > 1e-9) return remainder",
		})
		const policy = withFlags(["float", "comparison-operand"], {
			value: 0.62,
			snippet: "if (score > 0.62) keep()",
		})
		assert.equal(excludedBy(tolerance), null, "a tolerance is still a tunable site")
		assert.ok(
			suspicionOf(policy) > suspicionOf(tolerance),
			"policy thresholds must outrank numerical slop in the backlog",
		)
	})

	test("a small magnitude outside a tolerance idiom keeps its score", () => {
		const small = withFlags(["float", "comparison-operand"], {
			value: 1e-5,
			text: "1e-5",
			snippet: "if (areaFraction > 1e-5) publish()",
		})
		assert.ok(suspicionOf(small) >= 6)
	})

	test("suspicion never goes negative", () => {
		const c = withFlags(["float"], { value: 1e-12, snippet: "abs(x - y) < 1e-12" })
		assert.ok(suspicionOf(c) >= 0)
	})
})
