import { createHash, randomUUID } from "node:crypto"
import { link, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { dirname, extname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { validateCandidateHoldoutArtifacts } from "./src/candidate-validation.ts"
import { okDistance, rgbToOKLab } from "./src/color.ts"
import { roleNames } from "./src/candidate-comparison.ts"
import {
	CHROMATIC_ROLE_ALGORITHM_VERSION,
	extractChromaticRolePalette,
	type ChromaticRoleCertificate,
} from "./src/chromatic-role-extract.ts"
import {
	parseChromaticRoleReserveProtocol,
	verifyChromaticRoleReserveImplementation,
} from "./src/chromatic-role-reserve.ts"
import { loadImage } from "./src/image.ts"
import {
	extractRegionGraph017Palette as extractPalette,
	REGION_GRAPH_0_17_ALGORITHM_VERSION as ALGORITHM_VERSION,
} from "./src/region-graph-0.17-extract.ts"
import type { CorpusResult, Palette } from "./src/types.ts"

const [protocolArgument, outputArgument, ...unexpected] = process.argv.slice(2)
if (!protocolArgument || !outputArgument || unexpected.length > 0) {
	throw new Error("Usage: evaluate-chromatic-role-reserve.ts <protocol.json> <output-dir>")
}

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const protocolPath = resolve(protocolArgument)
const outputRoot = resolve(outputArgument)
const protocol = parseChromaticRoleReserveProtocol(JSON.parse(await readFile(protocolPath, "utf8")) as unknown)
await verifyChromaticRoleReserveImplementation(protocol, projectRoot)
if (ALGORITHM_VERSION !== protocol.baselineAlgorithmVersion ||
	CHROMATIC_ROLE_ALGORITHM_VERSION !== protocol.candidateAlgorithmVersion) {
	throw new Error("Reserve protocol algorithm versions do not match the runtime")
}

const reserveRoot = join(projectRoot, protocol.reserveDirectory)
const supported = new Set(protocol.sourceRule.supportedExtensions)

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function artworkId(file: string): string {
	return file.startsWith("ab67616d") ? file.slice(16) : file
}

function sourcePreference(file: string): number {
	if (file.startsWith(protocol.sourceRule.preferredSourceOrder[0])) return 2
	if (file.startsWith(protocol.sourceRule.preferredSourceOrder[1])) return 1
	return 0
}

function materialChanges(baseline: Palette, candidate: Palette): string[] {
	const changed: string[] = roleNames.filter((role) =>
		okDistance(rgbToOKLab(baseline[role].rgb), rgbToOKLab(candidate[role].rgb)) >
		protocol.comparison.roleOKLabDistanceExclusive)
	if (baseline.gradient.isGradient !== candidate.gradient.isGradient) changed.push("gradient")
	return changed
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

const sourceByArtwork = new Map<string, string>()
for (const file of (await readdir(reserveRoot)).filter((candidate) =>
	supported.has(extname(candidate).toLowerCase())).sort()) {
	const id = artworkId(file)
	const current = sourceByArtwork.get(id)
	if (!current || sourcePreference(file) > sourcePreference(current)) sourceByArtwork.set(id, file)
}
const files = [...sourceByArtwork.values()].sort()
if (files.length === 0) throw new Error("Reserve source inventory is empty")

const generatedAt = new Date().toISOString()
const baselineEntries: CorpusResult["entries"] = []
const candidateEntries: CorpusResult["entries"] = []
const certificates: Record<string, ChromaticRoleCertificate> = {}
const inventory: Array<{
	file: string
	artworkId: string
	sha256: string
	bytes: number
	sourceWidth: number
	sourceHeight: number
	normalizedWidth: number
	normalizedHeight: number
}> = []
const comparisons: Array<{ file: string; materialChanges: string[]; emittedTreatment: boolean }> = []

for (const [index, sourceFile] of files.entries()) {
	const file = `${protocol.reserveDirectory}/${sourceFile}`
	const bytes = await readFile(join(reserveRoot, sourceFile))
	const metadata = await sharp(bytes).metadata()
	if (!metadata.width || !metadata.height) throw new Error(`Could not read source dimensions for ${file}`)
	const image = await loadImage(bytes)
	const baselineExtraction = extractPalette(image)
	const candidate = extractChromaticRolePalette(image)
	baselineEntries.push({ file, kind: "holdout", review: false, width: image.width, height: image.height,
		extraction: baselineExtraction })
	candidateEntries.push({ file, kind: "holdout", review: false, width: image.width, height: image.height,
		extraction: candidate.extraction })
	certificates[file] = candidate.certificate
	inventory.push({ file, artworkId: artworkId(sourceFile), sha256: sha256(bytes), bytes: bytes.byteLength,
		sourceWidth: metadata.width, sourceHeight: metadata.height, normalizedWidth: image.width, normalizedHeight: image.height })
	comparisons.push({ file, materialChanges: materialChanges(baselineExtraction.methods.spatial,
		candidate.extraction.methods.spatial), emittedTreatment: candidate.certificate.decision.emittedTreatment })
	process.stderr.write(`[${index + 1}/${files.length}] ${file}\n`)
}

const baselineResults: CorpusResult = { generatedAt, algorithmVersion: ALGORITHM_VERSION, entries: baselineEntries }
const candidateResults: CorpusResult = {
	generatedAt,
	algorithmVersion: CHROMATIC_ROLE_ALGORITHM_VERSION,
	entries: candidateEntries,
}
const validation = validateCandidateHoldoutArtifacts(candidateResults, baselineResults, protocol.reserveDirectory)
const material = comparisons.filter((entry) => entry.materialChanges.length > 0)
const outputs: Array<[string, unknown]> = [
	["inventory.json", { schemaVersion: 1, protocolId: protocol.protocolId, reserveDirectory: protocol.reserveDirectory,
		generatedAt, entries: inventory }],
	["baseline-results.json", baselineResults],
	["candidate-results.json", candidateResults],
	["candidate-certificates.json", { schemaVersion: 1, protocolId: protocol.protocolId,
		algorithmVersion: CHROMATIC_ROLE_ALGORITHM_VERSION, entries: certificates }],
	["evaluation.json", {
		schemaVersion: 1,
		protocolId: protocol.protocolId,
		generatedAt,
		inventory: { files: files.length, deduplicatedArtworkIds: sourceByArtwork.size },
		availability: {
			available: Object.values(certificates).filter((certificate) => certificate.availability.selectedSupplements > 0).length,
			admitted: Object.values(certificates).filter((certificate) => certificate.decision.admittedSupplementIds.length > 0).length,
			emitted: Object.values(certificates).filter((certificate) => certificate.decision.emittedTreatment).length,
		},
		materialChanges: { count: material.length, files: material },
		validation,
	}],
]
for (const [file, value] of outputs) await writeExclusiveJson(join(outputRoot, file), value)
process.stderr.write(`Wrote reserve evaluation to ${relative(projectRoot, outputRoot)}\n`)
