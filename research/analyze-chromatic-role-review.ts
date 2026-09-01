import { randomUUID } from "node:crypto"
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	parseChromaticRoleReviewFeedbackStore,
	parseChromaticRoleReviewManifest,
	type ChromaticRoleReviewEntry,
	type ChromaticRoleReviewFeedbackEntry,
	type ChromaticRoleReviewQuality,
} from "./src/chromatic-role-review.ts"

const [manifestArgument, feedbackArgument, outputArgument, ...unexpected] = process.argv.slice(2)
if (!manifestArgument || !feedbackArgument || !outputArgument || unexpected.length > 0) {
	throw new Error("Usage: analyze-chromatic-role-review.ts <manifest.json> <feedback.json> <output.json>")
}

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const manifestPath = resolve(manifestArgument)
const feedbackPath = resolve(feedbackArgument)
const outputPath = resolve(outputArgument)

function algorithmQuality(
	entry: ChromaticRoleReviewEntry,
	feedback: ChromaticRoleReviewFeedbackEntry,
	algorithm: "baseline" | "candidate",
): ChromaticRoleReviewQuality | null {
	const option = entry.assignment.A === algorithm ? "A" : "B"
	return option === "A" ? feedback.qualityA : feedback.qualityB
}

function conclusion(entry: ChromaticRoleReviewEntry, feedback: ChromaticRoleReviewFeedbackEntry): string {
	if (feedback.preference === "a-stronger") return `${entry.assignment.A}-preferred`
	if (feedback.preference === "b-stronger") return `${entry.assignment.B}-preferred`
	if (feedback.preference === "both-similarly-valid") return "similarly-valid"
	if (feedback.preference === "neither-acceptable") return "neither-acceptable"
	return "uncertain"
}

function summarize(entries: Array<{ conclusion: string; baselineQuality: string | null; candidateQuality: string | null }>) {
	const qualityHistogram = (field: "baselineQuality" | "candidateQuality") => Object.fromEntries(
		["strong", "acceptable-not-ideal", "weak-fallback", "unacceptable", "uncertain"].map((quality) => [
			quality,
			entries.filter((entry) => entry[field] === quality).length,
		]),
	)
	return {
		entries: entries.length,
		candidatePreferred: entries.filter((entry) => entry.conclusion === "candidate-preferred").length,
		baselinePreferred: entries.filter((entry) => entry.conclusion === "baseline-preferred").length,
		similarlyValid: entries.filter((entry) => entry.conclusion === "similarly-valid").length,
		neitherAcceptable: entries.filter((entry) => entry.conclusion === "neither-acceptable").length,
		uncertain: entries.filter((entry) => entry.conclusion === "uncertain").length,
		baselineQuality: qualityHistogram("baselineQuality"),
		candidateQuality: qualityHistogram("candidateQuality"),
	}
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

const manifest = parseChromaticRoleReviewManifest(JSON.parse(await readFile(manifestPath, "utf8")) as unknown)
const feedback = parseChromaticRoleReviewFeedbackStore(
	JSON.parse(await readFile(feedbackPath, "utf8")) as unknown,
	manifest,
)
if (feedback.entries.length !== manifest.entries.length) {
	throw new Error(`Review is incomplete: ${feedback.entries.length}/${manifest.entries.length} cases`)
}
const feedbackByCase = new Map(feedback.entries.map((entry) => [entry.caseId, entry]))
const entries = manifest.entries.map((entry) => {
	const judgment = feedbackByCase.get(entry.caseId)
	if (!judgment) throw new Error(`Review is missing ${entry.caseId}`)
	return {
		caseId: entry.caseId,
		file: entry.source.file,
		cohort: entry.cohort,
		changedRoles: entry.changedRoles,
		baselineOption: entry.assignment.A === "baseline" ? "A" : "B",
		candidateOption: entry.assignment.A === "candidate" ? "A" : "B",
		baselineQuality: algorithmQuality(entry, judgment, "baseline"),
		candidateQuality: algorithmQuality(entry, judgment, "candidate"),
		conclusion: conclusion(entry, judgment),
		note: judgment.note,
	}
})
const accepted = entries.filter((entry) => entry.cohort === "accepted")
const rejectedTarget = entries.filter((entry) => entry.cohort === "rejected-target")
const unselectedHoldout = entries.filter((entry) => entry.cohort === "unselected-holdout")
const isUnselectedReview = unselectedHoldout.length > 0
const unselectedSummary = summarize(unselectedHoldout)
const analysis = {
	schemaVersion: 1,
	reviewVersion: manifest.reviewVersion,
	manifestId: manifest.manifestId,
	baselineAlgorithmVersion: manifest.baselineAlgorithmVersion,
	candidateAlgorithmVersion: manifest.candidateAlgorithmVersion,
	completedAt: new Date(Math.max(...feedback.entries.map((entry) => Date.parse(entry.submittedAt)))).toISOString(),
	summary: {
		accepted: summarize(accepted),
		rejectedTarget: summarize(rejectedTarget),
		unselectedHoldout: unselectedSummary,
	},
	decision: {
		candidatePromotable: isUnselectedReview
			? unselectedSummary.baselinePreferred === 0 && unselectedSummary.neitherAcceptable === 0
			: false,
		availabilityEvidenceRetained: true,
		unboundedRoleAdmissionRetained: false,
		rationale: isUnselectedReview
			? "The bounded candidate requires no baseline-preferred or jointly unacceptable eligible holdout changes."
			: "The candidate won two accepted cases and tied one, but lost the rejected target it was designed to repair.",
		nextExperiment: isUnselectedReview
			? "Combine this result with the carried accepted-case review before any promotion decision."
			: "Bound role admission to minor omitted chromatic families and preserve broad multi-hue artwork treatments.",
	},
	entries,
}
await writeExclusiveJson(outputPath, analysis)
process.stderr.write(`Wrote chromatic role review analysis to ${relative(projectRoot, outputPath)}\n`)
