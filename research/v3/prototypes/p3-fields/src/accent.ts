/**
 * Accent — **the artwork's chromatic mark**, chosen by a percentile product of two scalar fields
 * (arm-d §2.6, redesigned at 0.4.0 per `ACCENT_REDESIGN.md`).
 *
 * ## What 0.4.0 deleted, and why
 *
 * 0.1.0–0.3.0 ranked the accent in **two lexicographic tiers**: tier 1 held the pixels that clear the
 * same-colour bar from both field ends *and* move further in lightness than in chroma; tier 2 held the
 * chroma-only departures and was reached only when tier 1 was empty. That is a **tier wall**, and the wall
 * — not the ranking inside it — is the defect: any qualifying lightness-moving pixel, which on album
 * artwork is typically a grey, beats every chromatic mark in the image *by construction*.
 *
 * Seven reviewer counts say the wall inverts the priority the evidence demands, and they are verbatim
 * (`ACCENT_REDESIGN.md` §1): *"very distinct purple … we could use instead (as the accent)"*; *"some pink
 * and blue … missing for a complete palette identity"*; *"magenta color / white text"*; *"missing the
 * significant yellow"*; *"beautiful brown colors (cinnamon, coffee) … would be great accents instead of
 * Holy Crow black"*; *"the accent would be better within the blue family instead of … the same color
 * family as the background and surface"*; *"missing some significant colors to reflect the full artwork's
 * identity"*. A second arm reached the same conclusion from the opposite direction — its reviewer demanded
 * artwork-membership chromatic accents over its own rule's preference (`EVIDENCE_2026-08-04.md` item 10).
 * Two mechanisms, two rule shapes, one reviewer principle.
 *
 * So the tiers are gone. **Chromatic departure from the field's colour family leads**, and
 * `perception-4`'s finding — that at matched distance a lightness-moving accent functions about twice as
 * often — is spent where it was always meant to be spent, as a **direction inside the ordering** rather
 * than as a wall in front of it.
 *
 * ## The ordering: two scalar fields, one weight-free product
 *
 * A pixel **qualifies** by clearing the same-colour bar from *both* field ends, which is the entry
 * condition the tiers already used and is unchanged. Among the qualified, two scalars are computed
 * against **each** field end and the *minimum over the two ends* is taken — an accent that departs from
 * only one end is still inside the field's family:
 *
 * - **chroma relative to the field**: `C(p) − C(e)`, where `C` is the OKLab chroma of a pixel,
 *   `hypot(a, b)`. *How much more colourful than the field this pixel is.*
 * - **hue separation from the field**: `‖(a,b)_p − (a,b)_e‖ − |C(p) − C(e)|`. The chroma-plane distance
 *   with its purely radial part removed: it is **zero exactly when the two pixels sit on the same hue
 *   ray**, grows with the angle between them, and — the property that made this form the right one —
 *   is **well defined and continuous when a field end is neutral**, where it evaluates to zero for every
 *   pixel. A colour with no hue has no family to be separated from, and on a greyscale field the whole
 *   ordering therefore falls to the chroma term rather than to the arbitrary direction of a near-zero
 *   `(a, b)`. The alternative spelling — an angular separation `atan2`-style — is *discontinuous* at a
 *   neutral end, and the accent is already the robustness-worst role; a hue axis that a ±1-LSB dither can
 *   rotate through π is the last thing it needs.
 *
 * The two are combined as the **product of their percentile ranks** over the qualified population — the
 * arm-d′ graft the discipline line sanctions, and the reason it is percentiles and not the raw scalars is
 * that the two have different units and any conversion between them would be a hand weight. There are no
 * hand weights here and no new exchange rates: a percentile is a rank, a product of two ranks is a rank
 * ordering, and neither has a coefficient to tune.
 *
 * ## What is a preference, and what is a wall
 *
 * Exactly one thing is a wall: the same-colour bar from both ends. Everything else **orders**:
 *
 * 1. **The dominant chromatic lump** (`ACCENT_REDESIGN.md` requirement 5). The top-τ band of the
 *    departure ordering is split at its largest adjacent-decile gap in the departure score — the
 *    `e1`/`e2` pattern from `field-roles.ts`, with the same `LUMP_GAP_RATIO` — and the cascade runs over
 *    the **higher-departure** lump whenever that lump is large enough to take a rank of.
 *
 *    **Which lump is "dominant" here is not the mass question it is at the field ends, and getting that
 *    wrong rebuilds the wall one layer down.** `bandEndPixel` takes the *more massive* lump because a
 *    field end is asked to be a populous colour. An accent is asked to be a *mark*, and a mark is small
 *    by nature: measured on cover 168 the band's two lumps were **692 vivid-blue pixels against 18 505
 *    desaturated ones**, so a mass rule elects the desaturated lump every time — which is the tier wall
 *    again, wearing a lump's clothes, because low-departure pixels are always the more numerous. Mass
 *    enters only as the salience floor below, never as the choice.
 * 2. **Headroom** (requirement 7, `EVIDENCE_2026-08-04.md` item 11: the reviewer called pairs clearing a
 *    bar by 1e-4–3e-3 indistinguishable, 6/6 graded low). The lump is restricted to the pixels whose
 *    qualification margin is at or above the **lump's own median margin**. That is an order statistic of
 *    the population, not a new constant, and it makes "never settle at the bar's edge when a
 *    higher-margin candidate qualifies" structural: every narrowing below it operates on a population
 *    that is already the high-margin half.
 * 3. **min-ramp |raw APCA|** (requirement 3, r2-item-8: a swap-demoted ex-foreground was *"very hard to
 *    see"* as an accent). Among what is left, the pixels clearing the contract's accent floor over the
 *    published ramp are preferred — and if *none* of them clears it, the whole population is still the
 *    answer. This is the ink amendment's pattern exactly (`foreground.ts`, `refineInkWindow` clause 2)
 *    and for the same reason: identity is not traded away for a floor.
 * 4. **Lightness movement** (requirement 2). Among what is left, the pixels that move further in
 *    lightness than in the chroma plane — 0.3.0's tier-1 predicate, demoted from wall to preference —
 *    are preferred, and if none does, the whole population is still the answer. `perception-4`'s
 *    direction, spent as a direction.
 *
 * None of the four can empty the population, so none of them can evict the accent; **collapse is reached
 * exactly where it always was**, when the qualified set is empty or nothing in it survives verification
 * (`pipeline.ts`'s `searchAccent`), and it collapses to exactly the foreground.
 *
 * ## The salience guard (requirement 4)
 *
 * `EVIDENCE_2026-08-04.md` item 6: presence is not eligibility, and a colour that occurs only as an
 * accidental shadow is ineligible for an identity role. Two pieces of **existing** machinery discharge
 * this, and no new detector is added:
 *
 * - the lump must hold at least `ceil(1/τ)` pixels — `luminanceOrdering`'s own "worth taking a rank of"
 *   rule, applied to the lump split; a lump too small to hold a quantile is refused and the whole band is
 *   the population instead;
 * - the chosen pixel is put through `verifyColor`'s **support and spatial spread** in `pipeline.ts`,
 *   exactly as before — spread is the measure that a one-blob shadow fails.
 *
 * **Stated rather than smoothed:** support-and-spread is a *weak* shadow test, and `SPATIAL_SPREAD_FLOOR`
 * is `[UNCALIBRATED]` and deliberately permissive. What actually carries most of this guard is the
 * ordering itself — an accidental shadow is dark and low-chroma, and the chroma term demotes it — which
 * is an argument, not a measurement. If a round-4 note reads *"that colour is just a shadow"*, this
 * paragraph is what failed.
 *
 * ## What the redesign measured, including the part that did not land
 *
 * Re-run over the seven identity-coverage covers, **the ordering now puts the reviewer's named mark at
 * or near rank 0 on five of them** — r2-item-4's purple tops its ordering at departure 0.9966, 039's
 * magenta at 0.9997, 130's cinnamon-red at 0.9629, 188's coral at 0.9953, r2-item-2's red-pink at
 * 0.9704. The tier wall is gone and the ordering is answering the question the reviewer asked.
 *
 * **What keeps four of them out of the palette is `SOURCE_POPULATION_FLOOR`, not the ordering.** The
 * rank-0 band's cascade pixel is refused by `verifyColor`'s support test at 0.025 % (r2-item-4's
 * purple), 0.002 % (208), 0.060 % (130) and 0.025 % (188) of the artwork, against a floor of 0.1 %. A
 * purple subtitle line is genuinely smaller than one pixel in a thousand. That floor is the contract's,
 * consumed here as a selection predicate (`verify.ts`), it is not this redesign's to move, and it is
 * now the binding constraint on identity coverage — which is a **finding for the substrate work**, not
 * a defect of the ordering. The same mechanism is why accent collapse rose from 19/220 to 47/220 on the
 * coverage set: on 15 of 25 collapsed covers examined, the rank-0 refusal is `support`.
 *
 * **One reviewer count pulls against another, and the hue term is where.** 168 asks for an accent in a
 * *different colour family* from the field; 208 asks for the artwork's yellow, on a cover whose
 * background is a warm beige of nearly the same hue. The hue-separation factor answers the first by
 * demoting exactly what the second asks for — 208's ordering tops out on a dark red at 0.8212 and the
 * yellow is nowhere near it. Both are verbatim reviewer verdicts, neither is wrong, and this file
 * settles the conflict in 168's favour because 168's is the count that names the *rule*. Round 4 is
 * where that gets adjudicated; nothing here should be read as having settled it.
 *
 * ## The line holds
 *
 * Every quantity above is a **number attached to a pixel** or a difference of two pixels' coordinates:
 * chroma is `hypot(a, b)` of one pixel, the hue separation is built from `(a, b)` differences of two
 * actual pixels, the margin is a distance minus a bar. Percentile ranks are order statistics of scalar
 * fields. No colour family is ever materialised as a colour, no average is taken, and the published
 * accent is the cascade pixel of an actual sub-population of the artwork.
 */

import type { Rgb8 } from "../../../src/contract/types.ts"
import { LUMP_GAP_RATIO, TRIM_LEVEL } from "./constants.ts"
import type { DecodedImage } from "./decode.ts"
import { minRampContrast } from "./foreground.ts"
import {
	cascadePixel,
	labDistance,
	medianOfKey,
	percentileRanks,
	sortByKey,
	splitAtLargestDecileGap,
	topWindow,
} from "./primitives.ts"

/**
 * The accent's ranking preference: the published ramp and the contract's accent floor.
 *
 * The same shape as `InkContrastPreference` and consumed the same way — as an ordering pressure that can
 * narrow a population and never empty it.
 */
export type AccentContrastPreference = Readonly<{ anchorRgb: readonly Rgb8[]; floor: number }>

/**
 * The three scalar fields the accent is chosen by, as **planes indexed by pixel index** rather than as
 * maps keyed by one.
 *
 * Stated because it was measured, not chosen on taste: the qualified population is most of the artwork
 * on most covers, so a `Map<pixel, number>` here holds hundreds of thousands of boxed entries — and on
 * the robustness harness's large rendition-pair renditions, three of them thrashed the heap badly enough
 * that a 150-trial smoke stopped converging. A `Float64Array` over the image is the same numbers in
 * contiguous memory. Nothing about the arithmetic or the ordering changes, and byte-identical demo-20
 * output was checked rather than assumed.
 *
 * Non-qualified pixels hold `NaN`, which no comparison in this file admits — the ordering only ever
 * reads indices that came out of `sorted`.
 */
export type AccentOrdering = Readonly<{
	/**
	 * The qualified pixels, **ascending by the chromatic-departure percentile product**. `topWindow` takes
	 * the top of an ascending ordering, so rank 0 is the most chromatically departed band.
	 */
	sorted: Int32Array
	/** The departure product, by pixel index. The band's own lump-split scalar. */
	departure: Float64Array
	/** `min over ends (distance − pair bar)`, by pixel index. Qualification is `≥ 0`. */
	margin: Float64Array
	/** `|ΔL| − ‖Δ(a,b)‖` from the nearer field end, by pixel index. Positive is lightness-moving. */
	lightnessMove: Float64Array
	/** How many pixels cleared the bar from both ends. */
	qualified: number
}>

/** OKLab chroma of one pixel — `hypot(a, b)`, a number attached to a pixel. */
function chromaOf(lab: Float64Array, pixel: number): number {
	const at = pixel * 3
	return Math.hypot(lab[at + 1], lab[at + 2])
}

/**
 * Build the accent ordering. One pass to qualify and measure, then two rank sorts for the percentiles.
 *
 * The eligible set for this role is **all N pixels**, as it is for every role — there is no candidacy
 * wall anywhere in this design, so a colour the reviewer would have chosen cannot be structurally
 * unpublishable; it can only be badly ranked.
 */
export function computeAccentOrdering(
	image: DecodedImage,
	background: number,
	surface: number,
): AccentOrdering {
	const { lab, bar, eligibleIndices } = image

	const qualified: number[] = []
	const chromaDepartureOf: number[] = []
	const hueSeparationOf: number[] = []
	const marginOf: number[] = []
	const lightnessMoveOf: number[] = []

	const chromaBackground = chromaOf(lab, background)
	const chromaSurface = chromaOf(lab, surface)
	const backgroundAt = background * 3
	const surfaceAt = surface * 3

	for (let i = 0; i < eligibleIndices.length; i += 1) {
		const index = eligibleIndices[i]

		// The one wall: the same-colour bar from *both* ends. `margin` is how far past it the pixel is,
		// which is the quantity requirement 7 says must rank rather than merely qualify.
		const toBackground = labDistance(lab, index, background)
		const backgroundBar = bar[index] > bar[background] ? bar[index] : bar[background]
		const backgroundMargin = toBackground - backgroundBar
		if (backgroundMargin < 0) continue

		const toSurface = labDistance(lab, index, surface)
		const surfaceBar = bar[index] > bar[surface] ? bar[index] : bar[surface]
		const surfaceMargin = toSurface - surfaceBar
		if (surfaceMargin < 0) continue

		const at = index * 3
		const chroma = chromaOf(lab, index)

		// Against each end: the radial part (chroma relative to the field) and what is left of the
		// chroma-plane displacement once the radial part is removed (hue separation). The second is
		// non-negative by the triangle inequality and is zero exactly on a shared hue ray.
		const backgroundPlane = Math.hypot(lab[at + 1] - lab[backgroundAt + 1], lab[at + 2] - lab[backgroundAt + 2])
		const surfacePlane = Math.hypot(lab[at + 1] - lab[surfaceAt + 1], lab[at + 2] - lab[surfaceAt + 2])
		const backgroundChroma = chroma - chromaBackground
		const surfaceChroma = chroma - chromaSurface
		const backgroundHue = backgroundPlane - Math.abs(backgroundChroma)
		const surfaceHue = surfacePlane - Math.abs(surfaceChroma)

		// The nearer end, for the lightness-movement preference — the same end 0.1.0–0.3.0's tier test
		// measured against, so the predicate is unchanged and only its standing has moved.
		const nearerAt = (toBackground <= toSurface ? background : surface) * 3
		const nearerPlane = toBackground <= toSurface ? backgroundPlane : surfacePlane

		qualified.push(index)
		chromaDepartureOf.push(backgroundChroma < surfaceChroma ? backgroundChroma : surfaceChroma)
		hueSeparationOf.push(backgroundHue < surfaceHue ? backgroundHue : surfaceHue)
		marginOf.push(backgroundMargin < surfaceMargin ? backgroundMargin : surfaceMargin)
		lightnessMoveOf.push(Math.abs(lab[at] - lab[nearerAt]) - nearerPlane)
	}

	const pixels = lab.length / 3
	const departure = new Float64Array(pixels).fill(Number.NaN)
	const margin = new Float64Array(pixels).fill(Number.NaN)
	const lightnessMove = new Float64Array(pixels).fill(Number.NaN)
	if (qualified.length === 0) {
		return { sorted: new Int32Array(0), departure, margin, lightnessMove, qualified: 0 }
	}

	// The percentile product. Weight-free by construction: each factor is a rank in [0, 1] and the
	// combination is a product of ranks, so there is no unit conversion and nothing to tune.
	const chromaPercentile = percentileRanks(Float64Array.from(chromaDepartureOf))
	const huePercentile = percentileRanks(Float64Array.from(hueSeparationOf))
	for (let i = 0; i < qualified.length; i += 1) {
		departure[qualified[i]] = chromaPercentile[i] * huePercentile[i]
		margin[qualified[i]] = marginOf[i]
		lightnessMove[qualified[i]] = lightnessMoveOf[i]
	}

	// Sorted once, here, rather than at each step of the verify-and-step loop: stepping a rank moves
	// where the cut is and must never be able to move what the order is.
	const rank = (index: number): number => departure[index]
	return {
		sorted: sortByKey(Int32Array.from(qualified), rank),
		departure,
		margin,
		lightnessMove,
		qualified: qualified.length,
	}
}

/** What the four narrowings did to one top-τ band. Counts and scalars only. */
export type AccentRefinement = Readonly<{
	/** The top-τ band's size, before any narrowing. */
	bandSize: number
	/** `null` when the band was one lump, or when the split was refused as unrankable. */
	gapRatio: number | null
	/** Masses of the two lumps, `[higher-departure, lower-departure]`. */
	lumpMasses: readonly [number, number] | null
	chosen: "whole-band" | "higher-departure-lump" | "lower-departure-lump" | "lump-unrankable"
	/** How many pixels survived the headroom clause. */
	headroomSize: number
	/** The lump's median qualification margin — the level the headroom clause cut at. */
	medianMargin: number
	/** How many of the headroom population cleared the accent floor over the ramp. */
	legibleSize: number
	contrastPreferenceApplied: boolean
	/** How many of what was left move further in lightness than in chroma. */
	lightnessMovingSize: number
	lightnessPreferenceApplied: boolean
	/** How many pixels the cascade actually ran over. */
	cascadedOver: number
	/** The published pixel's own qualification margin — requirement 7's audit number. */
	publishedMargin: number
	/** The published pixel's departure product. */
	publishedDeparture: number
}>

export type AccentChoice = Readonly<{
	pixel: number
	populationSize: number
	refinement: AccentRefinement
}>

/**
 * Redeem one rank of the accent ordering: the top-τ band, narrowed by the four preferences, cascaded.
 *
 * See the module docstring for the order of the narrowings and the evidence behind each. Every one of
 * them is a subset filter that never returns the empty set, so this function returns `null` only when
 * there is no band to take at all.
 */
export function chooseAccent(
	image: DecodedImage,
	ordering: AccentOrdering,
	step: number,
	preference: AccentContrastPreference,
): AccentChoice | null {
	const band = topWindow(ordering.sorted, TRIM_LEVEL, step)
	if (band.length === 0) return null

	const departureOf = (index: number): number => ordering.departure[index]
	const marginKey = (index: number): number => ordering.margin[index]

	// 1. The dominant chromatic lump — the `e1`/`e2` pattern, on the departure score, with the higher
	//    departure winning rather than the greater mass. See the module docstring for why mass is the
	//    wrong question here and what it measured on cover 168.
	const split = splitAtLargestDecileGap(band, departureOf, LUMP_GAP_RATIO)
	// The salience guard's first half: a lump too small to hold a quantile is not a coherent mark, it is
	// a handful of pixels. `ceil(1/τ)` is `luminanceOrdering`'s own rankability rule, not a new constant.
	const rankable = Math.ceil(1 / TRIM_LEVEL)
	let population: Int32Array = band
	let chosen: AccentRefinement["chosen"] = "whole-band"
	let lumpMasses: readonly [number, number] | null = null
	let gapRatio: number | null = null
	if (split !== null) {
		const higher = split.upper
		const lower = split.lower
		lumpMasses = [higher.length, lower.length]
		gapRatio = split.gapRatio
		if (higher.length >= rankable) {
			population = higher
			chosen = "higher-departure-lump"
		} else if (lower.length >= rankable) {
			// The chromatic lump is a handful of pixels — a specular highlight or a compression artifact,
			// not a mark. Fall to the other lump rather than publish it; `verifyColor`'s support and spread
			// in `pipeline.ts` is the second half of the same guard.
			population = lower
			chosen = "lower-departure-lump"
		} else {
			chosen = "lump-unrankable"
		}
	}

	// 2. Headroom. The lump's own median margin, which is an order statistic of the population and not a
	//    constant: whatever else narrows below, the published accent's margin is in the upper half of the
	//    lump's. Non-empty by construction — the lower median is a value some pixel attains.
	const medianMargin = medianOfKey(population, marginKey)
	const headroomList: number[] = []
	for (let i = 0; i < population.length; i += 1) {
		if (marginKey(population[i]) >= medianMargin) headroomList.push(population[i])
	}
	if (headroomList.length > 0) population = Int32Array.from(headroomList)
	const headroomSize = population.length

	// 3. min-ramp |raw APCA|, as a preference inside the population and never as an eviction from it.
	const legibleList: number[] = []
	for (let i = 0; i < population.length; i += 1) {
		if (minRampContrast(image, population[i], preference.anchorRgb) >= preference.floor) {
			legibleList.push(population[i])
		}
	}
	const contrastPreferenceApplied = legibleList.length > 0 && legibleList.length < population.length
	if (contrastPreferenceApplied) population = Int32Array.from(legibleList)

	// 4. Lightness movement, the old tier-1 predicate as a preference. Same shape, same guarantee.
	const movingList: number[] = []
	for (let i = 0; i < population.length; i += 1) {
		if (ordering.lightnessMove[population[i]] > 0) movingList.push(population[i])
	}
	const lightnessPreferenceApplied = movingList.length > 0 && movingList.length < population.length
	if (lightnessPreferenceApplied) population = Int32Array.from(movingList)

	const pixel = cascadePixel(population, population.length, image.lab, image.rgb)
	return {
		pixel,
		populationSize: population.length,
		refinement: {
			bandSize: band.length,
			gapRatio,
			lumpMasses,
			chosen,
			headroomSize,
			medianMargin,
			legibleSize: legibleList.length,
			contrastPreferenceApplied,
			lightnessMovingSize: movingList.length,
			lightnessPreferenceApplied,
			cascadedOver: population.length,
			publishedMargin: pixel < 0 ? Number.NaN : ordering.margin[pixel],
			publishedDeparture: pixel < 0 ? Number.NaN : ordering.departure[pixel],
		},
	}
}
