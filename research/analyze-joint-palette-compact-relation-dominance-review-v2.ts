import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"

const AUDIT_EXPERIMENT_ID = "e6e9768f1dcbfca8d1bb19ad2ccb38a7120d4e7dc4f2ad300d3dead0eab65ba6"
const REVIEW_MANIFEST_ID = "46130c6056e551351d666c63abc1228cb17d160aca8fd136d30c2c6b10aeaf01"
const CANDIDATE_EXPERIMENT_ID = "fa20d3ed4b6b2cac8c6162e8a753372493c68f925ff0fa9c353d70ad7819281c"
const AUDIT_VERSION = "joint-palette-compact-relation-dominance-review-transfer-audit-0.1.0-development"
const CANDIDATE_VERSION = "joint-palette-compact-relation-dominance-0.1.0-development"
const BASELINE_VERSION = "region-graph-0.19.0"
const PRESENTATION_VERSION = "next-palette-review-presentation-2"
const TRANSFER_BASIS = "exact-presentation-v2-source-and-unblinded-semantic-comparison-identity"
const epsilon = 1e-12

const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = join(researchRoot, "..")
const auditRoot = join(researchRoot, `data/experiments/${AUDIT_VERSION}`)
const candidateRoot = join(researchRoot, `data/experiments/${CANDIDATE_VERSION}`)
const reviewRoot = join(auditRoot, "review-v2")
const outputPath = join(reviewRoot, "interpretation.json")
const analyzerPath = fileURLToPath(import.meta.url)
const files = {
	reviewAnalysis: join(reviewRoot, "batch-01-analysis.json"),
	reviewManifest: join(reviewRoot, "batch-01-manifest.json"),
	reviewFeedback: join(reviewRoot, "batch-01-feedback.json"),
	auditManifest: join(auditRoot, "manifest.json"),
	auditProtocol: join(auditRoot, "protocol.json"),
	auditAnalysis: join(auditRoot, "analysis.json"),
	auditResults: join(auditRoot, "results.json"),
	auditTransfer: join(auditRoot, "transfer.json"),
	auditFreshFrontier: join(auditRoot, "fresh-frontier.json"),
	reviewAuthorization: join(auditRoot, "review-v2-authorization.json"),
	candidateManifest: join(candidateRoot, "manifest.json"),
	candidateProtocol: join(candidateRoot, "protocol.json"),
	candidateAnalysis: join(candidateRoot, "analysis.json"),
	candidateResults: join(candidateRoot, "results.json"),
	candidateFrontier: join(candidateRoot, "frontier.json"),
	jointPlan: join(researchRoot, "NEXT_PALETTE_JOINT_INFERENCE_PLAN.md"),
	genericAnalyzer: join(researchRoot, "analyze-next-palette-review-v2.ts"),
}

type Quality = "strong" | "acceptable-not-ideal" | "weak-fallback" | "unacceptable" | "uncertain"
type Comparison = "candidate-stronger" | "baseline-stronger" | "both-similarly-valid"
type ReviewEntry = {
	caseId: string
	order: number
	file: string
	sourceEligibility: string
	baselineQuality: Quality | null
	candidateQuality: Quality | null
	comparison: Comparison | null
	baselineFailureClasses: string[]
	candidateFailureClasses: string[]
	note: string
}
type ReviewAnalysis = {
	schemaVersion: number
	reviewVersion: string
	presentationVersion: string
	experimentId: string
	manifestId: string
	provenance: { manifestSha256: string; feedbackSha256: string; analyzerSha256: string }
	coverage: { expected: number; submitted: number; eligible: number; ineligible: number; complete: boolean }
	quality: { baseline: Record<string, number>; candidate: Record<string, number>; paired: Record<string, number> }
	comparison: Record<string, number>
	failureClasses: { baseline: Record<string, number>; candidate: Record<string, number> }
	comments: { count: number }
	policy: Record<string, unknown>
	entries: ReviewEntry[]
}
type ReviewManifestEntry = {
	caseId: string
	order: number
	source: { file: string; sha256: string }
	assignment: { A: "baseline" | "candidate"; B: "baseline" | "candidate" }
}
type ReviewManifest = {
	schemaVersion: number
	reviewVersion: string
	presentationVersion: string
	experimentId: string
	baselineAlgorithmVersion: string
	candidateAlgorithmVersion: string
	batch: { index: number; size: number; totalBatches: number; totalCases: number }
	provenance: { experiment: Record<string, string> }
	entries: ReviewManifestEntry[]
	generatedAt: string
	manifestId: string
}
type FeedbackEntry = {
	caseId: string
	sourceSha256: string
	sourceEligibility: string
	qualityA: Quality | null
	qualityB: Quality | null
	preference: "a-stronger" | "b-stronger" | "both-similarly-valid" | null
	failureClassesA: string[]
	failureClassesB: string[]
	note: string
}
type Feedback = { manifestId: string; entries: FeedbackEntry[] }
type Source = { path: string; sha256: string; bytes: number }
type Selection = {
	changed: boolean
	admitted: boolean
	stableKey: string
	fieldState: string
	changedSemanticBlocks: number
	changedSemanticAtoms: number
	objectives: number[]
	objectiveDeltas: number[]
	compact: { recompositionPass: boolean } | null
	compactDeltas: number[] | null
	relationDominanceWitness: {
		componentwiseWeakDominance: boolean[]
		strictlyImprovedComponents: string[]
	} | null
}
type CandidateFrontierEntry = {
	file: string
	cohort: string
	source: Source
	baseline: unknown
	candidate: unknown
	selected: Selection
}
type FreshEntry = CandidateFrontierEntry & {
	novelty: { presentationVersion: string; neverPresentedExactlyInBoundRegistry: boolean }
}
type CandidateResult = {
	file: string
	cohort: string
	source: { sha256: string; bytes: number }
	canonical: unknown
	candidate: unknown
	certificate: {
		route: string
		canonical: { relation: { compact: { recompositionPass: boolean } | null } }
		domain: { admittedSha256: string }
		selected: Selection
		ablations: Record<string, { stableKey: string; objectives: number[]; objectiveDeltas: number[] }>
		invariants: Record<string, boolean>
	}
	structural: { violations: string[] }
}
type ExactAppearance = {
	manifestPath: string
	manifestSha256: string
	manifestId: string
	candidateAlgorithmVersion: string
	presentationVersion: string
	priorCaseId: string
	feedbackPath: string | null
	feedbackSha256: string | null
	identity: Record<string, boolean>
	exact: boolean
	reviewed: boolean
	sourceEligibility: string | null
	baselineQuality: Quality | null
	candidateQuality: Quality | null
	comparison: Comparison | null
}
type AuditResult = {
	file: string
	source: Source
	exactAppearances: ExactAppearance[]
	classification: string
}
type TransferEntry = {
	file: string
	sourceSha256: string
	priorCaseId: string
	sourceEligibility: string
	baselineQuality: Quality
	candidateQuality: Quality
	comparison: Comparison
	transferBasis: string
	prior: {
		manifestPath: string
		manifestId: string
		manifestSha256: string
		feedbackPath: string
		feedbackSha256: string
	}
}
type AuditProtocol = {
	experimentVersion: string
	candidateBinding: {
		candidateExperimentId: string
		candidateAlgorithmVersion: string
		baselineAlgorithmVersion: string
		completeChangedComparisons: number
	}
	inferencePolicy: { commentsEnterInference: boolean; targetColorsConsumed: boolean; fixedApcaAdmissionFloor: null }
	stoppingRules: Record<string, unknown>
	authorization: Record<string, unknown>
}
type AuditManifest = {
	experimentVersion: string
	experimentId: string
	generatedAt: string
	protocol: AuditProtocol
	inputs: { candidateArtifacts: Array<{ name: string; path: string; sha256: string }> }
}
type AuditAnalysis = {
	experimentId: string
	structural: { pass: boolean; violationCount: number; checks: Record<string, boolean> }
	accounting: Record<string, number | boolean>
	transferChecks: Record<string, boolean>
	review: { authorized: boolean; freshBlindedComparisonsRequired: number; exactPositiveTransfers: number; diagnosticOnly: boolean }
	disposition: string
}
type ReviewAuthorization = {
	experimentId: string
	candidateExperimentId: string
	baselineAlgorithmVersion: string
	candidateAlgorithmVersion: string
	presentationVersion: string
	boundArtifacts: Record<string, string>
	review: Record<string, unknown>
	inferencePolicy: Record<string, unknown>
	prohibitions: Record<string, unknown>
}
type CandidateProtocol = {
	experimentVersion: string
	authorization: Record<string, unknown>
	inputs: Record<string, boolean>
	selector: Record<string, unknown>
	stoppingRules: Record<string, unknown>
}
type CandidateManifest = {
	experimentVersion: string
	experimentId: string
	generatedAt: string
	protocol: CandidateProtocol
	policy: Record<string, unknown>
	sources: Array<{ cohort: string; path: string; sha256: string; bytes: number }>
}
type CandidateAnalysis = {
	experimentId: string
	candidateCount: number
	classification: string
	structural: { pass: boolean; violationCount: number; caseCount: number; checks: Record<string, boolean> }
	matrix: { total: number; development: number; cohort00: number; changed: number; canonicalFallback: number }
	frontier: { count: number; completeChangedSet: boolean; sampled: boolean }
	nextGate: Record<string, boolean>
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

function comparisonFromFeedback(entry: FeedbackEntry, manifestEntry: ReviewManifestEntry): Comparison | null {
	if (entry.preference === null || entry.preference === "both-similarly-valid") return entry.preference
	const preferredOption = entry.preference === "a-stronger" ? "A" : "B"
	return manifestEntry.assignment[preferredOption] === "candidate" ? "candidate-stronger" : "baseline-stronger"
}

const [review, reviewManifest, feedback, auditManifest, auditProtocol, auditAnalysis, auditResults, transfer,
	freshFrontier, authorization, candidateManifest, candidateProtocol, candidateAnalysis, candidateResults,
	candidateFrontier, jointPlan, genericAnalyzer, analyzer] = await Promise.all([
	source<ReviewAnalysis>(files.reviewAnalysis),
	source<ReviewManifest>(files.reviewManifest),
	source<Feedback>(files.reviewFeedback),
	source<AuditManifest>(files.auditManifest),
	source<AuditProtocol>(files.auditProtocol),
	source<AuditAnalysis>(files.auditAnalysis),
	source<{ experimentId: string; entries: AuditResult[] }>(files.auditResults),
	source<{ experimentId: string; policy: string; entries: TransferEntry[] }>(files.auditTransfer),
	source<{ experimentId: string; entries: FreshEntry[] }>(files.auditFreshFrontier),
	source<ReviewAuthorization>(files.reviewAuthorization),
	source<CandidateManifest>(files.candidateManifest),
	source<CandidateProtocol>(files.candidateProtocol),
	source<CandidateAnalysis>(files.candidateAnalysis),
	source<{ experimentId: string; entries: CandidateResult[] }>(files.candidateResults),
	source<{ experimentId: string; sampling: null; entries: CandidateFrontierEntry[] }>(files.candidateFrontier),
	readFile(files.jointPlan),
	readFile(files.genericAnalyzer),
	readFile(analyzerPath),
])

requireEvidence(review.value.experimentId === AUDIT_EXPERIMENT_ID &&
	review.value.manifestId === REVIEW_MANIFEST_ID && review.value.presentationVersion === PRESENTATION_VERSION,
"Generic review analysis identity changed")
requireEvidence(reviewManifest.value.experimentId === AUDIT_EXPERIMENT_ID &&
	reviewManifest.value.manifestId === REVIEW_MANIFEST_ID && reviewManifest.value.presentationVersion === PRESENTATION_VERSION &&
	reviewManifest.value.baselineAlgorithmVersion === BASELINE_VERSION &&
	reviewManifest.value.candidateAlgorithmVersion === CANDIDATE_VERSION,
"Review manifest identity or algorithm binding changed")
requireEvidence(feedback.value.manifestId === REVIEW_MANIFEST_ID, "Review feedback manifest binding changed")
const { generatedAt: _reviewGeneratedAt, manifestId: _reviewManifestId, ...reviewIdentity } = reviewManifest.value
requireEvidence(sha256(JSON.stringify(reviewIdentity)) === REVIEW_MANIFEST_ID, "Review manifest ID is stale")

for (const artifact of [auditManifest.value, auditAnalysis.value, auditResults.value, transfer.value, freshFrontier.value,
	authorization.value]) {
	requireEvidence(artifact.experimentId === AUDIT_EXPERIMENT_ID, "Audit artifact experiment ID changed")
}
for (const artifact of [candidateManifest.value, candidateAnalysis.value, candidateResults.value, candidateFrontier.value]) {
	requireEvidence(artifact.experimentId === CANDIDATE_EXPERIMENT_ID, "Candidate artifact experiment ID changed")
}
requireEvidence(auditManifest.value.experimentVersion === AUDIT_VERSION && auditProtocol.value.experimentVersion === AUDIT_VERSION &&
	isDeepStrictEqual(auditManifest.value.protocol, auditProtocol.value), "Audit protocol binding changed")
requireEvidence(candidateManifest.value.experimentVersion === CANDIDATE_VERSION &&
	candidateProtocol.value.experimentVersion === CANDIDATE_VERSION &&
	isDeepStrictEqual(candidateManifest.value.protocol, candidateProtocol.value), "Candidate protocol binding changed")
const { experimentId: _auditId, generatedAt: _auditGeneratedAt, ...auditIdentity } = auditManifest.value
const { experimentId: _candidateId, generatedAt: _candidateGeneratedAt, ...candidateIdentity } = candidateManifest.value
requireEvidence(sha256(JSON.stringify(canonicalValue(auditIdentity))) === AUDIT_EXPERIMENT_ID,
	"Audit experiment ID is stale")
requireEvidence(sha256(JSON.stringify(canonicalValue(candidateIdentity))) === CANDIDATE_EXPERIMENT_ID,
	"Candidate experiment ID is stale")

requireEvidence(isDeepStrictEqual(auditProtocol.value.candidateBinding, {
	candidateExperimentId: CANDIDATE_EXPERIMENT_ID,
	candidateAlgorithmVersion: CANDIDATE_VERSION,
	baselineAlgorithmVersion: BASELINE_VERSION,
	completeChangedComparisons: 18,
}), "Audit candidate binding changed")
requireEvidence(isDeepStrictEqual(auditProtocol.value.inferencePolicy,
	{ commentsEnterInference: false, targetColorsConsumed: false, fixedApcaAdmissionFloor: null }),
"Audit inference policy changed")
requireEvidence(isDeepStrictEqual(auditProtocol.value.stoppingRules, {
	candidateStructuralPassRequired: true,
	completeChangedComparisonsMustEqual: 18,
	exactReviewedPositiveTransfersMustEqual: 2,
	neverPresentedFreshComparisonsMustEqual: 16,
	allTransfersMustBeEligibleStrongAndCandidateStronger: true,
	completeAccountingRequired: true,
	evidenceDisagreementStopsBeforeReviewAuthorization: true,
}), "Audit stopping rules changed")
requireEvidence(auditProtocol.value.authorization.freshPresentationV2ReviewAuthorized === true &&
	auditProtocol.value.authorization.authorizedFreshComparisonCount === 16 &&
	auditProtocol.value.authorization.completeFreshFrontierOnly === true &&
	auditProtocol.value.authorization.broaderReviewAuthorized === false &&
	auditProtocol.value.authorization.canonicalPromotionAuthorized === false &&
	auditProtocol.value.authorization.candidateFreezeAuthorized === false &&
	auditProtocol.value.authorization.extractionChangeAuthorized === false &&
	auditProtocol.value.authorization.reserveAccessAuthorized === false &&
	isDeepStrictEqual(auditProtocol.value.authorization.outputUnseenRootsOpened, []) &&
	isDeepStrictEqual(auditProtocol.value.authorization.allowedSourceRoots, ["images", "00"]),
"Audit review authorization changed")

requireEvidence(auditAnalysis.value.structural.pass && auditAnalysis.value.structural.violationCount === 0 &&
	Object.values(auditAnalysis.value.structural.checks).every(Boolean) &&
	Object.values(auditAnalysis.value.transferChecks).every(Boolean), "Audit structural or transfer checks failed")
requireEvidence(isDeepStrictEqual(auditAnalysis.value.accounting, {
	completeChangedComparisons: 18,
	exactPreviouslyReviewedComparisons: 2,
	eligibleStrongCandidateStrongerTransfers: 2,
	neverPresentedFreshComparisons: 16,
	complete: true,
}) && isDeepStrictEqual(auditAnalysis.value.review,
	{ authorized: true, freshBlindedComparisonsRequired: 16, exactPositiveTransfers: 2, diagnosticOnly: true }) &&
	auditAnalysis.value.disposition === "presentation-v2-complete-fresh-frontier-review-authorized",
"Audit accounting or review disposition changed")

requireEvidence(authorization.value.candidateExperimentId === CANDIDATE_EXPERIMENT_ID &&
	authorization.value.baselineAlgorithmVersion === BASELINE_VERSION &&
	authorization.value.candidateAlgorithmVersion === CANDIDATE_VERSION &&
	authorization.value.presentationVersion === PRESENTATION_VERSION,
"Review authorization binding changed")
requireEvidence(isDeepStrictEqual(authorization.value.review, {
	authorized: true,
	diagnosticOnly: true,
	completeFreshFrontierOnly: true,
	freshBlindedComparisons: 16,
	exactPositiveTransfers: 2,
	completeChangedComparisons: 18,
}) && isDeepStrictEqual(authorization.value.inferencePolicy,
	{ commentsDoNotEnterInference: true, targetColorsConsumed: false, fixedApcaAdmissionFloor: null }) &&
	authorization.value.prohibitions.broaderReviewAuthorized === false &&
	authorization.value.prohibitions.canonicalPromotionAuthorized === false &&
	authorization.value.prohibitions.candidateFreezeAuthorized === false &&
	authorization.value.prohibitions.extractionChangeAuthorized === false &&
	authorization.value.prohibitions.reserveAccessAuthorized === false &&
	isDeepStrictEqual(authorization.value.prohibitions.outputUnseenRootsOpened, []) &&
	isDeepStrictEqual(authorization.value.prohibitions.sourceRoots, ["images", "00"]),
"Review authorization scope or prohibitions changed")

const loadedHashes = new Map<string, string>([
	["manifest.json", auditManifest.sha256],
	["protocol.json", auditProtocol.sha256],
	["analysis.json", auditAnalysis.sha256],
	["results.json", auditResults.sha256],
	["transfer.json", transfer.sha256],
	["fresh-frontier.json", freshFrontier.sha256],
	[`../${CANDIDATE_VERSION}/manifest.json`, candidateManifest.sha256],
	[`../${CANDIDATE_VERSION}/protocol.json`, candidateProtocol.sha256],
	[`../${CANDIDATE_VERSION}/analysis.json`, candidateAnalysis.sha256],
	[`../${CANDIDATE_VERSION}/results.json`, candidateResults.sha256],
	[`../${CANDIDATE_VERSION}/frontier.json`, candidateFrontier.sha256],
])
for (const [path, expected] of Object.entries(authorization.value.boundArtifacts)) {
	const actual = loadedHashes.get(path) ?? sha256(await readFile(resolve(auditRoot, path)))
	requireEvidence(actual === expected, `Review authorization provenance changed for ${path}`)
}
requireEvidence(isDeepStrictEqual(reviewManifest.value.provenance.experiment, {
	...authorization.value.boundArtifacts,
	"review-v2-authorization.json": authorization.sha256,
}), "Review manifest experiment provenance changed")

const candidateArtifactHashes = new Map([
	["manifest", candidateManifest.sha256],
	["protocol", candidateProtocol.sha256],
	["analysis", candidateAnalysis.sha256],
	["results", candidateResults.sha256],
	["frontier", candidateFrontier.sha256],
])
requireEvidence(auditManifest.value.inputs.candidateArtifacts.length === candidateArtifactHashes.size,
	"Audit candidate artifact count changed")
for (const artifact of auditManifest.value.inputs.candidateArtifacts) {
	requireEvidence(candidateArtifactHashes.get(artifact.name) === artifact.sha256 &&
		artifact.path === `research/data/experiments/${CANDIDATE_VERSION}/${artifact.name}.json`,
	`Audit candidate artifact binding changed for ${artifact.name}`)
}

requireEvidence(candidateAnalysis.value.candidateCount === 18 && candidateAnalysis.value.structural.pass &&
	candidateAnalysis.value.structural.violationCount === 0 && candidateAnalysis.value.structural.caseCount === 0 &&
	Object.values(candidateAnalysis.value.structural.checks).every(Boolean) &&
	isDeepStrictEqual(candidateAnalysis.value.matrix,
		{ total: 392, development: 37, cohort00: 355, changed: 18, canonicalFallback: 374 }) &&
	candidateAnalysis.value.frontier.count === 18 && candidateAnalysis.value.frontier.completeChangedSet &&
	!candidateAnalysis.value.frontier.sampled &&
	candidateAnalysis.value.classification === "eligible-for-separate-exact-presentation-novelty-transfer-audit",
"Candidate structural or complete-set accounting changed")
requireEvidence(candidateProtocol.value.selector.canonicalIncumbent === BASELINE_VERSION &&
	candidateProtocol.value.selector.fixedApcaAdmissionFloor === null &&
	candidateProtocol.value.selector.comparisonEpsilon === epsilon &&
	candidateProtocol.value.stoppingRules.frontierIsCompleteChangedSetWithoutSampling === true &&
	Object.values(candidateProtocol.value.inputs).every((value) => value === false) &&
	candidateProtocol.value.authorization.canonicalPromotionAuthorized === false &&
	candidateProtocol.value.authorization.candidateFreezeAuthorized === false &&
	candidateProtocol.value.authorization.reserveAccessAuthorized === false &&
	candidateProtocol.value.authorization.broaderReviewAuthorized === false &&
	isDeepStrictEqual(candidateProtocol.value.authorization.outputUnseenRootsOpened, []),
"Candidate protocol or stopping policy changed")
requireEvidence(candidateManifest.value.policy.incumbentAlgorithmVersion === BASELINE_VERSION &&
	candidateManifest.value.policy.fixedApcaAdmissionFloor === null &&
	candidateManifest.value.sources.length === 392 &&
	candidateManifest.value.sources.every((entry) => /^(?:images|00)\/[^/\\]+$/.test(entry.path)),
"Candidate manifest policy or source scope changed")

requireEvidence(candidateResults.value.entries.length === 392 && candidateFrontier.value.entries.length === 18 &&
	candidateFrontier.value.sampling === null, "Candidate result or frontier size changed")
const candidateFrontierBySha = new Map(candidateFrontier.value.entries.map((entry) => [entry.source.sha256, entry]))
requireEvidence(new Set(candidateResults.value.entries.map((entry) => entry.file)).size === 392 &&
	candidateFrontierBySha.size === 18,
	"Candidate source identities are not unique")
const changedCandidateResults = candidateResults.value.entries.filter((entry) => entry.certificate.selected.changed)
for (const entry of candidateResults.value.entries) {
	const certificate = entry.certificate
	requireEvidence(entry.structural.violations.length === 0 && Object.values(certificate.invariants).every(Boolean) &&
		/^[a-f0-9]{64}$/.test(certificate.domain.admittedSha256) &&
		isDeepStrictEqual(Object.keys(certificate.ablations).sort(), ["canonical-background", "canonical-surface"]) &&
		Object.values(certificate.ablations).every((ablation) => ablation.stableKey.length > 0 &&
			[...ablation.objectives, ...ablation.objectiveDeltas].every(Number.isFinite)),
	`Candidate deterministic evidence or ablations changed for ${entry.file}`)
	if (!certificate.selected.changed) {
		requireEvidence(isDeepStrictEqual(entry.candidate, entry.canonical) && !certificate.selected.admitted,
			`Candidate canonical fallback changed for ${entry.file}`)
		continue
	}
	const selected = certificate.selected
	requireEvidence(certificate.route === "compact-relation-dominator" && selected.admitted &&
		selected.changedSemanticBlocks === 1 && selected.compact?.recompositionPass === true &&
		certificate.canonical.relation.compact?.recompositionPass === true &&
		selected.objectiveDeltas.every((value) => value >= -epsilon) &&
		selected.objectiveDeltas.some((value) => value > epsilon) &&
		selected.compactDeltas?.every((value) => value >= -epsilon) === true &&
		selected.compactDeltas.some((value) => value > epsilon) &&
		selected.relationDominanceWitness?.componentwiseWeakDominance.every(Boolean) === true &&
		selected.relationDominanceWitness.strictlyImprovedComponents.length > 0,
	`Candidate dominance certificate changed for ${entry.file}`)
	const frontierEntry = candidateFrontierBySha.get(entry.source.sha256)
	requireEvidence(frontierEntry && frontierEntry.file === entry.file &&
		isDeepStrictEqual(frontierEntry.baseline, entry.canonical) &&
		isDeepStrictEqual(frontierEntry.candidate, entry.candidate) &&
		isDeepStrictEqual(frontierEntry.selected, selected), `Candidate frontier projection changed for ${entry.file}`)
}
requireEvidence(changedCandidateResults.length === 18 &&
	candidateResults.value.entries.filter((entry) => !entry.certificate.selected.changed).length === 374,
"Candidate changed/fallback partition changed")

requireEvidence(auditResults.value.entries.length === 18 && transfer.value.entries.length === 2 &&
	freshFrontier.value.entries.length === 16, "Audit transfer/fresh partition size changed")
const auditResultBySha = new Map(auditResults.value.entries.map((entry) => [entry.source.sha256, entry]))
const transferBySha = new Map(transfer.value.entries.map((entry) => [entry.sourceSha256, entry]))
const freshBySha = new Map(freshFrontier.value.entries.map((entry) => [entry.source.sha256, entry]))
requireEvidence(auditResultBySha.size === 18 && transferBySha.size === 2 && freshBySha.size === 16 &&
	sameSet(candidateFrontierBySha.keys(), auditResultBySha.keys()) &&
	sameSet(candidateFrontierBySha.keys(), [...transferBySha.keys(), ...freshBySha.keys()]) &&
	[...transferBySha.keys()].every((value) => !freshBySha.has(value)),
"Audit transfer/fresh changed-set coverage is incomplete")

for (const entry of freshFrontier.value.entries) {
	const candidateEntry = candidateFrontierBySha.get(entry.source.sha256)
	const auditEntry = auditResultBySha.get(entry.source.sha256)
	const { novelty, ...candidateProjection } = entry
	requireEvidence(candidateEntry && isDeepStrictEqual(candidateProjection, candidateEntry) &&
		novelty.presentationVersion === PRESENTATION_VERSION && novelty.neverPresentedExactlyInBoundRegistry &&
		auditEntry?.classification === "never-presented-exactly" && auditEntry.exactAppearances.length === 0,
	`Fresh frontier identity changed for ${entry.file}`)
}
for (const entry of transfer.value.entries) {
	const auditEntry = auditResultBySha.get(entry.sourceSha256)
	const appearance = auditEntry?.exactAppearances[0]
	requireEvidence(entry.sourceEligibility === "eligible-artwork" && entry.baselineQuality === "strong" &&
		entry.candidateQuality === "strong" && entry.comparison === "candidate-stronger" &&
		entry.transferBasis === TRANSFER_BASIS && candidateFrontierBySha.has(entry.sourceSha256) &&
		auditEntry?.file === entry.file && auditEntry.classification === "exactly-presented" &&
		auditEntry.exactAppearances.length === 1 && appearance?.exact && appearance.reviewed &&
		Object.values(appearance.identity).every(Boolean) && appearance.sourceEligibility === entry.sourceEligibility &&
		appearance.baselineQuality === entry.baselineQuality && appearance.candidateQuality === entry.candidateQuality &&
		appearance.comparison === entry.comparison && appearance.priorCaseId === entry.priorCaseId &&
		appearance.presentationVersion === PRESENTATION_VERSION && appearance.manifestPath === entry.prior.manifestPath &&
		appearance.manifestId === entry.prior.manifestId && appearance.manifestSha256 === entry.prior.manifestSha256 &&
		appearance.feedbackPath === entry.prior.feedbackPath && appearance.feedbackSha256 === entry.prior.feedbackSha256,
	`Exact positive transfer changed for ${entry.file}`)
}

requireEvidence(review.sha256 === sha256(review.raw) && review.value.provenance.manifestSha256 === reviewManifest.sha256 &&
	review.value.provenance.feedbackSha256 === feedback.sha256 &&
	review.value.provenance.analyzerSha256 === sha256(genericAnalyzer), "Generic review analysis provenance changed")
requireEvidence(isDeepStrictEqual(reviewManifest.value.batch,
	{ index: 1, size: 16, totalBatches: 1, totalCases: 16 }) &&
	reviewManifest.value.entries.length === 16 && feedback.value.entries.length === 16 &&
	review.value.entries.length === 16, "Fresh review batch coverage changed")
requireEvidence(isDeepStrictEqual(review.value.coverage,
	{ expected: 16, submitted: 16, eligible: 15, ineligible: 1, complete: true }) &&
	isDeepStrictEqual(review.value.quality.baseline, { strong: 9, "acceptable-not-ideal": 6 }) &&
	isDeepStrictEqual(review.value.quality.candidate, { strong: 9, "acceptable-not-ideal": 6 }) &&
	isDeepStrictEqual(review.value.quality.paired, { "both-positive": 15 }) &&
	isDeepStrictEqual(review.value.comparison,
		{ "both-similarly-valid": 8, "baseline-stronger": 4, "candidate-stronger": 3 }) &&
	isDeepStrictEqual(review.value.failureClasses, { baseline: {}, candidate: {} }) && review.value.comments.count === 3,
"Fresh review aggregate outcome changed")

const manifestByCase = new Map(reviewManifest.value.entries.map((entry) => [entry.caseId, entry]))
const feedbackByCase = new Map(feedback.value.entries.map((entry) => [entry.caseId, entry]))
requireEvidence(manifestByCase.size === 16 && feedbackByCase.size === 16 &&
	sameSet(reviewManifest.value.entries.map((entry) => entry.source.sha256), freshBySha.keys()),
"Fresh review manifest does not cover the exact fresh frontier")
for (const entry of review.value.entries) {
	const manifestEntry = manifestByCase.get(entry.caseId)
	const feedbackEntry = feedbackByCase.get(entry.caseId)
	requireEvidence(manifestEntry && feedbackEntry && manifestEntry.order === entry.order &&
		manifestEntry.source.file === entry.file && freshBySha.has(manifestEntry.source.sha256) &&
		feedbackEntry.sourceSha256 === manifestEntry.source.sha256 &&
		feedbackEntry.sourceEligibility === entry.sourceEligibility && feedbackEntry.note === entry.note,
	`Fresh review source or feedback binding changed for ${entry.caseId}`)
	const baselineOption = manifestEntry.assignment.A === "baseline" ? "A" : "B"
	const candidateOption = baselineOption === "A" ? "B" : "A"
	requireEvidence(feedbackEntry[`quality${baselineOption}`] === entry.baselineQuality &&
		feedbackEntry[`quality${candidateOption}`] === entry.candidateQuality &&
		isDeepStrictEqual(feedbackEntry[`failureClasses${baselineOption}`], entry.baselineFailureClasses) &&
		isDeepStrictEqual(feedbackEntry[`failureClasses${candidateOption}`], entry.candidateFailureClasses) &&
		comparisonFromFeedback(feedbackEntry, manifestEntry) === entry.comparison,
	`Generic review analysis derivation changed for ${entry.caseId}`)
}

const positive = new Set<Quality>(["strong", "acceptable-not-ideal"])
const freshEligible = review.value.entries.filter((entry) => entry.sourceEligibility === "eligible-artwork")
const freshIneligible = review.value.entries.filter((entry) => entry.sourceEligibility !== "eligible-artwork")
requireEvidence(freshEligible.length === 15 && freshIneligible.length === 1 &&
	freshEligible.every((entry) => entry.baselineQuality && entry.candidateQuality &&
		positive.has(entry.baselineQuality) && positive.has(entry.candidateQuality) && entry.comparison !== null &&
		entry.baselineFailureClasses.length === 0 && entry.candidateFailureClasses.length === 0) &&
	freshIneligible[0].sourceEligibility === "not-album-artwork" && freshIneligible[0].baselineQuality === null &&
	freshIneligible[0].candidateQuality === null && freshIneligible[0].comparison === null,
"Fresh eligible/ineligible outcome changed")

const expectedComments = new Map([
	["npr-302dfbe4df26bad90e91",
		"To be honest, most candidates are probably equally valid. However, the one thing that is missing in both is that there is some golden yellow colors on the artwork that are not represented in the palette. could be a good accent"],
	["npr-2718c6f520ccfda1327e", "Candidate B is really missing the blue color that is part of the artwork identity"],
	["npr-3f62ff2e7fe8d3269d36",
		"Both palettes are really missing the red-orange writing that is on the artwork using that as the accent would really make this palette perfect"],
])
const commentedEntries = review.value.entries.filter((entry) => entry.note.length > 0)
requireEvidence(commentedEntries.length === expectedComments.size &&
	commentedEntries.every((entry) => expectedComments.get(entry.caseId) === entry.note),
"Qualitative review comments changed")

const combinedEntries = [
	...freshEligible.map((entry) => {
		const sourceSha256 = manifestByCase.get(entry.caseId)!.source.sha256
		return {
			file: entry.file,
			sourceSha256,
			caseId: entry.caseId,
			candidateStableKey: candidateFrontierBySha.get(sourceSha256)!.selected.stableKey,
			baselineQuality: entry.baselineQuality!,
			candidateQuality: entry.candidateQuality!,
			comparison: entry.comparison!,
			evidenceOrigin: "fresh-review" as const,
		}
	}),
	...transfer.value.entries.map((entry) => ({
		file: entry.file,
		sourceSha256: entry.sourceSha256,
		caseId: entry.priorCaseId,
		candidateStableKey: candidateFrontierBySha.get(entry.sourceSha256)!.selected.stableKey,
		baselineQuality: entry.baselineQuality,
		candidateQuality: entry.candidateQuality,
		comparison: entry.comparison,
		evidenceOrigin: "exact-transfer" as const,
	})),
]
const wins = combinedEntries.filter((entry) => entry.comparison === "candidate-stronger")
const losses = combinedEntries.filter((entry) => entry.comparison === "baseline-stronger")
const similarlyValid = combinedEntries.filter((entry) => entry.comparison === "both-similarly-valid")
requireEvidence(combinedEntries.length === 17 && combinedEntries.every((entry) => positive.has(entry.candidateQuality)) &&
	new Set(combinedEntries.map((entry) => entry.sourceSha256)).size === 17 && wins.length === 5 && losses.length === 4 &&
	similarlyValid.length === 8, "Combined review and transfer outcome changed")

const planText = jointPlan.toString("utf8")
for (const requirement of [
	"preserves canonical output exactly for every unchanged source",
	"produces zero hard structural violations",
	"receives no weak or unacceptable judgments on its complete changed set",
	"receives no baseline-stronger judgment",
	"receives at least one candidate-stronger judgment",
	"has recomputable evidence, deterministic ablations, and predeclared stopping rules",
]) requireEvidence(planText.includes(requirement), `Joint inference success definition changed: ${requirement}`)

const positiveEvidence = combinedEntries.map((entry) => ({
	file: entry.file,
	sourceSha256: entry.sourceSha256,
	candidateStableKey: entry.candidateStableKey,
	evidenceOrigin: entry.evidenceOrigin,
}))
const preferredEvidence = wins.map((entry) => ({
	file: entry.file,
	sourceSha256: entry.sourceSha256,
	candidateStableKey: entry.candidateStableKey,
	evidenceOrigin: entry.evidenceOrigin,
}))
const ineligibleManifestEntry = manifestByCase.get(freshIneligible[0].caseId)!
const interpretation = {
	schemaVersion: 1,
	experimentId: AUDIT_EXPERIMENT_ID,
	candidateExperimentId: CANDIDATE_EXPERIMENT_ID,
	reviewManifestId: REVIEW_MANIFEST_ID,
	generatedAt: new Date().toISOString(),
	provenance: {
		"batch-01-analysis.json": review.sha256,
		"batch-01-manifest.json": reviewManifest.sha256,
		"batch-01-feedback.json": feedback.sha256,
		"../manifest.json": auditManifest.sha256,
		"../protocol.json": auditProtocol.sha256,
		"../analysis.json": auditAnalysis.sha256,
		"../results.json": auditResults.sha256,
		"../transfer.json": transfer.sha256,
		"../fresh-frontier.json": freshFrontier.sha256,
		"../review-v2-authorization.json": authorization.sha256,
		[`../../${CANDIDATE_VERSION}/manifest.json`]: candidateManifest.sha256,
		[`../../${CANDIDATE_VERSION}/protocol.json`]: candidateProtocol.sha256,
		[`../../${CANDIDATE_VERSION}/analysis.json`]: candidateAnalysis.sha256,
		[`../../${CANDIDATE_VERSION}/results.json`]: candidateResults.sha256,
		[`../../${CANDIDATE_VERSION}/frontier.json`]: candidateFrontier.sha256,
		"../../../../NEXT_PALETTE_JOINT_INFERENCE_PLAN.md": sha256(jointPlan),
		analyzerSha256: sha256(analyzer),
	},
	policy: {
		diagnosticOnly: true,
		exactTransferOnly: true,
		positiveJudgmentsAreNonExclusive: true,
		commentsDoNotEnterInference: true,
		targetColorsConsumed: false,
		statisticalThreshold: null,
		statisticalThresholdInvented: false,
	},
	freshReview: {
		coverage: review.value.coverage,
		quality: review.value.quality,
		comparison: review.value.comparison,
		failureClasses: review.value.failureClasses,
	},
	transferAccounting: {
		completeChangedComparisons: 18,
		freshComparisons: 16,
		exactEligibleStrongCandidateStrongerTransfers: 2,
		freshAndTransferSourcesDisjoint: true,
		completeChangedSetCovered: true,
	},
	summary: {
		combinedAssessedComparisons: combinedEntries.length,
		candidatePositive: combinedEntries.filter((entry) => positive.has(entry.candidateQuality)).length,
		candidateWeakOrUnacceptable: combinedEntries.filter((entry) =>
			entry.candidateQuality === "weak-fallback" || entry.candidateQuality === "unacceptable").length,
		candidateStronger: wins.length,
		baselineStronger: losses.length,
		bothSimilarlyValid: similarlyValid.length,
		unassessedIneligibleChangedCases: freshIneligible.length,
	},
	entries: combinedEntries,
	unassessedChangedCases: [{
		file: freshIneligible[0].file,
		sourceSha256: ineligibleManifestEntry.source.sha256,
		caseId: freshIneligible[0].caseId,
		sourceEligibility: freshIneligible[0].sourceEligibility,
		reason: "ineligible-source-not-album-artwork",
	}],
	comments: {
		count: commentedEntries.length,
		inferenceUse: "descriptive-only",
		commentsEnterInference: false,
		targetColorsConsumed: false,
		categoryCounts: {
			sharedOverlayAccentAvailabilityOmissionAffectingBothOptions: 2,
			candidateArtworkIdentityLossInChangedField: 1,
		},
		entries: commentedEntries.map((entry) => ({
			caseId: entry.caseId,
			file: entry.file,
			category: entry.caseId === "npr-2718c6f520ccfda1327e"
				? "candidate-artwork-identity-loss-in-changed-field"
				: "shared-overlay-accent-availability-omission-affecting-both-options",
			treatment: "retained-qualitatively-not-used-for-inference",
		})),
	},
	findings: [
		{
			class: "compact-relation-dominance-admissibility",
			status: "validated-on-assessed-exact-tuples",
			finding: "All 17 assessed candidates are positive nonexclusive alternatives with no weak or unacceptable judgment.",
			implication: "Compact relation dominance supplies admissibility evidence for this bounded exact changed set.",
		},
		{
			class: "compact-relation-dominance-ranking",
			status: "rejected-as-sufficient-authority",
			finding: "Five assessed candidates are stronger, four baselines are stronger, and eight comparisons are similarly valid.",
			implication: "Preserve canonical region-graph-0.19.0 because four baseline wins fail the predeclared zero-regression gate.",
		},
		{
			class: "ineligible-source-accounting",
			status: "complete-but-unassessed",
			finding: "One changed source was submitted and classified as ineligible, leaving 17 of 18 changed cases assessed.",
			implication: "The ineligible source remains explicit in complete changed-set accounting and supplies no directional evidence.",
		},
		{
			class: "qualitative-comments",
			status: "retained-descriptive-only",
			finding: "Two comments describe shared overlay/accent availability omissions; one describes candidate artwork-identity loss in the changed field.",
			implication: "Comments may motivate a later read-only audit but neither comments nor target colors define inference.",
		},
	],
	successCriteria: {
		canonicalOutputPreservedExactlyForUnchangedSources: true,
		structuralViolationsZero: true,
		completeChangedSetAccounting: true,
		noWeakOrUnacceptableCandidateJudgments: true,
		noBaselineStrongerJudgments: false,
		atLeastOneCandidateStrongerJudgment: true,
		deterministicAblationsAndRecomputableEvidence: true,
		unassessedIneligibleChangedCases: 1,
		pass: false,
		failureReason: "Four baseline-stronger judgments fail the predeclared zero-regression gate.",
	},
	disposition: {
		candidate: "stop-compact-relation-dominance-as-complete-canonical-replacement-preserve-region-graph-0.19.0",
		canonicalPreserved: BASELINE_VERSION,
		compactRelationDominanceValidatedForAdmissibility: true,
		compactRelationDominanceAcceptedAsSufficientRankingAuthority: false,
		positiveNonexclusiveAlternativeEvidence: positiveEvidence,
		exactPreferredTupleEvidence: preferredEvidence,
		extractionChangeAuthorized: false,
		freezeAuthorized: false,
		promotionAuthorized: false,
		broaderReviewAuthorized: false,
		reserveAccessAuthorized: false,
		reason: "All assessed candidates are admissible, but four baseline-stronger judgments reject complete canonical replacement; one ineligible changed source is unassessed.",
	},
	nextEngineeringGate: {
		name: "read-only-field-identity-overlay-availability-audit",
		readOnly: true,
		candidateAutomaticallyAuthorized: false,
		reviewAutomaticallyAuthorized: false,
		candidateOrReviewAuthorized: false,
		commentsMayMotivateButNotDefineSignal: true,
		requirement: "If pursued later, predeclare a generalized field-identity/overlay-availability signal that is independent of comments and target colors before any further candidate or review.",
	},
}

await writeFile(outputPath, `${JSON.stringify(interpretation, null, 2)}\n`, { flag: "wx" })
process.stderr.write(`Wrote compact relation dominance review interpretation to ${outputPath}\n`)
