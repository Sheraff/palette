import type {
	BackgroundFieldDomainEvidence,
	FieldHypothesis,
	GradientDirection,
	GradientTopology,
} from "./album-artwork-palette-v2.ts"
import type {
	FieldTransitionTrace,
	NativeFieldTransitionDiscovery,
} from "./album-artwork-palette-v2-phase-3-field-transition.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_TRANSITION_ENVELOPE_V4_ID =
	"album-artwork-palette-v2-phase-3-native-transition-envelope-v4" as const

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_TRANSITION_ENVELOPE_V4_POLICY = Object.freeze({
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

type TransitionEligibilityEnvelope = Readonly<{
	minimumPopulationFraction: number
	minimumBorderCoverage: number
	minimumQuadrantCoverage: number
	minimumOwnedCornerCount: number
}>

export type AlbumArtworkPaletteV2Phase3TransitionEnvelopeV4Scores = Readonly<{
	population: number
	perimeter: number
	quadrants: number
	corners: number
	aggregate: number
}>

export type AlbumArtworkPaletteV2Phase3TransitionEnvelopeV4Entry = Readonly<{
	fieldDomainId: string
	hypothesisId: string | null
	topology: GradientTopology | null
	direction: GradientDirection | null
	acceptedBeforeNormalization: boolean
	credited: boolean
	raw: Readonly<{
		populationFraction: number
		borderCoverage: number
		quadrantCoverage: number
		ownedCornerCount: number
	}>
	normalized: AlbumArtworkPaletteV2Phase3TransitionEnvelopeV4Scores | null
	originalFieldFidelity: number | null
	normalizedFieldFidelity: number | null
}>

export type AlbumArtworkPaletteV2Phase3TransitionEnvelopeV4Diagnostics = Readonly<{
	version: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_TRANSITION_ENVELOPE_V4_ID
	policy: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_TRANSITION_ENVELOPE_V4_POLICY
	discoveredDomainCount: number
	acceptedDomainCount: number
	hypothesisCount: number
	creditedHypothesisCount: number
	creditedHypothesisIds: readonly string[]
	entries: readonly AlbumArtworkPaletteV2Phase3TransitionEnvelopeV4Entry[]
}>

export type AlbumArtworkPaletteV2Phase3TransitionEnvelopeV4Result = Readonly<{
	hypotheses: readonly FieldHypothesis[]
	diagnostics: AlbumArtworkPaletteV2Phase3TransitionEnvelopeV4Diagnostics
}>

function clamp(value: number): number {
	return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function eligibilityEnvelope(topology: GradientTopology): TransitionEligibilityEnvelope {
	return topology === "linear"
		? ALBUM_ARTWORK_PALETTE_V2_PHASE_3_TRANSITION_ENVELOPE_V4_POLICY.linear
		: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_TRANSITION_ENVELOPE_V4_POLICY.radial
}

function relativeToMinimum(value: number, minimum: number): number {
	return minimum <= 0 ? clamp(value) : clamp(value / minimum)
}

function normalizedEnvelope(
	domain: BackgroundFieldDomainEvidence,
	trace: FieldTransitionTrace,
): AlbumArtworkPaletteV2Phase3TransitionEnvelopeV4Scores {
	const minimum = eligibilityEnvelope(trace.topology)
	const population = relativeToMinimum(
		domain.populationFraction,
		minimum.minimumPopulationFraction,
	)
	const perimeter = relativeToMinimum(domain.borderCoverage, minimum.minimumBorderCoverage)
	const quadrants = relativeToMinimum(domain.quadrantCoverage, minimum.minimumQuadrantCoverage)
	const corners = relativeToMinimum(domain.ownedCornerCount, minimum.minimumOwnedCornerCount)
	return {
		population,
		perimeter,
		quadrants,
		corners,
		aggregate: (population + perimeter + quadrants + corners) / 4,
	}
}

function normalizedFieldFidelity(
	domain: BackgroundFieldDomainEvidence,
	trace: FieldTransitionTrace,
	envelope: AlbumArtworkPaletteV2Phase3TransitionEnvelopeV4Scores,
): number {
	const weights = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_TRANSITION_ENVELOPE_V4_POLICY.fieldFidelityWeights
	const progression = Math.min(trace.spatialProgression, trace.colorProgression)
	return clamp(
		weights.weightedFieldScore * domain.weightedFieldScore +
		weights.nativeEnvelope * envelope.aggregate +
		weights.progression * progression +
		weights.localContinuity * trace.localContinuity +
		weights.lowBranching * (1 - trace.branching),
	)
}

export function normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(
	discovery: NativeFieldTransitionDiscovery,
): AlbumArtworkPaletteV2Phase3TransitionEnvelopeV4Result {
	const domains = new Map(discovery.fieldDomains.map((domain) => [domain.id, domain]))
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
	const entries: AlbumArtworkPaletteV2Phase3TransitionEnvelopeV4Entry[] = []
	for (const domain of [...domains.values()].sort((first, second) => compareAscii(first.id, second.id))) {
		const trace = traces.get(domain.id)
		const hypotheses = [...(hypothesesByDomain.get(domain.id) ?? [])]
			.sort((first, second) => compareAscii(first.id, second.id))
		const accepted = domain.eligible && trace?.eligible === true
		const envelope = accepted && trace ? normalizedEnvelope(domain, trace) : null
		const fidelity = envelope && trace ? normalizedFieldFidelity(domain, trace, envelope) : null
		const diagnosticHypotheses: readonly (FieldHypothesis | null)[] = hypotheses.length > 0
			? hypotheses
			: [null]
		for (const hypothesis of diagnosticHypotheses) {
			const credited = accepted && hypothesis !== null && fidelity !== null
			if (credited) normalizedById.set(hypothesis.id, { ...hypothesis, fieldFidelity: fidelity })
			entries.push({
				fieldDomainId: domain.id,
				hypothesisId: hypothesis?.id ?? null,
				topology: trace?.topology ?? null,
				direction: trace?.direction ?? null,
				acceptedBeforeNormalization: accepted,
				credited,
				raw: {
					populationFraction: domain.populationFraction,
					borderCoverage: domain.borderCoverage,
					quadrantCoverage: domain.quadrantCoverage,
					ownedCornerCount: domain.ownedCornerCount,
				},
				normalized: credited ? envelope : null,
				originalFieldFidelity: hypothesis?.fieldFidelity ?? null,
				normalizedFieldFidelity: credited ? fidelity : null,
			})
		}
	}
	const hypotheses = discovery.hypotheses.map((hypothesis) => normalizedById.get(hypothesis.id) ?? hypothesis)
	const creditedHypothesisIds = entries.filter(({ credited }) => credited)
		.map(({ hypothesisId }) => hypothesisId!)
		.sort(compareAscii)
	return {
		hypotheses,
		diagnostics: {
			version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_TRANSITION_ENVELOPE_V4_ID,
			policy: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_TRANSITION_ENVELOPE_V4_POLICY,
			discoveredDomainCount: discovery.fieldDomains.length,
			acceptedDomainCount: discovery.fieldDomains.filter(({ id, eligible }) =>
				eligible && traces.get(id)?.eligible === true).length,
			hypothesisCount: discovery.hypotheses.length,
			creditedHypothesisCount: creditedHypothesisIds.length,
			creditedHypothesisIds,
			entries,
		},
	}
}
