import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { parsePhase4PrivateReviewManifest } from "../src/album-artwork-palette-v2-phase-4-review.ts"

const experimentRoot = new URL("../data/experiments/album-artwork-palette-v2-0.7.1-development/", import.meta.url)

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex")
}

function exactPartition(whole: readonly string[], ...parts: readonly (readonly string[])[]): boolean {
	const flattened = parts.flat()
	return new Set(whole).size === whole.length && new Set(flattened).size === flattened.length &&
		JSON.stringify([...whole].sort()) === JSON.stringify([...flattened].sort())
}

test("0.7.1 development artifacts prove quality-guarded identity continuity", async () => {
	const [summary, aggregate, predecessorSummary] = await Promise.all([
		readFile(new URL("summary.json", experimentRoot), "utf8").then(JSON.parse),
		readFile(new URL("aggregate.json", experimentRoot), "utf8").then(JSON.parse),
		readFile(new URL("../data/experiments/album-artwork-palette-v2-0.7.0-development/summary.json", import.meta.url), "utf8")
			.then(JSON.parse),
	])

	assert.equal(summary.schemaVersion, 2)
	assert.equal(summary.candidateVersion, "album-artwork-first-principles-0.7.1")
	assert.match(summary.implementationHash, /^[a-f0-9]{64}$/)
	assert.match(summary.scientificSha256, /^[a-f0-9]{64}$/)
	assert.equal(summary.implementationHash, aggregate.implementationHash)
	assert.equal(summary.scientificSha256, aggregate.scientificSha256)
	assert.equal(summary.developmentManifestId, predecessorSummary.developmentManifestId)
	assert.equal(summary.sourceCount, 28)
	assert.equal(summary.completeCandidateCount, predecessorSummary.completeCandidateCount)
	assert.equal(summary.paretoFrontierCandidateCount, predecessorSummary.paretoFrontierCandidateCount)
	assert.equal(summary.retainedTreatmentCount, predecessorSummary.retainedTreatmentCount)
	assert.equal(summary.identityObligationGate.pass, true)
	assert.equal(summary.identityObligationGate.totalObligations,
		summary.identityObligationGate.feasibleObligations)
	assert.equal(summary.identityObligationGate.feasibleObligations,
		summary.identityObligationGate.winnerCoveredObligations + summary.identityObligationGate.deferredObligations)
	assert.equal(summary.identityObligationGate.deferredObligations,
		summary.identityObligationGate.qualityDeferredObligations +
		summary.identityObligationGate.priorityDeferredObligations)
	assert.deepEqual(summary.identityObligationGate.failedCaseIds, [])

	assert.equal(aggregate.cases.length, 28)
	for (const artifact of aggregate.cases) {
		assert.equal(artifact.schemaVersion, 2)
		assert.equal(artifact.deterministicRepeatedExtraction, true)
		assert.equal(artifact.implementationHash, summary.implementationHash)
		assert.equal(artifact.developmentManifestId, summary.developmentManifestId)
		assert.equal(artifact.scientificSha256, sha256(JSON.stringify({
			extraction: artifact.extraction,
			presentations: artifact.presentations,
		})))
		assert.equal(artifact.extraction.version, summary.candidateVersion)
		assert.equal(artifact.extraction.alternatives[0].id, artifact.extraction.winner.id)
		assert.ok(artifact.extraction.alternatives.length <= 8)
		assert.ok(artifact.extraction.diagnostics.completeCandidateCount <= 1_500)

		const ranking = artifact.extraction.diagnostics.paretoRanking
		const graph = artifact.extraction.diagnostics.identityObligationGraph
		const explanation = graph.winnerExplanation
		const overlay = artifact.extraction.diagnostics.exactOverlayGradientChallenger
		assert.equal(graph.version, "identity-obligation-graph-v2")
		assert.equal(ranking.identityCoverageRequiresQualityNonInferiority, true)
		assert.equal(ranking.globalParetoTopTreatmentId, ranking.qualityIncumbentTreatmentId)
		assert.ok(artifact.extraction.alternatives.some(({ id }: { id: string }) =>
			id === ranking.qualityIncumbentTreatmentId))
		assert.ok(ranking.identityRetentionFrontierCandidateCount >= ranking.frontierCandidateCount)
		assert.equal(ranking.selectedTreatmentId, artifact.extraction.winner.id)
		assert.equal(explanation.treatmentId, artifact.extraction.winner.id)
		assert.ok(explanation.coveredObligationIds.length <= explanation.maximumCompleteTreatmentCoverage)
		assert.equal(exactPartition(explanation.feasibleObligationIds,
			explanation.coveredObligationIds, explanation.deferredObligationIds), true)
		assert.equal(exactPartition(explanation.deferredObligationIds,
			explanation.qualityDeferredObligationIds, explanation.priorityDeferredObligationIds), true)
		assert.equal(explanation.obligationDeferrals.length, explanation.deferredObligationIds.length)
		if (ranking.selectedIdentityChallengerTreatmentId === null) {
			assert.equal(ranking.selectedIdentityChallengerQualityGuard, null)
			assert.equal(ranking.primaryTreatmentId, ranking.qualityIncumbentTreatmentId)
		} else {
			assert.equal(ranking.selectedIdentityChallengerQualityGuard.pass, true)
			assert.equal(ranking.primaryTreatmentId, ranking.selectedIdentityChallengerTreatmentId)
		}
		if (overlay.qualityGuardRequired && overlay.replacedPrimaryWinner) {
			assert.equal(overlay.selectedChallengerPassesQualityGuard, true)
		}
	}
})

test("0.7.1 review preparation covers the complete fresh delta and one exact transfer", async () => {
	const [manifestValue, preparation, current, failed, baseline] = await Promise.all([
		readFile(new URL("quality-guard-review-manifest.private.json", experimentRoot), "utf8").then(JSON.parse),
		readFile(new URL("quality-guard-review-preparation.json", experimentRoot), "utf8").then(JSON.parse),
		readFile(new URL("aggregate.json", experimentRoot), "utf8").then(JSON.parse),
		readFile(new URL("../data/experiments/album-artwork-palette-v2-0.7.0-development/aggregate.json", import.meta.url), "utf8")
			.then(JSON.parse),
		readFile(new URL("../data/experiments/album-artwork-palette-v2-0.6.0-development/aggregate.json", import.meta.url), "utf8")
			.then(JSON.parse),
	])
	const manifest = parsePhase4PrivateReviewManifest(manifestValue)
	const treatmentKey = (treatment: {
		background: { hex: string }
		surface: { hex: string }
		foreground: { hex: string }
		accent: { hex: string }
		gradient: boolean
	}): string => [treatment.background.hex, treatment.surface.hex, treatment.foreground.hex,
		treatment.accent.hex, treatment.gradient ? "gradient" : "flat"].join(":")
	const failedByCase = new Map(failed.cases.map((entry: { source: { caseId: string } }) =>
		[entry.source.caseId, entry]))
	const baselineByCase = new Map(baseline.cases.map((entry: { source: { caseId: string } }) =>
		[entry.source.caseId, entry]))
	const changedFromBaseline = current.cases.filter((entry: { source: { caseId: string }; extraction: { winner: never } }) =>
		treatmentKey(entry.extraction.winner) !== treatmentKey(
			(baselineByCase.get(entry.source.caseId) as { extraction: { winner: never } }).extraction.winner))
	const transferredIds = new Set(preparation.transferredExactReviewAssessments.map(({ caseId }: { caseId: string }) => caseId))

	assert.equal(manifest.reviewVersion, "album-artwork-palette-v2-0.7.1-quality-guard-review-v1")
	assert.equal(manifest.cases.length, 3)
	assert.equal(preparation.changedFromBaselineCount, changedFromBaseline.length)
	assert.equal(preparation.exactBaselineMatchCount + preparation.changedFromBaselineCount, current.sourceCount)
	assert.equal(preparation.transferredExactReviewAssessments.length, 1)
	assert.deepEqual(new Set(manifest.cases.map(({ caseId }) => caseId)),
		new Set(changedFromBaseline.map(({ source }: { source: { caseId: string } }) => source.caseId)
			.filter((caseId: string) => !transferredIds.has(caseId))))
	assert.deepEqual(preparation.candidateSideCounts, { A: 2, B: 1 })
	for (const transfer of preparation.transferredExactReviewAssessments) {
		const currentEntry = current.cases.find(({ source }: { source: { caseId: string } }) => source.caseId === transfer.caseId)
		const failedEntry = failedByCase.get(transfer.caseId) as { extraction: { winner: never } }
		assert.ok(currentEntry)
		assert.equal(treatmentKey(currentEntry.extraction.winner), treatmentKey(failedEntry.extraction.winner))
		assert.ok(["strong", "acceptable"].includes(transfer.candidateQuality))
	}
})
