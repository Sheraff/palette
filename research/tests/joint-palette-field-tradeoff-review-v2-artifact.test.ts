import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
	NEXT_PALETTE_REVIEW_PRESENTATION_VERSION,
	parseNextPaletteReviewFeedbackStore,
	parseNextPaletteReviewManifest,
} from "../src/next-palette-review-v2.ts"
import { parseNextPaletteReviewManifest as parseV1Manifest } from "../src/next-palette-review.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const experimentRoot = resolve(projectRoot,
	"research/data/experiments/joint-palette-field-tradeoff-0.1.1-development")
const reviewRoot = resolve(experimentRoot, "review-v2")

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

async function readJson<T>(root: string, file: string): Promise<T> {
	return JSON.parse(await readFile(resolve(root, file), "utf8")) as T
}

test("field tradeoff review v2 preserves the blinded cases under new provenance", async () => {
	const v1 = parseV1Manifest(await readJson(experimentRoot, "review-v1/batch-01-manifest.json"))
	const v2 = parseNextPaletteReviewManifest(await readJson(reviewRoot, "batch-01-manifest.json"))
	const feedback = parseNextPaletteReviewFeedbackStore(
		await readJson(reviewRoot, "batch-01-feedback.json"), v2,
	)
	const plan = await readJson<{
		presentationVersion: string
		experimentId: string
		scope: { freshBlindedComparisons: number; totalBatches: number; diagnosticOnly: boolean }
		manifestIds: string[]
	}>(reviewRoot, "plan.json")
	const authorization = await readJson<{
		experimentId: string
		presentationVersion: string
		boundArtifacts: Record<string, string>
		review: { authorized: boolean; diagnosticOnly: boolean; freshBlindedComparisons: number }
		prohibitions: { reserveAccessAuthorized: boolean; sourceRoots: string[] }
	}>(experimentRoot, "review-v2-authorization.json")
	const v1Authorization = await readJson<{ boundArtifacts: Record<string, string> }>(
		experimentRoot, "review-authorization.json",
	)

	assert.equal(v2.presentationVersion, NEXT_PALETTE_REVIEW_PRESENTATION_VERSION)
	assert.equal(v2.experimentId, v1.experimentId)
	assert.notEqual(v2.manifestId, v1.manifestId)
	assert.deepEqual(v2.entries, v1.entries)
	assert.equal(feedback.entries.length, 10)
	assert.equal(plan.presentationVersion, NEXT_PALETTE_REVIEW_PRESENTATION_VERSION)
	assert.equal(plan.experimentId, v2.experimentId)
	assert.deepEqual(plan.scope, { freshBlindedComparisons: 10, totalBatches: 1, diagnosticOnly: true })
	assert.deepEqual(plan.manifestIds, [v2.manifestId])
	assert.equal(authorization.experimentId, v2.experimentId)
	assert.equal(authorization.presentationVersion, NEXT_PALETTE_REVIEW_PRESENTATION_VERSION)
	assert.deepEqual(authorization.boundArtifacts, v1Authorization.boundArtifacts)
	assert.deepEqual(authorization.review, {
		authorized: true,
		diagnosticOnly: true,
		freshBlindedComparisons: 10,
	})
	assert.equal(authorization.prohibitions.reserveAccessAuthorized, false)
	assert.deepEqual(authorization.prohibitions.sourceRoots, ["images", "00"])
	assert.throws(() => parseNextPaletteReviewManifest({
		...v2,
		presentationVersion: "next-palette-review-presentation-1",
	}), /presentation version is invalid/)

	for (const [file, expected] of Object.entries(v2.provenance.experiment)) {
		assert.equal(sha256(await readFile(resolve(experimentRoot, file))), expected, file)
	}
	for (const [file, expected] of Object.entries({
		...v2.provenance.implementation,
		...v2.provenance.presentation,
	})) assert.equal(sha256(await readFile(resolve(projectRoot, file))), expected, file)
})

test("completed field tradeoff review has a provenance-bound stop disposition", async () => {
	const analysis = await readJson<{
		manifestId: string
		provenance: { manifestSha256: string; feedbackSha256: string; analyzerSha256: string }
		coverage: { expected: number; submitted: number; eligible: number; ineligible: number; complete: boolean }
		quality: { candidate: Record<string, number> }
		comparison: Record<string, number>
		entries: unknown[]
	}>(reviewRoot, "batch-01-analysis.json")
	const interpretation = await readJson<{
		reviewManifestId: string
		provenance: Record<string, string>
		policy: Record<string, boolean>
		summary: Record<string, unknown> & {
			objectiveSigns: Record<string, { improved: number; unchanged: number; sacrificed: number }>
		}
		entries: Array<{ selectedStrictlyDominatesCanonical: boolean; strictCanonicalDominatorsInFrontier: number }>
		successCriteria: Record<string, boolean>
		disposition: Record<string, boolean | string>
	}>(reviewRoot, "interpretation.json")
	const manifestBytes = await readFile(resolve(reviewRoot, "batch-01-manifest.json"))
	const feedbackBytes = await readFile(resolve(reviewRoot, "batch-01-feedback.json"))

	assert.equal(analysis.manifestId, interpretation.reviewManifestId)
	assert.deepEqual(analysis.coverage, { expected: 10, submitted: 10, eligible: 9, ineligible: 1, complete: true })
	assert.deepEqual(analysis.quality.candidate,
		{ unacceptable: 2, "weak-fallback": 4, "acceptable-not-ideal": 1, strong: 2 })
	assert.deepEqual(analysis.comparison,
		{ "baseline-stronger": 3, "both-similarly-valid": 2, "candidate-stronger": 4 })
	assert.equal(analysis.entries.length, 10)
	assert.equal(analysis.provenance.manifestSha256, sha256(manifestBytes))
	assert.equal(analysis.provenance.feedbackSha256, sha256(feedbackBytes))
	assert.equal(analysis.provenance.analyzerSha256,
		sha256(await readFile(resolve(projectRoot, "research/analyze-next-palette-review-v2.ts"))))

	assert.equal(interpretation.summary.reviewed, 10)
	assert.equal(interpretation.summary.eligible, 9)
	assert.equal(interpretation.summary.candidatePositive, 3)
	assert.equal(interpretation.summary.candidateWeakOrUnacceptable, 6)
	assert.equal(interpretation.summary.candidateStronger, 4)
	assert.equal(interpretation.summary.baselineStronger, 3)
	assert.equal(interpretation.summary.selectedStrictCanonicalDominators, 0)
	assert.equal(interpretation.summary.casesWithUnreviewedStrictCanonicalDominators, 3)
	assert.equal(interpretation.summary.unreviewedStrictCanonicalDominators, 9)
	assert.deepEqual(interpretation.summary.objectiveSigns["foreground-worst-field-apca-magnitude"],
		{ improved: 1, unchanged: 0, sacrificed: 8 })
	assert.deepEqual(interpretation.summary.objectiveSigns["accent-background-apca-magnitude"],
		{ improved: 9, unchanged: 0, sacrificed: 0 })
	assert.ok(interpretation.entries.every((entry) => !entry.selectedStrictlyDominatesCanonical))
	assert.equal(interpretation.entries.reduce((sum, entry) =>
		sum + entry.strictCanonicalDominatorsInFrontier, 0), 9)
	assert.equal(interpretation.policy.diagnosticOnly, true)
	assert.equal(interpretation.policy.commentsDoNotEnterInference, true)
	assert.equal(interpretation.policy.targetColorsInferred, false)
	assert.equal(interpretation.successCriteria.pass, false)
	assert.equal(interpretation.successCriteria.noWeakOrUnacceptableCandidateJudgments, false)
	assert.equal(interpretation.successCriteria.noBaselineStrongerJudgments, false)
	assert.equal(interpretation.disposition.candidate, "stop-current-tradeoff-selector-preserve-canonical-0.19")
	assert.equal(interpretation.disposition.extractionChangeAuthorized, false)
	assert.equal(interpretation.disposition.freezeAuthorized, false)
	assert.equal(interpretation.disposition.promotionAuthorized, false)
	assert.equal(interpretation.disposition.broaderReviewAuthorized, false)
	assert.equal(interpretation.disposition.reserveAccessAuthorized, false)

	for (const [file, expected] of Object.entries(interpretation.provenance)) {
		const path = file === "analyzerSha256"
			? resolve(projectRoot, "research/analyze-joint-palette-field-tradeoff-review-v2.ts")
			: resolve(reviewRoot, file)
		assert.equal(sha256(await readFile(path)), expected, file)
	}
})

test("review v2 embeds borderless artwork inside the palette treatment", async () => {
	const app = await readFile(resolve(projectRoot, "research/next-palette-review-v2/app.js"), "utf8")
	const css = await readFile(resolve(projectRoot, "research/next-palette-review-v2/styles.css"), "utf8")

	assert.match(app, /<div class="preview-main"><img class="preview-artwork"/)
	assert.doesNotMatch(app, /artwork-panel|artwork-column/)
	assert.match(css, /\.preview-main\s*\{[^}]*background:\s*var\(--path\)/s)
	assert.match(css, /\.preview-artwork\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*box-shadow:\s*none;/s)
})
