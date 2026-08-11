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
 * Whatever this module refuses is a **selection predicate inside this prototype only**. It can step a
 * rank; it can never make a palette invalid, and this module returns no violations. The contract's own
 * verdict is computed where it always was, by `validatePalette`.
 *
 * ## What the support test is at 0.4.1, and what it stopped being at 0.4.1
 *
 * **The raw-share wall (`SOURCE_POPULATION_FLOOR`, 0.1 % of the artwork) is retired.** Until 0.4.0 it
 * was the whole support test; the substrate experiment measured a coherence-shaped replacement free
 * (`measurements/substrate/SUBSTRATE.md` §9.1: pairs 8.5 % vs control 8.0 %, perturbations pooled
 * identical at 18.7 %, every coverage-220 contract number identical, cost 0.97×) and the orchestrator
 * adopted it as the 0.4.1 default (`measurements/substrate/ADOPTION_RULING.md` §2). What replaced the
 * wall is **support ≥ `COHERENT_SUPPORT_MIN` AND fill ≥ `COHERENT_FILL_FLOOR`**: a floor under the
 * population at the level where its own spread statistics stop meaning anything, and a *concentration*
 * test above it. Size stops being the question; being a mark rather than a smear becomes the question.
 *
 * `SOURCE_POPULATION_FLOOR` is still imported and still reported as `rawSharePasses`, so a run file can
 * still be read against the 0.1.0–0.4.0 attribution record — it decides nothing.
 *
 * **One distinction the ruling's numbers do not cover, measured here rather than assumed.** W13's
 * `eligibility` branch kept the raw share as a *second sufficient route* (`raw OR coherent`), so
 * "adopted" and "retired" are not the same predicate: retiring the route can only *narrow*, and it
 * narrows exactly where a colour is large but smeared. Measured on coverage-220 at 0.4.1, `raw OR
 * coherent` against `coherent` alone: **every contract number identical (PASS 200/220, 17/4/2, gradient
 * 86, collapses 24/29, 0 escapes) and one published palette differs of 220** — the accent on
 * `ab67616d00001e0200085a34e8d215c0bd5afa26` (`#f8c8b1` strict, `#7c3440` with the route kept). The
 * strict reading is what ships, on that number.
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

import { SOURCE_POPULATION_FLOOR } from "../../../src/contract/constants.ts"
import {
	COHERENT_FILL_FLOOR,
	COHERENT_SUPPORT_MIN,
	SPATIAL_SPREAD_FLOOR,
	SPREAD_POSITION_BINS,
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
	 * Computed and reported on every path, and from 0.4.1 **read** on every path: it is half the support
	 * verdict.
	 */
	fill: number
	/** True when the retired raw-share wall would have passed. Reported only; decides nothing at 0.4.1. */
	rawSharePasses: boolean
	/** True when the coherence rule passed. **This is the support verdict at 0.4.1.** */
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

	// **The retired raw-share wall.** Still computed, still reported, and no longer a route: at 0.4.1 it
	// decides nothing. Kept as a number because every attribution of a stepped rank in the 0.1.0–0.4.0
	// measurement record is written in its terms, and a diagnostic that stopped printing it would make
	// those files unreadable against a current run.
	const rawSharePasses = support >= SOURCE_POPULATION_FLOOR
	// **The coherence route**, the eligibility rule at 0.4.1 (`ADOPTION_RULING.md` §2). `accent.ts`
	// measured the defect: the accent ordering puts the reviewer's named mark at or near rank 0 on five of
	// the seven identity covers, and four of them were refused *here*, at 0.025 %, 0.002 %, 0.060 % and
	// 0.025 % against a 0.1 % floor. The corpus fact is that the median ENDORSED role colour's
	// exact-triple share is **8.89e-5** — a raw-share wall an order of magnitude above the thing it is
	// meant to admit is a candidacy wall, and the campaign's goal 3 forbids exactly that shape. The rule
	// replaces *share* with **spatial coherence of the bar-population**: still a population statistic,
	// still quantiles of positions, never a mean.
	//
	// Stated plainly, twice, because adoption is not vindication: this cannot fix a colour that is
	// genuinely a diffuse artefact and happens to be concentrated by an accident of binning;
	// `COHERENT_FILL_FLOOR` is `[UNCALIBRATED]` and fitted on five covers, four of which are the covers
	// it was judged on; and the ruling names the risk it takes — eligibility admits small coherent lumps,
	// which is the shape item-009's artifact accent wore. The 18 accents this admits on coverage-220 are
	// unreviewed and round-5 carries a sample of them.
	const coherencePasses = support >= COHERENT_SUPPORT_MIN && fill >= COHERENT_FILL_FLOOR
	const supportPasses = coherencePasses
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
