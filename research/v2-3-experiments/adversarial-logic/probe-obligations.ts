/**
 * Fifth adversarial probe: obligation-slot occupancy. The identity-obligation
 * shortlist is capped at 4 (+1 reserved major family). Measure how many
 * candidates compete for those slots and how many winning slots go to families
 * too near-neutral to ever earn identity authority.
 */
import { readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain } from "../../v2-3/src/internal/palette-core.ts"
import { ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY } from "../../v2-3/src/internal/base-scoring.ts"
import { ALBUM_ARTWORK_PALETTE_V2_POLICY } from "../../v2-3/src/internal/policy.ts"

const IMAGES = join(process.cwd(), "images")
const OUT = join(process.cwd(), "research/v2-3-experiments/adversarial-logic")
const CHROMA_FLOOR = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.identityDirectionChroma

const files = readdirSync(IMAGES).filter((f) => /\.(jpg|jpeg|png|avif|webp)$/iu.test(f)).sort()
const results: any[] = []
for (const file of files) {
	const image = await loadNativeImage(join(IMAGES, file))
	const seed = buildPaletteSeedDomain(image)
	const byId = new Map(seed.evidence.families.map((f) => [f.id, f]))
	const signatureLane = seed.evidence.lanes.find((l) => l.name === "signature")?.familyIds ?? []
	const obligations = seed.identityObligations.map((o) => {
		const f = byId.get(o.familyId)!
		return {
			familyId: o.familyId, priority: o.priority,
			chroma: +f.chroma.toFixed(4),
			populationFraction: +f.populationFraction.toFixed(4),
			nearNeutral: f.chroma < CHROMA_FLOOR,
			markSupport: +f.markSupport.toFixed(3),
		}
	})
	const row = {
		image: file,
		signatureLaneSize: signatureLane.length,
		obligationCap: ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.identityObligations,
		obligations: obligations.length,
		nearNeutralObligations: obligations.filter((o) => o.nearNeutral).length,
		chromaticObligations: obligations.filter((o) => !o.nearNeutral).length,
		chromaFloor: CHROMA_FLOOR,
		detail: obligations,
	}
	results.push(row)
	console.error(`${file}: lane=${row.signatureLaneSize} obligations=${row.obligations} nearNeutral=${row.nearNeutralObligations} chroma=[${obligations.map((o) => o.chroma).join(",")}]`)
}
writeFileSync(join(OUT, "probe-obligations.json"), JSON.stringify(results, null, "\t"))
