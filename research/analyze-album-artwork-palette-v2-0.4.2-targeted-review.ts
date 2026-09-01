import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

type ReviewOption = Readonly<{
	optionId: string
	treatment: Readonly<{ id: string }>
}>

type ReviewCase = Readonly<{
	caseId: string
	sourceSha256: string
	options: readonly ReviewOption[]
}>

type ReviewManifest = Readonly<{
	reviewVersion: string
	manifestId: string
	candidateVersion: string
	implementationHash: string
	scientificSha256: string
	cases: readonly ReviewCase[]
}>

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

type FeedbackStore = Readonly<{
	reviewVersion: string
	manifestId: string
	entries: readonly FeedbackEntry[]
}>

type OptionRole = Readonly<{
	optionId: string
	currentParetoTop: boolean
	predecessorParetoTop: boolean
	currentLegacyScalarTop: boolean
}>

type DevelopmentAnalysis = Readonly<{
	reviewPreparation: Readonly<{
		optionRoles: ReadonlyArray<Readonly<{
			caseId: string
			options: readonly OptionRole[]
		}>>
		foregroundPolarityStatus: string
		freshSampleOpened: false
	}>
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const experimentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.4.2-development")
const manifestPath = resolve(experimentDirectory, "targeted-review-manifest.json")
const feedbackPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-0.4.2-targeted-feedback.json")
const developmentAnalysisPath = resolve(experimentDirectory, "development-analysis.json")
const outputPath = resolve(experimentDirectory, "targeted-review-analysis.json")

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex")
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
	await rename(temporary, path)
}

const [manifestRaw, feedbackRaw, developmentAnalysisRaw] = await Promise.all([
	readFile(manifestPath, "utf8"),
	readFile(feedbackPath, "utf8"),
	readFile(developmentAnalysisPath, "utf8"),
])
const manifest = JSON.parse(manifestRaw) as ReviewManifest
const feedback = JSON.parse(feedbackRaw) as FeedbackStore
const developmentAnalysis = JSON.parse(developmentAnalysisRaw) as DevelopmentAnalysis

assert(feedback.reviewVersion === manifest.reviewVersion, "Feedback review version does not match the manifest")
assert(feedback.manifestId === manifest.manifestId, "Feedback manifest ID does not match the manifest")
assert(feedback.entries.length === manifest.cases.length, "Feedback must cover every targeted case")
assert(developmentAnalysis.reviewPreparation.freshSampleOpened === false, "Fresh sample seal is not closed")

const caseById = new Map(manifest.cases.map((reviewCase) => [reviewCase.caseId, reviewCase]))
const rolesByCase = new Map(developmentAnalysis.reviewPreparation.optionRoles.map((entry) => [entry.caseId, entry.options]))
const seen = new Set<string>()
for (const entry of feedback.entries) {
	const reviewCase = caseById.get(entry.caseId)
	assert(reviewCase, `Unknown feedback case ${entry.caseId}`)
	assert(!seen.has(entry.caseId), `Duplicate feedback case ${entry.caseId}`)
	seen.add(entry.caseId)
	assert(entry.sourceSha256 === reviewCase.sourceSha256, `Source identity mismatch for ${entry.caseId}`)
	assert(Number.isFinite(Date.parse(entry.submittedAt)), `Invalid timestamp for ${entry.caseId}`)
	assert(!(entry.noneConfidentlyValid && entry.uncertain), `Conflicting fallback state for ${entry.caseId}`)
	assert(
		entry.validOptionIds.length > 0 || entry.noneConfidentlyValid || entry.uncertain,
		`Incomplete response for ${entry.caseId}`,
	)
	assert(new Set(entry.validOptionIds).size === entry.validOptionIds.length, `Duplicate valid option for ${entry.caseId}`)
	assert(
		entry.validOptionIds.every((optionId) => reviewCase.options.some((option) => option.optionId === optionId)),
		`Unknown valid option for ${entry.caseId}`,
	)
	assert(
		entry.preferredOptionId === null || entry.validOptionIds.includes(entry.preferredOptionId),
		`Preference must reference a positive option for ${entry.caseId}`,
	)
}

const interpretations = feedback.entries.map((entry) => {
	const roles = rolesByCase.get(entry.caseId)
	assert(roles, `Missing option roles for ${entry.caseId}`)
	return {
		caseId: entry.caseId,
		validOptionIds: entry.validOptionIds,
		preferredOptionId: entry.preferredOptionId,
		noneConfidentlyValid: entry.noneConfidentlyValid,
		uncertain: entry.uncertain,
		comment: entry.comment,
		options: roles.map((role) => ({
			...role,
			independentlyValid: entry.validOptionIds.includes(role.optionId),
			preferred: entry.preferredOptionId === role.optionId,
		})),
	}
})

const currentTopPositiveCount = interpretations.filter(({ options }) =>
	options.some(({ currentParetoTop, independentlyValid }) => currentParetoTop && independentlyValid)).length
const predecessorTopPositiveCount = interpretations.filter(({ options }) =>
	options.some(({ predecessorParetoTop, independentlyValid }) => predecessorParetoTop && independentlyValid)).length
const legacyScalarTopPositiveCount = interpretations.filter(({ options }) =>
	options.some(({ currentLegacyScalarTop, independentlyValid }) => currentLegacyScalarTop && independentlyValid)).length
const totalPositiveMarks = feedback.entries.reduce((sum, entry) => sum + entry.validOptionIds.length, 0)
const surfaceRepair = interpretations.find(({ caseId }) => caseId === "development-16")
const surfaceRegressionControl = interpretations.find(({ caseId }) => caseId === "development-21")
const endpointControls = interpretations.filter(({ caseId }) => caseId === "development-24" || caseId === "development-27")
assert(surfaceRepair && surfaceRegressionControl && endpointControls.length === 2, "Mechanism review cases are incomplete")

const surfaceRepairPass = surfaceRepair.options.some(({ currentParetoTop, independentlyValid }) => currentParetoTop && independentlyValid) &&
	!surfaceRepair.options.some(({ predecessorParetoTop, independentlyValid }) => predecessorParetoTop && independentlyValid)
const surfaceRegressionPass = surfaceRegressionControl.options.some(({ currentParetoTop, independentlyValid }) => currentParetoTop && independentlyValid) &&
	surfaceRegressionControl.options.some(({ predecessorParetoTop, independentlyValid }) => predecessorParetoTop && independentlyValid)
const endpointEnumerationPass = endpointControls.every(({ options }) =>
	options.some(({ currentParetoTop, independentlyValid }) => currentParetoTop && independentlyValid) &&
	options.some(({ predecessorParetoTop, independentlyValid }) => predecessorParetoTop && independentlyValid))
const gatePass = currentTopPositiveCount === manifest.cases.length && surfaceRepairPass && surfaceRegressionPass && endpointEnumerationPass

const analysis = {
	schemaVersion: 1,
	reviewVersion: manifest.reviewVersion,
	manifestId: manifest.manifestId,
	candidateVersion: manifest.candidateVersion,
	implementationHash: manifest.implementationHash,
	scientificSha256: manifest.scientificSha256,
	inputHashes: {
		manifestSha256: sha256(manifestRaw),
		feedbackSha256: sha256(feedbackRaw),
		developmentAnalysisSha256: sha256(developmentAnalysisRaw),
	},
	storeIntegrity: {
		manifestCaseCount: manifest.cases.length,
		storedEntryCount: feedback.entries.length,
		uniqueCaseCount: seen.size,
		preferencesReferenceOnlyPositiveOptions: true,
	},
	interpretationPolicy: {
		selected: "independently usable positive direction, moderated by its verbatim comment",
		preferred: "explicit preference only among selected positives",
		unselected: "unlabeled, not a negative example",
		commentsEnterInference: false,
	},
	counts: {
		caseCount: manifest.cases.length,
		completedResponseCount: feedback.entries.length,
		currentTopPositiveCount,
		predecessorTopPositiveCount,
		legacyScalarTopPositiveCount,
		totalPositiveMarks,
		preferredResponseCount: feedback.entries.filter(({ preferredOptionId }) => preferredOptionId !== null).length,
		noneConfidentlyValidCount: feedback.entries.filter(({ noneConfidentlyValid }) => noneConfidentlyValid).length,
		uncertainCount: feedback.entries.filter(({ uncertain }) => uncertain).length,
	},
	mechanismSubGates: {
		roleLocalSurfaceRepair: {
			pass: surfaceRepairPass,
			reason: "The new distinct-surface top is positive while the predecessor collapsed top is unselected on development-16.",
		},
		priorPositiveSurfaceControl: {
			pass: surfaceRegressionPass,
			reason: "Both current and predecessor tops remain positive on development-21.",
		},
		boundedEndpointEnumeration: {
			pass: endpointEnumerationPass,
			reason: "Current changed-gradient and predecessor tops are positive on both endpoint controls.",
		},
	},
	mechanismGate: {
		pass: gatePass,
		reasons: [
			"Every current Pareto top is independently valid on all four targeted cases.",
			"Role-local surface opportunity repairs the diagnosed collapse without invalidating the prior-positive surface control.",
			"Bounded endpoint enumeration preserves independently valid current and predecessor directions on both gradient controls.",
		],
	},
	remainingDevelopmentFindings: [
		developmentAnalysis.reviewPreparation.foregroundPolarityStatus,
		"The development-16 comment still requests a gradient and different foreground/accent role assignment; it remains qualitative context only.",
		"Known unchanged absolute-quality failures on development-03 and development-04 remain unresolved.",
	],
	responseInterpretations: interpretations,
	phaseDisposition: gatePass
		? "bounded-architecture-gate-passed-additional-development-required-before-phase4"
		: "bounded-architecture-gate-failed-continue-development",
	freshSampleOpened: false,
	nextStep: "Retain the validated surface and endpoint changes, continue bounded field/foreground development, and do not open the fresh sample.",
}

await atomicJson(outputPath, analysis)
process.stdout.write(`${JSON.stringify({ counts: analysis.counts, mechanismSubGates: analysis.mechanismSubGates, phaseDisposition: analysis.phaseDisposition })}\n`)
