/**
 * # The support code — what it costs to say *where* a named colour is
 *
 * Arm A′ §2.5, and this is the sentence the whole file implements:
 *
 * > *"The support of a field role is broad and low-frequency and is cheap under a coarse support
 * > code; the support of an ink role is stroke-like — small area, long boundary per unit area — and
 * > is cheap under an edge/run code. Assigning a colour to a field role or an ink role therefore
 * > changes L(pixels | P) directly. **No separate classifier exists.**"*
 *
 * Arm A′ has **no extent statistic** — that device belongs to arm A, which uses the dyadic ladder's
 * `e(p)` and a logistic split scale. Arm A′'s field/ink separation is supposed to come out of the
 * codes themselves. So this file gives every triple two prices for its own support map, one under
 * each code, and `index.ts` lets the cheaper total decide. A triple that fills a broad region solidly
 * is cheap under the coarse code and dear under the chain code; a triple scattered thinly across a
 * wide footprint is the other way round. That *is* the split.
 *
 * ## The one statistic both codes read
 *
 * The `Measurement` carries, per triple, an exact pixel count and exact spatial second moments
 * (`derived.covXX/covXY/covYY`, normalised to the short edge). From those:
 *
 * - **footprint area** `A_foot = 4π·sqrt(det Σ)` — the area of the uniform disc with the same
 *   covariance (see `FOOTPRINT_AREA_FACTOR`). Σ is regularised by the pixel's own second moment so a
 *   one-pixel or one-row support has a real footprint rather than a zero determinant.
 * - **fill ratio** `φ = A_triple / A_foot`, clamped to `(0, 1]`, where `A_triple` is the triple's
 *   pixel count in the same normalised units. `φ ≈ 1` means "this colour fills the region it
 *   occupies"; `φ ≪ 1` means "this colour is sprinkled across a much larger region than it covers".
 *
 * ## The coarse (field) code
 *
 * Two parts, both standard:
 *
 * 1. **Locate the footprint** — `log₂(A_image / A_foot)` bits, once for the whole support: which of
 *    the `A_image / A_foot` footprint-sized slots of the image it sits in. Clamped at 0, because a
 *    footprint as large as the image costs nothing to find.
 * 2. **Fill it** — the mask inside the footprint is coded as i.i.d. Bernoulli(φ), so `H₂(φ)` bits per
 *    *footprint* pixel, and there are `A_foot / A_triple = 1/φ` footprint pixels per on-pixel.
 *
 * Per on-pixel: `locate / n(c) + H₂(φ)/φ`. At `φ = 1` (a solid blob) the fill term is exactly 0 and
 * the locate term is amortised over the whole blob — a broad field costs essentially nothing to
 * place. At `φ = 0.1` the fill term is 4.69 bits per on-pixel.
 *
 * ## The edge/run (ink) code
 *
 * A mark is coded as a chain: locate one start pixel (`log₂ N` bits) and then walk it, one
 * 8-direction step per on-pixel (`CHAIN_CODE_DIRECTION_BITS` = 3 bits each). Per on-pixel:
 * `log₂(N) / n(c) + 3`. Flat in the triple's shape and cheap only because a mark is *small*: 3 bits
 * per pixel is catastrophic for a background and negligible in total for eighty pixels of signature
 * red.
 *
 * The two codes cross at `H₂(φ)/φ = 3`, i.e. **φ ≈ 0.29**: a triple filling less than about three
 * tenths of its own covariance footprint is stroke-like and prices as ink. Nobody chose 0.29; it is
 * where `log₂ 8` meets the Bernoulli mask code.
 *
 * ## What this is an approximation of, and the upgrade path
 *
 * It is an approximation of the true support-map code, and it is stated as one because the
 * approximation has a direction and a known blind spot.
 *
 * - **What it gets right.** Scattered, multi-stroke ink — text, a logo, a subtitle line, a scatter of
 *   highlights — has a wide covariance footprint and a small area, so `φ` is small and the chain code
 *   wins. Broad solid areas have `φ` near 1 and the coarse code wins. Those are the two cases arm A′
 *   §2.5 names.
 * - **What it gets wrong.** A **single straight** one-pixel mark has a thin covariance footprint that
 *   the mark itself fills, so `φ ≈ 1` and the coarse code prices it as if it were a solid region. The
 *   covariance cannot see boundary-length-per-unit-area for a single connected stroke; only a pixel
 *   pass can.
 * - **The upgrade path, named.** True run-length or chain coding needs the *actual* mask — run
 *   lengths, run counts, boundary length — which the `Measurement` does not carry and cannot derive
 *   from second moments. The upgrade is one extra per-triple accumulator in `src/measure/triples.ts`:
 *   the number of horizontal runs `R(c)` (increment when the previous pixel in the scanline is a
 *   different triple), which is exact, integer, order-free within a scanline, and costs nothing on
 *   top of the pass that is already there. With `R(c)` the chain code becomes
 *   `(log₂ N + run-header bits) · R(c) / n(c) + 3` and the coarse code can charge a real boundary
 *   term. **That measurement change is out of this worker's owned paths**, so it is written here as
 *   the named successor rather than done.
 *
 * ## Scale
 *
 * `φ`, `A_foot` and `A_image` are all scale-free (normalised to the short edge). The two locate terms
 * are the only pixel-scale quantities, they enter as `O(log N / n(c))`, and they vanish under
 * refinement — a support map is inherently a statement about pixels, and this is the smallest
 * pixel-scale footprint that admits one.
 */

import type { Measurement } from "../../measure/types.ts"
import {
	CHAIN_CODE_DIRECTION_BITS,
	FOOTPRINT_AREA_FACTOR,
	PIXEL_SECOND_MOMENT,
} from "./constants.ts"

/** Per-triple support prices and the statistic behind them, all in the triple table's canonical order. */
export type SupportCodes = Readonly<{
	/** `A_foot`, normalised area units (short edge = 1). Never below one pixel. */
	footprintArea: Float64Array
	/** `φ ∈ (0, 1]`. */
	fillRatio: Float64Array
	/** Bits per on-pixel under the coarse code. Charged to triples the field explains. */
	coarseBitsPerPixel: Float64Array
	/** Bits per on-pixel under the chain code. Charged to triples the ink explains. */
	chainBitsPerPixel: Float64Array
}>

/** `H₂(φ) = −φ log₂ φ − (1−φ) log₂(1−φ)`, with both endpoints exactly 0. */
export function binaryEntropyBits(probability: number): number {
	if (probability <= 0 || probability >= 1) return 0
	return (
		-probability * Math.log2(probability) - (1 - probability) * Math.log2(1 - probability)
	)
}

/**
 * Price every triple's support under both codes.
 *
 * Pure and total: reads only the measurement, allocates its own arrays, and returns finite numbers
 * for every triple of every image the measurement layer accepts.
 */
export function computeSupportCodes(measurement: Measurement): SupportCodes {
	const { colorCount, counts, pixelCount } = measurement.triples
	const { covXX, covXY, covYY } = measurement.derived
	const shortEdge = measurement.source.shortEdge

	// Normalised area of one pixel, and of the whole frame, in the same units the covariances are in.
	const pixelArea = 1 / (shortEdge * shortEdge)
	const imageArea = measurement.source.width * measurement.source.height * pixelArea
	// The pixel's own second moment, in normalised units: (1/12) px² × (1 px² = pixelArea).
	const regulariser = PIXEL_SECOND_MOMENT * pixelArea
	// One start position for the chain, located to pixel resolution.
	const chainStartBits = pixelCount > 0 ? Math.log2(pixelCount) : 0

	const footprintArea = new Float64Array(colorCount)
	const fillRatio = new Float64Array(colorCount)
	const coarseBitsPerPixel = new Float64Array(colorCount)
	const chainBitsPerPixel = new Float64Array(colorCount)

	for (let row = 0; row < colorCount; row += 1) {
		const xx = covXX[row] + regulariser
		const yy = covYY[row] + regulariser
		const xy = covXY[row]
		// `max(0, ·)` only guards float cancellation; the regularised form is positive definite.
		const determinant = Math.max(0, xx * yy - xy * xy)
		// A footprint can never be smaller than the one pixel that is certainly in it.
		const footprint = Math.max(FOOTPRINT_AREA_FACTOR * Math.sqrt(determinant), pixelArea)
		const area = counts[row] * pixelArea
		const fill = footprint > 0 ? Math.min(1, area / footprint) : 1

		footprintArea[row] = footprint
		fillRatio[row] = fill

		const locateBits = Math.max(0, Math.log2(imageArea / footprint))
		const count = counts[row] > 0 ? counts[row] : 1
		coarseBitsPerPixel[row] = locateBits / count + binaryEntropyBits(fill) / fill
		chainBitsPerPixel[row] = chainStartBits / count + CHAIN_CODE_DIRECTION_BITS
	}

	return { footprintArea, fillRatio, coarseBitsPerPixel, chainBitsPerPixel }
}
