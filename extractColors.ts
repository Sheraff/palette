import { Worker } from "node:worker_threads"

/**
 * @param source image data, must be smaller than 4_294_967_295 (equivalent to a 65_535 x 65_535 square)
 * @param channels number of channels in the image, must be 3 or 4 (RGB or RGBA)
 * @param useWorkers whether to use worker threads for the kmeans algorithm, which is CPU intensive
 */
export function extractColors(source: Uint8ClampedArray | Uint8Array | Buffer, channels: number, useWorkers = true) {
	const data = source instanceof Buffer ? Uint8ClampedArray.from(source) : source
	const colors = countColors(data, channels)
	console.log("Unique Colors:", colors.size)
	const array = transferableMap(colors)
	return findOptimalClusters(array, useWorkers)
}

function countColors(array: Uint8ClampedArray | Uint8Array, channels: number): Map<number, number> {
	const colors = new Map<number, number>()
	for (let i = 0; i < array.length; i += channels) {
		const hex = arrayToHex(array, i)
		colors.set(hex, (colors.get(hex) || 0) + 1)
	}
	return colors
}
function arrayToHex(array: Uint8ClampedArray | Uint8Array, index: number): number {
	return array[index] << 16 | array[index + 1] << 8 | array[index + 2]
}

function transferableMap(map: Map<number, number>): Uint32Array {
	const length = map.size * 2
	const buffer = new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT * length)
	/**
	 * using a `Uint32Array` (max 4_294_967_295), in `key-value` pairs:
	 * - the max `key` is a color, in a 24-bit RGB image, the max color is 16_777_215 (0xffffff)
	 * - the max `value` is a count of pixels, in a 300x300 image, the max count is 90_000
	 */
	const array = new Uint32Array(buffer)
	let i = 0
	for (const [key, value] of map) {
		array[i++] = key
		array[i++] = value
	}
	return array
}

async function kmeans(array: Uint32Array, k: number, useWorkers: boolean) {
	if (!useWorkers) {
		const { kmeans } = await import('./kmeans.worker.ts')
		return kmeans(array, k)
	}
	const worker = new Worker('./kmeans.worker.ts', {
		workerData: { buffer: array.buffer, k },

	})
	return new Promise<{ centroids: Map<number, number>, wcss: number }>((resolve, reject) => {
		worker.on('message', resolve)
		worker.on('error', reject)
		worker.on('exit', (code) => {
			if (code !== 0)
				reject(new Error(`Worker stopped with exit code ${code}`))
		})
	})
}

/**
 * We don't know how many clusters we need in advance,
 * i.e. how many colors we should divide the pixels into to get the most accurate representation.
 * 
 * We can use the elbow method to find the optimal number of clusters:
 * 1. Compute the Within-Cluster-Sum-of-Squares (WCSS) for different values of K (number of clusters).
 * 2. We take "early" K values (at which the WCSS is still decreasing rapidly) and "late" K values (at which the WCSS is decreasing slowly).
 * 3. We compute the point at which the slopes of the early and late K values intersect.
 * 
 * The "slope intersection" is not trivial to compute and is easily influenced by the `start` and `end` values.
 * It should be improved by using a more sophisticated method, such as the "gap statistic".
 */
async function findOptimalClusters(data: Uint32Array, useWorkers: boolean) {
	const start = [2, 3]
	const end = [30, 50, 100]

	// technically the point end[data.length/2] will have a wcss of 0, we could include that in the end array

	const [startPoints, endPoints] = await Promise.all([
		Promise.all(start.map(k => kmeans(data, k, useWorkers))),
		Promise.all(end.map(k => kmeans(data, k, useWorkers))),
	])
	if (data.length / 2 > end.at(-1)! * 2) {
		end.push(data.length / 2)
		endPoints.push({ centroids: new Map(), wcss: 0 })
	}

	const startSlope = startPoints.reduce((acc, val, i, arr) => i === 0 ? 0 : acc + (val.wcss - arr[i - 1].wcss) / (start[i] - start[i - 1]), 0) / (start.length - 1)
	const endSlope = endPoints.reduce((acc, val, i, arr) => i === 0 ? 0 : acc + (val.wcss - arr[i - 1].wcss) / (end[i] - end[i - 1]), 0) / (end.length - 1)

	const startPoint = startPoints[0].wcss
	const endPoint = endPoints[0].wcss

	console.log("Start Slope:", startSlope, startPoints.map(p => p.wcss))
	console.log("End Slope:", endSlope, endPoints.map(p => p.wcss))

	// compute at which K the start slope and end slope intersect
	// wcss = m * k + b
	// start: wcss = startSlope * k + startPoint - startSlope * start[0]
	// end: wcss = endSlope * k + endPoint - endSlope * end[0]
	// startSlope * k + startPoint - startSlope * start[0] = endSlope * k + endPoint - endSlope * end[0]
	// k = (endPoint - endSlope * end[0] - startPoint + startSlope * start[0]) / (startSlope - endSlope)

	const _optimal = (endPoint - endSlope * end[0] - startPoint + startSlope * start[0]) / (startSlope - endSlope)
	console.log("Optimal K:", _optimal)
	const optimal = Math.round(_optimal)

	const inStart = start.indexOf(optimal)
	if (inStart !== -1) {
		return startPoints[inStart].centroids
	}
	const inEnd = end.indexOf(optimal)
	if (inEnd !== -1) {
		return endPoints[inEnd].centroids
	}

	return (await kmeans(data, optimal, useWorkers)).centroids
}