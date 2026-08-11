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
 * **0.3.0 adds one object to the vocabulary, and it is a scalar threshold rather than a colour.**
 * `splitAtLargestDecileGap` cuts a population at the midpoint of two deciles of a *scalar* field — the
 * band's own ordering key, or OKLab L. It is a number derived from two order statistics, consumed only
 * as a comparison threshold, never published, never compared to a colour, and no pixel need attain it.
 * Every published colour is still the cascade pixel of an actual sub-population of the artwork, and the
 * band-then-cascade change at the field ends moves *toward* that discipline rather than away: e₁ and e₂
 * were this pipeline's only single-pixel reads and are now populations like every other role.
 *
 * **0.4.1 retires a wall and adds one number.** `SOURCE_POPULATION_FLOOR` — the contract's 0.1 %
 * raw-share floor, consumed here as a selection predicate — stops deciding eligibility; the rule is now
 * a floor at the level where spread statistics stop meaning anything plus a **concentration** test
 * (`verify.ts`, `measurements/substrate/ADOPTION_RULING.md` §2). The one new constant is
 * `ACCENT_LUMP_DEPARTURE_TIE_BAND`, the fourth declared tie band, which closes the W15 audit's
 * requirement-5 finding: the accent's lump election was a near-tied comparison with no declared band and
 * no stated convention. The audit's other correction — promoting margin from a filter to a *rank* — was
 * drafted, measured, and **refuted** (it moved 138/220 coverage accents and destroyed the two
 * reviewer-named marks this release exists to publish); see `accent.ts` and `ACCENT_REDESIGN.md`
 * requirement 7's amendment.
 *
 * **0.4.0 deletes a wall and adds two numbers.** The accent's lexicographic tier wall is gone: the role
 * is now one ordering, the **product of two percentile ranks** (chroma relative to the field, hue
 * separation from it), narrowed by preferences that can none of them empty the population. Both
 * scalars are differences of two pixels' OKLab coordinates and percentile ranks are order statistics of
 * a scalar field, so the redesign introduces **no new constant at all** and materialises nothing. The
 * gradient's guide-stop canon adds the only two new constants in this release —
 * `MIN_GUIDE_STOP_SPACING` (`[MEASURED]`, from the two rounds that have shown a reviewer a multi-stop
 * ramp) and `FOURTH_STOP_PROVEN_UTILITY` (`[REVIEWED]`, the contract's own negotiability clause, `false`
 * with the code path intact).
 *
 * **The constants are `[UNCALIBRATED]`.** All five of arm-d §4's free parameters, the three 0.2.0 tie
 * bands and the five 0.3.0 band/lump/depth constants run at declared-provisional values chosen by this
 * author; only k has had its anchoring plan executed, and ρ* has moved once on a *measured distribution*
 * that is explicitly not its anchor. See `constants.ts`, which says so per parameter, with its plan.
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
