import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	parsePhase4PrivateReviewManifest,
	parsePhase4ReviewFeedbackStore,
} from "../src/album-artwork-palette-v2-phase-4-review.ts"

const experimentRoot = new URL("../data/experiments/album-artwork-palette-v2-0.7.1-development/", import.meta.url)

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex")
}

test("completed 0.7.1 review fails two predeclared clauses and binds its diagnosis", async () => {
	const [manifestValue, feedbackRaw, analysis, interpretations, postmortem] = await Promise.all([
		readFile(new URL("quality-guard-review-manifest.private.json", experimentRoot), "utf8").then(JSON.parse),
		readFile(new URL("../data/album-artwork-palette-v2-0.7.1-quality-guard-feedback.json", import.meta.url), "utf8"),
		readFile(new URL("quality-guard-review-analysis.json", experimentRoot), "utf8").then(JSON.parse),
		readFile(new URL("quality-guard-technical-interpretations.json", experimentRoot), "utf8").then(JSON.parse),
		readFile(new URL("../ALBUM_ARTWORK_UI_PALETTE_0_7_1_QUALITY_GUARD_POSTMORTEM.md", import.meta.url), "utf8"),
	])
	const manifest = parsePhase4PrivateReviewManifest(manifestValue)
	const feedback = parsePhase4ReviewFeedbackStore(JSON.parse(feedbackRaw), manifest)

	assert.equal(feedback.entries.length, 3)
	assert.deepEqual(analysis.freshReview.candidateQualityCounts, { strong: 2, unacceptable: 1 })
	assert.deepEqual(analysis.freshReview.baselineQualityCounts, { strong: 2, "weak-fallback": 1 })
	assert.deepEqual(analysis.freshReview.relativeCounts, { "baseline-stronger": 1, "similarly-valid": 2 })
	assert.equal(analysis.gate.everyFreshCandidateStrongOrAcceptable.pass, false)
	assert.equal(analysis.gate.everyFreshCandidateStrongOrAcceptable.candidatePositiveCount, 2)
	assert.equal(analysis.gate.everyFreshCandidateStrongOrAcceptable.required, 3)
	assert.equal(analysis.gate.noFreshBaselineStronger.pass, false)
	assert.equal(analysis.gate.noFreshBaselineStronger.baselineStronger, 1)
	assert.equal(analysis.gate.candidateIncompleteIdentityDoesNotExceedBaseline.pass, true)
	assert.equal(analysis.gate.transferredExactTreatmentRemainsPositive.pass, true)
	assert.equal(analysis.gate.noRepeatedNewSystemicFailureClass.pass, true)
	assert.equal(analysis.gatePass, false)
	assert.equal(analysis.disposition,
		"quality-guard-mechanics-passed-human-development-gate-failed-revise-comparison-domain")
	assert.ok(Object.values(analysis.authorization).every((authorized) => authorized === false))
	assert.equal(analysis.inputHashes.feedbackSha256, sha256(feedbackRaw))
	assert.deepEqual(
		analysis.freshReview.caseResults.map(({ comment }: { comment: string }) => comment),
		feedback.entries.map(({ comment }) => comment),
	)

	const mechanism = interpretations.entries.find(({ classes }: { classes: string[] }) =>
		classes.includes("identity-quality-guard-incomplete-comparison-domain"))
	assert.ok(mechanism)
	assert.deepEqual(mechanism.evidence.omittedResolvedLosses, [
		{ block: "fieldFidelity", incumbentEvidenceLevel: 25, challengerEvidenceLevel: 24 },
		{ block: "representativeness", incumbentEvidenceLevel: 19, challengerEvidenceLevel: 18 },
	])
	const reviewed = feedback.entries.find(({ caseId }) => caseId === mechanism.caseId)
	assert.ok(reviewed)
	assert.equal(mechanism.commentSha256, sha256(reviewed.comment))
	assert.deepEqual(interpretations.repeatedNewSystemicClasses, [])

	assert.match(postmortem, /immutable failed development artifact/)
	assert.match(postmortem, /failed-revise-comparison-domain/)
	assert.match(postmortem, /union of all existing ordinary Pareto and deterministic quality-ordering blocks/)
	assert.match(postmortem, /quality-boundary repair, not a claim that the current candidate domain can produce an ideal/)
	assert.match(postmortem, /Multi-Hue Field Structure/)
	assert.match(postmortem, /Role-Specific Identity Attribution/)
	assert.match(postmortem, /Joint Field And Role Availability/)
	assert.match(postmortem, /Do not open or select a directional sample/)
})
