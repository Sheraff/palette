import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	parsePhase4PrivateReviewManifest,
	parsePhase4ReviewFeedbackStore,
	type Phase4ReviewPalette,
	type Phase4ReviewSide,
} from "./src/album-artwork-palette-v2-phase-4-review.ts"
import type { CompletePaletteTreatment } from "./src/album-artwork-palette-v2.ts"

type Aggregate = Readonly<{
	candidateVersion: string
	implementationHash: string
	developmentManifestId: string
	scientificSha256: string
	cases: ReadonlyArray<Readonly<{
		source: Readonly<{ caseId: string; sha256: string }>
		extraction: Readonly<{ winner: CompletePaletteTreatment }>
	}>>
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const experimentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.6.0-development")
const predecessorDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.5.2-development")
const manifestPath = resolve(experimentDirectory, "gradient-challenger-review-manifest.private.json")
const feedbackPath = resolve(experimentDirectory, "gradient-challenger-review-feedback.private.json")
const preparationPath = resolve(experimentDirectory, "gradient-challenger-review-preparation.json")
const outputPath = resolve(experimentDirectory, "gradient-challenger-review-analysis.json")

function sha256(value: string | Uint8Array): string {
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
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	await rename(temporary, path)
}

function treatmentKey(treatment: CompletePaletteTreatment): string {
	return [treatment.background.hex, treatment.surface.hex, treatment.foreground.hex, treatment.accent.hex,
		treatment.gradient ? "gradient" : "flat", treatment.collapse.surface ? "surface-collapsed" : "surface-distinct",
		treatment.collapse.accent ? "accent-collapsed" : "accent-distinct"].join(":")
}

function paletteKey(palette: Phase4ReviewPalette): string {
	return [palette.roles.background.hex, palette.roles.surface.hex, palette.roles.foreground.hex, palette.roles.accent.hex,
		palette.gradient ? "gradient" : "flat", palette.collapse.surface ? "surface-collapsed" : "surface-distinct",
		palette.collapse.accent ? "accent-collapsed" : "accent-distinct"].join(":")
}

const [manifestRaw, feedbackRaw, preparationRaw, currentRaw, predecessorRaw, developmentAnalysisRaw, future03Raw] =
	await Promise.all([
		readFile(manifestPath, "utf8"),
		readFile(feedbackPath, "utf8"),
		readFile(preparationPath, "utf8"),
		readFile(resolve(experimentDirectory, "aggregate.json"), "utf8"),
		readFile(resolve(predecessorDirectory, "aggregate.json"), "utf8"),
		readFile(resolve(experimentDirectory, "development-analysis.json"), "utf8"),
		readFile(resolve(moduleDirectory, "data/album-artwork-palette-v2-future-sample-03.sealed.json"), "utf8"),
	])
const manifest = parsePhase4PrivateReviewManifest(JSON.parse(manifestRaw) as unknown)
const feedback = parsePhase4ReviewFeedbackStore(JSON.parse(feedbackRaw) as unknown, manifest)
const current = JSON.parse(currentRaw) as Aggregate
const predecessor = JSON.parse(predecessorRaw) as Aggregate
const preparation = JSON.parse(preparationRaw) as {
	manifestId: string
	candidateVersion: string
	implementationHash: string
	scientificSha256: string
	predecessorVersion: string
	reviewCaseCount: number
	bindings: ReadonlyArray<Readonly<{
		caseId: string
		sourceSha256: string
		candidateSide: Phase4ReviewSide
		candidateTreatmentId: string
		candidateTreatmentKey: string
		predecessorTreatmentId: string
		predecessorTreatmentKey: string
	}>>
	inputHashes: Readonly<Record<"currentAggregateSha256" | "predecessorAggregateSha256" |
		"developmentAnalysisSha256" | "futureSample03Sha256", string>>
	futureSample03: Readonly<{ manifestId: string; opened: false }>
}
const future03 = JSON.parse(future03Raw) as { manifestId: string }
if (preparation.manifestId !== manifest.manifestId || preparation.reviewCaseCount !== 2 || manifest.cases.length !== 2 ||
	feedback.entries.length !== 2 || preparation.candidateVersion !== current.candidateVersion ||
	preparation.implementationHash !== current.implementationHash || preparation.scientificSha256 !== current.scientificSha256 ||
	preparation.predecessorVersion !== predecessor.candidateVersion || current.developmentManifestId !== predecessor.developmentManifestId ||
	preparation.inputHashes.currentAggregateSha256 !== sha256(currentRaw) ||
	preparation.inputHashes.predecessorAggregateSha256 !== sha256(predecessorRaw) ||
	preparation.inputHashes.developmentAnalysisSha256 !== sha256(developmentAnalysisRaw) ||
	preparation.inputHashes.futureSample03Sha256 !== sha256(future03Raw) ||
	preparation.futureSample03.opened !== false || preparation.futureSample03.manifestId !== future03.manifestId) {
	throw new Error("Gradient challenger review is incomplete or stale")
}
const feedbackByCase = new Map(feedback.entries.map((entry) => [entry.caseId, entry]))
const currentByCase = new Map(current.cases.map((entry) => [entry.source.caseId, entry]))
const predecessorByCase = new Map(predecessor.cases.map((entry) => [entry.source.caseId, entry]))
const bindingByCase = new Map(preparation.bindings.map((entry) => [entry.caseId, entry]))
const forbiddenCandidateTags = new Set(["extraneous gradient", "incomplete artwork identity"])
const cases = manifest.cases.map((reviewCase) => {
	const entry = feedbackByCase.get(reviewCase.caseId)
	const candidate = currentByCase.get(reviewCase.caseId)
	const old = predecessorByCase.get(reviewCase.caseId)
	const binding = bindingByCase.get(reviewCase.caseId)
	if (!entry || !candidate || !old || !binding || candidate.source.sha256 !== reviewCase.source.sha256 ||
		old.source.sha256 !== reviewCase.source.sha256) throw new Error(`Missing exact review binding for ${reviewCase.caseId}`)
	const candidateSide = (reviewCase.assignment.A === "candidate" ? "A" : "B") as Phase4ReviewSide
	const predecessorSide = candidateSide === "A" ? "B" : "A"
	if (binding.candidateSide !== candidateSide || binding.candidateTreatmentId !== candidate.extraction.winner.id ||
		binding.predecessorTreatmentId !== old.extraction.winner.id ||
		binding.candidateTreatmentKey !== treatmentKey(candidate.extraction.winner) ||
		binding.predecessorTreatmentKey !== treatmentKey(old.extraction.winner) ||
		paletteKey(reviewCase.options[candidateSide]) !== binding.candidateTreatmentKey ||
		paletteKey(reviewCase.options[predecessorSide]) !== binding.predecessorTreatmentKey) {
		throw new Error(`Treatment identity mismatch for ${reviewCase.caseId}`)
	}
	const candidateQuality = candidateSide === "A" ? entry.qualityA : entry.qualityB
	const predecessorQuality = predecessorSide === "A" ? entry.qualityA : entry.qualityB
	const candidateTags = candidateSide === "A" ? entry.tagsA : entry.tagsB
	const predecessorTags = predecessorSide === "A" ? entry.tagsA : entry.tagsB
	const expectedComparison = `${candidateSide.toLowerCase()}-stronger`
	const positive = candidateQuality === "strong" || candidateQuality === "acceptable"
	const strictlyStronger = entry.comparison === expectedComparison
	const tagsPass = candidateTags.every((tag) => !forbiddenCandidateTags.has(tag))
	return {
		caseId: reviewCase.caseId,
		sourceSha256: reviewCase.source.sha256,
		candidateTreatmentId: candidate.extraction.winner.id,
		predecessorTreatmentId: old.extraction.winner.id,
		candidateQuality,
		predecessorQuality,
		comparison: entry.comparison,
		candidateTags,
		predecessorTags,
		comment: entry.comment,
		positive,
		strictlyStronger,
		tagsPass,
		pass: positive && strictlyStronger && tagsPass,
	}
})
const gate = {
	pass: cases.length === 2 && cases.every(({ pass }) => pass),
	reviewedCount: cases.length,
	candidatePositiveCount: cases.filter(({ positive }) => positive).length,
	candidateStrongerCount: cases.filter(({ strictlyStronger }) => strictlyStronger).length,
	cleanCandidateTagCount: cases.filter(({ tagsPass }) => tagsPass).length,
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
		currentAggregateSha256: sha256(currentRaw),
		predecessorAggregateSha256: sha256(predecessorRaw),
		developmentAnalysisSha256: sha256(developmentAnalysisRaw),
		futureSample03Sha256: sha256(future03Raw),
	},
	gate,
	cases,
	futureSample03: { manifestId: future03.manifestId, opened: false },
	phaseDisposition: gate.pass
		? "0.6.0-gradient-challenger-human-gate-passed-candidate-freeze-eligible"
		: "0.6.0-gradient-challenger-human-gate-failed-reassess-approach",
}
const analysis = { ...analysisWithoutId, analysisId: sha256(canonicalJson(analysisWithoutId)) }
await atomicJson(outputPath, analysis)
process.stdout.write(`${JSON.stringify({ gate, phaseDisposition: analysis.phaseDisposition })}\n`)
