/**
 * # P3 — per-pixel scalar fields and ranks. The dev-loop candidate.
 *
 * Every published colour is the pixel holding a designated **rank** in a measurement defined at every
 * pixel. No grouping, no shortlist, no candidate set ever. The mechanism, the discipline line and the
 * audit standard live in `../README.md`; the design is `research/v3/phase-1/proposals/arm-d.md`; this
 * file is only the four-line adapter the runner loads.
 *
 * **The discipline line, restated verbatim because this is the file an auditor opens first.** Nothing
 * colour-bearing is ever created. Every object the algorithm builds is either a pixel of the artwork or
 * a *number attached to a pixel*. All aggregation happens in the scalar domain. Banned: colour
 * histograms and bins; centroids; any local mean colour; every linear filter on a colour channel; any
 * synthesized, blended, or interpolated colour; **any data structure indexed by colour**. Alpha < 255
 * pixels are excluded from eligibility and from their neighbours' statistics, never matted.
 *
 * The last clause is quoted as README writes it, without 0.1.0's softening ("…that a colour could be
 * read back out of"), because a restatement that quietly widens the line is worse than no restatement
 * (`LINE_AUDIT.md` ruling (d)). Read strictly, one live site is inside it: `decode.ts`'s
 * `Map<packed triple, region index>` memo, which holds a region *index* and out of which no colour or
 * pixel is ever read. It is declared here rather than legislated away, and it is the only one — the
 * auditor's sweep found no other colour-indexed structure, no colour histogram, no centroid, no local
 * mean colour, and no linear filter on a colour channel anywhere in `src/`.
 *
 * At 0.2.0 the prototype also materialises **no OKLab triple at all**: the excursion chord is written in
 * pixel-to-pixel difference form (`gradient.ts`) and `labDistanceToPoint`, the only affordance for
 * measuring a pixel against a created colour, is deleted. The one place the brief asked for interpolated
 * ramp colours — the foreground's ranking quantity — is documented in `foreground.ts` as a declared
 * deviation, with the reason: an APCA against a lerped colour is not rewritable over pixel differences,
 * so it stays a *verification* quantity (`validatePalette`'s whole-ramp check) and never a selection one.
 *
 * **The constants are `[UNCALIBRATED]`.** All five of arm-d §4's free parameters and the three 0.2.0 tie
 * bands run at declared-provisional values chosen by this author; only k has had its anchoring plan
 * executed. See `constants.ts`, which says so per parameter, with its plan.
 *
 * ## Shape
 *
 * The module exports what `src/devloop/types.ts` requires and nothing more: a `candidateId` and a
 * `paletteOf`. It decodes its own input (dimensions from the header, never the filename), publishes only
 * exact pixels of the artwork, and fills in the whole contract including the metadata that keeps a
 * verdict about its output permanently scopable.
 */

import type { Palette } from "../../../../../src/contract/types.ts"
import type { CandidatePalette } from "../../../../../src/devloop/types.ts"
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
