/**
 * Dump the identity obligations (palette-core's `buildIdentityObligationSelection`)
 * with the ordering key that sets their priority, alongside each family's
 * foreground-flavoured region evidence — so an accent-flavoured ordering key can
 * be compared against the foreground evidence it is being used to rank.
 *
 * usage: inspect-obligations.ts <image...>
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, DEFAULT_PALETTE_EXTRACTION_OPTIONS } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS } from "../../v2-3/src/internal/policy.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"
const resolution = ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS.evidence
const level = (value: number) => Math.floor((value + 1e-12) / resolution)

for (const target of process.argv.slice(2)) {
	const image = await loadNativeImage(`${ROOT}/${target}`)
	const seed = buildPaletteSeedDomain(image, DEFAULT_PALETTE_EXTRACTION_OPTIONS)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
	const families = new Map(common.evidence.augmentedNative.families.map((f) => [f.id, f]))
	console.log(`\n=== ${target}   (evidence resolution ${resolution})`)
	console.log("prio family        popFrac | bestSigAccent lvl | bestFgTypo lvl | fgTypoObs sigAccObs | mark")
	for (const o of common.seedAvailability.identityObligations) {
		const family = families.get(o.familyId)!
		const connected = family.components
			.filter(({ population, retainedFor }) => population > 1 && retainedFor.includes("role-observation"))
			.sort((a, b) =>
				b.observation.signatureAccent.score - a.observation.signatureAccent.score ||
				b.population - a.population ||
				a.startPixelIndex - b.startPixelIndex)
		const bestSig = connected[0]?.observation.signatureAccent.score ?? 0
		const bestFg = Math.max(0, ...connected.map(({ observation }) => observation.foregroundTypography.score))
		console.log(
			`p${o.priority}   ${o.familyId.padEnd(13)} ${(family.populationFraction * 100).toFixed(2).padStart(6)}% | ` +
			`${bestSig.toFixed(4)} ${String(level(bestSig)).padStart(3)} | ${bestFg.toFixed(4)} ${String(level(bestFg)).padStart(3)} | ` +
			`${family.foregroundTypographyObservation.toFixed(3)} ${family.signatureAccentObservation.toFixed(3)} | ${family.markSupport.toFixed(3)}`)
	}
}
