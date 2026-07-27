import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { apcaContrast, contrastRatio, okDistance, rgbToHex, roleMinimumDistance } from "./color.ts"
import { clampRelationEvidence, harmonicConjunction, type FieldRelationEvidence } from "./field-relation.ts"
import {
	evaluateJointPaletteOverlayContrast,
	jointPaletteFieldStateEvidence,
	type JointPaletteEvidence,
	type JointPaletteFieldState,
	type JointPaletteFieldTreatment,
	type JointPaletteOverlayAlternative,
} from "./joint-palette-evidence.ts"
import {
	extractNextPaletteJointParetoWithContext,
	type NextPaletteJointObjectiveVector,
} from "./next-palette-joint-pareto.ts"
import type { PaletteRelationNode } from "./palette-relation-graph.ts"
import type { GradientEvidence, Palette, PaletteMetrics, RawImage, RGB, RoleColor, RoleName } from "./types.ts"

export const JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_VERSION =
	"joint-palette-compact-relation-dominance-0.1.0-development"

export const JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_POLICY = Object.freeze({
	version: "joint-palette-compact-relation-dominance-policy-0.1.0-development",
	incumbentAlgorithmVersion: "region-graph-0.19.0",
	developmentDiagnosticOnly: true,
	allowedSourceRoots: ["images", "00"] as const,
	requiredChangedSemanticBlocks: 1,
	requiredChangedBlock: "field" as const,
	canonicalOverlayBlockFrozen: true,
	requiredSameNoncollapsedFieldState: true,
	maximumDistinctRoleColors: 4,
	generatedChallengersAllowed: false,
	fixedApcaAdmissionFloor: null,
	comparisonEpsilon: 1e-12,
	selection:
		"minimum-semantic-blocks-then-within-class-six-objective-pareto-then-atoms-then-semantic-key-then-stable-key",
})

export type CompactRelationVector = readonly [
	endpointMass: number,
	backgroundSupport: number,
	surfaceSupport: number,
	stateTopology: number,
]

export type CompactRelationEvidence = {
	vector: CompactRelationVector
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

export type CompactRelationDominanceCandidate = {
	stableKey: string
	semanticKey: string
	fieldChanged: boolean
	overlayChanged: boolean
	changedSemanticBlocks: number
	changedSemanticAtoms: number
	objectives: NextPaletteJointObjectiveVector
	compactVector: CompactRelationVector
}

export type CompactRelationDominanceSelection<T extends CompactRelationDominanceCandidate> = {
	admitted: T[]
	withinClassFrontier: T[]
	selected: T | null
}

type SourceRoleProvenance = {
	stableKey: string
	rgb: RGB
	representativePixelIndex: number
	supportMaskSha256: string
	kind: "field-candidate" | JointPaletteOverlayAlternative["provenance"]["kind"]
}

export type CompactRelationDominanceSummary = {
	changed: boolean
	admitted: boolean
	stableKey: string
	fieldState: JointPaletteFieldState
	changedSemanticBlocks: number
	changedSemanticAtoms: number
	objectives: NextPaletteJointObjectiveVector
	objectiveDeltas: NextPaletteJointObjectiveVector
}

export type CompactRelationDominanceFrontierEntry = CompactRelationDominanceSummary & {
	semanticKey: string
	changedBlocks: { field: boolean; foreground: boolean; accent: boolean }
	roles: Record<RoleName, RGB>
	compactVector: CompactRelationVector
	compactDeltas: CompactRelationVector
}

type Route =
	| "compact-relation-dominator"
	| "preserve-canonical-no-dominator"
	| "preserve-canonical-incumbent-evidence-unavailable"
	| "preserve-canonical-collapsed"
	| "preserve-canonical-field-evidence-unavailable"
	| "preserve-canonical-relation-support-mismatch"
	| "preserve-canonical-relation-ambiguity"
	| "preserve-canonical-overlay-evidence-unavailable"

export type JointPaletteCompactRelationDominanceCertificate = {
	schemaVersion: 1
	version: typeof JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_VERSION
	policy: typeof JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_POLICY
	route: Route
	canonical: {
		evidenceAvailable: boolean
		unavailableReasons: readonly string[]
		fieldState: JointPaletteFieldState
		objectives: NextPaletteJointObjectiveVector
		stableKey: string
		relation: {
			backgroundAliasCount: number
			surfaceAliasCount: number
			evaluatedPairCount: number
			maximumSupport: number
			incumbentObjectiveStateSupport: number
			maximumSupportReproduced: boolean
			maximizingPairCount: number
			materiallyAmbiguous: boolean
			resolved: boolean
			provenance: { background: SourceRoleProvenance; surface: SourceRoleProvenance } | null
			compact: CompactRelationEvidence | null
		}
		overlayAliases: { foreground: number; accent: number }
		sourceExactRoles: Record<RoleName, SourceRoleProvenance> | null
	}
	counts: {
		graphNodes: number
		fieldNodes: number
		fieldTreatments: number
		overlayAlternatives: number
		sameStateNoncollapsedTreatments: number
		validRecomposedTreatments: number
		compactDominatingTreatments: number
		logicalConstrainedCompleteTuples: number
		attemptedCompleteTuples: number
		admittedCompleteTuples: number
		completeTupleFrontier: number
		withinClassFrontier: number
		admittedByChangedAtoms: Record<string, number>
	}
	domain: { admittedSha256: string }
	selected: CompactRelationDominanceSummary & {
		roles: Record<RoleName, SourceRoleProvenance> | null
		fieldTreatment: JointPaletteFieldTreatment | null
		compact: CompactRelationEvidence | null
		compactDeltas: CompactRelationVector | null
		relationDominanceWitness: {
			canonicalStableKey: string
			selectedStableKey: string
			canonicalVector: CompactRelationVector
			selectedVector: CompactRelationVector
			deltas: CompactRelationVector
			componentwiseWeakDominance: readonly [boolean, boolean, boolean, boolean]
			strictlyImprovedComponents: readonly ("endpoint.mass" | "field.backgroundSupport" |
				"field.surfaceSupport" | "stateTopology")[]
		} | null
		apcaLc: {
			foregroundOnBackground: number
			foregroundOnSurface: number
			accentOnBackground: number
			accentOnSurface: number
		}
	}
	admittedTupleFrontier: readonly CompactRelationDominanceFrontierEntry[]
	completeTupleFrontier: readonly CompactRelationDominanceFrontierEntry[]
	withinClassFrontier: readonly CompactRelationDominanceFrontierEntry[]
	ablations: Record<"canonical-background" | "canonical-surface", CompactRelationDominanceSummary>
	invariants: {
		diagnosticOnly: true
		canonicalExtractionCalledOnce: true
		freshConstrainedSelection: true
		frozenBroadWinnerNotPostprocessed: true
		exactlyOneChangedFieldBlock: true
		canonicalOverlaySemanticsPreserved: true
		sameNoncollapsedState: true
		canonicalAliasResolutionComplete: true
		canonicalRelationSupportReproduced: true
		canonicalCompactAliasUnambiguous: true
		compactRelationStrictDominance: true
		sixObjectiveStrictDominance: true
		sourceExactRoles: true
		maximumFourColors: true
		finiteSignedApca: true
		fixedApcaFloorAbsent: true
		noPostselectionMutation: true
		unchangedIsExactCanonical: true
	}
}

export type JointPaletteCompactRelationDominanceResult = {
	canonical: Palette
	candidate: Palette
	certificate: JointPaletteCompactRelationDominanceCertificate
}

type CanonicalPair = {
	background: PaletteRelationNode
	surface: PaletteRelationNode
	treatment: JointPaletteFieldTreatment
	compact: CompactRelationEvidence
}

type CanonicalResolution = {
	state: JointPaletteFieldState
	backgroundAliasCount: number
	surfaceAliasCount: number
	evaluatedPairCount: number
	maximumSupport: number
	maximumSupportReproduced: boolean
	maximizingPairCount: number
	materiallyAmbiguous: boolean
	resolved: CanonicalPair | null
}

type Selection = CompactRelationDominanceCandidate & {
	background: PaletteRelationNode
	foreground: JointPaletteOverlayAlternative
	surface: PaletteRelationNode
	accent: JointPaletteOverlayAlternative
	fieldTreatment: JointPaletteFieldTreatment
	fieldState: JointPaletteFieldState
	compact: CompactRelationEvidence
	apcaLc: JointPaletteCompactRelationDominanceCertificate["selected"]["apcaLc"]
}

type SelectionRun = {
	selection: Selection | null
	admitted: Selection[]
	completeFrontier: Selection[]
	withinClassFrontier: Selection[]
	counts: Pick<JointPaletteCompactRelationDominanceCertificate["counts"],
		"sameStateNoncollapsedTreatments" | "validRecomposedTreatments" | "compactDominatingTreatments" |
		"logicalConstrainedCompleteTuples" | "attemptedCompleteTuples" | "admittedCompleteTuples" |
		"completeTupleFrontier" | "withinClassFrontier" | "admittedByChangedAtoms">
}

type Constraints = { canonicalBackground?: true; canonicalSurface?: true }

const epsilon = JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_POLICY.comparisonEpsilon
const compactNames = ["endpoint.mass", "field.backgroundSupport", "field.surfaceSupport", "stateTopology"] as const

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function rgbKey(rgb: RGB): string {
	return `${rgb[0]},${rgb[1]},${rgb[2]}`
}

function sameRgb(first: RGB, second: RGB): boolean {
	return rgbKey(first) === rgbKey(second)
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value
	for (const child of Object.values(value)) deepFreeze(child)
	return Object.freeze(value)
}

function dominates(first: readonly number[], second: readonly number[]): boolean {
	return first.every((value, index) => value + epsilon >= second[index]) &&
		first.some((value, index) => value > second[index] + epsilon)
}

function vectorEqual(first: readonly number[], second: readonly number[]): boolean {
	return first.length === second.length && first.every((value, index) => Math.abs(value - second[index]) <= epsilon)
}

function fieldState(palette: Palette): JointPaletteFieldState {
	return sameRgb(palette.background.rgb, palette.surface.rgb)
		? "collapsed"
		: palette.gradient.isGradient ? "gradient" : "distinct-flat"
}

function objectiveDeltas(
	objectives: NextPaletteJointObjectiveVector,
	incumbent: NextPaletteJointObjectiveVector,
): NextPaletteJointObjectiveVector {
	return objectives.map((value, index) => value - incumbent[index]) as unknown as NextPaletteJointObjectiveVector
}

function compactDeltas(vector: CompactRelationVector, incumbent: CompactRelationVector): CompactRelationVector {
	return vector.map((value, index) => value - incumbent[index]) as unknown as CompactRelationVector
}

function semanticKey(background: RGB, foreground: RGB, surface: RGB, accent: RGB, state: JointPaletteFieldState): string {
	return [rgbKey(background), rgbKey(foreground), rgbKey(surface), rgbKey(accent), state].join("|")
}

export function selectCompactRelationDominance<T extends CompactRelationDominanceCandidate>(
	candidates: readonly T[],
	incumbentObjectives: NextPaletteJointObjectiveVector,
	canonicalCompact: CompactRelationVector,
): CompactRelationDominanceSelection<T> {
	const admitted = candidates.filter((candidate) => candidate.fieldChanged && !candidate.overlayChanged &&
		candidate.changedSemanticBlocks === 1 && dominates(candidate.objectives, incumbentObjectives) &&
		dominates(candidate.compactVector, canonicalCompact))
		.sort((first, second) => compareAscii(first.stableKey, second.stableKey))
	const minimumBlocks = admitted.length === 0 ? Infinity : Math.min(...admitted.map((entry) => entry.changedSemanticBlocks))
	const minimumClass = admitted.filter((entry) => entry.changedSemanticBlocks === minimumBlocks)
	const withinClassFrontier = minimumClass.filter((candidate) => !minimumClass.some((other) =>
		other !== candidate && dominates(other.objectives, candidate.objectives)))
		.sort((first, second) => first.changedSemanticAtoms - second.changedSemanticAtoms ||
			compareAscii(first.semanticKey, second.semanticKey) || compareAscii(first.stableKey, second.stableKey))
	return { admitted, withinClassFrontier, selected: withinClassFrontier[0] ?? null }
}

function compactRelation(state: JointPaletteFieldState, relation: FieldRelationEvidence | null): CompactRelationEvidence | null {
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
	const reportedStateSupport = state === "gradient" ? relation.stateSupport.gradient : relation.stateSupport.distinctFlat
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

function relationTreatment(
	background: PaletteRelationNode,
	surface: PaletteRelationNode,
	state: JointPaletteFieldState,
	evidence: ReturnType<typeof jointPaletteFieldStateEvidence>,
	prefix: string,
): JointPaletteFieldTreatment {
	return {
		stableKey: `${prefix}:${background.stableKey}|${surface.stableKey}|${state}`,
		backgroundNodeId: background.id,
		surfaceNodeId: surface.id,
		state,
		stateSupport: evidence.support,
		endpointDistance: evidence.endpointDistance,
		fieldRelation: evidence.relation,
	}
}

function resolveCanonical(
	canonical: Palette,
	evidence: JointPaletteEvidence,
	incumbentStateSupport: number,
): CanonicalResolution {
	const state = fieldState(canonical)
	const nodes = evidence.graph.nodes.filter((node) => !node.typographyOnly)
	const backgrounds = canonical.background.generated ? [] : nodes.filter((node) => sameRgb(node.rgb, canonical.background.rgb))
	const surfaces = canonical.surface.generated ? [] : nodes.filter((node) => sameRgb(node.rgb, canonical.surface.rgb))
	const pairs = backgrounds.flatMap((background) => surfaces.flatMap((surface): CanonicalPair[] => {
		const stateEvidence = jointPaletteFieldStateEvidence(evidence.graph, evidence.perception.analysis, background, surface, state)
		const compact = compactRelation(state, stateEvidence.relation)
		return compact ? [{
			background,
			surface,
			treatment: relationTreatment(background, surface, state, stateEvidence, "canonical-relation"),
			compact,
		}] : []
	})).sort((first, second) => compareAscii(first.background.stableKey, second.background.stableKey) ||
		compareAscii(first.surface.stableKey, second.surface.stableKey))
	const evaluatedSupports = backgrounds.flatMap((background) => surfaces.map((surface) =>
		jointPaletteFieldStateEvidence(evidence.graph, evidence.perception.analysis, background, surface, state).support))
	const maximumSupport = evaluatedSupports.length === 0 ? 0 : Math.max(...evaluatedSupports)
	const maximizing = pairs.filter((pair) => Math.abs(pair.treatment.stateSupport - maximumSupport) <= epsilon)
	const materiallyAmbiguous = maximizing.length > 1 && maximizing.some((pair) =>
		!vectorEqual(pair.compact.vector, maximizing[0].compact.vector))
	const maximumSupportReproduced = Math.abs(maximumSupport - incumbentStateSupport) <= epsilon
	return {
		state,
		backgroundAliasCount: backgrounds.length,
		surfaceAliasCount: surfaces.length,
		evaluatedPairCount: evaluatedSupports.length,
		maximumSupport,
		maximumSupportReproduced,
		maximizingPairCount: maximizing.length,
		materiallyAmbiguous,
		resolved: state !== "collapsed" && maximumSupportReproduced && !materiallyAmbiguous && maximizing[0]?.compact.recompositionPass
			? maximizing[0]
			: null,
	}
}

function nodeProvenance(node: PaletteRelationNode): SourceRoleProvenance {
	return {
		stableKey: node.stableKey,
		rgb: node.rgb,
		representativePixelIndex: node.representativePixelIndex,
		supportMaskSha256: createHash("sha256").update(node.mask).digest("hex"),
		kind: "field-candidate",
	}
}

function overlayProvenance(overlay: JointPaletteOverlayAlternative): SourceRoleProvenance {
	return {
		stableKey: overlay.stableKey,
		rgb: overlay.rgb,
		representativePixelIndex: overlay.provenance.representativePixelIndex,
		supportMaskSha256: overlay.provenance.supportMaskSha256,
		kind: overlay.provenance.kind,
	}
}

function overlayAliases(
	canonical: Palette,
	evidence: JointPaletteEvidence,
	incumbent: NextPaletteJointObjectiveVector,
): { foregrounds: JointPaletteOverlayAlternative[]; accents: JointPaletteOverlayAlternative[] } {
	if (canonical.foreground.generated || canonical.accent.generated) return { foregrounds: [], accents: [] }
	return {
		foregrounds: evidence.overlays.filter((overlay) => sameRgb(overlay.rgb, canonical.foreground.rgb) &&
			overlay.evidence.foregroundSupport + epsilon >= incumbent[2]),
		accents: evidence.overlays.filter((overlay) => sameRgb(overlay.rgb, canonical.accent.rgb) &&
			overlay.evidence.accentIdentitySupport + epsilon >= incumbent[4]),
	}
}

function globalPareto(values: readonly Selection[]): Selection[] {
	return values.filter((candidate) => !values.some((other) =>
		other !== candidate && dominates(other.objectives, candidate.objectives)))
		.sort((first, second) => first.changedSemanticBlocks - second.changedSemanticBlocks ||
			first.changedSemanticAtoms - second.changedSemanticAtoms || compareAscii(first.semanticKey, second.semanticKey) ||
			compareAscii(first.stableKey, second.stableKey))
}

function countBy(values: readonly number[]): Record<string, number> {
	const counts: Record<string, number> = {}
	for (const value of values) counts[String(value)] = (counts[String(value)] ?? 0) + 1
	return counts
}

function emptyRun(): SelectionRun {
	return {
		selection: null,
		admitted: [],
		completeFrontier: [],
		withinClassFrontier: [],
		counts: {
			sameStateNoncollapsedTreatments: 0,
			validRecomposedTreatments: 0,
			compactDominatingTreatments: 0,
			logicalConstrainedCompleteTuples: 0,
			attemptedCompleteTuples: 0,
			admittedCompleteTuples: 0,
			completeTupleFrontier: 0,
			withinClassFrontier: 0,
			admittedByChangedAtoms: {},
		},
	}
}

function select(
	canonical: Palette,
	evidence: JointPaletteEvidence,
	incumbent: NextPaletteJointObjectiveVector,
	canonicalResolution: CanonicalResolution,
	overlays: ReturnType<typeof overlayAliases>,
	constraints: Constraints = {},
): SelectionRun {
	const canonicalCompact = canonicalResolution.resolved?.compact
	if (!canonicalCompact || overlays.foregrounds.length === 0 || overlays.accents.length === 0) return emptyRun()
	const nodeById = new Map(evidence.graph.nodes.map((node) => [node.id, node]))
	const sameState = evidence.fieldTreatments.filter((treatment) => treatment.state === canonicalResolution.state &&
		treatment.state !== "collapsed")
	const valid: Array<{ treatment: JointPaletteFieldTreatment; background: PaletteRelationNode;
		surface: PaletteRelationNode; compact: CompactRelationEvidence }> = []
	for (const treatment of sameState) {
		const background = nodeById.get(treatment.backgroundNodeId)
		const surface = nodeById.get(treatment.surfaceNodeId)
		if (!background || !surface || background.typographyOnly || surface.typographyOnly) continue
		if (constraints.canonicalBackground && !sameRgb(background.rgb, canonical.background.rgb)) continue
		if (constraints.canonicalSurface && !sameRgb(surface.rgb, canonical.surface.rgb)) continue
		const recomputed = jointPaletteFieldStateEvidence(
			evidence.graph, evidence.perception.analysis, background, surface, treatment.state,
		)
		const compact = compactRelation(treatment.state, recomputed.relation)
		if (!compact?.recompositionPass || Math.abs(recomputed.support - treatment.stateSupport) > epsilon ||
			Math.abs(recomputed.endpointDistance - treatment.endpointDistance) > epsilon ||
			!isDeepStrictEqual(recomputed.relation, treatment.fieldRelation)) continue
		valid.push({ treatment, background, surface, compact })
	}
	const compactDominating = valid.filter((entry) => dominates(entry.compact.vector, canonicalCompact.vector))
	const candidates: Selection[] = []
	let attemptedCompleteTuples = 0
	for (const entry of compactDominating) {
		const { treatment, background, surface, compact } = entry
		const backgroundChanged = !sameRgb(background.rgb, canonical.background.rgb) || canonical.background.generated
		const surfaceChanged = !sameRgb(surface.rgb, canonical.surface.rgb) || canonical.surface.generated
		const changedSemanticAtoms = Number(backgroundChanged) + Number(surfaceChanged)
		if (changedSemanticAtoms === 0) continue
		for (const foreground of overlays.foregrounds) {
			if (sameRgb(foreground.rgb, background.rgb) || sameRgb(foreground.rgb, surface.rgb)) continue
			const foregroundContrast = evaluateJointPaletteOverlayContrast(foreground, background.rgb, surface.rgb)
			const foregroundWorst = Math.min(foregroundContrast.background.magnitude, foregroundContrast.surface.magnitude)
			for (const accent of overlays.accents) {
				attemptedCompleteTuples++
				if (sameRgb(accent.rgb, background.rgb) || sameRgb(accent.rgb, surface.rgb)) continue
				if (sameRgb(foreground.rgb, accent.rgb) && !sameRgb(canonical.foreground.rgb, canonical.accent.rgb)) continue
				if (new Set([background.rgb, foreground.rgb, surface.rgb, accent.rgb].map(rgbKey)).size >
					JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_POLICY.maximumDistinctRoleColors) continue
				const accentContrast = evaluateJointPaletteOverlayContrast(accent, background.rgb, surface.rgb)
				const objectives: NextPaletteJointObjectiveVector = [
					background.fieldEligibility.support,
					treatment.stateSupport,
					foreground.evidence.foregroundSupport,
					foregroundWorst,
					accent.evidence.accentIdentitySupport,
					accentContrast.background.magnitude,
				]
				const candidate: Selection = {
					background,
					foreground,
					surface,
					accent,
					fieldTreatment: treatment,
					fieldState: treatment.state,
					compact,
					compactVector: compact.vector,
					objectives,
					stableKey: [treatment.stableKey, foreground.stableKey, accent.stableKey].join("|"),
					semanticKey: semanticKey(background.rgb, foreground.rgb, surface.rgb, accent.rgb, treatment.state),
					fieldChanged: true,
					overlayChanged: false,
					changedSemanticBlocks: 1,
					changedSemanticAtoms,
					apcaLc: {
						foregroundOnBackground: foregroundContrast.background.signedLc,
						foregroundOnSurface: foregroundContrast.surface.signedLc,
						accentOnBackground: accentContrast.background.signedLc,
						accentOnSurface: accentContrast.surface.signedLc,
					},
				}
				candidates.push(candidate)
			}
		}
	}
	const chosen = selectCompactRelationDominance(candidates, incumbent, canonicalCompact.vector)
	const completeFrontier = globalPareto(chosen.admitted)
	return {
		selection: chosen.selected,
		admitted: chosen.admitted,
		completeFrontier,
		withinClassFrontier: chosen.withinClassFrontier,
		counts: {
			sameStateNoncollapsedTreatments: sameState.length,
			validRecomposedTreatments: valid.length,
			compactDominatingTreatments: compactDominating.length,
			logicalConstrainedCompleteTuples: sameState.length * overlays.foregrounds.length * overlays.accents.length,
			attemptedCompleteTuples,
			admittedCompleteTuples: chosen.admitted.length,
			completeTupleFrontier: completeFrontier.length,
			withinClassFrontier: chosen.withinClassFrontier.length,
			admittedByChangedAtoms: countBy(chosen.admitted.map((entry) => entry.changedSemanticAtoms)),
		},
	}
}

function summary(
	selection: Selection | null,
	canonicalState: JointPaletteFieldState,
	stableKey: string,
	incumbent: NextPaletteJointObjectiveVector,
): CompactRelationDominanceSummary {
	return selection ? {
		changed: true,
		admitted: true,
		stableKey: selection.stableKey,
		fieldState: selection.fieldState,
		changedSemanticBlocks: selection.changedSemanticBlocks,
		changedSemanticAtoms: selection.changedSemanticAtoms,
		objectives: selection.objectives,
		objectiveDeltas: objectiveDeltas(selection.objectives, incumbent),
	} : {
		changed: false,
		admitted: false,
		stableKey,
		fieldState: canonicalState,
		changedSemanticBlocks: 0,
		changedSemanticAtoms: 0,
		objectives: incumbent,
		objectiveDeltas: [0, 0, 0, 0, 0, 0],
	}
}

function selectedProvenance(selection: Selection): Record<RoleName, SourceRoleProvenance> {
	return {
		background: nodeProvenance(selection.background),
		foreground: overlayProvenance(selection.foreground),
		surface: nodeProvenance(selection.surface),
		accent: overlayProvenance(selection.accent),
	}
}

function frontierEntry(
	selection: Selection,
	incumbent: NextPaletteJointObjectiveVector,
	canonicalCompact: CompactRelationVector,
): CompactRelationDominanceFrontierEntry {
	return {
		...summary(selection, selection.fieldState, selection.stableKey, incumbent),
		semanticKey: selection.semanticKey,
		changedBlocks: { field: true, foreground: false, accent: false },
		roles: {
			background: selection.background.rgb,
			foreground: selection.foreground.rgb,
			surface: selection.surface.rgb,
			accent: selection.accent.rgb,
		},
		compactVector: selection.compact.vector,
		compactDeltas: compactDeltas(selection.compact.vector, canonicalCompact),
	}
}

function roleColor(node: PaletteRelationNode, canonical: RoleColor): RoleColor {
	return sameRgb(node.rgb, canonical.rgb) && !canonical.generated
		? canonical
		: { rgb: node.rgb, hex: rgbToHex(node.rgb), generated: false, sourceDistance: 0 }
}

function metrics(selection: Selection, roles: readonly RoleColor[], evidence: JointPaletteEvidence): PaletteMetrics {
	const labs = [selection.background.lab, selection.foreground.lab, selection.surface.lab, selection.accent.lab]
	const fieldIds = new Set(evidence.graph.fieldNodeIds)
	const nodes = evidence.graph.nodes.filter((node) => fieldIds.has(node.id))
	const population = nodes.reduce((sum, node) => sum + node.population, 0)
	const reconstruction = nodes.reduce((sum, node) =>
		sum + node.population * Math.min(...labs.map((lab) => okDistance(node.lab, lab))), 0) / Math.max(population, epsilon)
	return {
		foregroundContrast: contrastRatio(selection.foreground.rgb, selection.background.rgb),
		foregroundSurfaceContrast: contrastRatio(selection.foreground.rgb, selection.surface.rgb),
		accentContrast: contrastRatio(selection.accent.rgb, selection.background.rgb),
		accentSurfaceContrast: contrastRatio(selection.accent.rgb, selection.surface.rgb),
		minimumRoleDistance: roleMinimumDistance(labs),
		meanSourceDistance: roles.reduce((sum, role) => sum + role.sourceDistance, 0) / roles.length,
		meanReconstructionError: reconstruction,
	}
}

function gradientEvidence(selection: Selection): GradientEvidence {
	const relation = selection.fieldTreatment.fieldRelation!
	return {
		isGradient: selection.fieldState === "gradient",
		confidence: selection.fieldTreatment.stateSupport,
		coverage: relation.endpoint.absolutePairCoverage,
		continuity: relation.distribution.continuity,
		coherence: relation.topology.monotoneConnectivity,
	}
}

function toPalette(selection: Selection, canonical: Palette, evidence: JointPaletteEvidence): Palette {
	const background = roleColor(selection.background, canonical.background)
	const foreground = canonical.foreground
	const surface = roleColor(selection.surface, canonical.surface)
	const accent = canonical.accent
	const roles = [background, foreground, surface, accent] as const
	return {
		background,
		foreground,
		surface,
		accent,
		gradient: gradientEvidence(selection),
		score: canonical.score,
		metrics: metrics(selection, roles, evidence),
	}
}

function signedApca(palette: Palette): JointPaletteCompactRelationDominanceCertificate["selected"]["apcaLc"] {
	return {
		foregroundOnBackground: apcaContrast(palette.foreground.rgb, palette.background.rgb),
		foregroundOnSurface: apcaContrast(palette.foreground.rgb, palette.surface.rgb),
		accentOnBackground: apcaContrast(palette.accent.rgb, palette.background.rgb),
		accentOnSurface: apcaContrast(palette.accent.rgb, palette.surface.rgb),
	}
}

function routeFor(
	incumbentAvailable: boolean,
	resolution: CanonicalResolution,
	overlays: ReturnType<typeof overlayAliases>,
	selection: Selection | null,
): Route {
	if (!incumbentAvailable) return "preserve-canonical-incumbent-evidence-unavailable"
	if (resolution.state === "collapsed") return "preserve-canonical-collapsed"
	if (resolution.backgroundAliasCount === 0 || resolution.surfaceAliasCount === 0 || resolution.maximizingPairCount === 0) {
		return "preserve-canonical-field-evidence-unavailable"
	}
	if (!resolution.maximumSupportReproduced) return "preserve-canonical-relation-support-mismatch"
	if (resolution.materiallyAmbiguous) return "preserve-canonical-relation-ambiguity"
	if (overlays.foregrounds.length === 0 || overlays.accents.length === 0) {
		return "preserve-canonical-overlay-evidence-unavailable"
	}
	return selection ? "compact-relation-dominator" : "preserve-canonical-no-dominator"
}

export function buildJointPaletteCompactRelationDominance(
	image: RawImage,
): JointPaletteCompactRelationDominanceResult {
	const broad = extractNextPaletteJointParetoWithContext(image)
	const canonical = broad.canonicalExtraction.methods.spatial
	const evidence = broad.evidence
	const incumbent = broad.certificate.incumbent
	const canonicalResolution = resolveCanonical(canonical, evidence, incumbent.objectives[1])
	const overlays = overlayAliases(canonical, evidence, incumbent.objectives)
	const main = incumbent.evidenceAvailable ? select(
		canonical, evidence, incumbent.objectives, canonicalResolution, overlays,
	) : emptyRun()
	const selection = main.selection
	const candidate = selection ? toPalette(selection, canonical, evidence) : canonical
	if (!selection && candidate !== canonical) throw new Error("Compact relation dominance fallback is not exact canonical")
	if (selection && isDeepStrictEqual(candidate, canonical)) {
		throw new Error("Compact relation dominance selection did not change the canonical field block")
	}
	const route = routeFor(incumbent.evidenceAvailable, canonicalResolution, overlays, selection)
	const canonicalPair = canonicalResolution.resolved
	const canonicalCompact = canonicalPair?.compact ?? null
	const canonicalSourceRoles = canonicalPair && overlays.foregrounds[0] && overlays.accents[0] ? {
		background: nodeProvenance(canonicalPair.background),
		foreground: overlayProvenance(overlays.foregrounds[0]),
		surface: nodeProvenance(canonicalPair.surface),
		accent: overlayProvenance(overlays.accents[0]),
	} : null
	const deltas = selection && canonicalCompact ? compactDeltas(selection.compact.vector, canonicalCompact.vector) : null
	const selectedSummary = summary(selection, canonicalResolution.state, incumbent.stableKey, incumbent.objectives)
	const selectedApca = selection?.apcaLc ?? signedApca(canonical)
	if (Object.values(selectedApca).some((value) => !Number.isFinite(value))) {
		throw new Error("Compact relation dominance selected APCA is non-finite")
	}
	const domainBytes = JSON.stringify(main.admitted.map((entry) => ({
		stableKey: entry.stableKey,
		semanticKey: entry.semanticKey,
		changedSemanticBlocks: entry.changedSemanticBlocks,
		changedSemanticAtoms: entry.changedSemanticAtoms,
		objectives: entry.objectives,
		compactVector: entry.compact.vector,
	})))
	const fallback = (run: SelectionRun) => summary(
		run.selection, canonicalResolution.state, incumbent.stableKey, incumbent.objectives,
	)
	const ablations = canonicalPair ? {
		"canonical-background": fallback(select(canonical, evidence, incumbent.objectives, canonicalResolution, overlays,
			{ canonicalBackground: true })),
		"canonical-surface": fallback(select(canonical, evidence, incumbent.objectives, canonicalResolution, overlays,
			{ canonicalSurface: true })),
	} : {
		"canonical-background": fallback(emptyRun()),
		"canonical-surface": fallback(emptyRun()),
	}
	const canonicalVector = canonicalCompact?.vector
	const toFrontier = (entry: Selection) => frontierEntry(entry, incumbent.objectives, canonicalVector!)
	const certificate: JointPaletteCompactRelationDominanceCertificate = {
		schemaVersion: 1,
		version: JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_VERSION,
		policy: JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_POLICY,
		route,
		canonical: {
			evidenceAvailable: incumbent.evidenceAvailable,
			unavailableReasons: incumbent.unavailableReasons,
			fieldState: canonicalResolution.state,
			objectives: incumbent.objectives,
			stableKey: incumbent.stableKey,
			relation: {
				backgroundAliasCount: canonicalResolution.backgroundAliasCount,
				surfaceAliasCount: canonicalResolution.surfaceAliasCount,
				evaluatedPairCount: canonicalResolution.evaluatedPairCount,
				maximumSupport: canonicalResolution.maximumSupport,
				incumbentObjectiveStateSupport: incumbent.objectives[1],
				maximumSupportReproduced: canonicalResolution.maximumSupportReproduced,
				maximizingPairCount: canonicalResolution.maximizingPairCount,
				materiallyAmbiguous: canonicalResolution.materiallyAmbiguous,
				resolved: canonicalPair !== null,
				provenance: canonicalPair ? {
					background: nodeProvenance(canonicalPair.background),
					surface: nodeProvenance(canonicalPair.surface),
				} : null,
				compact: canonicalCompact,
			},
			overlayAliases: { foreground: overlays.foregrounds.length, accent: overlays.accents.length },
			sourceExactRoles: canonicalSourceRoles,
		},
		counts: {
			graphNodes: evidence.graph.nodes.length,
			fieldNodes: evidence.counts.fieldNodes,
			fieldTreatments: evidence.fieldTreatments.length,
			overlayAlternatives: evidence.counts.overlayAlternatives,
			...main.counts,
		},
		domain: { admittedSha256: createHash("sha256").update(domainBytes).digest("hex") },
		selected: {
			...selectedSummary,
			roles: selection ? selectedProvenance(selection) : canonicalSourceRoles,
			fieldTreatment: selection?.fieldTreatment ?? null,
			compact: selection?.compact ?? canonicalCompact,
			compactDeltas: deltas,
			relationDominanceWitness: selection && canonicalCompact && deltas ? {
				canonicalStableKey: canonicalPair!.treatment.stableKey,
				selectedStableKey: selection.fieldTreatment.stableKey,
				canonicalVector: canonicalCompact.vector,
				selectedVector: selection.compact.vector,
				deltas,
				componentwiseWeakDominance: deltas.map((delta) => delta >= -epsilon) as
					unknown as readonly [boolean, boolean, boolean, boolean],
				strictlyImprovedComponents: compactNames.filter((_, index) => deltas[index] > epsilon),
			} : null,
			apcaLc: selectedApca,
		},
		admittedTupleFrontier: canonicalVector ? main.admitted.map(toFrontier) : [],
		completeTupleFrontier: canonicalVector ? main.completeFrontier.map(toFrontier) : [],
		withinClassFrontier: canonicalVector ? main.withinClassFrontier.map(toFrontier) : [],
		ablations,
		invariants: {
			diagnosticOnly: true,
			canonicalExtractionCalledOnce: true,
			freshConstrainedSelection: true,
			frozenBroadWinnerNotPostprocessed: true,
			exactlyOneChangedFieldBlock: true,
			canonicalOverlaySemanticsPreserved: true,
			sameNoncollapsedState: true,
			canonicalAliasResolutionComplete: true,
			canonicalRelationSupportReproduced: true,
			canonicalCompactAliasUnambiguous: true,
			compactRelationStrictDominance: true,
			sixObjectiveStrictDominance: true,
			sourceExactRoles: true,
			maximumFourColors: true,
			finiteSignedApca: true,
			fixedApcaFloorAbsent: true,
			noPostselectionMutation: true,
			unchangedIsExactCanonical: true,
		},
	}
	return deepFreeze({ canonical, candidate, certificate })
}
