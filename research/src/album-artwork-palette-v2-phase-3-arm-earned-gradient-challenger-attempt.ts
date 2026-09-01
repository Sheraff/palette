import {
	completeTreatmentKey,
	extractAlbumArtworkPaletteV2074Details,
} from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Result,
} from "./album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_ID,
	selectAlbumArtworkPaletteV2Phase3ArmEarnedGradientChallenger,
} from "./album-artwork-palette-v2-phase-3-arm-earned-gradient-challenger.ts"
import type {
	AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerDiagnostics,
} from "./album-artwork-palette-v2-phase-3-arm-earned-gradient-challenger.ts"
import {
	buildAlbumArtworkPaletteV2Phase3CommonBase,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"
import type {
	AlbumArtworkPaletteV2Phase3CommonBaseDiagnostics,
	AlbumArtworkPaletteV2Phase3LogicalDescriptor,
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
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type { RawImage } from "./types.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_ATTEMPT_ID =
	"phase-3-arm-earned-gradient-challenger" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_CONFIGURATION_ID =
	"wave-1-complete-domain-recovery-v2-custody-v3-earned-gradient-challenger-v1" as const

export type AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerAttemptDiagnostics = Readonly<{
	version: "album-artwork-palette-v2-phase-3-arm-earned-gradient-challenger-attempt-diagnostics-v1"
	configurationId:
		typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_CONFIGURATION_ID
	winnerSelectionAuthority: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID
	custodyAuthority: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_ID
	challengerAuthority: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_ID
	commonBase: AlbumArtworkPaletteV2Phase3CommonBaseDiagnostics
	domain: Readonly<{
		seedDescriptorCount: number
		supplementalDescriptorCount: number
		logicalDescriptorCount: number
		materializedTreatmentCount: number
		fieldConditionalRoleEvidenceCount: number
		roleObligationCount: number
	}>
	materialization: AlbumArtworkPaletteV2Phase3MaterializationDiagnostics
	selector: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation
	custody: AlbumArtworkPaletteV2Phase3RecoveryV3CustodyDiagnostics
	challenger: AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerDiagnostics
}>

export type AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerResult =
	Omit<AlbumArtworkPaletteV2Result, "diagnostics"> & Readonly<{
		diagnostics: AlbumArtworkPaletteV2Result["diagnostics"] & Readonly<{
			phase3ArmEarnedGradientChallenger:
				AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerAttemptDiagnostics
		}>
	}>

export function extractAlbumArtworkPaletteV2Phase3ArmEarnedGradientChallenger(
	image: RawImage,
): AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerResult {
	const closedDetails = extractAlbumArtworkPaletteV2074Details(image)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(image, {
		closed074Details: closedDetails,
		materializeCurrentV1: (descriptors, obligations) =>
			materializeAlbumArtworkPaletteV2Phase3Descriptors(descriptors, obligations),
	})
	const materialization = common.currentV1MaterializedDomain
	if (!materialization) throw new Error("Earned-gradient challenger attempt omitted the Wave 1 complete domain")
	const recoveryV2 = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(
		materialization.materialized.map(({ treatment }) => treatment),
		{ obligations: common.seedAvailability.identityObligations },
	)
	const roleEvidence = buildAlbumArtworkPaletteV2Phase3RecoveryV3RoleEvidence(
		common.evidence.augmentedNative,
		common.fieldHypotheses.map(({ hypothesis }) => hypothesis),
	)
	const custodyMaterialized = materialization.materialized.map((candidate):
		AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate => ({
			key: candidate.key,
			treatment: candidate.treatment,
			descriptors: candidate.descriptors as readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[],
		}))
	const recoveryV3 = selectAlbumArtworkPaletteV2Phase3RecoveryV3Custody(
		recoveryV2,
		custodyMaterialized,
		roleEvidence.obligations,
	)
	const challenger = selectAlbumArtworkPaletteV2Phase3ArmEarnedGradientChallenger({
		recoveryV2,
		recoveryV3,
		materialized: custodyMaterialized,
	})
	if (completeTreatmentKey(challenger.winner) !== completeTreatmentKey(challenger.slate[0]) ||
		challenger.slate.length > 8) {
		throw new Error("Earned-gradient challenger attempt did not return bounded winner-first custody")
	}
	const selected = challenger.slate
	const baseDiagnostics = closedDetails.result.diagnostics
	const slateForegroundFamilyIds = [...new Set(selected.map(({ familyRoles }) => familyRoles.foreground)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort()
	const slateAccentFamilyIds = [...new Set(selected.filter(({ collapse }) => !collapse.accent)
		.map(({ familyRoles }) => familyRoles.accent)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort()
	const phase3ArmEarnedGradientChallenger:
		AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerAttemptDiagnostics = {
			version: "album-artwork-palette-v2-phase-3-arm-earned-gradient-challenger-attempt-diagnostics-v1",
			configurationId:
				ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_CONFIGURATION_ID,
			winnerSelectionAuthority: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID,
			custodyAuthority: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_ID,
			challengerAuthority: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_ID,
			commonBase: common.diagnostics,
			domain: {
				seedDescriptorCount: common.seedAvailability.logicalDescriptors.length,
				supplementalDescriptorCount: common.supplementalAvailability.logicalDescriptors.length,
				logicalDescriptorCount: common.logicalDescriptors.length,
				materializedTreatmentCount: materialization.materialized.length,
				fieldConditionalRoleEvidenceCount: roleEvidence.evidence.length,
				roleObligationCount: roleEvidence.obligations.length,
			},
			materialization: materialization.diagnostics,
			selector: recoveryV2.explanation,
			custody: recoveryV3.diagnostics,
			challenger: challenger.diagnostics,
		}
	return {
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_ATTEMPT_ID,
		protocol: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_CONFIGURATION_ID,
		width: image.width,
		height: image.height,
		winner: challenger.winner,
		alternatives: selected,
		diagnostics: {
			...baseDiagnostics,
			fieldHypotheses: common.fieldHypotheses.map(({ hypothesis }) => hypothesis),
			gradientFits: common.evidence.gradientFits,
			completeCandidateCount: materialization.materialized.length,
			candidateAvailability: {
				...baseDiagnostics.candidateAvailability,
				slateForegroundFamilyIds,
				slateAccentFamilyIds,
			},
			phase3ArmEarnedGradientChallenger,
		},
	}
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_ATTEMPT = Object.freeze({
	identity: Object.freeze({
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_ATTEMPT_ID,
		configurationId:
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_CONFIGURATION_ID,
	}),
	extract: extractAlbumArtworkPaletteV2Phase3ArmEarnedGradientChallenger,
})
