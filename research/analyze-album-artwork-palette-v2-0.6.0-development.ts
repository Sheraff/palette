import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isExactOverlayGradientChallenger, type CompletePaletteTreatment } from "./src/album-artwork-palette-v2.ts"

type ChallengerTrace = Readonly<{
	reason: string
	acceptedGradientVariantCount: number
	existingExactOverlayGradientCount: number
	projectedAttemptCount: number
	projectedLegalCount: number
	selectedChallengerId: string | null
	selectedSource: string | null
	primaryFoundationEvidenceLevel: number
	challengerFoundationEvidenceLevel: number | null
	replacedPrimaryWinner: boolean
}>

type SourceArtifact = Readonly<{
	implementationHash: string
	developmentManifestId: string
	openedFreshSealManifestId: string
	protectedFutureSampleManifestIds: readonly string[]
	source: Readonly<{ caseId: string; sha256: string }>
	extraction: Readonly<{
		version: string
		winner: CompletePaletteTreatment
		alternatives: readonly CompletePaletteTreatment[]
		diagnostics: Readonly<{
			fieldHypotheses: readonly unknown[]
			completeCandidateCount: number
			exactOverlayGradientChallenger: ChallengerTrace
			paretoRanking: Readonly<{
				rawCandidateCount: number
				uniqueCandidateCount: number
				dominatedCandidateCount: number
				frontierCandidateCount: number
				frontierDirectionCount: number
				selectedTreatmentId: string
				primaryTreatmentId: string
				legacyScalarTopTreatmentId: string
			}>
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
const currentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.6.0-development")
const predecessorDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.5.2-development")
const future03Path = resolve(moduleDirectory, "data/album-artwork-palette-v2-future-sample-03.sealed.json")
const protocolPath = resolve(moduleDirectory, "ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_6_0.md")
const EXPECTED_FUTURE_IDS = [
	"9ac421c0d4931b8fdd24ce8e628609dbac36652addc7c9dfdb65a814aaf20671",
	"bee665792a4ddfaeb3541aa5e58181c8f3a0685836b13475643d9deccace4060",
]

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

const [currentRaw, predecessorRaw, future03Raw, protocolRaw] = await Promise.all([
	readFile(resolve(currentDirectory, "aggregate.json"), "utf8"),
	readFile(resolve(predecessorDirectory, "aggregate.json"), "utf8"),
	readFile(future03Path, "utf8"),
	readFile(protocolPath, "utf8"),
])
const current = JSON.parse(currentRaw) as Aggregate
const predecessor = JSON.parse(predecessorRaw) as Aggregate
const future03 = JSON.parse(future03Raw) as {
	manifestId: string
	sealCommitment: string
	selection: { root: string }
	families: Array<{ variants: Array<{ sha256: string }> }>
}
if (current.candidateVersion !== "album-artwork-first-principles-0.6.0" ||
	predecessor.candidateVersion !== "album-artwork-first-principles-0.5.2" ||
	current.implementationHash === predecessor.implementationHash ||
	current.developmentManifestId !== predecessor.developmentManifestId || current.cases.length !== 28 || predecessor.cases.length !== 28 ||
	future03.manifestId !== EXPECTED_FUTURE_IDS[1] || future03.selection.root !== "11" ||
	sha256(future03Raw) !== "690e85ace6377fd154db1124754dfb7d876c64a3c063f8b567e0e219d88f0183") {
	throw new Error("0.6.0 aggregate or future-sample binding is invalid")
}

const predecessorByCase = new Map(predecessor.cases.map((entry) => [entry.source.caseId, entry]))
const future03Hashes = new Set(future03.families.flatMap(({ variants }) => variants.map(({ sha256: hash }) => hash)))
const changedWinnerCaseIds: string[] = []
const primaryMismatchCaseIds: string[] = []
const countMismatchCaseIds: string[] = []
const fieldHypothesisMismatchCaseIds: string[] = []
const invalidChallengerCaseIds: string[] = []
const retainedSlateMismatchCaseIds: string[] = []
const changedWinnerEvidence: Record<string, unknown> = {}
let maximumProjectedAttemptCount = 0
let selectedChallengerCount = 0

for (const entry of current.cases) {
	const old = predecessorByCase.get(entry.source.caseId)
	if (!old || old.source.sha256 !== entry.source.sha256 || future03Hashes.has(entry.source.sha256)) {
		throw new Error(`Predecessor or future-sample mismatch for ${entry.source.caseId}`)
	}
	if (entry.extraction.version !== current.candidateVersion || entry.implementationHash !== current.implementationHash ||
		entry.developmentManifestId !== current.developmentManifestId ||
		entry.openedFreshSealManifestId !== "3e85bab09130d0fb6c883ba1e4543fce841e1a94a6b63a6539aececb8f58cb91" ||
		canonicalJson(entry.protectedFutureSampleManifestIds) !== canonicalJson(EXPECTED_FUTURE_IDS)) {
		throw new Error(`Development custody mismatch for ${entry.source.caseId}`)
	}
	const trace = entry.extraction.diagnostics.exactOverlayGradientChallenger
	maximumProjectedAttemptCount = Math.max(maximumProjectedAttemptCount, trace.projectedAttemptCount)
	if (trace.replacedPrimaryWinner) selectedChallengerCount += 1
	if (canonicalJson(entry.extraction.diagnostics.fieldHypotheses) !== canonicalJson(old.extraction.diagnostics.fieldHypotheses)) {
		fieldHypothesisMismatchCaseIds.push(entry.source.caseId)
	}
	const currentRanking = entry.extraction.diagnostics.paretoRanking
	const oldRanking = old.extraction.diagnostics.paretoRanking
	if (entry.extraction.diagnostics.completeCandidateCount !== old.extraction.diagnostics.completeCandidateCount ||
		currentRanking.rawCandidateCount !== oldRanking.rawCandidateCount ||
		currentRanking.uniqueCandidateCount !== oldRanking.uniqueCandidateCount ||
		currentRanking.dominatedCandidateCount !== oldRanking.dominatedCandidateCount ||
		currentRanking.frontierCandidateCount !== oldRanking.frontierCandidateCount ||
		currentRanking.frontierDirectionCount !== oldRanking.frontierDirectionCount) countMismatchCaseIds.push(entry.source.caseId)
	if (currentRanking.primaryTreatmentId !== old.extraction.winner.id ||
		currentRanking.legacyScalarTopTreatmentId !== oldRanking.legacyScalarTopTreatmentId) primaryMismatchCaseIds.push(entry.source.caseId)
	if (treatmentKey(entry.extraction.winner) === treatmentKey(old.extraction.winner)) {
		if (canonicalJson(entry.extraction.alternatives.map(treatmentKey)) !==
			canonicalJson(old.extraction.alternatives.map(treatmentKey))) retainedSlateMismatchCaseIds.push(entry.source.caseId)
		continue
	}
	changedWinnerCaseIds.push(entry.source.caseId)
	const challengerValid = trace.replacedPrimaryWinner && trace.reason === "challenger-selected" &&
		trace.selectedChallengerId === entry.extraction.winner.id && entry.extraction.alternatives[0]?.id === entry.extraction.winner.id &&
		entry.extraction.alternatives[1]?.id === old.extraction.winner.id &&
		isExactOverlayGradientChallenger(old.extraction.winner, entry.extraction.winner) &&
		trace.challengerFoundationEvidenceLevel !== null &&
		trace.challengerFoundationEvidenceLevel >= trace.primaryFoundationEvidenceLevel - 1
	if (!challengerValid) invalidChallengerCaseIds.push(entry.source.caseId)
	const expectedSlate = [entry.extraction.winner, old.extraction.winner, ...old.extraction.alternatives.filter((candidate) =>
		treatmentKey(candidate) !== treatmentKey(entry.extraction.winner) &&
		treatmentKey(candidate) !== treatmentKey(old.extraction.winner))].slice(0, 8)
	if (canonicalJson(entry.extraction.alternatives.map(treatmentKey)) !== canonicalJson(expectedSlate.map(treatmentKey))) {
		retainedSlateMismatchCaseIds.push(entry.source.caseId)
	}
	changedWinnerEvidence[entry.source.caseId] = {
		predecessorId: old.extraction.winner.id,
		challengerId: entry.extraction.winner.id,
		predecessorGradient: old.extraction.winner.gradient,
		challengerGradient: entry.extraction.winner.gradient,
		foreground: entry.extraction.winner.foreground.hex,
		accent: entry.extraction.winner.accent.hex,
		trace,
	}
}

const expectedChanged = ["development-06", "development-22"]
const exactChangedSet = canonicalJson(changedWinnerCaseIds) === canonicalJson(expectedChanged)
const exactFlatControls = ["development-01", "development-02", "development-05", "development-16", "development-23"]
	.every((caseId) => !changedWinnerCaseIds.includes(caseId) && predecessorByCase.get(caseId)?.extraction.winner.gradient === false)
const existingGradientWinnersUnchanged = predecessor.cases
	.filter(({ extraction }) => extraction.winner.gradient)
	.every(({ source }) => !changedWinnerCaseIds.includes(source.caseId))
const mechanismGate = {
	pass: current.scientificSha256 !== predecessor.scientificSha256 && exactChangedSet && exactFlatControls &&
		existingGradientWinnersUnchanged && primaryMismatchCaseIds.length === 0 && countMismatchCaseIds.length === 0 &&
		fieldHypothesisMismatchCaseIds.length === 0 && invalidChallengerCaseIds.length === 0 && retainedSlateMismatchCaseIds.length === 0 &&
		selectedChallengerCount === 2 &&
		maximumProjectedAttemptCount <= 6 && current.cases.every(({ extraction }) => extraction.alternatives.length <= 8 &&
			extraction.diagnostics.completeCandidateCount <= 1_500),
	scientificOutputChanged: current.scientificSha256 !== predecessor.scientificSha256,
	exactChangedSet,
	exactFlatControls,
	existingGradientWinnersUnchanged,
	primarySearchUnchanged: primaryMismatchCaseIds.length === 0 && countMismatchCaseIds.length === 0 &&
		fieldHypothesisMismatchCaseIds.length === 0,
	allChangedWinnersValid: invalidChallengerCaseIds.length === 0 && retainedSlateMismatchCaseIds.length === 0,
	projectionBoundSatisfied: maximumProjectedAttemptCount <= 6,
	candidateAndSlateBoundsSatisfied: current.cases.every(({ extraction }) => extraction.alternatives.length <= 8 &&
		extraction.diagnostics.completeCandidateCount <= 1_500),
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
		futureSample03Sha256: sha256(future03Raw),
		protocolSha256: sha256(protocolRaw),
	},
	futureSample03: { manifestId: future03.manifestId, sealCommitment: future03.sealCommitment, opened: false },
	mechanical: {
		changedWinnerCaseIds,
		primaryMismatchCaseIds,
		countMismatchCaseIds,
		fieldHypothesisMismatchCaseIds,
		invalidChallengerCaseIds,
		retainedSlateMismatchCaseIds,
		selectedChallengerCount,
		maximumProjectedAttemptCount,
		changedWinnerEvidence,
	},
	mechanismGate,
	phaseDisposition: mechanismGate.pass
		? "0.6.0-gradient-challenger-mechanism-passed-two-case-human-delta-required"
		: "0.6.0-gradient-challenger-mechanism-failed-reassess-approach",
}
const analysis = { ...analysisWithoutId, analysisId: sha256(canonicalJson(analysisWithoutId)) }
await atomicJson(resolve(currentDirectory, "development-analysis.json"), analysis)
process.stdout.write(`${JSON.stringify({ mechanical: analysis.mechanical, mechanismGate,
	phaseDisposition: analysis.phaseDisposition })}\n`)
