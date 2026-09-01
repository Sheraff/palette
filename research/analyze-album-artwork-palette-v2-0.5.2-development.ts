import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	hasPeakAPCAObservability,
	pathObservability,
	treatmentFoundation,
	type CompletePaletteTreatment,
} from "./src/album-artwork-palette-v2.ts"

type SourceArtifact = Readonly<{
	implementationHash: string
	developmentManifestId: string
	openedFreshSealManifestId: string
	protectedFutureSampleManifestId: string
	source: Readonly<{ caseId: string; sha256: string }>
	extraction: Readonly<{
		version: string
		winner: CompletePaletteTreatment
		alternatives: readonly CompletePaletteTreatment[]
		diagnostics: Readonly<{
			completeCandidateCount: number
			paretoRanking: Readonly<{ frontierCandidateCount: number }>
		}>
	}>
}>

type Aggregate = Readonly<{
	candidateVersion: string
	implementationHash: string
	developmentManifestId: string
	scientificSha256: string
	cases: readonly SourceArtifact[]
}>

type ReviewPalette = Readonly<{
	roles: Readonly<Record<"background" | "surface" | "foreground" | "accent", Readonly<{ hex: string }>>>
	gradient: boolean
	collapse: Readonly<{ surface: boolean; accent: boolean }>
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const currentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.5.2-development")
const predecessorDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.5.0-development")
const failedDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.5.1-development")
const futureSamplePath = resolve(moduleDirectory, "data/album-artwork-palette-v2-future-sample-02.sealed.json")
const protocolPath = resolve(moduleDirectory, "ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_5_2.md")

function sha256(value: string | Uint8Array): string {
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
	return [treatment.background.hex, treatment.surface.hex, treatment.foreground.hex, treatment.accent.hex,
		treatment.gradient ? "gradient" : "flat", treatment.collapse.surface ? "surface-collapsed" : "surface-distinct",
		treatment.collapse.accent ? "accent-collapsed" : "accent-distinct"].join(":")
}

function paletteKey(palette: ReviewPalette): string {
	return [palette.roles.background.hex, palette.roles.surface.hex, palette.roles.foreground.hex, palette.roles.accent.hex,
		palette.gradient ? "gradient" : "flat", palette.collapse.surface ? "surface-collapsed" : "surface-distinct",
		palette.collapse.accent ? "accent-collapsed" : "accent-distinct"].join(":")
}

function roleSignedContrasts(treatment: CompletePaletteTreatment, role: "foreground" | "accent"): number[] {
	return treatment.contrast.pairs.filter((pair) => pair.role === role).map(({ signedLc }) => signedLc)
}

function activePathObservability(treatment: CompletePaletteTreatment): number {
	const foreground = pathObservability(roleSignedContrasts(treatment, "foreground"))
	const accentValues = roleSignedContrasts(treatment, "accent")
	const accent = accentValues.length === 0 ? foreground : pathObservability(accentValues)
	return Math.min(foreground, accent)
}

function mechanicallyValid(treatment: CompletePaletteTreatment): boolean {
	const foreground = roleSignedContrasts(treatment, "foreground")
	const accent = roleSignedContrasts(treatment, "accent")
	const observability = activePathObservability(treatment)
	const expectedFoundation = treatmentFoundation(
		treatment.scores.fieldStructure,
		treatment.scores.artworkIdentity,
		treatment.scores.foregroundUtility,
		observability,
	)
	return hasPeakAPCAObservability(foreground) &&
		(treatment.collapse.accent || hasPeakAPCAObservability(accent)) &&
		Math.abs(treatment.scores.activeRolePathObservability - observability) <= Number.EPSILON * 8 &&
		Math.abs(treatment.scores.treatmentFoundation - expectedFoundation) <= Number.EPSILON * 8
}

const [currentRaw, predecessorRaw, failedRaw, futureRaw, protocolRaw, reviewManifestRaw, reviewPreparationRaw,
	reviewAnalysisRaw] = await Promise.all([
	readFile(resolve(currentDirectory, "aggregate.json"), "utf8"),
	readFile(resolve(predecessorDirectory, "aggregate.json"), "utf8"),
	readFile(resolve(failedDirectory, "aggregate.json"), "utf8"),
	readFile(futureSamplePath, "utf8"),
	readFile(protocolPath, "utf8"),
	readFile(resolve(failedDirectory, "ranking-review-manifest.private.json"), "utf8"),
	readFile(resolve(failedDirectory, "ranking-review-preparation.json"), "utf8"),
	readFile(resolve(failedDirectory, "ranking-review-analysis.json"), "utf8"),
])
const current = JSON.parse(currentRaw) as Aggregate
const predecessor = JSON.parse(predecessorRaw) as Aggregate
const failed = JSON.parse(failedRaw) as Aggregate
const futureSample = JSON.parse(futureRaw) as {
	manifestId: string
	sealCommitment: string
	families: Array<{ variants: Array<{ sha256: string }> }>
}
const reviewManifest = JSON.parse(reviewManifestRaw) as {
	manifestId: string
	cases: Array<{
		caseId: string
		source: { sha256: string }
		options: Record<"A" | "B", ReviewPalette>
		assignment: Record<"A" | "B", "candidate" | "baseline">
	}>
}
const reviewPreparation = JSON.parse(reviewPreparationRaw) as {
	manifestId: string
	inputHashes: { currentAggregateSha256: string }
}
const reviewAnalysis = JSON.parse(reviewAnalysisRaw) as {
	manifestId: string
	inputHashes: { manifestSha256: string; preparationSha256: string }
	cases: Array<{ caseId: string; pass: boolean; candidateQuality: string; comparison: string }>
}
if (current.candidateVersion !== "album-artwork-first-principles-0.5.2" ||
	predecessor.candidateVersion !== "album-artwork-first-principles-0.5.0" ||
	failed.candidateVersion !== "album-artwork-first-principles-0.5.1" ||
	current.implementationHash === predecessor.implementationHash ||
	current.developmentManifestId !== predecessor.developmentManifestId || current.cases.length !== 28 ||
	predecessor.cases.length !== 28) throw new Error("0.5.2 aggregate binding is invalid")
if (reviewManifest.manifestId !== reviewPreparation.manifestId || reviewManifest.manifestId !== reviewAnalysis.manifestId ||
	reviewPreparation.inputHashes.currentAggregateSha256 !== sha256(failedRaw) ||
	reviewAnalysis.inputHashes.manifestSha256 !== sha256(reviewManifestRaw) ||
	reviewAnalysis.inputHashes.preparationSha256 !== sha256(reviewPreparationRaw)) {
	throw new Error("0.5.1 review-transfer binding is invalid")
}

const predecessorByCase = new Map(predecessor.cases.map((entry) => [entry.source.caseId, entry]))
const futureHashes = new Set(futureSample.families.flatMap(({ variants }) => variants.map(({ sha256 }) => sha256)))
const reviewByCase = new Map(reviewManifest.cases.map((entry) => [entry.caseId, entry]))
const reviewResultByCase = new Map(reviewAnalysis.cases.map((entry) => [entry.caseId, entry]))
const changedWinnerCaseIds: string[] = []
const changedGradientStateCaseIds: string[] = []
const changedFieldTreatmentCaseIds: string[] = []
const changedFullyObservablePredecessorCaseIds: string[] = []
const completeCandidateCountDeltaByCase: Record<string, number> = {}
const frontierCandidateCountDeltaByCase: Record<string, number> = {}
const reviewTransfers: Record<string, unknown> = {}
let retainedMixedZeroTreatmentCount = 0
let allTreatmentsValid = true
let allTransfersValid = true

for (const entry of current.cases) {
	const old = predecessorByCase.get(entry.source.caseId)
	if (!old || old.source.sha256 !== entry.source.sha256) throw new Error(`Predecessor mismatch for ${entry.source.caseId}`)
	if (entry.extraction.version !== current.candidateVersion || entry.implementationHash !== current.implementationHash ||
		entry.developmentManifestId !== current.developmentManifestId ||
		entry.openedFreshSealManifestId !== "3e85bab09130d0fb6c883ba1e4543fce841e1a94a6b63a6539aececb8f58cb91" ||
		entry.protectedFutureSampleManifestId !== futureSample.manifestId || futureHashes.has(entry.source.sha256)) {
		throw new Error(`Development custody mismatch for ${entry.source.caseId}`)
	}
	const candidateDelta = entry.extraction.diagnostics.completeCandidateCount - old.extraction.diagnostics.completeCandidateCount
	const frontierDelta = entry.extraction.diagnostics.paretoRanking.frontierCandidateCount -
		old.extraction.diagnostics.paretoRanking.frontierCandidateCount
	if (candidateDelta !== 0) completeCandidateCountDeltaByCase[entry.source.caseId] = candidateDelta
	if (frontierDelta !== 0) frontierCandidateCountDeltaByCase[entry.source.caseId] = frontierDelta
	for (const treatment of entry.extraction.alternatives) {
		if (!mechanicallyValid(treatment)) allTreatmentsValid = false
		if (activePathObservability(treatment) < 1) retainedMixedZeroTreatmentCount += 1
	}
	if (treatmentKey(entry.extraction.winner) === treatmentKey(old.extraction.winner)) continue
	changedWinnerCaseIds.push(entry.source.caseId)
	if (entry.extraction.winner.gradient !== old.extraction.winner.gradient) changedGradientStateCaseIds.push(entry.source.caseId)
	if (entry.extraction.winner.fieldTreatment !== old.extraction.winner.fieldTreatment) changedFieldTreatmentCaseIds.push(entry.source.caseId)
	const predecessorObservability = activePathObservability(old.extraction.winner)
	if (predecessorObservability === 1) changedFullyObservablePredecessorCaseIds.push(entry.source.caseId)
	const reviewCase = reviewByCase.get(entry.source.caseId)
	const reviewResult = reviewResultByCase.get(entry.source.caseId)
	const candidateSide = reviewCase?.assignment.A === "candidate" ? "A" : "B"
	const baselineSide = candidateSide === "A" ? "B" : "A"
	const transferValid = reviewCase !== undefined && reviewResult?.pass === true &&
		reviewCase.source.sha256 === entry.source.sha256 &&
		paletteKey(reviewCase.options[candidateSide]) === treatmentKey(entry.extraction.winner) &&
		paletteKey(reviewCase.options[baselineSide]) === treatmentKey(old.extraction.winner)
	if (!transferValid) allTransfersValid = false
	reviewTransfers[entry.source.caseId] = {
		pass: transferValid,
		candidateQuality: reviewResult?.candidateQuality ?? null,
		comparison: reviewResult?.comparison ?? null,
		predecessorActiveRolePathObservability: predecessorObservability,
		currentActiveRolePathObservability: activePathObservability(entry.extraction.winner),
	}
}

const candidateCountsUnchanged = Object.keys(completeCandidateCountDeltaByCase).length === 0
const frontierCountsUnchanged = Object.keys(frontierCandidateCountDeltaByCase).length === 0
const mechanismGate = {
	pass: current.scientificSha256 !== predecessor.scientificSha256 && candidateCountsUnchanged && frontierCountsUnchanged &&
		allTreatmentsValid && retainedMixedZeroTreatmentCount > 0 && changedWinnerCaseIds.length > 0 &&
		changedFullyObservablePredecessorCaseIds.length === 0 &&
		changedGradientStateCaseIds.length === 0 && changedFieldTreatmentCaseIds.length === 0 &&
		current.cases.every((entry) => entry.extraction.diagnostics.completeCandidateCount <= 1_500),
	scientificOutputChanged: current.scientificSha256 !== predecessor.scientificSha256,
	candidateCountsUnchanged,
	frontierCountsUnchanged,
	pathFoundationSatisfied: allTreatmentsValid,
	pathFoundationExercised: retainedMixedZeroTreatmentCount > 0 && changedWinnerCaseIds.length > 0,
	fullyObservablePredecessorWinnersUnchanged: changedFullyObservablePredecessorCaseIds.length === 0,
	gradientStatesUnchanged: changedGradientStateCaseIds.length === 0,
	fieldTreatmentsUnchanged: changedFieldTreatmentCaseIds.length === 0,
	candidateBoundSatisfied: current.cases.every((entry) => entry.extraction.diagnostics.completeCandidateCount <= 1_500),
}
const reviewTransferGate = {
	pass: mechanismGate.pass && allTransfersValid && changedWinnerCaseIds.length > 0,
	transferredCaseCount: Object.values(reviewTransfers).filter((value) => (value as { pass: boolean }).pass).length,
	requiredCaseCount: changedWinnerCaseIds.length,
	allChangedWinnersExactlyReviewed: allTransfersValid,
}
const analysisWithoutId = {
	schemaVersion: 1,
	candidateVersion: current.candidateVersion,
	implementationHash: current.implementationHash,
	developmentManifestId: current.developmentManifestId,
	scientificSha256: current.scientificSha256,
	inputHashes: {
		currentAggregateSha256: sha256(currentRaw),
		predecessorAggregateSha256: sha256(predecessorRaw),
		failedCandidateAggregateSha256: sha256(failedRaw),
		futureSampleSha256: sha256(futureRaw),
		protocolSha256: sha256(protocolRaw),
		reviewManifestSha256: sha256(reviewManifestRaw),
		reviewPreparationSha256: sha256(reviewPreparationRaw),
		reviewAnalysisSha256: sha256(reviewAnalysisRaw),
	},
	futureSample: { manifestId: futureSample.manifestId, sealCommitment: futureSample.sealCommitment, opened: false },
	mechanical: {
		changedWinnerCaseIds,
		changedGradientStateCaseIds,
		changedFieldTreatmentCaseIds,
		changedFullyObservablePredecessorCaseIds,
		completeCandidateCountDeltaByCase,
		frontierCandidateCountDeltaByCase,
		retainedMixedZeroTreatmentCount,
		reviewTransfers,
	},
	mechanismGate,
	reviewTransferGate,
	phaseDisposition: mechanismGate.pass && reviewTransferGate.pass
		? "0.5.2-bounded-gates-passed-candidate-freeze-eligible"
		: "0.5.2-bounded-gates-failed-return-to-development",
}
const analysis = { ...analysisWithoutId, analysisId: sha256(canonicalJson(analysisWithoutId)) }
await atomicJson(resolve(currentDirectory, "development-analysis.json"), analysis)
process.stdout.write(`${JSON.stringify({ mechanical: analysis.mechanical, mechanismGate, reviewTransferGate,
	phaseDisposition: analysis.phaseDisposition })}\n`)
