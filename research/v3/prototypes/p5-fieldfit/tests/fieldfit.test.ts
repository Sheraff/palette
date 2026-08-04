/**
 * W-FIT self-test (`SPEC.md` "Verification obligations"): a known affine ramp plus outlier marks
 * plus 1-LSB dither must recover the coefficients within tolerance and must not move under the
 * dither; a pure-noise image must trigger `noField`; a flat image must not grow a ramp.
 *
 * Every fixture is constructed in code — no image files, no decoder, no `sharp`. The raster is
 * built directly as a `DecodedRaster`, which is exactly what `fitField` consumes, so this file
 * tests the fit and nothing else.
 *
 * All "randomness" here is a fixed integer hash of the pixel index. `Math.random` appears nowhere:
 * the whole point of the mechanism is that the same bytes give the same coefficients, and a test
 * that reseeds itself each run cannot witness that.
 *
 * Run from `research/v3`:
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types --test prototypes/p5-fieldfit/tests/fieldfit.test.ts
 */

import assert from "node:assert/strict"
import test from "node:test"

import { POOLED_SAME_COLOR_BAR } from "../../../src/contract/constants.ts"
import { okLabDistance, okLabToRgb } from "../../../src/contract/color.ts"
import type { OkLab } from "../../../src/contract/types.ts"

import { normalizedX, normalizedY } from "../src/decode.ts"
import { fitField, fittedSpan } from "../src/fieldfit.ts"
import type { DecodedRaster } from "../src/types.ts"

// ---------------------------------------------------------------------------------------------
// Fixture machinery
// ---------------------------------------------------------------------------------------------

/** Deterministic 32-bit integer hash (murmur3 finalizer with Wang-style multipliers). */
function hash32(value: number): number {
	let h = value | 0
	h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
	h = Math.imul(h ^ (h >>> 15), 0x846ca68b)
	h ^= h >>> 16
	return h >>> 0
}

/** Deterministic pseudo-noise in [-1, 1). */
function signedNoise(seed: number): number {
	return (hash32(seed) / 0x1_0000_0000) * 2 - 1
}

/** Truth coefficients laid out the way `FieldFit.coefficients` is: `[intercept, coefX, coefY]` × 3. */
type Affine = readonly [number, number, number, number, number, number, number, number, number]

function affineAt(truth: Affine, x: number, y: number): OkLab {
	return [
		truth[0] + truth[1] * x + truth[2] * y,
		truth[3] + truth[4] * x + truth[5] * y,
		truth[6] + truth[7] * x + truth[8] * y,
	]
}

/**
 * Builds a `DecodedRaster` from a per-pixel colour function. `packed` is the sRGB round-trip of the
 * same colour so the fixture is a coherent raster; `fitField` reads only `lab`.
 */
function makeRaster(
	width: number,
	height: number,
	colorAt: (x: number, y: number, index: number) => OkLab,
): DecodedRaster {
	const lab = new Float32Array(width * height * 3)
	const packed = new Uint32Array(width * height)
	for (let row = 0; row < height; row += 1) {
		const y = normalizedY(row, height)
		for (let column = 0; column < width; column += 1) {
			const index = row * width + column
			const color = colorAt(normalizedX(column, width), y, index)
			lab[index * 3] = color[0]
			lab[index * 3 + 1] = color[1]
			lab[index * 3 + 2] = color[2]
			const rgb = okLabToRgb(color)
			packed[index] = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
		}
	}
	return { width, height, format: "synthetic", lab, packed }
}

/** The ramp under test: a blue-ish wash brightening left→right with a slight vertical chroma drift. */
const RAMP: Affine = [0.6, 0.18, 0.0, 0.01, 0.0, 0.06, -0.04, 0.02, -0.03]

/** The mark laid over it — one flat near-white colour, the shape a title block would have. */
const MARK: OkLab = [0.95, -0.1, 0.12]

/** A pixel carries a mark when its index hashes into the first tenth. ~10% of the image. */
function isMark(index: number): boolean {
	return hash32(index) % 10 === 0
}

/** ±1-LSB-scale OKLab dither: about 0.001 per channel, the size of one 8-bit sRGB step. */
const DITHER_AMPLITUDE = 0.001

function dithered(color: OkLab, index: number): OkLab {
	return [
		color[0] + DITHER_AMPLITUDE * signedNoise(index * 3),
		color[1] + DITHER_AMPLITUDE * signedNoise(index * 3 + 1),
		color[2] + DITHER_AMPLITUDE * signedNoise(index * 3 + 2),
	]
}

function maxCoefficientMove(first: Float64Array | Affine, second: Float64Array | Affine): number {
	let worst = 0
	for (let c = 0; c < 9; c += 1) {
		const move = Math.abs(first[c] - second[c])
		if (move > worst) worst = move
	}
	return worst
}

/** Largest OKLab distance between the field evaluated at the four corners of [-1, 1]². */
function cornerSpan(fieldAt: (x: number, y: number) => OkLab): number {
	const corners: OkLab[] = [fieldAt(-1, -1), fieldAt(1, -1), fieldAt(-1, 1), fieldAt(1, 1)]
	let worst = 0
	for (let i = 0; i < corners.length; i += 1) {
		for (let j = i + 1; j < corners.length; j += 1) {
			const distance = okLabDistance(corners[i], corners[j])
			if (distance > worst) worst = distance
		}
	}
	return worst
}

const SIZE = 128

// ---------------------------------------------------------------------------------------------
// 0. The coordinate convention the coefficients are stated in
// ---------------------------------------------------------------------------------------------

test("positions are pixel-centre normalized, shared with decode.ts", () => {
	// The fixtures below build their ramps against these helpers, so if W-CORE ever changed the
	// convention the truth coefficients would quietly change meaning. Pin it here instead.
	assert.equal(normalizedX(0, 4), -0.75)
	assert.equal(normalizedX(3, 4), 0.75)
	assert.equal(normalizedY(0, 4), -0.75)
	assert.equal(normalizedY(3, 4), 0.75)
	assert.equal(normalizedX(0, 1), 0)
})

// ---------------------------------------------------------------------------------------------
// 1. Known ramp + marks: the coefficients come back, the marks are rejected
// ---------------------------------------------------------------------------------------------

test("recovers a known affine ramp under 10% outlier marks and rejects the marks", () => {
	const raster = makeRaster(SIZE, SIZE, (x, y, index) => (isMark(index) ? MARK : affineAt(RAMP, x, y)))
	const fit = fitField(raster)

	assert.equal(fit.order, 1, "an affine ramp must be kept at order 1")

	const move = maxCoefficientMove(fit.coefficients, RAMP)
	assert.ok(move < 1e-3, `recovered coefficients must be within 1e-3 of truth, worst move ${move}`)

	let markCount = 0
	let worstMarkWeight = 0
	let leastFieldWeight = 1
	for (let index = 0; index < SIZE * SIZE; index += 1) {
		if (isMark(index)) {
			markCount += 1
			if (fit.weights[index] > worstMarkWeight) worstMarkWeight = fit.weights[index]
		} else if (fit.weights[index] < leastFieldWeight) {
			leastFieldWeight = fit.weights[index]
		}
	}
	assert.ok(worstMarkWeight < 0.1, `every mark pixel must be rejected, worst weight ${worstMarkWeight}`)
	assert.ok(leastFieldWeight > 0.9, `every field pixel must be kept, weakest weight ${leastFieldWeight}`)

	const fieldFraction = 1 - markCount / (SIZE * SIZE)
	assert.ok(
		Math.abs(fit.inlierFraction - fieldFraction) < 0.005,
		`inlierFraction ${fit.inlierFraction} must match the field fraction ${fieldFraction}`,
	)
	assert.equal(fit.noField, false)
	assert.ok(fit.marginBars > 0, `order 1 must beat order 0 on a ramp, marginBars ${fit.marginBars}`)
})

// ---------------------------------------------------------------------------------------------
// 2. The falsifier at coefficient level: ±1 LSB must not move the fit
// ---------------------------------------------------------------------------------------------

test("±1-LSB dither moves the fitted coefficients far below the pooled bar", () => {
	const clean = makeRaster(SIZE, SIZE, (x, y, index) => (isMark(index) ? MARK : affineAt(RAMP, x, y)))
	const noisy = makeRaster(SIZE, SIZE, (x, y, index) =>
		dithered(isMark(index) ? MARK : affineAt(RAMP, x, y), index),
	)

	const cleanFit = fitField(clean)
	const noisyFit = fitField(noisy)

	const tolerance = POOLED_SAME_COLOR_BAR / 10
	const moveAgainstClean = maxCoefficientMove(noisyFit.coefficients, cleanFit.coefficients)
	const moveAgainstTruth = maxCoefficientMove(noisyFit.coefficients, RAMP)
	assert.ok(
		moveAgainstClean < tolerance,
		`dither moved a coefficient by ${moveAgainstClean}, tolerance ${tolerance}`,
	)
	assert.ok(
		moveAgainstTruth < tolerance,
		`dithered fit is ${moveAgainstTruth} from truth, tolerance ${tolerance}`,
	)

	assert.equal(noisyFit.noField, false, "1-LSB dither must not destroy the field verdict")
	assert.equal(noisyFit.order, 1)
	assert.ok(
		noisyFit.residualScale < POOLED_SAME_COLOR_BAR,
		`dither-scale residual must stay under one bar, got ${noisyFit.residualScale}`,
	)
})

// ---------------------------------------------------------------------------------------------
// 3. Structureless input, and what is left of the no-field detector
// ---------------------------------------------------------------------------------------------

/**
 * **The no-field detector, and the two clauses that were tried before this one.**
 *
 * SPEC decision 9 has been ruled on three times in one day and this test carries the whole history,
 * because two of the three rulings are only legible as things that were measured and found wanting:
 *
 *  1. `σ̂ > 3 × POOLED_SAME_COLOR_BAR` fired on 11 of 20 demo-20 covers — ordinary textured
 *     photographs where the biweight had a large majority and was sitting on grain.
 *  2. `inlierFraction < 0.5` replaced it and is **unreachable**. σ̂ is 1.4826 · median(‖r‖), the MAD
 *     about zero (`updateWeights`), and a pixel is an inlier when its Tukey weight exceeds 0.5, i.e.
 *     when ‖r‖ < 0.5412 · 4.685 · σ̂ = 3.759 · median(‖r‖). Every pixel at or below the median
 *     satisfies that (median 0 ⇒ σ̂ floored ⇒ those pixels are still inliers), and at least half the
 *     pixels are at or below the median. So `inlierFraction > 0.5` **identically, for every possible
 *     image**. The first block below pins that, because a threshold that cannot fire is worse than a
 *     wrong one: it reports a clean verdict on every input forever.
 *  3. `fieldExplainedFraction < 0.5` is the current verdict, and it is a different *kind* of
 *     quantity — an absolute count of pixels within 4 bars of the field, where the radius comes from
 *     the contract and not from the residuals. That is what makes it able to fail. MAD-about-median
 *     was considered and rejected on the way: it measures dispersion, so an image whose residuals are
 *     all large but all similar would pass it.
 *
 * The second block is the detector doing its job in both directions, on inputs whose right answer is
 * not in dispute: structureless noise is not a field, a dithered flat is.
 */
test("noField reads the explained fraction; the inlier clause provably cannot fire", () => {
	// --- 1. the retired clause, pinned unreachable ------------------------------------------------
	//
	// Four shapes of "the biweight has no majority" — the worst cases anyone proposed for the inlier
	// reading. All four clear 0.5, which is the proof above showing up as data.
	const pathologies: Readonly<Record<string, (index: number) => OkLab>> = {
		"uniform noise": (index) => [
			0.5 + 0.45 * signedNoise(index * 3),
			0.25 * signedNoise(index * 3 + 1),
			0.25 * signedNoise(index * 3 + 2),
		],
		// Two far-apart colours at exactly 50/50: the classic breakdown-point tie.
		"50/50 checkerboard": (index) => (index % 2 === 0 ? [0.05, 0, 0] : [0.95, 0.3, -0.3]),
		// A 40% plurality with a 60% majority elsewhere — no colour holds half the image.
		"40/60 split": (index) => (signedNoise(index) < -0.2 ? [0.05, 0, 0] : [0.95, 0.3, -0.3]),
		// Ten equal blocks, so the largest agreeing set is a tenth of the pixels.
		"ten equal colours": (index) => [Math.floor((signedNoise(index) + 1) * 5) / 10, 0, 0],
	}
	const fits = new Map<string, ReturnType<typeof fitField>>()
	for (const [name, colorAt] of Object.entries(pathologies)) {
		const fit = fitField(makeRaster(SIZE, SIZE, (_x, _y, index) => colorAt(index)))
		fits.set(name, fit)
		assert.ok(
			fit.inlierFraction > 0.5,
			`${name}: inlierFraction ${fit.inlierFraction} — the MAD-about-zero σ̂ makes < 0.5 unreachable`,
		)
	}

	// --- 2. the live clause, both directions ------------------------------------------------------
	const noiseFit = fits.get("uniform noise")!
	assert.ok(
		noiseFit.fieldExplainedFraction < 0.01,
		`structureless noise must be almost wholly unexplained, got ${noiseFit.fieldExplainedFraction}`,
	)
	assert.equal(noiseFit.noField, true, "structureless noise must not be published as a field")
	// The σ̂ the first retired clause read is still published, and still enormous. Evidence, not a vote.
	assert.ok(
		noiseFit.residualScale > 3 * POOLED_SAME_COLOR_BAR,
		`residualScale ${noiseFit.residualScale} must still exceed 3 bars`,
	)

	const flat: OkLab = [0.52, 0.015, -0.028]
	const flatFit = fitField(makeRaster(SIZE, SIZE, (_x, _y, index) => dithered(flat, index)))
	assert.equal(
		flatFit.fieldExplainedFraction,
		1,
		`a dithered flat is explained everywhere, got ${flatFit.fieldExplainedFraction}`,
	)
	assert.equal(flatFit.noField, false, "a dithered flat is a field")

	// --- 3. where the checkerboard lands, recorded rather than forced ------------------------------
	//
	// Reported because the orchestrator asked which side it falls on, and the answer is not obvious.
	// It is `noField`, and the explained fraction is *exactly* zero: an affine surface cannot sit on
	// two far-apart colours at once, so it settles between them and is more than 4 bars from every
	// pixel in the image. Note this is the one case where the two fractions disagree completely —
	// inlierFraction 1.0 (σ̂ inflates until everything is "inlying"), explained 0.0. That contrast is
	// the whole argument for the absolute reading, so it is asserted rather than described.
	const checker = fits.get("50/50 checkerboard")!
	assert.equal(checker.fieldExplainedFraction, 0, "the checkerboard's field explains no pixel at all")
	assert.equal(checker.inlierFraction, 1, "…while every pixel counts as an inlier")
	assert.equal(checker.noField, true, "so the checkerboard is noField under the explained reading")

	// The 40/60 split is the opposite case and lands on the field side: the fit sits exactly on the
	// 60% majority colour, so that majority is explained and the verdict is a field. Recorded because
	// it is the closest thing in this file to the line the constants draw.
	const split = fits.get("40/60 split")!
	assert.ok(
		split.fieldExplainedFraction > 0.5 && split.fieldExplainedFraction < 0.65,
		`the 40/60 split should sit just above the floor, got ${split.fieldExplainedFraction}`,
	)
	assert.equal(split.noField, false)
})

// ---------------------------------------------------------------------------------------------
// 4. Flat + dither: the order selection must not hallucinate a ramp
// ---------------------------------------------------------------------------------------------

test("a flat image with dither does not grow a meaningful ramp", () => {
	const flat: OkLab = [0.52, 0.015, -0.028]
	const raster = makeRaster(SIZE, SIZE, (_x, _y, index) => dithered(flat, index))
	const fit = fitField(raster)

	const span = cornerSpan(fit.fieldAt)
	assert.ok(
		span < POOLED_SAME_COLOR_BAR,
		`fitted span across the image is ${span}, must stay under the bar ${POOLED_SAME_COLOR_BAR}`,
	)
	assert.ok(
		Math.abs(fittedSpan(fit.coefficients) - span) < 1e-12,
		"fittedSpan() must agree with the corner evaluation of fieldAt",
	)

	const centre = fit.fieldAt(0, 0)
	assert.ok(
		okLabDistance(centre, flat) < POOLED_SAME_COLOR_BAR / 10,
		`the fitted centre ${centre} must sit on the flat colour ${flat}`,
	)
	assert.equal(fit.noField, false)
	assert.ok(fit.inlierFraction > 0.95, `a dithered flat is all field, got ${fit.inlierFraction}`)
	assert.ok(
		Math.abs(fit.marginBars) < 0.01,
		`order 1 must buy essentially nothing on a flat image, marginBars ${fit.marginBars}`,
	)
})

// ---------------------------------------------------------------------------------------------
// 5. The lattice subsample path (rasters above 10^5 pixels take a stride > 1)
// ---------------------------------------------------------------------------------------------

test("the stratified lattice subsample recovers the same ramp on a large raster", () => {
	const large = 640 // 409,600 px → stride 2 → 102,400 solve samples
	const raster = makeRaster(large, large, (x, y, index) => (isMark(index) ? MARK : affineAt(RAMP, x, y)))
	const fit = fitField(raster)

	assert.equal(fit.order, 1)
	const move = maxCoefficientMove(fit.coefficients, RAMP)
	assert.ok(move < 1e-3, `subsampled fit must stay within 1e-3 of truth, worst move ${move}`)
	assert.equal(fit.weights.length, large * large, "the weight map is full resolution, not subsampled")
	assert.equal(fit.noField, false)
	assert.ok(
		Math.abs(fit.inlierFraction - 0.9) < 0.01,
		`inlierFraction ${fit.inlierFraction} must reflect the 10% mark coverage at full resolution`,
	)
})
