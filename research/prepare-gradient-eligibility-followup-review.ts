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
import type { Palette } from "./src/types.ts"

type Source = { file: string; sha256: string; width: number; height: number; bytes: number }
type EvaluationEntry = {
	familyId: string
	anchor: Source
	palette: Palette
	certificate: { baselineGradient: boolean; evidence: GradientEligibilityEvidence | null }
}
type Evaluation = { manifestId: string; manifestSha256: string; entries: EvaluationEntry[] }
type PriorReview = { manifestId: string; entries: Array<{ familyId: string }> }
type ExcludedReview = { manifestId: string; entries: Array<{ familyId: string }> }

const [evaluationArgument, priorReviewArgument, outputArgument, ...excludedReviewArguments] = process.argv.slice(2)
if (!evaluationArgument || !priorReviewArgument || !outputArgument) {
	throw new Error("Usage: prepare-gradient-eligibility-followup-review.ts <evaluation.json> <prior-review.json> <output.json> [excluded-review.json ...]")
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

const [evaluationSource, priorReviewSource, ...excludedReviewSources] = await Promise.all([
	readFile(resolve(evaluationArgument)),
	readFile(resolve(priorReviewArgument)),
	...excludedReviewArguments.map((argument) => readFile(resolve(argument))),
])
const evaluation = JSON.parse(evaluationSource.toString("utf8")) as Evaluation
const priorReview = JSON.parse(priorReviewSource.toString("utf8")) as PriorReview
const excludedReviews = excludedReviewSources.map((source) => JSON.parse(source.toString("utf8")) as ExcludedReview)
if (evaluation.manifestId !== priorReview.manifestId || !Array.isArray(evaluation.entries) ||
	!Array.isArray(priorReview.entries) || excludedReviews.some((review) =>
		review.manifestId !== evaluation.manifestId || !Array.isArray(review.entries))) {
	throw new Error("Round-3 evaluation or review is invalid")
}
const evaluationByFamily = new Map(evaluation.entries.map((entry) => [entry.familyId, entry]))
const excludedFamilies = new Set(excludedReviews.flatMap((review) => review.entries.map((entry) => entry.familyId)))
const unreviewed = priorReview.entries.slice(64).map((entry, index) => {
	const evaluated = evaluationByFamily.get(entry.familyId)
	if (!evaluated?.certificate.baselineGradient || !evaluated.certificate.evidence ||
		evaluated.certificate.evidence.experimentVersion !== GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION) {
		throw new Error(`Follow-up evidence is unavailable for ${entry.familyId}`)
	}
	const decision = decideGradientEligibility(evaluated.certificate.evidence)
	return {
		familyId: entry.familyId,
		anchor: evaluated.anchor,
		palette: evaluated.palette,
		candidateReason: decision.reason,
		candidateEligible: decision.eligible,
		originalPosition: index + 65,
		presentation: {
			gradientFirst: Number.parseInt(sha256(`${evaluation.manifestId}/${entry.familyId}/followup-presentation`)
				.slice(0, 2), 16) % 2 === 0,
		},
	}
}).filter((entry) => !excludedFamilies.has(entry.familyId))
const rejected = unreviewed.filter((entry) => !entry.candidateEligible)
const retained = unreviewed.filter((entry) => entry.candidateEligible)
	.sort((first, second) => sha256(`${evaluation.manifestId}/${first.familyId}/followup-retained`).localeCompare(
		sha256(`${evaluation.manifestId}/${second.familyId}/followup-retained`)))
	.slice(0, Math.max(0, 25 - rejected.length))
const entries = [...rejected, ...retained].sort((first, second) =>
	sha256(`${evaluation.manifestId}/${first.familyId}/followup-order`).localeCompare(
		sha256(`${evaluation.manifestId}/${second.familyId}/followup-order`)))
if (rejected.length > 25 || entries.length !== Math.min(25, unreviewed.length)) {
	throw new Error(`Expected at most 25 follow-up cases; received ${rejected.length} rejected and ${entries.length} total`)
}
await writeJsonAtomic({ path: resolve(outputArgument), refuseOverwrite: true }, {
	schemaVersion: 1,
	reviewVersion: "gradient-eligibility-round3-followup-review-0.1.0",
	experimentVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	generatedAt: new Date().toISOString(),
	manifestId: evaluation.manifestId,
	manifestSha256: evaluation.manifestSha256,
	provenance: {
		evaluationSha256: sha256(evaluationSource),
		priorReviewSha256: sha256(priorReviewSource),
		excludedReviewSha256s: excludedReviewSources.map((source) => sha256(source)),
	},
	evidenceVersion: GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION,
	thresholds: GRADIENT_ELIGIBILITY_THRESHOLDS,
	summary: {
		unreviewedSourceCases: unreviewed.length,
		previouslySampledExcluded: excludedFamilies.size,
		candidateRejectedIncluded: rejected.length,
		candidateRetainedSampled: retained.length,
		reviewCases: entries.length,
	},
	entries,
})
process.stderr.write(`Prepared ${entries.length} follow-up cases: ${rejected.length} rejected and ${retained.length} retained\n`)
