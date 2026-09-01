import { extractChromaticRolePaletteWithContext } from "./chromatic-role-extract.ts"
import type { Candidate } from "./candidates.ts"
import type { RegionAnalysis } from "./regions.ts"
import type { ExtractionResult, RawImage } from "./types.ts"

export const ALGORITHM_VERSION = "region-graph-0.19.0"

export type ExtractionContext = {
	extraction: ExtractionResult
	analysis: RegionAnalysis
	candidates: Candidate[]
}

export function extractPaletteWithContext(image: RawImage): ExtractionContext {
	const { extraction, analysis, candidates } = extractChromaticRolePaletteWithContext(image)
	return {
		extraction: {
			...extraction,
			version: ALGORITHM_VERSION,
		},
		analysis,
		candidates,
	}
}

export function extractPalette(image: RawImage): ExtractionResult {
	return extractPaletteWithContext(image).extraction
}
