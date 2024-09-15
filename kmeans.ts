import { parentPort, workerData, isMainThread } from 'worker_threads'

function euclideanDistance(hex1: number, hex2: number): number {
	const r = (hex1 >> 16 & 0xff) - (hex2 >> 16 & 0xff)
	const g = (hex1 >> 8 & 0xff) - (hex2 >> 8 & 0xff)
	const b = (hex1 & 0xff) - (hex2 & 0xff)
	return Math.sqrt(r * r + g * g + b * b)
}

function computeCentroid(colors: Uint32Array, cluster: number[]): number {
	let r = 0
	let g = 0
	let b = 0
	let total = 0
	for (const index of cluster) {
		const color = colors[index * 2]
		const count = colors[index * 2 + 1]
		total += count
		r += (color >> 16 & 0xff) * count
		g += (color >> 8 & 0xff) * count
		b += (color & 0xff) * count
	}
	return (r / total) << 16 | (g / total) << 8 | (b / total)
}

function computeMedian(colors: number[], centroid: number): number {
	let minDistance = Infinity
	let median = centroid
	for (const color of colors) {
		const distance = euclideanDistance(color, centroid)
		if (distance < minDistance) {
			minDistance = distance
			median = color
		}
	}
	return median
}

export function kmeans(data: Uint32Array, k = 5) {
	const colors: number[] = []
	for (let i = 0; i < data.length; i += 2) {
		colors.push(data[i])
	}
	const centroids = Array.from({ length: k }, (_, i) => colors[i])
	const clusters: number[] = new Array(colors.length).fill(-1)

	const getColorsInCluster = (cluster: number) => {
		return clusters.reduce((acc, c, j) => {
			if (cluster === c) acc.push(j)
			return acc
		}, [] as number[])
	}

	const maxIterations = 100
	for (let iteration = 0; iteration < maxIterations; iteration++) {
		let hasChanged = false
		for (let i = 0; i < colors.length; i++) {
			const color = colors[i]
			let minDistance = Infinity
			let cluster = -1
			for (let j = 0; j < k; j++) {
				const distance = euclideanDistance(color, centroids[j])
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
			const cluster = getColorsInCluster(i)
			centroids[i] = computeCentroid(data, cluster)
		}
	}

	const result = new Map(centroids.map((centroid, i) => {
		const candidates = getColorsInCluster(i)
		const color = computeMedian(candidates.map(i => data[i * 2]), centroid)
		const count = candidates.reduce((acc, c) => acc + data[c * 2 + 1], 0)
		return [color, count]
	}))

	/** within-cluster sum of squares */
	let wcss = 0
	let total = 0
	for (let i = 0; i < colors.length; i++) {
		const color = colors[i]
		const count = data[i * 2 + 1]
		const centroid = centroids[clusters[i]]
		wcss += Math.pow(euclideanDistance(color, centroid), 2) * count
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
	/** array of repeated pairs color,count */
	const array = new Uint32Array(workerData.buffer)
	const k = workerData.k
	parentPort.postMessage(kmeans(array, k))
}