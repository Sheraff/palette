/**
 * P5 field-fit — decode and exact-triple inventory (W-CORE).
 *
 * Two jobs, one pass over the pixels:
 *
 *  1. **The raster the fit runs on.** Full resolution, no resample (`PHASE_0_DECISIONS.md` §1),
 *     dimensions from the header and never from the filename (`CONVENTIONS.md`), transparency
 *     refused loudly rather than flattened onto an invented background (§4 invariant 5). OKLab per
 *     pixel, because OKLab is the only space this contract measures distance in (§3) and every
 *     residual the field fit takes is an OKLab residual.
 *  2. **The ledger of colours the artwork actually contains.** Invariant 2 says every published
 *     colour is an exact pixel of the source, so the whole pipeline downstream of the fit — snap,
 *     excursion test, overlay agglomeration — asks the same question over and over: which exact
 *     8-bit triples occur, how many pixels each has, and where those pixels sit. That is
 *     `Inventory`, and it is built once here rather than recomputed per query.
 *
 * **The OKLab conversion happens once per distinct triple, not once per pixel.** A 640×640 cover has
 * ~410,000 pixels and typically a few tens of thousands of distinct triples; converting per pixel
 * would run an order of magnitude more cube roots for byte-identical results. The per-pixel raster
 * is filled by copying from the per-triple table.
 */

import sharp from "sharp"

import { rgbToOkLab } from "../../../src/contract/color.ts"
import type { Rgb8 } from "../../../src/contract/types.ts"
import type { DecodedRaster, Inventory, TripleStats } from "./types.ts"

/**
 * Thrown when the input is one this prototype refuses to guess about.
 *
 * Named and thrown rather than returned so a bad input surfaces as a failed row in the dev loop,
 * never as a silent skip or a quietly flattened image — the same shape as `ToyCandidateError` in
 * `src/devloop/candidates/toy-median-offsets.ts`.
 */
export class FieldFitDecodeError extends Error {
	override readonly name = "FieldFitDecodeError"
}

/** `r << 16 | g << 8 | b`, the packed 24-bit form used as the inventory key everywhere in P5. */
export function packRgb(rgb: Rgb8): number {
	return ((rgb[0] << 16) | (rgb[1] << 8) | rgb[2]) >>> 0
}

/** Inverse of `packRgb`. */
export function unpackRgb(packed: number): Rgb8 {
	return [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff]
}

/**
 * **The normalized position convention for the whole prototype.** Every module that reads a
 * position — the affine fit's design matrix, the cluster means, the orientation statistic — must use
 * these two functions, or the fit's coefficients and the overlay's positions would be in different
 * coordinate systems and `fieldAt(meanX, meanY)` would evaluate the field somewhere else.
 *
 * Pixel *centres* are mapped: column `i` of `width` goes to `(2i + 1)/width − 1`. So a 4-wide image
 * gives −0.75, −0.25, +0.25, +0.75, and the occupied range is `(−1, 1)` rather than `[−1, 1]`
 * exactly. Two reasons for centres over endpoints (`2i/(width−1) − 1`):
 *
 *  - it is defined for a 1-pixel axis, where the endpoint form divides by zero;
 *  - it is the same map at every resolution, so a coefficient fitted on a 640-wide cover means the
 *    same thing on a 3000-wide one. `CONVENTIONS.md` requires scale-free coordinates and this is
 *    the scale-free reading of "normalized to [−1, 1]".
 *
 * Both forms are symmetric about 0, so `Σx` over any full-width row is exactly 0 either way.
 */
export function normalizedX(column: number, width: number): number {
	return (2 * column + 1) / width - 1
}

/** The vertical half of the convention above; row 0 is the top of the image and maps to −1 + 1/h. */
export function normalizedY(row: number, height: number): number {
	return (2 * row + 1) / height - 1
}

/**
 * Decode an image at native resolution and build both the OKLab raster and the exact-triple
 * inventory.
 *
 * Throws `FieldFitDecodeError` when: the header carries no dimensions; the decode yields a channel
 * count other than 3 or 4; the raw buffer's geometry disagrees with the header; or any pixel is
 * genuinely transparent. An alpha channel that is uniformly opaque is not transparency and is
 * accepted.
 */
export async function decodeAndInventory(
	imagePath: string,
): Promise<{ raster: DecodedRaster; inventory: Inventory }> {
	const image = sharp(imagePath)

	// Dimensions and format come from the header. Never from the filename: 719 AVIFs in
	// `music-artworks/` disagree with their own filenames (`CONVENTIONS.md`).
	const metadata = await image.metadata()
	if (metadata.width === undefined || metadata.height === undefined) {
		throw new FieldFitDecodeError(`no header dimensions for ${imagePath}`)
	}

	const { data, info } = await image.toColourspace("srgb").raw().toBuffer({ resolveWithObject: true })
	const channels = info.channels
	if (channels !== 3 && channels !== 4) {
		throw new FieldFitDecodeError(`unsupported channel count ${channels} for ${imagePath}`)
	}
	// The buffer is what we index into; the header is what the contract's metadata reports. If the
	// two disagree the image is one of the cases this prototype has no ruling for (EXIF rotation,
	// a decoder-side crop), and guessing which one to believe is exactly the silent failure the
	// header rule exists to prevent.
	if (info.width !== metadata.width || info.height !== metadata.height) {
		throw new FieldFitDecodeError(
			`decoded geometry ${info.width}×${info.height} disagrees with header ` +
				`${metadata.width}×${metadata.height} for ${imagePath}`,
		)
	}

	const width = info.width
	const height = info.height
	const pixelCount = width * height
	if (pixelCount === 0) {
		throw new FieldFitDecodeError(`${imagePath} decoded to zero pixels`)
	}

	const packed = new Uint32Array(pixelCount)
	// Which distinct-triple row each pixel belongs to; saves a second Map lookup when the OKLab
	// raster is filled below.
	const tripleIndex = new Int32Array(pixelCount)

	const indexByPacked = new Map<number, number>()
	const tripleKeys: number[] = []
	const tripleCounts: number[] = []
	const tripleSumX: number[] = []
	const tripleSumY: number[] = []

	// Precompute the axis maps: `width + height` divisions instead of `2 · pixelCount`.
	const xOf = new Float64Array(width)
	for (let column = 0; column < width; column += 1) xOf[column] = normalizedX(column, width)
	const yOf = new Float64Array(height)
	for (let row = 0; row < height; row += 1) yOf[row] = normalizedY(row, height)

	let pixel = 0
	for (let row = 0; row < height; row += 1) {
		const y = yOf[row]
		for (let column = 0; column < width; column += 1, pixel += 1) {
			const offset = pixel * channels
			// Invariant 5: a genuinely transparent pixel is refused, never composited onto a
			// background this code would have had to invent.
			if (channels === 4 && data[offset + 3] !== 255) {
				throw new FieldFitDecodeError(
					`${imagePath} has at least one transparent pixel at (${column}, ${row}); ` +
						`the contract refuses transparent input`,
				)
			}
			const key = ((data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2]) >>> 0
			packed[pixel] = key

			let index = indexByPacked.get(key)
			if (index === undefined) {
				index = tripleKeys.length
				indexByPacked.set(key, index)
				tripleKeys.push(key)
				tripleCounts.push(0)
				tripleSumX.push(0)
				tripleSumY.push(0)
			}
			tripleIndex[pixel] = index
			tripleCounts[index] += 1
			tripleSumX[index] += xOf[column]
			tripleSumY[index] += y
		}
	}

	// One OKLab conversion per distinct triple.
	const tripleLab = new Float64Array(tripleKeys.length * 3)
	const triples = new Map<number, TripleStats>()
	for (let index = 0; index < tripleKeys.length; index += 1) {
		const key = tripleKeys[index]
		const rgb = unpackRgb(key)
		const lab = rgbToOkLab(rgb)
		tripleLab[index * 3] = lab[0]
		tripleLab[index * 3 + 1] = lab[1]
		tripleLab[index * 3 + 2] = lab[2]
		triples.set(key, {
			packed: key,
			rgb,
			lab,
			count: tripleCounts[index],
			sumX: tripleSumX[index],
			sumY: tripleSumY[index],
		})
	}

	// The full-resolution OKLab raster, copied from the per-triple table.
	const lab = new Float32Array(pixelCount * 3)
	for (let position = 0; position < pixelCount; position += 1) {
		const source = tripleIndex[position] * 3
		const destination = position * 3
		lab[destination] = tripleLab[source]
		lab[destination + 1] = tripleLab[source + 1]
		lab[destination + 2] = tripleLab[source + 2]
	}

	const inventory: Inventory = {
		triples,
		has: (value: number) => triples.has(value >>> 0),
		totalPixels: pixelCount,
	}

	return {
		raster: {
			width,
			height,
			format: metadata.format ?? "unknown",
			lab,
			packed,
		},
		inventory,
	}
}
