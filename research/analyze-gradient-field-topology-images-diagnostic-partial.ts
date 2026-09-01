import { createHash } from "node:crypto"
import { readFile, realpath, stat } from "node:fs/promises"
import { basename, dirname, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import sharp from "sharp"
import { prepareOutputTarget, writeJsonAtomic } from "./src/candidate-output.ts"
import { ALGORITHM_VERSION } from "./src/extract.ts"
import { GRADIENT_FIELD_TOPOLOGY_EXPERIMENT_VERSION } from "./src/gradient-field-topology-extract.ts"
import { GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY } from "./src/gradient-field-topology-model.ts"
import { GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION } from "./src/gradient-field-topology.ts"
import type { RGB } from "./src/types.ts"

type Decision = "should-be-gradient" | "should-not-be-gradient" | "either-way" |
	"no-visible-difference" | "selected-colors-not-identifiable"
type DiagnosticEntry = {
	familyId: string
	anchor: { file: string; sha256: string; bytes: number; width: number; height: number }
	pairSha256: string
	directedPair: { background: { rgb: RGB }; surface: { rgb: RGB } }
	canonicalGradient: boolean
	v3: { evaluated: boolean; eligible: boolean; reason: string; score: number | null; threshold: number; margin: number | null }
}
type Diagnostic = {
	schemaVersion: 1
	diagnosticVersion: string
	diagnosticId: string
	bindings: {
		protocol: { file: string; sha256: string }
		tooling: Record<string, string>
		implementation: Record<string, string>
		canonicalVersion: string
		experimentVersion: string
		evidenceVersion: string
		modelIdentity: unknown
		modelIdentitySha256: string
		parameterSha256: string
		packageJsonSha256: string
	}
	summary: { baseFiles: number; canonicalGradients: number; canonicalFlats: number; v3Gradients: number; v3Flats: number }
	entries: DiagnosticEntry[]
	[key: string]: unknown
}
type FeedbackEntry = { familyId: string; pairSha256: string; decision: Decision; comment: string; submittedAt: string }

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const artifactRoot = resolve(researchRoot, "data/experiments/gradient-field-topology-3.0.0-images-diagnostic")
const diagnosticPath = join(artifactRoot, "diagnostic.json")
const renderPath = join(artifactRoot, "render.json")
const htmlPath = join(artifactRoot, "diagnostic.html")
const feedbackPath = join(artifactRoot, "feedback.json")
const interpretationPath = join(artifactRoot, "partial-interpretation.json")
const outputPath = join(artifactRoot, "partial-analysis.json")
const expectedFeedbackSha256 = "59486c4d1740a842675d74526130ca5222edf9108504025d38b892f985c64fa8"
const supported = new Set([".jpg", ".jpeg", ".png", ".avif", ".webp"])

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function record(value: unknown, label: string): Record<string, unknown> {
	if (!isRecord(value)) throw new Error(`${label} is invalid`)
	return value
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const actual = Object.keys(value).sort()
	const wanted = [...expected].sort()
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
		throw new Error(`${label} has unexpected keys`)
	}
}

function pairSha256(sourceSha256: string, background: RGB, surface: RGB): string {
	return sha256(`${sourceSha256}\0${background.join(",")}\0${surface.join(",")}`)
}

function counts<T extends string>(values: readonly T[]): Partial<Record<T, number>> {
	const result: Partial<Record<T, number>> = {}
	for (const value of values) result[value] = (result[value] ?? 0) + 1
	return result
}

function confusion(entries: Array<{ decision: Decision; predicted: boolean }>): {
	truePositive: number; falseNegative: number; trueNegative: number; falsePositive: number
} {
	return {
		truePositive: entries.filter((entry) => entry.decision === "should-be-gradient" && entry.predicted).length,
		falseNegative: entries.filter((entry) => entry.decision === "should-be-gradient" && !entry.predicted).length,
		trueNegative: entries.filter((entry) => entry.decision === "should-not-be-gradient" && !entry.predicted).length,
		falsePositive: entries.filter((entry) => entry.decision === "should-not-be-gradient" && entry.predicted).length,
	}
}

await prepareOutputTarget({ path: outputPath, refuseOverwrite: true })
const [diagnosticSource, renderSource, htmlSource, feedbackSource, interpretationSource, analyzerSource, packageSource] =
	await Promise.all([
		readFile(diagnosticPath),
		readFile(renderPath),
		readFile(htmlPath),
		readFile(feedbackPath),
		readFile(interpretationPath),
		readFile(fileURLToPath(import.meta.url)),
		readFile(resolve(projectRoot, "package.json")),
	])
const diagnosticValue = record(JSON.parse(diagnosticSource.toString("utf8")) as unknown, "Diagnostic")
exactKeys(diagnosticValue, ["schemaVersion", "diagnosticVersion", "generatedAt", "selectionRule", "bindings", "runtime",
	"summary", "entries", "diagnosticId"], "Diagnostic")
const diagnostic = diagnosticValue as unknown as Diagnostic
if (diagnostic.schemaVersion !== 1 || diagnostic.diagnosticVersion !== "gradient-field-topology-3.0.0-images-diagnostic-1" ||
	!Array.isArray(diagnostic.entries) || diagnostic.entries.length !== 34 || !isRecord(diagnostic.bindings)) {
	throw new Error("Frozen diagnostic header is invalid")
}
const { diagnosticId: _diagnosticId, ...diagnosticDraft } = diagnostic
if (sha256(JSON.stringify(diagnosticDraft)) !== diagnostic.diagnosticId) throw new Error("Frozen diagnostic ID is invalid")
exactKeys(diagnostic.bindings as unknown as Record<string, unknown>, ["protocol", "tooling", "implementation",
	"canonicalVersion", "experimentVersion", "evidenceVersion", "modelIdentity", "modelIdentitySha256",
	"parameterSha256", "packageJsonSha256"], "Diagnostic bindings")
if (diagnostic.bindings.canonicalVersion !== ALGORITHM_VERSION ||
	diagnostic.bindings.experimentVersion !== GRADIENT_FIELD_TOPOLOGY_EXPERIMENT_VERSION ||
	diagnostic.bindings.evidenceVersion !== GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION ||
	!isDeepStrictEqual(diagnostic.bindings.modelIdentity, GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY) ||
	diagnostic.bindings.modelIdentitySha256 !== sha256(JSON.stringify(GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY)) ||
	diagnostic.bindings.parameterSha256 !== GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.parameterSha256 ||
	diagnostic.bindings.packageJsonSha256 !== sha256(packageSource)) {
	throw new Error("Frozen diagnostic runtime provenance is stale")
}
const frozenFiles: Array<[string, string]> = [
	[diagnostic.bindings.protocol.file, diagnostic.bindings.protocol.sha256],
	...Object.entries(diagnostic.bindings.tooling),
	...Object.entries(diagnostic.bindings.implementation),
]
for (const [file, expected] of frozenFiles) {
	if (sha256(await readFile(join(researchRoot, file))) !== expected) throw new Error(`Frozen diagnostic tooling changed: ${file}`)
}

const imagesRoot = await realpath(resolve(projectRoot, "images"))
const families = new Set<string>()
const pairs = new Set<string>()
const files = new Set<string>()
for (const entry of diagnostic.entries) {
	if (families.has(entry.familyId) || pairs.has(entry.pairSha256) || files.has(entry.anchor.file) ||
		!/^images\/[^/\\]+$/.test(entry.anchor.file) || !supported.has(extname(entry.anchor.file).toLowerCase()) ||
		basename(entry.anchor.file, extname(entry.anchor.file)).includes("-") ||
		pairSha256(entry.anchor.sha256, entry.directedPair.background.rgb, entry.directedPair.surface.rgb) !== entry.pairSha256 ||
		entry.canonicalGradient !== entry.v3.evaluated || !entry.canonicalGradient && entry.v3.eligible) {
		throw new Error(`Frozen diagnostic entry is invalid: ${entry.familyId}`)
	}
	families.add(entry.familyId)
	pairs.add(entry.pairSha256)
	files.add(entry.anchor.file)
	const path = await realpath(resolve(projectRoot, entry.anchor.file))
	if (dirname(path) !== imagesRoot) throw new Error(`Frozen source escapes root images: ${entry.anchor.file}`)
	const [bytes, sourceStat, metadata] = await Promise.all([readFile(path), stat(path), sharp(path).metadata()])
	if (!sourceStat.isFile() || bytes.byteLength !== entry.anchor.bytes || sha256(bytes) !== entry.anchor.sha256 ||
		metadata.width !== entry.anchor.width || metadata.height !== entry.anchor.height) {
		throw new Error(`Frozen source changed: ${entry.anchor.file}`)
	}
}
if (diagnostic.summary.baseFiles !== diagnostic.entries.length ||
	diagnostic.summary.canonicalGradients !== diagnostic.entries.filter((entry) => entry.canonicalGradient).length ||
	diagnostic.summary.canonicalFlats !== diagnostic.entries.filter((entry) => !entry.canonicalGradient).length ||
	diagnostic.summary.v3Gradients !== diagnostic.entries.filter((entry) => entry.v3.eligible).length ||
	diagnostic.summary.v3Flats !== diagnostic.entries.filter((entry) => !entry.v3.eligible).length) {
	throw new Error("Frozen diagnostic summary is invalid")
}

const render = record(JSON.parse(renderSource.toString("utf8")) as unknown, "Render binding")
exactKeys(render, ["schemaVersion", "renderVersion", "generatedAt", "planFile", "planSha256", "htmlFile", "htmlSha256"], "Render binding")
if (render.schemaVersion !== 1 || render.renderVersion !== "gradient-field-topology-3.0.0-images-diagnostic-render-1" ||
	render.planFile !== "diagnostic.json" || render.htmlFile !== "diagnostic.html" ||
	render.planSha256 !== sha256(diagnosticSource) || render.htmlSha256 !== sha256(htmlSource)) {
	throw new Error("Frozen render binding is invalid")
}

const feedback = record(JSON.parse(feedbackSource.toString("utf8")) as unknown, "Feedback")
exactKeys(feedback, ["schemaVersion", "diagnosticVersion", "planSha256", "htmlSha256", "entries"], "Feedback")
if (sha256(feedbackSource) !== expectedFeedbackSha256 || feedback.schemaVersion !== 1 ||
	feedback.diagnosticVersion !== diagnostic.diagnosticVersion || feedback.planSha256 !== sha256(diagnosticSource) ||
	feedback.htmlSha256 !== sha256(htmlSource) || !Array.isArray(feedback.entries) || feedback.entries.length !== 1) {
	throw new Error("Partial feedback provenance or declared count is invalid")
}
const validDecisions = new Set<Decision>(["should-be-gradient", "should-not-be-gradient", "either-way",
	"no-visible-difference", "selected-colors-not-identifiable"])
const diagnosticByFamily = new Map(diagnostic.entries.map((entry) => [entry.familyId, entry]))
const reviewedFamilies = new Set<string>()
const reviewed = (feedback.entries as unknown[]).map((value) => {
	const response = record(value, "Feedback entry")
	exactKeys(response, ["familyId", "pairSha256", "decision", "comment", "submittedAt"], "Feedback entry")
	const planned = typeof response.familyId === "string" ? diagnosticByFamily.get(response.familyId) : undefined
	if (!planned || reviewedFamilies.has(planned.familyId) || response.pairSha256 !== planned.pairSha256 ||
		typeof response.decision !== "string" || !validDecisions.has(response.decision as Decision) ||
		typeof response.comment !== "string" || response.comment.length > 2000 ||
		typeof response.submittedAt !== "string" || !Number.isFinite(Date.parse(response.submittedAt))) {
		throw new Error("Feedback contains a duplicate, unknown, or unbound response")
	}
	reviewedFamilies.add(planned.familyId)
	const decision = response.decision as Decision
	const truth = decision === "should-be-gradient" ? true : decision === "should-not-be-gradient" ? false : null
	return {
		familyId: planned.familyId,
		anchor: planned.anchor,
		pairSha256: planned.pairSha256,
		decision,
		comment: response.comment,
		submittedAt: response.submittedAt,
		canonicalGradient: planned.canonicalGradient,
		v3Gradient: planned.v3.eligible,
		v3Score: planned.v3.score,
		v3Margin: planned.v3.margin,
		canonicalCorrect: truth === null ? null : planned.canonicalGradient === truth,
		v3Correct: truth === null ? null : planned.v3.eligible === truth,
	}
})
const unreviewed = diagnostic.entries.filter((entry) => !reviewedFamilies.has(entry.familyId))

const interpretation = record(JSON.parse(interpretationSource.toString("utf8")) as unknown, "Partial interpretation")
exactKeys(interpretation, ["schemaVersion", "recordedAt", "decisionScope", "submittedIndividualJudgments",
	"unreviewedCases", "unreviewedMeaning", "thresholdRefit", "inferenceFromAbsence", "qualitativeReviewerStatement",
	"diagnosticSha256", "renderSha256", "htmlSha256", "feedbackSha256"], "Partial interpretation")
if (interpretation.schemaVersion !== 1 || interpretation.recordedAt !== "2026-07-20T16:21:17Z" ||
	interpretation.decisionScope !== "exact-directed-background-surface-pair" ||
	interpretation.submittedIndividualJudgments !== reviewed.length || interpretation.unreviewedCases !== unreviewed.length ||
	interpretation.unreviewedMeaning !== "remain-unlabeled" || interpretation.thresholdRefit !== false ||
	interpretation.inferenceFromAbsence !== false ||
	interpretation.qualitativeReviewerStatement !==
		"Most individual reviews seemed unlikely to be useful, but the exposed results overall looked very good." ||
	interpretation.diagnosticSha256 !== sha256(diagnosticSource) || interpretation.renderSha256 !== sha256(renderSource) ||
	interpretation.htmlSha256 !== sha256(htmlSource) || interpretation.feedbackSha256 !== sha256(feedbackSource)) {
	throw new Error("Partial interpretation is invalid or not bound to the frozen artifacts")
}
if (reviewed.length !== 1 || unreviewed.length !== 33) throw new Error("Partial review coverage changed")

const decisive = reviewed.filter((entry) => entry.decision === "should-be-gradient" || entry.decision === "should-not-be-gradient")
const canonicalPredictions = decisive.map((entry) => ({ decision: entry.decision, predicted: entry.canonicalGradient }))
const v3Predictions = decisive.map((entry) => ({ decision: entry.decision, predicted: entry.v3Gradient }))
await writeJsonAtomic({ path: outputPath, refuseOverwrite: true }, {
	schemaVersion: 1,
	analysisVersion: "gradient-field-topology-3.0.0-images-diagnostic-partial-analysis-1",
	generatedAt: new Date().toISOString(),
	partial: true,
	decisionScope: "exact-directed-background-surface-pair",
	thresholdRefit: false,
	inferenceFromAbsence: false,
	unreviewedMeaning: "remain-unlabeled",
	provenance: {
		diagnosticSha256: sha256(diagnosticSource),
		renderSha256: sha256(renderSource),
		htmlSha256: sha256(htmlSource),
		feedbackSha256: sha256(feedbackSource),
		interpretationSha256: sha256(interpretationSource),
		analyzerSha256: sha256(analyzerSource),
		modelIdentitySha256: diagnostic.bindings.modelIdentitySha256,
		parameterSha256: diagnostic.bindings.parameterSha256,
	},
	summary: {
		totalCases: diagnostic.entries.length,
		reviewed: reviewed.length,
		unreviewed: unreviewed.length,
		reviewedDecisive: decisive.length,
		reviewedNondecisive: reviewed.length - decisive.length,
		explicitJudgments: counts(reviewed.map((entry) => entry.decision)),
		canonicalReviewedOnly: {
			confusion: confusion(canonicalPredictions),
			correct: decisive.filter((entry) => entry.canonicalCorrect).length,
		},
		v3ReviewedOnly: {
			confusion: confusion(v3Predictions),
			correct: decisive.filter((entry) => entry.v3Correct).length,
		},
	},
	qualitativeFindings: {
		reviewerStatement: interpretation.qualitativeReviewerStatement,
		interpretationOnly: true,
		notAnIndividualCaseLabel: true,
	},
	reviewedEntries: reviewed,
	unreviewedCases: {
		count: unreviewed.length,
		labelsAssigned: 0,
		inferenceFromMissingResponse: false,
	},
})
process.stderr.write("Wrote partial images-diagnostic analysis for 1 reviewed and 33 unlabeled cases\n")
