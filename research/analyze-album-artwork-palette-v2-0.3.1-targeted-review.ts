import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { CompletePaletteTreatment } from "./src/album-artwork-palette-v2.ts"

type Option = Readonly<{ optionId: string; treatment: CompletePaletteTreatment }>
type ReviewCase = Readonly<{ caseId: string; options: readonly Option[] }>
type FeedbackEntry = Readonly<{
	caseId: string
	validOptionIds: readonly string[]
	noneConfidentlyValid: boolean
	uncertain: boolean
	comment: string
	submittedAt: string
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const experimentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.3.1-development")
const manifestPath = resolve(experimentDirectory, "targeted-review-manifest.json")
const feedbackPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-0.3.1-targeted-feedback.json")

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
	readFile(resolve(experimentDirectory, "aggregate.json"), "utf8").then(JSON.parse),
])
const manifest = JSON.parse(manifestBytes.toString("utf8")) as Readonly<{ manifestId: string; cases: readonly ReviewCase[] }>
const feedback = JSON.parse(feedbackBytes.toString("utf8")) as Readonly<{ manifestId: string; entries: readonly FeedbackEntry[] }>
if (feedback.manifestId !== manifest.manifestId || manifest.cases.length !== 4 || feedback.entries.length !== 4) {
	throw new Error("Targeted review is incomplete or does not match its manifest")
}

const artifactByCase = new Map((aggregate.cases as ReadonlyArray<Readonly<{
	source: Readonly<{ caseId: string }>
	extraction: Readonly<{
		winner: CompletePaletteTreatment
		diagnostics: Readonly<{ legacyScalarTopTreatment: CompletePaletteTreatment }>
	}>
}>>).map((artifact) => [artifact.source.caseId, artifact]))
let paretoTopPositiveCount = 0
let legacyScalarTopPositiveCount = 0
let alternativePositiveCount = 0
const responseInterpretations = manifest.cases.map((reviewCase) => {
	const response = feedback.entries.find(({ caseId }) => caseId === reviewCase.caseId)
	const artifact = artifactByCase.get(reviewCase.caseId)
	if (!response || !artifact) throw new Error(`Missing targeted review case ${reviewCase.caseId}`)
	const optionRoles = reviewCase.options.map(({ optionId, treatment }) => ({
		optionId,
		role: treatment.id === artifact.extraction.winner.id
			? "pareto-top"
			: treatment.id === artifact.extraction.diagnostics.legacyScalarTopTreatment.id
				? "legacy-scalar-top"
				: "pareto-alternative",
		positive: response.validOptionIds.includes(optionId),
	}))
	for (const option of optionRoles.filter(({ positive }) => positive)) {
		if (option.role === "pareto-top") paretoTopPositiveCount += 1
		else if (option.role === "legacy-scalar-top") legacyScalarTopPositiveCount += 1
		else alternativePositiveCount += 1
	}
	const inferredClasses = reviewCase.caseId === "development-23"
		? [{
			class: "surface-field-direction-ranking",
			confidence: "high",
			evidence: "The component-owned teal surface direction was positive, consistent with the prior verbatim report that the artwork supported a surface but the compact-object Umbra surface did not fit.",
		}]
		: reviewCase.caseId === "development-27"
			? [{
				class: "field-treatment-ranking-not-resolved",
				confidence: "medium",
				evidence: "Two gradient directions were independently positive while the selected flat direction was not positively marked; omission remains unlabeled rather than a negative judgment.",
			}]
			: reviewCase.caseId === "development-13"
				? [{
					class: "accent-cross-field-visibility",
					confidence: "high",
					evidence: "Reviewer verbatim: option D is almost very good, but accent is almost invisible over background, otherwise it might be the best option of the 4",
				}]
				: []
	return {
		caseId: reviewCase.caseId,
		originalResponse: response,
		optionRoles,
		inferredClasses,
		interpretationUncertain: reviewCase.caseId === "development-27",
	}
})

const counts = {
	caseCount: manifest.cases.length,
	completedResponseCount: feedback.entries.length,
	caseWithPositiveCount: feedback.entries.filter(({ validOptionIds }) => validOptionIds.length > 0).length,
	totalPositiveMarks: feedback.entries.reduce((sum, { validOptionIds }) => sum + validOptionIds.length, 0),
	paretoTopPositiveCount,
	legacyScalarTopPositiveCount,
	alternativePositiveCount,
	noneConfidentlyValidCount: feedback.entries.filter(({ noneConfidentlyValid }) => noneConfidentlyValid).length,
	uncertainCount: feedback.entries.filter(({ uncertain }) => uncertain).length,
}
const analysis = {
	schemaVersion: 1,
	reviewVersion: "album-artwork-palette-v2-pareto-mechanism-review-v2",
	manifestId: manifest.manifestId,
	manifestSha256: sha256(manifestBytes),
	feedbackSha256: sha256(feedbackBytes),
	storeIntegrity: {
		manifestCaseCount: manifest.cases.length,
		storedEntryCount: feedback.entries.length,
		uniqueCaseCount: new Set(feedback.entries.map(({ caseId }) => caseId)).size,
		lastWriteWins: true,
	},
	counts,
	mechanismGate: {
		pass: false,
		reasons: [
			"Every targeted case has at least one positive complete direction, improving from 3 of 4 in the predecessor checkpoint.",
			"Pareto top is positively marked on only 2 of 4 cases; the required 4 of 4 top-one mechanism gate is not met.",
			"Four positive alternatives show that candidate availability is stronger than deterministic top-one selection.",
		],
	},
	nextGeneralChanges: [
		"Keep the broad 12-artwork top-one review blocked.",
		"Replace raw-scale leximin with a deterministic meaningful-margin rank stage because small differences in the weakest numeric block currently override large field-direction evidence.",
		"Expose foreground and distinct-accent utility separately so cross-field accent invisibility cannot hide inside one averaged UI utility block.",
		"Preserve all selected alternatives as equal positive directions; do not train against unselected options.",
	],
	responseInterpretations,
}

await atomicJson(resolve(experimentDirectory, "targeted-review-analysis.json"), analysis)
process.stdout.write(`Analyzed ${counts.completedResponseCount} targeted responses; Pareto top positives ${paretoTopPositiveCount}/4\n`)
