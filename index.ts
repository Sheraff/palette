import sharp from 'sharp'
import fs from 'node:fs'
import { basename, extname, join } from "node:path"
import { Worker } from "worker_threads"
import { parseArgs } from "node:util"

const { values } = parseArgs({
	options: {
		image: { type: 'string', short: 'i' },
	},
	strict: true,
})

if (!values.image) throw new Error('No image provided, use --image <path>, for example: \npnpm dev --image=foo.jpg')
const name = basename(values.image, extname(values.image))
const cwd = process.cwd()

const buffer = fs.readFileSync(join(cwd, values.image))
const image = sharp(buffer)

const metadata = await image.metadata()

const transformed = image
	// cropping the sides because album art can sometimes have "packaging" borders, instead of "art" borders
	.extract({
		top: Math.round(metadata.height! * 0.05),
		left: Math.round(metadata.width! * 0.05),
		width: Math.round(metadata.width! * 0.9),
		height: Math.round(metadata.height! * 0.9),
	})
	// resizing to a smaller size for faster processing
	.resize(300, 300, {
		fit: "cover",
		fastShrinkOnLoad: true,
		kernel: sharp.kernel.nearest
	})

const small = transformed.jpeg()
	.toFile(join(cwd, `${name}-small.jpg`), (err, info) => {
		if (err) {
			console.error(err)
		}
	})

const grouped = transformed.raw({ depth: "uchar" }).toBuffer({ resolveWithObject: true }).then(async ({ data, info }) => {
	if (info.channels !== 3 && info.channels !== 4) {
		throw new Error('Image must have 3 or 4 channels')
	}
	const array = Uint8ClampedArray.from(data)

	const colors = countColors(array, info.channels)

	console.log('Colors:', colors.size)

	{
		const new_array = new Uint8ClampedArray(array.length)
		let total = 0
		const sorted = sortColorMap(colors)
		for (const [color, count] of sorted) {
			const pixel = hexToArray(color)
			for (let i = 0; i < count; i++) {
				new_array.set(pixel, total * 3 + i * 3)
			}
			total += count
		}
		sharp(new_array.buffer, { raw: { width: info.width, height: info.height, channels: 3 } }).jpeg().toFile(join(cwd, `${name}-small-unique.jpg`))
	}

	const { centroids, wcss } = await findOptimalClusters(colors)
	console.log(centroids)
	console.log('WCSS (lower is better):', wcss)
	const sorted = sortColorMap(centroids)
	const new_array = new Uint8ClampedArray(array.length)
	let total = 0
	for (const [color, count] of sorted) {
		const pixel = hexToArray(color)
		for (let i = 0; i < count; i++) {
			new_array.set(pixel, total * 3 + i * 3)
		}
		total += count
	}
	const kmeansImg = sharp(new_array.buffer, { raw: { width: info.width, height: info.height, channels: 3 } }).jpeg().toFile(join(cwd, `${name}-small-kmeans-optimal.jpg`))
	return kmeansImg
})

function countColors(array: Uint8ClampedArray, channels: number): Map<number, number> {
	const colors = new Map<number, number>()
	for (let i = 0; i < array.length; i += channels) {
		const hex = arrayToHex(array, i)
		colors.set(hex, (colors.get(hex) || 0) + 1)
	}
	return colors
}
function sortColorMap(colors: Map<number, number>): [hex: number, count: number][] {
	return Array.from(colors.entries()).sort((a, b) => b[1] - a[1])
}
function arrayToHex(array: Uint8ClampedArray, index: number): number {
	return array[index] << 16 | array[index + 1] << 8 | array[index + 2]
}
function hexToArray(hex: number, ...pad: number[]): Uint8ClampedArray {
	return new Uint8ClampedArray([hex >> 16 & 0xff, hex >> 8 & 0xff, hex & 0xff, ...pad])
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

const USE_WORKERS = true
async function kmeans(array: Uint32Array, k: number) {
	if (!USE_WORKERS) {
		const { kmeans } = await import('./kmeans.ts')
		return kmeans(array, k)
	}
	const worker = new Worker('./kmeans.ts', {
		workerData: { buffer: array.buffer, k },
	})
	return new Promise<{ centroids: Map<number, number>, wcss: number }>((resolve, reject) => {
		worker.on('message', (value) => resolve(value))
		worker.on('error', (err) => reject(err))
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
 */
async function findOptimalClusters(colors: Map<number, number>) {
	const start = [1, 2, 3, 4, 5]
	const end = [20, 30, 50, 100, 200]

	// technically the point end[colors.size] will have a wcss of 0, we could include that in the end array

	const data = transferableMap(colors)
	const [startPoints, endPoints] = await Promise.all([
		Promise.all(start.map(k => kmeans(data, k))),
		Promise.all(end.map(k => kmeans(data, k))),
	])

	const startSlope = startPoints.reduce((acc, val, i, arr) => i === 0 ? 0 : acc + (val.wcss - arr[i - 1].wcss) / (start[i] - start[i - 1]), 0) / (start.length - 1)
	const endSlope = endPoints.reduce((acc, val, i, arr) => i === 0 ? 0 : acc + (val.wcss - arr[i - 1].wcss) / (end[i] - end[i - 1]), 0) / (end.length - 1)

	const startPoint = startPoints[0].wcss
	const endPoint = endPoints[0].wcss

	console.log("Start Slope:", startSlope, startPoints.map(p => p.wcss))
	console.log("End Slope:", endSlope, endPoints.map(p => p.wcss))

	// compute at which K the start slope and end slope intersect
	// wcss = m * k + b
	// start: wcss = startSlope * k + startPoint
	// end: wcss = endSlope * k + endPoint - endSlope * end[0]
	// startSlope * k + startPoint = endSlope * k + endPoint - endSlope * end[0]
	// k = (endPoint - endSlope * end[0] - startPoint) / (startSlope - endSlope)

	const _optimal = (endPoint - endSlope * end[0] - startPoint) / (startSlope - endSlope)
	console.log("Optimal K:", _optimal)
	const optimal = Math.round(_optimal)

	if (start.includes(optimal)) {
		return startPoints[start.indexOf(optimal)]
	}
	if (end.includes(optimal)) {
		return endPoints[end.indexOf(optimal)]
	}

	return kmeans(data, optimal)
}