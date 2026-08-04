/**
 * Decode — the only place in P1 that touches a file.
 *
 * The shape is `src/devloop/candidates/toy-median-offsets.ts`'s, which is the established pattern in
 * this repository, and it is followed for the three reasons that file names:
 *
 *  1. dimensions and format come from the decoder's **header**, never from the filename
 *     (`CONVENTIONS.md`: 719 AVIFs in `music-artworks/` disagree with their own names),
 *  2. an input with a genuinely transparent pixel is **refused loudly** rather than flattened onto an
 *     invented background (`PHASE_0_DECISIONS.md` §4 invariant 5),
 *  3. **native resolution, no resampling** (`PHASE_0_DECISIONS.md` §1) — there is no `.resize()` in
 *     this file and there must never be one.
 */

import sharp from "sharp"
import { DecodeError, TransparentInputError } from "./errors.ts"

/** A decoded raster: 8-bit sRGB at native resolution, plus what the header said about it. */
export type DecodedImage = Readonly<{
	/** The path as given, carried through to the measurement for provenance. */
	path: string
	/** Header width. Asserted equal to the raster's own width. */
	width: number
	/** Header height. Asserted equal to the raster's own height. */
	height: number
	/** Header format, e.g. `jpeg`, `png`, `avif`. */
	format: string
	/** Channels in the raster after the sRGB conversion: 3, or 4 when a uniformly opaque alpha rode along. */
	channels: number
	/** Interleaved 8-bit samples, `height * width * channels` long. */
	data: Uint8Array
}>

/**
 * Decode to 8-bit sRGB at native resolution and refuse what cannot be measured honestly.
 *
 * The alpha scan is fused into the decode rather than run as its own pass: it is the same traversal,
 * and a second pass over the raster for a check that almost never fires is the difference between a
 * loop that is pleasant to run and one that is not.
 */
export async function decodeImage(imagePath: string): Promise<DecodedImage> {
	const image = sharp(imagePath)

	const metadata = await image.metadata()
	if (metadata.width === undefined || metadata.height === undefined) {
		throw new DecodeError(`no header dimensions for ${imagePath}`, imagePath)
	}

	const { data, info } = await image
		.toColourspace("srgb")
		.raw()
		.toBuffer({ resolveWithObject: true })

	if (info.channels !== 3 && info.channels !== 4) {
		throw new DecodeError(
			`unsupported channel count ${info.channels} for ${imagePath}; expected 3 or 4 after sRGB conversion`,
			imagePath,
		)
	}

	// §1 forbids resampling, so the raster must be exactly the size the header claims. A mismatch
	// means the decoder did something to the image on the way out, and every scale-free statistic
	// below would be computed against the wrong denominator.
	if (info.width !== metadata.width || info.height !== metadata.height) {
		throw new DecodeError(
			`decoded raster ${info.width}x${info.height} disagrees with header ${metadata.width}x${metadata.height} for ${imagePath}`,
			imagePath,
		)
	}

	// The only 8-bit test that does not depend on a sharp field being populated: the buffer is
	// exactly one byte per sample, or the samples are not bytes.
	const expectedLength = info.width * info.height * info.channels
	if (data.length !== expectedLength) {
		throw new DecodeError(
			`raster for ${imagePath} is ${data.length} bytes, expected ${expectedLength} for 8-bit ${info.channels}-channel ${info.width}x${info.height}; input is probably not 8 bits per sample`,
			imagePath,
		)
	}

	if (info.channels === 4) {
		const stride = 4
		for (let offset = 0; offset < data.length; offset += stride) {
			const alpha = data[offset + 3]
			if (alpha !== 255) {
				const pixelIndex = offset / stride
				throw new TransparentInputError(
					`${imagePath} has a transparent pixel at (${pixelIndex % info.width}, ${Math.floor(pixelIndex / info.width)}) with alpha ${alpha}; the contract refuses transparent input rather than flattening it`,
					imagePath,
					{ x: pixelIndex % info.width, y: Math.floor(pixelIndex / info.width), alpha },
				)
			}
		}
	}

	return {
		path: imagePath,
		width: metadata.width,
		height: metadata.height,
		format: metadata.format ?? "unknown",
		channels: info.channels,
		data: new Uint8Array(data.buffer, data.byteOffset, data.length),
	}
}
