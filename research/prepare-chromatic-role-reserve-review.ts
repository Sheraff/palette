import { createHash, randomUUID } from "node:crypto"
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { namePalette } from "./src/color-name.ts"
import {
	CHROMATIC_ROLE_REVIEW_PRESENTATION_VERSION,
	CHROMATIC_ROLE_REVIEW_VERSION,
	chromaticRoleReviewManifestId,
	chromaticRoleReviewRoles,
	type ChromaticRolePresentedPalette,
	type ChromaticRoleReviewEntry,
	type ChromaticRoleReviewManifest,
} from "./src/chromatic-role-review.ts"
import {
	parseChromaticRoleReserveProtocol,
	verifyChromaticRoleReserveImplementation,
} from "./src/chromatic-role-reserve.ts"
import type { CorpusResult, Palette, RoleName } from "./src/types.ts"

const [protocolArgument, evaluationArgument, outputArgument, ...unexpected] = process.argv.slice(2)
if (!protocolArgument || !evaluationArgument || !outputArgument || unexpected.length > 0) {
	throw new Error("Usage: prepare-chromatic-role-reserve-review.ts <protocol.json> <evaluation-dir> <manifest.json>")
}

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const protocolPath = resolve(protocolArgument)
const evaluationRoot = resolve(evaluationArgument)
const outputPath = resolve(outputArgument)
const protocol = parseChromaticRoleReserveProtocol(JSON.parse(await readFile(protocolPath, "utf8")) as unknown)
await verifyChromaticRoleReserveImplementation(protocol, projectRoot)

const implementationFiles = [
	"research/prepare-chromatic-role-reserve-review.ts",
	"research/serve-chromatic-role-review.ts",
	"research/src/chromatic-role-review.ts",
	"research/src/chromatic-role-reserve.ts",
	"research/src/chromatic-role-extract.ts",
	"research/src/chromatic-candidate-availability.ts",
	"research/src/candidates.ts",
	"research/src/guarded-palette.ts",
	"research/src/joint-palette.ts",
	"research/src/color-name.ts",
]
const presentationFiles = [
	"research/chromatic-role-review/index.html",
	"research/chromatic-role-review/app.js",
	"research/chromatic-role-review/styles.css",
]

type Inventory = {
	protocolId: string
	entries: Array<{
		file: string
		sha256: string
		bytes: number
		sourceWidth: number
		sourceHeight: number
		normalizedWidth: number
		normalizedHeight: number
	}>
}

type Evaluation = {
	protocolId: string
	materialChanges: { count: number; files: Array<{ file: string; materialChanges: string[] }> }
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

async function fileHashes(files: string[]): Promise<Record<string, string>> {
	return Object.fromEntries(await Promise.all(files.map(async (file) => [file, sha256(await readFile(resolve(projectRoot, file)))])))
}

function exactPaletteMatch(first: Palette, second: Palette): boolean {
	return first.gradient.isGradient === second.gradient.isGradient && chromaticRoleReviewRoles.every((role) =>
		first[role].hex.toLowerCase() === second[role].hex.toLowerCase() && first[role].generated === second[role].generated)
}

function presentPalette(palette: Palette): ChromaticRolePresentedPalette {
	const names = namePalette(chromaticRoleReviewRoles.map((role) => palette[role].rgb))
	return {
		roles: Object.fromEntries(chromaticRoleReviewRoles.map((role, index) => [role, {
			rgb: palette[role].rgb,
			hex: palette[role].hex.toLowerCase(),
			nearestName: names[index].nearestName,
			generated: palette[role].generated,
			sourceDistance: palette[role].sourceDistance,
		}])) as ChromaticRolePresentedPalette["roles"],
		gradient: { isGradient: palette.gradient.isGradient, confidence: palette.gradient.confidence },
		metrics: palette.metrics,
	}
}

async function writeExclusiveJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true })
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	try {
		await link(temporary, path)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Refusing to overwrite ${path}`)
		throw error
	} finally {
		await rm(temporary, { force: true })
	}
}

const [inventorySource, evaluationSource, baselineSource, candidateSource] = await Promise.all([
	readFile(join(evaluationRoot, "inventory.json")),
	readFile(join(evaluationRoot, "evaluation.json")),
	readFile(join(evaluationRoot, "baseline-results.json")),
	readFile(join(evaluationRoot, "candidate-results.json")),
])
const inventory = JSON.parse(inventorySource.toString("utf8")) as Inventory
const evaluation = JSON.parse(evaluationSource.toString("utf8")) as Evaluation
const baseline = JSON.parse(baselineSource.toString("utf8")) as CorpusResult
const candidate = JSON.parse(candidateSource.toString("utf8")) as CorpusResult
if (inventory.protocolId !== protocol.protocolId || evaluation.protocolId !== protocol.protocolId ||
	baseline.algorithmVersion !== protocol.baselineAlgorithmVersion || candidate.algorithmVersion !== protocol.candidateAlgorithmVersion) {
	throw new Error("Reserve evaluation provenance does not match the protocol")
}

const baselineByFile = new Map(baseline.entries.map((entry) => [entry.file, entry.extraction.methods.spatial]))
const candidateByFile = new Map(candidate.entries.map((entry) => [entry.file, entry.extraction.methods.spatial]))
const inventoryByFile = new Map(inventory.entries.map((entry) => [entry.file, entry]))
const materialByFile = new Map(evaluation.materialChanges.files.map((entry) => [entry.file, entry.materialChanges]))
if (materialByFile.size !== evaluation.materialChanges.count) throw new Error("Reserve material-change list is inconsistent")
if (materialByFile.size === 0) throw new Error("Reserve candidate has no material changes to review")
if (materialByFile.size > protocol.review.maximumCasesPerBatch) {
	throw new Error(`Reserve has ${materialByFile.size} material changes; multiple predeclared review batches are required`)
}

const selectedFiles = [...materialByFile.keys()]
if (selectedFiles.length < protocol.review.minimumCasesPerBatch) {
	const controls = baseline.entries.filter((entry) => !materialByFile.has(entry.file) &&
		exactPaletteMatch(entry.extraction.methods.spatial, candidateByFile.get(entry.file)!))
		.sort((first, second) => sha256(`${protocol.protocolId}\0${first.file}`).localeCompare(
			sha256(`${protocol.protocolId}\0${second.file}`), "en"))
	for (const control of controls.slice(0, protocol.review.minimumCasesPerBatch - selectedFiles.length)) {
		selectedFiles.push(control.file)
	}
}
if (selectedFiles.length < protocol.review.minimumCasesPerBatch) throw new Error("Reserve cannot supply enough exact controls")

const entries: ChromaticRoleReviewEntry[] = selectedFiles.map((file) => {
	const source = inventoryByFile.get(file)
	const baselinePalette = baselineByFile.get(file)
	const candidatePalette = candidateByFile.get(file)
	if (!source || !baselinePalette || !candidatePalette) throw new Error(`Reserve review source is incomplete: ${file}`)
	const baselineFirst = Number.parseInt(sha256(`${CHROMATIC_ROLE_REVIEW_VERSION}\0${source.sha256}`).slice(0, 2), 16) % 2 === 0
	const materialRoles = (materialByFile.get(file) ?? []).filter((role): role is RoleName =>
		chromaticRoleReviewRoles.includes(role as RoleName))
	return {
		caseId: `cr-${sha256(`${CHROMATIC_ROLE_REVIEW_VERSION}\0${source.sha256}`).slice(0, 20)}`,
		cohort: "reserve-validation",
		source: { file, sha256: source.sha256, bytes: source.bytes, width: source.sourceWidth, height: source.sourceHeight },
		normalized: { width: source.normalizedWidth, height: source.normalizedHeight },
		changedRoles: materialRoles,
		options: baselineFirst
			? { A: presentPalette(baselinePalette), B: presentPalette(candidatePalette) }
			: { A: presentPalette(candidatePalette), B: presentPalette(baselinePalette) },
		assignment: baselineFirst ? { A: "baseline", B: "candidate" } : { A: "candidate", B: "baseline" },
	}
})
entries.sort((first, second) => sha256(`order\0${protocol.protocolId}\0${first.caseId}`).localeCompare(
	sha256(`order\0${protocol.protocolId}\0${second.caseId}`), "en"))
const identity: Omit<ChromaticRoleReviewManifest, "generatedAt" | "manifestId"> = {
	schemaVersion: 1,
	reviewVersion: CHROMATIC_ROLE_REVIEW_VERSION,
	presentationVersion: CHROMATIC_ROLE_REVIEW_PRESENTATION_VERSION,
	baselineAlgorithmVersion: baseline.algorithmVersion,
	candidateAlgorithmVersion: candidate.algorithmVersion,
	provenance: {
		sourceSelectionSha256: sha256(JSON.stringify(selectedFiles)),
		baselineHoldoutSha256: sha256(baselineSource),
		candidateHoldoutSha256: sha256(candidateSource),
		implementation: await fileHashes(implementationFiles),
		presentation: await fileHashes(presentationFiles),
	},
	entries,
}
const manifest: ChromaticRoleReviewManifest = {
	...identity,
	generatedAt: new Date().toISOString(),
	manifestId: chromaticRoleReviewManifestId(identity),
}
await writeExclusiveJson(outputPath, manifest)
process.stderr.write(`Prepared ${entries.length} reserve review cases (${materialByFile.size} material) at ${relative(projectRoot, outputPath)}\n`)
