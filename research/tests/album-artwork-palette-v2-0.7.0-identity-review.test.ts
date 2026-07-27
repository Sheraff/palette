import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_7_0_IDENTITY_REVIEW_VERSION,
	parsePhase4PrivateReviewManifest,
} from "../src/album-artwork-palette-v2-phase-4-review.ts"

const currentRoot = new URL("../data/experiments/album-artwork-palette-v2-0.7.0-development/", import.meta.url)
const predecessorRoot = new URL("../data/experiments/album-artwork-palette-v2-0.6.0-development/", import.meta.url)
const roles = ["background", "surface", "foreground", "accent"] as const

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex")
}

test("0.7.0 identity-obligation review is a balanced exact-winner development delta", async () => {
	const [manifestValue, preparation, currentSummary, predecessorSummary, protocol, app] = await Promise.all([
		readFile(new URL("identity-obligation-review-manifest.private.json", currentRoot), "utf8").then(JSON.parse),
		readFile(new URL("identity-obligation-review-preparation.json", currentRoot), "utf8").then(JSON.parse),
		readFile(new URL("summary.json", currentRoot), "utf8").then(JSON.parse),
		readFile(new URL("summary.json", predecessorRoot), "utf8").then(JSON.parse),
		readFile(new URL("../ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_7_0_IDENTITY_REVIEW.md", import.meta.url), "utf8"),
		readFile(new URL("../album-artwork-palette-v2-phase-4-review/app.js", import.meta.url), "utf8"),
	])
	const manifest = parsePhase4PrivateReviewManifest(manifestValue)
	assert.equal(manifest.reviewVersion, ALBUM_ARTWORK_PALETTE_V2_0_7_0_IDENTITY_REVIEW_VERSION)
	assert.equal(manifest.cases.length, 12)
	assert.equal(manifest.cases.filter(({ assignment }) => assignment.A === "candidate").length, 6)
	assert.equal(manifest.cases.filter(({ assignment }) => assignment.B === "candidate").length, 6)
	assert.equal(preparation.manifestId, manifest.manifestId)
	assert.equal(preparation.candidateVersion, "album-artwork-first-principles-0.7.0")
	assert.equal(preparation.predecessorVersion, "album-artwork-first-principles-0.6.0")
	assert.equal(preparation.implementationHash, currentSummary.implementationHash)
	assert.equal(preparation.predecessorImplementationHash, predecessorSummary.implementationHash)
	assert.deepEqual(preparation.selectedCohorts, { stress: 8, dataset: 4 })
	assert.equal(preparation.changedWinnerCount, 17)
	assert.match(protocol, /fixed 28-source authorized development panel/)
	assert.match(protocol, /does not authorize a future sample/i)
	assert.doesNotMatch(app, /Option [AB][^\n]*(?:candidate|baseline)/i)

	const cohorts = { stress: 0, dataset: 0 }
	for (const reviewCase of manifest.cases) {
		const [current, predecessor] = await Promise.all([
			readFile(new URL(`sources/${reviewCase.caseId}.json`, currentRoot), "utf8").then(JSON.parse),
			readFile(new URL(`sources/${reviewCase.caseId}.json`, predecessorRoot), "utf8").then(JSON.parse),
		])
		assert.equal(current.source.sha256, reviewCase.source.sha256)
		assert.equal(predecessor.source.sha256, reviewCase.source.sha256)
		cohorts[current.source.cohort as keyof typeof cohorts] += 1
		const candidateSide = reviewCase.assignment.A === "candidate" ? "A" : "B"
		const baselineSide = candidateSide === "A" ? "B" : "A"
		for (const role of roles) {
			assert.equal(reviewCase.options[candidateSide].roles[role].hex, current.extraction.winner[role].hex)
			assert.equal(reviewCase.options[baselineSide].roles[role].hex, predecessor.extraction.winner[role].hex)
		}
		assert.equal(reviewCase.options[candidateSide].gradient, current.extraction.winner.gradient)
		assert.equal(reviewCase.options[baselineSide].gradient, predecessor.extraction.winner.gradient)
		assert.notDeepEqual(reviewCase.options[candidateSide], reviewCase.options[baselineSide])
	}
	assert.deepEqual(cohorts, { stress: 8, dataset: 4 })
})

test("completed 0.7.0 review fails all four predeclared human gates with comment-bound interpretations", async () => {
	const [analysis, interpretations, feedbackRaw] = await Promise.all([
		readFile(new URL("identity-obligation-review-analysis.json", currentRoot), "utf8").then(JSON.parse),
		readFile(new URL("identity-obligation-technical-interpretations.json", currentRoot), "utf8").then(JSON.parse),
		readFile(new URL("../data/album-artwork-palette-v2-0.7.0-identity-obligation-feedback.json", import.meta.url), "utf8"),
	])
	const feedback = JSON.parse(feedbackRaw)
	assert.equal(analysis.reviewedCaseCount, 12)
	assert.deepEqual(analysis.candidateQualityCounts, {
		acceptable: 6,
		strong: 2,
		unacceptable: 2,
		"weak-fallback": 2,
	})
	assert.deepEqual(analysis.relativeCounts, {
		"candidate-stronger": 1,
		"neither-acceptable": 1,
		"predecessor-stronger": 5,
		"similarly-valid": 5,
	})
	assert.equal(analysis.gate.absoluteQuality.pass, false)
	assert.equal(analysis.gate.absoluteQuality.candidatePositiveCount, 8)
	assert.equal(analysis.gate.relativeImprovement.pass, false)
	assert.equal(analysis.gate.incompleteIdentityReduction.pass, false)
	assert.equal(analysis.gate.noRepeatedNewSystemicFailureClass.pass, false)
	assert.deepEqual(analysis.gate.noRepeatedNewSystemicFailureClass.repeatedClasses,
		["identity-obligation-coverage-precedence-regression"])
	assert.equal(analysis.gatePass, false)
	assert.equal(analysis.disposition,
		"identity-obligation-mechanics-passed-human-development-gate-failed-revise-architecture")
	assert.ok(Object.values(analysis.authorization).every((authorized) => authorized === false))
	assert.equal(analysis.inputHashes.feedbackSha256, sha256(feedbackRaw))
	assert.deepEqual(
		analysis.caseResults.map(({ comment }: { comment: string }) => comment),
		feedback.entries.map(({ comment }: { comment: string }) => comment),
	)
	assert.equal(interpretations.repeatedNewSystemicClasses[0],
		"identity-obligation-coverage-precedence-regression")
	assert.equal(interpretations.classCounts["identity-obligation-coverage-precedence-regression"], 4)
	for (const interpretation of interpretations.entries) {
		const reviewed = feedback.entries.find(({ caseId }: { caseId: string }) => caseId === interpretation.caseId)
		assert.ok(reviewed)
		assert.equal(interpretation.commentSha256, sha256(reviewed.comment))
	}
})
