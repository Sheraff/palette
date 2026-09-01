/**
 * Decompose `signatureRoleScore` for named families, so the population-normalised
 * term inside it can be compared against the mark evidence for the same family.
 *
 *   signatureRoleScore = 0.55 * signatureScore + 0.45 * signatureAccentObservation
 *   signatureScore     = 0.25 * coherentSupport + 0.18 * componentCoherence
 *                      + 0.16 * repeatedSupport + 0.22 * distinctive
 *                      + 0.11 * chromatic + 0.08 * notBroad
 *   coherentSupport    = clamp(largestComponentFraction / 0.002)   <- population ratio
 *
 * Three accent quality axes multiply by `signatureRoleScore(accentFamily)`:
 * `accentIdentity` (into artworkIdentity), `accentFidelity` (via
 * distinctAccentFidelity) and `accentEconomy` (into economy).
 *
 * usage: inspect-signature-terms.ts <image> <family-id>...
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, DEFAULT_PALETTE_EXTRACTION_OPTIONS } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"
const [target, ...ids] = process.argv.slice(2)
if (!target || ids.length === 0) throw new Error("usage: inspect-signature-terms.ts <image> <family-id>...")

const clamp = (value: number): number => value < 0 ? 0 : value > 1 ? 1 : value
const image = await loadNativeImage(`${ROOT}/${target}`)
const common = buildAlbumArtworkPaletteV2Phase3CommonBase(
	buildPaletteSeedDomain(image, DEFAULT_PALETTE_EXTRACTION_OPTIONS))
const evidence = common.evidence.augmentedNative
const byId = new Map(evidence.families.map((f) => [f.id, f]))

console.log(`\n=== ${target}`)
console.log("family        pop%    largestCompFrac coherentSupp  markSupport | sigScore sigAccObs sigRole | sigRole if mark substituted")
for (const id of ids) {
	const family = byId.get(id)
	if (!family) { console.log(`${id}: not found`); continue }
	const coherentSupport = clamp(family.largestComponentFraction / 0.002)
	const signatureRole = clamp(0.55 * family.signatureScore + 0.45 * family.signatureAccentObservation)
	// substituting mark evidence for the population term moves signatureScore by
	// 0.25 * (max(coherent, mark) - coherent), and signatureRoleScore by 0.55 of that
	const substituted = clamp(0.55 * clamp(family.signatureScore +
		0.25 * (Math.max(coherentSupport, family.markSupport) - coherentSupport)) +
		0.45 * family.signatureAccentObservation)
	console.log(
		`${id.padEnd(13)} ${(family.populationFraction * 100).toFixed(3).padStart(6)}% ` +
		`${family.largestComponentFraction.toFixed(6).padStart(15)} ${coherentSupport.toFixed(4).padStart(12)} ` +
		`${family.markSupport.toFixed(4).padStart(12)} | ${family.signatureScore.toFixed(4)} ` +
		`${family.signatureAccentObservation.toFixed(4)}    ${signatureRole.toFixed(4)} | ${substituted.toFixed(4)} ` +
		`(${substituted > signatureRole ? "+" : ""}${(substituted - signatureRole).toFixed(4)})`)
}
