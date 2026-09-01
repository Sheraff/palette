import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { isDeepStrictEqual } from "node:util"
import { writeJsonAtomic } from "./src/candidate-output.ts"
import {
	decideGradientEligibility,
	GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	type GradientEligibilityEvidence,
} from "./src/gradient-eligibility.ts"
import type { RGB } from "./src/types.ts"

type Decision = "should-be-gradient" | "should-not-be-gradient" | "either-way" | "no-visible-difference"
type PlanEntry = {
	familyId: string
	anchor: { file: string }
	palette: { background: { rgb: RGB }; surface: { rgb: RGB } }
	candidateReason: "insufficient-progressive-field-support"
}
type Plan = {
	reviewVersion: string
	experimentVersion: string
	provenance: { developmentSha256: string; currentValidationSha256: string }
	entries: PlanEntry[]
}
type Feedback = {
	reviewVersion: string
	experimentVersion: string
	planSha256: string
	htmlSha256: string
	entries: Array<{ familyId: string; decision: Decision; comment: string; submittedAt: string }>
}
type Development = {
	entries: Array<{
		familyId: string
		anchor: { file: string }
		palette: { background: { rgb: RGB }; surface: { rgb: RGB } }
		evidence: GradientEligibilityEvidence
	}>
}
type Validation = {
	candidateVersion: string
	entries: Array<{
		cohort: "development" | "holdout"
		file: string
		background: RGB
		surface: RGB
		baselineGradient: boolean
		candidateEligible: boolean
		reason: string
		evidence: GradientEligibilityEvidence | null
	}>
}
type Interpretation = {
	schemaVersion: 1
	recordedAt: string
	decisionScope: "exact-selected-background-surface-pair"
	queueTraversal: "complete"
	unsubmittedMeaning: "qualitative-mostly-should-not-be-gradient-not-individually-labeled"
	note: string
}

const [planArgument, htmlArgument, feedbackArgument, developmentArgument, validationArgument, interpretationArgument,
	outputArgument] = process.argv.slice(2)
if (!planArgument || !htmlArgument || !feedbackArgument || !developmentArgument || !validationArgument ||
	!interpretationArgument || !outputArgument) {
	throw new Error("Usage: analyze-gradient-eligibility-iteration-review.ts <plan.json> <review.html> <feedback.json> <development.json> <validation.json> <interpretation.json> <output.json>")
}

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function counts<T extends string>(values: readonly T[]): Partial<Record<T, number>> {
	const result: Partial<Record<T, number>> = {}
	for (const value of values) result[value] = (result[value] ?? 0) + 1
	return result
}

const [planSource, htmlSource, feedbackSource, developmentSource, validationSource, interpretationSource] =
	await Promise.all([
	readFile(resolve(planArgument)),
	readFile(resolve(htmlArgument)),
	readFile(resolve(feedbackArgument)),
	readFile(resolve(developmentArgument)),
	readFile(resolve(validationArgument)),
	readFile(resolve(interpretationArgument)),
])
const plan = JSON.parse(planSource.toString("utf8")) as Plan
const feedback = JSON.parse(feedbackSource.toString("utf8")) as Feedback
const development = JSON.parse(developmentSource.toString("utf8")) as Development
const validation = JSON.parse(validationSource.toString("utf8")) as Validation
const interpretation = JSON.parse(interpretationSource.toString("utf8")) as Interpretation
if (plan.experimentVersion !== GRADIENT_ELIGIBILITY_CANDIDATE_VERSION ||
	validation.candidateVersion !== GRADIENT_ELIGIBILITY_CANDIDATE_VERSION ||
	plan.provenance.developmentSha256 !== sha256(developmentSource) ||
	plan.provenance.currentValidationSha256 !== sha256(validationSource) ||
	feedback.reviewVersion !== plan.reviewVersion || feedback.experimentVersion !== plan.experimentVersion ||
	feedback.planSha256 !== sha256(planSource) || feedback.htmlSha256 !== sha256(htmlSource)) {
	throw new Error("Iteration review provenance is invalid")
}
if (interpretation.schemaVersion !== 1 ||
	interpretation.decisionScope !== "exact-selected-background-surface-pair" ||
	interpretation.queueTraversal !== "complete" ||
	interpretation.unsubmittedMeaning !== "qualitative-mostly-should-not-be-gradient-not-individually-labeled" ||
	!Number.isFinite(Date.parse(interpretation.recordedAt)) || typeof interpretation.note !== "string") {
	throw new Error("Iteration review interpretation is invalid")
}
const planByFamily = new Map(plan.entries.map((entry) => [entry.familyId, entry]))
const feedbackByFamily = new Map(feedback.entries.map((entry) => [entry.familyId, entry]))
const developmentByFamily = new Map(development.entries.map((entry) => [entry.familyId, entry]))
const validationByFile = new Map(validation.entries.filter((entry) => entry.cohort === "holdout")
	.map((entry) => [entry.file, entry]))
if (planByFamily.size !== plan.entries.length || feedbackByFamily.size !== feedback.entries.length ||
	feedback.entries.some((entry) => !planByFamily.has(entry.familyId))) {
	throw new Error("Iteration review entries are duplicated or unknown")
}
const entries = feedback.entries.map((response) => {
	const reviewed = planByFamily.get(response.familyId)!
	const developmentEntry = developmentByFamily.get(response.familyId)
	const validationEntry = validationByFile.get(reviewed.anchor.file)
	const evidence = developmentEntry?.evidence ?? validationEntry?.evidence
	const background = developmentEntry?.palette.background.rgb ?? validationEntry?.background
	const surface = developmentEntry?.palette.surface.rgb ?? validationEntry?.surface
	if (!evidence || !background || !surface || !isDeepStrictEqual(background, reviewed.palette.background.rgb) ||
		!isDeepStrictEqual(surface, reviewed.palette.surface.rgb)) {
		throw new Error(`Iteration evidence changed for ${reviewed.familyId}`)
	}
	const current = decideGradientEligibility(evidence)
	if (current.eligible || current.reason !== reviewed.candidateReason || validationEntry &&
		(!validationEntry.baselineGradient || validationEntry.candidateEligible)) {
		throw new Error(`Iteration decision changed for ${reviewed.familyId}`)
	}
	return { ...response, anchor: reviewed.anchor, endpoints: { background, surface }, current, evidence }
})
await writeJsonAtomic({ path: resolve(outputArgument), refuseOverwrite: true }, {
	schemaVersion: 1,
	analysisVersion: "gradient-eligibility-iteration-review-analysis-0.2.0",
	generatedAt: new Date().toISOString(),
	candidateVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	promotionEligible: false,
	developmentFitOnly: true,
	queueTraversalComplete: true,
	individualLabelsComplete: entries.length === plan.entries.length,
	reviewInterpretation: interpretation,
	provenance: {
		planSha256: sha256(planSource),
		htmlSha256: sha256(htmlSource),
		feedbackSha256: sha256(feedbackSource),
		developmentSha256: sha256(developmentSource),
		validationSha256: sha256(validationSource),
		interpretationSha256: sha256(interpretationSource),
	},
	summary: {
		planned: plan.entries.length,
		submitted: entries.length,
		unreviewed: plan.entries.length - entries.length,
		qualitativelyReviewedWithoutIndividualLabel: plan.entries.length - entries.length,
		judgments: counts(entries.map((entry) => entry.decision)),
		strictFalseRejections: entries.filter((entry) => entry.decision === "should-be-gradient").length,
	},
	entries,
})
process.stderr.write(`Analyzed ${entries.length}/${plan.entries.length} iteration-review responses\n`)
