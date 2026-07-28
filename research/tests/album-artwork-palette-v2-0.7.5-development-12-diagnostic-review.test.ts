import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
	ABSOLUTE_QUALITY_VALUES,
	BLINDED_RELATIVE_VALUES,
	BOUND_CASE,
	FEEDBACK_RELATIVE_PATH,
	FORBIDDEN_AUTHORIZATIONS,
	ISSUE_TAGS,
	RELATIVE_OUTCOME_VALUES,
	ROLES,
	alternativeSide,
	buildStoredReviewFeedback,
	canonicalJson,
	parsePrivateReviewManifest,
	parseReviewSubmission,
	publicReviewPayload,
	refuseExistingReviewArtifact,
	sha256,
	sideAssignmentDigest,
} from "../src/album-artwork-palette-v2-0.7.5-development-12-diagnostic-review.ts"
import { verifyDiagnosticReview } from "../verify-album-artwork-palette-v2-0.7.5-development-12-diagnostic-review.ts"

const manifestUrl = new URL(
	"../data/experiments/album-artwork-palette-v2-0.7.5-development-12-diagnostic-review/review-manifest.private.json",
	import.meta.url,
)
const feedbackUrl = new URL(`../../${FEEDBACK_RELATIVE_PATH}`, import.meta.url)

async function manifestFixture() {
	const raw = await readFile(manifestUrl)
	return { raw, manifest: parsePrivateReviewManifest(JSON.parse(raw.toString("utf8"))) }
}

test("manifest contains exactly the predeclared development-12 slate pair", async () => {
	const { manifest } = await manifestFixture()
	assert.equal(manifest.items.length, 1)
	assert.equal(manifest.scope.itemCount, 1)
	assert.deepEqual(manifest.scope.exactSourceCaseIds, [BOUND_CASE.caseId])
	const item = manifest.items[0]
	assert.equal(item.comparison.control.key, BOUND_CASE.controlKey)
	assert.equal(item.comparison.control.slateIndex, 0)
	assert.equal(item.comparison.control.reviewed, true)
	assert.equal(item.comparison.alternative.key, BOUND_CASE.alternativeKey)
	assert.equal(item.comparison.alternative.slateIndex, 1)
	assert.equal(item.comparison.alternative.reviewed, false)
	for (const palette of [item.options.A, item.options.B]) {
		assert.deepEqual(Object.keys(palette.roles), ROLES)
		for (const role of ROLES) {
			assert.match(palette.roles[role].hex, /^#[0-9a-f]{6}$/)
			assert.ok(palette.roles[role].nearestName.length > 0)
			assert.equal(typeof palette.roles[role].generated, "boolean")
		}
		assert.equal(typeof palette.gradient, "boolean")
		assert.equal(typeof palette.collapse.surface, "boolean")
		assert.equal(typeof palette.collapse.accent, "boolean")
	}
	assert.ok(FORBIDDEN_AUTHORIZATIONS.every((key) => manifest.authorization[key] === false))
})

test("side assignment is deterministic and the browser payload remains blinded", async () => {
	const { manifest } = await manifestFixture()
	const item = manifest.items[0]
	const digest = sideAssignmentDigest(BOUND_CASE.sourceSha256, BOUND_CASE.alternativeKey, BOUND_CASE.controlKey)
	const side = alternativeSide(BOUND_CASE.sourceSha256, BOUND_CASE.alternativeKey, BOUND_CASE.controlKey)
	assert.equal(item.assignment.digest, digest)
	assert.equal(item.assignment[side], "alternative")
	const payload = publicReviewPayload(manifest)
	const raw = canonicalJson(payload)
	assert.equal(payload.itemCount, 1)
	assert.equal(payload.items.length, 1)
	assert.doesNotMatch(raw, /candidate|baseline|control|alternative|development-12|slateIndex|reviewed/i)
	for (const privateValue of [
		item.source.file,
		item.source.sha256,
		item.source.artworkId,
		item.comparison.control.key,
		item.comparison.alternative.key,
	]) assert.ok(!raw.includes(privateValue))
})

test("one complete response is strict, maps its outcome, and preserves the comment verbatim", async () => {
	const { raw, manifest } = await manifestFixture()
	const item = manifest.items[0]
	const strongerSide = item.assignment.A === "alternative" ? "a-stronger" : "b-stronger"
	const fixture = {
		schemaVersion: 1,
		reviewId: manifest.contentId,
		responses: [{
			itemId: item.publicItemId,
			qualityA: ABSOLUTE_QUALITY_VALUES[0],
			qualityB: ABSOLUTE_QUALITY_VALUES[2],
			relative: strongerSide,
			issuesA: [ISSUE_TAGS[0]],
			issuesB: [ISSUE_TAGS[2]],
			comment: "  preserve\nverbatim  ",
		}],
	}
	const submission = parseReviewSubmission(fixture, manifest)
	const stored = buildStoredReviewFeedback(submission, manifest, sha256(raw), "2026-07-28T12:00:00.000Z")
	assert.equal(stored.responses[0].relativeOutcome, "candidate-stronger")
	assert.equal(stored.responses[0].comment, "  preserve\nverbatim  ")
	assert.ok(RELATIVE_OUTCOME_VALUES.includes(stored.responses[0].relativeOutcome))
	assert.deepEqual(BLINDED_RELATIVE_VALUES, [
		"a-stronger", "b-stronger", "similarly-valid", "neither-acceptable", "uncertain",
	])
	assert.throws(() => parseReviewSubmission({ ...fixture, extra: true }, manifest))
	assert.throws(() => parseReviewSubmission({ ...fixture, responses: [] }, manifest))
	assert.throws(() => parseReviewSubmission({
		...fixture,
		responses: [{ ...fixture.responses[0], qualityA: "good" }],
	}, manifest))
	assert.throws(() => parseReviewSubmission({
		...fixture,
		responses: [{ ...fixture.responses[0], issuesA: [ISSUE_TAGS[0], ISSUE_TAGS[0]] }],
	}, manifest))
})

test("focused verification passes, feedback is absent, and manifest overwrite is refused", async () => {
	const report = await verifyDiagnosticReview()
	assert.equal(report.ready, true)
	assert.equal(report.servedOrOpened, false)
	assert.equal(report.itemCount, 1)
	assert.equal(report.feedbackStatus, "not-submitted")
	await assert.rejects(readFile(feedbackUrl), (error: NodeJS.ErrnoException) => error.code === "ENOENT")
	await assert.rejects(refuseExistingReviewArtifact(fileURLToPath(manifestUrl)),
		/Refusing to overwrite existing review artifact/)
})
