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
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_VERSION,
	selectAlbumArtworkPaletteV2Phase3Treatments,
} from "./album-artwork-palette-v2-phase-3-selector.ts"
import type {
	AlbumArtworkPaletteV2Phase3SelectorExplanation,
} from "./album-artwork-palette-v2-phase-3-selector.ts"
import type { RawImage } from "./types.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_ATTEMPT_ID =
	"phase-3-recovery" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CONFIGURATION_ID =
	"wave-1-common-complete-domain-unpinned-relation-selector-v1" as const

export type AlbumArtworkPaletteV2Phase3RecoveryDiagnostics = Readonly<{
	version: "album-artwork-palette-v2-phase-3-recovery-diagnostics-v1"
	configurationId: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CONFIGURATION_ID
	selectionAuthority: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_VERSION
	commonBase: AlbumArtworkPaletteV2Phase3CommonBaseDiagnostics
	domain: Readonly<{
		seedDescriptorCount: number
		supplementalDescriptorCount: number
		logicalDescriptorCount: number
		materializedTreatmentCount: number
		winnerSourceTypes: readonly string[]
	}>
	materialization: AlbumArtworkPaletteV2Phase3MaterializationDiagnostics
	selector: AlbumArtworkPaletteV2Phase3SelectorExplanation
}>

export type AlbumArtworkPaletteV2Phase3RecoveryResult =
	Omit<AlbumArtworkPaletteV2Result, "diagnostics"> & Readonly<{
		diagnostics: AlbumArtworkPaletteV2Result["diagnostics"] & Readonly<{
			phase3Selector: AlbumArtworkPaletteV2Phase3SelectorExplanation
			phase3Recovery: AlbumArtworkPaletteV2Phase3RecoveryDiagnostics
		}>
	}>

export function extractAlbumArtworkPaletteV2Phase3Recovery(
	image: RawImage,
): AlbumArtworkPaletteV2Phase3RecoveryResult {
	const closedDetails = extractAlbumArtworkPaletteV2074Details(image)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(image, {
		closed074Details: closedDetails,
		materializeCurrentV1: (descriptors, obligations) =>
			materializeAlbumArtworkPaletteV2Phase3Descriptors(descriptors, obligations),
	})
	const materialization = common.currentV1MaterializedDomain
	if (!materialization) throw new Error("Phase 3 recovery omitted the Wave 1 complete domain")
	const selection = selectAlbumArtworkPaletteV2Phase3Treatments(
		materialization.materialized.map(({ treatment }) => treatment),
		closedDetails.result.diagnostics.identityObligationGraph,
	)
	if (completeTreatmentKey(selection.winner) !== completeTreatmentKey(selection.slate[0])) {
		throw new Error("Phase 3 recovery selector did not return a winner-first slate")
	}
	const winnerKey = completeTreatmentKey(selection.winner)
	const winnerSourceTypes = [...new Set(materialization.materialized
		.find(({ key }) => key === winnerKey)?.descriptors.map(({ sourceType }) => sourceType) ?? [])].sort()
	const selected = selection.slate
	const baseDiagnostics = closedDetails.result.diagnostics
	const slateForegroundFamilyIds = [...new Set(selected.map(({ familyRoles }) => familyRoles.foreground)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort()
	const slateAccentFamilyIds = [...new Set(selected.filter(({ collapse }) => !collapse.accent)
		.map(({ familyRoles }) => familyRoles.accent)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort()
	const phase3Recovery: AlbumArtworkPaletteV2Phase3RecoveryDiagnostics = {
		version: "album-artwork-palette-v2-phase-3-recovery-diagnostics-v1",
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CONFIGURATION_ID,
		selectionAuthority: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_VERSION,
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
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_ATTEMPT_ID,
		protocol: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CONFIGURATION_ID,
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
			phase3Selector: selection.explanation,
			phase3Recovery,
		},
	}
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_ATTEMPT = Object.freeze({
	identity: Object.freeze({
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CONFIGURATION_ID,
	}),
	extract: extractAlbumArtworkPaletteV2Phase3Recovery,
})
