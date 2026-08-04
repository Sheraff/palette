/**
 * Tests for P6's substrate module (W1) — SPEC rule 8.
 *
 * Four things are checked, and three of them are re-derivations rather than assertions about the
 * code's own output:
 *
 * 1. **Vocabulary.** The OKLab planes are the contract's `rgbToOkLab`, rounded to float32 and not
 *    otherwise. The region rule is the contract's `colorRegion`. The displacement decomposition is
 *    the contract's `decomposeOkLab`. A near-miss on any of these is a fork, and SPEC rule 2 says a
 *    fork is a bug even when the numbers look close.
 * 2. **Arithmetic.** The blur is re-derived at an interior pixel by an independent naive route:
 *    build the composite 1-D kernel by convolving the box kernels by hand, apply it directly. The
 *    box construction is separately checked against a true sampled Gaussian.
 * 3. **Semantics.** Synthetic images where the right answer is known by construction: a flat field
 *    is its own surround; white lettering on black is ink; a saturated dot on an equal-lightness
 *    grey field is a mark.
 * 4. **Refusals and determinism.** Transparent input is refused loudly; the same file twice gives
 *    byte-identical planes.
 *
 * Synthetic images are written as PNG through `sharp` into a temp directory, so the decode path
 * under test is the real one rather than a fixture of pre-decoded pixels.
 */

import test from "node:test"
import assert from "node:assert/strict"
import sharp from "sharp"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { colorFromRgb, okLabDistance, rgbToOkLab } from "../../../src/contract/color.ts"
import { colorRegion } from "../../../src/contract/color.ts"
import { decomposeOkLab } from "../../../src/contract/challengers.ts"
import { SAME_COLOR_BAR_BY_REGION } from "../../../src/contract/constants.ts"
import type { Rgb8 } from "../../../src/contract/types.ts"

import {
	blurPlaneInPlace,
	boxBlurHorizontal,
	boxBlurVertical,
	boxSizesForSigma,
	buildFigureGround,
	buildSubstrate,
	buildSurroundLadder,
	decodePlanes,
	decomposeDisplacement,
	FIELD_WEIGHT_EXCLUDED_COARSE_RUNGS,
	FIELD_WEIGHT_SOFTNESS_BARS,
	GAUSSIAN_BOX_PASSES,
	LADDER_COARSEST_SHORT_EDGE_FRACTION,
	LADDER_FINEST_SHORT_EDGE_FRACTION,
	LADDER_LEVELS,
	ladderSigmas,
	ladderStepSigmas,
	regionOfOkLab,
	sameColorBarOfOkLab,
	SRGB_TO_LINEAR,
	SubstrateRefusal,
} from "../src/substrate/index.ts"

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

const workspace = mkdtempSync(join(tmpdir(), "p6-substrate-"))
process.on("exit", () => rmSync(workspace, { recursive: true, force: true }))

/** Write an RGB (or RGBA) buffer out as a PNG so the test exercises the real decode path. */
async function writePng(
	name: string,
	width: number,
	height: number,
	fill: (x: number, y: number) => readonly number[],
): Promise<string> {
	const channels = fill(0, 0).length as 3 | 4
	const raw = Buffer.alloc(width * height * channels)
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const pixel = fill(x, y)
			const offset = (y * width + x) * channels
			for (let channel = 0; channel < channels; channel += 1) raw[offset + channel] = pixel[channel]
		}
	}
	const path = join(workspace, name)
	await sharp(raw, { raw: { width, height, channels } }).png({ compressionLevel: 0 }).toFile(path)
	return path
}

/** A deterministic spread of 8-bit triples — corners, greys, primaries and a strided sample. */
function sampleTriples(): Rgb8[] {
	const triples: Rgb8[] = []
	for (const r of [0, 1, 10, 63, 128, 200, 254, 255]) {
		for (const g of [0, 7, 64, 129, 255]) {
			for (const b of [0, 3, 91, 187, 255]) triples.push([r, g, b])
		}
	}
	// A strided walk so the sample is not only on axis-aligned grid points.
	for (let step = 0; step < 500; step += 1) {
		triples.push([(step * 37) % 256, (step * 91) % 256, (step * 173) % 256])
	}
	return triples
}

// ---------------------------------------------------------------------------------------------
// 1. Vocabulary — the contract is the vocabulary of record (SPEC rule 2)
// ---------------------------------------------------------------------------------------------

test("srgb-to-linear table equals the contract's gamma decode at all 256 inputs", () => {
	for (let value = 0; value < 256; value += 1) {
		const channel = value / 255
		const expected = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
		assert.equal(SRGB_TO_LINEAR[value], expected, `table entry ${value}`)
	}
	// And the table is exact rather than close: routing a triple through it reproduces the
	// contract's own OKLab in full float64, before any float32 store.
	assert.equal(SRGB_TO_LINEAR[0], 0)
	assert.equal(SRGB_TO_LINEAR[255], 1)
})

test("OKLab planes agree with the contract's rgbToOkLab to float32 precision", async () => {
	const triples = sampleTriples()
	const width = triples.length
	const path = await writePng("vocab.png", width, 1, (x) => triples[x])
	const decoded = await decodePlanes(path)

	assert.equal(decoded.planes.width, width)
	assert.equal(decoded.planes.height, 1)

	let worst = 0
	for (let index = 0; index < width; index += 1) {
		const triple = triples[index]
		// The 8-bit triples survive decode untouched (invariant 2's precondition).
		assert.deepEqual(
			[decoded.planes.r8[index], decoded.planes.g8[index], decoded.planes.b8[index]],
			[triple[0], triple[1], triple[2]],
			`triple ${index}`,
		)
		const expected = rgbToOkLab(triple)
		// Exact: the plane value must be the contract's float64 value rounded once to float32.
		assert.equal(decoded.planes.L[index], Math.fround(expected[0]), `L at ${index}`)
		assert.equal(decoded.planes.a[index], Math.fround(expected[1]), `a at ${index}`)
		assert.equal(decoded.planes.b[index], Math.fround(expected[2]), `b at ${index}`)
		worst = Math.max(
			worst,
			okLabDistance([decoded.planes.L[index], decoded.planes.a[index], decoded.planes.b[index]], expected),
		)
	}
	// Float32 rounding alone, which is four orders of magnitude below the tightest same-colour bar.
	assert.ok(worst < 1e-6, `worst OKLab deviation ${worst}`)
	assert.ok(worst < SAME_COLOR_BAR_BY_REGION["dark-neutral"] / 1000)
})

test("the region rule and the per-pixel bar are the contract's, not a lookalike", () => {
	for (const triple of sampleTriples()) {
		const lab = rgbToOkLab(triple)
		const color = colorFromRgb(triple)
		assert.equal(regionOfOkLab(lab[0], lab[1], lab[2]), colorRegion(color), `region of ${triple}`)
		assert.equal(
			sameColorBarOfOkLab(lab[0], lab[1], lab[2]),
			SAME_COLOR_BAR_BY_REGION[colorRegion(color)],
			`bar of ${triple}`,
		)
	}
})

test("displacement decomposition matches the contract's decomposeOkLab, and the two identities hold", () => {
	const triples = sampleTriples()
	for (let index = 0; index + 1 < triples.length; index += 7) {
		const groundTriple = triples[index]
		const pixelTriple = triples[index + 1]
		const ground = rgbToOkLab(groundTriple)
		const pixel = rgbToOkLab(pixelTriple)

		const mine = decomposeDisplacement(pixel[0], pixel[1], pixel[2], ground[0], ground[1], ground[2])
		const theirs = decomposeOkLab(colorFromRgb(groundTriple), colorFromRgb(pixelTriple))
		assert.equal(mine.deltaLightness, theirs.deltaLightness)
		assert.equal(mine.deltaChroma, theirs.deltaChroma)
		assert.equal(mine.deltaHue, theirs.deltaHue)

		// Identity 1: ‖d‖² = ΔL² + ΔC² + ΔH² — the one ruler.
		const norm = Math.sqrt(
			mine.deltaLightness ** 2 + mine.deltaChroma ** 2 + mine.deltaHue ** 2,
		)
		assert.ok(Math.abs(norm - okLabDistance(pixel, ground)) < 1e-12, "‖d‖ identity")

		// Identity 2: √(ΔC² + ΔH²) is the chromatic-plane distance — what `markEnergy` sums.
		const mark = Math.sqrt(mine.deltaChroma ** 2 + mine.deltaHue ** 2)
		const chromatic = Math.hypot(pixel[1] - ground[1], pixel[2] - ground[2])
		assert.ok(Math.abs(mark - chromatic) < 1e-12, "mark magnitude identity")
	}
})

// ---------------------------------------------------------------------------------------------
// 2. Arithmetic — naive re-derivation of the blur (SPEC rule 8)
// ---------------------------------------------------------------------------------------------

/** Convolve two 1-D kernels. Naive, O(n·m), and deliberately not the code under test. */
function convolveKernels(first: number[], second: number[]): number[] {
	const out = new Array<number>(first.length + second.length - 1).fill(0)
	for (let i = 0; i < first.length; i += 1) {
		for (let j = 0; j < second.length; j += 1) out[i + j] += first[i] * second[j]
	}
	return out
}

function boxKernel(size: number): number[] {
	return new Array<number>(size).fill(1 / size)
}

/** Apply a centred 1-D kernel along x then along y, at one pixel, by direct summation. */
function naiveSeparableAt(
	plane: Float64Array,
	width: number,
	height: number,
	kernel: number[],
	targetX: number,
	targetY: number,
): number {
	const radius = (kernel.length - 1) / 2
	// Horizontal first, over the rows the vertical pass will need.
	let total = 0
	for (let ky = -radius; ky <= radius; ky += 1) {
		const y = targetY + ky
		let rowValue = 0
		for (let kx = -radius; kx <= radius; kx += 1) {
			const x = targetX + kx
			rowValue += kernel[kx + radius] * plane[y * width + x]
		}
		total += kernel[ky + radius] * rowValue
	}
	return total
}

test("blurPlaneInPlace re-derives naively at an interior pixel (single sigma)", () => {
	const width = 129
	const height = 129
	const sigma = 6
	const sizes = boxSizesForSigma(sigma)
	assert.equal(sizes.length, GAUSSIAN_BOX_PASSES)

	// A deterministic, non-smooth pattern: a naive check against a smooth image proves nothing.
	const reference = new Float64Array(width * height)
	const plane = new Float32Array(width * height)
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const value = ((x * 31 + y * 17) % 97) / 97
			reference[y * width + x] = Math.fround(value)
			plane[y * width + x] = value
		}
	}

	blurPlaneInPlace(plane, new Float32Array(width * height), width, height, sigma)

	let composite = [1]
	for (const size of sizes) composite = convolveKernels(composite, boxKernel(size))
	const support = (composite.length - 1) / 2

	// Interior only: the clamp-padded passes compose exactly with the composite kernel wherever the
	// whole support is inside the frame, and only there.
	const targetX = 64
	const targetY = 64
	assert.ok(targetX - support >= 0 && targetX + support < width, "target is interior")

	const expected = naiveSeparableAt(reference, width, height, composite, targetX, targetY)
	const actual = plane[targetY * width + targetX]
	assert.ok(
		Math.abs(actual - expected) < 1e-6,
		`naive ${expected} vs implementation ${actual} (|Δ| = ${Math.abs(actual - expected)})`,
	)
})

test("a single box pass re-derives naively at every pixel, edges and corners included", () => {
	// The interior test above cannot see the clamp padding, and the clamp is load-bearing: a
	// zero-padded blur would manufacture displacement all round the frame and mark every border
	// pixel as figure. So this one checks every pixel of a small frame against a direct clamped
	// average, for radii from small to larger than the frame itself.
	const width = 13
	const height = 9
	const source = new Float32Array(width * height)
	for (let index = 0; index < source.length; index += 1) source[index] = ((index * 29) % 61) / 61

	const clamp = (value: number, limit: number) => (value < 0 ? 0 : value > limit ? limit : value)

	for (const radius of [1, 3, 6, 20]) {
		const horizontal = new Float32Array(width * height)
		boxBlurHorizontal(source, horizontal, width, height, radius)
		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) {
				let total = 0
				for (let offset = -radius; offset <= radius; offset += 1) {
					total += source[y * width + clamp(x + offset, width - 1)]
				}
				const expected = total / (2 * radius + 1)
				assert.ok(
					Math.abs(horizontal[y * width + x] - expected) < 1e-6,
					`H radius ${radius} at (${x},${y}): ${horizontal[y * width + x]} vs ${expected}`,
				)
			}
		}

		const vertical = new Float32Array(width * height)
		boxBlurVertical(source, vertical, width, height, radius)
		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) {
				let total = 0
				for (let offset = -radius; offset <= radius; offset += 1) {
					total += source[clamp(y + offset, height - 1) * width + x]
				}
				const expected = total / (2 * radius + 1)
				assert.ok(
					Math.abs(vertical[y * width + x] - expected) < 1e-6,
					`V radius ${radius} at (${x},${y}): ${vertical[y * width + x]} vs ${expected}`,
				)
			}
		}
	}

	// And wider than one column block, so the vertical pass's blocking is exercised across a seam.
	const wide = 150
	const tall = 7
	const plane = new Float32Array(wide * tall)
	for (let index = 0; index < plane.length; index += 1) plane[index] = ((index * 17) % 53) / 53
	const blurred = new Float32Array(wide * tall)
	boxBlurVertical(plane, blurred, wide, tall, 2)
	for (let y = 0; y < tall; y += 1) {
		for (let x = 0; x < wide; x += 1) {
			let total = 0
			for (let offset = -2; offset <= 2; offset += 1) {
				total += plane[clamp(y + offset, tall - 1) * wide + x]
			}
			assert.ok(
				Math.abs(blurred[y * wide + x] - total / 5) < 1e-6,
				`blocked V at (${x},${y})`,
			)
		}
	}
})

test("the ladder's coarser rungs re-derive naively by composing every box kernel below them", async () => {
	// A ladder on a small image so the composite support stays inside the frame at the finest rungs.
	const width = 257
	const height = 257
	const path = await writePng("ladder.png", width, height, (x, y) => [
		(x * 7 + y * 3) % 256,
		(x * 13 + y * 29) % 256,
		(x * 5 + y * 11) % 256,
	])
	const decoded = await decodePlanes(path)
	const ladder = buildSurroundLadder(decoded.linear, width, height)

	assert.equal(ladder.levels.length, LADDER_LEVELS)
	assert.equal(ladder.sigmas.length, LADDER_LEVELS)

	const steps = ladderStepSigmas(width, height)
	// Reference copy of the linear-light red plane, before any blurring.
	const reference = Float64Array.from(decoded.linear.red)

	// The finest rung, level LADDER_LEVELS-1, is one blur step; its composite support is small
	// enough to sit well inside a 257-wide frame.
	let composite = [1]
	for (const size of boxSizesForSigma(steps[0])) composite = convolveKernels(composite, boxKernel(size))
	const support = (composite.length - 1) / 2
	const target = 128
	assert.ok(target - support >= 0 && target + support < width, `support ${support} fits`)

	const expectedLinear = naiveSeparableAt(reference, width, height, composite, target, target)
	// Compare in OKLab lightness, which is what the rung stores: convert the naive linear value the
	// same way, using the naive green and blue too.
	const expectedGreen = naiveSeparableAt(
		Float64Array.from(decoded.linear.green),
		width,
		height,
		composite,
		target,
		target,
	)
	const expectedBlue = naiveSeparableAt(
		Float64Array.from(decoded.linear.blue),
		width,
		height,
		composite,
		target,
		target,
	)
	const l = Math.cbrt(0.4122214708 * expectedLinear + 0.5363325363 * expectedGreen + 0.0514459929 * expectedBlue)
	const m = Math.cbrt(0.2119034982 * expectedLinear + 0.6806995451 * expectedGreen + 0.1073969566 * expectedBlue)
	const s = Math.cbrt(0.0883024619 * expectedLinear + 0.2817188376 * expectedGreen + 0.6299787005 * expectedBlue)
	const expectedL = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s

	const finest = ladder.levels[LADDER_LEVELS - 1]
	const actualL = finest.L[target * width + target]
	assert.ok(
		Math.abs(actualL - expectedL) < 1e-5,
		`naive ${expectedL} vs ladder ${actualL} (|Δ| = ${Math.abs(actualL - expectedL)})`,
	)
})

test("box widths approximate the intended Gaussian (quadrature error is bounded)", () => {
	for (const sigma of [3, 8, 20, 64]) {
		let composite = [1]
		for (const size of boxSizesForSigma(sigma)) composite = convolveKernels(composite, boxKernel(size))
		const support = (composite.length - 1) / 2

		// Second moment of the composite kernel — the variance it actually realises.
		let variance = 0
		for (let index = 0; index < composite.length; index += 1) {
			const offset = index - support
			variance += composite[index] * offset * offset
		}
		const realised = Math.sqrt(variance)
		// Two bounds, because the error has two sources and only one of them is the approximation.
		// (a) Integer-width quantisation: box variance moves in steps of (wl+1)/3, which is a few
		// percent of σ² at σ = 3 and vanishes as σ grows. The bound below is that step, halved,
		// expressed as a relative σ error — derived, not observed.
		const widths = boxSizesForSigma(sigma)
		const step = (Math.min(...widths) + 1) / 3
		assert.ok(
			Math.abs(realised - sigma) <= step / (2 * sigma) + 1e-9,
			`sigma ${sigma}: realised ${realised.toFixed(3)}, quantisation half-step ${
				(step / (2 * sigma)).toFixed(3)
			}`,
		)
		// (b) In absolute terms that quantisation is **flat in σ** — about a sixth of a pixel at every
		// scale tested, from 3 to 64 — so it matters least exactly where the ladder is coarsest.
		// Relative error: ~2% at σ = 3 and σ = 8, ~0.3% at σ = 64.
		assert.ok(
			Math.abs(realised - sigma) < 0.25,
			`sigma ${sigma}: realised ${realised.toFixed(4)} (absolute error is flat in sigma)`,
		)

		// (c) Shape, against a normalised sampled Gaussian of the **realised** sigma — which isolates
		// the box approximation from the quantisation already bounded above. Three boxes are a
		// piecewise-quadratic B-spline: more peaked and shorter-tailed than a Gaussian, by about 7%
		// of the peak and 5% of the mass. These bounds are the disclosure, not a target: they are
		// what `blur.ts` and `GAUSSIAN_BOX_PASSES` claim in prose, asserted so the claim cannot rot.
		let normaliser = 0
		const gaussian: number[] = []
		for (let offset = -support; offset <= support; offset += 1) {
			const weight = Math.exp(-(offset * offset) / (2 * realised * realised))
			gaussian.push(weight)
			normaliser += weight
		}
		let worst = 0
		let massMoved = 0
		for (let index = 0; index < composite.length; index += 1) {
			const difference = Math.abs(composite[index] - gaussian[index] / normaliser)
			worst = Math.max(worst, difference)
			massMoved += difference
		}
		assert.ok(worst / composite[support] < 0.08, `sigma ${sigma}: worst pointwise/peak ${worst / composite[support]}`)
		assert.ok(massMoved < 0.06, `sigma ${sigma}: mass moved ${massMoved}`)
	}
})

test("the ladder is geometric, coarsest first, spanning the held extent", () => {
	const sigmas = ladderSigmas(800, 1000)
	assert.equal(sigmas.length, 6)
	assert.equal(sigmas[0], 800 * LADDER_COARSEST_SHORT_EDGE_FRACTION)
	assert.ok(Math.abs(sigmas[5] - 800 * LADDER_FINEST_SHORT_EDGE_FRACTION) < 1e-9)
	for (let level = 1; level < sigmas.length; level += 1) {
		assert.ok(sigmas[level] < sigmas[level - 1], "coarsest first")
		assert.ok(Math.abs(sigmas[level - 1] / sigmas[level] - 2) < 1e-9, "factor-of-two spacing")
	}
	// Steps compose in quadrature back onto the ladder.
	const steps = ladderStepSigmas(800, 1000)
	let accumulated = 0
	for (let step = 0; step < steps.length; step += 1) {
		accumulated += steps[step] ** 2
		assert.ok(Math.abs(Math.sqrt(accumulated) - sigmas[sigmas.length - 1 - step]) < 1e-9)
	}
	// Short edge, not long edge: the ladder is scale-free in the frame's own geometry.
	assert.deepEqual(ladderSigmas(800, 1000), ladderSigmas(1000, 800))
})

// ---------------------------------------------------------------------------------------------
// 3. Semantics — synthetic images whose answer is known by construction
// ---------------------------------------------------------------------------------------------

function mean(values: Float32Array, keep: (index: number) => boolean): number {
	let total = 0
	let seen = 0
	for (let index = 0; index < values.length; index += 1) {
		if (!keep(index)) continue
		total += values[index]
		seen += 1
	}
	return seen === 0 ? Number.NaN : total / seen
}

test("a flat field is its own surround: fieldWeight ≈ 1, ink and mark ≈ 0", async () => {
	const size = 128
	const path = await writePng("flat.png", size, size, () => [67, 91, 143])
	const substrate = await buildSubstrate(path)

	const field = substrate.figureGround
	let lowest = Number.POSITIVE_INFINITY
	let highestInk = 0
	let highestMark = 0
	for (let index = 0; index < field.fieldWeight.length; index += 1) {
		lowest = Math.min(lowest, field.fieldWeight[index])
		highestInk = Math.max(highestInk, field.inkEnergy[index])
		highestMark = Math.max(highestMark, field.markEnergy[index])
	}
	assert.ok(lowest > 0.999, `lowest fieldWeight ${lowest}`)
	assert.ok(highestInk < 1e-5, `highest inkEnergy ${highestInk}`)
	assert.ok(highestMark < 1e-5, `highest markEnergy ${highestMark}`)

	// The coarsest surround of a flat field is the field colour itself.
	const expected = rgbToOkLab([67, 91, 143])
	const centre = (size / 2) * size + size / 2
	assert.ok(
		okLabDistance(
			[field.ground.L[centre], field.ground.a[centre], field.ground.b[centre]],
			expected,
		) < 1e-5,
	)
})

/** The white-lettering fixture, shared with the scale-band anchor sweep below. */
const INK_SIZE = 192
const isInkStroke = (x: number, y: number) =>
	y >= INK_SIZE / 2 - 8 && y < INK_SIZE / 2 + 8 &&
	x >= INK_SIZE / 4 && x < (3 * INK_SIZE) / 4 && Math.floor(x / 4) % 6 === 0

test("white lettering on black is ink: high inkEnergy on the strokes, low fieldWeight", async () => {
	// Thin white bars on black — the geometry of lettering without the typography. The block is kept
	// small (about 0.7% of the frame) on purpose: a cover whose ink covers half the frame genuinely
	// has an ambiguous field, and proposal §7 names exactly that case ("typography-heavy covers") as
	// one this mechanism is expected to be bad at.
	//
	// This test used to carry a second reason for the small block: that at the coarsest rung,
	// σ = shortEdge/2, the surround is nearly one number for the whole image, so *every* pixel of a
	// dark cover is displaced in lightness from it and the dark field weighed almost nothing. That
	// was W1's half of the defect SPEC directive 1 repairs, and it is gone — the coarse rungs no
	// longer enter `fieldWeight` at all (`FIELD_WEIGHT_EXCLUDED_COARSE_RUNGS`). The distant dark
	// field now reads as field rather than as marginally-less-figure, and the assertion below is
	// tightened to say so: 8× separation before the repair, 399× after.
	const size = INK_SIZE
	const isStroke = isInkStroke
	const path = await writePng(
		"ink.png",
		size,
		size,
		(x, y) => (isStroke(x, y) ? [255, 255, 255] : [0, 0, 0]),
	)
	const substrate = await buildSubstrate(path)
	const field = substrate.figureGround
	const at = (index: number) => ({ x: index % size, y: Math.floor(index / size) })

	const strokeInk = mean(field.inkEnergy, (index) => {
		const { x, y } = at(index)
		return isStroke(x, y)
	})
	const groundInk = mean(field.inkEnergy, (index) => {
		const { x, y } = at(index)
		return !isStroke(x, y) && y < size / 4
	})
	const strokeMark = mean(field.markEnergy, (index) => {
		const { x, y } = at(index)
		return isStroke(x, y)
	})
	const strokeField = mean(field.fieldWeight, (index) => {
		const { x, y } = at(index)
		return isStroke(x, y)
	})
	const farField = mean(field.fieldWeight, (index) => {
		const { x, y } = at(index)
		return y < size / 8
	})

	assert.ok(strokeInk > 0.3, `stroke inkEnergy ${strokeInk}`)
	assert.ok(strokeInk > groundInk * 3, `stroke ${strokeInk} vs distant ground ${groundInk}`)
	// Ink is lightness displacement, and a neutral stroke on a neutral field carries no chroma.
	assert.ok(strokeMark < strokeInk / 50, `stroke markEnergy ${strokeMark} vs ink ${strokeInk}`)
	assert.ok(strokeField < 0.01, `stroke fieldWeight ${strokeField}`)
	assert.ok(farField > strokeField, `distant field ${farField} should exceed stroke ${strokeField}`)
	// The repair's dark-field half, pinned: the black field is now field, not merely less figure.
	assert.ok(farField > 0.1, `distant dark field ${farField} must read as field after the repair`)
	assert.ok(
		farField > strokeField * 100,
		`field/ink separation ${farField / strokeField} (8× before the scale-band repair, 399× after)`,
	)
})

test("a saturated dot on an equal-lightness grey field is a mark: high markEnergy at the dot", async () => {
	// The dot and the field are matched in OKLab lightness to within a hundredth, so the only large
	// displacement available is chromatic. This is proposal §7's declared fragile case, built on
	// purpose.
	const size = 192
	const grey: Rgb8 = [128, 128, 128]
	const greyLab = rgbToOkLab(grey)
	let dot: Rgb8 = [255, 0, 0]
	let bestGap = Number.POSITIVE_INFINITY
	// Search the red ramp for the sample closest in lightness to the grey field. Deterministic scan,
	// no randomness (SPEC rule 1).
	for (let red = 0; red < 256; red += 1) {
		for (let green = 0; green < 256; green += 8) {
			const candidate: Rgb8 = [red, green, 0]
			const lab = rgbToOkLab(candidate)
			const chroma = Math.hypot(lab[1], lab[2])
			if (chroma < 0.1) continue
			const gap = Math.abs(lab[0] - greyLab[0])
			if (gap < bestGap) {
				bestGap = gap
				dot = candidate
			}
		}
	}
	assert.ok(bestGap < 0.005, `lightness gap ${bestGap} between dot ${dot} and grey`)

	const centre = size / 2
	const inDot = (x: number, y: number) => (x - centre) ** 2 + (y - centre) ** 2 < 14 ** 2
	const path = await writePng("mark.png", size, size, (x, y) => (inDot(x, y) ? dot : grey))
	const substrate = await buildSubstrate(path)
	const field = substrate.figureGround
	const at = (index: number) => ({ x: index % size, y: Math.floor(index / size) })

	const dotMark = mean(field.markEnergy, (index) => {
		const { x, y } = at(index)
		return inDot(x, y)
	})
	const dotInk = mean(field.inkEnergy, (index) => {
		const { x, y } = at(index)
		return inDot(x, y)
	})
	const cornerMark = mean(field.markEnergy, (index) => {
		const { x, y } = at(index)
		return x < size / 8 && y < size / 8
	})
	const dotField = mean(field.fieldWeight, (index) => {
		const { x, y } = at(index)
		return inDot(x, y)
	})
	const cornerField = mean(field.fieldWeight, (index) => {
		const { x, y } = at(index)
		return x < size / 8 && y < size / 8
	})

	assert.ok(dotMark > 0.1, `dot markEnergy ${dotMark}`)
	assert.ok(dotMark > cornerMark * 5, `dot ${dotMark} vs corner ${cornerMark}`)
	// Chroma-dominant, lightness-small: the whole definition of a mark (proposal §2.1).
	assert.ok(dotMark > dotInk * 4, `dot mark ${dotMark} vs dot ink ${dotInk}`)
	assert.ok(dotField < 0.05, `dot fieldWeight ${dotField}`)
	assert.ok(cornerField > 0.5, `corner fieldWeight ${cornerField}`)
})

test("fieldWeight is the contract's bar: displacement of exactly one bar weighs ½", async () => {
	// Two halves that differ by a known OKLab distance would be blurred together, so this checks the
	// weight formula directly on a hand-built ladder instead: one level, a constant offset.
	const size = 4
	const path = await writePng("bar.png", size, size, () => [128, 128, 128])
	const decoded = await decodePlanes(path)
	const lab = rgbToOkLab([128, 128, 128])
	const bar = SAME_COLOR_BAR_BY_REGION[colorRegion(colorFromRgb([128, 128, 128]))]
	assert.equal(sameColorBarOfOkLab(lab[0], lab[1], lab[2]), bar)

	const count = size * size
	const groundL = new Float32Array(count).fill(Math.fround(lab[0] - bar * FIELD_WEIGHT_SOFTNESS_BARS))
	const groundA = new Float32Array(count).fill(Math.fround(lab[1]))
	const groundB = new Float32Array(count).fill(Math.fround(lab[2]))
	const field = buildFigureGround(decoded.planes, {
		sigmas: [1],
		levels: [{ L: groundL, a: groundA, b: groundB }],
	})

	assert.ok(Math.abs(field.fieldWeight[0] - 0.5) < 1e-4, `weight ${field.fieldWeight[0]}`)
	assert.ok(Math.abs(field.inkEnergy[0] - bar) < 1e-4, `ink ${field.inkEnergy[0]} vs bar ${bar}`)
	assert.ok(field.markEnergy[0] < 1e-6, `mark ${field.markEnergy[0]}`)

	// And it never saturates: ten bars of displacement still carries a usable, strictly ordered
	// weight. This is the property that the Gaussian kernel destroyed (see FIELD_WEIGHT_SOFTNESS_BARS).
	const farL = new Float32Array(count).fill(Math.fround(lab[0] - bar * 10))
	const far = buildFigureGround(decoded.planes, {
		sigmas: [1],
		levels: [{ L: farL, a: groundA, b: groundB }],
	})
	assert.ok(far.fieldWeight[0] > 0, `ten bars must not underflow, got ${far.fieldWeight[0]}`)
	assert.ok(far.fieldWeight[0] < field.fieldWeight[0], "and must still be ordered below one bar")
	assert.ok(Math.abs(far.fieldWeight[0] - 1 / 101) < 1e-3, `weight at ten bars ${far.fieldWeight[0]}`)
})

// ---------------------------------------------------------------------------------------------
// 3b. The field-likeness scale band (SPEC "Integration directives — wave 2" item 1)
//
// `FIELD_WEIGHT_EXCLUDED_COARSE_RUNGS` is the constant this section is the provenance for. The
// directive names two anchors and a rule ("the smallest exclusion such that both hold"); these
// tests sweep every exclusion the six-rung ladder admits and record what each anchor actually says,
// including the fact that one of them says nothing. Read the constant's doc comment beside them.
// ---------------------------------------------------------------------------------------------

/** A full-frame vertical grey ramp, `from` at row 0 to `to` at the last row. */
async function rampSubstrateParts(from: number, to: number, size = 256) {
	const path = await writePng(`ramp-${from}-${to}.png`, size, size, (_x, y) => {
		const value = Math.round(from + ((to - from) * y) / (size - 1))
		return [value, value, value]
	})
	const decoded = await decodePlanes(path)
	return { decoded, ladder: buildSurroundLadder(decoded.linear, size, size), size }
}

function rowMean(weights: Float32Array, width: number, row: number): number {
	let total = 0
	for (let x = 0; x < width; x += 1) total += weights[row * width + x]
	return total / width
}

/** Anchor (a) as the directive states it: middle-rows weight over end-rows weight, bar 2×. */
function rampEndRatio(weights: Float32Array, size: number): number {
	const ends = (rowMean(weights, size, 0) + rowMean(weights, size, size - 1)) / 2
	const middle = (rowMean(weights, size, size / 2 - 1) + rowMean(weights, size, size / 2)) / 2
	return middle / ends
}

/** Every exclusion the six-rung ladder admits, 5 being the degenerate one-rung end of the sweep. */
const EXCLUSION_SWEEP = [0, 1, 2, 3, 4, 5] as const

test("anchor (b): white-on-black text weighs ≈0 as field at every exclusion, and the dark field recovers", async () => {
	const size = INK_SIZE
	const path = await writePng(
		"anchor-ink.png",
		size,
		size,
		(x, y) => (isInkStroke(x, y) ? [255, 255, 255] : [0, 0, 0]),
	)
	const decoded = await decodePlanes(path)
	const ladder = buildSurroundLadder(decoded.linear, size, size)
	const at = (index: number) => ({ x: index % size, y: Math.floor(index / size) })

	// Measured 2026-08-04. Quoted in `FIELD_WEIGHT_EXCLUDED_COARSE_RUNGS`; asserted here so the
	// quote cannot rot. Tolerances are wide enough to survive float32 drift and narrow enough that
	// a changed mechanism fails.
	const expected = [
		{ stroke: 3.877e-4, field: 3.099e-3 },
		{ stroke: 4.527e-4, field: 4.921e-3 },
		{ stroke: 5.769e-4, field: 2.299e-1 },
		{ stroke: 7.711e-4, field: 1.0 },
		{ stroke: 1.348e-3, field: 1.0 },
		{ stroke: 3.369e-3, field: 1.0 },
	]

	for (const excluded of EXCLUSION_SWEEP) {
		const figureGround = buildFigureGround(decoded.planes, ladder, excluded)
		const stroke = mean(figureGround.fieldWeight, (index) => {
			const { x, y } = at(index)
			return isInkStroke(x, y)
		})
		const field = mean(figureGround.fieldWeight, (index) => at(index).y < size / 8)

		// (b) holds at every exclusion — so this anchor, on its own, selects nothing. Recorded as
		// such: the directive's rule leans entirely on anchor (a), which the next test shows cannot
		// carry it.
		assert.ok(stroke < 0.01, `excluded ${excluded}: stroke fieldWeight ${stroke} is not ≈0`)
		assert.ok(
			Math.abs(stroke - expected[excluded].stroke) < expected[excluded].stroke * 0.05,
			`excluded ${excluded}: stroke ${stroke} vs recorded ${expected[excluded].stroke}`,
		)
		assert.ok(
			Math.abs(field - expected[excluded].field) < Math.max(expected[excluded].field * 0.05, 1e-4),
			`excluded ${excluded}: dark field ${field} vs recorded ${expected[excluded].field}`,
		)
	}
})

test("anchor (a): a full-frame ramp's ends never come within 2× of its middle, at any exclusion", async () => {
	// The directive's anchor (a), swept. It is measured here rather than assumed because the
	// conclusion is negative and negative conclusions are the ones that rot silently: the anchor
	// does not select a value, so the constant it was supposed to select is chosen by the geometric
	// criterion in `constants.ts` instead, and this test is what keeps that disclosure honest.
	//
	// Recorded ratios (mean fieldWeight of the middle two rows / mean of rows 0 and 255), 2026-08-04:
	//
	//   excluded |  0→255 | 30→230 | 60→200 | 100→180 | 128→200
	//          0 |   8.46 |  12.94 |  22.06 |   26.61 |   17.66
	//          1 |   6.94 |   9.78 |  13.24 |    9.55 |    5.82
	//          2 |  12.82 |  11.44 |   7.84 |    3.62 |    2.27
	//          3 |   7.69 |   4.92 |   3.09 |    1.75 |    1.32
	//          4 |   3.48 |   2.19 |   1.62 |    1.21 |    1.08
	//          5 |   2.31 |   1.34 |   1.17 |    1.05 |    1.02
	const recorded: Record<string, readonly number[]> = {
		"0-255": [8.46, 6.94, 12.82, 7.69, 3.48, 2.31],
		"30-230": [12.94, 9.78, 11.44, 4.92, 2.19, 1.34],
		"60-200": [22.06, 13.24, 7.84, 3.09, 1.62, 1.17],
		"100-180": [26.61, 9.55, 3.62, 1.75, 1.21, 1.05],
		"128-200": [17.66, 5.82, 2.27, 1.32, 1.08, 1.02],
	}

	for (const [from, to] of [[0, 255], [30, 230], [60, 200], [100, 180], [128, 200]] as const) {
		const { decoded, ladder, size } = await rampSubstrateParts(from, to)
		const key = `${from}-${to}`
		for (const excluded of EXCLUSION_SWEEP) {
			const figureGround = buildFigureGround(decoded.planes, ladder, excluded)
			const ratio = rampEndRatio(figureGround.fieldWeight, size)
			assert.ok(
				Math.abs(ratio - recorded[key][excluded]) < recorded[key][excluded] * 0.02,
				`ramp ${key}, excluded ${excluded}: ratio ${ratio.toFixed(2)} vs recorded ${recorded[key][excluded]}`,
			)
		}
	}

	// The two facts that make the anchor unusable, asserted rather than narrated.
	// 1. On a full-range ramp it fails at every exclusion, the one-rung degenerate case included.
	for (const excluded of EXCLUSION_SWEEP) {
		assert.ok(
			recorded["0-255"][excluded] > 2,
			`a 0→255 ramp is supposed to fail anchor (a) at every exclusion; excluded ${excluded} passed`,
		)
	}
	// 2. Where it does pass, it selects a different exclusion per ramp — 3, 4 or 5 — so it is a
	//    property of the fixture's contrast, not of the ladder. `constants.ts` gives the analytic
	//    form, `E ≥ log₂(0.4·ΔL_ramp / bar) − 1`. Note that none of the passing values is the
	//    shipped 2: taken literally the anchor asks for a ladder with at most one or two rungs.
	const firstPassing = (key: string) => recorded[key].findIndex((ratio) => ratio <= 2)
	assert.equal(firstPassing("0-255"), -1)
	assert.equal(firstPassing("30-230"), 5)
	assert.equal(firstPassing("60-200"), 4)
	assert.equal(firstPassing("100-180"), 3)
	assert.equal(firstPassing("128-200"), 3)

	// And the repair is real even though the anchor cannot price it: at the shipped exclusion the
	// ramp's end rows carry an order of magnitude more field weight than they did at exclusion 0,
	// which is the difference between "the ends are in Φ" and W3's measured "rows 0/255 → 0".
	const { decoded, ladder, size } = await rampSubstrateParts(0, 255)
	const before = buildFigureGround(decoded.planes, ladder, 0)
	const after = buildFigureGround(decoded.planes, ladder, FIELD_WEIGHT_EXCLUDED_COARSE_RUNGS)
	const endsBefore = (rowMean(before.fieldWeight, size, 0) + rowMean(before.fieldWeight, size, size - 1)) / 2
	const endsAfter = (rowMean(after.fieldWeight, size, 0) + rowMean(after.fieldWeight, size, size - 1)) / 2
	assert.ok(endsAfter > endsBefore * 10, `ramp ends ${endsBefore} → ${endsAfter} (want >10×)`)
})

test("the shipped exclusion is 2, and it is the rungs whose ±2σ reach exceeds the frame", () => {
	// The geometric criterion `constants.ts` states, re-derived here from the ladder itself rather
	// than quoted: a rung is excluded exactly when its kernel's ±2σ span reaches the whole short
	// edge or more. Nothing about `fieldWeight` is measured here — this pins the *reason*.
	const shortEdge = 512
	const sigmas = ladderSigmas(shortEdge, shortEdge)
	const excluded = sigmas.filter((sigma) => 4 * sigma >= shortEdge).length
	assert.equal(excluded, FIELD_WEIGHT_EXCLUDED_COARSE_RUNGS)
	assert.equal(FIELD_WEIGHT_EXCLUDED_COARSE_RUNGS, 2)
	// Scale-free: the criterion is a ratio, so it cannot depend on the frame's pixel count.
	for (const edge of [128, 300, 1000, 3000]) {
		const count = ladderSigmas(edge, edge).filter((sigma) => 4 * sigma >= edge).length
		assert.equal(count, FIELD_WEIGHT_EXCLUDED_COARSE_RUNGS, `short edge ${edge}`)
	}
})

test("the exclusion touches fieldWeight only — ink and mark still read every rung", async () => {
	// The directive's other half: "coarse rungs still serve ground/surround statistics". Perturbing
	// an excluded rung must move the energies and not the weight; perturbing a retained rung must
	// move all three. Built on a hand-made ladder so the perturbation is exact.
	const size = 8
	const path = await writePng("band.png", size, size, () => [128, 128, 128])
	const decoded = await decodePlanes(path)
	const lab = rgbToOkLab([128, 128, 128])
	const count = size * size

	const level = (offset: number) => ({
		L: new Float32Array(count).fill(Math.fround(lab[0] - offset)),
		a: new Float32Array(count).fill(Math.fround(lab[1])),
		b: new Float32Array(count).fill(Math.fround(lab[2])),
	})
	const ladderWith = (offsets: readonly number[]) => ({
		sigmas: offsets.map((_, index) => 2 ** (offsets.length - index)),
		levels: offsets.map(level),
	})

	// Four rungs, exclusion 2: rungs 0 and 1 excluded from the weight, 2 and 3 retained.
	const base = buildFigureGround(decoded.planes, ladderWith([0, 0, 0, 0]), 2)
	const coarseMoved = buildFigureGround(decoded.planes, ladderWith([0.05, 0, 0, 0]), 2)
	const fineMoved = buildFigureGround(decoded.planes, ladderWith([0, 0, 0, 0.05]), 2)

	assert.equal(coarseMoved.fieldWeight[0], base.fieldWeight[0], "an excluded rung must not move the weight")
	assert.ok(fineMoved.fieldWeight[0] < base.fieldWeight[0] * 0.5, "a retained rung must move the weight")
	// Both perturbations move the energies identically: they are ladder means over every rung.
	assert.ok(coarseMoved.inkEnergy[0] > base.inkEnergy[0], "an excluded rung must still feed inkEnergy")
	assert.ok(
		Math.abs(coarseMoved.inkEnergy[0] - fineMoved.inkEnergy[0]) < 1e-7,
		`ink is a mean over all rungs: ${coarseMoved.inkEnergy[0]} vs ${fineMoved.inkEnergy[0]}`,
	)
})

test("the exclusion is clamped so the finest rung always survives", async () => {
	// A hand-built one-rung ladder must still measure that rung, not fall through to an empty max
	// (which would return fieldWeight 1 everywhere — a silent all-field plane).
	const size = 4
	const path = await writePng("clamp.png", size, size, () => [128, 128, 128])
	const decoded = await decodePlanes(path)
	const lab = rgbToOkLab([128, 128, 128])
	const bar = SAME_COLOR_BAR_BY_REGION[colorRegion(colorFromRgb([128, 128, 128]))]
	const count = size * size
	const single = {
		sigmas: [1],
		levels: [{
			L: new Float32Array(count).fill(Math.fround(lab[0] - bar * FIELD_WEIGHT_SOFTNESS_BARS)),
			a: new Float32Array(count).fill(Math.fround(lab[1])),
			b: new Float32Array(count).fill(Math.fround(lab[2])),
		}],
	}
	for (const excluded of [0, 1, 5, 99]) {
		const field = buildFigureGround(decoded.planes, single, excluded)
		assert.ok(Math.abs(field.fieldWeight[0] - 0.5) < 1e-4, `excluded ${excluded}: weight ${field.fieldWeight[0]}`)
	}
	assert.throws(() => buildFigureGround(decoded.planes, single, -1), RangeError)
	assert.throws(() => buildFigureGround(decoded.planes, single, 1.5), RangeError)
})

// ---------------------------------------------------------------------------------------------
// 4. Refusals and determinism
// ---------------------------------------------------------------------------------------------

test("genuinely transparent input is refused loudly; a fully opaque alpha channel is not", async () => {
	const size = 8
	const transparent = await writePng(
		"transparent.png",
		size,
		size,
		(x, y) => [10, 20, 30, x === 3 && y === 3 ? 254 : 255],
	)
	await assert.rejects(
		() => buildSubstrate(transparent),
		(error: unknown) => {
			assert.ok(error instanceof SubstrateRefusal, `expected SubstrateRefusal, got ${error}`)
			assert.match((error as Error).message, /transparent/)
			return true
		},
	)

	const opaque = await writePng("opaque.png", size, size, () => [10, 20, 30, 255])
	const substrate = await buildSubstrate(opaque)
	assert.equal(substrate.planes.width, size)
	assert.equal(substrate.planes.r8[0], 10)
})

test("the same file twice produces byte-identical planes, ladder and field", async () => {
	const size = 96
	const path = await writePng("determinism.png", size, size, (x, y) => [
		(x * 3 + y) % 256,
		(x + y * 5) % 256,
		(x * y) % 256,
	])
	const first = await buildSubstrate(path)
	const second = await buildSubstrate(path)

	const same = (a: Float32Array | Uint8Array, b: Float32Array | Uint8Array, what: string) => {
		assert.equal(a.length, b.length, `${what} length`)
		for (let index = 0; index < a.length; index += 1) assert.equal(a[index], b[index], `${what}[${index}]`)
	}
	same(first.planes.L, second.planes.L, "L")
	same(first.planes.r8, second.planes.r8, "r8")
	for (let level = 0; level < LADDER_LEVELS; level += 1) {
		same(first.ladder.levels[level].L, second.ladder.levels[level].L, `ladder ${level} L`)
		same(first.ladder.levels[level].a, second.ladder.levels[level].a, `ladder ${level} a`)
		same(first.ladder.levels[level].b, second.ladder.levels[level].b, `ladder ${level} b`)
	}
	same(first.figureGround.fieldWeight, second.figureGround.fieldWeight, "fieldWeight")
	same(first.figureGround.inkEnergy, second.figureGround.inkEnergy, "inkEnergy")
	same(first.figureGround.markEnergy, second.figureGround.markEnergy, "markEnergy")
	assert.deepEqual(first.ladder.sigmas, second.ladder.sigmas)
})

test("the ground planes are the coarsest rung, by reference", async () => {
	const path = await writePng("ground.png", 64, 64, (x, y) => [x * 4, y * 4, 128])
	const substrate = await buildSubstrate(path)
	assert.equal(substrate.figureGround.ground.L, substrate.ladder.levels[0].L)
	assert.equal(substrate.figureGround.ground.a, substrate.ladder.levels[0].a)
	assert.equal(substrate.figureGround.ground.b, substrate.ladder.levels[0].b)
	assert.equal(substrate.ladder.sigmas[0], 64 * LADDER_COARSEST_SHORT_EDGE_FRACTION)
})
