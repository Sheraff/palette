/**
 * Read the repair slate for one image, through the real pipeline rather than a reimplementation of
 * it, using the research observer hook.
 */
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import type { PublishedPalette, RepairSlateEntry } from "../../v2-3/src/internal/zero-contrast-repair.ts"
import type { RawImage } from "../../v2-3/src/internal/types.ts"

export function slateForImage(image: RawImage): Readonly<{
	slate: readonly RepairSlateEntry[]
	published: PublishedPalette
}> {
	let captured: { slate: readonly RepairSlateEntry[]; published: PublishedPalette } | null = null
	extractPaletteDetails(image, undefined, undefined, undefined, undefined, undefined,
		(observation) => { captured = { slate: observation.slate, published: observation.published } })
	if (captured === null) throw new Error("the repair slate observer was never called")
	return captured
}
