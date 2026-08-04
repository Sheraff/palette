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
 * 5. **Prevalence rank, with a tie band (0.2.0).** Count, for each end, the pixels of F within the
 *    same-colour bar of it. Larger count is the background; the other is the surface. When the two
 *    counts sit within `BACKGROUND_PREVALENCE_TIE_BAND` relative of each other the count is declared
 *    to carry no information and a **fixed convention** decides instead: the darker end (lower OKLab
 *    L) is the background. See the comment at the site for why L is the right quantity to fall back
 *    to and why "darker" is defensible only as a convention.
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

import {
	BACKGROUND_PREVALENCE_TIE_BAND,
	FIELD_DEPTH_QUANTILE,
	RANK_STEP_FRACTION,
	TRIM_LEVEL,
} from "./constants.ts"
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
	/**
	 * The prevalence comparison as it was actually decided, in `far`/`near` terms rather than in
	 * `background`/`surface` terms.
	 *
	 * Recorded because the published `prevalence` pair is already re-ordered by the answer, so it cannot
	 * say *how close the comparison was* or *which rule settled it* — and those are the two things the
	 * attribution of a whole-palette flip needs. Every one of these numbers was computed anyway; this is
	 * a return, not a computation, and it changes nothing about the choice above it.
	 */
	farPrevalence: number
	nearPrevalence: number
	/** `|far − near| / max(far, near)`, the quantity δ_bs is compared against. */
	prevalenceRelativeGap: number
	/** True when the gap fell inside δ_bs and the darker-end convention decided instead of the count. */
	prevalenceTieBandFired: boolean
	/** Which end became the background. */
	farIsBackground: boolean
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
			farPrevalence: n,
			nearPrevalence: n,
			prevalenceRelativeGap: 0,
			prevalenceTieBandFired: false,
			farIsBackground: true,
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

	// Step 5 — prevalence rank, **with a tie band** (0.2.0).
	//
	// Prevalence stays primary: when the two counts are plainly different, the more prevalent end is the
	// background and nothing below runs. But W4's baseline measured that on balanced bimodal covers the
	// two counts land within a fraction of a percent of each other, and that this single comparison
	// flips the whole palette — background and surface swap, the gradient's orientation swaps with them,
	// and the foreground's ordering (built against the background) swaps downstream. 114 of 491
	// disagreements moved all four roles at once, and 68 of the large role-moves were grey→grey.
	//
	// At that distance the count is not evidence. Two counts within `BACKGROUND_PREVALENCE_TIE_BAND`
	// relative of each other are therefore declared tied, and the case is decided by a **fixed
	// convention: the darker end is the background** — lower OKLab L. The point of choosing L is that it
	// is a *far-apart* quantity on exactly the covers that flip: a balanced bimodal near-neutral cover
	// has its two ends at opposite ends of the lightness axis by construction, so ΔL there is enormous
	// while Δprevalence is nil. The cliff is moved from a quantity that ties to one that does not.
	//
	// Why darker and not lighter: it is a convention and is defended as one, not as a measurement. Dark
	// backgrounds are the album-artwork norm the corpus is drawn from, and — the reason that survives if
	// that norm does not — it agrees with the foreground's own tie convention in `foreground.ts`, so the
	// two stated conventions cannot pull a palette in opposite directions.
	const farPrevalence = prevalenceOf(image, fieldSet, farEnd)
	const nearPrevalence = prevalenceOf(image, fieldSet, nearEnd)
	const larger = Math.max(farPrevalence, nearPrevalence)
	const relativeGap = larger === 0 ? 0 : Math.abs(farPrevalence - nearPrevalence) / larger
	let farIsBackground: boolean
	const tieBandFired = relativeGap < BACKGROUND_PREVALENCE_TIE_BAND
	if (relativeGap >= BACKGROUND_PREVALENCE_TIE_BAND) {
		farIsBackground = farPrevalence > nearPrevalence
	} else {
		// Tied. The darker end — lower OKLab L — is the background. An exact L tie between two pixels
		// that also tied on prevalence falls back to 0.1.0's convention (the near end), which keeps the
		// answer a function of the field rather than of which comparison was written first.
		const farL = lab[farEnd * 3]
		const nearL = lab[nearEnd * 3]
		farIsBackground = farL < nearL
	}

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
		farPrevalence,
		nearPrevalence,
		prevalenceRelativeGap: relativeGap,
		prevalenceTieBandFired: tieBandFired,
		farIsBackground,
	}
}
