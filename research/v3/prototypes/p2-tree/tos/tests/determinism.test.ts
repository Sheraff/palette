/**
 * **The double-run test.** Two runs over the same bytes produce byte-identical output.
 *
 * `SPEC.md`'s determinism rule is not "the algorithm has no `Math.random()`" — it is that every tie is
 * broken on a quantity computed from pixel values or raster coordinates, and nothing is ordered by a
 * hash, by a map's iteration order, by a filename or by content. Those failures do not show up as
 * noise; they show up as a run that is stable on one machine and different on another, or stable until
 * a `Map` rehashes. Running the pipeline twice in one process catches the crude half of that, and it
 * is the half a prototype actually gets wrong.
 *
 * The fixtures are generated here rather than taken from the corpus, so the test says the same thing
 * in a worktree that has no artwork shards checked out.
 */

import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import sharp from "sharp"
import { paletteOf } from "../candidate.ts"
import { nodesOf } from "../dump.ts"
import { runPipeline } from "../pipeline.ts"
import { makeRandom } from "./reference.ts"

/** Four synthetic covers: a ramp, a hard split, a field with marks on it, and noise. */
async function writeFixtures(directory: string): Promise<string[]> {
	const size = 96
	const paths: string[] = []
	const random = makeRandom(20260804)
	const kinds = ["ramp", "split", "marks", "noise"] as const
	for (const kind of kinds) {
		const pixels = Buffer.alloc(size * size * 3)
		for (let y = 0; y < size; y += 1) {
			for (let x = 0; x < size; x += 1) {
				let red = 0
				let green = 0
				let blue = 0
				if (kind === "ramp") {
					const t = (x + y) / (2 * size - 2)
					red = Math.round(20 + 200 * t)
					green = Math.round(40 + 120 * t)
					blue = Math.round(150 - 100 * t)
				} else if (kind === "split") {
					const left = x < size / 2
					red = left ? 30 : 220
					green = left ? 90 : 200
					blue = left ? 160 : 60
				} else if (kind === "marks") {
					const onMark = (x % 16 < 3 && y > 20 && y < 70) || (y % 24 < 2 && x > 30 && x < 60)
					red = onMark ? 250 : 25
					green = onMark ? 245 : 30
					blue = onMark ? 230 : 45
				} else {
					red = Math.floor(random() * 256)
					green = Math.floor(random() * 256)
					blue = Math.floor(random() * 256)
				}
				const offset = (y * size + x) * 3
				pixels[offset] = red
				pixels[offset + 1] = green
				pixels[offset + 2] = blue
			}
		}
		const path = join(directory, `${kind}.png`)
		await sharp(pixels, { raw: { width: size, height: size, channels: 3 } }).png({ compressionLevel: 0 }).toFile(path)
		paths.push(path)
	}
	return paths
}

test("two runs over the same bytes agree, byte for byte", async (context) => {
	const directory = await mkdtemp(join(tmpdir(), "p2-tos-determinism-"))
	context.after(async () => {
		await rm(directory, { recursive: true, force: true })
	})
	const fixtures = await writeFixtures(directory)

	for (const fixture of fixtures) {
		const firstPalette = await paletteOf(fixture)
		const secondPalette = await paletteOf(fixture)
		assert.equal(JSON.stringify(secondPalette), JSON.stringify(firstPalette), `${fixture}: palette moved between runs`)

		const firstDump = await nodesOf(fixture)
		const secondDump = await nodesOf(fixture)
		assert.equal(JSON.stringify(secondDump), JSON.stringify(firstDump), `${fixture}: node dump moved between runs`)
	}
})

test("every published colour is an exact pixel of the source", async (context) => {
	const directory = await mkdtemp(join(tmpdir(), "p2-tos-exactness-"))
	context.after(async () => {
		await rm(directory, { recursive: true, force: true })
	})
	const fixtures = await writeFixtures(directory)

	for (const fixture of fixtures) {
		const { image } = await runPipeline(fixture)
		const present = new Set(Array.from(image.packed))
		const palette = await paletteOf(fixture)
		for (const [role, color] of Object.entries(palette.roles)) {
			const packed = (color.rgb[0] << 16) | (color.rgb[1] << 8) | color.rgb[2]
			assert.ok(present.has(packed), `${fixture}: ${role} ${color.hex} is not a pixel of the artwork`)
		}
		for (const stop of palette.gradient?.stops ?? []) {
			const packed = (stop.color.rgb[0] << 16) | (stop.color.rgb[1] << 8) | stop.color.rgb[2]
			assert.ok(present.has(packed), `${fixture}: stop ${stop.color.hex} is not a pixel of the artwork`)
		}
	}
})

test("the endpoint ruling and the collapse flags hold on every fixture", async (context) => {
	const directory = await mkdtemp(join(tmpdir(), "p2-tos-contract-"))
	context.after(async () => {
		await rm(directory, { recursive: true, force: true })
	})
	const fixtures = await writeFixtures(directory)

	for (const fixture of fixtures) {
		const palette = await paletteOf(fixture)
		assert.equal(
			palette.collapse.surfaceCollapsed,
			palette.roles.surface.hex === palette.roles.background.hex,
			`${fixture}: surfaceCollapsed must be measured, not asserted`,
		)
		assert.equal(
			palette.collapse.accentCollapsed,
			palette.roles.accent.hex === palette.roles.foreground.hex,
			`${fixture}: accentCollapsed must be measured, not asserted`,
		)
		if (palette.gradient !== null) {
			// The reviewer's endpoint ruling: stops[0] *is* the background, stops[last] *is* the surface.
			assert.equal(palette.gradient.stops[0].color.hex, palette.roles.background.hex, `${fixture}: first stop`)
			const last = palette.gradient.stops[palette.gradient.stops.length - 1]
			assert.equal(last.color.hex, palette.roles.surface.hex, `${fixture}: last stop`)
			assert.equal(palette.collapse.surfaceCollapsed, false, `${fixture}: a collapsed surface leaves no ramp`)
		}
	}
})
