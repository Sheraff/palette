/**
 * # F2 — the tripwire.
 *
 * `SPEC.md` §3 pre-registers the falsifier this file exists to keep armed:
 *
 * > **F2 — the relapse:** if a viable implementation requires any per-member weight, reliability
 * > constant, prior, or threshold (anything a member brings that the currency consumes), the
 * > historic failure has repeated. Falsified regardless of scores. Hand-set constants ARE the
 * > failure shape; **discovering we need one is the result, not a licence to add it.**
 *
 * A falsifier nobody can trip is decoration, so this is a *test*, not a policy. It AST-walks every
 * file under `selector/` and fails the suite on any numeric literal that could carry a magnitude.
 *
 * ## The two rules
 *
 * **Rule A — `constants.ts`.** Every module-level constant whose initialiser contains a numeric
 * literal must be in exactly one of three registers: named in `ANCHORED_DECISIONS` (an arm-c′ §4 free
 * parameter, with the artifact that settled it), named in `COMPUTE_BOUNDS` (a ceiling on work, which
 * can only cost time and can never move a decision's direction), or carrying `[STRUCTURAL]` in its
 * doc comment (an identity of the arithmetic — a pair is two, OKLab has three coordinates). There is
 * no fourth register, and adding one is a visible edit to this test.
 *
 * ### The σ floor, and why it did not need a fourth register
 *
 * SPEC §3.1 — pre-registered before implementation, acknowledged by the main tier — resolves the σ = 0
 * degeneracy with `σ_effective = max(σ_measured, σ_quant)`. A noise floor is exactly the failure shape
 * F2 names, so the whitelist question had to be answered explicitly rather than by silence, and the
 * answer is: **nothing was whitelisted, because σ_quant is not a constant.** It is
 * `measureQuantizationScale()`, a function of the image's mean colour and of the 8-bit sRGB encoding,
 * and it returns a different number on every cover. Concretely:
 *
 *  - **Rule A is untouched.** The floor added no registered constant. What it added to `constants.ts`
 *    is two `[STRUCTURAL]` identities — the 12 of `Var(U) = w²/12` and the 2 of a symmetric difference
 *    quotient's span — neither of which can carry a magnitude, both of which are integrals or algebra.
 *  - **Rule B is untouched, and it is what guards the floor.** `substrate.ts` is scanned like
 *    everything else, so a `1e-3` smuggled in as the floor's value fails this suite. The synthetic
 *    offender at the bottom of this file is exactly that: a hard-set `SIGMA_FLOOR`, which the scanner
 *    must catch.
 *  - `DERIVED_QUANTITIES` in `constants.ts` records the derivation and the consequence. It is a
 *    *register of functions*, not of numbers — it cannot hold a magnitude, and the function it names
 *    is still scanned by rule B. `derivedQuantitiesAreHonest` below checks that the function it claims
 *    actually exists under `selector/`, so the register cannot vouch for code that is not there.
 *
 * **Rule B — everywhere else under `selector/`.** The only numeric literals admitted in the pricing
 * code are `0`, `1` and `-1` — the additive identity, the unit loop step, and a comparator's
 * sentinel — plus `2` where it indexes a three-coordinate OKLab buffer. None of those can encode a
 * magnitude: there is no way to write a weight, a prior, a reliability or a threshold using only the
 * unit step and an array index. A `0.7`, a `3`, a `12` anywhere in `currency.ts`, `select.ts`,
 * `substrate.ts` or `pipeline.ts` fails this test, which is what turns "the currency has no
 * coefficients" from a claim in a comment into a checked property.
 *
 * ## Why the scanner is itself tested
 *
 * A tripwire that silently stopped matching would pass forever and mean nothing — the worst failure
 * mode a safety check has, and one `CONVENTIONS.md` records this repo hitting before (the
 * `grep -rlP '\x00'` false clean). So the last three tests below run the scanner over **synthetic
 * offenders**: a fabricated per-member reliability weight, a fabricated threshold, and an
 * unregistered constant in `constants.ts`. If the scanner does not flag those, the scanner is broken,
 * and the suite says so rather than reporting green.
 *
 * Run:
 * NODE_NO_WARNINGS=1 node --experimental-strip-types --test \
 *   research/v3/prototypes/p4-portfolio/tests/f2-tripwire.test.ts
 */

import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import test from "node:test"

import ts from "typescript"

import {
	ANCHORED_DECISIONS,
	COMPUTE_BOUNDS,
	DERIVED_QUANTITIES,
	HELD_DECISIONS,
} from "../selector/constants.ts"

const HERE = dirname(new URL(import.meta.url).pathname)
const SELECTOR = resolve(HERE, "../selector")

/** [STRUCTURAL] The literals that cannot carry a magnitude, anywhere. */
const INERT_LITERALS = new Set([0, 1, -1])

/** [STRUCTURAL] arm-c′ §4 declares eight free parameters for the whole system. Read off the proposal. */
const ARM_C_PRIME_FREE_PARAMETERS = 8

/**
 * [STRUCTURAL] The largest index into a three-coordinate OKLab buffer. Admitted only in an
 * element-access position, so `lab[base + 2]` passes and `sigma * 2` does not.
 */
const OKLAB_LAST_INDEX = 2

type Offence = { file: string; line: number; value: string; text: string; rule: "A" | "B" }

// ---------------------------------------------------------------------------------------------
// The scanner
// ---------------------------------------------------------------------------------------------

/** Is this literal (possibly through `a + 2`) the subscript of an element access? */
function isElementAccessSubscript(node: ts.Node): boolean {
	let child = node
	let parent = node.parent as ts.Node | undefined
	while (parent !== undefined) {
		if (ts.isElementAccessExpression(parent)) return parent.argumentExpression === child
		if (!ts.isBinaryExpression(parent) && !ts.isParenthesizedExpression(parent)) return false
		child = parent
		parent = parent.parent as ts.Node | undefined
	}
	return false
}

/**
 * The module-level `const NAME = …` whose *own* initialiser this node is part of, if any.
 *
 * The walk stops at a function boundary on purpose. A literal inside a function body is running
 * code, and running code is rule B's business whatever the surrounding declaration is called — so
 * `const OPTIONS = (() => { … 1 … })()` is judged by what is inside the arrow, not by the name
 * outside it. Only the constant's directly-evaluated initialiser is rule A's.
 */
function enclosingModuleConstant(node: ts.Node): ts.VariableDeclaration | null {
	let current: ts.Node | undefined = node
	while (current !== undefined) {
		if (ts.isFunctionLike(current)) return null
		if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
			const statement = current.parent.parent
			if (ts.isVariableStatement(statement) && ts.isSourceFile(statement.parent)) return current
		}
		current = current.parent as ts.Node | undefined
	}
	return null
}

/** Everything between the previous node and this one — the doc comment, if there is one. */
function leadingText(node: ts.Node, source: ts.SourceFile): string {
	return source.text.slice(node.getFullStart(), node.getStart(source))
}

/**
 * Walk one file and return every literal that breaks the rules.
 *
 * `registered` is the set of constant names the registries vouch for; it is passed in rather than
 * imported so the synthetic-offender tests can drive the same scanner.
 */
export function scan(fileName: string, text: string, registered: ReadonlySet<string>): Offence[] {
	const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true)
	const isConstantsFile = fileName.endsWith("constants.ts")
	const offences: Offence[] = []

	const walk = (node: ts.Node): void => {
		if (ts.isNumericLiteral(node)) {
			const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
			const lineText = text.split("\n")[line - 1]?.trim() ?? ""
			const negated =
				ts.isPrefixUnaryExpression(node.parent) &&
				node.parent.operator === ts.SyntaxKind.MinusToken
			const value = negated ? -Number(node.text) : Number(node.text)
			const declaration = enclosingModuleConstant(node)

			if (declaration !== null && ts.isIdentifier(declaration.name)) {
				const name = declaration.name.text
				// Rule A: a module-level constant holding a literal must be vouched for. Outside
				// `constants.ts` there is no register at all, so any such constant is an offence there
				// too — the registries live in one file on purpose.
				const statement = declaration.parent.parent
				const vouched =
					isConstantsFile &&
					(registered.has(name) || leadingText(statement, source).includes("[STRUCTURAL]"))
				if (!vouched && !INERT_LITERALS.has(value)) {
					offences.push({ file: fileName, line, value: String(value), text: lineText, rule: "A" })
				}
			} else if (
				!INERT_LITERALS.has(value) &&
				!(value === OKLAB_LAST_INDEX && isElementAccessSubscript(node))
			) {
				// Rule B: a literal in a function body, carrying a magnitude.
				offences.push({ file: fileName, line, value: String(value), text: lineText, rule: "B" })
			}
		}
		ts.forEachChild(node, walk)
	}
	walk(source)
	return offences
}

const REGISTERED = new Set([
	...ANCHORED_DECISIONS.map((decision) => decision.constant),
	...COMPUTE_BOUNDS.map((bound) => bound.constant),
])

const SELECTOR_FILES = readdirSync(SELECTOR)
	.filter((name) => name.endsWith(".ts"))
	.sort()

// ---------------------------------------------------------------------------------------------
// The tripwire itself
// ---------------------------------------------------------------------------------------------

test("F2: no unregistered numeric constant exists anywhere under selector/", () => {
	assert.ok(SELECTOR_FILES.length > 0, "the scanner found no files to scan — it would pass vacuously")
	const offences: Offence[] = []
	for (const name of SELECTOR_FILES) {
		offences.push(...scan(name, readFileSync(resolve(SELECTOR, name), "utf8"), REGISTERED))
	}
	assert.deepEqual(
		offences,
		[],
		`F2 tripped. Every number under selector/ must be an arm-c′ §4 anchored decision, a compute ` +
			`bound, a [STRUCTURAL] identity, or one of ${[...INERT_LITERALS].join("/")}:\n` +
			offences.map((o) => `  ${o.file}:${o.line} rule ${o.rule}: ${o.value} — ${o.text}`).join("\n"),
	)
})

test("F2: the registries are honest — every registered name exists and carries an anchor", () => {
	const declared = new Set<string>()
	const source = ts.createSourceFile(
		"constants.ts",
		readFileSync(resolve(SELECTOR, "constants.ts"), "utf8"),
		ts.ScriptTarget.ES2022,
		true,
	)
	const collect = (node: ts.Node): void => {
		if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declared.add(node.name.text)
		ts.forEachChild(node, collect)
	}
	collect(source)

	for (const decision of ANCHORED_DECISIONS) {
		assert.ok(declared.has(decision.constant), `${decision.constant} is registered but not declared`)
		assert.ok(decision.anchor.trim().length > 0, `${decision.constant} has an empty anchor`)
		assert.match(decision.decision, /arm-c′ §4/u, `${decision.constant} names no arm-c′ decision`)
		assert.match(decision.tag, /^\[[A-Z]+\]$/u, `${decision.constant} has no provenance tag`)
	}
	for (const bound of COMPUTE_BOUNDS) {
		assert.ok(declared.has(bound.constant), `${bound.constant} is registered but not declared`)
		assert.ok(bound.rationale.trim().length > 0, `${bound.constant} has an empty rationale`)
	}
})

test("F2: every registered decision is one of arm-c′ §4's eight, and none is invented", () => {
	// arm-c′ §4 lists exactly eight free parameters for the whole system, and registering a ninth
	// would be the relapse wearing an anchor's clothes. Of the eight, this milestone reaches two:
	// decision 1 (the lattice resolution), anchored by the C sweep, and decision 3 (the noise-scale
	// estimator's form), whose anchor is another arm's instrument and which is therefore HELD.
	const numberOf = (decision: string): number => Number(decision.match(/decision (\d+)/u)?.[1])
	for (const decision of [...ANCHORED_DECISIONS, ...HELD_DECISIONS, ...DERIVED_QUANTITIES]) {
		const number = numberOf(decision.decision)
		assert.ok(
			Number.isInteger(number) && number >= 1 && number <= ARM_C_PRIME_FREE_PARAMETERS,
			`${decision.decision} is not one of arm-c′ §4's eight free parameters`,
		)
	}
	assert.deepEqual(
		[...new Set(ANCHORED_DECISIONS.map((decision) => numberOf(decision.decision)))],
		[1],
		"an anchored decision outside arm-c′ §4 decision 1",
	)
})

test("F2: a held decision declares its missing anchor and its measured consequence", () => {
	// A held decision is the honest form of "we needed an anchor and did not have one". It is only
	// honest if it says which anchor is missing and what was measured instead — otherwise it is a
	// place to park a constant nobody has to justify.
	assert.ok(HELD_DECISIONS.length > 0, "decision 3 is held; the register must say so")
	for (const held of HELD_DECISIONS) {
		assert.equal(held.tag, "[HELD]", `${held.implementedBy} is registered as held without the tag`)
		assert.ok(held.anchorNotAvailable.trim().length > 0, `${held.implementedBy}: no missing anchor`)
		assert.ok(held.consequence.trim().length > 0, `${held.implementedBy}: no measured consequence`)
		// The point of holding rather than settling: nothing was inserted to make the run finish.
		assert.match(held.consequence, /verbatim|NOT adjusted|refused/u)
	}
})

test("F2: a derived quantity names a real function and states its arithmetic", () => {
	// SPEC §3.1's floor is admissible only because it is computed, not set. That claim is checkable:
	// the register must name a function that actually exists under `selector/` — a register vouching
	// for code that is not there would be prose, and prose is what F2 is written to distrust.
	assert.ok(DERIVED_QUANTITIES.length > 0, "the σ floor is derived; the register must say so")
	const sources = SELECTOR_FILES.map((name) => readFileSync(resolve(SELECTOR, name), "utf8")).join("\n")
	for (const derived of DERIVED_QUANTITIES) {
		assert.equal(derived.tag, "[DERIVED]", `${derived.implementedBy} is registered without the tag`)
		const functionName = derived.implementedBy.split("(")[0]!.trim()
		assert.match(
			sources,
			new RegExp(`export function ${functionName}\\b`, "u"),
			`${derived.implementedBy} is registered but no such exported function exists under selector/`,
		)
		assert.ok(derived.derivation.trim().length > 0, `${derived.implementedBy}: no derivation`)
		assert.ok(derived.consequence.trim().length > 0, `${derived.implementedBy}: no consequence`)
		// The derivation has to say what it is derived FROM, or "derived" is decoration.
		assert.match(derived.derivation, /image|file|encoding/u, `${derived.implementedBy}: derived from what?`)
	}
})

// ---------------------------------------------------------------------------------------------
// The scanner is armed — synthetic offenders it must catch
// ---------------------------------------------------------------------------------------------

test("F2 scanner catches a hard-set σ noise floor — the failure shape SPEC §3.1 walks past", () => {
	// The floor as it must NOT be written: a number somebody picked because it made the run finish.
	// This is the single most likely relapse in this prototype, so the scanner is armed against it
	// directly rather than trusted to catch it as a generic literal.
	const asConstant = `
		/** The smallest σ we will price at. */
		const SIGMA_FLOOR = 1e-3
		export function effectiveSigma(measured: number): number {
			return Math.max(measured, SIGMA_FLOOR)
		}
	`
	const constantOffences = scan("substrate.ts", asConstant, REGISTERED)
	assert.equal(constantOffences.length, 1, "the scanner missed a hard-set σ floor constant")
	assert.equal(constantOffences[0]!.rule, "A")

	const inlined = `
		export function effectiveSigma(measured: number): number {
			return measured > 0 ? measured : 0.001
		}
	`
	const inlinedOffences = scan("substrate.ts", inlined, REGISTERED)
	assert.equal(inlinedOffences.length, 1, "the scanner missed an inlined σ floor")
	assert.equal(inlinedOffences[0]!.rule, "B")
	assert.equal(inlinedOffences[0]!.value, "0.001")
})

test("F2 scanner catches a fabricated per-member reliability weight", () => {
	const offender = `
		const RELIABILITY = { "p3-fields": 1.3, "p2-tree": 0.8 }
		export function priceMember(slug: string, bits: number): number {
			return bits * (RELIABILITY[slug] ?? 1)
		}
	`
	const offences = scan("currency.ts", offender, REGISTERED)
	// Caught by rule A — a module-level constant outside `constants.ts` has no register to be in, so
	// there is nowhere in the tree to put a weight table where the scanner does not see it.
	assert.ok(offences.length >= 2, "the scanner missed a per-member weight table")
	assert.deepEqual([...new Set(offences.map((o) => o.value))].sort(), ["0.8", "1.3"])

	// The same weights inlined into the function body, where rule B catches them instead.
	const inlined = `
		export function priceMember(slug: string, bits: number): number {
			return bits * (slug === "p3-fields" ? 1.3 : 0.8)
		}
	`
	const inlinedOffences = scan("currency.ts", inlined, REGISTERED)
	assert.equal(inlinedOffences.length, 2)
	assert.deepEqual([...new Set(inlinedOffences.map((o) => o.rule))], ["B"])
})

test("F2 scanner catches a fabricated threshold in the pricing code", () => {
	const offender = `
		export function winner(marginBits: number): boolean {
			return marginBits > 50
		}
	`
	const offences = scan("select.ts", offender, REGISTERED)
	assert.equal(offences.length, 1)
	assert.equal(offences[0]!.value, "50")
	assert.equal(offences[0]!.rule, "B")
})

test("F2 scanner catches an unregistered, untagged constant in constants.ts", () => {
	const tagged = "/** [STRUCTURAL] A pair is two. */\nexport const PAIR = 2\n"
	assert.deepEqual(scan("constants.ts", tagged, REGISTERED), [], "a [STRUCTURAL] tag should pass")

	const untagged = "/** The prior on a member being right. */\nexport const MEMBER_PRIOR = 0.5\n"
	const offences = scan("constants.ts", untagged, REGISTERED)
	assert.equal(offences.length, 1)
	assert.equal(offences[0]!.value, "0.5")
	assert.equal(offences[0]!.rule, "A")
})

test("F2 scanner admits an OKLab index but not the same digit as a factor", () => {
	const index = "export function read(lab: Float64Array, base: number) { return lab[base + 2] }\n"
	assert.deepEqual(scan("currency.ts", index, REGISTERED), [], "an OKLab subscript should pass")

	const factor = "export function scale(sigma: number) { return sigma * 2 }\n"
	const offences = scan("currency.ts", factor, REGISTERED)
	assert.equal(offences.length, 1, "a bare factor of 2 must be named, not inlined")
	assert.equal(offences[0]!.rule, "B")
})
