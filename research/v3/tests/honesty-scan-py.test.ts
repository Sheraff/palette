/**
 * Pins the Python scanner of the parameter-honesty instrument.
 *
 * The lexer is the only part of the instrument that can silently corrupt the metric: a number that
 * lives in a comment, a string, or an f-string's display text is not a tunable, and no downstream
 * policy can recover from counting it. So the fixtures here assert EXACT counts, not "at least".
 *
 * The one test that touches real repository source (`oracle/embeddings/config.py`) asserts
 * invariants only. Golden-comparing another workstream's file would make this test fail whenever
 * that file legitimately changes, which is a test that punishes the wrong person.
 */

import assert from "node:assert/strict"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { PROVENANCE_TAGS } from "../src/honesty/types.ts"
import type { Candidate } from "../src/honesty/types.ts"
import { scanPythonFile, scanPythonSource } from "../src/honesty/scan-py.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const V3_ROOT = join(HERE, "..")
const FIXTURE_DIR = join(HERE, "honesty-fixtures", "py")

function scanFixture(name: string) {
	return scanPythonFile(join(FIXTURE_DIR, name), `tests/honesty-fixtures/py/${name}`)
}

const values = (candidates: Candidate[]): number[] => candidates.map((c) => c.value)
const onLine = (candidates: Candidate[], line: number): Candidate[] =>
	candidates.filter((c) => c.line === line)
const one = (candidates: Candidate[], line: number): Candidate => {
	const hits = onLine(candidates, line)
	assert.equal(hits.length, 1, `expected exactly one literal on line ${line}`)
	return hits[0]!
}

// ---------------------------------------------------------------------------
// Comments and strings are not code
// ---------------------------------------------------------------------------

test("comments and every string form are immune to the scanner", () => {
	const scanned = scanFixture("strings.fixture.py")
	assert.equal(scanned.language, "py")
	assert.equal(scanned.fidelity, "lexical")

	// Only `X = 1` and `AFTER = 2` are code. Everything else in the fixture is a number sitting in
	// a comment, a single/double/triple-quoted string, a raw string, a bytes string, or an escape.
	assert.deepEqual(values(scanned.candidates), [1, 2])
	assert.deepEqual(
		scanned.candidates.map((c) => c.line),
		[2, 17],
	)
})

test("a `#` inside a string does not start a comment", () => {
	// If `#` inside `"not a # comment 888"` were treated as a comment start, the rest of the file
	// would still lex — the failure would be silent, so it is asserted directly.
	const scanned = scanPythonSource('A = "text # 5"\nB = 6\n', "t.py")
	assert.deepEqual(values(scanned.candidates), [6])
})

test("a raw string's backslash still prevents the quote from closing it", () => {
	// Python's real rule: in `r"\""` the backslash is kept in the value AND stops the `"` from
	// ending the string. Getting this wrong would leave the lexer inside/outside a string for the
	// rest of the line.
	const scanned = scanPythonSource('A = r"\\"7\\"" \nB = 8\n', "t.py")
	assert.deepEqual(values(scanned.candidates), [8])
})

test("triple-quoted strings swallow newlines without splitting the statement", () => {
	const scanned = scanFixture("strings.fixture.py")
	assert.equal(onLine(scanned.candidates, 6).length, 0)
})

// ---------------------------------------------------------------------------
// f-strings
// ---------------------------------------------------------------------------

test("f-string substitutions are code, their literal text and format specs are not", () => {
	const scanned = scanFixture("fstrings.fixture.py")
	assert.deepEqual(values(scanned.candidates), [7, 5, 0, 8, 3.14159, -11])
	// Line 3 is `f"literal 1 and 2 and 3 text"` — display text only.
	assert.equal(onLine(scanned.candidates, 3).length, 0)
	// Line 5 is `f"{count:.2f}"` — the `2` is a format spec, not a literal.
	assert.equal(onLine(scanned.candidates, 5).length, 0)
	// Line 9 is `f"{count!r} and 9"` — conversion then display text.
	assert.equal(onLine(scanned.candidates, 9).length, 0)
})

test("a nested replacement inside a format spec is still code", () => {
	// `f"{count:{5}.2f}"` — the 5 is a real expression, the trailing `.2f` is not.
	const scanned = scanFixture("fstrings.fixture.py")
	const nested = one(scanned.candidates, 6)
	assert.equal(nested.value, 5)
	assert.ok(nested.flags.includes("display-interpolation"))
})

test("interpolated literals carry display-interpolation and keep their own syntax flags", () => {
	const scanned = scanFixture("fstrings.fixture.py")
	const subscript = one(scanned.candidates, 7) // f"value={count[0]}"
	assert.equal(subscript.value, 0)
	assert.ok(subscript.flags.includes("index-access"))
	assert.ok(subscript.flags.includes("display-interpolation"))

	const dictValue = one(scanned.candidates, 8) // f"{ {'k': 8}['k'] }"
	assert.equal(dictValue.value, 8)
	assert.equal(dictValue.enclosing.kind, "property")
	assert.equal(dictValue.enclosing.name, "k")

	const printed = one(scanned.candidates, 10)
	assert.ok(printed.flags.includes("display-interpolation"))
	assert.ok(printed.flags.includes("float"))
})

test("a unary minus inside an f-string substitution folds", () => {
	const scanned = scanFixture("fstrings.fixture.py")
	const negated = one(scanned.candidates, 11)
	assert.equal(negated.value, -11)
	assert.equal(negated.text, "11")
	assert.ok(negated.flags.includes("negative"))
	assert.equal(negated.enclosing.kind, "return")
})

// ---------------------------------------------------------------------------
// Numeric literal forms
// ---------------------------------------------------------------------------

test("every Python numeric form is read at its real value", () => {
	const scanned = scanFixture("numbers.fixture.py")
	assert.deepEqual(values(scanned.candidates), [
		42, 0.5, 1, 1.5, 1e-6, 1e6, 31, 15, 10, 1000, 1, 20, -1, 1, -2, 3, -4, 0,
	])
	assert.ok(scanned.candidates.every((c) => Number.isFinite(c.value)))
	assert.equal(one(scanned.candidates, 7).text, "0x1f")
	assert.equal(one(scanned.candidates, 10).text, "1_000")
})

test("digits inside identifiers are never literals, and imaginary literals are dropped", () => {
	const scanned = scanFixture("numbers.fixture.py")
	// Line 12 is `IMAGINARY = 3j`; line 13 is `ident_x2 = sha256_of(v3_thing)`.
	assert.equal(onLine(scanned.candidates, 12).length, 0)
	assert.equal(onLine(scanned.candidates, 13).length, 0)
})

test("float and exponential flags follow value and spelling respectively", () => {
	const scanned = scanFixture("numbers.fixture.py")
	assert.ok(one(scanned.candidates, 4).flags.includes("float")) // 1.5
	assert.ok(!one(scanned.candidates, 3).flags.includes("float")) // 1. is integer-valued
	assert.ok(one(scanned.candidates, 5).flags.includes("exponential")) // 1e-6
	assert.ok(one(scanned.candidates, 6).flags.includes("exponential")) // 1E6
	assert.ok(!one(scanned.candidates, 7).flags.includes("exponential")) // 0x1f: `f`, not an exponent
})

test("unary minus folds only when the minus is genuinely unary", () => {
	const scanned = scanFixture("numbers.fixture.py")

	const assigned = one(scanned.candidates, 14) // NEG = -1
	assert.equal(assigned.value, -1)
	assert.equal(assigned.text, "1")
	assert.ok(assigned.flags.includes("negative"))

	const subtracted = one(scanned.candidates, 15) // BINARY_SUB = ident_x2 - 1
	assert.equal(subtracted.value, 1)
	assert.ok(!subtracted.flags.includes("negative"))

	const inCall = onLine(scanned.candidates, 16) // CALL_NEG = pick(-2, 3)
	assert.deepEqual(values(inCall), [-2, 3])
	assert.ok(inCall[0]!.flags.includes("negative"))
	assert.ok(!inCall[1]!.flags.includes("negative"))

	const inList = one(scanned.candidates, 17) // LIST_NEG = [-4]
	assert.equal(inList.value, -4)
	assert.ok(inList.flags.includes("negative"))
})

test("a folded site reports the column of its digits so text matches the source there", () => {
	const scanned = scanPythonSource("N = -7\n", "t.py")
	const site = scanned.candidates[0]!
	assert.equal(site.value, -7)
	assert.equal(site.text, "7")
	assert.equal(site.line, 1)
	assert.equal(site.column, 6)
	assert.equal("N = -7".slice(site.column - 1, site.column - 1 + site.text.length), "7")
})

// ---------------------------------------------------------------------------
// Bracket context
// ---------------------------------------------------------------------------

test("subscripts and list displays are told apart", () => {
	const scanned = scanFixture("brackets.fixture.py")
	assert.equal(scanned.candidates.length, 11)

	assert.ok(one(scanned.candidates, 2).flags.includes("index-access")) // rows[0]

	const list = onLine(scanned.candidates, 3) // b = [11, 12]
	assert.deepEqual(values(list), [11, 12])
	assert.ok(list.every((c) => !c.flags.includes("index-access")))
	assert.ok(list.every((c) => !c.flags.includes("in-numeric-sequence")))

	const tuple = onLine(scanned.candidates, 4) // c = (13, 14, 15)
	assert.ok(tuple.every((c) => c.flags.includes("in-numeric-sequence")))

	const chained = onLine(scanned.candidates, 5) // d = rows[1][2]
	assert.ok(chained.every((c) => c.flags.includes("index-access")))
})

test("a keyword before `[` opens a list, not a subscript", () => {
	// `for i in [16, 17, 18]:` — `in` is a keyword, so this is a list display in a loop header.
	const scanned = scanFixture("brackets.fixture.py")
	const loop = onLine(scanned.candidates, 6)
	assert.deepEqual(values(loop), [16, 17, 18])
	assert.ok(loop.every((c) => c.flags.includes("loop-header")))
	assert.ok(loop.every((c) => c.flags.includes("in-numeric-sequence")))
	assert.ok(loop.every((c) => !c.flags.includes("index-access")))
})

// ---------------------------------------------------------------------------
// Enclosing slot, scope tracking
// ---------------------------------------------------------------------------

test("functionName tracks the indent stack across nested defs and back out", () => {
	const scanned = scanFixture("context.fixture.py")
	assert.equal(scanned.candidates.length, 19)

	assert.equal(one(scanned.candidates, 3).enclosing.functionName, null) // module level
	assert.equal(one(scanned.candidates, 9).enclosing.functionName, "outer")
	assert.equal(one(scanned.candidates, 12).enclosing.functionName, "outer") // sys.exit(2)
	assert.equal(one(scanned.candidates, 14).enclosing.functionName, "inner") // def inner(depth=4)
	assert.equal(one(scanned.candidates, 16).enclosing.functionName, "inner")
	// Dedent back out of `inner` — the nested scope must be popped, not inherited.
	assert.equal(one(scanned.candidates, 18).enclosing.functionName, "outer")
	assert.equal(one(scanned.candidates, 24).enclosing.functionName, null) // class body, no def
	assert.equal(one(scanned.candidates, 27).enclosing.functionName, "method")
})

test("named constants, accumulators and screaming case are distinguished", () => {
	const scanned = scanFixture("context.fixture.py")

	const moduleConst = one(scanned.candidates, 3) // MAX_ITEMS = 10
	assert.equal(moduleConst.enclosing.kind, "const")
	assert.equal(moduleConst.enclosing.name, "MAX_ITEMS")
	assert.ok(moduleConst.flags.includes("named-constant"))
	assert.ok(moduleConst.flags.includes("screaming-case-name"))
	assert.ok(!moduleConst.flags.includes("accumulator-init"))

	const accumulator = one(scanned.candidates, 9) // total = 0, indented
	assert.equal(accumulator.enclosing.kind, "let")
	assert.ok(accumulator.flags.includes("accumulator-init"))

	const derived = one(scanned.candidates, 10) // scaled = total / 1000
	assert.ok(!derived.flags.includes("accumulator-init"))
	assert.ok(derived.flags.includes("unit-conversion"))
})

test("parameter defaults are found in def signatures and named by parameter", () => {
	const scanned = scanFixture("context.fixture.py")
	const params = onLine(scanned.candidates, 6) // def outer(limit=32, ratio: float = 0.75)
	assert.deepEqual(values(params), [32, 0.75])
	assert.ok(params.every((c) => c.flags.includes("parameter-default")))
	assert.equal(params[0]!.enclosing.name, "limit")
	assert.equal(params[1]!.enclosing.name, "ratio")
	// A def's parameter list is not a call and not a numeric sequence.
	assert.ok(params.every((c) => !c.flags.includes("call-argument")))
	assert.ok(params.every((c) => !c.flags.includes("in-numeric-sequence")))
})

test("call arguments name their callee, and sys.exit is an exit code", () => {
	const scanned = scanFixture("context.fixture.py")
	const exitCode = one(scanned.candidates, 12)
	assert.equal(exitCode.enclosing.kind, "call-argument")
	assert.equal(exitCode.enclosing.name, "sys.exit")
	assert.ok(exitCode.flags.includes("exit-code"))
	assert.ok(exitCode.flags.includes("call-argument"))

	const kwarg = one(scanned.candidates, 18) // return inner(depth=7)
	assert.equal(kwarg.enclosing.name, "inner")
	assert.ok(!kwarg.flags.includes("parameter-default")) // keyword is `depth`, not `default`
})

test("comparison operands and colour weight vectors are flagged", () => {
	const scanned = scanFixture("context.fixture.py")
	assert.ok(one(scanned.candidates, 11).flags.includes("comparison-operand")) // if first > 5
	const weights = onLine(scanned.candidates, 15) // (0.2126, 0.7152, 0.0722)
	assert.deepEqual(values(weights), [0.2126, 0.7152, 0.0722])
	assert.ok(weights.every((c) => c.flags.includes("in-numeric-sequence")))
	assert.ok(weights.every((c) => c.flags.includes("float")))
})

test("a CLI flag default counts as a parameter default, but `default=` elsewhere does not", () => {
	const scanned = scanPythonSource('p.add_argument("--n", default=8)\n', "t.py")
	const site = scanned.candidates[0]!
	assert.equal(site.value, 8)
	assert.ok(site.flags.includes("parameter-default"))
	assert.equal(site.enclosing.name, "p.add_argument")

	// `max(xs, default=0)` spells the same keyword and means "fallback when empty".
	const fallback = scanPythonSource("n = max(xs, default=0)\n", "t.py")
	assert.ok(!fallback.candidates[0]!.flags.includes("parameter-default"))
})

test("line-scoped heuristics do not leak across a multi-line statement", () => {
	// `round(…, 4)` inside a dict whose OTHER entries print is not display formatting, and a slice
	// bound near a key called `status` is not an HTTP status. Both flags drive exclusions, so both
	// are scoped to the literal's own physical line.
	const scanned = scanPythonSource(
		[
			"payload = {",
			'    "banner": f"{name} ready",',
			'    "rate": round(hits / total, 4),',
			'    "status": "ok",',
			'    "error": str(exc)[:500],',
			"}",
		].join("\n") + "\n",
		"t.py",
	)
	const byValue = new Map(scanned.candidates.map((c) => [c.value, c] as const))
	assert.ok(!byValue.get(4)!.flags.includes("display-format"))
	assert.ok(!byValue.get(500)!.flags.includes("http-status"))

	// The same two flags do fire when the evidence is on the literal's own line.
	const direct = scanPythonSource(
		["print(round(x, 3))", "self.send_response(404)"].join("\n") + "\n",
		"t.py",
	)
	assert.ok(direct.candidates[0]!.flags.includes("display-format"))
	assert.ok(direct.candidates[1]!.flags.includes("http-status"))
})

test("value-keyed flags fire on the values they name", () => {
	const scanned = scanPythonSource(
		[
			"LINEAR_THRESHOLD = 0.04045",
			"def f(x, ms):",
			"    seconds = ms / 1000",
			"    bounded = max(0, min(1, x))",
			"    return seconds, bounded",
		].join("\n") + "\n",
		"t.py",
	)
	const byValue = new Map(scanned.candidates.map((c) => [c.value, c] as const))
	assert.ok(byValue.get(0.04045)!.flags.includes("colorimetric-spec"))
	assert.ok(byValue.get(1000)!.flags.includes("unit-conversion"))
	assert.ok(byValue.get(0)!.flags.includes("unit-clamp"))
	assert.ok(byValue.get(1)!.flags.includes("unit-clamp"))
})

test("line continuations and implicit bracket continuation keep one logical statement", () => {
	const scanned = scanPythonSource(
		["TOTAL = 1 + \\", "    2", "PAIR = (", "    3,", "    4,", ")"].join("\n") + "\n",
		"t.py",
	)
	assert.deepEqual(values(scanned.candidates), [1, 2, 3, 4])
	// Both halves of the continued statement belong to the same assignment target.
	assert.equal(scanned.candidates[0]!.enclosing.name, "TOTAL")
	assert.equal(scanned.candidates[1]!.enclosing.name, "TOTAL")
	assert.equal(scanned.candidates[1]!.line, 2)
})

// ---------------------------------------------------------------------------
// Comment attachment
// ---------------------------------------------------------------------------

test("trailing, leading and shared-doc-block comments are attributed by source", () => {
	const scanned = scanFixture("comments.fixture.py")
	assert.equal(scanned.candidates.length, 10)

	const alpha = one(scanned.candidates, 5)
	assert.deepEqual(
		alpha.comments.map((c) => c.source),
		["leading", "leading"],
	)
	assert.match(alpha.comments[0]!.text, /\[MEASURED\]/)

	// BETA and GAMMA carry no comment of their own; they inherit ALPHA's block, and the inference
	// must be visible as `shared-doc-block` so the report can discount it.
	for (const line of [6, 7]) {
		const inherited = one(scanned.candidates, line)
		assert.deepEqual(
			inherited.comments.map((c) => c.source),
			["shared-doc-block", "shared-doc-block"],
		)
		assert.match(inherited.comments[0]!.text, /\[MEASURED\]/)
	}

	const delta = one(scanned.candidates, 9)
	assert.equal(delta.comments.length, 1)
	assert.equal(delta.comments[0]!.source, "trailing")
	assert.match(delta.comments[0]!.text, /\[REVIEWED\]/)

	const epsilon = one(scanned.candidates, 12)
	assert.deepEqual(
		epsilon.comments.map((c) => c.source),
		["leading"],
	)
	assert.match(epsilon.comments[0]!.text, /\[HELD\]/)
})

test("a blank line breaks both the leading block and the shared-block walk", () => {
	const scanned = scanFixture("comments.fixture.py")
	const zeta = one(scanned.candidates, 14) // ZETA = 6, blank line above and below
	assert.deepEqual(zeta.comments, [])
})

test("an enclosing docstring is offered as a leading comment", () => {
	const scanned = scanFixture("comments.fixture.py")

	const paramDefault = one(scanned.candidates, 17) // def documented(scale=7)
	assert.equal(paramDefault.comments.length, 1)
	assert.equal(paramDefault.comments[0]!.source, "leading")
	assert.match(paramDefault.comments[0]!.text, /\[INHERITED\]/)

	const body = one(scanned.candidates, 19) // inner_value = 8
	assert.match(body.comments[0]!.text, /\[INHERITED\]/)

	const classConst = one(scanFixture("context.fixture.py").candidates, 24) // LIMIT = 99
	assert.match(classConst.comments[0]!.text, /Holder docstring/)
})

test("a comment above a value inside a multi-line dict beats the block above the statement", () => {
	const scanned = scanFixture("comments.fixture.py")
	const near = one(scanned.candidates, 25)
	assert.equal(near.enclosing.name, "near")
	assert.equal(near.comments[0]!.source, "leading")
	assert.match(near.comments[0]!.text, /\[n=1\]/)
	// Its sibling one line down inherits nothing: the block above `near` does not describe it.
	assert.deepEqual(one(scanned.candidates, 26).comments, [])
})

// ---------------------------------------------------------------------------
// Shape invariants and one real repository file
// ---------------------------------------------------------------------------

test("every candidate is well-formed", () => {
	for (const name of [
		"numbers.fixture.py",
		"strings.fixture.py",
		"fstrings.fixture.py",
		"context.fixture.py",
		"brackets.fixture.py",
		"comments.fixture.py",
	]) {
		const scanned = scanFixture(name)
		assert.ok(scanned.lines > 0, name)
		for (const c of scanned.candidates) {
			assert.equal(c.language, "py", name)
			assert.equal(c.file, `tests/honesty-fixtures/py/${name}`)
			assert.ok(Number.isFinite(c.value), `${name}:${c.line} value must be finite`)
			assert.ok(c.line >= 1 && c.line <= scanned.lines, `${name}:${c.line} line in range`)
			assert.ok(c.column >= 1, `${name}:${c.line} column is 1-based`)
			assert.ok(c.snippet.length <= 200, `${name}:${c.line} snippet capped`)
			assert.equal(c.snippet, c.snippet.trim(), `${name}:${c.line} snippet trimmed`)
			assert.equal(new Set(c.flags).size, c.flags.length, `${name}:${c.line} flags unique`)
		}
	}
})

test("a fixture module is flagged by filename", () => {
	const scanned = scanPythonSource("X = 1\n", "tests/fixtures/conftest.py")
	assert.ok(scanned.candidates[0]!.flags.includes("fixture-module"))
	const other = scanPythonSource("X = 1\n", "oracle/embeddings/config.py")
	assert.ok(!other.candidates[0]!.flags.includes("fixture-module"))
})

test("real repository source scans to well-formed candidates with provenance in reach", () => {
	// Invariants only. This file belongs to the oracle workstream and is expected to change; a
	// golden comparison here would fail on someone else's honest edit.
	const rel = "oracle/embeddings/config.py"
	const scanned = scanPythonFile(join(V3_ROOT, rel), rel)

	assert.equal(scanned.file, rel)
	assert.equal(scanned.fidelity, "lexical")
	assert.ok(scanned.candidates.length > 10)
	for (const c of scanned.candidates) {
		assert.ok(Number.isFinite(c.value), `${c.line}: finite value`)
		assert.ok(c.line >= 1 && c.line <= scanned.lines, `${c.line}: line in range`)
		assert.ok(c.column >= 1, `${c.line}: column is 1-based`)
		assert.ok(c.snippet.length > 0, `${c.line}: snippet present`)
	}

	// The repo's provenance convention is `# [TAG] …` above the constant. If the scanner stopped
	// reaching those comments, the honesty metric would read as near-total dishonesty, so at least
	// one candidate must see a tag.
	const tagged = scanned.candidates.filter((c) =>
		c.comments.some((block) => PROVENANCE_TAGS.some((tag) => block.text.includes(`[${tag}]`))),
	)
	assert.ok(tagged.length > 0, "no candidate reached a provenance tag")

	// EMBED_DIM = 1152 is a module-level screaming-case constant with a `[MEASURED]` block above it.
	const embedDim = scanned.candidates.find((c) => c.enclosing.name === "EMBED_DIM")
	assert.ok(embedDim !== undefined, "EMBED_DIM not found")
	assert.equal(embedDim.value, 1152)
	assert.equal(embedDim.enclosing.kind, "const")
	assert.ok(embedDim.flags.includes("screaming-case-name"))
	assert.ok(embedDim.comments.some((b) => b.text.includes("[MEASURED]")))

	// The sha256 hex strings and the docstring in this file must contribute nothing.
	assert.ok(
		!scanned.candidates.some((c) => c.snippet.includes("weights_sha256")),
		"a hex digest string leaked into the candidates",
	)
})
