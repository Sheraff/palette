/**
 * The two selection primitives (arm-d §2.2), plus the order-statistic plumbing they need.
 *
 * **Neither primitive can create a colour.** That is the whole of the discipline line at this level:
 *
 * - *Trimmed rank selection* takes a sub-population of pixels above a quantile of a scalar field.
 *   Quantiles, never extrema — an extremum is one pixel and usually a compression artifact.
 * - *The cascade pixel* turns a population into **one actual pixel** by iterated medians over L, then
 *   a, then b, restricting each time to the pixels attaining the median. It terminates on a pixel of
 *   the artwork, involves no floating-point accumulation, and is permutation-invariant.
 *
 * ## Permutation invariance, and the one place it needed help
 *
 * A lower median of a multiset is permutation-invariant, so the cascade's three restriction steps are.
 * The final step is not automatically so: if two *different* 8-bit triples happened to produce
 * bit-identical OKLab values, the surviving set would hold two pixels and "the first one" would depend
 * on scan order. So the tie is broken on the **lexicographically smallest 8-bit triple**, which is a
 * function of the multiset and of nothing else. Arm-d's claim that the ASCII-relabelling failure class
 * is *unreachable* rather than *fixed* only holds if that tie-break is intrinsic, so it is.
 *
 * ## The ruler, applied to planes
 *
 * `okLabDistance` in `src/contract/color.ts` is the one ruler and takes two tuples. The hot loops here
 * run tens of millions of times, and allocating a tuple per call is the difference between a candidate
 * that runs and one that does not — so `labDistance` below does the same arithmetic against two rows of
 * a Float64 plane. It is **checked against the contract's function at module load** (`assertRulerAgrees`)
 * rather than trusted, because a second ruler that drifted would be exactly the kind of quiet
 * divergence this project exists to not have.
 */

import { okLabDistance, rgbToOkLab } from "../../../src/contract/color.ts"

// ---------------------------------------------------------------------------------------------
// The ruler
// ---------------------------------------------------------------------------------------------

/** The one ruler, applied to two rows of an interleaved OKLab plane. Identical arithmetic to `okLabDistance`. */
export function labDistance(lab: Float64Array, first: number, second: number): number {
	const a = first * 3
	const b = second * 3
	return Math.hypot(lab[a] - lab[b], lab[a + 1] - lab[b + 1], lab[a + 2] - lab[b + 2])
}

/** The one ruler, from a row of a plane to a loose OKLab point. */
export function labDistanceToPoint(
	lab: Float64Array,
	index: number,
	l: number,
	a: number,
	b: number,
): number {
	const at = index * 3
	return Math.hypot(lab[at] - l, lab[at + 1] - a, lab[at + 2] - b)
}

/**
 * Prove, at load, that the plane-form ruler is the contract's ruler.
 *
 * Runs on a fixed handful of 8-bit triples: this is a statement about the arithmetic, which is either
 * the same expression or not, so a grid buys nothing a few pairs do not.
 */
function assertRulerAgrees(): void {
	const probes: [number, number, number][] = [
		[0, 0, 0],
		[255, 255, 255],
		[17, 34, 51],
		[200, 30, 90],
		[9, 9, 10],
	]
	const plane = new Float64Array(probes.length * 3)
	probes.forEach((rgb, index) => {
		const lab = rgbToOkLab(rgb)
		plane[index * 3] = lab[0]
		plane[index * 3 + 1] = lab[1]
		plane[index * 3 + 2] = lab[2]
	})
	for (let i = 0; i < probes.length; i += 1) {
		for (let j = 0; j < probes.length; j += 1) {
			const mine = labDistance(plane, i, j)
			const theirs = okLabDistance(rgbToOkLab(probes[i]), rgbToOkLab(probes[j]))
			if (mine !== theirs) {
				throw new Error(
					`p3-fields: the plane-form ruler disagrees with the contract's okLabDistance ` +
						`(${mine} vs ${theirs}); one of them has drifted`,
				)
			}
		}
	}
}

assertRulerAgrees()

// ---------------------------------------------------------------------------------------------
// Order statistics
// ---------------------------------------------------------------------------------------------

/**
 * The index into a sorted run of `n` values that holds the `q` quantile.
 *
 * Nearest-rank: `round(q · (n − 1))`, clamped. Stated because "the quantile" has half a dozen
 * definitions and every rank this pipeline redeems is redeemed against this one.
 */
export function quantileIndex(n: number, q: number): number {
	if (n <= 0) return 0
	return Math.min(n - 1, Math.max(0, Math.round(q * (n - 1))))
}

/**
 * Sort a set of pixel indices ascending by a scalar key.
 *
 * Ties break on the pixel index, which is a position and therefore intrinsic to the image — the sort is
 * a function of the set of pixels and not of the order they were handed over in.
 */
export function sortByKey(indices: Int32Array, key: (index: number) => number): Int32Array {
	const sorted = Int32Array.from(indices)
	const keys = new Float64Array(sorted.length)
	for (let i = 0; i < sorted.length; i += 1) keys[i] = key(sorted[i])
	// Index-into-keys sort: `Array.prototype.sort` on a plain array of positions, so the key is computed
	// once per element rather than once per comparison.
	const order = Array.from({ length: sorted.length }, (_unused, i) => i)
	order.sort((left, right) => {
		const difference = keys[left] - keys[right]
		if (difference !== 0) return difference < 0 ? -1 : 1
		return sorted[left] - sorted[right]
	})
	const out = new Int32Array(sorted.length)
	for (let i = 0; i < order.length; i += 1) out[i] = sorted[order[i]]
	return out
}

/**
 * The **trimmed rank sub-population**: the top `fraction` of a sorted ordering, stepped `step` windows
 * down it.
 *
 * `step = 0` is the top-τ population arm-d's §2.5 and §2.6 name. Each step moves down by one whole
 * window, which is what "step the rank — move to the next quantile in the same ordering" (§2.7) means
 * for a role selected as a sub-population rather than as a single rank.
 */
export function topWindow(sorted: Int32Array, fraction: number, step: number): Int32Array {
	const n = sorted.length
	if (n === 0) return new Int32Array(0)
	const size = Math.max(1, Math.ceil(fraction * n))
	const to = Math.max(size, n - step * size)
	const from = Math.max(0, to - size)
	return sorted.subarray(from, to)
}

// ---------------------------------------------------------------------------------------------
// The cascade pixel
// ---------------------------------------------------------------------------------------------

/**
 * Scratch buffers for `cascadePixel`. Module-level and grown on demand: the ink pass calls this once
 * per pixel of the depth band, and allocating three arrays per call there is the pipeline's single
 * largest avoidable cost. One module instance per worker thread, so there is no sharing.
 */
let scratchValues = new Float64Array(0)
let scratchSet = new Int32Array(0)
let scratchNext = new Int32Array(0)

function ensureScratch(size: number): void {
	if (scratchValues.length < size) {
		scratchValues = new Float64Array(size)
		scratchSet = new Int32Array(size)
		scratchNext = new Int32Array(size)
	}
}

/**
 * **The cascade pixel of a population.** Median of L, restrict to the pixels attaining it; median of a,
 * restrict; median of b, restrict; then the lexicographically smallest 8-bit triple among what is left.
 *
 * Returns a **pixel index of the artwork**, or −1 for an empty population. The "median" is the lower
 * median (`floor((n − 1) / 2)` of the sorted run) precisely so that it is a value some pixel *attains* —
 * an interpolated median would be a created number and, one step later, a created colour.
 *
 * `count` lets a caller pass a fixed-size scratch list with only its prefix meaningful.
 */
export function cascadePixel(
	population: Int32Array | readonly number[],
	count: number,
	lab: Float64Array,
	rgb: Uint8Array,
): number {
	if (count <= 0) return -1
	ensureScratch(count)
	let size = count
	for (let i = 0; i < count; i += 1) scratchSet[i] = population[i]

	for (let channel = 0; channel < 3; channel += 1) {
		for (let i = 0; i < size; i += 1) scratchValues[i] = lab[scratchSet[i] * 3 + channel]
		const run = scratchValues.subarray(0, size)
		const sorted = Float64Array.from(run).sort()
		const median = sorted[Math.floor((size - 1) / 2)]
		let kept = 0
		for (let i = 0; i < size; i += 1) {
			if (lab[scratchSet[i] * 3 + channel] === median) {
				scratchNext[kept] = scratchSet[i]
				kept += 1
			}
		}
		for (let i = 0; i < kept; i += 1) scratchSet[i] = scratchNext[i]
		size = kept
	}

	// The tie-break. See the module docstring: intrinsic to the colour, never to the scan order.
	let best = scratchSet[0]
	for (let i = 1; i < size; i += 1) {
		const candidate = scratchSet[i]
		const a = candidate * 3
		const b = best * 3
		if (
			rgb[a] < rgb[b] ||
			(rgb[a] === rgb[b] && (rgb[a + 1] < rgb[b + 1] ||
				(rgb[a + 1] === rgb[b + 1] && rgb[a + 2] < rgb[b + 2])))
		) best = candidate
	}
	return best
}

/**
 * The **spatial** cascade of a population: median x, restrict to attainers, median y, restrict, then
 * the smallest pixel index. Used for the radial member of §2.4's spatial dictionary.
 *
 * Positions are numbers attached to pixels, so this is the same primitive applied to a different scalar
 * pair; it publishes nothing and is never compared to a colour.
 */
export function spatialCascade(
	population: Int32Array,
	width: number,
	height: number,
): readonly [number, number] {
	if (population.length === 0) return [0.5, 0.5]
	let set = Int32Array.from(population)

	const xs = Float64Array.from(set, (index) => index % width).sort()
	const medianX = xs[Math.floor((set.length - 1) / 2)]
	set = set.filter((index) => index % width === medianX)

	const ys = Float64Array.from(set, (index) => Math.floor(index / width)).sort()
	const medianY = ys[Math.floor((set.length - 1) / 2)]

	return [medianX / width, medianY / height]
}

// ---------------------------------------------------------------------------------------------
// Rank correlation
// ---------------------------------------------------------------------------------------------

/**
 * Fractional ranks of a run of values, ties averaged. The input to a Spearman correlation.
 *
 * Average ranks rather than ordinal ones because a field with a large flat area has genuine ties, and
 * breaking them arbitrarily would make the correlation depend on the tie-break rather than on the field.
 */
export function averageRanks(values: Float64Array): Float64Array {
	const n = values.length
	const order = Array.from({ length: n }, (_unused, i) => i)
	order.sort((left, right) => {
		const difference = values[left] - values[right]
		if (difference !== 0) return difference < 0 ? -1 : 1
		return left - right
	})
	const ranks = new Float64Array(n)
	let i = 0
	while (i < n) {
		let j = i
		while (j + 1 < n && values[order[j + 1]] === values[order[i]]) j += 1
		const shared = (i + j) / 2
		for (let k = i; k <= j; k += 1) ranks[order[k]] = shared
		i = j + 1
	}
	return ranks
}

/**
 * **Spearman rank correlation** between two runs of equal length: Pearson on average ranks.
 *
 * No fit, no residual, no created colour, nothing a dither can move — arm-d §2.4's whole reason for
 * reaching for a rank correlation rather than a regression.
 */
export function spearman(first: Float64Array, second: Float64Array): number {
	return spearmanRanked(averageRanks(first), second)
}

/**
 * Spearman with the first side's ranks already computed.
 *
 * The dictionary in §2.4 correlates *one* t against six spatial parameterisations, and ranking t six
 * times is six sorts of the whole field set for one answer. Identical arithmetic to `spearman`.
 */
export function spearmanRanked(ranksFirst: Float64Array, second: Float64Array): number {
	const n = ranksFirst.length
	if (n < 2 || second.length !== n) return 0
	const a = ranksFirst
	const b = averageRanks(second)
	const mean = (n - 1) / 2
	let numerator = 0
	let sumA = 0
	let sumB = 0
	for (let i = 0; i < n; i += 1) {
		const da = a[i] - mean
		const db = b[i] - mean
		numerator += da * db
		sumA += da * da
		sumB += db * db
	}
	if (sumA === 0 || sumB === 0) return 0
	return numerator / Math.sqrt(sumA * sumB)
}
