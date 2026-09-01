import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import { apcaContrast } from "./src/color.ts"
import { ALGORITHM_VERSION } from "./src/extract.ts"
import { clampRelationEvidence, harmonicConjunction } from "./src/field-relation.ts"
import { loadImage } from "./src/image.ts"
import {
	buildJointPaletteCompactRelationDominance,
	JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_POLICY,
	JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_VERSION,
	type CompactRelationDominanceFrontierEntry,
	type CompactRelationEvidence,
	type JointPaletteCompactRelationDominanceCertificate,
} from "./src/joint-palette-compact-relation-dominance.ts"
import type { CorpusResult, ExtractionResult, Palette, RGB, RoleName } from "./src/types.ts"

const EXPERIMENT_VERSION = "joint-palette-compact-relation-dominance-0.1.0-development"
const FACTORIAL_AUDIT_EXPERIMENT_ID = "a74f5d2f03c3f4427a67e73876ed8e3d076b8d4eed20f9508a1e600415b06877"
const EVIDENCE_EXPERIMENT_ID = "1241b18a1f8d882f36da4e2e9bf6b50928d71394e1b848b92a92e09def4660f9"
const JOINT_PARETO_EXPERIMENT_ID = "c31541f6ad1fe7fb57cf9b6b5d4373a1f0ef00f7974c8dd9c511b804f3e6b283"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const outputRoot = join(researchRoot, "data/experiments", EXPERIMENT_VERSION)
const epsilon = JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_POLICY.comparisonEpsilon
const roleNames = ["background", "foreground", "surface", "accent"] as const

const inputFiles = {
	factorialAuditManifest:
		"research/data/experiments/next-palette-joint-field-relation-factorial-audit-0.1.0-development/manifest.json",
	factorialAuditAnalysis:
		"research/data/experiments/next-palette-joint-field-relation-factorial-audit-0.1.0-development/analysis.json",
	evidenceManifest: "research/data/experiments/joint-palette-evidence-frontier-0.1.1-development/manifest.json",
	evidenceAnalysis: "research/data/experiments/joint-palette-evidence-frontier-0.1.1-development/analysis.json",
	jointParetoManifest: "research/data/experiments/next-palette-joint-pareto-0.5.0-development/manifest.json",
	jointParetoResults: "research/data/experiments/next-palette-joint-pareto-0.5.0-development/results.json",
	jointParetoCertificates: "research/data/experiments/next-palette-joint-pareto-0.5.0-development/certificates.json",
	canonicalDevelopment: "research/data/results.json",
	canonical00: "research/data/holdout-results.json",
} as const

const implementationFiles = [
	"package.json",
	"pnpm-lock.yaml",
	"research/src/types.ts",
	"research/src/color.ts",
	"research/src/image.ts",
	"research/src/regions.ts",
	"research/src/candidates.ts",
	"research/src/palette.ts",
	"research/src/extract.ts",
	"research/src/palette-perception.ts",
	"research/src/palette-evidence-graph.ts",
	"research/src/palette-relation-graph.ts",
	"research/src/field-relation.ts",
	"research/src/connected-family-candidate-availability.ts",
	"research/src/connected-family-representative-fidelity.ts",
	"research/src/joint-palette-evidence.ts",
	"research/src/next-palette-joint-pareto.ts",
	"research/src/joint-palette-compact-relation-dominance.ts",
	"research/evaluate-joint-palette-compact-relation-dominance-development.ts",
	"research/tests/joint-palette-compact-relation-dominance.test.ts",
	"research/tests/joint-palette-compact-relation-dominance-artifact.test.ts",
] as const

type Source = { cohort: "development" | "00"; path: string; sha256: string; bytes: number }
type Task = Source & { canonical: ExtractionResult }
type WorkerResult = {
	cohort: Source["cohort"]
	file: string
	source: { sha256: string; bytes: number }
	canonical: Palette
	candidate: Palette
	certificate: JointPaletteCompactRelationDominanceCertificate
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

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function sameRole(first: Palette[RoleName], second: Palette[RoleName]): boolean {
	return sameRgb(first.rgb, second.rgb) && first.generated === second.generated
}

function paletteState(palette: Palette): "collapsed" | "distinct-flat" | "gradient" {
	return sameRgb(palette.background.rgb, palette.surface.rgb)
		? "collapsed"
		: palette.gradient.isGradient ? "gradient" : "distinct-flat"
}

function dominates(first: readonly number[], second: readonly number[]): boolean {
	return first.every((value, index) => value + epsilon >= second[index]) &&
		first.some((value, index) => value > second[index] + epsilon)
}

function assertCompact(compact: CompactRelationEvidence, state: "distinct-flat" | "gradient"): boolean {
	const topology = state === "gradient"
		? harmonicConjunction([compact.topologyInputs.continuity, compact.topologyInputs.monotoneConnectivity,
			compact.topologyInputs.progression])
		: clampRelationEvidence(1 - Math.max(compact.topologyInputs.continuity, compact.topologyInputs.progression))
	const joint = harmonicConjunction([compact.backgroundSupport, compact.surfaceSupport])
	const support = harmonicConjunction([compact.endpointMass, joint, topology])
	return compact.recompositionPass && isDeepStrictEqual(compact.vector,
		[compact.endpointMass, compact.backgroundSupport, compact.surfaceSupport, compact.stateTopology]) &&
		Math.abs(compact.stateTopology - topology) <= epsilon && Math.abs(compact.jointSupport - joint) <= epsilon &&
		Math.abs(compact.recomposedJointSupport - joint) <= epsilon &&
		Math.abs(compact.reportedStateSupport - support) <= epsilon &&
		Math.abs(compact.recomposedStateSupport - support) <= epsilon
}

function expectedPareto(entries: readonly CompactRelationDominanceFrontierEntry[]): CompactRelationDominanceFrontierEntry[] {
	return entries.filter((candidate) => !entries.some((other) =>
		other !== candidate && dominates(other.objectives, candidate.objectives)))
		.sort((first, second) => first.changedSemanticBlocks - second.changedSemanticBlocks ||
			first.changedSemanticAtoms - second.changedSemanticAtoms || compareAscii(first.semanticKey, second.semanticKey) ||
			compareAscii(first.stableKey, second.stableKey))
}

function structural(
	task: Task,
	result: ReturnType<typeof buildJointPaletteCompactRelationDominance>,
	imageData: Uint8Array,
): string[] {
	const violations: string[] = []
	const canonical = task.canonical.methods.spatial
	const candidate = result.candidate
	const certificate = result.certificate
	const selected = certificate.selected
	if (!isDeepStrictEqual(result.canonical, canonical)) violations.push("canonical-recomputation")
	if (certificate.version !== JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_VERSION ||
		certificate.policy !== JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_POLICY ||
		certificate.policy.fixedApcaAdmissionFloor !== null || !certificate.policy.developmentDiagnosticOnly ||
		certificate.policy.generatedChallengersAllowed) violations.push("policy")
	if (!Object.values(certificate.invariants).every(Boolean)) violations.push("declared-invariants")
	if (certificate.admittedTupleFrontier.length !== certificate.counts.admittedCompleteTuples ||
		certificate.completeTupleFrontier.length !== certificate.counts.completeTupleFrontier ||
		certificate.withinClassFrontier.length !== certificate.counts.withinClassFrontier) {
		violations.push("frontier-counts")
	}
	const domainBytes = JSON.stringify(certificate.admittedTupleFrontier.map((entry) => ({
		stableKey: entry.stableKey,
		semanticKey: entry.semanticKey,
		changedSemanticBlocks: entry.changedSemanticBlocks,
		changedSemanticAtoms: entry.changedSemanticAtoms,
		objectives: entry.objectives,
		compactVector: entry.compactVector,
	})))
	if (sha256(domainBytes) !== certificate.domain.admittedSha256) violations.push("admitted-domain-binding")
	const expectedComplete = expectedPareto(certificate.admittedTupleFrontier)
	if (!isDeepStrictEqual(certificate.completeTupleFrontier, expectedComplete)) violations.push("complete-tuple-frontier")
	const minimumBlocks = certificate.admittedTupleFrontier.length === 0 ? Infinity : Math.min(
		...certificate.admittedTupleFrontier.map((entry) => entry.changedSemanticBlocks),
	)
	const expectedWithin = expectedPareto(certificate.admittedTupleFrontier.filter((entry) =>
		entry.changedSemanticBlocks === minimumBlocks))
	if (!isDeepStrictEqual(certificate.withinClassFrontier, expectedWithin)) violations.push("within-class-frontier")
	if (!selected.changed) {
		if (selected.admitted || selected.fieldTreatment || selected.compactDeltas || selected.relationDominanceWitness ||
			certificate.route === "compact-relation-dominator" || !isDeepStrictEqual(candidate, canonical) ||
			JSON.stringify(candidate) !== JSON.stringify(canonical) || certificate.admittedTupleFrontier.length > 0) {
			violations.push("canonical-fallback")
		}
		return [...new Set(violations)].sort()
	}
	if (certificate.route !== "compact-relation-dominator" || !selected.admitted || !selected.fieldTreatment ||
		!selected.compact || !selected.compactDeltas || !selected.relationDominanceWitness || !selected.roles) {
		violations.push("selected-certificate")
		return [...new Set(violations)].sort()
	}
	const canonicalState = paletteState(canonical)
	const candidateState = paletteState(candidate)
	const fieldChanged = !sameRole(candidate.background, canonical.background) ||
		!sameRole(candidate.surface, canonical.surface) || candidateState !== canonicalState
	const foregroundChanged = !sameRole(candidate.foreground, canonical.foreground)
	const accentChanged = !sameRole(candidate.accent, canonical.accent)
	if (!fieldChanged || foregroundChanged || accentChanged || selected.changedSemanticBlocks !== 1) {
		violations.push("one-field-block")
	}
	if (canonicalState === "collapsed" || candidateState !== canonicalState || selected.fieldState !== canonicalState) {
		violations.push("same-noncollapsed-state")
	}
	if (!isDeepStrictEqual(candidate.foreground, canonical.foreground) ||
		!isDeepStrictEqual(candidate.accent, canonical.accent)) violations.push("overlay-semantics")
	if (!certificate.canonical.relation.resolved || !certificate.canonical.relation.maximumSupportReproduced ||
		certificate.canonical.relation.materiallyAmbiguous || !certificate.canonical.relation.compact) {
		violations.push("canonical-relation")
	} else if (!assertCompact(certificate.canonical.relation.compact, canonicalState as "distinct-flat" | "gradient")) {
		violations.push("canonical-recomposition")
	}
	if (!assertCompact(selected.compact, candidateState as "distinct-flat" | "gradient")) {
		violations.push("selected-recomposition")
	}
	const compactDeltas = selected.compact.vector.map((value, index) =>
		value - certificate.canonical.relation.compact!.vector[index])
	if (!isDeepStrictEqual(selected.compactDeltas, compactDeltas) ||
		!compactDeltas.every((delta) => delta >= -epsilon) || !compactDeltas.some((delta) => delta > epsilon)) {
		violations.push("compact-strict-dominance")
	}
	if (!selected.objectiveDeltas.every((delta) => delta >= -epsilon) ||
		!selected.objectiveDeltas.some((delta) => delta > epsilon) ||
		!dominates(selected.objectives, certificate.canonical.objectives)) violations.push("six-vector-strict-dominance")
	const witness = selected.relationDominanceWitness
	if (!isDeepStrictEqual(witness.canonicalVector, certificate.canonical.relation.compact!.vector) ||
		!isDeepStrictEqual(witness.selectedVector, selected.compact.vector) ||
		!isDeepStrictEqual(witness.deltas, selected.compactDeltas) ||
		!witness.componentwiseWeakDominance.every(Boolean) || witness.strictlyImprovedComponents.length === 0) {
		violations.push("relation-dominance-witness")
	}
	for (const role of roleNames) {
		const provenance = selected.roles[role]
		const offset = provenance.representativePixelIndex * 3
		if (provenance.representativePixelIndex < 0 || !sameRgb(provenance.rgb, candidate[role].rgb) ||
			candidate[role].generated || provenance.rgb[0] !== imageData[offset] ||
			provenance.rgb[1] !== imageData[offset + 1] || provenance.rgb[2] !== imageData[offset + 2] ||
			!/^[a-f0-9]{64}$/.test(provenance.supportMaskSha256)) violations.push(`source-exact:${role}`)
	}
	if (new Set(roleNames.map((role) => candidate[role].hex)).size > 4) violations.push("maximum-four-colors")
	const recomputedApca = {
		foregroundOnBackground: apcaContrast(candidate.foreground.rgb, candidate.background.rgb),
		foregroundOnSurface: apcaContrast(candidate.foreground.rgb, candidate.surface.rgb),
		accentOnBackground: apcaContrast(candidate.accent.rgb, candidate.background.rgb),
		accentOnSurface: apcaContrast(candidate.accent.rgb, candidate.surface.rgb),
	}
	if (!isDeepStrictEqual(selected.apcaLc, recomputedApca) ||
		Object.values(selected.apcaLc).some((value) => !Number.isFinite(value))) violations.push("signed-finite-apca")
	if (certificate.withinClassFrontier[0]?.stableKey !== selected.stableKey ||
		certificate.admittedTupleFrontier.some((entry) => entry.changedSemanticBlocks !== 1 ||
			entry.changedBlocks.field !== true || entry.changedBlocks.foreground || entry.changedBlocks.accent ||
			!dominates(entry.objectives, certificate.canonical.objectives) ||
			!dominates(entry.compactVector, certificate.canonical.relation.compact!.vector))) {
		violations.push("selection-hierarchy")
	}
	return [...new Set(violations)].sort()
}

async function evaluate(task: Task): Promise<WorkerResult> {
	if (!/^(?:images|00)\/[^/\\]+$/.test(task.path)) throw new Error(`Unauthorized compact-relation source: ${task.path}`)
	const bytes = await readFile(join(projectRoot, task.path))
	if (bytes.byteLength !== task.bytes || sha256(bytes) !== task.sha256) {
		throw new Error(`Compact-relation source binding changed: ${task.path}`)
	}
	const image = await loadImage(bytes)
	const started = performance.now()
	const result = buildJointPaletteCompactRelationDominance(image)
	const elapsedMs = performance.now() - started
	return {
		cohort: task.cohort,
		file: task.path,
		source: { sha256: task.sha256, bytes: task.bytes },
		canonical: result.canonical,
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
					process.stderr.write(`compact relation dominance evaluation: ${completed}/${tasks.length}\r`)
				}
			}
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Compact relation dominance worker exited with code ${code}`))
		})
	}))
	const results = (await Promise.all(workers)).flat().sort((first, second) =>
		compareAscii(first.cohort, second.cohort) || compareAscii(first.file, second.file))
	process.stderr.write(`compact relation dominance evaluation: ${results.length}/${tasks.length}\n`)
	return results
}

function canonicalMap(development: CorpusResult, canonical00: CorpusResult): Map<string, ExtractionResult> {
	return new Map([
		...development.entries.map((entry) => [`images/${entry.file}`, entry.extraction] as const),
		...canonical00.entries.map((entry) => [entry.file, entry.extraction] as const),
	])
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite compact relation dominance experiment: ${outputRoot}`)
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) {
		throw new Error("evaluate-joint-palette-compact-relation-dominance-development.ts does not accept arguments")
	}
	await assertOutputAbsent()
	const inputEntries = await Promise.all(Object.entries(inputFiles).map(async ([name, path]) => {
		const raw = await readFile(join(projectRoot, path))
		return [name, { path, raw, sha256: sha256(raw) }] as const
	}))
	const inputs = Object.fromEntries(inputEntries) as Record<keyof typeof inputFiles, { path: string; raw: Buffer; sha256: string }>
	const parse = <T>(name: keyof typeof inputFiles): T => JSON.parse(inputs[name].raw.toString("utf8")) as T
	const auditManifest = parse<{
		experimentId: string
		inputs: Record<string, { path: string; sha256: string }>
		sources: Source[]
	}>("factorialAuditManifest")
	const auditAnalysis = parse<{
		experimentId: string
		structural: { pass: boolean; violationCount: number; caseCount: number }
		matrix: { total: number; development: number; cohort00: number; prospectiveFrontier: number }
		prospectiveReview: { frontierSize: number; authorizedByThisAudit: boolean }
	}>("factorialAuditAnalysis")
	const evidenceManifest = parse<{ experimentId: string; sources: Source[] }>("evidenceManifest")
	const evidenceAnalysis = parse<{
		experimentId: string
		structural: { pass: boolean; violationCount: number }
		coverage: { total: number; development: number; cohort00: number }
		stoppingRules: { pass: boolean }
	}>("evidenceAnalysis")
	const paretoManifest = parse<{ experimentId: string; sources: Source[] }>("jointParetoManifest")
	const paretoResults = parse<{ experimentId: string; entries: Array<{ file: string }> }>("jointParetoResults")
	const paretoCertificates = parse<{ experimentId: string; entries: Record<string, unknown> }>("jointParetoCertificates")
	const development = parse<CorpusResult>("canonicalDevelopment")
	const canonical00 = parse<CorpusResult>("canonical00")
	if (auditManifest.experimentId !== FACTORIAL_AUDIT_EXPERIMENT_ID ||
		auditAnalysis.experimentId !== FACTORIAL_AUDIT_EXPERIMENT_ID || !auditAnalysis.structural.pass ||
		auditAnalysis.structural.violationCount !== 0 || auditAnalysis.structural.caseCount !== 0 ||
		auditAnalysis.matrix.total !== 392 || auditAnalysis.matrix.development !== 37 ||
		auditAnalysis.matrix.cohort00 !== 355 || auditAnalysis.matrix.prospectiveFrontier !== 2 ||
		auditAnalysis.prospectiveReview.frontierSize !== 2 || auditAnalysis.prospectiveReview.authorizedByThisAudit ||
		evidenceManifest.experimentId !== EVIDENCE_EXPERIMENT_ID || evidenceAnalysis.experimentId !== EVIDENCE_EXPERIMENT_ID ||
		!evidenceAnalysis.structural.pass || evidenceAnalysis.structural.violationCount !== 0 ||
		!evidenceAnalysis.stoppingRules.pass || !isDeepStrictEqual(evidenceAnalysis.coverage,
			{ total: 392, development: 37, cohort00: 355 }) ||
		paretoManifest.experimentId !== JOINT_PARETO_EXPERIMENT_ID || paretoResults.experimentId !== JOINT_PARETO_EXPERIMENT_ID ||
		paretoCertificates.experimentId !== JOINT_PARETO_EXPERIMENT_ID || development.algorithmVersion !== ALGORITHM_VERSION ||
		canonical00.algorithmVersion !== ALGORITHM_VERSION) throw new Error("Compact relation dominance input bindings disagree")
	const scientificInputs = ["evidenceManifest", "evidenceAnalysis", "jointParetoManifest", "jointParetoResults",
		"jointParetoCertificates", "canonicalDevelopment", "canonical00"] as const
	for (const name of scientificInputs) {
		if (!isDeepStrictEqual(auditManifest.inputs[name], { path: inputs[name].path, sha256: inputs[name].sha256 })) {
			throw new Error(`Factorial audit scientific binding changed: ${name}`)
		}
	}
	if (!isDeepStrictEqual(auditManifest.sources, evidenceManifest.sources) ||
		!isDeepStrictEqual(auditManifest.sources, paretoManifest.sources) || auditManifest.sources.length !== 392 ||
		paretoResults.entries.length !== 392 || Object.keys(paretoCertificates.entries).length !== 392 ||
		new Set(auditManifest.sources.map((source) => source.path)).size !== 392) {
		throw new Error("Compact relation dominance source matrix is incomplete")
	}
	for (const [name, input] of Object.entries(inputs)) {
		if (/review|feedback|interpretation|comments?|target|nine[-_ ]?case|ablation-stable/i.test(`${name}:${input.path}`)) {
			throw new Error(`Forbidden compact relation dominance input: ${name}`)
		}
	}
	const canonicalByFile = canonicalMap(development, canonical00)
	const tasks = auditManifest.sources.map((source): Task => {
		const canonical = canonicalByFile.get(source.path)
		if (!canonical) throw new Error(`Missing canonical extraction for ${source.path}`)
		return { ...source, canonical }
	})
	const results = await runParallel(tasks)
	const violations = results.filter((result) => result.structural.violations.length > 0)
	const candidates = results.filter((result) => result.certificate.selected.changed)
	const candidateCount = candidates.length
	const eligibleForSeparateAudit = violations.length === 0 && candidateCount >= 1 && candidateCount <= 40
	const classification = violations.length > 0
		? "stop-structural-violations"
		: candidateCount === 0
			? "stop-zero-candidates"
			: candidateCount > 40
				? "stop-more-than-40-candidates"
				: "eligible-for-separate-exact-presentation-novelty-transfer-audit"
	const protocol = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		diagnosticVersion: JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_VERSION,
		hypothesisBinding: {
			factorialAuditExperimentId: FACTORIAL_AUDIT_EXPERIMENT_ID,
			requiredStructuralPass: true,
			predeclaredProspectiveFrontierSize: 2,
		},
		authorization: {
			developmentDiagnosticOnly: true,
			allowedSourceRoots: ["images", "00"],
			outputUnseenRootsOpened: [] as string[],
			generatedChallengersAllowed: false,
			canonicalPromotionAuthorized: false,
			candidateFreezeAuthorized: false,
			reserveAccessAuthorized: false,
			broaderReviewAuthorized: false,
			humanReviewPrepared: false,
			exactReviewTransferAuthorized: false,
			exactPresentationNoveltyTransferAuditDeferred: true,
		},
		inputs: {
			reviewFeedbackConsumed: false,
			reviewAnalysisConsumed: false,
			reviewInterpretationConsumed: false,
			reviewCommentsConsumed: false,
			targetColorsConsumed: false,
			nineCaseExperimentConsumed: false,
		},
		selector: {
			canonicalIncumbent: ALGORITHM_VERSION,
			maximumDistinctRoleColors: 4,
			fixedApcaAdmissionFloor: null,
			requiredChangedSemanticBlocks: 1,
			requiredChangedBlock: "field",
			overlayBlock: "exact-canonical-semantics",
			fieldState: "same-noncollapsed",
			compactRelationDominance: "componentwise-weak-with-at-least-one-strict",
			completeTupleDominance: "inherited-six-objective-strict",
			comparisonEpsilon: epsilon,
		},
		stoppingRules: {
			totalSourcesMustEqual: 392,
			developmentSourcesMustEqual: 37,
			cohort00SourcesMustEqual: 355,
			structuralViolationsMustEqual: 0,
			frontierIsCompleteChangedSetWithoutSampling: true,
			zeroCandidatesStops: true,
			oneThrough40CandidatesEligibleOnlyForSeparateAudit: true,
			moreThan40CandidatesStops: true,
		},
	}
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (path) =>
		[path, sha256(await readFile(join(projectRoot, path)))] as const)))
	const identity = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		diagnosticVersion: JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_VERSION,
		policy: JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_POLICY,
		protocol,
		inputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) =>
			[name, { path: input.path, sha256: input.sha256 }])),
		sources: auditManifest.sources,
		implementation,
	}
	const experimentId = sha256(JSON.stringify(canonicalValue(identity)))
	const generatedAt = new Date().toISOString()
	const resultArtifact = {
		schemaVersion: 1,
		experimentId,
		diagnosticVersion: JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_VERSION,
		entries: results.map(({ elapsedMs: _elapsedMs, ...result }) => result),
	}
	const frontierEntries = candidates.map((result) => ({
		file: result.file,
		cohort: result.cohort,
		source: { path: result.file, ...result.source },
		changedRoles: roleNames.filter((role) => !sameRole(result.canonical[role], result.candidate[role])),
		gradientChanged: result.canonical.gradient.isGradient !== result.candidate.gradient.isGradient,
		baseline: result.canonical,
		candidate: result.candidate,
		selected: result.certificate.selected,
		canonicalRelation: result.certificate.canonical.relation,
		counts: result.certificate.counts,
	}))
	const frontier = {
		schemaVersion: 1,
		experimentId,
		diagnosticVersion: JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_VERSION,
		definition: "complete changed case set from the prospective constrained selector; no sampling or postselection mutation",
		sampling: null,
		entries: frontierEntries,
	}
	const stateCounts = {
		collapsed: candidates.filter((result) => result.certificate.selected.fieldState === "collapsed").length,
		"distinct-flat": candidates.filter((result) => result.certificate.selected.fieldState === "distinct-flat").length,
		gradient: candidates.filter((result) => result.certificate.selected.fieldState === "gradient").length,
	}
	const atoms = candidates.map((result) => result.certificate.selected.changedSemanticAtoms)
	const atomCounts = Object.fromEntries([...new Set(atoms)].sort((first, second) => first - second).map((atom) =>
		[String(atom), atoms.filter((value) => value === atom).length]))
	const structuralChecks = {
		completeMatrix: results.length === 392,
		cohorts: results.filter((result) => result.cohort === "development").length === 37 &&
			results.filter((result) => result.cohort === "00").length === 355,
		zeroViolations: violations.length === 0,
		exactCanonicalFallbacks: results.filter((result) => !result.certificate.selected.changed).every((result) =>
			isDeepStrictEqual(result.candidate, result.canonical) &&
			JSON.stringify(result.candidate) === JSON.stringify(result.canonical)),
		completeFrontier: isDeepStrictEqual(frontierEntries.map((entry) => entry.file),
			results.filter((result) => result.certificate.selected.changed).map((result) => result.file)),
	}
	const analysis = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		experimentId,
		generatedAt,
		candidateCount,
		classification,
		structural: {
			pass: Object.values(structuralChecks).every(Boolean),
			violationCount: violations.reduce((sum, result) => sum + result.structural.violations.length, 0),
			caseCount: violations.length,
			checks: structuralChecks,
			entries: violations.map((result) => ({ file: result.file, violations: result.structural.violations })),
		},
		matrix: {
			total: results.length,
			development: results.filter((result) => result.cohort === "development").length,
			cohort00: results.filter((result) => result.cohort === "00").length,
			changed: candidateCount,
			canonicalFallback: results.length - candidateCount,
		},
		cohorts: {
			development: {
				total: results.filter((result) => result.cohort === "development").length,
				changed: candidates.filter((result) => result.cohort === "development").length,
			},
			"00": {
				total: results.filter((result) => result.cohort === "00").length,
				changed: candidates.filter((result) => result.cohort === "00").length,
			},
		},
		states: stateCounts,
		atoms: {
			minimum: atoms.length === 0 ? null : Math.min(...atoms),
			maximum: atoms.length === 0 ? null : Math.max(...atoms),
			counts: atomCounts,
		},
		tuples: {
			admitted: candidates.reduce((sum, result) => sum + result.certificate.counts.admittedCompleteTuples, 0),
			completeFrontier: candidates.reduce((sum, result) => sum + result.certificate.counts.completeTupleFrontier, 0),
			withinClassFrontier: candidates.reduce((sum, result) => sum + result.certificate.counts.withinClassFrontier, 0),
		},
		frontier: {
			definition: frontier.definition,
			count: frontierEntries.length,
			completeChangedSet: structuralChecks.completeFrontier,
			sampled: false,
		},
		nextGate: {
			eligibleForSeparateExactPresentationNoveltyTransferAudit: eligibleForSeparateAudit,
			authorizedByThisExperiment: false,
			reviewPrepared: false,
			exactReviewTransferEvaluated: false,
			noveltyEvaluated: false,
		},
		performance: {
			meanMs: results.reduce((sum, result) => sum + result.elapsedMs, 0) / results.length,
			maximumMs: Math.max(...results.map((result) => result.elapsedMs)),
			totalWorkerMs: results.reduce((sum, result) => sum + result.elapsedMs, 0),
		},
		disposition: classification,
	}
	await mkdir(outputRoot)
	await Promise.all([
		writeExclusive(join(outputRoot, "protocol.json"), protocol),
		writeExclusive(join(outputRoot, "manifest.json"), { ...identity, experimentId, generatedAt }),
		writeExclusive(join(outputRoot, "results.json"), resultArtifact),
		writeExclusive(join(outputRoot, "frontier.json"), frontier),
		writeExclusive(join(outputRoot, "analysis.json"), analysis),
	])
	process.stderr.write(`Wrote compact relation dominance experiment ${experimentId} to ${outputRoot}\n`)
}

if (!isMainThread) {
	runWorker(workerData as Task[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => { throw error })
} else {
	await main()
}
