import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { writeJsonAtomic } from "./src/candidate-output.ts"
import { GRADIENT_ELIGIBILITY_CANDIDATE_VERSION } from "./src/gradient-eligibility.ts"
import type { GradientEligibilityCertificate } from "./src/gradient-eligibility-extract.ts"
import type { Palette } from "./src/types.ts"

type Source = { file: string; sha256: string; width: number; height: number; bytes: number }
type Manifest = { manifestVersion: string; manifestId: string; families: Array<{ familyId: string; anchor: Source }> }
type EvaluationEntry = {
	familyId: string
	anchor: Source
	palette: Palette
	certificate: GradientEligibilityCertificate
}
type Evaluation = {
	manifestId: string
	manifestSha256: string
	candidateAlgorithmVersion: string
	entries: EvaluationEntry[]
}
type PriorReview = { manifestId: string; entries: Array<{ familyId: string }> }

const [manifestArgument, evaluationArgument, outputArgument, selectionArgument = "default", ...priorReviewArguments] =
	process.argv.slice(2)
if (!manifestArgument || !evaluationArgument || !outputArgument) {
	throw new Error("Usage: prepare-gradient-eligibility-sealed-review.ts <manifest.json> <evaluation.json> <output.json> [default|removed|retained] [prior-review.json ...]")
}
if (selectionArgument !== "default" && selectionArgument !== "removed" && selectionArgument !== "retained") {
	throw new Error("Review selection must be default, removed, or retained")
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

const [manifestSource, evaluationSource, ...priorReviewSources] = await Promise.all([
	readFile(resolve(manifestArgument)),
	readFile(resolve(evaluationArgument)),
	...priorReviewArguments.map((argument) => readFile(resolve(argument))),
])
const manifest = JSON.parse(manifestSource.toString("utf8")) as Manifest
const evaluation = JSON.parse(evaluationSource.toString("utf8")) as Evaluation
const priorReviews = priorReviewSources.map((source) => JSON.parse(source.toString("utf8")) as PriorReview)
const reviewVersion = manifest.manifestVersion === "gradient-eligibility-sealed-validation-0.1.0"
	? "gradient-eligibility-sealed-validation-review-0.1.0"
	: manifest.manifestVersion === "gradient-eligibility-sealed-validation-0.2.0"
	? "gradient-eligibility-sealed-validation-review-0.2.0"
	: manifest.manifestVersion === "gradient-eligibility-sealed-validation-0.3.0"
	? "gradient-eligibility-sealed-validation-review-0.3.0"
	: manifest.manifestVersion === "gradient-eligibility-sealed-validation-0.4.0"
	? "gradient-eligibility-sealed-validation-review-0.4.0"
	: manifest.manifestVersion === "gradient-eligibility-sealed-validation-0.5.0"
	? "gradient-eligibility-sealed-validation-review-0.5.0"
	: manifest.manifestVersion === "gradient-eligibility-sealed-validation-0.6.0"
	? "gradient-eligibility-sealed-validation-review-0.6.0"
	: null
if (!reviewVersion || evaluation.manifestId !== manifest.manifestId || evaluation.manifestSha256 !== sha256(manifestSource) ||
	evaluation.candidateAlgorithmVersion !== GRADIENT_ELIGIBILITY_CANDIDATE_VERSION ||
	!Array.isArray(manifest.families) || !Array.isArray(evaluation.entries)) {
	throw new Error("Evaluation does not match the sealed manifest and candidate")
}
if (priorReviews.some((review) => review.manifestId !== manifest.manifestId || !Array.isArray(review.entries))) {
	throw new Error("Prior review does not match the sealed manifest")
}
const manifestByFamily = new Map(manifest.families.map((family) => [family.familyId, family]))
const reviewAllGradients = manifest.manifestVersion === "gradient-eligibility-sealed-validation-0.3.0"
const previouslyReviewed = new Set(priorReviews.flatMap((review) => review.entries.map((entry) => entry.familyId)))
const canonicalGradients = evaluation.entries.filter((entry) => entry.certificate.baselineGradient &&
	!previouslyReviewed.has(entry.familyId))
const reviewPool = selectionArgument === "retained"
	? canonicalGradients.filter((entry) => entry.certificate.decision.eligible)
		.sort((first, second) => sha256(`${manifest.manifestId}/${first.familyId}/retained-sample`).localeCompare(
			sha256(`${manifest.manifestId}/${second.familyId}/retained-sample`))).slice(0, 25)
	: selectionArgument === "removed"
		? canonicalGradients.filter((entry) => !entry.certificate.decision.eligible).slice(0, 25)
		: canonicalGradients.filter((entry) => reviewAllGradients || !entry.certificate.decision.eligible)
const entries = reviewPool.map((entry) => {
	const family = manifestByFamily.get(entry.familyId)
	if (!family || family.anchor.file !== entry.anchor.file || family.anchor.sha256 !== entry.anchor.sha256 ||
		entry.palette.gradient.isGradient !== entry.certificate.decision.eligible) {
		throw new Error(`Reviewed entry is not bound to the manifest: ${entry.familyId}`)
	}
	return {
		familyId: entry.familyId,
		anchor: entry.anchor,
		palette: entry.palette,
		candidateReason: entry.certificate.decision.reason,
		candidateEligible: entry.certificate.decision.eligible,
		presentation: {
			gradientFirst: Number.parseInt(sha256(`${manifest.manifestId}/${entry.familyId}/presentation`).slice(0, 2), 16) % 2 === 0,
		},
	}
}).sort((first, second) => sha256(`${manifest.manifestId}/${first.familyId}/order`).localeCompare(
	sha256(`${manifest.manifestId}/${second.familyId}/order`)))
await writeJsonAtomic({ path: resolve(outputArgument), refuseOverwrite: true }, {
	schemaVersion: 1,
	reviewVersion,
	experimentVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	generatedAt: new Date().toISOString(),
	manifestId: manifest.manifestId,
	manifestSha256: sha256(manifestSource),
	evaluationSha256: sha256(evaluationSource),
	selection: selectionArgument,
	priorReviewSha256s: priorReviewSources.map((source) => sha256(source)),
	summary: {
		validationFamilies: manifest.families.length,
		canonicalGradients: evaluation.entries.filter((entry) => entry.certificate.baselineGradient).length,
		changedCases: entries.filter((entry) => !entry.candidateEligible).length,
		retainedCases: entries.filter((entry) => entry.candidateEligible).length,
		reviewCases: entries.length,
	},
	entries,
})
process.stderr.write(`Prepared ${entries.length} sealed canonical gradients for blinded review\n`)
