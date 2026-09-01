import { extractRegionGraph017PaletteWithContext } from "./region-graph-0.17-extract.ts"
import {
	analyzeGradientEligibility,
	decideGradientEligibility,
	GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	type GradientEligibilityDecision,
	type GradientEligibilityEvidence,
} from "./gradient-eligibility.ts"
import type { ExtractionResult, RawImage, RGB } from "./types.ts"

export type GradientEligibilityCertificate = {
	schemaVersion: 1
	algorithmVersion: typeof GRADIENT_ELIGIBILITY_CANDIDATE_VERSION
	baselineAlgorithmVersion: "region-graph-0.17.0"
	baselineGradient: boolean
	decision: GradientEligibilityDecision | { eligible: false; reason: "baseline-not-gradient" }
	evidence: GradientEligibilityEvidence | null
	invariants: {
		rolesUnchanged: true
		pairSpecificEvidenceOnly: true
		globalSmoothFallbackDisabled: true
	}
}

export type GradientEligibilityExtractionResult = {
	extraction: ExtractionResult
	certificate: GradientEligibilityCertificate
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

export function extractGradientEligiblePalette(image: RawImage): GradientEligibilityExtractionResult {
	const startedAt = performance.now()
	const { extraction: baseline, analysis, candidates } = extractRegionGraph017PaletteWithContext(image)
	const spatial = baseline.methods.spatial
	let evidence: GradientEligibilityEvidence | null = null
	let decision: GradientEligibilityCertificate["decision"] = { eligible: false, reason: "baseline-not-gradient" }
	if (spatial.gradient.isGradient) {
		const background = candidates.find((candidate) => sameRgb(candidate.rgb, spatial.background.rgb))
		const surface = candidates.find((candidate) => sameRgb(candidate.rgb, spatial.surface.rgb))
		if (!background || !surface) throw new Error("Canonical gradient endpoints are absent from the source candidate set")
		evidence = analyzeGradientEligibility(background, surface, analysis)
		decision = decideGradientEligibility(evidence)
	}
	return {
		extraction: {
			...baseline,
			version: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
			methods: {
				...baseline.methods,
				spatial: {
					...spatial,
					gradient: { ...spatial.gradient, isGradient: decision.eligible },
				},
			},
			diagnostics: {
				...baseline.diagnostics,
				processingMs: Math.round(performance.now() - startedAt),
			},
		},
		certificate: {
			schemaVersion: 1,
			algorithmVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
			baselineAlgorithmVersion: "region-graph-0.17.0",
			baselineGradient: spatial.gradient.isGradient,
			decision,
			evidence,
			invariants: {
				rolesUnchanged: true,
				pairSpecificEvidenceOnly: true,
				globalSmoothFallbackDisabled: true,
			},
		},
	}
}
