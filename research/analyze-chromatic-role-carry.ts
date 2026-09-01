import { randomUUID } from "node:crypto"
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { okDistance, rgbToOKLab } from "./src/color.ts"
import { roleDistanceThreshold, roleNames } from "./src/candidate-comparison.ts"
import {
	parseChromaticRoleReviewFeedbackStore,
	parseChromaticRoleReviewManifest,
	type ChromaticRolePresentedPalette,
	type ChromaticRoleReviewEntry,
	type ChromaticRoleReviewFeedbackEntry,
} from "./src/chromatic-role-review.ts"
import type { CorpusResult, Palette } from "./src/types.ts"

const [candidateArgument, outputArgument, ...reviewArguments] = process.argv.slice(2)
if (!candidateArgument || !outputArgument || reviewArguments.length < 2 || reviewArguments.length % 2 !== 0) {
	throw new Error("Usage: analyze-chromatic-role-carry.ts <candidate-dir> <output.json> <manifest.json> <feedback.json> [...]")
}

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const candidateRoot = resolve(candidateArgument)
const outputPath = resolve(outputArgument)

function materiallyChanged(baseline: Palette, candidate: Palette): boolean {
	return baseline.gradient.isGradient !== candidate.gradient.isGradient || roleNames.some((role) =>
		okDistance(rgbToOKLab(baseline[role].rgb), rgbToOKLab(candidate[role].rgb)) > roleDistanceThreshold)
}

function matches(presented: ChromaticRolePresentedPalette, palette: Palette): boolean {
	return presented.gradient.isGradient === palette.gradient.isGradient && roleNames.every((role) =>
		presented.roles[role].hex === palette[role].hex.toLowerCase() &&
		presented.roles[role].generated === palette[role].generated)
}

function conclusion(entry: ChromaticRoleReviewEntry, feedback: ChromaticRoleReviewFeedbackEntry): string {
	if (feedback.preference === "a-stronger") return `${entry.assignment.A}-preferred`
	if (feedback.preference === "b-stronger") return `${entry.assignment.B}-preferred`
	if (feedback.preference === "both-similarly-valid") return "similarly-valid"
	if (feedback.preference === "neither-acceptable") return "neither-acceptable"
	return "uncertain"
}

async function writeExclusiveJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true })
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	try {
		await link(temporary, path)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Refusing to overwrite ${path}`)
		throw error
	} finally {
		await rm(temporary, { force: true })
	}
}

const [baseline, candidate] = await Promise.all([
	readFile(join(researchRoot, "data/holdout-results.json"), "utf8").then((source) => JSON.parse(source) as CorpusResult),
	readFile(join(candidateRoot, "holdout-results.json"), "utf8").then((source) => JSON.parse(source) as CorpusResult),
])
const baselineByFile = new Map(baseline.entries.map((entry) => [entry.file, entry.extraction.methods.spatial]))
const candidateByFile = new Map(candidate.entries.map((entry) => [entry.file, entry.extraction.methods.spatial]))
const changedFiles = baseline.entries.filter((entry) => {
	const candidatePalette = candidateByFile.get(entry.file)
	if (!candidatePalette) throw new Error(`Candidate is missing ${entry.file}`)
	return materiallyChanged(entry.extraction.methods.spatial, candidatePalette)
}).map((entry) => entry.file)

const reviewByFile = new Map<string, { entry: ChromaticRoleReviewEntry; feedback: ChromaticRoleReviewFeedbackEntry; manifestId: string }>()
for (let index = 0; index < reviewArguments.length; index += 2) {
	const manifest = parseChromaticRoleReviewManifest(
		JSON.parse(await readFile(resolve(reviewArguments[index]), "utf8")) as unknown,
	)
	const feedback = parseChromaticRoleReviewFeedbackStore(
		JSON.parse(await readFile(resolve(reviewArguments[index + 1]), "utf8")) as unknown,
		manifest,
	)
	const feedbackByCase = new Map(feedback.entries.map((entry) => [entry.caseId, entry]))
	for (const entry of manifest.entries) {
		const judgment = feedbackByCase.get(entry.caseId)
		if (!judgment) throw new Error(`Review ${manifest.manifestId} is missing ${entry.caseId}`)
		if (reviewByFile.has(entry.source.file)) throw new Error(`Duplicate review evidence for ${entry.source.file}`)
		reviewByFile.set(entry.source.file, { entry, feedback: judgment, manifestId: manifest.manifestId })
	}
}

const entries = changedFiles.map((file) => {
	const baselinePalette = baselineByFile.get(file)!
	const candidatePalette = candidateByFile.get(file)!
	const review = reviewByFile.get(file)
	if (!review) throw new Error(`Changed candidate palette has no review evidence: ${file}`)
	const baselineOption = review.entry.assignment.A === "baseline" ? "A" : "B"
	const candidateOption = review.entry.assignment.A === "candidate" ? "A" : "B"
	if (!matches(review.entry.options[baselineOption], baselinePalette)) {
		throw new Error(`Reviewed baseline presentation is stale for ${file}`)
	}
	if (!matches(review.entry.options[candidateOption], candidatePalette)) {
		throw new Error(`Reviewed candidate presentation is stale for ${file}`)
	}
	if (review.feedback.sourceEligibility !== "eligible-artwork") {
		throw new Error(`Changed candidate source is not eligible artwork: ${file}`)
	}
	const candidateQuality = candidateOption === "A" ? review.feedback.qualityA : review.feedback.qualityB
	return {
		file,
		manifestId: review.manifestId,
		caseId: review.entry.caseId,
		cohort: review.entry.cohort,
		candidateOption,
		candidateQuality,
		conclusion: conclusion(review.entry, review.feedback),
	}
})
const summary = {
	changed: entries.length,
	candidatePreferred: entries.filter((entry) => entry.conclusion === "candidate-preferred").length,
	baselinePreferred: entries.filter((entry) => entry.conclusion === "baseline-preferred").length,
	similarlyValid: entries.filter((entry) => entry.conclusion === "similarly-valid").length,
	neitherAcceptable: entries.filter((entry) => entry.conclusion === "neither-acceptable").length,
	uncertain: entries.filter((entry) => entry.conclusion === "uncertain").length,
	candidateQuality: Object.fromEntries(
		["strong", "acceptable-not-ideal", "weak-fallback", "unacceptable", "uncertain"].map((quality) => [
			quality,
			entries.filter((entry) => entry.candidateQuality === quality).length,
		]),
	),
}
const supported = summary.changed > 0 && summary.baselinePreferred === 0 && summary.neitherAcceptable === 0 &&
	summary.uncertain === 0 && entries.every((entry) =>
		entry.candidateQuality === "strong" || entry.candidateQuality === "acceptable-not-ideal")
await writeExclusiveJson(outputPath, {
	schemaVersion: 1,
	algorithmVersion: candidate.algorithmVersion,
	baselineAlgorithmVersion: baseline.algorithmVersion,
	roleDistanceThreshold,
	reviewManifestIds: [...new Set(entries.map((entry) => entry.manifestId))].sort(),
	summary,
	decision: {
		supportedByReviewedChanges: supported,
		promotionReady: false,
		rationale: supported
			? "Every emitted palette exactly matches reviewed positive or similarly valid evidence, but both admission bounds were selected from this development-facing review corpus."
			: "One or more emitted palettes lacks positive review support.",
		nextStep: "Freeze the constrained POC and require fresh validation before canonical promotion.",
	},
	entries,
})
process.stderr.write(`Wrote chromatic role carry analysis to ${relative(projectRoot, outputPath)}\n`)
