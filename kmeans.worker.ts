import { parentPort, workerData, isMainThread } from 'node:worker_threads'
import { rgbSpace } from "./spaces/rgb.ts"
import { oklabSpace } from "./spaces/oklab.ts"
import { labSpace } from "./spaces/lab.ts"
import type { ColorSpace } from "./spaces/types.ts"

const difference: Record<string, ColorSpace> = {
	rgb: rgbSpace,
	oklab: oklabSpace,
	lab: labSpace,
}

/**
 * Euclidian center of mass of a cluster in arbitrary color space
 */
function computeCentroid(colors: Uint32Array, clusters: number[], index: number): number {
	let x = 0
	let y = 0
	let z = 0
	let total = 0
	for (let i = 0; i < clusters.length; i++) {
		if (index !== clusters[i]) continue
		const color = colors[i * 2]
		const count = colors[i * 2 + 1]
		total += count
		x += (color >> 16) * count
		y += (color >> 8 & 0xff) * count
		z += (color & 0xff) * count
	}
	return Math.round(x / total) << 16 | Math.round(y / total) << 8 | Math.round(z / total)
}

/**
 * In the list of `colors`, find the one that is closest to `centroid`
 * @param colors list of hex colors
 * @param centroid hex color
 */
function closestColor(space: ColorSpace, colors: number[], centroid: number): number {
	let minDistance = Infinity
	let median = centroid
	for (let i = 0; i < colors.length; i++) {
		const color = colors[i]
		const distance = space.distance(color, centroid)
		if (distance < minDistance) {
			minDistance = distance
			median = color
		}
	}
	return median
}

/**
 * initialize centroids as the first K unique colors (i.e. all significantly different from each other)
 */
function initialCentroids(name: string, space: ColorSpace, data: Uint32Array, k: number, n: number): Array<number> {
	const centroids = Array<number>(k)

	/** index of `centroid` for which we're currently looking for a color */
	let j = 0

	for (let i = 0; i < n; i++) {
		const candidate = data[i * 2]
		let unique = true
		for (let l = 0; l < j; l++) {
			if (space.distance(centroids[l], candidate) < space.epsilon) {
				unique = false
				break
			}
		}
		if (unique) {
			centroids[j] = candidate
			j++
			if (j === k) {
				break
			}
		}
	}

	if (j < k) {
		centroids.length = j
		console.log(name, 'Not enough unique colors to create k clusters', { j, k, n })
	}

	return centroids
}

/**
 * @param space color space string ID
 * @param data repeated pairs color,count, kind of like a flattened Map
 * color: 0xffffff
 *          ││││└┴──> z
 *          ││└┴──> y
 *          └┴──> x
 * @param k number of clusters (can be reduced if data doesn't have enough unique colors)
 */
export function kmeans(name: string, space: ColorSpace, data: Uint32Array, k = 5) {
	const n = data.length / 2
	const centroids = initialCentroids(name, space, data, k, n)
	if (centroids.length !== k) {
		k = centroids.length
	}
	/** The value of `clusters[n]` means "the color at `data[n*2]` belongs to `centroids[clusters[n]]`" */
	const clusters: number[] = new Array(n)

	const maxIterations = 100
	const delta = space.distance
	for (let iteration = 0; iteration < maxIterations; iteration++) {
		let hasChanged = false
		for (let i = 0; i < n; i++) {
			const color = data[i * 2]
			let minDistance = Infinity
			let cluster = -1
			for (let j = 0; j < k; j++) {
				const distance = delta(color, centroids[j])
				if (distance < minDistance) {
					minDistance = distance
					cluster = j
					// if (distance < space.epsilon) break
				}
			}
			if (clusters[i] !== cluster) {
				clusters[i] = cluster
				hasChanged = true
			}
		}
		if (!hasChanged) {
			break
		}
		for (let i = 0; i < k; i++) {
			centroids[i] = computeCentroid(data, clusters, i)
		}
	}

	const result = new Map<number, number>()
	for (let i = 0; i < centroids.length; i++) {
		const centroid = centroids[i]
		/** index of all the colors that participated in this cluster's centroid */
		const candidates = clusters.reduce(
			findColorIndicesForCentroid.bind(null, i),
			[] as number[]
		)
		const color = closestColor(space, candidates.map(findColorsForIndices.bind(null, data)), centroid)
		const count = candidates.reduce(sumCountsForIndices.bind(null, data), 0)
		result.set(color, count)
	}

	/** within-cluster dispersion (sum of squared distances to the cluster's centroid) */
	let wcss = 0
	let total = 0
	for (let i = 0; i < n; i++) {
		const color = data[i * 2]
		const count = data[i * 2 + 1]
		const centroid = centroids[clusters[i]]
		wcss += Math.pow(space.distance(color, centroid), 2) * count
		total += count
	}
	wcss /= total

	return {
		centroids: result,
		wcss,
		k,
	}
}

const findColorIndicesForCentroid = (i: number, acc: number[], c: number, j: number): number[] => ((i === c && acc.push(j)), acc)
const findColorsForIndices = (data: Uint32Array, i: number): number => data[i * 2]
const sumCountsForIndices = (data: Uint32Array, acc: number, i: number): number => acc + data[i * 2 + 1]


if (!isMainThread) {
	if (!parentPort) throw new Error('No parent port')
	const array = new Uint32Array(workerData.buffer)
	const k = workerData.k
	const space = workerData.space
	const name = workerData.name
	parentPort.postMessage(kmeans(name, difference[space], array, k))
}