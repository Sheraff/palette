import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_4_PRESENTATION_VERSION,
	ALBUM_ARTWORK_PALETTE_V2_RANKING_REVIEW_VERSION,
	phase4ReviewManifestId,
	type Phase4PrivateReviewCase,
} from "./src/album-artwork-palette-v2-phase-4-review.ts"
import type { CompletePaletteTreatment } from "./src/album-artwork-palette-v2.ts"

type Role = "background" | "surface" | "foreground" | "accent"
type Presentation = Readonly<{
	treatmentId: string
	roles: Readonly<Record<Role, Readonly<{ nearestName: string }>>>
}>
type SourceArtifact = Readonly<{
	implementationHash: string
	source: Readonly<{ caseId: string; path: string; sha256: string; byteCount: number }>
	extraction: Readonly<{ winner: CompletePaletteTreatment }>
	presentations: readonly Presentation[]
}>
type Aggregate = Readonly<{
	candidateVersion: string
	implementationHash: string
	developmentManifestId: string
	scientificSha256: string
	cases: readonly SourceArtifact[]
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const currentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.5.1-development")
const predecessorDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.5.0-development")
const outputPath = resolve(currentDirectory, "ranking-review-manifest.private.json")
const preparationPath = resolve(currentDirectory, "ranking-review-preparation.json")
const ROLES = ["background", "surface", "foreground", "accent"] as const

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	const record = value as Record<string, unknown>
	return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
	await rename(temporary, path)
}

function treatmentKey(treatment: CompletePaletteTreatment): string {
	return [treatment.background.hex, treatment.surface.hex, treatment.foreground.hex, treatment.accent.hex,
		treatment.gradient ? "gradient" : "flat"].join(":")
}

function palette(artifact: SourceArtifact) {
	const treatment = artifact.extraction.winner
	const presentation = artifact.presentations.find(({ treatmentId }) => treatmentId === treatment.id)
	if (!presentation) throw new Error(`Missing winner presentation for ${artifact.source.caseId}`)
	return {
		roles: Object.fromEntries(ROLES.map((role) => [role, {
			hex: treatment[role].hex,
			nearestName: presentation.roles[role].nearestName,
			generated: treatment[role].generated,
		}])) as Record<Role, { hex: string; nearestName: string; generated: boolean }>,
		gradient: treatment.gradient,
		collapse: treatment.collapse,
	}
}

const [currentRaw, predecessorRaw, analysisRaw] = await Promise.all([
	readFile(resolve(currentDirectory, "aggregate.json"), "utf8"),
	readFile(resolve(predecessorDirectory, "aggregate.json"), "utf8"),
	readFile(resolve(currentDirectory, "development-analysis.json"), "utf8"),
])
const current = JSON.parse(currentRaw) as Aggregate
const predecessor = JSON.parse(predecessorRaw) as Aggregate
const analysis = JSON.parse(analysisRaw) as {
	mechanismGate: Readonly<{ pass: boolean }>
	mechanical: Readonly<{ changedWinnerCaseIds: readonly string[] }>
	futureSample: Readonly<{ opened: false }>
}
if (current.candidateVersion !== "album-artwork-first-principles-0.5.1" || !analysis.mechanismGate.pass ||
	analysis.futureSample.opened !== false || current.developmentManifestId !== predecessor.developmentManifestId) {
	throw new Error("The 0.5.1 ranking mechanism is not eligible for review")
}
const predecessorByCase = new Map(predecessor.cases.map((entry) => [entry.source.caseId, entry]))
const changed = current.cases.filter((entry) => {
	const old = predecessorByCase.get(entry.source.caseId)
	if (!old || old.source.sha256 !== entry.source.sha256) throw new Error(`Predecessor mismatch for ${entry.source.caseId}`)
	return treatmentKey(entry.extraction.winner) !== treatmentKey(old.extraction.winner)
})
const changedIds = changed.map(({ source }) => source.caseId)
if (canonicalJson(changedIds) !== canonicalJson(analysis.mechanical.changedWinnerCaseIds) || changed.length < 1) {
	throw new Error("Changed-winner set does not match the precommitted analysis")
}

const ordered = [...changed].sort((first, second) => sha256([
	ALBUM_ARTWORK_PALETTE_V2_RANKING_REVIEW_VERSION,
	current.developmentManifestId,
	first.source.sha256,
].join("\0")).localeCompare(sha256([
	ALBUM_ARTWORK_PALETTE_V2_RANKING_REVIEW_VERSION,
	current.developmentManifestId,
	second.source.sha256,
].join("\0"))))
const cases: Phase4PrivateReviewCase[] = ordered.map((entry, order) => {
	const old = predecessorByCase.get(entry.source.caseId)!
	const candidateSide = order % 2 === 0 ? "A" : "B"
	return {
		caseId: entry.source.caseId,
		order,
		source: { file: entry.source.path, sha256: entry.source.sha256, bytes: entry.source.byteCount },
		options: candidateSide === "A"
			? { A: palette(entry), B: palette(old) }
			: { A: palette(old), B: palette(entry) },
		assignment: candidateSide === "A"
			? { A: "candidate", B: "baseline" }
			: { A: "baseline", B: "candidate" },
	}
})
const identity = {
	schemaVersion: 1 as const,
	reviewVersion: ALBUM_ARTWORK_PALETTE_V2_RANKING_REVIEW_VERSION,
	presentationVersion: ALBUM_ARTWORK_PALETTE_V2_PHASE_4_PRESENTATION_VERSION,
	cases,
}
const manifest = { ...identity, manifestId: phase4ReviewManifestId(identity) }
const preparationWithoutId = {
	schemaVersion: 1,
	reviewVersion: manifest.reviewVersion,
	manifestId: manifest.manifestId,
	candidateVersion: current.candidateVersion,
	implementationHash: current.implementationHash,
	scientificSha256: current.scientificSha256,
	predecessorVersion: predecessor.candidateVersion,
	predecessorImplementationHash: predecessor.implementationHash,
	predecessorScientificSha256: predecessor.scientificSha256,
	changedWinnerCaseIds: changedIds,
	reviewCaseCount: cases.length,
	candidateSideCounts: {
		A: cases.filter(({ assignment }) => assignment.A === "candidate").length,
		B: cases.filter(({ assignment }) => assignment.B === "candidate").length,
	},
	inputHashes: {
		currentAggregateSha256: sha256(currentRaw),
		predecessorAggregateSha256: sha256(predecessorRaw),
		developmentAnalysisSha256: sha256(analysisRaw),
	},
	futureSampleOpened: false,
}
const preparation = { ...preparationWithoutId, preparationId: sha256(canonicalJson(preparationWithoutId)) }
await Promise.all([atomicJson(outputPath, manifest), atomicJson(preparationPath, preparation)])
process.stdout.write(`Prepared ${cases.length} blinded ranking deltas; candidate sides A/B ${preparation.candidateSideCounts.A}/${preparation.candidateSideCounts.B}\n`)
