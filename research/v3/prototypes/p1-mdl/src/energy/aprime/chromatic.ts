/**
 * # The residual's density — chromatic, not mass-proportional
 *
 * `DESIGN.md` fold item 11, the recorded repair this module *is*:
 *
 * > *"a residual whose density is chromatic (colour-space) rather than mass-proportional — a change
 * > to the prior, not a bolt-on term"*
 *
 * ## What changed, in one line
 *
 * v0.1.0 coded an unexplained triple against the image's **smoothed mass** `m(c) = Σ_c' n(c')·κ(c,c')`.
 * v0.2.0 codes it against the image's **colour-space occupancy** — the same kernel sum with the pixel
 * counts `n(c')` removed and each occupied cell of the identity-bar lattice counted exactly once:
 *
 *     ρ(c) = Σ_{occupied cells q} κ( d_OKLab(c, x_q), h(c, x_q) )      [no mass anywhere]
 *     p_generic(c) = ρ(cell(c)) / Σ_{c' ∈ alphabet} ρ(cell(c'))
 *
 * `ρ` answers *"how crowded is this colour's neighbourhood in **colour space**"* — how many distinct
 * colours the artwork puts within an identity bar or two of it — where `m` answered *"how much pixel
 * mass sits nearby"*. Nothing else in the energy moves: the alphabet is still the image's K distinct
 * triples, `p_generic` is still a proper distribution over it (so the code length is still a code
 * length and still finite), and the assignment in `index.ts` is untouched.
 *
 * ## Why that is the repair and not a tweak
 *
 * Under `m`, the per-pixel generic cost of a colour falls with the *mass* near it, so the bulk of a
 * cover is cheap for a reason that is about area, and `n(c) × cost` made bulk the only thing worth
 * naming: the M3 round measured `genericBits` at 78–99.9% of A′'s total energy on 8/8 items, and its
 * two best-graded palettes were its two *least*-covering. Under `ρ` the per-pixel cost falls with the
 * *number of distinct colours* near it, and the criterion for a name to repay becomes mass-free.
 * Write it out — a colour is worth naming as ink exactly when its ink code is shorter than its
 * generic one:
 *
 *     log₂ Z(c) + chain ≤ log₂ Σρ − log₂ ρ(c)      ⟺      ρ(c) · Z(c) ≤ Σρ / 2^chain
 *
 * `Z(c)` (the kernel normaliser, `index.ts`) and `ρ(c)` are both crowding counts, so **whether a name
 * pays is decided by chromatic isolation alone; mass only scales a gain it never decides.** A large
 * dull region sits where many distinct shades sit — high `ρ`, cheap generically, unnameable however
 * much of the frame it covers. A signature red that the artwork uses once sits alone — `ρ ≈ 1`,
 * expensive generically, and it repays its 24 bits. That sentence is `DESIGN.md` item 11's
 * *"the reviewer prices distinct-chromatic coverage UP while bulk-mass coverage is not the currency"*,
 * as arithmetic rather than as a term.
 *
 * ## The alternative that was rejected
 *
 * **Uniform over the image's occupied colour-space footprint**, `p_generic(c) = 1/Ω` — the obvious
 * reading of "chromatic density", and it is *rejected on arithmetic*. A uniform density is a
 * **constant** `log₂ Ω` bits per pixel for every triple, so the per-pixel saving from naming a colour
 * becomes `log₂ Ω − (its own code + support)` and the ordering of naming gains collapses to the
 * ordering of `n(c)` — i.e. exactly the mass-coverage failure the repair exists to remove, now with
 * the isolation signal deleted as well. Concretely, on fixture (d): `Ω = 3` gives 1.585 bits/pixel,
 * below the ink code's flat 3-bit chain charge, so *no* colour is ever worth naming and the arm's
 * central mechanism (§2.3, the naming gain) disappears entirely. On a 25k-triple cover it gives a
 * flat ≈11.5 bits/pixel and the argmin is pure coverage. Occupancy is the right *measure*; uniform is
 * the wrong *density* on it. `ρ` keeps the measure and puts the kernel back.
 *
 * ## Where the occupancy comes from — no new constant
 *
 * The lattice is `measurement.joints.lattice`, `[INHERITED]`: the measurement's own coarse OKLab
 * lattice at `JOINT_LATTICE_CELLS_PER_BAR = 1`, i.e. **one cell per identity bar**. That is the
 * resolution at which the contract says two colours are the same colour, so "one occupied cell = one
 * distinct colour" needs no threshold and no digit of its own. Cell representatives are the lattice's
 * own centroids — a position inside a bar-sized box, which is all the kernel needs; the *weights* are
 * occupancy (1 per occupied cell), and that is the whole of the mass-free claim. The kernel, its pair
 * bandwidth and its truncation radius are `[INHERITED]` from `src/measure/kernel.ts` and
 * `src/measure/constants.ts` unchanged. **This module introduces no constant of any kind.**
 *
 * Counting *cells* rather than *triples* matters on real covers and not at all on the fixtures: a
 * dithered or JPEG-mushed gradient produces thousands of triples inside a handful of bars, and
 * counting triples would let compression noise inflate a region's chromatic footprint. Occupancy at
 * the bar is the volume-like quantity item 11 asks for — *"how much distinct colour-space it
 * occupies"*.
 *
 * ## Cost and determinism
 *
 * `ρ` is a function of the measurement alone — no configuration enters — so it is computed once per
 * image and cached in a `WeakMap` keyed by the measurement object. The cache is an optimisation with
 * no observable effect: the same measurement yields the same array either way. The neighbour scan is
 * the slab index `smoothed-mass.ts` uses, over cells sorted by `(cl, ca, cb)`; no `Map` is ever
 * iterated, and every loop runs in that canonical order.
 */

import { KERNEL_BANDWIDTH_BY_REGION, KERNEL_TRUNCATION_BANDWIDTHS } from "../../measure/constants.ts"
import { bandwidthOf, kappa } from "../../measure/kernel.ts"
import type { Measurement } from "../../measure/types.ts"

/** The residual's density for one image, in the triple table's canonical order. */
export type ChromaticResidual = Readonly<{
	/** `Ω` — occupied cells of the image's colour-space footprint, at one cell per identity bar. */
	occupiedCells: number
	/** `ρ(q)` per lattice cell, in the lattice's own cell order. Never below 1 (`κ(0) = 1`). */
	cellDensity: Float64Array
	/** `−log₂ p_generic(c)` per triple: the bits a pixel of `c` costs when nobody names it. */
	bitsPerPixel: Float64Array
	/** `log₂ Σ_c ρ(cell(c))` — the normaliser, reported so the two halves can be read apart. */
	log2Normaliser: number
}>

/** The loosest regional bar; the conservative upper bound on any pair bandwidth. */
const LOOSEST_SAME_COLOR_BAR = Math.max(...Object.values(KERNEL_BANDWIDTH_BY_REGION))

const CACHE = new WeakMap<Measurement, ChromaticResidual>()

/**
 * `ρ` and the residual's per-pixel code lengths for one image.
 *
 * Pure, total and finite: `ρ(q) ≥ κ(0) = 1` for every occupied cell, so no logarithm here can reach
 * `−∞`, and a triple whose cell is missing (which cannot happen for a triple with pixels) falls back
 * to the isolated value rather than to `Infinity`.
 */
export function chromaticResidual(measurement: Measurement): ChromaticResidual {
	const cached = CACHE.get(measurement)
	if (cached !== undefined) return cached
	const computed = computeChromaticResidual(measurement)
	CACHE.set(measurement, computed)
	return computed
}

function computeChromaticResidual(measurement: Measurement): ChromaticResidual {
	const { colorCount } = measurement.triples
	const lattice = measurement.joints.lattice
	const cellCount = lattice.cellCount
	const cellSide = lattice.cellSide

	if (colorCount === 0 || cellCount === 0) {
		return {
			occupiedCells: cellCount,
			cellDensity: new Float64Array(cellCount),
			bitsPerPixel: new Float64Array(colorCount),
			log2Normaliser: 0,
		}
	}

	// --- lattice coordinates, from the cells' own representatives ---------------------------------
	// A cell's centroid is the mass-weighted mean of points inside an axis-aligned box, so it lies
	// inside that box and `floor(centroid / side)` recovers the box. Recovered rather than read
	// because `ColorLattice` publishes packed keys, and unpacking someone else's packing is a
	// coupling this module does not need.
	const cellL = new Int32Array(cellCount)
	const cellA = new Int32Array(cellCount)
	const bandwidth = new Float64Array(cellCount)
	for (let cell = 0; cell < cellCount; cell += 1) {
		const base = cell * 3
		cellL[cell] = Math.floor(lattice.cellLab[base] / cellSide)
		cellA[cell] = Math.floor(lattice.cellLab[base + 1] / cellSide)
		bandwidth[cell] = bandwidthOf([
			lattice.cellLab[base],
			lattice.cellLab[base + 1],
			lattice.cellLab[base + 2],
		])
	}

	// --- canonical order: ascending (cl, ca, cb), ties by cell index ------------------------------
	const order = Array.from({ length: cellCount }, (_unused, cell) => cell).sort((left, right) => {
		if (cellL[left] !== cellL[right]) return cellL[left] - cellL[right]
		if (cellA[left] !== cellA[right]) return cellA[left] - cellA[right]
		const leftB = lattice.cellLab[left * 3 + 2]
		const rightB = lattice.cellLab[right * 3 + 2]
		if (leftB !== rightB) return leftB - rightB
		return left - right
	})

	const sortedL = new Int32Array(cellCount)
	const sortedA = new Int32Array(cellCount)
	const sortedLab = new Float64Array(cellCount * 3)
	const sortedBandwidth = new Float64Array(cellCount)
	for (let position = 0; position < cellCount; position += 1) {
		const cell = order[position]
		sortedL[position] = cellL[cell]
		sortedA[position] = cellA[cell]
		sortedLab[position * 3] = lattice.cellLab[cell * 3]
		sortedLab[position * 3 + 1] = lattice.cellLab[cell * 3 + 1]
		sortedLab[position * 3 + 2] = lattice.cellLab[cell * 3 + 2]
		sortedBandwidth[position] = bandwidth[cell]
	}

	// Slab index over lightness: cells sharing `cl` are contiguous, and inside a slab `ca` ascends.
	const slabStart = new Map<number, number>()
	const slabEnd = new Map<number, number>()
	for (let position = 0; position < cellCount; position += 1) {
		const slab = sortedL[position]
		if (!slabStart.has(slab)) slabStart.set(slab, position)
		slabEnd.set(slab, position + 1)
	}

	/** First position in `[start, end)` whose `ca` is at least `target`. */
	function lowerBoundByA(start: number, end: number, target: number): number {
		let low = start
		let high = end
		while (low < high) {
			const middle = (low + high) >> 1
			if (sortedA[middle] < target) low = middle + 1
			else high = middle
		}
		return low
	}

	// The truncation radius is taken at the *loosest* regional bar, so no pair bandwidth can exceed
	// the one the radius was computed for and no contribution inside the cutoff is missed. One extra
	// cell of reach because a representative may sit anywhere inside its cell.
	const searchRadius = KERNEL_TRUNCATION_BANDWIDTHS * LOOSEST_SAME_COLOR_BAR
	const searchRadiusSquared = searchRadius * searchRadius
	const reach = Math.ceil(searchRadius / cellSide) + 1
	const truncationSquaredRatio = KERNEL_TRUNCATION_BANDWIDTHS * KERNEL_TRUNCATION_BANDWIDTHS

	// --- ρ, in sorted order, then scattered back to the lattice's own cell order -------------------
	const sortedDensity = new Float64Array(cellCount)
	for (let position = 0; position < cellCount; position += 1) {
		const base = position * 3
		const pointL = sortedLab[base]
		const pointA = sortedLab[base + 1]
		const pointB = sortedLab[base + 2]
		const pointBandwidth = sortedBandwidth[position]
		let total = 0
		for (let slab = sortedL[position] - reach; slab <= sortedL[position] + reach; slab += 1) {
			const start = slabStart.get(slab)
			if (start === undefined) continue
			const end = slabEnd.get(slab) as number
			const from = lowerBoundByA(start, end, sortedA[position] - reach)
			const to = lowerBoundByA(from, end, sortedA[position] + reach + 1)
			for (let other = from; other < to; other += 1) {
				const otherBase = other * 3
				const deltaL = pointL - sortedLab[otherBase]
				const deltaA = pointA - sortedLab[otherBase + 1]
				const deltaB = pointB - sortedLab[otherBase + 2]
				const squared = deltaL * deltaL + deltaA * deltaA + deltaB * deltaB
				if (squared > searchRadiusSquared) continue
				const pair =
					pointBandwidth > sortedBandwidth[other] ? pointBandwidth : sortedBandwidth[other]
				// The definitional cutoff, at the pair bandwidth, exactly as `smoothed-mass.ts` applies
				// it: `κ = 0` at and above `u = KERNEL_TRUNCATION_BANDWIDTHS²`. Occupancy weight 1.
				if (squared >= truncationSquaredRatio * pair * pair) continue
				total += kappa(Math.sqrt(squared), pair)
			}
		}
		sortedDensity[position] = total
	}

	const cellDensity = new Float64Array(cellCount)
	for (let position = 0; position < cellCount; position += 1) {
		cellDensity[order[position]] = sortedDensity[position]
	}

	// --- the code lengths over the alphabet of triples ---------------------------------------------
	// `p_generic(c) = ρ(cell(c)) / Σ_c' ρ(cell(c'))`: a proper distribution over the image's own K
	// distinct triples, exactly as `p_field` and `p_ink` are, so the three codes remain comparable
	// bits over one alphabet and every one of them is finite.
	let normaliser = 0
	for (let row = 0; row < colorCount; row += 1) {
		const cell = lattice.tripleCell[row]
		normaliser += cell >= 0 ? cellDensity[cell] : 1
	}
	const log2Normaliser = normaliser > 0 ? Math.log2(normaliser) : 0

	const bitsPerPixel = new Float64Array(colorCount)
	for (let row = 0; row < colorCount; row += 1) {
		const cell = lattice.tripleCell[row]
		const density = cell >= 0 && cellDensity[cell] > 0 ? cellDensity[cell] : 1
		bitsPerPixel[row] = log2Normaliser - Math.log2(density)
	}

	return { occupiedCells: cellCount, cellDensity, bitsPerPixel, log2Normaliser }
}
