import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { writeJsonAtomic } from "./src/candidate-output.ts"
import {
	decideGradientEligibility,
	GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION,
	GRADIENT_ELIGIBILITY_THRESHOLDS,
	type GradientEligibilityEvidence,
} from "./src/gradient-eligibility.ts"

type Judgment = "should-be-gradient" | "should-not-be-gradient" | "either-way" | "no-visible-difference" |
	"selected-colors-not-identifiable"
type PlanEntry = {
	familyId: string
	anchor: { file: string; sha256: string }
	candidateReason: string
	candidateEligible: boolean
	originalPosition: number
}
type Plan = {
	reviewVersion: string
	experimentVersion: string
	provenance: { evaluationSha256: string }
	entries: PlanEntry[]
}
type Feedback = {
	reviewVersion: string
	experimentVersion: string
	planSha256: string
	htmlSha256: string
	entries: Array<{ familyId: string; decision: Judgment; comment: string; submittedAt: string }>
}
type Evaluation = {
	entries: Array<{
		familyId: string
		anchor: { file: string; sha256: string }
		certificate: { baselineGradient: boolean; evidence: GradientEligibilityEvidence | null }
	}>
}

const [planArgument, htmlArgument, feedbackArgument, evaluationArgument, outputArgument] = process.argv.slice(2)
if (!planArgument || !htmlArgument || !feedbackArgument || !evaluationArgument || !outputArgument) {
	throw new Error("Usage: analyze-gradient-eligibility-followup-review.ts <plan.json> <review.html> <feedback.json> <evaluation.json> <output.json>")
}

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function counts<T extends string>(values: readonly T[]): Partial<Record<T, number>> {
	const result: Partial<Record<T, number>> = {}
	for (const value of values) result[value] = (result[value] ?? 0) + 1
	return result
}

const [planSource, htmlSource, feedbackSource, evaluationSource] = await Promise.all([
	readFile(resolve(planArgument)),
	readFile(resolve(htmlArgument)),
	readFile(resolve(feedbackArgument)),
	readFile(resolve(evaluationArgument)),
])
const plan = JSON.parse(planSource.toString("utf8")) as Plan
const feedback = JSON.parse(feedbackSource.toString("utf8")) as Feedback
const evaluation = JSON.parse(evaluationSource.toString("utf8")) as Evaluation
if (typeof plan.experimentVersion !== "string" || plan.provenance.evaluationSha256 !== sha256(evaluationSource) ||
	feedback.reviewVersion !== plan.reviewVersion || feedback.experimentVersion !== plan.experimentVersion ||
	feedback.planSha256 !== sha256(planSource) || feedback.htmlSha256 !== sha256(htmlSource)) {
	throw new Error("Follow-up review provenance is invalid")
}
const planByFamily = new Map(plan.entries.map((entry) => [entry.familyId, entry]))
const evaluationByFamily = new Map(evaluation.entries.map((entry) => [entry.familyId, entry]))
if (planByFamily.size !== plan.entries.length || new Set(feedback.entries.map((entry) => entry.familyId)).size !==
	feedback.entries.length || feedback.entries.some((entry) => !planByFamily.has(entry.familyId))) {
	throw new Error("Follow-up feedback is duplicated or unknown")
}
const entries = feedback.entries.map((response) => {
	const reviewed = planByFamily.get(response.familyId)!
	const evaluated = evaluationByFamily.get(response.familyId)
	if (!evaluated?.certificate.baselineGradient || !evaluated.certificate.evidence ||
		evaluated.anchor.file !== reviewed.anchor.file || evaluated.anchor.sha256 !== reviewed.anchor.sha256 ||
		evaluated.certificate.evidence.experimentVersion !== GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION) {
		throw new Error(`Follow-up evidence is invalid for ${reviewed.familyId}`)
	}
	const current = decideGradientEligibility(evaluated.certificate.evidence)
	if (plan.experimentVersion === GRADIENT_ELIGIBILITY_CANDIDATE_VERSION &&
		(current.eligible !== reviewed.candidateEligible || current.reason !== reviewed.candidateReason)) {
		throw new Error(`Follow-up candidate decision changed for ${reviewed.familyId}`)
	}
	return { ...response, originalPosition: reviewed.originalPosition, current, evidence: evaluated.certificate.evidence }
})
const rejected = entries.filter((entry) => !entry.current.eligible)
const retained = entries.filter((entry) => entry.current.eligible)
const retainedDecisive = retained.filter((entry) => entry.decision === "should-be-gradient" ||
	entry.decision === "should-not-be-gradient")
await writeJsonAtomic({ path: resolve(outputArgument), refuseOverwrite: true }, {
	schemaVersion: 1,
	analysisVersion: "gradient-eligibility-followup-review-analysis-0.1.0",
	generatedAt: new Date().toISOString(),
	sourceCandidateVersion: plan.experimentVersion,
	candidateVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	evidenceVersion: GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION,
	thresholds: GRADIENT_ELIGIBILITY_THRESHOLDS,
	promotionEligible: false,
	developmentFitOnly: true,
	reanalysisAfterReview: plan.experimentVersion !== GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	provenance: {
		planSha256: sha256(planSource),
		htmlSha256: sha256(htmlSource),
		feedbackSha256: sha256(feedbackSource),
		evaluationSha256: sha256(evaluationSource),
	},
	summary: {
		planned: plan.entries.length,
		submitted: entries.length,
		unreviewed: plan.entries.length - entries.length,
		judgments: counts(entries.map((entry) => entry.decision)),
		candidateRejected: {
			submitted: rejected.length,
			judgments: counts(rejected.map((entry) => entry.decision)),
			strictFalseRemovals: rejected.filter((entry) => entry.decision === "should-be-gradient").length,
		},
		candidateRetained: {
			submitted: retained.length,
			judgments: counts(retained.map((entry) => entry.decision)),
			decisive: retainedDecisive.length,
			flat: retainedDecisive.filter((entry) => entry.decision === "should-not-be-gradient").length,
			flatRate: retainedDecisive.length === 0 ? null :
				retainedDecisive.filter((entry) => entry.decision === "should-not-be-gradient").length /
				retainedDecisive.length,
		},
	},
	entries,
})
process.stderr.write(`Analyzed ${entries.length}/${plan.entries.length} follow-up responses\n`)
