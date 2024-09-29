/**
 * Given an array of RGB values repeating ([r, g, b, r, g, b, ...]),
 * and the image's metadata (width, height, channels),
 * return the and array of RGB values repeating of the areas
 * containing text.
 * 
 * source: https://github.com/gabrielarchanjo/marvinj/blob/master/marvinj/src/plugins/pattern/FindTextRegions.js
 */
export function extractTextRegions(
	data: Uint8Array | Uint8ClampedArray,
	meta: { width: number; height: number; channels: number }
) {
	const { width, height, channels } = meta

	// Convert to grayscale
	const grayData = convertToGrayscale(data, width, height, channels)

	// Apply adaptive thresholding
	const binaryData = applyAdaptiveThresholding(grayData, width, height)

	// Apply morphological opening (erosion followed by dilation)
	const openData = applyOpening(binaryData, width, height)

	// Apply morphological closing (dilation followed by erosion)
	const closedData = applyClosing(openData, width, height)

	// Apply edge detection
	const edges = applyEdgeDetection(closedData, width, height)

	// Detect text regions using contours
	const contours = detectContours(edges, width, height)

	// Extract the regions containing text
	return extractRegions(data, contours, width, height, channels)
}

function convertToGrayscale(data: Uint8Array | Uint8ClampedArray, width: number, height: number, channels: number): Uint8Array {
	const grayData = new Uint8Array(width * height)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = (y * width + x) * channels
			const r = data[index]
			const g = data[index + 1]
			const b = data[index + 2]
			const gray = 0.299 * r + 0.587 * g + 0.114 * b
			grayData[y * width + x] = gray
		}
	}
	return grayData
}

function applyAdaptiveThresholding(grayData: Uint8Array, width: number, height: number): Uint8Array {
	const binaryData = new Uint8Array(width * height)
	const blockSize = 15
	const C = 10

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = y * width + x
			const localMean = calculateLocalMean(grayData, x, y, width, height, blockSize)
			binaryData[index] = grayData[index] > localMean - C ? 255 : 0
		}
	}
	return binaryData
}

function calculateLocalMean(data: Uint8Array, x: number, y: number, width: number, height: number, blockSize: number): number {
	let sum = 0
	let count = 0
	const halfBlockSize = Math.floor(blockSize / 2)

	for (let dy = -halfBlockSize; dy <= halfBlockSize; dy++) {
		for (let dx = -halfBlockSize; dx <= halfBlockSize; dx++) {
			const nx = x + dx
			const ny = y + dy
			if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
				sum += data[ny * width + nx]
				count++
			}
		}
	}
	return sum / count
}


function applyOpening(binaryData: Uint8Array, width: number, height: number): Uint8Array {
	const erodedData = applyErosion(binaryData, width, height)
	return applyDilation(erodedData, width, height)
}

function applyClosing(binaryData: Uint8Array, width: number, height: number): Uint8Array {
	const dilatedData = applyDilation(binaryData, width, height)
	return applyErosion(dilatedData, width, height)
}

function applyErosion(binaryData: Uint8Array, width: number, height: number): Uint8Array {
	const erodedData = new Uint8Array(width * height)
	const kernel = [
		[1, 1, 1, 1, 1],
		[1, 1, 1, 1, 1],
		[1, 1, 1, 1, 1],
		[1, 1, 1, 1, 1],
		[1, 1, 1, 1, 1]
	]
	const kernelSize = 5
	const halfKernelSize = Math.floor(kernelSize / 2)

	for (let y = halfKernelSize; y < height - halfKernelSize; y++) {
		for (let x = halfKernelSize; x < width - halfKernelSize; x++) {
			let min = 255
			for (let ky = -halfKernelSize; ky <= halfKernelSize; ky++) {
				for (let kx = -halfKernelSize; kx <= halfKernelSize; kx++) {
					const pixel = binaryData[(y + ky) * width + (x + kx)]
					if (kernel[ky + halfKernelSize][kx + halfKernelSize] === 1) {
						min = Math.min(min, pixel)
					}
				}
			}
			erodedData[y * width + x] = min
		}
	}
	return erodedData
}

function applyDilation(binaryData: Uint8Array, width: number, height: number): Uint8Array {
	const dilatedData = new Uint8Array(width * height)
	const kernel = [
		[1, 1, 1, 1, 1],
		[1, 1, 1, 1, 1],
		[1, 1, 1, 1, 1],
		[1, 1, 1, 1, 1],
		[1, 1, 1, 1, 1]
	]
	const kernelSize = 5
	const halfKernelSize = Math.floor(kernelSize / 2)

	for (let y = halfKernelSize; y < height - halfKernelSize; y++) {
		for (let x = halfKernelSize; x < width - halfKernelSize; x++) {
			let max = 0
			for (let ky = -halfKernelSize; ky <= halfKernelSize; ky++) {
				for (let kx = -halfKernelSize; kx <= halfKernelSize; kx++) {
					const pixel = binaryData[(y + ky) * width + (x + kx)]
					if (kernel[ky + halfKernelSize][kx + halfKernelSize] === 1) {
						max = Math.max(max, pixel)
					}
				}
			}
			dilatedData[y * width + x] = max
		}
	}
	return dilatedData
}

function applyEdgeDetection(binaryData: Uint8Array, width: number, height: number): Uint8Array {
	const edges = new Uint8Array(width * height)
	const sobelX = [
		[-1, 0, 1],
		[-2, 0, 2],
		[-1, 0, 1]
	]
	const sobelY = [
		[-1, -2, -1],
		[0, 0, 0],
		[1, 2, 1]
	]

	for (let y = 1; y < height - 1; y++) {
		for (let x = 1; x < width - 1; x++) {
			let gx = 0
			let gy = 0
			for (let ky = -1; ky <= 1; ky++) {
				for (let kx = -1; kx <= 1; kx++) {
					const pixel = binaryData[(y + ky) * width + (x + kx)]
					gx += pixel * sobelX[ky + 1][kx + 1]
					gy += pixel * sobelY[ky + 1][kx + 1]
				}
			}
			const magnitude = Math.sqrt(gx * gx + gy * gy)
			edges[y * width + x] = magnitude > 128 ? 255 : 0
		}
	}
	return edges
}

function detectContours(edges: Uint8Array, width: number, height: number): Array<[x: number, y: number][]> {
	const contours: Array<[x: number, y: number][]> = []
	const visited = new Uint8Array(width * height)
	const directions = [
		[-1, 0], [1, 0], [0, -1], [0, 1],
		[-1, -1], [-1, 1], [1, -1], [1, 1]
	]

	function floodFill(x: number, y: number): [x: number, y: number][] {
		const stack = [[x, y]]
		const contour: [x: number, y: number][] = []
		while (stack.length > 0) {
			const [cx, cy] = stack.pop()!
			for (const [dx, dy] of directions) {
				const nx = cx + dx
				const ny = cy + dy
				if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
					const index = ny * width + nx
					if (edges[index] === 255 && visited[index] === 0) {
						visited[index] = 1
						stack.push([nx, ny])
						contour.push([nx, ny])
					}
				}
			}
		}
		return contour
	}

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = y * width + x
			if (edges[index] === 255 && visited[index] === 0) {
				visited[index] = 1
				const contour = floodFill(x, y)
				if (contour.length > 0) {
					contours.push(contour)
				}
			}
		}
	}
	return contours
}

function extractRegions(data: Uint8Array | Uint8ClampedArray, contours: Array<[x: number, y: number][]>, width: number, height: number, channels: number) {
	const textRegionsSize = contours.reduce((acc, contour) =>
		acc + contour.length * channels,
		0) * channels
	/** the same image as `data`, but only the pixels inside `contours` are colored, the rest is dark */
	const textRegions = new Uint8Array(data.length)
	/** an array of pixels that only contains those inside `contours` */
	const textData = new Uint8Array(textRegionsSize)
	{
		let i = 0
		for (const contour of contours) {
			for (const [x, y] of contour) {
				const index = (y * width + x) * channels
				textRegions.set(data.slice(index, index + channels), index)
				textData.set(data.slice(index, index + channels), i)
				i += channels
			}
		}
	}
	return { regions: textRegions, data: textData }
}