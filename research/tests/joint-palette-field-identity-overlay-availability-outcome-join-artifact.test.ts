import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const auditVersion = "joint-palette-field-identity-overlay-availability-audit-0.1.0-development"
const joinVersion = "joint-palette-field-identity-overlay-availability-outcome-join-0.1.0-development"
const reviewVersion = "joint-palette-compact-relation-dominance-review-transfer-audit-0.1.0-development"
const auditId = "346bb149d85f8480806f8debc995bde9c66970a24a82d268dee70cf694c78ede"
const reviewId = "e6e9768f1dcbfca8d1bb19ad2ccb38a7120d4e7dc4f2ad300d3dead0eab65ba6"
const reviewManifestId = "46130c6056e551351d666c63abc1228cb17d160aca8fd136d30c2c6b10aeaf01"
const candidateId = "fa20d3ed4b6b2cac8c6162e8a753372493c68f925ff0fa9c353d70ad7819281c"
const auditRoot = resolve(projectRoot, `research/data/experiments/${auditVersion}`)
const joinRoot = resolve(projectRoot, `research/data/experiments/${joinVersion}`)
const reviewRoot = resolve(projectRoot, `research/data/experiments/${reviewVersion}/review-v2`)
const factors = ["A", "F", "P", "I", "R", "C"] as const
const outcomeClasses = [
	"candidate-stronger", "baseline-stronger", "both-similarly-valid", "ineligible-unassessed",
] as const

type Factor = typeof factors[number]
type OutcomeClass = typeof outcomeClasses[number]
type FactorStatus = { applicable: boolean; pass: boolean }
type JoinEntry = {
	file: string
	cohort: string
	sourceSha256: string
	caseId: string
	candidateStableKey: string | null
	outcomeClass: OutcomeClass
	assessment: null | { comparison: string; evidenceOrigin: string }
	ineligibility: null | { sourceEligibility: string; reason: string }
	factors: Record<Factor, FactorStatus>
	factorRoute: string
	predeclaredFrontier: boolean
}
type OutcomeJoin = {
	schemaVersion: number
	joinVersion: string
	joinId: string
	generatedAt: string
	auditExperimentId: string
	metricBeforeLabelBinding: Record<string, string | boolean>
	provenance: {
		artifacts: Record<string, string>
		reviewInterpretationBinding: {
			reviewExperimentId: string
			reviewManifestId: string
			candidateExperimentId: string
			reviewArtifacts: Record<string, string>
			candidateArtifacts: Record<string, string>
		}
	}
	sourceAccounting: {
		changedCases: number
		assessedOutcomes: number
		ineligibleUnassessedChangedCases: number
		complete: boolean
		transferIdentity: string
		outcomes: Record<OutcomeClass, number>
	}
	factorOutcomeReconciliation: Record<OutcomeClass, {
		cases: number
		factors: Record<Factor, { applicable: number; pass: number; fail: number; uncomparable: number }>
	}>
	predeclaredFrontier: {
		definition: string
		caseCount: number
		completeAndUnsampled: boolean
		outcomes: Record<OutcomeClass, number>
		noBaselineStronger: boolean
		predeclaredProspectiveArmPass: boolean
	}
	conclusions: Record<string, string | boolean>
	exploratoryOnly: Record<string, string | number | boolean>
	excludedInputs: { commentsEnteredJoin: boolean; targetColorsEnteredJoin: boolean }
	authorization: Record<string, boolean | string[]>
	entries: JoinEntry[]
}
type AuditEntry = {
	file: string
	source: { sha256: string }
	classification: string
	audit: null | { factors: Record<Factor, FactorStatus>; route: string; prospectiveArm: boolean }
}
type ReviewEntry = {
	file: string
	sourceSha256: string
	caseId: string
	candidateStableKey: string
	comparison: Exclude<OutcomeClass, "ineligible-unassessed">
	evidenceOrigin: string
}

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

function factorSummary(entries: readonly JoinEntry[]) {
	return Object.fromEntries(outcomeClasses.map((outcomeClass) => {
		const selected = entries.filter((entry) => entry.outcomeClass === outcomeClass)
		return [outcomeClass, {
			cases: selected.length,
			factors: Object.fromEntries(factors.map((factor) => {
				const applicable = selected.filter((entry) => entry.factors[factor].applicable).length
				const pass = selected.filter((entry) => entry.factors[factor].applicable && entry.factors[factor].pass).length
				return [factor, { applicable, pass, fail: applicable - pass, uncomparable: selected.length - applicable }]
			})),
		}]
	}))
}

test("post-hoc field identity outcome join is exact, append-only, provenance-bound, and non-authorizing", async () => {
	const outcome = await readJson<OutcomeJoin>(joinRoot, "outcome-join.json")
	const manifest = await readJson<{ experimentId: string; protocol: { hypothesisAncestry: {
		compactCandidateExperimentId: string } }; inputs: Record<string, { sha256: string }> }>(auditRoot, "manifest.json")
	const protocol = await readJson<{ experimentVersion: string; prospectiveFrozenWinnerArm: { definition: string } }>(
		auditRoot, "protocol.json")
	const analysis = await readJson<{ experimentId: string; structural: { pass: boolean; checks: Record<string, boolean> };
		matrix: Record<string, number>; factorial: { factorCounts: Record<string, unknown>; routeCounts: Record<string, number> };
		prospectiveArm: { files: string[] } }>(auditRoot, "analysis.json")
	const results = await readJson<{ experimentId: string; entries: AuditEntry[] }>(auditRoot, "results.json")
	const frontier = await readJson<{ experimentId: string; entries: Array<{ file: string; source: { sha256: string } }> }>(
		auditRoot, "frontier.json")
	const interpretation = await readJson<{
		experimentId: string
		candidateExperimentId: string
		reviewManifestId: string
		provenance: Record<string, string>
		policy: { commentsDoNotEnterInference: boolean; targetColorsConsumed: boolean }
		entries: ReviewEntry[]
		unassessedChangedCases: Array<{ file: string; sourceSha256: string; caseId: string;
			sourceEligibility: string; reason: string }>
	}>(reviewRoot, "interpretation.json")

	assert.equal(outcome.schemaVersion, 1)
	assert.equal(outcome.joinVersion, joinVersion)
	assert.equal(outcome.auditExperimentId, auditId)
	assert.equal(manifest.experimentId, auditId)
	assert.equal(analysis.experimentId, auditId)
	assert.equal(results.experimentId, auditId)
	assert.equal(frontier.experimentId, auditId)
	assert.equal(protocol.experimentVersion, auditVersion)
	assert.equal(manifest.protocol.hypothesisAncestry.compactCandidateExperimentId, candidateId)
	assert.equal(analysis.structural.pass, true)
	assert.equal(Object.values(analysis.structural.checks).every(Boolean), true)
	assert.deepEqual(analysis.matrix, { total: 392, development: 37, cohort00: 355, changed: 18, canonicalFallback: 374 })
	assert.equal(Object.keys(analysis.factorial.routeCounts).length, 64)
	assert.equal(Object.values(analysis.factorial.routeCounts).reduce((sum, count) => sum + count, 0), 18)

	const { joinId: _joinId, generatedAt: _generatedAt, ...joinIdentity } = outcome
	assert.equal(outcome.joinId, sha256(JSON.stringify(canonicalValue(joinIdentity))))
	assert.equal(outcome.metricBeforeLabelBinding.exact, true)
	assert.equal(outcome.metricBeforeLabelBinding.metricArtifactPath,
		`research/data/experiments/${auditVersion}/results.json`)
	assert.equal(outcome.metricBeforeLabelBinding.metricArtifactSha256,
		sha256(await readFile(resolve(auditRoot, "results.json"))))
	assert.equal(outcome.metricBeforeLabelBinding.metricArtifactSetValidatedBeforeInterpretationRead, true)
	assert.equal(outcome.metricBeforeLabelBinding.interpretationReadOnlyAfterMetricValidation, true)
	assert.equal(outcome.metricBeforeLabelBinding.labelFreeAuditRemainsUnmodified, true)
	assert.equal(outcome.metricBeforeLabelBinding.postHocJoin, true)

	const expectedDirectPaths = [
		`research/data/experiments/${auditVersion}/manifest.json`,
		`research/data/experiments/${auditVersion}/protocol.json`,
		`research/data/experiments/${auditVersion}/analysis.json`,
		`research/data/experiments/${auditVersion}/results.json`,
		`research/data/experiments/${auditVersion}/frontier.json`,
		`research/data/experiments/${reviewVersion}/review-v2/interpretation.json`,
		"research/NEXT_PALETTE_JOINT_INFERENCE_PLAN.md",
		"research/analyze-joint-palette-field-identity-overlay-availability-audit.ts",
	]
	assert.deepEqual(Object.keys(outcome.provenance.artifacts), expectedDirectPaths)
	for (const [file, expected] of Object.entries(outcome.provenance.artifacts)) {
		assert.match(expected, /^[a-f0-9]{64}$/)
		assert.equal(sha256(await readFile(resolve(projectRoot, file))), expected, file)
	}
	const analyzerSource = await readFile(resolve(projectRoot, expectedDirectPaths[7]), "utf8")
	assert.match(analyzerSource, /writeFile\(outputPath,[\s\S]*\{ flag: "wx" \}\)/)
	assert.ok(analyzerSource.indexOf("const interpretation = await source<ReviewInterpretation>") >
		analyzerSource.indexOf("Audit predeclared frontier changed"))
	assert.equal(outcome.provenance.artifacts[expectedDirectPaths[0]],
		"5cd25ccc91100df221c5c6361fb3807c2df733f6315a253bf46aa117a13bbf1f")
	assert.equal(outcome.provenance.artifacts[expectedDirectPaths[1]],
		"81c913d2914717c0bd338ff45db8261ebc7d2136bba90b4ed6a6867d23a71d14")
	assert.equal(outcome.provenance.artifacts[expectedDirectPaths[2]],
		"a8e48a6a3af492def45372e7bb81c0e994a4fc372c01128845acaa241832d197")
	assert.equal(outcome.provenance.artifacts[expectedDirectPaths[3]],
		"255f231e2f594bd1d50ca775f6b8d8e22ed941b43e2fa62de6a2e4668fa4a912")
	assert.equal(outcome.provenance.artifacts[expectedDirectPaths[4]],
		"2c8b01f2b0753ff9caa7fb57dd2f962790a9257df1b5b224086a1bc6dcd7a22f")
	assert.equal(outcome.provenance.artifacts[expectedDirectPaths[5]],
		"f04f355c40f85b44356a53194ca6f8c26da2dba8b124786e19ab7cddcafa8773")
	assert.equal(outcome.provenance.artifacts[expectedDirectPaths[6]],
		"e699edab3a62b3aa0bcd993cd9cd34f12089e536e2ff8122a6fe89187d6d6a59")

	const reviewBinding = outcome.provenance.reviewInterpretationBinding
	assert.equal(reviewBinding.reviewExperimentId, reviewId)
	assert.equal(reviewBinding.reviewManifestId, reviewManifestId)
	assert.equal(reviewBinding.candidateExperimentId, candidateId)
	assert.equal(interpretation.experimentId, reviewBinding.reviewExperimentId)
	assert.equal(interpretation.reviewManifestId, reviewBinding.reviewManifestId)
	assert.equal(interpretation.candidateExperimentId, reviewBinding.candidateExperimentId)
	assert.equal(interpretation.policy.commentsDoNotEnterInference, true)
	assert.equal(interpretation.policy.targetColorsConsumed, false)
	for (const bindings of [reviewBinding.reviewArtifacts, reviewBinding.candidateArtifacts]) {
		for (const [file, expected] of Object.entries(bindings)) {
			assert.match(expected, /^[a-f0-9]{64}$/)
			assert.equal(sha256(await readFile(resolve(projectRoot, file))), expected, file)
		}
	}
	assert.deepEqual(Object.keys(reviewBinding.reviewArtifacts), [
		`research/data/experiments/${reviewVersion}/review-v2/batch-01-analysis.json`,
		`research/data/experiments/${reviewVersion}/review-v2/batch-01-manifest.json`,
		`research/data/experiments/${reviewVersion}/review-v2/batch-01-feedback.json`,
	])
	assert.deepEqual(Object.keys(reviewBinding.candidateArtifacts), ["manifest", "protocol", "analysis", "results", "frontier"]
		.map((name) => `research/data/experiments/joint-palette-compact-relation-dominance-0.1.0-development/${name}.json`))
	for (const name of ["Manifest", "Protocol", "Analysis", "Results", "Frontier"]) {
		const path = `research/data/experiments/joint-palette-compact-relation-dominance-0.1.0-development/${name.toLowerCase()}.json`
		assert.equal(manifest.inputs[`compactCandidate${name}`].sha256, reviewBinding.candidateArtifacts[path], name)
	}

	assert.deepEqual(outcome.sourceAccounting, {
		changedCases: 18,
		assessedOutcomes: 17,
		ineligibleUnassessedChangedCases: 1,
		complete: true,
		transferIdentity: "exact-source-sha256-and-candidate-stable-key-where-present",
		outcomes: {
			"candidate-stronger": 5,
			"baseline-stronger": 4,
			"both-similarly-valid": 8,
			"ineligible-unassessed": 1,
		},
	})
	assert.equal(outcome.entries.length, 18)
	assert.equal(new Set(outcome.entries.map((entry) => entry.sourceSha256)).size, 18)
	const changed = results.entries.filter((entry) => entry.classification === "compact-changed-candidate")
	const changedBySha = new Map(changed.map((entry) => [entry.source.sha256, entry]))
	const reviewedBySha = new Map(interpretation.entries.map((entry) => [entry.sourceSha256, entry]))
	const unassessedBySha = new Map(interpretation.unassessedChangedCases.map((entry) => [entry.sourceSha256, entry]))
	assert.equal(changed.length, 18)
	assert.equal(reviewedBySha.size, 17)
	assert.equal(unassessedBySha.size, 1)
	for (const entry of outcome.entries) {
		const metric = changedBySha.get(entry.sourceSha256)
		assert.ok(metric?.audit, entry.file)
		assert.equal(entry.file, metric.file)
		assert.deepEqual(entry.factors, Object.fromEntries(factors.map((factor) => [factor, {
			applicable: metric.audit!.factors[factor].applicable,
			pass: metric.audit!.factors[factor].pass,
		}])), entry.file)
		assert.equal(entry.factorRoute, metric.audit.route)
		assert.equal(entry.predeclaredFrontier, metric.audit.prospectiveArm)
		const reviewed = reviewedBySha.get(entry.sourceSha256)
		const unassessed = unassessedBySha.get(entry.sourceSha256)
		assert.equal(Boolean(reviewed) !== Boolean(unassessed), true, entry.file)
		if (reviewed) {
			assert.equal(entry.file, reviewed.file)
			assert.equal(entry.caseId, reviewed.caseId)
			assert.equal(entry.candidateStableKey, reviewed.candidateStableKey)
			assert.equal(entry.outcomeClass, reviewed.comparison)
			assert.equal(entry.assessment?.evidenceOrigin, reviewed.evidenceOrigin)
			assert.equal(entry.ineligibility, null)
		} else {
			assert.equal(entry.file, unassessed!.file)
			assert.equal(entry.caseId, unassessed!.caseId)
			assert.equal(entry.candidateStableKey, null)
			assert.equal(entry.outcomeClass, "ineligible-unassessed")
			assert.equal(entry.assessment, null)
			assert.deepEqual(entry.ineligibility, {
				sourceEligibility: unassessed!.sourceEligibility,
				reason: unassessed!.reason,
			})
		}
	}
	assert.deepEqual(outcome.factorOutcomeReconciliation, factorSummary(outcome.entries))
	assert.deepEqual(Object.fromEntries(factors.map((factor) => [factor, {
		applicable: outcome.entries.filter((entry) => entry.factors[factor].applicable).length,
		pass: outcome.entries.filter((entry) => entry.factors[factor].applicable && entry.factors[factor].pass).length,
		fail: outcome.entries.filter((entry) => entry.factors[factor].applicable && !entry.factors[factor].pass).length,
		uncomparable: outcome.entries.filter((entry) => !entry.factors[factor].applicable).length,
	}])), analysis.factorial.factorCounts)

	assert.equal(outcome.predeclaredFrontier.definition, protocol.prospectiveFrozenWinnerArm.definition)
	assert.equal(outcome.predeclaredFrontier.caseCount, 4)
	assert.equal(outcome.predeclaredFrontier.completeAndUnsampled, true)
	assert.deepEqual(outcome.predeclaredFrontier.outcomes, {
		"candidate-stronger": 2,
		"baseline-stronger": 1,
		"both-similarly-valid": 1,
		"ineligible-unassessed": 0,
	})
	assert.equal(outcome.predeclaredFrontier.noBaselineStronger, false)
	assert.equal(outcome.predeclaredFrontier.predeclaredProspectiveArmPass, false)
	assert.deepEqual(outcome.entries.filter((entry) => entry.predeclaredFrontier)
		.map((entry) => [entry.file, entry.outcomeClass]), [
			["00/ab67616d00001e020000c59b1facbb9e2d899099.jpg", "candidate-stronger"],
			["00/ab67616d00001e020000f9630b0ca16731b1a3f5.jpg", "candidate-stronger"],
			["00/ab67616d0000b27300003732606221eb423e62d8.jpg", "baseline-stronger"],
			["00/ab67616d0000b2730000ff6b67e0ed4e179ad867.jpg", "both-similarly-valid"],
		].sort((first, second) => first[0]!.localeCompare(second[0]!)))
	assert.deepEqual(new Set(frontier.entries.map((entry) => entry.source.sha256)),
		new Set(outcome.entries.filter((entry) => entry.predeclaredFrontier).map((entry) => entry.sourceSha256)))

	assert.equal(outcome.conclusions.auditMechanicallyValid, true)
	assert.equal(outcome.conclusions.predeclaredArmAcceptedAsSufficientRankingAuthority, false)
	assert.equal(outcome.conclusions.predeclaredArmDisposition, "rejected-as-sufficient-ranking-authority")
	assert.equal(outcome.conclusions.fieldOnlyFrozenOverlayLineDisposition,
		"exhausted-under-currently-validated-mechanisms")
	assert.equal(outcome.conclusions.canonicalPreserved, "region-graph-0.19.0")
	assert.deepEqual(outcome.excludedInputs, { commentsEnteredJoin: false, targetColorsEnteredJoin: false })
	assert.equal("comments" in outcome, false)
	assert.equal("targetColors" in outcome, false)
	assert.equal(outcome.exploratoryOnly.postHocHStatus, "exploratory-only")
	assert.equal(outcome.exploratoryOnly.alternateFactorCombinationsStatus, "exploratory-only")
	assert.equal(outcome.exploratoryOnly.factorialCellUniverse, 64)
	assert.equal(outcome.exploratoryOnly.replacementGateSelectionAuthorized, false)
	assert.equal(outcome.exploratoryOnly.newIndependentProspectiveEvidenceRequired, true)
	assert.match(String(outcome.exploratoryOnly.interpretation),
		/cannot be selected from the 64 cells as a replacement gate without new independent prospective evidence/)
	for (const prohibition of [
		"selectorAuthorized", "selectorImplemented", "candidateAuthorized", "candidateMutationAuthorized",
		"reviewAuthorized", "extractionChangeAuthorized", "freezeAuthorized", "promotionAuthorized",
		"broaderReviewAuthorized", "reserveAccessAuthorized",
	]) assert.equal(outcome.authorization[prohibition], false, prohibition)
	assert.deepEqual(outcome.authorization.outputUnseenRootsOpened, [])
})
