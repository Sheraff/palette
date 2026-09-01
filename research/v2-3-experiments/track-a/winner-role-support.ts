/**
 * Prints the source-support record of every role of the current winner, for one
 * or more images. Used to look for a local term that separates a distinct
 * surface which genuinely carries a second field from one that does not.
 *
 * Usage: node research/v2-3-experiments/track-a/winner-role-support.ts <case.jpg> [...]
 */

import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url))
const imagesRoot = process.env.PALETTE_IMAGES_ROOT ?? resolve(repoRoot, "images")

for (const caseId of process.argv.slice(2)) {
	const image = await loadNativeImage(new Uint8Array(await readFile(resolve(imagesRoot, caseId))))
	const { winner } = extractPaletteDetails(image)
	const surface = winner.surface.support
	const background = winner.background.support
	const label = winner.collapse.surface ? "COLLAPSED" : winner.gradient ? "gradient " : "distinct "
	const numbers = "generated" in surface || "generated" in background
		? "generated"
		: `bgTotal=${background.totalSupport.toFixed(4)} surfTotal=${surface.totalSupport.toFixed(4)} ` +
			`surfConnected=${surface.connectedSupport.toFixed(4)} surfCoverage=${surface.spatialCoverage.toFixed(4)} ` +
			`ratio=${(surface.totalSupport / Math.max(1e-9, background.totalSupport)).toFixed(3)}`
	console.log(`${caseId.padEnd(16)} ${label} ${winner.background.hex} ${winner.surface.hex}  ${numbers}`)
}
