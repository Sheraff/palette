import {
	completeTreatmentKey,
	extractAlbumArtworkPaletteV2074Details,
} from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Result,
} from "./album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_ARM_ID,
	runAlbumArtworkPaletteV2Phase3BalancedMaterializationArm,
} from "./album-artwork-palette-v2-phase-3-arm-balanced-materialization.ts"
import type {
	AlbumArtworkPaletteV2Phase3BalancedMaterializationArmDiagnostics,
} from "./album-artwork-palette-v2-phase-3-arm-balanced-materialization.ts"
import {
	buildAlbumArtworkPaletteV2Phase3CommonBase,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"
import type {
	AlbumArtworkPaletteV2Phase3CommonBaseDiagnostics,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"
import type {
	AlbumArtworkPaletteV2Phase3MaterializationV2Diagnostics,
} from "./album-artwork-palette-v2-phase-3-materialization-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3AttemptAdapter,
} from "./album-artwork-palette-v2-phase-3-contract.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoveryV3CustodyDiagnostics,
} from "./album-artwork-palette-v2-phase-3-recovery-custody-v3.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type { RawImage } from "./types.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_ATTEMPT_ID =
	"phase-3-arm-balanced-materialization" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_CONFIGURATION_ID =
	"common-union-balanced-materialization-v2-recovery-v2-custody-v3" as const

export type AlbumArtworkPaletteV2Phase3BalancedMaterializationDiagnostics = Readonly<{
	version: "album-artwork-palette-v2-phase-3-balanced-materialization-diagnostics-v1"
	configurationId: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_CONFIGURATION_ID
	arm: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_ARM_ID
	commonBase: AlbumArtworkPaletteV2Phase3CommonBaseDiagnostics
	comparison: AlbumArtworkPaletteV2Phase3BalancedMaterializationArmDiagnostics
	materialization: AlbumArtworkPaletteV2Phase3MaterializationV2Diagnostics
	selector: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation
	custody: AlbumArtworkPaletteV2Phase3RecoveryV3CustodyDiagnostics
}>

export type AlbumArtworkPaletteV2Phase3BalancedMaterializationResult =
	Omit<AlbumArtworkPaletteV2Result, "diagnostics"> & Readonly<{
		diagnostics: AlbumArtworkPaletteV2Result["diagnostics"] & Readonly<{
			phase3BalancedMaterialization: AlbumArtworkPaletteV2Phase3BalancedMaterializationDiagnostics
		}>
	}>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

export function extractAlbumArtworkPaletteV2Phase3BalancedMaterialization(
	image: RawImage,
): AlbumArtworkPaletteV2Phase3BalancedMaterializationResult {
	const closed = extractAlbumArtworkPaletteV2074Details(image)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(image, { closed074Details: closed })
	const arm = runAlbumArtworkPaletteV2Phase3BalancedMaterializationArm({
		evidence: common.evidence.augmentedNative,
		fieldHypotheses: common.fieldHypotheses.map(({ hypothesis }) => hypothesis),
		logicalDescriptors: common.logicalDescriptors,
		identityObligations: common.seedAvailability.identityObligations,
	})
	const selected = arm.balanced.custody.slate
	const selectedKeys = selected.map(completeTreatmentKey)
	if (selectedKeys[0] !== completeTreatmentKey(arm.balanced.selector.winner)) {
		throw new Error("Balanced materialization custody changed the recovery selector winner")
	}
	const baseDiagnostics = closed.result.diagnostics
	const slateForegroundFamilyIds = [...new Set(selected.map(({ familyRoles }) => familyRoles.foreground)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii)
	const slateAccentFamilyIds = [...new Set(selected.filter(({ collapse }) => !collapse.accent)
		.map(({ familyRoles }) => familyRoles.accent)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii)
	return {
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_ATTEMPT_ID,
		protocol: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_CONFIGURATION_ID,
		width: image.width,
		height: image.height,
		winner: arm.balanced.selector.winner,
		alternatives: selected,
		diagnostics: {
			...baseDiagnostics,
			fieldHypotheses: common.fieldHypotheses.map(({ hypothesis }) => hypothesis),
			gradientFits: common.evidence.gradientFits,
			completeCandidateCount: arm.balanced.materialization.materialized.length,
			candidateAvailability: {
				...baseDiagnostics.candidateAvailability,
				slateForegroundFamilyIds,
				slateAccentFamilyIds,
			},
			phase3BalancedMaterialization: {
				version: "album-artwork-palette-v2-phase-3-balanced-materialization-diagnostics-v1",
				configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_CONFIGURATION_ID,
				arm: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_ARM_ID,
				commonBase: common.diagnostics,
				comparison: arm.diagnostics,
				materialization: arm.balanced.materialization.diagnostics,
				selector: arm.balanced.selector.explanation,
				custody: arm.balanced.custody.diagnostics,
			},
		},
	}
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_ATTEMPT = Object.freeze({
	identity: Object.freeze({
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_CONFIGURATION_ID,
	}),
	extract: extractAlbumArtworkPaletteV2Phase3BalancedMaterialization,
}) satisfies AlbumArtworkPaletteV2Phase3AttemptAdapter
