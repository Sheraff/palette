import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	completeDirectionKey,
	fieldDirectionKey,
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

type TargetedReviewManifest = Readonly<{
	cases: ReadonlyArray<Readonly<{
		caseId: string
		options: ReadonlyArray<Readonly<{ optionId: string; treatment: CompletePaletteTreatment }>>
	}>>
}>

type TargetedFeedback = Readonly<{
	entries: ReadonlyArray<Readonly<{ caseId: string; validOptionIds: readonly string[] }>>
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const experimentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.3.3-development")
const predecessorDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.3.2-development")

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

const [aggregate, predecessor, broadReview, predecessorTargetedReview, predecessorTargetedFeedback] = await Promise.all([
	readFile(resolve(experimentDirectory, "aggregate.json"), "utf8").then((value) => JSON.parse(value) as Aggregate),
	readFile(resolve(predecessorDirectory, "aggregate.json"), "utf8").then((value) => JSON.parse(value) as Aggregate),
	readFile(resolve(experimentDirectory, "review-manifest.json"), "utf8").then(JSON.parse) as Promise<Readonly<{ cases: ReadonlyArray<Readonly<{ caseId: string }>> }>>,
	readFile(resolve(predecessorDirectory, "targeted-review-manifest.json"), "utf8").then((value) => JSON.parse(value) as TargetedReviewManifest),
	readFile(resolve(moduleDirectory, "data/album-artwork-palette-v2-0.3.2-targeted-feedback.json"), "utf8").then((value) => JSON.parse(value) as TargetedFeedback),
])

const predecessorByCase = new Map(predecessor.cases.map((entry) => [entry.source.caseId, entry]))
let exactPredecessorWinnerMatches = 0
let structureChanges = 0
let gradientChanges = 0
const perCase = aggregate.cases.map((entry) => {
	const old = predecessorByCase.get(entry.source.caseId)
	if (!old) throw new Error(`Missing predecessor case ${entry.source.caseId}`)
	const exactWinnerMatch = treatmentKey(entry.extraction.winner) === treatmentKey(old.extraction.winner)
	const structureChanged = structure(entry.extraction.winner) !== structure(old.extraction.winner)
	const gradientChanged = entry.extraction.winner.gradient !== old.extraction.winner.gradient
	if (exactWinnerMatch) exactPredecessorWinnerMatches += 1
	if (structureChanged) structureChanges += 1
	if (gradientChanged) gradientChanges += 1
	return {
		caseId: entry.source.caseId,
		connectedFieldDomainAvailable: entry.extraction.diagnostics.fieldDomains.some(({ eligible }) => eligible),
		gradientHypothesisAvailable: entry.extraction.diagnostics.fieldHypotheses.some(({ kind }) => kind === "gradient-field"),
		paretoDiffersFromLegacyScalar: entry.extraction.diagnostics.paretoRanking.differsFromLegacyScalar,
		paretoFrontierCandidateCount: entry.extraction.diagnostics.paretoRanking.frontierCandidateCount,
		paretoFrontierDirectionCount: entry.extraction.diagnostics.paretoRanking.frontierDirectionCount,
		winnerStructure: structure(entry.extraction.winner),
		winnerGradient: entry.extraction.winner.gradient,
		exactPredecessorWinnerMatch: exactWinnerMatch,
		structureChanged,
		gradientChanged,
	}
})

const broadCaseIds = new Set(broadReview.cases.map(({ caseId }) => caseId))
const predecessorTargetedCases = new Map(predecessorTargetedReview.cases.map((entry) => [entry.caseId, entry]))
const predecessorPositiveTreatments = new Map<string, CompletePaletteTreatment[]>()
for (const entry of predecessorTargetedFeedback.entries) {
	const reviewCase = predecessorTargetedCases.get(entry.caseId)
	if (!reviewCase) throw new Error(`Missing predecessor targeted case ${entry.caseId}`)
	const positives = entry.validOptionIds.map((optionId) => {
		const option = reviewCase.options.find((candidate) => candidate.optionId === optionId)
		if (!option) throw new Error(`Missing predecessor option ${entry.caseId}/${optionId}`)
		return option.treatment
	})
	predecessorPositiveTreatments.set(entry.caseId, positives)
}
const targetedEligible = aggregate.cases.filter((entry) => {
	const pareto = entry.extraction.winner
	const scalar = entry.extraction.diagnostics.legacyScalarTopTreatment
	return !broadCaseIds.has(entry.source.caseId) &&
		entry.extraction.diagnostics.paretoRanking.differsFromLegacyScalar &&
		completeDirectionKey(pareto) !== completeDirectionKey(scalar) &&
		!visuallyNear(pareto, scalar) &&
		new Set(entry.extraction.alternatives.map(completeDirectionKey)).size >= 2
})
	.sort((first, second) => sha256([
		"album-artwork-palette-v2-pareto-mechanism-review-v4",
		aggregate.developmentManifestId,
		aggregate.scientificSha256,
		first.source.sha256,
	].join("\0")).localeCompare(sha256([
		"album-artwork-palette-v2-pareto-mechanism-review-v4",
		aggregate.developmentManifestId,
		aggregate.scientificSha256,
		second.source.sha256,
	].join("\0"))))
	.slice(0, 4)

const targetedWithoutId = {
	schemaVersion: 1,
	reviewVersion: "album-artwork-palette-v2-pareto-mechanism-review-v4",
	reviewUnit: "independent-validity-subset-for-current-pareto-legacy-scalar-and-predecessor-positive-directions",
	candidateVersion: "album-artwork-first-principles-0.3.3",
	implementationHash: aggregate.implementationHash,
	developmentManifestId: aggregate.developmentManifestId,
	scientificSha256: aggregate.scientificSha256,
	selectionDomain: "album-artwork-palette-v2-pareto-mechanism-review-v4",
	cases: targetedEligible.map((entry) => {
		const candidates: CompletePaletteTreatment[] = []
		const addCandidate = (treatment: CompletePaletteTreatment): void => {
			if (candidates.length >= 4 || candidates.some((candidate) =>
				completeDirectionKey(candidate) === completeDirectionKey(treatment) || visuallyNear(candidate, treatment))) return
			candidates.push(treatment)
		}
		addCandidate(entry.extraction.winner)
		addCandidate(entry.extraction.diagnostics.legacyScalarTopTreatment)
		for (const treatment of predecessorPositiveTreatments.get(entry.source.caseId) ?? []) addCandidate(treatment)
		for (const treatment of entry.extraction.alternatives) {
			if (candidates.length >= 4) break
			addCandidate(treatment)
		}
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
	candidateVersion: "album-artwork-first-principles-0.3.3",
	implementationHash: aggregate.implementationHash,
	developmentManifestId: aggregate.developmentManifestId,
	scientificSha256: aggregate.scientificSha256,
	sourceCount: aggregate.cases.length,
	mechanical: {
		connectedFieldDomainCoverage: perCase.filter(({ connectedFieldDomainAvailable }) => connectedFieldDomainAvailable).length,
		gradientHypothesisCoverage: perCase.filter(({ gradientHypothesisAvailable }) => gradientHypothesisAvailable).length,
		winnerGradients: perCase.filter(({ winnerGradient }) => winnerGradient).length,
		winnerStructures: counts(perCase.map(({ winnerStructure }) => winnerStructure)),
		paretoDiffersFromLegacyScalar: perCase.filter(({ paretoDiffersFromLegacyScalar }) => paretoDiffersFromLegacyScalar).length,
		meanParetoFrontierCandidates: perCase.reduce((sum, { paretoFrontierCandidateCount }) => sum + paretoFrontierCandidateCount, 0) / perCase.length,
		meanParetoFrontierDirections: perCase.reduce((sum, { paretoFrontierDirectionCount }) => sum + paretoFrontierDirectionCount, 0) / perCase.length,
		candidateRoleLaneClosure: aggregate.cases.every(({ extraction }) => {
			const trace = extraction.diagnostics.candidateAvailability
			return trace.completeCandidateForegroundFamilyIds.every((id) => trace.foregroundLaneFamilyIds.includes(id)) &&
				trace.completeCandidateAccentFamilyIds.every((id) => trace.signatureLaneFamilyIds.includes(id))
		}),
	},
	predecessorComparison: {
		exactWinnerMatches: exactPredecessorWinnerMatches,
		structureChanges,
		gradientChanges,
		interpretation: "This is a mechanical comparison with 0.3.2; it does not convert prior review omissions into negative labels.",
	},
	reviewPreparation: {
		lightweightTopOneCaseIds: [...broadCaseIds],
		targetedMechanismEligibleCount: targetedEligible.length,
		targetedMechanismCaseIds: targetedEligible.map(({ source }) => source.caseId),
		freshSampleOpened: false,
	},
	perCase,
}

await Promise.all([
	atomicJson(resolve(experimentDirectory, "development-analysis.json"), analysis),
	atomicJson(resolve(experimentDirectory, "targeted-review-manifest.json"), targetedReview),
])

process.stdout.write(`${JSON.stringify(analysis.mechanical)}\n`)
process.stdout.write(`Prepared ${targetedEligible.length} targeted mechanism cases\n`)
