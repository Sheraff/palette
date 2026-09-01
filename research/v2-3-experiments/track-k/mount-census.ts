/**
 * Track K firing census.
 *
 * The mount rule is a pure function of family statistics, so whether it fires can
 * be read from a single evidence build without running winner selection. That
 * makes it affordable to screen a large fresh off-panel sample: any artwork where
 * no family is a mount is provably unaffected (`buildNativePaletteEvidence`
 * returns the preliminary records unchanged), so only firing artworks need a
 * before/after extraction.
 *
 *   PALETTE_IMAGES_ROOT=/Users/Flo/GitHub/palette/images \
 *   node --experimental-strip-types research/v2-3-experiments/track-k/mount-census.ts <caseListFile>
 */
import { readFile } from "node:fs/promises"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildNativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"
import { oklabToRGB, rgbToHex } from "../../v2-3/src/internal/color.ts"
import { ALBUM_ARTWORK_PALETTE_V2_POLICY } from "../../v2-3/src/internal/policy.ts"
import { corpusPath } from "../../v2-3/test/corpus.ts"

const policy = ALBUM_ARTWORK_PALETTE_V2_POLICY.mount
const cases = (await readFile(process.argv[2], "utf8")).split("\n").map((line) => line.trim()).filter(Boolean)

let firing = 0
let failed = 0
for (const [index, entry] of cases.entries()) {
	try {
		const evidence = buildNativePaletteEvidence(await loadNativeImage(corpusPath(entry)))
		const enclosed = evidence.families.filter(({ borderCoverage }) => borderCoverage <= policy.maximumEnclosedBorderCoverage)
		const largest = enclosed.reduce<typeof enclosed[number] | undefined>((best, family) =>
			!best || family.populationFraction > best.populationFraction ? family : best, undefined)
		const mounts = evidence.families.filter((family) =>
			family.borderCoverage >= policy.minimumBorderCoverage &&
			largest !== undefined && family.id !== largest.id &&
			largest.populationFraction >= family.populationFraction * policy.minimumEnclosedPopulationRatio)
		if (mounts.length === 0) {
			console.log(`${entry}\tclean`)
			continue
		}
		firing += 1
		const described = mounts.map((family) =>
			`${rgbToHex(oklabToRGB(family.prototype))}(${(family.populationFraction * 100).toFixed(2)}%,border=${family.borderCoverage.toFixed(3)})`)
		console.log(`${entry}\tMOUNT ${described.join(" ")} enclosed=${rgbToHex(oklabToRGB(largest!.prototype))}(pop=${(largest!.populationFraction * 100).toFixed(2)}% conc=${largest!.familyConcentration.toFixed(3)} edge=${largest!.edgeDensity.toFixed(4)} quad=${largest!.quadrantCoverage.toFixed(2)}) ratio=${(largest!.populationFraction / mounts[0].populationFraction).toFixed(2)}`)
	} catch (cause) {
		failed += 1
		console.log(`${entry}\tERROR ${cause instanceof Error ? cause.message : String(cause)}`)
	}
	if ((index + 1) % 25 === 0) console.error(`  ${index + 1}/${cases.length}`)
}
console.log(`\n${firing} of ${cases.length} artworks fire the mount rule (${failed} unreadable).`)
