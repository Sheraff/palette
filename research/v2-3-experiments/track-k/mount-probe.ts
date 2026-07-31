/**
 * Track K measurement: for every field-lane family, the quantities a mount rule
 * would read — border coverage, population, concentration, field score — so the
 * separation between "the frame is the ground" and "the frame is a mount around
 * a larger enclosed field" can be read off directly.
 *
 *   PALETTE_IMAGES_ROOT=/Users/Flo/GitHub/palette/images \
 *   node --experimental-strip-types research/v2-3-experiments/track-k/mount-probe.ts <case> [case ...]
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildNativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"
import { oklabToRGB, rgbToHex } from "../../v2-3/src/internal/color.ts"
import { corpusPath } from "../../v2-3/test/corpus.ts"

console.log(["case", "family", "hex", "pop%", "borderCov", "conc", "quadCov", "edgeDens", "fieldScore"].join("\t"))

for (const entry of process.argv.slice(2)) {
	const evidence = buildNativePaletteEvidence(await loadNativeImage(corpusPath(entry)))
	const fieldLane = evidence.lanes.find(({ name }) => name === "field")?.familyIds ?? []
	const lane = evidence.families
		.filter(({ id }) => fieldLane.includes(id))
		.sort((left, right) => right.fieldScore - left.fieldScore)
	const label = entry.replace(/^images\//u, "").replace(/\.[a-z]+$/u, "").slice(0, 24)
	for (const family of lane.slice(0, 6)) {
		console.log([
			label,
			family.id.replace("family-", "f"),
			rgbToHex(oklabToRGB(family.prototype)),
			(family.populationFraction * 100).toFixed(2),
			family.borderCoverage.toFixed(4),
			family.familyConcentration.toFixed(3),
			family.quadrantCoverage.toFixed(2),
			family.edgeDensity.toFixed(4),
			family.fieldScore.toFixed(4),
		].join("\t"))
	}
}
