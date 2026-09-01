import { createHash } from "node:crypto"
import { apcaContrast, rgbToOKLab } from "./color.ts"
import { spatialEvidence } from "./candidates.ts"
import {
	buildConnectedFamilyRepresentativeFidelity,
	CONNECTED_FAMILY_REPRESENTATIVE_FIDELITY_VERSION,
} from "./connected-family-representative-fidelity.ts"
import { analyzeFieldRelation, FIELD_RELATION_EVIDENCE_VERSION, type FieldRelationEvidence } from "./field-relation.ts"
import {
	buildPaletteRelationGraph,
	PALETTE_RELATION_GRAPH_VERSION,
	type PaletteRelationGraph,
	type PaletteRelationNode,
} from "./palette-relation-graph.ts"
import { PALETTE_PERCEPTION_VERSION, perceivePaletteImage, type PalettePerception } from "./palette-perception.ts"
import type { RawImage, RGB } from "./types.ts"

export const JOINT_PALETTE_EVIDENCE_VERSION = "joint-palette-evidence-0.1.0-development"
export const jointPaletteFieldStates = ["collapsed", "distinct-flat", "gradient"] as const
export type JointPaletteFieldState = typeof jointPaletteFieldStates[number]

export type JointPaletteOverlayEvidence = {
	population: number
	text: number
	saliency: number
	spatialDetail: number
	familyDetail: number
	chroma: number
	foregroundSupport: number
	accentIdentitySupport: number
}

export type JointPaletteOverlayAlternative = {
	alternativeId: string
	stableKey: string
	rgb: RGB
	lab: ReturnType<typeof rgbToOKLab>
	hex: string
	generated: false
	provenance: {
		kind: "perception-candidate" | "connected-family-local"
		candidateId: number | null
		familyId: number | null
		familyStableKey: string | null
		componentStableKey: string | null
		representativePixelIndex: number
		supportMaskSha256: string
		binIds: readonly number[]
	}
	evidence: JointPaletteOverlayEvidence
}

export type JointPaletteFieldTreatment = {
	stableKey: string
	backgroundNodeId: number
	surfaceNodeId: number
	state: JointPaletteFieldState
	stateSupport: number
	endpointDistance: number
	fieldRelation: FieldRelationEvidence | null
}

export type JointPaletteEvidence = {
	version: typeof JOINT_PALETTE_EVIDENCE_VERSION
	perceptionVersion: typeof PALETTE_PERCEPTION_VERSION
	relationGraphVersion: typeof PALETTE_RELATION_GRAPH_VERSION
	fieldRelationVersion: typeof FIELD_RELATION_EVIDENCE_VERSION
	representativeFidelityVersion: typeof CONNECTED_FAMILY_REPRESENTATIVE_FIDELITY_VERSION
	perception: PalettePerception
	graph: PaletteRelationGraph
	overlays: readonly JointPaletteOverlayAlternative[]
	fieldTreatments: readonly JointPaletteFieldTreatment[]
	counts: {
		fieldNodes: number
		fieldTreatments: number
		collapsedTreatments: number
		distinctFlatTreatments: number
		gradientTreatments: number
		baseOverlays: number
		localOverlays: number
		overlayAlternatives: number
	}
	invariants: {
		readOnly: true
		sourceExact: true
		connectedRepresentativesOverlayOnly: true
		fieldEvidenceIndependentOfOverlays: true
		fixedApcaAdmissionFloorAbsent: true
		positiveDistanceGradientsEnumerated: true
	}
}

type RawOverlay = Omit<JointPaletteOverlayAlternative, "evidence"> & {
	evidence: Omit<JointPaletteOverlayEvidence, "foregroundSupport" | "accentIdentitySupport">
}

const epsilon = 1e-12

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0
	return Math.max(0, Math.min(1, value))
}

function mean(values: readonly number[]): number {
	return values.length === 0 ? 0 : values.reduce((sum, value) => sum + clamp01(value), 0) / values.length
}

function rgbKey(rgb: RGB): string {
	return `${rgb[0]},${rgb[1]},${rgb[2]}`
}

function maskSha256(mask: Uint8Array): string {
	return createHash("sha256").update(mask).digest("hex")
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value
	for (const child of Object.values(value)) deepFreeze(child)
	return Object.freeze(value)
}

function relationFor(
	graph: PaletteRelationGraph,
	analysis: PalettePerception["analysis"],
	background: PaletteRelationNode,
	surface: PaletteRelationNode,
): FieldRelationEvidence {
	const existing = graph.edges.find((edge) => edge.fromId === background.id && edge.toId === surface.id)?.fieldRelation
	return existing ?? analyzeFieldRelation(
		background,
		surface,
		background.fieldEligibility,
		surface.fieldEligibility,
		analysis,
	)
}

export function jointPaletteFieldStateEvidence(
	graph: PaletteRelationGraph,
	analysis: PalettePerception["analysis"],
	background: PaletteRelationNode,
	surface: PaletteRelationNode,
	state: JointPaletteFieldState,
): { support: number; relation: FieldRelationEvidence | null; endpointDistance: number } {
	const collapsed = rgbKey(background.rgb) === rgbKey(surface.rgb)
	if (collapsed !== (state === "collapsed")) return { support: 0, relation: null, endpointDistance: 0 }
	if (collapsed) {
		const fieldIds = new Set(graph.fieldNodeIds)
		const alternatives = graph.nodes.filter((node) => fieldIds.has(node.id) && rgbKey(node.rgb) !== rgbKey(background.rgb))
		const strongestDistinct = alternatives.reduce((strongest, alternative) => {
			const relation = relationFor(graph, analysis, background, alternative)
			return Math.max(strongest, relation.stateSupport.distinctFlat, relation.stateSupport.gradient)
		}, 0)
		return { support: clamp01(1 - strongestDistinct), relation: null, endpointDistance: 0 }
	}
	const relation = relationFor(graph, analysis, background, surface)
	if (relation.endpointDistance <= epsilon) return { support: 0, relation, endpointDistance: relation.endpointDistance }
	return {
		support: state === "gradient" ? relation.stateSupport.gradient : relation.stateSupport.distinctFlat,
		relation,
		endpointDistance: relation.endpointDistance,
	}
}

function localEvidence(
	analysis: PalettePerception["analysis"],
	supportMask: Uint8Array,
	familyMask: Uint8Array,
): Omit<JointPaletteOverlayEvidence, "foregroundSupport" | "accentIdentitySupport" | "chroma"> {
	let count = 0
	let text = 0
	let saliency = 0
	for (let pixel = 0; pixel < supportMask.length; pixel++) {
		if (!supportMask[pixel]) continue
		const region = analysis.regions[analysis.labels[pixel]]
		count++
		text += region.text
		saliency += region.saliency
	}
	if (count === 0) throw new Error("Joint palette local overlay has an empty support mask")
	return {
		population: count / supportMask.length,
		text: text / count,
		saliency: saliency / count,
		spatialDetail: spatialEvidence(analysis, supportMask).detail,
		familyDetail: spatialEvidence(analysis, familyMask).detail,
	}
}

function buildRawOverlays(perception: PalettePerception, graph: PaletteRelationGraph): RawOverlay[] {
	const raw: RawOverlay[] = graph.nodes.map((node) => ({
		alternativeId: `candidate-${node.id}`,
		stableKey: `candidate:${node.stableKey}`,
		rgb: node.rgb,
		lab: node.lab,
		hex: node.hex,
		generated: false,
		provenance: {
			kind: "perception-candidate",
			candidateId: node.id,
			familyId: node.familyId,
			familyStableKey: null,
			componentStableKey: null,
			representativePixelIndex: node.representativePixelIndex,
			supportMaskSha256: maskSha256(node.mask),
			binIds: [...node.binIds],
		},
		evidence: {
			population: node.population,
			text: node.text,
			saliency: node.saliency,
			spatialDetail: node.spatial.detail,
			familyDetail: node.familySpatial.detail,
			chroma: node.chroma,
		},
	}))
	const fidelity = buildConnectedFamilyRepresentativeFidelity(perception)
	for (const family of fidelity.families) {
		const familyMask = family.mask
		for (const component of family.components) {
			for (const representative of component.representatives) {
				const supportMask = representative.supportMask
				const evidence = localEvidence(perception.analysis, supportMask, familyMask)
				raw.push({
					alternativeId: `connected-local-${representative.stableKey}`,
					stableKey: `connected-local:${representative.stableKey}`,
					rgb: representative.rgb,
					lab: representative.lab,
					hex: representative.hex,
					generated: false,
					provenance: {
						kind: "connected-family-local",
						candidateId: null,
						familyId: null,
						familyStableKey: family.stableKey,
						componentStableKey: component.stableKey,
						representativePixelIndex: representative.representativePixelIndex,
						supportMaskSha256: representative.supportMaskSha256,
						binIds: [...representative.binIds],
					},
					evidence: { ...evidence, chroma: representative.chroma },
				})
			}
		}
	}
	return raw.sort((first, second) => compareAscii(first.stableKey, second.stableKey))
}

function buildOverlays(perception: PalettePerception, graph: PaletteRelationGraph): JointPaletteOverlayAlternative[] {
	const raw = buildRawOverlays(perception, graph)
	const maximumPopulation = Math.max(epsilon, ...raw.map((alternative) => alternative.evidence.population))
	const maximumChroma = Math.max(epsilon, ...raw.map((alternative) => alternative.evidence.chroma))
	return raw.map((alternative): JointPaletteOverlayAlternative => {
		const normalizedPopulation = Math.sqrt(alternative.evidence.population / maximumPopulation)
		const foregroundSupport = mean([
			alternative.evidence.text,
			alternative.evidence.saliency,
			alternative.evidence.spatialDetail,
			alternative.evidence.familyDetail,
			normalizedPopulation,
		])
		const accentIdentitySupport = mean([
			alternative.evidence.chroma / maximumChroma,
			alternative.evidence.saliency,
			Math.max(alternative.evidence.spatialDetail, alternative.evidence.familyDetail),
			normalizedPopulation,
		])
		return {
			...alternative,
			evidence: { ...alternative.evidence, foregroundSupport, accentIdentitySupport },
		}
	})
}

function buildFieldTreatments(graph: PaletteRelationGraph, perception: PalettePerception): JointPaletteFieldTreatment[] {
	const fieldIds = new Set(graph.fieldNodeIds)
	const nodes = graph.nodes.filter((node) => fieldIds.has(node.id)).sort((first, second) =>
		compareAscii(first.stableKey, second.stableKey))
	const treatments: JointPaletteFieldTreatment[] = []
	for (const background of nodes) {
		const collapsed = jointPaletteFieldStateEvidence(graph, perception.analysis, background, background, "collapsed")
		treatments.push({
			stableKey: `${background.stableKey}|${background.stableKey}|collapsed`,
			backgroundNodeId: background.id,
			surfaceNodeId: background.id,
			state: "collapsed",
			stateSupport: collapsed.support,
			endpointDistance: 0,
			fieldRelation: null,
		})
		for (const surface of nodes) {
			if (rgbKey(background.rgb) === rgbKey(surface.rgb)) continue
			for (const state of ["distinct-flat", "gradient"] as const) {
				const evidence = jointPaletteFieldStateEvidence(graph, perception.analysis, background, surface, state)
				if (evidence.endpointDistance <= epsilon) continue
				treatments.push({
					stableKey: `${background.stableKey}|${surface.stableKey}|${state}`,
					backgroundNodeId: background.id,
					surfaceNodeId: surface.id,
					state,
					stateSupport: evidence.support,
					endpointDistance: evidence.endpointDistance,
					fieldRelation: evidence.relation,
				})
			}
		}
	}
	return treatments.sort((first, second) => compareAscii(first.stableKey, second.stableKey))
}

export function evaluateJointPaletteOverlayContrast(
	alternative: JointPaletteOverlayAlternative,
	background: RGB,
	surface: RGB,
): {
	background: { signedLc: number; magnitude: number }
	surface: { signedLc: number; magnitude: number }
} {
	const backgroundLc = apcaContrast(alternative.rgb, background)
	const surfaceLc = apcaContrast(alternative.rgb, surface)
	if (!Number.isFinite(backgroundLc) || !Number.isFinite(surfaceLc)) {
		throw new Error(`Joint palette overlay ${alternative.stableKey} has non-finite APCA`)
	}
	return {
		background: { signedLc: backgroundLc, magnitude: Math.abs(backgroundLc) },
		surface: { signedLc: surfaceLc, magnitude: Math.abs(surfaceLc) },
	}
}

export function buildJointPaletteEvidence(image: RawImage): JointPaletteEvidence {
	const before = createHash("sha256").update(image.data).digest("hex")
	const perception = perceivePaletteImage(image)
	const graph = buildPaletteRelationGraph(perception)
	const overlays = buildOverlays(perception, graph)
	const fieldTreatments = buildFieldTreatments(graph, perception)
	const after = createHash("sha256").update(image.data).digest("hex")
	if (before !== after) throw new Error("Joint palette evidence mutated its source image")
	const localOverlays = overlays.filter((alternative) =>
		alternative.provenance.kind === "connected-family-local").length
	return deepFreeze({
		version: JOINT_PALETTE_EVIDENCE_VERSION,
		perceptionVersion: PALETTE_PERCEPTION_VERSION,
		relationGraphVersion: PALETTE_RELATION_GRAPH_VERSION,
		fieldRelationVersion: FIELD_RELATION_EVIDENCE_VERSION,
		representativeFidelityVersion: CONNECTED_FAMILY_REPRESENTATIVE_FIDELITY_VERSION,
		perception,
		graph,
		overlays,
		fieldTreatments,
		counts: {
			fieldNodes: graph.fieldNodeIds.length,
			fieldTreatments: fieldTreatments.length,
			collapsedTreatments: fieldTreatments.filter((treatment) => treatment.state === "collapsed").length,
			distinctFlatTreatments: fieldTreatments.filter((treatment) => treatment.state === "distinct-flat").length,
			gradientTreatments: fieldTreatments.filter((treatment) => treatment.state === "gradient").length,
			baseOverlays: overlays.length - localOverlays,
			localOverlays,
			overlayAlternatives: overlays.length,
		},
		invariants: {
			readOnly: true,
			sourceExact: true,
			connectedRepresentativesOverlayOnly: true,
			fieldEvidenceIndependentOfOverlays: true,
			fixedApcaAdmissionFloorAbsent: true,
			positiveDistanceGradientsEnumerated: true,
		},
	})
}
