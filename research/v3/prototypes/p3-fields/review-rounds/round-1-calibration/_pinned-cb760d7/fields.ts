/**
 * The two per-pixel scalar fields (arm-d §2.1), computed at full resolution.
 *
 * Both have the same cardinality as the image, both are purely local, and both are **colour-free in
 * their output** — one boolean and one number per pixel. Nothing in this file averages a colour, and
 * every distance it takes is a distance *to the pixel itself*, never to a neighbourhood summary. That
 * is the clause with teeth: it bans every linear filter on a colour channel, which costs the usual
 * toolbox and buys the property the paradigm rests on — linear filters are exactly what makes a ±1-LSB
 * dither visible downstream, and rank filters annihilate it.
 *
 * ## The edge indicator
 *
 * At each pixel p, the OKLab distances from p to the eight pixels of its 3×3 neighbourhood. The **k-th
 * largest** of those (a rank filter, not a maximum) is p's local difference. p is an edge when that
 * value exceeds the same-colour bar for p's region — reusing the contract's calibrated ruler on purpose:
 * *"the colour changes here"* and *"these read as two colours"* should be one question, and the contract
 * has already answered it with reviewer evidence.
 *
 * Two boundary cases, both stated rather than left to fall out:
 *
 * - **Fewer than eight neighbours** (image border, or an ineligible neighbour). The k-th largest of a
 *   shorter list is read as the k-th largest of what is there, and when fewer than k neighbours exist
 *   the smallest available difference is used. That is the conservative direction: a truncated
 *   neighbourhood produces *fewer* edges, so a border never manufactures a boundary that is not there.
 * - **Ineligible pixels** are not edges and contribute to no neighbour's statistics, per §2.0.
 *
 * ## The depth field
 *
 * `depth(p)` is the exact Euclidean distance from p to the nearest **seed**, divided by the image's long
 * edge so it is scale-free. Seeds are the edge pixels *and* the ineligible pixels: a pixel next to a
 * transparent region is next to a boundary, and saying so is the consistent reading of "excluded from
 * their neighbours' statistics".
 *
 * The transform is exact, not approximate — Felzenszwalb–Huttenlocher's separable lower-envelope
 * algorithm, two linear passes, integer-exact squared distances. An approximate chamfer transform would
 * make depth a function of the mask's orientation, and depth is the field the background is chosen out
 * of.
 *
 * Depth answers *"how deep inside a region of unchanging colour am I"*, and it treats a flat field and a
 * smooth gradient identically, because a gentle progression has a tiny local derivative and produces no
 * edges.
 */

import { EDGE_RANK } from "./constants.ts"
import type { DecodedImage } from "./decode.ts"
import { labDistance } from "./primitives.ts"

/** The 8-neighbourhood, in a fixed order. Fixed iteration order is part of the determinism promise. */
const NEIGHBOUR_OFFSETS: readonly (readonly [number, number])[] = [
	[-1, -1], [0, -1], [1, -1],
	[-1, 0], [1, 0],
	[-1, 1], [0, 1], [1, 1],
]

export type EdgeField = Readonly<{
	/** 1 where the pixel is an edge, 0 elsewhere. Ineligible pixels are 0. */
	isEdge: Uint8Array
	/** The k-th largest neighbour distance at each pixel — the raw indicator, kept for inspection. */
	localDifference: Float64Array
	edgeCount: number
}>

/**
 * The edge indicator. One pass, eight distances and a partial sort of eight per pixel.
 *
 * The sort is an insertion sort over at most eight values: for n = 8 it beats every asymptotically
 * better algorithm and, more to the point, it is obviously a total order with no tie-break to get wrong.
 *
 * `rank` defaults to `EDGE_RANK` and exists so `src/tools/measure-edge-rank.ts` can run arm-d §4 row 2's
 * anchoring measurement against **this** function rather than a re-implementation of it. The pipeline
 * never passes it.
 */
export function computeEdgeField(image: DecodedImage, rank: number = EDGE_RANK): EdgeField {
	const { width, height, lab, eligible, bar } = image
	const count = width * height
	const isEdge = new Uint8Array(count)
	const localDifference = new Float64Array(count)
	const distances = new Float64Array(8)
	let edgeCount = 0

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const index = y * width + x
			if (eligible[index] === 0) continue

			let found = 0
			for (const [dx, dy] of NEIGHBOUR_OFFSETS) {
				const nx = x + dx
				const ny = y + dy
				if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
				const neighbour = ny * width + nx
				if (eligible[neighbour] === 0) continue
				const distance = labDistance(lab, index, neighbour)
				// Insertion into a descending run.
				let slot = found
				while (slot > 0 && distances[slot - 1] < distance) {
					distances[slot] = distances[slot - 1]
					slot -= 1
				}
				distances[slot] = distance
				found += 1
			}
			if (found === 0) continue

			// The k-th largest, or the smallest available when the neighbourhood is shorter than k.
			const slot = Math.min(rank, found) - 1
			const difference = distances[slot]
			localDifference[index] = difference
			if (difference > bar[index]) {
				isEdge[index] = 1
				edgeCount += 1
			}
		}
	}

	return { isEdge, localDifference, edgeCount }
}

/**
 * One dimension of the exact Euclidean distance transform (Felzenszwalb–Huttenlocher 2012).
 *
 * `f` holds squared distances along one row or column; the result replaces it with the lower envelope
 * of the parabolas rooted at each sample. Two of these passes, one per axis, give the exact squared
 * Euclidean distance to the nearest seed.
 */
function distanceTransform1d(
	f: Float64Array,
	n: number,
	d: Float64Array,
	v: Int32Array,
	z: Float64Array,
): void {
	let k = 0
	v[0] = 0
	z[0] = Number.NEGATIVE_INFINITY
	z[1] = Number.POSITIVE_INFINITY
	for (let q = 1; q < n; q += 1) {
		let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
		while (s <= z[k]) {
			k -= 1
			s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
		}
		k += 1
		v[k] = q
		z[k] = s
		z[k + 1] = Number.POSITIVE_INFINITY
	}
	k = 0
	for (let q = 0; q < n; q += 1) {
		while (z[k + 1] < q) k += 1
		const dx = q - v[k]
		d[q] = dx * dx + f[v[k]]
	}
}

export type DepthField = Readonly<{
	/** Distance to the nearest seed, divided by the long edge. Scale-free, per `CONVENTIONS.md`. */
	depth: Float64Array
	/** True when the image had no seeds at all — a single flat expanse with no boundary anywhere. */
	seedless: boolean
}>

/**
 * The exact Euclidean distance transform to the nearest edge (or ineligible) pixel, normalised by the
 * long edge.
 *
 * When the image has **no seeds** — no edge anywhere, no transparency — every pixel is infinitely deep.
 * That is the one-colour case, and rather than encode a sentinel the field is set flat at 1: every pixel
 * is maximally deep, the field set is everything, and §2.3's collapse test then reaches the same
 * conclusion by measuring rather than by branching.
 */
export function computeDepthField(image: DecodedImage, edges: EdgeField): DepthField {
	const { width, height, eligible } = image
	const count = width * height
	const infinity = 1e20
	const grid = new Float64Array(count)
	let seeds = 0
	for (let index = 0; index < count; index += 1) {
		const isSeed = edges.isEdge[index] === 1 || eligible[index] === 0
		if (isSeed) seeds += 1
		grid[index] = isSeed ? 0 : infinity
	}

	const depth = new Float64Array(count)
	if (seeds === 0) {
		depth.fill(1)
		return { depth, seedless: true }
	}

	const longest = Math.max(width, height)
	const column = new Float64Array(longest)
	const output = new Float64Array(longest)
	const v = new Int32Array(longest + 1)
	const z = new Float64Array(longest + 2)

	// Columns first, then rows. The order does not affect the result — the transform is separable and
	// exact — and is fixed here so the arithmetic is reproducible to the bit.
	for (let x = 0; x < width; x += 1) {
		for (let y = 0; y < height; y += 1) column[y] = grid[y * width + x]
		distanceTransform1d(column, height, output, v, z)
		for (let y = 0; y < height; y += 1) grid[y * width + x] = output[y]
	}
	for (let y = 0; y < height; y += 1) {
		const rowStart = y * width
		for (let x = 0; x < width; x += 1) column[x] = grid[rowStart + x]
		distanceTransform1d(column, width, output, v, z)
		for (let x = 0; x < width; x += 1) grid[rowStart + x] = output[x]
	}

	for (let index = 0; index < count; index += 1) {
		depth[index] = Math.sqrt(grid[index]) / image.longEdge
	}
	return { depth, seedless: false }
}
