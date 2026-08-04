/**
 * The a and b lanes: the two chromatic channels, quantised the way `../pipeline.ts` quantises L.
 *
 * ## What this closes
 *
 * `../NOTES.md` records the cycle-1 cut in its own words: *"**L only.** No a / b trees. arm-b′ §2.1
 * calls three channels a paradigm commitment and not a tunable, precisely because a tree on L alone
 * is structurally blind to an isoluminant accent."* That blindness is not a tuning failure and no
 * constant can repair it — a red mark and a green mark of the same lightness are literally the same
 * level set, so no tree over L contains a node separating them. The only fix is more trees.
 *
 * With all three, a region is invisible to the parse only when it matches its surround in L **and**
 * a **and** b, which is to say only when it is the same colour. That is the correct blindness.
 *
 * ## Why the tree builder needed no change
 *
 * `../tree.ts`'s `buildTreeOfShapes(levels, width, height, levelCount)` takes an integer raster and a
 * level count. Nothing in it — not the immersion, not the hierarchical queue, not the union-find —
 * knows or asks what the levels *mean*. So the chromatic lanes are a call with different arguments,
 * not a fork and not a wrapper: this module produces the raster, and the tree code is imported
 * untouched. The one thing worth saying out loud is that the tree of shapes is self-dual, so an `a`
 * tree sees a green region against a red field exactly as well as it sees the red against the green.
 *
 * ## The step, not the range
 *
 * a and b carry the same units as L in OKLab and the same-colour bar is one Euclidean radius over all
 * three. So the lanes are quantised at **`L_LEVEL_STEP`**, the step already derived from the smallest
 * measured same-colour bar, and only the axis *range* differs (`constants.ts`). Choosing a different
 * step for chroma would be a second quantisation decision with no second measurement behind it.
 */

import type { DecodedImage } from "../pipeline.ts"
import { unpack } from "../pipeline.ts"
import { rgbToOkLab } from "../../../../src/contract/color.ts"
import { L_LEVEL_COUNT, L_LEVEL_STEP } from "../constants.ts"
import { CHROMA_AXIS_BOUND, CHROMA_AXIS_STEPS, CHROMA_LEVEL_COUNT, type Lane } from "./constants.ts"

/** Thrown when a decoded pixel falls outside the measured sRGB gamut bound. Never clamped. */
export class LaneQuantisationError extends Error {
	override readonly name = "LaneQuantisationError"
}

/** One channel's quantised raster, with the level count its tree must be built at. */
export type LaneChannel = Readonly<{ lane: Lane; levels: Int32Array; levelCount: number }>

/**
 * Quantise one OKLab chroma value to an integer level.
 *
 * `round((value + CHROMA_AXIS_BOUND) / L_LEVEL_STEP)`, which is symmetric about zero: level
 * `CHROMA_AXIS_STEPS` is exactly the neutral axis. Rounding rather than flooring so that the level
 * boundaries fall halfway between representable values, matching what `decodeImage` does for L.
 */
export function chromaLevel(value: number): number {
	if (!(value >= -CHROMA_AXIS_BOUND && value <= CHROMA_AXIS_BOUND)) {
		throw new LaneQuantisationError(
			`OKLab chroma ${value} is outside the measured sRGB bound ±${CHROMA_AXIS_BOUND}; refusing to clamp`,
		)
	}
	return Math.round(value / L_LEVEL_STEP) + CHROMA_AXIS_STEPS
}

/**
 * The three lanes of a decoded image, in `LANES` order.
 *
 * The L lane is `image.levels` verbatim — the same array the L-only pipeline built its tree on, so
 * the chromatic candidate's L lane *is* `p2-tos`, not a re-derivation of it.
 *
 * a and b are tabulated per distinct colour rather than per pixel, for the same reason `decodeImage`
 * tabulates L: covers repeat colours heavily and the cube roots are the expensive part. The map is
 * keyed on the packed triple, and its iteration order is never read.
 */
export function quantiseLanes(image: DecodedImage): readonly LaneChannel[] {
	const pixelCount = image.packed.length
	const aLevels = new Int32Array(pixelCount)
	const bLevels = new Int32Array(pixelCount)
	const levelsOfColor = new Map<number, number>()

	for (let pixel = 0; pixel < pixelCount; pixel += 1) {
		const color = image.packed[pixel]
		let packedLevels = levelsOfColor.get(color)
		if (packedLevels === undefined) {
			const lab = rgbToOkLab(unpack(color))
			packedLevels = chromaLevel(lab[1]) * CHROMA_LEVEL_COUNT + chromaLevel(lab[2])
			levelsOfColor.set(color, packedLevels)
		}
		aLevels[pixel] = (packedLevels / CHROMA_LEVEL_COUNT) | 0
		bLevels[pixel] = packedLevels % CHROMA_LEVEL_COUNT
	}

	return [
		{ lane: "L", levels: image.levels, levelCount: L_LEVEL_COUNT },
		{ lane: "a", levels: aLevels, levelCount: CHROMA_LEVEL_COUNT },
		{ lane: "b", levels: bLevels, levelCount: CHROMA_LEVEL_COUNT },
	]
}
