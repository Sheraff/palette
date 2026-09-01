/**
 * Is the gated bonus firing, and how much headroom does it have?
 *
 * Prints, for the calibration anchor's rival accent: whether it passes the mark-component floor,
 * its unbonused `signatureAccentRoleScore`, the multiplier at a given strength, and what the
 * clamp leaves — plus the weighted quality decomposition the bonus can reach.
 *
 * usage: ceiling.ts <image> <accentHex> [strength]
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, DEFAULT_PALETTE_EXTRACTION_OPTIONS, constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../v2-3/src/internal/transition-normalization.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { buildRoleEvidence } from "../../v2-3/src/internal/role-evidence.ts"
import { scorePaletteCandidates } from "../../v2-3/src/internal/winner-scoring.ts"
import { ALBUM_ARTWORK_PALETTE_V2_POLICY } from "../../v2-3/src/internal/policy.ts"
import type { AlbumArtworkPaletteV2Phase3LogicalDescriptor, AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis } from "../../v2-3/src/internal/candidate-domain.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"
const [target, wantHex, strengthArg] = process.argv.slice(2)
const strength = Number(strengthArg ?? 1)
const clamp = (v: number): number => v < 0 ? 0 : v > 1 ? 1 : v
const chromaOf = ([, a, b]: readonly number[]): number => Math.hypot(a, b)
const WEIGHTS: Record<string, number> = {
	fieldFidelity: 0.16, surfaceFidelity: 0.06, artworkIdentity: 0.12, representativeness: 0.12,
	foregroundPath: 0.19, accentFidelity: 0.07, accentPath: 0.10, coherence: 0.09, economy: 0.09,
	sourceSupport: 0, renderedFieldClaim: 0,
}

const image = await loadNativeImage(`${ROOT}/${target}`)
const options = DEFAULT_PALETTE_EXTRACTION_OPTIONS
const common = buildAlbumArtworkPaletteV2Phase3CommonBase(buildPaletteSeedDomain(image, options))
const envelope = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(common.evidence.nativeFieldTransitions)
const normalizedById = new Map(envelope.hypotheses.map((h) => [h.id, h]))
const candidateFields: AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[] = common.fieldHypotheses.map((field) =>
	field.sourceType === "native-field-transition"
		? { ...field, hypothesis: normalizedById.get(field.hypothesis.id) ?? field.hypothesis }
		: field)
const supplementalFields = candidateFields.filter(({ sourceType }) => sourceType !== "native-seed")
const sourceByHypothesisId = new Map(supplementalFields.map(({ sourceType, hypothesis }) => [hypothesis.id, sourceType]))
const supplemental = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
	common.evidence.augmentedNative, supplementalFields.map(({ hypothesis }) => hypothesis), options)
const supplementalDescriptors: AlbumArtworkPaletteV2Phase3LogicalDescriptor[] = supplemental.treatments.map((d) => ({
	sourceType: sourceByHypothesisId.get(d.fieldHypothesis.id)!, ...d,
}))
const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
	[...common.seedAvailability.logicalDescriptors, ...supplementalDescriptors],
	common.seedAvailability.identityObligations)
const allHypotheses = [...common.seedAvailability.fieldHypotheses, ...supplemental.hypotheses.map((hypothesis) => ({
	sourceType: sourceByHypothesisId.get(hypothesis.id)!, hypothesis,
}))].map(({ hypothesis }) => hypothesis)
const roleEvidence = buildRoleEvidence(common.evidence.augmentedNative, allHypotheses,
	common.seedAvailability.identityObligations.map(({ familyId }) => familyId))
const scored = scorePaletteCandidates(
	materialization.materialized.map(({ treatment }) => treatment),
	{ obligations: common.seedAvailability.identityObligations, roleRequirements: roleEvidence.requirements })

const byId = new Map(common.evidence.augmentedNative.families.map((f) => [f.id, f]))
const ranked = [...scored.evaluations].sort((a, b) => b.relationUtility - a.relationUtility)
const winner = ranked.find((e) => e.treatment === (scored.winner as never)) ?? ranked[0]
const w = winner.treatment
const rival = ranked.find((e) => {
	const t = e.treatment
	return t.background.hex === w.background.hex && t.surface.hex === w.surface.hex &&
		t.foreground.hex === w.foreground.hex && t.gradient === w.gradient &&
		t.accent.hex.toLowerCase() === wantHex.toLowerCase()
})
if (!rival) throw new Error("rival not on slate")
const family = byId.get(rival.treatment.familyRoles.accent)!

const floorChroma = ALBUM_ARTWORK_PALETTE_V2_POLICY.identity.neutralObligationChroma
const full = ALBUM_ARTWORK_PALETTE_V2_POLICY.identity.accentVividnessFullChroma
const gate = ALBUM_ARTWORK_PALETTE_V2_POLICY.identity.accentVividnessMarkComponents
const passes = family.markComponentCount >= gate
const multiplier = passes ? 1 + strength * clamp((chromaOf(rival.treatment.accent.oklab) - floorChroma) / (full - floorChroma)) : 1

console.log(`${target}  rival ${wantHex}`)
console.log(`  markComponentCount ${family.markComponentCount} vs floor ${gate}  -> ${passes ? "PASSES" : "blocked"}`)
console.log(`  chroma ${chromaOf(rival.treatment.accent.oklab).toFixed(4)}  multiplier at strength ${strength}: x${multiplier.toFixed(3)}`)
console.log(`  accentFidelity now ${rival.quality.accentFidelity.toFixed(4)}  ceiling 1.0 -> headroom ${(1 - rival.quality.accentFidelity).toFixed(4)}`)
console.log(`  economy        now ${rival.quality.economy.toFixed(4)}         headroom ${(1 - rival.quality.economy).toFixed(4)}`)
console.log(`  artworkIdentity now ${rival.quality.artworkIdentity.toFixed(4)}        headroom ${(1 - rival.quality.artworkIdentity).toFixed(4)}`)

const maxQualityGain =
	WEIGHTS.accentFidelity * (1 - rival.quality.accentFidelity) +
	WEIGHTS.economy * (1 - rival.quality.economy) +
	WEIGHTS.artworkIdentity * (1 - rival.quality.artworkIdentity)
console.log(`\n  ABSOLUTE ceiling if all three accent-bearing axes were driven to 1.0: +${maxQualityGain.toFixed(4)} quality`)
console.log(`  gap to close: rel ${(winner.relationUtility - rival.relationUtility).toFixed(4)} ` +
	`(quality ${(winner.qualityUtility - rival.qualityUtility).toFixed(4)}, identity ${(winner.identityGain - rival.identityGain).toFixed(4)})`)
console.log(`  => ${maxQualityGain >= winner.relationUtility - rival.relationUtility ? "REACHABLE" : "NOT REACHABLE from these axes"}`)
