/**
 * Shared scaffolding for the search suite: where demo-20 lives, and how to make a synthetic artwork
 * with a known, tiny colour alphabet.
 *
 * The synthetic images exist for the mechanism guard, which needs an image whose *entire*
 * configuration space can be enumerated by hand in seconds. Three colours is the largest alphabet
 * that keeps the four-stop grammar tractable: the ramp cases go as `pairs × inkPairs × colours² ×
 * positionPairs`, so a fourth colour costs roughly a factor of three in wall time for a test that is
 * already dominated by the contract's 2,048-samples-per-segment ramp check.
 */

import { mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import { demo20Path, readSetFile } from "../../src/emit/paths.ts"

/** The demo-20 covers, resolved. Throws if the corpus is not in this checkout — never silently short. */
export function demo20Images(): string[] {
	const { found, missing } = readSetFile(demo20Path())
	if (missing.length > 0) {
		throw new Error(`demo-20 has ${missing.length} unresolved paths in this checkout: ${missing.join(", ")}`)
	}
	return found
}

/**
 * A synthetic PNG of vertical bands, one per colour, written to a fresh temp directory.
 *
 * Bands rather than random pixels: every colour gets a contiguous region with real spatial moments,
 * so the extent ladder and the fitted geometries have something to say and the energies are not
 * being asked about a texture nobody would call a field.
 */
export async function writeBandedImage(
	colors: readonly Rgb8[],
	options?: { width?: number; height?: number; name?: string },
): Promise<string> {
	// 96 × 32: three bands of 32 px on a 32 px short edge. Large enough for the dyadic ladder to have
	// rungs, small enough that the whole suite decodes it in a millisecond.
	const width = options?.width ?? 96
	const height = options?.height ?? 32
	const directory = mkdtempSync(join(tmpdir(), "p1-search-"))
	mkdirSync(directory, { recursive: true })
	const path = join(directory, options?.name ?? "banded.png")

	const raw = Buffer.alloc(width * height * 3)
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const color = colors[Math.min(colors.length - 1, Math.floor((x * colors.length) / width))]
			const offset = (y * width + x) * 3
			raw[offset] = color[0]
			raw[offset + 1] = color[1]
			raw[offset + 2] = color[2]
		}
	}
	await sharp(raw, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 9 }).toFile(path)
	return path
}

/**
 * Three colours that are far apart in OKLab and legal against each other.
 *
 * Chosen so the feasible set is non-empty without being trivial: a near-black, a saturated violet and
 * a near-white give real luminance spread (so invariant 4's floors are clearable) and real chroma
 * spread (so decision 3's secondary key is exercised).
 */
export const THREE_COLORS: readonly Rgb8[] = [
	[10, 10, 10],
	[127, 0, 255],
	[245, 245, 245],
]
