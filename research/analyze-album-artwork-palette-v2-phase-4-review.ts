import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	parsePhase4PrivateReviewManifest,
	parsePhase4ReviewFeedbackStore,
} from "./src/album-artwork-palette-v2-phase-4-review.ts"

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const experimentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.4.4-phase-4")
const manifestPath = resolve(experimentDirectory, "review-manifest.private.json")
const provenancePath = resolve(experimentDirectory, "review-provenance.private.json")
const runCompletePath = resolve(experimentDirectory, "run-complete.json")
const feedbackPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-0.4.4-phase-4-feedback.json")
const interpretationsPath = resolve(experimentDirectory, "technical-interpretations.json")
const outputPath = resolve(experimentDirectory, "phase-4-analysis.json")

type Quality = "strong" | "acceptable" | "weak-fallback" | "unacceptable" | "uncertain"

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function counts(values: readonly string[]): Record<string, number> {
	const output: Record<string, number> = {}
	for (const value of values) output[value] = (output[value] ?? 0) + 1
	return Object.fromEntries(Object.entries(output).sort(([first], [second]) => first.localeCompare(second)))
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
	await rename(temporary, path)
}

const [manifestRaw, provenanceRaw, runCompleteRaw, feedbackRaw, interpretationsRaw] = await Promise.all([
	readFile(manifestPath, "utf8"),
	readFile(provenancePath, "utf8"),
	readFile(runCompletePath, "utf8"),
	readFile(feedbackPath, "utf8"),
	readFile(interpretationsPath, "utf8"),
])
const manifest = parsePhase4PrivateReviewManifest(JSON.parse(manifestRaw) as unknown)
const feedback = parsePhase4ReviewFeedbackStore(JSON.parse(feedbackRaw) as unknown, manifest)
if (feedback.entries.length !== 12) throw new Error("Phase 4 analysis requires all 12 responses")
const provenance = JSON.parse(provenanceRaw) as {
	protocolId: string
	freshManifestId: string
	freshSealCommitment: string
	runtime: unknown
	cases: Array<{
		reviewCaseId: string
		private: {
			freshCaseId: string
			assignmentKey: string
			candidateSide: "A" | "B"
			baselineSide: "A" | "B"
			candidate: { presentationSha256: string }
			baseline: { presentationSha256: string; promotedPoc10ExactPresentationMatch: boolean }
		}
	}>
}
const runComplete = JSON.parse(runCompleteRaw) as {
	protocolId: string
	sourceCount: number
	candidateCount: number
	baselineCount: number
	baselinePoc10ExactPresentationMatchCount: number
	privateReviewManifestId: string
}
if (runComplete.sourceCount !== 12 || runComplete.candidateCount !== 12 || runComplete.baselineCount !== 12 ||
	runComplete.baselinePoc10ExactPresentationMatchCount !== 12 ||
	runComplete.privateReviewManifestId !== manifest.manifestId || runComplete.protocolId !== provenance.protocolId) {
	throw new Error("Phase 4 run-complete binding is invalid")
}
const interpretations = JSON.parse(interpretationsRaw) as {
	schemaVersion: 1
	entries: Array<{
		caseId: string
		commentSha256: string
		classes: string[]
		rationale: string
		uncertain: boolean
	}>
}
if (interpretations.schemaVersion !== 1 || !Array.isArray(interpretations.entries)) {
	throw new Error("Phase 4 technical interpretations are invalid")
}
const provenanceByCase = new Map(provenance.cases.map((entry) => [entry.reviewCaseId, entry]))
const interpretationByCase = new Map(interpretations.entries.map((entry) => [entry.caseId, entry]))
const results = feedback.entries.map((entry) => {
	const bound = provenanceByCase.get(entry.caseId)
	if (!bound) throw new Error(`Missing private provenance for ${entry.caseId}`)
	const candidateSide = bound.private.candidateSide
	const candidateQuality = (candidateSide === "A" ? entry.qualityA : entry.qualityB) as Quality
	const baselineQuality = (candidateSide === "A" ? entry.qualityB : entry.qualityA) as Quality
	const candidateTags = candidateSide === "A" ? entry.tagsA : entry.tagsB
	const baselineTags = candidateSide === "A" ? entry.tagsB : entry.tagsA
	const relative = entry.comparison === "uncertain" || entry.comparison === "neither-acceptable" || entry.comparison === "similarly-valid"
		? entry.comparison
		: entry.comparison === "a-stronger"
			? candidateSide === "A" ? "candidate-stronger" : "baseline-stronger"
			: candidateSide === "B" ? "candidate-stronger" : "baseline-stronger"
	const interpretation = interpretationByCase.get(entry.caseId)
	if (entry.comment.length > 0) {
		if (!interpretation || interpretation.commentSha256 !== sha256(entry.comment)) {
			throw new Error(`Missing or stale technical interpretation for ${entry.caseId}`)
		}
	} else if (interpretation) {
		throw new Error(`Unexpected technical interpretation for empty comment ${entry.caseId}`)
	}
	return {
		caseId: entry.caseId,
		freshCaseId: bound.private.freshCaseId,
		assignmentKey: bound.private.assignmentKey,
		candidateSide,
		candidateQuality,
		baselineQuality,
		relative,
		candidateTags,
		baselineTags,
		comment: entry.comment,
		technicalInterpretation: interpretation ?? null,
	}
})
if (new Set(results.map(({ caseId }) => caseId)).size !== 12) throw new Error("Phase 4 results are duplicated")
const candidateQualities = results.map(({ candidateQuality }) => candidateQuality)
const positiveCandidateCount = candidateQualities.filter((quality) => quality === "strong" || quality === "acceptable").length
const relativeCounts = counts(results.map(({ relative }) => relative))
const technicalClassCounts = counts(results.flatMap(({ technicalInterpretation }) => technicalInterpretation?.classes ?? []))
const repeatedTechnicalClasses = Object.entries(technicalClassCounts).filter(([, count]) => count >= 2).map(([name]) => name)
const advancement = (relativeCounts["candidate-stronger"] ?? 0) > (relativeCounts["baseline-stronger"] ?? 0) &&
	positiveCandidateCount >= 7 && repeatedTechnicalClasses.length === 0
const analysis = {
	schemaVersion: 1,
	reviewVersion: manifest.reviewVersion,
	manifestId: manifest.manifestId,
	protocolId: provenance.protocolId,
	freshManifestId: provenance.freshManifestId,
	freshSealCommitment: provenance.freshSealCommitment,
	inputHashes: {
		manifestSha256: sha256(manifestRaw),
		provenanceSha256: sha256(provenanceRaw),
		runCompleteSha256: sha256(runCompleteRaw),
		feedbackSha256: sha256(feedbackRaw),
		technicalInterpretationsSha256: sha256(interpretationsRaw),
	},
	counts: {
		caseCount: results.length,
		relative: relativeCounts,
		candidateQuality: counts(candidateQualities),
		baselineQuality: counts(results.map(({ baselineQuality }) => baselineQuality)),
		candidateTags: counts(results.flatMap(({ candidateTags }) => candidateTags)),
		baselineTags: counts(results.flatMap(({ baselineTags }) => baselineTags)),
		positiveCandidateCount,
		technicalClasses: technicalClassCounts,
	},
	runtime: provenance.runtime,
	repeatConsistency: {
		intentionalRepeatsIncluded: false,
		note: "One selected source had historical baseline exposure; this is declared provenance, not a designed repeat-consistency estimate.",
	},
	results,
	advancementGate: {
		pass: advancement,
		candidateStrongerThanBaseline: (relativeCounts["candidate-stronger"] ?? 0) > (relativeCounts["baseline-stronger"] ?? 0),
		candidateQualityCommonlyPositive: positiveCandidateCount >= 7,
		noRepeatedSystemicFailureClass: repeatedTechnicalClasses.length === 0,
		repeatedTechnicalClasses,
	},
	limitations: [
		"This is a 12-source deterministic directional sample, not a population-wide estimate.",
		"The sample was output-unseen for the V2 candidate but not historically untouched by the external baseline research.",
		"No adaptation, promotion, persistence, or full-roster execution is authorized by this analysis alone.",
	],
	phaseDisposition: advancement
		? "phase4-directional-gate-passed-phase5-may-begin"
		: "phase4-directional-gate-failed-return-to-development-with-new-future-sample",
}

await atomicJson(outputPath, analysis)
process.stdout.write(`${JSON.stringify({ counts: analysis.counts, advancementGate: analysis.advancementGate, phaseDisposition: analysis.phaseDisposition })}\n`)
