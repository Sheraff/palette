import { completeTreatmentKey } from "./palette-core.ts";

import type { CompletePaletteTreatment } from "./palette-core.ts";

import type { AlbumArtworkPaletteV2Phase3LogicalDescriptor } from "./candidate-domain.ts";

import { promotionEnvelopeUtility } from "./winner-scoring.ts";

import type { WinnerEvaluation, WinnerScoring } from "./winner-scoring.ts";

import { roleSpecificObligationCoverage } from "./role-obligations.ts";

import type { RoleSpecificIdentityObligation } from "./role-obligations.ts";

export const MAXIMUM_WINNER_QUALITY_LOSS = 0.12

export type MaterializedCandidate = Readonly<{
	key: string
	treatment: CompletePaletteTreatment
	descriptors: readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[]
}>

export type TransitionCandidate = Readonly<{
	key: string
	earnedNativeTransition: boolean
	baseQualityUtility: number
	decisiveCoverage: number
	totalObligationCoverage: number
	existingFamilyIdentity: number
	roleEvidence: number
	promotionEligible: boolean
}>

function consistentDescriptor(
	candidate: MaterializedCandidate,
	descriptor: MaterializedCandidate["descriptors"][number],
): boolean {
	return completeTreatmentKey(descriptor.treatment) === candidate.key &&
		descriptor.treatment.sourceFieldHypothesisId === descriptor.fieldHypothesis.id &&
		descriptor.lineage.fieldHypothesisId === descriptor.fieldHypothesis.id
}

function sourceConnectedTreatment(treatment: CompletePaletteTreatment): boolean {
	return (["background", "surface", "foreground", "accent"] as const).every((role) => {
		const familyId = treatment.familyRoles[role]
		const color = treatment[role]
		return familyId !== "generated" && !color.generated && !("generated" in color.support) &&
			color.support.anchorFamilyId === familyId && color.support.regionIds.length > 0
	})
}

export function evaluateTransitionCandidates(
	selection: WinnerScoring,
	materialized: readonly MaterializedCandidate[],
	roleObligations: readonly RoleSpecificIdentityObligation[],
	acceptedTransitionHypothesisIds: readonly string[],
): readonly TransitionCandidate[] {
	const materializedByKey = new Map(materialized.map((candidate) => [candidate.key, candidate]))
	const baselineKey = completeTreatmentKey(selection.winner)
	const baselineEvaluation = selection.evaluations.find(({ key }) => key === baselineKey)
	if (!baselineEvaluation) throw new Error("Winner evaluation is missing")
	const acceptedTransitions = new Set(acceptedTransitionHypothesisIds)
	const baselineCoverage = roleSpecificObligationCoverage(selection.winner, roleObligations)
	const baselineDecisiveCoverage = baselineCoverage.foregroundCoveredCount + baselineCoverage.accentCoveredCount

	return selection.evaluations.map((evaluation: WinnerEvaluation) => {
		const candidate = materializedByKey.get(evaluation.key)
		if (!candidate) throw new Error("Materialized candidate is missing")
		const consistent = candidate.key === completeTreatmentKey(candidate.treatment) &&
			candidate.key === completeTreatmentKey(evaluation.treatment) && candidate.descriptors.length > 0 &&
			candidate.descriptors.every((descriptor) => consistentDescriptor(candidate, descriptor))
		const connectedDescriptors = candidate.descriptors.filter((descriptor) =>
			consistentDescriptor(candidate, descriptor) && descriptor.lineage.sourceConnected &&
			descriptor.lineage.representatives.every(({ sourceConnected }) => sourceConnected))
		const earnedNativeTransition = evaluation.gradientStatus === "earned-rendered" &&
			evaluation.treatment.gradient && connectedDescriptors.some((descriptor) =>
				descriptor.sourceType === "native-field-transition" &&
				acceptedTransitions.has(descriptor.fieldHypothesis.id) &&
				descriptor.fieldHypothesis.gradientEvidence !== null)
		const eligibleSource = connectedDescriptors.some(({ sourceType }) => sourceType !== "native-field-transition") ||
			earnedNativeTransition
		const sourceConnected = sourceConnectedTreatment(evaluation.treatment) && connectedDescriptors.length > 0
		const coverage = roleSpecificObligationCoverage(evaluation.treatment, roleObligations)
		const decisiveCoverage = coverage.foregroundCoveredCount + coverage.accentCoveredCount
		const withinQualityBound = promotionEnvelopeUtility(evaluation) + 1e-12 >=
			promotionEnvelopeUtility(baselineEvaluation) - MAXIMUM_WINNER_QUALITY_LOSS
		return {
			key: evaluation.key,
			earnedNativeTransition,
			baseQualityUtility: evaluation.qualityUtility,
			decisiveCoverage,
			totalObligationCoverage: coverage.coveredCount,
			existingFamilyIdentity: evaluation.identityCoverage,
			roleEvidence: coverage.roleEvidence,
			promotionEligible: evaluation.key !== baselineKey && consistent && sourceConnected && eligibleSource &&
				withinQualityBound && decisiveCoverage > baselineDecisiveCoverage,
		}
	})
}
