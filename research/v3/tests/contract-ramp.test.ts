/**
 * Tests for the rendered-ramp machinery behind invariant 4's whole-ramp contrast floors.
 *
 * `[REVIEWED — reviewer's ruling, 2026-08-03]`, on two points: the accent's minimum contrast is
 * checked against gradient backgrounds the way the foreground's is, and *"it's not 'each stop' by the
 * way, because the contrast issue could happen somewhere in the middle of 2 points too"* — so both
 * floors hold over the entire rendered ramp. And on the space: *"sampled in the interpolation space
 * the player actually renders — this space is OKLab."*
 *
 * **This file is the provenance for `RAMP_SAMPLES_PER_SEGMENT` and `RAMP_REFINEMENT_SAMPLES`.**
 * `CONVENTIONS.md` requires every number to say where it comes from; these two say "measured here",
 * so the measurements are tests rather than a script that was run once and thrown away. Every figure
 * quoted in those two docstrings is re-derived below and the assertions fail if any of them stops
 * holding.
 *
 * Run: NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/v3/tests/contract-*.test.ts
 */

import assert from "node:assert/strict"
import test from "node:test"

import { apcaRaw, colorDistance, colorFromHex, colorFromRgb, okLabToRgb, rgbToOkLab } from "../src/contract/color.ts"
import {
	ACCENT_VISIBILITY_COLOR_DISTANCE,
	APCA_RAW_IDENTICAL_CEILING,
	EPSILON_ACCENT_RAW,
	EPSILON_TEXT_RAW,
	RAMP_REFINEMENT_SAMPLES,
	RAMP_SAMPLES_PER_SEGMENT,
} from "../src/contract/constants.ts"
import {
	accentInvisibleMidRamp,
	foregroundInvisibleMidRamp,
	validGradient,
} from "../src/contract/fixtures.ts"
import {
	minRawContrastOverRamp,
	RAMP_INTERPOLATION_SPACE,
	rampColorAt,
	rampPath,
	sampleRamp,
} from "../src/contract/ramp.ts"
import {
	displayPosition,
	displayStops,
	gradientCss,
	GRADIENT_DISPLAY_INTERPOLATION,
} from "../src/review-server/gradient.ts"
import type { GradientStop, Rgb8 } from "../src/contract/types.ts"

// ---------------------------------------------------------------------------------------------
// Helpers — seeded, so every number in this file is reproducible
// ---------------------------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

function stopsFrom(colors: readonly Rgb8[]): GradientStop[] {
	return colors.map((rgb, index) => ({ color: colorFromRgb(rgb), position: index / (colors.length - 1) }))
}

function lerp3(a: readonly number[], b: readonly number[], u: number): [number, number, number] {
	return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
}

/** What the browser would render if the `in oklab` hint were missing: plain sRGB interpolation. */
function srgbRampColorAt(from: Rgb8, to: Rgb8, u: number): Rgb8 {
	return [
		Math.round(from[0] + (to[0] - from[0]) * u),
		Math.round(from[1] + (to[1] - from[1]) * u),
		Math.round(from[2] + (to[2] - from[2]) * u),
	]
}

// ---------------------------------------------------------------------------------------------
// The interpolation space — one value, and the CSS actually carries it
// ---------------------------------------------------------------------------------------------

test("the ramp is sampled in the space the pinned renderer declares, and there is only one such value", () => {
	// The reviewer's statement, and the emitter's declaration, have to be the same thing or the
	// validator measures a ramp nobody renders.
	assert.equal(RAMP_INTERPOLATION_SPACE, "oklab")
	assert.equal(GRADIENT_DISPLAY_INTERPOLATION, RAMP_INTERPOLATION_SPACE)

	// And the hint reaches the browser. A `linear-gradient()` with no `in <space>` is interpolated in
	// sRGB by CSS — the emitter must not be able to lose this silently.
	const css = gradientCss(displayStops(
		{ stops: [{ color: "#101820", position: 0 }, { color: "#4a6b8a", position: 1 }] },
		{},
	))
	assert.ok(css.includes(`in ${RAMP_INTERPOLATION_SPACE}`), css)
	assert.match(css, /^linear-gradient\(135deg in oklab, /u)
})

test("the space is not academic: sRGB interpolation renders a materially different ramp", () => {
	// Why the missing-hint case would be a defect rather than a nuance. Measured, so the claim in
	// `gradient.ts`'s docstring has provenance.
	const random = mulberry32(20260803)
	const randRgb = (): Rgb8 => [
		Math.floor(random() * 256),
		Math.floor(random() * 256),
		Math.floor(random() * 256),
	]

	let maxDistance = 0
	let maxRawGap = 0
	for (let trial = 0; trial < 2000; trial++) {
		const from = randRgb()
		const to = randRgb()
		const subject = randRgb()
		const fromLab = rgbToOkLab(from)
		const toLab = rgbToOkLab(to)
		for (let step = 1; step < 32; step++) {
			const u = step / 32
			const inOkLab = okLabToRgb(lerp3(fromLab, toLab, u))
			const inSrgb = srgbRampColorAt(from, to, u)
			maxDistance = Math.max(maxDistance, colorDistance(colorFromRgb(inOkLab), colorFromRgb(inSrgb)))
			maxRawGap = Math.max(
				maxRawGap,
				Math.abs(Math.abs(apcaRaw(subject, inOkLab)) - Math.abs(apcaRaw(subject, inSrgb))),
			)
		}
	}
	// The figures quoted in `review-server/gradient.ts`: 0.153 OKLab, 20.5 raw APCA units.
	assert.ok(maxDistance > 0.15, `max OKLab divergence ${maxDistance}`)
	assert.ok(maxRawGap > 20, `max |raw| divergence ${maxRawGap}`)
	// Which is many same-colour bars, and eight epsilons of contrast — not a rounding difference.
	assert.ok(maxRawGap > EPSILON_TEXT_RAW * 8)
})

// ---------------------------------------------------------------------------------------------
// Which ramp the floor governs — published positions, and why display-mapped comes free
// ---------------------------------------------------------------------------------------------

test("the display mapping reparameterizes the ramp without changing the colours on it", () => {
	// REVIEW_UI.md §3's mapping is a strictly increasing affine function of published position that
	// leaves every stop's colour and order alone. Reparameterizing a curve does not change the curve,
	// so the minimum over the display ramp equals the minimum over the published one — which is why
	// invariant 4 governs the published ramp and the mock's ramp is a consequence rather than a
	// second check.
	for (const palette of [validGradient, foregroundInvisibleMidRamp, accentInvisibleMidRamp]) {
		const stops = palette.gradient!.stops
		const count = stops.length

		// The display ramp: every stop moved to its display position, plus the flat lead-in that CSS
		// renders before the first stop.
		const displayed: GradientStop[] = [
			{ color: stops[0].color, position: 0 },
			...stops.map((stop) => ({
				color: stop.color,
				position: displayPosition(stop.position, count),
			})),
		]

		for (const role of ["foreground", "accent"] as const) {
			const subject = palette.roles[role]
			const published = Math.abs(minRawContrastOverRamp(subject, stops)!.raw)
			const display = Math.abs(minRawContrastOverRamp(subject, displayed)!.raw)
			const where = `${subject.hex} over ${stops.map((stop) => stop.color.hex).join("->")} (${role})`

			// The two ramps carry the same colours, so what must agree is the *verdict* at every floor
			// a caller can request. What cannot be asserted bit-for-bit is the reported number: the two
			// parameterizations put their samples in different places, so each finds a slightly
			// different 8-bit quantisation cell at the bottom of a basin. That is the documented
			// deep-basin residual of `RAMP_REFINEMENT_SAMPLES`, not a difference between the ramps.
			for (let tenths = 25; tenths <= 1080; tenths += 5) {
				const floor = tenths / 10
				assert.equal(published < floor, display < floor, `${where} at floor ${floor}`)
			}
			// And where the minimum is not in a deep basin, the numbers agree closely too.
			if (Math.min(published, display) >= 1) {
				assert.ok(Math.abs(published - display) < 0.05, `${where}: ${published} vs ${display}`)
			}
		}
	}
})

test("the lead-in the display mapping opens up renders the first stop's colour, which is already on the ramp", () => {
	const stops = validGradient.gradient!.stops
	// Before the first stop and after the last, CSS clamps — and so does `rampColorAt`.
	assert.deepEqual(rampColorAt(stops, -0.5), stops[0].color.rgb)
	assert.deepEqual(rampColorAt(stops, 1.5), stops[stops.length - 1].color.rgb)
	assert.deepEqual(rampColorAt(stops, 0), stops[0].color.rgb)
	assert.deepEqual(rampColorAt(stops, 1), stops[stops.length - 1].color.rgb)
})

test("the ramp passes exactly through every published stop", () => {
	// The contract publishes exact source pixels and the renderer emits those hex digits verbatim, so
	// a round-tripped approximation at a stop would be the validator inventing a colour.
	for (const palette of [validGradient, foregroundInvisibleMidRamp, accentInvisibleMidRamp]) {
		const stops = palette.gradient!.stops
		for (const stop of stops) assert.deepEqual(rampColorAt(stops, stop.position), stop.color.rgb)
		const samples = sampleRamp(stops)
		for (const [index, stop] of stops.entries()) {
			const landed = samples.find((sample) => sample.stopIndex === index)
			assert.ok(landed !== undefined, `stop ${index} must be sampled exactly`)
			assert.equal(landed.color.hex, stop.color.hex)
		}
	}
})

// ---------------------------------------------------------------------------------------------
// Sampling density — the provenance for RAMP_SAMPLES_PER_SEGMENT
// ---------------------------------------------------------------------------------------------

test("sampling is deterministic, per-segment, and includes every stop", () => {
	assert.equal(RAMP_SAMPLES_PER_SEGMENT, 2048)
	assert.equal(RAMP_REFINEMENT_SAMPLES, 4096)

	const threeStops = validGradient.gradient!.stops
	assert.equal(threeStops.length, 3)
	// 2 segments x 2048 + 1: density does not depend on how the fitted stops happen to be spaced.
	assert.equal(sampleRamp(threeStops).length, 2 * RAMP_SAMPLES_PER_SEGMENT + 1)

	const lopsided = stopsFrom([[0, 0, 0], [128, 128, 128], [255, 255, 255]])
	lopsided[1] = { ...lopsided[1], position: 0.98 }
	assert.equal(sampleRamp(lopsided).length, 2 * RAMP_SAMPLES_PER_SEGMENT + 1)

	// Pure function of the palette.
	const first = minRawContrastOverRamp(validGradient.roles.foreground, threeStops)
	const again = minRawContrastOverRamp(validGradient.roles.foreground, threeStops)
	assert.deepEqual(first, again)
})

test("one sampling step cannot hide a below-floor excursion — the per-step reach argument", () => {
	// Failure mode 1 in `RAMP_SAMPLES_PER_SEGMENT`, stated in a form that survives quantisation.
	//
	// The rendered ramp is 8-bit, so `|raw|` along it is a step function and an *instantaneous* slope
	// is not the right instrument — differencing it at high density measures the framebuffer's step
	// heights, not the function's reach. What bounds what a sampling step can hide is the **per-step
	// reach**: the most `|raw|` can change between two adjacent coarse samples. It splits in two,
	// because APCA's polarity flip is a genuine discontinuity and has to be handled separately from
	// the smooth part.
	//
	// **Case 1 — the ramp crosses the subject in luminance.** APCA's branch changes and `raw` changes
	// sign. Both sides of that flip are *small*: the two branches straddle the same-colour residue.
	// Measured, the better of the two samples adjacent to any flip reads at most 1.21527 raw units,
	// which is below the smallest floor the contract can express (ε = 2.5). So whenever the ramp
	// crosses the subject's luminance, a coarse sample **always** reads below the floor — the crossing
	// cannot be jumped, however narrow it is in `t`.
	//
	// **Case 2 — it does not cross.** Then `|raw|` moves smoothly, by at most 0.69511 raw units
	// between adjacent samples. If the true minimum is `m`, the coarse sample nearest its location is
	// within one step, so it reads at most `m + 0.69511`; hence **every true minimum below
	// `F − 0.69511` is certainly seen** at floor `F`.
	//
	// Together the two cases cover every way a ramp can approach the floor, which is the guarantee the
	// sampling density owes. The residual — a non-crossing minimum sitting within 0.7 raw units of the
	// floor — is covered empirically by the sweep in the next test.
	const random = mulberry32(1312)
	const randRgb = (): Rgb8 => [
		Math.floor(random() * 256),
		Math.floor(random() * 256),
		Math.floor(random() * 256),
	]

	let smoothReach = 0
	let smoothCase = ""
	let worstAtFlip = 0
	let flipCase = ""
	let flips = 0
	const measure = (subject: Rgb8, from: Rgb8, to: Rgb8): void => {
		const samples = sampleRamp(stopsFrom([from, to]))
		const where = `${colorFromRgb(subject).hex} over ${colorFromRgb(from).hex}->${colorFromRgb(to).hex}`
		let previous = apcaRaw(subject, samples[0].color.rgb)
		for (let index = 1; index < samples.length; index++) {
			const current = apcaRaw(subject, samples[index].color.rgb)
			const flipped = Math.sign(current) !== Math.sign(previous) && current !== 0 && previous !== 0
			if (flipped) {
				flips++
				// What the *better* of the two adjacent samples reads. This is what detection depends on.
				const best = Math.min(Math.abs(current), Math.abs(previous))
				if (best > worstAtFlip) {
					worstAtFlip = best
					flipCase = where
				}
			} else if (Math.abs(Math.abs(current) - Math.abs(previous)) > smoothReach) {
				smoothReach = Math.abs(Math.abs(current) - Math.abs(previous))
				smoothCase = where
			}
			previous = current
		}
	}

	// The steepest segments the sRGB cube admits, plus a random sweep that must not beat them.
	measure([255, 255, 255], [0, 0, 0], [255, 255, 255])
	measure([0, 0, 0], [0, 0, 0], [255, 255, 255])
	measure([128, 128, 128], [0, 0, 0], [255, 255, 255])
	measure([254, 254, 254], [200, 200, 200], [255, 255, 255])
	for (let trial = 0; trial < 150; trial++) measure(randRgb(), randRgb(), randRgb())

	assert.ok(flips > 50, `the sweep must actually exercise polarity flips, saw ${flips}`)

	// Case 1: a luminance crossing is always caught, at every floor the contract can express.
	assert.ok(
		worstAtFlip < EPSILON_TEXT_RAW && worstAtFlip < EPSILON_ACCENT_RAW,
		`worst reading adjacent to a polarity flip ${worstAtFlip} (${flipCase}) must stay under the epsilons`,
	)
	assert.ok(worstAtFlip < APCA_RAW_IDENTICAL_CEILING, `and under the same-colour residue ceiling`)

	// Case 2: the smooth reach, and the detection depth it guarantees.
	assert.ok(smoothReach < 1, `smooth per-step reach ${smoothReach} (${smoothCase}) must stay under 1 raw unit`)
	assert.ok(
		EPSILON_TEXT_RAW - smoothReach > APCA_RAW_IDENTICAL_CEILING * 0.9,
		`guaranteed-detection depth ${EPSILON_TEXT_RAW - smoothReach} at the smallest floor`,
	)
})

test("the coarse density never changes a verdict against a 16x denser reference", () => {
	// The empirical half of failure mode 1, swept over every floor a caller can request rather than a
	// handful. `PHASE_0_DECISIONS.md` §2 makes the public unit Lc, whose range tops out near 108.
	const random = mulberry32(4242)
	const randRgb = (): Rgb8 => [
		Math.floor(random() * 256),
		Math.floor(random() * 256),
		Math.floor(random() * 256),
	]

	let disagreements = 0
	let worstDeep = 0
	let worstShallow = 0
	let ramps = 0
	for (let trial = 0; trial < 120; trial++) {
		const from = randRgb()
		const to = randRgb()
		const stops = stopsFrom(trial % 3 === 0 ? [from, to] : [from, randRgb(), to])
		// Biased hard toward the dangerous case: a subject the ramp actually crosses in luminance.
		const subject = colorFromRgb(
			trial % 4 === 3 ? randRgb() : okLabToRgb(lerp3(rgbToOkLab(from), rgbToOkLab(to), random())),
		)
		const coarse = Math.abs(minRawContrastOverRamp(subject, stops)!.raw)
		const fine = Math.abs(minRawContrastOverRamp(subject, stops, RAMP_SAMPLES_PER_SEGMENT * 16)!.raw)
		ramps++

		if (fine >= 1) worstShallow = Math.max(worstShallow, coarse - fine)
		else worstDeep = Math.max(worstDeep, coarse - fine)

		for (let tenths = 25; tenths <= 1080; tenths += 5) {
			const floor = tenths / 10
			if ((coarse < floor) !== (fine < floor)) disagreements++
		}
	}
	assert.equal(disagreements, 0, `${disagreements} verdict disagreements over ${ramps} ramps`)

	// Failure mode 2, and the provenance for `RAMP_REFINEMENT_SAMPLES`: wherever the true minimum is
	// at or above 1 raw unit the refined answer is essentially exact...
	assert.ok(worstShallow <= 0.05, `worst overstatement in the verdict-relevant band: ${worstShallow}`)
	// ...and below that it can still be overstated, harmlessly, because a minimum under 1 raw unit is
	// under every floor the contract can express and the violation fires either way.
	assert.ok(worstDeep < 1, `worst overstatement in a deep basin: ${worstDeep}`)
	assert.ok(worstDeep >= worstShallow, "the deep basins are where the residual error lives")
})

test("refinement is what buys the shallow-band accuracy, not the coarse pass", () => {
	// Pin the claim that `RAMP_REFINEMENT_SAMPLES` is load-bearing: with refinement disabled the same
	// sweep overstates a minimum by an order of magnitude more.
	const random = mulberry32(77)
	const randRgb = (): Rgb8 => [
		Math.floor(random() * 256),
		Math.floor(random() * 256),
		Math.floor(random() * 256),
	]

	let withRefinement = 0
	let withoutRefinement = 0
	for (let trial = 0; trial < 120; trial++) {
		const from = randRgb()
		const to = randRgb()
		const stops = stopsFrom([from, to])
		const subject = colorFromRgb(okLabToRgb(lerp3(rgbToOkLab(from), rgbToOkLab(to), random())))
		const fine = Math.abs(minRawContrastOverRamp(subject, stops, RAMP_SAMPLES_PER_SEGMENT * 16)!.raw)
		withRefinement = Math.max(withRefinement, Math.abs(minRawContrastOverRamp(subject, stops)!.raw) - fine)
		withoutRefinement = Math.max(
			withoutRefinement,
			Math.abs(minRawContrastOverRamp(subject, stops, RAMP_SAMPLES_PER_SEGMENT, 0)!.raw) - fine,
		)
	}
	assert.ok(
		withoutRefinement > withRefinement,
		`refinement must help: ${withoutRefinement} unrefined vs ${withRefinement} refined`,
	)
})

// ---------------------------------------------------------------------------------------------
// The accent over the ramp, after the metric ruling of 2026-08-04
// ---------------------------------------------------------------------------------------------

test("the accent's second dimension is gone: one minimisation now serves both roles", () => {
	// This test used to pin the opposite, on this exact ramp. The accent's floor was a *conjunction*,
	// and whole-ramping a conjunction has one correct reading — pointwise — so the ramp below was built
	// to prove the difference: the accent is isoluminant with one end and chromatically identical to
	// the other, so minimising the two dimensions independently would condemn it while at no single
	// point is it both. `firstInvisibleAccentOnRamp` existed for that distinction and is now deleted.
	//
	// `[REVIEWED — reviewer's ruling, 2026-08-04]`: contrast pairs are judged by raw APCA alone. The
	// distinction the old function protected is therefore no longer available to protect this ramp —
	// it crosses the accent's luminance, so it fails. Pinned here in its new direction because this is
	// exactly the class the ruling makes stricter, and a silent return to the conjunction should fail.
	const accent = colorFromHex("#4a6b8a")
	// End A: the accent's own luminance, a wildly different hue. End B: the accent's own hue, far away
	// in luminance.
	const stops = [
		{ color: colorFromHex("#8a5f4a"), position: 0 },
		{ color: colorFromHex("#0d1620"), position: 1 },
	]
	const luminanceEnd = Math.abs(apcaRaw(accent.rgb, stops[0].color.rgb))
	assert.ok(luminanceEnd < EPSILON_ACCENT_RAW * 4, `end A is close in luminance (${luminanceEnd})`)

	const minimum = minRawContrastOverRamp(accent, stops)
	assert.ok(minimum !== null)
	assert.ok(
		Math.abs(minimum.raw) < EPSILON_ACCENT_RAW,
		`the ramp crosses the accent's luminance, so the minimum is under the floor (${minimum.raw})`,
	)
	// And at that point the accent is far away in colour — the rescue the conjunction would have
	// applied, which the ruling removed.
	assert.ok(
		minimum.distance > ACCENT_VISIBILITY_COLOR_DISTANCE,
		`colour would have rescued it (${minimum.distance})`,
	)

	// The fixture built to fail both dimensions at one point is caught the same way, by the same call
	// the foreground uses — there is no accent-specific path left.
	const failing = minRawContrastOverRamp(
		accentInvisibleMidRamp.roles.accent,
		accentInvisibleMidRamp.gradient!.stops,
	)
	assert.ok(failing !== null)
	assert.ok(Math.abs(failing.raw) < EPSILON_ACCENT_RAW)
	assert.ok(failing.position > 0 && failing.position < 1, "and it is between the stops, not at one")
})

// ---------------------------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------------------------

test("a minimum that lands on a published stop is named as that stop, and a tie goes to the stop", () => {
	// The rendered ramp is 8-bit, so a run of interpolated positions can carry the same colour as the
	// stop it leads into. Naming the earliest of them would report `gradient.ramp@…` for a colour the
	// palette publishes — see `improves()` in `ramp.ts`.
	const stops = validGradient.gradient!.stops
	const minimum = minRawContrastOverRamp(validGradient.roles.foreground, stops)!
	assert.equal(minimum.stopIndex, 2)
	assert.equal(minimum.position, 1)
	assert.equal(rampPath(minimum), "gradient.stops[2]")

	const interior = minRawContrastOverRamp(
		foregroundInvisibleMidRamp.roles.foreground,
		foregroundInvisibleMidRamp.gradient!.stops,
	)!
	assert.equal(interior.stopIndex, null)
	assert.match(rampPath(interior), /^gradient\.ramp@0\.\d{6}$/u)
})

test("out-of-gamut interpolants are a documented approximation, and a measured one", () => {
	// The sRGB gamut is not convex in OKLab, so the straight segment between two in-gamut stops can
	// leave it. `okLabToRgb` clips; browsers gamut-map. The excursion is measured so the docstring's
	// "documented approximation" has a size attached to it.
	const random = mulberry32(555)
	const randRgb = (): Rgb8 => [
		Math.floor(random() * 256),
		Math.floor(random() * 256),
		Math.floor(random() * 256),
	]

	let excursions = 0
	let trials = 0
	for (let trial = 0; trial < 600; trial++) {
		const from = rgbToOkLab(randRgb())
		const to = rgbToOkLab(randRgb())
		trials++
		let excursed = false
		for (let step = 1; step < 64 && !excursed; step++) {
			const lab = lerp3(from, to, step / 64)
			// Round-tripping through the clipping converter and back detects the clip.
			const clipped = okLabToRgb(lab)
			const back = rgbToOkLab(clipped)
			if (Math.hypot(back[0] - lab[0], back[1] - lab[1], back[2] - lab[2]) > 0.02) excursed = true
		}
		if (excursed) excursions++
	}
	// A small minority of segments, and none of the fixtures: the approximation is real but narrow.
	assert.ok(excursions / trials < 0.2, `${excursions}/${trials} segments excurse`)
	for (const palette of [validGradient, foregroundInvisibleMidRamp, accentInvisibleMidRamp]) {
		const stops = palette.gradient!.stops
		for (const sample of sampleRamp(stops, 64)) {
			assert.ok(sample.color.rgb.every((channel) => channel >= 0 && channel <= 255))
		}
	}
})
