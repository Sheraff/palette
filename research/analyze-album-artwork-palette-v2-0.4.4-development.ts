import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { completeDirectionKey, visuallyNear } from "./src/album-artwork-palette-v2.ts"
import type { CompletePaletteTreatment } from "./src/album-artwork-palette-v2.ts"
import { namePalette } from "./src/color-name.ts"

type SourceArtifact = Readonly<{
	source: Readonly<{
		caseId: string
		path: string
		sha256: string
		cohort: "stress" | "dataset"
		structureTags: readonly string[]
	}>
	dimensions: Readonly<{ width: number; height: number }>
	extraction: Readonly<{
		winner: CompletePaletteTreatment
		alternatives: readonly CompletePaletteTreatment[]
		diagnostics: Readonly<{
			completeCandidateCount: number
			candidateAvailability: Readonly<{ distinctAccentDeadZoneRejectedTreatmentCount?: number }>
			paretoRanking: Readonly<{
				frontierCandidateCount: number
				frontierDirectionCount: number
				differsFromLegacyScalar: boolean
				dominanceUsesEvidenceLevels: boolean
			}>
			legacyScalarTopTreatment: CompletePaletteTreatment
		}>
	}>
}>

type Aggregate = Readonly<{
	implementationHash: string
	developmentManifestId: string
	scientificSha256: string
	cases: readonly SourceArtifact[]
}>

type PriorReviewManifest = Readonly<{
	cases: ReadonlyArray<Readonly<{
		caseId: string
		options: ReadonlyArray<Readonly<{ optionId: string; treatment: CompletePaletteTreatment }>>
	}>>
}>

type PriorFeedback = Readonly<{
	entries: ReadonlyArray<Readonly<{ caseId: string; validOptionIds: readonly string[]; preferredOptionId: string | null }>>
}>

const REVIEW_VERSION = "album-artwork-palette-v2-distinct-accent-observability-review-v9"
const TARGET_CASE_ID = "development-14"
const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const experimentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.4.4-development")
const predecessorDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.4.3-development")

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	const object = value as Record<string, unknown>
	return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
	await rename(temporary, path)
}

function treatmentKey(treatment: CompletePaletteTreatment): string {
	return [
		treatment.background.hex,
		treatment.surface.hex,
		treatment.foreground.hex,
		treatment.accent.hex,
		treatment.gradient ? "1" : "0",
	].join(":")
}

function presentationFor(treatment: CompletePaletteTreatment) {
	const names = namePalette([
		treatment.background.rgb,
		treatment.surface.rgb,
		treatment.foreground.rgb,
		treatment.accent.rgb,
	])
	return {
		treatmentId: treatment.id,
		roles: {
			background: names[0],
			surface: names[1],
			foreground: names[2],
			accent: names[3],
		},
	}
}

const [aggregate, predecessor, priorManifest, priorFeedback] = await Promise.all([
	readFile(resolve(experimentDirectory, "aggregate.json"), "utf8").then((value) => JSON.parse(value) as Aggregate),
	readFile(resolve(predecessorDirectory, "aggregate.json"), "utf8").then((value) => JSON.parse(value) as Aggregate),
	readFile(resolve(predecessorDirectory, "targeted-review-manifest.json"), "utf8").then((value) => JSON.parse(value) as PriorReviewManifest),
	readFile(resolve(moduleDirectory, "data/album-artwork-palette-v2-0.4.3-targeted-feedback.json"), "utf8").then((value) => JSON.parse(value) as PriorFeedback),
])
const currentByCase = new Map(aggregate.cases.map((entry) => [entry.source.caseId, entry]))
const predecessorByCase = new Map(predecessor.cases.map((entry) => [entry.source.caseId, entry]))

const changedWinnerCaseIds = aggregate.cases.filter((entry) => {
	const old = predecessorByCase.get(entry.source.caseId)
	if (!old) throw new Error(`Missing predecessor case ${entry.source.caseId}`)
	return treatmentKey(entry.extraction.winner) !== treatmentKey(old.extraction.winner)
}).map((entry) => entry.source.caseId)
if (JSON.stringify(changedWinnerCaseIds) !== JSON.stringify(["development-14", "development-24"])) {
	throw new Error(`Unexpected observability winner changes: ${changedWinnerCaseIds.join(", ")}`)
}

const priorCaseById = new Map(priorManifest.cases.map((entry) => [entry.caseId, entry]))
const transferredPositiveTops = ["development-04", "development-19", "development-24"].map((caseId) => {
	const current = currentByCase.get(caseId)
	const priorCase = priorCaseById.get(caseId)
	const response = priorFeedback.entries.find((entry) => entry.caseId === caseId)
	if (!current || !priorCase || !response) throw new Error(`Missing prior positive binding for ${caseId}`)
	const matchingOption = priorCase.options.find((option) =>
		response.validOptionIds.includes(option.optionId) && treatmentKey(option.treatment) === treatmentKey(current.extraction.winner))
	if (!matchingOption) throw new Error(`Current top is not an exact prior positive for ${caseId}`)
	return {
		caseId,
		priorOptionId: matchingOption.optionId,
		priorPreferred: response.preferredOptionId === matchingOption.optionId,
		treatmentKey: treatmentKey(current.extraction.winner),
	}
})

const reviewEntry = currentByCase.get(TARGET_CASE_ID)
const predecessorEntry = predecessorByCase.get(TARGET_CASE_ID)
if (!reviewEntry || !predecessorEntry) throw new Error("Missing distinct-accent observability review case")
const candidates: CompletePaletteTreatment[] = []
const addCandidate = (treatment: CompletePaletteTreatment): void => {
	if (candidates.length >= 4 || candidates.some((candidate) =>
		completeDirectionKey(candidate) === completeDirectionKey(treatment) || visuallyNear(candidate, treatment))) return
	candidates.push(treatment)
}
addCandidate(reviewEntry.extraction.winner)
addCandidate(predecessorEntry.extraction.winner)
addCandidate(reviewEntry.extraction.diagnostics.legacyScalarTopTreatment)
for (const treatment of reviewEntry.extraction.alternatives) addCandidate(treatment)
for (const treatment of predecessorEntry.extraction.alternatives) addCandidate(treatment)
if (candidates.length < 2) throw new Error("Insufficient distinct-accent observability directions")
const ordered = candidates.sort((first, second) => sha256(`${aggregate.scientificSha256}\0${reviewEntry.source.sha256}\0${first.id}`)
	.localeCompare(sha256(`${aggregate.scientificSha256}\0${reviewEntry.source.sha256}\0${second.id}`)))
const reviewWithoutId = {
	schemaVersion: 1,
	reviewVersion: REVIEW_VERSION,
	reviewUnit: "independent-validity-plus-preference-among-selected-for-distinct-accent-observability-review",
	candidateVersion: "album-artwork-first-principles-0.4.4",
	implementationHash: aggregate.implementationHash,
	developmentManifestId: aggregate.developmentManifestId,
	scientificSha256: aggregate.scientificSha256,
	selectionDomain: REVIEW_VERSION,
	preferencePolicy: "preferred option is optional and must be one of the independently valid options",
	cases: [{
		caseId: reviewEntry.source.caseId,
		sourceSha256: reviewEntry.source.sha256,
		sourcePath: reviewEntry.source.path,
		cohort: reviewEntry.source.cohort,
		structureTags: reviewEntry.source.structureTags,
		dimensions: reviewEntry.dimensions,
		options: ordered.map((treatment, index) => ({
			optionId: String.fromCharCode(65 + index),
			treatment,
			presentation: presentationFor(treatment),
		})),
	}],
}
const targetedReview = { ...reviewWithoutId, manifestId: sha256(canonicalJson(reviewWithoutId)) }
const optionRoles = targetedReview.cases[0].options.map((option) => ({
	optionId: option.optionId,
	currentParetoTop: treatmentKey(option.treatment) === treatmentKey(reviewEntry.extraction.winner),
	predecessorParetoTop: treatmentKey(option.treatment) === treatmentKey(predecessorEntry.extraction.winner),
	currentLegacyScalarTop: treatmentKey(option.treatment) === treatmentKey(reviewEntry.extraction.diagnostics.legacyScalarTopTreatment),
}))
const rejectedTreatmentCount = aggregate.cases.reduce((sum, entry) =>
	sum + (entry.extraction.diagnostics.candidateAvailability.distinctAccentDeadZoneRejectedTreatmentCount ?? 0), 0)
const analysis = {
	schemaVersion: 1,
	candidateVersion: "album-artwork-first-principles-0.4.4",
	implementationHash: aggregate.implementationHash,
	developmentManifestId: aggregate.developmentManifestId,
	scientificSha256: aggregate.scientificSha256,
	sourceCount: aggregate.cases.length,
	mechanical: {
		completeCandidateCount: aggregate.cases.reduce((sum, entry) => sum + entry.extraction.diagnostics.completeCandidateCount, 0),
		distinctAccentDeadZoneRejectedTreatmentCount: rejectedTreatmentCount,
		maximumCompleteCandidateCount: Math.max(...aggregate.cases.map((entry) => entry.extraction.diagnostics.completeCandidateCount)),
		candidateBoundSatisfied: aggregate.cases.every((entry) => entry.extraction.diagnostics.completeCandidateCount <= 1_500),
		winnerChanges: changedWinnerCaseIds.length,
		changedWinnerCaseIds,
		evidenceLevelDominance: aggregate.cases.every((entry) => entry.extraction.diagnostics.paretoRanking.dominanceUsesEvidenceLevels),
	},
	predecessorReviewTransfer: {
		transferredPositiveTopCount: transferredPositiveTops.length,
		transferredPositiveTops,
		interpretation: "Only exact treatment matches transfer; unselected predecessor options remain unlabeled.",
	},
	reviewPreparation: {
		targetedObservabilityCaseIds: [TARGET_CASE_ID],
		optionRoles: [{ caseId: TARGET_CASE_ID, options: optionRoles }],
		freshSampleOpened: false,
	},
}

await Promise.all([
	atomicJson(resolve(experimentDirectory, "development-analysis.json"), analysis),
	atomicJson(resolve(experimentDirectory, "targeted-review-manifest.json"), targetedReview),
])
process.stdout.write(`${JSON.stringify(analysis.mechanical)}\n`)
process.stdout.write("Prepared one distinct-accent observability case\n")
