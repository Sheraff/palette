import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { isDeepStrictEqual } from "node:util"
import { writeJsonAtomic } from "./src/candidate-output.ts"
import {
	decideGradientEligibility,
	GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	GRADIENT_ELIGIBILITY_THRESHOLDS,
	type GradientEligibilityEvidence,
} from "./src/gradient-eligibility.ts"

type Classification = "true-background-gradient" | "flat-background-isolated-surface" | "not-gradient-other" |
	"gradient-wrong-endpoints" | "uncertain"
type Confidence = "high" | "medium" | "low"
type ReviewQueueEntry = { familyId: string; batch: number; stratum: string }
type DevelopmentEntry = {
	familyId: string
	anchor: { file: string }
	palette: { background: { rgb: readonly number[] }; surface: { rgb: readonly number[] } }
	evidence: GradientEligibilityEvidence
}
type Development = {
	schemaVersion: 1
	developmentVersion: string
	experimentVersion: string
	algorithmVersion: string
	reviewQueue: ReviewQueueEntry[]
	entries: DevelopmentEntry[]
}
type FeedbackEntry = {
	familyId: string
	classification: Classification
	confidence: Confidence
	note: string
	submittedAt: string
}
type Feedback = {
	schemaVersion: 1
	experimentVersion: string
	developmentSha256: string
	htmlSha256: string
	entries: FeedbackEntry[]
}
type BinaryResult = { truth: boolean; predicted: boolean }

const classifications = new Set<Classification>([
	"true-background-gradient",
	"flat-background-isolated-surface",
	"not-gradient-other",
	"gradient-wrong-endpoints",
	"uncertain",
])
const confidences = new Set<Confidence>(["high", "medium", "low"])
const [developmentArgument, htmlArgument, feedbackArgument, outputArgument, candidateDevelopmentArgument] = process.argv.slice(2)
if (!developmentArgument || !htmlArgument || !feedbackArgument || !outputArgument) {
	throw new Error("Usage: analyze-gradient-eligibility-review.ts <development.json> <review.html> <feedback.json> <output.json> [candidate-development.json]")
}

function sha256(value: Buffer): string {
	return createHash("sha256").update(value).digest("hex")
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseDevelopment(value: unknown): Development {
	if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.developmentVersion !== "string" ||
		typeof value.experimentVersion !== "string" || typeof value.algorithmVersion !== "string" ||
		!Array.isArray(value.reviewQueue) || !Array.isArray(value.entries)) throw new Error("Development evidence is invalid")
	const entries = new Set<string>()
	for (const entry of value.entries) {
		if (!isRecord(entry) || typeof entry.familyId !== "string" || entries.has(entry.familyId) ||
			!isRecord(entry.anchor) || typeof entry.anchor.file !== "string" || !isRecord(entry.palette) ||
			!isRecord(entry.palette.background) || !Array.isArray(entry.palette.background.rgb) ||
			!isRecord(entry.palette.surface) || !Array.isArray(entry.palette.surface.rgb) ||
			!isRecord(entry.evidence)) throw new Error("Development entry is invalid or duplicated")
		entries.add(entry.familyId)
	}
	const queued = new Set<string>()
	for (const item of value.reviewQueue) {
		if (!isRecord(item) || typeof item.familyId !== "string" || !entries.has(item.familyId) ||
			queued.has(item.familyId) || !Number.isInteger(item.batch) || typeof item.stratum !== "string") {
			throw new Error("Review queue is invalid or duplicated")
		}
		queued.add(item.familyId)
	}
	return value as unknown as Development
}

function parseFeedback(value: unknown): Feedback {
	if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.experimentVersion !== "string" ||
		typeof value.developmentSha256 !== "string" || typeof value.htmlSha256 !== "string" ||
		!Array.isArray(value.entries)) throw new Error("Feedback is invalid")
	const seen = new Set<string>()
	for (const entry of value.entries) {
		if (!isRecord(entry) || typeof entry.familyId !== "string" || seen.has(entry.familyId) ||
			typeof entry.classification !== "string" || !classifications.has(entry.classification as Classification) ||
			typeof entry.confidence !== "string" || !confidences.has(entry.confidence as Confidence) ||
			typeof entry.note !== "string" || typeof entry.submittedAt !== "string" ||
			!Number.isFinite(Date.parse(entry.submittedAt))) throw new Error("Feedback entry is invalid or duplicated")
		seen.add(entry.familyId)
	}
	return value as unknown as Feedback
}

function counts<T extends string>(values: readonly T[]): Record<T, number> {
	const result = {} as Record<T, number>
	for (const value of values) result[value] = (result[value] ?? 0) + 1
	return result
}

function confusion(results: BinaryResult[]): {
	evaluated: number
	truePositive: number
	trueNegative: number
	falsePositive: number
	falseNegative: number
} {
	return {
		evaluated: results.length,
		truePositive: results.filter((result) => result.truth && result.predicted).length,
		trueNegative: results.filter((result) => !result.truth && !result.predicted).length,
		falsePositive: results.filter((result) => !result.truth && result.predicted).length,
		falseNegative: results.filter((result) => result.truth && !result.predicted).length,
	}
}

function distribution(values: number[]): { minimum: number; median: number; maximum: number } | null {
	if (values.length === 0) return null
	const sorted = [...values].sort((first, second) => first - second)
	const middle = Math.floor(sorted.length / 2)
	const median = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
	return { minimum: sorted[0], median, maximum: sorted[sorted.length - 1] }
}

const [developmentSource, htmlSource, feedbackSource] = await Promise.all([
	readFile(resolve(developmentArgument)),
	readFile(resolve(htmlArgument)),
	readFile(resolve(feedbackArgument)),
])
const development = parseDevelopment(JSON.parse(developmentSource.toString("utf8")) as unknown)
const candidateDevelopmentSource = candidateDevelopmentArgument
	? await readFile(resolve(candidateDevelopmentArgument))
	: developmentSource
const candidateDevelopment = parseDevelopment(JSON.parse(candidateDevelopmentSource.toString("utf8")) as unknown)
const feedback = parseFeedback(JSON.parse(feedbackSource.toString("utf8")) as unknown)
if (feedback.experimentVersion !== development.experimentVersion ||
	feedback.developmentSha256 !== sha256(developmentSource) || feedback.htmlSha256 !== sha256(htmlSource)) {
	throw new Error("Feedback provenance does not match the development evidence and review HTML")
}
const queueIds = new Set(development.reviewQueue.map((entry) => entry.familyId))
const feedbackIds = new Set(feedback.entries.map((entry) => entry.familyId))
if (queueIds.size !== feedbackIds.size || [...queueIds].some((familyId) => !feedbackIds.has(familyId))) {
	throw new Error(`Review is incomplete: expected ${queueIds.size} labels, received ${feedbackIds.size}`)
}
const entriesByFamily = new Map(development.entries.map((entry) => [entry.familyId, entry]))
const candidateEntriesByFamily = new Map(candidateDevelopment.entries.map((entry) => [entry.familyId, entry]))
const queueByFamily = new Map(development.reviewQueue.map((entry) => [entry.familyId, entry]))
const labeled = feedback.entries.map((label) => {
	const reviewedEntry = entriesByFamily.get(label.familyId)!
	const entry = candidateEntriesByFamily.get(label.familyId)
	if (!entry || entry.anchor.file !== reviewedEntry.anchor.file ||
		!isDeepStrictEqual(entry.palette.background.rgb, reviewedEntry.palette.background.rgb) ||
		!isDeepStrictEqual(entry.palette.surface.rgb, reviewedEntry.palette.surface.rgb)) {
		throw new Error(`Candidate evidence changed the reviewed endpoint pair for ${label.familyId}`)
	}
	const queue = queueByFamily.get(label.familyId)!
	const candidate = decideGradientEligibility(entry.evidence)
	return { ...label, stratum: queue.stratum, pairSpecific: entry.evidence.pairSpecific.isGradient, candidate, evidence: entry.evidence }
})
const binary = labeled.filter((entry) => entry.classification !== "uncertain")
const truth = (classification: Classification): boolean => classification === "true-background-gradient"
const candidateResults = binary.map((entry) => ({ truth: truth(entry.classification), predicted: entry.candidate.eligible }))
const pairSpecificResults = binary.map((entry) => ({ truth: truth(entry.classification), predicted: entry.pairSpecific }))
const trueEntries = binary.filter((entry) => truth(entry.classification))
const falseEntries = binary.filter((entry) => !truth(entry.classification))
const corpusDecisions = candidateDevelopment.entries.map((entry) => decideGradientEligibility(entry.evidence))
const corpusComparison = candidateDevelopment.entries.map((entry, index) => ({
	previous: entry.evidence.pairSpecific.isGradient,
	candidate: corpusDecisions[index].eligible,
}))

await writeJsonAtomic({ path: resolve(outputArgument), refuseOverwrite: true }, {
	schemaVersion: 1,
	analysisVersion: "gradient-eligibility-review-analysis-0.1.0",
	generatedAt: new Date().toISOString(),
	promotionEligible: false,
	developmentFit: true,
	warnings: [
		"Thresholds were fitted to this intentionally stratified development review.",
		"Reviewed confusion counts describe fit, not held-out generalization.",
		...(candidateDevelopmentArgument
			? ["Review labels were carried only where the source file and selected endpoint RGB values remained exact."]
			: []),
	],
	provenance: {
		developmentSha256: sha256(developmentSource),
		htmlSha256: sha256(htmlSource),
		feedbackSha256: sha256(feedbackSource),
		candidateDevelopmentSha256: sha256(candidateDevelopmentSource),
	},
	candidate: {
		version: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
		thresholds: GRADIENT_ELIGIBILITY_THRESHOLDS,
		rule: "require connected, ordered, or coherent nonlinear pair evidence, then reject flat-risk and sparse border-background paths",
	},
	review: {
		labels: labeled.length,
		classifications: counts(labeled.map((entry) => entry.classification)),
		confidence: counts(labeled.map((entry) => entry.confidence)),
		strata: Object.fromEntries([...new Set(labeled.map((entry) => entry.stratum))].sort().map((stratum) => {
			const values = labeled.filter((entry) => entry.stratum === stratum)
			return [stratum, { labels: values.length, classifications: counts(values.map((entry) => entry.classification)) }]
		})),
		candidateFit: confusion(candidateResults),
		previousPairSpecificFit: confusion(pairSpecificResults),
		featureSeparation: {
			connectedFieldContinuity: {
				trueGradient: distribution(trueEntries.map((entry) => entry.evidence.connectedField.continuity)),
				falseGradient: distribution(falseEntries.map((entry) => entry.evidence.connectedField.continuity)),
			},
			flatBackgroundIsolatedSurfaceRisk: {
				trueGradient: distribution(trueEntries.map((entry) => entry.evidence.flatBackgroundIsolatedSurfaceRisk)),
				falseGradient: distribution(falseEntries.map((entry) => entry.evidence.flatBackgroundIsolatedSurfaceRisk)),
			},
		},
	},
	developmentCorpus: {
		canonicalGradients: candidateDevelopment.entries.length,
		candidateEligible: corpusDecisions.filter((decision) => decision.eligible).length,
		candidateRejected: corpusDecisions.filter((decision) => !decision.eligible).length,
		decisions: counts(corpusDecisions.map((decision) => decision.reason)),
		comparisonToPreviousPairSpecific: {
			bothEligible: corpusComparison.filter((entry) => entry.previous && entry.candidate).length,
			candidateOnly: corpusComparison.filter((entry) => !entry.previous && entry.candidate).length,
			previousOnly: corpusComparison.filter((entry) => entry.previous && !entry.candidate).length,
			bothRejected: corpusComparison.filter((entry) => !entry.previous && !entry.candidate).length,
		},
	},
	entries: labeled,
})
process.stderr.write(`Analyzed ${labeled.length} complete labels against ${candidateDevelopment.entries.length} development gradients\n`)
