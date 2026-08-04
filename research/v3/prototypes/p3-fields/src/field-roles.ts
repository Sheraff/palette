/**
 * Background and surface — **the two ends of one field** (arm-d §2.3).
 *
 * The endpoint ruling says the ramp's ends *are* the two field roles, so they are not selected
 * independently: they are one question with two answers, which is what makes the flat case and the
 * collapse case fall out of the measurement instead of being special-cased.
 *
 * The five steps, in order, each a pure order statistic:
 *
 * 1. **m**, the cascade pixel of the field set F — the field's median colour, an actual pixel.
 * 2. **e₁**, the pixel of F at the (1 − τ) quantile of OKLab distance from m. The field's far end, read
 *    at a trimmed rank rather than at the maximum.
 * 3. **u**, the unit direction from m's colour toward e₁'s colour. A direction is three numbers and is
 *    *not* colour-bearing: never published, never compared to a pixel, never a proxy for one. Arm-d
 *    draws that line explicitly rather than quietly, and so does this file.
 * 4. **e₂**, the pixel of F at the τ quantile of the projection of F's colours onto u — the opposite end
 *    of the same progression.
 * 5. **Prevalence rank.** Count, for each end, the pixels of F within the same-colour bar of it. Larger
 *    count is the background; the other is the surface.
 *
 * If e₁ and e₂ are within the same-colour bar, the field is one colour: surface collapses to background
 * *exactly*, the flag is set, and no gradient is publishable — the contract's own consequence, arrived
 * at rather than encoded.
 *
 * ## A tension worth naming rather than smoothing
 *
 * Steps 2 and 4 select a **single pixel at a rank**, which is what §2.3 says. §2.5 and §2.6 instead take
 * the cascade pixel of a *sub-population* at a rank. The single-pixel form is the more literal reading of
 * §2.3 and is what "step the rank" in §2.7 presumes, so it is what is implemented; but it is also the
 * one place in this pipeline where a published colour rests on one pixel rather than on a population,
 * and if the ends turn out to move under re-encode, this is the first line to look at.
 */

import { FIELD_DEPTH_QUANTILE, RANK_STEP_FRACTION, TRIM_LEVEL } from "./constants.ts"
import type { DecodedImage } from "./decode.ts"
import type { DepthField } from "./fields.ts"
import { cascadePixel, labDistance, quantileIndex, sortByKey } from "./primitives.ts"

/**
 * The **field set F**: the eligible pixels whose depth exceeds the β quantile of depth.
 *
 * Strictly-greater is what §2.3 says. When depth is heavily tied — a poster-flat artwork where most of
 * the image sits at the same distance from the nearest edge — strictly-greater can return the empty set,
 * and an empty field set is not a finding about the artwork, it is an artifact of a tie. So the fallback
 * is the same quantile read inclusively, which is the same rank with the ties kept.
 */
export function computeFieldSet(
	image: DecodedImage,
	depth: DepthField,
): Readonly<{ indices: Int32Array; threshold: number }> {
	const eligible = image.eligibleIndices
	const sorted = sortByKey(eligible, (index) => depth.depth[index])
	const threshold = depth.depth[sorted[quantileIndex(sorted.length, FIELD_DEPTH_QUANTILE)]]

	const strict: number[] = []
	for (let i = 0; i < eligible.length; i += 1) {
		if (depth.depth[eligible[i]] > threshold) strict.push(eligible[i])
	}
	if (strict.length > 0) return { indices: Int32Array.from(strict), threshold }

	const inclusive: number[] = []
	for (let i = 0; i < eligible.length; i += 1) {
		if (depth.depth[eligible[i]] >= threshold) inclusive.push(eligible[i])
	}
	return {
		indices: Int32Array.from(inclusive.length > 0 ? inclusive : Array.from(eligible)),
		threshold,
	}
}

export type FieldEnds = Readonly<{
	/** The field's median colour, as a pixel index. */
	median: number
	/** The far end at the (1 − τ) rank of distance from the median. */
	farEnd: number
	/** The opposite end at the τ rank of the projection onto u. */
	nearEnd: number
	/** The unit direction from m toward e₁. `null` when the field has no extent at all. */
	direction: readonly [number, number, number] | null
	background: number
	surface: number
	/** True when the two ends are within the same-colour bar: one colour, no ramp. */
	collapsed: boolean
	/** Projection of every pixel of F onto u, aligned with `fieldSet`'s order. */
	projection: Float64Array
	/** How many pixels of F sit within the bar of each end, in `[background, surface]` order. */
	prevalence: readonly [number, number]
}>

function prevalenceOf(image: DecodedImage, fieldSet: Int32Array, end: number): number {
	const { lab, bar } = image
	const barOfEnd = bar[end]
	let count = 0
	for (let i = 0; i < fieldSet.length; i += 1) {
		const index = fieldSet[i]
		const pairBar = barOfEnd > bar[index] ? barOfEnd : bar[index]
		if (labDistance(lab, index, end) < pairBar) count += 1
	}
	return count
}

/**
 * Steps 1–5, with `step` walking e₁ down its ordering (§2.7's "step the rank").
 *
 * Each step moves `RANK_STEP_FRACTION` of the field set — small enough that a stepped end is still the
 * same end, large enough not to be swallowed by a run of tied distances.
 */
export function chooseFieldEnds(image: DecodedImage, fieldSet: Int32Array, step: number): FieldEnds {
	const { lab, bar, rgb } = image
	const n = fieldSet.length

	const median = cascadePixel(fieldSet, n, lab, rgb)

	// Step 2 — the far end at the (1 − τ) rank of distance from m.
	const byDistance = sortByKey(fieldSet, (index) => labDistance(lab, index, median))
	const stepSize = Math.max(1, Math.round(RANK_STEP_FRACTION * n))
	const farRank = Math.max(0, quantileIndex(n, 1 - TRIM_LEVEL) - step * stepSize)
	const farEnd = byDistance[farRank]

	// Step 3 — the direction. Three numbers, never published, never compared to a pixel.
	const dl = lab[farEnd * 3] - lab[median * 3]
	const da = lab[farEnd * 3 + 1] - lab[median * 3 + 1]
	const db = lab[farEnd * 3 + 2] - lab[median * 3 + 2]
	const extent = Math.hypot(dl, da, db)
	const projection = new Float64Array(n)

	if (extent === 0) {
		// The field has no extent: every pixel of F is m's colour to the bit. One colour, both ends m.
		return {
			median,
			farEnd: median,
			nearEnd: median,
			direction: null,
			background: median,
			surface: median,
			collapsed: true,
			projection,
			prevalence: [n, n],
		}
	}

	const u: readonly [number, number, number] = [dl / extent, da / extent, db / extent]
	for (let i = 0; i < n; i += 1) {
		const at = fieldSet[i] * 3
		projection[i] = (lab[at] - lab[median * 3]) * u[0] +
			(lab[at + 1] - lab[median * 3 + 1]) * u[1] +
			(lab[at + 2] - lab[median * 3 + 2]) * u[2]
	}

	// Step 4 — the opposite end at the τ rank of the projection.
	const byProjection = sortByKey(fieldSet, (index) => {
		const at = index * 3
		return (lab[at] - lab[median * 3]) * u[0] +
			(lab[at + 1] - lab[median * 3 + 1]) * u[1] +
			(lab[at + 2] - lab[median * 3 + 2]) * u[2]
	})
	const nearRank = Math.min(n - 1, quantileIndex(n, TRIM_LEVEL) + step * stepSize)
	const nearEnd = byProjection[nearRank]

	// The collapse test, measured rather than encoded.
	const endsBar = Math.max(bar[farEnd], bar[nearEnd])
	const collapsed = labDistance(lab, farEnd, nearEnd) < endsBar

	// Step 5 — prevalence rank. Larger count is the background.
	const farPrevalence = prevalenceOf(image, fieldSet, farEnd)
	const nearPrevalence = prevalenceOf(image, fieldSet, nearEnd)
	// A tie goes to the *near* end being the background: the near end sits at the τ rank of the
	// progression and the far end at the (1 − τ) rank of distance from the median, so on equal
	// prevalence the near end is the one the field's own median sits closer to. Stated so the tie-break
	// is a decision on the record rather than an accident of which comparison was written first.
	const farIsBackground = farPrevalence > nearPrevalence

	const background = farIsBackground ? farEnd : nearEnd
	const surface = collapsed ? background : farIsBackground ? nearEnd : farEnd

	return {
		median,
		farEnd,
		nearEnd,
		direction: u,
		background,
		surface,
		collapsed,
		projection,
		prevalence: farIsBackground ? [farPrevalence, nearPrevalence] : [nearPrevalence, farPrevalence],
	}
}
