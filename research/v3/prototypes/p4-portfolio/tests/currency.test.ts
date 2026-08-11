/**
 * # Tests for the currency — `L(member palette | image)` (SPEC §2).
 *
 * Every image here is **synthetic and built in memory**. `priceMember` takes a `DecodedImage`
 * struct, not a path, so a test can hand it exactly the field it wants to price and know the right
 * answer in advance — which is the only way to check "the description that explains more costs
 * less" as arithmetic rather than as a plausible-looking number. No file is read and no decoder is
 * involved, so a failure here is a failure of the currency and of nothing else.
 *
 * The synthetic images carry a **deterministic ±1-LSB dither** from a seeded generator. That is not
 * decoration: an exactly flat synthetic fill measures σ = 0, at which the currency is degenerate by
 * design (`selector/substrate.ts`) and every total is `NaN`. The dither is the smallest thing that
 * makes the fixture a valid input rather than a refused one, and its presence is itself a reminder
 * of what §5 of `BITTABLE.md` reports about four real covers.
 *
 * The claims, each named after what it would falsify:
 *
 *  1. **more explanation is cheaper** — the palette whose implied field matches the image prices
 *     below one whose field does not. Without this the currency ranks nothing.
 *  2. **a gradient beats a flat field on a ramp, and loses on a flat image** — the field the palette
 *     implies is actually being fitted, in both directions.
 *  3. **a collapse is cheaper than the same palette plus a distinction** — SPEC §2's "collapses make
 *     palettes cheaper, as they should", checked as an equality on the residual and an inequality on
 *     `L(palette)`, so the saving is provably the schema's and not the fit's.
 *  4. **explaining pixels at the foreground bar can only reduce the residual** — monotonicity, which
 *     is what makes 1 a property of the arithmetic rather than a coincidence of the fixture.
 *  5. **the currency never sees the member** — the same palette priced under two slugs produces
 *     identical numbers. SPEC §2's member-independence, as a test rather than a signature.
 *
 * Run:
 * NODE_NO_WARNINGS=1 node --experimental-strip-types --test \
 *   research/v3/prototypes/p4-portfolio/tests/currency.test.ts
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
	CONTRACT_VERSION,
	colorFromRgb,
	okLabFromColor,
	rgbToOkLab,
} from "../../../src/contract/index.ts"
import type { Palette, PaletteColor, Rgb8 } from "../../../src/contract/types.ts"
import { makeRng } from "../../../src/stats/numeric.ts"
import {
	LATTICE_RESOLUTION_C,
	OKLAB_DIMENSIONS,
	buildSubstrate,
	priceMember,
	schemaPrice,
} from "../selector/index.ts"
import type { DecodedImage } from "../selector/types.ts"

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

/** [STRUCTURAL] The fixture frame's side, in pixels. Large enough that every C-cell is populated. */
const FIXTURE_SIDE = 96
/** [STRUCTURAL] An arbitrary but fixed seed. Determinism device; no result depends on its value. */
const FIXTURE_SEED = 20260811
/** [STRUCTURAL] The dither's amplitude: one 8-bit least-significant bit, the smallest step there is. */
const ONE_LSB = 1
/** [STRUCTURAL] The maximum value an 8-bit channel holds. */
const CHANNEL_MAX = 255

/**
 * Build a `DecodedImage` from a colour function, with a seeded ±1-LSB dither.
 *
 * The dither is applied after the colour function so that a "flat" fixture is flat up to one least
 * significant bit — enough for the median adjacent difference to be non-zero, which is what the
 * currency needs to have a scale at all.
 */
function makeImage(color: (x: number, y: number) => Rgb8, side = FIXTURE_SIDE): DecodedImage {
	const random = makeRng(FIXTURE_SEED)
	const pixels = side * side
	const rgb = new Uint8Array(pixels * OKLAB_DIMENSIONS)
	const lab = new Float64Array(pixels * OKLAB_DIMENSIONS)
	for (let y = 0; y < side; y += 1) {
		for (let x = 0; x < side; x += 1) {
			const base = (y * side + x) * OKLAB_DIMENSIONS
			const source = color(x, y)
			const channels: number[] = []
			for (let channel = 0; channel < OKLAB_DIMENSIONS; channel += 1) {
				const step = random() < 1 / 2 ? -ONE_LSB : ONE_LSB
				const value = Math.max(0, Math.min(CHANNEL_MAX, source[channel]! + step))
				channels.push(value)
				rgb[base + channel] = value
			}
			const dithered: Rgb8 = [channels[0]!, channels[1]!, channels[2]!]
			const okLab = rgbToOkLab(dithered)
			for (let channel = 0; channel < OKLAB_DIMENSIONS; channel += 1) {
				lab[base + channel] = okLab[channel]!
			}
		}
	}
	return {
		path: "synthetic",
		width: side,
		height: side,
		rgb,
		lab,
		contentHash: "0".repeat(64),
		format: "synthetic",
	}
}

/** A contract-shaped palette. Only the parts the currency reads are meaningful. */
function makePalette(options: {
	background: Rgb8
	surface: Rgb8
	foreground: Rgb8
	accent: Rgb8
	surfaceCollapsed?: boolean
	accentCollapsed?: boolean
	gradientStops?: { rgb: Rgb8; position: number }[]
}): Palette {
	const color = (rgb: Rgb8): PaletteColor => colorFromRgb(rgb)
	const stops = options.gradientStops
	return {
		contractVersion: CONTRACT_VERSION,
		roles: {
			background: color(options.background),
			surface: color(options.surface),
			foreground: color(options.foreground),
			accent: color(options.accent),
		},
		gradient:
			stops === undefined
				? null
				: {
						stops: [
							{ color: color(stops[0]!.rgb), position: stops[0]!.position },
							{ color: color(stops[1]!.rgb), position: stops[1]!.position },
							...stops.slice(2).map((stop) => ({ color: color(stop.rgb), position: stop.position })),
						],
					},
		collapse: {
			surfaceCollapsed: options.surfaceCollapsed ?? false,
			accentCollapsed: options.accentCollapsed ?? false,
		},
		contrast: {
			minTextContrast: { requestedLc: 0, effectiveRawMagnitude: 0 },
			minAccentContrast: { requestedLc: 0, effectiveRawMagnitude: 0 },
		},
		metadata: {
			algorithmVersion: "test",
			preprocessingVersion: "test",
			inputContentHash: "0".repeat(64),
			sourceRendition: {
				path: "synthetic",
				width: FIXTURE_SIDE,
				height: FIXTURE_SIDE,
				format: "synthetic",
			},
			processedSize: { width: FIXTURE_SIDE, height: FIXTURE_SIDE },
		},
	}
}

const NAVY: Rgb8 = [20, 30, 90]
const CREAM: Rgb8 = [240, 235, 220]
const RUST: Rgb8 = [180, 70, 30]
const MOSS: Rgb8 = [70, 110, 60]

function price(image: DecodedImage, palette: Palette, slug = "member") {
	return priceMember(slug, palette, image, buildSubstrate(image, LATTICE_RESOLUTION_C))
}

// ---------------------------------------------------------------------------------------------
// 1 & 2 — the currency prices explanation
// ---------------------------------------------------------------------------------------------

test("currency: on a flat image, the palette whose background IS the image prices cheaper", () => {
	const image = makeImage(() => NAVY)
	const explains = price(image, makePalette({ background: NAVY, surface: CREAM, foreground: RUST, accent: MOSS }))
	const misses = price(image, makePalette({ background: CREAM, surface: NAVY, foreground: RUST, accent: MOSS }))

	assert.ok(Number.isFinite(explains.totalBits), "the fixture's σ is degenerate — check the dither")
	assert.ok(
		explains.residualBits < misses.residualBits,
		`the explaining palette must cost fewer residual bits: ${explains.residualBits} vs ${misses.residualBits}`,
	)
	assert.ok(explains.totalBits < misses.totalBits, "and fewer total bits")
	assert.equal(explains.schema.bits, misses.schema.bits, "the two differ only in which colour is where")
})

test("currency: on a horizontal ramp, a gradient palette prices below a flat one", () => {
	// The image ramps NAVY → CREAM left to right. The gradient palette's two ends are those colours,
	// so its implied field can follow the image; the flat palette's field is one colour and cannot.
	const image = makeImage((x) => {
		const t = x / (FIXTURE_SIDE - 1)
		return [
			Math.round(NAVY[0] + t * (CREAM[0] - NAVY[0])),
			Math.round(NAVY[1] + t * (CREAM[1] - NAVY[1])),
			Math.round(NAVY[2] + t * (CREAM[2] - NAVY[2])),
		]
	})
	const gradient = price(
		image,
		makePalette({
			background: NAVY,
			surface: CREAM,
			foreground: RUST,
			accent: MOSS,
			gradientStops: [
				{ rgb: NAVY, position: 0 },
				{ rgb: CREAM, position: 1 },
			],
		}),
	)
	const flat = price(image, makePalette({ background: NAVY, surface: CREAM, foreground: RUST, accent: MOSS }))

	assert.equal(gradient.field.kind, "gradient")
	assert.equal(flat.field.kind, "flat")
	assert.ok(
		gradient.residualBits < flat.residualBits,
		`a gradient must explain a ramp better than a flat field: ${gradient.residualBits} vs ${flat.residualBits}`,
	)
	assert.ok(gradient.totalBits < flat.totalBits, "and win on the total, the ramp being strong evidence")
})

test("currency: on a flat image, the same gradient palette LOSES to the flat one", () => {
	// The other direction, and the one that would catch a currency that simply prefers gradients.
	const image = makeImage(() => NAVY)
	const gradient = price(
		image,
		makePalette({
			background: NAVY,
			surface: CREAM,
			foreground: RUST,
			accent: MOSS,
			gradientStops: [
				{ rgb: NAVY, position: 0 },
				{ rgb: CREAM, position: 1 },
			],
		}),
	)
	const flat = price(image, makePalette({ background: NAVY, surface: CREAM, foreground: RUST, accent: MOSS }))
	assert.ok(
		flat.totalBits < gradient.totalBits,
		`a flat image must not be better described by a ramp: ${flat.totalBits} vs ${gradient.totalBits}`,
	)
})

test("currency: the fitted gradient axis follows the image, not the stop order", () => {
	// A vertical ramp must be fitted at a different angle from a horizontal one, using the same
	// palette in both cases. The contract's gradients carry no geometry the currency reads.
	const stops = [
		{ rgb: NAVY, position: 0 },
		{ rgb: CREAM, position: 1 },
	]
	const palette = makePalette({
		background: NAVY,
		surface: CREAM,
		foreground: RUST,
		accent: MOSS,
		gradientStops: stops,
	})
	const ramp = (horizontal: boolean) =>
		makeImage((x, y) => {
			const t = (horizontal ? x : y) / (FIXTURE_SIDE - 1)
			return [
				Math.round(NAVY[0] + t * (CREAM[0] - NAVY[0])),
				Math.round(NAVY[1] + t * (CREAM[1] - NAVY[1])),
				Math.round(NAVY[2] + t * (CREAM[2] - NAVY[2])),
			]
		})
	const horizontal = price(ramp(true), palette)
	const vertical = price(ramp(false), palette)
	assert.notEqual(horizontal.field.angleRadians, vertical.field.angleRadians)
	assert.ok((horizontal.field.coarseAngles ?? 0) > 0, "the coarse sweep must have run")
})

// ---------------------------------------------------------------------------------------------
// 3 — collapses are cheaper
// ---------------------------------------------------------------------------------------------

test("currency: a collapsed palette is cheaper than the identical palette plus one distinction", () => {
	const image = makeImage(() => NAVY)
	// A collapse is exact equality (contract `CollapseFlags`), so the collapsed palette publishes
	// surface = background and declares it; the rival publishes a distinct surface and does not.
	const collapsed = makePalette({
		background: NAVY,
		surface: NAVY,
		foreground: RUST,
		accent: MOSS,
		surfaceCollapsed: true,
	})
	const distinguished = makePalette({ background: NAVY, surface: CREAM, foreground: RUST, accent: MOSS })

	const cheap = price(image, collapsed)
	const dear = price(image, distinguished)

	assert.ok(
		cheap.schema.bits < dear.schema.bits,
		`L(palette) must fall when a role collapses: ${cheap.schema.bits} vs ${dear.schema.bits}`,
	)
	assert.equal(cheap.schema.publishedColors + 1, dear.schema.publishedColors, "exactly one colour fewer")
	// The saving is the schema's alone: neither surface reaches the implied field of a flat palette,
	// so the residual is bit-identical and the inequality on the total cannot come from the fit.
	assert.equal(cheap.residualBits, dear.residualBits, "the residual must be untouched by the collapse")
	assert.ok(cheap.totalBits < dear.totalBits)
})

test("currency: an interior gradient stop costs exactly one published colour", () => {
	const twoStop = makePalette({
		background: NAVY,
		surface: CREAM,
		foreground: RUST,
		accent: MOSS,
		gradientStops: [
			{ rgb: NAVY, position: 0 },
			{ rgb: CREAM, position: 1 },
		],
	})
	const threeStop = makePalette({
		background: NAVY,
		surface: CREAM,
		foreground: RUST,
		accent: MOSS,
		gradientStops: [
			{ rgb: NAVY, position: 0 },
			{ rgb: RUST, position: 1 / 2 },
			{ rgb: CREAM, position: 1 },
		],
	})
	const cells = LATTICE_RESOLUTION_C * LATTICE_RESOLUTION_C
	const two = schemaPrice(twoStop, cells)
	const three = schemaPrice(threeStop, cells)
	assert.equal(three.publishedColors, two.publishedColors + 1, "the ends are the field roles already")
	assert.equal(three.discreteBits, two.discreteBits, "the stop count field's cardinality does not change")
	assert.ok(three.bits > two.bits, "a published distinction must cost something")
})

test("currency: L(palette) is a function of the schema and the lattice, never of the image", () => {
	const palette = makePalette({ background: NAVY, surface: CREAM, foreground: RUST, accent: MOSS })
	const cells = LATTICE_RESOLUTION_C * LATTICE_RESOLUTION_C
	const flatImage = makeImage(() => NAVY)
	const busyImage = makeImage((x, y) => (((x + y) & 1) === 0 ? NAVY : RUST))
	assert.equal(price(flatImage, palette).schema.bits, schemaPrice(palette, cells).bits)
	assert.equal(price(busyImage, palette).schema.bits, schemaPrice(palette, cells).bits)
	// And its parts add up, so the itemisation in the bit table is the number, not a commentary.
	const itemised = schemaPrice(palette, cells)
	assert.equal(
		itemised.items.reduce((total, item) => total + item.bits, 0),
		itemised.bits,
	)
	assert.equal(itemised.colorBits + itemised.discreteBits, itemised.bits)
})

// ---------------------------------------------------------------------------------------------
// 4 — monotone in explanation
// ---------------------------------------------------------------------------------------------

test("currency: explaining pixels at the foreground bar can only lower the residual", () => {
	// Half the frame is RUST. One palette publishes RUST as its foreground and so explains that half
	// at zero marginal residual; the other publishes a colour the image does not contain. Everything
	// else about the two palettes is identical, so the residual can move in one direction only.
	const image = makeImage((x) => (x < FIXTURE_SIDE / 2 ? NAVY : RUST))
	const explains = price(image, makePalette({ background: NAVY, surface: CREAM, foreground: RUST, accent: MOSS }))
	const misses = price(image, makePalette({ background: NAVY, surface: CREAM, foreground: MOSS, accent: MOSS }))

	assert.ok(explains.explainedPixelFraction > misses.explainedPixelFraction, "the mask must differ")
	assert.ok(
		explains.residualBits < misses.residualBits,
		`explaining half the frame must cost fewer residual bits: ${explains.residualBits} vs ${misses.residualBits}`,
	)
})

test("currency: per-cell residual bits sum to the reported total, and none is negative", () => {
	const image = makeImage((x, y) => (((x + y) & 1) === 0 ? NAVY : RUST))
	const priced = price(image, makePalette({ background: NAVY, surface: CREAM, foreground: RUST, accent: MOSS }))
	let total = 0
	for (const bits of priced.perCellResidualBits) {
		assert.ok(bits >= 0, "a cell cannot cost negative bits")
		total += bits
	}
	// The bootstrap resamples exactly this series, so a total that did not match it would mean the
	// margin was being measured on a different quantity from the one that decided the winner.
	assert.ok(Math.abs(total - priced.residualBits) < Number.EPSILON * Math.abs(total) * priced.perCellResidualBits.length)
	assert.equal(priced.perCellResidualBits.length, LATTICE_RESOLUTION_C * LATTICE_RESOLUTION_C)
})

// ---------------------------------------------------------------------------------------------
// 5 — member independence
// ---------------------------------------------------------------------------------------------

test("currency: the same palette under two slugs prices identically", () => {
	const image = makeImage((x, y) => (((x + y) & 1) === 0 ? NAVY : RUST))
	const palette = makePalette({ background: NAVY, surface: CREAM, foreground: RUST, accent: MOSS })
	const asOne = price(image, palette, "p3-fields")
	const asOther = price(image, palette, "p2-tree")
	assert.notEqual(asOne.slug, asOther.slug)
	assert.equal(asOne.schema.bits, asOther.schema.bits)
	assert.equal(asOne.residualBits, asOther.residualBits)
	assert.equal(asOne.totalBits, asOther.totalBits)
	assert.equal(asOne.field.angleRadians, asOther.field.angleRadians)
})

test("currency: pricing is deterministic — two runs give identical bits", () => {
	const image = makeImage((x) => (x < FIXTURE_SIDE / 2 ? NAVY : CREAM))
	const palette = makePalette({
		background: NAVY,
		surface: CREAM,
		foreground: RUST,
		accent: MOSS,
		gradientStops: [
			{ rgb: NAVY, position: 0 },
			{ rgb: CREAM, position: 1 },
		],
	})
	const first = price(image, palette)
	const second = price(image, palette)
	assert.equal(first.totalBits, second.totalBits)
	assert.equal(first.field.angleRadians, second.field.angleRadians)
	assert.equal(
		Buffer.compare(
			Buffer.from(first.perCellResidualBits.buffer.slice(0)),
			Buffer.from(second.perCellResidualBits.buffer.slice(0)),
		),
		0,
		"the per-cell series the bootstrap resamples must be byte-identical between runs",
	)
})

test("currency: the OKLab the currency prices against is the contract's own", () => {
	// A second OKLab conversion agreeing to some tolerance would be a fork of the one ruler, so the
	// fixture's `lab` and the contract's `okLabFromColor` must agree exactly, not approximately.
	const image = makeImage(() => NAVY)
	const fromContract = okLabFromColor(colorFromRgb([image.rgb[0]!, image.rgb[1]!, image.rgb[2]!]))
	for (let channel = 0; channel < OKLAB_DIMENSIONS; channel += 1) {
		assert.equal(image.lab[channel], fromContract[channel])
	}
})
