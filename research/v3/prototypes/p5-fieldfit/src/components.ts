/**
 * P5 — **field-like components**: the types the v0.5 field reading is stated in, and the two
 * `FieldFit` views that let the existing ramp and overlay machinery read a component without
 * either module learning what a component is (W-E2, `E2_BRIEF.md`; `SPEC.md` decision 12).
 *
 * `src/types.ts` is the frozen interface contract and this file does not touch it: it imports from
 * it and adds the two shapes `E2_BRIEF.md` names (`FieldComponent`, `FieldReading`). The
 * orchestrator mirrors them into `types.ts` at commit time if it wants them there; nothing here
 * depends on where they live.
 *
 * ## What a component is, in one paragraph
 *
 * The same robust affine fit `fieldfit.ts` runs on the whole raster, run again on the pixels no
 * accepted component explains yet, and **held to the contract's own explained radius**: its Tukey
 * cut is `min(4.685·σ̂, 4×bar)`, so a component may never claim a pixel it does not explain. Its
 * *support* is exactly the set it claims. It is a fit, never a segmentation — no connected
 * components, no masks as primitives, no size thresholds inside the estimator. The masks that do
 * appear (`claim`) are outputs of the fit's own residuals, which is the same thing `FieldFit.weights`
 * has always been.
 *
 * ## Why the views exist
 *
 * `ramp.ts` reads a `FieldFit`: coefficients for the surface, a full-resolution weight map for the
 * t-statistics, and a `noField` flag. A component carries all three. `componentFieldFit` therefore
 * turns a component into a `FieldFit` whose weights are zero off the component's support, and the
 * *existing* ramp machinery — endpoint quantiles, orientation, excursion, third stop — then reads
 * the component's own ramp over its own support with no support-restriction code of its own. That
 * is `E2_BRIEF.md`'s "by the existing ramp machinery restricted to the component's support",
 * implemented as a restriction of the input rather than a fork of the reader.
 *
 * `compositeFieldFit` is the same trick for W-MARKS: a fit whose `fieldAt` is the **local**
 * component's surface (the component whose support the position sits in) and whose weights are the
 * pool's, so overlay mass is measured against "everything no field-like component explains" instead
 * of against one global plane. That is arm-f's original local-field semantics; `overlay.ts` is
 * untouched.
 */

import type { OkLab } from "../../../src/contract/types.ts"

import { normalizedX, normalizedY } from "./decode.ts"
import type { DecodedRaster, FieldFit } from "./types.ts"

// ---------------------------------------------------------------------------------------------
// SPEC decision 15 — the ink-likeness instrument (arm-e-r3 §2.4's ink statistics)
// ---------------------------------------------------------------------------------------------
//
// Two **shape** measurements over a support — a set of pixels — and nothing semantic:
//
//  - **erosion mortality**: the fraction of the support that fails to survive a morphological
//    erosion at the ink scale. Text and line art nearly vanish; a depicted region does not.
//  - **ground adjacency**: the fraction of the support's outward boundary whose neighbour is
//    field-claimed. An ink sits *on* a ground; a depicted region abuts other depicted regions.
//
// Both are computed from one chessboard (L∞) distance transform, which is the exact companion of an
// erosion by a square structuring element: a pixel survives an erosion of radius `r` iff its
// chessboard distance to the support's complement exceeds `r`.
//
// **Why the support is closed first, measured rather than assumed.** The first thing a claim mask
// off a JPEG cover is *not* is a clean region: a painted sky's claim is a speckle field whose raw
// erosion mortality is 1.00 at every scale, which would make the instrument read every textured
// field as ink. Closing (dilate then erode) at the texture scale fills the dither holes without
// thickening a stroke, and it is the difference between a discriminating instrument and one that
// fires on everything — see `INK_TEXTURE_CLOSING_FRACTION` for the measurement.

/**
 * The erosion radius at which mortality is measured, as a fraction of the **short side** —
 * `CONVENTIONS.md`'s scale-free form, and arm-e-r3 §4's parameter 3.
 *
 * `[UNCALIBRATED]`, anchored per arm-e-r3 to *the stroke-width of designed marks*, measured on the
 * round-3 covers' own typography (W-P12; medial-axis widths `2·D − 1` at the local maxima of the
 * chessboard distance transform over each reviewer-named type colour's support):
 *
 *  - fine type — round-3 item 7's white title 1–7 px and its blue sub-title 1–7 px (modal 5) on a
 *    640² cover, item 3's black type 1–7 px on a 300² cover: **0.002 – 0.023** of the short side;
 *  - display type — item 6's `HiROQUEST 3` lettering, modal widths 31/33/35/37 px on 640²:
 *    **0.048 – 0.058** of the short side.
 *
 * An erosion of radius `r` kills every structure narrower than `2r + 1`. At `r = 0.03` of the short
 * side that is `0.06` of the short side — 19 px on a 300² cover, 39 px on a 640² one — which covers
 * the whole measured range, fine and display, on both cover sizes. A radius chosen from the *fine*
 * end alone would have left item 6's display type standing, which is the case the instrument exists
 * for.
 */
export const INK_SCALE_FRACTION = 0.03

/**
 * The radius of the closing applied to a support before it is eroded, as a fraction of the short
 * side.
 *
 * `[UNCALIBRATED]` and **measured by margin**: over the round-3 batch's twelve extensive components,
 * the closing radius was swept at 0.004 / 0.007 / 0.0133 / 0.02 and 0.007 maximises the gap between
 * the one component the reviewer called ink (item 6, mortality **0.99**) and the highest-mortality
 * component the reviewer accepted as a field among those the adjacency conjunct does not already
 * clear (item 3's second component, **0.67**). Without any closing the same sweep reads item 5's
 * rock field at 1.00 and item 7's at 0.97 — indistinguishable from the type.
 *
 * 0.007 is 2 px on a 300² cover and 4 px on a 640² one: the scale of JPEG/dither speckle, well below
 * the thinnest measured designed stroke.
 */
export const INK_TEXTURE_CLOSING_FRACTION = 0.007

/** What the instrument measured over one support. Shape only; nothing here is a colour. */
export type InkStatistics = Readonly<{
	/** |support| after the texture closing — the denominator both fractions are taken over. */
	closedPixels: number
	/** 1 − (survivors of the erosion at the ink scale) / `closedPixels`. */
	erosionMortality: number
	/** Fraction of the support's outward 4-neighbour boundary whose neighbour is field-claimed. */
	groundAdjacency: number
}>

/**
 * Chessboard (L∞) distance from every support pixel to the support's complement; 0 off the support.
 *
 * Two sequential passes, which is exact for the chessboard metric. **Outside the image is support**
 * (border replication): a region that runs to the frame must not be eroded by the frame, which would
 * otherwise read every full-bleed field as thin.
 */
export function chessboardDistanceToComplement(
	support: Uint8Array,
	width: number,
	height: number,
): Int32Array {
	const distance = new Int32Array(width * height)
	const unreached = width + height + 1
	for (let index = 0; index < distance.length; index += 1) {
		distance[index] = support[index] === 1 ? unreached : 0
	}
	for (let row = 0; row < height; row += 1) {
		for (let column = 0; column < width; column += 1) {
			const index = row * width + column
			if (distance[index] === 0) continue
			let best = unreached
			for (let dy = -1; dy <= 0; dy += 1) {
				for (let dx = -1; dx <= 1; dx += 1) {
					if (dy === 0 && dx >= 0) continue
					const ny = row + dy
					const nx = column + dx
					if (ny < 0 || nx < 0 || nx >= width) continue
					const value = distance[ny * width + nx]
					if (value < best) best = value
				}
			}
			if (best + 1 < distance[index]) distance[index] = best + 1
		}
	}
	for (let row = height - 1; row >= 0; row -= 1) {
		for (let column = width - 1; column >= 0; column -= 1) {
			const index = row * width + column
			if (distance[index] === 0) continue
			let best = unreached
			for (let dy = 0; dy <= 1; dy += 1) {
				for (let dx = -1; dx <= 1; dx += 1) {
					if (dy === 0 && dx <= 0) continue
					const ny = row + dy
					const nx = column + dx
					if (ny >= height || nx < 0 || nx >= width) continue
					const value = distance[ny * width + nx]
					if (value < best) best = value
				}
			}
			if (best + 1 < distance[index]) distance[index] = best + 1
		}
	}
	return distance
}

/** Morphological closing at chessboard radius `radius`: dilate, then erode. */
export function closeSupport(
	support: Uint8Array,
	width: number,
	height: number,
	radius: number,
): Uint8Array {
	if (radius <= 0) return support
	const complement = new Uint8Array(support.length)
	for (let index = 0; index < support.length; index += 1) {
		complement[index] = support[index] === 1 ? 0 : 1
	}
	// Distance from a non-support pixel to the support: ≤ radius ⇒ the dilation covers it.
	const outward = chessboardDistanceToComplement(complement, width, height)
	const dilated = new Uint8Array(support.length)
	for (let index = 0; index < support.length; index += 1) {
		dilated[index] = support[index] === 1 || outward[index] <= radius ? 1 : 0
	}
	const inward = chessboardDistanceToComplement(dilated, width, height)
	const closed = new Uint8Array(support.length)
	for (let index = 0; index < support.length; index += 1) {
		closed[index] = inward[index] > radius ? 1 : 0
	}
	return closed
}

/** `Math.round`ed pixel radius of a fraction-of-short-side scale, never below 1. */
export function scaleRadius(width: number, height: number, fraction: number): number {
	return Math.max(1, Math.round(fraction * Math.min(width, height)))
}

/**
 * The two ink statistics over one support, against one ground map.
 *
 * `ground[i] === 1` means "some field surface claims pixel i". The caller owns what that means at
 * its own site — the composite field's claim for an overlay cluster, the other accepted components'
 * claims for a field candidate — because "the field" is a different object in the two places and
 * this function must not guess which.
 */
export function inkStatistics(
	support: Uint8Array,
	ground: Uint8Array,
	width: number,
	height: number,
): InkStatistics {
	const closed = closeSupport(support, width, height, scaleRadius(width, height, INK_TEXTURE_CLOSING_FRACTION))
	const inkRadius = scaleRadius(width, height, INK_SCALE_FRACTION)
	const distance = chessboardDistanceToComplement(closed, width, height)

	let closedPixels = 0
	let survivors = 0
	for (let index = 0; index < closed.length; index += 1) {
		if (closed[index] !== 1) continue
		closedPixels += 1
		if (distance[index] > inkRadius) survivors += 1
	}

	let outwardBoundary = 0
	let onGround = 0
	for (let row = 0; row < height; row += 1) {
		for (let column = 0; column < width; column += 1) {
			const index = row * width + column
			if (support[index] !== 1) continue
			if (row > 0) {
				const n = index - width
				if (support[n] !== 1) { outwardBoundary += 1; if (ground[n] === 1) onGround += 1 }
			}
			if (row < height - 1) {
				const n = index + width
				if (support[n] !== 1) { outwardBoundary += 1; if (ground[n] === 1) onGround += 1 }
			}
			if (column > 0) {
				const n = index - 1
				if (support[n] !== 1) { outwardBoundary += 1; if (ground[n] === 1) onGround += 1 }
			}
			if (column < width - 1) {
				const n = index + 1
				if (support[n] !== 1) { outwardBoundary += 1; if (ground[n] === 1) onGround += 1 }
			}
		}
	}

	return {
		closedPixels,
		erosionMortality: closedPixels > 0 ? 1 - survivors / closedPixels : 0,
		groundAdjacency: outwardBoundary > 0 ? onGround / outwardBoundary : 0,
	}
}

/**
 * One field-like component: a robust affine surface plus the pixels it explains.
 *
 * The shape `E2_BRIEF.md` sketched — `{ coefficients, support mass, explainedFractionOwn, meanX,
 * meanY, fieldAt(x, y) }` — is present field for field. The additions are the ones the reading and
 * the diagnostics cannot be written without, each named here:
 *
 * - `order` / `marginBars` — a component chooses between a constant and an affine surface exactly as
 *   the global fit does, and `ramp.ts` refuses to read a ramp off an order-0 fit. Without it every
 *   component would be read as a ramp.
 * - `claim` / `weights` — the support as a per-pixel object, which is what the views hand to
 *   `ramp.ts` and `overlay.ts`. `supportMass` alone cannot be restricted-to.
 * - `supportPixels` / `supportFraction` — the *extensive* test and its report.
 * - `coreFraction` — the *smooth* test (see `fieldfit.ts`, `SMOOTH` provenance).
 * - `depth` / `seed` / `residualScale` — provenance of the recursion, for diagnostics only.
 */
export type FieldComponent = Readonly<{
	/** Recursion level that produced it, 0 for the first fit over the whole image. */
	depth: number
	/** 0 = constant surface, 1 = affine. Same model selection as the global fit. */
	order: 0 | 1
	/** Row-major 3×3, `[intercept, coefX, coefY]` per OKLab channel — `FieldFit`'s layout. */
	coefficients: Float64Array
	/** The component's surface at a normalized position. */
	fieldAt(x: number, y: number): OkLab
	/** 1 where the component claims (explains) the pixel, 0 elsewhere. Row-major, full resolution. */
	claim: Uint8Array
	/** Tukey weight in [0, 1] inside the claim, exactly 0 outside it. Row-major, full resolution. */
	weights: Float32Array
	/** Σ weight over the claim — the soft "support mass". */
	supportMass: number
	/** |claim|. */
	supportPixels: number
	/** |claim| / pixels — the quantity the *extensive* test reads. */
	supportFraction: number
	/**
	 * Fraction of the claim the component explains at 4×bar. **1 by construction** (the claim *is*
	 * the explained set); published because `E2_BRIEF.md` names it and a reader should be able to see
	 * that it is an identity here rather than a measurement.
	 */
	explainedFractionOwn: number
	/** Fraction of the claim inside the weight-inlier core (w > 0.5) — the *smooth* test. */
	coreFraction: number
	/** Weight-weighted mean normalized position of the claim. */
	meanX: number
	meanY: number
	/** σ̂ over the domain the component was fitted on (OKLab norm units). Diagnostics only. */
	residualScale: number
	/** Robust-RMS improvement of order 1 over order 0 on this component's domain, in pooled bars. */
	marginBars: number
	/** The colour the level's IRLS was started from. Diagnostics only. */
	seed: OkLab
	/** Both gates, recorded so a rejected attempt says which one it failed. */
	extensive: boolean
	smooth: boolean
	/**
	 * SPEC decision 15's shape measurements over this component's claim, or `null` for a level that
	 * never reached the ink test (not extensive, or the whole recursion never ran). Filled by
	 * `fitFieldComponents` after the pool is known, because the ground the adjacency is measured
	 * against is *the other components*.
	 */
	ink: InkStatistics | null
	/** SPEC decision 15a's verdict: true ⇒ this component may not carry the field. */
	inkLike: boolean
}>

/**
 * The component pool and how it was arrived at.
 *
 * `components` holds only the accepted ones, ordered by support (descending, ties on support mass
 * then on the seed's packed integer): `components[0]` carries the background and the gradient,
 * `components[1]` is the two-component reading's surface candidate. `attempts` holds every level
 * that was fitted, accepted or not, so a report can say *why* a cover retreated.
 */
export type FieldReading = Readonly<{
	components: readonly FieldComponent[]
	attempts: readonly FieldComponent[]
	/** True when the loop stopped because the depth cap was reached rather than because it ran dry. */
	depthCapReached: boolean
	/** True when no component qualified — the declared retreat, and the only route to it. */
	retreat: boolean
	/** Per-pixel accepted-component index + 1; 0 = claimed by nothing (overlay). */
	labels: Uint8Array
}>

// ---------------------------------------------------------------------------------------------
// SPEC decision 15a — the field-candidacy veto's own thresholds
// ---------------------------------------------------------------------------------------------
//
// **The polarity of the adjacency conjunct differs between the two sites, and it was measured, not
// chosen.** Arm-e-r3's ink is high-mortality *and* high-ground-adjacency because an ink sits on the
// arm's single fitted ground. A P5 *component candidate* is not measured against a ground — it is
// the thing competing to be one — and the round-3 batch says so unambiguously (twelve extensive
// components, ground = the other components' claims):
//
// | component | mortality | ground adjacency | reviewer |
// |---|---|---|---|
// | item 6 depth 0 — `HiROQUEST 3` display type + frame | **0.99** | **0.02** | UNACCEPTABLE, "not the gradient but the main typography color" |
// | item 1 depth 0 / 1 — painted autumn sky, its landscape | 0.98 / 1.00 | 0.23 / 0.31 | acceptable, field kept |
// | item 3 depth 1 — second block | 0.67 | 0.16 | acceptable |
// | item 7 depth 0 — the fence-and-halo field | 0.63 | 0.00 | **strong** |
// | item 2 depth 0/1/2, item 3 depth 0/2, item 5 depth 0/1/2 | 0.13–0.61 | 0.00–0.89 | acceptable/strong |
//
// A ground **tiles** with the other grounds; an ink layer **floats** over material no surface
// explains. So the veto's conjunction is *thin* AND *floating*, and it is a conjunction of two
// thresholds — never a blend. Under arm-e's literal both-high reading the veto is unreachable on its
// own evidence cover (item 6 sits at adjacency 0.02), and the mortality conjunct alone cannot carry
// it: item 1's sky, which must keep its field, measures 0.98–1.00.

/**
 * The mortality a component's claim must reach to be called ink-shaped.
 *
 * `[UNCALIBRATED]`, bracketed by the round-3 batch: among the components the adjacency conjunct does
 * not already spare (those below `COMPONENT_INK_GROUND_ADJACENCY_MAX`), the reviewer-refuted one
 * measures **0.99** and the highest reviewer-accepted one **0.67** (item 3 depth 1; item 7's STRONG
 * field is next at 0.63). Every value in (0.67, 0.99) honours all current evidence; 0.85 is chosen
 * inside it — 1.27× the largest accepted, 0.86× the refuted one.
 */
export const COMPONENT_INK_MORTALITY = 0.85

/**
 * The ground adjacency a component's claim must stay **below** to be called floating.
 *
 * `[UNCALIBRATED]`, bracketed the same way: item 6's ink measures **0.02**, and the two components
 * that must keep their fields at high mortality (item 1's sky at 0.98 and its landscape at 1.00)
 * measure **0.23** and **0.31**. Every value in (0.02, 0.23) honours the evidence; 0.10 is chosen
 * inside it — 5× the ink's, 0.43× the nearest field's.
 */
export const COMPONENT_INK_GROUND_ADJACENCY_MAX = 0.10

/** SPEC decision 15a's verdict on one component: ink-shaped ⇒ it may not carry the field. */
export function componentIsInkLike(ink: InkStatistics): boolean {
	return ink.erosionMortality >= COMPONENT_INK_MORTALITY &&
		ink.groundAdjacency < COMPONENT_INK_GROUND_ADJACENCY_MAX
}

/**
 * A `FieldFit` view of one component, for `ramp.ts`.
 *
 * `noField` is false: a component explains its own support in the contract's units by construction,
 * which is precisely the question `noField` asks. `fieldExplainedFraction` is the component's share
 * of the image (what it explains, over everything), so the number keeps its meaning — "how much of
 * the image this field explains" — at component scale.
 */
export function componentFieldFit(component: FieldComponent, raster: DecodedRaster): FieldFit {
	const pixelCount = raster.width * raster.height
	let inliers = 0
	for (let index = 0; index < pixelCount; index += 1) {
		if (component.weights[index] > 0.5) inliers += 1
	}
	return {
		order: component.order,
		coefficients: component.coefficients,
		fieldAt: component.fieldAt,
		weights: component.weights,
		inlierFraction: pixelCount > 0 ? inliers / pixelCount : 0,
		fieldExplainedFraction: component.supportFraction,
		residualScale: component.residualScale,
		marginBars: component.marginBars,
		noField: false,
	}
}

/**
 * A `FieldFit` view of the whole pool, for `overlay.ts`.
 *
 * - `weights` — the claiming component's weight, or 0 where nothing claims. A pixel no field-like
 *   component explains is overlay, which is what `Σ(1 − w)` then measures.
 * - `fieldAt` — the surface of the component whose support the position sits in, falling back to the
 *   most extensive component off-support. This is the "local field" arm-f asks overlay to measure
 *   departure from; the affine `fieldAt` it used before is the one-component case of it.
 *
 * The position→pixel inversion is the exact inverse of `decode.ts`'s pixel-centre convention, so a
 * cluster's mean position lands on the pixel the convention says it is inside.
 */
export function compositeFieldFit(
	reading: FieldReading,
	raster: DecodedRaster,
	base: FieldFit,
): FieldFit {
	const { width, height } = raster
	const pixelCount = width * height
	const primary = reading.components[0]
	if (primary === undefined) return base

	const weights = new Float32Array(pixelCount)
	for (const component of reading.components) {
		for (let index = 0; index < pixelCount; index += 1) {
			const weight = component.weights[index]
			if (weight > weights[index]) weights[index] = weight
		}
	}

	let inliers = 0
	let supportMass = 0
	for (let index = 0; index < pixelCount; index += 1) {
		supportMass += weights[index]
		if (weights[index] > 0.5) inliers += 1
	}

	const labels = reading.labels
	const components = reading.components
	const fieldAt = (x: number, y: number): OkLab => {
		const column = pixelIndexOnAxis(x, width)
		const row = pixelIndexOnAxis(y, height)
		const label = labels[row * width + column]
		const component = label === 0 ? primary : components[label - 1] ?? primary
		return component.fieldAt(x, y)
	}

	let explained = 0
	for (const component of components) explained += component.supportFraction

	return {
		order: primary.order,
		coefficients: primary.coefficients,
		fieldAt,
		weights,
		inlierFraction: pixelCount > 0 ? inliers / pixelCount : 0,
		fieldExplainedFraction: Math.min(1, explained),
		residualScale: primary.residualScale,
		marginBars: primary.marginBars,
		noField: false,
	}
}

/**
 * A `FieldFit` view of the global fit with every **ink-vetoed** component's claim removed from the
 * field — the third view, and the one that makes SPEC decision 15a's "it stays in the pool as
 * overlay material" literally true on the retreat path.
 *
 * Without it the veto is half a rule. On a cover whose only extensive component is ink-shaped
 * (round-3 item 6) the pool empties, decision 9's retreat fires, and the retreat ranks field mass on
 * *the global fit's* weights — which on a cover with no field are near 1 everywhere, so the ink's own
 * colour walks straight back in as the background through a different door. Zeroing the weights
 * inside the vetoed claims says the one thing the veto exists to say — this colour is not field — in
 * the only units the retreat and the overlay both read.
 *
 * A view, not a decision: no threshold, no ranking, no new number. `weights` is the only field that
 * changes; `noField`, the coefficients and `fieldAt` are the global fit's, unchanged, because what
 * was fitted did not change — only what counts as field did.
 */
export function fieldFitWithoutInk(base: FieldFit, reading: FieldReading, raster: DecodedRaster): FieldFit {
	const pixelCount = raster.width * raster.height
	const vetoed = reading.attempts.filter((component) => component.inkLike)
	if (vetoed.length === 0) return base

	const weights = new Float32Array(pixelCount)
	weights.set(base.weights.subarray(0, pixelCount))
	for (const component of vetoed) {
		for (let index = 0; index < pixelCount; index += 1) {
			if (component.claim[index] === 1) weights[index] = 0
		}
	}

	let inliers = 0
	for (let index = 0; index < pixelCount; index += 1) if (weights[index] > 0.5) inliers += 1

	return {
		...base,
		weights,
		inlierFraction: pixelCount > 0 ? inliers / pixelCount : 0,
	}
}

/**
 * Inverse of `decode.ts`'s `(2i + 1)/n − 1`, clamped to the raster. Exported for the tests that pin
 * the round trip; the convention lives in W-CORE's module and this is only its inverse.
 */
export function pixelIndexOnAxis(position: number, size: number): number {
	const index = Math.floor(((position + 1) * size - 1) / 2 + 0.5)
	if (index < 0) return 0
	if (index >= size) return size - 1
	return index
}

/** The normalized centre of a pixel, re-exported so callers need not reach into `decode.ts`. */
export function componentCentre(component: FieldComponent): OkLab {
	return component.fieldAt(component.meanX, component.meanY)
}

// `normalizedX` / `normalizedY` are imported so this module and `decode.ts` cannot drift apart on
// the convention `pixelIndexOnAxis` inverts; the test file asserts the round trip on both axes.
export { normalizedX, normalizedY }
