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
	buildJointPaletteThresholdFreeCollapse,
	JOINT_PALETTE_THRESHOLD_FREE_COLLAPSE_POLICY,
	JOINT_PALETTE_THRESHOLD_FREE_COLLAPSE_VERSION,
	type JointPaletteThresholdFreeCollapseCertificate,
} from "./src/joint-palette-threshold-free-collapse.ts"
import type { JointPaletteFieldDominanceCertificate } from "./src/joint-palette-field-dominance-first.ts"
import type { CorpusResult, ExtractionResult, Palette, RGB } from "./src/types.ts"

const EXPERIMENT_VERSION = "joint-palette-threshold-free-collapse-0.1.0-development"
const AUDIT_EXPERIMENT_ID = "ebee9abb7e86b70754c2ed2ef83cd7bf643f5bf71d94d084ed69108b0617eb43"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const outputRoot = join(researchRoot, "data/experiments", EXPERIMENT_VERSION)

const inputFiles = {
	auditManifest:
		"research/data/experiments/joint-palette-threshold-free-collapse-audit-0.1.1-development/manifest.json",
	auditProtocol:
		"research/data/experiments/joint-palette-threshold-free-collapse-audit-0.1.1-development/protocol.json",
	auditAnalysis:
		"research/data/experiments/joint-palette-threshold-free-collapse-audit-0.1.1-development/analysis.json",
	auditFrontier:
		"research/data/experiments/joint-palette-threshold-free-collapse-audit-0.1.1-development/candidate-frontier.json",
	fieldDominanceInterpretation:
		"research/data/experiments/joint-palette-field-dominance-first-0.1.0-development/review-v2/interpretation.json",
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
	"research/src/joint-palette-threshold-free-collapse.ts",
	"research/evaluate-joint-palette-threshold-free-collapse-development.ts",
	"research/tests/joint-palette-threshold-free-collapse.test.ts",
] as const

type RoleName = "background" | "foreground" | "surface" | "accent"
type AuditFrontierEntry = {
	file: string
	cohort: "development" | "00"
	stableKey: string
	fieldState: "collapsed"
	changedSemanticBlocks: number
	changedSemanticAtoms: number
	objectiveDeltas: number[]
	roles: Record<RoleName, RGB>
	source: { path: string; sha256: string; bytes: number }
	audit: { clauses: Record<string, boolean>; evidence: Record<string, number> }
	reviewEvidence: "exact-positive-transfer" | "fresh-review-required"
}
type Task = AuditFrontierEntry & { canonical: ExtractionResult }
type WorkerResult = {
	cohort: Task["cohort"]
	file: string
	source: { sha256: string; bytes: number }
	canonical: Palette
	candidate: Palette
	certificate: JointPaletteThresholdFreeCollapseCertificate
	fieldDominanceCertificate: JointPaletteFieldDominanceCertificate
	auditBinding: { experimentId: string; stableKey: string; reviewEvidence: Task["reviewEvidence"] }
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

function canonicalMap(development: CorpusResult, canonical00: CorpusResult): Map<string, ExtractionResult> {
	return new Map([
		...development.entries.map((entry) => [`images/${entry.file}`, entry.extraction] as const),
		...canonical00.entries.map((entry) => [entry.file, entry.extraction] as const),
	])
}

function structural(task: Task, result: ReturnType<typeof buildJointPaletteThresholdFreeCollapse>, imageData: Uint8Array): string[] {
	const violations: string[] = []
	const candidate = result.candidate
	const incumbent = task.canonical.methods.spatial
	if (!candidate) return ["expected-admitted-candidate"]
	if (!isDeepStrictEqual(result.canonical, incumbent)) violations.push("canonical-recomputation")
	if (result.certificate.route !== "admitted-collapse" || !result.certificate.audit?.pass ||
		Object.values(result.certificate.audit.clauses).some((value) => !value)) violations.push("audit-admission")
	if (result.certificate.policy.fixedApcaAdmissionFloor !== null || result.certificate.policy.fittedNumericThresholds ||
		!Object.values(result.certificate.invariants).every(Boolean)) violations.push("policy")
	if (result.certificate.fieldDominance?.stableKey !== task.stableKey ||
		result.certificate.fieldDominance.changedSemanticBlocks !== 1 ||
		result.certificate.fieldDominance.changedSemanticAtoms !== 2 ||
		result.certificate.fieldDominance.objectiveDeltas.some((delta) => delta < -1e-12) ||
		!result.certificate.fieldDominance.objectiveDeltas.some((delta) => delta > 1e-12)) {
		violations.push("strict-field-dominance")
	}
	for (const role of ["background", "foreground", "surface", "accent"] as const) {
		if (!sameRgb(candidate[role].rgb, task.roles[role])) violations.push(`audit-role-binding:${role}`)
		const provenance = result.fieldDominanceCertificate.selected.roles?.[role]
		if (!provenance) {
			violations.push(`missing-provenance:${role}`)
			continue
		}
		const offset = provenance.representativePixelIndex * 3
		if (provenance.representativePixelIndex < 0 || provenance.rgb[0] !== imageData[offset] ||
			provenance.rgb[1] !== imageData[offset + 1] || provenance.rgb[2] !== imageData[offset + 2] ||
			candidate[role].generated) violations.push(`source-provenance:${role}`)
	}
	if (!sameRgb(candidate.background.rgb, incumbent.background.rgb) ||
		!sameRgb(candidate.surface.rgb, incumbent.background.rgb) ||
		!sameRgb(candidate.foreground.rgb, incumbent.foreground.rgb) ||
		!sameRgb(candidate.accent.rgb, incumbent.accent.rgb) || candidate.gradient.isGradient) {
		violations.push("exact-counterfactual")
	}
	const selectedApca = result.fieldDominanceCertificate.selected.apcaLc
	if (!selectedApca || !isDeepStrictEqual(selectedApca, {
		foregroundOnBackground: apcaContrast(candidate.foreground.rgb, candidate.background.rgb),
		foregroundOnSurface: apcaContrast(candidate.foreground.rgb, candidate.surface.rgb),
		accentOnBackground: apcaContrast(candidate.accent.rgb, candidate.background.rgb),
		accentOnSurface: apcaContrast(candidate.accent.rgb, candidate.surface.rgb),
	})) violations.push("signed-apca")
	return [...new Set(violations)].sort()
}

async function evaluate(task: Task): Promise<WorkerResult> {
	if (!/^(?:images|00)\/[^/\\]+$/.test(task.file) || task.file !== task.source.path) {
		throw new Error(`Unauthorized audit source path: ${task.file}`)
	}
	const bytes = await readFile(join(projectRoot, task.file))
	if (bytes.byteLength !== task.source.bytes || sha256(bytes) !== task.source.sha256) {
		throw new Error(`Audit source binding changed: ${task.file}`)
	}
	const image = await loadImage(bytes)
	const started = performance.now()
	const result = buildJointPaletteThresholdFreeCollapse(image)
	const elapsedMs = performance.now() - started
	if (!result.candidate) throw new Error(`Audited candidate was not reproduced: ${task.file}`)
	return {
		cohort: task.cohort,
		file: task.file,
		source: { sha256: task.source.sha256, bytes: task.source.bytes },
		canonical: task.canonical.methods.spatial,
		candidate: result.candidate,
		certificate: result.certificate,
		fieldDominanceCertificate: result.fieldDominanceCertificate,
		auditBinding: { experimentId: AUDIT_EXPERIMENT_ID, stableKey: task.stableKey, reviewEvidence: task.reviewEvidence },
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
	const partitions = Array.from({ length: Math.min(Math.max(1, availableParallelism() - 1), 3, tasks.length) },
		() => [] as Task[])
	for (const [index, task] of tasks.entries()) partitions[index % partitions.length].push(task)
	const workers = partitions.map((partition) => new Promise<WorkerResult[]>((resolveWorker, rejectWorker) => {
		const worker = new Worker(new URL(import.meta.url), { workerData: partition })
		worker.on("message", (message: { progress: number } | { results: WorkerResult[] }) => {
			if ("results" in message) resolveWorker(message.results)
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Threshold-free collapse worker exited with code ${code}`))
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
	throw new Error(`Refusing to overwrite threshold-free collapse experiment: ${outputRoot}`)
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) {
		throw new Error("evaluate-joint-palette-threshold-free-collapse-development.ts does not accept arguments")
	}
	await assertOutputAbsent()
	const inputEntries = await Promise.all(Object.entries(inputFiles).map(async ([name, path]) => {
		const raw = await readFile(join(projectRoot, path))
		return [name, { path, raw, sha256: sha256(raw) }] as const
	}))
	const inputs = Object.fromEntries(inputEntries) as Record<keyof typeof inputFiles, { path: string; raw: Buffer; sha256: string }>
	const parse = <T>(name: keyof typeof inputFiles): T => JSON.parse(inputs[name].raw.toString("utf8")) as T
	const auditManifest = parse<{ experimentId: string }>("auditManifest")
	const auditProtocol = parse<{ authorization: { candidateReviewAuthorized: boolean; broaderReviewAuthorized: boolean } }>(
		"auditProtocol",
	)
	const auditAnalysis = parse<{
		experimentId: string
		exactCandidateCoverage: { passing: number; exactPositiveTransfers: number; freshReviewRequired: number }
		reviewedSeparation: { positivePass: number; negativeFail: number }
	}>("auditAnalysis")
	const auditFrontier = parse<{ experimentId: string; entries: AuditFrontierEntry[] }>("auditFrontier")
	const interpretation = parse<{
		disposition: { exactPositiveTupleEvidenceRetained: string[]; broaderReviewAuthorized: boolean }
	}>("fieldDominanceInterpretation")
	const canonicalDevelopment = parse<CorpusResult>("canonicalDevelopment")
	const canonical00 = parse<CorpusResult>("canonical00")
	if (auditManifest.experimentId !== AUDIT_EXPERIMENT_ID || auditAnalysis.experimentId !== AUDIT_EXPERIMENT_ID ||
		auditFrontier.experimentId !== AUDIT_EXPERIMENT_ID || auditProtocol.authorization.candidateReviewAuthorized ||
		auditProtocol.authorization.broaderReviewAuthorized || auditAnalysis.exactCandidateCoverage.passing !== 3 ||
		auditAnalysis.exactCandidateCoverage.exactPositiveTransfers !== 1 ||
		auditAnalysis.exactCandidateCoverage.freshReviewRequired !== 2 || auditAnalysis.reviewedSeparation.positivePass !== 1 ||
		auditAnalysis.reviewedSeparation.negativeFail !== 2 || interpretation.disposition.broaderReviewAuthorized ||
		interpretation.disposition.exactPositiveTupleEvidenceRetained.length !== 1 ||
		canonicalDevelopment.algorithmVersion !== ALGORITHM_VERSION || canonical00.algorithmVersion !== ALGORITHM_VERSION ||
		auditFrontier.entries.some((entry) => entry.fieldState !== "collapsed" || entry.changedSemanticBlocks !== 1 ||
			entry.changedSemanticAtoms !== 2 || entry.objectiveDeltas.some((delta) => delta < -1e-12) ||
			!entry.objectiveDeltas.some((delta) => delta > 1e-12) || Object.values(entry.audit.clauses).some((value) => !value))) {
		throw new Error("Threshold-free collapse candidate inputs disagree")
	}
	const canonicalByFile = canonicalMap(canonicalDevelopment, canonical00)
	const tasks = auditFrontier.entries.map((entry): Task => {
		const canonical = canonicalByFile.get(entry.file)
		if (!canonical) throw new Error(`Missing canonical audited source: ${entry.file}`)
		return { ...entry, canonical }
	})
	const results = await runParallel(tasks)
	const violations = results.filter((result) => result.structural.violations.length > 0)
	const transfers = results.filter((result) => result.auditBinding.reviewEvidence === "exact-positive-transfer")
	const fresh = results.filter((result) => result.auditBinding.reviewEvidence === "fresh-review-required")
	const reviewReady = violations.length === 0 && transfers.length === 1 && fresh.length === 2
	const protocol = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		candidateVersion: JOINT_PALETTE_THRESHOLD_FREE_COLLAPSE_VERSION,
		auditExperimentId: AUDIT_EXPERIMENT_ID,
		authorization: {
			developmentOnly: true,
			allowedSourceRoots: ["images", "00"],
			outputUnseenRootsOpened: [] as string[],
			targetedDiagnosticReviewAuthorizedIfStoppingRulesPass: true,
			authorizationBasis: "explicit-user-instruction-do-not-stop-until-review-ready-2026-07-22",
			maximumFreshReviewCases: 2,
			broaderReviewAuthorized: false,
			canonicalPromotionAuthorized: false,
			candidateFreezeAuthorized: false,
			reserveAccessAuthorized: false,
		},
		stoppingRules: {
			structuralViolationsMustEqual: 0,
			everyCandidateMustMatchCorrectedAuditExactly: true,
			everyCandidateMustPassAllThresholdFreeClauses: true,
			everyCandidateMustStrictlyDominateCanonical: true,
			everyCandidateMustBeExactRetainedBackgroundCollapse: true,
			everyCandidateMustBeSourceExact: true,
			freshReviewCasesMustEqual: 2,
			noFixedApcaAdmissionFloor: true,
			noCandidateIsAnExtractionOutput: true,
		},
	}
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (path) =>
		[path, sha256(await readFile(join(projectRoot, path)))] as const)))
	const identity = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		candidateVersion: JOINT_PALETTE_THRESHOLD_FREE_COLLAPSE_VERSION,
		policy: JOINT_PALETTE_THRESHOLD_FREE_COLLAPSE_POLICY,
		protocol,
		inputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, { path: input.path, sha256: input.sha256 }])),
		sources: tasks.map(({ canonical: _canonical, audit: _audit, roles: _roles, objectiveDeltas: _deltas, ...entry }) => entry),
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
			entries: violations.map((result) => ({ file: result.file, violations: result.structural.violations })),
		},
		coverage: {
			auditedPassingCandidates: results.length,
			exactPositiveTransfers: transfers.length,
			freshReviewRequired: fresh.length,
		},
		review: {
			required: fresh.length > 0,
			authorized: reviewReady,
			freshBlindedComparisonsRequired: reviewReady ? fresh.length : 0,
			diagnosticOnly: true,
		},
		disposition: reviewReady
			? "targeted-threshold-free-collapse-review-ready"
			: "threshold-free-collapse-candidate-stopped-before-review",
	}
	const resultsArtifact = {
		schemaVersion: 1,
		experimentId,
		candidateVersion: JOINT_PALETTE_THRESHOLD_FREE_COLLAPSE_VERSION,
		entries: results.map(({ elapsedMs: _elapsedMs, ...result }) => result),
	}
	const transferArtifact = {
		schemaVersion: 1,
		experimentId,
		policy: "Transfer only exact canonical and candidate semantic palette matches.",
		entries: transfers.map((result) => ({
			file: result.file,
			sourceSha256: result.source.sha256,
			candidateQuality: "acceptable-not-ideal",
			comparison: "candidate-stronger",
			transferBasis: "exact-canonical-and-candidate-semantic-palette-match",
		})),
	}
	const frontier = {
		schemaVersion: 1,
		experimentId,
		candidateVersion: JOINT_PALETTE_THRESHOLD_FREE_COLLAPSE_VERSION,
		entries: reviewReady ? fresh.map((result) => ({
			file: result.file,
			cohort: result.cohort,
			changedRoles: ["surface"],
			gradientChanged: result.canonical.gradient.isGradient !== result.candidate.gradient.isGradient,
			baseline: result.canonical,
			candidate: result.candidate,
			source: { path: result.file, ...result.source },
			selected: result.certificate.fieldDominance,
			audit: result.certificate.audit,
		})) : [],
	}
	await mkdir(outputRoot)
	await Promise.all([
		writeExclusive(join(outputRoot, "protocol.json"), protocol),
		writeExclusive(join(outputRoot, "manifest.json"), { ...identity, experimentId, generatedAt }),
		writeExclusive(join(outputRoot, "analysis.json"), analysis),
		writeExclusive(join(outputRoot, "results.json"), resultsArtifact),
		writeExclusive(join(outputRoot, "review-transfer.json"), transferArtifact),
		writeExclusive(join(outputRoot, "frontier.json"), frontier),
	])
	process.stderr.write(`Wrote threshold-free collapse candidate ${experimentId} to ${outputRoot}\n`)
}

if (!isMainThread) {
	runWorker(workerData as Task[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => { throw error })
} else {
	await main()
}
