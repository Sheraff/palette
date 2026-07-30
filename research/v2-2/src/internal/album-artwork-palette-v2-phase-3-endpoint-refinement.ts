import type { ColorFamilyEvidence, ColorRepresentative, ComponentEvidence, GradientDirection, GradientFitDiagnostic, GradientTopology, NativePaletteEvidence, RegionObservation, RegionRoleFactors, SourceSupportRecord } from "./album-artwork-palette-v2.ts";

import { chroma, labAt, okDistance, oklabToRGB, rgbAt, rgbToHex, rgbToOKLab } from "./color.ts";

import type { OKLab, RGB } from "./types.ts";

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_ATTEMPT_ID =
	"wave-1-band-local-endpoint-refinement" as const

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY = Object.freeze({
	endpointBandFraction: 0.2,
	modeBinStep: 0.01,
	modeNeighborhoodRadius: 0.018,
	supportNeighborhoodRadius: 0.018,
	maximumSynthesizedOccupiedDistance: 0.01,
	minimumEndpointDistance: 0.028,
	minimumOccupiedModeDistance: 0.028,
	minimumFamilyBandShare: 0.015,
	minimumModeShare: 0.04,
	minimumLargestComponentShare: 0.08,
	robustRetainedFraction: 0.9,
	maximumRetainedModes: 3,
	maximumRetainedComponents: 8,
})

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_REFINABLE_UPSTREAM_REASON =
	"same-family native within-band dispersion exceeds 0.16 of transition span"

export type BandLocalEndpointMode = Readonly<{
	prototype: OKLab
	exemplar: Readonly<{ rgb: RGB; x: number; y: number }>
	population: number
	populationFraction: number
	neighborhoodPopulation: number
	neighborhoodFraction: number
}>

export type BandLocalEndpointDistribution = Readonly<{
	position: "low" | "high"
	spatialRange: readonly [number, number]
	spatialBandPopulation: number
	parentFamilyPopulation: number
	parentFamilyBandShare: number
	populationFraction: number
	robustPrototype: OKLab
	robustRetainedPopulation: number
	robustSpread: number
	componentCount: number
	largestComponentPopulation: number
	localModes: readonly BandLocalEndpointMode[]
}>

export type BandLocalEndpointRepresentativeChoices = Readonly<{
	denseExact: ColorRepresentative
	nearestRobustPrototype: ColorRepresentative
	densityConstrainedSynthesis: ColorRepresentative | null
}>

export type BandLocalEndpoint = Readonly<{
	position: "low" | "high"
	parentFamilyId: string
	family: ColorFamilyEvidence
	distribution: BandLocalEndpointDistribution
	representatives: BandLocalEndpointRepresentativeChoices
}>

export type BandLocalEndpointRefinement = Readonly<{
	id: string
	fit: Readonly<{
		fieldDomainId: string
		topology: GradientTopology
		direction: GradientDirection
		span: number
		progression: number
		monotonicity: number
		residual: number
	}>
	parentFamilyId: string | null
	accepted: boolean
	rejectionReasons: readonly string[]
	domainPopulation: number
	endpointDistance: number
	occupiedModeDistance: number
	low: BandLocalEndpoint | null
	high: BandLocalEndpoint | null
}>

export type BandLocalEndpointRefinementReport = Readonly<{
	attemptId: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_ATTEMPT_ID
	evaluatedFitCount: number
	sameFamilyFitCount: number
	acceptedCount: number
	rejectedCount: number
	refinements: readonly BandLocalEndpointRefinement[]
}>

export type BandLocalEndpointRepresentationMechanismEligibility = "accepted" | "refinable"

export type BandLocalEndpointRepresentationMechanismBand = Readonly<{
	position: "low" | "high"
	spatialRange: readonly [number, number]
	pixelIndexes: readonly number[]
}>

export type BandLocalEndpointRepresentationMechanismFit = Readonly<{
	diagnostic: GradientFitDiagnostic
	eligibility: BandLocalEndpointRepresentationMechanismEligibility
	domainPopulation: number
	bands: readonly [
		BandLocalEndpointRepresentationMechanismBand,
		BandLocalEndpointRepresentationMechanismBand,
	]
}>

export type BandLocalEndpointRepresentationMechanismInput = Readonly<{
	evidence: NativePaletteEvidence
	fits: readonly BandLocalEndpointRepresentationMechanismFit[]
}>

export type BandLocalEndpointRepresentationMechanism<TResult> = Readonly<{
	mechanismId: string
	inspect: (input: BandLocalEndpointRepresentationMechanismInput) => TResult
}>

type Domain = Readonly<{
	pixelIndexes: Uint32Array
	meanColor: OKLab
}>

export type BandLocalEndpointPixelSample = Readonly<{
	pixelIndex: number
	lab: OKLab
	rgb: RGB
}>

type Sample = BandLocalEndpointPixelSample

export type BandLocalEndpointDetectedMode = Readonly<{
	key: string
	prototype: OKLab
	pixelIndexes: readonly number[]
	population: number
	neighborhoodPopulation: number
}>

type LocalMode = BandLocalEndpointDetectedMode

type MeasuredComponent = Readonly<{
	id: string
	startPixelIndex: number
	pixelIndexes: readonly number[]
	population: number
	minX: number
	minY: number
	maxX: number
	maxY: number
	borderPixels: number
	boundaryEdges: number
	boundaryContrastSum: number
	boundaryLightnessDeltaSum: number
	boundaryAbsoluteLightnessDeltaSum: number
}>

type MeasuredBand = Readonly<{
	endpoint: BandLocalEndpoint | null
	rejectionReasons: readonly string[]
}>

function clamp(value: number, minimum = 0, maximum = 1): number {
	return Math.max(minimum, Math.min(maximum, value))
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function compareRgb(first: RGB, second: RGB): number {
	return first[0] - second[0] || first[1] - second[1] || first[2] - second[2]
}

function sameRgb(first: RGB, second: RGB): boolean {
	return compareRgb(first, second) === 0
}

function median(values: readonly number[]): number {
	if (values.length === 0) return 0
	const sorted = [...values].sort((first, second) => first - second)
	const middle = Math.floor(sorted.length / 2)
	return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function meanLab(samples: readonly Sample[]): OKLab {
	const sums = samples.reduce((sum, sample) => [
		sum[0] + sample.lab[0],
		sum[1] + sample.lab[1],
		sum[2] + sample.lab[2],
	] as [number, number, number], [0, 0, 0])
	return [sums[0] / samples.length, sums[1] / samples.length, sums[2] / samples.length]
}

function robustPrototype(samples: readonly Sample[]): Readonly<{
	prototype: OKLab
	retainedPopulation: number
	spread: number
}> {
	const center: OKLab = [
		median(samples.map(({ lab }) => lab[0])),
		median(samples.map(({ lab }) => lab[1])),
		median(samples.map(({ lab }) => lab[2])),
	]
	const retainedPopulation = Math.max(1, Math.ceil(
		samples.length * ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.robustRetainedFraction,
	))
	const retained = [...samples]
		.sort((first, second) =>
			okDistance(first.lab, center) - okDistance(second.lab, center) ||
			compareRgb(first.rgb, second.rgb) || first.pixelIndex - second.pixelIndex)
		.slice(0, retainedPopulation)
	const prototype = meanLab(retained)
	const spread = Math.sqrt(retained.reduce((sum, sample) =>
		sum + okDistance(sample.lab, prototype) ** 2, 0) / retained.length)
	return { prototype, retainedPopulation, spread }
}

function familyIndexById(evidence: NativePaletteEvidence, familyId: string): number {
	return evidence.families.findIndex(({ id }) => id === familyId)
}

function connectedDomain(evidence: NativePaletteEvidence, start: number): Domain | null {
	if (!Number.isSafeInteger(start) || start < 0 || start >= evidence.pixelCount) return null
	const fieldIds = new Set(evidence.lanes.find(({ name }) => name === "field")?.familyIds ?? [])
	const startFamily = evidence.families[evidence.familyAt[start]]
	if (!startFamily || !fieldIds.has(startFamily.id)) return null
	const smoothAdjacencies = new Set(evidence.adjacencies
		.filter(({ meanContrast }) => meanContrast <= evidence.familyAnchorRadius)
		.map(({ firstFamilyId, secondFamilyId }) => [firstFamilyId, secondFamilyId].sort(compareAscii).join(":")))
	const visited = new Uint8Array(evidence.pixelCount)
	const queue = new Int32Array(evidence.pixelCount)
	let read = 0
	let length = 1
	queue[0] = start
	visited[start] = 1
	let sumL = 0
	let sumA = 0
	let sumB = 0
	while (read < length) {
		const pixelIndex = queue[read++]
		const x = pixelIndex % evidence.width
		const family = evidence.families[evidence.familyAt[pixelIndex]]
		const lab = labAt(evidence.labs, pixelIndex)
		sumL += lab[0]
		sumA += lab[1]
		sumB += lab[2]
		const neighbors = [
			x > 0 ? pixelIndex - 1 : -1,
			x + 1 < evidence.width ? pixelIndex + 1 : -1,
			pixelIndex >= evidence.width ? pixelIndex - evidence.width : -1,
			pixelIndex + evidence.width < evidence.pixelCount ? pixelIndex + evidence.width : -1,
		]
		for (const neighbor of neighbors) {
			if (neighbor < 0 || visited[neighbor]) continue
			const neighborFamily = evidence.families[evidence.familyAt[neighbor]]
			if (!fieldIds.has(neighborFamily.id)) continue
			const adjacencyKey = [family.id, neighborFamily.id].sort(compareAscii).join(":")
			if (family.id !== neighborFamily.id && (
				!smoothAdjacencies.has(adjacencyKey) ||
				okDistance(lab, labAt(evidence.labs, neighbor)) > evidence.familyAnchorRadius
			)) continue
			visited[neighbor] = 1
			queue[length++] = neighbor
		}
	}
	return {
		pixelIndexes: Uint32Array.from(queue.subarray(0, length)),
		meanColor: [sumL / length, sumA / length, sumB / length],
	}
}

function segmentAmount(value: OKLab, first: OKLab, second: OKLab): number {
	const delta: OKLab = [second[0] - first[0], second[1] - first[1], second[2] - first[2]]
	const denominator = delta[0] ** 2 + delta[1] ** 2 + delta[2] ** 2
	return denominator <= 1e-12
		? 0
		: clamp(((value[0] - first[0]) * delta[0] + (value[1] - first[1]) * delta[1] +
			(value[2] - first[2]) * delta[2]) / denominator)
}

function distanceToSegment(value: OKLab, first: OKLab, second: OKLab): number {
	const amount = segmentAmount(value, first, second)
	return okDistance(value, [
		first[0] + (second[0] - first[0]) * amount,
		first[1] + (second[1] - first[1]) * amount,
		first[2] + (second[2] - first[2]) * amount,
	])
}

function pairedDomain(evidence: NativePaletteEvidence, id: string): Domain | null {
	const domainParts = id.slice("paired-field-domain:".length).split("+")
	if (domainParts.length !== 2) return null
	const sources = domainParts.map((domainPart) => {
		const match = /^field-domain-(\d+)$/u.exec(domainPart)
		return match ? connectedDomain(evidence, Number(match[1])) : null
	})
	const first = sources[0]
	const second = sources[1]
	if (!first || !second) return null
	const visited = new Uint8Array(evidence.pixelCount)
	const queue = new Int32Array(evidence.pixelCount)
	let read = 0
	let length = 0
	for (const pixelIndex of first.pixelIndexes) {
		if (visited[pixelIndex]) continue
		visited[pixelIndex] = 1
		queue[length++] = pixelIndex
	}
	let sumL = 0
	let sumA = 0
	let sumB = 0
	while (read < length) {
		const pixelIndex = queue[read++]
		const lab = labAt(evidence.labs, pixelIndex)
		sumL += lab[0]
		sumA += lab[1]
		sumB += lab[2]
		const x = pixelIndex % evidence.width
		const neighbors = [
			x > 0 ? pixelIndex - 1 : -1,
			x + 1 < evidence.width ? pixelIndex + 1 : -1,
			pixelIndex >= evidence.width ? pixelIndex - evidence.width : -1,
			pixelIndex + evidence.width < evidence.pixelCount ? pixelIndex + evidence.width : -1,
		]
		for (const neighbor of neighbors) {
			if (neighbor < 0 || visited[neighbor] ||
				distanceToSegment(labAt(evidence.labs, neighbor), first.meanColor, second.meanColor) > 0.08) continue
			visited[neighbor] = 1
			queue[length++] = neighbor
		}
	}
	return {
		pixelIndexes: Uint32Array.from(queue.subarray(0, length)),
		meanColor: [sumL / length, sumA / length, sumB / length],
	}
}

function reconstructDomain(evidence: NativePaletteEvidence, id: string): Domain | null {
	const connected = /^field-domain-(\d+)$/u.exec(id)
	if (connected) return connectedDomain(evidence, Number(connected[1]))
	if (id.startsWith("paired-field-domain:")) return pairedDomain(evidence, id)
	return null
}

function rawGradientPosition(topology: GradientTopology, direction: GradientDirection): (x: number, y: number) => number {
	if (topology === "radial-center") return (x, y) => clamp(Math.hypot(x - 0.5, y - 0.5) / Math.SQRT1_2)
	if (topology === "radial-upper-center") return (x, y) => clamp(Math.hypot(x - 0.5, y - 0.35) / 0.82)
	if (direction === "center-0.35-0.50") return (x, y) => Math.hypot(x - 0.35, y - 0.5)
	if (direction === "center-0.65-0.50") return (x, y) => Math.hypot(x - 0.65, y - 0.5)
	if (direction === "center-0.50-0.65") return (x, y) => Math.hypot(x - 0.5, y - 0.65)
	if (direction === "horizontal") return (x) => x
	if (direction === "vertical") return (_x, y) => y
	if (direction === "diagonal-down") return (x, y) => (x + y) / 2
	if (direction === "diagonal-up") return (x, y) => (x + 1 - y) / 2
	const degrees = Number(direction.slice("angle-".length))
	const angle = degrees * Math.PI / 180
	return (x, y) => Math.cos(angle) * x + Math.sin(angle) * y
}

function positionedDomain(
	evidence: NativePaletteEvidence,
	domain: Domain,
	diagnostic: GradientFitDiagnostic,
): ReadonlyArray<Readonly<{ pixelIndex: number; position: number }>> {
	const rawPosition = rawGradientPosition(diagnostic.topology, diagnostic.direction)
	const positioned = [...domain.pixelIndexes].map((pixelIndex) => {
		const x = (pixelIndex % evidence.width) / Math.max(1, evidence.width - 1)
		const y = Math.floor(pixelIndex / evidence.width) / Math.max(1, evidence.height - 1)
		return { pixelIndex, raw: rawPosition(x, y) }
	})
	let minimum = Infinity
	let maximum = -Infinity
	for (const { raw } of positioned) {
		minimum = Math.min(minimum, raw)
		maximum = Math.max(maximum, raw)
	}
	const span = maximum - minimum
	return positioned.map(({ pixelIndex, raw }) => ({
		pixelIndex,
		position: span <= 1e-12 ? 0.5 : clamp((raw - minimum) / span),
	}))
}

function modeKey(lab: OKLab): string {
	const step = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.modeBinStep
	return `${Math.floor(lab[0] / step)},${Math.floor((lab[1] + 0.5) / step)},${Math.floor((lab[2] + 0.5) / step)}`
}

function localModes(samples: readonly Sample[], robust: OKLab): LocalMode[] {
	type MutableMode = { key: string; sum: [number, number, number]; pixelIndexes: number[] }
	const byKey = new Map<string, MutableMode>()
	for (const sample of samples) {
		const key = modeKey(sample.lab)
		const existing = byKey.get(key)
		if (existing) {
			existing.sum[0] += sample.lab[0]
			existing.sum[1] += sample.lab[1]
			existing.sum[2] += sample.lab[2]
			existing.pixelIndexes.push(sample.pixelIndex)
		} else {
			byKey.set(key, { key, sum: [sample.lab[0], sample.lab[1], sample.lab[2]], pixelIndexes: [sample.pixelIndex] })
		}
	}
	const modes = [...byKey.values()].map((mode) => ({
		...mode,
		prototype: [
			mode.sum[0] / mode.pixelIndexes.length,
			mode.sum[1] / mode.pixelIndexes.length,
			mode.sum[2] / mode.pixelIndexes.length,
		] as OKLab,
		population: mode.pixelIndexes.length,
	}))
	return modes.map((mode): LocalMode => ({
		key: mode.key,
		prototype: mode.prototype,
		pixelIndexes: mode.pixelIndexes,
		population: mode.population,
		neighborhoodPopulation: modes.reduce((sum, candidate) => sum + (
			okDistance(mode.prototype, candidate.prototype) <=
				ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.modeNeighborhoodRadius
				? candidate.population : 0
		), 0),
	})).sort((first, second) =>
		second.neighborhoodPopulation - first.neighborhoodPopulation ||
		second.population - first.population ||
		okDistance(first.prototype, robust) - okDistance(second.prototype, robust) ||
		compareAscii(first.key, second.key))
}

function distinctModes(modes: readonly LocalMode[]): LocalMode[] {
	const retained: LocalMode[] = []
	for (const mode of modes) {
		if (retained.some((candidate) => okDistance(mode.prototype, candidate.prototype) <
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.modeNeighborhoodRadius)) continue
		retained.push(mode)
		if (retained.length >= ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.maximumRetainedModes) break
	}
	return retained.length > 0 ? retained : modes.slice(0, 1)
}

export function detectDistinctBandLocalEndpointModes(
	samples: readonly BandLocalEndpointPixelSample[],
): readonly BandLocalEndpointDetectedMode[] {
	if (samples.length === 0) return []
	return distinctModes(localModes(samples, robustPrototype(samples).prototype))
}

function nearestSample(samples: readonly Sample[], target: OKLab, allowed?: ReadonlySet<number>): Sample {
	return [...samples]
		.filter(({ pixelIndex }) => allowed === undefined || allowed.has(pixelIndex))
		.sort((first, second) =>
			okDistance(first.lab, target) - okDistance(second.lab, target) ||
			compareRgb(first.rgb, second.rgb) || first.pixelIndex - second.pixelIndex)[0]
}

function measureComponents(
	evidence: NativePaletteEvidence,
	pixelIndexes: readonly number[],
	familyId: string,
): Readonly<{ components: readonly MeasuredComponent[]; componentIdAt: ReadonlyMap<number, string> }> {
	const membership = new Uint8Array(evidence.pixelCount)
	for (const pixelIndex of pixelIndexes) membership[pixelIndex] = 1
	const visited = new Uint8Array(evidence.pixelCount)
	const componentIdAt = new Map<number, string>()
	const queue = new Int32Array(pixelIndexes.length)
	const components: MeasuredComponent[] = []
	for (const start of [...pixelIndexes].sort((first, second) => first - second)) {
		if (visited[start]) continue
		let read = 0
		let length = 1
		queue[0] = start
		visited[start] = 1
		let minX = evidence.width
		let minY = evidence.height
		let maxX = 0
		let maxY = 0
		let borderPixels = 0
		let boundaryEdges = 0
		let boundaryContrastSum = 0
		let boundaryLightnessDeltaSum = 0
		let boundaryAbsoluteLightnessDeltaSum = 0
		while (read < length) {
			const pixelIndex = queue[read++]
			const x = pixelIndex % evidence.width
			const y = Math.floor(pixelIndex / evidence.width)
			minX = Math.min(minX, x)
			minY = Math.min(minY, y)
			maxX = Math.max(maxX, x)
			maxY = Math.max(maxY, y)
			if (x === 0 || y === 0 || x === evidence.width - 1 || y === evidence.height - 1) borderPixels += 1
			const neighbors = [
				x > 0 ? pixelIndex - 1 : -1,
				x + 1 < evidence.width ? pixelIndex + 1 : -1,
				y > 0 ? pixelIndex - evidence.width : -1,
				y + 1 < evidence.height ? pixelIndex + evidence.width : -1,
			]
			for (const neighbor of neighbors) {
				if (neighbor >= 0 && membership[neighbor] && !visited[neighbor]) {
					visited[neighbor] = 1
					queue[length++] = neighbor
				} else if (neighbor >= 0 && !membership[neighbor]) {
					const currentLab = labAt(evidence.labs, pixelIndex)
					const neighborLab = labAt(evidence.labs, neighbor)
					const lightnessDelta = neighborLab[0] - currentLab[0]
					boundaryEdges += 1
					boundaryContrastSum += okDistance(currentLab, neighborLab)
					boundaryLightnessDeltaSum += lightnessDelta
					boundaryAbsoluteLightnessDeltaSum += Math.abs(lightnessDelta)
				}
			}
		}
		const id = `${familyId}-region-${start}`
		const indexes = [...queue.subarray(0, length)]
		for (const pixelIndex of indexes) componentIdAt.set(pixelIndex, id)
		components.push({
			id,
			startPixelIndex: start,
			pixelIndexes: indexes,
			population: length,
			minX,
			minY,
			maxX,
			maxY,
			borderPixels,
			boundaryEdges,
			boundaryContrastSum,
			boundaryLightnessDeltaSum,
			boundaryAbsoluteLightnessDeltaSum,
		})
	}
	return {
		components: components.sort((first, second) =>
			second.population - first.population || first.startPixelIndex - second.startPixelIndex),
		componentIdAt,
	}
}

function roleFactors(
	geometry: number,
	fill: number,
	localContrast: number,
	borderInterior: number,
	sourceSupport: number,
): RegionRoleFactors {
	return {
		geometry,
		fill,
		repetition: 0,
		localContrast,
		borderInterior,
		sourceSupport,
		score: 0,
	}
}

function componentEvidence(
	component: MeasuredComponent,
	familyPopulation: number,
	evidence: NativePaletteEvidence,
): ComponentEvidence {
	const width = component.maxX - component.minX + 1
	const height = component.maxY - component.minY + 1
	const bounds = width * height
	const fill = component.population / Math.max(1, bounds)
	const boundsFraction = bounds / evidence.pixelCount
	const localContrast = component.boundaryContrastSum / Math.max(1, component.boundaryEdges)
	const contrastFactor = clamp(localContrast / 0.16)
	const borderContact = component.borderPixels / component.population
	const borderInterior = 1 - clamp(borderContact / 0.25)
	const resolved = clamp(Math.log2(component.population + 1) / 8)
	const geometry = Math.sqrt(resolved * (1 - clamp(boundsFraction / 0.18)))
	const sourceSupport = clamp(component.population / evidence.pixelCount / 0.002)
	const observation: RegionObservation = {
		widthFraction: width / evidence.width,
		heightFraction: height / evidence.height,
		boundsFraction,
		elongation: Math.max(width, height) / Math.max(1, Math.min(width, height)),
		fill,
		repetition: 0,
		localContrast,
		boundaryLightnessContrast: component.boundaryAbsoluteLightnessDeltaSum / Math.max(1, component.boundaryEdges),
		boundaryLightnessPolarity: component.boundaryAbsoluteLightnessDeltaSum <= 1e-12
			? 0 : component.boundaryLightnessDeltaSum / component.boundaryAbsoluteLightnessDeltaSum,
		borderContact,
		interiorMargin: Math.min(
			component.minX / Math.max(1, evidence.width - 1),
			component.minY / Math.max(1, evidence.height - 1),
			(evidence.width - 1 - component.maxX) / Math.max(1, evidence.width - 1),
			(evidence.height - 1 - component.maxY) / Math.max(1, evidence.height - 1),
		),
		componentFamilyFraction: component.population / familyPopulation,
		foregroundTypography: roleFactors(geometry, clamp(fill / 0.12), contrastFactor, borderInterior, sourceSupport),
		signatureAccent: roleFactors(geometry, clamp(fill / 0.12), contrastFactor, borderInterior, sourceSupport),
	}
	return {
		id: component.id,
		startPixelIndex: component.startPixelIndex,
		population: component.population,
		populationFraction: component.population / evidence.pixelCount,
		minX: component.minX,
		minY: component.minY,
		maxX: component.maxX,
		maxY: component.maxY,
		borderPixels: component.borderPixels,
		retainedFor: ["connected-support"],
		observation,
	}
}

function supportForRepresentative(
	evidence: NativePaletteEvidence,
	samples: readonly Sample[],
	components: readonly MeasuredComponent[],
	componentIdAt: ReadonlyMap<number, string>,
	familyId: string,
	prototype: OKLab,
	representativeLab: OKLab,
	exemplarIndex: number | null,
	synthesized: boolean,
): SourceSupportRecord {
	const radius = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.supportNeighborhoodRadius
	const local = samples.filter(({ lab }) => okDistance(lab, representativeLab) <= radius)
	const localByComponent = new Map<string, number>()
	const retainedComponentIds = new Set(components.map(({ id }) => id))
	let quadrants = 0
	for (const sample of local) {
		const componentId = componentIdAt.get(sample.pixelIndex)
		if (componentId && retainedComponentIds.has(componentId)) {
			localByComponent.set(componentId, (localByComponent.get(componentId) ?? 0) + 1)
		}
		const x = sample.pixelIndex % evidence.width
		const y = Math.floor(sample.pixelIndex / evidence.width)
		quadrants |= 1 << ((x >= evidence.width / 2 ? 1 : 0) + (y >= evidence.height / 2 ? 2 : 0))
	}
	let largestConnected = 0
	for (const population of localByComponent.values()) largestConnected = Math.max(largestConnected, population)
	let occupiedDistance = Infinity
	for (const { lab } of samples) occupiedDistance = Math.min(occupiedDistance, okDistance(lab, representativeLab))
	const regionIds = components.map(({ id }) => id).filter((id) => localByComponent.has(id)).sort(compareAscii)
	const quadrantCoverage = ((quadrants & 1 ? 1 : 0) + (quadrants & 2 ? 1 : 0) +
		(quadrants & 4 ? 1 : 0) + (quadrants & 8 ? 1 : 0)) / 4
	return {
		exactSource: exemplarIndex !== null,
		exemplar: exemplarIndex === null ? null : {
			x: exemplarIndex % evidence.width,
			y: Math.floor(exemplarIndex / evidence.width),
		},
		anchorFamilyId: familyId,
		regionIds,
		perceptualDensity: local.length / samples.length,
		totalSupport: samples.length / evidence.pixelCount,
		connectedSupport: largestConnected / evidence.pixelCount,
		spatialCoverage: quadrantCoverage,
		concentration: local.length === 0 ? 0 : largestConnected / local.length,
		prototypeDistance: okDistance(representativeLab, prototype),
		outlierScore: 1 - local.length / samples.length,
		synthesis: synthesized
			? { operation: "dense-neighborhood-mean", occupiedDistance }
			: null,
	}
}

function exactRepresentative(
	strategy: "dense-exact" | "nearest-prototype",
	sample: Sample,
	support: SourceSupportRecord,
): ColorRepresentative {
	return {
		strategy,
		rgb: sample.rgb,
		oklab: sample.lab,
		hex: rgbToHex(sample.rgb),
		support,
	}
}

function buildFamily(
	evidence: NativePaletteEvidence,
	familyId: string,
	samples: readonly Sample[],
	prototype: OKLab,
	components: readonly MeasuredComponent[],
	representatives: readonly ColorRepresentative[],
): ColorFamilyEvidence {
	let borderPixels = 0
	let centerPixels = 0
	let cornerPixels = 0
	let quadrants = 0
	let sumX = 0
	let sumY = 0
	let sumX2 = 0
	let sumY2 = 0
	for (const { pixelIndex } of samples) {
		const x = pixelIndex % evidence.width
		const y = Math.floor(pixelIndex / evidence.width)
		const nx = x / Math.max(1, evidence.width - 1)
		const ny = y / Math.max(1, evidence.height - 1)
		sumX += nx
		sumY += ny
		sumX2 += nx * nx
		sumY2 += ny * ny
		if (x === 0 || y === 0 || x === evidence.width - 1 || y === evidence.height - 1) borderPixels += 1
		if (nx >= 0.25 && nx <= 0.75 && ny >= 0.25 && ny <= 0.75) centerPixels += 1
		if ((nx <= 0.15 || nx >= 0.85) && (ny <= 0.15 || ny >= 0.85)) cornerPixels += 1
		quadrants |= 1 << ((nx >= 0.5 ? 1 : 0) + (ny >= 0.5 ? 2 : 0))
	}
	const population = samples.length
	const populationFraction = population / evidence.pixelCount
	const centroidX = sumX / population
	const centroidY = sumY / population
	const varianceX = Math.max(0, sumX2 / population - centroidX * centroidX)
	const varianceY = Math.max(0, sumY2 / population - centroidY * centroidY)
	const largestPopulation = components[0]?.population ?? 0
	const familyConcentration = largestPopulation / population
	const perimeter = Math.max(1, evidence.width * 2 + evidence.height * 2 - 4)
	const cornerPopulation = Math.max(1, Math.ceil(evidence.width * 0.3) * Math.ceil(evidence.height * 0.3))
	const borderCoverage = clamp(borderPixels / perimeter)
	const centerCoverage = clamp(centerPixels / Math.max(1, Math.ceil(evidence.pixelCount * 0.25)))
	const cornerCoverage = clamp(cornerPixels / cornerPopulation)
	const quadrantCoverage = ((quadrants & 1 ? 1 : 0) + (quadrants & 2 ? 1 : 0) +
		(quadrants & 4 ? 1 : 0) + (quadrants & 8 ? 1 : 0)) / 4
	const boundaryEdges = components.reduce((sum, component) => sum + component.boundaryEdges, 0)
	const boundaryContrast = components.reduce((sum, component) => sum + component.boundaryContrastSum, 0)
	const edgeDensity = clamp(boundaryEdges / Math.max(1, population * 2))
	const broadSupport = clamp(populationFraction / 0.24)
	const textureCalm = 1 - clamp(edgeDensity / 0.7)
	const fieldScore = clamp(
		0.28 * broadSupport + 0.22 * borderCoverage + 0.22 * familyConcentration +
		0.13 * quadrantCoverage + 0.15 * textureCalm,
	)
	return {
		id: familyId,
		prototype,
		population,
		populationFraction,
		perceptualBinCount: new Set(samples.map(({ lab }) => modeKey(lab))).size,
		borderCoverage,
		centerCoverage,
		quadrantCoverage,
		cornerCoverage,
		centroid: [centroidX, centroidY],
		spatialSpread: clamp(Math.sqrt(varianceX + varianceY) / 0.5),
		largestComponentFraction: largestPopulation / evidence.pixelCount,
		familyConcentration,
		componentCount: components.length,
		repeatedComponentCount: components.filter(({ population: componentPopulation }) =>
			componentPopulation / evidence.pixelCount >= 0.00025).length,
		edgeDensity,
		localContrast: boundaryContrast / Math.max(1, boundaryEdges),
		chroma: chroma(prototype),
		fieldScore,
		signatureScore: 0,
		foregroundScore: 0,
		foregroundTypographyObservation: 0,
		foregroundPolarityObservation: { polarity: 0, confidence: 0, componentIds: [] },
		signatureAccentObservation: 0,
		observedComponentCount: 0,
		components: components
			.slice(0, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.maximumRetainedComponents)
			.map((component) => componentEvidence(component, population, evidence)),
		representatives,
	}
}

export function materializeComponentLocalEndpointFamily(
	evidence: NativePaletteEvidence,
	familyId: string,
	pixelIndexes: readonly number[],
	prototype: OKLab,
): ColorFamilyEvidence | null {
	const samples = pixelIndexes.map((pixelIndex): Sample => ({
		pixelIndex,
		lab: labAt(evidence.labs, pixelIndex),
		rgb: rgbAt(evidence.rgbData, pixelIndex),
	}))
	if (samples.length === 0) return null
	const measured = measureComponents(evidence, pixelIndexes, familyId)
	const exemplar = nearestSample(samples, prototype)
	const support = supportForRepresentative(
		evidence,
		samples,
		measured.components,
		measured.componentIdAt,
		familyId,
		prototype,
		exemplar.lab,
		exemplar.pixelIndex,
		false,
	)
	const representative = exactRepresentative("dense-exact", exemplar, support)
	return buildFamily(evidence, familyId, samples, prototype, measured.components, [representative])
}

function measureBand(
	evidence: NativePaletteEvidence,
	diagnostic: GradientFitDiagnostic,
	domainPixels: readonly Readonly<{ pixelIndex: number; position: number }>[],
	parent: ColorFamilyEvidence,
	parentFamilyIndex: number,
	position: "low" | "high",
): MeasuredBand {
	const fraction = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.endpointBandFraction
	const inBand = position === "low"
		? ({ position: value }: Readonly<{ position: number }>): boolean => value <= fraction
		: ({ position: value }: Readonly<{ position: number }>): boolean => value >= 1 - fraction
	const spatialBand = domainPixels.filter(inBand)
	const samples: Sample[] = spatialBand
		.filter(({ pixelIndex }) => evidence.familyAt[pixelIndex] === parentFamilyIndex)
		.map(({ pixelIndex }) => ({
			pixelIndex,
			lab: labAt(evidence.labs, pixelIndex),
			rgb: rgbAt(evidence.rgbData, pixelIndex),
		}))
	const rejectionReasons: string[] = []
	const minimumPopulation = Math.max(8, Math.ceil(domainPixels.length * 0.005))
	if (spatialBand.length < minimumPopulation) rejectionReasons.push(`${position} spatial band is weak`)
	if (samples.length < minimumPopulation) rejectionReasons.push(`${position} parent-family band is unoccupied`)
	const familyBandShare = samples.length / Math.max(1, spatialBand.length)
	if (familyBandShare < ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.minimumFamilyBandShare) {
		rejectionReasons.push(`${position} parent-family band share is below occupied support`)
	}
	if (samples.length === 0) return { endpoint: null, rejectionReasons }

	const robust = robustPrototype(samples)
	const allModes = localModes(samples, robust.prototype)
	const retainedModes = distinctModes(allModes)
	const dominantMode = retainedModes[0]
	if (!dominantMode || dominantMode.neighborhoodPopulation / samples.length <
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.minimumModeShare) {
		rejectionReasons.push(`${position} band has no occupied local mode`)
	}
	if (!dominantMode) return { endpoint: null, rejectionReasons }

	const familyId = `band-local:${parent.id}:${diagnostic.fieldDomainId}:${diagnostic.topology}:${diagnostic.direction}:${position}`
	const measuredComponents = measureComponents(evidence, samples.map(({ pixelIndex }) => pixelIndex), familyId)
	const largestComponentPopulation = measuredComponents.components[0]?.population ?? 0
	if (largestComponentPopulation < Math.max(4, Math.ceil(
		samples.length * ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.minimumLargestComponentShare,
	))) rejectionReasons.push(`${position} band support is isolated or scattered`)

	const dense = nearestSample(samples, dominantMode.prototype, new Set(dominantMode.pixelIndexes))
	const nearest = nearestSample(samples, robust.prototype)
	const denseSupport = supportForRepresentative(
		evidence, samples, measuredComponents.components.slice(0,
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.maximumRetainedComponents),
		measuredComponents.componentIdAt,
		familyId, robust.prototype, dense.lab, dense.pixelIndex, false,
	)
	const nearestSupport = supportForRepresentative(
		evidence, samples, measuredComponents.components.slice(0,
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.maximumRetainedComponents),
		measuredComponents.componentIdAt,
		familyId, robust.prototype, nearest.lab, nearest.pixelIndex, false,
	)
	const denseRepresentative = exactRepresentative("dense-exact", dense, denseSupport)
	const nearestRepresentative = exactRepresentative("nearest-prototype", nearest, nearestSupport)

	const synthesizedRgb = oklabToRGB(robust.prototype)
	const synthesizedLab = rgbToOKLab(synthesizedRgb)
	const synthesizedSupport = supportForRepresentative(
		evidence, samples, measuredComponents.components.slice(0,
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.maximumRetainedComponents),
		measuredComponents.componentIdAt,
		familyId, robust.prototype, synthesizedLab, null, true,
	)
	const synthesisOccupiedDistance = synthesizedSupport.synthesis?.occupiedDistance ?? Infinity
	const synthesisMinimumPopulation = Math.max(4, Math.ceil(samples.length * 0.08))
	const synthesisLocalPopulation = Math.round(synthesizedSupport.perceptualDensity * samples.length)
	const synthesisInsideMode = okDistance(synthesizedLab, dominantMode.prototype) <=
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.modeNeighborhoodRadius
	const densityConstrainedSynthesis =
		synthesisOccupiedDistance <=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.maximumSynthesizedOccupiedDistance &&
		synthesisLocalPopulation >= synthesisMinimumPopulation && synthesisInsideMode &&
		!sameRgb(synthesizedRgb, dense.rgb) && !sameRgb(synthesizedRgb, nearest.rgb)
			? {
				strategy: "density-synthesized" as const,
				rgb: synthesizedRgb,
				oklab: synthesizedLab,
				hex: rgbToHex(synthesizedRgb),
				support: synthesizedSupport,
			}
			: null
	const choices: BandLocalEndpointRepresentativeChoices = {
		denseExact: denseRepresentative,
		nearestRobustPrototype: nearestRepresentative,
		densityConstrainedSynthesis,
	}
	const representatives = [denseRepresentative, nearestRepresentative, densityConstrainedSynthesis]
		.filter((representative): representative is ColorRepresentative => representative !== null)
		.filter((representative, index, values) =>
			values.findIndex(({ rgb }) => sameRgb(rgb, representative.rgb)) === index)
	const family = buildFamily(
		evidence, familyId, samples, robust.prototype, measuredComponents.components, representatives,
	)
	const publicModes = retainedModes.map((mode): BandLocalEndpointMode => {
		const exemplar = nearestSample(samples, mode.prototype, new Set(mode.pixelIndexes))
		return {
			prototype: mode.prototype,
			exemplar: {
				rgb: exemplar.rgb,
				x: exemplar.pixelIndex % evidence.width,
				y: Math.floor(exemplar.pixelIndex / evidence.width),
			},
			population: mode.population,
			populationFraction: mode.population / samples.length,
			neighborhoodPopulation: mode.neighborhoodPopulation,
			neighborhoodFraction: mode.neighborhoodPopulation / samples.length,
		}
	})
	return {
		endpoint: {
			position,
			parentFamilyId: parent.id,
			family,
			distribution: {
				position,
				spatialRange: position === "low" ? [0, fraction] : [1 - fraction, 1],
				spatialBandPopulation: spatialBand.length,
				parentFamilyPopulation: samples.length,
				parentFamilyBandShare: familyBandShare,
				populationFraction: samples.length / evidence.pixelCount,
				robustPrototype: robust.prototype,
				robustRetainedPopulation: robust.retainedPopulation,
				robustSpread: robust.spread,
				componentCount: measuredComponents.components.length,
				largestComponentPopulation,
				localModes: publicModes,
			},
			representatives: choices,
		},
		rejectionReasons,
	}
}

function refineBandLocalGradientEndpointsWithDomain(
	evidence: NativePaletteEvidence,
	diagnostic: GradientFitDiagnostic,
	domain: Domain | null,
): BandLocalEndpointRefinement {
	const id = `band-local-refinement:${diagnostic.fieldDomainId}:${diagnostic.topology}:${diagnostic.direction}:${diagnostic.lowEndpointFamilyId ?? "missing"}`
	const fit = {
		fieldDomainId: diagnostic.fieldDomainId,
		topology: diagnostic.topology,
		direction: diagnostic.direction,
		span: diagnostic.span,
		progression: diagnostic.progression,
		monotonicity: diagnostic.monotonicity,
		residual: diagnostic.residual,
	}
	const rejectionReasons: string[] = []
	const lowFamilyId = diagnostic.lowEndpointFamilyId
	const highFamilyId = diagnostic.highEndpointFamilyId
	if (lowFamilyId === null || highFamilyId === null) rejectionReasons.push("diagnosed endpoint family is missing")
	if (lowFamilyId !== highFamilyId) rejectionReasons.push("diagnosed endpoints do not share one parent family")
	const independentReasons = diagnostic.rejectionReasons.filter((reason) =>
		reason !== ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_REFINABLE_UPSTREAM_REASON)
	if (independentReasons.length > 0) rejectionReasons.push(...independentReasons.map((reason) => `upstream fit: ${reason}`))
	if (!domain) rejectionReasons.push("diagnosed field domain cannot be reconstructed from native evidence")
	if (domain && Math.abs(domain.pixelIndexes.length / evidence.pixelCount -
		diagnostic.fieldDomainPopulationFraction) > 1 / evidence.pixelCount + 1e-9) {
		rejectionReasons.push("reconstructed field domain population differs from gradient diagnostics")
	}
	const parentFamilyIndex = lowFamilyId === null ? -1 : familyIndexById(evidence, lowFamilyId)
	if (lowFamilyId !== null && parentFamilyIndex < 0) rejectionReasons.push("diagnosed parent family is absent from native evidence")
	if (!domain || parentFamilyIndex < 0 || lowFamilyId !== highFamilyId) {
		return {
			id,
			fit,
			parentFamilyId: lowFamilyId === highFamilyId ? lowFamilyId : null,
			accepted: false,
			rejectionReasons,
			domainPopulation: domain?.pixelIndexes.length ?? 0,
			endpointDistance: 0,
			occupiedModeDistance: 0,
			low: null,
			high: null,
		}
	}

	const parent = evidence.families[parentFamilyIndex]
	const positioned = positionedDomain(evidence, domain, diagnostic)
	const low = measureBand(evidence, diagnostic, positioned, parent, parentFamilyIndex, "low")
	const high = measureBand(evidence, diagnostic, positioned, parent, parentFamilyIndex, "high")
	rejectionReasons.push(...low.rejectionReasons, ...high.rejectionReasons)
	const endpointDistance = low.endpoint && high.endpoint
		? okDistance(low.endpoint.distribution.robustPrototype, high.endpoint.distribution.robustPrototype)
		: 0
	const occupiedModeDistance = low.endpoint && high.endpoint
		? okDistance(
			low.endpoint.distribution.localModes[0].prototype,
			high.endpoint.distribution.localModes[0].prototype,
		)
		: 0
	if (endpointDistance < ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.minimumEndpointDistance) {
		rejectionReasons.push("band-local robust endpoints are not materially distinct")
	}
	if (occupiedModeDistance <
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.minimumOccupiedModeDistance) {
		rejectionReasons.push("band-local occupied modes are not materially distinct")
	}
	if (low.endpoint && high.endpoint && endpointDistance < (
		low.endpoint.distribution.robustSpread + high.endpoint.distribution.robustSpread
	)) rejectionReasons.push("band-local endpoint distributions overlap too strongly")
	return {
		id,
		fit,
		parentFamilyId: parent.id,
		accepted: rejectionReasons.length === 0,
		rejectionReasons,
		domainPopulation: domain.pixelIndexes.length,
		endpointDistance,
		occupiedModeDistance,
		low: low.endpoint,
		high: high.endpoint,
	}
}

function representationMechanismEligibility(
	diagnostic: GradientFitDiagnostic,
): BandLocalEndpointRepresentationMechanismEligibility | null {
	if (diagnostic.lowEndpointFamilyId === null || diagnostic.highEndpointFamilyId === null) return null
	if (diagnostic.rejectionReasons.length === 0) return "accepted"
	return diagnostic.rejectionReasons.every((reason) =>
		reason === ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_REFINABLE_UPSTREAM_REASON)
		? "refinable"
		: null
}

export function runBandLocalEndpointRepresentationMechanism<TResult>(
	evidence: NativePaletteEvidence,
	diagnostics: readonly GradientFitDiagnostic[],
	mechanism: BandLocalEndpointRepresentationMechanism<TResult>,
): TResult {
	const fraction = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.endpointBandFraction
	const domains = new Map<string, Domain | null>()
	const fits = diagnostics.flatMap((diagnostic): BandLocalEndpointRepresentationMechanismFit[] => {
		const eligibility = representationMechanismEligibility(diagnostic)
		if (eligibility === null) return []
		if (!domains.has(diagnostic.fieldDomainId)) {
			domains.set(diagnostic.fieldDomainId, reconstructDomain(evidence, diagnostic.fieldDomainId))
		}
		const domain = domains.get(diagnostic.fieldDomainId) ?? null
		if (!domain || Math.abs(domain.pixelIndexes.length / evidence.pixelCount -
			diagnostic.fieldDomainPopulationFraction) > 1 / evidence.pixelCount + 1e-9) return []
		const positioned = positionedDomain(evidence, domain, diagnostic)
		return [{
			diagnostic,
			eligibility,
			domainPopulation: domain.pixelIndexes.length,
			bands: [{
				position: "low",
				spatialRange: [0, fraction],
				pixelIndexes: positioned.filter(({ position }) => position <= fraction)
					.map(({ pixelIndex }) => pixelIndex),
			}, {
				position: "high",
				spatialRange: [1 - fraction, 1],
				pixelIndexes: positioned.filter(({ position }) => position >= 1 - fraction)
					.map(({ pixelIndex }) => pixelIndex),
			}],
		}]
	})
	return mechanism.inspect({ evidence, fits })
}

export function buildBandLocalEndpointRefinements(
	evidence: NativePaletteEvidence,
	diagnostics: readonly GradientFitDiagnostic[],
): BandLocalEndpointRefinementReport {
	const sameFamilyDiagnostics = diagnostics.filter(({ lowEndpointFamilyId, highEndpointFamilyId }) =>
		lowEndpointFamilyId !== null && lowEndpointFamilyId === highEndpointFamilyId)
	const domains = new Map<string, Domain | null>()
	const refinements = sameFamilyDiagnostics.map((diagnostic) => {
		if (!domains.has(diagnostic.fieldDomainId)) {
			domains.set(diagnostic.fieldDomainId, reconstructDomain(evidence, diagnostic.fieldDomainId))
		}
		return refineBandLocalGradientEndpointsWithDomain(
			evidence,
			diagnostic,
			domains.get(diagnostic.fieldDomainId) ?? null,
		)
	})
	return {
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_ATTEMPT_ID,
		evaluatedFitCount: diagnostics.length,
		sameFamilyFitCount: refinements.length,
		acceptedCount: refinements.filter(({ accepted }) => accepted).length,
		rejectedCount: refinements.filter(({ accepted }) => !accepted).length,
		refinements,
	}
}
