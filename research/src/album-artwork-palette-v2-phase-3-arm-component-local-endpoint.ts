import type {
	ColorFamilyEvidence,
	GradientDirection,
	GradientFitDiagnostic,
	GradientTopology,
	NativePaletteEvidence,
} from "./album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY,
	detectDistinctBandLocalEndpointModes,
	materializeComponentLocalEndpointFamily,
	runBandLocalEndpointRepresentationMechanism,
} from "./album-artwork-palette-v2-phase-3-endpoint-refinement.ts"
import type {
	BandLocalEndpointDetectedMode,
	BandLocalEndpointPixelSample,
	BandLocalEndpointRepresentationMechanism,
	BandLocalEndpointRepresentationMechanismEligibility,
	BandLocalEndpointRepresentationMechanismFit,
	BandLocalEndpointRepresentationMechanismInput,
} from "./album-artwork-palette-v2-phase-3-endpoint-refinement.ts"
import { labAt, okDistance, rgbAt, rgbToOKLab } from "./color.ts"
import type { OKLab, RGB } from "./types.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPONENT_LOCAL_ENDPOINT_ID =
	"album-artwork-palette-v2-phase-3-arm-component-local-endpoint-v2" as const

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPONENT_LOCAL_ENDPOINT_POLICY = Object.freeze({
	minimumComponentBandShare: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.minimumModeShare,
	minimumComponentModeShare:
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.minimumLargestComponentShare,
	maximumAdditiveFamiliesPerBand: 2,
})

export type AlbumArtworkPaletteV2Phase3ComponentLocalEndpointLineage = Readonly<{
	fieldDomainId: string
	topology: GradientTopology
	direction: GradientDirection
	position: "low" | "high"
	sourceFamilyIds: readonly string[]
	componentStartPixelIndex: number
	ownedPixelCount: number
}>

export type AlbumArtworkPaletteV2Phase3ComponentLocalEndpointFamily = Readonly<{
	family: ColorFamilyEvidence
	lineage: AlbumArtworkPaletteV2Phase3ComponentLocalEndpointLineage
	mode: Readonly<{
		prototype: OKLab
		population: number
		populationFraction: number
		neighborhoodPopulation: number
		neighborhoodFraction: number
		distanceFromExistingMode: number
	}>
	component: Readonly<{
		population: number
		bandFraction: number
		neighborhoodPopulation: number
		modeFraction: number
		minX: number
		minY: number
		maxX: number
		maxY: number
	}>
}>

export type AlbumArtworkPaletteV2Phase3ComponentLocalEndpointBand = Readonly<{
	position: "low" | "high"
	spatialRange: readonly [number, number]
	ownedPixelCount: number
	detectedModeCount: number
	occupiedAlternativeModeCount: number
	coherentAlternativeModeCount: number
	lineageEligibleModeCount: number
	omittedFamilyCount: number
	alternativeModes: readonly Readonly<{
		prototype: OKLab
		neighborhoodPopulation: number
		neighborhoodFraction: number
		largestComponentPopulation: number
		largestComponentBandFraction: number
		largestComponentModeFraction: number
		coherent: boolean
		lineageEligible: boolean
		sourceFamilyIds: readonly string[]
	}>[]
	additiveFamilies: readonly AlbumArtworkPaletteV2Phase3ComponentLocalEndpointFamily[]
}>

export type AlbumArtworkPaletteV2Phase3ComponentLocalEndpointFit = Readonly<{
	fieldDomainId: string
	topology: GradientTopology
	direction: GradientDirection
	eligibility: BandLocalEndpointRepresentationMechanismEligibility
	domainPopulation: number
	bands: readonly [
		AlbumArtworkPaletteV2Phase3ComponentLocalEndpointBand,
		AlbumArtworkPaletteV2Phase3ComponentLocalEndpointBand,
	]
}>

export type AlbumArtworkPaletteV2Phase3ComponentLocalEndpointReport = Readonly<{
	mechanismId: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPONENT_LOCAL_ENDPOINT_ID
	inputEligibleFitCount: number
	inspectedFitCount: number
	inspectedBandCount: number
	additiveFamilyCount: number
	omittedFamilyCount: number
	fits: readonly AlbumArtworkPaletteV2Phase3ComponentLocalEndpointFit[]
}>

type ConnectedModeComponent = Readonly<{
	startPixelIndex: number
	pixelIndexes: readonly number[]
	minX: number
	minY: number
	maxX: number
	maxY: number
}>

type ComponentCandidate = Readonly<{
	mode: BandLocalEndpointDetectedMode
	component: ConnectedModeComponent
	measuredNeighborhoodPopulation: number
	sourceFamilyIds: readonly string[]
	distanceFromExistingMode: number
}>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function samplesForIndexes(
	evidence: NativePaletteEvidence,
	pixelIndexes: readonly number[],
): BandLocalEndpointPixelSample[] {
	return pixelIndexes.map((pixelIndex) => ({
		pixelIndex,
		lab: labAt(evidence.labs, pixelIndex),
		rgb: rgbAt(evidence.rgbData, pixelIndex),
	}))
}

function endpointLab(hex: string | undefined): OKLab | null {
	if (!hex || !/^#[0-9a-f]{6}$/iu.test(hex)) return null
	const rgb: RGB = [
		Number.parseInt(hex.slice(1, 3), 16),
		Number.parseInt(hex.slice(3, 5), 16),
		Number.parseInt(hex.slice(5, 7), 16),
	]
	return rgbToOKLab(rgb)
}

function connectedModeComponents(
	evidence: NativePaletteEvidence,
	pixelIndexes: readonly number[],
): ConnectedModeComponent[] {
	const membership = new Uint8Array(evidence.pixelCount)
	for (const pixelIndex of pixelIndexes) membership[pixelIndex] = 1
	const visited = new Uint8Array(evidence.pixelCount)
	const queue = new Int32Array(pixelIndexes.length)
	const components: ConnectedModeComponent[] = []
	for (const start of [...pixelIndexes].sort((first, second) => first - second)) {
		if (visited[start]) continue
		let read = 0
		let length = 1
		let minX = evidence.width
		let minY = evidence.height
		let maxX = 0
		let maxY = 0
		queue[0] = start
		visited[start] = 1
		while (read < length) {
			const pixelIndex = queue[read++]
			const x = pixelIndex % evidence.width
			const y = Math.floor(pixelIndex / evidence.width)
			minX = Math.min(minX, x)
			minY = Math.min(minY, y)
			maxX = Math.max(maxX, x)
			maxY = Math.max(maxY, y)
			const neighbors = [
				x > 0 ? pixelIndex - 1 : -1,
				x + 1 < evidence.width ? pixelIndex + 1 : -1,
				y > 0 ? pixelIndex - evidence.width : -1,
				y + 1 < evidence.height ? pixelIndex + evidence.width : -1,
			]
			for (const neighbor of neighbors) {
				if (neighbor < 0 || !membership[neighbor] || visited[neighbor]) continue
				visited[neighbor] = 1
				queue[length++] = neighbor
			}
		}
		components.push({
			startPixelIndex: start,
			pixelIndexes: [...queue.subarray(0, length)],
			minX,
			minY,
			maxX,
			maxY,
		})
	}
	return components.sort((first, second) =>
		second.pixelIndexes.length - first.pixelIndexes.length ||
		first.startPixelIndex - second.startPixelIndex)
}

function componentPrototype(
	evidence: NativePaletteEvidence,
	pixelIndexes: readonly number[],
): OKLab {
	const sum = pixelIndexes.reduce((value, pixelIndex) => {
		const lab = labAt(evidence.labs, pixelIndex)
		value[0] += lab[0]
		value[1] += lab[1]
		value[2] += lab[2]
		return value
	}, [0, 0, 0] as [number, number, number])
	return [sum[0] / pixelIndexes.length, sum[1] / pixelIndexes.length, sum[2] / pixelIndexes.length]
}

function fitIdentity(fit: BandLocalEndpointRepresentationMechanismFit): string {
	const diagnostic = fit.diagnostic
	return `${diagnostic.fieldDomainId}\0${diagnostic.topology}\0${diagnostic.direction}`
}

function distinctFits(
	fits: readonly BandLocalEndpointRepresentationMechanismFit[],
): BandLocalEndpointRepresentationMechanismFit[] {
	const byIdentity = new Map<string, BandLocalEndpointRepresentationMechanismFit>()
	for (const fit of fits) {
		const identity = fitIdentity(fit)
		const current = byIdentity.get(identity)
		if (!current || (fit.eligibility === "accepted" && current.eligibility === "refinable") ||
			(fit.eligibility === current.eligibility && fit.diagnostic.score > current.diagnostic.score)) {
			byIdentity.set(identity, fit)
		}
	}
	return [...byIdentity.values()].sort((first, second) => compareAscii(fitIdentity(first), fitIdentity(second)))
}

function inspectBand(
	evidence: NativePaletteEvidence,
	fit: BandLocalEndpointRepresentationMechanismFit,
	bandIndex: 0 | 1,
): AlbumArtworkPaletteV2Phase3ComponentLocalEndpointBand {
	const band = fit.bands[bandIndex]
	const samples = samplesForIndexes(evidence, band.pixelIndexes)
	const modes = detectDistinctBandLocalEndpointModes(samples)
	const diagnostic = fit.diagnostic
	const existingLab = endpointLab(diagnostic.endpointHexes?.[bandIndex])
	const existingMode = modes.length === 0 ? null : [...modes].sort((first, second) =>
		(existingLab === null ? 0 : okDistance(first.prototype, existingLab) - okDistance(second.prototype, existingLab)) ||
		second.neighborhoodPopulation - first.neighborhoodPopulation || compareAscii(first.key, second.key))[0]
	const alternatives = modes.filter((mode) => mode !== existingMode && existingMode !== null &&
		okDistance(mode.prototype, existingMode.prototype) >=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.minimumOccupiedModeDistance)
	const occupied = alternatives.filter((mode) => mode.neighborhoodPopulation / Math.max(1, samples.length) >=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.minimumModeShare)
	const minimumComponentPopulation = Math.max(4, Math.ceil(samples.length *
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPONENT_LOCAL_ENDPOINT_POLICY.minimumComponentBandShare))
	const coherent: ComponentCandidate[] = []
	const alternativeModes: Array<{
		prototype: OKLab
		neighborhoodPopulation: number
		neighborhoodFraction: number
		largestComponentPopulation: number
		largestComponentBandFraction: number
		largestComponentModeFraction: number
		coherent: boolean
		lineageEligible: boolean
		sourceFamilyIds: readonly string[]
	}> = []
	const fieldFamilyIds = new Set(evidence.lanes.find(({ name }) => name === "field")?.familyIds ?? [])
	for (const mode of occupied) {
		const neighborhood = samples.filter(({ lab }) => okDistance(lab, mode.prototype) <=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.modeNeighborhoodRadius)
		const component = connectedModeComponents(evidence, neighborhood.map(({ pixelIndex }) => pixelIndex))[0]
		const sourceFamilyIds = [...new Set((component?.pixelIndexes ?? []).map((pixelIndex) =>
			evidence.families[evidence.familyAt[pixelIndex]]?.id).filter((id): id is string => id !== undefined))]
			.sort(compareAscii)
		const isCoherent = component !== undefined && component.pixelIndexes.length >= minimumComponentPopulation &&
			component.pixelIndexes.length / Math.max(1, neighborhood.length) >=
				ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPONENT_LOCAL_ENDPOINT_POLICY.minimumComponentModeShare
		const lineageEligible = component !== undefined && sourceFamilyIds.length > 0 &&
			sourceFamilyIds.every((id) => fieldFamilyIds.has(id)) && component.pixelIndexes.every((pixelIndex) =>
				evidence.families[evidence.familyAt[pixelIndex]] !== undefined)
		alternativeModes.push({
			prototype: mode.prototype,
			neighborhoodPopulation: mode.neighborhoodPopulation,
			neighborhoodFraction: mode.neighborhoodPopulation / Math.max(1, samples.length),
			largestComponentPopulation: component?.pixelIndexes.length ?? 0,
			largestComponentBandFraction: (component?.pixelIndexes.length ?? 0) / Math.max(1, samples.length),
			largestComponentModeFraction: (component?.pixelIndexes.length ?? 0) / Math.max(1, neighborhood.length),
			coherent: isCoherent,
			lineageEligible,
			sourceFamilyIds,
		})
		if (!component || !isCoherent) continue
		coherent.push({
			mode,
			component,
			measuredNeighborhoodPopulation: neighborhood.length,
			sourceFamilyIds,
			distanceFromExistingMode: okDistance(mode.prototype, existingMode!.prototype),
		})
	}
	const lineageEligible = coherent.filter(({ component, sourceFamilyIds }) =>
		sourceFamilyIds.length > 0 && sourceFamilyIds.every((id) => fieldFamilyIds.has(id)) &&
		component.pixelIndexes.every((pixelIndex) => evidence.families[evidence.familyAt[pixelIndex]] !== undefined))
		.sort((first, second) =>
			second.component.pixelIndexes.length - first.component.pixelIndexes.length ||
			second.mode.neighborhoodPopulation - first.mode.neighborhoodPopulation ||
			compareAscii(first.mode.key, second.mode.key) ||
			first.component.startPixelIndex - second.component.startPixelIndex)
	const selected: ComponentCandidate[] = []
	for (const candidate of lineageEligible) {
		if (selected.some(({ mode }) => okDistance(mode.prototype, candidate.mode.prototype) <
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.minimumOccupiedModeDistance)) continue
		selected.push(candidate)
		if (selected.length >=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPONENT_LOCAL_ENDPOINT_POLICY.maximumAdditiveFamiliesPerBand) break
	}
	const additiveFamilies = selected.flatMap((candidate):
		AlbumArtworkPaletteV2Phase3ComponentLocalEndpointFamily[] => {
		const component = candidate.component
		const familyId = `component-local-endpoint:${diagnostic.fieldDomainId}:${diagnostic.topology}:${diagnostic.direction}:${band.position}:${candidate.mode.key}:${component.startPixelIndex}`
		const prototype = componentPrototype(evidence, component.pixelIndexes)
		const family = materializeComponentLocalEndpointFamily(
			evidence,
			familyId,
			component.pixelIndexes,
			prototype,
		)
		if (!family) return []
		return [{
			family,
			lineage: {
				fieldDomainId: diagnostic.fieldDomainId,
				topology: diagnostic.topology,
				direction: diagnostic.direction,
				position: band.position,
				sourceFamilyIds: candidate.sourceFamilyIds,
				componentStartPixelIndex: component.startPixelIndex,
				ownedPixelCount: component.pixelIndexes.length,
			},
			mode: {
				prototype: candidate.mode.prototype,
				population: candidate.mode.population,
				populationFraction: candidate.mode.population / Math.max(1, samples.length),
				neighborhoodPopulation: candidate.mode.neighborhoodPopulation,
				neighborhoodFraction: candidate.mode.neighborhoodPopulation / Math.max(1, samples.length),
				distanceFromExistingMode: candidate.distanceFromExistingMode,
			},
			component: {
				population: component.pixelIndexes.length,
				bandFraction: component.pixelIndexes.length / Math.max(1, samples.length),
				neighborhoodPopulation: candidate.measuredNeighborhoodPopulation,
				modeFraction: component.pixelIndexes.length /
					Math.max(1, candidate.measuredNeighborhoodPopulation),
				minX: component.minX,
				minY: component.minY,
				maxX: component.maxX,
				maxY: component.maxY,
			},
		}]
	})
	return {
		position: band.position,
		spatialRange: band.spatialRange,
		ownedPixelCount: samples.length,
		detectedModeCount: modes.length,
		occupiedAlternativeModeCount: occupied.length,
		coherentAlternativeModeCount: coherent.length,
		lineageEligibleModeCount: lineageEligible.length,
		omittedFamilyCount: Math.max(0, lineageEligible.length - additiveFamilies.length),
		alternativeModes,
		additiveFamilies,
	}
}

function inspectComponentLocalEndpointModes(
	input: BandLocalEndpointRepresentationMechanismInput,
): AlbumArtworkPaletteV2Phase3ComponentLocalEndpointReport {
	const distinct = distinctFits(input.fits)
	const fits = distinct.map((fit): AlbumArtworkPaletteV2Phase3ComponentLocalEndpointFit => ({
		fieldDomainId: fit.diagnostic.fieldDomainId,
		topology: fit.diagnostic.topology,
		direction: fit.diagnostic.direction,
		eligibility: fit.eligibility,
		domainPopulation: fit.domainPopulation,
		bands: [inspectBand(input.evidence, fit, 0), inspectBand(input.evidence, fit, 1)],
	}))
	const bands = fits.flatMap(({ bands: fitBands }) => fitBands)
	return {
		mechanismId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPONENT_LOCAL_ENDPOINT_ID,
		inputEligibleFitCount: input.fits.length,
		inspectedFitCount: fits.length,
		inspectedBandCount: bands.length,
		additiveFamilyCount: bands.reduce((sum, band) => sum + band.additiveFamilies.length, 0),
		omittedFamilyCount: bands.reduce((sum, band) => sum + band.omittedFamilyCount, 0),
		fits,
	}
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_MECHANISM:
	BandLocalEndpointRepresentationMechanism<AlbumArtworkPaletteV2Phase3ComponentLocalEndpointReport> = Object.freeze({
		mechanismId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPONENT_LOCAL_ENDPOINT_ID,
		inspect: inspectComponentLocalEndpointModes,
	})

export function buildAlbumArtworkPaletteV2Phase3ComponentLocalEndpointArm(
	evidence: NativePaletteEvidence,
	diagnostics: readonly GradientFitDiagnostic[],
): AlbumArtworkPaletteV2Phase3ComponentLocalEndpointReport {
	return runBandLocalEndpointRepresentationMechanism(
		evidence,
		diagnostics,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_MECHANISM,
	)
}
