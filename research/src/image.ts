import sharp from "sharp"
import type { RawImage } from "./types.ts"

export type LoadImageOptions = {
	maxSize?: number
}

export async function loadImage(source: string | Uint8Array, { maxSize = 224 }: LoadImageOptions = {}): Promise<RawImage> {
	const { data, info } = await sharp(source)
		.rotate()
		.flatten({ background: { r: 255, g: 255, b: 255 } })
		.toColourspace("srgb")
		.resize({
			width: maxSize,
			height: maxSize,
			fit: "inside",
			withoutEnlargement: true,
			kernel: "lanczos3",
		})
		.removeAlpha()
		.raw({ depth: "uchar" })
		.toBuffer({ resolveWithObject: true })

	if (info.channels !== 3) {
		throw new Error(`Expected normalized RGB data, got ${info.channels} channels`)
	}

	return {
		width: info.width,
		height: info.height,
		data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
	}
}

export function cropOnePixel(image: RawImage): RawImage {
	if (image.width < 4 || image.height < 4) return image
	const width = image.width - 2
	const height = image.height - 2
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		const sourceStart = ((y + 1) * image.width + 1) * 3
		const destinationStart = y * width * 3
		data.set(image.data.subarray(sourceStart, sourceStart + width * 3), destinationStart)
	}
	return { width, height, data }
}

export function addDeterministicNoise(image: RawImage): RawImage {
	const data = image.data.slice()
	for (let index = 0; index < data.length; index++) {
		const delta = ((index * 1103515245 + 12345) >>> 29) - 3
		data[index] = Math.max(0, Math.min(255, data[index] + Math.sign(delta)))
	}
	return { ...image, data }
}
