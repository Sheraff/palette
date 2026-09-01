/**
 * The evidence behind a foreground decision, without touching the runtime.
 *
 * Replays the same pipeline `find-treatment.ts` does and reports, for one artwork:
 *   - the winner and which family holds each role,
 *   - the identity obligation list with priority, prototype colour, population share,
 *   - each obligation's field-conditional `requiredRole` and foreground evidence,
 *   - and whether the family is in `absorbedFieldFamilyIds` — Track F's optical-blend
 *     absorption set, i.e. families the evidence pass judged to be MIXTURES of the two
 *     dominant field colours rather than regions in their own right.
 *
 * That last column is what tests the droplet hypothesis (review-25 on MUSICA AMBIENTE:
 * "maybe what the algorithm is picking up on to yield a Lawn green foreground is the
 * shadow of the many droplets on top of the leaf").
 *
 *   node ... inspect-evidence.ts <case-substring>...
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, DEFAULT_PALETTE_EXTRACTION_OPTIONS } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../v2-3/src/internal/transition-normalization.ts"
import { constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } from "../../v2-3/src/internal/palette-core.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { buildRoleEvidence } from "../../v2-3/src/internal/role-evidence.ts"
import { scorePaletteCandidates } from "../../v2-3/src/internal/winner-scoring.ts"
import { oklabToRGB, rgbToHex, chroma } from "../../v2-3/src/internal/color.ts"
import { CASES } from "./run.ts"
import type { AlbumArtworkPaletteV2Phase3LogicalDescriptor, AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis } from "../../v2-3/src/internal/candidate-domain.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"

for (const needle of process.argv.slice(2)) {
	const caseFile = CASES.find((entry) => entry.includes(needle)) ?? needle
	const image = await loadNativeImage(`${ROOT}/${caseFile}`)
	const options = DEFAULT_PALETTE_EXTRACTION_OPTIONS
	const seed = buildPaletteSeedDomain(image, options)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
	const envelope = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(common.evidence.nativeFieldTransitions)
	const normalizedById = new Map(envelope.hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]))
	const candidateFields: AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[] = common.fieldHypotheses.map((field) =>
		field.sourceType === "native-field-transition"
			? { ...field, hypothesis: normalizedById.get(field.hypothesis.id) ?? field.hypothesis }
			: field)
	const supplementalFields = candidateFields.filter(({ sourceType }) => sourceType !== "native-seed")
	const sourceByHypothesisId = new Map(supplementalFields.map(({ sourceType, hypothesis }) => [hypothesis.id, sourceType]))
	const supplemental = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
		common.evidence.augmentedNative, supplementalFields.map(({ hypothesis }) => hypothesis), options)
	const supplementalDescriptors: AlbumArtworkPaletteV2Phase3LogicalDescriptor[] = supplemental.treatments.map((descriptor) => ({
		sourceType: sourceByHypothesisId.get(descriptor.fieldHypothesis.id)!, ...descriptor,
	}))
	const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
		[...common.seedAvailability.logicalDescriptors, ...supplementalDescriptors],
		common.seedAvailability.identityObligations)
	const roleEvidence = buildRoleEvidence(
		common.evidence.augmentedNative,
		[...common.seedAvailability.fieldHypotheses, ...supplemental.hypotheses.map((hypothesis) => ({
			sourceType: sourceByHypothesisId.get(hypothesis.id)!, hypothesis,
		}))].map(({ hypothesis }) => hypothesis),
		common.seedAvailability.identityObligations.map(({ familyId }) => familyId))
	const scored = scorePaletteCandidates(
		materialization.materialized.map(({ treatment }) => treatment),
		{ obligations: common.seedAvailability.identityObligations, roleRequirements: roleEvidence.requirements })

	const native = common.evidence.augmentedNative as unknown as {
		families: readonly { id: string; prototype: readonly number[]; population: number }[]
		absorbedFieldFamilyIds: readonly string[]
		pixelCount: number
	}
	const absorbed = new Set(native.absorbedFieldFamilyIds)
	const familyById = new Map(native.families.map((family) => [family.id, family]))
	const winner = scored.winner as unknown as {
		background: { hex: string }; surface: { hex: string }; foreground: { hex: string }; accent: { hex: string }
		familyRoles: Record<string, string>; sourceFieldHypothesisId: string; gradient: boolean
	}
	const roleOf = (familyId: string): string =>
		Object.entries(winner.familyRoles).filter(([, id]) => id === familyId).map(([role]) => role).join(",") || "-"

	console.log(`\n=== ${caseFile} (${image.width}x${image.height})`)
	console.log(`winner: ${winner.background.hex} ${winner.surface.hex} ${winner.foreground.hex} ${winner.accent.hex} ${winner.gradient ? "grad" : "flat"}`)
	console.log(`absorbedFieldFamilyIds (Track F optical blend): ${native.absorbedFieldFamilyIds.length} families`)
	console.log(`\n  pri  family           hex      chroma   pop%    requiredRole  fgEv   role@winner  BLEND-ABSORBED`)
	for (const obligation of common.seedAvailability.identityObligations as readonly { familyId: string; priority: number }[]) {
		const family = familyById.get(obligation.familyId)
		const requirement = roleEvidence.requirements.find((entry) =>
			entry.familyId === obligation.familyId && entry.fieldHypothesisId === winner.sourceFieldHypothesisId)
		const hex = family ? rgbToHex(oklabToRGB(family.prototype as [number, number, number])) : "?"
		const pop = family ? (100 * family.population / native.pixelCount).toFixed(2) : "?"
		const chr = family ? chroma(family.prototype as [number, number, number]).toFixed(4) : "?"
		console.log(`  p${String(obligation.priority).padEnd(3)} ${obligation.familyId.padEnd(16)} ${hex}  ${chr}  ${pop.padStart(6)}  ` +
			`${(requirement?.requiredRole ?? "?").padEnd(12)}  ${(requirement?.foregroundEvidence ?? 0).toFixed(3)}  ` +
			`${roleOf(obligation.familyId).padEnd(11)}  ${absorbed.has(obligation.familyId) ? "*** YES ***" : "no"}`)
	}
	// Any absorbed family that is NOT an obligation is listed too, for context.
	const obligationIds = new Set((common.seedAvailability.identityObligations as readonly { familyId: string }[]).map(({ familyId }) => familyId))
	const others = native.absorbedFieldFamilyIds.filter((id) => !obligationIds.has(id))
	if (others.length > 0) {
		console.log(`\n  absorbed but not an obligation: ${others.map((id) => {
			const family = familyById.get(id)
			return `${id}${family ? `(${rgbToHex(oklabToRGB(family.prototype as [number, number, number]))})` : ""}`
		}).join(" ")}`)
	}
}
