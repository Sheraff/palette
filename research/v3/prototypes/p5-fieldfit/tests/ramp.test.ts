/**
 * W-READ self-tests for `src/ramp.ts` — the SPEC's verification obligation for this module:
 * *"known ramp orientation and a known two-block image (excursion unfixable → fallback)"*, plus the
 * bend case that the third stop exists for.
 *
 * Every fixture is synthetic and constructed here: the raster, the inventory and the `FieldFit` are
 * all literals, so each test has a right answer that is known *before* the module runs rather than
 * read back out of it. `fitField` is deliberately not used — a test whose expectation comes from
 * the neighbouring module under development is testing agreement, not correctness.
 *
 * Run from `research/v3`:
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types --test prototypes/p5-fieldfit/tests/ramp.test.ts
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
	colorFromRgb,
	okLabDistance,
	okLabToRgb,
	rgbToHex,
	rgbToOkLab,
} from "../../../src/contract/color.ts"
import { POOLED_SAME_COLOR_BAR } from "../../../src/contract/constants.ts"
import type { OkLab, Rgb8 } from "../../../src/contract/types.ts"
import { normalizedX, normalizedY, packRgb } from "../src/decode.ts"
import { fieldAtCoefficients } from "../src/fieldfit.ts"
import {
	excursionResolution,
	guideStopRefusal,
	pathExcursion,
	pathToPolylineExcursion,
	projectionFraction,
	rampContinuity,
	readRamp,
	readRampDetailed,
	STOP_SPACING_MIN_FRACTION,
} from "../src/ramp.ts"
import type { DecodedRaster, FieldFit, Inventory, TripleStats } from "../src/types.ts"

// ---------------------------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------------------------

/** Build a raster and its exact-triple inventory from a per-pixel colour function. */
function buildImage(
	width: number,
	height: number,
	colorAt: (column: number, row: number) => Rgb8,
): { raster: DecodedRaster; inventory: Inventory } {
	const lab = new Float32Array(width * height * 3)
	const packed = new Uint32Array(width * height)
	const accumulators = new Map<number, { rgb: Rgb8; count: number; sumX: number; sumY: number }>()

	for (let row = 0; row < height; row++) {
		for (let column = 0; column < width; column++) {
			const index = row * width + column
			const rgb = colorAt(column, row)
			const key = packRgb(rgb)
			packed[index] = key
			const okLab = rgbToOkLab(rgb)
			lab[index * 3] = okLab[0]
			lab[index * 3 + 1] = okLab[1]
			lab[index * 3 + 2] = okLab[2]
			const existing = accumulators.get(key)
			const x = normalizedX(column, width)
			const y = normalizedY(row, height)
			if (existing) {
				existing.count += 1
				existing.sumX += x
				existing.sumY += y
			} else {
				accumulators.set(key, { rgb, count: 1, sumX: x, sumY: y })
			}
		}
	}

	const triples = new Map<number, TripleStats>()
	for (const [key, entry] of accumulators) {
		triples.set(key, {
			packed: key,
			rgb: entry.rgb,
			lab: rgbToOkLab(entry.rgb),
			count: entry.count,
			sumX: entry.sumX,
			sumY: entry.sumY,
		})
	}

	return {
		raster: { width, height, format: "synthetic", lab, packed },
		inventory: { triples, has: (key: number) => triples.has(key), totalPixels: width * height },
	}
}

/** An order-1 `FieldFit` literal: `f(x, y) = origin + x·slopeX + y·slopeY`. */
function affineFit(
	origin: OkLab,
	slopeX: readonly [number, number, number],
	slopeY: readonly [number, number, number],
	weights: Float32Array,
): FieldFit {
	const coefficients = new Float64Array([
		origin[0], slopeX[0], slopeY[0],
		origin[1], slopeX[1], slopeY[1],
		origin[2], slopeX[2], slopeY[2],
	])
	return {
		order: 1,
		coefficients,
		fieldAt: (x: number, y: number) => fieldAtCoefficients(coefficients, x, y),
		weights,
		inlierFraction: 1,
		// A synthetic ramp sits on its own field by construction. `readRamp` reads neither of these,
		// but `FieldFit` requires both.
		fieldExplainedFraction: 1,
		residualScale: 0.001,
		marginBars: 4,
		noField: false,
	}
}

function constantFit(color: OkLab, weights: Float32Array, noField = false): FieldFit {
	const coefficients = new Float64Array([color[0], 0, 0, color[1], 0, 0, color[2], 0, 0])
	return {
		order: 0,
		coefficients,
		fieldAt: (x: number, y: number) => fieldAtCoefficients(coefficients, x, y),
		weights,
		inlierFraction: 1,
		// `noField` is passed in directly by these fixtures, so the fraction is set to agree with it
		// rather than left to imply a different verdict from the one under test.
		fieldExplainedFraction: noField ? 0 : 1,
		residualScale: 0.001,
		marginBars: 0,
		noField,
	}
}

function filledWeights(width: number, height: number, value = 1): Float32Array {
	return new Float32Array(width * height).fill(value)
}

function halfSpaceWeights(
	width: number,
	height: number,
	direction: readonly [number, number],
	lowWeight: number,
	highWeight: number,
): Float32Array {
	const weights = new Float32Array(width * height)
	for (let row = 0; row < height; row++) {
		for (let column = 0; column < width; column++) {
			const t = direction[0] * normalizedX(column, width) +
				direction[1] * normalizedY(row, height)
			weights[row * width + column] = t < 0 ? lowWeight : highWeight
		}
	}
	return weights
}

function difference(a: OkLab, b: OkLab): [number, number, number] {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

/** Recover the ramp parameter t a target corresponds to, given the ramp's own colour axis. */
function recoverT(target: OkLab, origin: OkLab, step: readonly [number, number, number]): number {
	const delta = difference(target, origin)
	const lengthSquared = step[0] ** 2 + step[1] ** 2 + step[2] ** 2
	return (delta[0] * step[0] + delta[1] * step[1] + delta[2] * step[2]) / lengthSquared
}

// ---------------------------------------------------------------------------------------------
// Fixture colours
// ---------------------------------------------------------------------------------------------

const DEEP_BLUE: Rgb8 = [30, 45, 150]
const PALE_SAND: Rgb8 = [235, 214, 170]
const BLOCK_RED: Rgb8 = [214, 38, 44]
const BLOCK_BLUE: Rgb8 = [32, 54, 196]
const BEND_START: Rgb8 = [60, 90, 200]
const BEND_MIDDLE: Rgb8 = [90, 190, 90]
const BEND_END: Rgb8 = [230, 210, 80]

// ---------------------------------------------------------------------------------------------
// 0. Degenerate readings
// ---------------------------------------------------------------------------------------------

test("order-0 and noField fits read flat: one target, no stops, no gradient", () => {
	const size = 16
	const { raster, inventory } = buildImage(size, size, () => DEEP_BLUE)
	const constant = rgbToOkLab(DEEP_BLUE)

	for (const noField of [false, true]) {
		const fit = noField
			// A noField verdict on an order-1 fit must still read flat, at the fit's constant.
			? { ...constantFit(constant, filledWeights(size, size), true), order: 1 as const }
			: constantFit(constant, filledWeights(size, size))
		const reading = readRamp(fit, raster, inventory)

		assert.equal(reading.gradientCandidate, false, `gradientCandidate (noField=${noField})`)
		assert.equal(reading.direction, null)
		assert.deepEqual(reading.backgroundTarget, constant)
		assert.deepEqual(reading.surfaceTarget, constant)
		assert.deepEqual(reading.stops, [])
		assert.equal(reading.excursionMax, 0)
		assert.equal(reading.thirdStopAccepted, false)
		assert.equal(reading.twoBlockFallback, false)
	}
})

// ---------------------------------------------------------------------------------------------
// 1. Known linear ramp: direction, robust ends, stops
// ---------------------------------------------------------------------------------------------

test("known linear ramp: direction recovers the truth and the ends are the robust extremes", () => {
	const size = 128
	const truth: [number, number] = [0.6, 0.8]
	const background = rgbToOkLab(DEEP_BLUE)
	const surface = rgbToOkLab(PALE_SAND)
	// f(x, y) = mid + (truth·(x, y))·step — a rank-1 affine field whose right singular vector is
	// exactly `truth`, so the direction has an analytic answer independent of the raster.
	const mid: OkLab = [
		(background[0] + surface[0]) / 2,
		(background[1] + surface[1]) / 2,
		(background[2] + surface[2]) / 2,
	]
	const step = difference(surface, background).map((value) => value / 2) as [number, number, number]
	const slopeX = step.map((value) => value * truth[0]) as [number, number, number]
	const slopeY = step.map((value) => value * truth[1]) as [number, number, number]

	const { raster, inventory } = buildImage(size, size, (column, row) => {
		const t = truth[0] * normalizedX(column, size) + truth[1] * normalizedY(row, size)
		return okLabToRgb([mid[0] + step[0] * t, mid[1] + step[1] * t, mid[2] + step[2] * t])
	})
	const fit = affineFit(mid, slopeX, slopeY, filledWeights(size, size))
	const reading = readRamp(fit, raster, inventory)

	assert.ok(reading.direction, "direction present for an order-1 fit")
	// Uniform weights ⇒ the median sits at the centre ⇒ near-tie ⇒ the darker end is background,
	// which is the low-t end here, so the published direction is +truth.
	assert.ok(Math.abs(reading.orientationMargin) <= 1, `near-tie margin ${reading.orientationMargin}`)
	assert.ok(Math.abs(reading.direction[0] - truth[0]) < 1e-3, `dx = ${reading.direction[0]}`)
	assert.ok(Math.abs(reading.direction[1] - truth[1]) < 1e-3, `dy = ${reading.direction[1]}`)
	assert.ok(
		reading.backgroundTarget[0] < reading.surfaceTarget[0],
		"near-tie orientation puts the darker end at background",
	)

	// Analytic 2nd/98th percentile of t = 0.6x + 0.8y over the pixel square. The tail beyond t₀ is a
	// corner triangle of area (tMax − t₀)² / (2·0.6·0.8) against a square of area (2·extent)², so
	// t₀ = tMax − √(0.02 · 4 · extent² · 2 · 0.6 · 0.8).
	const extent = 1 - 1 / size
	const tMax = (truth[0] + truth[1]) * extent
	const expected = tMax - Math.sqrt(0.02 * 4 * extent * extent * 2 * truth[0] * truth[1])
	const tBackground = recoverT(reading.backgroundTarget, mid, step)
	const tSurface = recoverT(reading.surfaceTarget, mid, step)
	assert.ok(Math.abs(tBackground + expected) < 0.02, `t(background) = ${tBackground}, want ${-expected}`)
	assert.ok(Math.abs(tSurface - expected) < 0.02, `t(surface) = ${tSurface}, want ${expected}`)
	// Robust, not extremal: strictly inside the image extent, and not by a token amount.
	assert.ok(Math.abs(tSurface) < tMax * 0.95 && Math.abs(tSurface) > tMax * 0.6)

	// A smooth in-gamut ramp is on-artwork everywhere: two stops, no third, no fallback.
	assert.equal(reading.gradientCandidate, true)
	assert.equal(reading.stops.length, 2)
	assert.deepEqual(reading.stops[0], { target: reading.backgroundTarget, position: 0 })
	assert.deepEqual(reading.stops[1], { target: reading.surfaceTarget, position: 1 })
	assert.ok(
		reading.excursionMax <= POOLED_SAME_COLOR_BAR,
		`excursionMax ${reading.excursionMax} must stay under the bar for an on-artwork ramp`,
	)
	assert.equal(reading.thirdStopAccepted, false)
	assert.equal(reading.residualExcursion, reading.excursionMax)
	assert.equal(reading.twoBlockFallback, false)
})

test("orientation: background is the end the inlier mass leans toward, both signs", () => {
	const size = 96
	const truth: [number, number] = [0.6, 0.8]
	const background = rgbToOkLab(DEEP_BLUE)
	const surface = rgbToOkLab(PALE_SAND)
	const mid: OkLab = [
		(background[0] + surface[0]) / 2,
		(background[1] + surface[1]) / 2,
		(background[2] + surface[2]) / 2,
	]
	const step = difference(surface, background).map((value) => value / 2) as [number, number, number]
	const slopeX = step.map((value) => value * truth[0]) as [number, number, number]
	const slopeY = step.map((value) => value * truth[1]) as [number, number, number]
	const { raster, inventory } = buildImage(size, size, (column, row) => {
		const t = truth[0] * normalizedX(column, size) + truth[1] * normalizedY(row, size)
		return okLabToRgb([mid[0] + step[0] * t, mid[1] + step[1] * t, mid[2] + step[2] * t])
	})

	// Mass on the low-t side ⇒ the low-t end is the larger field ⇒ background sits there, and the
	// published direction points background → surface, i.e. +truth.
	const lowHeavy = readRamp(
		affineFit(mid, slopeX, slopeY, halfSpaceWeights(size, size, truth, 1, 0.2)),
		raster,
		inventory,
	)
	assert.ok(lowHeavy.orientationMargin < -1, `margin ${lowHeavy.orientationMargin} must be decisive`)
	assert.ok(recoverT(lowHeavy.backgroundTarget, mid, step) < 0, "background at the low-t end")
	assert.ok(recoverT(lowHeavy.surfaceTarget, mid, step) > 0, "surface at the high-t end")
	assert.ok(lowHeavy.direction && lowHeavy.direction[0] > 0 && lowHeavy.direction[1] > 0)

	// The mirror image: mass on the high-t side flips both the roles and the direction.
	const highHeavy = readRamp(
		affineFit(mid, slopeX, slopeY, halfSpaceWeights(size, size, truth, 0.2, 1)),
		raster,
		inventory,
	)
	assert.ok(highHeavy.orientationMargin > 1, `margin ${highHeavy.orientationMargin} must be decisive`)
	assert.ok(recoverT(highHeavy.backgroundTarget, mid, step) > 0, "background at the high-t end")
	assert.ok(recoverT(highHeavy.surfaceTarget, mid, step) < 0, "surface at the low-t end")
	assert.ok(highHeavy.direction && highHeavy.direction[0] < 0 && highHeavy.direction[1] < 0)
	// Both readings still span most of the ramp. They do not span *the same* interval: the ends are
	// weighted quantiles, so down-weighting one side pulls that side's 2%/98% point inward. That is
	// the robustness working, not a disagreement about the ramp.
	const fullSpan = okLabDistance(rgbToOkLab(DEEP_BLUE), rgbToOkLab(PALE_SAND))
	for (const reading of [lowHeavy, highHeavy]) {
		const span = okLabDistance(reading.backgroundTarget, reading.surfaceTarget)
		assert.ok(span > 0.5 * fullSpan, `ends span ${span} of a ${fullSpan} ramp`)
	}
})

// ---------------------------------------------------------------------------------------------
// 2. Two-block cover: the excursion no polyline can fix
// ---------------------------------------------------------------------------------------------

test("two-block red/blue: chord leaves the artwork, no third stop rescues it, fallback taken", () => {
	const size = 64
	const red = rgbToOkLab(BLOCK_RED)
	const blue = rgbToOkLab(BLOCK_BLUE)
	// 60/40 split so the field-mass ranking is unambiguous: red is the larger block.
	const boundary = Math.round(size * 0.6)
	const { raster, inventory } = buildImage(size, size, (column) =>
		column < boundary ? BLOCK_RED : BLOCK_BLUE)
	assert.equal(inventory.triples.size, 2, "the artwork has no middle colour, by construction")

	// The affine fit a robust estimator lands on for a hard two-block cover: it spans the two blocks
	// across x, and its straight OKLab chord runs through purples the artwork does not contain.
	const mid: OkLab = [(red[0] + blue[0]) / 2, (red[1] + blue[1]) / 2, (red[2] + blue[2]) / 2]
	const step = difference(blue, red).map((value) => value / 2) as [number, number, number]
	const fit = affineFit(mid, step, [0, 0, 0], filledWeights(size, size))
	const reading = readRamp(fit, raster, inventory)

	assert.ok(
		reading.excursionMax > POOLED_SAME_COLOR_BAR,
		`excursionMax ${reading.excursionMax} must exceed the bar ${POOLED_SAME_COLOR_BAR}`,
	)
	// Both occupied colours are the chord's own endpoints: neither projects strictly between the
	// ends, so neither is an admissible middle stop, and nothing else exists to try.
	assert.equal(reading.thirdStopAccepted, false)
	assert.equal(reading.residualExcursion, reading.excursionMax)
	assert.equal(reading.twoBlockFallback, true)
	assert.equal(reading.gradientCandidate, false)
	assert.deepEqual(reading.stops, [])
	// The two returned targets are the block colours themselves, heavier block first.
	assert.deepEqual(reading.backgroundTarget, red)
	assert.deepEqual(reading.surfaceTarget, blue)
})

// ---------------------------------------------------------------------------------------------
// 3. A genuine bend: the one admissible reason to add a third stop
// ---------------------------------------------------------------------------------------------

/**
 * The artwork densely occupies the two-segment OKLab path `BEND_START → BEND_MIDDLE → BEND_END`; the
 * colour at a column is that polyline sampled there, quantised to 8 bits. The order-1 fit of a bent
 * path is the chord between its ends, which is exactly why the straight two-stop ramp misses the
 * artwork — and, since v0.7.1, misses the field's own colour path — in the middle.
 */
function bentPathScene(): {
	raster: DecodedRaster
	inventory: Inventory
	fit: FieldFit
	start: OkLab
	middle: OkLab
	end: OkLab
} {
	const width = 192
	const height = 24
	const start = rgbToOkLab(BEND_START)
	const middle = rgbToOkLab(BEND_MIDDLE)
	const end = rgbToOkLab(BEND_END)

	const pathAt = (u: number): OkLab => {
		const [from, to, local] = u < 0.5
			? [start, middle, u / 0.5]
			: [middle, end, (u - 0.5) / 0.5]
		return interpolate(from, to, local)
	}
	const pathColorAt = (column: number): Rgb8 => okLabToRgb(pathAt(column / (width - 1)))
	const { raster, inventory } = buildImage(width, height, (column) => pathColorAt(column))

	// Guard the fixture: if any path colour left the sRGB gamut, the quantised artwork would no
	// longer lie on the polyline and the tests would be measuring gamut clipping instead.
	let worstRoundTrip = 0
	for (let column = 0; column < width; column++) {
		worstRoundTrip = Math.max(
			worstRoundTrip,
			okLabDistance(pathAt(column / (width - 1)), rgbToOkLab(pathColorAt(column))),
		)
	}
	assert.ok(worstRoundTrip < 0.005, `fixture path must stay in gamut (worst ${worstRoundTrip})`)

	const origin: OkLab = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2]
	const step = difference(end, start).map((value) => value / 2) as [number, number, number]
	return {
		raster,
		inventory,
		fit: affineFit(origin, step, [0, 0, 0], filledWeights(width, height)),
		start,
		middle,
		end,
	}
}

test("bent three-colour path: the third stop is accepted at the bend and stays monotone", () => {
	const { raster, inventory, fit, start, middle, end } = bentPathScene()
	const reading = readRamp(fit, raster, inventory)

	assert.equal(reading.gradientCandidate, true)
	assert.ok(
		reading.excursionMax > POOLED_SAME_COLOR_BAR,
		`excursionMax ${reading.excursionMax} must exceed the bar before the third stop`,
	)
	assert.equal(reading.thirdStopAccepted, true, "a bend with an occupied vertex must be rescued")
	assert.equal(reading.twoBlockFallback, false)
	assert.ok(
		reading.residualExcursion < POOLED_SAME_COLOR_BAR,
		`residualExcursion ${reading.residualExcursion} must fall under the bar`,
	)
	assert.ok(reading.residualExcursion < reading.excursionMax / 2, "and be a real reduction")

	assert.equal(reading.stops.length, 3)
	const [first, interior, last] = reading.stops
	assert.equal(first.position, 0)
	assert.equal(last.position, 1)
	assert.ok(interior.position > 0 && interior.position < 1, `interior at ${interior.position}`)
	assert.deepEqual(first.target, reading.backgroundTarget)
	assert.deepEqual(last.target, reading.surfaceTarget)
	// The stop landed on the actual bend, not on some meandering point of the path.
	assert.ok(
		okLabDistance(interior.target, middle) < 0.03,
		`interior stop ${JSON.stringify(interior.target)} should sit at the bend`,
	)
	// And it is an artwork colour, not an invention.
	assert.ok(inventory.has(packRgb(okLabToRgb(interior.target))), "interior stop is occupied")
	// Darker end is background under the near-tie rule: the blue end, i.e. the low-t end.
	assert.ok(okLabDistance(reading.backgroundTarget, start) < 0.03, "background at the blue end")
	assert.ok(okLabDistance(reading.surfaceTarget, end) < 0.03, "surface at the yellow end")
})

// ---------------------------------------------------------------------------------------------
// 4. v0.6 — the t-continuity discriminator (SPEC decision 5, ruling 2026-08-05)
// ---------------------------------------------------------------------------------------------

/**
 * The discriminator's own unit test: same two fixtures, opposite answers, measured directly rather
 * than inferred from which branch `readRamp` took.
 *
 * The quantity is the inlier mass sitting in the chord's middle third, over the inlier mass inside
 * the chord's span. A ramp that is travelled from end to end puts a third of its mass there — a
 * uniformly travelled ramp puts *exactly* a third — and two blocks put none, because every pixel of
 * either block projects onto its own end. The gap between the two synthetic answers (0.33 versus
 * 0.00) is the whole basis of the threshold, and the two real anchors named in `SPEC.md` sit inside
 * it at 0.298 and 0.094.
 */
test("t-continuity: a travelled ramp fills the middle band, two blocks leave it empty", () => {
	const size = 96
	const truth: [number, number] = [0.6, 0.8]
	const background = rgbToOkLab(DEEP_BLUE)
	const surface = rgbToOkLab(PALE_SAND)
	const mid: OkLab = [
		(background[0] + surface[0]) / 2,
		(background[1] + surface[1]) / 2,
		(background[2] + surface[2]) / 2,
	]
	const step = difference(surface, background).map((value) => value / 2) as [number, number, number]
	const slopeX = step.map((value) => value * truth[0]) as [number, number, number]
	const slopeY = step.map((value) => value * truth[1]) as [number, number, number]
	const ramp = buildImage(size, size, (column, row) => {
		const t = truth[0] * normalizedX(column, size) + truth[1] * normalizedY(row, size)
		return okLabToRgb([mid[0] + step[0] * t, mid[1] + step[1] * t, mid[2] + step[2] * t])
	})
	const rampFit = affineFit(mid, slopeX, slopeY, filledWeights(size, size))
	const rampReading = readRamp(rampFit, ramp.raster, ramp.inventory)
	const continuous = rampContinuity(
		rampFit,
		ramp.raster,
		rampReading.backgroundTarget,
		rampReading.surfaceTarget,
	)
	// A ramp travelled at constant speed puts **at least** a third of its mass in the middle third,
	// and this fixture puts more: t = 0.6x + 0.8y projects a square onto a diagonal, whose density is
	// a tent rather than a uniform, so the middle is over-represented. 1/3 is the floor for a
	// travelled ramp, not its value — which is why the threshold is set at half of it and not at it.
	assert.ok(
		continuous.middleBandMass > 1 / 3 && continuous.middleBandMass < 0.6,
		`middle-band mass ${continuous.middleBandMass} should exceed the uniform 1/3 on a diagonal ramp`,
	)
	assert.equal(continuous.bimodal, false)
	// The chord's span covers essentially the whole field: nothing projects outside the ends.
	assert.ok(continuous.spanMassFraction > 0.95, `span mass ${continuous.spanMassFraction}`)

	const blockSize = 64
	const boundary = Math.round(blockSize * 0.6)
	const blocks = buildImage(blockSize, blockSize, (column) =>
		column < boundary ? BLOCK_RED : BLOCK_BLUE)
	const red = rgbToOkLab(BLOCK_RED)
	const blue = rgbToOkLab(BLOCK_BLUE)
	const blockMid: OkLab = [(red[0] + blue[0]) / 2, (red[1] + blue[1]) / 2, (red[2] + blue[2]) / 2]
	const blockStep = difference(blue, red).map((value) => value / 2) as [number, number, number]
	const blockFit = affineFit(blockMid, blockStep, [0, 0, 0], filledWeights(blockSize, blockSize))
	const bimodal = rampContinuity(blockFit, blocks.raster, red, blue)
	assert.equal(bimodal.middleBandMass, 0, "two blocks put nothing between their ends")
	assert.equal(bimodal.bimodal, true)

	// And the branch `readRamp` took on the same fixture agrees with the measurement: since the
	// ruling, bimodal t-mass is the *only* route to the two-block fallback.
	const blockReading = readRampDetailed(blockFit, blocks.raster, blocks.inventory)
	assert.equal(blockReading.reading.twoBlockFallback, true)
	assert.ok(blockReading.continuity !== null, "the discriminator was consulted")
	assert.equal(blockReading.continuity.bimodal, true)
})

// ---------------------------------------------------------------------------------------------
// 5. v0.6 — guide stops above the bar, and the flattest path among ties
// ---------------------------------------------------------------------------------------------

/**
 * A two-lobe artwork: the colours run `START → P → Q → END`, with `P` three bars off the chord on
 * one side and `Q` one bar off it on the other. This is the shape the ruling of 2026-08-05 is about.
 * One stop can straighten the big lobe and nothing can straighten both, so the best polyline lands
 * **above the bar** and reduces the excursion by well under 2× — the `≥2×` prong would have refused
 * it and published a two-block reading of a cover that is plainly one travelled path.
 *
 * `normal` is the component of a third colour perpendicular to the chord, so the two lobe heights
 * are honest OKLab distances from the chord rather than distances along it.
 */
/**
 * The chord `BEND_START`→`BEND_END` and a **unit normal perpendicular to it**, in the plane the
 * chord spans with `BEND_MIDDLE`. Perpendicular matters: the lobe heights below are meant to be
 * OKLab distances *from the chord*, and a normal with a component along the chord would move the
 * vertex along the ramp instead of off it.
 */
function chordFrame(): {
	start: OkLab
	end: OkLab
	axis: [number, number, number]
	centre: OkLab
	normal: [number, number, number]
} {
	const start = rgbToOkLab(BEND_START)
	const end = rgbToOkLab(BEND_END)
	const toward = rgbToOkLab(BEND_MIDDLE)
	const axis = difference(end, start)
	const axisLength = Math.hypot(axis[0], axis[1], axis[2])
	const axisHat = axis.map((value) => value / axisLength) as [number, number, number]
	const centre: OkLab = [
		(start[0] + end[0]) / 2,
		(start[1] + end[1]) / 2,
		(start[2] + end[2]) / 2,
	]
	const raw = difference(toward, centre)
	const along = raw[0] * axisHat[0] + raw[1] * axisHat[1] + raw[2] * axisHat[2]
	const perpendicular = raw.map((value, index) => value - along * axisHat[index])
	const perpendicularLength = Math.hypot(perpendicular[0], perpendicular[1], perpendicular[2])
	return {
		start,
		end,
		axis,
		centre,
		normal: perpendicular.map((value) => value / perpendicularLength) as [number, number, number],
	}
}

/** `start + along·axis + across·normal`, as a tuple — the OKLab shape is built, never asserted. */
function vertexAt(
	start: OkLab,
	axis: readonly [number, number, number],
	along: number,
	normal: readonly [number, number, number],
	across: number,
): OkLab {
	return [
		start[0] + along * axis[0] + across * normal[0],
		start[1] + along * axis[1] + across * normal[1],
		start[2] + along * axis[2] + across * normal[2],
	]
}

/** Straight-line interpolation between two OKLab values. */
function interpolate(from: OkLab, to: OkLab, u: number): OkLab {
	return [
		from[0] + (to[0] - from[0]) * u,
		from[1] + (to[1] - from[1]) * u,
		from[2] + (to[2] - from[2]) * u,
	]
}

function twoLobeScene(): {
	raster: DecodedRaster
	inventory: Inventory
	fit: FieldFit
	start: OkLab
	end: OkLab
} {
	const { start, end, axis, centre, normal } = chordFrame()

	const uP = 0.35
	const uQ = 0.75
	const P = vertexAt(start, axis, uP, normal, 3 * POOLED_SAME_COLOR_BAR)
	const Q = vertexAt(start, axis, uQ, normal, -POOLED_SAME_COLOR_BAR)
	const vertices: readonly OkLab[] = [start, P, Q, end]
	const breaks = [0, uP, uQ, 1]
	const at = (u: number): OkLab => {
		let segment = 0
		while (segment < 2 && u > breaks[segment + 1]) segment += 1
		const local = (u - breaks[segment]) / (breaks[segment + 1] - breaks[segment])
		return interpolate(vertices[segment], vertices[segment + 1], local)
	}

	const width = 240
	const height = 24
	const colorAt = (column: number): Rgb8 => okLabToRgb(at(column / (width - 1)))
	const { raster, inventory } = buildImage(width, height, (column) => colorAt(column))

	// Guard the fixture: if any path colour left the sRGB gamut the artwork would no longer lie on
	// the path, and the test would be measuring gamut clipping instead of a bend.
	let worstRoundTrip = 0
	for (let column = 0; column < width; column += 1) {
		worstRoundTrip = Math.max(
			worstRoundTrip,
			okLabDistance(at(column / (width - 1)), rgbToOkLab(colorAt(column))),
		)
	}
	assert.ok(worstRoundTrip < 0.005, `fixture path must stay in gamut (worst ${worstRoundTrip})`)

	// The order-1 fit of a wandering path is the chord between its ends, which is why the straight
	// two-stop ramp misses the artwork in the middle.
	const step = axis.map((value) => value / 2) as [number, number, number]
	return {
		raster,
		inventory,
		fit: affineFit(centre, step, [0, 0, 0], filledWeights(width, height)),
		start,
		end,
	}
}

/** Turning angle at `middle`, recomputed in the test rather than imported: 0 is a straight path. */
function turnAt(from: OkLab, middle: OkLab, to: OkLab): number {
	const incoming = difference(middle, from)
	const outgoing = difference(to, middle)
	const norms = Math.hypot(incoming[0], incoming[1], incoming[2]) *
		Math.hypot(outgoing[0], outgoing[1], outgoing[2])
	if (norms <= 0) return 0
	const dot = incoming[0] * outgoing[0] + incoming[1] * outgoing[1] + incoming[2] * outgoing[2]
	return Math.acos(Math.min(1, Math.max(-1, dot / norms)))
}

test("guide stop: a reduction that stays above the bar is accepted and its residual published", () => {
	const { raster, inventory, fit } = twoLobeScene()
	const { reading, continuity } = readRampDetailed(fit, raster, inventory)

	assert.ok(continuity !== null, "the chord left the artwork, so the discriminator ran")
	assert.equal(continuity.bimodal, false, "a travelled two-lobe path is one field, not two blocks")
	assert.equal(reading.twoBlockFallback, false)
	assert.equal(reading.gradientCandidate, true)

	assert.ok(
		reading.excursionMax > POOLED_SAME_COLOR_BAR,
		`excursionMax ${reading.excursionMax} must exceed the bar`,
	)
	assert.equal(reading.thirdStopAccepted, true, "a guide stop that reduces the excursion is kept")
	assert.equal(reading.stops.length, 3)
	const interior = reading.stops[1]
	assert.ok(interior.position > 0 && interior.position < 1, `monotone: ${interior.position}`)
	assert.ok(inventory.has(packRgb(okLabToRgb(interior.target))), "the stop is an artwork colour")

	// The point of the ruling: the residual is **still above the bar** and the stop is kept anyway.
	assert.ok(
		reading.residualExcursion > POOLED_SAME_COLOR_BAR,
		`residual ${reading.residualExcursion} is meant to stay above the bar on this fixture`,
	)
	assert.ok(reading.residualExcursion < reading.excursionMax, "and it is a real reduction")
	// And the reduction is under 2×, so the prong deleted on 2026-08-05 would have refused this exact
	// stop and taken the two-block fallback. This assertion is the regression the ruling asked for.
	assert.ok(
		reading.residualExcursion * 2 > reading.excursionMax,
		`reduction ${reading.excursionMax / reading.residualExcursion}× must be under 2× for this ` +
			`fixture to exercise the deleted prong`,
	)
})

test("guide stop: ties within the measurement's resolution go to the flattest path", () => {
	const { raster, inventory, fit } = twoLobeScene()
	const { reading } = readRampDetailed(fit, raster, inventory)
	assert.equal(reading.stops.length, 3)
	const from = reading.backgroundTarget
	const to = reading.surfaceTarget
	const published = reading.stops[1].target

	// The raw argmin over every monotone occupied colour — what "best" would mean with no tolerance.
	let lowest: { lab: OkLab; hex: string; excursion: number } | null = null
	for (const triple of inventory.triples.values()) {
		const position = projectionFraction(from, to, triple.lab)
		if (!(position > 0 && position < 1)) continue
		const excursion = pathExcursion(inventory, [from, triple.lab, to])
		if (lowest === null || excursion < lowest.excursion) {
			lowest = { lab: triple.lab, hex: rgbToHex(triple.rgb), excursion }
		}
	}
	assert.ok(lowest !== null, "the fixture has monotone candidates")

	// The published stop is *not* that argmin, is indistinguishable from it at the resolution the
	// argmin's own polyline was measured at, and is flatter. That is the tie-break, in three lines.
	assert.ok(
		reading.residualExcursion > lowest.excursion,
		`published ${reading.residualExcursion} should not be the raw argmin ${lowest.excursion}`,
	)
	const resolution = excursionResolution([from, lowest.lab, to])
	assert.ok(
		reading.residualExcursion <= lowest.excursion + resolution,
		`published excursion ${reading.residualExcursion} must sit inside the argmin's measurement ` +
			`resolution (${lowest.excursion} + ${resolution})`,
	)
	assert.ok(
		turnAt(from, published, to) < turnAt(from, lowest.lab, to),
		`the published stop must turn less than the argmin ${lowest.hex}`,
	)
})

// ---------------------------------------------------------------------------------------------
// 6. v0.6 — continuous, above the bar, and no stop helps: the ramp is still the reading
// ---------------------------------------------------------------------------------------------

test("a continuous ramp no stop can fix publishes the straight ramp, never the two-block fallback", () => {
	// An S-curve: one lobe out and one lobe back, so a single monotone stop cannot straighten both
	// and no candidate reduces the excursion at all. Before the ruling this fell into the two-block
	// fallback — the mistake the discriminator exists to stop, on a cover whose mass is continuous.
	const { start, end, axis, centre, normal } = chordFrame()
	const lobe = 0.04
	const first = vertexAt(start, axis, 1 / 3, normal, 3 * lobe)
	const second = vertexAt(start, axis, 2 / 3, normal, -3 * lobe)
	const bezier = (u: number, k: 0 | 1 | 2): number =>
		(1 - u) ** 3 * start[k] + 3 * u * (1 - u) ** 2 * first[k] +
		3 * u * u * (1 - u) * second[k] + u ** 3 * end[k]
	const at = (u: number): OkLab => [bezier(u, 0), bezier(u, 1), bezier(u, 2)]

	const width = 192
	const height = 24
	const colorAt = (column: number): Rgb8 => okLabToRgb(at(column / (width - 1)))
	const { raster, inventory } = buildImage(width, height, (column) => colorAt(column))
	let worstRoundTrip = 0
	for (let column = 0; column < width; column += 1) {
		worstRoundTrip = Math.max(
			worstRoundTrip,
			okLabDistance(at(column / (width - 1)), rgbToOkLab(colorAt(column))),
		)
	}
	assert.ok(worstRoundTrip < 0.005, `fixture path must stay in gamut (worst ${worstRoundTrip})`)

	const step = axis.map((value) => value / 2) as [number, number, number]
	const fit = affineFit(centre, step, [0, 0, 0], filledWeights(width, height))
	const { reading, continuity } = readRampDetailed(fit, raster, inventory)

	assert.ok(continuity !== null && !continuity.bimodal, "an S-curve is one travelled path")
	assert.ok(reading.excursionMax > POOLED_SAME_COLOR_BAR, `excursion ${reading.excursionMax}`)
	assert.equal(reading.thirdStopAccepted, false, "no monotone stop reduces this excursion")
	assert.equal(reading.twoBlockFallback, false, "and the fallback is not what happens instead")
	assert.equal(reading.gradientCandidate, true)
	assert.equal(reading.stops.length, 2)
	// The residual is published rather than hidden behind a refusal: that is the ruling's own phrase.
	assert.equal(reading.residualExcursion, reading.excursionMax)
})

// ---------------------------------------------------------------------------------------------
// 7. v0.7.1 — SPEC decision 17: the ramp-path excursion is what decides a stop
// ---------------------------------------------------------------------------------------------

/**
 * **Why `g(t)` is empirical.** Decision 17 says the excursion runs from "the component's fitted colour
 * path". Read as *the affine surface evaluated along the ramp coordinate*, that path is
 * `c + t·(B d)` — linear in `t`, i.e. **exactly the chord**, for every image, with excursion
 * identically zero and no stop ever admissible. This test pins that so the reading in `ramp.ts`'s
 * header cannot be quietly re-litigated: it is not a preference between two constructions, it is that
 * one of them is empty. `fittedColourPath` uses arm-f §2.6's own definition instead (bin the
 * field-weighted pixels along `t`, take the robust colour per bin), which is what the tests below
 * exercise.
 */
test("decision 17's literal reading is vacuous: the affine field along the ramp axis IS the chord", () => {
	const origin: OkLab = [0.5, 0.02, -0.03]
	const slopeX: [number, number, number] = [0.21, -0.05, 0.11]
	const slopeY: [number, number, number] = [-0.07, 0.13, 0.04]
	const fit = affineFit(origin, slopeX, slopeY, filledWeights(4, 4))
	const direction: [number, number] = [0.6, 0.8]

	const at = (t: number): OkLab => fit.fieldAt(t * direction[0], t * direction[1])
	const ends: [OkLab, OkLab] = [at(-1), at(1)]
	for (let step = 0; step <= 20; step += 1) {
		const t = -1 + (2 * step) / 20
		const sample = at(t)
		// Distance from the sample to the segment between the two ends, the same measurement the
		// excursion makes. Zero to floating-point noise, at every t.
		const excursion = pathToPolylineExcursion([sample], ends).max
		assert.ok(excursion < 1e-12, `fieldAt at t=${t} sits ${excursion} off its own chord`)
	}
})

test("guideStopRefusal states decision 17's three stop-side conjuncts", () => {
	const background = colorFromRgb(BEND_START)
	const surface = colorFromRgb(BEND_END)
	const middle = colorFromRgb(BEND_MIDDLE)

	// (c) monotone in t — the stop must project strictly between the ends.
	assert.equal(guideStopRefusal(0, middle, background, surface), "monotone")
	assert.equal(guideStopRefusal(1, middle, background, surface), "monotone")
	assert.equal(guideStopRefusal(-0.2, middle, background, surface), "monotone")
	assert.equal(guideStopRefusal(1.4, middle, background, surface), "monotone")

	// (d) the spacing floor, on both sides, and its two boundaries (inclusive).
	assert.equal(guideStopRefusal(0.05, middle, background, surface), "spacing")
	assert.equal(guideStopRefusal(0.95, middle, background, surface), "spacing")
	assert.equal(guideStopRefusal(STOP_SPACING_MIN_FRACTION, middle, background, surface), null)
	assert.equal(guideStopRefusal(1 - STOP_SPACING_MIN_FRACTION, middle, background, surface), null)
	// The floor sits above the cross-arm banding complaint it is anchored to (3.1% of the ramp).
	assert.ok(
		STOP_SPACING_MIN_FRACTION > 0.031,
		`the floor must exceed the 3.1% spacing the reviewer called "very significant banding"`,
	)

	// (b) it must carry a colour the endpoints do not.
	assert.equal(guideStopRefusal(0.5, background, background, surface), "endpoint-colour")
	assert.equal(guideStopRefusal(0.5, surface, background, surface), "endpoint-colour")
	// One LSB off an end is still that end, by the calibrated formula rather than by equality.
	const nearlyBackground = colorFromRgb([BEND_START[0] + 1, BEND_START[1], BEND_START[2]])
	assert.equal(guideStopRefusal(0.5, nearlyBackground, background, surface), "endpoint-colour")

	// Admissible: mid-ramp, and a colour neither end carries.
	assert.equal(guideStopRefusal(0.5, middle, background, surface), null)
})

test("a bent path asks for a stop, and the stop carries a colour the endpoints do not", () => {
	const { raster, inventory, fit, middle } = bentPathScene()
	const { reading, path } = readRampDetailed(fit, raster, inventory)

	assert.ok(path !== null, "a published ramp always measures its own path")
	assert.ok(
		path.chordExcursion > POOLED_SAME_COLOR_BAR,
		`the chord must leave the field's colour path (${path.chordExcursion / POOLED_SAME_COLOR_BAR} bars)`,
	)
	assert.equal(reading.thirdStopAccepted, true)
	assert.equal(reading.stops.length, 3)

	// (a) it reduces the path excursion, by more than the measurement's own precision.
	assert.ok(
		path.publishedExcursion + path.precision < path.chordExcursion,
		`published ${path.publishedExcursion} must beat the chord's ${path.chordExcursion}`,
	)
	// …and on a fixture whose path is exactly two straight segments, all the way under the bar.
	assert.ok(
		path.publishedExcursion < POOLED_SAME_COLOR_BAR,
		`a path that IS a two-segment polyline must be followed to under the bar, got ` +
			`${path.publishedExcursion / POOLED_SAME_COLOR_BAR} bars`,
	)

	const stop = reading.stops[1]
	// (b) the stop carries a colour the endpoints do not, and (c)/(d) it is monotone and spaced.
	assert.equal(
		guideStopRefusal(
			stop.position,
			colorFromRgb(okLabToRgb(stop.target)),
			colorFromRgb(okLabToRgb(reading.backgroundTarget)),
			colorFromRgb(okLabToRgb(reading.surfaceTarget)),
		),
		null,
	)
	// And it is the bend itself — an artwork colour, not an invention.
	assert.ok(okLabDistance(stop.target, middle) < 0.03, "the stop sits at the bend")
	assert.ok(inventory.has(packRgb(okLabToRgb(stop.target))), "the stop is an occupied triple")
})

/**
 * **The straight path: two stops, even where the chord leaves the artwork.** This is the case that
 * separates decision 17's quantity from the one it replaces. The artwork is a ramp travelled from end
 * to end with a **hole punched in its colour coverage** near the middle: the field's own colour path
 * is dead straight (every field pixel sits on the chord), but the chord passes more than a bar from
 * any occupied colour where the hole is. The old deciding quantity — polyline to nearest occupied
 * colour — reads that as an excursion to be fixed. Decision 17's reads it as what it is: a fact about
 * how densely the picture samples its own ramp, and nothing an interpolation can lead anywhere.
 */
function holedRampScene(): { raster: DecodedRaster; inventory: Inventory; fit: FieldFit } {
	const { start, end, axis, centre } = chordFrame()
	// u ∈ [0, 0.46] ∪ [0.54, 1] of the chord: the middle 8% is never occupied.
	const at = (u: number): OkLab => interpolate(start, end, u < 0.5 ? u * 0.92 : 0.08 + u * 0.92)
	const width = 240
	const height = 24
	const colorAt = (column: number): Rgb8 => okLabToRgb(at(column / (width - 1)))
	const { raster, inventory } = buildImage(width, height, (column) => colorAt(column))
	const step = axis.map((value) => value / 2) as [number, number, number]
	return { raster, inventory, fit: affineFit(centre, step, [0, 0, 0], filledWeights(width, height)) }
}

test("a straight path publishes two stops even where the chord leaves the artwork", () => {
	const { raster, inventory, fit } = holedRampScene()
	const { reading, continuity, path } = readRampDetailed(fit, raster, inventory)

	// The cover is one travelled ramp, so the two-block fallback is not in play.
	assert.ok(continuity !== null && !continuity.bimodal, "a holed ramp is still one travelled path")
	assert.equal(reading.twoBlockFallback, false)
	assert.equal(reading.gradientCandidate, true)

	// The **old** deciding quantity says the chord leaves the artwork…
	assert.ok(
		reading.excursionMax > POOLED_SAME_COLOR_BAR,
		`occupied-colour excursion ${reading.excursionMax} must exceed the bar for this test to bite`,
	)
	// …and the **new** one says the chord is exactly where the field's colours are.
	assert.ok(path !== null)
	assert.ok(
		path.chordExcursion <= POOLED_SAME_COLOR_BAR,
		`path excursion ${path.chordExcursion / POOLED_SAME_COLOR_BAR} bars must stay under the bar`,
	)
	assert.equal(reading.thirdStopAccepted, false, "nothing to lead the interpolation through")
	assert.equal(reading.stops.length, 2)
	// The occupied-colour residual is still measured and still published: it is the "stays on-artwork"
	// half of the doctrine, now a report rather than a decision.
	assert.equal(reading.residualExcursion, reading.excursionMax)
})

/**
 * **The two-lobe fixture, reconciled.** Pass 10 built it for decision 5's ruling: the colours run
 * `START → P → Q → END` with `P` three bars off the chord and `Q` one bar off it on the other side,
 * so one stop straightens the big lobe, nothing straightens both, and the best polyline lands *above*
 * the bar. Under the old deciding quantity it was accepted because the polyline came closer to the
 * artwork's occupied colours; under decision 17 it is accepted because the polyline comes closer to
 * **the field's own path** — measured 2.94 bars → 1.81 bars — and the published vertex moves by one
 * 8-bit step (`#7a9d9d` → `#799d9d`). The fixture's point survives the change of quantity intact,
 * which is the reconciliation the ruling asks for: the two criteria agree on a genuinely travelled
 * path, and they part company only where the artwork's colour *coverage* and the field's colour
 * *route* disagree (the holed ramp above).
 */
test("the two-lobe fixture is accepted by the path quantity, with its residual still above the bar", () => {
	const { raster, inventory, fit } = twoLobeScene()
	const { reading, path } = readRampDetailed(fit, raster, inventory)

	assert.ok(path !== null)
	assert.equal(reading.thirdStopAccepted, true)
	assert.ok(
		path.chordExcursion > POOLED_SAME_COLOR_BAR,
		`path excursion ${path.chordExcursion / POOLED_SAME_COLOR_BAR} bars must exceed the bar`,
	)
	assert.ok(
		path.publishedExcursion + path.precision < path.chordExcursion,
		"the stop reduces the path excursion beyond the measurement's precision",
	)
	// Above the bar and kept anyway — decision 5's ruling of 2026-08-05, which decision 17 does not
	// disturb: the residual is published, not refused.
	assert.ok(
		path.publishedExcursion > POOLED_SAME_COLOR_BAR,
		`residual path excursion ${path.publishedExcursion} is meant to stay above the bar here`,
	)
	assert.ok(
		reading.residualExcursion > POOLED_SAME_COLOR_BAR,
		"and so is the occupied-colour residual the sidecar publishes",
	)
})
