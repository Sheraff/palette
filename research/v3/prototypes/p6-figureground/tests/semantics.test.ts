/**
 * **`CandidateStats` normalisation semantics — the W2 → W4 contract, confirmed at integration.**
 *
 * SPEC "Integration directives — wave 2" item 5: *"`inkEnergy`/`markEnergy` are unnormalised area
 * integrals — divide by `presence` for a per-mass mean; `spatialSpread` is normalised so 1.0 =
 * uniform frame-wide fill. The energy's role-fitness terms must state which form they consume; a
 * silent mismatch rescales two terms against the rest and would masquerade as an exchange-rate
 * problem."*
 *
 * `src/types.ts` names each statistic but does not fix its normalisation, so both sides chose one.
 * This file measures what each side actually does, on a synthetic lattice whose answers are known
 * by construction, and pins it. Everything here is a fact about the *seam*, not about either
 * module's internals — the modules have their own tests.
 *
 * ## Result, stated before the tests so it cannot be missed
 *
 * | statistic | producer (`src/lattice/index.ts`) | consumer (`src/energy/terms.ts`) | verdict |
 * |---|---|---|---|
 * | `presence` | neighbourhood mass / frame area | `belongingCost`, `accentDensity` denominator | **confirmed** |
 * | `inkEnergy` | unnormalised area integral | `foregroundFitness`, `accentEnergy` — unnormalised | **confirmed** |
 * | `markEnergy` | unnormalised area integral | `accentEnergy` — unnormalised | **confirmed** |
 * | `fieldLikeness` | mass-weighted mean, [0,1] | clamped to [0,1] | **confirmed** |
 * | `borderAffinity` | annulus share / annulus area share, 1.0 = chance | `ratio(·, 1.0)` | **confirmed** |
 * | `habitualGround` | mass-weighted mean surround | distance to field path | **confirmed** |
 * | `centroidDistance` | OKLab distance | divided by the pooled bar | **confirmed** |
 * | `spatialSpread` | trace **already divided by 1/6**, 1.0 = frame-wide | `ratio(·, 1.0)` | **confirmed (was a MISMATCH; fixed 2026-08-04)** |
 *
 * ## The one mismatch this file found, and the fix that closed it
 *
 * As first measured, normalisation was applied twice, in exactly the shape directive 5 predicted:
 *
 * - `src/lattice/index.ts:105` — `spatialSpread: Math.max(variance, 0) / UNIFORM_FRAME_SPATIAL_SPREAD`,
 *   documented at `src/lattice/index.ts:36` as *"1.0 = as spread out as a uniform fill of the frame"*.
 * - `src/energy/terms.ts:181` — `ratio(stats.spatialSpread, ENERGY_ANCHORS.uniformSpatialSpread)`,
 *   whose anchor then read *"`CandidateStats.spatialSpread` is the trace of the normalised second
 *   spatial moment. For mass distributed uniformly over the unit square that trace is 1/12 + 1/12 =
 *   1/6"* — i.e. W4 assumed the **raw trace**, W2 shipped the **ratio**.
 *
 * **Measured consequence, while it stood.** The field-fitness spread factor was 6× its intended
 * value and clipped, reaching full marks at one sixth of a uniform fill instead of at a uniform
 * fill. A colour confined to a centred square of side 0.41 of the frame — **17% of the frame's
 * area** — already scored a perfect spread. Field fitness is `fieldLikeness × spread × border`, so
 * on the majority of real candidates one of its three factors was pinned at 1 and contributed no
 * discrimination at all; background and surface were scored on two factors, not three.
 *
 * **Fixed on the consumer side (SPEC integration directive 8, W7, 2026-08-04):**
 * `ENERGY_ANCHORS.uniformSpatialSpread` is **redefined to 1.0** — the value the *statistic* takes at
 * a uniform fill, which is what the anchor's name always meant and what `borderNeutralAffinity`
 * already did for the other saturating factor. `terms.ts` therefore consumes the producer's
 * normalised value directly and the second division is gone. The producer side
 * (`lattice/index.ts:105`) is untouched, so the alternative repair — deleting the *first* division —
 * is the one this file rules out: the lattice's own tests and `../src/types.ts`'s documented
 * convention both read the normalised form.
 *
 * The tests below assert **what is after the fix**, with the pre-fix behaviour recorded beside each
 * so the flip is legible in the diff rather than silent.
 *
 * Run: NODE_NO_WARNINGS=1 node --experimental-strip-types --test \
 *   research/v3/prototypes/p6-figureground/tests/semantics.test.ts
 */

import assert from "node:assert/strict"
import test from "node:test"

import { rgbToOkLab } from "../../../src/contract/color.ts"
import type { OkLab, Rgb8 } from "../../../src/contract/types.ts"
import { FIELD_1D_EXTRA_PARAMETERS, FIELD_DL_STEP_REJECTION_FLOOR } from "../src/fieldmodel/constants.ts"
import { UNIFORM_FRAME_SPATIAL_SPREAD } from "../src/lattice/constants.ts"
import { buildLatticeWith } from "../src/lattice/index.ts"
import { DEFAULT_EXCHANGE_RATES, ENERGY_ANCHORS } from "../src/energy/rates.ts"
import {
	accentDensity,
	accentEnergy,
	accentFitness,
	computeFitnessScales,
	fieldFitness,
	foregroundFitness,
	groundCoincidence,
} from "../src/energy/terms.ts"
import type { CandidateStats, Substrate } from "../src/types.ts"

// ---------------------------------------------------------------------------------------------
// A synthetic substrate with every per-pixel quantity dictated rather than measured
// ---------------------------------------------------------------------------------------------

/**
 * One synthetic material: a colour, and the per-pixel figure–ground quantities every pixel of that
 * colour carries. Constant per material, so every integral below has a closed form.
 */
type Material = Readonly<{
	rgb: Rgb8
	ink: number
	mark: number
	field: number
}>

/**
 * Build a conforming `Substrate` whose figure–ground planes are *stipulated*.
 *
 * Not `src/lattice/synthetic.ts`: that fixture derives plausible ink/mark/field planes from a blur
 * ladder, which is right for testing the lattice's arithmetic and wrong here — this file needs the
 * per-pixel values to be exactly known so that "the integral is unnormalised" is a statement with a
 * closed form on the other side of it. The ladder is present because the interface has one and is
 * never read: `buildLatticeWith` reads `planes` and `figureGround` only.
 *
 * `ground` is one constant colour for the whole frame, so `habitualGround` is that colour for every
 * candidate and `groundCoincidence` cannot confound the comparisons.
 */
function stipulatedSubstrate(
	size: number,
	materialAt: (x: number, y: number) => Material,
	groundColor: Rgb8,
): Substrate {
	const pixelCount = size * size
	const L = new Float32Array(pixelCount)
	const a = new Float32Array(pixelCount)
	const b = new Float32Array(pixelCount)
	const r8 = new Uint8Array(pixelCount)
	const g8 = new Uint8Array(pixelCount)
	const b8 = new Uint8Array(pixelCount)
	const inkEnergy = new Float32Array(pixelCount)
	const markEnergy = new Float32Array(pixelCount)
	const fieldWeight = new Float32Array(pixelCount)

	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const index = y * size + x
			const material = materialAt(x, y)
			const lab = rgbToOkLab(material.rgb)
			L[index] = lab[0]
			a[index] = lab[1]
			b[index] = lab[2]
			r8[index] = material.rgb[0]
			g8[index] = material.rgb[1]
			b8[index] = material.rgb[2]
			inkEnergy[index] = material.ink
			markEnergy[index] = material.mark
			fieldWeight[index] = material.field
		}
	}

	const groundLab = rgbToOkLab(groundColor)
	const ground = {
		L: new Float32Array(pixelCount).fill(Math.fround(groundLab[0])),
		a: new Float32Array(pixelCount).fill(Math.fround(groundLab[1])),
		b: new Float32Array(pixelCount).fill(Math.fround(groundLab[2])),
	}

	return {
		planes: { width: size, height: size, L, a, b, r8, g8, b8 },
		ladder: { sigmas: [], levels: [] },
		figureGround: { fieldWeight, inkEnergy, markEnergy, ground },
	}
}

/**
 * Materials are separated by ≳0.2 in OKLab lightness, an order of magnitude above the lattice's
 * bandwidth (the pooled same-colour bar, 0.01535), so `exp(−d²/2h²) < 1e-30` between any two of
 * them: every statistic read at one material's colour is that material's own integral, with no
 * cross-contamination to reason about.
 */
const DARK: Rgb8 = [20, 20, 20]
const MID: Rgb8 = [90, 90, 90]
const PALE: Rgb8 = [160, 160, 160]
const WHITE: Rgb8 = [240, 240, 240]

/** Every statistic the read produces is within this of its closed form (splat quadrature, §2.2). */
const QUADRATURE_TOLERANCE = 0.01

function close(actual: number, expected: number, tolerance = QUADRATURE_TOLERANCE): boolean {
	return Math.abs(actual - expected) <= Math.max(tolerance * Math.abs(expected), 1e-9)
}

// ---------------------------------------------------------------------------------------------
// 1. The confirmed half: unnormalised energies, per-mass means by division
// ---------------------------------------------------------------------------------------------

/**
 * Two colours carrying **identical ink per pixel**, one covering twice the area of the other. This
 * is directive 5's own test case: "a candidate with double the presence but the same per-mass ink
 * must behave as terms.ts intends".
 */
const SIZE = 64
const SMALL_ROWS = 4 // 4 × 64 = 256 px = 1/16 of the frame
const LARGE_ROWS = 8 // 8 × 64 = 512 px = 1/8 of the frame

const inkFixture = () => {
	const small: Material = { rgb: DARK, ink: 0.4, mark: 0.1, field: 0.2 }
	const large: Material = { rgb: MID, ink: 0.4, mark: 0.1, field: 0.2 }
	const filler: Material = { rgb: PALE, ink: 0.05, mark: 0, field: 0.9 }
	const substrate = stipulatedSubstrate(
		SIZE,
		(_x, y) => (y < SMALL_ROWS ? small : y < SMALL_ROWS + LARGE_ROWS ? large : filler),
		PALE,
	)
	const lattice = buildLatticeWith(substrate)
	return {
		lattice,
		small: lattice.statsAt(rgbToOkLab(DARK)),
		large: lattice.statsAt(rgbToOkLab(MID)),
		filler: lattice.statsAt(rgbToOkLab(PALE)),
	}
}

test("presence is a frame-area fraction, and doubling the area doubles it", () => {
	const { small, large, filler } = inkFixture()
	assert.ok(close(small.presence, 1 / 16), `small presence ${small.presence} vs 0.0625`)
	assert.ok(close(large.presence, 1 / 8), `large presence ${large.presence} vs 0.125`)
	assert.ok(close(filler.presence, 13 / 16), `filler presence ${filler.presence} vs 0.8125`)
	assert.ok(close(large.presence / small.presence, 2), "double the area is double the presence")
})

test("inkEnergy and markEnergy are UNNORMALISED area integrals — presence is the divisor", () => {
	const { small, large } = inkFixture()

	// The closed form: ∫ K_h(c(x) − v) · e(x) dx / frame area = (area fraction) × (per-pixel energy),
	// because every pixel of the material carries the same energy and no other colour is within
	// reach of the kernel.
	assert.ok(close(small.inkEnergy, (1 / 16) * 0.4), `small inkEnergy ${small.inkEnergy} vs 0.025`)
	assert.ok(close(large.inkEnergy, (1 / 8) * 0.4), `large inkEnergy ${large.inkEnergy} vs 0.05`)
	assert.ok(close(small.markEnergy, (1 / 16) * 0.1), `small markEnergy ${small.markEnergy}`)
	assert.ok(close(large.markEnergy, (1 / 8) * 0.1), `large markEnergy ${large.markEnergy}`)

	// The statement itself, twice over: the integral scales with area, and dividing by presence
	// recovers the per-mass mean — W2's "divide by `presence` for a per-mass mean", confirmed.
	assert.ok(close(large.inkEnergy / small.inkEnergy, 2), "double the area is double the integral")
	assert.ok(close(small.inkEnergy / small.presence, 0.4), "per-mass mean recovers the per-pixel value")
	assert.ok(close(large.inkEnergy / large.presence, 0.4), "and it is the same for both, by construction")
	assert.ok(close(large.markEnergy / large.presence, 0.1))
})

test("terms.ts consumes the energies unnormalised, and forms its own per-mass mean where it wants one", () => {
	const { small, large, filler } = inkFixture()
	const rates = DEFAULT_EXCHANGE_RATES
	const all = [small, large, filler]
	const scales = computeFitnessScales(all, rates)
	const field: readonly OkLab[] = [rgbToOkLab(PALE)]

	// Every material sits on the same ground, which is the field, so this factor is 1 throughout and
	// the comparisons below are about normalisation and nothing else.
	for (const stats of all) {
		assert.ok(close(groundCoincidence(stats, field), 1, 1e-6), "ground coincidence must not confound")
	}

	// (a) `foregroundFitness` reads the UNNORMALISED integral: twice the area of the same ink is
	//     twice the foreground fitness. That is `terms.ts`'s stated intent — "the role-fitness term
	//     wants *how much ink of this colour there is*, not the mean ink energy of however few
	//     pixels carry it" (`src/lattice/index.ts:32`) — so producer and consumer agree.
	assert.ok(close(scales.maxInkEnergy, (1 / 8) * 0.4), `scale ${scales.maxInkEnergy}`)
	assert.ok(close(foregroundFitness(large, field, scales), 1), "the largest ink integral sets the scale")
	assert.ok(close(foregroundFitness(small, field, scales), 0.5), "half the area, half the fitness")

	// (b) `accentEnergy` is likewise unnormalised, and `accentDensity` is the per-mass mean formed by
	//     dividing by presence — exactly the operation W2 documents, performed on the consumer side.
	assert.ok(close(accentEnergy(large, rates), 2 * accentEnergy(small, rates)), "energy scales with area")
	assert.ok(
		close(accentDensity(small, rates), accentDensity(large, rates)),
		`saliency per unit area is area-free: ${accentDensity(small, rates)} vs ${accentDensity(large, rates)}`,
	)
	// λ = accentAnisotropy, so the density is (mark + λ·ink) per unit mass = 0.1 + λ·0.4.
	assert.ok(close(accentDensity(small, rates), 0.1 + rates.accentAnisotropy * 0.4))

	// (c) So accent fitness separates the two only through the unnormalised factor. If either side
	//     ever normalised the other way, both factors would go flat and this would read 1.
	const scaled = computeFitnessScales(all, rates)
	assert.ok(close(accentFitness(large, field, scaled, rates), 1))
	assert.ok(close(accentFitness(small, field, scaled, rates), 0.5))
})

test("fieldLikeness, habitualGround and centroidDistance are per-mass means, as both sides assume", () => {
	const { small, filler } = inkFixture()

	// fieldLikeness: mass-weighted mean of the per-pixel weight, in [0,1] — not an area integral.
	assert.ok(close(small.fieldLikeness, 0.2), `small fieldLikeness ${small.fieldLikeness}`)
	assert.ok(close(filler.fieldLikeness, 0.9), `filler fieldLikeness ${filler.fieldLikeness}`)
	// It is scale-free: the large block carries the same per-pixel weight and reads the same value.
	assert.ok(close(inkFixture().large.fieldLikeness, 0.2))

	// habitualGround: the mass-weighted mean surround, in OKLab — a colour, not an integral.
	const groundLab = rgbToOkLab(PALE)
	for (let axis = 0; axis < 3; axis++) {
		assert.ok(
			Math.abs(small.habitualGround[axis] - groundLab[axis]) < 1e-3,
			`habitualGround axis ${axis}: ${small.habitualGround[axis]} vs ${groundLab[axis]}`,
		)
	}

	// centroidDistance: an OKLab distance, which `representativenessCost` divides by the pooled bar.
	// Every pixel of a material has that material's exact colour, so the distance is ~0.
	assert.ok(small.centroidDistance < 1e-3, `centroidDistance ${small.centroidDistance}`)
	assert.ok(ENERGY_ANCHORS.representativenessScale > 0, "and the consumer divides it by a bar, not by mass")
})

// ---------------------------------------------------------------------------------------------
// 2. The mismatch: spatialSpread is normalised twice
// ---------------------------------------------------------------------------------------------

/**
 * A frame carrying one colour spread uniformly over the whole frame and one confined to a centred
 * square, so both ends of the spread scale have a closed form:
 *
 * - `SPREAD_UNIFORM` fills every other cell of a checkerboard — uniform over the frame in the limit,
 *   so its normalised second moment is `1/12 + 1/12 = 1/6` and its reported `spatialSpread` is 1.0.
 * - `SPREAD_BLOCK` fills the other cells inside a centred square of side ½ the frame, so its trace
 *   is `2·(½)²/12 = 1/24` and its reported `spatialSpread` is `(½)² = 0.25`.
 */
const BLOCK_SIDE_FRACTION = 0.5

const spreadFixture = () => {
	const uniform: Material = { rgb: DARK, ink: 0, mark: 0, field: 1 }
	const block: Material = { rgb: PALE, ink: 0, mark: 0, field: 1 }
	const rest: Material = { rgb: WHITE, ink: 0, mark: 0, field: 1 }
	const low = Math.round((SIZE * (1 - BLOCK_SIDE_FRACTION)) / 2)
	const high = low + Math.round(SIZE * BLOCK_SIDE_FRACTION)
	const substrate = stipulatedSubstrate(
		SIZE,
		(x, y) => {
			if ((x + y) % 2 === 0) return uniform
			return x >= low && x < high && y >= low && y < high ? block : rest
		},
		WHITE,
	)
	const lattice = buildLatticeWith(substrate)
	return {
		uniform: lattice.statsAt(rgbToOkLab(DARK)),
		block: lattice.statsAt(rgbToOkLab(PALE)),
	}
}

test("PRODUCER: spatialSpread is already normalised — 1.0 is a uniform frame-wide fill", () => {
	const { uniform, block } = spreadFixture()

	// W2's stated convention, measured: a colour spread over the whole frame reads 1.0.
	assert.ok(close(uniform.spatialSpread, 1, 0.02), `uniform spatialSpread ${uniform.spatialSpread}`)
	// And a centred square of side s reads s² — a quarter of a uniform fill here.
	assert.ok(
		close(block.spatialSpread, BLOCK_SIDE_FRACTION ** 2, 0.05),
		`block spatialSpread ${block.spatialSpread} vs ${BLOCK_SIDE_FRACTION ** 2}`,
	)
	// Restated as the raw trace, for the comparison with the consumer's anchor below: the producer
	// has ALREADY divided by 1/6, so the raw trace of a uniform fill is 1/6 and it reports 1.0.
	assert.ok(close(uniform.spatialSpread * UNIFORM_FRAME_SPATIAL_SPREAD, 1 / 6, 0.02))

	// borderAffinity, by contrast, is confirmed: 1.0 = chance on both sides. A uniform colour reaches
	// the border exactly as often as chance; a colour confined to the middle never does.
	assert.ok(close(uniform.borderAffinity, 1, 0.02), `uniform borderAffinity ${uniform.borderAffinity}`)
	assert.ok(block.borderAffinity < 1e-6, `interior block borderAffinity ${block.borderAffinity}`)
	assert.equal(ENERGY_ANCHORS.borderNeutralAffinity, 1, "and the consumer's anchor agrees, at 1.0")
})

test("CONSUMER: terms.ts reads the producer's convention — the anchor IS the uniform-fill value", () => {
	// The anchor after directive 8's fix, and the reading of `spatialSpread` it encodes: the value the
	// STATISTIC takes at a uniform fill, which the producer already normalised to. `src/energy/rates.ts`.
	// (It read `1/6` — the raw trace — until 2026-08-04; that was the defect.)
	assert.equal(ENERGY_ANCHORS.uniformSpatialSpread, 1)
	// The value W2 ships at a uniform fill: 1.0. `src/lattice/index.ts:105`.
	assert.ok(close(spreadFixture().uniform.spatialSpread, 1, 0.02))
	// Producer and consumer now name the same number, so no rescale survives between them.
	assert.equal(1 / ENERGY_ANCHORS.uniformSpatialSpread, 1)
	// And it is written exactly like the other saturating factor, whose anchor was never wrong.
	assert.equal(ENERGY_ANCHORS.uniformSpatialSpread, ENERGY_ANCHORS.borderNeutralAffinity)
})

/** A stats value with everything neutral except the one field under test. */
function statsWithSpread(spatialSpread: number): CandidateStats {
	return {
		presence: 0.1,
		groundMass: 0,
		inkEnergy: 0,
		markEnergy: 0,
		habitualGround: [0, 0, 0],
		fieldLikeness: 1,
		spatialSpread,
		borderAffinity: 1,
		centroidDistance: 0,
	}
}

test("FIXED, measured: the field-fitness spread factor IS the statistic, saturating at a uniform fill", () => {
	// WHAT IS, after directive 8's fix: the factor is the producer's own value, clamped to [0,1].
	// (WHAT WAS, before it: all three of these read exactly 1 — the pre-fix pins, kept as comments so
	// the flip is legible. `assert.equal(fieldFitness(statsWithSpread(1 / 6)), 1)` etc.)
	assert.ok(close(fieldFitness(statsWithSpread(1 / 6)), 1 / 6), "a sixth of a uniform fill scores a sixth")
	assert.equal(fieldFitness(statsWithSpread(1)), 1, "a uniform fill scores full marks")
	assert.ok(close(fieldFitness(statsWithSpread(0.25)), 0.25), "the centred half-frame block scores 0.25")

	// The band the defect destroyed, restored: the upper five sixths of the spread scale discriminate
	// again, and the two ends of it are no longer the same number.
	assert.ok(
		fieldFitness(statsWithSpread(1 / 6)) < fieldFitness(statsWithSpread(1)),
		"the upper five sixths of the spread scale discriminates again",
	)
	assert.ok(
		close(fieldFitness(statsWithSpread(1)) / fieldFitness(statsWithSpread(1 / 6)), 6),
		"and the size of the recovered band is exactly the size of the old defect: 6×",
	)

	// Saturation is still there, at the right place: beyond a uniform fill nothing further is earned
	// (mass piled at two opposite corners is not more field-like than a field).
	assert.equal(fieldFitness(statsWithSpread(10)), 1, "and above a uniform fill it saturates")
	const saturatingSide = Math.sqrt(ENERGY_ANCHORS.uniformSpatialSpread)
	assert.equal(saturatingSide, 1, "a centred square reads s², so saturation begins at s = 1: the frame")

	// And the measured candidate, end to end: the centred half-frame block from the fixture above,
	// which covers a quarter of the frame, now scores a quarter rather than a perfect field spread.
	const { block } = spreadFixture()
	assert.ok(
		close(fieldFitness({ ...statsWithSpread(block.spatialSpread) }), BLOCK_SIDE_FRACTION ** 2, 0.05),
		`a colour on 25% of the frame scores ${fieldFitness(statsWithSpread(block.spatialSpread))}`,
	)
})

// ---------------------------------------------------------------------------------------------
// 3. The other seam directive 5 is about: the DL rate against the field model's reachable band
// ---------------------------------------------------------------------------------------------

test("the shipped fieldDescriptionLength sits inside the field model's reachable band", () => {
	// `tests/fieldmodel.test.ts` measures the band against its own local rate (0.25), not against the
	// registry, so nothing there would notice the registry drifting outside it — which is exactly
	// what had happened: the shipped value was 1.0 against a ceiling of 0.796, and above the ceiling
	// no artwork can ever be a gradient. SPEC "Integration directives — wave 2" item 2. Pinned here
	// because this is the seam between `src/energy/rates.ts` and `src/fieldmodel/`.
	const floor = FIELD_DL_STEP_REJECTION_FLOOR
	const ceiling = (0.5 * Math.log(1 + 0.25 / 0.00932 ** 2)) / FIELD_1D_EXTRA_PARAMETERS
	assert.ok(Math.abs(floor - 0.13863) < 1e-4, `floor ${floor}`)
	assert.ok(Math.abs(ceiling - 0.79645) < 1e-4, `ceiling ${ceiling}`)

	const rate = DEFAULT_EXCHANGE_RATES.fieldDescriptionLength
	assert.ok(rate > floor, `${rate} must exceed the step-rejection floor ${floor}`)
	assert.ok(rate < ceiling, `${rate} must sit below the gradient-reachability ceiling ${ceiling}`)
	// And it is the band's geometric mean to two digits, which is the stated reason for the digit.
	assert.ok(Math.abs(rate - Math.sqrt(floor * ceiling)) < 0.005, `${rate} vs √(floor·ceiling)`)
})
