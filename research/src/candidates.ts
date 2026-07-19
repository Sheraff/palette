import { chroma, labAt, okDistance, rgbToHex, rgbToOKLab } from "./color.ts"
import type { RegionAnalysis } from "./regions.ts"
import type { OKLab, RGB } from "./types.ts"

export type SideCoverage = readonly [top: number, right: number, bottom: number, left: number]

export type CandidateComponentEvidence = {
	population: number
	regionIds: number[]
	sideCoverage: SideCoverage
	saliency: number
	text: number
}

export type CandidateSpatialEvidence = {
	population: number
	regionIds: number[]
	components: CandidateComponentEvidence[]
	sideCoverage: SideCoverage
	field: number
	detail: number
	frame: number
}

export function emptyCandidateSpatialEvidence(): CandidateSpatialEvidence {
	return {
		population: 0,
		regionIds: [],
		components: [],
		sideCoverage: [0, 0, 0, 0],
		field: 0,
		detail: 0,
		frame: 0,
	}
}

export type Candidate = {
	id: number
	rgb: RGB
	lab: OKLab
	hex: string
	population: number
	background: number
	saliency: number
	text: number
	chroma: number
	generated: boolean
	typographyOnly: boolean
	regionIds: number[]
	familyId: number
	spatial: CandidateSpatialEvidence
	familySpatial: CandidateSpatialEvidence
}

type ColorBin = {
	id: number
	key: number
	count: number
	population: number
	lab: OKLab
	rgb: RGB
	background: number
	saliency: number
	text: number
	chroma: number
}

type BinAccumulator = {
	count: number
	l: number
	a: number
	b: number
	r: number
	g: number
	blue: number
	background: number
	saliency: number
	text: number
}

type BuiltBins = {
	bins: ColorBin[]
	pixelBinIds: Int32Array
}

const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value))

function quantizedKey([lightness, a, b]: OKLab): number {
	const lightnessBin = clamp(Math.floor(lightness * 32), 0, 31)
	const aBin = clamp(Math.floor(((a + 0.4) / 0.8) * 24), 0, 23)
	const bBin = clamp(Math.floor(((b + 0.4) / 0.8) * 24), 0, 23)
	return (lightnessBin << 10) | (aBin << 5) | bBin
}

function buildBins(analysis: RegionAnalysis): BuiltBins {
	const accumulators = new Map<number, BinAccumulator>()
	const total = analysis.width * analysis.height
	const pixelKeys = new Int32Array(total)
	for (let pixel = 0; pixel < total; pixel++) {
		const lab = labAt(analysis.labs, pixel)
		const key = quantizedKey(lab)
		pixelKeys[pixel] = key
		let bin = accumulators.get(key)
		if (!bin) {
			bin = { count: 0, l: 0, a: 0, b: 0, r: 0, g: 0, blue: 0, background: 0, saliency: 0, text: 0 }
			accumulators.set(key, bin)
		}
		const region = analysis.regions[analysis.labels[pixel]]
		const x = pixel % analysis.width
		const y = Math.floor(pixel / analysis.width)
		const borderDistance = Math.min(x, y, analysis.width - 1 - x, analysis.height - 1 - y)
		const borderScale = Math.max(1, Math.min(analysis.width, analysis.height) * 0.08)
		const borderBand = Math.exp(-borderDistance / borderScale)
		const offset = pixel * 3
		bin.count++
		bin.l += lab[0]
		bin.a += lab[1]
		bin.b += lab[2]
		bin.r += analysis.data[offset]
		bin.g += analysis.data[offset + 1]
		bin.blue += analysis.data[offset + 2]
		bin.background += region.background * 0.45 + borderBand * 0.55
		bin.saliency += region.saliency
		bin.text += region.text
	}

	const bins = [...accumulators.entries()].map(([key, bin], id): ColorBin => {
		const lab: OKLab = [bin.l / bin.count, bin.a / bin.count, bin.b / bin.count]
		return {
			id,
			key,
			count: bin.count,
			population: bin.count / total,
			lab,
			rgb: [Math.round(bin.r / bin.count), Math.round(bin.g / bin.count), Math.round(bin.blue / bin.count)],
			background: bin.background / bin.count,
			saliency: bin.saliency / bin.count,
			text: bin.text / bin.count,
			chroma: chroma(lab),
		}
	})
	const binsByKey = new Map(bins.map((bin) => [bin.key, bin]))
	const pixelBinIds = new Int32Array(total)
	const representativeDistance = new Float32Array(bins.length).fill(Infinity)
	for (let pixel = 0; pixel < total; pixel++) {
		const lab = labAt(analysis.labs, pixel)
		const bin = binsByKey.get(pixelKeys[pixel])!
		pixelBinIds[pixel] = bin.id
		const distance = okDistance(lab, bin.lab)
		if (distance >= representativeDistance[bin.id]) continue
		representativeDistance[bin.id] = distance
		const offset = pixel * 3
		bin.rgb = [analysis.data[offset], analysis.data[offset + 1], analysis.data[offset + 2]]
	}
	return { bins, pixelBinIds }
}

function sideCoverage(counts: [number, number, number, number], width: number, height: number): SideCoverage {
	return [counts[0] / width, counts[1] / height, counts[2] / width, counts[3] / height]
}

function spatialEvidence(analysis: RegionAnalysis, mask: Uint8Array): CandidateSpatialEvidence {
	const { width, height } = analysis
	const total = width * height
	if (total === 0) return emptyCandidateSpatialEvidence()
	const visited = new Uint8Array(total)
	const components: CandidateComponentEvidence[] = []
	const allRegionIds = new Set<number>()
	const allSideCounts: [number, number, number, number] = [0, 0, 0, 0]
	let support = 0
	let borderPixels = 0
	let saliency = 0
	let text = 0

	for (let start = 0; start < total; start++) {
		if (!mask[start] || visited[start]) continue
		const stack = [start]
		const componentRegionIds = new Set<number>()
		const componentSideCounts: [number, number, number, number] = [0, 0, 0, 0]
		let componentSize = 0
		let componentSaliency = 0
		let componentText = 0
		visited[start] = 1

		while (stack.length > 0) {
			const pixel = stack.pop()!
			const x = pixel % width
			const y = Math.floor(pixel / width)
			const regionId = analysis.labels[pixel]
			const region = analysis.regions[regionId]
			componentSize++
			componentSaliency += region.saliency
			componentText += region.text
			componentRegionIds.add(regionId)
			allRegionIds.add(regionId)
			if (y === 0) {
				componentSideCounts[0]++
				allSideCounts[0]++
			}
			if (x === width - 1) {
				componentSideCounts[1]++
				allSideCounts[1]++
			}
			if (y === height - 1) {
				componentSideCounts[2]++
				allSideCounts[2]++
			}
			if (x === 0) {
				componentSideCounts[3]++
				allSideCounts[3]++
			}
			if (x === 0 || x === width - 1 || y === 0 || y === height - 1) borderPixels++

			const neighbors = [
				x > 0 ? pixel - 1 : -1,
				x + 1 < width ? pixel + 1 : -1,
				y > 0 ? pixel - width : -1,
				y + 1 < height ? pixel + width : -1,
			]
			for (const neighbor of neighbors) {
				if (neighbor >= 0 && mask[neighbor] && !visited[neighbor]) {
					visited[neighbor] = 1
					stack.push(neighbor)
				}
			}
		}

		support += componentSize
		saliency += componentSaliency
		text += componentText
		components.push({
			population: componentSize / total,
			regionIds: [...componentRegionIds].sort((first, second) => first - second),
			sideCoverage: sideCoverage(componentSideCounts, width, height),
			saliency: componentSaliency / componentSize,
			text: componentText / componentSize,
		})
	}

	if (support === 0) return emptyCandidateSpatialEvidence()
	const population = support / total
	const largestComponent = components.reduce((largest, component) =>
		Math.max(largest, component.population), 0)
	const perimeter = width === 1 || height === 1 ? total : width * 2 + height * 2 - 4
	const borderCoverage = borderPixels / perimeter
	return {
		population,
		regionIds: [...allRegionIds].sort((first, second) => first - second),
		components,
		sideCoverage: sideCoverage(allSideCounts, width, height),
		field: largestComponent / Math.sqrt(population),
		detail: Math.max(saliency / support, text / support),
		frame: borderCoverage * (1 - Math.sqrt(population)),
	}
}

function attachColorFamilies(
	candidates: Candidate[],
	masks: Map<number, Uint8Array>,
	analysis: RegionAnalysis,
): void {
	const radius = 0.055
	const primary = candidates.filter((candidate) => !candidate.typographyOnly)
		.sort((first, second) => second.population - first.population)
	const families: Array<{ id: number; anchor: Candidate; members: Candidate[]; evidence?: CandidateSpatialEvidence }> = []
	for (const candidate of primary) {
		let closest: (typeof families)[number] | undefined
		let closestDistance = Infinity
		for (const family of families) {
			const distance = okDistance(candidate.lab, family.anchor.lab)
			if (distance <= radius && distance < closestDistance) {
				closest = family
				closestDistance = distance
			}
		}
		if (!closest) {
			closest = { id: families.length, anchor: candidate, members: [] }
			families.push(closest)
		}
		closest.members.push(candidate)
		candidate.familyId = closest.id
	}

	for (const family of families) {
		const union = new Uint8Array(analysis.width * analysis.height)
		for (const candidate of family.members) {
			const mask = masks.get(candidate.id)!
			for (let pixel = 0; pixel < union.length; pixel++) union[pixel] |= mask[pixel]
		}
		family.evidence = spatialEvidence(analysis, union)
		for (const candidate of family.members) candidate.familySpatial = family.evidence
	}

	for (const candidate of candidates) {
		if (!candidate.typographyOnly) continue
		let closest = families[0]
		let closestDistance = okDistance(candidate.lab, closest.anchor.lab)
		for (let index = 1; index < families.length; index++) {
			const distance = okDistance(candidate.lab, families[index].anchor.lab)
			if (distance < closestDistance) {
				closest = families[index]
				closestDistance = distance
			}
		}
		candidate.familyId = closest.id
		candidate.familySpatial = closest.evidence!
	}
}

function bestBin(bins: ColorBin[], score: (bin: ColorBin) => number): number {
	let best = 0
	let bestScore = -Infinity
	for (const bin of bins) {
		const value = score(bin)
		if (value > bestScore) {
			bestScore = value
			best = bin.id
		}
	}
	return best
}

function pushDistinct(indices: number[], index: number, bins: ColorBin[]): void {
	if (indices.includes(index)) return
	if (indices.some((existing) => okDistance(bins[existing].lab, bins[index].lab) < 0.025)) return
	indices.push(index)
}

function initializeCenters(bins: ColorBin[], count: number, roleAware: boolean): OKLab[] {
	const indices: number[] = []
	pushDistinct(indices, bestBin(bins, (bin) => bin.population), bins)
	if (roleAware) {
		pushDistinct(indices, bestBin(bins, (bin) => bin.background * Math.sqrt(bin.population)), bins)
		pushDistinct(indices, bestBin(bins, (bin) => bin.saliency * (0.15 + bin.chroma * 5) * Math.sqrt(bin.population)), bins)
		pushDistinct(indices, bestBin(bins, (bin) => bin.text * Math.sqrt(bin.population)), bins)
	}

	while (indices.length < Math.min(count, bins.length)) {
		let best = -1
		let bestScore = -Infinity
		for (const bin of bins) {
			if (indices.includes(bin.id)) continue
			const distance = Math.min(...indices.map((index) => okDistance(bin.lab, bins[index].lab)))
			const roleWeight = roleAware ? 1 + bin.background + 2 * bin.saliency + bin.text : 1
			const score = distance * Math.sqrt(bin.population * roleWeight)
			if (score > bestScore) {
				bestScore = score
				best = bin.id
			}
		}
		if (best === -1) break
		indices.push(best)
	}
	return indices.map((index) => bins[index].lab)
}

function assignBins(bins: ColorBin[], centers: OKLab[]): number[][] {
	const groups = centers.map(() => [] as number[])
	for (const bin of bins) {
		let best = 0
		let bestDistance = Infinity
		for (let index = 0; index < centers.length; index++) {
			const distance = okDistance(bin.lab, centers[index])
			if (distance < bestDistance) {
				bestDistance = distance
				best = index
			}
		}
		groups[best].push(bin.id)
	}
	return groups
}

function updateCenters(bins: ColorBin[], groups: number[][], current: OKLab[], roleAware: boolean): OKLab[] {
	return groups.map((group, groupIndex) => {
		if (group.length === 0) return current[groupIndex]
		let total = 0
		let l = 0
		let a = 0
		let b = 0
		for (const binId of group) {
			const bin = bins[binId]
			const roleWeight = roleAware ? 1 + bin.background + 2 * bin.saliency + bin.text : 1
			const weight = bin.population * roleWeight
			total += weight
			l += bin.lab[0] * weight
			a += bin.lab[1] * weight
			b += bin.lab[2] * weight
		}
		return [l / total, a / total, b / total]
	})
}

export function buildCandidates(
	analysis: RegionAnalysis,
	count = 12,
	roleAware = true,
): Candidate[] {
	const { bins, pixelBinIds } = buildBins(analysis)
	let centers = initializeCenters(bins, count, roleAware)
	let groups = assignBins(bins, centers)
	for (let iteration = 0; iteration < 8; iteration++) {
		const next = updateCenters(bins, groups, centers, roleAware)
		const movement = next.reduce((sum, center, index) => sum + okDistance(center, centers[index]), 0)
		centers = next
		groups = assignBins(bins, centers)
		if (movement < 0.0001) break
	}

	const binCandidateIds = new Int32Array(bins.length).fill(-1)
	for (let candidateId = 0; candidateId < groups.length; candidateId++) {
		for (const binId of groups[candidateId]) binCandidateIds[binId] = candidateId
	}
	const masks = new Map<number, Uint8Array>()
	for (let candidateId = 0; candidateId < groups.length; candidateId++) {
		if (groups[candidateId].length > 0) masks.set(candidateId, new Uint8Array(pixelBinIds.length))
	}
	for (let pixel = 0; pixel < pixelBinIds.length; pixel++) {
		const candidateId = binCandidateIds[pixelBinIds[pixel]]
		masks.get(candidateId)![pixel] = 1
	}

	const candidates = groups.map((group, id): Candidate | undefined => {
		if (group.length === 0) return undefined
		const population = group.reduce((sum, binId) => sum + bins[binId].population, 0)
		const representative = group.reduce((best, binId) =>
			okDistance(bins[binId].lab, centers[id]) < okDistance(bins[best].lab, centers[id]) ? binId : best,
		group[0])
		const weighted = (field: "background" | "saliency" | "text"): number =>
			group.reduce((sum, binId) => sum + bins[binId].population * bins[binId][field], 0) / population
		const rgb = bins[representative].rgb
		const lab = rgbToOKLab(rgb)
		const spatial = spatialEvidence(analysis, masks.get(id)!)
		return {
			id,
			rgb,
			lab,
			hex: rgbToHex(rgb),
			population,
			background: weighted("background"),
			saliency: weighted("saliency"),
			text: weighted("text"),
			chroma: chroma(lab),
			generated: false,
			typographyOnly: false,
			regionIds: spatial.regionIds,
			familyId: -1,
			spatial,
			familySpatial: emptyCandidateSpatialEvidence(),
		}
	}).filter((candidate): candidate is Candidate => candidate !== undefined)

	if (roleAware) {
		let nextCandidateId = candidates.reduce((maximum, candidate) => Math.max(maximum, candidate.id), -1) + 1
		for (const light of [true]) {
			const extremeBins = bins.filter((bin) =>
				bin.chroma <= 0.08 && (light ? bin.lab[0] >= 0.9 : bin.lab[0] <= 0.12),
			)
			const population = extremeBins.reduce((sum, bin) => sum + bin.population, 0)
			if (population < 0.001) continue
			const representative = [...extremeBins].sort((first, second) => {
				const score = (bin: ColorBin) => bin.text * 0.45 + bin.saliency * 0.4 +
					Math.abs(bin.lab[0] - 0.5) * 0.3 + Math.sqrt(bin.population) * 0.05
				return score(second) - score(first)
			})[0]
			if (candidates.some((candidate) => okDistance(candidate.lab, representative.lab) < 0.04)) continue
			const weighted = (field: "background" | "saliency" | "text"): number =>
				extremeBins.reduce((sum, bin) => sum + bin.population * bin[field], 0) / population
			const extremeBinIds = new Set(extremeBins.map((bin) => bin.id))
			const mask = new Uint8Array(pixelBinIds.length)
			for (let pixel = 0; pixel < pixelBinIds.length; pixel++) {
				if (extremeBinIds.has(pixelBinIds[pixel])) mask[pixel] = 1
			}
			const id = nextCandidateId++
			const spatial = spatialEvidence(analysis, mask)
			masks.set(id, mask)
			candidates.push({
				id,
				rgb: representative.rgb,
				lab: rgbToOKLab(representative.rgb),
				hex: rgbToHex(representative.rgb),
				population,
				background: weighted("background"),
				saliency: weighted("saliency"),
				text: weighted("text"),
				chroma: chroma(representative.lab),
				generated: false,
				typographyOnly: true,
				regionIds: spatial.regionIds,
				familyId: -1,
				spatial,
				familySpatial: emptyCandidateSpatialEvidence(),
			})
		}
	}

	attachColorFamilies(candidates, masks, analysis)
	return candidates.sort((first, second) => second.population - first.population)
}
