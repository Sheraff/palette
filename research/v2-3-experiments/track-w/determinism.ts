/**
 * Determinism: the same input must give the same output, always (charter rule 6).
 *
 * Extracts each named artwork three times in one process and compares the full winner —
 * four hexes, gradient, collapse and midpoint.
 *
 *   node ... determinism.ts <case-substring>...
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import { CASES } from "./run.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"

let failures = 0
for (const needle of process.argv.slice(2)) {
	const caseFile = CASES.find((entry) => entry.includes(needle))
	if (!caseFile) { console.log(`?? ${needle} not in case set`); continue }
	const seen = new Set<string>()
	for (let run = 0; run < 3; run += 1) {
		const image = await loadNativeImage(`${ROOT}/${caseFile}`)
		const result = extractPaletteDetails(image)
		seen.add(JSON.stringify([
			result.winner.background.hex, result.winner.surface.hex,
			result.winner.foreground.hex, result.winner.accent.hex,
			result.winner.gradient, result.winner.collapse.surface, result.winner.collapse.accent,
			result.midpoint.color?.hex ?? null,
		]))
	}
	const stable = seen.size === 1
	if (!stable) failures += 1
	console.log(`  ${stable ? "OK " : "XX "} ${caseFile.padEnd(52)} ${[...seen][0]}`)
	if (!stable) for (const entry of seen) console.log(`        ${entry}`)
}
console.log(failures === 0 ? "\ndeterministic" : `\n${failures} NON-DETERMINISTIC`)
