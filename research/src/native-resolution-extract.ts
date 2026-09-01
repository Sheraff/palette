import { createHash } from "node:crypto"
import { ALGORITHM_VERSION, extractPaletteWithContext, type ExtractionContext } from "./extract.ts"
import { loadNativeImage, NATIVE_IMAGE_MAXIMUM_PIXELS, type LoadNativeImageOptions } from "./native-resolution-image.ts"
import type { ExtractionResult, RawImage } from "./types.ts"

export const NATIVE_RESOLUTION_ALGORITHM_VERSION = "region-graph-0.19.0-native-resolution-0.1.1-development" as const
export const NATIVE_RESOLUTION_POLICY_VERSION = "region-graph-native-resolution-policy-v2" as const

export const NATIVE_RESOLUTION_POLICY = Object.freeze({
	version: NATIVE_RESOLUTION_POLICY_VERSION,
	baselineAlgorithmVersion: ALGORITHM_VERSION,
	decode: "sharp-0.33.5-rotate-flatten-white-srgb-remove-alpha-raw-uchar",
	analysisDimensions: "decoded-native-no-resize",
	maximumInputPixels: NATIVE_IMAGE_MAXIMUM_PIXELS,
	implementationIsolation: "native-loader-outside-frozen-native-scale-space-closure",
	downstreamPolicy: "unchanged-region-graph-0.19.0-candidates-families-scoring-selection-roles",
})

export const NATIVE_RESOLUTION_POLICY_SHA256 = createHash("sha256")
	.update(NATIVE_RESOLUTION_POLICY_VERSION, "utf8")
	.update("\0")
	.update(JSON.stringify(NATIVE_RESOLUTION_POLICY), "utf8")
	.digest("hex")

export type NativeResolutionExtractionContext = ExtractionContext & {
	resolution: {
		policy: typeof NATIVE_RESOLUTION_POLICY
		policySha256: typeof NATIVE_RESOLUTION_POLICY_SHA256
		nativeImageSha256: string
	}
}

function validateNativeImage(image: RawImage): void {
	if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width <= 0 || image.height <= 0) {
		throw new RangeError("Native resolution extraction requires positive safe-integer dimensions")
	}
	const pixels = image.width * image.height
	if (!Number.isSafeInteger(pixels) || pixels > NATIVE_IMAGE_MAXIMUM_PIXELS || image.data.length !== pixels * 3) {
		throw new RangeError("Native resolution extraction input exceeds its RGB raster bounds")
	}
}

export function nativeResolutionImageSha256(image: RawImage): string {
	validateNativeImage(image)
	return createHash("sha256")
		.update(`${image.width}x${image.height}:`, "utf8")
		.update(image.data)
		.digest("hex")
}

export function extractNativeResolutionPaletteWithContext(image: RawImage): NativeResolutionExtractionContext {
	validateNativeImage(image)
	const context = extractPaletteWithContext(image)
	return {
		...context,
		extraction: {
			...context.extraction,
			version: NATIVE_RESOLUTION_ALGORITHM_VERSION,
		},
		resolution: {
			policy: NATIVE_RESOLUTION_POLICY,
			policySha256: NATIVE_RESOLUTION_POLICY_SHA256,
			nativeImageSha256: nativeResolutionImageSha256(image),
		},
	}
}

export function extractNativeResolutionPalette(image: RawImage): ExtractionResult {
	return extractNativeResolutionPaletteWithContext(image).extraction
}

export async function loadAndExtractNativeResolutionPaletteWithContext(
	source: string | Uint8Array,
	options?: LoadNativeImageOptions,
): Promise<NativeResolutionExtractionContext> {
	return extractNativeResolutionPaletteWithContext(await loadNativeImage(source, options))
}
