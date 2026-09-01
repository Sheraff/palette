import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	parsePhase4PrivateReviewManifest,
	parsePhase4ReviewFeedbackStore,
	type Phase4Comparison,
	type Phase4ReviewSide,
} from "./src/album-artwork-palette-v2-phase-4-review.ts"
import type { AbsoluteQualityLabel, ReviewIssueTag } from "./src/album-artwork-palette-v2-protocol.ts"

type Preparation = Readonly<{
	manifestId: string
	candidateVersion: string
	implementationHash: string
	scientificSha256: string
	predecessorVersion: string
	predecessorImplementationHash: string
	predecessorScientificSha256: string
	reviewCaseCount: number
	candidateSideCounts: Readonly<{ A: number; B: number }>
	inputHashes: Readonly<{
		currentAggregateSha256: string
		predecessorAggregateSha256: string
		currentSummarySha256: string
		reviewProtocolSha256: string
	}>
}>

type TechnicalInterpretation = Readonly<{
	caseId: string
	target: "candidate" | "predecessor" | "shared"
	commentSha256: string
	classes: readonly string[]
	rationale: string
	uncertain: boolean
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const experimentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.7.0-development")
const manifestPath = resolve(experimentDirectory, "identity-obligation-review-manifest.private.json")
const preparationPath = resolve(experimentDirectory, "identity-obligation-review-preparation.json")
const feedbackPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-0.7.0-identity-obligation-feedback.json")
const currentAggregatePath = resolve(experimentDirectory, "aggregate.json")
const predecessorAggregatePath = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.6.0-development/aggregate.json")
const summaryPath = resolve(experimentDirectory, "summary.json")
const protocolPath = resolve(moduleDirectory, "ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_7_0_IDENTITY_REVIEW.md")
const analysisPath = resolve(experimentDirectory, "identity-obligation-review-analysis.json")
const interpretationsPath = resolve(experimentDirectory, "identity-obligation-technical-interpretations.json")

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

function counts<T extends string>(values: readonly T[]): Record<T, number> {
	return Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((candidate) => candidate === value).length])) as Record<T, number>
}

function relativeOutcome(
	comparison: Phase4Comparison,
	candidateSide: Phase4ReviewSide,
): "candidate-stronger" | "predecessor-stronger" | "similarly-valid" | "neither-acceptable" | "uncertain" {
	if (comparison === "similarly-valid" || comparison === "neither-acceptable" || comparison === "uncertain") return comparison
	const strongerSide = comparison === "a-stronger" ? "A" : "B"
	return strongerSide === candidateSide ? "candidate-stronger" : "predecessor-stronger"
}

const [manifestRaw, preparationRaw, feedbackRaw, currentRaw, predecessorRaw, summaryRaw, protocolRaw] = await Promise.all([
	readFile(manifestPath, "utf8"),
	readFile(preparationPath, "utf8"),
	readFile(feedbackPath, "utf8"),
	readFile(currentAggregatePath, "utf8"),
	readFile(predecessorAggregatePath, "utf8"),
	readFile(summaryPath, "utf8"),
	readFile(protocolPath, "utf8"),
])
const manifest = parsePhase4PrivateReviewManifest(JSON.parse(manifestRaw) as unknown)
const preparation = JSON.parse(preparationRaw) as Preparation
const feedback = parsePhase4ReviewFeedbackStore(JSON.parse(feedbackRaw) as unknown, manifest)
if (preparation.manifestId !== manifest.manifestId || preparation.reviewCaseCount !== 12 ||
	preparation.candidateSideCounts.A !== 6 || preparation.candidateSideCounts.B !== 6 ||
	preparation.inputHashes.currentAggregateSha256 !== sha256(currentRaw) ||
	preparation.inputHashes.predecessorAggregateSha256 !== sha256(predecessorRaw) ||
	preparation.inputHashes.currentSummarySha256 !== sha256(summaryRaw) ||
	preparation.inputHashes.reviewProtocolSha256 !== sha256(protocolRaw)) {
	throw new Error("Identity-obligation review preparation binding is stale")
}
if (feedback.entries.length !== manifest.cases.length ||
	new Set(feedback.entries.map(({ caseId }) => caseId)).size !== manifest.cases.length) {
	throw new Error("Identity-obligation review feedback is incomplete")
}

const feedbackByCase = new Map(feedback.entries.map((entry) => [entry.caseId, entry]))
const caseResults = manifest.cases.map((reviewCase) => {
	const entry = feedbackByCase.get(reviewCase.caseId)
	if (!entry) throw new Error(`Missing feedback for ${reviewCase.caseId}`)
	const candidateSide: Phase4ReviewSide = reviewCase.assignment.A === "candidate" ? "A" : "B"
	const predecessorSide: Phase4ReviewSide = candidateSide === "A" ? "B" : "A"
	return {
		caseId: reviewCase.caseId,
		sourceSha256: reviewCase.source.sha256,
		candidateSide,
		candidateQuality: entry[`quality${candidateSide}`] as AbsoluteQualityLabel,
		predecessorQuality: entry[`quality${predecessorSide}`] as AbsoluteQualityLabel,
		relativeOutcome: relativeOutcome(entry.comparison, candidateSide),
		candidateTags: entry[`tags${candidateSide}`] as readonly ReviewIssueTag[],
		predecessorTags: entry[`tags${predecessorSide}`] as readonly ReviewIssueTag[],
		comment: entry.comment,
		commentSha256: sha256(entry.comment),
		submittedAt: entry.submittedAt,
	}
})

const interpretationDefinitions: ReadonlyArray<Readonly<{
	caseId: string
	target: TechnicalInterpretation["target"]
	classes: readonly string[]
	rationale: string
	uncertain: boolean
}>> = [
	{
		caseId: "development-03",
		target: "candidate",
		classes: ["identity-obligation-coverage-precedence-regression", "field-treatment-regression-missing-gradient"],
		rationale: "The candidate was preferred for its role colors, but the comment requires a gradient that the identity-prioritized winner discarded.",
		uncertain: false,
	},
	{
		caseId: "development-19",
		target: "candidate",
		classes: ["identity-obligation-coverage-precedence-regression", "field-treatment-regression-surface-collapse"],
		rationale: "The comment explicitly likes the candidate colors but says its collapsed surface omits supported pastel field structure.",
		uncertain: false,
	},
	{
		caseId: "development-15",
		target: "candidate",
		classes: ["identity-obligation-coverage-precedence-regression", "accent-utility-regression"],
		rationale: "The comment likes the candidate colors but reports that the identity-bearing accent is difficult to distinguish over the background.",
		uncertain: false,
	},
	{
		caseId: "development-12",
		target: "candidate",
		classes: ["identity-obligation-coverage-precedence-regression", "identity-complement-regression-missing-dark-anchor"],
		rationale: "The candidate carries bright yellow identity but omits the artwork's contrasting black identity, leaving neither reviewed option acceptable.",
		uncertain: false,
	},
	{
		caseId: "development-26",
		target: "shared",
		classes: ["foreground-polarity-misalignment"],
		rationale: "The comment applies to both options and asks for the artwork's light-foreground-over-darker-field polarity.",
		uncertain: false,
	},
	{
		caseId: "development-13",
		target: "shared",
		classes: ["gradient-availability-shared"],
		rationale: "The optional slight-gradient request applies equally to both reviewed treatments.",
		uncertain: true,
	},
]
const interpretations: TechnicalInterpretation[] = interpretationDefinitions.map((definition) => {
	const result = caseResults.find(({ caseId }) => caseId === definition.caseId)
	if (!result || result.comment.length === 0) throw new Error(`Interpretation lacks a bound comment for ${definition.caseId}`)
	return { ...definition, commentSha256: result.commentSha256 }
})
const classCounts = counts(interpretations.flatMap(({ classes }) => classes))
const repeatedNewSystemicClasses = Object.entries(classCounts)
	.filter(([name, count]) => name.startsWith("identity-obligation-") && count > 1)
	.map(([name]) => name)

const candidateQualityCounts = counts(caseResults.map(({ candidateQuality }) => candidateQuality))
const predecessorQualityCounts = counts(caseResults.map(({ predecessorQuality }) => predecessorQuality))
const relativeCounts = counts(caseResults.map(({ relativeOutcome: outcome }) => outcome))
const candidatePositiveCount = caseResults.filter(({ candidateQuality }) =>
	 candidateQuality === "strong" || candidateQuality === "acceptable").length
const predecessorPositiveCount = caseResults.filter(({ predecessorQuality }) =>
	predecessorQuality === "strong" || predecessorQuality === "acceptable").length
const candidateIncompleteIdentityTagCount = caseResults.filter(({ candidateTags }) =>
	candidateTags.includes("incomplete artwork identity")).length
const predecessorIncompleteIdentityTagCount = caseResults.filter(({ predecessorTags }) =>
	predecessorTags.includes("incomplete artwork identity")).length
const gate = {
	absoluteQuality: {
		pass: candidatePositiveCount >= 9,
		candidatePositiveCount,
		required: 9,
	},
	relativeImprovement: {
		pass: (relativeCounts["candidate-stronger"] ?? 0) > (relativeCounts["predecessor-stronger"] ?? 0),
		candidateStronger: relativeCounts["candidate-stronger"] ?? 0,
		predecessorStronger: relativeCounts["predecessor-stronger"] ?? 0,
	},
	incompleteIdentityReduction: {
		pass: candidateIncompleteIdentityTagCount < predecessorIncompleteIdentityTagCount,
		candidate: candidateIncompleteIdentityTagCount,
		predecessor: predecessorIncompleteIdentityTagCount,
	},
	noRepeatedNewSystemicFailureClass: {
		pass: repeatedNewSystemicClasses.length === 0,
		repeatedClasses: repeatedNewSystemicClasses,
	},
}
const gatePass = Object.values(gate).every(({ pass }) => pass)
const interpretationsWithoutId = {
	schemaVersion: 1,
	reviewVersion: manifest.reviewVersion,
	manifestId: manifest.manifestId,
	entries: interpretations,
	classCounts,
	repeatedNewSystemicClasses,
}
const interpretationArtifact = {
	...interpretationsWithoutId,
	interpretationId: sha256(canonicalJson(interpretationsWithoutId)),
}
const analysisWithoutId = {
	schemaVersion: 1,
	reviewVersion: manifest.reviewVersion,
	manifestId: manifest.manifestId,
	candidateVersion: preparation.candidateVersion,
	implementationHash: preparation.implementationHash,
	scientificSha256: preparation.scientificSha256,
	predecessorVersion: preparation.predecessorVersion,
	predecessorImplementationHash: preparation.predecessorImplementationHash,
	predecessorScientificSha256: preparation.predecessorScientificSha256,
	inputHashes: {
		manifestSha256: sha256(manifestRaw),
		preparationSha256: sha256(preparationRaw),
		feedbackSha256: sha256(feedbackRaw),
		interpretationId: interpretationArtifact.interpretationId,
	},
	reviewedCaseCount: caseResults.length,
	candidateQualityCounts,
	predecessorQualityCounts,
	candidatePositiveCount,
	predecessorPositiveCount,
	relativeCounts,
	candidateIncompleteIdentityTagCount,
	predecessorIncompleteIdentityTagCount,
	caseResults,
	gate,
	gatePass,
	disposition: gatePass
		? "identity-obligation-development-review-passed-no-advancement-authorized"
		: "identity-obligation-mechanics-passed-human-development-gate-failed-revise-architecture",
	authorization: {
		futureSample: false,
		phase5: false,
		promotion: false,
		persistence: false,
		fullRoster: false,
	},
}
const analysis = { ...analysisWithoutId, analysisId: sha256(canonicalJson(analysisWithoutId)) }
await Promise.all([
	atomicJson(interpretationsPath, interpretationArtifact),
	atomicJson(analysisPath, analysis),
])
process.stdout.write(`${JSON.stringify({
	candidateQualityCounts,
	predecessorQualityCounts,
	relativeCounts,
	gate,
	gatePass,
	disposition: analysis.disposition,
})}\n`)
