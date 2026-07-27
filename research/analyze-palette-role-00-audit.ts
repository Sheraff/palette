import { createHash, randomUUID } from "node:crypto"
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { computeSemanticResultsSha256, selectionTracks, validateSelectionManifest } from "./src/corpus-selection.ts"
import {
	PALETTE_ROLE_00_AUDIT_ALGORITHM_VERSION,
	PALETTE_ROLE_00_CANONICAL_ENTRY_COUNT,
	paletteRole00AuditImplementationFiles,
	paletteRole00AuditOverallQualityValues,
	paletteRole00AuditPresentationFiles,
	paletteRole00AuditSkipReasonValues,
	parsePaletteRole00AuditFeedbackStore,
	parsePaletteRole00AuditManifest,
	validatePaletteRole00AuditSample,
} from "./src/palette-role-00-audit.ts"
import type { CorpusResult } from "./src/types.ts"

const [manifestArgument, feedbackArgument, outputArgument, ...unexpected] = process.argv.slice(2)
if (!manifestArgument || !feedbackArgument || !outputArgument || unexpected.length > 0) {
	throw new Error("Usage: analyze-palette-role-00-audit.ts <manifest.json> <feedback.json> <analysis.json>")
}

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const manifestPath = resolve(manifestArgument)
const feedbackPath = resolve(feedbackArgument)
const outputPath = resolve(outputArgument)

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function zeroCounts<T extends string>(values: readonly T[]): Record<T, number> {
	return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>
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

const [manifestSource, feedbackSource] = await Promise.all([
	readFile(manifestPath),
	readFile(feedbackPath),
])
const manifest = parsePaletteRole00AuditManifest(JSON.parse(manifestSource.toString("utf8")) as unknown)
const feedback = parsePaletteRole00AuditFeedbackStore(JSON.parse(feedbackSource.toString("utf8")) as unknown, manifest)

for (const file of [...paletteRole00AuditImplementationFiles, ...paletteRole00AuditPresentationFiles]) {
	const expected = manifest.provenance.implementation[file] ?? manifest.provenance.presentation[file]
	if (!expected || sha256(await readFile(resolve(projectRoot, file))) !== expected) {
		throw new Error(`Bound audit file changed after preparation: ${file}`)
	}
}
const [holdoutSource, selectionSource] = await Promise.all([
	readFile(resolve(researchRoot, "data/holdout-results.json")),
	readFile(resolve(researchRoot, "data/selection.json")),
])
if (sha256(holdoutSource) !== manifest.provenance.canonicalHoldout.rawSha256 ||
	sha256(selectionSource) !== manifest.provenance.sourceSelection.rawSha256) {
	throw new Error("Canonical audit artifacts changed after preparation")
}
const holdout = JSON.parse(holdoutSource.toString("utf8")) as CorpusResult
const selectionValue: unknown = JSON.parse(selectionSource.toString("utf8"))
if (holdout.algorithmVersion !== PALETTE_ROLE_00_AUDIT_ALGORITHM_VERSION ||
	holdout.entries.length !== PALETTE_ROLE_00_CANONICAL_ENTRY_COUNT ||
	computeSemanticResultsSha256(holdout) !== manifest.provenance.canonicalHoldout.semanticSha256) {
	throw new Error("Canonical holdout semantic provenance changed after preparation")
}
validateSelectionManifest(selectionValue, holdout, sha256(holdoutSource))
if (selectionValue.manifestId !== manifest.provenance.sourceSelection.manifestId) {
	throw new Error("Source selection identity changed after preparation")
}
validatePaletteRole00AuditSample(manifest, selectionValue)
for (const entry of manifest.entries) {
	const bytes = await readFile(resolve(projectRoot, entry.source.file))
	if (bytes.byteLength !== entry.source.bytes || sha256(bytes) !== entry.source.sha256) {
		throw new Error(`Selected source changed after audit preparation: ${entry.source.file}`)
	}
}

const skipReasons = zeroCounts(paletteRole00AuditSkipReasonValues)
const overallQuality = zeroCounts(paletteRole00AuditOverallQualityValues)
for (const entry of feedback.entries) {
	if (entry.skipReason) skipReasons[entry.skipReason]++
	else overallQuality[entry.overallQuality!]++
}

const feedbackByCase = new Map(feedback.entries.map((entry) => [entry.caseId, entry]))
const coverageByBatch = Array.from({ length: manifest.totalBatches }, (_, index) => {
	const batch = index + 1
	const batchEntries = manifest.entries.filter((entry) => entry.batch === batch)
	return {
		batch,
		total: batchEntries.length,
		reviewed: batchEntries.filter((entry) => feedbackByCase.has(entry.caseId)).length,
	}
})
const coverageBySampleTrack = Object.fromEntries(selectionTracks.map((track) => {
	const cases = manifest.entries.filter((entry) => entry.sampleTrack === track)
	const reviewed = cases.map((entry) => feedbackByCase.get(entry.caseId)).filter((entry) => entry !== undefined)
	return [track, {
		total: cases.length,
		reviewed: reviewed.length,
		rated: reviewed.filter((entry) => entry.overallQuality !== null).length,
		skipped: reviewed.filter((entry) => entry.skipReason !== null).length,
	}]
}))
const analysis = {
	schemaVersion: 1,
	analysisVersion: "palette-role-00-audit-analysis-0.2.0-development",
	generatedAt: new Date().toISOString(),
	auditVersion: manifest.auditVersion,
	manifestId: manifest.manifestId,
	algorithmVersion: manifest.algorithmVersion,
	developmentAudit: true,
	provenance: {
		manifestSha256: sha256(manifestSource),
		feedbackSha256: sha256(feedbackSource),
		canonicalHoldoutRawSha256: manifest.provenance.canonicalHoldout.rawSha256,
		canonicalHoldoutSemanticSha256: manifest.provenance.canonicalHoldout.semanticSha256,
		sourceSelectionManifestId: manifest.provenance.sourceSelection.manifestId,
	},
	coverage: {
		total: manifest.entries.length,
		reviewed: feedback.entries.length,
		unreviewed: manifest.entries.length - feedback.entries.length,
		fraction: feedback.entries.length / manifest.entries.length,
		batches: coverageByBatch,
		sampleTracks: coverageBySampleTrack,
	},
	rated: feedback.entries.filter((entry) => entry.overallQuality !== null).length,
	skipped: feedback.entries.filter((entry) => entry.skipReason !== null).length,
	skipReasons,
	overallQuality,
	entries: manifest.entries.map((entry) => ({
		caseId: entry.caseId,
		order: entry.order,
		batch: entry.batch,
		sampleTrack: entry.sampleTrack,
		file: entry.source.file,
		feedback: feedbackByCase.get(entry.caseId) ?? null,
	})),
}
await writeExclusiveJson(outputPath, analysis)
process.stderr.write(
	`Analyzed ${feedback.entries.length}/${manifest.entries.length} palette role 00 audit entries at ${relative(projectRoot, outputPath)}\n`,
)
