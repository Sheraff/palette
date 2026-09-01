/**
 * Track F: prints the published palette for arbitrary image paths.
 *
 *   node --experimental-strip-types research/v2-3-experiments/track-f/run.ts <file> [file ...]
 */
import { basename } from "node:path"

import { extractPaletteFromBytes } from "../../v2-3/index.ts"

for (const file of process.argv.slice(2)) {
	const { winner, researchRender } = await extractPaletteFromBytes(file)
	const roles = [winner.background.hex, winner.surface.hex, winner.foreground.hex, winner.accent.hex]
	const flags = `${winner.gradient ? "G" : "-"}${winner.collapse.surface ? "S" : "-"}${winner.collapse.accent ? "A" : "-"}`
	const midpoint = researchRender?.field.stops[1].hex
	console.log(`${basename(file).padEnd(28)} ${roles.join(" ")} ${flags}${midpoint ? ` mid=${midpoint}` : ""}`)
}
