import sharp from "sharp"

/**
 * Deterministic palette of colors actually present in an image, used by the review UI so a role
 * correction is a click on a color the artwork contains rather than a typed hex.
 */

export type Swatch = Readonly<{
	hex: string
	rgb: readonly [number, number, number]
	share: number
	source: "image" | "palette"
}>

function clampChannels(r: number, g: number, b: number): [number, number, number] {
	return [r, g, b].map((channel) => Math.max(0, Math.min(255, Math.round(channel)))) as [number, number, number]
}

function hex(r: number, g: number, b: number): string {
	return `#${clampChannels(r, g, b).map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

function fromHex(value: string): [number, number, number] {
	return [
		Number.parseInt(value.slice(1, 3), 16),
		Number.parseInt(value.slice(3, 5), 16),
		Number.parseInt(value.slice(5, 7), 16),
	]
}

function distanceSquared(a: readonly [number, number, number], b: readonly [number, number, number]): number {
	return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
}

export async function sampleImageSwatches(bytes: Buffer, limit = 18): Promise<Swatch[]> {
	const { data, info } = await sharp(bytes)
		.rotate()
		.flatten({ background: "#ffffff" })
		.resize(128, 128, { fit: "inside", withoutEnlargement: true })
		.toColorspace("srgb")
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true })
	const channels = info.channels
	const bins = new Map<number, { count: number; r: number; g: number; b: number }>()
	for (let offset = 0; offset + channels <= data.length; offset += channels) {
		const [r, g, b] = [data[offset], data[offset + 1], data[offset + 2]]
		// 4 bits per channel: coarse enough to merge JPEG noise, fine enough to keep identity colors apart.
		const bin = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
		const existing = bins.get(bin)
		if (existing === undefined) bins.set(bin, { count: 1, r, g, b })
		else {
			existing.count += 1
			existing.r += r
			existing.g += g
			existing.b += b
		}
	}
	const total = info.width * info.height
	const candidates = [...bins.entries()]
		.map(([bin, value]) => ({
			bin,
			count: value.count,
			rgb: [value.r / value.count, value.g / value.count, value.b / value.count] as [number, number, number],
		}))
		.sort((a, b) => b.count - a.count || a.bin - b.bin)

	const chosen: { rgb: [number, number, number]; count: number }[] = []
	const takenBins = new Set<number>()
	for (const threshold of [42, 20, 0]) {
		for (const candidate of candidates) {
			if (chosen.length >= limit) break
			if (takenBins.has(candidate.bin)) continue
			if (chosen.every((entry) => distanceSquared(entry.rgb, candidate.rgb) >= threshold ** 2)) {
				chosen.push({ rgb: candidate.rgb, count: candidate.count })
				takenBins.add(candidate.bin)
			}
		}
		if (chosen.length >= Math.min(limit, candidates.length)) break
	}
	const seen = new Set<string>()
	const swatches: Swatch[] = []
	for (const entry of chosen) {
		const rgb = clampChannels(entry.rgb[0], entry.rgb[1], entry.rgb[2])
		const value = hex(rgb[0], rgb[1], rgb[2])
		if (seen.has(value)) continue
		seen.add(value)
		swatches.push({ hex: value, rgb, share: entry.count / total, source: "image" })
	}
	return swatches
}

/** Image swatches first, then any palette colors under review that the sampling did not already cover. */
export function withPaletteSwatches(imageSwatches: readonly Swatch[], paletteHexes: readonly string[]): Swatch[] {
	const seen = new Set(imageSwatches.map((swatch) => swatch.hex))
	const extra: Swatch[] = []
	for (const value of [...new Set(paletteHexes)].sort()) {
		if (seen.has(value)) continue
		seen.add(value)
		extra.push({ hex: value, rgb: fromHex(value), share: 0, source: "palette" })
	}
	return [...imageSwatches, ...extra]
}
