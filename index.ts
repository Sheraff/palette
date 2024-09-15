import sharp from 'sharp'
import fs from 'node:fs'
import { extname, join } from "node:path"
import { parseArgs } from "node:util"
import { extractColors } from "./extractColors.ts"

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

const grouped = transformed.raw({ depth: "uchar" }).toBuffer({ resolveWithObject: true }).then(async ({ data, info }) => {
	if (info.channels !== 3 && info.channels !== 4) {
		throw new Error('Image must have 3 or 4 channels')
	}

	performance.mark('start')
	const centroids = await extractColors(data, info.channels, USE_WORKERS)
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

