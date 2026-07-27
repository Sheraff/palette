import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import { apcaContrast, labAt, okDistance, rgbToOKLab } from "./src/color.ts"
import { ALGORITHM_VERSION } from "./src/extract.ts"
import { clampRelationEvidence, harmonicConjunction, type FieldRelationEvidence } from "./src/field-relation.ts"
import { loadImage } from "./src/image.ts"
import {
	jointPaletteFieldStateEvidence,
	type JointPaletteFieldState,
} from "./src/joint-palette-evidence.ts"
import {
	extractNextPaletteJointParetoWithContext,
	NEXT_PALETTE_JOINT_PARETO_ALGORITHM_VERSION,
	NEXT_PALETTE_JOINT_PARETO_POLICY,
	type NextPaletteJointParetoCertificate,
	type NextPaletteJointSelectionSummary,
} from "./src/next-palette-joint-pareto.ts"
import type { PaletteRelationNode } from "./src/palette-relation-graph.ts"
import type { CorpusResult, ExtractionResult, Palette, RGB, RoleName } from "./src/types.ts"

const EXPERIMENT_VERSION = "next-palette-joint-field-relation-factorial-audit-0.1.0-development"
const EVIDENCE_EXPERIMENT_ID = "1241b18a1f8d882f36da4e2e9bf6b50928d71394e1b848b92a92e09def4660f9"
const JOINT_PARETO_EXPERIMENT_ID = "c31541f6ad1fe7fb57cf9b6b5d4373a1f0ef00f7974c8dd9c511b804f3e6b283"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const outputRoot = join(researchRoot, "data/experiments", EXPERIMENT_VERSION)
const epsilon = NEXT_PALETTE_JOINT_PARETO_POLICY.comparisonEpsilon
const roleNames = ["background", "foreground", "surface", "accent"] as const

const inputFiles = {
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
	"research/audit-next-palette-joint-field-relation-factorial-development.ts",
	"research/tests/next-palette-joint-field-relation-factorial-audit-artifact.test.ts",
] as const

type Source = { cohort: "development" | "00"; path: string; sha256: string; bytes: number }
type FrozenResult = {
	cohort: Source["cohort"]
	file: string
	source: { sha256: string; bytes: number }
	palette: Palette
	exactChanged: boolean
	changedRoles: RoleName[]
	gradientChanged: boolean
	structural: { violations: string[] }
}
type Task = Source & {
	canonical: ExtractionResult
	frozenResult: FrozenResult
	frozenCertificate: NextPaletteJointParetoCertificate
}
type CompactRelation = {
	vector: readonly [endpointMass: number, backgroundSupport: number, surfaceSupport: number, stateTopology: number]
	endpointMass: number
	backgroundSupport: number
	surfaceSupport: number
	stateTopology: number
	topologyInputs: {
		continuity: number
		monotoneConnectivity: number
		progression: number
	}
	jointSupport: number
	recomposedJointSupport: number
	reportedStateSupport: number
	recomposedStateSupport: number
	recompositionPass: boolean
}
type RelationEvaluation = ReturnType<typeof jointPaletteFieldStateEvidence>
type CanonicalPair = {
	background: PaletteRelationNode
	surface: PaletteRelationNode
	evidence: RelationEvaluation
	compact: CompactRelation | null
}
type FactorBits = { S: boolean; M: boolean; O: boolean; T: boolean }
type WorkerResult = {
	cohort: Source["cohort"]
	file: string
	source: { sha256: string; bytes: number }
	canonical: Palette
	selected: Palette
	reproduction: {
		palette: boolean
		certificate: boolean
		canonicalExtraction: boolean
	}
	canonicalRelation: {
		state: JointPaletteFieldState
		backgroundAliasCount: number
		surfaceAliasCount: number
		evaluatedPairCount: number
		maximumSupport: number
		incumbentObjectiveStateSupport: number
		maximumSupportReproduced: boolean
		maximizingPairCount: number
		materiallyAmbiguous: boolean
		collapsedUncomparable: boolean
		resolved: boolean
		resolvedNodeIds: { background: number; surface: number } | null
		compact: CompactRelation | null
	}
	selectedRelation: {
		available: boolean
		valid: boolean
		state: JointPaletteFieldState
		treatmentNodeIds: { background: number; surface: number } | null
		compact: CompactRelation | null
	}
	comparison: {
		disposition: "comparable" | "uncomparable-canonical-collapsed" | "uncomparable-state-not-preserved" |
			"uncomparable-canonical-alias-ambiguity" | "uncomparable-relation-unavailable"
		compactDeltas: readonly [number, number, number, number] | null
		weakDominance: boolean
		strictImprovement: boolean
	}
	baseEligibility: {
		checks: Record<string, boolean>
		pass: boolean
	}
	factors: {
		bits: FactorBits
		applicable: { M: boolean; O: boolean; T: boolean }
		route: string
	}
	nestedArms: { S: boolean; SM: boolean; SMO: boolean; SMOT: boolean }
	prospectiveFrontier: boolean
	diagnostics: {
		reconstruction: {
			policy: "common-pixel-domain-floor-n-over-12000-stride"
			stride: number
			samples: number
			canonical: number
			selected: number
			delta: number
		}
		signedApcaLc: {
			canonical: Record<string, number>
			selected: Record<string, number>
		}
	}
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

function sameRole(first: Palette[RoleName], second: Palette[RoleName]): boolean {
	return sameRgb(first.rgb, second.rgb) && first.generated === second.generated
}

function fieldState(palette: Palette): JointPaletteFieldState {
	return sameRgb(palette.background.rgb, palette.surface.rgb)
		? "collapsed"
		: palette.gradient.isGradient ? "gradient" : "distinct-flat"
}

function normalizedExtraction(extraction: ExtractionResult): ExtractionResult {
	return { ...extraction, diagnostics: { ...extraction.diagnostics, processingMs: 0 } }
}

function selectedSummary(certificate: NextPaletteJointParetoCertificate): NextPaletteJointSelectionSummary {
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

function compactRelation(state: JointPaletteFieldState, relation: FieldRelationEvidence | null): CompactRelation | null {
	if (state === "collapsed" || !relation) return null
	const topologyInputs = {
		continuity: relation.distribution.continuity,
		monotoneConnectivity: relation.topology.monotoneConnectivity,
		progression: relation.distribution.progression,
	}
	const stateTopology = state === "gradient"
		? harmonicConjunction([topologyInputs.continuity, topologyInputs.monotoneConnectivity, topologyInputs.progression])
		: clampRelationEvidence(1 - Math.max(topologyInputs.continuity, topologyInputs.progression))
	const recomposedJointSupport = harmonicConjunction([
		relation.field.backgroundSupport,
		relation.field.surfaceSupport,
	])
	const reportedStateSupport = state === "gradient"
		? relation.stateSupport.gradient
		: relation.stateSupport.distinctFlat
	const recomposedStateSupport = harmonicConjunction([relation.endpoint.mass, recomposedJointSupport, stateTopology])
	return {
		vector: [relation.endpoint.mass, relation.field.backgroundSupport, relation.field.surfaceSupport, stateTopology],
		endpointMass: relation.endpoint.mass,
		backgroundSupport: relation.field.backgroundSupport,
		surfaceSupport: relation.field.surfaceSupport,
		stateTopology,
		topologyInputs,
		jointSupport: relation.field.jointSupport,
		recomposedJointSupport,
		reportedStateSupport,
		recomposedStateSupport,
		recompositionPass: Math.abs(relation.field.jointSupport - recomposedJointSupport) <= epsilon &&
			Math.abs(reportedStateSupport - recomposedStateSupport) <= epsilon,
	}
}

function vectorEqual(first: readonly number[], second: readonly number[]): boolean {
	return first.length === second.length && first.every((value, index) => Math.abs(value - second[index]) <= epsilon)
}

function canonicalRelation(
	canonical: Palette,
	certificate: NextPaletteJointParetoCertificate,
	graph: ReturnType<typeof extractNextPaletteJointParetoWithContext>["evidence"]["graph"],
	analysis: ReturnType<typeof extractNextPaletteJointParetoWithContext>["evidence"]["perception"]["analysis"],
): WorkerResult["canonicalRelation"] {
	const state = fieldState(canonical)
	const nodes = graph.nodes.filter((node) => !node.typographyOnly)
	const backgrounds = canonical.background.generated ? [] : nodes.filter((node) => sameRgb(node.rgb, canonical.background.rgb))
	const surfaces = canonical.surface.generated ? [] : nodes.filter((node) => sameRgb(node.rgb, canonical.surface.rgb))
	const pairs = backgrounds.flatMap((background) => surfaces.map((surface): CanonicalPair => {
		const evidence = jointPaletteFieldStateEvidence(graph, analysis, background, surface, state)
		return { background, surface, evidence, compact: compactRelation(state, evidence.relation) }
	})).sort((first, second) => first.background.stableKey.localeCompare(second.background.stableKey) ||
		first.surface.stableKey.localeCompare(second.surface.stableKey))
	const maximumSupport = pairs.length === 0 ? 0 : Math.max(...pairs.map((pair) => pair.evidence.support))
	const maximizing = pairs.filter((pair) => Math.abs(pair.evidence.support - maximumSupport) <= epsilon)
	const compactVectors = maximizing.flatMap((pair) => pair.compact ? [pair.compact.vector] : [])
	const materiallyAmbiguous = compactVectors.length > 1 && compactVectors.some((vector) =>
		!vectorEqual(vector, compactVectors[0]))
	const resolved = state !== "collapsed" && maximizing.length > 0 && !materiallyAmbiguous && maximizing[0].compact !== null
	return {
		state,
		backgroundAliasCount: backgrounds.length,
		surfaceAliasCount: surfaces.length,
		evaluatedPairCount: pairs.length,
		maximumSupport,
		incumbentObjectiveStateSupport: certificate.incumbent.objectives[1],
		maximumSupportReproduced: Math.abs(maximumSupport - certificate.incumbent.objectives[1]) <= epsilon,
		maximizingPairCount: maximizing.length,
		materiallyAmbiguous,
		collapsedUncomparable: state === "collapsed",
		resolved,
		resolvedNodeIds: resolved ? { background: maximizing[0].background.id, surface: maximizing[0].surface.id } : null,
		compact: resolved ? maximizing[0].compact : null,
	}
}

function selectedRelation(
	palette: Palette,
	certificate: NextPaletteJointParetoCertificate,
	graph: ReturnType<typeof extractNextPaletteJointParetoWithContext>["evidence"]["graph"],
	analysis: ReturnType<typeof extractNextPaletteJointParetoWithContext>["evidence"]["perception"]["analysis"],
): WorkerResult["selectedRelation"] {
	const treatment = certificate.selected.fieldTreatment
	const state = fieldState(palette)
	if (!treatment) return { available: false, valid: !certificate.selected.changed, state, treatmentNodeIds: null, compact: null }
	const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
	const background = nodeById.get(treatment.backgroundNodeId)
	const surface = nodeById.get(treatment.surfaceNodeId)
	if (!background || !surface) {
		return { available: true, valid: false, state, treatmentNodeIds: {
			background: treatment.backgroundNodeId, surface: treatment.surfaceNodeId }, compact: null }
	}
	const recomputed = jointPaletteFieldStateEvidence(graph, analysis, background, surface, treatment.state)
	const compact = compactRelation(treatment.state, recomputed.relation)
	const valid = !background.typographyOnly && !surface.typographyOnly && treatment.state === certificate.selected.fieldState &&
		treatment.state === state && sameRgb(background.rgb, palette.background.rgb) && sameRgb(surface.rgb, palette.surface.rgb) &&
		Math.abs(recomputed.support - treatment.stateSupport) <= epsilon &&
		Math.abs(recomputed.support - certificate.selected.objectives[1]) <= epsilon &&
		Math.abs(recomputed.endpointDistance - treatment.endpointDistance) <= epsilon &&
		isDeepStrictEqual(recomputed.relation, treatment.fieldRelation) &&
		(treatment.state === "collapsed" ? recomputed.relation === null : compact?.recompositionPass === true)
	return {
		available: true,
		valid,
		state,
		treatmentNodeIds: { background: background.id, surface: surface.id },
		compact,
	}
}

function signedApca(palette: Palette): Record<string, number> {
	return {
		foregroundOnBackground: apcaContrast(palette.foreground.rgb, palette.background.rgb),
		foregroundOnSurface: apcaContrast(palette.foreground.rgb, palette.surface.rgb),
		accentOnBackground: apcaContrast(palette.accent.rgb, palette.background.rgb),
		accentOnSurface: apcaContrast(palette.accent.rgb, palette.surface.rgb),
	}
}

function reconstruction(
	canonical: Palette,
	selected: Palette,
	analysis: ReturnType<typeof extractNextPaletteJointParetoWithContext>["evidence"]["perception"]["analysis"],
): WorkerResult["diagnostics"]["reconstruction"] {
	const canonicalLabs = roleNames.map((role) => rgbToOKLab(canonical[role].rgb))
	const selectedLabs = roleNames.map((role) => rgbToOKLab(selected[role].rgb))
	const pixelCount = analysis.width * analysis.height
	const stride = Math.max(1, Math.floor(pixelCount / 12_000))
	let canonicalError = 0
	let selectedError = 0
	let samples = 0
	for (let pixel = 0; pixel < pixelCount; pixel += stride) {
		const lab = labAt(analysis.labs, pixel)
		canonicalError += Math.min(...canonicalLabs.map((role) => okDistance(lab, role)))
		selectedError += Math.min(...selectedLabs.map((role) => okDistance(lab, role)))
		samples++
	}
	const canonicalMean = samples === 0 ? 0 : canonicalError / samples
	const selectedMean = samples === 0 ? 0 : selectedError / samples
	return {
		policy: "common-pixel-domain-floor-n-over-12000-stride",
		stride,
		samples,
		canonical: canonicalMean,
		selected: selectedMean,
		delta: selectedMean - canonicalMean,
	}
}

function factorRoute(bits: FactorBits): string {
	return `S${Number(bits.S)}M${Number(bits.M)}O${Number(bits.O)}T${Number(bits.T)}`
}

async function evaluate(task: Task): Promise<WorkerResult> {
	if (!/^(?:images|00)\/[^/\\]+$/.test(task.path)) throw new Error(`Unauthorized factorial-audit source: ${task.path}`)
	const bytes = await readFile(join(projectRoot, task.path))
	if (bytes.byteLength !== task.bytes || sha256(bytes) !== task.sha256) throw new Error(`Source binding changed: ${task.path}`)
	const image = await loadImage(bytes)
	const started = performance.now()
	const result = extractNextPaletteJointParetoWithContext(image)
	const elapsedMs = performance.now() - started
	const canonical = task.canonical.methods.spatial
	const selected = result.palette
	const certificate = result.certificate
	const reproduction = {
		palette: isDeepStrictEqual(selected, task.frozenResult.palette),
		certificate: isDeepStrictEqual(certificate, task.frozenCertificate),
		canonicalExtraction: isDeepStrictEqual(normalizedExtraction(result.canonicalExtraction), normalizedExtraction(task.canonical)),
	}
	const canonicalField = canonicalRelation(canonical, certificate, result.evidence.graph, result.evidence.perception.analysis)
	const selectedField = selectedRelation(selected, certificate, result.evidence.graph, result.evidence.perception.analysis)
	const statePreserved = canonicalField.state === selectedField.state
	let disposition: WorkerResult["comparison"]["disposition"]
	if (canonicalField.collapsedUncomparable) disposition = "uncomparable-canonical-collapsed"
	else if (!statePreserved) disposition = "uncomparable-state-not-preserved"
	else if (canonicalField.materiallyAmbiguous) disposition = "uncomparable-canonical-alias-ambiguity"
	else if (!canonicalField.resolved || !selectedField.available || !selectedField.valid ||
		!canonicalField.compact || !selectedField.compact) disposition = "uncomparable-relation-unavailable"
	else disposition = "comparable"
	const compactDeltas = disposition === "comparable"
		? selectedField.compact!.vector.map((value, index) => value - canonicalField.compact!.vector[index]) as
			unknown as readonly [number, number, number, number]
		: null
	const weakDominance = compactDeltas?.every((delta) => delta >= -epsilon) ?? false
	const strictImprovement = compactDeltas?.some((delta) => delta > epsilon) ?? false
	const sourceExact = !certificate.selected.changed || roleNames.every((role) => {
		const provenance = certificate.selected.roles[role]
		if (!("representativePixelIndex" in provenance) || provenance.representativePixelIndex < 0) return false
		const offset = provenance.representativePixelIndex * 3
		return sameRgb(provenance.rgb, selected[role].rgb) && !selected[role].generated &&
			provenance.rgb[0] === image.data[offset] && provenance.rgb[1] === image.data[offset + 1] &&
			provenance.rgb[2] === image.data[offset + 2]
	})
	const strictSixVectorDominance = certificate.selected.objectives.every((value, index) =>
		value + epsilon >= certificate.incumbent.objectives[index]) && certificate.selected.objectives.some((value, index) =>
		value > certificate.incumbent.objectives[index] + epsilon)
	const fieldBlockChanged = !sameRole(selected.background, canonical.background) ||
		!sameRole(selected.surface, canonical.surface) || selectedField.state !== canonicalField.state
	const violations: string[] = []
	if (!reproduction.palette) violations.push("frozen-palette-reproduction")
	if (!reproduction.certificate) violations.push("frozen-certificate-reproduction")
	if (!reproduction.canonicalExtraction) violations.push("canonical-extraction-reproduction")
	if (task.frozenResult.file !== task.path || task.frozenResult.cohort !== task.cohort ||
		task.frozenResult.source.sha256 !== task.sha256 || task.frozenResult.source.bytes !== task.bytes) {
		violations.push("frozen-result-source-binding")
	}
	if (task.frozenResult.structural.violations.length > 0) violations.push("frozen-result-structural")
	if (canonicalField.state !== certificate.incumbent.fieldState || !canonicalField.maximumSupportReproduced) {
		violations.push("canonical-relation-support")
	}
	if (canonicalField.compact && !canonicalField.compact.recompositionPass) violations.push("canonical-relation-recomposition")
	if (certificate.selected.changed && (!selectedField.available || !selectedField.valid)) {
		violations.push("selected-relation-invariants")
	}
	if (!sourceExact) violations.push("selected-source-exactness")
	if (certificate.policy.fixedApcaAdmissionFloor !== null) violations.push("fixed-apca-floor")
	const structurallyClean = violations.length === 0
	const checks = {
		selectedChanged: certificate.selected.changed,
		selectedAdmitted: certificate.selected.admitted,
		strictSixVectorDominance,
		oneChangedSemanticBlock: certificate.selected.changedSemanticBlocks === 1,
		fieldBlockChanged,
		selectedNoncollapsed: selectedField.state !== "collapsed",
		foregroundExactlyCanonical: sameRole(selected.foreground, canonical.foreground),
		accentExactlyCanonical: sameRole(selected.accent, canonical.accent),
		selectedSummaryEqualsCanonicalOverlayAblation: isDeepStrictEqual(
			selectedSummary(certificate), certificate.ablations["canonical-overlay-block"],
		),
		sourceExact,
		structurallyClean,
	}
	const basePass = Object.values(checks).every(Boolean)
	const applicable = disposition === "comparable"
	const bits: FactorBits = {
		S: statePreserved,
		M: applicable && compactDeltas![0] >= -epsilon,
		O: applicable && compactDeltas![1] >= -epsilon && compactDeltas![2] >= -epsilon,
		T: applicable && compactDeltas![3] >= -epsilon,
	}
	const nestedArms = {
		S: bits.S,
		SM: bits.S && bits.M,
		SMO: bits.S && bits.M && bits.O,
		SMOT: bits.S && bits.M && bits.O && bits.T && strictImprovement,
	}
	const prospectiveFrontier = basePass && disposition === "comparable" &&
		!canonicalField.materiallyAmbiguous && weakDominance && strictImprovement
	return {
		cohort: task.cohort,
		file: task.path,
		source: { sha256: task.sha256, bytes: task.bytes },
		canonical,
		selected,
		reproduction,
		canonicalRelation: canonicalField,
		selectedRelation: selectedField,
		comparison: { disposition, compactDeltas, weakDominance, strictImprovement },
		baseEligibility: { checks, pass: basePass },
		factors: { bits, applicable: { M: applicable, O: applicable, T: applicable }, route: factorRoute(bits) },
		nestedArms,
		prospectiveFrontier,
		diagnostics: {
			reconstruction: reconstruction(canonical, selected, result.evidence.perception.analysis),
			signedApcaLc: { canonical: signedApca(canonical), selected: signedApca(selected) },
		},
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
	let completed = 0
	const workers = partitions.map((partition) => new Promise<WorkerResult[]>((resolveWorker, rejectWorker) => {
		const worker = new Worker(new URL(import.meta.url), { workerData: partition })
		worker.on("message", (message: { progress: number } | { results: WorkerResult[] }) => {
			if ("results" in message) resolveWorker(message.results)
			else {
				completed += message.progress
				if (completed % 10 === 0 || completed === tasks.length) {
					process.stderr.write(`joint field relation factorial audit: ${completed}/${tasks.length}\r`)
				}
			}
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`Factorial-audit worker exited with code ${code}`))
		})
	}))
	const results = (await Promise.all(workers)).flat().sort((first, second) =>
		first.cohort.localeCompare(second.cohort) || first.file.localeCompare(second.file))
	process.stderr.write(`joint field relation factorial audit: ${results.length}/${tasks.length}\n`)
	return results
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputRoot)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite factorial audit: ${outputRoot}`)
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

function canonicalMap(development: CorpusResult, canonical00: CorpusResult): Map<string, ExtractionResult> {
	return new Map([
		...development.entries.map((entry) => [`images/${entry.file}`, entry.extraction] as const),
		...canonical00.entries.map((entry) => [entry.file, entry.extraction] as const),
	])
}

function emptyRouteCounts(): Record<string, number> {
	return Object.fromEntries(Array.from({ length: 16 }, (_, value) => {
		const bits: FactorBits = {
			S: Boolean(value & 8),
			M: Boolean(value & 4),
			O: Boolean(value & 2),
			T: Boolean(value & 1),
		}
		return [factorRoute(bits), 0]
	}))
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) {
		throw new Error("audit-next-palette-joint-field-relation-factorial-development.ts does not accept arguments")
	}
	await assertOutputAbsent()
	const inputEntries = await Promise.all(Object.entries(inputFiles).map(async ([name, path]) => {
		const raw = await readFile(join(projectRoot, path))
		return [name, { path, raw, sha256: sha256(raw) }] as const
	}))
	const inputs = Object.fromEntries(inputEntries) as Record<keyof typeof inputFiles, { path: string; raw: Buffer; sha256: string }>
	const parse = <T>(name: keyof typeof inputFiles): T => JSON.parse(inputs[name].raw.toString("utf8")) as T
	const evidenceManifest = parse<{ experimentId: string; sources: Source[] }>("evidenceManifest")
	const evidenceAnalysis = parse<{
		experimentId: string
		structural: { pass: boolean; violationCount: number }
		coverage: { total: number; development: number; cohort00: number }
		stoppingRules: { pass: boolean }
	}>("evidenceAnalysis")
	const paretoManifest = parse<{ experimentId: string; sources: Source[] }>("jointParetoManifest")
	const frozenResults = parse<{ experimentId: string; entries: FrozenResult[] }>("jointParetoResults")
	const frozenCertificates = parse<{
		experimentId: string
		entries: Record<string, NextPaletteJointParetoCertificate>
	}>("jointParetoCertificates")
	const development = parse<CorpusResult>("canonicalDevelopment")
	const canonical00 = parse<CorpusResult>("canonical00")
	if (evidenceManifest.experimentId !== EVIDENCE_EXPERIMENT_ID || evidenceAnalysis.experimentId !== EVIDENCE_EXPERIMENT_ID ||
		!evidenceAnalysis.structural.pass || evidenceAnalysis.structural.violationCount !== 0 ||
		!evidenceAnalysis.stoppingRules.pass || !isDeepStrictEqual(evidenceAnalysis.coverage,
			{ total: 392, development: 37, cohort00: 355 }) || evidenceManifest.sources.length !== 392 ||
		paretoManifest.experimentId !== JOINT_PARETO_EXPERIMENT_ID || frozenResults.experimentId !== JOINT_PARETO_EXPERIMENT_ID ||
		frozenCertificates.experimentId !== JOINT_PARETO_EXPERIMENT_ID || paretoManifest.sources.length !== 392 ||
		development.algorithmVersion !== ALGORITHM_VERSION || canonical00.algorithmVersion !== ALGORITHM_VERSION) {
		throw new Error("Factorial-audit input bindings disagree")
	}
	if (!isDeepStrictEqual(evidenceManifest.sources, paretoManifest.sources)) {
		throw new Error("Evidence and frozen joint source manifests disagree")
	}
	const canonicalByFile = canonicalMap(development, canonical00)
	const frozenByFile = new Map(frozenResults.entries.map((entry) => [entry.file, entry]))
	const tasks = evidenceManifest.sources.map((source): Task => {
		const canonical = canonicalByFile.get(source.path)
		const frozenResult = frozenByFile.get(source.path)
		const frozenCertificate = frozenCertificates.entries[source.path]
		if (!canonical || !frozenResult || !frozenCertificate) throw new Error(`Incomplete factorial-audit task: ${source.path}`)
		return { ...source, canonical, frozenResult, frozenCertificate }
	})
	if (new Set(tasks.map((task) => task.path)).size !== 392 || frozenResults.entries.length !== 392 ||
		Object.keys(frozenCertificates.entries).length !== 392) throw new Error("Factorial-audit matrix is incomplete")
	const results = await runParallel(tasks)
	const violations = results.filter((result) => result.structural.violations.length > 0)
	const prospective = results.filter((result) => result.prospectiveFrontier)
	const protocol = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		auditType: "append-only-read-only-frozen-winner-full-392-factorial-audit",
		candidateAlgorithmVersion: NEXT_PALETTE_JOINT_PARETO_ALGORITHM_VERSION,
		baselineAlgorithmVersion: ALGORITHM_VERSION,
		authorization: {
			developmentOnly: true,
			allowedSourceRoots: ["images", "00"],
			outputUnseenRootsOpened: [] as string[],
			changesPaletteOutput: false,
			extractionChangeAuthorized: false,
			candidateFreezeAuthorized: false,
			canonicalPromotionAuthorized: false,
			reserveAccessAuthorized: false,
			broaderReviewAuthorized: false,
			humanReviewPrepared: false,
			laterFreshBlindedReviewAuthorizedByAudit: false,
			exactJudgmentTransferAllowed: false,
		},
		prospectiveReviewEligibility: {
			conditionalOnly: true,
			completeFrontierMinimum: 1,
			completeFrontierMaximum: 40,
			everyEntryStructurallyClean: true,
			everyEntryExactlyOneChangedSemanticBlock: true,
			exactJudgmentTransfersAllowed: false,
			mayAuthorizeLaterFreshBlindedReviewOnlyIfAllStoppingRulesPass: true,
		},
		stoppingRules: {
			totalSourcesMustEqual: 392,
			developmentSourcesMustEqual: 37,
			cohort00SourcesMustEqual: 355,
			structuralViolationsMustEqual: 0,
			exactFrozenPaletteCertificateAndCanonicalReproduction: true,
			canonicalAndSelectedRelationRecomposition: true,
			rawSourceBindingRequired: true,
			prospectiveFrontierMustEqualDeclaredDefinition: true,
			materiallyAmbiguousCanonicalAliasMaximizersExcluded: true,
			noFixedApcaAdmissionFloor: true,
		},
		diagnosticsOnly: {
			reconstruction: "common pixel domain with max(1, floor(pixelCount / 12000)) stride",
			signedApcaConsumerRelations: 4,
			usedAsGate: false,
		},
	}
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (path) =>
		[path, sha256(await readFile(join(projectRoot, path)))] as const)))
	const identity = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		auditCandidateVersion: NEXT_PALETTE_JOINT_PARETO_ALGORITHM_VERSION,
		policy: { comparisonEpsilon: epsilon, fixedApcaAdmissionFloor: null, factorOrder: ["S", "M", "O", "T"] },
		protocol,
		inputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) =>
			[name, { path: input.path, sha256: input.sha256 }])),
		sources: evidenceManifest.sources,
		implementation,
	}
	const experimentId = sha256(JSON.stringify(canonicalValue(identity)))
	const generatedAt = new Date().toISOString()
	const resultArtifact = {
		schemaVersion: 1,
		experimentId,
		auditCandidateVersion: NEXT_PALETTE_JOINT_PARETO_ALGORITHM_VERSION,
		entries: results.map(({ elapsedMs: _elapsedMs, ...result }) => result),
	}
	const frontierEntries = prospective.map((result) => ({
		file: result.file,
		cohort: result.cohort,
		source: { path: result.file, ...result.source },
		baseline: result.canonical,
		candidate: result.selected,
		canonicalCompact: result.canonicalRelation.compact!.vector,
		selectedCompact: result.selectedRelation.compact!.vector,
		compactDeltas: result.comparison.compactDeltas,
		factorBits: result.factors.bits,
		changedSemanticBlocks: 1,
		structurallyClean: true,
	}))
	const frontier = {
		schemaVersion: 1,
		experimentId,
		definition: "base eligibility plus resolved same-state noncollapsed canonical/selected relation plus compact weak dominance and at least one strict compact improvement",
		entries: frontierEntries,
	}
	const expectedFrontierFiles = results.filter((result) => result.baseEligibility.pass &&
		result.comparison.disposition === "comparable" && !result.canonicalRelation.materiallyAmbiguous &&
		result.comparison.weakDominance && result.comparison.strictImprovement).map((result) => result.file)
	const frontierEquality = isDeepStrictEqual(frontierEntries.map((entry) => entry.file), expectedFrontierFiles)
	const routeCounts = emptyRouteCounts()
	for (const result of results) routeCounts[result.factors.route]++
	const factorTrue = (factor: keyof FactorBits) => results.filter((result) => result.factors.bits[factor]).length
	const applicable = (factor: "M" | "O" | "T") => results.filter((result) => result.factors.applicable[factor]).length
	const nested = (arm: keyof WorkerResult["nestedArms"]) => results.filter((result) => result.nestedArms[arm]).length
	const structural = {
		pass: results.length === 392 && results.filter((result) => result.cohort === "development").length === 37 &&
			results.filter((result) => result.cohort === "00").length === 355 && violations.length === 0 &&
			results.every((result) => Object.values(result.reproduction).every(Boolean)) &&
			results.every((result) => result.canonicalRelation.maximumSupportReproduced &&
				(!result.canonicalRelation.compact || result.canonicalRelation.compact.recompositionPass) &&
				(!result.selectedRelation.available || result.selectedRelation.valid)) && frontierEquality,
		violationCount: violations.reduce((sum, result) => sum + result.structural.violations.length, 0),
		caseCount: violations.length,
		entries: violations.map((result) => ({ file: result.file, violations: result.structural.violations })),
		checks: {
			completeMatrix: results.length === 392,
			cohorts: results.filter((result) => result.cohort === "development").length === 37 &&
				results.filter((result) => result.cohort === "00").length === 355,
			exactFrozenReproduction: results.every((result) => Object.values(result.reproduction).every(Boolean)),
			relationRecomposition: results.every((result) => result.canonicalRelation.maximumSupportReproduced &&
				(!result.canonicalRelation.compact || result.canonicalRelation.compact.recompositionPass) &&
				(!result.selectedRelation.available || result.selectedRelation.valid)),
			sourceBinding: results.every((result) => result.structural.violations.every((violation) =>
				!violation.includes("source")) && /^(?:images|00)\//.test(result.file)),
			frontierEquality,
		},
	}
	const frontierWithinSize = prospective.length >= 1 && prospective.length <= 40
	const everyFrontierEntryCleanAndOneBlock = prospective.every((result) =>
		result.structural.violations.length === 0 && result.baseEligibility.checks.oneChangedSemanticBlock)
	const eligibleForLaterFreshBlindedReview = structural.pass && frontierWithinSize && everyFrontierEntryCleanAndOneBlock
	const analysis = {
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		experimentId,
		generatedAt,
		structural,
		matrix: {
			total: results.length,
			development: results.filter((result) => result.cohort === "development").length,
			cohort00: results.filter((result) => result.cohort === "00").length,
			baseEligible: results.filter((result) => result.baseEligibility.pass).length,
			comparable: results.filter((result) => result.comparison.disposition === "comparable").length,
			canonicalCollapsedUncomparable: results.filter((result) =>
				result.comparison.disposition === "uncomparable-canonical-collapsed").length,
			canonicalAliasAmbiguousUncomparable: results.filter((result) =>
				result.comparison.disposition === "uncomparable-canonical-alias-ambiguity").length,
			prospectiveFrontier: prospective.length,
		},
		factorial: {
			factorCounts: {
				S: { true: factorTrue("S"), false: results.length - factorTrue("S"), applicable: results.length },
				M: { true: factorTrue("M"), false: applicable("M") - factorTrue("M"), uncomparable: results.length - applicable("M") },
				O: { true: factorTrue("O"), false: applicable("O") - factorTrue("O"), uncomparable: results.length - applicable("O") },
				T: { true: factorTrue("T"), false: applicable("T") - factorTrue("T"), uncomparable: results.length - applicable("T") },
			},
			routeCounts,
			nestedArmCounts: { S: nested("S"), SM: nested("SM"), SMO: nested("SMO"), SMOT: nested("SMOT") },
			strictCompactImprovement: results.filter((result) => result.comparison.strictImprovement).length,
		},
		prospectiveReview: {
			frontierSize: prospective.length,
			frontierWithinPredeclaredSize: frontierWithinSize,
			everyEntryCleanAndOneBlock: everyFrontierEntryCleanAndOneBlock,
			exactJudgmentTransfers: 0,
			eligibleForLaterFreshBlindedReview,
			authorizedByThisAudit: false,
		},
		performance: {
			meanMs: results.reduce((sum, result) => sum + result.elapsedMs, 0) / results.length,
			maximumMs: Math.max(...results.map((result) => result.elapsedMs)),
			totalWorkerMs: results.reduce((sum, result) => sum + result.elapsedMs, 0),
		},
		disposition: !structural.pass ? "factorial-audit-structural-failure" : prospective.length === 0
			? "structural-pass-empty-prospective-frontier-no-review"
			: prospective.length > 40 ? "structural-pass-prospective-frontier-too-large-no-review"
				: "structural-pass-prospective-frontier-eligible-for-later-fresh-blinded-review",
	}
	await mkdir(outputRoot)
	await Promise.all([
		writeExclusive(join(outputRoot, "protocol.json"), protocol),
		writeExclusive(join(outputRoot, "manifest.json"), { ...identity, experimentId, generatedAt }),
		writeExclusive(join(outputRoot, "results.json"), resultArtifact),
		writeExclusive(join(outputRoot, "analysis.json"), analysis),
		writeExclusive(join(outputRoot, "frontier.json"), frontier),
	])
	process.stderr.write(`Wrote joint field relation factorial audit ${experimentId} to ${outputRoot}\n`)
}

if (!isMainThread) {
	runWorker(workerData as Task[]).then((results) => parentPort!.postMessage({ results }), (error: unknown) => { throw error })
} else {
	await main()
}
