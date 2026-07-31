/**
 * Traces the transition-promotion stage for one image: the source-eligible
 * incumbent, every promotion-eligible transition candidate with all of its
 * comparator fields, and the candidate the comparator selects.
 *
 * Mirrors `research/v2-3/src/internal/palette.ts:selectWinner` up to the
 * promotion sort. Experiment harness; intentionally outside `research/v2-3`.
 *
 * Usage: node research/v2-3-experiments/track-a/transition-trace.ts <case.jpg> [--top 12]
 */

import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, constructAlbumArtworkPaletteV2Phase3SupplementalTreatments, completeTreatmentKey } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../v2-3/src/internal/transition-normalization.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { promotionEnvelopeUtility, scorePaletteCandidates } from "../../v2-3/src/internal/winner-scoring.ts"
import { selectSourceEligibleWinner } from "../../v2-3/src/internal/winner-selection.ts"
import { evaluateTransitionCandidates, MAXIMUM_WINNER_QUALITY_LOSS } from "../../v2-3/src/internal/transition-promotion.ts"
import { buildRoleEvidence } from "../../v2-3/src/internal/role-evidence.ts"

import type { MaterializedCandidate } from "../../v2-3/src/internal/transition-promotion.ts"
import type { AlbumArtworkPaletteV2Phase3LogicalDescriptor, AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis } from "../../v2-3/src/internal/candidate-domain.ts"

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url))
const imagesRoot = process.env.PALETTE_IMAGES_ROOT ?? resolve(repoRoot, "images")

const [caseId, ...rest] = process.argv.slice(2)
if (!caseId) throw new Error("usage: transition-trace.ts <case.jpg>")
const topIndex = rest.indexOf("--top")
const top = Number(topIndex >= 0 ? rest[topIndex + 1] : 12)

const image = await loadNativeImage(new Uint8Array(await readFile(resolve(imagesRoot, caseId))))
const seed = buildPaletteSeedDomain(image)
const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
const envelope = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(common.evidence.nativeFieldTransitions)
const normalized = new Map(envelope.hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]))
const fields: AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[] = common.fieldHypotheses.map((field) =>
	field.sourceType === "native-field-transition"
		? { ...field, hypothesis: normalized.get(field.hypothesis.id) ?? field.hypothesis }
		: field)
const supplementalFields = fields.filter(({ sourceType }) => sourceType !== "native-seed")
const sourceById = new Map(supplementalFields.map(({ sourceType, hypothesis }) => [hypothesis.id, sourceType]))
const supplemental = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
	common.evidence.augmentedNative,
	supplementalFields.map(({ hypothesis }) => hypothesis),
)
const descriptors: AlbumArtworkPaletteV2Phase3LogicalDescriptor[] = supplemental.treatments.map((descriptor) => ({
	sourceType: sourceById.get(descriptor.fieldHypothesis.id)!,
	...descriptor,
}))
const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
	[...common.seedAvailability.logicalDescriptors, ...descriptors],
	common.seedAvailability.identityObligations,
)
const roleEvidence = buildRoleEvidence(
	common.evidence.augmentedNative,
	fields.map(({ hypothesis }) => hypothesis),
	common.seedAvailability.identityObligations.map(({ familyId }) => familyId),
)
const scored = scorePaletteCandidates(
	materialization.materialized.map(({ treatment }) => treatment),
	{
		obligations: common.seedAvailability.identityObligations,
		roleRequirements: roleEvidence.requirements,
	},
)
const materialized: MaterializedCandidate[] = materialization.materialized.map((candidate) => ({
	key: candidate.key,
	treatment: candidate.treatment,
	descriptors: candidate.descriptors as readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[],
}))
const sourceEligible = selectSourceEligibleWinner({
	materialized,
	identityObligations: common.seedAvailability.identityObligations,
	emergency: seed.emergency,
	fullDomainSelection: scored,
})
const incumbentKey = completeTreatmentKey(sourceEligible.winner.treatment)
const unrestrictedKey = completeTreatmentKey(scored.winner)
const evaluations = new Map(scored.evaluations.map((evaluation) => [evaluation.key, evaluation]))
const unrestricted = evaluations.get(unrestrictedKey)!

console.log(`unrestricted winner : ${unrestrictedKey}  qu=${unrestricted.qualityUtility.toFixed(4)}`)
console.log(`source-eligible     : ${incumbentKey}  qu=${evaluations.get(incumbentKey)!.qualityUtility.toFixed(4)}`)
console.log(`quality envelope    : qu >= ${(unrestricted.qualityUtility - MAXIMUM_WINNER_QUALITY_LOSS).toFixed(4)}`)

const candidates = evaluateTransitionCandidates(
	{ ...scored, winner: sourceEligible.winner.treatment },
	materialized,
	roleEvidence.obligations,
	envelope.creditedHypothesisIds,
)
const eligible = candidates
	.filter(({ promotionEligible, earnedNativeTransition }) => promotionEligible && earnedNativeTransition)
	.map((candidate) => ({ candidate, evaluation: evaluations.get(candidate.key)! }))
	.filter(({ evaluation }) => promotionEnvelopeUtility(evaluation) + 1e-12 >=
		promotionEnvelopeUtility(unrestricted) - MAXIMUM_WINNER_QUALITY_LOSS)
	.sort((first, second) =>
		second.candidate.decisiveCoverage - first.candidate.decisiveCoverage ||
		second.candidate.totalObligationCoverage - first.candidate.totalObligationCoverage ||
		second.candidate.existingFamilyIdentity - first.candidate.existingFamilyIdentity ||
		second.candidate.roleEvidence - first.candidate.roleEvidence ||
		second.candidate.baseQualityUtility - first.candidate.baseQualityUtility ||
		(first.evaluation.key < second.evaluation.key ? -1 : first.evaluation.key > second.evaluation.key ? 1 : 0))

console.log(`\npromotion-eligible earned transitions: ${eligible.length} (of ${candidates.length} evaluated)`)
console.log("rank  decisive total identity roleEv   qualityUtil  key")
for (const { candidate, evaluation } of eligible.slice(0, top)) {
	console.log(`      ${candidate.decisiveCoverage.toString().padStart(8)} ${candidate.totalObligationCoverage.toString().padStart(5)} ${candidate.existingFamilyIdentity.toFixed(3).padStart(8)} ${candidate.roleEvidence.toFixed(3).padStart(6)}   ${candidate.baseQualityUtility.toFixed(4)}    ${evaluation.key}`)
}
if (eligible.length === 0) console.log("      (none - winner stays the source-eligible incumbent)")

const explainIndex = rest.indexOf("--explain")
if (explainIndex >= 0) {
	const wanted = rest[explainIndex + 1]
	const baselineCandidate = candidates.find(({ key }) => key === incumbentKey)!
	console.log(`\nincumbent decisiveCoverage = ${baselineCandidate.decisiveCoverage}`)
	for (const candidate of candidates.filter(({ key }) => key.includes(wanted))) {
		const evaluation = evaluations.get(candidate.key)!
		const envelope = promotionEnvelopeUtility(evaluation)
		const threshold = promotionEnvelopeUtility(unrestricted) - MAXIMUM_WINNER_QUALITY_LOSS
		console.log(`  ${candidate.key}`)
		console.log(`    earnedNativeTransition=${candidate.earnedNativeTransition} promotionEligible=${candidate.promotionEligible}`)
		console.log(`    decisiveCoverage=${candidate.decisiveCoverage} (needs > ${baselineCandidate.decisiveCoverage})  total=${candidate.totalObligationCoverage} identity=${candidate.existingFamilyIdentity.toFixed(3)}`)
		console.log(`    envelopeUtility=${envelope.toFixed(4)} threshold=${threshold.toFixed(4)} pass=${envelope + 1e-12 >= threshold}`)
	}
}
