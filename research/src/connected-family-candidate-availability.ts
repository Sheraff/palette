import { createHash } from "node:crypto"
import { spatialEvidence, type Candidate, type CandidatePerceptionRecord, type ColorBin } from "./candidates.ts"
import { chroma, labAt, okDistance, rgbToHex, rgbToOKLab } from "./color.ts"
import type { PalettePerception } from "./palette-perception.ts"
import type { RegionAnalysis } from "./regions.ts"
import type { OKLab, RGB } from "./types.ts"

export const CONNECTED_FAMILY_CANDIDATE_AVAILABILITY_VERSION =
	"connected-family-candidate-availability-0.1.0-dev"

export const CONNECTED_FAMILY_CANDIDATE_THRESHOLDS = Object.freeze({
	hueAnchorCount: 12,
	hueWindowRadians: Math.PI / 8,
	minimumBinChroma: 0.03,
	minimumLightness: 0.2,
	maximumLightness: 0.97,
	maximumPopulation: 0.08,
	minimumFamilyChroma: 0.035,
	minimumComponentPixels: 4,
	minimumComponentSaliency: 0.45,
	minimumComponentTypography: 0.7,
	ordinaryMinimumPopulation: 0.005,
	minimumLargestComponent: 0.0005,
	minimumRepeatedComponents: 4,
	minimumSupportingRegions: 4,
	minimumRegionPixels: 6,
	minimumRegionFraction: 0.08,
	representedDistance: 0.055,
	suppressionOverlap: 0.5,
})

type Component = {
	firstPixelIndex: number
	pixelIndices: number[]
	regionIds: number[]
	population: number
	saliency: number
	text: number
}

type MutableProposal = {
	anchorIndex: number
	anchorDegrees: number
	binIds: number[]
	mask: Uint8Array
	maskSha256: string
	components: Component[]
	center: OKLab
	representativePixelIndex: number
	rgb: RGB
	lab: OKLab
	hex: string
	population: number
	chroma: number
	background: number
	saliency: number
	text: number
	supportingRegionCount: number
	evidencedRegionCount: number
	spatial: ReturnType<typeof spatialEvidence>
	nearestBaselineCandidateId: number | null
	nearestBaselineDistance: number | null
	representedByCandidateId: number | null
}

export type ConnectedFamilyCandidateProposal = Omit<MutableProposal, "mask" | "components"> & {
	stableKey: string
	componentFirstPixelIndices: readonly number[]
	get mask(): Uint8Array
}

export type ConnectedFamilyAnchorTrace = {
	anchorDegrees: number
	eligibleBinCount: number
	rawComponentCount: number
	qualifyingComponentCount: number
	retainedPopulation: number
	largestComponent: number
	supportingRegionCount: number
	evidencedRegionCount: number
	populationRoute: "ordinary" | "large-component" | "repeated-components" | null
	outcome:
		| "no-eligible-bins"
		| "no-evidenced-components"
		| "population-above-maximum"
		| "connected-support-below-minimum"
		| "family-chroma-below-minimum"
		| "already-represented"
		| "qualified"
	representedByCandidateId: number | null
	proposalStableKey: string | null
}

export type ConnectedFamilyCandidateAvailability = {
	version: typeof CONNECTED_FAMILY_CANDIDATE_AVAILABILITY_VERSION
	thresholds: typeof CONNECTED_FAMILY_CANDIDATE_THRESHOLDS
	proposals: readonly ConnectedFamilyCandidateProposal[]
	anchors: readonly ConnectedFamilyAnchorTrace[]
	diagnostics: {
		anchorsEvaluated: number
		qualified: number
		alreadyRepresented: number
		suppressed: number
		selected: number
	}
	invariants: {
		readOnly: true
		exactSourcePixelsOnly: true
		connectedEvidenceOnly: true
		proposalsNotPassedToRoleSolver: true
		targetColorsInferred: false
	}
}

const thresholds = CONNECTED_FAMILY_CANDIDATE_THRESHOLDS
const epsilon = 1e-12

function hueRadians([, a, b]: OKLab): number {
	const value = Math.atan2(b, a)
	return value < 0 ? value + Math.PI * 2 : value
}

function circularHueDistance(first: number, second: number): number {
	const difference = Math.abs(first - second)
	return Math.min(difference, Math.PI * 2 - difference)
}

function eligibleBins(anchorIndex: number, bins: readonly ColorBin[]): ColorBin[] {
	const anchor = anchorIndex / thresholds.hueAnchorCount * Math.PI * 2
	return bins.filter((bin) => bin.chroma >= thresholds.minimumBinChroma &&
		bin.lab[0] >= thresholds.minimumLightness && bin.lab[0] <= thresholds.maximumLightness &&
		circularHueDistance(hueRadians(bin.lab), anchor) <= thresholds.hueWindowRadians)
}

function connectedComponents(
	analysis: RegionAnalysis,
	pixelBinIds: Int32Array,
	binIds: ReadonlySet<number>,
): Component[] {
	const total = analysis.width * analysis.height
	const eligible = new Uint8Array(total)
	for (let pixel = 0; pixel < total; pixel++) if (binIds.has(pixelBinIds[pixel])) eligible[pixel] = 1
	const visited = new Uint8Array(total)
	const components: Component[] = []
	for (let start = 0; start < total; start++) {
		if (!eligible[start] || visited[start]) continue
		const stack = [start]
		const pixels: number[] = []
		const regionIds = new Set<number>()
		let saliency = 0
		let text = 0
		visited[start] = 1
		while (stack.length > 0) {
			const pixel = stack.pop()!
			const x = pixel % analysis.width
			const y = Math.floor(pixel / analysis.width)
			const regionId = analysis.labels[pixel]
			const region = analysis.regions[regionId]
			pixels.push(pixel)
			regionIds.add(regionId)
			saliency += region.saliency
			text += region.text
			const neighbors = [
				x > 0 ? pixel - 1 : -1,
				x + 1 < analysis.width ? pixel + 1 : -1,
				y > 0 ? pixel - analysis.width : -1,
				y + 1 < analysis.height ? pixel + analysis.width : -1,
			]
			for (const neighbor of neighbors) {
				if (neighbor >= 0 && eligible[neighbor] && !visited[neighbor]) {
					visited[neighbor] = 1
					stack.push(neighbor)
				}
			}
		}
		components.push({
			firstPixelIndex: start,
			pixelIndices: pixels.sort((first, second) => first - second),
			regionIds: [...regionIds].sort((first, second) => first - second),
			population: pixels.length / total,
			saliency: saliency / pixels.length,
			text: text / pixels.length,
		})
	}
	return components
}

function supportingRegionCount(analysis: RegionAnalysis, mask: Uint8Array): number {
	const counts = new Uint32Array(analysis.regions.length)
	for (let pixel = 0; pixel < mask.length; pixel++) if (mask[pixel]) counts[analysis.labels[pixel]]++
	return analysis.regions.filter((region) => counts[region.id] >= Math.max(
		thresholds.minimumRegionPixels,
		Math.ceil(region.area * thresholds.minimumRegionFraction),
	)).length
}

function populationRoute(
	population: number,
	largestComponent: number,
	componentCount: number,
	evidencedRegions: number,
): ConnectedFamilyAnchorTrace["populationRoute"] {
	if (population >= thresholds.ordinaryMinimumPopulation) return "ordinary"
	if (largestComponent >= thresholds.minimumLargestComponent) return "large-component"
	if (componentCount >= thresholds.minimumRepeatedComponents &&
		evidencedRegions >= thresholds.minimumSupportingRegions) return "repeated-components"
	return null
}

function weightedSourceEvidence(analysis: RegionAnalysis, mask: Uint8Array): {
	center: OKLab
	background: number
	saliency: number
	text: number
	population: number
} {
	let count = 0
	let lightness = 0
	let a = 0
	let b = 0
	let background = 0
	let saliency = 0
	let text = 0
	for (let pixel = 0; pixel < mask.length; pixel++) {
		if (!mask[pixel]) continue
		const lab = labAt(analysis.labs, pixel)
		const region = analysis.regions[analysis.labels[pixel]]
		count++
		lightness += lab[0]
		a += lab[1]
		b += lab[2]
		background += region.background
		saliency += region.saliency
		text += region.text
	}
	return {
		center: [lightness / count, a / count, b / count],
		background: background / count,
		saliency: saliency / count,
		text: text / count,
		population: count / mask.length,
	}
}

function representativePixel(analysis: RegionAnalysis, mask: Uint8Array, center: OKLab): number {
	let selected = -1
	let selectedDistance = Infinity
	for (let pixel = 0; pixel < mask.length; pixel++) {
		if (!mask[pixel]) continue
		const distance = okDistance(labAt(analysis.labs, pixel), center)
		if (distance < selectedDistance) {
			selected = pixel
			selectedDistance = distance
		}
	}
	if (selected < 0) throw new Error("Connected family proposal lacks a source representative")
	return selected
}

function sourceRgb(analysis: RegionAnalysis, pixel: number): RGB {
	const offset = pixel * 3
	return [analysis.data[offset], analysis.data[offset + 1], analysis.data[offset + 2]]
}

function baselineRepresentation(
	proposal: MutableProposal,
	candidates: readonly Candidate[],
	records: readonly CandidatePerceptionRecord[],
): void {
	const recordsById = new Map(records.map((record) => [record.candidateId, record]))
	let nearest: Candidate | null = null
	let nearestDistance = Infinity
	for (const candidate of candidates) {
		const distance = okDistance(proposal.lab, candidate.lab)
		if (distance < nearestDistance || distance === nearestDistance && candidate.id < (nearest?.id ?? Infinity)) {
			nearest = candidate
			nearestDistance = distance
		}
		const record = recordsById.get(candidate.id)
		if (distance <= thresholds.representedDistance && record && proposal.mask[record.representativePixelIndex]) {
			proposal.representedByCandidateId = Math.min(proposal.representedByCandidateId ?? Infinity, candidate.id)
		}
	}
	proposal.nearestBaselineCandidateId = nearest?.id ?? null
	proposal.nearestBaselineDistance = Number.isFinite(nearestDistance) ? nearestDistance : null
}

function buildProposal(
	anchorIndex: number,
	bins: readonly ColorBin[],
	pixelBinIds: Int32Array,
	analysis: RegionAnalysis,
	candidates: readonly Candidate[],
	records: readonly CandidatePerceptionRecord[],
): { proposal: MutableProposal | null; trace: ConnectedFamilyAnchorTrace } {
	const selectedBins = eligibleBins(anchorIndex, bins)
	const emptyTrace = (outcome: ConnectedFamilyAnchorTrace["outcome"]): ConnectedFamilyAnchorTrace => ({
		anchorDegrees: anchorIndex / thresholds.hueAnchorCount * 360,
		eligibleBinCount: selectedBins.length,
		rawComponentCount: 0,
		qualifyingComponentCount: 0,
		retainedPopulation: 0,
		largestComponent: 0,
		supportingRegionCount: 0,
		evidencedRegionCount: 0,
		populationRoute: null,
		outcome,
		representedByCandidateId: null,
		proposalStableKey: null,
	})
	if (selectedBins.length === 0) return { proposal: null, trace: emptyTrace("no-eligible-bins") }
	const components = connectedComponents(analysis, pixelBinIds, new Set(selectedBins.map((bin) => bin.id)))
	const qualifying = components.filter((component) =>
		component.pixelIndices.length >= thresholds.minimumComponentPixels &&
		(component.saliency >= thresholds.minimumComponentSaliency ||
			component.text >= thresholds.minimumComponentTypography))
	if (qualifying.length === 0) {
		return { proposal: null, trace: { ...emptyTrace("no-evidenced-components"), rawComponentCount: components.length } }
	}
	const mask = new Uint8Array(analysis.width * analysis.height)
	for (const component of qualifying) for (const pixel of component.pixelIndices) mask[pixel] = 1
	const evidence = weightedSourceEvidence(analysis, mask)
	const largestComponent = qualifying.reduce((largest, component) => Math.max(largest, component.population), 0)
	const regions = supportingRegionCount(analysis, mask)
	const evidencedRegionCount = new Set(qualifying.flatMap((component) => component.regionIds)).size
	const route = populationRoute(evidence.population, largestComponent, qualifying.length, evidencedRegionCount)
	const baseTrace = {
		...emptyTrace("qualified"),
		rawComponentCount: components.length,
		qualifyingComponentCount: qualifying.length,
		retainedPopulation: evidence.population,
		largestComponent,
		supportingRegionCount: regions,
		evidencedRegionCount,
		populationRoute: route,
	}
	if (evidence.population > thresholds.maximumPopulation) {
		return { proposal: null, trace: { ...baseTrace, outcome: "population-above-maximum" } }
	}
	if (!route) return { proposal: null, trace: { ...baseTrace, outcome: "connected-support-below-minimum" } }
	if (chroma(evidence.center) < thresholds.minimumFamilyChroma) {
		return { proposal: null, trace: { ...baseTrace, outcome: "family-chroma-below-minimum" } }
	}
	const representativePixelIndex = representativePixel(analysis, mask, evidence.center)
	const rgb = sourceRgb(analysis, representativePixelIndex)
	const lab = rgbToOKLab(rgb)
	const proposal: MutableProposal = {
		anchorIndex,
		anchorDegrees: anchorIndex / thresholds.hueAnchorCount * 360,
		binIds: selectedBins.map((bin) => bin.id).sort((first, second) => first - second),
		mask,
		maskSha256: createHash("sha256").update(mask).digest("hex"),
		components: qualifying,
		center: evidence.center,
		representativePixelIndex,
		rgb,
		lab,
		hex: rgbToHex(rgb),
		population: evidence.population,
		chroma: chroma(lab),
		background: evidence.background,
		saliency: evidence.saliency,
		text: evidence.text,
		supportingRegionCount: regions,
		evidencedRegionCount,
		spatial: spatialEvidence(analysis, mask),
		nearestBaselineCandidateId: null,
		nearestBaselineDistance: null,
		representedByCandidateId: null,
	}
	baselineRepresentation(proposal, candidates, records)
	const stableKey = proposalKey(proposal)
	return {
		proposal,
		trace: {
			...baseTrace,
			outcome: proposal.representedByCandidateId === null ? "qualified" : "already-represented",
			representedByCandidateId: proposal.representedByCandidateId,
			proposalStableKey: stableKey,
		},
	}
}

function proposalKey(proposal: MutableProposal): string {
	return `${proposal.hex}:${proposal.representativePixelIndex}:${proposal.maskSha256}`
}

function overlap(first: MutableProposal, second: MutableProposal): number {
	let intersection = 0
	let firstSupport = 0
	let secondSupport = 0
	for (let pixel = 0; pixel < first.mask.length; pixel++) {
		firstSupport += first.mask[pixel]
		secondSupport += second.mask[pixel]
		intersection += first.mask[pixel] & second.mask[pixel]
	}
	return intersection / Math.max(1, Math.min(firstSupport, secondSupport))
}

function suppresses(first: MutableProposal, second: MutableProposal): boolean {
	return overlap(first, second) >= thresholds.suppressionOverlap ||
		okDistance(first.lab, second.lab) <= thresholds.representedDistance
}

function freezeProposal(proposal: MutableProposal): ConnectedFamilyCandidateProposal {
	const mask = new Uint8Array(proposal.mask)
	const componentFirstPixelIndices = proposal.components.map((component) => component.firstPixelIndex)
	Object.freeze(componentFirstPixelIndices)
	Object.freeze(proposal.binIds)
	Object.freeze(proposal.center)
	Object.freeze(proposal.rgb)
	Object.freeze(proposal.lab)
	return Object.freeze({
		anchorIndex: proposal.anchorIndex,
		anchorDegrees: proposal.anchorDegrees,
		binIds: proposal.binIds,
		maskSha256: proposal.maskSha256,
		center: proposal.center,
		representativePixelIndex: proposal.representativePixelIndex,
		rgb: proposal.rgb,
		lab: proposal.lab,
		hex: proposal.hex,
		population: proposal.population,
		chroma: proposal.chroma,
		background: proposal.background,
		saliency: proposal.saliency,
		text: proposal.text,
		supportingRegionCount: proposal.supportingRegionCount,
		evidencedRegionCount: proposal.evidencedRegionCount,
		spatial: proposal.spatial,
		nearestBaselineCandidateId: proposal.nearestBaselineCandidateId,
		nearestBaselineDistance: proposal.nearestBaselineDistance,
		representedByCandidateId: proposal.representedByCandidateId,
		stableKey: proposalKey(proposal),
		componentFirstPixelIndices,
		get mask(): Uint8Array { return new Uint8Array(mask) },
	})
}

export function buildConnectedFamilyCandidateAvailability(
	perception: PalettePerception,
): ConnectedFamilyCandidateAvailability {
	const before = JSON.stringify(perception.candidates)
	const qualified: MutableProposal[] = []
	const anchors: ConnectedFamilyAnchorTrace[] = []
	for (let anchorIndex = 0; anchorIndex < thresholds.hueAnchorCount; anchorIndex++) {
		const result = buildProposal(
			anchorIndex,
			perception.bins,
			perception.pixelBinIds,
			perception.analysis,
			perception.candidates,
			perception.candidateRecords,
		)
		anchors.push(result.trace)
		if (result.proposal && result.proposal.representedByCandidateId === null) qualified.push(result.proposal)
	}
	qualified.sort((first, second) =>
		Math.max(second.text, second.saliency) - Math.max(first.text, first.saliency) ||
		second.population - first.population || first.hex.localeCompare(second.hex) ||
		first.representativePixelIndex - second.representativePixelIndex || first.anchorIndex - second.anchorIndex)
	const retained: MutableProposal[] = []
	let suppressed = 0
	for (const proposal of qualified) {
		if (retained.some((selected) => suppresses(selected, proposal))) suppressed++
		else retained.push(proposal)
	}
	const selected = retained.map(freezeProposal)
	if (JSON.stringify(perception.candidates) !== before) throw new Error("Connected family availability mutated perception candidates")
	Object.freeze(anchors)
	Object.freeze(selected)
	return Object.freeze({
		version: CONNECTED_FAMILY_CANDIDATE_AVAILABILITY_VERSION,
		thresholds,
		proposals: selected,
		anchors,
		diagnostics: Object.freeze({
			anchorsEvaluated: thresholds.hueAnchorCount,
			qualified: qualified.length,
			alreadyRepresented: anchors.filter((anchor) => anchor.outcome === "already-represented").length,
			suppressed,
			selected: selected.length,
		}),
		invariants: Object.freeze({
			readOnly: true,
			exactSourcePixelsOnly: true,
			connectedEvidenceOnly: true,
			proposalsNotPassedToRoleSolver: true,
			targetColorsInferred: false,
		}),
	})
}
