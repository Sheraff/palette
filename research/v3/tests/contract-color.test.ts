/**
 * Colour maths tests for the v3 contract.
 *
 * The load-bearing test in this file is `apcaLc matches apca-w3`. `color.ts` reimplements APCA
 * because the package exposes only the clamped Lc and invariant 4 needs the raw pre-clamp value.
 * That reimplementation is only safe as long as its clamped output is provably identical to the
 * package's, over a grid of colour pairs, in both polarities and at both ends of the black clamp.
 * If that test ever fails, the constants in `constants.ts` have drifted from `SA98G` and every
 * epsilon in the contract is measuring something else.
 *
 * Run: NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/v3/tests/contract-*.test.ts
 */

import assert from "node:assert/strict"
import test from "node:test"

import { APCAcontrast, sRGBtoY } from "apca-w3"
import Color from "colorjs.io"

import {
	APCA_G4G,
	APCA_LC_TO_RAW_OFFSET,
	APCA_RAW_IDENTICAL_CEILING,
	APCA_RAW_LOW_CLIP,
	EPSILON_ACCENT_RAW,
	EPSILON_TEXT_RAW,
	LC_DEAD_BAND_CEILING,
	POOLED_SAME_COLOR_BAR,
	REGION_CHROMA_BOUNDARY,
	REGION_LIGHTNESS_BOUNDARY,
	SAME_COLOR_BAR_BY_REGION,
} from "../src/contract/constants.ts"
import {
	apcaLc,
	apcaRaw,
	ColorFormatError,
	colorDistance,
	colorFromHex,
	colorFromRgb,
	hex,
	hexToRgb,
	isHexColor,
	isRgb8,
	colorRegion,
	lcFloorToRawMagnitude,
	okLabDistance,
	okLabToRgb,
	resolveContrastFloor,
	rgbToApcaY,
	sameColorBar,
	rgbToHex,
	rgbToOkLab,
	sameColor,
} from "../src/contract/color.ts"
import {
	cie76,
	schemeExactDeltaERay,
} from "../src/contract/calibration/same-color-bar-translation.ts"
import type { Rgb8 } from "../src/contract/types.ts"

// ---------------------------------------------------------------------------------------------
// A deterministic colour grid, shared by several tests.
// ---------------------------------------------------------------------------------------------

/** Deterministic pseudo-random generator so a failure is always reproducible. */
function makeRandom(seed: number): () => number {
	let state = seed >>> 0
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0
		return state / 0x1_0000_0000
	}
}

function gridColors(): Rgb8[] {
	const colors: Rgb8[] = []
	// A coarse axis-aligned lattice: hits pure primaries, black, white and mid greys.
	for (const r of [0, 1, 5, 22, 64, 128, 200, 254, 255]) {
		for (const g of [0, 3, 22, 128, 255]) {
			for (const b of [0, 22, 128, 255]) colors.push([r, g, b])
		}
	}
	// Plus a seeded random spray, to catch anything the lattice is aligned with.
	const random = makeRandom(20260802)
	for (let i = 0; i < 400; i++) {
		colors.push([
			Math.floor(random() * 256),
			Math.floor(random() * 256),
			Math.floor(random() * 256),
		])
	}
	return colors
}

// ---------------------------------------------------------------------------------------------
// sRGB representation
// ---------------------------------------------------------------------------------------------

test("hex is canonical: lowercase six-digit only, and round-trips through rgb", () => {
	assert.equal(rgbToHex([16, 24, 32]), "#101820")
	assert.deepEqual(hexToRgb(hex("#101820")), [16, 24, 32])

	for (const bad of ["#FFFFFF", "#fff", "ffffff", "#gggggg", "#1234567", ""]) {
		assert.equal(isHexColor(bad), false, `${bad} must not be canonical`)
		assert.throws(() => hex(bad), ColorFormatError)
	}
	assert.equal(isHexColor("#0a1b2c"), true)
})

test("every 8-bit triple round-trips hex → rgb → hex", () => {
	for (const rgb of gridColors()) {
		assert.deepEqual(hexToRgb(rgbToHex(rgb)), rgb)
	}
})

test("isRgb8 rejects non-integers, out-of-range channels and wrong arity", () => {
	assert.equal(isRgb8([0, 0, 0]), true)
	assert.equal(isRgb8([255, 255, 255]), true)
	assert.equal(isRgb8([0, 0, 256]), false)
	assert.equal(isRgb8([-1, 0, 0]), false)
	assert.equal(isRgb8([0, 0.5, 0]), false)
	assert.equal(isRgb8([0, 0]), false)
	assert.equal(isRgb8("#000000"), false)
})

test("colorFromRgb and colorFromHex always agree with each other", () => {
	for (const rgb of gridColors()) {
		const fromRgb = colorFromRgb(rgb)
		const fromHex = colorFromHex(rgbToHex(rgb))
		assert.equal(fromRgb.hex, fromHex.hex)
		assert.deepEqual(fromRgb.rgb, fromHex.rgb)
	}
})

// ---------------------------------------------------------------------------------------------
// OKLab
// ---------------------------------------------------------------------------------------------

test("rgbToOkLab agrees with colorjs.io to 1e-6", () => {
	for (const rgb of gridColors()) {
		const ours = rgbToOkLab(rgb)
		const theirs = new Color("srgb", [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255]).to("oklab").coords
		for (let axis = 0; axis < 3; axis++) {
			assert.ok(
				Math.abs(ours[axis] - theirs[axis]) < 1e-6,
				`axis ${axis} for ${rgbToHex(rgb)}: ours ${ours[axis]} vs colorjs ${theirs[axis]}`,
			)
		}
	}
})

test("okLabToRgb inverts rgbToOkLab exactly at 8-bit precision", () => {
	for (const rgb of gridColors()) {
		assert.deepEqual(okLabToRgb(rgbToOkLab(rgb)), rgb, `round trip failed for ${rgbToHex(rgb)}`)
	}
})

test("the one ruler is a metric: zero on identity, symmetric, and obeys the triangle inequality", () => {
	const colors = gridColors().slice(0, 60)
	for (const a of colors) {
		assert.equal(okLabDistance(rgbToOkLab(a), rgbToOkLab(a)), 0)
		for (const b of colors) {
			const ab = okLabDistance(rgbToOkLab(a), rgbToOkLab(b))
			const ba = okLabDistance(rgbToOkLab(b), rgbToOkLab(a))
			assert.equal(ab, ba)
			for (const c of colors.slice(0, 10)) {
				const ac = okLabDistance(rgbToOkLab(a), rgbToOkLab(c))
				const cb = okLabDistance(rgbToOkLab(c), rgbToOkLab(b))
				assert.ok(ac + cb >= ab - 1e-12, "triangle inequality")
			}
		}
	}
})

test("colorRegion places colors by the bracketing round's own strata boundaries", () => {
	assert.equal(colorRegion(colorFromHex("#101820")), "dark-neutral") // L 0.205, C 0.020
	assert.equal(colorRegion(colorFromHex("#002bff")), "dark-saturated") // L 0.476, C 0.297
	assert.equal(colorRegion(colorFromHex("#f2f5f7")), "light-neutral") // L 0.968, C 0.004
	assert.equal(colorRegion(colorFromHex("#e0533a")), "light-saturated") // L 0.627, C 0.181
	assert.equal(colorRegion(colorFromHex("#000000")), "dark-neutral")
	assert.equal(colorRegion(colorFromHex("#ffffff")), "light-neutral")

	// The boundaries are exactly the fixture's: below is dark/neutral, at-or-above is light/saturated.
	assert.equal(REGION_LIGHTNESS_BOUNDARY, 0.55)
	assert.equal(REGION_CHROMA_BOUNDARY, 0.05)
})

test("sameColor uses this pair's regional bar, and the bars are the reviewer's measured values", () => {
	// One distance, judged two ways — the finding that refuted a single threshold.
	const darkNeutralPair = [colorFromHex("#1e2a38"), colorFromHex("#162a34")] as const
	const lightSaturatedPair = [colorFromHex("#bc4758"), colorFromHex("#b74b60")] as const
	const distance = colorDistance(...darkNeutralPair)
	assert.ok(Math.abs(distance - colorDistance(...lightSaturatedPair)) < 1e-5, "same distance")

	assert.equal(sameColorBar(...darkNeutralPair), SAME_COLOR_BAR_BY_REGION["dark-neutral"])
	assert.equal(sameColorBar(...lightSaturatedPair), SAME_COLOR_BAR_BY_REGION["light-saturated"])
	assert.equal(sameColor(...darkNeutralPair), false, "0.0140 is distinct among dark neutrals")
	assert.equal(sameColor(...lightSaturatedPair), true, "0.0140 is one color among light saturateds")

	// The demonstration survives the measurement's own uncertainty: the distance sits above
	// dark-neutral's whole confidence interval and below light-saturated's whole interval.
	assert.ok(distance > 0.01137, "above dark-neutral's CI high")
	assert.ok(distance < 0.01658, "below light-saturated's CI low")

	// The stable part of the ordering, across both rounds: dark-neutral tightest, light-saturated
	// loosest, by roughly 2.5x. The middle two are NOT asserted against each other — their intervals
	// overlap almost entirely and pooling round 2 swapped them, so any order there is noise.
	const bars = SAME_COLOR_BAR_BY_REGION
	assert.ok(bars["dark-neutral"] < bars["dark-saturated"])
	assert.ok(bars["dark-neutral"] < bars["light-neutral"])
	assert.ok(bars["dark-saturated"] < bars["light-saturated"])
	assert.ok(bars["light-neutral"] < bars["light-saturated"])
	assert.ok(bars["light-saturated"] / bars["dark-neutral"] > 2)

	// The bar is overridable, for a future sweep.
	assert.equal(sameColor(...darkNeutralPair, 0.02), true)
})

test("a straddling pair takes the larger of the two regions' bars", () => {
	// #0e152e is dark-saturated (bar 0.01502), #111830 dark-neutral (bar 0.00932); the chroma
	// boundary runs between them. Their distance, 0.01217, is the exact midpoint of the two bars —
	// so the rule decides the answer with equal room either way, and the documented choice is the
	// larger.
	const first = colorFromHex("#0e152e")
	const second = colorFromHex("#111830")
	assert.equal(colorRegion(first), "dark-saturated")
	assert.equal(colorRegion(second), "dark-neutral")
	const distance = colorDistance(first, second)
	assert.ok(distance > SAME_COLOR_BAR_BY_REGION["dark-neutral"])
	assert.ok(distance < SAME_COLOR_BAR_BY_REGION["dark-saturated"])

	assert.equal(sameColorBar(first, second), SAME_COLOR_BAR_BY_REGION["dark-saturated"])
	assert.equal(sameColor(first, second), true, "the larger bar calls them the same color")
	// Symmetric: the order of the arguments cannot change the bar.
	assert.equal(sameColorBar(second, first), sameColorBar(first, second))
})

test("the ruler is still one scalar per region — two measured findings are deliberately not encoded", () => {
	// Tripwire, not a proof. Rounds 1+2 measured two things the contract knowingly does not yet
	// express; both await a dedicated round before the ruler is allowed to grow dimensions. If a
	// later change encodes either one, this test should fail and be rewritten on purpose rather
	// than the findings quietly staying unimplemented forever.
	//
	// 1. light-saturated is not one population: by hue third it reads 0.01516 / 0.02074 / 0.03805,
	//    a 2.5x spread. The single bar below is therefore known to be too loose for warm colours and
	//    too tight for violets.
	assert.equal(SAME_COLOR_BAR_BY_REGION["light-saturated"], 0.02293)
	assert.equal(
		typeof SAME_COLOR_BAR_BY_REGION["light-saturated"],
		"number",
		"still one number per region — no hue dependence yet",
	)
	assert.ok(0.01516 < SAME_COLOR_BAR_BY_REGION["light-saturated"], "warm third sits below the single bar")
	assert.ok(0.03805 > SAME_COLOR_BAR_BY_REGION["light-saturated"], "violet third sits above it")

	// 2. The distance itself looks anisotropic under register-as-same: at a matched 0.015, a
	//    lightness-only difference read as "same" 4/4, chroma-only 2/4, hue-only 1/4. `sameColorBar`
	//    takes only the two colours and returns a scalar, so direction cannot influence it — which
	//    is the simplification being tracked.
	assert.equal(sameColorBar.length, 2, "the bar is a function of the pair only, not of direction")
	const lightnessOnly = [colorFromHex("#808080"), colorFromHex("#848484")] as const
	const hueOnly = [colorFromHex("#bc4758"), colorFromHex("#bc4750")] as const
	// Same region, so the same bar applies to both, whatever direction they point in.
	assert.equal(colorRegion(lightnessOnly[0]), colorRegion(lightnessOnly[1]))
	assert.equal(sameColorBar(...hueOnly), SAME_COLOR_BAR_BY_REGION[colorRegion(hueOnly[0])])
})

test("the pooled bar is kept as a reference and is not what any pair is judged against", () => {
	assert.equal(POOLED_SAME_COLOR_BAR, 0.01535)
	// The measurement that produced it also refuted it, now from both ends: pooled over rounds 1+2,
	// dark-neutral's CI (0.00764-0.01137) and light-saturated's (0.01658-0.03170) both exclude it.
	assert.ok(POOLED_SAME_COLOR_BAR > 0.01137, "above dark-neutral's confidence interval")
	assert.ok(POOLED_SAME_COLOR_BAR < 0.01658, "below light-saturated's confidence interval")
	// No region's bar equals it, so nothing silently falls back to it.
	for (const bar of Object.values(SAME_COLOR_BAR_BY_REGION)) {
		assert.notEqual(bar, POOLED_SAME_COLOR_BAR)
	}
})

test("the superseded translation prior is still reproducible from its recorded protocol", () => {
	// The constant's comment records a specific, seeded protocol, because the answer depends on the
	// protocol: the local-offset scheme's median moves from 0.0096 to 0.0170 across plausible radii.
	// This test re-runs the knob-free scheme at a smaller sample and checks it still lands where the
	// comment says, so the provenance cannot rot into a number nobody can reproduce.
	const summary = schemeExactDeltaERay(3_000, 555)
	assert.equal(summary.n, 3_000)
	assert.ok(
		Math.abs(summary.median - 0.01162) < 0.0005,
		`recorded median 0.01162, measured ${summary.median.toFixed(5)}`,
	)
	// The prior this produced (0.012) is superseded by the reviewer's measured regional bars; it is
	// still within a whisker of the pooled measurement, which is a mild sanity check on both.
	assert.ok(Math.abs(POOLED_SAME_COLOR_BAR - summary.median) < 0.005)

	// And the CIE76 used for the translation really is v2-3's ruler, D65 and all. Blue against black
	// is the discriminating pair: 137.65 under D65, 134.49 under D50. Getting this wrong is not
	// hypothetical — the constant's first derivation used colorjs.io's D50 `lab` by mistake.
	assert.ok(Math.abs(cie76([0, 0, 255], [0, 0, 0]) - 137.6502) < 1e-3, "white point must be D65")
	// White against black is L 100 by definition. It lands 4e-6 over because v2-3's luminance matrix
	// row sums to 1.0000001 rather than 1 — inherited verbatim, and far too small to matter at ΔE 3.3.
	assert.ok(Math.abs(cie76([255, 255, 255], [0, 0, 0]) - 100) < 1e-5)
})

// ---------------------------------------------------------------------------------------------
// APCA — the cross-check that keeps the reimplementation honest
// ---------------------------------------------------------------------------------------------

test("rgbToApcaY matches apca-w3's sRGBtoY exactly", () => {
	for (const rgb of gridColors()) {
		assert.equal(rgbToApcaY(rgb), sRGBtoY([rgb[0], rgb[1], rgb[2]]))
	}
})

test("apcaLc matches apca-w3 on a grid of color pairs", () => {
	const colors = gridColors()
	let pairs = 0
	for (let i = 0; i < colors.length; i++) {
		// Pair each colour with a stride of partners, so the grid covers both polarities, identical
		// pairs, and pairs straddling the black soft clamp, without going quadratic.
		for (let step = 0; step < colors.length; step += 7) {
			const text = colors[i]
			const background = colors[(i + step) % colors.length]
			const ours = apcaLc(text, background)
			const theirs = APCAcontrast(sRGBtoY([...text]), sRGBtoY([...background])) as number
			assert.ok(
				Math.abs(ours - theirs) < 1e-9,
				`${rgbToHex(text)} on ${rgbToHex(background)}: ours ${ours} vs apca-w3 ${theirs}`,
			)
			pairs++
		}
	}
	assert.ok(pairs > 10_000, `expected a substantial grid, got ${pairs} pairs`)
})

test("raw is what apca-w3 clamps away: |raw| < 10 is exactly where the package reports Lc 0", () => {
	for (const text of gridColors()) {
		for (const background of gridColors().slice(0, 40)) {
			const raw = apcaRaw(text, background)
			const lc = apcaLc(text, background)
			if (Math.abs(raw) >= APCA_RAW_LOW_CLIP) {
				// Above the clip, Lc is raw minus the offset, with the sign preserved.
				assert.ok(lc !== 0)
				assert.ok(
					Math.abs(Math.abs(raw) - (Math.abs(lc) + APCA_LC_TO_RAW_OFFSET)) < 1e-9,
					`${rgbToHex(text)} on ${rgbToHex(background)}: raw ${raw}, lc ${lc}`,
				)
				assert.equal(Math.sign(raw), Math.sign(lc))
			}
		}
	}
})

test("raw carries information exactly where Lc has none", () => {
	// Every one of these pairs reports Lc 0. Their raw values are all different, which is the whole
	// reason invariant 4 is defined on the raw scale.
	const pairs: [Rgb8, Rgb8][] = [
		[[128, 128, 128], [128, 128, 128]],
		[[202, 0, 255], [128, 128, 128]],
		[[130, 128, 128], [128, 128, 128]],
		[[136, 128, 128], [128, 128, 128]],
	]
	const raws = new Set<number>()
	for (const [text, background] of pairs) {
		assert.equal(apcaLc(text, background), 0, `${rgbToHex(text)} on ${rgbToHex(background)} should clamp to Lc 0`)
		raws.add(apcaRaw(text, background))
	}
	assert.equal(raws.size, pairs.length, "raw must distinguish pairs that Lc cannot")
})

test("the identical-color ceiling is a true bound, checked against the analytic extremum", () => {
	// For identical inputs the raw value is (Y^0.65 - Y^0.62)·114, whose extremum sits at
	// Y* = (0.62/0.65)^(1/0.03). A numeric scan is not good enough here: the first version of this
	// constant was a scan result rounded DOWN, and a real 8-bit pair exceeded it.
	const optimalY = (APCA_G4G.revTXT / APCA_G4G.revBG) ** (1 / (APCA_G4G.revBG - APCA_G4G.revTXT))
	const residueAt = (y: number) =>
		Math.abs((y ** APCA_G4G.revBG - y ** APCA_G4G.revTXT) * APCA_G4G.scaleWoB * 100)
	const analyticMaximum = residueAt(optimalY)

	assert.ok(Math.abs(optimalY - 0.206987647443) < 1e-9, `Y* = ${optimalY}`)
	assert.ok(Math.abs(analyticMaximum - 1.98151924695) < 1e-9, `analytic max = ${analyticMaximum}`)
	assert.ok(
		APCA_RAW_IDENTICAL_CEILING >= analyticMaximum,
		`the recorded ceiling ${APCA_RAW_IDENTICAL_CEILING} must not sit below the analytic maximum ${analyticMaximum}`,
	)
	// It is a bound, not a wild over-estimate.
	assert.ok(APCA_RAW_IDENTICAL_CEILING - analyticMaximum < 1e-4)

	// The extremum really is a maximum: nothing either side of it goes higher.
	for (const offset of [-1e-3, -1e-5, 1e-5, 1e-3]) {
		assert.ok(residueAt(optimalY + offset) <= analyticMaximum)
	}
	// The soft clamp cannot reach Y*: it maps [0, blkThrs] into a band far below it.
	const clampedCeiling = APCA_G4G.blkThrs
	assert.ok(clampedCeiling < optimalY)
})

test("the recorded ceiling holds for the real 8-bit pair that refuted its first value", () => {
	// #df11de has Y = 0.2069805, essentially at Y*. It produced |raw| 1.981519246 — 1.9e-5 above the
	// original 1.9815, which is how the verifier showed a rounded-down bound is not a bound.
	const witness: Rgb8 = [0xdf, 0x11, 0xde]
	const residue = Math.abs(apcaRaw(witness, witness))
	assert.ok(residue > 1.9815, `#df11de residue ${residue} should exceed the refuted value`)
	assert.ok(
		residue <= APCA_RAW_IDENTICAL_CEILING,
		`#df11de residue ${residue} exceeds the recorded ceiling ${APCA_RAW_IDENTICAL_CEILING}`,
	)
})

test("no 8-bit color, identical to itself, exceeds the recorded ceiling", () => {
	// A seeded sweep plus every grey. Exhaustive over 16.7M colors is too slow for a unit test; the
	// analytic bound above is what makes this a spot check rather than the proof.
	for (let channel = 0; channel <= 255; channel++) {
		const grey: Rgb8 = [channel, channel, channel]
		assert.ok(Math.abs(apcaRaw(grey, grey)) <= APCA_RAW_IDENTICAL_CEILING)
	}
	const random = makeRandom(20260802)
	for (let i = 0; i < 200_000; i++) {
		const color: Rgb8 = [
			Math.floor(random() * 256),
			Math.floor(random() * 256),
			Math.floor(random() * 256),
		]
		const residue = Math.abs(apcaRaw(color, color))
		assert.ok(
			residue <= APCA_RAW_IDENTICAL_CEILING,
			`${rgbToHex(color)} residue ${residue} exceeds ${APCA_RAW_IDENTICAL_CEILING}`,
		)
	}
})

test("identical colors do not produce raw 0, and both epsilons clear the ceiling", () => {
	// APCA's reverse branch raises the background to 0.65 and the text to 0.62, so identical inputs
	// leave a luminance-dependent residue. An epsilon at or under it could not flag an identical pair.
	assert.ok(Math.abs(apcaRaw([128, 128, 128], [128, 128, 128])) > 1.7)
	assert.ok(
		EPSILON_TEXT_RAW > APCA_RAW_IDENTICAL_CEILING,
		"the text epsilon must exceed the identical-color ceiling or invariant 4 cannot flag an identical pair",
	)
	assert.ok(
		EPSILON_ACCENT_RAW > APCA_RAW_IDENTICAL_CEILING,
		"the accent epsilon must exceed the identical-color ceiling",
	)
})

test("both epsilons sit inside Lc's dead band, as the contract requires of the defaults", () => {
	for (const epsilon of [EPSILON_TEXT_RAW, EPSILON_ACCENT_RAW]) {
		assert.ok(epsilon > 0)
		assert.ok(
			epsilon < APCA_RAW_LOW_CLIP,
			`epsilon ${epsilon} must stay below the low clip ${APCA_RAW_LOW_CLIP}, or it would be expressible in Lc`,
		)
	}
})

test("the Lc/raw scale constants match their derivation from apca-w3's SA98G table", () => {
	// These are written as literals in constants.ts because they are thresholds and binary floating
	// point turns `0.1 * 100` into 10.000000000000002. This test is what keeps the literals honest.
	assert.ok(Math.abs(APCA_RAW_LOW_CLIP - APCA_G4G.loClip * 100) < 1e-9)
	assert.ok(Math.abs(LC_DEAD_BAND_CEILING - (APCA_G4G.loClip - APCA_G4G.loBoWoffset) * 100) < 1e-9)
	assert.ok(Math.abs(APCA_LC_TO_RAW_OFFSET - APCA_G4G.loBoWoffset * 100) < 1e-9)
	// The conversion is only symmetric in polarity because both offsets are equal in 0.1.9.
	assert.equal(APCA_G4G.loBoWoffset, APCA_G4G.loWoBoffset)
})

test("apcaRaw returns NaN rather than 0 for non-finite input, so an error cannot read as invisibility", () => {
	assert.ok(Number.isNaN(apcaRaw([Number.NaN as unknown as number, 0, 0], [0, 0, 0])))
})

// ---------------------------------------------------------------------------------------------
// The contrast parameters: public Lc, internal raw
// ---------------------------------------------------------------------------------------------

test("Lc floors inside the dead band carry no information and resolve to the epsilon", () => {
	for (const requested of [0, 1, 5, 7.29]) {
		assert.equal(lcFloorToRawMagnitude(requested), 0, `Lc ${requested} is inside the dead band`)
		assert.equal(resolveContrastFloor(requested, EPSILON_TEXT_RAW), EPSILON_TEXT_RAW)
	}
})

test("Lc floors above the dead band convert exactly and symmetrically in polarity", () => {
	for (const requested of [7.3, 15, 45, 60, 90]) {
		assert.equal(lcFloorToRawMagnitude(requested), requested + APCA_LC_TO_RAW_OFFSET)
		assert.equal(lcFloorToRawMagnitude(-requested), requested + APCA_LC_TO_RAW_OFFSET)
	}
})

test("a caller can raise a floor but never lower it below the epsilon", () => {
	assert.equal(resolveContrastFloor(60, EPSILON_TEXT_RAW), 62.7)
	assert.equal(resolveContrastFloor(0, EPSILON_TEXT_RAW), EPSILON_TEXT_RAW)
	// Even a deliberately tiny request cannot get under the epsilon.
	assert.equal(resolveContrastFloor(0.0001, EPSILON_TEXT_RAW), EPSILON_TEXT_RAW)
})

test("a non-finite contrast floor is an error, not a silently ignored request", () => {
	assert.throws(() => lcFloorToRawMagnitude(Number.NaN), ColorFormatError)
	assert.throws(() => lcFloorToRawMagnitude(Number.POSITIVE_INFINITY), ColorFormatError)
})
