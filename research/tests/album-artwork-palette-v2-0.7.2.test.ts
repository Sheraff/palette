import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS,
	ALBUM_ARTWORK_PALETTE_V2_PARETO_BLOCKS,
	ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS,
} from "../src/album-artwork-palette-v2-protocol.ts"

const experimentRoot = new URL("../data/experiments/album-artwork-palette-v2-0.7.2-development/", import.meta.url)

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	const record = value as Record<string, unknown>
	return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
}

function treatmentKey(treatment: {
	background: { hex: string }
	surface: { hex: string }
	foreground: { hex: string }
	accent: { hex: string }
	gradient: boolean
}): string {
	return [treatment.background.hex, treatment.surface.hex, treatment.foreground.hex,
		treatment.accent.hex, treatment.gradient ? "gradient" : "flat"].join(":")
}

function assertExactGuardEvaluation(evaluation: {
	incumbentTreatmentId: string
	pass: boolean
	blocks: Array<{
		block: string
		incumbentEvidenceLevel: number
		challengerEvidenceLevel: number
		pass: boolean
	}>
	resolvedLosses: Array<{
		block: string
		incumbentEvidenceLevel: number
		challengerEvidenceLevel: number
		evidenceLevelLoss: number
	}>
}, incumbentTreatmentId: string): void {
	assert.equal(evaluation.incumbentTreatmentId, incumbentTreatmentId)
	assert.deepEqual(evaluation.blocks.map(({ block }) => block), ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS)
	for (const row of evaluation.blocks) {
		assert.equal(Number.isSafeInteger(row.incumbentEvidenceLevel), true)
		assert.equal(Number.isSafeInteger(row.challengerEvidenceLevel), true)
		assert.equal(row.pass, row.challengerEvidenceLevel >= row.incumbentEvidenceLevel)
	}
	const expectedLosses = evaluation.blocks.filter(({ pass }) => !pass)
		.map(({ block, incumbentEvidenceLevel, challengerEvidenceLevel }) => ({
			block,
			incumbentEvidenceLevel,
			challengerEvidenceLevel,
			evidenceLevelLoss: incumbentEvidenceLevel - challengerEvidenceLevel,
		}))
	assert.deepEqual(evaluation.resolvedLosses, expectedLosses)
	assert.equal(evaluation.pass, expectedLosses.length === 0)
}

test("0.7.2 development artifacts close the quality domain without pre-winner drift", async () => {
	const [summaryRaw, aggregateRaw, predecessorRaw] = await Promise.all([
		readFile(new URL("summary.json", experimentRoot), "utf8"),
		readFile(new URL("aggregate.json", experimentRoot), "utf8"),
		readFile(new URL("../data/experiments/album-artwork-palette-v2-0.7.1-development/aggregate.json", import.meta.url), "utf8"),
	])
	const summary = JSON.parse(summaryRaw)
	const aggregate = JSON.parse(aggregateRaw)
	const predecessor = JSON.parse(predecessorRaw)

	assert.equal(sha256(summaryRaw), "0974ef010e58fb1e4558748e07746e28a4d6cf7959dddac44c708d064036d636")
	assert.equal(sha256(aggregateRaw), "f0e8bb06accb8b7a7eb0c02955ddbf00e015655751b013581fb18454eb40d9d3")
	assert.equal(summary.schemaVersion, 3)
	assert.equal(summary.candidateVersion, "album-artwork-first-principles-0.7.2")
	assert.equal(summary.implementationHash, "6b29ebc3f6e88e170a3d283009d3e5868c8fa92e72efb350c5dc0abe6750e28e")
	assert.equal(summary.scientificSha256, "fdc4207bd1e4d4d3431fd6c1ced031aa32d9593cabd33f6a6164938a610a72c8")
	assert.equal(summary.reusedSourceArtifacts, summary.sourceCount)
	assert.equal(summary.implementationHash, aggregate.implementationHash)
	assert.equal(summary.scientificSha256, aggregate.scientificSha256)
	assert.equal(summary.developmentManifestId, predecessor.developmentManifestId)
	assert.equal(summary.completeCandidateCount, predecessor.completeCandidateCount)
	assert.equal(summary.paretoFrontierCandidateCount, predecessor.paretoFrontierCandidateCount)
	assert.equal(summary.retainedTreatmentCount, predecessor.retainedTreatmentCount)
	assert.equal(summary.identityObligationGate.pass, true)
	assert.deepEqual(summary.identityObligationGate.failedCaseIds, [])
	assert.equal(summary.identityObligationGate.identityChallengers,
		summary.identityObligationGate.rejectedIdentityChallengers)
	assert.equal(summary.identityObligationGate.eligibleIdentityChallengers, 0)
	assert.ok(summary.identityObligationGate.identityChallengerResolvedLosses >=
		summary.identityObligationGate.rejectedIdentityChallengers)

	const predecessorByCase = new Map(predecessor.cases.map((artifact: { source: { caseId: string } }) =>
		[artifact.source.caseId, artifact]))
	assert.equal(aggregate.cases.length, 28)
	for (const artifact of aggregate.cases) {
		const sourceRaw = await readFile(new URL(`sources/${artifact.source.caseId}.json`, experimentRoot), "utf8")
		assert.deepEqual(artifact, JSON.parse(sourceRaw))
		assert.equal(artifact.schemaVersion, 3)
		assert.equal(artifact.implementationHash, summary.implementationHash)
		assert.equal(artifact.deterministicRepeatedExtraction, true)
		assert.equal(artifact.scientificSha256, sha256(JSON.stringify({
			extraction: artifact.extraction,
			presentations: artifact.presentations,
		})))
		assert.equal(artifact.extraction.version, summary.candidateVersion)
		assert.equal(artifact.extraction.alternatives[0].id, artifact.extraction.winner.id)
		const ranking = artifact.extraction.diagnostics.paretoRanking
		const graph = artifact.extraction.diagnostics.identityObligationGraph
		const overlay = artifact.extraction.diagnostics.exactOverlayGradientChallenger
		assert.equal(graph.version, "identity-obligation-graph-v3")
		assert.equal(ranking.version, "pareto-identity-winner-diagnostics-v3")
		assert.equal(ranking.qualityGuardVersion, "complete-quality-domain-non-inferiority-v1")
		assert.deepEqual(ranking.paretoBlocks, ALBUM_ARTWORK_PALETTE_V2_PARETO_BLOCKS)
		assert.deepEqual(ranking.rankingPriorityBlocks, ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS)
		assert.deepEqual(ranking.qualityGuardBlocks, ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS)
		assert.equal(ranking.globalParetoFrontierTreatmentIds.length, ranking.frontierCandidateCount)
		assert.equal(new Set(ranking.globalParetoFrontierTreatmentIds).size, ranking.frontierCandidateCount)
		assert.equal(ranking.globalParetoFrontierTreatmentIds[0], ranking.globalParetoTopTreatmentId)
		assert.equal(ranking.identityChallengerQualityGuards.length, ranking.identityChallengerCount)
		assert.equal(new Set(ranking.identityChallengerQualityGuards
			.map(({ challengerTreatmentId }: { challengerTreatmentId: string }) => challengerTreatmentId)).size,
			ranking.identityChallengerCount)
		for (const evaluation of ranking.identityChallengerQualityGuards) {
			assertExactGuardEvaluation(evaluation, ranking.qualityIncumbentTreatmentId)
			if (!evaluation.pass) assert.ok(evaluation.resolvedLosses.length > 0)
		}
		assert.equal(ranking.identityChallengerQualityGuards
			.filter(({ pass }: { pass: boolean }) => pass).length, ranking.eligibleIdentityChallengerCount)
		assert.ok(artifact.extraction.alternatives.some(({ id }: { id: string }) =>
			id === ranking.qualityIncumbentTreatmentId))
		assert.equal(overlay.qualityGuardRequired, ranking.selectedIdentityChallengerTreatmentId !== null)
		assert.ok(overlay.projectedUniqueCount <= overlay.projectedLegalCount)
		assert.equal(new Set(overlay.qualityGuardEvaluations
			.map(({ challengerTreatmentId }: { challengerTreatmentId: string }) => challengerTreatmentId)).size,
			overlay.qualityGuardEvaluations.length)
		assert.equal(overlay.qualityGuardRejectedCandidateCount,
			overlay.qualityGuardEvaluations.filter(({ pass }: { pass: boolean }) => !pass).length)
		for (const evaluation of overlay.qualityGuardEvaluations) {
			assertExactGuardEvaluation(evaluation, ranking.qualityIncumbentTreatmentId)
		}
		if (overlay.qualityGuardRequired && overlay.replacedPrimaryWinner) {
			assert.equal(overlay.selectedChallengerPassesQualityGuard, true)
		}
		const prior = predecessorByCase.get(artifact.source.caseId) as typeof artifact | undefined
		assert.ok(prior)
		assert.equal(prior.source.sha256, artifact.source.sha256)
		assert.deepEqual(prior.extraction.diagnostics.fieldHypotheses,
			artifact.extraction.diagnostics.fieldHypotheses)
		assert.equal(prior.extraction.diagnostics.completeCandidateCount,
			artifact.extraction.diagnostics.completeCandidateCount)
		assert.equal(prior.extraction.diagnostics.paretoRanking.globalParetoTopTreatmentId,
			ranking.globalParetoTopTreatmentId)
		assert.equal(prior.extraction.diagnostics.paretoRanking.frontierCandidateCount,
			ranking.frontierCandidateCount)
	}
})

test("0.7.2 development analysis is transfer-only and opens no new review", async () => {
	const [analysisRaw, aggregateRaw, predecessorRaw, failedRaw, baselineRaw, protocolRaw] = await Promise.all([
		readFile(new URL("development-analysis.json", experimentRoot), "utf8"),
		readFile(new URL("aggregate.json", experimentRoot), "utf8"),
		readFile(new URL("../data/experiments/album-artwork-palette-v2-0.7.1-development/aggregate.json", import.meta.url), "utf8"),
		readFile(new URL("../data/experiments/album-artwork-palette-v2-0.7.0-development/aggregate.json", import.meta.url), "utf8"),
		readFile(new URL("../data/experiments/album-artwork-palette-v2-0.6.0-development/aggregate.json", import.meta.url), "utf8"),
		readFile(new URL("../ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_7_2.md", import.meta.url), "utf8"),
	])
	const analysis = JSON.parse(analysisRaw)
	const current = JSON.parse(aggregateRaw)
	const predecessor = JSON.parse(predecessorRaw)
	const failed = JSON.parse(failedRaw)
	const baseline = JSON.parse(baselineRaw)
	const { analysisId, ...analysisIdentity } = analysis
	assert.equal(sha256(analysisRaw), "6aa97a83217aee20852c1a371d05909cf11e28f74ebdcd0826b0fb72162c25b0")
	assert.equal(analysisId, sha256(canonicalJson(analysisIdentity)))
	assert.equal(analysis.inputHashes.currentAggregateSha256, sha256(aggregateRaw))
	assert.equal(analysis.inputHashes.predecessorAggregateSha256, sha256(predecessorRaw))
	assert.equal(analysis.inputHashes.failedAggregateSha256, sha256(failedRaw))
	assert.equal(analysis.inputHashes.baselineAggregateSha256, sha256(baselineRaw))
	assert.equal(analysis.inputHashes.protocolSha256, sha256(protocolRaw))
	assert.equal(analysis.gatePass, true)
	assert.equal(analysis.disposition, "complete-quality-domain-development-gate-passed-no-novel-review-cases")
	assert.deepEqual(analysis.winnerComparisons.novelWinnerCaseIds, [])
	assert.equal(analysis.winnerComparisons.immediatePredecessor.exactMatchCount, current.sourceCount - 1)
	assert.equal(analysis.baselineDelta.exactBaselineMatchCount, current.sourceCount - 3)
	assert.equal(analysis.baselineDelta.changedFromBaselineCount, 3)
	assert.equal(analysis.baselineDelta.transferredAssessmentCount, 3)
	assert.equal(analysis.baselineDelta.freshReviewCaseCount, 0)
	assert.deepEqual(analysis.baselineDelta.freshCaseIds, [])
	assert.ok(Object.values(analysis.transferGate).every((pass) => pass === true))
	assert.ok(Object.values(analysis.authorization).every((authorized) => authorized === false))

	const predecessorByCase = new Map(predecessor.cases.map((artifact: { source: { caseId: string } }) =>
		[artifact.source.caseId, artifact]))
	const failedByCase = new Map(failed.cases.map((artifact: { source: { caseId: string } }) =>
		[artifact.source.caseId, artifact]))
	const baselineByCase = new Map(baseline.cases.map((artifact: { source: { caseId: string } }) =>
		[artifact.source.caseId, artifact]))
	const changedFromPredecessor = current.cases.filter((artifact: { source: { caseId: string }; extraction: { winner: never } }) =>
		treatmentKey(artifact.extraction.winner) !== treatmentKey(
			(predecessorByCase.get(artifact.source.caseId) as { extraction: { winner: never } }).extraction.winner))
	assert.deepEqual(new Set(analysis.winnerComparisons.immediatePredecessor.changedCaseIds),
		new Set(changedFromPredecessor.map(({ source }: { source: { caseId: string } }) => source.caseId)))
	for (const artifact of changedFromPredecessor) {
		const baselineArtifact = baselineByCase.get(artifact.source.caseId) as { extraction: { winner: never } }
		assert.equal(treatmentKey(artifact.extraction.winner), treatmentKey(baselineArtifact.extraction.winner))
	}
	for (const transfer of analysis.baselineDelta.transferredAssessments) {
		const artifact = current.cases.find(({ source }: { source: { caseId: string } }) => source.caseId === transfer.caseId)
		const baselineArtifact = baselineByCase.get(transfer.caseId) as { source: { sha256: string }; extraction: { winner: never } }
		assert.ok(artifact)
		assert.equal(artifact.source.sha256, transfer.sourceSha256)
		assert.equal(baselineArtifact.source.sha256, transfer.sourceSha256)
		assert.equal(sha256(treatmentKey(artifact.extraction.winner)), transfer.candidateTreatmentKeySha256)
		assert.equal(sha256(treatmentKey(baselineArtifact.extraction.winner)), transfer.baselineTreatmentKeySha256)
		assert.ok(["strong", "acceptable"].includes(transfer.candidateQuality))
		assert.notEqual(transfer.relativeOutcome, "baseline-stronger")
		assert.deepEqual(transfer.technicalInterpretationClasses, [])
		assert.ok([predecessor.candidateVersion, failed.candidateVersion].some((version) =>
			transfer.origin.reviewVersion.includes(version.split("-").at(-1))))
		assert.ok(failedByCase.has(transfer.caseId))
	}
})

test("0.7.2 postmortem freezes the successful repair and bounds 0.7.3 to recall research", async () => {
	const [postmortem, protocolRaw, summaryRaw, aggregateRaw, analysisRaw] = await Promise.all([
		readFile(new URL("../ALBUM_ARTWORK_UI_PALETTE_0_7_2_COMPLETE_QUALITY_DOMAIN_POSTMORTEM.md", import.meta.url), "utf8"),
		readFile(new URL("../ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_7_2.md", import.meta.url), "utf8"),
		readFile(new URL("summary.json", experimentRoot), "utf8"),
		readFile(new URL("aggregate.json", experimentRoot), "utf8"),
		readFile(new URL("development-analysis.json", experimentRoot), "utf8"),
	])
	const summary = JSON.parse(summaryRaw)
	const analysis = JSON.parse(analysisRaw)

	assert.equal(sha256(postmortem), "f3449b8306c09622dc07c56814620cf2b0f4009301c724729fc4249f63841f0e")
	assert.match(postmortem, new RegExp(summary.implementationHash))
	assert.match(postmortem, new RegExp(summary.scientificSha256))
	assert.match(postmortem, new RegExp(sha256(protocolRaw)))
	assert.match(postmortem, new RegExp(sha256(summaryRaw)))
	assert.match(postmortem, new RegExp(sha256(aggregateRaw)))
	assert.match(postmortem, new RegExp(sha256(analysisRaw)))
	assert.match(postmortem, new RegExp(analysis.analysisId))
	assert.match(postmortem, /successful safety and non-regression improvement/)
	assert.match(postmortem, /complete-quality-domain-development-gate-passed-no-novel-review-cases/)
	assert.match(postmortem, /candidate-recall and stage-custody audit/)
	assert.match(postmortem, /source-derived pre-pruning direction registry/)
	assert.match(postmortem, /Run these independent arms against one byte-identical/)
	assert.match(postmortem, /joint availability matrix/)
	assert.match(postmortem, /factorized Pareto retention/)
	assert.match(postmortem, /at least three distinct sources in the fixed/)
	assert.match(postmortem, /If the widened current-model search still cannot construct/)
	assert.match(postmortem, /## Research After 0\.7\.3/)
	assert.match(postmortem, /move to multi-hue field\s+structure/)
	assert.match(postmortem, /### Multi-Hue Field Structure/)
	assert.match(postmortem, /### Role-Specific Identity Attribution/)
	assert.match(postmortem, /### Mechanism-Aware Joint Construction/)
	assert.match(postmortem, /### Discovery-Semantic Follow-Ups/)
	assert.match(postmortem, /After field availability is established/)
	assert.match(postmortem, /no review label, comment, filename, source ID, literal color, or named-case branch/)
	assert.match(postmortem, /Do not authorize a directional sample, Phase 5, promotion, persistence, or full roster/)
})
