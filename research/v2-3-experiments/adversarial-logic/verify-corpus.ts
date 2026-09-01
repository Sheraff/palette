/**
 * Corpus check: the review campaign ran on the unscrambled originals
 * (images/birdsofprey.jpg ...), which are gitignored and therefore absent from a
 * fresh worktree. Run the public entry point on whichever files are named on the
 * command line and print the shipped extraction.
 */
import { extractPaletteFromBytes } from "../../v2-3/index.ts"

for (const path of process.argv.slice(2)) {
	const e = await extractPaletteFromBytes(path)
	console.log(JSON.stringify({
		path,
		size: `${e.width}x${e.height}`,
		background: e.winner.background.hex,
		surface: e.winner.surface.hex,
		foreground: e.winner.foreground.hex,
		accent: e.winner.accent.hex,
		gradient: e.winner.gradient,
		collapse: e.winner.collapse,
		midpoint: e.researchRender?.field.stops[1].hex ?? null,
	}))
}
