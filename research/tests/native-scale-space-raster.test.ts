import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import {
	NATIVE_SCALE_SPACE_CORPUS_TARGETS,
	NATIVE_SCALE_SPACE_LOW_PASS_FILTER_POLICY,
	NATIVE_SCALE_SPACE_MAX_NATIVE_PIXELS,
	NATIVE_SCALE_SPACE_Q24,
	NATIVE_SCALE_SPACE_TYPED_ARRAY_HASH_VERSION,
	accumulateQ24PartitionPlane,
	accumulateQ24PartitionSummedAreaTable,
	buildBinaryMaskSummedAreaTable,
	canonicalJson,
	canonicalBinaryMaskAsQ24Hash,
	canonicalTypedArrayHash,
	centeredClippedAxisWindow,
	centeredClippedBoxQ24,
	centeredClippedBoxQ24At,
	centeredClippedBoxQ24AtGeometry,
	createCenteredClippedBoxGeometry,
	createCenteredClippedBoxQ24Evaluator,
	createArmViewIdentity,
	createArmAViewIdentityFromMask,
	createLowPassFilterIdentity,
	createQ24PartitionResidualAccumulator,
	exactAxisSegments,
	exactCenteredClippedBoxValue,
	filterSummedAreaTableQ24,
	finalizeQ24PartitionResidual,
	nativeScaleSpaceMaxEdgeDimensions,
	nativeScaleSpacePixelBudgetDimensions,
	nativeScaleSpaceRasterBounds,
	nativeScaleSpaceTargetDimensions,
	nativeScaleSpaceTargetDimensionsEqual,
	quantizeQ24HalfUp,
	queryBinaryMaskSummedAreaTable,
	resolveNativeScaleSpaceTarget,
	sampleQ24PlaneAtTargetCenters,
	typedArrayHashManifest,
	verifyQ24CenterSamplesExact,
	type NativeScaleSpaceTypedArray,
} from "../src/native-scale-space-raster.ts"

function bruteForceExact(
	mask: Uint8Array,
	width: number,
	height: number,
	targetWidth: number,
	targetHeight: number,
	x: number,
	y: number,
): { numerator: bigint; denominator: bigint } {
	const qx = 2n * BigInt(targetWidth)
	const qy = 2n * BigInt(targetHeight)
	const centerX = (2n * BigInt(x) + 1n) * BigInt(targetWidth)
	const centerY = (2n * BigInt(y) + 1n) * BigInt(targetHeight)
	const widthBig = BigInt(width)
	const heightBig = BigInt(height)
	const lowerX = centerX > widthBig ? centerX - widthBig : 0n
	const upperX = centerX + widthBig < widthBig * qx ? centerX + widthBig : widthBig * qx
	const lowerY = centerY > heightBig ? centerY - heightBig : 0n
	const upperY = centerY + heightBig < heightBig * qy ? centerY + heightBig : heightBig * qy
	let numerator = 0n
	for (let sourceY = 0; sourceY < height; sourceY++) {
		const cellLowerY = BigInt(sourceY) * qy
		const cellUpperY = BigInt(sourceY + 1) * qy
		const overlapY = [0n, (upperY < cellUpperY ? upperY : cellUpperY) -
			(lowerY > cellLowerY ? lowerY : cellLowerY)].reduce((maximum, value) => value > maximum ? value : maximum)
		for (let sourceX = 0; sourceX < width; sourceX++) {
			const cellLowerX = BigInt(sourceX) * qx
			const cellUpperX = BigInt(sourceX + 1) * qx
			const overlapX = [0n, (upperX < cellUpperX ? upperX : cellUpperX) -
				(lowerX > cellLowerX ? lowerX : cellLowerX)].reduce((maximum, value) => value > maximum ? value : maximum)
			numerator += BigInt(mask[sourceY * width + sourceX]) * overlapX * overlapY
		}
	}
	return { numerator, denominator: (upperX - lowerX) * (upperY - lowerY) }
}

function expectedTypedHash(type: string, shape: readonly number[], length: number, bytes: readonly number[]): string {
	const header = `{"endianness":"big","length":${length},"negativeZero":"canonical-positive-zero","nonfinite":"reject",` +
		`"shape":[${shape.join(",")}],"type":"${type}","version":"${NATIVE_SCALE_SPACE_TYPED_ARRAY_HASH_VERSION}"}`
	return createHash("sha256").update(header, "utf8").update("\0").update(new Uint8Array(bytes)).digest("hex")
}

test("constructs exact clipped centered windows and merges same-pixel fractions", () => {
	const left = centeredClippedAxisWindow(0, 4, 2)
	assert.deepEqual({
		q: left.q,
		lower: left.lowerNumerator,
		upper: left.upperNumerator,
		overlap: left.overlapNumerator,
	}, { q: 4n, lower: 0n, upper: 6n, overlap: 6n })
	assert.deepEqual(left.segments, [
		{ start: 0, endExclusive: 1, overlapNumerator: 4n },
		{ start: 1, endExclusive: 2, overlapNumerator: 2n },
	])
	const middle = centeredClippedAxisWindow(1, 4, 2)
	assert.deepEqual([middle.lowerNumerator, middle.upperNumerator], [2n, 10n])
	const right = centeredClippedAxisWindow(3, 4, 2)
	assert.deepEqual([right.lowerNumerator, right.upperNumerator], [10n, 16n])

	assert.deepEqual(exactAxisSegments(12n, 17n, 10n, 3), [
		{ start: 1, endExclusive: 2, overlapNumerator: 5n },
	])
	assert.deepEqual(exactAxisSegments(2n, 27n, 10n, 3), [
		{ start: 0, endExclusive: 1, overlapNumerator: 8n },
		{ start: 1, endExclusive: 2, overlapNumerator: 10n },
		{ start: 2, endExclusive: 3, overlapNumerator: 7n },
	])
	assert.deepEqual(exactAxisSegments(0n, 30n, 10n, 3), [
		{ start: 0, endExclusive: 3, overlapNumerator: 10n },
	])
	assert.throws(() => exactAxisSegments(4n, 4n, 10n, 3), /nonempty/)
	assert.throws(() => centeredClippedAxisWindow(0, 3, 4), /do not enlarge/)
})

test("builds one exact Uint32 SAT and answers half-open rectangle counts", () => {
	const mask = new Uint8Array([
		1, 0, 1, 1,
		0, 1, 0, 1,
		1, 1, 0, 0,
	])
	const sat = buildBinaryMaskSummedAreaTable(mask, 4, 3)
	assert.equal(sat.data.constructor, Uint32Array)
	assert.equal(sat.data.length, 5 * 4)
	assert.equal(sat.data[sat.data.length - 1], 7)
	assert.equal(queryBinaryMaskSummedAreaTable(sat, 0, 0, 4, 3), 7)
	assert.equal(queryBinaryMaskSummedAreaTable(sat, 1, 0, 4, 2), 4)
	assert.equal(queryBinaryMaskSummedAreaTable(sat, 2, 1, 2, 3), 0)
	assert.throws(() => queryBinaryMaskSummedAreaTable(sat, -1, 0, 1, 1), /outside/)
	assert.throws(() => buildBinaryMaskSummedAreaTable(new Uint8Array([2]), 1, 1), /0 or 1/)

	const reused = new Uint32Array(sat.data.length).fill(0xffff_ffff)
	assert.equal(buildBinaryMaskSummedAreaTable(mask, 4, 3, reused).data, reused)
	assert.deepEqual(reused, sat.data)
})

test("SAT centered boxes equal independent BigInt brute force for fractional and clipped windows", () => {
	const width = 7
	const height = 5
	const targetWidth = 3
	const targetHeight = 2
	const mask = new Uint8Array(width * height)
	for (let index = 0; index < mask.length; index++) mask[index] = (index * 17 + Math.floor(index / width) * 3) % 5 < 2 ? 1 : 0
	const sat = buildBinaryMaskSummedAreaTable(mask, width, height)
	const geometry = createCenteredClippedBoxGeometry(width, height, targetWidth, targetHeight)
	const evaluate = createCenteredClippedBoxQ24Evaluator(sat, geometry)
	const plane = filterSummedAreaTableQ24(sat, targetWidth, targetHeight)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const expected = bruteForceExact(mask, width, height, targetWidth, targetHeight, x, y)
			const actual = exactCenteredClippedBoxValue(sat, x, y, targetWidth, targetHeight)
			assert.deepEqual({ numerator: actual.numerator, denominator: actual.denominator }, expected)
			assert.equal(plane[y * width + x], quantizeQ24HalfUp(expected.numerator, expected.denominator))
			assert.equal(centeredClippedBoxQ24AtGeometry(sat, x, y, geometry),
				centeredClippedBoxQ24At(sat, x, y, targetWidth, targetHeight))
			assert.equal(evaluate(y * width + x), plane[y * width + x])
		}
	}
	assert.throws(() => evaluate(width * height), /outside/)
	assert.throws(() => centeredClippedBoxQ24AtGeometry(sat, width, 0, geometry), /geometry/)
	assert.deepEqual(centeredClippedBoxQ24(mask, width, height, targetWidth, targetHeight), plane)

	const all = centeredClippedBoxQ24(new Uint8Array(width * height).fill(1), width, height, targetWidth, targetHeight)
	assert.equal(all.every((value) => value === NATIVE_SCALE_SPACE_Q24), true)
	const none = centeredClippedBoxQ24(new Uint8Array(width * height), width, height, targetWidth, targetHeight)
	assert.equal(none.every((value) => value === 0), true)
})

test("Q0.24 quantization is bounded and rounds exact halves upward", () => {
	const twiceQ = 2n * BigInt(NATIVE_SCALE_SPACE_Q24)
	assert.equal(quantizeQ24HalfUp(0n, 7n), 0)
	assert.equal(quantizeQ24HalfUp(7n, 7n), NATIVE_SCALE_SPACE_Q24)
	assert.equal(quantizeQ24HalfUp(1n, twiceQ), 1)
	assert.equal(quantizeQ24HalfUp(3n, twiceQ), 2)
	assert.equal(quantizeQ24HalfUp(1n, 3n), 5_592_405)
	assert.throws(() => quantizeQ24HalfUp(-1n, 2n), /inside/)
	assert.throws(() => quantizeQ24HalfUp(3n, 2n), /inside/)
	assert.throws(() => quantizeQ24HalfUp(0n, 0n), /positive/)
	assert.equal(NATIVE_SCALE_SPACE_LOW_PASS_FILTER_POLICY.quantization.maximumRealError, "1/33554432")
})

test("safe-integer hot evaluation exactly equals the BigInt oracle", () => {
	let state = 0x6d2b79f5
	const random = () => {
		state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
		return state
	}
	for (let example = 0; example < 24; example++) {
		const width = 3 + random() % 29
		const height = 3 + random() % 23
		const targetWidth = 1 + random() % width
		const targetHeight = 1 + random() % height
		const mask = new Uint8Array(width * height)
		for (let pixel = 0; pixel < mask.length; pixel++) mask[pixel] = random() % 5 < 2 ? 1 : 0
		const sat = buildBinaryMaskSummedAreaTable(mask, width, height)
		const plane = filterSummedAreaTableQ24(sat, targetWidth, targetHeight)
		for (let pixel = 0; pixel < plane.length; pixel++) {
			const x = pixel % width
			const y = Math.floor(pixel / width)
			const oracle = exactCenteredClippedBoxValue(sat, x, y, targetWidth, targetHeight)
			assert.equal(plane[pixel], quantizeQ24HalfUp(oracle.numerator, oracle.denominator))
		}
	}
	assert.match(NATIVE_SCALE_SPACE_LOW_PASS_FILTER_POLICY.version, /q0\.24-v2$/)
	assert.ok(NATIVE_SCALE_SPACE_LOW_PASS_FILTER_POLICY.evaluation.maximumRoundedScaledNumerator < Number.MAX_SAFE_INTEGER)
})

test("sequentially validates independently rounded partition mass residuals", () => {
	const width = 8
	const height = 5
	const labels = new Uint8Array(width * height)
	for (let pixel = 0; pixel < labels.length; pixel++) labels[pixel] = pixel % 3
	const accumulator = createQ24PartitionResidualAccumulator(labels.length, 3)
	for (let candidate = 0; candidate < 3; candidate++) {
		const mask = new Uint8Array(labels.length)
		for (let pixel = 0; pixel < labels.length; pixel++) mask[pixel] = labels[pixel] === candidate ? 1 : 0
		accumulateQ24PartitionPlane(accumulator, centeredClippedBoxQ24(mask, width, height, 3, 2))
	}
	const summary = finalizeQ24PartitionResidual(accumulator)
	assert.equal(summary.bound, 1)
	assert.ok(summary.minimum >= -1 && summary.maximum <= 1)
	assert.ok(summary.maximumAbsolute <= 1)
	assert.match(summary.sumDecimal, /^-?\d+$/)
	const residualOutput = new Int32Array(labels.length)
	assert.equal(createQ24PartitionResidualAccumulator(labels.length, 3, residualOutput).residuals, residualOutput)
	assert.throws(() => createQ24PartitionResidualAccumulator(labels.length, 3, new Int32Array(labels.length - 1)), /matching/)

	const direct = createQ24PartitionResidualAccumulator(labels.length, 3)
	const geometry = createCenteredClippedBoxGeometry(width, height, 3, 2)
	for (let candidate = 0; candidate < 3; candidate++) {
		const mask = new Uint8Array(labels.length)
		for (let pixel = 0; pixel < labels.length; pixel++) mask[pixel] = labels[pixel] === candidate ? 1 : 0
		accumulateQ24PartitionSummedAreaTable(direct, buildBinaryMaskSummedAreaTable(mask, width, height), geometry)
	}
	assert.deepEqual(finalizeQ24PartitionResidual(direct), summary)

	const exactHalfResidual = createQ24PartitionResidualAccumulator(1, 2)
	accumulateQ24PartitionPlane(exactHalfResidual, new Uint32Array([1]))
	accumulateQ24PartitionPlane(exactHalfResidual, new Uint32Array([NATIVE_SCALE_SPACE_Q24]))
	assert.equal(finalizeQ24PartitionResidual(exactHalfResidual).maximum, 1)

	const invalid = createQ24PartitionResidualAccumulator(1, 2)
	accumulateQ24PartitionPlane(invalid, new Uint32Array([2]))
	accumulateQ24PartitionPlane(invalid, new Uint32Array([NATIVE_SCALE_SPACE_Q24]))
	assert.throws(() => finalizeQ24PartitionResidual(invalid), /exceeds bound/)
})

test("Arm C samples exact B centers and records native source indices", () => {
	const source = new Uint32Array(5 * 3)
	for (let index = 0; index < source.length; index++) source[index] = index * 1_000
	const sampled = sampleQ24PlaneAtTargetCenters(source, 5, 3, 3, 2)
	assert.deepEqual(Array.from(sampled.sourceIndices), [0, 2, 4, 10, 12, 14])
	assert.deepEqual(Array.from(sampled.values), [0, 2_000, 4_000, 10_000, 12_000, 14_000])
	assert.equal(verifyQ24CenterSamplesExact(source, 5, 3, sampled), true)

	const identity = sampleQ24PlaneAtTargetCenters(source, 5, 3, 5, 3)
	assert.deepEqual(Array.from(identity.sourceIndices), Array.from({ length: 15 }, (_, index) => index))
	const changed = { ...sampled, values: sampled.values.slice() }
	changed.values[0]++
	assert.throws(() => verifyQ24CenterSamplesExact(source, 5, 3, changed), /does not equal/)
	const remapped = { ...sampled, sourceIndices: sampled.sourceIndices.slice() }
	remapped.sourceIndices[0] = 1
	assert.throws(() => verifyQ24CenterSamplesExact(source, 5, 3, remapped), /nearest-center/)
	assert.throws(() => sampleQ24PlaneAtTargetCenters(new Uint32Array([NATIVE_SCALE_SPACE_Q24 + 1]), 1, 1, 1, 1), /above Q/)
})

test("strict canonical JSON sorts recursively, normalizes -0, and rejects noncanonical values", () => {
	assert.equal(canonicalJson({ z: -0, a: { y: 2, b: 3 }, list: [3, { d: 4, c: 5 }] }),
		'{"a":{"b":3,"y":2},"list":[3,{"c":5,"d":4}],"z":0}')
	assert.equal(canonicalJson(Object.assign(Object.create(null), { b: 2, a: 1 })), '{"a":1,"b":2}')
	assert.throws(() => canonicalJson({ value: undefined }), /undefined/)
	assert.throws(() => canonicalJson([1, , 3]), /sparse/)
	assert.throws(() => canonicalJson(Number.NaN), /finite/)
	assert.throws(() => canonicalJson(Number.POSITIVE_INFINITY), /finite/)
	assert.throws(() => canonicalJson(1n), /BigInt/)
	assert.throws(() => canonicalJson(Symbol("x")), /symbols/)
	assert.throws(() => canonicalJson(() => 1), /functions/)
	assert.throws(() => canonicalJson(new Date(0)), /unsupported/)
	assert.throws(() => canonicalJson(new Uint8Array([1])), /unsupported/)
	const cyclic: { self?: unknown } = {}
	cyclic.self = cyclic
	assert.throws(() => canonicalJson(cyclic), /cyclic/)
})

test("typed-array hashes encode every declared type as exact big-endian values", () => {
	const cases: Array<{ array: NativeScaleSpaceTypedArray; type: string; bytes: number[] }> = [
		{ array: new Uint8Array([0, 255]), type: "Uint8Array", bytes: [0, 255] },
		{ array: new Uint16Array([0x1234, 0xffff]), type: "Uint16Array", bytes: [0x12, 0x34, 0xff, 0xff] },
		{ array: new Uint32Array([0x01020304, 0xffff_ffff]), type: "Uint32Array", bytes: [1, 2, 3, 4, 0xff, 0xff, 0xff, 0xff] },
		{ array: new Int32Array([-1, -0x8000_0000]), type: "Int32Array", bytes: [0xff, 0xff, 0xff, 0xff, 0x80, 0, 0, 0] },
		{ array: new Float32Array([-0, 1.5]), type: "Float32Array", bytes: [0, 0, 0, 0, 0x3f, 0xc0, 0, 0] },
		{ array: new Float64Array([-0, -2.25]), type: "Float64Array", bytes: [0, 0, 0, 0, 0, 0, 0, 0, 0xc0, 0x02, 0, 0, 0, 0, 0, 0] },
	]
	for (const { array, type, bytes } of cases) {
		assert.equal(canonicalTypedArrayHash(array, [1, 2]), expectedTypedHash(type, [1, 2], 2, bytes))
		assert.deepEqual(typedArrayHashManifest(array, [1, 2]).shape, [1, 2])
	}
	const negativeZero32 = new Float32Array([-0])
	const negativeZero64 = new Float64Array([-0])
	assert.equal(canonicalTypedArrayHash(negativeZero32), canonicalTypedArrayHash(new Float32Array([0])))
	assert.equal(canonicalTypedArrayHash(negativeZero64), canonicalTypedArrayHash(new Float64Array([0])))
	assert.equal(Object.is(negativeZero32[0], -0), true)
	assert.equal(Object.is(negativeZero64[0], -0), true)
	assert.throws(() => canonicalTypedArrayHash(new Float32Array([Number.NaN])), /nonfinite/)
	assert.throws(() => canonicalTypedArrayHash(new Float64Array([Number.NEGATIVE_INFINITY])), /nonfinite/)
	assert.throws(() => canonicalTypedArrayHash(new Int16Array([1]) as unknown as NativeScaleSpaceTypedArray), /canonical declared/)
	assert.throws(() => canonicalTypedArrayHash(Buffer.from([1]) as unknown as NativeScaleSpaceTypedArray), /canonical declared/)
	assert.throws(() => canonicalTypedArrayHash(new Uint8Array(2), [3]), /shape product/)
})

test("target wrappers preserve attribution, dimensions, ratios, and no-enlargement", () => {
	assert.deepEqual(NATIVE_SCALE_SPACE_CORPUS_TARGETS, [
		{ kind: "max-edge", value: 224 },
		{ kind: "max-edge", value: 448 },
		{ kind: "pixel-budget", value: 50_176 },
		{ kind: "pixel-budget", value: 200_704 },
	])
	assert.deepEqual(nativeScaleSpaceMaxEdgeDimensions(1000, 500, 224), { width: 224, height: 112 })
	assert.deepEqual(nativeScaleSpacePixelBudgetDimensions(1000, 500, 50_176), { width: 316, height: 158 })
	assert.deepEqual(nativeScaleSpaceTargetDimensions(17, 101, { kind: "max-edge", value: 224 }), { width: 17, height: 101 })
	const target = resolveNativeScaleSpaceTarget(1000, 500, { kind: "max-edge", value: 224 })
	assert.deepEqual(target, {
		target: { kind: "max-edge", value: 224 },
		width: 224,
		height: 112,
		pixels: 25_088,
		nativeToTargetWidthRatio: 1000 / 224,
		nativeToTargetHeightRatio: 500 / 112,
	})
	assert.equal(nativeScaleSpaceTargetDimensionsEqual(
		nativeScaleSpaceTargetDimensions(32, 24, { kind: "max-edge", value: 8 }),
		nativeScaleSpaceTargetDimensions(32, 24, { kind: "pixel-budget", value: 64 }),
	), false)
	assert.equal(nativeScaleSpaceTargetDimensionsEqual(
		nativeScaleSpaceTargetDimensions(32, 32, { kind: "max-edge", value: 8 }),
		nativeScaleSpaceTargetDimensions(32, 32, { kind: "pixel-budget", value: 64 }),
	), true)
})

test("allocation bounds and identities bind exact raster policy and keep B/C views distinct", () => {
	assert.deepEqual(nativeScaleSpaceRasterBounds(32, 24), {
		width: 32,
		height: 24,
		pixels: 768,
		rgbBytes: 2_304,
		satLength: 825,
		satBytes: 3_300,
		q24Bytes: 3_072,
		sourceIndexBytes: 3_072,
	})
	const maximum = nativeScaleSpaceRasterBounds(NATIVE_SCALE_SPACE_MAX_NATIVE_PIXELS, 1)
	assert.equal(maximum.pixels, NATIVE_SCALE_SPACE_MAX_NATIVE_PIXELS)
	assert.equal(maximum.rgbBytes, 6_300_000)
	assert.equal(maximum.satBytes, (NATIVE_SCALE_SPACE_MAX_NATIVE_PIXELS + 1) * 2 * 4)
	assert.throws(() => nativeScaleSpaceRasterBounds(NATIVE_SCALE_SPACE_MAX_NATIVE_PIXELS + 1, 1), /cannot exceed/)
	assert.throws(() => nativeScaleSpaceRasterBounds(0, 1), /positive/)

	const parentNativeIdentity = "1".repeat(64)
	const mask = new Uint8Array(32 * 24)
	mask[17] = 1
	const maskSha256 = canonicalTypedArrayHash(mask, [24, 32])
	const armAValues = new Uint32Array(mask.length)
	for (let index = 0; index < mask.length; index++) armAValues[index] = mask[index] * NATIVE_SCALE_SPACE_Q24
	assert.equal(canonicalBinaryMaskAsQ24Hash(mask, [24, 32]), canonicalTypedArrayHash(armAValues, [24, 32]))
	assert.deepEqual(createArmAViewIdentityFromMask({ width: 32, height: 24, mask, parentMaskSha256: maskSha256 }),
		createArmViewIdentity({ arm: "A", width: 32, height: 24, values: armAValues, parentMaskSha256: maskSha256 }))
	const filter = createLowPassFilterIdentity({
		sourceWidth: 32,
		sourceHeight: 24,
		targetWidth: 8,
		targetHeight: 6,
		parentNativeIdentity,
		binaryMaskSha256: maskSha256,
	})
	assert.match(filter.sha256, /^[0-9a-f]{64}$/)
	assert.equal(Object.isFrozen(filter.policy.window), true)
	assert.equal(createLowPassFilterIdentity({
		sourceWidth: 32,
		sourceHeight: 24,
		targetWidth: 8,
		targetHeight: 6,
		parentNativeIdentity,
		binaryMaskSha256: maskSha256,
	}).sha256, filter.sha256)
	assert.notEqual(createLowPassFilterIdentity({
		sourceWidth: 32,
		sourceHeight: 24,
		targetWidth: 16,
		targetHeight: 12,
		parentNativeIdentity,
		binaryMaskSha256: maskSha256,
	}).sha256, filter.sha256)

	const bValues = new Uint32Array(32 * 24)
	const c = sampleQ24PlaneAtTargetCenters(bValues, 32, 24, 8, 6)
	const bIdentity = createArmViewIdentity({
		arm: "B",
		width: 32,
		height: 24,
		values: bValues,
		parentMaskSha256: maskSha256,
		lowPassFilterIdentitySha256: filter.sha256,
	})
	const cIdentity = createArmViewIdentity({
		arm: "C",
		width: 8,
		height: 6,
		values: c.values,
		sourceIndices: c.sourceIndices,
		parentMaskSha256: maskSha256,
		lowPassFilterIdentitySha256: filter.sha256,
	})
	assert.notEqual(bIdentity.sha256, cIdentity.sha256)
	assert.notEqual(bIdentity.valuesSha256, cIdentity.valuesSha256)
	assert.equal(bIdentity.sourceIndicesSha256, null)
	assert.match(cIdentity.sourceIndicesSha256 ?? "", /^[0-9a-f]{64}$/)
	assert.throws(() => createArmViewIdentity({
		arm: "C", width: 8, height: 6, values: c.values, parentMaskSha256: maskSha256,
		lowPassFilterIdentitySha256: filter.sha256,
	}), /source-index/)
})
