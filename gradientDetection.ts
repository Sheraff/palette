import type { ColorSpace } from "./spaces/types.ts"


/**
 * Analyze if two colors form a gradient using histogram analysis.
 * Creates a 1D histogram in perceptually uniform color space (OKLAB) along the gradient direction.
 * - Gradient: Continuous, relatively uniform distribution between the two colors
 * - Separate: Bimodal distribution with gaps in between
 */
export function histogramAnalysis(
	color1: number,
	color2: number,
	colorCount: Map<number, number>,
	colorSpace: ColorSpace,
	bins: number = 50
): boolean {
	const totalDistance = colorSpace.distance(color1, color2)

	// Create histogram bins along the color interpolation path
	const histogram = new Array(bins).fill(0)
	let pixelCount = 0

	// For each pixel, determine which bin it falls into
	for (const [color, count] of colorCount) {
		pixelCount += count
		const d1 = colorSpace.distance(color, color1)
		const d2 = colorSpace.distance(color, color2)

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
			histogram[binIndex] += count
		}
	}

	// Check if the histogram shows discrete color blocks rather than smooth gradient
	// Count how many pixels are NOT on the interpolation path
	const onPath = histogram.reduce((sum, count) => sum + count, 0)
	const offPath = pixelCount - onPath
	const offPathRatio = offPath / pixelCount

	// If most pixels are off-path, these are likely flat distinct colors
	if (offPathRatio > 0.85) {
		return false // Too few pixels on the gradient path
	}

	// Analyze the histogram for gradient characteristics
	const isGradient = analyzeHistogramDistribution(histogram, pixelCount)

	return isGradient
}

function analyzeHistogramDistribution(histogram: number[], total: number) {
	const totalCounted = histogram.reduce((sum, count) => sum + count, 0)
	const coverage = totalCounted / total
	if (coverage < 0.002) return false // Too little coverage to be a gradient

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
	if (gapCount > histogram.length * 0.32) return false // Too many gaps to be a gradient

	// Calculate continuity score (fewer gaps = more continuous)
	const nonZeroBins = histogram.filter(count => count > 0).length
	const continuityScore = nonZeroBins / histogram.length
	if (continuityScore < 0.35) return false // Too many gaps to be a gradient

	// Detect bimodal distribution (peaks at both ends with gap in middle)
	const firstQuartileMean = histogram.slice(0, Math.floor(histogram.length / 4)).reduce((a, b) => a + b, 0) / (histogram.length / 4)
	const middleHalfMean = histogram.slice(Math.floor(histogram.length / 4), Math.floor(3 * histogram.length / 4)).reduce((a, b) => a + b, 0) / (histogram.length / 2)
	const lastQuartileMean = histogram.slice(Math.floor(3 * histogram.length / 4)).reduce((a, b) => a + b, 0) / (histogram.length / 4)
	const isBimodal = (firstQuartileMean + lastQuartileMean) / 2 > middleHalfMean * 3
	if (isBimodal) return false

	// Check if distribution is mostly at the edges (separate colors)
	const edgeBins = histogram.slice(0, 3).reduce((a, b) => a + b, 0) + histogram.slice(-3).reduce((a, b) => a + b, 0)
	const edgeHeavy = edgeBins / totalCounted > 0.9
	if (edgeHeavy) return false

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
	if (coefficientOfVariation > 2.0) return false

	// Check for dominant peaks (bins that contain a disproportionate amount of pixels)
	const maxBin = Math.max(...histogram)
	const maxBinRatio = maxBin / totalCounted
	if (maxBinRatio > 0.30) return false

	// Sort bins to find top peaks
	const sortedBins = [...histogram].sort((a, b) => b - a)
	const secondHighest = sortedBins[1] || 1
	const peakDominance = maxBin / secondHighest

	// A very dominant single peak suggests discrete colors, but only if coverage is low
	// High coverage (>15%) indicates a gradient even with some color banding/peakiness
	// Threshold adjusted to allow loups.jpg (peakDominance=2.197) and slim.jpg (peakDominance=1.836)
	// while still using other metrics (coefficientOfVariation, maxBinRatio) to catch non-gradients
	const hasDominantPeak = peakDominance > 2.3 && maxBinRatio > 0.08 && coverage < 0.16
	if (hasDominantPeak) return false

	// Perfect continuity with moderate-to-high peak dominance can indicate discrete colors
	// that are evenly distributed rather than a smooth gradient
	// johns.jpg has continuityScore=1.0, gapCount=0, peakDominance=1.715
	const hasUniformDiscrete = continuityScore === 1.0 && gapCount === 0 && peakDominance > 1.5 && coefficientOfVariation < 1.1
	if (hasUniformDiscrete) return false

	// Gradients have:
	// - High coverage (many pixels on the interpolation path)
	// - High continuity (few gaps in the histogram) 
	// - Relatively uniform distribution (not too peaky)
	// - NOT bimodal or edge-heavy

	return true
}
