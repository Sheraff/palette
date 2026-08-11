/**
 * The dyadic box-mean ladder and the extent statistic `e(p)`.
 *
 * Arm A §2.1, verbatim in intent: box means `Ī_s` at dyadic scales that are fractions of the short
 * edge, from summed-area tables; `δ_s(p)` is the OKLab distance between a pixel's colour and the box
 * mean at that scale; and
 *
 *     e(p) = Σ_s 2^-s · κ(δ_s(p))
 *
 * Plainly: `e(p)` is large when a pixel still represents its neighbourhood at **coarse** scales — the
 * interior of a large area — and small when it stops doing so above a stroke width, which is what
 * thin ink does. Rung 0 is therefore the *coarsest* box (the whole short edge) and carries the
 * largest weight; each rung halves the box and halves the weight.
 *
 * **A continuous number, never a classification.** Nothing here thresholds, and nothing here decides
 * membership: the split scale `s*` that turns `e` into a soft field/ink prior belongs to the energy,
 * where it is optimised jointly with everything else, not to the measurement.
 *
 * The statistic is aggregated per triple as a mass-weighted first and second moment, so a colour
 * that appears both as a large area and as a thin stroke reports a high variance rather than an
 * averaged-away middle.
 */

import { EXTENT_LADDER_SCALES, EXTENT_WEIGHT_SUM } from "./constants.ts"
import { bandwidthOf, kappa } from "./kernel.ts"
import type { TripleTable } from "./triples.ts"

/** One rung of the ladder, described in both pixel and scale-free terms. */
export type LadderScale = Readonly<{
	/** Rung index `s`; 0 is the coarsest. */
	scale: number
	/** Box side in pixels, `max(1, round(shortEdge / 2^s))`. */
	boxSidePixels: number
	/** The same side as a fraction of the short edge — the scale-free statement of the rung. */
	boxSideFraction: number
	/** The rung's weight in `e`, `2^-s`. */
	weight: number
}>

/** The extent profile: the ladder's description plus `e` aggregated per triple. */
export type ExtentProfile = Readonly<{
	scales: readonly LadderScale[]
	/** `Σ_s 2^-s`, the maximum `e` can take. Published so a consumer can normalise without re-deriving. */
	weightSum: number
	/** Σ e(p) over the pixels carrying each triple. */
	sumE: Float64Array
	/** Σ e(p)² over the pixels carrying each triple. */
	sumESquared: Float64Array
	/** Mass-weighted mean of `e` over the whole image. */
	imageMeanE: number
}>

function buildSummedAreaTables(
	table: TripleTable,
	pixelTripleIndex: Int32Array,
	width: number,
	height: number,
): readonly Float64Array[] {
	const stride = width + 1
	const tables = [
		new Float64Array(stride * (height + 1)),
		new Float64Array(stride * (height + 1)),
		new Float64Array(stride * (height + 1)),
	]
	for (let channel = 0; channel < 3; channel += 1) {
		const sat = tables[channel]
		for (let y = 0; y < height; y += 1) {
			const rowBase = (y + 1) * stride
			const previousBase = y * stride
			let rowRunning = 0
			for (let x = 0; x < width; x += 1) {
				rowRunning += table.lab[pixelTripleIndex[y * width + x] * 3 + channel]
				sat[rowBase + x + 1] = sat[previousBase + x + 1] + rowRunning
			}
		}
	}
	return tables
}

/**
 * Compute the ladder and the extent statistic.
 *
 * One traversal per pixel, eight box lookups inside it. The summed-area tables make each box mean
 * four reads regardless of the box's size, which is what keeps the coarsest rung — a box the size of
 * the whole short edge — the same cost as the finest.
 */
export function computeExtentProfile(
	table: TripleTable,
	pixelTripleIndex: Int32Array,
	width: number,
	height: number,
): ExtentProfile {
	const shortEdge = Math.min(width, height)
	const stride = width + 1
	const [satL, satA, satB] = buildSummedAreaTables(table, pixelTripleIndex, width, height)

	const scales: LadderScale[] = []
	for (let scale = 0; scale < EXTENT_LADDER_SCALES; scale += 1) {
		// A rung whose box would be smaller than a pixel is clamped to one pixel. There the box mean
		// *is* the pixel, so δ = 0 and κ = 1 exactly: the rung contributes its full weight and adds no
		// information. That is the honest behaviour for a tiny image, and it is why the weights are
		// published — a consumer that wants "how much of the ladder was informative" can see it.
		const boxSidePixels = Math.max(1, Math.round(shortEdge / 2 ** scale))
		scales.push({
			scale,
			boxSidePixels,
			boxSideFraction: boxSidePixels / shortEdge,
			weight: 2 ** -scale,
		})
	}

	// One region classification per distinct colour rather than per pixel per rung.
	const tripleBandwidth = new Float64Array(table.colorCount)
	for (let row = 0; row < table.colorCount; row += 1) {
		tripleBandwidth[row] = bandwidthOf([
			table.lab[row * 3],
			table.lab[row * 3 + 1],
			table.lab[row * 3 + 2],
		])
	}

	const sumE = new Float64Array(table.colorCount)
	const sumESquared = new Float64Array(table.colorCount)
	let totalE = 0

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const row = pixelTripleIndex[y * width + x]
			const base = row * 3
			const pixelL = table.lab[base]
			const pixelA = table.lab[base + 1]
			const pixelB = table.lab[base + 2]
			const pixelBandwidth = tripleBandwidth[row]

			let extent = 0
			for (let scale = 0; scale < scales.length; scale += 1) {
				const side = scales[scale].boxSidePixels
				const left = (side - 1) >> 1
				const right = side - 1 - left
				const x0 = x - left < 0 ? 0 : x - left
				const x1 = x + right > width - 1 ? width - 1 : x + right
				const y0 = y - left < 0 ? 0 : y - left
				const y1 = y + right > height - 1 ? height - 1 : y + right
				const area = (x1 - x0 + 1) * (y1 - y0 + 1)

				const bottomRight = (y1 + 1) * stride + (x1 + 1)
				const topRight = y0 * stride + (x1 + 1)
				const bottomLeft = (y1 + 1) * stride + x0
				const topLeft = y0 * stride + x0

				const meanL = (satL[bottomRight] - satL[topRight] - satL[bottomLeft] + satL[topLeft]) / area
				const meanA = (satA[bottomRight] - satA[topRight] - satA[bottomLeft] + satA[topLeft]) / area
				const meanB = (satB[bottomRight] - satB[topRight] - satB[bottomLeft] + satB[topLeft]) / area

				const deltaL = pixelL - meanL
				const deltaA = pixelA - meanA
				const deltaB = pixelB - meanB
				const distance = Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB)

				// The pair rule: the larger of the two colours' regional bars. The box mean is one of the
				// two colours here even though it is not an 8-bit pixel and never will be published.
				const meanBandwidth = bandwidthOf([meanL, meanA, meanB])
				const bandwidth = pixelBandwidth > meanBandwidth ? pixelBandwidth : meanBandwidth

				extent += scales[scale].weight * kappa(distance, bandwidth)
			}

			sumE[row] += extent
			sumESquared[row] += extent * extent
			totalE += extent
		}
	}

	return {
		scales,
		weightSum: EXTENT_WEIGHT_SUM,
		sumE,
		sumESquared,
		imageMeanE: table.pixelCount === 0 ? 0 : totalE / table.pixelCount,
	}
}
