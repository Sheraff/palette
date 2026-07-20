import { labAt, okDistance } from "./color.ts"
import type { Candidate, CandidateSpatialEvidence } from "./candidates.ts"
import type { RegionAnalysis } from "./regions.ts"

export const GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION = "gradient-field-topology-evidence-3.0.0-dev"

export const GRADIENT_FIELD_TOPOLOGY_CONSTANTS = {
	binCount: 18,
	minimumEndpointDistance: 0.025,
	pairResidualScale: Math.sqrt(0.03),
	endpointBinCount: 2,
	endpointSeedWidth: 0.2,
	intermediateExtentNormalization: 3 / 2,
	sideDensityNormalization: 3 / 2,
} as const

export type GradientFieldTopologyFeatures = {
	endpointSupport: number
	massDistribution: number
	topology: number
	progression: number
	fieldOwnership: number
	distributionContinuity: number
	connectedIntermediateContinuity: number
}

export type GradientFieldTopologyHistogram = {
	supportMass: number[]
	normalizedEntropy: number
	largestBinConcentration: number
	middleMassShare: number
	absolutePairCoverage: number
	backgroundEndpointShare: number
	surfaceEndpointShare: number
	endpointBalance: number
	endpointPresence: number
	intermediateExtent: number
}

export type GradientFieldLegacyCandidateEvidence = {
	backgroundFieldOwnership: number
	surfaceFieldOwnership: number
	endpointFieldSupport: number
	endpointPixelSupport: number
}

export type GradientFieldRegionEvidence = {
	areaShare: number
	supportMass: number
	weightedU: number
	backgroundAffinity: number
	objectBurden: number
	edgeAffinity: number
	boundaryBreadth: number
	routeCapacity: number
	rootedConnectivity: number
}

export type GradientFieldTopologyDiagnostics = {
	rootedConnectivity: number
	forwardConnectivity: number
	reverseConnectivity: number
	occlusionBurden: number
	activeRegionShare: number
	sharedBoundaryBreadth: number
}

export type GradientFieldProgressionEvidence = {
	linearFit: number
	nonlinearFit: number
	selected: number
}

export type GradientFieldOwnershipEvidence = {
	intermediateBackgroundAffinity: number
	intermediateLowObject: number
	surfaceBackgroundAffinity: number
	surfaceRoleOwnership: number
	spanX: number
	spanY: number
	areaSpan: number
	topReach: number
	rightReach: number
	bottomReach: number
	leftReach: number
	oppositeSideSpan: number
	spatialFieldOwnership: number
	foregroundLocality: number
}

export type GradientFieldLegacyDiagnostics = {
	candidates: GradientFieldLegacyCandidateEvidence
	pairBackgroundAffinity: number
	intermediateBreadth: number
	intermediateBorderReach: number
	lowEdgeAffinity: number
	interiorSurfaceSupport: number
	detailOwnership: number
	fieldOwnership: number
	objectLocality: number
}

export type GradientFieldTopologyEvidence = {
	evidenceVersion: typeof GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION
	endpointDistance: number
	features: GradientFieldTopologyFeatures
	histogram: GradientFieldTopologyHistogram
	regions: GradientFieldRegionEvidence[]
	topology: GradientFieldTopologyDiagnostics
	progression: GradientFieldProgressionEvidence
	ownership: GradientFieldOwnershipEvidence
	legacyDiagnostics: GradientFieldLegacyDiagnostics
}

type RegionAccumulator = {
	area: number
	support: number
	weightedU: number
	background: number
	object: number
	edge: number
	backgroundSeed: number
	surfaceSeed: number
}

type BoundaryAccumulator = {
	first: number
	second: number
	count: number
	edge: number
}

type GraphEdge = {
	neighbor: number
	capacity: number
	breadth: number
}

const {
	binCount,
	minimumEndpointDistance,
	pairResidualScale,
	endpointBinCount,
	endpointSeedWidth,
	intermediateExtentNormalization,
	sideDensityNormalization,
} = GRADIENT_FIELD_TOPOLOGY_CONSTANTS

function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0
	return Math.max(0, Math.min(1, value))
}

function zeroEvidence(endpointDistance: number): GradientFieldTopologyEvidence {
	return {
		evidenceVersion: GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION,
		endpointDistance: clamp01(endpointDistance),
		features: {
			endpointSupport: 0,
			massDistribution: 0,
			topology: 0,
			progression: 0,
			fieldOwnership: 0,
			distributionContinuity: 0,
			connectedIntermediateContinuity: 0,
		},
		histogram: {
			supportMass: new Array(binCount).fill(0),
			normalizedEntropy: 0,
			largestBinConcentration: 0,
			middleMassShare: 0,
			absolutePairCoverage: 0,
			backgroundEndpointShare: 0,
			surfaceEndpointShare: 0,
			endpointBalance: 0,
			endpointPresence: 0,
			intermediateExtent: 0,
		},
		regions: [],
		topology: {
			rootedConnectivity: 0,
			forwardConnectivity: 0,
			reverseConnectivity: 0,
			occlusionBurden: 0,
			activeRegionShare: 0,
			sharedBoundaryBreadth: 0,
		},
		progression: { linearFit: 0, nonlinearFit: 0, selected: 0 },
		ownership: {
			intermediateBackgroundAffinity: 0,
			intermediateLowObject: 0,
			surfaceBackgroundAffinity: 0,
			surfaceRoleOwnership: 0,
			spanX: 0,
			spanY: 0,
			areaSpan: 0,
			topReach: 0,
			rightReach: 0,
			bottomReach: 0,
			leftReach: 0,
			oppositeSideSpan: 0,
			spatialFieldOwnership: 0,
			foregroundLocality: 0,
		},
		legacyDiagnostics: {
			candidates: {
				backgroundFieldOwnership: 0,
				surfaceFieldOwnership: 0,
				endpointFieldSupport: 0,
				endpointPixelSupport: 0,
			},
			pairBackgroundAffinity: 0,
			intermediateBreadth: 0,
			intermediateBorderReach: 0,
			lowEdgeAffinity: 0,
			interiorSurfaceSupport: 0,
			detailOwnership: 0,
			fieldOwnership: 0,
			objectLocality: 0,
		},
	}
}

function sideReach(evidence: CandidateSpatialEvidence): number {
	const coveredSides = evidence.sideCoverage.filter((coverage) => clamp01(coverage) > 0).length / 4
	const coverage = evidence.sideCoverage.reduce((sum, value) => sum + Math.sqrt(clamp01(value)), 0) / 4
	const componentReach = evidence.components.reduce((best, component) => {
		const sides = component.sideCoverage.filter((value) => clamp01(value) > 0).length / 4
		return Math.max(best, sides)
	}, 0)
	return clamp01(coveredSides * 0.45 + coverage * 0.25 + componentReach * 0.3)
}

function componentCoherence(evidence: CandidateSpatialEvidence): number {
	const population = clamp01(evidence.population)
	if (population === 0) return 0
	const largest = evidence.components.reduce((best, component) =>
		Math.max(best, clamp01(component.population)), 0)
	return clamp01(largest / population)
}

function candidateDetail(candidate: Candidate): number {
	const componentDetail = [...candidate.spatial.components, ...candidate.familySpatial.components]
		.reduce((best, component) => Math.max(best, clamp01(component.saliency), clamp01(component.text)), 0)
	return Math.max(
		clamp01(candidate.saliency),
		clamp01(candidate.text),
		clamp01(candidate.spatial.detail),
		clamp01(candidate.familySpatial.detail),
		componentDetail,
	)
}

function candidateFieldOwnership(candidate: Candidate): number {
	const spatial = candidate.spatial
	const family = candidate.familySpatial
	const population = clamp01(Math.sqrt(Math.max(clamp01(spatial.population), clamp01(family.population)) / 0.25))
	const field = clamp01(clamp01(spatial.field) * 0.62 + clamp01(family.field) * 0.38)
	const sides = Math.max(sideReach(spatial), sideReach(family))
	const coherence = clamp01(componentCoherence(spatial) * 0.62 + componentCoherence(family) * 0.38)
	const detail = candidateDetail(candidate)
	const frame = Math.max(clamp01(spatial.frame), clamp01(family.frame))
	const base = clamp01(
		clamp01(candidate.background) * 0.3 + field * 0.28 + population * 0.12 + sides * 0.17 + coherence * 0.13,
	)
	const typographyPenalty = candidate.typographyOnly ? 0.65 : 1
	return clamp01(base * (1 - detail * 0.55) * (1 - frame * 0.45) * typographyPenalty)
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | undefined {
	const size = vector.length
	const rows = matrix.map((row, index) => [...row, vector[index]])
	for (let column = 0; column < size; column++) {
		let pivot = column
		for (let row = column + 1; row < size; row++) {
			if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row
		}
		if (Math.abs(rows[pivot][column]) < 1e-12) return undefined
		if (pivot !== column) [rows[pivot], rows[column]] = [rows[column], rows[pivot]]
		const divisor = rows[column][column]
		for (let entry = column; entry <= size; entry++) rows[column][entry] /= divisor
		for (let row = 0; row < size; row++) {
			if (row === column) continue
			const factor = rows[row][column]
			if (Math.abs(factor) < 1e-16) continue
			for (let entry = column; entry <= size; entry++) rows[row][entry] -= factor * rows[column][entry]
		}
	}
	return rows.map((row) => row[size])
}

function spatialFold(x: number, y: number, width: number, height: number): number {
	const tile = Math.max(2, Math.floor(Math.min(width, height) / 8))
	return (Math.floor(x / tile) + Math.floor(y / tile)) & 1
}

function heldOutFit(
	support: Float32Array,
	coordinates: Float32Array,
	width: number,
	height: number,
	featuresAt: (x: number, y: number) => number[],
): number {
	let scoreTotal = 0
	let evaluationTotal = 0
	for (let heldOut = 0; heldOut < 2; heldOut++) {
		const featureCount = featuresAt(0, 0).length
		const matrix = Array.from({ length: featureCount }, () => new Array(featureCount).fill(0))
		const vector = new Array(featureCount).fill(0)
		let trainingWeight = 0
		let trainingMean = 0
		for (let pixel = 0; pixel < support.length; pixel++) {
			const x = pixel % width
			const y = Math.floor(pixel / width)
			if (spatialFold(x, y, width, height) === heldOut) continue
			const u = clamp01(coordinates[pixel])
			const weight = support[pixel] * (0.35 + 0.65 * 4 * u * (1 - u))
			if (weight <= 1e-8) continue
			const features = featuresAt(x / Math.max(1, width - 1), y / Math.max(1, height - 1))
			trainingWeight += weight
			trainingMean += weight * u
			for (let row = 0; row < featureCount; row++) {
				vector[row] += weight * features[row] * u
				for (let column = 0; column < featureCount; column++) {
					matrix[row][column] += weight * features[row] * features[column]
				}
			}
		}
		if (trainingWeight <= 1e-8) continue
		trainingMean /= trainingWeight
		const ridge = Math.max(1e-10, trainingWeight * 1e-8)
		for (let index = 1; index < featureCount; index++) matrix[index][index] += ridge
		const coefficients = solveLinearSystem(matrix, vector)
		if (!coefficients) continue

		let squaredError = 0
		let baselineError = 0
		let heldOutWeight = 0
		for (let pixel = 0; pixel < support.length; pixel++) {
			const x = pixel % width
			const y = Math.floor(pixel / width)
			if (spatialFold(x, y, width, height) !== heldOut) continue
			const u = clamp01(coordinates[pixel])
			const weight = support[pixel] * (0.35 + 0.65 * 4 * u * (1 - u))
			if (weight <= 1e-8) continue
			const features = featuresAt(x / Math.max(1, width - 1), y / Math.max(1, height - 1))
			const predicted = features.reduce((sum, value, index) => sum + value * coefficients[index], 0)
			squaredError += weight * (u - predicted) ** 2
			baselineError += weight * (u - trainingMean) ** 2
			heldOutWeight += weight
		}
		if (heldOutWeight <= 1e-8 || baselineError <= 1e-12) continue
		const rSquared = clamp01(1 - squaredError / baselineError)
		scoreTotal += rSquared * heldOutWeight
		evaluationTotal += heldOutWeight
	}
	return evaluationTotal === 0 ? 0 : clamp01(scoreTotal / evaluationTotal)
}

function progressionEvidence(
	support: Float32Array,
	coordinates: Float32Array,
	width: number,
	height: number,
	intermediateExtent: number,
): GradientFieldProgressionEvidence {
	const linearFit = heldOutFit(support, coordinates, width, height, (x, y) => [1, x, y])
	const nonlinearFit = heldOutFit(support, coordinates, width, height, (x, y) => [1, x, y, x * x, x * y, y * y])
	return {
		linearFit,
		nonlinearFit,
		selected: clamp01(intermediateExtent * Math.max(linearFit, nonlinearFit)),
	}
}

function addBoundary(
	boundaries: Map<number, BoundaryAccumulator>,
	first: number,
	second: number,
	regionCount: number,
	edge: number,
): void {
	if (first === second || first < 0 || second < 0 || first >= regionCount || second >= regionCount) return
	const low = Math.min(first, second)
	const high = Math.max(first, second)
	const key = low * regionCount + high
	const boundary = boundaries.get(key)
	if (boundary) {
		boundary.count++
		boundary.edge += edge
	} else {
		boundaries.set(key, { first: low, second: high, count: 1, edge })
	}
}

function widestPaths(graph: GraphEdge[][], capacities: number[], seeds: number[]): number[] {
	const widest = capacities.map((capacity, index) => Math.min(clamp01(capacity), clamp01(seeds[index])))
	const visited = new Uint8Array(graph.length)
	for (let iteration = 0; iteration < graph.length; iteration++) {
		let current = -1
		let best = 0
		for (let region = 0; region < graph.length; region++) {
			if (!visited[region] && widest[region] > best) {
				best = widest[region]
				current = region
			}
		}
		if (current < 0) break
		visited[current] = 1
		for (const edge of graph[current]) {
			if (visited[edge.neighbor]) continue
			const route = Math.min(widest[current], capacities[edge.neighbor], edge.capacity)
			if (route > widest[edge.neighbor]) widest[edge.neighbor] = route
		}
	}
	return widest.map(clamp01)
}

function localEdgeAffinity(
	support: Float32Array,
	coordinates: Float32Array,
	edges: Float32Array,
	width: number,
	height: number,
	edgeScale: number,
): number {
	let affinity = 0
	let transitions = 0
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const pixel = y * width + x
			for (const neighbor of [x + 1 < width ? pixel + 1 : -1, y + 1 < height ? pixel + width : -1]) {
				if (neighbor < 0) continue
				const pairWeight = Math.sqrt(support[pixel] * support[neighbor])
				const change = Math.abs(coordinates[pixel] - coordinates[neighbor])
				const weight = pairWeight * change
				if (weight <= 1e-10) continue
				const abrupt = clamp01((change - 0.06) / 0.44)
				const edge = clamp01(Math.max(edges[pixel] || 0, edges[neighbor] || 0) / edgeScale)
				affinity += weight * Math.max(abrupt, edge * 0.45)
				transitions += weight
			}
		}
	}
	return transitions === 0 ? 0 : clamp01(affinity / transitions)
}

export function analyzeGradientFieldTopology(
	background: Candidate,
	surface: Candidate,
	analysis: RegionAnalysis,
): GradientFieldTopologyEvidence {
	const endpointDistance = okDistance(background.lab, surface.lab)
	const total = analysis.width * analysis.height
	if (!Number.isFinite(endpointDistance) || endpointDistance < minimumEndpointDistance || total <= 0) {
		return zeroEvidence(endpointDistance)
	}

	const support = new Float32Array(total)
	const coordinates = new Float32Array(total)
	const rawHistogram = new Float64Array(binCount)
	const difference = [
		surface.lab[0] - background.lab[0],
		surface.lab[1] - background.lab[1],
		surface.lab[2] - background.lab[2],
	] as const
	const squaredEndpointDistance = endpointDistance ** 2
	const residualScale = pairResidualScale * endpointDistance
	let totalSupport = 0
	let intermediateSupport = 0
	let intermediateExtentTotal = 0
	let intermediateX = 0
	let intermediateY = 0
	let intermediateX2 = 0
	let intermediateY2 = 0
	let topIntermediateDensityTotal = 0
	let rightIntermediateDensityTotal = 0
	let bottomIntermediateDensityTotal = 0
	let leftIntermediateDensityTotal = 0
	let intermediateBorderSupport = 0
	let backgroundEndpointSupport = 0
	let surfaceEndpointSupport = 0
	let surfaceBorderSupport = 0
	const perimeter = analysis.width === 1 || analysis.height === 1
		? total
		: analysis.width * 2 + analysis.height * 2 - 4

	for (let pixel = 0; pixel < total; pixel++) {
		const lab = labAt(analysis.labs, pixel)
		const relative = [
			lab[0] - background.lab[0],
			lab[1] - background.lab[1],
			lab[2] - background.lab[2],
		] as const
		const rawCoordinate = (
			relative[0] * difference[0] + relative[1] * difference[1] + relative[2] * difference[2]
		) / squaredEndpointDistance
		const u = clamp01(rawCoordinate)
		const residual = Math.hypot(
			lab[0] - (background.lab[0] + difference[0] * u),
			lab[1] - (background.lab[1] + difference[1] * u),
			lab[2] - (background.lab[2] + difference[2] * u),
		)
		const pairSupport = clamp01(Math.exp(-((residual / residualScale) ** 2)))
		const x = pixel % analysis.width
		const y = Math.floor(pixel / analysis.width)
		const border = x === 0 || x === analysis.width - 1 || y === 0 || y === analysis.height - 1
		const normalizedX = x / Math.max(1, analysis.width - 1)
		const normalizedY = y / Math.max(1, analysis.height - 1)
		const intermediateWeight = pairSupport * 4 * u * (1 - u)
		support[pixel] = pairSupport
		coordinates[pixel] = u
		rawHistogram[Math.min(binCount - 1, Math.floor(u * binCount))] += pairSupport
		totalSupport += pairSupport
		intermediateExtentTotal += intermediateWeight
		intermediateX += intermediateWeight * normalizedX
		intermediateY += intermediateWeight * normalizedY
		intermediateX2 += intermediateWeight * normalizedX ** 2
		intermediateY2 += intermediateWeight * normalizedY ** 2
		if (y === 0) topIntermediateDensityTotal += intermediateWeight
		if (x === analysis.width - 1) rightIntermediateDensityTotal += intermediateWeight
		if (y === analysis.height - 1) bottomIntermediateDensityTotal += intermediateWeight
		if (x === 0) leftIntermediateDensityTotal += intermediateWeight
		if (u >= 0.2 && u <= 0.8) {
			intermediateSupport += pairSupport
			if (border) intermediateBorderSupport += pairSupport
		}
		if (u <= endpointBinCount / binCount) backgroundEndpointSupport += pairSupport
		if (u >= 1 - endpointBinCount / binCount) {
			surfaceEndpointSupport += pairSupport
			if (border) surfaceBorderSupport += pairSupport
		}
	}

	const histogramMass = Array.from(rawHistogram, (mass) =>
		totalSupport === 0 ? 0 : clamp01(mass / totalSupport))
	const normalizedEntropy = totalSupport === 0 ? 0 : clamp01(-histogramMass.reduce((sum, mass) =>
		mass > 0 ? sum + mass * Math.log(mass) : sum, 0) / Math.log(binCount))
	const largestBinConcentration = histogramMass.reduce((largest, mass) => Math.max(largest, mass), 0)
	const middleMassShare = clamp01(histogramMass.slice(3, 15).reduce((sum, mass) => sum + mass, 0))
	const distributionContinuity = clamp01(Math.sqrt(normalizedEntropy * middleMassShare))
	const endpointMass = backgroundEndpointSupport + surfaceEndpointSupport
	const endpointBalance = endpointMass === 0
		? 0
		: clamp01(1 - Math.abs(backgroundEndpointSupport - surfaceEndpointSupport) / endpointMass)
	const pairSupportCoverage = clamp01(totalSupport / total)
	const backgroundEndpointShare = clamp01(backgroundEndpointSupport / total)
	const surfaceEndpointShare = clamp01(surfaceEndpointSupport / total)
	const idealEndpointShare = endpointBinCount / binCount
	const endpointPresence = clamp01(
		Math.sqrt(backgroundEndpointShare * surfaceEndpointShare) / idealEndpointShare,
	)
	const intermediateExtent = clamp01(
		intermediateExtentNormalization * intermediateExtentTotal / total,
	)
	const uniformVariance = (size: number): number => size <= 1 ? 0 : (size + 1) / (12 * (size - 1))
	const meanX = intermediateExtentTotal === 0 ? 0 : intermediateX / intermediateExtentTotal
	const meanY = intermediateExtentTotal === 0 ? 0 : intermediateY / intermediateExtentTotal
	const varianceX = intermediateExtentTotal === 0 ? 0 : Math.max(0, intermediateX2 / intermediateExtentTotal - meanX ** 2)
	const varianceY = intermediateExtentTotal === 0 ? 0 : Math.max(0, intermediateY2 / intermediateExtentTotal - meanY ** 2)
	const spanX = analysis.width <= 1 ? 1 : clamp01(varianceX / uniformVariance(analysis.width))
	const spanY = analysis.height <= 1 ? 1 : clamp01(varianceY / uniformVariance(analysis.height))
	const areaSpan = clamp01(intermediateExtent * Math.sqrt(spanX * spanY))
	const topReach = clamp01(sideDensityNormalization * topIntermediateDensityTotal / Math.max(1, analysis.width))
	const rightReach = clamp01(sideDensityNormalization * rightIntermediateDensityTotal / Math.max(1, analysis.height))
	const bottomReach = clamp01(sideDensityNormalization * bottomIntermediateDensityTotal / Math.max(1, analysis.width))
	const leftReach = clamp01(sideDensityNormalization * leftIntermediateDensityTotal / Math.max(1, analysis.height))
	const oppositeSideSpan = clamp01(Math.max(
		Math.sqrt(topReach * bottomReach),
		Math.sqrt(leftReach * rightReach),
	))
	const spatialFieldOwnership = clamp01(1 - (1 - areaSpan) * (1 - oppositeSideSpan))
	const backgroundFieldOwnership = candidateFieldOwnership(background)
	const surfaceFieldOwnership = candidateFieldOwnership(surface)
	const endpointFieldSupport = clamp01(Math.sqrt(backgroundFieldOwnership * surfaceFieldOwnership))
	const endpointPixelSupport = clamp01(endpointPresence * endpointBalance)

	const regionCount = analysis.regions.length
	let intermediateBackgroundTotal = 0
	let intermediateLowObjectTotal = 0
	let surfaceBackgroundTotal = 0
	let surfaceWeightTotal = 0
	const accumulators: RegionAccumulator[] = Array.from({ length: regionCount }, () => ({
		area: 0,
		support: 0,
		weightedU: 0,
		background: 0,
		object: 0,
		edge: 0,
		backgroundSeed: 0,
		surfaceSeed: 0,
	}))
	const edgeScale = Math.max(0.02, endpointDistance * 0.55)
	for (let pixel = 0; pixel < total; pixel++) {
		const regionId = analysis.labels[pixel]
		if (regionId < 0 || regionId >= regionCount) continue
		const region = analysis.regions[regionId]
		const pairSupport = support[pixel]
		const u = coordinates[pixel]
		const accumulator = accumulators[regionId]
		const objectBurden = Math.max(clamp01(region.saliency), clamp01(region.text))
		const intermediateWeight = pairSupport * 4 * u * (1 - u)
		const surfaceWeight = pairSupport * u ** 2
		const lowObject = (1 - clamp01(region.saliency)) * (1 - clamp01(region.text))
		accumulator.area++
		accumulator.support += pairSupport
		accumulator.weightedU += pairSupport * u
		accumulator.background += pairSupport * clamp01(region.background)
		accumulator.object += pairSupport * objectBurden
		accumulator.edge += pairSupport * clamp01((analysis.edges[pixel] || 0) / edgeScale)
		accumulator.backgroundSeed += pairSupport * clamp01(1 - u / endpointSeedWidth)
		accumulator.surfaceSeed += pairSupport * clamp01(1 - (1 - u) / endpointSeedWidth)
		intermediateBackgroundTotal += intermediateWeight * clamp01(region.background)
		intermediateLowObjectTotal += intermediateWeight * lowObject
		surfaceBackgroundTotal += surfaceWeight * clamp01(region.background)
		surfaceWeightTotal += surfaceWeight
	}
	const intermediateBackgroundAffinity = intermediateExtentTotal === 0
		? 0
		: clamp01(intermediateBackgroundTotal / intermediateExtentTotal)
	const intermediateLowObject = intermediateExtentTotal === 0
		? 0
		: clamp01(intermediateLowObjectTotal / intermediateExtentTotal)
	const surfaceBackgroundAffinity = surfaceWeightTotal === 0
		? 0
		: clamp01(surfaceBackgroundTotal / surfaceWeightTotal)
	const surfaceRoleOwnership = clamp01(Math.sqrt(surfaceBackgroundAffinity * intermediateLowObject))
	const fieldOwnership = clamp01(
		1 - (1 - spatialFieldOwnership) * (1 - surfaceRoleOwnership),
	)

	const regionEvidence: GradientFieldRegionEvidence[] = accumulators.map((accumulator) => ({
		areaShare: clamp01(accumulator.area / total),
		supportMass: totalSupport === 0 ? 0 : clamp01(accumulator.support / totalSupport),
		weightedU: accumulator.support === 0 ? 0 : clamp01(accumulator.weightedU / accumulator.support),
		backgroundAffinity: accumulator.support === 0 ? 0 : clamp01(accumulator.background / accumulator.support),
		objectBurden: accumulator.support === 0 ? 0 : clamp01(accumulator.object / accumulator.support),
		edgeAffinity: accumulator.support === 0 ? 0 : clamp01(accumulator.edge / accumulator.support),
		boundaryBreadth: 0,
		routeCapacity: 0,
		rootedConnectivity: 0,
	}))

	const boundaries = new Map<number, BoundaryAccumulator>()
	for (let y = 0; y < analysis.height; y++) {
		for (let x = 0; x < analysis.width; x++) {
			const pixel = y * analysis.width + x
			if (x + 1 < analysis.width) {
				const neighbor = pixel + 1
				addBoundary(boundaries, analysis.labels[pixel], analysis.labels[neighbor], regionCount,
					Math.max(analysis.edges[pixel] || 0, analysis.edges[neighbor] || 0))
			}
			if (y + 1 < analysis.height) {
				const neighbor = pixel + analysis.width
				addBoundary(boundaries, analysis.labels[pixel], analysis.labels[neighbor], regionCount,
					Math.max(analysis.edges[pixel] || 0, analysis.edges[neighbor] || 0))
			}
		}
	}

	const graph: GraphEdge[][] = Array.from({ length: regionCount }, () => [])
	const boundaryBreadthSums = new Array(regionCount).fill(0)
	const boundaryCounts = new Array(regionCount).fill(0)
	let sharedBoundaryBreadthTotal = 0
	for (const boundary of boundaries.values()) {
		const first = regionEvidence[boundary.first]
		const second = regionEvidence[boundary.second]
		const areaScale = Math.max(1, (Math.sqrt(accumulators[boundary.first].area) + Math.sqrt(accumulators[boundary.second].area)) / 2)
		const breadth = clamp01(boundary.count / areaScale)
		const continuity = 1 - Math.abs(first.weightedU - second.weightedU)
		const capacity = clamp01(Math.sqrt(breadth) * continuity)
		graph[boundary.first].push({ neighbor: boundary.second, capacity, breadth })
		graph[boundary.second].push({ neighbor: boundary.first, capacity, breadth })
		boundaryBreadthSums[boundary.first] += breadth
		boundaryBreadthSums[boundary.second] += breadth
		boundaryCounts[boundary.first]++
		boundaryCounts[boundary.second]++
		sharedBoundaryBreadthTotal += breadth
	}

	const routeCapacities = accumulators.map((accumulator, index) => {
		const evidence = regionEvidence[index]
		const density = accumulator.area === 0 ? 0 : clamp01(accumulator.support / accumulator.area)
		evidence.boundaryBreadth = boundaryCounts[index] === 0
			? 0
			: clamp01(boundaryBreadthSums[index] / boundaryCounts[index])
		evidence.routeCapacity = density
		return evidence.routeCapacity
	})
	const backgroundSeeds = accumulators.map((accumulator) =>
		accumulator.area === 0 ? 0 : clamp01(accumulator.backgroundSeed / accumulator.area))
	const surfaceSeeds = accumulators.map((accumulator) =>
		accumulator.area === 0 ? 0 : clamp01(accumulator.surfaceSeed / accumulator.area))
	const forwardWidest = widestPaths(graph, routeCapacities, backgroundSeeds)
	const reverseWidest = widestPaths(graph, routeCapacities, surfaceSeeds)
	let forwardConnectivityTotal = 0
	let forwardTargetWeight = 0
	let reverseConnectivityTotal = 0
	let reverseTargetWeight = 0
	for (let region = 0; region < regionCount; region++) {
		regionEvidence[region].rootedConnectivity = clamp01(
			Math.sqrt(forwardWidest[region] * reverseWidest[region]),
		)
		const surfaceWeight = accumulators[region].surfaceSeed
		forwardConnectivityTotal += forwardWidest[region] * surfaceWeight
		forwardTargetWeight += surfaceWeight
		const backgroundWeight = accumulators[region].backgroundSeed
		reverseConnectivityTotal += reverseWidest[region] * backgroundWeight
		reverseTargetWeight += backgroundWeight
	}
	const forwardConnectivity = forwardTargetWeight === 0
		? 0
		: clamp01(forwardConnectivityTotal / forwardTargetWeight)
	const reverseConnectivity = reverseTargetWeight === 0
		? 0
		: clamp01(reverseConnectivityTotal / reverseTargetWeight)
	const rootedConnectivity = clamp01(Math.sqrt(forwardConnectivity * reverseConnectivity))
	const connectedIntermediateContinuity = clamp01(Math.sqrt(rootedConnectivity * intermediateExtent))
	const activeRegionShare = regionCount === 0
		? 0
		: clamp01(accumulators.filter((accumulator) => accumulator.support / Math.max(1, accumulator.area) >= 0.25).length / regionCount)
	const sharedBoundaryBreadth = boundaries.size === 0
		? 0
		: clamp01(sharedBoundaryBreadthTotal / boundaries.size)

	const pairEdgeAffinity = localEdgeAffinity(
		support, coordinates, analysis.edges, analysis.width, analysis.height, edgeScale,
	)
	const pairBackgroundAffinity = totalSupport === 0
		? 0
		: clamp01(accumulators.reduce((sum, accumulator) => sum + accumulator.background, 0) / totalSupport)
	const detailOwnership = totalSupport === 0
		? 0
		: clamp01(accumulators.reduce((sum, accumulator) => sum + accumulator.object, 0) / totalSupport)
	const intermediateBreadth = clamp01(intermediateSupport / total / 0.35)
	const intermediateBorderReach = clamp01(intermediateBorderSupport / Math.max(1, perimeter) / 0.35)
	const expectedBorderShare = perimeter / total
	const surfaceBorderEnrichment = surfaceEndpointSupport === 0
		? 0
		: surfaceBorderSupport / surfaceEndpointSupport / Math.max(expectedBorderShare, 1e-9)
	const interiorSurfaceSupport = surfaceEndpointSupport === 0 ? 0 : 1 - clamp01(surfaceBorderEnrichment)
	let unsupportedObjectCoverage = 0
	for (let region = 0; region < regionCount; region++) {
		const accumulator = accumulators[region]
		const density = accumulator.area === 0 ? 0 : clamp01(accumulator.support / accumulator.area)
		unsupportedObjectCoverage += regionEvidence[region].areaShare * (1 - density) *
			Math.max(clamp01(analysis.regions[region].saliency), clamp01(analysis.regions[region].text))
	}
	const occlusionBurden = clamp01(detailOwnership * 0.6 + clamp01(unsupportedObjectCoverage / 0.2) * 0.4)
	const progression = progressionEvidence(
		support, coordinates, analysis.width, analysis.height, intermediateExtent,
	)
	const rawProgression = Math.max(progression.linearFit, progression.nonlinearFit)
	const foregroundLocality = clamp01(
		intermediateExtent * Math.max(rawProgression, rootedConnectivity) * Math.cbrt(
			(1 - spatialFieldOwnership) *
			(1 - surfaceBackgroundAffinity) *
			(1 - intermediateLowObject),
		),
	)

	const massDistribution = clamp01(pairSupportCoverage * normalizedEntropy * endpointBalance)
	const endpointSupport = endpointPixelSupport
	const legacyFieldOwnershipBase = clamp01(
		pairBackgroundAffinity * 0.28 +
		intermediateBreadth * 0.18 +
		intermediateBorderReach * 0.1 +
		endpointFieldSupport * 0.29 +
		(1 - pairEdgeAffinity) * 0.15,
	)
	const legacyFieldOwnership = clamp01(legacyFieldOwnershipBase * (0.55 + 0.45 * clamp01(pairSupportCoverage / 0.35)))
	const endpointDetail = Math.max(candidateDetail(background), candidateDetail(surface))
	const localityShape = clamp01(interiorSurfaceSupport * 0.45 + (1 - intermediateBreadth) * 0.55)
	const localityEvidence = Math.max(pairEdgeAffinity, detailOwnership, endpointDetail)
	const legacyObjectLocality = clamp01(
		pairEdgeAffinity * 0.45 + detailOwnership * 0.25 + endpointDetail * 0.15 +
		localityShape * localityEvidence * 0.15,
	)

	return {
		evidenceVersion: GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION,
		endpointDistance: clamp01(endpointDistance),
		features: {
			endpointSupport,
			massDistribution,
			topology: clamp01(intermediateExtent * rootedConnectivity),
			progression: progression.selected,
			fieldOwnership,
			distributionContinuity,
			connectedIntermediateContinuity,
		},
		histogram: {
			supportMass: histogramMass,
			normalizedEntropy,
			largestBinConcentration,
			middleMassShare,
			absolutePairCoverage: pairSupportCoverage,
			backgroundEndpointShare,
			surfaceEndpointShare,
			endpointBalance,
			endpointPresence,
			intermediateExtent,
		},
		regions: regionEvidence,
		topology: {
			rootedConnectivity,
			forwardConnectivity,
			reverseConnectivity,
			occlusionBurden,
			activeRegionShare,
			sharedBoundaryBreadth,
		},
		progression,
		ownership: {
			intermediateBackgroundAffinity,
			intermediateLowObject,
			surfaceBackgroundAffinity,
			surfaceRoleOwnership,
			spanX,
			spanY,
			areaSpan,
			topReach,
			rightReach,
			bottomReach,
			leftReach,
			oppositeSideSpan,
			spatialFieldOwnership,
			foregroundLocality,
		},
		legacyDiagnostics: {
			candidates: {
				backgroundFieldOwnership,
				surfaceFieldOwnership,
				endpointFieldSupport,
				endpointPixelSupport,
			},
			pairBackgroundAffinity,
			intermediateBreadth,
			intermediateBorderReach,
			lowEdgeAffinity: 1 - pairEdgeAffinity,
			interiorSurfaceSupport,
			detailOwnership,
			fieldOwnership: legacyFieldOwnership,
			objectLocality: legacyObjectLocality,
		},
	}
}
