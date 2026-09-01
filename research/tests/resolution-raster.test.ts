import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import sharpModern from "sharp-modern"
import {
	AREA_BOX_RESAMPLING_POLICY,
	COMMON_SAMPLE_LIMIT,
	MODERN_RASTER_RUNTIME,
	NATIVE_DECODE_POLICY,
	RESOLUTION_PROFILES,
	RGB_OCCUPANCY_WORDS,
	SHARP_VERSIONS_SHA256,
	commonSampleOKLab,
	commonSampleRgb,
	createCommonDomainSamples,
	createNativeRgbOccupancy,
	decodeNativeRaster,
	exactBoxAxisCell,
	identifyRaster,
	mapCommonDomainSamples,
	maxEdgeDimensions,
	nativeRgbOccupancyHas,
	nearestCenterCoordinate,
	pixelBudgetDimensions,
	profileDimensions,
	resolutionProfilePolicy,
	renderResolutionProfile,
	renderResolutionProfiles,
	resizeAreaBoxRgb,
	validateDecodedNativeRaster,
	type DecodedNativeRaster,
	type ResolutionProfileDefinition,
	type RgbUcharRaster,
} from "../src/resolution-raster.ts"

function raster(width: number, height: number, data: Uint8Array): RgbUcharRaster {
	return { width, height, channels: 3, depth: "uchar", colorSpace: "srgb", data }
}

function decodedRaster(width: number, height: number, data: Uint8Array): DecodedNativeRaster {
	const native = raster(width, height, data)
	return { ...native, identity: identifyRaster(native, NATIVE_DECODE_POLICY) }
}

function profile(id: string): ResolutionProfileDefinition {
	const definition = RESOLUTION_PROFILES.find((candidate) => candidate.id === id)
	assert.ok(definition, `missing profile ${id}`)
	return definition
}

function patternedRgb(width: number, height: number): Uint8Array {
	const data = new Uint8Array(width * height * 3)
	for (let pixel = 0; pixel < width * height; pixel++) {
		const offset = pixel * 3
		data[offset] = pixel * 17 % 256
		data[offset + 1] = pixel * 43 % 256
		data[offset + 2] = pixel * 97 % 256
	}
	return data
}

test("predeclares only the compact versioned modern profile policies", () => {
	assert.deepEqual(RESOLUTION_PROFILES.map(({ id }) => id), [
		"native",
		"max-edge-224-lanczos3",
		"max-edge-224-cubic",
		"max-edge-224-nearest",
		"max-edge-224-area",
		"max-edge-320-lanczos3",
		"max-edge-448-lanczos3",
		"max-edge-896-lanczos3",
		"pixel-budget-50176-lanczos3",
		"pixel-budget-200704-lanczos3",
		"pixel-budget-802816-lanczos3",
	])
	const serialized = JSON.stringify(RESOLUTION_PROFILES)
	assert.equal(serialized.includes("data"), false)
	assert.equal(JSON.parse(serialized).length, 11)
	for (const definition of RESOLUTION_PROFILES) {
		assert.equal(definition.version, "resolution-raster-profile-v1")
	}
})

test("calculates explicit aspect-preserving dimensions without enlargement", () => {
	const expected: Record<string, [number, number]> = {
		native: [1000, 500],
		"max-edge-224-lanczos3": [224, 112],
		"max-edge-224-cubic": [224, 112],
		"max-edge-224-nearest": [224, 112],
		"max-edge-224-area": [224, 112],
		"max-edge-320-lanczos3": [320, 160],
		"max-edge-448-lanczos3": [448, 224],
		"max-edge-896-lanczos3": [896, 448],
		"pixel-budget-50176-lanczos3": [316, 158],
		"pixel-budget-200704-lanczos3": [633, 316],
		"pixel-budget-802816-lanczos3": [1000, 500],
	}
	for (const definition of RESOLUTION_PROFILES) {
		const dimensions = profileDimensions(1000, 500, definition)
		assert.deepEqual([dimensions.width, dimensions.height], expected[definition.id])
		assert.ok(dimensions.width <= 1000 && dimensions.height <= 500)
		assert.ok(Math.abs(dimensions.width * 500 - dimensions.height * 1000) <= 1000)
	}

	assert.deepEqual(maxEdgeDimensions(17, 101, 224), { width: 17, height: 101 })
	assert.deepEqual(pixelBudgetDimensions(17, 101, 50_176), { width: 17, height: 101 })
	const extreme = pixelBudgetDimensions(100_000, 1, 16_384)
	assert.ok(extreme.width * extreme.height <= 16_384)
})

test("decodes oriented native RGB uchar and composites transparency over white", async () => {
	const rgba = new Uint8Array([
		255, 0, 0, 128,
		0, 0, 255, 0,
	])
	const transparentPng = await sharpModern(rgba, { raw: { width: 2, height: 1, channels: 4 } }).png().toBuffer()
	const composited = await decodeNativeRaster(transparentPng)
	assert.deepEqual(
		{ width: composited.width, height: composited.height, channels: composited.channels, depth: composited.depth, colorSpace: composited.colorSpace },
		{ width: 2, height: 1, channels: 3, depth: "uchar", colorSpace: "srgb" },
	)
	assert.equal(composited.data[0], 255)
	assert.ok(composited.data[1] === 127 || composited.data[1] === 128)
	assert.equal(composited.data[1], composited.data[2])
	assert.deepEqual(Array.from(composited.data.subarray(3)), [255, 255, 255])

	const jpeg = await sharpModern(patternedRgb(2, 3), { raw: { width: 2, height: 3, channels: 3 } })
		.jpeg({ quality: 100, chromaSubsampling: "4:4:4" })
		.withMetadata({ orientation: 6 })
		.toBuffer()
	const oriented = await decodeNativeRaster(jpeg)
	assert.deepEqual([oriented.width, oriented.height], [3, 2])
})

test("identity paths preserve native dimensions and bytes", async () => {
	const sourceData = patternedRgb(17, 11)
	const encoded = await sharpModern(sourceData, { raw: { width: 17, height: 11, channels: 3 } }).png().toBuffer()
	const native = await decodeNativeRaster(encoded)
	const outputs = await renderResolutionProfiles(native)
	for (const output of outputs) {
		assert.deepEqual([output.width, output.height], [17, 11])
		assert.equal(output.data, native.data)
		assert.deepEqual(output.data, sourceData)
	}
	assert.equal(new Set(outputs.map(({ identity }) => identity.sha256)).size, outputs.length)
})

test("renders every profile from one decoded-native raw raster at its declared target", async () => {
	const native = decodedRaster(900, 450, patternedRgb(900, 450))
	const outputs = await renderResolutionProfiles(native)
	assert.equal(outputs.length, RESOLUTION_PROFILES.length)
	for (const output of outputs) {
		const expected = profileDimensions(native.width, native.height, output.profile)
		assert.deepEqual([output.width, output.height], [expected.width, expected.height])
		assert.ok(output.width <= native.width && output.height <= native.height)
		assert.equal(output.data.length, output.width * output.height * 3)
	}
})

test("deterministic area/box uses exact fractional source-cell coverage", () => {
	const values = [0, 30, 90, 120, 180, 240]
	const data = new Uint8Array(values.flatMap((value) => [value, value, value]))
	const resized = resizeAreaBoxRgb(raster(3, 2, data), 2, 1)
	assert.deepEqual(Array.from(resized.data), [75, 75, 75, 145, 145, 145])

	const half = resizeAreaBoxRgb(raster(2, 1, new Uint8Array([0, 0, 0, 1, 1, 1])), 1, 1)
	assert.deepEqual(Array.from(half.data), [1, 1, 1])
	const blackWhite = resizeAreaBoxRgb(raster(2, 1, new Uint8Array([0, 0, 0, 255, 255, 255])), 1, 1)
	assert.deepEqual(Array.from(blackWhite.data), [128, 128, 128])

	const policy = resolutionProfilePolicy(profile("max-edge-224-area"))
	assert.equal(AREA_BOX_RESAMPLING_POLICY.sampleDomain, "nonlinear-srgb-uchar-code-values")
	assert.match(policy, /nonlinear-srgb-uchar-code-values/)
	assert.match(policy, /half-up-to-uchar/)
	assert.doesNotMatch(policy, /linear-light/)
	assert.throws(() => resizeAreaBoxRgb(raster(1, 1, new Uint8Array(3)), 2, 1), /does not enlarge/)
})

test("box boundaries and nearest centers remain exact beyond safe Number products", () => {
	const sourceExtent = Number.MAX_SAFE_INTEGER
	const targetExtent = sourceExtent - 1
	assert.deepEqual(exactBoxAxisCell(0, targetExtent, sourceExtent), {
		sourceStart: 0,
		sourceEndExclusive: 2,
		firstWeight: targetExtent,
		lastWeight: 1,
	})
	assert.deepEqual(exactBoxAxisCell(targetExtent - 1, targetExtent, sourceExtent), {
		sourceStart: targetExtent - 1,
		sourceEndExclusive: sourceExtent,
		firstWeight: 1,
		lastWeight: targetExtent,
	})
	assert.equal(nearestCenterCoordinate(targetExtent - 1, targetExtent, sourceExtent), sourceExtent - 1)
	assert.equal(nearestCenterCoordinate(sourceExtent - 1, sourceExtent, sourceExtent), sourceExtent - 1)
})

test("native RGB occupancy is an exact 2^24-bit lookup", () => {
	const native = raster(4, 1, new Uint8Array([
		0, 0, 0,
		0, 0, 31,
		12, 34, 56,
		255, 255, 255,
	]))
	const occupancy = createNativeRgbOccupancy(native)
	assert.ok(occupancy instanceof Uint32Array)
	assert.equal(occupancy.length, RGB_OCCUPANCY_WORDS)
	for (const rgb of [[0, 0, 0], [0, 0, 31], [12, 34, 56], [255, 255, 255]] as const) {
		assert.equal(nativeRgbOccupancyHas(occupancy, rgb), true)
	}
	assert.equal(nativeRgbOccupancyHas(occupancy, [12, 34, 57]), false)
})

test("common-domain samples use exact center mapping and typed coordinates", async () => {
	const native = decodedRaster(8, 4, patternedRgb(8, 4))
	const samples = createCommonDomainSamples(native, 8)
	assert.deepEqual({ columns: samples.columns, rows: samples.rows, count: samples.count }, { columns: 4, rows: 2, count: 8 })
	assert.ok(samples.count <= COMMON_SAMPLE_LIMIT)
	assert.deepEqual(Array.from(samples.native.x), [1, 3, 5, 7, 1, 3, 5, 7])
	assert.deepEqual(Array.from(samples.native.y), [1, 1, 1, 1, 3, 3, 3, 3])
	assert.deepEqual(Array.from(samples.native.indices), [9, 11, 13, 15, 25, 27, 29, 31])
	assert.equal(nearestCenterCoordinate(0, 2, 4), 1)

	const mapped = mapCommonDomainSamples(samples, 3, 1)
	assert.ok(mapped.x instanceof Uint32Array)
	assert.ok(mapped.y instanceof Uint32Array)
	assert.ok(mapped.indices instanceof Uint32Array)
	assert.deepEqual(Array.from(mapped.x), [0, 1, 1, 2, 0, 1, 1, 2])
	assert.deepEqual(Array.from(mapped.indices), [0, 1, 1, 2, 0, 1, 1, 2])

	const nativeProfile = await renderResolutionProfile(native, profile("native"))
	const representativeRgb = commonSampleRgb(nativeProfile, samples)
	const occupancy = createNativeRgbOccupancy(native)
	for (let offset = 0; offset < representativeRgb.length; offset += 3) {
		assert.equal(nativeRgbOccupancyHas(occupancy, [
			representativeRgb[offset],
			representativeRgb[offset + 1],
			representativeRgb[offset + 2],
		]), true)
	}

	const red = decodedRaster(1, 1, new Uint8Array([255, 0, 0]))
	const labs = commonSampleOKLab(red, createCommonDomainSamples(red))
	assert.ok(labs instanceof Float32Array)
	assert.ok(Math.abs(labs[0] - 0.62796) < 0.0001)
	assert.ok(Math.abs(labs[1] - 0.22486) < 0.0001)
	assert.ok(Math.abs(labs[2] - 0.12585) < 0.0001)
})

test("raster and profile SHA-256 identities bind metadata, policy, runtime, and bytes", async () => {
	assert.equal(MODERN_RASTER_RUNTIME.sharp, "0.35.3")
	assert.equal(MODERN_RASTER_RUNTIME.node, process.versions.node)
	assert.equal(MODERN_RASTER_RUNTIME.platform, process.platform)
	assert.equal(MODERN_RASTER_RUNTIME.architecture, process.arch)
	assert.ok(MODERN_RASTER_RUNTIME.vips.length > 0)
	const canonicalVersions = JSON.stringify(Object.fromEntries(
		Object.entries(sharpModern.versions).sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0),
	))
	assert.equal(SHARP_VERSIONS_SHA256, createHash("sha256").update(canonicalVersions, "utf8").digest("hex"))
	assert.equal(MODERN_RASTER_RUNTIME.sharpVersionsSha256, SHARP_VERSIONS_SHA256)

	const bytes = new Uint8Array([1, 2, 3, 4, 5, 6])
	const horizontal = raster(2, 1, bytes)
	const repeated = identifyRaster(horizontal, "policy-a")
	assert.equal(repeated.sha256, identifyRaster(horizontal, "policy-a").sha256)
	assert.match(repeated.sha256, /^[0-9a-f]{64}$/)
	assert.notEqual(repeated.sha256, identifyRaster(horizontal, "policy-b").sha256)
	assert.notEqual(repeated.sha256, identifyRaster(raster(1, 2, bytes), "policy-a").sha256)
	assert.notEqual(repeated.sha256, identifyRaster(raster(2, 1, new Uint8Array([1, 2, 3, 4, 5, 7])), "policy-a").sha256)

	const sourceData = patternedRgb(257, 129)
	const encoded = await sharpModern(sourceData, { raw: { width: 257, height: 129, channels: 3 } }).png().toBuffer()
	const firstNative = await decodeNativeRaster(encoded)
	const secondNative = await decodeNativeRaster(encoded)
	assert.equal(firstNative.identity.sha256, secondNative.identity.sha256)
	assert.deepEqual(firstNative.data, secondNative.data)

	for (const id of ["max-edge-224-lanczos3", "max-edge-224-area"] as const) {
		const definition = profile(id)
		const first = await renderResolutionProfile(firstNative, definition)
		const second = await renderResolutionProfile(firstNative, definition)
		assert.deepEqual([first.width, first.height], [224, 112])
		assert.deepEqual(first.data, second.data)
		assert.equal(first.identity.sha256, second.identity.sha256)
		assert.equal(first.identity.parentNativeSha256, firstNative.identity.sha256)
		assert.match(first.identity.sha256, /^[0-9a-f]{64}$/)
	}
})

test("profile identity binds identical output bytes to its decoded-native parent", async () => {
	const definition = profile("max-edge-224-area")
	const firstNative = decodedRaster(448, 2, new Uint8Array(448 * 2 * 3))
	const secondNative = decodedRaster(896, 4, new Uint8Array(896 * 4 * 3))
	const first = await renderResolutionProfile(firstNative, definition)
	const second = await renderResolutionProfile(secondNative, definition)

	assert.deepEqual([first.width, first.height], [224, 1])
	assert.deepEqual([second.width, second.height], [224, 1])
	assert.deepEqual(first.data, second.data)
	assert.notEqual(firstNative.identity.sha256, secondNative.identity.sha256)
	assert.equal(first.identity.parentNativeSha256, firstNative.identity.sha256)
	assert.equal(second.identity.parentNativeSha256, secondNative.identity.sha256)
	assert.notEqual(first.identity.sha256, second.identity.sha256)
})

test("rendering rejects a decoded-native raster mutated after identity creation", async () => {
	const native = decodedRaster(257, 129, patternedRgb(257, 129))
	assert.equal(validateDecodedNativeRaster(native).sha256, native.identity.sha256)
	native.data[0] ^= 0xff

	assert.throws(() => validateDecodedNativeRaster(native), /identity is stale/)
	await assert.rejects(renderResolutionProfile(native, profile("native")), /identity is stale/)
	await assert.rejects(renderResolutionProfile(native, profile("max-edge-224-lanczos3")), /identity is stale/)
	await assert.rejects(renderResolutionProfiles(native), /identity is stale/)
})
