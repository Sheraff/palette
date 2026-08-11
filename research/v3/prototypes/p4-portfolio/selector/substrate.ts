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
 *    `constants.ts` from `probit()` — the classical 1.4826 never appears as a digit), floored at the
 *    scale the 8-bit sRGB encoding itself injects (`measureQuantizationScale`, SPEC §3.1). Both
 *    numbers are measured from the file; neither is set.
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
import type { Rgb8 } from "../../../src/contract/types.ts"
import { quantileSorted } from "../../../src/stats/numeric.ts"
import {
	CENSUS_BASE,
	MAD_CONSISTENCY_FACTOR,
	MEDIAN_QUANTILE,
	OKLAB_DIMENSIONS,
	OPAQUE_ALPHA,
	SYMMETRIC_DIFFERENCE_SPANS,
	UNIFORM_QUANTIZATION_VARIANCE_DENOMINATOR,
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
 * **σ = 0 is returned, not repaired, and it is not rare.** An image where more than half of the
 * horizontally adjacent pixel pairs are byte-identical — flat-design artwork, a hard-posterised
 * render, large areas of one fill — measures σ = 0 exactly. **Measured: 4 of the 20 demo-20 covers,
 * and 2 of the 3 gate covers.** This function still reports that zero: it is what the estimator
 * arm-c′ §4 decision 3 names actually measured, and hiding it inside the estimator would settle a
 * held decision by accident. The floor is applied one level up, in `buildSubstrate`, from a scale
 * that is *also* measured — see `measureQuantizationScale`.
 *
 * The estimator's *form* remains arm-c′ §4 decision 3, whose anchor is the dither arm P4 does not
 * have — see `HELD_DECISIONS` in `constants.ts`. Nothing about the form is adjusted here.
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
 * The image's mean 8-bit sRGB colour — the operating point SPEC §3.1 names.
 *
 * Accumulated over the exact 8-bit triples in raster order. The sums are integers below 2⁵³ for any
 * image this corpus contains, so the mean is exact up to the single final division.
 */
export function meanRgb(image: DecodedImage): Rgb8 {
	const pixelCount = image.width * image.height
	const totals = new Float64Array(OKLAB_DIMENSIONS)
	for (let at = 0; at < image.rgb.length; at += OKLAB_DIMENSIONS) {
		for (let channel = 0; channel < OKLAB_DIMENSIONS; channel += 1) {
			totals[channel] += image.rgb[at + channel]!
		}
	}
	return [totals[0]! / pixelCount, totals[1]! / pixelCount, totals[2]! / pixelCount]
}

/**
 * **σ_quant — the noise the 8-bit sRGB encoding itself injects, in OKLab, at this image's mean
 * colour.** `[DERIVED]`; the derivation below IS the provenance, and it is registered as such in
 * `DERIVED_QUANTITIES` in `constants.ts`. SPEC §3.1, acknowledged by the main tier.
 *
 * ## The derivation, in full
 *
 * **Step 1 — the quantization noise in sRGB.** Writing a colour to 8 bits rounds it to the nearest of
 * 256 levels, so what the file holds differs from what the encoder had by an error distributed
 * uniformly over one quantization cell: `e ~ U(−w/2, +w/2)` with `w` = 1 LSB, independently in each of
 * R, G and B. A uniform's variance over that cell is `∫_{−1/2}^{1/2} x² dx · w² = w²/12` — the
 * `UNIFORM_QUANTIZATION_VARIANCE_DENOMINATOR`, an identity of the integral — so
 *
 *     σ_s = w / √12   per sRGB channel.
 *
 * **The units are chosen so that `w` is exactly 1.** The contract's `rgbToOkLab` is parameterised on
 * 8-bit channel values (it divides by 255 itself), so working in its input units makes one LSB the
 * number one, and no 255 appears anywhere below.
 *
 * **Step 2 — propagation to OKLab.** sRGB→OKLab is smooth and, over a single LSB, linear to within
 * the second-order term, so the OKLab perturbation is `Δ = Σ_c J_c e_c` where `J_c = ∂OKLab/∂channel_c`
 * is the Jacobian's `c`-th column at the operating point. The `e_c` are independent with variance
 * `σ_s²`, so
 *
 *     Cov(Δ) = σ_s² · Σ_c J_c J_cᵀ,     Var_k = σ_s² · Σ_c J_c[k]².
 *
 * **Step 3 — pooling, by the same rule the measured σ uses.** `measureNoiseScale` pools its three
 * coordinate scales into one isotropic σ by matching total variance, `3σ² = Σ_k σ_k²`, because the
 * contract's ruler is isotropic. Pooling the same way — and it must be the same way, or the two
 * scales the floor compares would be in different geometries:
 *
 *     σ_quant² = (1/3) · Σ_k Var_k = σ_s² · ‖J‖_F² / 3 = ‖J‖_F² / 36,
 *
 * with `‖J‖_F` the Frobenius norm of the 3×3 Jacobian. The 36 is not written: it is
 * `OKLAB_DIMENSIONS · UNIFORM_QUANTIZATION_VARIANCE_DENOMINATOR`, both of which are identities.
 *
 * ## How the Jacobian is evaluated, exactly
 *
 * `J_c` is taken as the **symmetric difference of the contract's own `rgbToOkLab` over ±1 LSB about
 * the mean colour**, divided by the two-LSB span (`SYMMETRIC_DIFFERENCE_SPANS`). Stated plainly so it
 * can be argued with:
 *
 *  - The step is **not free**. It is one LSB — the smallest change the encoding can express, and the
 *    only step length the file format offers. It is also, exactly, the probe arm-c′ §4.3 anchors
 *    decision 3 on (*"a ±1-LSB dither"*), which is why SPEC §3.1 calls this the same scale.
 *  - It is **arithmetic, not a sweep**: one evaluation per channel per image, no search, no fit, no
 *    corpus, nothing to tune. Two runs over the same file give the same number bit-for-bit.
 *  - The contract's function is called rather than differentiated on paper because writing the chain
 *    rule out here would mean restating Ottosson's two 3×3 matrices and the sRGB transfer curve
 *    inside `selector/` — a second copy of the one ruler, and a dozen unregistered numeric literals
 *    in the pricing code, which is precisely the shape F2 exists to catch.
 *  - Near the encoding's black point the probe reaches out of gamut (mean − 1 < 0). Every operation
 *    on that path is total on the reals — the sRGB curve's linear segment and `Math.cbrt` both accept
 *    negatives — so the value is the map's own analytic continuation rather than a clamp, and the
 *    large σ_quant it reports there is real: OKLab's cube root genuinely magnifies one LSB near black.
 *
 * The result is a **per-image measurement**, not a constant: it moves with the mean colour, and
 * `tests/substrate.test.ts` pins that it does.
 */
export function measureQuantizationScale(image: DecodedImage): {
	sigma: number
	mean: Rgb8
	jacobian: number[][]
} {
	const mean = meanRgb(image)
	const jacobian: number[][] = []
	let frobeniusSquared = 0
	for (let channel = 0; channel < OKLAB_DIMENSIONS; channel += 1) {
		const above = [mean[0], mean[1], mean[2]]
		const below = [mean[0], mean[1], mean[2]]
		above[channel] += 1
		below[channel] -= 1
		const high = rgbToOkLab(above as unknown as Rgb8)
		const low = rgbToOkLab(below as unknown as Rgb8)
		const column: number[] = []
		for (let coordinate = 0; coordinate < OKLAB_DIMENSIONS; coordinate += 1) {
			const slope = (high[coordinate]! - low[coordinate]!) / SYMMETRIC_DIFFERENCE_SPANS
			column.push(slope)
			frobeniusSquared += slope * slope
		}
		jacobian.push(column)
	}
	return {
		sigma: Math.sqrt(
			frobeniusSquared / (OKLAB_DIMENSIONS * UNIFORM_QUANTIZATION_VARIANCE_DENOMINATOR),
		),
		mean,
		jacobian,
	}
}

/**
 * Build the lattice and measure σ — one pass over the decoded image, in raster order.
 *
 * Palette-independent by construction: this is the same substrate every member is priced against,
 * and nothing about a member reaches it.
 *
 * **The floor lives here, and only here** (SPEC §3.1): `σ_effective = max(σ_measured, σ_quant)`. Both
 * inputs are measurements of this file — one of its noise, one of its encoding — and both are carried
 * out on the result beside the effective value, so any reader can see which one bound and by how much.
 * A cover where the floor bound is not hidden: `sigmaFlooredByQuantization` says so per cover, and
 * the bit table counts them.
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
	const quantization = measureQuantizationScale(image)
	return {
		resolution,
		cellCount,
		counts,
		sums,
		sumsOfSquares,
		sigma: Math.max(noise.sigma, quantization.sigma),
		sigmaMeasured: noise.sigma,
		sigmaQuantization: quantization.sigma,
		sigmaFlooredByQuantization: quantization.sigma > noise.sigma,
		meanRgb: quantization.mean,
		sigmaPerCoordinate: noise.perCoordinate,
	}
}
