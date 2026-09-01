import {
	buildBins,
	spatialEvidence,
	type Candidate,
	type ColorBin,
} from "./candidates.ts"
import {
	buildChromaticCandidateAvailability,
	CHROMATIC_CANDIDATE_AVAILABILITY_VERSION,
	type ChromaticCandidateAvailabilityResult,
} from "./chromatic-candidate-availability.ts"
import { chroma, okDistance, rgbToHex, rgbToOKLab } from "./color.ts"
import type { RegionAnalysis } from "./regions.ts"
import type { OKLab } from "./types.ts"

export const TYPOGRAPHY_CHROMATIC_CANDIDATE_AVAILABILITY_VERSION =
	"region-typography-candidate-availability-0.2.0-poc.1"
export const TYPOGRAPHY_CHROMATIC_CANDIDATE_AVAILABILITY_BASELINE_VERSION =
	CHROMATIC_CANDIDATE_AVAILABILITY_VERSION

export const TYPOGRAPHY_CHROMATIC_CANDIDATE_AVAILABILITY_THRESHOLDS = {
	hueAnchorCount: 12,
	hueWindowRadians: Math.PI / 8,
	minimumBinChroma: 0.03,
	minimumLightness: 0.2,
	maximumLightness: 0.97,
	minimumPopulation: 0.005,
	maximumPopulation: 0.08,
	minimumFamilyChroma: 0.035,
	minimumTypographyEvidence: 0.7,
	minimumLargestComponent: 0.0005,
	minimumSupportingRegions: 4,
	minimumRegionPixels: 6,
	minimumRegionFraction: 0.08,
	representedDistance: 0.055,
	representedLightnessDistance: 0.15,
	representingCandidateMinimumChroma: 0.03,
	maximumAddedSupplements: 1,
} as const

type Proposal = {
	anchorIndex: number
	anchorDegrees: number
	bins: ColorBin[]
	binIds: Set<number>
	center: OKLab
	population: number
	saliency: number
	text: number
	supportingRegionCount: number
	representative: ColorBin
	spatial: ReturnType<typeof spatialEvidence>
	score: number
	nearestRepresentingDistance: number
}

export type TypographyChromaticCandidateSupplement = {
	anchorDegrees: number
	score: number
	supportingRegionCount: number
	nearestRepresentingDistance: number
	candidate: Candidate
}

export type TypographyChromaticCandidateAvailabilityResult = {
	baselineAvailability: ChromaticCandidateAvailabilityResult
	addedSupplements: TypographyChromaticCandidateSupplement[]
	diagnostics: {
		anchorsEvaluated: number
		populationQualified: number
		familyChromaQualified: number
		typographyQualified: number
		spatiallyQualified: number
		alreadyRepresentedByChromaticCandidate: number
		suppressedProposals: number
		droppedByCap: number
		addedSupplements: number
	}
	invariants: {
		baselineAvailabilityUnchanged: true
		canonicalCandidatesUnchanged: true
		addedCandidatesNotPassedToRoleSolver: true
		maximumOneAddedCandidate: true
	}
}

const thresholds = TYPOGRAPHY_CHROMATIC_CANDIDATE_AVAILABILITY_THRESHOLDS
const epsilon = 1e-12

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
		counts[region.id] >= Math.max(
			thresholds.minimumRegionPixels,
			Math.ceil(region.area * thresholds.minimumRegionFraction),
		)).length
}

function representedByChromaticCandidate(proposal: Proposal, candidates: readonly Candidate[]): boolean {
	const representativeLab = rgbToOKLab(proposal.representative.rgb)
	proposal.nearestRepresentingDistance = candidates.reduce((nearest, candidate) =>
		candidate.typographyOnly || candidate.chroma < thresholds.representingCandidateMinimumChroma
			? nearest
			: Math.min(nearest, okDistance(representativeLab, candidate.lab)), Infinity)
	return candidates.some((candidate) => {
		if (candidate.typographyOnly || candidate.chroma < thresholds.representingCandidateMinimumChroma) return false
		if (okDistance(representativeLab, candidate.lab) <= thresholds.representedDistance) return true
		return circularHueDistance(hueRadians(proposal.center), hueRadians(candidate.lab)) <= thresholds.hueWindowRadians &&
			Math.abs(proposal.center[0] - candidate.lab[0]) <= thresholds.representedLightnessDistance
	})
}

function overlapCoefficient(first: Proposal, second: Proposal): number {
	let overlap = 0
	for (const bin of first.bins) if (second.binIds.has(bin.id)) overlap += bin.population
	return overlap / Math.max(epsilon, Math.min(first.population, second.population))
}

function buildProposal(
	anchorIndex: number,
	bins: readonly ColorBin[],
	pixelBinIds: Int32Array,
	analysis: RegionAnalysis,
): { proposal: Proposal | null; stage: "empty" | "population" | "chroma" | "typography" | "spatial" | "qualified" } {
	const anchor = anchorIndex / thresholds.hueAnchorCount * Math.PI * 2
	const selectedBins = bins.filter((bin) =>
		bin.chroma >= thresholds.minimumBinChroma &&
		bin.lab[0] >= thresholds.minimumLightness && bin.lab[0] <= thresholds.maximumLightness &&
		circularHueDistance(hueRadians(bin.lab), anchor) <= thresholds.hueWindowRadians)
	if (selectedBins.length === 0) return { proposal: null, stage: "empty" }
	const population = selectedBins.reduce((sum, bin) => sum + bin.population, 0)
	if (population < thresholds.minimumPopulation || population > thresholds.maximumPopulation) {
		return { proposal: null, stage: "population" }
	}
	const center = weightedCenter(selectedBins)
	if (chroma(center) < thresholds.minimumFamilyChroma) return { proposal: null, stage: "chroma" }
	const text = weightedField(selectedBins, "text")
	if (text < thresholds.minimumTypographyEvidence) return { proposal: null, stage: "typography" }
	const binIds = new Set(selectedBins.map((bin) => bin.id))
	const mask = proposalMask(pixelBinIds, binIds)
	const spatial = spatialEvidence(analysis, mask)
	const largestComponent = spatial.components.reduce((largest, component) =>
		Math.max(largest, component.population), 0)
	const regions = supportingRegionCount(analysis, mask)
	if (largestComponent < thresholds.minimumLargestComponent && regions < thresholds.minimumSupportingRegions) {
		return { proposal: null, stage: "spatial" }
	}
	const representativeBins = selectedBins.filter((bin) =>
		chroma(rgbToOKLab(bin.rgb)) >= thresholds.minimumFamilyChroma)
	if (representativeBins.length === 0) return { proposal: null, stage: "chroma" }
	const representative = representativeBins.reduce((closest, bin) =>
		okDistance(bin.lab, center) < okDistance(closest.lab, center) ? bin : closest, representativeBins[0])
	const saliency = weightedField(selectedBins, "saliency")
	const coherence = Math.max(largestComponent / Math.max(population, epsilon), Math.min(1, regions / 8))
	return {
		proposal: {
			anchorIndex,
			anchorDegrees: anchorIndex / thresholds.hueAnchorCount * 360,
			bins: selectedBins,
			binIds,
			center,
			population,
			saliency,
			text,
			supportingRegionCount: regions,
			representative,
			spatial,
			score: population * (0.25 + text * 0.75) * (0.5 + coherence * 0.5),
			nearestRepresentingDistance: Infinity,
		},
		stage: "qualified",
	}
}

export function buildTypographyChromaticCandidateAvailability(
	analysis: RegionAnalysis,
	baselineCandidates: readonly Candidate[],
): TypographyChromaticCandidateAvailabilityResult {
	const canonicalBefore = JSON.stringify(baselineCandidates)
	const baselineAvailability = buildChromaticCandidateAvailability(analysis, baselineCandidates)
	const baselineAvailabilityBefore = JSON.stringify(baselineAvailability)
	const representationPool = [
		...baselineCandidates,
		...baselineAvailability.supplements.map((supplement) => supplement.candidate),
	]
	const { bins, pixelBinIds } = buildBins(analysis)
	const qualified: Proposal[] = []
	let populationQualified = 0
	let familyChromaQualified = 0
	let typographyQualified = 0
	let spatiallyQualified = 0
	let alreadyRepresentedByChromaticCandidate = 0
	for (let anchorIndex = 0; anchorIndex < thresholds.hueAnchorCount; anchorIndex++) {
		const result = buildProposal(anchorIndex, bins, pixelBinIds, analysis)
		if (result.stage !== "empty" && result.stage !== "population") populationQualified++
		if (result.stage !== "empty" && result.stage !== "population" && result.stage !== "chroma") {
			familyChromaQualified++
		}
		if (result.stage === "spatial" || result.stage === "qualified") typographyQualified++
		if (result.stage !== "qualified" || !result.proposal) continue
		spatiallyQualified++
		if (representedByChromaticCandidate(result.proposal, representationPool)) {
			alreadyRepresentedByChromaticCandidate++
			continue
		}
		qualified.push(result.proposal)
	}
	qualified.sort((first, second) => second.score - first.score || first.anchorIndex - second.anchorIndex)
	const retained: Proposal[] = []
	let suppressedProposals = 0
	for (const proposal of qualified) {
		if (retained.some((selected) => overlapCoefficient(selected, proposal) >= 0.5)) {
			suppressedProposals++
			continue
		}
		retained.push(proposal)
	}
	const selected = retained.slice(0, thresholds.maximumAddedSupplements)
	let nextId = representationPool.reduce((maximum, candidate) => Math.max(maximum, candidate.id), -1) + 1
	const addedSupplements = selected.map((proposal): TypographyChromaticCandidateSupplement => {
		const rgb = proposal.representative.rgb
		const lab = rgbToOKLab(rgb)
		const id = nextId++
		return {
			anchorDegrees: proposal.anchorDegrees,
			score: proposal.score,
			supportingRegionCount: proposal.supportingRegionCount,
			nearestRepresentingDistance: proposal.nearestRepresentingDistance,
			candidate: {
				id,
				rgb,
				lab,
				hex: rgbToHex(rgb),
				population: proposal.population,
				background: weightedField(proposal.bins, "background"),
				saliency: proposal.saliency,
				text: proposal.text,
				chroma: chroma(lab),
				generated: false,
				typographyOnly: false,
				regionIds: proposal.spatial.regionIds,
				familyId: id,
				spatial: proposal.spatial,
				familySpatial: proposal.spatial,
			},
		}
	})
	if (JSON.stringify(baselineCandidates) !== canonicalBefore) {
		throw new Error("Typography availability POC mutated canonical candidates")
	}
	if (JSON.stringify(baselineAvailability) !== baselineAvailabilityBefore) {
		throw new Error("Typography availability POC mutated frozen availability")
	}
	return {
		baselineAvailability,
		addedSupplements,
		diagnostics: {
			anchorsEvaluated: thresholds.hueAnchorCount,
			populationQualified,
			familyChromaQualified,
			typographyQualified,
			spatiallyQualified,
			alreadyRepresentedByChromaticCandidate,
			suppressedProposals,
			droppedByCap: Math.max(0, retained.length - thresholds.maximumAddedSupplements),
			addedSupplements: addedSupplements.length,
		},
		invariants: {
			baselineAvailabilityUnchanged: true,
			canonicalCandidatesUnchanged: true,
			addedCandidatesNotPassedToRoleSolver: true,
			maximumOneAddedCandidate: true,
		},
	}
}
