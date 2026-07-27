import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parsePhase4PrivateReviewManifest, parsePhase4ReviewFeedbackStore } from "./src/album-artwork-palette-v2-phase-4-review.ts"

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const experimentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.6.0-phase-4-future-03")
const manifestPath = resolve(experimentDirectory, "review-manifest.private.json")
const provenancePath = resolve(experimentDirectory, "review-provenance.private.json")
const runCompletePath = resolve(experimentDirectory, "run-complete.json")
const feedbackPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-0.6.0-phase-4-future-03-feedback.json")
const interpretationsPath = resolve(experimentDirectory, "technical-interpretations.json")
const outputPath = resolve(experimentDirectory, "phase-4-analysis.json")

type Quality = "strong" | "acceptable" | "weak-fallback" | "unacceptable" | "uncertain"

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	const record = value as Record<string, unknown>
	return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
}

function counts(values: readonly string[]): Record<string, number> {
	const output: Record<string, number> = {}
	for (const value of values) output[value] = (output[value] ?? 0) + 1
	return Object.fromEntries(Object.entries(output).sort(([first], [second]) => first.localeCompare(second)))
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
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
if (manifest.reviewVersion !== "album-artwork-palette-v2-phase-4-future-03-review-v1" || feedback.entries.length !== 12) {
	throw new Error("Future sample 03 analysis requires the exact complete 12-case review")
}
const provenanceValue = JSON.parse(provenanceRaw) as {
	manifestId: string
	reviewVersion: string
	protocolId: string
	futureSampleManifestId: string
	futureSampleSealCommitment: string
	runtime: unknown
	cases: Array<{
		reviewCaseId: string
		private: {
			futureCaseId: string
			assignmentKey: string
			candidateSide: "A" | "B"
			baselineSide: "A" | "B"
			candidate: { presentationSha256: string }
			baseline: { presentationSha256: string }
		}
	}>
}
const { manifestId: provenanceId, ...provenanceIdentity } = provenanceValue
if (sha256(canonicalJson(provenanceIdentity)) !== provenanceId || provenanceValue.reviewVersion !== manifest.reviewVersion ||
	provenanceValue.futureSampleManifestId !== "bee665792a4ddfaeb3541aa5e58181c8f3a0685836b13475643d9deccace4060" ||
	provenanceValue.futureSampleSealCommitment !== "139d9c9fe72838c9618f0cb575cda34d1b7b54c8e83a9d1446034c76b35b75ba") {
	throw new Error("Future sample 03 review provenance is stale")
}
const runComplete = JSON.parse(runCompleteRaw) as {
	experimentVersion: string
	protocolId: string
	futureSampleConsumed: true
	sourceCount: number
	candidateCount: number
	baselineCount: number
	privateReviewManifestId: string
	privateReviewManifestSha256: string
	reviewProvenanceId: string
	reviewProvenanceSha256: string
}
if (runComplete.experimentVersion !== "album-artwork-palette-v2-0.6.0-phase-4-future-03" ||
	runComplete.futureSampleConsumed !== true || runComplete.sourceCount !== 12 || runComplete.candidateCount !== 12 ||
	runComplete.baselineCount !== 12 || runComplete.privateReviewManifestId !== manifest.manifestId ||
	runComplete.privateReviewManifestSha256 !== sha256(manifestRaw) || runComplete.reviewProvenanceId !== provenanceId ||
	runComplete.reviewProvenanceSha256 !== sha256(provenanceRaw) || runComplete.protocolId !== provenanceValue.protocolId) {
	throw new Error("Future sample 03 run-complete binding is invalid")
}
const interpretations = JSON.parse(interpretationsRaw) as {
	schemaVersion: 1
	entries: Array<{ caseId: string; commentSha256: string; classes: string[]; rationale: string; uncertain: boolean }>
}
if (interpretations.schemaVersion !== 1 || !Array.isArray(interpretations.entries) ||
	new Set(interpretations.entries.map(({ caseId }) => caseId)).size !== interpretations.entries.length) {
	throw new Error("Future sample 03 technical interpretations are invalid")
}
const provenanceByCase = new Map(provenanceValue.cases.map((entry) => [entry.reviewCaseId, entry]))
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
		if (!interpretation || interpretation.commentSha256 !== sha256(entry.comment) ||
			!Array.isArray(interpretation.classes) || new Set(interpretation.classes).size !== interpretation.classes.length ||
			interpretation.classes.some((value) => typeof value !== "string" || value.length === 0) ||
			typeof interpretation.rationale !== "string" || typeof interpretation.uncertain !== "boolean") {
			throw new Error(`Missing or stale technical interpretation for ${entry.caseId}`)
		}
	} else if (interpretation) throw new Error(`Unexpected technical interpretation for ${entry.caseId}`)
	return {
		caseId: entry.caseId,
		futureCaseId: bound.private.futureCaseId,
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
if (new Set(results.map(({ caseId }) => caseId)).size !== 12 || provenanceValue.cases.length !== 12) {
	throw new Error("Future sample 03 results are duplicated or incomplete")
}
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
	protocolId: provenanceValue.protocolId,
	futureSampleManifestId: provenanceValue.futureSampleManifestId,
	futureSampleSealCommitment: provenanceValue.futureSampleSealCommitment,
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
	runtime: provenanceValue.runtime,
	repeatConsistency: { intentionalRepeatsIncluded: false },
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
		"No adaptation or rerun on future sample 03 is permitted.",
		"Phase 5, promotion, persistence, and full-roster execution require a separate decision.",
	],
	phaseDisposition: advancement
		? "phase4-future-03-directional-gate-passed-separate-phase5-decision-required"
		: "phase4-future-03-directional-gate-failed-reassess-approach",
}
await atomicJson(outputPath, analysis)
process.stdout.write(`${JSON.stringify({ counts: analysis.counts, advancementGate: analysis.advancementGate,
	phaseDisposition: analysis.phaseDisposition })}\n`)
