import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { parseNextPaletteReviewFeedbackStore, parseNextPaletteReviewManifest } from "../src/next-palette-review-v2.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const auditRoot = resolve(projectRoot,
	"research/data/experiments/joint-palette-threshold-free-collapse-audit-0.1.1-development")
const candidateRoot = resolve(projectRoot,
	"research/data/experiments/joint-palette-threshold-free-collapse-0.1.0-development")
const reviewRoot = resolve(candidateRoot, "review-v2")
const auditId = "ebee9abb7e86b70754c2ed2ef83cd7bf643f5bf71d94d084ed69108b0617eb43"
const candidateId = "0915e9ab8df678d6a290ac567f580227228e94a009b1f11011193f3015484a6f"

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue)
	if (typeof value !== "object" || value === null) return value
	const record = value as Record<string, unknown>
	return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalValue(record[key])]))
}

async function readJson<T>(root: string, file: string): Promise<T> {
	return JSON.parse(await readFile(resolve(root, file), "utf8")) as T
}

async function verifyManifest(root: string, expectedId: string): Promise<void> {
	const manifest = await readJson<Record<string, unknown> & {
		experimentId: string
		generatedAt: string
		inputs: Record<string, { path: string; sha256: string }>
		sources: Array<{ path?: string; file?: string; source?: { path: string; sha256: string; bytes: number }; sha256?: string; bytes?: number }>
		implementation: Record<string, string>
	}>(root, "manifest.json")
	assert.equal(manifest.experimentId, expectedId)
	for (const [name, input] of Object.entries(manifest.inputs)) {
		assert.equal(sha256(await readFile(resolve(projectRoot, input.path))), input.sha256, name)
	}
	for (const [file, hash] of Object.entries(manifest.implementation)) {
		assert.equal(sha256(await readFile(resolve(projectRoot, file))), hash, file)
	}
	const { experimentId: _experimentId, generatedAt: _generatedAt, ...identity } = manifest
	assert.equal(sha256(JSON.stringify(canonicalValue(identity))), expectedId)
}

test("corrected threshold-free collapse audit is relational, complete, and review-blocked", async () => {
	const protocol = await readJson<{
		auditOnly: boolean
		exactCounterfactual: string
		hypothesis: { fittedNumericThresholds: boolean }
		authorization: Record<string, boolean | string[]>
	}>(auditRoot, "protocol.json")
	const analysis = await readJson<{
		experimentId: string
		coverage: Record<string, unknown>
		clauses: Record<string, number>
		correction: Record<string, number | string>
		exactCandidateCoverage: Record<string, number>
		reviewedSeparation: Record<string, number>
		disposition: string
	}>(auditRoot, "analysis.json")
	const frontier = await readJson<{
		experimentId: string
		entries: Array<{
			reviewEvidence: string
			changedSemanticBlocks: number
			changedSemanticAtoms: number
			objectiveDeltas: number[]
			audit: { clauses: Record<string, boolean> }
		}>
	}>(auditRoot, "candidate-frontier.json")

	assert.equal(protocol.auditOnly, true)
	assert.equal(protocol.exactCounterfactual, "(B,F,S,A,noncollapsed) -> (B,F,B,A,collapsed)")
	assert.equal(protocol.hypothesis.fittedNumericThresholds, false)
	assert.equal(protocol.authorization.commentsEnterAudit, false)
	assert.equal(protocol.authorization.filenamesEnterAudit, false)
	assert.equal(protocol.authorization.candidateReviewAuthorized, false)
	assert.equal(protocol.authorization.broaderReviewAuthorized, false)
	assert.deepEqual(protocol.authorization.outputUnseenRootsOpened, [])
	assert.equal(analysis.experimentId, auditId)
	assert.equal(analysis.coverage.total, 392)
	assert.equal(analysis.coverage.auditable, 159)
	assert.equal(analysis.clauses.allPass, 70)
	assert.equal(analysis.correction.predecessorKnownCandidateCount, 97)
	assert.equal(analysis.correction.correctedKnownCandidateCount, 75)
	assert.deepEqual(analysis.exactCandidateCoverage, {
		knownIsolatedRetainedBackgroundCollapseTuples: 75,
		auditable: 8,
		passing: 3,
		exactPositiveTransfers: 1,
		freshReviewRequired: 2,
	})
	assert.deepEqual(analysis.reviewedSeparation, { positivePass: 1, negativeFail: 2 })
	assert.equal(analysis.disposition, "corrected-audit-complete-candidate-review-authorization-required")
	assert.equal(frontier.experimentId, auditId)
	assert.equal(frontier.entries.length, 3)
	assert.equal(frontier.entries.filter((entry) => entry.reviewEvidence === "exact-positive-transfer").length, 1)
	assert.equal(frontier.entries.filter((entry) => entry.reviewEvidence === "fresh-review-required").length, 2)
	assert.ok(frontier.entries.every((entry) => entry.changedSemanticBlocks === 1 && entry.changedSemanticAtoms === 2 &&
		entry.objectiveDeltas.every((delta) => delta >= -1e-12) && entry.objectiveDeltas.some((delta) => delta > 1e-12) &&
		Object.values(entry.audit.clauses).every(Boolean)))
	await verifyManifest(auditRoot, auditId)
})

test("threshold-free collapse candidate exactly materializes one transfer and two fresh cases", async () => {
	const protocol = await readJson<{
		candidateVersion: string
		authorization: Record<string, boolean | number | string | string[]>
		stoppingRules: Record<string, boolean | number>
	}>(candidateRoot, "protocol.json")
	const analysis = await readJson<{
		experimentId: string
		structural: { pass: boolean; violationCount: number }
		coverage: Record<string, number>
		review: { authorized: boolean; freshBlindedComparisonsRequired: number; diagnosticOnly: boolean }
		disposition: string
	}>(candidateRoot, "analysis.json")
	const results = await readJson<{
		experimentId: string
		entries: Array<{
			candidate: Record<string, { rgb: number[] }> & { gradient: { isGradient: boolean } }
			canonical: Record<string, { rgb: number[] }> & { gradient: { isGradient: boolean } }
			certificate: { route: string; audit: { pass: boolean; clauses: Record<string, boolean> } }
			structural: { violations: string[] }
		}>
	}>(candidateRoot, "results.json")
	const frontier = await readJson<{ experimentId: string; entries: Array<{ changedRoles: string[]; audit: { pass: boolean } }> }>(
		candidateRoot, "frontier.json",
	)
	const transfer = await readJson<{ experimentId: string; entries: Array<{ candidateQuality: string; comparison: string }> }>(
		candidateRoot, "review-transfer.json",
	)

	assert.equal(protocol.candidateVersion, "joint-palette-threshold-free-collapse-0.1.0-development")
	assert.equal(protocol.authorization.maximumFreshReviewCases, 2)
	assert.equal(protocol.authorization.broaderReviewAuthorized, false)
	assert.equal(protocol.authorization.canonicalPromotionAuthorized, false)
	assert.equal(protocol.authorization.candidateFreezeAuthorized, false)
	assert.equal(protocol.authorization.reserveAccessAuthorized, false)
	assert.deepEqual(protocol.authorization.outputUnseenRootsOpened, [])
	assert.equal(protocol.stoppingRules.everyCandidateMustPassAllThresholdFreeClauses, true)
	assert.equal(analysis.experimentId, candidateId)
	assert.equal(analysis.structural.pass, true)
	assert.equal(analysis.structural.violationCount, 0)
	assert.deepEqual(analysis.coverage, { auditedPassingCandidates: 3, exactPositiveTransfers: 1, freshReviewRequired: 2 })
	assert.equal(analysis.review.authorized, true)
	assert.equal(analysis.review.freshBlindedComparisonsRequired, 2)
	assert.equal(analysis.review.diagnosticOnly, true)
	assert.equal(analysis.disposition, "targeted-threshold-free-collapse-review-ready")
	assert.equal(results.experimentId, candidateId)
	assert.equal(results.entries.length, 3)
	assert.ok(results.entries.every((entry) => {
		const candidate = entry.candidate
		const canonical = entry.canonical
		return entry.certificate.route === "admitted-collapse" && entry.certificate.audit.pass &&
			Object.values(entry.certificate.audit.clauses).every(Boolean) && entry.structural.violations.length === 0 &&
			JSON.stringify(candidate.background.rgb) === JSON.stringify(canonical.background.rgb) &&
			JSON.stringify(candidate.surface.rgb) === JSON.stringify(canonical.background.rgb) &&
			JSON.stringify(candidate.foreground.rgb) === JSON.stringify(canonical.foreground.rgb) &&
			JSON.stringify(candidate.accent.rgb) === JSON.stringify(canonical.accent.rgb) && !candidate.gradient.isGradient
	}))
	assert.equal(frontier.experimentId, candidateId)
	assert.equal(frontier.entries.length, 2)
	assert.ok(frontier.entries.every((entry) => entry.changedRoles.join(",") === "surface" && entry.audit.pass))
	assert.equal(transfer.experimentId, candidateId)
	assert.deepEqual(transfer.entries, [{
		file: "00/ab67616d0000b27300004d9bc5a7082303c8b125.jpg",
		sourceSha256: "8b8dc409e486cdab11e9e46f4c4b8f083c5969cfc04dbc76965e2cf2b3611413",
		candidateQuality: "acceptable-not-ideal",
		comparison: "candidate-stronger",
		transferBasis: "exact-canonical-and-candidate-semantic-palette-match",
	}])
	await verifyManifest(candidateRoot, candidateId)
})

test("threshold-free collapse review contains only the two fresh exact candidates", async () => {
	const manifest = parseNextPaletteReviewManifest(JSON.parse(await readFile(
		resolve(reviewRoot, "batch-01-manifest.json"), "utf8",
	)) as unknown)
	const feedback = parseNextPaletteReviewFeedbackStore(JSON.parse(await readFile(
		resolve(reviewRoot, "batch-01-feedback.json"), "utf8",
	)) as unknown, manifest)
	const plan = await readJson<{
		status: string
		scope: { freshBlindedComparisons: number; exactPositiveTransfers: number; totalBatches: number; diagnosticOnly: boolean }
		manifestIds: string[]
	}>(reviewRoot, "plan.json")
	const authorization = await readJson<{
		experimentId: string
		review: { authorized: boolean; diagnosticOnly: boolean; thresholdFreeAuditedCollapsesOnly: boolean; freshBlindedComparisons: number }
		prohibitions: Record<string, boolean | string[]>
	}>(candidateRoot, "review-v2-authorization.json")
	const frontier = await readJson<{
		entries: Array<{
			file: string
			baseline: Record<string, { rgb: number[] }> & { gradient: { isGradient: boolean } }
			candidate: Record<string, { rgb: number[] }> & { gradient: { isGradient: boolean } }
		}>
	}>(candidateRoot, "frontier.json")
	const frontierByFile = new Map(frontier.entries.map((entry) => [entry.file, entry]))
	const visible = (palette: { roles: Record<string, { rgb: number[] }>; gradient: { isGradient: boolean } }) => ({
		roles: Object.fromEntries(["background", "foreground", "surface", "accent"].map((role) =>
			[role, palette.roles[role].rgb])),
		gradient: palette.gradient.isGradient,
	})
	const expected = (palette: Record<string, { rgb: number[] }> & { gradient: { isGradient: boolean } }) => ({
		roles: Object.fromEntries(["background", "foreground", "surface", "accent"].map((role) =>
			[role, palette[role].rgb])),
		gradient: palette.gradient.isGradient,
	})

	assert.equal(manifest.experimentId, candidateId)
	assert.equal(manifest.presentationVersion, "next-palette-review-presentation-2")
	assert.equal(manifest.candidateAlgorithmVersion, "joint-palette-threshold-free-collapse-0.1.0-development")
	assert.equal(manifest.entries.length, 2)
	assert.equal(feedback.entries.length, 2)
	assert.equal(plan.status, "targeted-threshold-free-collapse-review-authorized")
	assert.deepEqual(plan.scope,
		{ freshBlindedComparisons: 2, exactPositiveTransfers: 1, totalBatches: 1, diagnosticOnly: true })
	assert.deepEqual(plan.manifestIds, [manifest.manifestId])
	assert.equal(authorization.experimentId, candidateId)
	assert.deepEqual(authorization.review,
		{ authorized: true, diagnosticOnly: true, thresholdFreeAuditedCollapsesOnly: true, freshBlindedComparisons: 2 })
	assert.equal(authorization.prohibitions.broaderReviewAuthorized, false)
	assert.equal(authorization.prohibitions.canonicalPromotionAuthorized, false)
	assert.equal(authorization.prohibitions.candidateFreezeAuthorized, false)
	assert.equal(authorization.prohibitions.reserveAccessAuthorized, false)
	assert.deepEqual(authorization.prohibitions.outputUnseenRootsOpened, [])

	for (const entry of manifest.entries) {
		const source = frontierByFile.get(entry.source.file)
		assert.ok(source)
		assert.deepEqual(entry.changedRoles, ["surface"])
		assert.equal(entry.gradientChanged, true)
		for (const option of ["A", "B"] as const) {
			const palette = entry.assignment[option] === "baseline" ? source.baseline : source.candidate
			assert.deepEqual(visible(entry.options[option]), expected(palette))
		}
	}
	for (const [file, hash] of Object.entries(manifest.provenance.experiment)) {
		assert.equal(sha256(await readFile(resolve(candidateRoot, file))), hash, file)
	}
	for (const [file, hash] of Object.entries({ ...manifest.provenance.implementation, ...manifest.provenance.presentation })) {
		assert.equal(sha256(await readFile(resolve(projectRoot, file))), hash, file)
	}
})

test("completed threshold-free review validates admissibility but rejects replacement ranking", async () => {
	const analysis = await readJson<{
		manifestId: string
		provenance: { manifestSha256: string; feedbackSha256: string; analyzerSha256: string }
		coverage: { expected: number; submitted: number; eligible: number; ineligible: number; complete: boolean }
		quality: { baseline: Record<string, number>; candidate: Record<string, number>; paired: Record<string, number> }
		comparison: Record<string, number>
	}>(reviewRoot, "batch-01-analysis.json")
	const interpretation = await readJson<{
		reviewManifestId: string
		provenance: Record<string, string>
		policy: Record<string, boolean>
		summary: Record<string, number>
		entries: Array<{ candidateQuality: string; comparison: string; evidenceOrigin: string }>
		successCriteria: Record<string, boolean>
		disposition: Record<string, boolean | string | string[]>
		nextStep: { candidateOrReviewAuthorized: boolean; action: string }
	}>(reviewRoot, "interpretation.json")
	const manifestBytes = await readFile(resolve(reviewRoot, "batch-01-manifest.json"))
	const feedbackBytes = await readFile(resolve(reviewRoot, "batch-01-feedback.json"))

	assert.equal(analysis.manifestId, interpretation.reviewManifestId)
	assert.deepEqual(analysis.coverage, { expected: 2, submitted: 2, eligible: 2, ineligible: 0, complete: true })
	assert.deepEqual(analysis.quality.baseline, { strong: 2 })
	assert.deepEqual(analysis.quality.candidate, { strong: 2 })
	assert.deepEqual(analysis.quality.paired, { "both-positive": 2 })
	assert.deepEqual(analysis.comparison, { "baseline-stronger": 2 })
	assert.equal(analysis.provenance.manifestSha256, sha256(manifestBytes))
	assert.equal(analysis.provenance.feedbackSha256, sha256(feedbackBytes))
	assert.equal(analysis.provenance.analyzerSha256,
		sha256(await readFile(resolve(projectRoot, "research/analyze-next-palette-review-v2.ts"))))
	assert.deepEqual(interpretation.summary, {
		freshReviewed: 2,
		exactTransfers: 1,
		combinedEvaluated: 3,
		candidatePositive: 3,
		candidateWeakOrUnacceptable: 0,
		candidateStronger: 1,
		baselineStronger: 2,
		bothPositiveFresh: 2,
	})
	assert.equal(interpretation.entries.filter((entry) => entry.evidenceOrigin === "fresh-review").length, 2)
	assert.equal(interpretation.entries.filter((entry) => entry.evidenceOrigin === "exact-transfer").length, 1)
	assert.ok(interpretation.entries.every((entry) =>
		entry.candidateQuality === "strong" || entry.candidateQuality === "acceptable-not-ideal"))
	assert.equal(interpretation.policy.commentsDoNotEnterInference, true)
	assert.equal(interpretation.policy.targetColorsInferred, false)
	assert.equal(interpretation.successCriteria.noWeakOrUnacceptableCandidateJudgments, true)
	assert.equal(interpretation.successCriteria.noBaselineStrongerJudgments, false)
	assert.equal(interpretation.successCriteria.pass, false)
	assert.equal(interpretation.disposition.candidate,
		"stop-threshold-free-collapse-as-replacement-preserve-canonical-0.19")
	assert.equal(interpretation.disposition.admissibilityEvidenceRetained, true)
	assert.equal(interpretation.disposition.extractionChangeAuthorized, false)
	assert.equal(interpretation.disposition.freezeAuthorized, false)
	assert.equal(interpretation.disposition.promotionAuthorized, false)
	assert.equal(interpretation.disposition.broaderReviewAuthorized, false)
	assert.equal(interpretation.disposition.reserveAccessAuthorized, false)
	assert.equal(interpretation.nextStep.candidateOrReviewAuthorized, false)

	for (const [file, hash] of Object.entries(interpretation.provenance)) {
		const path = file === "analyzerSha256"
			? resolve(projectRoot, "research/analyze-joint-palette-threshold-free-collapse-review-v2.ts")
			: resolve(reviewRoot, file)
		assert.equal(sha256(await readFile(path)), hash, file)
	}
})
