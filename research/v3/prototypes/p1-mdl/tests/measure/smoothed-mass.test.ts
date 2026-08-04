/**
 * Smoothed mass — the exact path against hand arithmetic, and the lattice path against the exact one.
 *
 * The second of those is the refinement-invariance check `constants.ts` promises:
 * `SMOOTHED_MASS_LATTICE_CELLS_PER_BAR` is documented with a bound saying that refining the lattice
 * cannot change a downstream argmin, and a documented bound with no instrument is an assertion. Here
 * the same image is measured at three lattice resolutions and against the exact sum, and both the
 * ranking and the values are compared.
 *
 * **Everything below is written against the truncated kernel** — `κ(δ, h) = 0` for `δ ≥ 4h`, per
 * `KERNEL_TRUNCATION_BANDWIDTHS`. That cutoff is the definition and both paths apply it, so the
 * hand arithmetic applies it too rather than comparing an untruncated hand sum against a truncated
 * implementation. The last test in this file is the one that would catch the two paths drifting
 * apart on it: its fixture is built so that untruncated and truncated differ by far more than the
 * lattice's own error, which is the only way an agreement test can distinguish "the same object" from
 * "two objects that happen to be close".
 */

import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import { okLabDistance, rgbToOkLab } from "../../../../src/contract/color.ts"
import { SAME_COLOR_BAR_BY_REGION } from "../../../../src/contract/constants.ts"
import { bandwidthOf, measureImage, regionOfOkLab } from "../../src/measure/index.ts"
import { cleanupFixtures, writeRgbImage } from "./support.ts"

after(cleanupFixtures)

/** The kernel as this module defines it: Gaussian inside the cutoff, exactly zero at and beyond it. */
function truncatedKappa(distance: number, bandwidth: number, truncationBandwidths: number): number {
	const squaredRatio = (distance / bandwidth) ** 2
	if (squaredRatio >= truncationBandwidths ** 2) return 0
	return Math.exp(-0.5 * squaredRatio)
}

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
		const weight = truncatedKappa(
			distance,
			bandwidth,
			measurement.constants.kernelTruncationBandwidths,
		)

		const [countA, countB] = Array.from(measurement.triples.counts)
		assert.deepEqual([countA, countB], [48, 16])
		assert.ok(Math.abs(measurement.smoothedMass.mass[0] - (countA + countB * weight)) < 1e-9)
		assert.ok(Math.abs(measurement.smoothedMass.mass[1] - (countB + countA * weight)) < 1e-9)
		// These two colours are far apart, so the kernel is zero between them — here by the cutoff, and
		// it would be 1e-96 without it either way. The whole 215× point of smoothing is that it moves
		// mass between *near* colours, not distant ones.
		assert.equal(weight, 0)
		assert.ok(
			distance / bandwidth > measurement.constants.kernelTruncationBandwidths,
			`distance in bandwidths ${distance / bandwidth}`,
		)
		// Both paths carry the cutoff, so the exact path reports it too rather than reporting `null`.
		assert.equal(
			measurement.smoothedMass.truncationBandwidths,
			measurement.constants.kernelTruncationBandwidths,
		)
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
		// Both paths compute the truncated kernel, so the only difference left is the lattice's own
		// centroid substitution, plus the tabulated kernel (5e-7). On this fixture that lands around
		// 3e-7. The ceiling stays at 1% because 0.78% is the *typical* centroid figure and not a
		// uniform bound — see `SMOOTHED_MASS_LATTICE_CELLS_PER_BAR`, where the corpus measurement runs
		// to 2.06% on a sparse row.
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

	it("agrees with the exact path on the truncated definition, where truncation is material", async () => {
		// One huge block of a single dark grey, plus a one-pixel-per-level ramp climbing away from it.
		// Consecutive 8-bit levels are ~0.003 apart in OKLab down here and the dark-neutral bar is
		// 0.00932, so the ramp's far end is roughly twenty bandwidths from the block. That is the shape
		// the corpus scan found the truncation on: a *rare* colour sitting just past the cutoff from a
		// *massive* one, where 4,032 pixels × 3.35e-4 is large next to the row's own handful. If the
		// exact path did not truncate, those rows would come out several percent higher than the
		// lattice's and the agreement assertion below would fail. The materiality assertion measures
		// that gap so it can never quietly shrink to nothing and leave a test passing for no reason.
		const path = await writeRgbImage("mass-truncated-definition.png", 64, 64, (x, y) => {
			if (y > 0) return [12, 12, 14] as const
			return [12 + x, 12 + x, 14 + x] as const
		})
		const exact = await measureImage(path)
		const lattice = await measureImage(path, { smoothedMassCellsPerBar: 4 })
		assert.equal(exact.smoothedMass.mode, "exact")
		assert.equal(lattice.smoothedMass.mode, "lattice")
		// The cutoff is definitional, so it is reported identically whichever path ran.
		assert.equal(
			exact.smoothedMass.truncationBandwidths,
			lattice.smoothedMass.truncationBandwidths,
		)

		// The *untruncated* sum, written out longhand: the same double sum with the cutoff removed.
		const truncationBandwidths = exact.constants.kernelTruncationBandwidths
		const { colorCount, counts, lab } = exact.triples
		const bandwidths = Array.from({ length: colorCount }, (_unused, row) =>
			bandwidthOf([lab[row * 3], lab[row * 3 + 1], lab[row * 3 + 2]]),
		)
		const untruncated = new Float64Array(colorCount)
		for (let i = 0; i < colorCount; i += 1) {
			untruncated[i] += counts[i]
			for (let j = i + 1; j < colorCount; j += 1) {
				const deltaL = lab[i * 3] - lab[j * 3]
				const deltaA = lab[i * 3 + 1] - lab[j * 3 + 1]
				const deltaB = lab[i * 3 + 2] - lab[j * 3 + 2]
				const distance = Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB)
				const bandwidth = Math.max(bandwidths[i], bandwidths[j])
				const weight = Math.exp(-0.5 * (distance / bandwidth) ** 2)
				untruncated[i] += counts[j] * weight
				untruncated[j] += counts[i] * weight
			}
		}

		let worstAgainstLattice = 0
		let worstAgainstUntruncated = 0
		for (let row = 0; row < colorCount; row += 1) {
			const reference = exact.smoothedMass.mass[row]
			worstAgainstLattice = Math.max(
				worstAgainstLattice,
				Math.abs(lattice.smoothedMass.mass[row] - reference) / reference,
			)
			worstAgainstUntruncated = Math.max(
				worstAgainstUntruncated,
				Math.abs(untruncated[row] - reference) / reference,
			)
			// Truncation only ever drops weight, so the truncated definition can never overstate a row.
			assert.ok(
				reference <= untruncated[row] + 1e-9,
				`row ${row}: truncated ${reference} exceeds untruncated ${untruncated[row]}`,
			)
		}

		// The fixture is material: dropping the cutoff moves a row by 4.1%, four orders of magnitude
		// beyond the lattice's own error here, so agreement below is agreement on *which* kernel.
		assert.ok(
			worstAgainstUntruncated > 0.01,
			`the fixture must exercise the cutoff; truncation gap ${worstAgainstUntruncated}`,
		)
		assert.ok(
			worstAgainstUntruncated > 10 * worstAgainstLattice,
			`truncation gap ${worstAgainstUntruncated} vs lattice error ${worstAgainstLattice}`,
		)
		// And the two paths agree on it, to 5e-7 here — the centroid substitution is nearly free on a
		// fixture with one colour per cell, which is exactly why the *other* lattice test above uses a
		// fixture that stresses it instead.
		assert.ok(worstAgainstLattice < 0.01, `worst exact-vs-lattice deviation ${worstAgainstLattice}`)

		// The hand kernel and the implementation are the same function, cutoff included.
		assert.equal(truncatedKappa(0, bandwidths[0], truncationBandwidths), 1)
		assert.equal(
			truncatedKappa(truncationBandwidths * bandwidths[0], bandwidths[0], truncationBandwidths),
			0,
		)
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
