import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const EXPERIMENT_ID = "43bf44701c2678214e7000e0d426775e3139e8ee01fd3d24b1883e8c4c5cdbd1"
const MANIFEST_ID = "a9c06baadfaae4fd6be0d56ccd8e6c16b63a934dbc74d79c0a965e37f490d2ce"
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const experimentRoot = join(researchRoot, "data/experiments/joint-palette-field-tradeoff-0.1.1-development")
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
const objectiveNames = [
	"background-field-support",
	"field-relation-support",
	"foreground-role-support",
	"foreground-worst-field-apca-magnitude",
	"accent-identity-support",
	"accent-background-apca-magnitude",
] as const
const epsilon = 1e-12

type Quality = "strong" | "acceptable-not-ideal" | "weak-fallback" | "unacceptable" | "uncertain"
type ReviewEntry = {
	caseId: string
	order: number
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
type Palette = {
	background: { rgb: number[] }
	foreground: { rgb: number[] }
	surface: { rgb: number[] }
	accent: { rgb: number[] }
	gradient: { isGradient: boolean }
}
type TradeoffEntry = {
	stableKey: string
	fieldState: "collapsed" | "distinct-flat" | "gradient"
	objectives: number[]
	objectiveDeltas: number[]
}
type FrontierEntry = {
	file: string
	changedRoles: string[]
	gradientChanged: boolean
	baseline: Palette
	candidate: Palette
	selected: TradeoffEntry
}
type ResultsEntry = {
	file: string
	certificate: {
		incumbent: { fieldState: "collapsed" | "distinct-flat" | "gradient"; objectives: number[] }
		selected: TradeoffEntry | null
		frontier: TradeoffEntry[]
	}
}
type ExperimentAnalysis = {
	experimentId: string
	structural: { pass: boolean; violationCount: number }
	coverage: { reviewCases: number }
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
	presentationVersion: string
	review: { authorized: boolean; diagnosticOnly: boolean; freshBlindedComparisons: number }
	prohibitions: {
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

function countBy(values: readonly string[]): Record<string, number> {
	const counts: Record<string, number> = {}
	for (const value of values) counts[value] = (counts[value] ?? 0) + 1
	return counts
}

function state(palette: Palette): "collapsed" | "distinct-flat" | "gradient" {
	return palette.background.rgb.join(",") === palette.surface.rgb.join(",")
		? "collapsed"
		: palette.gradient.isGradient ? "gradient" : "distinct-flat"
}

function dominatesCanonical(deltas: readonly number[]): boolean {
	return deltas.every((delta) => delta >= -epsilon) && deltas.some((delta) => delta > epsilon)
}

const [review, manifest, feedback, frontier, results, experiment, protocol, authorization, plan] = await Promise.all([
	source<ReviewAnalysis>(files.reviewAnalysis),
	source<unknown>(files.reviewManifest),
	source<unknown>(files.reviewFeedback),
	source<{ experimentId: string; entries: FrontierEntry[] }>(files.frontier),
	source<{ experimentId: string; entries: ResultsEntry[] }>(files.results),
	source<ExperimentAnalysis>(files.experimentAnalysis),
	source<Protocol>(files.protocol),
	source<Authorization>(files.authorization),
	readFile(files.plan),
])
if (review.value.experimentId !== EXPERIMENT_ID || review.value.manifestId !== MANIFEST_ID ||
	frontier.value.experimentId !== EXPERIMENT_ID || results.value.experimentId !== EXPERIMENT_ID ||
	experiment.value.experimentId !== EXPERIMENT_ID || authorization.value.experimentId !== EXPERIMENT_ID ||
	!review.value.coverage.complete || review.value.coverage.expected !== 10 || review.value.coverage.submitted !== 10 ||
	review.value.coverage.eligible !== 9 || review.value.coverage.ineligible !== 1 || frontier.value.entries.length !== 10 ||
	experiment.value.coverage.reviewCases !== 10 || !experiment.value.structural.pass ||
	experiment.value.structural.violationCount !== 0 || !experiment.value.review.authorized ||
	!experiment.value.review.diagnosticOnly || experiment.value.review.freshBlindedComparisonsRequired !== 10 ||
	protocol.value.authorization.commentsEnterInference || protocol.value.authorization.canonicalPromotionAuthorized ||
	protocol.value.authorization.candidateFreezeAuthorized || protocol.value.authorization.reserveAccessAuthorized ||
	protocol.value.authorization.outputUnseenRootsOpened.length !== 0 ||
	authorization.value.presentationVersion !== "next-palette-review-presentation-2" ||
	!authorization.value.review.authorized || !authorization.value.review.diagnosticOnly ||
	authorization.value.review.freshBlindedComparisons !== 10 ||
	authorization.value.prohibitions.canonicalPromotionAuthorized ||
	authorization.value.prohibitions.candidateFreezeAuthorized || authorization.value.prohibitions.reserveAccessAuthorized ||
	authorization.value.prohibitions.outputUnseenRootsOpened.length !== 0) {
	throw new Error("Field tradeoff review evidence is incomplete or inconsistent")
}

const frontierByFile = new Map(frontier.value.entries.map((entry) => [entry.file, entry]))
const resultsByFile = new Map(results.value.entries.map((entry) => [entry.file, entry]))
const commentClassifications: Record<string, string[]> = {
	"images/elephunk.jpg": ["compositionally-unrepresentative-source-selection", "overlay-tonal-fit"],
	"00/ab67616d0000b2730000815d21f7ab8af797032a.jpg": ["field-state-calibration", "secondary-accent-surface-relation"],
	"00/ab67616d00001e02000040a5c7989893034f93f3.jpg": ["field-collapse-ranking", "compositionally-unrepresentative-source-selection"],
	"00/ab67616d0000b2730000061ba1faa181d8e4fca9.jpg": ["field-state-calibration", "identity-coverage"],
}
const entries = review.value.entries.map((reviewEntry) => {
	const frontierEntry = frontierByFile.get(reviewEntry.file)
	const result = resultsByFile.get(reviewEntry.file)
	if (!frontierEntry || !result || !result.certificate.selected ||
		result.certificate.selected.stableKey !== frontierEntry.selected.stableKey) {
		throw new Error(`Tradeoff certificate changed for ${reviewEntry.file}`)
	}
	const baselineState = state(frontierEntry.baseline)
	const candidateState = state(frontierEntry.candidate)
	if (baselineState !== result.certificate.incumbent.fieldState || candidateState !== frontierEntry.selected.fieldState) {
		throw new Error(`Field state changed for ${reviewEntry.file}`)
	}
	const strictCanonicalDominators = result.certificate.frontier.filter((entry) =>
		dominatesCanonical(entry.objectiveDeltas)).length
	return {
		...reviewEntry,
		baselineState,
		candidateState,
		changedRoles: frontierEntry.changedRoles,
		gradientChanged: frontierEntry.gradientChanged,
		objectiveDeltas: Object.fromEntries(objectiveNames.map((name, index) =>
			[name, frontierEntry.selected.objectiveDeltas[index]])),
		improvedObjectives: objectiveNames.filter((_, index) => frontierEntry.selected.objectiveDeltas[index] > epsilon),
		unchangedObjectives: objectiveNames.filter((_, index) =>
			Math.abs(frontierEntry.selected.objectiveDeltas[index]) <= epsilon),
		sacrificedObjectives: objectiveNames.filter((_, index) => frontierEntry.selected.objectiveDeltas[index] < -epsilon),
		selectedStrictlyDominatesCanonical: dominatesCanonical(frontierEntry.selected.objectiveDeltas),
		strictCanonicalDominatorsInFrontier: strictCanonicalDominators,
		commentClassifications: commentClassifications[reviewEntry.file] ?? [],
	}
})
if (entries.filter((entry) => entry.sourceEligibility === "eligible-artwork").length !== 9 ||
	entries.filter((entry) => entry.note.length > 0).length !== review.value.comments.count ||
	Object.keys(commentClassifications).some((file) => !entries.some((entry) => entry.file === file && entry.note.length > 0))) {
	throw new Error("Field tradeoff comments changed")
}

const eligible = entries.filter((entry) => entry.sourceEligibility === "eligible-artwork")
const positive = new Set<Quality>(["strong", "acceptable-not-ideal"])
const objectiveSigns = Object.fromEntries(objectiveNames.map((name) => [name, {
	improved: eligible.filter((entry) => entry.improvedObjectives.includes(name)).length,
	unchanged: eligible.filter((entry) => entry.unchangedObjectives.includes(name)).length,
	sacrificed: eligible.filter((entry) => entry.sacrificedObjectives.includes(name)).length,
}]))
const strictDominatorCases = eligible.filter((entry) => entry.strictCanonicalDominatorsInFrontier > 0)
const result = {
	schemaVersion: 1,
	experimentId: EXPERIMENT_ID,
	reviewManifestId: MANIFEST_ID,
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
		eligible: eligible.length,
		ineligible: entries.length - eligible.length,
		baselinePositive: eligible.filter((entry) => entry.baselineQuality && positive.has(entry.baselineQuality)).length,
		candidatePositive: eligible.filter((entry) => entry.candidateQuality && positive.has(entry.candidateQuality)).length,
		candidateStronger: eligible.filter((entry) => entry.comparison === "candidate-stronger").length,
		baselineStronger: eligible.filter((entry) => entry.comparison === "baseline-stronger").length,
		bothSimilarlyValid: eligible.filter((entry) => entry.comparison === "both-similarly-valid").length,
		candidateWeakOrUnacceptable: eligible.filter((entry) =>
			entry.candidateQuality === "weak-fallback" || entry.candidateQuality === "unacceptable").length,
		selectedStrictCanonicalDominators: eligible.filter((entry) => entry.selectedStrictlyDominatesCanonical).length,
		casesWithUnreviewedStrictCanonicalDominators: strictDominatorCases.length,
		unreviewedStrictCanonicalDominators: strictDominatorCases.reduce((sum, entry) =>
			sum + entry.strictCanonicalDominatorsInFrontier, 0),
		baselineStates: countBy(eligible.map((entry) => entry.baselineState)),
		candidateStates: countBy(eligible.map((entry) => entry.candidateState)),
		changedRoleIncidence: countBy(eligible.flatMap((entry) => entry.changedRoles)),
		objectiveSigns,
	},
	entries,
	findings: [
		{
			class: "dominance-routing",
			status: "proven",
			finding: "Three reviewed minimax-regret selections came from frontiers containing nine strict canonical dominators, while none of the selected tuples strictly dominated canonical.",
			implication: "Partition strict dominators from incomparable tradeoffs and invoke tradeoff review only when the strict-dominator set is empty.",
		},
		{
			class: "objective-concentration",
			status: "proven",
			finding: "Primary accent-on-background APCA improved in all nine eligible selections while foreground worst-field APCA fell in eight; human outcomes remained mixed.",
			implication: "The current minimax tradeoff pattern is not a reliable complete-palette quality selector.",
		},
		{
			class: "joint-potential",
			status: "proven",
			finding: "Four candidates were preferred and two were strong, but three baselines were preferred and two candidates were unacceptable.",
			implication: "Coupled field and overlay changes can help, but the current selector cannot support a general extraction change.",
		},
		{
			class: "field-state-calibration",
			status: "supported-hypothesis",
			finding: "Three of four comments challenge the selected field state: two gradients and one collapse.",
			implication: "Field-state suitability remains under-modeled, but four comments do not identify a replacement rule.",
		},
		{
			class: "secondary-relations",
			status: "supported-hypothesis",
			finding: "One candidate-stronger judgment identifies weak accent-on-surface contrast, which is outside the six selection objectives.",
			implication: "Retain this relation as a future coupled objective candidate without deriving a threshold from one case.",
		},
		{
			class: "source-representativeness",
			status: "supported-hypothesis",
			finding: "Two comments could not recognize selected source-exact colors as compositionally belonging to the artwork.",
			implication: "Source occurrence alone may not encode spatial, population, or compositional relevance.",
		},
	],
	successCriteria: {
		structuralViolationsZero: true,
		completeChangedSetReviewed: true,
		noWeakOrUnacceptableCandidateJudgments: false,
		noBaselineStrongerJudgments: false,
		atLeastOneCandidateStrongerJudgment: true,
		constrainedAblationsEvaluated: false,
		pass: false,
	},
	disposition: {
		candidate: "stop-current-tradeoff-selector-preserve-canonical-0.19",
		extractionChangeAuthorized: false,
		freezeAuthorized: false,
		promotionAuthorized: false,
		broaderReviewAuthorized: false,
		reserveAccessAuthorized: false,
		reason: "The diagnostic is complete and informative but fails the complete-palette quality and no-baseline-regression gates; reviewed tuples are not transferable to unreviewed strict dominators.",
	},
	nextEngineeringStep: {
		name: "dominance-first-complete-tuple-routing",
		authorizedReview: false,
		steps: [
			"Partition each complete-tuple frontier into strict canonical dominators and incomparable tradeoffs.",
			"Route strict dominators through the Stage 5 minimum-block, within-class Pareto, changed-atom, stable-identity selector with constrained ablations.",
			"Invoke minimax-regret tradeoff review only when the strict-dominator set is empty.",
			"Encode the routing condition as a structural invariant before requesting review of any newly selected exact tuples.",
		],
	},
}
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" })
process.stderr.write(`Wrote field tradeoff review interpretation to ${outputPath}\n`)
