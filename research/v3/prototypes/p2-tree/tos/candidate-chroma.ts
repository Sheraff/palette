/**
 * `p2-tos-chroma` — the tree-of-shapes prototype with all three lanes, as a dev-loop candidate.
 *
 * The mechanism is `pipeline.ts` and `tree.ts`, unchanged and imported; `lanes/` adds the a and b
 * trees and merges their retained nodes into the pool the mark roles are ranked over. This file is
 * the contract adapter, and it is deliberately the same adapter as `candidate.ts` — the two
 * candidates differ in the *pool*, not in how a palette is assembled from it, so a reviewer
 * comparing them is comparing what cycle 2 changed.
 *
 * **Why this is a second candidate rather than an edit to `candidate.ts`.** `p2-tos` is the thing
 * round 1 was judged against; keeping it runnable byte for byte is what makes the pool-size, timing
 * and accent deltas below measurable rather than asserted. Folding the lanes into `candidate.ts` is
 * a later, sequenced merge with the role-logic work happening beside this one.
 *
 * The **assembly closure** is shared with `candidate.ts` verbatim and is called out because it is
 * duplication, not design; it collapses at the merge. The walk itself is not duplicated — the twin
 * matrix, the repair and the role-swap check all live in `roles/assemble.ts` and are imported, so
 * both candidates assemble their palettes through exactly one implementation.
 */

import { colorFromRgb } from "../../../src/contract/color.ts"
import { CONTRACT_VERSION } from "../../../src/contract/constants.ts"
import { DEFAULT_CONTRAST_PARAMETERS, resolveContrastParameters, validatePalette } from "../../../src/contract/invariants.ts"
import type { GradientStop, Palette, Rgb8 } from "../../../src/contract/types.ts"
import { hashFileBytes } from "../../../src/devloop/code-version.ts"
import type { CandidatePalette } from "../../../src/devloop/types.ts"
import { MAX_ASSEMBLY_ATTEMPTS, PREPROCESSING_VERSION } from "./constants.ts"
import { CHROMA_ALGORITHM_VERSION } from "./lanes/constants.ts"
import { runChromaPipeline } from "./lanes/pool.ts"
import { resolveRoles, roleSwapImproves } from "./roles/assemble.ts"

/** The name this candidate is known by in run ids, cache paths and the viewer. */
export const candidateId = "p2-tos-chroma"

export const paletteOf: CandidatePalette = async (imagePath) => {
	const { image, parse } = await runChromaPipeline(imagePath)
	const inputContentHash = await hashFileBytes(imagePath)

	const background = colorFromRgb(parse.roles.background)
	const surface = colorFromRgb(parse.roles.surface)

	// The endpoint ruling, honoured by construction: stops[0] IS background, stops[last] IS surface,
	// exact. A collapsed surface leaves no ramp to draw, so it publishes `gradient: null`.
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
				algorithmVersion: CHROMA_ALGORITHM_VERSION,
				preprocessingVersion: PREPROCESSING_VERSION,
				inputContentHash,
				sourceRendition: { path: imagePath, width: image.width, height: image.height, format: image.format },
				// Equal to the rendition's size, because §1 forbids resampling and this pipeline does none.
				processedSize: { width: image.width, height: image.height },
			},
		} satisfies Palette
	}

	// The repair walk, the twin matrix and the role-swap check are `roles/assemble.ts`'s — the same
	// call `candidate.ts` makes, over the pools the shared pool produced. Two candidates, one assembly.
	const foregrounds = parse.foregroundPool.length > 0 ? parse.foregroundPool : [parse.roles.foreground]
	const accents = parse.accentPool.length > 0 ? parse.accentPool : [parse.roles.accent]
	const resolved = resolveRoles({
		background: parse.roles.background,
		surface: parse.roles.surface,
		foregroundPool: foregrounds,
		accentPool: accents,
		assemble,
		maxAttempts: MAX_ASSEMBLY_ATTEMPTS,
	})

	if (
		roleSwapImproves({
			foreground: resolved.foreground,
			accent: resolved.accent,
			foregroundPool: foregrounds,
			accentPool: accents,
		})
	) {
		const swapped = assemble(resolved.accent, resolved.foreground)
		if (validatePalette(swapped).violations.length === 0) return swapped
	}
	return resolved.palette
}
