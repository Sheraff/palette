/**
 * Tests the droplet hypothesis geometrically (review-25 on MUSICA AMBIENTE: "maybe what the
 * algorithm is picking up on to yield a Lawn green foreground is the shadow of the many droplets
 * on top of the leaf").
 *
 * Track F's `opticalBlendFamilyIds` absorbs a family when it sits on the CHORD BETWEEN the two
 * dominant field colours — an interior position, small perpendicular offset, no gap in the ramp.
 * A shadow is a different geometry: it is a mixture of ONE field colour with darkness, i.e. a
 * point on the ray from that field colour toward black, which projects OUTSIDE the chord.
 *
 * This prints, for every identity obligation, its position along the field chord and its
 * perpendicular offset, against the policy's own gates — so "the existing statistic cannot see
 * this" is a measurement rather than an assertion.
 *
 *   node ... probe-blend.ts <case-substring>...
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, DEFAULT_PALETTE_EXTRACTION_OPTIONS } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { ALBUM_ARTWORK_PALETTE_V2_POLICY } from "../../v2-3/src/internal/policy.ts"
import { oklabToRGB, rgbToHex, okDistance } from "../../v2-3/src/internal/color.ts"
import { CASES } from "./run.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"
const BLEND = ALBUM_ARTWORK_PALETTE_V2_POLICY.fieldBlend

for (const needle of process.argv.slice(2)) {
	const caseFile = CASES.find((entry) => entry.includes(needle)) ?? needle
	const image = await loadNativeImage(`${ROOT}/${caseFile}`)
	const seed = buildPaletteSeedDomain(image, DEFAULT_PALETTE_EXTRACTION_OPTIONS)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
	const native = common.evidence.augmentedNative as unknown as {
		families: readonly { id: string; prototype: readonly number[]; population: number }[]
		lanes: readonly { name: string; familyIds: readonly string[] }[]
		absorbedFieldFamilyIds: readonly string[]
		pixelCount: number
	}
	const familyById = new Map(native.families.map((family) => [family.id, family]))
	const fieldIds = native.lanes.find(({ name }) => name === "field")?.familyIds ?? []
	const anchors = fieldIds.map((id) => familyById.get(id)!).filter(Boolean)
		.sort((first, second) => second.population - first.population).slice(0, 2)
	const hexOf = (lab: readonly number[]): string => rgbToHex(oklabToRGB(lab as [number, number, number]))

	console.log(`\n=== ${caseFile}`)
	console.log(`field lane: ${fieldIds.length} families; anchors ${anchors.map((a) => `${a.id}(${hexOf(a.prototype)})`).join(" -> ")}`)
	console.log(`absorbed by Track F: [${native.absorbedFieldFamilyIds.join(", ") || "none"}]`)
	if (anchors.length < 2) { console.log("  fewer than two field anchors; blend absorption cannot apply"); continue }
	const [low, high] = anchors[0]!.prototype[0]! <= anchors[1]!.prototype[0]! ? [anchors[0]!, anchors[1]!] : [anchors[1]!, anchors[0]!]
	const chord = [high.prototype[0]! - low.prototype[0]!, high.prototype[1]! - low.prototype[1]!, high.prototype[2]! - low.prototype[2]!] as const
	const chordLength = Math.hypot(...chord)
	console.log(`chord ${hexOf(low.prototype)} -> ${hexOf(high.prototype)}  length ${chordLength.toFixed(4)} ` +
		`(minimumFieldSeparation ${BLEND.minimumFieldSeparation}); interiorMargin ${BLEND.interiorMargin}, maximumRelativeOffset ${BLEND.maximumRelativeOffset}`)
	console.log(`\n  family           hex      pop%    position   relOffset  interior?  onChord?  shadowRayFrac`)
	for (const obligation of common.seedAvailability.identityObligations as readonly { familyId: string }[]) {
		const family = familyById.get(obligation.familyId)
		if (!family) continue
		const delta = [
			family.prototype[0]! - low.prototype[0]!,
			family.prototype[1]! - low.prototype[1]!,
			family.prototype[2]! - low.prototype[2]!,
		] as const
		const position = (delta[0] * chord[0] + delta[1] * chord[1] + delta[2] * chord[2]) / (chordLength * chordLength)
		const projected = [low.prototype[0]! + position * chord[0], low.prototype[1]! + position * chord[1], low.prototype[2]! + position * chord[2]] as const
		const offset = okDistance(family.prototype as [number, number, number], projected as unknown as [number, number, number])
		const interior = position > BLEND.interiorMargin && position < 1 - BLEND.interiorMargin
		const onChord = interior && offset / chordLength <= BLEND.maximumRelativeOffset
		// How well the family is explained as "a field colour scaled toward black" (pure shading):
		// the nearest anchor's chromaticity direction preserved, lightness reduced.
		const shadowFrac = Math.min(...anchors.map((anchor) => {
			const scale = anchor.prototype[0]! === 0 ? 0 : family.prototype[0]! / anchor.prototype[0]!
			const ray = [anchor.prototype[0]! * scale, anchor.prototype[1]! * scale, anchor.prototype[2]! * scale] as const
			return okDistance(family.prototype as [number, number, number], ray as unknown as [number, number, number])
		}))
		console.log(`  ${obligation.familyId.padEnd(16)} ${hexOf(family.prototype)}  ${(100 * family.population / native.pixelCount).toFixed(2).padStart(6)}  ` +
			`${position.toFixed(4).padStart(8)}  ${(offset / chordLength).toFixed(4).padStart(9)}  ${String(interior).padEnd(9)}  ${String(onChord).padEnd(8)}  ${shadowFrac.toFixed(4)}`)
	}
}
