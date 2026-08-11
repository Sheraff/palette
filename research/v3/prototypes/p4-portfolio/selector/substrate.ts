/**
 * The substrate — arm-c′ §2.1, adapted to a black-box portfolio.
 *
 * One pass over the decoded image accumulates the three things §2.1 names, and the adaptation is
 * only in what the third of them is *for*:
 *
 *  - **A C×C lattice of count-weighted OKLab sufficient statistics.** Not a downsample: no
 *    interpolation, no pixel dropped, cells straddling a non-divisible edge simply hold unequal
 *    counts, and every later fit is count-weighted. Used only for fitting, never to choose a
 *    published colour — which in P4 is doubly true, because the selector publishes nothing: the
 *    members already did.
 *  - **An exact colour census.** A tally over the 8-bit triples actually present. In arm-c′ this is
 *    what published colours are projected onto; here it is what makes the fg/accent same-colour-bar
 *    test affordable (one contract call per *distinct* triple, not per pixel) and what makes the
 *    OKLab conversion a memo of the contract's own `rgbToOkLab` rather than a second copy of it.
 *  - **A noise estimate σ.** The median absolute difference between horizontally adjacent pixels in
 *    OKLab, times the estimator's analytic consistency factor (`MAD_CONSISTENCY_FACTOR`, derived in
 *    `constants.ts` from `probit()` — the classical 1.4826 never appears as a digit).
 *
 * **No filename or artwork id is ever read.** `decodeImage` is given a path, opens the file, and
 * takes its dimensions from the header (`CONVENTIONS.md`: 719 AVIFs in `music-artworks/` disagree
 * with their own names). The path is carried only as a label on the output.
 *
 * **Raster order, and what that buys** (arm-c′ §3, *"no reduction depends on ordering"*). Every
 * accumulation below runs over pixels in raster order and over cells in index order, so the result
 * is a function of the image, not of the traversal. Floating-point addition is not associative, so
 * a *different* traversal is equal to this one up to rounding rather than bit-for-bit;
 * `tests/substrate.test.ts` measures that gap rather than asserting it away, and pins the property
 * that actually matters — the same traversal twice is byte-identical.
 *
 * Implementation donor, per SPEC §2: P6's `src/substrate/decode.ts`, whose sharp-raw decode,
 * transparency refusal and "the 8-bit triples survive intact" discipline this file follows.
 */

import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

import sharp from "sharp"

import { rgbToOkLab } from "../../../src/contract/index.ts"
import { quantileSorted } from "../../../src/stats/numeric.ts"
import {
	CENSUS_BASE,
	MAD_CONSISTENCY_FACTOR,
	MEDIAN_QUANTILE,
	OKLAB_DIMENSIONS,
	OPAQUE_ALPHA,
} from "./constants.ts"
import type { DecodedImage, Substrate } from "./types.ts"

/** Thrown when the substrate refuses an input. Mirrors P6's `SubstrateRefusal`. */
export class SubstrateRefusal extends Error {
	override readonly name = "SubstrateRefusal"
}

/** Packs an 8-bit triple into one integer — the exact colour census's index (arm-c′ §2.1). */
export function packTriple(red: number, green: number, blue: number): number {
	return (red * CENSUS_BASE + green) * CENSUS_BASE + blue
}

/**
 * Decode one image at native resolution and convert it to OKLab.
 *
 * The OKLab values are the contract's own `rgbToOkLab`, memoised over the census rather than
 * reimplemented: a second conversion that merely agreed to some tolerance would be a fork of the
 * one ruler.
 */
export async function decodeImage(imagePath: string): Promise<DecodedImage> {
	const bytes = await readFile(imagePath)
	const contentHash = createHash("sha256").update(bytes).digest("hex")
	const image = sharp(bytes)
	const metadata = await image.metadata()
	if (metadata.width === undefined || metadata.height === undefined) {
		throw new SubstrateRefusal(`no header dimensions for ${imagePath}`)
	}
	const raw = await image.raw().toBuffer({ resolveWithObject: true })
	const { width, height, channels } = raw.info
	if (channels !== OKLAB_DIMENSIONS && channels !== OKLAB_DIMENSIONS + 1) {
		throw new SubstrateRefusal(`unusable channel count ${channels} for ${imagePath}`)
	}
	const pixelCount = width * height
	const rgb = new Uint8Array(pixelCount * OKLAB_DIMENSIONS)
	const lab = new Float64Array(pixelCount * OKLAB_DIMENSIONS)
	const labByTriple = new Map<number, readonly [number, number, number]>()

	for (let pixel = 0; pixel < pixelCount; pixel += 1) {
		const source = pixel * channels
		if (channels > OKLAB_DIMENSIONS && raw.data[source + OKLAB_DIMENSIONS] !== OPAQUE_ALPHA) {
			// PHASE_0_DECISIONS §4 invariant 5: genuinely transparent input is refused loudly. An
			// alpha channel that is uniformly opaque is not transparency and is accepted.
			throw new SubstrateRefusal(`transparent pixel in ${imagePath}`)
		}
		const red = raw.data[source]!
		const green = raw.data[source + 1]!
		const blue = raw.data[source + 2]!
		const target = pixel * OKLAB_DIMENSIONS
		rgb[target] = red
		rgb[target + 1] = green
		rgb[target + 2] = blue
		const packed = packTriple(red, green, blue)
		let okLab = labByTriple.get(packed)
		if (okLab === undefined) {
			okLab = rgbToOkLab([red, green, blue])
			labByTriple.set(packed, okLab)
		}
		lab[target] = okLab[0]
		lab[target + 1] = okLab[1]
		lab[target + 2] = okLab[2]
	}

	return {
		path: imagePath,
		width,
		height,
		rgb,
		lab,
		contentHash,
		format: metadata.format ?? "unknown",
	}
}

/** Which lattice cell a pixel column/row falls in, at resolution C. */
export function cellIndexOf(x: number, y: number, width: number, height: number, resolution: number): number {
	const column = Math.min(resolution - 1, Math.floor((x * resolution) / width))
	const row = Math.min(resolution - 1, Math.floor((y * resolution) / height))
	return row * resolution + column
}

/**
 * The robust noise scale, measured from this file.
 *
 * Per OKLab coordinate: the median absolute difference between horizontally adjacent pixels, times
 * `MAD_CONSISTENCY_FACTOR`. The three coordinate scales are then pooled into the one isotropic σ the
 * currency uses, by matching total variance (`3σ² = Σ σ_c²`) — isotropic because the contract's own
 * ruler is isotropic: `colorDistance` is unweighted Euclidean OKLab, and a per-coordinate σ would
 * quietly price the image in a different geometry from the one the same-colour bar is calibrated in.
 *
 * A frame one pixel wide has no horizontally adjacent pair, so there is nothing to measure and the
 * estimator refuses rather than returning a number it did not measure. σ divides the residual, so a
 * fabricated zero would price every member at infinity and every comparison would still "work".
 *
 * **σ = 0 is left degenerate on purpose, and it is not rare.** An image where more than half of the
 * horizontally adjacent pixel pairs are byte-identical — flat-design artwork, a hard-posterised
 * render, large areas of one fill — measures σ = 0 exactly. **Measured: 4 of the 20 demo-20 covers,
 * and 2 of the 3 gate covers.** At σ = 0 the Gaussian likelihood is a point mass and every member's
 * total comes out `NaN`; the only way to make numbers appear is a noise floor, which is a free scale
 * in the loss (arm-c′ §2.3a: *"it has no free scale"*) and the hand-set constant SPEC §3's F2 exists
 * to catch. So there is no floor here. `selector/pipeline.ts` refuses those covers instead, and
 * `tools/m2-run.ts` counts and lists the refusals rather than averaging over them.
 *
 * The estimator's *form* is arm-c′ §4 decision 3, whose anchor is the dither arm P4 does not have —
 * see `HELD_DECISIONS` in `constants.ts`. This is the measured consequence of inheriting the form
 * without its anchor, and it is a finding for the orchestrator, not a defect to patch here.
 */
export function measureNoiseScale(image: DecodedImage): { sigma: number; perCoordinate: number[] } {
	const { width, height, lab } = image
	const pairCount = (width - 1) * height
	if (pairCount === 0) {
		throw new SubstrateRefusal(`no horizontally adjacent pixel pair in ${image.path}: σ is not measurable`)
	}
	const perCoordinate: number[] = []
	for (let coordinate = 0; coordinate < OKLAB_DIMENSIONS; coordinate += 1) {
		const differences = new Float64Array(pairCount)
		let at = 0
		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width - 1; x += 1) {
				const left = ((y * width + x) * OKLAB_DIMENSIONS) + coordinate
				differences[at] = Math.abs(lab[left + OKLAB_DIMENSIONS]! - lab[left]!)
				at += 1
			}
		}
		differences.sort()
		const median = quantileSorted(Array.from(differences), MEDIAN_QUANTILE)
		perCoordinate.push(median * MAD_CONSISTENCY_FACTOR)
	}
	let totalVariance = 0
	for (const scale of perCoordinate) totalVariance += scale * scale
	return { sigma: Math.sqrt(totalVariance / OKLAB_DIMENSIONS), perCoordinate }
}

/**
 * Build the lattice and measure σ — one pass over the decoded image, in raster order.
 *
 * Palette-independent by construction: this is the same substrate every member is priced against,
 * and nothing about a member reaches it.
 */
export function buildSubstrate(image: DecodedImage, resolution: number): Substrate {
	const cellCount = resolution * resolution
	const counts = new Float64Array(cellCount)
	const sums = new Float64Array(cellCount * OKLAB_DIMENSIONS)
	const sumsOfSquares = new Float64Array(cellCount)
	const { width, height, lab } = image

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const cell = cellIndexOf(x, y, width, height, resolution)
			const source = (y * width + x) * OKLAB_DIMENSIONS
			counts[cell] += 1
			const base = cell * OKLAB_DIMENSIONS
			let squared = 0
			for (let coordinate = 0; coordinate < OKLAB_DIMENSIONS; coordinate += 1) {
				const value = lab[source + coordinate]!
				sums[base + coordinate] += value
				squared += value * value
			}
			sumsOfSquares[cell] += squared
		}
	}

	const noise = measureNoiseScale(image)
	return {
		resolution,
		cellCount,
		counts,
		sums,
		sumsOfSquares,
		sigma: noise.sigma,
		sigmaPerCoordinate: noise.perCoordinate,
	}
}
