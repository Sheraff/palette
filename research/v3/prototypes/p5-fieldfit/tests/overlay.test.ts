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
	colorFromRgb,
	okLabDistance,
	okLabToRgb,
	rgbToOkLab,
	sameColorBar,
} from "../../../src/contract/color.ts"
import {
	DEFAULT_CONTRAST_PARAMETERS,
	resolveContrastParameters,
} from "../../../src/contract/invariants.ts"
import type { OkLab, Rgb8 } from "../../../src/contract/types.ts"
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
const RAMP_ENDS: readonly [OkLab, OkLab] = [rampField(-1), rampField(1)]

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
		RAMP_ENDS,
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
		RAMP_ENDS,
	)
	const ditheredReading = readOverlay(
		dithered.fit,
		dithered.raster,
		dithered.inventory,
		DEFAULT_CONTRAST,
		RAMP_ENDS,
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
const FLAT_ENDS: readonly [OkLab, OkLab] = [FLAT_FIELD_LAB, FLAT_FIELD_LAB]

/**
 * The lightness candidate. Deliberately **not** a pure grey: two neutrals differ in OKLab chroma
 * only by float noise (~1e-9), and whether one such noise value exceeds another is arbitrary — a
 * pure grey here would make Pareto dominance over the dominated candidate a coin flip. A trace of
 * blue gives it a chroma that robustly exceeds the dominated candidate's.
 */
const LIGHTNESS_ONLY: Rgb8 = [10, 10, 30]
/** Dominated: strictly less lightness departure than `LIGHTNESS_ONLY` and strictly less chroma. */
const DOMINATED: Rgb8 = [90, 90, 90]
const FOREGROUND: Rgb8 = [0, 0, 200]

function paretoScene(lightnessPatchSize: number): Scene {
	const size = 20
	const foregroundEnd = 40
	const dominatedEnd = foregroundEnd + 20
	const chromaEnd = dominatedEnd + 12
	const lightnessEnd = chromaEnd + lightnessPatchSize

	const colourFor = (index: number): Rgb8 => {
		if (index < foregroundEnd) return FOREGROUND
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

test("accent Pareto: the dominated candidate never wins, the front's heaviest member does", () => {
	const scene = paretoScene(3)
	const reading = readOverlay(
		scene.fit,
		scene.raster,
		scene.inventory,
		DEFAULT_CONTRAST,
		FLAT_ENDS,
	)

	assert.equal(reading.clusters.length, 4)
	assert.equal(reading.foreground?.representative, pack(FOREGROUND))

	const byTriple = new Map(reading.clusters.map((cluster) => [cluster.representative, cluster]))
	const dominated = byTriple.get(pack(DOMINATED))!
	const lightness = byTriple.get(pack(LIGHTNESS_ONLY))!
	const chroma = byTriple.get(pack(CHROMA_ONLY))!

	// The construction is what the test claims it is: `DOMINATED` really is dominated on both axes.
	const axes = (cluster: typeof dominated) =>
		[Math.abs(cluster.deltaL), Math.hypot(cluster.deltaC, cluster.deltaH)] as const
	assert.ok(axes(lightness)[0] > axes(dominated)[0])
	assert.ok(axes(lightness)[1] > axes(dominated)[1])
	// ...and the front's two members dominate neither each other.
	assert.ok(axes(chroma)[1] > axes(lightness)[1])
	assert.ok(axes(lightness)[0] > axes(chroma)[0])

	// It also carries the largest overlay mass of the three, so a mass-only rule would pick it.
	assert.ok(dominated.overlayMass > chroma.overlayMass)
	assert.ok(dominated.overlayMass > lightness.overlayMass)

	// The front's heaviest member wins, and it is the chroma-only candidate.
	assert.equal(reading.accent?.representative, pack(CHROMA_ONLY))
	assert.notEqual(reading.accent?.representative, pack(DOMINATED))
	assert.equal(reading.accentChromaOnly, true)
	assert.ok(
		axes(chroma)[0] <
			sameColorBar(colorFromRgb(CHROMA_ONLY), colorFromRgb(FLAT_FIELD_RGB)),
	)
})

test("accent Pareto: a heavier lightness candidate takes the front and clears the chroma-only flag", () => {
	const scene = paretoScene(30)
	const reading = readOverlay(
		scene.fit,
		scene.raster,
		scene.inventory,
		DEFAULT_CONTRAST,
		FLAT_ENDS,
	)

	assert.equal(reading.foreground?.representative, pack(FOREGROUND))
	assert.equal(reading.accent?.representative, pack(LIGHTNESS_ONLY))
	assert.notEqual(reading.accent?.representative, pack(DOMINATED))
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
		FLAT_ENDS,
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
		FLAT_ENDS,
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
		FLAT_ENDS,
	)
	assert.deepEqual(reading, { clusters: [], foreground: null, accent: null, accentChromaOnly: false })
})
