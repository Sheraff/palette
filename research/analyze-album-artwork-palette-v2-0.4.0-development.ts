import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	completeDirectionKey,
	visuallyNear,
} from "./src/album-artwork-palette-v2.ts"
import type { CompletePaletteTreatment } from "./src/album-artwork-palette-v2.ts"
import { namePalette } from "./src/color-name.ts"

type Source = Readonly<{
	caseId: string
	path: string
	sha256: string
	cohort: "stress" | "dataset"
	structureTags: readonly string[]
}>

type SourceArtifact = Readonly<{
	source: Source
	dimensions: Readonly<{ width: number; height: number }>
	extraction: Readonly<{
		winner: CompletePaletteTreatment
		alternatives: readonly CompletePaletteTreatment[]
		diagnostics: Readonly<{
			fieldDomains: ReadonlyArray<Readonly<{ eligible: boolean }>>
			fieldHypotheses: ReadonlyArray<Readonly<{ kind: string }>>
			candidateAvailability: Readonly<{
				foregroundLaneFamilyIds: readonly string[]
				signatureLaneFamilyIds: readonly string[]
				completeCandidateForegroundFamilyIds: readonly string[]
				completeCandidateAccentFamilyIds: readonly string[]
			}>
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
	entries: ReadonlyArray<Readonly<{ caseId: string; validOptionIds: readonly string[] }>>
}>

const REVIEW_VERSION = "album-artwork-palette-v2-architecture-review-v5"
const TARGET_CASE_IDS = ["development-07", "development-24", "development-27", "development-23"] as const
const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const experimentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.4.0-development")
const predecessorDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.3.3-development")

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

function structure(treatment: CompletePaletteTreatment): string {
	if (treatment.collapse.surface && treatment.collapse.accent) return "two-colors"
	if (treatment.collapse.surface) return "three-colors-surface-collapsed"
	if (treatment.collapse.accent) return "three-colors-accent-collapsed"
	return "four-colors"
}

function counts(values: readonly string[]): Record<string, number> {
	const output: Record<string, number> = {}
	for (const value of values) output[value] = (output[value] ?? 0) + 1
	return Object.fromEntries(Object.entries(output).sort(([first], [second]) => first.localeCompare(second)))
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

const priorVersions = ["0.3.0", "0.3.1", "0.3.2", "0.3.3"] as const
const [aggregate, predecessor, broadReview, ...priorPairs] = await Promise.all([
	readFile(resolve(experimentDirectory, "aggregate.json"), "utf8").then((value) => JSON.parse(value) as Aggregate),
	readFile(resolve(predecessorDirectory, "aggregate.json"), "utf8").then((value) => JSON.parse(value) as Aggregate),
	readFile(resolve(experimentDirectory, "review-manifest.json"), "utf8").then(JSON.parse) as Promise<Readonly<{ cases: ReadonlyArray<Readonly<{ caseId: string }>> }>>,
	...priorVersions.flatMap((version) => [
		readFile(resolve(moduleDirectory, `data/experiments/album-artwork-palette-v2-${version}-development/targeted-review-manifest.json`), "utf8").then((value) => JSON.parse(value) as PriorReviewManifest),
		readFile(resolve(moduleDirectory, `data/album-artwork-palette-v2-${version}-targeted-feedback.json`), "utf8").then((value) => JSON.parse(value) as PriorFeedback),
	]),
])

const priorPositives = new Map<string, CompletePaletteTreatment[]>()
for (let versionIndex = 0; versionIndex < priorVersions.length; versionIndex++) {
	const manifest = priorPairs[versionIndex * 2] as PriorReviewManifest
	const feedback = priorPairs[versionIndex * 2 + 1] as PriorFeedback
	const cases = new Map(manifest.cases.map((entry) => [entry.caseId, entry]))
	for (const response of feedback.entries) {
		const reviewCase = cases.get(response.caseId)
		if (!reviewCase) throw new Error(`Missing prior review case ${response.caseId}`)
		for (const optionId of response.validOptionIds) {
			const option = reviewCase.options.find((candidate) => candidate.optionId === optionId)
			if (!option) throw new Error(`Missing prior option ${response.caseId}/${optionId}`)
			const treatments = priorPositives.get(response.caseId) ?? []
			if (!treatments.some(({ id }) => id === option.treatment.id)) treatments.push(option.treatment)
			priorPositives.set(response.caseId, treatments)
		}
	}
}

const predecessorByCase = new Map(predecessor.cases.map((entry) => [entry.source.caseId, entry]))
let exactPredecessorWinnerMatches = 0
let structureChanges = 0
let gradientChanges = 0
let gradientWinnerHighEndpointBackgrounds = 0
const perCase = aggregate.cases.map((entry) => {
	const old = predecessorByCase.get(entry.source.caseId)
	if (!old) throw new Error(`Missing predecessor case ${entry.source.caseId}`)
	const exactWinnerMatch = treatmentKey(entry.extraction.winner) === treatmentKey(old.extraction.winner)
	const structureChanged = structure(entry.extraction.winner) !== structure(old.extraction.winner)
	const gradientChanged = entry.extraction.winner.gradient !== old.extraction.winner.gradient
	if (exactWinnerMatch) exactPredecessorWinnerMatches += 1
	if (structureChanged) structureChanges += 1
	if (gradientChanged) gradientChanges += 1
	if (entry.extraction.winner.gradientEvidence?.backgroundTopologyEndpoint === "high") gradientWinnerHighEndpointBackgrounds += 1
	return {
		caseId: entry.source.caseId,
		eligibleFieldDomainAvailable: entry.extraction.diagnostics.fieldDomains.some(({ eligible }) => eligible),
		gradientHypothesisAvailable: entry.extraction.diagnostics.fieldHypotheses.some(({ kind }) => kind === "gradient-field"),
		paretoDiffersFromLegacyScalar: entry.extraction.diagnostics.paretoRanking.differsFromLegacyScalar,
		paretoFrontierCandidateCount: entry.extraction.diagnostics.paretoRanking.frontierCandidateCount,
		paretoFrontierDirectionCount: entry.extraction.diagnostics.paretoRanking.frontierDirectionCount,
		winnerStructure: structure(entry.extraction.winner),
		winnerGradient: entry.extraction.winner.gradient,
		winnerBackgroundTopologyEndpoint: entry.extraction.winner.gradientEvidence?.backgroundTopologyEndpoint ?? null,
		exactPredecessorWinnerMatch: exactWinnerMatch,
		structureChanged,
		gradientChanged,
	}
})

const broadCaseIds = new Set(broadReview.cases.map(({ caseId }) => caseId))
const aggregateByCase = new Map(aggregate.cases.map((entry) => [entry.source.caseId, entry]))
const targetedEntries = TARGET_CASE_IDS.map((caseId) => {
	const entry = aggregateByCase.get(caseId)
	if (!entry || broadCaseIds.has(caseId)) throw new Error(`Targeted architecture case is unavailable: ${caseId}`)
	return entry
})
const targetedWithoutId = {
	schemaVersion: 1,
	reviewVersion: REVIEW_VERSION,
	reviewUnit: "independent-validity-plus-preference-among-selected-for-field-role-and-ranking-architecture",
	candidateVersion: "album-artwork-first-principles-0.4.0",
	implementationHash: aggregate.implementationHash,
	developmentManifestId: aggregate.developmentManifestId,
	scientificSha256: aggregate.scientificSha256,
	selectionDomain: REVIEW_VERSION,
	preferencePolicy: "preferred option is optional and must be one of the independently valid options",
	cases: targetedEntries.map((entry) => {
		const candidates: CompletePaletteTreatment[] = []
		const addCandidate = (treatment: CompletePaletteTreatment): void => {
			if (candidates.length >= 4 || candidates.some((candidate) =>
				completeDirectionKey(candidate) === completeDirectionKey(treatment) || visuallyNear(candidate, treatment))) return
			candidates.push(treatment)
		}
		addCandidate(entry.extraction.winner)
		addCandidate(entry.extraction.diagnostics.legacyScalarTopTreatment)
		for (const treatment of [...(priorPositives.get(entry.source.caseId) ?? [])].reverse()) addCandidate(treatment)
		for (const treatment of entry.extraction.alternatives) addCandidate(treatment)
		if (candidates.length < 2) throw new Error(`Insufficient targeted directions for ${entry.source.caseId}`)
		const ordered = candidates.sort((first, second) => sha256(`${aggregate.scientificSha256}\0${entry.source.sha256}\0${first.id}`)
			.localeCompare(sha256(`${aggregate.scientificSha256}\0${entry.source.sha256}\0${second.id}`)))
		return {
			caseId: entry.source.caseId,
			sourceSha256: entry.source.sha256,
			sourcePath: entry.source.path,
			cohort: entry.source.cohort,
			structureTags: entry.source.structureTags,
			dimensions: entry.dimensions,
			options: ordered.map((treatment, index) => ({
				optionId: String.fromCharCode(65 + index),
				treatment,
				presentation: presentationFor(treatment),
			})),
		}
	}),
}
const targetedReview = { ...targetedWithoutId, manifestId: sha256(canonicalJson(targetedWithoutId)) }

const analysis = {
	schemaVersion: 1,
	candidateVersion: "album-artwork-first-principles-0.4.0",
	implementationHash: aggregate.implementationHash,
	developmentManifestId: aggregate.developmentManifestId,
	scientificSha256: aggregate.scientificSha256,
	sourceCount: aggregate.cases.length,
	mechanical: {
		eligibleFieldDomainCoverage: perCase.filter(({ eligibleFieldDomainAvailable }) => eligibleFieldDomainAvailable).length,
		gradientHypothesisCoverage: perCase.filter(({ gradientHypothesisAvailable }) => gradientHypothesisAvailable).length,
		winnerGradients: perCase.filter(({ winnerGradient }) => winnerGradient).length,
		gradientWinnerHighEndpointBackgrounds,
		winnerStructures: counts(perCase.map(({ winnerStructure }) => winnerStructure)),
		paretoDiffersFromLegacyScalar: perCase.filter(({ paretoDiffersFromLegacyScalar }) => paretoDiffersFromLegacyScalar).length,
		meanParetoFrontierCandidates: perCase.reduce((sum, { paretoFrontierCandidateCount }) => sum + paretoFrontierCandidateCount, 0) / perCase.length,
		meanParetoFrontierDirections: perCase.reduce((sum, { paretoFrontierDirectionCount }) => sum + paretoFrontierDirectionCount, 0) / perCase.length,
		candidateRoleLaneClosure: aggregate.cases.every(({ extraction }) => {
			const trace = extraction.diagnostics.candidateAvailability
			return trace.completeCandidateForegroundFamilyIds.every((id) => trace.foregroundLaneFamilyIds.includes(id)) &&
				trace.completeCandidateAccentFamilyIds.every((id) => trace.signatureLaneFamilyIds.includes(id))
		}),
		evidenceLevelDominance: aggregate.cases.every(({ extraction }) => extraction.diagnostics.paretoRanking.dominanceUsesEvidenceLevels),
	},
	predecessorComparison: {
		exactWinnerMatches: exactPredecessorWinnerMatches,
		structureChanges,
		gradientChanges,
		interpretation: "Mechanical comparison only; prior review omissions remain unlabeled.",
	},
	reviewPreparation: {
		lightweightTopOneCaseIds: [...broadCaseIds],
		targetedArchitectureCaseIds: [...TARGET_CASE_IDS],
		freshSampleOpened: false,
	},
	perCase,
}

await Promise.all([
	atomicJson(resolve(experimentDirectory, "development-analysis.json"), analysis),
	atomicJson(resolve(experimentDirectory, "targeted-review-manifest.json"), targetedReview),
])

process.stdout.write(`${JSON.stringify(analysis.mechanical)}\n`)
process.stdout.write(`Prepared ${targetedEntries.length} targeted architecture cases\n`)
