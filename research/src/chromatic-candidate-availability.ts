import { createHash } from "node:crypto"
import {
	buildBins,
	spatialEvidence,
	type Candidate,
	type ColorBin,
} from "./candidates.ts"
import { chroma, okDistance, rgbToHex, rgbToOKLab } from "./color.ts"
import {
	extractRegionGraph017PaletteWithContext,
	REGION_GRAPH_0_17_ALGORITHM_VERSION,
} from "./region-graph-0.17-extract.ts"
import type { RegionAnalysis } from "./regions.ts"
import type { ExtractionResult, OKLab, RawImage, RGB } from "./types.ts"

export const CHROMATIC_CANDIDATE_AVAILABILITY_VERSION = "region-candidate-availability-0.1.0-poc.1"
export const CHROMATIC_CANDIDATE_BASELINE_VERSION = REGION_GRAPH_0_17_ALGORITHM_VERSION

const hueAnchorCount = 12
const hueWindowRadians = Math.PI / 8
const minimumBinChroma = 0.03
const minimumLightness = 0.2
const maximumLightness = 0.97
const minimumPopulation = 0.005
const maximumPopulation = 0.08
const minimumFamilyChroma = 0.035
const minimumSaliency = 0.45
const minimumLargestComponent = 0.0005
const minimumSupportingRegions = 4
const minimumRegionPixels = 6
const minimumRegionFraction = 0.08
const representedDistance = 0.055
const representedHueDistance = hueWindowRadians
const representedLightnessDistance = 0.15
const suppressionOverlap = 0.5
const maximumSupplements = 2
const epsilon = 1e-12

type Proposal = {
	anchorIndex: number
	anchorDegrees: number
	bins: ColorBin[]
	binIds: Set<number>
	center: OKLab
	population: number
	saliency: number
	supportingRegionCount: number
	mask: Uint8Array
	representative: ColorBin
	spatial: ReturnType<typeof spatialEvidence>
	score: number
	nearestBaselineDistance: number
}

export type ChromaticCandidateSupplement = {
	anchorDegrees: number
	score: number
	supportingRegionCount: number
	nearestBaselineDistance: number
	candidate: Candidate
}

export type ChromaticAvailabilityDiagnostics = {
	anchorsEvaluated: number
	qualifiedProposals: number
	alreadyRepresented: number
	suppressedProposals: number
	droppedByCap: number
	selectedSupplements: number
}

export type ChromaticCandidateAvailabilityResult = {
	supplements: ChromaticCandidateSupplement[]
	diagnostics: ChromaticAvailabilityDiagnostics
}

export type ChromaticCandidateAvailabilityCertificate = {
	schemaVersion: 1
	algorithmVersion: typeof CHROMATIC_CANDIDATE_AVAILABILITY_VERSION
	baselineAlgorithmVersion: typeof CHROMATIC_CANDIDATE_BASELINE_VERSION
	selectionRule: "supported-missing-overlapping-oklab-hue-families"
	baselineCandidateIdentitySha256: string
	diagnostics: ChromaticAvailabilityDiagnostics
	supplements: Array<{
		anchorDegrees: number
		hex: string
		rgb: RGB
		population: number
		chroma: number
		saliency: number
		text: number
		background: number
		score: number
		supportingRegionCount: number
		nearestBaselineDistance: number
		spatial: {
			population: number
			componentCount: number
			largestComponent: number
			field: number
			detail: number
			frame: number
		}
	}>
	invariants: {
		rolesUnchanged: true
		gradientsUnchanged: true
		canonicalCandidateDiagnosticsUnchanged: true
		proposedCandidatesNotPassedToRoleSolvers: true
		exactSourcePixelsOnly: true
		baselineCandidatesRetained: true
	}
}

export type ChromaticCandidateAvailabilityExtraction = {
	extraction: ExtractionResult
	certificate: ChromaticCandidateAvailabilityCertificate
}

function hueRadians([, a, b]: OKLab): number {
	const value = Math.atan2(b, a)
	return value < 0 ? value + Math.PI * 2 : value
}

function circularHueDistance(first: number, second: number): number {
	const difference = Math.abs(first - second)
	return Math.min(difference, Math.PI * 2 - difference)
}

function weightedCenter(bins: readonly ColorBin[]): OKLab {
	const population = bins.reduce((sum, bin) => sum + bin.population, 0)
	return [
		bins.reduce((sum, bin) => sum + bin.lab[0] * bin.population, 0) / population,
		bins.reduce((sum, bin) => sum + bin.lab[1] * bin.population, 0) / population,
		bins.reduce((sum, bin) => sum + bin.lab[2] * bin.population, 0) / population,
	]
}

function weightedField(bins: readonly ColorBin[], field: "background" | "saliency" | "text"): number {
	const population = bins.reduce((sum, bin) => sum + bin.population, 0)
	return bins.reduce((sum, bin) => sum + bin[field] * bin.population, 0) / population
}

function proposalMask(pixelBinIds: Int32Array, binIds: ReadonlySet<number>): Uint8Array {
	const mask = new Uint8Array(pixelBinIds.length)
	for (let pixel = 0; pixel < pixelBinIds.length; pixel++) {
		if (binIds.has(pixelBinIds[pixel])) mask[pixel] = 1
	}
	return mask
}

function supportingRegionCount(analysis: RegionAnalysis, mask: Uint8Array): number {
	const counts = new Uint32Array(analysis.regions.length)
	for (let pixel = 0; pixel < mask.length; pixel++) if (mask[pixel]) counts[analysis.labels[pixel]]++
	return analysis.regions.filter((region) =>
		counts[region.id] >= Math.max(minimumRegionPixels, Math.ceil(region.area * minimumRegionFraction))).length
}

function proposalForAnchor(
	anchorIndex: number,
	bins: readonly ColorBin[],
	pixelBinIds: Int32Array,
	analysis: RegionAnalysis,
): Proposal | null {
	const anchor = anchorIndex / hueAnchorCount * Math.PI * 2
	const selectedBins = bins.filter((bin) =>
		bin.chroma >= minimumBinChroma && bin.lab[0] >= minimumLightness && bin.lab[0] <= maximumLightness &&
		circularHueDistance(hueRadians(bin.lab), anchor) <= hueWindowRadians)
	if (selectedBins.length === 0) return null
	const population = selectedBins.reduce((sum, bin) => sum + bin.population, 0)
	if (population < minimumPopulation || population > maximumPopulation) return null
	const center = weightedCenter(selectedBins)
	const saliency = weightedField(selectedBins, "saliency")
	if (chroma(center) < minimumFamilyChroma || saliency < minimumSaliency) return null
	const binIds = new Set(selectedBins.map((bin) => bin.id))
	const mask = proposalMask(pixelBinIds, binIds)
	const spatial = spatialEvidence(analysis, mask)
	const largestComponent = spatial.components.reduce((largest, component) => Math.max(largest, component.population), 0)
	const regions = supportingRegionCount(analysis, mask)
	if (largestComponent < minimumLargestComponent && regions < minimumSupportingRegions) return null
	const representative = selectedBins.reduce((closest, bin) =>
		okDistance(bin.lab, center) < okDistance(closest.lab, center) ? bin : closest, selectedBins[0])
	const coherence = Math.max(
		largestComponent / Math.max(population, epsilon),
		Math.min(1, regions / 8),
	)
	const score = population * (0.25 + saliency * 0.75) * (0.5 + coherence * 0.5)
	return {
		anchorIndex,
		anchorDegrees: anchorIndex / hueAnchorCount * 360,
		bins: selectedBins,
		binIds,
		center,
		population,
		saliency,
		supportingRegionCount: regions,
		mask,
		representative,
		spatial,
		score,
		nearestBaselineDistance: Infinity,
	}
}

function representedByBaseline(proposal: Proposal, baseline: readonly Candidate[]): boolean {
	const representativeLab = rgbToOKLab(proposal.representative.rgb)
	proposal.nearestBaselineDistance = baseline.reduce((nearest, candidate) =>
		Math.min(nearest, okDistance(representativeLab, candidate.lab)), Infinity)
	return baseline.some((candidate) => {
		if (candidate.typographyOnly) return false
		if (okDistance(representativeLab, candidate.lab) <= representedDistance) return true
		return candidate.chroma >= minimumBinChroma &&
			circularHueDistance(hueRadians(proposal.center), hueRadians(candidate.lab)) <= representedHueDistance &&
			Math.abs(proposal.center[0] - candidate.lab[0]) <= representedLightnessDistance
	})
}

function overlapCoefficient(first: Proposal, second: Proposal): number {
	let overlap = 0
	for (const bin of first.bins) if (second.binIds.has(bin.id)) overlap += bin.population
	return overlap / Math.max(epsilon, Math.min(first.population, second.population))
}

function suppresses(first: Proposal, second: Proposal): boolean {
	return overlapCoefficient(first, second) >= suppressionOverlap ||
		okDistance(rgbToOKLab(first.representative.rgb), rgbToOKLab(second.representative.rgb)) <= representedDistance
}

export function buildChromaticCandidateAvailability(
	analysis: RegionAnalysis,
	baselineCandidates: readonly Candidate[],
): ChromaticCandidateAvailabilityResult {
	const { bins, pixelBinIds } = buildBins(analysis)
	const qualified: Proposal[] = []
	let alreadyRepresented = 0
	for (let anchorIndex = 0; anchorIndex < hueAnchorCount; anchorIndex++) {
		const proposal = proposalForAnchor(anchorIndex, bins, pixelBinIds, analysis)
		if (!proposal) continue
		if (representedByBaseline(proposal, baselineCandidates)) {
			alreadyRepresented++
			continue
		}
		qualified.push(proposal)
	}
	qualified.sort((first, second) => second.score - first.score || first.anchorIndex - second.anchorIndex)
	const retained: Proposal[] = []
	let suppressedProposals = 0
	for (const proposal of qualified) {
		if (retained.some((selected) => suppresses(selected, proposal))) {
			suppressedProposals++
			continue
		}
		retained.push(proposal)
	}
	const selected = retained.slice(0, maximumSupplements)
	let nextId = baselineCandidates.reduce((maximum, candidate) => Math.max(maximum, candidate.id), -1) + 1
	const supplements = selected.map((proposal): ChromaticCandidateSupplement => {
		const rgb = proposal.representative.rgb
		const lab = rgbToOKLab(rgb)
		const id = nextId++
		const candidate: Candidate = {
			id,
			rgb,
			lab,
			hex: rgbToHex(rgb),
			population: proposal.population,
			background: weightedField(proposal.bins, "background"),
			saliency: proposal.saliency,
			text: weightedField(proposal.bins, "text"),
			chroma: chroma(lab),
			generated: false,
			typographyOnly: false,
			regionIds: proposal.spatial.regionIds,
			familyId: id,
			spatial: proposal.spatial,
			familySpatial: proposal.spatial,
		}
		return {
			anchorDegrees: proposal.anchorDegrees,
			score: proposal.score,
			supportingRegionCount: proposal.supportingRegionCount,
			nearestBaselineDistance: proposal.nearestBaselineDistance,
			candidate,
		}
	})
	return {
		supplements,
		diagnostics: {
			anchorsEvaluated: hueAnchorCount,
			qualifiedProposals: qualified.length,
			alreadyRepresented,
			suppressedProposals,
			droppedByCap: Math.max(0, retained.length - maximumSupplements),
			selectedSupplements: supplements.length,
		},
	}
}

function candidateIdentity(candidates: readonly Candidate[]): string {
	const value = candidates.map((candidate) => ({
		id: candidate.id,
		hex: candidate.hex,
		population: candidate.population,
		typographyOnly: candidate.typographyOnly,
		familyId: candidate.familyId,
	}))
	return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

function exactSourcePixel(image: RawImage, rgb: RGB): boolean {
	for (let offset = 0; offset < image.data.length; offset += 3) {
		if (image.data[offset] === rgb[0] && image.data[offset + 1] === rgb[1] && image.data[offset + 2] === rgb[2]) return true
	}
	return false
}

export function extractChromaticCandidateAvailability(image: RawImage): ChromaticCandidateAvailabilityExtraction {
	const context = extractRegionGraph017PaletteWithContext(image)
	const result = buildChromaticCandidateAvailability(context.analysis, context.candidates)
	if (result.supplements.some((supplement) => !exactSourcePixel(image, supplement.candidate.rgb))) {
		throw new Error("Chromatic availability supplement is not an exact normalized source pixel")
	}
	return {
		extraction: context.extraction,
		certificate: {
			schemaVersion: 1,
			algorithmVersion: CHROMATIC_CANDIDATE_AVAILABILITY_VERSION,
			baselineAlgorithmVersion: CHROMATIC_CANDIDATE_BASELINE_VERSION,
			selectionRule: "supported-missing-overlapping-oklab-hue-families",
			baselineCandidateIdentitySha256: candidateIdentity(context.candidates),
			diagnostics: result.diagnostics,
			supplements: result.supplements.map((supplement) => ({
				anchorDegrees: supplement.anchorDegrees,
				hex: supplement.candidate.hex,
				rgb: supplement.candidate.rgb,
				population: supplement.candidate.population,
				chroma: supplement.candidate.chroma,
				saliency: supplement.candidate.saliency,
				text: supplement.candidate.text,
				background: supplement.candidate.background,
				score: supplement.score,
				supportingRegionCount: supplement.supportingRegionCount,
				nearestBaselineDistance: supplement.nearestBaselineDistance,
				spatial: {
					population: supplement.candidate.spatial.population,
					componentCount: supplement.candidate.spatial.components.length,
					largestComponent: supplement.candidate.spatial.components.reduce((largest, component) =>
						Math.max(largest, component.population), 0),
					field: supplement.candidate.spatial.field,
					detail: supplement.candidate.spatial.detail,
					frame: supplement.candidate.spatial.frame,
				},
			})),
			invariants: {
				rolesUnchanged: true,
				gradientsUnchanged: true,
				canonicalCandidateDiagnosticsUnchanged: true,
				proposedCandidatesNotPassedToRoleSolvers: true,
				exactSourcePixelsOnly: true,
				baselineCandidatesRetained: true,
			},
		},
	}
}
