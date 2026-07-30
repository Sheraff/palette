import { completeTreatmentKey, constructAlbumArtworkPaletteV2Phase3SupplementalTreatments, buildPaletteSeedDomain } from "./palette-core.ts";

import type { CompletePaletteTreatment, EmergencyEligibility, IdentityObligation } from "./palette-core.ts";

import { evaluateAlbumArtworkPaletteV2Phase3CompleteLineageDescriptor } from "./source-eligibility.ts";

import type { AlbumArtworkPaletteV2Phase3CompleteLineageCandidateEligibility, AlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain } from "./source-eligibility.ts";

import { evaluateAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath } from "./gradient-support.ts";

import type { AlbumArtworkPaletteV2Phase3ArmSupportedGradientPathResult, AlbumArtworkPaletteV2Phase3SupportedGradientMidpointDescriptor } from "./gradient-support.ts";

import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "./candidate-domain.ts";

import type { AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType, AlbumArtworkPaletteV2Phase3LogicalDescriptor, AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis } from "./candidate-domain.ts";

import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "./candidate-materialization.ts";

import { scorePaletteCandidates } from "./winner-scoring.ts";

import type { WinnerEvaluation, WinnerScoring } from "./winner-scoring.ts";

import type { RoleSpecificIdentityObligation } from "./role-obligations.ts";

import type { AlbumArtworkPaletteV2Phase3IdentityRoleRequirement as IdentityRoleRequirement } from "./base-scoring.ts";

import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "./transition-normalization.ts";

import { buildRoleEvidence } from "./role-evidence.ts";

import { evaluateTransitionCandidates, MAXIMUM_WINNER_QUALITY_LOSS } from "./transition-promotion.ts";

import type { MaterializedCandidate, TransitionCandidate } from "./transition-promotion.ts";

import { selectSourceEligibleWinner } from "./winner-selection.ts";

import type { RawImage } from "./types.ts";

const NO_MIDPOINT = Object.freeze({
	kind: "none" as const,
	position: null,
	color: null,
	provenance: null,
})

type WinnerSelection = Readonly<{
	winner: CompletePaletteTreatment
	transitionPromoted: boolean
	eligibility: AlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain<MaterializedCandidate>
}>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function compareDescending(first: number, second: number): number {
	return second - first
}

function treatmentStructuralKey(treatment: CompletePaletteTreatment): string {
	return [
		completeTreatmentKey(treatment),
		treatment.fieldTreatment,
		treatment.familyRoles.background,
		treatment.familyRoles.surface,
		treatment.familyRoles.foreground,
		treatment.familyRoles.accent,
		treatment.collapse.surface ? "surface-collapsed" : "surface-distinct",
		treatment.collapse.accent ? "accent-collapsed" : "accent-distinct",
		`cardinality-${treatment.cardinality}`,
		treatment.gradient
			? `${treatment.gradientEvidence?.topology ?? "unsupported"}:${treatment.gradientEvidence?.direction ?? "unsupported"}`
			: "flat",
		treatment.sourceFieldHypothesisId,
	].join("\0")
}

function compareTransitionCandidates(
	first: Readonly<{ evaluation: WinnerEvaluation; candidate: TransitionCandidate }>,
	second: Readonly<{ evaluation: WinnerEvaluation; candidate: TransitionCandidate }>,
): number {
	return compareDescending(first.candidate.decisiveCoverage, second.candidate.decisiveCoverage) ||
		compareDescending(first.candidate.totalObligationCoverage, second.candidate.totalObligationCoverage) ||
		compareDescending(first.candidate.existingFamilyIdentity, second.candidate.existingFamilyIdentity) ||
		compareDescending(first.candidate.roleEvidence, second.candidate.roleEvidence) ||
		compareDescending(first.candidate.baseQualityUtility, second.candidate.baseQualityUtility) ||
		compareAscii(first.evaluation.key, second.evaluation.key)
}

function selectWinner(input: Readonly<{
	scored: WinnerScoring
	materialized: readonly MaterializedCandidate[]
	roleObligations: readonly RoleSpecificIdentityObligation[]
	acceptedTransitionHypothesisIds: readonly string[]
	identityObligations: readonly IdentityObligation[]
	identityRoleRequirements: readonly IdentityRoleRequirement[]
	emergency: EmergencyEligibility | null
}>): WinnerSelection {
	const sourceEligible = selectSourceEligibleWinner({
		materialized: input.materialized,
		identityObligations: input.identityObligations,
		identityRoleRequirements: input.identityRoleRequirements,
		emergency: input.emergency,
		fullDomainSelection: input.scored,
	})
	const unrestrictedKey = completeTreatmentKey(input.scored.winner)
	const sourceWinner = sourceEligible.winner.treatment
	const sourceWinnerKey = completeTreatmentKey(sourceWinner)
	const evaluations = new Map(input.scored.evaluations.map((evaluation) => [evaluation.key, evaluation]))
	const unrestrictedEvaluation = evaluations.get(unrestrictedKey)
	const sourceWinnerEvaluation = evaluations.get(sourceWinnerKey)
	if (!unrestrictedEvaluation || !sourceWinnerEvaluation) throw new Error("Winner evaluation is missing")

	const transitionInput = { ...input.scored, winner: sourceWinner }
	const candidates = evaluateTransitionCandidates(
		transitionInput,
		input.materialized,
		input.roleObligations,
		input.acceptedTransitionHypothesisIds,
	)
	const eligibilityByKey = new Map(sourceEligible.eligibility.candidates.map((candidate) =>
		[candidate.key, candidate]))
	const materializedByKey = new Map(input.materialized.map((candidate) => [candidate.key, candidate]))
	const acceptedTransitions = new Set(input.acceptedTransitionHypothesisIds)
	const transitionCandidates = candidates
		.filter(({ promotionEligible, earnedNativeTransition }) => promotionEligible && earnedNativeTransition)
		.filter(({ key }) => {
			const evaluation = evaluations.get(key)
			if (!evaluation) return false
			const selectedStructure = treatmentStructuralKey(evaluation.treatment)
			return materializedByKey.get(key)?.descriptors.some((descriptor) =>
				descriptor.sourceType === "native-field-transition" &&
				acceptedTransitions.has(descriptor.fieldHypothesis.id) &&
				descriptor.fieldHypothesis.gradientEvidence !== null &&
				treatmentStructuralKey(descriptor.treatment) === selectedStructure &&
				evaluateAlbumArtworkPaletteV2Phase3CompleteLineageDescriptor(key, descriptor).ordinaryEligible) === true
		})
		.map((candidate) => ({ candidate, evaluation: evaluations.get(candidate.key)! }))
		.filter(({ evaluation }) => evaluation.qualityUtility + 1e-12 >=
			unrestrictedEvaluation.qualityUtility - MAXIMUM_WINNER_QUALITY_LOSS)
		.sort(compareTransitionCandidates)
	const winnerEvaluation = transitionCandidates[0]?.evaluation ?? sourceWinnerEvaluation
	const winnerLineage = eligibilityByKey.get(winnerEvaluation.key)
	if (!winnerLineage?.eligible || winnerLineage.basis === "ineligible") {
		throw new Error("Selected winner is not source eligible")
	}
	return {
		winner: winnerEvaluation.treatment,
		transitionPromoted: winnerEvaluation.key !== sourceWinnerKey,
		eligibility: sourceEligible.eligibility,
	}
}

function exactFlatRoleSibling(
	materialized: readonly MaterializedCandidate[],
	winner: CompletePaletteTreatment,
): MaterializedCandidate | null {
	return materialized.find(({ treatment }) =>
		!treatment.gradient &&
		(["background", "surface", "foreground", "accent"] as const).every((role) =>
			treatment[role].hex === winner[role].hex && treatment[role].generated === winner[role].generated) &&
		treatment.collapse.surface === winner.collapse.surface &&
		treatment.collapse.accent === winner.collapse.accent) ?? null
}

function sourceConnectedTypes(
	candidate: MaterializedCandidate,
	lineage: AlbumArtworkPaletteV2Phase3CompleteLineageCandidateEligibility | null,
): AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType[] {
	if (!lineage?.eligible || lineage.basis === "ineligible" || lineage.key !== candidate.key) return []
	const selectedStructure = treatmentStructuralKey(candidate.treatment)
	const eligibilityByIdentity = new Map(lineage.descriptors.map((descriptor) =>
		[descriptor.identity, descriptor]))
	return [...new Set(candidate.descriptors
		.filter((descriptor) => {
			if (treatmentStructuralKey(descriptor.treatment) !== selectedStructure) return false
			const evaluated = evaluateAlbumArtworkPaletteV2Phase3CompleteLineageDescriptor(candidate.key, descriptor)
			const known = eligibilityByIdentity.get(evaluated.identity)
			return lineage.basis === "ordinary-complete-source-lineage"
				? evaluated.ordinaryEligible && known?.ordinaryEligible === true
				: known?.normativeEmergencyEligible === true && evaluated.canonicalTreatmentMatches &&
					evaluated.fieldConnectionComplete && evaluated.lineageBindingsComplete
		})
		.map(({ sourceType }) => sourceType))].sort(compareAscii)
}

function applyGradientSupport(
	selection: WinnerSelection,
	materialized: readonly MaterializedCandidate[],
	paths: AlbumArtworkPaletteV2Phase3ArmSupportedGradientPathResult,
): Readonly<{
	winner: CompletePaletteTreatment
	midpoint: AlbumArtworkPaletteV2Phase3SupportedGradientMidpointDescriptor
}> {
	const baseline = selection.winner
	const baselineKey = completeTreatmentKey(baseline)
	const selectedGradient = selection.transitionPromoted && baseline.gradient
	const path = selectedGradient
		? paths.paths.find(({ hypothesisId }) => hypothesisId === baseline.sourceFieldHypothesisId) ?? null
		: null
	if (!selectedGradient || path?.eligible === true) {
		return {
			winner: baseline,
			midpoint: selectedGradient && path?.eligible === true ? path.midpoint : NO_MIDPOINT,
		}
	}

	const candidateByKey = new Map(materialized.map((candidate) => [candidate.key, candidate]))
	const lineageByKey = new Map(selection.eligibility.candidates.map((candidate) =>
		[candidate.key, candidate]))
	const sourceCandidate = candidateByKey.get(baselineKey)
	if (!sourceCandidate) throw new Error("Gradient winner source is missing")
	const exactFlat = exactFlatRoleSibling(materialized, baseline)
	const exactLineage = exactFlat ? lineageByKey.get(exactFlat.key) ?? null : null
	const exactSourceTypes = exactFlat ? sourceConnectedTypes(exactFlat, exactLineage) : []
	if (exactFlat && exactSourceTypes.length > 0) return { winner: exactFlat.treatment, midpoint: NO_MIDPOINT }

	const sourceLineage = lineageByKey.get(sourceCandidate.key) ?? null
	if (sourceConnectedTypes(sourceCandidate, sourceLineage).length === 0) {
		throw new Error("Flat gradient fallback is not source connected")
	}
	return {
		winner: {
			...baseline,
			id: `supported-gradient-path-flat:${baseline.id}`,
			gradient: false,
			fieldTreatment: "separate-flat-fields",
			gradientEvidence: null,
		},
		midpoint: NO_MIDPOINT,
	}
}

export function extractPaletteDetails(image: RawImage): Readonly<{
	width: number
	height: number
	winner: CompletePaletteTreatment
	midpoint: AlbumArtworkPaletteV2Phase3SupportedGradientMidpointDescriptor
}> {
	const seed = buildPaletteSeedDomain(image)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
	const transitionEnvelope = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(
		common.evidence.nativeFieldTransitions,
	)
	const normalizedTransitionById = new Map(transitionEnvelope.hypotheses.map((hypothesis) =>
		[hypothesis.id, hypothesis]))
	const candidateFields: AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[] = common.fieldHypotheses.map((field) =>
		field.sourceType === "native-field-transition"
			? { ...field, hypothesis: normalizedTransitionById.get(field.hypothesis.id) ?? field.hypothesis }
			: field)
	const supplementalFields = candidateFields.filter(({ sourceType }) => sourceType !== "native-seed")
	const sourceByHypothesisId = new Map(supplementalFields.map(({ sourceType, hypothesis }) =>
		[hypothesis.id, sourceType]))
	const supplemental = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
		common.evidence.augmentedNative,
		supplementalFields.map(({ hypothesis }) => hypothesis),
	)
	const sourcedFields: AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[] = [
		...common.seedAvailability.fieldHypotheses,
		...supplemental.hypotheses.map((hypothesis) => ({
			sourceType: sourceByHypothesisId.get(hypothesis.id)!,
			hypothesis,
		})),
	]
	const supplementalDescriptors: AlbumArtworkPaletteV2Phase3LogicalDescriptor[] =
		supplemental.treatments.map((descriptor) => {
			const sourceType = sourceByHypothesisId.get(descriptor.fieldHypothesis.id)
			if (!sourceType) throw new Error("Supplemental candidate source is missing")
			return { sourceType, ...descriptor }
		})
	const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
		[...common.seedAvailability.logicalDescriptors, ...supplementalDescriptors],
		common.seedAvailability.identityObligations,
	)
	const roleEvidence = buildRoleEvidence(
		common.evidence.augmentedNative,
		sourcedFields.map(({ hypothesis }) => hypothesis),
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
	const selection = selectWinner({
		scored,
		materialized,
		roleObligations: roleEvidence.obligations,
		acceptedTransitionHypothesisIds: transitionEnvelope.creditedHypothesisIds,
		identityObligations: common.seedAvailability.identityObligations,
		identityRoleRequirements: roleEvidence.requirements,
		emergency: seed.emergency,
	})
	const gradient = applyGradientSupport(
		selection,
		materialized,
		evaluateAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath(common.evidence.native),
	)
	return { width: image.width, height: image.height, ...gradient }
}
