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
import type { CorpusResult, Palette, RGB } from "./src/types.ts"

type DevelopmentEntry = {
	familyId: string
	anchor: { file: string; sha256: string; width: number; height: number }
	palette: Palette
	evidence: GradientEligibilityEvidence
}
type Development = { experimentVersion: string; entries: DevelopmentEntry[] }
type PriorEntry = Omit<DevelopmentEntry, "evidence"> & { candidateReason: "eligible" }
type PriorPlan = {
	reviewVersion: string
	experimentVersion: string
	provenance: { developmentSha256: string }
	entries: PriorEntry[]
}
type PriorFeedback = {
	reviewVersion: string
	experimentVersion: string
	planSha256: string
	htmlSha256: string
	entries: Array<{ familyId: string }>
}
type ValidationEntry = {
	cohort: "development" | "holdout"
	file: string
	background: RGB
	surface: RGB
	baselineGradient: boolean
	candidateEligible: boolean
	reason: string
}
type Validation = { candidateVersion: string; entries: ValidationEntry[] }

const [developmentArgument, priorPlanArgument, priorHtmlArgument, priorFeedbackArgument, priorValidationArgument,
	currentValidationArgument, holdoutArgument, outputArgument] = process.argv.slice(2)
if (!developmentArgument || !priorPlanArgument || !priorHtmlArgument || !priorFeedbackArgument ||
	!priorValidationArgument || !currentValidationArgument || !holdoutArgument || !outputArgument) {
	throw new Error("Usage: prepare-gradient-eligibility-iteration-review.ts <development.json> <prior-retained-plan.json> <prior-retained.html> <prior-feedback.json> <prior-validation.json> <current-validation.json> <holdout-results.json> <output.json>")
}

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

const [developmentSource, priorPlanSource, priorHtmlSource, priorFeedbackSource, priorValidationSource,
	currentValidationSource, holdoutSource] = await Promise.all([
	readFile(resolve(developmentArgument)),
	readFile(resolve(priorPlanArgument)),
	readFile(resolve(priorHtmlArgument)),
	readFile(resolve(priorFeedbackArgument)),
	readFile(resolve(priorValidationArgument)),
	readFile(resolve(currentValidationArgument)),
	readFile(resolve(holdoutArgument)),
])
const development = JSON.parse(developmentSource.toString("utf8")) as Development
const priorPlan = JSON.parse(priorPlanSource.toString("utf8")) as PriorPlan
const priorFeedback = JSON.parse(priorFeedbackSource.toString("utf8")) as PriorFeedback
const priorValidation = JSON.parse(priorValidationSource.toString("utf8")) as Validation
const currentValidation = JSON.parse(currentValidationSource.toString("utf8")) as Validation
const holdout = JSON.parse(holdoutSource.toString("utf8")) as CorpusResult
if (development.experimentVersion !== GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION ||
	priorPlan.experimentVersion !== "gradient-eligibility-0.8.0-dev" ||
	priorPlan.provenance.developmentSha256 !== sha256(developmentSource) ||
	priorFeedback.reviewVersion !== priorPlan.reviewVersion ||
	priorFeedback.experimentVersion !== priorPlan.experimentVersion ||
	priorFeedback.planSha256 !== sha256(priorPlanSource) || priorFeedback.htmlSha256 !== sha256(priorHtmlSource)) {
	throw new Error("Prior retained review provenance is invalid")
}
if (priorValidation.candidateVersion !== priorPlan.experimentVersion ||
	currentValidation.candidateVersion !== GRADIENT_ELIGIBILITY_CANDIDATE_VERSION ||
	holdout.algorithmVersion !== "region-graph-0.17.0") throw new Error("Validation evidence is invalid")
const developmentByFamily = new Map(development.entries.map((entry) => [entry.familyId, entry]))
const submitted = new Set(priorFeedback.entries.map((entry) => entry.familyId))
if (developmentByFamily.size !== development.entries.length || submitted.size !== priorFeedback.entries.length) {
	throw new Error("Development or prior feedback entries are duplicated")
}
const affected = priorPlan.entries.flatMap((reviewed) => {
	const current = developmentByFamily.get(reviewed.familyId)
	if (!current || current.anchor.file !== reviewed.anchor.file || current.anchor.sha256 !== reviewed.anchor.sha256 ||
		!isDeepStrictEqual(current.palette.background.rgb, reviewed.palette.background.rgb) ||
		!isDeepStrictEqual(current.palette.surface.rgb, reviewed.palette.surface.rgb)) {
		throw new Error(`Prior reviewed endpoint pair changed for ${reviewed.familyId}`)
	}
	const decision = decideGradientEligibility(current.evidence)
	return decision.reason === "insufficient-progressive-field-support"
		? [{ ...reviewed, candidateReason: decision.reason }]
		: []
})
const musicEntries = affected.filter((entry) => !submitted.has(entry.familyId))
const priorValidationByFile = new Map(priorValidation.entries.filter((entry) => entry.cohort === "holdout")
	.map((entry) => [entry.file, entry]))
const holdoutPaletteByFile = new Map(holdout.entries.map((entry) => [entry.file, entry.extraction.methods.spatial]))
const holdoutEntries = currentValidation.entries.flatMap((entry) => {
	const prior = priorValidationByFile.get(entry.file)
	if (entry.cohort !== "holdout" || !entry.baselineGradient || entry.candidateEligible ||
		entry.reason !== "insufficient-progressive-field-support" || !prior?.candidateEligible) return []
	const palette = holdoutPaletteByFile.get(entry.file)
	if (!palette || !isDeepStrictEqual(palette.background.rgb, entry.background) ||
		!isDeepStrictEqual(palette.surface.rgb, entry.surface)) throw new Error(`Holdout endpoint pair changed for ${entry.file}`)
	return [{
		familyId: `holdout-${entry.file.replace(/^00\//, "").replace(/\.[^.]+$/, "")}`,
		anchor: { file: entry.file },
		palette,
		candidateReason: entry.reason,
	}]
})
const entries = [...musicEntries, ...holdoutEntries].sort((first, second) =>
	sha256(Buffer.from(`gradient-eligibility-iteration/${first.familyId}`)).localeCompare(
		sha256(Buffer.from(`gradient-eligibility-iteration/${second.familyId}`))))
await writeJsonAtomic({ path: resolve(outputArgument), refuseOverwrite: true }, {
	schemaVersion: 1,
	reviewVersion: "gradient-eligibility-iteration-review-0.1.0",
	experimentVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	generatedAt: new Date().toISOString(),
	provenance: {
		developmentSha256: sha256(developmentSource),
		priorRetainedPlanSha256: sha256(priorPlanSource),
		priorRetainedHtmlSha256: sha256(priorHtmlSource),
		priorRetainedFeedbackSha256: sha256(priorFeedbackSource),
		priorValidationSha256: sha256(priorValidationSource),
		currentValidationSha256: sha256(currentValidationSource),
		holdoutSha256: sha256(holdoutSource),
	},
	thresholds: GRADIENT_ELIGIBILITY_THRESHOLDS,
	summary: {
		priorCandidateVersion: priorPlan.experimentVersion,
		priorUnseenRetained: priorPlan.entries.length,
		newlyRejectedMusicFromPriorRetained: affected.length,
		alreadyReviewedMusicRejections: affected.length - musicEntries.length,
		unreviewedMusicRejections: musicEntries.length,
		newlyRejectedHoldout: holdoutEntries.length,
		reviewCases: entries.length,
	},
	entries,
})
process.stderr.write(`Prepared ${entries.length} unreviewed iteration changes; excluded ${affected.length - musicEntries.length} previously reviewed music cases\n`)
