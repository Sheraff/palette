import { chroma, labAt, okDistance, rgbAt, toLabBuffer } from "./color.ts"
import type { OKLab, RGB, RawImage } from "./types.ts"

export type Region = {
	id: number
	area: number
	population: number
	centerX: number
	centerY: number
	lab: OKLab
	rgb: RGB
	borderPixels: number
	sideCount: number
	edge: number
	variance: number
	distinctiveness: number
	localContrast: number
	background: number
	saliency: number
	text: number
	chroma: number
	neighbors: number[]
}

export type RegionAnalysis = {
	regions: Region[]
	labels: Int32Array
	labs: Float32Array
	edges: Float32Array
	data: Uint8Array
	width: number
	height: number
}

type Center = {
	lab: [number, number, number]
	x: number
	y: number
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

function percentile(values: number[], ratio: number): number {
	if (values.length === 0) return 0
	const sorted = [...values].sort((first, second) => first - second)
	return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)))]
}

function normalize(values: number[]): number[] {
	const low = percentile(values, 0.08)
	const high = percentile(values, 0.92)
	const range = high - low
	if (range < 1e-9) return values.map(() => 0)
	return values.map((value) => clamp01((value - low) / range))
}

function computeEdges(labs: Float32Array, width: number, height: number): Float32Array {
	const edges = new Float32Array(width * height)
	const lightness = (x: number, y: number): number => {
		const clampedX = Math.max(0, Math.min(width - 1, x))
		const clampedY = Math.max(0, Math.min(height - 1, y))
		return labs[(clampedY * width + clampedX) * 3]
	}

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const horizontal =
				-lightness(x - 1, y - 1) - 2 * lightness(x - 1, y) - lightness(x - 1, y + 1) +
				lightness(x + 1, y - 1) + 2 * lightness(x + 1, y) + lightness(x + 1, y + 1)
			const vertical =
				-lightness(x - 1, y - 1) - 2 * lightness(x, y - 1) - lightness(x + 1, y - 1) +
				lightness(x - 1, y + 1) + 2 * lightness(x, y + 1) + lightness(x + 1, y + 1)
			edges[y * width + x] = Math.hypot(horizontal, vertical)
		}
	}
	return edges
}

function initializeCenters(
	labs: Float32Array,
	edges: Float32Array,
	width: number,
	height: number,
	step: number,
): Center[] {
	const centers: Center[] = []
	for (let initialY = step / 2; initialY < height; initialY += step) {
		for (let initialX = step / 2; initialX < width; initialX += step) {
			let bestX = Math.min(width - 1, Math.round(initialX))
			let bestY = Math.min(height - 1, Math.round(initialY))
			let bestEdge = edges[bestY * width + bestX]
			for (let offsetY = -1; offsetY <= 1; offsetY++) {
				for (let offsetX = -1; offsetX <= 1; offsetX++) {
					const x = Math.max(0, Math.min(width - 1, bestX + offsetX))
					const y = Math.max(0, Math.min(height - 1, bestY + offsetY))
					if (edges[y * width + x] < bestEdge) {
						bestEdge = edges[y * width + x]
						bestX = x
						bestY = y
					}
				}
			}
			centers.push({ lab: [...labAt(labs, bestY * width + bestX)], x: bestX, y: bestY })
		}
	}
	return centers
}

function slic(
	labs: Float32Array,
	edges: Float32Array,
	width: number,
	height: number,
): Int32Array {
	const total = width * height
	const targetRegions = Math.max(48, Math.min(320, Math.round(total / 180)))
	const step = Math.max(4, Math.sqrt(total / targetRegions))
	const compactness = 9
	const centers = initializeCenters(labs, edges, width, height, step)
	const labels = new Int32Array(total).fill(-1)
	const distances = new Float32Array(total)

	for (let iteration = 0; iteration < 7; iteration++) {
		distances.fill(Infinity)
		for (let centerIndex = 0; centerIndex < centers.length; centerIndex++) {
			const center = centers[centerIndex]
			const minX = Math.max(0, Math.floor(center.x - 2 * step))
			const maxX = Math.min(width - 1, Math.ceil(center.x + 2 * step))
			const minY = Math.max(0, Math.floor(center.y - 2 * step))
			const maxY = Math.min(height - 1, Math.ceil(center.y + 2 * step))
			for (let y = minY; y <= maxY; y++) {
				for (let x = minX; x <= maxX; x++) {
					const pixel = y * width + x
					const lab = labAt(labs, pixel)
					const colorDistance = okDistance(lab, center.lab) * 100
					const spatialDistance = Math.hypot(x - center.x, y - center.y) / step
					const distance = colorDistance ** 2 + (compactness * spatialDistance) ** 2
					if (distance < distances[pixel]) {
						distances[pixel] = distance
						labels[pixel] = centerIndex
					}
				}
			}
		}

		const sums = centers.map(() => [0, 0, 0, 0, 0, 0])
		for (let pixel = 0; pixel < total; pixel++) {
			const label = labels[pixel]
			const offset = pixel * 3
			sums[label][0] += labs[offset]
			sums[label][1] += labs[offset + 1]
			sums[label][2] += labs[offset + 2]
			sums[label][3] += pixel % width
			sums[label][4] += Math.floor(pixel / width)
			sums[label][5]++
		}
		for (let index = 0; index < centers.length; index++) {
			const count = sums[index][5]
			if (count === 0) continue
			centers[index] = {
				lab: [sums[index][0] / count, sums[index][1] / count, sums[index][2] / count],
				x: sums[index][3] / count,
				y: sums[index][4] / count,
			}
		}
	}

	return labels
}

function regionGraphBackground(
	regions: Region[],
	boundaryEdges: Map<number, Map<number, number>>,
): number[] {
	const costs = new Array(regions.length).fill(Infinity)
	const visited = new Uint8Array(regions.length)
	for (const region of regions) {
		if (region.borderPixels === 0) continue
		const perimeterScale = Math.max(1, 2 * Math.sqrt(region.area))
		const contact = clamp01(region.borderPixels / perimeterScale)
		const sideBonus = region.sideCount / 4
		costs[region.id] = 0.7 * (1 - contact) + 0.3 * (1 - sideBonus) + region.saliency * 0.6
	}

	for (let iteration = 0; iteration < regions.length; iteration++) {
		let current = -1
		let minimum = Infinity
		for (let index = 0; index < costs.length; index++) {
			if (!visited[index] && costs[index] < minimum) {
				minimum = costs[index]
				current = index
			}
		}
		if (current === -1) break
		visited[current] = 1
		for (const neighbor of regions[current].neighbors) {
			if (visited[neighbor]) continue
			const boundary = boundaryEdges.get(current)?.get(neighbor) || 0
			const colorBarrier = okDistance(regions[current].lab, regions[neighbor].lab)
			const nextCost = minimum + 0.025 + colorBarrier * 5 + boundary * 1.2
			if (nextCost < costs[neighbor]) costs[neighbor] = nextCost
		}
	}

	return costs.map((cost) => Number.isFinite(cost) ? Math.exp(-cost / 0.7) : 0)
}

export function analyzeRegions(image: RawImage): RegionAnalysis {
	const { width, height, data } = image
	const total = width * height
	if (data.length !== total * 3) {
		throw new Error(`Invalid RGB buffer: expected ${total * 3} bytes, received ${data.length}`)
	}
	const labs = toLabBuffer(data)
	const edges = computeEdges(labs, width, height)
	const labels = slic(labs, edges, width, height)
	const rawCount = Math.max(...labels) + 1
	const counts = new Int32Array(rawCount)
	for (const label of labels) counts[label]++
	const remap = new Int32Array(rawCount).fill(-1)
	let regionCount = 0
	for (let label = 0; label < counts.length; label++) {
		if (counts[label] > 0) remap[label] = regionCount++
	}
	for (let pixel = 0; pixel < labels.length; pixel++) labels[pixel] = remap[labels[pixel]]

	const sums = Array.from({ length: regionCount }, () => ({
		area: 0,
		x: 0,
		y: 0,
		lab: [0, 0, 0],
		edge: 0,
		border: 0,
		sides: 0,
	}))
	for (let pixel = 0; pixel < total; pixel++) {
		const label = labels[pixel]
		const x = pixel % width
		const y = Math.floor(pixel / width)
		const lab = labAt(labs, pixel)
		const sum = sums[label]
		sum.area++
		sum.x += x
		sum.y += y
		sum.lab[0] += lab[0]
		sum.lab[1] += lab[1]
		sum.lab[2] += lab[2]
		sum.edge += edges[pixel]
		if (x === 0 || x === width - 1 || y === 0 || y === height - 1) sum.border++
		if (x === 0) sum.sides |= 1
		if (x === width - 1) sum.sides |= 2
		if (y === 0) sum.sides |= 4
		if (y === height - 1) sum.sides |= 8
	}

	const regions: Region[] = sums.map((sum, id) => {
		const lab: OKLab = [sum.lab[0] / sum.area, sum.lab[1] / sum.area, sum.lab[2] / sum.area]
		return {
			id,
			area: sum.area,
			population: sum.area / total,
			centerX: sum.x / sum.area / Math.max(1, width - 1),
			centerY: sum.y / sum.area / Math.max(1, height - 1),
			lab,
			rgb: [0, 0, 0],
			borderPixels: sum.border,
			sideCount: ((sum.sides & 1) > 0 ? 1 : 0) + ((sum.sides & 2) > 0 ? 1 : 0) +
				((sum.sides & 4) > 0 ? 1 : 0) + ((sum.sides & 8) > 0 ? 1 : 0),
			edge: sum.edge / sum.area,
			variance: 0,
			distinctiveness: 0,
			localContrast: 0,
			background: 0,
			saliency: 0,
			text: 0,
			chroma: chroma(lab),
			neighbors: [],
		}
	})

	const representativeDistance = new Float32Array(regionCount).fill(Infinity)
	for (let pixel = 0; pixel < total; pixel++) {
		const region = regions[labels[pixel]]
		const distance = okDistance(labAt(labs, pixel), region.lab)
		region.variance += distance ** 2
		if (distance < representativeDistance[region.id]) {
			representativeDistance[region.id] = distance
			region.rgb = rgbAt(data, pixel)
		}
	}
	for (const region of regions) region.variance = Math.sqrt(region.variance / region.area)

	const boundarySums = new Map<number, Map<number, { sum: number; count: number }>>()
	const addBoundary = (first: number, second: number, edge: number): void => {
		if (first === second) return
		let neighbors = boundarySums.get(first)
		if (!neighbors) boundarySums.set(first, neighbors = new Map())
		const current = neighbors.get(second) || { sum: 0, count: 0 }
		current.sum += edge
		current.count++
		neighbors.set(second, current)
	}
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const pixel = y * width + x
			if (x + 1 < width) {
				const right = pixel + 1
				addBoundary(labels[pixel], labels[right], Math.max(edges[pixel], edges[right]))
				addBoundary(labels[right], labels[pixel], Math.max(edges[pixel], edges[right]))
			}
			if (y + 1 < height) {
				const down = pixel + width
				addBoundary(labels[pixel], labels[down], Math.max(edges[pixel], edges[down]))
				addBoundary(labels[down], labels[pixel], Math.max(edges[pixel], edges[down]))
			}
		}
	}
	const boundaryEdges = new Map<number, Map<number, number>>()
	for (const region of regions) {
		const sumsForRegion = boundarySums.get(region.id) || new Map()
		region.neighbors = [...sumsForRegion.keys()]
		const means = new Map<number, number>()
		for (const [neighbor, value] of sumsForRegion) means.set(neighbor, value.sum / value.count)
		boundaryEdges.set(region.id, means)
	}

	for (const region of regions) {
		let globalDistinctiveness = 0
		for (const other of regions) {
			if (other.id === region.id) continue
			const spatial = Math.hypot(region.centerX - other.centerX, region.centerY - other.centerY)
			const spatialWeight = 0.35 + 0.65 * Math.exp(-(spatial ** 2) / 0.18)
			globalDistinctiveness += other.population * okDistance(region.lab, other.lab) * spatialWeight
		}
		region.distinctiveness = globalDistinctiveness
		region.localContrast = region.neighbors.length === 0
			? 0
			: region.neighbors.reduce((sum, neighbor) => sum + okDistance(region.lab, regions[neighbor].lab), 0) / region.neighbors.length
	}

	const normalizedDistinctiveness = normalize(regions.map((region) => region.distinctiveness))
	const normalizedLocalContrast = normalize(regions.map((region) => region.localContrast))
	const normalizedEdge = normalize(regions.map((region) => region.edge))
	const normalizedVariance = normalize(regions.map((region) => region.variance))
	const normalizedSmallness = normalize(regions.map((region) => 1 / Math.sqrt(region.area)))
	for (const region of regions) {
		const centerDistance = Math.hypot(region.centerX - 0.5, region.centerY - 0.5) / Math.SQRT1_2
		const centerPrior = 1 - clamp01(centerDistance)
		const borderPenalty = region.borderPixels > 0 ? 0.2 : 0
		region.saliency = clamp01(
			normalizedDistinctiveness[region.id] * 0.5 +
			normalizedLocalContrast[region.id] * 0.27 +
			centerPrior * 0.23 - borderPenalty,
		)
		region.text = clamp01(
			normalizedEdge[region.id] * 0.38 +
			normalizedLocalContrast[region.id] * 0.27 +
			normalizedSmallness[region.id] * 0.2 +
			(1 - normalizedVariance[region.id]) * 0.15,
		)
	}

	const backgroundLikelihood = regionGraphBackground(regions, boundaryEdges)
	const normalizedBackground = normalize(backgroundLikelihood)
	for (const region of regions) region.background = normalizedBackground[region.id]

	return { regions, labels, labs, edges, data, width, height }
}
