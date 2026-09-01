import {
	extractChromaticRolePaletteWithContext,
	type ChromaticRoleCertificate,
} from "./chromatic-role-extract.ts"
import {
	DEVELOPMENT_FOREGROUND_CONTRAST_FLOOR_PROFILE,
	type ForegroundContrastProfile,
} from "./foreground-contrast.ts"
import type { Candidate } from "./candidates.ts"
import type { RegionAnalysis } from "./regions.ts"
import type { ExtractionResult, RawImage } from "./types.ts"

export const FOREGROUND_CONTRAST_FLOOR_ALGORITHM_VERSION = "region-foreground-contrast-floor-0.2.0-poc.2"
export const FOREGROUND_CONTRAST_FLOOR_BASELINE_VERSION = "region-graph-0.19.0"

export type ForegroundContrastFloorCertificate = {
	schemaVersion: 1
	algorithmVersion: typeof FOREGROUND_CONTRAST_FLOOR_ALGORITHM_VERSION
	baselineAlgorithmVersion: typeof FOREGROUND_CONTRAST_FLOOR_BASELINE_VERSION
	selectionRule: "canonical-chromatic-spatial-chain-with-explicit-foreground-contrast-floor-profile"
	profile: ForegroundContrastProfile
	underlyingChromaticCertificate: ChromaticRoleCertificate
	invariants: {
		explicitProfileBound: true
		hardFloorsSeparatedFromScoringPreference: true
		accentGatesFrozen: true
		objectiveWeightsFrozen: true
		paretoFloorFrozen: true
		candidateAdmissionFrozen: true
		gradientLogicFrozen: true
		spatialOnly: true
		expressiveFrozen: true
		quantizedFrozen: true
		strictGradientSurfaceRecoveryDisabled: true
		canonicalVersionNotMasqueraded: true
	}
}

export type ForegroundContrastFloorExtraction = {
	extraction: ExtractionResult
	certificate: ForegroundContrastFloorCertificate
}

export type ForegroundContrastFloorExtractionContext = ForegroundContrastFloorExtraction & {
	analysis: RegionAnalysis
	candidates: Candidate[]
}

export function extractForegroundContrastFloorPaletteWithContext(
	image: RawImage,
): ForegroundContrastFloorExtractionContext {
	const context = extractChromaticRolePaletteWithContext(image, DEVELOPMENT_FOREGROUND_CONTRAST_FLOOR_PROFILE)
	return {
		analysis: context.analysis,
		candidates: context.candidates,
		extraction: {
			...context.extraction,
			version: FOREGROUND_CONTRAST_FLOOR_ALGORITHM_VERSION,
		},
		certificate: {
			schemaVersion: 1,
			algorithmVersion: FOREGROUND_CONTRAST_FLOOR_ALGORITHM_VERSION,
			baselineAlgorithmVersion: FOREGROUND_CONTRAST_FLOOR_BASELINE_VERSION,
			selectionRule: "canonical-chromatic-spatial-chain-with-explicit-foreground-contrast-floor-profile",
			profile: DEVELOPMENT_FOREGROUND_CONTRAST_FLOOR_PROFILE,
			underlyingChromaticCertificate: context.certificate,
			invariants: {
				explicitProfileBound: true,
				hardFloorsSeparatedFromScoringPreference: true,
				accentGatesFrozen: true,
				objectiveWeightsFrozen: true,
				paretoFloorFrozen: true,
				candidateAdmissionFrozen: true,
				gradientLogicFrozen: true,
				spatialOnly: true,
				expressiveFrozen: true,
				quantizedFrozen: true,
				strictGradientSurfaceRecoveryDisabled: true,
				canonicalVersionNotMasqueraded: true,
			},
		},
	}
}

export function extractForegroundContrastFloorPalette(image: RawImage): ForegroundContrastFloorExtraction {
	const { analysis: _analysis, candidates: _candidates, ...result } = extractForegroundContrastFloorPaletteWithContext(image)
	return result
}
