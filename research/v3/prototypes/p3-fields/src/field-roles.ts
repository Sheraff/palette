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
 * 2. **e₁**, the **cascade pixel of the band of F ending at the (1 − τ) quantile** of OKLab distance from
 *    m (0.3.0; single-rank at 0.1.0–0.2.0). The field's far end, read as a population rather than as one
 *    pixel.
 * 3. **u**, the unit direction from m's colour toward e₁'s colour. A direction is three numbers and is
 *    *not* colour-bearing: never published, never compared to a pixel, never a proxy for one. Arm-d
 *    draws that line explicitly rather than quietly, and so does this file.
 * 4. **e₂**, the cascade pixel of the band of F starting at the τ quantile of the projection of F's
 *    colours onto u — the opposite end of the same progression, read the same way.
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
 * ## 0.3.0 — band-then-cascade, and the tension it resolves
 *
 * 0.2.0's docstring named this file's own weak point and said *"if the ends turn out to move under
 * re-encode, this is the first line to look at"*. They do, and it was.
 * `measurements/attribution/ATTRIBUTION.md` attributes **87 of 122** first divergences to the field-ends
 * block, **68** to `e1-colour` alone, and **17 of the 19 whole-palette flips** to `e1-colour`; `fg-cascade`
 * produces **zero** all-four flips. Inside those 68 rows, **36** have the field's own cascade pixel *m*
 * holding by the contract's bar while the rank-(1 − τ) pixel under it lands on a different colour — the
 * single-pixel read moving with nothing else moving.
 *
 * So steps 2 and 4 no longer redeem a rank against *one pixel*. Each takes the **trimmed band** of its
 * ordering — τ·`ENDS_BAND_TAU_MULTIPLE` of the field set, with its far edge at the rank that used to be
 * published — and publishes that band's **cascade pixel**, which is the primitive §2.5 and §2.6 already
 * use and the one the rest of this pipeline trusts. Nothing about the *ordering* changed; only where the
 * order is cut and what is redeemed at the cut, which is arm-d §4's own account of what tuning may touch.
 *
 * **The lump clause.** A band is a contiguous slice of *ranks*, not of *values*, so it can still straddle
 * two density lumps — and a cascade pixel is a median, which lands in whichever lump holds more pixels,
 * which on a balanced cover is the coin-flip one layer down. When the band's own scalar has a decile gap
 * wide enough to call it two lumps (`LUMP_GAP_RATIO`, `ATTRIBUTION.md`'s own probe statistic), the cascade
 * is restricted to the **dominant** lump; when the two lumps' masses sit within `LUMP_MASS_TIE_BAND` the
 * **farther** lump wins instead, because an end is asked to be an end. Both rules are comparisons of
 * counts and of order statistics of one scalar field — no colour is created, compared to an average, or
 * indexed.
 *
 * ## The degenerate-depth membership rule (0.3.0)
 *
 * The other half of the same measurement: field-set size drifts by a **median 5.5 % and a maximum
 * 2789.9 %** between a cover and its re-encode. A band over a population that changes by 28× is a band
 * over noise. `computeFieldSet` therefore states the case where the β cut carries no information — the
 * β-quantile depth at or under one pixel of the distance transform — and falls back to a wider membership
 * rule there rather than ranking the noise. See that function.
 */

import {
	BACKGROUND_PREVALENCE_TIE_BAND,
	DEGENERATE_DEPTH_FLOOR_FRACTION,
	DEGENERATE_DEPTH_FLOOR_PX,
	depthFloorModeInUse,
	ENDS_BAND_TAU_MULTIPLE,
	FIELD_DEPTH_QUANTILE,
	LUMP_GAP_RATIO,
	LUMP_MASS_TIE_BAND,
	RANK_STEP_FRACTION,
	TRIM_LEVEL,
} from "./constants.ts"
import type { DecodedImage } from "./decode.ts"
import type { DepthField } from "./fields.ts"
import {
	cascadePixel,
	labDistance,
	quantileIndex,
	sortByKey,
	splitAtLargestDecileGap,
} from "./primitives.ts"

/** Which rule decided F's membership. Recorded so a divergence in the rule is countable. */
export type FieldSetRule = "beta-quantile" | "degenerate-depth" | "coherence-quantile"

/**
 * **F as the top (1 − β) of the coherence field** — the substrate branch (W13, `P3_SUBSTRATE=field`).
 *
 * The whole reason the degenerate case exists on the shipped path is that the β cut is a cut on a
 * quantity whose *distribution* is manufactured by the edge map: `ATTRIBUTION.md` measured F's size
 * drifting by up to 2789.9 % between a cover and its re-encode, and `PAIRS_ATTRIBUTION.md` §5 measured
 * that no placement of a floor on that quantity, in either units, is rendition-stable.
 *
 * `coherence` is a **percentile field** (`coherence.ts`), uniform on [0, 1] over the eligible pixels.
 * This docstring used to say that its top (1 − β) is therefore exactly (1 − β) of the artwork on every
 * rendition and at every resolution — no size to drift, no empty set to guard, **no floor to place** —
 * and that `DEGENERATE_DEPTH_FLOOR_PX` is not consulted here.
 *
 * **Measured, that is false, and the counter-example is in the paragraph below.**
 * `measurements/substrate/SUBSTRATE_2.md` §5, over **539 files**: F's fraction runs min **9.8e-6**,
 * median 0.2500, p90 0.4442, max **0.8922**, and is **not exactly (1 − β) on 205 of 539 files (38 %)**;
 * one dither-arm file returns **F = 4 pixels of 409 600**. The tie fallback below is not a separate
 * concern from degeneracy — it *is* the mechanism: the strict cut `coherence > threshold` sits on a
 * **tie-averaged** percentile field, so a flat artwork parks a large block of pixels on one shared value
 * and the cut lands wherever that block ends rather than at the rank. The floor is genuinely not
 * consulted on this path, and the 4-pixel case is what that costs. Nothing is repaired here: the branch
 * is FALSIFIED and off (`SUBSTRATE_2_RULING.md`); only the claim is corrected, per that ruling's
 * follow-ups.
 *
 * The strict/inclusive fallback is kept verbatim from `computeFieldSet` because it is about *ties*: a
 * poster-flat artwork can put more than (1 − β) of its pixels on one tied percentile value, and
 * strictly-greater would then return the empty set for the same arithmetic reason it does on the depth
 * field. What the measurement adds is that the same tie structure moves F's size well short of the empty
 * set far more often than it empties it.
 */
export function computeCoherenceFieldSet(
	image: DecodedImage,
	coherence: Float64Array,
): Readonly<{ indices: Int32Array; threshold: number; rule: FieldSetRule }> {
	const eligible = image.eligibleIndices
	const sorted = sortByKey(eligible, (index) => coherence[index])
	const threshold = coherence[sorted[quantileIndex(sorted.length, FIELD_DEPTH_QUANTILE)]]

	const strict: number[] = []
	for (let i = 0; i < eligible.length; i += 1) {
		if (coherence[eligible[i]] > threshold) strict.push(eligible[i])
	}
	if (strict.length > 0) {
		return { indices: Int32Array.from(strict), threshold, rule: "coherence-quantile" }
	}
	const inclusive: number[] = []
	for (let i = 0; i < eligible.length; i += 1) {
		if (coherence[eligible[i]] >= threshold) inclusive.push(eligible[i])
	}
	return {
		indices: Int32Array.from(inclusive.length > 0 ? inclusive : Array.from(eligible)),
		threshold,
		rule: "coherence-quantile",
	}
}

/**
 * The **field set F**: the eligible pixels whose depth exceeds the β quantile of depth — except on
 * artwork where that cut carries no information, which 0.3.0 states and handles.
 *
 * Strictly-greater is what §2.3 says. When depth is heavily tied — a poster-flat artwork where most of
 * the image sits at the same distance from the nearest edge — strictly-greater can return the empty set,
 * and an empty field set is not a finding about the artwork, it is an artifact of a tie. So the fallback
 * is the same quantile read inclusively, which is the same rank with the ties kept.
 *
 * ## The degenerate case (0.3.0), stated as a criterion rather than found by symptom
 *
 * `ATTRIBUTION.md` measured F's size drifting by up to **2789.9 %** between a cover and its re-encode.
 * That is not a rank slipping; it is the *population* the ranks are read over being manufactured by
 * noise. It happens on artwork with no field in it: a busy photograph or a heavily textured cover has
 * edges everywhere, so depth is a few pixels everywhere, and "the deepest quarter" is a ranking of which
 * pixels happened to fall furthest from a JPEG-dependent edge map.
 *
 * The measurable criterion is **the β-quantile depth itself, read back in pixels**. Depth is an exact
 * Euclidean distance transform divided by the long edge (`fields.ts`), so multiplying back recovers the
 * transform's own units, and `depth·longEdge ≤ DEGENERATE_DEPTH_FLOOR_PX` at the cut says *the pixel at
 * the β rank is a direct neighbour of an edge*. There is no plateau above the cut because there is
 * nothing above the cut — only which pixels happened not to be adjacent to an edge map that a ±1-LSB
 * dither rewrites.
 *
 * The fallback is **the wider membership rule**: every eligible pixel with any depth at all, i.e. every
 * pixel that is not itself a seed. It is wider by construction, it is a set the perturbation cannot
 * resize by 28× (a dither moves which pixels are edges, not whether four-fifths of the image is
 * non-edge), and it makes no rank decision — which is the point, because the rank decision was the noise.
 *
 * **Reported rather than smoothed:** `threshold` is *not* lowered in the fallback, and `foreground.ts`
 * uses it as the ink band's upper bound. So on a degenerate cover the ink band and F overlap, where
 * normally they are disjoint. That is deliberate — the ink band is a statement about stroke geometry and
 * should not be widened because the field rule changed — but it does mean a pixel can be both a field
 * member and an ink candidate on exactly these covers, which it cannot be anywhere else.
 */
export function computeFieldSet(
	image: DecodedImage,
	depth: DepthField,
): Readonly<{ indices: Int32Array; threshold: number; rule: FieldSetRule }> {
	const eligible = image.eligibleIndices
	const sorted = sortByKey(eligible, (index) => depth.depth[index])
	const threshold = depth.depth[sorted[quantileIndex(sorted.length, FIELD_DEPTH_QUANTILE)]]

	// The degenerate case, tested before the rank is redeemed. See the docstring.
	//
	// The comparison is the pixel rule `threshold · longEdge ≤ d_min` unless the dev-only
	// `P3_DEPTH_FLOOR_MODE=scale-free` asks for the same floor as a fraction of the long edge. With the
	// variable unset `depthFloorModeInUse()` is `"pixels"` and this line is what it was.
	const degenerate = depthFloorModeInUse() === "scale-free"
		? threshold <= DEGENERATE_DEPTH_FLOOR_FRACTION
		: threshold * image.longEdge <= DEGENERATE_DEPTH_FLOOR_PX
	if (degenerate) {
		const wide: number[] = []
		for (let i = 0; i < eligible.length; i += 1) {
			if (depth.depth[eligible[i]] > 0) wide.push(eligible[i])
		}
		if (wide.length > 0) {
			return { indices: Int32Array.from(wide), threshold, rule: "degenerate-depth" }
		}
		// Every eligible pixel is a seed: there is no non-edge pixel anywhere. The whole eligible set is
		// then the only honest population, and §2.3's collapse test decides what it means.
		return { indices: Int32Array.from(eligible), threshold, rule: "degenerate-depth" }
	}

	const strict: number[] = []
	for (let i = 0; i < eligible.length; i += 1) {
		if (depth.depth[eligible[i]] > threshold) strict.push(eligible[i])
	}
	if (strict.length > 0) return { indices: Int32Array.from(strict), threshold, rule: "beta-quantile" }

	const inclusive: number[] = []
	for (let i = 0; i < eligible.length; i += 1) {
		if (depth.depth[eligible[i]] >= threshold) inclusive.push(eligible[i])
	}
	return {
		indices: Int32Array.from(inclusive.length > 0 ? inclusive : Array.from(eligible)),
		threshold,
		rule: "beta-quantile",
	}
}

/**
 * How a band's cascade pixel was arrived at. Scalars and counts only; recorded for attribution.
 */
export type EndBandRecord = Readonly<{
	/** How many pixels the band held before the lump clause. */
	bandSize: number
	/** `null` when the band was one lump. */
	gapRatio: number | null
	/** Masses of the two lumps, `[farther, nearer]` in the band's own extremity sense. */
	lumpMasses: readonly [number, number] | null
	/** Which lump the cascade ran over. */
	chosen: "whole-band" | "dominant-lump" | "farther-lump"
	/** How many pixels the cascade actually ran over. */
	cascadedOver: number
}>

/**
 * **The band-then-cascade end read** (0.3.0). Publishes the cascade pixel of `band`, restricted to one
 * density lump when the band has two.
 *
 * `key` is the band's own ordering scalar and `extremeIsHigh` says which direction along it is *further
 * from the field's middle* — high distance-from-m for e₁, low projection-onto-u for e₂. Every decision
 * below is a comparison of counts or of order statistics of that one scalar.
 */
function bandEndPixel(
	image: DecodedImage,
	band: Int32Array,
	key: (index: number) => number,
	extremeIsHigh: boolean,
): Readonly<{ pixel: number; record: EndBandRecord }> {
	const { lab, rgb } = image
	const split = splitAtLargestDecileGap(band, key, LUMP_GAP_RATIO)
	if (split === null) {
		return {
			pixel: cascadePixel(band, band.length, lab, rgb),
			record: {
				bandSize: band.length,
				gapRatio: null,
				lumpMasses: null,
				chosen: "whole-band",
				cascadedOver: band.length,
			},
		}
	}

	const farther = extremeIsHigh ? split.upper : split.lower
	const nearer = extremeIsHigh ? split.lower : split.upper
	const larger = Math.max(farther.length, nearer.length)
	const massGap = larger === 0 ? 0 : Math.abs(farther.length - nearer.length) / larger
	// Dominant lump by default; the farther lump when the two masses are not far enough apart to be
	// evidence. See `LUMP_MASS_TIE_BAND` for why the tie goes to the farther one and not to a fixed
	// dark/light convention.
	const tied = massGap < LUMP_MASS_TIE_BAND
	const chosen = tied ? farther : (farther.length >= nearer.length ? farther : nearer)
	return {
		pixel: cascadePixel(chosen, chosen.length, lab, rgb),
		record: {
			bandSize: band.length,
			gapRatio: split.gapRatio,
			lumpMasses: [farther.length, nearer.length],
			chosen: tied ? "farther-lump" : "dominant-lump",
			cascadedOver: chosen.length,
		},
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
	/** How e₁'s band was read (0.3.0). `null` on the no-extent path, which selects no band. */
	farBand: EndBandRecord | null
	/** How e₂'s band was read (0.3.0). */
	nearBand: EndBandRecord | null
}>

/**
 * How much of F reads as this end's colour.
 *
 * `weight` is `null` on the shipped path and the answer is a **raw bar count** — the quantity
 * cover-114 refuted. `measurements/substrate/` records the diagnosis: a flat white shirt occupying
 * 6.06 % of F beat the textured red field at 1.45 % *whose median is the field colour*, and the
 * reviewer's verdict was "the background of this artwork is not white, it is red". A count over a
 * bar is a measure of **flatness**, because a textured region scatters its own pixels outside its own
 * median's bar while a flat one does not, and flatness is not the question "which end is the ground".
 *
 * With `P3_SUBSTRATE=prevalence` the weight is the coherence percentile and the answer is **coherence
 * mass within F**: every member still has to clear the same bar, but it contributes how deep inside a
 * homogeneous region it sits rather than one vote. A count is the special case `weight ≡ 1`, so the
 * two branches are one statistic read with two weightings — no new comparison, no new constant.
 */
function prevalenceOf(
	image: DecodedImage,
	fieldSet: Int32Array,
	end: number,
	weight: Float64Array | null,
): number {
	const { lab, bar } = image
	const barOfEnd = bar[end]
	let count = 0
	for (let i = 0; i < fieldSet.length; i += 1) {
		const index = fieldSet[i]
		const pairBar = barOfEnd > bar[index] ? barOfEnd : bar[index]
		if (labDistance(lab, index, end) < pairBar) count += weight === null ? 1 : weight[index]
	}
	return count
}

/**
 * Steps 1–5, with `step` walking both bands down their orderings (§2.7's "step the rank").
 *
 * Each step moves `RANK_STEP_FRACTION` of the field set — small enough that a stepped end is still the
 * same end, large enough not to be swallowed by a run of tied distances. What a step moves at 0.3.0 is
 * the band's far edge; the band's *width* is fixed at τ·`ENDS_BAND_TAU_MULTIPLE`, so a stepped end is
 * still the cascade pixel of a population of the same size.
 */
export function chooseFieldEnds(
	image: DecodedImage,
	fieldSet: Int32Array,
	step: number,
	prevalenceWeight: Float64Array | null = null,
): FieldEnds {
	const { lab, bar, rgb } = image
	const n = fieldSet.length

	const median = cascadePixel(fieldSet, n, lab, rgb)

	// Step 2 — the far end: the cascade pixel of the band of F whose far edge is the (1 − τ) rank of
	// distance from m. One rank at 0.1.0–0.2.0; see the module docstring for the 68/122 that changed it.
	const distanceFromMedian = (index: number): number => labDistance(lab, index, median)
	const byDistance = sortByKey(fieldSet, distanceFromMedian)
	const stepSize = Math.max(1, Math.round(RANK_STEP_FRACTION * n))
	const bandSize = Math.max(1, Math.ceil(ENDS_BAND_TAU_MULTIPLE * TRIM_LEVEL * n))
	const farTop = Math.max(0, quantileIndex(n, 1 - TRIM_LEVEL) - step * stepSize)
	const farBandFrom = Math.max(0, farTop - bandSize + 1)
	const far = bandEndPixel(
		image,
		byDistance.subarray(farBandFrom, farTop + 1),
		distanceFromMedian,
		true,
	)
	const farEnd = far.pixel

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
			farBand: far.record,
			nearBand: null,
		}
	}

	const u: readonly [number, number, number] = [dl / extent, da / extent, db / extent]
	for (let i = 0; i < n; i += 1) {
		const at = fieldSet[i] * 3
		projection[i] = (lab[at] - lab[median * 3]) * u[0] +
			(lab[at + 1] - lab[median * 3 + 1]) * u[1] +
			(lab[at + 2] - lab[median * 3 + 2]) * u[2]
	}

	// Step 4 — the opposite end: the cascade pixel of the band of F whose far edge is the τ rank of the
	// projection. The mirror of step 2, and "farther" here means *lower* projection, since the τ end of
	// this ordering is the one furthest from m in the −u direction.
	const projectionOnU = (index: number): number => {
		const at = index * 3
		return (lab[at] - lab[median * 3]) * u[0] +
			(lab[at + 1] - lab[median * 3 + 1]) * u[1] +
			(lab[at + 2] - lab[median * 3 + 2]) * u[2]
	}
	const byProjection = sortByKey(fieldSet, projectionOnU)
	const nearBottom = Math.min(n - 1, quantileIndex(n, TRIM_LEVEL) + step * stepSize)
	const near = bandEndPixel(
		image,
		byProjection.subarray(nearBottom, Math.min(n, nearBottom + bandSize)),
		projectionOnU,
		false,
	)
	const nearEnd = near.pixel

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
	const farPrevalence = prevalenceOf(image, fieldSet, farEnd, prevalenceWeight)
	const nearPrevalence = prevalenceOf(image, fieldSet, nearEnd, prevalenceWeight)
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
		farBand: far.record,
		nearBand: near.record,
	}
}
