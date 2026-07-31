/**
 * Track H instrument: the identity-obligation shortlist, annotated with each
 * candidate's *foreground polarity* evidence.
 *
 * `buildIdentityObligationSelection` ranks signature-lane families that are not
 * field-owned, dedups by material distance, and then applies the neutral quota
 * (`maximumNeutralObligations` = 2 at `neutralObligationChroma` = 0.06). This
 * reproduces that ranking outside the runtime so the quota's decisions and the
 * per-family `foregroundPolarityObservation` can be read side by side.
 *
 * `polarity` is field-independent: it is the population-weighted mean of each
 * retained region's `boundaryLightnessPolarity`, i.e. the signed lightness step
 * across the region's own boundary. Positive means the region's neighbourhood is
 * *lighter* than the region (dark mark on light ground); negative means the
 * region is the lighter of the pair (light mark on dark ground).
 *
 * usage: inspect-polarity.ts <image...>
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, DEFAULT_PALETTE_EXTRACTION_OPTIONS } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { ALBUM_ARTWORK_PALETTE_V2_POLICY, ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS } from "../../v2-3/src/internal/policy.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"
const resolution = ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS.evidence
const level = (value: number) => Math.floor((value + 1e-12) / resolution)
const NEUTRAL = ALBUM_ARTWORK_PALETTE_V2_POLICY.identity.neutralObligationChroma

for (const target of process.argv.slice(2)) {
	const image = await loadNativeImage(`${ROOT}/${target}`)
	const seed = buildPaletteSeedDomain(image, DEFAULT_PALETTE_EXTRACTION_OPTIONS)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
	const evidence = common.evidence.augmentedNative
	const families = new Map(evidence.families.map((f) => [f.id, f]))
	const signatureIds = evidence.lanes.find(({ name }) => name === "signature")?.familyIds ?? []
	const obligationPriority = new Map(
		common.seedAvailability.identityObligations.map((o) => [o.familyId, o.priority]))

	console.log(`\n=== ${target}`)
	console.log(`neutral chroma < ${NEUTRAL}, max neutral obligations = ${ALBUM_ARTWORK_PALETTE_V2_POLICY.identity.maximumNeutralObligations}`)
	const fieldOwned = signatureIds.filter((id) => {
		const family = families.get(id)!
		const signatureRole = Math.min(1, Math.max(0,
			0.55 * family.signatureScore + 0.45 * family.signatureAccentObservation))
		return level(family.fieldScore) >= level(signatureRole)
	})
	console.log(`field-owned(approx): ${fieldOwned.map((id) => {
		const f = families.get(id)!
		return `${id}@L=${f.prototype[0].toFixed(3)}/C=${f.chroma.toFixed(3)}`
	}).join(" ") || "(none)"}`)
	console.log("prio family        L      C      neu | bestSigAcc lvl | bestFgTypo lvl | polarity conf | fgTypoObs | pop%   comps")
	const rows = signatureIds.map((id) => {
		const family = families.get(id)!
		const connected = family.components
			.filter(({ population, retainedFor }) => population > 1 && retainedFor.includes("role-observation"))
			.sort((a, b) =>
				b.observation.signatureAccent.score - a.observation.signatureAccent.score ||
				b.population - a.population ||
				a.startPixelIndex - b.startPixelIndex)
		const bestSig = connected[0]?.observation.signatureAccent.score ?? 0
		const bestFg = Math.max(0, ...connected.map(({ observation }) => observation.foregroundTypography.score))
		return { family, bestSig, bestFg, connectedCount: connected.length }
	})
	rows.sort((a, b) =>
		level(b.bestSig) - level(a.bestSig) ||
		b.family.populationFraction - a.family.populationFraction)
	for (const { family, bestSig, bestFg, connectedCount } of rows) {
		const priority = obligationPriority.get(family.id)
		const polarity = family.foregroundPolarityObservation
		console.log(
			`${priority === undefined ? " . " : `p${priority} `}  ${family.id.padEnd(13)} ` +
			`${family.prototype[0].toFixed(3)} ${family.chroma.toFixed(3)} ${family.chroma < NEUTRAL ? "NEU" : "   "} | ` +
			`${bestSig.toFixed(4)} ${String(level(bestSig)).padStart(3)} | ${bestFg.toFixed(4)} ${String(level(bestFg)).padStart(3)} | ` +
			`${polarity.polarity.toFixed(3).padStart(6)} ${polarity.confidence.toFixed(3)} claim=${(Math.max(-1, Math.min(1, polarity.polarity)) * Math.min(1, Math.max(0, polarity.confidence))).toFixed(9).padStart(12)} | ` +
			`${family.foregroundTypographyObservation.toFixed(3)} | ${(family.populationFraction * 100).toFixed(2).padStart(5)}% ${String(connectedCount).padStart(4)}`)
	}
}
