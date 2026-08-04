/**
 * Tests for P6's field model (`src/fieldmodel/`), module W3.
 *
 * The module is written against the `Substrate` and `Lattice` interfaces in `src/types.ts`, which
 * W1 and W2 build in parallel, so everything below runs against **synthetic implementations
 * constructed here**: images whose Φ is known by construction, and a brute-force lattice that
 * answers `nearestTriple` and `distanceToArtwork` by scanning every distinct triple. That lattice
 * doubles as SPEC rule 8's naive reference implementation — it is the quantity the smoothed lattice
 * approximates, computed the slow, obviously-correct way.
 *
 * Two numbers this file is the provenance for, both re-derived rather than quoted:
 * `FIELD_DL_STEP_REJECTION_FLOOR`'s analytic derivation (`R² = 3p(1−p) ≤ ¾` for a two-region field,
 * so the 1-D model's gain is bounded by `ln 2`), and the claim in `excursion.ts` that measuring the
 * ideal OKLab segment differs from the contract's rendered 8-bit ramp by at most a quantisation
 * step.
 *
 * Run: NODE_NO_WARNINGS=1 node --experimental-strip-types --test \
 *   research/v3/prototypes/p6-figureground/tests/fieldmodel.test.ts
 */

import assert from "node:assert/strict"
import test from "node:test"

import { colorFromRgb, okLabDistance, okLabToRgb, rgbToOkLab } from "../../../src/contract/color.ts"
import { rampColorAt } from "../../../src/contract/ramp.ts"
import type { GradientStop, OkLab, Rgb8 } from "../../../src/contract/types.ts"
import {
	EXCURSION_BAR_MULTIPLIER,
	FIELD_1D_EXTRA_PARAMETERS,
	FIELD_DL_STEP_REJECTION_FLOOR,
	tripleOrderKey,
} from "../src/fieldmodel/constants.ts"
import { buildFieldHypotheses, buildFieldModel, measureExcursion } from "../src/fieldmodel/index.ts"
import type { CandidateStats, DistinctTriple, FieldStop, Lattice, Substrate } from "../src/types.ts"

// ---------------------------------------------------------------------------------------------
// The exchange rate under test
// ---------------------------------------------------------------------------------------------

/**
 * The description-length rate these tests pin. Not a module constant and not a default: SPEC rule 4
 * puts every exchange rate in `src/energy/rates.ts`, and the field model takes it as an argument.
 * 0.25 is 1.8× `FIELD_DL_STEP_REJECTION_FLOOR`, which is the property that matters — the last test
 * in this file shows the same two-region image *is* read as a gradient below the floor, so the
 * bound is load-bearing rather than decorative.
 */
const RATE = { fieldDescriptionLength: 0.25 }

// ---------------------------------------------------------------------------------------------
// Synthetic substrate and a brute-force lattice
// ---------------------------------------------------------------------------------------------

function substrateFrom(
	width: number,
	height: number,
	colorAt: (x: number, y: number) => Rgb8,
	weightAt: (x: number, y: number) => number = () => 1,
): Substrate {
	const pixels = width * height
	const L = new Float32Array(pixels)
	const a = new Float32Array(pixels)
	const b = new Float32Array(pixels)
	const r8 = new Uint8Array(pixels)
	const g8 = new Uint8Array(pixels)
	const b8 = new Uint8Array(pixels)
	const fieldWeight = new Float32Array(pixels)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = y * width + x
			const rgb = colorAt(x, y)
			const lab = rgbToOkLab(rgb)
			L[index] = lab[0]
			a[index] = lab[1]
			b[index] = lab[2]
			r8[index] = rgb[0]
			g8[index] = rgb[1]
			b8[index] = rgb[2]
			fieldWeight[index] = weightAt(x, y)
		}
	}
	return {
		planes: { width, height, L, a, b, r8, g8, b8 },
		// The field model reads neither the ladder nor the ink/mark planes; they are present because
		// the interface has them, and empty because a test that filled them would be asserting
		// something about W1 rather than about W3.
		ladder: { sigmas: [], levels: [] },
		figureGround: {
			fieldWeight,
			inkEnergy: new Float32Array(pixels),
			markEnergy: new Float32Array(pixels),
			ground: { L, a, b },
		},
	}
}

/** Bandwidth of the synthetic lattice's kernel — the same-colour-bar scale the proposal puts h at. */
const TEST_BANDWIDTH = 0.012

function latticeFrom(substrate: Substrate, bandwidth = TEST_BANDWIDTH): Lattice {
	const { width, height, r8, g8, b8 } = substrate.planes
	const pixels = width * height
	const weights = substrate.figureGround.fieldWeight

	const byKey = new Map<number, { rgb: Rgb8; count: number; fieldWeight: number }>()
	for (let index = 0; index < pixels; index++) {
		const rgb: Rgb8 = [r8[index], g8[index], b8[index]]
		const key = tripleOrderKey(rgb)
		const entry = byKey.get(key)
		if (entry === undefined) byKey.set(key, { rgb, count: 1, fieldWeight: weights[index] })
		else {
			entry.count++
			entry.fieldWeight += weights[index]
		}
	}

	const entries = [...byKey.values()].sort((first, second) => tripleOrderKey(first.rgb) - tripleOrderKey(second.rgb))
	const triples: DistinctTriple[] = entries.map((entry) => ({
		rgb: entry.rgb,
		lab: rgbToOkLab(entry.rgb),
		count: entry.count,
	}))

	const emptyStats: CandidateStats = {
		presence: 0,
		groundMass: 0,
		inkEnergy: 0,
		markEnergy: 0,
		habitualGround: [0, 0, 0],
		fieldLikeness: 0,
		spatialSpread: 0,
		borderAffinity: 1,
		centroidDistance: 0,
	}

	return {
		triples,
		bandwidth,
		statsAt: (lab) => {
			let mass = 0
			let fieldMass = 0
			for (let index = 0; index < triples.length; index++) {
				const distance = okLabDistance(lab, triples[index].lab)
				const kernel = Math.exp(-(distance * distance) / (2 * bandwidth * bandwidth))
				mass += kernel * entries[index].count
				fieldMass += kernel * entries[index].fieldWeight
			}
			return {
				...emptyStats,
				presence: mass / pixels,
				fieldLikeness: mass > 0 ? fieldMass / mass : 0,
			}
		},
		nearestTriple: (lab) => {
			let best = triples[0]
			let bestDistance = Infinity
			for (const triple of triples) {
				const distance = okLabDistance(lab, triple.lab)
				if (distance < bestDistance) {
					best = triple
					bestDistance = distance
				}
			}
			return best
		},
		distanceToArtwork: (lab) => {
			let bestDistance = Infinity
			for (const triple of triples) {
				const distance = okLabDistance(lab, triple.lab)
				if (distance < bestDistance) bestDistance = distance
			}
			return bestDistance
		},
	}
}

function grey(value: number): Rgb8 {
	const channel = Math.min(255, Math.max(0, Math.round(value)))
	return [channel, channel, channel]
}

function lightnessOf(rgb: Rgb8): number {
	return rgbToOkLab(rgb)[0]
}

function build(substrate: Substrate, rate = RATE) {
	const lattice = latticeFrom(substrate)
	return { lattice, report: buildFieldModel(substrate, lattice, rate) }
}

// ---------------------------------------------------------------------------------------------
// 1. A flat field
// ---------------------------------------------------------------------------------------------

test("a flat image wins the description-length comparison as a 0-D model", () => {
	// Mild deterministic dither so the image has several distinct triples — a single-triple image
	// would make the covariance exactly zero and win by degeneracy rather than by description length.
	const substrate = substrateFrom(48, 48, (x, y) => grey(128 + ((x * 7 + y * 13) % 3)))
	const { report } = build(substrate)

	const best = report.hypotheses[0]
	assert.equal(best.kind, "flat")
	assert.equal(best.stops.length, 1)
	assert.ok(report.descriptionLength0D < report.descriptionLength1D)
	// Published colour is an exact artwork pixel (invariant 2).
	const rgb = best.stops[0].triple.rgb
	assert.ok(rgb[0] >= 128 && rgb[0] <= 130 && rgb[0] === rgb[1] && rgb[1] === rgb[2])
	assert.equal(best.maxExcursion, 0)
})

// ---------------------------------------------------------------------------------------------
// 2. A vertical ramp, and the orientation ruling
// ---------------------------------------------------------------------------------------------

function verticalRamp(from: number, to: number, size = 64): Substrate {
	return substrateFrom(size, size, (_x, y) => grey(from + ((to - from) * y) / (size - 1)))
}

test("a vertical ramp is a gradient, with the top end published first", () => {
	const { report } = build(verticalRamp(30, 230))
	const best = report.hypotheses[0]

	assert.equal(best.kind, "gradient")
	assert.equal(report.gradientRefusal, "none")
	assert.equal(best.stops.length, 2)
	assert.equal(best.stops[0].t, 0)
	assert.equal(best.stops[best.stops.length - 1].t, 1)
	// 135° ruling: the first stop is the background, and the background is the end whose mass sits
	// toward the top-left. Here that is the dark end.
	assert.ok(lightnessOf(best.stops[0].triple.rgb) < lightnessOf(best.stops[1].triple.rgb))
	// The trimmed ends land near the artwork's own extremes, not at the mean.
	assert.ok(best.stops[0].triple.rgb[0] < 45, `first stop ${best.stops[0].triple.rgb}`)
	assert.ok(best.stops[1].triple.rgb[0] > 215, `last stop ${best.stops[1].triple.rgb}`)
	assert.ok(report.descriptionLength1D < report.descriptionLength0D)
})

test("reversing the ramp reverses which end is published first", () => {
	const { report } = build(verticalRamp(230, 30))
	const best = report.hypotheses[0]
	assert.equal(best.kind, "gradient")
	assert.ok(lightnessOf(best.stops[0].triple.rgb) > lightnessOf(best.stops[1].triple.rgb))
})

test("a horizontal ramp orients on the same diagonal", () => {
	const size = 64
	const substrate = substrateFrom(size, size, (x) => grey(30 + (200 * x) / (size - 1)))
	const { report } = build(substrate)
	const best = report.hypotheses[0]
	assert.equal(best.kind, "gradient")
	// Left is the top-left side, so the left (dark) end is the background.
	assert.ok(lightnessOf(best.stops[0].triple.rgb) < lightnessOf(best.stops[1].triple.rgb))
})

// ---------------------------------------------------------------------------------------------
// 3. The proposal's own hard case: two flat halves are not a gradient
// ---------------------------------------------------------------------------------------------

/**
 * `arm-e-prime.md` §2.3, verbatim:
 *
 * > a **1-dimensional** model — Φ's mass lies along a segment, *and* position along that segment is
 * > a monotone function of a spatial direction. The second half is not optional: two flat areas of
 * > different colour produce an elongated covariance exactly as a ramp does, and only the spatial
 * > regression separates them.
 */
test("two flat halves of different colour are not a gradient — the proposal's own hard case", () => {
	const size = 64
	const dark = grey(60)
	const light = grey(190)
	const substrate = substrateFrom(size, size, (x) => (x < size / 2 ? dark : light))
	const { report } = build(substrate)

	const best = report.hypotheses[0]
	assert.equal(best.kind, "flat")
	assert.ok(report.descriptionLength0D < report.descriptionLength1D)
	for (const hypothesis of report.hypotheses) {
		if (hypothesis.kind === "gradient") {
			assert.ok(
				hypothesis.descriptionLength > best.descriptionLength,
				"a gradient hypothesis may be carried, but it must not outrank the flat one",
			)
		}
	}

	// Naive re-derivation, independent of the module: the covariance is as elongated as a ramp's,
	// and it is the regression that separates the two cases.
	const half = (lightnessOf(light) - lightnessOf(dark)) / 2
	assert.ok(
		Math.abs(report.measure.leadingVariance - half * half) < 1e-4,
		`elongated exactly like a ramp: λ₁ = ${report.measure.leadingVariance} vs ${half * half}`,
	)
	// R² = 3p(1−p) at p = ½ is exactly ¾ — the analytic ceiling in FIELD_DL_STEP_REJECTION_FLOOR.
	assert.ok(
		Math.abs(report.measure.rSquared - 0.75) < 0.01,
		`R² should be the two-region ceiling 0.75, got ${report.measure.rSquared}`,
	)

	// And the gain the 1-D model can buy with it is bounded by ln 2, whatever the colours are.
	const gain = report.descriptionLength0D - (report.descriptionLength1D - RATE.fieldDescriptionLength * FIELD_1D_EXTRA_PARAMETERS)
	assert.ok(gain < Math.LN2 + 1e-9, `two-region gain ${gain} must not exceed ln 2`)
	assert.ok(RATE.fieldDescriptionLength * FIELD_1D_EXTRA_PARAMETERS > gain)
})

test("the step-rejection floor is exactly ln 2 per parameter, and it is load-bearing", () => {
	assert.ok(Math.abs(FIELD_DL_STEP_REJECTION_FLOOR * FIELD_1D_EXTRA_PARAMETERS - Math.LN2) < 1e-15)

	const size = 64
	const substrate = substrateFrom(size, size, (x) => (x < size / 2 ? grey(60) : grey(190)))
	// Below the floor the same image is read as a gradient — which is what makes the floor a bound
	// on the registry's rate rather than a comment.
	const below = build(substrate, { fieldDescriptionLength: FIELD_DL_STEP_REJECTION_FLOOR * 0.5 })
	assert.equal(below.report.hypotheses[0].kind, "gradient")
	// Above it, flat wins.
	const above = build(substrate, { fieldDescriptionLength: FIELD_DL_STEP_REJECTION_FLOOR * 1.5 })
	assert.equal(above.report.hypotheses[0].kind, "flat")
})

/**
 * The rate has a **ceiling** as well as a floor, and the ceiling is what makes it reportable rather
 * than a matter of taste: the 1-D model's data-cost gain is `½·ln((V₀ + σ²) / (V₁ + σ²))`, and V₀
 * cannot exceed the largest variance any measure on OKLab can have. The most extreme field
 * imaginable is half the pixels at black and half at white — variance (1/2)² = 0.25 — so at the
 * tightest regional bar the gain can never exceed ½·ln(1 + 0.25/0.00932²) ≈ 3.98 nats. Any rate
 * whose parameter charge exceeds that makes the gradient hypothesis **unreachable on every
 * artwork**, silently.
 */
test("the description-length rate has a reachable band, not just a floor", () => {
	const tightestBar = 0.00932 // SAME_COLOR_BAR_BY_REGION["dark-neutral"], the tightest.
	const largestVariance = 0.25 // black/white halves: the extreme of any measure on OKLab.
	const ceilingGain = 0.5 * Math.log(1 + largestVariance / (tightestBar * tightestBar))
	const rateCeiling = ceilingGain / FIELD_1D_EXTRA_PARAMETERS
	console.log(
		`  DL rate band: (${FIELD_DL_STEP_REJECTION_FLOOR.toFixed(4)}, ${rateCeiling.toFixed(4)}) ` +
			`per parameter — below the floor two flat halves read as a ramp, above the ceiling no ` +
			`artwork can ever be a gradient`,
	)
	assert.ok(FIELD_DL_STEP_REJECTION_FLOOR < rateCeiling)
	assert.ok(RATE.fieldDescriptionLength > FIELD_DL_STEP_REJECTION_FLOOR)
	assert.ok(RATE.fieldDescriptionLength < rateCeiling)

	// The ceiling is not theoretical: at a rate above it, an unmistakable ramp is refused.
	const refused = build(verticalRamp(30, 230), { fieldDescriptionLength: rateCeiling * 1.05 })
	assert.equal(refused.report.hypotheses[0].kind, "flat")
})

test("two flat halves offer the second field as an alternative hypothesis", () => {
	const size = 64
	const substrate = substrateFrom(size, size, (x) => (x < size / 2 ? grey(60) : grey(190)))
	const { report } = build(substrate)
	const flats = report.hypotheses.filter((hypothesis) => hypothesis.kind === "flat")
	assert.ok(flats.length >= 2, "both halves should reach the energy as field candidates")
	const separation = okLabDistance(
		rgbToOkLab(flats[0].stops[0].triple.rgb),
		rgbToOkLab(flats[1].stops[0].triple.rgb),
	)
	assert.ok(separation > 2 * TEST_BANDWIDTH, `alternatives must be separate modes, got ${separation}`)
})

// ---------------------------------------------------------------------------------------------
// 4. Degeneracy: ends within the same-colour bar
// ---------------------------------------------------------------------------------------------

test("a ramp whose ends are within the same-colour bar is degenerate, and flat wins", () => {
	const { report } = build(verticalRamp(128, 131))
	assert.equal(report.gradientRefusal, "ends-within-same-colour-bar")
	assert.equal(report.hypotheses[0].kind, "flat")
	for (const hypothesis of report.hypotheses) assert.notEqual(hypothesis.kind, "gradient")
})

// ---------------------------------------------------------------------------------------------
// 5. Excursion: a ramp through off-artwork colours gets an interior stop at the peak
// ---------------------------------------------------------------------------------------------

/**
 * A field whose colour path **bends**: lightness rises linearly down the image while `b` bulges out
 * and back. Every row's colour is in the artwork; the straight line between the two ends is not.
 */
function curvedRamp(size = 64, bulge = 0.06): Substrate {
	return substrateFrom(size, size, (_x, y) => {
		const v = y / (size - 1)
		const lab: OkLab = [0.25 + 0.6 * v, 0, bulge * Math.sin(Math.PI * v)]
		return okLabToRgb(lab)
	})
}

test("a ramp passing through off-artwork colours gets one interior stop at the peak excursion", () => {
	const substrate = curvedRamp()
	const { lattice, report } = build(substrate)
	const best = report.hypotheses[0]

	assert.equal(best.kind, "gradient")
	assert.equal(best.stops.length, 3, "one guide stop, admitted only by excursion reduction")
	assert.equal(best.stops[0].t, 0)
	assert.equal(best.stops[2].t, 1)
	assert.ok(best.stops[1].t > 0.3 && best.stops[1].t < 0.7, `interior stop at t=${best.stops[1].t}`)

	// Naive re-derivation: the two-stop ramp's own excursion, measured here rather than trusted.
	const ends: FieldStop[] = [best.stops[0], best.stops[2]]
	const before = measureExcursion(ends, lattice)
	assert.ok(before.maxInBars > 1, `the 2-stop line must be off-artwork to justify a stop: ${before.maxInBars}`)
	assert.ok(best.maxExcursion < before.maxDistance, "the stop must strictly reduce the maximum")
	assert.ok(best.maxExcursion <= before.maxDistance)
	// The peak the module chose is where the two-stop profile peaked.
	assert.ok(Math.abs(best.stops[1].t - before.peakPosition) < 0.15)
	// The published guide stop is an exact artwork pixel.
	const key = tripleOrderKey(best.stops[1].triple.rgb)
	assert.ok(lattice.triples.some((triple) => tripleOrderKey(triple.rgb) === key))
	// Nothing above the published ceiling reaches `stops`.
	assert.ok(best.stops.length <= 3)
})

test("a ramp that is already on-artwork gets no interior stop", () => {
	const { report } = build(verticalRamp(30, 230))
	assert.equal(report.hypotheses[0].stops.length, 2)
	assert.equal(report.hypotheses[0].reportedFourthStop, undefined)
})

test("a fourth stop is reported with its evidence and never published", () => {
	// Two bulges, so one guide stop cannot flatten both: the classic second excursion lobe.
	const size = 96
	const substrate = substrateFrom(size, size, (_x, y) => {
		const v = y / (size - 1)
		return okLabToRgb([0.25 + 0.6 * v, 0, 0.075 * Math.sin(2 * Math.PI * v)])
	})
	const { report } = build(substrate)
	const gradient = report.hypotheses.find((hypothesis) => hypothesis.kind === "gradient")
	assert.ok(gradient !== undefined)
	assert.equal(gradient.stops.length, 3, "published stops never exceed the ceiling")

	const fourth = gradient.reportedFourthStop
	assert.ok(fourth !== undefined, "a useful fourth stop must be reported, not dropped")
	// It sits in the *other* lobe, and it is nowhere in `stops`.
	assert.ok(Math.abs(fourth.stop.t - gradient.stops[1].t) > 0.2)
	for (const stop of gradient.stops) {
		assert.notEqual(tripleOrderKey(stop.triple.rgb), tripleOrderKey(fourth.stop.triple.rgb))
	}
	// The evidence is the excursion the published stops leave behind.
	assert.equal(fourth.excursionEvidence, gradient.maxExcursion)
	assert.ok(fourth.excursionEvidence > 0)
})

/**
 * §2.3: *"A genuine three-colour ramp is the case where the 1-D fit is better served by a polyline
 * with one knot, and it lands on the same machinery."* Here the artwork's colour path is two
 * straight legs with a real knot; the chord between the ends leaves the artwork, and the excursion
 * machinery — the only route by which a stop is ever admitted — recovers the knot.
 */
test("a genuine three-colour ramp lands on the same machinery", () => {
	const size = 96
	const substrate = substrateFrom(size, size, (_x, y) => {
		const v = y / (size - 1)
		const chroma = v < 0.5 ? 0.1 * 2 * v : 0.1 * (2 - 2 * v)
		return okLabToRgb([0.25 + 0.5 * v, chroma, 0])
	})
	const { report } = build(substrate)
	const best = report.hypotheses[0]
	assert.equal(best.kind, "gradient")
	assert.equal(best.stops.length, 3)
	// The knot is at the middle of the path, and the published ramp now clears the bar.
	assert.ok(best.stops[1].t > 0.35 && best.stops[1].t < 0.65, `knot at t=${best.stops[1].t}`)
	assert.equal(best.reportedFourthStop, undefined)
})

// ---------------------------------------------------------------------------------------------
// 6. The measured claims the module's docstrings make
// ---------------------------------------------------------------------------------------------

test("the ideal OKLab segment and the contract's rendered ramp agree to within a quantisation step", () => {
	const substrate = curvedRamp()
	const { report } = build(substrate)
	const stops = report.hypotheses[0].stops
	const rendered: GradientStop[] = stops.map((stop) => ({
		color: colorFromRgb(stop.triple.rgb),
		position: stop.t,
	}))

	let worst = 0
	for (let step = 0; step <= 200; step++) {
		const position = step / 200
		const ideal = idealLabAt(stops, position)
		const drawn = rgbToOkLab(rampColorAt(rendered, position))
		worst = Math.max(worst, okLabDistance(ideal, drawn))
	}
	assert.ok(worst < 0.004, `ideal vs rendered ramp divergence ${worst}`)
})

function idealLabAt(stops: readonly FieldStop[], position: number): OkLab {
	const labs = stops.map((stop) => rgbToOkLab(stop.triple.rgb))
	if (position <= stops[0].t) return labs[0]
	const last = stops.length - 1
	if (position >= stops[last].t) return labs[last]
	let index = 0
	while (index < last - 1 && position >= stops[index + 1].t) index++
	const u = (position - stops[index].t) / (stops[index + 1].t - stops[index].t)
	return [
		labs[index][0] + (labs[index + 1][0] - labs[index][0]) * u,
		labs[index][1] + (labs[index + 1][1] - labs[index][1]) * u,
		labs[index][2] + (labs[index + 1][2] - labs[index][2]) * u,
	]
}

test("the excursion bar is the inherited 2.5× multiple of the regional same-colour bar", () => {
	assert.equal(EXCURSION_BAR_MULTIPLIER, 2.5)
})

// ---------------------------------------------------------------------------------------------
// 7. Determinism, weights, and the interface
// ---------------------------------------------------------------------------------------------

test("the same substrate produces byte-identical hypotheses", () => {
	const substrate = curvedRamp()
	const lattice = latticeFrom(substrate)
	const first = buildFieldHypotheses(substrate, lattice, RATE)
	const second = buildFieldHypotheses(substrate, lattice, RATE)
	assert.equal(JSON.stringify(first), JSON.stringify(second))
	assert.ok(first.length >= 1 && first.length <= 3)
})

test("field weights restrict Φ: an inked region does not drag the field colour", () => {
	const size = 64
	// A flat field with a large block of a very different colour, marked as not-field.
	const substrate = substrateFrom(
		size,
		size,
		(x, y) => (x < 24 && y < 24 ? grey(20) : grey(180)),
		(x, y) => (x < 24 && y < 24 ? 0 : 1),
	)
	const { report } = build(substrate)
	const best = report.hypotheses[0]
	assert.equal(best.kind, "flat")
	assert.deepEqual([...best.stops[0].triple.rgb], [180, 180, 180])

	// Without the weights the same image is a two-region field and Φ's mean moves.
	const unweighted = build(substrateFrom(size, size, (x, y) => (x < 24 && y < 24 ? grey(20) : grey(180))))
	assert.ok(unweighted.report.measure.totalVariance > report.measure.totalVariance * 10)
})

test("a field-weight plane that is entirely zero falls back to the whole image", () => {
	const substrate = substrateFrom(32, 32, () => grey(120), () => 0)
	const { report } = build(substrate)
	assert.equal(report.measure.weighted, false)
	assert.equal(report.hypotheses[0].kind, "flat")
})

test("a rate that is not a finite non-negative number is refused", () => {
	const substrate = verticalRamp(30, 230)
	const lattice = latticeFrom(substrate)
	assert.throws(() => buildFieldHypotheses(substrate, lattice, { fieldDescriptionLength: -1 }), RangeError)
	assert.throws(() => buildFieldHypotheses(substrate, lattice, { fieldDescriptionLength: Number.NaN }), RangeError)
})

// ---------------------------------------------------------------------------------------------
// 8. Cost — SPEC's performance envelope
// ---------------------------------------------------------------------------------------------

test("the field model stays inside the performance envelope at 1000×1000", () => {
	const size = 1000
	const substrate = substrateFrom(size, size, (_x, y) => {
		const v = y / (size - 1)
		return okLabToRgb([0.25 + 0.6 * v, 0, 0.06 * Math.sin(Math.PI * v)])
	})
	const lattice = latticeFrom(substrate)
	const started = process.hrtime.bigint()
	const hypotheses = buildFieldHypotheses(substrate, lattice, RATE)
	const milliseconds = Number(process.hrtime.bigint() - started) / 1e6
	console.log(`  field model on ${size}×${size}: ${milliseconds.toFixed(1)} ms (${lattice.triples.length} triples)`)
	assert.ok(hypotheses.length >= 1)
	// SPEC: >2 s at this size is a defect to report. The proposal prices this stage at ≈40 ms.
	assert.ok(milliseconds < 2000, `${milliseconds} ms exceeds the envelope`)
})
