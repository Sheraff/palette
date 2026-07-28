import {
	completeTreatmentKey,
	extractAlbumArtworkPaletteV2074Details,
} from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Result,
} from "./album-artwork-palette-v2.ts"
import {
	buildAlbumArtworkPaletteV2Phase3CommonBase,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"
import type {
	AlbumArtworkPaletteV2Phase3CommonBaseDiagnostics,
	AlbumArtworkPaletteV2Phase3LogicalDescriptor,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"
import {
	buildAlbumArtworkPaletteV2Phase3RecoveryV3RoleEvidence,
	selectAlbumArtworkPaletteV2Phase3RecoveryV3Custody,
} from "./album-artwork-palette-v2-phase-3-recovery-custody-v3.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoveryV3CustodyDiagnostics,
	AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate,
} from "./album-artwork-palette-v2-phase-3-recovery-custody-v3.ts"
import {
	materializeAlbumArtworkPaletteV2Phase3Descriptors,
} from "./album-artwork-palette-v2-phase-3-materialization.ts"
import type {
	AlbumArtworkPaletteV2Phase3MaterializationDiagnostics,
} from "./album-artwork-palette-v2-phase-3-materialization.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID,
	selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type { RawImage } from "./types.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V3_ATTEMPT_ID =
	"phase-3-recovery-v3" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V3_CONFIGURATION_ID =
	"wave-1-common-complete-domain-recovery-v2-public-slate-custody-v3" as const

export type AlbumArtworkPaletteV2Phase3RecoveryV3Diagnostics = Readonly<{
	version: "album-artwork-palette-v2-phase-3-recovery-v3-diagnostics-v1"
	configurationId: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V3_CONFIGURATION_ID
	winnerSelectionAuthority: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID
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
}>

export type AlbumArtworkPaletteV2Phase3RecoveryV3Result =
	Omit<AlbumArtworkPaletteV2Result, "diagnostics"> & Readonly<{
		diagnostics: AlbumArtworkPaletteV2Result["diagnostics"] & Readonly<{
			phase3RecoveryV3: AlbumArtworkPaletteV2Phase3RecoveryV3Diagnostics
		}>
	}>

export function extractAlbumArtworkPaletteV2Phase3RecoveryV3(
	image: RawImage,
): AlbumArtworkPaletteV2Phase3RecoveryV3Result {
	const closedDetails = extractAlbumArtworkPaletteV2074Details(image)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(image, {
		closed074Details: closedDetails,
		materializeCurrentV1: (descriptors, obligations) =>
			materializeAlbumArtworkPaletteV2Phase3Descriptors(descriptors, obligations),
	})
	const materialization = common.currentV1MaterializedDomain
	if (!materialization) throw new Error("Phase 3 recovery v3 omitted the Wave 1 complete domain")
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
	const custody = selectAlbumArtworkPaletteV2Phase3RecoveryV3Custody(
		recoveryV2,
		custodyMaterialized,
		roleEvidence.obligations,
	)
	if (completeTreatmentKey(custody.winner) !== completeTreatmentKey(recoveryV2.winner) ||
		completeTreatmentKey(custody.slate[0]) !== completeTreatmentKey(recoveryV2.winner)) {
		throw new Error("Phase 3 recovery v3 changed the recovery-v2 winner")
	}
	const selected = custody.slate
	const baseDiagnostics = closedDetails.result.diagnostics
	const slateForegroundFamilyIds = [...new Set(selected.map(({ familyRoles }) => familyRoles.foreground)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort()
	const slateAccentFamilyIds = [...new Set(selected.filter(({ collapse }) => !collapse.accent)
		.map(({ familyRoles }) => familyRoles.accent)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort()
	const phase3RecoveryV3: AlbumArtworkPaletteV2Phase3RecoveryV3Diagnostics = {
		version: "album-artwork-palette-v2-phase-3-recovery-v3-diagnostics-v1",
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V3_CONFIGURATION_ID,
		winnerSelectionAuthority: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID,
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
		custody: custody.diagnostics,
	}
	return {
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V3_ATTEMPT_ID,
		protocol: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V3_CONFIGURATION_ID,
		width: image.width,
		height: image.height,
		winner: recoveryV2.winner,
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
			phase3RecoveryV3,
		},
	}
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V3_ATTEMPT = Object.freeze({
	identity: Object.freeze({
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V3_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V3_CONFIGURATION_ID,
	}),
	extract: extractAlbumArtworkPaletteV2Phase3RecoveryV3,
})
