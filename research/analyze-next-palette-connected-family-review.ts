import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const EXPERIMENT_ID = "4956afc31f06ffe17a4503057f4c89ee9dc884ae81d330ada6d0cf03c6e94b99"
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const experimentRoot = join(researchRoot, "data/experiments/next-palette-0.4.0-connected-family-development")
const reviewRoot = join(experimentRoot, "review-v1")
const files = {
	reviewAnalysis: join(reviewRoot, "batch-01-analysis.json"),
	reviewManifest: join(reviewRoot, "batch-01-manifest.json"),
	reviewFeedback: join(reviewRoot, "batch-01-feedback.json"),
	experimentAnalysis: join(experimentRoot, "analysis.json"),
	availabilityEvaluation: join(researchRoot,
		"data/experiments/connected-family-candidate-availability-0.1.0-development/evaluation.json"),
}
const outputPath = join(reviewRoot, "interpretation.json")

type ReviewEntry = {
	caseId: string
	file: string
	baselineQuality: string
	candidateQuality: string
	comparison: string
	note: string
}
type ReviewAnalysis = {
	experimentId: string
	manifestId: string
	coverage: { expected: number; submitted: number; eligible: number; complete: boolean }
	quality: { baseline: Record<string, number>; candidate: Record<string, number> }
	comparison: Record<string, number>
	entries: ReviewEntry[]
}
type ExperimentAnalysis = {
	experimentId: string
	structural: { pass: boolean; violationCount: number }
	knownAvailabilityCohort: { total: number; withProposals: number; withSelectedReserve: number }
}
type AvailabilityEvaluation = {
	experimentId: string
	structural: { pass: boolean; violationCount: number }
	knownAvailabilityCohort: { total: number; withProposals: number; pass: boolean }
}

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

async function source<T>(path: string): Promise<{ raw: Buffer; value: T; sha256: string }> {
	const raw = await readFile(path)
	return { raw, value: JSON.parse(raw.toString("utf8")) as T, sha256: sha256(raw) }
}

const [review, manifest, feedback, experiment, availability] = await Promise.all([
	source<ReviewAnalysis>(files.reviewAnalysis),
	source<unknown>(files.reviewManifest),
	source<unknown>(files.reviewFeedback),
	source<ExperimentAnalysis>(files.experimentAnalysis),
	source<AvailabilityEvaluation>(files.availabilityEvaluation),
])
if (review.value.experimentId !== EXPERIMENT_ID || experiment.value.experimentId !== EXPERIMENT_ID ||
	!review.value.coverage.complete || review.value.coverage.expected !== 4 || review.value.coverage.submitted !== 4 ||
	review.value.coverage.eligible !== 4 || !experiment.value.structural.pass || experiment.value.structural.violationCount !== 0 ||
	!availability.value.structural.pass || availability.value.structural.violationCount !== 0 ||
	!availability.value.knownAvailabilityCohort.pass || availability.value.knownAvailabilityCohort.total !== 6 ||
	availability.value.knownAvailabilityCohort.withProposals !== 6) {
	throw new Error("Connected family review evidence is incomplete or inconsistent")
}

const interpretationByFile: Record<string, { findings: string[]; unresolved: string[] }> = {
	"00/ab67616d0000b273000062690f9a82145c2fb5df.jpg": {
		findings: [
			"Complete-tuple ranking recognizes useful yellow source mass but assigns it to the background, displacing the stronger cyan field while the available connected yellow family remains unselected.",
		],
		unresolved: ["field-versus-overlay role allocation", "multi-family palette composition"],
	},
	"00/ab67616d0000b27300008ad6e30f36f723c5a4f0.jpg": {
		findings: [
			"The revised relation ranking improves the gradient endpoint, but the preserved gold family remains unselected and the explicit 60 Lc foreground policy still authorizes generated white instead of source black.",
		],
		unresolved: ["connected-family role ranking", "consumer-specific foreground APCA policy"],
	},
	"00/ab67616d0000b27300001b7dc13511d828fe5536.jpg": {
		findings: [
			"Selecting the preserved yellow family is a material improvement, while its exact representative is shifted toward green and the field pair still collapses two source-visible blue shades.",
		],
		unresolved: ["connected-family representative fidelity", "field collapse ranking"],
	},
	"images/horrorwood.jpg": {
		findings: [
			"The selected connected beige family is acceptable and improves contrast, but source evidence alone still ranks it ahead of the alternative red or blue identity families and the gray field remains collapsed.",
		],
		unresolved: ["ambiguous connected-family role importance", "field collapse ranking"],
	},
}
for (const entry of review.value.entries) {
	if (!interpretationByFile[entry.file]) throw new Error(`Unexpected connected family review case: ${entry.file}`)
}

const positive = new Set(["strong", "acceptable-not-ideal"])
const candidatePositive = review.value.entries.filter((entry) => positive.has(entry.candidateQuality)).length
const baselinePositive = review.value.entries.filter((entry) => positive.has(entry.baselineQuality)).length
const candidateStronger = review.value.entries.filter((entry) => entry.comparison === "candidate-stronger").length
const baselineStronger = review.value.entries.filter((entry) => entry.comparison === "baseline-stronger").length
const result = {
	schemaVersion: 1,
	experimentId: EXPERIMENT_ID,
	reviewManifestId: review.value.manifestId,
	generatedAt: new Date().toISOString(),
	provenance: {
		"batch-01-analysis.json": review.sha256,
		"batch-01-manifest.json": manifest.sha256,
		"batch-01-feedback.json": feedback.sha256,
		"../analysis.json": experiment.sha256,
		"../../connected-family-candidate-availability-0.1.0-development/evaluation.json": availability.sha256,
		analyzerSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
	},
	policy: {
		diagnosticOnly: true,
		commentsDoNotEnterInference: true,
		targetColorsInferred: false,
		positiveJudgmentsAreNonExclusive: true,
		promotionAuthorized: false,
	},
	summary: {
		reviewed: review.value.entries.length,
		baselinePositive,
		candidatePositive,
		candidateStronger,
		baselineStronger,
		availabilityCasesWithProposals: availability.value.knownAvailabilityCohort.withProposals,
		availabilityCasesWithSelectedReserve: experiment.value.knownAvailabilityCohort.withSelectedReserve,
	},
	entries: review.value.entries.map((entry) => ({
		...entry,
		...interpretationByFile[entry.file],
	})),
	findings: [
		{
			class: "candidate-availability",
			finding: "All six known missing-family cases now retain source-exact connected candidates, satisfying the availability stop.",
			implication: "Candidate construction is no longer the sole blocker; do not remove connected-family preservation.",
		},
		{
			class: "complete-tuple-role-allocation",
			finding: "Only two of six availability cases select a reserve, and one four-role reranking regresses because a useful identity family displaces the stronger field instead of complementing it.",
			implication: "Role allocation must distinguish field support from overlay identity without forcing an arbitrary reserve into every palette.",
		},
		{
			class: "representative-fidelity",
			finding: "The selected yellow family improves one case but its exact representative is visibly greener than the connected source identity.",
			implication: "Retain multiple exact representatives or choose representatives from component-local role evidence rather than one hue-window center.",
		},
		{
			class: "consumer-policy",
			finding: "A preserved source foreground can remain unavailable under the font-agnostic 60 Lc diagnostic even when the reviewer identifies source black as the intended text role.",
			implication: "Foreground APCA requirements need an explicit consumer typography contract; do not silently weaken fallback authorization.",
		},
		{
			class: "field-collapse",
			finding: "Two candidate-positive cases still omit a source-visible related surface shade.",
			implication: "Field relation evidence improved false gradients but collapse ranking remains unresolved.",
		},
	],
	disposition: {
		candidate: "development-continue-not-promotable",
		freezeAuthorized: false,
		promotionAuthorized: false,
		broaderReviewAuthorized: false,
		reserveAccessAuthorized: false,
		reason: "The targeted review confirms a directional improvement but also one unacceptable regression and unresolved role allocation, representative fidelity, consumer policy, and field-collapse failures.",
	},
}
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" })
process.stderr.write(`Wrote connected family review interpretation to ${outputPath}\n`)
