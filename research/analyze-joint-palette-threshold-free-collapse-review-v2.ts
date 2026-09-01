import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const EXPERIMENT_ID = "0915e9ab8df678d6a290ac567f580227228e94a009b1f11011193f3015484a6f"
const REVIEW_MANIFEST_ID = "6b5ac0b4c293ca850c9ec6687dd405d5dcff53f9376693ac6ece55910c337939"
const AUDIT_EXPERIMENT_ID = "ebee9abb7e86b70754c2ed2ef83cd7bf643f5bf71d94d084ed69108b0617eb43"
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const experimentRoot = join(researchRoot, "data/experiments/joint-palette-threshold-free-collapse-0.1.0-development")
const reviewRoot = join(experimentRoot, "review-v2")
const files = {
	reviewAnalysis: join(reviewRoot, "batch-01-analysis.json"),
	reviewManifest: join(reviewRoot, "batch-01-manifest.json"),
	reviewFeedback: join(reviewRoot, "batch-01-feedback.json"),
	frontier: join(experimentRoot, "frontier.json"),
	results: join(experimentRoot, "results.json"),
	experimentAnalysis: join(experimentRoot, "analysis.json"),
	protocol: join(experimentRoot, "protocol.json"),
	transfer: join(experimentRoot, "review-transfer.json"),
	authorization: join(experimentRoot, "review-v2-authorization.json"),
	auditAnalysis:
		join(researchRoot, "data/experiments/joint-palette-threshold-free-collapse-audit-0.1.1-development/analysis.json"),
	auditFrontier:
		join(researchRoot, "data/experiments/joint-palette-threshold-free-collapse-audit-0.1.1-development/candidate-frontier.json"),
	plan: join(researchRoot, "NEXT_PALETTE_JOINT_INFERENCE_PLAN.md"),
}
const outputPath = join(reviewRoot, "interpretation.json")

type Quality = "strong" | "acceptable-not-ideal" | "weak-fallback" | "unacceptable" | "uncertain"
type ReviewEntry = {
	caseId: string
	file: string
	sourceEligibility: string
	baselineQuality: Quality | null
	candidateQuality: Quality | null
	comparison: string | null
	note: string
}
type ReviewAnalysis = {
	experimentId: string
	manifestId: string
	coverage: { expected: number; submitted: number; eligible: number; ineligible: number; complete: boolean }
	quality: { baseline: Record<string, number>; candidate: Record<string, number>; paired: Record<string, number> }
	comparison: Record<string, number>
	comments: { count: number }
	entries: ReviewEntry[]
}
type ExperimentAnalysis = {
	experimentId: string
	structural: { pass: boolean; violationCount: number }
	coverage: { auditedPassingCandidates: number; exactPositiveTransfers: number; freshReviewRequired: number }
	review: { authorized: boolean; diagnosticOnly: boolean; freshBlindedComparisonsRequired: number }
}
type Transfer = {
	file: string
	sourceSha256: string
	candidateQuality: Quality
	comparison: string
	transferBasis: string
}
type Protocol = {
	auditExperimentId: string
	authorization: {
		broaderReviewAuthorized: boolean
		canonicalPromotionAuthorized: boolean
		candidateFreezeAuthorized: boolean
		reserveAccessAuthorized: boolean
		outputUnseenRootsOpened: string[]
	}
}
type Authorization = {
	experimentId: string
	review: { authorized: boolean; diagnosticOnly: boolean; thresholdFreeAuditedCollapsesOnly: boolean; freshBlindedComparisons: number }
	prohibitions: {
		broaderReviewAuthorized: boolean
		canonicalPromotionAuthorized: boolean
		candidateFreezeAuthorized: boolean
		reserveAccessAuthorized: boolean
		outputUnseenRootsOpened: string[]
	}
}

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

async function source<T>(path: string): Promise<{ raw: Buffer; value: T; sha256: string }> {
	const raw = await readFile(path)
	return { raw, value: JSON.parse(raw.toString("utf8")) as T, sha256: sha256(raw) }
}

const [review, manifest, feedback, frontier, results, experiment, protocol, transfer, authorization, auditAnalysis,
	auditFrontier, plan] = await Promise.all([
	source<ReviewAnalysis>(files.reviewAnalysis),
	source<unknown>(files.reviewManifest),
	source<unknown>(files.reviewFeedback),
	source<{ experimentId: string; entries: Array<{ file: string; audit: { pass: boolean; clauses: Record<string, boolean> } }> }>(
		files.frontier,
	),
	source<{ experimentId: string; entries: unknown[] }>(files.results),
	source<ExperimentAnalysis>(files.experimentAnalysis),
	source<Protocol>(files.protocol),
	source<{ experimentId: string; entries: Transfer[] }>(files.transfer),
	source<Authorization>(files.authorization),
	source<{
		experimentId: string
		exactCandidateCoverage: { passing: number; exactPositiveTransfers: number; freshReviewRequired: number }
		reviewedSeparation: { positivePass: number; negativeFail: number }
	}>(files.auditAnalysis),
	source<{ experimentId: string; entries: Array<{ file: string; reviewEvidence: string }> }>(files.auditFrontier),
	readFile(files.plan),
])
if (review.value.experimentId !== EXPERIMENT_ID || review.value.manifestId !== REVIEW_MANIFEST_ID ||
	frontier.value.experimentId !== EXPERIMENT_ID || results.value.experimentId !== EXPERIMENT_ID ||
	experiment.value.experimentId !== EXPERIMENT_ID || transfer.value.experimentId !== EXPERIMENT_ID ||
	authorization.value.experimentId !== EXPERIMENT_ID || auditAnalysis.value.experimentId !== AUDIT_EXPERIMENT_ID ||
	auditFrontier.value.experimentId !== AUDIT_EXPERIMENT_ID || protocol.value.auditExperimentId !== AUDIT_EXPERIMENT_ID ||
	!review.value.coverage.complete || review.value.coverage.expected !== 2 || review.value.coverage.submitted !== 2 ||
	review.value.coverage.eligible !== 2 || review.value.coverage.ineligible !== 0 || review.value.comments.count !== 0 ||
	frontier.value.entries.length !== 2 || frontier.value.entries.some((entry) =>
		!entry.audit.pass || Object.values(entry.audit.clauses).some((value) => !value)) || results.value.entries.length !== 3 ||
	!experiment.value.structural.pass || experiment.value.structural.violationCount !== 0 ||
	experiment.value.coverage.auditedPassingCandidates !== 3 || experiment.value.coverage.exactPositiveTransfers !== 1 ||
	experiment.value.coverage.freshReviewRequired !== 2 || !experiment.value.review.authorized ||
	!experiment.value.review.diagnosticOnly || experiment.value.review.freshBlindedComparisonsRequired !== 2 ||
	transfer.value.entries.length !== 1 || transfer.value.entries[0].candidateQuality !== "acceptable-not-ideal" ||
	transfer.value.entries[0].comparison !== "candidate-stronger" ||
	transfer.value.entries[0].transferBasis !== "exact-canonical-and-candidate-semantic-palette-match" ||
	auditAnalysis.value.exactCandidateCoverage.passing !== 3 ||
	auditAnalysis.value.exactCandidateCoverage.exactPositiveTransfers !== 1 ||
	auditAnalysis.value.exactCandidateCoverage.freshReviewRequired !== 2 ||
	auditAnalysis.value.reviewedSeparation.positivePass !== 1 || auditAnalysis.value.reviewedSeparation.negativeFail !== 2 ||
	auditFrontier.value.entries.filter((entry) => entry.reviewEvidence === "fresh-review-required").length !== 2 ||
	auditFrontier.value.entries.filter((entry) => entry.reviewEvidence === "exact-positive-transfer").length !== 1 ||
	protocol.value.authorization.broaderReviewAuthorized || protocol.value.authorization.canonicalPromotionAuthorized ||
	protocol.value.authorization.candidateFreezeAuthorized || protocol.value.authorization.reserveAccessAuthorized ||
	protocol.value.authorization.outputUnseenRootsOpened.length !== 0 || !authorization.value.review.authorized ||
	!authorization.value.review.diagnosticOnly || !authorization.value.review.thresholdFreeAuditedCollapsesOnly ||
	authorization.value.review.freshBlindedComparisons !== 2 || authorization.value.prohibitions.broaderReviewAuthorized ||
	authorization.value.prohibitions.canonicalPromotionAuthorized || authorization.value.prohibitions.candidateFreezeAuthorized ||
	authorization.value.prohibitions.reserveAccessAuthorized || authorization.value.prohibitions.outputUnseenRootsOpened.length !== 0) {
	throw new Error("Threshold-free collapse review evidence is incomplete or inconsistent")
}

const freshEntries = review.value.entries
if (freshEntries.some((entry) => entry.sourceEligibility !== "eligible-artwork" || entry.baselineQuality !== "strong" ||
	entry.candidateQuality !== "strong" || entry.comparison !== "baseline-stronger" || entry.note.length > 0)) {
	throw new Error("Threshold-free collapse fresh review outcome changed")
}
const transferEntry = transfer.value.entries[0]
const combinedEntries = [
	...freshEntries.map((entry) => ({ ...entry, evidenceOrigin: "fresh-review" as const })),
	{
		file: transferEntry.file,
		sourceSha256: transferEntry.sourceSha256,
		baselineQuality: "unacceptable" as const,
		candidateQuality: transferEntry.candidateQuality,
		comparison: transferEntry.comparison,
		note: "",
		evidenceOrigin: "exact-transfer" as const,
	},
]
const positive = new Set<Quality>(["strong", "acceptable-not-ideal"])
const interpretation = {
	schemaVersion: 1,
	experimentId: EXPERIMENT_ID,
	reviewManifestId: REVIEW_MANIFEST_ID,
	generatedAt: new Date().toISOString(),
	provenance: {
		"batch-01-analysis.json": review.sha256,
		"batch-01-manifest.json": manifest.sha256,
		"batch-01-feedback.json": feedback.sha256,
		"../frontier.json": frontier.sha256,
		"../results.json": results.sha256,
		"../analysis.json": experiment.sha256,
		"../protocol.json": protocol.sha256,
		"../review-transfer.json": transfer.sha256,
		"../review-v2-authorization.json": authorization.sha256,
		"../../joint-palette-threshold-free-collapse-audit-0.1.1-development/analysis.json": auditAnalysis.sha256,
		"../../joint-palette-threshold-free-collapse-audit-0.1.1-development/candidate-frontier.json": auditFrontier.sha256,
		"../../../../NEXT_PALETTE_JOINT_INFERENCE_PLAN.md": sha256(plan),
		analyzerSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
	},
	policy: {
		diagnosticOnly: true,
		commentsDoNotEnterInference: true,
		targetColorsInferred: false,
		positiveJudgmentsAreNonExclusive: true,
		exactTransferOnly: true,
		promotionAuthorized: false,
		candidateFreezeAuthorized: false,
		broaderReviewAuthorized: false,
		reserveAccessAuthorized: false,
	},
	summary: {
		freshReviewed: freshEntries.length,
		exactTransfers: transfer.value.entries.length,
		combinedEvaluated: combinedEntries.length,
		candidatePositive: combinedEntries.filter((entry) => positive.has(entry.candidateQuality)).length,
		candidateWeakOrUnacceptable: combinedEntries.filter((entry) =>
			entry.candidateQuality === "weak-fallback" || entry.candidateQuality === "unacceptable").length,
		candidateStronger: combinedEntries.filter((entry) => entry.comparison === "candidate-stronger").length,
		baselineStronger: combinedEntries.filter((entry) => entry.comparison === "baseline-stronger").length,
		bothPositiveFresh: freshEntries.filter((entry) =>
			entry.baselineQuality && entry.candidateQuality && positive.has(entry.baselineQuality) && positive.has(entry.candidateQuality)).length,
	},
	entries: combinedEntries,
	findings: [
		{
			class: "collapse-admissibility",
			status: "proven-on-evaluated-exact-tuples",
			finding: "All three audited candidates received positive complete-palette quality, including two fresh strong judgments and one exact transferred acceptable judgment.",
			implication: "The four threshold-free clauses successfully removed the two previously observed unacceptable collapse regressions in the exact evaluated set.",
		},
		{
			class: "collapse-ranking",
			status: "rejected",
			finding: "Both fresh candidates were strong but baseline-stronger; only the transferred case preferred collapse.",
			implication: "Treat the clauses as admissibility evidence, not as authority to replace a valid canonical field treatment.",
		},
		{
			class: "set-valued-validity",
			status: "supported",
			finding: "The two fresh comparisons contain two strong palettes with a directional preference rather than an invalid candidate.",
			implication: "Retain canonical under incomparability and preserve the collapsed tuples only as non-exclusive accepted alternatives.",
		},
	],
	successCriteria: {
		structuralViolationsZero: true,
		completeChangedSetReviewedOrExactlyTransferred: true,
		noWeakOrUnacceptableCandidateJudgments: true,
		noBaselineStrongerJudgments: false,
		atLeastOneCandidateStrongerJudgment: true,
		pass: false,
	},
	disposition: {
		candidate: "stop-threshold-free-collapse-as-replacement-preserve-canonical-0.19",
		admissibilityEvidenceRetained: true,
		acceptedAlternativeFiles: combinedEntries.map((entry) => entry.file),
		extractionChangeAuthorized: false,
		freezeAuthorized: false,
		promotionAuthorized: false,
		broaderReviewAuthorized: false,
		reserveAccessAuthorized: false,
		reason: "All candidates are acceptable, but two baseline-stronger judgments fail the predeclared no-regression ranking gate.",
	},
	nextStep: {
		candidateOrReviewAuthorized: false,
		action: "Preserve canonical selection and retain the three exact collapses as non-exclusive accepted alternatives; do not seek another collapse review without a new generalized ranking signal.",
	},
}
await writeFile(outputPath, `${JSON.stringify(interpretation, null, 2)}\n`, { flag: "wx" })
process.stderr.write(`Wrote threshold-free collapse review interpretation to ${outputPath}\n`)
