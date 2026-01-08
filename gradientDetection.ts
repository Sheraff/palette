import type { ColorSpace } from "./spaces/types.ts"

type Meta = {
	channels: number
	width: number
	height: number
}

export type GradientAnalysisResult = {
	isGradient: boolean
	confidence: number
	method: string
	details: Record<string, any>
}

/**
 * Analyze if two colors form a gradient using histogram analysis.
 * Creates a 1D histogram in perceptually uniform color space (OKLAB) along the gradient direction.
 * - Gradient: Continuous, relatively uniform distribution between the two colors
 * - Separate: Bimodal distribution with gaps in between
 */
export function histogramAnalysis(
	color1: number,
	color2: number,
	data: Uint8ClampedArray | Uint8Array,
	meta: Meta,
	colorSpace: ColorSpace,
	bins: number = 50
): GradientAnalysisResult {
	const totalDistance = colorSpace.distance(color1, color2)

	// Create histogram bins along the color interpolation path
	const histogram = new Array(bins).fill(0)
	const total = data.length / meta.channels

	// For each pixel, determine which bin it falls into
	for (let i = 0; i < data.length; i += meta.channels) {
		const pixelColor = colorSpace.toHex(data, i)
		const d1 = colorSpace.distance(pixelColor, color1)
		const d2 = colorSpace.distance(pixelColor, color2)

		// Project onto the line between color1 and color2
		// Using the ratio of distances to determine position
		const totalDist = d1 + d2

		// Only consider pixels that are roughly on the interpolation path
		const pathDeviation = Math.abs(totalDist - totalDistance)
		const maxDeviation = totalDistance * 0.15 // Allow 15% deviation (more strict)

		if (pathDeviation < maxDeviation) {
			// Position along the gradient (0 to 1)
			const position = d1 / totalDistance
			const binIndex = Math.min(Math.floor(position * bins), bins - 1)
			histogram[binIndex]++
		}
	}

	// Analyze the histogram for gradient characteristics
	const analysis = analyzeHistogramDistribution(histogram, total)

	return {
		isGradient: analysis.isGradient,
		confidence: analysis.confidence,
		method: 'histogram',
		details: {
			bins: histogram,
			...analysis
		}
	}
}

function analyzeHistogramDistribution(histogram: number[], total: number) {
	const nonZeroBins = histogram.filter(count => count > 0).length
	const totalCounted = histogram.reduce((sum, count) => sum + count, 0)
	const coverage = totalCounted / total

	// Calculate variance and continuity
	let variance = 0
	let mean = 0
	for (let i = 0; i < histogram.length; i++) {
		mean += histogram[i] * i
	}
	mean /= totalCounted || 1

	for (let i = 0; i < histogram.length; i++) {
		variance += histogram[i] * Math.pow(i - mean, 2)
	}
	variance /= totalCounted || 1

	// Count gaps (consecutive zero bins)
	let gapCount = 0
	let inGap = false
	for (let i = 0; i < histogram.length; i++) {
		if (histogram[i] === 0) {
			if (!inGap && i > 0 && i < histogram.length - 1) {
				gapCount++
				inGap = true
			}
		} else {
			inGap = false
		}
	}

	// Calculate continuity score (fewer gaps = more continuous)
	const continuityScore = nonZeroBins / histogram.length

	// Detect bimodal distribution (peaks at both ends with gap in middle)
	const firstQuartileMean = histogram.slice(0, Math.floor(histogram.length / 4)).reduce((a, b) => a + b, 0) / (histogram.length / 4)
	const middleHalfMean = histogram.slice(Math.floor(histogram.length / 4), Math.floor(3 * histogram.length / 4)).reduce((a, b) => a + b, 0) / (histogram.length / 2)
	const lastQuartileMean = histogram.slice(Math.floor(3 * histogram.length / 4)).reduce((a, b) => a + b, 0) / (histogram.length / 4)
	const isBimodal = (firstQuartileMean + lastQuartileMean) / 2 > middleHalfMean * 3

	// Check if distribution is mostly at the edges (separate colors)
	const edgeBins = histogram.slice(0, 3).reduce((a, b) => a + b, 0) + histogram.slice(-3).reduce((a, b) => a + b, 0)
	const edgeHeavy = edgeBins / totalCounted > 0.95

	// Gradients have:
	// - High coverage (many pixels on the interpolation path)
	// - High continuity (few gaps in the histogram)
	// - Relatively uniform distribution (not too peaky)
	// - NOT bimodal or edge-heavy

	const isGradient = coverage > 0.0025 && continuityScore > 0.35 && gapCount < histogram.length * 0.3 && !isBimodal && !edgeHeavy

	// Confidence based on how strongly the metrics support the conclusion
	let confidence = 0

	// For gradients
	if (isGradient) {
		if (coverage > 0.2) confidence += 0.3
		else if (coverage > 0.1) confidence += 0.25
		else if (coverage > 0.0025) confidence += 0.15

		if (continuityScore > 0.7) confidence += 0.4
		else if (continuityScore > 0.5) confidence += 0.3
		else if (continuityScore > 0.35) confidence += 0.2

		if (gapCount < histogram.length * 0.15) confidence += 0.3
		else if (gapCount < histogram.length * 0.3) confidence += 0.2
	} else {
		// For separate colors - high confidence when clearly bimodal or edge-heavy
		if (isBimodal) confidence += 0.5
		if (edgeHeavy) confidence += 0.3
		if (coverage < 0.08) confidence += 0.2
	}

	return {
		isGradient,
		confidence,
		coverage,
		continuityScore,
		gapCount,
		nonZeroBins,
		variance,
		totalCounted,
		isBimodal,
		edgeHeavy
	}
}

/**
 * Cluster pixels in the intermediate zone between two colors and analyze their spatial distribution.
 * - Gradient: Forms a coherent transitional band
 * - Separate: Sparse, random, or absent
 */
export function clusterIntermediateZone(
	color1: number,
	color2: number,
	data: Uint8ClampedArray | Uint8Array,
	meta: Meta,
	colorSpace: ColorSpace
): GradientAnalysisResult {
	const { width, height, channels } = meta
	const totalDistance = colorSpace.distance(color1, color2)

	// Extract intermediate pixels (those between the two colors in color space)
	const intermediatePixels: Array<{ x: number, y: number, color: number }> = []

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * channels
			const pixelColor = colorSpace.toHex(data, i)
			const d1 = colorSpace.distance(pixelColor, color1)
			const d2 = colorSpace.distance(pixelColor, color2)

			// Check if pixel is in the intermediate zone
			const totalDist = d1 + d2
			const pathDeviation = Math.abs(totalDist - totalDistance)
			const maxDeviation = totalDistance * 0.3 // More lenient deviation tolerance

			// Must be between the colors (not closer to one extreme)
			const isIntermediate = pathDeviation < maxDeviation &&
				d1 > totalDistance * 0.15 && // Less strict distance from extremes
				d2 > totalDistance * 0.15

			if (isIntermediate) {
				intermediatePixels.push({ x, y, color: pixelColor })
			}
		}
	}

	if (intermediatePixels.length === 0) {
		return {
			isGradient: false,
			confidence: 0.9,
			method: 'intermediate-zone',
			details: {
				intermediateCount: 0,
				reason: 'no intermediate pixels found'
			}
		}
	}

	// Analyze spatial distribution
	const spatialAnalysis = analyzeSpatialCoherence(intermediatePixels, width, height)

	return {
		isGradient: spatialAnalysis.isCoherent,
		confidence: spatialAnalysis.confidence,
		method: 'intermediate-zone',
		details: {
			intermediateCount: intermediatePixels.length,
			totalPixels: width * height,
			intermediateRatio: intermediatePixels.length / (width * height),
			...spatialAnalysis
		}
	}
}

function analyzeSpatialCoherence(
	pixels: Array<{ x: number, y: number, color: number }>,
	width: number,
	height: number
) {
	const count = pixels.length
	const totalPixels = width * height
	const coverage = count / totalPixels

	// Create a bitmap of intermediate pixels
	const bitmap = new Uint8Array(width * height)
	for (const pixel of pixels) {
		bitmap[pixel.y * width + pixel.x] = 1
	}

	// Find connected components using flood fill
	const visited = new Uint8Array(width * height)
	const clusters: number[] = []

	for (const pixel of pixels) {
		const index = pixel.y * width + pixel.x
		if (!visited[index]) {
			const clusterSize = floodFill(bitmap, visited, pixel.x, pixel.y, width, height)
			clusters.push(clusterSize)
		}
	}

	// Sort clusters by size
	clusters.sort((a, b) => b - a)

	// Analyze cluster distribution
	const largestCluster = clusters[0] || 0
	const clusterRatio = largestCluster / count

	// Calculate spatial coherence metrics
	// Gradients have:
	// - High concentration in largest cluster (>20%) - intermediate pixels form coherent band
	// - Cluster count only matters when concentration is low
	// - Some intermediate pixels (>0.1%)

	// Primary signal: high concentration means spatially coherent gradient
	const highConcentration = clusterRatio > 0.20
	const moderateConcentration = clusterRatio > 0.12 && clusters.length <= 100
	const sufficientCoverage = coverage > 0.001

	// Scattered pixels indicate separate colors
	// Only flag as scattered if BOTH low concentration AND many clusters
	const isScattered = clusterRatio < 0.08 && clusters.length > 150

	const isCoherent = (highConcentration || moderateConcentration) && sufficientCoverage && !isScattered

	// Calculate confidence
	let confidence = 0

	if (isCoherent) {
		// For gradients - reward high concentration
		if (clusterRatio > 0.3) confidence += 0.5
		else if (clusterRatio > 0.20) confidence += 0.4
		else if (clusterRatio > 0.12) confidence += 0.25

		if (clusters.length === 1) confidence += 0.3
		else if (clusters.length <= 50) confidence += 0.25
		else if (clusters.length <= 100) confidence += 0.15

		if (coverage > 0.02) confidence += 0.2
		else if (coverage > 0.001) confidence += 0.15
	} else {
		// For separate colors - high confidence when clearly scattered
		if (isScattered) confidence += 0.6
		if (clusterRatio < 0.08) confidence += 0.2
		if (coverage < 0.001) confidence += 0.2
	}

	return {
		isCoherent,
		confidence,
		coverage,
		clusterCount: clusters.length,
		largestClusterSize: largestCluster,
		clusterRatio,
		isScattered,
		clusterSizes: clusters.slice(0, 5) // Top 5 clusters
	}
}

function floodFill(
	bitmap: Uint8Array,
	visited: Uint8Array,
	startX: number,
	startY: number,
	width: number,
	height: number
): number {
	const stack: Array<{ x: number, y: number }> = [{ x: startX, y: startY }]
	let size = 0

	while (stack.length > 0) {
		const { x, y } = stack.pop()!
		const index = y * width + x

		if (x < 0 || x >= width || y < 0 || y >= height) continue
		if (visited[index] || !bitmap[index]) continue

		visited[index] = 1
		size++

		// Add 8-connected neighbors
		stack.push({ x: x + 1, y })
		stack.push({ x: x - 1, y })
		stack.push({ x, y: y + 1 })
		stack.push({ x, y: y - 1 })
		stack.push({ x: x + 1, y: y + 1 })
		stack.push({ x: x + 1, y: y - 1 })
		stack.push({ x: x - 1, y: y + 1 })
		stack.push({ x: x - 1, y: y - 1 })
	}

	return size
}

/**
 * Combined gradient detection using multiple methods.
 * Returns the most confident result.
 */
export function detectGradient(
	color1: number,
	color2: number,
	data: Uint8ClampedArray | Uint8Array,
	meta: Meta,
	colorSpace: ColorSpace
): GradientAnalysisResult {
	const histResult = histogramAnalysis(color1, color2, data, meta, colorSpace)
	const clusterResult = clusterIntermediateZone(color1, color2, data, meta, colorSpace)

	// Use the result with higher confidence
	const result = histResult.confidence > clusterResult.confidence ? histResult : clusterResult

	// If both agree, increase confidence
	if (histResult.isGradient === clusterResult.isGradient) {
		result.confidence = Math.min(
			0.95,
			result.confidence + 0.2
		)
		result.method = 'combined'
		result.details = {
			histogram: histResult.details,
			clustering: clusterResult.details,
			agreement: true
		}
	} else {
		result.details = {
			histogram: histResult.details,
			clustering: clusterResult.details,
			agreement: false
		}
	}

	return result
}
