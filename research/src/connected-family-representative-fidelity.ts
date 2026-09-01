import { createHash } from "node:crypto"
import {
	buildConnectedFamilyCandidateAvailability,
	CONNECTED_FAMILY_CANDIDATE_AVAILABILITY_VERSION,
	CONNECTED_FAMILY_CANDIDATE_THRESHOLDS,
	type ConnectedFamilyCandidateProposal,
} from "./connected-family-candidate-availability.ts"
import { chroma, labAt, okDistance, rgbToHex, rgbToOKLab } from "./color.ts"
import type { PalettePerception } from "./palette-perception.ts"
import type { RegionAnalysis } from "./regions.ts"
import type { OKLab, RGB } from "./types.ts"

export const CONNECTED_FAMILY_REPRESENTATIVE_FIDELITY_VERSION =
	"connected-family-representative-fidelity-0.1.0-development"

export type ComponentLocalExactRepresentative = {
	stableKey: string
	sourceRegionId: number | null
	supportPixelCount: number
	supportMaskSha256: string
	binIds: readonly number[]
	center: OKLab
	representativePixelIndex: number
	rgb: RGB
	lab: OKLab
	hex: string
	chroma: number
	distanceToCenter: number
	membership: {
		field: false
		overlay: true
	}
	get supportMask(): Uint8Array
}

export type ConnectedFamilyFidelityComponent = {
	stableKey: string
	firstPixelIndex: number
	pixelCount: number
	population: number
	maskSha256: string
	representatives: readonly ComponentLocalExactRepresentative[]
	get mask(): Uint8Array
}

export type ConnectedFamilyFidelityFamily = {
	stableKey: string
	availabilityStableKey: string
	anchorIndex: number
	anchorDegrees: number
	binIds: readonly number[]
	maskSha256: string
	population: number
	componentFirstPixelIndices: readonly number[]
	availabilityRepresentative: {
		center: OKLab
		representativePixelIndex: number
		rgb: RGB
		lab: OKLab
		hex: string
		distanceToFamilyCenter: number
	}
	components: readonly ConnectedFamilyFidelityComponent[]
	get mask(): Uint8Array
}

export type ConnectedFamilyRepresentativeFidelity = {
	version: typeof CONNECTED_FAMILY_REPRESENTATIVE_FIDELITY_VERSION
	availabilityVersion: typeof CONNECTED_FAMILY_CANDIDATE_AVAILABILITY_VERSION
	families: readonly ConnectedFamilyFidelityFamily[]
	diagnostics: {
		familyCount: number
		connectedComponentCount: number
		localRepresentativeCount: number
		multiRepresentativeFamilyCount: number
	}
	invariants: {
		readOnly: true
		familyMasksUnchanged: true
		exactSourcePixelsOnly: true
		lloydPartitionUntouched: true
		representativesOverlayOnly: true
		representativesNotPassedToRoleSolver: true
		targetColorsInferred: false
	}
}

type PixelComponent = {
	firstPixelIndex: number
	pixels: number[]
	mask: Uint8Array
}

const thresholds = CONNECTED_FAMILY_CANDIDATE_THRESHOLDS

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function sourceRgb(data: Uint8Array, pixel: number): RGB {
	const offset = pixel * 3
	return [data[offset], data[offset + 1], data[offset + 2]]
}

function components(mask: Uint8Array, width: number, height: number): PixelComponent[] {
	const visited = new Uint8Array(mask.length)
	const output: PixelComponent[] = []
	for (let start = 0; start < mask.length; start++) {
		if (!mask[start] || visited[start]) continue
		const stack = [start]
		const pixels: number[] = []
		visited[start] = 1
		while (stack.length > 0) {
			const pixel = stack.pop()!
			const x = pixel % width
			const y = Math.floor(pixel / width)
			pixels.push(pixel)
			for (const neighbor of [
				x > 0 ? pixel - 1 : -1,
				x + 1 < width ? pixel + 1 : -1,
				y > 0 ? pixel - width : -1,
				y + 1 < height ? pixel + width : -1,
			]) {
				if (neighbor >= 0 && mask[neighbor] && !visited[neighbor]) {
					visited[neighbor] = 1
					stack.push(neighbor)
				}
			}
		}
		pixels.sort((first, second) => first - second)
		const componentMask = new Uint8Array(mask.length)
		for (const pixel of pixels) componentMask[pixel] = 1
		output.push({ firstPixelIndex: start, pixels, mask: componentMask })
	}
	return output
}

function centerOfPixels(labs: Float32Array, pixels: readonly number[]): OKLab {
	let lightness = 0
	let a = 0
	let b = 0
	for (const pixel of pixels) {
		const lab = labAt(labs, pixel)
		lightness += lab[0]
		a += lab[1]
		b += lab[2]
	}
	return [lightness / pixels.length, a / pixels.length, b / pixels.length]
}

function nearestPixel(labs: Float32Array, pixels: readonly number[], center: OKLab): number {
	let selected = -1
	let selectedDistance = Infinity
	for (const pixel of pixels) {
		const distance = okDistance(labAt(labs, pixel), center)
		if (distance < selectedDistance) {
			selected = pixel
			selectedDistance = distance
		}
	}
	if (selected < 0) throw new Error("Connected family local mode lacks an exact representative")
	return selected
}

function localRepresentative(
	familyKey: string,
	componentFirstPixelIndex: number,
	sourceRegionId: number | null,
	pixels: readonly number[],
	totalPixels: number,
	data: Uint8Array,
	labs: Float32Array,
	pixelBinIds: Int32Array,
): ComponentLocalExactRepresentative {
	const supportMask = new Uint8Array(totalPixels)
	for (const pixel of pixels) supportMask[pixel] = 1
	const supportMaskSha256 = sha256(supportMask)
	const center = centerOfPixels(labs, pixels)
	const representativePixelIndex = nearestPixel(labs, pixels, center)
	const rgb = sourceRgb(data, representativePixelIndex)
	const lab = rgbToOKLab(rgb)
	const regionKey = sourceRegionId === null ? "fallback" : sourceRegionId.toString().padStart(8, "0")
	const stableKey = `${familyKey}:component-${componentFirstPixelIndex.toString().padStart(12, "0")}:` +
		`region-${regionKey}:${representativePixelIndex.toString().padStart(12, "0")}:${supportMaskSha256}`
	const binIds = [...new Set(pixels.map((pixel) => pixelBinIds[pixel]))].sort((first, second) => first - second)
	Object.freeze(binIds)
	Object.freeze(center)
	Object.freeze(rgb)
	Object.freeze(lab)
	return Object.freeze({
		stableKey,
		sourceRegionId,
		supportPixelCount: pixels.length,
		supportMaskSha256,
		binIds,
		center,
		representativePixelIndex,
		rgb,
		lab,
		hex: rgbToHex(rgb),
		chroma: chroma(lab),
		distanceToCenter: okDistance(lab, center),
		membership: Object.freeze({ field: false as const, overlay: true as const }),
		get supportMask(): Uint8Array { return new Uint8Array(supportMask) },
	})
}

function fidelityFamily(
	proposal: ConnectedFamilyCandidateProposal,
	analysis: RegionAnalysis,
	pixelBinIds: Int32Array,
): ConnectedFamilyFidelityFamily {
	const familyMask = proposal.mask
	if (sha256(familyMask) !== proposal.maskSha256) throw new Error(`Connected family mask changed: ${proposal.stableKey}`)
	const familyKey = `connected-family:${proposal.anchorIndex.toString().padStart(2, "0")}:${proposal.maskSha256}`
	const connected = components(familyMask, analysis.width, analysis.height)
	const firstPixels = connected.map((component) => component.firstPixelIndex)
	if (JSON.stringify(firstPixels) !== JSON.stringify(proposal.componentFirstPixelIndices)) {
		throw new Error(`Connected family component identity changed: ${proposal.stableKey}`)
	}
	const componentRecords = connected.map((component): ConnectedFamilyFidelityComponent => {
		const regionPixels = new Map<number, number[]>()
		for (const pixel of component.pixels) {
			const regionId = analysis.labels[pixel]
			const pixels = regionPixels.get(regionId) ?? []
			pixels.push(pixel)
			regionPixels.set(regionId, pixels)
		}
		const qualifyingModes = [...regionPixels].filter(([regionId, pixels]) => {
			const region = analysis.regions[regionId]
			return pixels.length >= thresholds.minimumComponentPixels &&
				(region.saliency >= thresholds.minimumComponentSaliency || region.text >= thresholds.minimumComponentTypography)
		}).sort((first, second) => first[0] - second[0])
		const modeInputs: Array<readonly [number | null, readonly number[]]> = qualifyingModes.length > 0
			? qualifyingModes
			: [[null, component.pixels]]
		const representatives = modeInputs.map(([regionId, pixels]) => localRepresentative(
			familyKey,
			component.firstPixelIndex,
			regionId,
			pixels,
			familyMask.length,
			analysis.data,
			analysis.labs,
			pixelBinIds,
		)).sort((first, second) => (first.sourceRegionId ?? Infinity) - (second.sourceRegionId ?? Infinity) ||
			first.representativePixelIndex - second.representativePixelIndex || compareAscii(first.stableKey, second.stableKey))
		Object.freeze(representatives)
		const componentMask = new Uint8Array(component.mask)
		return Object.freeze({
			stableKey: `${familyKey}:component-${component.firstPixelIndex.toString().padStart(12, "0")}:${sha256(componentMask)}`,
			firstPixelIndex: component.firstPixelIndex,
			pixelCount: component.pixels.length,
			population: component.pixels.length / familyMask.length,
			maskSha256: sha256(componentMask),
			representatives,
			get mask(): Uint8Array { return new Uint8Array(componentMask) },
		})
	})
	Object.freeze(componentRecords)
	const componentFirstPixelIndices = [...proposal.componentFirstPixelIndices]
	const binIds = [...proposal.binIds]
	Object.freeze(componentFirstPixelIndices)
	Object.freeze(binIds)
	const availabilityCenter = [...proposal.center] as OKLab
	const availabilityRgb = [...proposal.rgb] as RGB
	const availabilityLab = [...proposal.lab] as OKLab
	Object.freeze(availabilityCenter)
	Object.freeze(availabilityRgb)
	Object.freeze(availabilityLab)
	return Object.freeze({
		stableKey: familyKey,
		availabilityStableKey: proposal.stableKey,
		anchorIndex: proposal.anchorIndex,
		anchorDegrees: proposal.anchorDegrees,
		binIds,
		maskSha256: proposal.maskSha256,
		population: proposal.population,
		componentFirstPixelIndices,
		availabilityRepresentative: Object.freeze({
			center: availabilityCenter,
			representativePixelIndex: proposal.representativePixelIndex,
			rgb: availabilityRgb,
			lab: availabilityLab,
			hex: proposal.hex,
			distanceToFamilyCenter: okDistance(availabilityLab, availabilityCenter),
		}),
		components: componentRecords,
		get mask(): Uint8Array { return new Uint8Array(familyMask) },
	})
}

export function buildConnectedFamilyRepresentativeFidelity(
	perception: PalettePerception,
): ConnectedFamilyRepresentativeFidelity {
	const beforeCandidates = JSON.stringify(perception.candidates)
	const beforeRecords = perception.candidateRecords.map((record) => ({
		candidateId: record.candidateId,
		binIds: [...record.binIds],
		maskSha256: sha256(record.mask),
		representativePixelIndex: record.representativePixelIndex,
	}))
	const availability = buildConnectedFamilyCandidateAvailability(perception)
	const analysis = perception.analysis
	const pixelBinIds = perception.pixelBinIds
	const families = availability.proposals.map((proposal) => fidelityFamily(proposal, analysis, pixelBinIds))
		.sort((first, second) => compareAscii(first.stableKey, second.stableKey))
	Object.freeze(families)
	const afterRecords = perception.candidateRecords.map((record) => ({
		candidateId: record.candidateId,
		binIds: [...record.binIds],
		maskSha256: sha256(record.mask),
		representativePixelIndex: record.representativePixelIndex,
	}))
	if (JSON.stringify(perception.candidates) !== beforeCandidates ||
		JSON.stringify(afterRecords) !== JSON.stringify(beforeRecords)) {
		throw new Error("Connected family representative fidelity mutated palette perception")
	}
	const connectedComponentCount = families.reduce((sum, family) => sum + family.components.length, 0)
	const localRepresentativeCount = families.reduce((sum, family) => sum + family.components.reduce(
		(componentSum, component) => componentSum + component.representatives.length,
		0,
	), 0)
	return Object.freeze({
		version: CONNECTED_FAMILY_REPRESENTATIVE_FIDELITY_VERSION,
		availabilityVersion: CONNECTED_FAMILY_CANDIDATE_AVAILABILITY_VERSION,
		families,
		diagnostics: Object.freeze({
			familyCount: families.length,
			connectedComponentCount,
			localRepresentativeCount,
			multiRepresentativeFamilyCount: families.filter((family) =>
				family.components.reduce((sum, component) => sum + component.representatives.length, 0) > 1).length,
		}),
		invariants: Object.freeze({
			readOnly: true,
			familyMasksUnchanged: true,
			exactSourcePixelsOnly: true,
			lloydPartitionUntouched: true,
			representativesOverlayOnly: true,
			representativesNotPassedToRoleSolver: true,
			targetColorsInferred: false,
		}),
	})
}
