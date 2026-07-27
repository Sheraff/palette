import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"

const AUDIT_VERSION = "joint-palette-field-identity-overlay-availability-audit-0.1.0-development"
const AUDIT_EXPERIMENT_ID = "346bb149d85f8480806f8debc995bde9c66970a24a82d268dee70cf694c78ede"
const REVIEW_VERSION = "joint-palette-compact-relation-dominance-review-transfer-audit-0.1.0-development"
const REVIEW_EXPERIMENT_ID = "e6e9768f1dcbfca8d1bb19ad2ccb38a7120d4e7dc4f2ad300d3dead0eab65ba6"
const REVIEW_MANIFEST_ID = "46130c6056e551351d666c63abc1228cb17d160aca8fd136d30c2c6b10aeaf01"
const CANDIDATE_VERSION = "joint-palette-compact-relation-dominance-0.1.0-development"
const CANDIDATE_EXPERIMENT_ID = "fa20d3ed4b6b2cac8c6162e8a753372493c68f925ff0fa9c353d70ad7819281c"
const JOIN_VERSION = "joint-palette-field-identity-overlay-availability-outcome-join-0.1.0-development"
const CANONICAL_VERSION = "region-graph-0.19.0"
const factors = ["A", "F", "P", "I", "R", "C"] as const
const outcomeClasses = [
	"candidate-stronger", "baseline-stronger", "both-similarly-valid", "ineligible-unassessed",
] as const

const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = join(researchRoot, "..")
const auditRoot = join(researchRoot, "data/experiments", AUDIT_VERSION)
const joinRoot = join(researchRoot, "data/experiments", JOIN_VERSION)
const reviewRoot = join(researchRoot, "data/experiments", REVIEW_VERSION, "review-v2")
const analyzerPath = fileURLToPath(import.meta.url)
const outputPath = join(joinRoot, "outcome-join.json")
const jointPlanPath = join(researchRoot, "NEXT_PALETTE_JOINT_INFERENCE_PLAN.md")

const auditPaths = {
	manifest: join(auditRoot, "manifest.json"),
	protocol: join(auditRoot, "protocol.json"),
	analysis: join(auditRoot, "analysis.json"),
	results: join(auditRoot, "results.json"),
	frontier: join(auditRoot, "frontier.json"),
} as const
const projectPaths = {
	manifest: `research/data/experiments/${AUDIT_VERSION}/manifest.json`,
	protocol: `research/data/experiments/${AUDIT_VERSION}/protocol.json`,
	analysis: `research/data/experiments/${AUDIT_VERSION}/analysis.json`,
	results: `research/data/experiments/${AUDIT_VERSION}/results.json`,
	frontier: `research/data/experiments/${AUDIT_VERSION}/frontier.json`,
	interpretation: `research/data/experiments/${REVIEW_VERSION}/review-v2/interpretation.json`,
	jointPlan: "research/NEXT_PALETTE_JOINT_INFERENCE_PLAN.md",
	analyzer: "research/analyze-joint-palette-field-identity-overlay-availability-audit.ts",
} as const
const expectedFrozenHashes = {
	manifest: "5cd25ccc91100df221c5c6361fb3807c2df733f6315a253bf46aa117a13bbf1f",
	protocol: "81c913d2914717c0bd338ff45db8261ebc7d2136bba90b4ed6a6867d23a71d14",
	analysis: "a8e48a6a3af492def45372e7bb81c0e994a4fc372c01128845acaa241832d197",
	results: "255f231e2f594bd1d50ca775f6b8d8e22ed941b43e2fa62de6a2e4668fa4a912",
	frontier: "2c8b01f2b0753ff9caa7fb57dd2f962790a9257df1b5b224086a1bc6dcd7a22f",
	interpretation: "f04f355c40f85b44356a53194ca6f8c26da2dba8b124786e19ab7cddcafa8773",
	jointPlan: "e699edab3a62b3aa0bcd993cd9cd34f12089e536e2ff8122a6fe89187d6d6a59",
} as const

type Factor = typeof factors[number]
type OutcomeClass = typeof outcomeClasses[number]
type FactorStatus = { applicable: boolean; pass: boolean }
type AuditEntry = {
	cohort: "development" | "00"
	file: string
	source: { sha256: string; bytes: number }
	classification: "compact-changed-candidate" | "canonical-fallback"
	candidateEligibility: { pass: boolean }
	audit: null | {
		factors: Record<Factor, FactorStatus>
		bits: Record<Factor, boolean>
		route: string
		qualifyingBranches: string[]
		prospectiveArm: boolean
	}
	structural: { violations: string[] }
}
type AuditProtocol = {
	experimentVersion: string
	hypothesisAncestry: { compactCandidateExperimentId: string; factorialAuditExperimentId: string }
	authorization: Record<string, unknown>
	independence: { forbiddenDirectInputs: string[] }
	prospectiveFrozenWinnerArm: { predeclaredInImplementation: boolean; definition: string; completeAndUnsampled: boolean }
	stoppingRules: Record<string, unknown>
}
type AuditManifest = {
	experimentVersion: string
	experimentId: string
	generatedAt: string
	protocol: AuditProtocol
	policy: { factorOrder: string[] }
	inputs: Record<string, { path: string; sha256: string }>
}
type AuditAnalysis = {
	experimentId: string
	structural: { pass: boolean; violationCount: number; caseCount: number; checks: Record<string, boolean> }
	matrix: { total: number; development: number; cohort00: number; changed: number; canonicalFallback: number }
	factorial: {
		factorCounts: Record<Factor, { applicable: number; pass: number; fail: number; uncomparable: number }>
		routeCounts: Record<string, number>
		conjunctiveCounts: { prospectiveArm: number }
	}
	prospectiveArm: { definition: string; count: number; files: string[]; complete: boolean; sampled: boolean }
	outcome: { permitsLaterOutcomeJoin: boolean; authorizedByThisAudit: boolean; selectorImplemented: boolean }
}
type AuditFrontier = {
	experimentId: string
	definition: string
	structuralStoppingRulesPass: boolean
	complete: boolean
	sampling: null
	entries: Array<{
		file: string
		source: { path: string; sha256: string; bytes: number }
		factorBits: Record<Factor, boolean>
		factorApplicability: Record<Factor, boolean>
		qualifyingBranches: string[]
	}>
}
type ReviewOutcome = {
	file: string
	sourceSha256: string
	caseId: string
	candidateStableKey: string
	baselineQuality: string
	candidateQuality: string
	comparison: Exclude<OutcomeClass, "ineligible-unassessed">
	evidenceOrigin: "fresh-review" | "exact-transfer"
}
type UnassessedOutcome = {
	file: string
	sourceSha256: string
	caseId: string
	sourceEligibility: string
	reason: string
}
type ReviewInterpretation = {
	experimentId: string
	candidateExperimentId: string
	reviewManifestId: string
	provenance: Record<string, string>
	policy: { commentsDoNotEnterInference: boolean; targetColorsConsumed: boolean }
	transferAccounting: Record<string, number | boolean>
	summary: {
		combinedAssessedComparisons: number
		candidatePositive: number
		candidateWeakOrUnacceptable: number
		candidateStronger: number
		baselineStronger: number
		bothSimilarlyValid: number
		unassessedIneligibleChangedCases: number
	}
	entries: ReviewOutcome[]
	unassessedChangedCases: UnassessedOutcome[]
	successCriteria: { completeChangedSetAccounting: boolean; noBaselineStrongerJudgments: boolean; pass: boolean }
	disposition: {
		canonicalPreserved: string
		positiveNonexclusiveAlternativeEvidence: Array<{
			file: string; sourceSha256: string; candidateStableKey: string; evidenceOrigin: string
		}>
		exactPreferredTupleEvidence: Array<{
			file: string; sourceSha256: string; candidateStableKey: string; evidenceOrigin: string
		}>
	}
}
type JoinEntry = {
	file: string
	cohort: "development" | "00"
	sourceSha256: string
	caseId: string
	candidateStableKey: string | null
	outcomeClass: OutcomeClass
	assessment: null | {
		baselineQuality: string
		candidateQuality: string
		comparison: Exclude<OutcomeClass, "ineligible-unassessed">
		evidenceOrigin: "fresh-review" | "exact-transfer"
	}
	ineligibility: null | { sourceEligibility: string; reason: string }
	factors: Record<Factor, FactorStatus>
	factorRoute: string
	predeclaredFrontier: boolean
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

async function source<T>(path: string): Promise<{ raw: Buffer; value: T; sha256: string }> {
	const raw = await readFile(path)
	return { raw, value: JSON.parse(raw.toString("utf8")) as T, sha256: sha256(raw) }
}

function requireEvidence(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

function sameSet(first: Iterable<string>, second: Iterable<string>): boolean {
	const firstSet = new Set(first)
	const secondSet = new Set(second)
	return firstSet.size === secondSet.size && [...firstSet].every((value) => secondSet.has(value))
}

function factorRoute(bits: Record<Factor, boolean>): string {
	return factors.map((factor) => `${factor}${Number(bits[factor])}`).join("")
}

function factorOutcomeSummary(entries: readonly JoinEntry[]) {
	return Object.fromEntries(outcomeClasses.map((outcomeClass) => {
		const selected = entries.filter((entry) => entry.outcomeClass === outcomeClass)
		return [outcomeClass, {
			cases: selected.length,
			factors: Object.fromEntries(factors.map((factor) => {
				const applicable = selected.filter((entry) => entry.factors[factor].applicable).length
				const pass = selected.filter((entry) => entry.factors[factor].applicable && entry.factors[factor].pass).length
				return [factor, {
					applicable,
					pass,
					fail: applicable - pass,
					uncomparable: selected.length - applicable,
				}]
			})),
		}]
	}))
}

if (process.argv.slice(2).length > 0) {
	throw new Error("analyze-joint-palette-field-identity-overlay-availability-audit.ts does not accept arguments")
}

// Load and validate the complete frozen metric set before opening the outcome source.
await Promise.all(Object.values(auditPaths).map((path) => access(path)))
const [manifest, protocol, analysis, results, frontier, jointPlan, analyzer] = await Promise.all([
	source<AuditManifest>(auditPaths.manifest),
	source<AuditProtocol>(auditPaths.protocol),
	source<AuditAnalysis>(auditPaths.analysis),
	source<{ experimentId: string; entries: AuditEntry[] }>(auditPaths.results),
	source<AuditFrontier>(auditPaths.frontier),
	readFile(jointPlanPath),
	readFile(analyzerPath),
])
for (const name of Object.keys(auditPaths) as Array<keyof typeof auditPaths>) {
	requireEvidence({ manifest, protocol, analysis, results, frontier }[name].sha256 === expectedFrozenHashes[name],
		`Frozen audit ${name} hash changed`)
}
requireEvidence(sha256(jointPlan) === expectedFrozenHashes.jointPlan, "Joint inference plan hash changed")
requireEvidence(manifest.value.experimentVersion === AUDIT_VERSION && protocol.value.experimentVersion === AUDIT_VERSION &&
	manifest.value.experimentId === AUDIT_EXPERIMENT_ID && isDeepStrictEqual(manifest.value.protocol, protocol.value),
"Audit manifest/protocol identity changed")
const { experimentId: _experimentId, generatedAt: _generatedAt, ...manifestIdentity } = manifest.value
requireEvidence(sha256(JSON.stringify(canonicalValue(manifestIdentity))) === AUDIT_EXPERIMENT_ID,
	"Audit experiment ID is stale")
requireEvidence(protocol.value.hypothesisAncestry.compactCandidateExperimentId === CANDIDATE_EXPERIMENT_ID &&
	protocol.value.prospectiveFrozenWinnerArm.predeclaredInImplementation &&
	protocol.value.prospectiveFrozenWinnerArm.completeAndUnsampled &&
	protocol.value.authorization.labelsJoined === false && protocol.value.authorization.selectorImplemented === false &&
	protocol.value.authorization.selectorAuthorized === false && protocol.value.authorization.outcomeJoinAuthorized === false &&
	protocol.value.stoppingRules.noAuthorizationGranted === true &&
	protocol.value.independence.forbiddenDirectInputs.includes("source-roots-10-through-14"),
"Audit ancestry, independence, or non-authorization changed")
requireEvidence(isDeepStrictEqual(manifest.value.policy.factorOrder, factors), "Audit factor order changed")
for (const artifact of [analysis.value, results.value, frontier.value]) {
	requireEvidence(artifact.experimentId === AUDIT_EXPERIMENT_ID, "Audit artifact experiment ID changed")
}
requireEvidence(analysis.value.structural.pass && analysis.value.structural.violationCount === 0 &&
	analysis.value.structural.caseCount === 0 && Object.values(analysis.value.structural.checks).every(Boolean) &&
	isDeepStrictEqual(analysis.value.matrix,
		{ total: 392, development: 37, cohort00: 355, changed: 18, canonicalFallback: 374 }) &&
	analysis.value.prospectiveArm.count === 4 && analysis.value.prospectiveArm.complete && !analysis.value.prospectiveArm.sampled &&
	analysis.value.outcome.permitsLaterOutcomeJoin && !analysis.value.outcome.authorizedByThisAudit &&
	!analysis.value.outcome.selectorImplemented,
"Frozen audit structural or arm accounting changed")

const changed = results.value.entries.filter((entry) => entry.classification === "compact-changed-candidate")
const fallbacks = results.value.entries.filter((entry) => entry.classification === "canonical-fallback")
requireEvidence(results.value.entries.length === 392 && changed.length === 18 && fallbacks.length === 374 &&
	new Set(results.value.entries.map((entry) => entry.file)).size === 392 &&
	new Set(changed.map((entry) => entry.source.sha256)).size === 18 &&
	results.value.entries.every((entry) => entry.structural.violations.length === 0),
"Audit complete source accounting changed")
const computedFactorCounts = Object.fromEntries(factors.map((factor) => {
	const applicable = changed.filter((entry) => entry.audit!.factors[factor].applicable).length
	const pass = changed.filter((entry) => entry.audit!.bits[factor]).length
	return [factor, { applicable, pass, fail: applicable - pass, uncomparable: changed.length - applicable }]
}))
requireEvidence(changed.every((entry) => entry.audit && entry.candidateEligibility.pass &&
	factors.every((factor) => entry.audit!.bits[factor] ===
		(entry.audit!.factors[factor].applicable && entry.audit!.factors[factor].pass)) &&
	entry.audit.route === factorRoute(entry.audit.bits)) &&
	isDeepStrictEqual(computedFactorCounts, analysis.value.factorial.factorCounts) &&
	Object.keys(analysis.value.factorial.routeCounts).length === 64 &&
	Object.values(analysis.value.factorial.routeCounts).reduce((sum, count) => sum + count, 0) === 18,
"Audit factor accounting changed")
const prospective = changed.filter((entry) => entry.audit!.prospectiveArm)
requireEvidence(frontier.value.complete && frontier.value.sampling === null && frontier.value.structuralStoppingRulesPass &&
	frontier.value.definition === protocol.value.prospectiveFrozenWinnerArm.definition &&
	frontier.value.definition === analysis.value.prospectiveArm.definition &&
	frontier.value.entries.length === 4 && analysis.value.factorial.conjunctiveCounts.prospectiveArm === 4 &&
	sameSet(frontier.value.entries.map((entry) => entry.source.sha256), prospective.map((entry) => entry.source.sha256)) &&
	sameSet(frontier.value.entries.map((entry) => entry.file), analysis.value.prospectiveArm.files),
"Audit predeclared frontier changed")

const metricArtifactSetValidatedBeforeInterpretationRead = true
const interpretation = await source<ReviewInterpretation>(join(reviewRoot, "interpretation.json"))
requireEvidence(interpretation.sha256 === expectedFrozenHashes.interpretation,
	"Completed compact review interpretation hash changed")
requireEvidence(interpretation.value.experimentId === REVIEW_EXPERIMENT_ID &&
	interpretation.value.candidateExperimentId === CANDIDATE_EXPERIMENT_ID &&
	interpretation.value.reviewManifestId === REVIEW_MANIFEST_ID &&
	protocol.value.hypothesisAncestry.compactCandidateExperimentId === interpretation.value.candidateExperimentId,
"Review interpretation identity changed")
requireEvidence(interpretation.value.policy.commentsDoNotEnterInference &&
	interpretation.value.policy.targetColorsConsumed === false,
"Review interpretation does not exclude comments and target colors")
requireEvidence(isDeepStrictEqual(interpretation.value.summary, {
	combinedAssessedComparisons: 17,
	candidatePositive: 17,
	candidateWeakOrUnacceptable: 0,
	candidateStronger: 5,
	baselineStronger: 4,
	bothSimilarlyValid: 8,
	unassessedIneligibleChangedCases: 1,
}) && interpretation.value.entries.length === 17 && interpretation.value.unassessedChangedCases.length === 1 &&
	interpretation.value.transferAccounting.completeChangedSetCovered === true &&
	interpretation.value.successCriteria.completeChangedSetAccounting &&
	!interpretation.value.successCriteria.noBaselineStrongerJudgments && !interpretation.value.successCriteria.pass &&
	interpretation.value.disposition.canonicalPreserved === CANONICAL_VERSION,
"Review interpretation outcome accounting changed")

const candidateArtifactBindings = {
	manifest: `../../${CANDIDATE_VERSION}/manifest.json`,
	protocol: `../../${CANDIDATE_VERSION}/protocol.json`,
	analysis: `../../${CANDIDATE_VERSION}/analysis.json`,
	results: `../../${CANDIDATE_VERSION}/results.json`,
	frontier: `../../${CANDIDATE_VERSION}/frontier.json`,
} as const
for (const [name, reviewPath] of Object.entries(candidateArtifactBindings)) {
	const auditInput = manifest.value.inputs[`compactCandidate${name[0].toUpperCase()}${name.slice(1)}`]
	requireEvidence(auditInput?.sha256 === interpretation.value.provenance[reviewPath],
		`Audit and review candidate ${name} binding changed`)
}
requireEvidence(interpretation.value.provenance["../../../../NEXT_PALETTE_JOINT_INFERENCE_PLAN.md"] ===
	expectedFrozenHashes.jointPlan, "Review interpretation joint-plan binding changed")
for (const path of ["batch-01-analysis.json", "batch-01-manifest.json", "batch-01-feedback.json"]) {
	requireEvidence(/^[a-f0-9]{64}$/.test(interpretation.value.provenance[path] ?? ""),
		`Review interpretation ${path} binding is invalid`)
}

const assessedBySha = new Map(interpretation.value.entries.map((entry) => [entry.sourceSha256, entry]))
const unassessedBySha = new Map(interpretation.value.unassessedChangedCases.map((entry) => [entry.sourceSha256, entry]))
requireEvidence(assessedBySha.size === 17 && unassessedBySha.size === 1 &&
	[...assessedBySha.keys()].every((sourceSha256) => !unassessedBySha.has(sourceSha256)) &&
	sameSet(changed.map((entry) => entry.source.sha256), [...assessedBySha.keys(), ...unassessedBySha.keys()]) &&
	interpretation.value.entries.every((entry) => entry.candidateStableKey.length > 0 &&
		entry.file === changed.find((candidate) => candidate.source.sha256 === entry.sourceSha256)?.file) &&
	interpretation.value.unassessedChangedCases.every((entry) =>
		entry.file === changed.find((candidate) => candidate.source.sha256 === entry.sourceSha256)?.file),
"Outcome sources do not exactly cover the frozen changed set")
requireEvidence(new Set(interpretation.value.entries.map((entry) =>
	`${entry.sourceSha256}\0${entry.candidateStableKey}`)).size === 17,
"Assessed source/candidate stable identities are not unique")
const positiveEvidence = interpretation.value.disposition.positiveNonexclusiveAlternativeEvidence
const preferredEvidence = interpretation.value.disposition.exactPreferredTupleEvidence
requireEvidence(sameSet(positiveEvidence.map((entry) => `${entry.sourceSha256}\0${entry.candidateStableKey}`),
	interpretation.value.entries.map((entry) => `${entry.sourceSha256}\0${entry.candidateStableKey}`)) &&
	sameSet(preferredEvidence.map((entry) => `${entry.sourceSha256}\0${entry.candidateStableKey}`),
		interpretation.value.entries.filter((entry) => entry.comparison === "candidate-stronger")
			.map((entry) => `${entry.sourceSha256}\0${entry.candidateStableKey}`)),
"Interpretation disposition does not preserve exact source/candidate identities")

const frontierShas = new Set(frontier.value.entries.map((entry) => entry.source.sha256))
const entries: JoinEntry[] = changed.map((entry) => {
	const assessed = assessedBySha.get(entry.source.sha256)
	const unassessed = unassessedBySha.get(entry.source.sha256)
	requireEvidence(Boolean(assessed) !== Boolean(unassessed), `Outcome cardinality changed for ${entry.file}`)
	return {
		file: entry.file,
		cohort: entry.cohort,
		sourceSha256: entry.source.sha256,
		caseId: (assessed ?? unassessed)!.caseId,
		candidateStableKey: assessed?.candidateStableKey ?? null,
		outcomeClass: assessed?.comparison ?? "ineligible-unassessed",
		assessment: assessed ? {
			baselineQuality: assessed.baselineQuality,
			candidateQuality: assessed.candidateQuality,
			comparison: assessed.comparison,
			evidenceOrigin: assessed.evidenceOrigin,
		} : null,
		ineligibility: unassessed ? {
			sourceEligibility: unassessed.sourceEligibility,
			reason: unassessed.reason,
		} : null,
		factors: Object.fromEntries(factors.map((factor) => [factor, {
			applicable: entry.audit!.factors[factor].applicable,
			pass: entry.audit!.factors[factor].pass,
		}])) as Record<Factor, FactorStatus>,
		factorRoute: entry.audit!.route,
		predeclaredFrontier: frontierShas.has(entry.source.sha256),
	}
})
const outcomeCounts = {
	"candidate-stronger": entries.filter((entry) => entry.outcomeClass === "candidate-stronger").length,
	"baseline-stronger": entries.filter((entry) => entry.outcomeClass === "baseline-stronger").length,
	"both-similarly-valid": entries.filter((entry) => entry.outcomeClass === "both-similarly-valid").length,
	"ineligible-unassessed": entries.filter((entry) => entry.outcomeClass === "ineligible-unassessed").length,
}
requireEvidence(isDeepStrictEqual(outcomeCounts, {
	"candidate-stronger": 5,
	"baseline-stronger": 4,
	"both-similarly-valid": 8,
	"ineligible-unassessed": 1,
}), "Joined complete-set outcomes changed")
const frontierEntries = entries.filter((entry) => entry.predeclaredFrontier)
const frontierOutcomes = {
	"candidate-stronger": frontierEntries.filter((entry) => entry.outcomeClass === "candidate-stronger").length,
	"baseline-stronger": frontierEntries.filter((entry) => entry.outcomeClass === "baseline-stronger").length,
	"both-similarly-valid": frontierEntries.filter((entry) => entry.outcomeClass === "both-similarly-valid").length,
	"ineligible-unassessed": frontierEntries.filter((entry) => entry.outcomeClass === "ineligible-unassessed").length,
}
requireEvidence(isDeepStrictEqual(frontierOutcomes, {
	"candidate-stronger": 2,
	"baseline-stronger": 1,
	"both-similarly-valid": 1,
	"ineligible-unassessed": 0,
}), "Predeclared frontier outcomes changed")

const reviewArtifactBindings = {
	[`research/data/experiments/${REVIEW_VERSION}/review-v2/batch-01-analysis.json`]:
		interpretation.value.provenance["batch-01-analysis.json"],
	[`research/data/experiments/${REVIEW_VERSION}/review-v2/batch-01-manifest.json`]:
		interpretation.value.provenance["batch-01-manifest.json"],
	[`research/data/experiments/${REVIEW_VERSION}/review-v2/batch-01-feedback.json`]:
		interpretation.value.provenance["batch-01-feedback.json"],
}
const candidateBindings = Object.fromEntries(Object.entries(candidateArtifactBindings).map(([name, path]) => [
	`research/data/experiments/${CANDIDATE_VERSION}/${name}.json`, interpretation.value.provenance[path],
]))
const provenance = {
	artifacts: {
		[projectPaths.manifest]: manifest.sha256,
		[projectPaths.protocol]: protocol.sha256,
		[projectPaths.analysis]: analysis.sha256,
		[projectPaths.results]: results.sha256,
		[projectPaths.frontier]: frontier.sha256,
		[projectPaths.interpretation]: interpretation.sha256,
		[projectPaths.jointPlan]: sha256(jointPlan),
		[projectPaths.analyzer]: sha256(analyzer),
	},
	reviewInterpretationBinding: {
		reviewExperimentId: interpretation.value.experimentId,
		reviewManifestId: interpretation.value.reviewManifestId,
		candidateExperimentId: interpretation.value.candidateExperimentId,
		reviewArtifacts: reviewArtifactBindings,
		candidateArtifacts: candidateBindings,
	},
}
const identity = {
	schemaVersion: 1,
	joinVersion: JOIN_VERSION,
	auditExperimentId: AUDIT_EXPERIMENT_ID,
	metricBeforeLabelBinding: {
		exact: true,
		metricArtifactPath: projectPaths.results,
		metricArtifactSha256: results.sha256,
		metricArtifactSetValidatedBeforeInterpretationRead,
		interpretationReadOnlyAfterMetricValidation: true,
		labelFreeAuditRemainsUnmodified: true,
		postHocJoin: true,
	},
	provenance,
	sourceAccounting: {
		changedCases: entries.length,
		assessedOutcomes: entries.filter((entry) => entry.assessment !== null).length,
		ineligibleUnassessedChangedCases: entries.filter((entry) => entry.ineligibility !== null).length,
		complete: entries.length === 18 && assessedBySha.size === 17 && unassessedBySha.size === 1,
		transferIdentity: "exact-source-sha256-and-candidate-stable-key-where-present",
		outcomes: outcomeCounts,
	},
	factorOutcomeReconciliation: factorOutcomeSummary(entries),
	predeclaredFrontier: {
		definition: frontier.value.definition,
		caseCount: frontierEntries.length,
		completeAndUnsampled: true,
		outcomes: frontierOutcomes,
		noBaselineStronger: false,
		predeclaredProspectiveArmPass: false,
	},
	conclusions: {
		auditMechanicallyValid: true,
		predeclaredArmAcceptedAsSufficientRankingAuthority: false,
		predeclaredArmDisposition: "rejected-as-sufficient-ranking-authority",
		fieldOnlyFrozenOverlayLineDisposition: "exhausted-under-currently-validated-mechanisms",
		canonicalPreserved: CANONICAL_VERSION,
	},
	exploratoryOnly: {
		postHocHStatus: "exploratory-only",
		alternateFactorCombinationsStatus: "exploratory-only",
		factorialCellUniverse: 64,
		replacementGateSelectionAuthorized: false,
		newIndependentProspectiveEvidenceRequired: true,
		interpretation: "Post-hoc H or alternate factor combinations are exploratory only and cannot be selected from the 64 cells as a replacement gate without new independent prospective evidence.",
	},
	excludedInputs: {
		commentsEnteredJoin: false,
		targetColorsEnteredJoin: false,
	},
	authorization: {
		selectorAuthorized: false,
		selectorImplemented: false,
		candidateAuthorized: false,
		candidateMutationAuthorized: false,
		reviewAuthorized: false,
		extractionChangeAuthorized: false,
		freezeAuthorized: false,
		promotionAuthorized: false,
		broaderReviewAuthorized: false,
		reserveAccessAuthorized: false,
		outputUnseenRootsOpened: [] as string[],
	},
	entries,
}
const outcomeJoin = {
	...identity,
	joinId: sha256(JSON.stringify(canonicalValue(identity))),
	generatedAt: new Date().toISOString(),
}

await mkdir(joinRoot)
await writeFile(outputPath, `${JSON.stringify(outcomeJoin, null, 2)}\n`, { flag: "wx" })
process.stderr.write(`Wrote provenance-bound post-hoc outcome join to ${outputPath}\n`)
