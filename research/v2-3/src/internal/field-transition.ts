import { labAt, okDistance, rgbAt, rgbToHex, rgbToOKLab } from "./color.ts";

import { assignFieldRoles, quantizedKey } from "./palette-core.ts";

import { createBandSpatialSpreadAccumulator } from "./band-representative.ts";

import type { BackgroundFieldDomainEvidence, ColorFamilyEvidence, ColorRepresentative, FieldHypothesis, FieldRoleAssignmentEvidence, GradientDirection, GradientTopology, NativePaletteEvidence } from "./palette-core.ts";

import type { OKLab } from "./types.ts";

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_TRANSITION_ENDPOINT_INTERVAL =
	Object.freeze([0.15, 0.85] as const)

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_TRANSITION_MINIMUM_POPULATION_FRACTION = 0.08

export type FieldTransitionRegionEvidence = Readonly<{
	id: string
	familyId: string
	startPixelIndex: number
	population: number
	populationFraction: number
	componentFamilyFraction: number
	borderCoverage: number
	quadrantCoverage: number
	centroid: readonly [x: number, y: number]
	widthFraction: number
	heightFraction: number
	endpointEligible: boolean
	radialCenterEligible: boolean
	endpointRejectionReasons: readonly string[]
}>

export type FieldTransitionTrace = Readonly<{
	fieldDomainId: string
	topology: GradientTopology
	direction: GradientDirection
	spatialCenter: readonly [x: number, y: number] | null
	endpointFamilyIds: readonly [string, string]
	stageFamilyIds: readonly string[]
	stageRegionIds: readonly string[]
	stagePositions: readonly number[]
	edgeLocalSteps: readonly number[]
	endpointDistance: number
	spatialProgression: number
	colorProgression: number
	colorDirectness: number
	localContinuity: number
	branching: number
	eligible: boolean
	rejectionReasons: readonly string[]
}>

export type NativeFieldTransitionDiscovery = Readonly<{
	regions: readonly FieldTransitionRegionEvidence[]
	fieldDomains: readonly BackgroundFieldDomainEvidence[]
	traces: readonly FieldTransitionTrace[]
	hypotheses: readonly FieldHypothesis[]
}>

export type FieldTransitionExactStageColor = Readonly<{
	rgb: ColorRepresentative["rgb"]
	oklab: OKLab
	hex: string
	provenance: Readonly<{
		exactSource: true
		familyId: string
		regionId: string
		pixelIndex: number
		x: number
		y: number
	}>
}>

export type FieldTransitionPathStageEvidence = Readonly<{
	stageIndex: number
	familyId: string
	regionId: string
	spatialPosition: number
	colorPosition: number
	population: number
	populationFraction: number
	imagePopulationFraction: number
	quadrantCoverage: number
	prototype: OKLab
	exactColor: FieldTransitionExactStageColor
}>

export type SupportedFieldTransitionPathEvidence = Readonly<{
	fieldDomainId: string
	topology: GradientTopology
	direction: GradientDirection
	spatialCenter: readonly [x: number, y: number] | null
	endpointFamilyIds: readonly [string, string]
	endpointInterval: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_TRANSITION_ENDPOINT_INTERVAL
	stageFamilyIds: readonly string[]
	stageRegionIds: readonly string[]
	stagePositions: readonly number[]
	stageColorPositions: readonly number[]
	stagePopulationFractions: readonly number[]
	stages: readonly FieldTransitionPathStageEvidence[]
	acceptedIntermediateSupport: readonly FieldTransitionPathStageEvidence[]
	transitionFamilyCount: number
	transitionPopulationFraction: number
	transitionQuadrantCoverage: number
	connected: boolean
	legacyEligible: boolean
	eligible: boolean
	rejectionReasons: readonly string[]
	hypothesis: FieldHypothesis | null
}>

type RegionNode = {
	index: number
	id: string
	familyIndex: number
	family: ColorFamilyEvidence
	start: number
	population: number
	minX: number
	minY: number
	maxX: number
	maxY: number
	borderPixels: number
	quadrants: number
	cornerCounts: [number, number, number, number]
	sumX: number
	sumY: number
	sumL: number
	sumA: number
	sumB: number
	endpointRejectionReasons: string[]
}

type RegionEdge = Readonly<{
	key: string
	first: number
	second: number
	boundaryEdges: number
	meanLocalStep: number
}>

type RegionGraph = Readonly<{
	nodes: readonly RegionNode[]
	edges: readonly RegionEdge[]
	edgesByNode: readonly (readonly RegionEdge[])[]
	/** Region index per pixel. Already computed while flooding; published so the endpoint
	 * bands can be walked without a second segmentation. */
	regionAt: Int32Array
}>

type TransitionCandidate = Readonly<{
	domain: BackgroundFieldDomainEvidence
	trace: FieldTransitionTrace
	path: readonly RegionNode[]
	stageColorPositions: readonly number[]
	/**
	 * The candidate's own geometry evaluated at a pixel, in the same normalised
	 * `[0, 1]` coordinates the node-level stage positions use. Lets the endpoint bands be
	 * cut from the domain the same way the seed gradient fit cuts its own.
	 */
	pixelPosition: (x: number, y: number) => number
}>

type TransitionGeometry = Readonly<{
	topology: GradientTopology
	direction: GradientDirection
	center: readonly [x: number, y: number] | null
}>

const ENDPOINT_MINIMUM_POPULATION = 0.055

const ENDPOINT_MINIMUM_FIELD_SCORE = 0.38

const ENDPOINT_MINIMUM_COMPONENT_FAMILY_FRACTION = 0.55

const ENDPOINT_MINIMUM_BORDER_COVERAGE = 0.035

const ENDPOINT_MINIMUM_LONG_SPAN = 0.5

const BRIDGE_MINIMUM_POPULATION = 0.00002

const BRIDGE_MINIMUM_COMPONENT_FAMILY_FRACTION = 0.01

const BRIDGE_MINIMUM_LONG_SPAN = 0.005

const BRIDGE_MINIMUM_FIELD_SCORE = 0.04

const MINIMUM_ENDPOINT_SEPARATION = 0.38

const MINIMUM_ENDPOINT_DISTANCE = 0.08

const MINIMUM_DOMAIN_POPULATION = 0.16

const MINIMUM_DOMAIN_BORDER_COVERAGE = 0.2

const MAXIMUM_BRANCHING = 0.4

const MAXIMUM_STAGES = 16

const MAXIMUM_ENDPOINT_REGIONS = 12

const MAXIMUM_RADIAL_CENTER_REGIONS = 4

const MAXIMUM_RADIAL_OUTER_REGIONS = 6

function clamp(value: number, minimum = 0, maximum = 1): number {
	return Math.max(minimum, Math.min(maximum, value))
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function quadrantCoverage(bits: number): number {
	return ((bits & 1 ? 1 : 0) + (bits & 2 ? 1 : 0) + (bits & 4 ? 1 : 0) + (bits & 8 ? 1 : 0)) / 4
}

function regionCentroid(node: RegionNode): readonly [number, number] {
	return [node.sumX / node.population, node.sumY / node.population]
}

function radialCenterEligible(evidence: NativePaletteEvidence, node: RegionNode): boolean {
	const populationFraction = node.population / evidence.pixelCount
	const widthFraction = (node.maxX - node.minX + 1) / evidence.width
	const heightFraction = (node.maxY - node.minY + 1) / evidence.height
	const aspect = Math.min(widthFraction, heightFraction) / Math.max(widthFraction, heightFraction)
	const fill = node.population / Math.max(1,
		(node.maxX - node.minX + 1) * (node.maxY - node.minY + 1))
	const [x, y] = regionCentroid(node)
	return populationFraction >= 0.0035 && populationFraction <= 0.16 &&
		node.family.fieldScore >= ENDPOINT_MINIMUM_FIELD_SCORE &&
		node.population / node.family.population >= ENDPOINT_MINIMUM_COMPONENT_FAMILY_FRACTION &&
		node.borderPixels / Math.max(1, evidence.width * 2 + evidence.height * 2 - 4) <= 0.02 &&
		Math.min(widthFraction, heightFraction) >= 0.05 &&
		Math.max(widthFraction, heightFraction) <= 0.55 &&
		aspect >= 0.72 && fill >= 0.48 && quadrantCoverage(node.quadrants) >= 0.5 &&
		x >= 0.12 && x <= 0.88 && y >= 0.12 && y <= 0.88
}

/**
 * One region graph per evidence object.
 *
 * `discoverNativeFieldTransitions` and `discoverSupportedNativeFieldTransitionPaths` are both
 * called once per extraction on the *same* `NativePaletteEvidence` — `common.evidence.native` — and
 * each of them opened by flooding the whole image into regions from scratch. The graph is a pure
 * function of the evidence, and nothing outside `buildRegionGraph` writes to it: every consumer
 * either reads, or copies before sorting (`[...graph.edgesByNode[i]].sort(...)`), and the graph
 * never leaves this module. So the second build was doing identical work for an identical answer.
 *
 * A `WeakMap` keyed on the evidence object cannot affect determinism — it is never iterated, and a
 * hit returns the very object the miss would have constructed — and it lets the graph be collected
 * with the evidence rather than pinning it for the process lifetime.
 */
const regionGraphCache = new WeakMap<NativePaletteEvidence, RegionGraph>()

function buildRegionGraph(evidence: NativePaletteEvidence): RegionGraph {
	const cached = regionGraphCache.get(evidence)
	if (cached) return cached
	const built = computeRegionGraph(evidence)
	regionGraphCache.set(evidence, built)
	return built
}

function computeRegionGraph(evidence: NativePaletteEvidence): RegionGraph {
	const regionAt = new Int32Array(evidence.pixelCount).fill(-1)
	const queue = new Int32Array(evidence.pixelCount)
	const nodes: RegionNode[] = []
	const widthDenominator = Math.max(1, evidence.width - 1)
	const heightDenominator = Math.max(1, evidence.height - 1)
	const cornerWidth = Math.max(1, Math.ceil(evidence.width * 0.15))
	const cornerHeight = Math.max(1, Math.ceil(evidence.height * 0.15))
	const perimeter = Math.max(1, evidence.width * 2 + evidence.height * 2 - 4)
	// Loop-invariant reads and comparisons, hoisted out of the two per-pixel loops below.
	const width = evidence.width
	const height = evidence.height
	const labs = evidence.labs
	const familyAt = evidence.familyAt
	const lastX = width - 1
	const lastY = height - 1
	const halfWidth = width / 2
	const halfHeight = height / 2
	const rightCornerX = width - cornerWidth
	const bottomCornerY = height - cornerHeight

	for (let start = 0; start < evidence.pixelCount; start++) {
		if (regionAt[start] >= 0) continue
		const familyIndex = evidence.familyAt[start]
		let queueRead = 0
		let queueLength = 1
		queue[0] = start
		regionAt[start] = nodes.length
		const node: RegionNode = {
			index: nodes.length,
			id: `${evidence.families[familyIndex].id}-transition-region-${start}`,
			familyIndex,
			family: evidence.families[familyIndex],
			start,
			population: 0,
			minX: evidence.width,
			minY: evidence.height,
			maxX: 0,
			maxY: 0,
			borderPixels: 0,
			quadrants: 0,
			cornerCounts: [0, 0, 0, 0],
			sumX: 0,
			sumY: 0,
			sumL: 0,
			sumA: 0,
			sumB: 0,
			endpointRejectionReasons: [],
		}
		// Accumulate into locals rather than through the node object: these are the innermost
		// writes in the whole extraction, and `node` is a plain mutable record V8 must re-check
		// on every store. Flushed back below in the same order they were summed.
		let population = 0
		let minX = node.minX
		let minY = node.minY
		let maxX = node.maxX
		let maxY = node.maxY
		let borderPixels = 0
		let quadrants = 0
		let sumX = 0
		let sumY = 0
		let sumL = 0
		let sumA = 0
		let sumB = 0
		const cornerCounts = node.cornerCounts
		while (queueRead < queueLength) {
			const pixelIndex = queue[queueRead++]
			const x = pixelIndex % width
			const y = (pixelIndex / width) | 0
			const labOffset = pixelIndex * 3
			population += 1
			if (x < minX) minX = x
			if (y < minY) minY = y
			if (x > maxX) maxX = x
			if (y > maxY) maxY = y
			sumX += x / widthDenominator
			sumY += y / heightDenominator
			sumL += labs[labOffset]
			sumA += labs[labOffset + 1]
			sumB += labs[labOffset + 2]
			if (x === 0 || y === 0 || x === lastX || y === lastY) borderPixels += 1
			quadrants |= 1 << ((x >= halfWidth ? 1 : 0) + (y >= halfHeight ? 2 : 0))
			if (x < cornerWidth && y < cornerHeight) cornerCounts[0] += 1
			if (x >= rightCornerX && y < cornerHeight) cornerCounts[1] += 1
			if (x < cornerWidth && y >= bottomCornerY) cornerCounts[2] += 1
			if (x >= rightCornerX && y >= bottomCornerY) cornerCounts[3] += 1
			// Unrolled in the original left/right/up/down order: visit order sets the queue order,
			// which sets each region's `start` and therefore its id.
			for (let direction = 0; direction < 4; direction++) {
				const neighbor = direction === 0
					? (x > 0 ? pixelIndex - 1 : -1)
					: direction === 1
						? (x < lastX ? pixelIndex + 1 : -1)
						: direction === 2
							? (y > 0 ? pixelIndex - width : -1)
							: (y < lastY ? pixelIndex + width : -1)
				if (neighbor < 0 || regionAt[neighbor] >= 0 || familyAt[neighbor] !== familyIndex) continue
				regionAt[neighbor] = node.index
				queue[queueLength++] = neighbor
			}
		}
		node.population = population
		node.minX = minX
		node.minY = minY
		node.maxX = maxX
		node.maxY = maxY
		node.borderPixels = borderPixels
		node.quadrants = quadrants
		node.sumX = sumX
		node.sumY = sumY
		node.sumL = sumL
		node.sumA = sumA
		node.sumB = sumB

		const populationFraction = node.population / evidence.pixelCount
		const componentFamilyFraction = node.population / node.family.population
		const borderCoverage = node.borderPixels / perimeter
		const widthFraction = (node.maxX - node.minX + 1) / evidence.width
		const heightFraction = (node.maxY - node.minY + 1) / evidence.height
		if (populationFraction < ENDPOINT_MINIMUM_POPULATION) {
			node.endpointRejectionReasons.push("region population below broad endpoint support")
		}
		if (node.family.fieldScore < ENDPOINT_MINIMUM_FIELD_SCORE) {
			node.endpointRejectionReasons.push("family field support below endpoint minimum")
		}
		if (componentFamilyFraction < ENDPOINT_MINIMUM_COMPONENT_FAMILY_FRACTION) {
			node.endpointRejectionReasons.push("family support is fragmented across regions")
		}
		if (borderCoverage < ENDPOINT_MINIMUM_BORDER_COVERAGE) {
			node.endpointRejectionReasons.push("region lacks broad perimeter support")
		}
		if (!node.cornerCounts.some((count) => count >= cornerWidth * cornerHeight * 0.25)) {
			node.endpointRejectionReasons.push("region owns no corner endpoint field")
		}
		if (Math.max(widthFraction, heightFraction) < ENDPOINT_MINIMUM_LONG_SPAN) {
			node.endpointRejectionReasons.push("region span is object-local")
		}
		nodes.push(node)
	}

	type MutableEdge = { key: string; first: number; second: number; boundaryEdges: number; localStepSum: number }
	// Keyed on the packed region pair instead of `"first:second"`. The string key is still what the
	// edge carries and still what the sort below orders on — it is just built once per distinct
	// edge now, rather than once per boundary pixel pair, of which a busy artwork has millions.
	const nodeCount = nodes.length
	const mutableEdges = new Map<number, MutableEdge>()
	const addEdge = (firstRegion: number, secondRegion: number, localStep: number): void => {
		const first = firstRegion < secondRegion ? firstRegion : secondRegion
		const second = firstRegion < secondRegion ? secondRegion : firstRegion
		const packed = first * nodeCount + second
		const existing = mutableEdges.get(packed)
		if (existing) {
			existing.boundaryEdges += 1
			existing.localStepSum += localStep
		} else {
			mutableEdges.set(packed, { key: `${first}:${second}`, first, second, boundaryEdges: 1, localStepSum: localStep })
		}
	}
	// Same raster scan, same right-then-down neighbour order: `localStepSum` accumulates in the
	// original sequence, and re-associating a float sum would move the low bits of `meanLocalStep`.
	for (let y = 0; y < height; y++) {
		const rowOffset = y * width
		for (let x = 0; x < width; x++) {
			const pixelIndex = rowOffset + x
			const region = regionAt[pixelIndex]
			const labOffset = pixelIndex * 3
			for (let direction = 0; direction < 2; direction++) {
				const neighbor = direction === 0
					? (x < lastX ? pixelIndex + 1 : -1)
					: (y < lastY ? pixelIndex + width : -1)
				if (neighbor < 0) continue
				const neighborRegion = regionAt[neighbor]
				if (region === neighborRegion) continue
				const neighborOffset = neighbor * 3
				// Same three subtractions in the same order as `okDistance(labAt(a), labAt(b))`.
				addEdge(region, neighborRegion, Math.hypot(
					labs[labOffset] - labs[neighborOffset],
					labs[labOffset + 1] - labs[neighborOffset + 1],
					labs[labOffset + 2] - labs[neighborOffset + 2],
				))
			}
		}
	}
	const edges = [...mutableEdges.values()].map((edge): RegionEdge => ({
		key: edge.key,
		first: edge.first,
		second: edge.second,
		boundaryEdges: edge.boundaryEdges,
		meanLocalStep: edge.localStepSum / edge.boundaryEdges,
	})).sort((first, second) => compareAscii(first.key, second.key))
	const edgesByNode: RegionEdge[][] = Array.from({ length: nodes.length }, () => [])
	for (const edge of edges) {
		edgesByNode[edge.first].push(edge)
		edgesByNode[edge.second].push(edge)
	}
	return { nodes, edges, edgesByNode, regionAt }
}

function publicRegionEvidence(evidence: NativePaletteEvidence, node: RegionNode): FieldTransitionRegionEvidence {
	const perimeter = Math.max(1, evidence.width * 2 + evidence.height * 2 - 4)
	return {
		id: node.id,
		familyId: node.family.id,
		startPixelIndex: node.start,
		population: node.population,
		populationFraction: node.population / evidence.pixelCount,
		componentFamilyFraction: node.population / node.family.population,
		borderCoverage: node.borderPixels / perimeter,
		quadrantCoverage: quadrantCoverage(node.quadrants),
		centroid: regionCentroid(node),
		widthFraction: (node.maxX - node.minX + 1) / evidence.width,
		heightFraction: (node.maxY - node.minY + 1) / evidence.height,
		endpointEligible: node.endpointRejectionReasons.length === 0,
		radialCenterEligible: radialCenterEligible(evidence, node),
		endpointRejectionReasons: node.endpointRejectionReasons,
	}
}

function endpointScore(evidence: NativePaletteEvidence, node: RegionNode): number {
	const [x, y] = regionCentroid(node)
	const perimeter = Math.max(1, evidence.width * 2 + evidence.height * 2 - 4)
	return 0.35 * node.family.fieldScore +
		0.25 * clamp(node.population / evidence.pixelCount / 0.18) +
		0.2 * clamp(node.borderPixels / perimeter / 0.2) +
		0.2 * clamp(Math.hypot(x - 0.5, y - 0.5) / 0.5)
}

function radialCenterScore(evidence: NativePaletteEvidence, node: RegionNode): number {
	const widthFraction = (node.maxX - node.minX + 1) / evidence.width
	const heightFraction = (node.maxY - node.minY + 1) / evidence.height
	const fill = node.population / Math.max(1,
		(node.maxX - node.minX + 1) * (node.maxY - node.minY + 1))
	return 0.3 * node.family.fieldScore +
		0.25 * (node.population / node.family.population) +
		0.2 * fill +
		0.15 * (1 - clamp(Math.max(widthFraction, heightFraction) / 0.55)) +
		0.1 * clamp(node.population / evidence.pixelCount / 0.04)
}

function edgeOther(edge: RegionEdge, nodeIndex: number): number {
	return edge.first === nodeIndex ? edge.second : edge.first
}

function transitionDirection(first: RegionNode, second: RegionNode):
	"horizontal" | "vertical" | "diagonal-down" | "diagonal-up" {
	const [firstX, firstY] = regionCentroid(first)
	const [secondX, secondY] = regionCentroid(second)
	const deltaX = secondX - firstX
	const deltaY = secondY - firstY
	if (Math.abs(deltaX) >= Math.abs(deltaY) * 1.75) return "horizontal"
	if (Math.abs(deltaY) >= Math.abs(deltaX) * 1.75) return "vertical"
	return deltaX * deltaY >= 0 ? "diagonal-down" : "diagonal-up"
}

function radialGeometry(center: readonly [number, number]): TransitionGeometry {
	if (Math.hypot(center[0] - 0.5, center[1] - 0.5) <= 0.08) {
		return { topology: "radial-center", direction: "center-out", center }
	}
	if (Math.abs(center[0] - 0.5) <= 0.1 && center[1] >= 0.2 && center[1] <= 0.44) {
		return { topology: "radial-upper-center", direction: "center-out", center }
	}
	const directions = [
		{ direction: "center-0.35-0.50" as const, center: [0.35, 0.5] as const },
		{ direction: "center-0.65-0.50" as const, center: [0.65, 0.5] as const },
		{ direction: "center-0.50-0.65" as const, center: [0.5, 0.65] as const },
	].sort((first, second) =>
		Math.hypot(center[0] - first.center[0], center[1] - first.center[1]) -
		Math.hypot(center[0] - second.center[0], center[1] - second.center[1]) ||
		compareAscii(first.direction, second.direction))
	return { topology: "radial-offset", direction: directions[0].direction, center }
}

// `roleOwnershipProfile` and `assignFieldRoles` used to exist here as a verbatim second copy of
// `palette-core.ts`'s pair, differing only in writing `RANKING_EVIDENCE_RESOLUTION` as a bare
// `0.04` twice. Two copies of the rule that decides which family is the background is a latent
// divergence, and the background-fidelity arm made it a live one: a repair applied to one copy
// would silently leave the transition path deciding the old way. The duplicate is deleted and the
// export is imported instead; `clamp` and the resolution literal were identical, so this is
// behaviour-preserving on its own.

function exactRepresentatives(family: ColorFamilyEvidence): ColorRepresentative[] {
	const strategyOrder: Record<ColorRepresentative["strategy"], number> = {
		"dense-exact": 0,
		"nearest-prototype": 1,
		"density-synthesized": 2,
		"generated-emergency": 3,
	}
	return family.representatives.filter((representative) =>
		!("generated" in representative.support) && representative.support.exactSource)
		.sort((first, second) => strategyOrder[first.strategy] - strategyOrder[second.strategy] ||
			compareAscii(first.hex, second.hex))
}

function candidateForEndpoints(
	evidence: NativePaletteEvidence,
	graph: RegionGraph,
	first: RegionNode,
	second: RegionNode,
	geometry: TransitionGeometry,
): TransitionCandidate {
	const firstCentroid = regionCentroid(first)
	const secondCentroid = regionCentroid(second)
	const axisX = secondCentroid[0] - firstCentroid[0]
	const axisY = secondCentroid[1] - firstCentroid[1]
	const axisLengthSquared = axisX ** 2 + axisY ** 2
	const axisLength = Math.sqrt(axisLengthSquared)
	const endpointDelta: OKLab = [
		second.family.prototype[0] - first.family.prototype[0],
		second.family.prototype[1] - first.family.prototype[1],
		second.family.prototype[2] - first.family.prototype[2],
	]
	const endpointDistance = okDistance(first.family.prototype, second.family.prototype)
	const linearPosition = (node: RegionNode): number => {
		const [x, y] = regionCentroid(node)
		return axisLengthSquared <= 1e-12
			? 0
			: ((x - firstCentroid[0]) * axisX + (y - firstCentroid[1]) * axisY) / axisLengthSquared
	}
	const radialExtent = (node: RegionNode): number => {
		if (!geometry.center) return 0
		const corners = [
			[node.minX / Math.max(1, evidence.width - 1), node.minY / Math.max(1, evidence.height - 1)],
			[node.maxX / Math.max(1, evidence.width - 1), node.minY / Math.max(1, evidence.height - 1)],
			[node.minX / Math.max(1, evidence.width - 1), node.maxY / Math.max(1, evidence.height - 1)],
			[node.maxX / Math.max(1, evidence.width - 1), node.maxY / Math.max(1, evidence.height - 1)],
		]
		return Math.max(...corners.map(([x, y]) => Math.hypot(x - geometry.center![0], y - geometry.center![1])))
	}
	const centerExtent = radialExtent(first)
	const outerExtent = radialExtent(second)
	const radialSpan = outerExtent - centerExtent
	const position = geometry.topology === "linear"
		? linearPosition
		: (node: RegionNode): number => radialSpan <= 1e-12 ? 0 : (radialExtent(node) - centerExtent) / radialSpan
	// The same two geometries, evaluated at a pixel instead of at a region centroid.
	const pixelPosition = geometry.topology === "linear"
		? (x: number, y: number): number => axisLengthSquared <= 1e-12
			? 0
			: ((x - firstCentroid[0]) * axisX + (y - firstCentroid[1]) * axisY) / axisLengthSquared
		: (x: number, y: number): number => geometry.center === null || radialSpan <= 1e-12
			? 0
			: (Math.hypot(x - geometry.center[0], y - geometry.center[1]) - centerExtent) / radialSpan
	const colorPosition = (node: RegionNode): number => endpointDistance <= 1e-12 ? 0 : (
		(node.family.prototype[0] - first.family.prototype[0]) * endpointDelta[0] +
		(node.family.prototype[1] - first.family.prototype[1]) * endpointDelta[1] +
		(node.family.prototype[2] - first.family.prototype[2]) * endpointDelta[2]
	) / endpointDistance ** 2
	const localStepLimit = Math.max(0.028, evidence.familyBinStep * 0.9)
	const minimumBoundaryEdges = 2
	const nodeEligible = (node: RegionNode): boolean => node.index === first.index || node.index === second.index || (
		node.population / evidence.pixelCount >= BRIDGE_MINIMUM_POPULATION &&
		node.population / node.family.population >= BRIDGE_MINIMUM_COMPONENT_FAMILY_FRACTION &&
		node.family.fieldScore >= BRIDGE_MINIMUM_FIELD_SCORE &&
		Math.max(
			(node.maxX - node.minX + 1) / evidence.width,
			(node.maxY - node.minY + 1) / evidence.height,
		) >= BRIDGE_MINIMUM_LONG_SPAN
	)
	const edgeEligible = (edge: RegionEdge): boolean =>
		edge.meanLocalStep <= localStepLimit && edge.boundaryEdges >= minimumBoundaryEdges
	const candidateNodes = graph.nodes.filter(nodeEligible)
		.sort((left, right) => left.start - right.start)
	const candidateIndexes = new Set(candidateNodes.map(({ index }) => index))
	const predecessors = new Int32Array(graph.nodes.length).fill(-1)
	const visited = new Uint8Array(graph.nodes.length)
	const queue: number[] = [first.index]
	visited[first.index] = 1
	for (let queueIndex = 0; queueIndex < queue.length && !visited[second.index]; queueIndex++) {
		const node = graph.nodes[queue[queueIndex]]
		const edges = [...graph.edgesByNode[node.index]].sort((left, right) => {
			const leftNode = graph.nodes[edgeOther(left, node.index)]
			const rightNode = graph.nodes[edgeOther(right, node.index)]
			return left.meanLocalStep - right.meanLocalStep ||
				right.boundaryEdges - left.boundaryEdges || leftNode.start - rightNode.start
		})
		for (const edge of edges) {
			const nextIndex = edgeOther(edge, node.index)
			if (visited[nextIndex] || !candidateIndexes.has(nextIndex) || !edgeEligible(edge)) continue
			visited[nextIndex] = 1
			predecessors[nextIndex] = node.index
			queue.push(nextIndex)
		}
	}

	const reversedPath: RegionNode[] = []
	if (visited[second.index]) {
		let current = second.index
		while (current >= 0) {
			reversedPath.push(graph.nodes[current])
			if (current === first.index) break
			current = predecessors[current]
		}
	}
	const path = reversedPath.at(-1)?.index === first.index ? reversedPath.reverse() : []
	const pathEdges: RegionEdge[] = []
	for (let index = 1; index < path.length; index++) {
		const key = `${Math.min(path[index - 1].index, path[index].index)}:${Math.max(path[index - 1].index, path[index].index)}`
		const edge = graph.edges.find((candidate) => candidate.key === key)
		if (edge) pathEdges.push(edge)
	}
	const summarizedNodes = path.length > 0 ? path : [first, second]
	const population = summarizedNodes.reduce((sum, node) => sum + node.population, 0)
	const populationFraction = population / evidence.pixelCount
	const perimeter = Math.max(1, evidence.width * 2 + evidence.height * 2 - 4)
	const borderPixels = summarizedNodes.reduce((sum, node) => sum + node.borderPixels, 0)
	const borderCoverage = clamp(borderPixels / perimeter)
	const quadrants = summarizedNodes.reduce((bits, node) => bits | node.quadrants, 0)
	const cornerCounts = [0, 1, 2, 3].map((corner) =>
		summarizedNodes.reduce((sum, node) => sum + node.cornerCounts[corner], 0))
	const cornerPopulation = Math.max(1, Math.ceil(evidence.width * 0.15) * Math.ceil(evidence.height * 0.15))
	const ownedCornerCount = cornerCounts.filter((count) => count >= cornerPopulation * 0.5).length
	const sourceStagePositions = path.map(position)
	const stagePositions = sourceStagePositions.map((value, index) =>
		index === 0 ? 0 : index === sourceStagePositions.length - 1 ? 1 : clamp(value))
	const spatialGaps = sourceStagePositions.slice(1).map((value, index) => value - sourceStagePositions[index])
	const maximumSpatialGap = spatialGaps.length > 0 ? Math.max(...spatialGaps.map(Math.abs)) : 1
	let forwardSpatial = 0
	let backwardSpatial = 0
	for (const delta of spatialGaps) {
		if (delta >= 0) forwardSpatial += delta
		else backwardSpatial -= delta
	}
	const spatialMonotonicity = forwardSpatial + backwardSpatial <= 1e-12
		? 0
		: forwardSpatial / (forwardSpatial + backwardSpatial)
	const spatialPathLength = path.slice(1).reduce((sum, node, index) => {
		if (geometry.topology !== "linear") {
			return sum + Math.abs(sourceStagePositions[index + 1] - sourceStagePositions[index])
		}
		const previous = regionCentroid(path[index])
		const current = regionCentroid(node)
		return sum + Math.hypot(current[0] - previous[0], current[1] - previous[1])
	}, 0)
	const spatialDirectness = spatialPathLength <= 1e-12
		? 0
		: clamp((geometry.topology === "linear" ? axisLength : 1) / spatialPathLength)
	const spatialProgression = Math.sqrt(spatialMonotonicity * spatialDirectness)
	const colorPositions = path.map(colorPosition)
	let forwardColor = 0
	let backwardColor = 0
	for (let index = 1; index < colorPositions.length; index++) {
		const delta = colorPositions[index] - colorPositions[index - 1]
		if (delta >= 0) forwardColor += delta
		else backwardColor -= delta
	}
	const colorProgression = forwardColor + backwardColor <= 1e-12
		? 0
		: clamp(forwardColor / (forwardColor + backwardColor))
	const pathColorLength = path.slice(1).reduce((sum, node, index) =>
		sum + okDistance(path[index].family.prototype, node.family.prototype), 0)
	const colorDirectness = pathColorLength <= 1e-12 ? 0 : clamp(endpointDistance / pathColorLength)
	const maximumLocalStep = pathEdges.length > 0 ? Math.max(...pathEdges.map(({ meanLocalStep }) => meanLocalStep)) : localStepLimit
	const localContinuity = clamp(1 - maximumLocalStep / localStepLimit)
	const pathIndexes = new Set(path.map(({ index }) => index))
	const pathEdgeKeys = new Set(pathEdges.map(({ key }) => key))
	const countedEdges = new Set<string>()
	const materialBranchBoundary = Math.max(2, Math.min(evidence.width, evidence.height) * 0.02)
	let pathBoundary = 0
	let branchBoundary = 0
	for (const node of path) {
		for (const edge of graph.edgesByNode[node.index]) {
			if (countedEdges.has(edge.key) || !edgeEligible(edge)) continue
			const other = graph.nodes[edgeOther(edge, node.index)]
			if (!candidateIndexes.has(other.index) || !nodeEligible(other)) continue
			countedEdges.add(edge.key)
			if (pathEdgeKeys.has(edge.key) && pathIndexes.has(other.index)) pathBoundary += edge.boundaryEdges
			else if (
				edge.boundaryEdges >= materialBranchBoundary &&
				other.population / evidence.pixelCount >= 0.005 &&
				other.population / other.family.population >= 0.4 &&
				Math.max(
					(other.maxX - other.minX + 1) / evidence.width,
					(other.maxY - other.minY + 1) / evidence.height,
				) >= 0.16
			) {
				branchBoundary += edge.boundaryEdges
			}
		}
	}
	const branching = branchBoundary / Math.max(1, pathBoundary + branchBoundary)
	const familyIds = [...new Set(summarizedNodes.map(({ family }) => family.id))].sort(compareAscii)
	const bridgeFamilyIds = [...new Set(path.slice(1, -1).map(({ family }) => family.id))]
	const transitionPopulation = path.slice(1, -1).reduce((sum, node) => sum + node.population, 0)
	const weightedFieldScore = summarizedNodes.reduce((sum, node) =>
		sum + node.family.fieldScore * node.population, 0) / population
	const radialCenterContainment = geometry.center === null || path.length === 0
		? 1
		: path.filter((node) =>
			geometry.center![0] >= node.minX / Math.max(1, evidence.width - 1) - 0.03 &&
			geometry.center![0] <= node.maxX / Math.max(1, evidence.width - 1) + 0.03 &&
			geometry.center![1] >= node.minY / Math.max(1, evidence.height - 1) - 0.03 &&
			geometry.center![1] <= node.maxY / Math.max(1, evidence.height - 1) + 0.03).length / path.length
	const rejectionReasons: string[] = []
	if ((geometry.topology === "linear" ? axisLength : radialSpan) < MINIMUM_ENDPOINT_SEPARATION) {
		rejectionReasons.push("endpoint regions lack broad spatial separation")
	}
	if (endpointDistance < MINIMUM_ENDPOINT_DISTANCE) rejectionReasons.push("endpoint families lack material perceptual separation")
	if (path.length === 0) rejectionReasons.push("no source-connected low-step spatial progression joins the endpoints")
	if (path.length > 0 && path.length < 3) rejectionReasons.push("transition has no supported intermediate family")
	if (path.length > MAXIMUM_STAGES) rejectionReasons.push("transition path exceeds the low-branching stage bound")
	if (populationFraction < MINIMUM_DOMAIN_POPULATION) rejectionReasons.push("transition path population is not a broad field")
	if (borderCoverage < MINIMUM_DOMAIN_BORDER_COVERAGE) rejectionReasons.push("transition path lacks broad perimeter coverage")
	if (quadrantCoverage(quadrants) < 0.75) rejectionReasons.push("transition path covers fewer than three quadrants")
	if (geometry.topology === "linear" && ownedCornerCount < 2) {
		rejectionReasons.push("transition path owns fewer than two corner fields")
	}
	if (geometry.topology !== "linear" && (
		populationFraction < 0.65 || borderCoverage < 0.25 || quadrantCoverage(quadrants) < 1
	)) rejectionReasons.push("radial transition lacks a broad four-quadrant field envelope")
	if (weightedFieldScore < 0.32) rejectionReasons.push("transition path has weak aggregate field support")
	if (maximumSpatialGap > 0.58) rejectionReasons.push("transition stages leave a large spatial discontinuity")
	if (geometry.topology !== "linear" && radialCenterContainment < 0.8) {
		rejectionReasons.push("radial transition stages do not share a source-supported center")
	}
	if (colorProgression < 0.72) rejectionReasons.push("transition family sequence reverses perceptual progression")
	if (colorDirectness < 0.45) rejectionReasons.push("transition family sequence is perceptually circuitous")
	if (branching > MAXIMUM_BRANCHING) rejectionReasons.push("transition region graph branches into competing structures")
	if (path.length > 0 && transitionPopulation / population <
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_TRANSITION_MINIMUM_POPULATION_FRACTION) {
		rejectionReasons.push("intermediate families lack broad transition coverage")
	}
	const canonicalStarts = [first.start, second.start].sort((left, right) => left - right)
	const domainId = geometry.topology === "linear"
		? `field-transition-domain:${canonicalStarts[0]}:${canonicalStarts[1]}`
		: `field-transition-domain:${geometry.topology}:${canonicalStarts[0]}:${canonicalStarts[1]}`
	const domain: BackgroundFieldDomainEvidence = {
		id: domainId,
		kind: "connected",
		sourceDomainIds: [],
		startPixelIndex: canonicalStarts[0],
		population,
		populationFraction,
		borderPixels,
		borderCoverage,
		quadrantCoverage: quadrantCoverage(quadrants),
		ownedCornerCount,
		weightedFieldScore,
		centroid: [
			summarizedNodes.reduce((sum, node) => sum + node.sumX, 0) / population,
			summarizedNodes.reduce((sum, node) => sum + node.sumY, 0) / population,
		],
		meanColor: [
			summarizedNodes.reduce((sum, node) => sum + node.sumL, 0) / population,
			summarizedNodes.reduce((sum, node) => sum + node.sumA, 0) / population,
			summarizedNodes.reduce((sum, node) => sum + node.sumB, 0) / population,
		],
		transitionFamilyCount: bridgeFamilyIds.length,
		transitionPopulationFraction: transitionPopulation / population,
		transitionQuadrantCoverage: quadrantCoverage(path.slice(1, -1).reduce((bits, node) => bits | node.quadrants, 0)),
		familyIds,
		componentIds: summarizedNodes.map(({ id }) => id),
		eligible: rejectionReasons.length === 0,
		rejectionReasons,
	}
	return {
		domain,
		path,
		stageColorPositions: colorPositions,
		pixelPosition,
		trace: {
			fieldDomainId: domainId,
			topology: geometry.topology,
			direction: geometry.direction,
			spatialCenter: geometry.center,
			endpointFamilyIds: [first.family.id, second.family.id],
			stageFamilyIds: path.map(({ family }) => family.id),
			stageRegionIds: path.map(({ id }) => id),
			stagePositions,
			edgeLocalSteps: pathEdges.map(({ meanLocalStep }) => meanLocalStep),
			endpointDistance,
			spatialProgression,
			colorProgression,
			colorDirectness,
			localContinuity,
			branching,
			eligible: rejectionReasons.length === 0,
			rejectionReasons,
		},
	}
}

/**
 * The spatial spread, inside this transition's endpoint band, of each candidate
 * representative's colour bin — the statistic the seed gradient fit publishes, measured
 * over the transition's own domain and its own declared endpoint interval.
 *
 * The band is cut exactly as the seed fit cuts its: the path regions are the domain, the
 * candidate's geometry gives each pixel a position, the declared endpoint interval gives
 * the cut, and only pixels of the endpoint's own family count. Representatives are matched
 * by colour, so a colour the band does not carry reports `null` — not measured — rather
 * than a zero the comparators would read as a real, and losing, measurement.
 */
function endpointBandSpreads(
	evidence: NativePaletteEvidence,
	graph: RegionGraph,
	candidate: TransitionCandidate,
	node: RegionNode,
	band: "low" | "high",
	representatives: readonly ColorRepresentative[],
): readonly (number | null)[] {
	const [low, high] = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_TRANSITION_ENDPOINT_INTERVAL
	const pathRegions = new Set(candidate.path.map(({ index }) => index))
	const spread = createBandSpatialSpreadAccumulator((lab) => quantizedKey(lab, evidence.familyBinStep))
	const widthDenominator = Math.max(1, evidence.width - 1)
	const heightDenominator = Math.max(1, evidence.height - 1)
	for (let pixelIndex = 0; pixelIndex < evidence.pixelCount; pixelIndex++) {
		if (evidence.familyAt[pixelIndex] !== node.familyIndex) continue
		if (!pathRegions.has(graph.regionAt[pixelIndex])) continue
		const x = (pixelIndex % evidence.width) / widthDenominator
		const y = Math.floor(pixelIndex / evidence.width) / heightDenominator
		const position = candidate.pixelPosition(x, y)
		if (band === "low" ? position > low : position < high) continue
		spread.add(labAt(evidence.labs, pixelIndex), x, y)
	}
	const lookup = spread.finish()
	return representatives.map(({ oklab }) => lookup.spreadFor(oklab))
}

function hypothesisForCandidate(
	evidence: NativePaletteEvidence,
	graph: RegionGraph,
	candidate: TransitionCandidate,
): FieldHypothesis | null {
	if (!candidate.domain.eligible || candidate.path.length < 3) return null
	const firstNode = candidate.path[0]
	const secondNode = candidate.path.at(-1)!
	const firstRepresentatives = exactRepresentatives(firstNode.family)
	const secondRepresentatives = exactRepresentatives(secondNode.family)
	if (firstRepresentatives.length === 0 || secondRepresentatives.length === 0) return null
	const roleAssignment = assignFieldRoles(firstNode.family, secondNode.family)
	const backgroundIsFirst = roleAssignment.backgroundFamilyId === firstNode.family.id
	const background = backgroundIsFirst ? firstNode : secondNode
	const surface = backgroundIsFirst ? secondNode : firstNode
	const backgroundRepresentatives = backgroundIsFirst ? firstRepresentatives : secondRepresentatives
	const surfaceRepresentatives = backgroundIsFirst ? secondRepresentatives : firstRepresentatives
	const trace = candidate.trace
	const residual = trace.endpointDistance * (1 - trace.colorDirectness)
	const progression = Math.min(trace.spatialProgression, trace.colorProgression)
	const fieldFidelity = clamp(
		0.3 * candidate.domain.weightedFieldScore +
		0.25 * candidate.domain.populationFraction +
		0.2 * progression +
		0.15 * trace.localContinuity +
		0.1 * (1 - trace.branching),
	)
	return {
		id: `field-transition:${candidate.domain.id}:${background.family.id}:${surface.family.id}`,
		kind: "gradient-field",
		backgroundFamilyId: background.family.id,
		surfaceFamilyId: surface.family.id,
		backgroundRepresentatives,
		surfaceRepresentatives,
		endpointBandSpread: {
			background: endpointBandSpreads(evidence, graph, candidate, background,
				backgroundIsFirst ? "low" : "high", backgroundRepresentatives),
			surface: endpointBandSpreads(evidence, graph, candidate, surface,
				backgroundIsFirst ? "high" : "low", surfaceRepresentatives),
		},
		fieldFidelity,
		surfaceContribution: clamp(
			0.35 * progression + 0.25 * trace.colorDirectness +
			0.2 * clamp(trace.endpointDistance / 0.2) + 0.2 * candidate.domain.transitionPopulationFraction,
		),
		spatialRelation: null,
		roleAssignment,
		gradientEvidence: {
			topology: trace.topology,
			direction: trace.direction,
			endpointBands: [0.15, 0.85],
			// Transition paths earn their midpoint through the supported-path evaluation instead.
			fieldMidpoint: null,
			progression,
			modeProgression: clamp((candidate.path.length - 2) / 5),
			monotonicity: (trace.spatialProgression + trace.colorProgression) / 2,
			residual,
			span: trace.endpointDistance,
			texture: Math.max(...trace.edgeLocalSteps),
			bandDispersion: trace.branching,
			edgeContinuity: trace.localContinuity,
			coverage: candidate.domain.populationFraction,
			supportingFamilyIds: [firstNode.family.id, secondNode.family.id],
			supportingEndpointHexes: [firstRepresentatives[0].hex, secondRepresentatives[0].hex],
			backgroundTopologyEndpoint: backgroundIsFirst ? "low" : "high",
			roleAssignment,
			fieldDomainId: candidate.domain.id,
			fieldDomainPopulationFraction: candidate.domain.populationFraction,
			fieldDomainBorderCoverage: candidate.domain.borderCoverage,
			fieldDomainOwnedCornerCount: candidate.domain.ownedCornerCount,
			supportingComponentIds: candidate.domain.componentIds,
		},
		pruningNotes: [
			`retained from ${candidate.path.length}-stage connected transition-region progression`,
			`intermediate families cover ${(candidate.domain.transitionPopulationFraction * 100).toFixed(1)}% of the field domain`,
		],
	}
}

function orderedTransitionCandidates(evidence: NativePaletteEvidence, graph: RegionGraph): TransitionCandidate[] {
	const endpoints = graph.nodes.filter(({ endpointRejectionReasons }) => endpointRejectionReasons.length === 0)
		.sort((first, second) => endpointScore(evidence, second) - endpointScore(evidence, first) || first.start - second.start)
		.slice(0, MAXIMUM_ENDPOINT_REGIONS)
	const radialCenters = graph.nodes.filter((node) => radialCenterEligible(evidence, node))
		.sort((first, second) => radialCenterScore(evidence, second) - radialCenterScore(evidence, first) || first.start - second.start)
		.slice(0, MAXIMUM_RADIAL_CENTER_REGIONS)
	const candidates: TransitionCandidate[] = []
	for (let firstIndex = 0; firstIndex < endpoints.length; firstIndex++) {
		for (let secondIndex = firstIndex + 1; secondIndex < endpoints.length; secondIndex++) {
			if (endpoints[firstIndex].family.id === endpoints[secondIndex].family.id) continue
			candidates.push(candidateForEndpoints(evidence, graph, endpoints[firstIndex], endpoints[secondIndex], {
				topology: "linear",
				direction: transitionDirection(endpoints[firstIndex], endpoints[secondIndex]),
				center: null,
			}))
		}
	}
	for (const center of radialCenters) {
		for (const outer of endpoints.slice(0, MAXIMUM_RADIAL_OUTER_REGIONS)) {
			if (center.family.id === outer.family.id) continue
			candidates.push(candidateForEndpoints(evidence, graph, center, outer, radialGeometry(regionCentroid(center))))
		}
	}
	return candidates.sort((first, second) =>
		Number(second.domain.eligible) - Number(first.domain.eligible) ||
		second.domain.populationFraction - first.domain.populationFraction ||
		second.trace.colorDirectness - first.trace.colorDirectness ||
		compareAscii(first.domain.id, second.domain.id))
}

function supportedPathEvidence(
	evidence: NativePaletteEvidence,
	graph: RegionGraph,
	candidate: TransitionCandidate,
): SupportedFieldTransitionPathEvidence {
	const domainPopulation = Math.max(1, candidate.domain.population)
	const stages = candidate.path.map((node, stageIndex): FieldTransitionPathStageEvidence => {
		const rgb = rgbAt(evidence.rgbData, node.start)
		return {
			stageIndex,
			familyId: node.family.id,
			regionId: node.id,
			spatialPosition: candidate.trace.stagePositions[stageIndex],
			colorPosition: candidate.stageColorPositions[stageIndex],
			population: node.population,
			populationFraction: node.population / domainPopulation,
			imagePopulationFraction: node.population / evidence.pixelCount,
			quadrantCoverage: quadrantCoverage(node.quadrants),
			prototype: node.family.prototype,
			exactColor: {
				rgb,
				oklab: rgbToOKLab(rgb),
				hex: rgbToHex(rgb),
				provenance: {
					exactSource: true,
					familyId: node.family.id,
					regionId: node.id,
					pixelIndex: node.start,
					x: node.start % evidence.width,
					y: Math.floor(node.start / evidence.width),
				},
			},
		}
	})
	const [minimumColorPosition, maximumColorPosition] =
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_TRANSITION_ENDPOINT_INTERVAL
	const acceptedNodes = candidate.path.slice(1, -1).filter((_, index) => {
		const colorPosition = candidate.stageColorPositions[index + 1]
		return colorPosition >= minimumColorPosition && colorPosition <= maximumColorPosition
	})
	const acceptedIndexes = new Set(acceptedNodes.map(({ index }) => index))
	const acceptedIntermediateSupport = stages.slice(1, -1).filter((stage) =>
		acceptedIndexes.has(candidate.path[stage.stageIndex].index))
	const transitionPopulation = acceptedNodes.reduce((sum, node) => sum + node.population, 0)
	const transitionPopulationFraction = transitionPopulation / domainPopulation
	const transitionFamilyCount = new Set(acceptedNodes.map(({ familyIndex }) => familyIndex)).size
	const transitionQuadrants = acceptedNodes.reduce((bits, node) => bits | node.quadrants, 0)
	const rejectionReasons = candidate.trace.rejectionReasons.filter((reason) =>
		reason !== "transition has no supported intermediate family" &&
		reason !== "intermediate families lack broad transition coverage")
	if (transitionFamilyCount === 0) {
		rejectionReasons.push("transition has no color-intermediate family inside the endpoint interval")
	}
	if (candidate.path.length > 0 && transitionPopulationFraction <
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_TRANSITION_MINIMUM_POPULATION_FRACTION) {
		rejectionReasons.push("color-intermediate families lack broad transition coverage")
	}
	return {
		fieldDomainId: candidate.domain.id,
		topology: candidate.trace.topology,
		direction: candidate.trace.direction,
		spatialCenter: candidate.trace.spatialCenter,
		endpointFamilyIds: candidate.trace.endpointFamilyIds,
		endpointInterval: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_TRANSITION_ENDPOINT_INTERVAL,
		stageFamilyIds: candidate.trace.stageFamilyIds,
		stageRegionIds: candidate.trace.stageRegionIds,
		stagePositions: candidate.trace.stagePositions,
		stageColorPositions: candidate.stageColorPositions,
		stagePopulationFractions: stages.map(({ populationFraction }) => populationFraction),
		stages,
		acceptedIntermediateSupport,
		transitionFamilyCount,
		transitionPopulationFraction,
		transitionQuadrantCoverage: quadrantCoverage(transitionQuadrants),
		connected: candidate.path.length >= 2,
		legacyEligible: candidate.trace.eligible,
		eligible: rejectionReasons.length === 0,
		rejectionReasons,
		hypothesis: hypothesisForCandidate(evidence, graph, candidate),
	}
}

export function discoverSupportedNativeFieldTransitionPaths(
	evidence: NativePaletteEvidence,
): readonly SupportedFieldTransitionPathEvidence[] {
	const graph = buildRegionGraph(evidence)
	return orderedTransitionCandidates(evidence, graph).map((candidate) => supportedPathEvidence(evidence, graph, candidate))
}

export function discoverNativeFieldTransitions(evidence: NativePaletteEvidence): NativeFieldTransitionDiscovery {
	const graph = buildRegionGraph(evidence)
	const ordered = orderedTransitionCandidates(evidence, graph)
	const acceptedEndpointPairs = new Set<string>()
	const hypotheses = ordered.flatMap((candidate): FieldHypothesis[] => {
		if (!candidate.domain.eligible) return []
		const endpointPair = candidate.trace.topology === "linear"
			? [...candidate.trace.endpointFamilyIds].sort(compareAscii).join(":")
			: `${candidate.trace.topology}:${candidate.trace.endpointFamilyIds[1]}`
		if (acceptedEndpointPairs.has(endpointPair)) return []
		const hypothesis = hypothesisForCandidate(evidence, graph, candidate)
		if (!hypothesis) return []
		acceptedEndpointPairs.add(endpointPair)
		return [hypothesis]
	}).sort((first, second) => second.fieldFidelity - first.fieldFidelity || compareAscii(first.id, second.id))
	return {
		regions: graph.nodes.map((node) => publicRegionEvidence(evidence, node)),
		fieldDomains: ordered.map(({ domain }) => domain),
		traces: ordered.map(({ trace }) => trace),
		hypotheses,
	}
}
