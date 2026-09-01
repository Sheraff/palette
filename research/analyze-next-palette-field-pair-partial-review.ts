import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	parseNextPaletteReviewFeedbackStore,
	parseNextPaletteReviewManifest,
	type NextPaletteReviewFailureClass,
	type NextPaletteReviewQuality,
} from "./src/next-palette-review.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const reviewRoot = resolve(
	projectRoot,
	"research/data/experiments/next-palette-0.2.0-field-pair-development/review-v1",
)
const manifestPath = resolve(reviewRoot, "batch-01-manifest.json")
const feedbackPath = resolve(reviewRoot, "batch-01-feedback.json")
const planPath = resolve(reviewRoot, "plan.json")
const outputPath = resolve(reviewRoot, "batch-01-partial-analysis.json")

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function countBy<T extends string>(values: readonly T[]): Record<T, number> {
	const counts = {} as Record<T, number>
	for (const value of values) counts[value] = (counts[value] ?? 0) + 1
	return counts
}

type UnblindedEntry = {
	caseId: string
	order: number
	file: string
	cohort: string
	frontierSignature: string
	sourceEligibility: string
	baselineQuality: NextPaletteReviewQuality | null
	candidateQuality: NextPaletteReviewQuality | null
	comparison: "baseline-stronger" | "candidate-stronger" | "both-similarly-valid" | "neither-acceptable" | "uncertain" | null
	baselineFailureClasses: NextPaletteReviewFailureClass[]
	candidateFailureClasses: NextPaletteReviewFailureClass[]
	note: string
	submittedAt: string
}
type Plan = {
	experimentId: string
	comparisonAlgorithmVersion: string
	candidateAlgorithmVersion: string
	transfers: Array<{
		caseId: string
		file: string
		classification: "previous-candidate" | "canonical-baseline" | "ineligible"
		quality: NextPaletteReviewQuality | null
	}>
}

const [manifestSource, feedbackSource, planSource] = await Promise.all([
	readFile(manifestPath),
	readFile(feedbackPath),
	readFile(planPath),
])
const manifest = parseNextPaletteReviewManifest(JSON.parse(manifestSource.toString("utf8")) as unknown)
const feedback = parseNextPaletteReviewFeedbackStore(JSON.parse(feedbackSource.toString("utf8")) as unknown, manifest)
const plan = JSON.parse(planSource.toString("utf8")) as Plan
if (plan.experimentId !== manifest.experimentId || plan.comparisonAlgorithmVersion !== manifest.baselineAlgorithmVersion ||
	plan.candidateAlgorithmVersion !== manifest.candidateAlgorithmVersion || feedback.entries.length === 0 ||
	feedback.entries.length >= manifest.entries.length) {
	throw new Error("Field-pair partial review inputs are inconsistent or not partial")
}
const feedbackByCase = new Map(feedback.entries.map((entry) => [entry.caseId, entry]))
const entries: UnblindedEntry[] = manifest.entries.flatMap((entry) => {
	const stored = feedbackByCase.get(entry.caseId)
	if (!stored) return []
	const candidateOption = entry.assignment.A === "candidate" ? "A" : "B"
	const baselineOption = candidateOption === "A" ? "B" : "A"
	const optionQuality = (option: "A" | "B") => option === "A" ? stored.qualityA : stored.qualityB
	const optionFailures = (option: "A" | "B") => option === "A" ? stored.failureClassesA : stored.failureClassesB
	let comparison: UnblindedEntry["comparison"] = null
	if (stored.preference === "both-similarly-valid" || stored.preference === "neither-acceptable" ||
		stored.preference === "uncertain") comparison = stored.preference
	else if (stored.preference === "a-stronger" || stored.preference === "b-stronger") {
		const preferredOption = stored.preference === "a-stronger" ? "A" : "B"
		comparison = entry.assignment[preferredOption] === "candidate" ? "candidate-stronger" : "baseline-stronger"
	}
	return [{
		caseId: entry.caseId,
		order: entry.order,
		file: entry.source.file,
		cohort: entry.cohort,
		frontierSignature: entry.frontierSignature,
		sourceEligibility: stored.sourceEligibility,
		baselineQuality: optionQuality(baselineOption),
		candidateQuality: optionQuality(candidateOption),
		comparison,
		baselineFailureClasses: optionFailures(baselineOption),
		candidateFailureClasses: optionFailures(candidateOption),
		note: stored.note,
		submittedAt: stored.submittedAt,
	}]
})
const eligible = entries.filter((entry) => entry.sourceEligibility === "eligible-artwork")
const positive = new Set<NextPaletteReviewQuality>(["strong", "acceptable-not-ideal"])
const negative = new Set<NextPaletteReviewQuality>(["weak-fallback", "unacceptable"])
const pairedOutcome = (entry: UnblindedEntry): string => {
	if (!entry.baselineQuality || !entry.candidateQuality) return "ineligible"
	const baselinePositive = positive.has(entry.baselineQuality)
	const candidatePositive = positive.has(entry.candidateQuality)
	if (baselinePositive && candidatePositive) return "both-positive"
	if (baselinePositive && negative.has(entry.candidateQuality)) return "baseline-positive-candidate-negative"
	if (candidatePositive && negative.has(entry.baselineQuality)) return "candidate-positive-baseline-negative"
	if (negative.has(entry.baselineQuality) && negative.has(entry.candidateQuality)) return "both-negative"
	return "uncertain"
}
const failureCount = (side: "baseline" | "candidate"): Record<string, number> => countBy(eligible.flatMap((entry) =>
	side === "baseline" ? entry.baselineFailureClasses : entry.candidateFailureClasses))
const qualitySummary = (qualities: Array<NextPaletteReviewQuality | null>) => {
	const known = qualities.flatMap((quality) => quality ? [quality] : [])
	return {
		counts: countBy(known),
		positive: known.filter((quality) => positive.has(quality)).length,
		negative: known.filter((quality) => negative.has(quality)).length,
		uncertain: known.filter((quality) => !positive.has(quality) && !negative.has(quality)).length,
	}
}
const transferQualities = plan.transfers.flatMap((entry) => entry.classification === "ineligible" ? [] : [entry.quality])
const submittedCandidateQualities = eligible.map((entry) => entry.candidateQuality)
const knownCandidateQualities = [...transferQualities, ...submittedCandidateQualities]
const analyzerPath = fileURLToPath(import.meta.url)
const analysis = {
	schemaVersion: 1,
	reviewVersion: manifest.reviewVersion,
	experimentId: manifest.experimentId,
	manifestId: manifest.manifestId,
	status: "partial-user-stopped",
	batch: manifest.batch,
	generatedAt: new Date().toISOString(),
	provenance: {
		manifestSha256: sha256(manifestSource),
		feedbackSha256: sha256(feedbackSource),
		planSha256: sha256(planSource),
		analyzerSha256: sha256(await readFile(analyzerPath)),
	},
	coverage: {
		expected: manifest.entries.length,
		submitted: feedback.entries.length,
		unsubmitted: manifest.entries.length - feedback.entries.length,
		eligible: eligible.length,
		ineligible: entries.length - eligible.length,
		complete: false,
		batch02Opened: false,
	},
	quality: {
		baseline: qualitySummary(eligible.map((entry) => entry.baselineQuality)),
		candidate: qualitySummary(submittedCandidateQualities),
		paired: countBy(eligible.map(pairedOutcome)),
	},
	comparison: countBy(eligible.flatMap((entry) => entry.comparison ? [entry.comparison] : [])),
	failureClasses: { baseline: failureCount("baseline"), candidate: failureCount("candidate") },
	comments: { count: eligible.filter((entry) => entry.note.length > 0).length },
	exactTransfers: {
		eligible: transferQualities.length,
		ineligible: plan.transfers.filter((entry) => entry.classification === "ineligible").length,
		candidateQuality: qualitySummary(transferQualities),
	},
	knownCandidateEvidence: {
		eligible: knownCandidateQualities.length,
		quality: qualitySummary(knownCandidateQualities),
		unreviewedNovelCases: manifest.batch.totalCases - feedback.entries.length,
	},
	disposition: {
		candidate: "development-rejected",
		completeRemainingBatch01: false,
		openBatch02: false,
		requestMoreHumanReview: false,
		reason: "The reviewer stopped because the candidate remained unsatisfactory; submitted evidence is sufficient for early development rejection.",
	},
	policy: {
		positiveQualityValues: [...positive],
		negativeQualityValues: [...negative],
		positiveJudgmentsAreNonExclusive: true,
		unsubmittedCasesRemainUnjudged: true,
		partialReviewDoesNotAuthorizePromotion: true,
		targetColorsInferred: false,
	},
	entries,
}
await writeFile(outputPath, `${JSON.stringify(analysis, null, 2)}\n`, { flag: "wx" })
process.stderr.write(`Analyzed ${entries.length}/${manifest.entries.length} submitted field-pair reviews at ${outputPath}\n`)
