import { Worker } from "node:worker_threads"
import type { ColorSpace } from "./spaces/types.ts"
import { oklabSpace } from "./spaces/oklab.ts"


export async function extractColors(
	/** image data, must be smaller than 4_294_967_295 (equivalent to a 65_535 x 65_535 square) */
	source: Uint8ClampedArray | Uint8Array | Buffer,
	/** number of channels in the image, must be 3 or 4 (RGB or RGBA) */
	channels: number,
	{
		useWorkers = true,
		colorSpace = oklabSpace,
		strategy = elbowKmeans(),
		clamp = true,
	}: {
		/** whether to use worker threads for the kmeans algorithm, which is CPU intensive */
		useWorkers?: boolean
		colorSpace?: ColorSpace
		strategy?: Strategy
		/** when enabled, forbids the use of colors that aren't in the initial data in the final result, use a [0-100] number to impose a % floor under which use of those colors is also forbidden */
		clamp?: boolean | number
	} = {},
	name = ""
) {
	const data = source instanceof Buffer ? Uint8ClampedArray.from(source) : source
	const map = countColors(data, 3, colorSpace)
	const array = transferableMap(map)
	console.log(name, "Unique Colors:", array.length / 2)
	const centroids = await strategy(colorSpace, array, source.length / channels, useWorkers)
	console.log(name, centroids)
	if (clamp !== false) {
		clampCentroidsToOriginalColors(
			clamp,
			data.length / channels,
			centroids,
			map,
			array,
			colorSpace
		)
	}
	console.log(name, "Final Colors:", centroids)
	// const final = Array.from(centroids.entries())
	// const groups: Array<Set<number>> = []
	// for (let i = 0; i < final.length; i++) {
	// 	for (let j = i + 1; j < final.length; j++) {
	// 		const a = final[i][0]
	// 		const b = final[j][0]
	// 		const dist = colorSpace.distance(a, b)
	// 		if (dist < colorSpace.epsilon) {
	// 			const clusters = groups.filter(g => g.has(a) || g.has(b))
	// 			if (clusters.length === 0) {
	// 				groups.push(new Set([a, b]))
	// 			} else {
	// 				const group = new Set<number>()
	// 				for (const cluster of clusters) {
	// 					for (const color of cluster) {
	// 						group.add(color)
	// 					}
	// 					groups.splice(groups.indexOf(cluster), 1)
	// 				}
	// 				groups.push(group)
	// 			}
	// 			console.log(name, "Distance between", a.toString(16).padStart(6, '0'), "and", b.toString(16).padStart(6, '0'), "is", dist)
	// 		}
	// 		else if (dist < 20) {
	// 			console.log(name, "Distance between FOO", a.toString(16).padStart(6, '0'), "and", b.toString(16).padStart(6, '0'), "is", dist)
	// 		}
	// 	}
	// }
	// if (groups.length > 0) {
	// 	for (const group of groups) {
	// 		let total = 0
	// 		let max = 0
	// 		let maxColor = 0
	// 		for (const color of group) {
	// 			const count = centroids.get(color) || 0
	// 			total += count
	// 			centroids.delete(color)
	// 			if (count > max) {
	// 				max = count
	// 				maxColor = color
	// 			}
	// 		}
	// 		centroids.set(maxColor, total)
	// 	}
	// }
	return new Map(Array.from(centroids.entries()).map(([color, count]) => [colorSpace.toRgb(color), count]))
}

function sortColorMap(colors: Map<number, number>): [hex: number, count: number][] {
	return Array.from(colors.entries()).sort((a, b) => b[1] - a[1])
}

function countColors2(
	array: Uint8ClampedArray | Uint8Array,
	channels: number,
	colorSpace: ColorSpace
): Uint32Array {
	const total = array.length / channels
	const max = 256 ** Uint32Array.BYTES_PER_ELEMENT - 1
	if (total > max) throw new Error(`Image is too large, it must be smaller than ${max} pixels`)
	/**
	 * Count the number of pixels for each color
	 */
	const counts = new Uint32Array(0xffffff)
	for (let i = 0; i < array.length; i += channels) {
		const hex = colorSpace.toHex(array, i)
		counts[hex]++
	}
	/**
	 * Count the number of unique colors
	 */
	let colorsCount = 0
	for (let i = 0; i < counts.length; i++) {
		const count = counts[i]
		if (count === 0) continue
		colorsCount++
	}
	/**
	 * Reduce to a smaller map based on shared array buffer
	 * using a `Uint32Array` (max 4_294_967_295), in `key-value` pairs:
	 * - the max `key` is a color, in a 24-bit RGB image, the max color is 16_777_215 (0xffffff)
	 * - the max `value` is a count of pixels, in a 300x300 image, the max count is 90_000
	 */
	const buffer = new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT * colorsCount * 2)
	const transferable = new Uint32Array(buffer)
	let j = 0
	for (let i = 0; i < counts.length; i++) {
		const count = counts[i]
		if (count === 0) continue
		transferable[j++] = i
		transferable[j++] = count
	}
	return transferable
}

function countColors(
	array: Uint8ClampedArray | Uint8Array,
	channels: number,
	colorSpace: ColorSpace
): Map<number, number> {
	const colors = new Map<number, number>()
	for (let i = 0; i < array.length; i += channels) {
		const hex = colorSpace.toHex(array, i)
		colors.set(hex, (colors.get(hex) || 0) + 1)
	}
	return colors
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

function clampCentroidsToOriginalColors(
	clamp: boolean | number,
	total: number,
	centroids: Map<number, number>,
	colorMap: Map<number, number>,
	colorArray: Uint32Array,
	colorSpace: ColorSpace,
) {
	const min = typeof clamp === 'number' ? clamp / 100 : 0
	for (const [color, count] of centroids) {
		const exact = colorMap.get(color)
		if (exact && exact / total >= min) continue
		let minDistance = Infinity
		let closest: number = -1
		for (let i = 0; i < colorArray.length; i += 2) {
			if (colorArray[i + 1] / total < min) continue
			const distance = colorSpace.distance(color, colorArray[i])
			if (distance < minDistance) {
				minDistance = distance
				closest = colorArray[i]
			}
		}
		if (closest === -1) {
			console.log(name, "Couldn't find a close color for", color)
			continue
		}
		centroids.delete(color)
		centroids.set(closest, (centroids.get(closest) || 0) + count)
	}
}

async function kmeans(space: ColorSpace, array: Uint32Array, k: number, useWorkers: boolean) {
	if (!useWorkers) {
		const { kmeans } = await import('./kmeans.worker.ts')
		return kmeans(space.distance, array, k)
	}
	const worker = new Worker('./kmeans.worker.ts', {
		workerData: { buffer: array.buffer, k, space: space.name },
	})
	worker.unref()
	return new Promise<{ centroids: Map<number, number>, wcss: number }>((resolve, reject) => {
		worker.on('message', resolve)
		worker.on('error', reject)
		worker.on('exit', (code) => {
			if (code !== 0)
				reject(new Error(`Worker stopped with exit code ${code}`))
		})
	})
}

// const degreesToHex = 255 / 360
// const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
// export const oklchSpace: ColorSpace = {
// 	/** takes RGB values in 0-255 from an array, and converts them to an okLCH value as a single uint8 number */
// 	toHex(array, index) {
// 		/** 
// 		 * l: 0;100
// 		 * c: 0;100
// 		 * h: 0;360
// 		 */
// 		const lch = rgb2oklch([array[index], array[index + 1], array[index + 2]])
// 		if (Number.isNaN(lch[2])) lch[2] = 0
// 		return Math.round(lch[0] * 2.55) << 16 | Math.round(lch[1] * 2.55) << 8 | Math.round(lch[2] * degreesToHex)
// 	},
// 	/** takes okLCH uint8 number, and converts it to an RGB value as a single uint8 number */
// 	toRgb(hex) {
// 		const rgb = oklch2rgb([(hex >> 16 & 0xff) / 2.55, (hex >> 8 & 0xff) / 2.55, (hex & 0xff) / degreesToHex] as Color)
// 		return clamp(rgb[0]) << 16 | clamp(rgb[1]) << 8 | clamp(rgb[2])
// 	},
// }




interface Strategy {
	(colorSpace: ColorSpace, data: Uint32Array, size: number, useWorkers: boolean): Promise<Map<number, number>>
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
export function elbowKmeans({
	start = [1, 2, 3, 4],
	end = [50, 100]
} = {}): Strategy {
	return async (space, data, size, useWorkers) => {
		const [startPoints, endPoints] = await Promise.all([
			Promise.all(start.map(k => kmeans(space, data, k, useWorkers))),
			Promise.all(end.map(k => kmeans(space, data, k, useWorkers))),
		])

		// for 1 cluster per color, we can guarantee that the WCSS is 0, which can be used to compute the slope intersection
		if (size > end.at(-1)! * 2) {
			end.push(size)
			endPoints.push({ centroids: new Map(), wcss: 0 })
		}

		const startSlope = startPoints.reduce((acc, val, i, arr) => i === 0
			? 0
			: acc + (val.wcss - arr[i - 1].wcss) / (start[i] - start[i - 1]),
			0
		) / (start.length - 1)
		const endSlope = endPoints.reduce((acc, val, i, arr) => i === 0
			? 0
			: acc + (val.wcss - arr[i - 1].wcss) / (end[i] - end[i - 1]),
			0
		) / (end.length - 1)

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

		return (await kmeans(space, data, optimal, useWorkers)).centroids
	}
}

// /**
//  * Using "gap statistic", we tend to get ~7 colors, which might be too many (e.g. black album gets 6 colors)
//  */
export function gapStatisticKmeans({ maxK = 10 } = {}): Strategy {
	function makeUniformData(size: number) {
		const max = 0xffffff
		const step = max / size
		const array = new Uint32Array(size * 2)
		for (let i = 0; i < size; i++) {
			const color = Math.round(i * step)
			array[i] = color
			array[i + 1] = 1
		}
		return array
	}
	return async (space, data, size, useWorkers) => {
		const ks = Array.from({ length: maxK }, (_, i) => i + 1)

		const reference = makeUniformData(size)
		const [
			all,
			references
		] = await Promise.all([
			Promise.all(ks.map(k => kmeans(space, data, k, useWorkers))),
			Promise.all(ks.map(k => kmeans(space, reference, k, useWorkers))),
		])

		const gaps = ks.map((k) => {
			const wk = all[k - 1].wcss
			const wkb = references[k - 1].wcss
			const logWk = Math.log(wk)
			const logWkb = Math.log(wkb)
			const gap = logWkb - logWk
			return gap
		})

		const optimal = gaps.indexOf(Math.max(...gaps)) + 1
		console.log("Optimal K:", optimal)
		return all[optimal - 1].centroids
	}
}




// import sharp from "sharp"
// import { join } from "node:path"
// import { performance } from "node:perf_hooks"
// function test() {
// 	const image = 'images/placebo.jpg'
// 	const cwd = process.cwd()
// 	const path = join(cwd, image)
// 	sharp(path)
// 		.raw({ depth: "uchar" })
// 		.toBuffer({ resolveWithObject: true })
// 		.then(async ({ data, info }) => {
// 			const TEST_COUNT = 100

// 			global.gc && global.gc()

// 			{
// 				const initialMemory = process.memoryUsage()
// 				const results = new Array(TEST_COUNT)
// 				const start = performance.now()
// 				for (let i = 0; i < TEST_COUNT; i++) {
// 					i % 10 === 0 && console.log('i', i)
// 					const array = transferableMap(countColors(data, 3, oklchSpace))
// 					results[i] = array.length / 2
// 				}
// 				const end = performance.now()
// 				const finalMemory = process.memoryUsage()
// 				console.log('countColors took:', (end - start) / TEST_COUNT, 'ms', results.at(-1))
// 				console.log('Memory rss:', readableSize(finalMemory.rss - initialMemory.rss))
// 				console.log('Memory heapUsed:', readableSize(finalMemory.heapUsed - initialMemory.heapUsed))
// 				console.log('Memory external:', readableSize(finalMemory.external - initialMemory.external))
// 				console.log('Memory arrayBuffers:', readableSize(finalMemory.arrayBuffers - initialMemory.arrayBuffers))
// 			}

// 			global.gc && global.gc()

// 			{
// 				const initialMemory = process.memoryUsage()
// 				const results = new Array(TEST_COUNT)
// 				const start = performance.now()
// 				for (let i = 0; i < TEST_COUNT; i++) {
// 					i % 10 === 0 && console.log('i', i)
// 					const array = countColors2(data, 3, oklchSpace)
// 					results[i] = array.length / 2
// 				}
// 				const end = performance.now()
// 				const finalMemory = process.memoryUsage()
// 				console.log('countColors2 took:', (end - start) / TEST_COUNT, 'ms', results.at(-1))
// 				console.log('Memory rss:', readableSize(finalMemory.rss - initialMemory.rss))
// 				console.log('Memory heapUsed:', readableSize(finalMemory.heapUsed - initialMemory.heapUsed))
// 				console.log('Memory external:', readableSize(finalMemory.external - initialMemory.external))
// 				console.log('Memory arrayBuffers:', readableSize(finalMemory.arrayBuffers - initialMemory.arrayBuffers))
// 			}

// 		})
// }

// test()


// function readableSize(bytes: number) {
// 	const sign = bytes < 0 ? '-' : ''
// 	bytes = Math.abs(bytes)
// 	const units = ['B', 'KB', 'MB', 'GB', 'TB']
// 	let i = 0
// 	while (bytes >= 1024 && i < units.length - 1) {
// 		bytes /= 1024
// 		i++
// 	}
// 	return `${sign}${bytes.toFixed(2)} ${units[i]}`
// }


// function fiifoo() {
// 	let minX = Infinity
// 	let maxX = -Infinity
// 	let minY = Infinity
// 	let maxY = -Infinity
// 	let minZ = Infinity
// 	let maxZ = -Infinity

// 	for (let l = 0; l <= 100; l++) {
// 		for (let c = 0; c <= 100; c++) {
// 			for (let h = 0; h <= 360; h++) {
// 				const [x, y, z] = oklch2oklab([l, c, h])
// 				minX = Math.min(minX, x)
// 				maxX = Math.max(maxX, x)
// 				minY = Math.min(minY, y)
// 				maxY = Math.max(maxY, y)
// 				minZ = Math.min(minZ, z)
// 				maxZ = Math.max(maxZ, z)
// 			}
// 		}
// 	}
// 	console.log('minX:', minX, 'maxX:', maxX)
// 	console.log('minY:', minY, 'maxY:', maxY)
// 	console.log('minZ:', minZ, 'maxZ:', maxZ)


// 	for (let i = 0; i < 0xffffff; i++) {
// 		const r = i >> 16 & 0xff
// 		const g = i >> 8 & 0xff
// 		const b = i & 0xff
// 		const [x, y, z] = rgb2oklab([r, g, b])
// 		minX = Math.min(minX, x)
// 		maxX = Math.max(maxX, x)
// 		minY = Math.min(minY, y)
// 		maxY = Math.max(maxY, y)
// 		minZ = Math.min(minZ, z)
// 		maxZ = Math.max(maxZ, z)
// 	}
// 	console.log('minX:', minX, 'maxX:', maxX)
// 	console.log('minY:', minY, 'maxY:', maxY)
// 	console.log('minZ:', minZ, 'maxZ:', maxZ)
// }

// fiifoo()