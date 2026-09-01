import { labAt, okDistance } from "./color.ts"
import type { Candidate } from "./candidates.ts"
import { detectGradient } from "./palette.ts"
import type { RegionAnalysis } from "./regions.ts"
import type { GradientEvidence, OKLab } from "./types.ts"

export const GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION = "gradient-eligibility-evidence-0.2.0-dev"
export const GRADIENT_ELIGIBILITY_CANDIDATE_VERSION = "gradient-eligibility-0.8.6-dev"
export const GRADIENT_ELIGIBILITY_THRESHOLDS = {
	minimumEndpointDistance: 0.025,
	minimumConnectedFieldContinuity: 11 / 14,
	minimumConnectedFieldShare: 0.05,
	minimumOrderedPathContinuity: 13 / 14,
	minimumIntermediatePathShare: 0.3,
	minimumColorPathDirectionalOrdering: 0.15,
	maximumFlatBackgroundIsolatedSurfaceRisk: 0.4,
	maximumEndpointDominatedIntermediatePathShare: 0.4,
	maximumFlatRiskDirectionalOrdering: 0.2,
	minimumBroadIntermediateCoverage: 0.2,
	maximumBroadFieldSurfaceFlatness: 0.2,
	minimumNonlinearPathContinuity: 1,
	minimumNonlinearIntermediatePathShare: 0.6,
	minimumNonlinearPairCoherence: 0.5,
	maximumNonlinearConnectedFieldCoverage: 0,
	maximumSparseIntermediateCoverage: 0.08,
	minimumBorderBackgroundCoverage: 0.03,
	minimumSparseFieldBackgroundCoverage: 0.2,
	minimumBroadTenBinContinuity: 10 / 14,
	minimumBroadTenBinConnectedCoverage: 0.7,
	minimumBroadTenBinConnectedShare: 0.9,
	minimumBroadTenBinIntermediateCoverage: 0.2,
	minimumBroadTenBinDirectionalOrdering: 0.5,
	maximumBroadTenBinAbruptTransitionShare: 0.2,
	minimumSparseOrderedEndpointDistance: 0.2,
	minimumSparseOrderedPathContinuity: 1,
	minimumSparseOrderedDirectionalOrdering: 0.85,
	maximumUnsupportedEndpointDistance: 0.15,
	maximumUnsupportedColorPathCoverage: 0.11,
	maximumUnsupportedPairCoherence: 0.3,
	minimumFragmentedConnectedCoverage: 0.09,
	maximumFragmentedConnectedShare: 0.2,
	minimumDualBorderCoverage: 0.27,
	maximumDualBorderIntermediatePathShare: 0.17,
	maximumSparseConnectedIntermediateCoverage: 0.04,
	minimumSparseConnectedCoverage: 0.05,
	maximumSparseConnectedBackgroundCoherence: 0.3,
	minimumCoherentFieldConnectedShare: 0.993,
	minimumCoherentFieldPairCoherence: 0.55,
	maximumCoherentFieldSurfaceCoherence: 0.3,
} as const

export type EndpointEvidence = {
	coverage: number
	coherence: number
	borderCoverage: number
	interiorComponentShare: number
	flatness: number
}

export type ConnectedFieldEvidence = {
	coverage: number
	shareOfColorPath: number
	continuity: number
	localTransitionCoverage: number
	abruptTransitionShare: number
	directionalOrdering: number
}

export type GradientEligibilityEvidence = {
	experimentVersion: typeof GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION
	endpointDistance: number
	pairSpecific: GradientEvidence
	colorPathCoverage: number
	intermediateCoverage: number
	colorPathContinuity: number
	colorPathDirectionalOrdering: number
	connectedField: ConnectedFieldEvidence
	background: EndpointEvidence & { dominantFlat: boolean }
	surface: EndpointEvidence & { isolated: boolean }
	flatBackgroundIsolatedSurfaceRisk: number
}

export type GradientEligibilityDecision = {
	candidateVersion: typeof GRADIENT_ELIGIBILITY_CANDIDATE_VERSION
	eligible: boolean
	reason: "eligible" | "insufficient-spatial-continuity" | "flat-background-isolated-surface" |
		"insufficient-progressive-field-support" | "unsupported-disconnected-color-path" |
		"fragmented-connected-color-path" | "separate-border-connected-flat-fields"
}

type PathComponent = {
	pixels: number[]
	continuity: number
	spansEndpoints: boolean
}

type MaskComponent = {
	size: number
	borderPixels: number
}

const binCount = 18
const endpointLimit = 0.12
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

function neighbors(pixel: number, width: number, height: number): number[] {
	const x = pixel % width
	const y = Math.floor(pixel / width)
	return [
		x > 0 ? pixel - 1 : -1,
		x + 1 < width ? pixel + 1 : -1,
		y > 0 ? pixel - width : -1,
		y + 1 < height ? pixel + width : -1,
	]
}

function connectedPathComponents(
	mask: Uint8Array,
	projections: Float32Array,
	width: number,
	height: number,
): PathComponent[] {
	const visited = new Uint8Array(mask.length)
	const components: PathComponent[] = []
	for (let start = 0; start < mask.length; start++) {
		if (!mask[start] || visited[start]) continue
		const stack = [start]
		const pixels: number[] = []
		const bins = new Uint32Array(binCount)
		let backgroundPixels = 0
		let surfacePixels = 0
		visited[start] = 1
		while (stack.length > 0) {
			const pixel = stack.pop()!
			const projection = projections[pixel]
			pixels.push(pixel)
			bins[Math.min(binCount - 1, Math.floor(clamp01(projection) * binCount))]++
			if (projection <= endpointLimit) backgroundPixels++
			if (projection >= 1 - endpointLimit) surfacePixels++
			for (const neighbor of neighbors(pixel, width, height)) {
				if (neighbor >= 0 && mask[neighbor] && !visited[neighbor]) {
					visited[neighbor] = 1
					stack.push(neighbor)
				}
			}
		}
		const coreBins = bins.slice(2, -2)
		components.push({
			pixels,
			continuity: coreBins.filter((count) => count > 0).length / coreBins.length,
			spansEndpoints: backgroundPixels >= 2 && surfacePixels >= 2,
		})
	}
	return components
}

function maskComponents(mask: Uint8Array, width: number, height: number): MaskComponent[] {
	const visited = new Uint8Array(mask.length)
	const components: MaskComponent[] = []
	for (let start = 0; start < mask.length; start++) {
		if (!mask[start] || visited[start]) continue
		const stack = [start]
		let size = 0
		let borderPixels = 0
		visited[start] = 1
		while (stack.length > 0) {
			const pixel = stack.pop()!
			const x = pixel % width
			const y = Math.floor(pixel / width)
			size++
			if (x === 0 || x === width - 1 || y === 0 || y === height - 1) borderPixels++
			for (const neighbor of neighbors(pixel, width, height)) {
				if (neighbor >= 0 && mask[neighbor] && !visited[neighbor]) {
					visited[neighbor] = 1
					stack.push(neighbor)
				}
			}
		}
		components.push({ size, borderPixels })
	}
	return components
}

function endpointEvidence(
	mask: Uint8Array,
	distances: Float32Array,
	flatnessScale: number,
	width: number,
	height: number,
): EndpointEvidence {
	let support = 0
	let distanceTotal = 0
	for (let pixel = 0; pixel < mask.length; pixel++) {
		if (!mask[pixel]) continue
		support++
		distanceTotal += distances[pixel]
	}
	if (support === 0) {
		return { coverage: 0, coherence: 0, borderCoverage: 0, interiorComponentShare: 0, flatness: 0 }
	}
	const components = maskComponents(mask, width, height)
	const largest = components.reduce((best, component) => component.size > best.size ? component : best)
	const interior = components.reduce((sum, component) => sum + (component.borderPixels === 0 ? component.size : 0), 0)
	const perimeter = width === 1 || height === 1 ? mask.length : width * 2 + height * 2 - 4
	return {
		coverage: support / mask.length,
		coherence: largest.size / support,
		borderCoverage: largest.borderPixels / Math.max(1, perimeter),
		interiorComponentShare: interior / support,
		flatness: clamp01(1 - distanceTotal / support / Math.max(flatnessScale, 1e-9)),
	}
}

function transitionEvidence(
	component: PathComponent | undefined,
	componentMask: Uint8Array,
	projections: Float32Array,
	width: number,
	height: number,
): { localTransitionCoverage: number; abruptTransitionShare: number } {
	if (!component || component.pixels.length === 0) return { localTransitionCoverage: 0, abruptTransitionShare: 0 }
	let smoothTransitions = 0
	let abruptTransitions = 0
	let changingTransitions = 0
	for (const pixel of component.pixels) {
		const x = pixel % width
		const y = Math.floor(pixel / width)
		for (const neighbor of [x + 1 < width ? pixel + 1 : -1, y + 1 < height ? pixel + width : -1]) {
			if (neighbor < 0 || !componentMask[neighbor]) continue
			const change = Math.abs(projections[pixel] - projections[neighbor])
			if (change <= 0.002) continue
			changingTransitions++
			if (change <= 0.12) smoothTransitions++
			else abruptTransitions++
		}
	}
	return {
		localTransitionCoverage: smoothTransitions / component.pixels.length,
		abruptTransitionShare: changingTransitions === 0 ? 0 : abruptTransitions / changingTransitions,
	}
}

function directionalOrdering(
	component: PathComponent | undefined,
	projections: Float32Array,
	width: number,
	height: number,
): number {
	if (!component || component.pixels.length < 4) return 0
	const values = component.pixels.map((pixel) => ({
		x: (pixel % width) / Math.max(1, width - 1),
		y: Math.floor(pixel / width) / Math.max(1, height - 1),
		t: projections[pixel],
	}))
	const mean = values.reduce((sum, value) => ({
		x: sum.x + value.x / values.length,
		y: sum.y + value.y / values.length,
		t: sum.t + value.t / values.length,
	}), { x: 0, y: 0, t: 0 })
	let varianceX = 0
	let varianceY = 0
	let varianceT = 0
	let covarianceXY = 0
	let covarianceXT = 0
	let covarianceYT = 0
	for (const value of values) {
		const x = value.x - mean.x
		const y = value.y - mean.y
		const t = value.t - mean.t
		varianceX += x * x
		varianceY += y * y
		varianceT += t * t
		covarianceXY += x * y
		covarianceXT += x * t
		covarianceYT += y * t
	}
	const determinant = varianceX * varianceY - covarianceXY ** 2
	if (determinant <= 1e-12 || varianceT <= 1e-12) return 0
	const betaX = (covarianceXT * varianceY - covarianceYT * covarianceXY) / determinant
	const betaY = (covarianceYT * varianceX - covarianceXT * covarianceXY) / determinant
	return clamp01((betaX * covarianceXT + betaY * covarianceYT) / varianceT)
}

export function analyzeGradientEligibility(
	background: Candidate,
	surface: Candidate,
	analysis: RegionAnalysis,
): GradientEligibilityEvidence {
	const difference: OKLab = [
		surface.lab[0] - background.lab[0],
		surface.lab[1] - background.lab[1],
		surface.lab[2] - background.lab[2],
	]
	const squaredDistance = difference[0] ** 2 + difference[1] ** 2 + difference[2] ** 2
	const endpointDistance = Math.sqrt(squaredDistance)
	const total = analysis.width * analysis.height
	const pathMask = new Uint8Array(total)
	const backgroundMask = new Uint8Array(total)
	const surfaceMask = new Uint8Array(total)
	const projections = new Float32Array(total)
	const backgroundDistances = new Float32Array(total)
	const surfaceDistances = new Float32Array(total)
	const bins = new Uint32Array(binCount)
	const pathPixelIndices: number[] = []
	let pathPixels = 0
	let intermediatePixels = 0
	if (endpointDistance >= GRADIENT_ELIGIBILITY_THRESHOLDS.minimumEndpointDistance) {
		const tolerance = Math.max(0.016, endpointDistance * 0.16)
		for (let pixel = 0; pixel < total; pixel++) {
			const lab = labAt(analysis.labs, pixel)
			const relative: OKLab = [
				lab[0] - background.lab[0],
				lab[1] - background.lab[1],
				lab[2] - background.lab[2],
			]
			const projection = (
				relative[0] * difference[0] + relative[1] * difference[1] + relative[2] * difference[2]
			) / squaredDistance
			if (projection < -0.04 || projection > 1.04) continue
			const clamped = clamp01(projection)
			const projected: OKLab = [
				background.lab[0] + difference[0] * clamped,
				background.lab[1] + difference[1] * clamped,
				background.lab[2] + difference[2] * clamped,
			]
			if (okDistance(lab, projected) > tolerance) continue
			pathMask[pixel] = 1
			projections[pixel] = clamped
			pathPixelIndices.push(pixel)
			pathPixels++
			bins[Math.min(binCount - 1, Math.floor(clamped * binCount))]++
			backgroundDistances[pixel] = okDistance(lab, background.lab)
			surfaceDistances[pixel] = okDistance(lab, surface.lab)
			if (clamped <= endpointLimit) backgroundMask[pixel] = 1
			if (clamped >= 1 - endpointLimit) surfaceMask[pixel] = 1
			if (clamped > endpointLimit && clamped < 1 - endpointLimit) intermediatePixels++
		}
	}

	const components = connectedPathComponents(pathMask, projections, analysis.width, analysis.height)
	const connected = components.filter((component) => component.spansEndpoints)
		.sort((first, second) => second.continuity - first.continuity || second.pixels.length - first.pixels.length)[0]
	const connectedMask = new Uint8Array(total)
	if (connected) for (const pixel of connected.pixels) connectedMask[pixel] = 1
	const transition = transitionEvidence(connected, connectedMask, projections, analysis.width, analysis.height)
	const colorPathDirectionalOrdering = directionalOrdering(
		{ pixels: pathPixelIndices, continuity: 0, spansEndpoints: false },
		projections,
		analysis.width,
		analysis.height,
	)
	const backgroundEvidence = endpointEvidence(
		backgroundMask,
		backgroundDistances,
		Math.max(0.025, endpointDistance * endpointLimit),
		analysis.width,
		analysis.height,
	)
	const surfaceEvidence = endpointEvidence(
		surfaceMask,
		surfaceDistances,
		Math.max(0.025, endpointDistance * endpointLimit),
		analysis.width,
		analysis.height,
	)
	const dominantFlat = backgroundEvidence.coverage >= 0.2 && backgroundEvidence.borderCoverage >= 0.15 &&
		backgroundEvidence.flatness >= 0.85
	const isolated = surfaceEvidence.coverage >= 0.015 && (
		surfaceEvidence.interiorComponentShare >= 0.65 ||
		surfaceEvidence.coherence >= 0.35 && surfaceEvidence.borderCoverage < 0.08
	)
	const coreBins = bins.slice(2, -2)
	const connectedContinuity = connected?.continuity ?? 0
	const isolationStrength = Math.max(surfaceEvidence.interiorComponentShare, surfaceEvidence.coherence * (
		1 - clamp01(surfaceEvidence.borderCoverage / 0.2)
	))
	const ordering = directionalOrdering(connected, projections, analysis.width, analysis.height)
	const separationStrength = Math.max(
		1 - connectedContinuity,
		transition.abruptTransitionShare,
		1 - ordering,
	)
	const flatBackgroundStrength = clamp01((backgroundEvidence.coverage - 0.15) / 0.25) *
		backgroundEvidence.flatness * clamp01(backgroundEvidence.borderCoverage / 0.2)
	const flatBackgroundIsolatedSurfaceRisk = clamp01(
		flatBackgroundStrength * isolationStrength * separationStrength,
	)
	return {
		experimentVersion: GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION,
		endpointDistance,
		pairSpecific: detectGradient(background, surface, analysis, { allowSmoothFallback: false }),
		colorPathCoverage: total === 0 ? 0 : pathPixels / total,
		intermediateCoverage: total === 0 ? 0 : intermediatePixels / total,
		colorPathContinuity: coreBins.filter((count) => count > 0).length / coreBins.length,
		colorPathDirectionalOrdering,
		connectedField: {
			coverage: total === 0 ? 0 : (connected?.pixels.length ?? 0) / total,
			shareOfColorPath: pathPixels === 0 ? 0 : (connected?.pixels.length ?? 0) / pathPixels,
			continuity: connectedContinuity,
			...transition,
			directionalOrdering: ordering,
		},
		background: { ...backgroundEvidence, dominantFlat },
		surface: { ...surfaceEvidence, isolated },
		flatBackgroundIsolatedSurfaceRisk,
	}
}

export function decideGradientEligibility(evidence: GradientEligibilityEvidence): GradientEligibilityDecision {
	if (evidence.experimentVersion !== GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION) {
		throw new Error(`Unsupported gradient eligibility evidence version: ${evidence.experimentVersion}`)
	}
	const connected = evidence.connectedField.continuity >=
		GRADIENT_ELIGIBILITY_THRESHOLDS.minimumConnectedFieldContinuity &&
		evidence.connectedField.shareOfColorPath >= GRADIENT_ELIGIBILITY_THRESHOLDS.minimumConnectedFieldShare
	const intermediatePathShare = evidence.colorPathCoverage === 0
		? 0
		: evidence.intermediateCoverage / evidence.colorPathCoverage
	const orderedAcrossOcclusion = evidence.colorPathContinuity >=
		GRADIENT_ELIGIBILITY_THRESHOLDS.minimumOrderedPathContinuity &&
		intermediatePathShare >= GRADIENT_ELIGIBILITY_THRESHOLDS.minimumIntermediatePathShare &&
		evidence.colorPathDirectionalOrdering >= GRADIENT_ELIGIBILITY_THRESHOLDS.minimumColorPathDirectionalOrdering
	const nonlinearContinuousPath = evidence.pairSpecific.isGradient && evidence.colorPathContinuity >=
		GRADIENT_ELIGIBILITY_THRESHOLDS.minimumNonlinearPathContinuity &&
		intermediatePathShare >= GRADIENT_ELIGIBILITY_THRESHOLDS.minimumNonlinearIntermediatePathShare &&
		evidence.pairSpecific.coherence >= GRADIENT_ELIGIBILITY_THRESHOLDS.minimumNonlinearPairCoherence &&
		evidence.connectedField.coverage <= GRADIENT_ELIGIBILITY_THRESHOLDS.maximumNonlinearConnectedFieldCoverage
	const broadTenBinConnectedField = evidence.connectedField.continuity >=
		GRADIENT_ELIGIBILITY_THRESHOLDS.minimumBroadTenBinContinuity &&
		evidence.connectedField.coverage >= GRADIENT_ELIGIBILITY_THRESHOLDS.minimumBroadTenBinConnectedCoverage &&
		evidence.connectedField.shareOfColorPath >= GRADIENT_ELIGIBILITY_THRESHOLDS.minimumBroadTenBinConnectedShare &&
		evidence.intermediateCoverage >= GRADIENT_ELIGIBILITY_THRESHOLDS.minimumBroadTenBinIntermediateCoverage &&
		evidence.connectedField.directionalOrdering >=
			GRADIENT_ELIGIBILITY_THRESHOLDS.minimumBroadTenBinDirectionalOrdering &&
		evidence.connectedField.abruptTransitionShare <=
			GRADIENT_ELIGIBILITY_THRESHOLDS.maximumBroadTenBinAbruptTransitionShare
	const sparseOrderedPath = evidence.endpointDistance >=
		GRADIENT_ELIGIBILITY_THRESHOLDS.minimumSparseOrderedEndpointDistance &&
		evidence.colorPathContinuity >= GRADIENT_ELIGIBILITY_THRESHOLDS.minimumSparseOrderedPathContinuity &&
		evidence.colorPathDirectionalOrdering >=
			GRADIENT_ELIGIBILITY_THRESHOLDS.minimumSparseOrderedDirectionalOrdering
	const coherentSparseDisconnectedPath = evidence.connectedField.coverage === 0 && evidence.endpointDistance <=
		GRADIENT_ELIGIBILITY_THRESHOLDS.maximumUnsupportedEndpointDistance &&
		evidence.colorPathCoverage <= GRADIENT_ELIGIBILITY_THRESHOLDS.maximumUnsupportedColorPathCoverage &&
		evidence.colorPathContinuity >= GRADIENT_ELIGIBILITY_THRESHOLDS.minimumOrderedPathContinuity &&
		evidence.colorPathDirectionalOrdering >=
			GRADIENT_ELIGIBILITY_THRESHOLDS.minimumColorPathDirectionalOrdering &&
		evidence.pairSpecific.coherence > GRADIENT_ELIGIBILITY_THRESHOLDS.maximumUnsupportedPairCoherence
	if (!connected && !orderedAcrossOcclusion && !nonlinearContinuousPath && !broadTenBinConnectedField &&
		!sparseOrderedPath && !coherentSparseDisconnectedPath) {
		return {
			candidateVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
			eligible: false,
			reason: "insufficient-spatial-continuity",
		}
	}
	const broadNonFlatField = evidence.intermediateCoverage >=
		GRADIENT_ELIGIBILITY_THRESHOLDS.minimumBroadIntermediateCoverage &&
		evidence.surface.flatness <= GRADIENT_ELIGIBILITY_THRESHOLDS.maximumBroadFieldSurfaceFlatness
	const coherentConnectedField = evidence.pairSpecific.isGradient && evidence.connectedField.shareOfColorPath >=
		GRADIENT_ELIGIBILITY_THRESHOLDS.minimumCoherentFieldConnectedShare &&
		evidence.pairSpecific.coherence >= GRADIENT_ELIGIBILITY_THRESHOLDS.minimumCoherentFieldPairCoherence &&
		evidence.surface.coherence <= GRADIENT_ELIGIBILITY_THRESHOLDS.maximumCoherentFieldSurfaceCoherence
	if (evidence.flatBackgroundIsolatedSurfaceRisk >=
		GRADIENT_ELIGIBILITY_THRESHOLDS.maximumFlatBackgroundIsolatedSurfaceRisk &&
		intermediatePathShare < GRADIENT_ELIGIBILITY_THRESHOLDS.maximumEndpointDominatedIntermediatePathShare &&
		Math.max(evidence.connectedField.directionalOrdering, evidence.colorPathDirectionalOrdering) <
			GRADIENT_ELIGIBILITY_THRESHOLDS.maximumFlatRiskDirectionalOrdering && !broadNonFlatField) {
		if (coherentConnectedField) {
			return { candidateVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION, eligible: true, reason: "eligible" }
		}
		return {
			candidateVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
			eligible: false,
			reason: "flat-background-isolated-surface",
		}
	}
	if (evidence.intermediateCoverage <= GRADIENT_ELIGIBILITY_THRESHOLDS.maximumSparseIntermediateCoverage &&
		evidence.background.borderCoverage >= GRADIENT_ELIGIBILITY_THRESHOLDS.minimumBorderBackgroundCoverage &&
		evidence.background.coverage >= GRADIENT_ELIGIBILITY_THRESHOLDS.minimumSparseFieldBackgroundCoverage) {
		return {
			candidateVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
			eligible: false,
			reason: "insufficient-progressive-field-support",
		}
	}
	if (!evidence.pairSpecific.isGradient && evidence.intermediateCoverage <=
		GRADIENT_ELIGIBILITY_THRESHOLDS.maximumSparseConnectedIntermediateCoverage &&
		evidence.connectedField.coverage >= GRADIENT_ELIGIBILITY_THRESHOLDS.minimumSparseConnectedCoverage &&
		evidence.background.coherence <=
			GRADIENT_ELIGIBILITY_THRESHOLDS.maximumSparseConnectedBackgroundCoherence) {
		return {
			candidateVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
			eligible: false,
			reason: "insufficient-progressive-field-support",
		}
	}
	if (evidence.connectedField.coverage === 0 && evidence.endpointDistance <=
		GRADIENT_ELIGIBILITY_THRESHOLDS.maximumUnsupportedEndpointDistance &&
		evidence.colorPathCoverage <= GRADIENT_ELIGIBILITY_THRESHOLDS.maximumUnsupportedColorPathCoverage &&
		evidence.pairSpecific.coherence <= GRADIENT_ELIGIBILITY_THRESHOLDS.maximumUnsupportedPairCoherence) {
		return {
			candidateVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
			eligible: false,
			reason: "unsupported-disconnected-color-path",
		}
	}
	if (evidence.connectedField.coverage >= GRADIENT_ELIGIBILITY_THRESHOLDS.minimumFragmentedConnectedCoverage &&
		evidence.connectedField.shareOfColorPath <=
			GRADIENT_ELIGIBILITY_THRESHOLDS.maximumFragmentedConnectedShare) {
		return {
			candidateVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
			eligible: false,
			reason: "fragmented-connected-color-path",
		}
	}
	if (evidence.background.borderCoverage >= GRADIENT_ELIGIBILITY_THRESHOLDS.minimumDualBorderCoverage &&
		evidence.surface.borderCoverage >= GRADIENT_ELIGIBILITY_THRESHOLDS.minimumDualBorderCoverage &&
		intermediatePathShare <= GRADIENT_ELIGIBILITY_THRESHOLDS.maximumDualBorderIntermediatePathShare) {
		return {
			candidateVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
			eligible: false,
			reason: "separate-border-connected-flat-fields",
		}
	}
	return { candidateVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION, eligible: true, reason: "eligible" }
}
