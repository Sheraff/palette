/**
 * Track P probe: exhaustive AST inventory of numeric literals in the v2-3 runtime.
 *
 * Walks every `research/v2-3/src/internal/*.ts` with the TypeScript compiler API and records every
 * NumericLiteral with enough context to (a) classify it and (b) rewrite it textually at a known
 * offset. Regex scanning was rejected: it cannot tell an array index from a threshold, and it misses
 * literals spelled with numeric separators (`0.000_02`).
 *
 * READ-ONLY with respect to the runtime. Output: data/constants-raw.json
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const trackRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))
const repoRoot = resolve(trackRoot, "../../..")
const internalDir = resolve(repoRoot, "research/v2-3/src/internal")

export type RawLiteral = {
	file: string
	line: number
	column: number
	start: number
	end: number
	text: string
	value: number
	/** Syntax kind of the direct parent node. */
	parentKind: string
	/** Nearest enclosing named declaration (const/function/method). */
	enclosing: string
	/** Property-assignment key when the literal is an object field value. */
	propertyKey: string | null
	/** Nearest enclosing top-level statement's declared name, e.g. the policy object const. */
	topLevel: string
	/** The source line, trimmed. */
	lineText: string
	/** Leading JSDoc/`//` comment attached to the literal's property or declaration, if any. */
	docComment: string | null
	/** Heuristic structural classification (index / bound / real tunable). */
	structural: string | null
}

function nearestName(node: ts.Node): string {
	let current: ts.Node | undefined = node
	while (current) {
		if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) return current.name.text
		if (ts.isFunctionDeclaration(current) && current.name) return current.name.text
		if (ts.isMethodDeclaration(current) && ts.isIdentifier(current.name)) return current.name.text
		if (ts.isPropertyDeclaration(current) && ts.isIdentifier(current.name)) return current.name.text
		current = current.parent
	}
	return "<module>"
}

function topLevelName(node: ts.Node): string {
	let current: ts.Node | undefined = node
	let last = "<module>"
	while (current) {
		if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) last = current.name.text
		if (ts.isFunctionDeclaration(current) && current.name) last = current.name.text
		current = current.parent
	}
	return last
}

/** The property key chain when a literal sits inside nested object literals, e.g. `mark.minimumFill`. */
function propertyPath(node: ts.Node): string | null {
	const parts: string[] = []
	let current: ts.Node | undefined = node
	while (current) {
		if (ts.isPropertyAssignment(current)) {
			const name = current.name
			if (ts.isIdentifier(name) || ts.isStringLiteral(name)) parts.unshift(name.text)
		}
		current = current.parent
	}
	return parts.length > 0 ? parts.join(".") : null
}

function leadingComment(source: ts.SourceFile, node: ts.Node): string | null {
	// Walk up to the property assignment / variable statement that owns the doc comment.
	let owner: ts.Node = node
	while (owner.parent
		&& !ts.isPropertyAssignment(owner)
		&& !ts.isVariableStatement(owner)
		&& !ts.isVariableDeclaration(owner)) {
		owner = owner.parent
		if (ts.isSourceFile(owner)) return null
	}
	const ranges = ts.getLeadingCommentRanges(source.text, owner.getFullStart())
	if (!ranges || ranges.length === 0) return null
	return ranges
		.map((range) => source.text.slice(range.pos, range.end))
		.join("\n")
		.replace(/^\s*\/\*\*?|\*\/\s*$/gu, "")
		.split("\n")
		.map((raw) => raw.replace(/^\s*\*ance?\s?/u, "").replace(/^\s*\*\s?/u, "").replace(/^\s*\/\/\s?/u, "").trim())
		.filter((raw) => raw.length > 0)
		.join(" ")
		.trim()
}

/**
 * Structural literals we never perturb: array indices, `.length` comparisons, exponent bases of
 * unit conversions, and the 0/1 that appear as arithmetic identities. Returning a non-null reason
 * moves the literal to the excluded list (still recorded, so the ledger can show what was skipped).
 */
function structuralReason(node: ts.NumericLiteral, value: number): string | null {
	const parent = node.parent
	// A literal in a type position (`position: 0`, `angleDegrees: 135` as literal types) is part of
	// the declared contract, not a runtime value: wrapping it would emit a call inside a type.
	if (ts.isLiteralTypeNode(parent)) return "type-position"
	if (parent.parent && ts.isLiteralTypeNode(parent.parent)) return "type-position"
	if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return "array-index"
	if (ts.isEnumMember(parent)) return "enum-member"
	if (ts.isComputedPropertyName(parent)) return "computed-key"
	// `x[i + 1]`, `x[i * 4 + 2]` — index arithmetic inside an element access.
	let current: ts.Node = node
	let hops = 0
	while (current.parent && hops < 6) {
		if (ts.isElementAccessExpression(current.parent) && current.parent.argumentExpression === current) {
			return "index-arithmetic"
		}
		if (!ts.isBinaryExpression(current.parent) && !ts.isParenthesizedExpression(current.parent)) break
		current = current.parent
		hops += 1
	}
	return null
}

const files = readdirSync(internalDir).filter((name) => name.endsWith(".ts")).sort()
const literals: RawLiteral[] = []

for (const name of files) {
	const path = resolve(internalDir, name)
	const text = readFileSync(path, "utf8")
	const source = ts.createSourceFile(path, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS)
	const lines = text.split("\n")
	const visit = (node: ts.Node): void => {
		if (ts.isNumericLiteral(node)) {
			const value = Number(node.text.replace(/_/gu, ""))
			const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source))
			literals.push({
				file: `research/v2-3/src/internal/${name}`,
				line: line + 1,
				column: character + 1,
				start: node.getStart(source),
				end: node.getEnd(),
				text: node.text,
				value,
				parentKind: ts.SyntaxKind[node.parent.kind],
				enclosing: nearestName(node),
				propertyKey: propertyPath(node),
				topLevel: topLevelName(node),
				lineText: (lines[line] ?? "").trim(),
				docComment: leadingComment(source, node),
				structural: structuralReason(node, value),
			})
		}
		ts.forEachChild(node, visit)
	}
	visit(source)
}

writeFileSync(
	resolve(trackRoot, "data/constants-raw.json"),
	`${JSON.stringify({ schemaVersion: 1, generatedFrom: "research/v2-3/src/internal", literals }, null, "\t")}\n`,
)

const byFile = new Map<string, number>()
for (const literal of literals) byFile.set(literal.file, (byFile.get(literal.file) ?? 0) + 1)
process.stdout.write(`${literals.length} numeric literals in ${files.length} files\n`)
for (const [file, count] of [...byFile].sort((a, b) => b[1] - a[1])) {
	process.stdout.write(`  ${String(count).padStart(5)}  ${file}\n`)
}
const structural = literals.filter((literal) => literal.structural !== null).length
process.stdout.write(`structural (excluded from sweep): ${structural}\n`)
