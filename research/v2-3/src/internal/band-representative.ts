import { okDistance } from "./color.ts";

import type { OKLab } from "./types.ts";

// Density analysis of a population of pixels — a gradient endpoint band, say — supporting
// two questions the gradient machinery has to answer about any colour it is about to snap
// to source.
//
// 1. Which exact pixel best stands for this population? Answer: the pixel closest to the
//    population's modal colour, where the mode carries an explicit neighbourhood radius so
//    that a broad smooth plateau outranks a narrow spike of the same peak height. Never a
//    lone pixel picked for proximity to some abstract target, which could be sensor noise,
//    JPEG ringing, or a stray antialiased edge.
//
// 2. Is a given colour *field* material, or an object sitting inside the band? Answer: a
//    field colour is spread across the band at least as widely as the band's own modal
//    colour is. An object is concentrated into a smaller region. This is the question that
//    matters for a gradient endpoint, because a gradient runs through a field: the far end
//    of a smooth ramp is real evidence the fit should be trusted about, while a silhouette
//    that merely shares a colour family with the wall behind it is not. Chromatic evidence
//    alone cannot tell these apart — measured on the reviewed corpus, the two are
//    indistinguishable by neighbourhood share, by robust spread, and by occupancy along the
//    colour path — because the difference between them is spatial, not chromatic.

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BAND_REPRESENTATIVE_POLICY = Object.freeze({
	modeBinStep: 0.01,
	modeNeighborhoodRadius: 0.018,
	minimumNeighborhoodPopulation: 4,
	minimumNeighborhoodShare: 0.02,
	// A field colour's spatial spread, relative to the modal colour's. Measured separation on
	// the reviewed corpus is 1.19-1.36 for field material against 0.51-0.56 for an object in
	// the band, so this sits with roughly 45% margin either side.
	minimumFieldSpreadRatio: 0.8,
})

export type BandRepresentativeSample = Readonly<{ pixelIndex: number; lab: OKLab }>

export type BandGeometry = Readonly<{ width: number; height: number }>

/**
 * How far across the band a given colour is spread, as the RMS spatial extent of the band
 * pixels that share its colour bin. `null` means the bin is unoccupied in this band — the
 * statistic is *not measured*, a different claim than a measurement whose value is zero.
 * Comparators must not conflate the two: an unmeasured axis is incomparable, and a
 * candidate that publishes nothing on it must neither win nor lose because of it.
 */
export type BandSpatialSpreadLookup = Readonly<{
	spreadFor: (lab: OKLab) => number | null
	occupiedBinCount: number
}>

export type BandSpatialSpreadAccumulator = Readonly<{
	/** `x` and `y` are normalised to `[0, 1]` across the image, as everywhere else here. */
	add: (lab: OKLab, x: number, y: number) => void
	finish: () => BandSpatialSpreadLookup
}>

type SpreadBin = { count: number; sumX: number; sumY: number; sumXX: number; sumYY: number }

const EMPTY_SPREAD: BandSpatialSpreadLookup = Object.freeze({
	spreadFor: () => null,
	occupiedBinCount: 0,
})

/**
 * The single definition of the endpoint-band spatial-spread statistic, streamed so a caller
 * never has to materialise a band's pixels. Every producer of a gradient field hypothesis
 * measures it the same way — same binning, same normalisation — so the values from
 * different producers are on one scale and a comparator may put them side by side.
 *
 * `binKeyOf` is the caller's own colour quantisation, passed in rather than duplicated, so
 * the bins a band is grouped into are the same bins the rest of that caller's evidence uses.
 */
export function createBandSpatialSpreadAccumulator(
	binKeyOf: (lab: OKLab) => number,
): BandSpatialSpreadAccumulator {
	const bins = new Map<number, SpreadBin>()
	return {
		add: (lab, x, y) => {
			const key = binKeyOf(lab)
			const bin = bins.get(key)
			if (bin) {
				bin.count += 1
				bin.sumX += x
				bin.sumY += y
				bin.sumXX += x * x
				bin.sumYY += y * y
				return
			}
			bins.set(key, { count: 1, sumX: x, sumY: y, sumXX: x * x, sumYY: y * y })
		},
		finish: () => {
			if (bins.size === 0) return EMPTY_SPREAD
			const spreads = new Map<number, number>()
			for (const [key, bin] of bins) {
				const meanX = bin.sumX / bin.count
				const meanY = bin.sumY / bin.count
				const varianceX = Math.max(0, bin.sumXX / bin.count - meanX * meanX)
				const varianceY = Math.max(0, bin.sumYY / bin.count - meanY * meanY)
				spreads.set(key, Math.sqrt(varianceX + varianceY))
			}
			return {
				spreadFor: (lab) => spreads.get(binKeyOf(lab)) ?? null,
				occupiedBinCount: spreads.size,
			}
		},
	}
}

export type BandRepresentative = Readonly<{
	pixelIndex: number
	lab: OKLab
	prototype: OKLab
	prototypeDistance: number
	modePopulation: number
	neighborhoodPopulation: number
	neighborhoodShare: number
	densitySupported: boolean
	samplePopulation: number
}>

export type BandColorEvidence = Readonly<{
	/** Population within one neighbourhood radius of the queried colour. */
	population: number
	/** That population as a share of the whole band. */
	share: number
	/** Root-mean-square distance of those pixels from their own spatial centroid. */
	spatialSpread: number
	/** `spatialSpread` relative to the modal colour's, so 1 means "as spread as the mode". */
	spatialSpreadRatio: number
	/** Density-supported (not a bare pixel) and spread like field rather than like an object. */
	fieldLike: boolean
}>

export type BandPopulation = Readonly<{
	representative: BandRepresentative | null
	/** Evidence about one candidate colour's standing within this band. */
	evidenceFor: (lab: OKLab) => BandColorEvidence
}>

type Bin = {
	key: string
	binX: number
	binY: number
	binZ: number
	count: number
	sumL: number
	sumA: number
	sumB: number
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function binCoordinate(value: number, offset: number): number {
	const { modeBinStep } = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BAND_REPRESENTATIVE_POLICY
	return Math.floor((value + offset) / modeBinStep)
}

/**
 * The origin shift applied to the OKLab `a` and `b` axes before flooring them into bins, so that
 * negative chroma coordinates land in non-negative bins. Lightness needs no shift and takes `0`.
 *
 * PERVASIVE CLIFF (Track P tier A, `track-p/LEDGER.md:302`): live on 113 artworks and +-20 % moves
 * 27 of them (24 %) — the shift is not merely an encoding detail, because moving it re-phases every
 * bin boundary relative to the data. Lifted out of `binKeyOf` below, where it appeared twice at the
 * identical value, once per chroma axis; the two axes must always share it.
 */
export const CHROMA_BIN_ORIGIN_OFFSET = 0.5

function binKeyOf(lab: OKLab): string {
	const chroma = CHROMA_BIN_ORIGIN_OFFSET
	return `${binCoordinate(lab[0], 0)},${binCoordinate(lab[1], chroma)},${binCoordinate(lab[2], chroma)}`
}

const NO_COLOR_EVIDENCE: BandColorEvidence = Object.freeze({
	population: 0,
	share: 0,
	spatialSpread: 0,
	spatialSpreadRatio: 0,
	fieldLike: false,
})

const EMPTY_POPULATION: BandPopulation = Object.freeze({
	representative: null,
	evidenceFor: () => NO_COLOR_EVIDENCE,
})

/**
 * Deterministic: bins compare by neighbourhood population, then own population, then ASCII
 * bin key; the exemplar inside the winning bin compares by perceptual distance to the bin
 * prototype, then by pixel index. Nothing depends on input order beyond those tie-breaks.
 */
export function analyzeBandPopulation(
	samples: readonly BandRepresentativeSample[],
	geometry: BandGeometry,
): BandPopulation {
	if (samples.length === 0) return EMPTY_POPULATION
	const { modeNeighborhoodRadius, minimumNeighborhoodPopulation, minimumNeighborhoodShare } =
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BAND_REPRESENTATIVE_POLICY
	const bins = new Map<string, Bin>()
	for (const { lab } of samples) {
		const key = binKeyOf(lab)
		const existing = bins.get(key)
		if (existing) {
			existing.count += 1
			existing.sumL += lab[0]
			existing.sumA += lab[1]
			existing.sumB += lab[2]
			continue
		}
		bins.set(key, {
			key,
			binX: binCoordinate(lab[0], 0),
			binY: binCoordinate(lab[1], 0.5),
			binZ: binCoordinate(lab[2], 0.5),
			count: 1,
			sumL: lab[0],
			sumA: lab[1],
			sumB: lab[2],
		})
	}
	const prototypes = new Map<string, OKLab>()
	for (const bin of bins.values()) {
		prototypes.set(bin.key, [bin.sumL / bin.count, bin.sumA / bin.count, bin.sumB / bin.count])
	}
	// The neighbourhood radius spans under two bins, so an exact neighbourhood population is
	// available from the surrounding +/-2 bin shell without an all-pairs comparison.
	const shell = [-2, -1, 0, 1, 2]
	const neighborhoodAround = (lab: OKLab): number => {
		const baseX = binCoordinate(lab[0], 0)
		const baseY = binCoordinate(lab[1], 0.5)
		const baseZ = binCoordinate(lab[2], 0.5)
		let total = 0
		for (const deltaX of shell) {
			for (const deltaY of shell) {
				for (const deltaZ of shell) {
					const neighbor = bins.get(`${baseX + deltaX},${baseY + deltaY},${baseZ + deltaZ}`)
					if (!neighbor) continue
					if (okDistance(lab, prototypes.get(neighbor.key)!) > modeNeighborhoodRadius) continue
					total += neighbor.count
				}
			}
		}
		return total
	}

	let best: Bin | null = null
	let bestNeighborhood = -1
	for (const bin of [...bins.values()].sort((first, second) => compareAscii(first.key, second.key))) {
		const neighborhood = neighborhoodAround(prototypes.get(bin.key)!)
		if (best === null || neighborhood > bestNeighborhood ||
			(neighborhood === bestNeighborhood && bin.count > best.count)) {
			best = bin
			bestNeighborhood = neighborhood
		}
	}
	if (best === null) return EMPTY_POPULATION

	// The exemplar is the pixel of the winning mode closest to that mode's prototype, so it is
	// always drawn from the modal population rather than from the population's tail.
	const prototype = prototypes.get(best.key)!
	let exemplar: BandRepresentativeSample | null = null
	let exemplarDistance = Infinity
	for (const sample of samples) {
		if (binKeyOf(sample.lab) !== best.key) continue
		const distance = okDistance(sample.lab, prototype)
		if (exemplar === null || distance < exemplarDistance ||
			(distance === exemplarDistance && sample.pixelIndex < exemplar.pixelIndex)) {
			exemplar = sample
			exemplarDistance = distance
		}
	}
	if (exemplar === null) return EMPTY_POPULATION

	const neighborhoodShare = bestNeighborhood / samples.length

	const widthDenominator = Math.max(1, geometry.width - 1)
	const heightDenominator = Math.max(1, geometry.height - 1)
	const spatialSpreadOf = (lab: OKLab): Readonly<{ population: number; spread: number }> => {
		let population = 0
		let sumX = 0
		let sumY = 0
		let sumSquares = 0
		for (const sample of samples) {
			if (okDistance(sample.lab, lab) > modeNeighborhoodRadius) continue
			const x = (sample.pixelIndex % geometry.width) / widthDenominator
			const y = Math.floor(sample.pixelIndex / geometry.width) / heightDenominator
			population += 1
			sumX += x
			sumY += y
			sumSquares += x * x + y * y
		}
		if (population === 0) return { population, spread: 0 }
		const meanX = sumX / population
		const meanY = sumY / population
		return {
			population,
			spread: Math.sqrt(Math.max(0, sumSquares / population - meanX * meanX - meanY * meanY)),
		}
	}
	const modalSpatial = spatialSpreadOf(prototype)

	const evidenceFor = (lab: OKLab): BandColorEvidence => {
		const { population, spread } = spatialSpreadOf(lab)
		const share = population / samples.length
		// A degenerate band whose modal colour occupies a single spot cannot discriminate, so
		// the ratio defers to the representativity test alone.
		const spatialSpreadRatio = modalSpatial.spread <= 1e-9 ? 1 : spread / modalSpatial.spread
		return {
			population,
			share,
			spatialSpread: spread,
			spatialSpreadRatio,
			fieldLike: population >= minimumNeighborhoodPopulation &&
				share >= minimumNeighborhoodShare &&
				spatialSpreadRatio >= ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BAND_REPRESENTATIVE_POLICY
					.minimumFieldSpreadRatio,
		}
	}

	return {
		evidenceFor,
		representative: {
			pixelIndex: exemplar.pixelIndex,
			lab: exemplar.lab,
			prototype,
			prototypeDistance: exemplarDistance,
			modePopulation: best.count,
			neighborhoodPopulation: bestNeighborhood,
			neighborhoodShare,
			densitySupported: bestNeighborhood >= minimumNeighborhoodPopulation &&
				neighborhoodShare >= minimumNeighborhoodShare,
			samplePopulation: samples.length,
		},
	}
}
