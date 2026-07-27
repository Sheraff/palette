import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	parseControlledFieldStateFeedbackStore,
	parseControlledFieldStateManifest,
} from "./src/controlled-field-state-review.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const reviewRoot = resolve(
	projectRoot,
	"research/data/experiments/controlled-field-state-supervision-0.1.0-development/review-v1",
)
const manifestPath = resolve(reviewRoot, "batch-01-manifest.json")
const feedbackPath = resolve(reviewRoot, "batch-01-feedback.json")
const planPath = resolve(reviewRoot, "plan.json")
const outputPath = resolve(reviewRoot, "batch-01-partial-stop-analysis.json")

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function countBy(values: readonly string[]): Record<string, number> {
	const counts: Record<string, number> = {}
	for (const value of values) counts[value] = (counts[value] ?? 0) + 1
	return counts
}

if (process.argv.length !== 2) throw new Error("analyze-controlled-field-state-partial-review.ts does not accept arguments")
const [manifestSource, feedbackSource, planSource] = await Promise.all([
	readFile(manifestPath),
	readFile(feedbackPath),
	readFile(planPath),
])
const manifest = parseControlledFieldStateManifest(JSON.parse(manifestSource.toString("utf8")) as unknown)
const feedback = parseControlledFieldStateFeedbackStore(JSON.parse(feedbackSource.toString("utf8")) as unknown, manifest)
const plan = JSON.parse(planSource.toString("utf8")) as { experimentId?: unknown; totalCases?: unknown; totalBatches?: unknown }
if (plan.experimentId !== manifest.experimentId || plan.totalCases !== manifest.batch.totalCases ||
	plan.totalBatches !== manifest.batch.totalBatches || feedback.entries.length === 0 ||
	feedback.entries.length >= manifest.entries.length) {
	throw new Error("Controlled field-state partial review inputs are inconsistent or not partial")
}
const entryByCase = new Map(manifest.entries.map((entry) => [entry.caseId, entry]))
const submitted = feedback.entries.map((entry) => {
	const reviewEntry = entryByCase.get(entry.caseId)!
	return {
		caseId: entry.caseId,
		order: reviewEntry.order,
		sourceSha256: entry.sourceSha256,
		task: reviewEntry.task,
		sourceEligibility: entry.sourceEligibility,
		preference: entry.preference,
		reasonsA: entry.reasonsA,
		reasonsB: entry.reasonsB,
		note: entry.note,
		submittedAt: entry.submittedAt,
	}
})
const eligible = submitted.filter((entry) => entry.sourceEligibility === "eligible-artwork")
const analyzerPath = fileURLToPath(import.meta.url)
const analysis = {
	schemaVersion: 1,
	reviewVersion: manifest.reviewVersion,
	experimentId: manifest.experimentId,
	manifestId: manifest.manifestId,
	status: "partial-user-stopped",
	generatedAt: new Date().toISOString(),
	provenance: {
		manifestSha256: sha256(manifestSource),
		feedbackSha256: sha256(feedbackSource),
		planSha256: sha256(planSource),
		analyzerSha256: sha256(await readFile(analyzerPath)),
	},
	coverage: {
		batchExpected: manifest.entries.length,
		submitted: feedback.entries.length,
		batchUnsubmitted: manifest.entries.length - feedback.entries.length,
		totalCases: manifest.batch.totalCases,
		totalUnsubmitted: manifest.batch.totalCases - feedback.entries.length,
		eligible: eligible.length,
		ineligible: submitted.length - eligible.length,
		sourceGroups: new Set(submitted.map((entry) => entry.sourceSha256)).size,
		complete: false,
		batch02Opened: false,
	},
	structuredEvidence: {
		tasks: countBy(eligible.map((entry) => entry.task)),
		preferences: countBy(eligible.flatMap((entry) => entry.preference ? [entry.preference] : [])),
		reasonSelections: countBy(eligible.flatMap((entry) => [...entry.reasonsA, ...entry.reasonsB])),
		commentCount: eligible.filter((entry) => entry.note.length > 0).length,
	},
	stopBasis: {
		explicitUserStop: true,
		reviewerAssessment: "The displayed complete treatments were broadly unacceptable and not shippable.",
		replacementDirection: "complete-palettes-only",
	},
	designFailure: {
		isolatedFactorsWereReviewedWithoutPriorCompletePaletteValidity: true,
		fixedRolesCouldInvalidateTheTestedFactor: true,
		neitherCompleteTreatmentAcceptableWasUnavailable: true,
		eitherWayWorksCannotEncodeBothUnacceptable: true,
	},
	disposition: {
		experiment: "development-rejected",
		completeBatch01: false,
		openBatch02: false,
		requestMoreFactorizedReview: false,
		fitPairModel: false,
		fitMultiplicityModel: false,
		useGradientTransferJudgment: false,
		promotionAuthorized: false,
		replacementProtocol: "complete-palette-review",
		reason: "Partial review exposed invalid complete treatments, so isolated field judgments are not interpretable.",
	},
	policy: {
		partialFeedbackPreservedVerbatim: true,
		structuredPreferencesNotReinterpreted: true,
		commentsUsedAsLabels: false,
		commentsUsedAsColorTargets: false,
		unsubmittedCasesRemainUnjudged: true,
		partialReviewUsedForFitting: false,
	},
	entries: submitted,
}
await writeFile(outputPath, `${JSON.stringify(analysis, null, 2)}\n`, { flag: "wx" })
process.stderr.write(`Recorded stopped controlled review at ${outputPath}\n`)
