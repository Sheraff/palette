/**
 * The per-triple table, checked against arithmetic done by hand.
 *
 * Every number asserted here was computed on paper from the fixture's definition, not read off a run
 * of the code. That is the whole point of the fixtures: a flat image, a two-band image and a small
 * isolated patch have closed-form counts and moments, so the test can fail the implementation rather
 * than agree with it.
 *
 *     node --experimental-strip-types --test prototypes/p1-mdl/tests/measure/*.test.ts
 */

import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import {
	MeasureError,
	TransparentInputError,
	measureImage,
	unpackKey,
} from "../../src/measure/index.ts"
import { cleanupFixtures, writeRgbImage, writeRgbaImage } from "./support.ts"

after(cleanupFixtures)

const FLAT_COLOR = [32, 64, 96] as const
const BAND_LEFT = [10, 20, 30] as const
const BAND_RIGHT = [200, 210, 220] as const
const PATCH_BACKGROUND = [20, 20, 25] as const
const PATCH_INK = [220, 30, 40] as const

describe("per-triple table on a flat image", () => {
	it("has one triple whose count and moments are the whole grid's", async () => {
		// 4 wide, 3 high. x runs 0..3 in each of 3 rows, y runs 0..2 in each of 4 columns.
		//   Σx  = 3·(0+1+2+3)  = 18      Σy  = 4·(0+1+2)   = 12
		//   Σx² = 3·(0+1+4+9)  = 42      Σy² = 4·(0+1+4)   = 20
		//   Σxy = (Σx)·(Σy) over the product grid = 6·3 = 18
		const path = await writeRgbImage("flat-4x3.png", 4, 3, () => FLAT_COLOR)
		const measurement = await measureImage(path)

		assert.equal(measurement.triples.colorCount, 1)
		assert.equal(measurement.triples.pixelCount, 12)
		assert.deepEqual(unpackKey(measurement.triples.keys[0]), [...FLAT_COLOR])
		assert.equal(measurement.triples.counts[0], 12)
		assert.equal(measurement.triples.sumX[0], 18)
		assert.equal(measurement.triples.sumY[0], 12)
		assert.equal(measurement.triples.sumXX[0], 42)
		assert.equal(measurement.triples.sumXY[0], 18)
		assert.equal(measurement.triples.sumYY[0], 20)
	})

	it("normalises positions to the short edge, which is 3 here", async () => {
		const path = await writeRgbImage("flat-4x3-derived.png", 4, 3, () => FLAT_COLOR)
		const measurement = await measureImage(path)

		assert.equal(measurement.source.shortEdge, 3)
		assert.equal(measurement.derived.massFraction[0], 1)
		// mean x = (18/12)/3 = 0.5; mean y = (12/12)/3 = 1/3
		assert.equal(measurement.derived.meanX[0], 0.5)
		assert.ok(Math.abs(measurement.derived.meanY[0] - 1 / 3) < 1e-15)
		// var(x over {0,1,2,3}) = 1.25, then /3² ; var(y over {0,1,2}) = 2/3, then /3²
		assert.ok(Math.abs(measurement.derived.covXX[0] - 1.25 / 9) < 1e-15)
		assert.ok(Math.abs(measurement.derived.covYY[0] - 2 / 3 / 9) < 1e-15)
		// x and y are independent on a product grid, so the cross moment is exactly zero.
		assert.ok(Math.abs(measurement.derived.covXY[0]) < 1e-15)
	})

	it("puts every rung of the ladder at κ(0) = 1, so e is the full weight sum", async () => {
		// A flat image equals its own box mean at every scale, so δ = 0 and κ = 1 on all eight rungs.
		const path = await writeRgbImage("flat-8x8.png", 8, 8, () => FLAT_COLOR)
		const measurement = await measureImage(path)

		assert.equal(measurement.extent.scales.length, measurement.constants.extentLadderScales)
		assert.equal(measurement.derived.meanExtent[0], measurement.extent.weightSum)
		assert.equal(measurement.derived.varianceExtent[0], 0)
		assert.equal(measurement.extent.imageMeanE, measurement.extent.weightSum)
	})
})

describe("per-triple table on a two-band image", () => {
	it("splits the moments between the bands exactly", async () => {
		// 4×4, left half (x ∈ {0,1}) one colour, right half (x ∈ {2,3}) the other.
		//   left : Σx = 4·1 = 4,  Σx² = 4·1 = 4,   Σxy = 1·6 = 6,   Σy = 2·6 = 12, Σy² = 2·14 = 28
		//   right: Σx = 4·5 = 20, Σx² = 4·13 = 52, Σxy = 5·6 = 30,  Σy = 2·6 = 12, Σy² = 2·14 = 28
		const path = await writeRgbImage("bands-4x4.png", 4, 4, (x) => (x < 2 ? BAND_LEFT : BAND_RIGHT))
		const measurement = await measureImage(path)

		assert.equal(measurement.triples.colorCount, 2)
		// Canonical order is ascending 24-bit key, so the darker band comes first.
		assert.deepEqual(unpackKey(measurement.triples.keys[0]), [...BAND_LEFT])
		assert.deepEqual(unpackKey(measurement.triples.keys[1]), [...BAND_RIGHT])
		assert.ok(measurement.triples.keys[0] < measurement.triples.keys[1])

		assert.deepEqual(Array.from(measurement.triples.counts), [8, 8])
		assert.deepEqual(Array.from(measurement.triples.sumX), [4, 20])
		assert.deepEqual(Array.from(measurement.triples.sumY), [12, 12])
		assert.deepEqual(Array.from(measurement.triples.sumXX), [4, 52])
		assert.deepEqual(Array.from(measurement.triples.sumXY), [6, 30])
		assert.deepEqual(Array.from(measurement.triples.sumYY), [28, 28])
	})
})

describe("per-triple table with an isolated small patch", () => {
	// 32×32 background with a 3×3 patch at x ∈ {10,11,12}, y ∈ {20,21,22}.
	//   patch: n = 9, Σx = 3·33 = 99, Σy = 3·63 = 189,
	//          Σx² = 3·(100+121+144) = 1095, Σy² = 3·(400+441+484) = 3975, Σxy = 33·63 = 2079
	//   grid : Σx = Σy = 32·496 = 15872, Σx² = Σy² = 32·10416 = 333312, Σxy = 496² = 246016
	//   background = grid − patch, which is also the order-freeness check: the parts sum to the whole.
	const paint = (x: number, y: number) =>
		x >= 10 && x <= 12 && y >= 20 && y <= 22 ? PATCH_INK : PATCH_BACKGROUND

	it("counts and locates the patch exactly, and the two rows sum to the whole grid", async () => {
		const path = await writeRgbImage("patch-32x32.png", 32, 32, paint)
		const measurement = await measureImage(path)
		const { triples } = measurement

		assert.equal(triples.colorCount, 2)
		assert.deepEqual(unpackKey(triples.keys[0]), [...PATCH_BACKGROUND])
		assert.deepEqual(unpackKey(triples.keys[1]), [...PATCH_INK])

		assert.deepEqual(Array.from(triples.counts), [1024 - 9, 9])
		assert.deepEqual(Array.from(triples.sumX), [15872 - 99, 99])
		assert.deepEqual(Array.from(triples.sumY), [15872 - 189, 189])
		assert.deepEqual(Array.from(triples.sumXX), [333312 - 1095, 1095])
		assert.deepEqual(Array.from(triples.sumYY), [333312 - 3975, 3975])
		assert.deepEqual(Array.from(triples.sumXY), [246016 - 2079, 2079])
	})

	it("reads the patch as low extent and the background as high", async () => {
		// This is the extent statistic's whole job: the patch stops representing its neighbourhood
		// above its own size, so its coarse rungs contribute almost nothing, while the background
		// still is its neighbourhood at every scale.
		const path = await writeRgbImage("patch-extent.png", 32, 32, paint)
		const measurement = await measureImage(path)

		const backgroundExtent = measurement.derived.meanExtent[0]
		const patchExtent = measurement.derived.meanExtent[1]
		assert.ok(
			patchExtent < backgroundExtent,
			`patch extent ${patchExtent} should be below background extent ${backgroundExtent}`,
		)
		// The patch's three finest rungs have a one-pixel box, where κ is exactly 1, so its extent is
		// bounded below by their weights and above by the four coarse rungs being fully lost.
		const finestRungWeights = measurement.extent.scales
			.filter((scale) => scale.boxSidePixels === 1)
			.reduce((total, scale) => total + scale.weight, 0)
		assert.ok(patchExtent >= finestRungWeights - 1e-12)
		assert.ok(backgroundExtent > 1)
	})
})

describe("refusals", () => {
	it("refuses a genuinely transparent pixel, loudly and by type", async () => {
		const path = await writeRgbaImage(
			"transparent.png",
			4,
			4,
			() => FLAT_COLOR,
			(x, y) => (x === 2 && y === 1 ? 128 : 255),
		)
		await assert.rejects(
			() => measureImage(path),
			(error: unknown) => {
				assert.ok(error instanceof TransparentInputError)
				assert.ok(error instanceof MeasureError)
				assert.deepEqual(error.firstTransparentPixel, { x: 2, y: 1, alpha: 128 })
				return true
			},
		)
	})

	it("accepts an alpha channel that is uniformly opaque", async () => {
		const path = await writeRgbaImage("opaque-alpha.png", 4, 4, () => FLAT_COLOR, () => 255)
		const measurement = await measureImage(path)
		assert.equal(measurement.triples.colorCount, 1)
		assert.equal(measurement.triples.pixelCount, 16)
	})
})
