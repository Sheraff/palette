import assert from "node:assert/strict"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { buildCandidates } from "../src/candidates.ts"
import {
	buildChromaticCandidateAvailability,
	extractChromaticCandidateAvailability,
} from "../src/chromatic-candidate-availability.ts"
import { chroma, rgbToOKLab } from "../src/color.ts"
import { addDeterministicNoise, cropOnePixel, loadImage } from "../src/image.ts"
import { extractRegionGraph017Palette as extractPalette } from "../src/region-graph-0.17-extract.ts"
import type { Region, RegionAnalysis } from "../src/regions.ts"
import type { RGB } from "../src/types.ts"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))
const reviewedSource = join(projectRoot, "00/ab67616d0000b2730000e47a4e869d4323ad0e3d.jpg")

function exactPixel(data: Uint8Array, rgb: RGB): boolean {
	for (let offset = 0; offset < data.length; offset += 3) {
		if (data[offset] === rgb[0] && data[offset + 1] === rgb[1] && data[offset + 2] === rgb[2]) return true
	}
	return false
}

function gridAnalysis(width: number, height: number, colorAt: (x: number, y: number) => RGB): RegionAnalysis {
	const total = width * height
	const data = new Uint8Array(total * 3)
	const labs = new Float32Array(total * 3)
	const labels = new Int32Array(total)
	const colors: RGB[] = []
	const areas: number[] = []
	const byColor = new Map<string, number>()
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const pixel = y * width + x
			const rgb = colorAt(x, y)
			const key = rgb.join(",")
			let id = byColor.get(key)
			if (id === undefined) {
				id = colors.length
				byColor.set(key, id)
				colors.push(rgb)
				areas.push(0)
			}
			areas[id]++
			labels[pixel] = id
			data.set(rgb, pixel * 3)
			labs.set(rgbToOKLab(rgb), pixel * 3)
		}
	}
	const regions: Region[] = colors.map((rgb, id) => {
		const lab = rgbToOKLab(rgb)
		return {
			id,
			area: areas[id],
			population: areas[id] / total,
			centerX: 0.5,
			centerY: 0.5,
			lab,
			rgb,
			borderPixels: 0,
			sideCount: 0,
			edge: 0,
			variance: 0,
			distinctiveness: 0,
			localContrast: 0,
			background: id === 0 ? 1 : 0,
			saliency: id === 0 ? 0 : 0.8,
			text: id === 0 ? 0 : 0.4,
			chroma: chroma(lab),
			neighbors: [],
		}
	})
	return { width, height, data, labs, labels, regions, edges: new Float32Array(total) }
}

test("availability wrapper preserves canonical extraction and exposes reviewed missing hue families", async () => {
	const image = await loadImage(reviewedSource)
	const canonical = extractPalette(image)
	const result = extractChromaticCandidateAvailability(image)

	assert.deepEqual(
		{ ...result.extraction, diagnostics: { ...result.extraction.diagnostics, processingMs: 0 } },
		{ ...canonical, diagnostics: { ...canonical.diagnostics, processingMs: 0 } },
	)
	assert.deepEqual(result.certificate.supplements.map((supplement) => supplement.anchorDegrees), [30, 300])
	assert.equal(result.certificate.supplements.length, 2)
	assert.ok(result.certificate.supplements.every((supplement) => exactPixel(image.data, supplement.rgb)))
	assert.ok(result.certificate.supplements.every((supplement) => supplement.nearestBaselineDistance > 0.055))
	assert.equal(result.certificate.invariants.proposedCandidatesNotPassedToRoleSolvers, true)
})

test("reviewed chromatic family anchors survive crop and deterministic noise", async () => {
	const image = await loadImage(reviewedSource)
	const variants = [image, cropOnePixel(image), addDeterministicNoise(image)]
	const anchors = variants.map((variant) =>
		extractChromaticCandidateAvailability(variant).certificate.supplements.map((supplement) => supplement.anchorDegrees))
	assert.deepEqual(anchors, [[30, 300], [30, 300], [30, 300]])
})

test("sub-threshold isolated chromatic speckles do not create supplements", () => {
	const black: RGB = [8, 8, 8]
	const pink: RGB = [240, 90, 170]
	const analysis = gridAnalysis(100, 100, (x, y) => x < 4 && y < 5 ? pink : black)
	const baseline = buildCandidates(analysis, 1, true)
	const result = buildChromaticCandidateAvailability(analysis, baseline)

	assert.equal(20 / 10_000 < 0.005, true)
	assert.equal(result.supplements.length, 0)
})

test("chromatic availability is deterministic", async () => {
	const image = await loadImage(reviewedSource)
	assert.deepEqual(
		extractChromaticCandidateAvailability(image).certificate,
		extractChromaticCandidateAvailability(image).certificate,
	)
})
