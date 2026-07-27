import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import { apcaContrast } from "./src/color.ts"
import { ALGORITHM_VERSION } from "./src/extract.ts"
import { loadImage } from "./src/image.ts"
import {
	buildJointPaletteFieldDominanceFirst,
	JOINT_PALETTE_FIELD_DOMINANCE_FIRST_POLICY,
	JOINT_PALETTE_FIELD_DOMINANCE_FIRST_VERSION,
	type JointPaletteFieldDominanceCertificate,
} from "./src/joint-palette-field-dominance-first.ts"
import type { CorpusResult, ExtractionResult, Palette } from "./src/types.ts"

const EXPERIMENT_VERSION = "joint-palette-field-dominance-first-0.1.0-development"
const TRADEOFF_EXPERIMENT_ID = "43bf44701c2678214e7000e0d426775e3139e8ee01fd3d24b1883e8c4c5cdbd1"
const EVIDENCE_EXPERIMENT_ID = "1241b18a1f8d882f36da4e2e9bf6b50928d71394e1b848b92a92e09def4660f9"
const JOINT_PARETO_EXPERIMENT_ID = "c31541f6ad1fe7fb57cf9b6b5d4373a1f0ef00f7974c8dd9c511b804f3e6b283"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const outputRoot = join(researchRoot, "data/experiments", EXPERIMENT_VERSION)

const inputFiles = {
	tradeoffManifest: "research/data/experiments/joint-palette-field-tradeoff-0.1.1-development/manifest.json",
	tradeoffInterpretation:
		"research/data/experiments/joint-palette-field-tradeoff-0.1.1-development/review-v2/interpretation.json",
	evidenceManifest: "research/data/experiments/joint-palette-evidence-frontier-0.1.1-development/manifest.json",
	evidenceAnalysis: "research/data/experiments/joint-palette-evidence-frontier-0.1.1-development/analysis.json",
	evidenceResults: "research/data/experiments/joint-palette-evidence-frontier-0.1.1-development/results.json",
	jointParetoManifest: "research/data/experiments/next-palette-joint-pareto-0.5.0-development/manifest.json",
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
	"research/src/joint-palette-field-dominance-first.ts",
	"research/evaluate-joint-palette-field-dominance-first-development.ts",
	"research/tests/joint-palette-field-dominance-first.test.ts",
] as const

type Source = { cohort: "development" | "00"; path: string; sha256: string; bytes: number; caseId: string }
type Task = Source & { canonical: ExtractionResult }
type WorkerResult = {
	caseId: string
	cohort: Source["cohort"]
	file: string
	source: { sha256: string; bytes: number }
	canonical: Palette
	candidate: Palette | null
	certificate: JointPaletteFieldDominanceCertificate
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

function semanticState(palette: Palette): string {
	return JSON.stringify({
		roles: [palette.background, palette.foreground, palette.surface, palette.accent].map((role) =>
			[role.rgb, role.generated]),
		gradient: palette.gradient.isGradient,
	})
}

function structural(task: Task, result: ReturnType<typeof buildJointPaletteFieldDominanceFirst>, imageData: Uint8Array): string[] {
	const violations: string[] = []
	const incumbent = task.canonical.methods.spatial
	const candidate = result.candidate
	const certificate = result.certificate
	if (!isDeepStrictEqual(result.canonical, incumbent)) violations.push("canonical-recomputation")
	if (certificate.policy.fixedApcaAdmissionFloor !== null || !certificate.invariants.diagnosticOnly ||
		!certificate.invariants.requiredFieldBlockChange || !certificate.invariants.strictCanonicalDominance ||
		!certificate.invariants.minimumBlocksBeforeCandidatePareto ||
		!certificate.invariants.roleParetoWithinSemanticChangeClass) violations.push("policy")
	if (Object.keys(certificate.ablations).length !== 8 ||
		certificate.ablations["canonical-field-block"].route !== "constraint-conflicts-with-required-field-change" ||
		certificate.ablations["canonical-field-block"].admitted) violations.push("constrained-ablations")
	if (!candidate) {
		if (certificate.route !== "no-strict-dominator" || certificate.selected.admitted || certificate.selected.changed ||
			certificate.selected.roles || certificate.selected.fieldTreatment || certificate.selected.apcaLc) {
			violations.push("no-candidate-route")
		}
		return violations
	}
	if (certificate.route !== "strict-dominator" || !certificate.selected.admitted || !certificate.selected.changed ||
		!certificate.selected.roles || !certificate.selected.fieldTreatment || !certificate.selected.apcaLc) {
		violations.push("selected-certificate")
		return violations
	}
	if (semanticState(candidate) === semanticState(incumbent)) violations.push("unchanged-candidate")
	if (certificate.selected.changedSemanticBlocks !== Math.min(...certificate.minimumBlockFrontier.map((entry) =>
		entry.changedSemanticBlocks)) || certificate.minimumBlockFrontier.some((entry) => !entry.changedBlocks.field)) {
		violations.push("minimum-field-block")
	}
	if (certificate.selected.objectiveDeltas.some((delta) => delta < -1e-12) ||
		!certificate.selected.objectiveDeltas.some((delta) => delta > 1e-12)) violations.push("incumbent-dominance")
	for (const role of ["background", "foreground", "surface", "accent"] as const) {
		const provenance = certificate.selected.roles[role]
		const offset = provenance.representativePixelIndex * 3
		if (provenance.representativePixelIndex < 0 || provenance.rgb[0] !== imageData[offset] ||
			provenance.rgb[1] !== imageData[offset + 1] || provenance.rgb[2] !== imageData[offset + 2] ||
			candidate[role].generated) violations.push(`source-provenance:${role}`)
	}
	if (candidate.foreground.hex === candidate.background.hex || candidate.foreground.hex === candidate.surface.hex) {
		violations.push("foreground-field-collapse")
	}
	if (candidate.accent.hex === candidate.background.hex || candidate.accent.hex === candidate.surface.hex) {
		violations.push("accent-field-collapse")
	}
	if (candidate.foreground.hex === candidate.accent.hex && incumbent.foreground.hex !== incumbent.accent.hex) {
		violations.push("introduced-overlay-collapse")
	}
	if (new Set([candidate.background.hex, candidate.foreground.hex, candidate.surface.hex, candidate.accent.hex]).size > 4) {
		violations.push("cardinality")
	}
	const apca = certificate.selected.apcaLc
	const recomputed = {
		foregroundOnBackground: apcaContrast(candidate.foreground.rgb, candidate.background.rgb),
		foregroundOnSurface: apcaContrast(candidate.foreground.rgb, candidate.surface.rgb),
		accentOnBackground: apcaContrast(candidate.accent.rgb, candidate.background.rgb),
		accentOnSurface: apcaContrast(candidate.accent.rgb, candidate.surface.rgb),
	}
	if (!isDeepStrictEqual(apca, recomputed) || Object.values(apca).some((value) => !Number.isFinite(value))) {
		violations.push("signed-apca")
	}
	return [...new Set(violations)].sort()
}

async function evaluate(task: Task): Promise<WorkerResult> {
	if (!/^(?:images|00)\/[^/\\]+$/.test(task.path)) throw new Error(`Unauthorized source path: ${task.path}`)
	const bytes = await readFile(join(projectRoot, task.path))
	if (bytes.byteLength !== task.bytes || sha256(bytes) !== task.sha256) throw new Error(`Source binding changed: ${task.path}`)
	const image = await loadImage(bytes)
	const started = performance.now()
	const result = buildJointPaletteFieldDominanceFirst(image)
	const elapsedMs = performance.now() - started
	return {
		caseId: task.caseId,
		cohort: task.cohort,
		file: task.path,
		source: { sha256: task.sha256, bytes: task.bytes },
		canonical: task.canonical.methods.spatial,
		candidate: result.candidate,
		certificate: result.certificate,
		structural: { violations: structural(task, result, image.data) },
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

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
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
				if (completed === tasks.length) process.stderr.write(`field dominance evaluation: ${completed}/${tasks.length}\n`)
			}
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Field dominance worker exited with code ${code}`))
		})
	}))
	return (await Promise.all(workers)).flat().sort((first, second) => compareAscii(first.caseId, second.caseId))
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite existing field dominance experiment: ${outputRoot}`)
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) {
		throw new Error("evaluate-joint-palette-field-dominance-first-development.ts does not accept arguments")
	}
	await assertOutputAbsent()
	const inputEntries = await Promise.all(Object.entries(inputFiles).map(async ([name, path]) => {
		const raw = await readFile(join(projectRoot, path))
		return [name, { path, raw, sha256: sha256(raw) }] as const
	}))
	const inputs = Object.fromEntries(inputEntries) as Record<keyof typeof inputFiles, { path: string; raw: Buffer; sha256: string }>
	const parse = <T>(name: keyof typeof inputFiles): T => JSON.parse(inputs[name].raw.toString("utf8")) as T
	const tradeoffManifest = parse<{ experimentId: string; sources: Source[] }>("tradeoffManifest")
	const tradeoffInterpretation = parse<{
		experimentId: string
		disposition: { freezeAuthorized: boolean; promotionAuthorized: boolean; broaderReviewAuthorized: boolean }
		nextEngineeringStep: { name: string }
	}>("tradeoffInterpretation")
	const evidenceManifest = parse<{ experimentId: string }>("evidenceManifest")
	const evidenceAnalysis = parse<{ experimentId: string; stoppingRules: { pass: boolean } }>("evidenceAnalysis")
	const jointParetoManifest = parse<{ experimentId: string }>("jointParetoManifest")
	const canonicalDevelopment = parse<CorpusResult>("canonicalDevelopment")
	const canonical00 = parse<CorpusResult>("canonical00")
	if (tradeoffManifest.experimentId !== TRADEOFF_EXPERIMENT_ID || tradeoffManifest.sources.length !== 13 ||
		tradeoffInterpretation.experimentId !== TRADEOFF_EXPERIMENT_ID ||
		tradeoffInterpretation.disposition.freezeAuthorized || tradeoffInterpretation.disposition.promotionAuthorized ||
		tradeoffInterpretation.disposition.broaderReviewAuthorized ||
		tradeoffInterpretation.nextEngineeringStep.name !== "dominance-first-complete-tuple-routing" ||
		evidenceManifest.experimentId !== EVIDENCE_EXPERIMENT_ID || evidenceAnalysis.experimentId !== EVIDENCE_EXPERIMENT_ID ||
		!evidenceAnalysis.stoppingRules.pass || jointParetoManifest.experimentId !== JOINT_PARETO_EXPERIMENT_ID ||
		canonicalDevelopment.algorithmVersion !== ALGORITHM_VERSION || canonical00.algorithmVersion !== ALGORITHM_VERSION) {
		throw new Error("Field dominance diagnostic input bindings disagree")
	}
	const canonicalByFile = canonicalMap(canonicalDevelopment, canonical00)
	const tasks = tradeoffManifest.sources.map((source): Task => {
		const canonical = canonicalByFile.get(source.path)
		if (!canonical) throw new Error(`Missing canonical field backlog source: ${source.path}`)
		return { ...source, canonical }
	})
	const results = await runParallel(tasks)
	const violations = results.filter((result) => result.structural.violations.length > 0)
	const candidates = results.filter((result): result is WorkerResult & { candidate: Palette } => result.candidate !== null)
	const maximumTargetedReviewCases = 6
	const reviewReady = violations.length === 0 && candidates.length > 0 && candidates.length <= maximumTargetedReviewCases
	const protocol = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		diagnosticVersion: JOINT_PALETTE_FIELD_DOMINANCE_FIRST_VERSION,
		authorization: {
			developmentOnly: true,
			cohortSelectedFromPriorReviewComments: true,
			commentsEnterInference: false,
			allowedSourceRoots: ["images", "00"],
			outputUnseenRootsOpened: [] as string[],
			targetedDiagnosticReviewAuthorizedIfStoppingRulesPass: true,
			authorizationBasis: "explicit-user-request-next-good-test-2026-07-22",
			maximumTargetedReviewCases,
			canonicalPromotionAuthorized: false,
			candidateFreezeAuthorized: false,
			reserveAccessAuthorized: false,
		},
		stoppingRules: {
			structuralViolationsMustEqual: 0,
			everyCandidateMustChangeFieldBlock: true,
			everyCandidateMustStrictlyDominateCanonical: true,
			everyCandidateMustBeSourceExact: true,
			minimumSemanticBlocksMustPrecedeCandidatePareto: true,
			allConstrainedAblationsMustBeEvaluated: true,
			noFixedApcaAdmissionFloor: true,
			noCandidateIsAnExtractionOutput: true,
			freshReviewCasesMustNotExceed: maximumTargetedReviewCases,
		},
	}
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (path) =>
		[path, sha256(await readFile(join(projectRoot, path)))] as const)))
	const identity = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		diagnosticVersion: JOINT_PALETTE_FIELD_DOMINANCE_FIRST_VERSION,
		policy: JOINT_PALETTE_FIELD_DOMINANCE_FIRST_POLICY,
		protocol,
		inputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, { path: input.path, sha256: input.sha256 }])),
		sources: tasks.map(({ canonical: _canonical, ...source }) => source),
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
			strictDominatorAvailable: candidates.length,
			noStrictDominatorAvailable: results.length - candidates.length,
			reviewCases: reviewReady ? candidates.length : 0,
		},
		selection: {
			minimumChangedBlocks: candidates.length === 0 ? null : Math.min(...candidates.map((result) =>
				result.certificate.selected.changedSemanticBlocks)),
			maximumChangedBlocks: candidates.length === 0 ? null : Math.max(...candidates.map((result) =>
				result.certificate.selected.changedSemanticBlocks)),
			minimumChangedAtoms: candidates.length === 0 ? null : Math.min(...candidates.map((result) =>
				result.certificate.selected.changedSemanticAtoms)),
			maximumChangedAtoms: candidates.length === 0 ? null : Math.max(...candidates.map((result) =>
				result.certificate.selected.changedSemanticAtoms)),
		},
		states: {
			collapsed: candidates.filter((result) => result.certificate.selected.fieldState === "collapsed").length,
			"distinct-flat": candidates.filter((result) => result.certificate.selected.fieldState === "distinct-flat").length,
			gradient: candidates.filter((result) => result.certificate.selected.fieldState === "gradient").length,
		},
		review: {
			required: candidates.length > 0,
			authorized: reviewReady,
			freshBlindedComparisonsRequired: reviewReady ? candidates.length : 0,
			diagnosticOnly: true,
			maximumTargetedReviewCases,
		},
		disposition: reviewReady
			? "targeted-field-dominance-review-ready"
			: "field-dominance-diagnostic-stopped-before-review",
	}
	const resultsArtifact = {
		schemaVersion: 1,
		experimentId,
		diagnosticVersion: JOINT_PALETTE_FIELD_DOMINANCE_FIRST_VERSION,
		entries: results.map(({ elapsedMs: _elapsedMs, ...result }) => result),
	}
	const frontier = {
		schemaVersion: 1,
		experimentId,
		diagnosticVersion: JOINT_PALETTE_FIELD_DOMINANCE_FIRST_VERSION,
		entries: reviewReady ? candidates.map((result) => ({
			caseId: result.caseId,
			file: result.file,
			cohort: result.cohort,
			changedRoles: roleNames.filter((role) =>
				JSON.stringify(result.canonical[role].rgb) !== JSON.stringify(result.candidate[role].rgb)),
			gradientChanged: result.canonical.gradient.isGradient !== result.candidate.gradient.isGradient,
			baseline: result.canonical,
			candidate: result.candidate,
			source: { path: result.file, ...result.source },
			selected: result.certificate.selected,
		})) : [],
	}
	await mkdir(outputRoot)
	await Promise.all([
		writeExclusive(join(outputRoot, "protocol.json"), protocol),
		writeExclusive(join(outputRoot, "manifest.json"), { ...identity, experimentId, generatedAt }),
		writeExclusive(join(outputRoot, "analysis.json"), analysis),
		writeExclusive(join(outputRoot, "results.json"), resultsArtifact),
		writeExclusive(join(outputRoot, "frontier.json"), frontier),
	])
	process.stderr.write(`Wrote field dominance diagnostic ${experimentId} to ${outputRoot}\n`)
}

const roleNames = ["background", "foreground", "surface", "accent"] as const

if (!isMainThread) {
	runWorker(workerData as Task[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => { throw error })
} else {
	await main()
}
