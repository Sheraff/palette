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
} from "./album-artwork-palette-v2-phase-3-common-base.ts"
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

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V2_ATTEMPT_ID =
	"phase-3-recovery-v2" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V2_CONFIGURATION_ID =
	"wave-1-common-complete-domain-unpinned-recovery-quality-v2" as const

export type AlbumArtworkPaletteV2Phase3RecoveryV2Diagnostics = Readonly<{
	version: "album-artwork-palette-v2-phase-3-recovery-v2-diagnostics-v1"
	configurationId: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V2_CONFIGURATION_ID
	selectionAuthority: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID
	commonBase: AlbumArtworkPaletteV2Phase3CommonBaseDiagnostics
	domain: Readonly<{
		seedDescriptorCount: number
		supplementalDescriptorCount: number
		logicalDescriptorCount: number
		materializedTreatmentCount: number
		winnerSourceTypes: readonly string[]
	}>
	materialization: AlbumArtworkPaletteV2Phase3MaterializationDiagnostics
	selector: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation
}>

export type AlbumArtworkPaletteV2Phase3RecoveryV2Result =
	Omit<AlbumArtworkPaletteV2Result, "diagnostics"> & Readonly<{
		diagnostics: AlbumArtworkPaletteV2Result["diagnostics"] & Readonly<{
			phase3RecoveryV2: AlbumArtworkPaletteV2Phase3RecoveryV2Diagnostics
		}>
	}>

export function extractAlbumArtworkPaletteV2Phase3RecoveryV2(
	image: RawImage,
): AlbumArtworkPaletteV2Phase3RecoveryV2Result {
	const closedDetails = extractAlbumArtworkPaletteV2074Details(image)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(image, {
		closed074Details: closedDetails,
		materializeCurrentV1: (descriptors, obligations) =>
			materializeAlbumArtworkPaletteV2Phase3Descriptors(descriptors, obligations),
	})
	const materialization = common.currentV1MaterializedDomain
	if (!materialization) throw new Error("Phase 3 recovery v2 omitted the Wave 1 complete domain")
	const selection = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(
		materialization.materialized.map(({ treatment }) => treatment),
		{ obligations: common.seedAvailability.identityObligations },
	)
	if (completeTreatmentKey(selection.winner) !== completeTreatmentKey(selection.slate[0])) {
		throw new Error("Phase 3 recovery v2 selector did not return a winner-first slate")
	}
	const winnerKey = completeTreatmentKey(selection.winner)
	const winnerSourceTypes = [...new Set(common.logicalDescriptors
		.filter(({ treatment }) => completeTreatmentKey(treatment) === winnerKey)
		.map(({ sourceType }) => sourceType))].sort()
	const selected = selection.slate
	const baseDiagnostics = closedDetails.result.diagnostics
	const slateForegroundFamilyIds = [...new Set(selected.map(({ familyRoles }) => familyRoles.foreground)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort()
	const slateAccentFamilyIds = [...new Set(selected.filter(({ collapse }) => !collapse.accent)
		.map(({ familyRoles }) => familyRoles.accent)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort()
	const phase3RecoveryV2: AlbumArtworkPaletteV2Phase3RecoveryV2Diagnostics = {
		version: "album-artwork-palette-v2-phase-3-recovery-v2-diagnostics-v1",
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V2_CONFIGURATION_ID,
		selectionAuthority: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID,
		commonBase: common.diagnostics,
		domain: {
			seedDescriptorCount: common.seedAvailability.logicalDescriptors.length,
			supplementalDescriptorCount: common.supplementalAvailability.logicalDescriptors.length,
			logicalDescriptorCount: common.logicalDescriptors.length,
			materializedTreatmentCount: materialization.materialized.length,
			winnerSourceTypes,
		},
		materialization: materialization.diagnostics,
		selector: selection.explanation,
	}
	return {
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V2_ATTEMPT_ID,
		protocol: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V2_CONFIGURATION_ID,
		width: image.width,
		height: image.height,
		winner: selection.winner,
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
			phase3RecoveryV2,
		},
	}
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V2_ATTEMPT = Object.freeze({
	identity: Object.freeze({
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V2_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V2_CONFIGURATION_ID,
	}),
	extract: extractAlbumArtworkPaletteV2Phase3RecoveryV2,
})
