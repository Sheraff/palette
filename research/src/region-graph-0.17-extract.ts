import { buildCandidates, type Candidate } from "./candidates.ts"
import type { ForegroundContrastProfile } from "./foreground-contrast.ts"
import { solveGuardedPalette } from "./guarded-palette.ts"
import { solveJointPalette } from "./joint-palette.ts"
import { quantizedBaseline, solvePalette } from "./palette.ts"
import { analyzeRegions, type RegionAnalysis } from "./regions.ts"
import type { ExtractionResult, RawImage } from "./types.ts"

export const REGION_GRAPH_0_17_ALGORITHM_VERSION = "region-graph-0.17.0"

export type RegionGraph017ExtractionContext = {
	extraction: ExtractionResult
	analysis: RegionAnalysis
	candidates: Candidate[]
}

export function extractRegionGraph017PaletteWithContext(
	image: RawImage,
	profile?: ForegroundContrastProfile,
): RegionGraph017ExtractionContext {
	const startedAt = performance.now()
	const analysis = analyzeRegions(image)
	const candidates = buildCandidates(analysis, 12, true)
	const quantizedCandidates = buildCandidates(analysis, 7, false)
	const incumbent = solveGuardedPalette(candidates, analysis, profile).palette
	const spatial = solveJointPalette(candidates, analysis, incumbent, { foregroundContrastProfile: profile }).palette
	const expressive = solvePalette(candidates, analysis, "expressive")
	const quantized = quantizedBaseline(quantizedCandidates, analysis)

	return {
		extraction: {
			version: REGION_GRAPH_0_17_ALGORITHM_VERSION,
			width: image.width,
			height: image.height,
			methods: { spatial, expressive, quantized },
			candidates: candidates.map((candidate) => ({
				hex: candidate.hex,
				rgb: candidate.rgb,
				population: candidate.population,
				background: candidate.background,
				saliency: candidate.saliency,
				text: candidate.text,
				chroma: candidate.chroma,
			})),
			diagnostics: {
				regionCount: analysis.regions.length,
				candidateCount: candidates.length,
				processingMs: Math.round(performance.now() - startedAt),
			},
		},
		analysis,
		candidates,
	}
}

export function extractRegionGraph017Palette(image: RawImage, profile?: ForegroundContrastProfile): ExtractionResult {
	return extractRegionGraph017PaletteWithContext(image, profile).extraction
}
