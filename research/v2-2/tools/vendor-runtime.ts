import { mkdir, rm, writeFile } from "node:fs/promises"
import { basename, dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const packageRoot = fileURLToPath(new URL("../../..", import.meta.url))
const sourceRoot = resolve(packageRoot, "research/src")
const outputRoot = resolve(packageRoot, "research/v2-2/src/internal")
const entryFile = resolve(sourceRoot, "album-artwork-palette-v2-phase-3-final-candidate.ts")
const decoderFile = resolve(sourceRoot, "native-resolution-image.ts")
const roots = new Map([
	[entryFile, [
		"ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT_ID",
		"ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION_ID",
		"extractAlbumArtworkPaletteV2Phase3FinalCandidateDetails",
	]],
	[decoderFile, ["NATIVE_IMAGE_MAXIMUM_PIXELS", "loadNativeImage"]],
])

const program = ts.createProgram([...roots.keys()], {
	allowImportingTsExtensions: true,
	module: ts.ModuleKind.NodeNext,
	moduleResolution: ts.ModuleResolutionKind.NodeNext,
	noEmit: true,
	target: ts.ScriptTarget.ESNext,
})
const checker = program.getTypeChecker()
const selected = new Map<ts.SourceFile, Set<ts.Statement>>()
const usedImports = new Set<ts.Declaration>()
const queue: Array<Readonly<{ source: ts.SourceFile; statement: ts.Statement }>> = []

function isVendoredSource(source: ts.SourceFile): boolean {
	const path = resolve(source.fileName)
	return path.startsWith(`${sourceRoot}/`) && path.endsWith(".ts")
}

function topLevelStatement(declaration: ts.Declaration): ts.Statement | null {
	let node: ts.Node = declaration
	while (node.parent && !ts.isSourceFile(node.parent)) node = node.parent
	return ts.isStatement(node) ? node : null
}

function selectDeclaration(declaration: ts.Declaration): void {
	const source = declaration.getSourceFile()
	if (!isVendoredSource(source)) return
	if (ts.isImportClause(declaration) || ts.isImportSpecifier(declaration) ||
		ts.isNamespaceImport(declaration) || ts.isImportEqualsDeclaration(declaration)) {
		usedImports.add(declaration)
		return
	}
	const statement = topLevelStatement(declaration)
	if (!statement || ts.isImportDeclaration(statement)) return
	let statements = selected.get(source)
	if (!statements) {
		statements = new Set()
		selected.set(source, statements)
	}
	if (statements.has(statement)) return
	statements.add(statement)
	queue.push({ source, statement })
}

function selectSymbol(symbol: ts.Symbol | undefined): void {
	if (!symbol) return
	if (symbol.flags & ts.SymbolFlags.Alias) {
		for (const declaration of symbol.declarations ?? []) usedImports.add(declaration)
		symbol = checker.getAliasedSymbol(symbol)
	}
	for (const declaration of symbol.declarations ?? []) selectDeclaration(declaration)
}

for (const [fileName, names] of roots) {
	const source = program.getSourceFile(fileName)
	if (!source) throw new Error(`Missing source module ${fileName}`)
	const moduleSymbol = checker.getSymbolAtLocation(source)
	if (!moduleSymbol) throw new Error(`Missing module symbol ${fileName}`)
	const exports = new Map(checker.getExportsOfModule(moduleSymbol).map((symbol) => [symbol.name, symbol]))
	for (const name of names) {
		const symbol = exports.get(name)
		if (!symbol) throw new Error(`Missing root export ${name}`)
		selectSymbol(symbol)
	}
}

while (queue.length > 0) {
	const { statement } = queue.shift()!
	function visit(node: ts.Node): void {
		if (ts.isIdentifier(node)) selectSymbol(checker.getSymbolAtLocation(node))
		ts.forEachChild(node, visit)
	}
	visit(statement)
}

function importedBindingUsed(binding: ts.Declaration): boolean {
	return usedImports.has(binding)
}

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })

function replaceRequired(value: string, search: string, replacement: string, label: string): string {
	if (!value.includes(search)) throw new Error(`Could not apply standalone cleanup ${label}`)
	return value.replace(search, replacement)
}

function cleanGeneratedModule(source: ts.SourceFile, initial: string): string {
	let value = initial
	if (basename(source.fileName) === "album-artwork-palette-v2.ts") {
		value = replaceRequired(value, `export const ALBUM_ARTWORK_PALETTE_V2_RECALL_AUDIT_ARMS = Object.freeze([
	"control-0.7.2",
	"all-existing-representative-strategies",
	"all-retained-representative-cross-pairs",
	"widened-field-hypothesis-retention",
	"widened-family-lane-retention",
] as const)

export type AlbumArtworkPaletteV2RecallAuditArm =
	typeof ALBUM_ARTWORK_PALETTE_V2_RECALL_AUDIT_ARMS[number]`, `export type AlbumArtworkPaletteV2RecallAuditArm =
	"control-0.7.2" |
	"all-existing-representative-strategies" |
	"all-retained-representative-cross-pairs" |
	"widened-field-hypothesis-retention" |
	"widened-family-lane-retention"`, "type-only recall arms")
		value = replaceRequired(value, `export const ALBUM_ARTWORK_PALETTE_V2_RECALL_CUSTODY_STAGES = Object.freeze([
	"discovered-family",
	"lane-retention",
	"field-hypothesis-proposal",
	"field-hypothesis-retention",
	"representative-pairing",
	"field-conditional-role-eligibility",
	"complete-treatment-construction",
	"ordinary-pareto-membership",
	"complete-domain-guard",
	"public-slate-retention",
] as const)

export type AlbumArtworkPaletteV2RecallCustodyStage =
	typeof ALBUM_ARTWORK_PALETTE_V2_RECALL_CUSTODY_STAGES[number]`, `export type AlbumArtworkPaletteV2RecallCustodyStage =
	"discovered-family" |
	"lane-retention" |
	"field-hypothesis-proposal" |
	"field-hypothesis-retention" |
	"representative-pairing" |
	"field-conditional-role-eligibility" |
	"complete-treatment-construction" |
	"ordinary-pareto-membership" |
	"complete-domain-guard" |
	"public-slate-retention"`, "type-only recall stages")
	}
	if (basename(source.fileName) === "album-artwork-palette-v2-phase-3-final-candidate.ts") {
		value = replaceRequired(value, `\n\texcludedWinnerAuthorities: Object.freeze([
		"rejected-source-light-foreground-reserve",
		"rejected-combined-v3-path-bound-winner",
	] as const),`, "", "rejected-authority configuration")
		value = replaceRequired(value,
			`\n\texcludedWinnerAuthorities: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION.excludedWinnerAuthorities`,
			"", "rejected-authority type")
		value = replaceRequired(value, `\n\t\t\t\texcludedWinnerAuthorities:
	\t\t\t\tALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION.excludedWinnerAuthorities,`,
			"", "rejected-authority result")
	}
	return value
}

function retainedImport(node: ts.ImportDeclaration): ts.ImportDeclaration | null {
	const clause = node.importClause
	if (!clause) return node
	const defaultName = clause.name && importedBindingUsed(clause) ? clause.name : undefined
	let bindings: ts.NamedImportBindings | undefined
	if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
		if (importedBindingUsed(clause.namedBindings)) bindings = clause.namedBindings
	} else if (clause.namedBindings) {
		const elements = clause.namedBindings.elements.filter(importedBindingUsed)
		if (elements.length > 0) bindings = ts.factory.updateNamedImports(clause.namedBindings, elements)
	}
	if (!defaultName && !bindings) return null
	const updatedClause = ts.factory.updateImportClause(clause, clause.isTypeOnly, defaultName, bindings)
	return ts.factory.updateImportDeclaration(node, node.modifiers, updatedClause,
		node.moduleSpecifier, node.attributes)
}

await rm(outputRoot, { recursive: true, force: true })
await mkdir(outputRoot, { recursive: true })

const emitted: string[] = []
for (const source of [...selected.keys()].sort((first, second) =>
	first.fileName.localeCompare(second.fileName, "en"))) {
	const imports = source.statements
		.filter(ts.isImportDeclaration)
		.map(retainedImport)
		.filter((value): value is ts.ImportDeclaration => value !== null)
	const statements = source.statements.filter((statement) => selected.get(source)!.has(statement))
	const body = cleanGeneratedModule(source, [
		...imports.map((node) => printer.printNode(ts.EmitHint.Unspecified, node, source)),
		...statements.map((node) => node.getText(source)),
	].join("\n\n"))
	const outputFile = resolve(outputRoot, basename(source.fileName))
	await writeFile(outputFile, `${body}\n`)
	emitted.push(relative(resolve(packageRoot, "research/v2-2"), outputFile))
}

const inventory = `${emitted.join("\n")}\n`
await writeFile(resolve(outputRoot, "inventory.txt"), inventory)
process.stdout.write(`Vendored ${emitted.length} runtime modules into ${relative(packageRoot, outputRoot)}\n`)
