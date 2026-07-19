import { buildCandidates } from "./candidates.ts"
import { quantizedBaseline, solvePalette } from "./palette.ts"
import { solveParetoPalette } from "./pareto-palette.ts"
import { analyzeRegions } from "./regions.ts"
import type { Candidate } from "./candidates.ts"
import type { ParetoPaletteCertificate } from "./pareto-palette.ts"
import type { RegionAnalysis } from "./regions.ts"
import type { ExtractionResult, Palette, RawImage } from "./types.ts"

export const PARETO_EXPERIMENT_VERSION = "region-field-frontier-0.1.0-poc.2"
export const PARETO_BASELINE_VERSION = "region-graph-0.15.0"

export type ParetoSolution = {
	palette: Palette
	certificate: ParetoPaletteCertificate
}

export type ParetoSolver = (candidates: Candidate[], analysis: RegionAnalysis) => ParetoSolution

export type ParetoExtractionResult = {
	extraction: ExtractionResult
	certificate: ParetoPaletteCertificate
}

export function extractParetoPalette(
	image: RawImage,
	paretoSolver: ParetoSolver = solveParetoPalette,
): ParetoExtractionResult {
	const startedAt = performance.now()
	const analysis = analyzeRegions(image)
	const candidates = buildCandidates(analysis, 12, true)
	const quantizedCandidates = buildCandidates(analysis, 7, false)
	const { palette: spatial, certificate } = paretoSolver(candidates, analysis)
	if (certificate === undefined) throw new Error("solveParetoPalette returned no certificate")
	const expressive = solvePalette(candidates, analysis, "expressive")
	const quantized = quantizedBaseline(quantizedCandidates, analysis)

	return {
		extraction: {
			version: PARETO_EXPERIMENT_VERSION,
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
