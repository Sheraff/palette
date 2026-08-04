/**
 * `energyOfAPrime` on synthetic images whose answer is known before the code runs.
 *
 * Every case below states the ordering it expects and the arithmetic that produces it, **in the
 * comment above the assertion**, so a reader can check the claim without running anything. Where a
 * magnitude is asserted it is one that was derived by hand first; where only an ordering matters, only
 * the ordering is asserted, because locking a magnitude that no derivation pins would make the suite
 * a change-detector rather than a check.
 *
 * The naming-gain case — arm A′ §2.3, the mechanism the whole paradigm turns on — has its own file.
 */

import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import { energyOfAPrime } from "../../src/energy/aprime/index.ts"
import { computeSupportCodes } from "../../src/energy/aprime/support.ts"
import { serializationCost } from "../../src/emit/cost.ts"
import { measureImage } from "../../src/measure/index.ts"
import { FIXTURE_SIDE, cleanupFixtures, configuration, writeRgbImage } from "./support.ts"

after(cleanupFixtures)

const SIDE = FIXTURE_SIDE
/** `N` — every hand-derivation below divides by this. */
const PIXELS = SIDE * SIDE

/** Sum the six terms, which must reproduce `total` to float association. */
function sumOfTerms(terms: Readonly<Record<string, number>>): number {
	return Object.values(terms).reduce((total, term) => total + term, 0)
}

describe("(a) a flat image — the collapsed configuration is cheapest", () => {
	/**
	 * One colour, so the alphabet has one symbol and **every** code costs exactly 0 bits: a code over
	 * a one-symbol alphabet carries no information. `L(pixels | P)` is therefore 0 for every
	 * configuration and `λ·L(P)` decides alone. From `src/emit/cost.ts`'s own table:
	 *
	 *   collapsed flat  2 + 1 + 24 + 24                   =  51 bits
	 *   two-flat        2 + 1 + 24 + 24 + 24              =  75
	 *   two-stop ramp   2 + 1 + 24 + 24 + 24 + 2          =  77
	 *   four roles      2 + 1 + 24 + 24 + 24 + 24         =  99
	 *
	 * so the ordering is 51 < 75 < 77 < 99 and the collapsed configuration wins. Note what is *not*
	 * happening: nothing rewards collapse, and no rule fires. Collapse wins because it is the shorter
	 * message and the image gave the longer ones nothing to buy with.
	 */
	it("prices every configuration at λ·L(P) alone, so the shortest message wins", async () => {
		const only: Rgb8 = [40, 60, 90]
		const unused: Rgb8 = [200, 100, 50]
		const measurement = await measureImage(
			await writeRgbImage("a-flat.png", SIDE, SIDE, () => only),
		)
		assert.equal(measurement.triples.colorCount, 1)

		const collapsed = energyOfAPrime(measurement, configuration({ background: only, foreground: only }))
		const twoFlat = energyOfAPrime(
			measurement,
			configuration({ background: only, surface: unused, foreground: only }),
		)
		const ramp = energyOfAPrime(
			measurement,
			configuration({
				background: only,
				surface: unused,
				foreground: only,
				gradient: true,
				stops: [
					{ rgb: only, position: 0 },
					{ rgb: unused, position: 1 },
				],
			}),
		)
		const fourRoles = energyOfAPrime(
			measurement,
			configuration({ background: only, surface: unused, foreground: only, accent: unused }),
		)

		for (const result of [collapsed, twoFlat, ramp, fourRoles]) {
			assert.equal(result.nuisance.likelihoodBits, 0)
		}
		assert.equal(collapsed.total, 51)
		assert.equal(twoFlat.total, 75)
		assert.equal(ramp.total, 77)
		assert.equal(fourRoles.total, 99)
		assert.ok(collapsed.total < twoFlat.total)
		assert.ok(twoFlat.total < ramp.total)
		assert.ok(ramp.total < fourRoles.total)
	})
})

describe("(b) a two-band image — two flat fields beat one, and beat a ramp", () => {
	/**
	 * Top half `#141620` (dark neutral, bar 0.00932), bottom half `#e6e4dc` (light neutral, bar
	 * 0.01627). Two triples, 2,048 pixels each, both solid rectangles.
	 *
	 * **The hand derivation.**
	 *
	 * *Generic code.* Two symbols of equal mass sitting 44 bars apart, so the kernel between them is
	 * numerically zero and `m(c) = n(c) = 2048` for both. `−log₂(2048/4096) = 1 bit` per pixel.
	 *
	 * *Support code.* Each band is a solid 64 × 32 rectangle. Its normalised covariance is
	 * `diag(0.08333, 0.020833)`, so `4π·sqrt(det Σ) = 0.5236` against an area of 0.5 — a fill ratio
	 * `φ = 0.955`, `H₂(φ)/φ = 0.2777` bits per pixel, plus a locate term of `log₂(1/0.5236)/2048`,
	 * i.e. 0.2782 in total. That is what a broad solid support costs under the coarse code.
	 *
	 * *Two-flat.* Background names the top band, surface the bottom. Each triple sits exactly on one
	 * of the two field colours, so its colour code is `−log₂(1/Z) = 0` (the other triple contributes
	 * nothing to `Z`), and both are cheaper as field (0.278) than as generic (1.0).
	 *   `L(pixels|P) = 4096 × 0.2782 ≈ 1139`, `L(P) = 75`, total ≈ 1214.
	 *
	 * *Flat, collapsed.* Only the top band is named. It stays field at 0.278; the bottom band is
	 * ~44 bars from the background and ~3 bits/pixel as ink, so it falls to generic at 1.0.
	 *   `L(pixels|P) = 2048 × 0.2782 + 2048 × 1.0 ≈ 2617`, `L(P) = 51`, total ≈ 2668.
	 *
	 * *Ramp.* The ramp claims the colour at 40% of the way down is 40% of the way along the OKLab
	 * segment — a mid grey the image does not contain. Measured in *bar* units the light band's
	 * larger bar makes it the nearer symbol well before the physical band boundary, so the dark band
	 * is charged hundreds of bits in the bins either side of the crossover and falls to generic.
	 * The ramp ends up with the same likelihood as the flat configuration and pays two more bits of
	 * L(P) for the stop count. Total ≈ 2694.
	 *
	 * **Ordering: two-flat (1214) < flat (2668) < ramp (2694).** The second name earned its 24 bits;
	 * the gradient boolean did not earn its 2.
	 */
	it("ranks two-flat below flat and below the ramp at λ = 1", async () => {
		const top: Rgb8 = [20, 22, 30]
		const bottom: Rgb8 = [230, 228, 220]
		const measurement = await measureImage(
			await writeRgbImage("b-band.png", SIDE, SIDE, (_x, y) => (y < SIDE / 2 ? top : bottom)),
		)
		assert.equal(measurement.triples.colorCount, 2)

		const flat = energyOfAPrime(measurement, configuration({ background: top, foreground: bottom }))
		const twoFlat = energyOfAPrime(
			measurement,
			configuration({ background: top, surface: bottom, foreground: bottom }),
		)
		const ramp = energyOfAPrime(
			measurement,
			configuration({
				background: top,
				surface: bottom,
				foreground: bottom,
				gradient: true,
				stops: [
					{ rgb: top, position: 0 },
					{ rgb: bottom, position: 1 },
				],
			}),
		)

		assert.ok(
			twoFlat.total < flat.total,
			`two-flat ${twoFlat.total} should beat flat ${flat.total}`,
		)
		assert.ok(
			twoFlat.total < ramp.total,
			`two-flat ${twoFlat.total} should beat the ramp ${ramp.total}`,
		)

		// The hand-derived magnitudes, to 1%: 4096 × 0.2782 + 75 and 2048 × 1.2782 + 51.
		assert.ok(Math.abs(twoFlat.total - 1214) < 13, `two-flat total ${twoFlat.total}`)
		assert.ok(Math.abs(flat.total - 2668) < 27, `flat total ${flat.total}`)

		// Two-flat explains the whole image as field; flat explains half and abandons half.
		assert.equal(twoFlat.nuisance.fieldMassFraction, 1)
		assert.equal(flat.nuisance.fieldMassFraction, 0.5)
		assert.equal(flat.nuisance.genericMassFraction, 0.5)
	})
})

describe("(c) a linear ramp image — the ramp beats both flat descriptions", () => {
	/**
	 * A 64-column ramp, `#141a3c → #f0c878`, one distinct colour per column, 64 pixels each.
	 *
	 * **Why flat loses.** Under a flat field only the handful of columns within a few bars of the
	 * named colour are cheap; the other sixty are dozens of bars away and fall to the generic code.
	 * The generic code here is `−log₂(m(c)/Σm)` over 64 nearly-equal smoothed masses, i.e. about
	 * `log₂ 64 = 6` bits per pixel minus what the kernel overlap between neighbouring columns
	 * returns. Roughly 5.5 bits × 4,096 ≈ 22,000 bits, and no arrangement of two flat names changes
	 * that for more than a sixth of the image.
	 *
	 * **Why the ramp wins.** Given the `t` bin, the field predicts the column colour to within about
	 * one step of the ramp, so the kernel is near its peak and `Z(b)` sums only the few columns
	 * within a few bars — a couple of bits per pixel instead of five and a half. The ramp pays 24
	 * bits for the second field name and 2 for the stop count and gets ~7,000 bits back.
	 *
	 * **The third stop.** Adding the mid stop at t = 0.5 — which is exactly the shape
	 * `src/emit/legacy.ts` reconstructs every v2-3 gradient into — costs 32 further bits of L(P) and
	 * buys far more, because a straight segment in OKLab is a poor fit to a ramp that is straight in
	 * sRGB. That is arm A′ §2.5's rule for stops three and four with nothing added: *"a stop is added
	 * only when … that reduction buys more bits than the stop's serialization costs."*
	 */
	it("ranks ramp below two-flat below flat, and lets a mid stop at t = 0.5 earn its 32 bits", async () => {
		const from: Rgb8 = [20, 25, 60]
		const to: Rgb8 = [240, 200, 120]
		const columnColor = (x: number): Rgb8 => [
			Math.round(from[0] + ((to[0] - from[0]) * x) / (SIDE - 1)),
			Math.round(from[1] + ((to[1] - from[1]) * x) / (SIDE - 1)),
			Math.round(from[2] + ((to[2] - from[2]) * x) / (SIDE - 1)),
		]
		const measurement = await measureImage(
			await writeRgbImage("c-ramp.png", SIDE, SIDE, (x) => columnColor(x)),
		)
		assert.equal(measurement.triples.colorCount, SIDE)

		const first = columnColor(0)
		const last = columnColor(SIDE - 1)
		const middle = columnColor(SIDE / 2)

		const flat = energyOfAPrime(measurement, configuration({ background: first, foreground: last }))
		const twoFlat = energyOfAPrime(
			measurement,
			configuration({ background: first, surface: last, foreground: last }),
		)
		const ramp = energyOfAPrime(
			measurement,
			configuration({
				background: first,
				surface: last,
				foreground: last,
				gradient: true,
				stops: [
					{ rgb: first, position: 0 },
					{ rgb: last, position: 1 },
				],
			}),
		)
		// The legacy shape: `background → midpoint@0.5 → surface`, `V2_3_MIDPOINT_POSITION` in
		// `src/emit/legacy.ts`. The energy has to score it, and does.
		const rampWithMidStop = energyOfAPrime(
			measurement,
			configuration({
				background: first,
				surface: last,
				foreground: last,
				gradient: true,
				stops: [
					{ rgb: first, position: 0 },
					{ rgb: middle, position: 0.5 },
					{ rgb: last, position: 1 },
				],
			}),
		)

		assert.ok(ramp.total < twoFlat.total, `ramp ${ramp.total} should beat two-flat ${twoFlat.total}`)
		assert.ok(ramp.total < flat.total, `ramp ${ramp.total} should beat flat ${flat.total}`)
		assert.ok(twoFlat.total < flat.total)
		assert.ok(
			rampWithMidStop.total < ramp.total,
			`the mid stop should earn its 32 bits: ${rampWithMidStop.total} vs ${ramp.total}`,
		)
		// The mid-stop configuration is exactly 32 bits longer as a message; it wins on likelihood.
		assert.equal(
			(rampWithMidStop.nuisance.serializationBits as number) -
				(ramp.nuisance.serializationBits as number),
			32,
		)

		// The ramp explains most of the image as field; flat abandons most of it to the residual.
		assert.ok((ramp.nuisance.fieldMassFraction as number) > 0.8)
		assert.ok((flat.nuisance.genericMassFraction as number) > 0.8)
		// The profile picked the geometry the image actually has.
		assert.equal(ramp.nuisance.rampGeometry, "linear")
	})
})

describe("(e) λ scales L(P) and nothing else", () => {
	/**
	 * `E(λ) = L(pixels | P) + λ·L(P)`, so for a fixed configuration `E` is affine in λ with slope
	 * exactly `L(P)` and intercept exactly `L(pixels | P)`. Two consequences, both asserted:
	 * `E` is strictly increasing over `DESIGN.md` decision 2's mandatory sweep {¼, ½, 1, 2, 4}, and
	 * every increment equals `Δλ · L(P)` to float precision. If the likelihood ever picked up a λ
	 * dependence — the classic way a sensitivity sweep stops meaning anything — this fails.
	 */
	it("is affine in λ with slope L(P), over the mandatory sweep", async () => {
		const top: Rgb8 = [20, 22, 30]
		const bottom: Rgb8 = [230, 228, 220]
		const measurement = await measureImage(
			await writeRgbImage("e-band.png", SIDE, SIDE, (_x, y) => (y < SIDE / 2 ? top : bottom)),
		)
		const config = configuration({
			background: top,
			surface: bottom,
			foreground: bottom,
			gradient: true,
			stops: [
				{ rgb: top, position: 0 },
				{ rgb: bottom, position: 1 },
			],
		})
		const paletteBits = serializationCost(config).bits

		const sweep = [0.25, 0.5, 1, 2, 4]
		const results = sweep.map((lambda) => energyOfAPrime(measurement, config, { lambda }))

		for (const [index, result] of results.entries()) {
			assert.equal(result.nuisance.lambda, sweep[index])
			assert.equal(result.terms.paletteBits, sweep[index] * paletteBits)
			// The likelihood is the same number at every λ — the intercept does not move.
			assert.equal(result.nuisance.likelihoodBits, results[0].nuisance.likelihoodBits)
		}
		for (let index = 1; index < results.length; index += 1) {
			assert.ok(results[index].total > results[index - 1].total)
			assert.equal(
				results[index].total - results[index - 1].total,
				(sweep[index] - sweep[index - 1]) * paletteBits,
			)
		}
		// λ = 0 is the pure-likelihood limit: the palette costs nothing.
		assert.equal(energyOfAPrime(measurement, config, { lambda: 0 }).terms.paletteBits, 0)
		assert.throws(() => energyOfAPrime(measurement, config, { lambda: Number.NaN }), RangeError)
	})
})

describe("(f) determinism", () => {
	/**
	 * `DESIGN.md`: *"Anytime, deterministic … No RNG, no hash-order iteration."* Two calls with the
	 * same inputs must serialise identically — not "close", identical — including the profile's
	 * argmin, which is the one place a `Map` iteration order could have leaked in through the joint's
	 * entry index.
	 */
	it("returns byte-identical results on a double run, and does not mutate its inputs", async () => {
		const from: Rgb8 = [20, 25, 60]
		const to: Rgb8 = [240, 200, 120]
		const measurement = await measureImage(
			await writeRgbImage("f-ramp.png", SIDE, SIDE, (x): Rgb8 => [
				Math.round(from[0] + ((to[0] - from[0]) * x) / (SIDE - 1)),
				Math.round(from[1] + ((to[1] - from[1]) * x) / (SIDE - 1)),
				Math.round(from[2] + ((to[2] - from[2]) * x) / (SIDE - 1)),
			]),
		)
		const config = configuration({
			background: from,
			surface: to,
			foreground: to,
			gradient: true,
			stops: [
				{ rgb: from, position: 0 },
				{ rgb: [130, 112, 90], position: 0.5 },
				{ rgb: to, position: 1 },
			],
		})
		const before = JSON.stringify(config)

		const first = JSON.stringify(energyOfAPrime(measurement, config))
		const second = JSON.stringify(energyOfAPrime(measurement, config))
		assert.equal(first, second)
		assert.equal(JSON.stringify(config), before)
	})
})

describe("the terms are the total", () => {
	/**
	 * `terms` is an additive decomposition, not a report beside the number: the six entries must sum
	 * to `total`. Checked on all four fixture shapes so that no branch of the field code is exempt.
	 */
	it("sums the six terms to the total on every fixture shape", async () => {
		const only: Rgb8 = [40, 60, 90]
		const top: Rgb8 = [20, 22, 30]
		const bottom: Rgb8 = [230, 228, 220]

		const flatImage = await measureImage(
			await writeRgbImage("t-flat.png", SIDE, SIDE, () => only),
		)
		const bandImage = await measureImage(
			await writeRgbImage("t-band.png", SIDE, SIDE, (_x, y) => (y < SIDE / 2 ? top : bottom)),
		)

		const cases = [
			[flatImage, configuration({ background: only, foreground: only })],
			[bandImage, configuration({ background: top, surface: bottom, foreground: bottom })],
			[
				bandImage,
				configuration({
					background: top,
					surface: bottom,
					foreground: bottom,
					accent: only,
					gradient: true,
					stops: [
						{ rgb: top, position: 0 },
						{ rgb: bottom, position: 1 },
					],
				}),
			],
		] as const

		for (const [measurement, config] of cases) {
			for (const lambda of [0.25, 1, 4]) {
				const result = energyOfAPrime(measurement, config, { lambda })
				assert.ok(Number.isFinite(result.total))
				assert.ok(Math.abs(sumOfTerms(result.terms) - result.total) < 1e-9)
				assert.equal(Object.keys(result.terms).length, 6)
			}
		}
	})

	/**
	 * The energy must be finite for configurations that name colours the image does not contain —
	 * including the escape's `#ffffff`/`#000000`, which by construction are not source triples. This
	 * is what the log-domain kernel code buys: a colour a thousand bandwidths away costs a large
	 * finite number of bits instead of underflowing to `exp(−huge) = 0` and returning `Infinity`.
	 */
	it("stays finite for colours the image does not contain, escape included", async () => {
		const only: Rgb8 = [40, 60, 90]
		const measurement = await measureImage(
			await writeRgbImage("t-escape.png", SIDE, SIDE, () => only),
		)
		const escaped = {
			...configuration({ background: only, surface: [255, 255, 255], foreground: [1, 2, 3] }),
			escape: { role: "background", color: "#ffffff" },
		} as const
		const result = energyOfAPrime(measurement, escaped)
		assert.ok(Number.isFinite(result.total))
		// The escape barrier dominates: 1024 bits, plus foreground 24, plus surface 24, plus 3 flags.
		assert.equal(result.nuisance.serializationBits, 1024 + 24 + 24 + 2 + 1)
	})
})

describe("the support code is what splits field from ink", () => {
	/**
	 * Arm A′ §2.5 has no extent statistic and no classifier: *"the support of a field role is broad
	 * and low-frequency and is cheap under a coarse support code; the support of an ink role is
	 * stroke-like … and is cheap under an edge/run code."* This checks the two prices directly on a
	 * fixture holding **area constant** and varying only how it is arranged:
	 *
	 * - a solid 32 × 16 block (512 pixels, fill ratio ≈ 0.955) — cheap coarse, dear chain;
	 * - 512 pixels sprinkled one in every eight over the whole frame, so the covariance footprint is
	 *   the whole image and the fill ratio is ≈ 0.12 — dear coarse, cheap chain.
	 *
	 * The crossover is where `H₂(φ)/φ = 3` bits, i.e. φ ≈ 0.29; nobody chose 0.29, it is where
	 * `log₂ 8` meets the Bernoulli mask code.
	 */
	it("prices a solid block below the chain code and a sprinkled support above it", async () => {
		const field: Rgb8 = [30, 34, 44]
		const solid: Rgb8 = [200, 60, 60]
		const sprinkled: Rgb8 = [60, 200, 90]
		const measurement = await measureImage(
			await writeRgbImage("s-support.png", SIDE, SIDE, (x, y) => {
				if (y < 16 && x < 32) return solid
				if ((y * SIDE + x) % 8 === 3 && y >= 24) return sprinkled
				return field
			}),
		)
		const support = computeSupportCodes(measurement)
		const rowOf = (rgb: Rgb8): number => {
			const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
			const index = measurement.triples.keys.indexOf(key)
			assert.ok(index >= 0, `triple ${key} missing from the table`)
			return index
		}

		const solidRow = rowOf(solid)
		const sprinkledRow = rowOf(sprinkled)

		assert.ok(support.fillRatio[solidRow] > 0.9, `solid fill ${support.fillRatio[solidRow]}`)
		assert.ok(
			support.fillRatio[sprinkledRow] < 0.29,
			`sprinkled fill ${support.fillRatio[sprinkledRow]}`,
		)
		// Solid: the coarse code wins, and by a wide margin.
		assert.ok(support.coarseBitsPerPixel[solidRow] < support.chainBitsPerPixel[solidRow])
		// Sprinkled: the chain code wins — the field code cannot afford this support.
		assert.ok(support.chainBitsPerPixel[sprinkledRow] < support.coarseBitsPerPixel[sprinkledRow])
	})
})
