import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
	parseControlledFieldStateFeedbackStore,
	parseControlledFieldStateManifest,
} from "../src/controlled-field-state-review.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const reviewRoot = resolve(
	projectRoot,
	"research/data/experiments/controlled-field-state-supervision-0.1.0-development/review-v1",
)

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

test("stopped controlled review preserves partial evidence without authorizing factor fitting", async () => {
	const [manifestSource, feedbackSource, analysisSource, replacementPlan] = await Promise.all([
		readFile(resolve(reviewRoot, "batch-01-manifest.json")),
		readFile(resolve(reviewRoot, "batch-01-feedback.json")),
		readFile(resolve(reviewRoot, "batch-01-partial-stop-analysis.json")),
		readFile(resolve(projectRoot, "research/COMPLETE_PALETTE_ONLY_PLAN.md"), "utf8"),
	])
	const manifest = parseControlledFieldStateManifest(JSON.parse(manifestSource.toString("utf8")) as unknown)
	const feedback = parseControlledFieldStateFeedbackStore(JSON.parse(feedbackSource.toString("utf8")) as unknown, manifest)
	const analysis = JSON.parse(analysisSource.toString("utf8")) as {
		status: string
		provenance: { manifestSha256: string; feedbackSha256: string }
		coverage: Record<string, number | boolean>
		structuredEvidence: { tasks: Record<string, number>; preferences: Record<string, number>; commentCount: number }
		designFailure: Record<string, boolean>
		disposition: Record<string, string | boolean>
		policy: Record<string, boolean>
		entries: Array<{ caseId: string; note: string }>
	}

	assert.equal(feedback.entries.length, 10)
	assert.equal(analysis.status, "partial-user-stopped")
	assert.equal(analysis.provenance.manifestSha256, sha256(manifestSource))
	assert.equal(analysis.provenance.feedbackSha256, sha256(feedbackSource))
	assert.deepEqual(analysis.coverage, {
		batchExpected: 36,
		submitted: 10,
		batchUnsubmitted: 26,
		totalCases: 72,
		totalUnsubmitted: 62,
		eligible: 10,
		ineligible: 0,
		sourceGroups: 8,
		complete: false,
		batch02Opened: false,
	})
	assert.deepEqual(analysis.structuredEvidence.tasks, {
		"gradient-diagnostic": 1,
		multiplicity: 4,
		"ordered-pair": 5,
	})
	assert.deepEqual(analysis.structuredEvidence.preferences, {
		"b-stronger": 3,
		"a-stronger": 3,
		"either-way": 4,
	})
	assert.equal(analysis.structuredEvidence.commentCount, 10)
	assert.ok(Object.values(analysis.designFailure).every(Boolean))
	assert.equal(analysis.disposition.experiment, "development-rejected")
	assert.equal(analysis.disposition.openBatch02, false)
	assert.equal(analysis.disposition.fitPairModel, false)
	assert.equal(analysis.disposition.fitMultiplicityModel, false)
	assert.equal(analysis.disposition.replacementProtocol, "complete-palette-review")
	assert.equal(analysis.policy.structuredPreferencesNotReinterpreted, true)
	assert.equal(analysis.policy.commentsUsedAsLabels, false)
	assert.equal(analysis.policy.partialReviewUsedForFitting, false)
	assert.deepEqual(
		new Map(analysis.entries.map((entry) => [entry.caseId, entry.note])),
		new Map(feedback.entries.map((entry) => [entry.caseId, entry.note])),
	)
	assert.match(replacementPlan, /Complete palettes are the only valid human-review object/)
	assert.match(replacementPlan, /neither-acceptable/)
	assert.match(replacementPlan, /Do not fit role-specific or gradient-specific models/)
	assert.match(replacementPlan, /does not authorize candidate fitting, reserve access, review generation, promotion/)
})
