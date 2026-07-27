import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

type FeedbackEntry = Readonly<{
	caseId: string
	sourceSha256: string
	selectedTreatmentId: string
	alsoValidTreatmentIds: readonly string[]
	quality: string | null
	tags: readonly string[]
	comment: string
	submittedAt: string
}>

type Treatment = Readonly<{
	id: string
	gradient: boolean
	cardinality: number
	collapse: Readonly<{ surface: boolean; accent: boolean }>
}>

type ReviewCase = Readonly<{
	caseId: string
	sourceSha256: string
	winnerTreatmentId: string
	alternatives: readonly Treatment[]
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const experimentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.2.0-development")
const feedbackPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-round-2-feedback.json")
const manifestPath = resolve(experimentDirectory, "review-manifest.json")
const outputPath = resolve(experimentDirectory, "round-2-review-analysis.json")

function sha256(value: Uint8Array | string): string {
	return createHash("sha256").update(value).digest("hex")
}

function counts(values: readonly string[]): Record<string, number> {
	const output: Record<string, number> = {}
	for (const value of values) output[value] = (output[value] ?? 0) + 1
	return Object.fromEntries(Object.entries(output).sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0))
}

function structure(treatment: Treatment): string {
	if (treatment.collapse.surface && treatment.collapse.accent) return "two-colors"
	if (treatment.collapse.surface) return "three-colors-surface-collapsed"
	if (treatment.collapse.accent) return "three-colors-accent-collapsed"
	return "four-colors"
}

const [feedbackBytes, manifestBytes] = await Promise.all([readFile(feedbackPath), readFile(manifestPath)])
const feedback = JSON.parse(feedbackBytes.toString("utf8")) as {
	schemaVersion: number
	reviewVersion: string
	manifestId: string
	entries: FeedbackEntry[]
}
const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
	reviewVersion: string
	manifestId: string
	cases: ReviewCase[]
}
if (feedback.schemaVersion !== 3 || feedback.reviewVersion !== manifest.reviewVersion || feedback.manifestId !== manifest.manifestId) {
	throw new Error("Round 2 feedback does not match its review manifest")
}
if (feedback.entries.length !== manifest.cases.length || new Set(feedback.entries.map(({ caseId }) => caseId)).size !== feedback.entries.length) {
	throw new Error("Round 2 feedback must contain exactly one final entry per artwork")
}
const selected: Treatment[] = []
const winners: Treatment[] = []
const alsoValid: Treatment[] = []
let winnerOverrides = 0
for (const entry of feedback.entries) {
	const reviewCase = manifest.cases.find(({ caseId }) => caseId === entry.caseId)
	if (!reviewCase || reviewCase.sourceSha256 !== entry.sourceSha256) throw new Error(`Feedback source mismatch for ${entry.caseId}`)
	const selectedTreatment = reviewCase.alternatives.find(({ id }) => id === entry.selectedTreatmentId)
	const winner = reviewCase.alternatives.find(({ id }) => id === reviewCase.winnerTreatmentId)
	if (!selectedTreatment || !winner) throw new Error(`Feedback treatment mismatch for ${entry.caseId}`)
	if (new Set(entry.alsoValidTreatmentIds).size !== entry.alsoValidTreatmentIds.length || entry.alsoValidTreatmentIds.includes(entry.selectedTreatmentId)) {
		throw new Error(`Invalid also-valid choices for ${entry.caseId}`)
	}
	for (const treatmentId of entry.alsoValidTreatmentIds) {
		const treatment = reviewCase.alternatives.find(({ id }) => id === treatmentId)
		if (!treatment) throw new Error(`Unknown also-valid treatment for ${entry.caseId}`)
		alsoValid.push(treatment)
	}
	selected.push(selectedTreatment)
	winners.push(winner)
	if (selectedTreatment.id !== winner.id) winnerOverrides += 1
}
const responseInterpretations = feedback.entries.map((entry) => {
	const classes: Array<Readonly<{ class: string; confidence: "high" | "medium"; evidence: string }>> = []
	if (entry.tags.includes("missing gradient")) classes.push({ class: "gradient-recall-or-endpoint-quality", confidence: "high", evidence: "reviewer tag: missing gradient" })
	if (entry.tags.includes("extraneous gradient")) classes.push({ class: "gradient-precision-or-field-ownership", confidence: "high", evidence: "reviewer tag: extraneous gradient" })
	if (entry.tags.includes("incomplete artwork identity")) classes.push({ class: "identity-role-availability-or-assignment", confidence: "medium", evidence: "reviewer tag: incomplete artwork identity" })
	if (/surface/i.test(entry.comment)) classes.push({ class: "surface-representative-or-field-relation", confidence: "medium", evidence: "verbatim comment discusses surface quality" })
	if (/foreground|text/i.test(entry.comment)) classes.push({ class: "foreground-region-evidence-or-role-assignment", confidence: "medium", evidence: "verbatim comment discusses foreground or artwork text" })
	if (/accent/i.test(entry.comment)) classes.push({ class: "signature-accent-evidence-or-role-assignment", confidence: "medium", evidence: "verbatim comment discusses accent identity or necessity" })
	return {
		caseId: entry.caseId,
		originalResponse: {
			selectedTreatmentId: entry.selectedTreatmentId,
			alsoValidTreatmentIds: entry.alsoValidTreatmentIds,
			quality: entry.quality,
			tags: entry.tags,
			comment: entry.comment,
			submittedAt: entry.submittedAt,
		},
		inferredClasses: classes,
		interpretationUncertain: classes.length === 0,
	}
})
const analysisWithoutId = {
	schemaVersion: 1,
	reviewVersion: feedback.reviewVersion,
	manifestId: feedback.manifestId,
	feedbackSha256: sha256(feedbackBytes),
	reviewerSummaryVerbatim: [
		"review done, it wasn't good, but i like that we have surfaces and gradients now.",
		"i may have submitted multiple answers for the same artwork, if you received multiple, just keep the last one. The review UI was confusing.",
	],
	reviewProcessFeedbackVerbatim: [
		"the surface is too dominating in the mock UI. In real application most of the content is over the background, and only small sections of it will be over the surface. It is so dominating that it's hard to review the rest. When there is a gradient, the only part of the mock UI that is really background colored is the tiny corner on the top left and the text in the fake \"play treatment\" button, when in reality background will dominate... you can see how this biases the review",
		"there are many questions per artwork, and 28 artworks, this makes the review quite tedious (especially when most palettes are not good, it's hard to go all the way to the end and not give up). Unless all of these informations are very useful to you, it might be beneficial to trim it down a little.",
	],
	storeIntegrity: {
		manifestCaseCount: manifest.cases.length,
		storedEntryCount: feedback.entries.length,
		uniqueCaseCount: new Set(feedback.entries.map(({ caseId }) => caseId)).size,
		lastWriteWins: true,
		lastWriteWinsMechanism: "serialized mutation removes every prior case entry, appends the latest successful submission, then atomically renames the store",
	},
	counts: {
		quality: counts(feedback.entries.map(({ quality }) => quality ?? "unrated")),
		tags: counts(feedback.entries.flatMap(({ tags }) => tags)),
		commented: feedback.entries.filter(({ comment }) => comment.length > 0).length,
		winnerOverrides,
		alsoValidMarks: alsoValid.length,
		casesWithAlsoValidMarks: feedback.entries.filter(({ alsoValidTreatmentIds }) => alsoValidTreatmentIds.length > 0).length,
		winnerStructures: counts(winners.map(structure)),
		selectedStructures: counts(selected.map(structure)),
		alsoValidStructures: counts(alsoValid.map(structure)),
		winnerGradients: winners.filter(({ gradient }) => gradient).length,
		selectedGradients: selected.filter(({ gradient }) => gradient).length,
		alsoValidGradients: alsoValid.filter(({ gradient }) => gradient).length,
		winnerSurfaceCollapsed: winners.filter(({ collapse }) => collapse.surface).length,
		selectedSurfaceCollapsed: selected.filter(({ collapse }) => collapse.surface).length,
	},
	presentationConfounds: [
		{
			class: "surface-area-dominance",
			confidence: "high",
			effect: "cardinality, surface, and exact endpoint preferences are not clean quality evidence",
		},
		{
			class: "gradient-background-occlusion",
			confidence: "high",
			effect: "the solid surface panel obscured much of the gradient field and magnified endpoint errors",
		},
		{
			class: "review-fatigue",
			confidence: "high",
			effect: "later and multi-question responses may be less reliable; future broad reviews must be shorter",
		},
	],
	generalInterpretations: [
		{
			class: "mechanical-field-availability-improved",
			confidence: "high",
			trace: ["reviewer summary", "selected and also-valid distinct surfaces", "selected gradients"],
		},
		{
			class: "complete-treatment-quality-still-insufficient",
			confidence: "high",
			trace: ["reviewer summary", "unacceptable and weak quality counts", "identity tags"],
		},
		{
			class: "top-one-ranking-mismatch",
			confidence: "high",
			trace: ["winner override count", "non-exclusive positive marks"],
		},
		{
			class: "gradient-field-ownership-and-endpoint-quality",
			confidence: "medium",
			trace: ["missing and extraneous gradient tags", "gradient comments"],
		},
	],
	responseInterpretations,
	gates: {
		freshSampleOpened: false,
		phaseFourAuthorized: false,
		algorithmFreezeAllowed: false,
		broadReviewQualityClaimAllowed: false,
	},
}
const analysis = { ...analysisWithoutId, analysisId: sha256(JSON.stringify(analysisWithoutId)) }
const temporary = `${outputPath}.${process.pid}.tmp`
await writeFile(temporary, `${JSON.stringify(analysis, null, 2)}\n`)
await rename(temporary, outputPath)
process.stdout.write(`Analyzed ${feedback.entries.length} final Round 2 responses as ${analysis.analysisId}\n`)
