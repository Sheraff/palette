/**
 * The "belongs" study — measuring candidate source-support features against reviewer verdicts.
 *
 * Written for `reviews/toolbox-review/bias-audit.md` B1, which measured that invariant 2's
 * exact-8-bit-triple population rule refuses 96.9% of the reviewer's own endorsed palettes, and
 * proposed measuring population within the calibrated same-colour bar instead. The reviewer then
 * reframed the target: the criterion is not "this colour exists in the artwork" but "this colour
 * feels like it belongs in the artwork", enforced in a way that is "not limiting, but also
 * automated".
 *
 * This script does not change the contract. It measures five candidate features per published
 * colour against its artwork's pixels and reports how well each separates reviewer-endorsed
 * colours from known-bad colours:
 *
 *   (a) exactShare          — exact-triple population share. The rule shipping today.
 *   (b) neighbourhoodShare  — population within the regional same-colour bar. The B1 fix.
 *   (c) modeDistance        — OKLab distance to the nearest substantial colour mode.
 *   (d) hueDistance         — hue-angle distance to the nearest substantial mode, lightness and
 *                             chroma free. The "same hue, adjusted tone" designer relation.
 *   (e) toneRelaxedDistance — (c) with the lightness axis down-weighted; a one-parameter family
 *                             whose endpoints are exactly (c) (wL=1) and "any tone of this
 *                             hue+chroma" (wL=0).
 *
 * Usage (from the repository root):
 *
 *     NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *       research/v3/src/contract/belongs-study.ts
 *     NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *       research/v3/src/contract/belongs-study.ts --write
 *
 * Deterministic end to end: fixtures are read in file order, the mode grids are fixed, and the
 * bootstrap is seeded. Two runs on an unchanged repository produce identical output.
 *
 * Honesty constraints this script is built to satisfy, from
 * `reviews/toolbox-review/gap-scan.md` §5 ("ten distinct classes" of re-implementation error):
 *
 *   - **No post-hoc thresholds.** Every free parameter is declared as a *grid* below, before any
 *     data is read, and every cell of every grid is reported. Nothing selects a cell by its score.
 *   - **`n` is declared as units, not trials.** Colours are nested in palettes nested in artworks.
 *     Every count is reported at all three levels and every interval is a *cluster* bootstrap over
 *     artworks, because colour instances within an artwork are not independent.
 *   - **The negative label is declared as weaker than it looks.** See NEGATIVE_LABEL_CAVEAT.
 *   - **Empty input throws** rather than returning a comfortable default.
 */
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

import sharp from "sharp"

import { colorFromHex, okLabFromColor, okLabToRgb, rgbToHex } from "./color.ts"
import type { OkLab } from "./types.ts"
import {
	REGION_CHROMA_BOUNDARY,
	REGION_LIGHTNESS_BOUNDARY,
	SAME_COLOR_BAR_BY_REGION,
	SOURCE_POPULATION_FLOOR,
} from "./constants.ts"

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url))

const LEGACY_DIR = new URL("../../data/legacy/", import.meta.url)

export const STUDY_OUTPUT_PATH = fileURLToPath(new URL("../../data/contract/belongs-study.json", import.meta.url))

/**
 * Seed for the cluster bootstrap.
 *
 * `[UNCALIBRATED]` — an arbitrary fixed integer, chosen as the date this study was written so the
 * run is reproducible. Nothing depends on its value; the bootstrap is a variance estimate, and
 * BOOTSTRAP_RESAMPLES is large enough that the seed moves the reported interval in the third
 * decimal at most.
 */
const BOOTSTRAP_SEED = 20260804

/**
 * Bootstrap resamples for every reported interval.
 *
 * `[UNCALIBRATED]` — 2000 is the conventional floor for a percentile interval and is cheap here.
 * Not tuned against any result.
 */
const BOOTSTRAP_RESAMPLES = 2000

/**
 * Radii for the mode-finding grid, in OKLab distance units.
 *
 * `[UNCALIBRATED]` — declared before any measurement and reported in full; no cell is selected by
 * its score. The span is anchored at both ends by things that are calibrated: 0.03 is just above
 * the loosest same-colour bar (light-saturated, 0.02293), so the tightest grid cell still cannot
 * call two colours one mode when the reviewer would call them different; 0.10 is roughly four
 * times the loosest bar, the scale at which two colours are plainly different colours. 0.05 is the
 * midpoint and is reported as primary purely because it is the midpoint.
 */
const MODE_RADII = [0.03, 0.05, 0.1] as const

/**
 * Mass floors for what counts as a *substantial* mode, as a fraction of the artwork.
 *
 * `[UNCALIBRATED]` — declared before measurement, all cells reported. 0.01 is primary because it
 * is the midpoint, not because it scored well.
 */
const MODE_MASS_FLOORS = [0.005, 0.01, 0.02] as const

const PRIMARY_RADIUS = 0.05
const PRIMARY_MASS_FLOOR = 0.01

/**
 * Lightness weights for the tone-relaxed distance family (feature e).
 *
 * `[UNCALIBRATED]` — a declared family, not a fitted parameter. wL=1 is exactly feature (c) and
 * wL=0 is "any tone of this hue and chroma"; the interior values are reported so the reader can
 * see whether the separation is monotone in tone freedom rather than being handed one number.
 */
const TONE_LIGHTNESS_WEIGHTS = [0, 0.25, 0.5, 1] as const

/**
 * Pre-binning lattice edge for mode finding, in OKLab units.
 *
 * `[MEASURED]` — chosen strictly below the tightest calibrated same-colour bar (dark-neutral,
 * 0.00932, `SAME_COLOR_BAR_BY_REGION`) so that pre-binning can never merge two colours the
 * reviewer's own ruler would call different. It exists only to make leader clustering over ~10^5
 * distinct JPEG triples tractable; it is not a perceptual claim.
 */
const MODE_LATTICE_EDGE = 0.005

/**
 * The caveat that governs every separation number in this study.
 *
 * `known-bad.json` records that the reviewer graded a *palette* `weak-fallback` or `unacceptable`.
 * It does not record *which colour* was wrong. Treating all four role colours of a bad palette as
 * "does not belong" is a label transfer from palette to colour that is certainly wrong for some of
 * them — a palette can be rejected for one bad accent while its background is beyond reproach.
 * The transfer is diluting, not biasing: it mixes genuinely-belonging colours into the negative
 * class, which pushes every measured separation *down* toward 0.5. So a feature that separates
 * despite this is real, and a feature that does not separate has not been shown to be useless.
 * No number in this study may be read as an upper bound on a feature's true discriminating power.
 */
const NEGATIVE_LABEL_CAVEAT =
	"known-bad.json grades palettes, not colours. All role colours of a rejected palette are " +
	"labelled 'does not belong', which is wrong for an unknown share of them. This dilutes the " +
	"negative class toward the positive one, so every separation reported here is a LOWER bound " +
	"on the feature's true power, and a null result is not evidence of no effect."

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

type LegacyColor = Readonly<{ hex: string; rgb: [number, number, number]; name: string }>

type LegacyEntry = Readonly<{
	entryId: string
	kind?: string
	artwork: Readonly<{
		imagePath: string
		contentSha256: string
		rendition: Readonly<{ format: string; width: number; height: number }>
		imageId: string
	}>
	palette: Readonly<{ completeness: string; roles: Readonly<Record<string, LegacyColor | null>> }>
	standingGrade?: string
	roleSignature: string
}>

type LegacyFixture = Readonly<{ meta: Record<string, unknown>; entries: readonly LegacyEntry[] }>

const FIXTURES = ["endorsements", "known-bad", "acceptable"] as const
type FixtureName = (typeof FIXTURES)[number]

async function readFixture(name: FixtureName): Promise<LegacyFixture> {
	const raw = await readFile(new URL(`${name}.json`, LEGACY_DIR), "utf8")
	const parsed = JSON.parse(raw) as LegacyFixture
	if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
		throw new Error(`${name}.json has no entries — refusing to report over empty input`)
	}
	return parsed
}

// ---------------------------------------------------------------------------------------------
// Artwork pixels
// ---------------------------------------------------------------------------------------------

/** Region index into the bar table. Mirrors `colorRegion`, on a bare OKLab triple. */
const REGION_ORDER = ["dark-neutral", "dark-saturated", "light-neutral", "light-saturated"] as const
const BAR_BY_REGION_INDEX = REGION_ORDER.map((region) => SAME_COLOR_BAR_BY_REGION[region])
const WIDEST_BAR = Math.max(...BAR_BY_REGION_INDEX)

function regionIndexOfLab(lightness: number, a: number, b: number): number {
	const dark = lightness < REGION_LIGHTNESS_BOUNDARY
	const neutral = Math.hypot(a, b) < REGION_CHROMA_BOUNDARY
	return (dark ? 0 : 2) + (neutral ? 0 : 1)
}

type ArtworkColors = Readonly<{
	/** Total pixels. The denominator for every population fraction. */
	total: number
	/** Distinct 8-bit triples, packed. */
	count: number
	labs: Float64Array
	/** Pixel count per distinct triple. */
	masses: Float64Array
	regionIndex: Uint8Array
	/** Packed rgb key per distinct triple, for exact lookup. */
	keys: Int32Array
	byKey: Map<number, number>
}>

const artworkCache = new Map<string, ArtworkColors>()

export async function readArtworkColors(imagePath: string, sha: string): Promise<ArtworkColors> {
	const cached = artworkCache.get(sha)
	if (cached !== undefined) return cached

	const bytes = await readFile(`${REPO_ROOT}${imagePath}`)
	const { data, info } = await sharp(bytes)
		.removeAlpha()
		.toColourspace("srgb")
		.raw()
		.toBuffer({ resolveWithObject: true })
	if (info.channels !== 3) throw new Error(`${imagePath} decoded to ${info.channels} channels, expected 3`)

	const total = info.width * info.height
	if (total === 0) throw new Error(`${imagePath} decoded to zero pixels`)

	const histogram = new Map<number, number>()
	for (let index = 0; index < data.length; index += 3) {
		const key = (data[index] << 16) | (data[index + 1] << 8) | data[index + 2]
		histogram.set(key, (histogram.get(key) ?? 0) + 1)
	}

	const count = histogram.size
	const labs = new Float64Array(count * 3)
	const masses = new Float64Array(count)
	const regionIndex = new Uint8Array(count)
	const keys = new Int32Array(count)
	const byKey = new Map<number, number>()

	let cursor = 0
	for (const [key, mass] of histogram) {
		const lab = okLabFromColor(colorFromHex(hexOfKey(key)))
		labs[cursor * 3] = lab[0]
		labs[cursor * 3 + 1] = lab[1]
		labs[cursor * 3 + 2] = lab[2]
		masses[cursor] = mass
		regionIndex[cursor] = regionIndexOfLab(lab[0], lab[1], lab[2])
		keys[cursor] = key
		byKey.set(key, cursor)
		cursor += 1
	}

	const colors: ArtworkColors = { total, count, labs, masses, regionIndex, keys, byKey }
	artworkCache.set(sha, colors)
	return colors
}

function hexOfKey(key: number): string {
	return `#${key.toString(16).padStart(6, "0")}`
}

function keyOfHex(hex: string): number {
	return Number.parseInt(hex.slice(1), 16)
}

// ---------------------------------------------------------------------------------------------
// Features (a) and (b)
// ---------------------------------------------------------------------------------------------

/** (a) Exact-triple population share — the rule shipping in `validateSourceSupport` today. */
function exactShare(colors: ArtworkColors, key: number): number {
	const index = colors.byKey.get(key)
	if (index === undefined) return 0
	return colors.masses[index] / colors.total
}

/**
 * (b) Population within the regional same-colour bar — the B1 fix.
 *
 * The bar for a pair is `Math.max` of the two colours' regional bars (`sameColorBar`), so this
 * sums every artwork triple the reviewer's own calibrated ruler would call the same colour as the
 * published one. Implemented over the packed arrays rather than by constructing a `PaletteColor`
 * per distinct triple, but it is the same arithmetic and the same constants.
 */
function neighbourhoodShare(colors: ArtworkColors, lab: readonly number[], regionOfPublished: number): number {
	const barPublished = BAR_BY_REGION_INDEX[regionOfPublished]
	const [lightness, a, b] = lab
	let inside = 0
	for (let index = 0; index < colors.count; index += 1) {
		const dl = colors.labs[index * 3] - lightness
		// Cheap reject on the widest possible bar before the two multiplies.
		if (dl > WIDEST_BAR || dl < -WIDEST_BAR) continue
		const da = colors.labs[index * 3 + 1] - a
		const db = colors.labs[index * 3 + 2] - b
		const bar = Math.max(barPublished, BAR_BY_REGION_INDEX[colors.regionIndex[index]])
		if (dl * dl + da * da + db * db < bar * bar) inside += colors.masses[index]
	}
	return inside / colors.total
}

// ---------------------------------------------------------------------------------------------
// Colour modes
// ---------------------------------------------------------------------------------------------

export type ColorMode = Readonly<{ lab: readonly [number, number, number]; mass: number }>

/**
 * Mass-ordered leader clustering in OKLab, at radius `radius`.
 *
 * Deliberately not k-means: k-means needs a `k` nobody can justify per artwork, and its centroids
 * drift into the empty space between two real modes. Leader clustering makes one honest claim —
 * "the heaviest unclaimed colour is a mode, everything within `radius` of it is part of it" — and
 * has no free parameter beyond the radius, which is reported across a grid.
 *
 * Colours are pre-binned onto a `MODE_LATTICE_EDGE` lattice first, purely for tractability; the
 * edge is below the tightest calibrated same-colour bar, so the pre-binning cannot merge colours
 * the reviewer's ruler separates. Mode centroids are the mass-weighted means of their members.
 */
export function findModes(colors: ArtworkColors, radius: number): ColorMode[] {
	// Pre-bin.
	const bins = new Map<string, { l: number; a: number; b: number; mass: number }>()
	for (let index = 0; index < colors.count; index += 1) {
		const l = colors.labs[index * 3]
		const a = colors.labs[index * 3 + 1]
		const b = colors.labs[index * 3 + 2]
		const mass = colors.masses[index]
		const binKey = `${Math.floor(l / MODE_LATTICE_EDGE)},${Math.floor(a / MODE_LATTICE_EDGE)},${Math.floor(b / MODE_LATTICE_EDGE)}`
		const existing = bins.get(binKey)
		if (existing === undefined) bins.set(binKey, { l: l * mass, a: a * mass, b: b * mass, mass })
		else {
			existing.l += l * mass
			existing.a += a * mass
			existing.b += b * mass
			existing.mass += mass
		}
	}

	const binned = [...bins.values()]
		.map((bin) => ({ l: bin.l / bin.mass, a: bin.a / bin.mass, b: bin.b / bin.mass, mass: bin.mass }))
		.sort((first, second) => second.mass - first.mass)

	// Leader clustering with a hash grid over seed positions so the nearest-mode probe is local.
	const seedL: number[] = []
	const seedA: number[] = []
	const seedB: number[] = []
	const sumL: number[] = []
	const sumA: number[] = []
	const sumB: number[] = []
	const sumMass: number[] = []
	const grid = new Map<string, number[]>()
	const cellOf = (l: number, a: number, b: number) =>
		`${Math.floor(l / radius)},${Math.floor(a / radius)},${Math.floor(b / radius)}`

	for (const bin of binned) {
		let best = -1
		let bestDistance = radius
		const cl = Math.floor(bin.l / radius)
		const ca = Math.floor(bin.a / radius)
		const cb = Math.floor(bin.b / radius)
		for (let dl = -1; dl <= 1; dl += 1) {
			for (let da = -1; da <= 1; da += 1) {
				for (let db = -1; db <= 1; db += 1) {
					const candidates = grid.get(`${cl + dl},${ca + da},${cb + db}`)
					if (candidates === undefined) continue
					for (const candidate of candidates) {
						const distance = Math.hypot(
							seedL[candidate] - bin.l,
							seedA[candidate] - bin.a,
							seedB[candidate] - bin.b,
						)
						if (distance < bestDistance) {
							bestDistance = distance
							best = candidate
						}
					}
				}
			}
		}
		if (best >= 0) {
			sumL[best] += bin.l * bin.mass
			sumA[best] += bin.a * bin.mass
			sumB[best] += bin.b * bin.mass
			sumMass[best] += bin.mass
			continue
		}
		const created = seedL.length
		seedL.push(bin.l)
		seedA.push(bin.a)
		seedB.push(bin.b)
		sumL.push(bin.l * bin.mass)
		sumA.push(bin.a * bin.mass)
		sumB.push(bin.b * bin.mass)
		sumMass.push(bin.mass)
		const cell = cellOf(bin.l, bin.a, bin.b)
		const bucket = grid.get(cell)
		if (bucket === undefined) grid.set(cell, [created])
		else bucket.push(created)
	}

	const modes: ColorMode[] = []
	for (let index = 0; index < seedL.length; index += 1) {
		const mass = sumMass[index]
		modes.push({
			lab: [sumL[index] / mass, sumA[index] / mass, sumB[index] / mass],
			mass: mass / colors.total,
		})
	}
	modes.sort((first, second) => second.mass - first.mass)
	return modes
}

function chromaOf(lab: readonly number[]): number {
	return Math.hypot(lab[1], lab[2])
}

function hueDegreesOf(lab: readonly number[]): number {
	return (Math.atan2(lab[2], lab[1]) * 180) / Math.PI
}

function hueSeparation(first: number, second: number): number {
	const raw = Math.abs(first - second) % 360
	return raw > 180 ? 360 - raw : raw
}

/** (c) OKLab distance to the nearest mode with mass at or above the floor. */
function modeDistance(modes: readonly ColorMode[], lab: readonly number[], massFloor: number): number | null {
	let best: number | null = null
	for (const mode of modes) {
		if (mode.mass < massFloor) continue
		const distance = Math.hypot(mode.lab[0] - lab[0], mode.lab[1] - lab[1], mode.lab[2] - lab[2])
		if (best === null || distance < best) best = distance
	}
	return best
}

/**
 * (d) Hue-angle distance to the nearest substantial mode, lightness and chroma free.
 *
 * `null` when the published colour or every substantial mode is achromatic by the contract's own
 * `REGION_CHROMA_BOUNDARY` — hue angle is not meaningful near the neutral axis, and inventing a
 * number there would be the loudest kind of dishonesty in a study about colour relations. The
 * share of colours for which this feature is undefined is reported as a result.
 */
function hueDistance(modes: readonly ColorMode[], lab: readonly number[], massFloor: number): number | null {
	if (chromaOf(lab) < REGION_CHROMA_BOUNDARY) return null
	const hue = hueDegreesOf(lab)
	let best: number | null = null
	for (const mode of modes) {
		if (mode.mass < massFloor) continue
		if (chromaOf(mode.lab) < REGION_CHROMA_BOUNDARY) continue
		const separation = hueSeparation(hue, hueDegreesOf(mode.lab))
		if (best === null || separation < best) best = separation
	}
	return best
}

/** (e) Tone-relaxed distance: (c) with the lightness axis scaled by `lightnessWeight`. */
function toneRelaxedDistance(
	modes: readonly ColorMode[],
	lab: readonly number[],
	massFloor: number,
	lightnessWeight: number,
): number | null {
	let best: number | null = null
	for (const mode of modes) {
		if (mode.mass < massFloor) continue
		const dl = (mode.lab[0] - lab[0]) * lightnessWeight
		const distance = Math.hypot(dl, mode.lab[1] - lab[1], mode.lab[2] - lab[2])
		if (best === null || distance < best) best = distance
	}
	return best
}

// ---------------------------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------------------------

export type ColorRow = {
	set: FixtureName
	entryId: string
	imagePath: string
	sha: string
	imageId: string
	roles: string[]
	hex: string
	name: string
	region: string
	exactShare: number
	exactPasses: boolean
	neighbourhoodShare: number
	neighbourhoodPasses: boolean
	modeDistance: Record<string, number | null>
	hueDistance: Record<string, number | null>
	toneRelaxed: Record<string, number | null>
	substantialModes: Record<string, number>
	nearestModeHex: string | null
	nearestModeMass: number | null
}

function cellKey(radius: number, massFloor: number): string {
	return `r${radius}/m${massFloor}`
}

async function measureFixture(name: FixtureName): Promise<{ rows: ColorRow[]; entries: readonly LegacyEntry[] }> {
	const fixture = await readFixture(name)
	const rows = new Map<string, ColorRow>()

	for (const entry of fixture.entries) {
		const colors = await readArtworkColors(entry.artwork.imagePath, entry.artwork.contentSha256)
		const modesByRadius = new Map<number, ColorMode[]>()
		for (const radius of MODE_RADII) modesByRadius.set(radius, findModes(colors, radius))

		for (const [role, color] of Object.entries(entry.palette.roles)) {
			// A missing role is not a constraint (data/legacy/README.md A6).
			if (color === null || color === undefined) continue

			// The unit of analysis is (artwork, hex): the features are a pure function of that pair,
			// so counting the same colour twice on the same artwork would be pseudo-replication.
			const unitKey = `${entry.artwork.contentSha256}|${color.hex}`
			const existing = rows.get(unitKey)
			if (existing !== undefined) {
				if (!existing.roles.includes(role)) existing.roles.push(role)
				continue
			}

			const lab = okLabFromColor(colorFromHex(color.hex))
			const region = REGION_ORDER[regionIndexOfLab(lab[0], lab[1], lab[2])]
			const key = keyOfHex(color.hex)

			const modeDistances: Record<string, number | null> = {}
			const hueDistances: Record<string, number | null> = {}
			const substantial: Record<string, number> = {}
			for (const radius of MODE_RADII) {
				const modes = modesByRadius.get(radius) as ColorMode[]
				for (const massFloor of MODE_MASS_FLOORS) {
					const cell = cellKey(radius, massFloor)
					modeDistances[cell] = modeDistance(modes, lab, massFloor)
					hueDistances[cell] = hueDistance(modes, lab, massFloor)
					substantial[cell] = modes.filter((mode) => mode.mass >= massFloor).length
				}
			}

			const primaryModes = modesByRadius.get(PRIMARY_RADIUS) as ColorMode[]
			const toneRelaxed: Record<string, number | null> = {}
			for (const weight of TONE_LIGHTNESS_WEIGHTS) {
				toneRelaxed[`wL${weight}`] = toneRelaxedDistance(primaryModes, lab, PRIMARY_MASS_FLOOR, weight)
			}

			let nearest: ColorMode | null = null
			let nearestDistance = Number.POSITIVE_INFINITY
			for (const mode of primaryModes) {
				if (mode.mass < PRIMARY_MASS_FLOOR) continue
				const distance = Math.hypot(mode.lab[0] - lab[0], mode.lab[1] - lab[1], mode.lab[2] - lab[2])
				if (distance < nearestDistance) {
					nearestDistance = distance
					nearest = mode
				}
			}

			const share = exactShare(colors, key)
			const neighbourhood = neighbourhoodShare(colors, lab, regionIndexOfLab(lab[0], lab[1], lab[2]))

			rows.set(unitKey, {
				set: name,
				entryId: entry.entryId,
				imagePath: entry.artwork.imagePath,
				sha: entry.artwork.contentSha256,
				imageId: entry.artwork.imageId,
				roles: [role],
				hex: color.hex,
				name: color.name,
				region,
				exactShare: share,
				exactPasses: share >= SOURCE_POPULATION_FLOOR,
				neighbourhoodShare: neighbourhood,
				neighbourhoodPasses: neighbourhood >= SOURCE_POPULATION_FLOOR,
				modeDistance: modeDistances,
				hueDistance: hueDistances,
				toneRelaxed,
				substantialModes: substantial,
				nearestModeHex: nearest === null ? null : labToHexApprox(nearest.lab),
				nearestModeMass: nearest === null ? null : nearest.mass,
			})
		}
	}

	return { rows: [...rows.values()], entries: fixture.entries }
}

/**
 * Hex spelling of a mode centroid, through the contract's own OKLab inverse.
 *
 * Presentation only — a mode centroid is a mass-weighted mean and is generally *not* a pixel of
 * the artwork. It is never used as a published colour, only to describe one on screen and in this
 * report.
 */
function labToHexApprox(lab: readonly [number, number, number]): string {
	return rgbToHex(okLabToRgb(lab as OkLab))
}

// ---------------------------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------------------------

/** Mulberry32 — a small seeded PRNG so the bootstrap is reproducible. */
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

/**
 * Mann-Whitney AUC: the probability that a randomly drawn positive scores above a randomly drawn
 * negative, ties counted as half. 0.5 is no separation.
 */
export function areaUnderCurve(positives: readonly number[], negatives: readonly number[]): number | null {
	if (positives.length === 0 || negatives.length === 0) return null
	let wins = 0
	for (const positive of positives) {
		for (const negative of negatives) {
			if (positive > negative) wins += 1
			else if (positive === negative) wins += 0.5
		}
	}
	return wins / (positives.length * negatives.length)
}

type Clustered = Readonly<{ cluster: string; value: number }>

/**
 * Cluster bootstrap over artworks.
 *
 * Colour instances within one artwork share pixels, share a palette, and are not independent
 * draws; resampling *colours* would report an interval several times too narrow. This resamples
 * *artworks* with replacement, within each class, and takes all of a resampled artwork's colours.
 */
function bootstrapAuc(
	positives: readonly Clustered[],
	negatives: readonly Clustered[],
	random: () => number,
): { point: number | null; low: number | null; high: number | null; positiveClusters: number; negativeClusters: number } {
	const groupOf = (rows: readonly Clustered[]) => {
		const grouped = new Map<string, number[]>()
		for (const row of rows) {
			const bucket = grouped.get(row.cluster)
			if (bucket === undefined) grouped.set(row.cluster, [row.value])
			else bucket.push(row.value)
		}
		return [...grouped.values()]
	}
	const positiveGroups = groupOf(positives)
	const negativeGroups = groupOf(negatives)
	const point = areaUnderCurve(
		positives.map((row) => row.value),
		negatives.map((row) => row.value),
	)
	if (point === null || positiveGroups.length === 0 || negativeGroups.length === 0) {
		return { point, low: null, high: null, positiveClusters: positiveGroups.length, negativeClusters: negativeGroups.length }
	}

	const draws: number[] = []
	for (let replicate = 0; replicate < BOOTSTRAP_RESAMPLES; replicate += 1) {
		const positiveSample: number[] = []
		for (let index = 0; index < positiveGroups.length; index += 1) {
			positiveSample.push(...positiveGroups[Math.floor(random() * positiveGroups.length)])
		}
		const negativeSample: number[] = []
		for (let index = 0; index < negativeGroups.length; index += 1) {
			negativeSample.push(...negativeGroups[Math.floor(random() * negativeGroups.length)])
		}
		const auc = areaUnderCurve(positiveSample, negativeSample)
		if (auc !== null) draws.push(auc)
	}
	draws.sort((first, second) => first - second)
	return {
		point,
		low: draws[Math.floor(0.025 * draws.length)] ?? null,
		high: draws[Math.floor(0.975 * draws.length)] ?? null,
		positiveClusters: positiveGroups.length,
		negativeClusters: negativeGroups.length,
	}
}

function quantiles(values: readonly number[]): Record<string, number | null> {
	if (values.length === 0) return { p05: null, p25: null, median: null, p75: null, p95: null }
	const sorted = [...values].sort((first, second) => first - second)
	const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]
	return { p05: at(0.05), p25: at(0.25), median: at(0.5), p75: at(0.75), p95: at(0.95) }
}

export { NEGATIVE_LABEL_CAVEAT, MODE_RADII, MODE_MASS_FLOORS, PRIMARY_RADIUS, PRIMARY_MASS_FLOOR }

/**
 * Everything the `dropped-colors-1` round shows the reviewer about one colour on one artwork,
 * measured from the pixels at the primary mode cell.
 *
 * Exported so the round builder re-derives every displayed number from the artwork itself rather
 * than trusting `belongs-study.json`. The data file chooses *which* colours to ask about; this
 * function is what puts numbers on screen, and it is the same code that produced the study. If a
 * colour stops failing, the builder sees it here and refuses to build.
 */
export async function measureBelonging(
	imagePath: string,
	sha: string,
	hex: string,
): Promise<{
	exactShare: number
	neighbourhoodShare: number
	neighbourhoodPasses: boolean
	modeDistance: number | null
	nearestModeHex: string | null
	nearestModeMass: number | null
	substantialModes: number
}> {
	const colors = await readArtworkColors(imagePath, sha)
	const lab = okLabFromColor(colorFromHex(hex))
	const modes = findModes(colors, PRIMARY_RADIUS)
	const substantial = modes.filter((mode) => mode.mass >= PRIMARY_MASS_FLOOR)

	let nearest: ColorMode | null = null
	let nearestDistance = Number.POSITIVE_INFINITY
	for (const mode of substantial) {
		const distance = Math.hypot(mode.lab[0] - lab[0], mode.lab[1] - lab[1], mode.lab[2] - lab[2])
		if (distance < nearestDistance) {
			nearestDistance = distance
			nearest = mode
		}
	}

	const share = neighbourhoodShare(colors, lab, regionIndexOfLab(lab[0], lab[1], lab[2]))
	return {
		exactShare: exactShare(colors, keyOfHex(hex)),
		neighbourhoodShare: share,
		neighbourhoodPasses: share >= SOURCE_POPULATION_FLOOR,
		modeDistance: nearest === null ? null : nearestDistance,
		nearestModeHex: nearest === null ? null : labToHexApprox(nearest.lab),
		nearestModeMass: nearest === null ? null : nearest.mass,
		substantialModes: substantial.length,
	}
}

// ---------------------------------------------------------------------------------------------
// Feature table
// ---------------------------------------------------------------------------------------------

/**
 * Every feature, oriented so that **higher always means "belongs more"**.
 *
 * Distances are negated at read time rather than at measurement time, so the stored data file
 * keeps the natural sign and only the separation table flips it.
 */
type FeatureSpec = Readonly<{
	id: string
	label: string
	kind: "population" | "distance" | "angle"
	read: (row: ColorRow) => number | null
}>

function buildFeatureSpecs(): FeatureSpec[] {
	const specs: FeatureSpec[] = [
		{ id: "a.exactShare", label: "exact-triple population share", kind: "population", read: (row) => row.exactShare },
		{
			id: "b.neighbourhoodShare",
			label: "population within the same-colour bar",
			kind: "population",
			read: (row) => row.neighbourhoodShare,
		},
	]
	for (const radius of MODE_RADII) {
		for (const massFloor of MODE_MASS_FLOORS) {
			const cell = cellKey(radius, massFloor)
			specs.push({
				id: `c.modeDistance[${cell}]`,
				label: `OKLab distance to nearest mode (${cell})`,
				kind: "distance",
				read: (row) => row.modeDistance[cell],
			})
			specs.push({
				id: `d.hueDistance[${cell}]`,
				label: `hue distance to nearest mode (${cell})`,
				kind: "angle",
				read: (row) => row.hueDistance[cell],
			})
		}
	}
	for (const weight of TONE_LIGHTNESS_WEIGHTS) {
		specs.push({
			id: `e.toneRelaxed[wL${weight}]`,
			label: `tone-relaxed mode distance, lightness weight ${weight}`,
			kind: "distance",
			read: (row) => row.toneRelaxed[`wL${weight}`],
		})
	}
	return specs
}

type SeparationRow = Readonly<{
	feature: string
	label: string
	kind: string
	endorsed: Record<string, number | null>
	knownBad: Record<string, number | null>
	acceptable: Record<string, number | null>
	definedEndorsed: number
	definedKnownBad: number
	undefinedShareEndorsed: number
	undefinedShareKnownBad: number
	auc: number | null
	aucLow: number | null
	aucHigh: number | null
	positiveClusters: number
	negativeClusters: number
	separates: boolean
}>

function separationFor(spec: FeatureSpec, byySet: Map<FixtureName, ColorRow[]>, random: () => number): SeparationRow {
	const endorsed = byySet.get("endorsements") as ColorRow[]
	const knownBad = byySet.get("known-bad") as ColorRow[]
	const acceptable = byySet.get("acceptable") as ColorRow[]

	const collect = (rows: readonly ColorRow[]): Clustered[] => {
		const out: Clustered[] = []
		for (const row of rows) {
			const value = spec.read(row)
			if (value === null || value === undefined || !Number.isFinite(value)) continue
			out.push({ cluster: row.sha, value: spec.kind === "population" ? value : -value })
		}
		return out
	}

	const positives = collect(endorsed)
	const negatives = collect(knownBad)
	const bootstrap = bootstrapAuc(positives, negatives, random)

	// Quantiles are reported in the feature's NATURAL sign, not the oriented one.
	const natural = (rows: readonly ColorRow[]) =>
		rows.map((row) => spec.read(row)).filter((value): value is number => value !== null && Number.isFinite(value))

	// "Separates" is a deliberately conservative reading: the 95% cluster-bootstrap interval must
	// exclude 0.5 entirely. With this many artworks that is a demanding bar, and it is meant to be.
	const separates =
		bootstrap.low !== null && bootstrap.high !== null && (bootstrap.low > 0.5 || bootstrap.high < 0.5)

	return {
		feature: spec.id,
		label: spec.label,
		kind: spec.kind,
		endorsed: quantiles(natural(endorsed)),
		knownBad: quantiles(natural(knownBad)),
		acceptable: quantiles(natural(acceptable)),
		definedEndorsed: positives.length,
		definedKnownBad: negatives.length,
		undefinedShareEndorsed: endorsed.length === 0 ? 0 : 1 - positives.length / endorsed.length,
		undefinedShareKnownBad: knownBad.length === 0 ? 0 : 1 - negatives.length / knownBad.length,
		auc: bootstrap.point,
		aucLow: bootstrap.low,
		aucHigh: bootstrap.high,
		positiveClusters: bootstrap.positiveClusters,
		negativeClusters: bootstrap.negativeClusters,
		separates,
	}
}

// ---------------------------------------------------------------------------------------------
// Palette-level residual under the B1 fix
// ---------------------------------------------------------------------------------------------

type PaletteResidual = Readonly<{
	set: FixtureName
	palettes: number
	refusedExact: number
	refusedNeighbourhood: number
	colourUnits: number
	colourPassExact: number
	colourPassNeighbourhood: number
	roleInstances: number
	roleInstancesPassExact: number
	roleInstancesPassNeighbourhood: number
}>

function paletteResidual(
	name: FixtureName,
	entries: readonly LegacyEntry[],
	rows: readonly ColorRow[],
): PaletteResidual {
	const byUnit = new Map(rows.map((row) => [`${row.sha}|${row.hex}`, row]))
	let refusedExact = 0
	let refusedNeighbourhood = 0
	for (const entry of entries) {
		let failsExact = false
		let failsNeighbourhood = false
		for (const color of Object.values(entry.palette.roles)) {
			if (color === null || color === undefined) continue
			const row = byUnit.get(`${entry.artwork.contentSha256}|${color.hex}`)
			if (row === undefined) continue
			if (!row.exactPasses) failsExact = true
			if (!row.neighbourhoodPasses) failsNeighbourhood = true
		}
		if (failsExact) refusedExact += 1
		if (failsNeighbourhood) refusedNeighbourhood += 1
	}
	// Role instances, so these counts can be reconciled against bias-audit.md B1, which counted
	// role colours (1,397 for endorsements) rather than distinct (artwork, colour) units.
	let roleInstances = 0
	let roleInstancesPassExact = 0
	let roleInstancesPassNeighbourhood = 0
	for (const entry of entries) {
		for (const color of Object.values(entry.palette.roles)) {
			if (color === null || color === undefined) continue
			const row = byUnit.get(`${entry.artwork.contentSha256}|${color.hex}`)
			if (row === undefined) continue
			roleInstances += 1
			if (row.exactPasses) roleInstancesPassExact += 1
			if (row.neighbourhoodPasses) roleInstancesPassNeighbourhood += 1
		}
	}

	return {
		set: name,
		palettes: entries.length,
		refusedExact,
		refusedNeighbourhood,
		colourUnits: rows.length,
		colourPassExact: rows.filter((row) => row.exactPasses).length,
		colourPassNeighbourhood: rows.filter((row) => row.neighbourhoodPasses).length,
		roleInstances,
		roleInstancesPassExact,
		roleInstancesPassNeighbourhood,
	}
}

/**
 * The question the recommendation actually turns on: **does the rule fire more often on bad
 * palettes than on endorsed ones?**
 *
 * A gate that refuses endorsed and known-bad colours at the same rate is not a quality filter,
 * whatever else it is. Reported as a difference in failure rates with a cluster bootstrap over
 * artworks, because a rate over non-independent colours has no honest standard error.
 */
function ruleContingency(
	endorsed: readonly ColorRow[],
	knownBad: readonly ColorRow[],
	pick: (row: ColorRow) => boolean,
	random: () => number,
): Record<string, number | null> {
	const rateOf = (rows: readonly ColorRow[]) => (rows.length === 0 ? null : rows.filter(pick).length / rows.length)
	const groupOf = (rows: readonly ColorRow[]) => {
		const grouped = new Map<string, ColorRow[]>()
		for (const row of rows) {
			const bucket = grouped.get(row.sha)
			if (bucket === undefined) grouped.set(row.sha, [row])
			else bucket.push(row)
		}
		return [...grouped.values()]
	}

	const endorsedGroups = groupOf(endorsed)
	const badGroups = groupOf(knownBad)
	const endorsedRate = rateOf(endorsed)
	const badRate = rateOf(knownBad)
	if (endorsedRate === null || badRate === null) {
		return { endorsedFailureRate: endorsedRate, knownBadFailureRate: badRate, difference: null, low: null, high: null }
	}

	const draws: number[] = []
	for (let replicate = 0; replicate < BOOTSTRAP_RESAMPLES; replicate += 1) {
		const sampleRate = (groups: ColorRow[][]) => {
			let failures = 0
			let total = 0
			for (let index = 0; index < groups.length; index += 1) {
				for (const row of groups[Math.floor(random() * groups.length)]) {
					total += 1
					if (pick(row)) failures += 1
				}
			}
			return total === 0 ? null : failures / total
		}
		const first = sampleRate(endorsedGroups)
		const second = sampleRate(badGroups)
		if (first !== null && second !== null) draws.push(first - second)
	}
	draws.sort((first, second) => first - second)
	return {
		endorsedFailureRate: endorsedRate,
		knownBadFailureRate: badRate,
		difference: endorsedRate - badRate,
		low: draws[Math.floor(0.025 * draws.length)] ?? null,
		high: draws[Math.floor(0.975 * draws.length)] ?? null,
	}
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

async function main(): Promise<void> {
	const { values } = parseArgs({ options: { write: { type: "boolean", default: false } }, strict: true })
	const generatedAt = new Date().toISOString()

	const bySet = new Map<FixtureName, ColorRow[]>()
	const entriesBySet = new Map<FixtureName, readonly LegacyEntry[]>()
	for (const name of FIXTURES) {
		process.stderr.write(`measuring ${name}…\n`)
		const { rows, entries } = await measureFixture(name)
		bySet.set(name, rows)
		entriesBySet.set(name, entries)
		process.stderr.write(`  ${rows.length} distinct (artwork, colour) units over ${entries.length} palettes\n`)
	}

	const random = makeRandom(BOOTSTRAP_SEED)
	const specs = buildFeatureSpecs()
	const separation = specs.map((spec) => separationFor(spec, bySet, random))

	const residuals = FIXTURES.map((name) =>
		paletteResidual(name, entriesBySet.get(name) as readonly LegacyEntry[], bySet.get(name) as ColorRow[]),
	)

	// The deliverable-2 pool: endorsed colours that STILL fail under the B1 neighbourhood fix.
	const failures = (bySet.get("endorsements") as ColorRow[])
		.filter((row) => !row.neighbourhoodPasses)
		.sort((first, second) => first.neighbourhoodShare - second.neighbourhoodShare)

	const contingency = {
		exactTripleRule: ruleContingency(
			bySet.get("endorsements") as ColorRow[],
			bySet.get("known-bad") as ColorRow[],
			(row) => !row.exactPasses,
			random,
		),
		neighbourhoodRule: ruleContingency(
			bySet.get("endorsements") as ColorRow[],
			bySet.get("known-bad") as ColorRow[],
			(row) => !row.neighbourhoodPasses,
			random,
		),
	}

	const report = {
		meta: {
			generatedAt,
			generatedBy: "research/v3/src/contract/belongs-study.ts",
			question:
				"Which candidate 'belongs' feature separates reviewer-endorsed colours from known-bad colours?",
			builtFrom: [
				"research/v3/data/legacy/endorsements.json",
				"research/v3/data/legacy/known-bad.json",
				"research/v3/data/legacy/acceptable.json",
			],
			unitOfAnalysis:
				"one distinct (artwork contentSha256, published hex) pair; a colour published in two roles " +
				"on one artwork is ONE unit, because the features are a pure function of that pair",
			negativeLabelCaveat: NEGATIVE_LABEL_CAVEAT,
			parameters: {
				sourcePopulationFloor: SOURCE_POPULATION_FLOOR,
				sameColorBarByRegion: SAME_COLOR_BAR_BY_REGION,
				modeRadii: MODE_RADII,
				modeMassFloors: MODE_MASS_FLOORS,
				primaryCell: cellKey(PRIMARY_RADIUS, PRIMARY_MASS_FLOOR),
				toneLightnessWeights: TONE_LIGHTNESS_WEIGHTS,
				modeLatticeEdge: MODE_LATTICE_EDGE,
				bootstrapSeed: BOOTSTRAP_SEED,
				bootstrapResamples: BOOTSTRAP_RESAMPLES,
			},
		},
		residuals,
		contingency,
		separation,
		neighbourhoodFailures: failures,
		rows: FIXTURES.flatMap((name) => bySet.get(name) as ColorRow[]),
	}

	for (const residual of residuals) {
		process.stdout.write(
			`${residual.set}: ${residual.refusedExact}/${residual.palettes} refused by exact triple, ` +
				`${residual.refusedNeighbourhood}/${residual.palettes} refused under the bar; ` +
				`colour pass ${residual.colourPassExact}/${residual.colourUnits} → ` +
				`${residual.colourPassNeighbourhood}/${residual.colourUnits}\n`,
		)
	}
	process.stdout.write(`\nendorsed colour units still failing under the bar: ${failures.length}\n`)
	for (const [ruleName, result] of Object.entries(contingency)) {
		process.stdout.write(
			`${ruleName}: endorsed fail ${((result.endorsedFailureRate ?? 0) * 100).toFixed(1)}%, ` +
				`known-bad fail ${((result.knownBadFailureRate ?? 0) * 100).toFixed(1)}%, ` +
				`difference ${((result.difference ?? 0) * 100).toFixed(1)}pp ` +
				`[${((result.low ?? 0) * 100).toFixed(1)}, ${((result.high ?? 0) * 100).toFixed(1)}]\n`,
		)
	}
	process.stdout.write("\n")
	process.stdout.write("feature                                    AUC [95% cluster CI]   separates\n")
	for (const row of separation) {
		const auc = row.auc === null ? "  n/a" : row.auc.toFixed(3)
		const low = row.aucLow === null ? " n/a " : row.aucLow.toFixed(3)
		const high = row.aucHigh === null ? " n/a " : row.aucHigh.toFixed(3)
		process.stdout.write(
			`${row.feature.padEnd(40)} ${auc} [${low}, ${high}]   ${row.separates ? "YES" : "no"}\n`,
		)
	}

	if (!values.write) {
		process.stdout.write("\n(dry run — pass --write to update the data file)\n")
		return
	}
	// Six significant figures. The inputs are 8-bit channel values and integer pixel counts, so the
	// eighteen digits JSON would otherwise print are float noise wearing the costume of precision —
	// and CONVENTIONS.md's rule against overstating a measurement applies to a data file as much as
	// to a sentence. Small shares (1e-6) keep their magnitude because this rounds by significant
	// figures, not decimal places.
	const rounded = JSON.stringify(
		report,
		(_key, value) => (typeof value === "number" && Number.isFinite(value) ? Number(value.toPrecision(6)) : value),
		"\t",
	)
	await writeFile(STUDY_OUTPUT_PATH, `${rounded}\n`)
	process.stdout.write(`\nwrote ${STUDY_OUTPUT_PATH}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
