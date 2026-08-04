/**
 * W-VERIFY step 6 — the early falsifier of arm-f-r3 §7, run independently.
 *
 * **The claim under test.** P5's whole case for stability is that an *integral* — a fit over every
 * pixel — cannot be moved by a perturbation smaller than the thing it integrates. The sharpest form
 * of that claim is about the *continuous* endpoints, before any snap: flip the least significant bit
 * of the source and the fitted field's ramp ends must not move by as much as the pooled same-colour
 * bar. If they do, everything downstream inherits the movement and the paradigm's structural
 * argument is wrong — so this measures the continuous quantity, not the published hex.
 *
 * **What is compared.** Ramp-end *positions* are computed once, from the ORIGINAL fit: the dominant
 * image-plane direction (largest right singular vector of the 3×2 position-coefficient block, closed
 * form) and the weighted 2%/98% quantiles of `t = d·(x, y)` over the fit's own weights. Those are
 * `ramp.ts`'s own definitions, re-derived here rather than imported, because a verifier that calls
 * the module it is checking to decide *where* to check it has verified nothing. The re-derivation is
 * cross-checked against `readRamp`'s published targets on every cover where a ramp exists, and the
 * check is reported.
 *
 * Both fits are then evaluated at those same two positions and the OKLab distance is taken. PASS per
 * cover = both distances < POOLED_SAME_COLOR_BAR.
 *
 * **The perturbation.** Two deterministic modes, no `Math.random` anywhere:
 *  - `all`  — flip the low bit of every channel of every pixel. The maximal ±1-LSB perturbation.
 *  - `hash` — flip the low bit when an FNV-1a hash of (x, y, channel) is odd, so roughly half the
 *             channels move and the flips are spatially incoherent, which is what a real dither
 *             looks like. FNV-1a is a hash, not a generator: the same pixel always gets the same
 *             answer, on any machine, in any run.
 *
 * XOR with 1 changes a byte by exactly ±1 and cannot leave [0, 255], so no clamping is involved and
 * no flip is silently dropped. Perturbed images are written as PNG (lossless — a JPEG round-trip
 * would swamp the signal with its own quantization). The original is *also* written as PNG and its
 * decoded raster asserted equal to the JPEG's, so the only difference between the two inputs to
 * `fitField` is the bit flips.
 *
 * Usage, from research/v3:
 *   node --experimental-strip-types prototypes/p5-fieldfit/verify/dither-falsifier.ts <image>...
 */

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import sharp from "sharp"

import { okLabDistance } from "../../../src/contract/color.ts"
import { POOLED_SAME_COLOR_BAR } from "../../../src/contract/constants.ts"
import type { OkLab } from "../../../src/contract/types.ts"
import { decodeAndInventory, normalizedX, normalizedY } from "../src/decode.ts"
import { fitField, fittedSpan } from "../src/fieldfit.ts"
import { readRamp } from "../src/ramp.ts"
import type { DecodedRaster, FieldFit } from "../src/types.ts"

// ---------------------------------------------------------------------------------------------
// Ramp-end positions, re-derived (ramp.ts's definitions, independently written)
// ---------------------------------------------------------------------------------------------

const ENDPOINT_QUANTILE_LOW = 0.02
const ENDPOINT_QUANTILE_HIGH = 0.98
const T_HISTOGRAM_BINS = 4096

/** Largest right singular vector of the 3×2 block, sign-canonicalised. `null` when the block is 0. */
function dominantDirection(coefficients: Float64Array): [number, number] | null {
	let mxx = 0
	let mxy = 0
	let myy = 0
	for (let channel = 0; channel < 3; channel += 1) {
		const bx = coefficients[channel * 3 + 1]
		const by = coefficients[channel * 3 + 2]
		mxx += bx * bx
		mxy += bx * by
		myy += by * by
	}
	if (!(mxx + myy > 1e-24)) return null
	const mean = (mxx + myy) / 2
	const largest = mean + Math.hypot((mxx - myy) / 2, mxy)
	let vx: number
	let vy: number
	if (mxy !== 0) {
		vx = mxy
		vy = largest - mxx
	} else if (mxx >= myy) {
		vx = 1
		vy = 0
	} else {
		vx = 0
		vy = 1
	}
	const norm = Math.hypot(vx, vy)
	if (!(norm > 0)) return null
	vx /= norm
	vy /= norm
	if (vx < 0 || (vx === 0 && vy < 0)) return [-vx, -vy]
	return [vx, vy]
}

/** Weighted 2%/98% quantiles of `t = d·(x, y)` over the fit's weights, by fixed histogram. */
function tQuantiles(fit: FieldFit, raster: DecodedRaster, direction: readonly [number, number]) {
	const { width, height } = raster
	const xs = new Float64Array(width)
	for (let px = 0; px < width; px += 1) xs[px] = normalizedX(px, width) * direction[0]
	const ys = new Float64Array(height)
	for (let py = 0; py < height; py += 1) ys[py] = normalizedY(py, height) * direction[1]

	const extentX = Math.abs(direction[0]) * (1 - 1 / width)
	const extentY = Math.abs(direction[1]) * (1 - 1 / height)
	const tMin = -(extentX + extentY)
	const tMax = extentX + extentY
	if (!(tMax > tMin)) return null

	const binWidth = (tMax - tMin) / T_HISTOGRAM_BINS
	const histogram = new Float64Array(T_HISTOGRAM_BINS)
	let weightSum = 0
	for (let py = 0; py < height; py += 1) {
		const rowOffset = py * width
		for (let px = 0; px < width; px += 1) {
			const weight = fit.weights[rowOffset + px]
			if (!(weight > 0)) continue
			let bin = Math.floor((xs[px] + ys[py] - tMin) / binWidth)
			if (bin < 0) bin = 0
			else if (bin >= T_HISTOGRAM_BINS) bin = T_HISTOGRAM_BINS - 1
			histogram[bin] += weight
			weightSum += weight
		}
	}
	if (!(weightSum > 0)) return null

	const quantile = (q: number): number => {
		const target = q * weightSum
		let cumulative = 0
		for (let bin = 0; bin < T_HISTOGRAM_BINS; bin += 1) {
			const mass = histogram[bin]
			if (mass > 0 && cumulative + mass >= target) {
				return tMin + (bin + (target - cumulative) / mass) * binWidth
			}
			cumulative += mass
		}
		return tMax
	}
	return { tLow: quantile(ENDPOINT_QUANTILE_LOW), tHigh: quantile(ENDPOINT_QUANTILE_HIGH) }
}

/**
 * The two positions the ramp ends live at. On an order-0 (or degenerate) fit the field is constant,
 * so any two positions measure the same shift; the square's opposite corners are used and said so.
 */
function rampEndPositions(
	fit: FieldFit,
	raster: DecodedRaster,
): { low: [number, number]; high: [number, number]; degenerate: boolean } {
	const axis = fit.order === 1 ? dominantDirection(fit.coefficients) : null
	if (axis === null) return { low: [-1, -1], high: [1, 1], degenerate: true }
	const quantiles = tQuantiles(fit, raster, axis)
	if (quantiles === null) return { low: [-1, -1], high: [1, 1], degenerate: true }
	return {
		low: [quantiles.tLow * axis[0], quantiles.tLow * axis[1]],
		high: [quantiles.tHigh * axis[0], quantiles.tHigh * axis[1]],
		degenerate: false,
	}
}

// ---------------------------------------------------------------------------------------------
// The perturbation
// ---------------------------------------------------------------------------------------------

/** FNV-1a over three 32-bit words. A hash, not a generator — same input, same answer, always. */
function fnv1a(x: number, y: number, channel: number): number {
	let hash = 0x811c9dc5
	for (const word of [x, y, channel]) {
		for (let byte = 0; byte < 4; byte += 1) {
			hash ^= (word >>> (byte * 8)) & 0xff
			hash = Math.imul(hash, 0x01000193) >>> 0
		}
	}
	return hash
}

function perturb(
	pixels: Buffer,
	width: number,
	height: number,
	channels: number,
	mode: "all" | "hash",
): { out: Buffer; flipped: number } {
	const out = Buffer.from(pixels)
	let flipped = 0
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const base = (y * width + x) * channels
			for (let channel = 0; channel < 3; channel += 1) {
				if (mode === "hash" && (fnv1a(x, y, channel) & 1) === 0) continue
				out[base + channel] = out[base + channel] ^ 1
				flipped += 1
			}
		}
	}
	return { out, flipped }
}

// ---------------------------------------------------------------------------------------------
// Per cover
// ---------------------------------------------------------------------------------------------

const BAR = POOLED_SAME_COLOR_BAR

async function writePng(pixels: Buffer, width: number, height: number, path: string): Promise<void> {
	await sharp(pixels, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 0 }).toFile(path)
}

async function run(imagePath: string, workDir: string) {
	const absolute = resolve(imagePath)
	const short = absolute.split("/").pop()!.slice(-14)

	const decoded = await sharp(absolute).raw().toBuffer({ resolveWithObject: true })
	const { width, height, channels } = decoded.info
	// Repack to exactly 3 channels so the PNGs carry no alpha (decode.ts refuses transparency).
	const rgb = Buffer.alloc(width * height * 3)
	for (let index = 0; index < width * height; index += 1) {
		rgb[index * 3] = decoded.data[index * channels]
		rgb[index * 3 + 1] = decoded.data[index * channels + 1]
		rgb[index * 3 + 2] = decoded.data[index * channels + 2]
	}

	const originalPng = join(workDir, `${short}.orig.png`)
	await writePng(rgb, width, height, originalPng)

	const jpegRaster = (await decodeAndInventory(absolute)).raster
	const originalRaster = (await decodeAndInventory(originalPng)).raster
	let identical = jpegRaster.packed.length === originalRaster.packed.length
	if (identical) {
		for (let index = 0; index < jpegRaster.packed.length; index += 1) {
			if (jpegRaster.packed[index] !== originalRaster.packed[index]) {
				identical = false
				break
			}
		}
	}

	const originalFit = fitField(originalRaster)
	const positions = rampEndPositions(originalFit, originalRaster)
	const lowEnd = originalFit.fieldAt(positions.low[0], positions.low[1])
	const highEnd = originalFit.fieldAt(positions.high[0], positions.high[1])

	// Cross-check the re-derived positions against `readRamp`'s own published targets, where a ramp
	// exists at all. Orientation may swap the pair, so both assignments are allowed.
	const ramp = readRamp(originalFit, originalRaster, (await decodeAndInventory(originalPng)).inventory)
	let positionCheck = "n/a (flat/noField reading)"
	if (!originalFit.noField && originalFit.order === 1 && ramp.stops.length >= 2) {
		const straight = Math.max(
			okLabDistance(lowEnd, ramp.backgroundTarget),
			okLabDistance(highEnd, ramp.surfaceTarget),
		)
		const swapped = Math.max(
			okLabDistance(highEnd, ramp.backgroundTarget),
			okLabDistance(lowEnd, ramp.surfaceTarget),
		)
		const agreement = Math.min(straight, swapped)
		positionCheck = `${agreement < 1e-12 ? "MATCH" : "DIFFERS"} (${agreement.toExponential(2)})`
	}

	const centre = originalFit.fieldAt(0, 0)
	const results: {
		mode: string
		flipped: number
		low: number
		high: number
		order: 0 | 1
		centre: number
		span: number
		residualScale: number
		inlierFraction: number
		explainedFraction: number
		sourceMean: number
		sourceMax: number
	}[] = []
	for (const mode of ["all", "hash"] as const) {
		const { out, flipped } = perturb(rgb, width, height, 3, mode)
		const path = join(workDir, `${short}.${mode}.png`)
		await writePng(out, width, height, path)
		const perturbedRaster = (await decodeAndInventory(path)).raster
		const perturbedFit = fitField(perturbedRaster)

		// **How far the SOURCE moved, in the same units as the endpoint move.** Without this the
		// pass/fail line above is not interpretable: OKLab lightness is a cube root of linear light, so
		// one 8-bit step is 4.38 pooled bars at #000000 and 0.19 of one at #fefefe. An endpoint that
		// moves by as much as the pixels under it moved has not amplified anything — the criterion, not
		// the fit, is what a black cover breaks.
		let sourceSum = 0
		let sourceMax = 0
		const pixels = originalRaster.width * originalRaster.height
		for (let index = 0; index < pixels; index += 1) {
			const offset = index * 3
			const distance = Math.hypot(
				originalRaster.lab[offset] - perturbedRaster.lab[offset],
				originalRaster.lab[offset + 1] - perturbedRaster.lab[offset + 1],
				originalRaster.lab[offset + 2] - perturbedRaster.lab[offset + 2],
			)
			sourceSum += distance
			if (distance > sourceMax) sourceMax = distance
		}
		results.push({
			mode,
			flipped,
			low: okLabDistance(lowEnd, perturbedFit.fieldAt(positions.low[0], positions.low[1])),
			high: okLabDistance(highEnd, perturbedFit.fieldAt(positions.high[0], positions.high[1])),
			// Diagnosis, not verdict: an order flip explains a large endpoint move without excusing it,
			// and the centre distance separates "the whole field moved" from "the field grew a tilt".
			order: perturbedFit.order,
			centre: okLabDistance(centre, perturbedFit.fieldAt(0, 0)),
			span: fittedSpan(perturbedFit.coefficients),
			residualScale: perturbedFit.residualScale,
			inlierFraction: perturbedFit.inlierFraction,
			explainedFraction: perturbedFit.fieldExplainedFraction,
			sourceMean: sourceSum / pixels,
			sourceMax,
		})
	}

	const worst = Math.max(...results.flatMap((result) => [result.low, result.high]))
	return { short, absolute, width, height, identical, positions, positionCheck, results, worst, originalFit }
}

const images = process.argv.slice(2)
if (images.length === 0) {
	process.stdout.write("usage: dither-falsifier.ts <image>...\n")
	process.exit(2)
}

const workDir = await mkdtemp(join(tmpdir(), "p5-dither-"))
process.stdout.write(`pooled same-colour bar: ${BAR}\nwork dir: ${workDir}\n\n`)
let anyFail = false
try {
	for (const image of images) {
		const result = await run(image, workDir)
		const verdict = result.worst < BAR ? "PASS" : "FAIL"
		if (verdict === "FAIL") anyFail = true
		process.stdout.write(
			`${result.short}  ${result.width}×${result.height}  ORIGINAL: order=${result.originalFit.order}` +
				` noField=${result.originalFit.noField} σ̂=${result.originalFit.residualScale.toExponential(3)}` +
				` inlier=${result.originalFit.inlierFraction.toFixed(4)}` +
				` explF=${result.originalFit.fieldExplainedFraction.toFixed(4)}` +
				` marginBars=${result.originalFit.marginBars.toExponential(3)}\n` +
				`  original PNG raster identical to JPEG raster: ${result.identical}\n` +
				`  ramp-end positions: low=(${result.positions.low.map((v) => v.toFixed(4)).join(", ")})` +
				` high=(${result.positions.high.map((v) => v.toFixed(4)).join(", ")})` +
				`${result.positions.degenerate ? " [degenerate: constant field, corners used]" : ""}\n` +
				`  cross-check vs readRamp targets: ${result.positionCheck}\n`,
		)
		for (const arm of result.results) {
			process.stdout.write(
				`  ${arm.mode.padEnd(4)} ${String(arm.flipped).padStart(9)} bits flipped` +
					`   Δlow=${arm.low.toExponential(3)}  Δhigh=${arm.high.toExponential(3)}` +
					`   Δcentre=${arm.centre.toExponential(3)}` +
					`   perturbed: order=${arm.order} span=${arm.span.toExponential(3)}` +
					` σ̂=${arm.residualScale.toExponential(3)} inlier=${arm.inlierFraction.toFixed(4)}` +
					` explF=${arm.explainedFraction.toFixed(4)}\n` +
					`       source moved: mean=${arm.sourceMean.toExponential(3)} max=${arm.sourceMax.toExponential(3)}` +
					`   AMPLIFICATION (worst endpoint / mean source) =` +
					` ${(Math.max(arm.low, arm.high) / arm.sourceMean).toFixed(3)}\n`,
			)
		}
		process.stdout.write(`  WORST ${result.worst.toExponential(3)}  vs bar ${BAR}  → ${verdict}\n\n`)
	}
} finally {
	await rm(workDir, { recursive: true, force: true })
}
process.stdout.write(anyFail ? "RESULT: at least one cover FAILED\n" : "RESULT: all covers PASS\n")
