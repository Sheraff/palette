import {
	analyzeFieldRelation,
	deriveSourceFieldEligibility,
	deriveSourceFieldEligibilityDomain,
	type FieldRelationEvidence,
	type SourceFieldEligibility,
} from "./field-relation.ts"
import {
	buildPaletteEvidenceGraph,
	type PaletteEvidenceGraph,
	type PaletteEvidenceNode,
} from "./palette-evidence-graph.ts"
import {
	buildConnectedFamilyPaletteEvidenceGraph,
	type ConnectedFamilyPaletteEvidenceGraph,
	type ConnectedFamilyPaletteEvidenceNode,
} from "./connected-family-palette-evidence-graph.ts"
import { PALETTE_PERCEPTION_VERSION, type PalettePerception } from "./palette-perception.ts"
import {
	CONNECTED_FAMILY_PALETTE_PERCEPTION_VERSION,
	type ConnectedFamilyPalettePerception,
} from "./connected-family-palette-perception.ts"

export const PALETTE_RELATION_GRAPH_VERSION = "palette-relation-graph-0.1.0-dev"
export const CONNECTED_FAMILY_PALETTE_RELATION_GRAPH_VERSION = "palette-relation-graph-connected-family-0.2.0-dev"

export type PaletteRelationNode = (PaletteEvidenceNode | ConnectedFamilyPaletteEvidenceNode) & {
	fieldEligibility: SourceFieldEligibility
	construction?: ConnectedFamilyPaletteEvidenceNode["construction"]
	fieldRoleAllowed?: boolean
	evidenceMaskSha256?: string
}

export type PaletteRelationEdge = {
	fromId: number
	toId: number
	stableKey: string
	distance: number
	apcaLc: number
	wcagRatio: number
	fieldRelation?: FieldRelationEvidence
}

export type PaletteRelationGraph = {
	version: typeof PALETTE_RELATION_GRAPH_VERSION | typeof CONNECTED_FAMILY_PALETTE_RELATION_GRAPH_VERSION
	perceptionVersion: typeof PALETTE_PERCEPTION_VERSION | typeof CONNECTED_FAMILY_PALETTE_PERCEPTION_VERSION
	nodes: readonly PaletteRelationNode[]
	edges: readonly PaletteRelationEdge[]
	fieldNodeIds: readonly number[]
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value
	for (const child of Object.values(value)) deepFreeze(child)
	return Object.freeze(value)
}

function buildRelationGraph(
	perception: PalettePerception | ConnectedFamilyPalettePerception,
	base: PaletteEvidenceGraph | ConnectedFamilyPaletteEvidenceGraph,
	version: PaletteRelationGraph["version"],
): PaletteRelationGraph {
	const fieldEligibility = deriveSourceFieldEligibilityDomain(base.nodes)
	const nodes = base.nodes.map((node): PaletteRelationNode => ({
		...node,
		fieldEligibility: fieldEligibility.get(node.id) ?? deriveSourceFieldEligibility(node),
	}))
	const nodeById = new Map(nodes.map((node) => [node.id, node]))
	const fieldNodeIds = nodes.filter((node) => node.fieldEligibility.eligible).map((node) => node.id)
	if (fieldNodeIds.length === 0) throw new Error("Palette relation graph has no source-supported field nodes")
	const fieldIds = new Set(fieldNodeIds)
	const analysis = perception.analysis
	const edges = base.edges.map((edge): PaletteRelationEdge => {
		const relationEdge: PaletteRelationEdge = {
			fromId: edge.fromId,
			toId: edge.toId,
			stableKey: edge.stableKey,
			distance: edge.distance,
			apcaLc: edge.apcaLc,
			wcagRatio: edge.wcagRatio,
		}
		if (fieldIds.has(edge.fromId) && fieldIds.has(edge.toId)) {
			const from = nodeById.get(edge.fromId)!
			const to = nodeById.get(edge.toId)!
			relationEdge.fieldRelation = analyzeFieldRelation(
				from,
				to,
				from.fieldEligibility,
				to.fieldEligibility,
				analysis,
			)
		}
		return relationEdge
	})
	const expectedFieldEdges = fieldNodeIds.length * (fieldNodeIds.length - 1)
	if (edges.filter((edge) => edge.fieldRelation).length !== expectedFieldEdges) {
		throw new Error("Palette relation graph field-edge domain is incomplete")
	}
	return deepFreeze({
		version,
		perceptionVersion: perception.version,
		nodes,
		edges,
		fieldNodeIds,
	})
}

export function buildPaletteRelationGraph(perception: PalettePerception): PaletteRelationGraph {
	if (perception.version !== PALETTE_PERCEPTION_VERSION) {
		throw new Error(`Unexpected palette perception version: ${String(perception.version)}`)
	}
	return buildRelationGraph(perception, buildPaletteEvidenceGraph(perception), PALETTE_RELATION_GRAPH_VERSION)
}

export function buildConnectedFamilyPaletteRelationGraph(
	perception: ConnectedFamilyPalettePerception,
): PaletteRelationGraph {
	if (perception.version !== CONNECTED_FAMILY_PALETTE_PERCEPTION_VERSION) {
		throw new Error(`Unexpected connected family perception version: ${String(perception.version)}`)
	}
	return buildRelationGraph(
		perception,
		buildConnectedFamilyPaletteEvidenceGraph(perception),
		CONNECTED_FAMILY_PALETTE_RELATION_GRAPH_VERSION,
	)
}
