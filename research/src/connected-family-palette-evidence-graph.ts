import { apcaContrast, contrastRatio, okDistance } from "./color.ts"
import {
	CONNECTED_FAMILY_PALETTE_PERCEPTION_VERSION,
	type ConnectedFamilyCandidate,
	type ConnectedFamilyCandidateConstruction,
	type ConnectedFamilyPalettePerception,
} from "./connected-family-palette-perception.ts"
import type { PaletteEvidenceEdge, PaletteEvidenceNode } from "./palette-evidence-graph.ts"

export const CONNECTED_FAMILY_PALETTE_EVIDENCE_GRAPH_VERSION = "palette-evidence-graph-connected-family-0.2.0-dev"

export type ConnectedFamilyPaletteEvidenceNode = PaletteEvidenceNode & {
	construction: ConnectedFamilyCandidateConstruction
	fieldRoleAllowed: boolean
	evidenceMaskSha256: string
	candidate: ConnectedFamilyCandidate
}

export type ConnectedFamilyPaletteEvidenceGraph = {
	version: typeof CONNECTED_FAMILY_PALETTE_EVIDENCE_GRAPH_VERSION
	perceptionVersion: typeof CONNECTED_FAMILY_PALETTE_PERCEPTION_VERSION
	nodes: readonly ConnectedFamilyPaletteEvidenceNode[]
	edges: readonly PaletteEvidenceEdge[]
	fieldNodeIds: readonly number[]
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value
	for (const child of Object.values(value)) deepFreeze(child)
	return Object.freeze(value)
}

export function buildConnectedFamilyPaletteEvidenceGraph(
	perception: ConnectedFamilyPalettePerception,
): ConnectedFamilyPaletteEvidenceGraph {
	if (perception.version !== CONNECTED_FAMILY_PALETTE_PERCEPTION_VERSION) {
		throw new Error(`Unexpected connected family perception version: ${String(perception.version)}`)
	}
	const analysis = perception.analysis
	const records = new Map(perception.candidateRecords.map((record) => [record.candidateId, record]))
	const families = new Map(perception.families.map((family) => [family.id, family]))
	const nodes = perception.candidates.map((candidate): ConnectedFamilyPaletteEvidenceNode => {
		const record = records.get(candidate.id)
		const family = families.get(candidate.familyId)
		if (!record || !family) throw new Error(`Connected family candidate ${candidate.id} has incomplete evidence`)
		return {
			id: candidate.id,
			stableKey: `${candidate.hex.toLowerCase()}:${candidate.construction}:` +
				record.representativePixelIndex.toString().padStart(12, "0") + `:${candidate.evidenceMaskSha256}`,
			rgb: candidate.rgb,
			lab: candidate.lab,
			hex: candidate.hex,
			population: candidate.population,
			background: candidate.background,
			saliency: candidate.saliency,
			text: candidate.text,
			chroma: candidate.chroma,
			typographyOnly: candidate.typographyOnly,
			construction: candidate.construction,
			fieldRoleAllowed: candidate.fieldRoleAllowed,
			evidenceMaskSha256: candidate.evidenceMaskSha256,
			regionIds: candidate.regionIds,
			spatial: candidate.spatial,
			familyId: candidate.familyId,
			familySpatial: candidate.familySpatial,
			get mask(): Uint8Array { return record.mask },
			binIds: record.binIds,
			representativePixelIndex: record.representativePixelIndex,
			family,
			candidate,
		}
	}).sort((first, second) => compareAscii(first.stableKey, second.stableKey))
	if (new Set(nodes.map((node) => node.id)).size !== nodes.length ||
		new Set(nodes.map((node) => node.stableKey)).size !== nodes.length) {
		throw new Error("Connected family evidence nodes require unique IDs and stable keys")
	}
	const edges: PaletteEvidenceEdge[] = []
	for (const from of nodes) {
		for (const to of nodes) {
			if (from.id === to.id) continue
			const edge: PaletteEvidenceEdge = {
				fromId: from.id,
				toId: to.id,
				stableKey: `${from.stableKey}>${to.stableKey}`,
				distance: okDistance(from.lab, to.lab),
				apcaLc: apcaContrast(from.rgb, to.rgb),
				wcagRatio: contrastRatio(from.rgb, to.rgb),
			}
			for (const value of [edge.distance, edge.apcaLc, edge.wcagRatio]) {
				if (!Number.isFinite(value)) throw new Error(`Connected family edge ${edge.stableKey} is non-finite`)
			}
			edges.push(edge)
		}
	}
	edges.sort((first, second) => compareAscii(first.stableKey, second.stableKey))
	return deepFreeze({
		version: CONNECTED_FAMILY_PALETTE_EVIDENCE_GRAPH_VERSION,
		perceptionVersion: perception.version,
		nodes,
		edges,
		fieldNodeIds: nodes.filter((node) => node.fieldRoleAllowed).map((node) => node.id),
	})
}
