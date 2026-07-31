/**
 * Sixth adversarial probe (cheap: native evidence only). Charter rule 4 says a
 * source-snapped colour needs a minimum representativity. `band-representative.ts`
 * encodes that standard (neighbourhood population >= 4 and share >= 0.02) but is
 * used only for the field midpoint. Measure how many family representatives that
 * the palette can actually select would fail that same standard.
 */
import { readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildNativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"
import { ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BAND_REPRESENTATIVE_POLICY as BAND } from "../../v2-3/src/internal/band-representative.ts"

const IMAGES = join(process.cwd(), "images")
const OUT = join(process.cwd(), "research/v2-3-experiments/adversarial-logic")

const files = readdirSync(IMAGES).filter((f) => /\.(jpg|jpeg|png|avif|webp)$/iu.test(f)).sort()
const results: any[] = []
for (const file of files) {
	const image = await loadNativeImage(join(IMAGES, file))
	const evidence = buildNativePaletteEvidence(image)
	const laneIds = new Set(evidence.lanes.flatMap((l) => l.familyIds))
	let total = 0
	let belowShare = 0
	let belowPopulation = 0
	const byStrategy: Record<string, { n: number; belowShare: number; minDensity: number }> = {}
	for (const family of evidence.families) {
		if (!laneIds.has(family.id)) continue
		for (const rep of family.representatives) {
			if ("generated" in rep.support) continue
			total += 1
			const density = rep.support.perceptualDensity
			const localPopulation = density * family.population
			const s = byStrategy[rep.strategy] ?? { n: 0, belowShare: 0, minDensity: 1 }
			s.n += 1
			if (density < BAND.minimumNeighborhoodShare) { s.belowShare += 1; belowShare += 1 }
			if (localPopulation < BAND.minimumNeighborhoodPopulation) belowPopulation += 1
			s.minDensity = Math.min(s.minDensity, density)
			byStrategy[rep.strategy] = s
		}
	}
	const row = { image: file, laneFamilies: laneIds.size, representatives: total, belowShare, belowPopulation, byStrategy }
	results.push(row)
	console.error(`${file}: reps=${total} belowShare=${belowShare} belowPop=${belowPopulation} ${JSON.stringify(byStrategy)}`)
}
writeFileSync(join(OUT, "probe-representativity.json"), JSON.stringify(results, null, "\t"))
