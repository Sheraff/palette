import { labAt, okDistance } from "./color.ts"
import type { PaletteEvidenceNode } from "./palette-evidence-graph.ts"
import type { RegionAnalysis } from "./regions.ts"

export const FIELD_RELATION_EVIDENCE_VERSION = "field-relation-evidence-0.1.0-dev"

export type SourceFieldEligibility = {
	version: "source-field-eligibility-0.1.0-dev"
	eligible: boolean
	support: number
	broad: number
	connected: number
	detail: number
	frame: number
}

export type FieldRelationEvidence = {
	version: typeof FIELD_RELATION_EVIDENCE_VERSION
	endpointDistance: number
	endpoint: {
		absolutePairCoverage: number
		backgroundPresence: number
		surfacePresence: number
		balance: number
		mass: number
	}
	distribution: {
		normalizedEntropy: number
		middleMassShare: number
		continuity: number
		intermediateExtent: number
		progression: number
	}
	topology: {
		forwardMonotoneConnectivity: number
		reverseMonotoneConnectivity: number
		monotoneConnectivity: number
	}
	field: {
		backgroundSupport: number
		surfaceSupport: number
		jointSupport: number
	}
	stateSupport: {
		distinctFlat: number
		gradient: number
	}
}

type RegionAccumulator = {
	area: number
	support: number
	weightedU: number
	backgroundSeed: number
	surfaceSeed: number
}

const binCount = 18
const endpointWidth = 0.2
const epsilon = 1e-12

export function clampRelationEvidence(value: number): number {
	if (!Number.isFinite(value)) return 0
	return Math.max(0, Math.min(1, value))
}

export function harmonicConjunction(values: readonly number[]): number {
	if (values.length === 0) return 0
	const bounded = values.map(clampRelationEvidence)
	if (bounded.some((value) => value <= 0)) return 0
	return clampRelationEvidence(bounded.length / bounded.reduce((sum, value) => sum + 1 / value, 0))
}

export function deriveSourceFieldEligibility(node: PaletteEvidenceNode): SourceFieldEligibility {
	const connected = Math.max(clampRelationEvidence(node.spatial.field), clampRelationEvidence(node.familySpatial.field))
	const detail = Math.max(clampRelationEvidence(node.spatial.detail), clampRelationEvidence(node.familySpatial.detail))
	const frame = Math.max(clampRelationEvidence(node.spatial.frame), clampRelationEvidence(node.familySpatial.frame))
	const broad = Math.max(clampRelationEvidence(node.background), connected)
	return {
		version: "source-field-eligibility-0.1.0-dev",
		eligible: !node.typographyOnly && broad > Math.max(detail, frame),
		support: harmonicConjunction([broad, 1 - detail, 1 - frame]),
		broad,
		connected,
		detail,
		frame,
	}
}

export function deriveSourceFieldEligibilityDomain(
	nodes: readonly PaletteEvidenceNode[],
): ReadonlyMap<number, SourceFieldEligibility> {
	const evidence = nodes.map((node) => ({ node, field: deriveSourceFieldEligibility(node) }))
	return new Map(evidence.map(({ node, field }) => {
		const fieldRoleAllowed = (node as PaletteEvidenceNode & { fieldRoleAllowed?: boolean }).fieldRoleAllowed
		const disallowed = fieldRoleAllowed === false || node.typographyOnly
		const dominated = disallowed || evidence.some(({ node: otherNode, field: other }) =>
			otherNode.id !== node.id &&
				(otherNode as PaletteEvidenceNode & { fieldRoleAllowed?: boolean }).fieldRoleAllowed !== false &&
				!otherNode.typographyOnly &&
			other.broad > field.broad && other.detail <= field.detail && other.frame <= field.frame)
		return [node.id, { ...field, eligible: !dominated }]
	}))
}

function zeroEvidence(
	endpointDistance: number,
	backgroundField: SourceFieldEligibility,
	surfaceField: SourceFieldEligibility,
): FieldRelationEvidence {
	return {
		version: FIELD_RELATION_EVIDENCE_VERSION,
		endpointDistance: Number.isFinite(endpointDistance) ? Math.max(0, endpointDistance) : 0,
		endpoint: {
			absolutePairCoverage: 0,
			backgroundPresence: 0,
			surfacePresence: 0,
			balance: 0,
			mass: 0,
		},
		distribution: {
			normalizedEntropy: 0,
			middleMassShare: 0,
			continuity: 0,
			intermediateExtent: 0,
			progression: 0,
		},
		topology: {
			forwardMonotoneConnectivity: 0,
			reverseMonotoneConnectivity: 0,
			monotoneConnectivity: 0,
		},
		field: {
			backgroundSupport: backgroundField.support,
			surfaceSupport: surfaceField.support,
			jointSupport: harmonicConjunction([backgroundField.support, surfaceField.support]),
		},
		stateSupport: { distinctFlat: 0, gradient: 0 },
	}
}

function monotoneConnectivity(
	accumulators: readonly RegionAccumulator[],
	neighbors: readonly (readonly number[])[],
	direction: "forward" | "reverse",
): number {
	const increasing = direction === "forward"
	const coordinates = accumulators.map((accumulator) =>
		accumulator.support <= epsilon ? (increasing ? 1 : 0) : accumulator.weightedU / accumulator.support)
	const densities = accumulators.map((accumulator) =>
		accumulator.area === 0 ? 0 : clampRelationEvidence(accumulator.support / accumulator.area))
	const seeds = accumulators.map((accumulator) => clampRelationEvidence(
		(increasing ? accumulator.backgroundSeed : accumulator.surfaceSeed) / Math.max(1, accumulator.area),
	))
	const targets = accumulators.map((accumulator) => clampRelationEvidence(
		(increasing ? accumulator.surfaceSeed : accumulator.backgroundSeed) / Math.max(1, accumulator.area),
	))
	const order = accumulators.map((_, index) => index).sort((first, second) =>
		(increasing ? coordinates[first] - coordinates[second] : coordinates[second] - coordinates[first]) || first - second)
	const scores = seeds.map((seed, index) => seed * densities[index])
	for (const region of order) {
		if (scores[region] <= 0) continue
		for (const neighbor of neighbors[region]) {
			const movement = coordinates[neighbor] - coordinates[region]
			if (increasing ? movement < -epsilon : movement > epsilon) continue
			const continuity = 1 - Math.abs(movement)
			const capacity = clampRelationEvidence(Math.sqrt(densities[region] * densities[neighbor]) * continuity)
			scores[neighbor] = Math.max(scores[neighbor], Math.min(scores[region], capacity))
		}
	}
	const targetTotal = targets.reduce((sum, target) => sum + target, 0)
	if (targetTotal <= epsilon) return 0
	return clampRelationEvidence(targets.reduce((sum, target, index) => sum + target * scores[index], 0) / targetTotal)
}

export function analyzeFieldRelation(
	background: PaletteEvidenceNode,
	surface: PaletteEvidenceNode,
	backgroundField: SourceFieldEligibility,
	surfaceField: SourceFieldEligibility,
	analysis: RegionAnalysis,
): FieldRelationEvidence {
	const endpointDistance = okDistance(background.lab, surface.lab)
	const total = analysis.width * analysis.height
	if (!Number.isFinite(endpointDistance) || endpointDistance <= epsilon || total === 0) {
		return zeroEvidence(endpointDistance, backgroundField, surfaceField)
	}

	const delta = [
		surface.lab[0] - background.lab[0],
		surface.lab[1] - background.lab[1],
		surface.lab[2] - background.lab[2],
	] as const
	const distanceSquared = endpointDistance ** 2
	const residualScale = Math.max(epsilon, endpointDistance * Math.sqrt(0.03))
	const histogram = new Array(binCount).fill(0) as number[]
	const accumulators: RegionAccumulator[] = analysis.regions.map(() => ({
		area: 0,
		support: 0,
		weightedU: 0,
		backgroundSeed: 0,
		surfaceSeed: 0,
	}))
	let totalSupport = 0
	let backgroundPresenceMass = 0
	let surfacePresenceMass = 0
	let intermediateMass = 0

	for (let pixel = 0; pixel < total; pixel++) {
		const lab = labAt(analysis.labs, pixel)
		const rawU = ((lab[0] - background.lab[0]) * delta[0] +
			(lab[1] - background.lab[1]) * delta[1] +
			(lab[2] - background.lab[2]) * delta[2]) / distanceSquared
		const u = clampRelationEvidence(rawU)
		const projected = [
			background.lab[0] + delta[0] * u,
			background.lab[1] + delta[1] * u,
			background.lab[2] + delta[2] * u,
		] as const
		const residual = okDistance(lab, projected)
		const support = Math.exp(-((residual / residualScale) ** 2))
		const backgroundSeed = support * clampRelationEvidence(1 - u / endpointWidth)
		const surfaceSeed = support * clampRelationEvidence(1 - (1 - u) / endpointWidth)
		const intermediate = support * 4 * u * (1 - u)
		totalSupport += support
		backgroundPresenceMass += backgroundSeed
		surfacePresenceMass += surfaceSeed
		intermediateMass += intermediate
		histogram[Math.min(binCount - 1, Math.floor(u * binCount))] += support
		const region = analysis.labels[pixel]
		if (region < 0 || region >= accumulators.length) continue
		const accumulator = accumulators[region]
		accumulator.area++
		accumulator.support += support
		accumulator.weightedU += support * u
		accumulator.backgroundSeed += backgroundSeed
		accumulator.surfaceSeed += surfaceSeed
	}

	const absolutePairCoverage = clampRelationEvidence(totalSupport / total)
	const backgroundPresence = clampRelationEvidence(backgroundPresenceMass / total / (endpointWidth / 2))
	const surfacePresence = clampRelationEvidence(surfacePresenceMass / total / (endpointWidth / 2))
	const presenceTotal = backgroundPresence + surfacePresence
	const balance = presenceTotal <= epsilon
		? 0
		: clampRelationEvidence(1 - Math.abs(backgroundPresence - surfacePresence) / presenceTotal)
	const endpointPresence = Math.sqrt(backgroundPresence * surfacePresence)
	const endpointMass = clampRelationEvidence(absolutePairCoverage * endpointPresence * balance)
	const normalizedHistogram = totalSupport <= epsilon ? histogram.map(() => 0) : histogram.map((mass) => mass / totalSupport)
	const entropy = normalizedHistogram.reduce((sum, mass) => mass <= 0 ? sum : sum - mass * Math.log(mass), 0)
	const normalizedEntropy = clampRelationEvidence(entropy / Math.log(binCount))
	const middleMassShare = clampRelationEvidence(normalizedHistogram.slice(2, binCount - 2)
		.reduce((sum, mass) => sum + mass, 0))
	const continuity = clampRelationEvidence(Math.sqrt(normalizedEntropy * middleMassShare))
	const intermediateExtent = clampRelationEvidence(1.5 * intermediateMass / total)
	const progression = harmonicConjunction([continuity, intermediateExtent])
	const neighbors = analysis.regions.map((region) => region.neighbors)
	const forwardMonotoneConnectivity = monotoneConnectivity(accumulators, neighbors, "forward")
	const reverseMonotoneConnectivity = monotoneConnectivity(accumulators, neighbors, "reverse")
	const rootedMonotone = Math.sqrt(forwardMonotoneConnectivity * reverseMonotoneConnectivity)
	const monotone = harmonicConjunction([rootedMonotone, intermediateExtent])
	const jointFieldSupport = harmonicConjunction([backgroundField.support, surfaceField.support])
	const gradientTopology = harmonicConjunction([continuity, monotone, progression])
	const flatTopology = clampRelationEvidence(1 - Math.max(continuity, progression))
	return {
		version: FIELD_RELATION_EVIDENCE_VERSION,
		endpointDistance,
		endpoint: {
			absolutePairCoverage,
			backgroundPresence,
			surfacePresence,
			balance,
			mass: endpointMass,
		},
		distribution: {
			normalizedEntropy,
			middleMassShare,
			continuity,
			intermediateExtent,
			progression,
		},
		topology: {
			forwardMonotoneConnectivity,
			reverseMonotoneConnectivity,
			monotoneConnectivity: monotone,
		},
		field: {
			backgroundSupport: backgroundField.support,
			surfaceSupport: surfaceField.support,
			jointSupport: jointFieldSupport,
		},
		stateSupport: {
			distinctFlat: harmonicConjunction([endpointMass, jointFieldSupport, flatTopology]),
			gradient: harmonicConjunction([endpointMass, jointFieldSupport, gradientTopology]),
		},
	}
}
