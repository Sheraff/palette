import { createHash } from "node:crypto"
import {
	maxEdgeDimensions,
	nearestCenterCoordinate,
	pixelBudgetDimensions,
	type RasterDimensions,
} from "./resolution-raster.ts"

export const NATIVE_SCALE_SPACE_RASTER_VERSION = "native-scale-space-raster-v1" as const
export const NATIVE_SCALE_SPACE_LOW_PASS_FILTER_VERSION = "centered-clipped-box-q0.24-v2" as const
export const NATIVE_SCALE_SPACE_TYPED_ARRAY_HASH_VERSION = "native-scale-space-typed-array-sha256-v1" as const
export const NATIVE_SCALE_SPACE_ARM_VIEW_VERSION = "native-scale-space-arm-view-v1" as const
export const NATIVE_SCALE_SPACE_Q24 = 2 ** 24
export const NATIVE_SCALE_SPACE_Q24_BIGINT = 2n ** 24n
export const NATIVE_SCALE_SPACE_MAX_NATIVE_PIXELS = 2_100_000
export const NATIVE_SCALE_SPACE_MAX_NATIVE_RGB_BYTES = 6_300_000
export const NATIVE_SCALE_SPACE_MAX_CANDIDATES = 12
export const NATIVE_SCALE_SPACE_MAX_FAMILIES = 12
export const NATIVE_SCALE_SPACE_MAX_ORDERED_CANDIDATE_EDGES = 132

export const NATIVE_SCALE_SPACE_RASTER_LIMITS = Object.freeze({
	version: NATIVE_SCALE_SPACE_RASTER_VERSION,
	maximumNativePixels: NATIVE_SCALE_SPACE_MAX_NATIVE_PIXELS,
	maximumNativeRgbBytes: NATIVE_SCALE_SPACE_MAX_NATIVE_RGB_BYTES,
	maximumCandidates: NATIVE_SCALE_SPACE_MAX_CANDIDATES,
	maximumFamilies: NATIVE_SCALE_SPACE_MAX_FAMILIES,
	maximumOrderedCandidateEdges: NATIVE_SCALE_SPACE_MAX_ORDERED_CANDIDATE_EDGES,
	q24: NATIVE_SCALE_SPACE_Q24,
	maximumQ24RealError: "1/33554432",
})

export type NativeScaleSpaceTarget =
	| { readonly kind: "max-edge"; readonly value: number }
	| { readonly kind: "pixel-budget"; readonly value: number }

export const NATIVE_SCALE_SPACE_CORPUS_TARGETS: readonly NativeScaleSpaceTarget[] = Object.freeze([
	Object.freeze({ kind: "max-edge", value: 224 }),
	Object.freeze({ kind: "max-edge", value: 448 }),
	Object.freeze({ kind: "pixel-budget", value: 50_176 }),
	Object.freeze({ kind: "pixel-budget", value: 200_704 }),
])

export interface NativeScaleSpaceRasterBounds extends RasterDimensions {
	readonly pixels: number
	readonly rgbBytes: number
	readonly satLength: number
	readonly satBytes: number
	readonly q24Bytes: number
	readonly sourceIndexBytes: number
}

export interface ResolvedNativeScaleSpaceTarget extends RasterDimensions {
	readonly target: NativeScaleSpaceTarget
	readonly pixels: number
	readonly nativeToTargetWidthRatio: number
	readonly nativeToTargetHeightRatio: number
}

export interface ExactAxisSegment {
	readonly start: number
	readonly endExclusive: number
	readonly overlapNumerator: bigint
}

export interface CenteredClippedAxisWindow {
	readonly q: bigint
	readonly lowerNumerator: bigint
	readonly upperNumerator: bigint
	readonly overlapNumerator: bigint
	readonly segments: readonly ExactAxisSegment[]
}

export interface NativeScaleSpaceSummedAreaTable extends RasterDimensions {
	readonly stride: number
	readonly data: Uint32Array
}

export interface NativeScaleSpaceCenteredBoxGeometry extends RasterDimensions {
	readonly targetWidth: number
	readonly targetHeight: number
	readonly xWindows: readonly CenteredClippedAxisWindow[]
	readonly yWindows: readonly CenteredClippedAxisWindow[]
}

interface NumericAxisSegment {
	readonly start: number
	readonly endExclusive: number
	readonly overlapNumerator: number
}

interface NumericAxisWindow {
	readonly overlapNumerator: number
	readonly segments: readonly NumericAxisSegment[]
}

interface NumericCenteredBoxGeometry {
	readonly xWindows: readonly NumericAxisWindow[]
	readonly yWindows: readonly NumericAxisWindow[]
}

const numericCenteredBoxGeometries = new WeakMap<NativeScaleSpaceCenteredBoxGeometry, NumericCenteredBoxGeometry>()

export interface ExactCenteredClippedBoxValue {
	readonly numerator: bigint
	readonly denominator: bigint
	readonly xWindow: CenteredClippedAxisWindow
	readonly yWindow: CenteredClippedAxisWindow
}

export interface NativeScaleSpaceCenterSamples extends RasterDimensions {
	readonly values: Uint32Array
	readonly sourceIndices: Uint32Array
}

export interface Q24PartitionResidualAccumulator {
	readonly candidateCount: number
	readonly pixelCount: number
	planesAccumulated: number
	readonly residuals: Int32Array
}

export interface Q24PartitionResidualSummary {
	readonly candidateCount: number
	readonly pixelCount: number
	readonly bound: number
	readonly minimum: number
	readonly maximum: number
	readonly maximumAbsolute: number
	readonly sumDecimal: string
	readonly boundSatisfied: true
}

export type NativeScaleSpaceTypedArray =
	| Uint8Array
	| Uint16Array
	| Uint32Array
	| Int32Array
	| Float32Array
	| Float64Array

export type NativeScaleSpaceTypedArrayType =
	| "Uint8Array"
	| "Uint16Array"
	| "Uint32Array"
	| "Int32Array"
	| "Float32Array"
	| "Float64Array"

export interface NativeScaleSpaceTypedArrayManifest {
	readonly version: typeof NATIVE_SCALE_SPACE_TYPED_ARRAY_HASH_VERSION
	readonly type: NativeScaleSpaceTypedArrayType
	readonly shape: readonly number[]
	readonly length: number
	readonly endianness: "big"
	readonly negativeZero: "canonical-positive-zero"
	readonly nonfinite: "reject"
}

function deepFreeze<T>(value: T): T {
	if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value
	for (const child of Object.values(value)) deepFreeze(child)
	return Object.freeze(value)
}

export const NATIVE_SCALE_SPACE_LOW_PASS_FILTER_POLICY = deepFreeze({
	version: NATIVE_SCALE_SPACE_LOW_PASS_FILTER_VERSION,
	input: "row-major-binary-uint8-mask",
	output: "row-major-unsigned-q0.24-uint32-plane",
	q: NATIVE_SCALE_SPACE_Q24,
	window: {
		center: "native-pixel-center-(x+1/2,y+1/2)",
		normalizedSize: "1/targetWidth-by-1/targetHeight",
		xDenominator: "2*targetWidth",
		xLowerNumerator: "max(0,(2*x+1)*targetWidth-sourceWidth)",
		xUpperNumerator: "min(sourceWidth*2*targetWidth,(2*x+1)*targetWidth+sourceWidth)",
		yDenominator: "2*targetHeight",
		yLowerNumerator: "max(0,(2*y+1)*targetHeight-sourceHeight)",
		yUpperNumerator: "min(sourceHeight*2*targetHeight,(2*y+1)*targetHeight+sourceHeight)",
		interval: "half-open",
		clipping: "source-cell-domain",
	},
	evaluation: {
		arithmetic: "BigInt-endpoints-overlaps-public-oracle;hot-evaluator-exact-safe-integer-weighted-numerator-denominator-scaling-rounding",
		safeIntegerProof: "D<=4*sourceWidth*sourceHeight<=4*maximumNativePixels;N<=D;(N*Q+floor(D/2))<2^53",
		maximumWeightedDenominator: 4 * NATIVE_SCALE_SPACE_MAX_NATIVE_PIXELS,
		maximumRoundedScaledNumerator: 4 * NATIVE_SCALE_SPACE_MAX_NATIVE_PIXELS * NATIVE_SCALE_SPACE_Q24 + 2 * NATIVE_SCALE_SPACE_MAX_NATIVE_PIXELS,
		summedAreaTable: "one-uint32-(width+1)-by-(height+1)",
		axisSegments: "left-singleton-full-half-open-range-right-singleton;merge-same-pixel",
		maximumRectanglesPerWindow: 9,
	},
	quantization: {
		rounding: "half-up",
		formula: "floor((N*Q+floor(D/2))/D)",
		maximumRealError: "1/33554432",
	},
} as const)

export interface NativeScaleSpaceLowPassFilterIdentity {
	readonly version: typeof NATIVE_SCALE_SPACE_LOW_PASS_FILTER_VERSION
	readonly sha256: string
	readonly source: Readonly<RasterDimensions>
	readonly target: Readonly<RasterDimensions>
	readonly parentNativeIdentity: string
	readonly binaryMaskSha256: string
	readonly policy: typeof NATIVE_SCALE_SPACE_LOW_PASS_FILTER_POLICY
}

export type NativeScaleSpaceArm = "A" | "B" | "C"

export interface NativeScaleSpaceArmViewIdentity {
	readonly version: typeof NATIVE_SCALE_SPACE_ARM_VIEW_VERSION
	readonly sha256: string
	readonly arm: NativeScaleSpaceArm
	readonly representation: string
	readonly width: number
	readonly height: number
	readonly parentMaskSha256: string
	readonly lowPassFilterIdentitySha256: string | null
	readonly valuesSha256: string
	readonly sourceIndicesSha256: string | null
}

function assertPositiveSafeInteger(value: number, name: string): void {
	if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive safe integer`)
}

function safeProduct(first: number, second: number, name: string): number {
	if (!Number.isSafeInteger(first) || !Number.isSafeInteger(second) || first < 0 || second < 0 ||
		(first !== 0 && second > Math.floor(Number.MAX_SAFE_INTEGER / first))) {
		throw new RangeError(`${name} exceeds safe integer precision`)
	}
	return first * second
}

function assertSha256(value: string, name: string): void {
	if (!/^[0-9a-f]{64}$/.test(value)) throw new TypeError(`${name} must be a lowercase SHA-256 digest`)
}

export function nativeScaleSpaceRasterBounds(width: number, height: number): NativeScaleSpaceRasterBounds {
	assertPositiveSafeInteger(width, "width")
	assertPositiveSafeInteger(height, "height")
	const pixels = safeProduct(width, height, "native pixel count")
	if (pixels > NATIVE_SCALE_SPACE_MAX_NATIVE_PIXELS) {
		throw new RangeError(`native pixel count cannot exceed ${NATIVE_SCALE_SPACE_MAX_NATIVE_PIXELS}`)
	}
	const rgbBytes = safeProduct(pixels, 3, "native RGB byte length")
	if (rgbBytes > NATIVE_SCALE_SPACE_MAX_NATIVE_RGB_BYTES) {
		throw new RangeError(`native RGB byte length cannot exceed ${NATIVE_SCALE_SPACE_MAX_NATIVE_RGB_BYTES}`)
	}
	const satLength = safeProduct(width + 1, height + 1, "summed-area table length")
	return {
		width,
		height,
		pixels,
		rgbBytes,
		satLength,
		satBytes: safeProduct(satLength, Uint32Array.BYTES_PER_ELEMENT, "summed-area table byte length"),
		q24Bytes: safeProduct(pixels, Uint32Array.BYTES_PER_ELEMENT, "Q0.24 plane byte length"),
		sourceIndexBytes: safeProduct(pixels, Uint32Array.BYTES_PER_ELEMENT, "source-index plane byte length"),
	}
}

function assertTargetDimensions(
	sourceWidth: number,
	sourceHeight: number,
	targetWidth: number,
	targetHeight: number,
): void {
	nativeScaleSpaceRasterBounds(sourceWidth, sourceHeight)
	assertPositiveSafeInteger(targetWidth, "targetWidth")
	assertPositiveSafeInteger(targetHeight, "targetHeight")
	if (targetWidth > sourceWidth || targetHeight > sourceHeight) {
		throw new RangeError("native scale-space targets do not enlarge")
	}
	safeProduct(targetWidth, targetHeight, "target pixel count")
}

export function nativeScaleSpaceMaxEdgeDimensions(width: number, height: number, value: number): RasterDimensions {
	nativeScaleSpaceRasterBounds(width, height)
	const dimensions = maxEdgeDimensions(width, height, value)
	assertTargetDimensions(width, height, dimensions.width, dimensions.height)
	return dimensions
}

export function nativeScaleSpacePixelBudgetDimensions(width: number, height: number, value: number): RasterDimensions {
	nativeScaleSpaceRasterBounds(width, height)
	const dimensions = pixelBudgetDimensions(width, height, value)
	assertTargetDimensions(width, height, dimensions.width, dimensions.height)
	return dimensions
}

export function nativeScaleSpaceTargetDimensions(
	width: number,
	height: number,
	target: NativeScaleSpaceTarget,
): RasterDimensions {
	if (!target || typeof target !== "object") throw new TypeError("target must be a scale-space target")
	switch (target.kind) {
		case "max-edge": return nativeScaleSpaceMaxEdgeDimensions(width, height, target.value)
		case "pixel-budget": return nativeScaleSpacePixelBudgetDimensions(width, height, target.value)
		default: throw new TypeError("target kind must be max-edge or pixel-budget")
	}
}

export function resolveNativeScaleSpaceTarget(
	width: number,
	height: number,
	target: NativeScaleSpaceTarget,
): ResolvedNativeScaleSpaceTarget {
	const dimensions = nativeScaleSpaceTargetDimensions(width, height, target)
	return Object.freeze({
		target: Object.freeze({ ...target }),
		...dimensions,
		pixels: dimensions.width * dimensions.height,
		nativeToTargetWidthRatio: width / dimensions.width,
		nativeToTargetHeightRatio: height / dimensions.height,
	})
}

export function nativeScaleSpaceTargetDimensionsEqual(
	first: Pick<RasterDimensions, "width" | "height">,
	second: Pick<RasterDimensions, "width" | "height">,
): boolean {
	return first.width === second.width && first.height === second.height
}

function assertBigInt(value: bigint, name: string): void {
	if (typeof value !== "bigint") throw new TypeError(`${name} must be a BigInt`)
}

/** Split one rational half-open interval into at most three disjoint weighted pixel ranges. */
export function exactAxisSegments(
	lowerNumerator: bigint,
	upperNumerator: bigint,
	q: bigint,
	extent: number,
): readonly ExactAxisSegment[] {
	assertBigInt(lowerNumerator, "lowerNumerator")
	assertBigInt(upperNumerator, "upperNumerator")
	assertBigInt(q, "q")
	assertPositiveSafeInteger(extent, "extent")
	if (q <= 0n) throw new RangeError("q must be positive")
	if (lowerNumerator < 0n || upperNumerator <= lowerNumerator || upperNumerator > BigInt(extent) * q) {
		throw new RangeError("axis interval must be nonempty and inside the source extent")
	}

	const segments: ExactAxisSegment[] = []
	const lowerPixel = lowerNumerator / q
	const lowerRemainder = lowerNumerator % q
	if (lowerRemainder !== 0n) {
		const pixelEnd = (lowerPixel + 1n) * q
		const segmentEnd = upperNumerator < pixelEnd ? upperNumerator : pixelEnd
		segments.push({
			start: Number(lowerPixel),
			endExclusive: Number(lowerPixel + 1n),
			overlapNumerator: segmentEnd - lowerNumerator,
		})
		if (upperNumerator <= pixelEnd) return segments
	}

	const fullStart = lowerRemainder === 0n ? lowerPixel : lowerPixel + 1n
	const upperPixel = upperNumerator / q
	const upperRemainder = upperNumerator % q
	if (upperPixel > fullStart) {
		segments.push({ start: Number(fullStart), endExclusive: Number(upperPixel), overlapNumerator: q })
	}
	if (upperRemainder !== 0n) {
		segments.push({
			start: Number(upperPixel),
			endExclusive: Number(upperPixel + 1n),
			overlapNumerator: upperRemainder,
		})
	}
	if (segments.length === 0 || segments.length > 3 || segments.some((segment) => segment.overlapNumerator <= 0n)) {
		throw new Error("failed to construct an exact axis segmentation")
	}
	return segments
}

export function centeredClippedAxisWindow(
	index: number,
	extent: number,
	targetExtent: number,
): CenteredClippedAxisWindow {
	assertPositiveSafeInteger(extent, "extent")
	assertPositiveSafeInteger(targetExtent, "targetExtent")
	if (targetExtent > extent) throw new RangeError("native scale-space targets do not enlarge")
	if (!Number.isSafeInteger(index) || index < 0 || index >= extent) {
		throw new RangeError("axis index is outside the native extent")
	}
	const target = BigInt(targetExtent)
	const source = BigInt(extent)
	const q = 2n * target
	const center = (2n * BigInt(index) + 1n) * target
	const lowerNumerator = center > source ? center - source : 0n
	const upperNumerator = center + source < source * q ? center + source : source * q
	return {
		q,
		lowerNumerator,
		upperNumerator,
		overlapNumerator: upperNumerator - lowerNumerator,
		segments: exactAxisSegments(lowerNumerator, upperNumerator, q, extent),
	}
}

function assertExactUint8Array(value: unknown, name: string): asserts value is Uint8Array {
	if (!(value instanceof Uint8Array) || value.constructor !== Uint8Array) {
		throw new TypeError(`${name} must be exactly a Uint8Array`)
	}
}

function assertExactUint32Array(value: unknown, name: string): asserts value is Uint32Array {
	if (!(value instanceof Uint32Array) || value.constructor !== Uint32Array) {
		throw new TypeError(`${name} must be exactly a Uint32Array`)
	}
}

export function buildBinaryMaskSummedAreaTable(
	mask: Uint8Array,
	width: number,
	height: number,
	output?: Uint32Array,
): NativeScaleSpaceSummedAreaTable {
	assertExactUint8Array(mask, "binary mask")
	const bounds = nativeScaleSpaceRasterBounds(width, height)
	if (mask.length !== bounds.pixels) throw new RangeError("binary mask length does not match its dimensions")
	const data = output ?? new Uint32Array(bounds.satLength)
	assertExactUint32Array(data, "summed-area output")
	if (data.length !== bounds.satLength) throw new RangeError("summed-area output length does not match its dimensions")
	data.fill(0)
	const stride = width + 1
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const maskValue = mask[y * width + x]
			if (maskValue !== 0 && maskValue !== 1) throw new RangeError("binary mask values must be 0 or 1")
			const target = (y + 1) * stride + x + 1
			const value = maskValue + data[target - 1] + data[target - stride] - data[target - stride - 1]
			if (!Number.isSafeInteger(value) || value < 0 || value > bounds.pixels) {
				throw new RangeError("summed-area value is outside its exact Uint32 bound")
			}
			data[target] = value
		}
	}
	return { width, height, stride, data }
}

function assertSummedAreaTable(sat: NativeScaleSpaceSummedAreaTable): void {
	const bounds = nativeScaleSpaceRasterBounds(sat.width, sat.height)
	if (sat.stride !== sat.width + 1) throw new RangeError("summed-area stride is invalid")
	assertExactUint32Array(sat.data, "summed-area data")
	if (sat.data.length !== bounds.satLength) throw new RangeError("summed-area data length is invalid")
}

function rectangleCountUnchecked(
	sat: NativeScaleSpaceSummedAreaTable,
	startX: number,
	startY: number,
	endX: number,
	endY: number,
): number {
	const topLeft = startY * sat.stride + startX
	const topRight = startY * sat.stride + endX
	const bottomLeft = endY * sat.stride + startX
	const bottomRight = endY * sat.stride + endX
	return sat.data[bottomRight] - sat.data[topRight] - sat.data[bottomLeft] + sat.data[topLeft]
}

export function queryBinaryMaskSummedAreaTable(
	sat: NativeScaleSpaceSummedAreaTable,
	startX: number,
	startY: number,
	endX: number,
	endY: number,
): number {
	assertSummedAreaTable(sat)
	for (const [value, name] of [[startX, "startX"], [startY, "startY"], [endX, "endX"], [endY, "endY"]] as const) {
		if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`)
	}
	if (startX < 0 || startY < 0 || endX < startX || endY < startY || endX > sat.width || endY > sat.height) {
		throw new RangeError("summed-area rectangle is outside its source dimensions")
	}
	return rectangleCountUnchecked(sat, startX, startY, endX, endY)
}

function exactValueFromWindows(
	sat: NativeScaleSpaceSummedAreaTable,
	xWindow: CenteredClippedAxisWindow,
	yWindow: CenteredClippedAxisWindow,
): Pick<ExactCenteredClippedBoxValue, "numerator" | "denominator"> {
	let numerator = 0n
	for (const ySegment of yWindow.segments) {
		for (const xSegment of xWindow.segments) {
			const count = rectangleCountUnchecked(
				sat,
				xSegment.start,
				ySegment.start,
				xSegment.endExclusive,
				ySegment.endExclusive,
			)
			const weightedCount = count * Number(xSegment.overlapNumerator) * Number(ySegment.overlapNumerator)
			if (!Number.isSafeInteger(weightedCount)) throw new RangeError("exact centered box weighted count exceeds safe integer precision")
			numerator += BigInt(weightedCount)
		}
	}
	const denominator = xWindow.overlapNumerator * yWindow.overlapNumerator
	if (denominator <= 0n || numerator < 0n || numerator > denominator) {
		throw new RangeError("exact centered box value is outside its clipped denominator")
	}
	return { numerator, denominator }
}

function quantizeWindowsQ24(
	sat: NativeScaleSpaceSummedAreaTable,
	xWindow: NumericAxisWindow,
	yWindow: NumericAxisWindow,
): number {
	let numerator = 0
	const stride = sat.stride
	const data = sat.data
	for (const ySegment of yWindow.segments) {
		for (const xSegment of xWindow.segments) {
			const top = ySegment.start * stride
			const bottom = ySegment.endExclusive * stride
			const count = data[bottom + xSegment.endExclusive] - data[top + xSegment.endExclusive] -
				data[bottom + xSegment.start] + data[top + xSegment.start]
			numerator += count * xSegment.overlapNumerator * ySegment.overlapNumerator
		}
	}
	const denominator = xWindow.overlapNumerator * yWindow.overlapNumerator
	const roundedScaledNumerator = numerator * NATIVE_SCALE_SPACE_Q24 + Math.floor(denominator / 2)
	if (denominator <= 0 || numerator < 0 || numerator > denominator) {
		throw new RangeError("exact centered box value is outside its clipped denominator")
	}
	return Math.floor(roundedScaledNumerator / denominator)
}

function numericAxisWindow(window: CenteredClippedAxisWindow): NumericAxisWindow {
	const overlapNumerator = Number(window.overlapNumerator)
	const segments = window.segments.map((segment) => ({
		start: segment.start,
		endExclusive: segment.endExclusive,
		overlapNumerator: Number(segment.overlapNumerator),
	}))
	if (!Number.isSafeInteger(overlapNumerator) || overlapNumerator <= 0 ||
		segments.some((segment) => !Number.isSafeInteger(segment.overlapNumerator) || segment.overlapNumerator <= 0)) {
		throw new RangeError("numeric centered box geometry exceeds safe integer precision")
	}
	return { overlapNumerator, segments }
}

function numericCenteredBoxGeometry(geometry: NativeScaleSpaceCenteredBoxGeometry): NumericCenteredBoxGeometry {
	const cached = numericCenteredBoxGeometries.get(geometry)
	if (cached !== undefined) return cached
	const numeric = {
		xWindows: geometry.xWindows.map(numericAxisWindow),
		yWindows: geometry.yWindows.map(numericAxisWindow),
	}
	let maximumXOverlap = 0
	let maximumYOverlap = 0
	for (const { overlapNumerator } of numeric.xWindows) maximumXOverlap = Math.max(maximumXOverlap, overlapNumerator)
	for (const { overlapNumerator } of numeric.yWindows) maximumYOverlap = Math.max(maximumYOverlap, overlapNumerator)
	const maximumDenominator = maximumXOverlap * maximumYOverlap
	if (!Number.isSafeInteger(maximumDenominator) || maximumDenominator > 4 * NATIVE_SCALE_SPACE_MAX_NATIVE_PIXELS ||
		!Number.isSafeInteger(maximumDenominator * NATIVE_SCALE_SPACE_Q24 + Math.floor(maximumDenominator / 2))) {
		throw new RangeError("numeric centered box geometry violates its exact safe-integer proof")
	}
	numericCenteredBoxGeometries.set(geometry, numeric)
	return numeric
}

export function exactCenteredClippedBoxValue(
	sat: NativeScaleSpaceSummedAreaTable,
	x: number,
	y: number,
	targetWidth: number,
	targetHeight: number,
): ExactCenteredClippedBoxValue {
	assertSummedAreaTable(sat)
	assertTargetDimensions(sat.width, sat.height, targetWidth, targetHeight)
	const xWindow = centeredClippedAxisWindow(x, sat.width, targetWidth)
	const yWindow = centeredClippedAxisWindow(y, sat.height, targetHeight)
	return { ...exactValueFromWindows(sat, xWindow, yWindow), xWindow, yWindow }
}

export function quantizeQ24HalfUp(numerator: bigint, denominator: bigint): number {
	assertBigInt(numerator, "numerator")
	assertBigInt(denominator, "denominator")
	if (denominator <= 0n) throw new RangeError("Q0.24 denominator must be positive")
	if (numerator < 0n || numerator > denominator) {
		throw new RangeError("Q0.24 numerator must lie inside its denominator")
	}
	const quantized = (numerator * NATIVE_SCALE_SPACE_Q24_BIGINT + denominator / 2n) / denominator
	if (quantized < 0n || quantized > NATIVE_SCALE_SPACE_Q24_BIGINT) {
		throw new RangeError("quantized Q0.24 value is outside its unsigned bound")
	}
	return Number(quantized)
}

export function centeredClippedBoxQ24At(
	sat: NativeScaleSpaceSummedAreaTable,
	x: number,
	y: number,
	targetWidth: number,
	targetHeight: number,
): number {
	const exact = exactCenteredClippedBoxValue(sat, x, y, targetWidth, targetHeight)
	return quantizeQ24HalfUp(exact.numerator, exact.denominator)
}

export function createCenteredClippedBoxGeometry(
	width: number,
	height: number,
	targetWidth: number,
	targetHeight: number,
): NativeScaleSpaceCenteredBoxGeometry {
	assertTargetDimensions(width, height, targetWidth, targetHeight)
	const geometry = Object.freeze({
		width,
		height,
		targetWidth,
		targetHeight,
		xWindows: Object.freeze(Array.from({ length: width }, (_, x) => centeredClippedAxisWindow(x, width, targetWidth))),
		yWindows: Object.freeze(Array.from({ length: height }, (_, y) => centeredClippedAxisWindow(y, height, targetHeight))),
	})
	numericCenteredBoxGeometry(geometry)
	return geometry
}

export function centeredClippedBoxQ24AtGeometry(
	sat: NativeScaleSpaceSummedAreaTable,
	x: number,
	y: number,
	geometry: NativeScaleSpaceCenteredBoxGeometry,
): number {
	assertSummedAreaTable(sat)
	if (sat.width !== geometry.width || sat.height !== geometry.height ||
		x < 0 || y < 0 || x >= geometry.width || y >= geometry.height ||
		!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
		throw new RangeError("centered box geometry does not match the SAT or coordinate")
	}
	const numeric = numericCenteredBoxGeometry(geometry)
	return quantizeWindowsQ24(sat, numeric.xWindows[x], numeric.yWindows[y])
}

export function createCenteredClippedBoxQ24Evaluator(
	sat: NativeScaleSpaceSummedAreaTable,
	geometry: NativeScaleSpaceCenteredBoxGeometry,
): (index: number) => number {
	assertSummedAreaTable(sat)
	if (sat.width !== geometry.width || sat.height !== geometry.height) {
		throw new RangeError("centered box geometry does not match the SAT")
	}
	const pixels = geometry.width * geometry.height
	const numeric = numericCenteredBoxGeometry(geometry)
	return (index: number): number => {
		if (!Number.isSafeInteger(index) || index < 0 || index >= pixels) {
			throw new RangeError("centered box evaluator index is outside its lattice")
		}
		const x = index % geometry.width
		const y = Math.floor(index / geometry.width)
		return quantizeWindowsQ24(sat, numeric.xWindows[x], numeric.yWindows[y])
	}
}

export function filterSummedAreaTableQ24(
	sat: NativeScaleSpaceSummedAreaTable,
	targetWidth: number,
	targetHeight: number,
	output?: Uint32Array,
	precomputedGeometry?: NativeScaleSpaceCenteredBoxGeometry,
): Uint32Array {
	assertSummedAreaTable(sat)
	assertTargetDimensions(sat.width, sat.height, targetWidth, targetHeight)
	const pixelCount = sat.width * sat.height
	const plane = output ?? new Uint32Array(pixelCount)
	assertExactUint32Array(plane, "Q0.24 output")
	if (plane.length !== pixelCount) throw new RangeError("Q0.24 output length does not match native dimensions")
	const geometry = precomputedGeometry ?? createCenteredClippedBoxGeometry(sat.width, sat.height, targetWidth, targetHeight)
	if (geometry.width !== sat.width || geometry.height !== sat.height ||
		geometry.targetWidth !== targetWidth || geometry.targetHeight !== targetHeight) {
		throw new RangeError("precomputed centered box geometry does not match the filter")
	}
	const numeric = numericCenteredBoxGeometry(geometry)
	for (let y = 0; y < sat.height; y++) {
		const yWindow = numeric.yWindows[y]
		for (let x = 0; x < sat.width; x++) {
			const xWindow = numeric.xWindows[x]
			plane[y * sat.width + x] = quantizeWindowsQ24(sat, xWindow, yWindow)
		}
	}
	return plane
}

export function centeredClippedBoxQ24(
	mask: Uint8Array,
	width: number,
	height: number,
	targetWidth: number,
	targetHeight: number,
	output?: Uint32Array,
): Uint32Array {
	const sat = buildBinaryMaskSummedAreaTable(mask, width, height)
	return filterSummedAreaTableQ24(sat, targetWidth, targetHeight, output)
}

function assertQ24Plane(values: Uint32Array, expectedLength: number, name: string): void {
	assertExactUint32Array(values, name)
	if (values.length !== expectedLength) throw new RangeError(`${name} length does not match its dimensions`)
	for (const value of values) {
		if (value > NATIVE_SCALE_SPACE_Q24) throw new RangeError(`${name} contains a value above Q`)
	}
}

export function sampleQ24PlaneAtTargetCenters(
	values: Uint32Array,
	sourceWidth: number,
	sourceHeight: number,
	targetWidth: number,
	targetHeight: number,
	outputValues?: Uint32Array,
	outputSourceIndices?: Uint32Array,
): NativeScaleSpaceCenterSamples {
	assertTargetDimensions(sourceWidth, sourceHeight, targetWidth, targetHeight)
	assertQ24Plane(values, sourceWidth * sourceHeight, "source Q0.24 plane")
	const targetPixels = targetWidth * targetHeight
	const samples = outputValues ?? new Uint32Array(targetPixels)
	const sourceIndices = outputSourceIndices ?? new Uint32Array(targetPixels)
	assertExactUint32Array(samples, "sampled Q0.24 output")
	assertExactUint32Array(sourceIndices, "source-index output")
	if (samples.length !== targetPixels || sourceIndices.length !== targetPixels) {
		throw new RangeError("sample output length does not match target dimensions")
	}
	let targetIndex = 0
	for (let v = 0; v < targetHeight; v++) {
		const y = nearestCenterCoordinate(v, targetHeight, sourceHeight)
		for (let u = 0; u < targetWidth; u++) {
			const x = nearestCenterCoordinate(u, targetWidth, sourceWidth)
			const sourceIndex = y * sourceWidth + x
			sourceIndices[targetIndex] = sourceIndex
			samples[targetIndex] = values[sourceIndex]
			targetIndex++
		}
	}
	return { width: targetWidth, height: targetHeight, values: samples, sourceIndices }
}

export function verifyQ24CenterSamplesExact(
	source: Uint32Array,
	sourceWidth: number,
	sourceHeight: number,
	samples: NativeScaleSpaceCenterSamples,
): true {
	assertTargetDimensions(sourceWidth, sourceHeight, samples.width, samples.height)
	assertQ24Plane(source, sourceWidth * sourceHeight, "source Q0.24 plane")
	const sampleCount = safeProduct(samples.width, samples.height, "sample count")
	assertQ24Plane(samples.values, sampleCount, "sampled Q0.24 plane")
	assertExactUint32Array(samples.sourceIndices, "sample source indices")
	if (samples.sourceIndices.length !== sampleCount) throw new RangeError("sample source-index length is invalid")
	let sample = 0
	for (let v = 0; v < samples.height; v++) {
		const y = nearestCenterCoordinate(v, samples.height, sourceHeight)
		for (let u = 0; u < samples.width; u++) {
			const x = nearestCenterCoordinate(u, samples.width, sourceWidth)
			const sourceIndex = y * sourceWidth + x
			if (samples.sourceIndices[sample] !== sourceIndex) {
				throw new Error("sample source index does not equal the exact nearest-center mapping")
			}
			if (samples.values[sample] !== source[sourceIndex]) {
				throw new Error("sampled Q0.24 value does not equal its indexed source value")
			}
			sample++
		}
	}
	return true
}

export function createQ24PartitionResidualAccumulator(
	pixelCount: number,
	candidateCount: number,
	output?: Int32Array,
): Q24PartitionResidualAccumulator {
	assertPositiveSafeInteger(pixelCount, "pixelCount")
	assertPositiveSafeInteger(candidateCount, "candidateCount")
	if (pixelCount > NATIVE_SCALE_SPACE_MAX_NATIVE_PIXELS) throw new RangeError("partition residual exceeds native pixel bound")
	if (candidateCount > NATIVE_SCALE_SPACE_MAX_CANDIDATES) throw new RangeError("candidate count exceeds its bound")
	const residuals = output ?? new Int32Array(pixelCount)
	if (!(residuals instanceof Int32Array) || residuals.constructor !== Int32Array || residuals.length !== pixelCount) {
		throw new RangeError("partition residual output must be an exact matching Int32Array")
	}
	residuals.fill(-NATIVE_SCALE_SPACE_Q24)
	return {
		candidateCount,
		pixelCount,
		planesAccumulated: 0,
		residuals,
	}
}

export function accumulateQ24PartitionPlane(
	accumulator: Q24PartitionResidualAccumulator,
	plane: Uint32Array,
): void {
	if (accumulator.planesAccumulated >= accumulator.candidateCount) {
		throw new RangeError("too many candidate Q0.24 planes were accumulated")
	}
	assertQ24Plane(plane, accumulator.pixelCount, "candidate Q0.24 plane")
	for (let pixel = 0; pixel < accumulator.pixelCount; pixel++) accumulator.residuals[pixel] += plane[pixel]
	accumulator.planesAccumulated++
}

export function accumulateQ24PartitionSummedAreaTable(
	accumulator: Q24PartitionResidualAccumulator,
	sat: NativeScaleSpaceSummedAreaTable,
	geometry: NativeScaleSpaceCenteredBoxGeometry,
): void {
	if (accumulator.planesAccumulated >= accumulator.candidateCount) {
		throw new RangeError("too many candidate Q0.24 planes were accumulated")
	}
	if (accumulator.pixelCount !== sat.width * sat.height) {
		throw new RangeError("partition residual and summed-area lattice lengths differ")
	}
	const evaluate = createCenteredClippedBoxQ24Evaluator(sat, geometry)
	for (let pixel = 0; pixel < accumulator.pixelCount; pixel++) {
		accumulator.residuals[pixel] += evaluate(pixel)
	}
	accumulator.planesAccumulated++
}

export function finalizeQ24PartitionResidual(
	accumulator: Q24PartitionResidualAccumulator,
): Q24PartitionResidualSummary {
	if (accumulator.planesAccumulated !== accumulator.candidateCount) {
		throw new Error("partition residual does not contain every candidate plane")
	}
	const bound = Math.floor(accumulator.candidateCount / 2)
	let minimum = accumulator.residuals[0]
	let maximum = accumulator.residuals[0]
	let maximumAbsolute = Math.abs(accumulator.residuals[0])
	let sum = 0n
	for (const residual of accumulator.residuals) {
		minimum = Math.min(minimum, residual)
		maximum = Math.max(maximum, residual)
		maximumAbsolute = Math.max(maximumAbsolute, Math.abs(residual))
		sum += BigInt(residual)
	}
	if (maximumAbsolute > bound) {
		throw new Error(`Q0.24 partition residual ${maximumAbsolute} exceeds bound ${bound}`)
	}
	return {
		candidateCount: accumulator.candidateCount,
		pixelCount: accumulator.pixelCount,
		bound,
		minimum,
		maximum,
		maximumAbsolute,
		sumDecimal: sum.toString(10),
		boundSatisfied: true,
	}
}

function canonicalJsonInternal(value: unknown, ancestors: Set<object>): string {
	if (value === null) return "null"
	switch (typeof value) {
		case "string": return JSON.stringify(value)
		case "boolean": return value ? "true" : "false"
		case "number":
			if (!Number.isFinite(value)) throw new TypeError("canonical JSON numbers must be finite")
			return JSON.stringify(Object.is(value, -0) ? 0 : value)
		case "undefined": throw new TypeError("canonical JSON rejects undefined")
		case "bigint": throw new TypeError("canonical JSON rejects BigInt values")
		case "function": throw new TypeError("canonical JSON rejects functions")
		case "symbol": throw new TypeError("canonical JSON rejects symbols")
		case "object": break
	}
	const object = value as object
	if (ancestors.has(object)) throw new TypeError("canonical JSON rejects cyclic values")
	if (Object.getOwnPropertySymbols(object).length > 0) throw new TypeError("canonical JSON rejects symbol keys")
	ancestors.add(object)
	try {
		if (Array.isArray(value)) {
			const keys = Object.keys(value)
			if (keys.length !== value.length) throw new TypeError("canonical JSON rejects sparse arrays or array properties")
			const items: string[] = []
			for (let index = 0; index < value.length; index++) {
				if (!Object.prototype.hasOwnProperty.call(value, index) || keys[index] !== String(index)) {
					throw new TypeError("canonical JSON rejects sparse arrays or array properties")
				}
				items.push(canonicalJsonInternal(value[index], ancestors))
			}
			return `[${items.join(",")}]`
		}
		const prototype = Object.getPrototypeOf(value)
		if (prototype !== Object.prototype && prototype !== null) {
			throw new TypeError("canonical JSON rejects unsupported objects")
		}
		const fields: string[] = []
		for (const key of Object.keys(value).sort()) {
			const descriptor = Object.getOwnPropertyDescriptor(value, key)
			if (!descriptor || !("value" in descriptor)) throw new TypeError("canonical JSON rejects accessor properties")
			fields.push(`${JSON.stringify(key)}:${canonicalJsonInternal(descriptor.value, ancestors)}`)
		}
		return `{${fields.join(",")}}`
	} finally {
		ancestors.delete(object)
	}
}

/** Canonical compact JSON with recursively sorted keys and strict JSON-domain validation. */
export function canonicalJson(value: unknown): string {
	return canonicalJsonInternal(value, new Set())
}

export function domainSeparatedCanonicalSha256(domain: string, value: unknown): string {
	if (typeof domain !== "string" || domain.length === 0 || domain.includes("\0")) {
		throw new TypeError("hash domain must be a nonempty string without NUL")
	}
	return createHash("sha256").update(domain, "utf8").update("\0").update(canonicalJson(value), "utf8").digest("hex")
}

function exactTypedArrayType(array: unknown): NativeScaleSpaceTypedArrayType {
	if (array instanceof Uint8Array && array.constructor === Uint8Array) return "Uint8Array"
	if (array instanceof Uint16Array && array.constructor === Uint16Array) return "Uint16Array"
	if (array instanceof Uint32Array && array.constructor === Uint32Array) return "Uint32Array"
	if (array instanceof Int32Array && array.constructor === Int32Array) return "Int32Array"
	if (array instanceof Float32Array && array.constructor === Float32Array) return "Float32Array"
	if (array instanceof Float64Array && array.constructor === Float64Array) return "Float64Array"
	throw new TypeError("typed hash requires a canonical declared typed-array type")
}

function canonicalShape(shape: readonly number[], length: number): readonly number[] {
	if (!Array.isArray(shape) || shape.length === 0) throw new TypeError("typed-array shape must be a nonempty array")
	let product = 1
	const result: number[] = []
	for (const dimension of shape) {
		if (!Number.isSafeInteger(dimension) || dimension < 0) {
			throw new RangeError("typed-array shape dimensions must be nonnegative safe integers")
		}
		product = safeProduct(product, dimension, "typed-array shape product")
		result.push(dimension)
	}
	if (product !== length) throw new RangeError("typed-array shape product does not equal its length")
	return result
}

export function typedArrayHashManifest(
	array: NativeScaleSpaceTypedArray,
	shape: readonly number[] = [array.length],
): NativeScaleSpaceTypedArrayManifest {
	const type = exactTypedArrayType(array)
	return {
		version: NATIVE_SCALE_SPACE_TYPED_ARRAY_HASH_VERSION,
		type,
		shape: canonicalShape(shape, array.length),
		length: array.length,
		endianness: "big",
		negativeZero: "canonical-positive-zero",
		nonfinite: "reject",
	}
}

function assertFiniteFloatArray(array: Float32Array | Float64Array): void {
	for (const value of array) {
		if (!Number.isFinite(value)) throw new RangeError("typed hash rejects nonfinite floating-point values")
	}
}

/** Hash an explicit manifest, NUL, and canonical big-endian value bytes. */
export function canonicalTypedArrayHash(
	array: NativeScaleSpaceTypedArray,
	shape: readonly number[] = [array.length],
): string {
	const manifest = typedArrayHashManifest(array, shape)
	if (array instanceof Float32Array || array instanceof Float64Array) assertFiniteFloatArray(array)
	const hash = createHash("sha256").update(canonicalJson(manifest), "utf8").update("\0")
	if (manifest.type === "Uint8Array") return hash.update(array as Uint8Array).digest("hex")

	const bytesPerValue = manifest.type === "Uint16Array" ? 2
		: manifest.type === "Float64Array" ? 8 : 4
	const valuesPerChunk = 4096
	const bytes = new Uint8Array(valuesPerChunk * bytesPerValue)
	const view = new DataView(bytes.buffer)
	for (let start = 0; start < array.length; start += valuesPerChunk) {
		const count = Math.min(valuesPerChunk, array.length - start)
		for (let offset = 0; offset < count; offset++) {
			const value = array[start + offset]
			const byteOffset = offset * bytesPerValue
			switch (manifest.type) {
				case "Uint16Array": view.setUint16(byteOffset, value, false); break
				case "Uint32Array": view.setUint32(byteOffset, value, false); break
				case "Int32Array": view.setInt32(byteOffset, value, false); break
				case "Float32Array": view.setFloat32(byteOffset, value === 0 ? 0 : value, false); break
				case "Float64Array": view.setFloat64(byteOffset, value === 0 ? 0 : value, false); break
			}
		}
		hash.update(bytes.subarray(0, count * bytesPerValue))
	}
	return hash.digest("hex")
}

/** Hash a binary Arm A mask exactly as its virtual Uint32 Q0.24 value plane. */
export function canonicalBinaryMaskAsQ24Hash(
	mask: Uint8Array,
	shape: readonly number[] = [mask.length],
): string {
	assertExactUint8Array(mask, "Arm A binary mask")
	const manifest: NativeScaleSpaceTypedArrayManifest = {
		version: NATIVE_SCALE_SPACE_TYPED_ARRAY_HASH_VERSION,
		type: "Uint32Array",
		shape: canonicalShape(shape, mask.length),
		length: mask.length,
		endianness: "big",
		negativeZero: "canonical-positive-zero",
		nonfinite: "reject",
	}
	const hash = createHash("sha256").update(canonicalJson(manifest), "utf8").update("\0")
	const valuesPerChunk = 4096
	const bytes = new Uint8Array(valuesPerChunk * Uint32Array.BYTES_PER_ELEMENT)
	const view = new DataView(bytes.buffer)
	for (let start = 0; start < mask.length; start += valuesPerChunk) {
		const count = Math.min(valuesPerChunk, mask.length - start)
		for (let offset = 0; offset < count; offset++) {
			const value = mask[start + offset]
			if (value !== 0 && value !== 1) throw new RangeError("Arm A binary mask values must be 0 or 1")
			view.setUint32(offset * Uint32Array.BYTES_PER_ELEMENT, value * NATIVE_SCALE_SPACE_Q24, false)
		}
		hash.update(bytes.subarray(0, count * Uint32Array.BYTES_PER_ELEMENT))
	}
	return hash.digest("hex")
}

export function createLowPassFilterIdentity(input: {
	readonly sourceWidth: number
	readonly sourceHeight: number
	readonly targetWidth: number
	readonly targetHeight: number
	readonly parentNativeIdentity: string
	readonly binaryMaskSha256: string
}): NativeScaleSpaceLowPassFilterIdentity {
	assertTargetDimensions(input.sourceWidth, input.sourceHeight, input.targetWidth, input.targetHeight)
	assertSha256(input.parentNativeIdentity, "parentNativeIdentity")
	assertSha256(input.binaryMaskSha256, "binaryMaskSha256")
	const descriptor = {
		version: NATIVE_SCALE_SPACE_LOW_PASS_FILTER_VERSION,
		source: { width: input.sourceWidth, height: input.sourceHeight },
		target: { width: input.targetWidth, height: input.targetHeight },
		parentNativeIdentity: input.parentNativeIdentity,
		binaryMaskSha256: input.binaryMaskSha256,
		policy: NATIVE_SCALE_SPACE_LOW_PASS_FILTER_POLICY,
	} as const
	return deepFreeze({
		...descriptor,
		sha256: domainSeparatedCanonicalSha256(NATIVE_SCALE_SPACE_LOW_PASS_FILTER_VERSION, descriptor),
	})
}

export function createArmViewIdentity(input: {
	readonly arm: NativeScaleSpaceArm
	readonly width: number
	readonly height: number
	readonly values: Uint32Array
	readonly parentMaskSha256: string
	readonly lowPassFilterIdentitySha256?: string | null
	readonly sourceIndices?: Uint32Array | null
}): NativeScaleSpaceArmViewIdentity {
	const bounds = nativeScaleSpaceRasterBounds(input.width, input.height)
	assertQ24Plane(input.values, bounds.pixels, "arm Q0.24 plane")
	assertSha256(input.parentMaskSha256, "parentMaskSha256")
	const lowPassFilterIdentitySha256 = input.lowPassFilterIdentitySha256 ?? null
	const sourceIndices = input.sourceIndices ?? null
	let representation: string
	if (input.arm === "A") {
		representation = "frozen-native-binary-q0.24"
		if (lowPassFilterIdentitySha256 !== null || sourceIndices !== null) {
			throw new Error("Arm A cannot have a low-pass identity or source-index plane")
		}
	} else if (input.arm === "B") {
		representation = "native-centered-clipped-box-q0.24"
		if (sourceIndices !== null) throw new Error("Arm B cannot have a source-index plane")
		if (lowPassFilterIdentitySha256 === null) throw new Error("Arm B requires a low-pass identity")
	} else if (input.arm === "C") {
		representation = "target-center-sampled-q0.24"
		if (lowPassFilterIdentitySha256 === null || sourceIndices === null) {
			throw new Error("Arm C requires a low-pass identity and source-index plane")
		}
	} else {
		throw new TypeError("arm must be A, B, or C")
	}
	if (lowPassFilterIdentitySha256 !== null) assertSha256(lowPassFilterIdentitySha256, "lowPassFilterIdentitySha256")
	if (sourceIndices !== null) {
		assertExactUint32Array(sourceIndices, "arm source-index plane")
		if (sourceIndices.length !== bounds.pixels) throw new RangeError("arm source-index plane length is invalid")
	}
	const descriptor = {
		version: NATIVE_SCALE_SPACE_ARM_VIEW_VERSION,
		arm: input.arm,
		representation,
		width: input.width,
		height: input.height,
		parentMaskSha256: input.parentMaskSha256,
		lowPassFilterIdentitySha256,
		valuesSha256: canonicalTypedArrayHash(input.values, [input.height, input.width]),
		sourceIndicesSha256: sourceIndices === null
			? null
			: canonicalTypedArrayHash(sourceIndices, [input.height, input.width]),
	} as const
	return Object.freeze({
		...descriptor,
		sha256: domainSeparatedCanonicalSha256(NATIVE_SCALE_SPACE_ARM_VIEW_VERSION, descriptor),
	})
}

export function createArmAViewIdentityFromMask(input: {
	readonly width: number
	readonly height: number
	readonly mask: Uint8Array
	readonly parentMaskSha256: string
}): NativeScaleSpaceArmViewIdentity {
	const bounds = nativeScaleSpaceRasterBounds(input.width, input.height)
	assertExactUint8Array(input.mask, "Arm A binary mask")
	if (input.mask.length !== bounds.pixels) throw new RangeError("Arm A binary mask length is invalid")
	assertSha256(input.parentMaskSha256, "parentMaskSha256")
	const descriptor = {
		version: NATIVE_SCALE_SPACE_ARM_VIEW_VERSION,
		arm: "A" as const,
		representation: "frozen-native-binary-q0.24",
		width: input.width,
		height: input.height,
		parentMaskSha256: input.parentMaskSha256,
		lowPassFilterIdentitySha256: null,
		valuesSha256: canonicalBinaryMaskAsQ24Hash(input.mask, [input.height, input.width]),
		sourceIndicesSha256: null,
	}
	return Object.freeze({
		...descriptor,
		sha256: domainSeparatedCanonicalSha256(NATIVE_SCALE_SPACE_ARM_VIEW_VERSION, descriptor),
	})
}
