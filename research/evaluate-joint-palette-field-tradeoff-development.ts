import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import { ALGORITHM_VERSION } from "./src/extract.ts"
import {
	buildJointPaletteFieldTradeoff,
	JOINT_PALETTE_FIELD_TRADEOFF_POLICY,
	JOINT_PALETTE_FIELD_TRADEOFF_VERSION,
	type JointPaletteFieldTradeoffCertificate,
} from "./src/joint-palette-field-tradeoff.ts"
import { loadImage } from "./src/image.ts"
import type { CorpusResult, ExtractionResult, Palette } from "./src/types.ts"

const EXPERIMENT_VERSION = "joint-palette-field-tradeoff-0.1.1-development"
const EVIDENCE_EXPERIMENT_ID = "1241b18a1f8d882f36da4e2e9bf6b50928d71394e1b848b92a92e09def4660f9"
const ACCENT_EXPERIMENT_ID = "23801e1753f397da70865be2ad8bdd23b26ca1652f9b42c041b352b044275ebe"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const outputRoot = join(researchRoot, "data/experiments", EXPERIMENT_VERSION)

const inputFiles = {
	evidenceManifest: "research/data/experiments/joint-palette-evidence-frontier-0.1.1-development/manifest.json",
	evidenceAnalysis: "research/data/experiments/joint-palette-evidence-frontier-0.1.1-development/analysis.json",
	completeAccentAttribution:
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
	"research/src/joint-palette-field-tradeoff.ts",
	"research/evaluate-joint-palette-field-tradeoff-development.ts",
	"research/tests/joint-palette-field-tradeoff.test.ts",
] as const

type Source = { cohort: "development" | "00"; path: string; sha256: string; bytes: number }
type Task = Source & { caseId: string; canonical: ExtractionResult }
type ReviewEntry = { caseId: string; file: string; note: string }
type WorkerResult = {
	caseId: string
	cohort: Source["cohort"]
	file: string
	source: { sha256: string; bytes: number }
	canonical: Palette
	candidate: Palette | null
	certificate: JointPaletteFieldTradeoffCertificate
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

function canonicalMap(development: CorpusResult, canonical00: CorpusResult): Map<string, ExtractionResult> {
	return new Map([
		...development.entries.map((entry) => [`images/${entry.file}`, entry.extraction] as const),
		...canonical00.entries.map((entry) => [entry.file, entry.extraction] as const),
	])
}

function sourceHasRgb(data: Uint8Array, rgb: readonly number[]): boolean {
	for (let offset = 0; offset < data.length; offset += 3) {
		if (data[offset] === rgb[0] && data[offset + 1] === rgb[1] && data[offset + 2] === rgb[2]) return true
	}
	return false
}

async function evaluate(task: Task): Promise<WorkerResult> {
	if (!/^(?:images|00)\/[^/\\]+$/.test(task.path)) throw new Error(`Unauthorized source path: ${task.path}`)
	const bytes = await readFile(join(projectRoot, task.path))
	if (bytes.byteLength !== task.bytes || sha256(bytes) !== task.sha256) throw new Error(`Source binding changed: ${task.path}`)
	const image = await loadImage(bytes)
	const started = performance.now()
	const result = buildJointPaletteFieldTradeoff(image)
	const elapsedMs = performance.now() - started
	const violations: string[] = []
	if (result.certificate.policy.fixedApcaAdmissionFloor !== null || !result.certificate.invariants.diagnosticOnly) {
		violations.push("policy")
	}
	if (result.candidate) {
		if (!result.certificate.selected || !result.certificate.selected.changedBlocks.field ||
			!result.certificate.selected.objectiveDeltas.some((delta, index) => index < 2 && delta > 1e-12)) {
			violations.push("field-improvement")
		}
		if (result.canonical.background.hex === result.canonical.surface.hex &&
			result.candidate.background.hex === result.candidate.surface.hex) violations.push("under-collapse-treatment")
		for (const role of ["background", "foreground", "surface", "accent"] as const) {
			if (result.candidate[role].generated || !sourceHasRgb(image.data, result.candidate[role].rgb)) {
				violations.push(`source-provenance:${role}`)
			}
		}
		if (result.candidate.foreground.hex === result.candidate.background.hex ||
			result.candidate.foreground.hex === result.candidate.surface.hex ||
			result.candidate.accent.hex === result.candidate.background.hex ||
			result.candidate.accent.hex === result.candidate.surface.hex) violations.push("overlay-field-collapse")
		if (result.candidate.foreground.hex === result.candidate.accent.hex &&
			result.canonical.foreground.hex !== result.canonical.accent.hex) violations.push("introduced-overlay-collapse")
		if (new Set([result.candidate.background.hex, result.candidate.foreground.hex, result.candidate.surface.hex,
			result.candidate.accent.hex]).size > 4) violations.push("cardinality")
	}
	return {
		caseId: task.caseId,
		cohort: task.cohort,
		file: task.path,
		source: { sha256: task.sha256, bytes: task.bytes },
		canonical: task.canonical.methods.spatial,
		candidate: result.candidate,
		certificate: result.certificate,
		structural: { violations: [...new Set(violations)].sort() },
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
	const workers = partitions.map((partition) => new Promise<WorkerResult[]>((resolveWorker, rejectWorker) => {
		const worker = new Worker(new URL(import.meta.url), { workerData: partition })
		worker.on("message", (message: { progress: number } | { results: WorkerResult[] }) => {
			if ("results" in message) resolveWorker(message.results)
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Field tradeoff worker exited with code ${code}`))
		})
	}))
	return (await Promise.all(workers)).flat().sort((first, second) => compareAscii(first.caseId, second.caseId))
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite existing field tradeoff experiment: ${outputRoot}`)
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) {
		throw new Error("evaluate-joint-palette-field-tradeoff-development.ts does not accept arguments")
	}
	await assertOutputAbsent()
	const inputEntries = await Promise.all(Object.entries(inputFiles).map(async ([name, path]) => {
		const raw = await readFile(join(projectRoot, path))
		return [name, { path, raw, sha256: sha256(raw) }] as const
	}))
	const inputs = Object.fromEntries(inputEntries) as Record<keyof typeof inputFiles, { path: string; raw: Buffer; sha256: string }>
	const parse = <T>(name: keyof typeof inputFiles): T => JSON.parse(inputs[name].raw.toString("utf8")) as T
	const evidenceManifest = parse<{ experimentId: string; sources: Source[] }>("evidenceManifest")
	const evidenceAnalysis = parse<{ experimentId: string; stoppingRules: { pass: boolean } }>("evidenceAnalysis")
	const attribution = parse<{
		experimentId: string
		backgroundSurfaceBacklog: { caseIds: string[] }
	}>("completeAccentAttribution")
	const reviewEntries = [
		...parse<{ entries: ReviewEntry[] }>("batch01Analysis").entries,
		...parse<{ entries: ReviewEntry[] }>("batch02Analysis").entries,
	]
	const canonicalDevelopment = parse<CorpusResult>("canonicalDevelopment")
	const canonical00 = parse<CorpusResult>("canonical00")
	if (evidenceManifest.experimentId !== EVIDENCE_EXPERIMENT_ID || evidenceAnalysis.experimentId !== EVIDENCE_EXPERIMENT_ID ||
		!evidenceAnalysis.stoppingRules.pass || attribution.experimentId !== ACCENT_EXPERIMENT_ID ||
		attribution.backgroundSurfaceBacklog.caseIds.length !== 13 ||
		canonicalDevelopment.algorithmVersion !== ALGORITHM_VERSION || canonical00.algorithmVersion !== ALGORITHM_VERSION) {
		throw new Error("Field tradeoff diagnostic input bindings disagree")
	}
	const sourceByFile = new Map(evidenceManifest.sources.map((source) => [source.path, source]))
	const canonicalByFile = canonicalMap(canonicalDevelopment, canonical00)
	const reviewByCase = new Map(reviewEntries.map((entry) => [entry.caseId, entry]))
	const tasks = attribution.backgroundSurfaceBacklog.caseIds.map((caseId): Task => {
		const review = reviewByCase.get(caseId)
		const source = review && sourceByFile.get(review.file)
		const canonical = review && canonicalByFile.get(review.file)
		if (!review || !source || !canonical) throw new Error(`Unbound field backlog case: ${caseId}`)
		return { ...source, caseId, canonical }
	})
	const results = await runParallel(tasks)
	const violations = results.filter((result) => result.structural.violations.length > 0)
	const candidates = results.filter((result) => result.candidate)
	const protocol = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		diagnosticVersion: JOINT_PALETTE_FIELD_TRADEOFF_VERSION,
		evidenceExperimentId: EVIDENCE_EXPERIMENT_ID,
		authorization: {
			developmentOnly: true,
			cohortSelectedFromReviewComments: true,
			commentsEnterInference: false,
			allowedSourceRoots: ["images", "00"],
			outputUnseenRootsOpened: [] as string[],
			targetedDiagnosticReviewAuthorized: true,
			authorizationBasis: "explicit-user-approval-joint-inference-plan-2026-07-22",
			canonicalPromotionAuthorized: false,
			candidateFreezeAuthorized: false,
			reserveAccessAuthorized: false,
		},
		stoppingRules: {
			structuralViolationsMustEqual: 0,
			everyCandidateMustChangeFieldBlock: true,
			everyCandidateMustImproveSourceFieldEvidence: true,
			everyCandidateMustBeSourceExact: true,
			noFixedApcaAdmissionFloor: true,
			noCandidateIsAnExtractionOutput: true,
		},
	}
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (path) =>
		[path, sha256(await readFile(join(projectRoot, path)))] as const)))
	const identity = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		diagnosticVersion: JOINT_PALETTE_FIELD_TRADEOFF_VERSION,
		policy: JOINT_PALETTE_FIELD_TRADEOFF_POLICY,
		protocol,
		inputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, { path: input.path, sha256: input.sha256 }])),
		sources: tasks.map(({ canonical: _canonical, caseId, ...source }) => ({ ...source, caseId })),
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
			pass: violations.length === 0,
			violationCount: violations.reduce((sum, result) => sum + result.structural.violations.length, 0),
			caseCount: violations.length,
			entries: violations.map((result) => ({ caseId: result.caseId, file: result.file,
				violations: result.structural.violations })),
		},
		coverage: {
			commentedFieldCases: results.length,
			candidateAvailable: candidates.length,
			noFieldTradeoffAvailable: results.length - candidates.length,
			reviewCases: candidates.length,
		},
		states: {
			collapsed: candidates.filter((result) => result.certificate.selected?.fieldState === "collapsed").length,
			"distinct-flat": candidates.filter((result) => result.certificate.selected?.fieldState === "distinct-flat").length,
			gradient: candidates.filter((result) => result.certificate.selected?.fieldState === "gradient").length,
		},
		review: {
			required: candidates.length > 0,
			authorized: true,
			freshBlindedComparisonsRequired: candidates.length,
			diagnosticOnly: true,
		},
		disposition: violations.length === 0 && candidates.length > 0
			? "targeted-field-tradeoff-review-ready"
			: "field-tradeoff-diagnostic-rejected",
	}
	const resultArtifact = {
		schemaVersion: 1,
		experimentId,
		diagnosticVersion: JOINT_PALETTE_FIELD_TRADEOFF_VERSION,
		entries: results.map(({ elapsedMs: _elapsedMs, ...result }) => result),
	}
	const frontier = {
		schemaVersion: 1,
		experimentId,
		diagnosticVersion: JOINT_PALETTE_FIELD_TRADEOFF_VERSION,
		entries: candidates.map((result) => ({
			caseId: result.caseId,
			file: result.file,
			cohort: result.cohort,
			changedRoles: ["background", "foreground", "surface", "accent"].filter((role) =>
				JSON.stringify(result.canonical[role as keyof Pick<Palette, "background" | "foreground" | "surface" | "accent">].rgb) !==
				JSON.stringify(result.candidate![role as keyof Pick<Palette, "background" | "foreground" | "surface" | "accent">].rgb)),
			gradientChanged: result.canonical.gradient.isGradient !== result.candidate!.gradient.isGradient,
			baseline: result.canonical,
			candidate: result.candidate,
			source: { path: result.file, ...result.source },
			selected: result.certificate.selected,
		})),
	}
	await mkdir(outputRoot)
	await Promise.all([
		writeExclusive(join(outputRoot, "protocol.json"), protocol),
		writeExclusive(join(outputRoot, "manifest.json"), { ...identity, experimentId, generatedAt }),
		writeExclusive(join(outputRoot, "analysis.json"), analysis),
		writeExclusive(join(outputRoot, "results.json"), resultArtifact),
		writeExclusive(join(outputRoot, "frontier.json"), frontier),
	])
	process.stderr.write(`Wrote field tradeoff diagnostic ${experimentId} to ${outputRoot}\n`)
}

if (!isMainThread) {
	runWorker(workerData as Task[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => { throw error })
} else {
	await main()
}
