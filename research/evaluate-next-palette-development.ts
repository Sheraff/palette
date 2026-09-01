import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { basename, join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import { buildReviewEvidence, reviewEvidenceInputPaths } from "./build-review-evidence.ts"
import { buildCandidateComparisonReport, compareSpatialPalettes, roleNames } from "./src/candidate-comparison.ts"
import { validateCurationStore, type CurationStore } from "./src/corpus-curation.ts"
import { validateSelectionManifest, type SelectionManifest } from "./src/corpus-selection.ts"
import { ALGORITHM_VERSION, extractPalette } from "./src/extract.ts"
import { loadImage } from "./src/image.ts"
import {
	extractNextPaletteWithContext,
	NEXT_PALETTE_ALGORITHM_VERSION,
	NEXT_PALETTE_DEVELOPMENT_POLICY,
	NEXT_PALETTE_IDENTITY,
	type NextPaletteCertificate,
} from "./src/next-palette.ts"
import { matchAcceptedSet, paletteSnapshot, type PaletteId, type SemanticPalette } from "./src/review-evidence.ts"
import type { CorpusResult, ExtractionResult, Palette, RoleName } from "./src/types.ts"

const EXPERIMENT_VERSION = "next-palette-0.1.0-development"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const outputRoot = join(researchRoot, "data/experiments", EXPERIMENT_VERSION)
const inputFiles = {
	canonicalDevelopment: "research/data/results.json",
	canonical00: "research/data/holdout-results.json",
	selection: "research/data/selection.json",
	curation: "research/data/curation.json",
	absoluteFeedback: "research/data/absolute-feedback.json",
} as const
const implementationFiles = [
	"package.json",
	"pnpm-lock.yaml",
	"research/NEXT_PALETTE_ARCHITECTURE.md",
	"research/src/types.ts",
	"research/src/color.ts",
	"research/src/image.ts",
	"research/src/regions.ts",
	"research/src/candidates.ts",
	"research/src/gradient-field-topology.ts",
	"research/src/gradient-field-topology-model.ts",
	"research/src/palette-perception.ts",
	"research/src/palette-evidence-graph.ts",
	"research/src/next-palette.ts",
	"research/src/extract.ts",
	"research/src/candidate-comparison.ts",
	"research/src/review-evidence.ts",
	"research/src/corpus-selection.ts",
	"research/src/corpus-curation.ts",
	"research/build-review-evidence.ts",
	"research/evaluate-next-palette-development.ts",
] as const

type Cohort = "development" | "00"
type Task = {
	cohort: Cohort
	file: string
	sourcePath: string
	expectedSourceSha256: string | null
	baseline: CorpusResult["entries"][number]
}
type StructuralAssessment = {
	violations: string[]
	countsReconcile: boolean
	signedApcaPass: boolean
	sourceProvenancePass: boolean
	cardinalityPass: boolean
	graphCompletenessPass: boolean
}
type WorkerResult = {
	cohort: Cohort
	file: string
	source: { path: string; sha256: string; bytes: number }
	entry: CorpusResult["entries"][number]
	certificate: NextPaletteCertificate
	structural: StructuralAssessment
	elapsedMs: number
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue)
	if (typeof value !== "object" || value === null) return value
	const record = value as Record<string, unknown>
	return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalValue(record[key])]))
}

function scientificExtraction(extraction: ExtractionResult): ExtractionResult {
	return { ...extraction, diagnostics: { ...extraction.diagnostics, processingMs: 0 } }
}

function passesSignedApca(lc: number, positiveMinimum: number, negativeMinimumMagnitude: number): boolean {
	return lc >= positiveMinimum || lc <= -negativeMinimumMagnitude
}

function assessStructural(
	palette: Palette,
	certificate: NextPaletteCertificate,
	nodes: ReturnType<typeof extractNextPaletteWithContext>["graph"]["nodes"],
	edgeCount: number,
	fieldNodeCount: number,
): StructuralAssessment {
	const violations: string[] = []
	const rejectionTotal = Object.values(certificate.hardConstraintRejections).reduce((sum, count) => sum + count, 0)
	const countsReconcile = certificate.counts.completeDomain === certificate.counts.attempted &&
		certificate.counts.feasible + rejectionTotal === certificate.counts.attempted &&
		certificate.counts.sourceForegroundFieldPairs + certificate.counts.fallbackForegroundFieldPairs ===
			certificate.counts.fieldPairs
	if (!countsReconcile) violations.push("tuple-count-reconciliation")

	const { apcaLc } = certificate.selected
	const signedApcaPass = passesSignedApca(
		apcaLc.foregroundOnBackground,
		certificate.policy.foregroundDarkOnLightMinimumLc,
		certificate.policy.foregroundLightOnDarkMinimumMagnitudeLc,
	) && passesSignedApca(
		apcaLc.foregroundOnSurface,
		certificate.policy.foregroundDarkOnLightMinimumLc,
		certificate.policy.foregroundLightOnDarkMinimumMagnitudeLc,
	) && passesSignedApca(
		apcaLc.accentOnBackground,
		certificate.policy.accentDarkOnLightMinimumLc,
		certificate.policy.accentLightOnDarkMinimumMagnitudeLc,
	) && passesSignedApca(
		apcaLc.accentOnSurface,
		certificate.policy.accentDarkOnLightMinimumLc,
		certificate.policy.accentLightOnDarkMinimumMagnitudeLc,
	)
	if (!signedApcaPass) violations.push("signed-apca")

	const nodeById = new Map(nodes.map((node) => [node.id, node]))
	let sourceProvenancePass = true
	for (const role of roleNames) {
		const candidateId = certificate.selected.candidateIds[role]
		if (typeof candidateId === "number") {
			const node = nodeById.get(candidateId)
			if (!node || node.hex !== palette[role].hex || palette[role].generated || palette[role].sourceDistance !== 0) {
				sourceProvenancePass = false
			}
		} else if ((role !== "foreground" && role !== "accent") || !palette[role].generated ||
			palette[role].hex !== (candidateId === "generated-black" ? "#000000" : "#ffffff")) {
			sourceProvenancePass = false
		}
	}
	if (typeof certificate.selected.candidateIds.accent !== "number" &&
		certificate.selected.candidateIds.accent !== certificate.selected.candidateIds.foreground) sourceProvenancePass = false
	if (!sourceProvenancePass) violations.push("source-provenance")

	const distinctColors = new Set(roleNames.map((role) => palette[role].hex)).size
	const cardinalityPass = distinctColors <= certificate.policy.maximumDistinctRoleColors
	if (!cardinalityPass) violations.push("cardinality")
	const graphCompletenessPass = edgeCount === nodes.length * (nodes.length - 1) &&
		certificate.counts.fieldPairs === fieldNodeCount ** 2
	if (!graphCompletenessPass) violations.push("graph-completeness")
	if (certificate.selected.objectives.length !== 6 || certificate.selected.objectives.some((objective) =>
		!Number.isFinite(objective) || objective < 0 || objective > 1)) violations.push("objective-vector")
	if ((certificate.selected.candidateIds.background === certificate.selected.candidateIds.surface) !==
		(certificate.selected.gradientState === "flat" && certificate.selected.fieldEdge === undefined)) {
		violations.push("field-gradient-coupling")
	}
	return {
		violations,
		countsReconcile,
		signedApcaPass,
		sourceProvenancePass,
		cardinalityPass,
		graphCompletenessPass,
	}
}

async function evaluateTask(task: Task): Promise<WorkerResult> {
	if (task.cohort === "development") {
		if (task.file !== basename(task.file) || task.sourcePath !== join(projectRoot, "images", task.file)) {
			throw new Error(`Invalid bound development source path: ${task.file}`)
		}
	} else if (!/^00\/[^/\\]+$/.test(task.file) || task.sourcePath !== join(projectRoot, task.file)) {
		throw new Error(`Invalid bound 00 source path: ${task.file}`)
	}
	const bytes = await readFile(task.sourcePath)
	const sourceSha256 = sha256(bytes)
	if (task.expectedSourceSha256 && task.expectedSourceSha256 !== sourceSha256) {
		throw new Error(`Bound source hash changed for ${task.file}`)
	}
	const image = await loadImage(bytes)
	if (image.width !== task.baseline.width || image.height !== task.baseline.height) {
		throw new Error(`Normalized source dimensions changed for ${task.file}`)
	}
	const canonical = extractPalette(image)
	if (!isDeepStrictEqual(scientificExtraction(canonical), scientificExtraction(task.baseline.extraction))) {
		throw new Error(`No-option canonical scientific output changed for ${task.file}`)
	}
	const started = performance.now()
	const next = extractNextPaletteWithContext(image)
	const elapsedMs = performance.now() - started
	const analysis = next.perception.analysis
	const extraction: ExtractionResult = {
		version: NEXT_PALETTE_ALGORITHM_VERSION,
		width: image.width,
		height: image.height,
		methods: {
			spatial: next.palette,
			expressive: task.baseline.extraction.methods.expressive,
			quantized: task.baseline.extraction.methods.quantized,
		},
		candidates: next.graph.nodes.map((node) => ({
			hex: node.hex,
			rgb: node.rgb,
			population: node.population,
			background: node.background,
			saliency: node.saliency,
			text: node.text,
			chroma: node.chroma,
		})),
		diagnostics: {
			regionCount: analysis.regions.length,
			candidateCount: next.graph.nodes.length,
			processingMs: 0,
		},
	}
	return {
		cohort: task.cohort,
		file: task.file,
		source: {
			path: task.cohort === "development" ? `images/${task.file}` : task.file,
			sha256: sourceSha256,
			bytes: bytes.byteLength,
		},
		entry: {
			file: task.file,
			kind: task.baseline.kind,
			review: task.baseline.review,
			width: task.baseline.width,
			height: task.baseline.height,
			extraction,
		},
		certificate: next.certificate,
		structural: assessStructural(
			next.palette,
			next.certificate,
			next.graph.nodes,
			next.graph.edges.length,
			next.graph.fieldNodeIds.length,
		),
		elapsedMs,
	}
}

async function runWorker(tasks: Task[]): Promise<WorkerResult[]> {
	const results: WorkerResult[] = []
	for (const task of tasks) {
		results.push(await evaluateTask(task))
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
					process.stderr.write(`next palette development evaluation: ${completed}/${tasks.length}\r`)
				}
			}
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Next palette worker exited with code ${code}`))
		})
	}))
	const results = (await Promise.all(workers)).flat()
	process.stderr.write(`next palette development evaluation: ${results.length}/${tasks.length}\n`)
	return results.sort((first, second) => first.cohort.localeCompare(second.cohort) || first.file.localeCompare(second.file))
}

function evidenceClassification(positive: boolean, negative: boolean): "accepted-evidence" | "rejected-evidence" | "conflicted" | "unknown" {
	if (positive && negative) return "conflicted"
	if (positive) return "accepted-evidence"
	if (negative) return "rejected-evidence"
	return "unknown"
}

function countBy<T extends string>(values: readonly T[]): Record<T, number> {
	const counts = {} as Record<T, number>
	for (const value of values) counts[value] = (counts[value] ?? 0) + 1
	return counts
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite existing next palette experiment: ${outputRoot}`)
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) throw new Error("evaluate-next-palette-development.ts does not accept arguments")
	await assertOutputAbsent()
	const inputEntries = await Promise.all(Object.entries(inputFiles).map(async ([name, path]) => {
		const raw = await readFile(join(projectRoot, path))
		return [name, { path, raw, sha256: sha256(raw) }] as const
	}))
	const inputs = Object.fromEntries(inputEntries) as Record<keyof typeof inputFiles, { path: string; raw: Buffer; sha256: string }>
	const parseInput = <T>(name: keyof typeof inputFiles): T => JSON.parse(inputs[name].raw.toString("utf8")) as T
	const baselineDevelopment = parseInput<CorpusResult>("canonicalDevelopment")
	const baseline00 = parseInput<CorpusResult>("canonical00")
	if (baselineDevelopment.algorithmVersion !== ALGORITHM_VERSION || baseline00.algorithmVersion !== ALGORITHM_VERSION ||
		baselineDevelopment.entries.length !== 37 || baseline00.entries.length !== 355) {
		throw new Error("Canonical 0.19 development corpus bindings are invalid")
	}
	const selection = parseInput<SelectionManifest>("selection")
	const curation = parseInput<CurationStore>("curation")
	validateSelectionManifest(selection, baseline00, inputs.canonical00.sha256)
	validateCurationStore(selection, curation)
	const sourceHashes = new Map<string, string>()
	for (const track of Object.values(selection.tracks)) {
		for (const source of track) {
			const current = sourceHashes.get(source.file)
			if (current && current !== source.sha256) throw new Error(`Selection hashes disagree for ${source.file}`)
			sourceHashes.set(source.file, source.sha256)
		}
	}
	if (baseline00.entries.some((entry) => !sourceHashes.has(entry.file))) {
		throw new Error("Selection does not bind every canonical 00 source")
	}
	const tasks: Task[] = [
		...baselineDevelopment.entries.map((baseline) => ({
			cohort: "development" as const,
			file: baseline.file,
			sourcePath: join(projectRoot, "images", baseline.file),
			expectedSourceSha256: null,
			baseline,
		})),
		...baseline00.entries.map((baseline) => ({
			cohort: "00" as const,
			file: baseline.file,
			sourcePath: join(projectRoot, baseline.file),
			expectedSourceSha256: sourceHashes.get(baseline.file)!,
			baseline,
		})),
	]
	const results = await runParallel(tasks)
	const generatedAt = new Date().toISOString()
	const developmentResults = results.filter((result) => result.cohort === "development")
	const results00 = results.filter((result) => result.cohort === "00")
	const candidateDevelopment: CorpusResult = {
		generatedAt,
		algorithmVersion: NEXT_PALETTE_ALGORITHM_VERSION,
		entries: developmentResults.map((result) => result.entry),
	}
	const candidate00: CorpusResult = {
		generatedAt,
		algorithmVersion: NEXT_PALETTE_ALGORITHM_VERSION,
		entries: results00.map((result) => result.entry),
	}
	const comparison = buildCandidateComparisonReport({
		baselineResults: baselineDevelopment,
		baselineHoldoutResults: baseline00,
		baselineHoldoutSource: inputs.canonical00.raw,
		candidateResults: candidateDevelopment,
		candidateHoldoutResults: candidate00,
		selection,
		curation,
		absoluteFeedback: parseInput("absoluteFeedback"),
	})
	const { ledger, report: evidenceReport } = await buildReviewEvidence()
	const semanticByPaletteId = new Map(ledger.palettes.map((snapshot) => [snapshot.paletteId, snapshot.semantic]))
	const baselineByFile = new Map([...baselineDevelopment.entries, ...baseline00.entries].map((entry) => [entry.file, entry]))
	const resultByFile = new Map(results.map((result) => [result.file, result]))
	const reviewedFrontier = evidenceReport.artworks.flatMap((artwork) => {
		const baseline = baselineByFile.get(artwork.file)
		const result = resultByFile.get(artwork.file)
		if (!baseline || !result) throw new Error(`Reviewed evidence source is absent from evaluation: ${artwork.file}`)
		const baselinePalette = baseline.extraction.methods.spatial
		const candidatePalette = result.entry.extraction.methods.spatial
		const delta = compareSpatialPalettes(baselinePalette, candidatePalette)
		if (!delta.changed) return []
		const candidateSnapshot = paletteSnapshot({
			file: artwork.file,
			algorithmVersion: NEXT_PALETTE_ALGORITHM_VERSION,
			method: "spatial",
			palette: candidatePalette,
		})
		const semantics = (ids: readonly PaletteId[]): SemanticPalette[] => ids.flatMap((id) => {
			const semantic = semanticByPaletteId.get(id)
			return semantic ? [semantic] : []
		})
		const positive = matchAcceptedSet(candidateSnapshot.semantic, semantics(artwork.acceptedPaletteIds))
		const negative = matchAcceptedSet(candidateSnapshot.semantic, semantics(artwork.negativePaletteIds))
		const changedRoles = roleNames.filter((role) => delta.roles[role].changed)
		const maximumRoleDistance = Math.max(...roleNames.map((role) => delta.roles[role].distance))
		return [{
			artworkId: artwork.artworkId,
			file: artwork.file,
			cohort: artwork.cohort,
			currentEvidenceClassification: artwork.currentClassification,
			candidateEvidenceClassification: evidenceClassification(positive.accepted, negative.accepted),
			candidateAcceptedMatches: positive.matches,
			candidateNegativeMatches: negative.matches,
			baselinePaletteId: artwork.currentPaletteId,
			candidatePaletteId: candidateSnapshot.paletteId,
			changedRoles,
			gradientChanged: delta.gradient.changed,
			maximumRoleDistance,
			delta,
			baseline: baselinePalette,
			candidate: candidatePalette,
			candidateSelection: result.certificate.selected,
			source: result.source,
		}]
	}).sort((first, second) => {
		const classificationPriority = (value: string): number =>
			value === "rejected-evidence" ? 0 : value === "conflicted" ? 1 : value === "unknown" ? 2 : 3
		return classificationPriority(first.candidateEvidenceClassification) -
			classificationPriority(second.candidateEvidenceClassification) ||
			Number(second.gradientChanged) - Number(first.gradientChanged) ||
			second.changedRoles.length - first.changedRoles.length ||
			second.maximumRoleDistance - first.maximumRoleDistance || first.file.localeCompare(second.file)
	})

	const allChanges = results.map((result) => {
		const baseline = baselineByFile.get(result.file)!.extraction.methods.spatial
		const candidate = result.entry.extraction.methods.spatial
		const delta = compareSpatialPalettes(baseline, candidate)
		return {
			cohort: result.cohort,
			file: result.file,
			changed: delta.changed,
			changedRoles: roleNames.filter((role) => delta.roles[role].changed),
			gradientChanged: delta.gradient.changed,
			foregroundGenerated: candidate.foreground.generated,
			accentCollapsed: candidate.accent.hex === candidate.foreground.hex,
			surfaceCollapsed: candidate.surface.hex === candidate.background.hex,
		}
	})
	const structuralViolations = results.filter((result) => result.structural.violations.length > 0)
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (path) =>
		[path, sha256(await readFile(join(projectRoot, path)))] as const)))
	const reviewEvidenceInputs = Object.fromEntries(await Promise.all(reviewEvidenceInputPaths.map(async (path) => {
		const raw = await readFile(join(researchRoot, path))
		return [path, sha256(raw)] as const
	})))
	const protocol = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		candidateAlgorithmVersion: NEXT_PALETTE_ALGORITHM_VERSION,
		baselineAlgorithmVersion: ALGORITHM_VERSION,
		authorization: {
			developmentOnly: true,
			allowedSourceRoots: ["images", "00"],
			outputUnseenRootsOpened: [] as string[],
			canonicalPromotionAuthorized: false,
		},
		coverage: { development: 37, canonical00: 355, reviewedDevelopment: 35, reviewed00: 100 },
		materialChangeRule: "any role OKLab distance > 0.025 or gradient decision differs",
		evidencePolicy: {
			positiveJudgmentsAreNonExclusive: true,
			negativeAndConflictedMatchesRemainReviewable: true,
			unknownMatchesRemainReviewable: true,
			targetColorsInferred: false,
		},
		stoppingRules: {
			structuralViolationsMustEqual: 0,
			allChangedReviewedCasesRequireHumanReview: true,
			candidateMustRemainUnfrozen: true,
		},
	}
	const identity = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		candidateIdentity: NEXT_PALETTE_IDENTITY,
		policy: NEXT_PALETTE_DEVELOPMENT_POLICY,
		protocol,
		inputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, {
			path: input.path,
			sha256: input.sha256,
		}])),
		reviewEvidenceInputs,
		sources: results.map((result) => ({ cohort: result.cohort, ...result.source })),
		implementation,
	}
	const experimentId = sha256(JSON.stringify(canonicalValue(identity)))
	const changed = allChanges.filter((entry) => entry.changed)
	const analysis = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		experimentId,
		generatedAt,
		structural: {
			pass: structuralViolations.length === 0,
			violationCount: structuralViolations.length,
			violations: structuralViolations.map((result) => ({
				cohort: result.cohort,
				file: result.file,
				violations: result.structural.violations,
			})),
		},
		performance: {
			meanMs: results.reduce((sum, result) => sum + result.elapsedMs, 0) / results.length,
			maximumMs: Math.max(...results.map((result) => result.elapsedMs)),
			totalWorkerMs: results.reduce((sum, result) => sum + result.elapsedMs, 0),
		},
		materialChanges: {
			total: changed.length,
			development: changed.filter((entry) => entry.cohort === "development").length,
			canonical00: changed.filter((entry) => entry.cohort === "00").length,
			roleCounts: Object.fromEntries(roleNames.map((role) => [role,
				changed.filter((entry) => entry.changedRoles.includes(role)).length])),
			gradient: changed.filter((entry) => entry.gradientChanged).length,
			foregroundGenerated: changed.filter((entry) => entry.foregroundGenerated).length,
			accentCollapsed: changed.filter((entry) => entry.accentCollapsed).length,
			surfaceCollapsed: changed.filter((entry) => entry.surfaceCollapsed).length,
		},
		frozenReviewCohorts: {
			coverage: comparison.coverage,
			accepted: { total: comparison.accepted.total, changedCount: comparison.accepted.changedCount },
			rejected: { total: comparison.rejected.total, changedCount: comparison.rejected.changedCount },
			unselected00: { total: comparison.unselectedHoldout.total, changedCount: comparison.unselectedHoldout.changedCount },
			development: {
				reviewable: { total: comparison.legacyResearch.reviewable.total,
					changedCount: comparison.legacyResearch.reviewable.changedCount },
				diagnostics: { total: comparison.legacyResearch.diagnostics.total,
					changedCount: comparison.legacyResearch.diagnostics.changedCount },
			},
		},
		reviewFrontier: {
			total: reviewedFrontier.length,
			byCohort: countBy(reviewedFrontier.map((entry) => entry.cohort)),
			byEvidenceClassification: countBy(reviewedFrontier.map((entry) => entry.candidateEvidenceClassification)),
			reviewRequired: reviewedFrontier.length > 0,
		},
		limitations: [
			"Evaluation is restricted to the bound 37 development and 355 canonical 00 entries.",
			"No source under 10 through 14 was decoded, extracted, rendered, or reviewed.",
			"Existing judgments classify complete visible palettes and do not authorize target colors or inference mechanisms.",
			"Candidate evidence matches do not replace review of the complete changed development set.",
		],
	}
	const manifest = { ...identity, experimentId, generatedAt }
	const certificates = {
		schemaVersion: 1,
		experimentId,
		algorithmVersion: NEXT_PALETTE_ALGORITHM_VERSION,
		development: Object.fromEntries(developmentResults.map((result) => [result.file, result.certificate])),
		canonical00: Object.fromEntries(results00.map((result) => [result.file, result.certificate])),
	}
	const frontier = {
		schemaVersion: 1,
		experimentId,
		algorithmVersion: NEXT_PALETTE_ALGORITHM_VERSION,
		thresholdVersion: ledger.thresholdVersion,
		entries: reviewedFrontier,
	}

	await mkdir(outputRoot)
	await Promise.all([
		writeExclusive(join(outputRoot, "protocol.json"), protocol),
		writeExclusive(join(outputRoot, "manifest.json"), manifest),
		writeExclusive(join(outputRoot, "baseline-results.json"), baselineDevelopment),
		writeExclusive(join(outputRoot, "baseline-00-results.json"), baseline00),
		writeExclusive(join(outputRoot, "candidate-results.json"), candidateDevelopment),
		writeExclusive(join(outputRoot, "candidate-00-results.json"), candidate00),
		writeExclusive(join(outputRoot, "candidate-certificates.json"), certificates),
		writeExclusive(join(outputRoot, "frontier.json"), frontier),
		writeExclusive(join(outputRoot, "analysis.json"), analysis),
	])
	process.stderr.write(`Wrote next palette development experiment ${experimentId} to ${outputRoot}\n`)
}

if (!isMainThread) {
	runWorker(workerData as Task[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => {
		throw error
	})
} else {
	await main()
}
