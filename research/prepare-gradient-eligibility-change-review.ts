import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { writeJsonAtomic } from "./src/candidate-output.ts"
import {
	decideGradientEligibility,
	GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	GRADIENT_ELIGIBILITY_THRESHOLDS,
	type GradientEligibilityEvidence,
} from "./src/gradient-eligibility.ts"
import type { CorpusResult, Palette } from "./src/types.ts"

type MusicEntry = {
	familyId: string
	anchor: { file: string }
	palette: Palette
	evidence: GradientEligibilityEvidence
}
type MusicDevelopment = { entries: MusicEntry[] }
type ValidationEntry = {
	cohort: "development" | "holdout"
	file: string
	baselineGradient: boolean
	evidence: GradientEligibilityEvidence | null
}
type Validation = { entries: ValidationEntry[] }
type ExistingFeedback = { entries: Array<{ familyId: string }> }
type ReviewEntry = {
	familyId: string
	anchor: { file: string }
	cohort: "music" | "holdout"
	selectionTrack: "strong" | "borderline" | "representative" | "holdout"
	palette: Palette
	evidence: GradientEligibilityEvidence
	reason: "insufficient-spatial-continuity" | "flat-background-isolated-surface" |
		"insufficient-progressive-field-support" | "unsupported-disconnected-color-path" |
		"fragmented-connected-color-path" | "separate-border-connected-flat-fields"
}

const reviewLimit = 50
const [musicArgument, holdoutArgument, validationArgument, feedbackArgument, outputArgument] = process.argv.slice(2)
if (!musicArgument || !holdoutArgument || !validationArgument || !feedbackArgument || !outputArgument) {
	throw new Error("Usage: prepare-gradient-eligibility-change-review.ts <music-development.json> <holdout-results.json> <validation.json> <existing-feedback.json> <output.json>")
}

function stableHash(value: string): string {
	return createHash("sha256").update(value).digest("hex")
}

function intermediateShare(evidence: GradientEligibilityEvidence): number {
	return evidence.colorPathCoverage === 0 ? 0 : evidence.intermediateCoverage / evidence.colorPathCoverage
}

function rejectionStrength(entry: ReviewEntry): number {
	const evidence = entry.evidence
	if (entry.reason === "flat-background-isolated-surface") {
		const ordering = Math.max(evidence.connectedField.directionalOrdering, evidence.colorPathDirectionalOrdering)
		return Math.min(
			evidence.flatBackgroundIsolatedSurfaceRisk /
				GRADIENT_ELIGIBILITY_THRESHOLDS.maximumFlatBackgroundIsolatedSurfaceRisk,
			GRADIENT_ELIGIBILITY_THRESHOLDS.maximumEndpointDominatedIntermediatePathShare /
				Math.max(intermediateShare(evidence), 1e-9),
			GRADIENT_ELIGIBILITY_THRESHOLDS.maximumFlatRiskDirectionalOrdering / Math.max(ordering, 1e-9),
		) - 1
	}
	if (entry.reason === "insufficient-progressive-field-support") {
		return Math.min(
			GRADIENT_ELIGIBILITY_THRESHOLDS.maximumSparseIntermediateCoverage /
				Math.max(evidence.intermediateCoverage, 1e-9),
			evidence.background.borderCoverage /
				GRADIENT_ELIGIBILITY_THRESHOLDS.minimumBorderBackgroundCoverage,
			evidence.background.coverage /
				GRADIENT_ELIGIBILITY_THRESHOLDS.minimumSparseFieldBackgroundCoverage,
		) - 1
	}
	if (entry.reason === "unsupported-disconnected-color-path") {
		return Math.min(
			GRADIENT_ELIGIBILITY_THRESHOLDS.maximumUnsupportedEndpointDistance /
				Math.max(evidence.endpointDistance, 1e-9),
			GRADIENT_ELIGIBILITY_THRESHOLDS.maximumUnsupportedColorPathCoverage /
				Math.max(evidence.colorPathCoverage, 1e-9),
			GRADIENT_ELIGIBILITY_THRESHOLDS.maximumUnsupportedPairCoherence /
				Math.max(evidence.pairSpecific.coherence, 1e-9),
		) - 1
	}
	if (entry.reason === "fragmented-connected-color-path") {
		return Math.min(
			evidence.connectedField.coverage /
				GRADIENT_ELIGIBILITY_THRESHOLDS.minimumFragmentedConnectedCoverage,
			GRADIENT_ELIGIBILITY_THRESHOLDS.maximumFragmentedConnectedShare /
				Math.max(evidence.connectedField.shareOfColorPath, 1e-9),
		) - 1
	}
	if (entry.reason === "separate-border-connected-flat-fields") {
		return Math.min(
			evidence.background.borderCoverage / GRADIENT_ELIGIBILITY_THRESHOLDS.minimumDualBorderCoverage,
			evidence.surface.borderCoverage / GRADIENT_ELIGIBILITY_THRESHOLDS.minimumDualBorderCoverage,
			GRADIENT_ELIGIBILITY_THRESHOLDS.maximumDualBorderIntermediatePathShare /
				Math.max(intermediateShare(evidence), 1e-9),
		) - 1
	}
	const connected = Math.min(
		evidence.connectedField.continuity / GRADIENT_ELIGIBILITY_THRESHOLDS.minimumConnectedFieldContinuity,
		evidence.connectedField.shareOfColorPath / GRADIENT_ELIGIBILITY_THRESHOLDS.minimumConnectedFieldShare,
	)
	const ordered = Math.min(
		evidence.colorPathContinuity / GRADIENT_ELIGIBILITY_THRESHOLDS.minimumOrderedPathContinuity,
		intermediateShare(evidence) / GRADIENT_ELIGIBILITY_THRESHOLDS.minimumIntermediatePathShare,
		evidence.colorPathDirectionalOrdering /
			GRADIENT_ELIGIBILITY_THRESHOLDS.minimumColorPathDirectionalOrdering,
	)
	return 1 - Math.max(connected, ordered)
}

function selectStratified(entries: ReviewEntry[], count: number, seed: string): ReviewEntry[] {
	const selected = new Map<string, ReviewEntry>()
	const perTrack = Math.floor(count / 3)
	const take = (values: ReviewEntry[], limit: number, track: ReviewEntry["selectionTrack"]): void => {
		let added = 0
		for (const entry of values) {
			if (selected.has(entry.familyId)) continue
			selected.set(entry.familyId, { ...entry, selectionTrack: track })
			if (++added === limit) break
		}
	}
	take([...entries].sort((first, second) => rejectionStrength(second) - rejectionStrength(first) ||
		first.familyId.localeCompare(second.familyId, "en")), perTrack, "strong")
	take([...entries].sort((first, second) => rejectionStrength(first) - rejectionStrength(second) ||
		first.familyId.localeCompare(second.familyId, "en")), perTrack, "borderline")
	take([...entries].sort((first, second) => stableHash(`${seed}/${first.familyId}`).localeCompare(
		stableHash(`${seed}/${second.familyId}`))), count - selected.size, "representative")
	return [...selected.values()]
}

const [musicSource, holdoutSource, validationSource, feedbackSource] = await Promise.all([
	readFile(resolve(musicArgument), "utf8"),
	readFile(resolve(holdoutArgument), "utf8"),
	readFile(resolve(validationArgument), "utf8"),
	readFile(resolve(feedbackArgument), "utf8"),
])
const music = JSON.parse(musicSource) as MusicDevelopment
const holdout = JSON.parse(holdoutSource) as CorpusResult
const validation = JSON.parse(validationSource) as Validation
const feedback = JSON.parse(feedbackSource) as ExistingFeedback
const previouslyReviewed = new Set(feedback.entries.map((entry) => entry.familyId))
const allMusicChanged = music.entries.flatMap((entry): ReviewEntry[] => {
	const decision = decideGradientEligibility(entry.evidence)
	if (decision.eligible || decision.reason === "eligible") return []
	return [{
		familyId: entry.familyId,
		anchor: entry.anchor,
		cohort: "music",
		selectionTrack: "representative",
		palette: entry.palette,
		evidence: entry.evidence,
		reason: decision.reason,
	}]
})
const musicChanged = allMusicChanged.filter((entry) => !previouslyReviewed.has(entry.familyId))
const previouslyReviewedMusicChanges = allMusicChanged.length - musicChanged.length
const holdoutPalette = new Map(holdout.entries.map((entry) => [entry.file, entry.extraction.methods.spatial]))
const holdoutChanged = validation.entries.flatMap((entry): ReviewEntry[] => {
	if (entry.cohort !== "holdout" || !entry.baselineGradient || !entry.evidence) return []
	const decision = decideGradientEligibility(entry.evidence)
	if (decision.eligible || decision.reason === "eligible") return []
	const palette = holdoutPalette.get(entry.file)
	if (!palette) throw new Error(`Holdout palette is unavailable for ${entry.file}`)
	return [{
		familyId: `holdout-${entry.file.replace(/^00\//, "").replace(/\.[^.]+$/, "")}`,
		anchor: { file: entry.file },
		cohort: "holdout",
		selectionTrack: "holdout",
		palette,
		evidence: entry.evidence,
		reason: decision.reason,
	}]
})
const musicTarget = reviewLimit - holdoutChanged.length
const reasons = ["insufficient-spatial-continuity", "flat-background-isolated-surface",
	"insufficient-progressive-field-support", "unsupported-disconnected-color-path",
	"fragmented-connected-color-path", "separate-border-connected-flat-fields"] as const
const selectedMusic = reasons.flatMap((reason) => selectStratified(
	musicChanged.filter((entry) => entry.reason === reason),
	Math.floor(musicTarget / reasons.length),
	`gradient-change-review/${reason}`,
))
const selectedIds = new Set(selectedMusic.map((entry) => entry.familyId))
if (selectedMusic.length < musicTarget) {
	selectedMusic.push(...selectStratified(
		musicChanged.filter((entry) => !selectedIds.has(entry.familyId)),
		musicTarget - selectedMusic.length,
		"gradient-change-review/remainder",
	))
}
const entries = [...selectedMusic, ...holdoutChanged]
	.sort((first, second) => stableHash(`gradient-change-review/order/${first.familyId}`).localeCompare(
		stableHash(`gradient-change-review/order/${second.familyId}`)))
if (entries.length !== Math.min(reviewLimit, musicChanged.length + holdoutChanged.length)) {
	throw new Error(`Expected ${reviewLimit} changed review cases, selected ${entries.length}`)
}
await writeJsonAtomic({ path: resolve(outputArgument), refuseOverwrite: true }, {
	schemaVersion: 1,
	reviewVersion: "gradient-eligibility-change-review-0.1.0",
	experimentVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	generatedAt: new Date().toISOString(),
	summary: {
		baselineFlatToCandidateGradient: 0,
		totalBaselineGradientToCandidateFlat: allMusicChanged.length + holdoutChanged.length,
		unreviewedBaselineGradientToCandidateFlat: musicChanged.length + holdoutChanged.length,
		musicChanges: musicChanged.length,
		holdoutChanges: holdoutChanged.length,
		previouslyReviewedMusicChangesExcluded: previouslyReviewedMusicChanges,
		reviewCases: entries.length,
	},
	entries,
})
process.stderr.write(`Prepared ${entries.length} of ${musicChanged.length + holdoutChanged.length} unreviewed gradient removals\n`)
