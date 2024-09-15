import sharp from 'sharp'
import fs from 'node:fs'
import { extname, join } from "node:path"
import { parseArgs } from "node:util"
import { elbowKmeans, extractColors, oklchSpace, gapStatisticKmeans, rgbSpace } from "./extractColors.ts"
import { oklab2rgb, rgb2oklab } from "./conversion.ts"

const { values } = parseArgs({
	options: {
		image: { type: 'string', short: 'i' },
	},
	strict: true,
})

const USE_WORKERS = true

if (!values.image) throw new Error('No image provided, use --image <path>, for example: \npnpm dev --image=foo.jpg')
const name = values.image.slice(0, extname(values.image).length * -1)
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

// console.log(rgb2oklab([0, 0, 0]))
// console.log(rgb2oklab([255, 0, 0]))
// console.log(rgb2oklab([255, 255, 0]))
// console.log(rgb2oklab([255, 255, 255]))

// const test = transformed.raw({ depth: "uchar" }).toBuffer({ resolveWithObject: true }).then(async ({ data, info }) => {
// 	const lch = new Uint8ClampedArray(data.length)
// 	let minb = Infinity
// 	let maxb = -Infinity
// 	let minl = Infinity
// 	let maxl = -Infinity
// 	let mina = Infinity
// 	let maxa = -Infinity
// 	for (let i = 0; i < data.length; i += info.channels) {
// 		const val = rgb2oklab([data[i], data[i + 1], data[i + 2]])
// 		lch[i] = Math.round(val[0] * 2.55)
// 		lch[i + 1] = Math.round((val[1] + 100) * 255 / 200)
// 		lch[i + 2] = Math.round((val[2] + 100) * 255 / 200)
// 		minl = Math.min(minl, val[0])
// 		maxl = Math.max(maxl, val[0])
// 		mina = Math.min(mina, val[1])
// 		maxa = Math.max(maxa, val[1])
// 		minb = Math.min(minb, val[2])
// 		maxb = Math.max(maxb, val[2])
// 	}
// 	console.log('minl:', minl, 'maxl:', maxl)
// 	console.log('mina:', mina, 'maxa:', maxa)
// 	console.log('minb:', minb, 'maxb:', maxb)
// 	const rgb = new Uint8ClampedArray(data.length)
// 	for (let i = 0; i < data.length; i += info.channels) {
// 		const val = oklab2rgb([lch[i] / 2.55, lch[i + 1] * 200 / 255 - 100, lch[i + 2] * 200 / 255 - 100])
// 		rgb[i] = Math.round(val[0])
// 		rgb[i + 1] = Math.round(val[1])
// 		rgb[i + 2] = Math.round(val[2])
// 	}
// 	return sharp(rgb.buffer, { raw: { width: info.width, height: info.height, channels: 3 } }).jpeg().toFile(join(cwd, `${name}-small-lch-round-trip.jpg`))
// })

const grouped = transformed.raw({ depth: "uchar" }).toBuffer({ resolveWithObject: true }).then(async ({ data, info }) => {
	if (info.channels !== 3 && info.channels !== 4) {
		throw new Error('Image must have 3 or 4 channels')
	}

	performance.mark('start')
	const centroids = await extractColors(data, info.channels, {
		useWorkers: USE_WORKERS,
		colorSpace: oklchSpace,
		strategy: gapStatisticKmeans()
	})
	performance.mark('end')
	console.log('K-means color extraction took:', performance.measure('kmeans', 'start', 'end').duration)
	performance.clearMarks()

	console.log(new Map(Array.from(centroids.entries()).map(([color, count]) => ['#' + color.toString(16).padStart(6, '0'), count])))
	const sorted = sortColorMap(centroids)
	const new_array = new Uint8ClampedArray(info.width * info.height * 3)
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



function sortColorMap(colors: Map<number, number>): [hex: number, count: number][] {
	return Array.from(colors.entries()).sort((a, b) => b[1] - a[1])
}

function hexToArray(hex: number, ...pad: number[]): Uint8ClampedArray {
	return new Uint8ClampedArray([hex >> 16 & 0xff, hex >> 8 & 0xff, hex & 0xff, ...pad])
}

