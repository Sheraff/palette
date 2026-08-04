/**
 * The OKLab quadrature lattice: splat of the accumulator channels, one separable Gaussian
 * convolution, and reads.
 *
 * This file is the whole of proposal §2.2's "computationally these are one object". Every candidate
 * statistic the energy consumes is an *area integral of a pixel quantity against a smooth kernel
 * centred on a colour*, and all of them are computed here at once: the accumulator channels are
 * splatted onto a uniform lattice over the OKLab range the artwork actually occupies, the stack is
 * convolved once with a separable Gaussian at bandwidth `h`, and every statistic afterwards is a
 * read of the same stack.
 *
 * ## The lattice is quadrature, not a decision — and that had to be earned, not asserted
 *
 * The design's requirement is exact: the effective kernel must be the peak-1 Gaussian at bandwidth
 * `h` *wherever a colour happens to sit inside its cell*, because a statistic that depends on a
 * colour's sub-cell phase is a statistic a cell boundary decided. Two things deliver it, and the
 * first is a **deviation from SPEC, reported rather than smoothed over**:
 *
 * 1. **The assignment is triquadratic (quadratic B-spline, 27 nodes), not trilinear.** SPEC and the
 *    proposal say trilinear. Trilinear, measured: with the cell width the design permits (h/2), the
 *    composite splat→convolve→read kernel varies by **14%** with sub-cell phase — an error that is
 *    smooth, so nothing spikes and no test of continuity catches it, and that is *exactly* the
 *    dither-scale artefact the paradigm exists to remove, since a ±1 LSB dither moves a colour by a
 *    fraction of a cell and so moves the ripple. Interlacing two half-offset grids gets it to 3.5%
 *    at double the cost; raising the resolution needs cell ≈ h/7 and gigabytes. The quadratic
 *    B-spline gets it to **0.5%** at the same cell width, for one extra node per axis. The
 *    requirement in the proposal is the *property* ("no cell boundary can flip an outcome"), and
 *    trilinear does not deliver it here; this does. `tests/lattice.test.ts` re-derives statistics
 *    from a naive per-pixel Gaussian sum and pins the agreement.
 * 2. **The assignment is inverted in the kernel, not approximated.** See {@link buildKernel}.
 *
 * ## Why the splat is over distinct triples, not over pixels
 *
 * The colour measure is *atomic*: it is a sum of point masses at the artwork's distinct 8-bit
 * triples, and there are 10⁴–10⁵ of those against 10⁶ pixels. So the pixel pass accumulates the 14
 * per-pixel channels into per-triple totals — **exactly**, with no quadrature at all — and only the
 * triples are splatted. That is both faster and more accurate than splatting each pixel: the only
 * approximation left in the colour direction is the one the lattice is for.
 *
 * Channel 14 (ground mass) is the exception. It is splatted at each pixel's *coarsest surround*
 * colour, which is a blurred value and so genuinely per-pixel, and it is splatted with the same
 * assignment so its quadrature matches every other channel's.
 *
 * ## Channel map
 *
 * | # | accumulator | serves |
 * |---|---|---|
 * | 0 | 1 | `presence` M(v) |
 * | 1 | ink energy | `inkEnergy` E_L(v) |
 * | 2 | mark energy | `markEnergy` E_C(v) |
 * | 3,4,5 | surround L, a, b | `habitualGround` B(v) |
 * | 6 | field-likeness weight | `fieldLikeness` |
 * | 7,8 | normalised x, y | `spatialSpread` (means) |
 * | 9 | x² + y² normalised | `spatialSpread` (trace) |
 * | 10 | in border annulus | `borderAffinity` |
 * | 11,12,13 | own L, a, b | `centroidDistance` |
 * | 14 | 1, at the surround colour | `groundMass` G(v) |
 */

import type { OkLab } from "../../../../src/contract/types.ts"
import type { Substrate } from "../types.ts"
import {
	BORDER_ANNULUS_SHORT_EDGE_FRACTION,
	LATTICE_ASSIGNMENT_NODES,
	LATTICE_CELL_BUDGET,
	LATTICE_CELLS_PER_BANDWIDTH,
	LATTICE_CHANNELS,
	LATTICE_KERNEL_TRUNCATION_SIGMAS,
} from "./constants.ts"
import type { TripleTable } from "./triples.ts"

const CHANNELS = LATTICE_CHANNELS
/** Channels accumulated at the pixel's own colour; channel 14 is splatted separately. */
const OWN_CHANNELS = CHANNELS - 1
const NODES = LATTICE_ASSIGNMENT_NODES

export type LatticeGeometry = Readonly<{
	/** Lattice-space origin in OKLab: the coordinate of cell (0,0,0). */
	origin: readonly [number, number, number]
	/** Isotropic cell width in OKLab units. */
	cell: number
	/** Cell counts along L, a, b. */
	counts: readonly [number, number, number]
	/** Cells per bandwidth actually used (see `LATTICE_CELLS_PER_BANDWIDTH`). */
	cellsPerBandwidth: number
	/** Half-width of the discrete 1-D kernel, in cells. */
	kernelRadius: number
}>

export type LatticeField = Readonly<{
	geometry: LatticeGeometry
	/** Convolved accumulator stack, cell-major with channel varying fastest. */
	cells: Float64Array
	/** Exact fraction of the frame inside the border annulus. */
	annulusAreaFraction: number
	/** Pixel count of the artwork — the denominator that turns masses into area fractions. */
	pixelCount: number
	/** Read of all channels at an OKLab point, into `out` (length `LATTICE_CHANNELS`). */
	read: (lab: OkLab, out: Float64Array) => void
}>

/**
 * Quadratic B-spline assignment along one axis: the centre node and its three weights.
 *
 * Weights are `[½(½−d)², ¾−d², ½(½+d)²]` for `d = x − round(x) ∈ [−½, ½]`, which sum to 1 and are
 * C¹ in `x` — the continuity that makes every statistic Lipschitz in the pixels.
 */
function assignmentWeights(position: number, weights: Float64Array): number {
	const centre = Math.round(position)
	const delta = position - centre
	weights[0] = 0.5 * (0.5 - delta) * (0.5 - delta)
	weights[1] = 0.75 - delta * delta
	weights[2] = 0.5 * (0.5 + delta) * (0.5 + delta)
	return centre - 1
}

/**
 * Keep an assignment inside the grid. Reads and splats inside the occupied range never touch this —
 * the padding is the kernel radius plus the assignment's half-width — so it is a guard against a
 * malformed substrate (a NaN plane, a ground colour outside its own bounds), never a routine path.
 */
function clamp(position: number, count: number): number {
	return position >= 1 ? (position <= count - 2 ? position : count - 2) : 1
}

/** OKLab bounding box of everything that gets splatted: pixel colours and surround colours. */
export function occupiedBounds(substrate: Substrate): { min: number[]; max: number[] } {
	const { planes, figureGround } = substrate
	const pixelCount = planes.width * planes.height
	const min = [Infinity, Infinity, Infinity]
	const max = [-Infinity, -Infinity, -Infinity]
	const series: Float32Array[] = [
		planes.L,
		planes.a,
		planes.b,
		figureGround.ground.L,
		figureGround.ground.a,
		figureGround.ground.b,
	]
	for (let axis = 0; axis < 3; axis++) {
		for (const plane of [series[axis]!, series[axis + 3]!]) {
			for (let index = 0; index < pixelCount; index++) {
				const value = plane[index]!
				if (value < min[axis]!) min[axis] = value
				if (value > max[axis]!) max[axis] = value
			}
		}
	}
	return { min, max }
}

/**
 * Choose the isotropic cell width: the highest resolution in `LATTICE_CELLS_PER_BANDWIDTH` whose
 * grid fits the cell budget, falling back to the coarsest entry when nothing fits. Deterministic,
 * and every entry of that list is inside the quadrature bound (`constants.ts`).
 */
export function chooseGeometry(
	min: readonly number[],
	max: readonly number[],
	bandwidth: number,
	forcedCellsPerBandwidth?: number,
): LatticeGeometry {
	const options = forcedCellsPerBandwidth === undefined
		? LATTICE_CELLS_PER_BANDWIDTH
		: [forcedCellsPerBandwidth]

	let chosen: LatticeGeometry | undefined
	for (let option = 0; option < options.length; option++) {
		const cellsPerBandwidth = options[option]!
		const cell = bandwidth / cellsPerBandwidth
		const kernelRadius = Math.max(1, Math.ceil((LATTICE_KERNEL_TRUNCATION_SIGMAS * bandwidth) / cell))
		// Padding: the kernel's reach plus the assignment's own half-width, so every splat and every
		// read inside the occupied range has full support without a boundary case.
		const pad = kernelRadius + NODES
		const counts = [0, 0, 0] as [number, number, number]
		const origin = [0, 0, 0] as [number, number, number]
		for (let axis = 0; axis < 3; axis++) {
			const span = Math.max(max[axis]! - min[axis]!, 0)
			counts[axis] = Math.ceil(span / cell) + 1 + 2 * pad
			origin[axis] = min[axis]! - pad * cell
		}
		const geometry: LatticeGeometry = { origin, cell, counts, cellsPerBandwidth, kernelRadius }
		chosen = geometry
		if (counts[0] * counts[1] * counts[2] <= LATTICE_CELL_BUDGET) break
	}
	return chosen!
}

/**
 * Quadrature points used to invert the assignment when building the kernel. Midpoint rule over half
 * a Nyquist period; the integrand is smooth and bounded there.
 *
 * `[REVIEWED]` — a numerical-integration count, paid once per image (≈60k operations total).
 */
const KERNEL_SOLVE_SAMPLES = 4096

/**
 * The discrete 1-D kernel, taps 0…radius (symmetric).
 *
 * **This is not a sampled Gaussian, and the difference is load-bearing.** What the statistics are
 * defined against is the *composite* of three operations — splat, discrete convolution, read — and
 * a sampled Gaussian makes that composite systematically smaller than the kernel it stands for
 * (measured: 4% low per axis, 11% in three dimensions, at cell = h/2), because the assignment
 * B-spline blurs the measure twice on the way through.
 *
 * So the assignment is inverted rather than approximated. The composite is `W ⊛ g ⊛ W / cell` for
 * the assignment function `W`, whose transform is `cell·sinc^(n+1)(f·cell)` for a B-spline of order
 * `n`, so the kernel whose composite is the peak-1 Gaussian `exp(-d²/2h²)` has the transform
 *
 *     ĝ(f) = Ĝ_h(f) / (cell · sinc^(2n+2)(f·cell)),    sinc(x) = sin(πx)/(πx)
 *
 * and the taps are its inverse transform over one Nyquist period, computed here by direct quadrature
 * (no FFT: there are ~17 taps). What is left over is the assignment's spectral leakage past the grid
 * Nyquist frequency — the residual sub-cell ripple, 0.5% at order 2 and cell = h/2, against 14% at
 * order 1 — plus the truncated tail, which the final renormalisation returns to the DC term exactly.
 */
export function buildKernel(geometry: LatticeGeometry, bandwidth: number): Float64Array {
	const { cell, kernelRadius } = geometry
	const rho = bandwidth / cell
	const taps = new Float64Array(kernelRadius + 1)

	const step = 0.5 / KERNEL_SOLVE_SAMPLES
	const gaussianExponent = 2 * Math.PI * Math.PI * rho * rho
	const inversePower = 2 * NODES // 2·(order + 1) for a B-spline of order NODES − 1
	for (let sample = 0; sample < KERNEL_SOLVE_SAMPLES; sample++) {
		const u = (sample + 0.5) * step
		const sinc = Math.sin(Math.PI * u) / (Math.PI * u)
		const spectrum = Math.exp(-gaussianExponent * u * u) / Math.pow(sinc, inversePower)
		for (let k = 0; k <= kernelRadius; k++) taps[k]! += spectrum * Math.cos(2 * Math.PI * u * k)
	}

	const amplitude = (2 * step * bandwidth * Math.sqrt(2 * Math.PI)) / cell
	for (let k = 0; k <= kernelRadius; k++) taps[k]! *= amplitude

	// Return the truncated tail to the kernel's integral, which is the one moment that must be exact:
	// it is what makes `presence` an area fraction rather than an area fraction times 0.9999.
	let sum = taps[0]!
	for (let k = 1; k <= kernelRadius; k++) sum += 2 * taps[k]!
	const scale = (bandwidth * Math.sqrt(2 * Math.PI)) / cell / sum
	for (let k = 0; k <= kernelRadius; k++) taps[k]! *= scale

	return taps
}

/**
 * In-place separable convolution of the whole stack along one lattice axis.
 *
 * Lines that are identically zero are skipped: their output is zero and their input already is, so
 * the skip is exact, not an approximation. It matters because an artwork occupies a thin subset of
 * its own OKLab bounding box — most lines of the stack are empty on the first pass and many stay
 * empty on the second.
 */
function convolveAxis(
	cells: Float64Array,
	counts: readonly [number, number, number],
	axis: number,
	taps: Float64Array,
	line: Float64Array,
	accumulator: Float64Array,
): void {
	const strides = [CHANNELS, counts[0] * CHANNELS, counts[0] * counts[1] * CHANNELS]
	const length = counts[axis]!
	const stride = strides[axis]!
	const otherA = axis === 0 ? 1 : 0
	const otherB = axis === 2 ? 1 : 2
	const radius = taps.length - 1

	for (let indexB = 0; indexB < counts[otherB]!; indexB++) {
		for (let indexA = 0; indexA < counts[otherA]!; indexA++) {
			const base = indexA * strides[otherA]! + indexB * strides[otherB]!
			let occupied = false
			for (let position = 0; position < length; position++) {
				const source = base + position * stride
				const target = position * CHANNELS
				for (let channel = 0; channel < CHANNELS; channel++) {
					const value = cells[source + channel]!
					line[target + channel] = value
					if (value !== 0) occupied = true
				}
			}
			if (!occupied) continue
			for (let position = 0; position < length; position++) {
				const centre = position * CHANNELS
				const centreTap = taps[0]!
				for (let channel = 0; channel < CHANNELS; channel++) {
					accumulator[channel] = centreTap * line[centre + channel]!
				}
				for (let k = 1; k <= radius; k++) {
					const tap = taps[k]!
					const low = position - k
					const high = position + k
					if (low >= 0 && high < length) {
						const lowBase = low * CHANNELS
						const highBase = high * CHANNELS
						for (let channel = 0; channel < CHANNELS; channel++) {
							accumulator[channel]! += tap * (line[lowBase + channel]! + line[highBase + channel]!)
						}
					} else {
						if (low >= 0) {
							const lowBase = low * CHANNELS
							for (let channel = 0; channel < CHANNELS; channel++) {
								accumulator[channel]! += tap * line[lowBase + channel]!
							}
						}
						if (high < length) {
							const highBase = high * CHANNELS
							for (let channel = 0; channel < CHANNELS; channel++) {
								accumulator[channel]! += tap * line[highBase + channel]!
							}
						}
					}
				}
				const destination = base + position * stride
				for (let channel = 0; channel < CHANNELS; channel++) cells[destination + channel] = accumulator[channel]!
			}
		}
	}
}

/**
 * Accumulate the 14 own-colour channels per distinct triple — exact, no quadrature — and splat both
 * those totals and the per-pixel ground mass onto the lattice.
 *
 * Fixed raster pixel order, fixed triple order, Float64 accumulation: the reduction order is the
 * same on every run, so the stack is bit-identical for the same substrate (SPEC rule 1). Separated
 * from the convolution only so the bench can time the two stages the proposal prices separately.
 */
export function splatField(
	substrate: Substrate,
	geometry: LatticeGeometry,
	table: TripleTable,
): { cells: Float64Array; annulusAreaFraction: number } {
	const { planes, figureGround } = substrate
	const { width, height } = planes
	const pixelCount = width * height

	const [countL, countA, countB] = geometry.counts
	const cells = new Float64Array(countL * countA * countB * CHANNELS)
	const inverseCell = 1 / geometry.cell
	const [originL, originA, originB] = geometry.origin

	const shortEdge = Math.min(width, height)
	const annulusWidth = Math.max(1, Math.round(shortEdge * BORDER_ANNULUS_SHORT_EDGE_FRACTION))
	const innerWidth = Math.max(0, width - 2 * annulusWidth)
	const innerHeight = Math.max(0, height - 2 * annulusWidth)
	const annulusAreaFraction = (pixelCount - innerWidth * innerHeight) / pixelCount

	const inverseWidth = 1 / width
	const inverseHeight = 1 / height
	const { L, a, b, r8, g8, b8 } = planes
	const ground = figureGround.ground
	const { fieldWeight, inkEnergy, markEnergy } = figureGround

	const tripleCount = table.triples.length
	const perTriple = new Float64Array(tripleCount * OWN_CHANNELS)

	const weightsL = new Float64Array(NODES)
	const weightsA = new Float64Array(NODES)
	const weightsB = new Float64Array(NODES)

	// --- pass 1: exact per-triple accumulation, and the per-pixel ground-mass splat ---
	for (let y = 0; y < height; y++) {
		const normalisedY = (y + 0.5) * inverseHeight
		const rowBorder = y < annulusWidth || y >= height - annulusWidth
		const rowBase = y * width
		for (let x = 0; x < width; x++) {
			const index = rowBase + x
			const normalisedX = (x + 0.5) * inverseWidth
			const inBorder = rowBorder || x < annulusWidth || x >= width - annulusWidth

			const key = (r8[index]! << 16) | (g8[index]! << 8) | b8[index]!
			const slot = table.indexOfKey(key) * OWN_CHANNELS
			const groundL = ground.L[index]!
			const groundA = ground.a[index]!
			const groundB = ground.b[index]!

			perTriple[slot]! += 1
			perTriple[slot + 1]! += inkEnergy[index]!
			perTriple[slot + 2]! += markEnergy[index]!
			perTriple[slot + 3]! += groundL
			perTriple[slot + 4]! += groundA
			perTriple[slot + 5]! += groundB
			perTriple[slot + 6]! += fieldWeight[index]!
			perTriple[slot + 7]! += normalisedX
			perTriple[slot + 8]! += normalisedY
			perTriple[slot + 9]! += normalisedX * normalisedX + normalisedY * normalisedY
			perTriple[slot + 10]! += inBorder ? 1 : 0
			perTriple[slot + 11]! += L[index]!
			perTriple[slot + 12]! += a[index]!
			perTriple[slot + 13]! += b[index]!

			const baseL = assignmentWeights(clamp((groundL - originL!) * inverseCell, countL!), weightsL)
			const baseA = assignmentWeights(clamp((groundA - originA!) * inverseCell, countA!), weightsA)
			const baseC = assignmentWeights(clamp((groundB - originB!) * inverseCell, countB!), weightsB)
			for (let dz = 0; dz < NODES; dz++) {
				const weightZ = weightsB[dz]!
				for (let dy = 0; dy < NODES; dy++) {
					const weightZY = weightZ * weightsA[dy]!
					const rowStart = (((baseC + dz) * countA! + baseA + dy) * countL! + baseL) * CHANNELS + 14
					for (let dx = 0; dx < NODES; dx++) {
						cells[rowStart + dx * CHANNELS]! += weightZY * weightsL[dx]!
					}
				}
			}
		}
	}

	// --- pass 2: splat the per-triple totals at each triple's exact OKLab colour ---
	for (let triple = 0; triple < tripleCount; triple++) {
		const lab = table.triples[triple]!.lab
		const slot = triple * OWN_CHANNELS
		const baseL = assignmentWeights(clamp((lab[0] - originL!) * inverseCell, countL!), weightsL)
		const baseA = assignmentWeights(clamp((lab[1] - originA!) * inverseCell, countA!), weightsA)
		const baseC = assignmentWeights(clamp((lab[2] - originB!) * inverseCell, countB!), weightsB)
		for (let dz = 0; dz < NODES; dz++) {
			const weightZ = weightsB[dz]!
			for (let dy = 0; dy < NODES; dy++) {
				const weightZY = weightZ * weightsA[dy]!
				for (let dx = 0; dx < NODES; dx++) {
					const weight = weightZY * weightsL[dx]!
					if (weight === 0) continue
					const target = ((baseC + dz) * countA! + baseA + dy) * countL! * CHANNELS +
						(baseL + dx) * CHANNELS
					for (let channel = 0; channel < OWN_CHANNELS; channel++) {
						cells[target + channel]! += weight * perTriple[slot + channel]!
					}
				}
			}
		}
	}
	return { cells, annulusAreaFraction }
}

/**
 * The one separable Gaussian convolution of the whole stack, at bandwidth `h`. Fixed axis order
 * L → a → b; in place, with a single line buffer, so the stack is never duplicated.
 */
export function convolveStack(cells: Float64Array, geometry: LatticeGeometry, bandwidth: number): void {
	const taps = buildKernel(geometry, bandwidth)
	const longestAxis = Math.max(geometry.counts[0], geometry.counts[1], geometry.counts[2])
	const line = new Float64Array(longestAxis * CHANNELS)
	const accumulator = new Float64Array(CHANNELS)
	convolveAxis(cells, geometry.counts, 0, taps, line, accumulator)
	convolveAxis(cells, geometry.counts, 1, taps, line, accumulator)
	convolveAxis(cells, geometry.counts, 2, taps, line, accumulator)
}

/** Geometry, splat, convolution and the read, as one object. */
export function buildField(
	substrate: Substrate,
	bandwidth: number,
	table: TripleTable,
	forcedCellsPerBandwidth?: number,
): LatticeField {
	const bounds = occupiedBounds(substrate)
	const geometry = chooseGeometry(bounds.min, bounds.max, bandwidth, forcedCellsPerBandwidth)
	const { cells, annulusAreaFraction } = splatField(substrate, geometry, table)
	convolveStack(cells, geometry, bandwidth)
	return makeField(substrate, geometry, cells, annulusAreaFraction)
}

/** Wrap a convolved stack with its read. */
export function makeField(
	substrate: Substrate,
	geometry: LatticeGeometry,
	cells: Float64Array,
	annulusAreaFraction: number,
): LatticeField {
	const pixelCount = substrate.planes.width * substrate.planes.height
	const [countL, countA, countB] = geometry.counts
	const [originL, originA, originB] = geometry.origin
	const inverseCell = 1 / geometry.cell

	const weightsL = new Float64Array(NODES)
	const weightsA = new Float64Array(NODES)
	const weightsB = new Float64Array(NODES)

	const read = (lab: OkLab, out: Float64Array): void => {
		// Clamp the assignment inside the grid. Reads inside the occupied range never touch this —
		// the padding is the kernel radius plus the assignment half-width — and reads outside it
		// return the boundary's (essentially zero) mass rather than an out-of-bounds NaN.
		const baseL = assignmentWeights(clamp((lab[0] - originL!) * inverseCell, countL!), weightsL)
		const baseA = assignmentWeights(clamp((lab[1] - originA!) * inverseCell, countA!), weightsA)
		const baseC = assignmentWeights(clamp((lab[2] - originB!) * inverseCell, countB!), weightsB)

		out.fill(0)
		for (let dz = 0; dz < NODES; dz++) {
			const weightZ = weightsB[dz]!
			for (let dy = 0; dy < NODES; dy++) {
				const weightZY = weightZ * weightsA[dy]!
				for (let dx = 0; dx < NODES; dx++) {
					const weight = weightZY * weightsL[dx]!
					if (weight === 0) continue
					const source = (((baseC + dz) * countA! + baseA + dy) * countL! + baseL + dx) * CHANNELS
					for (let channel = 0; channel < CHANNELS; channel++) {
						out[channel]! += weight * cells[source + channel]!
					}
				}
			}
		}
	}

	return { geometry, cells, annulusAreaFraction, pixelCount, read }
}
