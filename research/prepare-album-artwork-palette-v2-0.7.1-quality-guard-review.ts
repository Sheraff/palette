import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_7_1_QUALITY_GUARD_REVIEW_VERSION,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_4_PRESENTATION_VERSION,
	phase4ReviewManifestId,
	type Phase4PrivateReviewCase,
} from "./src/album-artwork-palette-v2-phase-4-review.ts"
import type { CompletePaletteTreatment } from "./src/album-artwork-palette-v2.ts"

type Role = "background" | "surface" | "foreground" | "accent"
type SourceArtifact = Readonly<{
	source: Readonly<{
		caseId: string
		path: string
		sha256: string
		byteCount: number
	}>
	extraction: Readonly<{ winner: CompletePaletteTreatment }>
	presentations: ReadonlyArray<Readonly<{
		treatmentId: string
		roles: Readonly<Record<Role, Readonly<{ nearestName: string }>>>
	}>>
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
type PriorReviewManifest = Readonly<{
	manifestId: string
	cases: ReadonlyArray<Readonly<{
		caseId: string
		source: Readonly<{ sha256: string }>
		assignment: Readonly<Record<"A" | "B", "candidate" | "baseline">>
	}>>
}>
type PriorReviewAnalysis = Readonly<{
	manifestId: string
	caseResults: ReadonlyArray<Readonly<{
		caseId: string
		sourceSha256: string
		candidateQuality: string
		predecessorQuality: string
		relativeOutcome: string
	}>>
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const currentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.7.1-development")
const failedDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.7.0-development")
const baselineDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.6.0-development")
const outputPath = resolve(currentDirectory, "quality-guard-review-manifest.private.json")
const preparationPath = resolve(currentDirectory, "quality-guard-review-preparation.json")
const protocolPath = resolve(moduleDirectory, "ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_7_1_QUALITY_GUARD_REVIEW.md")
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

const [currentRaw, failedRaw, baselineRaw, summaryRaw, priorManifestRaw, priorAnalysisRaw, protocolRaw] = await Promise.all([
	readFile(resolve(currentDirectory, "aggregate.json"), "utf8"),
	readFile(resolve(failedDirectory, "aggregate.json"), "utf8"),
	readFile(resolve(baselineDirectory, "aggregate.json"), "utf8"),
	readFile(resolve(currentDirectory, "summary.json"), "utf8"),
	readFile(resolve(failedDirectory, "identity-obligation-review-manifest.private.json"), "utf8"),
	readFile(resolve(failedDirectory, "identity-obligation-review-analysis.json"), "utf8"),
	readFile(protocolPath, "utf8"),
])
const current = JSON.parse(currentRaw) as Aggregate
const failed = JSON.parse(failedRaw) as Aggregate
const baseline = JSON.parse(baselineRaw) as Aggregate
const summary = JSON.parse(summaryRaw) as Aggregate
const priorManifest = JSON.parse(priorManifestRaw) as PriorReviewManifest
const priorAnalysis = JSON.parse(priorAnalysisRaw) as PriorReviewAnalysis
if (current.candidateVersion !== "album-artwork-first-principles-0.7.1" ||
	failed.candidateVersion !== "album-artwork-first-principles-0.7.0" ||
	baseline.candidateVersion !== "album-artwork-first-principles-0.6.0" ||
	current.sourceCount !== 28 || failed.sourceCount !== 28 || baseline.sourceCount !== 28 ||
	current.developmentManifestId !== failed.developmentManifestId ||
	current.developmentManifestId !== baseline.developmentManifestId ||
	current.implementationHash !== summary.implementationHash || current.scientificSha256 !== summary.scientificSha256 ||
	summary.identityObligationGate?.pass !== true || priorManifest.manifestId !== priorAnalysis.manifestId) {
	throw new Error("The 0.7.1 quality-guard development run is not eligible for bounded review")
}

const failedByCase = new Map(failed.cases.map((entry) => [entry.source.caseId, entry]))
const baselineByCase = new Map(baseline.cases.map((entry) => [entry.source.caseId, entry]))
const priorReviewedCaseIds = new Set(priorManifest.cases.map(({ caseId }) => caseId))
const priorResultByCase = new Map(priorAnalysis.caseResults.map((result) => [result.caseId, result]))
const changedFromFailed: string[] = []
const changedFromBaseline: SourceArtifact[] = []
const transferred: Array<Readonly<{
	caseId: string
	sourceSha256: string
	candidateQuality: string
	predecessorQuality: string
	relativeOutcome: string
}>> = []
const fresh: SourceArtifact[] = []
for (const entry of current.cases) {
	const failedEntry = failedByCase.get(entry.source.caseId)
	const baselineEntry = baselineByCase.get(entry.source.caseId)
	if (!failedEntry || !baselineEntry || failedEntry.source.sha256 !== entry.source.sha256 ||
		baselineEntry.source.sha256 !== entry.source.sha256) throw new Error(`Predecessor mismatch for ${entry.source.caseId}`)
	if (treatmentKey(entry.extraction.winner) !== treatmentKey(failedEntry.extraction.winner)) {
		changedFromFailed.push(entry.source.caseId)
	}
	if (treatmentKey(entry.extraction.winner) === treatmentKey(baselineEntry.extraction.winner)) continue
	changedFromBaseline.push(entry)
	const priorResult = priorResultByCase.get(entry.source.caseId)
	if (treatmentKey(entry.extraction.winner) === treatmentKey(failedEntry.extraction.winner) &&
		priorReviewedCaseIds.has(entry.source.caseId) && priorResult?.sourceSha256 === entry.source.sha256) {
		transferred.push({
			caseId: entry.source.caseId,
			sourceSha256: entry.source.sha256,
			candidateQuality: priorResult.candidateQuality,
			predecessorQuality: priorResult.predecessorQuality,
			relativeOutcome: priorResult.relativeOutcome,
		})
	} else {
		fresh.push(entry)
	}
}
if (fresh.length !== 3 || transferred.length !== 1 || changedFromBaseline.length !== 4) {
	throw new Error("The complete bounded quality-guard delta does not contain three fresh and one transferred treatment")
}

const orderKey = (entry: SourceArtifact): string => sha256([
	ALBUM_ARTWORK_PALETTE_V2_0_7_1_QUALITY_GUARD_REVIEW_VERSION,
	"order",
	current.developmentManifestId,
	entry.source.sha256,
].join("\0"))
const ordered = [...fresh].sort((first, second) => orderKey(first).localeCompare(orderKey(second)))
const cases: Phase4PrivateReviewCase[] = ordered.map((entry, order) => {
	const baselineEntry = baselineByCase.get(entry.source.caseId)!
	const candidateSide = order % 2 === 0 ? "A" : "B"
	return {
		caseId: entry.source.caseId,
		order,
		source: { file: entry.source.path, sha256: entry.source.sha256, bytes: entry.source.byteCount },
		options: candidateSide === "A"
			? { A: palette(entry), B: palette(baselineEntry) }
			: { A: palette(baselineEntry), B: palette(entry) },
		assignment: candidateSide === "A"
			? { A: "candidate", B: "baseline" }
			: { A: "baseline", B: "candidate" },
	}
})
const identity = {
	schemaVersion: 1 as const,
	reviewVersion: ALBUM_ARTWORK_PALETTE_V2_0_7_1_QUALITY_GUARD_REVIEW_VERSION,
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
	failedPredecessorVersion: failed.candidateVersion,
	baselineVersion: baseline.candidateVersion,
	developmentManifestId: current.developmentManifestId,
	changedFromFailedCount: changedFromFailed.length,
	changedFromBaselineCount: changedFromBaseline.length,
	exactBaselineMatchCount: current.sourceCount - changedFromBaseline.length,
	transferredExactReviewAssessments: transferred,
	freshReviewCaseCount: cases.length,
	candidateSideCounts: {
		A: cases.filter(({ assignment }) => assignment.A === "candidate").length,
		B: cases.filter(({ assignment }) => assignment.B === "candidate").length,
	},
	inputHashes: {
		currentAggregateSha256: sha256(currentRaw),
		failedAggregateSha256: sha256(failedRaw),
		baselineAggregateSha256: sha256(baselineRaw),
		currentSummarySha256: sha256(summaryRaw),
		priorReviewManifestSha256: sha256(priorManifestRaw),
		priorReviewAnalysisSha256: sha256(priorAnalysisRaw),
		reviewProtocolSha256: sha256(protocolRaw),
	},
	sourcePolicy: "fixed-authorized-development-panel-only; no directional sample execution",
}
const preparation = { ...preparationWithoutId, preparationId: sha256(canonicalJson(preparationWithoutId)) }
await Promise.all([atomicJson(outputPath, manifest), atomicJson(preparationPath, preparation)])
process.stdout.write(`Prepared ${cases.length} fresh quality-guard deltas and ${transferred.length} exact review transfer\n`)
