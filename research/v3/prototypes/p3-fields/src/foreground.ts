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
 *
 * ## 0.3.0 — the ink regime: identity first, legibility second
 *
 * Round 1's two weak ink verdicts are the same defect twice
 * (`review-rounds/round-1-calibration/VERDICTS.md`): *"foreground is hard to read on top of surface"* on
 * items 00 and 02, and on item-02 the published foreground was `#c8c8c8` **on a cover whose ink is
 * black**. Until 0.3.0 the ink regime published its cascade pixel with contrast entering only through
 * near-zero verification floors one layer later. Two clauses close it, and **their order is the whole
 * design**:
 *
 * 1. **Lump-aware cascade — which lump is the ink.** `#c8c8c8` is not a colour anybody chose; it is the
 *    *median of a window that straddles two lumps*, black type and light ground, the same
 *    cascade-over-a-bimodal-band defect `ATTRIBUTION.md` traces at the field ends. So the top-τ window is
 *    split at its largest adjacent-decile gap in **L** (`LUMP_GAP_RATIO`) and the cascade runs over the
 *    **L-extreme** lump — the one further from the lightness axis's midpoint — because the designer's ink
 *    is an extreme and the thing between the lumps is an artefact of averaging ranks. Within
 *    `INK_LUMP_EXTREMITY_TIE_BAND` the darker lump wins, matching this file's and `field-roles.ts`'s
 *    other two conventions. **This step consults no contrast quantity at all.**
 * 2. **Contrast as a preference *inside* the chosen lump.** Among the ink pixels, those whose **minimum
 *    |raw APCA| over the published field ramp** clears the contract's text floor are preferred — the
 *    cascade runs over them instead of over the whole lump. If *none* of the ink clears the floor, the
 *    whole lump is still the answer: the artwork's own ink is published at whatever contrast it has.
 *
 * ### 0.4.3 — what round 6 measured clause 1 to be wrong about
 *
 * Round 6 (`review-rounds/round-6-calibration/VERDICTS.md`) prescribed the foreground on three covers —
 * *"we should use black as the foreground"*, *"the main text is white… we should have a white
 * foreground"* ×2 — and on all three the prescribed colour **exists in the artwork**. Diagnosed with
 * `P3_DIAG`, the three misses are **two different defects and only one of them is local**:
 *
 * 1. **The lump election elected the ground** (one cover, repaired here). The black lettering was in the
 *    step-0 ink window as an 18-pixel lump; the 125-pixel near-white lump beat it on extremity because
 *    the ground was `#ffffff`. Clause 1 gains the **ground-lump exclusion** at its site below.
 * 2. **The prescribed colour never entered the window at all** (two covers, *not* repaired here, and
 *    reported rather than smoothed). Both prescribe white; on one the white type sits at 44.8 % from the
 *    top of the ink ordering, on the other at 5.9 %, so no rank the search may step to reaches it
 *    (8 windows and 1 window away respectively, against `MAX_RANK_STEPS` 6 — and the second is inside
 *    the cap only in the sense that the *topmost* white pixel is, not a rankable lump of them). The
 *    cause is the ink **score**, not any clause over it: the score is the coherence of a mark's
 *    surround, and white lettering over a photograph has an incoherent surround while the flat
 *    near-black corners of the same cover score 1.0. On both covers the *luminance* regime's rank-0
 *    answer is exactly the prescribed white (`#fafaf8`, `#ffffff`, min-ramp 105.4 and 98.6) — but the
 *    ink regime is entered on source support and is never left on anything else, by the design decision
 *    two paragraphs up. **That is a structural finding about §2.5's ink score on photographic covers and
 *    it is reported upward, not tuned around here.**
 *
 * ### 0.4.4 — what the exclusion cost, counted and guarded
 *
 * W23 shipped the exclusion with its own tension attached: on **31 of the 82** covers where it fires,
 * the lump left standing holds fewer than `ceil(1/τ)` pixels and **six** hold exactly one. A cascade
 * over one pixel is the single-extremum read 0.3.0 removed from `luminanceOrdering` and from the field
 * ends — reintroduced at small scale, in the clause that had just been added. 0.4.4 guards it at the
 * site (see the comment there): the elected side keeps its side and moves its **cut**, absorbing the
 * band's next lump until it is rankable, and the widened lump must still pass the exclusion's own
 * ground test.
 *
 * **The guard's refusal is as load-bearing as its firing, and 168 is why.** That cover's ink window is
 * 1587 pixels of which the blue mark is 10; every widened cut pulls the lump's median lightness into
 * the dark-grey ground, so the guard **refuses** and the 10-pixel blue stands. The paired-family shape
 * `EVIDENCE_2026-08-04.md` item 13 prescribes — two dark greys, two blues — survives *because* the
 * refusal clause is the same statement the shape rests on, not because the cover was special-cased.
 * `lumpGuard` counts firings and refusals separately for exactly this reason.
 *
 * **The scope is stated and narrower than the tension.** The guard runs only on exclusion elections.
 * The extremity rule and its tie band elect a lump on a positive property *of that lump*, and they too
 * elect slivers — cover 19's black type is 3 pixels, 130's is 5, and both are reviewer-endorsed
 * foregrounds. Widening those walks straight into the white or the ground behind the type and would
 * trade two graded-strong answers for a stability argument. That is a real open: the single-extremum
 * objection applies to them too, and 0.4.4 does not answer it.
 *
 * **The regime is never left on a contrast failure.** Falling through to the luminance ordering happens
 * only where it always did, on the source-support test (§2.5 / `clearsInkRegimeMargin`). An earlier draft
 * of this iteration made clause 2 a hard feasibility mask that could empty the population and evict the
 * regime; that is the wrong direction, and the evidence says so.
 *
 * ### The tension, named rather than resolved here
 *
 * Round 1 graded items 00 and 02 **weak for foreground readability** — legibility over identity. A P5
 * round then produced the opposite verdict on the same axis: **identity outranked legibility**, with a
 * reviewer demanding a *white* foreground on a light field because the title text on that cover is
 * white. Both are human verdicts and they pull opposite ways. This file resolves the conflict by
 * *publishing the designer's ink and preferring the legible part of it*, which satisfies the P5 case
 * exactly and the round-1 case whenever the ink has any legible part — and it declines to invent a
 * third answer on covers where the ink has none. **Round 2 re-grades items 00 and 02 and settles it
 * empirically**; nothing in this docstring should be read as having settled it.
 *
 * The one deviation declared above applies unchanged: the ramp is its **stop pixels**, never its
 * interpolants.
 */

import { apcaRaw } from "../../../src/contract/color.ts"
import { SOURCE_POPULATION_FLOOR } from "../../../src/contract/constants.ts"
import type { Rgb8 } from "../../../src/contract/types.ts"
import {
	FOREGROUND_POLARITY_TIE_BAND,
	INK_ANNULUS_MIN_RADIUS_PX,
	INK_ANNULUS_MIN_SAMPLES,
	INK_ANNULUS_RATIO,
	INK_ANNULUS_SAMPLES,
	INK_LUMP_EXTREMITY_TIE_BAND,
	INK_REGIME_SUPPORT_MARGIN,
	LIGHTNESS_AXIS_MIDPOINT,
	LUMP_GAP_RATIO,
	TRIM_LEVEL,
} from "./constants.ts"
import { pixelRgb, type DecodedImage } from "./decode.ts"
import {
	cascadePixel,
	labDistance,
	medianOfKey,
	sortByKey,
	splitAtLargestDecileGap,
	splitAtWidestAcceptedDecileGap,
	topWindow,
} from "./primitives.ts"

/**
 * What the substrate branch has to hand `computeInkField` in place of a distance-transform depth.
 *
 * The ink band is defined by two things the coherence field cannot supply by itself: a **floor** below
 * which a pixel is boundary rather than mark, and a **length** for the annulus radius.
 *
 * - `bandFloor` — on the shipped path this is 0 and means *not an edge pixel*, a statement only a binary
 *   edge map can make. Its continuous analogue is the mirror of the field cut: the least-coherent
 *   (1 − β) of the artwork is the boundary population, the most-coherent (1 − β) is F, and the band
 *   between them is where a mark on a ground lives. That reuses β and introduces **no new constant** —
 *   but it is a wider band than the shipped one, which on a busy cover is most of the artwork, and the
 *   ink field is the pipeline's only super-linear term. The cost is measured, not assumed.
 * - `radiusField` — `INK_ANNULUS_RATIO · depth · longEdge` is a length times a ratio; applied to a
 *   percentile it would be meaningless (a rank of 0.5 would ask for a radius of half the image). The
 *   coherence field's `scaleDepth` is the length-valued companion built for exactly this consumer.
 */
export type InkSubstrate = Readonly<{ bandFloor: number; radiusField: Float64Array }>

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
	substrate: InkSubstrate | null = null,
): InkField {
	const { width, height, lab, bar, rgb, eligible, eligibleIndices, longEdge } = image
	const candidates: number[] = []
	const scores: number[] = []
	const ring = new Int32Array(INK_ANNULUS_SAMPLES)
	let bandSize = 0
	// The shipped path: the band's floor is *strictly positive depth*, i.e. "not itself an edge pixel",
	// and the annulus radius is that same depth. On the substrate path there is no edge map to be
	// excluded from and the field carries no length, so both come in from the caller. See `InkSubstrate`.
	const bandFloor = substrate === null ? 0 : substrate.bandFloor
	const radiusField = substrate === null ? null : substrate.radiusField

	for (let i = 0; i < eligibleIndices.length; i += 1) {
		const index = eligibleIndices[i]
		const d = depth[index]
		if (d <= bandFloor || d >= fieldThreshold) continue
		bandSize += 1

		const y = Math.floor(index / width)
		const x = index - y * width
		const length = radiusField === null ? d : radiusField[index]
		const radius = Math.max(
			INK_ANNULUS_MIN_RADIUS_PX,
			Math.round(INK_ANNULUS_RATIO * length * longEdge),
		)

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
	/**
	 * The top-τ window this choice was the cascade pixel of — the same `subarray` the cascade ran over,
	 * handed back rather than copied.
	 *
	 * Pixel indices, never colours. It is returned so a diagnostic run can read the window's own
	 * L-distribution: the 0.2.0 hypothesis is that the remaining instability lives in *the cascade over
	 * this window*, and a hypothesis about a population cannot be tested from a summary of it.
	 */
	window: Int32Array
	/** How the ink regime's lump clause and contrast preference landed (0.3.0). `null` for luminance. */
	inkRefinement: InkRefinement | null
}>

/**
 * What the ink regime's two 0.3.0 clauses did to the top-τ window. Counts and scalars only.
 */
export type InkRefinement = Readonly<{
	/** The top-τ window's size, before either clause. */
	windowSize: number
	/** How many pixels the chosen L-lump held. */
	lumpSize: number
	/** How many of those cleared the min-ramp |APCA| floor. Never used to empty the population. */
	legibleSize: number
	/** `null` when the window was one lump. */
	gapRatio: number | null
	/** Lower and upper lump masses, or `null`. */
	lumpMasses: readonly [number, number] | null
	/** Median L of each lump, or `null`. */
	lumpMedianL: readonly [number, number] | null
	chosen:
		| "whole-population"
		| "extreme-lump"
		| "darker-convention"
		| "ground-lump-excluded"
		/** The 0.4.4 guard relocated the cut and the exclusion's own side grew to a rankable lump. */
		| "ground-lump-excluded-widened"
	/**
	 * What the sub-rankable lump guard did (0.4.4): `not-triggered` when the elected lump was rankable
	 * or the election was not the exclusion's, `widened` when the cut moved, `refused` when no cut left
	 * a rankable lump outside the field's lightness span and the sliver stands.
	 *
	 * Counted rather than argued: `refused` is the honest name for "this cover's ink really is ten
	 * pixels", and a guard whose refusals are invisible is a guard nobody can audit.
	 */
	lumpGuard: "not-triggered" | "widened" | "refused"
	/**
	 * Which lump the 0.4.3 ground exclusion refused, or `null` when it did not fire (0.4.3).
	 *
	 * Recorded at its own site so that "the published foreground moved between 0.4.2 and 0.4.3" splits
	 * into *the exclusion fired* and *something upstream moved the window*, without re-deriving either.
	 */
	groundLump: "lower" | "upper" | null
	/** True when the contrast preference actually narrowed the lump. */
	contrastPreferenceApplied: boolean
	/** How many pixels the cascade actually ran over. */
	cascadedOver: number
}>

/**
 * The ink regime's ramp anchors and floor, as the pipeline resolves them. A *preference*, not a mask:
 * `refineInkWindow` narrows the ink lump toward these and never empties it.
 *
 * Pixel triples rather than pixel indices because `apcaRaw` takes triples, and the anchors are read
 * once per ends step and consulted once per candidate pixel.
 */
export type InkContrastPreference = Readonly<{
	anchorRgb: readonly Rgb8[]
	floor: number
	/**
	 * The published ramp's stop pixels **as OKLab L**, in ramp order (0.4.3).
	 *
	 * Read by the lump clause, not by the contrast preference — it is the field's own lightness span,
	 * which is what "this lump is the ground rather than the ink" is a statement about. Lightnesses of
	 * actual published pixels, resolved by the pipeline beside the triples so the two views of one ramp
	 * cannot drift apart. Empty means "no ramp available" and the ground exclusion does not run.
	 */
	anchorL: readonly number[]
}>

/**
 * The contract's text-versus-field metric for one pixel: **min |raw APCA| over the ramp's stops**.
 *
 * Exported because three sites consume the same quantity at 0.3.0 — the ink preference here, the accent's
 * feasibility floor, and the fg↔accent comparator — and three spellings of one metric is how two of
 * them end up disagreeing.
 */
export function minRampContrast(image: DecodedImage, pixel: number, anchorRgb: readonly Rgb8[]): number {
	const rgb = pixelRgb(image, pixel)
	let smallest = Number.POSITIVE_INFINITY
	for (const anchor of anchorRgb) {
		const magnitude = Math.abs(apcaRaw(rgb, anchor))
		if (magnitude < smallest) smallest = magnitude
	}
	return smallest
}

/**
 * The ink regime's two clauses, applied to one top-τ window. **Identity first, legibility second.**
 * See the module docstring for the ordering and the evidence behind it.
 *
 * Never returns an empty population, and never `null`: the ink regime is left only by the
 * source-support test, never by a contrast one.
 */
function refineInkWindow(
	image: DecodedImage,
	window: Int32Array,
	preference: InkContrastPreference,
): Readonly<{ population: Int32Array; record: InkRefinement }> {
	// 1. The lump clause, on L — which lump is the artwork's *ink*. Run first, over the whole window,
	//    so no contrast test can decide it.
	const lightnessOf = (index: number): number => image.lab[index * 3]
	const split = splitAtLargestDecileGap(window, lightnessOf, LUMP_GAP_RATIO)

	let population: Int32Array = window
	let chosen: InkRefinement["chosen"] = "whole-population"
	let lumpMasses: readonly [number, number] | null = null
	let lumpMedianL: readonly [number, number] | null = null
	let groundLump: "lower" | "upper" | null = null
	let lumpGuard: InkRefinement["lumpGuard"] = "not-triggered"
	// `luminanceOrdering`'s own "worth taking a rank of" rule, the same `ceil(1/τ)` the accent's lump
	// guard and its chroma band use. Not a new constant.
	const rankableLump = Math.ceil(1 / TRIM_LEVEL)
	if (split !== null) {
		const lowerL = medianOfKey(split.lower, lightnessOf)
		const upperL = medianOfKey(split.upper, lightnessOf)
		// **The ground-lump exclusion (0.4.3, round-6 root cause).** A lump whose median L sits *inside the
		// field's own lightness span* is the ground, not the ink — the field is the thing the artwork's
		// ground is published as, and a mark that is the same lightness as the field is the ground showing
		// through the window rather than a designer's mark on it. It is the same membership test
		// `luminanceOrdering` cuts its bands with (a comparison of a pixel's L to two published pixels'),
		// applied to a lump median instead of to a pixel, and it is an **identity** statement rather than a
		// contrast one: no APCA, no ramp minimum, nothing about readability.
		//
		// **What it repairs, measured** (`review-rounds/round-6-calibration/VERDICTS.md`). On row 0's cover
		// the reviewer prescribed a black foreground; the artwork's black lettering *was* in the step-0 ink
		// window as an 18-pixel lump at median L 0.157, and the extremity rule below elected the 125-pixel
		// near-white lump at median L 0.970 instead — because on a `#ffffff` ground the **ground** is the
		// L-extreme (|0.970 − 0.5| = 0.470 > |0.157 − 0.5| = 0.344) and the ink is not. That is the
		// extremity rule's premise failing on its own worked example: its docstring assumed a ground at
		// L 0.83, and a white ground is at 1.0. Distance from a fixed abstract midpoint cannot tell ink
		// from ground; distance from *this artwork's field* can, and the field is two published pixels.
		//
		// It fires only when exactly one lump is inside the span, so it can never empty the population and
		// never has to choose between two grounds. Where it does not fire, the extremity rule and its tie
		// band decide exactly as they did at 0.3.0 — including cover 19's 3-pixel black ink lump, which is
		// a round-2 hard constraint and is outside the span at both ends.
		let darkestAnchorL = Number.POSITIVE_INFINITY
		let lightestAnchorL = Number.NEGATIVE_INFINITY
		for (const anchor of preference.anchorL) {
			if (anchor < darkestAnchorL) darkestAnchorL = anchor
			if (anchor > lightestAnchorL) lightestAnchorL = anchor
		}
		const insideField = (l: number): boolean => l >= darkestAnchorL && l <= lightestAnchorL
		const lowerIsGround = preference.anchorL.length > 0 && insideField(lowerL)
		const upperIsGround = preference.anchorL.length > 0 && insideField(upperL)

		// Extremity is distance from the lightness axis's own midpoint: OKLab L is bounded [0, 1], so this
		// is an absolute, scale-free quantity and not a statistic of this corpus. A cover with black type
		// on white puts the ink lump at |0 − 0.5| and the ground lump at |0.83 − 0.5|; a cover with white
		// type on black puts them the other way round. Both cases pick the type, which is the point.
		const lowerExtremity = Math.abs(lowerL - LIGHTNESS_AXIS_MIDPOINT)
		const upperExtremity = Math.abs(upperL - LIGHTNESS_AXIS_MIDPOINT)
		const tied = Math.abs(lowerExtremity - upperExtremity) < INK_LUMP_EXTREMITY_TIE_BAND
		if (lowerIsGround !== upperIsGround) {
			groundLump = lowerIsGround ? "lower" : "upper"
			population = lowerIsGround ? split.upper : split.lower
			chosen = "ground-lump-excluded"
		} else {
			population = tied ? split.lower : (lowerExtremity > upperExtremity ? split.lower : split.upper)
			chosen = tied ? "darker-convention" : "extreme-lump"
		}
		lumpMasses = [split.lower.length, split.upper.length]
		lumpMedianL = [lowerL, upperL]

		// **The sub-rankable lump guard (0.4.4).** W23 measured the exclusion's own cost: on 31 of the 82
		// covers where it fires, the lump it leaves standing holds fewer than `ceil(1/τ)` pixels and six
		// of those hold **one**. A cascade over one pixel is the single-extremum read 0.3.0 removed from
		// `luminanceOrdering` and from the field ends, reintroduced at small scale — and it is
		// reintroduced *here* rather than anywhere else because the exclusion elects a lump by what the
		// other lump **is not**, so "whatever was left" can be a sliver. The extremity rule and its tie
		// band elect on a positive property of the lump itself and are left alone; the scope is stated
		// rather than universal, and it is the scope the measurement covers.
		//
		// **The rule: the cut moves, the side does not.** When the excluded election leaves fewer than
		// `ceil(1/τ)` pixels, the split is re-taken at the **next-widest decile gap** that leaves the same
		// side rankable — the elected lump absorbing the band's next lump. Two conditions on the widened
		// lump, and no new constant in either:
		//
		//  - it must hold `ceil(1/τ)` pixels — `luminanceOrdering`'s rankability rule, the reason the guard
		//    exists;
		//  - **its median L must still sit outside the field's own lightness span** — the 0.4.3 exclusion's
		//    own test, re-applied to the widened lump. Widening walks *toward* the ground, and a lump that
		//    has walked into it is the ground under a bigger name. Where no cut satisfies both, the guard
		//    is **refused** and the sliver stands: a sliver of the artwork's ink is a worse answer than a
		//    rankable population of it, and a better answer than the ground.
		//
		// 168 is the cover this refusal exists for and it is a *measurement*, not a carve-out: its ink
		// window is 1587 pixels of which the blue mark is 10, so every widened cut pulls the median into
		// the dark-grey ground and the guard refuses on the ground clause. The paired-family shape
		// (`EVIDENCE_2026-08-04.md` item 13) survives because the rule's second condition is the same
		// statement the shape rests on.
		if (chosen === "ground-lump-excluded" && population.length < rankableLump) {
			const excludedIsLower = groundLump === "lower"
			const wider = splitAtWidestAcceptedDecileGap(window, lightnessOf, LUMP_GAP_RATIO, (candidate) => {
				const side = excludedIsLower ? candidate.upper : candidate.lower
				return side.length >= rankableLump && !insideField(medianOfKey(side, lightnessOf))
			})
			if (wider === null) {
				lumpGuard = "refused"
			} else {
				lumpGuard = "widened"
				population = excludedIsLower ? wider.upper : wider.lower
				chosen = "ground-lump-excluded-widened"
			}
		}
	}

	// 2. Contrast, as a **preference inside** the chosen lump and never as an eviction from it. If some
	//    of the ink clears the contract's text floor against the ramp, the cascade runs over that part;
	//    if none of it does, the whole lump is still the answer and the artwork's own ink is published
	//    at whatever contrast it has.
	const legibleList: number[] = []
	for (let i = 0; i < population.length; i += 1) {
		if (minRampContrast(image, population[i], preference.anchorRgb) >= preference.floor) legibleList.push(population[i])
	}
	const legible = legibleList.length > 0 && legibleList.length < population.length
		? Int32Array.from(legibleList)
		: population

	return {
		population: legible,
		record: {
			windowSize: window.length,
			lumpSize: population.length,
			legibleSize: legibleList.length,
			gapRatio: split === null ? null : split.gapRatio,
			lumpMasses,
			lumpMedianL,
			chosen,
			groundLump,
			lumpGuard,
			contrastPreferenceApplied: legible !== population,
			cascadedOver: legible.length,
		},
	}
}

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
	/**
	 * How many pixels each lightness band held, before rankability was tested.
	 *
	 * A returned count, not a new computation — the three arrays exist either way. It is here because
	 * step 1 of the cascade ("a band with no population worth taking a rank of is out") is a threshold
	 * on exactly these numbers, and a band that crosses `ceil(1/τ)` under a dither changes which bands
	 * are compared at all. Without the counts that transition is invisible in the record.
	 */
	bandSizes: Readonly<Record<ForegroundBand, number>>
	/** The ramp's own lightness extremes, which cut the bands. */
	darkestAnchorL: number
	lightestAnchorL: number
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
	deepFloor = 0,
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
		if (depth[index] > deepFloor) deep.push(index)
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

	// Diagnostic-only, and free: the three counts already exist as array lengths.
	const bandSizes: Record<ForegroundBand, number> = {
		below: members.below.length,
		between: members.between.length,
		above: members.above.length,
	}

	if (usable.length === 0) {
		// No band is a population of its own; rank the whole thing and make no polarity decision. This is
		// the 0.1.0 shape, reached only where the polarity question has no answer to give.
		return {
			regime: "luminance",
			sorted: orderingOf(population),
			polarity: { band: "unsplit", trimmed, decidedBy: "only-population", bandSizes, darkestAnchorL, lightestAnchorL },
		}
	}
	if (usable.length === 1) {
		return {
			regime: "luminance",
			sorted: sortedOf[usable[0]] as Int32Array,
			polarity: { band: usable[0], trimmed, decidedBy: "only-population", bandSizes, darkestAnchorL, lightestAnchorL },
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
		polarity: {
			band,
			trimmed,
			decidedBy: band === best && tied.length === 1 ? "trimmed-contrast" : "darker-convention",
			bandSizes,
			darkestAnchorL,
			lightestAnchorL,
		},
	}
}

/**
 * Redeem one rank of an ordering: the cascade pixel of its top-τ sub-population, stepped.
 *
 * `inkPreference` is the ink regime's 0.3.0 contrast pressure and is ignored by the luminance regime, whose
 * ordering is already the ramp minimum. `null` means "no ramp available" — the escape path and any
 * caller without a published ramp — and reproduces 0.2.0's behaviour exactly.
 */
export function chooseForeground(
	image: DecodedImage,
	ordering: ForegroundOrdering,
	step: number,
	inkPreference: InkContrastPreference | null = null,
): ForegroundChoice | null {
	const window = topWindow(ordering.sorted, TRIM_LEVEL, step)
	if (window.length === 0) return null

	let population: Int32Array = window
	let inkRefinement: InkRefinement | null = null
	if (ordering.regime === "ink" && inkPreference !== null) {
		const refined = refineInkWindow(image, window, inkPreference)
		population = refined.population
		inkRefinement = refined.record
	}

	return {
		pixel: cascadePixel(population, population.length, image.lab, image.rgb),
		regime: ordering.regime,
		populationSize: population.length,
		polarity: ordering.polarity,
		// The population the cascade actually ran over, not the window it started from: a hypothesis
		// about the cascade cannot be tested from a summary of a population the cascade did not see.
		window: population,
		inkRefinement,
	}
}
