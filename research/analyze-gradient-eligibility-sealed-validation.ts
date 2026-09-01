import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { writeJsonAtomic } from "./src/candidate-output.ts"
import type { GradientEligibilityEvidence } from "./src/gradient-eligibility.ts"
import type { Palette } from "./src/types.ts"

type Decision = "should-be-gradient" | "should-not-be-gradient" | "either-way" | "no-visible-difference" |
	"selected-colors-not-identifiable"
type Judgment = Decision | "unreviewed"
type FeedbackEntry = { familyId: string; decision: Decision; comment: string; submittedAt: string }
type Feedback = {
	reviewVersion: string
	experimentVersion: string
	planSha256: string
	htmlSha256: string
	entries: FeedbackEntry[]
}
type ReviewEntry = {
	familyId: string
	anchor: { file: string; sha256: string }
	palette: Palette
	candidateReason: "eligible" | "insufficient-spatial-continuity" | "flat-background-isolated-surface" |
		"insufficient-progressive-field-support" | "unsupported-disconnected-color-path" |
		"fragmented-connected-color-path" | "separate-border-connected-flat-fields"
	candidateEligible?: boolean
}
type Review = {
	reviewVersion: string
	experimentVersion: string
	manifestId: string
	manifestSha256: string
	evaluationSha256: string
	selection?: "default" | "removed" | "retained"
	priorReviewSha256s?: string[]
	entries: ReviewEntry[]
}
type EvaluationEntry = {
	familyId: string
	anchor: { file: string; sha256: string }
	palette: Palette
	certificate: {
		baselineGradient: boolean
		decision: { eligible: boolean; reason: string }
		evidence: GradientEligibilityEvidence | null
	}
}
type Evaluation = { manifestId: string; manifestSha256: string; entries: EvaluationEntry[] }
type Manifest = { manifestId: string }
type InterpretationV1 = {
	schemaVersion: 1
	recordedAt: string
	decisionScope: "exact-selected-background-surface-pair"
	unansweredMeaning: "no-visible-difference" | "unreviewed"
	explicitNoVisibleDifferenceMeaning?: "treatments-visually-identical"
	note: string
}
type InterpretationV2 = {
	schemaVersion: 2
	recordedAt: string
	decisionScope: "exact-selected-background-surface-pair"
	reviewedThroughPosition: number
	unansweredWithinReviewedPrefixMeaning: "selected-colors-not-identifiable"
	unansweredAfterReviewedPrefixMeaning: "unreviewed"
	note: string
}
type Interpretation = InterpretationV1 | InterpretationV2

const [manifestArgument, evaluationArgument, reviewArgument, htmlArgument, feedbackArgument, interpretationArgument,
	outputArgument] = process.argv.slice(2)
if (!manifestArgument || !evaluationArgument || !reviewArgument || !htmlArgument || !feedbackArgument ||
	!interpretationArgument || !outputArgument) {
	throw new Error("Usage: analyze-gradient-eligibility-sealed-validation.ts <manifest.json> <evaluation.json> <review.json> <review.html> <feedback.json> <interpretation.json> <output.json>")
}

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function counts<T extends string>(values: readonly T[]): Partial<Record<T, number>> {
	const result: Partial<Record<T, number>> = {}
	for (const value of values) result[value] = (result[value] ?? 0) + 1
	return result
}

const [manifestSource, evaluationSource, reviewSource, htmlSource, feedbackSource, interpretationSource] =
	await Promise.all([
		readFile(resolve(manifestArgument)),
		readFile(resolve(evaluationArgument)),
		readFile(resolve(reviewArgument)),
		readFile(resolve(htmlArgument)),
		readFile(resolve(feedbackArgument)),
		readFile(resolve(interpretationArgument)),
	])
const manifest = JSON.parse(manifestSource.toString("utf8")) as Manifest
const evaluation = JSON.parse(evaluationSource.toString("utf8")) as Evaluation
const review = JSON.parse(reviewSource.toString("utf8")) as Review
const feedback = JSON.parse(feedbackSource.toString("utf8")) as Feedback
const interpretation = JSON.parse(interpretationSource.toString("utf8")) as Interpretation
if (evaluation.manifestId !== manifest.manifestId || evaluation.manifestSha256 !== sha256(manifestSource) ||
	review.manifestId !== manifest.manifestId || review.manifestSha256 !== sha256(manifestSource) ||
	review.evaluationSha256 !== sha256(evaluationSource) || feedback.reviewVersion !== review.reviewVersion ||
	feedback.experimentVersion !== review.experimentVersion || feedback.planSha256 !== sha256(reviewSource) ||
	feedback.htmlSha256 !== sha256(htmlSource)) throw new Error("Sealed review provenance is invalid")
const validV1 = interpretation.schemaVersion === 1 &&
	(interpretation.unansweredMeaning === "no-visible-difference" || interpretation.unansweredMeaning === "unreviewed") &&
	(interpretation.explicitNoVisibleDifferenceMeaning === undefined ||
		interpretation.explicitNoVisibleDifferenceMeaning === "treatments-visually-identical")
const validV2 = interpretation.schemaVersion === 2 && Number.isInteger(interpretation.reviewedThroughPosition) &&
	interpretation.reviewedThroughPosition >= 0 && interpretation.reviewedThroughPosition <= review.entries.length &&
	interpretation.unansweredWithinReviewedPrefixMeaning === "selected-colors-not-identifiable" &&
	interpretation.unansweredAfterReviewedPrefixMeaning === "unreviewed"
if ((!validV1 && !validV2) || interpretation.decisionScope !== "exact-selected-background-surface-pair" ||
	!Number.isFinite(Date.parse(interpretation.recordedAt)) || typeof interpretation.note !== "string") {
	throw new Error("Review interpretation is invalid")
}
const evaluationByFamily = new Map(evaluation.entries.map((entry) => [entry.familyId, entry]))
const feedbackByFamily = new Map(feedback.entries.map((entry) => [entry.familyId, entry]))
if (feedbackByFamily.size !== feedback.entries.length || feedback.entries.some((entry) =>
	!review.entries.some((reviewed) => reviewed.familyId === entry.familyId))) throw new Error("Feedback is duplicated or unknown")
const entries = review.entries.map((reviewed, index) => {
	const evaluated = evaluationByFamily.get(reviewed.familyId)
	const candidateEligible = reviewed.candidateEligible ?? false
	if (!evaluated || evaluated.anchor.file !== reviewed.anchor.file || evaluated.anchor.sha256 !== reviewed.anchor.sha256 ||
		!evaluated.certificate.baselineGradient || evaluated.certificate.decision.eligible !== candidateEligible ||
		evaluated.certificate.decision.reason !== reviewed.candidateReason || !evaluated.certificate.evidence) {
		throw new Error(`Review entry does not match sealed evaluation: ${reviewed.familyId}`)
	}
	const response = feedbackByFamily.get(reviewed.familyId)
	const unanswered: Judgment = interpretation.schemaVersion === 1
		? interpretation.unansweredMeaning
		: index < interpretation.reviewedThroughPosition
			? interpretation.unansweredWithinReviewedPrefixMeaning
			: interpretation.unansweredAfterReviewedPrefixMeaning
	return {
		familyId: reviewed.familyId,
		anchor: reviewed.anchor,
		endpoints: { background: reviewed.palette.background, surface: reviewed.palette.surface },
		candidateReason: reviewed.candidateReason,
		candidateEligible,
		judgment: response?.decision ?? unanswered,
		comment: response?.comment ?? "",
		submittedAt: response?.submittedAt ?? null,
		evidence: evaluated.certificate.evidence,
	}
})
const strictFalseRejections = entries.filter((entry) => !entry.candidateEligible &&
	entry.judgment === "should-be-gradient")
const retainedDecisive = entries.filter((entry) => entry.candidateEligible &&
	(entry.judgment === "should-be-gradient" || entry.judgment === "should-not-be-gradient"))
const retainedFlat = retainedDecisive.filter((entry) => entry.judgment === "should-not-be-gradient")
const retainedFlatRate = retainedDecisive.length === 0 ? null : retainedFlat.length / retainedDecisive.length
const unreviewed = entries.filter((entry) => entry.judgment === "unreviewed")
const unjudgeable = entries.filter((entry) => entry.judgment === "selected-colors-not-identifiable")
const statuses: Judgment[] = ["should-be-gradient", "should-not-be-gradient", "either-way", "no-visible-difference",
	"selected-colors-not-identifiable", "unreviewed"]
const reasons = ["eligible", "insufficient-spatial-continuity", "flat-background-isolated-surface",
	"insufficient-progressive-field-support", "unsupported-disconnected-color-path",
	"fragmented-connected-color-path", "separate-border-connected-flat-fields"] as const
const includesRetained = entries.some((entry) => entry.candidateEligible)
const requiresRetainedValidation = review.reviewVersion === "gradient-eligibility-sealed-validation-review-0.4.0" ||
	review.reviewVersion === "gradient-eligibility-sealed-validation-review-0.5.0" ||
	review.reviewVersion === "gradient-eligibility-sealed-validation-review-0.6.0"
const retainedRulePassed = !requiresRetainedValidation && !includesRetained ||
	retainedDecisive.length >= (requiresRetainedValidation ? 20 : 40) && retainedFlatRate !== null &&
	retainedFlatRate <= 0.1
const unjudgeableFails = !requiresRetainedValidation && unjudgeable.length > 0
const supplementalBatch = review.selection === "retained" && (review.priorReviewSha256s?.length ?? 0) > 0
const promotionEligible = !supplementalBatch && strictFalseRejections.length === 0 && unreviewed.length === 0 &&
	!unjudgeableFails && retainedRulePassed
await writeJsonAtomic({ path: resolve(outputArgument), refuseOverwrite: true }, {
	schemaVersion: 1,
	analysisVersion: "gradient-eligibility-sealed-validation-analysis-0.1.0",
	generatedAt: new Date().toISOString(),
	manifestId: manifest.manifestId,
	candidateVersion: review.experimentVersion,
	promotionEligible,
	promotionFailure: strictFalseRejections.length > 0
		? "At least one sealed changed case decisively requires the rejected gradient treatment for the reviewed endpoint pair."
		: unreviewed.length > 0 ? "At least one sealed canonical gradient remains unreviewed."
		: unjudgeableFails ? "At least one sealed endpoint pair could not be judged from the artwork."
		: !retainedRulePassed ? "The retained-gradient precision rule was not met."
		: supplementalBatch ? "This retained batch requires aggregate interpretation with its prior removal review." : null,
	reviewInterpretation: interpretation,
	provenance: {
		manifestSha256: sha256(manifestSource),
		evaluationSha256: sha256(evaluationSource),
		reviewSha256: sha256(reviewSource),
		htmlSha256: sha256(htmlSource),
		feedbackSha256: sha256(feedbackSource),
		interpretationSha256: sha256(interpretationSource),
	},
	summary: {
		reviewCases: entries.length,
		changedCases: entries.filter((entry) => !entry.candidateEligible).length,
		retainedCases: entries.filter((entry) => entry.candidateEligible).length,
		submitted: feedback.entries.length,
		unreviewed: unreviewed.length,
		selectedColorsNotIdentifiable: unjudgeable.length,
		noVisibleDifference: entries.filter((entry) => entry.judgment === "no-visible-difference").length,
		judgments: counts(entries.map((entry) => entry.judgment)),
		strictFalseRejections: strictFalseRejections.length,
		retainedDecisive: retainedDecisive.length,
		retainedFlat: retainedFlat.length,
		retainedFlatRate,
		retainedRulePassed,
		byCandidateReason: Object.fromEntries(reasons.map((reason) => [reason,
			Object.fromEntries(statuses.map((status) => [status,
				entries.filter((entry) => entry.candidateReason === reason && entry.judgment === status).length]))])),
	},
	sealedFalseRejections: strictFalseRejections,
	entries,
})
process.stderr.write(`Analyzed ${feedback.entries.length}/${entries.length} sealed responses; ${strictFalseRejections.length} false rejection(s)\n`)
