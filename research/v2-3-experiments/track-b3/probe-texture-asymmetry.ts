/**
 * Do the two endpoint regions have *different surface texture*?
 *
 * Grass is high-frequency and directional; sky is smooth. Two sides of one shaded surface share a
 * texture because they are the same material. So the asymmetry of local roughness between the two
 * endpoint populations is a signal about *what the regions are*, which is what the colour-ramp
 * statistics could not reach.
 *
 * Roughness here is the mean OKLab step to the right/down neighbour, measured separately for
 * pixels sitting near each end of the endpoint chord.
 */
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { okDistance, rgbToOKLab } from "../../v2-3/src/internal/color.ts"
import type { OKLab, RGB } from "../../v2-3/src/internal/types.ts"

const imagesRoot = resolve(process.env.PALETTE_IMAGES_ROOT ?? "images")
const corpusRoot = resolve(imagesRoot, "..")
const hexToRGB = (hex: string): RGB => {
	const v = Number.parseInt(hex.slice(1), 16)
	return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

async function probe(relative: string, backgroundHex: string, surfaceHex: string, note: string): Promise<void> {
	const image = await loadNativeImage(await readFile(resolve(corpusRoot, relative)))
	const { width, height, data } = image as unknown as { width: number; height: number; data: Uint8Array }
	const background = rgbToOKLab(hexToRGB(backgroundHex))
	const surface = rgbToOKLab(hexToRGB(surfaceHex))
	const axis: OKLab = [surface[0] - background[0], surface[1] - background[1], surface[2] - background[2]]
	const axisSquared = axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2
	const axisLength = Math.sqrt(axisSquared)

	const pixels = width * height
	const labs: OKLab[] = new Array(pixels)
	const t = new Float32Array(pixels)
	const near = new Float32Array(pixels)
	for (let i = 0; i < pixels; i += 1) {
		const lab = rgbToOKLab([data[i * 3], data[i * 3 + 1], data[i * 3 + 2]])
		labs[i] = lab
		const d: OKLab = [lab[0] - background[0], lab[1] - background[1], lab[2] - background[2]]
		const projection = (d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2]) / axisSquared
		t[i] = projection
		near[i] = Math.hypot(
			d[0] - projection * axis[0], d[1] - projection * axis[1], d[2] - projection * axis[2],
		) / axisLength
	}
	const roughnessOf = (low: number, high: number): number => {
		let sum = 0
		let count = 0
		for (let y = 0; y < height - 1; y += 1) {
			for (let x = 0; x < width - 1; x += 1) {
				const i = y * width + x
				if (near[i] > 0.35 || t[i] < low || t[i] > high) continue
				sum += okDistance(labs[i], labs[i + 1]) + okDistance(labs[i], labs[i + width])
				count += 2
			}
		}
		return count > 0 ? sum / count : Number.NaN
	}
	const backgroundRoughness = roughnessOf(-0.15, 0.2)
	const surfaceRoughness = roughnessOf(0.8, 1.15)
	const ratio = Math.max(backgroundRoughness, surfaceRoughness) / Math.max(1e-6, Math.min(backgroundRoughness, surfaceRoughness))
	console.log(
		(relative.split("/").pop() ?? "").slice(-14).padEnd(15),
		backgroundRoughness.toFixed(4).padStart(8), surfaceRoughness.toFixed(4).padStart(8),
		ratio.toFixed(2).padStart(7), " " + note,
	)
}

console.log("case".padEnd(15), " roughBg", "roughSurf", "  RATIO", " note")
await probe("07/ab67616d0000b2730007cc8b341c11227aa7b461", "#5d856b", "#99bece", "SEAM grass/sky — must NOT be gradient")
await probe("04/ab67616d00001e020004ccf0ae91364130886c02", "#4d8a15", "#64a821", "SHADE leaf — one surface")
await probe("images/loups.jpg", "#fa7b34", "#ebda8a", "gradient, reviewed strong")
await probe("images/doja.jpg", "#fd75b5", "#fd3d86", "gradient, reviewed strong")
await probe("images/birdsofprey.jpg", "#141975", "#3fa72a", "gradient, reviewed strong")
await probe("images/once.jpg", "#817486", "#dddde7", "gradient, reviewed strong")
await probe("images/placebo.jpg", "#6c8a8a", "#86a5aa", "gradient, reviewed strong")
await probe("images/havana.jpg", "#375c77", "#243a51", "gradient, reviewed strong")
await probe("images/muse.jpg", "#000000", "#026faa", "gradient, reviewed strong")
await probe("images/slim.jpg", "#01040b", "#140e18", "gradient, reviewed strong")
await probe("08/ab67616d0000b27300081dec93652e6af2582192", "#56667f", "#978f9c", "gradient correct")
