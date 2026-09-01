import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import { compareSpatialPalettes, roleNames } from "./src/candidate-comparison.ts"
import { loadImage } from "./src/image.ts"
import {
	extractNextPaletteFieldPairWithContext,
	NEXT_PALETTE_FIELD_PAIR_ALGORITHM_VERSION,
	NEXT_PALETTE_FIELD_PAIR_IDENTITY,
	orderedFieldPairSupport,
	type NextPaletteFieldPairCertificate,
} from "./src/next-palette-field-pair.ts"
import { NEXT_PALETTE_DEVELOPMENT_POLICY, type NextPaletteHardConstraintRejections } from "./src/next-palette.ts"
import type { CorpusResult, Palette } from "./src/types.ts"

const EXPERIMENT_VERSION = "next-palette-0.2.0-field-pair-development"
const PREVIOUS_EXPERIMENT_ID = "883e547342ea726d4ba914b2405c5ec92b9489f2efd152d0d68ae2b6361389d1"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const previousRoot = join(researchRoot, "data/experiments/next-palette-0.1.0-development")
const outputRoot = join(researchRoot, "data/experiments", EXPERIMENT_VERSION)
const inputFiles = {
	previousManifest: "research/data/experiments/next-palette-0.1.0-development/manifest.json",
	previousDevelopment: "research/data/experiments/next-palette-0.1.0-development/candidate-results.json",
	previous00: "research/data/experiments/next-palette-0.1.0-development/candidate-00-results.json",
	previousCertificates: "research/data/experiments/next-palette-0.1.0-development/candidate-certificates.json",
	baselineDevelopment: "research/data/results.json",
	baseline00: "research/data/holdout-results.json",
	reviewBatch01: "research/data/experiments/next-palette-0.1.0-development/review-v2/batch-01-analysis.json",
	reviewBatch02: "research/data/experiments/next-palette-0.1.0-development/review-v2/batch-02-analysis.json",
	commentDiagnostics: "research/data/experiments/next-palette-0.1.0-development/review-v2/comment-case-diagnostics-batches-01-02.json",
	technicalAttribution: "research/data/experiments/next-palette-0.1.0-development/review-v2/technical-attribution-batches-01-02.json",
} as const
const implementationFiles = [
	"package.json",
	"pnpm-lock.yaml",
	"research/NEXT_PALETTE_ARCHITECTURE.md",
	"research/NEXT_PALETTE_FIELD_PAIR_HYPOTHESIS.md",
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
	"research/src/next-palette-field-pair.ts",
	"research/src/candidate-comparison.ts",
	"research/evaluate-next-palette-field-pair-development.ts",
] as const

type Cohort = "development" | "00"
type Counts = NextPaletteFieldPairCertificate["counts"]
type Task = {
	cohort: Cohort
	file: string
	sourcePath: string
	expectedSourceSha256: string
	width: number
	height: number
	baseline: Palette
	previous: Palette
	previousCounts: Counts
	previousRejections: NextPaletteHardConstraintRejections
}
type WorkerResult = {
	cohort: Cohort
	file: string
	source: { path: string; sha256: string; bytes: number }
	palette: Palette
	certificate: NextPaletteFieldPairCertificate
	structural: {
		violations: string[]
		countsEqualPrevious: boolean
		rejectionsEqualPrevious: boolean
		selectedPairSupport: number | null
	}
	comparison: {
		fromBaseline: ReturnType<typeof compareSpatialPalettes>
		fromPrevious: ReturnType<typeof compareSpatialPalettes>
	}
	elapsedMs: number
}
type PreviousManifest = {
	experimentId: string
	sources: Array<{ cohort: Cohort; path: string; sha256: string; bytes: number }>
}
type PreviousCertificates = {
	experimentId: string
	development: Record<string, { counts: Counts; hardConstraintRejections: NextPaletteHardConstraintRejections }>
	canonical00: Record<string, { counts: Counts; hardConstraintRejections: NextPaletteHardConstraintRejections }>
}
type ReviewQuality = "strong" | "acceptable-not-ideal" | "weak-fallback" | "unacceptable"
type ReviewEntry = {
	caseId: string
	file: string
	sourceEligibility: "eligible-artwork" | "ineligible-artwork"
	baselineQuality?: ReviewQuality
	candidateQuality?: ReviewQuality
}
type ReviewAnalysis = {
	experimentId: string
	entries: ReviewEntry[]
}
type CommentDiagnostics = {
	experimentId: string
	entries: Array<{
		file: string
		selected: { roles: { background: { hex: string }; surface: { hex: string } } }
		domain: { feasibleDistinctSurfaceCandidateIdsForSelectedTuple: number[] }
	}>
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

function semanticKey(palette: Palette): string {
	return JSON.stringify({
		roles: roleNames.map((role) => [role, palette[role].rgb, palette[role].generated]),
		gradient: palette.gradient.isGradient,
	})
}

function reviewFile(cohort: Cohort, file: string): string {
	return cohort === "development" ? `images/${file}` : file
}

function passesSignedApca(lc: number, positiveMinimum: number, negativeMinimumMagnitude: number): boolean {
	return lc >= positiveMinimum || lc <= -negativeMinimumMagnitude
}

function assessStructural(
	result: ReturnType<typeof extractNextPaletteFieldPairWithContext>,
	previousCounts: Counts,
	previousRejections: NextPaletteHardConstraintRejections,
): WorkerResult["structural"] {
	const { certificate, graph, palette } = result
	const violations: string[] = []
	const rejectionTotal = Object.values(certificate.hardConstraintRejections).reduce((sum, count) => sum + count, 0)
	if (certificate.counts.completeDomain !== certificate.counts.attempted ||
		certificate.counts.feasible + rejectionTotal !== certificate.counts.attempted ||
		certificate.counts.sourceForegroundFieldPairs + certificate.counts.fallbackForegroundFieldPairs !==
			certificate.counts.fieldPairs) violations.push("tuple-count-reconciliation")
	const countsEqualPrevious = isDeepStrictEqual(certificate.counts, previousCounts)
	const rejectionsEqualPrevious = isDeepStrictEqual(certificate.hardConstraintRejections, previousRejections)
	if (!countsEqualPrevious) violations.push("tuple-count-change-from-0.1.0")
	if (!rejectionsEqualPrevious) violations.push("hard-constraint-change-from-0.1.0")
	const { apcaLc } = certificate.selected
	if (!passesSignedApca(
		apcaLc.foregroundOnBackground,
		certificate.policy.foregroundDarkOnLightMinimumLc,
		certificate.policy.foregroundLightOnDarkMinimumMagnitudeLc,
	) || !passesSignedApca(
		apcaLc.foregroundOnSurface,
		certificate.policy.foregroundDarkOnLightMinimumLc,
		certificate.policy.foregroundLightOnDarkMinimumMagnitudeLc,
	) || !passesSignedApca(
		apcaLc.accentOnBackground,
		certificate.policy.accentDarkOnLightMinimumLc,
		certificate.policy.accentLightOnDarkMinimumMagnitudeLc,
	) || !passesSignedApca(
		apcaLc.accentOnSurface,
		certificate.policy.accentDarkOnLightMinimumLc,
		certificate.policy.accentLightOnDarkMinimumMagnitudeLc,
	)) violations.push("signed-apca")
	const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
	for (const role of roleNames) {
		const candidateId = certificate.selected.candidateIds[role]
		if (typeof candidateId === "number") {
			const node = nodeById.get(candidateId)
			if (!node || node.hex !== palette[role].hex || palette[role].generated || palette[role].sourceDistance !== 0) {
				violations.push(`source-provenance:${role}`)
			}
		} else if ((role !== "foreground" && role !== "accent") || !palette[role].generated ||
			palette[role].hex !== (candidateId === "generated-black" ? "#000000" : "#ffffff")) {
			violations.push(`generated-provenance:${role}`)
		}
	}
	if (typeof certificate.selected.candidateIds.accent !== "number" &&
		certificate.selected.candidateIds.accent !== certificate.selected.candidateIds.foreground) {
		violations.push("generated-accent-not-foreground-collapse")
	}
	if (new Set(roleNames.map((role) => palette[role].hex)).size > certificate.policy.maximumDistinctRoleColors) {
		violations.push("cardinality")
	}
	if (graph.edges.length !== graph.nodes.length * (graph.nodes.length - 1) ||
		certificate.counts.fieldPairs !== graph.fieldNodeIds.length ** 2) violations.push("graph-completeness")
	const collapsed = certificate.selected.candidateIds.background === certificate.selected.candidateIds.surface
	if (collapsed !== (certificate.selected.gradientState === "flat" && certificate.selected.fieldEdge === undefined)) {
		violations.push("field-gradient-coupling")
	}
	const selectedPairSupport = certificate.selected.fieldEdge
		? orderedFieldPairSupport(certificate.selected.fieldEdge)
		: null
	if (selectedPairSupport !== null && certificate.selected.objectives[2] !== selectedPairSupport) {
		violations.push("ordered-field-pair-objective")
	}
	if (selectedPairSupport !== null && selectedPairSupport < 0.5) violations.push("selected-pair-support-below-0.5")
	const deficits = certificate.selected.objectives.map((objective) => 1 - objective)
	if (certificate.selected.maximumDeficit !== Math.max(...deficits) ||
		certificate.selected.totalDeficit !== deficits.reduce((sum, deficit) => sum + deficit, 0)) {
		violations.push("minimax-arithmetic")
	}
	return { violations, countsEqualPrevious, rejectionsEqualPrevious, selectedPairSupport }
}

async function evaluateTask(task: Task): Promise<WorkerResult> {
	if (task.sourcePath !== join(projectRoot, task.file) || !/^(?:images|00)\/[^/\\]+$/.test(task.file)) {
		throw new Error(`Invalid bound source path: ${task.file}`)
	}
	const bytes = await readFile(task.sourcePath)
	const sourceSha256 = sha256(bytes)
	if (sourceSha256 !== task.expectedSourceSha256) throw new Error(`Bound source hash changed for ${task.file}`)
	const image = await loadImage(bytes)
	if (image.width !== task.width || image.height !== task.height) throw new Error(`Normalized dimensions changed for ${task.file}`)
	const started = performance.now()
	const next = extractNextPaletteFieldPairWithContext(image)
	const elapsedMs = performance.now() - started
	return {
		cohort: task.cohort,
		file: task.file,
		source: { path: task.file, sha256: sourceSha256, bytes: bytes.byteLength },
		palette: next.palette,
		certificate: next.certificate,
		structural: assessStructural(next, task.previousCounts, task.previousRejections),
		comparison: {
			fromBaseline: compareSpatialPalettes(task.baseline, next.palette),
			fromPrevious: compareSpatialPalettes(task.previous, next.palette),
		},
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
					process.stderr.write(`next palette field-pair evaluation: ${completed}/${tasks.length}\r`)
				}
			}
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Next palette field-pair worker exited with code ${code}`))
		})
	}))
	const results = (await Promise.all(workers)).flat()
	process.stderr.write(`next palette field-pair evaluation: ${results.length}/${tasks.length}\n`)
	return results.sort((first, second) => first.cohort.localeCompare(second.cohort) || first.file.localeCompare(second.file))
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite existing field-pair experiment: ${outputRoot}`)
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

function positiveQuality(value: ReviewQuality): boolean {
	return value === "strong" || value === "acceptable-not-ideal"
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) {
		throw new Error("evaluate-next-palette-field-pair-development.ts does not accept arguments")
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
	const parseInput = <T>(name: keyof typeof inputFiles): T => JSON.parse(inputs[name].raw.toString("utf8")) as T
	const previousManifest = parseInput<PreviousManifest>("previousManifest")
	const previousDevelopment = parseInput<CorpusResult>("previousDevelopment")
	const previous00 = parseInput<CorpusResult>("previous00")
	const previousCertificates = parseInput<PreviousCertificates>("previousCertificates")
	const baselineDevelopment = parseInput<CorpusResult>("baselineDevelopment")
	const baseline00 = parseInput<CorpusResult>("baseline00")
	const reviewAnalyses = [parseInput<ReviewAnalysis>("reviewBatch01"), parseInput<ReviewAnalysis>("reviewBatch02")]
	const commentDiagnostics = parseInput<CommentDiagnostics>("commentDiagnostics")
	if (previousManifest.experimentId !== PREVIOUS_EXPERIMENT_ID ||
		previousCertificates.experimentId !== PREVIOUS_EXPERIMENT_ID ||
		reviewAnalyses.some((review) => review.experimentId !== PREVIOUS_EXPERIMENT_ID) ||
		commentDiagnostics.experimentId !== PREVIOUS_EXPERIMENT_ID) {
		throw new Error("Previous experiment bindings disagree")
	}
	if (previousManifest.sources.length !== 392 || previousDevelopment.entries.length !== 37 ||
		previous00.entries.length !== 355 || baselineDevelopment.entries.length !== 37 || baseline00.entries.length !== 355) {
		throw new Error("Previous development matrix is incomplete")
	}
	const baselineByFile = new Map([
		...baselineDevelopment.entries.map((entry) => [`images/${entry.file}`, entry] as const),
		...baseline00.entries.map((entry) => [entry.file, entry] as const),
	])
	const previousByFile = new Map([
		...previousDevelopment.entries.map((entry) => [`images/${entry.file}`, entry] as const),
		...previous00.entries.map((entry) => [entry.file, entry] as const),
	])
	const tasks = previousManifest.sources.map((source): Task => {
		const baseline = baselineByFile.get(source.path)
		const previous = previousByFile.get(source.path)
		const certificateKey = source.cohort === "development" ? source.path.slice("images/".length) : source.path
		const previousCertificate = source.cohort === "development"
			? previousCertificates.development[certificateKey]
			: previousCertificates.canonical00[certificateKey]
		if (!baseline || !previous || !previousCertificate) throw new Error(`Missing previous evidence for ${source.path}`)
		return {
			cohort: source.cohort,
			file: source.path,
			sourcePath: join(projectRoot, source.path),
			expectedSourceSha256: source.sha256,
			width: baseline.width,
			height: baseline.height,
			baseline: baseline.extraction.methods.spatial,
			previous: previous.extraction.methods.spatial,
			previousCounts: previousCertificate.counts,
			previousRejections: previousCertificate.hardConstraintRejections,
		}
	})
	const results = await runParallel(tasks)
	const resultByFile = new Map(results.map((result) => [result.file, result]))
	const primaryFiles = commentDiagnostics.entries.filter((entry) =>
		entry.selected.roles.background.hex === entry.selected.roles.surface.hex &&
		entry.domain.feasibleDistinctSurfaceCandidateIdsForSelectedTuple.length > 0).map((entry) => entry.file)
	if (primaryFiles.length !== 15 || new Set(primaryFiles).size !== 15) {
		throw new Error(`Expected 15 unique feasible-collapse comment cases, found ${primaryFiles.length}`)
	}
	const primaryCohort = primaryFiles.map((file) => {
		const result = resultByFile.get(file)
		if (!result) throw new Error(`Primary technical case is outside the matrix: ${file}`)
		return {
			file,
			selectedDistinctSurface: result.palette.background.hex !== result.palette.surface.hex,
			selectedPairSupport: result.structural.selectedPairSupport,
			palette: result.palette,
		}
	})
	const reviewEntries = reviewAnalyses.flatMap((analysis) => analysis.entries)
	if (reviewEntries.length !== 80 || new Set(reviewEntries.map((entry) => entry.caseId)).size !== 80) {
		throw new Error("Expected 80 unique prior review submissions")
	}
	const reviewReuse = reviewEntries.map((entry) => {
		if (entry.sourceEligibility !== "eligible-artwork") {
			return { caseId: entry.caseId, file: entry.file, eligibility: entry.sourceEligibility, transfer: "ineligible" as const }
		}
		if (!entry.baselineQuality || !entry.candidateQuality) throw new Error(`Eligible review lacks quality: ${entry.caseId}`)
		const result = resultByFile.get(entry.file)
		const baseline = baselineByFile.get(entry.file)
		const previous = previousByFile.get(entry.file)
		if (!result || !baseline || !previous) throw new Error(`Reviewed case is outside the matrix: ${entry.file}`)
		const nextKey = semanticKey(result.palette)
		const baselineMatch = nextKey === semanticKey(baseline.extraction.methods.spatial)
		const previousMatch = nextKey === semanticKey(previous.extraction.methods.spatial)
		const transfer = previousMatch ? "previous-candidate" : baselineMatch ? "baseline" : "novel"
		const previousPositive = positiveQuality(entry.candidateQuality)
		const transferredQuality = transfer === "previous-candidate"
			? entry.candidateQuality
			: transfer === "baseline" ? entry.baselineQuality : null
		const transferredPositive = transferredQuality ? positiveQuality(transferredQuality) : null
		return {
			caseId: entry.caseId,
			file: entry.file,
			eligibility: entry.sourceEligibility,
			transfer,
			baselineQuality: entry.baselineQuality,
			previousCandidateQuality: entry.candidateQuality,
			transferredQuality,
			knownImprovement: transferredPositive === true && !previousPositive,
			knownRegression: transferredPositive === false && previousPositive,
		}
	})
	const structuralViolations = results.filter((result) => result.structural.violations.length > 0)
	const recoveredPrimary = primaryCohort.filter((entry) => entry.selectedDistinctSurface).length
	const knownImprovements = reviewReuse.filter((entry) => "knownImprovement" in entry && entry.knownImprovement).length
	const knownRegressions = reviewReuse.filter((entry) => "knownRegression" in entry && entry.knownRegression).length
	const protocol = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		candidateAlgorithmVersion: NEXT_PALETTE_FIELD_PAIR_ALGORITHM_VERSION,
		previousCandidateAlgorithmVersion: previousDevelopment.algorithmVersion,
		authorization: {
			developmentOnly: true,
			allowedSourceRoots: ["images", "00"],
			outputUnseenRootsOpened: [] as string[],
			newHumanReviewAuthorized: false,
			canonicalPromotionAuthorized: false,
		},
		singleChange: "Replace standalone surface-node support with directed ordered field-pair support.",
		stoppingRules: {
			structuralViolationsMustEqual: 0,
			primaryFeasibleCollapseCases: 15,
			minimumPrimaryDistinctSurfaceSelections: 8,
			minimumSelectedDistinctPairSupport: 0.5,
			knownRegressionsMayNotExceedKnownImprovements: true,
			priorReviewTransfersOnlyOnExactCompletePaletteMatch: true,
		},
	}
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (path) =>
		[path, sha256(await readFile(join(projectRoot, path)))] as const)))
	const identity = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		candidateIdentity: NEXT_PALETTE_FIELD_PAIR_IDENTITY,
		policy: NEXT_PALETTE_DEVELOPMENT_POLICY,
		protocol,
		inputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, {
			path: input.path,
			sha256: input.sha256,
		}])),
		sources: results.map((result) => ({ cohort: result.cohort, ...result.source })),
		implementation,
	}
	const experimentId = sha256(JSON.stringify(canonicalValue(identity)))
	const generatedAt = new Date().toISOString()
	const analysis = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		experimentId,
		generatedAt,
		structural: {
			pass: structuralViolations.length === 0,
			violationCount: structuralViolations.reduce((sum, result) => sum + result.structural.violations.length, 0),
			caseCount: structuralViolations.length,
			violations: structuralViolations.map((result) => ({ file: result.file, violations: result.structural.violations })),
		},
		matrix: {
			total: results.length,
			countsEqualPrevious: results.filter((result) => result.structural.countsEqualPrevious).length,
			rejectionsEqualPrevious: results.filter((result) => result.structural.rejectionsEqualPrevious).length,
			changedFromPrevious: results.filter((result) => result.comparison.fromPrevious.changed).length,
			changedFromBaseline: results.filter((result) => result.comparison.fromBaseline.changed).length,
			previousSurfaceCollapsed: tasks.filter((task) => task.previous.background.hex === task.previous.surface.hex).length,
			successorSurfaceCollapsed: results.filter((result) => result.palette.background.hex === result.palette.surface.hex).length,
			previousGradient: tasks.filter((task) => task.previous.gradient.isGradient).length,
			successorGradient: results.filter((result) => result.palette.gradient.isGradient).length,
		},
		primaryTechnicalCohort: {
			total: primaryCohort.length,
			recoveredDistinctSurface: recoveredPrimary,
			minimumRequired: 8,
			pass: recoveredPrimary >= 8,
			entries: primaryCohort,
		},
		reviewReuse: {
			submitted: reviewReuse.length,
			eligible: reviewReuse.filter((entry) => entry.transfer !== "ineligible").length,
			matchedPreviousCandidate: reviewReuse.filter((entry) => entry.transfer === "previous-candidate").length,
			matchedBaseline: reviewReuse.filter((entry) => entry.transfer === "baseline").length,
			novel: reviewReuse.filter((entry) => entry.transfer === "novel").length,
			knownImprovements,
			knownRegressions,
			pass: knownRegressions <= knownImprovements,
			entries: reviewReuse,
		},
		performance: {
			meanMs: results.reduce((sum, result) => sum + result.elapsedMs, 0) / results.length,
			maximumMs: Math.max(...results.map((result) => result.elapsedMs)),
			totalWorkerMs: results.reduce((sum, result) => sum + result.elapsedMs, 0),
		},
		disposition: structuralViolations.length === 0 && recoveredPrimary >= 8 && knownRegressions <= knownImprovements
			? "technical-stops-pass-review-not-yet-authorized"
			: "development-rejected-no-review",
		limitations: [
			"Evaluation is restricted to the same bound 392 development sources used by the previous candidate.",
			"No source under 10 through 14 was decoded, extracted, rendered, or reviewed.",
			"Prior human judgments transfer only to exact complete semantic palette matches.",
			"Novel successor palettes remain unknown and receive no inferred quality label.",
		],
	}
	const manifest = { ...identity, experimentId, generatedAt }
	const resultArtifact = {
		schemaVersion: 1,
		experimentId,
		algorithmVersion: NEXT_PALETTE_FIELD_PAIR_ALGORITHM_VERSION,
		entries: results.map((result) => ({
			cohort: result.cohort,
			file: result.file,
			source: result.source,
			palette: result.palette,
			comparison: result.comparison,
		})),
	}
	const certificateArtifact = {
		schemaVersion: 1,
		experimentId,
		algorithmVersion: NEXT_PALETTE_FIELD_PAIR_ALGORITHM_VERSION,
		entries: Object.fromEntries(results.map((result) => [result.file, result.certificate])),
	}
	await mkdir(outputRoot)
	await Promise.all([
		writeExclusive(join(outputRoot, "protocol.json"), protocol),
		writeExclusive(join(outputRoot, "manifest.json"), manifest),
		writeExclusive(join(outputRoot, "analysis.json"), analysis),
		writeExclusive(join(outputRoot, "results.json"), resultArtifact),
		writeExclusive(join(outputRoot, "certificates.json"), certificateArtifact),
	])
	process.stderr.write(`Wrote next palette field-pair experiment ${experimentId} to ${outputRoot}\n`)
}

if (!isMainThread) {
	runWorker(workerData as Task[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => {
		throw error
	})
} else {
	await main()
}
