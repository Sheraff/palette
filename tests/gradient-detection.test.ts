import { test } from "node:test"
import assert from "node:assert"
import { histogramAnalysis, clusterIntermediateZone, detectGradient } from "../gradientDetection.ts"
import { oklabSpace } from "../spaces/oklab.ts"

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
