import { buildCandidates } from "./candidates.ts"
import { GUARDED_ALGORITHM_VERSION, solveGuardedPalette, type GuardedPaletteCertificate } from "./guarded-palette.ts"
import { quantizedBaseline, solvePalette } from "./palette.ts"
import { analyzeRegions } from "./regions.ts"
import type { ExtractionResult, RawImage } from "./types.ts"

export type GuardedExtractionResult = {
	extraction: ExtractionResult
	certificate: GuardedPaletteCertificate
}

export function extractGuardedPalette(image: RawImage): GuardedExtractionResult {
	const startedAt = performance.now()
	const analysis = analyzeRegions(image)
	const candidates = buildCandidates(analysis, 12, true)
	const quantizedCandidates = buildCandidates(analysis, 7, false)
	const { palette: spatial, certificate } = solveGuardedPalette(candidates, analysis)
	const expressive = solvePalette(candidates, analysis, "expressive")
	const quantized = quantizedBaseline(quantizedCandidates, analysis)
	return {
		extraction: {
			version: GUARDED_ALGORITHM_VERSION,
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
		certificate,
	}
}
