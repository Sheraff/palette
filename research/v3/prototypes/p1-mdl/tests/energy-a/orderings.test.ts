/**
 * # The four orderings arm A's energy has to get right
 *
 * `DESIGN.md`, "Verification discipline": *"the energies [get] hand-computed values on synthetic
 * images"*. Hand-computing an exact energy is not the useful instrument here — it would pin the
 * arithmetic of a mixture EM rather than the model — so what is hand-derived below is the **ordering**
 * and the size of the gap that produces it. Each case states the arithmetic in a comment before it
 * asserts, so a reviewer can disagree with the prediction rather than with a number.
 *
 * The scales the predictions are made in, all fixed by `gamut.ts` and the identity bar and none of
 * them by anyone's taste:
 *
 * - a colour sitting on a role colour has density ≈ `1/((2π)^{3/2} h³)` — about 1.9e4 at the
 *   dark-neutral bar, 5.3e3 at the dark-saturated one;
 * - a colour no kernel reaches has the uniform residual, `1/V ≈ 18.45`;
 * - so **explaining a unit of mass rather than leaving it unexplained is worth ≈ 5–7 nats**, and one
 *   structural element at λ = 1 costs 1 nat. A structural element has to explain about a sixth of
 *   the image to pay for itself.
 *
 * ## Why the extent code does not enter these four predictions
 *
 * Since `DESIGN.md` decision 9's fix, each triple also pays `−log m(ê_c)` for its *extent* — the
 * second half of the joint (colour, extent) code in `src/energy/a/support.ts`, worth 0.7 to 8.7 nats
 * depending on the split scale. That term is a function of the image and of `ŝ*` **and of nothing the
 * configuration names**, so between two configurations whose profiles settle on the same `ŝ*` it is a
 * common additive and cancels exactly, leaving the arithmetic below as it was written. Each case now
 * asserts that agreement rather than assuming it; the case where it does *not* cancel — because the
 * two configurations need different split scales — is the diptych, and that is `support.test.ts`
 * case (g). Measured split scales here: `ŝ* = 8` in (a) and (d), `ŝ* = 7` in (b) and (c), on the
 * ladder's `S = 8` rungs.
 */

import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import { energyOfA } from "../../src/energy/a/index.ts"
import { measureImage } from "../../src/measure/index.ts"
import { cleanupFixtures, configuration, rampTriple, writeRgbImage } from "./support.ts"

after(cleanupFixtures)

const DULL_FIELD: Rgb8 = [64, 66, 72]
const DULL_SECOND: Rgb8 = [150, 148, 140]
const VIVID: Rgb8 = [225, 45, 35]
const INK: Rgb8 = [242, 242, 238]
const BAND_LEFT: Rgb8 = [58, 62, 92]
const BAND_RIGHT: Rgb8 = [198, 152, 78]
const RAMP_START: Rgb8 = [22, 26, 62]
const RAMP_END: Rgb8 = [228, 178, 62]

/** Two one-pixel vertical strokes, at these columns, in every fixture that needs a foreground. */
const STROKE_COLUMNS = new Set([13, 47])

describe("(a) a flat image prefers the collapsed configuration", () => {
	it("beats a four-colour configuration that pays 2λ for 0.6% of the mass", async () => {
		// 64×64 = 4096 px. One dominant colour, plus three 2×2 patches — 12 px, 0.29% of the image.
		//
		//   collapsed:  Ω = 0   (surface collapsed, accent collapsed, no ramp)
		//   four-colour: Ω = 2  (surface ≠ background: 1, accent ≠ foreground: 1)
		//
		// Naming the three stray colours can win at most (their mass) × (peak − residual in nats)
		//   ≈ 0.0029 × 7 ≈ 0.02 nats,
		// against 2λ = 2 nats of structure. The collapsed configuration must win by ≈ 2 nats.
		const path = await writeRgbImage("energy-a-flat.png", 64, 64, (x, y) => {
			if (x < 2 && y < 2) return DULL_SECOND
			if (x < 2 && y >= 2 && y < 4) return VIVID
			if (x < 2 && y >= 4 && y < 6) return INK
			return DULL_FIELD
		})
		const measurement = await measureImage(path)

		const collapsed = energyOfA(measurement, configuration({
			background: DULL_FIELD,
			foreground: INK,
		}))
		const fourColour = energyOfA(measurement, configuration({
			background: DULL_FIELD,
			surface: DULL_SECOND,
			foreground: INK,
			accent: VIVID,
		}))

		assert.equal(collapsed.nuisance.omega, 0)
		assert.equal(fourColour.nuisance.omega, 2)
		// Same split scale, so the extent code's charge is common to both and the gap below is a
		// colour-and-structure comparison exactly as the arithmetic above states it.
		assert.equal(collapsed.nuisance.splitScaleRung, fourColour.nuisance.splitScaleRung)
		assert.equal(collapsed.nuisance.extentSupportCost, fourColour.nuisance.extentSupportCost)
		assert.ok(
			collapsed.total < fourColour.total,
			`collapsed ${collapsed.total} vs four-colour ${fourColour.total}`,
		)
		// The gap is the structural charge less whatever the two extra colours explained.
		const gap = fourColour.total - collapsed.total
		assert.ok(gap > 1.5 && gap < 2.05, `gap ${gap} should be just under 2λ`)
	})
})

describe("(b) a two-band image prefers two flat areas", () => {
	it("beats both the flat order and the ramp at λ = 1", async () => {
		// 64×64, left half one colour, right half another, plus two 1-px ink strokes.
		//
		//   flat      Ω = 0 — one kernel; half the image falls to the residual.
		//   two-flat  Ω = 1 — both halves sit on a kernel.
		//   ramp      Ω = 2 — γ runs through the empty colour space between the two bands, and each
		//                     band's own t-bins ask for a path colour it is nowhere near.
		//
		// Two-flat against flat: half the mass moves from ≈ −log(½·ρ₀) to ≈ −log(½·peak), worth
		// ≈ 0.5 × 7 ≈ 3.5 nats, against 1 nat of structure. Two-flat against ramp: the ramp pays a
		// second nat and explains *less*, because only its extreme bins land on an occupied colour.
		const path = await writeRgbImage("energy-a-two-band.png", 64, 64, (x) => {
			if (STROKE_COLUMNS.has(x)) return INK
			return x < 32 ? BAND_LEFT : BAND_RIGHT
		})
		const measurement = await measureImage(path)

		const flat = energyOfA(measurement, configuration({
			background: BAND_LEFT,
			foreground: INK,
		}))
		const twoFlat = energyOfA(measurement, configuration({
			background: BAND_LEFT,
			surface: BAND_RIGHT,
			foreground: INK,
		}))
		const ramp = energyOfA(measurement, configuration({
			background: BAND_LEFT,
			surface: BAND_RIGHT,
			foreground: INK,
			gradient: true,
			stops: [
				{ rgb: BAND_LEFT, position: 0 },
				{ rgb: BAND_RIGHT, position: 1 },
			],
		}))

		assert.deepEqual(
			[flat.nuisance.fieldOrder, twoFlat.nuisance.fieldOrder, ramp.nuisance.fieldOrder],
			["flat", "two-flat", "ramp"],
		)
		assert.deepEqual([flat.nuisance.omega, twoFlat.nuisance.omega, ramp.nuisance.omega], [0, 1, 2])
		// All three settle on the same split scale, so the extent code cancels across the comparison.
		assert.equal(twoFlat.nuisance.extentSupportCost, flat.nuisance.extentSupportCost)
		assert.equal(twoFlat.nuisance.extentSupportCost, ramp.nuisance.extentSupportCost)
		assert.ok(twoFlat.total < flat.total, `two-flat ${twoFlat.total} vs flat ${flat.total}`)
		assert.ok(twoFlat.total < ramp.total, `two-flat ${twoFlat.total} vs ramp ${ramp.total}`)
	})
})

describe("(c) an image that is a rendered ramp prefers the ramp", () => {
	it("beats the flat order by more than the 2λ the ramp costs", async () => {
		// Each column is γ(x/63) for the two-stop OKLab path — the colour field of this image *is* the
		// gradient, so a correct ramp configuration explains essentially all of it.
		//
		//   flat  Ω = 0 — one kernel covers about one identity bar of a path whose length in OKLab is
		//                 ≈ 0.4, so it reaches ≈ 4% of the mass and the rest falls to the residual.
		//   ramp  Ω = 2 — each t-bin's path colour is the colour that bin's pixels actually carry.
		//
		// Predicted gap ≈ 0.96 × 7 ≈ 6.7 nats of explanation against 2 nats of structure: the ramp
		// must win, and by several nats.
		const path = await writeRgbImage("energy-a-ramp.png", 64, 64, (x) => {
			if (STROKE_COLUMNS.has(x)) return INK
			return rampTriple(RAMP_START, RAMP_END, x / 63)
		})
		const measurement = await measureImage(path)

		const flat = energyOfA(measurement, configuration({
			background: RAMP_START,
			foreground: INK,
		}))
		const ramp = energyOfA(measurement, configuration({
			background: RAMP_START,
			surface: RAMP_END,
			foreground: INK,
			gradient: true,
			stops: [
				{ rgb: RAMP_START, position: 0 },
				{ rgb: RAMP_END, position: 1 },
			],
		}))

		assert.equal(ramp.nuisance.extentSupportCost, flat.nuisance.extentSupportCost)
		assert.ok(ramp.total < flat.total, `ramp ${ramp.total} vs flat ${flat.total}`)
		assert.ok(flat.total - ramp.total > 2, `gap ${flat.total - ramp.total} should clear 2λ`)
		// The profile is expected to read this image's position parameter in the linear geometry — the
		// one whose t actually varies with the ramp — and it is reported rather than assumed.
		assert.equal(ramp.nuisance.geometry, "linear")
	})
})

describe("(d) a small vivid patch is a better accent than a second dull colour", () => {
	it("prefers the accent that explains mass nothing else reaches", async () => {
		// 96×96. A large dull field, a second large dull colour, an 8×8 vivid patch (0.7% of the
		// image), two 1-px ink strokes. Both configurations name the same background, surface and
		// foreground and both declare a distinct accent, so **Ω is 2 for both and λ cancels
		// exactly**: this case is decided by the ink term alone.
		//
		//   accent = VIVID       — the only kernel anywhere near the patch. Explains ink mass that
		//                          neither the field nor the foreground reaches.
		//   accent = DULL_SECOND — the surface already names this colour, so the field explains it;
		//                          the accent adds nothing the configuration did not already have.
		const path = await writeRgbImage("energy-a-vivid.png", 96, 96, (x, y) => {
			if (STROKE_COLUMNS.has(x)) return INK
			if (x >= 12 && x < 20 && y >= 12 && y < 20) return VIVID
			return x < 48 ? DULL_FIELD : DULL_SECOND
		})
		const measurement = await measureImage(path)

		const vividAccent = energyOfA(measurement, configuration({
			background: DULL_FIELD,
			surface: DULL_SECOND,
			foreground: INK,
			accent: VIVID,
		}))
		const dullAccent = energyOfA(measurement, configuration({
			background: DULL_FIELD,
			surface: DULL_SECOND,
			foreground: INK,
			accent: DULL_SECOND,
		}))

		assert.equal(vividAccent.nuisance.omega, dullAccent.nuisance.omega)
		assert.equal(vividAccent.terms.structural, dullAccent.terms.structural)
		// λ cancels because Ω agrees; the extent code cancels because the split scale agrees. What is
		// left is the ink term, which is the whole point of this case.
		assert.equal(vividAccent.nuisance.extentSupportCost, dullAccent.nuisance.extentSupportCost)
		assert.ok(
			vividAccent.total < dullAccent.total,
			`vivid accent ${vividAccent.total} vs dull accent ${dullAccent.total}`,
		)
	})
})
