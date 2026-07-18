import { chroma, labAt, okDistance, rgbToHex, rgbToOKLab } from "./color.ts"
import type { RegionAnalysis } from "./regions.ts"
import type { OKLab, RGB } from "./types.ts"

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
	regionIds: number[]
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

const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value))

function quantizedKey([lightness, a, b]: OKLab): number {
	const lightnessBin = clamp(Math.floor(lightness * 32), 0, 31)
	const aBin = clamp(Math.floor(((a + 0.4) / 0.8) * 24), 0, 23)
	const bBin = clamp(Math.floor(((b + 0.4) / 0.8) * 24), 0, 23)
	return (lightnessBin << 10) | (aBin << 5) | bBin
}

function buildBins(analysis: RegionAnalysis): ColorBin[] {
	const accumulators = new Map<number, BinAccumulator>()
	const total = analysis.width * analysis.height
	for (let pixel = 0; pixel < total; pixel++) {
		const lab = labAt(analysis.labs, pixel)
		const key = quantizedKey(lab)
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
	const representativeDistance = new Float32Array(bins.length).fill(Infinity)
	for (let pixel = 0; pixel < total; pixel++) {
		const lab = labAt(analysis.labs, pixel)
		const bin = binsByKey.get(quantizedKey(lab))!
		const distance = okDistance(lab, bin.lab)
		if (distance >= representativeDistance[bin.id]) continue
		representativeDistance[bin.id] = distance
		const offset = pixel * 3
		bin.rgb = [analysis.data[offset], analysis.data[offset + 1], analysis.data[offset + 2]]
	}
	return bins
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
	const bins = buildBins(analysis)
	let centers = initializeCenters(bins, count, roleAware)
	let groups = assignBins(bins, centers)
	for (let iteration = 0; iteration < 8; iteration++) {
		const next = updateCenters(bins, groups, centers, roleAware)
		const movement = next.reduce((sum, center, index) => sum + okDistance(center, centers[index]), 0)
		centers = next
		groups = assignBins(bins, centers)
		if (movement < 0.0001) break
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
			regionIds: [],
		}
	}).filter((candidate): candidate is Candidate => candidate !== undefined)

	if (roleAware) {
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
			candidates.push({
				id: candidates.length,
				rgb: representative.rgb,
				lab: rgbToOKLab(representative.rgb),
				hex: rgbToHex(representative.rgb),
				population,
				background: weighted("background"),
				saliency: weighted("saliency"),
				text: weighted("text"),
				chroma: chroma(representative.lab),
				generated: false,
				regionIds: [],
			})
		}
	}

	return candidates.sort((first, second) => second.population - first.population)
}
