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

import { okLabDistance, okLabToRgb, rgbToOkLab } from "../../../src/contract/color.ts"
import { POOLED_SAME_COLOR_BAR } from "../../../src/contract/constants.ts"
import type { OkLab, Rgb8 } from "../../../src/contract/types.ts"
import { normalizedX, normalizedY, packRgb } from "../src/decode.ts"
import { fieldAtCoefficients } from "../src/fieldfit.ts"
import { readRamp } from "../src/ramp.ts"
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

test("bent three-colour path: the third stop is accepted at the bend and stays monotone", () => {
	const width = 192
	const height = 24
	const start = rgbToOkLab(BEND_START)
	const middle = rgbToOkLab(BEND_MIDDLE)
	const end = rgbToOkLab(BEND_END)

	// The artwork densely occupies the two-segment OKLab path start→middle→end. The colour at a
	// column is the polyline sampled there, quantised to 8 bits.
	const pathColorAt = (column: number): Rgb8 => {
		const u = column / (width - 1)
		const [from, to, local] = u < 0.5
			? [start, middle, u / 0.5]
			: [middle, end, (u - 0.5) / 0.5]
		return okLabToRgb([
			from[0] + (to[0] - from[0]) * local,
			from[1] + (to[1] - from[1]) * local,
			from[2] + (to[2] - from[2]) * local,
		])
	}
	const { raster, inventory } = buildImage(width, height, (column) => pathColorAt(column))

	// Guard the fixture: if any path colour left the sRGB gamut, the quantised artwork would no
	// longer lie on the polyline and this test would be measuring gamut clipping instead.
	let worstRoundTrip = 0
	for (let column = 0; column < width; column++) {
		const u = column / (width - 1)
		const [from, to, local] = u < 0.5
			? [start, middle, u / 0.5]
			: [middle, end, (u - 0.5) / 0.5]
		const wanted: OkLab = [
			from[0] + (to[0] - from[0]) * local,
			from[1] + (to[1] - from[1]) * local,
			from[2] + (to[2] - from[2]) * local,
		]
		worstRoundTrip = Math.max(worstRoundTrip, okLabDistance(wanted, rgbToOkLab(pathColorAt(column))))
	}
	assert.ok(worstRoundTrip < 0.005, `fixture path must stay in gamut (worst ${worstRoundTrip})`)

	// The order-1 fit of a bent path is the chord between its ends — which is exactly why the
	// straight two-stop ramp misses the artwork in the middle.
	const origin: OkLab = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2]
	const step = difference(end, start).map((value) => value / 2) as [number, number, number]
	const fit = affineFit(origin, step, [0, 0, 0], filledWeights(width, height))
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
