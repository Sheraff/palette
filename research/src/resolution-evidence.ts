import { createHash } from "node:crypto"
import { rgbToOKLab } from "./color.ts"
import type { RawImage, RGB } from "./types.ts"

export const RESOLUTION_EVIDENCE_VERSION = "resolution-evidence-0.3.0-dev" as const
export const RESOLUTION_EVIDENCE_POLICY_VERSION = "resolution-evidence-policy-v2" as const
export const RESOLUTION_EVIDENCE_TYPED_ARRAY_HASH_VERSION = "resolution-evidence-typed-array-sha256-v1" as const
export const RESOLUTION_EVIDENCE_BIN_CAPACITY = 32 * 32 * 32
export const RESOLUTION_EVIDENCE_MAX_CANDIDATES = 12
export const RESOLUTION_EVIDENCE_FAMILY_RADIUS = 0.055
export const RESOLUTION_EVIDENCE_MAX_PIXELS = 0x7fff_ffff
export const RESOLUTION_EVIDENCE_COMPONENT_AREA_BINS = 16

const unassignedLabel = 0xff
const detailDistanceScale = 0.08
const relationHistogramBins = 16
const relationEndpointWidth = 0.2
const maximumSampleSide = 128
const lloydIterations = 8
const lloydConvergence = 0.0001
const borderBandRatio = 0.08
const thinComponentRatio = 0.02
const thinComponentElongation = 3
const thinComponentSmallArea = 4
const relationResidualFloor = 0.012
const relationResidualDistanceVariance = 0.03
const relationMiddleTrimBins = 2
const relationMiddleOccupancyShare = 0.0005
const relationCoarseSide = 8
const relationActiveCellSupport = 0.05
const nativeRgbOccupancyWords = 2 ** 24 / 32
const componentSignatureBytes = 32
const epsilon = 1e-12

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value
	for (const child of Object.values(value)) deepFreeze(child)
	return Object.freeze(value)
}

/** Complete declarative identity for every algorithmic constant and tie/sample rule. */
export const RESOLUTION_EVIDENCE_POLICY = deepFreeze({
	version: RESOLUTION_EVIDENCE_POLICY_VERSION,
	indexing: {
		maximumPixels: RESOLUTION_EVIDENCE_MAX_PIXELS,
		indexType: "Int32",
		coordinateArithmetic: "exact-bigint-rational-floor-ceil-v1",
	},
	colorConversion: {
		ucharNormalizationDivisor: 255,
		srgbToLinear: {
		cutoff: 0.04045,
		linearDivisor: 12.92,
		offset: 0.055,
		scale: 1.055,
		exponent: 2.4,
		formula: "c<=cutoff?c/linear-divisor:((c+offset)/scale)^exponent",
	},
		linearRgbToLms: [
			[0.4122214708, 0.5363325363, 0.0514459929],
			[0.2119034982, 0.6806995451, 0.1073969566],
			[0.0883024619, 0.2817188376, 0.6299787005],
		],
		cubeRootLmsToOKLab: [
			[0.2104542553, 0.793617785, -0.0040720468],
			[1.9779984951, -2.428592205, 0.4505937099],
			[0.0259040371, 0.7827717662, -0.808675766],
		],
	},
	quantization: {
		space: "OKLab",
		lightnessBins: 32,
		aBins: 24,
		bBins: 24,
		aRange: [-0.4, 0.4],
		bRange: [-0.4, 0.4],
		key: "clamp(floor(L*32),0,31)<<10|clamp(floor(((a+0.4)/0.8)*24),0,23)<<5|clamp(floor(((b+0.4)/0.8)*24),0,23)",
		keyCapacity: RESOLUTION_EVIDENCE_BIN_CAPACITY,
		nonfinite: "reject",
	},
	candidates: {
		maximumCount: RESOLUTION_EVIDENCE_MAX_CANDIDATES,
		seedFirst: "largest-bin-population-then-lowest-key",
		seedNext: "maximum-nearest-squared-oklab-distance-times-sqrt-bin-count-then-lowest-key",
		assignment: "minimum-squared-oklab-distance-then-lowest-center-id",
		lloydIterations,
		lloydConvergence,
		analysisRepresentative: "closest-exact-analysis-pixel-in-closest-center-bin-then-lowest-pixel-index",
		outputColorModes: ["analysis", "native-witness"],
		outputColorModeDefault: null,
	},
	nativeWitness: {
		footprint: "analysis-source-cell-[floor(x*N/A),ceil((x+1)*N/A))-per-axis",
		selection: "minimum-oklab-distance-to-cluster-mean-then-lowest-native-index",
		output: "exact-decoded-native-rgb",
		duplicateIdentity: "equal-native-witness-rgb-retain-distinct-analysis-candidate-ids",
		analysisNativeExact: "exact-24-bit-decoded-native-rgb-membership-independent-of-witness",
		nativeRgbOccupancyWords,
	},
	spatial: {
		connectivity: 4,
		detailNeighbors: "available-four-neighbors",
		detailDistanceScale,
		detailPlane: "temporary-per-pixel-float32",
		borderBandRatio,
		borderBandRule: "max(1,min(floor(min-dimension*ratio),floor((min-dimension-1)/2)))",
		frameRule: "clamp01(border-band-ownership-interior-ownership)",
		thinComponentRatio,
		thinComponentElongation,
		thinComponentSmallArea,
		thinRule: "minor<=limit&&(major>=minor*elongation||area<=small-area)",
		componentAreaHistogramBins: RESOLUTION_EVIDENCE_COMPONENT_AREA_BINS,
		componentAreaHistogramRule: "min(last-bin,floor(log2(component-area)))",
		componentTraversalOrder: "ascending-first-unvisited-pixel-with-fixed-left-right-up-down-stack-pushes",
		componentSignature: "sha256-v1(area,bbox-min-max,border-pixels,thin)-unsigned-big-endian-records",
		fieldBroad: "largest-component-population/sqrt(population)",
		fieldDetail: "max(edge-detail,typography-support)",
		fieldFrame: "border-frame",
		typographySupport: "thin-component-local-detail-sum/candidate-or-family-support",
	},
	families: {
		anchorRadius: RESOLUTION_EVIDENCE_FAMILY_RADIUS,
		geometry: "analysis-representative-oklab",
		anchorOrder: "population-descending-then-candidate-id",
		assignment: "nearest-anchor-within-radius-then-earliest-family",
	},
	fieldEligibility: {
		method: "pareto-nondominance",
		candidateFamilyComponents: "componentwise-max(candidate-evidence,family-evidence)",
		directions: { broad: "maximize", detail: "minimize", frame: "minimize" },
		strictness: "no-worse-all-and-strictly-better-at-least-one",
	},
	relations: {
		geometry: "analysis-representative-oklab",
		orderedEligiblePairs: true,
		histogramBins: relationHistogramBins,
		endpointWidth: relationEndpointWidth,
		residualScale: "max(residual-floor,endpoint-distance*sqrt(residual-distance-variance))",
		residualFloor: relationResidualFloor,
		residualDistanceVariance: relationResidualDistanceVariance,
		pathSupport: "exp(-(residual/residual-scale)^2)",
		endpointPresence: "endpoint-seed-mass/sample-count/(endpoint-width/2)",
		endpointSeed: "support*clamp01(1-distance-from-endpoint/endpoint-width)",
		balance: "1-abs(from-presence-to-presence)/(from-presence+to-presence)",
		middleTrimBins: relationMiddleTrimBins,
		middleOccupancyShare: relationMiddleOccupancyShare,
		coarseMaximumSide: relationCoarseSide,
		activeCellMinimumMeanSupport: relationActiveCellSupport,
		progression: "sqrt(planar-r-squared*active-cell-share),singular-covariance-fallback=max-available-axis-r-squared",
		mass: "coverage*sqrt(from-presence*to-presence)*balance",
	},
	commonDomainSample: {
		maximumSide: maximumSampleSide,
		maximumCount: maximumSampleSide * maximumSampleSide,
		dimensions: "min(maximum-side,raster-axis)-per-axis",
		mapping: "nearest-cell-center-floor((2*cell+1)*extent/(2*cell-count))",
	},
	numeric: { epsilon },
	graph: {
		edges: "all-ordered-distinct-candidate-pairs",
		eligibleEdges: "all-ordered-distinct-pareto-eligible-pairs",
		fieldStates: ["collapsed", "distinct-flat", "gradient"],
	},
	serialization: {
		omittedRasterPlanes: ["pixelBinIds", "candidateLabels", "familyLabels"],
		typedArrayHashVersion: RESOLUTION_EVIDENCE_TYPED_ARRAY_HASH_VERSION,
		typedArrayHashEncoding: "manifest-nul-canonical-unsigned-big-endian-values",
	},
} as const)

export const RESOLUTION_EVIDENCE_POLICY_SHA256 = createHash("sha256")
	.update(JSON.stringify(RESOLUTION_EVIDENCE_POLICY), "utf8")
	.digest("hex")

const linearRgb = new Float64Array(256)
for (let value = 0; value < linearRgb.length; value++) {
	const channel = value / 255
	linearRgb[value] = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

export type ResolutionEvidenceBinFrame = {
	counts: Uint32Array
	sumLightness: Float64Array
	sumA: Float64Array
	sumB: Float64Array
	sumRed: Float64Array
	sumGreen: Float64Array
	sumBlue: Float64Array
	detailSum: Float64Array
	borderBandCounts: Uint32Array
	interiorCounts: Uint32Array
	candidateIds: Uint8Array
}

export type ResolutionEvidenceSpatialFrame = {
	pixelCounts: Uint32Array
	population: Float64Array
	edgeDetail: Float64Array
	borderFrame: Float64Array
	interiorOwnership: Float64Array
	componentCounts: Uint32Array
	componentAreaHistogram: Uint32Array
	borderTouchingComponentCounts: Uint32Array
	thinComponentCounts: Uint32Array
	componentSignatureSha256: Uint8Array
	largestComponentPopulation: Float64Array
	sideCoverage: Float64Array
	thinComponentSupport: Float64Array
	typographySupport: Float64Array
	fieldBroad: Float64Array
	fieldDetail: Float64Array
	fieldFrame: Float64Array
}

export type ResolutionEvidenceCandidateFrame = ResolutionEvidenceSpatialFrame & {
	count: number
	meanLab: Float64Array
	analysisRepresentativeRgb: Uint8Array
	analysisRepresentativeLab: Float64Array
	analysisRepresentativeIndices: Int32Array
	analysisRepresentativeDistance: Float64Array
	nativeWitnessRgb: Uint8Array
	nativeWitnessLab: Float64Array
	nativeWitnessIndices: Int32Array
	nativeWitnessDistance: Float64Array
	nativeWitnessFootprintStartX: Int32Array
	nativeWitnessFootprintEndX: Int32Array
	nativeWitnessFootprintStartY: Int32Array
	nativeWitnessFootprintEndY: Int32Array
	nativeWitnessDuplicateCounts: Uint8Array
	nativeWitnessDuplicateOffsets: Uint16Array
	nativeWitnessDuplicateIds: Uint8Array
	analysisRepresentativeNativeExact: Uint8Array
	familyIds: Uint8Array
}

export type ResolutionEvidencePaletteMode = "analysis" | "native-witness"

export type ResolutionEvidenceFamilyFrame = ResolutionEvidenceSpatialFrame & {
	count: number
	anchorCandidateIds: Uint8Array
	memberCounts: Uint8Array
}

export type ResolutionEvidenceFieldFrame = {
	broad: Float64Array
	detail: Float64Array
	frame: Float64Array
	paretoEligible: Uint8Array
	eligibleNodeIds: Uint8Array
}

export type ResolutionEvidenceInputIdentity = {
	analysisRasterIdentity?: string
	decodedNativeRasterIdentity?: string
	rasterPolicyIdentity?: string
}

export type ResolutionEvidenceProvenance = {
	analysisRasterIdentity: string | null
	decodedNativeRasterIdentity: string | null
	rasterPolicyIdentity: string | null
}

export type ResolutionEvidencePlaneHashes = {
	version: typeof RESOLUTION_EVIDENCE_TYPED_ARRAY_HASH_VERSION
	pixelBinIds: string
	candidateLabels: string
	familyLabels: string
}

export type ResolutionEvidenceInvariants = {
	analysisRepresentativesMatchInput: true
	analysisRepresentativeNativeMembershipVerified: true
	nativeWitnessesExist: true
	nativeWitnessesMatchInput: true
	nativeWitnessesMinimizeDistanceInFootprint: true
	duplicateWitnessIdsComplete: true
	labelPartitionsComplete: true
	eligibleNodeIdsExactlyPareto: true
	familyGeometryUsesAnalysisRepresentatives: true
	relationGeometryUsesAnalysisRepresentatives: true
	policyHashVerified: true
}

export type ResolutionEvidenceRelationFrame = {
	count: number
	fromNodeIds: Uint8Array
	toNodeIds: Uint8Array
	endpointDistance: Float64Array
	fromPresence: Float64Array
	toPresence: Float64Array
	balance: Float64Array
	mass: Float64Array
	coverage: Float64Array
	middleContinuity: Float64Array
	coarseSpatialProgression: Float64Array
}

export type ResolutionEvidenceGraphCounts = {
	nodes: number
	edges: number
	eligibleNodes: number
	eligibleOrderedEdges: number
	fieldTreatments: number
	collapsedFieldTreatments: number
	distinctFlatFieldTreatments: number
	gradientFieldTreatments: number
}

export type ResolutionEvidenceFrame = {
	version: typeof RESOLUTION_EVIDENCE_VERSION
	policy: typeof RESOLUTION_EVIDENCE_POLICY
	policySha256: typeof RESOLUTION_EVIDENCE_POLICY_SHA256
	provenance: ResolutionEvidenceProvenance
	planeHashes: ResolutionEvidencePlaneHashes
	invariants: ResolutionEvidenceInvariants
	width: number
	height: number
	nativeWidth: number
	nativeHeight: number
	occupiedBinCount: number
	pixelBinIds: Uint16Array
	candidateLabels: Uint8Array
	familyLabels: Uint8Array
	bins: ResolutionEvidenceBinFrame
	candidates: ResolutionEvidenceCandidateFrame
	families: ResolutionEvidenceFamilyFrame
	field: ResolutionEvidenceFieldFrame
	relations: ResolutionEvidenceRelationFrame
	graph: ResolutionEvidenceGraphCounts
	commonDomainSample: {
		width: number
		height: number
		count: number
	}
}

type BinConstruction = {
	frame: ResolutionEvidenceBinFrame
	pixelBinIds: Uint16Array
	occupiedKeys: Uint16Array
	meanLightness: Float64Array
	meanA: Float64Array
	meanB: Float64Array
}

type ClusterConstruction = {
	count: number
	meanLab: Float64Array
	labels: Uint8Array
}

type Sample = {
	width: number
	height: number
	labs: Float32Array
}

const clamp01 = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0

function floorProductRatio(value: number, extent: number, denominator: number): number {
	return Number(BigInt(value) * BigInt(extent) / BigInt(denominator))
}

function ceilProductRatio(value: number, extent: number, denominator: number): number {
	const numerator = BigInt(value) * BigInt(extent)
	const divisor = BigInt(denominator)
	return Number((numerator + divisor - 1n) / divisor)
}

function nearestCenterCoordinate(cell: number, cellCount: number, extent: number): number {
	return Math.min(extent - 1, floorProductRatio(2 * cell + 1, extent, 2 * cellCount))
}

function optionalIdentity(value: string | undefined, name: string): string | null {
	if (value === undefined) return null
	if (typeof value !== "string" || value.length === 0) throw new TypeError(`${name} must be a non-empty string`)
	return value
}

function buildNativeRgbOccupancy(native: RawImage): Uint32Array {
	const occupancy = new Uint32Array(nativeRgbOccupancyWords)
	for (let offset = 0; offset < native.data.length; offset += 3) {
		const packed = native.data[offset] * 65_536 + native.data[offset + 1] * 256 + native.data[offset + 2]
		occupancy[Math.floor(packed / 32)] |= 1 << (packed % 32)
	}
	return occupancy
}

function nativeRgbOccupancyHas(occupancy: Uint32Array, red: number, green: number, blue: number): boolean {
	const packed = red * 65_536 + green * 256 + blue
	return ((occupancy[Math.floor(packed / 32)] >>> (packed % 32)) & 1) === 1
}

function writeUint32BigEndian(target: Uint8Array, offset: number, value: number): void {
	target[offset] = value >>> 24
	target[offset + 1] = value >>> 16
	target[offset + 2] = value >>> 8
	target[offset + 3] = value
}

/** Hash typed numeric values with an explicit canonical big-endian encoding. */
export function canonicalResolutionEvidenceTypedArrayHash(array: Uint8Array | Uint16Array): string {
	const type = array instanceof Uint16Array ? "Uint16" : "Uint8"
	const hash = createHash("sha256").update(JSON.stringify({
		version: RESOLUTION_EVIDENCE_TYPED_ARRAY_HASH_VERSION,
		type,
		length: array.length,
		encoding: type === "Uint16" ? "unsigned-big-endian-values" : "unsigned-bytes",
	}), "utf8").update("\0")
	if (array instanceof Uint8Array) return hash.update(array).digest("hex")
	const valuesPerChunk = 4096
	const bytes = new Uint8Array(valuesPerChunk * 2)
	for (let start = 0; start < array.length; start += valuesPerChunk) {
		const count = Math.min(valuesPerChunk, array.length - start)
		for (let index = 0; index < count; index++) {
			const value = array[start + index]
			bytes[index * 2] = value >>> 8
			bytes[index * 2 + 1] = value & 0xff
		}
		hash.update(bytes.subarray(0, count * 2))
	}
	return hash.digest("hex")
}

/** The exact 32x24x24 key layout used by the current candidate implementation. */
export function resolutionEvidenceBinKey(lightness: number, a: number, b: number): number {
	if (!Number.isFinite(lightness) || !Number.isFinite(a) || !Number.isFinite(b)) {
		throw new RangeError("OKLab bin inputs must be finite")
	}
	const lightnessBin = Math.max(0, Math.min(31, Math.floor(lightness * 32)))
	const aBin = Math.max(0, Math.min(23, Math.floor(((a + 0.4) / 0.8) * 24)))
	const bBin = Math.max(0, Math.min(23, Math.floor(((b + 0.4) / 0.8) * 24)))
	return (lightnessBin << 10) | (aBin << 5) | bBin
}

function labFromChannels(red: number, green: number, blue: number, target: Float64Array, offset: number): void {
	const r = linearRgb[red]
	const g = linearRgb[green]
	const b = linearRgb[blue]
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
	target[offset] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
	target[offset + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
	target[offset + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
}

function validateImage(image: RawImage, name: string): void {
	if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width <= 0 || image.height <= 0) {
		throw new RangeError(`${name} dimensions must be positive safe integers`)
	}
	const pixels = image.width * image.height
	if (!Number.isSafeInteger(pixels) || pixels > RESOLUTION_EVIDENCE_MAX_PIXELS) {
		throw new RangeError(`${name} pixel count must fit positive Int32 indices`)
	}
	const expected = pixels * 3
	if (image.data.length !== expected) {
		throw new RangeError(`${name} RGB buffer must contain ${expected} bytes; received ${image.data.length}`)
	}
}

function borderBandSize(width: number, height: number): number {
	return Math.max(1, Math.min(
		Math.floor(Math.min(width, height) * borderBandRatio),
		Math.floor((Math.min(width, height) - 1) / 2),
	))
}

function inBorderBand(x: number, y: number, width: number, height: number, band: number): boolean {
	return x < band || y < band || x >= width - band || y >= height - band
}

function buildBinFrame(image: RawImage): BinConstruction {
	const counts = new Uint32Array(RESOLUTION_EVIDENCE_BIN_CAPACITY)
	const sumLightness = new Float64Array(RESOLUTION_EVIDENCE_BIN_CAPACITY)
	const sumA = new Float64Array(RESOLUTION_EVIDENCE_BIN_CAPACITY)
	const sumB = new Float64Array(RESOLUTION_EVIDENCE_BIN_CAPACITY)
	const sumRed = new Float64Array(RESOLUTION_EVIDENCE_BIN_CAPACITY)
	const sumGreen = new Float64Array(RESOLUTION_EVIDENCE_BIN_CAPACITY)
	const sumBlue = new Float64Array(RESOLUTION_EVIDENCE_BIN_CAPACITY)
	const detailSum = new Float64Array(RESOLUTION_EVIDENCE_BIN_CAPACITY)
	const borderBandCounts = new Uint32Array(RESOLUTION_EVIDENCE_BIN_CAPACITY)
	const interiorCounts = new Uint32Array(RESOLUTION_EVIDENCE_BIN_CAPACITY)
	const candidateIds = new Uint8Array(RESOLUTION_EVIDENCE_BIN_CAPACITY).fill(unassignedLabel)
	const pixelBinIds = new Uint16Array(image.width * image.height)
	const lab = new Float64Array(3)

	for (let pixel = 0; pixel < pixelBinIds.length; pixel++) {
		const offset = pixel * 3
		labFromChannels(image.data[offset], image.data[offset + 1], image.data[offset + 2], lab, 0)
		const key = resolutionEvidenceBinKey(lab[0], lab[1], lab[2])
		pixelBinIds[pixel] = key
		counts[key]++
		sumLightness[key] += lab[0]
		sumA[key] += lab[1]
		sumB[key] += lab[2]
		sumRed[key] += image.data[offset]
		sumGreen[key] += image.data[offset + 1]
		sumBlue[key] += image.data[offset + 2]
	}

	const occupied = new Uint16Array(counts.reduce((total, count) => total + (count > 0 ? 1 : 0), 0))
	const meanLightness = new Float64Array(RESOLUTION_EVIDENCE_BIN_CAPACITY)
	const meanA = new Float64Array(RESOLUTION_EVIDENCE_BIN_CAPACITY)
	const meanB = new Float64Array(RESOLUTION_EVIDENCE_BIN_CAPACITY)
	let occupiedIndex = 0
	for (let key = 0; key < counts.length; key++) {
		if (counts[key] === 0) continue
		occupied[occupiedIndex++] = key
		meanLightness[key] = sumLightness[key] / counts[key]
		meanA[key] = sumA[key] / counts[key]
		meanB[key] = sumB[key] / counts[key]
	}

	return {
		frame: {
			counts,
			sumLightness,
			sumA,
			sumB,
			sumRed,
			sumGreen,
			sumBlue,
			detailSum,
			borderBandCounts,
			interiorCounts,
			candidateIds,
		},
		pixelBinIds,
		occupiedKeys: occupied,
		meanLightness,
		meanA,
		meanB,
	}
}

function squaredBinDistance(
	key: number,
	center: number,
	meanLightness: Float64Array,
	meanA: Float64Array,
	meanB: Float64Array,
	centers: Float64Array,
): number {
	const offset = center * 3
	return (meanLightness[key] - centers[offset]) ** 2 +
		(meanA[key] - centers[offset + 1]) ** 2 +
		(meanB[key] - centers[offset + 2]) ** 2
}

function clusterBins(bins: BinConstruction): ClusterConstruction {
	const desiredCount = Math.min(RESOLUTION_EVIDENCE_MAX_CANDIDATES, bins.occupiedKeys.length)
	const centerValues = new Float64Array(desiredCount * 3)
	const selected = new Uint16Array(desiredCount)
	const selectedFlags = new Uint8Array(RESOLUTION_EVIDENCE_BIN_CAPACITY)
	let firstKey = bins.occupiedKeys[0]
	for (let index = 1; index < bins.occupiedKeys.length; index++) {
		const key = bins.occupiedKeys[index]
		if (bins.frame.counts[key] > bins.frame.counts[firstKey]) firstKey = key
	}
	selected[0] = firstKey
	selectedFlags[firstKey] = 1
	centerValues[0] = bins.meanLightness[firstKey]
	centerValues[1] = bins.meanA[firstKey]
	centerValues[2] = bins.meanB[firstKey]

	for (let candidate = 1; candidate < desiredCount; candidate++) {
		let bestKey = -1
		let bestEvidence = -1
		for (const key of bins.occupiedKeys) {
			if (selectedFlags[key]) continue
			let nearest = Infinity
			for (let center = 0; center < candidate; center++) {
				nearest = Math.min(nearest, squaredBinDistance(
					key,
					center,
					bins.meanLightness,
					bins.meanA,
					bins.meanB,
					centerValues,
				))
			}
			const evidence = nearest * Math.sqrt(bins.frame.counts[key])
			if (evidence > bestEvidence || evidence === bestEvidence && key < bestKey) {
				bestEvidence = evidence
				bestKey = key
			}
		}
		selected[candidate] = bestKey
		selectedFlags[bestKey] = 1
		const offset = candidate * 3
		centerValues[offset] = bins.meanLightness[bestKey]
		centerValues[offset + 1] = bins.meanA[bestKey]
		centerValues[offset + 2] = bins.meanB[bestKey]
	}

	const groupCounts = new Float64Array(desiredCount)
	const sums = new Float64Array(desiredCount * 3)
	for (let iteration = 0; iteration < lloydIterations; iteration++) {
		groupCounts.fill(0)
		sums.fill(0)
		for (const key of bins.occupiedKeys) {
			let closest = 0
			let closestDistance = squaredBinDistance(key, 0, bins.meanLightness, bins.meanA, bins.meanB, centerValues)
			for (let candidate = 1; candidate < desiredCount; candidate++) {
				const distance = squaredBinDistance(
					key,
					candidate,
					bins.meanLightness,
					bins.meanA,
					bins.meanB,
					centerValues,
				)
				if (distance < closestDistance) {
					closest = candidate
					closestDistance = distance
				}
			}
			bins.frame.candidateIds[key] = closest
			const count = bins.frame.counts[key]
			const offset = closest * 3
			groupCounts[closest] += count
			sums[offset] += bins.frame.sumLightness[key]
			sums[offset + 1] += bins.frame.sumA[key]
			sums[offset + 2] += bins.frame.sumB[key]
		}
		let movement = 0
		for (let candidate = 0; candidate < desiredCount; candidate++) {
			if (groupCounts[candidate] === 0) continue
			const offset = candidate * 3
			const nextL = sums[offset] / groupCounts[candidate]
			const nextA = sums[offset + 1] / groupCounts[candidate]
			const nextB = sums[offset + 2] / groupCounts[candidate]
			movement += Math.hypot(
				nextL - centerValues[offset],
				nextA - centerValues[offset + 1],
				nextB - centerValues[offset + 2],
			)
			centerValues[offset] = nextL
			centerValues[offset + 1] = nextA
			centerValues[offset + 2] = nextB
		}
		if (movement < lloydConvergence) break
	}

	// Reassign once to the final centers, then compact any empty Lloyd groups.
	groupCounts.fill(0)
	for (const key of bins.occupiedKeys) {
		let closest = 0
		let closestDistance = squaredBinDistance(key, 0, bins.meanLightness, bins.meanA, bins.meanB, centerValues)
		for (let candidate = 1; candidate < desiredCount; candidate++) {
			const distance = squaredBinDistance(
				key,
				candidate,
				bins.meanLightness,
				bins.meanA,
				bins.meanB,
				centerValues,
			)
			if (distance < closestDistance) {
				closest = candidate
				closestDistance = distance
			}
		}
		bins.frame.candidateIds[key] = closest
		groupCounts[closest] += bins.frame.counts[key]
	}
	const remap = new Uint8Array(desiredCount).fill(unassignedLabel)
	let count = 0
	for (let candidate = 0; candidate < desiredCount; candidate++) {
		if (groupCounts[candidate] > 0) remap[candidate] = count++
	}
	const meanLab = new Float64Array(count * 3)
	const compactCounts = new Float64Array(count)
	for (const key of bins.occupiedKeys) {
		const compact = remap[bins.frame.candidateIds[key]]
		bins.frame.candidateIds[key] = compact
		const offset = compact * 3
		const binCount = bins.frame.counts[key]
		compactCounts[compact] += binCount
		meanLab[offset] += bins.frame.sumLightness[key]
		meanLab[offset + 1] += bins.frame.sumA[key]
		meanLab[offset + 2] += bins.frame.sumB[key]
	}
	for (let candidate = 0; candidate < count; candidate++) {
		const offset = candidate * 3
		meanLab[offset] /= compactCounts[candidate]
		meanLab[offset + 1] /= compactCounts[candidate]
		meanLab[offset + 2] /= compactCounts[candidate]
	}
	const labels = new Uint8Array(bins.pixelBinIds.length)
	for (let pixel = 0; pixel < labels.length; pixel++) labels[pixel] = bins.frame.candidateIds[bins.pixelBinIds[pixel]]
	return { count, meanLab, labels }
}

function meanBinDistance(first: number, second: number, bins: BinConstruction): number {
	return Math.hypot(
		bins.meanLightness[first] - bins.meanLightness[second],
		bins.meanA[first] - bins.meanA[second],
		bins.meanB[first] - bins.meanB[second],
	)
}

function buildPixelDetailPlane(image: RawImage, bins: BinConstruction): Float32Array {
	const { width, height } = image
	const band = borderBandSize(width, height)
	const details = new Float32Array(width * height)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const pixel = y * width + x
			const key = bins.pixelBinIds[pixel]
			let difference = 0
			let neighbors = 0
			if (x > 0) {
				difference += meanBinDistance(key, bins.pixelBinIds[pixel - 1], bins)
				neighbors++
			}
			if (x + 1 < width) {
				difference += meanBinDistance(key, bins.pixelBinIds[pixel + 1], bins)
				neighbors++
			}
			if (y > 0) {
				difference += meanBinDistance(key, bins.pixelBinIds[pixel - width], bins)
				neighbors++
			}
			if (y + 1 < height) {
				difference += meanBinDistance(key, bins.pixelBinIds[pixel + width], bins)
				neighbors++
			}
			const detail = clamp01(difference / Math.max(1, neighbors) / detailDistanceScale)
			details[pixel] = detail
			bins.frame.detailSum[key] += detail
			if (inBorderBand(x, y, width, height, band)) bins.frame.borderBandCounts[key]++
			else bins.frame.interiorCounts[key]++
		}
	}
	return details
}

function analyzeLabelPlane(
	labels: Uint8Array,
	labelCount: number,
	width: number,
	height: number,
	pixelDetails: Float32Array,
): ResolutionEvidenceSpatialFrame {
	const total = width * height
	const pixelCounts = new Uint32Array(labelCount)
	const detailSums = new Float64Array(labelCount)
	const borderCounts = new Uint32Array(labelCount)
	const interiorCounts = new Uint32Array(labelCount)
	const componentCounts = new Uint32Array(labelCount)
	const componentAreaHistogram = new Uint32Array(labelCount * RESOLUTION_EVIDENCE_COMPONENT_AREA_BINS)
	const borderTouchingComponentCounts = new Uint32Array(labelCount)
	const thinComponentCounts = new Uint32Array(labelCount)
	const componentSignatureSha256 = new Uint8Array(labelCount * componentSignatureBytes)
	const largestComponentCounts = new Uint32Array(labelCount)
	const sideCounts = new Uint32Array(labelCount * 4)
	const thinCounts = new Uint32Array(labelCount)
	const typographySums = new Float64Array(labelCount)
	const visited = new Uint8Array(total)
	const stack = new Int32Array(total)
	const band = borderBandSize(width, height)
	const interiorWidth = Math.max(0, width - 2 * band)
	const interiorHeight = Math.max(0, height - 2 * band)
	const interiorArea = interiorWidth * interiorHeight
	const borderArea = total - interiorArea
	const thinLimit = Math.max(1, Math.floor(Math.min(width, height) * thinComponentRatio))
	const componentSignatureHeader = JSON.stringify({
		version: "resolution-evidence-component-signature-sha256-v1",
		width,
		height,
		connectivity: 4,
		order: "ascending-first-pixel",
		record: "area,minX,minY,maxX,maxY,borderPixels:uint32be;thin:uint8",
	})
	const componentHashes = Array.from({ length: labelCount }, () =>
		createHash("sha256").update(componentSignatureHeader, "utf8").update("\0"))
	const componentRecord = new Uint8Array(25)

	for (let start = 0; start < total; start++) {
		if (visited[start]) continue
		const label = labels[start]
		let stackSize = 0
		let componentSize = 0
		let componentDetail = 0
		let componentBorderPixels = 0
		let minimumX = width
		let maximumX = -1
		let minimumY = height
		let maximumY = -1
		stack[stackSize++] = start
		visited[start] = 1
		while (stackSize > 0) {
			const pixel = stack[--stackSize]
			const x = pixel % width
			const y = Math.floor(pixel / width)
			const pixelDetail = pixelDetails[pixel]
			componentSize++
			componentDetail += pixelDetail
			minimumX = Math.min(minimumX, x)
			maximumX = Math.max(maximumX, x)
			minimumY = Math.min(minimumY, y)
			maximumY = Math.max(maximumY, y)
			pixelCounts[label]++
			detailSums[label] += pixelDetail
			if (inBorderBand(x, y, width, height, band)) borderCounts[label]++
			else interiorCounts[label]++
			if (y === 0) sideCounts[label * 4]++
			if (x === width - 1) sideCounts[label * 4 + 1]++
			if (y === height - 1) sideCounts[label * 4 + 2]++
			if (x === 0) sideCounts[label * 4 + 3]++
			if (x === 0 || x === width - 1 || y === 0 || y === height - 1) componentBorderPixels++

			if (x > 0) {
				const next = pixel - 1
				if (!visited[next] && labels[next] === label) {
					visited[next] = 1
					stack[stackSize++] = next
				}
			}
			if (x + 1 < width) {
				const next = pixel + 1
				if (!visited[next] && labels[next] === label) {
					visited[next] = 1
					stack[stackSize++] = next
				}
			}
			if (y > 0) {
				const next = pixel - width
				if (!visited[next] && labels[next] === label) {
					visited[next] = 1
					stack[stackSize++] = next
				}
			}
			if (y + 1 < height) {
				const next = pixel + width
				if (!visited[next] && labels[next] === label) {
					visited[next] = 1
					stack[stackSize++] = next
				}
			}
		}
		componentCounts[label]++
		componentAreaHistogram[label * RESOLUTION_EVIDENCE_COMPONENT_AREA_BINS + Math.min(
			RESOLUTION_EVIDENCE_COMPONENT_AREA_BINS - 1,
			Math.floor(Math.log2(componentSize)),
		)]++
		if (componentBorderPixels > 0) borderTouchingComponentCounts[label]++
		largestComponentCounts[label] = Math.max(largestComponentCounts[label], componentSize)
		const componentWidth = maximumX - minimumX + 1
		const componentHeight = maximumY - minimumY + 1
		const minorExtent = Math.min(componentWidth, componentHeight)
		const majorExtent = Math.max(componentWidth, componentHeight)
		const thin = minorExtent <= thinLimit && (
			majorExtent >= minorExtent * thinComponentElongation || componentSize <= thinComponentSmallArea
		)
		if (thin) {
			thinComponentCounts[label]++
			thinCounts[label] += componentSize
			typographySums[label] += componentDetail
		}
		writeUint32BigEndian(componentRecord, 0, componentSize)
		writeUint32BigEndian(componentRecord, 4, minimumX)
		writeUint32BigEndian(componentRecord, 8, minimumY)
		writeUint32BigEndian(componentRecord, 12, maximumX)
		writeUint32BigEndian(componentRecord, 16, maximumY)
		writeUint32BigEndian(componentRecord, 20, componentBorderPixels)
		componentRecord[24] = thin ? 1 : 0
		componentHashes[label].update(componentRecord)
	}
	for (let label = 0; label < labelCount; label++) {
		componentSignatureSha256.set(componentHashes[label].digest(), label * componentSignatureBytes)
	}

	const population = new Float64Array(labelCount)
	const edgeDetail = new Float64Array(labelCount)
	const borderFrame = new Float64Array(labelCount)
	const interiorOwnership = new Float64Array(labelCount)
	const largestComponentPopulation = new Float64Array(labelCount)
	const sideCoverage = new Float64Array(labelCount * 4)
	const thinComponentSupport = new Float64Array(labelCount)
	const typographySupport = new Float64Array(labelCount)
	const fieldBroad = new Float64Array(labelCount)
	const fieldDetail = new Float64Array(labelCount)
	const fieldFrame = new Float64Array(labelCount)
	for (let label = 0; label < labelCount; label++) {
		const support = pixelCounts[label]
		population[label] = support / total
		edgeDetail[label] = support === 0 ? 0 : detailSums[label] / support
		const borderOwnership = borderCounts[label] / Math.max(1, borderArea)
		interiorOwnership[label] = interiorCounts[label] / Math.max(1, interiorArea)
		borderFrame[label] = clamp01(borderOwnership - interiorOwnership[label])
		largestComponentPopulation[label] = largestComponentCounts[label] / total
		sideCoverage[label * 4] = sideCounts[label * 4] / width
		sideCoverage[label * 4 + 1] = sideCounts[label * 4 + 1] / height
		sideCoverage[label * 4 + 2] = sideCounts[label * 4 + 2] / width
		sideCoverage[label * 4 + 3] = sideCounts[label * 4 + 3] / height
		thinComponentSupport[label] = support === 0 ? 0 : thinCounts[label] / support
		typographySupport[label] = support === 0 ? 0 : typographySums[label] / support
		fieldBroad[label] = population[label] === 0
			? 0
			: clamp01(largestComponentPopulation[label] / Math.sqrt(population[label]))
		fieldDetail[label] = Math.max(edgeDetail[label], typographySupport[label])
		fieldFrame[label] = borderFrame[label]
	}
	return {
		pixelCounts,
		population,
		edgeDetail,
		borderFrame,
		interiorOwnership,
		componentCounts,
		componentAreaHistogram,
		borderTouchingComponentCounts,
		thinComponentCounts,
		componentSignatureSha256,
		largestComponentPopulation,
		sideCoverage,
		thinComponentSupport,
		typographySupport,
		fieldBroad,
		fieldDetail,
		fieldFrame,
	}
}

function nativeFootprintForAnalysisPixel(pixel: number, analysis: RawImage, native: RawImage) {
	const x = pixel % analysis.width
	const y = Math.floor(pixel / analysis.width)
	return {
		startX: floorProductRatio(x, native.width, analysis.width),
		endX: Math.min(native.width, ceilProductRatio(x + 1, native.width, analysis.width)),
		startY: floorProductRatio(y, native.height, analysis.height),
		endY: Math.min(native.height, ceilProductRatio(y + 1, native.height, analysis.height)),
	}
}

function buildCandidateFrame(
	analysis: RawImage,
	native: RawImage,
	bins: BinConstruction,
	clusters: ClusterConstruction,
	pixelDetails: Float32Array,
	nativeRgbOccupancy: Uint32Array,
): ResolutionEvidenceCandidateFrame {
	const representativeBins = new Uint16Array(clusters.count)
	const bestBinDistances = new Float64Array(clusters.count).fill(Infinity)
	for (const key of bins.occupiedKeys) {
		const candidate = bins.frame.candidateIds[key]
		const offset = candidate * 3
		const distance = Math.hypot(
			bins.meanLightness[key] - clusters.meanLab[offset],
			bins.meanA[key] - clusters.meanLab[offset + 1],
			bins.meanB[key] - clusters.meanLab[offset + 2],
		)
		if (distance < bestBinDistances[candidate] ||
			distance === bestBinDistances[candidate] && key < representativeBins[candidate]) {
			bestBinDistances[candidate] = distance
			representativeBins[candidate] = key
		}
	}
	const representativeBinCandidates = new Uint8Array(RESOLUTION_EVIDENCE_BIN_CAPACITY).fill(unassignedLabel)
	for (let candidate = 0; candidate < clusters.count; candidate++) {
		representativeBinCandidates[representativeBins[candidate]] = candidate
	}
	const analysisRepresentativeIndices = new Int32Array(clusters.count).fill(-1)
	const analysisRepresentativeDistance = new Float64Array(clusters.count).fill(Infinity)
	const lab = new Float64Array(3)
	for (let pixel = 0; pixel < bins.pixelBinIds.length; pixel++) {
		const candidate = representativeBinCandidates[bins.pixelBinIds[pixel]]
		if (candidate === unassignedLabel) continue
		const rgbOffset = pixel * 3
		labFromChannels(analysis.data[rgbOffset], analysis.data[rgbOffset + 1], analysis.data[rgbOffset + 2], lab, 0)
		const offset = candidate * 3
		const distance = Math.hypot(
			lab[0] - clusters.meanLab[offset],
			lab[1] - clusters.meanLab[offset + 1],
			lab[2] - clusters.meanLab[offset + 2],
		)
		if (distance < analysisRepresentativeDistance[candidate]) {
			analysisRepresentativeDistance[candidate] = distance
			analysisRepresentativeIndices[candidate] = pixel
		}
	}

	const analysisRepresentativeRgb = new Uint8Array(clusters.count * 3)
	const analysisRepresentativeLab = new Float64Array(clusters.count * 3)
	const nativeWitnessRgb = new Uint8Array(clusters.count * 3)
	const nativeWitnessLab = new Float64Array(clusters.count * 3)
	const nativeWitnessIndices = new Int32Array(clusters.count)
	const nativeWitnessDistance = new Float64Array(clusters.count).fill(Infinity)
	const nativeWitnessFootprintStartX = new Int32Array(clusters.count)
	const nativeWitnessFootprintEndX = new Int32Array(clusters.count)
	const nativeWitnessFootprintStartY = new Int32Array(clusters.count)
	const nativeWitnessFootprintEndY = new Int32Array(clusters.count)
	const analysisRepresentativeNativeExact = new Uint8Array(clusters.count)
	for (let candidate = 0; candidate < clusters.count; candidate++) {
		const offset = candidate * 3
		const analysisOffset = analysisRepresentativeIndices[candidate] * 3
		analysisRepresentativeRgb[offset] = analysis.data[analysisOffset]
		analysisRepresentativeRgb[offset + 1] = analysis.data[analysisOffset + 1]
		analysisRepresentativeRgb[offset + 2] = analysis.data[analysisOffset + 2]
		analysisRepresentativeNativeExact[candidate] = nativeRgbOccupancyHas(
			nativeRgbOccupancy,
			analysisRepresentativeRgb[offset],
			analysisRepresentativeRgb[offset + 1],
			analysisRepresentativeRgb[offset + 2],
		) ? 1 : 0
		labFromChannels(
			analysisRepresentativeRgb[offset],
			analysisRepresentativeRgb[offset + 1],
			analysisRepresentativeRgb[offset + 2],
			analysisRepresentativeLab,
			offset,
		)

		const footprint = nativeFootprintForAnalysisPixel(analysisRepresentativeIndices[candidate], analysis, native)
		nativeWitnessFootprintStartX[candidate] = footprint.startX
		nativeWitnessFootprintEndX[candidate] = footprint.endX
		nativeWitnessFootprintStartY[candidate] = footprint.startY
		nativeWitnessFootprintEndY[candidate] = footprint.endY
		let witnessIndex = -1
		for (let y = footprint.startY; y < footprint.endY; y++) {
			for (let x = footprint.startX; x < footprint.endX; x++) {
				const nativeIndex = y * native.width + x
				const nativeOffset = nativeIndex * 3
				labFromChannels(native.data[nativeOffset], native.data[nativeOffset + 1], native.data[nativeOffset + 2], lab, 0)
				const distance = Math.hypot(
					lab[0] - clusters.meanLab[offset],
					lab[1] - clusters.meanLab[offset + 1],
					lab[2] - clusters.meanLab[offset + 2],
				)
				if (distance < nativeWitnessDistance[candidate]) {
					nativeWitnessDistance[candidate] = distance
					witnessIndex = nativeIndex
					nativeWitnessLab[offset] = lab[0]
					nativeWitnessLab[offset + 1] = lab[1]
					nativeWitnessLab[offset + 2] = lab[2]
				}
			}
		}
		if (witnessIndex < 0) throw new Error(`Candidate ${candidate} has an empty native source-cell footprint`)
		nativeWitnessIndices[candidate] = witnessIndex
		const witnessOffset = witnessIndex * 3
		nativeWitnessRgb[offset] = native.data[witnessOffset]
		nativeWitnessRgb[offset + 1] = native.data[witnessOffset + 1]
		nativeWitnessRgb[offset + 2] = native.data[witnessOffset + 2]
	}
	const nativeWitnessDuplicateCounts = new Uint8Array(clusters.count)
	for (let candidate = 0; candidate < clusters.count; candidate++) {
		const offset = candidate * 3
		for (let other = 0; other < clusters.count; other++) {
			const otherOffset = other * 3
			if (other !== candidate && nativeWitnessRgb[offset] === nativeWitnessRgb[otherOffset] &&
				nativeWitnessRgb[offset + 1] === nativeWitnessRgb[otherOffset + 1] &&
				nativeWitnessRgb[offset + 2] === nativeWitnessRgb[otherOffset + 2]) {
				nativeWitnessDuplicateCounts[candidate]++
			}
		}
	}
	const nativeWitnessDuplicateOffsets = new Uint16Array(clusters.count + 1)
	for (let candidate = 0; candidate < clusters.count; candidate++) {
		nativeWitnessDuplicateOffsets[candidate + 1] =
			nativeWitnessDuplicateOffsets[candidate] + nativeWitnessDuplicateCounts[candidate]
	}
	const nativeWitnessDuplicateIds = new Uint8Array(nativeWitnessDuplicateOffsets[clusters.count])
	for (let candidate = 0; candidate < clusters.count; candidate++) {
		const offset = candidate * 3
		let duplicate = nativeWitnessDuplicateOffsets[candidate]
		for (let other = 0; other < clusters.count; other++) {
			const otherOffset = other * 3
			if (other !== candidate && nativeWitnessRgb[offset] === nativeWitnessRgb[otherOffset] &&
				nativeWitnessRgb[offset + 1] === nativeWitnessRgb[otherOffset + 1] &&
				nativeWitnessRgb[offset + 2] === nativeWitnessRgb[otherOffset + 2]) {
				nativeWitnessDuplicateIds[duplicate++] = other
			}
		}
	}
	const spatial = analyzeLabelPlane(clusters.labels, clusters.count, analysis.width, analysis.height, pixelDetails)
	return {
		count: clusters.count,
		meanLab: clusters.meanLab,
		analysisRepresentativeRgb,
		analysisRepresentativeLab,
		analysisRepresentativeIndices,
		analysisRepresentativeDistance,
		nativeWitnessRgb,
		nativeWitnessLab,
		nativeWitnessIndices,
		nativeWitnessDistance,
		nativeWitnessFootprintStartX,
		nativeWitnessFootprintEndX,
		nativeWitnessFootprintStartY,
		nativeWitnessFootprintEndY,
		nativeWitnessDuplicateCounts,
		nativeWitnessDuplicateOffsets,
		nativeWitnessDuplicateIds,
		analysisRepresentativeNativeExact,
		familyIds: new Uint8Array(clusters.count).fill(unassignedLabel),
		...spatial,
	}
}

function candidateLabDistance(candidates: ResolutionEvidenceCandidateFrame, first: number, second: number): number {
	const firstOffset = first * 3
	const secondOffset = second * 3
	return Math.hypot(
		candidates.analysisRepresentativeLab[firstOffset] - candidates.analysisRepresentativeLab[secondOffset],
		candidates.analysisRepresentativeLab[firstOffset + 1] - candidates.analysisRepresentativeLab[secondOffset + 1],
		candidates.analysisRepresentativeLab[firstOffset + 2] - candidates.analysisRepresentativeLab[secondOffset + 2],
	)
}

function buildFamilyFrame(
	candidateLabels: Uint8Array,
	candidates: ResolutionEvidenceCandidateFrame,
	width: number,
	height: number,
	pixelDetails: Float32Array,
): { frame: ResolutionEvidenceFamilyFrame; labels: Uint8Array } {
	const order = Array.from({ length: candidates.count }, (_, candidate) => candidate)
	order.sort((first, second) => candidates.pixelCounts[second] - candidates.pixelCounts[first] || first - second)
	const anchors = new Uint8Array(candidates.count)
	let familyCount = 0
	for (const candidate of order) {
		let closestFamily = -1
		let closestDistance = Infinity
		for (let family = 0; family < familyCount; family++) {
			const distance = candidateLabDistance(candidates, candidate, anchors[family])
			if (distance <= RESOLUTION_EVIDENCE_FAMILY_RADIUS && distance < closestDistance) {
				closestDistance = distance
				closestFamily = family
			}
		}
		if (closestFamily < 0) {
			closestFamily = familyCount
			anchors[familyCount++] = candidate
		}
		candidates.familyIds[candidate] = closestFamily
	}
	const labels = new Uint8Array(candidateLabels.length)
	for (let pixel = 0; pixel < labels.length; pixel++) labels[pixel] = candidates.familyIds[candidateLabels[pixel]]
	const memberCounts = new Uint8Array(familyCount)
	for (const family of candidates.familyIds) memberCounts[family]++
	const spatial = analyzeLabelPlane(labels, familyCount, width, height, pixelDetails)
	return {
		labels,
		frame: {
			count: familyCount,
			anchorCandidateIds: anchors.slice(0, familyCount),
			memberCounts,
			...spatial,
		},
	}
}

function buildFieldFrame(
	candidates: ResolutionEvidenceCandidateFrame,
	families: ResolutionEvidenceFamilyFrame,
): ResolutionEvidenceFieldFrame {
	const broad = new Float64Array(candidates.count)
	const detail = new Float64Array(candidates.count)
	const frame = new Float64Array(candidates.count)
	const paretoEligible = new Uint8Array(candidates.count)
	for (let candidate = 0; candidate < candidates.count; candidate++) {
		const family = candidates.familyIds[candidate]
		broad[candidate] = Math.max(candidates.fieldBroad[candidate], families.fieldBroad[family])
		detail[candidate] = Math.max(candidates.fieldDetail[candidate], families.fieldDetail[family])
		frame[candidate] = Math.max(candidates.fieldFrame[candidate], families.fieldFrame[family])
	}
	for (let candidate = 0; candidate < candidates.count; candidate++) {
		let dominated = false
		for (let other = 0; other < candidates.count && !dominated; other++) {
			if (other === candidate) continue
			const noWorse = broad[other] >= broad[candidate] && detail[other] <= detail[candidate] &&
				frame[other] <= frame[candidate]
			const strictlyBetter = broad[other] > broad[candidate] || detail[other] < detail[candidate] ||
				frame[other] < frame[candidate]
			dominated = noWorse && strictlyBetter
		}
		paretoEligible[candidate] = dominated ? 0 : 1
	}
	const eligibleNodeIds = new Uint8Array(paretoEligible.reduce((total, eligible) => total + eligible, 0))
	let index = 0
	for (let candidate = 0; candidate < candidates.count; candidate++) {
		if (paretoEligible[candidate]) eligibleNodeIds[index++] = candidate
	}
	return { broad, detail, frame, paretoEligible, eligibleNodeIds }
}

function buildSample(image: RawImage): Sample {
	const width = Math.min(maximumSampleSide, image.width)
	const height = Math.min(maximumSampleSide, image.height)
	const labs = new Float32Array(width * height * 3)
	const lab = new Float64Array(3)
	for (let sampleY = 0; sampleY < height; sampleY++) {
		const y = nearestCenterCoordinate(sampleY, height, image.height)
		for (let sampleX = 0; sampleX < width; sampleX++) {
			const x = nearestCenterCoordinate(sampleX, width, image.width)
			const sourceOffset = (y * image.width + x) * 3
			const targetOffset = (sampleY * width + sampleX) * 3
			labFromChannels(image.data[sourceOffset], image.data[sourceOffset + 1], image.data[sourceOffset + 2], lab, 0)
			labs[targetOffset] = lab[0]
			labs[targetOffset + 1] = lab[1]
			labs[targetOffset + 2] = lab[2]
		}
	}
	return { width, height, labs }
}

function relationProgression(
	cellSupport: Float64Array,
	cellProjection: Float64Array,
	cellSamples: Uint16Array,
	coarseWidth: number,
	coarseHeight: number,
): number {
	let totalWeight = 0
	let meanX = 0
	let meanY = 0
	let meanT = 0
	let activeCells = 0
	for (let cell = 0; cell < cellSupport.length; cell++) {
		const weight = cellSupport[cell]
		if (weight <= epsilon) continue
		if (weight / Math.max(1, cellSamples[cell]) >= relationActiveCellSupport) activeCells++
		const x = (cell % coarseWidth + 0.5) / coarseWidth
		const y = (Math.floor(cell / coarseWidth) + 0.5) / coarseHeight
		const t = cellProjection[cell] / weight
		totalWeight += weight
		meanX += weight * x
		meanY += weight * y
		meanT += weight * t
	}
	if (totalWeight <= epsilon || activeCells < 2) return 0
	meanX /= totalWeight
	meanY /= totalWeight
	meanT /= totalWeight
	let varianceX = 0
	let varianceY = 0
	let varianceT = 0
	let covarianceXY = 0
	let covarianceXT = 0
	let covarianceYT = 0
	for (let cell = 0; cell < cellSupport.length; cell++) {
		const weight = cellSupport[cell]
		if (weight <= epsilon) continue
		const x = (cell % coarseWidth + 0.5) / coarseWidth - meanX
		const y = (Math.floor(cell / coarseWidth) + 0.5) / coarseHeight - meanY
		const t = cellProjection[cell] / weight - meanT
		varianceX += weight * x * x
		varianceY += weight * y * y
		varianceT += weight * t * t
		covarianceXY += weight * x * y
		covarianceXT += weight * x * t
		covarianceYT += weight * y * t
	}
	const determinant = varianceX * varianceY - covarianceXY ** 2
	if (varianceT <= epsilon) return 0
	let explained = 0
	if (determinant > epsilon) {
		const betaX = (covarianceXT * varianceY - covarianceYT * covarianceXY) / determinant
		const betaY = (covarianceYT * varianceX - covarianceXT * covarianceXY) / determinant
		explained = clamp01((betaX * covarianceXT + betaY * covarianceYT) / varianceT)
	} else {
		if (varianceX > epsilon) explained = Math.max(explained, covarianceXT ** 2 / (varianceX * varianceT))
		if (varianceY > epsilon) explained = Math.max(explained, covarianceYT ** 2 / (varianceY * varianceT))
		explained = clamp01(explained)
	}
	return clamp01(Math.sqrt(explained * activeCells / cellSupport.length))
}

function buildRelations(
	candidates: ResolutionEvidenceCandidateFrame,
	field: ResolutionEvidenceFieldFrame,
	sample: Sample,
): ResolutionEvidenceRelationFrame {
	const eligibleCount = field.eligibleNodeIds.length
	const count = eligibleCount * Math.max(0, eligibleCount - 1)
	const fromNodeIds = new Uint8Array(count)
	const toNodeIds = new Uint8Array(count)
	const endpointDistance = new Float64Array(count)
	const fromPresence = new Float64Array(count)
	const toPresence = new Float64Array(count)
	const balance = new Float64Array(count)
	const mass = new Float64Array(count)
	const coverage = new Float64Array(count)
	const middleContinuity = new Float64Array(count)
	const coarseSpatialProgression = new Float64Array(count)
	const coarseWidth = Math.min(relationCoarseSide, sample.width)
	const coarseHeight = Math.min(relationCoarseSide, sample.height)
	const cellCount = coarseWidth * coarseHeight
	let relation = 0

	for (const from of field.eligibleNodeIds) {
		for (const to of field.eligibleNodeIds) {
			if (from === to) continue
			fromNodeIds[relation] = from
			toNodeIds[relation] = to
			const fromOffset = from * 3
			const toOffset = to * 3
			const deltaL = candidates.analysisRepresentativeLab[toOffset] - candidates.analysisRepresentativeLab[fromOffset]
			const deltaA = candidates.analysisRepresentativeLab[toOffset + 1] - candidates.analysisRepresentativeLab[fromOffset + 1]
			const deltaB = candidates.analysisRepresentativeLab[toOffset + 2] - candidates.analysisRepresentativeLab[fromOffset + 2]
			const distanceSquared = deltaL ** 2 + deltaA ** 2 + deltaB ** 2
			const distance = Math.sqrt(distanceSquared)
			endpointDistance[relation] = Number.isFinite(distance) ? distance : 0
			if (distanceSquared <= epsilon) {
				relation++
				continue
			}
			const residualScale = Math.max(
				relationResidualFloor,
				distance * Math.sqrt(relationResidualDistanceVariance),
			)
			const histogram = new Float64Array(relationHistogramBins)
			const cellSupport = new Float64Array(cellCount)
			const cellProjection = new Float64Array(cellCount)
			const cellSamples = new Uint16Array(cellCount)
			let supportTotal = 0
			let fromTotal = 0
			let toTotal = 0
			for (let y = 0; y < sample.height; y++) {
				const coarseY = Math.min(coarseHeight - 1, Math.floor(y * coarseHeight / sample.height))
				for (let x = 0; x < sample.width; x++) {
					const pixel = y * sample.width + x
					const offset = pixel * 3
					const rawProjection = (
						(sample.labs[offset] - candidates.analysisRepresentativeLab[fromOffset]) * deltaL +
						(sample.labs[offset + 1] - candidates.analysisRepresentativeLab[fromOffset + 1]) * deltaA +
						(sample.labs[offset + 2] - candidates.analysisRepresentativeLab[fromOffset + 2]) * deltaB
					) / distanceSquared
					const projection = clamp01(rawProjection)
					const projectedL = candidates.analysisRepresentativeLab[fromOffset] + deltaL * projection
					const projectedA = candidates.analysisRepresentativeLab[fromOffset + 1] + deltaA * projection
					const projectedB = candidates.analysisRepresentativeLab[fromOffset + 2] + deltaB * projection
					const residual = Math.hypot(
						sample.labs[offset] - projectedL,
						sample.labs[offset + 1] - projectedA,
						sample.labs[offset + 2] - projectedB,
					)
					const support = Math.exp(-((residual / residualScale) ** 2))
					const fromSeed = support * clamp01(1 - projection / relationEndpointWidth)
					const toSeed = support * clamp01(1 - (1 - projection) / relationEndpointWidth)
					supportTotal += support
					fromTotal += fromSeed
					toTotal += toSeed
					histogram[Math.min(relationHistogramBins - 1, Math.floor(projection * relationHistogramBins))] += support
					const coarseX = Math.min(coarseWidth - 1, Math.floor(x * coarseWidth / sample.width))
					const cell = coarseY * coarseWidth + coarseX
					cellSupport[cell] += support
					cellProjection[cell] += support * projection
					cellSamples[cell]++
				}
			}
			const sampleCount = sample.width * sample.height
			coverage[relation] = clamp01(supportTotal / sampleCount)
			fromPresence[relation] = clamp01(fromTotal / sampleCount / (relationEndpointWidth / 2))
			toPresence[relation] = clamp01(toTotal / sampleCount / (relationEndpointWidth / 2))
			const presenceTotal = fromPresence[relation] + toPresence[relation]
			balance[relation] = presenceTotal <= epsilon
				? 0
				: clamp01(1 - Math.abs(fromPresence[relation] - toPresence[relation]) / presenceTotal)
			mass[relation] = clamp01(
				coverage[relation] * Math.sqrt(fromPresence[relation] * toPresence[relation]) * balance[relation],
			)
			let occupiedMiddleBins = 0
			for (let bin = relationMiddleTrimBins; bin < relationHistogramBins - relationMiddleTrimBins; bin++) {
				if (histogram[bin] > Math.max(epsilon, supportTotal * relationMiddleOccupancyShare)) occupiedMiddleBins++
			}
			middleContinuity[relation] = occupiedMiddleBins /
				(relationHistogramBins - relationMiddleTrimBins * 2)
			coarseSpatialProgression[relation] = relationProgression(
				cellSupport,
				cellProjection,
				cellSamples,
				coarseWidth,
				coarseHeight,
			)
			relation++
		}
	}
	return {
		count,
		fromNodeIds,
		toNodeIds,
		endpointDistance,
		fromPresence,
		toPresence,
		balance,
		mass,
		coverage,
		middleContinuity,
		coarseSpatialProgression,
	}
}

function closeEnough(first: number, second: number): boolean {
	return Number.isFinite(first) && Number.isFinite(second) && Math.abs(first - second) <= 1e-12
}

function assertLabelPartition(labels: Uint8Array, counts: Uint32Array, count: number, name: string): void {
	const observed = new Uint32Array(count)
	for (const label of labels) {
		if (label >= count) throw new Error(`${name} label escapes its domain`)
		observed[label]++
	}
	for (let id = 0; id < count; id++) {
		if (observed[id] !== counts[id]) throw new Error(`${name} label population is inconsistent`)
	}
}

function verifyResolutionEvidenceInvariants(
	analysis: RawImage,
	native: RawImage,
	candidateLabels: Uint8Array,
	familyLabels: Uint8Array,
	candidates: ResolutionEvidenceCandidateFrame,
	families: ResolutionEvidenceFamilyFrame,
	field: ResolutionEvidenceFieldFrame,
	relations: ResolutionEvidenceRelationFrame,
	nativeRgbOccupancy: Uint32Array,
): ResolutionEvidenceInvariants {
	assertLabelPartition(candidateLabels, candidates.pixelCounts, candidates.count, "Candidate")
	assertLabelPartition(familyLabels, families.pixelCounts, families.count, "Family")
	const lab = new Float64Array(3)
	for (let candidate = 0; candidate < candidates.count; candidate++) {
		const offset = candidate * 3
		const analysisIndex = candidates.analysisRepresentativeIndices[candidate]
		if (analysisIndex < 0 || analysisIndex >= candidateLabels.length || candidateLabels[analysisIndex] !== candidate) {
			throw new Error(`Candidate ${candidate} analysis representative is outside its partition`)
		}
		const analysisOffset = analysisIndex * 3
		if (candidates.analysisRepresentativeRgb[offset] !== analysis.data[analysisOffset] ||
			candidates.analysisRepresentativeRgb[offset + 1] !== analysis.data[analysisOffset + 1] ||
			candidates.analysisRepresentativeRgb[offset + 2] !== analysis.data[analysisOffset + 2]) {
			throw new Error(`Candidate ${candidate} analysis representative RGB is not source exact`)
		}
		const analysisLab = rgbToOKLab([
			analysis.data[analysisOffset],
			analysis.data[analysisOffset + 1],
			analysis.data[analysisOffset + 2],
		])
		for (let channel = 0; channel < 3; channel++) {
			if (!closeEnough(candidates.analysisRepresentativeLab[offset + channel], analysisLab[channel])) {
				throw new Error(`Candidate ${candidate} analysis representative Lab is inconsistent`)
			}
		}
		const analysisDistance = Math.hypot(
			analysisLab[0] - candidates.meanLab[offset],
			analysisLab[1] - candidates.meanLab[offset + 1],
			analysisLab[2] - candidates.meanLab[offset + 2],
		)
		if (!closeEnough(analysisDistance, candidates.analysisRepresentativeDistance[candidate])) {
			throw new Error(`Candidate ${candidate} analysis representative distance is inconsistent`)
		}
		const nativeExact = nativeRgbOccupancyHas(
			nativeRgbOccupancy,
			candidates.analysisRepresentativeRgb[offset],
			candidates.analysisRepresentativeRgb[offset + 1],
			candidates.analysisRepresentativeRgb[offset + 2],
		)
		if (candidates.analysisRepresentativeNativeExact[candidate] !== (nativeExact ? 1 : 0)) {
			throw new Error(`Candidate ${candidate} exact native RGB membership is inconsistent`)
		}

		const footprint = nativeFootprintForAnalysisPixel(analysisIndex, analysis, native)
		if (candidates.nativeWitnessFootprintStartX[candidate] !== footprint.startX ||
			candidates.nativeWitnessFootprintEndX[candidate] !== footprint.endX ||
			candidates.nativeWitnessFootprintStartY[candidate] !== footprint.startY ||
			candidates.nativeWitnessFootprintEndY[candidate] !== footprint.endY) {
			throw new Error(`Candidate ${candidate} native witness footprint is inconsistent`)
		}
		let expectedIndex = -1
		let expectedDistance = Infinity
		for (let y = footprint.startY; y < footprint.endY; y++) {
			for (let x = footprint.startX; x < footprint.endX; x++) {
				const nativeIndex = y * native.width + x
				const nativeOffset = nativeIndex * 3
				labFromChannels(native.data[nativeOffset], native.data[nativeOffset + 1], native.data[nativeOffset + 2], lab, 0)
				const distance = Math.hypot(
					lab[0] - candidates.meanLab[offset],
					lab[1] - candidates.meanLab[offset + 1],
					lab[2] - candidates.meanLab[offset + 2],
				)
				if (distance < expectedDistance) {
					expectedDistance = distance
					expectedIndex = nativeIndex
				}
			}
		}
		const witnessIndex = candidates.nativeWitnessIndices[candidate]
		if (witnessIndex < 0 || witnessIndex >= native.width * native.height) {
			throw new Error(`Candidate ${candidate} has no native witness`)
		}
		if (witnessIndex !== expectedIndex || !closeEnough(candidates.nativeWitnessDistance[candidate], expectedDistance)) {
			throw new Error(`Candidate ${candidate} native witness does not minimize footprint distance`)
		}
		const nativeOffset = witnessIndex * 3
		if (candidates.nativeWitnessRgb[offset] !== native.data[nativeOffset] ||
			candidates.nativeWitnessRgb[offset + 1] !== native.data[nativeOffset + 1] ||
			candidates.nativeWitnessRgb[offset + 2] !== native.data[nativeOffset + 2]) {
			throw new Error(`Candidate ${candidate} native witness RGB is not source exact`)
		}
		labFromChannels(native.data[nativeOffset], native.data[nativeOffset + 1], native.data[nativeOffset + 2], lab, 0)
		for (let channel = 0; channel < 3; channel++) {
			if (!closeEnough(candidates.nativeWitnessLab[offset + channel], lab[channel])) {
				throw new Error(`Candidate ${candidate} native witness Lab is inconsistent`)
			}
		}
		const expectedDuplicateIds: number[] = []
		for (let other = 0; other < candidates.count; other++) {
			const otherOffset = other * 3
			if (other !== candidate && candidates.nativeWitnessRgb[offset] === candidates.nativeWitnessRgb[otherOffset] &&
				candidates.nativeWitnessRgb[offset + 1] === candidates.nativeWitnessRgb[otherOffset + 1] &&
				candidates.nativeWitnessRgb[offset + 2] === candidates.nativeWitnessRgb[otherOffset + 2]) {
				expectedDuplicateIds.push(other)
			}
		}
		const duplicateStart = candidates.nativeWitnessDuplicateOffsets[candidate]
		const duplicateEnd = candidates.nativeWitnessDuplicateOffsets[candidate + 1]
		if (duplicateEnd - duplicateStart !== candidates.nativeWitnessDuplicateCounts[candidate] ||
			expectedDuplicateIds.length !== duplicateEnd - duplicateStart) {
			throw new Error(`Candidate ${candidate} duplicate witness count is inconsistent`)
		}
		for (let duplicate = 0; duplicate < expectedDuplicateIds.length; duplicate++) {
			if (candidates.nativeWitnessDuplicateIds[duplicateStart + duplicate] !== expectedDuplicateIds[duplicate]) {
				throw new Error(`Candidate ${candidate} duplicate witness IDs are incomplete`)
			}
		}
	}

	const expectedFamilyIds = new Uint8Array(candidates.count).fill(unassignedLabel)
	const expectedAnchors = new Uint8Array(candidates.count)
	const familyOrder = Array.from({ length: candidates.count }, (_, candidate) => candidate)
	familyOrder.sort((first, second) => candidates.pixelCounts[second] - candidates.pixelCounts[first] || first - second)
	let expectedFamilyCount = 0
	for (const candidate of familyOrder) {
		let closestFamily = -1
		let closestDistance = Infinity
		for (let family = 0; family < expectedFamilyCount; family++) {
			const distance = candidateLabDistance(candidates, candidate, expectedAnchors[family])
			if (distance <= RESOLUTION_EVIDENCE_FAMILY_RADIUS && distance < closestDistance) {
				closestDistance = distance
				closestFamily = family
			}
		}
		if (closestFamily < 0) {
			closestFamily = expectedFamilyCount
			expectedAnchors[expectedFamilyCount++] = candidate
		}
		expectedFamilyIds[candidate] = closestFamily
	}
	if (expectedFamilyCount !== families.count) throw new Error("Family count is inconsistent with analysis geometry")
	for (let candidate = 0; candidate < candidates.count; candidate++) {
		if (candidates.familyIds[candidate] !== expectedFamilyIds[candidate]) {
			throw new Error("Family membership is inconsistent with analysis geometry")
		}
	}
	for (let family = 0; family < families.count; family++) {
		if (families.anchorCandidateIds[family] !== expectedAnchors[family]) {
			throw new Error("Family anchor is inconsistent with analysis geometry")
		}
	}

	const expectedEligible: number[] = []
	for (let candidate = 0; candidate < candidates.count; candidate++) {
		let dominated = false
		for (let other = 0; other < candidates.count && !dominated; other++) {
			if (other === candidate) continue
			const noWorse = field.broad[other] >= field.broad[candidate] && field.detail[other] <= field.detail[candidate] &&
				field.frame[other] <= field.frame[candidate]
			const strict = field.broad[other] > field.broad[candidate] || field.detail[other] < field.detail[candidate] ||
				field.frame[other] < field.frame[candidate]
			dominated = noWorse && strict
		}
		if (field.paretoEligible[candidate] !== (dominated ? 0 : 1)) {
			throw new Error("Pareto eligibility flag is inconsistent")
		}
		if (!dominated) expectedEligible.push(candidate)
	}
	if (expectedEligible.length !== field.eligibleNodeIds.length) throw new Error("Eligible node count is not Pareto exact")
	for (let index = 0; index < expectedEligible.length; index++) {
		if (field.eligibleNodeIds[index] !== expectedEligible[index]) throw new Error("Eligible node IDs are not Pareto exact")
	}
	if (relations.count !== expectedEligible.length * Math.max(0, expectedEligible.length - 1)) {
		throw new Error("Eligible relation domain is incomplete")
	}
	for (let relation = 0; relation < relations.count; relation++) {
		const fromOffset = relations.fromNodeIds[relation] * 3
		const toOffset = relations.toNodeIds[relation] * 3
		const distance = Math.hypot(
			candidates.analysisRepresentativeLab[fromOffset] - candidates.analysisRepresentativeLab[toOffset],
			candidates.analysisRepresentativeLab[fromOffset + 1] - candidates.analysisRepresentativeLab[toOffset + 1],
			candidates.analysisRepresentativeLab[fromOffset + 2] - candidates.analysisRepresentativeLab[toOffset + 2],
		)
		if (!closeEnough(distance, relations.endpointDistance[relation])) {
			throw new Error("Relation endpoint distance is inconsistent with analysis geometry")
		}
	}
	if (createHash("sha256").update(JSON.stringify(RESOLUTION_EVIDENCE_POLICY), "utf8").digest("hex") !==
		RESOLUTION_EVIDENCE_POLICY_SHA256) throw new Error("Resolution evidence policy hash is inconsistent")
	return deepFreeze({
		analysisRepresentativesMatchInput: true,
		analysisRepresentativeNativeMembershipVerified: true,
		nativeWitnessesExist: true,
		nativeWitnessesMatchInput: true,
		nativeWitnessesMinimizeDistanceInFootprint: true,
		duplicateWitnessIdsComplete: true,
		labelPartitionsComplete: true,
		eligibleNodeIdsExactlyPareto: true,
		familyGeometryUsesAnalysisRepresentatives: true,
		relationGeometryUsesAnalysisRepresentatives: true,
		policyHashVerified: true,
	})
}

/**
 * Analyze a common-domain image while sourcing every palette representative from
 * an independently decoded native raster. The returned frame does not retain either input buffer.
 */
export function analyzeResolutionEvidence(
	analysis: RawImage,
	decodedNative: RawImage,
	identity: ResolutionEvidenceInputIdentity = {},
): ResolutionEvidenceFrame {
	validateImage(analysis, "Analysis image")
	validateImage(decodedNative, "Decoded-native image")
	const provenance = deepFreeze({
		analysisRasterIdentity: optionalIdentity(identity.analysisRasterIdentity, "analysisRasterIdentity"),
		decodedNativeRasterIdentity: optionalIdentity(identity.decodedNativeRasterIdentity, "decodedNativeRasterIdentity"),
		rasterPolicyIdentity: optionalIdentity(identity.rasterPolicyIdentity, "rasterPolicyIdentity"),
	})
	const bins = buildBinFrame(analysis)
	const clusters = clusterBins(bins)
	const pixelDetails = buildPixelDetailPlane(analysis, bins)
	const nativeRgbOccupancy = buildNativeRgbOccupancy(decodedNative)
	const candidates = buildCandidateFrame(
		analysis,
		decodedNative,
		bins,
		clusters,
		pixelDetails,
		nativeRgbOccupancy,
	)
	const familyConstruction = buildFamilyFrame(
		clusters.labels,
		candidates,
		analysis.width,
		analysis.height,
		pixelDetails,
	)
	const field = buildFieldFrame(candidates, familyConstruction.frame)
	const sample = buildSample(analysis)
	const relations = buildRelations(candidates, field, sample)
	const planeHashes = deepFreeze({
		version: RESOLUTION_EVIDENCE_TYPED_ARRAY_HASH_VERSION,
		pixelBinIds: canonicalResolutionEvidenceTypedArrayHash(bins.pixelBinIds),
		candidateLabels: canonicalResolutionEvidenceTypedArrayHash(clusters.labels),
		familyLabels: canonicalResolutionEvidenceTypedArrayHash(familyConstruction.labels),
	})
	const invariants = verifyResolutionEvidenceInvariants(
		analysis,
		decodedNative,
		clusters.labels,
		familyConstruction.labels,
		candidates,
		familyConstruction.frame,
		field,
		relations,
		nativeRgbOccupancy,
	)
	const fieldEdges = field.eligibleNodeIds.length * Math.max(0, field.eligibleNodeIds.length - 1)
	const graph: ResolutionEvidenceGraphCounts = {
		nodes: candidates.count,
		edges: candidates.count * Math.max(0, candidates.count - 1),
		eligibleNodes: field.eligibleNodeIds.length,
		eligibleOrderedEdges: fieldEdges,
		fieldTreatments: field.eligibleNodeIds.length + 2 * fieldEdges,
		collapsedFieldTreatments: field.eligibleNodeIds.length,
		distinctFlatFieldTreatments: fieldEdges,
		gradientFieldTreatments: fieldEdges,
	}
	return {
		version: RESOLUTION_EVIDENCE_VERSION,
		policy: RESOLUTION_EVIDENCE_POLICY,
		policySha256: RESOLUTION_EVIDENCE_POLICY_SHA256,
		provenance,
		planeHashes,
		invariants,
		width: analysis.width,
		height: analysis.height,
		nativeWidth: decodedNative.width,
		nativeHeight: decodedNative.height,
		occupiedBinCount: bins.occupiedKeys.length,
		pixelBinIds: bins.pixelBinIds,
		candidateLabels: clusters.labels,
		familyLabels: familyConstruction.labels,
		bins: bins.frame,
		candidates,
		families: familyConstruction.frame,
		field,
		relations,
		graph,
		commonDomainSample: {
			width: sample.width,
			height: sample.height,
			count: sample.width * sample.height,
		},
	}
}

export function candidateRGBAt(
	frame: ResolutionEvidenceFrame,
	candidateId: number,
	mode: ResolutionEvidencePaletteMode,
): RGB | undefined {
	if (!Number.isInteger(candidateId) || candidateId < 0 || candidateId >= frame.candidates.count) return undefined
	const offset = candidateId * 3
	if (mode === "analysis") return [
		frame.candidates.analysisRepresentativeRgb[offset],
		frame.candidates.analysisRepresentativeRgb[offset + 1],
		frame.candidates.analysisRepresentativeRgb[offset + 2],
	]
	if (mode === "native-witness") return [
		frame.candidates.nativeWitnessRgb[offset],
		frame.candidates.nativeWitnessRgb[offset + 1],
		frame.candidates.nativeWitnessRgb[offset + 2],
	]
	throw new RangeError(`Unsupported candidate palette mode: ${String(mode)}`)
}

export function candidateAnalysisRGBAt(frame: ResolutionEvidenceFrame, candidateId: number): RGB | undefined {
	return candidateRGBAt(frame, candidateId, "analysis")
}

export function resolutionEvidenceCandidatePalette(
	frame: ResolutionEvidenceFrame,
	mode: ResolutionEvidencePaletteMode,
): RGB[] {
	const palette: RGB[] = []
	for (let candidate = 0; candidate < frame.candidates.count; candidate++) {
		const rgb = candidateRGBAt(frame, candidate, mode)
		if (rgb) palette.push(rgb)
	}
	return palette
}

/** Materialize the candidate reconstruction only when a caller explicitly needs it. */
export function reconstructResolutionEvidenceCandidates(
	frame: ResolutionEvidenceFrame,
	mode: ResolutionEvidencePaletteMode,
): RawImage {
	const data = new Uint8Array(frame.candidateLabels.length * 3)
	const palette = mode === "analysis"
		? frame.candidates.analysisRepresentativeRgb
		: mode === "native-witness"
			? frame.candidates.nativeWitnessRgb
			: undefined
	if (!palette) throw new RangeError(`Unsupported candidate palette mode: ${String(mode)}`)
	for (let pixel = 0; pixel < frame.candidateLabels.length; pixel++) {
		const candidateOffset = frame.candidateLabels[pixel] * 3
		const offset = pixel * 3
		data[offset] = palette[candidateOffset]
		data[offset + 1] = palette[candidateOffset + 1]
		data[offset + 2] = palette[candidateOffset + 2]
	}
	return { width: frame.width, height: frame.height, data }
}

function componentSignatureHex(spatial: ResolutionEvidenceSpatialFrame, id: number): string {
	let hex = ""
	const start = id * componentSignatureBytes
	for (let index = start; index < start + componentSignatureBytes; index++) {
		hex += spatial.componentSignatureSha256[index].toString(16).padStart(2, "0")
	}
	return hex
}

function spatialSummary(spatial: ResolutionEvidenceSpatialFrame, id: number) {
	return {
		pixelCount: spatial.pixelCounts[id],
		population: spatial.population[id],
		edgeDetail: spatial.edgeDetail[id],
		borderFrame: spatial.borderFrame[id],
		interiorOwnership: spatial.interiorOwnership[id],
		componentCount: spatial.componentCounts[id],
		componentAreaHistogram: Array.from(spatial.componentAreaHistogram.subarray(
			id * RESOLUTION_EVIDENCE_COMPONENT_AREA_BINS,
			(id + 1) * RESOLUTION_EVIDENCE_COMPONENT_AREA_BINS,
		)),
		borderTouchingComponentCount: spatial.borderTouchingComponentCounts[id],
		thinComponentCount: spatial.thinComponentCounts[id],
		componentSignatureSha256: componentSignatureHex(spatial, id),
		largestComponentPopulation: spatial.largestComponentPopulation[id],
		sideCoverage: Array.from(spatial.sideCoverage.subarray(id * 4, id * 4 + 4)),
		thinComponentSupport: spatial.thinComponentSupport[id],
		typographySupport: spatial.typographySupport[id],
		fieldBroad: spatial.fieldBroad[id],
		fieldDetail: spatial.fieldDetail[id],
		fieldFrame: spatial.fieldFrame[id],
	}
}

export function resolutionEvidenceRetainedArrayBytes(frame: ResolutionEvidenceFrame): number {
	const arrays: ArrayBufferView[] = [
		frame.pixelBinIds,
		frame.candidateLabels,
		frame.familyLabels,
	]
	for (const section of [frame.bins, frame.candidates, frame.families, frame.field, frame.relations]) {
		for (const value of Object.values(section)) {
			if (ArrayBuffer.isView(value)) arrays.push(value)
		}
	}
	return arrays.reduce((total, array) => total + array.byteLength, 0)
}

/** Return plain JSON-compatible values without serializing fixed bin arrays or pixel planes. */
export function summarizeResolutionEvidence(frame: ResolutionEvidenceFrame) {
	return {
		version: frame.version,
		policy: frame.policy,
		policySha256: frame.policySha256,
		provenance: frame.provenance,
		planeHashes: frame.planeHashes,
		invariants: frame.invariants,
		dimensions: {
			width: frame.width,
			height: frame.height,
			nativeWidth: frame.nativeWidth,
			nativeHeight: frame.nativeHeight,
		},
		occupiedBinCount: frame.occupiedBinCount,
		retainedArrayBytes: resolutionEvidenceRetainedArrayBytes(frame),
		commonDomainSample: frame.commonDomainSample,
		graph: frame.graph,
		candidates: Array.from({ length: frame.candidates.count }, (_, id) => ({
			id,
			analysisRgb: candidateAnalysisRGBAt(frame, id),
			analysisLab: Array.from(frame.candidates.analysisRepresentativeLab.subarray(id * 3, id * 3 + 3)),
			analysisRepresentativeIndex: frame.candidates.analysisRepresentativeIndices[id],
			analysisRepresentativeDistance: frame.candidates.analysisRepresentativeDistance[id],
			nativeWitnessRgb: candidateRGBAt(frame, id, "native-witness"),
			nativeWitnessLab: Array.from(frame.candidates.nativeWitnessLab.subarray(id * 3, id * 3 + 3)),
			nativeWitnessIndex: frame.candidates.nativeWitnessIndices[id],
			nativeWitnessDistance: frame.candidates.nativeWitnessDistance[id],
			nativeWitnessFootprint: {
				startX: frame.candidates.nativeWitnessFootprintStartX[id],
				endX: frame.candidates.nativeWitnessFootprintEndX[id],
				startY: frame.candidates.nativeWitnessFootprintStartY[id],
				endY: frame.candidates.nativeWitnessFootprintEndY[id],
			},
			nativeWitnessDuplicateCount: frame.candidates.nativeWitnessDuplicateCounts[id],
			nativeWitnessDuplicateIds: Array.from(frame.candidates.nativeWitnessDuplicateIds.subarray(
				frame.candidates.nativeWitnessDuplicateOffsets[id],
				frame.candidates.nativeWitnessDuplicateOffsets[id + 1],
			)),
			analysisRepresentativeNativeExact: frame.candidates.analysisRepresentativeNativeExact[id] === 1,
			familyId: frame.candidates.familyIds[id],
			meanLab: Array.from(frame.candidates.meanLab.subarray(id * 3, id * 3 + 3)),
			fieldEligibility: {
				broad: frame.field.broad[id],
				detail: frame.field.detail[id],
				frame: frame.field.frame[id],
				paretoEligible: frame.field.paretoEligible[id] === 1,
			},
			...spatialSummary(frame.candidates, id),
		})),
		families: Array.from({ length: frame.families.count }, (_, id) => ({
			id,
			anchorCandidateId: frame.families.anchorCandidateIds[id],
			memberCount: frame.families.memberCounts[id],
			...spatialSummary(frame.families, id),
		})),
		eligibleNodeIds: Array.from(frame.field.eligibleNodeIds),
		relations: Array.from({ length: frame.relations.count }, (_, id) => ({
			fromNodeId: frame.relations.fromNodeIds[id],
			toNodeId: frame.relations.toNodeIds[id],
			endpointDistance: frame.relations.endpointDistance[id],
			fromPresence: frame.relations.fromPresence[id],
			toPresence: frame.relations.toPresence[id],
			balance: frame.relations.balance[id],
			mass: frame.relations.mass[id],
			coverage: frame.relations.coverage[id],
			middleContinuity: frame.relations.middleContinuity[id],
			coarseSpatialProgression: frame.relations.coarseSpatialProgression[id],
		})),
	}
}
