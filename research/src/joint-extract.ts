import { buildCandidates } from "./candidates.ts"
import { solveGuardedPalette } from "./guarded-palette.ts"
import { JOINT_ALGORITHM_VERSION, solveJointPalette, type JointPaletteCertificate } from "./joint-palette.ts"
import { quantizedBaseline, solvePalette } from "./palette.ts"
import { analyzeRegions } from "./regions.ts"
import type { ExtractionResult, RawImage } from "./types.ts"

export type JointExtractionResult = {
	extraction: ExtractionResult
	certificate: JointPaletteCertificate
}

export function extractJointPalette(image: RawImage): JointExtractionResult {
	const startedAt = performance.now()
	const analysis = analyzeRegions(image)
	const candidates = buildCandidates(analysis, 12, true)
	const quantizedCandidates = buildCandidates(analysis, 7, false)
	const guarded = solveGuardedPalette(candidates, analysis).palette
	const incumbent = solveJointPalette(candidates, analysis, guarded).palette
	const { palette: spatial, certificate } = solveJointPalette(candidates, analysis, incumbent, {
		enableGradientSurfaceRecovery: true,
	})
	const expressive = solvePalette(candidates, analysis, "expressive")
	const quantized = quantizedBaseline(quantizedCandidates, analysis)
	return {
		extraction: {
			version: JOINT_ALGORITHM_VERSION,
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
