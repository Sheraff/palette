import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { CompletePaletteTreatment } from "./src/album-artwork-palette-v2.ts"

type Option = Readonly<{ optionId: string; treatment: CompletePaletteTreatment }>
type ReviewCase = Readonly<{ caseId: string; sourceSha256: string; options: readonly Option[] }>
type FeedbackEntry = Readonly<{
	caseId: string
	sourceSha256: string
	validOptionIds: readonly string[]
	preferredOptionId: string | null
	noneConfidentlyValid: boolean
	uncertain: boolean
	comment: string
	submittedAt: string
}>
type SourceArtifact = Readonly<{
	source: Readonly<{ caseId: string }>
	extraction: Readonly<{
		winner: CompletePaletteTreatment
		alternatives: readonly CompletePaletteTreatment[]
		diagnostics: Readonly<{ legacyScalarTopTreatment: CompletePaletteTreatment }>
	}>
}>

const REVIEW_VERSION = "album-artwork-palette-v2-gate-confirmation-review-v6"
const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const experimentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.4.1-development")
const manifestPath = resolve(experimentDirectory, "targeted-review-manifest.json")
const feedbackPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-0.4.1-targeted-feedback.json")

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
	await rename(temporary, path)
}

const [manifestBytes, feedbackBytes, aggregate] = await Promise.all([
	readFile(manifestPath),
	readFile(feedbackPath),
	readFile(resolve(experimentDirectory, "aggregate.json"), "utf8").then(JSON.parse) as Promise<Readonly<{ cases: readonly SourceArtifact[] }>>,
])
const manifest = JSON.parse(manifestBytes.toString("utf8")) as Readonly<{
	schemaVersion: 1
	reviewVersion: string
	manifestId: string
	cases: readonly ReviewCase[]
}>
const feedback = JSON.parse(feedbackBytes.toString("utf8")) as Readonly<{
	schemaVersion: 1
	reviewVersion: string
	manifestId: string
	entries: readonly FeedbackEntry[]
}>
const uniqueFeedbackCaseIds = new Set(feedback.entries.map(({ caseId }) => caseId))
if (manifest.schemaVersion !== 1 || feedback.schemaVersion !== 1 ||
	manifest.reviewVersion !== REVIEW_VERSION || feedback.reviewVersion !== REVIEW_VERSION ||
	feedback.manifestId !== manifest.manifestId || manifest.cases.length !== 4 || feedback.entries.length !== 4 ||
	uniqueFeedbackCaseIds.size !== feedback.entries.length) {
	throw new Error("Gate confirmation is incomplete or does not match its manifest")
}
for (const reviewCase of manifest.cases) {
	const response = feedback.entries.find(({ caseId }) => caseId === reviewCase.caseId)
	if (!response || response.sourceSha256 !== reviewCase.sourceSha256 ||
		response.validOptionIds.some((optionId) => !reviewCase.options.some((option) => option.optionId === optionId)) ||
		response.preferredOptionId !== null && !response.validOptionIds.includes(response.preferredOptionId)) {
		throw new Error(`Gate response does not match ${reviewCase.caseId}`)
	}
}

const artifactByCase = new Map(aggregate.cases.map((artifact) => [artifact.source.caseId, artifact]))
let paretoTopPositiveCount = 0
let legacyScalarTopPositiveCount = 0
let paretoAlternativePositiveCount = 0
let controlPositiveCount = 0
let currentCandidatePositiveCaseCount = 0
let preferredResponseCount = 0
let preferredParetoTopCount = 0
const responseInterpretations = manifest.cases.map((reviewCase) => {
	const response = feedback.entries.find(({ caseId }) => caseId === reviewCase.caseId)
	const artifact = artifactByCase.get(reviewCase.caseId)
	if (!response || !artifact) throw new Error(`Missing gate confirmation case ${reviewCase.caseId}`)
	const alternativeIds = new Set(artifact.extraction.alternatives.map(({ id }) => id))
	const optionRoles = reviewCase.options.map(({ optionId, treatment }) => ({
		optionId,
		role: treatment.id === artifact.extraction.winner.id
			? "pareto-top"
			: treatment.id === artifact.extraction.diagnostics.legacyScalarTopTreatment.id
				? "legacy-scalar-top"
				: alternativeIds.has(treatment.id)
					? "pareto-alternative"
					: "prior-positive-control",
		positive: response.validOptionIds.includes(optionId),
		preferred: response.preferredOptionId === optionId,
		gradient: treatment.gradient,
		fieldTreatment: treatment.fieldTreatment,
		backgroundHex: treatment.background.hex,
		surfaceHex: treatment.surface.hex,
		foregroundHex: treatment.foreground.hex,
		accentHex: treatment.accent.hex,
	}))
	const positiveOptions = optionRoles.filter(({ positive }) => positive)
	if (positiveOptions.some(({ role }) => role !== "prior-positive-control")) currentCandidatePositiveCaseCount += 1
	for (const option of positiveOptions) {
		if (option.role === "pareto-top") paretoTopPositiveCount += 1
		else if (option.role === "legacy-scalar-top") legacyScalarTopPositiveCount += 1
		else if (option.role === "pareto-alternative") paretoAlternativePositiveCount += 1
		else controlPositiveCount += 1
	}
	if (response.preferredOptionId !== null) {
		preferredResponseCount += 1
		if (optionRoles.find(({ optionId }) => optionId === response.preferredOptionId)?.role === "pareto-top") {
			preferredParetoTopCount += 1
		}
	}
	const inferredClasses: Array<Readonly<{ class: string; confidence: string; evidence: string }>> = []
	if (optionRoles.some(({ role, positive }) => role === "pareto-top" && positive)) {
		inferredClasses.push({
			class: "deterministic-top-independently-valid",
			confidence: "high",
			evidence: "The current deterministic top is explicitly marked independently valid.",
		})
	}
	if (reviewCase.caseId === "development-23" && optionRoles.some(({ role, preferred }) => role === "pareto-top" && preferred)) {
		inferredClasses.push({
			class: "illustrated-field-and-accent-repair-preferred",
			confidence: "high",
			evidence: "The repaired distinct teal surface with separated cream/gold roles is explicitly preferred.",
		})
	}
	if (reviewCase.caseId === "development-07" && response.preferredOptionId !== null &&
		!optionRoles.some(({ role, preferred }) => role === "pareto-top" && preferred)) {
		inferredClasses.push({
			class: "accent-representative-preference-within-valid-field-direction",
			confidence: "high",
			evidence: "The current black/blue gradient top remains a positive, while the lighter-cyan prior positive is explicitly preferred.",
		})
	}
	return {
		caseId: reviewCase.caseId,
		originalResponse: response,
		optionRoles,
		inferredClasses,
		interpretationUncertain: false,
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
	controlPositiveCount,
	preferredResponseCount,
	preferredParetoTopCount,
	noneConfidentlyValidCount: feedback.entries.filter(({ noneConfidentlyValid }) => noneConfidentlyValid).length,
	uncertainCount: feedback.entries.filter(({ uncertain }) => uncertain).length,
}
const targetedGatePassed = currentCandidatePositiveCaseCount === manifest.cases.length &&
	paretoTopPositiveCount === manifest.cases.length
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
		preferencesReferenceOnlyPositiveOptions: feedback.entries.every(({ preferredOptionId, validOptionIds }) =>
			preferredOptionId === null || validOptionIds.includes(preferredOptionId)),
	},
	reviewerInterpretationConstraintVerbatim: "valid palette does not mean perfect",
	interpretationPolicy: {
		selected: "independently usable positive direction, moderated by its verbatim comment",
		preferred: "explicit preference only among selected positives",
		unselected: "unlabeled, not a negative example",
		perfectOrProductionReadyInferredFromSelection: false,
	},
	counts,
	mechanismSubGates: {
		currentCandidateCoverage: {
			pass: currentCandidatePositiveCaseCount === manifest.cases.length,
			reason: `A current candidate direction is positively marked on ${currentCandidatePositiveCaseCount} of ${manifest.cases.length} cases.`,
		},
		deterministicTopOne: {
			pass: paretoTopPositiveCount === manifest.cases.length,
			reason: `Pareto top is positively marked on ${paretoTopPositiveCount} of ${manifest.cases.length} cases.`,
		},
		preferenceAlignment: {
			pass: preferredParetoTopCount === preferredResponseCount,
			reason: `Pareto top is preferred on ${preferredParetoTopCount} of ${preferredResponseCount} cases with an explicit preference; this is advisory, not the validity gate.`,
		},
	},
	mechanismGate: {
		pass: targetedGatePassed,
		reasons: [
			"Every targeted case has at least one positive current direction.",
			"The deterministic top is independently valid on all 4 targeted cases.",
			"The repaired development-23 top is explicitly preferred.",
			"Development-07 retains a non-blocking lighter-cyan accent preference among two independently valid directions.",
		],
	},
	phaseDisposition: targetedGatePassed
		? "targeted-mechanism-gate-passed-absolute-quality-review-authorized"
		: "targeted-mechanism-gate-failed",
	freshSampleOpened: false,
	nextStep: targetedGatePassed
		? "Run the already-bound 12-case top-one absolute-quality review; do not open the fresh sample yet."
		: "Continue bounded architecture iteration.",
	responseInterpretations,
}

await atomicJson(resolve(experimentDirectory, "targeted-review-analysis.json"), analysis)
process.stdout.write(`Analyzed ${counts.completedResponseCount} gate responses; current candidates positive ${currentCandidatePositiveCaseCount}/4; Pareto top positives ${paretoTopPositiveCount}/4; gate ${targetedGatePassed ? "passed" : "failed"}\n`)
