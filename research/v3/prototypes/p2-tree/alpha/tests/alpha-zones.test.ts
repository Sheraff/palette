/**
 * The α-zones, against a brute-force reference.
 *
 * `hierarchy.ts` computes the quasi-flat zones with a Kruskal-style union-find over bar-scaled edge
 * weights — near-linear, and wrong in a way that would be invisible in a palette if the bar
 * arithmetic drifted by a hair. So the reference here is the **definition**, computed the slow
 * obvious way: two pixels are in one zone iff there is a path of 4-connected steps between them
 * every one of which the *contract's own* `sameColor()` calls the same colour. Transitive closure by
 * repeated relaxation over all ordered pairs — quadratic per sweep, run to a fixed point.
 *
 * Two things are being pinned, and the second matters as much as the first:
 *
 *  1. the union-find partition equals the definition's partition, exactly, on every fixture;
 *  2. `decode.ts`'s fast per-pixel region and bar arithmetic equals `colorRegion()` and
 *     `sameColorBar()` from `src/contract/color.ts` on every colour in every fixture. The fast path
 *     exists only to avoid allocating a `PaletteColor` per pixel, and the moment it disagrees with
 *     the contract this pipeline has quietly acquired a second ruler.
 *
 * Fixtures are generated arithmetically — no RNG anywhere, in the tests or in the pipeline — and
 * written as PNG so the decoder returns exactly the bytes that went in.
 */

import { test, describe, before, after } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { colorFromRgb, colorRegion, rgbToOkLab, sameColor, sameColorBar } from "../../../../src/contract/color.ts"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import { barBetween, decodeImage, regionIndexOfLab, regionNameOfIndex, unpack } from "../decode.ts"
import { buildHierarchy } from "../hierarchy.ts"

let directory = ""

before(async () => {
	directory = await mkdtemp(join(tmpdir(), "p2-alpha-"))
})

after(async () => {
	if (directory !== "") await rm(directory, { recursive: true, force: true })
})

/** Write an RGB buffer as a lossless PNG so the decode round-trips exactly. */
async function writeFixture(name: string, width: number, height: number, pixels: Rgb8[]): Promise<string> {
	const raw = Buffer.alloc(width * height * 3)
	for (let i = 0; i < pixels.length; i += 1) {
		raw[i * 3] = pixels[i][0]
		raw[i * 3 + 1] = pixels[i][1]
		raw[i * 3 + 2] = pixels[i][2]
	}
	const path = join(directory, `${name}.png`)
	await sharp(raw, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 0 }).toFile(path)
	return path
}

/**
 * The definition, computed the slow way. Returns each pixel's component label, canonicalised to the
 * smallest raster index in its component so two partitions can be compared with `deepEqual`.
 */
function bruteForceZones(width: number, height: number, pixels: readonly Rgb8[]): number[] {
	const count = width * height
	const label = Array.from({ length: count }, (_unused, index) => index)
	const joins: [number, number][] = []
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const pixel = y * width + x
			for (const neighbour of [x + 1 < width ? pixel + 1 : -1, y + 1 < height ? pixel + width : -1]) {
				if (neighbour === -1) continue
				// The contract's own ruler, through the contract's own function. No local arithmetic.
				if (sameColor(colorFromRgb(pixels[pixel]), colorFromRgb(pixels[neighbour]))) {
					joins.push([pixel, neighbour])
				}
			}
		}
	}
	let changed = true
	while (changed) {
		changed = false
		for (const [first, second] of joins) {
			const smallest = Math.min(label[first], label[second])
			if (label[first] !== smallest || label[second] !== smallest) {
				const from = Math.max(label[first], label[second])
				for (let pixel = 0; pixel < count; pixel += 1) {
					if (label[pixel] === from) label[pixel] = smallest
				}
				changed = true
			}
		}
	}
	return label
}

/** The pipeline's partition, in the same canonical form. */
function canonicalise(zoneOfPixel: Int32Array): number[] {
	const firstOfZone = new Map<number, number>()
	const canonical: number[] = []
	for (let pixel = 0; pixel < zoneOfPixel.length; pixel += 1) {
		const zone = zoneOfPixel[pixel]
		if (!firstOfZone.has(zone)) firstOfZone.set(zone, pixel)
		canonical.push(firstOfZone.get(zone) as number)
	}
	return canonical
}

type Fixture = Readonly<{ name: string; width: number; height: number; pixels: Rgb8[] }>

/** Four fixtures, each aimed at a different way the zone computation can be wrong. */
function fixtures(): Fixture[] {
	const built: Fixture[] = []

	// 1. Three flat blocks, obviously distinct. The partition must be exactly three zones.
	{
		const width = 12
		const height = 9
		const pixels: Rgb8[] = []
		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) {
				pixels.push(x < 4 ? [20, 30, 200] : x < 8 ? [220, 40, 30] : [240, 240, 235])
			}
		}
		built.push({ name: "three-blocks", width, height, pixels })
	}

	// 2. A smooth horizontal ramp: one 8-bit step per column, every step under any bar. This is the
	//    chaining pathology arm-b §2.2 relies on — the whole ramp must come out as ONE zone.
	{
		const width = 16
		const height = 6
		const pixels: Rgb8[] = []
		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) pixels.push([120 + x, 120 + x, 120 + x])
		}
		built.push({ name: "smooth-ramp", width, height, pixels })
	}

	// 3. A deterministic fine-grained pattern, no RNG: values that jump above and below the bar in an
	//    irregular way, which is where an off-by-one in the edge ordering shows up.
	{
		const width = 14
		const height = 14
		const pixels: Rgb8[] = []
		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) {
				const t = (x * 37 + y * 17) % 13
				const step = (x * 5 + y * 11) % 7
				pixels.push([30 + t * 16, 90 + step * 20, 200 - t * 9])
			}
		}
		built.push({ name: "irregular", width, height, pixels })
	}

	// 4. Dark near-neutral, where the bar is tightest (0.00932) and one 8-bit step is a large OKLab
	//    step. Arm-b §7 expects this to be the worst stratum; the partition still has to be right.
	{
		const width = 10
		const height = 10
		const pixels: Rgb8[] = []
		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) {
				const value = 2 + ((x + y) % 5)
				pixels.push([value, value, value + ((x * y) % 3)])
			}
		}
		built.push({ name: "dark-neutral", width, height, pixels })
	}

	return built
}

describe("the α-zone partition equals its definition", () => {
	for (const fixture of fixtures()) {
		test(fixture.name, async () => {
			const path = await writeFixture(fixture.name, fixture.width, fixture.height, fixture.pixels)
			const image = await decodeImage(path)
			assert.equal(image.width, fixture.width)
			assert.equal(image.height, fixture.height)
			// The PNG must have round-tripped, or the reference is being run on different pixels.
			for (let pixel = 0; pixel < image.pixelCount; pixel += 1) {
				assert.deepEqual(unpack(image.packed[pixel]), fixture.pixels[pixel], `pixel ${pixel} did not round-trip`)
			}

			const hierarchy = buildHierarchy(image)
			assert.deepEqual(
				canonicalise(hierarchy.zoneOfPixel),
				bruteForceZones(fixture.width, fixture.height, fixture.pixels),
				"union-find partition differs from the brute-force transitive closure",
			)
		})
	}

	test("three flat blocks are exactly three zones, and a smooth ramp is exactly one", async () => {
		const all = fixtures()
		const blocks = all.find((fixture) => fixture.name === "three-blocks") as Fixture
		const ramp = all.find((fixture) => fixture.name === "smooth-ramp") as Fixture

		const blocksImage = await decodeImage(
			await writeFixture("blocks-count", blocks.width, blocks.height, blocks.pixels),
		)
		assert.equal(buildHierarchy(blocksImage).zoneCount, 3)

		const rampImage = await decodeImage(await writeFixture("ramp-count", ramp.width, ramp.height, ramp.pixels))
		assert.equal(
			buildHierarchy(rampImage).zoneCount,
			1,
			"the chaining pathology is the feature: a continuous progression is one α-zone",
		)
	})
})

describe("the fast per-pixel ruler is the contract's ruler", () => {
	test("region and bar agree with colorRegion() and sameColorBar() on every fixture colour", async () => {
		for (const fixture of fixtures()) {
			const image = await decodeImage(
				await writeFixture(`ruler-${fixture.name}`, fixture.width, fixture.height, fixture.pixels),
			)
			for (let pixel = 0; pixel < image.pixelCount; pixel += 1) {
				const color = colorFromRgb(unpack(image.packed[pixel]))
				assert.equal(
					regionNameOfIndex(image.region[pixel]),
					colorRegion(color),
					`region disagrees at pixel ${pixel} of ${fixture.name}`,
				)
			}
			// And the pair rule — "the larger of the two regions' bars" — on every 4-connected pair.
			for (let y = 0; y < image.height; y += 1) {
				for (let x = 0; x < image.width; x += 1) {
					const pixel = y * image.width + x
					for (const neighbour of [x + 1 < image.width ? pixel + 1 : -1, y + 1 < image.height ? pixel + image.width : -1]) {
						if (neighbour === -1) continue
						assert.equal(
							barBetween(image, pixel, neighbour),
							sameColorBar(colorFromRgb(unpack(image.packed[pixel])), colorFromRgb(unpack(image.packed[neighbour]))),
							`pair bar disagrees at ${pixel}→${neighbour} of ${fixture.name}`,
						)
					}
				}
			}
		}
	})

	test("regionIndexOfLab agrees with colorRegion() over an 8-bit sweep of all four regions", () => {
		const seen = new Set<string>()
		for (let red = 0; red < 256; red += 17) {
			for (let green = 0; green < 256; green += 17) {
				for (let blue = 0; blue < 256; blue += 17) {
					const rgb: Rgb8 = [red, green, blue]
					const lab = rgbToOkLab(rgb)
					const expected = colorRegion(colorFromRgb(rgb))
					assert.equal(regionNameOfIndex(regionIndexOfLab(lab[0], lab[1], lab[2])), expected, `at ${rgb.join(",")}`)
					seen.add(expected)
				}
			}
		}
		assert.equal(seen.size, 4, "the sweep should visit all four regions")
	})
})
