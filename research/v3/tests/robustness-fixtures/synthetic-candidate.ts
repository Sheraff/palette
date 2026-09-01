/**
 * A candidate whose output is dictated by the file's NAME. Not a palette algorithm.
 *
 * It exists so the harness can be tested against a known answer. Every real candidate's agreement
 * rate is a measurement; this one's is a specification — the fixture file names say exactly which
 * trials must agree, so a test can assert `6/9` and mean it.
 *
 * The naming rule: the stem is four six-digit hex colours joined by `-`, in role order
 * (background, surface, foreground, accent). A stem of `boom` throws, which is how the error path
 * gets exercised without needing a corrupt image on disk.
 *
 * It implements the dev-loop bundle's `CandidatePalette` shape — `(imagePath) => Promise<Palette>`
 * — and deliberately never opens the file, so the fixtures need no pixels.
 */

import path from "node:path"

import { makePalette } from "../../src/contract/fixtures.ts"
import type { Palette } from "../../src/contract/types.ts"

export const candidateId = "synthetic-hex-from-filename"

export class SyntheticCandidateError extends Error {}

export function paletteFromStem(stem: string): Palette {
	if (stem === "boom") throw new SyntheticCandidateError("synthetic candidate was asked to fail")
	const tokens = stem.split("-")
	if (tokens.length !== 4 || tokens.some((token) => !/^[0-9a-f]{6}$/.test(token))) {
		throw new SyntheticCandidateError(`stem is not four hex colours: ${stem}`)
	}
	const [background, surface, foreground, accent] = tokens as [string, string, string, string]
	return makePalette({
		background: `#${background}`,
		surface: `#${surface}`,
		foreground: `#${foreground}`,
		accent: `#${accent}`,
	})
}

export const paletteOf = async (imagePath: string): Promise<Palette> => {
	const stem = path.basename(imagePath).replace(/\.[^.]+$/, "")
	return paletteFromStem(stem)
}
