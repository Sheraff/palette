import assert from "node:assert/strict"
import test from "node:test"
import sharp from "sharp"
import { buildCandidateContext, emptyCandidateSpatialEvidence, type Candidate, type CandidateContext } from "../src/candidates.ts"
import { rgbToOKLab } from "../src/color.ts"
import { analyzeRegions } from "../src/regions.ts"
import {
	SCALE_AWARE_NATIVE_ALGORITHM_VERSION,
	SCALE_AWARE_NATIVE_POLICY_SHA256,
	extractScaleAwareNativePaletteWithContext,
	loadAndExtractScaleAwareNativePaletteWithContext,
	projectNativeCandidateContext,
} from "../src/scale-aware-native-extract.ts"
import type { RawImage, RGB } from "../src/types.ts"

function patterned(width: number, height: number): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let pixel = 0; pixel < width * height; pixel++) {
		const offset = pixel * 3
		data[offset] = pixel * 17 % 256
		data[offset + 1] = pixel * 43 % 256
		data[offset + 2] = pixel * 97 % 256
	}
	return { width, height, data }
}

function candidate(id: number, rgb: RGB, population: number): Candidate {
	const lab = rgbToOKLab(rgb)
	return {
		id,
		rgb,
		lab,
		hex: `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`,
		population,
		background: 0,
		saliency: 0,
		text: 0,
		chroma: Math.hypot(lab[1], lab[2]),
		generated: false,
		typographyOnly: false,
		regionIds: [],
		familyId: id,
		spatial: emptyCandidateSpatialEvidence(),
		familySpatial: emptyCandidateSpatialEvidence(),
	}
}

test("identity projection preserves native labels, colors, and populations", () => {
	const native = patterned(64, 48)
	const nativeAnalysis = analyzeRegions(native)
	const context = buildCandidateContext(nativeAnalysis, 12, true, { stableFamilyAnchors: true })
	const projection = projectNativeCandidateContext(context, native, analyzeRegions(native))
	const primaryRecords = context.candidateRecords.filter((record) =>
		!context.candidates.find((item) => item.id === record.candidateId)!.typographyOnly)
	for (let pixel = 0; pixel < projection.labels.length; pixel++) {
		const expected = primaryRecords.find((record) => record.mask[pixel] === 1)!.candidateId
		assert.equal(projection.labels[pixel], expected)
	}
	for (const projected of projection.candidates) {
		const original = context.candidates.find((item) => item.id === projected.id)!
		assert.deepEqual(projected.rgb, original.rgb)
		assert.ok(Math.abs(projected.population - original.population) < 1e-12)
	}
})

test("exact area projection resolves equal cell coverage by lower candidate ID", () => {
	const width = 448
	const height = 224
	const pixels = width * height
	const blackMask = new Uint8Array(pixels)
	const whiteMask = new Uint8Array(pixels)
	const data = new Uint8Array(pixels * 3)
	for (let pixel = 0; pixel < pixels; pixel++) {
		const x = pixel % width
		const y = Math.floor(pixel / width)
		const black = (x + y) % 2 === 0
		blackMask[pixel] = black ? 1 : 0
		whiteMask[pixel] = black ? 0 : 1
		data.fill(black ? 0 : 255, pixel * 3, pixel * 3 + 3)
	}
	const candidates = [candidate(0, [0, 0, 0], 0.5), candidate(1, [255, 255, 255], 0.5)]
	const context: CandidateContext = {
		candidates,
		bins: [],
		pixelBinIds: new Int32Array(pixels),
		representativePixelIndices: new Int32Array(),
		candidateRecords: [
			{ candidateId: 0, binIds: [], mask: blackMask, representativePixelIndex: 0 },
			{ candidateId: 1, binIds: [], mask: whiteMask, representativePixelIndex: 1 },
		],
		families: candidates.map((item) => ({
			id: item.id,
			anchorCandidateId: item.id,
			memberCandidateIds: [item.id],
			primaryCandidateIds: [item.id],
			mask: item.id === 0 ? blackMask : whiteMask,
			spatial: emptyCandidateSpatialEvidence(),
		})),
	}
	const observation = patterned(224, 112)
	const projection = projectNativeCandidateContext(context, { width, height, data }, analyzeRegions(observation))
	assert.ok(projection.labels.every((label) => label === 0))
	assert.ok(projection.candidates.every((item) => Math.abs(item.population - 0.5) < 1e-12))
})

test("fresh scale-aware inference emits only native source colors and keeps non-spatial controls", () => {
	const native = patterned(96, 72)
	const result = extractScaleAwareNativePaletteWithContext(native, native)
	assert.equal(result.extraction.version, SCALE_AWARE_NATIVE_ALGORITHM_VERSION)
	assert.equal(result.policySha256, SCALE_AWARE_NATIVE_POLICY_SHA256)
	assert.deepEqual(result.extraction.methods.expressive, result.canonicalControl.methods.expressive)
	assert.deepEqual(result.extraction.methods.quantized, result.canonicalControl.methods.quantized)
	const observed = new Set<string>()
	for (let offset = 0; offset < native.data.length; offset += 3) {
		observed.add(`${native.data[offset]},${native.data[offset + 1]},${native.data[offset + 2]}`)
	}
	for (const role of ["background", "foreground", "surface", "accent"] as const) {
		const color = result.extraction.methods.spatial[role]
		if (!color.generated) assert.ok(observed.has(color.rgb.join(",")))
	}
})

test("source adapter separates native authority from the max-edge observation", async () => {
	const source = patterned(320, 180)
	const encoded = await sharp(source.data, { raw: { width: source.width, height: source.height, channels: 3 } }).png().toBuffer()
	const result = await loadAndExtractScaleAwareNativePaletteWithContext(encoded)
	assert.deepEqual([result.extraction.width, result.extraction.height], [320, 180])
	assert.deepEqual([result.projection.width, result.projection.height], [224, 126])
	assert.match(result.nativeImageSha256, /^[0-9a-f]{64}$/)
	assert.match(result.observationImageSha256, /^[0-9a-f]{64}$/)
	assert.notEqual(result.nativeImageSha256, result.observationImageSha256)
})
