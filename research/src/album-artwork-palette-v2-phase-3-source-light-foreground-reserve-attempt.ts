import {
	completeTreatmentKey,
} from "./album-artwork-palette-v2.ts"
import {
	reserveAlbumArtworkPaletteV2Phase3SourceLightForeground,
} from "./album-artwork-palette-v2-phase-3-arm-source-light-foreground-reserve.ts"
import {
	extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails,
} from "./album-artwork-palette-v2-phase-3-integrated-candidate.ts"
import {
	buildAlbumArtworkPaletteV2Phase3ParallelArmOutput,
} from "./album-artwork-palette-v2-phase-3-parallel-arms.ts"
import type { RawImage } from "./types.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_ATTEMPT_ID =
	"phase-3-source-light-foreground-reserve" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_CONFIGURATION_ID =
	"integrated-candidate-bounded-source-supported-light-foreground-reserve-v1" as const

export function extractAlbumArtworkPaletteV2Phase3SourceLightForegroundReserve(image: RawImage) {
	const details = extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails(image)
	const reservation = reserveAlbumArtworkPaletteV2Phase3SourceLightForeground({
		current: { winner: details.result.winner, slate: details.result.alternatives },
		materialized: details.custodyMaterialized,
		evaluations: details.recoveryV2.evaluations,
		unrestrictedWinnerKey: details.selection.diagnostics.unrestrictedWinnerKey,
		completeLineageEligibility: details.selection.completeLineage.eligibility,
		roleEvidence: details.roleEvidence.evidence,
		families: details.common.evidence.augmentedNative.families,
	})
	return buildAlbumArtworkPaletteV2Phase3ParallelArmOutput(details, {
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_CONFIGURATION_ID,
		diagnosticsKey: "phase3SourceLightForegroundReserve",
	}, reservation.winner, reservation.slate, {
		version: "album-artwork-palette-v2-phase-3-source-light-foreground-reserve-diagnostics-v1",
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_CONFIGURATION_ID,
		domain: details.result.diagnostics.phase3IntegratedCandidate.domain,
		selector: details.result.diagnostics.phase3IntegratedCandidate.selector,
		lineageEligibility: details.selection.completeLineage.eligibility.diagnostics,
		transitionRescue: details.selection.transitionRescue,
		custody: details.selection.custody,
		gradientAuthority: details.gradientAuthority.diagnostics,
		supportedGradientPath: details.supportedGradientPath.diagnostics,
		selection: {
			...details.selection.diagnostics,
			slateKeys: reservation.slate.map(completeTreatmentKey),
		},
		sourceLightForegroundReserve: reservation.diagnostics,
	})
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_ATTEMPT = Object.freeze({
	identity: Object.freeze({
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_CONFIGURATION_ID,
	}),
	extract: extractAlbumArtworkPaletteV2Phase3SourceLightForegroundReserve,
})
