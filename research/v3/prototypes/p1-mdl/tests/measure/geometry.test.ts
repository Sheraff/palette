/**
 * The closed-form field geometries.
 *
 * The load-bearing claim is arm A §2.1's *"the ramp axis is not searched"*: the direction comes out
 * of a 2×2 eigenproblem on the per-channel position gradients. So the test builds ramps whose axis is
 * known by construction — horizontal, vertical, diagonal — and asserts the fit recovers it, plus a
 * cone whose centre is known and a wheel whose colour is a function of angle alone.
 */

import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import type { ChannelFit } from "../../src/measure/index.ts"
import { makeTFunctions, measureImage } from "../../src/measure/index.ts"
import { cleanupFixtures, writeRgbImage } from "./support.ts"

after(cleanupFixtures)

const SIZE = 64
const grey = (value: number) => {
	const clamped = Math.min(255, Math.max(0, Math.round(value)))
	return [clamped, clamped, clamped] as const
}

describe("linear geometry", () => {
	it("recovers a horizontal ramp's axis", async () => {
		const path = await writeRgbImage("ramp-horizontal.png", SIZE, SIZE, (x) => grey(x * 4))
		const { geometry } = await measureImage(path)

		assert.equal(geometry.linear.degenerate, false)
		const axis = geometry.linear.axis as readonly [number, number]
		assert.ok(Math.abs(axis[0] - 1) < 1e-9, `axis x ${axis[0]}`)
		assert.ok(Math.abs(axis[1]) < 1e-9, `axis y ${axis[1]}`)
		// A ramp that is linear in the 8-bit channel is not quite linear in OKLab, so the fit explains
		// most but not all of the variance. Below 0.9 would mean the axis was not found.
		assert.ok((geometry.linear.channels as readonly ChannelFit[])[0].rSquared > 0.9)
	})

	it("recovers a vertical ramp's axis", async () => {
		const path = await writeRgbImage("ramp-vertical.png", SIZE, SIZE, (_x, y) => grey(y * 4))
		const { geometry } = await measureImage(path)

		const axis = geometry.linear.axis as readonly [number, number]
		assert.ok(Math.abs(axis[0]) < 1e-9, `axis x ${axis[0]}`)
		assert.ok(Math.abs(axis[1] - 1) < 1e-9, `axis y ${axis[1]}`)
	})

	it("recovers a diagonal ramp's axis", async () => {
		const path = await writeRgbImage("ramp-diagonal.png", SIZE, SIZE, (x, y) => grey((x + y) * 2))
		const { geometry } = await measureImage(path)

		const axis = geometry.linear.axis as readonly [number, number]
		const expected = Math.SQRT1_2
		assert.ok(Math.abs(axis[0] - expected) < 1e-9, `axis x ${axis[0]}`)
		assert.ok(Math.abs(axis[1] - expected) < 1e-9, `axis y ${axis[1]}`)
		assert.ok(Math.abs((geometry.linear.axisAngleRadians as number) - Math.PI / 4) < 1e-9)
	})

	it("points the axis the way colour increases, whichever way the ramp was painted", async () => {
		const rising = await writeRgbImage("ramp-rising.png", SIZE, SIZE, (x) => grey(x * 4))
		const falling = await writeRgbImage("ramp-falling.png", SIZE, SIZE, (x) => grey((SIZE - 1 - x) * 4))
		const risingAxis = (await measureImage(rising)).geometry.linear.axis as readonly [number, number]
		const fallingAxis = (await measureImage(falling)).geometry.linear.axis as readonly [number, number]

		assert.ok(risingAxis[0] > 0.999)
		assert.ok(fallingAxis[0] < -0.999)
	})

	it("maps t across the full [0,1] range along the axis", async () => {
		const path = await writeRgbImage("ramp-t.png", SIZE, SIZE, (x) => grey(x * 4))
		const measurement = await measureImage(path)
		const tOf = makeTFunctions(measurement.geometry, measurement.source.shortEdge)

		assert.ok(Math.abs(tOf.linear(0, 0)) < 1e-12)
		assert.ok(Math.abs(tOf.linear(SIZE - 1, 0) - 1) < 1e-12)
		assert.ok(tOf.linear(SIZE / 2, 0) > 0.4 && tOf.linear(SIZE / 2, 0) < 0.6)
	})
})

describe("radial geometry", () => {
	it("finds the centre of a cone", async () => {
		// Colour is a function of distance from (20, 40). Normalised by the short edge, that centre
		// is at (20/64, 40/64) = (0.3125, 0.625).
		const path = await writeRgbImage("cone.png", SIZE, SIZE, (x, y) =>
			grey(Math.hypot(x - 20, y - 40) * 4),
		)
		const { geometry } = await measureImage(path)

		assert.equal(geometry.radial.degenerate, false)
		assert.equal(geometry.radial.centreFromCurvature, true)
		// A quadratic in position is not a cone, so the fitted centre is close rather than exact;
		// within a fiftieth of the short edge is a recovered centre, not a coincidence.
		assert.ok(Math.abs(geometry.radial.centre[0] - 0.3125) < 0.02, `x ${geometry.radial.centre[0]}`)
		assert.ok(Math.abs(geometry.radial.centre[1] - 0.625) < 0.02, `y ${geometry.radial.centre[1]}`)
		assert.ok(geometry.radial.tMin >= 0)
		assert.ok(geometry.radial.tMax > geometry.radial.tMin)
	})

	it("explains a cone better than the linear fit does", async () => {
		const path = await writeRgbImage("cone-compare.png", SIZE, SIZE, (x, y) =>
			grey(Math.hypot(x - 32, y - 32) * 5),
		)
		const { geometry } = await measureImage(path)
		const linearR2 = (geometry.linear.channels as readonly ChannelFit[])[0].rSquared
		const radialR2 = (geometry.radial.channels as readonly ChannelFit[])[0].rSquared
		// A centred cone has no linear trend at all, so this is the sharpest form of the comparison.
		assert.ok(radialR2 > linearR2 + 0.5, `radial ${radialR2} vs linear ${linearR2}`)
	})
})

describe("conic geometry", () => {
	it("fits a first harmonic to a colour wheel and reports its amplitude", async () => {
		const centre = (SIZE - 1) / 2
		const path = await writeRgbImage("wheel.png", SIZE, SIZE, (x, y) => {
			const angle = Math.atan2(y - centre, x - centre)
			return grey(128 + 100 * Math.cos(angle))
		})
		const { geometry } = await measureImage(path)

		assert.equal(geometry.conic.degenerate, false)
		const amplitude = geometry.conic.amplitude as readonly number[]
		assert.ok(amplitude[0] > 0.1, `lightness amplitude ${amplitude[0]}`)
		// Painted as a cosine about the centre, so the fitted phase is near zero.
		assert.ok(Math.abs((geometry.conic.phase as readonly number[])[0]) < 0.15, `phase ${(geometry.conic.phase as readonly number[])[0]}`)
		// A wheel has no radial structure, so the isotropic term finds nothing and the centre falls back
		// to the spatial centroid rather than running off outside the frame.
		assert.equal(geometry.radial.centreFromCurvature, false)
		assert.ok((geometry.conic.channels as readonly ChannelFit[])[0].rSquared > 0.9)
	})

	it("maps t to the angle around the centre, spanning [0,1]", async () => {
		const path = await writeRgbImage("wheel-t.png", SIZE, SIZE, () => grey(120))
		const measurement = await measureImage(path)
		const tOf = makeTFunctions(measurement.geometry, measurement.source.shortEdge)
		const centre = measurement.geometry.conic.centre

		const east = tOf.conic(
			(centre[0] + 0.4) * measurement.source.shortEdge,
			centre[1] * measurement.source.shortEdge,
		)
		const west = tOf.conic(
			(centre[0] - 0.4) * measurement.source.shortEdge,
			centre[1] * measurement.source.shortEdge,
		)
		assert.ok(Math.abs(east - 0.5) < 1e-9, `east ${east}`)
		assert.ok(west === 0 || Math.abs(west - 1) < 1e-9, `west ${west}`)
	})
})

describe("the (t, colour) joints", () => {
	it("account for every pixel, under every geometry", async () => {
		const path = await writeRgbImage("joint-ramp.png", SIZE, SIZE, (x, y) => grey((x + y) * 2))
		const measurement = await measureImage(path)
		const pixelCount = measurement.source.pixelCount

		for (const name of ["linear", "radial", "conic"] as const) {
			const joint = measurement.joints[name]
			const binTotal = joint.binMass.reduce((total, mass) => total + mass, 0)
			const entryTotal = joint.entryMass.reduce((total, mass) => total + mass, 0)
			assert.equal(binTotal, pixelCount, `${name} bin mass`)
			assert.equal(entryTotal, pixelCount, `${name} entry mass`)
			assert.equal(joint.binEdges.length, joint.binCount + 1)
			for (let index = 1; index < joint.binEdges.length; index += 1) {
				assert.ok(joint.binEdges[index] >= joint.binEdges[index - 1], `${name} edges ascend`)
			}
		}
	})

	it("keeps the quantile bins nearly equal in mass", async () => {
		// Quantile bins, not equal-width bins: under the radial geometry equal-width bins would put a
		// handful of pixels innermost and a quarter of the image outermost.
		const path = await writeRgbImage("joint-cone.png", SIZE, SIZE, (x, y) =>
			grey(Math.hypot(x - 32, y - 32) * 5),
		)
		const measurement = await measureImage(path)
		const joint = measurement.joints.radial
		const expected = measurement.source.pixelCount / joint.binCount
		for (let bin = 0; bin < joint.binCount; bin += 1) {
			assert.ok(
				Math.abs(joint.binMass[bin] - expected) < expected * 0.35,
				`bin ${bin} holds ${joint.binMass[bin]}, expected about ${expected}`,
			)
		}
	})

	it("puts entries in canonical (cell, bin) order", async () => {
		const path = await writeRgbImage("joint-order.png", SIZE, SIZE, (x, y) => grey((x * 3 + y) % 256))
		const measurement = await measureImage(path)
		const joint = measurement.joints.linear
		for (let index = 1; index < joint.entryCount; index += 1) {
			const ascends =
				joint.entryCell[index] > joint.entryCell[index - 1] ||
				(joint.entryCell[index] === joint.entryCell[index - 1] &&
					joint.entryBin[index] > joint.entryBin[index - 1])
			assert.ok(ascends, `entry ${index} is out of canonical order`)
		}
	})
})
