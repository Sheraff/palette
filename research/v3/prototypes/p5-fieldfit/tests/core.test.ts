/**
 * P5 field-fit — W-CORE self-tests (SPEC "Verification obligations").
 *
 * Two obligations are discharged here, plus the decoder's refusal:
 *
 *  - **inventory counts and moments exact on a constructed 4×4 image** — every count, every `Σx`,
 *    every `Σy` is asserted with `strictEqual`, not a tolerance. The constructed coordinates are
 *    dyadic (±0.25, ±0.75), so their sums are exact in binary floating point and an approximate
 *    assertion would only hide an error.
 *  - **snap picks mass over proximity** — on an image built so that the nearest triple to the target
 *    is *not* the answer. The test asserts both halves: that the loser really is nearer, and that
 *    the winner really has more bar-neighbourhood mass. Without the first half the test would pass
 *    for a nearest-neighbour implementation.
 *  - **transparency refusal fires** — one alpha-0 pixel is enough, and a uniformly opaque alpha
 *    channel is not transparency.
 *
 * Run: NODE_NO_WARNINGS=1 node --experimental-strip-types --test prototypes/p5-fieldfit/tests/core.test.ts
 */

import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test, { after, before } from "node:test"

import sharp from "sharp"

import { okLabDistance, rgbToOkLab } from "../../../src/contract/color.ts"
import type { Rgb8 } from "../../../src/contract/types.ts"
import {
	decodeAndInventory,
	FieldFitDecodeError,
	normalizedX,
	normalizedY,
	packRgb,
	unpackRgb,
} from "../src/decode.ts"
import { barNeighbourhoodMass, snapToArtwork } from "../src/snap.ts"

let workDirectory = ""

before(async () => {
	workDirectory = await mkdtemp(join(tmpdir(), "p5-fieldfit-core-"))
})

after(async () => {
	if (workDirectory) await rm(workDirectory, { recursive: true, force: true })
})

/** Write a raw pixel buffer out as a PNG so the test exercises the real decode path. */
async function writePng(
	name: string,
	width: number,
	height: number,
	channels: 3 | 4,
	pixels: number[],
): Promise<string> {
	const path = join(workDirectory, name)
	await sharp(Buffer.from(pixels), { raw: { width, height, channels } })
		.png({ compressionLevel: 0 })
		.toFile(path)
	return path
}

// ---------------------------------------------------------------------------------------------
// Inventory: counts and moments exact on a constructed 4×4 image
// ---------------------------------------------------------------------------------------------

const RED: Rgb8 = [255, 0, 0]
const BLUE: Rgb8 = [0, 0, 255]
const GREEN: Rgb8 = [0, 255, 0]

/**
 * The 4×4 layout, chosen so the three colours have different counts and non-trivial, unequal
 * first moments in both axes:
 *
 * ```
 *  R R B B      columns 0–1: red, all four rows            → 8 px
 *  R R B B      columns 2–3, rows 0–2: blue                → 6 px
 *  R R B B      columns 2–3, row 3: green                  → 2 px
 *  R R G G
 * ```
 */
function fourByFourPixels(): number[] {
	const pixels: number[] = []
	for (let row = 0; row < 4; row += 1) {
		for (let column = 0; column < 4; column += 1) {
			const rgb = column < 2 ? RED : row < 3 ? BLUE : GREEN
			pixels.push(rgb[0], rgb[1], rgb[2])
		}
	}
	return pixels
}

test("normalized coordinates map pixel centres symmetrically into (-1, 1)", () => {
	assert.deepEqual([0, 1, 2, 3].map((c) => normalizedX(c, 4)), [-0.75, -0.25, 0.25, 0.75])
	assert.deepEqual([0, 1, 2, 3].map((r) => normalizedY(r, 4)), [-0.75, -0.25, 0.25, 0.75])
	// Defined for a 1-pixel axis, which the endpoint convention is not.
	assert.equal(normalizedX(0, 1), 0)
})

test("packRgb / unpackRgb round-trip", () => {
	for (const rgb of [RED, BLUE, GREEN, [0, 0, 0] as Rgb8, [255, 255, 255] as Rgb8]) {
		assert.deepEqual(unpackRgb(packRgb(rgb)), rgb)
	}
	assert.equal(packRgb([1, 2, 3]), 0x010203)
})

test("inventory counts and moments are exact on a constructed 4x4 image", async () => {
	const path = await writePng("four-by-four.png", 4, 4, 3, fourByFourPixels())
	const { raster, inventory } = await decodeAndInventory(path)

	assert.equal(raster.width, 4)
	assert.equal(raster.height, 4)
	assert.equal(raster.format, "png")
	assert.equal(raster.packed.length, 16)
	assert.equal(raster.lab.length, 48)
	assert.equal(inventory.totalPixels, 16)
	assert.equal(inventory.triples.size, 3)

	const red = inventory.triples.get(packRgb(RED))
	const blue = inventory.triples.get(packRgb(BLUE))
	const green = inventory.triples.get(packRgb(GREEN))
	assert.ok(red && blue && green)

	// Counts.
	assert.equal(red.count, 8)
	assert.equal(blue.count, 6)
	assert.equal(green.count, 2)
	assert.equal(red.count + blue.count + green.count, inventory.totalPixels)

	// First moments, exact. Red: 4·(−0.75) + 4·(−0.25) = −4; y sums to 0 by symmetry.
	assert.equal(red.sumX, -4)
	assert.equal(red.sumY, 0)
	// Blue: 3·0.25 + 3·0.75 = 3; y = 2·(−0.75 − 0.25 + 0.25) = −1.5.
	assert.equal(blue.sumX, 3)
	assert.equal(blue.sumY, -1.5)
	// Green: 0.25 + 0.75 = 1; y = 2·0.75 = 1.5.
	assert.equal(green.sumX, 1)
	assert.equal(green.sumY, 1.5)
	// The whole image is centred, so the moments must cancel exactly.
	assert.equal(red.sumX + blue.sumX + green.sumX, 0)
	assert.equal(red.sumY + blue.sumY + green.sumY, 0)

	// Per-triple OKLab is the contract's conversion of the exact triple, converted once.
	assert.deepEqual(red.lab, rgbToOkLab(RED))
	assert.deepEqual(blue.lab, rgbToOkLab(BLUE))
	assert.deepEqual(green.lab, rgbToOkLab(GREEN))
	assert.deepEqual(red.rgb, RED)

	// Presence test.
	assert.equal(inventory.has(packRgb(RED)), true)
	assert.equal(inventory.has(packRgb([255, 255, 255])), false)

	// The raster agrees with the layout, pixel by pixel, in both representations.
	for (let row = 0; row < 4; row += 1) {
		for (let column = 0; column < 4; column += 1) {
			const expected = column < 2 ? RED : row < 3 ? BLUE : GREEN
			const pixel = row * 4 + column
			assert.equal(raster.packed[pixel], packRgb(expected))
			const lab = rgbToOkLab(expected)
			for (let channel = 0; channel < 3; channel += 1) {
				assert.equal(raster.lab[pixel * 3 + channel], Math.fround(lab[channel]))
			}
		}
	}
})

// ---------------------------------------------------------------------------------------------
// Transparency refusal
// ---------------------------------------------------------------------------------------------

test("a single transparent pixel is refused loudly", async () => {
	const pixels = [
		255, 0, 0, 255,
		0, 255, 0, 255,
		0, 0, 255, 255,
		9, 9, 9, 0,
	]
	const path = await writePng("one-transparent.png", 2, 2, 4, pixels)
	await assert.rejects(
		() => decodeAndInventory(path),
		(error: unknown) => {
			assert.ok(error instanceof FieldFitDecodeError)
			assert.equal(error.name, "FieldFitDecodeError")
			assert.match(error.message, /transparent/)
			return true
		},
	)
})

test("a uniformly opaque alpha channel is not transparency", async () => {
	const pixels = [
		255, 0, 0, 255,
		0, 255, 0, 255,
		0, 0, 255, 255,
		9, 9, 9, 255,
	]
	const path = await writePng("opaque-alpha.png", 2, 2, 4, pixels)
	const { inventory } = await decodeAndInventory(path)
	assert.equal(inventory.totalPixels, 4)
	assert.equal(inventory.triples.size, 4)
})

// ---------------------------------------------------------------------------------------------
// Snap: mass over proximity
// ---------------------------------------------------------------------------------------------

/**
 * A neutral ramp built so that proximity and mass disagree.
 *
 * - `LONE` (grey 140, L ≈ 0.6401) occupies 100 pixels and has **no** neighbour within the ball, so
 *   its bar-neighbourhood mass is its own 100.
 * - `CLUSTER` (greys 128/129/130, L ≈ 0.5999/0.6032/0.6066) occupies 50 pixels each. The three are
 *   mutually within the ball, so each carries a neighbourhood mass of 150.
 * - The gap from `LONE` to the nearest cluster member is 0.0335, wider than the ball, so the two
 *   neighbourhoods do not leak into each other.
 *
 * `SNAP_TEST_RADIUS` is **[UNCALIBRATED] — a test fixture, not a perceptual claim.** It is chosen
 * only to satisfy the three geometric conditions above (wider than the cluster's 0.0067 spread,
 * narrower than the 0.0335 gap, and wide enough that a target sitting between the two can reach
 * both); the test asserts all three rather than assuming them. Production callers pass
 * `POOLED_SAME_COLOR_BAR`.
 */
const SNAP_TEST_RADIUS = 0.025

const LONE: Rgb8 = [140, 140, 140]
const CLUSTER: readonly Rgb8[] = [[128, 128, 128], [129, 129, 129], [130, 130, 130]]

/**
 * The target's lightness, placed so `LONE` is the **nearest** triple to it while every cluster
 * member is still inside the ball. `[UNCALIBRATED] — a test fixture`: it sits just above the
 * midpoint of `LONE` and grey 130 (0.62335) and below grey 128 + radius (0.62487).
 */
const SNAP_TEST_TARGET_LIGHTNESS = 0.624

async function loneVersusClusterImage(): Promise<string> {
	// 25 × 10 = 250 pixels: 100 lone + 3 × 50 cluster, laid out row-major.
	const pixels: number[] = []
	const push = (rgb: Rgb8, times: number) => {
		for (let index = 0; index < times; index += 1) pixels.push(rgb[0], rgb[1], rgb[2])
	}
	push(LONE, 100)
	push(CLUSTER[0], 50)
	push(CLUSTER[1], 50)
	push(CLUSTER[2], 50)
	return writePng("lone-versus-cluster.png", 25, 10, 3, pixels)
}

test("snap picks mass over proximity", async () => {
	const path = await loneVersusClusterImage()
	const { inventory } = await decodeAndInventory(path)
	assert.equal(inventory.totalPixels, 250)
	assert.equal(inventory.triples.size, 4)

	const target = [SNAP_TEST_TARGET_LIGHTNESS, 0, 0] as const
	const loneLab = rgbToOkLab(LONE)
	const clusterLabs = CLUSTER.map((rgb) => rgbToOkLab(rgb))

	// Premise 1: every one of the four triples is inside the ball around the target...
	const loneDistance = okLabDistance(target, loneLab)
	assert.ok(loneDistance < SNAP_TEST_RADIUS, `lone distance ${loneDistance}`)
	for (const lab of clusterLabs) {
		assert.ok(okLabDistance(target, lab) < SNAP_TEST_RADIUS)
	}
	// ...and `LONE` is the nearest of them. Without this the test would pass for a
	// nearest-neighbour snap, which is exactly what SPEC decision 4 forbids.
	for (const lab of clusterLabs) {
		assert.ok(loneDistance < okLabDistance(target, lab))
	}

	// Premise 2: the neighbourhoods are separated, so the mass figures are the constructed ones.
	assert.ok(okLabDistance(loneLab, clusterLabs[2]) > SNAP_TEST_RADIUS)
	assert.equal(barNeighbourhoodMass(loneLab, inventory, SNAP_TEST_RADIUS), 100)
	for (const lab of clusterLabs) {
		assert.equal(barNeighbourhoodMass(lab, inventory, SNAP_TEST_RADIUS), 150)
	}

	// The decision: 150 beats 100, so the cluster wins despite `LONE` being nearer; among the three
	// tied cluster members the OKLab tie-break takes the one nearest the target, grey 130.
	const snapped = snapToArtwork(target, inventory, SNAP_TEST_RADIUS)
	assert.deepEqual(snapped.rgb, [130, 130, 130])
	assert.equal(snapped.offArtwork, false)
	assert.equal(snapped.distance, okLabDistance(target, rgbToOkLab([130, 130, 130])))
	assert.deepEqual(snapped.lab, rgbToOkLab([130, 130, 130]))
})

test("snap ties on equal mass and equal distance break on the packed integer", async () => {
	// Two colours equidistant from the target in OKLab and equal in mass: mirrored ±a offsets from
	// a neutral, each with the same pixel count and no other triple within the ball.
	const lowPacked: Rgb8 = [120, 130, 130]
	const highPacked: Rgb8 = [140, 130, 130]
	const far: Rgb8 = [255, 255, 0]
	const pixels: number[] = []
	const push = (rgb: Rgb8, times: number) => {
		for (let index = 0; index < times; index += 1) pixels.push(rgb[0], rgb[1], rgb[2])
	}
	push(lowPacked, 30)
	push(highPacked, 30)
	push(far, 40)
	const path = await writePng("packed-tie.png", 10, 10, 3, pixels)
	const { inventory } = await decodeAndInventory(path)

	const a = rgbToOkLab(lowPacked)
	const b = rgbToOkLab(highPacked)
	// The exact midpoint: equal distance to both by construction.
	const target = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] as const
	const half = okLabDistance(target, a)
	assert.equal(half, okLabDistance(target, b))

	const radius = half * 1.5
	assert.equal(barNeighbourhoodMass(a, inventory, radius), 30)
	assert.equal(barNeighbourhoodMass(b, inventory, radius), 30)

	const snapped = snapToArtwork(target, inventory, radius)
	assert.deepEqual(snapped.rgb, lowPacked)
	assert.ok(packRgb(lowPacked) < packRgb(highPacked))
})

test("an empty ball falls back to the nearest triple and says offArtwork", async () => {
	const path = await writePng("dark-only.png", 2, 2, 3, [
		0, 0, 0,
		4, 4, 4,
		8, 8, 8,
		12, 12, 12,
	])
	const { inventory } = await decodeAndInventory(path)

	// White is nowhere near any of the four near-black triples.
	const target = rgbToOkLab([255, 255, 255])
	const snapped = snapToArtwork(target, inventory, 0.01535)
	assert.equal(snapped.offArtwork, true)
	assert.deepEqual(snapped.rgb, [12, 12, 12])
	assert.equal(snapped.distance, okLabDistance(target, rgbToOkLab([12, 12, 12])))

	// A radius of zero makes the ball empty by definition, even on an exact hit.
	const exact = snapToArtwork(rgbToOkLab([8, 8, 8]), inventory, 0)
	assert.equal(exact.offArtwork, true)
	assert.deepEqual(exact.rgb, [8, 8, 8])
	assert.equal(exact.distance, 0)
})

test("snap over a large synthetic inventory stays fast and deterministic", async () => {
	// 256 × 256 with a dithered horizontal grey ramp: ~10^4 distinct triples, the regime the hash
	// grid exists for. Two identical calls must agree exactly.
	const width = 256
	const height = 256
	const pixels: number[] = []
	for (let row = 0; row < height; row += 1) {
		for (let column = 0; column < width; column += 1) {
			const base = column
			const dither = (row * 7 + column * 13) % 3
			const red = Math.min(255, base + dither)
			const green = Math.min(255, base + ((row + column) % 2))
			const blue = Math.min(255, base + (row % 3))
			pixels.push(red, green, blue)
		}
	}
	const path = await writePng("dither-ramp.png", width, height, 3, pixels)
	const { inventory } = await decodeAndInventory(path)
	assert.equal(inventory.totalPixels, width * height)
	assert.ok(inventory.triples.size > 1000, `distinct triples ${inventory.triples.size}`)

	const target = rgbToOkLab([128, 128, 128])
	const started = process.hrtime.bigint()
	const first = snapToArtwork(target, inventory, 0.01535)
	const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6
	const second = snapToArtwork(target, inventory, 0.01535)

	assert.deepEqual(first.rgb, second.rgb)
	assert.equal(first.offArtwork, false)
	assert.ok(inventory.has(packRgb(first.rgb)))
	assert.ok(elapsedMs < 5000, `first snap took ${elapsedMs} ms`)
})

// ---------------------------------------------------------------------------------------------
// v0.9.1: the one-pass snap is an **exact-value** optimization, checked against the path it replaced
// ---------------------------------------------------------------------------------------------
//
// `snapToArtwork` no longer calls `barNeighbourhoodMass` per candidate: it collects one pool of every
// triple within `2 × ballRadius` of the target and scans it linearly, and it decides the membership
// test by squared distance wherever `Math.hypot` cannot disagree (`src/snap.ts`, the one-pass block).
// That bought 5.0 s → 1.8 s on a 3000² mark read, and it is only allowed to exist if it changes no
// answer — so the two tests below are the licence, not a smoke check.
//
// The oracle is a **literal transcription of the pre-v0.9.1 loop**, written out here rather than
// imported, so the fast path is checked against the old algorithm rather than against itself.

/** The v0.9.0 snap decision, transcribed: gather the ball, score each candidate by its own mass. */
function referenceSnap(
	inventory: Awaited<ReturnType<typeof decodeAndInventory>>["inventory"],
	target: readonly [number, number, number],
	ballRadius: number,
): { rgb: Rgb8; mass: number; distance: number } | null {
	let best: { rgb: Rgb8; mass: number; distance: number; packed: number } | null = null
	for (const stats of inventory.triples.values()) {
		const distance = okLabDistance(target, stats.lab)
		if (!(distance < ballRadius)) continue
		const mass = barNeighbourhoodMass(stats.lab, inventory, ballRadius)
		const better = best === null ||
			mass > best.mass ||
			(mass === best.mass &&
				(distance < best.distance ||
					(distance === best.distance && stats.packed < best.packed)))
		if (better) best = { rgb: stats.rgb, mass, distance, packed: stats.packed }
	}
	return best === null ? null : { rgb: best.rgb, mass: best.mass, distance: best.distance }
}

test("the one-pass snap agrees with the transcribed v0.9.0 loop, target by target", async () => {
	// A dithered two-lobe field: thousands of distinct triples, dense enough that a candidate's
	// neighbourhood genuinely overlaps its neighbours' — the regime where a pooled scan and 27
	// independent grid queries could differ if either were wrong.
	const width = 200
	const height = 200
	const pixels: number[] = []
	for (let row = 0; row < height; row += 1) {
		for (let column = 0; column < width; column += 1) {
			const lobe = column < width / 2 ? 90 : 150
			const jitter = (row * 31 + column * 17) % 11
			pixels.push(
				Math.min(255, lobe + jitter),
				Math.min(255, lobe + ((row * 13 + column * 7) % 9)),
				Math.min(255, lobe + ((row * 5 + column * 23) % 13)),
			)
		}
	}
	const path = await writePng("one-pass-agreement.png", width, height, 3, pixels)
	const { inventory } = await decodeAndInventory(path)
	assert.ok(inventory.triples.size > 500, `distinct triples ${inventory.triples.size}`)

	// Targets taken from the artwork's own colours and then pushed off them by a fraction of the
	// radius, at three radii. Off-triple targets are the real case (a field end is a continuous value
	// that belongs to no pixel), and pushing by a *fraction* of the radius is what lands the ball
	// boundary between triples, which is where a sloppy prefilter would show.
	const sample = [...inventory.triples.values()]
		.sort((first, second) => first.packed - second.packed)
		.filter((_stats, index) => index % 97 === 0)
	assert.ok(sample.length >= 6, `sampled ${sample.length} targets`)

	let checked = 0
	for (const radius of [0.005, 0.01535, 0.04]) {
		for (const stats of sample) {
			for (const push of [0, 0.31, 0.73, 1.4]) {
				const target = [
					stats.lab[0] + push * radius * 0.6,
					stats.lab[1] - push * radius * 0.5,
					stats.lab[2] + push * radius * 0.4,
				] as const
				const expected = referenceSnap(inventory, target, radius)
				const actual = snapToArtwork(target, inventory, radius)
				const where = `#${stats.packed.toString(16)} +${push} r ${radius}`
				if (expected === null) {
					assert.equal(actual.offArtwork, true, `${where}: ball should be empty`)
					continue
				}
				checked += 1
				assert.equal(actual.offArtwork, false, where)
				assert.deepEqual(actual.rgb, expected.rgb, where)
				// The published distance is the tie-break's own quantity, so it is pinned exactly and
				// not approximately: any drift here is drift in a comparison that decides palettes.
				assert.equal(actual.distance, expected.distance, `${where}: distance`)
			}
		}
	}
	assert.ok(checked > 40, `only ${checked} non-empty balls were exercised`)
})

test("the squared-distance prefilter never disagrees with Math.hypot on the ball boundary", async () => {
	// The prefilter's whole risk is a pair whose distance sits *on* the radius. This fixture puts one
	// there on purpose: the radius is set to the exact `Math.hypot` distance of a real pair, so the
	// strict `<` must exclude it, and to one ulp either side of that, where it must flip.
	const path = await writePng("boundary.png", 3, 2, 3, [
		100, 100, 100, 104, 100, 100, 108, 100, 100,
		100, 104, 100, 100, 108, 100, 200, 200, 200,
	])
	const { inventory } = await decodeAndInventory(path)
	const anchor = rgbToOkLab([100, 100, 100])

	for (const other of [[104, 100, 100], [108, 100, 100], [100, 104, 100]] as const) {
		const exact = okLabDistance(anchor, rgbToOkLab(other as unknown as Rgb8))
		for (const radius of [exact, nextAfter(exact, 1), nextAfter(exact, -1)]) {
			if (!(radius > 0)) continue
			// `barNeighbourhoodMass` is the unoptimized reader of the same predicate; the snap's pooled
			// scan must agree with it on whether this pair is inside the ball.
			const mass = barNeighbourhoodMass(anchor, inventory, radius)
			const reference = referenceSnap(inventory, anchor, radius)
			const actual = snapToArtwork(anchor, inventory, radius)
			assert.ok(mass >= 1, "the anchor is always in its own neighbourhood")
			assert.ok(reference !== null)
			assert.deepEqual(actual.rgb, reference.rgb, `radius ${radius}`)
			assert.equal(actual.distance, reference.distance, `radius ${radius}`)
		}
	}
})

/** One ulp up or down from `value`, via the bit pattern — no library, and exact. */
function nextAfter(value: number, direction: 1 | -1): number {
	const buffer = new DataView(new ArrayBuffer(8))
	buffer.setFloat64(0, value)
	const bits = buffer.getBigUint64(0)
	buffer.setBigUint64(0, direction > 0 ? bits + 1n : bits - 1n)
	return buffer.getFloat64(0)
}
