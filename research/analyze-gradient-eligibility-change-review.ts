import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { isDeepStrictEqual } from "node:util"
import { writeJsonAtomic } from "./src/candidate-output.ts"
import {
	decideGradientEligibility,
	GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION,
	GRADIENT_ELIGIBILITY_THRESHOLDS,
	type GradientEligibilityEvidence,
} from "./src/gradient-eligibility.ts"
import type { RGB } from "./src/types.ts"

type Decision = "should-be-gradient" | "should-not-be-gradient" | "either-way"
type ReviewEntry = {
	familyId: string
	anchor: { file: string }
	cohort: "music" | "holdout"
	selectionTrack: string
	palette: { background: { rgb: RGB }; surface: { rgb: RGB } }
	reason: "insufficient-spatial-continuity" | "flat-background-isolated-surface" |
		"insufficient-progressive-field-support" | "unsupported-disconnected-color-path" |
		"fragmented-connected-color-path" | "separate-border-connected-flat-fields"
}
type Review = {
	schemaVersion: 1
	reviewVersion: string
	experimentVersion: string
	entries: ReviewEntry[]
}
type FeedbackEntry = { familyId: string; decision: Decision; comment: string; submittedAt: string }
type Feedback = {
	schemaVersion: 1
	reviewVersion: string
	experimentVersion: string
	planSha256: string
	htmlSha256: string
	entries: FeedbackEntry[]
}
type DevelopmentEntry = {
	familyId: string
	anchor: { file: string }
	palette: { background: { rgb: RGB }; surface: { rgb: RGB } }
	evidence: GradientEligibilityEvidence
}
type Development = { experimentVersion: string; entries: DevelopmentEntry[] }
type ValidationEntry = {
	cohort: "development" | "holdout"
	file: string
	background: RGB
	surface: RGB
	baselineGradient: boolean
	evidence: GradientEligibilityEvidence | null
}
type Validation = { candidateVersion: string; entries: ValidationEntry[] }

const decisions = new Set<Decision>(["should-be-gradient", "should-not-be-gradient", "either-way"])
const [reviewArgument, htmlArgument, feedbackArgument, developmentArgument, validationArgument, outputArgument] =
	process.argv.slice(2)
if (!reviewArgument || !htmlArgument || !feedbackArgument || !developmentArgument || !validationArgument ||
	!outputArgument) {
	throw new Error("Usage: analyze-gradient-eligibility-change-review.ts <review.json> <review.html> <feedback.json> <candidate-development.json> <candidate-validation.json> <output.json>")
}

function sha256(value: Buffer): string {
	return createHash("sha256").update(value).digest("hex")
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function counts<T extends string>(values: readonly T[]): Partial<Record<T, number>> {
	const result: Partial<Record<T, number>> = {}
	for (const value of values) result[value] = (result[value] ?? 0) + 1
	return result
}

function parseReview(value: unknown): Review {
	if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.reviewVersion !== "string" ||
		typeof value.experimentVersion !== "string" || !Array.isArray(value.entries)) throw new Error("Review plan is invalid")
	const seen = new Set<string>()
	for (const entry of value.entries) {
		if (!isRecord(entry) || typeof entry.familyId !== "string" || seen.has(entry.familyId) ||
			!isRecord(entry.anchor) || typeof entry.anchor.file !== "string" ||
			(entry.cohort !== "music" && entry.cohort !== "holdout") || typeof entry.selectionTrack !== "string" ||
			!isRecord(entry.palette) || !isRecord(entry.palette.background) || !Array.isArray(entry.palette.background.rgb) ||
			!isRecord(entry.palette.surface) || !Array.isArray(entry.palette.surface.rgb) ||
			(entry.reason !== "insufficient-spatial-continuity" && entry.reason !== "flat-background-isolated-surface" &&
				entry.reason !== "insufficient-progressive-field-support" &&
				entry.reason !== "unsupported-disconnected-color-path" &&
				entry.reason !== "fragmented-connected-color-path" &&
				entry.reason !== "separate-border-connected-flat-fields")) {
			throw new Error("Review plan contains an invalid or duplicated entry")
		}
		seen.add(entry.familyId)
	}
	return value as unknown as Review
}

function parseFeedback(value: unknown): Feedback {
	if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.reviewVersion !== "string" ||
		typeof value.experimentVersion !== "string" || typeof value.planSha256 !== "string" ||
		typeof value.htmlSha256 !== "string" || !Array.isArray(value.entries)) throw new Error("Feedback is invalid")
	const seen = new Set<string>()
	for (const entry of value.entries) {
		if (!isRecord(entry) || typeof entry.familyId !== "string" || seen.has(entry.familyId) ||
			typeof entry.decision !== "string" || !decisions.has(entry.decision as Decision) ||
			typeof entry.comment !== "string" || typeof entry.submittedAt !== "string" ||
			!Number.isFinite(Date.parse(entry.submittedAt))) throw new Error("Feedback contains an invalid or duplicated entry")
		seen.add(entry.familyId)
	}
	return value as unknown as Feedback
}

function confusion(entries: Array<{ truth: boolean; predicted: boolean }>): {
	evaluated: number
	truePositive: number
	trueNegative: number
	falsePositive: number
	falseNegative: number
} {
	return {
		evaluated: entries.length,
		truePositive: entries.filter((entry) => entry.truth && entry.predicted).length,
		trueNegative: entries.filter((entry) => !entry.truth && !entry.predicted).length,
		falsePositive: entries.filter((entry) => !entry.truth && entry.predicted).length,
		falseNegative: entries.filter((entry) => entry.truth && !entry.predicted).length,
	}
}

const [reviewSource, htmlSource, feedbackSource, developmentSource, validationSource] = await Promise.all([
	readFile(resolve(reviewArgument)),
	readFile(resolve(htmlArgument)),
	readFile(resolve(feedbackArgument)),
	readFile(resolve(developmentArgument)),
	readFile(resolve(validationArgument)),
])
const review = parseReview(JSON.parse(reviewSource.toString("utf8")) as unknown)
const feedback = parseFeedback(JSON.parse(feedbackSource.toString("utf8")) as unknown)
const development = JSON.parse(developmentSource.toString("utf8")) as Development
const validation = JSON.parse(validationSource.toString("utf8")) as Validation
if (feedback.reviewVersion !== review.reviewVersion || feedback.experimentVersion !== review.experimentVersion ||
	feedback.planSha256 !== sha256(reviewSource) || feedback.htmlSha256 !== sha256(htmlSource)) {
	throw new Error("Feedback provenance does not match the review plan and HTML")
}
if (development.experimentVersion !== GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION ||
	validation.candidateVersion !== GRADIENT_ELIGIBILITY_CANDIDATE_VERSION) {
	throw new Error("Candidate evidence versions do not match the current implementation")
}
const reviewByFamily = new Map(review.entries.map((entry) => [entry.familyId, entry]))
const developmentByFamily = new Map(development.entries.map((entry) => [entry.familyId, entry]))
const validationByFile = new Map(validation.entries.filter((entry) => entry.cohort === "holdout")
	.map((entry) => [entry.file, entry]))
const submitted = feedback.entries.map((label) => {
	const reviewed = reviewByFamily.get(label.familyId)
	if (!reviewed) throw new Error(`Feedback references an unknown family: ${label.familyId}`)
	let evidence: GradientEligibilityEvidence | null = null
	if (reviewed.cohort === "music") {
		const candidate = developmentByFamily.get(label.familyId)
		if (!candidate || candidate.anchor.file !== reviewed.anchor.file ||
			!isDeepStrictEqual(candidate.palette.background.rgb, reviewed.palette.background.rgb) ||
			!isDeepStrictEqual(candidate.palette.surface.rgb, reviewed.palette.surface.rgb)) {
			throw new Error(`Fresh evidence changed the reviewed endpoint pair for ${label.familyId}`)
		}
		evidence = candidate.evidence
	} else {
		const candidate = validationByFile.get(reviewed.anchor.file)
		if (!candidate || !candidate.baselineGradient ||
			!isDeepStrictEqual(candidate.background, reviewed.palette.background.rgb) ||
			!isDeepStrictEqual(candidate.surface, reviewed.palette.surface.rgb)) {
			throw new Error(`Fresh evidence changed the reviewed endpoint pair for ${label.familyId}`)
		}
		evidence = candidate.evidence
	}
	if (!evidence || evidence.experimentVersion !== GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION) {
		throw new Error(`Fresh evidence has the wrong version for ${label.familyId}`)
	}
	const current = decideGradientEligibility(evidence)
	return { ...label, cohort: reviewed.cohort, selectionTrack: reviewed.selectionTrack, reviewedReason: reviewed.reason,
		current, evidence }
})
const submittedIds = new Set(submitted.map((entry) => entry.familyId))
const skipped = review.entries.filter((entry) => !submittedIds.has(entry.familyId))
const decisive = submitted.filter((entry) => entry.decision !== "either-way")
const fit = decisive.map((entry) => ({
	truth: entry.decision === "should-be-gradient",
	predicted: entry.current.eligible,
}))
const grouped = <K extends string>(keys: readonly K[], key: (entry: typeof submitted[number]) => K) =>
	Object.fromEntries(keys.map((value) => [value, counts(submitted.filter((entry) => key(entry) === value)
		.map((entry) => entry.decision))]))

await writeJsonAtomic({ path: resolve(outputArgument), refuseOverwrite: true }, {
	schemaVersion: 1,
	analysisVersion: "gradient-eligibility-change-review-analysis-0.1.0",
	generatedAt: new Date().toISOString(),
	promotionEligible: false,
	warnings: [
		"This intentionally stratified, partially completed review is development evidence, not held-out promotion evidence.",
		"Either-way responses and skipped cases are excluded from binary fit.",
		"Labels were carried only where source identity and selected endpoint RGB values remained exact.",
	],
	provenance: {
		reviewSha256: sha256(reviewSource),
		htmlSha256: sha256(htmlSource),
		feedbackSha256: sha256(feedbackSource),
		candidateDevelopmentSha256: sha256(developmentSource),
		candidateValidationSha256: sha256(validationSource),
	},
	candidate: {
		version: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
		evidenceVersion: GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION,
		thresholds: GRADIENT_ELIGIBILITY_THRESHOLDS,
	},
	review: {
		planned: review.entries.length,
		submitted: submitted.length,
		skipped: skipped.length,
		decisive: decisive.length,
		decisions: counts(submitted.map((entry) => entry.decision)),
		byCohort: grouped(["music", "holdout"], (entry) => entry.cohort),
		byReviewedReason: grouped(
			["insufficient-spatial-continuity", "flat-background-isolated-surface",
				"insufficient-progressive-field-support", "unsupported-disconnected-color-path",
				"fragmented-connected-color-path", "separate-border-connected-flat-fields"],
			(entry) => entry.reviewedReason,
		),
		bySelectionTrack: grouped([...new Set(review.entries.map((entry) => entry.selectionTrack))].sort(),
			(entry) => entry.selectionTrack),
		currentCandidateFit: confusion(fit),
		currentEligible: submitted.filter((entry) => entry.current.eligible).length,
		currentRejected: submitted.filter((entry) => !entry.current.eligible).length,
	},
	skipped: skipped.map((entry) => ({ familyId: entry.familyId, cohort: entry.cohort,
		selectionTrack: entry.selectionTrack, reviewedReason: entry.reason })),
	entries: submitted,
})
process.stderr.write(`Analyzed ${submitted.length}/${review.entries.length} submitted change-review responses (${decisive.length} decisive)\n`)
