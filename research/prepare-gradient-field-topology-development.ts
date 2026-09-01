import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import sharp from "sharp"
import { buildCandidates, type Candidate } from "./src/candidates.ts"
import { prepareOutputTarget, writeJsonAtomic } from "./src/candidate-output.ts"
import { rgbToHex } from "./src/color.ts"
import {
	analyzeGradientFieldTopology,
	GRADIENT_FIELD_TOPOLOGY_CONSTANTS,
	GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION,
	type GradientFieldTopologyEvidence,
} from "./src/gradient-field-topology.ts"
import { loadImage } from "./src/image.ts"
import { REGION_GRAPH_0_17_ALGORITHM_VERSION as ALGORITHM_VERSION } from "./src/region-graph-0.17-extract.ts"
import { analyzeRegions } from "./src/regions.ts"
import type { RGB } from "./src/types.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const experimentsRoot = "data/experiments"
const developmentVersion = "gradient-field-topology-development-3.0.0" as const
const candidateCount = 12

type Judgment = "should-be-gradient" | "should-not-be-gradient" | "either-way" |
	"no-visible-difference" | "selected-colors-not-identifiable" | "uncertain"
type Cohort = "music" | "targeted" | "00" | "01" | "02" | "03" | "04" | "05" | "06"

type SourceRef = {
	file: string
	sha256?: string
}

type RoleColor = {
	rgb: RGB
	hex?: string
}

type PairMetadata = {
	familyId: string
	anchor: SourceRef
	palette: {
		background: RoleColor
		surface: RoleColor
	}
}

type RegistrySeed = {
	cohort: Cohort
	familyId: string
	sourceFile: string
	expectedSourceSha256?: string
	judgment: Judgment
	background: RGB
	surface: RGB
}

type WorkerEntry = {
	reviewBatch: Cohort
	familyId: string
	sourceFile: string
	sourceSha256: string
	sourceHashProvenance: "artifact-bound" | "computed-only"
	judgment: Judgment
	endpoints: {
		background: EndpointOutput
		surface: EndpointOutput
	}
	normalized: { width: number; height: number }
	evidence: GradientFieldTopologyEvidence
}

type EndpointOutput = {
	rgb: RGB
	hex: string
	candidateId: number
	candidateFamilyId: number
}

type Artifact<T = Record<string, unknown>> = {
	file: string
	sha256: string
	bytes: Buffer
	value: T
}

type ArtifactDescription = {
	file: string
	sha256: string
	roles: string[]
}

type AnalysisArtifact = {
	provenance: Record<string, string>
	entries: Array<Record<string, unknown>>
	[key: string]: unknown
}

type PlanArtifact = {
	reviewVersion?: string
	experimentVersion?: string
	provenance?: Record<string, unknown>
	reviewQueue?: Array<{ familyId: string }>
	entries: Array<Record<string, unknown>>
}

type FeedbackArtifact = {
	reviewVersion?: string
	experimentVersion?: string
	planSha256?: string
	developmentSha256?: string
	htmlSha256?: string
	entries: Array<Record<string, unknown>>
}

type DevelopmentArtifact = {
	entries: Array<Record<string, unknown>>
}

type EvaluationArtifact = {
	manifestId?: string
	manifestSha256?: string
	entries: Array<Record<string, unknown>>
}

const expectedJudgments: Record<Judgment, number> = {
	"should-be-gradient": 135,
	"should-not-be-gradient": 139,
	"either-way": 111,
	"no-visible-difference": 15,
	"selected-colors-not-identifiable": 11,
	"uncertain": 1,
}

const cohortOrder: Record<Cohort, number> = {
	music: 0,
	targeted: 1,
	"00": 2,
	"01": 3,
	"02": 4,
	"03": 5,
	"04": 6,
	"05": 7,
	"06": 8,
}

function experiment(file: string): string {
	return `${experimentsRoot}/${file}`
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function records(value: unknown, label: string): Array<Record<string, unknown>> {
	if (!Array.isArray(value) || value.some((entry) => !isRecord(entry))) throw new Error(`${label} is invalid`)
	return value
}

function stringValue(value: unknown, label: string): string {
	if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is invalid`)
	return value
}

function optionalSha256(value: unknown, label: string): string | undefined {
	if (value === undefined) return undefined
	if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} is invalid`)
	return value
}

function rgbValue(value: unknown, label: string): RGB {
	if (!Array.isArray(value) || value.length !== 3 || value.some((channel) =>
		!Number.isInteger(channel) || channel < 0 || channel > 255)) throw new Error(`${label} is invalid`)
	return [value[0] as number, value[1] as number, value[2] as number]
}

function roleRgb(value: unknown, label: string): RGB {
	if (!isRecord(value)) throw new Error(`${label} is invalid`)
	return rgbValue(value.rgb, `${label}.rgb`)
}

function sourceRef(value: unknown, label: string): SourceRef {
	if (!isRecord(value)) throw new Error(`${label} is invalid`)
	return {
		file: stringValue(value.file, `${label}.file`),
		sha256: optionalSha256(value.sha256, `${label}.sha256`),
	}
}

function pairFromPalette(entry: Record<string, unknown>, label: string): PairMetadata {
	const familyId = stringValue(entry.familyId, `${label}.familyId`)
	const anchor = sourceRef(entry.anchor, `${label}.anchor`)
	if (!isRecord(entry.palette)) throw new Error(`${label}.palette is invalid`)
	return {
		familyId,
		anchor,
		palette: {
			background: { rgb: roleRgb(entry.palette.background, `${label}.palette.background`) },
			surface: { rgb: roleRgb(entry.palette.surface, `${label}.palette.surface`) },
		},
	}
}

function pairFromEndpoints(entry: Record<string, unknown>, label: string): PairMetadata {
	const familyId = stringValue(entry.familyId, `${label}.familyId`)
	const anchor = sourceRef(entry.anchor, `${label}.anchor`)
	if (!isRecord(entry.endpoints)) throw new Error(`${label}.endpoints is invalid`)
	const background = isRecord(entry.endpoints.background)
		? roleRgb(entry.endpoints.background, `${label}.endpoints.background`)
		: rgbValue(entry.endpoints.background, `${label}.endpoints.background`)
	const surface = isRecord(entry.endpoints.surface)
		? roleRgb(entry.endpoints.surface, `${label}.endpoints.surface`)
		: rgbValue(entry.endpoints.surface, `${label}.endpoints.surface`)
	return { familyId, anchor, palette: { background: { rgb: background }, surface: { rgb: surface } } }
}

function samePair(first: PairMetadata, second: PairMetadata): boolean {
	return first.familyId === second.familyId && first.anchor.file === second.anchor.file &&
		isDeepStrictEqual(first.palette.background.rgb, second.palette.background.rgb) &&
		isDeepStrictEqual(first.palette.surface.rgb, second.palette.surface.rgb)
}

function mapByFamily(entries: Array<Record<string, unknown>>, label: string): Map<string, Record<string, unknown>> {
	const result = new Map<string, Record<string, unknown>>()
	for (const entry of entries) {
		const familyId = stringValue(entry.familyId, `${label}.familyId`)
		if (result.has(familyId)) throw new Error(`${label} contains duplicate family ${familyId}`)
		result.set(familyId, entry)
	}
	return result
}

function judgmentValue(value: unknown, label: string): Judgment {
	if (value === "should-be-gradient" || value === "should-not-be-gradient" || value === "either-way" ||
		value === "no-visible-difference" || value === "selected-colors-not-identifiable" || value === "uncertain") {
		return value
	}
	throw new Error(`${label} is invalid: ${String(value)}`)
}

function classificationJudgment(value: unknown, label: string): Judgment {
	if (value === "true-background-gradient") return "should-be-gradient"
	if (value === "flat-background-isolated-surface") return "should-not-be-gradient"
	if (value === "uncertain") return "uncertain"
	throw new Error(`${label} is invalid: ${String(value)}`)
}

function validateSourceFile(file: string): void {
	if (!/^(?:music-artworks\/[0-9a-f]\/[0-9a-f]\/[0-9a-f]\/[^/\\]+|images\/[^/\\]+|0[0-6]\/[^/\\]+)$/i.test(file)) {
		throw new Error(`Source path is outside music and 00-06: ${file}`)
	}
}

function cohortForSource(file: string, fallback: Cohort): Cohort {
	const match = /^(0[0-6])\//.exec(file)
	return match ? match[1] as Cohort : fallback
}

class ArtifactStore {
	private readonly cache = new Map<string, Artifact<unknown>>()
	private readonly roles = new Map<string, Set<string>>()

	async json<T>(file: string, role: string): Promise<Artifact<T>> {
		const artifact = await this.file(file, role)
		let value: unknown
		try {
			value = JSON.parse(artifact.bytes.toString("utf8"))
		} catch {
			throw new Error(`Invalid JSON artifact: ${file}`)
		}
		const result = { ...artifact, value: value as T }
		this.cache.set(file, result as Artifact<unknown>)
		return result
	}

	async file(file: string, role: string): Promise<Artifact<unknown>> {
		if (isAbsolute(file) || file.split(/[\\/]/).includes("..")) throw new Error(`Invalid artifact path: ${file}`)
		let artifact = this.cache.get(file)
		if (!artifact) {
			const bytes = await readFile(resolve(researchRoot, file))
			artifact = { file, bytes, sha256: sha256(bytes), value: bytes }
			this.cache.set(file, artifact)
		}
		let roles = this.roles.get(file)
		if (!roles) this.roles.set(file, roles = new Set())
		roles.add(role)
		return artifact
	}

	describe(): ArtifactDescription[] {
		return [...this.cache.values()].map((artifact) => ({
			file: artifact.file,
			sha256: artifact.sha256,
			roles: [...this.roles.get(artifact.file)!].sort((first, second) => first.localeCompare(second, "en")),
		})).sort((first, second) => first.file.localeCompare(second.file, "en"))
	}
}

function verifyProvenance(
	analysis: Artifact<AnalysisArtifact>,
	bindings: Record<string, Artifact<unknown>>,
): void {
	if (!isRecord(analysis.value.provenance)) throw new Error(`${analysis.file} lacks provenance`)
	for (const [key, artifact] of Object.entries(bindings)) {
		if (analysis.value.provenance[key] !== artifact.sha256) {
			throw new Error(`${analysis.file} has stale ${key} for ${artifact.file}`)
		}
	}
}

function verifyFeedback(
	plan: Artifact<PlanArtifact>,
	html: Artifact<unknown>,
	feedback: Artifact<FeedbackArtifact>,
): void {
	if (feedback.value.planSha256 !== undefined && feedback.value.planSha256 !== plan.sha256 ||
		feedback.value.developmentSha256 !== undefined && feedback.value.developmentSha256 !== plan.sha256 ||
		feedback.value.htmlSha256 !== html.sha256 ||
		feedback.value.reviewVersion !== undefined && feedback.value.reviewVersion !== plan.value.reviewVersion ||
		feedback.value.experimentVersion !== undefined && feedback.value.experimentVersion !== plan.value.experimentVersion) {
		throw new Error(`Feedback provenance is invalid for ${feedback.file}`)
	}
}

function verifyAnalysisResponses(
	analysisEntries: Array<Record<string, unknown>>,
	feedbackEntries: Array<Record<string, unknown>>,
	analysisField: "classification" | "decision",
	feedbackField: "classification" | "decision",
	label: string,
): void {
	const feedback = mapByFamily(feedbackEntries, `${label} feedback`)
	if (analysisEntries.length !== feedbackEntries.length) throw new Error(`${label} response count changed`)
	for (const entry of analysisEntries) {
		const familyId = stringValue(entry.familyId, `${label}.familyId`)
		if (feedback.get(familyId)?.[feedbackField] !== entry[analysisField]) {
			throw new Error(`${label} response changed for ${familyId}`)
		}
	}
}

function addSeed(seeds: RegistrySeed[], cohort: Cohort, pair: PairMetadata, judgment: Judgment): void {
	validateSourceFile(pair.anchor.file)
	seeds.push({
		cohort,
		familyId: pair.familyId,
		sourceFile: pair.anchor.file,
		expectedSourceSha256: pair.anchor.sha256,
		judgment,
		background: pair.palette.background.rgb,
		surface: pair.palette.surface.rgb,
	})
}

async function addPilotLabels(store: ArtifactStore, seeds: RegistrySeed[]): Promise<void> {
	const [analysis, plan, html, feedback, current] = await Promise.all([
		store.json<AnalysisArtifact>(experiment("gradient-eligibility-0.8.0-development-analysis.json"), "music pilot labels"),
		store.json<PlanArtifact>(experiment("gradient-eligibility-0.1.0-development.json"), "music pilot plan"),
		store.file(experiment("gradient-eligibility-0.1.0-review.html"), "music pilot rendered review"),
		store.json<FeedbackArtifact>(experiment("gradient-eligibility-0.1.0-feedback.json"), "music pilot feedback"),
		store.json<DevelopmentArtifact>(experiment("gradient-eligibility-0.7.0-development.json"), "music exact-pair development source"),
	])
	verifyProvenance(analysis, {
		developmentSha256: plan,
		htmlSha256: html,
		feedbackSha256: feedback,
		candidateDevelopmentSha256: current,
	})
	verifyFeedback(plan, html, feedback)
	verifyAnalysisResponses(analysis.value.entries, feedback.value.entries, "classification", "classification", "music pilot")
	const planned = new Set((plan.value.reviewQueue ?? []).map((entry) => entry.familyId))
	const currentByFamily = mapByFamily(current.value.entries, "music development")
	for (const entry of analysis.value.entries) {
		const familyId = stringValue(entry.familyId, "music pilot familyId")
		const metadata = currentByFamily.get(familyId)
		if (!planned.has(familyId) || !metadata) throw new Error(`Music pilot metadata is unavailable for ${familyId}`)
		addSeed(seeds, "music", pairFromPalette(metadata, `music development ${familyId}`),
			classificationJudgment(entry.classification, `music pilot ${familyId}`))
	}
}

async function addTargetedLabels(store: ArtifactStore, seeds: RegistrySeed[]): Promise<void> {
	const [analysis, plan, html, feedback, current] = await Promise.all([
		store.json<AnalysisArtifact>(experiment("gradient-eligibility-0.8.0-targeted-analysis.json"), "targeted labels"),
		store.json<PlanArtifact>(experiment("gradient-eligibility-0.5.0-targeted-review.json"), "targeted plan"),
		store.file(experiment("gradient-eligibility-0.5.0-targeted-review.html"), "targeted rendered review"),
		store.json<FeedbackArtifact>(experiment("gradient-eligibility-0.5.0-targeted-feedback.json"), "targeted feedback"),
		store.json<DevelopmentArtifact>(experiment("gradient-eligibility-0.7.0-post-review-targeted-evidence.json"), "targeted exact-pair source"),
	])
	verifyProvenance(analysis, {
		developmentSha256: plan,
		htmlSha256: html,
		feedbackSha256: feedback,
		candidateDevelopmentSha256: current,
	})
	verifyFeedback(plan, html, feedback)
	verifyAnalysisResponses(analysis.value.entries, feedback.value.entries, "classification", "classification", "targeted")
	const planByFamily = mapByFamily(plan.value.entries, "targeted plan")
	const currentByFamily = mapByFamily(current.value.entries, "targeted evidence")
	for (const entry of analysis.value.entries) {
		const familyId = stringValue(entry.familyId, "targeted familyId")
		const planned = planByFamily.get(familyId)
		const currentEntry = currentByFamily.get(familyId)
		if (!planned || !currentEntry || !samePair(pairFromPalette(planned, `targeted plan ${familyId}`),
			pairFromPalette(currentEntry, `targeted evidence ${familyId}`))) {
			throw new Error(`Targeted endpoint pair changed for ${familyId}`)
		}
		addSeed(seeds, "targeted", pairFromPalette(currentEntry, `targeted evidence ${familyId}`),
			classificationJudgment(entry.classification, `targeted ${familyId}`))
	}
}

async function addChangeLabels(store: ArtifactStore, seeds: RegistrySeed[]): Promise<void> {
	const [analysis, plan, html, feedback, development, validation] = await Promise.all([
		store.json<AnalysisArtifact>(experiment("gradient-eligibility-0.8.0-change-analysis.json"), "changed-case labels"),
		store.json<PlanArtifact>(experiment("gradient-eligibility-0.7.0-change-review.json"), "changed-case plan"),
		store.file(experiment("gradient-eligibility-0.7.0-change-review.html"), "changed-case rendered review"),
		store.json<FeedbackArtifact>(experiment("gradient-eligibility-0.7.0-change-feedback.json"), "changed-case feedback"),
		store.json<DevelopmentArtifact>(experiment("gradient-eligibility-0.7.0-development.json"), "changed-case music source"),
		store.json<DevelopmentArtifact>(experiment("gradient-eligibility-0.8.0-validation-corpora.json"), "changed-case 00 source"),
	])
	verifyProvenance(analysis, {
		reviewSha256: plan,
		htmlSha256: html,
		feedbackSha256: feedback,
		candidateDevelopmentSha256: development,
		candidateValidationSha256: validation,
	})
	verifyFeedback(plan, html, feedback)
	verifyAnalysisResponses(analysis.value.entries, feedback.value.entries, "decision", "decision", "changed-case")
	const planByFamily = mapByFamily(plan.value.entries, "changed-case plan")
	const developmentByFamily = mapByFamily(development.value.entries, "music development")
	for (const entry of analysis.value.entries) {
		const familyId = stringValue(entry.familyId, "changed-case familyId")
		const planned = planByFamily.get(familyId)
		if (!planned) throw new Error(`Changed-case plan is unavailable for ${familyId}`)
		const pair = pairFromPalette(planned, `changed-case plan ${familyId}`)
		const cohort = entry.cohort === "holdout" ? "00" : entry.cohort === "music" ? "music" : undefined
		if (!cohort) throw new Error(`Changed-case cohort is invalid for ${familyId}`)
		if (cohort === "music") {
			const current = developmentByFamily.get(familyId)
			if (!current || !samePair(pair, pairFromPalette(current, `music development ${familyId}`))) {
				throw new Error(`Changed-case endpoint pair changed for ${familyId}`)
			}
		}
		addSeed(seeds, cohort, pair, judgmentValue(entry.decision, `changed-case ${familyId}`))
	}
}

async function addMusicAuditLabels(store: ArtifactStore, seeds: RegistrySeed[]): Promise<void> {
	const [analysis, removedPlan, removedHtml, removedFeedback, retainedPlan, retainedHtml, retainedFeedback,
		interpretation, development] = await Promise.all([
		store.json<AnalysisArtifact>(experiment("gradient-eligibility-0.8.0-music-promotion-audit-analysis.json"), "music audit analysis"),
		store.json<PlanArtifact>(experiment("gradient-eligibility-0.8.0-unseen-music-promotion-review.json"), "music removal plan"),
		store.file(experiment("gradient-eligibility-0.8.0-unseen-music-promotion-review.html"), "music removal rendered review"),
		store.json<FeedbackArtifact>(experiment("gradient-eligibility-0.8.0-unseen-music-promotion-feedback.json"), "music removal feedback"),
		store.json<PlanArtifact>(experiment("gradient-eligibility-0.8.0-unseen-music-retained-review.json"), "music retained plan"),
		store.file(experiment("gradient-eligibility-0.8.0-unseen-music-retained-review.html"), "music retained rendered review"),
		store.json<FeedbackArtifact>(experiment("gradient-eligibility-0.8.0-unseen-music-retained-feedback.json"), "music retained feedback"),
		store.json<Record<string, unknown>>(experiment("gradient-eligibility-0.8.0-music-promotion-interpretation.json"), "music manual interpretation"),
		store.json<DevelopmentArtifact>(experiment("gradient-eligibility-0.7.0-development.json"), "music audit exact-pair source"),
	])
	verifyProvenance(analysis, {
		removedPlanSha256: removedPlan,
		removedHtmlSha256: removedHtml,
		removedFeedbackSha256: removedFeedback,
		retainedPlanSha256: retainedPlan,
		retainedHtmlSha256: retainedHtml,
		retainedFeedbackSha256: retainedFeedback,
		interpretationSha256: interpretation,
	})
	verifyFeedback(removedPlan, removedHtml, removedFeedback)
	verifyFeedback(retainedPlan, retainedHtml, retainedFeedback)
	if (!isRecord(removedPlan.value.provenance) || !isRecord(retainedPlan.value.provenance) ||
		removedPlan.value.provenance.developmentSha256 !== development.sha256 ||
		retainedPlan.value.provenance.developmentSha256 !== development.sha256) {
		throw new Error("Music audit plans do not bind the exact development source")
	}
	const developmentByFamily = mapByFamily(development.value.entries, "music audit development")
	const removedByFamily = mapByFamily(removedPlan.value.entries, "music removal plan")
	const retainedByFamily = mapByFamily(retainedPlan.value.entries, "music retained plan")
	for (const response of retainedFeedback.value.entries) {
		const familyId = stringValue(response.familyId, "music retained familyId")
		const planned = retainedByFamily.get(familyId)
		const current = developmentByFamily.get(familyId)
		if (!planned || !current || !samePair(pairFromPalette(planned, `music retained plan ${familyId}`),
			pairFromPalette(current, `music development ${familyId}`))) {
			throw new Error(`Music retained endpoint pair changed for ${familyId}`)
		}
		addSeed(seeds, "music", pairFromPalette(current, `music development ${familyId}`),
			judgmentValue(response.decision, `music retained ${familyId}`))
	}
	const manual = records(interpretation.value.manualJudgments, "music manual judgments")
	for (const response of manual) {
		const familyId = stringValue(response.familyId, "music manual familyId")
		const planned = removedByFamily.get(familyId)
		const current = developmentByFamily.get(familyId)
		if (!planned || !current || !samePair(pairFromPalette(planned, `music removal plan ${familyId}`),
			pairFromPalette(current, `music development ${familyId}`))) {
			throw new Error(`Music removal endpoint pair changed for ${familyId}`)
		}
		addSeed(seeds, "music", pairFromPalette(current, `music development ${familyId}`),
			judgmentValue(response.decision, `music manual ${familyId}`))
	}
}

async function addIterationLabels(store: ArtifactStore, seeds: RegistrySeed[]): Promise<void> {
	const [analysis, plan, html, feedback, development, validation, interpretation] = await Promise.all([
		store.json<AnalysisArtifact>(experiment("gradient-eligibility-0.8.1-iteration-analysis.json"), "iteration labels"),
		store.json<PlanArtifact>(experiment("gradient-eligibility-0.8.1-iteration-review.json"), "iteration plan"),
		store.file(experiment("gradient-eligibility-0.8.1-iteration-review.html"), "iteration rendered review"),
		store.json<FeedbackArtifact>(experiment("gradient-eligibility-0.8.1-iteration-feedback.json"), "iteration feedback"),
		store.json<DevelopmentArtifact>(experiment("gradient-eligibility-0.7.0-development.json"), "iteration music source"),
		store.json<DevelopmentArtifact>(experiment("gradient-eligibility-0.8.1-validation-corpora.json"), "iteration 00 source"),
		store.json<Record<string, unknown>>(experiment("gradient-eligibility-0.8.1-iteration-interpretation.json"), "iteration interpretation"),
	])
	verifyProvenance(analysis, {
		planSha256: plan,
		htmlSha256: html,
		feedbackSha256: feedback,
		developmentSha256: development,
		validationSha256: validation,
		interpretationSha256: interpretation,
	})
	verifyFeedback(plan, html, feedback)
	verifyAnalysisResponses(analysis.value.entries, feedback.value.entries, "decision", "decision", "iteration")
	const planByFamily = mapByFamily(plan.value.entries, "iteration plan")
	const developmentByFamily = mapByFamily(development.value.entries, "iteration development")
	for (const entry of analysis.value.entries) {
		const familyId = stringValue(entry.familyId, "iteration familyId")
		const planned = planByFamily.get(familyId)
		if (!planned) throw new Error(`Iteration plan is unavailable for ${familyId}`)
		const pair = pairFromEndpoints(entry, `iteration analysis ${familyId}`)
		const current = developmentByFamily.get(familyId)
		if (current && !samePair(pair, pairFromPalette(current, `iteration development ${familyId}`))) {
			throw new Error(`Iteration endpoint pair changed for ${familyId}`)
		}
		addSeed(seeds, cohortForSource(pair.anchor.file, "music"), pair,
			judgmentValue(entry.decision, `iteration ${familyId}`))
	}
}

type SealedFiles = {
	cohort: Cohort
	directory: string
	analysis: string
	review: string
	html: string
	feedback: string
}

async function addSealedLabels(store: ArtifactStore, seeds: RegistrySeed[], files: SealedFiles): Promise<void> {
	const base = experiment(files.directory)
	const [analysis, manifest, evaluation, review, html, feedback, interpretation] = await Promise.all([
		store.json<AnalysisArtifact>(`${base}/${files.analysis}`, `${files.cohort} sealed labels`),
		store.json<Record<string, unknown>>(`${base}/manifest.json`, `${files.cohort} sealed manifest`),
		store.json<EvaluationArtifact>(`${base}/evaluation.json`, `${files.cohort} sealed evaluation`),
		store.json<PlanArtifact>(`${base}/${files.review}`, `${files.cohort} sealed review plan`),
		store.file(`${base}/${files.html}`, `${files.cohort} sealed rendered review`),
		store.json<FeedbackArtifact>(`${base}/${files.feedback}`, `${files.cohort} sealed feedback`),
		store.json<Record<string, unknown>>(`${base}/review-interpretation.json`, `${files.cohort} sealed interpretation`),
	])
	verifyProvenance(analysis, {
		manifestSha256: manifest,
		evaluationSha256: evaluation,
		reviewSha256: review,
		htmlSha256: html,
		feedbackSha256: feedback,
		interpretationSha256: interpretation,
	})
	verifyFeedback(review, html, feedback)
	if (evaluation.value.manifestSha256 !== manifest.sha256 || review.value.provenance &&
		isRecord(review.value.provenance) && review.value.provenance.evaluationSha256 !== undefined &&
		review.value.provenance.evaluationSha256 !== evaluation.sha256) {
		throw new Error(`${files.cohort} sealed artifact links are invalid`)
	}
	const evaluationByFamily = mapByFamily(evaluation.value.entries, `${files.cohort} evaluation`)
	for (const entry of analysis.value.entries) {
		if (entry.judgment === "unreviewed") continue
		const familyId = stringValue(entry.familyId, `${files.cohort} familyId`)
		const evaluated = evaluationByFamily.get(familyId)
		if (!evaluated) throw new Error(`${files.cohort} evaluation is unavailable for ${familyId}`)
		const pair = pairFromEndpoints(entry, `${files.cohort} analysis ${familyId}`)
		const evaluatedPair = pairFromPalette(evaluated, `${files.cohort} evaluation ${familyId}`)
		if (!samePair(pair, evaluatedPair) || pair.anchor.sha256 !== evaluatedPair.anchor.sha256) {
			throw new Error(`${files.cohort} reviewed endpoint pair changed for ${familyId}`)
		}
		addSeed(seeds, files.cohort, pair, judgmentValue(entry.judgment, `${files.cohort} ${familyId}`))
	}
}

async function addRoundThreeFollowup(
	store: ArtifactStore,
	seeds: RegistrySeed[],
	analysisFile: string,
	planFile: string,
	htmlFile: string,
	feedbackFile: string,
	role: string,
): Promise<void> {
	const evaluationFile = experiment("gradient-eligibility-0.8.1-sealed-validation/evaluation.json")
	const [analysis, plan, html, feedback, evaluation] = await Promise.all([
		store.json<AnalysisArtifact>(experiment(analysisFile), `${role} labels`),
		store.json<PlanArtifact>(experiment(planFile), `${role} plan`),
		store.file(experiment(htmlFile), `${role} rendered review`),
		store.json<FeedbackArtifact>(experiment(feedbackFile), `${role} feedback`),
		store.json<EvaluationArtifact>(evaluationFile, `${role} exact-pair source`),
	])
	verifyProvenance(analysis, {
		planSha256: plan,
		htmlSha256: html,
		feedbackSha256: feedback,
		evaluationSha256: evaluation,
	})
	verifyFeedback(plan, html, feedback)
	if (!isRecord(plan.value.provenance) || plan.value.provenance.evaluationSha256 !== evaluation.sha256) {
		throw new Error(`${role} plan does not bind the round-3 evaluation`)
	}
	verifyAnalysisResponses(analysis.value.entries, feedback.value.entries, "decision", "decision", role)
	const planByFamily = mapByFamily(plan.value.entries, `${role} plan`)
	const evaluationByFamily = mapByFamily(evaluation.value.entries, `${role} evaluation`)
	for (const entry of analysis.value.entries) {
		const familyId = stringValue(entry.familyId, `${role} familyId`)
		const planned = planByFamily.get(familyId)
		const evaluated = evaluationByFamily.get(familyId)
		if (!planned || !evaluated || sourceRef(planned.anchor, `${role} plan ${familyId}`).file !==
			sourceRef(evaluated.anchor, `${role} evaluation ${familyId}`).file) {
			throw new Error(`${role} metadata is unavailable for ${familyId}`)
		}
		addSeed(seeds, "03", pairFromPalette(evaluated, `${role} evaluation ${familyId}`),
			judgmentValue(entry.decision, `${role} ${familyId}`))
	}
}

function validateReconstructedSeeds(seeds: RegistrySeed[]): void {
	const expectedTotal = Object.values(expectedJudgments).reduce((sum, count) => sum + count, 0)
	if (seeds.length !== expectedTotal) throw new Error(`Expected ${expectedTotal} exact-pair labels, reconstructed ${seeds.length}`)
	const counts = countJudgments(seeds)
	if (!isDeepStrictEqual(counts, expectedJudgments)) {
		throw new Error(`Judgment count mismatch: ${JSON.stringify(counts)}`)
	}
	const identities = new Map<string, RegistrySeed>()
	for (const seed of seeds) {
		const identity = `${seed.sourceFile}\0${seed.background.join(",")}\0${seed.surface.join(",")}`
		const previous = identities.get(identity)
		if (previous) {
			if (previous.judgment !== seed.judgment) {
				throw new Error(`Conflicting judgments for exact directed pair ${seed.sourceFile}: ${previous.judgment} / ${seed.judgment}`)
			}
			throw new Error(`Duplicate exact directed pair: ${seed.sourceFile} ${rgbToHex(seed.background)} -> ${rgbToHex(seed.surface)}`)
		}
		identities.set(identity, seed)
	}
}

function countJudgments(entries: Array<{ judgment: Judgment }>): Record<Judgment, number> {
	const counts: Record<Judgment, number> = {
		"should-be-gradient": 0,
		"should-not-be-gradient": 0,
		"either-way": 0,
		"no-visible-difference": 0,
		"selected-colors-not-identifiable": 0,
		"uncertain": 0,
	}
	for (const entry of entries) counts[entry.judgment]++
	return counts
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function exactCandidate(candidates: Candidate[], rgb: RGB, role: string, sourceFile: string): Candidate {
	const matches = candidates.filter((candidate) => sameRgb(candidate.rgb, rgb))
	if (matches.length !== 1) {
		throw new Error(`${role} candidate lookup returned ${matches.length} matches for ${sourceFile} ${rgbToHex(rgb)}`)
	}
	return matches[0]
}

function sourcePath(file: string): string {
	validateSourceFile(file)
	return resolve(projectRoot, file)
}

async function evaluateSeed(seed: RegistrySeed): Promise<WorkerEntry> {
	const bytes = await readFile(sourcePath(seed.sourceFile))
	const sourceSha256 = sha256(bytes)
	if (seed.expectedSourceSha256 && sourceSha256 !== seed.expectedSourceSha256) {
		throw new Error(`Source hash changed for ${seed.sourceFile}: expected ${seed.expectedSourceSha256}, received ${sourceSha256}`)
	}
	const image = await loadImage(bytes)
	const analysis = analyzeRegions(image)
	const candidates = buildCandidates(analysis, candidateCount, true)
	const background = exactCandidate(candidates, seed.background, "Background", seed.sourceFile)
	const surface = exactCandidate(candidates, seed.surface, "Surface", seed.sourceFile)
	return {
		reviewBatch: seed.cohort,
		familyId: seed.familyId,
		sourceFile: seed.sourceFile,
		sourceSha256,
		sourceHashProvenance: seed.expectedSourceSha256 ? "artifact-bound" : "computed-only",
		judgment: seed.judgment,
		endpoints: {
			background: {
				rgb: seed.background,
				hex: rgbToHex(seed.background),
				candidateId: background.id,
				candidateFamilyId: background.familyId,
			},
			surface: {
				rgb: seed.surface,
				hex: rgbToHex(seed.surface),
				candidateId: surface.id,
				candidateFamilyId: surface.familyId,
			},
		},
		normalized: { width: image.width, height: image.height },
		evidence: analyzeGradientFieldTopology(background, surface, analysis),
	}
}

async function runWorker(tasks: RegistrySeed[]): Promise<WorkerEntry[]> {
	const entries: WorkerEntry[] = []
	for (const [index, task] of tasks.entries()) {
		entries.push(await evaluateSeed(task))
		if ((index + 1) % 10 === 0) parentPort?.postMessage({ progress: 10 })
	}
	return entries
}

async function runParallel(tasks: RegistrySeed[]): Promise<WorkerEntry[]> {
	const workerCount = Math.min(Math.max(1, availableParallelism() - 1), 4, tasks.length)
	const partitions = Array.from({ length: workerCount }, () => [] as RegistrySeed[])
	for (const [index, task] of tasks.entries()) partitions[index % workerCount].push(task)
	let completed = 0
	const workers = partitions.map((partition) => new Promise<WorkerEntry[]>((resolveWorker, rejectWorker) => {
		const worker = new Worker(new URL(import.meta.url), { workerData: partition })
		worker.on("message", (message: { progress: number } | { entries: WorkerEntry[] }) => {
			if ("entries" in message) resolveWorker(message.entries)
			else {
				completed += message.progress
				process.stderr.write(`gradient field topology: at least ${Math.min(completed, tasks.length)}/${tasks.length}\r`)
			}
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Gradient-field-topology worker exited with code ${code}`))
		})
	}))
	const entries = (await Promise.all(workers)).flat()
	process.stderr.write(`gradient field topology: ${entries.length}/${tasks.length}\n`)
	return entries.sort(compareEntries)
}

function compareEntries(first: WorkerEntry, second: WorkerEntry): number {
	return cohortOrder[first.reviewBatch] - cohortOrder[second.reviewBatch] ||
		first.familyId.localeCompare(second.familyId, "en") ||
		first.sourceFile.localeCompare(second.sourceFile, "en") ||
		first.endpoints.background.hex.localeCompare(second.endpoints.background.hex, "en") ||
		first.endpoints.surface.hex.localeCompare(second.endpoints.surface.hex, "en")
}

function validateWorkerEntries(entries: WorkerEntry[]): void {
	if (entries.length !== 412 || !isDeepStrictEqual(countJudgments(entries), expectedJudgments)) {
		throw new Error(`Evaluated registry count mismatch: ${JSON.stringify(countJudgments(entries))}`)
	}
	const identities = new Map<string, WorkerEntry>()
	for (const entry of entries) {
		if (entry.evidence.evidenceVersion !== GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION) {
			throw new Error(`Unexpected topology evidence version for ${entry.familyId}`)
		}
		const identity = `${entry.sourceSha256}\0${entry.endpoints.background.rgb.join(",")}\0${entry.endpoints.surface.rgb.join(",")}`
		const previous = identities.get(identity)
		if (previous) {
			if (previous.judgment !== entry.judgment) {
				throw new Error(`Conflicting judgments for source-identical exact directed pair ${entry.familyId}`)
			}
			throw new Error(`Duplicate source-identical exact directed pair: ${entry.familyId}`)
		}
		identities.set(identity, entry)
	}
}

async function reconstructLabels(store: ArtifactStore): Promise<RegistrySeed[]> {
	const seeds: RegistrySeed[] = []
	// These streams are intentionally explicit: each final label artifact is checked against the plan,
	// feedback, rendered review, interpretation, and exact-pair source artifacts that originally bound it.
	await addPilotLabels(store, seeds)
	await addTargetedLabels(store, seeds)
	await addChangeLabels(store, seeds)
	await addMusicAuditLabels(store, seeds)
	await addIterationLabels(store, seeds)
	await addSealedLabels(store, seeds, { cohort: "01", directory: "gradient-eligibility-0.7.0-sealed-validation",
		analysis: "analysis.json", review: "review.json", html: "review.html", feedback: "feedback.json" })
	await addSealedLabels(store, seeds, { cohort: "02", directory: "gradient-eligibility-0.8.0-sealed-validation",
		analysis: "analysis.json", review: "review.json", html: "review.html", feedback: "feedback.json" })
	await addSealedLabels(store, seeds, { cohort: "03", directory: "gradient-eligibility-0.8.1-sealed-validation",
		analysis: "analysis.json", review: "review.json", html: "review.html", feedback: "feedback.json" })
	await addRoundThreeFollowup(store, seeds,
		"gradient-eligibility-0.8.2-round3-followup-analysis.json",
		"gradient-eligibility-0.8.2-round3-followup-review.json",
		"gradient-eligibility-0.8.2-round3-followup-review.html",
		"gradient-eligibility-0.8.2-round3-followup-feedback.json",
		"round-3 follow-up")
	await addRoundThreeFollowup(store, seeds,
		"gradient-eligibility-0.8.3-round3-retained-analysis.json",
		"gradient-eligibility-0.8.3-round3-retained-review.json",
		"gradient-eligibility-0.8.3-round3-retained-review.html",
		"gradient-eligibility-0.8.3-round3-retained-feedback.json",
		"round-3 retained follow-up")
	await addSealedLabels(store, seeds, { cohort: "04", directory: "gradient-eligibility-0.8.4-sealed-validation",
		analysis: "analysis.json", review: "review.json", html: "review.html", feedback: "feedback.json" })
	await addSealedLabels(store, seeds, { cohort: "05", directory: "gradient-eligibility-0.8.5-sealed-validation",
		analysis: "removal-analysis.json", review: "review.json", html: "review.html", feedback: "feedback.json" })
	await addSealedLabels(store, seeds, { cohort: "06", directory: "gradient-eligibility-0.8.6-sealed-validation",
		analysis: "removal-analysis.json", review: "review.json", html: "review.html", feedback: "feedback.json" })
	await addSealedLabels(store, seeds, { cohort: "06", directory: "gradient-eligibility-0.8.6-sealed-validation",
		analysis: "retained-analysis.json", review: "retained-review.json", html: "retained-review.html",
		feedback: "retained-feedback.json" })
	validateReconstructedSeeds(seeds)
	return seeds
}

async function bindPriorSourceInventory(store: ArtifactStore, seeds: RegistrySeed[]): Promise<void> {
	const inventory = await store.json<Record<string, unknown>>("data/selection.json", "00 source hash inventory")
	if (!isRecord(inventory.value.tracks)) throw new Error("00 source hash inventory is invalid")
	const hashes = new Map<string, string>()
	for (const [track, values] of Object.entries(inventory.value.tracks)) {
		for (const entry of records(values, `00 source hash inventory track ${track}`)) {
			const file = stringValue(entry.file, `00 source hash inventory ${track}.file`)
			const sourceSha256 = optionalSha256(entry.sha256, `00 source hash inventory ${file}.sha256`)
			if (!sourceSha256) throw new Error(`00 source hash is unavailable for ${file}`)
			const previous = hashes.get(file)
			if (previous && previous !== sourceSha256) throw new Error(`00 source hash conflicts for ${file}`)
			hashes.set(file, sourceSha256)
		}
	}
	for (const seed of seeds) {
		if (seed.expectedSourceSha256 || !seed.sourceFile.startsWith("00/")) continue
		const sourceSha256 = hashes.get(seed.sourceFile)
		if (!sourceSha256) throw new Error(`00 source is absent from the source hash inventory: ${seed.sourceFile}`)
		seed.expectedSourceSha256 = sourceSha256
	}
}

if (!isMainThread) {
	runWorker(workerData as RegistrySeed[]).then((entries) => parentPort!.postMessage({ entries }), (error: unknown) => {
		throw error
	})
} else {
	const [outputArgument, ...unexpected] = process.argv.slice(2)
	if (!outputArgument || unexpected.length > 0) {
		throw new Error("Usage: prepare-gradient-field-topology-development.ts <output.json>")
	}
	if (ALGORITHM_VERSION !== "region-graph-0.17.0") throw new Error(`Unexpected canonical version: ${ALGORITHM_VERSION}`)
	const outputPath = resolve(outputArgument)
	await prepareOutputTarget({ path: outputPath, refuseOverwrite: true })
	const store = new ArtifactStore()
	const seeds = await reconstructLabels(store)
	await bindPriorSourceInventory(store, seeds)
	const implementationFiles = [
		"prepare-gradient-field-topology-development.ts",
		"fit-gradient-field-topology-model.ts",
		"src/color.ts",
		"src/candidates.ts",
		"src/gradient-field-topology.ts",
		"src/image.ts",
		"src/regions.ts",
	] as const
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (file) => {
		const artifact = await store.file(file, "topology implementation")
		return [file, artifact.sha256]
	})))
	const entries = await runParallel(seeds)
	validateWorkerEntries(entries)
	const packageSource = await readFile(resolve(projectRoot, "package.json"))
	const packageValue = JSON.parse(packageSource.toString("utf8")) as {
		devDependencies?: Record<string, string>
	}
	const declaredSharp = packageValue.devDependencies?.sharp
	const declaredTypeScript = packageValue.devDependencies?.typescript
	if (!declaredSharp || !declaredTypeScript) throw new Error("Runtime dependency declarations are unavailable")
	const temporalReviewBatchSummary = Object.fromEntries((Object.keys(cohortOrder) as Cohort[]).map((reviewBatch) => [reviewBatch, {
		total: entries.filter((entry) => entry.reviewBatch === reviewBatch).length,
		judgments: countJudgments(entries.filter((entry) => entry.reviewBatch === reviewBatch)),
	}]))
	await writeJsonAtomic({ path: outputPath, refuseOverwrite: true }, {
		schemaVersion: 1,
		developmentVersion,
		generatedAt: new Date().toISOString(),
		algorithmVersion: ALGORITHM_VERSION,
		evidenceVersion: GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION,
		developmentOnly: true,
		scope: "Exact directed background-surface judgments from music, targeted development, and temporal review batches 00-06 only.",
		temporalReviewBatchInterpretation: "Batch differences can reflect reviewer drift and adaptive case selection; they are not population or source cohorts.",
		provenance: {
			sourceArtifacts: store.describe(),
			implementationSha256: implementation,
			preparation: {
				candidateCount,
				roleAwareCandidates: true,
				evidenceConstants: GRADIENT_FIELD_TOPOLOGY_CONSTANTS,
			},
			runtimeDependencies: {
				node: process.version,
				nodeVersions: process.versions,
				sharpVersions: sharp.versions,
				packageJsonSha256: sha256(packageSource),
				declared: { sharp: declaredSharp, typescript: declaredTypeScript },
			},
		},
		summary: {
			total: entries.length,
			judgments: countJudgments(entries),
			temporalReviewBatches: temporalReviewBatchSummary,
			artifactBoundSourceHashes: entries.filter((entry) => entry.sourceHashProvenance === "artifact-bound").length,
			computedOnlySourceHashes: entries.filter((entry) => entry.sourceHashProvenance === "computed-only").length,
		},
		entries,
	})
	process.stderr.write(`Prepared ${entries.length} exact-pair topology entries at ${outputPath}\n`)
}
