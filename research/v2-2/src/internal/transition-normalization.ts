import type { BackgroundFieldDomainEvidence, FieldHypothesis, GradientTopology } from "./palette-core.ts";

import type { FieldTransitionTrace, NativeFieldTransitionDiscovery } from "./field-transition.ts";

const POLICY = Object.freeze({
	linear: Object.freeze({
		minimumPopulationFraction: 0.16,
		minimumBorderCoverage: 0.2,
		minimumQuadrantCoverage: 0.75,
		minimumOwnedCornerCount: 2,
	}),
	radial: Object.freeze({
		minimumPopulationFraction: 0.65,
		minimumBorderCoverage: 0.25,
		minimumQuadrantCoverage: 1,
		minimumOwnedCornerCount: 4,
	}),
	fieldFidelityWeights: Object.freeze({
		weightedFieldScore: 0.3,
		nativeEnvelope: 0.25,
		progression: 0.2,
		localContinuity: 0.15,
		lowBranching: 0.1,
	}),
})

type EnvelopeScores = Readonly<{
	population: number
	perimeter: number
	quadrants: number
	corners: number
	aggregate: number
}>

function clamp(value: number): number {
	return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function minimumEnvelope(topology: GradientTopology) {
	return topology === "linear" ? POLICY.linear : POLICY.radial
}

function relativeToMinimum(value: number, minimum: number): number {
	return minimum <= 0 ? clamp(value) : clamp(value / minimum)
}

function envelopeScores(
	domain: BackgroundFieldDomainEvidence,
	trace: FieldTransitionTrace,
): EnvelopeScores {
	const minimum = minimumEnvelope(trace.topology)
	const population = relativeToMinimum(domain.populationFraction, minimum.minimumPopulationFraction)
	const perimeter = relativeToMinimum(domain.borderCoverage, minimum.minimumBorderCoverage)
	const quadrants = relativeToMinimum(domain.quadrantCoverage, minimum.minimumQuadrantCoverage)
	const corners = relativeToMinimum(domain.ownedCornerCount, minimum.minimumOwnedCornerCount)
	return { population, perimeter, quadrants, corners, aggregate: (population + perimeter + quadrants + corners) / 4 }
}

function normalizedFieldFidelity(
	domain: BackgroundFieldDomainEvidence,
	trace: FieldTransitionTrace,
	envelope: EnvelopeScores,
): number {
	const weights = POLICY.fieldFidelityWeights
	return clamp(
		weights.weightedFieldScore * domain.weightedFieldScore +
		weights.nativeEnvelope * envelope.aggregate +
		weights.progression * Math.min(trace.spatialProgression, trace.colorProgression) +
		weights.localContinuity * trace.localContinuity +
		weights.lowBranching * (1 - trace.branching),
	)
}

export function normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(
	discovery: NativeFieldTransitionDiscovery,
): Readonly<{ hypotheses: readonly FieldHypothesis[]; creditedHypothesisIds: readonly string[] }> {
	const traces = new Map(discovery.traces.map((trace) => [trace.fieldDomainId, trace]))
	const hypothesesByDomain = new Map<string, FieldHypothesis[]>()
	for (const hypothesis of discovery.hypotheses) {
		const fieldDomainId = hypothesis.gradientEvidence?.fieldDomainId
		if (!fieldDomainId) continue
		const values = hypothesesByDomain.get(fieldDomainId) ?? []
		values.push(hypothesis)
		hypothesesByDomain.set(fieldDomainId, values)
	}

	const normalizedById = new Map<string, FieldHypothesis>()
	const creditedHypothesisIds: string[] = []
	for (const domain of [...discovery.fieldDomains].sort((first, second) => compareAscii(first.id, second.id))) {
		const trace = traces.get(domain.id)
		if (!domain.eligible || !trace?.eligible) continue
		const fidelity = normalizedFieldFidelity(domain, trace, envelopeScores(domain, trace))
		for (const hypothesis of [...(hypothesesByDomain.get(domain.id) ?? [])]
			.sort((first, second) => compareAscii(first.id, second.id))) {
			normalizedById.set(hypothesis.id, { ...hypothesis, fieldFidelity: fidelity })
			creditedHypothesisIds.push(hypothesis.id)
		}
	}
	return {
		hypotheses: discovery.hypotheses.map((hypothesis) => normalizedById.get(hypothesis.id) ?? hypothesis),
		creditedHypothesisIds: creditedHypothesisIds.sort(compareAscii),
	}
}
