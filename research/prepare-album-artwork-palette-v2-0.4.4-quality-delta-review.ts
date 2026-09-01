import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

type Treatment = Readonly<{
	background: Readonly<{ hex: string }>
	surface: Readonly<{ hex: string }>
	foreground: Readonly<{ hex: string }>
	accent: Readonly<{ hex: string }>
	gradient: boolean
}>

type ReviewCase = Readonly<{
	caseId: string
	sourceSha256: string
	winnerTreatmentId: string
	alternatives: ReadonlyArray<Treatment & Readonly<{ id: string }>>
} & Record<string, unknown>>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const currentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.4.4-development")
const priorDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.4.1-development")
const outputPath = resolve(currentDirectory, "absolute-quality-delta-review-manifest.json")
const analysisPath = resolve(currentDirectory, "absolute-quality-delta-preparation.json")
const REVIEW_VERSION = "album-artwork-palette-v2-absolute-quality-delta-review-v10"

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	const object = value as Record<string, unknown>
	return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`
}

function treatmentKey(treatment: Treatment): string {
	return [treatment.background.hex, treatment.surface.hex, treatment.foreground.hex, treatment.accent.hex, treatment.gradient ? "1" : "0"].join(":")
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
	await rename(temporary, path)
}

const [currentRaw, priorRaw, feedbackRaw, gateRaw] = await Promise.all([
	readFile(resolve(currentDirectory, "review-manifest.json"), "utf8"),
	readFile(resolve(priorDirectory, "review-manifest.json"), "utf8"),
	readFile(resolve(moduleDirectory, "data/album-artwork-palette-v2-0.4.1-lightweight-feedback.json"), "utf8"),
	readFile(resolve(currentDirectory, "targeted-review-analysis.json"), "utf8"),
])
const current = JSON.parse(currentRaw) as {
	candidateVersion: string
	implementationHash: string
	developmentManifestId: string
	scientificSha256: string
	cases: ReviewCase[]
}
const prior = JSON.parse(priorRaw) as { cases: ReviewCase[] }
const feedback = JSON.parse(feedbackRaw) as {
	manifestId: string
	entries: Array<{ caseId: string; sourceSha256: string; quality: string; comment: string; treatmentId: string }>
}
const gate = JSON.parse(gateRaw) as { mechanismGate: { pass: boolean }; freshSampleOpened: false }
if (!gate.mechanismGate.pass || gate.freshSampleOpened !== false) throw new Error("The prerequisite observability gate did not pass")
const priorByCase = new Map(prior.cases.map((entry) => [entry.caseId, entry]))
const feedbackByCase = new Map(feedback.entries.map((entry) => [entry.caseId, entry]))
const changedCases: ReviewCase[] = []
const transferred: Array<Record<string, unknown>> = []
for (const reviewCase of current.cases) {
	const previous = priorByCase.get(reviewCase.caseId)
	const response = feedbackByCase.get(reviewCase.caseId)
	if (!previous || !response || response.sourceSha256 !== reviewCase.sourceSha256) {
		throw new Error(`Missing prior absolute-quality binding for ${reviewCase.caseId}`)
	}
	const currentTreatment = reviewCase.alternatives.find(({ id }) => id === reviewCase.winnerTreatmentId)
	const priorTreatment = previous.alternatives.find(({ id }) => id === previous.winnerTreatmentId)
	if (!currentTreatment || !priorTreatment) throw new Error(`Missing frozen winner for ${reviewCase.caseId}`)
	if (treatmentKey(currentTreatment) === treatmentKey(priorTreatment)) {
		transferred.push({
			caseId: reviewCase.caseId,
			sourceSha256: reviewCase.sourceSha256,
			absoluteQuality: response.quality,
			comment: response.comment,
			priorTreatmentId: response.treatmentId,
			currentTreatmentId: reviewCase.winnerTreatmentId,
			treatmentKey: treatmentKey(currentTreatment),
		})
	} else {
		changedCases.push(reviewCase)
	}
}
const expectedChanged = [
	"development-04",
	"development-06",
	"development-15",
	"development-16",
	"development-18",
	"development-19",
	"development-21",
	"development-26",
]
if (JSON.stringify(changedCases.map(({ caseId }) => caseId)) !== JSON.stringify(expectedChanged)) {
	throw new Error(`Unexpected absolute-quality delta cases: ${changedCases.map(({ caseId }) => caseId).join(", ")}`)
}
const manifestWithoutId = {
	schemaVersion: 1,
	reviewVersion: REVIEW_VERSION,
	reviewUnit: "absolute-quality-plus-optional-comment-for-one-changed-frozen-top-treatment-per-artwork",
	candidateVersion: current.candidateVersion,
	implementationHash: current.implementationHash,
	developmentManifestId: current.developmentManifestId,
	scientificSha256: current.scientificSha256,
	selectionDomain: REVIEW_VERSION,
	cases: changedCases,
}
const manifest = { ...manifestWithoutId, manifestId: sha256(canonicalJson(manifestWithoutId)) }
const analysis = {
	schemaVersion: 1,
	currentCandidateVersion: current.candidateVersion,
	currentImplementationHash: current.implementationHash,
	currentScientificSha256: current.scientificSha256,
	priorAbsoluteQualityManifestId: feedback.manifestId,
	inputHashes: {
		currentManifestSha256: sha256(currentRaw),
		priorManifestSha256: sha256(priorRaw),
		priorFeedbackSha256: sha256(feedbackRaw),
		prerequisiteGateSha256: sha256(gateRaw),
	},
	transferredExactTopCount: transferred.length,
	changedTopCount: changedCases.length,
	transferredExactTops: transferred,
	changedTopCaseIds: changedCases.map(({ caseId }) => caseId),
	freshSampleOpened: false,
}
await Promise.all([atomicJson(outputPath, manifest), atomicJson(analysisPath, analysis)])
process.stdout.write(`Prepared ${changedCases.length} changed tops; transferred ${transferred.length} exact prior labels\n`)
