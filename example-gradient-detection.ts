import sharp from "sharp"
import { extractColors } from "./extractColors.ts"
import { detectGradient, histogramAnalysis, clusterIntermediateZone } from "./gradientDetection.ts"
import { oklabSpace } from "./spaces/oklab.ts"

/**
 * Example: Extract colors from an image and determine if the background colors form a gradient
 */
async function analyzeImageGradient(imagePath: string) {
	console.log(`\n=== Analyzing ${imagePath} ===\n`)

	// Load image
	const { data, info } = await sharp(imagePath)
		.raw({ depth: "uchar" })
		.toBuffer({ resolveWithObject: true })

	// Extract colors
	const result = await extractColors(
		data,
		info,
		{
			workers: false,
			colorSpace: oklabSpace,
		},
		imagePath
	)

	// Get the two main background colors
	// In the extractColors result, `outer` and `third` are the background colors
	const color1 = oklabSpace.toHex([
		(result.outer >> 16) & 0xff,
		(result.outer >> 8) & 0xff,
		result.outer & 0xff
	], 0)

	const color2 = oklabSpace.toHex([
		(result.third >> 16) & 0xff,
		(result.third >> 8) & 0xff,
		result.third & 0xff
	], 0)

	console.log(`\nBackground Color 1: #${result.outer.toString(16).padStart(6, '0')}`)
	console.log(`Background Color 2: #${result.third.toString(16).padStart(6, '0')}`)

	// Analyze if these colors form a gradient
	console.log("\n--- Histogram Analysis ---")
	const histResult = histogramAnalysis(color1, color2, data, info, oklabSpace)

	console.log(`Is Gradient: ${histResult.isGradient}`)
	console.log(`Confidence: ${(histResult.confidence * 100).toFixed(1)}%`)
	console.log(`Coverage: ${(histResult.details.coverage * 100).toFixed(1)}%`)
	console.log(`Continuity Score: ${(histResult.details.continuityScore * 100).toFixed(1)}%`)
	console.log(`Gap Count: ${histResult.details.gapCount}`)

	console.log("\n--- Intermediate Zone Clustering ---")
	const clusterResult = clusterIntermediateZone(color1, color2, data, info, oklabSpace)

	console.log(`Is Gradient: ${clusterResult.isGradient}`)
	console.log(`Confidence: ${(clusterResult.confidence * 100).toFixed(1)}%`)
	console.log(`Intermediate Pixels: ${clusterResult.details.intermediateCount}`)
	console.log(`Intermediate Ratio: ${(clusterResult.details.intermediateRatio * 100).toFixed(2)}%`)
	if (clusterResult.details.clusterCount) {
		console.log(`Cluster Count: ${clusterResult.details.clusterCount}`)
		console.log(`Largest Cluster: ${clusterResult.details.largestClusterSize} pixels`)
	}

	console.log("\n--- Combined Detection ---")
	const combined = detectGradient(color1, color2, data, info, oklabSpace)

	console.log(`Final Decision: ${combined.isGradient ? 'GRADIENT' : 'SEPARATE COLORS'}`)
	console.log(`Confidence: ${(combined.confidence * 100).toFixed(1)}%`)
	console.log(`Methods Agree: ${combined.details.agreement ? 'Yes' : 'No'}`)

	return combined
}

// Example usage
const imagePath = process.argv[2] || './images/disney.avif'

try {
	await analyzeImageGradient(imagePath)
} catch (error) {
	console.error('Error:', error)
	console.log('\nUsage: node --experimental-strip-types example-gradient-detection.ts <image-path>')
	console.log('Example: node --experimental-strip-types example-gradient-detection.ts ./images/disney.avif')
}
