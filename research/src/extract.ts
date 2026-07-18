import { buildCandidates } from "./candidates.ts"
import { quantizedBaseline, solvePalette } from "./palette.ts"
import { analyzeRegions } from "./regions.ts"
import type { ExtractionResult, RawImage } from "./types.ts"

export const ALGORITHM_VERSION = "region-graph-0.15.0"

export function extractPalette(image: RawImage): ExtractionResult {
	const startedAt = performance.now()
	const analysis = analyzeRegions(image)
	const candidates = buildCandidates(analysis, 12, true)
	const quantizedCandidates = buildCandidates(analysis, 7, false)
	const spatial = solvePalette(candidates, analysis, "spatial")
	const expressive = solvePalette(candidates, analysis, "expressive")
	const quantized = quantizedBaseline(quantizedCandidates, analysis)

	return {
		version: ALGORITHM_VERSION,
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
	}
}
