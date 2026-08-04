/**
 * Synthetic colour images for the lane tests — written as PNGs so the whole candidate, decode
 * included, is what gets exercised.
 *
 * **Every fixture is built from axis-aligned rectangles and rings.** That is not decoration: the
 * brute-force reference in `../../tests/reference.ts` has no Khalimsky immersion and would have to
 * pick a connectivity convention, so the comparison is only about the algorithm on **well-composed**
 * images — those with no 2 x 2 window whose two "on" pixels sit on a diagonal at some level. Blocks
 * and rings are well-composed in every channel at once, which is what lets one fixture check the L,
 * a and b lanes without three sets of pictures. `isWellComposed` is still asserted, never assumed.
 *
 * The **isoluminant** fixture is the one that carries the argument: two colours chosen so their OKLab
 * lightnesses land in the same quantised L level while their `a` values are far apart. It is the case
 * arm-b′ §2.1 says is real, and the case cycle 1 recorded itself blind to.
 */

import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import sharp from "sharp"
import { rgbToOkLab } from "../../../../../src/contract/color.ts"
import type { Rgb8 } from "../../../../../src/contract/types.ts"
import { L_LEVEL_COUNT } from "../../constants.ts"

export type ColorFixture = Readonly<{ name: string; size: number; pixels: Rgb8[] }>

/** The quantised L level of a colour, as `decodeImage` computes it. */
export function lightnessLevel(rgb: Rgb8): number {
	const lightness = rgbToOkLab(rgb)[0]
	const clamped = lightness < 0 ? 0 : lightness > 1 ? 1 : lightness
	return Math.round(clamped * (L_LEVEL_COUNT - 1))
}

function paint(size: number, fill: (x: number, y: number) => Rgb8): Rgb8[] {
	const pixels: Rgb8[] = []
	for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) pixels.push(fill(x, y))
	return pixels
}

/**
 * A red and a green whose OKLab lightnesses quantise to the same level.
 *
 * Found by scanning the two hue ramps for the pair with the smallest lightness gap, so the fixture is
 * a fact about sRGB rather than a hand-tuned constant; the test asserts the levels really do agree.
 */
export function isoluminantPair(): Readonly<{ first: Rgb8; second: Rgb8 }> {
	let best: { first: Rgb8; second: Rgb8; gap: number } | null = null
	for (let red = 120; red <= 255; red += 1) {
		const first: Rgb8 = [red, 40, 40]
		const levelFirst = lightnessLevel(first)
		for (let green = 60; green <= 200; green += 1) {
			const second: Rgb8 = [40, green, 60]
			if (lightnessLevel(second) !== levelFirst) continue
			const gap = Math.abs(rgbToOkLab(first)[0] - rgbToOkLab(second)[0])
			if (best === null || gap < best.gap) best = { first, second, gap }
		}
	}
	if (best === null) throw new Error("no isoluminant red/green pair found; the fixture's premise is wrong")
	return { first: best.first, second: best.second }
}

/** Four covers: nested blocks, a ring, stripes, and the isoluminant pair. */
export function colorFixtures(): ColorFixture[] {
	const size = 64
	const iso = isoluminantPair()
	return [
		{
			name: "nested-blocks",
			size,
			pixels: paint(size, (x, y) => {
				if (x >= 8 && x < 56 && y >= 8 && y < 56) {
					if (x >= 20 && x < 44 && y >= 20 && y < 44) return [40, 90, 200]
					return [220, 60, 70]
				}
				return [240, 238, 230]
			}),
		},
		{
			name: "ring",
			size,
			pixels: paint(size, (x, y) => {
				const inRing = x >= 12 && x < 52 && y >= 12 && y < 52 && !(x >= 22 && x < 42 && y >= 22 && y < 42)
				return inRing ? [30, 160, 90] : [235, 235, 240]
			}),
		},
		{
			name: "stripes-on-field",
			size,
			pixels: paint(size, (x, y) => {
				if (y >= 40) return [60, 60, 70]
				if (x % 8 < 3 && y >= 10 && y < 34) return [250, 200, 30]
				return [200, 205, 210]
			}),
		},
		{
			// **The gap, as a picture.** A mark sitting on a field of *the same quantised lightness*.
			// A mark on a white ground is visible to L however chromatic it is — what L cannot see is a
			// mark that does not move in lightness *against its own surround*, which is the case
			// arm-b′ §2.1 names. The whole image is therefore one L level and exactly two a levels.
			name: "isoluminant-mark-on-field",
			size,
			pixels: paint(size, (x, y) => (x >= 16 && x < 48 && y >= 16 && y < 48 ? iso.second : iso.first)),
		},
	]
}

/** Write the fixtures as lossless PNGs and return their absolute paths, in fixture order. */
export async function writeColorFixtures(directory: string): Promise<string[]> {
	await mkdir(directory, { recursive: true })
	const paths: string[] = []
	for (const fixture of colorFixtures()) {
		const buffer = Buffer.alloc(fixture.size * fixture.size * 3)
		for (let index = 0; index < fixture.pixels.length; index += 1) {
			buffer[index * 3] = fixture.pixels[index][0]
			buffer[index * 3 + 1] = fixture.pixels[index][1]
			buffer[index * 3 + 2] = fixture.pixels[index][2]
		}
		const path = join(directory, `${fixture.name}.png`)
		await writeFile(
			path,
			await sharp(buffer, { raw: { width: fixture.size, height: fixture.size, channels: 3 } }).png().toBuffer(),
		)
		paths.push(path)
	}
	return paths
}
