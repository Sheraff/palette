import {
	completeTreatmentKey,
	constructAlbumArtworkPaletteV2Phase3SupplementalTreatments,
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
	AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType,
	AlbumArtworkPaletteV2Phase3LogicalDescriptor,
	AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"
import {
	buildAlbumArtworkPaletteV2Phase3RecoveryV3RoleEvidence,
} from "./album-artwork-palette-v2-phase-3-recovery-custody-v3.ts"
import type {
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
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_ID,
	selectAlbumArtworkPaletteV2Phase3RecoveryV4,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v4.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoveryV4SelectorDiagnostics,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v4.ts"
import {
	normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4,
} from "./album-artwork-palette-v2-phase-3-transition-envelope-v4.ts"
import type {
	AlbumArtworkPaletteV2Phase3TransitionEnvelopeV4Diagnostics,
} from "./album-artwork-palette-v2-phase-3-transition-envelope-v4.ts"
import type { RawImage } from "./types.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V4_ATTEMPT_ID =
	"phase-3-recovery-v4" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V4_CONFIGURATION_ID =
	"wave-1-native-transition-envelope-decisive-role-rescue-v4" as const

export type AlbumArtworkPaletteV2Phase3RecoveryV4Diagnostics = Readonly<{
	version: "album-artwork-palette-v2-phase-3-recovery-v4-diagnostics-v1"
	configurationId: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V4_CONFIGURATION_ID
	baseSelectionAuthority: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID
	winnerSelectionAuthority: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_ID
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
	baseSelector: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation
	rescue: AlbumArtworkPaletteV2Phase3RecoveryV4SelectorDiagnostics
}>

export type AlbumArtworkPaletteV2Phase3RecoveryV4Result =
	Omit<AlbumArtworkPaletteV2Result, "diagnostics"> & Readonly<{
		diagnostics: AlbumArtworkPaletteV2Result["diagnostics"] & Readonly<{
			phase3RecoveryV4: AlbumArtworkPaletteV2Phase3RecoveryV4Diagnostics
		}>
	}>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

export function extractAlbumArtworkPaletteV2Phase3RecoveryV4(
	image: RawImage,
): AlbumArtworkPaletteV2Phase3RecoveryV4Result {
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
			if (!sourceType) throw new Error("Recovery v4 supplemental descriptor has no source mechanism")
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
	const custodyMaterialized = materialization.materialized.map((candidate):
		AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate => ({
			key: candidate.key,
			treatment: candidate.treatment,
			descriptors: candidate.descriptors as readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[],
		}))
	const selection = selectAlbumArtworkPaletteV2Phase3RecoveryV4(
		recoveryV2,
		custodyMaterialized,
		roleEvidence.obligations,
		transitionEnvelope.diagnostics.creditedHypothesisIds,
	)
	if (completeTreatmentKey(selection.winner) !== completeTreatmentKey(selection.slate[0])) {
		throw new Error("Phase 3 recovery v4 selector did not return a winner-first slate")
	}
	const winnerKey = completeTreatmentKey(selection.winner)
	const winnerSourceTypes = [...new Set(custodyMaterialized
		.find(({ key }) => key === winnerKey)?.descriptors
		.map(({ sourceType }) => sourceType) ?? [])].sort(compareAscii)
	const selected = selection.slate
	const baseDiagnostics = closedDetails.result.diagnostics
	const slateForegroundFamilyIds = [...new Set(selected.map(({ familyRoles }) => familyRoles.foreground)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort()
	const slateAccentFamilyIds = [...new Set(selected.filter(({ collapse }) => !collapse.accent)
		.map(({ familyRoles }) => familyRoles.accent)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort()
	const phase3RecoveryV4: AlbumArtworkPaletteV2Phase3RecoveryV4Diagnostics = {
		version: "album-artwork-palette-v2-phase-3-recovery-v4-diagnostics-v1",
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V4_CONFIGURATION_ID,
		baseSelectionAuthority: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID,
		winnerSelectionAuthority: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_ID,
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
		baseSelector: recoveryV2.explanation,
		rescue: selection.diagnostics,
	}
	return {
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V4_ATTEMPT_ID,
		protocol: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V4_CONFIGURATION_ID,
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
			phase3RecoveryV4,
		},
	}
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V4_ATTEMPT = Object.freeze({
	identity: Object.freeze({
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V4_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V4_CONFIGURATION_ID,
	}),
	extract: extractAlbumArtworkPaletteV2Phase3RecoveryV4,
})
