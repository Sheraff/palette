import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import { ALGORITHM_VERSION, extractPalette } from "./src/extract.ts"
import { loadImage } from "./src/image.ts"
import {
	buildNextPaletteSoftContrastFrontier,
	NEXT_PALETTE_SOFT_CONTRAST_FRONTIER_POLICY,
	NEXT_PALETTE_SOFT_CONTRAST_FRONTIER_VERSION,
	type LegacyPolicyProfile,
	type NextPaletteSoftContrastFrontier,
	type SoftContrastRole,
} from "./src/next-palette-soft-contrast-frontier.ts"
import type { CorpusResult, ExtractionResult, Palette } from "./src/types.ts"

const EXPERIMENT_VERSION = "next-palette-soft-contrast-frontier-0.1.0-development"
const SOURCE_EXPERIMENT_ID = "4956afc31f06ffe17a4503057f4c89ee9dc884ae81d330ada6d0cf03c6e94b99"
const SOURCE_INVENTORY_ID = "3907c57f94cd7dfea992c5d1ce98da6de2165c720b75259b32f0250da1881c7f"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const outputRoot = join(researchRoot, "data/experiments", EXPERIMENT_VERSION)

const inputFiles = {
	sourceManifest: "research/data/experiments/next-palette-0.4.0-connected-family-development/manifest.json",
	canonicalDevelopment: "research/data/results.json",
	canonical00: "research/data/holdout-results.json",
	sourceInventory: "research/data/source-provenance-inventory-00-14.json",
	auditManifest: "research/data/experiments/palette-role-00-audit-0.2.0-development/manifest.json",
	auditFeedback: "research/data/experiments/palette-role-00-audit-0.2.0-development/feedback.json",
	auditInterpretation: "research/data/experiments/palette-role-00-audit-0.2.0-development/interpretation.json",
	review01Manifest01: "research/data/experiments/next-palette-0.1.0-development/review-v2/batch-01-manifest.json",
	review01Feedback01: "research/data/experiments/next-palette-0.1.0-development/review-v2/batch-01-feedback.json",
	review01Manifest02: "research/data/experiments/next-palette-0.1.0-development/review-v2/batch-02-manifest.json",
	review01Feedback02: "research/data/experiments/next-palette-0.1.0-development/review-v2/batch-02-feedback.json",
	review01Interpretation:
		"research/data/experiments/next-palette-0.1.0-development/review-v2/comment-interpretation-batches-01-02.json",
	review01Attribution:
		"research/data/experiments/next-palette-0.1.0-development/review-v2/technical-attribution-batches-01-02.json",
	review02Manifest:
		"research/data/experiments/next-palette-0.2.0-field-pair-development/review-v1/batch-01-manifest.json",
	review02Feedback:
		"research/data/experiments/next-palette-0.2.0-field-pair-development/review-v1/batch-01-feedback.json",
	review02Interpretation:
		"research/data/experiments/next-palette-0.2.0-field-pair-development/review-v1/comment-interpretation-partial-batch-01.json",
	review04Manifest:
		"research/data/experiments/next-palette-0.4.0-connected-family-development/review-v1/batch-01-manifest.json",
	review04Feedback:
		"research/data/experiments/next-palette-0.4.0-connected-family-development/review-v1/batch-01-feedback.json",
	review04Interpretation:
		"research/data/experiments/next-palette-0.4.0-connected-family-development/review-v1/interpretation.json",
} as const

const implementationFiles = [
	"package.json",
	"pnpm-lock.yaml",
	"research/NEXT_PALETTE_SOFT_CONTRAST_PLAN.md",
	"research/src/types.ts",
	"research/src/color.ts",
	"research/src/image.ts",
	"research/src/regions.ts",
	"research/src/candidates.ts",
	"research/src/palette-perception.ts",
	"research/src/palette-evidence-graph.ts",
	"research/src/field-relation.ts",
	"research/src/palette-relation-graph.ts",
	"research/src/connected-family-candidate-availability.ts",
	"research/src/connected-family-palette-perception.ts",
	"research/src/connected-family-palette-evidence-graph.ts",
	"research/src/next-palette-soft-contrast-frontier.ts",
	"research/evaluate-next-palette-soft-contrast-frontier.ts",
] as const

type Cohort = "development" | "00"
type Source = { cohort: Cohort; path: string; sha256: string; bytes: number }
type SourceManifest = { experimentId: string; sources: Source[] }
type Task = Source & { canonical: ExtractionResult }
type WorkerResult = {
	cohort: Cohort
	file: string
	source: { sha256: string; bytes: number }
	normalizedImageSha256: string
	canonicalRecomputed: true
	diagnostic: NextPaletteSoftContrastFrontier
	diagnosticId: string
	elapsedMs: number
}

type ReviewSource = { file: string; sha256: string; bytes: number }
type ReviewManifestEntry = { caseId: string; source: ReviewSource }
type ReviewManifest = { entries: ReviewManifestEntry[] }
type ReviewFeedbackEntry = { caseId: string; sourceSha256: string; note?: string; comment?: string }
type ReviewFeedback = { entries: ReviewFeedbackEntry[] }

type ReviewMechanism =
	| "candidate-availability"
	| "representative-fidelity"
	| "provisional-policy-rejection"
	| "source-role-membership"
	| "complete-tuple-feasibility"
	| "complete-tuple-ranking"
	| "field-relation"
	| "consumer-ambiguity"

type ReviewOccurrenceSeed = {
	dataset: "canonical-00-audit" | "next-palette-0.1" | "next-palette-0.2" | "next-palette-0.4"
	caseId: string
	file: string
	sha256: string
	legacyClassifications: string[]
}

type ReviewOccurrence = ReviewOccurrenceSeed & {
	occurrenceId: string
	mechanisms: ReviewMechanism[]
	primaryMechanism: ReviewMechanism | null
	disposition: "classified-palette-miss" | "not-a-palette-miss"
	provisionalPolicyCandidateIds: string[]
	classificationPolicy: {
		commentTextReadByClassifier: false
		legacyDiagnosticLabelsOnly: true
		targetFamilyInferred: false
	}
}

const mechanismPriority: readonly ReviewMechanism[] = [
	"candidate-availability",
	"representative-fidelity",
	"provisional-policy-rejection",
	"source-role-membership",
	"complete-tuple-feasibility",
	"complete-tuple-ranking",
	"field-relation",
	"consumer-ambiguity",
]

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue)
	if (typeof value !== "object" || value === null) return value
	const record = value as Record<string, unknown>
	return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalValue(record[key])]))
}

function deterministicId(value: unknown): string {
	return sha256(JSON.stringify(canonicalValue(value)))
}

function assertFiniteTree(value: unknown, label: string): void {
	if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${label} contains a non-finite number`)
	if (Array.isArray(value)) {
		value.forEach((entry, index) => assertFiniteTree(entry, `${label}[${index}]`))
		return
	}
	if (typeof value === "object" && value !== null) {
		for (const [key, entry] of Object.entries(value)) assertFiniteTree(entry, `${label}.${key}`)
	}
}

function normalizedImageIdentity(width: number, height: number, data: Uint8Array): string {
	return sha256(Buffer.concat([
		Buffer.from(`${width}x${height}\0`),
		Buffer.from(data.buffer, data.byteOffset, data.byteLength),
	]))
}

function canonicalMap(development: CorpusResult, canonical00: CorpusResult): Map<string, ExtractionResult> {
	return new Map([
		...development.entries.map((entry) => [`images/${entry.file}`, entry.extraction] as const),
		...canonical00.entries.map((entry) => [entry.file, entry.extraction] as const),
	])
}

function extractionWithoutRuntime(extraction: ExtractionResult): ExtractionResult {
	return {
		...extraction,
		diagnostics: { ...extraction.diagnostics, processingMs: 0 },
	}
}

async function evaluate(task: Task): Promise<WorkerResult> {
	if (!/^(?:images|00)\/[^/\\]+$/.test(task.path)) throw new Error(`Unauthorized source path: ${task.path}`)
	const bytes = await readFile(join(projectRoot, task.path))
	if (bytes.byteLength !== task.bytes || sha256(bytes) !== task.sha256) {
		throw new Error(`Source binding changed: ${task.path}`)
	}
	const image = await loadImage(bytes)
	const recomputed = extractPalette(image)
	if (!isDeepStrictEqual(extractionWithoutRuntime(recomputed), extractionWithoutRuntime(task.canonical))) {
		throw new Error(`Canonical ${ALGORITHM_VERSION} output changed: ${task.path}`)
	}
	const started = performance.now()
	const diagnostic = buildNextPaletteSoftContrastFrontier(image, task.canonical.methods.spatial)
	const elapsedMs = performance.now() - started
	assertFiniteTree(diagnostic, `Diagnostic ${task.path}`)
	const identity = {
		file: task.path,
		sourceSha256: task.sha256,
		normalizedImageSha256: normalizedImageIdentity(image.width, image.height, image.data),
		diagnostic,
	}
	return {
		cohort: task.cohort,
		file: task.path,
		source: { sha256: task.sha256, bytes: task.bytes },
		normalizedImageSha256: identity.normalizedImageSha256,
		canonicalRecomputed: true,
		diagnostic,
		diagnosticId: deterministicId(identity),
		elapsedMs,
	}
}

async function runWorker(tasks: Task[]): Promise<WorkerResult[]> {
	const results: WorkerResult[] = []
	for (const task of tasks) {
		results.push(await evaluate(task))
		parentPort?.postMessage({ progress: 1 })
	}
	return results
}

async function runParallel(tasks: Task[]): Promise<WorkerResult[]> {
	const workerCount = Math.min(Math.max(1, availableParallelism() - 1), 8, tasks.length)
	const partitions = Array.from({ length: workerCount }, () => [] as Task[])
	for (const [index, task] of tasks.entries()) partitions[index % workerCount].push(task)
	let completed = 0
	const workers = partitions.map((partition) => new Promise<WorkerResult[]>((resolveWorker, rejectWorker) => {
		const worker = new Worker(new URL(import.meta.url), { workerData: partition })
		worker.on("message", (message: { progress: number } | { results: WorkerResult[] }) => {
			if ("results" in message) resolveWorker(message.results)
			else {
				completed += message.progress
				if (completed % 10 === 0 || completed === tasks.length) {
					process.stderr.write(`soft contrast frontier evaluation: ${completed}/${tasks.length}\r`)
				}
			}
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Soft contrast frontier worker exited with code ${code}`))
		})
	}))
	const results = (await Promise.all(workers)).flat().sort((first, second) =>
		first.cohort.localeCompare(second.cohort) || first.file.localeCompare(second.file))
	process.stderr.write(`soft contrast frontier evaluation: ${results.length}/${tasks.length}\n`)
	return results
}

function mechanismsFromLabels(labels: readonly string[]): Set<ReviewMechanism> {
	const mechanisms = new Set<ReviewMechanism>()
	for (const rawLabel of labels) {
		const label = rawLabel.toLowerCase()
		if (label.includes("candidate-availability") || label === "availability") {
			mechanisms.add("candidate-availability")
		}
		if (label.includes("representative-fidelity") || label.includes("low-chroma-representation")) {
			mechanisms.add("representative-fidelity")
		}
		if (label.includes("foreground-policy") || label.includes("consumer-specific-foreground-apca-policy") ||
			label.includes("foreground-adjacency-policy") || label.includes("role-adjacency-contract") ||
			label.includes("accent-feasibility")) mechanisms.add("provisional-policy-rejection")
		if (label.includes("role-allocation") || label.includes("role-semantic") || label.includes("role-membership") ||
			label.includes("typography-semantics") || label.includes("foreground-source-intent") ||
			label.includes("accent-foreground-crowding")) mechanisms.add("source-role-membership")
		if (label.includes("tuple-feasibility") || label.includes("role-feasibility") || label.includes("cardinality") ||
			label.includes("four-role-coverage")) mechanisms.add("complete-tuple-feasibility")
		if (label.includes("complete-tuple-ranking") || label.includes("candidate-present-role-ranking") ||
			label.includes("identity-ranking") || label.includes("accent-selection") ||
			label.includes("connected-family-ranking") || label.includes("multi-family-palette-composition")) {
			mechanisms.add("complete-tuple-ranking")
		}
		if (label.includes("surface") || label.includes("gradient") || label.includes("field-") ||
			label.includes("collapse") || label.includes("marginal-topology") || label.includes("presentation-state")) {
			mechanisms.add("field-relation")
		}
		if (label.includes("non-exclusive") || label.includes("cross-option") || label.includes("ambiguous")) {
			mechanisms.add("consumer-ambiguity")
		}
		if (label === "policy-or-tuple-feasibility") mechanisms.add("complete-tuple-feasibility")
		if (label === "complete-tuple-ranking") mechanisms.add("complete-tuple-ranking")
		if (label === "representative-fidelity") mechanisms.add("representative-fidelity")
	}
	return mechanisms
}

function blockedPolicyCandidates(
	result: WorkerResult,
	labels: readonly string[],
): string[] {
	const roles: SoftContrastRole[] = labels.some((label) => label.toLowerCase().includes("foreground"))
		? ["foreground"]
		: labels.some((label) => label.toLowerCase().includes("accent"))
			? ["accent"]
			: ["foreground", "accent"]
	const profiles: LegacyPolicyProfile[] = ["next-palette-0.1/0.2", "next-palette-0.3", "next-palette-0.4"]
	return result.diagnostic.alternatives.filter((alternative) => !alternative.generated && roles.some((role) =>
		profiles.some((profile) => alternative.legacyPolicy[profile][role]?.blockedOnlyByRoleApca === true)))
		.map((alternative) => alternative.alternativeId).sort()
}

function classifyReviewOccurrences(seeds: ReviewOccurrenceSeed[], results: readonly WorkerResult[]): ReviewOccurrence[] {
	const byFile = new Map(results.map((result) => [result.file, result]))
	return seeds.map((seed) => {
		const result = byFile.get(seed.file)
		if (!result || result.source.sha256 !== seed.sha256) throw new Error(`Review source is not bound: ${seed.caseId}`)
		const mechanisms = mechanismsFromLabels(seed.legacyClassifications)
		let provisionalPolicyCandidateIds: string[] = []
		if (mechanisms.has("provisional-policy-rejection")) {
			provisionalPolicyCandidateIds = blockedPolicyCandidates(result, seed.legacyClassifications)
			if (provisionalPolicyCandidateIds.length === 0) {
				mechanisms.delete("provisional-policy-rejection")
				mechanisms.add("complete-tuple-feasibility")
			}
		}
		const ordered = mechanismPriority.filter((mechanism) => mechanisms.has(mechanism))
		return {
			...seed,
			occurrenceId: deterministicId({ dataset: seed.dataset, caseId: seed.caseId, sha256: seed.sha256 }),
			mechanisms: ordered,
			primaryMechanism: ordered[0] ?? null,
			disposition: ordered.length > 0 ? "classified-palette-miss" : "not-a-palette-miss",
			provisionalPolicyCandidateIds,
			classificationPolicy: {
				commentTextReadByClassifier: false,
				legacyDiagnosticLabelsOnly: true,
				targetFamilyInferred: false,
			},
		}
	})
}

function assertCommentedFeedback(entry: ReviewFeedbackEntry | undefined, label: string): void {
	if (!entry || !((entry.note ?? entry.comment ?? "").trim())) throw new Error(`${label} lacks a bound nonempty comment`)
}

function sourceByCase(manifest: ReviewManifest): Map<string, ReviewSource> {
	return new Map(manifest.entries.map((entry) => [entry.caseId, entry.source]))
}

function buildReviewSeeds(parse: <T>(name: keyof typeof inputFiles) => T): ReviewOccurrenceSeed[] {
	const seeds: ReviewOccurrenceSeed[] = []
	const auditManifest = parse<{ entries: Array<{ caseId: string; source: ReviewSource }> }>("auditManifest")
	const auditFeedback = parse<ReviewFeedback>("auditFeedback")
	const auditInterpretation = parse<{ commentInterpretations: Array<{
		caseId: string; file: string; classifications: string[]
	}> }>("auditInterpretation")
	const auditSource = new Map(auditManifest.entries.map((entry) => [entry.caseId, entry.source]))
	const auditFeedbackByCase = new Map(auditFeedback.entries.map((entry) => [entry.caseId, entry]))
	for (const entry of auditInterpretation.commentInterpretations) {
		const source = auditSource.get(entry.caseId)
		assertCommentedFeedback(auditFeedbackByCase.get(entry.caseId), `Audit ${entry.caseId}`)
		if (!source || source.file !== entry.file) throw new Error(`Audit interpretation source changed: ${entry.caseId}`)
		seeds.push({ dataset: "canonical-00-audit", caseId: entry.caseId, file: source.file,
			sha256: source.sha256, legacyClassifications: [...entry.classifications] })
	}

	const review01Manifests = [parse<ReviewManifest>("review01Manifest01"), parse<ReviewManifest>("review01Manifest02")]
	const review01Feedback = [parse<ReviewFeedback>("review01Feedback01"), parse<ReviewFeedback>("review01Feedback02")]
	const review01Sources = new Map(review01Manifests.flatMap((manifest) => [...sourceByCase(manifest)]))
	const review01FeedbackByCase = new Map(review01Feedback.flatMap((feedback) =>
		feedback.entries.map((entry) => [entry.caseId, entry] as const)))
	const review01Interpretation = parse<{ entries: Array<{
		caseId: string; file: string; classifications: string[]
	}> }>("review01Interpretation")
	const attribution = parse<{ identityOmissionAttribution: Array<{ file: string; attribution: string }> }>("review01Attribution")
	const attributionByFile = new Map(attribution.identityOmissionAttribution.map((entry) => [entry.file, entry.attribution]))
	for (const entry of review01Interpretation.entries) {
		const source = review01Sources.get(entry.caseId)
		assertCommentedFeedback(review01FeedbackByCase.get(entry.caseId), `0.1 review ${entry.caseId}`)
		if (!source || source.file !== entry.file) throw new Error(`0.1 review source changed: ${entry.caseId}`)
		const labels = [...entry.classifications]
		const technical = attributionByFile.get(entry.file)
		if (technical) labels.push(technical)
		seeds.push({ dataset: "next-palette-0.1", caseId: entry.caseId, file: source.file,
			sha256: source.sha256, legacyClassifications: labels })
	}

	const review02Manifest = parse<ReviewManifest>("review02Manifest")
	const review02Feedback = parse<ReviewFeedback>("review02Feedback")
	const review02SourceByFile = new Map(review02Manifest.entries.map((entry) => [entry.source.file, {
		caseId: entry.caseId,
		source: entry.source,
	}]))
	const review02FeedbackByCase = new Map(review02Feedback.entries.map((entry) => [entry.caseId, entry]))
	const review02Interpretation = parse<{ comments: Array<{ file: string; classifications: string[] }> }>("review02Interpretation")
	for (const entry of review02Interpretation.comments) {
		const binding = review02SourceByFile.get(entry.file)
		if (!binding) throw new Error(`0.2 review source changed: ${entry.file}`)
		assertCommentedFeedback(review02FeedbackByCase.get(binding.caseId), `0.2 review ${binding.caseId}`)
		seeds.push({ dataset: "next-palette-0.2", caseId: binding.caseId, file: binding.source.file,
			sha256: binding.source.sha256, legacyClassifications: [...entry.classifications] })
	}

	const review04Manifest = parse<ReviewManifest>("review04Manifest")
	const review04Feedback = parse<ReviewFeedback>("review04Feedback")
	const review04Sources = sourceByCase(review04Manifest)
	const review04FeedbackByCase = new Map(review04Feedback.entries.map((entry) => [entry.caseId, entry]))
	const review04Interpretation = parse<{ entries: Array<{
		caseId: string; file: string; unresolved: string[]
	}> }>("review04Interpretation")
	for (const entry of review04Interpretation.entries) {
		const source = review04Sources.get(entry.caseId)
		assertCommentedFeedback(review04FeedbackByCase.get(entry.caseId), `0.4 review ${entry.caseId}`)
		if (!source || source.file !== entry.file) throw new Error(`0.4 review source changed: ${entry.caseId}`)
		seeds.push({ dataset: "next-palette-0.4", caseId: entry.caseId, file: source.file,
			sha256: source.sha256, legacyClassifications: [...entry.unresolved] })
	}
	if (seeds.length !== 48 || new Set(seeds.map((seed) => seed.sha256)).size !== 39) {
		throw new Error("Commented review cohort must remain 48 occurrences across 39 sources")
	}
	return seeds
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite existing soft contrast frontier experiment: ${outputRoot}`)
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) {
		throw new Error("evaluate-next-palette-soft-contrast-frontier.ts does not accept arguments")
	}
	await assertOutputAbsent()
	const inputEntries = await Promise.all(Object.entries(inputFiles).map(async ([name, path]) => {
		const raw = await readFile(join(projectRoot, path))
		return [name, { path, raw, sha256: sha256(raw) }] as const
	}))
	const inputs = Object.fromEntries(inputEntries) as Record<keyof typeof inputFiles, {
		path: string
		raw: Buffer
		sha256: string
	}>
	const parse = <T>(name: keyof typeof inputFiles): T => JSON.parse(inputs[name].raw.toString("utf8")) as T
	const sourceManifest = parse<SourceManifest>("sourceManifest")
	const canonicalDevelopment = parse<CorpusResult>("canonicalDevelopment")
	const canonical00 = parse<CorpusResult>("canonical00")
	const sourceInventory = parse<{ inventoryId: string }>("sourceInventory")
	if (sourceManifest.experimentId !== SOURCE_EXPERIMENT_ID || sourceInventory.inventoryId !== SOURCE_INVENTORY_ID ||
		canonicalDevelopment.algorithmVersion !== ALGORITHM_VERSION || canonical00.algorithmVersion !== ALGORITHM_VERSION ||
		sourceManifest.sources.length !== 392 || canonicalDevelopment.entries.length !== 37 || canonical00.entries.length !== 355) {
		throw new Error("Soft contrast frontier input bindings disagree")
	}
	if (sourceManifest.sources.some((source) => !/^(?:images|00)\/[^/\\]+$/.test(source.path)) ||
		new Set(sourceManifest.sources.map((source) => source.path)).size !== 392 ||
		sourceManifest.sources.filter((source) => source.cohort === "development").length !== 37 ||
		sourceManifest.sources.filter((source) => source.cohort === "00").length !== 355) {
		throw new Error("Soft contrast source authorization is invalid")
	}
	const canonicalByFile = canonicalMap(canonicalDevelopment, canonical00)
	const tasks = sourceManifest.sources.map((source): Task => {
		const canonical = canonicalByFile.get(source.path)
		if (!canonical) throw new Error(`Missing canonical extraction: ${source.path}`)
		return { ...source, canonical }
	})
	const results = await runParallel(tasks)
	const reviewOccurrences = classifyReviewOccurrences(buildReviewSeeds(parse), results)
	const knownAvailabilityFiles = new Set(parse<{
		identityOmissionAttribution: Array<{ file: string; attribution: string }>
	}>("review01Attribution").identityOmissionAttribution.filter((entry) => entry.attribution === "candidate-availability")
		.map((entry) => entry.file))
	if (knownAvailabilityFiles.size !== 6) throw new Error("Known availability cohort binding changed")
	const knownAvailability = results.filter((result) => knownAvailabilityFiles.has(result.file)).map((result) => ({
		file: result.file,
		connectedFamilyReserveCount: result.diagnostic.perception.connectedFamilyReserveCount,
	}))
	if (knownAvailability.length !== 6 || knownAvailability.some((entry) => entry.connectedFamilyReserveCount === 0)) {
		throw new Error("Known connected-family availability was not preserved")
	}

	const canonicalRawHashesBefore = {
		development: inputs.canonicalDevelopment.sha256,
		canonical00: inputs.canonical00.sha256,
	}
	const canonicalRawHashesAfter = {
		development: sha256(await readFile(join(projectRoot, inputFiles.canonicalDevelopment))),
		canonical00: sha256(await readFile(join(projectRoot, inputFiles.canonical00))),
	}
	if (!isDeepStrictEqual(canonicalRawHashesBefore, canonicalRawHashesAfter)) {
		throw new Error("Canonical result artifacts changed during the diagnostic")
	}

	const protocol = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		diagnosticVersion: NEXT_PALETTE_SOFT_CONTRAST_FRONTIER_VERSION,
		authorization: {
			developmentOnly: true,
			allowedSourceRoots: ["images", "00"],
			outputUnseenRootsOpened: [] as string[],
			newHumanReviewAuthorized: false,
			canonicalPromotionAuthorized: false,
			candidateFreezeAuthorized: false,
		},
		scope: "Read-only source-exact foreground and accent contrast frontiers over canonical 0.19 fields.",
		stoppingRules: {
			canonicalOutputMustRemainExact: true,
			allApcaRelationsFiniteAndRecomputable: true,
			commentTextDoesNotLabelTargetFamilies: true,
			fixedApcaFloorsDoNotEnterFeasibilityOrFrontierMembership: true,
			allCommentedCasesClassifiedByExistingDiagnosticLabels: true,
			reserveRootsRemainUnopened: ["10", "11", "12", "13", "14"],
		},
	}
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (path) =>
		[path, sha256(await readFile(join(projectRoot, path)))] as const)))
	const identity = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		diagnosticVersion: NEXT_PALETTE_SOFT_CONTRAST_FRONTIER_VERSION,
		policy: NEXT_PALETTE_SOFT_CONTRAST_FRONTIER_POLICY,
		protocol,
		inputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, {
			path: input.path,
			sha256: input.sha256,
		}])),
		sourceInventoryId: SOURCE_INVENTORY_ID,
		sources: sourceManifest.sources,
		implementation,
	}
	const experimentId = deterministicId(identity)
	const generatedAt = new Date().toISOString()
	const sourceAlternatives = results.flatMap((result) => result.diagnostic.alternatives.filter((entry) => !entry.generated))
	const generatedAlternatives = results.flatMap((result) => result.diagnostic.alternatives.filter((entry) => entry.generated))
	const profileCounts = Object.fromEntries((["next-palette-0.1/0.2", "next-palette-0.3", "next-palette-0.4"] as const)
		.map((profile) => [profile, Object.fromEntries((["foreground", "accent"] as const).map((role) => [role, {
			blockedOnlyByRoleApca: sourceAlternatives.filter((alternative) =>
				alternative.legacyPolicy[profile][role]?.blockedOnlyByRoleApca).length,
			withAnyRoleApcaOnlyRejectedTuple: sourceAlternatives.filter((alternative) =>
				(alternative.legacyPolicy[profile][role]?.roleApcaOnlyRejectedTupleCount ?? 0) > 0).length,
			withAnyFeasibleTuple: sourceAlternatives.filter((alternative) =>
				(alternative.legacyPolicy[profile][role]?.feasibleTupleCount ?? 0) > 0).length,
		}]))]))
	const mechanismCounts = Object.fromEntries(mechanismPriority.map((mechanism) => [mechanism,
		reviewOccurrences.filter((occurrence) => occurrence.mechanisms.includes(mechanism)).length]))
	const analysis = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		experimentId,
		generatedAt,
		stoppingRules: {
			pass: true,
			canonicalRecomputationMismatches: 0,
			canonicalRawHashesBefore,
			canonicalRawHashesAfter,
			nonFiniteApcaRelations: 0,
			unauthorizedSourceRootsOpened: [] as string[],
			commentDerivedTargetFamilies: 0,
			fixedApcaFloorAdmissionUses: 0,
			fixedApcaFloorFrontierUses: 0,
		},
		coverage: {
			sources: results.length,
			development: results.filter((result) => result.cohort === "development").length,
			cohort00: results.filter((result) => result.cohort === "00").length,
			sourceExactAlternatives: sourceAlternatives.length,
			generatedAlternatives: generatedAlternatives.length,
			foregroundFrontierMembers: results.reduce((sum, result) => sum + result.diagnostic.frontiers.foreground.length, 0),
			accentFrontierMembers: results.reduce((sum, result) => sum + result.diagnostic.frontiers.accent.length, 0),
		},
		legacyPolicyOccurrenceEvidence: profileCounts,
		knownAvailabilityCohort: {
			total: knownAvailability.length,
			withConnectedFamilyRepresentatives: knownAvailability.filter((entry) => entry.connectedFamilyReserveCount > 0).length,
			entries: knownAvailability,
		},
		reviewClassification: {
			occurrences: reviewOccurrences.length,
			uniqueSources: new Set(reviewOccurrences.map((occurrence) => occurrence.sha256)).size,
			classifiedPaletteMisses: reviewOccurrences.filter((occurrence) => occurrence.disposition === "classified-palette-miss").length,
			nonPaletteMisses: reviewOccurrences.filter((occurrence) => occurrence.disposition === "not-a-palette-miss").length,
			mechanismCounts,
		},
		performance: {
			meanMs: results.reduce((sum, result) => sum + result.elapsedMs, 0) / results.length,
			maximumMs: Math.max(...results.map((result) => result.elapsedMs)),
			totalWorkerMs: results.reduce((sum, result) => sum + result.elapsedMs, 0),
		},
		disposition: "stage-1-complete-proceed-to-stage-2",
		limitations: [
			"Legacy APCA-only evidence is occurrence-level because historical solvers rejected complete tuples, not isolated colors.",
			"Review classifications reuse prior diagnostic labels but never use comment text to identify a target family or color.",
			"Stage 1 emits no candidate palette and supplies no promotion evidence.",
		],
	}
	const evaluation = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		experimentId,
		diagnosticVersion: NEXT_PALETTE_SOFT_CONTRAST_FRONTIER_VERSION,
		entries: results.map(({ elapsedMs, ...result }) => ({ ...result, elapsedMs })),
		reviewOccurrences,
	}
	assertFiniteTree(analysis, "Soft contrast analysis")
	assertFiniteTree(evaluation, "Soft contrast evaluation")
	await mkdir(outputRoot)
	await Promise.all([
		writeExclusive(join(outputRoot, "protocol.json"), protocol),
		writeExclusive(join(outputRoot, "manifest.json"), { ...identity, experimentId, generatedAt }),
		writeExclusive(join(outputRoot, "evaluation.json"), evaluation),
		writeExclusive(join(outputRoot, "analysis.json"), analysis),
	])
	process.stderr.write(`Wrote soft contrast frontier experiment ${experimentId} to ${outputRoot}\n`)
}

if (!isMainThread) {
	runWorker(workerData as Task[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => { throw error })
} else {
	await main()
}
