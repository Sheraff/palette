import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { hasPeakAPCAObservability, type CompletePaletteTreatment } from "./src/album-artwork-palette-v2.ts"

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
			candidateAvailability: Readonly<{
				foregroundPeakUnobservableRejectedOptionCount: number
				distinctAccentPeakUnobservableRejectedOptionCount: number
				completeCandidateAccentFamilyIds: readonly string[]
				slateAccentFamilyIds: readonly string[]
			}>
			paretoRanking: Readonly<{ dominanceUsesEvidenceLevels: boolean }>
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
const currentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.5.0-development")
const predecessorDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.4.4-development")
const futureSamplePath = resolve(moduleDirectory, "data/album-artwork-palette-v2-future-sample-02.sealed.json")
const protocolPath = resolve(moduleDirectory, "ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_5_0.md")

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

function hasMixedZeroAndNonzero(treatment: CompletePaletteTreatment, role: "foreground" | "accent"): boolean {
	const pairs = rolePairs(treatment, role)
	return pairs.some(({ absoluteLc }) => absoluteLc === 0) && pairs.some(({ absoluteLc }) => absoluteLc !== 0)
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
if (current.candidateVersion !== "album-artwork-first-principles-0.5.0" ||
	current.implementationHash === predecessor.implementationHash ||
	current.developmentManifestId !== predecessor.developmentManifestId || current.cases.length !== 28 ||
	predecessor.cases.length !== 28) throw new Error("0.5.0 aggregate binding is invalid")
const predecessorByCase = new Map(predecessor.cases.map((entry) => [entry.source.caseId, entry]))
const futureHashes = new Set(futureSample.families.flatMap(({ variants }) => variants.map(({ sha256 }) => sha256)))
const changedWinnerCaseIds: string[] = []
const changedGradientStateCaseIds: string[] = []
const changedFieldTreatmentCaseIds: string[] = []
const addedCompleteAccentFamilies: Record<string, string[]> = {}
const removedCompleteAccentFamilies: Record<string, string[]> = {}
let foregroundPeakUnobservableRejectedOptionCount = 0
let distinctAccentPeakUnobservableRejectedOptionCount = 0
let mixedZeroForegroundTreatmentCount = 0
let mixedZeroAccentTreatmentCount = 0
let exactRetainedTreatmentCount = 0
for (const entry of current.cases) {
	const old = predecessorByCase.get(entry.source.caseId)
	if (!old || old.source.sha256 !== entry.source.sha256) throw new Error(`Predecessor source mismatch for ${entry.source.caseId}`)
	if (entry.extraction.version !== current.candidateVersion || entry.implementationHash !== current.implementationHash ||
		entry.developmentManifestId !== current.developmentManifestId ||
		entry.openedFreshSealManifestId !== "3e85bab09130d0fb6c883ba1e4543fce841e1a94a6b63a6539aececb8f58cb91" ||
		entry.protectedFutureSampleManifestId !== futureSample.manifestId || futureHashes.has(entry.source.sha256)) {
		throw new Error(`Development custody mismatch for ${entry.source.caseId}`)
	}
	if (treatmentKey(entry.extraction.winner) !== treatmentKey(old.extraction.winner)) changedWinnerCaseIds.push(entry.source.caseId)
	if (entry.extraction.winner.gradient !== old.extraction.winner.gradient) changedGradientStateCaseIds.push(entry.source.caseId)
	if (entry.extraction.winner.fieldTreatment !== old.extraction.winner.fieldTreatment) changedFieldTreatmentCaseIds.push(entry.source.caseId)
	const currentTreatmentKeys = new Set(entry.extraction.alternatives.map(treatmentKey))
	exactRetainedTreatmentCount += old.extraction.alternatives.filter((treatment) => currentTreatmentKeys.has(treatmentKey(treatment))).length
	const currentAccentFamilies = new Set(entry.extraction.diagnostics.candidateAvailability.completeCandidateAccentFamilyIds)
	const oldAccentFamilies = new Set(old.extraction.diagnostics.candidateAvailability.completeCandidateAccentFamilyIds)
	const added = [...currentAccentFamilies].filter((familyId) => !oldAccentFamilies.has(familyId)).sort()
	const removed = [...oldAccentFamilies].filter((familyId) => !currentAccentFamilies.has(familyId)).sort()
	if (added.length > 0) addedCompleteAccentFamilies[entry.source.caseId] = added
	if (removed.length > 0) removedCompleteAccentFamilies[entry.source.caseId] = removed
	const availability = entry.extraction.diagnostics.candidateAvailability
	foregroundPeakUnobservableRejectedOptionCount += availability.foregroundPeakUnobservableRejectedOptionCount
	distinctAccentPeakUnobservableRejectedOptionCount += availability.distinctAccentPeakUnobservableRejectedOptionCount
	for (const treatment of entry.extraction.alternatives) {
		if (!treatmentMechanicallyValid(treatment)) throw new Error(`Invalid sampled-role treatment in ${entry.source.caseId}`)
		if (hasMixedZeroAndNonzero(treatment, "foreground")) mixedZeroForegroundTreatmentCount += 1
		if (!treatment.collapse.accent && hasMixedZeroAndNonzero(treatment, "accent")) mixedZeroAccentTreatmentCount += 1
	}
}
const mechanismGate = {
	pass: current.scientificSha256 !== predecessor.scientificSha256 &&
		current.cases.every((entry) => entry.extraction.diagnostics.completeCandidateCount <= 1_500) &&
		current.cases.every((entry) => entry.extraction.alternatives.every(treatmentMechanicallyValid)) &&
		distinctAccentPeakUnobservableRejectedOptionCount > 0 && mixedZeroAccentTreatmentCount > 0,
	scientificOutputChanged: current.scientificSha256 !== predecessor.scientificSha256,
	candidateBoundSatisfied: current.cases.every((entry) => entry.extraction.diagnostics.completeCandidateCount <= 1_500),
	completePathSamplingSatisfied: current.cases.every((entry) => entry.extraction.alternatives.every(treatmentMechanicallyValid)),
	peakUnobservableAccentFilteringExercised: distinctAccentPeakUnobservableRejectedOptionCount > 0,
	mixedZeroAccentAdmissionExercised: mixedZeroAccentTreatmentCount > 0,
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
		completeCandidateCount: current.cases.reduce((sum, entry) => sum + entry.extraction.diagnostics.completeCandidateCount, 0),
		maximumCompleteCandidateCount: Math.max(...current.cases.map((entry) => entry.extraction.diagnostics.completeCandidateCount)),
		foregroundPeakUnobservableRejectedOptionCount,
		distinctAccentPeakUnobservableRejectedOptionCount,
		mixedZeroForegroundTreatmentCount,
		mixedZeroAccentTreatmentCount,
		changedWinnerCaseIds,
		changedGradientStateCaseIds,
		changedFieldTreatmentCaseIds,
		exactRetainedTreatmentCount,
		addedCompleteAccentFamilies,
		removedCompleteAccentFamilies,
	},
	mechanismGate,
	limitations: [
		"This bounded development comparison uses no opened or future directional-review output.",
		"Peak observability is a structural dead-zone rule, not a product accessibility guarantee.",
		"Gradient and signature top-one ranking remain separate unresolved development questions.",
	],
	phaseDisposition: mechanismGate.pass
		? "0.5.0-contrast-mechanism-passed-ranking-development-required"
		: "0.5.0-contrast-mechanism-failed-do-not-advance",
}
const analysis = { ...analysisWithoutId, analysisId: sha256(canonicalJson(analysisWithoutId)) }
await atomicJson(resolve(currentDirectory, "development-analysis.json"), analysis)
process.stdout.write(`${JSON.stringify({ mechanical: analysis.mechanical, mechanismGate, phaseDisposition: analysis.phaseDisposition })}\n`)
