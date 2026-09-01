/**
 * The palette composer's server side: an artwork's own colours (REVIEW_UI.md §4).
 *
 * The composer lets the reviewer assemble a palette by hand and submit it as an `endorsed-sample`.
 * Its primary use is **reachability diagnosis** — "can the algorithm even produce this?" — and that
 * only means something if the endorsed palette is made of colours the artwork actually contains.
 * The output contract says role and stop colours are *exact source pixels* (PHASE_0_DECISIONS.md
 * §2), so the composer offers exactly two ways to pick a colour, and both return a real pixel:
 *
 *  - the **eyedropper**: a normalized (x, y) is resolved against the decoded image here, on the
 *    server, so the sampled value is the file's pixel and not whatever the browser happened to
 *    resample it to on screen. Normalized coordinates rather than pixel ones, per CONVENTIONS.md;
 *  - the **swatch grid**: the artwork's colours merged under the one ruler and each cluster
 *    represented by its most frequent *exact* member, never by an average.
 *
 * Membership is then enforced at submit time against a bitmap of every colour in the file, so a
 * hand-edited request cannot smuggle in a colour the artwork does not contain.
 *
 * Nothing here decides anything about a palette's quality: the composer must be able to assemble a
 * palette the contract would reject, because "what the reviewer wanted and the algorithm cannot
 * reach" is the measurement.
 */
import { readFile } from "node:fs/promises"
import sharp from "sharp"
import { colorFromRgb, colorRegion, okLabDistance, rgbToOkLab } from "../contract/color.ts"
import { SAME_COLOR_BAR_BY_REGION } from "../contract/constants.ts"
import type { ColorRegion, OkLab, Rgb8 } from "../contract/types.ts"
import { BadRequest } from "./batch.ts"
import { nameHexes, normalizeHex } from "./color.ts"

/**
 * How many swatches the grid offers.
 * [UNCALIBRATED] — chosen here: enough for the compact grid under the artwork to cover an album
 * cover's regions, few enough to scan in one look. The eyedropper covers everything the grid misses,
 * so this number bounds convenience, never reachability.
 */
export const SWATCH_GRID_SIZE = 24

/**
 * How many colour clusters the merge pass is allowed to open before it only absorbs.
 *
 * [MEASURED] — on `00/ab67616d00001e0200003a64886c352827bad270.jpg` (a dark warm photo, 39 878
 * distinct colours in 90 000 pixels), the area the shown 24 swatches stand for is 30.7% at a limit of
 * 64, 32.0% at 128, 35.9% at 256 and 35.9% at 512, at 0.15 / 0.31 / 0.58 / 1.00 s of merge time. The
 * grid saturates at 256, so that is where this sits: past it the pass only costs time, and below it
 * the grid is an artefact of where the pass stopped rather than the artwork's own colours.
 *
 * That the number is 36% and not 90% is a property of a photograph under the one ruler, not a defect:
 * a photo genuinely holds hundreds of colours that do not read as each other. `coveredAreaFraction`
 * says so on screen, and the eyedropper reaches everything the grid does not.
 */
export const SWATCH_CLUSTER_LIMIT = 256

/**
 * Decoded artworks held in memory, most recently used first.
 * [UNCALIBRATED] — chosen here. The reviewer composes on one item at a time; two entries cover
 * "went back to the previous item" without holding a batch's worth of raw pixels.
 */
export const IMAGE_COLOR_CACHE_SIZE = 2

/** One entry of the swatch grid: an exact source pixel, with how much of the artwork it stands for. */
export type Swatch = Readonly<{
	hex: string
	/** `colornames-oklab` name — every colour the reviewer sees is named (REVIEW_UI.md §3). */
	name: string
	/**
	 * Fraction of the artwork's opaque pixels this cluster covers, in [0,1]. An area fraction and
	 * never a pixel count, per CONVENTIONS.md — the same swatch must mean the same thing at any
	 * rendition size.
	 */
	areaFraction: number
}>

export type ImageColors = Readonly<{
	width: number
	height: number
	/** Opaque pixels considered. Fully transparent pixels show no colour and are skipped. */
	pixels: number
	distinctColors: number
	swatches: readonly Swatch[]
	/**
	 * Fraction of the artwork the shown swatches stand for, in [0,1].
	 *
	 * Reported because it is usually well under 1 on a photograph and the reviewer should know: the
	 * grid is the artwork's most common colours, not a partition of it. What the grid misses, the
	 * eyedropper reaches.
	 */
	coveredAreaFraction: number
	/** Membership bitmap over the 2^24 sRGB colours: 2 MB, constant whatever the image size. */
	present: Uint8Array
	/** Raw sRGB bytes, 3 per pixel, row-major — what the eyedropper samples. */
	rgb: Uint8Array
}>

function pack(red: number, green: number, blue: number): number {
	return (red << 16) | (green << 8) | blue
}

function unpack(packed: number): Rgb8 {
	return [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff]
}

function toHex(rgb: Rgb8): string {
	return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

/**
 * The one ruler, with the regions precomputed.
 *
 * This is `sameColorBar(first, second)` from the contract module — the max of the two colours'
 * region bars — evaluated on regions computed once per distinct colour instead of twice per
 * comparison, because the merge pass runs the comparison millions of times. `composer.test.ts`
 * asserts the two agree over a grid of pairs, so the shortcut cannot drift from the ruler.
 */
function barBetween(first: ColorRegion, second: ColorRegion): number {
	return Math.max(SAME_COLOR_BAR_BY_REGION[first], SAME_COLOR_BAR_BY_REGION[second])
}

export { barBetween as sameColorBarByRegion }

/**
 * Decode one artwork and take everything the composer needs from it in a single pass.
 *
 * Full resolution on purpose: a swatch grid built from a downscaled copy would offer colours that
 * are resampling averages, and those are not source pixels.
 */
async function decode(path: string): Promise<ImageColors> {
	const bytes = await readFile(path)
	let data: Buffer
	let info: sharp.OutputInfo
	try {
		// Force sRGB so a CMYK or greyscale file arrives as the 3 (or 4, with alpha) channels the
		// rest of this file assumes. Without it a CMYK JPEG yields four channels that are not RGBA.
		const raw = await sharp(bytes).toColourspace("srgb").raw().toBuffer({ resolveWithObject: true })
		data = raw.data
		info = raw.info
	} catch (error) {
		throw new BadRequest(`cannot decode ${path} for the composer (${(error as Error).message})`)
	}
	const channels = info.channels
	if (channels !== 3 && channels !== 4) {
		throw new BadRequest(`${path} decoded to ${channels} channels; the composer needs sRGB or sRGB+alpha`)
	}

	const present = new Uint8Array(1 << 21)
	const counts = new Map<number, number>()
	let pixels = 0
	for (let offset = 0; offset + channels <= data.length; offset += channels) {
		// A fully transparent pixel shows no colour; endorsing one would endorse the mock's field.
		if (channels === 4 && data[offset + 3] === 0) continue
		const packed = pack(data[offset], data[offset + 1], data[offset + 2])
		present[packed >> 3] |= 1 << (packed & 7)
		counts.set(packed, (counts.get(packed) ?? 0) + 1)
		pixels += 1
	}

	const swatches = buildSwatches(counts, pixels)
	return {
		width: info.width,
		height: info.height,
		pixels,
		distinctColors: counts.size,
		swatches,
		coveredAreaFraction: swatches.reduce((total, entry) => total + entry.areaFraction, 0),
		present,
		// Only the colour channels: the eyedropper answers "which colour is here", and alpha is not one.
		rgb: channels === 3 ? new Uint8Array(data) : stripAlpha(data),
	}
}

function stripAlpha(data: Buffer): Uint8Array {
	const out = new Uint8Array((data.length / 4) * 3)
	for (let source = 0, target = 0; source + 4 <= data.length; source += 4, target += 3) {
		out[target] = data[source]
		out[target + 1] = data[source + 1]
		out[target + 2] = data[source + 2]
	}
	return out
}

/**
 * Merge the artwork's colours under the one ruler and keep the most frequent exact member of each
 * cluster.
 *
 * Greedy in descending frequency: the most common unabsorbed colour opens a cluster and every later
 * colour that reads as the same colour joins it. That makes every representative an exact source
 * pixel — a cluster mean would not be one — and it makes the grid's order the artwork's own order of
 * importance. Deterministic: the scan order is (count desc, packed value asc), so the same file
 * always produces the same grid.
 */
function buildSwatches(counts: Map<number, number>, pixels: number): Swatch[] {
	if (pixels === 0) return []
	const distinct = [...counts.entries()].sort((first, second) => second[1] - first[1] || first[0] - second[0])
	const clusters: Array<{ packed: number; lab: OkLab; region: ColorRegion; count: number }> = []

	for (const [packed, count] of distinct) {
		const rgb = unpack(packed)
		const lab = rgbToOkLab(rgb)
		const region = colorRegion(colorFromRgb(rgb))
		let absorbed = false
		for (const cluster of clusters) {
			if (okLabDistance(cluster.lab, lab) <= barBetween(cluster.region, region)) {
				cluster.count += count
				absorbed = true
				break
			}
		}
		if (!absorbed && clusters.length < SWATCH_CLUSTER_LIMIT) clusters.push({ packed, lab, region, count })
	}

	const kept = clusters.sort((first, second) => second.count - first.count || first.packed - second.packed).slice(0, SWATCH_GRID_SIZE)
	const names = nameHexes(kept.map((cluster) => toHex(unpack(cluster.packed))))
	return kept.map((cluster) => {
		const hex = toHex(unpack(cluster.packed))
		return { hex, name: names[hex] ?? hex, areaFraction: cluster.count / pixels }
	})
}

const cache: Array<{ key: string; colors: ImageColors }> = []

/**
 * The artwork's colours, decoded at most once per content hash.
 *
 * Keyed by the content hash rather than the path: two paths holding the same bytes are the same
 * artwork, and a path whose bytes changed is not the one that was cached (the media route's custody
 * check is what notices that).
 */
export async function readImageColors(path: string, contentHash: string): Promise<ImageColors> {
	const hit = cache.findIndex((entry) => entry.key === contentHash)
	if (hit >= 0) {
		const [entry] = cache.splice(hit, 1)
		cache.unshift(entry)
		return entry.colors
	}
	const colors = await decode(path)
	cache.unshift({ key: contentHash, colors })
	while (cache.length > IMAGE_COLOR_CACHE_SIZE) cache.pop()
	return colors
}

/** Drop the decoded-image cache. Tests use it to prove the cache is an optimization, not state. */
export function clearImageColorCache(): void {
	cache.length = 0
}

export type SampledPixel = Readonly<{
	hex: string
	name: string
	/** The sampled pixel's own centre, normalized — what the page draws its marker at. */
	x: number
	y: number
}>

/**
 * The colour at a normalized coordinate.
 *
 * Normalized in, normalized out (CONVENTIONS.md): the browser knows where the click landed inside
 * the rendered image and nothing about the file's real size, and the answer must not depend on how
 * large the image happened to be drawn.
 */
export function pixelAt(colors: ImageColors, x: number, y: number): SampledPixel {
	if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
		throw new BadRequest("x and y must be normalized coordinates in [0,1]")
	}
	const column = Math.min(colors.width - 1, Math.floor(x * colors.width))
	const row = Math.min(colors.height - 1, Math.floor(y * colors.height))
	const offset = (row * colors.width + column) * 3
	const hex = toHex([colors.rgb[offset], colors.rgb[offset + 1], colors.rgb[offset + 2]])
	return {
		hex,
		name: nameHexes([hex])[hex] ?? hex,
		x: (column + 0.5) / colors.width,
		y: (row + 0.5) / colors.height,
	}
}

/** True when the artwork contains this exact colour. */
export function containsColor(colors: ImageColors, hex: string): boolean {
	const normalized = normalizeHex(hex)
	const packed = Number.parseInt(normalized.slice(1), 16)
	return (colors.present[packed >> 3] & (1 << (packed & 7))) !== 0
}

/**
 * Every colour of a composed palette that the artwork does not contain.
 *
 * Returned rather than thrown so the caller can name all of them at once: a composer request that
 * fails one colour at a time is a composer request the reviewer submits four times.
 */
export function foreignColors(colors: ImageColors, hexes: Iterable<string>): string[] {
	const foreign: string[] = []
	for (const hex of hexes) {
		if (!containsColor(colors, hex) && !foreign.includes(hex)) foreign.push(hex)
	}
	return foreign
}
