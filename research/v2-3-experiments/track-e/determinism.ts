/** Same input, same output — three runs of the three changed cases. */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"

const ROOT = "/Users/Flo/GitHub/palette"
for (const file of ["images/placebo.jpg", "images/slim.jpg", "images/muse.jpg"]) {
	const image = await loadNativeImage(`${ROOT}/${file}`)
	const runs = [0, 1, 2].map(() => {
		const r = extractPaletteDetails(image)
		return `${r.winner.background.hex} ${r.winner.surface.hex} ${r.winner.foreground.hex} ${r.winner.accent.hex} ${r.winner.gradient} ${JSON.stringify(r.midpoint.color)}`
	})
	const identical = runs.every((run) => run === runs[0])
	console.log(`${identical ? "OK  " : "FAIL"} ${file.padEnd(20)} ${runs[0]}`)
	if (!identical) process.exitCode = 1
}
