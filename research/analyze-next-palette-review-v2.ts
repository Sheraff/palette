import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	parseNextPaletteReviewFeedbackStore,
	parseNextPaletteReviewManifest,
	type NextPaletteReviewFailureClass,
	type NextPaletteReviewQuality,
} from "./src/next-palette-review-v2.ts"

const [manifestArgument, feedbackArgument, outputArgument, ...unexpected] = process.argv.slice(2)
if (!manifestArgument || !feedbackArgument || !outputArgument || unexpected.length > 0) {
	throw new Error("Usage: analyze-next-palette-review-v2.ts <manifest.json> <feedback.json> <analysis.json>")
}
const manifestPath = resolve(manifestArgument)
const feedbackPath = resolve(feedbackArgument)
const outputPath = resolve(outputArgument)

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function countBy<T extends string>(values: readonly T[]): Record<T, number> {
	const counts = {} as Record<T, number>
	for (const value of values) counts[value] = (counts[value] ?? 0) + 1
	return counts
}

const [manifestSource, feedbackSource] = await Promise.all([readFile(manifestPath), readFile(feedbackPath)])
const manifest = parseNextPaletteReviewManifest(JSON.parse(manifestSource.toString("utf8")) as unknown)
const feedback = parseNextPaletteReviewFeedbackStore(JSON.parse(feedbackSource.toString("utf8")) as unknown, manifest)
if (feedback.entries.length !== manifest.entries.length) {
	throw new Error(`Batch feedback is incomplete: ${feedback.entries.length}/${manifest.entries.length}`)
}
const feedbackByCase = new Map(feedback.entries.map((entry) => [entry.caseId, entry]))
if (manifest.entries.some((entry) => !feedbackByCase.has(entry.caseId))) throw new Error("Batch feedback coverage is incomplete")

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

const entries: UnblindedEntry[] = manifest.entries.map((entry) => {
	const stored = feedbackByCase.get(entry.caseId)!
	const candidateOption = entry.assignment.A === "candidate" ? "A" : "B"
	const baselineOption = candidateOption === "A" ? "B" : "A"
	const optionQuality = (option: "A" | "B") => option === "A" ? stored.qualityA : stored.qualityB
	const optionFailures = (option: "A" | "B") => option === "A" ? stored.failureClassesA : stored.failureClassesB
	let comparison: UnblindedEntry["comparison"] = null
	if (stored.preference === "both-similarly-valid" || stored.preference === "neither-acceptable" || stored.preference === "uncertain") {
		comparison = stored.preference
	} else if (stored.preference === "a-stronger" || stored.preference === "b-stronger") {
		const preferredOption = stored.preference === "a-stronger" ? "A" : "B"
		comparison = entry.assignment[preferredOption] === "candidate" ? "candidate-stronger" : "baseline-stronger"
	}
	return {
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
	}
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
const analyzerPath = fileURLToPath(import.meta.url)
const analysis = {
	schemaVersion: 1,
	reviewVersion: manifest.reviewVersion,
	presentationVersion: manifest.presentationVersion,
	experimentId: manifest.experimentId,
	manifestId: manifest.manifestId,
	batch: manifest.batch,
	generatedAt: new Date().toISOString(),
	provenance: {
		manifestSha256: sha256(manifestSource),
		feedbackSha256: sha256(feedbackSource),
		analyzerSha256: sha256(await readFile(analyzerPath)),
	},
	coverage: {
		expected: manifest.entries.length,
		submitted: feedback.entries.length,
		eligible: eligible.length,
		ineligible: entries.length - eligible.length,
		complete: feedback.entries.length === manifest.entries.length,
	},
	quality: {
		baseline: countBy(eligible.flatMap((entry) => entry.baselineQuality ? [entry.baselineQuality] : [])),
		candidate: countBy(eligible.flatMap((entry) => entry.candidateQuality ? [entry.candidateQuality] : [])),
		paired: countBy(eligible.map(pairedOutcome)),
	},
	comparison: countBy(eligible.flatMap((entry) => entry.comparison ? [entry.comparison] : [])),
	failureClasses: { baseline: failureCount("baseline"), candidate: failureCount("candidate") },
	comments: { count: eligible.filter((entry) => entry.note.length > 0).length },
	policy: {
		positiveQualityValues: [...positive],
		negativeQualityValues: [...negative],
		positiveJudgmentsAreNonExclusive: true,
		batchResultDoesNotAuthorizeAlgorithmChanges: true,
	},
	entries,
}
await writeFile(outputPath, `${JSON.stringify(analysis, null, 2)}\n`, { flag: "wx" })
process.stderr.write(`Analyzed complete next palette review v2 batch ${manifest.batch.index}/${manifest.batch.totalBatches} at ${outputPath}\n`)
