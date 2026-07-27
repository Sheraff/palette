import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	parsePhase4PrivateReviewManifest,
	parsePhase4ReviewFeedbackStore,
	type Phase4ReviewSide,
} from "./src/album-artwork-palette-v2-phase-4-review.ts"

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const experimentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.5.1-development")
const manifestPath = resolve(experimentDirectory, "ranking-review-manifest.private.json")
const feedbackPath = resolve(experimentDirectory, "ranking-review-feedback.private.json")
const preparationPath = resolve(experimentDirectory, "ranking-review-preparation.json")
const outputPath = resolve(experimentDirectory, "ranking-review-analysis.json")

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	const record = value as Record<string, unknown>
	return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
	await rename(temporary, path)
}

const [manifestRaw, feedbackRaw, preparationRaw] = await Promise.all([
	readFile(manifestPath, "utf8"),
	readFile(feedbackPath, "utf8"),
	readFile(preparationPath, "utf8"),
])
const manifest = parsePhase4PrivateReviewManifest(JSON.parse(manifestRaw) as unknown)
const feedback = parsePhase4ReviewFeedbackStore(JSON.parse(feedbackRaw) as unknown, manifest)
const preparation = JSON.parse(preparationRaw) as {
	manifestId: string
	candidateVersion: string
	implementationHash: string
	scientificSha256: string
	predecessorVersion: string
	reviewCaseCount: number
	futureSampleOpened: false
}
if (preparation.manifestId !== manifest.manifestId || preparation.reviewCaseCount !== manifest.cases.length ||
	preparation.futureSampleOpened !== false || feedback.entries.length !== manifest.cases.length) {
	throw new Error("Ranking review is incomplete or stale")
}
const feedbackByCase = new Map(feedback.entries.map((entry) => [entry.caseId, entry]))
const cases = manifest.cases.map((reviewCase) => {
	const entry = feedbackByCase.get(reviewCase.caseId)
	if (!entry) throw new Error(`Missing feedback for ${reviewCase.caseId}`)
	const candidateSide = (reviewCase.assignment.A === "candidate" ? "A" : "B") as Phase4ReviewSide
	const predecessorSide = candidateSide === "A" ? "B" : "A"
	const candidateQuality = candidateSide === "A" ? entry.qualityA : entry.qualityB
	const predecessorQuality = predecessorSide === "A" ? entry.qualityA : entry.qualityB
	const candidateStronger = entry.comparison === `${candidateSide.toLowerCase()}-stronger`
	const predecessorStronger = entry.comparison === `${predecessorSide.toLowerCase()}-stronger`
	const pass = (candidateQuality === "strong" || candidateQuality === "acceptable") &&
		(candidateStronger || entry.comparison === "similarly-valid") && !predecessorStronger
	return {
		caseId: reviewCase.caseId,
		sourceSha256: reviewCase.source.sha256,
		candidateQuality,
		predecessorQuality,
		comparison: entry.comparison,
		candidateTags: candidateSide === "A" ? entry.tagsA : entry.tagsB,
		predecessorTags: predecessorSide === "A" ? entry.tagsA : entry.tagsB,
		comment: entry.comment,
		pass,
	}
})
const gate = {
	pass: cases.every(({ pass }) => pass),
	reviewedCount: cases.length,
	candidatePositiveCount: cases.filter(({ candidateQuality }) =>
		candidateQuality === "strong" || candidateQuality === "acceptable").length,
	candidateStrongerCount: cases.filter(({ comparison }, index) => {
		const candidateSide = manifest.cases[index].assignment.A === "candidate" ? "a" : "b"
		return comparison === `${candidateSide}-stronger`
	}).length,
	similarlyValidCount: cases.filter(({ comparison }) => comparison === "similarly-valid").length,
	failedCaseIds: cases.filter(({ pass }) => !pass).map(({ caseId }) => caseId),
}
const analysisWithoutId = {
	schemaVersion: 1,
	reviewVersion: manifest.reviewVersion,
	manifestId: manifest.manifestId,
	candidateVersion: preparation.candidateVersion,
	implementationHash: preparation.implementationHash,
	scientificSha256: preparation.scientificSha256,
	predecessorVersion: preparation.predecessorVersion,
	inputHashes: {
		manifestSha256: sha256(manifestRaw),
		feedbackSha256: sha256(feedbackRaw),
		preparationSha256: sha256(preparationRaw),
	},
	gate,
	cases,
	futureSampleOpened: false,
	phaseDisposition: gate.pass
		? "0.5.1-ranking-human-checkpoint-passed-candidate-freeze-eligible"
		: "0.5.1-ranking-human-checkpoint-failed-return-to-development",
}
const analysis = { ...analysisWithoutId, analysisId: sha256(canonicalJson(analysisWithoutId)) }
await atomicJson(outputPath, analysis)
process.stdout.write(`${JSON.stringify({ gate, phaseDisposition: analysis.phaseDisposition })}\n`)
