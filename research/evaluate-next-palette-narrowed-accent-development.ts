import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import { ALGORITHM_VERSION } from "./src/extract.ts"
import { loadImage } from "./src/image.ts"
import {
	extractNextPaletteNarrowedAccentWithContext,
	NEXT_PALETTE_NARROWED_ACCENT_ALGORITHM_VERSION,
	NEXT_PALETTE_NARROWED_ACCENT_POLICY,
	type NextPaletteNarrowedAccentCertificate,
} from "./src/next-palette-narrowed-accent.ts"
import type { CorpusResult, ExtractionResult, Palette } from "./src/types.ts"

const EXPERIMENT_VERSION = "next-palette-narrowed-accent-0.2.0-development"
const PREDECESSOR_EXPERIMENT_ID = "23801e1753f397da70865be2ad8bdd23b26ca1652f9b42c041b352b044275ebe"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const outputRoot = join(researchRoot, "data/experiments", EXPERIMENT_VERSION)

const inputFiles = {
	predecessorManifest: "research/data/experiments/next-palette-incumbent-accent-0.1.0-development/manifest.json",
	predecessorAnalysis: "research/data/experiments/next-palette-incumbent-accent-0.1.0-development/analysis.json",
	predecessorResults: "research/data/experiments/next-palette-incumbent-accent-0.1.0-development/results.json",
	completeReviewAttribution:
		"research/data/experiments/next-palette-incumbent-accent-0.1.0-development/review-v1/complete-review-attribution.json",
	batch01Analysis:
		"research/data/experiments/next-palette-incumbent-accent-0.1.0-development/review-v1/batch-01-analysis.json",
	batch02Analysis:
		"research/data/experiments/next-palette-incumbent-accent-0.1.0-development/review-v1/batch-02-analysis.json",
	canonicalDevelopment: "research/data/results.json",
	canonical00: "research/data/holdout-results.json",
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
	"research/src/connected-family-candidate-availability.ts",
	"research/src/connected-family-representative-fidelity.ts",
	"research/src/chromatic-role-extract.ts",
	"research/src/extract.ts",
	"research/src/next-palette-incumbent-accent.ts",
	"research/src/next-palette-narrowed-accent.ts",
	"research/evaluate-next-palette-narrowed-accent-development.ts",
	"research/tests/next-palette-narrowed-accent.test.ts",
] as const

type Cohort = "development" | "00"
type Source = { cohort: Cohort; path: string; sha256: string; bytes: number }
type Task = Source & { canonical: ExtractionResult }
type ReviewEntry = {
	caseId: string
	file: string
	sourceEligibility: string
	baselineQuality: string | null
	candidateQuality: string | null
	comparison: string | null
	note: string
}
type WorkerResult = {
	cohort: Cohort
	file: string
	source: { sha256: string; bytes: number }
	palette: Palette
	certificate: NextPaletteNarrowedAccentCertificate
	predecessorChanged: boolean
	exactChanged: boolean
	structural: { violations: string[] }
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

function extractionWithoutRuntime(extraction: ExtractionResult): ExtractionResult {
	return { ...extraction, diagnostics: { ...extraction.diagnostics, processingMs: 0 } }
}

function canonicalMap(development: CorpusResult, canonical00: CorpusResult): Map<string, ExtractionResult> {
	return new Map([
		...development.entries.map((entry) => [`images/${entry.file}`, entry.extraction] as const),
		...canonical00.entries.map((entry) => [entry.file, entry.extraction] as const),
	])
}

function paletteSemanticKey(palette: Palette): string {
	return JSON.stringify({
		background: [palette.background.rgb, palette.background.generated],
		foreground: [palette.foreground.rgb, palette.foreground.generated],
		surface: [palette.surface.rgb, palette.surface.generated],
		accent: [palette.accent.rgb, palette.accent.generated],
		gradient: palette.gradient.isGradient,
	})
}

function structural(
	canonical: ExtractionResult,
	result: ReturnType<typeof extractNextPaletteNarrowedAccentWithContext>,
	imageData: Uint8Array,
): { violations: string[] } {
	const violations: string[] = []
	const incumbent = canonical.methods.spatial
	const candidate = result.palette
	for (const role of ["background", "foreground", "surface"] as const) {
		if (!isDeepStrictEqual(candidate[role], incumbent[role])) violations.push(`frozen-role:${role}`)
	}
	if (!isDeepStrictEqual(candidate.gradient, incumbent.gradient)) violations.push("frozen-gradient")
	if (!isDeepStrictEqual(extractionWithoutRuntime(result.canonicalExtraction), extractionWithoutRuntime(canonical))) {
		violations.push("canonical-recomputation")
	}
	const changed = paletteSemanticKey(candidate) !== paletteSemanticKey(incumbent)
	if (changed !== result.certificate.selected.changed) violations.push("changed-decision")
	if (!changed && !isDeepStrictEqual(candidate, incumbent)) violations.push("unchanged-not-exact-canonical")
	if (changed) {
		if (result.certificate.failedGuards.length > 0) violations.push("selected-failed-guard")
		if (result.certificate.predecessor.provenanceKind !== "connected-family-local") {
			violations.push("selected-non-connected-family")
		}
		if (result.certificate.minimumDistanceFromFrozenRole + 1e-12 <
			NEXT_PALETTE_NARROWED_ACCENT_POLICY.minimumAccentDistanceFromFrozenRole) {
			violations.push("selected-role-distance")
		}
		const option = result.predecessorCertificate.options.find((entry) =>
			entry.optionId === result.certificate.selected.optionId)
		if (!option || !option.eligible || option.failedGuards.length > 0) violations.push("selected-predecessor-option")
		if (option && !option.generated && !option.provenance.representativePixelIndices.some((pixel) => {
			const offset = pixel * 3
			return option.rgb[0] === imageData[offset] && option.rgb[1] === imageData[offset + 1] &&
				option.rgb[2] === imageData[offset + 2]
		})) violations.push("selected-source-provenance")
	}
	if (result.certificate.selected.suppressedPredecessor && changed) violations.push("suppressed-but-changed")
	if (result.predecessorCertificate.options.some((option) => !Number.isFinite(option.contrast.background.signedLc) ||
		!Number.isFinite(option.contrast.surface.signedLc))) violations.push("non-finite-apca")
	if (new Set([candidate.background.hex, candidate.foreground.hex, candidate.surface.hex, candidate.accent.hex]).size > 4) {
		violations.push("cardinality")
	}
	return { violations: [...new Set(violations)].sort() }
}

async function evaluate(task: Task): Promise<WorkerResult> {
	if (!/^(?:images|00)\/[^/\\]+$/.test(task.path)) throw new Error(`Unauthorized source path: ${task.path}`)
	const bytes = await readFile(join(projectRoot, task.path))
	if (bytes.byteLength !== task.bytes || sha256(bytes) !== task.sha256) throw new Error(`Source binding changed: ${task.path}`)
	const image = await loadImage(bytes)
	const started = performance.now()
	const result = extractNextPaletteNarrowedAccentWithContext(image)
	const elapsedMs = performance.now() - started
	return {
		cohort: task.cohort,
		file: task.path,
		source: { sha256: task.sha256, bytes: task.bytes },
		palette: result.palette,
		certificate: result.certificate,
		predecessorChanged: result.predecessorCertificate.selected.changed,
		exactChanged: paletteSemanticKey(task.canonical.methods.spatial) !== paletteSemanticKey(result.palette),
		structural: structural(task.canonical, result, image.data),
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
					process.stderr.write(`narrowed accent evaluation: ${completed}/${tasks.length}\r`)
				}
			}
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Narrowed accent worker exited with code ${code}`))
		})
	}))
	const results = (await Promise.all(workers)).flat().sort((first, second) =>
		first.cohort.localeCompare(second.cohort) || first.file.localeCompare(second.file))
	process.stderr.write(`narrowed accent evaluation: ${results.length}/${tasks.length}\n`)
	return results
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite existing narrowed accent experiment: ${outputRoot}`)
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) {
		throw new Error("evaluate-next-palette-narrowed-accent-development.ts does not accept arguments")
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
	const predecessorManifest = parse<{ experimentId: string; sources: Source[] }>("predecessorManifest")
	const predecessorAnalysis = parse<{ experimentId: string; matrix: { exactChanged: number }; structural: { pass: boolean } }>(
		"predecessorAnalysis",
	)
	const predecessorResults = parse<{ experimentId: string; entries: Array<{ file: string; palette: Palette; exactChanged: boolean }> }>(
		"predecessorResults",
	)
	const completeAttribution = parse<{ experimentId: string; coverage: { complete: boolean; eligible: number } }>(
		"completeReviewAttribution",
	)
	const reviewEntries = [
		...parse<{ entries: ReviewEntry[] }>("batch01Analysis").entries,
		...parse<{ entries: ReviewEntry[] }>("batch02Analysis").entries,
	]
	const canonicalDevelopment = parse<CorpusResult>("canonicalDevelopment")
	const canonical00 = parse<CorpusResult>("canonical00")
	if (predecessorManifest.experimentId !== PREDECESSOR_EXPERIMENT_ID ||
		predecessorAnalysis.experimentId !== PREDECESSOR_EXPERIMENT_ID ||
		predecessorResults.experimentId !== PREDECESSOR_EXPERIMENT_ID ||
		completeAttribution.experimentId !== PREDECESSOR_EXPERIMENT_ID || !completeAttribution.coverage.complete ||
		completeAttribution.coverage.eligible !== 54 || !predecessorAnalysis.structural.pass ||
		predecessorAnalysis.matrix.exactChanged !== 55 || predecessorManifest.sources.length !== 392 ||
		canonicalDevelopment.algorithmVersion !== ALGORITHM_VERSION || canonical00.algorithmVersion !== ALGORITHM_VERSION) {
		throw new Error("Narrowed accent input bindings disagree")
	}
	const canonicalByFile = canonicalMap(canonicalDevelopment, canonical00)
	const tasks = predecessorManifest.sources.map((source): Task => {
		const canonical = canonicalByFile.get(source.path)
		if (!canonical) throw new Error(`Missing canonical incumbent: ${source.path}`)
		return { ...source, canonical }
	})
	const results = await runParallel(tasks)
	const violations = results.filter((result) => result.structural.violations.length > 0)
	const changed = results.filter((result) => result.exactChanged)
	const suppressed = results.filter((result) => result.certificate.selected.suppressedPredecessor)
	const predecessorByFile = new Map(predecessorResults.entries.map((entry) => [entry.file, entry]))
	for (const result of results) {
		const predecessor = predecessorByFile.get(result.file)
		const canonical = canonicalByFile.get(result.file)!.methods.spatial
		if (!predecessor) throw new Error(`Missing predecessor result: ${result.file}`)
		if (result.exactChanged && paletteSemanticKey(result.palette) !== paletteSemanticKey(predecessor.palette)) {
			throw new Error(`Narrowed output is not an exact predecessor palette: ${result.file}`)
		}
		if (!result.exactChanged && !isDeepStrictEqual(result.palette, canonical)) {
			throw new Error(`Narrowed unchanged output is not exact canonical: ${result.file}`)
		}
	}
	const reviewByFile = new Map(reviewEntries.map((entry) => [entry.file, entry]))
	const transferred = changed.map((result) => {
		const review = reviewByFile.get(result.file)
		if (!review) throw new Error(`Missing predecessor review for retained output: ${result.file}`)
		return { ...review, transferBasis: "exact-baseline-and-candidate-semantic-palette-match" as const }
	})
	const eligibleTransferred = transferred.filter((entry) => entry.sourceEligibility === "eligible-artwork")
	const comparisons = (value: string) => eligibleTransferred.filter((entry) => entry.comparison === value).length
	const candidateNegative = eligibleTransferred.filter((entry) =>
		entry.candidateQuality === "weak-fallback" || entry.candidateQuality === "unacceptable").length
	const protocol = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		candidateAlgorithmVersion: NEXT_PALETTE_NARROWED_ACCENT_ALGORITHM_VERSION,
		baselineAlgorithmVersion: ALGORITHM_VERSION,
		predecessorExperimentId: PREDECESSOR_EXPERIMENT_ID,
		authorization: {
			developmentOnly: true,
			allowedSourceRoots: ["images", "00"],
			outputUnseenRootsOpened: [] as string[],
			exactReviewTransferOnly: true,
			canonicalPromotionAuthorized: false,
			candidateFreezeAuthorized: false,
			reserveAccessAuthorized: false,
		},
		scope: "Filter the reviewed accent predecessor with generalized role-separation and large-move identity guards.",
		stoppingRules: {
			structuralViolationsMustEqual: 0,
			everyUnchangedPaletteMustEqualCanonicalExactly: true,
			everyChangedPaletteMustEqualAReviewedPredecessorPalette: true,
			foregroundCollapseMustEqual: 0,
			candidateStrongerMustRemainAtLeast: 1,
			candidateStrongerSuppressedMustEqual: 0,
			noFixedApcaAdmissionFloor: true,
		},
	}
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (path) =>
		[path, sha256(await readFile(join(projectRoot, path)))] as const)))
	const identity = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		candidateIdentity: {
			algorithmVersion: NEXT_PALETTE_NARROWED_ACCENT_ALGORITHM_VERSION,
			selection: "review-derived-generalized-filter-over-incumbent-accent-predecessor",
		},
		policy: NEXT_PALETTE_NARROWED_ACCENT_POLICY,
		protocol,
		inputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, {
			path: input.path,
			sha256: input.sha256,
		}])),
		sources: predecessorManifest.sources,
		implementation,
	}
	const experimentId = sha256(JSON.stringify(canonicalValue(identity)))
	const generatedAt = new Date().toISOString()
	const resultArtifact = {
		schemaVersion: 1,
		experimentId,
		algorithmVersion: NEXT_PALETTE_NARROWED_ACCENT_ALGORITHM_VERSION,
		entries: results.map((result) => ({
			cohort: result.cohort,
			file: result.file,
			source: result.source,
			palette: result.palette,
			predecessorChanged: result.predecessorChanged,
			exactChanged: result.exactChanged,
			structural: result.structural,
		})),
	}
	const certificates = {
		schemaVersion: 1,
		experimentId,
		algorithmVersion: NEXT_PALETTE_NARROWED_ACCENT_ALGORITHM_VERSION,
		entries: Object.fromEntries(results.map((result) => [result.file, result.certificate])),
	}
	const frontier = {
		schemaVersion: 1,
		experimentId,
		algorithmVersion: NEXT_PALETTE_NARROWED_ACCENT_ALGORITHM_VERSION,
		entries: changed.map((result) => ({
			file: result.file,
			cohort: result.cohort,
			changedRoles: ["accent"],
			gradientChanged: false,
			baseline: canonicalByFile.get(result.file)!.methods.spatial,
			candidate: result.palette,
			source: { path: result.file, ...result.source },
			selected: result.certificate.selected,
		})),
	}
	const transferArtifact = {
		schemaVersion: 1,
		experimentId,
		predecessorExperimentId: PREDECESSOR_EXPERIMENT_ID,
		generatedAt,
		policy: "Transfer only when source, canonical baseline, and emitted candidate palette are exact semantic matches.",
		coverage: {
			changed: changed.length,
			transferred: transferred.length,
			eligible: eligibleTransferred.length,
			notReviewable: transferred.length - eligibleTransferred.length,
			freshReviewRequired: 0,
		},
		quality: { candidateWeakOrUnacceptable: candidateNegative },
		comparison: {
			"candidate-stronger": comparisons("candidate-stronger"),
			"baseline-stronger": comparisons("baseline-stronger"),
			"both-similarly-valid": comparisons("both-similarly-valid"),
		},
		entries: transferred,
	}
	const analysis = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		experimentId,
		generatedAt,
		structural: {
			pass: violations.length === 0,
			violationCount: violations.reduce((sum, result) => sum + result.structural.violations.length, 0),
			caseCount: violations.length,
			entries: violations.map((result) => ({ file: result.file, violations: result.structural.violations })),
		},
		matrix: {
			total: results.length,
			predecessorChanged: results.filter((result) => result.predecessorChanged).length,
			exactChanged: changed.length,
			unchangedExactCanonical: results.length - changed.length,
			suppressedPredecessor: suppressed.length,
			suppressedConnectedFamily: suppressed.filter((result) =>
				result.certificate.predecessor.provenanceKind === "connected-family-local").length,
			suppressedForegroundCollapse: suppressed.filter((result) =>
				result.certificate.predecessor.provenanceKind === "foreground-collapse").length,
			suppressedByRoleSeparation: suppressed.filter((result) =>
				!result.certificate.guards.roleSeparation).length,
			suppressedByLargeMoveIdentity: suppressed.filter((result) =>
				!result.certificate.guards.largeMoveIdentityGain).length,
			developmentChanged: changed.filter((result) => result.cohort === "development").length,
			cohort00Changed: changed.filter((result) => result.cohort === "00").length,
		},
		reviewTransfer: transferArtifact.coverage,
		reviewEvidence: {
			candidateWeakOrUnacceptable: candidateNegative,
			comparison: transferArtifact.comparison,
			strictZeroRegressionPass: candidateNegative === 0 && comparisons("baseline-stronger") === 0 &&
				comparisons("candidate-stronger") > 0,
		},
		performance: {
			meanMs: results.reduce((sum, result) => sum + result.elapsedMs, 0) / results.length,
			maximumMs: Math.max(...results.map((result) => result.elapsedMs)),
			totalWorkerMs: results.reduce((sum, result) => sum + result.elapsedMs, 0),
		},
		disposition: violations.length === 0 && comparisons("candidate-stronger") > 0
			? "structurally-passing-narrowed-accent-with-exact-review-transfer"
			: "candidate-rejected",
	}
	await mkdir(outputRoot)
	await Promise.all([
		writeExclusive(join(outputRoot, "protocol.json"), protocol),
		writeExclusive(join(outputRoot, "manifest.json"), { ...identity, experimentId, generatedAt }),
		writeExclusive(join(outputRoot, "analysis.json"), analysis),
		writeExclusive(join(outputRoot, "results.json"), resultArtifact),
		writeExclusive(join(outputRoot, "certificates.json"), certificates),
		writeExclusive(join(outputRoot, "frontier.json"), frontier),
		writeExclusive(join(outputRoot, "review-transfer.json"), transferArtifact),
	])
	process.stderr.write(`Wrote narrowed accent experiment ${experimentId} to ${outputRoot}\n`)
}

if (!isMainThread) {
	runWorker(workerData as Task[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => { throw error })
} else {
	await main()
}
