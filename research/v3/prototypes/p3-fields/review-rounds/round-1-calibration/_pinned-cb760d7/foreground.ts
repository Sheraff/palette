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
 * the top-τ sub-population of a **luminance ordering**, restricted to pixels with non-trivial depth —
 * *"the artwork's most text-like tone"*, not *"the single darkest pixel"*, which would be a JPEG
 * artifact. Note what is absent: no colour rescue at any distance, per the 2026-08-04 ruling that text
 * is luminance-driven.
 *
 * ## 0.2.0 — what the luminance ordering ranks, and why it changed
 *
 * §2.5 says the ordering is **|raw APCA| against the background**. That quantity is *bimodal* on exactly
 * the artwork that broke the 0.1.0 baseline: on a near-neutral high-contrast cover the background is one
 * lightness extreme, and both the other extreme *and* every mid-tone that happens to be far from the
 * background alone score highly. A pixel far from ONE end of the field but sitting on top of the other
 * end wins a rank it should not, and which end the ordering favours flips under a ±1-LSB dither. W4
 * measured the consequence: 114 of 491 disagreements moved all four roles at once, 68 of the large
 * role-moves were grey→grey, and the foreground was the worst-moving role in 179 of them.
 *
 * So the ranking quantity is now **the minimum |raw APCA| over the whole field ramp** — the background,
 * the surface, and the guide stops between them. This is the contract's own foreground-versus-field
 * metric (invariant 4 minimises exactly this over the rendered ramp), and it is unimodal by
 * construction: a pixel scores well only if it is far from *everything* the field publishes. It also
 * fixes a scorecard failure the 0.1.0 ordering could not see, where the published foreground cleared
 * the floor against the background and failed it against the surface.
 *
 * **The one deviation from the brief, reported rather than smoothed.** The instruction was to minimise
 * over the rendered ramp *including its interpolated points*. Those points are OKLab lerps between two
 * published pixels — synthesized colours, which README's ban list names explicitly. `LINE_AUDIT.md`
 * ruling (a) admitted the *one* interpolated point in 0.1.0 (the excursion chord) on three findings, the
 * load-bearing one being that it was removable: the excursion is identically a norm over pixel-to-pixel
 * difference vectors, and 0.2.0 now writes it that way. That removability test **fails here**: APCA is
 * not a norm of a difference, so `|apcaRaw(p, lerp(A, B, u))|` cannot be rewritten over differences of
 * actual pixels, and consuming it would put a genuinely created colour into the *selection* path — the
 * one place arm-d and this prototype's README both refuse it. (The contract's whole-ramp minimum is
 * still enforced on the result: `validatePalette` computes it, and a foreground that fails it steps the
 * rank. Interpolated colours therefore remain a **verification** quantity here, which is where the
 * contract puts them, and never a selection one.)
 *
 * The measured consequence of the deviation is stated plainly: the ordering's score is the minimum over
 * the ramp's **stop pixels**, which is an *upper bound* on the contract's minimum over the rendered
 * continuum. A foreground invisible strictly between two stops — possible only when a gradient
 * publishes and the foreground's luminance falls between two stops' — is not demoted by the ordering. It
 * is still caught, one layer later, by validation.
 *
 * ## The polarity tie, and the cascade that breaks it
 *
 * A unimodal *score* is not yet a stable *answer*. The published colour is the cascade pixel of the
 * top-τ window, and a cascade pixel is a median of L: when that window straddles two lightness modes,
 * the median lands in whichever mode holds more pixels, and on a balanced cover that count is the
 * coin-flip all over again — one layer down from where it was at 0.1.0.
 *
 * So the population is cut into three **lightness bands** by the ramp's own extremes — `below` the
 * darkest stop's OKLab L, `above` the lightest stop's, and `between` them — and one band is chosen
 * before any rank is redeemed. Three and not two, because which band holds the answer depends on the
 * artwork and both cases are real:
 *
 * - a **bimodal black-and-white cover** puts the ramp's ends at the two lightness extremes, so nothing
 *   outside them is far from the whole ramp and the honest foreground is a mid-tone: `between` wins,
 *   and wins by a mile;
 * - a **flat mid-grey field** has both ends in the middle, so `between` is empty and the two extremes
 *   are equally good answers: `below` and `above` tie, and that is the tie the convention settles.
 *
 * The choice is a stated three-step cascade, each step a quantity further from a tie than the last:
 *
 * 1. A band with no population worth taking a rank of is out (fewer than 1/τ pixels: its top-τ window
 *    would not hold a quantile). If that leaves one band it wins; if it leaves none, the ordering is
 *    the unsplit population and no band decision is made at all.
 * 2. Otherwise the band whose top-τ population has the **larger trimmed contrast at the τ-quantile**
 *    wins. That is an order statistic of a large population, which is the class of quantity this whole
 *    mechanism claims is stable — and on the covers that flipped it is far from a tie.
 * 3. Only when two bands' trimmed contrasts sit within `FOREGROUND_POLARITY_TIE_BAND` of each other is
 *    the case declared tied, and then a **fixed convention** decides: prefer the **darker** band.
 *
 * Step 3 is a convention and is defended as one, not as a measurement. It matches `field-roles.ts`'s
 * darker-end background convention on purpose, so the two cannot pull a palette in opposite directions,
 * and it is stable by construction — it consults nothing a dither can move.
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

import { apcaRaw } from "../../../../../src/contract/color.ts"
import { SOURCE_POPULATION_FLOOR } from "../../../../../src/contract/constants.ts"
import {
	FOREGROUND_POLARITY_TIE_BAND,
	INK_ANNULUS_MIN_RADIUS_PX,
	INK_ANNULUS_MIN_SAMPLES,
	INK_ANNULUS_RATIO,
	INK_ANNULUS_SAMPLES,
	INK_REGIME_SUPPORT_MARGIN,
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
	/** The ordering's polarity record, carried through for the exposed intermediates. */
	polarity: ForegroundPolarity | null
}>

/**
 * An ordering, computed once and redeemed at as many ranks as the verify-and-step loop asks for.
 *
 * Splitting "what the order is" from "where we cut" is not only a performance matter, though it is that
 * too — re-sorting per step would cost seconds per image. It is also arm-d's own claim made structural:
 * *tuning moves where we cut, never what the order is*. A stepped rank cannot silently re-rank.
 */
export type ForegroundOrdering = Readonly<{
	regime: "ink" | "luminance"
	sorted: Int32Array
	/**
	 * Which contrast polarity the luminance regime selected, and how the cascade got there. `null` for
	 * the ink regime, which has no polarity question. Recorded for the exposed intermediates: δ_fg's
	 * anchor plan is a sweep, and a sweep needs to see which step of the cascade decided each cover.
	 */
	polarity: ForegroundPolarity | null
}>

/** The three lightness bands the ramp's own extremes cut the population into. Ordered dark → light. */
export const FOREGROUND_BANDS = ["below", "between", "above"] as const
export type ForegroundBand = (typeof FOREGROUND_BANDS)[number]

export type ForegroundPolarity = Readonly<{
	band: ForegroundBand | "unsplit"
	/** Trimmed contrast at the τ-quantile of each band's population; −1 where the band was not rankable. */
	trimmed: Readonly<Record<ForegroundBand, number>>
	/** Which step of the three-step cascade decided it. */
	decidedBy: "only-population" | "trimmed-contrast" | "darker-convention"
}>

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
	return {
		regime: "ink",
		sorted: sortByKey(ink.candidates, (index) => scoreOf.get(index) as number),
		polarity: null,
	}
}

/**
 * Does an ink population clear source-support verification **by the stability margin** (0.2.0)?
 *
 * arm-d §3(4) calls the regime test *"a decision wearing a predicate's clothes"*, and it is: passing or
 * failing this one predicate decides whether the foreground comes out of the ink ordering or out of an
 * entirely different luminance ordering. At 0.1.0 the boundary was `support ≥ SOURCE_POPULATION_FLOOR`,
 * which a single pixel can cross — so a ±1-LSB dither could swap the regime and, with it, the published
 * colour. The margin makes the ink regime win only when it wins clearly; a population sitting on the
 * floor is *not* evidence that the artwork has ink, and the luminance regime is the honest answer there.
 *
 * Asymmetric on purpose: the margin gates only the ink regime, never the luminance one. The luminance
 * ordering is the fallback and needs no margin to be reached — that is what makes this a stability
 * guard rather than a second threshold with its own boundary to flip on.
 */
export function clearsInkRegimeMargin(support: number): boolean {
	return support >= SOURCE_POPULATION_FLOOR * (1 + INK_REGIME_SUPPORT_MARGIN)
}

/**
 * The second regime's ordering (0.2.0): **the minimum |raw APCA| over the whole field ramp**, ascending,
 * over pixels with non-trivial depth, restricted to one lightness band.
 *
 * `rampAnchors` is the published field ramp as pixel indices — background, any guide stops, surface, in
 * ramp order. See the module docstring for what this ranks, why it replaced "|raw APCA| against the
 * background", the one declared deviation from a full rendered-ramp minimum, and the three-step band
 * cascade.
 *
 * The depth restriction is the whole difference between this and "the darkest pixel": a single ringing
 * artifact on a JPEG edge has depth 0 and is not eligible here.
 */
export function luminanceOrdering(
	image: DecodedImage,
	depth: Float64Array,
	rampAnchors: readonly number[],
): ForegroundOrdering | null {
	// The anchors are pixels of the artwork, deduplicated: a collapsed field publishes the same pixel as
	// both ends, and a duplicated anchor would count twice in nothing but wasted work.
	const anchors: number[] = []
	for (const anchor of rampAnchors) {
		if (anchor >= 0 && !anchors.includes(anchor)) anchors.push(anchor)
	}
	if (anchors.length === 0) return null
	const anchorRgb = anchors.map((anchor) => pixelRgb(image, anchor))

	const deep: number[] = []
	for (let i = 0; i < image.eligibleIndices.length; i += 1) {
		const index = image.eligibleIndices[i]
		if (depth[index] > 0) deep.push(index)
	}
	// A pathological image whose every pixel is an edge has no depth anywhere; the whole eligible set is
	// then the honest population, because "restricted to pixels with non-trivial depth" cannot restrict.
	const population = deep.length > 0 ? deep : Array.from(image.eligibleIndices)
	if (population.length === 0) return null

	// The ranking quantity: how far this pixel is from the *nearest* thing the field publishes.
	const scoreOf = (index: number): number => {
		const rgb = pixelRgb(image, index)
		let smallest = Number.POSITIVE_INFINITY
		for (const anchor of anchorRgb) {
			const magnitude = Math.abs(apcaRaw(rgb, anchor))
			if (magnitude < smallest) smallest = magnitude
		}
		return smallest
	}

	// The lightness bands, cut by the ramp's own extremes — two actual pixels, so membership is a
	// comparison of a pixel to a pixel like every other comparison in the file.
	let darkestAnchorL = Number.POSITIVE_INFINITY
	let lightestAnchorL = Number.NEGATIVE_INFINITY
	for (const anchor of anchors) {
		const l = image.lab[anchor * 3]
		if (l < darkestAnchorL) darkestAnchorL = l
		if (l > lightestAnchorL) lightestAnchorL = l
	}
	const members: Record<ForegroundBand, number[]> = { below: [], between: [], above: [] }
	for (const index of population) {
		const l = image.lab[index * 3]
		if (l <= darkestAnchorL) members.below.push(index)
		else if (l >= lightestAnchorL) members.above.push(index)
		else members.between.push(index)
	}

	const orderingOf = (band: number[]): Int32Array => sortByKey(Int32Array.from(band), scoreOf)

	// The trimmed contrast at the τ-quantile: the *smallest* score inside the top-τ window, i.e. the
	// score at the (1 − τ) quantile of the band's own distribution. Read off `topWindow` itself rather
	// than re-derived, so the quantity compared here and the population `chooseForeground` redeems are
	// the same object by construction.
	const trimmedContrast = (sorted: Int32Array): number => {
		const window = topWindow(sorted, TRIM_LEVEL, 0)
		return window.length === 0 ? -1 : scoreOf(window[0])
	}

	// Step 1. "Worth taking a rank of" is derived from τ and is not an independent constant: a population
	// smaller than 1/τ has a top-τ window of one pixel, and a rank statistic over one pixel is the
	// single-extremum answer §2.5 exists to avoid.
	const rankable = Math.ceil(1 / TRIM_LEVEL)
	const trimmed: Record<ForegroundBand, number> = { below: -1, between: -1, above: -1 }
	const sortedOf: Partial<Record<ForegroundBand, Int32Array>> = {}
	for (const band of FOREGROUND_BANDS) {
		if (members[band].length < rankable) continue
		const sorted = orderingOf(members[band])
		sortedOf[band] = sorted
		trimmed[band] = trimmedContrast(sorted)
	}
	const usable = FOREGROUND_BANDS.filter((band) => sortedOf[band] !== undefined)

	if (usable.length === 0) {
		// No band is a population of its own; rank the whole thing and make no polarity decision. This is
		// the 0.1.0 shape, reached only where the polarity question has no answer to give.
		return {
			regime: "luminance",
			sorted: orderingOf(population),
			polarity: { band: "unsplit", trimmed, decidedBy: "only-population" },
		}
	}
	if (usable.length === 1) {
		return {
			regime: "luminance",
			sorted: sortedOf[usable[0]] as Int32Array,
			polarity: { band: usable[0], trimmed, decidedBy: "only-population" },
		}
	}

	// Steps 2 and 3. The best trimmed contrast wins; every band within δ_fg of it is declared tied with
	// it, and among those the **darkest** band wins — `FOREGROUND_BANDS` is in dark-to-light order, so
	// "prefer the darker foreground" is `find`, not a comparison.
	const best = usable.reduce((left, right) => (trimmed[right] > trimmed[left] ? right : left))
	const tied = usable.filter((band) => trimmed[best] - trimmed[band] < FOREGROUND_POLARITY_TIE_BAND)
	const band = tied[0]
	return {
		regime: "luminance",
		sorted: sortedOf[band] as Int32Array,
		polarity: { band, trimmed, decidedBy: band === best && tied.length === 1 ? "trimmed-contrast" : "darker-convention" },
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
		polarity: ordering.polarity,
	}
}
