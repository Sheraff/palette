/**
 * Smoothed mass — `m(c) = Σ_c' n(c') · κ(d_OKLab(c, c'))`.
 *
 * **This is the single most consequential quantity in P1.** Arm A §2.1 anchors it: the median
 * endorsed role colour occupies 8.89e-5 of its image as an exact triple but 1.91e-2 as a
 * same-colour-bar neighbourhood — a factor of roughly 215. An objective that reads mass at exact
 * bins is reading a quantity two orders of magnitude smaller, and far noisier, than the one the
 * reviewer is responding to. So every mass the energy ever sees comes through this function, and
 * nothing downstream may count an exact bin.
 *
 * Two paths compute the same quantity:
 *
 * - **exact** — the full O(K²) double sum, no truncation, used below
 *   `SMOOTHED_MASS_EXACT_MAX_COLORS`. Hand-checkable, and the reference the lattice is tested
 *   against.
 * - **lattice** — colours accumulated onto a coarse OKLab lattice and the sum taken over cells. See
 *   `SMOOTHED_MASS_LATTICE_CELLS_PER_BAR` in `constants.ts` for the lattice constant and the
 *   refinement-invariance claim it is chosen to satisfy: refining the lattice must not change any
 *   downstream argmin, and the bound behind that is quadratic in (cell side / bandwidth).
 *
 * `mode` is recorded in the measurement, so a result can never be read without knowing which ran.
 *
 * The bandwidth is the **pair** bandwidth — the larger of the two colours' regional bars, exactly the
 * contract's `sameColorBar` rule — which is symmetric, so the exact path halves its work and `m` is
 * a genuine symmetric kernel sum rather than a direction-dependent one.
 */

import {
	KERNEL_BANDWIDTH_BY_REGION,
	KERNEL_TRUNCATION_BANDWIDTHS,
	SMOOTHED_MASS_EXACT_MAX_COLORS,
	SMOOTHED_MASS_LATTICE_CELLS_PER_BAR,
	TIGHTEST_SAME_COLOR_BAR,
} from "./constants.ts"
import { bandwidthOf, kappa } from "./kernel.ts"
import type { TripleTable } from "./triples.ts"

/** `m(c)` for every triple, plus how it was computed. */
export type SmoothedMass = Readonly<{
	/** Which path ran. Never inferred by a reader — always recorded. */
	mode: "exact" | "lattice"
	/** Lattice cell side in OKLab units; `null` on the exact path. */
	cellSide: number | null
	/** Lattice cells per tightest bar; `null` on the exact path. */
	cellsPerBar: number | null
	/** Occupied lattice cells; `null` on the exact path. */
	occupiedCells: number | null
	/** Kernel truncation radius in bandwidths; `null` on the exact path, which does not truncate. */
	truncationBandwidths: number | null
	/** `m(c)` in pixels, per triple, in the table's canonical order. */
	mass: Float64Array
	/** `m(c) / N` — the scale-free form, which is what the energy reads. */
	massFraction: Float64Array
}>

/**
 * A tabulated `κ` for the lattice path's inner loop.
 *
 * `κ(δ) = exp(-½(δ/h)²)` depends on `δ` and `h` only through `u = (δ/h)²`, so one table over `u`
 * serves every bandwidth and no square root is needed at all. The table is linearly interpolated over
 * `u ∈ [0, KERNEL_TRUNCATION_BANDWIDTHS²]` in 4096 steps.
 *
 * Derived-and-stated: linear interpolation of `exp(-u/2)` on a step `Δ` has error at most
 * `Δ²·max|f''|/8 = (16/4096)²·0.25/8 ≈ 4.8e-7` absolute — three orders below the lattice's own
 * 0.78% approximation and far below anything the energy compares at. It is a speed device and
 * nothing else: `kappa` in `kernel.ts` remains the definition, the exact path uses it unmodified,
 * and `tests/measure/smoothed-mass.test.ts` checks the two agree.
 */
const KERNEL_TABLE_STEPS = 4096
const KERNEL_TABLE_MAX_U = KERNEL_TRUNCATION_BANDWIDTHS * KERNEL_TRUNCATION_BANDWIDTHS
const KERNEL_TABLE_SCALE = KERNEL_TABLE_STEPS / KERNEL_TABLE_MAX_U
const KERNEL_TABLE = (() => {
	const table = new Float64Array(KERNEL_TABLE_STEPS + 2)
	for (let index = 0; index <= KERNEL_TABLE_STEPS; index += 1) {
		table[index] = Math.exp((-0.5 * (index * KERNEL_TABLE_MAX_U)) / KERNEL_TABLE_STEPS)
	}
	return table
})()

/** `κ` from `u = (δ/h)²`, interpolated; zero past the truncation radius. */
function kappaFromSquaredRatio(squaredRatio: number): number {
	if (squaredRatio >= KERNEL_TABLE_MAX_U) return 0
	const position = squaredRatio * KERNEL_TABLE_SCALE
	const index = position | 0
	const fraction = position - index
	return KERNEL_TABLE[index] + fraction * (KERNEL_TABLE[index + 1] - KERNEL_TABLE[index])
}

/** The loosest regional bar; the conservative upper bound on any pair bandwidth. */
const LOOSEST_SAME_COLOR_BAR = Math.max(...Object.values(KERNEL_BANDWIDTH_BY_REGION))

function exactSmoothedMass(table: TripleTable, bandwidths: Float64Array): Float64Array {
	const { colorCount, counts, lab } = table
	const mass = new Float64Array(colorCount)
	for (let i = 0; i < colorCount; i += 1) {
		// κ(0) = 1: a colour is its own full mass before any neighbour is added.
		mass[i] += counts[i]
		const baseI = i * 3
		for (let j = i + 1; j < colorCount; j += 1) {
			const baseJ = j * 3
			const deltaL = lab[baseI] - lab[baseJ]
			const deltaA = lab[baseI + 1] - lab[baseJ + 1]
			const deltaB = lab[baseI + 2] - lab[baseJ + 2]
			const distance = Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB)
			const bandwidth = bandwidths[i] > bandwidths[j] ? bandwidths[i] : bandwidths[j]
			const weight = kappa(distance, bandwidth)
			mass[i] += counts[j] * weight
			mass[j] += counts[i] * weight
		}
	}
	return mass
}

/**
 * Lattice coordinates are packed into one number so a `Map` can key on them.
 *
 * Derived-and-stated: the offset and radix below only have to be large enough that no lattice
 * coordinate wraps. OKLab lightness lies in [0,1] and a,b within ±0.5, so at the finest lattice this
 * module will ever be asked for the coordinates stay inside ±4096; a radix of 8192 keeps the packed
 * key under 2^40, exactly representable in a float64 and therefore a sound `Map` key.
 */
const LATTICE_COORDINATE_OFFSET = 4096
const LATTICE_RADIX = 8192

function packCell(cl: number, ca: number, cb: number): number {
	return (
		((cl + LATTICE_COORDINATE_OFFSET) * LATTICE_RADIX + (ca + LATTICE_COORDINATE_OFFSET)) *
			LATTICE_RADIX +
		(cb + LATTICE_COORDINATE_OFFSET)
	)
}

function latticeSmoothedMass(
	table: TripleTable,
	bandwidths: Float64Array,
	cellsPerBar: number,
): { mass: Float64Array; cellSide: number; occupiedCells: number } {
	const { colorCount, counts, lab } = table
	const cellSide = TIGHTEST_SAME_COLOR_BAR / cellsPerBar

	// --- accumulate the occupied cells -------------------------------------------------------
	const cellIndexByKey = new Map<number, number>()
	const cellKeys: number[] = []
	const cellCl: number[] = []
	const cellCa: number[] = []
	const cellCount: number[] = []
	const cellSumL: number[] = []
	const cellSumA: number[] = []
	const cellSumB: number[] = []

	for (let i = 0; i < colorCount; i += 1) {
		const base = i * 3
		const cl = Math.floor(lab[base] / cellSide)
		const ca = Math.floor(lab[base + 1] / cellSide)
		const cb = Math.floor(lab[base + 2] / cellSide)
		const key = packCell(cl, ca, cb)
		let cell = cellIndexByKey.get(key)
		if (cell === undefined) {
			cell = cellKeys.length
			cellIndexByKey.set(key, cell)
			cellKeys.push(key)
			cellCl.push(cl)
			cellCa.push(ca)
			cellCount.push(0)
			cellSumL.push(0)
			cellSumA.push(0)
			cellSumB.push(0)
		}
		cellCount[cell] += counts[i]
		cellSumL[cell] += counts[i] * lab[base]
		cellSumA[cell] += counts[i] * lab[base + 1]
		cellSumB[cell] += counts[i] * lab[base + 2]
	}

	// --- canonical cell order: ascending packed key, which is ascending (cl, ca, cb) ----------
	// The order is what makes the two-level index below possible at all: cells sharing `cl` are
	// contiguous, and inside such a slab `ca` is ascending, so a range in either coordinate is a
	// range of positions. It is also the reason nothing here ever iterates a `Map`.
	const occupiedCells = cellKeys.length
	const cellOrder = Array.from({ length: occupiedCells }, (_unused, cell) => cell).sort(
		(left, right) => cellKeys[left] - cellKeys[right],
	)

	const sortedCl = new Int32Array(occupiedCells)
	const sortedCa = new Int32Array(occupiedCells)
	const sortedCount = new Float64Array(occupiedCells)
	const sortedCentroid = new Float64Array(occupiedCells * 3)
	const sortedBandwidth = new Float64Array(occupiedCells)
	for (let position = 0; position < occupiedCells; position += 1) {
		const cell = cellOrder[position]
		sortedCl[position] = cellCl[cell]
		sortedCa[position] = cellCa[cell]
		sortedCount[position] = cellCount[cell]
		const centroid: [number, number, number] = [
			cellSumL[cell] / cellCount[cell],
			cellSumA[cell] / cellCount[cell],
			cellSumB[cell] / cellCount[cell],
		]
		sortedCentroid[position * 3] = centroid[0]
		sortedCentroid[position * 3 + 1] = centroid[1]
		sortedCentroid[position * 3 + 2] = centroid[2]
		sortedBandwidth[position] = bandwidthOf(centroid)
	}

	// Slab index over lightness. `slabStart[cl]` is where that slab begins; slabs are contiguous.
	const slabStart = new Map<number, number>()
	const slabEnd = new Map<number, number>()
	for (let position = 0; position < occupiedCells; position += 1) {
		const cl = sortedCl[position]
		if (!slabStart.has(cl)) slabStart.set(cl, position)
		slabEnd.set(cl, position + 1)
	}

	/** First position in `[start, end)` whose `ca` is at least `target`. */
	function lowerBoundByCa(start: number, end: number, target: number): number {
		let low = start
		let high = end
		while (low < high) {
			const middle = (low + high) >> 1
			if (sortedCa[middle] < target) low = middle + 1
			else high = middle
		}
		return low
	}

	// --- the sum -----------------------------------------------------------------------------
	// The truncation radius uses the *loosest* regional bar, so no pair bandwidth can exceed the one
	// the radius was computed for and no contribution above the truncation threshold is missed. The
	// lattice reach adds one cell because a source cell's centroid may sit anywhere inside it.
	const searchRadius = KERNEL_TRUNCATION_BANDWIDTHS * LOOSEST_SAME_COLOR_BAR
	const searchRadiusSquared = searchRadius * searchRadius
	const reach = Math.ceil(searchRadius / cellSide) + 1

	// Evaluation is at each triple's **exact** OKLab position, never at its cell's centroid: the
	// lattice approximates the *source* mass, which is where the refinement-invariance bound in
	// `constants.ts` applies. Approximating the evaluation point too would double the error for no
	// saving, since there are no fewer triples than cells to visit either way.
	const mass = new Float64Array(colorCount)
	for (let i = 0; i < colorCount; i += 1) {
		const base = i * 3
		const pointL = lab[base]
		const pointA = lab[base + 1]
		const pointB = lab[base + 2]
		const pointBandwidth = bandwidths[i]
		const cl = Math.floor(pointL / cellSide)
		const ca = Math.floor(pointA / cellSide)

		let total = 0
		for (let slab = cl - reach; slab <= cl + reach; slab += 1) {
			const start = slabStart.get(slab)
			if (start === undefined) continue
			const end = slabEnd.get(slab) as number
			const from = lowerBoundByCa(start, end, ca - reach)
			const to = lowerBoundByCa(from, end, ca + reach + 1)
			for (let other = from; other < to; other += 1) {
				const otherBase = other * 3
				const deltaL = pointL - sortedCentroid[otherBase]
				const deltaA = pointA - sortedCentroid[otherBase + 1]
				const deltaB = pointB - sortedCentroid[otherBase + 2]
				const squared = deltaL * deltaL + deltaA * deltaA + deltaB * deltaB
				if (squared > searchRadiusSquared) continue
				const bandwidth =
					pointBandwidth > sortedBandwidth[other] ? pointBandwidth : sortedBandwidth[other]
				total += sortedCount[other] * kappaFromSquaredRatio(squared / (bandwidth * bandwidth))
			}
		}
		mass[i] = total
	}

	return { mass, cellSide, occupiedCells }
}

/** Compute `m(c)` for every triple. `cellsPerBarOverride` exists for the refinement test and nothing else. */
export function computeSmoothedMass(
	table: TripleTable,
	cellsPerBarOverride?: number,
): SmoothedMass {
	const bandwidths = new Float64Array(table.colorCount)
	for (let i = 0; i < table.colorCount; i += 1) {
		bandwidths[i] = bandwidthOf([table.lab[i * 3], table.lab[i * 3 + 1], table.lab[i * 3 + 2]])
	}

	const forceLattice = cellsPerBarOverride !== undefined
	if (!forceLattice && table.colorCount <= SMOOTHED_MASS_EXACT_MAX_COLORS) {
		const mass = exactSmoothedMass(table, bandwidths)
		return {
			mode: "exact",
			cellSide: null,
			cellsPerBar: null,
			occupiedCells: null,
			truncationBandwidths: null,
			mass,
			massFraction: scaleByPixelCount(mass, table.pixelCount),
		}
	}

	const cellsPerBar = cellsPerBarOverride ?? SMOOTHED_MASS_LATTICE_CELLS_PER_BAR
	const { mass, cellSide, occupiedCells } = latticeSmoothedMass(table, bandwidths, cellsPerBar)
	return {
		mode: "lattice",
		cellSide,
		cellsPerBar,
		occupiedCells,
		truncationBandwidths: KERNEL_TRUNCATION_BANDWIDTHS,
		mass,
		massFraction: scaleByPixelCount(mass, table.pixelCount),
	}
}

function scaleByPixelCount(mass: Float64Array, pixelCount: number): Float64Array {
	const fraction = new Float64Array(mass.length)
	if (pixelCount === 0) return fraction
	for (let index = 0; index < mass.length; index += 1) fraction[index] = mass[index] / pixelCount
	return fraction
}
