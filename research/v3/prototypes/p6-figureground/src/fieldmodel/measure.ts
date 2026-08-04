/**
 * Φ — the field-like mass — and the two models fitted to it.
 *
 * `arm-e-prime.md` §2.3: *"Restrict attention to field-like mass: pixels whose displacement is
 * small at every scale. Their colours form an area-weighted measure Φ on OKLab, and the gradient
 * question is a question about Φ's dimension."*
 *
 * This file computes Φ's moments, its leading direction, the regression of position-along-segment
 * against image coordinates, and the quantile ends of the segment. It decides nothing: the
 * description lengths are assembled in `index.ts`, and the field decision itself belongs to the
 * energy (§2.5).
 *
 * **Determinism (SPEC rule 1).** Fixed reduction order (row-major, `y` outer, `x` inner), fixed
 * iteration counts, no tolerance-terminated loops, no reads of anything but the pixel values and
 * the field weights.
 */

import type { OkLab } from "../../../../src/contract/types.ts"
import type { Substrate } from "../types.ts"
import {
	FIELD_END_QUANTILE,
	FIELD_MASS_EPSILON,
	FIELD_T_HISTOGRAM_BINS,
	FIELD_T_HISTOGRAM_SIGMAS,
	JACOBI_SWEEPS,
} from "./constants.ts"

/**
 * Φ's moments and the fitted 1-D structure. Everything is mass-weighted; nothing is a pixel count,
 * per `CONVENTIONS.md`'s scale-free rule.
 */
export type FieldMeasure = Readonly<{
	/** Total field mass, as a fraction of frame area. 1.0 = every pixel is fully field-like. */
	massFraction: number
	/** Whether the field-weight plane carried any mass at all (see `measureFieldMass`). */
	weighted: boolean
	/** Mass-weighted mean colour of Φ. */
	mean: OkLab
	/** Mass-weighted colour covariance, as [LL, La, Lb, aa, ab, bb]. */
	covariance: readonly [number, number, number, number, number, number]
	/** Φ's leading eigenvector, unit length, sign fixed deterministically. */
	direction: OkLab
	/** Variance of Φ along `direction` — the leading eigenvalue, and the variance of `t`. */
	leadingVariance: number
	/** Trace of the covariance: the 0-D model's residual variance about `mean`. */
	totalVariance: number
	/** Weighted least-squares slopes of `t` against the normalised image coordinates. */
	slopeU: number
	slopeV: number
	/** Variance of `t` explained by that regression. */
	explainedVariance: number
	/** `explainedVariance / leadingVariance`, clamped to [0,1]. */
	rSquared: number
	/** The 1-D model's residual variance: `totalVariance − leadingVariance × rSquared`. */
	residualVariance1D: number
	/** Trimmed ends of the segment in `t`, low first. Both zero when Φ has no measurable extent. */
	tLow: number
	tHigh: number
	/**
	 * Sign of the fitted increase of `t` toward the bottom-right. Positive means `t` grows away from
	 * the top-left, so the **low** end of the segment sits toward the top-left; negative means the
	 * high end does; exactly zero means the regression found no 135° component at all.
	 */
	towardBottomRight: number
}>

function lerpComponent(from: number, to: number, u: number): number {
	return from + (to - from) * u
}

/** Componentwise linear interpolation in OKLab — the space the renderer interpolates in. */
export function lerpOkLab(from: OkLab, to: OkLab, u: number): OkLab {
	return [
		lerpComponent(from[0], to[0], u),
		lerpComponent(from[1], to[1], u),
		lerpComponent(from[2], to[2], u),
	]
}

/**
 * Symmetric 3×3 eigendecomposition by cyclic Jacobi, at a fixed sweep count.
 *
 * Returns eigenvalues descending with their eigenvectors. Exposed for the test's independent
 * re-derivation.
 */
export function jacobiEigen(
	covariance: readonly [number, number, number, number, number, number],
): Readonly<{ values: readonly number[]; vectors: readonly OkLab[] }> {
	const a = [
		[covariance[0], covariance[1], covariance[2]],
		[covariance[1], covariance[3], covariance[4]],
		[covariance[2], covariance[4], covariance[5]],
	]
	const v = [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	]
	const pairs: readonly (readonly [number, number])[] = [
		[0, 1],
		[0, 2],
		[1, 2],
	]

	for (let sweep = 0; sweep < JACOBI_SWEEPS; sweep++) {
		for (const [p, q] of pairs) {
			const apq = a[p][q]
			if (apq === 0) continue
			const theta = (a[q][q] - a[p][p]) / (2 * apq)
			const sign = theta >= 0 ? 1 : -1
			const t = sign / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
			const c = 1 / Math.sqrt(t * t + 1)
			const s = t * c

			for (let k = 0; k < 3; k++) {
				const akp = a[k][p]
				const akq = a[k][q]
				a[k][p] = c * akp - s * akq
				a[k][q] = s * akp + c * akq
			}
			for (let k = 0; k < 3; k++) {
				const apk = a[p][k]
				const aqk = a[q][k]
				a[p][k] = c * apk - s * aqk
				a[q][k] = s * apk + c * aqk
			}
			for (let k = 0; k < 3; k++) {
				const vkp = v[k][p]
				const vkq = v[k][q]
				v[k][p] = c * vkp - s * vkq
				v[k][q] = s * vkp + c * vkq
			}
		}
	}

	const order = [0, 1, 2].sort((first, second) => {
		const difference = a[second][second] - a[first][first]
		// Descending by eigenvalue; exact ties keep the original axis order, which is deterministic.
		return difference !== 0 ? difference : first - second
	})

	return {
		values: order.map((index) => a[index][index]),
		vectors: order.map((index) => fixSign([v[0][index], v[1][index], v[2][index]])),
	}
}

/**
 * Deterministic sign convention for an eigenvector: the component of largest magnitude is made
 * positive, ties resolved toward the earlier axis (L, then a, then b). Only labels change — which
 * end of the segment is background is decided by the spatial regression, not by this.
 */
function fixSign(vector: OkLab): OkLab {
	let leading = 0
	for (let index = 1; index < 3; index++) {
		if (Math.abs(vector[index]) > Math.abs(vector[leading])) leading = index
	}
	if (vector[leading] < 0) return [-vector[0], -vector[1], -vector[2]]
	return [vector[0], vector[1], vector[2]]
}

/**
 * Accumulate Φ and fit both models' shared structure.
 *
 * Three sweeps of the pixel array: means, then centred second moments (colour, colour×position and
 * position), then a weighted histogram of `t`. All in `y`-outer, `x`-inner order.
 *
 * **Degenerate input.** When the field-weight plane carries no mass at all — nothing in the artwork
 * is its own surround at every scale — Φ would be empty and there would be no field hypothesis to
 * offer the energy. Rather than refuse, this falls back to unit weights (Φ becomes the whole image)
 * and reports `weighted: false`, so a caller can see that the restriction did no work.
 */
export function measureFieldMass(substrate: Substrate): FieldMeasure {
	const { width, height, L, a, b } = substrate.planes
	const pixels = width * height
	if (!Number.isInteger(width) || !Number.isInteger(height) || pixels <= 0) {
		throw new RangeError(`field model needs a non-empty image, got ${width}×${height}`)
	}
	if (L.length < pixels || a.length < pixels || b.length < pixels) {
		throw new RangeError("OKLab planes are shorter than width × height")
	}

	const rawWeights = substrate.figureGround.fieldWeight
	if (rawWeights.length < pixels) throw new RangeError("fieldWeight is shorter than width × height")

	let mass = 0
	for (let index = 0; index < pixels; index++) {
		const weight = rawWeights[index]
		if (weight > 0 && Number.isFinite(weight)) mass += weight
	}
	const weighted = mass > FIELD_MASS_EPSILON
	const weightAt = (index: number): number => {
		if (!weighted) return 1
		const weight = rawWeights[index]
		return weight > 0 && Number.isFinite(weight) ? weight : 0
	}
	const totalWeight = weighted ? mass : pixels

	// Pass 1 — means.
	let sumL = 0
	let sumA = 0
	let sumB = 0
	let sumU = 0
	let sumV = 0
	for (let y = 0; y < height; y++) {
		const v = (y + 0.5) / height
		for (let x = 0; x < width; x++) {
			const index = y * width + x
			const weight = weightAt(index)
			if (weight === 0) continue
			sumL += weight * L[index]
			sumA += weight * a[index]
			sumB += weight * b[index]
			sumU += weight * ((x + 0.5) / width)
			sumV += weight * v
		}
	}
	const meanL = sumL / totalWeight
	const meanA = sumA / totalWeight
	const meanB = sumB / totalWeight
	const meanU = sumU / totalWeight
	const meanV = sumV / totalWeight

	// Pass 2 — centred second moments: colour, colour×position, position.
	let cLL = 0
	let cLa = 0
	let cLb = 0
	let cAA = 0
	let cAB = 0
	let cBB = 0
	let cLU = 0
	let cLV = 0
	let cAU = 0
	let cAV = 0
	let cBU = 0
	let cBV = 0
	let cUU = 0
	let cUV = 0
	let cVV = 0
	for (let y = 0; y < height; y++) {
		const dv = (y + 0.5) / height - meanV
		for (let x = 0; x < width; x++) {
			const index = y * width + x
			const weight = weightAt(index)
			if (weight === 0) continue
			const du = (x + 0.5) / width - meanU
			const dL = L[index] - meanL
			const dA = a[index] - meanA
			const dB = b[index] - meanB
			cLL += weight * dL * dL
			cLa += weight * dL * dA
			cLb += weight * dL * dB
			cAA += weight * dA * dA
			cAB += weight * dA * dB
			cBB += weight * dB * dB
			cLU += weight * dL * du
			cLV += weight * dL * dv
			cAU += weight * dA * du
			cAV += weight * dA * dv
			cBU += weight * dB * du
			cBV += weight * dB * dv
			cUU += weight * du * du
			cUV += weight * du * dv
			cVV += weight * dv * dv
		}
	}
	const covariance: [number, number, number, number, number, number] = [
		cLL / totalWeight,
		cLa / totalWeight,
		cLb / totalWeight,
		cAA / totalWeight,
		cAB / totalWeight,
		cBB / totalWeight,
	]
	cLU /= totalWeight
	cLV /= totalWeight
	cAU /= totalWeight
	cAV /= totalWeight
	cBU /= totalWeight
	cBV /= totalWeight
	cUU /= totalWeight
	cUV /= totalWeight
	cVV /= totalWeight

	const { values, vectors } = jacobiEigen(covariance)
	const direction = vectors[0]
	const leadingVariance = Math.max(0, values[0])
	const totalVariance = Math.max(0, covariance[0] + covariance[3] + covariance[5])

	// The spatial regression: t = (c − mean)·direction against the normalised image coordinates.
	const covTU = direction[0] * cLU + direction[1] * cAU + direction[2] * cBU
	const covTV = direction[0] * cLV + direction[1] * cAV + direction[2] * cBV
	const determinant = cUU * cVV - cUV * cUV
	let slopeU = 0
	let slopeV = 0
	// Well conditioned whenever the field mass has spatial extent in both axes. A field confined to
	// a single row or column (or a one-pixel-wide image) makes the 2×2 system singular; regressing
	// on the better-supported axis alone is the honest reading there.
	if (determinant > 1e-18 * (cUU * cVV + 1e-30)) {
		slopeU = (cVV * covTU - cUV * covTV) / determinant
		slopeV = (cUU * covTV - cUV * covTU) / determinant
	} else if (cUU >= cVV && cUU > 0) {
		slopeU = covTU / cUU
	} else if (cVV > 0) {
		slopeV = covTV / cVV
	}
	const explainedVariance = Math.max(0, slopeU * covTU + slopeV * covTV)
	const rSquared = leadingVariance > 0 ? Math.min(1, explainedVariance / leadingVariance) : 0
	const residualVariance1D = Math.max(0, totalVariance - leadingVariance * rSquared)

	// Pass 3 — the trimmed ends, from a weighted histogram of t over ±FIELD_T_HISTOGRAM_SIGMAS·σ.
	const sigma = Math.sqrt(leadingVariance)
	let tLow = 0
	let tHigh = 0
	if (sigma > 0) {
		const span = FIELD_T_HISTOGRAM_SIGMAS * sigma
		const binWidth = (2 * span) / FIELD_T_HISTOGRAM_BINS
		const histogram = new Float64Array(FIELD_T_HISTOGRAM_BINS)
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const index = y * width + x
				const weight = weightAt(index)
				if (weight === 0) continue
				const t = (L[index] - meanL) * direction[0] +
					(a[index] - meanA) * direction[1] +
					(b[index] - meanB) * direction[2]
				let bin = Math.floor((t + span) / binWidth)
				if (bin < 0) bin = 0
				if (bin >= FIELD_T_HISTOGRAM_BINS) bin = FIELD_T_HISTOGRAM_BINS - 1
				histogram[bin] += weight
			}
		}
		tLow = quantileOf(histogram, totalWeight, FIELD_END_QUANTILE, -span, binWidth)
		tHigh = quantileOf(histogram, totalWeight, 1 - FIELD_END_QUANTILE, -span, binWidth)
	}

	return {
		massFraction: totalWeight / pixels,
		weighted,
		mean: [meanL, meanA, meanB],
		covariance,
		direction,
		leadingVariance,
		totalVariance,
		slopeU,
		slopeV,
		explainedVariance,
		rSquared,
		residualVariance1D,
		tLow,
		tHigh,
		towardBottomRight: slopeU + slopeV,
	}
}

/**
 * The `quantile`-th mass point of a weighted histogram, interpolated inside the bin it lands in.
 *
 * The interpolation matters: without it the ends would snap to bin edges and a published stop would
 * move when a bin boundary did, which is exactly the quantisation instability this design exists to
 * remove.
 */
function quantileOf(
	histogram: Float64Array,
	totalWeight: number,
	quantile: number,
	origin: number,
	binWidth: number,
): number {
	const target = quantile * totalWeight
	let cumulative = 0
	for (let bin = 0; bin < histogram.length; bin++) {
		const weight = histogram[bin];
		if (cumulative + weight >= target && weight > 0) {
			return origin + binWidth * (bin + (target - cumulative) / weight)
		}
		cumulative += weight
	}
	return origin + binWidth * histogram.length
}
