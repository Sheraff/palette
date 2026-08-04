/**
 * The bar-scaled OKLab accumulator, and **the one representative rule** the SPEC fixes for both P2
 * pipelines.
 *
 * ## Why a region's representative is not its modal triple
 *
 * Arm-b §2.5, from the corpus: the median endorsed role colour occupies **8.89e-5** of its image as
 * an exact triple but **1.91e-2** as a same-colour-bar neighbourhood. Endorsed colours are *rare as
 * triples and dense as neighbourhoods*, so the most frequent exact pixel value is the wrong answer
 * and naive pixel-snapping (what the toy candidate does, and says not to copy) is the wrong
 * mechanism. The rule below is three steps and the SPEC pins all three:
 *
 *  1. **The density mode** — the OKLab location maximising the node's mass within one same-colour
 *     bar, found on a bar-scaled accumulator.
 *  2. **The bar-mode centroid** — the mean of the node's pixels within one bar of that location.
 *     Averaging over ~2% of a node's mass is what makes the answer immovable under a ±1 LSB dither;
 *     the peak of a sparse histogram is not.
 *  3. **The exact triple**: the colour actually present in the node nearest that centroid, ties
 *     broken lexicographically on RGB. Exact by construction, so invariant 2 holds without a snap.
 *
 * ## Discretisation, stated plainly
 *
 * Step 1 asks for an argmax over a continuum. This implementation searches the mass-weighted
 * centroids of the accumulator's **occupied cells** — a finite candidate set — and finds the true
 * best among them by branch and bound, never by sampling or iteration. The cell edge is
 * `OKLAB_ACCUMULATOR_STEP`, the *smallest* of the contract's four bars, so the grid resolves the
 * finest distinction the contract makes anywhere. Every distance test inside the search uses the
 * **pair's own regional bar** (`max` of the two regions' bars, exactly as `sameColorBar` decides
 * it) — the grid sets resolution, never a verdict.
 *
 * ## Determinism
 *
 * Colours are held in one array sorted by packed `r<<16|g<<8|b`, whose ascending order *is*
 * lexicographic RGB ascending. Every argmax breaks ties on that order, or on cell key, both of which
 * are functions of pixel values alone. The `Map` of cells is queried and never iterated; the cell
 * *list* used for the search is materialised in sorted key order.
 */

import {
	OKLAB_ACCUMULATOR_STEP,
	OKLAB_MAX_BAR,
} from "./constants.ts"
import { barOfRegionIndex, regionIndexOfLab, unpack } from "./decode.ts"
import type { DecodedImage } from "./decode.ts"
import type { OkLab, Rgb8 } from "../../../src/contract/types.ts"

/**
 * How many cells away a one-bar query from anywhere inside a cell can reach.
 *
 * Derived, not chosen. A point `p` inside cell `i` has `i·s ≤ p < (i+1)·s`, so a colour within `bar`
 * of it lies in cells `i - ceil(bar/s)` through `i + 1 + floor(bar/s)`. Both bounds are covered by
 * `floor(bar/s) + 1`, taking `bar` at its largest across the four regions.
 */
const CELL_SEARCH_RADIUS = Math.floor(OKLAB_MAX_BAR / OKLAB_ACCUMULATOR_STEP) + 1

/** Cell coordinates are offset into the non-negative range before packing into one number key. */
const CELL_KEY_OFFSET = 1024
const CELL_KEY_STRIDE = 2048

function cellIndex(value: number): number {
	return Math.floor(value / OKLAB_ACCUMULATOR_STEP)
}

function cellKey(li: number, ai: number, bi: number): number {
	return ((li + CELL_KEY_OFFSET) * CELL_KEY_STRIDE + (ai + CELL_KEY_OFFSET)) * CELL_KEY_STRIDE + (bi + CELL_KEY_OFFSET)
}

/**
 * A node's colour distribution, bucketed at bar scale.
 *
 * `counts` is pixel counts, so "mass" throughout is a pixel count and every ratio taken from it is
 * an area fraction — `CONVENTIONS.md`'s scale-free rule is satisfied at the point of use.
 */
export type Accumulator = Readonly<{
	/** Distinct colours in the node, packed, **ascending** — which is lexicographic RGB ascending. */
	colors: Int32Array
	/** Pixel count per colour. */
	counts: Float64Array
	/** OKLab per colour, three entries each. */
	lab: Float64Array
	/** The colour's own regional bar. */
	bar: Float64Array
	/** Which accumulator cell each colour sits in. */
	cellLi: Int32Array
	cellAi: Int32Array
	cellBi: Int32Array
	/** Cell key → indices into `colors`, in ascending colour order. Queried, never iterated. */
	cells: Map<number, number[]>
	/** Occupied cell keys, ascending. Materialised so the search order is a function of the data. */
	cellKeys: Float64Array
	/** Total pixels in the node. */
	totalMass: number
}>

/**
 * Build the accumulator for a slice of a pixel-index array.
 *
 * One pass over the pixels for the histogram, one sort of the distinct colours, one pass to bucket.
 * Nothing here is iterated to convergence.
 */
export function buildAccumulator(
	image: DecodedImage,
	pixels: Uint32Array,
	from: number,
	to: number,
): Accumulator {
	// One pass, one map. The OKLab of a packed colour is already computed per pixel, so it is taken
	// from the first pixel carrying that colour rather than converted a second time.
	const slotOf = new Map<number, number>()
	const slotPacked: number[] = []
	const slotPixel: number[] = []
	const slotCount: number[] = []
	for (let index = from; index < to; index += 1) {
		const pixel = pixels[index]
		const key = image.packed[pixel]
		let slot = slotOf.get(key)
		if (slot === undefined) {
			slot = slotPacked.length
			slotOf.set(key, slot)
			slotPacked.push(key)
			slotPixel.push(pixel)
			slotCount.push(0)
		}
		slotCount[slot] += 1
	}

	const colors = Int32Array.from(slotPacked)
	colors.sort()
	const size = colors.length
	const counts = new Float64Array(size)
	const lab = new Float64Array(size * 3)
	const bar = new Float64Array(size)
	const cellLi = new Int32Array(size)
	const cellAi = new Int32Array(size)
	const cellBi = new Int32Array(size)
	const cells = new Map<number, number[]>()
	let totalMass = 0

	for (let i = 0; i < size; i += 1) {
		const key = colors[i]
		const slot = slotOf.get(key) as number
		const count = slotCount[slot]
		counts[i] = count
		totalMass += count
		const pixel = slotPixel[slot]
		const base = pixel * 3
		lab[i * 3] = image.lab[base]
		lab[i * 3 + 1] = image.lab[base + 1]
		lab[i * 3 + 2] = image.lab[base + 2]
		bar[i] = image.bar[pixel]
		const li = cellIndex(image.lab[base])
		const ai = cellIndex(image.lab[base + 1])
		const bi = cellIndex(image.lab[base + 2])
		cellLi[i] = li
		cellAi[i] = ai
		cellBi[i] = bi
		const key2 = cellKey(li, ai, bi)
		const bucket = cells.get(key2)
		if (bucket === undefined) cells.set(key2, [i])
		else bucket.push(i)
	}

	const cellKeys = Float64Array.from(cells.keys())
	cellKeys.sort()

	return { colors, counts, lab, bar, cellLi, cellAi, cellBi, cells, cellKeys, totalMass }
}

/** Mass-weighted mean of every colour within one bar of `location`, plus that mass. */
function barNeighbourhood(
	accumulator: Accumulator,
	location: OkLab,
	live: Float64Array,
): { mass: number; mean: OkLab } {
	const locationBar = barOfRegionIndex(regionIndexOfLab(location[0], location[1], location[2]))
	const li = cellIndex(location[0])
	const ai = cellIndex(location[1])
	const bi = cellIndex(location[2])
	let mass = 0
	let sumL = 0
	let sumA = 0
	let sumB = 0
	for (let dl = -CELL_SEARCH_RADIUS; dl <= CELL_SEARCH_RADIUS; dl += 1) {
		for (let da = -CELL_SEARCH_RADIUS; da <= CELL_SEARCH_RADIUS; da += 1) {
			for (let db = -CELL_SEARCH_RADIUS; db <= CELL_SEARCH_RADIUS; db += 1) {
				const bucket = accumulator.cells.get(cellKey(li + dl, ai + da, bi + db))
				if (bucket === undefined) continue
				for (const colour of bucket) {
					const weight = live[colour]
					if (weight === 0) continue
					const base = colour * 3
					const distance = Math.hypot(
						accumulator.lab[base] - location[0],
						accumulator.lab[base + 1] - location[1],
						accumulator.lab[base + 2] - location[2],
					)
					// The pair's bar, exactly as `sameColorBar` decides it: the larger of the two regions'.
					const pairBar = accumulator.bar[colour] > locationBar ? accumulator.bar[colour] : locationBar
					if (distance >= pairBar) continue
					mass += weight
					sumL += weight * accumulator.lab[base]
					sumA += weight * accumulator.lab[base + 1]
					sumB += weight * accumulator.lab[base + 2]
				}
			}
		}
	}
	if (mass === 0) return { mass: 0, mean: location }
	return { mass, mean: [sumL / mass, sumA / mass, sumB / mass] }
}

/**
 * **The density mode**: the accumulator location maximising live mass within one bar.
 *
 * Branch and bound over occupied cells. The bound is the total live mass of every cell a one-bar
 * query from anywhere inside cell `c` could possibly reach (`CELL_SEARCH_RADIUS` in Chebyshev
 * distance), which is an over-count and therefore a genuine upper bound; cells are examined in
 * descending bound and the search stops as soon as the best exact answer beats the next bound. The
 * answer is the exact argmax over the candidate set, not an approximation of it.
 */
function densityMode(accumulator: Accumulator, live: Float64Array): { location: OkLab; mass: number } | null {
	const cellCount = accumulator.cellKeys.length
	if (cellCount === 0) return null

	// Per-cell live mass and centroid, and the cell's integer coordinates recovered from its key.
	const cellMass = new Float64Array(cellCount)
	const centroids = new Float64Array(cellCount * 3)
	const coordL = new Int32Array(cellCount)
	const coordA = new Int32Array(cellCount)
	const coordB = new Int32Array(cellCount)
	let minL = Number.MAX_SAFE_INTEGER
	let minA = Number.MAX_SAFE_INTEGER
	let minB = Number.MAX_SAFE_INTEGER
	let maxL = Number.MIN_SAFE_INTEGER
	let maxA = Number.MIN_SAFE_INTEGER
	let maxB = Number.MIN_SAFE_INTEGER
	for (let c = 0; c < cellCount; c += 1) {
		const key = accumulator.cellKeys[c]
		const bi = (key % CELL_KEY_STRIDE) - CELL_KEY_OFFSET
		const rest = (key - (bi + CELL_KEY_OFFSET)) / CELL_KEY_STRIDE
		const ai = (rest % CELL_KEY_STRIDE) - CELL_KEY_OFFSET
		const li = (rest - (ai + CELL_KEY_OFFSET)) / CELL_KEY_STRIDE - CELL_KEY_OFFSET
		coordL[c] = li
		coordA[c] = ai
		coordB[c] = bi
		if (li < minL) minL = li
		if (ai < minA) minA = ai
		if (bi < minB) minB = bi
		if (li > maxL) maxL = li
		if (ai > maxA) maxA = ai
		if (bi > maxB) maxB = bi
		const bucket = accumulator.cells.get(key) as number[]
		let mass = 0
		let sumL = 0
		let sumA = 0
		let sumB = 0
		for (const colour of bucket) {
			const weight = live[colour]
			if (weight === 0) continue
			const base = colour * 3
			mass += weight
			sumL += weight * accumulator.lab[base]
			sumA += weight * accumulator.lab[base + 1]
			sumB += weight * accumulator.lab[base + 2]
		}
		cellMass[c] = mass
		if (mass > 0) {
			centroids[c * 3] = sumL / mass
			centroids[c * 3 + 1] = sumA / mass
			centroids[c * 3 + 2] = sumB / mass
		}
	}

	// The bound: total live mass inside the **tight axis-aligned box around the one-bar ball** at the
	// cell's own centroid, which is the location that will actually be evaluated. It over-counts
	// (a box, not a ball, and it takes the bar at its largest across the four regions) and is
	// therefore a true upper bound, but only by the box/ball ratio 6/π ≈ 1.91 rather than by the
	// 5.4× a whole-cell Chebyshev cube would cost — which is the difference between pruning after a
	// handful of exact evaluations and evaluating half the cells. Computed with a 3-D summed-area
	// table over the occupied bounding box, so each cell's bound is eight lookups.
	const sizeL = maxL - minL + 1
	const sizeA = maxA - minA + 1
	const sizeB = maxB - minB + 1
	const strideA = sizeB + 1
	const strideL = strideA * (sizeA + 1)
	const summed = new Float64Array((sizeL + 1) * strideL)
	for (let c = 0; c < cellCount; c += 1) {
		if (cellMass[c] === 0) continue
		const index = (coordL[c] - minL + 1) * strideL + (coordA[c] - minA + 1) * strideA + (coordB[c] - minB + 1)
		summed[index] += cellMass[c]
	}
	for (let l = 1; l <= sizeL; l += 1) {
		for (let a = 1; a <= sizeA; a += 1) {
			for (let b = 1; b <= sizeB; b += 1) {
				const index = l * strideL + a * strideA + b
				summed[index] += summed[index - 1] + summed[index - strideA] - summed[index - strideA - 1] +
					summed[index - strideL] - summed[index - strideL - 1] -
					summed[index - strideL - strideA] + summed[index - strideL - strideA - 1]
			}
		}
	}
	const clampL = (value: number): number => (value < 0 ? 0 : value > sizeL ? sizeL : value)
	const clampA = (value: number): number => (value < 0 ? 0 : value > sizeA ? sizeA : value)
	const clampB = (value: number): number => (value < 0 ? 0 : value > sizeB ? sizeB : value)
	const at = (l: number, a: number, b: number): number => summed[l * strideL + a * strideA + b]

	const bound = new Float64Array(cellCount)
	for (let c = 0; c < cellCount; c += 1) {
		if (cellMass[c] === 0) continue
		const l0 = clampL(cellIndex(centroids[c * 3] - OKLAB_MAX_BAR) - minL)
		const l1 = clampL(cellIndex(centroids[c * 3] + OKLAB_MAX_BAR) - minL + 1)
		const a0 = clampA(cellIndex(centroids[c * 3 + 1] - OKLAB_MAX_BAR) - minA)
		const a1 = clampA(cellIndex(centroids[c * 3 + 1] + OKLAB_MAX_BAR) - minA + 1)
		const b0 = clampB(cellIndex(centroids[c * 3 + 2] - OKLAB_MAX_BAR) - minB)
		const b1 = clampB(cellIndex(centroids[c * 3 + 2] + OKLAB_MAX_BAR) - minB + 1)
		bound[c] = at(l1, a1, b1) - at(l0, a1, b1) - at(l1, a0, b1) - at(l1, a1, b0) +
			at(l0, a0, b1) + at(l0, a1, b0) + at(l1, a0, b0) - at(l0, a0, b0)
	}

	// A dense box → cell-order index, so the exact evaluations below index an array instead of
	// hashing a key 343 times each. Same geometry as `barNeighbourhood`, no `Map` in the hot loop.
	const dense = new Int32Array(sizeL * sizeA * sizeB).fill(-1)
	for (let c = 0; c < cellCount; c += 1) {
		dense[((coordL[c] - minL) * sizeA + (coordA[c] - minA)) * sizeB + (coordB[c] - minB)] = c
	}
	const exactMass = (location: OkLab): number => {
		const locationBar = barOfRegionIndex(regionIndexOfLab(location[0], location[1], location[2]))
		const li = cellIndex(location[0])
		const ai = cellIndex(location[1])
		const bi = cellIndex(location[2])
		let mass = 0
		for (let l = li - CELL_SEARCH_RADIUS; l <= li + CELL_SEARCH_RADIUS; l += 1) {
			if (l < minL || l > maxL) continue
			for (let a = ai - CELL_SEARCH_RADIUS; a <= ai + CELL_SEARCH_RADIUS; a += 1) {
				if (a < minA || a > maxA) continue
				for (let b = bi - CELL_SEARCH_RADIUS; b <= bi + CELL_SEARCH_RADIUS; b += 1) {
					if (b < minB || b > maxB) continue
					const neighbour = dense[((l - minL) * sizeA + (a - minA)) * sizeB + (b - minB)]
					if (neighbour === -1 || cellMass[neighbour] === 0) continue
					for (const colour of accumulator.cells.get(accumulator.cellKeys[neighbour]) as number[]) {
						const weight = live[colour]
						if (weight === 0) continue
						const base = colour * 3
						const distance = Math.hypot(
							accumulator.lab[base] - location[0],
							accumulator.lab[base + 1] - location[1],
							accumulator.lab[base + 2] - location[2],
						)
						const pairBar = accumulator.bar[colour] > locationBar ? accumulator.bar[colour] : locationBar
						if (distance < pairBar) mass += weight
					}
				}
			}
		}
		return mass
	}

	// Descending bound, ties on ascending cell key — both functions of the pixel data alone.
	const order = Array.from({ length: cellCount }, (_unused, index) => index)
		.filter((index) => cellMass[index] > 0)
		.sort((first, second) => bound[second] - bound[first] || accumulator.cellKeys[first] - accumulator.cellKeys[second])

	let best: { location: OkLab; mass: number; key: number } | null = null
	for (const c of order) {
		if (best !== null && bound[c] <= best.mass) break
		const key = accumulator.cellKeys[c]
		const centroid: OkLab = [centroids[c * 3], centroids[c * 3 + 1], centroids[c * 3 + 2]]
		const mass = exactMass(centroid)
		if (best === null || mass > best.mass || (mass === best.mass && key < best.key)) {
			best = { location: centroid, mass, key }
		}
	}
	if (best === null) return null
	return { location: best.location, mass: best.mass }
}

export type Representative = Readonly<{
	/** The exact source triple this node publishes. */
	rgb: Rgb8
	/** Its packed form. */
	packed: number
	/** Its OKLab. */
	lab: OkLab
	/** The mass inside one bar of the density mode — the neighbourhood the colour speaks for. */
	modeMass: number
	/** `modeMass` over the node's total, i.e. how much of the node reads as this colour. */
	modeFraction: number
}>

/**
 * **The representative-colour rule**, as the SPEC fixes it. See the module docstring for the three
 * steps and for what is discretised.
 *
 * Returns `null` only for an empty node, which the caller must not construct.
 */
export function representativeOf(accumulator: Accumulator, live?: Float64Array): Representative | null {
	const weights = live ?? accumulator.counts
	const mode = densityMode(accumulator, weights)
	if (mode === null) return null
	return representativeFromMode(accumulator, weights, mode)
}

/** Steps 2 and 3 of the rule, given step 1's answer. Split out so the peel does not repeat step 1. */
function representativeFromMode(
	accumulator: Accumulator,
	weights: Float64Array,
	mode: { location: OkLab; mass: number },
): Representative | null {
	const { mean } = barNeighbourhood(accumulator, mode.location, weights)

	// Step 3: the exact triple present in the node nearest that mean. A linear scan over the node's
	// distinct colours — exact, and the array is already in lexicographic RGB order so the first
	// strict improvement wins every tie.
	let bestColour = -1
	let bestDistance = Number.POSITIVE_INFINITY
	for (let i = 0; i < accumulator.colors.length; i += 1) {
		if (weights[i] === 0) continue
		const base = i * 3
		const distance = Math.hypot(
			accumulator.lab[base] - mean[0],
			accumulator.lab[base + 1] - mean[1],
			accumulator.lab[base + 2] - mean[2],
		)
		if (distance < bestDistance) {
			bestDistance = distance
			bestColour = i
		}
	}
	if (bestColour < 0) return null

	const packed = accumulator.colors[bestColour]
	const base = bestColour * 3
	return {
		rgb: unpack(packed),
		packed,
		lab: [accumulator.lab[base], accumulator.lab[base + 1], accumulator.lab[base + 2]],
		modeMass: mode.mass,
		modeFraction: accumulator.totalMass === 0 ? 0 : mode.mass / accumulator.totalMass,
	}
}

/**
 * **The whole-image colour modes by area** the degenerate branch reads its four roles off
 * (arm-b §2.8).
 *
 * Greedy peeling: take the representative, then retire every colour within one bar of the mode that
 * produced it and repeat. Retiring by the bar rather than by an invented radius is what keeps the
 * modes distinct in the contract's own terms — two modes can never be the same colour. Returned in
 * peel order, which is descending mass, i.e. descending area.
 */
export function peelModes(accumulator: Accumulator, limit: number): Representative[] {
	const live = Float64Array.from(accumulator.counts)
	const modes: Representative[] = []
	for (let round = 0; round < limit; round += 1) {
		const mode = densityMode(accumulator, live)
		if (mode === null) break
		const representative = representativeFromMode(accumulator, live, mode)
		if (representative === null) break
		modes.push(representative)

		// Retire the neighbourhood. Same geometry as `barNeighbourhood`, but zeroing rather than summing.
		const locationBar = barOfRegionIndex(
			regionIndexOfLab(mode.location[0], mode.location[1], mode.location[2]),
		)
		const li = cellIndex(mode.location[0])
		const ai = cellIndex(mode.location[1])
		const bi = cellIndex(mode.location[2])
		let retired = 0
		for (let dl = -CELL_SEARCH_RADIUS; dl <= CELL_SEARCH_RADIUS; dl += 1) {
			for (let da = -CELL_SEARCH_RADIUS; da <= CELL_SEARCH_RADIUS; da += 1) {
				for (let db = -CELL_SEARCH_RADIUS; db <= CELL_SEARCH_RADIUS; db += 1) {
					const bucket = accumulator.cells.get(cellKey(li + dl, ai + da, bi + db))
					if (bucket === undefined) continue
					for (const colour of bucket) {
						if (live[colour] === 0) continue
						const base = colour * 3
						const distance = Math.hypot(
							accumulator.lab[base] - mode.location[0],
							accumulator.lab[base + 1] - mode.location[1],
							accumulator.lab[base + 2] - mode.location[2],
						)
						const pairBar = accumulator.bar[colour] > locationBar ? accumulator.bar[colour] : locationBar
						if (distance >= pairBar) continue
						live[colour] = 0
						retired += 1
					}
				}
			}
		}
		// The peel must make progress or the loop is not a loop. The mode's own colour is always inside
		// its own bar neighbourhood, so this cannot fire; it is here so that a future change to the
		// neighbourhood geometry fails loudly instead of hanging.
		if (retired === 0) break
	}
	return modes
}
