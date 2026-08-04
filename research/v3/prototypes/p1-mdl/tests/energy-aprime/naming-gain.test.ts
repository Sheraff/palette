/**
 * # The naming-gain test — arm A′ §2.3, the mechanism the paradigm turns on
 *
 * > *"Naming a colour is worth doing when the pixels near it become cheaper to code. Under the
 * > generic code, a pixel's cost is −log of the image's own smoothed colour density at that point. A
 * > large mass sitting in a dense part of colour space is already cheap generically, so naming it
 * > saves little per pixel. A **chromatically isolated** cluster — a signature red on an otherwise
 * > desaturated cover — sits where the density is near zero, so every one of its pixels is expensive
 * > generically and becomes cheap once named. Total saving is mass × per-pixel saving, and a small
 * > isolated cluster can beat a large typical one."*
 *
 * This file is that paragraph as an experiment. Nothing in the energy encodes it: there is no rarity
 * term, no isolation statistic, no chroma bonus and no area threshold. The behaviour has to *emerge*
 * from the choice of residual model (`DESIGN.md` decision 4: arm A′ codes the unexplained against
 * **the image's own smoothed colour density**, where arm A uses a uniform density over the gamut).
 * If it did not emerge, that would be evidence against arm A′'s prior, and this test is where it
 * would show.
 *
 * ## The fixture
 *
 * 64 × 64 = 4,096 pixels, three triples:
 *
 * | triple | rgb | pixels | shape | OKLab |
 * |---|---|---|---|---|
 * | `c0` field | `#464b55` | 3,407 | everything else | L 0.4120, chroma 0.018, dark-neutral |
 * | `c1` second dull | `#4a4f59` | 608 | solid 38 × 16 block | L 0.4258, chroma 0.018, dark-neutral |
 * | `c2` vivid | `#dc1e28` | 81 | solid 9 × 9 block | L 0.5729, chroma 0.219, light-saturated |
 *
 * `c1` sits **1.58 bars** from `c0` (0.01472 in OKLab against a dark-neutral bar of 0.00932): a
 * legally distinct colour, and a close one. `c2` sits **12.2 bars** from `c0` — chromatically
 * isolated, which is the only property that distinguishes it.
 *
 * `c1` has **7.5 times** `c2`'s mass. Any rule that ranked candidates by area, by exact-triple share,
 * or by "population floor first" names `c1`. This energy names `c2`, and the arithmetic below is why.
 *
 * ## The arithmetic, before the code runs
 *
 * *Smoothed mass* (the exact O(K²) path, since K = 3). `κ(c0,c1) = exp(−½·1.58²) = 0.2872`; the
 * kernels from `c2` to either dull colour are ~1e-29 and drop out.
 *
 *     m(c0) = 3407 + 0.2872 × 608  = 3580.4
 *     m(c1) =  608 + 0.2872 × 3407 = 1579.8
 *     m(c2) =   81                 =   81.0
 *     Σm                           = 5241.2
 *
 * *Generic cost per pixel*, `−log₂(m(c)/Σm)`:
 *
 *     c1 → log₂(5241.2/1579.8) = 1.730 bits      ← already cheap: it lives inside c0's kernel
 *     c2 → log₂(5241.2/  81.0) = 6.016 bits      ← expensive: nothing else is anywhere near it
 *
 * *Ink cost per pixel* if the foreground names the colour: `−log₂(1/Z) + log₂(N)/n + 3`, where the
 * `3` is the chain code's per-step charge and `Z` is the kernel normaliser at the named colour.
 *
 *     naming c1 → log₂(1.2872) + 12/608 + 3 = 0.364 + 0.020 + 3 = 3.384 bits   > 1.730 generic
 *     naming c2 → log₂(1.0000) + 12/ 81 + 3 = 0.000 + 0.148 + 3 = 3.148 bits   < 6.016 generic
 *
 * So **naming `c1` buys nothing at all**: its pixels are cheaper left in the residual, the assignment
 * leaves them there, and the saving is exactly zero. Naming `c2` saves `6.016 − 3.148 = 2.868` bits
 * on each of 81 pixels:
 *
 *     gain = 81 × 2.868 ≈ 232 bits
 *
 * Both configurations are the same length as messages (`L(P) = 51` bits each: background 24,
 * foreground 24, three flag bits), so the 232 bits are pure likelihood and the comparison isolates
 * the mechanism completely.
 */

import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import { energyOfAPrime } from "../../src/energy/aprime/index.ts"
import { measureImage } from "../../src/measure/index.ts"
import { FIXTURE_SIDE, cleanupFixtures, configuration, writeRgbImage } from "./support.ts"

after(cleanupFixtures)

const SIDE = FIXTURE_SIDE

/** The large dull field. */
const FIELD: Rgb8 = [70, 75, 85]
/** A second dull colour, 1.58 bars from the field, 608 pixels — 7.5× the vivid patch's mass. */
const SECOND_DULL: Rgb8 = [74, 79, 89]
/** The chromatically isolated patch, 12.2 bars from the field, 81 pixels. */
const VIVID: Rgb8 = [220, 30, 40]

const SECOND_DULL_PIXELS = 38 * 16
const VIVID_PIXELS = 9 * 9

async function namingFixture() {
	return measureImage(
		await writeRgbImage("d-naming.png", SIDE, SIDE, (x, y) => {
			if (y < 16 && x < 38) return SECOND_DULL
			if (y >= 40 && y < 49 && x >= 40 && x < 49) return VIVID
			return FIELD
		}),
	)
}

describe("(d) the naming gain — a small isolated colour beats a large typical one", () => {
	it("names the vivid 81-pixel patch over the dull 608-pixel one, at equal message length", async () => {
		const measurement = await namingFixture()
		assert.equal(measurement.triples.colorCount, 3)
		assert.equal(measurement.smoothedMass.mode, "exact")

		// Two configurations differing in exactly one field: which colour the foreground names.
		const nameTheDull = energyOfAPrime(
			measurement,
			configuration({ background: FIELD, foreground: SECOND_DULL }),
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

		// The hand-derived gain: 81 × (6.016 − 3.148) ≈ 232 bits. Half a bit of tolerance, because
		// every input to that arithmetic is exact and the only slack is the rounding in this comment.
		const gain = nameTheDull.total - nameTheVivid.total
		assert.ok(Math.abs(gain - 232.3) < 0.5, `gain was ${gain} bits, expected ≈ 232.3`)
	})

	it("shows the mechanism: naming the dull colour saves exactly nothing, whatever its mass", async () => {
		const measurement = await namingFixture()
		const pixels = measurement.source.pixelCount

		const nameTheDull = energyOfAPrime(
			measurement,
			configuration({ background: FIELD, foreground: SECOND_DULL }),
		)
		const nameTheVivid = energyOfAPrime(
			measurement,
			configuration({ background: FIELD, foreground: VIVID }),
		)

		// Naming `c1` moves no mass out of the residual at all: at 3.384 ink bits against 1.730
		// generic bits, its own pixels are cheaper unnamed, so the assignment declines the name. This
		// is arm A′ §2.3's answer to "does this colour belong to the artwork?" — *it belongs if it
		// pays for its own name* — with no threshold anywhere.
		assert.equal(nameTheDull.nuisance.inkMassFraction, 0)
		assert.equal(nameTheDull.terms.inkColorBits, 0)
		assert.equal(nameTheDull.terms.inkSupportBits, 0)

		// Naming `c2` moves exactly its 81 pixels into the ink code.
		assert.equal(nameTheVivid.nuisance.inkMassFraction, VIVID_PIXELS / pixels)

		// And the colour that lost has 7.5 times the mass of the one that won.
		assert.equal(SECOND_DULL_PIXELS / VIVID_PIXELS, 608 / 81)
		assert.ok(SECOND_DULL_PIXELS > 7 * VIVID_PIXELS)
	})

	it("is the residual model doing the work: the isolated colour is 3.5× dearer per generic pixel", async () => {
		const measurement = await namingFixture()

		// Read the generic per-pixel costs straight off the measurement, the way the energy does:
		// −log₂(m(c)/Σm) over the image's own smoothed colour density.
		const mass = measurement.smoothedMass.mass
		let total = 0
		for (let row = 0; row < measurement.triples.colorCount; row += 1) total += mass[row]
		const rowOf = (rgb: Rgb8): number => {
			const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
			const index = measurement.triples.keys.indexOf(key)
			assert.ok(index >= 0)
			return index
		}
		const genericBits = (rgb: Rgb8): number => Math.log2(total / mass[rowOf(rgb)])

		const dullBits = genericBits(SECOND_DULL)
		const vividBits = genericBits(VIVID)

		// The hand-derived values: 1.730 and 6.016 bits per pixel.
		assert.ok(Math.abs(dullBits - 1.730) < 0.01, `dull generic cost ${dullBits}`)
		assert.ok(Math.abs(vividBits - 6.016) < 0.01, `vivid generic cost ${vividBits}`)

		// The dull colour is cheap generically *because* it sits inside the field's kernel: its
		// smoothed mass is 2.6× its own pixel count, where the vivid colour's is exactly its own.
		assert.ok(mass[rowOf(SECOND_DULL)] > 2.5 * SECOND_DULL_PIXELS)
		assert.ok(Math.abs(mass[rowOf(VIVID)] - VIVID_PIXELS) < 1e-6)

		// A rule that ranked by mass would name the dull colour; the ratio of generic costs (3.48)
		// is what beats the ratio of masses once the ink code's flat 3-bit chain charge is paid.
		assert.ok(vividBits / dullBits > 3.4)
	})
})
