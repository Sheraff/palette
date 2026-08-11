/**
 * The `Measurement` — everything P1's energies are allowed to see about an image.
 *
 * Arm A §2.1: *"This table is the only thing the rest of the computation sees."* That is a real
 * constraint, not a description: no energy, no search and no emitter in this prototype may open the
 * image file. If a term needs something that is not in here, the measurement layer grows a field and
 * says why — it does not get read out of band.
 */

import type { ExtentProfile } from "./ladder.ts"
import type { Geometries } from "./geometry.ts"
import type { Joints } from "./joint.ts"
import type { SmoothedMass } from "./smoothed-mass.ts"
import type { TripleTable } from "./triples.ts"

/** What the decoder's header said, plus the two derived sizes everything scale-free divides by. */
export type SourceInfo = Readonly<{
	/**
	 * The path as handed to `measureImage`. **Provenance only.** Arm A §2.5 requires that nothing
	 * reads a filename, an id or a clock; this field is written and never read by any computation
	 * downstream of it, which is exactly the distinction that rule draws.
	 */
	path: string
	width: number
	height: number
	format: string
	channels: number
	pixelCount: number
	/** `min(width, height)`. Positions are normalised by this, so every statistic is scale-free. */
	shortEdge: number
}>

/** Per-triple statistics in scale-free form. Derived from the exact integer moments, never instead of them. */
export type DerivedTripleStats = Readonly<{
	/** `n(c) / N` — the exact-triple mass share. Present for auditing; the energy reads smoothed mass. */
	massFraction: Float64Array
	/** Spatial centroid per triple, normalised to the short edge. */
	meanX: Float64Array
	meanY: Float64Array
	/** Central second moments per triple, normalised. `μ(c), Σ(c)` in arm A §2.1's notation. */
	covXX: Float64Array
	covXY: Float64Array
	covYY: Float64Array
	/** Mass-weighted mean and variance of the extent statistic over each triple's pixels. */
	meanExtent: Float64Array
	varianceExtent: Float64Array
}>

/** The tunables this measurement actually ran with, echoed so a stored result carries its own settings. */
export type MeasurementConstants = Readonly<{
	preprocessingVersion: string
	kernelBandwidthByRegion: Readonly<Record<string, number>>
	extentLadderScales: number
	extentWeightSum: number
	kernelTruncationBandwidths: number
	smoothedMassExactMaxColors: number
	smoothedMassLatticeCellsPerBar: number
	jointLatticeCellsPerBar: number
	tQuantileBins: number
	tHistogramBins: number
}>

export type Measurement = Readonly<{
	schemaVersion: string
	source: SourceInfo
	triples: TripleTable
	derived: DerivedTripleStats
	extent: ExtentProfile
	smoothedMass: SmoothedMass
	geometry: Geometries
	joints: Joints
	constants: MeasurementConstants
}>

/** Options exist for tests and sensitivity sweeps. `measureImage(path)` with no options is the algorithm. */
export type MeasureOptions = Readonly<{
	/**
	 * Force the smoothed-mass lattice and set its resolution. Used by the refinement-invariance test in
	 * `tests/measure/smoothed-mass.test.ts` and by nothing else; leaving it unset selects the exact or
	 * lattice path by size, which is what production does.
	 */
	smoothedMassCellsPerBar?: number
}>
