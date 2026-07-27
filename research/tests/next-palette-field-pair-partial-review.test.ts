import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
	parseNextPaletteReviewFeedbackStore,
	parseNextPaletteReviewManifest,
} from "../src/next-palette-review.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const reviewRoot = resolve(
	projectRoot,
	"research/data/experiments/next-palette-0.2.0-field-pair-development/review-v1",
)

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

test("stopped field-pair review preserves every submitted judgment and comment", async () => {
	const [manifestSource, feedbackSource, analysisSource, diagnosticsSource, interpretationSource] = await Promise.all([
		readFile(resolve(reviewRoot, "batch-01-manifest.json")),
		readFile(resolve(reviewRoot, "batch-01-feedback.json")),
		readFile(resolve(reviewRoot, "batch-01-partial-analysis.json")),
		readFile(resolve(reviewRoot, "comment-case-diagnostics-partial-batch-01.json")),
		readFile(resolve(reviewRoot, "comment-interpretation-partial-batch-01.json")),
	])
	const manifest = parseNextPaletteReviewManifest(JSON.parse(manifestSource.toString("utf8")) as unknown)
	const feedback = parseNextPaletteReviewFeedbackStore(JSON.parse(feedbackSource.toString("utf8")) as unknown, manifest)
	const analysis = JSON.parse(analysisSource.toString("utf8")) as {
		status: string
		provenance: { manifestSha256: string; feedbackSha256: string }
		coverage: { expected: number; submitted: number; unsubmitted: number; complete: boolean; batch02Opened: boolean }
		quality: {
			candidate: { positive: number; negative: number }
			paired: Record<string, number>
		}
		comparison: Record<string, number>
		comments: { count: number }
		exactTransfers: { eligible: number; candidateQuality: { positive: number; negative: number } }
		knownCandidateEvidence: { eligible: number; quality: { positive: number; negative: number }; unreviewedNovelCases: number }
		disposition: { candidate: string; requestMoreHumanReview: boolean; openBatch02: boolean }
		entries: Array<{ caseId: string; note: string }>
	}
	const diagnostics = JSON.parse(diagnosticsSource.toString("utf8")) as {
		provenance: { manifestSha256: string; feedbackSha256: string; partialAnalysisSha256: string }
		entries: Array<{ caseId: string; note: string }>
	}
	const interpretation = JSON.parse(interpretationSource.toString("utf8")) as {
		provenance: Record<string, string>
		coverage: { submittedCases: number; commentedCases: number; commentsInterpreted: number }
		comments: Array<{ file: string; note: string; technicalInterpretation: string }>
		disposition: { decision: string; requestMoreReview: boolean; openBatch02: boolean }
		nextArchitectureRequirements: string[]
	}

	assert.equal(manifest.entries.length, 27)
	assert.equal(feedback.entries.length, 24)
	assert.equal(analysis.status, "partial-user-stopped")
	assert.deepEqual(analysis.coverage, {
		expected: 27,
		submitted: 24,
		unsubmitted: 3,
		eligible: 24,
		ineligible: 0,
		complete: false,
		batch02Opened: false,
	})
	assert.equal(analysis.provenance.manifestSha256, sha256(manifestSource))
	assert.equal(analysis.provenance.feedbackSha256, sha256(feedbackSource))
	assert.deepEqual(analysis.quality.candidate, {
		counts: { "weak-fallback": 5, strong: 11, "acceptable-not-ideal": 8 },
		positive: 19,
		negative: 5,
		uncertain: 0,
	})
	assert.deepEqual(analysis.quality.paired, {
		"both-negative": 5,
		"candidate-positive-baseline-negative": 5,
		"both-positive": 14,
	})
	assert.deepEqual(analysis.comparison, {
		"candidate-stronger": 12,
		"both-similarly-valid": 9,
		"baseline-stronger": 3,
	})
	assert.equal(analysis.comments.count, 9)
	assert.equal(analysis.exactTransfers.eligible, 26)
	assert.equal(analysis.exactTransfers.candidateQuality.positive, 14)
	assert.equal(analysis.exactTransfers.candidateQuality.negative, 12)
	assert.equal(analysis.knownCandidateEvidence.eligible, 50)
	assert.equal(analysis.knownCandidateEvidence.quality.positive, 33)
	assert.equal(analysis.knownCandidateEvidence.quality.negative, 17)
	assert.equal(analysis.knownCandidateEvidence.unreviewedNovelCases, 29)
	assert.equal(analysis.disposition.candidate, "development-rejected")
	assert.equal(analysis.disposition.requestMoreHumanReview, false)
	assert.equal(analysis.disposition.openBatch02, false)
	assert.equal(new Set(analysis.entries.map((entry) => entry.caseId)).size, 24)

	const submittedComments = analysis.entries.filter((entry) => entry.note.length > 0)
	assert.equal(submittedComments.length, 9)
	assert.equal(diagnostics.entries.length, 9)
	assert.equal(interpretation.comments.length, 9)
	assert.deepEqual(interpretation.coverage, { submittedCases: 24, commentedCases: 9, commentsInterpreted: 9 })
	assert.equal(diagnostics.provenance.manifestSha256, sha256(manifestSource))
	assert.equal(diagnostics.provenance.feedbackSha256, sha256(feedbackSource))
	assert.equal(diagnostics.provenance.partialAnalysisSha256, sha256(analysisSource))
	assert.equal(interpretation.provenance["batch-01-feedback.json"], sha256(feedbackSource))
	assert.equal(interpretation.provenance["batch-01-partial-analysis.json"], sha256(analysisSource))
	assert.equal(interpretation.provenance["comment-case-diagnostics-partial-batch-01.json"], sha256(diagnosticsSource))
	assert.deepEqual(
		new Map(interpretation.comments.map((entry) => [entry.file, entry.note])),
		new Map(diagnostics.entries.map((entry) => {
			const source = manifest.entries.find((candidate) => candidate.caseId === entry.caseId)!
			return [source.source.file, entry.note]
		})),
	)
	assert.ok(interpretation.comments.every((entry) => entry.technicalInterpretation.length > 0))
	assert.equal(interpretation.disposition.decision, "development-rejected")
	assert.equal(interpretation.disposition.requestMoreReview, false)
	assert.equal(interpretation.disposition.openBatch02, false)
	assert.ok(interpretation.nextArchitectureRequirements.length >= 5)
})
