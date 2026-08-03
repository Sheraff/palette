/**
 * TypeScript half of the parameter-honesty scanner.
 *
 * This module is **purely syntactic**. It finds every numeric literal in a TypeScript source and
 * describes *where it sits* — never whether it is a tunable. That verdict belongs to `classify.ts`
 * alone (see `types.ts` for why the split exists). Consequently there is exactly one failure mode
 * worth fearing here: **under-reporting**. A literal this file misses can never be excluded by a
 * named, counted rule; it just silently shrinks the denominator and flatters the headline. So the
 * scan filters nothing — `0` and `1` are emitted like everything else.
 *
 * Fidelity is `"ast"`: the whole file is parsed with the TypeScript compiler API, which is what buys
 * immunity to numbers inside strings, template text, comments and regular expressions for free. No
 * regex or hand-rolled lexer appears below, deliberately.
 *
 * **BigInt literals (`10n`) are skipped.** They are `ts.SyntaxKind.BigIntLiteral`, a different node
 * kind from `NumericLiteral`, so the walk below never sees them. They are not palette tunables and
 * `Candidate.value` is a `number`, which cannot hold one faithfully.
 */

import { readFileSync } from "node:fs"

import ts from "typescript"

import type { Candidate, CommentBlock, ContextFlag, ScannedFile } from "./types.ts"

// ---------------------------------------------------------------------------------------------
// Value tables
// ---------------------------------------------------------------------------------------------

/** Values that make a `*` / `/` operand a unit conversion rather than a knob. */
const UNIT_CONVERSION_VALUES = new Set([1000, 1e3, 1e6, 1e9, 60, 3600, 24, 255, 1024, 65535])

/**
 * The sRGB transfer function's constants. `src/contract/constants.ts` declares the exemption these
 * belong to in its header: they are fixed by the sRGB specification, verified against an external
 * reference by `contract-color.test.ts`, and have no provenance question to answer.
 */
const SRGB_TRANSFER_VALUES = new Set([0.04045, 12.92, 1.055, 2.4, 0.0031308])

/** Calls whose numeric argument formats output rather than steering behaviour. */
const DISPLAY_FORMAT_METHODS = new Set(["toFixed", "toPrecision", "padStart", "padEnd", "repeat"])

const COMPARISON_OPERATORS = new Set<ts.SyntaxKind>([
	ts.SyntaxKind.LessThanToken,
	ts.SyntaxKind.GreaterThanToken,
	ts.SyntaxKind.LessThanEqualsToken,
	ts.SyntaxKind.GreaterThanEqualsToken,
	ts.SyntaxKind.EqualsEqualsToken,
	ts.SyntaxKind.ExclamationEqualsToken,
	ts.SyntaxKind.EqualsEqualsEqualsToken,
	ts.SyntaxKind.ExclamationEqualsEqualsToken,
])

const SCREAMING_CASE = /^[A-Z][A-Z0-9_]*$/
const VERSION_NAME = /version/i
const MAX_SNIPPET = 200
const MAX_NAME = 80

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

/**
 * Scan TypeScript source text.
 *
 * `relPath` is the POSIX path relative to `research/v3` that goes in the report; it is also what
 * the basename-sensitive flags (`fixture-module`, the `color.ts` half of `colorimetric-spec`) look
 * at, so passing a bare filename is fine for tests but a real scan should pass the real path.
 */
export function scanTypeScriptSource(source: string, relPath: string): ScannedFile {
	const sourceFile = ts.createSourceFile(
		relPath,
		source,
		ts.ScriptTarget.Latest,
		/* setParentNodes */ true,
		scriptKindFor(relPath),
	)
	const ctx = createContext(sourceFile, source, relPath)

	const candidates: Candidate[] = []
	const visit = (node: ts.Node): void => {
		if (ts.isNumericLiteral(node)) candidates.push(buildCandidate(ctx, node))
		ts.forEachChild(node, visit)
	}
	visit(sourceFile)

	// `forEachChild` is already source order, but decorators/modifiers make that a promise the AST
	// does not strictly keep. Sort so the report is byte-stable.
	candidates.sort((a, b) => a.line - b.line || a.column - b.column)

	return {
		file: relPath,
		language: "ts",
		fidelity: "ast",
		lines: countLines(source),
		candidates,
	}
}

/** Read `absPath` from disk and scan it, reporting it under `relPath`. */
export function scanTypeScriptFile(absPath: string, relPath: string): ScannedFile {
	return scanTypeScriptSource(readFileSync(absPath, "utf8"), relPath)
}

// ---------------------------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------------------------

interface ScanContext {
	sourceFile: ts.SourceFile
	source: string
	relPath: string
	basename: string
	lineStarts: readonly number[]
	/** Every comment range in the file, in source order — collected from the parser's own trivia. */
	comments: ts.CommentRange[]
	isFixtureModule: boolean
	isColorModule: boolean
}

function createContext(sourceFile: ts.SourceFile, source: string, relPath: string): ScanContext {
	const basename = relPath.split("/").pop() ?? relPath
	return {
		sourceFile,
		source,
		relPath,
		basename,
		lineStarts: sourceFile.getLineStarts(),
		comments: collectComments(sourceFile, source),
		isFixtureModule:
			basename === "fixtures.ts" ||
			basename === "test-support.ts" ||
			basename.endsWith("-fixtures.ts") ||
			basename.endsWith(".fixture.ts"),
		isColorModule: basename === "color.ts",
	}
}

function scriptKindFor(relPath: string): ts.ScriptKind {
	if (relPath.endsWith(".tsx")) return ts.ScriptKind.TSX
	if (relPath.endsWith(".jsx")) return ts.ScriptKind.JSX
	if (relPath.endsWith(".js") || relPath.endsWith(".mjs") || relPath.endsWith(".cjs")) {
		return ts.ScriptKind.JS
	}
	return ts.ScriptKind.TS
}

/**
 * Every comment in the file, taken from the parser's trivia rather than from a text scan — which is
 * why a `//` inside a string literal can never appear here.
 */
function collectComments(sourceFile: ts.SourceFile, source: string): ts.CommentRange[] {
	const seen = new Set<number>()
	const out: ts.CommentRange[] = []
	const add = (ranges: ts.CommentRange[] | undefined): void => {
		for (const range of ranges ?? []) {
			if (seen.has(range.pos)) continue
			seen.add(range.pos)
			out.push(range)
		}
	}
	// Every comment is leading trivia of exactly one token, so walking tokens finds all of them.
	const walk = (node: ts.Node): void => {
		const children = node.getChildren(sourceFile)
		if (children.length === 0) {
			add(ts.getLeadingCommentRanges(source, node.getFullStart()))
			return
		}
		for (const child of children) walk(child)
	}
	walk(sourceFile)
	out.sort((a, b) => a.pos - b.pos)
	return out
}

function countLines(source: string): number {
	if (source.length === 0) return 0
	let lines = 1
	for (let i = 0; i < source.length; i++) {
		const code = source.charCodeAt(i)
		if (code === 10 /* \n */) lines++
		else if (code === 13 /* \r */ && source.charCodeAt(i + 1) !== 10) lines++
	}
	// A file ending in a newline has no content on the phantom final line.
	const last = source.charCodeAt(source.length - 1)
	if (last === 10 || last === 13) lines--
	return lines
}

// ---------------------------------------------------------------------------------------------
// Candidate construction
// ---------------------------------------------------------------------------------------------

function buildCandidate(ctx: ScanContext, literal: ts.NumericLiteral): Candidate {
	const start = literal.getStart(ctx.sourceFile)
	const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start)

	// `literal.text` is the *normalised* value ("1e-6" comes back as "0.000001"), so read the raw
	// source. Numeric literals cannot contain trivia, so the slice is exact.
	const text = ctx.source.slice(start, literal.getEnd())

	// Fold a unary sign into the site. `-1` is one candidate valued -1, positioned at the digit.
	const signed = signedParent(literal)
	const negative = signed !== null && signed.operator === ts.SyntaxKind.MinusToken
	// Numeric separators are legal in source but not in `Number()`.
	const magnitude = Number(text.replace(/_/g, ""))
	const value = negative ? -magnitude : magnitude

	/** The node that stands in for the literal in every context test — the sign folds into it. */
	const node: ts.Node = signed ?? literal

	const enclosing = resolveEnclosing(ctx, node)
	const flags = resolveFlags(ctx, node, value, text, enclosing, negative)

	return {
		file: ctx.relPath,
		line: line + 1,
		column: character + 1,
		value,
		text,
		language: "ts",
		enclosing,
		snippet: lineText(ctx, line).trim().slice(0, MAX_SNIPPET),
		comments: collectCandidateComments(ctx, node, line),
		flags,
	}
}

/** The `+`/`-` prefix expression directly wrapping this literal, if any. */
function signedParent(literal: ts.NumericLiteral): ts.PrefixUnaryExpression | null {
	const parent = literal.parent
	if (
		parent &&
		ts.isPrefixUnaryExpression(parent) &&
		parent.operand === literal &&
		(parent.operator === ts.SyntaxKind.MinusToken || parent.operator === ts.SyntaxKind.PlusToken)
	) {
		return parent
	}
	return null
}

function lineText(ctx: ScanContext, zeroBasedLine: number): string {
	const from = ctx.lineStarts[zeroBasedLine] ?? 0
	const to = ctx.lineStarts[zeroBasedLine + 1] ?? ctx.source.length
	return ctx.source.slice(from, to)
}

// ---------------------------------------------------------------------------------------------
// Enclosing slot
// ---------------------------------------------------------------------------------------------

interface Enclosing {
	kind: string
	name: string | null
	functionName: string | null
}

/**
 * Nearest meaningful slot, walking out from the literal. The walk never escapes the governing
 * statement or the enclosing function: a literal in an arrow body is not "initialising" the const
 * the arrow is assigned to.
 */
function resolveEnclosing(ctx: ScanContext, node: ts.Node): Enclosing {
	const functionName = resolveFunctionName(ctx, node)
	let child: ts.Node = node
	let parent: ts.Node | undefined = node.parent

	while (parent) {
		const slot = matchSlot(ctx, child, parent)
		if (slot) return { ...slot, functionName }
		if (ts.isSourceFile(parent) || isFunctionLike(parent) || isStatementNode(parent)) break
		child = parent
		parent = parent.parent
	}
	return { kind: "expression", name: null, functionName }
}

function matchSlot(
	ctx: ScanContext,
	child: ts.Node,
	parent: ts.Node,
): { kind: string; name: string | null } | null {
	if (ts.isVariableDeclaration(parent) && parent.initializer === child) {
		return { kind: variableKind(parent), name: nameOf(ctx, parent.name) }
	}
	if (
		(ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) &&
		parent.initializer === child
	) {
		return { kind: "property", name: nameOf(ctx, parent.name) }
	}
	if (ts.isEnumMember(parent) && parent.initializer === child) {
		return { kind: "property", name: nameOf(ctx, parent.name) }
	}
	if ((ts.isParameter(parent) || ts.isBindingElement(parent)) && parent.initializer === child) {
		return { kind: "parameter-default", name: nameOf(ctx, parent.name) }
	}
	if (
		(ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
		(parent.arguments?.indexOf(child as ts.Expression) ?? -1) >= 0
	) {
		return { kind: "call-argument", name: calleeName(ctx, parent) }
	}
	if (ts.isReturnStatement(parent) && parent.expression === child) {
		return { kind: "return", name: null }
	}
	if (ts.isArrowFunction(parent) && parent.body === child) {
		return { kind: "return", name: null }
	}
	if (
		ts.isBinaryExpression(parent) &&
		parent.right === child &&
		isAssignmentOperator(parent.operatorToken.kind)
	) {
		return { kind: "assignment", name: truncate(parent.left.getText(ctx.sourceFile)) }
	}
	return null
}

function variableKind(declaration: ts.VariableDeclaration): "const" | "let" | "var" {
	const list = declaration.parent
	if (list && ts.isVariableDeclarationList(list)) {
		if ((list.flags & ts.NodeFlags.Const) !== 0) return "const"
		if ((list.flags & ts.NodeFlags.Let) !== 0) return "let"
	}
	return "var"
}

function resolveFunctionName(ctx: ScanContext, node: ts.Node): string | null {
	let current: ts.Node | undefined = node.parent
	while (current) {
		if (isFunctionLike(current)) {
			if (ts.isConstructorDeclaration(current)) return "constructor"
			const named = current as ts.FunctionDeclaration | ts.MethodDeclaration
			if (named.name) return nameOf(ctx, named.name)
			// An anonymous function/arrow borrows the name it is bound to, if any.
			const owner = current.parent
			if (owner && ts.isVariableDeclaration(owner) && owner.initializer === current) {
				return nameOf(ctx, owner.name)
			}
			if (owner && ts.isPropertyAssignment(owner) && owner.initializer === current) {
				return nameOf(ctx, owner.name)
			}
			if (owner && ts.isPropertyDeclaration(owner) && owner.initializer === current) {
				return nameOf(ctx, owner.name)
			}
			return null
		}
		current = current.parent
	}
	return null
}

function isFunctionLike(node: ts.Node): boolean {
	return (
		ts.isFunctionDeclaration(node) ||
		ts.isFunctionExpression(node) ||
		ts.isArrowFunction(node) ||
		ts.isMethodDeclaration(node) ||
		ts.isConstructorDeclaration(node) ||
		ts.isGetAccessorDeclaration(node) ||
		ts.isSetAccessorDeclaration(node)
	)
}

/** A node occupying a statement slot — where the enclosing walk stops. */
function isStatementNode(node: ts.Node): boolean {
	return (
		node.kind >= ts.SyntaxKind.FirstStatement &&
		node.kind <= ts.SyntaxKind.LastStatement &&
		!ts.isBlock(node)
	)
}

function nameOf(ctx: ScanContext, name: ts.Node | undefined): string | null {
	if (!name) return null
	if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text
	if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
	return truncate(name.getText(ctx.sourceFile))
}

function calleeName(ctx: ScanContext, call: ts.CallExpression | ts.NewExpression): string | null {
	return truncate(call.expression.getText(ctx.sourceFile))
}

function truncate(text: string): string {
	const flat = text.replace(/\s+/g, " ").trim()
	return flat.length > MAX_NAME ? flat.slice(0, MAX_NAME) : flat
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
	return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment
}

// ---------------------------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------------------------

function resolveFlags(
	ctx: ScanContext,
	node: ts.Node,
	value: number,
	text: string,
	enclosing: Enclosing,
	negative: boolean,
): ContextFlag[] {
	const flags = new Set<ContextFlag>()
	const parent = node.parent

	if (ctx.isFixtureModule) flags.add("fixture-module")
	if (!Number.isInteger(value)) flags.add("float")
	if (/[eE]/.test(text)) flags.add("exponential")
	if (negative) flags.add("negative")

	if (parent && ts.isElementAccessExpression(parent) && parent.argumentExpression === node) {
		flags.add("index-access")
	}
	if (inLoopHeader(node)) flags.add("loop-header")
	if (
		parent &&
		ts.isVariableDeclaration(parent) &&
		parent.initializer === node &&
		variableKind(parent) !== "const"
	) {
		flags.add("accumulator-init")
	}
	if (isExitCode(ctx, node)) flags.add("exit-code")
	if (isDisplayFormat(ctx, node)) flags.add("display-format")
	if (isDisplayInterpolation(node)) flags.add("display-interpolation")
	if (isArithmeticOperand(node, [ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken])) {
		if (UNIT_CONVERSION_VALUES.has(value)) flags.add("unit-conversion")
	}
	if ((value === 0 || value === 1) && isArgumentOfCallee(ctx, node, ["Math.max", "Math.min"])) {
		flags.add("unit-clamp")
	}
	if (isColorimetricSpec(ctx, node, value)) flags.add("colorimetric-spec")
	if (isHttpStatus(ctx, node, value)) flags.add("http-status")
	if (isVersionLiteral(ctx, node)) flags.add("version-literal")
	if (
		parent &&
		ts.isBinaryExpression(parent) &&
		COMPARISON_OPERATORS.has(parent.operatorToken.kind) &&
		(parent.left === node || parent.right === node)
	) {
		flags.add("comparison-operand")
	}
	if (enclosing.kind === "const" || enclosing.kind === "property") {
		if (isDirectInitializer(node)) flags.add("named-constant")
	}
	if (
		enclosing.name &&
		SCREAMING_CASE.test(enclosing.name) &&
		["const", "let", "var", "property", "parameter-default"].includes(enclosing.kind)
	) {
		flags.add("screaming-case-name")
	}
	if (
		parent &&
		(ts.isParameter(parent) || ts.isBindingElement(parent)) &&
		parent.initializer === node
	) {
		flags.add("parameter-default")
	}
	if (inNumericSequence(node)) flags.add("in-numeric-sequence")
	if (
		parent &&
		ts.isCallExpression(parent) &&
		(parent.arguments.indexOf(node as ts.Expression) ?? -1) >= 0
	) {
		flags.add("call-argument")
	}

	return [...flags]
}

/** The literal (sign folded) is itself the initializer of the slot `resolveEnclosing` reported. */
function isDirectInitializer(node: ts.Node): boolean {
	const parent = node.parent
	if (!parent) return false
	if (ts.isVariableDeclaration(parent) && parent.initializer === node) return true
	if (ts.isPropertyAssignment(parent) && parent.initializer === node) return true
	if (ts.isPropertyDeclaration(parent) && parent.initializer === node) return true
	if (ts.isEnumMember(parent) && parent.initializer === node) return true
	return false
}

function inLoopHeader(node: ts.Node): boolean {
	let child: ts.Node = node
	let parent: ts.Node | undefined = node.parent
	while (parent) {
		if (ts.isForStatement(parent)) {
			if (
				parent.initializer === child ||
				parent.condition === child ||
				parent.incrementor === child
			) {
				return true
			}
		}
		child = parent
		parent = parent.parent
	}
	return false
}

function isExitCode(ctx: ScanContext, node: ts.Node): boolean {
	const parent = node.parent
	if (!parent) return false
	if (ts.isCallExpression(parent) && parent.arguments.indexOf(node as ts.Expression) >= 0) {
		if (parent.expression.getText(ctx.sourceFile) === "process.exit") return true
	}
	if (
		ts.isBinaryExpression(parent) &&
		parent.right === node &&
		isAssignmentOperator(parent.operatorToken.kind)
	) {
		const left = parent.left.getText(ctx.sourceFile)
		if (left === "process.exitCode" || left.endsWith(".exitCode")) return true
	}
	return false
}

function isDisplayFormat(ctx: ScanContext, node: ts.Node): boolean {
	const parent = node.parent
	if (!parent || !ts.isCallExpression(parent)) return false
	if (parent.arguments.indexOf(node as ts.Expression) < 0) return false
	const callee = parent.expression
	if (!ts.isPropertyAccessExpression(callee)) return false
	const method = callee.name.text
	if (DISPLAY_FORMAT_METHODS.has(method)) return true
	// `toString` only formats when it is given a radix.
	return method === "toString" && parent.arguments.length >= 1
}

function isDisplayInterpolation(node: ts.Node): boolean {
	// Inside a template literal's substitution.
	let child: ts.Node = node
	let parent: ts.Node | undefined = node.parent
	while (parent) {
		if (ts.isTemplateSpan(parent) && parent.expression === child) return true
		if (isFunctionLike(parent) || ts.isSourceFile(parent)) break
		child = parent
		parent = parent.parent
	}
	// Or `"label " + n` — concatenation with something string-shaped.
	const direct = node.parent
	if (direct && ts.isBinaryExpression(direct) && direct.operatorToken.kind === ts.SyntaxKind.PlusToken) {
		const other = direct.left === node ? direct.right : direct.left
		if (isStringShaped(other)) return true
	}
	return false
}

function isStringShaped(node: ts.Node): boolean {
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return true
	if (ts.isTemplateExpression(node)) return true
	if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
		return isStringShaped(node.left) || isStringShaped(node.right)
	}
	if (ts.isParenthesizedExpression(node)) return isStringShaped(node.expression)
	return false
}

function isArithmeticOperand(node: ts.Node, operators: ts.SyntaxKind[]): boolean {
	const parent = node.parent
	return Boolean(
		parent &&
			ts.isBinaryExpression(parent) &&
			operators.includes(parent.operatorToken.kind) &&
			(parent.left === node || parent.right === node),
	)
}

function isArgumentOfCallee(ctx: ScanContext, node: ts.Node, callees: string[]): boolean {
	const parent = node.parent
	if (!parent || !ts.isCallExpression(parent)) return false
	if (parent.arguments.indexOf(node as ts.Expression) < 0) return false
	return callees.includes(parent.expression.getText(ctx.sourceFile))
}

/**
 * The exemption `src/contract/constants.ts` declares in its header: constants fixed by the sRGB and
 * OKLab specifications.
 *
 * Two halves. The sRGB transfer constants are recognised by value anywhere. The OKLab matrices have
 * no distinctive values, so they are recognised structurally *and only in `color.ts`*: a literal
 * inside an array literal of three or more numeric-valued elements. That is deliberately narrower
 * than "every float in `color.ts`" — see the module note in the test file for what it misses.
 */
function isColorimetricSpec(ctx: ScanContext, node: ts.Node, value: number): boolean {
	if (SRGB_TRANSFER_VALUES.has(value)) return true
	if (!ctx.isColorModule) return false
	let parent: ts.Node | undefined = node.parent
	while (parent) {
		if (ts.isArrayLiteralExpression(parent) && parent.elements.length >= 3) {
			if (parent.elements.every(isMatrixRow)) return true
		}
		if (isFunctionLike(parent) || ts.isSourceFile(parent) || isStatementNode(parent)) break
		parent = parent.parent
	}
	return false
}

/**
 * A matrix row: an expression built only from numeric literals, plain variable/property reads and
 * arithmetic, and containing at least one number.
 *
 * Calls are deliberately excluded. `[parseInt(s.slice(1, 3), 16), …]` is a three-element array of
 * numbers, but `3` and `16` there are a string offset and a radix — not colorimetric constants.
 * Requiring a bare number in every row keeps the flag on `[0.21 * l + 0.79 * m - 0.004 * s, …]`
 * and off everything else in the file.
 */
function isMatrixRow(node: ts.Node): boolean {
	return isMatrixShaped(node) && containsNumericLiteral(node)
}

function isMatrixShaped(node: ts.Node): boolean {
	if (ts.isNumericLiteral(node)) return true
	if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) return true
	if (ts.isElementAccessExpression(node)) return true
	if (ts.isParenthesizedExpression(node)) return isMatrixShaped(node.expression)
	if (ts.isPrefixUnaryExpression(node)) return isMatrixShaped(node.operand)
	if (ts.isBinaryExpression(node)) {
		const op = node.operatorToken.kind
		const arithmetic =
			op === ts.SyntaxKind.PlusToken ||
			op === ts.SyntaxKind.MinusToken ||
			op === ts.SyntaxKind.AsteriskToken ||
			op === ts.SyntaxKind.SlashToken ||
			op === ts.SyntaxKind.PercentToken ||
			op === ts.SyntaxKind.AsteriskAsteriskToken
		return arithmetic && isMatrixShaped(node.left) && isMatrixShaped(node.right)
	}
	return false
}

function containsNumericLiteral(node: ts.Node): boolean {
	if (ts.isNumericLiteral(node)) return true
	let found = false
	ts.forEachChild(node, (child) => {
		if (found) return
		if (containsNumericLiteral(child)) found = true
	})
	return found
}

function isHttpStatus(ctx: ScanContext, node: ts.Node, value: number): boolean {
	if (!Number.isInteger(value) || value < 100 || value > 599) return false
	const parent = node.parent
	if (!parent) return false
	if (ts.isCallExpression(parent) && parent.arguments.indexOf(node as ts.Expression) >= 0) {
		const callee = parent.expression
		const name = ts.isPropertyAccessExpression(callee)
			? callee.name.text
			: callee.getText(ctx.sourceFile)
		if (name === "writeHead") return true
	}
	if (
		ts.isBinaryExpression(parent) &&
		parent.right === node &&
		isAssignmentOperator(parent.operatorToken.kind) &&
		ts.isPropertyAccessExpression(parent.left) &&
		parent.left.name.text === "statusCode"
	) {
		return true
	}
	if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
		const name = nameOf(ctx, parent.name)
		if (name === "statusCode") return true
	}
	return false
}

function isVersionLiteral(ctx: ScanContext, node: ts.Node): boolean {
	const parent = node.parent
	if (!parent) return false
	if (ts.isVariableDeclaration(parent) && parent.initializer === node) {
		const name = nameOf(ctx, parent.name)
		return Boolean(name && VERSION_NAME.test(name))
	}
	if (
		(ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) &&
		parent.initializer === node
	) {
		const name = nameOf(ctx, parent.name)
		return Boolean(name && VERSION_NAME.test(name))
	}
	return false
}

function inNumericSequence(node: ts.Node): boolean {
	const parent = node.parent
	if (!parent || !ts.isArrayLiteralExpression(parent)) return false
	if (parent.elements.indexOf(node as ts.Expression) < 0) return false
	let numeric = 0
	for (const element of parent.elements) {
		if (isPlainNumber(element)) numeric++
	}
	return numeric >= 3
}

function isPlainNumber(node: ts.Node): boolean {
	if (ts.isNumericLiteral(node)) return true
	if (
		ts.isPrefixUnaryExpression(node) &&
		(node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken)
	) {
		return ts.isNumericLiteral(node.operand)
	}
	return false
}

// ---------------------------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------------------------

/** How far back the shared-doc-block rule will look for a doc to inherit. */
const SHARED_DOC_MAX_LOOKBACK = 3

/**
 * Comment blocks that could carry this site's provenance tag, nearest first.
 *
 * 1. `trailing` — a comment on the literal's own physical line, or trailing the governing statement.
 * 2. `leading` — the governing statement's own doc block.
 * 3. `shared-doc-block` — only when there is no leading block: the doc of an adjacent preceding
 *    variable statement. `MIN_GRADIENT_STOPS` / `MAX_GRADIENT_STOPS` in `src/contract/constants.ts`
 *    is the real case this exists for. It is an inference, and it is labelled so the report can
 *    discount it.
 */
function collectCandidateComments(
	ctx: ScanContext,
	node: ts.Node,
	zeroBasedLine: number,
): CommentBlock[] {
	const governing = governingStatement(node)
	const blocks: CommentBlock[] = []
	const seen = new Set<number>()

	const push = (source: CommentBlock["source"], range: ts.CommentRange): void => {
		if (seen.has(range.pos)) return
		seen.add(range.pos)
		blocks.push({ source, text: ctx.source.slice(range.pos, range.end) })
	}

	// 1. Trailing — the statement's trailing trivia, plus anything on the literal's own line.
	const literalEnd = node.getEnd()
	for (const range of ts.getTrailingCommentRanges(ctx.source, governing.getEnd()) ?? []) {
		push("trailing", range)
	}
	for (const range of ctx.comments) {
		if (range.pos < literalEnd) continue
		if (ctx.sourceFile.getLineAndCharacterOfPosition(range.pos).line !== zeroBasedLine) continue
		push("trailing", range)
	}

	// 2. Leading — the block adjacent to the statement, not every comment above it.
	const leading = adjacentLeadingBlock(ctx, governing)
	for (const range of leading) push("leading", range)

	// 3. Shared doc block — only when the statement documents nothing itself.
	if (leading.length === 0) {
		for (const range of sharedDocBlock(ctx, governing)) push("shared-doc-block", range)
	}

	return blocks
}

/**
 * The statement (or class member) that owns this literal's documentation. Class members are their
 * own governing node so a member's JSDoc wins over the class's.
 */
function governingStatement(node: ts.Node): ts.Node {
	let current: ts.Node = node
	while (current.parent && !ts.isSourceFile(current.parent)) {
		if (statementListOf(current.parent) !== null) return current
		if (isClassMember(current)) return current
		current = current.parent
	}
	return current
}

function isClassMember(node: ts.Node): boolean {
	const parent = node.parent
	if (!parent) return false
	if (!ts.isClassDeclaration(parent) && !ts.isClassExpression(parent)) return false
	return (
		ts.isPropertyDeclaration(node) ||
		ts.isMethodDeclaration(node) ||
		ts.isGetAccessorDeclaration(node) ||
		ts.isSetAccessorDeclaration(node) ||
		ts.isConstructorDeclaration(node)
	)
}

function statementListOf(node: ts.Node): readonly ts.Statement[] | null {
	if (ts.isSourceFile(node)) return node.statements
	if (ts.isBlock(node) || ts.isModuleBlock(node)) return node.statements
	if (ts.isCaseClause(node) || ts.isDefaultClause(node)) return node.statements
	return null
}

/**
 * The leading comments that actually touch the statement.
 *
 * `ts.getLeadingCommentRanges` hands back everything above the node including a file header two
 * blank lines up, so keep only the run of comments with no blank line between them and the
 * statement. Otherwise the first declaration in a file inherits the module header's prose.
 */
function adjacentLeadingBlock(ctx: ScanContext, statement: ts.Node): ts.CommentRange[] {
	const ranges = ts.getLeadingCommentRanges(ctx.source, statement.getFullStart()) ?? []
	if (ranges.length === 0) return []
	const kept: ts.CommentRange[] = []
	let nextStart = statement.getStart(ctx.sourceFile)
	for (let i = ranges.length - 1; i >= 0; i--) {
		const range = ranges[i]!
		if (blankLineBetween(ctx, range.end, nextStart)) break
		kept.unshift(range)
		nextStart = range.pos
	}
	return kept
}

function blankLineBetween(ctx: ScanContext, from: number, to: number): boolean {
	const startLine = ctx.sourceFile.getLineAndCharacterOfPosition(from).line
	const endLine = ctx.sourceFile.getLineAndCharacterOfPosition(to).line
	return endLine - startLine > 1
}

/**
 * The shared-doc-block rule: an undocumented variable statement inherits the doc of the variable
 * statement immediately above it, when the two are adjacent (no blank line). Walks back at most
 * {@link SHARED_DOC_MAX_LOOKBACK} siblings, stopping at the first one that carries a comment.
 */
function sharedDocBlock(ctx: ScanContext, statement: ts.Node): ts.CommentRange[] {
	if (!ts.isVariableStatement(statement)) return []
	const parent = statement.parent
	if (!parent) return []
	const siblings = statementListOf(parent)
	if (!siblings) return []
	let index = siblings.indexOf(statement as ts.Statement)
	if (index < 0) return []

	let anchor: ts.Node = statement
	for (let step = 0; step < SHARED_DOC_MAX_LOOKBACK; step++) {
		const previous = siblings[index - 1]
		if (!previous || !ts.isVariableStatement(previous)) return []
		const previousEndLine = ctx.sourceFile.getLineAndCharacterOfPosition(previous.getEnd()).line
		const anchorStartLine = ctx.sourceFile.getLineAndCharacterOfPosition(
			anchor.getStart(ctx.sourceFile),
		).line
		if (anchorStartLine - previousEndLine > 1) return []
		const leading = adjacentLeadingBlock(ctx, previous)
		if (leading.length > 0) return leading
		anchor = previous
		index -= 1
	}
	return []
}
