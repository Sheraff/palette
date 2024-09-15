import { Worker } from "node:worker_threads"
import { type Color, rgb2oklch, oklch2rgb, oklab2rgb, rgb2oklab } from "./conversion.ts"

/**
 * @param source image data, must be smaller than 4_294_967_295 (equivalent to a 65_535 x 65_535 square)
 * @param channels number of channels in the image, must be 3 or 4 (RGB or RGBA)
 * @param useWorkers whether to use worker threads for the kmeans algorithm, which is CPU intensive
 */
export async function extractColors(
	source: Uint8ClampedArray | Uint8Array | Buffer,
	channels: number,
	{
		useWorkers = true,
		colorSpace = oklchSpace,
		strategy = elbowKmeans()
	}: {
		useWorkers?: boolean
		colorSpace?: ColorSpace
		strategy?: Strategy
	} = {}
) {
	const data = source instanceof Buffer ? Uint8ClampedArray.from(source) : source
	const colors = countColors(data, channels, colorSpace)
	console.log("Unique Colors:", colors.size)
	const array = transferableMap(colors)
	const centroids = await strategy(array, source.length / channels, useWorkers)
	console.log(centroids)
	return new Map(Array.from(centroids.entries()).map(([color, count]) => [colorSpace.toRgb(color), count]))
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


interface ColorSpace {
	toHex(array: Uint8ClampedArray | Uint8Array | Array<number>, index: number): number
	toRgb(hex: number): number
}

const degreesToHex = 255 / 360
export const oklchSpace: ColorSpace = {
	/** takes RGB values in 0-255 from an array, and converts them to an okLCH value as a single uint8 number */
	toHex(array, index) {
		const lch = rgb2oklch([array[index], array[index + 1], array[index + 2]])
		if (Number.isNaN(lch[2])) lch[2] = 0
		return Math.round(lch[0] * 2.55) << 16 | Math.round(lch[1] * 2.55) << 8 | Math.round(lch[2] * degreesToHex)
	},
	/** takes okLCH uint8 number, and converts it to an RGB value as a single uint8 number */
	toRgb(hex) {
		const rgb = oklch2rgb([(hex >> 16 & 0xff) / 2.55, (hex >> 8 & 0xff) / 2.55, (hex & 0xff) / degreesToHex] as Color)
		return rgb[0] << 16 | rgb[1] << 8 | rgb[2]
	},
}

// const negativePercentToHex = 255 / 200
// export const oklabSpace: ColorSpace = {
// 	toHex(array, index) {
// 		const lab = rgb2oklab([array[index], array[index + 1], array[index + 2]])
// 		return Math.round(lab[0] * 2.55) << 16 | Math.round((lab[1] + 100) * negativePercentToHex) << 8 | Math.round((lab[2] + 100) * negativePercentToHex)
// 	},
// 	toRgb(hex) {
// 		const rgb = oklab2rgb([(hex >> 16 & 0xff) / 2.55, (hex >> 8 & 0xff) / negativePercentToHex - 100, (hex & 0xff) / negativePercentToHex - 100] as Color)
// 		return rgb[0] << 16 | rgb[1] << 8 | rgb[2]
// 	},
// }

export const rgbSpace: ColorSpace = {
	toHex(array, index) {
		return array[index] << 16 | array[index + 1] << 8 | array[index + 2]
	},
	toRgb(hex) {
		return hex
	}
}




interface Strategy {
	(data: Uint32Array, size: number, useWorkers: boolean): Promise<Map<number, number>>
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
	return async (data, size, useWorkers) => {
		const [startPoints, endPoints] = await Promise.all([
			Promise.all(start.map(k => kmeans(data, k, useWorkers))),
			Promise.all(end.map(k => kmeans(data, k, useWorkers))),
		])

		// for 1 cluster per color, we can guarantee that the WCSS is 0, which can be used to compute the slope intersection
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
	return async (data, size, useWorkers) => {
		const ks = Array.from({ length: maxK }, (_, i) => i + 1)

		const reference = makeUniformData(size)
		const [
			all,
			references
		] = await Promise.all([
			Promise.all(ks.map(k => kmeans(data, k, useWorkers))),
			Promise.all(ks.map(k => kmeans(reference, k, useWorkers))),
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

