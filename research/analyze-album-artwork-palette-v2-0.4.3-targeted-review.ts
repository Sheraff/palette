import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

type ReviewManifest = Readonly<{
	reviewVersion: string
	manifestId: string
	candidateVersion: string
	implementationHash: string
	scientificSha256: string
	cases: ReadonlyArray<Readonly<{
		caseId: string
		sourceSha256: string
		options: ReadonlyArray<Readonly<{ optionId: string }>>
	}>>
}>

type FeedbackStore = Readonly<{
	reviewVersion: string
	manifestId: string
	entries: ReadonlyArray<Readonly<{
		caseId: string
		sourceSha256: string
		validOptionIds: readonly string[]
		preferredOptionId: string | null
		noneConfidentlyValid: boolean
		uncertain: boolean
		comment: string
		submittedAt: string
	}>>
}>

type OptionRole = Readonly<{
	optionId: string
	currentParetoTop: boolean
	predecessorParetoTop: boolean
	currentLegacyScalarTop: boolean
}>

type DevelopmentAnalysis = Readonly<{
	reviewPreparation: Readonly<{
		optionRoles: ReadonlyArray<Readonly<{ caseId: string; options: readonly OptionRole[] }>>
		freshSampleOpened: false
	}>
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const experimentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.4.3-development")
const manifestPath = resolve(experimentDirectory, "targeted-review-manifest.json")
const feedbackPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-0.4.3-targeted-feedback.json")
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
	assert(entry.validOptionIds.length > 0 || entry.noneConfidentlyValid || entry.uncertain, `Incomplete response for ${entry.caseId}`)
	assert(new Set(entry.validOptionIds).size === entry.validOptionIds.length, `Duplicate valid option for ${entry.caseId}`)
	assert(entry.validOptionIds.every((optionId) => reviewCase.options.some((option) => option.optionId === optionId)), `Unknown valid option for ${entry.caseId}`)
	assert(entry.preferredOptionId === null || entry.validOptionIds.includes(entry.preferredOptionId), `Invalid preference for ${entry.caseId}`)
}

const interpretations = feedback.entries.map((entry) => {
	const roles = rolesByCase.get(entry.caseId)
	assert(roles, `Missing option roles for ${entry.caseId}`)
	return {
		caseId: entry.caseId,
		validOptionIds: entry.validOptionIds,
		preferredOptionId: entry.preferredOptionId,
		comment: entry.comment,
		options: roles.map((role) => ({
			...role,
			independentlyValid: entry.validOptionIds.includes(role.optionId),
			preferred: entry.preferredOptionId === role.optionId,
		})),
	}
})
const roleResult = (
	caseId: string,
	role: "currentParetoTop" | "predecessorParetoTop" | "currentLegacyScalarTop",
) => interpretations.find((entry) => entry.caseId === caseId)?.options.find((option) => option[role])
const currentTopPositiveCount = interpretations.filter(({ options }) =>
	options.some(({ currentParetoTop, independentlyValid }) => currentParetoTop && independentlyValid)).length
const predecessorTopPositiveCount = interpretations.filter(({ options }) =>
	options.some(({ predecessorParetoTop, independentlyValid }) => predecessorParetoTop && independentlyValid)).length
const totalPositiveMarks = feedback.entries.reduce((sum, entry) => sum + entry.validOptionIds.length, 0)
const availabilityRepairPass = roleResult("development-04", "currentParetoTop")?.independentlyValid === true &&
	roleResult("development-04", "currentParetoTop")?.preferred === true
const priorStrongControlValidButPreferred = roleResult("development-19", "currentParetoTop")?.independentlyValid === true &&
	roleResult("development-19", "predecessorParetoTop")?.preferred === true
const priorPositiveControlRegression = roleResult("development-24", "currentParetoTop")?.independentlyValid === false &&
	roleResult("development-24", "predecessorParetoTop")?.independentlyValid === true
const gatePass = currentTopPositiveCount === manifest.cases.length

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
		totalPositiveMarks,
		preferredResponseCount: feedback.entries.filter(({ preferredOptionId }) => preferredOptionId !== null).length,
		noneConfidentlyValidCount: feedback.entries.filter(({ noneConfidentlyValid }) => noneConfidentlyValid).length,
		uncertainCount: feedback.entries.filter(({ uncertain }) => uncertain).length,
	},
	mechanismSubGates: {
		foregroundAvailabilityRepair: {
			pass: availabilityRepairPass,
			reason: "The newly available foreground top on development-04 is independently valid and explicitly preferred.",
		},
		priorStrongTopOrdering: {
			pass: false,
			currentStillValid: priorStrongControlValidButPreferred,
			reason: "The current development-19 top is valid, but the predecessor strong top receives an explicit strong preference.",
		},
		priorPositiveTopProtection: {
			pass: !priorPositiveControlRegression,
			reason: "The development-24 current top is unselected while its predecessor top remains independently valid.",
		},
	},
	mechanismGate: {
		pass: gatePass,
		reasons: gatePass
			? ["Every changed current top is independently valid."]
			: [
				"The foreground proposal expansion repairs development-04.",
				"Complete-treatment ordering under-ranks a previously strong direction on development-19.",
				"Complete-treatment ordering selects an unvalidated direction over a prior-positive direction on development-24.",
			],
	},
	responseInterpretations: interpretations,
	phaseDisposition: gatePass
		? "foreground-availability-gate-passed"
		: "foreground-availability-repair-valid-complete-treatment-ordering-gate-failed",
	freshSampleOpened: false,
	nextStep: "Preserve budget-adaptive foreground availability, revise complete-treatment foundation to account for distinct-accent utility, and remain on bounded development data.",
}

await atomicJson(outputPath, analysis)
process.stdout.write(`${JSON.stringify({ counts: analysis.counts, mechanismSubGates: analysis.mechanismSubGates, phaseDisposition: analysis.phaseDisposition })}\n`)
