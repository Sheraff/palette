import { createHash, randomUUID } from "node:crypto"
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	parseChromaticRoleReviewFeedbackStore,
	parseChromaticRoleReviewManifest,
	type ChromaticRoleReviewEntry,
	type ChromaticRoleReviewFeedbackEntry,
} from "./src/chromatic-role-review.ts"
import {
	parseChromaticRoleReserveProtocol,
	verifyChromaticRoleReserveImplementation,
} from "./src/chromatic-role-reserve.ts"

const [protocolArgument, evaluationArgument, manifestArgument, feedbackArgument, outputArgument, ...unexpected] =
	process.argv.slice(2)
if (!protocolArgument || !evaluationArgument || !manifestArgument || !feedbackArgument || !outputArgument ||
	unexpected.length > 0) {
	throw new Error("Usage: analyze-chromatic-role-reserve-review.ts <protocol.json> <evaluation-dir> <manifest.json> <feedback.json> <output.json>")
}

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const protocol = parseChromaticRoleReserveProtocol(
	JSON.parse(await readFile(resolve(protocolArgument), "utf8")) as unknown,
)
await verifyChromaticRoleReserveImplementation(protocol, projectRoot)

type Evaluation = {
	protocolId: string
	materialChanges: { count: number; files: Array<{ file: string; materialChanges: string[] }> }
	validation: { violations: number }
}

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
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

const evaluationRoot = resolve(evaluationArgument)
const [evaluation, baselineSource, candidateSource] = await Promise.all([
	readFile(join(evaluationRoot, "evaluation.json"), "utf8").then((source) => JSON.parse(source) as Evaluation),
	readFile(join(evaluationRoot, "baseline-results.json")),
	readFile(join(evaluationRoot, "candidate-results.json")),
])
if (evaluation.protocolId !== protocol.protocolId) throw new Error("Reserve evaluation does not match the protocol")
const manifest = parseChromaticRoleReviewManifest(
	JSON.parse(await readFile(resolve(manifestArgument), "utf8")) as unknown,
)
if (manifest.baselineAlgorithmVersion !== protocol.baselineAlgorithmVersion ||
	manifest.candidateAlgorithmVersion !== protocol.candidateAlgorithmVersion ||
	manifest.provenance.baselineHoldoutSha256 !== sha256(baselineSource) ||
	manifest.provenance.candidateHoldoutSha256 !== sha256(candidateSource)) {
	throw new Error("Reserve review manifest does not match the frozen evaluation")
}
const feedback = parseChromaticRoleReviewFeedbackStore(
	JSON.parse(await readFile(resolve(feedbackArgument), "utf8")) as unknown,
	manifest,
)
if (feedback.entries.length !== manifest.entries.length) {
	throw new Error(`Reserve review is incomplete: ${feedback.entries.length}/${manifest.entries.length}`)
}
const feedbackByCase = new Map(feedback.entries.map((entry) => [entry.caseId, entry]))
const materialFiles = new Set(evaluation.materialChanges.files.map((entry) => entry.file))
const reviewedMaterialFiles = new Set(manifest.entries.filter((entry) => materialFiles.has(entry.source.file))
	.map((entry) => entry.source.file))
const allMaterialChangesReviewed = reviewedMaterialFiles.size === materialFiles.size &&
	[...materialFiles].every((file) => reviewedMaterialFiles.has(file))

const entries = manifest.entries.map((entry) => {
	const judgment = feedbackByCase.get(entry.caseId)
	if (!judgment) throw new Error(`Reserve review is missing ${entry.caseId}`)
	const candidateOption = entry.assignment.A === "candidate" ? "A" : "B"
	const candidateQuality = candidateOption === "A" ? judgment.qualityA : judgment.qualityB
	return {
		caseId: entry.caseId,
		file: entry.source.file,
		materialChange: materialFiles.has(entry.source.file),
		sourceEligibility: judgment.sourceEligibility,
		candidateOption,
		candidateQuality,
		conclusion: conclusion(entry, judgment),
		note: judgment.note,
	}
})
const eligibleChanges = entries.filter((entry) => entry.materialChange && entry.sourceEligibility === "eligible-artwork")
const controls = entries.filter((entry) => !entry.materialChange)
const summary = {
	reviewed: entries.length,
	materialChanges: materialFiles.size,
	eligibleMaterialChanges: eligibleChanges.length,
	ineligibleMaterialChanges: entries.filter((entry) => entry.materialChange &&
		entry.sourceEligibility !== "eligible-artwork").length,
	controls: controls.length,
	candidatePreferred: eligibleChanges.filter((entry) => entry.conclusion === "candidate-preferred").length,
	baselinePreferred: eligibleChanges.filter((entry) => entry.conclusion === "baseline-preferred").length,
	similarlyValid: eligibleChanges.filter((entry) => entry.conclusion === "similarly-valid").length,
	neitherAcceptable: eligibleChanges.filter((entry) => entry.conclusion === "neither-acceptable").length,
	uncertain: eligibleChanges.filter((entry) => entry.conclusion === "uncertain").length,
	weakOrWorseCandidate: eligibleChanges.filter((entry) =>
		entry.candidateQuality === "weak-fallback" || entry.candidateQuality === "unacceptable" ||
		entry.candidateQuality === "uncertain").length,
	controlSimilarlyValid: controls.filter((entry) => entry.conclusion === "similarly-valid").length,
}
const gates = {
	hardGateViolations: {
		actual: evaluation.validation.violations,
		maximum: protocol.gates.hardGateViolationsMaximum,
		pass: evaluation.validation.violations <= protocol.gates.hardGateViolationsMaximum,
	},
	allMaterialChangesReviewed: {
		actual: allMaterialChangesReviewed,
		required: protocol.gates.allMaterialChangesReviewed,
		pass: allMaterialChangesReviewed,
	},
	baselinePreferredEligibleChanges: {
		actual: summary.baselinePreferred,
		maximum: protocol.gates.baselinePreferredEligibleChangesMaximum,
		pass: summary.baselinePreferred <= protocol.gates.baselinePreferredEligibleChangesMaximum,
	},
	neitherAcceptableEligibleChanges: {
		actual: summary.neitherAcceptable,
		maximum: protocol.gates.neitherAcceptableEligibleChangesMaximum,
		pass: summary.neitherAcceptable <= protocol.gates.neitherAcceptableEligibleChangesMaximum,
	},
	weakOrWorseCandidateEligibleChanges: {
		actual: summary.weakOrWorseCandidate,
		maximum: protocol.gates.weakOrWorseCandidateEligibleChangesMaximum,
		pass: summary.weakOrWorseCandidate <= protocol.gates.weakOrWorseCandidateEligibleChangesMaximum,
	},
	candidatePreferredEligibleChanges: {
		actual: summary.candidatePreferred,
		minimum: protocol.gates.candidatePreferredEligibleChangesMinimum,
		pass: summary.candidatePreferred >= protocol.gates.candidatePreferredEligibleChangesMinimum,
	},
}
const promotionEligible = Object.values(gates).every((gate) => gate.pass)
await writeExclusiveJson(resolve(outputArgument), {
	schemaVersion: 1,
	protocolId: protocol.protocolId,
	manifestId: manifest.manifestId,
	baselineAlgorithmVersion: protocol.baselineAlgorithmVersion,
	candidateAlgorithmVersion: protocol.candidateAlgorithmVersion,
	summary,
	gates,
	decision: {
		promotionEligible,
		nextStep: promotionEligible
			? "Promote the frozen candidate as a new canonical extraction version without changing its admission rules."
			: "Do not promote this candidate; return to development with the failed reserve cases recorded as counterexamples.",
	},
	entries,
})
process.stderr.write(`Wrote reserve review analysis to ${relative(projectRoot, resolve(outputArgument))}\n`)
