import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { hasPeakAPCAObservability, treatmentFoundation, type CompletePaletteTreatment } from "./src/album-artwork-palette-v2.ts"

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
			paretoRanking: Readonly<{ frontierCandidateCount: number; dominatedCandidateCount: number }>
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

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const currentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.5.1-development")
const predecessorDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.5.0-development")
const futureSamplePath = resolve(moduleDirectory, "data/album-artwork-palette-v2-future-sample-02.sealed.json")
const protocolPath = resolve(moduleDirectory, "ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_5_1.md")

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
	return [
		treatment.background.hex,
		treatment.surface.hex,
		treatment.foreground.hex,
		treatment.accent.hex,
		treatment.gradient ? "gradient" : "flat",
	].join(":")
}

function expectedPositions(treatment: CompletePaletteTreatment): readonly number[] {
	return treatment.gradient ? [0, 0.25, 0.5, 0.75, 1] : treatment.collapse.surface ? [0] : [0, 1]
}

function rolePairs(treatment: CompletePaletteTreatment, role: "foreground" | "accent") {
	return treatment.contrast.pairs.filter((pair) => pair.role === role)
}

function treatmentMechanicallyValid(treatment: CompletePaletteTreatment): boolean {
	const expected = expectedPositions(treatment)
	const foreground = rolePairs(treatment, "foreground")
	const accent = rolePairs(treatment, "accent")
	return foreground.length === expected.length && foreground.every(({ position }, index) => position === expected[index]) &&
		hasPeakAPCAObservability(foreground.map(({ signedLc }) => signedLc)) &&
		(treatment.collapse.accent || (
			accent.length === expected.length && accent.every(({ position }, index) => position === expected[index]) &&
			hasPeakAPCAObservability(accent.map(({ signedLc }) => signedLc))
		))
}

function foundationMechanicallyValid(treatment: CompletePaletteTreatment): boolean {
	const expected = treatmentFoundation(
		treatment.scores.fieldStructure,
		treatment.scores.artworkIdentity,
		treatment.scores.foregroundUtility,
		treatment.scores.accentUtility,
	)
	return Math.abs(treatment.scores.treatmentFoundation - expected) <= Number.EPSILON * 8
}

const [currentRaw, predecessorRaw, futureSampleRaw, protocolRaw] = await Promise.all([
	readFile(resolve(currentDirectory, "aggregate.json"), "utf8"),
	readFile(resolve(predecessorDirectory, "aggregate.json"), "utf8"),
	readFile(futureSamplePath, "utf8"),
	readFile(protocolPath, "utf8"),
])
const current = JSON.parse(currentRaw) as Aggregate
const predecessor = JSON.parse(predecessorRaw) as Aggregate
const futureSample = JSON.parse(futureSampleRaw) as {
	manifestId: string
	sealCommitment: string
	families: Array<{ variants: Array<{ sha256: string }> }>
}
if (current.candidateVersion !== "album-artwork-first-principles-0.5.1" ||
	current.implementationHash === predecessor.implementationHash ||
	current.developmentManifestId !== predecessor.developmentManifestId || current.cases.length !== 28 ||
	predecessor.cases.length !== 28) throw new Error("0.5.1 aggregate binding is invalid")

const predecessorByCase = new Map(predecessor.cases.map((entry) => [entry.source.caseId, entry]))
const futureHashes = new Set(futureSample.families.flatMap(({ variants }) => variants.map(({ sha256 }) => sha256)))
const changedWinnerCaseIds: string[] = []
const changedGradientStateCaseIds: string[] = []
const changedFieldTreatmentCaseIds: string[] = []
const completeCandidateCountDeltaByCase: Record<string, number> = {}
const frontierCandidateCountDeltaByCase: Record<string, number> = {}
const changedWinnerScoreEvidence: Record<string, unknown> = {}
let exactRetainedTreatmentCount = 0
let changedRetainedFoundationCount = 0
let collapsedAccentFoundationCount = 0

for (const entry of current.cases) {
	const old = predecessorByCase.get(entry.source.caseId)
	if (!old || old.source.sha256 !== entry.source.sha256) throw new Error(`Predecessor source mismatch for ${entry.source.caseId}`)
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
	const winnerChanged = treatmentKey(entry.extraction.winner) !== treatmentKey(old.extraction.winner)
	if (winnerChanged) {
		changedWinnerCaseIds.push(entry.source.caseId)
		changedWinnerScoreEvidence[entry.source.caseId] = {
			predecessor: {
				id: old.extraction.winner.id,
				treatmentFoundation: old.extraction.winner.scores.treatmentFoundation,
				foregroundUtility: old.extraction.winner.scores.foregroundUtility,
				accentUtility: old.extraction.winner.scores.accentUtility,
			},
			current: {
				id: entry.extraction.winner.id,
				treatmentFoundation: entry.extraction.winner.scores.treatmentFoundation,
				foregroundUtility: entry.extraction.winner.scores.foregroundUtility,
				accentUtility: entry.extraction.winner.scores.accentUtility,
			},
		}
	}
	if (entry.extraction.winner.gradient !== old.extraction.winner.gradient) changedGradientStateCaseIds.push(entry.source.caseId)
	if (entry.extraction.winner.fieldTreatment !== old.extraction.winner.fieldTreatment) changedFieldTreatmentCaseIds.push(entry.source.caseId)
	const oldByKey = new Map(old.extraction.alternatives.map((treatment) => [treatmentKey(treatment), treatment]))
	for (const treatment of entry.extraction.alternatives) {
		if (!treatmentMechanicallyValid(treatment)) throw new Error(`Invalid sampled-role treatment in ${entry.source.caseId}`)
		if (!foundationMechanicallyValid(treatment)) throw new Error(`Invalid active-role foundation in ${entry.source.caseId}`)
		if (treatment.collapse.accent) collapsedAccentFoundationCount += 1
		const oldTreatment = oldByKey.get(treatmentKey(treatment))
		if (!oldTreatment) continue
		exactRetainedTreatmentCount += 1
		if (treatment.scores.treatmentFoundation !== oldTreatment.scores.treatmentFoundation) changedRetainedFoundationCount += 1
	}
}

const candidateCountsUnchanged = Object.keys(completeCandidateCountDeltaByCase).length === 0
const frontierCountsUnchanged = Object.keys(frontierCandidateCountDeltaByCase).length === 0
const allTreatmentsMechanicallyValid = current.cases.every((entry) =>
	entry.extraction.alternatives.every((treatment) => treatmentMechanicallyValid(treatment) && foundationMechanicallyValid(treatment)))
const mechanismGate = {
	pass: current.scientificSha256 !== predecessor.scientificSha256 && candidateCountsUnchanged && frontierCountsUnchanged &&
		allTreatmentsMechanicallyValid && changedRetainedFoundationCount > 0 &&
		current.cases.every((entry) => entry.extraction.diagnostics.completeCandidateCount <= 1_500),
	scientificOutputChanged: current.scientificSha256 !== predecessor.scientificSha256,
	candidateCountsUnchanged,
	frontierCountsUnchanged,
	activeRoleFoundationSatisfied: allTreatmentsMechanicallyValid,
	activeRoleFoundationExercised: changedRetainedFoundationCount > 0,
	candidateBoundSatisfied: current.cases.every((entry) => entry.extraction.diagnostics.completeCandidateCount <= 1_500),
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
		futureSampleSha256: sha256(futureSampleRaw),
		protocolSha256: sha256(protocolRaw),
	},
	futureSample: {
		manifestId: futureSample.manifestId,
		sealCommitment: futureSample.sealCommitment,
		opened: false,
	},
	mechanical: {
		changedWinnerCaseIds,
		changedGradientStateCaseIds,
		changedFieldTreatmentCaseIds,
		completeCandidateCountDeltaByCase,
		frontierCandidateCountDeltaByCase,
		exactRetainedTreatmentCount,
		changedRetainedFoundationCount,
		collapsedAccentFoundationCount,
		changedWinnerScoreEvidence,
	},
	mechanismGate,
	limitations: [
		"This bounded development comparison uses no opened or future directional-review output.",
		"The mechanism gate establishes deterministic soft ranking behavior, not product quality.",
		"Every changed development winner requires the predeclared blinded human checkpoint before freeze.",
	],
	phaseDisposition: mechanismGate.pass
		? changedWinnerCaseIds.length > 0
			? "0.5.1-ranking-mechanism-passed-human-checkpoint-required"
			: "0.5.1-ranking-mechanism-passed-no-observed-winner-effect-do-not-freeze"
		: "0.5.1-ranking-mechanism-failed-do-not-advance",
}
const analysis = { ...analysisWithoutId, analysisId: sha256(canonicalJson(analysisWithoutId)) }
await atomicJson(resolve(currentDirectory, "development-analysis.json"), analysis)
process.stdout.write(`${JSON.stringify({ mechanical: analysis.mechanical, mechanismGate, phaseDisposition: analysis.phaseDisposition })}\n`)
