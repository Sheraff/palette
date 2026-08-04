/**
 * `BuildSubstrate` — decode, convert, ladder, figure–ground (P6 module W1).
 *
 * The whole of proposal §2.0–2.1 in one call: an image file in, and out the three objects every
 * other P6 module reads — the OKLab planes with their original 8-bit triples, the six-rung surround
 * ladder, and the per-pixel figure–ground summary. Nothing here decides anything; it produces the
 * measurements the lattice quadrature, the field model and the energy are computed from.
 *
 * The stages are exported individually as well as composed, so that a bench or a diagnostic can time
 * or inspect one without this function taking a clock. Rule 1: no `Date.now`, no `Math.random`, and
 * nothing in the pipeline reads a clock at all — determinism is not a property to be careful about
 * here, it is the absence of any source of variation.
 */

import type { BuildSubstrate } from "../types.ts"
import { decodePlanes } from "./decode.ts"
import { buildFigureGround } from "./figure-ground.ts"
import { buildSurroundLadder } from "./ladder.ts"

export { linearPlanesToOkLab, linearToOkLab, SRGB_TO_LINEAR, SubstrateRefusal } from "./decode.ts"
export type { DecodedSubstrate } from "./decode.ts"
export { decodePlanes } from "./decode.ts"
export { boxBlurHorizontal, boxBlurVertical, boxSizesForSigma, blurPlaneInPlace } from "./blur.ts"
export { buildSurroundLadder, ladderSigmas, ladderStepSigmas } from "./ladder.ts"
export {
	buildFigureGround,
	decomposeDisplacement,
	regionOfOkLab,
	sameColorBarOfOkLab,
} from "./figure-ground.ts"
export {
	FIELD_WEIGHT_EXCLUDED_COARSE_RUNGS,
	FIELD_WEIGHT_SOFTNESS_BARS,
	GAUSSIAN_BOX_PASSES,
	LADDER_COARSEST_SHORT_EDGE_FRACTION,
	LADDER_FINEST_SHORT_EDGE_FRACTION,
	LADDER_LEVELS,
	MIN_BLUR_SIGMA,
	PREPROCESSING_VERSION,
	SRGB_TABLE_SIZE,
} from "./constants.ts"

/** Decode + convert + ladder + figure–ground. Throws `SubstrateRefusal` on real transparency. */
export const buildSubstrate: BuildSubstrate = async (imagePath) => {
	const decoded = await decodePlanes(imagePath)
	const ladder = buildSurroundLadder(decoded.linear, decoded.planes.width, decoded.planes.height)
	const figureGround = buildFigureGround(decoded.planes, ladder)
	return { planes: decoded.planes, ladder, figureGround }
}
