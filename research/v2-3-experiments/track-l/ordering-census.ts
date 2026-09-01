/**
 * Census of the best-region-versus-family disagreement in identity-obligation ordering.
 *
 * `buildIdentityObligationSelection` ranks by
 *   primary   evidenceLevel(bestConnectedRegion.signatureAccent.score)   <- ONE region, accent-flavoured
 *   secondary evidenceLevel(signatureRoleScore(family))                  <- the whole family
 *   tertiary  connectedPopulationFraction, then family id
 *
 * The secondary key is only ever consulted inside a primary tie, so wherever the two keys
 * disagree ACROSS levels the family-level measure is silent. This reports, per artwork, every
 * adjacent obligation pair the two keys order differently — which is the population of cases any
 * re-ordering rule would move, and therefore the blast radius before a single line is changed.
 *
 * usage: ordering-census.ts [caseFilter]
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, DEFAULT_PALETTE_EXTRACTION_OPTIONS } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS } from "../../v2-3/src/internal/policy.ts"
import cases from "./cases.json" with { type: "json" }

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"
const resolution = ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS.evidence
const level = (value: number): number => Math.floor((value + 1e-12) / resolution)
const clamp = (value: number): number => value < 0 ? 0 : value > 1 ? 1 : value
const filter = process.argv[2] ?? null

let artworks = 0
let disagreeing = 0
let inversions = 0
for (const caseFile of cases as string[]) {
	if (filter && !caseFile.includes(filter)) continue
	const image = await loadNativeImage(`${ROOT}/${caseFile}`)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(
		buildPaletteSeedDomain(image, DEFAULT_PALETTE_EXTRACTION_OPTIONS))
	const byId = new Map(common.evidence.augmentedNative.families.map((f) => [f.id, f]))
	const rows = common.seedAvailability.identityObligations.map((obligation) => {
		const family = byId.get(obligation.familyId)!
		const connected = family.components
			.filter(({ population, retainedFor }) => population > 1 && retainedFor.includes("role-observation"))
			.sort((a, b) =>
				b.observation.signatureAccent.score - a.observation.signatureAccent.score ||
				b.population - a.population || a.startPixelIndex - b.startPixelIndex)
		const region = connected[0]?.observation.signatureAccent.score ?? 0
		const familyScore = clamp(0.55 * family.signatureScore + 0.45 * family.signatureAccentObservation)
		return {
			priority: obligation.priority,
			id: obligation.familyId,
			chroma: family.chroma,
			region,
			regionLevel: level(region),
			familyScore,
			familyLevel: level(familyScore),
		}
	})
	artworks += 1
	// adjacent pairs the two keys order differently
	const flips = rows.slice(1).map((row, index) => ({ high: rows[index], low: row }))
		.filter(({ high, low }) => low.familyLevel > high.familyLevel)
	if (flips.length === 0) continue
	disagreeing += 1
	inversions += flips.length
	console.log(`\n${caseFile}`)
	for (const row of rows) {
		console.log(`  p${row.priority} ${row.id.padEnd(13)} C=${row.chroma.toFixed(3)} ` +
			`region ${row.region.toFixed(4)} lvl ${String(row.regionLevel).padStart(2)} | ` +
			`family ${row.familyScore.toFixed(4)} lvl ${String(row.familyLevel).padStart(2)}` +
			`${flips.some(({ low }) => low.id === row.id) ? "   <- family-level outranks the slot above it" : ""}`)
	}
}
console.log(`\n${disagreeing} of ${artworks} artworks carry at least one adjacent inversion (${inversions} inversions total)`)
