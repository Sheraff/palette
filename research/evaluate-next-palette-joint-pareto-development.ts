import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import { compareSpatialPalettes } from "./src/candidate-comparison.ts"
import { apcaContrast } from "./src/color.ts"
import { ALGORITHM_VERSION } from "./src/extract.ts"
import { loadImage } from "./src/image.ts"
import {
	extractNextPaletteJointParetoWithContext,
	NEXT_PALETTE_JOINT_PARETO_ALGORITHM_VERSION,
	NEXT_PALETTE_JOINT_PARETO_POLICY,
	type NextPaletteJointParetoCertificate,
} from "./src/next-palette-joint-pareto.ts"
import type { CorpusResult, ExtractionResult, Palette, RoleName } from "./src/types.ts"

const EXPERIMENT_VERSION = "next-palette-joint-pareto-0.5.0-development"
const EVIDENCE_EXPERIMENT_ID = "1241b18a1f8d882f36da4e2e9bf6b50928d71394e1b848b92a92e09def4660f9"
const PREDECESSOR_ACCENT_EXPERIMENT_ID = "23801e1753f397da70865be2ad8bdd23b26ca1652f9b42c041b352b044275ebe"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const outputRoot = join(researchRoot, "data/experiments", EXPERIMENT_VERSION)

const inputFiles = {
	evidenceManifest: "research/data/experiments/joint-palette-evidence-frontier-0.1.1-development/manifest.json",
	evidenceAnalysis: "research/data/experiments/joint-palette-evidence-frontier-0.1.1-development/analysis.json",
	evidenceResults: "research/data/experiments/joint-palette-evidence-frontier-0.1.1-development/results.json",
	completeAccentAttribution:
		"research/data/experiments/next-palette-incumbent-accent-0.1.0-development/review-v1/complete-review-attribution.json",
	batch01Analysis:
		"research/data/experiments/next-palette-incumbent-accent-0.1.0-development/review-v1/batch-01-analysis.json",
	batch02Analysis:
		"research/data/experiments/next-palette-incumbent-accent-0.1.0-development/review-v1/batch-02-analysis.json",
	predecessorAccentResults:
		"research/data/experiments/next-palette-incumbent-accent-0.1.0-development/results.json",
	canonicalDevelopment: "research/data/results.json",
	canonical00: "research/data/holdout-results.json",
} as const

const implementationFiles = [
	"package.json",
	"pnpm-lock.yaml",
	"research/NEXT_PALETTE_JOINT_INFERENCE_PLAN.md",
	"research/src/types.ts",
	"research/src/color.ts",
	"research/src/image.ts",
	"research/src/regions.ts",
	"research/src/candidates.ts",
	"research/src/palette-perception.ts",
	"research/src/palette-evidence-graph.ts",
	"research/src/palette-relation-graph.ts",
	"research/src/field-relation.ts",
	"research/src/connected-family-candidate-availability.ts",
	"research/src/connected-family-representative-fidelity.ts",
	"research/src/joint-palette-evidence.ts",
	"research/src/next-palette-joint-pareto.ts",
	"research/evaluate-next-palette-joint-pareto-development.ts",
	"research/tests/joint-palette-evidence.test.ts",
	"research/tests/next-palette-joint-pareto.test.ts",
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
	certificate: NextPaletteJointParetoCertificate
	comparison: ReturnType<typeof compareSpatialPalettes>
	exactChanged: boolean
	changedRoles: RoleName[]
	gradientChanged: boolean
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

function semanticKey(palette: Palette): string {
	return JSON.stringify({
		background: [palette.background.rgb, palette.background.generated],
		foreground: [palette.foreground.rgb, palette.foreground.generated],
		surface: [palette.surface.rgb, palette.surface.generated],
		accent: [palette.accent.rgb, palette.accent.generated],
		gradient: palette.gradient.isGradient,
	})
}

function canonicalMap(development: CorpusResult, canonical00: CorpusResult): Map<string, ExtractionResult> {
	return new Map([
		...development.entries.map((entry) => [`images/${entry.file}`, entry.extraction] as const),
		...canonical00.entries.map((entry) => [entry.file, entry.extraction] as const),
	])
}

function structural(
	canonical: ExtractionResult,
	result: ReturnType<typeof extractNextPaletteJointParetoWithContext>,
	imageData: Uint8Array,
): { violations: string[] } {
	const violations: string[] = []
	const incumbent = canonical.methods.spatial
	const candidate = result.palette
	if (!isDeepStrictEqual(extractionWithoutRuntime(result.canonicalExtraction), extractionWithoutRuntime(canonical))) {
		violations.push("canonical-recomputation")
	}
	if (!isDeepStrictEqual(result.canonicalExtraction.methods.expressive, canonical.methods.expressive)) {
		violations.push("frozen-expressive")
	}
	if (!isDeepStrictEqual(result.canonicalExtraction.methods.quantized, canonical.methods.quantized)) {
		violations.push("frozen-quantized")
	}
	const changed = semanticKey(candidate) !== semanticKey(incumbent)
	if (changed !== result.certificate.selected.changed) violations.push("changed-decision")
	if (!changed && !isDeepStrictEqual(candidate, incumbent)) violations.push("unchanged-not-exact-canonical")
	if (changed) {
		if (!result.certificate.selected.admitted || result.certificate.selected.objectiveDeltas.some((delta) => delta < -1e-12) ||
			!result.certificate.selected.objectiveDeltas.some((delta) => delta > 1e-12)) violations.push("incumbent-dominance")
		if (!result.certificate.selected.fieldTreatment) violations.push("missing-field-treatment")
		for (const role of ["background", "foreground", "surface", "accent"] as const) {
			const provenance = result.certificate.selected.roles[role]
			if (!("representativePixelIndex" in provenance) || provenance.representativePixelIndex < 0) {
				violations.push(`source-provenance:${role}`)
				continue
			}
			const offset = provenance.representativePixelIndex * 3
			if (provenance.rgb[0] !== imageData[offset] || provenance.rgb[1] !== imageData[offset + 1] ||
				provenance.rgb[2] !== imageData[offset + 2] || candidate[role].generated) {
				violations.push(`source-provenance:${role}`)
			}
		}
		if (candidate.foreground.hex === candidate.background.hex || candidate.foreground.hex === candidate.surface.hex) {
			violations.push("foreground-field-collapse")
		}
		if (candidate.accent.hex === candidate.background.hex || candidate.accent.hex === candidate.surface.hex) {
			violations.push("accent-field-collapse")
		}
		if (candidate.foreground.hex === candidate.accent.hex && incumbent.foreground.hex !== incumbent.accent.hex) {
			violations.push("introduced-foreground-accent-collapse")
		}
	}
	if (new Set([candidate.background.hex, candidate.foreground.hex, candidate.surface.hex, candidate.accent.hex]).size > 4) {
		violations.push("cardinality")
	}
	if (changed) {
		const selectedState = result.certificate.selected.fieldState
		if ((selectedState === "gradient") !== candidate.gradient.isGradient ||
			(selectedState === "collapsed") !== (candidate.background.hex === candidate.surface.hex)) {
			violations.push("field-state")
		}
	}
	const apca = result.certificate.selected.apcaLc
	const recomputed = {
		foregroundOnBackground: apcaContrast(candidate.foreground.rgb, candidate.background.rgb),
		foregroundOnSurface: apcaContrast(candidate.foreground.rgb, candidate.surface.rgb),
		accentOnBackground: apcaContrast(candidate.accent.rgb, candidate.background.rgb),
		accentOnSurface: apcaContrast(candidate.accent.rgb, candidate.surface.rgb),
	}
	if (!isDeepStrictEqual(apca, recomputed) || Object.values(apca).some((value) => !Number.isFinite(value))) {
		violations.push("signed-apca")
	}
	if (result.certificate.policy.fixedApcaAdmissionFloor !== null ||
		Object.keys(result.certificate.ablations).length !== 8) violations.push("policy-certificate")
	return { violations: [...new Set(violations)].sort() }
}

async function evaluate(task: Task): Promise<WorkerResult> {
	if (!/^(?:images|00)\/[^/\\]+$/.test(task.path)) throw new Error(`Unauthorized source path: ${task.path}`)
	const bytes = await readFile(join(projectRoot, task.path))
	if (bytes.byteLength !== task.bytes || sha256(bytes) !== task.sha256) throw new Error(`Source binding changed: ${task.path}`)
	const image = await loadImage(bytes)
	const started = performance.now()
	const result = extractNextPaletteJointParetoWithContext(image)
	const elapsedMs = performance.now() - started
	const canonical = task.canonical.methods.spatial
	const changedRoles = (["background", "foreground", "surface", "accent"] as const).filter((role) =>
		JSON.stringify([result.palette[role].rgb, result.palette[role].generated]) !==
		JSON.stringify([canonical[role].rgb, canonical[role].generated]))
	return {
		cohort: task.cohort,
		file: task.path,
		source: { sha256: task.sha256, bytes: task.bytes },
		palette: result.palette,
		certificate: result.certificate,
		comparison: compareSpatialPalettes(canonical, result.palette),
		exactChanged: semanticKey(canonical) !== semanticKey(result.palette),
		changedRoles,
		gradientChanged: result.palette.gradient.isGradient !== canonical.gradient.isGradient,
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
					process.stderr.write(`joint Pareto evaluation: ${completed}/${tasks.length}\r`)
				}
			}
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Joint Pareto worker exited with code ${code}`))
		})
	}))
	const results = (await Promise.all(workers)).flat().sort((first, second) =>
		first.cohort.localeCompare(second.cohort) || first.file.localeCompare(second.file))
	process.stderr.write(`joint Pareto evaluation: ${results.length}/${tasks.length}\n`)
	return results
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite existing joint Pareto experiment: ${outputRoot}`)
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) {
		throw new Error("evaluate-next-palette-joint-pareto-development.ts does not accept arguments")
	}
	await assertOutputAbsent()
	const inputEntries = await Promise.all(Object.entries(inputFiles).map(async ([name, path]) => {
		const raw = await readFile(join(projectRoot, path))
		return [name, { path, raw, sha256: sha256(raw) }] as const
	}))
	const inputs = Object.fromEntries(inputEntries) as Record<keyof typeof inputFiles, { path: string; raw: Buffer; sha256: string }>
	const parse = <T>(name: keyof typeof inputFiles): T => JSON.parse(inputs[name].raw.toString("utf8")) as T
	const evidenceManifest = parse<{ experimentId: string; sources: Source[] }>("evidenceManifest")
	const evidenceAnalysis = parse<{ experimentId: string; structural: { pass: boolean }; stoppingRules: { pass: boolean } }>(
		"evidenceAnalysis",
	)
	const evidenceResults = parse<{ experimentId: string; entries: unknown[] }>("evidenceResults")
	const attribution = parse<{
		experimentId: string
		backgroundSurfaceBacklog: { caseIds: string[] }
	}>("completeAccentAttribution")
	const reviewEntries = [
		...parse<{ entries: ReviewEntry[] }>("batch01Analysis").entries,
		...parse<{ entries: ReviewEntry[] }>("batch02Analysis").entries,
	]
	const predecessorResults = parse<{
		experimentId: string
		entries: Array<{ file: string; palette: Palette; exactChanged: boolean }>
	}>("predecessorAccentResults")
	const canonicalDevelopment = parse<CorpusResult>("canonicalDevelopment")
	const canonical00 = parse<CorpusResult>("canonical00")
	if (evidenceManifest.experimentId !== EVIDENCE_EXPERIMENT_ID || evidenceAnalysis.experimentId !== EVIDENCE_EXPERIMENT_ID ||
		evidenceResults.experimentId !== EVIDENCE_EXPERIMENT_ID || !evidenceAnalysis.structural.pass ||
		!evidenceAnalysis.stoppingRules.pass || evidenceManifest.sources.length !== 392 || evidenceResults.entries.length !== 392 ||
		attribution.experimentId !== PREDECESSOR_ACCENT_EXPERIMENT_ID ||
		predecessorResults.experimentId !== PREDECESSOR_ACCENT_EXPERIMENT_ID ||
		canonicalDevelopment.algorithmVersion !== ALGORITHM_VERSION || canonical00.algorithmVersion !== ALGORITHM_VERSION) {
		throw new Error("Joint Pareto input bindings disagree")
	}
	const canonicalByFile = canonicalMap(canonicalDevelopment, canonical00)
	const tasks = evidenceManifest.sources.map((source): Task => {
		const canonical = canonicalByFile.get(source.path)
		if (!canonical) throw new Error(`Missing canonical incumbent: ${source.path}`)
		return { ...source, canonical }
	})
	const results = await runParallel(tasks)
	const violations = results.filter((result) => result.structural.violations.length > 0)
	const changed = results.filter((result) => result.exactChanged)
	const predecessorByFile = new Map(predecessorResults.entries.filter((entry) => entry.exactChanged)
		.map((entry) => [entry.file, entry.palette]))
	const reviewByFile = new Map(reviewEntries.map((entry) => [entry.file, entry]))
	const transfers = changed.flatMap((result) => {
		const predecessor = predecessorByFile.get(result.file)
		const review = reviewByFile.get(result.file)
		return predecessor && review && semanticKey(predecessor) === semanticKey(result.palette)
			? [{ ...review, transferBasis: "exact-canonical-and-candidate-semantic-palette-match" as const }]
			: []
	})
	const backlogCases = new Set(attribution.backgroundSurfaceBacklog.caseIds)
	const backlogFiles = new Set(reviewEntries.filter((entry) => backlogCases.has(entry.caseId)).map((entry) => entry.file))
	const changedRole = (role: RoleName) => changed.filter((result) => result.changedRoles.includes(role)).length
	const protocol = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		candidateAlgorithmVersion: NEXT_PALETTE_JOINT_PARETO_ALGORITHM_VERSION,
		baselineAlgorithmVersion: ALGORITHM_VERSION,
		evidenceExperimentId: EVIDENCE_EXPERIMENT_ID,
		authorization: {
			developmentOnly: true,
			allowedSourceRoots: ["images", "00"],
			outputUnseenRootsOpened: [] as string[],
			completeChangedSetReviewAuthorized: false,
			canonicalPromotionAuthorized: false,
			candidateFreezeAuthorized: false,
			reserveAccessAuthorized: false,
		},
		stoppingRules: {
			structuralViolationsMustEqual: 0,
			everyUnchangedPaletteMustEqualCanonicalExactly: true,
			everyChangedPaletteMustParetoDominateCanonical: true,
			everyChangedRoleMustBeSourceExact: true,
			noIntroducedForegroundAccentCollapse: true,
			noFixedApcaAdmissionFloor: true,
			completeChangedSetReviewRequiredBeforeFreeze: true,
		},
	}
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (path) =>
		[path, sha256(await readFile(join(projectRoot, path)))] as const)))
	const identity = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		candidateIdentity: {
			algorithmVersion: NEXT_PALETTE_JOINT_PARETO_ALGORITHM_VERSION,
			selection: NEXT_PALETTE_JOINT_PARETO_POLICY.selection,
		},
		policy: NEXT_PALETTE_JOINT_PARETO_POLICY,
		protocol,
		inputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, { path: input.path, sha256: input.sha256 }])),
		sources: evidenceManifest.sources,
		implementation,
	}
	const experimentId = sha256(JSON.stringify(canonicalValue(identity)))
	const generatedAt = new Date().toISOString()
	const resultArtifact = {
		schemaVersion: 1,
		experimentId,
		algorithmVersion: NEXT_PALETTE_JOINT_PARETO_ALGORITHM_VERSION,
		entries: results.map((result) => ({
			cohort: result.cohort,
			file: result.file,
			source: result.source,
			palette: result.palette,
			exactChanged: result.exactChanged,
			changedRoles: result.changedRoles,
			gradientChanged: result.gradientChanged,
			comparison: result.comparison,
			structural: result.structural,
		})),
	}
	const certificates = {
		schemaVersion: 1,
		experimentId,
		algorithmVersion: NEXT_PALETTE_JOINT_PARETO_ALGORITHM_VERSION,
		entries: Object.fromEntries(results.map((result) => [result.file, result.certificate])),
	}
	const frontier = {
		schemaVersion: 1,
		experimentId,
		algorithmVersion: NEXT_PALETTE_JOINT_PARETO_ALGORITHM_VERSION,
		entries: changed.map((result) => ({
			file: result.file,
			cohort: result.cohort,
			currentEvidenceClassification: "unknown",
			changedRoles: result.changedRoles,
			gradientChanged: result.gradientChanged,
			baseline: canonicalByFile.get(result.file)!.methods.spatial,
			candidate: result.palette,
			source: { path: result.file, ...result.source },
			selected: result.certificate.selected,
			ablations: result.certificate.ablations,
		})),
	}
	const transferArtifact = {
		schemaVersion: 1,
		experimentId,
		predecessorExperimentId: PREDECESSOR_ACCENT_EXPERIMENT_ID,
		generatedAt,
		policy: "Transfer only exact canonical and candidate semantic palette matches.",
		coverage: {
			changed: changed.length,
			transferred: transfers.length,
			freshReviewRequired: changed.length - transfers.length,
		},
		entries: transfers,
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
			unchangedExactCanonical: results.length - changed.length,
			developmentChanged: changed.filter((result) => result.cohort === "development").length,
			cohort00Changed: changed.filter((result) => result.cohort === "00").length,
			backgroundChanged: changedRole("background"),
			foregroundChanged: changedRole("foreground"),
			surfaceChanged: changedRole("surface"),
			accentChanged: changedRole("accent"),
			gradientChanged: changed.filter((result) => result.gradientChanged).length,
			incumbentEvidenceUnavailable: results.filter((result) => !result.certificate.incumbent.evidenceAvailable).length,
			selectedCollapsedField: changed.filter((result) => result.certificate.selected.fieldState === "collapsed").length,
			selectedDistinctFlatField: changed.filter((result) => result.certificate.selected.fieldState === "distinct-flat").length,
			selectedGradientField: changed.filter((result) => result.certificate.selected.fieldState === "gradient").length,
		},
		backgroundSurfaceBacklog: {
			total: backlogFiles.size,
			changed: changed.filter((result) => backlogFiles.has(result.file)).length,
			fieldChanged: changed.filter((result) => backlogFiles.has(result.file) &&
				(result.changedRoles.includes("background") || result.changedRoles.includes("surface") || result.gradientChanged)).length,
		},
		review: {
			required: changed.length > 0,
			authorized: false,
			completeChangedSetSize: changed.length,
			exactJudgmentTransfers: transfers.length,
			freshBlindedComparisonsRequired: changed.length - transfers.length,
			passingJudgmentRequired: {
				weakOrUnacceptableCandidate: 0,
				baselineStronger: 0,
				candidateStrongerMinimum: 1,
			},
		},
		performance: {
			meanMs: results.reduce((sum, result) => sum + result.elapsedMs, 0) / results.length,
			maximumMs: Math.max(...results.map((result) => result.elapsedMs)),
			totalWorkerMs: results.reduce((sum, result) => sum + result.elapsedMs, 0),
		},
		disposition: violations.length === 0 && changed.length > 0
			? "joint-candidate-built-complete-changed-set-review-authorization-required"
			: "joint-candidate-rejected",
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
	process.stderr.write(`Wrote joint Pareto experiment ${experimentId} to ${outputRoot}\n`)
}

if (!isMainThread) {
	runWorker(workerData as Task[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => { throw error })
} else {
	await main()
}
