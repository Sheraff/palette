/**
 * # The toy candidate — median colour plus fixed offsets. NOT A PALETTE ALGORITHM.
 *
 * **Read this before drawing any conclusion from its output.** This module exists for exactly one
 * reason: to give the dev loop something to run so the loop itself can be tested end to end. It is
 * deliberately, visibly dumb, and it is not a baseline, not a control, not a straw man, and not a
 * starting point for a Phase 1 proposal. Nothing about it was chosen because it produces good
 * palettes; the offsets below are made up.
 *
 * If you are here looking for how to write a candidate, the useful parts are the **shape**, not the
 * arithmetic:
 *
 *  1. it decodes its own input and takes its dimensions from the header (`CONVENTIONS.md`: filenames
 *     lie — 719 AVIFs in `music-artworks/` disagree with their own headers),
 *  2. it refuses an input with genuinely transparent pixels rather than flattening it silently
 *     (`PHASE_0_DECISIONS.md` §4 invariant 5),
 *  3. every colour it publishes is an **exact pixel of the source image** (invariant 2), and
 *  4. it fills in the whole contract, including the metadata that makes a verdict about its output
 *     permanently scopable.
 *
 * ## What it does
 *
 * Takes the channel-wise median of every pixel — which is not even a colour that need occur in the
 * image, and is the crudest summary available — moves it by four fixed offsets in OKLab, and then
 * **snaps each target to the nearest colour that actually occurs in the artwork**.
 *
 * That last step is not a design idea, and it must not be read as one. It is the cheapest way to
 * satisfy invariant 2 so the toy's output is contract-shaped and can flow through every instrument
 * downstream. Naive pixel-snapping is explicitly *not* how the real algorithm should choose colours,
 * and a Phase 1 proposal that does this has copied the wrong half of this file.
 */

import sharp from "sharp"
import { CONTRACT_VERSION } from "../../contract/constants.ts"
import { colorFromRgb, okLabDistance, rgbToOkLab } from "../../contract/color.ts"
import { DEFAULT_CONTRAST_PARAMETERS, resolveContrastParameters } from "../../contract/invariants.ts"
import type { GradientStop, OkLab, Palette, Rgb8 } from "../../contract/types.ts"
import { hashFileBytes } from "../code-version.ts"
import type { CandidatePalette } from "../types.ts"

/** The name this candidate is known by in run ids, cache paths and the viewer. */
export const candidateId = "toy-median-offsets"

/**
 * What this candidate calls itself in `PaletteMetadata.algorithmVersion`.
 *
 * [UNCALIBRATED] — a label, not a measurement. The cache does not read it (the cache keys on measured
 * source hashes precisely so that a forgotten bump here cannot serve a stale palette); it is here
 * because the contract requires an algorithm version and because a palette that turns up in the
 * warehouse should say out loud that a toy produced it.
 */
export const ALGORITHM_VERSION = "toy-median-offsets-0.1.0"

/**
 * The decoder and preprocessing this candidate used.
 *
 * [INHERITED] — `sharp` 0.33.5 is what every v3 import resolves to (`CONVENTIONS.md`), and
 * `no-resample` states the `PHASE_0_DECISIONS.md` §1 rule this candidate honours: full resolution,
 * no downscale.
 */
export const PREPROCESSING_VERSION = "sharp-0.33.5/srgb/no-resample"

/**
 * The offsets, in OKLab, applied to the median colour to get four targets.
 *
 * **[UNCALIBRATED] — made up.** Not measured, not reviewed, not derived from anything. They are four
 * arbitrary directions chosen only so the four roles land somewhere visibly different from each other
 * in the viewer. Changing them is the intended way to exercise the diff: edit a number here, re-run,
 * and the loop should show you exactly which covers moved and by how much.
 */
export const ROLE_OFFSETS: Readonly<Record<"background" | "surface" | "foreground" | "accent", OkLab>> = {
	background: [-0.12, 0, 0],
	surface: [-0.02, 0, 0],
	foreground: [+0.55, 0, 0],
	accent: [-0.05, +0.18, +0.04],
}

/**
 * The two ends of the toy's gradient, again as OKLab offsets from the median.
 *
 * **[UNCALIBRATED] — made up**, same as above. A gradient is published mainly so the loop exercises
 * the pinned display mapping and the viewer's field rendering on real data; a flat-field-only toy
 * would leave that path untested until a real candidate arrived.
 */
export const GRADIENT_OFFSETS: readonly OkLab[] = [
	[-0.16, +0.02, +0.02],
	[+0.06, -0.02, -0.02],
]

/** Thrown when the input is one the contract refuses. Surfaces as a failed row, never a silent skip. */
export class ToyCandidateError extends Error {
	override readonly name = "ToyCandidateError"
}

type DecodedImage = Readonly<{
	width: number
	height: number
	format: string
	/** Every distinct colour in the image, packed as `r << 16 | g << 8 | b`. */
	uniqueColors: Int32Array
	/** The channel-wise median, which need not be one of `uniqueColors`. */
	median: Rgb8
}>

function unpack(packed: number): Rgb8 {
	return [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff]
}

/**
 * Decode, refuse transparency, and collect what the offsets need.
 *
 * One pass over the pixels does all three jobs: the per-channel histograms for the median, the
 * distinct-colour set for the snap, and the alpha check. A second pass over 400,000 pixels for each
 * would be the difference between a loop that is pleasant to run and one that is not.
 */
async function decode(imagePath: string): Promise<DecodedImage> {
	const image = sharp(imagePath)
	// Dimensions and format come from the header. Never from the filename.
	const metadata = await image.metadata()
	if (metadata.width === undefined || metadata.height === undefined) {
		throw new ToyCandidateError(`no header dimensions for ${imagePath}`)
	}

	const { data, info } = await image.toColourspace("srgb").raw().toBuffer({ resolveWithObject: true })
	const channels = info.channels
	if (channels !== 3 && channels !== 4) {
		throw new ToyCandidateError(`unsupported channel count ${channels} for ${imagePath}`)
	}

	const redCounts = new Uint32Array(256)
	const greenCounts = new Uint32Array(256)
	const blueCounts = new Uint32Array(256)
	const seen = new Set<number>()
	const pixelCount = info.width * info.height

	for (let offset = 0; offset < data.length; offset += channels) {
		// Invariant 5: a genuinely transparent pixel is refused loudly, never flattened onto an
		// invented background. An alpha channel that is uniformly opaque is not transparency.
		if (channels === 4 && data[offset + 3] !== 255) {
			throw new ToyCandidateError(
				`${imagePath} has at least one transparent pixel; the contract refuses transparent input`,
			)
		}
		const red = data[offset]
		const green = data[offset + 1]
		const blue = data[offset + 2]
		redCounts[red] += 1
		greenCounts[green] += 1
		blueCounts[blue] += 1
		seen.add((red << 16) | (green << 8) | blue)
	}

	const medianOf = (counts: Uint32Array): number => {
		const half = pixelCount / 2
		let running = 0
		for (let value = 0; value < 256; value += 1) {
			running += counts[value]
			if (running >= half) return value
		}
		return 255
	}

	return {
		width: metadata.width,
		height: metadata.height,
		format: metadata.format ?? "unknown",
		uniqueColors: Int32Array.from(seen),
		median: [medianOf(redCounts), medianOf(greenCounts), medianOf(blueCounts)],
	}
}

/**
 * The nearest colour that actually occurs in the image, by the one ruler.
 *
 * A linear scan over the distinct colours. `PHASE_0_DECISIONS.md` §3 fixes OKLab as the only space
 * this project measures distance in, so `okLabDistance` is used here as everywhere else — a toy is
 * still not allowed a second ruler.
 */
function nearestPresentColor(image: DecodedImage, target: OkLab, labCache: Float64Array): Rgb8 {
	let bestIndex = 0
	let bestDistance = Number.POSITIVE_INFINITY
	for (let index = 0; index < image.uniqueColors.length; index += 1) {
		const base = index * 3
		const distance = okLabDistance(target, [labCache[base], labCache[base + 1], labCache[base + 2]])
		if (distance < bestDistance) {
			bestDistance = distance
			bestIndex = index
		}
	}
	return unpack(image.uniqueColors[bestIndex])
}

/**
 * The candidate itself.
 *
 * Note the name: `CandidatePalette` in `../types.ts` is the *function* a candidate exports. The
 * adjudication workstream has a type of the same name for the palette *record* it reads back out of a
 * run file (`src/adjudication/types.ts`); they are different things in different modules, and the
 * only place they meet is a run file, where one produces what the other parses.
 */
export const paletteOf: CandidatePalette = async (imagePath) => {
	const image = await decode(imagePath)

	// One OKLab conversion per distinct colour, reused across all six snaps. Converting per target
	// instead would repeat the same few hundred thousand cube roots six times over.
	const labCache = new Float64Array(image.uniqueColors.length * 3)
	for (let index = 0; index < image.uniqueColors.length; index += 1) {
		const lab = rgbToOkLab(unpack(image.uniqueColors[index]))
		labCache[index * 3] = lab[0]
		labCache[index * 3 + 1] = lab[1]
		labCache[index * 3 + 2] = lab[2]
	}

	const medianLab = rgbToOkLab(image.median)
	const snap = (offset: OkLab): Rgb8 =>
		nearestPresentColor(
			image,
			[medianLab[0] + offset[0], medianLab[1] + offset[1], medianLab[2] + offset[2]],
			labCache,
		)

	const background = colorFromRgb(snap(ROLE_OFFSETS.background))
	const surface = colorFromRgb(snap(ROLE_OFFSETS.surface))
	const foreground = colorFromRgb(snap(ROLE_OFFSETS.foreground))
	const accent = colorFromRgb(snap(ROLE_OFFSETS.accent))

	const stops = GRADIENT_OFFSETS.map((offset, index): GradientStop => ({
		color: colorFromRgb(snap(offset)),
		// Evenly spaced across the full span. The contract requires the first stop at 0 and the last
		// at 1; with two stops that is the whole of it.
		position: index / (GRADIENT_OFFSETS.length - 1),
	}))

	return {
		contractVersion: CONTRACT_VERSION,
		roles: { background, surface, foreground, accent },
		gradient: { stops: stops as unknown as [GradientStop, GradientStop] },
		collapse: {
			// Stated, not inferred — but the statement has to be true, and with snapping two offsets can
			// genuinely land on the same pixel. So it is measured against the colours actually published.
			surfaceCollapsed: surface.hex === background.hex,
			accentCollapsed: accent.hex === foreground.hex,
		},
		contrast: resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS),
		metadata: {
			algorithmVersion: ALGORITHM_VERSION,
			preprocessingVersion: PREPROCESSING_VERSION,
			inputContentHash: await hashFileBytes(imagePath),
			sourceRendition: {
				path: imagePath,
				width: image.width,
				height: image.height,
				format: image.format,
			},
			// Equal to the rendition's size, because §1 forbids resampling.
			processedSize: { width: image.width, height: image.height },
		},
	}
}
