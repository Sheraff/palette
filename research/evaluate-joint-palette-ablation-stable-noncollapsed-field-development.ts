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
	buildJointPaletteAblationStableNoncollapsedField,
	JOINT_PALETTE_ABLATION_STABLE_NONCOLLAPSED_FIELD_POLICY,
	JOINT_PALETTE_ABLATION_STABLE_NONCOLLAPSED_FIELD_VERSION,
	type JointPaletteAblationStableNoncollapsedFieldCertificate,
} from "./src/joint-palette-ablation-stable-noncollapsed-field.ts"
import type { NextPaletteJointParetoCertificate, NextPaletteJointSelectionSummary } from "./src/next-palette-joint-pareto.ts"
import type { CorpusResult, ExtractionResult, Palette, RGB, RoleName } from "./src/types.ts"

const EXPERIMENT_VERSION = "joint-palette-ablation-stable-noncollapsed-field-0.1.0-development"
const JOINT_PARETO_EXPERIMENT_ID = "c31541f6ad1fe7fb57cf9b6b5d4373a1f0ef00f7974c8dd9c511b804f3e6b283"
const EVIDENCE_EXPERIMENT_ID = "1241b18a1f8d882f36da4e2e9bf6b50928d71394e1b848b92a92e09def4660f9"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const outputRoot = join(researchRoot, "data/experiments", EXPERIMENT_VERSION)

const inputFiles = {
	evidenceManifest: "research/data/experiments/joint-palette-evidence-frontier-0.1.1-development/manifest.json",
	evidenceAnalysis: "research/data/experiments/joint-palette-evidence-frontier-0.1.1-development/analysis.json",
	jointParetoManifest: "research/data/experiments/next-palette-joint-pareto-0.5.0-development/manifest.json",
	jointParetoResults: "research/data/experiments/next-palette-joint-pareto-0.5.0-development/results.json",
	jointParetoCertificates: "research/data/experiments/next-palette-joint-pareto-0.5.0-development/certificates.json",
	jointParetoReviewTransfer: "research/data/experiments/next-palette-joint-pareto-0.5.0-development/review-transfer.json",
	collapseInterpretation:
		"research/data/experiments/joint-palette-threshold-free-collapse-0.1.0-development/review-v2/interpretation.json",
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
	"research/src/joint-palette-ablation-stable-noncollapsed-field.ts",
	"research/evaluate-joint-palette-ablation-stable-noncollapsed-field-development.ts",
	"research/tests/joint-palette-ablation-stable-noncollapsed-field.test.ts",
] as const

type Source = { cohort: "development" | "00"; path: string; sha256: string; bytes: number }
type FrozenResult = {
	cohort: Source["cohort"]
	file: string
	source: { sha256: string; bytes: number }
	palette: Palette
	changedRoles: RoleName[]
	gradientChanged: boolean
	structural: { violations: string[] }
}
type FrozenCertificate = NextPaletteJointParetoCertificate
type Task = Source & {
	canonical: ExtractionResult
	expectedCandidate: Palette
	expectedSelected: NextPaletteJointSelectionSummary
	changedRoles: RoleName[]
	gradientChanged: boolean
}
type WorkerResult = {
	cohort: Source["cohort"]
	file: string
	source: { sha256: string; bytes: number }
	canonical: Palette
	candidate: Palette
	certificate: JointPaletteAblationStableNoncollapsedFieldCertificate
	jointCertificate: NextPaletteJointParetoCertificate
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

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function selectedSummary(certificate: FrozenCertificate): NextPaletteJointSelectionSummary {
	const selected = certificate.selected
	return {
		changed: selected.changed,
		admitted: selected.admitted,
		stableKey: selected.stableKey,
		fieldState: selected.fieldState,
		changedSemanticBlocks: selected.changedSemanticBlocks,
		changedSemanticAtoms: selected.changedSemanticAtoms,
		objectives: selected.objectives,
		objectiveDeltas: selected.objectiveDeltas,
	}
}

function canonicalMap(development: CorpusResult, canonical00: CorpusResult): Map<string, ExtractionResult> {
	return new Map([
		...development.entries.map((entry) => [`images/${entry.file}`, entry.extraction] as const),
		...canonical00.entries.map((entry) => [entry.file, entry.extraction] as const),
	])
}

function structural(task: Task, result: ReturnType<typeof buildJointPaletteAblationStableNoncollapsedField>,
	imageData: Uint8Array): string[] {
	const violations: string[] = []
	const candidate = result.candidate
	const canonical = task.canonical.methods.spatial
	if (!candidate) return ["expected-admitted-candidate"]
	if (!isDeepStrictEqual(result.canonical, canonical)) violations.push("canonical-recomputation")
	if (!isDeepStrictEqual(candidate, task.expectedCandidate)) violations.push("frozen-candidate-mismatch")
	if (result.certificate.route !== "admitted-field" ||
		!isDeepStrictEqual(result.certificate.selected, task.expectedSelected) ||
		!isDeepStrictEqual(result.certificate.selected, result.certificate.canonicalOverlayAblation)) {
		violations.push("ablation-agreement")
	}
	if (!Object.values(result.certificate.invariants).every(Boolean) || result.certificate.policy.fixedApcaAdmissionFloor !== null ||
		result.certificate.policy.fittedNumericThresholds) violations.push("policy")
	if (sameRgb(candidate.background.rgb, candidate.surface.rgb) || result.certificate.selected?.fieldState === "collapsed") {
		violations.push("collapsed-field")
	}
	if (!sameRgb(candidate.foreground.rgb, canonical.foreground.rgb) ||
		candidate.foreground.generated !== canonical.foreground.generated ||
		!sameRgb(candidate.accent.rgb, canonical.accent.rgb) || candidate.accent.generated !== canonical.accent.generated) {
		violations.push("overlay-change")
	}
	if (result.certificate.selected?.objectiveDeltas.some((delta) => delta < -1e-12) ||
		!result.certificate.selected?.objectiveDeltas.some((delta) => delta > 1e-12)) violations.push("incumbent-dominance")
	const roles = result.jointCertificate.selected.roles
	for (const role of ["background", "foreground", "surface", "accent"] as const) {
		const provenance = roles[role]
		if (!("representativePixelIndex" in provenance)) {
			violations.push(`missing-provenance:${role}`)
			continue
		}
		const offset = provenance.representativePixelIndex * 3
		if (provenance.representativePixelIndex < 0 || provenance.rgb[0] !== imageData[offset] ||
			provenance.rgb[1] !== imageData[offset + 1] || provenance.rgb[2] !== imageData[offset + 2] ||
			candidate[role].generated) violations.push(`source-provenance:${role}`)
	}
	if (!result.jointCertificate.selected.fieldTreatment?.fieldRelation ||
		result.jointCertificate.selected.fieldTreatment.endpointDistance <= 0) violations.push("field-relation")
	const apca = result.jointCertificate.selected.apcaLc
	if (!isDeepStrictEqual(apca, {
		foregroundOnBackground: apcaContrast(candidate.foreground.rgb, candidate.background.rgb),
		foregroundOnSurface: apcaContrast(candidate.foreground.rgb, candidate.surface.rgb),
		accentOnBackground: apcaContrast(candidate.accent.rgb, candidate.background.rgb),
		accentOnSurface: apcaContrast(candidate.accent.rgb, candidate.surface.rgb),
	}) || Object.values(apca).some((value) => !Number.isFinite(value))) violations.push("signed-apca")
	return [...new Set(violations)].sort()
}

async function evaluate(task: Task): Promise<WorkerResult> {
	if (!/^(?:images|00)\/[^/\\]+$/.test(task.path)) throw new Error(`Unauthorized ablation-stable source: ${task.path}`)
	const bytes = await readFile(join(projectRoot, task.path))
	if (bytes.byteLength !== task.bytes || sha256(bytes) !== task.sha256) throw new Error(`Source binding changed: ${task.path}`)
	const image = await loadImage(bytes)
	const started = performance.now()
	const result = buildJointPaletteAblationStableNoncollapsedField(image)
	const elapsedMs = performance.now() - started
	if (!result.candidate) throw new Error(`Ablation-stable candidate was not reproduced: ${task.path}`)
	return {
		cohort: task.cohort,
		file: task.path,
		source: { sha256: task.sha256, bytes: task.bytes },
		canonical: task.canonical.methods.spatial,
		candidate: result.candidate,
		certificate: result.certificate,
		jointCertificate: result.jointCertificate,
		changedRoles: task.changedRoles,
		gradientChanged: task.gradientChanged,
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

async function runParallel(tasks: Task[]): Promise<WorkerResult[]> {
	const partitions = Array.from({ length: Math.min(Math.max(1, availableParallelism() - 1), 8, tasks.length) },
		() => [] as Task[])
	for (const [index, task] of tasks.entries()) partitions[index % partitions.length].push(task)
	const workers = partitions.map((partition) => new Promise<WorkerResult[]>((resolveWorker, rejectWorker) => {
		const worker = new Worker(new URL(import.meta.url), { workerData: partition })
		worker.on("message", (message: { progress: number } | { results: WorkerResult[] }) => {
			if ("results" in message) resolveWorker(message.results)
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Ablation-stable worker exited with code ${code}`))
		})
	}))
	return (await Promise.all(workers)).flat().sort((first, second) => first.file.localeCompare(second.file))
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite ablation-stable field experiment: ${outputRoot}`)
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) {
		throw new Error("evaluate-joint-palette-ablation-stable-noncollapsed-field-development.ts does not accept arguments")
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
	const paretoManifest = parse<{ experimentId: string }>("jointParetoManifest")
	const frozenResults = parse<{ experimentId: string; entries: FrozenResult[] }>("jointParetoResults")
	const frozenCertificates = parse<{ experimentId: string; entries: Record<string, FrozenCertificate> }>("jointParetoCertificates")
	const reviewTransfer = parse<{ experimentId: string; entries: Array<{ file: string }> }>("jointParetoReviewTransfer")
	const collapseInterpretation = parse<{
		disposition: { candidate: string; admissibilityEvidenceRetained: boolean }
		nextStep: { candidateOrReviewAuthorized: boolean }
	}>("collapseInterpretation")
	const development = parse<CorpusResult>("canonicalDevelopment")
	const canonical00 = parse<CorpusResult>("canonical00")
	if (evidenceManifest.experimentId !== EVIDENCE_EXPERIMENT_ID || evidenceManifest.sources.length !== 392 ||
		evidenceAnalysis.experimentId !== EVIDENCE_EXPERIMENT_ID || !evidenceAnalysis.stoppingRules.pass ||
		paretoManifest.experimentId !== JOINT_PARETO_EXPERIMENT_ID || frozenResults.experimentId !== JOINT_PARETO_EXPERIMENT_ID ||
		frozenCertificates.experimentId !== JOINT_PARETO_EXPERIMENT_ID || reviewTransfer.experimentId !== JOINT_PARETO_EXPERIMENT_ID ||
		collapseInterpretation.disposition.candidate !== "stop-threshold-free-collapse-as-replacement-preserve-canonical-0.19" ||
		!collapseInterpretation.disposition.admissibilityEvidenceRetained || collapseInterpretation.nextStep.candidateOrReviewAuthorized ||
		development.algorithmVersion !== ALGORITHM_VERSION || canonical00.algorithmVersion !== ALGORITHM_VERSION) {
		throw new Error("Ablation-stable field inputs disagree")
	}
	const sourceByFile = new Map(evidenceManifest.sources.map((source) => [source.path, source]))
	const canonicalByFile = canonicalMap(development, canonical00)
	const transferFiles = new Set(reviewTransfer.entries.map((entry) => entry.file))
	const tasks = frozenResults.entries.flatMap((entry): Task[] => {
		const certificate = frozenCertificates.entries[entry.file]
		if (!certificate || entry.structural.violations.length > 0) throw new Error(`Frozen joint result invalid: ${entry.file}`)
		const selected = selectedSummary(certificate)
		const ablation = certificate.ablations["canonical-overlay-block"]
		const fieldOnly = (entry.changedRoles.length > 0 || entry.gradientChanged) &&
			entry.changedRoles.every((role) => role === "background" || role === "surface")
		if (!selected.changed || !selected.admitted || !isDeepStrictEqual(selected, ablation) || !fieldOnly ||
			selected.fieldState === "collapsed" || entry.palette.background.hex === entry.palette.surface.hex) return []
		const source = sourceByFile.get(entry.file)
		const canonical = canonicalByFile.get(entry.file)
		if (!source || !canonical || source.sha256 !== entry.source.sha256 || source.bytes !== entry.source.bytes) {
			throw new Error(`Unbound ablation-stable candidate: ${entry.file}`)
		}
		return [{ ...source, canonical, expectedCandidate: entry.palette, expectedSelected: selected,
			changedRoles: entry.changedRoles, gradientChanged: entry.gradientChanged }]
	})
	if (tasks.length !== 9 || tasks.some((task) => task.cohort !== "00" || transferFiles.has(task.path))) {
		throw new Error(`Ablation-stable field scope disagrees: ${tasks.length}`)
	}
	const results = await runParallel(tasks)
	const violations = results.filter((result) => result.structural.violations.length > 0)
	const reviewReady = violations.length === 0 && results.length === 9
	const protocol = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		candidateVersion: JOINT_PALETTE_ABLATION_STABLE_NONCOLLAPSED_FIELD_VERSION,
		authorization: {
			developmentOnly: true,
			allowedSourceRoots: ["images", "00"],
			outputUnseenRootsOpened: [] as string[],
			targetedCompleteChangedSetReviewAuthorizedIfStoppingRulesPass: true,
			authorizationBasis: "explicit-user-request-continue-until-review-ready-2026-07-22",
			maximumFreshReviewCases: 9,
			broaderReviewAuthorized: false,
			canonicalPromotionAuthorized: false,
			candidateFreezeAuthorized: false,
			reserveAccessAuthorized: false,
		},
		stoppingRules: {
			structuralViolationsMustEqual: 0,
			unconstrainedSelectionMustEqualCanonicalOverlayAblation: true,
			foregroundAndAccentMustRemainCanonical: true,
			fieldBlockMustChange: true,
			candidateFieldMustRemainNoncollapsed: true,
			everyCandidateMustStrictlyDominateCanonical: true,
			everyCandidateMustBeSourceExact: true,
			freshReviewCasesMustEqual: 9,
			noFixedApcaAdmissionFloor: true,
		},
	}
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (path) =>
		[path, sha256(await readFile(join(projectRoot, path)))] as const)))
	const identity = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		candidateVersion: JOINT_PALETTE_ABLATION_STABLE_NONCOLLAPSED_FIELD_VERSION,
		policy: JOINT_PALETTE_ABLATION_STABLE_NONCOLLAPSED_FIELD_POLICY,
		protocol,
		inputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, { path: input.path, sha256: input.sha256 }])),
		sources: tasks.map(({ canonical: _canonical, expectedCandidate: _candidate, expectedSelected: _selected,
			changedRoles: _roles, gradientChanged: _gradient, ...source }) => source),
		implementation,
	}
	const experimentId = sha256(JSON.stringify(canonicalValue(identity)))
	const generatedAt = new Date().toISOString()
	const stateCounts = {
		"distinct-flat": results.filter((result) => result.certificate.selected?.fieldState === "distinct-flat").length,
		gradient: results.filter((result) => result.certificate.selected?.fieldState === "gradient").length,
	}
	const analysis = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		experimentId,
		generatedAt,
		structural: { pass: violations.length === 0,
			violationCount: violations.reduce((sum, result) => sum + result.structural.violations.length, 0),
			caseCount: violations.length,
			entries: violations.map((result) => ({ file: result.file, violations: result.structural.violations })) },
		coverage: { totalMatrix: 392, ablationStableNoncollapsedFieldCandidates: results.length,
			exactReviewTransfers: 0, freshReviewRequired: results.length },
		states: stateCounts,
		changes: {
			oneAtom: results.filter((result) => result.certificate.selected?.changedSemanticAtoms === 1).length,
			twoAtoms: results.filter((result) => result.certificate.selected?.changedSemanticAtoms === 2).length,
			oneBlock: results.filter((result) => result.certificate.selected?.changedSemanticBlocks === 1).length,
		},
		review: { required: true, authorized: reviewReady,
			freshBlindedComparisonsRequired: reviewReady ? results.length : 0, diagnosticOnly: true },
		disposition: reviewReady ? "ablation-stable-noncollapsed-field-review-ready" : "ablation-stable-field-rejected",
	}
	const resultsArtifact = { schemaVersion: 1, experimentId,
		candidateVersion: JOINT_PALETTE_ABLATION_STABLE_NONCOLLAPSED_FIELD_VERSION,
		entries: results.map(({ elapsedMs: _elapsedMs, ...result }) => result) }
	const frontier = { schemaVersion: 1, experimentId,
		candidateVersion: JOINT_PALETTE_ABLATION_STABLE_NONCOLLAPSED_FIELD_VERSION,
		entries: reviewReady ? results.map((result) => ({
			file: result.file,
			cohort: result.cohort,
			changedRoles: result.changedRoles,
			gradientChanged: result.gradientChanged,
			baseline: result.canonical,
			candidate: result.candidate,
			source: { path: result.file, ...result.source },
			selected: result.certificate.selected,
		})) : [] }
	await mkdir(outputRoot)
	await Promise.all([
		writeExclusive(join(outputRoot, "protocol.json"), protocol),
		writeExclusive(join(outputRoot, "manifest.json"), { ...identity, experimentId, generatedAt }),
		writeExclusive(join(outputRoot, "analysis.json"), analysis),
		writeExclusive(join(outputRoot, "results.json"), resultsArtifact),
		writeExclusive(join(outputRoot, "frontier.json"), frontier),
	])
	process.stderr.write(`Wrote ablation-stable noncollapsed field candidate ${experimentId} to ${outputRoot}\n`)
}

if (!isMainThread) {
	runWorker(workerData as Task[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => { throw error })
} else {
	await main()
}
