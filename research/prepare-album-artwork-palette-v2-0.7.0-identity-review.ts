import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_7_0_IDENTITY_REVIEW_VERSION,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_4_PRESENTATION_VERSION,
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
	source: Readonly<{
		caseId: string
		path: string
		sha256: string
		byteCount: number
		cohort: "stress" | "dataset"
	}>
	extraction: Readonly<{
		version: string
		winner: CompletePaletteTreatment
		diagnostics: Readonly<{
			identityObligationGraph: Readonly<{
				winnerExplanation: Readonly<{
					coveredObligationIds: readonly string[]
					maximumCompleteTreatmentCoverage: number
				}>
			}>
		}>
	}>
	presentations: readonly Presentation[]
}>
type Aggregate = Readonly<{
	candidateVersion: string
	implementationHash: string
	developmentManifestId: string
	scientificSha256: string
	sourceCount: number
	identityObligationGate?: Readonly<{ pass: boolean }>
	cases: readonly SourceArtifact[]
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const currentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.7.0-development")
const predecessorDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.6.0-development")
const outputPath = resolve(currentDirectory, "identity-obligation-review-manifest.private.json")
const preparationPath = resolve(currentDirectory, "identity-obligation-review-preparation.json")
const protocolPath = resolve(moduleDirectory, "ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_7_0_IDENTITY_REVIEW.md")
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
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	await rename(temporary, path)
}

function treatmentKey(treatment: CompletePaletteTreatment): string {
	return [
		treatment.background.hex,
		treatment.surface.hex,
		treatment.foreground.hex,
		treatment.accent.hex,
		treatment.gradient ? "gradient" : "flat",
	].join(":")
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

const [currentRaw, predecessorRaw, summaryRaw, protocolRaw] = await Promise.all([
	readFile(resolve(currentDirectory, "aggregate.json"), "utf8"),
	readFile(resolve(predecessorDirectory, "aggregate.json"), "utf8"),
	readFile(resolve(currentDirectory, "summary.json"), "utf8"),
	readFile(protocolPath, "utf8"),
])
const current = JSON.parse(currentRaw) as Aggregate
const predecessor = JSON.parse(predecessorRaw) as Aggregate
const summary = JSON.parse(summaryRaw) as Aggregate
if (current.candidateVersion !== "album-artwork-first-principles-0.7.0" ||
	predecessor.candidateVersion !== "album-artwork-first-principles-0.6.0" ||
	current.sourceCount !== 28 || predecessor.sourceCount !== 28 ||
	current.developmentManifestId !== predecessor.developmentManifestId ||
	current.implementationHash !== summary.implementationHash ||
	current.scientificSha256 !== summary.scientificSha256 ||
	summary.identityObligationGate?.pass !== true) {
	throw new Error("The 0.7.0 identity-obligation development run is not eligible for review")
}

const predecessorByCase = new Map(predecessor.cases.map((entry) => [entry.source.caseId, entry]))
const changed = current.cases.filter((entry) => {
	const old = predecessorByCase.get(entry.source.caseId)
	if (!old || old.source.sha256 !== entry.source.sha256) throw new Error(`Predecessor mismatch for ${entry.source.caseId}`)
	const explanation = entry.extraction.diagnostics.identityObligationGraph.winnerExplanation
	if (explanation.coveredObligationIds.length !== explanation.maximumCompleteTreatmentCoverage) {
		throw new Error(`Identity-obligation coverage is stale for ${entry.source.caseId}`)
	}
	return treatmentKey(entry.extraction.winner) !== treatmentKey(old.extraction.winner)
})
const selectionKey = (entry: SourceArtifact): string => sha256([
	ALBUM_ARTWORK_PALETTE_V2_0_7_0_IDENTITY_REVIEW_VERSION,
	"selection",
	current.developmentManifestId,
	entry.source.sha256,
].join("\0"))
const stress = changed.filter(({ source }) => source.cohort === "stress")
	.sort((first, second) => selectionKey(first).localeCompare(selectionKey(second))).slice(0, 8)
const dataset = changed.filter(({ source }) => source.cohort === "dataset")
	.sort((first, second) => selectionKey(first).localeCompare(selectionKey(second))).slice(0, 4)
if (stress.length !== 8 || dataset.length !== 4) throw new Error("Changed-winner cohort coverage is insufficient for review")
const orderKey = (entry: SourceArtifact): string => sha256([
	ALBUM_ARTWORK_PALETTE_V2_0_7_0_IDENTITY_REVIEW_VERSION,
	"order",
	current.developmentManifestId,
	entry.source.sha256,
].join("\0"))
const ordered = [...stress, ...dataset].sort((first, second) => orderKey(first).localeCompare(orderKey(second)))
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
	reviewVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_0_IDENTITY_REVIEW_VERSION,
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
	developmentManifestId: current.developmentManifestId,
	changedWinnerCount: changed.length,
	changedWinnerCohorts: {
		stress: changed.filter(({ source }) => source.cohort === "stress").length,
		dataset: changed.filter(({ source }) => source.cohort === "dataset").length,
	},
	selectedCohorts: { stress: stress.length, dataset: dataset.length },
	reviewCaseCount: cases.length,
	candidateSideCounts: {
		A: cases.filter(({ assignment }) => assignment.A === "candidate").length,
		B: cases.filter(({ assignment }) => assignment.B === "candidate").length,
	},
	inputHashes: {
		currentAggregateSha256: sha256(currentRaw),
		predecessorAggregateSha256: sha256(predecessorRaw),
		currentSummarySha256: sha256(summaryRaw),
		reviewProtocolSha256: sha256(protocolRaw),
	},
	sourcePolicy: "fixed-authorized-development-panel-only; no directional sample execution",
}
const preparation = { ...preparationWithoutId, preparationId: sha256(canonicalJson(preparationWithoutId)) }
await Promise.all([atomicJson(outputPath, manifest), atomicJson(preparationPath, preparation)])
process.stdout.write(`Prepared ${cases.length} blinded identity-obligation deltas; candidate sides A/B ${preparation.candidateSideCounts.A}/${preparation.candidateSideCounts.B}\n`)
