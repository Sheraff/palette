/**
 * # P3 — per-pixel scalar fields and ranks. The dev-loop candidate.
 *
 * Every published colour is the pixel holding a designated **rank** in a measurement defined at every
 * pixel. No grouping, no shortlist, no candidate set ever. The mechanism, the discipline line and the
 * audit standard live in `../README.md`; the design is `research/v3/phase-1/proposals/arm-d.md`; this
 * file is only the four-line adapter the runner loads.
 *
 * **The discipline line, restated because this is the file an auditor opens first.** Nothing
 * colour-bearing is ever created. Every object the algorithm builds is a pixel of the artwork or a
 * *number attached to a pixel*; all aggregation happens in the scalar domain. No colour histograms or
 * bins, no centroids, no local mean colour, no linear filter on a colour channel, no synthesized,
 * blended or interpolated colour, no data structure indexed by colour that a colour could be read back
 * out of. Alpha < 255 pixels are excluded from eligibility and from their neighbours' statistics,
 * never matted.
 *
 * **The constants are `[UNCALIBRATED]`.** All five of arm-d §4's free parameters run at
 * declared-provisional values chosen by this author; none of the anchoring plans has been executed. See
 * `constants.ts`, which says so per parameter, with its plan.
 *
 * ## Shape
 *
 * The module exports what `src/devloop/types.ts` requires and nothing more: a `candidateId` and a
 * `paletteOf`. It decodes its own input (dimensions from the header, never the filename), publishes only
 * exact pixels of the artwork, and fills in the whole contract including the metadata that keeps a
 * verdict about its output permanently scopable.
 */

import type { Palette } from "../../../src/contract/types.ts"
import type { CandidatePalette } from "../../../src/devloop/types.ts"
import { CANDIDATE_ID } from "./constants.ts"
import { extractPalette } from "./pipeline.ts"

/** The name this candidate is known by in run ids, cache paths and the viewer. */
export const candidateId = CANDIDATE_ID

export const paletteOf: CandidatePalette = async (imagePath: string): Promise<Palette> => {
	const { palette } = await extractPalette(imagePath)
	return palette
}

/**
 * The same run, with the numeric intermediates attached.
 *
 * Not part of the candidate interface — the runner never calls this — but §8's claim is that this
 * paradigm exposes *more* than a clustering one, and an inspection tool that had to re-derive the ink
 * band size or the winning rank correlation from the palette could not.
 */
export { extractPalette } from "./pipeline.ts"
export type { P3Intermediates, P3Result } from "./pipeline.ts"
