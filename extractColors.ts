import type { ColorSpace } from "./spaces/types.ts"
import { oklabSpace } from "./spaces/oklab.ts"
import type { Pool, Strategy } from "./kmeans/types.ts"
import { elbowKmeans } from "./kmeans/elbow.ts"
import { saliency } from "./saliency/saliency.ts"

type Meta = {
	/** number of channels in the image, must be 3 or 4 (RGB or RGBA) */
	channels: number
	width: number
	height: number
}

export type ExtractOptions = {
	/**
	 * whether to use worker threads for the kmeans algorithm
	 * - `false` (default): don't use workers (not recommended as this is CPU intensive)
	 * - `true`: use workers, if piscina is installed they will be pooled automatically
	 * - `Pool`: use a custom worker pool (should be an instance of `Piscina` or compatible)
	 */
	workers?: boolean | Pool
	colorSpace?: ColorSpace
	strategy?: Strategy
	/** [0-100] when enabled, forbids the use of colors that aren't in the initial data in the final result, use a [0-100] number to impose a % floor under which use of those colors is also forbidden */
	clamp?: boolean | number
	/** [0-100] how much of the image to trim on each side, trimming helps avoid border artifacts */
	trimPercent?: number
	/** [0-100] when extracting the text/foreground color, the minimum contrast with the background color, default to 20 */
	minForegroundContrast?: number
	/** importance of salient feature detection in the color extraction, default to 2 */
	saliencyWeight?: number
}

/**
 * - `undefined` means we haven't tried to import piscina yet
 * - `null` means piscina is not available
 */
let localPool: Pool | null | undefined

export async function extractColors(
	/** image data, must be smaller than 4_294_967_295 (equivalent to a 65_535 x 65_535 square) */
	source: Uint8ClampedArray | Uint8Array | Buffer,
	meta: Meta,
	{
		workers = false,
		colorSpace = oklabSpace,
		strategy = elbowKmeans(),
		clamp = 0.005,
		trimPercent = 2.5,
		minForegroundContrast = 20,
		saliencyWeight = 2,
	}: ExtractOptions = {},
	name = ""
) {
	if (workers === true) {
		if (localPool === undefined) {
			try {
				const { default: Piscina } = await import("piscina")
				localPool = new Piscina({
					idleTimeout: 100,
				})
			} catch {
				localPool = null
			}
		}
		if (localPool) {
			workers = localPool
		}
	}
	const trimmed = trimSource(source, meta, trimPercent)
	const data = trimmed[0]
	meta = trimmed[1]
	const total = data.length / meta.channels

	const saliencyMap = new Uint8ClampedArray(new SharedArrayBuffer(meta.width * meta.height * Uint8ClampedArray.BYTES_PER_ELEMENT))
	await saliency(name, colorSpace, data, saliencyMap, meta.width, meta.height, meta.channels, workers)
	const map = countColors(data, meta, colorSpace, saliencyMap, saliencyWeight)
	const sorted = sortColorMap(map)
	const array = transferableMap(sorted)
	console.log(name, "Unique Colors:", array.length / 2)
	const centroids = await strategy(name, colorSpace, array, total, workers)
	if (clamp !== false) {
		clampCentroidsToOriginalColors(
			clamp,
			total,
			centroids,
			map,
			array,
			colorSpace,
		)
	}
	groupImperceptiblyDifferentColors(centroids, colorSpace)

	const outer = mainZoneColor(data, meta, colorSpace, centroids)
	const outerLum = colorSpace.lightness(outer)

	// const inner = (() => {
	// 	const { data: text } = extractTextRegions(data, meta)
	// 	const textColors = countColors(text, meta.channels, colorSpace)
	// 	const clamped = new Map<number, number>()
	// 	for (const [color, count] of textColors) {
	// 		let minDistance = Infinity
	// 		let closest: number = -1
	// 		for (const centroid of centroids.keys()) {
	// 			const distance = colorSpace.distance(color, centroid)
	// 			if (distance < minDistance) {
	// 				minDistance = distance
	// 				closest = centroid
	// 			}
	// 		}
	// 		clamped.set(closest, (clamped.get(closest) || 0) + count)
	// 	}
	// 	// by ratio, color that is the most prevalent in `clamped` but not in `centroids`
	// 	const textTotal = text.length / meta.channels
	// 	const diff = Array.from(clamped.keys()).map(t => {
	// 		const textRatio = clamped.get(t)! / textTotal
	// 		const colorRatio = centroids.get(t)! / total
	// 		const delta = ((textRatio - colorRatio) + 100) / 2
	// 		return [t, delta]
	// 	}).sort((a, b) => b[1] - a[1])
	// 	const main = diff.filter((d, i) => i === 0 || (d[1] > 0 && d[1] >= diff[0][1] * 0.999))
	// 	let textContrastValue = 0
	// 	let textContrastColor = 0
	// 	for (const [color] of main) {
	// 		const contrast = colorSpace.contrast(outer, color)
	// 		if (contrast > textContrastValue) {
	// 			textContrastValue = contrast
	// 			textContrastColor = color
	// 		}
	// 	}
	// 	if (textContrastValue && colorSpace.distance(textContrastColor, outer) > 20) {
	// 		console.log(name, "Inner Color from Text: #", colorSpace.toRgb(textContrastColor).toString(16).padStart(6, '0'))
	// 		return textContrastColor
	// 	}
	// 	let maxContrastValue = 0
	// 	let maxContrastColor = 0
	// 	for (const color of centroids.keys()) {
	// 		if (color === outer) continue
	// 		const contrast = colorSpace.contrast(outer, color)
	// 		if (contrast > maxContrastValue) {
	// 			maxContrastValue = contrast
	// 			maxContrastColor = color
	// 		}
	// 	}
	// 	if (maxContrastValue < 20) {
	// 		const white = colorSpace.toHex([255, 255, 255], 0)
	// 		const black = colorSpace.toHex([0, 0, 0], 0)
	// 		const cw = colorSpace.contrast(outer, white)
	// 		const cb = colorSpace.contrast(outer, black)
	// 		const newColor = cw > cb ? white : black
	// 		centroids.set(newColor, 1)
	// 		centroids.set(outer, centroids.get(outer)! - 1)
	// 		return newColor
	// 	}
	// 	return maxContrastColor
	// })()

	const inner = (() => {
		// sum of each color's saliency
		const salientColors = new Map<number, number>()
		let saliencyTotal = 0
		for (let i = 0; i < saliencyMap.length; i += 1) {
			const index = i * meta.channels
			const hex = colorSpace.toHex(data, index)
			const value = saliencyMap[i]
			saliencyTotal += value
			salientColors.set(hex, (salientColors.get(hex) || 0) + value)
		}
		// map each color to the closest centroid
		const clamped = new Map<number, number>()
		for (const [color, count] of salientColors) {
			let minDistance = Infinity
			let closest: number = -1
			for (const centroid of centroids.keys()) {
				const distance = colorSpace.distance(color, centroid)
				if (distance < minDistance) {
					minDistance = distance
					closest = centroid
				}
			}
			clamped.set(closest, (clamped.get(closest) || 0) + count)
		}
		// by ratio, color whose prevalence has most increased from `centroids` to `clamped`
		const diff = Array.from(clamped.keys()).map(t => {
			const saliencyRatio = clamped.get(t)! / saliencyTotal
			const colorRatio = centroids.get(t)! / total
			const delta = ((saliencyRatio - colorRatio) + 100) / 2
			return [t, delta] as const
		})
			.filter(([, delta]) => delta > 0)
			.sort((a, b) => b[1] - a[1])

		// find the color with the highest ratio delta that has enough contrast with the outer color
		const contrasted = diff.find(([color]) => colorSpace.contrast(outer, color) >= minForegroundContrast)
		if (contrasted) {
			console.log(name, "Inner Color from Saliency: #", colorSpace.toRgb(contrasted[0]).toString(16).padStart(6, '0'))
			return contrasted[0]
		}
		console.log(name, "Inner Color NOT FOUND IN SALIENCY")

		// fallback to the color with the highest contrast with the outer color
		let maxContrastValue = 0
		let maxContrastColor = 0
		for (const color of centroids.keys()) {
			if (color === outer) continue
			const contrast = colorSpace.contrast(outer, color)
			if (contrast > maxContrastValue) {
				maxContrastValue = contrast
				maxContrastColor = color
			}
		}
		if (maxContrastValue >= minForegroundContrast) {
			return maxContrastColor
		}

		// fallback to black or white, whichever has the highest contrast with the outer color
		const white = colorSpace.toHex([255, 255, 255], 0)
		const black = colorSpace.toHex([0, 0, 0], 0)
		const cw = colorSpace.contrast(outer, white)
		const cb = colorSpace.contrast(outer, black)
		const newColor = cw > cb ? white : black
		centroids.set(newColor, 1)
		centroids.set(outer, centroids.get(outer)! - 1)
		return newColor
	})()

	// const inner = (() => {
	// 	let maxContrastValue = 0
	// 	let maxContrastColor = 0
	// 	for (const color of centroids.keys()) {
	// 		if (color === outer) continue
	// 		const contrast = colorSpace.contrast(outer, color)
	// 		if (contrast > maxContrastValue) {
	// 			maxContrastValue = contrast
	// 			maxContrastColor = color
	// 		}
	// 	}
	// 	if (maxContrastValue < 20) {
	// 		const white = colorSpace.toHex([255, 255, 255], 0)
	// 		const black = colorSpace.toHex([0, 0, 0], 0)
	// 		const cw = colorSpace.contrast(outer, white)
	// 		const cb = colorSpace.contrast(outer, black)
	// 		const newColor = cw > cb ? white : black
	// 		centroids.set(newColor, 1)
	// 		centroids.set(outer, centroids.get(outer)! - 1)
	// 		return newColor
	// 	}
	// 	return maxContrastColor
	// })()
	const innerLum = colorSpace.lightness(inner)
	const outerColors = Array.from(centroids.keys()).filter(c => {
		const lum = colorSpace.lightness(c)
		return Math.abs(lum - innerLum) > Math.abs(lum - outerLum)
	})
	const innerColors = Array.from(centroids.keys()).filter(c => !outerColors.includes(c))

	const accent = (() => {
		let maxScore = 0
		let maxColor = -1
		for (const color of innerColors) {
			if (color === outer || color === inner) continue
			if (centroids.get(color)! / total < 0.01) continue
			if (colorSpace.contrast(outer, color) < 9) continue
			const chroma = colorSpace.chroma(color)
			const distance = colorSpace.distance(color, inner)
			const prevalence = centroids.get(color)! / total * 100
			// const lum = outerLum > innerLum
			// 	? 100 - colorSpace.lightness(color)
			// 	: colorSpace.lightness(color)
			// const score = chroma * (distance ** 2) * prevalence * lum
			const score = chroma * distance * prevalence
			if (score > maxScore) {
				maxScore = score
				maxColor = color
			}
		}
		if (maxColor === -1) {
			return inner
		}
		return maxColor
	})()

	const third = (() => {
		let maxScore = 0
		let maxColor = -1
		for (const color of outerColors) {
			if (color === outer || color === inner) continue
			if (centroids.get(color)! / total < 0.01) continue
			const contrastInner = colorSpace.contrast(color, inner)
			const contrastAccent = colorSpace.contrast(color, accent)
			const contrast = Math.min(contrastInner, contrastAccent)
			const prevalence = centroids.get(color)! / total * 100
			const score = contrast * prevalence
			if (score > maxScore) {
				maxScore = score
				maxColor = color
			}
		}
		if (maxColor === -1) {
			return outer
		}
		return maxColor
	})()

	return {
		centroids: new Map(Array.from(centroids.entries()).map(([color, count]) => [colorSpace.toRgb(color), count])),
		outer: colorSpace.toRgb(outer),
		inner: colorSpace.toRgb(inner),
		third: colorSpace.toRgb(third),
		accent: colorSpace.toRgb(accent),
		innerColors: innerColors.map(c => [colorSpace.toRgb(c), centroids.get(c)!]),
		outerColors: outerColors.map(c => [colorSpace.toRgb(c), centroids.get(c)!]),
	}
}

/**
 * remove some of the image from each side, to remove any border artifacts
 */
function trimSource(source: Uint8ClampedArray | Uint8Array, meta: Meta, percent: number): [data: Uint8ClampedArray, meta: Meta] {
	const data = source instanceof Buffer ? Uint8ClampedArray.from(source) : source
	const { width, height, channels } = meta

	const xMin = Math.round(width * percent / 100)
	const xMax = Math.round(width * (1 - percent / 100))
	const yMin = Math.round(height * percent / 100)
	const yMax = Math.round(height * (1 - percent / 100))

	const size = (xMax - xMin) * (yMax - yMin) * channels
	const trimmed = new Uint8ClampedArray(size)

	let i = 0
	const adjustedXSlice = (xMax - xMin) * channels
	for (let y = yMin; y < yMax; y++) {
		trimmed.set(data.slice((y * width + xMin) * channels, (y * width + xMax) * channels), i)
		i += adjustedXSlice
	}
	return [trimmed, { width: xMax - xMin, height: yMax - yMin, channels }]
}

function sortColorMap(colors: Map<number, number>): [hex: number, count: number][] {
	return Array.from(colors.entries()).sort((a, b) => b[1] - a[1])
}

function countColors(
	array: Uint8ClampedArray | Uint8Array,
	meta: Meta,
	colorSpace: ColorSpace,
	saliency: Uint8ClampedArray,
	saliencyWeight: number
): Map<number, number> {
	const colors = new Map<number, number>()
	let added = 0
	for (let i = 0; i < array.length / meta.channels; i += 1) {
		const index = i * meta.channels
		const salient = saliency[i] * saliencyWeight
		added += salient
		const hex = colorSpace.toHex(array, index)
		colors.set(hex, (colors.get(hex) || 0) + 1 + salient)
	}
	if (saliencyWeight) {
		const total = array.length / meta.channels
		for (const [color, count] of colors) {
			colors.set(color, Math.round(count / (total + added) * total))
		}
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
	centroids: Map<number, number>
) {
	const map = new Map<number, number>()

	// create a new Uint8ClampedArray from the source, which excludes all pixels within `radius` of the center
	const radius = Math.max(width, height) / 2 * 0.95
	const wCenter = width / 2
	const hCenter = height / 2
	for (let i = 0; i < data.length; i += channels) {
		const x = i / channels % width
		const y = i / channels / width
		if (Math.hypot(x - wCenter, y - hCenter) > radius) {
			const color = colorSpace.toHex(data, i)
			map.set(color, (map.get(color) || 0) + 1)
		}
	}

	const tally = new Map<number, number>()
	for (const [color, count] of map) {
		let closest = -1
		let minDistance = Infinity
		for (const centroid of centroids.keys()) {
			const distance = colorSpace.distance(color, centroid)
			if (distance < minDistance) {
				minDistance = distance
				closest = centroid
			}
		}
		tally.set(closest, (tally.get(closest) || 0) + count)
	}

	let max = 0
	let maxColor = 0
	for (const [color, count] of tally) {
		if (count > max) {
			max = count
			maxColor = color
		}
	}

	return maxColor
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
// 				const lum = oklabSpace.chroma(hex)
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

// 	console.log(oklabSpace.chroma(0xffffff))
// 	console.log(oklabSpace.chroma(0x888888))
// 	console.log(oklabSpace.chroma(0x808080))
// }

// fooofoo()






// const white = rgbSpace.toHex([255, 255, 255], 0)
// const black = rgbSpace.toHex([0, 0, 0], 0)
// console.log(rgbSpace.contrast(black, white))
// console.log(rgbSpace.contrast(white, black))





// // generate a 500x500 pure black image
// function fooo() {
// 	const channels = 3
// 	const size = 500
// 	const array = new Uint8Array(size * size * channels)
// 	const r = 255
// 	const g = 255
// 	const b = 255
// 	for (let i = 0; i < array.length; i += channels) {
// 		array[i + 0] = r
// 		array[i + 1] = g
// 		array[i + 2] = b
// 	}
// 	sharp(array, { raw: { width: size, height: size, channels } }).jpeg().toFile('./images/purewhite.jpg').then(console.log, console.error)
// }
// fooo()