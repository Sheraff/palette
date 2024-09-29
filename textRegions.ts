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

	// Apply thresholding
	const grayScaleThreshold = 127
	const binaryData = new Uint8Array(width * height)
	let whiteCount = 0
	for (let i = 0; i < grayData.length; i++) {
		const white = grayData[i] > grayScaleThreshold
		binaryData[i] = white ? 255 : 0
		whiteCount += +white
	}
	// invert colors if the image is mostly white
	if (whiteCount > grayData.length / 2) {
		for (let i = 0; i < binaryData.length; i++) {
			binaryData[i] = 255 - binaryData[i]
		}
	}

	const maxWhiteSpace = 13 * width / 640
	const maxFontLineWidth = 10 * width / 640
	const minTextWidth = 30 * width / 640

	const segments: number[][][] = Array.from({ length: height }, () => [])
	const processed = new Uint8Array(width * height)

	let patternStartX = -1
	let patternLength = 0
	let whitePixels = 0
	let blackPixels = 0

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = y * width + x
			if (!processed[index]) {
				const color = binaryData[index]

				if (color === 255 && patternStartX !== -1) {
					whitePixels++
					blackPixels = 0
				}

				if (color === 0) {
					blackPixels++
					if (patternStartX === -1) {
						patternStartX = x
					}
					whitePixels = 0
				}

				if (whitePixels > maxWhiteSpace || blackPixels > maxFontLineWidth || x === width - 1) {
					if (patternLength >= minTextWidth) {
						segments[y].push([patternStartX, y, patternStartX + patternLength, y])
					}
					whitePixels = 0
					blackPixels = 0
					patternLength = 0
					patternStartX = -1
				}

				if (patternStartX !== -1) {
					patternLength++
				}

				processed[index] = 1
			}
		}
	}

	// Group line patterns intersecting in x coordinate and too near in y coordinate.
	const gap = Math.floor(6 * height / 640)
	for (let y = 0; y < height - gap; y++) {
		const listY = segments[y]
		for (let w = y + 1; w <= y + gap; w++) {
			const listW = segments[w]
			for (let i = 0; i < listY.length; i++) {
				const sA = listY[i]
				for (let j = 0; j < listW.length; j++) {
					const sB = listW[j]
					if (
						(sA[0] <= sB[0] && sA[2] >= sB[2]) ||
						(sA[0] >= sB[0] && sA[0] <= sB[2]) ||
						(sA[2] >= sB[0] && sA[2] <= sB[2])
					) {
						sA[0] = Math.min(sA[0], sB[0])
						sA[2] = Math.max(sA[2], sB[2])
						sA[3] = sB[3]
						listY.splice(i, 1)
						i--
						listW.splice(j, 1)
						listW.push(sA)
						break
					}
				}
			}
		}
	}

	// Extract the regions containing text
	const textRegionsSize = segments.reduce((acc, list) =>
		acc + list.reduce((acc, [x1, y1, x2, y2]) => acc + (x2 - x1 + 1) * (y2 - y1 + 1), 0),
		0) * channels
	const textRegions = new Uint8Array(data.length)
	const textData = new Uint8Array(textRegionsSize)
	{
		let i = 0
		for (const list of segments) {
			for (const [x1, y1, x2, y2] of list) {
				for (let y = y1; y <= y2; y++) {
					textRegions.set(data.subarray((y * width + x1) * channels, (y * width + x2 + 1) * channels), (y * width + x1) * channels)
					textData.set(data.subarray((y * width + x1) * channels, (y * width + x2 + 1) * channels), i)
					i += (x2 - x1 + 1) * channels
				}
			}
		}
	}

	return { regions: textRegions, data: textData }
}