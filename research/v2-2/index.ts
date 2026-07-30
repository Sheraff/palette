import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION_ID,
	extractAlbumArtworkPaletteV2Phase3FinalCandidateDetails,
} from "./src/internal/album-artwork-palette-v2-phase-3-final-candidate.ts"
import {
	loadNativeImage,
} from "./src/internal/native-resolution-image.ts"
import type {
	AlbumArtworkPaletteV2Phase3FinalCandidateResult,
} from "./src/internal/album-artwork-palette-v2-phase-3-final-candidate.ts"
import type {
	LoadNativeImageOptions,
} from "./src/internal/native-resolution-image.ts"
import type { RawImage } from "./src/internal/types.ts"

export type { RawImage } from "./src/internal/types.ts"
export type { LoadNativeImageOptions } from "./src/internal/native-resolution-image.ts"
export type {
	AlbumArtworkPaletteV2Phase3FinalCandidateResult as PaletteResult,
} from "./src/internal/album-artwork-palette-v2-phase-3-final-candidate.ts"
export type {
	CompletePaletteTreatment as PaletteTreatment,
} from "./src/internal/album-artwork-palette-v2.ts"

export const algorithmIdentity = Object.freeze({
	attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT_ID,
	configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION_ID,
})

export type SourceSupportedMidpointRender = Readonly<{
	schemaVersion: 1
	field: Readonly<{
		kind: "linear-gradient"
		angleDegrees: 135
		interpolation: "oklab"
		stops: readonly [
			Readonly<{ kind: "role"; role: "background"; position: 0 }>,
			Readonly<{ kind: "source-supported-color"; hex: string; position: 0.5 }>,
			Readonly<{ kind: "role"; role: "surface"; position: 1 }>,
		]
	}>
}>

export type PaletteExtraction = AlbumArtworkPaletteV2Phase3FinalCandidateResult & Readonly<{
	algorithm: typeof algorithmIdentity
	researchRender?: SourceSupportedMidpointRender
}>

function sourceSupportedMidpointRender(
	details: ReturnType<typeof extractAlbumArtworkPaletteV2Phase3FinalCandidateDetails>,
): SourceSupportedMidpointRender | undefined {
	const midpoint = details.integratedDetails.gradientAuthority.diagnostics.midpoint
	if (midpoint.kind !== "source-supported-three-stop") return undefined
	return {
		schemaVersion: 1,
		field: {
			kind: "linear-gradient",
			angleDegrees: 135,
			interpolation: "oklab",
			stops: [
				{ kind: "role", role: "background", position: 0 },
				{ kind: "source-supported-color", hex: midpoint.color.hex, position: 0.5 },
				{ kind: "role", role: "surface", position: 1 },
			],
		},
	}
}

export function extractPalette(image: RawImage): PaletteExtraction {
	const details = extractAlbumArtworkPaletteV2Phase3FinalCandidateDetails(image)
	const researchRender = sourceSupportedMidpointRender(details)
	return {
		...details.result,
		algorithm: algorithmIdentity,
		...(researchRender ? { researchRender } : {}),
	}
}

export async function extractPaletteFromBytes(
	source: string | Uint8Array,
	options?: LoadNativeImageOptions,
): Promise<PaletteExtraction> {
	return extractPalette(await loadNativeImage(source, options))
}
