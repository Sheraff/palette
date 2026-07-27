import assert from "node:assert/strict"
import test from "node:test"
import sharp from "sharp"
import { extractPaletteWithContext } from "../src/extract.ts"
import { loadImage } from "../src/image.ts"
import { loadNativeImage } from "../src/native-resolution-image.ts"
import {
	NATIVE_RESOLUTION_ALGORITHM_VERSION,
	NATIVE_RESOLUTION_POLICY,
	NATIVE_RESOLUTION_POLICY_SHA256,
	extractNativeResolutionPaletteWithContext,
	loadAndExtractNativeResolutionPaletteWithContext,
} from "../src/native-resolution-extract.ts"
import { analyzeRegions } from "../src/regions.ts"
import type { RawImage } from "../src/types.ts"

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

function withoutTiming<T extends { diagnostics: { processingMs: number } }>(value: T): T {
	return { ...value, diagnostics: { ...value.diagnostics, processingMs: 0 } }
}

test("native loading preserves dimensions while canonical loading remains max-edge 224", async () => {
	const source = patterned(320, 180)
	const encoded = await sharp(source.data, { raw: { width: source.width, height: source.height, channels: 3 } }).png().toBuffer()
	const canonical = await loadImage(encoded)
	const native = await loadNativeImage(encoded)
	assert.deepEqual([canonical.width, canonical.height], [224, 126])
	assert.deepEqual([native.width, native.height], [320, 180])
	assert.deepEqual(native.data, source.data)
})

test("native loading enforces its metadata pixel bound before extraction", async () => {
	const source = patterned(3, 2)
	const encoded = await sharp(source.data, { raw: { width: source.width, height: source.height, channels: 3 } }).png().toBuffer()
	await assert.rejects(() => loadNativeImage(encoded, { limitInputPixels: 4 }), /pixel limit|Input image exceeds pixel limit|exceeds 4/)
	await assert.rejects(() => loadNativeImage(encoded, { limitInputPixels: 0 }), /positive safe integer/)
})

test("native adapter preserves the complete 0.19 payload except its experiment identity", () => {
	const image = patterned(64, 48)
	const direct = extractPaletteWithContext(image)
	const native = extractNativeResolutionPaletteWithContext(image)
	assert.equal(native.extraction.version, NATIVE_RESOLUTION_ALGORITHM_VERSION)
	assert.deepEqual(withoutTiming(native.extraction), withoutTiming({
		...direct.extraction,
		version: NATIVE_RESOLUTION_ALGORITHM_VERSION,
	}))
	assert.deepEqual(native.analysis, direct.analysis)
	assert.deepEqual(native.candidates, direct.candidates)
	assert.equal(native.resolution.policy, NATIVE_RESOLUTION_POLICY)
	assert.match(native.resolution.policySha256, /^[0-9a-f]{64}$/)
	assert.equal(native.resolution.policySha256, NATIVE_RESOLUTION_POLICY_SHA256)
	assert.match(native.resolution.nativeImageSha256, /^[0-9a-f]{64}$/)
})

test("region analysis accepts native rasters above the former argument-spread limit", () => {
	const image = patterned(400, 320)
	const analysis = analyzeRegions(image)
	assert.deepEqual([analysis.width, analysis.height, analysis.labels.length], [400, 320, 128_000])
	assert.ok(analysis.regions.length > 0)
})

test("source adapter performs native decode and unchanged downstream extraction", async () => {
	const source = patterned(96, 72)
	const encoded = await sharp(source.data, { raw: { width: source.width, height: source.height, channels: 3 } }).png().toBuffer()
	const result = await loadAndExtractNativeResolutionPaletteWithContext(encoded)
	assert.deepEqual([result.extraction.width, result.extraction.height], [96, 72])
	const observed = new Set<string>()
	for (let offset = 0; offset < source.data.length; offset += 3) {
		observed.add(`${source.data[offset]},${source.data[offset + 1]},${source.data[offset + 2]}`)
	}
	for (const candidate of result.extraction.candidates) assert.ok(observed.has(candidate.rgb.join(",")))
})
