/**
 * # Tests for the selector — arm-c′ §2.3's four mechanisms, and the refusal.
 *
 * The mechanisms are tested where they can fail silently:
 *
 *  - **(b) immateriality** is the gate on everything else, so it is checked in both directions —
 *    identical palettes are immaterial, a single role past the bar is not — against the contract's
 *    own `compareRole`, the ruler M1's disagreement matrix used.
 *  - **(c) the block bootstrap** is checked for the two things a resampler can quietly get wrong:
 *    it must be *deterministic* (the seed is the cover's content hash, so the same cover resamples
 *    the same way on any machine), and it must *stop by measurement* — a decisive difference has to
 *    separate from ½ far below the compute cap, or the cap has silently become the rule.
 *  - **(d) the tie-break** is checked at the exact tie, which is the only place it applies.
 *  - **the σ floor (SPEC §3.1)** — an image whose *measured* σ is exactly zero used to be refused.
 *    It is now priced at the scale the 8-bit encoding itself injects, and the tests below pin the
 *    conversion in both directions: the fixture still measures zero, and it now prices, at exactly
 *    `σ_quant` and not at some other number.
 *  - **the refusal, which survives as a guard** — a `Selection` that *is* unpriceable must not carry
 *    a ranking. That path exists because the first run of this milestone ranked `NaN`s on four real
 *    covers and reported the result as stable; a test that only covered the happy path would have
 *    passed then too. It is no longer reachable through `buildSubstrate` (σ_quant is positive on any
 *    image), so it is now driven directly, which is stated rather than quietly dropped.
 *
 * Run:
 * NODE_NO_WARNINGS=1 node --experimental-strip-types --test \
 *   research/v3/prototypes/p4-portfolio/tests/select.test.ts
 */

import assert from "node:assert/strict"
import test from "node:test"

import { CONTRACT_VERSION, colorFromRgb } from "../../../src/contract/index.ts"
import type { Palette, Rgb8 } from "../../../src/contract/types.ts"
import {
	BOOTSTRAP_RESAMPLE_CAP,
	LATTICE_RESOLUTION_C,
	OKLAB_DIMENSIONS,
	assessMateriality,
	blockBootstrap,
	decidedBySchemaPrice,
	measureCorrelationLength,
	rankMembers,
	rankingOf,
	seedFromContentHash,
	selectOnCover,
} from "../selector/index.ts"
import type { DecodedImage, MemberPrice } from "../selector/types.ts"

/** [STRUCTURAL] The fixture frame's side, in pixels. */
const FIXTURE_SIDE = 64
/** [STRUCTURAL] A fixed, arbitrary content hash for the fixtures. 64 hex digits, as sha-256 is. */
const FIXTURE_HASH = "a".repeat(64)

const NAVY: Rgb8 = [20, 30, 90]
const CREAM: Rgb8 = [240, 235, 220]
const RUST: Rgb8 = [180, 70, 30]
const MOSS: Rgb8 = [70, 110, 60]

function makePalette(background: Rgb8, surface: Rgb8, foreground: Rgb8, accent: Rgb8): Palette {
	return {
		contractVersion: CONTRACT_VERSION,
		roles: {
			background: colorFromRgb(background),
			surface: colorFromRgb(surface),
			foreground: colorFromRgb(foreground),
			accent: colorFromRgb(accent),
		},
		gradient: null,
		collapse: { surfaceCollapsed: false, accentCollapsed: false },
		contrast: {
			minTextContrast: { requestedLc: 0, effectiveRawMagnitude: 0 },
			minAccentContrast: { requestedLc: 0, effectiveRawMagnitude: 0 },
		},
		metadata: {
			algorithmVersion: "test",
			preprocessingVersion: "test",
			inputContentHash: FIXTURE_HASH,
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

/** An exactly flat synthetic image — no dither, so its measured σ is exactly zero. */
function flatImage(): DecodedImage {
	const pixels = FIXTURE_SIDE * FIXTURE_SIDE
	const rgb = new Uint8Array(pixels * OKLAB_DIMENSIONS)
	const lab = new Float64Array(pixels * OKLAB_DIMENSIONS)
	for (let pixel = 0; pixel < pixels; pixel += 1) {
		const base = pixel * OKLAB_DIMENSIONS
		for (let channel = 0; channel < OKLAB_DIMENSIONS; channel += 1) rgb[base + channel] = NAVY[channel]!
	}
	return {
		path: "synthetic-flat",
		width: FIXTURE_SIDE,
		height: FIXTURE_SIDE,
		rgb,
		lab,
		contentHash: FIXTURE_HASH,
		format: "synthetic",
	}
}

function fakePrice(slug: string, totalBits: number, schemaBits: number): MemberPrice {
	return {
		slug,
		schema: { bits: schemaBits, publishedColors: 0, colorBits: schemaBits, discreteBits: 0, items: [] },
		field: { kind: "flat", angleRadians: null, coarseAngles: null },
		explainedPixelFraction: 0,
		residualBits: totalBits - schemaBits,
		totalBits,
		perCellResidualBits: new Float64Array(0),
	}
}

// ---------------------------------------------------------------------------------------------
// (b) Immateriality
// ---------------------------------------------------------------------------------------------

test("selector: identical palettes are immaterial, and every pair reports no differing role", () => {
	const palette = makePalette(NAVY, CREAM, RUST, MOSS)
	const report = assessMateriality([
		{ slug: "a", palette },
		{ slug: "b", palette },
		{ slug: "c", palette },
	])
	assert.equal(report.material, false)
	assert.equal(report.pairs.length, 3, "all unordered pairs, not just consecutive ones")
	for (const pair of report.pairs) assert.deepEqual(pair.differingRoles, [])
})

test("selector: one role past the contract's bar makes the selection material", () => {
	const base = makePalette(NAVY, CREAM, RUST, MOSS)
	const moved = makePalette(NAVY, CREAM, RUST, CREAM)
	const report = assessMateriality([
		{ slug: "a", palette: base },
		{ slug: "b", palette: moved },
	])
	assert.equal(report.material, true)
	assert.deepEqual(report.pairs[0]!.differingRoles, ["accent"], "only the role that moved")
})

test("selector: materiality is decided on the palettes alone, before σ is consulted at all", () => {
	const image = flatImage()
	const { selection } = selectOnCover(
		image,
		[
			{ slug: "a", palette: makePalette(NAVY, CREAM, RUST, MOSS) },
			{ slug: "b", palette: makePalette(CREAM, NAVY, RUST, MOSS) },
		],
		LATTICE_RESOLUTION_C,
	)
	assert.equal(selection.materiality.material, true, "the disagreement is knowable without a scale")
	assert.equal(selection.materiality.pairs.length, 1)
})

// ---------------------------------------------------------------------------------------------
// SPEC §3.1 — the floor, and the refusal it converted
// ---------------------------------------------------------------------------------------------

test("selector: a σ_measured = 0 cover now prices at the encoding's own scale (SPEC §3.1)", () => {
	const image = flatImage()
	const members = [
		{ slug: "a", palette: makePalette(NAVY, CREAM, RUST, MOSS) },
		{ slug: "b", palette: makePalette(CREAM, NAVY, RUST, MOSS) },
	]
	const { selection, substrate } = selectOnCover(image, members, LATTICE_RESOLUTION_C)

	// The estimator is unchanged and still measures zero on this fixture — if it stopped doing that,
	// this test would be exercising something else and should say so.
	assert.equal(substrate.sigmaMeasured, 0, "the fixture no longer exercises the degenerate case")

	// And the floor is exactly σ_quant. Not "positive", not "small": the max of {0, q} is q.
	assert.equal(substrate.sigma, substrate.sigmaQuantization)
	assert.ok(substrate.sigma > 0, "the floor did not produce a scale")
	assert.equal(substrate.sigmaFlooredByQuantization, true)

	assert.equal(selection.unpriceable, null, "the M2 refusal is converted, not merely softened")
	assert.equal(selection.prices.length, 2, "both members are priced")
	assert.notEqual(selection.winner, null)
	assert.ok(Number.isFinite(selection.marginBits!), "the margin is a number, not NaN")
	assert.notEqual(selection.bootstrap, null, "and a material cover pays for its bootstrap")
	assert.equal(selection.sigma, substrate.sigma, "σ is reported as priced")
	assert.equal(selection.sigmaMeasured, 0, "and unfloored, so the conversion stays visible")
})

test("selector: an unpriceable selection still has no ranking, so a sweep cannot count it as agreement", () => {
	// The guard is no longer reachable through `buildSubstrate` — σ_quant is positive on every image —
	// so it is driven directly. Deleting the guard because nothing reaches it today is how the NaN
	// ranking got back in the first time.
	const unpriceable = {
		contentHash: FIXTURE_HASH,
		imagePath: "synthetic",
		sigma: 0,
		sigmaMeasured: 0,
		sigmaQuantization: 0,
		sigmaFlooredByQuantization: false,
		unpriceable: { reason: "no positive scale", sigma: 0 },
		prices: [],
		materiality: { material: true, pairs: [] },
		winner: null,
		runnerUp: null,
		marginBits: null,
		tieBrokenBySchemaPrice: false,
		bootstrap: null,
	} as const
	assert.equal(rankingOf(unpriceable), null)
})

// ---------------------------------------------------------------------------------------------
// (a) + (d) Ranking and the tie-break
// ---------------------------------------------------------------------------------------------

test("selector: the cheapest total wins", () => {
	const ranked = rankMembers([fakePrice("a", 300, 50), fakePrice("b", 100, 90), fakePrice("c", 200, 10)])
	assert.deepEqual(ranked.map((price) => price.slug), ["b", "c", "a"])
	assert.equal(decidedBySchemaPrice(ranked), false)
})

test("selector: an exact tie on totals goes to the cheaper L(palette) — fewer published distinctions", () => {
	const ranked = rankMembers([fakePrice("verbose", 100, 90), fakePrice("spare", 100, 40)])
	assert.deepEqual(ranked.map((price) => price.slug), ["spare", "verbose"])
	assert.equal(decidedBySchemaPrice(ranked), true, "the tie-break must be recorded, not silent")
})

test("selector: a tie on both is broken lexicographically, which is determinism not judgement", () => {
	const ranked = rankMembers([fakePrice("zeta", 100, 40), fakePrice("alpha", 100, 40)])
	assert.deepEqual(ranked.map((price) => price.slug), ["alpha", "zeta"])
	// Ordering the input the other way must not change the answer.
	const reversed = rankMembers([fakePrice("alpha", 100, 40), fakePrice("zeta", 100, 40)])
	assert.deepEqual(reversed.map((price) => price.slug), ["alpha", "zeta"])
})

// ---------------------------------------------------------------------------------------------
// (c) The measured margin
// ---------------------------------------------------------------------------------------------

test("selector: the correlation length of white noise is short, and of a constant field is long", () => {
	const cells = LATTICE_RESOLUTION_C * LATTICE_RESOLUTION_C
	const random = (() => {
		let state = 1
		return () => {
			state = (state * 1103515245 + 12345) % 2147483648
			return state / 2147483648
		}
	})()
	const noise = new Float64Array(cells)
	for (let cell = 0; cell < cells; cell += 1) noise[cell] = random() - 1 / 2
	assert.equal(measureCorrelationLength(noise, LATTICE_RESOLUTION_C), 1, "white noise decorrelates at lag 1")

	// A single low-frequency ramp across the lattice stays correlated to the frame's own scale.
	const smooth = new Float64Array(cells)
	for (let row = 0; row < LATTICE_RESOLUTION_C; row += 1) {
		for (let column = 0; column < LATTICE_RESOLUTION_C; column += 1) {
			smooth[row * LATTICE_RESOLUTION_C + column] = column / LATTICE_RESOLUTION_C
		}
	}
	assert.ok(
		measureCorrelationLength(smooth, LATTICE_RESOLUTION_C) > 1,
		"a smooth field must not be resampled in one-cell blocks",
	)
})

test("selector: a decisive difference separates from ½ far below the compute cap", () => {
	// Every cell favours the winner, so the bootstrap should not need to buy many resamples. If this
	// ever runs to the cap, the cap has stopped being a compute bound and become the rule.
	const cells = LATTICE_RESOLUTION_C * LATTICE_RESOLUTION_C
	const difference = new Float64Array(cells).fill(-1)
	const report = blockBootstrap(difference, 0, LATTICE_RESOLUTION_C, FIXTURE_HASH)
	assert.equal(report.separatedFromHalf, true)
	assert.equal(report.capped, false)
	assert.equal(report.winFraction, 1)
	assert.ok(report.resamples < BOOTSTRAP_RESAMPLE_CAP / 2, `took ${report.resamples} resamples`)
	assert.ok(report.intervalLow > 1 / 2, "the interval must exclude one half, not merely straddle it")
})

test("selector: the bootstrap is deterministic in the cover's content hash", () => {
	const cells = LATTICE_RESOLUTION_C * LATTICE_RESOLUTION_C
	const difference = new Float64Array(cells)
	for (let cell = 0; cell < cells; cell += 1) difference[cell] = ((cell * 7) % 11) - 5
	const first = blockBootstrap(difference, 0, LATTICE_RESOLUTION_C, FIXTURE_HASH)
	const second = blockBootstrap(difference, 0, LATTICE_RESOLUTION_C, FIXTURE_HASH)
	assert.deepEqual(first, second)

	const otherCover = blockBootstrap(difference, 0, LATTICE_RESOLUTION_C, "b".repeat(64))
	assert.notEqual(seedFromContentHash(FIXTURE_HASH), seedFromContentHash("b".repeat(64)))
	assert.equal(typeof otherCover.winFraction, "number")
})

test("selector: an exactly tied pair is not scored as a decisive loss", () => {
	// The regression that this test exists for. A difference that is zero in every cell, with equal
	// schema prices, is arm-c′ §2.3d's exact tie — the case the tie-break was written for. Scoring
	// those resamples as losses (`0 < 0` is false) made the report claim a win fraction of 0.000 with
	// a Wilson interval excluding ½: the table would have announced the runner-up as the decisive
	// winner of a decision the tie-break had just made the other way, on 4096 resamples of nothing.
	const difference = new Float64Array(LATTICE_RESOLUTION_C * LATTICE_RESOLUTION_C)
	const report = blockBootstrap(difference, 0, LATTICE_RESOLUTION_C, FIXTURE_HASH)
	assert.equal(report.draws, BOOTSTRAP_RESAMPLE_CAP, "it pays the cap, having nothing to separate")
	assert.equal(report.ties, BOOTSTRAP_RESAMPLE_CAP, "every draw is a tie")
	assert.equal(report.resamples, 0, "and none of them is informative")
	assert.equal(report.wins, 0)
	assert.equal(report.winFraction, 1 / 2, "the point of indifference, which is what was measured")
	assert.equal(report.separatedFromHalf, false, "nothing was separated")
	assert.equal(report.capped, true)
})

test("selector: an indecisive but non-tied difference runs to the cap and publishes its fraction", () => {
	// The F1 failure shape: real, non-zero, but symmetric evidence. The report must publish the
	// fraction and admit the cap rather than manufacturing a decision.
	const cells = LATTICE_RESOLUTION_C * LATTICE_RESOLUTION_C
	const difference = new Float64Array(cells)
	for (let cell = 0; cell < cells; cell += 1) difference[cell] = cell % 2 === 0 ? 1 : -1
	const report = blockBootstrap(difference, 0, LATTICE_RESOLUTION_C, FIXTURE_HASH)
	assert.equal(report.capped, report.separatedFromHalf === false)
	assert.ok(report.draws <= BOOTSTRAP_RESAMPLE_CAP)
	assert.ok(report.winFraction >= 0 && report.winFraction <= 1)
})

test("selector: the schema delta rides along and can flip a resample", () => {
	// `L(palette)` is fixed under resampling, so it enters as a constant offset. A residual difference
	// that favours the winner by a hair must still lose when its palette is dearer by more.
	const cells = LATTICE_RESOLUTION_C * LATTICE_RESOLUTION_C
	const difference = new Float64Array(cells).fill(-1 / cells)
	const withoutSchema = blockBootstrap(difference, 0, LATTICE_RESOLUTION_C, FIXTURE_HASH)
	const withSchema = blockBootstrap(difference, 10, LATTICE_RESOLUTION_C, FIXTURE_HASH)
	assert.equal(withoutSchema.winFraction, 1)
	assert.equal(withSchema.winFraction, 0)
})
