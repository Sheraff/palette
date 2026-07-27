import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	parsePhase4PrivateReviewManifest,
	parsePhase4ReviewFeedbackStore,
} from "../src/album-artwork-palette-v2-phase-4-review.ts"

const root = new URL("../data/experiments/album-artwork-palette-v2-0.4.4-phase-4/", import.meta.url)

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	const record = value as Record<string, unknown>
	return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
}

function publicPalette(presentation: any) {
	return {
		roles: Object.fromEntries(["background", "surface", "foreground", "accent"].map((role) => [role, {
			hex: presentation.roles[role].hex,
			nearestName: presentation.roles[role].colorName.nearestName,
			generated: presentation.roles[role].generated,
		}])),
		gradient: presentation.gradient,
		collapse: presentation.collapse,
	}
}

test("Phase 4 one-time artifacts are complete, custody-bound, and baseline-exact", async () => {
	const [protocolRaw, runRaw, candidateCompleteRaw, manifestRaw, provenanceRaw] = await Promise.all([
		readFile(new URL("protocol.json", root)),
		readFile(new URL("run-complete.json", root)),
		readFile(new URL("candidate-complete.json", root)),
		readFile(new URL("review-manifest.private.json", root)),
		readFile(new URL("review-provenance.private.json", root)),
	])
	const protocol = JSON.parse(protocolRaw.toString("utf8"))
	const run = JSON.parse(runRaw.toString("utf8"))
	const candidateComplete = JSON.parse(candidateCompleteRaw.toString("utf8"))
	const manifest = parsePhase4PrivateReviewManifest(JSON.parse(manifestRaw.toString("utf8")))
	const provenance = JSON.parse(provenanceRaw.toString("utf8"))
	assert.equal(run.protocolId, protocol.protocolId)
	assert.equal(candidateComplete.protocolId, protocol.protocolId)
	assert.equal(run.sourceCount, 12)
	assert.equal(run.candidateCount, 12)
	assert.equal(run.baselineCount, 12)
	assert.equal(run.baselinePoc10ExactPresentationMatchCount, 12)
	assert.equal(run.privateReviewManifestId, manifest.manifestId)
	assert.equal(run.privateReviewManifestSha256, sha256(manifestRaw))
	assert.equal(run.reviewProvenanceId, provenance.manifestId)
	assert.equal(run.reviewProvenanceSha256, sha256(provenanceRaw))
	assert.equal(protocol.phase3Freeze.gatePass, true)
	assert.equal(protocol.phase3Freeze.freezeCandidateForPhase4, true)
	assert.equal(protocol.candidate.version, "album-artwork-first-principles-0.4.4")
	assert.equal(protocol.candidate.frozenImplementationHash, "d41bd338a39fbd89bcdc1f200cbbb36c30ead374e5b53ce8e6fb9e3bcc624754")
	assert.equal(protocol.baseline.version, "region-graph-0.19.0")
	assert.equal(protocol.baseline.promotedPoc10.sha256, "5d0cfdaf80575046ecf8273bde4bc19a8ccd8ecccd95f74991230b397e4ed6f8")
	assert.equal(protocol.execution.candidateFirst, true)
	assert.equal(protocol.execution.candidateWorkers, 6)
	assert.equal(protocol.execution.reuse, false)
	assert.equal(protocol.execution.automaticRetry, false)
	assert.equal(protocol.sideAssignment.assignments.filter(({ candidateSide }: { candidateSide: string }) => candidateSide === "A").length, 6)
	assert.equal(protocol.sideAssignment.assignments.filter(({ candidateSide }: { candidateSide: string }) => candidateSide === "B").length, 6)
	assert.equal(manifest.cases.length, 12)
	assert.equal(manifest.cases.filter(({ assignment }) => assignment.A === "candidate").length, 6)
	assert.equal(provenance.cases.length, 12)
	const provenanceByCase = new Map(provenance.cases.map((entry: any) => [entry.reviewCaseId, entry]))
	const markerByCase = new Map(candidateComplete.artifacts.map((entry: any) => [entry.caseId, entry]))
	for (const reviewCase of manifest.cases) {
		const bound: any = provenanceByCase.get(reviewCase.caseId)
		assert.ok(bound)
		const freshCaseId = bound.private.freshCaseId
		const [candidateRaw, baselineRaw] = await Promise.all([
			readFile(new URL(`candidate/${freshCaseId}.json`, root)),
			readFile(new URL(`baseline/${freshCaseId}.json`, root)),
		])
		const candidate = JSON.parse(candidateRaw.toString("utf8"))
		const baseline = JSON.parse(baselineRaw.toString("utf8"))
		assert.equal(candidate.method, "candidate")
		assert.equal(baseline.method, "baseline")
		assert.equal(candidate.protocolId, protocol.protocolId)
		assert.equal(baseline.protocolId, protocol.protocolId)
		assert.equal(candidate.source.sha256, reviewCase.source.sha256)
		assert.equal(baseline.source.sha256, reviewCase.source.sha256)
		assert.equal(candidate.source.byteCount, reviewCase.source.bytes)
		assert.equal(candidate.extraction.version, "album-artwork-first-principles-0.4.4")
		assert.equal(baseline.extraction.version, "region-graph-0.19.0")
		assert.equal(candidate.presentationSha256, sha256(canonicalJson(candidate.presentation)))
		assert.equal(baseline.presentationSha256, sha256(canonicalJson(baseline.presentation)))
		assert.equal(candidate.scientificSha256, sha256(canonicalJson(candidate.extraction)))
		assert.equal(baseline.scientificSha256, sha256(canonicalJson(baseline.extraction)))
		assert.equal(baseline.promotedPoc10ExactPresentationMatch, true)
		assert.equal(baseline.promotedPoc10PresentationSha256, baseline.presentationSha256)
		assert.equal((markerByCase.get(freshCaseId) as any).rawSha256, sha256(candidateRaw))
		const expectedA = reviewCase.assignment.A === "candidate" ? candidate.presentation : baseline.presentation
		const expectedB = reviewCase.assignment.B === "candidate" ? candidate.presentation : baseline.presentation
		assert.deepEqual(reviewCase.options.A, publicPalette(expectedA))
		assert.deepEqual(reviewCase.options.B, publicPalette(expectedB))
	}
})

test("Phase 4 analysis is bound to complete feedback and verbatim comments", async () => {
	const [manifestRaw, provenanceRaw, runRaw, feedbackRaw, interpretationsRaw, analysisRaw] = await Promise.all([
		readFile(new URL("review-manifest.private.json", root)),
		readFile(new URL("review-provenance.private.json", root)),
		readFile(new URL("run-complete.json", root)),
		readFile(new URL("../../album-artwork-palette-v2-0.4.4-phase-4-feedback.json", root)),
		readFile(new URL("technical-interpretations.json", root)),
		readFile(new URL("phase-4-analysis.json", root)),
	])
	const manifest = parsePhase4PrivateReviewManifest(JSON.parse(manifestRaw.toString("utf8")))
	const feedback = parsePhase4ReviewFeedbackStore(JSON.parse(feedbackRaw.toString("utf8")), manifest)
	const provenance = JSON.parse(provenanceRaw.toString("utf8"))
	const interpretations = JSON.parse(interpretationsRaw.toString("utf8"))
	const analysis = JSON.parse(analysisRaw.toString("utf8"))
	assert.equal(feedback.entries.length, 12)
	assert.equal(new Set(feedback.entries.map(({ caseId }) => caseId)).size, 12)
	const commented = feedback.entries.filter(({ comment }) => comment.length > 0)
	assert.equal(commented.length, 5)
	assert.equal(interpretations.schemaVersion, 1)
	assert.equal(interpretations.entries.length, commented.length)
	assert.deepEqual(
		new Set(interpretations.entries.map(({ caseId }: { caseId: string }) => caseId)),
		new Set(commented.map(({ caseId }) => caseId)),
	)
	for (const entry of commented) {
		const interpretation = interpretations.entries.find(({ caseId }: { caseId: string }) => caseId === entry.caseId)
		assert.ok(interpretation)
		assert.equal(interpretation.commentSha256, sha256(entry.comment))
		assert.equal(typeof interpretation.rationale, "string")
		assert.ok(interpretation.rationale.length > 0)
	}
	assert.equal(analysis.manifestId, manifest.manifestId)
	assert.equal(analysis.protocolId, provenance.protocolId)
	assert.equal(analysis.inputHashes.manifestSha256, sha256(manifestRaw))
	assert.equal(analysis.inputHashes.provenanceSha256, sha256(provenanceRaw))
	assert.equal(analysis.inputHashes.runCompleteSha256, sha256(runRaw))
	assert.equal(analysis.inputHashes.feedbackSha256, sha256(feedbackRaw))
	assert.equal(analysis.inputHashes.technicalInterpretationsSha256, sha256(interpretationsRaw))
	assert.deepEqual(analysis.counts.relative, {
		"baseline-stronger": 6,
		"candidate-stronger": 3,
		"neither-acceptable": 1,
		"similarly-valid": 2,
	})
	assert.deepEqual(analysis.counts.candidateQuality, {
		acceptable: 6,
		strong: 3,
		unacceptable: 2,
		"weak-fallback": 1,
	})
	assert.equal(analysis.counts.positiveCandidateCount, 9)
	assert.deepEqual(analysis.advancementGate, {
		pass: false,
		candidateStrongerThanBaseline: false,
		candidateQualityCommonlyPositive: true,
		noRepeatedSystemicFailureClass: false,
		repeatedTechnicalClasses: [
			"gradient-treatment-ranking-underselection",
			"signature-color-ranking-underselection",
		],
	})
	assert.equal(analysis.phaseDisposition, "phase4-directional-gate-failed-return-to-development-with-new-future-sample")
	assert.equal(analysis.results.length, 12)
	for (const result of analysis.results) {
		const response = feedback.entries.find(({ caseId }) => caseId === result.caseId)
		assert.ok(response)
		assert.equal(result.comment, response.comment)
	}
})
