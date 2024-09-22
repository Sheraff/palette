import { parentPort, workerData, isMainThread } from 'node:worker_threads'
import { rgbSpace } from "./spaces/rgb.ts"
import { oklabSpace } from "./spaces/oklab.ts"
import type { ColorSpace } from "./spaces/types.ts"

const difference: Record<string, ColorSpace['distance']> = {
	rgb: rgbSpace.distance,
	oklab: oklabSpace.distance,
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
		x += (color >> 16 & 0xff) * count
		y += (color >> 8 & 0xff) * count
		z += (color & 0xff) * count
	}
	return Math.round(x / total) << 16 | Math.round(y / total) << 8 | Math.round(z / total)
}

function computeMedian(delta: ColorSpace['distance'], colors: number[], centroid: number): number {
	let minDistance = Infinity
	let median = centroid
	for (const color of colors) {
		const distance = delta(color, centroid)
		if (distance < minDistance) {
			minDistance = distance
			median = color
		}
	}
	return median
}

/**
 * @param space color space string ID
 * @param data repeated pairs color,count, kind of like a flattened Map
 * color: 0xffffff
 *          ││││└┴──> z
 *          ││└┴──> y
 *          └┴──> x
 * @param k number of clusters
 */
export function kmeans(delta: ColorSpace['distance'], data: Uint32Array, k = 5) {
	const n = data.length / 2
	const centroids = Array.from({ length: k }, (_, i) => data[i * 2])
	/** The value of `clusters[n]` means "the color at `data[n*2]` belongs to `centroids[clusters[n]]`" */
	const clusters: number[] = new Array(n)

	const maxIterations = 100
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
				}
			}
			if (clusters[i] !== cluster) {
				hasChanged = true
			}
			clusters[i] = cluster
		}
		if (!hasChanged) {
			break
		}
		for (let i = 0; i < k; i++) {
			centroids[i] = computeCentroid(data, clusters, i)
		}
	}

	const result = new Map(centroids.map((centroid, i) => {
		const candidates = clusters.reduce(
			(acc, c, j) => ((i === c && acc.push(j)), acc),
			[] as number[]
		)
		const color = computeMedian(delta, candidates.map(i => data[i * 2]), centroid)
		const count = candidates.reduce((acc, c) => acc + data[c * 2 + 1], 0)
		return [color, count]
	}))

	/** within-cluster dispersion (sum of squared distances to the cluster's centroid) */
	let wcss = 0
	let total = 0
	for (let i = 0; i < n; i++) {
		const color = data[i * 2]
		const count = data[i * 2 + 1]
		const centroid = centroids[clusters[i]]
		wcss += Math.pow(delta(color, centroid), 2) * count
		total += count
	}
	wcss /= total

	return {
		centroids: result,
		wcss,
	}
}


if (!isMainThread) {
	if (!parentPort) throw new Error('No parent port')
	const array = new Uint32Array(workerData.buffer)
	const k = workerData.k
	const space = workerData.space
	parentPort.postMessage(kmeans(difference[space], array, k))
}