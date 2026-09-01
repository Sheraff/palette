import { apcaContrast, contrastRatio, okDistance } from "./color.ts"
import type {
	Candidate,
	CandidatePerceptionRecord,
	CandidateSpatialEvidence,
	ColorFamilyRecord,
} from "./candidates.ts"
import {
	analyzeGradientFieldTopology,
	type GradientFieldTopologyEvidence,
} from "./gradient-field-topology.ts"
import {
	scoreGradientFieldTopologyEvidence,
	type GradientFieldTopologyModelDecision,
} from "./gradient-field-topology-model.ts"
import { PALETTE_PERCEPTION_VERSION, type PalettePerception } from "./palette-perception.ts"
import type { OKLab, RGB } from "./types.ts"

export const PALETTE_EVIDENCE_GRAPH_VERSION = "palette-evidence-graph-0.1.0-dev"

export type PaletteEvidenceNode = {
	id: number
	stableKey: string
	rgb: RGB
	lab: OKLab
	hex: string
	population: number
	background: number
	saliency: number
	text: number
	chroma: number
	typographyOnly: boolean
	regionIds: readonly number[]
	spatial: CandidateSpatialEvidence
	familyId: number
	familySpatial: CandidateSpatialEvidence
	mask: Uint8Array
	binIds: readonly number[]
	representativePixelIndex: number
	family: ColorFamilyRecord
	candidate: Candidate
}

export type PaletteEvidenceEdge = {
	fromId: number
	toId: number
	stableKey: string
	distance: number
	apcaLc: number
	wcagRatio: number
	field?: {
		topology: GradientFieldTopologyEvidence
		model: GradientFieldTopologyModelDecision
	}
}

export type PaletteEvidenceGraph = {
	version: typeof PALETTE_EVIDENCE_GRAPH_VERSION
	perceptionVersion: PalettePerception["version"]
	nodes: readonly PaletteEvidenceNode[]
	edges: readonly PaletteEvidenceEdge[]
	fieldNodeIds: readonly number[]
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function candidateStableKey(candidate: Candidate, record: CandidatePerceptionRecord): string {
	return `${candidate.hex.toLowerCase()}:${candidate.typographyOnly ? "typography" : "general"}:` +
		record.representativePixelIndex.toString().padStart(12, "0")
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value
	for (const child of Object.values(value)) deepFreeze(child)
	return Object.freeze(value)
}

function assertFiniteEdge(edge: PaletteEvidenceEdge): void {
	for (const [name, value] of [["distance", edge.distance], ["apcaLc", edge.apcaLc], ["wcagRatio", edge.wcagRatio]] as const) {
		if (!Number.isFinite(value)) throw new Error(`Palette evidence edge ${edge.stableKey} has non-finite ${name}`)
	}
}

export function buildPaletteEvidenceGraph(perception: PalettePerception): PaletteEvidenceGraph {
	if (perception.version !== PALETTE_PERCEPTION_VERSION) {
		throw new Error(`Unexpected palette perception version: ${String(perception.version)}`)
	}
	const analysis = perception.analysis
	const records = new Map(perception.candidateRecords.map((record) => [record.candidateId, record]))
	const families = new Map(perception.families.map((family) => [family.id, family]))
	const nodes = perception.candidates.map((candidate): PaletteEvidenceNode => {
		const record = records.get(candidate.id)
		const family = families.get(candidate.familyId)
		if (!record || !family) throw new Error(`Candidate ${candidate.id} has incomplete perception evidence`)
		return {
			id: candidate.id,
			stableKey: candidateStableKey(candidate, record),
			rgb: candidate.rgb,
			lab: candidate.lab,
			hex: candidate.hex,
			population: candidate.population,
			background: candidate.background,
			saliency: candidate.saliency,
			text: candidate.text,
			chroma: candidate.chroma,
			typographyOnly: candidate.typographyOnly,
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
	if (new Set(nodes.map((node) => node.id)).size !== nodes.length) throw new Error("Palette evidence node IDs must be unique")
	if (new Set(nodes.map((node) => node.stableKey)).size !== nodes.length) {
		throw new Error("Palette evidence node stable keys must be unique")
	}

	const edges: PaletteEvidenceEdge[] = []
	for (const from of nodes) {
		for (const to of nodes) {
			if (from.id === to.id) continue
			const stableKey = `${from.stableKey}>${to.stableKey}`
			const edge: PaletteEvidenceEdge = {
				fromId: from.id,
				toId: to.id,
				stableKey,
				distance: okDistance(from.lab, to.lab),
				apcaLc: apcaContrast(from.rgb, to.rgb),
				wcagRatio: contrastRatio(from.rgb, to.rgb),
			}
			if (!from.typographyOnly && !to.typographyOnly) {
				const topology = analyzeGradientFieldTopology(from.candidate, to.candidate, analysis)
				edge.field = { topology, model: scoreGradientFieldTopologyEvidence(topology) }
			}
			assertFiniteEdge(edge)
			edges.push(edge)
		}
	}
	edges.sort((first, second) => compareAscii(first.stableKey, second.stableKey))

	const graph: PaletteEvidenceGraph = {
		version: PALETTE_EVIDENCE_GRAPH_VERSION,
		perceptionVersion: perception.version,
		nodes,
		edges,
		fieldNodeIds: nodes.filter((node) => !node.typographyOnly).map((node) => node.id),
	}
	return deepFreeze(graph)
}
