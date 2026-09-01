/**
 * Track F absorption census over an arbitrary image set.
 *
 * The optical-blend pass is provably a no-op on any artwork where it absorbs
 * nothing: `buildNativePaletteEvidence` then reuses the provisional field lane
 * object unchanged, and the only new field on the evidence record is unread. So
 * this census is a sufficient regression screen — only artworks listed with a
 * non-empty absorption set can possibly produce a different palette.
 *
 *   node --experimental-strip-types research/v2-3-experiments/track-f/census.ts <dir>
 */
import { readdir } from "node:fs/promises"
import { extname, resolve } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildNativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"
import { oklabToRGB, rgbToHex } from "../../v2-3/src/internal/color.ts"

const [directory = "images", ...only] = process.argv.slice(2)
const extensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"])
const files = (await readdir(directory))
	.filter((name) => extensions.has(extname(name).toLowerCase()))
	.filter((name) => only.length === 0 || only.some((wanted) => name === wanted || name.startsWith(`${wanted}.`)))
	.sort()

let absorbing = 0
for (const file of files) {
	const evidence = buildNativePaletteEvidence(await loadNativeImage(resolve(directory, file)))
	const absorbed = evidence.absorbedFieldFamilyIds
	if (absorbed.length === 0) {
		console.log(`${file.padEnd(28)} clean`)
		continue
	}
	absorbing += 1
	const described = absorbed.map((id) => {
		const family = evidence.families.find((candidate) => candidate.id === id)!
		return `${rgbToHex(oklabToRGB(family.prototype))}(${(family.populationFraction * 100).toFixed(2)}%)`
	})
	const mass = absorbed.reduce((total, id) =>
		total + (evidence.families.find((candidate) => candidate.id === id)?.populationFraction ?? 0), 0)
	console.log(`${file.padEnd(28)} ABSORBS ${absorbed.length} (${(mass * 100).toFixed(2)}% of pixels): ${described.join(" ")}`)
}
console.log(`\n${absorbing} of ${files.length} images absorb anything.`)
