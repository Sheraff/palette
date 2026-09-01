import sharp from "sharp"
import type { RawImage } from "./types.ts"

export type LoadNativeImageOptions = {
	limitInputPixels?: number
}

export const NATIVE_IMAGE_MAXIMUM_PIXELS = 2_100_000

export async function loadNativeImage(
	source: string | Uint8Array,
	{ limitInputPixels = NATIVE_IMAGE_MAXIMUM_PIXELS }: LoadNativeImageOptions = {},
): Promise<RawImage> {
	if (!Number.isSafeInteger(limitInputPixels) || limitInputPixels <= 0) {
		throw new RangeError("Native image pixel limit must be a positive safe integer")
	}
	const metadata = await sharp(source, { limitInputPixels }).metadata()
	const pages = metadata.pages ?? 1
	if (pages !== 1) throw new Error(`Expected one native image page, got ${pages}`)
	if (!Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(metadata.height) ||
		(metadata.width ?? 0) <= 0 || (metadata.height ?? 0) <= 0) {
		throw new Error("Expected positive native image dimensions")
	}
	const encodedPixels = metadata.width! * metadata.height!
	if (!Number.isSafeInteger(encodedPixels) || encodedPixels > limitInputPixels) {
		throw new RangeError(`Native image exceeds ${limitInputPixels} encoded pixels`)
	}
	if (metadata.orientation !== undefined &&
		(!Number.isSafeInteger(metadata.orientation) || metadata.orientation < 1 || metadata.orientation > 8)) {
		throw new Error(`Invalid native image orientation ${metadata.orientation}`)
	}

	const { data, info } = await sharp(source, { limitInputPixels })
		.rotate()
		.flatten({ background: { r: 255, g: 255, b: 255 } })
		.toColourspace("srgb")
		.removeAlpha()
		.raw({ depth: "uchar" })
		.toBuffer({ resolveWithObject: true })
	const decodedPixels = info.width * info.height
	if (!Number.isSafeInteger(decodedPixels) || decodedPixels <= 0 || decodedPixels > limitInputPixels) {
		throw new RangeError(`Native image exceeds ${limitInputPixels} decoded pixels`)
	}
	if (info.channels !== 3 || data.byteLength !== decodedPixels * 3) {
		throw new Error(`Expected native RGB data, got ${info.channels} channels and ${data.byteLength} bytes`)
	}
	return {
		width: info.width,
		height: info.height,
		data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
	}
}
