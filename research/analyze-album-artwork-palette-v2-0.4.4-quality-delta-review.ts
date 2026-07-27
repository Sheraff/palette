import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

type Quality = "strong" | "acceptable" | "weak-fallback" | "unacceptable" | "uncertain"

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const experimentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.4.4-development")
const manifestPath = resolve(experimentDirectory, "absolute-quality-delta-review-manifest.json")
const feedbackPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-0.4.4-lightweight-delta-feedback.json")
const preparationPath = resolve(experimentDirectory, "absolute-quality-delta-preparation.json")
const outputPath = resolve(experimentDirectory, "absolute-quality-delta-analysis.json")

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex")
}

function qualityCounts(values: readonly Quality[]): Record<Quality, number> {
	return {
		strong: values.filter((value) => value === "strong").length,
		acceptable: values.filter((value) => value === "acceptable").length,
		"weak-fallback": values.filter((value) => value === "weak-fallback").length,
		unacceptable: values.filter((value) => value === "unacceptable").length,
		uncertain: values.filter((value) => value === "uncertain").length,
	}
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
	await rename(temporary, path)
}

const [manifestRaw, feedbackRaw, preparationRaw] = await Promise.all([
	readFile(manifestPath, "utf8"),
	readFile(feedbackPath, "utf8"),
	readFile(preparationPath, "utf8"),
])
const manifest = JSON.parse(manifestRaw) as {
	reviewVersion: string
	manifestId: string
	candidateVersion: string
	implementationHash: string
	scientificSha256: string
	cases: Array<{ caseId: string; sourceSha256: string; winnerTreatmentId: string }>
}
const feedback = JSON.parse(feedbackRaw) as {
	reviewVersion: string
	manifestId: string
	entries: Array<{
		caseId: string
		sourceSha256: string
		treatmentId: string
		quality: Quality
		comment: string
		submittedAt: string
	}>
}
const preparation = JSON.parse(preparationRaw) as {
	transferredExactTopCount: number
	changedTopCount: number
	transferredExactTops: Array<{
		caseId: string
		sourceSha256: string
		absoluteQuality: Quality
		comment: string
		currentTreatmentId: string
	}>
	changedTopCaseIds: string[]
	freshSampleOpened: false
}
const qualities = new Set<Quality>(["strong", "acceptable", "weak-fallback", "unacceptable", "uncertain"])
assert(feedback.reviewVersion === manifest.reviewVersion, "Feedback review version does not match the manifest")
assert(feedback.manifestId === manifest.manifestId, "Feedback manifest ID does not match the manifest")
assert(feedback.entries.length === manifest.cases.length, "Feedback must cover every delta case")
assert(preparation.freshSampleOpened === false, "Fresh sample seal is not closed")
const caseById = new Map(manifest.cases.map((reviewCase) => [reviewCase.caseId, reviewCase]))
const seen = new Set<string>()
for (const entry of feedback.entries) {
	const reviewCase = caseById.get(entry.caseId)
	assert(reviewCase, `Unknown delta response ${entry.caseId}`)
	assert(!seen.has(entry.caseId), `Duplicate delta response ${entry.caseId}`)
	seen.add(entry.caseId)
	assert(entry.sourceSha256 === reviewCase.sourceSha256, `Source identity mismatch for ${entry.caseId}`)
	assert(entry.treatmentId === reviewCase.winnerTreatmentId, `Treatment identity mismatch for ${entry.caseId}`)
	assert(qualities.has(entry.quality), `Invalid quality for ${entry.caseId}`)
	assert(Number.isFinite(Date.parse(entry.submittedAt)), `Invalid timestamp for ${entry.caseId}`)
}

const changedResults = feedback.entries.map((entry) => ({
	caseId: entry.caseId,
	sourceSha256: entry.sourceSha256,
	treatmentId: entry.treatmentId,
	absoluteQuality: entry.quality,
	comment: entry.comment,
	reviewSource: "0.4.4-delta-review" as const,
}))
const transferredResults = preparation.transferredExactTops.map((entry) => ({
	caseId: entry.caseId,
	sourceSha256: entry.sourceSha256,
	treatmentId: entry.currentTreatmentId,
	absoluteQuality: entry.absoluteQuality,
	comment: entry.comment,
	reviewSource: "exact-0.4.1-transfer" as const,
}))
const combinedResults = [...changedResults, ...transferredResults].sort((first, second) =>
	first.caseId.localeCompare(second.caseId))
assert(combinedResults.length === 12, "Combined absolute-quality result must contain 12 cases")
const deltaDistribution = qualityCounts(changedResults.map(({ absoluteQuality }) => absoluteQuality))
const combinedDistribution = qualityCounts(combinedResults.map(({ absoluteQuality }) => absoluteQuality))
const positiveCount = combinedDistribution.strong + combinedDistribution.acceptable
const priorDistribution: Record<Quality, number> = {
	strong: 5,
	acceptable: 2,
	"weak-fallback": 4,
	unacceptable: 1,
	uncertain: 0,
}
const technicalFailureClasses = [
	{
		failureClass: "gradient-state-underselection",
		caseIds: ["development-06", "development-16", "development-22"],
		currentQualities: ["acceptable", "acceptable", "strong"],
		interpretation: "Repeated gradient requests remain qualified improvements on independently usable complete treatments.",
	},
	{
		failureClass: "foreground-polarity-or-text-role",
		caseIds: ["development-03", "development-26"],
		currentQualities: ["unacceptable", "acceptable"],
		interpretation: "One unchanged failure and one usable-but-not-ideal treatment retain a foreground-role mismatch.",
	},
	{
		failureClass: "deterministic-top-below-known-alternative",
		caseIds: ["development-19"],
		currentQualities: ["acceptable"],
		interpretation: "The current top is usable but prior review contains a strongly preferred exact predecessor.",
	},
]
const phase3Pass = positiveCount === 11 && combinedDistribution["weak-fallback"] === 0 && combinedDistribution.uncertain === 0
const analysis = {
	schemaVersion: 1,
	reviewVersion: manifest.reviewVersion,
	manifestId: manifest.manifestId,
	candidateVersion: manifest.candidateVersion,
	implementationHash: manifest.implementationHash,
	scientificSha256: manifest.scientificSha256,
	inputHashes: {
		manifestSha256: sha256(manifestRaw),
		feedbackSha256: sha256(feedbackRaw),
		preparationSha256: sha256(preparationRaw),
	},
	storeIntegrity: {
		changedExpectedCount: preparation.changedTopCount,
		changedReviewedCount: feedback.entries.length,
		changedUniqueCount: seen.size,
		transferredExactCount: preparation.transferredExactTopCount,
		combinedCaseCount: combinedResults.length,
	},
	deltaDistribution,
	combinedDistribution,
	priorDistribution,
	distributionChange: {
		strong: combinedDistribution.strong - priorDistribution.strong,
		acceptable: combinedDistribution.acceptable - priorDistribution.acceptable,
		"weak-fallback": combinedDistribution["weak-fallback"] - priorDistribution["weak-fallback"],
		unacceptable: combinedDistribution.unacceptable - priorDistribution.unacceptable,
		uncertain: combinedDistribution.uncertain - priorDistribution.uncertain,
		positive: positiveCount - (priorDistribution.strong + priorDistribution.acceptable),
	},
	technicalFailureClasses,
	caseResults: combinedResults,
	phase3Gate: {
		pass: phase3Pass,
		positiveCount,
		positiveShare: positiveCount / combinedResults.length,
		freezeCandidateForPhase4: phase3Pass,
		reason: "Eleven of twelve deterministic tops are strong or acceptable, no weak fallbacks remain, and additional development-only tuning would center one unchanged known failure.",
	},
	phaseDisposition: phase3Pass
		? "phase3-passed-freeze-0.4.4-for-one-time-fresh-directional-review"
		: "phase3-failed-continue-development",
	freshSampleOpened: false,
	nextStep: "Freeze 0.4.4 and run the preselected fresh sample once against region-graph-0.19.0 without adaptation.",
}

await atomicJson(outputPath, analysis)
process.stdout.write(`${JSON.stringify({ deltaDistribution, combinedDistribution, distributionChange: analysis.distributionChange, phaseDisposition: analysis.phaseDisposition })}\n`)
