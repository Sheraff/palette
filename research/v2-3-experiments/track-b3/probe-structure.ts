/**
 * Probe: continuous shading on one surface, or two distinct areas meeting at a seam?
 *
 * Flo's rule (batch 13): "a gradient represents continuous shading within one physical surface —
 * never a transition between two distinct areas/objects."
 *
 * The first two candidates measured here (interior chord occupancy, boundary length) do not
 * separate the cases — a reviewed-strong gradient scores lower on interior occupancy than the
 * sky/grass seam does. What follows adds the structural statistics: *where* the transition lives.
 *
 *  - **Transition concentration.** Sum |dt| over 4-neighbour edges and ask what share of the total
 *    variation the steepest 1% / 5% of edges carry. A seam puts most of the change in a thin line;
 *    shading spreads it over the whole surface.
 *  - **Mid-band thinness.** Take pixels whose colour sits mid-chord and compute the spatial
 *    covariance. A horizon gives a thin, highly anisotropic band; shading gives an isotropic
 *    cloud filling the domain.
 *  - **Mid-band row/column occupancy.** How much of the image the in-between colours touch.
 */
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { rgbToOKLab } from "../../v2-3/src/internal/color.ts"
import type { OKLab, RGB } from "../../v2-3/src/internal/types.ts"

const imagesRoot = resolve(process.env.PALETTE_IMAGES_ROOT ?? "images")
const corpusRoot = resolve(imagesRoot, "..")
const hexToRGB = (hex: string): RGB => {
	const v = Number.parseInt(hex.slice(1), 16)
	return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

type Row = Readonly<{ id: string; note: string; concentration1: number; concentration5: number
	thinness: number; rowOccupancy: number; midShare: number }>
const rows: Row[] = []

async function probe(relative: string, backgroundHex: string, surfaceHex: string, note: string): Promise<void> {
	const image = await loadNativeImage(await readFile(resolve(corpusRoot, relative)))
	const { width, height, data } = image as unknown as { width: number; height: number; data: Uint8Array }
	const background = rgbToOKLab(hexToRGB(backgroundHex))
	const surface = rgbToOKLab(hexToRGB(surfaceHex))
	const axis: OKLab = [surface[0] - background[0], surface[1] - background[1], surface[2] - background[2]]
	const axisSquared = axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2
	const axisLength = Math.sqrt(axisSquared)

	const pixels = width * height
	const t = new Float32Array(pixels)
	const onRamp = new Uint8Array(pixels)
	for (let index = 0; index < pixels; index += 1) {
		const lab = rgbToOKLab([data[index * 3], data[index * 3 + 1], data[index * 3 + 2]])
		const d: OKLab = [lab[0] - background[0], lab[1] - background[1], lab[2] - background[2]]
		const projection = (d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2]) / axisSquared
		t[index] = projection
		const px = d[0] - projection * axis[0]
		const py = d[1] - projection * axis[1]
		const pz = d[2] - projection * axis[2]
		onRamp[index] = (Math.hypot(px, py, pz) / axisLength <= 0.35 && projection >= -0.15 && projection <= 1.15) ? 1 : 0
	}

	// --- transition concentration -------------------------------------------------------------
	const steps: number[] = []
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const index = y * width + x
			if (!onRamp[index]) continue
			if (x + 1 < width && onRamp[index + 1]) steps.push(Math.abs(t[index + 1] - t[index]))
			if (y + 1 < height && onRamp[index + width]) steps.push(Math.abs(t[index + width] - t[index]))
		}
	}
	steps.sort((a, b) => b - a)
	const total = steps.reduce((sum, value) => sum + value, 0)
	const shareOfTop = (fraction: number): number => {
		const count = Math.max(1, Math.floor(steps.length * fraction))
		let carried = 0
		for (let i = 0; i < count; i += 1) carried += steps[i]
		return total > 0 ? carried / total : 0
	}
	const concentration1 = shareOfTop(0.01)
	const concentration5 = shareOfTop(0.05)

	// --- mid-band spatial structure -----------------------------------------------------------
	let count = 0
	let sumX = 0
	let sumY = 0
	const touchedRows = new Set<number>()
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const index = y * width + x
			if (!onRamp[index] || t[index] < 0.4 || t[index] > 0.6) continue
			count += 1
			sumX += x
			sumY += y
			touchedRows.add(y)
		}
	}
	let thinness = Number.NaN
	if (count > 8) {
		const meanX = sumX / count
		const meanY = sumY / count
		let cxx = 0
		let cyy = 0
		let cxy = 0
		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) {
				const index = y * width + x
				if (!onRamp[index] || t[index] < 0.4 || t[index] > 0.6) continue
				cxx += (x - meanX) ** 2
				cyy += (y - meanY) ** 2
				cxy += (x - meanX) * (y - meanY)
			}
		}
		cxx /= count; cyy /= count; cxy /= count
		const trace = cxx + cyy
		const determinant = cxx * cyy - cxy * cxy
		const minor = trace / 2 - Math.sqrt(Math.max(0, (trace / 2) ** 2 - determinant))
		// Minor axis of the in-between colours, as a fraction of the image's short side.
		thinness = Math.sqrt(Math.max(0, minor)) / Math.min(width, height)
	}
	let onRampCount = 0
	for (let i = 0; i < pixels; i += 1) onRampCount += onRamp[i]

	rows.push({
		id: relative.split("/").pop()!.slice(-10), note,
		concentration1, concentration5, thinness,
		rowOccupancy: touchedRows.size / height,
		midShare: count / Math.max(1, onRampCount),
	})
}

const f = (v: number, d = 3): string => (Number.isNaN(v) ? "  n/a" : v.toFixed(d)).padStart(7)

await probe("07/ab67616d0000b2730007cc8b341c11227aa7b461", "#5d856b", "#99bece", "SEAM sky/grass — must NOT be gradient")
await probe("04/ab67616d00001e020004ccf0ae91364130886c02", "#4d8a15", "#64a821", "SHADE leaf — should be gradient")
await probe("images/loups.jpg", "#fa7b34", "#ebda8a", "gradient, reviewed strong")
await probe("images/doja.jpg", "#fd75b5", "#fd3d86", "gradient, reviewed strong")
await probe("images/birdsofprey.jpg", "#141975", "#3fa72a", "gradient, reviewed strong")
await probe("images/once.jpg", "#817486", "#dddde7", "gradient, reviewed strong")
await probe("images/placebo.jpg", "#6c8a8a", "#86a5aa", "gradient, reviewed strong")
await probe("images/havana.jpg", "#375c77", "#243a51", "gradient, reviewed strong")
await probe("05/ab67616d00001e02000564718f605c1f326b2ca2", "#131929", "#18556a", "flat now; 'could imagine a gradient'")
await probe("08/ab67616d0000b27300081dec93652e6af2582192", "#56667f", "#978f9c", "gradient correct, endpoints wrong")

console.log("case        top1%  top5% thinness rowOcc midShare  note")
for (const r of rows) {
	console.log(r.id, f(r.concentration1), f(r.concentration5), f(r.thinness), f(r.rowOccupancy, 2),
		f(r.midShare, 3), " " + r.note)
}
