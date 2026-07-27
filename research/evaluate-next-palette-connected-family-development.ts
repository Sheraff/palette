import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import { compareSpatialPalettes, roleNames } from "./src/candidate-comparison.ts"
import { loadImage } from "./src/image.ts"
import {
	extractNextPaletteConnectedFamilyWithContext,
	NEXT_PALETTE_CONNECTED_FAMILY_ALGORITHM_VERSION,
	NEXT_PALETTE_CONNECTED_FAMILY_IDENTITY,
} from "./src/next-palette-connected-family.ts"
import { NEXT_PALETTE_RELATION_DEVELOPMENT_POLICY, type NextPaletteRelationCertificate } from "./src/next-palette-relation.ts"
import type { CorpusResult, Palette } from "./src/types.ts"

const EXPERIMENT_VERSION = "next-palette-0.4.0-connected-family-development"
const PREVIOUS_EXPERIMENT_ID = "37d74b745d07fda30af10ceee98e5440ac262e3fca2995ba5270bc0118c72f0a"
const FIELD_PAIR_EXPERIMENT_ID = "5eb15868f6a62920c593ce13eb885aead916be66c47d6da81646f45d3e36e2c6"
const PREDECESSOR_EXPERIMENT_ID = "883e547342ea726d4ba914b2405c5ec92b9489f2efd152d0d68ae2b6361389d1"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const outputRoot = join(researchRoot, "data/experiments", EXPERIMENT_VERSION)
const inputFiles = {
	previousManifest: "research/data/experiments/next-palette-0.3.0-relation-development/manifest.json",
	previousResults: "research/data/experiments/next-palette-0.3.0-relation-development/results.json",
	fieldPairResults: "research/data/experiments/next-palette-0.2.0-field-pair-development/results.json",
	predecessorDevelopment: "research/data/experiments/next-palette-0.1.0-development/candidate-results.json",
	predecessor00: "research/data/experiments/next-palette-0.1.0-development/candidate-00-results.json",
	canonicalDevelopment: "research/data/results.json",
	canonical00: "research/data/holdout-results.json",
	review01Batch01: "research/data/experiments/next-palette-0.1.0-development/review-v2/batch-01-analysis.json",
	review01Batch02: "research/data/experiments/next-palette-0.1.0-development/review-v2/batch-02-analysis.json",
	review02Partial: "research/data/experiments/next-palette-0.2.0-field-pair-development/review-v1/batch-01-partial-analysis.json",
	commentDiagnostics01: "research/data/experiments/next-palette-0.1.0-development/review-v2/comment-case-diagnostics-batches-01-02.json",
	technicalAttribution: "research/data/experiments/next-palette-0.1.0-development/review-v2/technical-attribution-batches-01-02.json",
} as const
const implementationFiles = [
	"package.json",
	"pnpm-lock.yaml",
	"research/NEXT_PALETTE_RELATION_ARCHITECTURE.md",
	"research/NEXT_PALETTE_CONNECTED_FAMILY_ARCHITECTURE.md",
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
	"research/src/next-palette-relation.ts",
	"research/src/next-palette-connected-family.ts",
	"research/evaluate-next-palette-connected-family-development.ts",
] as const

type Cohort = "development" | "00"
type Source = { cohort: Cohort; path: string; sha256: string; bytes: number }
type Task = Source & { canonical: Palette; predecessor: Palette; fieldPair: Palette; previous: Palette }
type PreviousManifest = { experimentId: string; sources: Source[] }
type ResultArtifact = { experimentId: string; entries: Array<{ cohort: Cohort; file: string; palette: Palette }> }
type ReviewQuality = "strong" | "acceptable-not-ideal" | "weak-fallback" | "unacceptable"
type ReviewEntry = {
	caseId: string
	file: string
	sourceEligibility: "eligible-artwork" | "ineligible-artwork"
	baselineQuality?: ReviewQuality
	candidateQuality?: ReviewQuality
	note?: string
}
type Review = { experimentId: string; entries: ReviewEntry[] }
type CommentDiagnostics = {
	experimentId: string
	entries: Array<{
		file: string
		selected: { roles: { background: { hex: string }; surface: { hex: string } } }
		domain: { feasibleDistinctSurfaceCandidateIdsForSelectedTuple: number[] }
	}>
}
type Attribution = {
	experimentId: string
	identityOmissionAttribution: Array<{ file: string; attribution: string; evidence: string }>
}
type WorkerResult = {
	cohort: Cohort
	file: string
	source: { sha256: string; bytes: number }
	palette: Palette
	certificate: NextPaletteRelationCertificate
	structural: {
		violations: string[]
		fieldNodeCount: number
		reserveNodeCount: number
		selectedReserveRoles: string[]
	}
	comparison: {
		fromCanonical: ReturnType<typeof compareSpatialPalettes>
		fromPredecessor: ReturnType<typeof compareSpatialPalettes>
		fromFieldPair: ReturnType<typeof compareSpatialPalettes>
		fromPrevious: ReturnType<typeof compareSpatialPalettes>
	}
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

function semanticKey(palette: Palette): string {
	return JSON.stringify({ roles: roleNames.map((role) => [role, palette[role].rgb, palette[role].generated]),
		gradient: palette.gradient.isGradient })
}

function corpusMap(development: CorpusResult, canonical00: CorpusResult): Map<string, Palette> {
	return new Map([
		...development.entries.map((entry) => [`images/${entry.file}`, entry.extraction.methods.spatial] as const),
		...canonical00.entries.map((entry) => [entry.file, entry.extraction.methods.spatial] as const),
	])
}

function structural(result: ReturnType<typeof extractNextPaletteConnectedFamilyWithContext>) {
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
	const reserves = graph.nodes.filter((node) => node.construction === "connected-family-reserve")
	if (certificate.counts.fieldPairs !== fieldIds.size ** 2 ||
		graph.edges.length !== graph.nodes.length * (graph.nodes.length - 1) ||
		graph.edges.filter((edge) => edge.fieldRelation).length !== fieldIds.size * (fieldIds.size - 1) ||
		reserves.some((node) => fieldIds.has(node.id) || node.fieldEligibility.eligible)) violations.push("relation-domain")
	for (const [name, relation] of Object.entries(certificate.selected.apcaConstraints)) {
		const overlay = name.startsWith("foreground") ? "foreground" : "accent"
		const field = name.endsWith("Background") ? "background" : "surface"
		const required = (certificate.policy.requiredApcaRelations[overlay] as readonly string[]).includes(field)
		if (relation.required !== required || required && !relation.passesThreshold) violations.push(`consumer-apca:${name}`)
	}
	const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
	const selectedReserveRoles: string[] = []
	for (const role of roleNames) {
		const id = certificate.selected.candidateIds[role]
		if (typeof id === "number") {
			const node = nodeById.get(id)
			if (!node || node.hex !== palette[role].hex || palette[role].generated || palette[role].sourceDistance !== 0 ||
				((role === "background" || role === "surface") && !fieldIds.has(id))) violations.push(`source-provenance:${role}`)
			if (node?.construction === "connected-family-reserve") selectedReserveRoles.push(role)
		} else if ((role !== "foreground" && role !== "accent") || !palette[role].generated ||
			palette[role].hex !== (id === "generated-black" ? "#000000" : "#ffffff")) {
			violations.push(`generated-provenance:${role}`)
		}
	}
	if (typeof certificate.selected.candidateIds.foreground !== "number" &&
		!certificate.selected.generatedColorAuthorization.foregroundFallback.authorized) violations.push("generated-foreground")
	if (typeof certificate.selected.candidateIds.accent !== "number" &&
		(!certificate.selected.generatedColorAuthorization.accentCollapse.authorized ||
			certificate.selected.candidateIds.accent !== certificate.selected.candidateIds.foreground)) {
		violations.push("generated-accent")
	}
	const collapsed = certificate.selected.candidateIds.background === certificate.selected.candidateIds.surface
	if (certificate.selected.fieldState === "collapsed") {
		if (!collapsed || certificate.selected.fieldEdge || palette.gradient.isGradient) violations.push("collapsed-state")
	} else {
		const relation = certificate.selected.fieldEdge?.fieldRelation
		const support = certificate.selected.fieldState === "gradient"
			? relation?.stateSupport.gradient : relation?.stateSupport.distinctFlat
		if (collapsed || !relation || !support || certificate.selected.objectives[2] !== support ||
			palette.gradient.isGradient !== (certificate.selected.fieldState === "gradient")) violations.push("distinct-state")
	}
	if (certificate.selected.objectives[4] !== 1) violations.push("global-family-mass-penalty")
	const deficits = certificate.selected.objectives.map((objective) => 1 - objective)
	if (certificate.selected.maximumDeficit !== Math.max(...deficits) ||
		certificate.selected.totalDeficit !== deficits.reduce((sum, deficit) => sum + deficit, 0) ||
		palette.score !== 1 - certificate.selected.maximumDeficit) violations.push("minimax-arithmetic")
	return { violations: [...new Set(violations)], fieldNodeCount: fieldIds.size,
		reserveNodeCount: reserves.length, selectedReserveRoles }
}

async function evaluate(task: Task): Promise<WorkerResult> {
	if (!/^(?:images|00)\/[^/\\]+$/.test(task.path)) throw new Error(`Invalid source path: ${task.path}`)
	const bytes = await readFile(join(projectRoot, task.path))
	const sourceSha256 = sha256(bytes)
	if (sourceSha256 !== task.sha256 || bytes.byteLength !== task.bytes) throw new Error(`Source binding changed: ${task.path}`)
	const image = await loadImage(bytes)
	const started = performance.now()
	const next = extractNextPaletteConnectedFamilyWithContext(image)
	const elapsedMs = performance.now() - started
	return {
		cohort: task.cohort,
		file: task.path,
		source: { sha256: sourceSha256, bytes: bytes.byteLength },
		palette: next.palette,
		certificate: next.certificate,
		structural: structural(next),
		comparison: {
			fromCanonical: compareSpatialPalettes(task.canonical, next.palette),
			fromPredecessor: compareSpatialPalettes(task.predecessor, next.palette),
			fromFieldPair: compareSpatialPalettes(task.fieldPair, next.palette),
			fromPrevious: compareSpatialPalettes(task.previous, next.palette),
		},
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
					process.stderr.write(`next palette connected family evaluation: ${completed}/${tasks.length}\r`)
				}
			}
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Connected family palette worker exited with code ${code}`))
		})
	}))
	const results = (await Promise.all(workers)).flat()
	process.stderr.write(`next palette connected family evaluation: ${results.length}/${tasks.length}\n`)
	return results.sort((first, second) => first.cohort.localeCompare(second.cohort) || first.file.localeCompare(second.file))
}

function transferReview(
	review: string,
	entries: readonly ReviewEntry[],
	resultByFile: ReadonlyMap<string, WorkerResult>,
	baselineByFile: ReadonlyMap<string, Palette>,
	candidateByFile: ReadonlyMap<string, Palette>,
) {
	return entries.map((entry) => {
		if (entry.sourceEligibility !== "eligible-artwork") return { review, caseId: entry.caseId, file: entry.file, transfer: "ineligible" }
		const result = resultByFile.get(entry.file)
		const baseline = baselineByFile.get(entry.file)
		const candidate = candidateByFile.get(entry.file)
		if (!result || !baseline || !candidate || !entry.baselineQuality || !entry.candidateQuality) {
			throw new Error(`Reviewed case lacks bound evidence: ${entry.caseId}`)
		}
		const key = semanticKey(result.palette)
		const transfer = key === semanticKey(candidate) ? "candidate" : key === semanticKey(baseline) ? "baseline" : "novel"
		return { review, caseId: entry.caseId, file: entry.file, transfer,
			transferredQuality: transfer === "candidate" ? entry.candidateQuality : transfer === "baseline" ? entry.baselineQuality : null }
	})
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite existing connected family palette experiment: ${outputRoot}`)
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) throw new Error("evaluate-next-palette-connected-family-development.ts does not accept arguments")
	await assertOutputAbsent()
	const inputEntries = await Promise.all(Object.entries(inputFiles).map(async ([name, path]) => {
		const raw = await readFile(join(projectRoot, path))
		return [name, { path, raw, sha256: sha256(raw) }] as const
	}))
	const inputs = Object.fromEntries(inputEntries) as Record<keyof typeof inputFiles, { path: string; raw: Buffer; sha256: string }>
	const parse = <T>(name: keyof typeof inputFiles): T => JSON.parse(inputs[name].raw.toString("utf8")) as T
	const manifest = parse<PreviousManifest>("previousManifest")
	const previousResults = parse<ResultArtifact>("previousResults")
	const fieldPairResults = parse<ResultArtifact>("fieldPairResults")
	const predecessorDevelopment = parse<CorpusResult>("predecessorDevelopment")
	const predecessor00 = parse<CorpusResult>("predecessor00")
	const canonicalDevelopment = parse<CorpusResult>("canonicalDevelopment")
	const canonical00 = parse<CorpusResult>("canonical00")
	const review01 = [parse<Review>("review01Batch01"), parse<Review>("review01Batch02")]
	const review02 = parse<Review>("review02Partial")
	const comments = parse<CommentDiagnostics>("commentDiagnostics01")
	const attribution = parse<Attribution>("technicalAttribution")
	if (manifest.experimentId !== PREVIOUS_EXPERIMENT_ID || previousResults.experimentId !== PREVIOUS_EXPERIMENT_ID ||
		fieldPairResults.experimentId !== FIELD_PAIR_EXPERIMENT_ID || review02.experimentId !== FIELD_PAIR_EXPERIMENT_ID ||
		review01.some((review) => review.experimentId !== PREDECESSOR_EXPERIMENT_ID) ||
		comments.experimentId !== PREDECESSOR_EXPERIMENT_ID || attribution.experimentId !== PREDECESSOR_EXPERIMENT_ID ||
		manifest.sources.length !== 392 || review01.flatMap((review) => review.entries).length !== 80 || review02.entries.length !== 24) {
		throw new Error("Connected family palette input bindings disagree")
	}
	const canonicalByFile = corpusMap(canonicalDevelopment, canonical00)
	const predecessorByFile = corpusMap(predecessorDevelopment, predecessor00)
	const fieldPairByFile = new Map(fieldPairResults.entries.map((entry) => [entry.file, entry.palette]))
	const previousByFile = new Map(previousResults.entries.map((entry) => [entry.file, entry.palette]))
	const tasks = manifest.sources.map((source): Task => {
		const canonical = canonicalByFile.get(source.path)
		const predecessor = predecessorByFile.get(source.path)
		const fieldPair = fieldPairByFile.get(source.path)
		const previous = previousByFile.get(source.path)
		if (!canonical || !predecessor || !fieldPair || !previous) throw new Error(`Missing prior palette: ${source.path}`)
		return { ...source, canonical, predecessor, fieldPair, previous }
	})
	const results = await runParallel(tasks)
	const resultByFile = new Map(results.map((result) => [result.file, result]))
	const primaryFiles = comments.entries.filter((entry) =>
		entry.selected.roles.background.hex === entry.selected.roles.surface.hex &&
		entry.domain.feasibleDistinctSurfaceCandidateIdsForSelectedTuple.length > 0).map((entry) => entry.file)
	if (primaryFiles.length !== 15) throw new Error("Primary collapse cohort binding changed")
	const primary = primaryFiles.map((file) => {
		const result = resultByFile.get(file)!
		return { file, fieldState: result.certificate.selected.fieldState,
			selectedDistinctSurface: result.palette.background.hex !== result.palette.surface.hex,
			palette: result.palette }
	})
	const knownAvailability = attribution.identityOmissionAttribution.filter((entry) => entry.attribution === "candidate-availability")
		.map((entry) => {
			const result = resultByFile.get(entry.file)!
			return { ...entry, reserveNodeCount: result.structural.reserveNodeCount,
				selectedReserveRoles: result.structural.selectedReserveRoles, palette: result.palette }
		})
	if (knownAvailability.length !== 6 || knownAvailability.some((entry) => entry.reserveNodeCount === 0)) {
		throw new Error("Known availability cohort was not preserved")
	}
	const commented = review02.entries.filter((entry) => entry.note).map((entry) => {
		const result = resultByFile.get(entry.file)!
		return { caseId: entry.caseId, file: entry.file, note: entry.note,
			reserveNodeCount: result.structural.reserveNodeCount,
			selectedReserveRoles: result.structural.selectedReserveRoles,
			fieldState: result.certificate.selected.fieldState, palette: result.palette }
	})
	if (commented.length !== 9) throw new Error("Comment cohort binding changed")
	const transfers = [
		...transferReview("0.1-review-v2", review01.flatMap((review) => review.entries), resultByFile, canonicalByFile, predecessorByFile),
		...transferReview("0.2-review-v1-partial", review02.entries, resultByFile, predecessorByFile, fieldPairByFile),
	]
	const violations = results.filter((result) => result.structural.violations.length > 0)
	const protocol = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		candidateAlgorithmVersion: NEXT_PALETTE_CONNECTED_FAMILY_ALGORITHM_VERSION,
		previousCandidateAlgorithmVersion: "region-graph-next-0.3.0-dev",
		authorization: { developmentOnly: true, allowedSourceRoots: ["images", "00"], outputUnseenRootsOpened: [] as string[],
			newHumanReviewAuthorized: false, canonicalPromotionAuthorized: false },
		scope: "Integrate every source-qualified connected family as an overlay-only candidate and remove global population-mass family ranking.",
		stoppingRules: { structuralViolationsMustEqual: 0, allKnownAvailabilityCasesMustRetainProposals: true,
			priorJudgmentsTransferOnlyOnExactCompleteSemanticPaletteMatch: true, commentTextDoesNotEnterInference: true,
			targetColorsInferred: false, ambiguousConnectedFamilyRoleOutcomesBlockReview: true },
	}
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (path) =>
		[path, sha256(await readFile(join(projectRoot, path)))] as const)))
	const identity = { schemaVersion: 1, experimentVersion: EXPERIMENT_VERSION,
		candidateIdentity: NEXT_PALETTE_CONNECTED_FAMILY_IDENTITY, policy: NEXT_PALETTE_RELATION_DEVELOPMENT_POLICY,
		protocol, inputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, { path: input.path, sha256: input.sha256 }])),
		sources: results.map((result) => ({ cohort: result.cohort, path: result.file, ...result.source })), implementation }
	const experimentId = sha256(JSON.stringify(canonicalValue(identity)))
	const generatedAt = new Date().toISOString()
	const exactTransfers = transfers.filter((entry) => entry.transfer === "candidate" || entry.transfer === "baseline")
	const positive = (quality: ReviewQuality | null | undefined) => quality === "strong" || quality === "acceptable-not-ideal"
	const analysis = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		experimentId,
		generatedAt,
		structural: { pass: violations.length === 0,
			violationCount: violations.reduce((sum, result) => sum + result.structural.violations.length, 0),
			caseCount: violations.length,
			entries: violations.map((result) => ({ file: result.file, violations: result.structural.violations })) },
		matrix: {
			total: results.length,
			changedFromCanonical: results.filter((result) => result.comparison.fromCanonical.changed).length,
			changedFromPredecessor: results.filter((result) => result.comparison.fromPredecessor.changed).length,
			changedFromFieldPair: results.filter((result) => result.comparison.fromFieldPair.changed).length,
			changedFromPrevious: results.filter((result) => result.comparison.fromPrevious.changed).length,
			fieldStates: Object.fromEntries(["collapsed", "distinct-flat", "gradient"].map((state) => [state,
				results.filter((result) => result.certificate.selected.fieldState === state).length])),
			withReserveNodes: results.filter((result) => result.structural.reserveNodeCount > 0).length,
			withSelectedReserve: results.filter((result) => result.structural.selectedReserveRoles.length > 0).length,
			selectedReserveRoles: Object.fromEntries(["foreground", "accent"].map((role) => [role,
				results.filter((result) => result.structural.selectedReserveRoles.includes(role)).length])),
			meanReserveNodeCount: results.reduce((sum, result) => sum + result.structural.reserveNodeCount, 0) / results.length,
		},
		primaryFeasibleCollapseCohort: { total: primary.length,
			selectedDistinctSurface: primary.filter((entry) => entry.selectedDistinctSurface).length, entries: primary },
		knownAvailabilityCohort: { total: knownAvailability.length,
			withProposals: knownAvailability.filter((entry) => entry.reserveNodeCount > 0).length,
			withSelectedReserve: knownAvailability.filter((entry) => entry.selectedReserveRoles.length > 0).length,
			entries: knownAvailability },
		commented02Cases: commented,
		priorReviewReuse: { submittedJudgments: transfers.length, exactTransfers: exactTransfers.length,
			positiveExactTransfers: exactTransfers.filter((entry) => positive(entry.transferredQuality)).length,
			negativeExactTransfers: exactTransfers.filter((entry) => !positive(entry.transferredQuality)).length,
			novel: transfers.filter((entry) => entry.transfer === "novel").length,
			ineligible: transfers.filter((entry) => entry.transfer === "ineligible").length, entries: transfers },
		reviewEligibility: { eligible: false, blockers: [
			...(violations.length > 0 ? ["structural-violations"] : []),
			"connected-family-role-importance-remains-ambiguous-without-target-inference",
		] },
		performance: { meanMs: results.reduce((sum, result) => sum + result.elapsedMs, 0) / results.length,
			maximumMs: Math.max(...results.map((result) => result.elapsedMs)),
			totalWorkerMs: results.reduce((sum, result) => sum + result.elapsedMs, 0) },
		disposition: "development-only-no-review",
		limitations: [
			"Connected family availability does not identify which source family a qualitative comment intended.",
			"Novel complete palettes receive no inferred quality label.",
			"The matrix remains restricted to the same 392 sources; 10 through 14 remain unopened.",
		],
	}
	const resultArtifact = { schemaVersion: 1, experimentId, algorithmVersion: NEXT_PALETTE_CONNECTED_FAMILY_ALGORITHM_VERSION,
		entries: results.map((result) => ({ cohort: result.cohort, file: result.file, source: result.source,
			palette: result.palette, structural: result.structural, comparison: result.comparison })) }
	const certificates = { schemaVersion: 1, experimentId, algorithmVersion: NEXT_PALETTE_CONNECTED_FAMILY_ALGORITHM_VERSION,
		entries: Object.fromEntries(results.map((result) => [result.file, result.certificate])) }
	await mkdir(outputRoot)
	await Promise.all([
		writeExclusive(join(outputRoot, "protocol.json"), protocol),
		writeExclusive(join(outputRoot, "manifest.json"), { ...identity, experimentId, generatedAt }),
		writeExclusive(join(outputRoot, "analysis.json"), analysis),
		writeExclusive(join(outputRoot, "results.json"), resultArtifact),
		writeExclusive(join(outputRoot, "certificates.json"), certificates),
	])
	process.stderr.write(`Wrote next palette connected family experiment ${experimentId} to ${outputRoot}\n`)
}

if (!isMainThread) {
	runWorker(workerData as Task[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => { throw error })
} else {
	await main()
}
