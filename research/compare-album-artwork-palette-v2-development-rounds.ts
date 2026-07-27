import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

type Treatment = Readonly<{
	id: string
	gradient: boolean
	cardinality: number
	collapse: Readonly<{ surface: boolean; accent: boolean }>
}>

type ReviewCase = Readonly<{
	caseId: string
	sourceSha256: string
	winnerTreatmentId: string
	alternatives: readonly Treatment[]
}>

type ReviewManifest = Readonly<{
	manifestId: string
	scientificSha256: string
	cases: readonly ReviewCase[]
}>

type Feedback = Readonly<{
	entries: ReadonlyArray<Readonly<{ caseId: string; tags: readonly string[] }>>
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const experiments = resolve(moduleDirectory, "data/experiments")
const roundOneDirectory = resolve(experiments, "album-artwork-palette-v2-0.1.0-development")
const roundTwoDirectory = resolve(experiments, "album-artwork-palette-v2-0.2.0-development")
const outputPath = resolve(roundTwoDirectory, "round-2-preflight.json")

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex")
}

function structure(treatment: Treatment): string {
	if (treatment.collapse.surface && treatment.collapse.accent) return "two-colors"
	if (treatment.collapse.surface) return "three-colors-surface-collapsed"
	if (treatment.collapse.accent) return "three-colors-accent-collapsed"
	return "four-colors"
}

function counts(values: readonly string[]): Record<string, number> {
	const output: Record<string, number> = {}
	for (const value of values) output[value] = (output[value] ?? 0) + 1
	return output
}

function metrics(manifest: ReviewManifest) {
	const treatments = manifest.cases.flatMap(({ alternatives }) => alternatives)
	const winners = manifest.cases.map((reviewCase) => {
		const winner = reviewCase.alternatives.find(({ id }) => id === reviewCase.winnerTreatmentId)
		if (!winner) throw new Error(`Missing winner for ${reviewCase.caseId}`)
		return winner
	})
	return {
		caseCount: manifest.cases.length,
		retainedTreatmentCount: treatments.length,
		winnerStructures: counts(winners.map(structure)),
		slateStructures: counts(treatments.map(structure)),
		winnerSurfaceCollapsed: winners.filter(({ collapse }) => collapse.surface).length,
		slateSurfaceCollapsed: treatments.filter(({ collapse }) => collapse.surface).length,
		winnerGradients: winners.filter(({ gradient }) => gradient).length,
		slateGradients: treatments.filter(({ gradient }) => gradient).length,
		casesWithRetainedGradient: manifest.cases.filter(({ alternatives }) => alternatives.some(({ gradient }) => gradient)).length,
	}
}

const [roundOne, roundTwo, feedback, fresh] = await Promise.all([
	readFile(resolve(roundOneDirectory, "review-manifest.json"), "utf8").then((value) => JSON.parse(value) as ReviewManifest),
	readFile(resolve(roundTwoDirectory, "review-manifest.json"), "utf8").then((value) => JSON.parse(value) as ReviewManifest),
	readFile(resolve(moduleDirectory, "data/album-artwork-palette-v2-feedback.json"), "utf8").then((value) => JSON.parse(value) as Feedback),
	readFile(resolve(moduleDirectory, "data/album-artwork-palette-v2-fresh-sample.sealed.json"), "utf8").then(JSON.parse),
])
const freshHashes = new Set<string>(fresh.sources.map(({ sha256: sourceHash }: { sha256: string }) => sourceHash))
if ([...roundOne.cases, ...roundTwo.cases].some(({ sourceSha256 }) => freshHashes.has(sourceSha256))) {
	throw new Error("A development round overlaps the sealed fresh sample")
}
const priorMissingGradientCaseIds = feedback.entries
	.filter(({ tags }) => tags.includes("missing gradient"))
	.map(({ caseId }) => caseId)
const priorGradientAvailability = []
for (const caseId of priorMissingGradientCaseIds) {
	const [roundOneArtifact, roundTwoArtifact] = await Promise.all([
		readFile(resolve(roundOneDirectory, `sources/${caseId}.json`), "utf8").then(JSON.parse),
		readFile(resolve(roundTwoDirectory, `sources/${caseId}.json`), "utf8").then(JSON.parse),
	])
	const roundOneCase = roundOne.cases.find((candidate) => candidate.caseId === caseId)
	const roundTwoCase = roundTwo.cases.find((candidate) => candidate.caseId === caseId)
	if (!roundOneCase || !roundTwoCase) throw new Error(`Missing comparison case ${caseId}`)
	priorGradientAvailability.push({
		caseId,
		roundOne: {
			hypothesis: roundOneArtifact.extraction.diagnostics.fieldHypotheses.some(({ kind }: { kind: string }) => kind === "gradient-field"),
			retainedCount: roundOneCase.alternatives.filter(({ gradient }) => gradient).length,
		},
		roundTwo: {
			hypothesis: roundTwoArtifact.extraction.diagnostics.fieldHypotheses.some(({ kind }: { kind: string }) => kind === "gradient-field"),
			retainedCount: roundTwoCase.alternatives.filter(({ gradient }) => gradient).length,
		},
	})
}
const comparisonWithoutId = {
	schemaVersion: 1,
	roundOne: {
		manifestId: roundOne.manifestId,
		scientificSha256: roundOne.scientificSha256,
		metrics: metrics(roundOne),
	},
	roundTwo: {
		manifestId: roundTwo.manifestId,
		scientificSha256: roundTwo.scientificSha256,
		metrics: metrics(roundTwo),
	},
	priorMissingGradientAvailability: priorGradientAvailability,
	gates: {
		freshSampleOpened: false,
		mechanismAndArtifactTestsRequired: true,
		humanQualityReviewPending: true,
		phaseFourAuthorized: false,
	},
	interpretation: [
		"Round 2 corrects measured collapse and gradient-availability mechanisms; it does not prove improved human quality.",
		"Round 1 selected treatments remain non-exclusive preferences, not target palettes or negative labels for other directions.",
		"Round 2 requires a new bounded human review before any candidate freeze or fresh-sample access.",
	],
}
const comparison = { ...comparisonWithoutId, comparisonId: sha256(JSON.stringify(comparisonWithoutId)) }
const temporary = `${outputPath}.${process.pid}.tmp`
await writeFile(temporary, `${JSON.stringify(comparison, null, 2)}\n`)
await rename(temporary, outputPath)
process.stdout.write(`Prepared round comparison ${comparison.comparisonId}\n`)
