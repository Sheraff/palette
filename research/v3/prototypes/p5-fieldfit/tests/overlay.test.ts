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
import { ACCENT_FUNCTIONAL_DISTANCE } from "../../../src/contract/constants.ts"
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
 * **This scene's expected winners have now changed twice, and both changes are the point.**
 *
 * The constants have never moved; the rules have, twice, on measurement:
 *
 *  - *pre-round-1*: foreground = heaviest feasible cluster (`BLUE_MARK`, 40 px); accent = heaviest
 *    member of the Pareto front (`CHROMA_ONLY`).
 *  - *v0.2*: foreground = most legible feasible cluster (`LIGHTNESS_ONLY`); accent = front member
 *    furthest from what is published.
 *  - *v0.3*: **the front is gone entirely** (decision 8, ruling b). The accent is the feasible,
 *    floor-clearing candidate furthest from `{foreground, background, surface}` — full stop.
 *
 * `BLUE_MARK` wins the accent under both v0.2 and v0.3, but for a materially different reason, so the
 * assertions below check the *criterion* and not just the answer.
 */
test("accent selection: furthest from everything published, with no front and no mass", () => {
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

	// --- foreground: legibility, not mass (decision 7's round-1 ruling) ---
	assert.ok(blue.overlayMass > lightness.overlayMass)
	const rawAgainstField = (rgb: Rgb8) => Math.abs(apcaRaw(rgb, FLAT_FIELD_RGB))
	assert.ok(
		rawAgainstField(LIGHTNESS_ONLY) > rawAgainstField(BLUE_MARK),
		"the fixture must make the small patch the more legible one",
	)
	assert.equal(reading.foreground?.representative, pack(LIGHTNESS_ONLY))

	// `CHROMA_ONLY` sits below the *text* floor against this field (|raw| ≈ 2.29 < 2.5), so it is not
	// a foreground at any mass — while remaining a legitimate accent candidate, which is the whole
	// reason the two roles are held to different floors.
	assert.ok(rawAgainstField(CHROMA_ONLY) < DEFAULT_CONTRAST.minTextContrast.effectiveRawMagnitude)

	// --- accent: max min-distance to {foreground, both ends} ---
	const published = [colorFromRgb(LIGHTNESS_ONLY), colorFromRgb(FLAT_FIELD_RGB)]
	const minDistance = (rgb: Rgb8) =>
		Math.min(...published.map((other) => colorDistance(colorFromRgb(rgb), other)))
	assert.ok(minDistance(BLUE_MARK) > minDistance(CHROMA_ONLY))
	assert.ok(minDistance(CHROMA_ONLY) > minDistance(DOMINATED))
	// `DOMINATED` still carries more mass than either, and still loses — but under v0.3 it loses on
	// distance rather than on front membership, which no longer exists.
	assert.ok(dominated.overlayMass > chroma.overlayMass)

	assert.equal(reading.accent?.representative, pack(BLUE_MARK))
	assert.notEqual(reading.accent?.representative, pack(DOMINATED))
	assert.equal(reading.accentChromaOnly, false)
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
 * **Regression, decision 8's round-1 ruling: the front's winner is the furthest from what is
 * already published.**
 *
 * Round 1 graded items 3, 5 and 6 down because mass-heavy dull clusters won the front while the
 * artwork's vivid colours lost. `NEAR_FOREGROUND` is a big pale patch a hair from the published
 * foreground; `VIVID` is a smaller crimson one far from both the foreground and the field. Neither
 * dominates the other on the front's axes, so the winner is decided by the new rule alone.
 */
test("accent ranking: a near-foreground massive cluster loses to a separated vivid one", () => {
	const FIELD: Rgb8 = [128, 128, 128]
	const FOREGROUND_MARK: Rgb8 = [255, 255, 255]
	const NEAR_FOREGROUND: Rgb8 = [235, 235, 235]
	const VIVID: Rgb8 = [220, 20, 60]

	const scene = flatScene(16, FIELD, [[FOREGROUND_MARK, 20], [NEAR_FOREGROUND, 40], [VIVID, 12]])
	const reading = readOverlay(
		scene.fit,
		scene.raster,
		scene.inventory,
		DEFAULT_CONTRAST,
		rampOf(rgbToOkLab(FIELD), rgbToOkLab(FIELD)),
	)

	assert.equal(reading.foreground?.representative, pack(FOREGROUND_MARK))

	const near = reading.clusters.find((cluster) => cluster.representative === pack(NEAR_FOREGROUND))!
	const vivid = reading.clusters.find((cluster) => cluster.representative === pack(VIVID))!

	// Neither dominates the other, so both are on the front and the tie-break is the whole decision.
	const axes = (cluster: typeof near) =>
		[Math.abs(cluster.deltaL), Math.hypot(cluster.deltaC, cluster.deltaH)] as const
	assert.ok(axes(near)[0] > axes(vivid)[0])
	assert.ok(axes(vivid)[1] > axes(near)[1])
	// The old rule would have taken the heavier one.
	assert.ok(near.overlayMass > vivid.overlayMass)
	// The new rule takes the one furthest from everything published.
	const minDistance = (rgb: Rgb8) =>
		Math.min(
			colorDistance(colorFromRgb(rgb), colorFromRgb(FOREGROUND_MARK)),
			colorDistance(colorFromRgb(rgb), colorFromRgb(FIELD)),
		)
	assert.ok(minDistance(VIVID) > minDistance(NEAR_FOREGROUND))

	assert.equal(reading.accent?.representative, pack(VIVID))
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
test("accent floor: a near-background invisible candidate loses to a visible nearer one", () => {
	const FIELD: Rgb8 = [1, 0, 0]
	const FOREGROUND_MARK: Rgb8 = [235, 235, 235]
	const INVISIBLE: Rgb8 = [0, 0, 11]
	const VISIBLE: Rgb8 = [220, 220, 220]

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

	// The fixture is the trap it claims to be: the invisible candidate is *further* from everything
	// published than the visible one, and carries more mass, so both pre-(a) rules would take it.
	const published = [colorFromRgb(FOREGROUND_MARK), colorFromRgb(FIELD)]
	const minDistance = (rgb: Rgb8) =>
		Math.min(...published.map((other) => colorDistance(colorFromRgb(rgb), other)))
	assert.ok(
		minDistance(INVISIBLE) > minDistance(VISIBLE),
		`the trap needs the invisible candidate to be further: ${minDistance(INVISIBLE)} vs ${minDistance(VISIBLE)}`,
	)
	const invisible = reading.clusters.find((c) => c.representative === pack(INVISIBLE))!
	const visible = reading.clusters.find((c) => c.representative === pack(VISIBLE))!
	assert.ok(invisible.overlayMass > visible.overlayMass)
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
