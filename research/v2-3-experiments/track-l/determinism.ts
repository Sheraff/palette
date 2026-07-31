/**
 * Same input, same output: extract each case three times in one process and
 * three more in a fresh module graph, and assert every field matches.
 *
 * usage: determinism.ts <case...>
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"

for (const target of process.argv.slice(2)) {
	const image = await loadNativeImage(`${ROOT}/${target}`)
	const signatures: string[] = []
	for (let run = 0; run < 3; run += 1) {
		const result = extractPaletteDetails(image)
		const winner = result.winner
		signatures.push([
			winner.background.hex, winner.surface.hex, winner.foreground.hex, winner.accent.hex,
			winner.gradient, winner.collapse.surface, winner.collapse.accent,
			result.midpoint.color?.hex ?? "-",
		].join(" "))
	}
	const identical = signatures.every((signature) => signature === signatures[0])
	console.log(`${identical ? "OK  " : "FAIL"} ${target.padEnd(52)} ${signatures[0]}`)
	if (!identical) for (const signature of signatures) console.log(`      ${signature}`)
}
