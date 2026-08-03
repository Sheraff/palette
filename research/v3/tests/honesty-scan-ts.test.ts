/**
 * Tests for the TypeScript half of the parameter-honesty scanner.
 *
 * The scanner's only real failure mode is **under-reporting** — a literal it never emits can never
 * be excluded by a named rule, it just quietly shrinks the denominator. So the fixtures below pin
 * exact totals rather than spot-checking, and the immunity fixture pins the numbers that must *not*
 * appear (inside strings, comments, template text and a regex) so that "we found fewer" and "we
 * correctly ignored non-code" stay distinguishable.
 *
 * Run: NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/v3/tests/honesty-scan-ts.test.ts
 */

import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"

import { scanTypeScriptFile, scanTypeScriptSource } from "../src/honesty/scan-ts.ts"
import type { Candidate, ContextFlag, ScannedFile } from "../src/honesty/types.ts"

const V3_ROOT = path.resolve(import.meta.dirname, "..")
const FIXTURE_DIR = "tests/honesty-fixtures/ts"

function scanFixture(name: string): ScannedFile {
	const rel = `${FIXTURE_DIR}/${name}`
	return scanTypeScriptFile(path.join(V3_ROOT, rel), rel)
}

/** The single candidate on a given 1-based line. */
function atLine(scan: ScannedFile, line: number): Candidate {
	const hits = scan.candidates.filter((c) => c.line === line)
	assert.equal(hits.length, 1, `expected exactly one candidate on line ${line}, got ${hits.length}`)
	return hits[0]!
}

/** Every candidate whose enclosing slot carries this name. */
function named(scan: ScannedFile, name: string): Candidate[] {
	return scan.candidates.filter((c) => c.enclosing.name === name)
}

function only(scan: ScannedFile, name: string): Candidate {
	const hits = named(scan, name)
	assert.equal(hits.length, 1, `expected exactly one candidate named ${name}, got ${hits.length}`)
	return hits[0]!
}

function hasFlag(candidate: Candidate, flag: ContextFlag): boolean {
	return candidate.flags.includes(flag)
}

// ---------------------------------------------------------------------------------------------

test("counts fixture: every literal is emitted, BigInt is not", () => {
	const scan = scanFixture("counts.fixture.ts")

	// 16 literals, hand-counted. `10n` is a BigIntLiteral and is deliberately not one of them.
	assert.equal(scan.candidates.length, 16)
	assert.equal(scan.fidelity, "ast")
	assert.equal(scan.language, "ts")
	assert.equal(scan.file, `${FIXTURE_DIR}/counts.fixture.ts`)
	assert.equal(scan.lines, 24)
	assert.equal(
		scan.candidates.some((c) => c.text.endsWith("n")),
		false,
		"BigInt literals must not be scanned",
	)

	// 0 and 1 are emitted like anything else — filtering is `classify.ts`'s job, never the scanner's.
	assert.equal(scan.candidates.filter((c) => c.value === 0).length, 3)
	assert.ok(scan.candidates.some((c) => c.value === 1 && c.enclosing.kind === "return"))
})

test("numeric forms parse to the right values and keep their source text", () => {
	const scan = scanFixture("counts.fixture.ts")

	const hex = only(scan, "HEX")
	assert.equal(hex.value, 16)
	assert.equal(hex.text, "0x10")

	const expo = only(scan, "EXPO")
	assert.equal(expo.value, 1e-6)
	assert.equal(expo.text, "1e-6")
	assert.ok(hasFlag(expo, "exponential"))
	assert.ok(hasFlag(expo, "float"))

	const separated = only(scan, "SEPARATED")
	assert.equal(separated.value, 1_000_000)
	assert.equal(separated.text, "1_000_000")

	assert.equal(
		scan.candidates.some((c) => Number.isNaN(c.value)),
		false,
		"`Candidate.value` never holds NaN",
	)
})

test("numbers in strings, comments, template text and regexes are not literals", () => {
	const scan = scanFixture("immunity.fixture.ts")

	// Two in a `${1 + 2}` substitution, one bare. Nothing else in the file is code.
	assert.equal(scan.candidates.length, 3)
	assert.deepEqual(
		scan.candidates.map((c) => c.value).sort((a, b) => a - b),
		[1, 2, 42],
	)

	// 999/888 live in comments, 777/555/666 in strings and template text, 444 in a JSDoc, and
	// 0/9/3/4 only inside the regex `/[0-9]{3,4}/`.
	const found = new Set(scan.candidates.map((c) => c.value))
	for (const forbidden of [999, 888, 777, 666, 555, 444, 0, 9, 3, 4]) {
		assert.equal(found.has(forbidden), false, `${forbidden} is not code and must not be scanned`)
	}
})

test("unary minus folds into a single site positioned at the digits", () => {
	const scan = scanFixture("unary.fixture.ts")
	assert.equal(scan.candidates.length, 8)

	const neg = only(scan, "NEG")
	assert.equal(neg.value, -1)
	assert.equal(neg.text, "1", "text is the literal sans the folded sign")
	assert.ok(hasFlag(neg, "negative"))
	// 1-based, and pointing at the `1` rather than at the `-`: `export const NEG = -1`.
	assert.equal(neg.line, 1)
	assert.equal(neg.column, 21)

	const pos = only(scan, "POS")
	assert.equal(pos.value, 2)
	assert.equal(hasFlag(pos, "negative"), false)

	// `5 - 3` is subtraction, not a negative literal: two sites, both positive.
	const diff = named(scan, "DIFF")
	assert.deepEqual(
		diff.map((c) => c.value),
		[5, 3],
	)
	assert.equal(
		diff.some((c) => hasFlag(c, "negative")),
		false,
	)

	const nested = named(scan, "NESTED")
	assert.deepEqual(
		nested.map((c) => c.value),
		[-0.5, 1, -2],
	)
	assert.ok(hasFlag(nested[0]!, "float"))
	assert.ok(hasFlag(nested[0]!, "negative"))
	assert.ok(hasFlag(nested[0]!, "in-numeric-sequence"))

	const tiny = only(scan, "TINY")
	assert.equal(tiny.value, -1e-6)
	assert.ok(hasFlag(tiny, "exponential"))
	assert.ok(hasFlag(tiny, "negative"))
})

test("shared-doc-block: an adjacent undocumented const inherits, a separated one does not", () => {
	const scan = scanFixture("shared-doc.fixture.ts")

	// The const with its own JSDoc reports it as `leading`.
	const min = only(scan, "MIN_STOPS")
	assert.equal(min.comments.length, 1)
	assert.equal(min.comments[0]!.source, "leading")
	assert.match(min.comments[0]!.text, /\[REVIEWED\]/)

	// The const on the very next line inherits it — labelled so the report can discount it.
	const max = only(scan, "MAX_STOPS")
	assert.equal(max.comments.length, 1)
	assert.equal(max.comments[0]!.source, "shared-doc-block")
	assert.match(max.comments[0]!.text, /\[REVIEWED\]/)

	// A blank line breaks the chain: no inheritance, no comments at all.
	assert.deepEqual(only(scan, "ORPHAN").comments, [])

	// Nearest first: a trailing same-line comment outranks an inherited doc block.
	const trailing = only(scan, "TRAILING")
	assert.equal(trailing.comments.length, 2)
	assert.equal(trailing.comments[0]!.source, "trailing")
	assert.match(trailing.comments[0]!.text, /\[n=1\]/)
	assert.equal(trailing.comments[1]!.source, "shared-doc-block")
	assert.match(trailing.comments[1]!.text, /\[MEASURED\]/)
})

test("context flags are set from the literal's syntactic slot", () => {
	const scan = scanFixture("flags.fixture.ts")

	// Whole-file flag: the basename ends in `.fixture.ts`.
	assert.ok(scan.candidates.every((c) => hasFlag(c, "fixture-module")))

	assert.ok(hasFlag(only(scan, "depth"), "parameter-default")) // `depth = 3`
	assert.ok(hasFlag(only(scan, "head"), "index-access")) // `xs[2]`
	assert.ok(hasFlag(atLine(scan, 8), "accumulator-init")) // `let count = 0`

	// `for (let i = 0; i < 10; i++) count += 1` — two header literals; the body's `1` is not one.
	const loopLine = scan.candidates.filter((c) => c.line === 9)
	assert.equal(loopLine.filter((c) => hasFlag(c, "loop-header")).length, 2)
	assert.ok(hasFlag(loopLine.find((c) => c.value === 10)!, "comparison-operand"))
	assert.equal(hasFlag(loopLine.find((c) => c.value === 1)!, "loop-header"), false)

	const exitArg = only(scan, "process.exit")
	assert.ok(hasFlag(exitArg, "exit-code"))
	assert.ok(hasFlag(exitArg, "call-argument"))
	assert.equal(exitArg.enclosing.kind, "call-argument")
	assert.ok(hasFlag(only(scan, "process.exitCode"), "exit-code"))

	// `toFixed(4)`, `padStart(8)`, `toString(16)`.
	for (const line of [12, 13, 14]) {
		assert.ok(hasFlag(atLine(scan, line), "display-format"), `line ${line} formats output`)
	}
	assert.ok(hasFlag(only(scan, "seconds"), "unit-conversion")) // `/ 1000`
	assert.ok(hasFlag(only(scan, "bytes"), "unit-conversion")) // `* 1024`
	assert.ok(hasFlag(only(scan, "Math.max"), "unit-clamp"))
	assert.ok(hasFlag(only(scan, "Math.min"), "unit-clamp"))
	assert.ok(hasFlag(only(scan, "label"), "display-interpolation")) // `… ${7}`
	assert.ok(hasFlag(only(scan, "joined"), "display-interpolation")) // `"n=" + 12`

	const version = only(scan, "SCHEMA_VERSION")
	assert.ok(hasFlag(version, "version-literal"))
	assert.ok(hasFlag(version, "named-constant"))
	assert.ok(hasFlag(version, "screaming-case-name"))
	assert.ok(hasFlag(only(scan, "version"), "version-literal"))

	const statuses = scan.candidates.filter((c) => hasFlag(c, "http-status"))
	assert.deepEqual(
		statuses.map((c) => c.value).sort((a, b) => a - b),
		[404, 500, 503],
	)
	assert.equal(named(scan, "weights").length, 3)
	assert.ok(named(scan, "weights").every((c) => hasFlag(c, "in-numeric-sequence")))

	// `enclosing.functionName` is the nearest enclosing function, null at module scope.
	assert.equal(only(scan, "LIMIT").enclosing.functionName, null)
	assert.equal(atLine(scan, 12).enclosing.functionName, "inspect")
	assert.equal(statuses.find((c) => c.value === 500)!.enclosing.functionName, "respond")
})

test("a real repo file scans to sane, comment-carrying candidates", () => {
	// `src/contract/constants.ts` belongs to another workstream, so assert invariants only — never
	// a golden count that its author would have to come here to update.
	const rel = "src/contract/constants.ts"
	const scan = scanTypeScriptFile(path.join(V3_ROOT, rel), rel)

	assert.equal(scan.fidelity, "ast")
	assert.equal(scan.language, "ts")
	assert.ok(scan.candidates.length > 0, "the contract's constants file has numbers in it")
	assert.ok(scan.lines > 0)

	for (const candidate of scan.candidates) {
		assert.ok(Number.isFinite(candidate.value), `${candidate.text} parsed to a finite number`)
		assert.ok(candidate.line >= 1 && candidate.line <= scan.lines)
		assert.ok(candidate.column >= 1)
		assert.ok(candidate.snippet.length <= 200)
		assert.equal(candidate.file, rel)
		assert.equal(hasFlag(candidate, "fixture-module"), false)
	}

	// `CONVENTIONS.md` requires a provenance tag on every named constant here; the scanner's job is
	// to hand `classify.ts` the comment that carries it.
	assert.ok(
		scan.candidates.some((c) => c.comments.some((b) => b.text.includes("REVIEWED"))),
		"at least one constant's comment reaches the candidate",
	)
	// The two gradient-stop bounds share one JSDoc — the real case the inheritance rule exists for.
	assert.ok(
		scan.candidates.some((c) => c.comments.some((b) => b.source === "shared-doc-block")),
		"the shared-doc-block rule fires on real code",
	)
})

test("scanTypeScriptSource works without touching the disk", () => {
	const scan = scanTypeScriptSource(`export const N = 7 // [HELD] placeholder\n`, "src/made-up.ts")
	assert.equal(scan.candidates.length, 1)
	assert.equal(scan.file, "src/made-up.ts")
	assert.equal(scan.lines, 1)
	const candidate = scan.candidates[0]!
	assert.equal(candidate.value, 7)
	assert.equal(candidate.line, 1)
	assert.equal(candidate.enclosing.kind, "const")
	assert.equal(candidate.enclosing.name, "N")
	assert.equal(candidate.snippet, "export const N = 7 // [HELD] placeholder")
	assert.deepEqual(candidate.comments, [{ source: "trailing", text: "// [HELD] placeholder" }])
})
