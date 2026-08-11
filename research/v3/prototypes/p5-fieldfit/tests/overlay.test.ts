/**
 * W-MARKS self-tests — the overlay reading (SPEC "Verification obligations": "synthetic
 * text-on-ramp must yield the text colour as foreground; agglomeration must be byte-identical
 * under ±1 LSB dither of half the mass").
 *
 * Every input here is constructed in code with a known right answer. Nothing decodes a file, so
 * these tests do not depend on `decode.ts` or `fieldfit.ts` existing yet: the scene builder below
 * synthesises the `DecodedRaster` / `Inventory` / `FieldFit` triple that `readOverlay` consumes,
 * including the exact-triple inventory moments, using the prototype's own normalized-coordinate
 * convention.
 *
 * Run: NODE_NO_WARNINGS=1 node --experimental-strip-types --test prototypes/p5-fieldfit/tests/overlay.test.ts
 * (from `research/v3`).
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
	apcaRaw,
	colorDistance,
	colorFromRgb,
	okLabDistance,
	okLabToRgb,
	rgbToOkLab,
	sameColor,
	sameColorBar,
} from "../../../src/contract/color.ts"
import {
	DEFAULT_CONTRAST_PARAMETERS,
	resolveContrastParameters,
} from "../../../src/contract/invariants.ts"
import type { GradientStop, OkLab, Rgb8 } from "../../../src/contract/types.ts"
import {
	ACCENT_FUNCTIONAL_DISTANCE,
	ACCENT_VISIBILITY_COLOR_DISTANCE,
} from "../../../src/contract/constants.ts"
import { firstInvisibleAccentOnRamp } from "../../../src/contract/ramp.ts"
import { normalizedX, normalizedY, packRgb, unpackRgb } from "../src/decode.ts"
import { readOverlay } from "../src/overlay.ts"
import type { DecodedRaster, FieldFit, Inventory, TripleStats } from "../src/types.ts"

const DEFAULT_CONTRAST = resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS)

// ---------------------------------------------------------------------------------------------
// Scene construction
// ---------------------------------------------------------------------------------------------

type Scene = Readonly<{ raster: DecodedRaster; inventory: Inventory; fit: FieldFit }>

const pack = packRgb

/** Round-trip an OKLab value into the exact 8-bit pixel a decoded image would hold. */
function quantize(lab: OkLab): Rgb8 {
	return okLabToRgb(lab)
}

/**
 * Build the three inputs `readOverlay` takes from a per-pixel colour and a per-pixel Tukey weight.
 *
 * `coefficients` is left as zeros: `overlay.ts` never reads it — it goes through `fieldAt`, which
 * is supplied directly here so that a test's field is exactly what the test says it is rather than
 * whatever a 3×3 matrix happens to evaluate to.
 */
function buildScene(
	width: number,
	height: number,
	pixelAt: (column: number, row: number, index: number) => Rgb8,
	weightAt: (column: number, row: number, index: number) => number,
	fieldAt: (x: number, y: number) => OkLab,
	order: 0 | 1,
): Scene {
	const pixelCount = width * height
	const packed = new Uint32Array(pixelCount)
	const lab = new Float32Array(pixelCount * 3)
	const weights = new Float32Array(pixelCount)
	const stats = new Map<number, TripleStats & { count: number; sumX: number; sumY: number }>()
	let inliers = 0

	for (let row = 0; row < height; row++) {
		const y = normalizedY(row, height)
		for (let column = 0; column < width; column++) {
			const index = row * width + column
			const x = normalizedX(column, width)
			const rgb = pixelAt(column, row, index)
			const key = pack(rgb)
			const okLab = rgbToOkLab(rgb)

			packed[index] = key
			lab[index * 3] = okLab[0]
			lab[index * 3 + 1] = okLab[1]
			lab[index * 3 + 2] = okLab[2]

			const weight = weightAt(column, row, index)
			weights[index] = weight
			if (weight > 0.5) inliers += 1

			let entry = stats.get(key)
			if (entry === undefined) {
				entry = { packed: key, rgb, lab: okLab, count: 0, sumX: 0, sumY: 0 }
				stats.set(key, entry)
			}
			entry.count += 1
			entry.sumX += x
			entry.sumY += y
		}
	}

	return {
		raster: { width, height, format: "synthetic", lab, packed },
		inventory: {
			triples: stats,
			has: (value: number) => stats.has(value),
			totalPixels: pixelCount,
		},
		fit: {
			order,
			coefficients: new Float64Array(9),
			fieldAt,
			weights,
			inlierFraction: inliers / pixelCount,
			// These fixtures are built field-first, so every non-mark pixel sits exactly on the field.
			// `readOverlay` reads neither of these two, but `FieldFit` requires both.
			fieldExplainedFraction: inliers / pixelCount,
			residualScale: 0,
			marginBars: 0,
			noField: false,
		},
	}
}

function lerpLab(from: OkLab, to: OkLab, t: number): OkLab {
	return [
		from[0] + (to[0] - from[0]) * t,
		from[1] + (to[1] - from[1]) * t,
		from[2] + (to[2] - from[2]) * t,
	]
}

/** A left-to-right grey ramp in OKLab, used as the known field in cases 1 and 2. */
const RAMP_START = rgbToOkLab([20, 20, 20])
const RAMP_END = rgbToOkLab([120, 120, 120])
function rampField(x: number): OkLab {
	return lerpLab(RAMP_START, RAMP_END, (x + 1) / 2)
}
/**
 * The **published ramp** `readOverlay` now takes, in place of the OKLab end pair it took before
 * decision 7's round-1 ruling.
 *
 * The change is not cosmetic. The module used to receive continuous field values and quantize them
 * itself to compare against; it now receives the two `PaletteColor`s the palette will actually
 * publish, plus whatever interior stop the gradient carries, because both the feasibility tests and
 * the foreground's new min-|APCA|-over-the-ramp ranking are statements about published colours.
 * These helpers build that ramp from the end colours a scene was constructed around.
 */
function rampOf(...ends: readonly OkLab[]): GradientStop[] {
	return ends.map((lab, index) => ({
		color: colorFromRgb(quantize(lab)),
		position: index / (ends.length - 1),
	}))
}

const RAMP_STOPS: readonly GradientStop[] = rampOf(rampField(-1), rampField(1))

function inRectangle(column: number, row: number, x0: number, x1: number, y0: number, y1: number) {
	return column >= x0 && column <= x1 && row >= y0 && row <= y1
}

// ---------------------------------------------------------------------------------------------
// 1 — text on a ramp
// ---------------------------------------------------------------------------------------------

test("text on a ramp: the text colour is foreground and its local field is the ramp under it", () => {
	const size = 16
	const TEXT: Rgb8 = [255, 255, 255]
	// Columns 4..7 and rows 6..9: 16 pixels whose overlay-weighted mean sits at exactly
	// (-0.25, 0) under the pixel-centre convention.
	const isText = (column: number, row: number) => inRectangle(column, row, 4, 7, 6, 9)

	const scene = buildScene(
		size,
		size,
		(column, row) =>
			isText(column, row) ? TEXT : quantize(rampField(normalizedX(column, size))),
		(column, row) => (isText(column, row) ? 0 : 1),
		(x) => rampField(x),
		1,
	)

	const reading = readOverlay(
		scene.fit,
		scene.raster,
		scene.inventory,
		DEFAULT_CONTRAST,
		RAMP_STOPS,
	)

	// The field pixels carry weight 1, so they contribute no overlay mass at all: the only thing
	// the fit rejected is the text.
	assert.equal(reading.clusters.length, 1)
	assert.notEqual(reading.foreground, null)
	assert.equal(reading.foreground?.representative, pack(TEXT))
	assert.equal(reading.foreground?.overlayMass, 16)
	assert.equal(reading.foreground?.memberCount, 1)

	assert.ok(Math.abs(reading.foreground!.meanX - -0.25) < 1e-12)
	assert.ok(Math.abs(reading.foreground!.meanY - 0) < 1e-12)
	assert.ok(okLabDistance(reading.foreground!.localField, rampField(-0.25)) < 1e-12)

	// White on a dark-to-mid grey ramp: the departure is lightness, upward, and achromatic.
	assert.ok(reading.foreground!.deltaL > 0.3)
	assert.ok(Math.hypot(reading.foreground!.deltaC, reading.foreground!.deltaH) < 1e-3)

	// One cluster and it is the foreground, so there is no accent candidate left.
	assert.equal(reading.accent, null)
	assert.equal(reading.accentChromaOnly, false)
})

// ---------------------------------------------------------------------------------------------
// 2 — dither idempotence
// ---------------------------------------------------------------------------------------------

/**
 * The scene for case 2: the same ramp field, a text patch and a small saturated patch, with the
 * text patch optionally half-dithered into a ±1-LSB neighbour.
 */
function ditherScene(dithered: boolean): Scene {
	const size = 20
	const TEXT: Rgb8 = [240, 240, 240]
	// One LSB up on red. Chosen upward so that the dithered triple's packed integer is *larger*
	// than the original's: at an exact 8/8 mass split the representative tie-break is the packed
	// int, and the test wants the representative to be pinned by the rule rather than by luck.
	const TEXT_DITHER: Rgb8 = [241, 240, 240]
	const MARK: Rgb8 = [200, 30, 30]

	const isText = (column: number, row: number) => inRectangle(column, row, 4, 7, 4, 7)
	const isMark = (column: number, row: number) => inRectangle(column, row, 12, 14, 12, 13)

	return buildScene(
		size,
		size,
		(column, row) => {
			if (isText(column, row)) {
				return dithered && (column + row) % 2 === 0 ? TEXT_DITHER : TEXT
			}
			if (isMark(column, row)) return MARK
			return quantize(rampField(normalizedX(column, size)))
		},
		(column, row) => (isText(column, row) || isMark(column, row) ? 0 : 1),
		(x) => rampField(x),
		1,
	)
}

test("dither idempotence: ±1 LSB on half a cluster's mass changes no choice", () => {
	const base = ditherScene(false)
	const dithered = ditherScene(true)

	const baseReading = readOverlay(
		base.fit,
		base.raster,
		base.inventory,
		DEFAULT_CONTRAST,
		RAMP_STOPS,
	)
	const ditheredReading = readOverlay(
		dithered.fit,
		dithered.raster,
		dithered.inventory,
		DEFAULT_CONTRAST,
		RAMP_STOPS,
	)

	// The dither really did split half the text mass into a second exact triple.
	assert.equal(base.inventory.triples.has(pack([241, 240, 240])), false)
	assert.equal(dithered.inventory.triples.has(pack([241, 240, 240])), true)
	assert.equal(dithered.inventory.triples.get(pack([241, 240, 240]))?.count, 8)
	assert.equal(dithered.inventory.triples.get(pack([240, 240, 240]))?.count, 8)

	// The partition is identical: same number of clusters, same representatives, same masses.
	assert.equal(baseReading.clusters.length, 2)
	assert.equal(ditheredReading.clusters.length, baseReading.clusters.length)
	assert.deepEqual(
		ditheredReading.clusters.map((cluster) => cluster.representative),
		baseReading.clusters.map((cluster) => cluster.representative),
	)
	assert.deepEqual(
		ditheredReading.clusters.map((cluster) => cluster.overlayMass),
		baseReading.clusters.map((cluster) => cluster.overlayMass),
	)

	// Byte-identical role choices.
	const choices = (reading: typeof baseReading) =>
		JSON.stringify({
			foreground: reading.foreground?.representative ?? null,
			accent: reading.accent?.representative ?? null,
			accentChromaOnly: reading.accentChromaOnly,
		})
	assert.equal(choices(ditheredReading), choices(baseReading))
	assert.equal(baseReading.foreground?.representative, pack([240, 240, 240]))
	assert.equal(baseReading.accent?.representative, pack([200, 30, 30]))

	// The only thing that may move is the cluster's centre, and it may move by less than the bar.
	for (const [index, cluster] of ditheredReading.clusters.entries()) {
		const reference = baseReading.clusters[index]!
		const bar = sameColorBar(colorFromRgb(unpackRgb(reference.representative)), colorFromRgb(unpackRgb(cluster.representative)))
		assert.ok(okLabDistance(cluster.lab, reference.lab) < bar)
	}

	// The dithered text cluster is two triples merged into one, which is the mechanism under test.
	assert.equal(baseReading.foreground?.memberCount, 1)
	assert.equal(ditheredReading.foreground?.memberCount, 2)
})

// ---------------------------------------------------------------------------------------------
// 3 — the accent Pareto front
// ---------------------------------------------------------------------------------------------

/** The saturated candidate: maximum chroma, and (by the grey chosen below) almost no ΔL. */
const CHROMA_ONLY: Rgb8 = [255, 0, 0]

/**
 * The flat field for case 3: the neutral grey whose OKLab lightness is closest to `CHROMA_ONLY`'s,
 * so that the red candidate's departure from the field is chroma and nothing else.
 */
const FLAT_FIELD_RGB: Rgb8 = (() => {
	const target = rgbToOkLab(CHROMA_ONLY)[0]
	let best: Rgb8 = [0, 0, 0]
	let bestGap = Number.POSITIVE_INFINITY
	for (let value = 0; value < 256; value++) {
		const gap = Math.abs(rgbToOkLab([value, value, value])[0] - target)
		if (gap < bestGap) {
			bestGap = gap
			best = [value, value, value]
		}
	}
	return best
})()
const FLAT_FIELD_LAB = rgbToOkLab(FLAT_FIELD_RGB)
/** A collapsed field: both ends are the same published colour, so the ramp samples as a constant. */
const FLAT_STOPS: readonly GradientStop[] = rampOf(FLAT_FIELD_LAB, FLAT_FIELD_LAB)

/**
 * The lightness candidate. Deliberately **not** a pure grey: two neutrals differ in OKLab chroma
 * only by float noise (~1e-9), and whether one such noise value exceeds another is arbitrary — a
 * pure grey here would make Pareto dominance over the dominated candidate a coin flip. A trace of
 * blue gives it a chroma that robustly exceeds the dominated candidate's.
 */
const LIGHTNESS_ONLY: Rgb8 = [10, 10, 30]
/** Dominated: strictly less lightness departure than `LIGHTNESS_ONLY` and strictly less chroma. */
const DOMINATED: Rgb8 = [90, 90, 90]
/**
 * A saturated blue patch, and the heaviest mark in the scene. Named for what it *is* rather than for
 * the role it plays: before round 1 it won the foreground on mass alone, and it does not any more.
 */
const BLUE_MARK: Rgb8 = [0, 0, 200]

function paretoScene(lightnessPatchSize: number): Scene {
	const size = 20
	const foregroundEnd = 40
	const dominatedEnd = foregroundEnd + 20
	const chromaEnd = dominatedEnd + 12
	const lightnessEnd = chromaEnd + lightnessPatchSize

	const colourFor = (index: number): Rgb8 => {
		if (index < foregroundEnd) return BLUE_MARK
		if (index < dominatedEnd) return DOMINATED
		if (index < chromaEnd) return CHROMA_ONLY
		if (index < lightnessEnd) return LIGHTNESS_ONLY
		return FLAT_FIELD_RGB
	}

	return buildScene(
		size,
		size,
		(_column, _row, index) => colourFor(index),
		(_column, _row, index) => (index < lightnessEnd ? 0 : 1),
		() => FLAT_FIELD_LAB,
		0,
	)
}

/**
 * **This scene's expected winners have changed four times. The constants have never moved.**
 *
 *  - *v0.1*: fg = heaviest feasible (`BLUE_MARK`); accent = heaviest on the Pareto front.
 *  - *v0.2*: fg = most legible feasible (`LIGHTNESS_ONLY`); accent = front member furthest from what
 *    is published.
 *  - *v0.3*: front dropped; accent = furthest from `{fg, bg, sf}`.
 *  - *v0.4*: distance retired; accent = argmax mass above the gates.
 *  - *v0.4.1*: **fg = argmax mass above a raised legibility floor** (decision 13), so `BLUE_MARK`
 *    takes it back — not because mass returned unchecked, but because it clears |raw| 15 (23.1) while
 *    the tiny 3-pixel `LIGHTNESS_ONLY` no longer outranks it for being *more* legible.
 *
 * The floor is what makes this different from v0.1, and `CHROMA_ONLY` is the proof: at |raw| 8.5 it
 * is now below the foreground floor even though it was above the old 2.5 one.
 */
test("both roles: mass leads above the gates", () => {
	const scene = paretoScene(3)
	const reading = readOverlay(
		scene.fit,
		scene.raster,
		scene.inventory,
		DEFAULT_CONTRAST,
		FLAT_STOPS,
	)

	assert.equal(reading.clusters.length, 4)

	const byTriple = new Map(reading.clusters.map((cluster) => [cluster.representative, cluster]))
	const dominated = byTriple.get(pack(DOMINATED))!
	const lightness = byTriple.get(pack(LIGHTNESS_ONLY))!
	const chroma = byTriple.get(pack(CHROMA_ONLY))!
	const blue = byTriple.get(pack(BLUE_MARK))!

	const rawAgainstField = (rgb: Rgb8) => Math.abs(apcaRaw(rgb, FLAT_FIELD_RGB))

	// --- foreground: the heaviest cluster that clears the floor ---
	assert.ok(blue.overlayMass > dominated.overlayMass)
	assert.ok(rawAgainstField(BLUE_MARK) >= 15, "the heaviest mark must clear the evidence floor")
	assert.equal(reading.foreground?.representative, pack(BLUE_MARK))
	// `LIGHTNESS_ONLY` is strictly more legible and still loses: legibility is a gate now, not a rank.
	assert.ok(rawAgainstField(LIGHTNESS_ONLY) > rawAgainstField(BLUE_MARK))
	assert.ok(blue.overlayMass > lightness.overlayMass)
	// `CHROMA_ONLY` is isoluminant with this field by construction, so it is no foreground at any
	// mass — the floor is what says so, and it says so far more loudly than the contract's 2.5 did.
	assert.ok(rawAgainstField(CHROMA_ONLY) < 15)

	// --- accent: the heaviest survivor that is not the foreground's family ---
	assert.ok(dominated.overlayMass > chroma.overlayMass)
	assert.equal(reading.accent?.representative, pack(DOMINATED))
})

// ---------------------------------------------------------------------------------------------
// 3b — the three round-1 regressions
// ---------------------------------------------------------------------------------------------

/** A flat-field scene from a per-index colour table; every listed pixel is a mark, the rest field. */
function flatScene(size: number, field: Rgb8, marks: readonly (readonly [Rgb8, number])[]): Scene {
	const table: Rgb8[] = []
	for (const [rgb, count] of marks) for (let i = 0; i < count; i += 1) table.push(rgb)
	const fieldLab = rgbToOkLab(field)
	return buildScene(
		size,
		size,
		(_column, _row, index) => table[index] ?? field,
		(_column, _row, index) => (index < table.length ? 0 : 1),
		() => fieldLab,
		0,
	)
}

/**
 * **Regression, decision 7's round-1 ruling: comparisons run on representatives.**
 *
 * `NEAR_END_REP` is within the bar of the published end, so it may not be the foreground. Its
 * cluster's *centre* is not — the second member drags the mass-weighted centre past the bar — so the
 * pre-round-1 rule would have accepted it, and it carries the most overlay mass, so it would have
 * won. That is exactly the shape round 1 caught on `2376a6b67d`.
 */
test("rep-level feasibility: a cluster whose centre clears the end but whose representative does not", () => {
	const FIELD: Rgb8 = [128, 128, 128]
	const NEAR_END_REP: Rgb8 = [132, 132, 132]
	const DRAGGER: Rgb8 = [136, 136, 136]
	const LEGIBLE: Rgb8 = [250, 250, 250]

	const scene = flatScene(12, FIELD, [[NEAR_END_REP, 6], [DRAGGER, 4], [LEGIBLE, 6]])
	const stops = rampOf(rgbToOkLab(FIELD), rgbToOkLab(FIELD))
	const reading = readOverlay(
		scene.fit,
		scene.raster,
		scene.inventory,
		DEFAULT_CONTRAST,
		stops,
	)

	const suspect = reading.clusters.find((cluster) => cluster.representative === pack(NEAR_END_REP))!
	const legible = reading.clusters.find((cluster) => cluster.representative === pack(LEGIBLE))!

	// The fixture is the case it claims to be: rep inside the bar, centre outside it, more mass.
	assert.equal(suspect.memberCount, 2, "the dragger must have agglomerated into the same cluster")
	assert.ok(
		sameColor(colorFromRgb(NEAR_END_REP), colorFromRgb(FIELD)),
		"the representative must be the same colour as the end",
	)
	assert.ok(
		okLabDistance(suspect.lab, rgbToOkLab(FIELD)) >=
			sameColorBar(colorFromRgb(FIELD), colorFromRgb(FIELD)),
		"...while the centre must be outside the bar, or the fixture proves nothing",
	)
	assert.ok(suspect.overlayMass > legible.overlayMass, "and it must be the heavier cluster")

	assert.equal(reading.foreground?.representative, pack(LEGIBLE))
})

/**
 * **Regression, decision 7's round-1 ruling: the foreground is ranked by legibility.**
 *
 * Round 1 graded item 1 UNACCEPTABLE with *"foreground barely registers"*. Here the massive cluster
 * is a dull near-field grey that still clears every distinctness test and the contrast floor; the
 * small one is plainly readable. Mass loses.
 */
test("foreground ranking: a dull massive cluster loses to a legible small one", () => {
	const FIELD: Rgb8 = [128, 128, 128]
	const DULL: Rgb8 = [150, 150, 150]
	const READABLE: Rgb8 = [10, 10, 10]

	const scene = flatScene(14, FIELD, [[DULL, 60], [READABLE, 8]])
	const reading = readOverlay(
		scene.fit,
		scene.raster,
		scene.inventory,
		DEFAULT_CONTRAST,
		rampOf(rgbToOkLab(FIELD), rgbToOkLab(FIELD)),
	)

	const dull = reading.clusters.find((cluster) => cluster.representative === pack(DULL))!
	const readable = reading.clusters.find((cluster) => cluster.representative === pack(READABLE))!

	// Both are legal foregrounds — distinct from the field and above the floor — so the test is about
	// the ranking and not about a filter doing the work.
	assert.ok(!sameColor(colorFromRgb(DULL), colorFromRgb(FIELD)))
	const floor = DEFAULT_CONTRAST.minTextContrast.effectiveRawMagnitude
	assert.ok(Math.abs(apcaRaw(DULL, FIELD)) >= floor)
	assert.ok(dull.overlayMass > readable.overlayMass * 5, "the dull cluster must dominate on mass")
	assert.ok(Math.abs(apcaRaw(READABLE, FIELD)) > Math.abs(apcaRaw(DULL, FIELD)))

	assert.equal(reading.foreground?.representative, pack(READABLE))
})

/**
 * **Regression, decision 8's v0.4 ruling: the artwork's own colour beats a distant manufactured one.**
 *
 * This is the round-2 item-2 class, built from that cover's measured colours: published background
 * `#fad107` and surface `#f81107`, foreground `#000000`, and the two accent candidates v0.3 had to
 * choose between. `#fbfaff` is the artwork's white — the reviewer's *"missing the white"* — carrying
 * real mass. `#453907` is the dark olive v0.3 published because it maximised minimum distance from
 * everything already in the palette: *"doesn't feel like a part of this artwork"*.
 *
 * The measured min-distances are the olive's 0.3539 against the white's 0.2181, so the v0.3 rule
 * genuinely preferred the olive and this fixture reproduces that. Mass-led inverts it, and both
 * candidates still pass both gates — so the test is about the ranking, not about a filter.
 */
test("accent identity: the artwork's white beats a more distant dark", () => {
	const BACKGROUND: Rgb8 = [0xfa, 0xd1, 0x07]
	const SURFACE: Rgb8 = [0xf8, 0x11, 0x07]
	const INK: Rgb8 = [0, 0, 0]
	const WHITE: Rgb8 = [0xfb, 0xfa, 0xff]
	const DISTANT_DARK: Rgb8 = [0x45, 0x39, 0x07]

	// The field is the background block; the surface block is published but the marks sit on one
	// ground, which is all `readOverlay` needs — the ramp it measures against is passed in.
	// The ink is the heaviest mark, so mass-led picks it as the foreground and the test is about the
	// accent choice between the remaining two.
	const scene = flatScene(20, BACKGROUND, [[INK, 90], [WHITE, 60], [DISTANT_DARK, 20]])
	const stops: GradientStop[] = [
		{ color: colorFromRgb(BACKGROUND), position: 0 },
		{ color: colorFromRgb(SURFACE), position: 1 },
	]
	const reading = readOverlay(
		scene.fit,
		scene.raster,
		scene.inventory,
		DEFAULT_CONTRAST,
		stops,
	)

	assert.equal(reading.foreground?.representative, pack(INK))

	const white = reading.clusters.find((c) => c.representative === pack(WHITE))!
	const dark = reading.clusters.find((c) => c.representative === pack(DISTANT_DARK))!

	// Both clear both gates, so neither is filtered out and the ranking decides alone.
	const accentFloor = DEFAULT_CONTRAST.minAccentContrast.effectiveRawMagnitude
	for (const rgb of [WHITE, DISTANT_DARK]) {
		assert.equal(
			firstInvisibleAccentOnRamp(colorFromRgb(rgb), stops, accentFloor, ACCENT_FUNCTIONAL_DISTANCE),
			null,
			`${JSON.stringify(rgb)} must clear the accent floor`,
		)
		assert.ok(!sameColor(colorFromRgb(rgb), colorFromRgb(INK)))
		assert.ok(!sameColor(colorFromRgb(rgb), colorFromRgb(BACKGROUND)))
		assert.ok(!sameColor(colorFromRgb(rgb), colorFromRgb(SURFACE)))
	}

	// The v0.3 rule preferred the dark: it is further from everything published.
	const published = [colorFromRgb(INK), colorFromRgb(BACKGROUND), colorFromRgb(SURFACE)]
	const minDistance = (rgb: Rgb8) =>
		Math.min(...published.map((other) => colorDistance(colorFromRgb(rgb), other)))
	assert.ok(
		minDistance(DISTANT_DARK) > minDistance(WHITE),
		`the fixture must reproduce the v0.3 preference: ${minDistance(DISTANT_DARK)} vs ${minDistance(WHITE)}`,
	)
	// The v0.4 rule prefers the white: it is more of the artwork.
	assert.ok(white.overlayMass > dark.overlayMass)

	assert.equal(reading.accent?.representative, pack(WHITE))
})

/**
 * **Regression, decision 8's ruling (a): the accent has a contrast floor.**
 *
 * This is the `16a8247378` class, and v0.2 got it wrong: it published accent `#00000b` on background
 * `#010000`, |raw APCA| 0.615, and earned two `I4.below-contrast-floor` rows. The mechanism is that
 * OKLab distances **inflate near black** — `#00000b` sits 0.0638 from the near-black field, further
 * than a perfectly visible pale grey sits from the published foreground — so a pure max-min-distance
 * rule reaches for a colour nobody can see.
 *
 * The floor is the contract's own accent clause, which is a *conjunction*: invisible only where
 * `|raw| < minAccentContrast` **and** the pair is closer than `ACCENT_FUNCTIONAL_DISTANCE` at the
 * same ramp point. `INVISIBLE` fails both at once; `VISIBLE` fails neither, and wins despite being
 * the nearer candidate.
 */
test("accent floor: a near-background invisible candidate loses to a lighter visible one", () => {
	const FIELD: Rgb8 = [1, 0, 0]
	const FOREGROUND_MARK: Rgb8 = [235, 235, 235]
	const INVISIBLE: Rgb8 = [0, 0, 11]
	// Not a pale grey: at 0.046 from the foreground that would now be excluded as its twin
	// (decision 14), which is a different rule from the one under test here.
	const VISIBLE: Rgb8 = [80, 140, 200]

	const scene = flatScene(16, FIELD, [[FOREGROUND_MARK, 30], [INVISIBLE, 20], [VISIBLE, 10]])
	const stops = rampOf(rgbToOkLab(FIELD), rgbToOkLab(FIELD))
	const reading = readOverlay(
		scene.fit,
		scene.raster,
		scene.inventory,
		DEFAULT_CONTRAST,
		stops,
	)

	assert.equal(reading.foreground?.representative, pack(FOREGROUND_MARK))

	// The fixture is the trap it claims to be: the invisible candidate carries **more mass** than the
	// visible one, so the v0.4 ranking would take it outright, and it is far enough from the
	// foreground that decision 14's twin exclusion does not catch it either. Only the floor does.
	const invisible = reading.clusters.find((c) => c.representative === pack(INVISIBLE))!
	const visible = reading.clusters.find((c) => c.representative === pack(VISIBLE))!
	assert.ok(
		invisible.overlayMass > visible.overlayMass,
		`the trap needs the invisible candidate to be heavier: ${invisible.overlayMass} vs ${visible.overlayMass}`,
	)
	for (const rgb of [INVISIBLE, VISIBLE]) {
		assert.ok(
			colorDistance(colorFromRgb(rgb), colorFromRgb(FOREGROUND_MARK)) >=
				8 * sameColorBar(colorFromRgb(rgb), colorFromRgb(FOREGROUND_MARK)),
			`${JSON.stringify(rgb)} must not be the foreground's twin, or a different rule is doing the work`,
		)
	}
	// ...and it is genuinely distinct by the bar, so distinctness alone would not have caught it.
	assert.ok(!sameColor(colorFromRgb(INVISIBLE), colorFromRgb(FIELD)))

	// The contract's own accent clause is what rejects it.
	assert.notEqual(
		firstInvisibleAccentOnRamp(
			colorFromRgb(INVISIBLE),
			stops,
			DEFAULT_CONTRAST.minAccentContrast.effectiveRawMagnitude,
			ACCENT_FUNCTIONAL_DISTANCE,
		),
		null,
	)
	assert.equal(
		firstInvisibleAccentOnRamp(
			colorFromRgb(VISIBLE),
			stops,
			DEFAULT_CONTRAST.minAccentContrast.effectiveRawMagnitude,
			ACCENT_FUNCTIONAL_DISTANCE,
		),
		null,
	)

	assert.equal(reading.accent?.representative, pack(VISIBLE))
})

/**
 * **Regression, decision 13 (item-7 class): a title that registers wins even at moderate contrast.**
 *
 * Round-2 item 7 is the sky-ramp cover: a white title on a light field, |raw| **28.9** over the
 * published ramp, which `apca-max` passed over in favour of a 71-pixel black speck at |raw| 73.5.
 * The reviewer wanted the title. The floor is set at 15 precisely so that a 28.9 survives it, so this
 * fixture is built at that magnitude rather than at an easy one.
 */
test("foreground floor: a moderate-contrast massive title beats a high-contrast speck", () => {
	// A light sky field: white reads at |raw| 31.3 — just above the item-7 evidence point of 28.9 —
	// while black reads at 81.2. The old rule took the black.
	const FIELD: Rgb8 = [190, 210, 230]
	const TITLE: Rgb8 = [255, 255, 255]
	const SPECK: Rgb8 = [0, 0, 0]

	const scene = flatScene(18, FIELD, [[TITLE, 120], [SPECK, 6]])
	const stops = rampOf(rgbToOkLab(FIELD), rgbToOkLab(FIELD))
	const reading = readOverlay(scene.fit, scene.raster, scene.inventory, DEFAULT_CONTRAST, stops)

	const titleRaw = Math.abs(apcaRaw(TITLE, FIELD))
	const speckRaw = Math.abs(apcaRaw(SPECK, FIELD))
	// The fixture reproduces the evidence shape: the speck is the more legible colour by a wide
	// margin, the title is moderate, and the title still clears the floor.
	assert.ok(speckRaw > titleRaw, `${speckRaw} must exceed ${titleRaw}`)
	assert.ok(titleRaw >= 15, `the title must clear the floor, got ${titleRaw}`)
	assert.ok(titleRaw < 35, `and must sit near the item-7 evidence point, got ${titleRaw}`)

	const title = reading.clusters.find((c) => c.representative === pack(TITLE))!
	const speck = reading.clusters.find((c) => c.representative === pack(SPECK))!
	assert.ok(title.overlayMass > speck.overlayMass * 10)

	assert.equal(reading.foreground?.representative, pack(TITLE))
})

/**
 * **Regression, decision 14: the foreground's twin is excluded, and the next identity colour wins.**
 *
 * Built from the evidenced pair on `908479200b` — foreground `#fed078`, accent `#febf6f`, measured
 * `distance / sameColorBar` = **1.766**, which `sameColor` passes and a reviewer called
 * indistinguishable. `ACCENT_FG_EXCLUSION_MULTIPLE` is 8, so the twin is excluded and the accent
 * falls to the next-heaviest candidate outside the foreground's family.
 */
test("accent twin exclusion: the evidenced twin is excluded and the next colour wins", () => {
	const FIELD: Rgb8 = [0x23, 0x1f, 0x20]
	const INK: Rgb8 = [0xfe, 0xd0, 0x78]
	const TWIN: Rgb8 = [0xfe, 0xbf, 0x6f]
	const OTHER: Rgb8 = [0x5a, 0x8f, 0xc0]

	const scene = flatScene(20, FIELD, [[INK, 90], [TWIN, 60], [OTHER, 20]])
	const stops = rampOf(rgbToOkLab(FIELD), rgbToOkLab(FIELD))
	const reading = readOverlay(scene.fit, scene.raster, scene.inventory, DEFAULT_CONTRAST, stops)

	assert.equal(reading.foreground?.representative, pack(INK))

	// The measured ratio this constant was derived from, asserted here so the derivation cannot drift
	// away from the code silently.
	const ratio = colorDistance(colorFromRgb(TWIN), colorFromRgb(INK)) /
		sameColorBar(colorFromRgb(TWIN), colorFromRgb(INK))
	assert.ok(ratio > 1.7 && ratio < 1.8, `the evidenced ratio is 1.766, got ${ratio}`)
	// `sameColor` passes the pair — which is exactly why decision 14 exists.
	assert.ok(!sameColor(colorFromRgb(TWIN), colorFromRgb(INK)))

	// The twin carries three times the other candidate's mass and still loses.
	const twin = reading.clusters.find((c) => c.representative === pack(TWIN))!
	const other = reading.clusters.find((c) => c.representative === pack(OTHER))!
	assert.ok(twin.overlayMass > other.overlayMass)

	assert.equal(reading.accent?.representative, pack(OTHER))
})

/**
 * **Regression, decision 14: when only the twin is available, the accent collapses.**
 *
 * The same scene minus the third colour. Decision 14's terminal clause — *"if none survives, accent
 * collapses, declared"* — is `readOverlay` returning a null accent, which `candidate.ts` turns into
 * `accentCollapsed`.
 */
test("accent twin exclusion: with only the twin available the accent collapses", () => {
	const FIELD: Rgb8 = [0x23, 0x1f, 0x20]
	const INK: Rgb8 = [0xfe, 0xd0, 0x78]
	const TWIN: Rgb8 = [0xfe, 0xbf, 0x6f]

	const scene = flatScene(20, FIELD, [[INK, 90], [TWIN, 60]])
	const stops = rampOf(rgbToOkLab(FIELD), rgbToOkLab(FIELD))
	const reading = readOverlay(scene.fit, scene.raster, scene.inventory, DEFAULT_CONTRAST, stops)

	assert.equal(reading.foreground?.representative, pack(INK))
	assert.equal(reading.accent, null)
	assert.equal(reading.accentChromaOnly, false)
})

// ---------------------------------------------------------------------------------------------
// 4 — collapse and escape
// ---------------------------------------------------------------------------------------------

test("collapse: nothing distinct from the foreground leaves the accent null", () => {
	const size = 12
	const MARK: Rgb8 = [255, 255, 255]
	const MARK_DITHER: Rgb8 = [254, 255, 255]
	const isMark = (column: number, row: number) => inRectangle(column, row, 2, 6, 2, 6)

	const scene = buildScene(
		size,
		size,
		(column, row) => {
			if (!isMark(column, row)) return FLAT_FIELD_RGB
			return (column + row) % 2 === 0 ? MARK : MARK_DITHER
		},
		(column, row) => (isMark(column, row) ? 0 : 1),
		() => FLAT_FIELD_LAB,
		0,
	)

	const reading = readOverlay(
		scene.fit,
		scene.raster,
		scene.inventory,
		DEFAULT_CONTRAST,
		FLAT_STOPS,
	)

	// Both mark triples land in one bar-neighbourhood, so the only cluster is the foreground.
	assert.equal(reading.clusters.length, 1)
	assert.equal(reading.clusters[0]?.memberCount, 2)
	assert.notEqual(reading.foreground, null)
	assert.equal(reading.accent, null)
	assert.equal(reading.accentChromaOnly, false)
})

test("escape: no cluster distinct from its local field leaves the foreground null", () => {
	const size = 12
	const isRejected = (column: number, row: number) => inRectangle(column, row, 2, 6, 2, 6)

	// The fit rejected pixels that are nonetheless exactly the field colour — the situation SPEC
	// decision 10 calls the escape. Nothing in the overlay is a different colour from the field, so
	// this module reports no foreground and lets `candidate.ts` pick the escape colour.
	const scene = buildScene(
		size,
		size,
		() => FLAT_FIELD_RGB,
		(column, row) => (isRejected(column, row) ? 0 : 1),
		() => FLAT_FIELD_LAB,
		0,
	)

	const reading = readOverlay(
		scene.fit,
		scene.raster,
		scene.inventory,
		DEFAULT_CONTRAST,
		FLAT_STOPS,
	)

	assert.equal(reading.clusters.length, 1)
	assert.equal(reading.clusters[0]?.overlayMass, 25)
	assert.equal(reading.foreground, null)
	assert.equal(reading.accent, null)
	assert.equal(reading.accentChromaOnly, false)
})

test("an empty overlay yields no clusters and no roles", () => {
	const size = 8
	const scene = buildScene(
		size,
		size,
		() => FLAT_FIELD_RGB,
		() => 1,
		() => FLAT_FIELD_LAB,
		0,
	)
	const reading = readOverlay(
		scene.fit,
		scene.raster,
		scene.inventory,
		DEFAULT_CONTRAST,
		FLAT_STOPS,
	)
	assert.deepEqual(reading, { clusters: [], foreground: null, accent: null, accentChromaOnly: false })
})

/**
 * **Regression, SPEC decision 16: the accent visibility floor, on both published field colours.**
 *
 * Built from round-3 item 8's refuted pair — background `#f2190a`, accent `#ff2c00`, measured OKLab
 * distance **0.03357** on a `sameColorBar` of 0.02293, so it clears distinctness at 1.46 bars and the
 * reviewer still called it *"very hard to read on top of the background"*. It also cleared the
 * contract's accent clause, because that clause is a pointwise conjunction and this pair's
 * `min|raw APCA|` over the ramp is 4.28 against a floor of 2.5 — which is the measurement decision 16
 * asked for, asserted here so the ruling's premise cannot drift.
 */
test("accent visibility floor: a near-background candidate loses to a distant one", () => {
	const BACKGROUND: Rgb8 = [0xf2, 0x19, 0x0a]
	const NEAR: Rgb8 = [0xff, 0x2c, 0x00]
	const FAR: Rgb8 = [0x86, 0x88, 0x25]
	const INK: Rgb8 = [0x8c, 0x34, 0x06]

	// The evidence, reproduced: distinct by the bar, admitted by the contract's accent clause.
	const near = colorFromRgb(NEAR)
	const background = colorFromRgb(BACKGROUND)
	const distance = colorDistance(near, background)
	assert.ok(distance > 0.033 && distance < 0.034, `the evidenced distance is 0.03357, got ${distance}`)
	assert.ok(!sameColor(near, background), "distinctness passed it — that is why decision 16 exists")
	assert.ok(distance < ACCENT_VISIBILITY_COLOR_DISTANCE, "and the new floor must refuse it")

	const scene = flatScene(20, BACKGROUND, [[INK, 120], [NEAR, 90], [FAR, 20]])
	const stops = rampOf(rgbToOkLab(BACKGROUND), rgbToOkLab(BACKGROUND))
	const reading = readOverlay(scene.fit, scene.raster, scene.inventory, DEFAULT_CONTRAST, stops)

	assert.equal(reading.foreground?.representative, pack(INK))
	// The near candidate carries four times the far one's mass and still loses.
	const nearCluster = reading.clusters.find((c) => c.representative === pack(NEAR))!
	const farCluster = reading.clusters.find((c) => c.representative === pack(FAR))!
	assert.ok(nearCluster.overlayMass > farCluster.overlayMass * 3)
	assert.equal(reading.accent?.representative, pack(FAR))
})

/**
 * **Regression, SPEC decision 16: both ends, never one.** Round-3 item 5's accent cleared the
 * background at 0.06262 and failed the surface at 0.04205, and the complaint named the surface — so
 * the floor is a conjunction over the two published field colours, not a test against one of them.
 */
test("accent visibility floor: clearing one end is not enough", () => {
	const BACKGROUND: Rgb8 = [0x13, 0x20, 0x28]
	const SURFACE: Rgb8 = [0x17, 0x25, 0x2e]
	const NEAR_SURFACE: Rgb8 = [0x1f, 0x30, 0x38]
	const FAR: Rgb8 = [0xc3, 0x91, 0x70]
	const INK: Rgb8 = [0xff, 0xff, 0xff]

	const near = colorFromRgb(NEAR_SURFACE)
	assert.ok(
		colorDistance(near, colorFromRgb(BACKGROUND)) > colorDistance(near, colorFromRgb(SURFACE)),
		"the fixture must be nearer the surface than the background, as the evidence is",
	)
	assert.ok(colorDistance(near, colorFromRgb(SURFACE)) < ACCENT_VISIBILITY_COLOR_DISTANCE)

	const scene = flatScene(20, BACKGROUND, [[INK, 150], [NEAR_SURFACE, 90], [FAR, 20]])
	const stops = rampOf(rgbToOkLab(BACKGROUND), rgbToOkLab(SURFACE))
	const reading = readOverlay(scene.fit, scene.raster, scene.inventory, DEFAULT_CONTRAST, stops)

	assert.equal(reading.accent?.representative, pack(FAR))
})

/**
 * **Regression, SPEC decision 16: an accent already clear of both ends does not move.** Round-3
 * item 2's accent `#412824` sat at 0.185 / 0.440 and the item was graded STRONG in silence; nothing
 * in v0.7 may touch it.
 */
test("accent visibility floor: a comfortably distant accent is untouched", () => {
	const BACKGROUND: Rgb8 = [0x7a, 0x54, 0x5f]
	const ACCENT: Rgb8 = [0x41, 0x28, 0x24]
	const INK: Rgb8 = [0xfe, 0xd0, 0x78]

	assert.ok(
		colorDistance(colorFromRgb(ACCENT), colorFromRgb(BACKGROUND)) > ACCENT_VISIBILITY_COLOR_DISTANCE,
	)
	const scene = flatScene(20, BACKGROUND, [[INK, 120], [ACCENT, 60]])
	const stops = rampOf(rgbToOkLab(BACKGROUND), rgbToOkLab(BACKGROUND))
	const reading = readOverlay(scene.fit, scene.raster, scene.inventory, DEFAULT_CONTRAST, stops)

	assert.equal(reading.foreground?.representative, pack(INK))
	assert.equal(reading.accent?.representative, pack(ACCENT))
})
