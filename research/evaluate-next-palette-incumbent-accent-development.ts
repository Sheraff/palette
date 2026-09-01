import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import { compareSpatialPalettes } from "./src/candidate-comparison.ts"
import { ALGORITHM_VERSION } from "./src/extract.ts"
import { loadImage } from "./src/image.ts"
import {
	extractNextPaletteIncumbentAccentWithContext,
	NEXT_PALETTE_INCUMBENT_ACCENT_ALGORITHM_VERSION,
	NEXT_PALETTE_INCUMBENT_ACCENT_POLICY,
	type NextPaletteIncumbentAccentCertificate,
} from "./src/next-palette-incumbent-accent.ts"
import type { CorpusResult, ExtractionResult, Palette } from "./src/types.ts"

const EXPERIMENT_VERSION = "next-palette-incumbent-accent-0.1.0-development"
const STAGE_2_EXPERIMENT_ID = "b5681a99e635dfa94bac6d6bc33f35a96264f341d2743f3d9e92341c949ddd17"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const outputRoot = join(researchRoot, "data/experiments", EXPERIMENT_VERSION)

const inputFiles = {
	stage2Manifest:
		"research/data/experiments/connected-family-representative-fidelity-0.1.0-development/manifest.json",
	stage2Analysis:
		"research/data/experiments/connected-family-representative-fidelity-0.1.0-development/analysis.json",
	canonicalDevelopment: "research/data/results.json",
	canonical00: "research/data/holdout-results.json",
	sourceSelection: "research/data/selection.json",
	sourceCuration: "research/data/curation.json",
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
	"research/evaluate-next-palette-incumbent-accent-development.ts",
	"research/tests/next-palette-incumbent-accent.test.ts",
] as const

type Cohort = "development" | "00"
type Source = { cohort: Cohort; path: string; sha256: string; bytes: number }
type Stage2Manifest = { experimentId: string; sources: Source[] }
type Task = Source & { canonical: ExtractionResult }
type WorkerResult = {
	cohort: Cohort
	file: string
	source: { sha256: string; bytes: number }
	palette: Palette
	certificate: NextPaletteIncumbentAccentCertificate
	comparison: ReturnType<typeof compareSpatialPalettes>
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
	result: ReturnType<typeof extractNextPaletteIncumbentAccentWithContext>,
	imageData: Uint8Array,
): { violations: string[] } {
	const violations: string[] = []
	const incumbent = canonical.methods.spatial
	const candidate = result.palette
	for (const role of ["background", "foreground", "surface"] as const) {
		if (!isDeepStrictEqual(candidate[role], incumbent[role])) violations.push(`frozen-role:${role}`)
	}
	if (!isDeepStrictEqual(candidate.gradient, incumbent.gradient)) violations.push("frozen-gradient")
	if (!isDeepStrictEqual(result.canonicalExtraction.methods.expressive, canonical.methods.expressive)) {
		violations.push("frozen-expressive")
	}
	if (!isDeepStrictEqual(result.canonicalExtraction.methods.quantized, canonical.methods.quantized)) {
		violations.push("frozen-quantized")
	}
	if (!isDeepStrictEqual(extractionWithoutRuntime(result.canonicalExtraction), extractionWithoutRuntime(canonical))) {
		violations.push("canonical-recomputation")
	}
	const changed = paletteSemanticKey(candidate) !== paletteSemanticKey(incumbent)
	if (!changed && !isDeepStrictEqual(candidate, incumbent)) violations.push("unchanged-not-exact-canonical")
	if (changed !== result.certificate.selected.changed) violations.push("changed-decision")
	if (changed) {
		const selected = result.certificate.options.find((option) => option.optionId === result.certificate.selected.optionId)
		if (!selected || !selected.eligible || selected.failedGuards.length > 0) violations.push("selected-ineligible")
		if (selected && !selected.generated) {
			if (selected.provenance.representativePixelIndices.length === 0 ||
				!selected.provenance.representativePixelIndices.some((pixel) => {
					const offset = pixel * 3
					return selected.rgb[0] === imageData[offset] && selected.rgb[1] === imageData[offset + 1] &&
						selected.rgb[2] === imageData[offset + 2]
				})) violations.push("selected-source-provenance")
		}
		if (result.certificate.selected.identitySupportDelta <= 0 ||
			result.certificate.selected.backgroundContrastMagnitudeDelta < -1e-12) violations.push("selected-comparison")
	}
	if (result.certificate.options.some((option) => !Number.isFinite(option.contrast.background.signedLc) ||
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
	const result = extractNextPaletteIncumbentAccentWithContext(image)
	const elapsedMs = performance.now() - started
	const canonical = task.canonical.methods.spatial
	return {
		cohort: task.cohort,
		file: task.path,
		source: { sha256: task.sha256, bytes: task.bytes },
		palette: result.palette,
		certificate: result.certificate,
		comparison: compareSpatialPalettes(canonical, result.palette),
		exactChanged: paletteSemanticKey(canonical) !== paletteSemanticKey(result.palette),
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
					process.stderr.write(`incumbent accent evaluation: ${completed}/${tasks.length}\r`)
				}
			}
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Incumbent accent worker exited with code ${code}`))
		})
	}))
	const results = (await Promise.all(workers)).flat().sort((first, second) =>
		first.cohort.localeCompare(second.cohort) || first.file.localeCompare(second.file))
	process.stderr.write(`incumbent accent evaluation: ${results.length}/${tasks.length}\n`)
	return results
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite existing incumbent accent experiment: ${outputRoot}`)
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) {
		throw new Error("evaluate-next-palette-incumbent-accent-development.ts does not accept arguments")
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
	const stage2Manifest = parse<Stage2Manifest>("stage2Manifest")
	const stage2Analysis = parse<{ experimentId: string; stoppingRules: { pass: boolean } }>("stage2Analysis")
	const canonicalDevelopment = parse<CorpusResult>("canonicalDevelopment")
	const canonical00 = parse<CorpusResult>("canonical00")
	const curation = parse<{ entries: Array<{ image: string; decision: string }> }>("sourceCuration")
	if (stage2Manifest.experimentId !== STAGE_2_EXPERIMENT_ID || stage2Analysis.experimentId !== STAGE_2_EXPERIMENT_ID ||
		!stage2Analysis.stoppingRules.pass || stage2Manifest.sources.length !== 392 ||
		canonicalDevelopment.algorithmVersion !== ALGORITHM_VERSION || canonical00.algorithmVersion !== ALGORITHM_VERSION ||
		canonicalDevelopment.entries.length !== 37 || canonical00.entries.length !== 355) {
		throw new Error("Incumbent accent input bindings disagree")
	}
	const canonicalByFile = canonicalMap(canonicalDevelopment, canonical00)
	const tasks = stage2Manifest.sources.map((source): Task => {
		const canonical = canonicalByFile.get(source.path)
		if (!canonical) throw new Error(`Missing canonical incumbent: ${source.path}`)
		return { ...source, canonical }
	})
	const results = await runParallel(tasks)
	const violations = results.filter((result) => result.structural.violations.length > 0)
	const changed = results.filter((result) => result.exactChanged)
	const material = changed.filter((result) => result.certificate.selected.material)
	const curated = new Set(curation.entries.filter((entry) => entry.decision === "include").map((entry) => entry.image))
	const changedCurated = changed.filter((result) => curated.has(result.file)).length
	const canonicalRawHashesBefore = {
		development: inputs.canonicalDevelopment.sha256,
		canonical00: inputs.canonical00.sha256,
	}
	const canonicalRawHashesAfter = {
		development: sha256(await readFile(join(projectRoot, inputFiles.canonicalDevelopment))),
		canonical00: sha256(await readFile(join(projectRoot, inputFiles.canonical00))),
	}
	if (!isDeepStrictEqual(canonicalRawHashesBefore, canonicalRawHashesAfter)) {
		throw new Error("Canonical artifacts changed during incumbent accent evaluation")
	}
	const protocol = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		candidateAlgorithmVersion: NEXT_PALETTE_INCUMBENT_ACCENT_ALGORITHM_VERSION,
		baselineAlgorithmVersion: ALGORITHM_VERSION,
		authorization: {
			developmentOnly: true,
			allowedSourceRoots: ["images", "00"],
			outputUnseenRootsOpened: [] as string[],
			completeChangedSetReviewAuthorized: true,
			authorizationBasis: "explicit-user-request-execute-plan-and-request-review-2026-07-22",
			canonicalPromotionAuthorized: false,
			candidateFreezeAuthorized: false,
			reserveAccessAuthorized: false,
		},
		scope: "Replace only canonical 0.19 accent with a stronger exact connected-family representative.",
		stoppingRules: {
			structuralViolationsMustEqual: 0,
			everyUnchangedPaletteMustEqualCanonicalExactly: true,
			everyChangedPaletteMustFreezeAllNonAccentRolesAndGradient: true,
			everyChangedPaletteMustSelectOneEligibleSourceExactOption: true,
			everyChangedPaletteRequiresBlindedCompletePaletteReview: true,
			noFixedApcaAdmissionFloor: true,
			comparisonBaselineMustBeCanonical019: true,
		},
	}
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (path) =>
		[path, sha256(await readFile(join(projectRoot, path)))] as const)))
	const identity = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		candidateIdentity: {
			algorithmVersion: NEXT_PALETTE_INCUMBENT_ACCENT_ALGORITHM_VERSION,
			fidelityExperimentId: STAGE_2_EXPERIMENT_ID,
			selection: "strict-identity-gain-then-primary-apca-nondominance-then-incumbent-guards",
		},
		policy: NEXT_PALETTE_INCUMBENT_ACCENT_POLICY,
		protocol,
		inputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, {
			path: input.path,
			sha256: input.sha256,
		}])),
		sources: stage2Manifest.sources,
		implementation,
	}
	const experimentId = sha256(JSON.stringify(canonicalValue(identity)))
	const generatedAt = new Date().toISOString()
	const resultArtifact = {
		schemaVersion: 1,
		experimentId,
		algorithmVersion: NEXT_PALETTE_INCUMBENT_ACCENT_ALGORITHM_VERSION,
		entries: results.map((result) => ({
			cohort: result.cohort,
			file: result.file,
			source: result.source,
			palette: result.palette,
			exactChanged: result.exactChanged,
			comparison: result.comparison,
			structural: result.structural,
		})),
	}
	const certificates = {
		schemaVersion: 1,
		experimentId,
		algorithmVersion: NEXT_PALETTE_INCUMBENT_ACCENT_ALGORITHM_VERSION,
		entries: Object.fromEntries(results.map((result) => [result.file, result.certificate])),
	}
	const frontier = {
		schemaVersion: 1,
		experimentId,
		algorithmVersion: NEXT_PALETTE_INCUMBENT_ACCENT_ALGORITHM_VERSION,
		entries: changed.map((result) => ({
			file: result.file,
			cohort: result.cohort,
			currentEvidenceClassification: "unknown",
			changedRoles: ["accent"],
			gradientChanged: false,
			material: result.certificate.selected.material,
			baseline: canonicalByFile.get(result.file)!.methods.spatial,
			candidate: result.palette,
			source: { path: result.file, ...result.source },
			selected: result.certificate.selected,
		})),
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
			exactChanged: changed.length,
			materialChanged: material.length,
			submaterialChanged: changed.length - material.length,
			unchangedExactCanonical: results.length - changed.length,
			developmentChanged: changed.filter((result) => result.cohort === "development").length,
			cohort00Changed: changed.filter((result) => result.cohort === "00").length,
			curated00Changed: changedCurated,
			authorizedExtended00Changed: changed.filter((result) => result.cohort === "00").length - changedCurated,
			withIncumbentEvidence: results.filter((result) => result.certificate.incumbent.evidenceAvailable).length,
			withEligibleOption: results.filter((result) => result.certificate.counts.eligible > 0).length,
			selectedForegroundCollapse: changed.filter((result) => {
				const option = result.certificate.options.find((entry) => entry.optionId === result.certificate.selected.optionId)
				return option?.collapse.foreground
			}).length,
		},
		review: {
			required: changed.length > 0,
			authorized: true,
			completeChangedSetSize: changed.length,
			freshBlindedComparisonsRequired: changed.length,
			passingJudgmentRequired: {
				weakOrUnacceptableCandidate: 0,
				baselineStronger: 0,
				candidateStrongerMinimum: 1,
			},
		},
		canonicalPreservation: {
			recomputationMismatches: 0,
			rawHashesBefore: canonicalRawHashesBefore,
			rawHashesAfter: canonicalRawHashesAfter,
		},
		performance: {
			meanMs: results.reduce((sum, result) => sum + result.elapsedMs, 0) / results.length,
			maximumMs: Math.max(...results.map((result) => result.elapsedMs)),
			totalWorkerMs: results.reduce((sum, result) => sum + result.elapsedMs, 0),
		},
		disposition: violations.length === 0 && changed.length > 0
			? "candidate-built-complete-changed-set-review-required"
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
	])
	process.stderr.write(`Wrote incumbent accent experiment ${experimentId} to ${outputRoot}\n`)
}

if (!isMainThread) {
	runWorker(workerData as Task[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => { throw error })
} else {
	await main()
}
