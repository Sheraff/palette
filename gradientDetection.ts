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
	const edgeHeavy = edgeBins / totalCounted > 0.9

	// Check for excessive peakiness (large spikes suggest discrete colors, not smooth gradient)
	// Calculate coefficient of variation (std dev / mean) for non-zero bins
	const nonZeroValues = histogram.filter(v => v > 0)
	const avgBinCount = totalCounted / nonZeroBins
	let stdDev = 0
	for (const value of nonZeroValues) {
		stdDev += Math.pow(value - avgBinCount, 2)
	}
	stdDev = Math.sqrt(stdDev / nonZeroValues.length)
	const coefficientOfVariation = stdDev / avgBinCount
	
	// Check for dominant peaks (bins that contain a disproportionate amount of pixels)
	const maxBin = Math.max(...histogram)
	const maxBinRatio = maxBin / totalCounted
	
	// Sort bins to find top peaks
	const sortedBins = [...histogram].sort((a, b) => b - a)
	const secondHighest = sortedBins[1] || 1
	const peakDominance = maxBin / secondHighest
	
	// A very dominant single peak suggests discrete colors, but only if coverage is low
	// High coverage (>15%) indicates a gradient even with some color banding/peakiness
	// This allows placebo.jpg (coverage=0.177, peakDominance=3.05) to be detected as gradient
	// while catching johns.jpg (coverage=0.143, peakDominance=1.715) as non-gradient
	const hasDominantPeak = peakDominance > 1.71 && maxBinRatio > 0.08 && coverage < 0.16
	
	const isPeaky = hasDominantPeak || coefficientOfVariation > 2.0 || maxBinRatio > 0.30

	// Gradients have:
	// - High coverage (many pixels on the interpolation path)
	// - High continuity (few gaps in the histogram) 
	// - Relatively uniform distribution (not too peaky)
	// - NOT bimodal or edge-heavy

	const isGradient = coverage > 0.002 && continuityScore > 0.35 && gapCount < histogram.length * 0.32 && !isBimodal && !edgeHeavy && !isPeaky

	// Confidence based on how strongly the metrics support the conclusion
	let confidence = 0

	// For gradients
	if (isGradient) {
		if (coverage > 0.2) confidence += 0.3
		else if (coverage > 0.1) confidence += 0.25
		else if (coverage > 0.002) confidence += 0.15

		if (continuityScore > 0.7) confidence += 0.4
		else if (continuityScore > 0.5) confidence += 0.3
		else if (continuityScore > 0.35) confidence += 0.2

		if (gapCount < histogram.length * 0.15) confidence += 0.3
		else if (gapCount < histogram.length * 0.32) confidence += 0.2
	} else {
		// For separate colors - high confidence when clearly bimodal or edge-heavy
		if (isBimodal) confidence += 0.5
		if (edgeHeavy) confidence += 0.3
		if (isPeaky) confidence += 0.3
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
		edgeHeavy,
		isPeaky,
		coefficientOfVariation,
		maxBinRatio,
		peakDominance,
		hasDominantPeak
	}
}
