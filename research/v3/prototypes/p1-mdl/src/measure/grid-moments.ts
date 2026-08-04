/**
 * Whole-image **spatial** moments, in closed form.
 *
 * The pixels of an undamaged raster are exactly the product grid `{0..W-1} × {0..H-1}`, so every
 * pure-position moment factorises:
 *
 *     Σ_p x^k y^l  =  (Σ_{x=0}^{W-1} x^k) · (Σ_{y=0}^{H-1} y^l)
 *
 * That matters for one specific reason. The radial geometry's design matrix contains `x² + y²`, so
 * its normal equations need spatial moments of order 3 and 4 — which would overflow float64's exact
 * integer range on any real image if they were accumulated pixel by pixel, and which would have had
 * to be carried per triple to be accumulated at all. They do not need to be: they are analytic, they
 * are computed here with `BigInt` power sums so the integer stage is exact at any image size, and the
 * only inexactness is the single conversion to float64 at the end (relative error 2^-53).
 *
 * The per-triple table therefore stays at exactly what arm A′ §2.1 specifies — count and the five
 * second-order moments — and the radial fit still comes out of one pass over pixels.
 *
 * All moments are returned in coordinates **normalised to the short edge**, which is the scale-free
 * convention `PHASE_0_DECISIONS.md` §1 requires.
 */

/** Exact `Σ_{i=0}^{n-1} i^k`. */
function powerSum(n: number, exponent: number): bigint {
	let total = 0n
	for (let index = 0n; index < BigInt(n); index += 1n) {
		total += index ** BigInt(exponent)
	}
	return total
}

/** Normalised whole-image spatial moments up to total order 4. */
export type GridMoments = Readonly<{
	width: number
	height: number
	shortEdge: number
	pixelCount: number
	/** `moment(k, l)` = `Σ_p x̂^k ŷ^l`, with `x̂ = x / shortEdge`. */
	moment: (kx: number, ky: number) => number
}>

const MAX_ORDER = 4

export function computeGridMoments(width: number, height: number): GridMoments {
	const shortEdge = Math.min(width, height)
	const xSums: number[] = []
	const ySums: number[] = []
	for (let exponent = 0; exponent <= MAX_ORDER; exponent += 1) {
		xSums.push(Number(powerSum(width, exponent)))
		ySums.push(Number(powerSum(height, exponent)))
	}

	const cache = new Map<number, number>()
	const moment = (kx: number, ky: number): number => {
		if (kx < 0 || ky < 0 || kx > MAX_ORDER || ky > MAX_ORDER) {
			throw new RangeError(`grid moment order (${kx}, ${ky}) is outside the supported range`)
		}
		const key = kx * (MAX_ORDER + 1) + ky
		const cached = cache.get(key)
		if (cached !== undefined) return cached
		const value = (xSums[kx] * ySums[ky]) / shortEdge ** (kx + ky)
		cache.set(key, value)
		return value
	}

	return { width, height, shortEdge, pixelCount: width * height, moment }
}
