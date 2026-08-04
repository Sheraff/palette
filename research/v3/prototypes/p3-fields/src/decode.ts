/**
 * Decode (arm-d §2.0) — native resolution, OKLab, and **eligibility** rather than a matte.
 *
 * Three things happen here and nothing else:
 *
 * 1. the file is decoded at the resolution the header reports, with no resampling
 *    (`PHASE_0_DECISIONS.md` §1);
 * 2. every pixel is converted to OKLab, the contract's one space;
 * 3. pixels with alpha < 255 are marked **ineligible** — they take no part in any rank, can never be
 *    selected, and are excluded from their neighbours' local statistics.
 *
 * ## Why exclusion and not a matte
 *
 * The discipline line is that nothing colour-bearing is ever created. A pixel at α = 0.5 composited
 * over white *is a created colour*: it is not a pixel of the artwork and can never be published. So the
 * matte question never arises here, because no matte is ever mixed. Arm-d §2.0 states this as its own
 * answer to the brief's flattening question, and the prototype README makes it binding.
 *
 * Note this differs from the contract's invariant 5, which **refuses** transparent input loudly. The
 * two are compatible in practice: this module still produces a `TransparencyReport`, the candidate
 * still hands it to the validator, and the validator still refuses. Exclusion is what this algorithm
 * does with the pixels while it is running; refusal is what the contract does with the file.
 *
 * ## The per-pixel bar
 *
 * Each pixel carries the same-colour bar of *its own region*, read off the contract's measured
 * `SAME_COLOR_BAR_BY_REGION` via the contract's own `colorRegion`. Regions are memoised per distinct
 * 8-bit triple, so the classifier runs once per colour rather than once per pixel; the memo is keyed on
 * the packed triple and is therefore a map indexed by colour — **allowed, because nothing colour-bearing
 * is stored in it.** What it holds is a region *index*: a number attached to a colour, not a colour
 * standing in for pixels. No pixel is ever read out of it.
 */

import sharp from "sharp"
import { colorFromRgb, colorRegion, rgbToOkLab } from "../../../src/contract/color.ts"
import { COLOR_REGIONS, SAME_COLOR_BAR_BY_REGION } from "../../../src/contract/constants.ts"
import type { Rgb8, TransparencyReport } from "../../../src/contract/types.ts"

/** Thrown when the input is one this candidate cannot process. Surfaces as a failed row, never a skip. */
export class P3DecodeError extends Error {
	override readonly name = "P3DecodeError"
}

export type DecodedImage = Readonly<{
	width: number
	height: number
	/** `max(width, height)` — every length in the pipeline is normalized by this (`CONVENTIONS.md`). */
	longEdge: number
	/** Container format as the decoder reported it. */
	format: string
	/** Interleaved 8-bit sRGB, 3 channels, length `3 * width * height`. */
	rgb: Uint8Array
	/** Interleaved OKLab, length `3 * width * height`. */
	lab: Float64Array
	/** 1 where the pixel is eligible (opaque), 0 where it is not. */
	eligible: Uint8Array
	/** Indices of every eligible pixel, ascending. The population every order statistic runs over. */
	eligibleIndices: Int32Array
	/** The same-colour bar of each pixel's own region. */
	bar: Float64Array
	transparency: TransparencyReport
}>

/** The pixel at `index`, as the exact 8-bit triple the contract requires a published colour to be. */
export function pixelRgb(image: DecodedImage, index: number): Rgb8 {
	const at = index * 3
	return [image.rgb[at], image.rgb[at + 1], image.rgb[at + 2]]
}

/** Normalized position of a pixel, per `CONVENTIONS.md`'s scale-free rule. */
export function pixelPosition(image: DecodedImage, index: number): readonly [number, number] {
	const y = Math.floor(index / image.width)
	return [(index - y * image.width) / image.width, y / image.height]
}

const REGION_BAR_BY_INDEX = COLOR_REGIONS.map((region) => SAME_COLOR_BAR_BY_REGION[region])

/**
 * Decode a file into the fields the pipeline runs on.
 *
 * One pass builds the OKLab planes, the eligibility mask and the per-pixel bar. Three passes over a
 * million pixels would be the difference between a loop that is pleasant to run and one that is not.
 */
export async function decodeImage(imagePath: string): Promise<DecodedImage> {
	const handle = sharp(imagePath)
	// Dimensions and format come from the header. Never from the filename — `music-artworks/` filenames
	// lie for 719 AVIFs (`CONVENTIONS.md`).
	const metadata = await handle.metadata()
	if (metadata.width === undefined || metadata.height === undefined) {
		throw new P3DecodeError(`no header dimensions for ${imagePath}`)
	}

	// `toColourspace("srgb")` normalises greyscale and CMYK inputs to three channels without resampling,
	// so a 1-channel JPEG arrives here as sRGB rather than as a channel-count special case.
	const { data, info } = await handle.toColourspace("srgb").raw().toBuffer({ resolveWithObject: true })
	const channels = info.channels
	if (channels !== 3 && channels !== 4) {
		throw new P3DecodeError(`unsupported channel count ${channels} for ${imagePath}`)
	}

	const width = info.width
	const height = info.height
	const count = width * height
	const rgb = new Uint8Array(count * 3)
	const lab = new Float64Array(count * 3)
	const eligible = new Uint8Array(count)
	const bar = new Float64Array(count)

	// Region index per distinct colour. See the module docstring: a number attached to a colour.
	const regionOfColor = new Map<number, number>()
	let transparentCount = 0
	let eligibleCount = 0

	for (let index = 0; index < count; index += 1) {
		const from = index * channels
		const red = data[from]
		const green = data[from + 1]
		const blue = data[from + 2]
		const to = index * 3
		rgb[to] = red
		rgb[to + 1] = green
		rgb[to + 2] = blue

		const opaque = channels === 3 || data[from + 3] === 255
		if (!opaque) {
			transparentCount += 1
			// Ineligible pixels get no OKLab and no bar: nothing may read them, and leaving them at zero
			// makes an accidental read visibly wrong rather than quietly plausible.
			continue
		}
		eligible[index] = 1
		eligibleCount += 1

		const packed = (red << 16) | (green << 8) | blue
		let region = regionOfColor.get(packed)
		if (region === undefined) {
			region = COLOR_REGIONS.indexOf(colorRegion(colorFromRgb([red, green, blue])))
			regionOfColor.set(packed, region)
		}
		bar[index] = REGION_BAR_BY_INDEX[region]

		const okLab = rgbToOkLab([red, green, blue])
		lab[to] = okLab[0]
		lab[to + 1] = okLab[1]
		lab[to + 2] = okLab[2]
	}

	if (eligibleCount === 0) {
		throw new P3DecodeError(`${imagePath} has no opaque pixels; there is nothing eligible to publish`)
	}

	const eligibleIndices = new Int32Array(eligibleCount)
	let cursor = 0
	for (let index = 0; index < count; index += 1) {
		if (eligible[index] === 1) {
			eligibleIndices[cursor] = index
			cursor += 1
		}
	}

	return {
		width,
		height,
		longEdge: Math.max(width, height),
		format: metadata.format ?? "unknown",
		rgb,
		lab,
		eligible,
		eligibleIndices,
		bar,
		transparency: {
			hasAlphaChannel: channels === 4,
			hasTransparentPixels: transparentCount > 0,
			transparentFraction: transparentCount / count,
		},
	}
}
