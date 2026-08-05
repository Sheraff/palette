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
