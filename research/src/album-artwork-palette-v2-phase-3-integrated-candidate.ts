import {
	completeTreatmentKey,
	constructAlbumArtworkPaletteV2Phase3SupplementalTreatments,
	extractAlbumArtworkPaletteV2074Details,
} from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Result,
	CompletePaletteTreatment,
	EmergencyEligibility,
	IdentityObligation,
} from "./album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPLETE_LINEAGE_WINNER_ELIGIBILITY_ID,
	evaluateAlbumArtworkPaletteV2Phase3CompleteLineageDescriptor,
} from "./album-artwork-palette-v2-phase-3-arm-complete-lineage-winner-eligibility.ts"
import {
	selectAlbumArtworkPaletteV2Phase3CompleteLineageWinner,
} from "./album-artwork-palette-v2-phase-3-arm-complete-lineage-winner.ts"
import type {
	AlbumArtworkPaletteV2Phase3CompleteLineageWinnerSelection,
} from "./album-artwork-palette-v2-phase-3-arm-complete-lineage-winner.ts"
import {
	buildAlbumArtworkPaletteV2Phase3CommonBase,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"
import type {
	AlbumArtworkPaletteV2Phase3CommonBaseDiagnostics,
	AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType,
	AlbumArtworkPaletteV2Phase3LogicalDescriptor,
	AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"
import {
	materializeAlbumArtworkPaletteV2Phase3Descriptors,
} from "./album-artwork-palette-v2-phase-3-materialization.ts"
import type {
	AlbumArtworkPaletteV2Phase3MaterializationDiagnostics,
} from "./album-artwork-palette-v2-phase-3-materialization.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_ID,
	buildAlbumArtworkPaletteV2Phase3RecoveryV3RoleEvidence,
	selectAlbumArtworkPaletteV2Phase3RecoveryV3Custody,
} from "./album-artwork-palette-v2-phase-3-recovery-custody-v3.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoveryV3CustodyDiagnostics,
	AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate,
} from "./album-artwork-palette-v2-phase-3-recovery-custody-v3.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID,
	selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation,
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_POLICY,
	selectAlbumArtworkPaletteV2Phase3RecoveryV4,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v4.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoveryV4CandidateDiagnostic,
	AlbumArtworkPaletteV2Phase3RecoveryV4SelectorDiagnostics,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v4.ts"
import type { RoleSpecificIdentityObligation } from
	"./album-artwork-palette-v2-phase-3-role-aware.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_TRANSITION_ENVELOPE_V4_ID,
	normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4,
} from "./album-artwork-palette-v2-phase-3-transition-envelope-v4.ts"
import type {
	AlbumArtworkPaletteV2Phase3TransitionEnvelopeV4Diagnostics,
} from "./album-artwork-palette-v2-phase-3-transition-envelope-v4.ts"
import type { RawImage } from "./types.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT_ID =
	"phase-3-integrated-candidate" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_CONFIGURATION_ID =
	"normalized-accepted-transitions-earned-native-winner-complete-lineage-recovery-v3-custody-v1" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_SELECTOR_ID =
	"album-artwork-palette-v2-phase-3-integrated-winner-v1" as const

type MaterializedCandidate = AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate

type RankedTransitionCandidate = Readonly<{
	evaluation: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation
	diagnostic: AlbumArtworkPaletteV2Phase3RecoveryV4CandidateDiagnostic
}>

export type AlbumArtworkPaletteV2Phase3IntegratedCandidateSelectionDiagnostics = Readonly<{
	version: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_SELECTOR_ID
	policy: Readonly<{
		maximumQualityLoss: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_POLICY.maximumBaseQualityLoss
		promotionSource: "earned-native-transition"
		promotionLineage: "ordinary-complete-source-lineage"
	}>
	unrestrictedWinnerKey: string
	lineageWinnerKey: string
	winnerKey: string
	lineageReplacement: boolean
	transitionPromoted: boolean
	qualityLossFromUnrestrictedWinner: number
	earnedNativeTransitionCandidateCount: number
	completeLineageTransitionCandidateCount: number
	qualityBoundedTransitionCandidateCount: number
	winnerLineageBasis: "ordinary-complete-source-lineage" | "normative-one-color-emergency"
	slateKeys: readonly string[]
	custodyKeys: readonly string[]
}>

export type AlbumArtworkPaletteV2Phase3IntegratedCandidateSelection = Readonly<{
	winner: CompletePaletteTreatment
	slate: readonly CompletePaletteTreatment[]
	completeLineage: AlbumArtworkPaletteV2Phase3CompleteLineageWinnerSelection<MaterializedCandidate>
	transitionRescue: AlbumArtworkPaletteV2Phase3RecoveryV4SelectorDiagnostics
	custody: AlbumArtworkPaletteV2Phase3RecoveryV3CustodyDiagnostics
	diagnostics: AlbumArtworkPaletteV2Phase3IntegratedCandidateSelectionDiagnostics
}>

export type AlbumArtworkPaletteV2Phase3IntegratedCandidateDiagnostics = Readonly<{
	version: "album-artwork-palette-v2-phase-3-integrated-candidate-diagnostics-v1"
	configurationId: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_CONFIGURATION_ID
	transitionNormalizationAuthority: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_TRANSITION_ENVELOPE_V4_ID
	baseSelectionAuthority: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID
	transitionPromotionAuthority: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_ID
	lineageEligibilityAuthority: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPLETE_LINEAGE_WINNER_ELIGIBILITY_ID
	custodyAuthority: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_ID
	commonBase: AlbumArtworkPaletteV2Phase3CommonBaseDiagnostics
	domain: Readonly<{
		seedDescriptorCount: number
		supplementalDescriptorCount: number
		logicalDescriptorCount: number
		materializedTreatmentCount: number
		fieldConditionalRoleEvidenceCount: number
		roleObligationCount: number
		winnerSourceTypes: readonly AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType[]
	}>
	transitionEnvelope: AlbumArtworkPaletteV2Phase3TransitionEnvelopeV4Diagnostics
	materialization: AlbumArtworkPaletteV2Phase3MaterializationDiagnostics
	selector: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation
	lineageEligibility: AlbumArtworkPaletteV2Phase3CompleteLineageWinnerSelection["eligibility"]["diagnostics"]
	transitionRescue: AlbumArtworkPaletteV2Phase3RecoveryV4SelectorDiagnostics
	custody: AlbumArtworkPaletteV2Phase3RecoveryV3CustodyDiagnostics
	selection: AlbumArtworkPaletteV2Phase3IntegratedCandidateSelectionDiagnostics
}>

export type AlbumArtworkPaletteV2Phase3IntegratedCandidateResult =
	Omit<AlbumArtworkPaletteV2Result, "diagnostics"> & Readonly<{
		diagnostics: AlbumArtworkPaletteV2Result["diagnostics"] & Readonly<{
			phase3IntegratedCandidate: AlbumArtworkPaletteV2Phase3IntegratedCandidateDiagnostics
		}>
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
	first: RankedTransitionCandidate,
	second: RankedTransitionCandidate,
): number {
	return compareDescending(first.diagnostic.decisiveCoverage, second.diagnostic.decisiveCoverage) ||
		compareDescending(first.diagnostic.totalObligationCoverage, second.diagnostic.totalObligationCoverage) ||
		compareDescending(first.diagnostic.existingFamilyIdentity, second.diagnostic.existingFamilyIdentity) ||
		compareDescending(first.diagnostic.roleEvidence, second.diagnostic.roleEvidence) ||
		compareDescending(first.diagnostic.baseQualityUtility, second.diagnostic.baseQualityUtility) ||
		compareAscii(first.evaluation.key, second.evaluation.key)
}

export function selectAlbumArtworkPaletteV2Phase3IntegratedCandidate(input: Readonly<{
	recoveryV2: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection
	materialized: readonly MaterializedCandidate[]
	roleObligations: readonly RoleSpecificIdentityObligation[]
	acceptedTransitionHypothesisIds: readonly string[]
	identityObligations?: readonly IdentityObligation[]
	emergency?: EmergencyEligibility | null
}>): AlbumArtworkPaletteV2Phase3IntegratedCandidateSelection {
	const completeLineage = selectAlbumArtworkPaletteV2Phase3CompleteLineageWinner({
		materialized: input.materialized,
		identityObligations: input.identityObligations,
		emergency: input.emergency,
	})
	const unrestrictedWinnerKey = completeTreatmentKey(input.recoveryV2.winner)
	const lineageWinner = completeLineage.winner.treatment
	const lineageWinnerKey = completeTreatmentKey(lineageWinner)
	const evaluationByKey = new Map(input.recoveryV2.evaluations.map((evaluation) =>
		[evaluation.key, evaluation]))
	const unrestrictedEvaluation = evaluationByKey.get(unrestrictedWinnerKey)
	const lineageEvaluation = evaluationByKey.get(lineageWinnerKey)
	if (!unrestrictedEvaluation || !lineageEvaluation) {
		throw new Error("Integrated candidate omitted a complete-lineage winner evaluation")
	}

	// Complete-lineage eligibility overlays only winner authority; the full-domain slate remains custody input.
	const lineageBaseline: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection = {
		...input.recoveryV2,
		winner: lineageWinner,
	}
	const transitionRescue = selectAlbumArtworkPaletteV2Phase3RecoveryV4(
		lineageBaseline,
		input.materialized,
		input.roleObligations,
		input.acceptedTransitionHypothesisIds,
	)
	const lineageEligibilityByKey = new Map(completeLineage.eligibility.diagnostics.candidates.map((candidate) =>
		[candidate.key, candidate]))
	const materializedByKey = new Map(input.materialized.map((candidate) => [candidate.key, candidate]))
	const acceptedTransitions = new Set(input.acceptedTransitionHypothesisIds)
	const earnedTransitions = transitionRescue.diagnostics.candidates
		.filter(({ promotionEligible, earnedNativeTransition }) => promotionEligible && earnedNativeTransition)
	const completeLineageTransitions = earnedTransitions.filter(({ key }) => {
		const evaluation = evaluationByKey.get(key)
		if (!evaluation) return false
		const selectedStructure = treatmentStructuralKey(evaluation.treatment)
		return materializedByKey.get(key)?.descriptors.some((descriptor) =>
			descriptor.sourceType === "native-field-transition" &&
			acceptedTransitions.has(descriptor.fieldHypothesis.id) &&
			descriptor.fieldHypothesis.gradientEvidence !== null &&
			treatmentStructuralKey(descriptor.treatment) === selectedStructure &&
			evaluateAlbumArtworkPaletteV2Phase3CompleteLineageDescriptor(key, descriptor).ordinaryEligible) === true
	})
	const qualityFloor = unrestrictedEvaluation.qualityUtility -
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_POLICY.maximumBaseQualityLoss
	const rankedTransitions = completeLineageTransitions.map((diagnostic): RankedTransitionCandidate => {
		const evaluation = evaluationByKey.get(diagnostic.key)
		if (!evaluation) throw new Error("Integrated candidate omitted an earned transition evaluation")
		return { evaluation, diagnostic }
	}).filter(({ evaluation }) => evaluation.qualityUtility + 1e-12 >= qualityFloor)
		.sort(compareTransitionCandidates)
	const winnerEvaluation = rankedTransitions[0]?.evaluation ?? lineageEvaluation
	const winner = winnerEvaluation.treatment
	const winnerKey = winnerEvaluation.key
	const winnerLineage = lineageEligibilityByKey.get(winnerKey)
	if (!winnerLineage?.eligible || winnerLineage.basis === "ineligible") {
		throw new Error("Integrated candidate selected a winner without complete lineage eligibility")
	}
	const qualityLossFromUnrestrictedWinner = Math.max(0,
		unrestrictedEvaluation.qualityUtility - winnerEvaluation.qualityUtility)
	if (qualityLossFromUnrestrictedWinner >
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_POLICY.maximumBaseQualityLoss + 1e-12) {
		throw new Error("Integrated candidate winner exceeds the unchanged quality envelope")
	}

	const custody = selectAlbumArtworkPaletteV2Phase3RecoveryV3Custody(
		input.recoveryV2,
		input.materialized,
		input.roleObligations,
	)
	const slate = [
		winner,
		...custody.slate.filter((treatment) => completeTreatmentKey(treatment) !== winnerKey),
	].slice(0, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_POLICY.maximumSlateTreatments)
	if (completeTreatmentKey(slate[0]) !== winnerKey) {
		throw new Error("Integrated candidate did not return a winner-first slate")
	}
	const diagnostics: AlbumArtworkPaletteV2Phase3IntegratedCandidateSelectionDiagnostics = {
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_SELECTOR_ID,
		policy: {
			maximumQualityLoss:
				ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_POLICY.maximumBaseQualityLoss,
			promotionSource: "earned-native-transition",
			promotionLineage: "ordinary-complete-source-lineage",
		},
		unrestrictedWinnerKey,
		lineageWinnerKey,
		winnerKey,
		lineageReplacement: lineageWinnerKey !== unrestrictedWinnerKey,
		transitionPromoted: winnerKey !== lineageWinnerKey,
		qualityLossFromUnrestrictedWinner,
		earnedNativeTransitionCandidateCount: earnedTransitions.length,
		completeLineageTransitionCandidateCount: completeLineageTransitions.length,
		qualityBoundedTransitionCandidateCount: rankedTransitions.length,
		winnerLineageBasis: winnerLineage.basis,
		slateKeys: slate.map(completeTreatmentKey),
		custodyKeys: custody.slate.map(completeTreatmentKey),
	}
	return {
		winner,
		slate,
		completeLineage,
		transitionRescue: transitionRescue.diagnostics,
		custody: custody.diagnostics,
		diagnostics,
	}
}

export function extractAlbumArtworkPaletteV2Phase3IntegratedCandidate(
	image: RawImage,
): AlbumArtworkPaletteV2Phase3IntegratedCandidateResult {
	const closedDetails = extractAlbumArtworkPaletteV2074Details(image)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(image, {
		closed074Details: closedDetails,
		materializeCurrentV1: (descriptors, obligations) =>
			materializeAlbumArtworkPaletteV2Phase3Descriptors(descriptors, obligations),
	})
	const transitionEnvelope = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(
		common.evidence.nativeFieldTransitions,
	)
	const normalizedTransitionById = new Map(transitionEnvelope.hypotheses.map((hypothesis) =>
		[hypothesis.id, hypothesis]))
	const sourcedFields: AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[] = common.fieldHypotheses.map((field) =>
		field.sourceType === "native-field-transition"
			? { ...field, hypothesis: normalizedTransitionById.get(field.hypothesis.id) ?? field.hypothesis }
			: field)
	const supplementalFields = sourcedFields.filter(({ sourceType }) => sourceType !== "closed-0.7.4-seed")
	const sourceByHypothesisId = new Map(supplementalFields.map(({ sourceType, hypothesis }) =>
		[hypothesis.id, sourceType]))
	const supplementalConstruction = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
		common.evidence.augmentedNative,
		supplementalFields.map(({ hypothesis }) => hypothesis),
	)
	const supplementalDescriptors: AlbumArtworkPaletteV2Phase3LogicalDescriptor[] =
		supplementalConstruction.treatments.map((descriptor) => {
			const sourceType = sourceByHypothesisId.get(descriptor.fieldHypothesis.id)
			if (!sourceType) throw new Error("Integrated candidate supplemental descriptor has no source mechanism")
			return { sourceType, ...descriptor }
		})
	const logicalDescriptors = [
		...common.seedAvailability.logicalDescriptors,
		...supplementalDescriptors,
	]
	const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
		logicalDescriptors,
		common.seedAvailability.identityObligations,
	)
	const recoveryV2 = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(
		materialization.materialized.map(({ treatment }) => treatment),
		{ obligations: common.seedAvailability.identityObligations },
	)
	const roleEvidence = buildAlbumArtworkPaletteV2Phase3RecoveryV3RoleEvidence(
		common.evidence.augmentedNative,
		sourcedFields.map(({ hypothesis }) => hypothesis),
	)
	const custodyMaterialized = materialization.materialized.map((candidate): MaterializedCandidate => ({
		key: candidate.key,
		treatment: candidate.treatment,
		descriptors: candidate.descriptors as readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[],
	}))
	const selection = selectAlbumArtworkPaletteV2Phase3IntegratedCandidate({
		recoveryV2,
		materialized: custodyMaterialized,
		roleObligations: roleEvidence.obligations,
		acceptedTransitionHypothesisIds: transitionEnvelope.diagnostics.creditedHypothesisIds,
		identityObligations: common.seedAvailability.identityObligations,
		emergency: closedDetails.result.diagnostics.emergency,
	})
	const winnerKey = completeTreatmentKey(selection.winner)
	const winnerSourceTypes = [...new Set(custodyMaterialized
		.find(({ key }) => key === winnerKey)?.descriptors.map(({ sourceType }) => sourceType) ?? [])]
		.sort(compareAscii)
	const selected = selection.slate
	const baseDiagnostics = closedDetails.result.diagnostics
	const slateForegroundFamilyIds = [...new Set(selected.map(({ familyRoles }) => familyRoles.foreground)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii)
	const slateAccentFamilyIds = [...new Set(selected.filter(({ collapse }) => !collapse.accent)
		.map(({ familyRoles }) => familyRoles.accent)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii)
	return {
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT_ID,
		protocol: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_CONFIGURATION_ID,
		width: image.width,
		height: image.height,
		winner: selection.winner,
		alternatives: selected,
		diagnostics: {
			...baseDiagnostics,
			fieldHypotheses: sourcedFields.map(({ hypothesis }) => hypothesis),
			gradientFits: common.evidence.gradientFits,
			completeCandidateCount: materialization.materialized.length,
			candidateAvailability: {
				...baseDiagnostics.candidateAvailability,
				slateForegroundFamilyIds,
				slateAccentFamilyIds,
			},
			phase3IntegratedCandidate: {
				version: "album-artwork-palette-v2-phase-3-integrated-candidate-diagnostics-v1",
				configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_CONFIGURATION_ID,
				transitionNormalizationAuthority: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_TRANSITION_ENVELOPE_V4_ID,
				baseSelectionAuthority: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID,
				transitionPromotionAuthority: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_ID,
				lineageEligibilityAuthority:
					ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPLETE_LINEAGE_WINNER_ELIGIBILITY_ID,
				custodyAuthority: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_ID,
				commonBase: common.diagnostics,
				domain: {
					seedDescriptorCount: common.seedAvailability.logicalDescriptors.length,
					supplementalDescriptorCount: supplementalDescriptors.length,
					logicalDescriptorCount: logicalDescriptors.length,
					materializedTreatmentCount: materialization.materialized.length,
					fieldConditionalRoleEvidenceCount: roleEvidence.evidence.length,
					roleObligationCount: roleEvidence.obligations.length,
					winnerSourceTypes,
				},
				transitionEnvelope: transitionEnvelope.diagnostics,
				materialization: materialization.diagnostics,
				selector: recoveryV2.explanation,
				lineageEligibility: selection.completeLineage.eligibility.diagnostics,
				transitionRescue: selection.transitionRescue,
				custody: selection.custody,
				selection: selection.diagnostics,
			},
		},
	}
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT = Object.freeze({
	identity: Object.freeze({
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_CONFIGURATION_ID,
	}),
	extract: extractAlbumArtworkPaletteV2Phase3IntegratedCandidate,
})
