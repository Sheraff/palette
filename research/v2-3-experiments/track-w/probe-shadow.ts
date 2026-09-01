/**
 * Corpus distribution of the SHADING statistic, for the next arm to size its threshold from.
 *
 * `shadowRayFrac` = OKLab distance from a family's prototype to the nearest "field colour scaled
 * toward black" ray. Near zero means the family is a shading variant of a field colour — a shadow,
 * a fold, the dark side of a droplet — rather than an independent region.
 *
 * This is NOT Track F's `opticalBlendFamilyIds`, which absorbs mixtures BETWEEN two dominant
 * fields and is structurally inapplicable to a shading case (an extrapolation past the chord end,
 * and gated behind `minimumFieldSeparation` which a single-hue artwork never reaches).
 *
 * Emits one row per identity obligation so a threshold can be taken from the distribution rather
 * than from the two artworks that motivated it (charter discipline; the mistake Track T's lettering
 * arm made twice).
 *
 *   node ... probe-shadow.ts <shard> <shardCount>
 */
import { mkdirSync, writeFileSync } from "node:fs"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, DEFAULT_PALETTE_EXTRACTION_OPTIONS } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { oklabToRGB, rgbToHex, okDistance } from "../../v2-3/src/internal/color.ts"
import { CASES, keyOf } from "./run.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"
const shard = Number(process.argv[2] ?? 0)
const shardCount = Number(process.argv[3] ?? 1)
const outDir = `${import.meta.dirname}/data/shadow`
mkdirSync(outDir, { recursive: true })

for (const [index, caseFile] of CASES.entries()) {
	if (index % shardCount !== shard) continue
	if (caseFile.includes("-scrambled")) continue
	const image = await loadNativeImage(`${ROOT}/${caseFile}`)
	const seed = buildPaletteSeedDomain(image, DEFAULT_PALETTE_EXTRACTION_OPTIONS)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
	const native = common.evidence.augmentedNative as unknown as {
		families: readonly { id: string; prototype: readonly number[]; population: number }[]
		lanes: readonly { name: string; familyIds: readonly string[] }[]
		pixelCount: number
	}
	const familyById = new Map(native.families.map((family) => [family.id, family]))
	const fieldIds = native.lanes.find(({ name }) => name === "field")?.familyIds ?? []
	const anchors = fieldIds.map((id) => familyById.get(id)!).filter(Boolean)
		.sort((first, second) => second.population - first.population).slice(0, 2)
	const rows: unknown[] = []
	for (const obligation of common.seedAvailability.identityObligations as readonly { familyId: string; priority: number }[]) {
		const family = familyById.get(obligation.familyId)
		if (!family || anchors.length === 0) continue
		const shadowRayFrac = Math.min(...anchors.map((anchor) => {
			const scale = anchor.prototype[0]! === 0 ? 0 : family.prototype[0]! / anchor.prototype[0]!
			const ray = [anchor.prototype[0]! * scale, anchor.prototype[1]! * scale, anchor.prototype[2]! * scale] as const
			return okDistance(family.prototype as [number, number, number], ray as unknown as [number, number, number])
		}))
		rows.push({
			case: caseFile,
			familyId: obligation.familyId,
			priority: obligation.priority,
			hex: rgbToHex(oklabToRGB(family.prototype as [number, number, number])),
			populationFraction: family.population / native.pixelCount,
			shadowRayFrac,
		})
	}
	writeFileSync(`${outDir}/${keyOf(caseFile)}.json`, `${JSON.stringify(rows)}\n`)
	console.log(`[${shard}] ${caseFile} ${rows.length} obligations`)
}
