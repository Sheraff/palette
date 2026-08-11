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
 *
 *    **0.4.1 puts a declared tie band on that election** (requirement 5's other half, and the W15
 *    audit's correction 3). "Higher departure wins" is a comparison between two lumps, and at 0.4.0 it
 *    was allowed to decide at *any* separation, in the role the attribution block measures as the
 *    least stable in the pipeline. When the lumps' departure separation sits inside
 *    `ACCENT_LUMP_DEPARTURE_TIE_BAND` of the split threshold, the separation is declared to carry no
 *    information and a **stated convention** decides instead: the lump with the higher **median OKLab
 *    chroma**. See the constant for why that convention and not another.
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
 * 4. **The high-chroma band** (0.4.2, round 5's shade nuance). See the next section.
 * 5. **Lightness movement** (requirement 2). Among what is left, the pixels that move further in
 *    lightness than in the chroma plane — 0.3.0's tier-1 predicate, demoted from wall to preference —
 *    are preferred, and if none does, the whole population is still the answer. `perception-4`'s
 *    direction, spent as a direction. **0.4.2 moves it behind the chroma band**, which is where
 *    requirement 2's own wording puts it; the next section says what that measured.
 *
 * ## 0.4.2 — where *in* the lump the cascade lands
 *
 * Round 5 graded the purple mark **acceptable** and named one thing: *"the accent is darker than the
 * real purple"* (`review-rounds/round-5-calibration/VERDICTS.md`). That is not a complaint about the
 * ordering — the ordering elected the right lump, and the round's own decode says so ("a within-lump
 * refinement note, not a mechanism complaint"). It is a complaint about **the cascade pixel of a lump
 * that spans a shade range**: the cascade is an iterated *median*, so on r2-item-4's cover it landed at
 * `#421b50` (chroma 0.0995) while the same lump's high-chroma end holds `#5b199f` (chroma 0.1937) — the
 * purple the artwork actually shows. A median of a range is the range's middle, and the middle of a
 * chromatic lump is its dark, desaturated tail as often as not. **0.4.2 publishes `#5d1988` there,
 * chroma 0.1714.**
 *
 * So a narrowing is inserted, in the shape this codebase already sanctions for "which part of a
 * population is the answer" — **band-then-cascade**, the same primitive pair the field ends and the ink
 * lump use: sort what is left by OKLab chroma, take the **top-τ band**, cascade over that. The band is
 * τ-relative, so it is not a new number; the cascade still runs over a population and still publishes an
 * exact pixel.
 *
 * **Two gates, and they are what keep this from being a regression.** A τ-band of a *small* population
 * is one pixel, and a chroma ordering inside a *neutral* population ranks the low bits of two channels.
 * So the band fires only when it still holds `ceil(1/τ)` pixels (**gate 1**, and the reason 130's
 * cinnamon mark, whose population is 16 pixels, is left alone) and only when **the band's own** median
 * chroma clears the contract's `REGION_CHROMA_BOUNDARY` (**gate 2**, and the reason r2-item-1's
 * near-black accent population is left alone). Where either gate refuses, 0.4.1's answer stands byte for
 * byte: on coverage-220 the band fires on **103 of 220**, is refused as unrankable on 80 and as neutral
 * on 16, and where it fires the published accent's chroma rises on **96 of 103** (mean +0.0758).
 *
 * **Gate 2 is on the band, not on the population, and that is a correction made by measurement** — see
 * the comment at the site. Gating on the *population's* median chroma did not fire on the one cover the
 * note is about, because the low half of that population is the dark tail being complained about.
 *
 * **The band also had to go ahead of the lightness-movement preference, and that is the larger half of
 * the fix.** Placed after it, r2-item-4 published `#3c134d` — *darker* than what the note complained
 * about, chroma up only 0.0995 → 0.1061 — because that preference had already deleted every vivid purple
 * from the population before the band could rank it. The reason is arithmetic and general, not
 * particular to that cover: `lightnessMove` is `|ΔL| − ‖Δ(a,b)‖`, so against a **neutral** field end a
 * pixel scores positive only by being less colourful than it is lighter or darker. As the last word that
 * is a chroma **wall** on every greyscale-field cover — requirement 2's tier wall rebuilt one layer down,
 * which is precisely what 0.4.0 deleted. Behind the band it is what requirement 2 says it is.
 *
 * **Stated rather than smoothed.** This is the only one of the five narrowings that is *not* a subset
 * filter on a predicate — it is a rank cut, and a rank cut is the shape requirement 7's refuted margin
 * band also had. The two are not the same move (that one re-ordered the whole population by margin and
 * let neutrals outrank the mark; this one re-orders *within a population the chromatic ordering has
 * already elected*, on the axis the reviewer's note names) but the family is the same, and the honest
 * statement is that its evidence is **one reviewer note**, not a round. If a later round says the accent
 * is now too vivid for the artwork, this paragraph is what failed.
 *
 * **A different fifth narrowing was drafted at 0.4.1 and refuted by measurement** — a top-τ margin *band*
 * between narrowings 3 and 4, reading requirement 7's "margins rank" as an ordering step. It moved
 * 138/220 coverage accents, destroyed both headline marks (r2-item-4's `#421b50`, 130's `#97191a`) by
 * letting high-margin neutrals outrank the chromatic mark, and left 2–11-pixel cascade populations.
 * Requirement 7 is discharged by step 2's **filter** and the twin-collapse watch; see the amendment in
 * `ACCENT_REDESIGN.md`.
 *
 * None of the five can empty the population, so none of them can evict the accent; **collapse is reached
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
 * **0.4.0 claimed all four were kept out by `SOURCE_POPULATION_FLOOR` rather than by the ordering.
 * Measured, that claim is right about two of them and wrong about the other two** — `SUBSTRATE.md` §5
 * ran each cover with the wall removed, and `ADOPTION_RULING.md` §4 accepts the re-attribution:
 *
 * - **r2-item-4 and 130: the wall, as claimed.** With the raw-share floor retired at 0.4.1 the rank-0
 *   purple `#421b50` and the rank-0 cinnamon-red `#97191a` pass verification by concentration and
 *   publish, where 0.4.0 stepped past both.
 * - **208: the ordering, not the wall.** Rank 0 passes verification now and is *still not the yellow* —
 *   it is a dark red. This file predicted it two paragraphs down: the hue-separation term demotes a
 *   yellow against a warm beige field, which is 168's rule doing what 168 asked for.
 * - **188: neither.** Rank 0 passes verification and is refused **downstream**, by the accent↔foreground
 *   separation and the invariant-4 clauses in `pipeline.ts`. It was never a population question.
 *
 * The mechanism was nonetheless the bulk of the collapse rate: accent collapse rose from 19/220 to
 * 47/220 at 0.4.0 and falls to 29/220 with the wall retired, on 220 covers whose contract numbers do
 * not move at all.
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

import { REGION_CHROMA_BOUNDARY } from "../../../src/contract/constants.ts"
import type { Rgb8 } from "../../../src/contract/types.ts"
import { ACCENT_LUMP_DEPARTURE_TIE_BAND, LUMP_GAP_RATIO, TRIM_LEVEL } from "./constants.ts"
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

/**
 * OKLab chroma of one pixel — `hypot(a, b)`, a number attached to a pixel.
 *
 * Exported at 0.4.2 because `pipeline.ts`'s swap comparator asks the same question of a pixel that
 * narrowing 5 below does, and this file's own warning about `minRampContrast` applies verbatim: three
 * spellings of one metric is how two of them end up disagreeing.
 */
export function chromaOf(lab: Float64Array, pixel: number): number {
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

/** What the five narrowings did to one top-τ band. Counts and scalars only. */
export type AccentRefinement = Readonly<{
	/** The top-τ band's size, before any narrowing. */
	bandSize: number
	/** `null` when the band was one lump, or when the split was refused as unrankable. */
	gapRatio: number | null
	/**
	 * True when `gapRatio` sat inside δ_acc of the split threshold and the **higher-chroma convention**
	 * elected the lump instead of the departure comparison (0.4.1, requirement 5).
	 */
	lumpTieBandFired: boolean
	/** Masses of the two lumps, `[elected, rejected]` — by departure, or by the convention when it fired. */
	lumpMasses: readonly [number, number] | null
	chosen:
		| "whole-band"
		| "higher-departure-lump"
		| "higher-chroma-lump-convention"
		| "lower-departure-lump"
		| "lower-chroma-lump-fallback"
		| "lump-unrankable"
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
	/**
	 * The median OKLab chroma of narrowing 5's own top-τ chroma band (0.4.2). Gate 2 compares it to
	 * `REGION_CHROMA_BOUNDARY`; recorded beside `chromaBandSize` so "the band did not fire" splits into
	 * *unrankable band* and *neutral band* without re-deriving either.
	 */
	bandMedianChroma: number
	/** True when the high-chroma band actually narrowed the population (0.4.2). */
	chromaBandApplied: boolean
	/** The top-τ chroma band's size, whether or not the two gates let it fire. */
	chromaBandSize: number
	/** How many pixels the cascade actually ran over. */
	cascadedOver: number
	/** The published pixel's own qualification margin — requirement 7's audit number. */
	publishedMargin: number
	/** The published pixel's departure product. */
	publishedDeparture: number
	/**
	 * The published pixel's own OKLab chroma (0.4.2). The round-5 note was about *this* number — "the
	 * accent is darker than the real purple" — and a shade nuance that is not countable is not a fix.
	 */
	publishedChroma: number
}>

export type AccentChoice = Readonly<{
	pixel: number
	populationSize: number
	refinement: AccentRefinement
}>

/**
 * Redeem one rank of the accent ordering: the top-τ band, narrowed by the five preferences, cascaded.
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
	let lumpTieBandFired = false
	if (split !== null) {
		gapRatio = split.gapRatio
		// **The tie band (0.4.1, `ACCENT_LUMP_DEPARTURE_TIE_BAND`).** Requirement 5 forbids a near-tied lump
		// election in this role without a declared band and a stated convention, and the W15 audit found the
		// 0.4.0 election was exactly that: whichever lump held the higher departure won, at any separation,
		// including a separation that had only just cleared `LUMP_GAP_RATIO`. When the two lumps' departure
		// separation sits inside δ_acc of the split threshold, **the separation is not evidence about which
		// lump is the mark**, and a fixed convention decides instead: **the higher-chroma lump**, compared by
		// each lump's own median OKLab chroma. Same shape as `field-roles.ts`'s δ_bs and δ_lump; the reason
		// the convention is chroma and not departure is in `ACCENT_LUMP_DEPARTURE_TIE_BAND`'s own comment.
		lumpTieBandFired = split.gapRatio - LUMP_GAP_RATIO < ACCENT_LUMP_DEPARTURE_TIE_BAND
		let higher = split.upper
		let lower = split.lower
		if (lumpTieBandFired) {
			const chromaKey = (index: number): number => chromaOf(image.lab, index)
			const upperChroma = medianOfKey(split.upper, chromaKey)
			const lowerChroma = medianOfKey(split.lower, chromaKey)
			// Ties inside the convention itself keep the departure order, so the answer is still a function
			// of the two populations and never of which way a comparison was written.
			if (lowerChroma > upperChroma) {
				higher = split.lower
				lower = split.upper
			}
		}
		lumpMasses = [higher.length, lower.length]
		if (higher.length >= rankable) {
			population = higher
			chosen = lumpTieBandFired ? "higher-chroma-lump-convention" : "higher-departure-lump"
		} else if (lower.length >= rankable) {
			// The chromatic lump is a handful of pixels — a specular highlight or a compression artifact,
			// not a mark. Fall to the other lump rather than publish it; `verifyColor`'s support and spread
			// in `pipeline.ts` is the second half of the same guard.
			population = lower
			// The label names *which rule elected the other lump*, so a diagnostic reader is never told
			// "lower departure" about a lump the chroma convention rejected.
			chosen = lumpTieBandFired ? "lower-chroma-lump-fallback" : "lower-departure-lump"
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

	// **No margin *rank* sits here** (amended 2026-08-05, `ACCENT_REDESIGN.md` requirement 7). A 0.4.1
	// draft put a top-τ margin band between the contrast preference and lightness, reading requirement 7's
	// "margins rank" as an ordering step. Measured, that band lets high-margin neutrals beat the chromatic
	// mark: 138/220 accent changes on coverage, both headline marks destroyed (r2-item-4 published a grey
	// at cursor 2 instead of `#421b50`; 130 left `#97191a`), and cascade populations of 2–11 pixels — the
	// single-rank instability class 0.3.0 removed. Requirement 7's principle is served where it always
	// was: by step 2's lump lower-median margin **filter**, plus the twin-collapse watch. Refuted by
	// measurement, not by taste — see the amendment in `ACCENT_REDESIGN.md`.

	// 4. **The high-chroma band** (0.4.2, round-5's shade nuance). See the module docstring section
	//    "0.4.2 — where in the lump the cascade lands". Band-then-cascade on OKLab chroma, gated twice.
	const chromaKey = (index: number): number => chromaOf(image.lab, index)
	const chromaBand = topWindow(sortByKey(population, chromaKey), TRIM_LEVEL, 0)
	const bandMedianChroma = medianOfKey(chromaBand, chromaKey)
	// Gate 1 — **the band has to be worth taking a rank of.** `topWindow` returns a single pixel from any
	// population under 1/τ, and a single-pixel read is the single-extremum answer 0.3.0 removed everywhere
	// else (`luminanceOrdering` step 1 and the lump guard above use the same `ceil(1/τ)`). Applying the
	// rule to the object being *cascaded* rather than to the object being split is the stricter reading,
	// and this is the role where strictness is owed. It is also what leaves 130's cinnamon mark alone: its
	// population is 16 pixels.
	//
	// Gate 2 — **the band has to be chromatic.** Its own median chroma must sit in the contract's
	// `*-saturated` half. Inside a neutral band the chroma ordering ranks nothing but the low bits of two
	// 8-bit channels, and this role is the one `ATTRIBUTION.md` block 22 measures as the least stable in
	// the pipeline; EVIDENCE item 11 is about exactly that kind of epsilon ordering. It is what leaves
	// r2-item-1's near-black accent population alone, and the black that population publishes through the
	// swap is a round-2 hard constraint.
	//
	// **The gate is on the band and not on the population, and that is a correction made by measurement.**
	// A first draft gated on the *population's* median chroma and did not fire on the very cover the note
	// was written about: r2-item-4's accent population is 4827 pixels whose median chroma is **0.0133**,
	// because the qualified set on a grey field is mostly near-neutral — the low half of that population
	// *is* the dark tail the reviewer is complaining about, so gating on it asks the defect for permission
	// to fix itself. The band is the object that decides the published pixel; it is the object to test.
	const chromaBandApplied = chromaBand.length >= rankable && bandMedianChroma >= REGION_CHROMA_BOUNDARY
	const chromaBandSize = chromaBand.length
	if (chromaBandApplied) population = Int32Array.from(chromaBand)

	// 5. Lightness movement, the old tier-1 predicate as a preference. Same shape, same guarantee.
	//
	// **It runs after the chroma band from 0.4.2, and the move is the whole of the shade fix.** Until
	// 0.4.2 this was the last narrowing and therefore the final word, which on a *neutral* field is a
	// stronger claim than requirement 2 makes: `lightnessMove` is `|ΔL| − ‖Δ(a,b)‖` from the nearer end,
	// so against a grey end every genuinely vivid pixel scores **negative** and is filtered out. Measured
	// on r2-item-4's cover, where the field ends are `#4b4b4b` and `#7a7a7a`: the artwork's purple
	// `#5b199f` sits 0.0094 away in L and 0.1937 away in the chroma plane, so this preference dropped it,
	// and no downstream band could reach what this step had already removed — the reviewer's *"the accent
	// is darker than the real purple"* is this filter, one layer up from where it was read. With the
	// chroma band ahead of it, lightness movement does what requirement 2 says it does: it is the
	// tie-break **inside** the chromatic mark, not the gate in front of it.
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
			lumpTieBandFired,
			lumpMasses,
			chosen,
			headroomSize,
			medianMargin,
			legibleSize: legibleList.length,
			contrastPreferenceApplied,
			lightnessMovingSize: movingList.length,
			lightnessPreferenceApplied,
			bandMedianChroma,
			chromaBandApplied,
			chromaBandSize,
			cascadedOver: population.length,
			publishedMargin: pixel < 0 ? Number.NaN : ordering.margin[pixel],
			publishedDeparture: pixel < 0 ? Number.NaN : ordering.departure[pixel],
			publishedChroma: pixel < 0 ? Number.NaN : chromaOf(image.lab, pixel),
		},
	}
}
