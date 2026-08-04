/**
 * # The support price — `DESIGN.md` decision 9's regression, and the extent code's own arithmetic
 *
 * Decision 9, from the independent verifier: *"arm A's ink term prices no support. On a clean
 * diptych, 'flat + second band as foreground' (Ω = 0) undercuts two-flat at every λ; 62% of a solid
 * band's mass lands in ink at the finest profiled s\*."* The fix is `src/energy/a/support.ts`: the
 * two populations become **joint** densities over (colour, extent), so the extent map stops being
 * free side information and a split scale that calls broad mass "ink" has to be paid for.
 *
 * This file is the instrument for that claim. Cases (g) and (h) are the verifier's own two
 * reproductions, run with the verifier's own fixtures and configurations, so a regression shows up as
 * the verifier's finding coming back rather than as an abstract inequality failing. Case (i) checks
 * the extent code is a code — that its two densities normalise and that the membership logistic
 * `split.ts` uses is the *posterior* of that code and not a second, independent modelling choice.
 *
 * The scale to read the assertions against. At `S = 8` rungs and `w = 1` octave, the support charge
 * `−log m(ê)` runs from ≈ 0.69 nats (a broad triple under a field-leaning prior, or a fine triple
 * under an ink-leaning one) to ≈ 8.7 nats (a broad triple under the most ink-leaning prior the grid
 * allows). It is a *common additive* between two configurations whose profiles agree — which is why
 * cases (a)–(d) in `orderings.test.ts` are untouched by it — and it bites exactly when a
 * configuration needs a different split scale from its rival, which is the diptych.
 */

import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import {
	energyOfA,
	extentDensities,
	extentFieldPrior,
	extentLadderOf,
	extentSupportNats,
} from "../../src/energy/a/index.ts"
import { FIELD_INK_SOFTNESS_OCTAVES } from "../../src/energy/a/constants.ts"
import { fieldMembership } from "../../src/energy/a/split.ts"
import { measureImage } from "../../src/measure/index.ts"
import { cleanupFixtures, configuration, writeRgbImage } from "./support.ts"

after(cleanupFixtures)

/** The verifier's diptych, to the digit: `tests/verify-energy/disagreement-probe.ts`. */
const DIPTYCH_TOP: Rgb8 = [20, 22, 30]
const DIPTYCH_BOTTOM: Rgb8 = [230, 228, 220]

/** The verifier's second reproduction — arm A's *own* two-band fixture, plus its ink strokes. */
const BAND_LEFT: Rgb8 = [58, 62, 92]
const BAND_RIGHT: Rgb8 = [198, 152, 78]
const INK: Rgb8 = [242, 242, 238]
const STROKE_COLUMNS = new Set([13, 47])

describe("(g) a clean diptych is two flat areas, not a field with a band-sized foreground", () => {
	it("flips the verifier's decision-9 ranking, and says at which λ the trade turns", async () => {
		// 64×64, top half one colour, bottom half another, nothing else. There is no ink in this image
		// at all, so the only question is which *description* is cheaper:
		//
		//   flat      Ω = 0 — background names the top band, foreground names the bottom band. Before
		//                     the extent code this was free: the profile simply chose a fine split
		//                     scale, moved 62% of the mass into the ink population, and collected the
		//                     foreground kernel's density on half an image without paying for the claim
		//                     that half an image is "small, high-frequency and marks-like".
		//   two-flat  Ω = 1 — background and surface name the two bands. The honest description.
		//
		// With the joint (colour, extent) code that manoeuvre costs. Measured: the flat configuration's
		// profile moves from rung 1 to rung 4 and its ink mass fraction falls 0.6217 → 0.0759, and the
		// two-flat description now wins the *data* term by 1.2748 nats instead of 0.0715. Since Ω
		// differs by exactly 1, that is the λ at which the trade turns — so two-flat must win for every
		// λ below ≈ 1.27 and lose above it. λ = 1 is inside that range, which is what decision 9 asks
		// for; λ = 2 and 4 outside it is λ doing its job, not the defect returning.
		const path = await writeRgbImage(
			"energy-a-diptych.png",
			64,
			64,
			(_x, y) => (y < 32 ? DIPTYCH_TOP : DIPTYCH_BOTTOM),
		)
		const measurement = await measureImage(path)

		const flat = configuration({ background: DIPTYCH_TOP, foreground: DIPTYCH_BOTTOM })
		const twoFlat = configuration({
			background: DIPTYCH_TOP,
			surface: DIPTYCH_BOTTOM,
			foreground: DIPTYCH_BOTTOM,
		})

		// The heart of it: at v0's λ = 1, the true description wins.
		const flatAtOne = energyOfA(measurement, flat)
		const twoFlatAtOne = energyOfA(measurement, twoFlat)
		assert.equal(flatAtOne.nuisance.omega, 0)
		assert.equal(twoFlatAtOne.nuisance.omega, 1)
		assert.ok(
			twoFlatAtOne.total < flatAtOne.total,
			`two-flat ${twoFlatAtOne.total} must beat flat ${flatAtOne.total} at λ = 1`,
		)

		// The defect's own statistic. The verifier measured 62% of a solid band's mass in the ink
		// population; the fix has to make that manoeuvre unaffordable, not merely more expensive.
		assert.ok(
			(flatAtOne.nuisance.inkMassFraction as number) < 0.15,
			`flat ink mass fraction ${flatAtOne.nuisance.inkMassFraction} (verifier measured 0.6217)`,
		)

		// Where the trade turns, stated as a number rather than as a direction. Ω differs by 1, so the
		// crossover λ *is* the data-term gap, and asserting a band on it pins the strength of the fix:
		// a regression that halved the support price would fail here while still passing the λ = 1
		// assertion above.
		const dataGap =
			flatAtOne.terms.field + flatAtOne.terms.ink -
			(twoFlatAtOne.terms.field + twoFlatAtOne.terms.ink)
		assert.ok(dataGap > 1.0 && dataGap < 1.6, `crossover λ ${dataGap} (was 0.0715 before the fix)`)

		for (const lambda of [0.25, 0.5, 1]) {
			const f = energyOfA(measurement, flat, { lambda })
			const t = energyOfA(measurement, twoFlat, { lambda })
			assert.ok(t.total < f.total, `λ=${lambda}: two-flat ${t.total} vs flat ${f.total}`)
		}
		for (const lambda of [2, 4]) {
			const f = energyOfA(measurement, flat, { lambda })
			const t = energyOfA(measurement, twoFlat, { lambda })
			assert.ok(
				f.total < t.total,
				`λ=${lambda} is above the crossover, so flat should win: ${f.total} vs ${t.total}`,
			)
		}
	})
})

describe("(h) a band is not a foreground, even when a real ink colour is available", () => {
	it("ranks the verifier's second reproduction the right way round", async () => {
		// The verifier's other probe: arm A's own two-band fixture, which *does* contain ink (two 1-px
		// strokes), scored with the ink role pointed at the second band instead. Before the fix:
		//
		//   flat, fg = BAND_RIGHT (Ω = 0)   −7.8717   ← won
		//   two-flat, fg = INK    (Ω = 1)   −7.5028
		//
		// The Ω = 0 configuration that misdescribes half the image beat the Ω = 1 one that describes it
		// correctly *and* names the actual ink. That is decision 9's defect in its clearest form,
		// because here the correct answer is not even close in the model's own terms.
		const path = await writeRgbImage("energy-a-support-band.png", 64, 64, (x) => {
			if (STROKE_COLUMNS.has(x)) return INK
			return x < 32 ? BAND_LEFT : BAND_RIGHT
		})
		const measurement = await measureImage(path)

		const bandAsForeground = configuration({ background: BAND_LEFT, foreground: BAND_RIGHT })
		const twoFlatWithInk = configuration({
			background: BAND_LEFT,
			surface: BAND_RIGHT,
			foreground: INK,
		})
		const flatWithInk = configuration({ background: BAND_LEFT, foreground: INK })
		const bandPlusInkAccent = configuration({
			background: BAND_LEFT,
			foreground: BAND_RIGHT,
			accent: INK,
		})

		const misdescribed = energyOfA(measurement, bandAsForeground)
		const correct = energyOfA(measurement, twoFlatWithInk)

		assert.equal(misdescribed.nuisance.omega, 0)
		assert.equal(correct.nuisance.omega, 1)
		assert.ok(
			correct.total < misdescribed.total,
			`two-flat+ink ${correct.total} must beat band-as-foreground ${misdescribed.total}`,
		)

		// Stronger, and the form the emitter will actually meet: over all four configurations the
		// verifier probed, the honest description is the minimum.
		const probed = [
			["two-flat, fg=INK", correct],
			["flat, fg=INK", energyOfA(measurement, flatWithInk)],
			["flat, fg=BAND_RIGHT", misdescribed],
			["flat, fg=BAND_RIGHT + accent=INK", energyOfA(measurement, bandPlusInkAccent)],
		] as const
		for (const [label, result] of probed.slice(1)) {
			assert.ok(correct.total < result.total, `two-flat+ink ${correct.total} vs ${label} ${result.total}`)
		}

		// **What is deliberately not asserted, because the mechanism does not promise it.**
		// `flat, fg=BAND_RIGHT` still scores below `flat, fg=INK` (−5.25 against −3.98): given that
		// neither configuration offers a second *field* colour, naming the right band with the one
		// spare role does explain more colour mass than naming a 3%-of-image stroke, and arm A's
		// currency is explanatory cost. What decision 9 required is that this description no longer
		// beat the one that is actually right, and it no longer does — by 0.49 nats, where before the
		// fix it won by 0.37. Keeping a band out of an ink *role* is the contract's job:
		// `DESIGN.md`, "The mechanism" — *"the contract is the feasible set, never a term."*
	})
})

describe("(i) the extent code is a code, and the membership logistic is its posterior", () => {
	it("normalises to one, reproduces σ((ŝ*−ê)/w) exactly, and stays bounded", async () => {
		// Three properties, each of which a "penalty" bolted onto the ink term would fail:
		//
		//   1. q_field and q_ink each integrate to 1 over the rung interval [0, S]. A price that is not
		//      a density is not a code length, and `DESIGN.md`'s currency is code length.
		//   2. π₀·q_field(ê) / m(ê) is *exactly* `split.ts`'s σ((ŝ* − ê)/w). This is what makes the fix
		//      a derivation of arm A §2.2 rather than a replacement of it: the membership model did not
		//      change, the code around it gained the term it was missing.
		//   3. −log m(ê) is bounded, so the energy stays total.
		const path = await writeRgbImage("energy-a-extent-code.png", 32, 32, (x) =>
			x < 16 ? BAND_LEFT : BAND_RIGHT,
		)
		const ladder = extentLadderOf(await measureImage(path))
		const span = ladder.rungCount
		assert.ok(span > 0)

		// (1) trapezoid quadrature of each density over [0, S], at a resolution far finer than the
		// exponential's own scale of 2w rungs.
		const steps = 20_000
		const step = span / steps
		let fieldIntegral = 0
		let inkIntegral = 0
		for (let index = 0; index < steps; index += 1) {
			const low = extentDensities(index * step, ladder)
			const high = extentDensities((index + 1) * step, ladder)
			fieldIntegral += ((low.field + high.field) / 2) * step
			inkIntegral += ((low.ink + high.ink) / 2) * step
		}
		assert.ok(Math.abs(fieldIntegral - 1) < 1e-6, `∫q_field = ${fieldIntegral}`)
		assert.ok(Math.abs(inkIntegral - 1) < 1e-6, `∫q_ink = ${inkIntegral}`)

		// (2) the posterior identity, over the whole profile grid and the whole rung range.
		const probeRungs = new Float64Array(17)
		for (let index = 0; index < probeRungs.length; index += 1) {
			probeRungs[index] = (index * span) / (probeRungs.length - 1)
		}
		const membership = new Float64Array(probeRungs.length)
		const support = new Float64Array(probeRungs.length)
		let worstPosterior = 0
		let worstSupport = 0
		for (let splitScaleRung = 0; splitScaleRung <= span; splitScaleRung += 1) {
			fieldMembership(probeRungs, splitScaleRung, membership)
			extentSupportNats(probeRungs, splitScaleRung, ladder, support)
			const prior = extentFieldPrior(splitScaleRung, ladder)
			// π₀ = σ((ŝ* − S/2)/w) — the split scale read as a population prior.
			assert.ok(
				Math.abs(prior - 1 / (1 + Math.exp(-(splitScaleRung - span / 2) / FIELD_INK_SOFTNESS_OCTAVES))) <
					1e-15,
			)
			for (let index = 0; index < probeRungs.length; index += 1) {
				const { field, ink } = extentDensities(probeRungs[index], ladder)
				const marginal = prior * field + (1 - prior) * ink
				worstPosterior = Math.max(
					worstPosterior,
					Math.abs((prior * field) / marginal - membership[index]),
				)
				worstSupport = Math.max(worstSupport, Math.abs(-Math.log(marginal) - support[index]))
				assert.ok(Number.isFinite(support[index]) && support[index] > 0)
			}
		}
		assert.ok(worstPosterior < 1e-12, `posterior vs split.ts logistic: worst gap ${worstPosterior}`)
		assert.ok(worstSupport < 1e-12, `−log m(ê) vs extentSupportNats: worst gap ${worstSupport}`)

		// (3) the bound quoted in `support.ts`: the widest charge is at the extreme prior and the
		// opposite end of the ladder. At S = 8, w = 1 that is ≈ 8.7 nats.
		const extreme = new Float64Array([0, span])
		const charged = new Float64Array(2)
		let worstCharge = 0
		for (const splitScaleRung of [0, span]) {
			extentSupportNats(extreme, splitScaleRung, ladder, charged)
			worstCharge = Math.max(worstCharge, charged[0], charged[1])
		}
		assert.ok(worstCharge < 10, `widest support charge ${worstCharge} nats`)
	})
})

describe("(j) the support price carries no λ", () => {
	it("leaves the λ-multiplicativity of the objective exactly as it was", async () => {
		// `DESIGN.md`'s mechanism and arm A §4.3 both rest on λ appearing once, on Ω. The extent code
		// is part of the data term, so the sweep must not move it — checked on the diptych, where the
		// support term is doing the most work.
		const path = await writeRgbImage(
			"energy-a-support-lambda.png",
			64,
			64,
			(_x, y) => (y < 32 ? DIPTYCH_TOP : DIPTYCH_BOTTOM),
		)
		const measurement = await measureImage(path)
		const config = configuration({
			background: DIPTYCH_TOP,
			surface: DIPTYCH_BOTTOM,
			foreground: DIPTYCH_BOTTOM,
		})

		const results = [0.25, 0.5, 1, 2, 4].map((lambda) => energyOfA(measurement, config, { lambda }))
		for (const result of results) {
			assert.equal(result.terms.field, results[0].terms.field)
			assert.equal(result.terms.ink, results[0].terms.ink)
			assert.equal(result.nuisance.extentSupportCost, results[0].nuisance.extentSupportCost)
			assert.equal(result.nuisance.splitScaleRung, results[0].nuisance.splitScaleRung)
			assert.equal(result.nuisance.fieldPrior, results[0].nuisance.fieldPrior)
			// The support cost is reported *inside* field + ink, not alongside them: `terms` must still
			// sum to `total` with no fifth bucket.
			const sum = Object.values(result.terms).reduce((carry, value) => carry + value, 0)
			assert.ok(Math.abs(sum - result.total) < 1e-12)
		}
	})
})
