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
import { rgbToOkLab } from "../../../../../src/contract/color.ts"
import type { Rgb8 } from "../../../../../src/contract/types.ts"

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

/**
 * **An ink and a field that differ in chroma and (almost) not at all in lightness.**
 *
 * Found by scanning two hue ramps for the pair whose OKLab lightnesses are closest while their
 * chromatic separation stays large, so the fixture is a *fact about sRGB* rather than a hand-tuned
 * constant; the test asserts both properties rather than trusting this comment. The pair is what makes
 * `writeChromaticBars` a test of the chromatic lanes: a tree over L cannot contain a node separating two
 * regions of equal lightness, because they are the same level set.
 */
export function isoluminantInkAndField(): Readonly<{ ink: Rgb8; field: Rgb8 }> {
	let best: { ink: Rgb8; field: Rgb8; gap: number; separation: number } | null = null
	for (let red = 120; red <= 255; red += 1) {
		const ink: Rgb8 = [red, 60, 110]
		const inkLab = rgbToOkLab(ink)
		for (let green = 60; green <= 220; green += 1) {
			const field: Rgb8 = [60, green, 110]
			const fieldLab = rgbToOkLab(field)
			const separation = Math.hypot(inkLab[1] - fieldLab[1], inkLab[2] - fieldLab[2])
			if (separation < 0.1) continue
			const gap = Math.abs(inkLab[0] - fieldLab[0])
			if (best === null || gap < best.gap) best = { ink, field, gap, separation }
		}
	}
	if (best === null) throw new Error("no isoluminant ink/field pair found; the fixture's premise is wrong")
	return { ink: best.ink, field: best.field }
}

/**
 * **The D2 fixture: a line of type that only exists in the chroma channels.**
 *
 * The same six strokes, one width, one height, one baseline, one colour as `GLYPH_ROW` — drawn with
 * `isoluminantInkAndField`'s pair, so the glyphs move against their field in `a` and barely at all in
 * `L`. Supersampled and box-filtered for the same reason `writeBars` is: a hard-edged image gives the
 * MSER stability rule nothing to retain but the root.
 *
 * The field's gentle ramp is on the **blue channel alone**. It has to be somewhere — a perfectly flat
 * field has no level structure for stability to be measured against — and blue is the channel OKLab's
 * lightness weights least, so the ramp gives the trees something to hold without quietly turning this
 * back into a fixture the L lane can read.
 */
export async function writeChromaticBars(
	path: string,
	size: number,
	bars: readonly Bar[],
	ink: readonly [number, number, number],
	field: readonly [number, number, number],
): Promise<string> {
	const large = size * SUPERSAMPLE
	const pixels = Buffer.alloc(large * large * 3)
	for (let y = 0; y < large; y += 1) {
		const fade = Math.round((10 * y) / (large - 1))
		for (let x = 0; x < large; x += 1) {
			const offset = (y * large + x) * 3
			pixels[offset] = field[0]
			pixels[offset + 1] = field[1]
			pixels[offset + 2] = field[2] + fade
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
