import { createHash } from "node:crypto"
import sharpModern from "sharp-modern"

export const RESOLUTION_PROFILE_VERSION = "resolution-raster-profile-v1" as const
export const RASTER_IDENTITY_VERSION = "resolution-raster-sha256-v1" as const
export const COMMON_SAMPLE_LIMIT = 16_384
export const RGB_OCCUPANCY_WORDS = 2 ** 24 / 32
export const AREA_BOX_RESAMPLING_POLICY = Object.freeze({
	version: "area-box-srgb-code-value-v1",
	sampleDomain: "nonlinear-srgb-uchar-code-values",
	integration: "exact-box-cell-coverage",
	rounding: "half-up-to-uchar",
})

export type EncodedImageInput =
	| Buffer
	| ArrayBuffer
	| Uint8Array
	| Uint8ClampedArray
	| Int8Array
	| Uint16Array
	| Int16Array
	| Uint32Array
	| Int32Array
	| Float32Array
	| Float64Array
	| string

export type ResolutionKernel = "native" | "area" | "lanczos3" | "cubic" | "nearest"

export type ResolutionConstraint =
	| { readonly kind: "native" }
	| { readonly kind: "max-edge", readonly maxEdge: number }
	| { readonly kind: "pixel-budget", readonly pixelBudget: number }

/** Compact policy data suitable for inclusion in audit artifacts. Raster bytes stay separate. */
export interface ResolutionProfileDefinition {
	readonly version: typeof RESOLUTION_PROFILE_VERSION
	readonly id: string
	readonly constraint: ResolutionConstraint
	readonly kernel: ResolutionKernel
}

export interface RasterDimensions {
	readonly width: number
	readonly height: number
}

/** The only pixel representation accepted by the modern profile layer. */
export interface RgbUcharRaster extends RasterDimensions {
	readonly channels: 3
	readonly depth: "uchar"
	readonly colorSpace: "srgb"
	readonly data: Uint8Array
}

export interface RasterRuntimeVersions {
	readonly node: string
	readonly platform: NodeJS.Platform
	readonly architecture: string
	readonly sharp: string
	readonly vips: string
	readonly sharpVersionsSha256: string
}

export interface RasterIdentity {
	readonly version: typeof RASTER_IDENTITY_VERSION
	readonly sha256: string
	readonly policy: string
	readonly runtime: RasterRuntimeVersions
}

export interface DecodedNativeRaster extends RgbUcharRaster {
	readonly identity: RasterIdentity
}

export interface ResolutionProfileIdentity extends RasterIdentity {
	readonly parentNativeSha256: string
}

export interface ResolutionProfileRaster extends RgbUcharRaster {
	readonly profile: ResolutionProfileDefinition
	readonly identity: ResolutionProfileIdentity
}

/** Exact source span and edge weights for one box-filter target cell on one axis. */
export interface ExactBoxAxisCell {
	readonly sourceStart: number
	readonly sourceEndExclusive: number
	readonly firstWeight: number
	readonly lastWeight: number
}

export interface RasterSampleCoordinates extends RasterDimensions {
	readonly x: Uint32Array
	readonly y: Uint32Array
	readonly indices: Uint32Array
}

export interface CommonDomainSamples {
	readonly columns: number
	readonly rows: number
	readonly count: number
	readonly native: RasterSampleCoordinates
}

function defineProfile(definition: ResolutionProfileDefinition): ResolutionProfileDefinition {
	return Object.freeze({
		...definition,
		constraint: Object.freeze({ ...definition.constraint }),
	})
}

/** Predeclared, versioned profiles authorized for the modern resolution audit. */
export const RESOLUTION_PROFILES: readonly ResolutionProfileDefinition[] = Object.freeze([
	defineProfile({
		version: RESOLUTION_PROFILE_VERSION,
		id: "native",
		constraint: { kind: "native" },
		kernel: "native",
	}),
	defineProfile({
		version: RESOLUTION_PROFILE_VERSION,
		id: "max-edge-224-lanczos3",
		constraint: { kind: "max-edge", maxEdge: 224 },
		kernel: "lanczos3",
	}),
	defineProfile({
		version: RESOLUTION_PROFILE_VERSION,
		id: "max-edge-224-cubic",
		constraint: { kind: "max-edge", maxEdge: 224 },
		kernel: "cubic",
	}),
	defineProfile({
		version: RESOLUTION_PROFILE_VERSION,
		id: "max-edge-224-nearest",
		constraint: { kind: "max-edge", maxEdge: 224 },
		kernel: "nearest",
	}),
	defineProfile({
		version: RESOLUTION_PROFILE_VERSION,
		id: "max-edge-224-area",
		constraint: { kind: "max-edge", maxEdge: 224 },
		kernel: "area",
	}),
	...([320, 448, 896] as const).map((maxEdge) => defineProfile({
		version: RESOLUTION_PROFILE_VERSION,
		id: `max-edge-${maxEdge}-lanczos3`,
		constraint: { kind: "max-edge", maxEdge },
		kernel: "lanczos3",
	})),
	...([50_176, 200_704, 802_816] as const).map((pixelBudget) => defineProfile({
		version: RESOLUTION_PROFILE_VERSION,
		id: `pixel-budget-${pixelBudget}-lanczos3`,
		constraint: { kind: "pixel-budget", pixelBudget },
		kernel: "lanczos3",
	})),
])

const canonicalSharpVersions = JSON.stringify(Object.fromEntries(
	Object.entries(sharpModern.versions).sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0),
))

export const SHARP_VERSIONS_SHA256 = createHash("sha256").update(canonicalSharpVersions, "utf8").digest("hex")

export const MODERN_RASTER_RUNTIME: RasterRuntimeVersions = Object.freeze({
	node: process.versions.node,
	platform: process.platform,
	architecture: process.arch,
	sharp: sharpModern.versions.sharp,
	vips: sharpModern.versions.vips,
	sharpVersionsSha256: SHARP_VERSIONS_SHA256,
})

export const NATIVE_DECODE_POLICY = [
	"decode=sharp-modern",
	"orientation=auto",
	"alpha=flatten-white-rgb-255",
	"colorspace=srgb",
	"channels=3",
	"depth=uchar",
	"resize=none",
].join(";")

function assertPositiveInteger(value: number, name: string): void {
	if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive safe integer`)
}

function assertDimensions(width: number, height: number): void {
	assertPositiveInteger(width, "width")
	assertPositiveInteger(height, "height")
	if (width > Math.floor(0xffff_ffff / height)) {
		throw new RangeError("raster pixel count must fit Uint32 sample indices")
	}
}

function safeIntegerProduct(first: number, second: number, name: string): number {
	if (first > Math.floor(Number.MAX_SAFE_INTEGER / second)) throw new RangeError(`${name} exceeds safe integer precision`)
	return first * second
}

function assertRaster(raster: RgbUcharRaster): void {
	assertDimensions(raster.width, raster.height)
	if (raster.channels !== 3 || raster.depth !== "uchar" || raster.colorSpace !== "srgb") {
		throw new TypeError("raster must be three-channel sRGB uchar data")
	}
	if (raster.data.length !== raster.width * raster.height * 3) {
		throw new RangeError("raster byte length does not match its dimensions")
	}
}

export function maxEdgeDimensions(width: number, height: number, maxEdge: number): RasterDimensions {
	assertDimensions(width, height)
	assertPositiveInteger(maxEdge, "maxEdge")
	if (Math.max(width, height) <= maxEdge) return { width, height }
	if (width >= height) {
		return { width: maxEdge, height: Math.max(1, Math.floor(height * maxEdge / width)) }
	}
	return { width: Math.max(1, Math.floor(width * maxEdge / height)), height: maxEdge }
}

/** Uses scale=min(1,sqrt(P/N)), floors both scaled axes, and never exceeds P after one-pixel clamping. */
export function pixelBudgetDimensions(width: number, height: number, pixelBudget: number): RasterDimensions {
	assertDimensions(width, height)
	assertPositiveInteger(pixelBudget, "pixelBudget")
	const scale = Math.min(1, Math.sqrt(pixelBudget / (width * height)))
	if (scale === 1) return { width, height }

	let targetWidth = Math.max(1, Math.floor(width * scale))
	let targetHeight = Math.max(1, Math.floor(height * scale))
	if (targetWidth * targetHeight > pixelBudget) {
		if (width >= height) targetWidth = Math.max(1, Math.floor(pixelBudget / targetHeight))
		else targetHeight = Math.max(1, Math.floor(pixelBudget / targetWidth))
	}
	return { width: targetWidth, height: targetHeight }
}

export function profileDimensions(
	width: number,
	height: number,
	profile: ResolutionProfileDefinition,
): RasterDimensions {
	switch (profile.constraint.kind) {
		case "native":
			assertDimensions(width, height)
			return { width, height }
		case "max-edge":
			return maxEdgeDimensions(width, height, profile.constraint.maxEdge)
		case "pixel-budget":
			return pixelBudgetDimensions(width, height, profile.constraint.pixelBudget)
	}
}

function constraintPolicy(constraint: ResolutionConstraint): object {
	switch (constraint.kind) {
		case "native": return { kind: constraint.kind }
		case "max-edge": return { kind: constraint.kind, maxEdge: constraint.maxEdge }
		case "pixel-budget": return { kind: constraint.kind, pixelBudget: constraint.pixelBudget }
	}
}

export function resolutionProfilePolicy(profile: ResolutionProfileDefinition): string {
	return JSON.stringify({
		decode: NATIVE_DECODE_POLICY,
		targetDimensions: "floor-preserve-aspect-no-enlargement-v1",
		resampling: profile.kernel === "area" ? AREA_BOX_RESAMPLING_POLICY : { kernel: profile.kernel },
		profile: {
			version: profile.version,
			id: profile.id,
			constraint: constraintPolicy(profile.constraint),
			kernel: profile.kernel,
		},
	})
}

function identifyRasterFrame(
	raster: RgbUcharRaster,
	policy: string,
	parentNativeSha256?: string,
): RasterIdentity | ResolutionProfileIdentity {
	assertRaster(raster)
	if (parentNativeSha256 !== undefined && !/^[0-9a-f]{64}$/.test(parentNativeSha256)) {
		throw new TypeError("parent native identity must be a SHA-256 hex digest")
	}
	const manifest = JSON.stringify({
		version: RASTER_IDENTITY_VERSION,
		width: raster.width,
		height: raster.height,
		channels: raster.channels,
		depth: raster.depth,
		colorSpace: raster.colorSpace,
		byteLength: raster.data.length,
		policy,
		runtime: MODERN_RASTER_RUNTIME,
		...(parentNativeSha256 === undefined ? {} : { parentNativeSha256 }),
	})
	const sha256 = createHash("sha256").update(manifest, "utf8").update("\0").update(raster.data).digest("hex")
	const identity: RasterIdentity = {
		version: RASTER_IDENTITY_VERSION,
		sha256,
		policy,
		runtime: MODERN_RASTER_RUNTIME,
	}
	return parentNativeSha256 === undefined ? identity : { ...identity, parentNativeSha256 }
}

/** Hashes a typed raster manifest and the exact bytes, separated by a NUL byte. */
export function identifyRaster(raster: RgbUcharRaster, policy: string): RasterIdentity {
	return identifyRasterFrame(raster, policy) as RasterIdentity
}

function runtimeVersionsEqual(first: RasterRuntimeVersions, second: RasterRuntimeVersions): boolean {
	return first.node === second.node
		&& first.platform === second.platform
		&& first.architecture === second.architecture
		&& first.sharp === second.sharp
		&& first.vips === second.vips
		&& first.sharpVersionsSha256 === second.sharpVersionsSha256
}

/** Recompute and validate the native identity before it can parent any profile output. */
export function validateDecodedNativeRaster(native: DecodedNativeRaster): RasterIdentity {
	const recomputed = identifyRaster(native, NATIVE_DECODE_POLICY)
	const supplied = native.identity
	if (supplied.version !== recomputed.version
		|| supplied.sha256 !== recomputed.sha256
		|| supplied.policy !== NATIVE_DECODE_POLICY
		|| !runtimeVersionsEqual(supplied.runtime, recomputed.runtime)) {
		throw new Error("decoded native raster identity is stale or does not match its current raster")
	}
	return recomputed
}

function identifyProfileRaster(
	raster: RgbUcharRaster,
	policy: string,
	parentNativeSha256: string,
): ResolutionProfileIdentity {
	return identifyRasterFrame(raster, policy, parentNativeSha256) as ResolutionProfileIdentity
}

/** Decode once at native oriented size; every profile subsequently consumes these raw bytes. */
export async function decodeNativeRaster(input: EncodedImageInput): Promise<DecodedNativeRaster> {
	const { data, info } = await sharpModern(input)
		.autoOrient()
		.toColourspace("srgb")
		.flatten({ background: { r: 255, g: 255, b: 255 } })
		.removeAlpha()
		.raw({ depth: "uchar" })
		.toBuffer({ resolveWithObject: true })

	if (info.channels !== 3 || data.length !== info.width * info.height * 3) {
		throw new Error(`unexpected decoded raster format: ${info.width}x${info.height}x${info.channels}`)
	}
	const raster: RgbUcharRaster = {
		width: info.width,
		height: info.height,
		channels: 3,
		depth: "uchar",
		colorSpace: "srgb",
		data: new Uint8Array(data),
	}
	return { ...raster, identity: identifyRaster(raster, NATIVE_DECODE_POLICY) }
}

/**
 * Compute exact box boundaries with BigInt products, then return safe numeric indices/weights.
 * This remains exact when targetIndex*sourceExtent exceeds Number.MAX_SAFE_INTEGER.
 */
export function exactBoxAxisCell(
	targetIndex: number,
	targetExtent: number,
	sourceExtent: number,
): ExactBoxAxisCell {
	assertPositiveInteger(targetExtent, "targetExtent")
	assertPositiveInteger(sourceExtent, "sourceExtent")
	if (targetExtent > sourceExtent) throw new RangeError("box axis does not enlarge")
	if (!Number.isSafeInteger(targetIndex) || targetIndex < 0 || targetIndex >= targetExtent) {
		throw new RangeError("targetIndex is outside the target axis")
	}

	const target = BigInt(targetExtent)
	const source = BigInt(sourceExtent)
	const start = BigInt(targetIndex) * source
	const end = BigInt(targetIndex + 1) * source
	const startRemainder = start % target
	const endRemainder = end % target
	return {
		sourceStart: Number(start / target),
		sourceEndExclusive: Number(end / target + (endRemainder === 0n ? 0n : 1n)),
		firstWeight: Number(startRemainder === 0n ? target : target - startRemainder),
		lastWeight: Number(endRemainder === 0n ? target : endRemainder),
	}
}

interface ExactBoxAxisMap {
	readonly sourceStart: Uint32Array
	readonly sourceEndExclusive: Uint32Array
	readonly firstWeight: Uint32Array
	readonly lastWeight: Uint32Array
}

function exactBoxAxisMap(targetExtent: number, sourceExtent: number): ExactBoxAxisMap {
	const sourceStart = new Uint32Array(targetExtent)
	const sourceEndExclusive = new Uint32Array(targetExtent)
	const firstWeight = new Uint32Array(targetExtent)
	const lastWeight = new Uint32Array(targetExtent)
	for (let targetIndex = 0; targetIndex < targetExtent; targetIndex++) {
		const cell = exactBoxAxisCell(targetIndex, targetExtent, sourceExtent)
		sourceStart[targetIndex] = cell.sourceStart
		sourceEndExclusive[targetIndex] = cell.sourceEndExclusive
		firstWeight[targetIndex] = cell.firstWeight
		lastWeight[targetIndex] = cell.lastWeight
	}
	return { sourceStart, sourceEndExclusive, firstWeight, lastWeight }
}

/**
 * Exact box integration of nonlinear sRGB uchar code values over source pixel cells.
 * Integer accumulation and half-up rounding are deterministic; this is not linear-light filtering.
 */
export function resizeAreaBoxRgb(
	source: RgbUcharRaster,
	targetWidth: number,
	targetHeight: number,
): RgbUcharRaster {
	assertRaster(source)
	assertDimensions(targetWidth, targetHeight)
	if (targetWidth > source.width || targetHeight > source.height) {
		throw new RangeError("area resize does not enlarge")
	}
	if (targetWidth === source.width && targetHeight === source.height) return source

	const denominator = safeIntegerProduct(source.width, source.height, "area denominator")
	safeIntegerProduct(denominator, 255, "area accumulator")
	const targetPixels = safeIntegerProduct(targetWidth, targetHeight, "area target pixel count")
	const output = new Uint8Array(safeIntegerProduct(targetPixels, 3, "area target byte length"))
	const xMap = exactBoxAxisMap(targetWidth, source.width)
	const yMap = exactBoxAxisMap(targetHeight, source.height)
	for (let targetY = 0; targetY < targetHeight; targetY++) {
		const sourceYStart = yMap.sourceStart[targetY]
		const sourceYEnd = yMap.sourceEndExclusive[targetY]
		for (let targetX = 0; targetX < targetWidth; targetX++) {
			const sourceXStart = xMap.sourceStart[targetX]
			const sourceXEnd = xMap.sourceEndExclusive[targetX]
			let red = 0
			let green = 0
			let blue = 0
			for (let sourceY = sourceYStart; sourceY < sourceYEnd; sourceY++) {
				const overlapY = sourceY === sourceYStart
					? yMap.firstWeight[targetY]
					: sourceY === sourceYEnd - 1 ? yMap.lastWeight[targetY] : targetHeight
				for (let sourceX = sourceXStart; sourceX < sourceXEnd; sourceX++) {
					const overlapX = sourceX === sourceXStart
						? xMap.firstWeight[targetX]
						: sourceX === sourceXEnd - 1 ? xMap.lastWeight[targetX] : targetWidth
					const weight = overlapX * overlapY
					const sourceOffset = (sourceY * source.width + sourceX) * 3
					red += source.data[sourceOffset] * weight
					green += source.data[sourceOffset + 1] * weight
					blue += source.data[sourceOffset + 2] * weight
				}
			}
			const targetOffset = (targetY * targetWidth + targetX) * 3
			output[targetOffset] = Math.floor((red + denominator / 2) / denominator)
			output[targetOffset + 1] = Math.floor((green + denominator / 2) / denominator)
			output[targetOffset + 2] = Math.floor((blue + denominator / 2) / denominator)
		}
	}
	return {
		width: targetWidth,
		height: targetHeight,
		channels: 3,
		depth: "uchar",
		colorSpace: "srgb",
		data: output,
	}
}

export async function renderResolutionProfile(
	native: DecodedNativeRaster,
	profile: ResolutionProfileDefinition,
): Promise<ResolutionProfileRaster> {
	const parentNativeIdentity = validateDecodedNativeRaster(native)
	const target = profileDimensions(native.width, native.height, profile)
	let raster: RgbUcharRaster
	if (target.width === native.width && target.height === native.height) {
		raster = native
	} else if (profile.kernel === "area") {
		raster = resizeAreaBoxRgb(native, target.width, target.height)
	} else if (profile.kernel === "native") {
		throw new Error("native profile cannot have resized dimensions")
	} else {
		const { data, info } = await sharpModern(native.data, {
			raw: { width: native.width, height: native.height, channels: 3 },
		})
			.resize({
				width: target.width,
				height: target.height,
				fit: "fill",
				kernel: profile.kernel,
				withoutEnlargement: true,
				fastShrinkOnLoad: false,
			})
			.toColourspace("srgb")
			.raw({ depth: "uchar" })
			.toBuffer({ resolveWithObject: true })
		if (info.width !== target.width || info.height !== target.height || info.channels !== 3
			|| data.length !== target.width * target.height * 3) {
			throw new Error("Sharp returned an unexpected profile raster format")
		}
		raster = {
			...target,
			channels: 3,
			depth: "uchar",
			colorSpace: "srgb",
			data: new Uint8Array(data),
		}
	}
	return {
		...raster,
		profile,
		identity: identifyProfileRaster(raster, resolutionProfilePolicy(profile), parentNativeIdentity.sha256),
	}
}

export async function renderResolutionProfiles(
	native: DecodedNativeRaster,
	profiles: readonly ResolutionProfileDefinition[] = RESOLUTION_PROFILES,
): Promise<ResolutionProfileRaster[]> {
	const rasters: ResolutionProfileRaster[] = []
	for (const profile of profiles) rasters.push(await renderResolutionProfile(native, profile))
	return rasters
}

/** Allocate the exact 2^24-bit native RGB membership table. */
export function createNativeRgbOccupancy(native: RgbUcharRaster): Uint32Array {
	assertRaster(native)
	const occupancy = new Uint32Array(RGB_OCCUPANCY_WORDS)
	for (let offset = 0; offset < native.data.length; offset += 3) {
		const packed = native.data[offset] * 65_536 + native.data[offset + 1] * 256 + native.data[offset + 2]
		const word = Math.floor(packed / 32)
		occupancy[word] |= 1 << (packed % 32)
	}
	return occupancy
}

/** Exact 24-bit lookup; there is no quantization or probabilistic membership. */
export function nativeRgbOccupancyHas(
	occupancy: Uint32Array,
	rgb: readonly [number, number, number],
): boolean {
	if (occupancy.length !== RGB_OCCUPANCY_WORDS) throw new RangeError("invalid RGB occupancy length")
	for (const channel of rgb) {
		if (!Number.isInteger(channel) || channel < 0 || channel > 255) throw new RangeError("RGB channels must be uchar values")
	}
	const packed = rgb[0] * 65_536 + rgb[1] * 256 + rgb[2]
	return ((occupancy[Math.floor(packed / 32)] >>> (packed % 32)) & 1) === 1
}

/**
 * Map a normalized grid-cell center to its nearest raster-pixel center. The exact
 * formula is floor((2*cell+1)*extent/(2*cellCount)); boundary ties choose the higher index.
 */
export function nearestCenterCoordinate(cell: number, cellCount: number, extent: number): number {
	assertPositiveInteger(cellCount, "cellCount")
	assertPositiveInteger(extent, "extent")
	if (!Number.isSafeInteger(cell) || cell < 0 || cell >= cellCount) throw new RangeError("cell is outside the grid")
	const numerator = (2n * BigInt(cell) + 1n) * BigInt(extent)
	const denominator = 2n * BigInt(cellCount)
	return Math.min(extent - 1, Number(numerator / denominator))
}

export function mapCommonDomainSamples(
	samples: Pick<CommonDomainSamples, "columns" | "rows" | "count">,
	width: number,
	height: number,
): RasterSampleCoordinates {
	assertDimensions(width, height)
	assertPositiveInteger(samples.columns, "sample columns")
	assertPositiveInteger(samples.rows, "sample rows")
	assertPositiveInteger(samples.count, "sample count")
	if (samples.count !== samples.columns * samples.rows) throw new RangeError("invalid common sample grid")
	if (samples.count > COMMON_SAMPLE_LIMIT) throw new RangeError(`sample count cannot exceed ${COMMON_SAMPLE_LIMIT}`)
	const x = new Uint32Array(samples.count)
	const y = new Uint32Array(samples.count)
	const indices = new Uint32Array(samples.count)
	let sample = 0
	for (let row = 0; row < samples.rows; row++) {
		const mappedY = nearestCenterCoordinate(row, samples.rows, height)
		for (let column = 0; column < samples.columns; column++) {
			const mappedX = nearestCenterCoordinate(column, samples.columns, width)
			x[sample] = mappedX
			y[sample] = mappedY
			indices[sample] = mappedY * width + mappedX
			sample++
		}
	}
	return { width, height, x, y, indices }
}

/** Build a deterministic aspect-preserving center grid with at most 16,384 native samples. */
export function createCommonDomainSamples(
	native: RgbUcharRaster,
	maximumSamples = COMMON_SAMPLE_LIMIT,
): CommonDomainSamples {
	assertRaster(native)
	assertPositiveInteger(maximumSamples, "maximumSamples")
	if (maximumSamples > COMMON_SAMPLE_LIMIT) throw new RangeError(`maximumSamples cannot exceed ${COMMON_SAMPLE_LIMIT}`)
	const grid = pixelBudgetDimensions(native.width, native.height, maximumSamples)
	const count = grid.width * grid.height
	const dimensions = { columns: grid.width, rows: grid.height, count }
	return { ...dimensions, native: mapCommonDomainSamples(dimensions, native.width, native.height) }
}

export function commonSampleRgb(raster: RgbUcharRaster, samples: CommonDomainSamples): Uint8Array {
	assertRaster(raster)
	const mapping = raster.width === samples.native.width && raster.height === samples.native.height
		? samples.native
		: mapCommonDomainSamples(samples, raster.width, raster.height)
	const rgb = new Uint8Array(samples.count * 3)
	for (let sample = 0; sample < samples.count; sample++) {
		const sourceOffset = mapping.indices[sample] * 3
		const targetOffset = sample * 3
		rgb[targetOffset] = raster.data[sourceOffset]
		rgb[targetOffset + 1] = raster.data[sourceOffset + 1]
		rgb[targetOffset + 2] = raster.data[sourceOffset + 2]
	}
	return rgb
}

function srgbByteToLinear(value: number): number {
	const channel = value / 255
	return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

/** Interleaved Float32 OKLab values corresponding exactly to commonSampleRgb order. */
export function commonSampleOKLab(raster: RgbUcharRaster, samples: CommonDomainSamples): Float32Array {
	const rgb = commonSampleRgb(raster, samples)
	const labs = new Float32Array(rgb.length)
	for (let offset = 0; offset < rgb.length; offset += 3) {
		const red = srgbByteToLinear(rgb[offset])
		const green = srgbByteToLinear(rgb[offset + 1])
		const blue = srgbByteToLinear(rgb[offset + 2])
		const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
		const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
		const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)
		labs[offset] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
		labs[offset + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
		labs[offset + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	}
	return labs
}
