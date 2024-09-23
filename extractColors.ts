import { Worker } from "node:worker_threads"
import type { ColorSpace } from "./spaces/types.ts"
import { oklabSpace } from "./spaces/oklab.ts"
import { rgbSpace } from "./spaces/rgb.ts"

type Meta = {
	/** number of channels in the image, must be 3 or 4 (RGB or RGBA) */
	channels: number
	width: number
	height: number
}


export async function extractColors(
	/** image data, must be smaller than 4_294_967_295 (equivalent to a 65_535 x 65_535 square) */
	source: Uint8ClampedArray | Uint8Array | Buffer,
	meta: Meta,
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

	const map = countColors(data, meta.channels, colorSpace)
	const sorted = sortColorMap(map)
	const array = transferableMap(sorted)
	console.log(name, "Unique Colors:", array.length / 2)
	const centroids = await strategy(name, colorSpace, array, source.length / meta.channels, useWorkers)
	console.log(name, centroids)
	if (clamp !== false) {
		clampCentroidsToOriginalColors(
			clamp,
			data.length / meta.channels,
			centroids,
			map,
			array,
			colorSpace,
		)
	}
	groupImperceptiblyDifferentColors(centroids, colorSpace)
	console.log(name, "Final Colors:", centroids)

	const outer = mainZoneColor(data, meta, colorSpace, centroids, 'outer')
	console.log(name, "Outer Color:", outer, colorSpace.lightness(outer))
	// const inner = mainZoneColor(data, meta, colorSpace, centroids, 'inner', exclude)
	const inner = (() => {
		let maxContrastValue = 0
		let maxContrastColor = 0
		for (const color of centroids.keys()) {
			if (color === outer) continue
			const contrast = colorSpace.contrast(color, outer)
			if (contrast > maxContrastValue) {
				maxContrastValue = contrast
				maxContrastColor = color
			}
		}
		return maxContrastColor
	})()
	const innerLum = colorSpace.lightness(inner)
	const outerLum = colorSpace.lightness(outer)
	const outerColors = Array.from(centroids.keys()).filter(c => {
		const lum = colorSpace.lightness(c)
		return Math.abs(lum - innerLum) > Math.abs(outerLum - innerLum)
	})
	// const lums = Array.from(centroids.keys()).map(c => colorSpace.lightness(c)).sort((a, b) => a - b)
	// const meanLum = lums[Math.floor(lums.length / 2)]
	// const outerSide = colorSpace.lightness(outer) > meanLum ? 1 : -1
	// const outerColors = Array.from(centroids.keys()).filter(c => colorSpace.lightness(c) * outerSide > meanLum * outerSide)
	// const innerColors = Array.from(centroids.keys()).filter(c => colorSpace.lightness(c) * -outerSide > meanLum * -outerSide)
	const total = data.length / meta.channels
	const third = (() => {
		let maxContrastValue = 0
		let maxContrastColor = -1
		for (const color of outerColors) {
			if (color === outer || color === inner) continue
			if (centroids.get(color)! / total < 0.01) continue
			const contrast = colorSpace.contrast(color, inner)
			if (contrast > maxContrastValue) {
				maxContrastValue = contrast
				maxContrastColor = color
			}
		}
		if (maxContrastColor === -1) {
			return outer
		}
		return maxContrastColor
	})()
	const accent = (() => {
		let maxContrastValue = 0
		let maxContrastColor = -1
		for (const color of centroids.keys()) {
			if (color === outer || color === inner || color === third) continue
			const contrast = colorSpace.contrast(color, outer)
			if (contrast > maxContrastValue) {
				maxContrastValue = contrast
				maxContrastColor = color
			}
		}
		if (maxContrastColor === -1) {
			return inner
		}
		return maxContrastColor
	})()

	return {
		centroids: new Map(Array.from(centroids.entries()).map(([color, count]) => [colorSpace.toRgb(color), count])),
		outer: colorSpace.toRgb(outer),
		inner: colorSpace.toRgb(inner),
		third: colorSpace.toRgb(third),
		accent: colorSpace.toRgb(accent),
	}
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

function transferableMap(map: [hex: number, count: number][]): Uint32Array {
	const length = map.length * 2
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
			// if we didn't find a color that is above the threshold, abandon threshold but still clamp to the closest color
			for (let i = 0; i < colorArray.length; i += 2) {
				if (colorArray[i + 1] / total >= min) continue
				const distance = colorSpace.distance(color, colorArray[i])
				if (distance < minDistance) {
					minDistance = distance
					closest = colorArray[i]
				}
			}
		}
		centroids.delete(color)
		centroids.set(closest, (centroids.get(closest) || 0) + count)
	}
}

function groupImperceptiblyDifferentColors(
	centroids: Map<number, number>,
	colorSpace: ColorSpace,
) {
	const final = Array.from(centroids.entries())
	const groups: Array<Set<number>> = []
	for (let i = 0; i < final.length; i++) {
		for (let j = i + 1; j < final.length; j++) {
			const a = final[i][0]
			const b = final[j][0]
			const dist = colorSpace.distance(a, b)
			if (dist < colorSpace.epsilon) {
				const clusters = groups.filter(g => g.has(a) || g.has(b))
				if (clusters.length === 0) {
					groups.push(new Set([a, b]))
				} else {
					const group = new Set<number>()
					for (const cluster of clusters) {
						for (const color of cluster) {
							group.add(color)
						}
						groups.splice(groups.indexOf(cluster), 1)
					}
					groups.push(group)
				}
			}
		}
	}
	if (groups.length > 0) {
		for (const group of groups) {
			let total = 0
			let max = 0
			let maxColor = 0
			for (const color of group) {
				const count = centroids.get(color) || 0
				total += count
				centroids.delete(color)
				if (count > max) {
					max = count
					maxColor = color
				}
			}
			centroids.set(maxColor, total)
		}
	}
}

function mainZoneColor(
	data: Uint8ClampedArray | Uint8Array,
	{ width, height, channels }: Meta,
	colorSpace: ColorSpace,
	centroids: Map<number, number>,
	direction: 'outer' | 'inner',
	exclude: number[] = []
) {
	const mult = direction === 'outer' ? 1 : -1
	const percent = direction === 'outer' ? 0.95 : 0.70
	// create a new Uint8ClampedArray from the source, which excludes all pixels within `radius` of the center
	const outside = new Uint8Array({
		[Symbol.iterator]: function* () {
			const radius = Math.max(width, height) / 2 * percent
			const wCenter = width / 2
			const hCenter = height / 2
			for (let i = 0; i < data.length; i += channels) {
				const x = i / channels % width
				const y = i / channels / width
				if (Math.hypot(x - wCenter, y - hCenter) * mult > radius * mult) {
					for (let j = 0; j < channels; j++) {
						yield data[i + j]
					}
				}
			}
		}
	})

	const map = countColors(outside, 3, colorSpace)

	const tally = new Map<number, number>()
	const centroidsArray = Array.from(centroids.keys()).filter(c => !exclude.includes(c))
	for (const [color, count] of map) {
		let closest = -1
		let minDistance = Infinity
		for (const centroid of centroidsArray) {
			const distance = colorSpace.distance(color, centroid)
			if (distance < minDistance) {
				minDistance = distance
				closest = centroid
			}
		}
		tally.set(closest, (tally.get(closest) || 0) + count)
	}

	const sorted = sortColorMap(tally)

	return sorted[0][0]
}

async function kmeans(name: string, space: ColorSpace, array: Uint32Array, k: number, useWorkers: boolean) {
	if (!useWorkers) {
		const { kmeans } = await import('./kmeans.worker.ts')
		return kmeans(name, space, array, k)
	}
	const worker = new Worker('./kmeans.worker.ts', {
		workerData: { buffer: array.buffer, k, space: space.name, name },
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
	(name: string, colorSpace: ColorSpace, data: Uint32Array, size: number, useWorkers: boolean): Promise<Map<number, number>>
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
	return async (name, space, data, size, useWorkers) => {
		const [startPoints, endPoints] = await Promise.all([
			Promise.all(start.map(k => kmeans(name, space, data, k, useWorkers))),
			Promise.all(end.map(k => kmeans(name, space, data, k, useWorkers))),
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

		return (await kmeans(name, space, data, optimal, useWorkers)).centroids
	}
}

// /**
//  * Using "gap statistic", we tend to get ~7 colors, which might be too many (e.g. black album gets 6 colors)
//  */
export function gapStatisticKmeans({ maxK = 10, minK = 1 } = {}): Strategy {
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
	return async (name, space, data, size, useWorkers) => {
		const ks = Array.from({ length: maxK - minK + 1 }, (_, i) => i + minK)

		const reference = makeUniformData(size)
		const [
			all,
			references
		] = await Promise.all([
			Promise.all(ks.map(k => kmeans(name, space, data, k, useWorkers))),
			Promise.all(ks.map(k => kmeans(name, space, reference, k, useWorkers))),
		])

		const gaps = ks.map((k, i) => {
			const wk = all[i].wcss
			const wkb = references[i].wcss
			const logWk = Math.log(wk)
			const logWkb = Math.log(wkb)
			const gap = logWkb - logWk
			return gap
		})

		const optimalIndex = gaps.indexOf(Math.max(...gaps))
		const optimal = ks[optimalIndex]
		console.log("Optimal K:", optimal)
		return all[optimalIndex].centroids
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


// function fooofoo() {
// 	let min = Infinity
// 	let minC = 0
// 	let max = -Infinity
// 	let maxC = 0

// 	for (let r = 0; r <= 255; r++) {
// 		for (let g = 0; g <= 255; g++) {
// 			for (let b = 0; b <= 255; b++) {
// 				const hex = oklabSpace.toHex([r, g, b], 0)
// 				const lum = oklabSpace.lightness(hex)
// 				if (lum < min) {
// 					min = lum
// 					minC = hex
// 				}
// 				if (lum > max) {
// 					max = lum
// 					maxC = hex
// 				}
// 			}
// 		}
// 	}

// 	console.log('min:', min, oklabSpace.toRgb(minC).toString(16).padStart(6, '0'))
// 	console.log('max:', max, oklabSpace.toRgb(maxC).toString(16).padStart(6, '0'))

// 	console.log(oklabSpace.lightness(oklabSpace.toHex([0, 0, 0], 0)))
// 	console.log(oklabSpace.lightness(oklabSpace.toHex([255, 255, 255], 0)))
// }

// fooofoo()






// const white = rgbSpace.toHex([255, 255, 255], 0)
// const black = rgbSpace.toHex([0, 0, 0], 0)
// console.log(rgbSpace.contrast(black, white))
// console.log(rgbSpace.contrast(white, black))