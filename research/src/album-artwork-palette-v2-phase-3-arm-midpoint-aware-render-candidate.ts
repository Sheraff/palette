import type { NativePaletteEvidence } from "./album-artwork-palette-v2.ts"
import {
	discoverSupportedNativeFieldTransitionPaths,
} from "./album-artwork-palette-v2-phase-3-field-transition.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY,
	evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates,
} from "./album-artwork-palette-v2-phase-3-field-render-candidate.ts"
import type {
	AlbumArtworkPaletteV2Phase3FieldRenderCandidateEvaluation,
	AlbumArtworkPaletteV2Phase3FieldRenderExactStop,
	AlbumArtworkPaletteV2Phase3FieldRenderKind,
	AlbumArtworkPaletteV2Phase3FieldRenderSelection,
} from "./album-artwork-palette-v2-phase-3-field-render-candidate.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_MIDPOINT_AWARE_RENDER_CANDIDATE_ID =
	"album-artwork-palette-v2-phase-3-arm-midpoint-aware-render-candidate-v2" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_MIDPOINT_AWARE_RENDER_CANDIDATE_CONFIGURATION_ID =
	"supported-source-field-render-fidelity-v2" as const

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_MIDPOINT_AWARE_RENDER_CANDIDATE_IDENTITY = Object.freeze({
	armId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_MIDPOINT_AWARE_RENDER_CANDIDATE_ID,
	configurationId:
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_MIDPOINT_AWARE_RENDER_CANDIDATE_CONFIGURATION_ID,
	version: 2 as const,
})

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_MIDPOINT_AWARE_RENDER_CANDIDATE_POLICY = Object.freeze({
	fieldRenderEvaluatorId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_ID,
	fieldRenderPolicy: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_POLICY,
	gradientRenderKinds: Object.freeze([
		"supported-two-stop",
		"supported-three-stop",
	] as const satisfies readonly AlbumArtworkPaletteV2Phase3FieldRenderKind[]),
})

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_MIDPOINT_AWARE_RENDER_CANDIDATE_FORMULAS = Object.freeze({
	domain:
		"all supported native field transition evidence is passed unchanged to the bounded source field-render evaluator",
	selection:
		"the arm exposes the evaluator's deterministic best path/render selection without changing endpoints, stops, or custody",
	gradient:
		"after render selection only, flat maps to false and supported two-stop or supported three-stop maps to true",
	roles:
		"the arm creates no palette role for an interior render stop",
})

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_MIDPOINT_AWARE_RENDER_CANDIDATE_DIAGNOSTICS =
	Object.freeze({
		identity: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_MIDPOINT_AWARE_RENDER_CANDIDATE_IDENTITY,
		policy: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_MIDPOINT_AWARE_RENDER_CANDIDATE_POLICY,
		formulas: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_MIDPOINT_AWARE_RENDER_CANDIDATE_FORMULAS,
	})

export type AlbumArtworkPaletteV2Phase3MidpointAwareSelectedFieldRender = Readonly<{
	selected: boolean
	renderKind: AlbumArtworkPaletteV2Phase3FieldRenderKind | null
	gradient: boolean
	fieldTreatment: "unsupported" | "separate-flat-fields" | "gradient-field"
	endpointStops: readonly [
		AlbumArtworkPaletteV2Phase3FieldRenderExactStop,
		AlbumArtworkPaletteV2Phase3FieldRenderExactStop,
	] | null
	renderStops: readonly AlbumArtworkPaletteV2Phase3FieldRenderExactStop[]
}>

export type AlbumArtworkPaletteV2Phase3ArmMidpointAwareRenderCandidateResult = Readonly<{
	identity: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_MIDPOINT_AWARE_RENDER_CANDIDATE_IDENTITY
	fieldRender: AlbumArtworkPaletteV2Phase3MidpointAwareSelectedFieldRender
	candidates: AlbumArtworkPaletteV2Phase3FieldRenderCandidateEvaluation
	diagnostics: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_MIDPOINT_AWARE_RENDER_CANDIDATE_DIAGNOSTICS
}>

export function deriveAlbumArtworkPaletteV2Phase3FieldRenderFromSelection(
	selection: AlbumArtworkPaletteV2Phase3FieldRenderSelection | null,
): AlbumArtworkPaletteV2Phase3MidpointAwareSelectedFieldRender {
	if (selection === null) {
		return Object.freeze({
			selected: false,
			renderKind: null,
			gradient: false,
			fieldTreatment: "unsupported",
			endpointStops: null,
			renderStops: Object.freeze([]),
		})
	}
	const gradient = selection.render.kind !== "flat"
	return Object.freeze({
		selected: true,
		renderKind: selection.render.kind,
		gradient,
		fieldTreatment: gradient ? "gradient-field" : "separate-flat-fields",
		endpointStops: selection.render.endpoints,
		renderStops: selection.render.stops,
	})
}

export function evaluateAlbumArtworkPaletteV2Phase3ArmMidpointAwareRenderCandidate(
	evidence: NativePaletteEvidence,
): AlbumArtworkPaletteV2Phase3ArmMidpointAwareRenderCandidateResult {
	const candidates = evaluateAlbumArtworkPaletteV2Phase3FieldRenderCandidates(
		discoverSupportedNativeFieldTransitionPaths(evidence),
		evidence.familyBinStep,
	)
	return Object.freeze({
		identity: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_MIDPOINT_AWARE_RENDER_CANDIDATE_IDENTITY,
		fieldRender: deriveAlbumArtworkPaletteV2Phase3FieldRenderFromSelection(candidates.selected),
		candidates,
		diagnostics: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_MIDPOINT_AWARE_RENDER_CANDIDATE_DIAGNOSTICS,
	})
}
