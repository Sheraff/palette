/**
 * Decode, and the per-pixel quantities everything downstream reads.
 *
 * The shape is copied from `src/devloop/candidates/toy-median-offsets.ts` and nothing else is:
 * dimensions from the header (`CONVENTIONS.md` — filenames lie), transparency refused loudly rather
 * than flattened (`PHASE_0_DECISIONS.md` §4 invariant 5), the sRGB buffer kept for the whole run
 * because every published colour must be an exact triple out of it (invariant 2), and **no
 * resampling** (§1) — arm-f′'s working-grid downsample is explicitly not adopted here.
 *
 * One pass builds the OKLab image and, beside it, each pixel's **region** and therefore its
 * **regional same-colour bar**. That second array is what lets the whole pipeline speak in bars
 * without ever allocating a `PaletteColor` per pixel: `barBetween(i, j)` below is
 * `sameColorBar(colorOf(i), colorOf(j))` with the object allocation removed, and
 * `tests/alpha-zones.test.ts` pins the two against each other.
 */

import sharp from "sharp"
import {
	REGION_CHROMA_BOUNDARY,
	REGION_LIGHTNESS_BOUNDARY,
	SAME_COLOR_BAR_BY_REGION,
} from "../../../src/contract/constants.ts"
import { rgbToOkLab } from "../../../src/contract/color.ts"
import type { ColorRegion, OkLab, Rgb8 } from "../../../src/contract/types.ts"

/** Thrown when the input is one the contract refuses. Surfaces as a failed row, never a silent skip. */
export class AlphaTreeInputError extends Error {
	override readonly name = "AlphaTreeInputError"
}

/**
 * The four regions in the order this module indexes them. Same members as the contract's
 * `COLOR_REGIONS`; the order here is an implementation detail of the `Uint8Array` and is asserted
 * against `colorRegion()` in the tests.
 */
export const REGION_ORDER = ["dark-neutral", "dark-saturated", "light-neutral", "light-saturated"] as const

const REGION_BARS = Float64Array.from(REGION_ORDER.map((region) => SAME_COLOR_BAR_BY_REGION[region]))

/** Which of the four regions an OKLab triple falls in — `colorRegion()` without the object. */
export function regionIndexOfLab(lightness: number, a: number, b: number): number {
	const dark = lightness < REGION_LIGHTNESS_BOUNDARY
	const neutral = Math.hypot(a, b) < REGION_CHROMA_BOUNDARY
	return (dark ? 0 : 2) + (neutral ? 0 : 1)
}

export function regionNameOfIndex(index: number): ColorRegion {
	return REGION_ORDER[index]
}

/** The bar for a region index. */
export function barOfRegionIndex(index: number): number {
	return REGION_BARS[index]
}

export type DecodedImage = Readonly<{
	path: string
	width: number
	height: number
	format: string
	/** `width * height`. */
	pixelCount: number
	/** Packed `r << 16 | g << 8 | b` per pixel, in raster order. Ascending order is lexicographic RGB. */
	packed: Int32Array
	/** OKLab per pixel, three entries each, in raster order. */
	lab: Float64Array
	/** Region index per pixel — an index into `REGION_ORDER`. */
	region: Uint8Array
	/** The regional same-colour bar per pixel. `REGION_BARS[region[i]]`, precomputed. */
	bar: Float64Array
}>

export function unpack(packed: number): Rgb8 {
	return [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff]
}

export function labOf(image: DecodedImage, pixel: number): OkLab {
	const base = pixel * 3
	return [image.lab[base], image.lab[base + 1], image.lab[base + 2]]
}

/**
 * The bar governing a pair of pixels: **the larger of the two regions' bars**, exactly as
 * `sameColorBar()` in `src/contract/color.ts` decides it for a pair of published colours.
 */
export function barBetween(image: DecodedImage, first: number, second: number): number {
	const a = image.bar[first]
	const b = image.bar[second]
	return a > b ? a : b
}

/** OKLab distance between two pixels of the same image, by the one ruler. */
export function pixelDistance(image: DecodedImage, first: number, second: number): number {
	const i = first * 3
	const j = second * 3
	return Math.hypot(image.lab[i] - image.lab[j], image.lab[i + 1] - image.lab[j + 1], image.lab[i + 2] - image.lab[j + 2])
}

/**
 * Decode an image at native resolution and precompute OKLab, region and bar per pixel.
 *
 * The OKLab conversion is memoised on the packed 8-bit triple through a `Map`, because album
 * artwork repeats colours heavily (a 300×300 JPEG in the demo set holds 24,615 distinct triples in
 * 90,000 pixels) and `rgbToOkLab` is three cube roots. The map is never iterated, only queried, so
 * it cannot leak an iteration order into any result.
 */
export async function decodeImage(imagePath: string): Promise<DecodedImage> {
	const image = sharp(imagePath)
	// Dimensions and format come from the header. Never from the filename.
	const metadata = await image.metadata()
	if (metadata.width === undefined || metadata.height === undefined) {
		throw new AlphaTreeInputError(`no header dimensions for ${imagePath}`)
	}

	const { data, info } = await image.toColourspace("srgb").raw().toBuffer({ resolveWithObject: true })
	const channels = info.channels
	if (channels !== 3 && channels !== 4) {
		throw new AlphaTreeInputError(`unsupported channel count ${channels} for ${imagePath}`)
	}
	if (info.width !== metadata.width || info.height !== metadata.height) {
		throw new AlphaTreeInputError(
			`${imagePath}: decoded ${info.width}×${info.height} does not match the header's ` +
				`${metadata.width}×${metadata.height}; a resample or an orientation swap happened and §1 forbids both`,
		)
	}

	const pixelCount = info.width * info.height
	const packed = new Int32Array(pixelCount)
	const lab = new Float64Array(pixelCount * 3)
	const region = new Uint8Array(pixelCount)
	const bar = new Float64Array(pixelCount)
	const labCache = new Map<number, OkLab>()

	for (let pixel = 0, offset = 0; pixel < pixelCount; pixel += 1, offset += channels) {
		// Invariant 5: a genuinely transparent pixel is refused loudly, never flattened onto an
		// invented background. An alpha channel that is uniformly opaque is not transparency.
		if (channels === 4 && data[offset + 3] !== 255) {
			throw new AlphaTreeInputError(
				`${imagePath} has at least one transparent pixel; the contract refuses transparent input`,
			)
		}
		const key = (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2]
		packed[pixel] = key
		let converted = labCache.get(key)
		if (converted === undefined) {
			converted = rgbToOkLab([data[offset], data[offset + 1], data[offset + 2]])
			labCache.set(key, converted)
		}
		const base = pixel * 3
		lab[base] = converted[0]
		lab[base + 1] = converted[1]
		lab[base + 2] = converted[2]
		const regionIndex = regionIndexOfLab(converted[0], converted[1], converted[2])
		region[pixel] = regionIndex
		bar[pixel] = REGION_BARS[regionIndex]
	}

	return {
		path: imagePath,
		width: metadata.width,
		height: metadata.height,
		format: metadata.format ?? "unknown",
		pixelCount,
		packed,
		lab,
		region,
		bar,
	}
}
