/**
 * In order to provide a repo that "works out of the box", we need to upload images.
 * But to avoid copyright issues, we shouldn't upload the original images.
 * 
 * This script will scramble an image to make it reasonably uploadable.
 */

import sharp from "sharp"
import { parseArgs } from "util"
import { join } from "path"

const cwd = process.cwd()

const { values } = parseArgs({
	options: {
		image: { type: 'string', short: 'i' },
	},
	strict: true,
})

if (!values.image) {
	console.error('Usage: scramble-image -i <image>')
	process.exit(1)
}

const path = join(cwd, values.image)

sharp(path)
	.raw({ depth: 'uchar' })
	.toBuffer({ resolveWithObject: true })
	.then(async ({ data, info: { width, height, channels } }) => {

		const radius = Math.max(width, height) / 2 * 0.90
		const wCenter = width / 2
		const hCenter = height / 2

		const buffer = new Uint8Array(data.length)
		for (let i = 0; i < data.length; i += channels) {
			const x = i / channels % width
			const y = i / channels / width
			if (Math.hypot(x - wCenter, y - hCenter) > radius) {
				for (let j = 0; j < channels; j++) {
					buffer[i + j] = data[i + j]
				}
			} else if (Math.hypot(x - wCenter, y - hCenter) > radius / 2) {
				for (let j = 0; j < channels; j++) {
					buffer[buffer.length - i + j] = data[i + j]
				}
			} else {
				for (let j = 0; j < channels; j++) {
					buffer[i + j] = data[i + j]
				}
			}
		}

		sharp(buffer, { raw: { width, height, channels } })
			.jpeg()
			.toFile(path.replace(/\.[^.]+$/, '-scrambled.jpg'))
	})

