/**
 * # The residual's density itself — is it still a code?
 *
 * `src/energy/aprime/chromatic.ts` replaced the residual's mass-proportional density with a chromatic
 * one (`DESIGN.md` fold item 11). The naming-gain and identity-coverage suites test what that *buys*;
 * this file tests that it is still the thing it claims to be — **a proper distribution over the
 * image's own alphabet**, and therefore a code length rather than a score.
 *
 * Three properties, each of which the module's header claims in words:
 *
 * 1. **Kraft, with equality.** `Σ_c 2^(−bits(c)) = 1` over the K distinct triples. Not `≤ 1`: the
 *    code is normalised, so any slack would be bits charged to nobody.
 * 2. **Finite and non-negative everywhere**, including on a one-colour image, where the alphabet has
 *    one symbol and the residual must cost exactly 0.
 * 3. **Mass-blind.** Two images with the same colours in different proportions have the same
 *    densities. This is the property the repair is, so it is checked against a 4× change in the
 *    proportions rather than inferred from the formula.
 */

import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import {
	ENERGY_APRIME_VERSION,
	chromaticResidual,
	energyOfAPrime,
} from "../../src/energy/aprime/index.ts"
import { measureImage } from "../../src/measure/index.ts"
import { FIXTURE_SIDE, cleanupFixtures, configuration, writeRgbImage } from "./support.ts"

after(cleanupFixtures)

const SIDE = FIXTURE_SIDE

describe("the chromatic residual is a proper code over the alphabet", () => {
	it("sums to exactly one under Kraft, on a rich fixture", async () => {
		const from: Rgb8 = [20, 25, 60]
		const to: Rgb8 = [240, 200, 120]
		const measurement = await measureImage(
			await writeRgbImage("k-ramp.png", SIDE, SIDE, (x, y): Rgb8 => [
				Math.round(from[0] + ((to[0] - from[0]) * x) / (SIDE - 1)),
				Math.round(from[1] + ((to[1] - from[1]) * (x + (y % 3))) / (SIDE - 1)),
				Math.round(from[2] + ((to[2] - from[2]) * x) / (SIDE - 1)),
			]),
		)
		const residual = chromaticResidual(measurement)

		let kraft = 0
		for (let row = 0; row < measurement.triples.colorCount; row += 1) {
			const bits = residual.bitsPerPixel[row]
			assert.ok(Number.isFinite(bits) && bits >= 0, `bits(${row}) = ${bits}`)
			kraft += 2 ** -bits
		}
		assert.ok(Math.abs(kraft - 1) < 1e-12, `Kraft sum was ${kraft}, must be exactly 1`)

		// Every occupied cell holds at least its own κ(0) = 1, so no density can be zero.
		for (let cell = 0; cell < residual.occupiedCells; cell += 1) {
			assert.ok(residual.cellDensity[cell] >= 1, `ρ(${cell}) = ${residual.cellDensity[cell]}`)
		}
	})

	it("costs exactly zero on a one-colour image, where the alphabet has one symbol", async () => {
		const only: Rgb8 = [40, 60, 90]
		const measurement = await measureImage(
			await writeRgbImage("k-flat.png", SIDE, SIDE, () => only),
		)
		const residual = chromaticResidual(measurement)
		assert.equal(residual.occupiedCells, 1)
		assert.equal(residual.log2Normaliser, 0)
		assert.equal(residual.bitsPerPixel[0], 0)
		assert.equal(
			energyOfAPrime(measurement, configuration({ background: only, foreground: only }))
				.nuisance.likelihoodBits,
			0,
		)
	})

	it("reads no mass: the same colours in different proportions give the same densities", async () => {
		const left: Rgb8 = [30, 40, 60]
		const right: Rgb8 = [210, 90, 40]
		const build = async (name: string, split: number) =>
			chromaticResidual(
				await measureImage(
					await writeRgbImage(name, SIDE, SIDE, (x) => (x < split ? left : right)),
				),
			)
		const even = await build("k-even.png", 32)
		const lopsided = await build("k-lopsided.png", 8)

		assert.equal(even.occupiedCells, lopsided.occupiedCells)
		assert.equal(even.log2Normaliser, lopsided.log2Normaliser)
		for (let row = 0; row < even.bitsPerPixel.length; row += 1) {
			assert.equal(even.bitsPerPixel[row], lopsided.bitsPerPixel[row])
		}
	})

	it("states its own version, which the emitter previously carried as a literal", () => {
		assert.equal(ENERGY_APRIME_VERSION, "p1ap-energy-0.2.0")
	})
})
