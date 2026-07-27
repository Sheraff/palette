import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { apcaContrast } from "./src/color.ts"

const EXPERIMENT_ID = "1f1c0553644479361d822d0d34cac2cdacf352dc26de5d6e7ef35df0a9cf7a6b"
const REVIEW_MANIFEST_ID = "67cb3c06f1254a953b4cdda254ee74c424d6d0e1e944ffa911653577dd8482e9"
const JOINT_PARETO_EXPERIMENT_ID = "c31541f6ad1fe7fb57cf9b6b5d4373a1f0ef00f7974c8dd9c511b804f3e6b283"
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const experimentRoot = join(researchRoot, "data/experiments/joint-palette-field-dominance-first-0.1.0-development")
const reviewRoot = join(experimentRoot, "review-v2")
const files = {
	reviewAnalysis: join(reviewRoot, "batch-01-analysis.json"),
	reviewManifest: join(reviewRoot, "batch-01-manifest.json"),
	reviewFeedback: join(reviewRoot, "batch-01-feedback.json"),
	frontier: join(experimentRoot, "frontier.json"),
	results: join(experimentRoot, "results.json"),
	experimentAnalysis: join(experimentRoot, "analysis.json"),
	protocol: join(experimentRoot, "protocol.json"),
	authorization: join(experimentRoot, "review-v2-authorization.json"),
	jointParetoCertificates:
		join(researchRoot, "data/experiments/next-palette-joint-pareto-0.5.0-development/certificates.json"),
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
type Role = { rgb: [number, number, number] }
type Palette = {
	background: Role
	foreground: Role
	surface: Role
	accent: Role
	gradient: { isGradient: boolean }
	metrics: { meanReconstructionError: number }
}
type Selection = {
	fieldState: "collapsed" | "distinct-flat" | "gradient"
	changedSemanticBlocks: number
	changedSemanticAtoms: number
	objectives: number[]
	objectiveDeltas: number[]
}
type ResultEntry = {
	file: string
	canonical: Palette
	candidate: Palette | null
	certificate: {
		incumbent: { fieldState: "collapsed" | "distinct-flat" | "gradient"; objectives: number[] }
		counts: { admittedCompleteTuples: number; admittedByChangedBlocks: Record<string, number> }
		selected: Selection
	}
}
type FrontierEntry = { file: string; baseline: Palette; candidate: Palette; selected: Selection }
type BroadCertificate = {
	selected: {
		fieldTreatment: {
			endpointDistance: number
			fieldRelation: {
				endpoint: { backgroundPresence: number; surfacePresence: number; balance: number; mass: number }
				field: { backgroundSupport: number; surfaceSupport: number }
			} | null
		} | null
	}
}
type ExperimentAnalysis = {
	experimentId: string
	structural: { pass: boolean; violationCount: number }
	coverage: { reviewCases: number; strictDominatorAvailable: number }
	review: { authorized: boolean; diagnosticOnly: boolean; freshBlindedComparisonsRequired: number }
}
type Protocol = {
	authorization: {
		commentsEnterInference: boolean
		canonicalPromotionAuthorized: boolean
		candidateFreezeAuthorized: boolean
		reserveAccessAuthorized: boolean
		outputUnseenRootsOpened: string[]
	}
}
type Authorization = {
	experimentId: string
	review: { authorized: boolean; diagnosticOnly: boolean; strictFieldDominatorsOnly: boolean; freshBlindedComparisons: number }
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

function magnitude(value: number): number {
	return Math.abs(value)
}

const [review, manifest, feedback, frontier, results, experiment, protocol, authorization, broad, plan] = await Promise.all([
	source<ReviewAnalysis>(files.reviewAnalysis),
	source<unknown>(files.reviewManifest),
	source<unknown>(files.reviewFeedback),
	source<{ experimentId: string; entries: FrontierEntry[] }>(files.frontier),
	source<{ experimentId: string; entries: ResultEntry[] }>(files.results),
	source<ExperimentAnalysis>(files.experimentAnalysis),
	source<Protocol>(files.protocol),
	source<Authorization>(files.authorization),
	source<{ experimentId: string; entries: Record<string, BroadCertificate> }>(files.jointParetoCertificates),
	readFile(files.plan),
])
if (review.value.experimentId !== EXPERIMENT_ID || review.value.manifestId !== REVIEW_MANIFEST_ID ||
	frontier.value.experimentId !== EXPERIMENT_ID || results.value.experimentId !== EXPERIMENT_ID ||
	experiment.value.experimentId !== EXPERIMENT_ID || authorization.value.experimentId !== EXPERIMENT_ID ||
	broad.value.experimentId !== JOINT_PARETO_EXPERIMENT_ID || !review.value.coverage.complete ||
	review.value.coverage.expected !== 3 || review.value.coverage.submitted !== 3 || review.value.coverage.eligible !== 3 ||
	review.value.coverage.ineligible !== 0 || review.value.comments.count !== 0 || frontier.value.entries.length !== 3 ||
	!experiment.value.structural.pass || experiment.value.structural.violationCount !== 0 ||
	experiment.value.coverage.reviewCases !== 3 || experiment.value.coverage.strictDominatorAvailable !== 3 ||
	!experiment.value.review.authorized || !experiment.value.review.diagnosticOnly ||
	experiment.value.review.freshBlindedComparisonsRequired !== 3 || protocol.value.authorization.commentsEnterInference ||
	protocol.value.authorization.canonicalPromotionAuthorized || protocol.value.authorization.candidateFreezeAuthorized ||
	protocol.value.authorization.reserveAccessAuthorized || protocol.value.authorization.outputUnseenRootsOpened.length !== 0 ||
	!authorization.value.review.authorized || !authorization.value.review.diagnosticOnly ||
	!authorization.value.review.strictFieldDominatorsOnly || authorization.value.review.freshBlindedComparisons !== 3 ||
	authorization.value.prohibitions.broaderReviewAuthorized || authorization.value.prohibitions.canonicalPromotionAuthorized ||
	authorization.value.prohibitions.candidateFreezeAuthorized || authorization.value.prohibitions.reserveAccessAuthorized ||
	authorization.value.prohibitions.outputUnseenRootsOpened.length !== 0) {
	throw new Error("Field dominance review evidence is incomplete or inconsistent")
}

const resultByFile = new Map(results.value.entries.map((entry) => [entry.file, entry]))
const frontierByFile = new Map(frontier.value.entries.map((entry) => [entry.file, entry]))
const entries = review.value.entries.map((reviewEntry) => {
	const result = resultByFile.get(reviewEntry.file)
	const frontierEntry = frontierByFile.get(reviewEntry.file)
	const broadCertificate = broad.value.entries[reviewEntry.file]
	const relation = broadCertificate?.selected.fieldTreatment?.fieldRelation
	if (!result?.candidate || !frontierEntry || !relation || result.certificate.selected.fieldState !== "collapsed" ||
		result.certificate.selected.changedSemanticBlocks !== 1 || result.certificate.selected.changedSemanticAtoms !== 2 ||
		result.certificate.selected.objectiveDeltas.some((delta) => delta < -1e-12) ||
		!result.certificate.selected.objectiveDeltas.some((delta) => delta > 1e-12)) {
		throw new Error(`Field dominance certificate changed for ${reviewEntry.file}`)
	}
	const backgroundSupport = relation.field.backgroundSupport
	const surfaceSupport = relation.field.surfaceSupport
	const baselineForegroundSurface = magnitude(apcaContrast(result.canonical.foreground.rgb, result.canonical.surface.rgb))
	const candidateForegroundSurface = magnitude(apcaContrast(result.candidate.foreground.rgb, result.candidate.surface.rgb))
	const baselineAccentSurface = magnitude(apcaContrast(result.canonical.accent.rgb, result.canonical.surface.rgb))
	const candidateAccentSurface = magnitude(apcaContrast(result.candidate.accent.rgb, result.candidate.surface.rgb))
	return {
		...reviewEntry,
		baselineFieldState: result.certificate.incumbent.fieldState,
		candidateFieldState: result.certificate.selected.fieldState,
		changedSemanticBlocks: result.certificate.selected.changedSemanticBlocks,
		changedSemanticAtoms: result.certificate.selected.changedSemanticAtoms,
		objectiveDeltas: result.certificate.selected.objectiveDeltas,
		admittedStrictDominators: result.certificate.counts.admittedCompleteTuples,
		admittedByChangedBlocks: result.certificate.counts.admittedByChangedBlocks,
		fieldEvidence: {
			retainedBackgroundSupport: backgroundSupport,
			removedSurfaceSupport: surfaceSupport,
			surfaceToBackgroundSupportRatio: surfaceSupport / backgroundSupport,
			retainedBackgroundRelativeDominance: 1 - surfaceSupport / backgroundSupport,
			endpointBalance: relation.endpoint.balance,
			surfaceToBackgroundPresenceRatio: relation.endpoint.surfacePresence / relation.endpoint.backgroundPresence,
			endpointMass: relation.endpoint.mass,
			endpointDistance: broadCertificate.selected.fieldTreatment!.endpointDistance,
			canonicalPairStateSupport: result.certificate.incumbent.objectives[1],
			collapsedStateSupport: result.certificate.selected.objectives[1],
			strongestNoncollapsedSupport: 1 - result.certificate.selected.objectives[1],
		},
		secondaryRelations: {
			foregroundOnSurface: {
				baselineMagnitude: baselineForegroundSurface,
				candidateMagnitude: candidateForegroundSurface,
				delta: candidateForegroundSurface - baselineForegroundSurface,
			},
			accentOnSurface: {
				baselineMagnitude: baselineAccentSurface,
				candidateMagnitude: candidateAccentSurface,
				delta: candidateAccentSurface - baselineAccentSurface,
			},
		},
		reconstructionErrorDelta:
			result.candidate.metrics.meanReconstructionError - result.canonical.metrics.meanReconstructionError,
	}
})
const positive = new Set<Quality>(["strong", "acceptable-not-ideal"])
const wins = entries.filter((entry) => entry.comparison === "candidate-stronger")
const losses = entries.filter((entry) => entry.comparison === "baseline-stronger")
if (wins.length !== 1 || losses.length !== 2 || entries.some((entry) => entry.note.length > 0)) {
	throw new Error("Field dominance review outcome changed")
}

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
		"../review-v2-authorization.json": authorization.sha256,
		"../../next-palette-joint-pareto-0.5.0-development/certificates.json": broad.sha256,
		"../../../../NEXT_PALETTE_JOINT_INFERENCE_PLAN.md": sha256(plan),
		analyzerSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
	},
	policy: {
		diagnosticOnly: true,
		commentsDoNotEnterInference: true,
		targetColorsInferred: false,
		positiveJudgmentsAreNonExclusive: true,
		promotionAuthorized: false,
		candidateFreezeAuthorized: false,
		broaderReviewAuthorized: false,
		reserveAccessAuthorized: false,
	},
	summary: {
		reviewed: entries.length,
		eligible: entries.length,
		candidatePositive: entries.filter((entry) => entry.candidateQuality && positive.has(entry.candidateQuality)).length,
		candidateWeakOrUnacceptable: entries.filter((entry) =>
			entry.candidateQuality === "weak-fallback" || entry.candidateQuality === "unacceptable").length,
		candidateStronger: wins.length,
		baselineStronger: losses.length,
		allCandidatesCollapsed: entries.every((entry) => entry.candidateFieldState === "collapsed"),
		allChangesIsolatedToFieldBlock: entries.every((entry) =>
			entry.changedSemanticBlocks === 1 && entry.changedSemanticAtoms === 2),
	},
	entries,
	findings: [
		{
			class: "declared-objective-insufficiency",
			status: "proven",
			finding: "All three candidates strictly dominate canonical on the declared six-vector, yet two are unacceptable and baseline-stronger.",
			implication: "Strict dominance on the current vector is not sufficient evidence of complete-palette improvement.",
		},
		{
			class: "field-collapse-ranking",
			status: "proven",
			finding: "Each sole one-block winner deletes the distinct surface; one improves quality, while two regress to unacceptable.",
			implication: "Do not generalize field collapse from scalar state-support improvement over the incumbent pair.",
		},
		{
			class: "missing-removed-endpoint-evidence",
			status: "supported-hypothesis",
			finding: "The accepted case has a more subordinate removed surface by both support ratio and endpoint balance than either rejected case.",
			implication: "Audit removed-endpoint subordination as explicit collapse evidence without fitting a threshold to three outcomes.",
		},
		{
			class: "missing-secondary-overlay-relations",
			status: "proven-for-one-loss",
			finding: "One rejected collapse destroys substantially stronger foreground-on-surface and accent-on-surface relations while the six-vector records no loss.",
			implication: "Preserve separate field-overlay relations instead of retaining only worst foreground and accent-on-background magnitudes.",
		},
	],
	successCriteria: {
		structuralViolationsZero: true,
		completeChangedSetReviewed: true,
		noWeakOrUnacceptableCandidateJudgments: false,
		noBaselineStrongerJudgments: false,
		atLeastOneCandidateStrongerJudgment: true,
		constrainedAblationsEvaluated: true,
		pass: false,
	},
	disposition: {
		candidate: "stop-field-dominance-first-collapse-selector-preserve-canonical-0.19",
		exactPositiveTupleEvidenceRetained: wins.map((entry) => entry.file),
		extractionChangeAuthorized: false,
		freezeAuthorized: false,
		promotionAuthorized: false,
		broaderReviewAuthorized: false,
		reserveAccessAuthorized: false,
		reason: "Two unacceptable baseline-stronger judgments fail the complete-palette quality and no-regression gates.",
	},
	nextEngineeringGate: {
		name: "read-only-collapse-evidence-audit",
		candidateOrReviewAuthorized: false,
		requiredEvidence: [
			"retained and removed field support with their ratio",
			"endpoint presence and balance",
			"separate foreground and accent APCA relations on both fields",
			"comparable reconstruction before and after collapse",
		],
		requirement: "A predeclared generalized hypothesis must separate collapse suitability without filenames, colors, comments, or thresholds fit to these three outcomes before another candidate or review.",
	},
}
await writeFile(outputPath, `${JSON.stringify(interpretation, null, 2)}\n`, { flag: "wx" })
process.stderr.write(`Wrote field dominance review interpretation to ${outputPath}\n`)
