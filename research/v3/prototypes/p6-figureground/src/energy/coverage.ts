/**
 * # Identity coverage — P5 moved out of the census and into the objective.
 *
 * Proposal §2.4 term 6: *"the mass-weighted transport cost from the artwork's chromatic mass to the
 * published set… Being mass-weighted and floorless, a major hue direction with no published colour
 * near it is expensive while a minor one pulls almost nothing — the asymmetry the pathology asks
 * for, and the reason it must not be an invariant."*
 *
 * ## What is computed, exactly
 *
 * `Σ_c m_c · min_{s ∈ S} ‖c − s‖`, over the artwork's colour mass `m` and the published set `S`,
 * with distance the contract's one ruler. Total mass is 1 (it is a share of frame area), so the term
 * is an OKLab distance: "how far, on average over the artwork's own pixels, is a colour from the
 * nearest colour the palette published".
 *
 * **Three properties are load-bearing and all three are deliberate.**
 *
 * - **Mass-weighted**, so the asymmetry is real: a hue direction carrying 20% of the frame and no
 *   published colour within 0.2 OKLab costs 0.04; one carrying 0.2% of the frame costs 0.0004.
 * - **Floorless.** No colour is ever dropped for being rare, no cell is ever pruned for carrying
 *   little mass, and there is no threshold anywhere in this file. That is the whole difference
 *   between a term and the rarity *rule* that `PHASE_1_AUTHOR_BRIEF.md` §3.1 open question 2 records
 *   as having had no discriminating power.
 * - **Non-negative**, which is what `./solve.ts` uses as its admissible bound: dropping the coverage
 *   term from a partial tuple's cost can only under-estimate the total, never over-estimate it.
 *
 * ## The one approximation, stated
 *
 * A true optimal-transport cost between the artwork's measure and a four-point set is exactly the
 * nearest-point cost above (transport to a finite set with no capacity constraint is pointwise), so
 * the *form* is not an approximation. What is approximate is the quadrature: mass is aggregated onto
 * a uniform OKLab grid of cell width `ENERGY_ANCHORS.coverageQuadratureStep` — the contract's pooled
 * same-colour bar — and each cell is transported from its own **mass-weighted centroid**, which the
 * aggregation carries exactly.
 *
 * So the error is bounded by the within-cell colour spread, which is under one same-colour bar; the
 * contract's own position is that colours that close are the same colour, so the transport cost is
 * not entitled to distinguish them. **No mass is discarded at any stage** — the grid is a summation
 * order, not a filter, and every one of the artwork's pixels is inside exactly one cell.
 */

import { rgbToOkLab } from "../../../../src/contract/color.ts"
import type { OkLab } from "../../../../src/contract/types.ts"
import type { DistinctTriple } from "../types.ts"
import { ENERGY_ANCHORS } from "./rates.ts"

/**
 * The artwork's colour mass, aggregated for the transport sum.
 *
 * One entry per occupied cell, in ascending packed-cell order so the summation order is a pure
 * function of the image — floating-point addition is not associative and determinism is rule 1.
 */
export type CoverageQuadrature = Readonly<{
	/** Mass share per cell; sums to 1 over all cells. */
	mass: Float64Array
	/** Mass-weighted centroid per cell, packed `[L, a, b]` per entry. */
	centroid: Float64Array
	cellCount: number
	/** Total pixels the mass was computed over — recorded so the term is auditable. */
	totalPixels: number
}>

function cellKey(lab: OkLab, step: number): number {
	const clamp = (value: number): number => {
		const index = Math.floor(value / step)
		return index < -127 ? -127 : index > 127 ? 127 : index
	}
	return ((clamp(lab[0]) + 128) << 16) | ((clamp(lab[1]) + 128) << 8) | (clamp(lab[2]) + 128)
}

/**
 * Aggregate the artwork's distinct triples into the transport quadrature.
 *
 * The mass of a triple is its exact pixel share — `count / totalPixels`. The lattice's smoothed
 * presence is not used here: coverage is a statement about *the artwork's* colour mass, and the
 * exact pixel census is what that is. (The lattice's smoothing exists to make role *decisions*
 * Lipschitz; a sum over all pixels is already Lipschitz in the pixels.)
 */
export function buildCoverageQuadrature(
	triples: readonly DistinctTriple[],
	totalPixels: number,
): CoverageQuadrature {
	const step = ENERGY_ANCHORS.coverageQuadratureStep
	const accumulator = new Map<number, { mass: number; l: number; a: number; b: number }>()
	let observedPixels = 0
	for (const triple of triples) {
		observedPixels += triple.count
		const key = cellKey(triple.lab, step)
		const cell = accumulator.get(key)
		if (cell === undefined) {
			accumulator.set(key, {
				mass: triple.count,
				l: triple.lab[0] * triple.count,
				a: triple.lab[1] * triple.count,
				b: triple.lab[2] * triple.count,
			})
			continue
		}
		cell.mass += triple.count
		cell.l += triple.lab[0] * triple.count
		cell.a += triple.lab[1] * triple.count
		cell.b += triple.lab[2] * triple.count
	}

	// Ascending packed-cell order: a fixed reduction order, so the same image gives the same sum.
	const keys = [...accumulator.keys()].sort((first, second) => first - second)
	const denominator = totalPixels > 0 ? totalPixels : (observedPixels > 0 ? observedPixels : 1)
	const mass = new Float64Array(keys.length)
	const centroid = new Float64Array(keys.length * 3)
	for (let index = 0; index < keys.length; index++) {
		const cell = accumulator.get(keys[index])!
		mass[index] = cell.mass / denominator
		centroid[index * 3] = cell.l / cell.mass
		centroid[index * 3 + 1] = cell.a / cell.mass
		centroid[index * 3 + 2] = cell.b / cell.mass
	}
	return { mass, centroid, cellCount: keys.length, totalPixels: denominator }
}

/** Distance from cell `index`'s centroid to an OKLab point. */
function distanceToCell(quadrature: CoverageQuadrature, index: number, point: OkLab): number {
	const base = index * 3
	const dl = quadrature.centroid[base] - point[0]
	const da = quadrature.centroid[base + 1] - point[1]
	const db = quadrature.centroid[base + 2] - point[2]
	return Math.sqrt(dl * dl + da * da + db * db)
}

/**
 * Per-cell distance to a set of colours that is fixed for a whole hypothesis (the background, the
 * published stops, and the surface when the hypothesis pins it).
 *
 * Precomputing this is the only reason a full coverage evaluation is affordable inside the search:
 * with it, a tuple costs one pass over the cells and one distance per *free* role.
 */
export function fixedCoverageDistances(
	quadrature: CoverageQuadrature,
	fixed: readonly OkLab[],
): Float64Array {
	const distances = new Float64Array(quadrature.cellCount).fill(Number.POSITIVE_INFINITY)
	for (let index = 0; index < quadrature.cellCount; index++) {
		let best = Number.POSITIVE_INFINITY
		for (const point of fixed) {
			const distance = distanceToCell(quadrature, index, point)
			if (distance < best) best = distance
		}
		distances[index] = best
	}
	return distances
}

/**
 * The transport cost of a published set: the fixed colours (via their precomputed distances) plus
 * the free roles' colours.
 *
 * Summed in ascending cell order — the same fixed reduction order the quadrature was built in.
 */
export function coverageCost(
	quadrature: CoverageQuadrature,
	fixedDistances: Float64Array,
	free: readonly OkLab[],
): number {
	let total = 0
	for (let index = 0; index < quadrature.cellCount; index++) {
		let best = fixedDistances[index]
		for (const point of free) {
			const distance = distanceToCell(quadrature, index, point)
			if (distance < best) best = distance
		}
		total += quadrature.mass[index] * best
	}
	return total
}

/**
 * **The coverage gain of a single colour** — how much transport cost it would remove on its own,
 * given the colours the hypothesis already fixes.
 *
 * `gain(x) = Σ_c m_c · max(0, fixedDistance[c] − ‖c − x‖)`, per candidate. Non-negative by
 * construction, and the reason it exists is the admissible bound in `./solve.ts`:
 *
 * > `coverage(fixed ∪ free) ≥ C_fixed − Σ_{x ∈ free} gain(x)`
 *
 * **Proof, per cell.** The cell's final distance is `min(f, min_x d_x)` where `f = fixedDistance[c]`.
 * If that minimum is `f`, the right-hand side is `f − Σ(f − d_x)⁺ ≤ f`. If it is some `d_y ≤ f`,
 * then `f − Σ(f − d_x)⁺ ≤ f − (f − d_y) = d_y`. Either way the right-hand side does not exceed the
 * left. Summing mass-weighted over cells preserves it. (The inequality is exactly submodularity:
 * two colours covering the same mass are counted twice on the right and once on the left, so the
 * bound is loose where roles overlap and tight where they do not — which is the useful direction.)
 *
 * Without this, the only admissible statement about coverage is `≥ 0`, and the search then explores
 * every tuple whose unary cost is within the *whole* coverage term of the incumbent's. On a real
 * artwork that is not a search that finishes.
 */
export function coverageGains(
	quadrature: CoverageQuadrature,
	fixedDistances: Float64Array,
	points: readonly OkLab[],
): Float64Array {
	const gains = new Float64Array(points.length)
	for (let index = 0; index < points.length; index++) {
		const point = points[index]
		let gain = 0
		for (let cell = 0; cell < quadrature.cellCount; cell++) {
			const reduction = fixedDistances[cell] - distanceToCell(quadrature, cell, point)
			if (reduction > 0) gain += quadrature.mass[cell] * reduction
		}
		gains[index] = gain
	}
	return gains
}

/** Convenience for tests and for the audit surface: coverage of an explicit colour list. */
export function coverageOf(
	quadrature: CoverageQuadrature,
	published: readonly OkLab[],
): number {
	return coverageCost(quadrature, fixedCoverageDistances(quadrature, published), [])
}

/** The OKLab point of a published 8-bit triple, for callers assembling a coverage set. */
export function labOfTriple(triple: DistinctTriple): OkLab {
	return triple.lab ?? rgbToOkLab(triple.rgb)
}
