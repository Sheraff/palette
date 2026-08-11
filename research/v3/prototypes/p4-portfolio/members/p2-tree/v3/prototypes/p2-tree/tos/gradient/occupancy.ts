/**
 * **The artwork's occupied colours, as a structure a ramp can be measured against.**
 *
 * arm-b §2.7, verbatim: *"Compute the excursion: the rendered OKLab interpolation between the ends,
 * sampled densely in `t`, against the artwork's occupied colour set (a bar-scaled occupancy structure
 * built in one pass); the excursion at a sample is its distance to the nearest occupied colour."*
 *
 * This file is that structure and nothing else. It answers exactly one question — *what is the
 * nearest colour this image actually contains, and how far is it?* — and it answers it over the
 * **exact-triple set**, which is the only set the contract's exactness rule recognises: a colour is
 * on the artwork when some pixel has those three 8-bit channel values, not when it is close to a bin.
 *
 * ## Occupancy is presence, not mass
 *
 * A single pixel of a colour puts that colour in the set. That is deliberate and it is the
 * conservative direction for this test: the excursion asks whether the rendered ramp passes through
 * colours the artwork *does not contain*, and a colour the artwork contains once is still a colour it
 * contains. Weighting by population would import exactly the mass floor `DECISIONS.md` D8 records as
 * excluding the colours the reviewer asks for (*"concentration/coherence beats raw population share;
 * mass floors exclude exactly what the reviewer asks for"*), and it would need a floor — a number
 * this work is not allowed to invent.
 *
 * ## Two passes over cheap things, one pass over the pixels
 *
 * The pixels are read once, into a 2²⁴-bit presence bitmap — one bit per possible sRGB triple, 2 MB,
 * independent of image size. The distinct colours then fall out of the bitmap **in ascending packed
 * order for free**, which is lexicographic RGB order, which is `SPEC.md`'s tie-break; no sort runs and
 * no map is ever iterated. Their OKLab coordinates and the lookup grid are built over the *distinct*
 * colours, of which a cover has tens of thousands rather than the million-odd pixels that produced
 * them.
 *
 * ## The grid is an index, never a ruler
 *
 * Cell size is `LARGEST_SAME_COLOR_BAR` — the same choice, for the same reason, that
 * `pipeline.ts`'s representative-colour rule makes: *"A uniform OKLab grid at `LARGEST_SAME_COLOR_BAR`
 * is used only to find the neighbours to test; it is an index, and every pair it returns is still
 * measured."* Nothing here rounds, bins or snaps a colour. The shell search below returns the exact
 * Euclidean nearest neighbour in OKLab — the grid only decides the order cells are visited in, and
 * the search's stopping rule is a proof obligation, not a heuristic (see `nearestOccupied`).
 */

import { rgbToOkLab } from "../../../../src/contract/color.ts"
import type { OkLab, Rgb8 } from "../../../../src/contract/types.ts"
import { LARGEST_SAME_COLOR_BAR } from "../constants.ts"
import { unpack } from "../pipeline.ts"

/** How many distinct sRGB triples there are — the size of the presence bitmap, in bits. */
const TRIPLE_COUNT = 1 << 24

/**
 * The grid's per-axis key offset and stride.
 *
 * OKLab `L` lives in `[0, 1]` and `a`/`b` inside `[-0.5, 0.5]` for every in-gamut sRGB colour, so at
 * the loosest bar (0.02293) no axis index leaves `[-22, 44]`. `±512` is two orders of magnitude of
 * headroom on that, and `512 × 1024²` keeps the composed key inside a signed 32-bit integer, so the
 * `Map` never sees a key that is not a small integer.
 */
const KEY_OFFSET = 512
const KEY_STRIDE = 1024

/** The artwork's exact-triple set, indexed for nearest-neighbour queries in OKLab. */
export type Occupancy = Readonly<{
	/** Every distinct packed triple `r << 16 | g << 8 | b` in the image, ascending. */
	colors: Int32Array
	/** OKLab coordinates of `colors`, flat: `labs[3i…3i+2]` belongs to `colors[i]`. */
	labs: Float64Array
	/** Cell key → the indices of the distinct colours in that cell, ascending. */
	grid: ReadonlyMap<number, Int32Array>
	/** The grid's cell size in OKLab units. An index parameter; never a ruler. */
	cell: number
	/** How many distinct triples the image contains. */
	count: number
}>

function cellKeyOf(lab: OkLab, cell: number): number {
	const first = Math.floor(lab[0] / cell) + KEY_OFFSET
	const second = Math.floor(lab[1] / cell) + KEY_OFFSET
	const third = Math.floor(lab[2] / cell) + KEY_OFFSET
	return (first * KEY_STRIDE + second) * KEY_STRIDE + third
}

function cellKeyOfIndices(first: number, second: number, third: number): number {
	return ((first + KEY_OFFSET) * KEY_STRIDE + (second + KEY_OFFSET)) * KEY_STRIDE + (third + KEY_OFFSET)
}

/**
 * Build the occupancy structure for one decoded image.
 *
 * Deterministic in the strong sense the spec asks for: the output depends on the *set* of pixel
 * values only, never on their order, and the distinct colours come out ascending because the bitmap
 * is scanned ascending. Two runs over the same bytes produce identical `Int32Array`s.
 */
export function occupancyOf(packed: Int32Array): Occupancy {
	// ---- one pass over the pixels ---------------------------------------------------------------
	const present = new Uint32Array(TRIPLE_COUNT >>> 5)
	for (let pixel = 0; pixel < packed.length; pixel += 1) {
		const color = packed[pixel] & 0xffffff
		present[color >>> 5] |= 1 << (color & 31)
	}

	let count = 0
	for (let word = 0; word < present.length; word += 1) {
		let bits = present[word]
		while (bits !== 0) {
			bits &= bits - 1
			count += 1
		}
	}

	const colors = new Int32Array(count)
	const labs = new Float64Array(count * 3)
	const cell = LARGEST_SAME_COLOR_BAR
	const members = new Map<number, number[]>()
	let index = 0
	for (let word = 0; word < present.length; word += 1) {
		let bits = present[word]
		while (bits !== 0) {
			const lowest = bits & -bits
			const bit = 31 - Math.clz32(lowest)
			bits ^= lowest
			const color = (word << 5) | bit
			colors[index] = color
			const lab = rgbToOkLab(unpack(color))
			labs[index * 3] = lab[0]
			labs[index * 3 + 1] = lab[1]
			labs[index * 3 + 2] = lab[2]
			const key = cellKeyOf(lab, cell)
			const bucket = members.get(key)
			if (bucket === undefined) members.set(key, [index])
			else bucket.push(index)
			index += 1
		}
	}

	const grid = new Map<number, Int32Array>()
	for (const [key, bucket] of members) grid.set(key, Int32Array.from(bucket))
	return { colors, labs, grid, cell, count }
}

/** What the artwork's nearest colour to a queried point is, and how far away it is. */
export type NearestOccupied = Readonly<{
	/** Index into `Occupancy.colors`. */
	index: number
	rgb: Rgb8
	/** Euclidean OKLab distance from the query point. */
	distance: number
}>

/**
 * The exact nearest occupied colour to `lab`, by Euclidean OKLab distance.
 *
 * **The search is exact, and its stopping rule is why.** Cells are visited in expanding Chebyshev
 * shells around the query point's own cell. Once every cell within shell radius `r` has been scanned,
 * any colour that has *not* been scanned lives in a cell at least `r` cells away along some axis, and
 * therefore at Euclidean distance at least `r × cell` from a query point sitting inside the centre
 * cell. So the moment the best distance found is `≤ r × cell`, no unvisited colour can beat it and
 * the search stops with a proven answer. Nothing about that argument depends on the cell size, which
 * is why the cell size is free to be an index parameter rather than a threshold.
 *
 * **Ties go to the smaller packed triple**, i.e. lexicographically smaller RGB, because `colors` is
 * ascending and the update test is strict. That is `SPEC.md`'s tie-break, reached without a sort.
 */
export function nearestOccupied(occupancy: Occupancy, lab: OkLab): NearestOccupied {
	if (occupancy.count === 0) throw new RangeError("an image with no colours has no nearest colour")
	const { grid, labs, colors, cell } = occupancy
	const centreFirst = Math.floor(lab[0] / cell)
	const centreSecond = Math.floor(lab[1] / cell)
	const centreThird = Math.floor(lab[2] / cell)

	let bestIndex = -1
	let bestSquared = Number.POSITIVE_INFINITY
	const consider = (bucket: Int32Array | undefined): void => {
		if (bucket === undefined) return
		for (let slot = 0; slot < bucket.length; slot += 1) {
			const candidate = bucket[slot]
			const first = labs[candidate * 3] - lab[0]
			const second = labs[candidate * 3 + 1] - lab[1]
			const third = labs[candidate * 3 + 2] - lab[2]
			const squared = first * first + second * second + third * third
			if (squared < bestSquared) {
				bestSquared = squared
				bestIndex = candidate
			}
		}
	}

	// The whole in-gamut OKLab body fits inside 64 cells of the loosest bar on every axis, so this
	// bound is a guard against a corrupted grid, not a search limit that could truncate an answer.
	const maxRadius = Math.ceil(2 / cell) + 2
	for (let radius = 0; radius <= maxRadius; radius += 1) {
		if (bestIndex >= 0 && Math.sqrt(bestSquared) <= radius * cell) break
		if (radius === 0) {
			consider(grid.get(cellKeyOfIndices(centreFirst, centreSecond, centreThird)))
			continue
		}
		for (let first = centreFirst - radius; first <= centreFirst + radius; first += 1) {
			const firstOnShell = first === centreFirst - radius || first === centreFirst + radius
			for (let second = centreSecond - radius; second <= centreSecond + radius; second += 1) {
				const secondOnShell = second === centreSecond - radius || second === centreSecond + radius
				if (firstOnShell || secondOnShell) {
					for (let third = centreThird - radius; third <= centreThird + radius; third += 1) {
						consider(grid.get(cellKeyOfIndices(first, second, third)))
					}
				} else {
					consider(grid.get(cellKeyOfIndices(first, second, centreThird - radius)))
					consider(grid.get(cellKeyOfIndices(first, second, centreThird + radius)))
				}
			}
		}
	}

	if (bestIndex < 0) {
		// Unreachable while the grid is consistent with `colors`; a linear scan is the honest fallback
		// rather than a thrown error, because this function's answer is a measurement and a measurement
		// that degrades in cost is better than one that disappears.
		for (let candidate = 0; candidate < occupancy.count; candidate += 1) {
			const first = labs[candidate * 3] - lab[0]
			const second = labs[candidate * 3 + 1] - lab[1]
			const third = labs[candidate * 3 + 2] - lab[2]
			const squared = first * first + second * second + third * third
			if (squared < bestSquared) {
				bestSquared = squared
				bestIndex = candidate
			}
		}
	}
	return { index: bestIndex, rgb: unpack(colors[bestIndex]), distance: Math.sqrt(bestSquared) }
}
