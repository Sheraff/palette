/**
 * Fixtures for the arm A energy tests.
 *
 * The image writers come from `tests/measure/support.ts` unchanged — the same lossless PNG path, so
 * the triples a test hand-reasons about are the triples the decoder returns. What is added here is
 * the *configuration* side: a builder that makes a complete `Configuration` from four triples plus
 * flags, because every one of these tests is a comparison between two complete configurations and
 * `DESIGN.md` forbids a half-configuration existing at all.
 */

import type { Configuration, ConfigurationStop } from "../../src/emit/types.ts"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import { rgbToOkLab, okLabToRgb } from "../../../../src/contract/color.ts"

export {
	cleanupFixtures,
	readSetFile,
	resolveCorpusRoot,
	setFilePath,
	writeRgbImage,
} from "../measure/support.ts"

/** Build a complete configuration. Every field is named; nothing is inferred. */
export function configuration(spec: {
	background: Rgb8
	surface?: Rgb8
	foreground: Rgb8
	accent?: Rgb8
	gradient?: boolean
	stops?: readonly ConfigurationStop[]
	surfaceCollapsed?: boolean
	accentCollapsed?: boolean
}): Configuration {
	const surfaceCollapsed = spec.surfaceCollapsed ?? spec.surface === undefined
	const accentCollapsed = spec.accentCollapsed ?? spec.accent === undefined
	return {
		background: spec.background,
		surface: spec.surface ?? spec.background,
		foreground: spec.foreground,
		accent: spec.accent ?? spec.foreground,
		gradient: spec.gradient ?? false,
		stops: spec.stops ?? [],
		surfaceCollapsed,
		accentCollapsed,
		escape: null,
	}
}

/**
 * The 8-bit triple on the OKLab-linear segment between two triples at parameter `t`.
 *
 * This is the *rendered* path of a two-stop gradient (`src/contract/ramp.ts`: componentwise linear in
 * OKLab), so an image painted with it is an image whose colour field literally *is* that gradient —
 * which is what the ramp fixture needs in order to test whether the energy can see one.
 */
export function rampTriple(from: Rgb8, to: Rgb8, t: number): Rgb8 {
	const start = rgbToOkLab(from)
	const end = rgbToOkLab(to)
	return okLabToRgb([
		start[0] + t * (end[0] - start[0]),
		start[1] + t * (end[1] - start[1]),
		start[2] + t * (end[2] - start[2]),
	])
}
