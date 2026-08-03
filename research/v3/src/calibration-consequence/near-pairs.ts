/**
 * The corpus-pair supplement: how often do *real* artwork colour pairs land where the calibration is
 * still uncertain?
 *
 * The flip count over the legacy corpus answers "does the uncertainty change decisions we have
 * already made". This answers the wider question underneath it: of all the near-pairs an artwork
 * actually contains, what fraction sits inside a region's 95% window, i.e. in the range where the
 * measurement genuinely does not know whether the reviewer would call them one colour.
 *
 * Method: decode a deterministic sample of sharded artworks, draw random pixel pairs, keep the ones
 * whose OKLab distance falls in the near band, and classify each by the region that governs it.
 * Rejection sampling is the right shape here because the question is *conditional on being in the
 * band* — the kept pairs are uniform over in-band pairs, which is exactly the population asked about.
 */

import { readdir } from "node:fs/promises"
import sharp from "sharp"
import { rgbToOkLab } from "../contract/color.ts"
import { SAME_COLOR_BAR_BY_REGION } from "../contract/constants.ts"
import type { ColorRegion, OkLab, Rgb8 } from "../contract/types.ts"
import {
	SAME_COLOR_BAR_BY_HUE_THIRD,
	SAME_COLOR_BAR_CI_HIGH_BY_REGION,
	SAME_COLOR_BAR_CI_LOW_BY_REGION,
	regionOfLab,
} from "./bars.ts"
import { hueThirdOf } from "../review-server/bracketing.ts"

/**
 * The near band: the distance range this supplement samples from.
 *
 * `[REVIEWED]` — set by the task that commissioned this analysis. Its lower edge sits below every
 * region's CI low (the smallest is dark-neutral's 0.00764) and its upper edge above every region's
 * CI high (the largest is light-saturated's 0.03170), so the band strictly contains every
 * uncertainty window and the "inside the window" fraction is a fraction of a superset, never of a
 * range that clips one of the windows.
 */
export const NEAR_BAND_LOW = 0.003
export const NEAR_BAND_HIGH = 0.05

/**
 * Seed for the pixel-pair sampler.
 *
 * `[HELD]` — an arbitrary constant, fixed so the run is reproducible. Any value would do; this one
 * is recorded so a rerun produces byte-identical output.
 */
export const NEAR_PAIR_SEED = 0x9e3779b9

/**
 * How many artworks to decode and how many in-band pairs to keep.
 *
 * `[HELD]` — sample sizes, not thresholds. 200 images spread evenly across the sharded corpus, 500
 * kept pairs each, for 100,000 pairs total. At 100k the binomial standard error on a fraction near
 * 0.5 is 0.16 percentage points, which is finer than any distinction this report draws.
 */
export const NEAR_PAIR_IMAGE_COUNT = 200
export const NEAR_PAIRS_PER_IMAGE = 500

/**
 * Ceiling on rejection attempts per image, so a pathological artwork (one flat colour, or a
 * high-frequency photograph with nothing in the band) cannot make the run non-terminating.
 *
 * `[HELD]` — an operational guard. Images that hit it are counted and reported, so a shortfall is
 * visible rather than silent.
 */
export const MAX_ATTEMPTS_PER_IMAGE = 4_000_000

/** mulberry32 — a small, fast, fully deterministic PRNG. Seeded once per run. */
function makeRandom(seed: number): () => number {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/** Where a pair's distance sits relative to the governing region's window. */
export type BandPosition = "below-window" | "inside-window" | "above-window"

export type RegionBandCounts = {
	pairs: number
	belowWindow: number
	insideWindow: number
	aboveWindow: number
	/** Pairs the hue-split variant judges differently from the point estimate. */
	hueSplitDisagreements: number
}

export type NearPairReport = Readonly<{
	seed: number
	band: Readonly<{ low: number; high: number }>
	imagesRequested: number
	imagesDecoded: number
	imagesShortOfQuota: number
	pairsKept: number
	attempts: number
	acceptanceRate: number
	overall: Readonly<{
		insideWindow: number
		insideWindowRate: number
		belowWindow: number
		aboveWindow: number
		hueSplitDisagreements: number
		hueSplitDisagreementRate: number
	}>
	byGoverningRegion: Record<string, RegionBandCounts & { insideWindowRate: number }>
	/** How the kept pairs distribute over the band, in 0.002-wide buckets, for shape. */
	distanceHistogram: readonly Readonly<{ low: number; high: number; count: number }>[]
	images: readonly string[]
}>

/**
 * Bucket width for the distance histogram.
 *
 * `[HELD]` — a reporting resolution, nothing judges against it. 0.002 puts about 24 buckets across
 * the band, fine enough to see where the mass sits and coarse enough to read.
 */
const HISTOGRAM_BUCKET_WIDTH = 0.002

/** Every sharded artwork, sorted, so the sample is a deterministic function of the corpus. */
export async function listShardedArtworks(repositoryRoot: string): Promise<string[]> {
	const shards = (await readdir(repositoryRoot, { withFileTypes: true }))
		.filter((entry) => entry.isDirectory() && /^[0-9a-f]{2}$/.test(entry.name))
		.map((entry) => entry.name)
		.sort()
	const files: string[] = []
	for (const shard of shards) {
		const names = (await readdir(`${repositoryRoot}/${shard}`)).filter((name) => name.endsWith(".jpg")).sort()
		for (const name of names) files.push(`${shard}/${name}`)
	}
	return files
}

/** Evenly spaced picks across the sorted list — deterministic, and spread over every shard. */
export function selectEvenly<T>(items: readonly T[], count: number): T[] {
	if (items.length <= count) return [...items]
	const picks: T[] = []
	for (let index = 0; index < count; index++) {
		picks.push(items[Math.floor((index * items.length) / count)])
	}
	return picks
}

function emptyCounts(): RegionBandCounts {
	return { pairs: 0, belowWindow: 0, insideWindow: 0, aboveWindow: 0, hueSplitDisagreements: 0 }
}

/**
 * The bar a colour contributes under the point estimate and under the hue split, in one pass — the
 * sampler needs both for every pixel it touches and building PaletteColor objects for 100,000 pairs
 * would dominate the run.
 */
function barsFor(lab: OkLab): { region: ColorRegion; point: number; hueSplit: number } {
	const region = regionOfLab(lab)
	const point = SAME_COLOR_BAR_BY_REGION[region]
	return {
		region,
		point,
		hueSplit: region === "light-saturated" ? SAME_COLOR_BAR_BY_HUE_THIRD[hueThirdOf(lab)] : point,
	}
}

export async function sampleNearPairs(
	repositoryRoot: string,
	options: { imageCount?: number; pairsPerImage?: number; seed?: number } = {},
): Promise<NearPairReport> {
	const imageCount = options.imageCount ?? NEAR_PAIR_IMAGE_COUNT
	const pairsPerImage = options.pairsPerImage ?? NEAR_PAIRS_PER_IMAGE
	const random = makeRandom(options.seed ?? NEAR_PAIR_SEED)

	const all = await listShardedArtworks(repositoryRoot)
	const selected = selectEvenly(all, imageCount)

	const byRegion: Record<string, RegionBandCounts> = {
		"dark-neutral": emptyCounts(),
		"dark-saturated": emptyCounts(),
		"light-neutral": emptyCounts(),
		"light-saturated": emptyCounts(),
	}
	const bucketCount = Math.ceil((NEAR_BAND_HIGH - NEAR_BAND_LOW) / HISTOGRAM_BUCKET_WIDTH)
	const histogram = new Array<number>(bucketCount).fill(0)

	let pairsKept = 0
	let attempts = 0
	let imagesDecoded = 0
	let imagesShortOfQuota = 0

	for (const relative of selected) {
		let raw: { data: Buffer; info: sharp.OutputInfo }
		try {
			raw = await sharp(`${repositoryRoot}/${relative}`).removeAlpha().raw().toBuffer({
				resolveWithObject: true,
			})
		} catch {
			continue
		}
		imagesDecoded++
		const pixelCount = raw.info.width * raw.info.height
		const channels = raw.info.channels

		// Precompute OKLab for every pixel once: the sampler touches each image tens of thousands of
		// times and the conversion is the expensive part.
		const labs = new Float64Array(pixelCount * 3)
		for (let index = 0; index < pixelCount; index++) {
			const offset = index * channels
			const lab = rgbToOkLab([raw.data[offset], raw.data[offset + 1], raw.data[offset + 2]] as Rgb8)
			labs[index * 3] = lab[0]
			labs[index * 3 + 1] = lab[1]
			labs[index * 3 + 2] = lab[2]
		}

		let keptHere = 0
		let attemptsHere = 0
		while (keptHere < pairsPerImage && attemptsHere < MAX_ATTEMPTS_PER_IMAGE) {
			attemptsHere++
			const a = Math.floor(random() * pixelCount)
			const b = Math.floor(random() * pixelCount)
			if (a === b) continue
			const dl = labs[a * 3] - labs[b * 3]
			const da = labs[a * 3 + 1] - labs[b * 3 + 1]
			const db = labs[a * 3 + 2] - labs[b * 3 + 2]
			const distance = Math.sqrt(dl * dl + da * da + db * db)
			if (distance < NEAR_BAND_LOW || distance >= NEAR_BAND_HIGH) continue

			const firstLab: OkLab = [labs[a * 3], labs[a * 3 + 1], labs[a * 3 + 2]]
			const secondLab: OkLab = [labs[b * 3], labs[b * 3 + 1], labs[b * 3 + 2]]
			const first = barsFor(firstLab)
			const second = barsFor(secondLab)

			// The governing region is the one supplying the larger point bar — the contract's straddle
			// rule, so "which region's calibration is on the hook for this pair" is answered the same
			// way `sameColorBar()` answers it.
			const governing = first.point >= second.point ? first.region : second.region
			const low = SAME_COLOR_BAR_CI_LOW_BY_REGION[governing]
			const high = SAME_COLOR_BAR_CI_HIGH_BY_REGION[governing]
			const position: BandPosition = distance < low
				? "below-window"
				: distance < high
				? "inside-window"
				: "above-window"

			const counts = byRegion[governing]
			counts.pairs++
			if (position === "below-window") counts.belowWindow++
			else if (position === "inside-window") counts.insideWindow++
			else counts.aboveWindow++

			const pointBar = Math.max(first.point, second.point)
			const hueSplitBar = Math.max(first.hueSplit, second.hueSplit)
			if (distance < pointBar !== distance < hueSplitBar) counts.hueSplitDisagreements++

			const bucket = Math.min(
				bucketCount - 1,
				Math.floor((distance - NEAR_BAND_LOW) / HISTOGRAM_BUCKET_WIDTH),
			)
			histogram[bucket]++

			keptHere++
			pairsKept++
		}
		attempts += attemptsHere
		if (keptHere < pairsPerImage) imagesShortOfQuota++
	}

	let insideWindow = 0
	let belowWindow = 0
	let aboveWindow = 0
	let hueSplitDisagreements = 0
	const byGoverningRegion: NearPairReport["byGoverningRegion"] = {}
	for (const [region, counts] of Object.entries(byRegion)) {
		insideWindow += counts.insideWindow
		belowWindow += counts.belowWindow
		aboveWindow += counts.aboveWindow
		hueSplitDisagreements += counts.hueSplitDisagreements
		byGoverningRegion[region] = {
			...counts,
			insideWindowRate: counts.pairs === 0 ? 0 : counts.insideWindow / counts.pairs,
		}
	}

	return {
		seed: options.seed ?? NEAR_PAIR_SEED,
		band: { low: NEAR_BAND_LOW, high: NEAR_BAND_HIGH },
		imagesRequested: selected.length,
		imagesDecoded,
		imagesShortOfQuota,
		pairsKept,
		attempts,
		acceptanceRate: attempts === 0 ? 0 : pairsKept / attempts,
		overall: {
			insideWindow,
			insideWindowRate: pairsKept === 0 ? 0 : insideWindow / pairsKept,
			belowWindow,
			aboveWindow,
			hueSplitDisagreements,
			hueSplitDisagreementRate: pairsKept === 0 ? 0 : hueSplitDisagreements / pairsKept,
		},
		byGoverningRegion,
		distanceHistogram: histogram.map((count, index) => ({
			low: NEAR_BAND_LOW + index * HISTOGRAM_BUCKET_WIDTH,
			high: Math.min(NEAR_BAND_HIGH, NEAR_BAND_LOW + (index + 1) * HISTOGRAM_BUCKET_WIDTH),
			count,
		})),
		images: selected,
	}
}
