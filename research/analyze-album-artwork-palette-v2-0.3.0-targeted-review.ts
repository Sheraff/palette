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
const experimentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.3.0-development")
const manifestPath = resolve(experimentDirectory, "targeted-review-manifest.json")
const feedbackPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-0.3.0-targeted-feedback.json")

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
	const roles = reviewCase.options.map(({ optionId, treatment }) => ({
		optionId,
		role: treatment.id === artifact.extraction.winner.id
			? "pareto-top"
			: treatment.id === artifact.extraction.diagnostics.legacyScalarTopTreatment.id
				? "legacy-scalar-top"
				: "pareto-alternative",
		positive: response.validOptionIds.includes(optionId),
	}))
	for (const option of roles.filter(({ positive }) => positive)) {
		if (option.role === "pareto-top") paretoTopPositiveCount += 1
		else if (option.role === "legacy-scalar-top") legacyScalarTopPositiveCount += 1
		else alternativePositiveCount += 1
	}
	const inferredClasses = reviewCase.caseId === "development-23"
		? [{
			class: "surface-direction-availability-or-ranking",
			confidence: "high",
			evidence: "Only a collapsed-surface alternative was positive; the reviewer explicitly reported that displayed distinct surfaces did not fit despite sufficient artwork colors.",
		}]
		: reviewCase.caseId === "development-27"
			? [{
				class: "top-one-ui-utility-underweighting",
				confidence: "high",
				evidence: "The legacy scalar top was the sole positive; its UI utility was 0.427 versus 0.152 for the Pareto top, while UI utility was excluded from leximin core blocks.",
			}]
			: reviewCase.caseId === "development-24"
				? [{
					class: "complete-treatment-domain-insufficient",
					confidence: "medium",
					evidence: "No displayed direction was confidently valid; no comment identifies a narrower mechanism.",
				}]
				: []
	return {
		caseId: reviewCase.caseId,
		originalResponse: response,
		optionRoles: roles,
		inferredClasses,
		interpretationUncertain: reviewCase.caseId === "development-24",
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
	reviewVersion: "album-artwork-palette-v2-pareto-mechanism-review-v1",
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
	presentationProcessFeedbackVerbatim: [
		"the color names should also have a small sample of that color next to them to make it easier to see what they are referring to",
	],
	mechanismGate: {
		pass: false,
		reasons: [
			"Pareto top was independently positive on only 1 of 4 targeted cases.",
			"One of four cases had no confidently valid displayed direction.",
			"Positive alternatives show top-one mismatch, while the explicit surface comment also identifies a candidate-direction gap.",
		],
	},
	nextGeneralChanges: [
		"Include UI utility in the non-compensatory leximin core rather than using it only after core ties.",
		"Retain high-ranked signature-lane family directions through per-field accent proposal caps.",
		"Keep the broad 12-artwork top-one review blocked until a new targeted mechanism gate passes.",
		"Show a color sample beside every human-facing color name.",
	],
	responseInterpretations,
}

await atomicJson(resolve(experimentDirectory, "targeted-review-analysis.json"), analysis)
process.stdout.write(`Analyzed ${counts.completedResponseCount} targeted responses; Pareto top positives ${paretoTopPositiveCount}/4\n`)
