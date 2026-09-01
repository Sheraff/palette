import {
	CONNECTED_FAMILY_PALETTE_PERCEPTION_VERSION,
	perceivePaletteImageWithConnectedFamilies,
	type ConnectedFamilyPalettePerception,
} from "./connected-family-palette-perception.ts"
import { CONNECTED_FAMILY_CANDIDATE_AVAILABILITY_VERSION } from "./connected-family-candidate-availability.ts"
import {
	NEXT_PALETTE_RELATION_DEVELOPMENT_POLICY,
	solveNextPaletteRelationRuntime,
	type NextPaletteRelationCertificate,
	type NextPaletteRelationPolicy,
	type NextPaletteRelationResult,
	type NextPaletteRelationRuntime,
} from "./next-palette-relation.ts"
import {
	buildConnectedFamilyPaletteRelationGraph,
	CONNECTED_FAMILY_PALETTE_RELATION_GRAPH_VERSION,
	type PaletteRelationGraph,
} from "./palette-relation-graph.ts"
import { CONNECTED_FAMILY_PALETTE_EVIDENCE_GRAPH_VERSION } from "./connected-family-palette-evidence-graph.ts"
import type { RawImage } from "./types.ts"

export const NEXT_PALETTE_CONNECTED_FAMILY_ALGORITHM_VERSION = "region-graph-next-0.4.0-connected-family-dev"

export const NEXT_PALETTE_CONNECTED_FAMILY_IDENTITY = Object.freeze({
	algorithmVersion: NEXT_PALETTE_CONNECTED_FAMILY_ALGORITHM_VERSION,
	availabilityVersion: CONNECTED_FAMILY_CANDIDATE_AVAILABILITY_VERSION,
	perceptionVersion: CONNECTED_FAMILY_PALETTE_PERCEPTION_VERSION,
	evidenceGraphVersion: CONNECTED_FAMILY_PALETTE_EVIDENCE_GRAPH_VERSION,
	relationGraphVersion: CONNECTED_FAMILY_PALETTE_RELATION_GRAPH_VERSION,
	fieldStates: Object.freeze(["collapsed", "distinct-flat", "gradient"] as const),
	fieldMembership: "lloyd-source-partition-only-with-source-relative-broad-dominance",
	overlayMembership: "lloyd-light-typography-and-connected-family-source-candidates",
	connectedFamilySemantics: "source-exact-connected-evidence-masks-preserved-as-independent-overlay-families",
	familyCoverage: "removed-global-population-coverage-role-local-overlay-evidence-only",
	reconstructionPopulation: "nonoverlapping-lloyd-source-partition",
	conjunction: "zero-preserving-harmonic-mean",
	consumerRelationSemantics: "nonempty-canonical-overlay-to-field-apca-adjacency-v1",
	generatedFallbackSemantics: "per-field-pair-iff-no-source-overlay-passes-all-required-foreground-relations",
	selection: "minimum-maximum-deficit-then-total-deficit-then-presentation-complexity-then-semantic-key",
	comparisonEpsilon: 1e-12,
	objectiveNames: Object.freeze([
		"backgroundRepresentativeness",
		"foregroundSupport",
		"fieldRelationSupport",
		"accentIdentitySupport",
		"noGlobalFamilyMassPenalty",
	] as const),
} as const)

export const NEXT_PALETTE_CONNECTED_FAMILY_RUNTIME: Readonly<NextPaletteRelationRuntime> = Object.freeze({
	algorithmVersion: NEXT_PALETTE_CONNECTED_FAMILY_ALGORITHM_VERSION,
	identity: NEXT_PALETTE_CONNECTED_FAMILY_IDENTITY,
	graphVersion: CONNECTED_FAMILY_PALETTE_RELATION_GRAPH_VERSION,
	perceptionVersion: CONNECTED_FAMILY_PALETTE_PERCEPTION_VERSION,
	familyCoverage: "role-local-overlay-evidence",
	reconstructionPopulation: "field-source-partition",
})

export type NextPaletteConnectedFamilyCertificate = NextPaletteRelationCertificate
export type NextPaletteConnectedFamilyResult = NextPaletteRelationResult
export type NextPaletteConnectedFamilyContext = NextPaletteConnectedFamilyResult & {
	perception: ConnectedFamilyPalettePerception
	graph: PaletteRelationGraph
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value
	for (const child of Object.values(value)) deepFreeze(child)
	return Object.freeze(value)
}

export function solveNextPaletteConnectedFamily(
	graph: PaletteRelationGraph,
	policy: NextPaletteRelationPolicy = NEXT_PALETTE_RELATION_DEVELOPMENT_POLICY,
): NextPaletteConnectedFamilyResult {
	return solveNextPaletteRelationRuntime(graph, policy, NEXT_PALETTE_CONNECTED_FAMILY_RUNTIME)
}

export function extractNextPaletteConnectedFamilyWithContext(
	image: RawImage,
	policy: NextPaletteRelationPolicy = NEXT_PALETTE_RELATION_DEVELOPMENT_POLICY,
): NextPaletteConnectedFamilyContext {
	const perception = perceivePaletteImageWithConnectedFamilies(image)
	const graph = buildConnectedFamilyPaletteRelationGraph(perception)
	return deepFreeze({ ...solveNextPaletteConnectedFamily(graph, policy), perception, graph })
}

export function extractNextPaletteConnectedFamily(
	image: RawImage,
	policy: NextPaletteRelationPolicy = NEXT_PALETTE_RELATION_DEVELOPMENT_POLICY,
): NextPaletteConnectedFamilyResult {
	const { palette, certificate } = extractNextPaletteConnectedFamilyWithContext(image, policy)
	return deepFreeze({ palette, certificate })
}
