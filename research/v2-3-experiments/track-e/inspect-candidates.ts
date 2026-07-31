import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../v2-3/src/internal/transition-normalization.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { buildRoleEvidence } from "../../v2-3/src/internal/role-evidence.ts"
import { scorePaletteCandidates, WINNER_QUALITY_AXES, WINNER_SCORING_POLICY } from "../../v2-3/src/internal/winner-scoring.ts"

const target = process.argv[2]
const wantRole = process.argv[3] ?? "accent"
const wantFamily = process.argv[4] ?? null

const image = await loadNativeImage(target)
const seed = buildPaletteSeedDomain(image)
const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
const transitionEnvelope = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(common.evidence.nativeFieldTransitions)
const normalizedTransitionById = new Map(transitionEnvelope.hypotheses.map((h) => [h.id, h]))
const candidateFields = common.fieldHypotheses.map((field) =>
	field.sourceType === "native-field-transition"
		? { ...field, hypothesis: normalizedTransitionById.get(field.hypothesis.id) ?? field.hypothesis }
		: field)
const supplementalFields = candidateFields.filter(({ sourceType }) => sourceType !== "native-seed")
const sourceByHypothesisId = new Map(supplementalFields.map(({ sourceType, hypothesis }) => [hypothesis.id, sourceType]))
const supplemental = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
	common.evidence.augmentedNative,
	supplementalFields.map(({ hypothesis }) => hypothesis))
const sourcedFields = [
	...common.seedAvailability.fieldHypotheses,
	...supplemental.hypotheses.map((hypothesis) => ({ sourceType: sourceByHypothesisId.get(hypothesis.id)!, hypothesis })),
]
const supplementalDescriptors = supplemental.treatments.map((descriptor) => ({
	sourceType: sourceByHypothesisId.get(descriptor.fieldHypothesis.id)!,
	...descriptor,
}))
const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
	[...common.seedAvailability.logicalDescriptors, ...supplementalDescriptors] as never,
	common.seedAvailability.identityObligations)
const roleEvidence = buildRoleEvidence(
	common.evidence.augmentedNative,
	sourcedFields.map(({ hypothesis }) => hypothesis),
	common.seedAvailability.identityObligations.map(({ familyId }) => familyId))
const scored = scorePaletteCandidates(
	materialization.materialized.map(({ treatment }) => treatment),
	{ obligations: common.seedAvailability.identityObligations, roleRequirements: roleEvidence.requirements })

console.log(`candidates: ${scored.evaluations.length}`)
const w = WINNER_SCORING_POLICY.qualityWeights
function row(e: (typeof scored.evaluations)[number]): string {
	const t = e.treatment
	return [
		`${t.background.hex} ${t.surface.hex} ${t.foreground.hex} ${t.accent.hex}`,
		t.gradient ? "grad" : "flat",
		`famA=${t.familyRoles.accent}`,
		`famF=${t.familyRoles.foreground}`,
		e.qualityUtility.toFixed(4),
		e.relationUtility.toFixed(4),
		WINNER_QUALITY_AXES.map((a) => e.quality[a].toFixed(2)).join(" "),
	].join("  ")
}

const sorted = [...scored.evaluations].sort((a, b) => b.relationUtility - a.relationUtility)
console.log("axes:", WINNER_QUALITY_AXES.join(" "))
console.log("weights:", WINNER_QUALITY_AXES.map((a) => w[a]).join(" "))
console.log("\n--- top 8 by relationUtility ---")
for (const e of sorted.slice(0, 8)) console.log(row(e))
import { completeTreatmentKey } from "../../v2-3/src/internal/palette-core.ts"
const winnerKey = completeTreatmentKey(scored.winner)
const winnerEval = scored.evaluations.find((e) => e.key === winnerKey)!
console.log(`\nSCORED winner (rank ${sorted.indexOf(winnerEval)}): ${row(winnerEval)}`)

if (wantFamily) {
	const matches = sorted.filter((e) => (e.treatment.familyRoles as Record<string, string>)[wantRole] === wantFamily)
	console.log(`\n--- ${matches.length} candidates with ${wantRole} family ${wantFamily} (top 6) ---`)
	for (const e of matches.slice(0, 6)) console.log(`rank=${sorted.indexOf(e)}  ${row(e)}`)
}
