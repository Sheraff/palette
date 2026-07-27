import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { CompletePaletteTreatment } from "./src/album-artwork-palette-v2.ts"

type Option = Readonly<{ optionId: string; treatment: CompletePaletteTreatment }>
type ReviewCase = Readonly<{ caseId: string; sourceSha256: string; options: readonly Option[] }>
type ReviewManifest = Readonly<{
	schemaVersion: 1
	reviewVersion: string
	manifestId: string
	cases: readonly ReviewCase[]
}>
type FeedbackEntry = Readonly<{
	caseId: string
	sourceSha256: string
	validOptionIds: readonly string[]
	noneConfidentlyValid: boolean
	uncertain: boolean
	comment: string
	submittedAt: string
}>
type FeedbackStore = Readonly<{
	schemaVersion: 1
	reviewVersion: string
	manifestId: string
	entries: readonly FeedbackEntry[]
}>
type SourceArtifact = Readonly<{
	source: Readonly<{ caseId: string }>
	extraction: Readonly<{
		winner: CompletePaletteTreatment
		alternatives: readonly CompletePaletteTreatment[]
		diagnostics: Readonly<{ legacyScalarTopTreatment: CompletePaletteTreatment }>
	}>
}>

const REVIEW_VERSION = "album-artwork-palette-v2-pareto-mechanism-review-v4"
const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const experimentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.3.3-development")
const predecessorDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.3.2-development")
const manifestPath = resolve(experimentDirectory, "targeted-review-manifest.json")
const feedbackPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-0.3.3-targeted-feedback.json")

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
	await rename(temporary, path)
}

const [manifestBytes, feedbackBytes, aggregate, predecessorManifest, predecessorFeedback] = await Promise.all([
	readFile(manifestPath),
	readFile(feedbackPath),
	readFile(resolve(experimentDirectory, "aggregate.json"), "utf8").then(JSON.parse) as Promise<Readonly<{ cases: readonly SourceArtifact[] }>>,
	readFile(resolve(predecessorDirectory, "targeted-review-manifest.json"), "utf8").then(JSON.parse) as Promise<ReviewManifest>,
	readFile(resolve(moduleDirectory, "data/album-artwork-palette-v2-0.3.2-targeted-feedback.json"), "utf8").then(JSON.parse) as Promise<FeedbackStore>,
])
const manifest = JSON.parse(manifestBytes.toString("utf8")) as ReviewManifest
const feedback = JSON.parse(feedbackBytes.toString("utf8")) as FeedbackStore
const uniqueFeedbackCaseIds = new Set(feedback.entries.map(({ caseId }) => caseId))
if (manifest.schemaVersion !== 1 || feedback.schemaVersion !== 1 ||
	manifest.reviewVersion !== REVIEW_VERSION || feedback.reviewVersion !== REVIEW_VERSION ||
	feedback.manifestId !== manifest.manifestId || manifest.cases.length !== 4 || feedback.entries.length !== 4 ||
	uniqueFeedbackCaseIds.size !== feedback.entries.length) {
	throw new Error("Targeted review is incomplete or does not match its manifest")
}
for (const reviewCase of manifest.cases) {
	const response = feedback.entries.find(({ caseId }) => caseId === reviewCase.caseId)
	if (!response || response.sourceSha256 !== reviewCase.sourceSha256 ||
		response.validOptionIds.some((optionId) => !reviewCase.options.some((option) => option.optionId === optionId))) {
		throw new Error(`Targeted response does not match ${reviewCase.caseId}`)
	}
}

const predecessorCases = new Map(predecessorManifest.cases.map((reviewCase) => [reviewCase.caseId, reviewCase]))
const predecessorPositiveTreatmentIds = new Map<string, Set<string>>()
for (const response of predecessorFeedback.entries) {
	const reviewCase = predecessorCases.get(response.caseId)
	if (!reviewCase) throw new Error(`Missing predecessor review case ${response.caseId}`)
	predecessorPositiveTreatmentIds.set(response.caseId, new Set(response.validOptionIds.map((optionId) => {
		const option = reviewCase.options.find((candidate) => candidate.optionId === optionId)
		if (!option) throw new Error(`Missing predecessor option ${response.caseId}/${optionId}`)
		return option.treatment.id
	})))
}

const artifactByCase = new Map(aggregate.cases.map((artifact) => [artifact.source.caseId, artifact]))
let paretoTopPositiveCount = 0
let legacyScalarTopPositiveCount = 0
let paretoAlternativePositiveCount = 0
let predecessorControlOnlyPositiveCount = 0
let predecessorPositiveControlSelectedCount = 0
let currentCandidatePositiveCaseCount = 0
const responseInterpretations = manifest.cases.map((reviewCase) => {
	const response = feedback.entries.find(({ caseId }) => caseId === reviewCase.caseId)
	const artifact = artifactByCase.get(reviewCase.caseId)
	if (!response || !artifact) throw new Error(`Missing targeted review case ${reviewCase.caseId}`)
	const alternativeIds = new Set(artifact.extraction.alternatives.map(({ id }) => id))
	const predecessorPositiveIds = predecessorPositiveTreatmentIds.get(reviewCase.caseId) ?? new Set<string>()
	const optionRoles = reviewCase.options.map(({ optionId, treatment }) => ({
		optionId,
		role: treatment.id === artifact.extraction.winner.id
			? "pareto-top"
			: treatment.id === artifact.extraction.diagnostics.legacyScalarTopTreatment.id
				? "legacy-scalar-top"
				: alternativeIds.has(treatment.id)
					? "pareto-alternative"
					: predecessorPositiveIds.has(treatment.id)
						? "predecessor-positive-control"
						: "unclassified",
		positive: response.validOptionIds.includes(optionId),
		predecessorPositiveControl: predecessorPositiveIds.has(treatment.id),
		gradient: treatment.gradient,
		backgroundHex: treatment.background.hex,
		surfaceHex: treatment.surface.hex,
	}))
	if (optionRoles.some(({ role }) => role === "unclassified")) throw new Error(`Unclassified option in ${reviewCase.caseId}`)
	const positiveOptions = optionRoles.filter(({ positive }) => positive)
	if (positiveOptions.some(({ role }) => role !== "predecessor-positive-control")) currentCandidatePositiveCaseCount += 1
	for (const option of positiveOptions) {
		if (option.predecessorPositiveControl) predecessorPositiveControlSelectedCount += 1
		if (option.role === "pareto-top") paretoTopPositiveCount += 1
		else if (option.role === "legacy-scalar-top") legacyScalarTopPositiveCount += 1
		else if (option.role === "pareto-alternative") paretoAlternativePositiveCount += 1
		else predecessorControlOnlyPositiveCount += 1
	}
	const inferredClasses: Array<Readonly<{ class: string; confidence: string; evidence: string }>> = []
	if (positiveOptions.length > 0 && positiveOptions.every(({ role }) => role === "predecessor-positive-control")) {
		inferredClasses.push({
			class: "current-candidate-direction-not-positively-established",
			confidence: "medium",
			evidence: "Only the immediate-predecessor positive control was selected; current omissions remain unlabeled rather than negative.",
		})
	}
	if (positiveOptions.some(({ role }) => role === "pareto-alternative") &&
		!positiveOptions.some(({ role }) => role === "pareto-top" || role === "legacy-scalar-top")) {
		inferredClasses.push({
			class: "top-one-ranking-not-resolved",
			confidence: "medium",
			evidence: "Current Pareto alternatives were selected while neither current top direction was selected; omissions remain unlabeled rather than negative.",
		})
	}
	if (reviewCase.caseId === "development-07" && response.comment.length > 0) {
		inferredClasses.push({
			class: "gradient-field-role-orientation",
			confidence: "high",
			evidence: `Reviewer verbatim: ${response.comment}`,
		})
	}
	return {
		caseId: reviewCase.caseId,
		originalResponse: response,
		optionRoles,
		inferredClasses,
		interpretationUncertain: inferredClasses.some(({ confidence }) => confidence === "medium"),
	}
})

const counts = {
	caseCount: manifest.cases.length,
	completedResponseCount: feedback.entries.length,
	caseWithPositiveCount: feedback.entries.filter(({ validOptionIds }) => validOptionIds.length > 0).length,
	currentCandidatePositiveCaseCount,
	totalPositiveMarks: feedback.entries.reduce((sum, { validOptionIds }) => sum + validOptionIds.length, 0),
	paretoTopPositiveCount,
	legacyScalarTopPositiveCount,
	paretoAlternativePositiveCount,
	predecessorControlOnlyPositiveCount,
	predecessorPositiveControlSelectedCount,
	noneConfidentlyValidCount: feedback.entries.filter(({ noneConfidentlyValid }) => noneConfidentlyValid).length,
	uncertainCount: feedback.entries.filter(({ uncertain }) => uncertain).length,
}
const analysis = {
	schemaVersion: 1,
	reviewVersion: REVIEW_VERSION,
	manifestId: manifest.manifestId,
	manifestSha256: sha256(manifestBytes),
	feedbackSha256: sha256(feedbackBytes),
	storeIntegrity: {
		manifestCaseCount: manifest.cases.length,
		storedEntryCount: feedback.entries.length,
		uniqueCaseCount: uniqueFeedbackCaseIds.size,
		lastWriteWins: true,
	},
	reviewerInterpretationConstraintVerbatim: "valid palette does not mean perfect",
	interpretationPolicy: {
		selected: "independently usable positive direction, moderated by its verbatim comment",
		unselected: "unlabeled, not a negative example",
		perfectOrProductionReadyInferredFromSelection: false,
	},
	counts,
	mechanismSubGates: {
		blackBlueGradientAvailability: {
			pass: responseInterpretations.some(({ caseId, optionRoles }) => caseId === "development-07" &&
				optionRoles.some(({ positive, gradient, role }) => positive && gradient && role !== "predecessor-positive-control")),
			reason: "Current black-to-blue gradient directions are positively marked, subject to the verbatim field-role orientation defect.",
		},
		currentCandidateCoverage: {
			pass: currentCandidatePositiveCaseCount === manifest.cases.length,
			reason: `A current candidate direction is positively marked on ${currentCandidatePositiveCaseCount} of ${manifest.cases.length} cases.`,
		},
		deterministicTopOne: {
			pass: paretoTopPositiveCount === manifest.cases.length,
			reason: `Pareto top is positively marked on ${paretoTopPositiveCount} of ${manifest.cases.length} cases.`,
		},
		gradientFieldRoleOrientation: {
			pass: false,
			reason: "The development-07 comment says the selected gradients reverse the artwork-matching black background and blue surface roles.",
		},
	},
	mechanismGate: {
		pass: false,
		reasons: [
			"Black-to-blue gradient availability is repaired: two current gradient directions are qualified positives on development-07.",
			"A current candidate direction is positively marked on all 4 cases, but development-24 selects only its retained flat Pareto alternative rather than a shown current gradient direction.",
			"Pareto top is positively marked on only 1 of 4 cases; deterministic top-one selection remains unresolved.",
			"The selected development-07 gradients retain an explicit background/surface orientation defect.",
		],
	},
	nextGeneralChanges: [
		"Keep the broad 12-artwork absolute-quality review blocked; targeted validity is not absolute quality.",
		"Preserve the repaired paired-corridor availability and existing stripe/object-lighting rejection while orienting gradient field roles from broad spatial ownership.",
		"Keep materially distinct flat and gradient directions in retained and targeted slates when both survive Pareto filtering; development-24 confirms that its retained flat direction remains the positive one.",
		"Revisit deterministic top-one ranking using only the qualified-positive evidence and verbatim defects; do not treat unselected options as negatives.",
	],
	responseInterpretations,
}

await atomicJson(resolve(experimentDirectory, "targeted-review-analysis.json"), analysis)
process.stdout.write(`Analyzed ${counts.completedResponseCount} moderated targeted responses; current candidates positive ${currentCandidatePositiveCaseCount}/4; Pareto top positives ${paretoTopPositiveCount}/4\n`)
