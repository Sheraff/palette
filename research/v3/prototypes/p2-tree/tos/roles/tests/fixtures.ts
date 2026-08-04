/**
 * Synthetic fixtures for the role stage, drawn programmatically.
 *
 * The detector's unit tests must not depend on the artwork corpus: a text detector that can only be
 * tested on covers is a detector whose failures are always ambiguous between "the grouping is wrong"
 * and "that cover is unusual". These fixtures make the *manufacture* of type explicit — six strokes of
 * one width, one height, one colour, on one baseline — so a failure is a statement about the code.
 *
 * ## Why the fixtures are supersampled and why the field is not uniform
 *
 * A hard-edged two-colour PNG is not a weak test of this pipeline, it is a *degenerate* one. The MSER
 * stability rule retains a node when its growth is a local minimum along its branch; on an image with
 * exactly two levels the root's growth is 0 and every mark's is positive, so **nothing but the root is
 * ever retained** and the parse sees one flat field with no marks on it at all. Real artwork never
 * looks like that: glyph edges are antialiased and JPEG-rung, and fields carry a gradient or noise.
 *
 * So the fixtures are drawn at `SUPERSAMPLE`× and box-filtered down — which is how the antialiasing a
 * renderer would produce is manufactured, and it happens entirely in the *fixture*, never in the
 * pipeline, which still decodes at native resolution and resamples nothing. The field carries a gentle
 * vertical ramp for the same reason.
 *
 * The corpus-backed acceptance cases live in `acceptance.test.ts` and are a different kind of evidence.
 */

import sharp from "sharp"

export type Bar = Readonly<{ x: number; y: number; width: number; height: number }>

/** How much the fixture is drawn oversized before being filtered down. Fixture manufacture only. */
export const SUPERSAMPLE = 4

/** Paint dark bars on a light, gently ramped field and write a lossless PNG at `size`×`size`. */
export async function writeBars(
	path: string,
	size: number,
	bars: readonly Bar[],
	ink: readonly [number, number, number] = [8, 8, 8],
	field: readonly [number, number, number] = [246, 246, 246],
): Promise<string> {
	const large = size * SUPERSAMPLE
	const pixels = Buffer.alloc(large * large * 3)
	for (let y = 0; y < large; y += 1) {
		// A gentle vertical ramp over the field, so the level axis has structure to be stable against.
		const fade = (18 * y) / (large - 1)
		for (let x = 0; x < large; x += 1) {
			const offset = (y * large + x) * 3
			pixels[offset] = Math.round(field[0] - fade)
			pixels[offset + 1] = Math.round(field[1] - fade)
			pixels[offset + 2] = Math.round(field[2] - fade)
		}
	}
	for (const bar of bars) {
		for (let y = bar.y * SUPERSAMPLE; y < (bar.y + bar.height) * SUPERSAMPLE; y += 1) {
			for (let x = bar.x * SUPERSAMPLE; x < (bar.x + bar.width) * SUPERSAMPLE; x += 1) {
				if (x < 0 || y < 0 || x >= large || y >= large) continue
				const offset = (y * large + x) * 3
				pixels[offset] = ink[0]
				pixels[offset + 1] = ink[1]
				pixels[offset + 2] = ink[2]
			}
		}
	}
	await sharp(pixels, { raw: { width: large, height: large, channels: 3 } })
		.resize(size, size, { kernel: "cubic" })
		.png({ compressionLevel: 0 })
		.toFile(path)
	return path
}

/**
 * A line of glyph-like bars: six strokes, one width, one height, one baseline, one colour.
 *
 * Every clause of arm-b §2.4's conjunction is satisfied on purpose, so a detector that misses this is
 * broken rather than merely insensitive.
 */
export const GLYPH_ROW: readonly Bar[] = [
	{ x: 12, y: 40, width: 7, height: 34 },
	{ x: 27, y: 40, width: 7, height: 34 },
	{ x: 42, y: 40, width: 7, height: 34 },
	{ x: 57, y: 40, width: 7, height: 34 },
	{ x: 72, y: 40, width: 7, height: 34 },
	{ x: 87, y: 40, width: 7, height: 34 },
]

/**
 * Six marks that agree on nothing: widths 3 to 21, heights 8 to 48, positions scattered over the
 * plane in both axes.
 *
 * The negative control. Same count, same colour, same field — so anything the detector says about it
 * is a statement about the geometric conjunction and not about counting or colour.
 */
export const INCOHERENT_MARKS: readonly Bar[] = [
	{ x: 8, y: 6, width: 21, height: 48 },
	{ x: 100, y: 8, width: 3, height: 9 },
	{ x: 52, y: 20, width: 14, height: 14 },
	{ x: 96, y: 70, width: 5, height: 30 },
	{ x: 14, y: 86, width: 18, height: 8 },
	{ x: 60, y: 96, width: 9, height: 20 },
]
