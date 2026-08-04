/**
 * `BuildLattice` — the figure–ground measure, quantised once onto a quadrature grid.
 *
 * Proposal §2.2. Two objects come out of one pass over the pixels:
 *
 * - the **feasible set**: every distinct 8-bit triple of the artwork with its exact pixel count,
 *   never filtered, because in this design no colour is ever removed by fiat;
 * - the **fields over colour**: an OKLab lattice of accumulator channels, convolved once at
 *   bandwidth `h`, from which every per-candidate statistic the energy consumes is one read.
 *
 * Every value in `CandidateStats` is therefore an **area integral against a smooth kernel of
 * bandwidth h**, which is the property the whole paradigm's robustness argument rests on
 * (proposal §2.6). Nothing in this module thresholds, bins-and-decides, or publishes a lattice cell:
 * the lattice is quadrature and the published colours can only ever come from `triples`.
 *
 * ## Deviation from SPEC, stated up front
 *
 * SPEC and the proposal specify a **trilinear** splat and read. This module uses a **triquadratic**
 * (quadratic B-spline, 27-node) assignment instead, because trilinear was measured to leave a 14%
 * sub-cell phase ripple on `presence` at the finest cell width the memory budget allows — a
 * quantity that a ±1 LSB dither moves, which is the paradigm's own falsifier. The reasoning, the
 * measurements and the alternatives considered are in `grid.ts` and `constants.ts`. Nothing else
 * about the mechanism changes: one lattice, one separable Gaussian convolution, reads by
 * interpolation, and the published colours still come only from `triples`.
 *
 * ## Two readings of the interface, stated rather than assumed
 *
 * `CandidateStats` leaves two normalisations to the implementer, and both choices are load-bearing
 * for W4, so they are recorded here and in the module report:
 *
 * - **`inkEnergy` / `markEnergy` are unnormalised area integrals**, `∫ K_h(c(x) − v) · e(x) dx`,
 *   in units of (frame-area fraction × energy density). The proposal calls them "M-weighted
 *   integrals", and the role-fitness term wants *how much ink of this colour there is*, not the mean
 *   ink energy of however few pixels carry it — a single high-|ΔL| pixel must not score like a
 *   headline. Divide by `presence` if a mean is ever wanted.
 * - **`spatialSpread` is divided by the uniform-fill value** (`UNIFORM_FRAME_SPATIAL_SPREAD`, 1/6),
 *   so 1.0 = "as spread out as a uniform fill of the frame" and 0 = "a point". This mirrors the
 *   1.0 = no-preference convention `borderAffinity` states in its own doc comment, so the two
 *   spatial statistics read on the same scale.
 */

import type { OkLab } from "../../../../src/contract/types.ts"
import type { BuildLattice, CandidateStats, Lattice, Substrate } from "../types.ts"
import { LATTICE_BANDWIDTH, LATTICE_CHANNELS, LATTICE_MASS_FLOOR, UNIFORM_FRAME_SPATIAL_SPREAD } from "./constants.ts"
import { buildField, type LatticeField } from "./grid.ts"
import { buildNearestIndex } from "./nearest.ts"
import { enumerateDistinctTriples } from "./triples.ts"

export {
	LATTICE_ASSIGNMENT_NODES,
	LATTICE_BANDWIDTH,
	LATTICE_CELLS_PER_BANDWIDTH,
	LATTICE_CHANNELS,
} from "./constants.ts"
export { buildField, buildKernel, chooseGeometry, convolveStack, occupiedBounds, splatField } from "./grid.ts"
export type { LatticeField, LatticeGeometry } from "./grid.ts"
export { buildNearestIndex } from "./nearest.ts"
export { enumerateDistinctTriples, tripleKey } from "./triples.ts"
export type { TripleTable } from "./triples.ts"

/**
 * Quadrature knobs, exposed only so `tools/sensitivity.ts` can perturb them as the *comparison
 * class* for the exchange rates (P6 README, falsifier 3): a quadrature choice that moves palettes
 * is a violated design, so these must be flat where the rates are not. The pipeline never passes
 * them.
 */
export type LatticeOptions = Readonly<{
	bandwidth?: number
	cellsPerBandwidth?: number
}>

function statsFromChannels(
	read: Float64Array,
	lab: OkLab,
	field: LatticeField,
): CandidateStats {
	const mass = read[0]!
	const denominator = mass + LATTICE_MASS_FLOOR
	const inverseFrame = 1 / field.pixelCount

	// The floor's share of the denominator, so every ratio decays continuously to its least
	// committal value (the query point itself, or zero) instead of branching at zero mass.
	const floorShare = LATTICE_MASS_FLOOR / denominator

	const meanX = read[7]! / denominator
	const meanY = read[8]! / denominator
	const secondMoment = read[9]! / denominator
	const variance = secondMoment - meanX * meanX - meanY * meanY

	const centroidL = read[11]! / denominator + floorShare * lab[0]
	const centroidA = read[12]! / denominator + floorShare * lab[1]
	const centroidB = read[13]! / denominator + floorShare * lab[2]

	return {
		presence: mass * inverseFrame,
		groundMass: read[14]! * inverseFrame,
		inkEnergy: read[1]! * inverseFrame,
		markEnergy: read[2]! * inverseFrame,
		habitualGround: [
			read[3]! / denominator + floorShare * lab[0],
			read[4]! / denominator + floorShare * lab[1],
			read[5]! / denominator + floorShare * lab[2],
		],
		fieldLikeness: read[6]! / denominator,
		spatialSpread: Math.max(variance, 0) / UNIFORM_FRAME_SPATIAL_SPREAD,
		borderAffinity: read[10]! / denominator / field.annulusAreaFraction,
		centroidDistance: Math.hypot(lab[0] - centroidL, lab[1] - centroidA, lab[2] - centroidB),
	}
}

/**
 * Build the lattice for one substrate.
 *
 * Deterministic: raster pixel order, Float64 accumulation, a fixed convolution axis order, and a
 * nearest-triple search whose only tie-break is the declared total order on the 8-bit triple.
 */
export function buildLatticeWith(substrate: Substrate, options: LatticeOptions = {}): Lattice {
	const bandwidth = options.bandwidth ?? LATTICE_BANDWIDTH
	const table = enumerateDistinctTriples(substrate.planes)
	const field = buildField(substrate, bandwidth, table, options.cellsPerBandwidth)
	const nearestIndex = buildNearestIndex(table.triples, table.keys)

	// One scratch read buffer: `statsAt` is called ~10⁵ times per image and must not allocate.
	const scratch = new Float64Array(LATTICE_CHANNELS)

	const statsAt = (lab: OkLab): CandidateStats => {
		field.read(lab, scratch)
		return statsFromChannels(scratch, lab, field)
	}

	return {
		triples: table.triples,
		statsAt,
		nearestTriple: nearestIndex.nearest,
		distanceToArtwork: nearestIndex.distance,
		bandwidth,
	}
}

/** The `BuildLattice` the pipeline wires up. */
export const buildLattice: BuildLattice = (substrate) => buildLatticeWith(substrate)
