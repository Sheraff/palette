/**
 * Third adversarial probe: is the all-ranked-lane proposal pass (the second full
 * field-domain + gradient-fit computation inside buildPaletteSeedDomain) ever
 * load-bearing? Plus emergency-band reachability and winning hypothesis source.
 */
import { readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain } from "../../v2-3/src/internal/palette-core.ts"

const IMAGES = join(process.cwd(), "images")
const OUT = join(process.cwd(), "research/v2-3-experiments/adversarial-logic")

const files = readdirSync(IMAGES).filter((f) => /\.(jpg|jpeg|png|avif|webp)$/iu.test(f)).sort()
const results: any[] = []
for (const file of files) {
	const image = await loadNativeImage(join(IMAGES, file))
	const seed = buildPaletteSeedDomain(image)
	const registry = seed.registry
	const controlIds = new Set(registry.fieldHypotheses.filter((h) => h.controlProposed).map((h) => h.hypothesisId))
	const nonControl = registry.fieldHypotheses.filter((h) => !h.controlProposed)
	const usedHypothesisIds = new Set(seed.completeTreatments.map((t) => t.sourceFieldHypothesisId))
	const nonControlUsed = nonControl.filter((h) => usedHypothesisIds.has(h.hypothesisId))
	// A field-direction row is only load-bearing when it is the sole source of a key a
	// used treatment needs; check whether any row would lose a needed hypothesis id if
	// non-control proposals were removed.
	const directionsNeedingNonControl = registry.fieldDirections.filter((d) =>
		d.hypothesisIds.some((id) => usedHypothesisIds.has(id) && !controlIds.has(id)))
	results.push({
		image: file,
		registryHypotheses: registry.fieldHypotheses.length,
		controlProposed: registry.fieldHypotheses.filter((h) => h.controlProposed).length,
		nonControlProposed: nonControl.length,
		nonControlUsedByAnyTreatment: nonControlUsed.length,
		directionsNeedingNonControl: directionsNeedingNonControl.length,
		fieldDirections: registry.fieldDirections.length,
		emergencyEligible: seed.emergency.eligible,
		emergencyReason: seed.emergency.reason,
		emergencyMaxLc: seed.emergency.maximumSupportedAbsoluteLc,
		seedTreatments: seed.completeTreatments.length,
		additions: seed.additions.length,
		hypothesisKinds: (() => {
			const h: Record<string, number> = {}
			for (const t of seed.completeTreatments) {
				const k = t.sourceFieldHypothesisId.split(":")[0]
				h[k] = (h[k] ?? 0) + 1
			}
			return h
		})(),
	})
	const r = results.at(-1)!
	console.error(`${file}: registry=${r.registryHypotheses} nonControl=${r.nonControlProposed} nonControlUsed=${r.nonControlUsedByAnyTreatment} dirNeedNonControl=${r.directionsNeedingNonControl} emergency=${r.emergencyEligible}/${r.emergencyReason} additions=${r.additions}`)
}
writeFileSync(join(OUT, "probe-registry.json"), JSON.stringify(results, null, "\t"))
