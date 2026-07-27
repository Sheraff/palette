import { createHash } from "node:crypto"
import { buildCandidateContext, spatialEvidence, type Candidate, type CandidateContext } from "./candidates.ts"
import { rgbAt, rgbToOKLab } from "./color.ts"
import { extractPaletteWithContext } from "./extract.ts"
import { loadImage } from "./image.ts"
import { solveGuardedPalette } from "./guarded-palette.ts"
import { solveJointPalette } from "./joint-palette.ts"
import { loadNativeImage, NATIVE_IMAGE_MAXIMUM_PIXELS } from "./native-resolution-image.ts"
import { analyzeRegions, type RegionAnalysis } from "./regions.ts"
import type { ExtractionResult, RawImage } from "./types.ts"

export const SCALE_AWARE_NATIVE_ALGORITHM_VERSION =
	"region-graph-0.19.0-scale-aware-native-0.2.1-development" as const
export const SCALE_AWARE_NATIVE_POLICY_VERSION = "scale-aware-native-dual-domain-policy-v1" as const
export const SCALE_AWARE_NATIVE_OBSERVATION_MAX_EDGE = 224

export const SCALE_AWARE_NATIVE_POLICY = Object.freeze({
	version: SCALE_AWARE_NATIVE_POLICY_VERSION,
	nativeDecode: "sharp-0.33.5-rotate-flatten-white-srgb-remove-alpha-raw-uchar",
	nativeMaximumPixels: NATIVE_IMAGE_MAXIMUM_PIXELS,
	nativeCandidatePolicy: "role-aware-12-stable-family-anchors-plus-majority-typography-overlay",
	observationPolicy: "canonical-sharp-0.33.5-max-edge-224-lanczos3-evidence-only",
	projectionPolicy: "exact-rational-cell-area-principal-argmax-lower-candidate-id-tie",
	typographyProjectionThreshold: "covered-area-at-least-one-half",
	inferencePolicy: "fresh-guarded-then-joint-with-unchanged-region-graph-role-rules",
	canonicalRolePolicy: "comparison-only-never-treatment-incumbent",
})

export const SCALE_AWARE_NATIVE_POLICY_SHA256 = createHash("sha256")
	.update(SCALE_AWARE_NATIVE_POLICY_VERSION, "utf8")
	.update("\0")
	.update(JSON.stringify(SCALE_AWARE_NATIVE_POLICY), "utf8")
	.digest("hex")

type ExactAxisSegment = {
	start: number
	endExclusive: number
	overlapNumerator: bigint
}

type SummedAreaTable = {
	stride: number
	data: Uint32Array
}

type CellAxisSegments = readonly (readonly ExactAxisSegment[])[]

export type ScaleAwareNativeProjection = {
	candidates: Candidate[]
	labels: Int32Array
	width: number
	height: number
	principalCandidateIds: number[]
	excludedTypographyCandidateIds: number[]
	nativePartitionSha256: string
	projectedPartitionSha256: string
}

export type ScaleAwareNativeExtractionContext = {
	extraction: ExtractionResult
	canonicalControl: ExtractionResult
	projection: Omit<ScaleAwareNativeProjection, "candidates" | "labels">
	policy: typeof SCALE_AWARE_NATIVE_POLICY
	policySha256: typeof SCALE_AWARE_NATIVE_POLICY_SHA256
	nativeImageSha256: string
	observationImageSha256: string
}

function rasterSha256(image: RawImage): string {
	return createHash("sha256").update(`${image.width}x${image.height}:`, "utf8").update(image.data).digest("hex")
}

function typedArraySha256(value: Int32Array | Uint8Array): string {
	return createHash("sha256").update(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)).digest("hex")
}

function exactAxisSegments(
	lowerNumerator: bigint,
	upperNumerator: bigint,
	q: bigint,
	extent: number,
): readonly ExactAxisSegment[] {
	if (q <= 0n || lowerNumerator < 0n || upperNumerator <= lowerNumerator || upperNumerator > BigInt(extent) * q) {
		throw new RangeError("Projection axis interval is invalid")
	}
	const segments: ExactAxisSegment[] = []
	const lowerPixel = lowerNumerator / q
	const lowerRemainder = lowerNumerator % q
	if (lowerRemainder !== 0n) {
		const pixelEnd = (lowerPixel + 1n) * q
		const segmentEnd = upperNumerator < pixelEnd ? upperNumerator : pixelEnd
		segments.push({ start: Number(lowerPixel), endExclusive: Number(lowerPixel + 1n), overlapNumerator: segmentEnd - lowerNumerator })
		if (upperNumerator <= pixelEnd) return segments
	}
	const fullStart = lowerRemainder === 0n ? lowerPixel : lowerPixel + 1n
	const upperPixel = upperNumerator / q
	const upperRemainder = upperNumerator % q
	if (upperPixel > fullStart) segments.push({ start: Number(fullStart), endExclusive: Number(upperPixel), overlapNumerator: q })
	if (upperRemainder !== 0n) {
		segments.push({ start: Number(upperPixel), endExclusive: Number(upperPixel + 1n), overlapNumerator: upperRemainder })
	}
	if (segments.length === 0 || segments.length > 3) throw new Error("Projection axis segmentation failed")
	return segments
}

function buildBinaryMaskSummedAreaTable(mask: Uint8Array, width: number, height: number): SummedAreaTable {
	if (mask.length !== width * height) throw new Error("Projection mask dimensions are invalid")
	const stride = width + 1
	const data = new Uint32Array(stride * (height + 1))
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const value = mask[y * width + x]
			if (value !== 0 && value !== 1) throw new Error("Projection masks must be binary")
			const target = (y + 1) * stride + x + 1
			data[target] = value + data[target - 1] + data[target - stride] - data[target - stride - 1]
		}
	}
	return { stride, data }
}

function axisCellSegments(sourceExtent: number, targetExtent: number): CellAxisSegments {
	const source = BigInt(sourceExtent)
	const q = BigInt(targetExtent)
	return Array.from({ length: targetExtent }, (_, index) => exactAxisSegments(
		BigInt(index) * source,
		BigInt(index + 1) * source,
		q,
		sourceExtent,
	))
}

function weightedCellCount(
	sat: SummedAreaTable,
	xSegments: readonly ExactAxisSegment[],
	ySegments: readonly ExactAxisSegment[],
): number {
	let weighted = 0
	for (const y of ySegments) {
		for (const x of xSegments) {
			const topLeft = y.start * sat.stride + x.start
			const topRight = y.start * sat.stride + x.endExclusive
			const bottomLeft = y.endExclusive * sat.stride + x.start
			const bottomRight = y.endExclusive * sat.stride + x.endExclusive
			const count = sat.data[bottomRight] - sat.data[topRight] - sat.data[bottomLeft] + sat.data[topLeft]
			weighted += count * Number(x.overlapNumerator) * Number(y.overlapNumerator)
		}
	}
	if (!Number.isSafeInteger(weighted) || weighted < 0) throw new Error("Projected candidate area is not an exact safe integer")
	return weighted
}

function requireNativePartition(context: CandidateContext, nativePixels: number): {
	primaryRecords: CandidateContext["candidateRecords"]
	partitionSha256: string
} {
	const primaryIds = new Set(context.candidates.filter((candidate) => !candidate.typographyOnly).map((candidate) => candidate.id))
	const primaryRecords = context.candidateRecords.filter((record) => primaryIds.has(record.candidateId))
	const counts = new Uint8Array(nativePixels)
	for (const record of primaryRecords) {
		if (record.mask.length !== nativePixels) throw new Error("Native candidate mask length is invalid")
		for (let pixel = 0; pixel < nativePixels; pixel++) counts[pixel] += record.mask[pixel]
	}
	if (counts.some((count) => count !== 1)) throw new Error("Principal native candidate masks do not form a partition")
	return { primaryRecords, partitionSha256: typedArraySha256(counts) }
}

function weightedObservationFields(
	numerators: Float64Array,
	analysis: RegionAnalysis,
): { population: number; background: number; saliency: number; text: number } {
	let mass = 0
	let background = 0
	let saliency = 0
	let text = 0
	for (let pixel = 0; pixel < numerators.length; pixel++) {
		const weight = numerators[pixel]
		if (weight === 0) continue
		const region = analysis.regions[analysis.labels[pixel]]
		mass += weight
		background += weight * region.background
		saliency += weight * region.saliency
		text += weight * region.text
	}
	if (!(mass > 0) || !Number.isFinite(mass)) throw new Error("Projected candidate has no finite observation mass")
	return {
		population: mass / numerators.length,
		background: background / mass,
		saliency: saliency / mass,
		text: text / mass,
	}
}

export function projectNativeCandidateContext(
	context: CandidateContext,
	native: Pick<RawImage, "width" | "height" | "data">,
	observationAnalysis: RegionAnalysis,
): ScaleAwareNativeProjection {
	const nativePixels = native.width * native.height
	if (!Number.isSafeInteger(nativePixels) || nativePixels <= 0 || native.data.length !== nativePixels * 3) {
		throw new Error("Native candidate source raster is invalid")
	}
	const nativeMaximumEdge = Math.max(native.width, native.height)
	const observationMaximumEdge = Math.max(observationAnalysis.width, observationAnalysis.height)
	const aspectCrossProductError = Math.abs(
		observationAnalysis.width * native.height - observationAnalysis.height * native.width,
	)
	if (observationAnalysis.width > native.width || observationAnalysis.height > native.height ||
		(nativeMaximumEdge <= SCALE_AWARE_NATIVE_OBSERVATION_MAX_EDGE
			? observationAnalysis.width !== native.width || observationAnalysis.height !== native.height
			: observationMaximumEdge !== SCALE_AWARE_NATIVE_OBSERVATION_MAX_EDGE ||
				aspectCrossProductError > nativeMaximumEdge)) {
		throw new Error("Observation dimensions violate the frozen max-edge decode contract")
	}
	const { primaryRecords, partitionSha256 } = requireNativePartition(context, nativePixels)
	const candidateById = new Map(context.candidates.map((candidate) => [candidate.id, candidate]))
	for (const record of context.candidateRecords) {
		const candidate = candidateById.get(record.candidateId)
		if (!candidate || record.representativePixelIndex < 0 || record.representativePixelIndex >= nativePixels ||
			candidate.rgb.some((channel, index) => channel !== rgbAt(native.data, record.representativePixelIndex)[index]) ||
			record.mask[record.representativePixelIndex] !== 1) {
			throw new Error(`Native candidate ${record.candidateId} representative provenance is invalid`)
		}
	}

	const targetPixels = observationAnalysis.width * observationAnalysis.height
	const xCells = axisCellSegments(native.width, observationAnalysis.width)
	const yCells = axisCellSegments(native.height, observationAnalysis.height)
	const denominator = native.width * native.height
	if (!Number.isSafeInteger(denominator) || denominator <= 0) throw new Error("Projection denominator is invalid")
	const labels = new Int32Array(targetPixels).fill(-1)
	const bestNumerators = new Float64Array(targetPixels).fill(-1)
	const numeratorPlanes = new Map<number, Float64Array>()
	const orderedPrimaryRecords = [...primaryRecords].sort((first, second) => first.candidateId - second.candidateId)

	for (const record of orderedPrimaryRecords) {
		const sat = buildBinaryMaskSummedAreaTable(record.mask, native.width, native.height)
		const numerators = new Float64Array(targetPixels)
		let target = 0
		for (let y = 0; y < observationAnalysis.height; y++) {
			for (let x = 0; x < observationAnalysis.width; x++) {
				const numerator = weightedCellCount(sat, xCells[x], yCells[y])
				numerators[target] = numerator / denominator
				if (numerator > bestNumerators[target] ||
					(numerator === bestNumerators[target] && record.candidateId < labels[target])) {
					bestNumerators[target] = numerator
					labels[target] = record.candidateId
				}
				target++
			}
		}
		numeratorPlanes.set(record.candidateId, numerators)
	}

	for (let pixel = 0; pixel < targetPixels; pixel++) {
		let sum = 0
		for (const record of orderedPrimaryRecords) sum += numeratorPlanes.get(record.candidateId)![pixel]
		if (Math.abs(sum - 1) > 1e-12 || labels[pixel] < 0) throw new Error("Projected principal candidate coverages do not partition a target cell")
	}

	const projectedMasks = new Map<number, Uint8Array>()
	for (const record of orderedPrimaryRecords) projectedMasks.set(record.candidateId, new Uint8Array(targetPixels))
	for (let pixel = 0; pixel < targetPixels; pixel++) projectedMasks.get(labels[pixel])![pixel] = 1

	const familySpatial = new Map<number, ReturnType<typeof spatialEvidence>>()
	for (const family of context.families) {
		const memberIds = new Set(family.primaryCandidateIds)
		const mask = new Uint8Array(targetPixels)
		for (let pixel = 0; pixel < targetPixels; pixel++) if (memberIds.has(labels[pixel])) mask[pixel] = 1
		familySpatial.set(family.id, spatialEvidence(observationAnalysis, mask))
	}

	const excludedTypographyCandidateIds: number[] = []
	for (const record of context.candidateRecords) {
		const candidate = candidateById.get(record.candidateId)!
		if (!candidate.typographyOnly) continue
		const sat = buildBinaryMaskSummedAreaTable(record.mask, native.width, native.height)
		const numerators = new Float64Array(targetPixels)
		const mask = new Uint8Array(targetPixels)
		let target = 0
		for (let y = 0; y < observationAnalysis.height; y++) {
			for (let x = 0; x < observationAnalysis.width; x++) {
				const numerator = weightedCellCount(sat, xCells[x], yCells[y])
				numerators[target] = numerator / denominator
				if (numerator * 2 >= denominator) mask[target] = 1
				target++
			}
		}
		if (mask.some((value) => value === 1)) {
			numeratorPlanes.set(candidate.id, numerators)
			projectedMasks.set(candidate.id, mask)
		} else {
			excludedTypographyCandidateIds.push(candidate.id)
		}
	}

	const projected = context.candidates.flatMap((candidate): Candidate[] => {
		const mask = projectedMasks.get(candidate.id)
		const numerators = numeratorPlanes.get(candidate.id)
		if (!mask || !numerators) return []
		const fields = weightedObservationFields(numerators, observationAnalysis)
		const spatial = spatialEvidence(observationAnalysis, mask)
		return [{
			...candidate,
			lab: rgbToOKLab(candidate.rgb),
			population: fields.population,
			background: fields.background,
			saliency: fields.saliency,
			text: fields.text,
			regionIds: spatial.regionIds,
			spatial,
			familySpatial: familySpatial.get(candidate.familyId)!,
		}]
	}).sort((first, second) => second.population - first.population || first.id - second.id)

	if (projected.some((candidate) => !Number.isFinite(candidate.population) || candidate.population <= 0 ||
		!Number.isFinite(candidate.background) || !Number.isFinite(candidate.saliency) || !Number.isFinite(candidate.text) ||
		candidate.familySpatial === undefined)) {
		throw new Error("Projected candidate evidence is invalid")
	}
	return {
		candidates: projected,
		labels,
		width: observationAnalysis.width,
		height: observationAnalysis.height,
		principalCandidateIds: orderedPrimaryRecords.map((record) => record.candidateId),
		excludedTypographyCandidateIds,
		nativePartitionSha256: partitionSha256,
		projectedPartitionSha256: typedArraySha256(labels),
	}
}

function candidateDiagnostic(candidate: Candidate): ExtractionResult["candidates"][number] {
	return {
		hex: candidate.hex,
		rgb: candidate.rgb,
		population: candidate.population,
		background: candidate.background,
		saliency: candidate.saliency,
		text: candidate.text,
		chroma: candidate.chroma,
	}
}

export function extractScaleAwareNativePaletteWithContext(
	native: RawImage,
	observation: RawImage,
): ScaleAwareNativeExtractionContext {
	const startedAt = performance.now()
	const observationContext = extractPaletteWithContext(observation)
	const nativeContext = buildCandidateContext(analyzeRegions(native), 12, true, { stableFamilyAnchors: true })
	const projection = projectNativeCandidateContext(nativeContext, native, observationContext.analysis)
	const guarded = solveGuardedPalette(projection.candidates, observationContext.analysis)
	const joint = solveJointPalette(projection.candidates, observationContext.analysis, guarded.palette)
	const extraction: ExtractionResult = {
		version: SCALE_AWARE_NATIVE_ALGORITHM_VERSION,
		width: native.width,
		height: native.height,
		methods: {
			spatial: joint.palette,
			expressive: observationContext.extraction.methods.expressive,
			quantized: observationContext.extraction.methods.quantized,
		},
		candidates: projection.candidates.map(candidateDiagnostic),
		diagnostics: {
			regionCount: observationContext.analysis.regions.length,
			candidateCount: projection.candidates.length,
			processingMs: Math.round(performance.now() - startedAt),
		},
	}
	const nativeColors = new Set<string>()
	for (let offset = 0; offset < native.data.length; offset += 3) {
		nativeColors.add(`${native.data[offset]},${native.data[offset + 1]},${native.data[offset + 2]}`)
	}
	for (const role of ["background", "foreground", "surface", "accent"] as const) {
		const color = extraction.methods.spatial[role]
		if (!color.generated && !nativeColors.has(color.rgb.join(","))) {
			throw new Error(`Scale-aware ${role} is not an exact native source pixel`)
		}
	}
	return {
		extraction,
		canonicalControl: observationContext.extraction,
		projection: {
			width: projection.width,
			height: projection.height,
			principalCandidateIds: projection.principalCandidateIds,
			excludedTypographyCandidateIds: projection.excludedTypographyCandidateIds,
			nativePartitionSha256: projection.nativePartitionSha256,
			projectedPartitionSha256: projection.projectedPartitionSha256,
		},
		policy: SCALE_AWARE_NATIVE_POLICY,
		policySha256: SCALE_AWARE_NATIVE_POLICY_SHA256,
		nativeImageSha256: rasterSha256(native),
		observationImageSha256: rasterSha256(observation),
	}
}

export async function loadAndExtractScaleAwareNativePaletteWithContext(
	source: string | Uint8Array,
): Promise<ScaleAwareNativeExtractionContext> {
	const native = await loadNativeImage(source)
	const observation = await loadImage(source, { maxSize: SCALE_AWARE_NATIVE_OBSERVATION_MAX_EDGE })
	return extractScaleAwareNativePaletteWithContext(native, observation)
}
