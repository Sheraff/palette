import { isMainThread, parentPort, workerData } from "node:worker_threads"
import type { ColorSpace } from "../spaces/types"
import { spacesByKey } from "../spaces/spacesByKey.ts"

/**
 * Compute saliency map using local color variance
 * Detects regions with high local contrast (text, edges, details)
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
	const totalPixels = width * height
	const radius = 3 // smaller window for more detail sensitivity

	// Compute local variance (standard deviation of color distances)
	const variance = new Float32Array(totalPixels)

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const centerIdx = y * width + x
			const centerHex = space.toHex(data, centerIdx * channels)

			let maxDist = 0

			// Check neighborhood for maximum color distance
			for (let dy = -radius; dy <= radius; dy++) {
				const ny = y + dy
				if (ny < 0 || ny >= height) continue

				for (let dx = -radius; dx <= radius; dx++) {
					const nx = x + dx
					if (nx < 0 || nx >= width) continue

					const neighborIdx = ny * width + nx
					const neighborHex = space.toHex(data, neighborIdx * channels)
					const dist = space.distance(centerHex, neighborHex)
					maxDist = Math.max(maxDist, dist)
				}
			}

			variance[centerIdx] = maxDist
		}
	}

	// Apply light Gaussian blur to reduce noise
	const kernel = [0.25, 0.5, 0.25] // 3-tap Gaussian
	// const kernel = [0.0625, 0.25, 0.375, 0.25, 0.0625] // 5-tap Gaussian
	// const kernel = [0.03125, 0.109375, 0.21875, 0.28125, 0.21875, 0.109375, 0.03125] // 7-tap Gaussian
	const kmin = -Math.floor(kernel.length / 2)
	const kmax = Math.floor(kernel.length / 2)

	// Horizontal pass
	const temp = new Float32Array(totalPixels)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let sum = 0
			for (let k = kmin, i = 0; k <= kmax; k++, i++) {
				const nx = Math.max(0, Math.min(width - 1, x + k))
				sum += variance[y * width + nx] * kernel[i]
			}
			temp[y * width + x] = sum
		}
	}

	// Vertical pass
	const blurred = new Float32Array(totalPixels)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let sum = 0
			for (let k = kmin, i = 0; k <= kmax; k++, i++) {
				const ny = Math.max(0, Math.min(height - 1, y + k))
				sum += temp[ny * width + x] * kernel[i]
			}
			blurred[y * width + x] = sum
		}
	}

	// Apply dilation to spread high values inward
	const dilated = new Float32Array(totalPixels)
	const dilationRadius = Math.round(Math.min(height, width) * 0.001)

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let maxVal = 0
			for (let dy = -dilationRadius; dy <= dilationRadius; dy++) {
				const ny = Math.max(0, Math.min(height - 1, y + dy))
				for (let dx = -dilationRadius; dx <= dilationRadius; dx++) {
					const nx = Math.max(0, Math.min(width - 1, x + dx))
					maxVal = Math.max(maxVal, blurred[ny * width + nx])
				}
			}
			dilated[y * width + x] = maxVal
		}
	}

	// Normalize without easing for more sensitivity
	let max = 0
	for (let i = 0; i < totalPixels; i++) {
		max = Math.max(max, dilated[i])
	}

	for (let i = 0; i < totalPixels; i++) {
		destination[i] = Math.min(255, (dilated[i] / (max + 1e-10)) * 255)
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