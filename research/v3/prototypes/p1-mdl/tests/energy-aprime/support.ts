/**
 * Fixtures for the arm A′ energy tests: synthetic images written from raw buffers, and the
 * configuration builder the cases share.
 *
 * The images are PNG at compression level 0 because PNG is lossless — a JPEG round trip would change
 * the triples every hand-derivation in these tests is written against. Each fixture is small enough
 * (64 × 64 = 4,096 pixels, at most 64 distinct triples) that the measurement layer takes the *exact*
 * smoothed-mass path, so every number the tests assert is reproducible with a calculator rather than
 * only by running the code.
 *
 * This file deliberately does not import `tests/measure/support.ts`: that file belongs to the
 * measurement worker's owned paths and these tests must not couple their fixtures to it.
 */

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import type { Configuration, ConfigurationStop } from "../../src/emit/types.ts"

/** Side of every synthetic fixture, in pixels. 64 × 64 = 4,096 — the `N` in every hand-derivation. */
export const FIXTURE_SIDE = 64

let scratchDirectory: string | null = null

async function fixtureDirectory(): Promise<string> {
	if (scratchDirectory === null) scratchDirectory = await mkdtemp(join(tmpdir(), "p1-aprime-"))
	return scratchDirectory
}

export async function cleanupFixtures(): Promise<void> {
	if (scratchDirectory !== null) {
		await rm(scratchDirectory, { recursive: true, force: true })
		scratchDirectory = null
	}
}

/** Write a lossless RGB PNG whose pixels are exactly what `paint` returns. */
export async function writeRgbImage(
	name: string,
	width: number,
	height: number,
	paint: (x: number, y: number) => Rgb8,
): Promise<string> {
	const raw = Buffer.alloc(width * height * 3)
	let offset = 0
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1, offset += 3) {
			const [red, green, blue] = paint(x, y)
			raw[offset] = red
			raw[offset + 1] = green
			raw[offset + 2] = blue
		}
	}
	const path = join(await fixtureDirectory(), name)
	await sharp(raw, { raw: { width, height, channels: 3 } })
		.png({ compressionLevel: 0 })
		.toFile(path)
	return path
}

/**
 * A configuration with every field spelled out.
 *
 * The energy evaluates and never validates (`DESIGN.md`: *"the contract is the feasible set, never a
 * term"*), so these builders do not run `feasibility()`. Where a case deliberately uses a
 * configuration the contract would reject, the case says so.
 */
export function configuration(fields: {
	background: Rgb8
	surface?: Rgb8
	foreground: Rgb8
	accent?: Rgb8
	gradient?: boolean
	stops?: readonly ConfigurationStop[]
	surfaceCollapsed?: boolean
	accentCollapsed?: boolean
}): Configuration {
	const surfaceCollapsed = fields.surfaceCollapsed ?? fields.surface === undefined
	const accentCollapsed = fields.accentCollapsed ?? fields.accent === undefined
	return {
		background: fields.background,
		surface: fields.surface ?? fields.background,
		foreground: fields.foreground,
		accent: fields.accent ?? fields.foreground,
		gradient: fields.gradient ?? false,
		stops: fields.stops ?? [],
		surfaceCollapsed,
		accentCollapsed,
		escape: null,
	}
}
