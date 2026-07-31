/**
 * One artwork, one line, through the public entry point — the historical-bisection probe.
 *
 * Deliberately imports nothing but `research/v2-3/src`, so the runtime tree can be swapped to an
 * arbitrary commit underneath it while this file (in `v2-3-experiments/`) stays put.
 *
 *   node ... extract-one.ts <imagePath>
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"
const target = process.argv[2]
if (!target) throw new Error("usage: extract-one.ts <imagePath>")

const image = await loadNativeImage(`${ROOT}/${target}`)
const result = extractPaletteDetails(image)
const w = result.winner
console.log(`${w.background.hex} ${w.surface.hex} ${w.foreground.hex} ${w.accent.hex} ` +
	`${w.gradient ? "grad" : "flat"} collapse=[${w.collapse.surface},${w.collapse.accent}] ` +
	`mid=${result.midpoint.color?.hex ?? "-"}`)
