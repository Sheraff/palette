import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import { compareSpatialPalettes, roleNames } from "./src/candidate-comparison.ts"
import { loadImage } from "./src/image.ts"
import {
	extractNextPaletteRelationWithContext,
	NEXT_PALETTE_RELATION_ALGORITHM_VERSION,
	NEXT_PALETTE_RELATION_DEVELOPMENT_POLICY,
	NEXT_PALETTE_RELATION_IDENTITY,
	type NextPaletteRelationCertificate,
} from "./src/next-palette-relation.ts"
import type { CorpusResult, Palette } from "./src/types.ts"

const EXPERIMENT_VERSION = "next-palette-0.3.0-relation-development"
const PREVIOUS_EXPERIMENT_ID = "5eb15868f6a62920c593ce13eb885aead916be66c47d6da81646f45d3e36e2c6"
const PREDECESSOR_EXPERIMENT_ID = "883e547342ea726d4ba914b2405c5ec92b9489f2efd152d0d68ae2b6361389d1"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const outputRoot = join(researchRoot, "data/experiments", EXPERIMENT_VERSION)
const inputFiles = {
	previousManifest: "research/data/experiments/next-palette-0.2.0-field-pair-development/manifest.json",
	previousResults: "research/data/experiments/next-palette-0.2.0-field-pair-development/results.json",
	predecessorDevelopment: "research/data/experiments/next-palette-0.1.0-development/candidate-results.json",
	predecessor00: "research/data/experiments/next-palette-0.1.0-development/candidate-00-results.json",
	canonicalDevelopment: "research/data/results.json",
	canonical00: "research/data/holdout-results.json",
	review01Batch01: "research/data/experiments/next-palette-0.1.0-development/review-v2/batch-01-analysis.json",
	review01Batch02: "research/data/experiments/next-palette-0.1.0-development/review-v2/batch-02-analysis.json",
	review02Partial: "research/data/experiments/next-palette-0.2.0-field-pair-development/review-v1/batch-01-partial-analysis.json",
	commentDiagnostics01: "research/data/experiments/next-palette-0.1.0-development/review-v2/comment-case-diagnostics-batches-01-02.json",
	commentDiagnostics02: "research/data/experiments/next-palette-0.2.0-field-pair-development/review-v1/comment-case-diagnostics-partial-batch-01.json",
	technicalAttribution: "research/data/experiments/next-palette-0.1.0-development/review-v2/technical-attribution-batches-01-02.json",
} as const
const implementationFiles = [
	"package.json",
	"pnpm-lock.yaml",
	"research/NEXT_PALETTE_ARCHITECTURE.md",
	"research/NEXT_PALETTE_RELATION_ARCHITECTURE.md",
	"research/src/types.ts",
	"research/src/color.ts",
	"research/src/image.ts",
	"research/src/regions.ts",
	"research/src/candidates.ts",
	"research/src/gradient-field-topology.ts",
	"research/src/gradient-field-topology-model.ts",
	"research/src/palette-perception.ts",
	"research/src/palette-evidence-graph.ts",
	"research/src/field-relation.ts",
	"research/src/palette-relation-graph.ts",
	"research/src/next-palette-relation.ts",
	"research/src/candidate-comparison.ts",
	"research/evaluate-next-palette-relation-development.ts",
] as const

type Cohort = "development" | "00"
type SourceBinding = { cohort: Cohort; path: string; sha256: string; bytes: number }
type Task = {
	cohort: Cohort
	file: string
	expectedSourceSha256: string
	canonical: Palette
	predecessor: Palette
	previous: Palette
}
type Structural = {
	violations: string[]
	fieldNodeCount: number
	fieldState: NextPaletteRelationCertificate["selected"]["fieldState"]
	selectedRelationSupport: number | null
}
type WorkerResult = {
	cohort: Cohort
	file: string
	source: { path: string; sha256: string; bytes: number }
	palette: Palette
	certificate: NextPaletteRelationCertificate
	structural: Structural
	comparison: {
		fromCanonical: ReturnType<typeof compareSpatialPalettes>
		fromPredecessor: ReturnType<typeof compareSpatialPalettes>
		fromPrevious: ReturnType<typeof compareSpatialPalettes>
	}
	elapsedMs: number
}
type PreviousManifest = { experimentId: string; sources: SourceBinding[] }
type ResultArtifact = {
	experimentId: string
	entries: Array<{ cohort: Cohort; file: string; palette: Palette }>
}
type ReviewQuality = "strong" | "acceptable-not-ideal" | "weak-fallback" | "unacceptable"
type ReviewEntry = {
	caseId: string
	file: string
	sourceEligibility: "eligible-artwork" | "ineligible-artwork"
	baselineQuality?: ReviewQuality
	candidateQuality?: ReviewQuality
	note?: string
}
type ReviewAnalysis = { experimentId: string; entries: ReviewEntry[] }
type CommentDiagnostics01 = {
	experimentId: string
	entries: Array<{
		file: string
		selected: { roles: { background: { hex: string }; surface: { hex: string } } }
		domain: { feasibleDistinctSurfaceCandidateIdsForSelectedTuple: number[] }
	}>
}
type CommentDiagnostics02 = { experimentId: string; entries: Array<{ caseId: string; file: string; note: string }> }
type TechnicalAttribution = {
	experimentId: string
	identityOmissionAttribution: Array<{ file: string; attribution: string }>
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

function paletteMap(development: CorpusResult, canonical00: CorpusResult): Map<string, Palette> {
	return new Map([
		...development.entries.map((entry) => [`images/${entry.file}`, entry.extraction.methods.spatial] as const),
		...canonical00.entries.map((entry) => [entry.file, entry.extraction.methods.spatial] as const),
	])
}

function assessStructural(result: ReturnType<typeof extractNextPaletteRelationWithContext>): Structural {
	const { certificate, graph, palette } = result
	const violations: string[] = []
	const rejectionTotal = Object.values(certificate.hardConstraintRejections).reduce((sum, count) => sum + count, 0)
	if (certificate.counts.completeDomain !== certificate.counts.attempted ||
		certificate.counts.feasible + rejectionTotal !== certificate.counts.attempted ||
		certificate.counts.fieldPairsWithPassingSourceForeground +
			certificate.counts.fieldPairsWithGeneratedForegroundAuthorization !== certificate.counts.fieldPairs) {
		violations.push("tuple-count-reconciliation")
	}
	const fieldIds = new Set(graph.fieldNodeIds)
	if (certificate.counts.fieldPairs !== fieldIds.size ** 2 ||
		graph.edges.length !== graph.nodes.length * (graph.nodes.length - 1) ||
		graph.edges.filter((edge) => edge.fieldRelation).length !== fieldIds.size * (fieldIds.size - 1) ||
		graph.nodes.some((node) => fieldIds.has(node.id) !== node.fieldEligibility.eligible) ||
		graph.nodes.some((node) => fieldIds.has(node.id) && node.typographyOnly)) {
		violations.push("relation-graph-domain")
	}
	for (const [name, relation] of Object.entries(certificate.selected.apcaConstraints)) {
		const [overlay, field] = name.startsWith("foreground")
			? ["foreground", name.endsWith("Background") ? "background" : "surface"] as const
			: ["accent", name.endsWith("Background") ? "background" : "surface"] as const
		const required = (certificate.policy.requiredApcaRelations[overlay] as readonly string[]).includes(field)
		if (relation.required !== required || required && !relation.passesThreshold) violations.push(`consumer-apca:${name}`)
	}
	const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
	for (const role of roleNames) {
		const candidateId = certificate.selected.candidateIds[role]
		if (typeof candidateId === "number") {
			const node = nodeById.get(candidateId)
			if (!node || node.hex !== palette[role].hex || palette[role].generated || palette[role].sourceDistance !== 0 ||
				((role === "background" || role === "surface") && !fieldIds.has(candidateId))) {
				violations.push(`source-provenance:${role}`)
			}
		} else if ((role !== "foreground" && role !== "accent") || !palette[role].generated ||
			palette[role].hex !== (candidateId === "generated-black" ? "#000000" : "#ffffff")) {
			violations.push(`generated-provenance:${role}`)
		}
	}
	const { selected } = certificate
	if (typeof selected.candidateIds.foreground !== "number" && !selected.generatedColorAuthorization.foregroundFallback.authorized) {
		violations.push("unauthorized-generated-foreground")
	}
	if (typeof selected.candidateIds.accent !== "number" &&
		(!selected.generatedColorAuthorization.accentCollapse.authorized ||
			selected.candidateIds.accent !== selected.candidateIds.foreground)) {
		violations.push("unauthorized-generated-accent")
	}
	if (new Set(roleNames.map((role) => palette[role].hex)).size > certificate.policy.maximumDistinctRoleColors) {
		violations.push("cardinality")
	}
	const collapsed = selected.candidateIds.background === selected.candidateIds.surface
	let selectedRelationSupport: number | null = null
	if (selected.fieldState === "collapsed") {
		if (!collapsed || selected.fieldEdge || palette.gradient.isGradient) violations.push("collapsed-state-coupling")
	} else {
		const relation = selected.fieldEdge?.fieldRelation
		selectedRelationSupport = selected.fieldState === "gradient"
			? relation?.stateSupport.gradient ?? null
			: relation?.stateSupport.distinctFlat ?? null
		if (collapsed || !relation || selectedRelationSupport === null || selectedRelationSupport <= 0 ||
			selected.objectives[2] !== selectedRelationSupport ||
			palette.gradient.isGradient !== (selected.fieldState === "gradient")) {
			violations.push("distinct-state-coupling")
		}
	}
	const deficits = selected.objectives.map((objective) => 1 - objective)
	if (selected.maximumDeficit !== Math.max(...deficits) ||
		selected.totalDeficit !== deficits.reduce((sum, deficit) => sum + deficit, 0) ||
		palette.score !== 1 - selected.maximumDeficit) violations.push("minimax-arithmetic")
	return { violations: [...new Set(violations)], fieldNodeCount: fieldIds.size, fieldState: selected.fieldState, selectedRelationSupport }
}

async function evaluateTask(task: Task): Promise<WorkerResult> {
	if (!/^(?:images|00)\/[^/\\]+$/.test(task.file)) throw new Error(`Invalid bound source path: ${task.file}`)
	const bytes = await readFile(join(projectRoot, task.file))
	const sourceSha256 = sha256(bytes)
	if (sourceSha256 !== task.expectedSourceSha256) throw new Error(`Bound source hash changed for ${task.file}`)
	const image = await loadImage(bytes)
	const started = performance.now()
	const next = extractNextPaletteRelationWithContext(image)
	const elapsedMs = performance.now() - started
	return {
		cohort: task.cohort,
		file: task.file,
		source: { path: task.file, sha256: sourceSha256, bytes: bytes.byteLength },
		palette: next.palette,
		certificate: next.certificate,
		structural: assessStructural(next),
		comparison: {
			fromCanonical: compareSpatialPalettes(task.canonical, next.palette),
			fromPredecessor: compareSpatialPalettes(task.predecessor, next.palette),
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
					process.stderr.write(`next palette relation evaluation: ${completed}/${tasks.length}\r`)
				}
			}
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Next palette relation worker exited with code ${code}`))
		})
	}))
	const results = (await Promise.all(workers)).flat()
	process.stderr.write(`next palette relation evaluation: ${results.length}/${tasks.length}\n`)
	return results.sort((first, second) => first.cohort.localeCompare(second.cohort) || first.file.localeCompare(second.file))
}

function transferReview(
	review: string,
	entries: readonly ReviewEntry[],
	resultByFile: ReadonlyMap<string, WorkerResult>,
	baselineByFile: ReadonlyMap<string, Palette>,
	candidateByFile: ReadonlyMap<string, Palette>,
): unknown[] {
	return entries.map((entry) => {
		if (entry.sourceEligibility !== "eligible-artwork") {
			return { review, caseId: entry.caseId, file: entry.file, transfer: "ineligible" }
		}
		const result = resultByFile.get(entry.file)
		const baseline = baselineByFile.get(entry.file)
		const candidate = candidateByFile.get(entry.file)
		if (!result || !baseline || !candidate || !entry.baselineQuality || !entry.candidateQuality) {
			throw new Error(`Reviewed case lacks bound evidence: ${entry.caseId}`)
		}
		const key = semanticKey(result.palette)
		const transfer = key === semanticKey(candidate) ? "candidate" : key === semanticKey(baseline) ? "baseline" : "novel"
		return {
			review,
			caseId: entry.caseId,
			file: entry.file,
			transfer,
			transferredQuality: transfer === "candidate" ? entry.candidateQuality : transfer === "baseline" ? entry.baselineQuality : null,
		}
	})
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite existing relation experiment: ${outputRoot}`)
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) throw new Error("evaluate-next-palette-relation-development.ts does not accept arguments")
	await assertOutputAbsent()
	const inputEntries = await Promise.all(Object.entries(inputFiles).map(async ([name, path]) => {
		const raw = await readFile(join(projectRoot, path))
		return [name, { path, raw, sha256: sha256(raw) }] as const
	}))
	const inputs = Object.fromEntries(inputEntries) as Record<keyof typeof inputFiles, { path: string; raw: Buffer; sha256: string }>
	const parseInput = <T>(name: keyof typeof inputFiles): T => JSON.parse(inputs[name].raw.toString("utf8")) as T
	const previousManifest = parseInput<PreviousManifest>("previousManifest")
	const previousResults = parseInput<ResultArtifact>("previousResults")
	const predecessorDevelopment = parseInput<CorpusResult>("predecessorDevelopment")
	const predecessor00 = parseInput<CorpusResult>("predecessor00")
	const canonicalDevelopment = parseInput<CorpusResult>("canonicalDevelopment")
	const canonical00 = parseInput<CorpusResult>("canonical00")
	const review01 = [parseInput<ReviewAnalysis>("review01Batch01"), parseInput<ReviewAnalysis>("review01Batch02")]
	const review02 = parseInput<ReviewAnalysis>("review02Partial")
	const comments01 = parseInput<CommentDiagnostics01>("commentDiagnostics01")
	const comments02 = parseInput<CommentDiagnostics02>("commentDiagnostics02")
	const technicalAttribution = parseInput<TechnicalAttribution>("technicalAttribution")
	if (previousManifest.experimentId !== PREVIOUS_EXPERIMENT_ID || previousResults.experimentId !== PREVIOUS_EXPERIMENT_ID ||
		review02.experimentId !== PREVIOUS_EXPERIMENT_ID || comments02.experimentId !== PREVIOUS_EXPERIMENT_ID ||
		review01.some((review) => review.experimentId !== PREDECESSOR_EXPERIMENT_ID) ||
		comments01.experimentId !== PREDECESSOR_EXPERIMENT_ID || technicalAttribution.experimentId !== PREDECESSOR_EXPERIMENT_ID) {
		throw new Error("Prior experiment bindings disagree")
	}
	if (previousManifest.sources.length !== 392 || previousResults.entries.length !== 392 ||
		review01.flatMap((review) => review.entries).length !== 80 || review02.entries.length !== 24 || comments02.entries.length !== 9) {
		throw new Error("Prior development evidence is incomplete")
	}
	const canonicalByFile = paletteMap(canonicalDevelopment, canonical00)
	const predecessorByFile = paletteMap(predecessorDevelopment, predecessor00)
	const previousByFile = new Map(previousResults.entries.map((entry) => [entry.file, entry.palette]))
	const tasks = previousManifest.sources.map((source): Task => {
		const canonical = canonicalByFile.get(source.path)
		const predecessor = predecessorByFile.get(source.path)
		const previous = previousByFile.get(source.path)
		if (!canonical || !predecessor || !previous) throw new Error(`Missing prior palette for ${source.path}`)
		return { cohort: source.cohort, file: source.path, expectedSourceSha256: source.sha256, canonical, predecessor, previous }
	})
	const results = await runParallel(tasks)
	const resultByFile = new Map(results.map((result) => [result.file, result]))
	const primaryFiles = comments01.entries.filter((entry) =>
		entry.selected.roles.background.hex === entry.selected.roles.surface.hex &&
		entry.domain.feasibleDistinctSurfaceCandidateIdsForSelectedTuple.length > 0).map((entry) => entry.file)
	if (primaryFiles.length !== 15 || new Set(primaryFiles).size !== 15) throw new Error("Primary collapse cohort binding changed")
	const primaryCohort = primaryFiles.map((file) => {
		const result = resultByFile.get(file)
		if (!result) throw new Error(`Primary case is outside matrix: ${file}`)
		return {
			file,
			fieldState: result.structural.fieldState,
			selectedDistinctSurface: result.palette.background.hex !== result.palette.surface.hex,
			selectedRelationSupport: result.structural.selectedRelationSupport,
			palette: result.palette,
		}
	})
	const commentCohort = comments02.entries.map((entry) => {
		const result = resultByFile.get(entry.file)
		if (!result) throw new Error(`Commented case is outside matrix: ${entry.file}`)
		return {
			caseId: entry.caseId,
			file: entry.file,
			note: entry.note,
			fieldNodeCount: result.structural.fieldNodeCount,
			fieldState: result.structural.fieldState,
			palette: result.palette,
			objectives: result.certificate.selected.objectives,
		}
	})
	const identityAvailabilityFiles = technicalAttribution.identityOmissionAttribution
		.filter((entry) => entry.attribution === "candidate-availability").map((entry) => entry.file)
	if (identityAvailabilityFiles.length !== 6) throw new Error("Identity availability cohort binding changed")
	const transferEntries = [
		...transferReview("0.1-review-v2", review01.flatMap((review) => review.entries), resultByFile, canonicalByFile, predecessorByFile),
		...transferReview("0.2-review-v1-partial", review02.entries, resultByFile, predecessorByFile, previousByFile),
	] as Array<{ transfer: string; transferredQuality?: ReviewQuality | null }>
	const structuralViolations = results.filter((result) => result.structural.violations.length > 0)
	const protocol = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		candidateAlgorithmVersion: NEXT_PALETTE_RELATION_ALGORITHM_VERSION,
		previousCandidateAlgorithmVersion: "region-graph-next-0.2.0-dev",
		authorization: {
			developmentOnly: true,
			allowedSourceRoots: ["images", "00"],
			outputUnseenRootsOpened: [] as string[],
			newHumanReviewAuthorized: false,
			canonicalPromotionAuthorized: false,
		},
		scope: "Replace field identity, field relation, field state, and consumer relation semantics while retaining the frozen candidate shortlist.",
		stoppingRules: {
			structuralViolationsMustEqual: 0,
			priorJudgmentsTransferOnlyOnExactCompleteSemanticPaletteMatch: true,
			commentTextDoesNotEnterInference: true,
			targetColorsInferred: false,
			candidateFamilyPreservationRequiredBeforeReview: true,
		},
	}
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (path) =>
		[path, sha256(await readFile(join(projectRoot, path)))] as const)))
	const identity = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		candidateIdentity: NEXT_PALETTE_RELATION_IDENTITY,
		policy: NEXT_PALETTE_RELATION_DEVELOPMENT_POLICY,
		protocol,
		inputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, { path: input.path, sha256: input.sha256 }])),
		sources: results.map((result) => ({ cohort: result.cohort, ...result.source })),
		implementation,
	}
	const experimentId = sha256(JSON.stringify(canonicalValue(identity)))
	const generatedAt = new Date().toISOString()
	const positive = (quality: ReviewQuality | null | undefined): boolean => quality === "strong" || quality === "acceptable-not-ideal"
	const exactTransfers = transferEntries.filter((entry) => entry.transfer !== "novel" && entry.transfer !== "ineligible")
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
			changedFromCanonical: results.filter((result) => result.comparison.fromCanonical.changed).length,
			changedFromPredecessor: results.filter((result) => result.comparison.fromPredecessor.changed).length,
			changedFromPrevious: results.filter((result) => result.comparison.fromPrevious.changed).length,
			fieldStates: Object.fromEntries(["collapsed", "distinct-flat", "gradient"].map((state) =>
				[state, results.filter((result) => result.structural.fieldState === state).length])),
			generatedForeground: results.filter((result) => result.palette.foreground.generated).length,
			generatedAccent: results.filter((result) => result.palette.accent.generated).length,
			meanFieldNodeCount: results.reduce((sum, result) => sum + result.structural.fieldNodeCount, 0) / results.length,
		},
		primaryFeasibleCollapseCohort: {
			total: primaryCohort.length,
			selectedDistinctSurface: primaryCohort.filter((entry) => entry.selectedDistinctSurface).length,
			entries: primaryCohort,
		},
		priorReviewReuse: {
			submittedJudgments: transferEntries.length,
			exactTransfers: exactTransfers.length,
			positiveExactTransfers: exactTransfers.filter((entry) => positive(entry.transferredQuality)).length,
			negativeExactTransfers: exactTransfers.filter((entry) => !positive(entry.transferredQuality)).length,
			novel: transferEntries.filter((entry) => entry.transfer === "novel").length,
			ineligible: transferEntries.filter((entry) => entry.transfer === "ineligible").length,
			entries: transferEntries,
		},
		commented02Cases: commentCohort,
		knownUnresolved: {
			candidateFamilyPreservationImplemented: false,
			identityAvailabilityCases: identityAvailabilityFiles,
		},
		reviewEligibility: {
			eligible: false,
			blockers: [
				...(structuralViolations.length > 0 ? ["structural-violations"] : []),
				"small-identity-family-preservation-not-implemented",
			],
		},
		performance: {
			meanMs: results.reduce((sum, result) => sum + result.elapsedMs, 0) / results.length,
			maximumMs: Math.max(...results.map((result) => result.elapsedMs)),
			totalWorkerMs: results.reduce((sum, result) => sum + result.elapsedMs, 0),
		},
		disposition: "development-only-no-review",
		limitations: [
			"Evaluation is restricted to the same bound 392 development sources used by the prior candidates.",
			"No source under 10 through 14 was decoded, extracted, rendered, or reviewed.",
			"Prior human judgments transfer only to exact complete semantic palette matches.",
			"Novel relation palettes remain unknown and receive no inferred quality label.",
			"The frozen shortlist still lacks guaranteed preservation of small meaningful source families.",
		],
	}
	const manifest = { ...identity, experimentId, generatedAt }
	const resultArtifact = {
		schemaVersion: 1,
		experimentId,
		algorithmVersion: NEXT_PALETTE_RELATION_ALGORITHM_VERSION,
		entries: results.map((result) => ({
			cohort: result.cohort,
			file: result.file,
			source: result.source,
			palette: result.palette,
			structural: result.structural,
			comparison: result.comparison,
		})),
	}
	const certificateArtifact = {
		schemaVersion: 1,
		experimentId,
		algorithmVersion: NEXT_PALETTE_RELATION_ALGORITHM_VERSION,
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
	process.stderr.write(`Wrote next palette relation experiment ${experimentId} to ${outputRoot}\n`)
}

if (!isMainThread) {
	runWorker(workerData as Task[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => { throw error })
} else {
	await main()
}
