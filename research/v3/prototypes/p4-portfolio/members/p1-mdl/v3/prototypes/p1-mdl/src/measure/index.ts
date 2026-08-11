/**
 * # `src/measure` — image to measurement, and nothing else
 *
 * `measureImage(path)` is P1's whole contact with a file. It returns a `Measurement`: the per-triple
 * table with its exact integer moments, the extent profile from the dyadic box-mean ladder, the
 * smoothed mass, the three closed-form field geometries and their (t, colour) joints. Every energy,
 * search and emitter in this prototype reads that object and never the image.
 *
 * **Determinism.** No RNG, no clock, no filename read for anything but provenance, no hash-order
 * iteration — every map is drained through an explicit sort on a numeric key. The per-triple moments
 * are exact integer sums, so they are order-free as well as reproducible. `canonicalJson` in
 * `canonical.ts` is the instrument that checks it.
 *
 * ## Cost
 *
 * Four traversals of the raster (decode + table, ladder, conic, joints) plus a colour-space pass for
 * the smoothed mass. At an album cover's 300×300 the whole thing is well inside a second; see
 * `tests/measure/real-corpus.test.ts`, which measures it rather than asserting it.
 */

import { decodeImage } from "./decode.ts"
import {
	EXTENT_LADDER_SCALES,
	EXTENT_WEIGHT_SUM,
	JOINT_LATTICE_CELLS_PER_BAR,
	KERNEL_BANDWIDTH_BY_REGION,
	KERNEL_TRUNCATION_BANDWIDTHS,
	MEASUREMENT_SCHEMA_VERSION,
	PREPROCESSING_VERSION,
	SMOOTHED_MASS_EXACT_MAX_COLORS,
	SMOOTHED_MASS_LATTICE_CELLS_PER_BAR,
	T_HISTOGRAM_BINS,
	T_QUANTILE_BINS,
} from "./constants.ts"
import { fitGeometries } from "./geometry.ts"
import { computeGridMoments } from "./grid-moments.ts"
import { computeJoints } from "./joint.ts"
import { computeExtentProfile } from "./ladder.ts"
import { computeSmoothedMass } from "./smoothed-mass.ts"
import { scanTriples } from "./triples.ts"
import type { DerivedTripleStats, Measurement, MeasureOptions } from "./types.ts"

export { canonicalDigest, canonicalJson } from "./canonical.ts"
export {
	DecodeError,
	ImageTooLargeForExactMomentsError,
	MeasureError,
	TransparentInputError,
} from "./errors.ts"
export { bandwidthOf, kappa, pairBandwidth, regionOfOkLab } from "./kernel.ts"
export { unpackKey } from "./triples.ts"
export type { TripleScan, TripleTable } from "./triples.ts"
export type { ExtentProfile, LadderScale } from "./ladder.ts"
export type { SmoothedMass } from "./smoothed-mass.ts"
export type {
	ChannelFit,
	ConicGeometry,
	Geometries,
	LinearGeometry,
	RadialGeometry,
} from "./geometry.ts"
export { makeTFunctions } from "./geometry.ts"
export type { ColorLattice, Joints, TColorJoint } from "./joint.ts"
export type {
	DerivedTripleStats,
	Measurement,
	MeasureOptions,
	MeasurementConstants,
	SourceInfo,
} from "./types.ts"

function deriveTripleStats(
	table: ReturnType<typeof scanTriples>["table"],
	extentSumE: Float64Array,
	extentSumESquared: Float64Array,
	shortEdge: number,
): DerivedTripleStats {
	const { colorCount, counts, pixelCount } = table
	const massFraction = new Float64Array(colorCount)
	const meanX = new Float64Array(colorCount)
	const meanY = new Float64Array(colorCount)
	const covXX = new Float64Array(colorCount)
	const covXY = new Float64Array(colorCount)
	const covYY = new Float64Array(colorCount)
	const meanExtent = new Float64Array(colorCount)
	const varianceExtent = new Float64Array(colorCount)

	for (let row = 0; row < colorCount; row += 1) {
		const count = counts[row]
		massFraction[row] = pixelCount === 0 ? 0 : count / pixelCount
		// Normalise on the way out, not on the way in: the sums stay exact integers in the table and
		// only their reading is scale-free.
		const centroidX = table.sumX[row] / count / shortEdge
		const centroidY = table.sumY[row] / count / shortEdge
		meanX[row] = centroidX
		meanY[row] = centroidY
		covXX[row] = table.sumXX[row] / count / (shortEdge * shortEdge) - centroidX * centroidX
		covXY[row] = table.sumXY[row] / count / (shortEdge * shortEdge) - centroidX * centroidY
		covYY[row] = table.sumYY[row] / count / (shortEdge * shortEdge) - centroidY * centroidY
		const averageExtent = extentSumE[row] / count
		meanExtent[row] = averageExtent
		varianceExtent[row] = extentSumESquared[row] / count - averageExtent * averageExtent
	}

	return { massFraction, meanX, meanY, covXX, covXY, covYY, meanExtent, varianceExtent }
}

/**
 * Measure an image.
 *
 * Throws — never returns a partial result — for the three inputs this layer refuses: no header
 * dimensions or a resampled raster (`DecodeError`), a genuinely transparent pixel
 * (`TransparentInputError`), and an image large enough that the integer moments would stop being
 * exact (`ImageTooLargeForExactMomentsError`). All three are `MeasureError`s.
 */
export async function measureImage(
	imagePath: string,
	options: MeasureOptions = {},
): Promise<Measurement> {
	const image = await decodeImage(imagePath)
	const shortEdge = Math.min(image.width, image.height)

	const { table, pixelTripleIndex } = scanTriples(image)
	const extent = computeExtentProfile(table, pixelTripleIndex, image.width, image.height)
	const smoothedMass = computeSmoothedMass(table, options.smoothedMassCellsPerBar)
	const moments = computeGridMoments(image.width, image.height)
	const geometry = fitGeometries(table, pixelTripleIndex, moments)
	const joints = computeJoints(table, pixelTripleIndex, geometry, image.width, image.height)

	return {
		schemaVersion: MEASUREMENT_SCHEMA_VERSION,
		source: {
			path: image.path,
			width: image.width,
			height: image.height,
			format: image.format,
			channels: image.channels,
			pixelCount: table.pixelCount,
			shortEdge,
		},
		triples: table,
		derived: deriveTripleStats(table, extent.sumE, extent.sumESquared, shortEdge),
		extent,
		smoothedMass,
		geometry,
		joints,
		constants: {
			preprocessingVersion: PREPROCESSING_VERSION,
			kernelBandwidthByRegion: KERNEL_BANDWIDTH_BY_REGION,
			extentLadderScales: EXTENT_LADDER_SCALES,
			extentWeightSum: EXTENT_WEIGHT_SUM,
			kernelTruncationBandwidths: KERNEL_TRUNCATION_BANDWIDTHS,
			smoothedMassExactMaxColors: SMOOTHED_MASS_EXACT_MAX_COLORS,
			smoothedMassLatticeCellsPerBar: SMOOTHED_MASS_LATTICE_CELLS_PER_BAR,
			jointLatticeCellsPerBar: JOINT_LATTICE_CELLS_PER_BAR,
			tQuantileBins: T_QUANTILE_BINS,
			tHistogramBins: T_HISTOGRAM_BINS,
		},
	}
}
