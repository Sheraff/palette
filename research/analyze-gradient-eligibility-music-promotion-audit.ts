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

type Decision = "should-be-gradient" | "should-not-be-gradient" | "either-way" | "no-visible-difference"
type PlanEntry = {
	familyId: string
	candidateReason: string
	anchor: { file: string }
	palette: { background: { rgb: number[] }; surface: { rgb: number[] } }
}
type Plan = {
	reviewVersion: string
	experimentVersion: string
	provenance: { developmentSha256: string }
	entries: PlanEntry[]
}
type DevelopmentEntry = PlanEntry & { evidence: GradientEligibilityEvidence }
type Development = { experimentVersion: string; entries: DevelopmentEntry[] }
type FeedbackEntry = { familyId: string; decision: Decision; comment: string; submittedAt: string }
type Feedback = {
	reviewVersion: string
	experimentVersion: string
	planSha256: string
	htmlSha256: string
	entries: FeedbackEntry[]
}
type Interpretation = {
	schemaVersion: 1
	recordedAt: string
	decisionScope: "exact-selected-background-surface-pair"
	promotionDecision: "reject-gradient-eligibility-0.8"
	manualJudgments: Array<{
		familyId: string
		reviewSet: "removed"
		decision: "should-be-gradient"
		note: string
	}>
	qualitativeFindings: string[]
	roleSelectionBugs: Array<{ familyId: string; kind: string; note: string }>
}

const [removedPlanArgument, removedHtmlArgument, removedFeedbackArgument, retainedPlanArgument,
	retainedHtmlArgument, retainedFeedbackArgument, developmentArgument, interpretationArgument,
	outputArgument] = process.argv.slice(2)
if (!removedPlanArgument || !removedHtmlArgument || !removedFeedbackArgument || !retainedPlanArgument ||
	!retainedHtmlArgument || !retainedFeedbackArgument || !developmentArgument || !interpretationArgument ||
	!outputArgument) {
	throw new Error("Usage: analyze-gradient-eligibility-music-promotion-audit.ts <removed-plan.json> <removed.html> <removed-feedback.json> <retained-plan.json> <retained.html> <retained-feedback.json> <development.json> <interpretation.json> <output.json>")
}

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function counts<T extends string>(values: readonly T[]): Partial<Record<T, number>> {
	const result: Partial<Record<T, number>> = {}
	for (const value of values) result[value] = (result[value] ?? 0) + 1
	return result
}

function validateFeedback(plan: Plan, planSource: Buffer, htmlSource: Buffer, feedback: Feedback): void {
	if (feedback.reviewVersion !== plan.reviewVersion || feedback.experimentVersion !== plan.experimentVersion ||
		feedback.planSha256 !== sha256(planSource) || feedback.htmlSha256 !== sha256(htmlSource)) {
		throw new Error("Music audit feedback provenance is invalid")
	}
	const planIds = new Set(plan.entries.map((entry) => entry.familyId))
	const feedbackIds = new Set(feedback.entries.map((entry) => entry.familyId))
	if (planIds.size !== plan.entries.length || feedbackIds.size !== feedback.entries.length ||
		feedback.entries.some((entry) => !planIds.has(entry.familyId))) {
		throw new Error("Music audit feedback is duplicated or unknown")
	}
}

const [removedPlanSource, removedHtmlSource, removedFeedbackSource, retainedPlanSource, retainedHtmlSource,
	retainedFeedbackSource, developmentSource, interpretationSource] = await Promise.all([
	readFile(resolve(removedPlanArgument)),
	readFile(resolve(removedHtmlArgument)),
	readFile(resolve(removedFeedbackArgument)),
	readFile(resolve(retainedPlanArgument)),
	readFile(resolve(retainedHtmlArgument)),
	readFile(resolve(retainedFeedbackArgument)),
	readFile(resolve(developmentArgument)),
	readFile(resolve(interpretationArgument)),
])
const removedPlan = JSON.parse(removedPlanSource.toString("utf8")) as Plan
const removedFeedback = JSON.parse(removedFeedbackSource.toString("utf8")) as Feedback
const retainedPlan = JSON.parse(retainedPlanSource.toString("utf8")) as Plan
const retainedFeedback = JSON.parse(retainedFeedbackSource.toString("utf8")) as Feedback
const development = JSON.parse(developmentSource.toString("utf8")) as Development
const interpretation = JSON.parse(interpretationSource.toString("utf8")) as Interpretation
validateFeedback(removedPlan, removedPlanSource, removedHtmlSource, removedFeedback)
validateFeedback(retainedPlan, retainedPlanSource, retainedHtmlSource, retainedFeedback)
if (removedPlan.experimentVersion !== retainedPlan.experimentVersion || interpretation.schemaVersion !== 1 ||
	development.experimentVersion !== GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION ||
	removedPlan.provenance.developmentSha256 !== sha256(developmentSource) ||
	retainedPlan.provenance.developmentSha256 !== sha256(developmentSource) ||
	interpretation.decisionScope !== "exact-selected-background-surface-pair" ||
	interpretation.promotionDecision !== "reject-gradient-eligibility-0.8" ||
	!Number.isFinite(Date.parse(interpretation.recordedAt)) || !Array.isArray(interpretation.manualJudgments) ||
	!Array.isArray(interpretation.qualitativeFindings) || !Array.isArray(interpretation.roleSelectionBugs)) {
	throw new Error("Music audit interpretation is invalid")
}
const removedByFamily = new Map(removedPlan.entries.map((entry) => [entry.familyId, entry]))
const developmentByFamily = new Map(development.entries.map((entry) => [entry.familyId, entry]))
if (developmentByFamily.size !== development.entries.length) throw new Error("Development evidence is duplicated")
for (const reviewed of [...removedPlan.entries, ...retainedPlan.entries]) {
	const entry = developmentByFamily.get(reviewed.familyId)
	if (!entry || entry.anchor.file !== reviewed.anchor.file ||
		JSON.stringify(entry.palette.background.rgb) !== JSON.stringify(reviewed.palette.background.rgb) ||
		JSON.stringify(entry.palette.surface.rgb) !== JSON.stringify(reviewed.palette.surface.rgb)) {
		throw new Error(`Reviewed endpoint pair changed for ${reviewed.familyId}`)
	}
}
const removedJudgments = [
	...removedFeedback.entries.map((entry) => ({ ...entry, source: "feedback" as const })),
	...interpretation.manualJudgments.map((entry) => ({ familyId: entry.familyId, decision: entry.decision,
		comment: entry.note, submittedAt: interpretation.recordedAt, source: "manual-note" as const })),
]
if (new Set(removedJudgments.map((entry) => entry.familyId)).size !== removedJudgments.length ||
	removedJudgments.some((entry) => !removedByFamily.has(entry.familyId))) {
	throw new Error("Removed-gradient judgments are duplicated or unknown")
}
const retainedIds = new Set(retainedPlan.entries.map((entry) => entry.familyId))
if (interpretation.roleSelectionBugs.some((entry) =>
	!removedByFamily.has(entry.familyId) && !retainedIds.has(entry.familyId))) {
	throw new Error("A recorded role-selection bug is outside the audit plans")
}
const withCurrentDecision = <T extends { familyId: string }>(entry: T) => ({
	...entry,
	current: decideGradientEligibility(developmentByFamily.get(entry.familyId)!.evidence),
})
const currentRemoved = removedJudgments.map(withCurrentDecision)
const currentRetained = retainedFeedback.entries.map(withCurrentDecision)
const corpusDecisions = development.entries.map((entry) => decideGradientEligibility(entry.evidence))
const decisionFit = (decision: Decision) => {
	const entries = currentRetained.filter((entry) => entry.decision === decision)
	return {
		total: entries.length,
		eligible: entries.filter((entry) => entry.current.eligible).length,
		rejected: entries.filter((entry) => !entry.current.eligible).length,
	}
}
await writeJsonAtomic({ path: resolve(outputArgument), refuseOverwrite: true }, {
	schemaVersion: 1,
	analysisVersion: "gradient-eligibility-music-promotion-audit-analysis-0.2.0",
	generatedAt: new Date().toISOString(),
	reviewedCandidateVersion: removedPlan.experimentVersion,
	candidateVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	evidenceVersion: GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION,
	thresholds: GRADIENT_ELIGIBILITY_THRESHOLDS,
	promotionRecommended: false,
	developmentFitOnly: true,
	promotionDecision: "requires-new-independent-validation",
	reviewInterpretation: interpretation,
	provenance: {
		removedPlanSha256: sha256(removedPlanSource),
		removedHtmlSha256: sha256(removedHtmlSource),
		removedFeedbackSha256: sha256(removedFeedbackSource),
		retainedPlanSha256: sha256(retainedPlanSource),
		retainedHtmlSha256: sha256(retainedHtmlSource),
		retainedFeedbackSha256: sha256(retainedFeedbackSource),
		developmentSha256: sha256(developmentSource),
		interpretationSha256: sha256(interpretationSource),
	},
	summary: {
		corpus: {
			baselineGradients: development.entries.length,
			candidateEligible: corpusDecisions.filter((decision) => decision.eligible).length,
			candidateRejected: corpusDecisions.filter((decision) => !decision.eligible).length,
			reasons: counts(corpusDecisions.map((decision) => decision.reason)),
		},
		removed: {
			planned: removedPlan.entries.length,
			feedbackSubmitted: removedFeedback.entries.length,
			manualJudgments: interpretation.manualJudgments.length,
			unreviewed: removedPlan.entries.length - removedJudgments.length,
			judgments: counts(removedJudgments.map((entry) => entry.decision)),
			knownFalseRemovalsRecovered: currentRemoved.filter((entry) =>
				entry.decision === "should-be-gradient" && entry.current.eligible).length,
		},
		retained: {
			planned: retainedPlan.entries.length,
			submitted: retainedFeedback.entries.length,
			unreviewed: retainedPlan.entries.length - retainedFeedback.entries.length,
			judgments: counts(retainedFeedback.entries.map((entry) => entry.decision)),
			fit: {
				shouldBeGradient: decisionFit("should-be-gradient"),
				shouldNotBeGradient: decisionFit("should-not-be-gradient"),
				eitherWay: decisionFit("either-way"),
				noVisibleDifference: decisionFit("no-visible-difference"),
			},
		},
	},
	knownFalseRemovals: currentRemoved.filter((entry) => entry.decision === "should-be-gradient").map((entry) => ({
		...entry,
		candidateReason: removedByFamily.get(entry.familyId)!.candidateReason,
	})),
	reviewedFalseRetentions: currentRetained.filter((entry) => entry.decision === "should-not-be-gradient"),
})
process.stderr.write(`Analyzed music promotion audit: ${removedJudgments.length}/${removedPlan.entries.length} removals and ${retainedFeedback.entries.length}/${retainedPlan.entries.length} retentions\n`)
