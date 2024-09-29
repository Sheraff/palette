import { isMainThread, parentPort, workerData } from "node:worker_threads"
import type { ColorSpace } from "../spaces/types"
import { spacesByKey } from "../spaces/spacesByKey.ts"

/**
 * Compute the Itti-Koch saliency map
 */
export function saliency(
	space: ColorSpace,
	data: Uint8ClampedArray | Uint8Array,
	width: number,
	height: number,
	channels: number,
	/** in which to store the results, should be of size `width * height * Uint8Array.BYTES_PER_ELEMENT` */
	destination: Uint8ClampedArray | Uint8Array
): void {
	const LEVELS = Math.floor(Math.log2(Math.min(width, height)))

	// Create grayscale image
	const black = space.toHex([0, 0, 0], 0)
	const grayscale = new Uint8ClampedArray(width * height)
	for (let i = 0; i < data.length; i += 1) {
		const index = i * channels
		const hex = space.toHex(data, index)
		grayscale[i] = space.distance(hex, black)
	}

	// Apply Gaussian pyramid
	const pyramid = [grayscale]
	for (let level = 1; level <= LEVELS; level++) {
		const previous = pyramid[level - 1]
		const downWidth = Math.max(1, Math.floor(width / (2 ** level)))
		const downHeight = Math.max(1, Math.floor(height / (2 ** level)))
		const srcWidth = Math.max(1, Math.floor(width / (2 ** (level - 1))))
		const srcHeight = Math.max(1, Math.floor(height / (2 ** (level - 1))))
		const downsampled = new Uint8ClampedArray(downWidth * downHeight)
		for (let y = 0; y < downHeight; y++) {
			for (let x = 0; x < downWidth; x++) {
				let sum = 0
				for (let ky = 0; ky < 2; ky++) {
					const srcY = y * 2 + ky
					const srcYW = srcY * srcWidth
					for (let kx = 0; kx < 2; kx++) {
						const srcX = x * 2 + kx
						if (srcX < srcWidth && srcY < srcHeight) {
							sum += previous[srcYW + srcX]
						}
					}
				}
				downsampled[y * downWidth + x] = sum / 4
			}
		}
		pyramid.push(downsampled)
	}

	// Create saliency map
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let sum = 0
			const i = y * width + x
			for (let level = 1; level <= LEVELS; level++) {
				const scale = 2 ** level
				const downWidth = Math.max(1, Math.floor(width / scale))
				const pixelIndex = Math.floor(y / scale) * downWidth + Math.floor(x / scale)
				if (pixelIndex < pyramid[level].length) {
					const pixel = pyramid[level][pixelIndex]
					sum += Math.abs(pyramid[0][i] - pixel)
				}
			}
			destination[i] = sum / LEVELS
		}
	}

	// Normalize saliency with ease-in-out cubic function
	let max = 0
	for (let i = 0; i < destination.length; i++) {
		max = Math.max(max, destination[i])
	}
	for (let i = 0; i < destination.length; i++) {
		const linear = destination[i] / max
		const ease = easeInOutCubic(linear)
		destination[i] = ease
	}
}


function otsuThreshold(saliencyMap: Uint8ClampedArray): number {
	const histogram = new Array(256).fill(0)
	for (let i = 0; i < saliencyMap.length; i++) {
		histogram[saliencyMap[i]]++
	}

	let sum = 0
	for (let i = 0; i < 256; i++) {
		sum += i * histogram[i]
	}

	let sumB = 0
	let wB = 0
	let wF = 0
	let varMax = 0
	let threshold = 0

	for (let t = 0; t < 256; t++) {
		wB += histogram[t]
		if (wB === 0) continue
		wF = saliencyMap.length - wB
		if (wF === 0) break

		sumB += t * histogram[t]
		const mB = sumB / wB
		const mF = (sum - sumB) / wF

		const varBetween = wB * wF * (mB - mF) * (mB - mF)
		if (varBetween > varMax) {
			varMax = varBetween
			threshold = t
		}
	}

	return threshold
}

function easeInOutCubic(x: number): number {
	return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}





/** for using this file as a worker without pooling */
const rawWorkerId = 'no-pooling-call'
export type StandaloneWorkerData = {
	id: typeof rawWorkerId
	data: ArrayBuffer
	buffer: ArrayBuffer
	space: string
	name: string
	width: number,
	height: number,
	channels: number,
}
if (!isMainThread && workerData && workerData.id === 'no-pooling-call') {
	if (!parentPort) throw new Error('No parent port')
	const { buffer, space, name, channels, height, width, data } = workerData as StandaloneWorkerData
	parentPort.postMessage(saliency(
		spacesByKey[space],
		new Uint8Array(data),
		width,
		height,
		channels,
		new Uint8Array(buffer)
	))
}


/** for using this file as a worker with pooling */
export type PooledWorkerArgs = {
	name: string,
	space: string,
	data: Uint8Array | Uint8ClampedArray,
	result: Uint8Array | Uint8ClampedArray,
	width: number,
	height: number,
	channels: number,
}
export default function ({ channels, data, height, result, space, width }: PooledWorkerArgs) {
	return saliency(
		spacesByKey[space],
		data,
		width,
		height,
		channels,
		result
	)
}