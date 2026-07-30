import sharp from "sharp"
import { rgbToOKLab } from "../../src/color.ts"

/**
 * Deterministic palette of colors actually present in an image, used by the review UI so a role
 * correction is a click on a color the artwork contains rather than a typed hex.
 *
 * Three properties matter for review:
 *
 * 1. **Exactness.** Every swatch is an exact pixel value taken from the image (the most common exact
 *    color inside its cluster), never a cluster mean. A mean is a color the artwork does not contain,
 *    which is what made thin red text read as a muddy "barn red".
 * 2. **Resolution.** Sampling happens at native resolution (capped for very large artwork). Downscaling
 *    blends thin strokes into their background and destroys exactly the small salient elements — logo
 *    text, credits, outlines — that a reviewer wants to nominate as an accent.
 * 3. **Salience, not just population.** A second pass picks high-chroma colors that are perceptually far
 *    from everything already chosen, even when their population is small — but never below a minimum
 *    representativity, so a stray pixel or a JPEG aberration can never become a swatch.
 */

export type Swatch = Readonly<{
	hex: string
	rgb: readonly [number, number, number]
	share: number
	source: "image" | "palette"
}>

/** Sampling never exceeds this many pixels; larger artwork is fitted down before decoding. */
const MAX_SAMPLED_PIXELS = 4_000_000
/** Cluster granularity: 4 bits per channel, the same coarse grouping the population pass always used. */
const CLUSTER_BITS = 4
const POPULATION_SWATCHES = 14
const SALIENT_SWATCHES = 8
/** A salient cluster must cover at least this share of the image, and at least this many pixels. */
const SALIENT_MIN_SHARE = 0.0002
const SALIENT_MIN_PIXELS = 48
/** Greedy spread distances in OKLab, relaxed in tiers when an image is too flat to fill the first one. */
const SPREAD_TIERS = [0.055, 0.03, 0] as const
/** A salient pick must be at least this far in OKLab from every color already chosen. */
const SALIENT_MIN_ISOLATION = 0.04
/** Final perceptual dedupe distance in OKLab. */
const DEDUPE_DISTANCE = 0.02

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

function unpack(packed: number): [number, number, number] {
	return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255]
}

function distance(a: readonly [number, number, number], b: readonly [number, number, number]): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

type Cluster = Readonly<{
	bin: number
	count: number
	/** The most common exact color inside the cluster: a real pixel value, deterministically chosen. */
	packed: number
	rgb: readonly [number, number, number]
	oklab: readonly [number, number, number]
	chroma: number
}>

async function decodePixels(bytes: Buffer): Promise<{ data: Buffer; channels: number; pixels: number }> {
	const metadata = await sharp(bytes).metadata()
	const width = metadata.width ?? 0
	const height = metadata.height ?? 0
	const oriented = (metadata.orientation ?? 1) >= 5 ? { width: height, height: width } : { width, height }
	const total = oriented.width * oriented.height
	let pipeline = sharp(bytes).rotate().flatten({ background: "#ffffff" })
	if (total > MAX_SAMPLED_PIXELS) {
		// Fit down only for very large artwork; the scale is derived from the image, so it stays deterministic.
		const scale = Math.sqrt(MAX_SAMPLED_PIXELS / total)
		pipeline = pipeline.resize(
			Math.max(1, Math.floor(oriented.width * scale)),
			Math.max(1, Math.floor(oriented.height * scale)),
			{ fit: "inside" },
		)
	}
	const { data, info } = await pipeline.toColorspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true })
	return { data, channels: info.channels, pixels: info.width * info.height }
}

/** Group exact colors into coarse clusters, keeping each cluster's population and its modal exact color. */
function clusterColors(exact: Map<number, number>): Cluster[] {
	const shift = 8 - CLUSTER_BITS
	const grouped = new Map<number, { count: number; packed: number; modeCount: number }>()
	for (const [packed, count] of exact) {
		const [r, g, b] = unpack(packed)
		const bin = ((r >> shift) << (CLUSTER_BITS * 2)) | ((g >> shift) << CLUSTER_BITS) | (b >> shift)
		const existing = grouped.get(bin)
		if (existing === undefined) grouped.set(bin, { count, packed, modeCount: count })
		else {
			existing.count += count
			// Ties resolve to the lower packed value, so the representative never depends on iteration order.
			if (count > existing.modeCount || (count === existing.modeCount && packed < existing.packed)) {
				existing.packed = packed
				existing.modeCount = count
			}
		}
	}
	return [...grouped.entries()].map(([bin, value]) => {
		const rgb = unpack(value.packed)
		const oklab = rgbToOKLab(rgb)
		return { bin, count: value.count, packed: value.packed, rgb, oklab, chroma: Math.hypot(oklab[1], oklab[2]) }
	})
}

export async function sampleImageSwatches(bytes: Buffer): Promise<Swatch[]> {
	const { data, channels, pixels } = await decodePixels(bytes)
	const exact = new Map<number, number>()
	for (let offset = 0; offset + channels <= data.length; offset += channels) {
		const packed = (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2]
		exact.set(packed, (exact.get(packed) ?? 0) + 1)
	}
	const clusters = clusterColors(exact)
	const chosen: Cluster[] = []
	const taken = new Set<number>()

	// Pass 1 - population: the colors the artwork is mostly made of, spread out perceptually.
	const byPopulation = [...clusters].sort((a, b) => b.count - a.count || a.bin - b.bin)
	for (const threshold of SPREAD_TIERS) {
		for (const cluster of byPopulation) {
			if (chosen.length >= POPULATION_SWATCHES) break
			if (taken.has(cluster.bin)) continue
			if (chosen.every((entry) => distance(entry.oklab, cluster.oklab) >= threshold)) {
				chosen.push(cluster)
				taken.add(cluster.bin)
			}
		}
		if (chosen.length >= Math.min(POPULATION_SWATCHES, clusters.length)) break
	}

	// Pass 2 - salience: small but vivid, perceptually isolated elements (thin text, logos, outlines).
	const floor = Math.max(SALIENT_MIN_PIXELS, Math.ceil(pixels * SALIENT_MIN_SHARE))
	const eligible = clusters.filter((cluster) => !taken.has(cluster.bin) && cluster.count >= floor)
	for (let picked = 0; picked < SALIENT_SWATCHES; picked += 1) {
		let best: { cluster: Cluster; score: number } | null = null
		for (const cluster of eligible) {
			if (taken.has(cluster.bin)) continue
			const isolation = Math.min(...chosen.map((entry) => distance(entry.oklab, cluster.oklab)))
			if (isolation < SALIENT_MIN_ISOLATION) continue
			const score = cluster.chroma * isolation
			if (best === null || score > best.score || (score === best.score && cluster.bin < best.cluster.bin)) {
				best = { cluster, score }
			}
		}
		if (best === null) break
		chosen.push(best.cluster)
		taken.add(best.cluster.bin)
	}

	// Final perceptual dedupe, keeping the earlier (more populous, then more salient) entry.
	const swatches: Swatch[] = []
	const kept: Cluster[] = []
	for (const cluster of chosen) {
		if (kept.some((entry) => distance(entry.oklab, cluster.oklab) < DEDUPE_DISTANCE)) continue
		kept.push(cluster)
		swatches.push({
			hex: hex(cluster.rgb[0], cluster.rgb[1], cluster.rgb[2]),
			rgb: cluster.rgb,
			share: cluster.count / pixels,
			source: "image",
		})
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
