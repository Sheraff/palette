/**
 * Foreground — two regimes (arm-d §2.5).
 *
 * Foreground is text, and text is a **shape** fact before a colour fact. Text pixels sit at small but
 * non-zero depth (strokes have interiors) and are surrounded, at a slightly larger radius, by a coherent
 * field. So the ink score runs over pixels whose depth falls in a band above zero and below the field:
 * for a pixel p at depth d, take the annulus of radius proportional to d around p, form its **cascade
 * pixel**, and score p by the fraction of the annulus within the same-colour bar of it. High ink score
 * means *a small coherent thing on a coherent ground* — a stroke, a glyph, a mark.
 *
 * The foreground is the cascade pixel of the top-τ sub-population of the ink score. Where the artwork has
 * text, this publishes the designer's ink colour. Where it does not, the ink population fails
 * source-support verification (§2.7) and the algorithm falls to its second regime: the cascade pixel of
 * the top-τ sub-population of **|raw APCA| against the background**, restricted to pixels with
 * non-trivial depth — *"the artwork's most text-like tone"*, not *"the single darkest pixel"*, which
 * would be a JPEG artifact. Note what is absent: no colour rescue at any distance, per the 2026-08-04
 * ruling that text is luminance-driven.
 *
 * ## One clause added to §2.5, reported rather than smoothed
 *
 * §2.5 defines the ink score as the coherence of the *surround* and says nothing about p itself. Taken
 * literally that score saturates at 1.0 for every pixel sitting in or beside a flat area, so the top-τ
 * population would be dominated by background-coloured pixels and the published "ink" would be the
 * background — which is not a tuning failure, it is the score failing to be about ink at all.
 *
 * So a pixel enters the ink population only if it also **clears the same-colour bar from the annulus's
 * cascade pixel**. That is the "*thing* on a ground" half of §2.5's own sentence, and it is a comparison
 * of a pixel to a pixel — the annulus cascade pixel is an actual pixel of the artwork — so it stays
 * inside the discipline line. It is nonetheless a clause this implementation added, and it is named here
 * and in the report rather than folded into the prose above.
 *
 * The annulus is sampled at fixed angles rather than rasterised exactly: a rasterised ring is a different
 * population at every radius, and the score is a *fraction*, so a fixed sample count makes the score
 * comparable between a 2-pixel stroke and a 20-pixel one.
 */

import { apcaRaw } from "../../../src/contract/color.ts"
import {
	INK_ANNULUS_MIN_RADIUS_PX,
	INK_ANNULUS_MIN_SAMPLES,
	INK_ANNULUS_RATIO,
	INK_ANNULUS_SAMPLES,
	TRIM_LEVEL,
} from "./constants.ts"
import { pixelRgb, type DecodedImage } from "./decode.ts"
import { cascadePixel, labDistance, sortByKey, topWindow } from "./primitives.ts"

export type InkField = Readonly<{
	/** Pixels that are a coherent mark on a coherent ground, ascending by index. */
	candidates: Int32Array
	/** The ink score of each candidate, aligned with `candidates`. */
	scores: Float64Array
	/** How many pixels the depth band held, before the ground-clearance clause. */
	bandSize: number
}>

const ANNULUS_COS = new Float64Array(INK_ANNULUS_SAMPLES)
const ANNULUS_SIN = new Float64Array(INK_ANNULUS_SAMPLES)
for (let sample = 0; sample < INK_ANNULUS_SAMPLES; sample += 1) {
	const angle = (2 * Math.PI * sample) / INK_ANNULUS_SAMPLES
	ANNULUS_COS[sample] = Math.cos(angle)
	ANNULUS_SIN[sample] = Math.sin(angle)
}

/**
 * The ink field. The only super-linear term in the pipeline, and it runs **only** on pixels inside the
 * depth band.
 */
export function computeInkField(
	image: DecodedImage,
	depth: Float64Array,
	fieldThreshold: number,
): InkField {
	const { width, height, lab, bar, rgb, eligible, eligibleIndices, longEdge } = image
	const candidates: number[] = []
	const scores: number[] = []
	const ring = new Int32Array(INK_ANNULUS_SAMPLES)
	let bandSize = 0

	for (let i = 0; i < eligibleIndices.length; i += 1) {
		const index = eligibleIndices[i]
		const d = depth[index]
		if (d <= 0 || d >= fieldThreshold) continue
		bandSize += 1

		const y = Math.floor(index / width)
		const x = index - y * width
		const radius = Math.max(INK_ANNULUS_MIN_RADIUS_PX, Math.round(INK_ANNULUS_RATIO * d * longEdge))

		let found = 0
		for (let sample = 0; sample < INK_ANNULUS_SAMPLES; sample += 1) {
			const sx = Math.round(x + radius * ANNULUS_COS[sample])
			const sy = Math.round(y + radius * ANNULUS_SIN[sample])
			if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue
			const neighbour = sy * width + sx
			if (eligible[neighbour] === 0) continue
			ring[found] = neighbour
			found += 1
		}
		if (found < INK_ANNULUS_MIN_SAMPLES) continue

		const ground = cascadePixel(ring, found, lab, rgb)

		// The ground-clearance clause. See the module docstring: added here, not in §2.5.
		const groundBar = bar[index] > bar[ground] ? bar[index] : bar[ground]
		if (labDistance(lab, index, ground) < groundBar) continue

		let coherent = 0
		for (let sample = 0; sample < found; sample += 1) {
			const member = ring[sample]
			const pairBar = bar[member] > bar[ground] ? bar[member] : bar[ground]
			if (labDistance(lab, member, ground) < pairBar) coherent += 1
		}

		candidates.push(index)
		scores.push(coherent / found)
	}

	return { candidates: Int32Array.from(candidates), scores: Float64Array.from(scores), bandSize }
}

export type ForegroundChoice = Readonly<{
	pixel: number
	regime: "ink" | "luminance"
	/** How many pixels the chosen sub-population held. */
	populationSize: number
}>

/**
 * An ordering, computed once and redeemed at as many ranks as the verify-and-step loop asks for.
 *
 * Splitting "what the order is" from "where we cut" is not only a performance matter, though it is that
 * too — re-sorting per step would cost seconds per image. It is also arm-d's own claim made structural:
 * *tuning moves where we cut, never what the order is*. A stepped rank cannot silently re-rank.
 */
export type ForegroundOrdering = Readonly<{ regime: "ink" | "luminance"; sorted: Int32Array }>

/**
 * The first regime's ordering: the ink score, ascending.
 *
 * An empty ink population is the regime test §2.5 names, expressed as "there is nothing to take a rank
 * of" rather than as a threshold.
 */
export function inkOrdering(ink: InkField): ForegroundOrdering | null {
	if (ink.candidates.length === 0) return null
	const scoreOf = new Map<number, number>()
	for (let i = 0; i < ink.candidates.length; i += 1) scoreOf.set(ink.candidates[i], ink.scores[i])
	return { regime: "ink", sorted: sortByKey(ink.candidates, (index) => scoreOf.get(index) as number) }
}

/**
 * The second regime's ordering: |raw APCA| against the background, ascending, over pixels with
 * non-trivial depth.
 *
 * The depth restriction is the whole difference between this and "the darkest pixel": a single ringing
 * artifact on a JPEG edge has depth 0 and is not eligible here.
 */
export function luminanceOrdering(
	image: DecodedImage,
	depth: Float64Array,
	background: number,
): ForegroundOrdering | null {
	const backgroundRgb = pixelRgb(image, background)
	const deep: number[] = []
	for (let i = 0; i < image.eligibleIndices.length; i += 1) {
		const index = image.eligibleIndices[i]
		if (depth[index] > 0) deep.push(index)
	}
	// A pathological image whose every pixel is an edge has no depth anywhere; the whole eligible set is
	// then the honest population, because "restricted to pixels with non-trivial depth" cannot restrict.
	const population = Int32Array.from(deep.length > 0 ? deep : Array.from(image.eligibleIndices))
	if (population.length === 0) return null
	return {
		regime: "luminance",
		sorted: sortByKey(population, (index) => Math.abs(apcaRaw(pixelRgb(image, index), backgroundRgb))),
	}
}

/** Redeem one rank of an ordering: the cascade pixel of its top-τ sub-population, stepped. */
export function chooseForeground(
	image: DecodedImage,
	ordering: ForegroundOrdering,
	step: number,
): ForegroundChoice | null {
	const window = topWindow(ordering.sorted, TRIM_LEVEL, step)
	if (window.length === 0) return null
	return {
		pixel: cascadePixel(window, window.length, image.lab, image.rgb),
		regime: ordering.regime,
		populationSize: window.length,
	}
}
