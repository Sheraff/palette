/**
 * Verification (arm-d §2.7). **Selection is cheap and local; verification is a full pass.**
 *
 * For a candidate colour, one pass over the eligible pixels counts how many sit within the same-colour
 * bar of it and accumulates where they are. Two numbers come out: a **support fraction** and a
 * **spatial spread**. A colour that fails is never adjusted — the algorithm *steps the rank*, moves to
 * the next quantile in the same ordering, and re-verifies; every role downstream of a stepped role
 * re-runs, so a relocated defect is impossible rather than hoped against.
 *
 * ## Which population floor this is, and which it is not
 *
 * The count is the **neighbourhood** form: pixels within the pair's regional same-colour bar of the
 * candidate, not pixels bearing its exact triple. Arm-d §2.7 asks for exactly that ("counts the pixels
 * within the same-colour bar of it"), and the distinction matters, because the contract has *retired the
 * exact-triple form as a verdict*: `BELONGS_STUDY.md` measured that it has no discriminating power at
 * any threshold and that it refused 340 of 351 palettes whose colours the reviewer endorsed.
 *
 * So `SOURCE_POPULATION_FLOOR` is used here **as a selection predicate inside this prototype only**. It
 * can step a rank; it can never make a palette invalid, and this module returns no violations. The
 * contract's own verdict is computed where it always was, by `validatePalette`.
 *
 * ## The spread measure, and why it is deliberately weak
 *
 * Spread is the summed interquartile extent of the occurrences' normalized x and y — quantiles of
 * positions, which is what §2.7 says to accumulate, and not a centroid, which would be a mean. Its
 * threshold (`SPATIAL_SPREAD_FLOOR`) is `[UNCALIBRATED]` and set low on purpose: the contract's own
 * spatial-spread validator is *unimplemented* because a made-up threshold there would be worse than
 * nothing, and this is a made-up threshold. It exists so the shape of §2.7 is real code rather than a
 * promise, and it is set where it can only catch a colour living in one tight blob.
 *
 * Positions are accumulated into fixed bins rather than collected into a list: a colour whose bar
 * contains half the artwork would otherwise cost an array of half a million coordinates per
 * verification, and the quantile of a binned position is the quantile of a position to within one bin.
 */

import { SOURCE_POPULATION_FLOOR } from "../../../../../src/contract/constants.ts"
import {
	COHERENT_FILL_FLOOR,
	COHERENT_SUPPORT_MIN,
	SPATIAL_SPREAD_FLOOR,
	SPREAD_POSITION_BINS,
	substrateFlags,
} from "./constants.ts"
import type { DecodedImage } from "./decode.ts"
import { labDistance } from "./primitives.ts"

export type SupportVerdict = Readonly<{
	/** The pixel index that was verified, echoed so a caller can log which rank it was. */
	pixel: number
	/** Fraction of eligible pixels within the same-colour bar of this colour. */
	support: number
	/** Summed interquartile extent of the occurrences' normalized x and y. */
	spread: number
	/** The two axes separately — the substrate branch needs the box, not its perimeter. */
	spreadX: number
	spreadY: number
	/**
	 * `support / (spreadX · spreadY)` — how densely the bar-population fills its own interquartile box.
	 *
	 * The size-aware concentration statistic (W13). A title-text line is tiny but confined to a thin box
	 * and fills it; a JPEG shadow of the same population size is smeared across the artwork and does not.
	 * Computed on every path and reported on every path; only the substrate branch *reads* it.
	 */
	fill: number
	/** True when the raw-share wall passed — recorded separately from the verdict it no longer owns. */
	rawSharePasses: boolean
	/** True when the coherence route passed. Always false with the flag off. */
	coherencePasses: boolean
	supportPasses: boolean
	spreadPasses: boolean
	passes: boolean
}>

function binQuantileExtent(bins: Uint32Array, total: number): number {
	if (total === 0) return 0
	// [INHERITED] — the quartiles. §2.7 asks for an *interquartile* extent, so 0.25 and 0.75 are the
	// definition of the statistic rather than a window anyone chose; the tunable is the floor the result
	// is compared against (`SPATIAL_SPREAD_FLOOR`), which carries its own tag and its own caveat.
	const lowTarget = total * 0.25
	const highTarget = total * 0.75
	let running = 0
	let low = 0
	let high = bins.length - 1
	let haveLow = false
	for (let bin = 0; bin < bins.length; bin += 1) {
		running += bins[bin]
		if (!haveLow && running >= lowTarget) {
			low = bin
			haveLow = true
		}
		if (running >= highTarget) {
			high = bin
			break
		}
	}
	return (high - low) / bins.length
}

/**
 * Verify one candidate colour against the whole image. One pass, no allocation beyond two bin arrays.
 */
export function verifyColor(image: DecodedImage, pixel: number): SupportVerdict {
	const { eligibleIndices, lab, bar, width, height } = image
	const barOfCandidate = bar[pixel]
	const xBins = new Uint32Array(SPREAD_POSITION_BINS)
	const yBins = new Uint32Array(SPREAD_POSITION_BINS)
	let within = 0

	for (let i = 0; i < eligibleIndices.length; i += 1) {
		const index = eligibleIndices[i]
		// The pair's bar, exactly as `sameColorBar` defines it: the larger of the two regions' bars.
		const pairBar = barOfCandidate > bar[index] ? barOfCandidate : bar[index]
		if (labDistance(lab, index, pixel) >= pairBar) continue
		within += 1
		const y = Math.floor(index / width)
		const x = index - y * width
		xBins[Math.min(SPREAD_POSITION_BINS - 1, Math.floor((x / width) * SPREAD_POSITION_BINS))] += 1
		yBins[Math.min(SPREAD_POSITION_BINS - 1, Math.floor((y / height) * SPREAD_POSITION_BINS))] += 1
	}

	const support = within / eligibleIndices.length
	const spreadX = binQuantileExtent(xBins, within)
	const spreadY = binQuantileExtent(yBins, within)
	const spread = spreadX + spreadY
	// The box can be exactly zero when a population is confined inside one bin on an axis; one bin is the
	// finest extent this instrument can report, so that is the divisor's floor. It is the measurement's
	// own resolution, not a tunable.
	const bin = 1 / SPREAD_POSITION_BINS
	const box = Math.max(spreadX, bin) * Math.max(spreadY, bin)
	const fill = support / box

	const rawSharePasses = support >= SOURCE_POPULATION_FLOOR
	// **The coherence route** (`P3_SUBSTRATE=eligibility`). `accent.ts` measured the defect: the accent
	// ordering now puts the reviewer's named mark at or near rank 0 on five of the seven identity covers,
	// and four of them are refused *here*, at 0.025 %, 0.002 %, 0.060 % and 0.025 % against a 0.1 % floor.
	// The corpus fact is that the median ENDORSED role colour's exact-triple share is 8.89e-5. A raw-share
	// wall an order of magnitude above the thing it is meant to admit is a candidacy wall, and the
	// campaign's goal 3 forbids exactly that shape. The route replaces *share* with **spatial coherence
	// of the bar-population**: still a population statistic, still quantiles of positions, never a mean.
	//
	// It is a second sufficient route and not a replacement of the first, so the predicate can only widen.
	// Stated plainly: this cannot fix a colour that is genuinely a diffuse artefact and happens to be
	// concentrated by accident of binning, and `COHERENT_FILL_FLOOR` is `[UNCALIBRATED]`.
	const coherencePasses = substrateFlags().eligibility &&
		support >= COHERENT_SUPPORT_MIN &&
		fill >= COHERENT_FILL_FLOOR
	const supportPasses = rawSharePasses || coherencePasses
	const spreadPasses = spread >= SPATIAL_SPREAD_FLOOR
	return {
		pixel,
		support,
		spread,
		spreadX,
		spreadY,
		fill,
		rawSharePasses,
		coherencePasses,
		supportPasses,
		spreadPasses,
		passes: supportPasses && spreadPasses,
	}
}
