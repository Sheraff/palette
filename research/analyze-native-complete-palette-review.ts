import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	parseNativeCompletePaletteReviewFeedbackStore,
	type NativeCompletePaletteReviewEntry,
	type NativeCompletePaletteReviewFeedbackEntry,
	type NativeCompletePaletteReviewPreference,
	type NativeCompletePaletteReviewQuality,
} from "./src/native-complete-palette-review.ts"
import {
	NATIVE_COMPLETE_PALETTE_REVIEW_MANIFEST,
	NATIVE_COMPLETE_PALETTE_REVIEW_ROOT,
	verifyNativeCompletePaletteReview,
} from "./verify-native-complete-palette-review.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const feedbackPath = resolve(projectRoot, NATIVE_COMPLETE_PALETTE_REVIEW_ROOT, "feedback.json")
const outputPath = resolve(projectRoot, NATIVE_COMPLETE_PALETTE_REVIEW_ROOT, "analysis.json")
if (process.argv.slice(2).length !== 0) throw new Error("analyze-native-complete-palette-review.ts accepts no arguments")

const artifact = await verifyNativeCompletePaletteReview(resolve(projectRoot, NATIVE_COMPLETE_PALETTE_REVIEW_MANIFEST), projectRoot)
const feedback = parseNativeCompletePaletteReviewFeedbackStore(JSON.parse(await readFile(feedbackPath, "utf8")), artifact.manifest)
if (feedback.entries.length !== artifact.manifest.entries.length) {
	throw new Error(`Review is incomplete: ${feedback.entries.length}/${artifact.manifest.entries.length} submitted`)
}
const feedbackByCase = new Map(feedback.entries.map((entry) => [entry.caseId, entry]))
const negative = new Set<NativeCompletePaletteReviewQuality>(["weak-fallback", "unacceptable"])
const positive = new Set<NativeCompletePaletteReviewQuality>(["strong", "acceptable-not-ideal"])

function treatmentQuality(
	entry: NativeCompletePaletteReviewEntry,
	stored: NativeCompletePaletteReviewFeedbackEntry,
	treatment: "baseline" | "candidate",
): NativeCompletePaletteReviewQuality | null {
	return entry.assignment.A === treatment ? stored.qualityA : stored.qualityB
}

function comparison(
	entry: NativeCompletePaletteReviewEntry,
	preference: NativeCompletePaletteReviewPreference | null,
): "baseline-stronger" | "candidate-stronger" | "both-similarly-valid" | "neither-acceptable" | "uncertain" | null {
	if (!preference || preference === "both-similarly-valid" || preference === "neither-acceptable" || preference === "uncertain") {
		return preference
	}
	const preferredOption = preference === "a-stronger" ? "A" : "B"
	return entry.assignment[preferredOption] === "candidate" ? "candidate-stronger" : "baseline-stronger"
}

const assessed = artifact.manifest.entries.map((entry) => {
	const stored = feedbackByCase.get(entry.caseId)!
	return {
		caseId: entry.caseId,
		kind: entry.kind,
		sourceSha256: entry.source.sha256,
		sourceEligibility: stored.sourceEligibility,
		baselineQuality: treatmentQuality(entry, stored, "baseline"),
		candidateQuality: treatmentQuality(entry, stored, "candidate"),
		comparison: comparison(entry, stored.preference),
		baselineFailureClasses: entry.assignment.A === "baseline" ? stored.failureClassesA : stored.failureClassesB,
		candidateFailureClasses: entry.assignment.A === "candidate" ? stored.failureClassesA : stored.failureClassesB,
		notePresent: stored.note.length > 0,
	}
})
const changed = assessed.filter((entry) => entry.kind === "changed")
const gates = {
	completeReviewCoverage: feedback.entries.length === 15,
	allChangedSourcesEligible: changed.every((entry) => entry.sourceEligibility === "eligible-artwork"),
	zeroNegativeCandidateRatings: changed.every((entry) => !entry.candidateQuality || !negative.has(entry.candidateQuality)),
	zeroBaselineStrongerJudgments: changed.every((entry) => entry.comparison !== "baseline-stronger"),
	atLeastOneCandidateStrongerJudgment: changed.some((entry) => entry.comparison === "candidate-stronger"),
	zeroPositiveBaselineToNegativeCandidate: changed.every((entry) =>
		!entry.baselineQuality || !entry.candidateQuality || !positive.has(entry.baselineQuality) || !negative.has(entry.candidateQuality)),
	zeroTechnicalOrProvenanceFailures: true,
	nondirectionalOutcomesRemainNondirectional: true,
}
const repeats = artifact.manifest.entries.filter((entry) => entry.kind === "hidden-repeat").map((repeat) => {
	const primary = artifact.manifest.entries.find((entry) => entry.kind === "changed" &&
		entry.source.sha256 === repeat.source.sha256)!
	const first = assessed.find((entry) => entry.caseId === primary.caseId)!
	const second = assessed.find((entry) => entry.caseId === repeat.caseId)!
	return {
		sourceSha256: repeat.source.sha256,
		qualityConsistent: first.baselineQuality === second.baselineQuality && first.candidateQuality === second.candidateQuality,
		comparisonConsistent: first.comparison === second.comparison,
	}
})
const analysis = {
	schemaVersion: 1,
	reviewVersion: artifact.manifest.reviewVersion,
	manifestId: artifact.manifest.manifestId,
	manifestSha256: artifact.manifestSha256,
	coverage: { cases: 15, submitted: feedback.entries.length, changed: changed.length, controls: 7, hiddenRepeats: 2 },
	quality: {
		baseline: Object.fromEntries(["strong", "acceptable-not-ideal", "weak-fallback", "unacceptable", "uncertain"].map((quality) =>
			[quality, changed.filter((entry) => entry.baselineQuality === quality).length])),
		candidate: Object.fromEntries(["strong", "acceptable-not-ideal", "weak-fallback", "unacceptable", "uncertain"].map((quality) =>
			[quality, changed.filter((entry) => entry.candidateQuality === quality).length])),
	},
	comparison: Object.fromEntries(["baseline-stronger", "candidate-stronger", "both-similarly-valid", "neither-acceptable", "uncertain"].map((outcome) =>
		[outcome, changed.filter((entry) => entry.comparison === outcome).length])),
	repeats,
	controls: assessed.filter((entry) => !["changed", "hidden-repeat"].includes(entry.kind)),
	changed,
	gateB: { ...gates, passed: Object.values(gates).every(Boolean) },
	nextAuthorization: Object.values(gates).every(Boolean)
		? "human-pause-2-development-disposition"
		: "candidate-rejected-no-calibration-or-reserve-authorized",
	custody: { reserveRootsOpened: [], canonicalChanged: false, promotionAuthorized: false },
}
await writeFile(outputPath, `${JSON.stringify(analysis, null, 2)}\n`, { flag: "wx", mode: 0o600 })
process.stdout.write(`${outputPath}\n`)
