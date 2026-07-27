import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))
const experimentRoot = join(
	projectRoot,
	"research/data/experiments/typography-chromatic-apca-0.1.0-poc.1-development",
)

function sha256(value: Uint8Array | string): string {
	return createHash("sha256").update(value).digest("hex")
}

test("checked-in typography APCA POC is provenance-bound and review-ready", async () => {
	const evaluationBytes = await readFile(join(experimentRoot, "evaluation.json"))
	const evaluation = JSON.parse(evaluationBytes.toString("utf8")) as {
		experimentVersion: string
		bindings: {
			inputs: Record<string, { file: string; sha256: string }>
			implementation: Record<string, string>
		}
		profile: Record<string, unknown>
		counts: Record<string, number>
		stopConditions: Record<string, boolean>
		decision: string
		target: {
			file: string
			typographyChangedRoles: string[]
			typography: { emittedSupplementIds: number[] }
			palette: { roles: Record<string, string>; distinctColorCount: number }
		}
		reviewEntries: Array<{
			reviewClass: string
			typographyChangedRoles: string[]
			typographyGradientChanged: boolean
			typography: { emittedSupplementIds: number[] }
			palette: { distinctColorCount: number; apca: { accentBackgroundLc: number; accentSurfaceLc: number } }
		}>
		rejectedEntries: Array<{ typography: { emittedSupplementIds: number[]; rejectionReasons: string[] } }>
	}
	const analysis = JSON.parse(await readFile(join(experimentRoot, "analysis.json"), "utf8")) as {
		bindings: { evaluationSha256: string; feedbackSha256: string }
		review: { status: string; reviewed: number; worseThanBaseline: number; unjudgeable: number; pending: number }
		decision: {
			status: string
			canonicalAlgorithmChangeAuthorized: boolean
			configuredTreatmentPromotionAuthorized: boolean
		}
	}
	const feedbackBytes = await readFile(join(experimentRoot, "feedback.json"))

	assert.equal(evaluation.experimentVersion, "region-typography-chromatic-apca-0.1.0-poc.1")
	assert.deepEqual(evaluation.profile, {
		algorithm: "apca-w3-0.1.9",
		backgroundMinimumLc: 10,
		surfaceMinimumLc: 10,
	})
	assert.deepEqual(evaluation.counts, {
		entries: 392,
		developmentEntries: 37,
		canonical00Entries: 355,
		available: 7,
		selected: 7,
		emitted: 6,
		rejectedAfterJointSelection: 1,
		acceptedAvailable: 1,
		acceptedEmitted: 1,
	})
	assert.equal(Object.values(evaluation.stopConditions).some(Boolean), false)
	assert.equal(evaluation.decision, "prepare-complete-palette-review")
	assert.equal(evaluation.target.file, "00/ab67616d0000b2730000c4e4d278f49bbc995440.jpg")
	assert.deepEqual(evaluation.target.typographyChangedRoles, ["accent"])
	assert.equal(evaluation.target.typography.emittedSupplementIds.length, 1)
	assert.equal(evaluation.target.palette.roles.accent, "#e3bbbb")
	assert.equal(evaluation.target.palette.distinctColorCount, 3)
	assert.equal(evaluation.reviewEntries.length, 6)
	assert.equal(evaluation.reviewEntries.filter((entry) => entry.reviewClass === "accepted").length, 1)
	for (const entry of evaluation.reviewEntries) {
		assert.deepEqual(entry.typographyChangedRoles, ["accent"])
		assert.equal(entry.typographyGradientChanged, false)
		assert.equal(entry.typography.emittedSupplementIds.length, 1)
		assert.ok(Math.abs(entry.palette.apca.accentBackgroundLc) >= 10)
		assert.ok(Math.abs(entry.palette.apca.accentSurfaceLc) >= 10)
		assert.ok(entry.palette.distinctColorCount <= 4)
	}
	assert.equal(evaluation.rejectedEntries.length, 1)
	assert.deepEqual(evaluation.rejectedEntries[0].typography.emittedSupplementIds, [])
	assert.deepEqual(evaluation.rejectedEntries[0].typography.rejectionReasons, ["non-accent-role-change"])
	for (const input of Object.values(evaluation.bindings.inputs)) {
		assert.equal(sha256(await readFile(join(projectRoot, input.file))), input.sha256)
	}
	for (const [file, expected] of Object.entries(evaluation.bindings.implementation)) {
		assert.equal(sha256(await readFile(join(projectRoot, file))), expected)
	}
	assert.equal(analysis.bindings.evaluationSha256, sha256(evaluationBytes))
	assert.equal(analysis.bindings.feedbackSha256, sha256(feedbackBytes))
	assert.equal(analysis.review.status, "partial")
	assert.equal(analysis.review.reviewed, 3)
	assert.equal(analysis.review.worseThanBaseline, 2)
	assert.equal(analysis.review.unjudgeable, 1)
	assert.equal(analysis.review.pending, 3)
	assert.equal(analysis.decision.status, "stop-global-treatment-promotion-review-incomplete")
	assert.equal(analysis.decision.canonicalAlgorithmChangeAuthorized, false)
	assert.equal(analysis.decision.configuredTreatmentPromotionAuthorized, false)
})
