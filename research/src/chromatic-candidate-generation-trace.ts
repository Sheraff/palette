import {
	buildBins,
	spatialEvidence,
	type Candidate,
	type ColorBin,
} from "./candidates.ts"
import { chroma, okDistance, rgbToHex, rgbToOKLab } from "./color.ts"
import type { RegionAnalysis } from "./regions.ts"
import type { OKLab } from "./types.ts"

export const CHROMATIC_CANDIDATE_GENERATION_TRACE_VERSION =
	"chromatic-candidate-generation-trace-0.1.0-development"

const thresholds = {
	hueAnchorCount: 12,
	hueWindowRadians: Math.PI / 8,
	minimumBinChroma: 0.03,
	minimumLightness: 0.2,
	maximumLightness: 0.97,
	minimumPopulation: 0.005,
	maximumPopulation: 0.08,
	minimumFamilyChroma: 0.035,
	minimumSaliency: 0.45,
	minimumLargestComponent: 0.0005,
	minimumSupportingRegions: 4,
	minimumRegionPixels: 6,
	minimumRegionFraction: 0.08,
	representedDistance: 0.055,
	representedLightnessDistance: 0.15,
	lightTypographyMaximumChroma: 0.08,
	lightTypographyMinimumLightness: 0.9,
	lightTypographyMinimumPopulation: 0.001,
	lightTypographyRepresentedDistance: 0.04,
} as const

type BinSummary = {
	id: number
	hex: string
	population: number
	lightness: number
	chroma: number
	hueDegrees: number | null
	background: number
	saliency: number
	text: number
}

type CandidateSummary = {
	id: number
	hex: string
	population: number
	lightness: number
	chroma: number
	typographyOnly: boolean
	background: number
	saliency: number
	text: number
}

export type ChromaticAnchorTrace = {
	anchorDegrees: number
	selectedBinCount: number
	population: number
	center: { lightness: number; chroma: number; hueDegrees: number | null } | null
	representative: BinSummary | null
	saliency: number
	text: number
	spatial: {
		largestComponent: number
		supportingRegionCount: number
		field: number
		detail: number
		frame: number
	} | null
	representability: {
		nearestCandidateId: number | null
		nearestCandidateHex: string | null
		nearestDistance: number | null
		distanceMatches: CandidateSummary[]
		hueLightnessMatches: CandidateSummary[]
	} | null
	gateFailures: string[]
	firstBlockingStage:
		| "no-eligible-bins"
		| "population"
		| "family-chroma"
		| "saliency"
		| "spatial-support"
		| "represented"
		| "qualified"
}

export type ChromaticCandidateGenerationTrace = {
	schemaVersion: 1
	traceVersion: typeof CHROMATIC_CANDIDATE_GENERATION_TRACE_VERSION
	selectionRule: "read-only-frozen-candidate-gate-trace"
	thresholds: typeof thresholds
	baselineCandidates: CandidateSummary[]
	binCount: number
	hueAnchors: ChromaticAnchorTrace[]
	lightTypography: {
		eligibleBinCount: number
		population: number
		representative: BinSummary | null
		nearestCandidate: CandidateSummary | null
		nearestDistance: number | null
		outcome: "population-below-minimum" | "already-represented" | "appended"
	}
	binExtrema: {
		typography: BinSummary[]
		chromaticSupport: BinSummary[]
		lightness: BinSummary[]
	}
	invariants: {
		readOnly: true
		noCandidatesPassedToRoleSolver: true
		noTargetHexInferred: true
		canonicalCandidatesUnchanged: true
	}
}

function hueRadians([, a, b]: OKLab): number | null {
	if (Math.hypot(a, b) < 1e-12) return null
	const value = Math.atan2(b, a)
	return value < 0 ? value + Math.PI * 2 : value
}

function hueDegrees(lab: OKLab): number | null {
	const radians = hueRadians(lab)
	return radians === null ? null : radians / (Math.PI * 2) * 360
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

function summarizeBin(bin: ColorBin): BinSummary {
	return {
		id: bin.id,
		hex: rgbToHex(bin.rgb),
		population: bin.population,
		lightness: bin.lab[0],
		chroma: bin.chroma,
		hueDegrees: hueDegrees(bin.lab),
		background: bin.background,
		saliency: bin.saliency,
		text: bin.text,
	}
}

function summarizeCandidate(candidate: Candidate): CandidateSummary {
	return {
		id: candidate.id,
		hex: candidate.hex,
		population: candidate.population,
		lightness: candidate.lab[0],
		chroma: candidate.chroma,
		typographyOnly: candidate.typographyOnly,
		background: candidate.background,
		saliency: candidate.saliency,
		text: candidate.text,
	}
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

function traceAnchor(
	anchorIndex: number,
	bins: readonly ColorBin[],
	pixelBinIds: Int32Array,
	analysis: RegionAnalysis,
	baselineCandidates: readonly Candidate[],
): ChromaticAnchorTrace {
	const anchor = anchorIndex / thresholds.hueAnchorCount * Math.PI * 2
	const selectedBins = bins.filter((bin) => {
		const hue = hueRadians(bin.lab)
		return bin.chroma >= thresholds.minimumBinChroma &&
			bin.lab[0] >= thresholds.minimumLightness && bin.lab[0] <= thresholds.maximumLightness &&
			hue !== null && circularHueDistance(hue, anchor) <= thresholds.hueWindowRadians
	})
	if (selectedBins.length === 0) {
		return {
			anchorDegrees: anchorIndex / thresholds.hueAnchorCount * 360,
			selectedBinCount: 0,
			population: 0,
			center: null,
			representative: null,
			saliency: 0,
			text: 0,
			spatial: null,
			representability: null,
			gateFailures: ["no-eligible-bins"],
			firstBlockingStage: "no-eligible-bins",
		}
	}

	const population = selectedBins.reduce((sum, bin) => sum + bin.population, 0)
	const center = weightedCenter(selectedBins)
	const familyChroma = chroma(center)
	const saliency = weightedField(selectedBins, "saliency")
	const text = weightedField(selectedBins, "text")
	const representative = selectedBins.reduce((closest, bin) =>
		okDistance(bin.lab, center) < okDistance(closest.lab, center) ? bin : closest, selectedBins[0])
	const mask = proposalMask(pixelBinIds, new Set(selectedBins.map((bin) => bin.id)))
	const spatial = spatialEvidence(analysis, mask)
	const largestComponent = spatial.components.reduce((largest, component) =>
		Math.max(largest, component.population), 0)
	const regions = supportingRegionCount(analysis, mask)
	const representativeLab = rgbToOKLab(representative.rgb)
	const nearest = baselineCandidates.reduce<{ candidate: Candidate | null; distance: number }>((current, candidate) => {
		const distance = okDistance(representativeLab, candidate.lab)
		return distance < current.distance ? { candidate, distance } : current
	}, { candidate: null, distance: Infinity })
	const distanceMatches = baselineCandidates.filter((candidate) =>
		!candidate.typographyOnly && okDistance(representativeLab, candidate.lab) <= thresholds.representedDistance)
	const centerHue = hueRadians(center)
	const hueLightnessMatches = centerHue === null ? [] : baselineCandidates.filter((candidate) => {
		const candidateHue = hueRadians(candidate.lab)
		return !candidate.typographyOnly && candidate.chroma >= thresholds.minimumBinChroma && candidateHue !== null &&
			circularHueDistance(centerHue, candidateHue) <= thresholds.hueWindowRadians &&
			Math.abs(center[0] - candidate.lab[0]) <= thresholds.representedLightnessDistance
	})
	const gateFailures: string[] = []
	if (population < thresholds.minimumPopulation) gateFailures.push("population-below-minimum")
	if (population > thresholds.maximumPopulation) gateFailures.push("population-above-maximum")
	if (familyChroma < thresholds.minimumFamilyChroma) gateFailures.push("family-chroma-below-minimum")
	if (saliency < thresholds.minimumSaliency) gateFailures.push("saliency-below-minimum")
	if (largestComponent < thresholds.minimumLargestComponent && regions < thresholds.minimumSupportingRegions) {
		gateFailures.push("spatial-support-below-minimum")
	}
	if (distanceMatches.length > 0) gateFailures.push("represented-by-distance")
	if (hueLightnessMatches.length > 0) gateFailures.push("represented-by-hue-lightness")

	let firstBlockingStage: ChromaticAnchorTrace["firstBlockingStage"] = "qualified"
	if (population < thresholds.minimumPopulation || population > thresholds.maximumPopulation) firstBlockingStage = "population"
	else if (familyChroma < thresholds.minimumFamilyChroma) firstBlockingStage = "family-chroma"
	else if (saliency < thresholds.minimumSaliency) firstBlockingStage = "saliency"
	else if (largestComponent < thresholds.minimumLargestComponent && regions < thresholds.minimumSupportingRegions) {
		firstBlockingStage = "spatial-support"
	} else if (distanceMatches.length > 0 || hueLightnessMatches.length > 0) firstBlockingStage = "represented"

	return {
		anchorDegrees: anchorIndex / thresholds.hueAnchorCount * 360,
		selectedBinCount: selectedBins.length,
		population,
		center: { lightness: center[0], chroma: familyChroma, hueDegrees: hueDegrees(center) },
		representative: summarizeBin(representative),
		saliency,
		text,
		spatial: {
			largestComponent,
			supportingRegionCount: regions,
			field: spatial.field,
			detail: spatial.detail,
			frame: spatial.frame,
		},
		representability: {
			nearestCandidateId: nearest.candidate?.id ?? null,
			nearestCandidateHex: nearest.candidate?.hex ?? null,
			nearestDistance: Number.isFinite(nearest.distance) ? nearest.distance : null,
			distanceMatches: distanceMatches.map(summarizeCandidate),
			hueLightnessMatches: hueLightnessMatches.map(summarizeCandidate),
		},
		gateFailures,
		firstBlockingStage,
	}
}

function traceLightTypography(bins: readonly ColorBin[], baselineCandidates: readonly Candidate[]) {
	const eligibleBins = bins.filter((bin) =>
		bin.chroma <= thresholds.lightTypographyMaximumChroma &&
		bin.lab[0] >= thresholds.lightTypographyMinimumLightness)
	const population = eligibleBins.reduce((sum, bin) => sum + bin.population, 0)
	if (population < thresholds.lightTypographyMinimumPopulation || eligibleBins.length === 0) {
		return {
			eligibleBinCount: eligibleBins.length,
			population,
			representative: null,
			nearestCandidate: null,
			nearestDistance: null,
			outcome: "population-below-minimum" as const,
		}
	}
	const representative = [...eligibleBins].sort((first, second) => {
		const score = (bin: ColorBin) => bin.text * 0.45 + bin.saliency * 0.4 +
			Math.abs(bin.lab[0] - 0.5) * 0.3 + Math.sqrt(bin.population) * 0.05
		return score(second) - score(first) || first.id - second.id
	})[0]
	const nearest = baselineCandidates.reduce<{ candidate: Candidate | null; distance: number }>((current, candidate) => {
		const distance = okDistance(candidate.lab, representative.lab)
		return distance < current.distance ? { candidate, distance } : current
	}, { candidate: null, distance: Infinity })
	return {
		eligibleBinCount: eligibleBins.length,
		population,
		representative: summarizeBin(representative),
		nearestCandidate: nearest.candidate ? summarizeCandidate(nearest.candidate) : null,
		nearestDistance: Number.isFinite(nearest.distance) ? nearest.distance : null,
		outcome: nearest.distance < thresholds.lightTypographyRepresentedDistance ?
			"already-represented" as const : "appended" as const,
	}
}

function topBins(bins: readonly ColorBin[], score: (bin: ColorBin) => number): BinSummary[] {
	return [...bins]
		.sort((first, second) => score(second) - score(first) || second.population - first.population || first.id - second.id)
		.slice(0, 12)
		.map(summarizeBin)
}

export function traceChromaticCandidateGeneration(
	analysis: RegionAnalysis,
	baselineCandidates: readonly Candidate[],
): ChromaticCandidateGenerationTrace {
	const before = JSON.stringify(baselineCandidates)
	const { bins, pixelBinIds } = buildBins(analysis)
	const result: ChromaticCandidateGenerationTrace = {
		schemaVersion: 1,
		traceVersion: CHROMATIC_CANDIDATE_GENERATION_TRACE_VERSION,
		selectionRule: "read-only-frozen-candidate-gate-trace",
		thresholds,
		baselineCandidates: baselineCandidates.map(summarizeCandidate),
		binCount: bins.length,
		hueAnchors: Array.from({ length: thresholds.hueAnchorCount }, (_, anchorIndex) =>
			traceAnchor(anchorIndex, bins, pixelBinIds, analysis, baselineCandidates)),
		lightTypography: traceLightTypography(bins, baselineCandidates),
		binExtrema: {
			typography: topBins(bins, (bin) => bin.text * Math.sqrt(bin.population) * (0.2 + bin.chroma * 5)),
			chromaticSupport: topBins(bins, (bin) => bin.chroma * Math.sqrt(bin.population) * (0.25 + bin.saliency * 0.75)),
			lightness: topBins(bins, (bin) => bin.lab[0]),
		},
		invariants: {
			readOnly: true,
			noCandidatesPassedToRoleSolver: true,
			noTargetHexInferred: true,
			canonicalCandidatesUnchanged: true,
		},
	}
	if (JSON.stringify(baselineCandidates) !== before) {
		throw new Error("Candidate generation trace mutated the canonical candidates")
	}
	return result
}
