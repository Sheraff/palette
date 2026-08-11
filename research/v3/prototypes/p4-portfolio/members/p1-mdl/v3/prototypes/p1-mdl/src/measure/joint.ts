/**
 * The (t, colour) joint — the second pass over pixels.
 *
 * Arm A′ §2.1: *"Pass two, given those candidate geometries, accumulates the joint distribution of
 * (position parameter t, colour) — a coarse colour lattice against a fixed number of t quantile bins.
 * This is the only thing the energy needs that first-order moments cannot supply: how a colour's
 * pixels are distributed along the ramp, which is what distinguishes a colour that lies on the field
 * from a colour that sits on top of it."*
 *
 * One joint per geometry, all three built from the same lattice so they are comparable cell for cell.
 *
 * **Quantile bins, not equal-width bins.** Equal-width bins in `t` are equal-*area* bins only for the
 * linear geometry; for the radial one they would put a handful of pixels in the innermost bin and a
 * quarter of the image in the outermost. Quantile bins carry equal image mass under every geometry,
 * which is what makes "this colour occupies the first three bins" mean the same thing across the
 * three.
 */

import {
	JOINT_LATTICE_CELLS_PER_BAR,
	T_HISTOGRAM_BINS,
	T_QUANTILE_BINS,
	TIGHTEST_SAME_COLOR_BAR,
} from "./constants.ts"
import type { Geometries } from "./geometry.ts"
import { makeTFunctions } from "./geometry.ts"
import type { TripleTable } from "./triples.ts"

/** The coarse OKLab lattice the joint's colour axis is built on. */
export type ColorLattice = Readonly<{
	cellSide: number
	cellsPerBar: number
	cellCount: number
	/** Packed lattice keys, ascending — the canonical cell order. */
	cellKeys: Float64Array
	/** Mass-weighted OKLab centroid per cell, flat `3 · cellCount`. */
	cellLab: Float64Array
	/** Exact pixel count per cell. */
	cellMass: Float64Array
	/** Cell index for each triple, in the triple table's canonical order. */
	tripleCell: Int32Array
}>

/** A sparse (cell, t bin) contingency table. */
export type TColorJoint = Readonly<{
	binCount: number
	/** `binCount + 1` edges in t, ascending, spanning [0,1]. */
	binEdges: Float64Array
	/** Exact pixel count per t bin. Nearly equal by construction. */
	binMass: Float64Array
	/** Number of populated (cell, bin) pairs. */
	entryCount: number
	/** Lattice cell index per entry, ascending, ties broken by `entryBin`. */
	entryCell: Int32Array
	/** t bin index per entry. */
	entryBin: Int32Array
	/** Exact pixel count per entry. */
	entryMass: Float64Array
}>

export type Joints = Readonly<{
	lattice: ColorLattice
	linear: TColorJoint
	radial: TColorJoint
	conic: TColorJoint
}>

/** Same packing as `smoothed-mass.ts`; see the note there on why these two numbers are enough. */
const LATTICE_COORDINATE_OFFSET = 4096
const LATTICE_RADIX = 8192

function buildLattice(table: TripleTable, cellsPerBar: number): ColorLattice {
	const cellSide = TIGHTEST_SAME_COLOR_BAR / cellsPerBar
	const indexByKey = new Map<number, number>()
	const keys: number[] = []
	const mass: number[] = []
	const sumL: number[] = []
	const sumA: number[] = []
	const sumB: number[] = []
	const tripleCellUnsorted = new Int32Array(table.colorCount)

	for (let row = 0; row < table.colorCount; row += 1) {
		const base = row * 3
		const cl = Math.floor(table.lab[base] / cellSide)
		const ca = Math.floor(table.lab[base + 1] / cellSide)
		const cb = Math.floor(table.lab[base + 2] / cellSide)
		const key =
			((cl + LATTICE_COORDINATE_OFFSET) * LATTICE_RADIX + (ca + LATTICE_COORDINATE_OFFSET)) *
				LATTICE_RADIX +
			(cb + LATTICE_COORDINATE_OFFSET)
		let cell = indexByKey.get(key)
		if (cell === undefined) {
			cell = keys.length
			indexByKey.set(key, cell)
			keys.push(key)
			mass.push(0)
			sumL.push(0)
			sumA.push(0)
			sumB.push(0)
		}
		tripleCellUnsorted[row] = cell
		const count = table.counts[row]
		mass[cell] += count
		sumL[cell] += count * table.lab[base]
		sumA[cell] += count * table.lab[base + 1]
		sumB[cell] += count * table.lab[base + 2]
	}

	const order = Array.from({ length: keys.length }, (_unused, cell) => cell).sort(
		(left, right) => keys[left] - keys[right],
	)
	const rank = new Int32Array(keys.length)
	for (let position = 0; position < order.length; position += 1) rank[order[position]] = position

	const cellCount = keys.length
	const cellKeys = new Float64Array(cellCount)
	const cellLab = new Float64Array(cellCount * 3)
	const cellMass = new Float64Array(cellCount)
	for (let position = 0; position < cellCount; position += 1) {
		const cell = order[position]
		cellKeys[position] = keys[cell]
		cellMass[position] = mass[cell]
		cellLab[position * 3] = sumL[cell] / mass[cell]
		cellLab[position * 3 + 1] = sumA[cell] / mass[cell]
		cellLab[position * 3 + 2] = sumB[cell] / mass[cell]
	}

	const tripleCell = new Int32Array(table.colorCount)
	for (let row = 0; row < table.colorCount; row += 1) {
		tripleCell[row] = rank[tripleCellUnsorted[row]]
	}

	return { cellSide, cellsPerBar, cellCount, cellKeys, cellLab, cellMass, tripleCell }
}

/**
 * Map each fine histogram bin to a quantile bin, and report the resulting edges.
 *
 * All pixels sharing a fine bin land in the same quantile bin, so the quantile bins carry equal mass
 * only up to the fine histogram's resolution — 1/4096 of the parameter's range against bins that are
 * 1/32 of it, i.e. an imbalance of at most one 128th of a bin. Stated rather than hidden: the
 * alternative, splitting a fine bin between two quantile bins, would need a tie-break on pixels that
 * are genuinely indistinguishable in `t` and would make the joint depend on raster order.
 */
function quantiseHistogram(histogram: Float64Array, pixelCount: number): {
	quantileOfFine: Int32Array
	binEdges: Float64Array
} {
	const quantileOfFine = new Int32Array(histogram.length)
	const binEdges = new Float64Array(T_QUANTILE_BINS + 1)
	binEdges[T_QUANTILE_BINS] = 1

	let cumulativeBefore = 0
	let assigned = -1
	for (let fine = 0; fine < histogram.length; fine += 1) {
		const midpointRank = cumulativeBefore + histogram[fine] / 2
		let bin = pixelCount === 0 ? 0 : Math.floor((T_QUANTILE_BINS * midpointRank) / pixelCount)
		if (bin < 0) bin = 0
		if (bin > T_QUANTILE_BINS - 1) bin = T_QUANTILE_BINS - 1
		quantileOfFine[fine] = bin
		while (assigned < bin) {
			assigned += 1
			binEdges[assigned] = fine / histogram.length
		}
		cumulativeBefore += histogram[fine]
	}
	while (assigned < T_QUANTILE_BINS - 1) {
		assigned += 1
		binEdges[assigned] = 1
	}
	binEdges[0] = 0
	return { quantileOfFine, binEdges }
}

function buildJoint(
	lattice: ColorLattice,
	pixelTripleIndex: Int32Array,
	width: number,
	height: number,
	tOf: (x: number, y: number) => number,
	tBuffer: Float32Array,
): TColorJoint {
	const pixelCount = width * height
	const histogram = new Float64Array(T_HISTOGRAM_BINS)

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			tBuffer[y * width + x] = tOf(x, y)
			// Read back rather than using the float64 value: the buffer is float32, and the second pass
			// bins what the buffer holds. Deriving the fine bin from the wider value here could put one
			// pixel in a different bin in each pass, which is the sort of near-tie that turns into an
			// irreproducible joint. Float32 resolves t to ~1e-7, three orders finer than the 1/4096
			// histogram, so nothing else is lost.
			let fine = Math.floor(tBuffer[y * width + x] * T_HISTOGRAM_BINS)
			if (fine < 0) fine = 0
			if (fine > T_HISTOGRAM_BINS - 1) fine = T_HISTOGRAM_BINS - 1
			histogram[fine] += 1
		}
	}

	const { quantileOfFine, binEdges } = quantiseHistogram(histogram, pixelCount)

	const binMass = new Float64Array(T_QUANTILE_BINS)
	const entries = new Map<number, number>()
	for (let pixel = 0; pixel < pixelCount; pixel += 1) {
		let fine = Math.floor(tBuffer[pixel] * T_HISTOGRAM_BINS)
		if (fine < 0) fine = 0
		if (fine > T_HISTOGRAM_BINS - 1) fine = T_HISTOGRAM_BINS - 1
		const bin = quantileOfFine[fine]
		binMass[bin] += 1
		const cell = lattice.tripleCell[pixelTripleIndex[pixel]]
		const key = cell * T_QUANTILE_BINS + bin
		entries.set(key, (entries.get(key) ?? 0) + 1)
	}

	// Canonical entry order: ascending (cell, bin), which is ascending packed key.
	const keys = Array.from(entries.keys()).sort((left, right) => left - right)
	const entryCell = new Int32Array(keys.length)
	const entryBin = new Int32Array(keys.length)
	const entryMass = new Float64Array(keys.length)
	for (let index = 0; index < keys.length; index += 1) {
		entryCell[index] = Math.floor(keys[index] / T_QUANTILE_BINS)
		entryBin[index] = keys[index] % T_QUANTILE_BINS
		entryMass[index] = entries.get(keys[index]) as number
	}

	return {
		binCount: T_QUANTILE_BINS,
		binEdges,
		binMass,
		entryCount: keys.length,
		entryCell,
		entryBin,
		entryMass,
	}
}

export function computeJoints(
	table: TripleTable,
	pixelTripleIndex: Int32Array,
	geometries: Geometries,
	width: number,
	height: number,
): Joints {
	const lattice = buildLattice(table, JOINT_LATTICE_CELLS_PER_BAR)
	const tFunctions = makeTFunctions(geometries, Math.min(width, height))
	// One reusable buffer rather than three: the three joints are built in sequence and none of them
	// needs another's `t` values once its own counting is done.
	const tBuffer = new Float32Array(width * height)
	return {
		lattice,
		linear: buildJoint(lattice, pixelTripleIndex, width, height, tFunctions.linear, tBuffer),
		radial: buildJoint(lattice, pixelTripleIndex, width, height, tFunctions.radial, tBuffer),
		conic: buildJoint(lattice, pixelTripleIndex, width, height, tFunctions.conic, tBuffer),
	}
}
