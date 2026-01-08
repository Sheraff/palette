import { test } from "node:test"
import assert from "node:assert"
import { histogramAnalysis, clusterIntermediateZone, detectGradient } from "../gradientDetection.ts"
import { oklabSpace } from "../spaces/oklab.ts"
import sharp from "sharp"
import { join } from "node:path"
import { extractColors } from "../extractColors.ts"
import { gapStatisticKmeans } from "../kmeans/gapStatistic.ts"

test("Histogram Analysis - Gradient Detection", () => {
	// Create a simple gradient image: 100x100, from red to blue horizontally
	const width = 100
	const height = 100
	const channels = 3
	const data = new Uint8ClampedArray(width * height * channels)

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * channels
			const ratio = x / (width - 1)
			data[i + 0] = Math.round(255 * (1 - ratio)) // R: 255 -> 0
			data[i + 1] = 0 // G: 0
			data[i + 2] = Math.round(255 * ratio) // B: 0 -> 255
		}
	}

	const color1 = oklabSpace.toHex([255, 0, 0], 0) // Red
	const color2 = oklabSpace.toHex([0, 0, 255], 0) // Blue

	const result = histogramAnalysis(color1, color2, data, { width, height, channels }, oklabSpace)

	console.log("Gradient test result:", result)
	assert.strictEqual(result.isGradient, true, "Should detect gradient")
	assert.ok(result.confidence > 0.5, "Should have high confidence")
})

test("Histogram Analysis - Separate Colors Detection", () => {
	// Create an image with two distinct regions: left half red, right half blue
	const width = 100
	const height = 100
	const channels = 3
	const data = new Uint8ClampedArray(width * height * channels)

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * channels
			if (x < width / 2) {
				data[i + 0] = 255 // Red
				data[i + 1] = 0
				data[i + 2] = 0
			} else {
				data[i + 0] = 0 // Blue
				data[i + 1] = 0
				data[i + 2] = 255
			}
		}
	}

	const color1 = oklabSpace.toHex([255, 0, 0], 0)
	const color2 = oklabSpace.toHex([0, 0, 255], 0)

	const result = histogramAnalysis(color1, color2, data, { width, height, channels }, oklabSpace)

	console.log("Separate colors test result:", result)
	assert.strictEqual(result.isGradient, false, "Should detect separate colors")
})

test("Intermediate Zone Clustering - Gradient Detection", () => {
	// Create a simple gradient image: 100x100, from green to yellow
	const width = 100
	const height = 100
	const channels = 3
	const data = new Uint8ClampedArray(width * height * channels)

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * channels
			const ratio = x / (width - 1)
			data[i + 0] = Math.round(255 * ratio) // R: 0 -> 255
			data[i + 1] = 255 // G: 255
			data[i + 2] = 0 // B: 0
		}
	}

	const color1 = oklabSpace.toHex([0, 255, 0], 0) // Green
	const color2 = oklabSpace.toHex([255, 255, 0], 0) // Yellow

	const result = clusterIntermediateZone(color1, color2, data, { width, height, channels }, oklabSpace)

	console.log("Clustering gradient test result:", result)
	assert.strictEqual(result.isGradient, true, "Should detect gradient")
	assert.ok(result.details.clusterCount <= 3, "Should have few clusters")
})

test("Intermediate Zone Clustering - Separate Colors", () => {
	// Create an image with separate color regions
	const width = 100
	const height = 100
	const channels = 3
	const data = new Uint8ClampedArray(width * height * channels)

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * channels
			if (x < width / 2) {
				data[i + 0] = 0
				data[i + 1] = 255
				data[i + 2] = 0
			} else {
				data[i + 0] = 255
				data[i + 1] = 255
				data[i + 2] = 0
			}
		}
	}

	const color1 = oklabSpace.toHex([0, 255, 0], 0)
	const color2 = oklabSpace.toHex([255, 255, 0], 0)

	const result = clusterIntermediateZone(color1, color2, data, { width, height, channels }, oklabSpace)

	console.log("Clustering separate colors test result:", result)
	// For sharp boundaries, there should be very few or no intermediate pixels
	assert.ok(result.details.intermediateCount < width * height * 0.1, "Should have few intermediate pixels")
})

test("Combined Gradient Detection", () => {
	// Create a gradient image
	const width = 100
	const height = 100
	const channels = 3
	const data = new Uint8ClampedArray(width * height * channels)

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * channels
			const ratio = y / (height - 1) // Vertical gradient
			data[i + 0] = Math.round(128 + 127 * ratio)
			data[i + 1] = Math.round(128 + 127 * ratio)
			data[i + 2] = Math.round(128 + 127 * ratio)
		}
	}

	const color1 = oklabSpace.toHex([128, 128, 128], 0) // Gray
	const color2 = oklabSpace.toHex([255, 255, 255], 0) // White

	const result = detectGradient(color1, color2, data, { width, height, channels }, oklabSpace)

	console.log("Combined detection result:", result)
	assert.strictEqual(result.isGradient, true, "Should detect gradient")

	// If both methods agree, confidence should be boosted
	if (result.details.agreement) {
		assert.ok(result.confidence > 0.7, "Should have high confidence when methods agree")
	}
})

const images = [
	{ img: 'artofficial.jpg', gradient: 'maybe' },
	{ img: 'horsley.jpg', gradient: 'maybe' },
	{ img: 'havana.jpg', gradient: 'maybe' },
	{ img: 'disney.avif', gradient: false },
	{ img: 'placebo.jpg', gradient: true },
	{ img: 'greenday.jpg', gradient: false },
	{ img: 'snarky.jpg', gradient: false },
	{ img: 'toxicity.jpg', gradient: false },
	{ img: 'slipknot.jpg', gradient: false },
	{ img: 'nada.jpg', gradient: 'maybe' },
	{ img: 'doja.jpg', gradient: true },
	{ img: 'infected.jpg', gradient: true },
	{ img: 'franz.jpg', gradient: false },
	{ img: 'loups.jpg', gradient: true },
	{ img: 'knuckles.jpg', gradient: true },
	{ img: 'meteora.jpg', gradient: false },
	{ img: 'muse.jpg', gradient: true },
	{ img: 'krafty.jpg', gradient: false },
	{ img: 'orelsan.jpg', gradient: true },
	{ img: 'once.jpg', gradient: true },
	{ img: 'johns.jpg', gradient: false },
	{ img: 'ybbb.jpg', gradient: false },
	{ img: 'nobs.jpg', gradient: false },
	{ img: 'maroon5.jpg', gradient: false },
	{ img: 'birdsofprey.jpg', gradient: 'maybe' },
	{ img: 'skap.jpg', gradient: 'maybe' },
	{ img: 'vvbrown.jpg', gradient: false },
	{ img: 'black.jpg', gradient: false },
	{ img: 'horrorwood.jpg', gradient: true },
	{ img: 'elephunk.jpg', gradient: false },
	{ img: 'slim.jpg', gradient: true },
]

const __dirname = new URL('.', import.meta.url).pathname
const img_dir = join(__dirname, '..', 'images')
for (const { img, gradient } of images) {
	if (gradient === 'maybe') continue // Skip uncertain cases
	test(`Gradient Detection on ${img} (expected gradient: ${gradient})`, async () => {
		const result = await sharp(join(img_dir, img))
			.raw({ depth: "uchar" })
			.toBuffer({ resolveWithObject: true })
			.then(async ({ data, info }) => extractColors(data, info, {
				workers: true,
				colorSpace: oklabSpace,
				clamp: 0.005,
				strategy: gapStatisticKmeans({ maxK: 20, minK: 4 }),
			}, img))

		assert.strictEqual(result.bgGradient, gradient, `Gradient detection for ${img} should be ${gradient}`)
	})
}