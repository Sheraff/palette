/**
 * Synthetic artworks for the excursion test, built as colour sets rather than as PNGs.
 *
 * The excursion machinery consumes exactly two things: an artwork's **occupied exact triples** and a
 * **published ramp**. Neither depends on where in the image a colour sits, so a fixture that paints a
 * PNG and decodes it would be testing `sharp` and the tree, not this file. What these fixtures
 * manufacture instead is the one property the whole doctrine turns on — *does the straight OKLab line
 * between the two ends pass through colours the artwork contains?* — in both directions, with the
 * endpoints and the interior candidates all exact triples of the fixture, exactly as the contract
 * requires of a published palette.
 *
 * The corpus-backed end-to-end evidence is in `flat-byte-identity.test.ts` and `determinism.test.ts`,
 * which run the real candidate over real covers. These two kinds of evidence answer different
 * questions and neither substitutes for the other.
 */

import { rgbToOkLab, okLabToRgb } from "../../../../../src/contract/color.ts"
import type { Rgb8 } from "../../../../../src/contract/types.ts"

/** The three anchors of the bent fixture: a dark blue, a mid green, a light yellow. */
export const BENT_FIRST: Rgb8 = [20, 30, 140]
export const BENT_MIDDLE: Rgb8 = [30, 150, 60]
export const BENT_LAST: Rgb8 = [250, 240, 60]

/** How many steps each leg of a fixture path is drawn with. */
export const PATH_STEPS = 64

function lerpRgb(first: Rgb8, second: Rgb8, position: number): Rgb8 {
	return [
		Math.round(first[0] + (second[0] - first[0]) * position),
		Math.round(first[1] + (second[1] - first[1]) * position),
		Math.round(first[2] + (second[2] - first[2]) * position),
	]
}

/**
 * **The bent artwork**: a genuine three-colour field, blue → green → yellow.
 *
 * Its straight OKLab chord from blue to yellow runs through desaturated greys the artwork does not
 * contain anywhere — which is precisely `PHASE_0_DECISIONS.md`'s *"the 2-stop straight line
 * demonstrably passes through off-artwork colors"*, manufactured.
 */
export function bentPath(): Rgb8[] {
	const path: Rgb8[] = []
	for (let step = 0; step <= PATH_STEPS; step += 1) path.push(lerpRgb(BENT_FIRST, BENT_MIDDLE, step / PATH_STEPS))
	for (let step = 1; step <= PATH_STEPS; step += 1) path.push(lerpRgb(BENT_MIDDLE, BENT_LAST, step / PATH_STEPS))
	return path
}

/**
 * **The straight artwork**: the same two ends, but the field really is the OKLab line between them.
 *
 * Built by interpolating in OKLab and quantising back to 8 bits — the same arithmetic
 * `src/contract/ramp.ts` renders with — so the artwork contains every colour the rendered ramp passes
 * through, and the excursion is zero by construction rather than by luck.
 */
export function straightPath(first: Rgb8, last: Rgb8): Rgb8[] {
	const firstLab = rgbToOkLab(first)
	const lastLab = rgbToOkLab(last)
	const path: Rgb8[] = []
	for (let step = 0; step <= PATH_STEPS * 8; step += 1) {
		const position = step / (PATH_STEPS * 8)
		path.push(
			okLabToRgb([
				firstLab[0] + (lastLab[0] - firstLab[0]) * position,
				firstLab[1] + (lastLab[1] - firstLab[1]) * position,
				firstLab[2] + (lastLab[2] - firstLab[2]) * position,
			]),
		)
	}
	return path
}

/** Pack a list of colours as if they were an image's pixels, for `occupancyOf`. */
export function pixelsOf(colors: readonly Rgb8[]): Int32Array {
	const packed = new Int32Array(colors.length)
	for (let index = 0; index < colors.length; index += 1) {
		packed[index] = (colors[index][0] << 16) | (colors[index][1] << 8) | colors[index][2]
	}
	return packed
}
