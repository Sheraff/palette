/**
 * Track F visualisation: writes a PNG per artwork where each of the top-N
 * families is painted a distinct flat colour, so the spatial layout of the
 * segmentation can be inspected directly.
 *
 *   node --experimental-strip-types research/v2-3-experiments/track-f/map.ts <outDir> <case> [case ...]
 */
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import sharp from "sharp"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildNativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"
import { oklabToRGB, rgbToHex } from "../../v2-3/src/internal/color.ts"


const legend: ReadonlyArray<readonly [number, number, number]> = [
	[228, 26, 28], [55, 126, 184], [77, 175, 74], [152, 78, 163], [255, 127, 0],
	[255, 255, 51], [166, 86, 40], [247, 129, 191], [0, 206, 209], [153, 153, 153],
	[0, 0, 0], [255, 255, 255],
]

const [outDir, ...cases] = process.argv.slice(2)
for (const name of cases) {
	const image = await loadNativeImage(corpusPath(`images/${name.includes(".") ? name : `${name}.jpg`}`))
	const evidence = buildNativePaletteEvidence(image)
	const ranked = [...evidence.families]
		.sort((first, second) => second.population - first.population)
		.slice(0, legend.length)
	const colorByIndex = new Map<number, readonly [number, number, number]>()
	console.log(`\n${name} legend:`)
	for (const [rank, family] of ranked.entries()) {
		const index = evidence.families.findIndex(({ id }) => id === family.id)
		colorByIndex.set(index, legend[rank])
		console.log(`  ${rgbToHex(legend[rank] as [number, number, number])} = ${family.id} ${rgbToHex(oklabToRGB(family.prototype))} pop=${(family.populationFraction * 100).toFixed(2)}%`)
	}
	const out = Buffer.alloc(evidence.pixelCount * 3)
	for (let pixelIndex = 0; pixelIndex < evidence.pixelCount; pixelIndex++) {
		const paint = colorByIndex.get(evidence.familyAt[pixelIndex]) ?? [40, 40, 40]
		out[pixelIndex * 3] = paint[0]
		out[pixelIndex * 3 + 1] = paint[1]
		out[pixelIndex * 3 + 2] = paint[2]
	}
	const target = resolve(outDir, `${name.replace(/\.[a-z]+$/u, "")}-families.png`)
	await sharp(out, { raw: { width: evidence.width, height: evidence.height, channels: 3 } }).png().toFile(target)
	console.log(`  -> ${target}`)
}
