/**
 * # The naming-gain test — arm A′ §2.3, the mechanism the paradigm turns on
 *
 * > *"Naming a colour is worth doing when the pixels near it become cheaper to code. Under the
 * > generic code, a pixel's cost is −log of the image's own … density at that point. A large mass
 * > sitting in a dense part of colour space is already cheap generically, so naming it saves little
 * > per pixel. A **chromatically isolated** cluster — a signature red on an otherwise desaturated
 * > cover — sits where the density is near zero, so every one of its pixels is expensive generically
 * > and becomes cheap once named."*
 *
 * This file is that paragraph as an experiment, **strengthened at v0.2.0** to the claim the M3 round
 * demanded (`DESIGN.md` fold item 11, `review-rounds/m3-priors-pairwise/ANALYSIS.md` §4d): under the
 * chromatic residual the isolated colour does not merely win a close race against a heavier one — the
 * heavier one **cannot be named at any mass**, because the criterion is mass-free:
 *
 *     naming `c` as ink repays  ⟺  log₂ Z(c) + chain(c)  <  log₂ Σρ − log₂ ρ(c)
 *                               ⟺  ρ(c) · Z(c)  <  Σρ / 2^chain(c)
 *
 * Not one pixel count appears in that inequality. `ρ` and `Z` are both counts of *distinct colours*
 * near `c` — `ρ` over the occupied cells of the identity-bar lattice (`src/energy/aprime/chromatic.ts`),
 * `Z` over the alphabet — so **chromatic isolation decides whether a name is worth its bits, and mass
 * only scales a gain it never decides.** Nothing in the energy encodes that: there is no rarity term,
 * no isolation statistic, no chroma bonus and no area threshold. It falls out of the residual model,
 * which is what makes this file evidence about arm A′'s prior rather than about its code.
 *
 * ## The fixture
 *
 * 64 × 64 = 4,096 pixels, eight triples in five occupied cells:
 *
 * | triple | rgb | pixels | shape | where it sits |
 * |---|---|---|---|---|
 * | `c0` field | `#464b55` | 3,307 | everything else | dark neutral |
 * | `c1` dull | `#4a4f59` | 608 | solid 38 × 16 block | 1.58 bars from `c0` |
 * | five shades | `#484d57` … `#48515 9` | 20 each | four rows of a shaded strip | 0.47–0.87 bars from `c1` |
 * | `c2` vivid | `#dc1e28` | 81 | solid 9 × 9 block | **30.0 bars** from `c0` |
 *
 * The five shades are the fixture's whole point and are the one thing v0.1.0's version of this file
 * did not have: they make `c1` **chromatically crowded** without giving it any more mass. That is
 * what a large dull region on a real cover is — a colour surrounded in colour space by its own
 * shading — and it is what `ρ` sees and `m` did not.
 *
 * ## The arithmetic, before the code runs
 *
 * Occupancy at the identity bar puts the eight triples in five cells; `ρ` is the kernel sum over
 * those cells with weight one each:
 *
 *     ρ(c1) = 2.7852     (its own cell, plus the shade cells and `c0`'s within a bar or two)
 *     ρ(c2) = 1.0000     (nothing within four bars of it — the truncation radius)
 *     Σ_c ρ(cell(c)) = 18.08,  log₂ Σρ = 4.17685
 *
 * *Generic cost per pixel*, `log₂ Σρ − log₂ ρ(c)`:
 *
 *     c1 → 4.17685 − log₂ 2.7852 = 2.6991 bits      ← cheap: seven distinct colours share its region
 *     c2 → 4.17685 − log₂ 1.0000 = 4.1768 bits      ← dear: it is alone
 *
 * *Ink cost per pixel* if the foreground names the colour, `log₂ Z(c) + log₂(N)/n(c) + 3`:
 *
 *     naming c1 → 0.0000 + 12/608 + 3 = 3.0197 bits   > 2.6991 generic  → declines
 *     naming c2 → 0.0000 + 12/ 81 + 3 = 3.1481 bits   < 4.1768 generic  → 1.0287 bits saved
 *
 * (`log₂ Z ≈ 0` for both: at its own centre the kernel normaliser sums only what is within a few
 * bandwidths, and each of these colours is the only *triple* that close — `Z` counts triples, `ρ`
 * counts cells, and here the shades are more than a bandwidth from `c1` itself.)
 *
 *     gain = 81 × 1.0287 = 83.32 bits
 *
 * Both configurations are the same length as messages (`L(P) = 51` bits each), so the 83 bits are
 * pure likelihood and the comparison isolates the mechanism completely.
 *
 * ## And the mass sweep, which is the strengthening
 *
 * The same fixture is re-rendered with the dull block at 608, 1,920 and 3,072 pixels — 7.5×, 23.7×
 * and 37.9× the vivid patch's mass. `ρ` reads no mass, so the two generic costs are the same three
 * digits at every size, `c1`'s naming gain is **exactly zero** at every size, and `c2`'s is 83.3 bits
 * at every size. Under v0.1.0's mass-proportional residual this sweep was the failure: the heavier
 * the dull region, the more naming it bought.
 */

import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import { chromaticResidual, energyOfAPrime } from "../../src/energy/aprime/index.ts"
import { computeSupportCodes } from "../../src/energy/aprime/support.ts"
import { measureImage } from "../../src/measure/index.ts"
import { FIXTURE_SIDE, cleanupFixtures, configuration, writeRgbImage } from "./support.ts"

after(cleanupFixtures)

const SIDE = FIXTURE_SIDE

/** The large dull field. */
const FIELD: Rgb8 = [70, 75, 85]
/** The heavy dull colour, 1.58 bars from the field — the one that must stay unnameable. */
const DULL: Rgb8 = [74, 79, 89]
/** Five shades 0.47–0.87 bars from `DULL`: its crowd in colour space, 20 pixels each. */
const SHADES: readonly Rgb8[] = [
	[72, 77, 87],
	[76, 81, 91],
	[74, 77, 91],
	[76, 79, 87],
	[72, 81, 89],
]
/** The chromatically isolated patch, 30.0 bars from the field, 81 pixels. */
const VIVID: Rgb8 = [220, 30, 40]

const VIVID_PIXELS = 9 * 9

/** The fixture, with the dull block's size as the only variable. */
async function namingFixture(name: string, dullWidth: number, dullHeight: number) {
	return measureImage(
		await writeRgbImage(name, SIDE, SIDE, (x, y) => {
			if (y < dullHeight && x < dullWidth) return DULL
			if (y >= 50 && y < 59 && x >= 40 && x < 49) return VIVID
			if (y >= 60 && y < 64 && x < 25) return SHADES[((y - 60) * 25 + x) % SHADES.length]
			return FIELD
		}),
	)
}

const rowOf = (measurement: Awaited<ReturnType<typeof measureImage>>, rgb: Rgb8): number => {
	const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
	const index = measurement.triples.keys.indexOf(key)
	assert.ok(index >= 0, `triple ${key} missing from the table`)
	return index
}

describe("(d) the naming gain — a chromatically isolated colour beats a heavier crowded one", () => {
	it("names the vivid 81-pixel patch over the dull 608-pixel one, at equal message length", async () => {
		const measurement = await namingFixture("d-naming.png", 38, 16)
		assert.equal(measurement.triples.colorCount, 8)
		assert.equal(measurement.joints.lattice.cellCount, 5)

		// Two configurations differing in exactly one field: which colour the foreground names.
		const nameTheDull = energyOfAPrime(
			measurement,
			configuration({ background: FIELD, foreground: DULL }),
		)
		const nameTheVivid = energyOfAPrime(
			measurement,
			configuration({ background: FIELD, foreground: VIVID }),
		)

		// Same message, so the whole difference is likelihood. 2 + 1 + 24 + 24 = 51 bits.
		assert.equal(nameTheDull.nuisance.serializationBits, 51)
		assert.equal(nameTheVivid.nuisance.serializationBits, 51)

		assert.ok(
			nameTheVivid.total < nameTheDull.total,
			`naming the vivid colour (${nameTheVivid.total}) should beat naming the dull one (${nameTheDull.total})`,
		)

		// The hand-derived gain: 81 × (4.17685 − 3.14815) = 83.32 bits. A hundredth of a bit of
		// tolerance, because every input to that arithmetic is exact and the only slack is the
		// rounding in this comment.
		const gain = nameTheDull.total - nameTheVivid.total
		assert.ok(Math.abs(gain - 83.325) < 0.01, `gain was ${gain} bits, expected ≈ 83.325`)
	})

	it("shows the mechanism: naming the dull colour saves exactly nothing, whatever its mass", async () => {
		const measurement = await namingFixture("d-naming.png", 38, 16)
		const pixels = measurement.source.pixelCount

		const nameTheDull = energyOfAPrime(
			measurement,
			configuration({ background: FIELD, foreground: DULL }),
		)
		const nameTheVivid = energyOfAPrime(
			measurement,
			configuration({ background: FIELD, foreground: VIVID }),
		)

		// Naming `c1` moves no mass out of the residual at all: at 3.0197 ink bits against 2.6991
		// generic bits, its own pixels are cheaper unnamed, so the assignment declines the name. This
		// is arm A′ §2.3's answer to "does this colour belong to the artwork?" — *it belongs if it
		// pays for its own name* — with no threshold anywhere.
		assert.equal(nameTheDull.nuisance.inkMassFraction, 0)
		assert.equal(nameTheDull.terms.inkColorBits, 0)
		assert.equal(nameTheDull.terms.inkSupportBits, 0)

		// Naming `c2` moves exactly its 81 pixels into the ink code.
		assert.equal(nameTheVivid.nuisance.inkMassFraction, VIVID_PIXELS / pixels)

		// And the colour that lost has 7.5 times the mass of the one that won.
		const dullMass = measurement.triples.counts[rowOf(measurement, DULL)]
		assert.equal(dullMass, 38 * 16)
		assert.ok(dullMass > 7 * VIVID_PIXELS)
	})

	it("is the residual model doing the work: the isolated colour is 1.478 bits dearer per generic pixel", async () => {
		const measurement = await namingFixture("d-naming.png", 38, 16)
		const residual = chromaticResidual(measurement)
		const support = computeSupportCodes(measurement)
		const lattice = measurement.joints.lattice

		const dullRow = rowOf(measurement, DULL)
		const vividRow = rowOf(measurement, VIVID)

		// The two densities, read straight off the measurement the way the energy does.
		const dullDensity = residual.cellDensity[lattice.tripleCell[dullRow]]
		const vividDensity = residual.cellDensity[lattice.tripleCell[vividRow]]
		assert.ok(Math.abs(dullDensity - 2.7852) < 0.001, `ρ(dull) = ${dullDensity}`)
		// Nothing is within the truncation radius of the vivid patch, so its density is exactly κ(0).
		assert.equal(vividDensity, 1)
		assert.ok(Math.abs(residual.log2Normaliser - 4.17685) < 0.001)

		// The hand-derived per-pixel costs: 2.6991 and 4.1768 bits.
		assert.ok(Math.abs(residual.bitsPerPixel[dullRow] - 2.6991) < 0.001)
		assert.ok(Math.abs(residual.bitsPerPixel[vividRow] - 4.1768) < 0.001)

		// The whole difference is the log of the crowd, and **no pixel count enters it**:
		//   generic(vivid) − generic(dull) = log₂ ρ(dull) − log₂ ρ(vivid) = log₂ 2.7852 = 1.4778.
		const difference = residual.bitsPerPixel[vividRow] - residual.bitsPerPixel[dullRow]
		assert.ok(
			Math.abs(difference - Math.log2(dullDensity / vividDensity)) < 1e-12,
			`the gap must be exactly log₂(ρ_dull/ρ_vivid); got ${difference}`,
		)
		assert.ok(Math.abs(difference - 1.4778) < 0.001)

		// And the criterion each colour is judged by, spelled out: ink cost against generic cost.
		assert.ok(support.chainBitsPerPixel[dullRow] > residual.bitsPerPixel[dullRow])
		assert.ok(support.chainBitsPerPixel[vividRow] < residual.bitsPerPixel[vividRow])
	})

	it("holds at every mass: the dull colour is unnameable at 7.5×, 23.7× and 37.9× the vivid's mass", async () => {
		// The strengthening `DESIGN.md` fold item 11 asks for. `ρ` counts occupied colour-space cells,
		// so growing the dull block changes no density — only how many pixels are charged at it. If the
		// residual ever went back to reading mass, the second and third rows here would move.
		const sizes: readonly [string, number, number, number][] = [
			["d-sweep-608.png", 38, 16, 608],
			["d-sweep-1920.png", 64, 30, 1920],
			["d-sweep-3072.png", 64, 48, 3072],
		]
		const genericCosts: number[] = []

		for (const [name, width, height, expectedMass] of sizes) {
			const measurement = await namingFixture(name, width, height)
			const residual = chromaticResidual(measurement)
			const dullRow = rowOf(measurement, DULL)
			const vividRow = rowOf(measurement, VIVID)
			assert.equal(measurement.triples.counts[dullRow], expectedMass)
			assert.equal(measurement.triples.counts[vividRow], VIVID_PIXELS)

			const nameTheDull = energyOfAPrime(
				measurement,
				configuration({ background: FIELD, foreground: DULL }),
			)
			const nameTheVivid = energyOfAPrime(
				measurement,
				configuration({ background: FIELD, foreground: VIVID }),
			)

			// Zero, not "small": the dull colour's pixels never leave the residual.
			assert.equal(
				nameTheDull.nuisance.inkMassFraction,
				0,
				`the dull colour must stay unnamed at ${expectedMass} pixels`,
			)
			assert.equal(nameTheVivid.nuisance.inkMassFraction, VIVID_PIXELS / 4096)

			// The isolated 81-pixel patch still buys the same 83.3 bits, against up to 37.9× its mass.
			const gain = nameTheDull.total - nameTheVivid.total
			assert.ok(
				Math.abs(gain - 83.33) < 0.02,
				`gain at ${expectedMass} dull pixels was ${gain}, expected ≈ 83.33`,
			)

			genericCosts.push(residual.bitsPerPixel[dullRow], residual.bitsPerPixel[vividRow])
		}

		// The densities themselves are mass-blind. The only drift across a 5× change in the dull
		// region's area is the lattice cell's own mass-weighted representative moving inside its
		// bar-sized box — under a thousandth of a bit, and it is the only mass this residual can feel.
		for (let index = 2; index < genericCosts.length; index += 2) {
			assert.ok(
				Math.abs(genericCosts[index] - genericCosts[0]) < 1e-3,
				`dull generic cost drifted: ${genericCosts[index]} vs ${genericCosts[0]}`,
			)
			assert.ok(
				Math.abs(genericCosts[index + 1] - genericCosts[1]) < 1e-3,
				`vivid generic cost drifted: ${genericCosts[index + 1]} vs ${genericCosts[1]}`,
			)
		}
	})
})
