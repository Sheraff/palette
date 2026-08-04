/**
 * Fixtures for the falsifier tests: a lossless synthetic image and a hand-built `LegacyEntry`.
 *
 * The image is PNG at compression level 0 so the triples the test reasons about are exactly the ones
 * written; a JPEG round trip would invent colours and make "the image contains exactly two triples"
 * false. 64 × 64 = 4,096 pixels keeps the measurement inside its exact smoothed-mass path.
 *
 * Deliberately self-contained: `tests/energy-aprime/support.ts` and `tests/measure/support.ts` belong
 * to other workers' owned paths, and a shared fixture would couple three test suites to one file none
 * of them owns.
 */

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import type { LegacyCompleteness, LegacyEntry, LegacyTier } from "../../src/emit/legacy.ts"

let scratchDirectory: string | null = null

async function fixtureDirectory(): Promise<string> {
	if (scratchDirectory === null) scratchDirectory = await mkdtemp(join(tmpdir(), "p1-falsifier-"))
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
 * A `LegacyEntry` with every field a v2-3 `full` record would carry.
 *
 * Built by hand rather than loaded, so the falsifier's own machinery is under test and the fixture
 * files are not. `completeness: "full"` and non-null collapse flags are what make `toConfiguration`
 * succeed, which is the precondition `scoreEntry` asserts.
 */
export function legacyEntry(fields: {
	entryId: string
	tier: LegacyTier
	imagePath: string
	contentSha256: string
	background: Rgb8
	surface: Rgb8
	foreground: Rgb8
	accent: Rgb8
	gradient?: boolean
	midpoint?: Rgb8 | null
	surfaceCollapsed?: boolean
	accentCollapsed?: boolean
	completeness?: LegacyCompleteness
}): LegacyEntry {
	return {
		tier: fields.tier,
		entryId: fields.entryId,
		kind: fields.tier === "known-bad" ? null : "synthetic-fixture",
		completeness: fields.completeness ?? "full",
		artwork: {
			imagePath: fields.imagePath,
			absolutePath: fields.imagePath,
			contentSha256: fields.contentSha256,
			byteCount: 0,
			rendition: { format: "png", width: 64, height: 64 },
			imageId: fields.contentSha256,
		},
		configuration: {
			background: fields.background,
			surface: fields.surface,
			foreground: fields.foreground,
			accent: fields.accent,
			gradient: fields.gradient ?? false,
			midpointAdvisory: fields.midpoint ?? null,
			surfaceCollapsed: fields.surfaceCollapsed ?? true,
			accentCollapsed: fields.accentCollapsed ?? true,
			escape: null,
		},
		resolvedImagePath: fields.imagePath,
		raw: {},
	}
}
