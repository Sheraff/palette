import {
	assignFieldRoles,
} from "./album-artwork-palette-v2.ts"
import type {
	ColorFamilyEvidence,
	ColorRepresentative,
	FieldHypothesis,
	GradientFitDiagnostic,
	NativePaletteEvidence,
} from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3FieldProposalV2Input,
	AlbumArtworkPaletteV2Phase3FieldProposalV2Module,
	AlbumArtworkPaletteV2Phase3FieldProposalV2Output,
	AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"
import {
	buildBandLocalEndpointRefinements,
} from "./album-artwork-palette-v2-phase-3-endpoint-refinement.ts"
import type {
	BandLocalEndpointRefinement,
} from "./album-artwork-palette-v2-phase-3-endpoint-refinement.ts"
import {
	discoverNativeFieldTransitions,
} from "./album-artwork-palette-v2-phase-3-field-transition.ts"
import type {
	NativeFieldTransitionDiscovery,
} from "./album-artwork-palette-v2-phase-3-field-transition.ts"
import { okDistance } from "./color.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_ID =
	"wave-3-field-proposal-v2-source-progression-salience-v1" as const

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_POLICY = Object.freeze({
	endpointBandFraction: 0.2,
	robustFamilySpreadFraction: 0.9,
	minimumRenderedEndpointDistance: 0.046,
	minimumSameFamilyRadialEndpointDistance: 0.058,
	minimumRelativeEndpointRatio: 1,
	minimumInterpolationPath: 0.46,
	minimumFieldCoverage: 0.42,
	minimumMonotonicity: 0.58,
	minimumSourceProgression: 0.54,
	minimumEndpointSalience: 0.39,
	minimumSameFamilyRadialEndpointSalience: 0.47,
	minimumJointGradientSupport: 0.48,
	bounds: Object.freeze({
		oneFieldProposals: 5,
		endpointPairProposals: 12,
		gradientProposals: 4,
		diagnosticCandidates: 24,
	}),
} as const)

export type AlbumArtworkPaletteV2Phase3FieldProposalV2Origin =
	"native-transition" | "band-local-endpoint"

export type AlbumArtworkPaletteV2Phase3FieldProposalV2CandidateDiagnostic = Readonly<{
	candidateId: string
	origin: AlbumArtworkPaletteV2Phase3FieldProposalV2Origin
	topology: NonNullable<FieldHypothesis["gradientEvidence"]>["topology"]
	direction: NonNullable<FieldHypothesis["gradientEvidence"]>["direction"]
	sameFamily: boolean
	endpointDistance: number
	withinBandSpread: number
	relativeEndpointRatio: number
	interpolationPath: number
	fieldCoverage: number
	monotonicity: number
	sourceProgression: number
	renderedEndpointSalience: number
	jointGradientSupport: number
	gradientEligible: boolean
	gradientEmitted: boolean
	flatCounterfactualEmitted: boolean
	rejectionReasons: readonly string[]
}>

export type AlbumArtworkPaletteV2Phase3FieldProposalV2Diagnostics = Readonly<{
	version: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_ID
	inputGradientFitCount: number
	nativeTransitionHypothesisCount: number
	bandLocalAcceptedCount: number
	normalizedCandidateCount: number
	oneFieldProposalCount: number
	flatCounterfactualCount: number
	gradientEligibleCount: number
	gradientProposalCount: number
	proposalCount: number
	omittedEndpointPairCount: number
	omittedGradientCount: number
	diagnosticCandidateCount: number
	omittedDiagnosticCandidateCount: number
	candidates: readonly AlbumArtworkPaletteV2Phase3FieldProposalV2CandidateDiagnostic[]
}>

export type AlbumArtworkPaletteV2Phase3FieldProposalV2Result =
	Omit<AlbumArtworkPaletteV2Phase3FieldProposalV2Output, "diagnostics"> & Readonly<{
		diagnostics: AlbumArtworkPaletteV2Phase3FieldProposalV2Diagnostics
	}>

type NormalizedCandidate = Readonly<{
	id: string
	origin: AlbumArtworkPaletteV2Phase3FieldProposalV2Origin
	hypothesis: FieldHypothesis
	supplementalFamilies: readonly ColorFamilyEvidence[]
	sameFamily: boolean
	endpointDistance: number
	withinBandSpread: number
	relativeEndpointRatio: number
	interpolationPath: number
	fieldCoverage: number
	monotonicity: number
	sourceProgression: number
	renderedEndpointSalience: number
	jointGradientSupport: number
	gradientEligible: boolean
	rejectionReasons: readonly string[]
}>

function clamp(value: number): number {
	return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function compareCandidates(first: NormalizedCandidate, second: NormalizedCandidate): number {
	return Number(second.gradientEligible) - Number(first.gradientEligible) ||
		second.jointGradientSupport - first.jointGradientSupport ||
		second.hypothesis.fieldFidelity - first.hypothesis.fieldFidelity ||
		compareAscii(first.id, second.id)
}

function geometricMean(values: readonly number[]): number {
	if (values.length === 0 || values.some((value) => clamp(value) === 0)) return 0
	return Math.pow(values.reduce((product, value) => product * clamp(value), 1), 1 / values.length)
}

function supportedGeometry(hypothesis: FieldHypothesis): boolean {
	const gradient = hypothesis.gradientEvidence
	return gradient !== null && (
		(gradient.topology === "linear" &&
			["horizontal", "vertical", "diagonal-down", "diagonal-up"].includes(gradient.direction)) ||
		((gradient.topology === "radial-center" || gradient.topology === "radial-upper-center") &&
			gradient.direction === "center-out")
	)
}

function uniqueRepresentatives(representatives: readonly ColorRepresentative[]): ColorRepresentative[] {
	const strategyOrder: Readonly<Record<ColorRepresentative["strategy"], number>> = {
		"dense-exact": 0,
		"nearest-prototype": 1,
		"density-synthesized": 2,
		"generated-emergency": 3,
	}
	return representatives.filter((representative) =>
		!("generated" in representative.support) && representative.support.regionIds.length > 0)
		.sort((first, second) => strategyOrder[first.strategy] - strategyOrder[second.strategy] ||
			compareAscii(first.hex, second.hex))
		.filter((representative, index, values) =>
			values.findIndex(({ rgb }) => rgb[0] === representative.rgb[0] &&
				rgb[1] === representative.rgb[1] && rgb[2] === representative.rgb[2]) === index)
}

function familyById(
	evidence: NativePaletteEvidence,
	familyId: string,
): ColorFamilyEvidence | undefined {
	return evidence.families.find(({ id }) => id === familyId)
}

function robustFamilySpread(
	evidence: NativePaletteEvidence,
	family: ColorFamilyEvidence,
): number {
	const familyIndex = evidence.families.findIndex(({ id }) => id === family.id)
	if (familyIndex < 0) return 0
	const distances: number[] = []
	for (let pixelIndex = 0; pixelIndex < evidence.pixelCount; pixelIndex++) {
		if (evidence.familyAt[pixelIndex] !== familyIndex) continue
		const offset = pixelIndex * 3
		distances.push(okDistance([
			evidence.labs[offset],
			evidence.labs[offset + 1],
			evidence.labs[offset + 2],
		], family.prototype))
	}
	if (distances.length === 0) return 0
	distances.sort((first, second) => first - second)
	const retainedCount = Math.max(1, Math.ceil(distances.length *
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_POLICY.robustFamilySpreadFraction))
	return Math.sqrt(distances.slice(0, retainedCount)
		.reduce((sum, distance) => sum + distance * distance, 0) / retainedCount)
}

function endpointSalience(
	endpointDistance: number,
	withinBandSpread: number,
): Readonly<{ relativeEndpointRatio: number; renderedEndpointSalience: number }> {
	const relativeEndpointRatio = endpointDistance / Math.max(0.006, withinBandSpread)
	const absolute = clamp((endpointDistance - 0.032) / 0.075)
	const relative = clamp((relativeEndpointRatio -
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_POLICY.minimumRelativeEndpointRatio) / 1.75)
	const joint = geometricMean([absolute, relative])
	return {
		relativeEndpointRatio,
		renderedEndpointSalience: clamp(0.65 * absolute + 0.35 * joint),
	}
}

function assessGradient(
	values: Readonly<{
		sameFamily: boolean
		radial: boolean
		endpointDistance: number
		withinBandSpread: number
		interpolationPath: number
		fieldCoverage: number
		monotonicity: number
		progression: number
	}>,
): Readonly<{
	relativeEndpointRatio: number
	sourceProgression: number
	renderedEndpointSalience: number
	jointGradientSupport: number
	gradientEligible: boolean
	rejectionReasons: readonly string[]
}> {
	const policy = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_POLICY
	const salience = endpointSalience(values.endpointDistance, values.withinBandSpread)
	const sourceProgression = geometricMean([
		values.progression,
		values.interpolationPath,
		values.fieldCoverage,
		values.monotonicity,
	])
	const jointGradientSupport = geometricMean([
		sourceProgression,
		salience.renderedEndpointSalience,
	])
	const minimumDistance = values.sameFamily && values.radial
		? policy.minimumSameFamilyRadialEndpointDistance
		: policy.minimumRenderedEndpointDistance
	const minimumSalience = values.sameFamily && values.radial
		? policy.minimumSameFamilyRadialEndpointSalience
		: policy.minimumEndpointSalience
	const rejectionReasons: string[] = []
	if (values.endpointDistance < minimumDistance) {
		rejectionReasons.push("rendered endpoints lack visible perceptual separation")
	}
	if (salience.relativeEndpointRatio < policy.minimumRelativeEndpointRatio) {
		rejectionReasons.push("endpoint separation does not exceed within-band spread")
	}
	if (values.interpolationPath < policy.minimumInterpolationPath) {
		rejectionReasons.push("occupied colors do not support the rendered interpolation path")
	}
	if (values.fieldCoverage < policy.minimumFieldCoverage) {
		rejectionReasons.push("progression lacks field-scale coverage")
	}
	if (values.monotonicity < policy.minimumMonotonicity) {
		rejectionReasons.push("progression is not sufficiently monotone")
	}
	if (sourceProgression < policy.minimumSourceProgression) {
		rejectionReasons.push("combined progression evidence is weak")
	}
	if (salience.renderedEndpointSalience < minimumSalience) {
		rejectionReasons.push(values.sameFamily && values.radial
			? "same-family radial endpoints would render as an inconsequential gradient"
			: "rendered endpoint salience is weak")
	}
	if (jointGradientSupport < policy.minimumJointGradientSupport) {
		rejectionReasons.push("progression and rendered salience do not jointly support gradient treatment")
	}
	return {
		...salience,
		sourceProgression,
		jointGradientSupport,
		gradientEligible: rejectionReasons.length === 0,
		rejectionReasons,
	}
}

function normalizedNativeCandidates(
	evidence: NativePaletteEvidence,
	discovery: NativeFieldTransitionDiscovery,
): NormalizedCandidate[] {
	const domainById = new Map(discovery.fieldDomains.map((domain) => [domain.id, domain]))
	const traceById = new Map(discovery.traces.filter(({ eligible }) => eligible)
		.map((trace) => [trace.fieldDomainId, trace]))
	return discovery.hypotheses.filter(supportedGeometry).flatMap((hypothesis): NormalizedCandidate[] => {
		const gradient = hypothesis.gradientEvidence
		if (!gradient) return []
		const trace = traceById.get(gradient.fieldDomainId)
		const domain = domainById.get(gradient.fieldDomainId)
		const firstFamily = familyById(evidence, gradient.supportingFamilyIds[0])
		const secondFamily = familyById(evidence, gradient.supportingFamilyIds[1])
		if (!trace || !domain || !firstFamily || !secondFamily) return []
		const backgroundRepresentatives = uniqueRepresentatives(hypothesis.backgroundRepresentatives)
		const surfaceRepresentatives = uniqueRepresentatives(hypothesis.surfaceRepresentatives)
		if (backgroundRepresentatives.length === 0 || surfaceRepresentatives.length === 0) return []
		const endpointDistance = okDistance(
			backgroundRepresentatives[0].oklab,
			surfaceRepresentatives[0].oklab,
		)
		const withinBandSpread = robustFamilySpread(evidence, firstFamily) +
			robustFamilySpread(evidence, secondFamily)
		const interpolationPath = clamp(
			0.40 * trace.colorDirectness +
			0.35 * trace.localContinuity +
			0.25 * (1 - trace.branching),
		)
		const fieldCoverage = clamp(
			0.50 * clamp(domain.populationFraction / 0.65) +
			0.30 * clamp(domain.borderCoverage / 0.5) +
			0.20 * clamp((domain.ownedCornerCount + domain.quadrantCoverage) / 4),
		)
		const monotonicity = clamp((trace.spatialProgression + trace.colorProgression) / 2)
		const progression = clamp(Math.min(
			trace.spatialProgression,
			trace.colorProgression,
			trace.colorDirectness,
		))
		const assessment = assessGradient({
			sameFamily: false,
			radial: gradient.topology !== "linear",
			endpointDistance,
			withinBandSpread,
			interpolationPath,
			fieldCoverage,
			monotonicity,
			progression,
		})
		const normalizedHypothesis: FieldHypothesis = {
			...hypothesis,
			id: `field-proposal-v2:gradient:${hypothesis.id}`,
			backgroundRepresentatives,
			surfaceRepresentatives,
			fieldFidelity: clamp(
				0.45 * hypothesis.fieldFidelity +
				0.30 * assessment.sourceProgression +
				0.25 * assessment.renderedEndpointSalience,
			),
			surfaceContribution: clamp(
				0.45 * assessment.renderedEndpointSalience +
				0.35 * assessment.sourceProgression +
				0.20 * fieldCoverage,
			),
			pruningNotes: [
				...hypothesis.pruningNotes,
				"normalized through joint progression and rendered endpoint salience",
			],
		}
		return [{
			id: normalizedHypothesis.id,
			origin: "native-transition",
			hypothesis: normalizedHypothesis,
			supplementalFamilies: [],
			sameFamily: false,
			endpointDistance,
			withinBandSpread,
			interpolationPath,
			fieldCoverage,
			monotonicity,
			...assessment,
		}]
	})
}

function matchingDiagnostic(
	refinement: BandLocalEndpointRefinement,
	diagnostics: readonly GradientFitDiagnostic[],
): GradientFitDiagnostic | undefined {
	return diagnostics.find((diagnostic) =>
		diagnostic.fieldDomainId === refinement.fit.fieldDomainId &&
		diagnostic.topology === refinement.fit.topology &&
		diagnostic.direction === refinement.fit.direction &&
		diagnostic.lowEndpointFamilyId === refinement.parentFamilyId &&
		diagnostic.highEndpointFamilyId === refinement.parentFamilyId)
}

function endpointHypothesis(
	refinement: BandLocalEndpointRefinement,
	diagnostic: GradientFitDiagnostic,
): FieldHypothesis | null {
	if (!refinement.accepted || !refinement.low || !refinement.high) return null
	const low = refinement.low
	const high = refinement.high
	const lowRepresentatives = uniqueRepresentatives(low.family.representatives)
	const highRepresentatives = uniqueRepresentatives(high.family.representatives)
	if (lowRepresentatives.length === 0 || highRepresentatives.length === 0) return null
	const roleAssignment = assignFieldRoles(low.family, high.family)
	const backgroundIsLow = roleAssignment.backgroundFamilyId === low.family.id
	const background = backgroundIsLow ? low : high
	const surface = backgroundIsLow ? high : low
	const backgroundRepresentatives = backgroundIsLow ? lowRepresentatives : highRepresentatives
	const surfaceRepresentatives = backgroundIsLow ? highRepresentatives : lowRepresentatives
	const fitCoverage = clamp(1 - refinement.fit.residual / Math.max(0.001, refinement.fit.span))
	const supportingComponentIds = [...new Set([
		...low.family.components.map(({ id }) => id),
		...high.family.components.map(({ id }) => id),
	])].sort(compareAscii)
	return {
		id: `field-proposal-v2:gradient:endpoint:${refinement.id}`,
		kind: "gradient-field",
		backgroundFamilyId: background.family.id,
		surfaceFamilyId: surface.family.id,
		backgroundRepresentatives,
		surfaceRepresentatives,
		fieldFidelity: clamp(
			0.28 * refinement.fit.progression +
			0.24 * refinement.fit.monotonicity +
			0.20 * fitCoverage +
			0.16 * clamp(refinement.endpointDistance / 0.12) +
			0.12 * clamp(diagnostic.fieldDomainPopulationFraction / 0.65),
		),
		surfaceContribution: clamp(
			0.38 * refinement.fit.progression +
			0.32 * clamp(refinement.endpointDistance / 0.12) +
			0.18 * fitCoverage +
			0.12 * clamp(diagnostic.fieldDomainPopulationFraction / 0.65),
		),
		spatialRelation: null,
		roleAssignment,
		gradientEvidence: {
			topology: refinement.fit.topology,
			direction: refinement.fit.direction,
			endpointBands: [
				ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_POLICY.endpointBandFraction,
				1 - ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_POLICY.endpointBandFraction,
			],
			progression: refinement.fit.progression,
			modeProgression: clamp(refinement.occupiedModeDistance / 0.12),
			monotonicity: refinement.fit.monotonicity,
			residual: refinement.fit.residual,
			span: refinement.fit.span,
			texture: low.distribution.robustSpread + high.distribution.robustSpread,
			bandDispersion: clamp(
				(low.distribution.robustSpread + high.distribution.robustSpread) /
				Math.max(0.001, refinement.endpointDistance),
			),
			edgeContinuity: diagnostic.edgeContinuity,
			coverage: fitCoverage,
			supportingFamilyIds: [low.family.id, high.family.id],
			supportingEndpointHexes: [lowRepresentatives[0].hex, highRepresentatives[0].hex],
			backgroundTopologyEndpoint: backgroundIsLow ? "low" : "high",
			roleAssignment,
			fieldDomainId: refinement.fit.fieldDomainId,
			fieldDomainPopulationFraction: diagnostic.fieldDomainPopulationFraction,
			fieldDomainBorderCoverage: Math.max(low.family.borderCoverage, high.family.borderCoverage),
			fieldDomainOwnedCornerCount: Math.round(4 * Math.max(
				low.family.cornerCoverage,
				high.family.cornerCoverage,
			)),
			supportingComponentIds,
		},
		pruningNotes: [
			"normalized from occupied band-local endpoint distributions",
			"gradient treatment remains conditional on progression and rendered endpoint salience",
		],
	}
}

function normalizedEndpointCandidates(
	diagnostics: readonly GradientFitDiagnostic[],
	refinements: readonly BandLocalEndpointRefinement[],
): NormalizedCandidate[] {
	return refinements.flatMap((refinement): NormalizedCandidate[] => {
		const diagnostic = matchingDiagnostic(refinement, diagnostics)
		if (!diagnostic) return []
		const hypothesis = endpointHypothesis(refinement, diagnostic)
		if (!hypothesis || !supportedGeometry(hypothesis) || !refinement.low || !refinement.high) return []
		const low = refinement.low
		const high = refinement.high
		const endpointDistance = okDistance(
			low.family.representatives[0].oklab,
			high.family.representatives[0].oklab,
		)
		const withinBandSpread = low.distribution.robustSpread + high.distribution.robustSpread
		const fitQuality = clamp(1 - refinement.fit.residual / Math.max(0.001, refinement.fit.span))
		const interpolationPath = clamp(
			0.45 * fitQuality +
			0.30 * diagnostic.edgeContinuity +
			0.25 * (1 - clamp(diagnostic.bandDispersion)),
		)
		const fieldCoverage = geometricMean([
			clamp(diagnostic.fieldDomainPopulationFraction / 0.65),
			fitQuality,
		])
		const monotonicity = clamp(refinement.fit.monotonicity)
		const progression = clamp(Math.min(refinement.fit.progression, diagnostic.progression))
		const assessment = assessGradient({
			sameFamily: true,
			radial: refinement.fit.topology !== "linear",
			endpointDistance,
			withinBandSpread,
			interpolationPath,
			fieldCoverage,
			monotonicity,
			progression,
		})
		const rescoredHypothesis: FieldHypothesis = {
			...hypothesis,
			fieldFidelity: clamp(
				0.40 * hypothesis.fieldFidelity +
				0.32 * assessment.sourceProgression +
				0.28 * assessment.renderedEndpointSalience,
			),
			surfaceContribution: clamp(
				0.48 * assessment.renderedEndpointSalience +
				0.32 * assessment.sourceProgression +
				0.20 * fieldCoverage,
			),
		}
		return [{
			id: rescoredHypothesis.id,
			origin: "band-local-endpoint",
			hypothesis: rescoredHypothesis,
			supplementalFamilies: [low.family, high.family],
			sameFamily: true,
			endpointDistance,
			withinBandSpread,
			interpolationPath,
			fieldCoverage,
			monotonicity,
			...assessment,
		}]
	})
}

function oneFieldHypotheses(evidence: NativePaletteEvidence): FieldHypothesis[] {
	const fieldFamilyIds = evidence.lanes.find(({ name }) => name === "field")?.familyIds ?? []
	return fieldFamilyIds.flatMap((familyId): FieldHypothesis[] => {
		const family = familyById(evidence, familyId)
		if (!family) return []
		const representatives = uniqueRepresentatives(family.representatives)
		if (representatives.length === 0) return []
		return [{
			id: `field-proposal-v2:one:${family.id}`,
			kind: "one-field",
			backgroundFamilyId: family.id,
			surfaceFamilyId: null,
			backgroundRepresentatives: representatives,
			surfaceRepresentatives: representatives,
			fieldFidelity: family.fieldScore,
			surfaceContribution: 0,
			spatialRelation: null,
			roleAssignment: null,
			gradientEvidence: null,
			pruningNotes: ["retained as a source-supported flat field counterfactual"],
		}]
	}).slice(0, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_POLICY.bounds.oneFieldProposals)
}

function pairKey(candidate: NormalizedCandidate): string {
	const hypothesis = candidate.hypothesis
	return [
		hypothesis.backgroundFamilyId,
		hypothesis.surfaceFamilyId ?? "collapsed",
		hypothesis.backgroundRepresentatives[0]?.hex ?? "missing",
		hypothesis.surfaceRepresentatives[0]?.hex ?? "missing",
	].join(":")
}

function flatCounterfactual(candidate: NormalizedCandidate): FieldHypothesis {
	const hypothesis = candidate.hypothesis
	const roleAssignment = hypothesis.roleAssignment
	const backgroundProfile = roleAssignment?.backgroundProfile
	const surfaceProfile = roleAssignment?.surfaceProfile
	const borderInterior = backgroundProfile && surfaceProfile
		? clamp(Math.abs(backgroundProfile.frameCoverage - surfaceProfile.frameCoverage) +
			Math.abs(backgroundProfile.peripheralCoverage - surfaceProfile.peripheralCoverage)) / 2
		: 0
	const fieldOwnership = backgroundProfile && surfaceProfile
		? Math.min(backgroundProfile.fieldScore, surfaceProfile.fieldScore)
		: candidate.fieldCoverage
	return {
		...hypothesis,
		id: `field-proposal-v2:flat:${pairKey(candidate)}`,
		kind: "separate-flat-fields",
		fieldFidelity: clamp(
			0.38 * hypothesis.fieldFidelity +
			0.24 * candidate.fieldCoverage +
			0.20 * candidate.renderedEndpointSalience +
			0.18 * fieldOwnership,
		),
		surfaceContribution: clamp(
			0.40 * candidate.renderedEndpointSalience +
			0.32 * candidate.fieldCoverage +
			0.28 * fieldOwnership,
		),
		spatialRelation: {
			adjacency: candidate.interpolationPath,
			borderInterior,
			separation: candidate.renderedEndpointSalience,
			coverage: candidate.fieldCoverage,
			fieldOwnership,
		},
		gradientEvidence: null,
		pruningNotes: [
			`retained as the exact endpoint-pair flat counterfactual to ${candidate.origin}`,
		],
	}
}

function sourced(hypothesis: FieldHypothesis): AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis {
	return { sourceType: "field-proposal-v2", hypothesis }
}

export function proposeAlbumArtworkPaletteV2Phase3Fields(
	input: AlbumArtworkPaletteV2Phase3FieldProposalV2Input,
): AlbumArtworkPaletteV2Phase3FieldProposalV2Result {
	const discovery = discoverNativeFieldTransitions(input.evidence)
	const endpointReport = buildBandLocalEndpointRefinements(input.evidence, input.gradientFits)
	const candidates = [
		...normalizedNativeCandidates(input.evidence, discovery),
		...normalizedEndpointCandidates(input.gradientFits, endpointReport.refinements),
	].sort(compareCandidates)
	const oneFields = oneFieldHypotheses(input.evidence)

	const strongestPairCandidates = new Map<string, NormalizedCandidate>()
	for (const candidate of candidates) {
		const key = pairKey(candidate)
		const incumbent = strongestPairCandidates.get(key)
		if (!incumbent || compareCandidates(candidate, incumbent) < 0) {
			strongestPairCandidates.set(key, candidate)
		}
	}
	const pairCandidates = [...strongestPairCandidates.values()].sort(compareCandidates)
	const eligibleGradients = candidates.filter(({ gradientEligible }) => gradientEligible)
		.filter((candidate, index, values) => values.findIndex((value) => pairKey(value) === pairKey(candidate)) === index)
	const emittedGradients = eligibleGradients
		.slice(0, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_POLICY.bounds.gradientProposals)
	const requiredFlatKeys = new Set(emittedGradients.map(pairKey))
	const emittedPairCandidates: NormalizedCandidate[] = []
	const emittedPairKeys = new Set<string>()
	const retainPair = (candidate: NormalizedCandidate): void => {
		const key = pairKey(candidate)
		if (emittedPairKeys.has(key) || emittedPairCandidates.length >=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_POLICY.bounds.endpointPairProposals) return
		emittedPairKeys.add(key)
		emittedPairCandidates.push(candidate)
	}
	for (const gradient of emittedGradients) retainPair(gradient)
	for (const candidate of pairCandidates) retainPair(candidate)
	if ([...requiredFlatKeys].some((key) => !emittedPairKeys.has(key))) {
		throw new Error("Field proposal v2 omitted a gradient's exact flat counterfactual")
	}
	const flatCounterfactuals = emittedPairCandidates.map(flatCounterfactual)
	const gradientHypotheses = emittedGradients.map(({ hypothesis }) => hypothesis)
	const hypotheses = [...oneFields, ...flatCounterfactuals, ...gradientHypotheses]
	const supplementalFamilyIds = new Set(emittedPairCandidates.flatMap(({ supplementalFamilies }) =>
		supplementalFamilies.map(({ id }) => id)))
	const supplementalFamilies = candidates.flatMap(({ supplementalFamilies }) => supplementalFamilies)
		.filter(({ id }, index, values) => supplementalFamilyIds.has(id) &&
			values.findIndex((family) => family.id === id) === index)
		.sort((first, second) => compareAscii(first.id, second.id))
	const emittedGradientIds = new Set(gradientHypotheses.map(({ id }) => id))
	const diagnosticCandidates = candidates
		.slice(0, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_POLICY.bounds.diagnosticCandidates)
		.map((candidate): AlbumArtworkPaletteV2Phase3FieldProposalV2CandidateDiagnostic => ({
			candidateId: candidate.id,
			origin: candidate.origin,
			topology: candidate.hypothesis.gradientEvidence!.topology,
			direction: candidate.hypothesis.gradientEvidence!.direction,
			sameFamily: candidate.sameFamily,
			endpointDistance: candidate.endpointDistance,
			withinBandSpread: candidate.withinBandSpread,
			relativeEndpointRatio: candidate.relativeEndpointRatio,
			interpolationPath: candidate.interpolationPath,
			fieldCoverage: candidate.fieldCoverage,
			monotonicity: candidate.monotonicity,
			sourceProgression: candidate.sourceProgression,
			renderedEndpointSalience: candidate.renderedEndpointSalience,
			jointGradientSupport: candidate.jointGradientSupport,
			gradientEligible: candidate.gradientEligible,
			gradientEmitted: emittedGradientIds.has(candidate.hypothesis.id),
			flatCounterfactualEmitted: emittedPairKeys.has(pairKey(candidate)),
			rejectionReasons: candidate.rejectionReasons,
		}))
	return {
		fieldHypotheses: hypotheses.map(sourced),
		supplementalFamilies,
		diagnostics: {
			version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_ID,
			inputGradientFitCount: input.gradientFits.length,
			nativeTransitionHypothesisCount: discovery.hypotheses.length,
			bandLocalAcceptedCount: endpointReport.acceptedCount,
			normalizedCandidateCount: candidates.length,
			oneFieldProposalCount: oneFields.length,
			flatCounterfactualCount: flatCounterfactuals.length,
			gradientEligibleCount: eligibleGradients.length,
			gradientProposalCount: gradientHypotheses.length,
			proposalCount: hypotheses.length,
			omittedEndpointPairCount: Math.max(0, pairCandidates.length - emittedPairCandidates.length),
			omittedGradientCount: Math.max(0, eligibleGradients.length - gradientHypotheses.length),
			diagnosticCandidateCount: diagnosticCandidates.length,
			omittedDiagnosticCandidateCount: Math.max(0, candidates.length - diagnosticCandidates.length),
			candidates: diagnosticCandidates,
		},
	}
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_MODULE:
	AlbumArtworkPaletteV2Phase3FieldProposalV2Module = Object.freeze({
		propose: proposeAlbumArtworkPaletteV2Phase3Fields,
	})
