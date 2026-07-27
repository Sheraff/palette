import {
	extractChromaticRolePaletteWithContext,
	type ChromaticRoleCertificate,
} from "./chromatic-role-extract.ts"
import {
	DEVELOPMENT_FOREGROUND_CONTRAST_PROFILE,
	type ForegroundContrastProfile,
} from "./foreground-contrast.ts"
import type { Candidate } from "./candidates.ts"
import type { RegionAnalysis } from "./regions.ts"
import type { ExtractionResult, RawImage } from "./types.ts"

export const FOREGROUND_CONTRAST_ALGORITHM_VERSION = "region-foreground-contrast-0.1.0-poc.1"
export const FOREGROUND_CONTRAST_BASELINE_VERSION = "region-graph-0.19.0"

export type ForegroundContrastCertificate = {
	schemaVersion: 1
	algorithmVersion: typeof FOREGROUND_CONTRAST_ALGORITHM_VERSION
	baselineAlgorithmVersion: typeof FOREGROUND_CONTRAST_BASELINE_VERSION
	selectionRule: "canonical-chromatic-spatial-chain-with-explicit-foreground-contrast-profile"
	profile: ForegroundContrastProfile
	underlyingChromaticCertificate: ChromaticRoleCertificate
	invariants: {
		explicitProfileBound: true
		spatialOnly: true
		expressiveFrozen: true
		quantizedFrozen: true
		strictGradientSurfaceRecoveryDisabled: true
		canonicalVersionNotMasqueraded: true
	}
}

export type ForegroundContrastExtraction = {
	extraction: ExtractionResult
	certificate: ForegroundContrastCertificate
}

export type ForegroundContrastExtractionContext = ForegroundContrastExtraction & {
	analysis: RegionAnalysis
	candidates: Candidate[]
}

export function extractForegroundContrastPaletteWithContext(
	image: RawImage,
): ForegroundContrastExtractionContext {
	const context = extractChromaticRolePaletteWithContext(image, DEVELOPMENT_FOREGROUND_CONTRAST_PROFILE)
	return {
		analysis: context.analysis,
		candidates: context.candidates,
		extraction: {
			...context.extraction,
			version: FOREGROUND_CONTRAST_ALGORITHM_VERSION,
		},
		certificate: {
			schemaVersion: 1,
			algorithmVersion: FOREGROUND_CONTRAST_ALGORITHM_VERSION,
			baselineAlgorithmVersion: FOREGROUND_CONTRAST_BASELINE_VERSION,
			selectionRule: "canonical-chromatic-spatial-chain-with-explicit-foreground-contrast-profile",
			profile: DEVELOPMENT_FOREGROUND_CONTRAST_PROFILE,
			underlyingChromaticCertificate: context.certificate,
			invariants: {
				explicitProfileBound: true,
				spatialOnly: true,
				expressiveFrozen: true,
				quantizedFrozen: true,
				strictGradientSurfaceRecoveryDisabled: true,
				canonicalVersionNotMasqueraded: true,
			},
		},
	}
}

export function extractForegroundContrastPalette(image: RawImage): ForegroundContrastExtraction {
	const { analysis: _analysis, candidates: _candidates, ...result } = extractForegroundContrastPaletteWithContext(image)
	return result
}
