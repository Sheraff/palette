import type { Candidate } from "./candidates.ts"
import { ALGORITHM_VERSION, extractPaletteWithContext } from "./extract.ts"
import { analyzeGradientFieldTopology, type GradientFieldTopologyEvidence } from "./gradient-field-topology.ts"
import {
	scoreGradientFieldTopologyEvidence,
	type GradientFieldTopologyModelDecision,
} from "./gradient-field-topology-model.ts"
import type { ExtractionResult, RawImage, RGB } from "./types.ts"

export const GRADIENT_FIELD_TOPOLOGY_EXPERIMENT_VERSION =
	"gradient-field-topology-model-3.0.0-experimental" as const

type DirectedEndpoint = {
	candidateId: number
	rgb: RGB
}

type GradientFieldTopologyCertificateBase = {
	schemaVersion: 1
	algorithmVersion: typeof GRADIENT_FIELD_TOPOLOGY_EXPERIMENT_VERSION
	baselineAlgorithmVersion: typeof ALGORITHM_VERSION
	invariants: {
		rolesUnchanged: true
		canonicalGradientOnly: true
		exactDirectedCandidateMatch: true
	}
}

export type GradientFieldTopologyCertificate = GradientFieldTopologyCertificateBase & ({
	baselineGradient: false
	directedEndpoints: null
	evidence: null
	decision: { eligible: false; reason: "baseline-not-gradient" }
} | {
	baselineGradient: true
	directedEndpoints: {
		background: DirectedEndpoint
		surface: DirectedEndpoint
	}
	evidence: GradientFieldTopologyEvidence
	decision: GradientFieldTopologyModelDecision
})

export type GradientFieldTopologyExtractionResult = {
	extraction: ExtractionResult
	certificate: GradientFieldTopologyCertificate
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function exactCandidate(candidates: Candidate[], rgb: RGB, role: "background" | "surface"): Candidate {
	const matches = candidates.filter((candidate) => sameRgb(candidate.rgb, rgb))
	if (matches.length !== 1) {
		throw new Error(`Canonical ${role} candidate lookup returned ${matches.length} exact RGB matches`)
	}
	return matches[0]
}

export function extractGradientFieldTopologyPalette(image: RawImage): GradientFieldTopologyExtractionResult {
	const startedAt = performance.now()
	const { extraction: baseline, analysis, candidates } = extractPaletteWithContext(image)
	const spatial = baseline.methods.spatial
	let certificate: GradientFieldTopologyCertificate
	if (!spatial.gradient.isGradient) {
		certificate = {
			schemaVersion: 1,
			algorithmVersion: GRADIENT_FIELD_TOPOLOGY_EXPERIMENT_VERSION,
			baselineAlgorithmVersion: ALGORITHM_VERSION,
			baselineGradient: false,
			directedEndpoints: null,
			evidence: null,
			decision: { eligible: false, reason: "baseline-not-gradient" },
			invariants: {
				rolesUnchanged: true,
				canonicalGradientOnly: true,
				exactDirectedCandidateMatch: true,
			},
		}
	} else {
		const background = exactCandidate(candidates, spatial.background.rgb, "background")
		const surface = exactCandidate(candidates, spatial.surface.rgb, "surface")
		const evidence = analyzeGradientFieldTopology(background, surface, analysis)
		certificate = {
			schemaVersion: 1,
			algorithmVersion: GRADIENT_FIELD_TOPOLOGY_EXPERIMENT_VERSION,
			baselineAlgorithmVersion: ALGORITHM_VERSION,
			baselineGradient: true,
			directedEndpoints: {
				background: { candidateId: background.id, rgb: background.rgb },
				surface: { candidateId: surface.id, rgb: surface.rgb },
			},
			evidence,
			decision: scoreGradientFieldTopologyEvidence(evidence),
			invariants: {
				rolesUnchanged: true,
				canonicalGradientOnly: true,
				exactDirectedCandidateMatch: true,
			},
		}
	}

	return {
		extraction: {
			...baseline,
			version: GRADIENT_FIELD_TOPOLOGY_EXPERIMENT_VERSION,
			methods: {
				...baseline.methods,
				spatial: {
					...spatial,
					gradient: { ...spatial.gradient, isGradient: certificate.decision.eligible },
				},
			},
			diagnostics: {
				...baseline.diagnostics,
				processingMs: Math.round(performance.now() - startedAt),
			},
		},
		certificate,
	}
}
