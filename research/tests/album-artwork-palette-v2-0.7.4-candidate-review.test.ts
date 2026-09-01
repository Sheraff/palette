import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import test from "node:test"
import {
	ABSOLUTE_QUALITY_VALUES,
	BOUND_REVIEW_CASES,
	ISSUE_TAGS,
	RELATIVE_VALUES,
	buildStoredReviewFeedback,
	candidateSide,
	canonicalJson,
	parsePrivateReviewManifest,
	parseReviewSubmission,
	parseStoredReviewFeedback,
	publicReviewPayload,
	sha256,
	sideAssignmentDigest,
} from "../src/album-artwork-palette-v2-0.7.4-candidate-review.ts"
import { verifyCandidateReview } from "../verify-album-artwork-palette-v2-0.7.4-candidate-review.ts"

const manifestUrl = new URL(
	"../data/experiments/album-artwork-palette-v2-0.7.4-candidate-review/review-manifest.private.json",
	import.meta.url,
)

async function manifestFixture() {
	const raw = await readFile(manifestUrl)
	return { raw, manifest: parsePrivateReviewManifest(JSON.parse(raw.toString("utf8"))) }
}

function completeSubmission(manifest: Awaited<ReturnType<typeof manifestFixture>>["manifest"]) {
	return {
		schemaVersion: 1,
		reviewId: manifest.contentId,
		responses: manifest.items.map((item, index) => ({
			itemId: item.publicItemId,
			qualityA: ABSOLUTE_QUALITY_VALUES[index],
			qualityB: "acceptable",
			relative: RELATIVE_VALUES[index],
			issuesA: index === 0 ? [ISSUE_TAGS[0]] : [],
			issuesB: [],
			comment: index === 0 ? "  preserve\nexactly  " : "",
		})),
	}
}

test("bounded review manifest contains exactly the two protocol-bound winner pairs", async () => {
	const { manifest } = await manifestFixture()
	assert.equal(manifest.items.length, 2)
	assert.deepEqual(manifest.items.map(({ internalCaseId }) => internalCaseId), ["development-18", "development-21"])
	for (const [index, bound] of BOUND_REVIEW_CASES.entries()) {
		const item = manifest.items[index]
		assert.equal(item.comparison.control.key, bound.controlKey)
		assert.equal(item.comparison.candidate.key, bound.candidateKey)
		assert.equal(item.assignment.digest,
			sideAssignmentDigest(bound.sourceSha256, bound.candidateKey, bound.controlKey))
		assert.equal(item.assignment[candidateSide(bound.sourceSha256, bound.candidateKey, bound.controlKey)], "candidate")
	}
	assert.equal(new Set(manifest.items.map(({ assignment }) => assignment.digest)).size, 2)
	assert.ok(Object.entries(manifest.authorization)
		.filter(([key]) => !["boundedDevelopmentReview", "reviewPreparation", "localServing", "oneBoundSubmission"].includes(key))
		.every(([, value]) => value === false))
})

test("browser payload is opaque and contains no source or assignment provenance", async () => {
	const { manifest } = await manifestFixture()
	const payload = publicReviewPayload(manifest)
	const raw = canonicalJson(payload)
	assert.deepEqual(Object.keys(payload).sort(), [
		"colorNamesPresentationOnly", "itemCount", "items", "reviewId", "schemaVersion",
	].sort())
	assert.doesNotMatch(raw, /candidate|control|baseline|development-18|development-21|0\.7\.[24]/i)
	for (const item of manifest.items) {
		assert.ok(!raw.includes(item.source.file))
		assert.ok(!raw.includes(item.source.sha256))
		assert.ok(!raw.includes(item.comparison.candidate.key))
		assert.ok(!raw.includes(item.comparison.control.key))
	}
})

test("one complete submission is strict and preserves comments verbatim", async () => {
	const { raw, manifest } = await manifestFixture()
	const fixture = completeSubmission(manifest)
	const submission = parseReviewSubmission(fixture, manifest)
	assert.equal(submission.responses[0].comment, "  preserve\nexactly  ")
	assert.throws(() => parseReviewSubmission({ ...fixture, extra: true }, manifest))
	assert.throws(() => parseReviewSubmission({ ...fixture, responses: fixture.responses.slice(0, 1) }, manifest))
	assert.throws(() => parseReviewSubmission({
		...fixture,
		responses: fixture.responses.map((entry, index) => index === 0 ? { ...entry, issuesA: [ISSUE_TAGS[0], ISSUE_TAGS[0]] } : entry),
	}, manifest))
	assert.throws(() => parseReviewSubmission({
		...fixture,
		responses: fixture.responses.map((entry, index) => index === 0 ? { ...entry, qualityA: "good" } : entry),
	}, manifest))
	const stored = buildStoredReviewFeedback(submission, sha256(raw), "2026-07-28T12:00:00.000Z")
	assert.equal(parseStoredReviewFeedback(stored, manifest).responses[0].comment, "  preserve\nexactly  ")
})

test("review implementation verifies and preparation refuses overwrite", async () => {
	const before = await readFile(manifestUrl)
	const report = await verifyCandidateReview()
	assert.equal(report.itemCount, 2)
	assert.equal(report.protectedOverlap, false)
	assert.equal(report.protectedArtworkFilesAccessed, 0)
	assert.equal(report.identicalRendererForAllSides, true)
	const result = await new Promise<{ code: number | null; stderr: string }>((resolveResult) => {
		const child = spawn(process.execPath, [
			"--experimental-strip-types",
			"research/prepare-album-artwork-palette-v2-0.7.4-candidate-review.ts",
		], { cwd: new URL("../../", import.meta.url), env: { ...process.env, NODE_NO_WARNINGS: "1" } })
		let stderr = ""
		child.stderr.on("data", (chunk) => { stderr += chunk.toString() })
		child.on("close", (code) => resolveResult({ code, stderr }))
	})
	assert.notEqual(result.code, 0)
	assert.match(result.stderr, /Refusing to overwrite existing review artifact/)
	assert.deepEqual(await readFile(manifestUrl), before)
})
