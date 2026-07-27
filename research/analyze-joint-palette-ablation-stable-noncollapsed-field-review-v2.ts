import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const EXPERIMENT_ID = "725663bc3520de5d3f1403014a05c0a8d5548eb84b5453d5f3e1077d7dd79dab"
const REVIEW_MANIFEST_ID = "0fc6668c42966d6a4a3e265051b66b50b4d5245e7730c0d4e89ae5800ec7103d"
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const experimentRoot = join(researchRoot,
	"data/experiments/joint-palette-ablation-stable-noncollapsed-field-0.1.0-development")
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
	plan: join(researchRoot, "NEXT_PALETTE_JOINT_INFERENCE_PLAN.md"),
}
const outputPath = join(reviewRoot, "interpretation.json")

type Quality = "strong" | "acceptable-not-ideal" | "weak-fallback" | "unacceptable" | "uncertain"
type ReviewEntry = {
	caseId: string
	file: string
	frontierSignature: string
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
type Selection = {
	changed: boolean
	admitted: boolean
	stableKey: string
	fieldState: "collapsed" | "distinct-flat" | "gradient"
	changedSemanticBlocks: number
	changedSemanticAtoms: number
	objectiveDeltas: number[]
}
type Palette = {
	background: { rgb: [number, number, number] }
	foreground: { rgb: [number, number, number] }
	surface: { rgb: [number, number, number] }
	accent: { rgb: [number, number, number] }
	gradient: { isGradient: boolean }
}
type FrontierEntry = {
	file: string
	changedRoles: string[]
	gradientChanged: boolean
	baseline: Palette
	candidate: Palette
	selected: Selection
}
type ResultEntry = {
	file: string
	canonical: Palette
	candidate: Palette
	certificate: {
		route: string
		selected: Selection
		canonicalOverlayAblation: Selection
		invariants: Record<string, boolean>
	}
	structural: { violations: string[] }
}
type ExperimentAnalysis = {
	experimentId: string
	structural: { pass: boolean; violationCount: number }
	coverage: { ablationStableNoncollapsedFieldCandidates: number; exactReviewTransfers: number; freshReviewRequired: number }
	states: Record<string, number>
	changes: Record<string, number>
	review: { authorized: boolean; diagnosticOnly: boolean; freshBlindedComparisonsRequired: number }
}
type Protocol = {
	authorization: {
		canonicalPromotionAuthorized: boolean
		candidateFreezeAuthorized: boolean
		broaderReviewAuthorized: boolean
		reserveAccessAuthorized: boolean
		outputUnseenRootsOpened: string[]
	}
}
type Authorization = {
	experimentId: string
	review: {
		authorized: boolean
		diagnosticOnly: boolean
		ablationStableNoncollapsedFieldOnly: boolean
		freshBlindedComparisons: number
	}
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

function sameRgb(first: [number, number, number], second: [number, number, number]): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function fieldState(palette: Palette): "collapsed" | "distinct-flat" | "gradient" {
	return sameRgb(palette.background.rgb, palette.surface.rgb)
		? "collapsed"
		: palette.gradient.isGradient ? "gradient" : "distinct-flat"
}

const [review, manifest, feedback, frontier, results, experiment, protocol, authorization, plan] = await Promise.all([
	source<ReviewAnalysis>(files.reviewAnalysis),
	source<unknown>(files.reviewManifest),
	source<unknown>(files.reviewFeedback),
	source<{ experimentId: string; entries: FrontierEntry[] }>(files.frontier),
	source<{ experimentId: string; entries: ResultEntry[] }>(files.results),
	source<ExperimentAnalysis>(files.experimentAnalysis),
	source<Protocol>(files.protocol),
	source<Authorization>(files.authorization),
	readFile(files.plan),
])
if (review.value.experimentId !== EXPERIMENT_ID || review.value.manifestId !== REVIEW_MANIFEST_ID ||
	frontier.value.experimentId !== EXPERIMENT_ID || results.value.experimentId !== EXPERIMENT_ID ||
	experiment.value.experimentId !== EXPERIMENT_ID || authorization.value.experimentId !== EXPERIMENT_ID ||
	!review.value.coverage.complete || review.value.coverage.expected !== 9 || review.value.coverage.submitted !== 9 ||
	review.value.coverage.eligible !== 9 || review.value.coverage.ineligible !== 0 || review.value.comments.count !== 1 ||
	frontier.value.entries.length !== 9 || results.value.entries.length !== 9 || !experiment.value.structural.pass ||
	experiment.value.structural.violationCount !== 0 ||
	experiment.value.coverage.ablationStableNoncollapsedFieldCandidates !== 9 ||
	experiment.value.coverage.exactReviewTransfers !== 0 || experiment.value.coverage.freshReviewRequired !== 9 ||
	experiment.value.states["distinct-flat"] !== 6 || experiment.value.states.gradient !== 3 ||
	experiment.value.changes.oneAtom !== 7 || experiment.value.changes.twoAtoms !== 2 ||
	experiment.value.changes.oneBlock !== 9 || !experiment.value.review.authorized ||
	!experiment.value.review.diagnosticOnly || experiment.value.review.freshBlindedComparisonsRequired !== 9 ||
	protocol.value.authorization.broaderReviewAuthorized || protocol.value.authorization.canonicalPromotionAuthorized ||
	protocol.value.authorization.candidateFreezeAuthorized || protocol.value.authorization.reserveAccessAuthorized ||
	protocol.value.authorization.outputUnseenRootsOpened.length !== 0 || !authorization.value.review.authorized ||
	!authorization.value.review.diagnosticOnly || !authorization.value.review.ablationStableNoncollapsedFieldOnly ||
	authorization.value.review.freshBlindedComparisons !== 9 || authorization.value.prohibitions.broaderReviewAuthorized ||
	authorization.value.prohibitions.canonicalPromotionAuthorized || authorization.value.prohibitions.candidateFreezeAuthorized ||
	authorization.value.prohibitions.reserveAccessAuthorized || authorization.value.prohibitions.outputUnseenRootsOpened.length !== 0) {
	throw new Error("Ablation-stable noncollapsed field review evidence is incomplete or inconsistent")
}

const frontierByFile = new Map(frontier.value.entries.map((entry) => [entry.file, entry]))
const resultByFile = new Map(results.value.entries.map((entry) => [entry.file, entry]))
const entries = review.value.entries.map((reviewEntry) => {
	const frontierEntry = frontierByFile.get(reviewEntry.file)
	const result = resultByFile.get(reviewEntry.file)
	if (!frontierEntry || !result || result.certificate.route !== "admitted-field" ||
		result.certificate.selected.stableKey !== result.certificate.canonicalOverlayAblation.stableKey ||
		result.certificate.selected.stableKey !== frontierEntry.selected.stableKey ||
		result.certificate.selected.fieldState === "collapsed" || result.certificate.selected.changedSemanticBlocks !== 1 ||
		(result.certificate.selected.changedSemanticAtoms !== 1 && result.certificate.selected.changedSemanticAtoms !== 2) ||
		result.certificate.selected.objectiveDeltas.some((delta) => delta < -1e-12) ||
		!result.certificate.selected.objectiveDeltas.some((delta) => delta > 1e-12) ||
		frontierEntry.changedRoles.some((role) => role !== "background" && role !== "surface") ||
		(frontierEntry.changedRoles.length === 0 && !frontierEntry.gradientChanged) ||
		!sameRgb(result.candidate.foreground.rgb, result.canonical.foreground.rgb) ||
		!sameRgb(result.candidate.accent.rgb, result.canonical.accent.rgb) ||
		result.structural.violations.length > 0 || Object.values(result.certificate.invariants).some((value) => !value)) {
		throw new Error(`Ablation-stable certificate changed for ${reviewEntry.file}`)
	}
	return {
		...reviewEntry,
		baselineFieldState: fieldState(result.canonical),
		candidateFieldState: result.certificate.selected.fieldState,
		changedRoles: frontierEntry.changedRoles,
		gradientChanged: frontierEntry.gradientChanged,
		changedSemanticBlocks: result.certificate.selected.changedSemanticBlocks,
		changedSemanticAtoms: result.certificate.selected.changedSemanticAtoms,
		objectiveDeltas: result.certificate.selected.objectiveDeltas,
		canonicalOverlayAblationAgrees: true,
	}
})
const positive = new Set<Quality>(["strong", "acceptable-not-ideal"])
const wins = entries.filter((entry) => entry.comparison === "candidate-stronger")
const losses = entries.filter((entry) => entry.comparison === "baseline-stronger")
const gradients = entries.filter((entry) => entry.candidateFieldState === "gradient")
const distinctFlat = entries.filter((entry) => entry.candidateFieldState === "distinct-flat")
if (wins.length !== 7 || losses.length !== 2 || gradients.length !== 3 ||
	gradients.some((entry) => entry.comparison !== "candidate-stronger") || distinctFlat.length !== 6 ||
	entries.some((entry) => entry.sourceEligibility !== "eligible-artwork" || !entry.baselineQuality ||
		!entry.candidateQuality || !positive.has(entry.baselineQuality) || !positive.has(entry.candidateQuality)) ||
	entries.filter((entry) => entry.note.length > 0).length !== 1 ||
	entries.find((entry) => entry.note.length > 0)?.comparison !== "baseline-stronger") {
	throw new Error("Ablation-stable noncollapsed field review outcome changed")
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
		bothPositive: entries.filter((entry) => entry.baselineQuality && entry.candidateQuality &&
			positive.has(entry.baselineQuality) && positive.has(entry.candidateQuality)).length,
		gradientCandidateStronger: gradients.filter((entry) => entry.comparison === "candidate-stronger").length,
		distinctFlatCandidateStronger: distinctFlat.filter((entry) => entry.comparison === "candidate-stronger").length,
		distinctFlatBaselineStronger: distinctFlat.filter((entry) => entry.comparison === "baseline-stronger").length,
	},
	entries,
	findings: [
		{
			class: "noncollapsed-field-admissibility",
			status: "supported-on-complete-evaluated-set",
			finding: "All nine candidates received positive complete-palette quality and no failure class.",
			implication: "Ablation agreement and strict joint dominance identify valid noncollapsed field alternatives in this exact bounded set.",
		},
		{
			class: "noncollapsed-field-ranking",
			status: "promising-but-incomplete",
			finding: "Seven candidates were preferred, but two canonical baselines remained stronger.",
			implication: "Ablation stability is useful ranking evidence but is not sufficient for canonical replacement under the zero-regression gate.",
		},
		{
			class: "field-state-stratification",
			status: "descriptive-only",
			finding: "All three gradient candidates won; distinct-flat candidates split four wins to two losses.",
			implication: "The bounded outcome does not authorize a state-specific rule or another review without a predeclared generalized signal.",
		},
		{
			class: "qualitative-comment",
			status: "retained-not-inferred",
			finding: "One baseline win noted an imperceptible distinction between near-black field endpoints.",
			implication: "The comment may motivate a separate mechanical audit, but cannot supply a color threshold or case-specific selector.",
		},
	],
	successCriteria: {
		structuralViolationsZero: true,
		completeChangedSetReviewed: true,
		noWeakOrUnacceptableCandidateJudgments: true,
		noBaselineStrongerJudgments: false,
		atLeastOneCandidateStrongerJudgment: true,
		constrainedAblationsEvaluated: true,
		pass: false,
	},
	disposition: {
		candidate: "stop-ablation-stable-noncollapsed-field-selector-as-complete-replacement-preserve-canonical-0.19",
		admissibilityEvidenceRetained: true,
		rankingEvidenceRetained: true,
		positiveAlternativeFiles: entries.map((entry) => entry.file),
		exactPreferredTupleFiles: wins.map((entry) => entry.file),
		extractionChangeAuthorized: false,
		freezeAuthorized: false,
		promotionAuthorized: false,
		broaderReviewAuthorized: false,
		reserveAccessAuthorized: false,
		reason: "Two baseline-stronger judgments fail the predeclared zero-regression ranking gate despite positive quality for every candidate.",
	},
	nextEngineeringGate: {
		name: "read-only-noncollapsed-field-ranking-audit",
		candidateOrReviewAuthorized: false,
		requirement: "A predeclared mechanical relation must separate the two baseline wins without filenames, comments, target colors, or thresholds fitted to these outcomes before another candidate or review.",
	},
}
await writeFile(outputPath, `${JSON.stringify(interpretation, null, 2)}\n`, { flag: "wx" })
process.stderr.write(`Wrote ablation-stable noncollapsed field review interpretation to ${outputPath}\n`)
