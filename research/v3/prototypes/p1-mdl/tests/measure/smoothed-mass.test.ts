/**
 * Smoothed mass — the exact path against hand arithmetic, and the lattice path against the exact one.
 *
 * The second of those is the refinement-invariance check `constants.ts` promises:
 * `SMOOTHED_MASS_LATTICE_CELLS_PER_BAR` is documented with a bound saying that refining the lattice
 * cannot change a downstream argmin, and a documented bound with no instrument is an assertion. Here
 * the same image is measured at three lattice resolutions and against the exact sum, and both the
 * ranking and the values are compared.
 */

import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import { okLabDistance, rgbToOkLab } from "../../../../src/contract/color.ts"
import { SAME_COLOR_BAR_BY_REGION } from "../../../../src/contract/constants.ts"
import { bandwidthOf, measureImage, regionOfOkLab } from "../../src/measure/index.ts"
import { cleanupFixtures, writeRgbImage } from "./support.ts"

after(cleanupFixtures)

const DARK = [40, 40, 45] as const
const NEAR_DARK = [42, 42, 47] as const
const VIVID = [220, 30, 40] as const

describe("the exact path", () => {
	it("matches the two-colour kernel sum computed by hand", async () => {
		// 8×8: 48 pixels of one colour, 16 of another.
		//   m(A) = n(A)·κ(0) + n(B)·κ(d)  with κ(0) = 1 and one shared pair bandwidth
		//   m(B) = n(B)      + n(A)·κ(d)
		const path = await writeRgbImage("mass-two-colour.png", 8, 8, (x) => (x < 6 ? DARK : VIVID))
		const measurement = await measureImage(path)
		assert.equal(measurement.smoothedMass.mode, "exact")

		const labA = rgbToOkLab([...DARK])
		const labB = rgbToOkLab([...VIVID])
		const distance = okLabDistance(labA, labB)
		const bandwidth = Math.max(
			SAME_COLOR_BAR_BY_REGION[regionOfOkLab(labA)],
			SAME_COLOR_BAR_BY_REGION[regionOfOkLab(labB)],
		)
		const weight = Math.exp(-0.5 * (distance / bandwidth) ** 2)

		const [countA, countB] = Array.from(measurement.triples.counts)
		assert.deepEqual([countA, countB], [48, 16])
		assert.ok(Math.abs(measurement.smoothedMass.mass[0] - (countA + countB * weight)) < 1e-9)
		assert.ok(Math.abs(measurement.smoothedMass.mass[1] - (countB + countA * weight)) < 1e-9)
		// These two colours are far apart, so the kernel is effectively zero between them: the whole
		// 215× point of smoothing is that it moves mass between *near* colours, not distant ones.
		assert.ok(weight < 1e-6, `weight ${weight}`)
	})

	it("pools two colours that sit inside the same-colour bar", async () => {
		const path = await writeRgbImage("mass-near.png", 8, 8, (x) => (x < 4 ? DARK : NEAR_DARK))
		const measurement = await measureImage(path)

		const distance = okLabDistance(rgbToOkLab([...DARK]), rgbToOkLab([...NEAR_DARK]))
		const bandwidth = bandwidthOf(rgbToOkLab([...DARK]))
		assert.ok(distance < bandwidth, `the fixture must sit inside the bar; distance ${distance}`)

		// Each exact triple is half the image, but each *smoothed* mass is well above half, because
		// each colour borrows from its neighbour. That difference is the quantity the objective reads.
		for (let row = 0; row < 2; row += 1) {
			assert.equal(measurement.derived.massFraction[row], 0.5)
			assert.ok(
				measurement.smoothedMass.massFraction[row] > 0.6,
				`smoothed fraction ${measurement.smoothedMass.massFraction[row]}`,
			)
		}
	})
})

describe("the lattice path", () => {
	// A gradient across many distinct triples, so the lattice has real structure to reproduce.
	const paint = (x: number, y: number) => {
		const value = (x * 3 + y * 2) % 256
		return [value, (value * 5) % 256, (value * 11) % 256] as const
	}

	it("agrees with the exact sum on the same image", async () => {
		const path = await writeRgbImage("mass-lattice.png", 96, 96, paint)
		const exact = await measureImage(path)
		const lattice = await measureImage(path, { smoothedMassCellsPerBar: 4 })

		assert.equal(exact.smoothedMass.mode, "exact")
		assert.equal(lattice.smoothedMass.mode, "lattice")
		assert.equal(lattice.smoothedMass.cellsPerBar, 4)

		let worstRelative = 0
		for (let row = 0; row < exact.triples.colorCount; row += 1) {
			const reference = exact.smoothedMass.mass[row]
			const relative = Math.abs(lattice.smoothedMass.mass[row] - reference) / reference
			if (relative > worstRelative) worstRelative = relative
		}
		// The documented bound at four cells per bar is 0.78% from the centroid approximation, plus
		// truncation at four bandwidths (3.4e-4) and the tabulated kernel (5e-7).
		assert.ok(worstRelative < 0.01, `worst relative deviation ${worstRelative}`)
	})

	it("does not move the argmax when the lattice is refined", async () => {
		// The refinement-invariance claim, exercised: halving and quartering the cell must not change
		// which colour carries the most smoothed mass, nor reorder the leading colours.
		const path = await writeRgbImage("mass-refine.png", 96, 96, paint)
		const coarse = await measureImage(path, { smoothedMassCellsPerBar: 2 })
		const middle = await measureImage(path, { smoothedMassCellsPerBar: 4 })
		const fine = await measureImage(path, { smoothedMassCellsPerBar: 8 })

		const rankTop = (mass: Float64Array, count: number) =>
			Array.from({ length: count }, (_unused, row) => row)
				.sort((left, right) => mass[right] - mass[left] || left - right)
				.slice(0, 10)

		const count = coarse.triples.colorCount
		assert.deepEqual(
			rankTop(coarse.smoothedMass.mass, count),
			rankTop(fine.smoothedMass.mass, count),
			"the ten highest smoothed masses must not reorder under refinement",
		)
		assert.deepEqual(
			rankTop(middle.smoothedMass.mass, count),
			rankTop(fine.smoothedMass.mass, count),
		)

		let worstRelative = 0
		for (let row = 0; row < count; row += 1) {
			const relative =
				Math.abs(coarse.smoothedMass.mass[row] - fine.smoothedMass.mass[row]) /
				fine.smoothedMass.mass[row]
			if (relative > worstRelative) worstRelative = relative
		}
		// Refining from two cells per bar to eight moves no value by more than the coarse setting's own
		// documented bound (3.1% at a = h/2), which is what "refining changes nothing that matters"
		// means quantitatively.
		assert.ok(worstRelative < 0.031, `worst relative move under refinement ${worstRelative}`)
	})

	it("records which path ran and how it was configured", async () => {
		const path = await writeRgbImage("mass-mode.png", 64, 64, paint)
		const lattice = await measureImage(path, { smoothedMassCellsPerBar: 4 })
		assert.equal(lattice.smoothedMass.mode, "lattice")
		assert.ok((lattice.smoothedMass.occupiedCells as number) > 0)
		assert.ok((lattice.smoothedMass.cellSide as number) > 0)
		assert.equal(
			lattice.smoothedMass.truncationBandwidths,
			lattice.constants.kernelTruncationBandwidths,
		)
	})
})
