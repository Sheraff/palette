/**
 * `p2-tos` — the tree-of-shapes prototype as a dev-loop candidate.
 *
 * **Cycle-1 quality is not the claim.** `SPEC.md` says so out loud: what this cycle owes is a
 * candidate that runs end to end and produces contract-shaped palettes, so that the robustness
 * harness can measure the mechanism's suspected weakness (region boundaries under re-encode) and the
 * reachability falsifier can start answering "do endorsed colours live in tree nodes at all". A
 * palette out of this module is *validity* evidence, not quality evidence.
 *
 * The shape of the module follows `src/devloop/candidates/toy-median-offsets.ts`, which is the right
 * half of that file to copy: decode its own input, dimensions from the header, transparency refused
 * loudly, every published colour an exact triple of the source, and the whole contract filled in
 * including the metadata that makes a verdict about the output permanently scopable.
 *
 * The mechanism itself is in `pipeline.ts` and `tree.ts`; this file is the contract adapter.
 */

import { CONTRACT_VERSION, FOREGROUND_ACCENT_SEPARATION_DISTANCE } from "../../../src/contract/constants.ts"
import { colorFromRgb, okLabDistance, rgbToOkLab } from "../../../src/contract/color.ts"
import { DEFAULT_CONTRAST_PARAMETERS, resolveContrastParameters, validatePalette } from "../../../src/contract/invariants.ts"
import type { GradientStop, Palette, Rgb8 } from "../../../src/contract/types.ts"
import { hashFileBytes } from "../../../src/devloop/code-version.ts"
import type { CandidatePalette } from "../../../src/devloop/types.ts"
import { ALGORITHM_VERSION, MAX_ASSEMBLY_ATTEMPTS, PREPROCESSING_VERSION } from "./constants.ts"
import { runPipeline } from "./pipeline.ts"

/** The name this candidate is known by in run ids, cache paths and the viewer. */
export const candidateId = "p2-tos"

export const paletteOf: CandidatePalette = async (imagePath) => {
	const { image, parse } = await runPipeline(imagePath)
	const inputContentHash = await hashFileBytes(imagePath)

	const background = colorFromRgb(parse.roles.background)
	const surface = colorFromRgb(parse.roles.surface)

	// The endpoint ruling, honoured by construction rather than by a repair pass: when the parse says
	// laminar, the two ends of the ground chain *are* the two field roles, and the stops are those two
	// objects. A collapsed surface leaves no ramp to draw, so it publishes `gradient: null` — which is
	// the same fact the parse already established, not a second check.
	const collapsedField = surface.hex === background.hex
	const stops: GradientStop[] = [
		{ color: background, position: 0 },
		{ color: surface, position: 1 },
	]

	const assemble = (foregroundRgb: Rgb8, accentRgb: Rgb8): Palette => {
		const foreground = colorFromRgb(foregroundRgb)
		const accent = colorFromRgb(accentRgb)
		return {
			contractVersion: CONTRACT_VERSION,
			roles: { background, surface, foreground, accent },
			gradient: parse.gradient && !collapsedField ? { stops: stops as unknown as [GradientStop, GradientStop] } : null,
			collapse: {
				// Measured against the colours actually published, never asserted from the parse's intent.
				surfaceCollapsed: collapsedField,
				accentCollapsed: accent.hex === foreground.hex,
			},
			contrast: resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS),
			metadata: {
				algorithmVersion: ALGORITHM_VERSION,
				preprocessingVersion: PREPROCESSING_VERSION,
				inputContentHash,
				sourceRendition: { path: imagePath, width: image.width, height: image.height, format: image.format },
				// Equal to the rendition's size, because §1 forbids resampling and this pipeline does none.
				processedSize: { width: image.width, height: image.height },
			},
		} satisfies Palette
	}

	// **The repair, arm-b′ §2.7, literally.** *"A violated invariant at assembly is repaired by taking
	// the next item in the same ranking, never by inventing or adjusting a colour… and the whole
	// palette is re-validated after it."* So: walk the parse's two rankings, assemble, re-validate,
	// stop at the first pair the contract accepts. Nothing is nudged, no colour is synthesised, and the
	// characteristic failure stays "a different valid palette" rather than an invalid one.
	//
	// Source support (invariant 2) is not checked here — it needs the decoded image and every colour
	// in both pools is already an exact triple of it by construction — so the walk is deciding
	// distinctness and contrast, which are the two the first run of this prototype failed.
	// **The walk is per role**, which is also arm-b′ §2.7's word for it. First settle the foreground
	// against a collapsed accent, so the only thing being decided is the foreground's own contrast
	// against the field; then walk the accent ranking with that foreground fixed. Two short walks
	// instead of one product: a cross-product of both rankings spends its whole budget re-testing the
	// first foreground against sixteen accents when the foreground is what the contract objected to.
	const foregrounds = parse.foregroundPool.length > 0 ? parse.foregroundPool : [parse.roles.foreground]
	const accents = parse.accentPool.length > 0 ? parse.accentPool : [parse.roles.accent]
	const first = assemble(foregrounds[0], parse.roles.accent)
	let attempts = 0

	let settled: Palette | null = null
	let settledForeground = foregrounds[0]
	for (const foreground of foregrounds) {
		if (attempts >= MAX_ASSEMBLY_ATTEMPTS) break
		attempts += 1
		// The accent collapsed onto the foreground: the palette the contract judges is then a statement
		// about the foreground alone.
		const palette = assemble(foreground, foreground)
		if (validatePalette(palette).violations.length === 0) {
			settled = palette
			settledForeground = foreground
			break
		}
	}
	if (settled === null) return first

	// Now the accent, against the foreground that just cleared. Anything that cannot clear the
	// contract's own foreground/accent separation is not a candidate at all — choosing under a tighter
	// rule is what made the first run of this prototype fail 7 of 20 on `I3`.
	for (const accent of accents) {
		if (attempts >= MAX_ASSEMBLY_ATTEMPTS) break
		if (okLabDistance(rgbToOkLab(accent), rgbToOkLab(settledForeground)) < FOREGROUND_ACCENT_SEPARATION_DISTANCE) continue
		attempts += 1
		const palette = assemble(settledForeground, accent)
		if (validatePalette(palette).violations.length === 0) return palette
	}
	// Nothing in the accent ranking cleared, so it stays collapsed — which is a sanctioned outcome and
	// a declared flag, not a repair.
	return settled
}
