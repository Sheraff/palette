/**
 * Print the accent's APCA contrast pairs, sample by sample, for the winner and for the best
 * treatment carrying a wanted accent — so `accentPath` can be split into its two factors:
 *
 *   accentPath = sqrt(accentUtility * rolePathFraction)
 *   rolePathFraction = share of samples whose signedLc is finite and NOT exactly zero
 *
 * A rolePathFraction below 1 means the accent sits in APCA's zero-contrast dead zone on part of
 * the rendered field — for a gradient, that is the accent vanishing partway along the ramp,
 * which the charter names as a genuine pathology rather than a scoring artefact.
 *
 * usage: inspect-accent-path.ts <image> --want '#rrggbb'
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, DEFAULT_PALETTE_EXTRACTION_OPTIONS, constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../v2-3/src/internal/transition-normalization.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { buildRoleEvidence } from "../../v2-3/src/internal/role-evidence.ts"
import { scorePaletteCandidates } from "../../v2-3/src/internal/winner-scoring.ts"
import type { AlbumArtworkPaletteV2Phase3LogicalDescriptor, AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis } from "../../v2-3/src/internal/candidate-domain.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"
const target = process.argv[2]
const wantIndex = process.argv.indexOf("--want")
const want = wantIndex > 0 ? process.argv[wantIndex + 1]?.toLowerCase() : null
if (!target) throw new Error("usage: inspect-accent-path.ts <image> --want '#rrggbb'")

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

const report = (label: string, evaluation: typeof scored.evaluations[number]): void => {
	const t = evaluation.treatment
	const pairs = t.contrast.pairs.filter(({ role }) => role === "accent")
	const live = pairs.filter(({ signedLc }) => Number.isFinite(signedLc) && signedLc !== 0)
	const fraction = pairs.length === 0 ? 0 : live.length / pairs.length
	console.log(`\n${label}: ${t.background.hex} ${t.surface.hex} fg=${t.foreground.hex} ac=${t.accent.hex} ${t.gradient ? "grad" : "flat"}`)
	console.log(`  rel=${evaluation.relationUtility.toFixed(4)} qual=${evaluation.qualityUtility.toFixed(4)} accentPath=${evaluation.quality.accentPath.toFixed(4)}`)
	console.log(`  accent pairs (${pairs.length}): ${pairs.map(({ fieldRole, signedLc }) => `${fieldRole}@${signedLc.toFixed(1)}`).join("  ")}`)
	console.log(`  rolePathFraction = ${live.length}/${pairs.length} = ${fraction.toFixed(3)}   => zero-contrast on ${pairs.length - live.length} sample(s)`)
	const accentUtility = fraction === 0 ? 0 : (evaluation.quality.accentPath ** 2) / fraction
	console.log(`  implied accentUtility = accentPath^2 / fraction = ${accentUtility.toFixed(4)}`)
}

const ranked = [...scored.evaluations].sort((a, b) => b.relationUtility - a.relationUtility)
report("winner", ranked.find((e) => e.treatment === (scored.winner as never)) ?? ranked[0])
if (want) {
	const wanted = ranked.filter((e) => e.treatment.accent.hex.toLowerCase() === want)
	if (wanted.length === 0) {
		const near = ranked.filter((e) => e.treatment.accent.hex.toLowerCase().startsWith(want.slice(0, 3)))
		console.log(`\nno treatment with accent exactly ${want}; ${near.length} share its first byte`)
		if (near[0]) report("nearest wanted", near[0])
	} else {
		report("best wanted", wanted[0])
	}
}
