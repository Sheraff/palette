import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

type FeedbackEntry = Readonly<{
	caseId: string
	sourceSha256: string
	selectedTreatmentId: string
	quality: "strong" | "acceptable" | "weak-fallback" | "unacceptable" | "uncertain" | null
	tags: readonly string[]
	comment: string
	submittedAt: string
}>

type Feedback = Readonly<{
	schemaVersion: 2
	reviewVersion: string
	manifestId: string
	entries: readonly FeedbackEntry[]
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

type ReviewManifest = Readonly<{
	reviewVersion: string
	manifestId: string
	cases: readonly ReviewCase[]
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const experimentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.1.0-development")
const feedbackPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-feedback.json")
const manifestPath = resolve(experimentDirectory, "review-manifest.json")
const outputPath = resolve(experimentDirectory, "phase-3-review-analysis.json")

function sha256(value: Uint8Array | string): string {
	return createHash("sha256").update(value).digest("hex")
}

function structure(treatment: Treatment): string {
	if (treatment.collapse.surface && treatment.collapse.accent) return "two-colors"
	if (treatment.collapse.surface) return "three-colors-surface-collapsed"
	if (treatment.collapse.accent) return "three-colors-accent-collapsed"
	return "four-colors"
}

function countBy(values: readonly string[]): Record<string, number> {
	const counts: Record<string, number> = {}
	for (const value of values) counts[value] = (counts[value] ?? 0) + 1
	return Object.fromEntries(Object.entries(counts).sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0))
}

const [feedbackBytes, manifestBytes] = await Promise.all([readFile(feedbackPath), readFile(manifestPath)])
const feedback = JSON.parse(feedbackBytes.toString("utf8")) as Feedback
const manifest = JSON.parse(manifestBytes.toString("utf8")) as ReviewManifest
if (feedback.schemaVersion !== 2 || feedback.reviewVersion !== manifest.reviewVersion || feedback.manifestId !== manifest.manifestId) {
	throw new Error("Completed feedback does not match the Phase 3 review manifest")
}
const feedbackByCase = new Map(feedback.entries.map((entry) => [entry.caseId, entry]))
const missingCaseIds = manifest.cases.filter(({ caseId }) => !feedbackByCase.has(caseId)).map(({ caseId }) => caseId)
const selected: Treatment[] = []
const winners: Treatment[] = []
let winnerOverrides = 0
for (const entry of feedback.entries) {
	const reviewCase = manifest.cases.find(({ caseId }) => caseId === entry.caseId)
	if (!reviewCase || reviewCase.sourceSha256 !== entry.sourceSha256) throw new Error(`Feedback source mismatch for ${entry.caseId}`)
	const selectedTreatment = reviewCase.alternatives.find(({ id }) => id === entry.selectedTreatmentId)
	const winner = reviewCase.alternatives.find(({ id }) => id === reviewCase.winnerTreatmentId)
	if (!selectedTreatment || !winner) throw new Error(`Feedback treatment mismatch for ${entry.caseId}`)
	selected.push(selectedTreatment)
	winners.push(winner)
	if (selectedTreatment.id !== winner.id) winnerOverrides += 1
}
const allTreatments = manifest.cases.flatMap(({ alternatives }) => alternatives)
const missingGradientEntries = feedback.entries.filter(({ tags }) => tags.includes("missing gradient"))
const identityEntries = feedback.entries.filter(({ tags }) => tags.includes("incomplete artwork identity"))
const surfaceCommentEntries = feedback.entries.filter(({ comment }) => /surface|4-color|four.color/i.test(comment))
const gradientCommentEntries = feedback.entries.filter(({ comment }) => /gradient/i.test(comment))
const nonexclusiveEntries = feedback.entries.filter(({ comment }) => /also|could work|could have|almost all|many to pick|don't know which|not 100% sure/i.test(comment))

const responseInterpretations = feedback.entries.map((entry) => {
	const classes: Array<Readonly<{ class: string; confidence: "high" | "medium" | "uncertain"; evidence: string }>> = []
	if (entry.tags.includes("missing gradient")) {
		classes.push({ class: "gradient-hypothesis-or-slate-availability", confidence: "high", evidence: "reviewer tag: missing gradient" })
	}
	if (entry.tags.includes("incomplete artwork identity")) {
		classes.push({ class: "identity-bearing-role-candidate-or-assignment", confidence: "medium", evidence: "reviewer tag: incomplete artwork identity" })
	}
	if (/surface|4-color|four.color/i.test(entry.comment)) {
		classes.push({ class: "distinct-surface-availability-or-ranking", confidence: "high", evidence: "verbatim comment discusses an absent or alternate surface" })
	}
	if (/foreground|text/i.test(entry.comment)) {
		classes.push({ class: "foreground-region-evidence-or-role-assignment", confidence: "medium", evidence: "verbatim comment discusses foreground or artwork text" })
	}
	if (/accent/i.test(entry.comment)) {
		classes.push({ class: "signature-accent-evidence-or-role-assignment", confidence: "medium", evidence: "verbatim comment discusses accent identity or necessity" })
	}
	return {
		caseId: entry.caseId,
		originalResponse: {
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
		"surface is collapsed *way too often*, this might have biased my review towards palettes with 4 colors. and there weren't enough gradients (but that might be due to the collapsed surfaces)",
		"because I favored one palette in my review doesn't mean there aren't other valid palettes. And if we were to improve all the proposed alternatives it might make another better that the one i selected even if it went in a completely different direction.",
		"as a first review, i think the results are promising, but there is still a lot of work to do",
	],
	limitations: {
		reviewedCaseCount: feedback.entries.length,
		manifestCaseCount: manifest.cases.length,
		missingCaseIds,
		selectedTreatmentIsNonexclusivePreference: true,
		unselectedTreatmentsAreNotNegativeLabels: true,
	},
	counts: {
		quality: countBy(feedback.entries.map(({ quality }) => quality ?? "unrated")),
		tags: countBy(feedback.entries.flatMap(({ tags }) => tags)),
		winnerOverrides,
		winnerStructures: countBy(winners.map(structure)),
		selectedStructures: countBy(selected.map(structure)),
		slateStructures: countBy(allTreatments.map(structure)),
		winnerSurfaceCollapsed: winners.filter(({ collapse }) => collapse.surface).length,
		selectedSurfaceCollapsed: selected.filter(({ collapse }) => collapse.surface).length,
		slateSurfaceCollapsed: allTreatments.filter(({ collapse }) => collapse.surface).length,
		winnerGradients: winners.filter(({ gradient }) => gradient).length,
		selectedGradients: selected.filter(({ gradient }) => gradient).length,
		slateGradients: allTreatments.filter(({ gradient }) => gradient).length,
		missingGradientTagCount: missingGradientEntries.length,
		incompleteIdentityTagCount: identityEntries.length,
		surfaceCommentCount: surfaceCommentEntries.length,
		gradientCommentCount: gradientCommentEntries.length,
		nonexclusivePreferenceCommentCount: nonexclusiveEntries.length,
	},
	generalInterpretations: [
		{
			class: "systematic-surface-collapse",
			confidence: "high",
			trace: ["reviewer summary", `${surfaceCommentEntries.length} comments`, "winner/slate/selected collapse counts"],
			developmentAction: "repair distinct-field evidence, ranking, and slate coverage without adding a raw cardinality reward",
		},
		{
			class: "gradient-under-availability",
			confidence: "high",
			trace: ["reviewer summary", `${missingGradientEntries.length} missing-gradient tags`, `${gradientCommentEntries.length} gradient comments`, "retained gradient count"],
			developmentAction: "improve spatial transition hypotheses and guarantee diagnostic slate retention for supported gradients",
		},
		{
			class: "nonexclusive-valid-directions",
			confidence: "high",
			trace: ["reviewer summary", `${nonexclusiveEntries.length} comments explicitly allow multiple directions`, `${winnerOverrides} winner overrides`],
			developmentAction: "preserve multiple field and role directions; collect optional also-valid choices in the next bounded review",
		},
		{
			class: "identity-role-availability-and-assignment",
			confidence: "medium",
			trace: [`${identityEntries.length} incomplete-identity tags`, "foreground and accent comment interpretations"],
			developmentAction: "retain region-level signature and foreground evidence rather than treating selected colors as targets",
		},
	],
	responseInterpretations,
}
const analysis = { ...analysisWithoutId, analysisId: sha256(JSON.stringify(analysisWithoutId)) }
const temporary = `${outputPath}.${process.pid}.tmp`
await writeFile(temporary, `${JSON.stringify(analysis, null, 2)}\n`)
await rename(temporary, outputPath)
process.stdout.write(`Analyzed ${feedback.entries.length}/${manifest.cases.length} responses as ${analysis.analysisId}\n`)
