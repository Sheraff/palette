import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const experimentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.4.4-development")
const manifestPath = resolve(experimentDirectory, "targeted-review-manifest.json")
const feedbackPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-0.4.4-targeted-feedback.json")
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
const manifest = JSON.parse(manifestRaw) as {
	reviewVersion: string
	manifestId: string
	candidateVersion: string
	implementationHash: string
	scientificSha256: string
	cases: Array<{ caseId: string; sourceSha256: string; options: Array<{ optionId: string }> }>
}
const feedback = JSON.parse(feedbackRaw) as {
	reviewVersion: string
	manifestId: string
	entries: Array<{
		caseId: string
		sourceSha256: string
		validOptionIds: string[]
		preferredOptionId: string | null
		noneConfidentlyValid: boolean
		uncertain: boolean
		comment: string
		submittedAt: string
	}>
}
const developmentAnalysis = JSON.parse(developmentAnalysisRaw) as {
	reviewPreparation: {
		optionRoles: Array<{
			caseId: string
			options: Array<{
				optionId: string
				currentParetoTop: boolean
				predecessorParetoTop: boolean
				currentLegacyScalarTop: boolean
			}>
		}>
		freshSampleOpened: false
	}
}

assert(feedback.reviewVersion === manifest.reviewVersion, "Feedback review version does not match the manifest")
assert(feedback.manifestId === manifest.manifestId, "Feedback manifest ID does not match the manifest")
assert(feedback.entries.length === 1 && manifest.cases.length === 1, "Expected one observability response")
assert(developmentAnalysis.reviewPreparation.freshSampleOpened === false, "Fresh sample seal is not closed")
const response = feedback.entries[0]
const reviewCase = manifest.cases[0]
assert(response.caseId === reviewCase.caseId && response.sourceSha256 === reviewCase.sourceSha256, "Response source binding failed")
assert(Number.isFinite(Date.parse(response.submittedAt)), "Response timestamp is invalid")
assert(new Set(response.validOptionIds).size === response.validOptionIds.length, "Duplicate valid option")
assert(response.validOptionIds.every((optionId) => reviewCase.options.some((option) => option.optionId === optionId)), "Unknown valid option")
assert(response.preferredOptionId === null || response.validOptionIds.includes(response.preferredOptionId), "Invalid preference")
const roles = developmentAnalysis.reviewPreparation.optionRoles[0]
assert(roles.caseId === response.caseId, "Option roles do not match the response")
const options = roles.options.map((role) => ({
	...role,
	independentlyValid: response.validOptionIds.includes(role.optionId),
	preferred: response.preferredOptionId === role.optionId,
}))
const currentTopPositive = options.some(({ currentParetoTop, independentlyValid }) => currentParetoTop && independentlyValid)
const predecessorTopPositive = options.some(({ predecessorParetoTop, independentlyValid }) => predecessorParetoTop && independentlyValid)
const legacyScalarTopPositive = options.some(({ currentLegacyScalarTop, independentlyValid }) => currentLegacyScalarTop && independentlyValid)
const interpretationUncertain = /not valid[\s\S]*visually valid/i.test(response.comment)
const gatePass = currentTopPositive && !response.noneConfidentlyValid && !response.uncertain
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
		manifestCaseCount: 1,
		storedEntryCount: 1,
		uniqueCaseCount: 1,
		preferencesReferenceOnlyPositiveOptions: true,
	},
	interpretationPolicy: {
		selected: "independently usable positive direction, moderated by its verbatim comment",
		unselected: "unlabeled, not a negative example",
		structuredResponseOverridesContradictoryComment: true,
		commentsEnterInference: false,
	},
	counts: {
		caseCount: 1,
		completedResponseCount: 1,
		currentTopPositiveCount: currentTopPositive ? 1 : 0,
		predecessorTopPositiveCount: predecessorTopPositive ? 1 : 0,
		legacyScalarTopPositiveCount: legacyScalarTopPositive ? 1 : 0,
		totalPositiveMarks: response.validOptionIds.length,
		preferredResponseCount: response.preferredOptionId === null ? 0 : 1,
	},
	mechanismGate: {
		pass: gatePass,
		reason: "The distinct-accent-observable current top is independently valid; the dead-zone predecessor is unselected.",
	},
	responseInterpretation: {
		caseId: response.caseId,
		validOptionIds: response.validOptionIds,
		preferredOptionId: response.preferredOptionId,
		comment: response.comment,
		interpretationUncertain,
		options,
	},
	phaseDisposition: gatePass
		? "distinct-accent-observability-gate-passed-absolute-quality-delta-review-authorized"
		: "distinct-accent-observability-gate-failed",
	freshSampleOpened: false,
	nextStep: "Run a development-only absolute-quality delta review for changed broad tops; do not open the fresh sample.",
}

await atomicJson(outputPath, analysis)
process.stdout.write(`${JSON.stringify({ counts: analysis.counts, mechanismGate: analysis.mechanismGate, phaseDisposition: analysis.phaseDisposition })}\n`)
