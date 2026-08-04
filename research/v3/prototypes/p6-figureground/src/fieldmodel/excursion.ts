/**
 * The excursion profile of a ramp, and the one admissible reason to add a stop to it.
 *
 * `arm-e-prime.md` §2.3: *"With the ends fixed (they are background and surface), sample the
 * straight OKLab segment and compute its excursion: at each t, the distance to the nearest
 * populated artwork colour, read from the same lattice. If the maximum exceeds the contract's
 * excursion bar, insert one interior stop — the artwork triple that most reduces that maximum, at
 * the t where it peaked — and re-measure until the profile clears the bar."*
 *
 * And the ruling it implements, `PHASE_1_AUTHOR_BRIEF.md` §3.1: *"Stops 3–4 are otherwise guides:
 * they exist only to pull the rendered OKLab interpolation onto the artwork when the 2-stop
 * straight line demonstrably passes through off-artwork colors. Never to expand colorspace coverage
 * or fit a metric. Curvature carries a banding cost when rendered, so the winning gradient is the
 * flattest path that stays on-artwork — excursion reduction justifies a stop; meandering is
 * forbidden."*
 *
 * Two consequences are structural here rather than checked. An insertion is admitted **only** if it
 * strictly reduces the profile's maximum, so meandering is unreachable rather than prohibited; and
 * an inserted stop never changes any description length, so a guide stop cannot buy its own model
 * credit — which is what "never to fit a metric" means in an MDL setting.
 *
 * **What is sampled.** The ideal OKLab polyline between the published stops, not the 8-bit rendered
 * ramp. The proposal says "the straight OKLab segment"; it also keeps the integrand 1-Lipschitz,
 * which is what makes `EXCURSION_SAMPLES_PER_SEGMENT`'s density a proof rather than a measurement.
 * The rendered ramp (`src/contract/ramp.ts`'s `rampColorAt`) differs from it by at most one 8-bit
 * quantisation step; `tests/fieldmodel.test.ts` measures that difference rather than assuming it.
 */

import { colorFromRgb, okLabDistance, okLabToRgb, rgbToOkLab, sameColorBar } from "../../../../src/contract/color.ts"
import type { OkLab } from "../../../../src/contract/types.ts"
import type { DistinctTriple, FieldStop, Lattice } from "../types.ts"
import {
	EXCURSION_BAR_MULTIPLIER,
	EXCURSION_IMPROVEMENT_EPSILON,
	EXCURSION_SAMPLES_PER_SEGMENT,
	GUIDE_CANDIDATE_T_OFFSETS,
	INTERIOR_STOP_T_MARGIN,
	tripleOrderKey,
} from "./constants.ts"
import { lerpOkLab } from "./measure.ts"

/** Where a ramp leaves the artwork, and by how much. */
export type ExcursionProfile = Readonly<{
	/** Largest OKLab distance from the ramp to the nearest populated artwork colour. */
	maxDistance: number
	/**
	 * Largest distance measured in excursion bars — the decision quantity. `> 1` means the ramp
	 * exceeds the inherited bar somewhere.
	 */
	maxInBars: number
	/** Ramp position of that worst sample. Ties keep the earliest position. */
	peakPosition: number
	/** The OKLab point of that worst sample. */
	peakLab: OkLab
}>

/** The published stops' OKLab points: the contract conversion of the exact published pixels. */
function stopLabs(stops: readonly FieldStop[]): OkLab[] {
	return stops.map((stop) => rgbToOkLab(stop.triple.rgb))
}

/** The excursion bar at one point of the ramp: the inherited multiple of that point's regional bar. */
function excursionBarAt(lab: OkLab): number {
	const color = colorFromRgb(okLabToRgb(lab))
	return EXCURSION_BAR_MULTIPLIER * sameColorBar(color, color)
}

/**
 * Sample the polyline and report its worst excursion.
 *
 * Sampling is per segment, so density does not depend on how the stops happen to be spaced — the
 * same reasoning `src/contract/ramp.ts` gives for `sampleRamp`.
 */
export function measureExcursion(stops: readonly FieldStop[], lattice: Lattice): ExcursionProfile {
	if (stops.length === 0) throw new RangeError("an excursion profile needs at least one stop")
	const labs = stopLabs(stops)
	if (stops.length === 1) {
		const distance = lattice.distanceToArtwork(labs[0])
		const bar = excursionBarAt(labs[0])
		return {
			maxDistance: distance,
			maxInBars: bar > 0 ? distance / bar : distance > 0 ? Infinity : 0,
			peakPosition: stops[0].t,
			peakLab: labs[0],
		}
	}

	let maxDistance = 0
	let maxInBars = -1
	let peakPosition = stops[0].t
	let peakLab = labs[0]

	for (let segment = 0; segment + 1 < stops.length; segment++) {
		const from = labs[segment]
		const to = labs[segment + 1]
		const fromT = stops[segment].t
		const toT = stops[segment + 1].t
		const isLast = segment + 2 === stops.length
		const lastStep = isLast ? EXCURSION_SAMPLES_PER_SEGMENT : EXCURSION_SAMPLES_PER_SEGMENT - 1
		for (let step = 0; step <= lastStep; step++) {
			const u = step / EXCURSION_SAMPLES_PER_SEGMENT
			const lab = lerpOkLab(from, to, u)
			const distance = lattice.distanceToArtwork(lab)
			if (distance > maxDistance) maxDistance = distance
			const bar = excursionBarAt(lab)
			const inBars = bar > 0 ? distance / bar : distance > 0 ? Infinity : 0
			// Strict `>` keeps the earliest position on ties — the declared tie-break.
			if (inBars > maxInBars) {
				maxInBars = inBars
				peakPosition = fromT + (toT - fromT) * u
				peakLab = lab
			}
		}
	}

	return { maxDistance, maxInBars: Math.max(0, maxInBars), peakPosition, peakLab }
}

/** The OKLab point of the polyline at a ramp position. */
export function labOnRamp(stops: readonly FieldStop[], labs: readonly OkLab[], position: number): OkLab {
	if (position <= stops[0].t) return labs[0]
	const lastIndex = stops.length - 1
	if (position >= stops[lastIndex].t) return labs[lastIndex]
	let index = 0
	while (index < lastIndex - 1 && position >= stops[index + 1].t) index++
	const span = stops[index + 1].t - stops[index].t
	if (!(span > 0)) return labs[index + 1]
	return lerpOkLab(labs[index], labs[index + 1], (position - stops[index].t) / span)
}

/** One admitted interior stop, with the profile it achieves. */
export type GuideStopInsertion = Readonly<{
	stops: readonly FieldStop[]
	stop: FieldStop
	profile: ExcursionProfile
}>

/**
 * The interior stop that most reduces the profile's maximum, placed at the t where it peaked.
 *
 * Returns `null` when no artwork triple strictly reduces the maximum — the meandering case, which
 * is therefore unreachable rather than refused.
 *
 * **Ordering of the search**, all declared: smallest achieved maximum first; ties to the candidate
 * closest to the straight line between the ramp's two ends (*"the flattest path that stays
 * on-artwork"*); remaining ties to the declared total order on the 8-bit triple.
 */
export function insertGuideStop(
	stops: readonly FieldStop[],
	lattice: Lattice,
	current: ExcursionProfile,
): GuideStopInsertion | null {
	const labs = stopLabs(stops)
	const lastIndex = stops.length - 1

	// Where the stop goes: the peak, held clear of its neighbours by the emitter-safety margin.
	let segment = 0
	while (segment < lastIndex - 1 && current.peakPosition >= stops[segment + 1].t) segment++
	const lowerBound = stops[segment].t + INTERIOR_STOP_T_MARGIN
	const upperBound = stops[segment + 1].t - INTERIOR_STOP_T_MARGIN
	const position = lowerBound > upperBound
		? (stops[segment].t + stops[segment + 1].t) / 2
		: Math.min(upperBound, Math.max(lowerBound, current.peakPosition))
	if (!(position > stops[segment].t && position < stops[segment + 1].t)) return null

	// Candidate colours: artwork triples read off the ramp at and around the peak.
	const candidates: DistinctTriple[] = []
	const seen = new Set<number>()
	for (const offset of GUIDE_CANDIDATE_T_OFFSETS) {
		const readAt = Math.min(stops[lastIndex].t, Math.max(stops[0].t, current.peakPosition + offset))
		const triple = lattice.nearestTriple(labOnRamp(stops, labs, readAt))
		const key = tripleOrderKey(triple.rgb)
		if (seen.has(key)) continue
		seen.add(key)
		candidates.push(triple)
	}

	// The straight line between the ends — the flatness reference for the tie-break.
	const straight = lerpOkLab(
		labs[0],
		labs[lastIndex],
		(position - stops[0].t) / (stops[lastIndex].t - stops[0].t),
	)

	let best: GuideStopInsertion | null = null
	let bestFlatness = Infinity
	for (const triple of candidates) {
		const stop: FieldStop = { triple, t: position }
		const proposed = [...stops.slice(0, segment + 1), stop, ...stops.slice(segment + 1)]
		const profile = measureExcursion(proposed, lattice)
		if (profile.maxInBars >= current.maxInBars - EXCURSION_IMPROVEMENT_EPSILON) continue
		const flatness = okLabDistance(rgbToOkLab(triple.rgb), straight)
		if (best === null) {
			best = { stops: proposed, stop, profile }
			bestFlatness = flatness
			continue
		}
		const improvement = profile.maxInBars - best.profile.maxInBars
		if (improvement < -EXCURSION_IMPROVEMENT_EPSILON) {
			best = { stops: proposed, stop, profile }
			bestFlatness = flatness
		} else if (improvement <= EXCURSION_IMPROVEMENT_EPSILON) {
			const flatter = flatness < bestFlatness ||
				(flatness === bestFlatness && tripleOrderKey(triple.rgb) < tripleOrderKey(best.stop.triple.rgb))
			if (flatter) {
				best = { stops: proposed, stop, profile }
				bestFlatness = flatness
			}
		}
	}

	return best
}
