import { completeTreatmentKey, constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } from "./album-artwork-palette-v2.ts";

import type { ColorFamilyEvidence, CompletePaletteTreatment, FieldHypothesis, NativePaletteEvidence } from "./album-artwork-palette-v2.ts";

import { ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY } from "./album-artwork-palette-v2-phase-3-endpoint-refinement.ts";

import { buildAlbumArtworkPaletteV2Phase3ComponentLocalEndpointArm } from "./album-artwork-palette-v2-phase-3-arm-component-local-endpoint.ts";

import type { AlbumArtworkPaletteV2Phase3ComponentLocalEndpointFamily, AlbumArtworkPaletteV2Phase3ComponentLocalEndpointReport } from "./album-artwork-palette-v2-phase-3-arm-component-local-endpoint.ts";

import type { AlbumArtworkPaletteV2Phase3LogicalDescriptor, AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis } from "./album-artwork-palette-v2-phase-3-common-base.ts";

import { extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails } from "./album-artwork-palette-v2-phase-3-integrated-candidate.ts";

import { filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain } from "./album-artwork-palette-v2-phase-3-arm-complete-lineage-winner-eligibility.ts";

import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "./album-artwork-palette-v2-phase-3-materialization.ts";

import type { AlbumArtworkPaletteV2Phase3MaterializationDiagnostics } from "./album-artwork-palette-v2-phase-3-materialization.ts";

import { ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY, selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2 } from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts";

import type { AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation, AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation } from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts";

import type { AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus } from "./album-artwork-palette-v2-phase-3-selector-v2.ts";

import { okDistance } from "./color.ts";

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_CONFIGURATION_ID =
	"integrated-candidate-flat-to-earned-component-local-endpoint-reserve-v3" as const

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_PROPOSAL_POLICY = Object.freeze({
	maximumQualityLoss:
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.maximumSlateQualityLoss,
	incumbentRequirement: "flat",
	candidateGradientRequirement: "earned-rendered",
	candidateLineageRequirement: "complete-lineage-eligible",
	candidateProvenanceRequirement: "supplemental-component-local-endpoint",
	canonicalBaselineRequirement: "absent",
	ordering: "recovery-v2",
} as const)

type IntegratedDetails = ReturnType<typeof extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function endpointBaseHypothesis(
	details: IntegratedDetails,
	fit: AlbumArtworkPaletteV2Phase3ComponentLocalEndpointReport["fits"][number],
): AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis | null {
	return details.sourcedFields.filter(({ hypothesis }) => {
		const gradient = hypothesis.gradientEvidence
		return gradient?.fieldDomainId === fit.fieldDomainId && gradient.topology === fit.topology &&
			gradient.direction === fit.direction
	}).sort((first, second) =>
		Number(second.sourceType === "band-local-endpoint") - Number(first.sourceType === "band-local-endpoint") ||
		second.hypothesis.fieldFidelity - first.hypothesis.fieldFidelity ||
		compareAscii(first.hypothesis.id, second.hypothesis.id))[0] ?? null
}

function cloneEndpointHypothesis(
	base: FieldHypothesis,
	addition: AlbumArtworkPaletteV2Phase3ComponentLocalEndpointFamily,
): FieldHypothesis {
	const gradient = base.gradientEvidence
	if (!gradient || base.surfaceFamilyId === null || base.roleAssignment === null) {
		throw new Error("Component-local endpoint arm requires a complete gradient hypothesis")
	}
	const endpointIndex = addition.lineage.position === "low" ? 0 : 1
	const replacesBackground = gradient.backgroundTopologyEndpoint === addition.lineage.position
	const supportingFamilyIds = [...gradient.supportingFamilyIds] as [string, string]
	const supportingEndpointHexes = [...gradient.supportingEndpointHexes] as [string, string]
	const exactRepresentative = addition.family.representatives[0]
	if (!exactRepresentative) throw new Error("Component-local endpoint family has no source representative")
	supportingFamilyIds[endpointIndex] = addition.family.id
	supportingEndpointHexes[endpointIndex] = exactRepresentative.hex
	const backgroundFamilyId = replacesBackground ? addition.family.id : base.backgroundFamilyId
	const surfaceFamilyId = replacesBackground ? base.surfaceFamilyId : addition.family.id
	const roleAssignment = {
		...base.roleAssignment,
		backgroundFamilyId,
		surfaceFamilyId,
	}
	return {
		...base,
		id: `component-local-endpoint:${base.id}:${addition.lineage.position}:${addition.family.id}`,
		backgroundFamilyId,
		surfaceFamilyId,
		backgroundRepresentatives: replacesBackground ? addition.family.representatives : base.backgroundRepresentatives,
		surfaceRepresentatives: replacesBackground ? base.surfaceRepresentatives : addition.family.representatives,
		roleAssignment,
		gradientEvidence: {
			...gradient,
			supportingFamilyIds,
			supportingEndpointHexes,
			roleAssignment,
			supportingComponentIds: [...new Set([
				...gradient.supportingComponentIds,
				...addition.family.components.map(({ id }) => id),
			])].sort(compareAscii),
		},
		pruningNotes: [...base.pruningNotes,
			"additive one-sided component-local endpoint representation; topology and opposite endpoint preserved"],
	}
}

function constructibleEndpointHypothesis(hypothesis: FieldHypothesis): boolean {
	const strategyOrder = ["dense-exact", "nearest-prototype", "density-synthesized", "generated-emergency"]
	const preferred = (representatives: FieldHypothesis["backgroundRepresentatives"]) =>
		[...representatives].sort((first, second) =>
			strategyOrder.indexOf(first.strategy) - strategyOrder.indexOf(second.strategy))[0]
	const background = preferred(hypothesis.backgroundRepresentatives)
	const surface = preferred(hypothesis.surfaceRepresentatives)
	return background !== undefined && surface !== undefined &&
		okDistance(background.oklab, surface.oklab) >=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY.minimumEndpointDistance
}

function componentEndpointFields(
	details: IntegratedDetails,
	report: AlbumArtworkPaletteV2Phase3ComponentLocalEndpointReport,
): Readonly<{
	fields: readonly AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[]
	families: readonly ColorFamilyEvidence[]
}> {
	const fields: AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[] = []
	const families = new Map<string, ColorFamilyEvidence>()
	for (const fit of report.fits) {
		const base = endpointBaseHypothesis(details, fit)
		if (!base) continue
		for (const addition of fit.bands.flatMap(({ additiveFamilies }) => additiveFamilies)) {
			const hypothesis = cloneEndpointHypothesis(base.hypothesis, addition)
			if (!constructibleEndpointHypothesis(hypothesis)) continue
			families.set(addition.family.id, addition.family)
			fields.push({ sourceType: "field-proposal-v2", hypothesis })
		}
	}
	return {
		fields: fields.sort((first, second) => compareAscii(first.hypothesis.id, second.hypothesis.id)),
		families: [...families.values()].sort((first, second) => compareAscii(first.id, second.id)),
	}
}

function augmentedEvidence(
	evidence: NativePaletteEvidence,
	families: readonly ColorFamilyEvidence[],
): NativePaletteEvidence {
	const byId = new Map(evidence.families.map((family) => [family.id, family]))
	for (const family of families) byId.set(family.id, family)
	return {
		...evidence,
		families: [...byId.values()],
		retainedFamilyIds: [...new Set([...evidence.retainedFamilyIds, ...families.map(({ id }) => id)])],
	}
}

export type AlbumArtworkPaletteV2Phase3ComponentEndpointReservationCandidate = Readonly<{
	key: string
	gradient: boolean
	gradientStatus: AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus
	qualityUtility: number
	completeLineageEligible: boolean
}>

export type AlbumArtworkPaletteV2Phase3ComponentEndpointProposalRejectionReason =
	"integrated-incumbent-is-gradient" |
	"baseline-winner-quality-unavailable" |
	"endpoint-candidate-is-not-gradient" |
	"endpoint-candidate-gradient-is-not-earned" |
	"endpoint-candidate-is-not-complete-lineage-eligible" |
	"endpoint-candidate-exceeds-quality-loss-limit" |
	"endpoint-candidate-lacks-supplemental-component-local-provenance" |
	"endpoint-candidate-is-in-canonical-baseline"

export type AlbumArtworkPaletteV2Phase3ComponentEndpointProposalCandidate =
	AlbumArtworkPaletteV2Phase3ComponentEndpointReservationCandidate & Readonly<{
		recoveryV2OrderIndex: number
		supplementalComponentLocalProvenance: boolean
		absentFromCanonicalBaseline: boolean
	}>

export type AlbumArtworkPaletteV2Phase3ComponentEndpointProposalCandidateDiagnostic = Readonly<{
	key: string
	recoveryV2OrderIndex: number
	gradient: boolean
	gradientStatus: AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus
	qualityUtility: number
	completeLineageEligible: boolean
	qualityLossFromBaselineWinner: number | null
	gates: Readonly<{
		integratedIncumbentFlat: boolean
		baselineWinnerQualityAvailable: boolean
		candidateIsGradient: boolean
		candidateGradientIsEarned: boolean
		candidateCompleteLineageEligible: boolean
		candidateWithinQualityLossLimit: boolean
		candidateHasSupplementalComponentLocalProvenance: boolean
		candidateAbsentFromCanonicalBaseline: boolean
	}>
	eligible: boolean
	rejectionReasons: readonly AlbumArtworkPaletteV2Phase3ComponentEndpointProposalRejectionReason[]
}>

export function decideAlbumArtworkPaletteV2Phase3ComponentEndpointProposalEligibility(input: Readonly<{
	baselineWinnerGradient: boolean
	baselineWinnerQualityUtility: number | null
	candidates: readonly AlbumArtworkPaletteV2Phase3ComponentEndpointProposalCandidate[]
}>) {
	const baselineWinnerQualityAvailable = input.baselineWinnerQualityUtility !== null &&
		Number.isFinite(input.baselineWinnerQualityUtility)
	const candidateEvaluations = input.candidates.map((candidate):
		AlbumArtworkPaletteV2Phase3ComponentEndpointProposalCandidateDiagnostic => {
		const qualityLossFromBaselineWinner = baselineWinnerQualityAvailable
			? Math.max(0, input.baselineWinnerQualityUtility! - candidate.qualityUtility)
			: null
		const gates = {
			integratedIncumbentFlat: !input.baselineWinnerGradient,
			baselineWinnerQualityAvailable,
			candidateIsGradient: candidate.gradient,
			candidateGradientIsEarned: candidate.gradientStatus === "earned-rendered",
			candidateCompleteLineageEligible: candidate.completeLineageEligible,
			candidateWithinQualityLossLimit: qualityLossFromBaselineWinner !== null &&
				qualityLossFromBaselineWinner <=
					ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_PROPOSAL_POLICY
						.maximumQualityLoss + 1e-12,
			candidateHasSupplementalComponentLocalProvenance:
				candidate.supplementalComponentLocalProvenance,
			candidateAbsentFromCanonicalBaseline: candidate.absentFromCanonicalBaseline,
		}
		const rejectionReasons: AlbumArtworkPaletteV2Phase3ComponentEndpointProposalRejectionReason[] = []
		if (!gates.integratedIncumbentFlat) rejectionReasons.push("integrated-incumbent-is-gradient")
		if (!gates.baselineWinnerQualityAvailable) rejectionReasons.push("baseline-winner-quality-unavailable")
		if (!gates.candidateIsGradient) rejectionReasons.push("endpoint-candidate-is-not-gradient")
		if (!gates.candidateGradientIsEarned) {
			rejectionReasons.push("endpoint-candidate-gradient-is-not-earned")
		}
		if (!gates.candidateCompleteLineageEligible) {
			rejectionReasons.push("endpoint-candidate-is-not-complete-lineage-eligible")
		}
		if (gates.baselineWinnerQualityAvailable && !gates.candidateWithinQualityLossLimit) {
			rejectionReasons.push("endpoint-candidate-exceeds-quality-loss-limit")
		}
		if (!gates.candidateHasSupplementalComponentLocalProvenance) {
			rejectionReasons.push("endpoint-candidate-lacks-supplemental-component-local-provenance")
		}
		if (!gates.candidateAbsentFromCanonicalBaseline) {
			rejectionReasons.push("endpoint-candidate-is-in-canonical-baseline")
		}
		return {
			key: candidate.key,
			recoveryV2OrderIndex: candidate.recoveryV2OrderIndex,
			gradient: candidate.gradient,
			gradientStatus: candidate.gradientStatus,
			qualityUtility: candidate.qualityUtility,
			completeLineageEligible: candidate.completeLineageEligible,
			qualityLossFromBaselineWinner,
			gates,
			eligible: rejectionReasons.length === 0,
			rejectionReasons,
		}
	})
	return {
		policy: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_PROPOSAL_POLICY,
		candidateEvaluations,
		eligibleCandidateKeysInOrder: candidateEvaluations
			.filter(({ eligible }) => eligible)
			.map(({ key }) => key),
	}
}

function selectorWithIntegratedWinnerEvaluation(
	details: IntegratedDetails,
	selector: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation,
): AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation {
	const winnerKey = completeTreatmentKey(details.result.winner)
	if (selector.evaluations.some(({ key }) => key === winnerKey)) return selector
	const integrated = details.result.diagnostics.phase3IntegratedCandidate.selector.evaluations
		.find(({ key }) => key === winnerKey)
	return integrated === undefined
		? selector
		: { ...selector, evaluations: [...selector.evaluations, integrated] }
}

export type AlbumArtworkPaletteV2Phase3ComponentLocalEndpointProposalCustody = Readonly<{
	key: string
	treatment: CompletePaletteTreatment
	descriptors: readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[]
}>

export type AlbumArtworkPaletteV2Phase3ComponentLocalEndpointProposal = Readonly<{
	key: string
	treatment: CompletePaletteTreatment
	evaluation: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation
	candidateDiagnostic: AlbumArtworkPaletteV2Phase3ComponentEndpointProposalCandidateDiagnostic
	custody: Readonly<{
		mechanism: AlbumArtworkPaletteV2Phase3ComponentLocalEndpointProposalCustody
		expandedDomain: AlbumArtworkPaletteV2Phase3ComponentLocalEndpointProposalCustody
	}>
	provenance: Readonly<{
		mechanismId: AlbumArtworkPaletteV2Phase3ComponentLocalEndpointReport["mechanismId"]
		sourceType: "field-proposal-v2"
		componentLocalFieldHypothesisIds: readonly string[]
		recoveryV2OrderIndex: number
		supplementalOnlyMaterialized: true
		canonicalBaselineKeyAbsent: true
	}>
}>

type ComponentEndpointLineageDiagnostics = ReturnType<
	typeof filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain
>["diagnostics"]

export type AlbumArtworkPaletteV2Phase3ComponentLocalEndpointProposalResult = Readonly<{
	version: "album-artwork-palette-v2-phase-3-component-local-endpoint-proposals-v1"
	configurationId: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_CONFIGURATION_ID
	policy: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_PROPOSAL_POLICY
	report: AlbumArtworkPaletteV2Phase3ComponentLocalEndpointReport
	baseline: Readonly<{
		winner: CompletePaletteTreatment
		winnerKey: string
		winnerQualityUtility: number | null
	}>
	augmentedFamilies: readonly ColorFamilyEvidence[]
	augmentedFields: readonly AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[]
	domain: Readonly<{
		componentLocalFieldHypothesisCount: number
		componentLocalDescriptorCount: number
		baselineMaterializedTreatmentCount: number
		supplementalOnlyMaterializedTreatmentCount: number
		evaluationMaterializedTreatmentCount: number
	}>
	materialization: Readonly<{
		baseline: AlbumArtworkPaletteV2Phase3MaterializationDiagnostics
		supplementalOnly: AlbumArtworkPaletteV2Phase3MaterializationDiagnostics | null
	}>
	selector: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation
	lineageEligibility: ComponentEndpointLineageDiagnostics
	candidateDiagnostics: readonly AlbumArtworkPaletteV2Phase3ComponentEndpointProposalCandidateDiagnostic[]
	proposals: readonly AlbumArtworkPaletteV2Phase3ComponentLocalEndpointProposal[]
}>

function proposalCustody(
	candidate: Readonly<{
		key: string
		treatment: CompletePaletteTreatment
		descriptors: readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[]
	}>,
): AlbumArtworkPaletteV2Phase3ComponentLocalEndpointProposalCustody {
	return {
		key: candidate.key,
		treatment: candidate.treatment,
		descriptors: candidate.descriptors,
	}
}

export function proposeAlbumArtworkPaletteV2Phase3ComponentLocalEndpoint(
	details: IntegratedDetails,
): AlbumArtworkPaletteV2Phase3ComponentLocalEndpointProposalResult {
	const report = buildAlbumArtworkPaletteV2Phase3ComponentLocalEndpointArm(
		details.common.evidence.native,
		details.common.evidence.gradientFits,
	)
	const additions = componentEndpointFields(details, report)
	const evidence = additions.fields.length === 0
		? details.common.evidence.augmentedNative
		: augmentedEvidence(details.common.evidence.augmentedNative, additions.families)
	const augmentedFields = [...details.sourcedFields, ...additions.fields]
	const supplementalDescriptors: AlbumArtworkPaletteV2Phase3LogicalDescriptor[] = additions.fields.length === 0
		? []
		: constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
			evidence,
			additions.fields.map(({ hypothesis }) => hypothesis),
		).treatments.map((descriptor) => ({
			sourceType: "field-proposal-v2",
			...descriptor,
		}))
	let supplementalOnlyMaterializationDiagnostics: AlbumArtworkPaletteV2Phase3MaterializationDiagnostics | null = null
	let evaluationMaterializedTreatmentCount = details.custodyMaterialized.length
	let selector = selectorWithIntegratedWinnerEvaluation(
		details,
		details.result.diagnostics.phase3IntegratedCandidate.selector,
	)
	let lineageEligibility: ComponentEndpointLineageDiagnostics =
		details.selection.completeLineage.eligibility.diagnostics
	let candidateDiagnostics: readonly AlbumArtworkPaletteV2Phase3ComponentEndpointProposalCandidateDiagnostic[] = []
	let proposals: readonly AlbumArtworkPaletteV2Phase3ComponentLocalEndpointProposal[] = []
	if (supplementalDescriptors.length > 0) {
		const supplementalOnlyMaterialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
			supplementalDescriptors,
			details.common.seedAvailability.identityObligations,
		)
		supplementalOnlyMaterializationDiagnostics = supplementalOnlyMaterialization.diagnostics
		const evaluationMaterializedByKey = new Map(details.custodyMaterialized.map((candidate) =>
			[candidate.key, candidate]))
		const supplementalByKey = new Map<string, AlbumArtworkPaletteV2Phase3ComponentLocalEndpointProposalCustody>()
		for (const candidate of supplementalOnlyMaterialization.materialized) {
			const supplementalCandidate = {
				key: candidate.key,
				treatment: candidate.treatment,
				descriptors: candidate.descriptors as readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[],
			}
			supplementalByKey.set(candidate.key, supplementalCandidate)
			const baselineCandidate = evaluationMaterializedByKey.get(candidate.key)
			evaluationMaterializedByKey.set(candidate.key, baselineCandidate === undefined
				? supplementalCandidate
				: {
					...baselineCandidate,
					descriptors: [...baselineCandidate.descriptors, ...supplementalCandidate.descriptors],
				})
		}
		const evaluationMaterialized = [...evaluationMaterializedByKey.values()]
			.sort((first, second) => compareAscii(first.key, second.key))
		evaluationMaterializedTreatmentCount = evaluationMaterialized.length
		const evaluationMaterializedByCanonicalKey = new Map(evaluationMaterialized.map((candidate) =>
			[candidate.key, candidate]))
		const evaluation = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(
			evaluationMaterialized.map(({ treatment }) => treatment),
			{ obligations: details.common.seedAvailability.identityObligations },
		)
		const expandedLineageEligibility = filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain(
			evaluationMaterialized,
			{ emergency: details.closedDetails.result.diagnostics.emergency },
		)
		lineageEligibility = expandedLineageEligibility.diagnostics
		const lineageByKey = new Map(lineageEligibility.candidates.map((candidate) =>
			[candidate.key, candidate]))
		const supplementalOnlyKeys = new Set(supplementalOnlyMaterialization.materialized.map(({ key }) => key))
		const baselineKeys = new Set(details.custodyMaterialized.map(({ key }) => key))
		const endpointEvaluations = evaluation.evaluations.filter(({ key }) =>
			supplementalOnlyKeys.has(key))
		selector = selectorWithIntegratedWinnerEvaluation(details, evaluation.explanation)
		const baselineWinnerKey = completeTreatmentKey(details.result.winner)
		const baselineWinnerQualityUtility = selector.evaluations
			.find(({ key }) => key === baselineWinnerKey)?.qualityUtility ?? null
		const componentLocalFieldIds = new Set(additions.fields.map(({ hypothesis }) => hypothesis.id))
		const proposalEligibility = decideAlbumArtworkPaletteV2Phase3ComponentEndpointProposalEligibility({
			baselineWinnerGradient: details.result.winner.gradient,
			baselineWinnerQualityUtility,
			candidates: endpointEvaluations.map((candidate) => {
				const mechanism = supplementalByKey.get(candidate.key)
				if (!mechanism) throw new Error("Component-local endpoint evaluation omitted mechanism custody")
				const matchingDescriptors = mechanism.descriptors.filter((descriptor) =>
					descriptor.sourceType === "field-proposal-v2" &&
					componentLocalFieldIds.has(descriptor.fieldHypothesis.id))
				return {
					key: candidate.key,
					gradient: candidate.treatment.gradient,
					gradientStatus: candidate.gradientStatus,
					qualityUtility: candidate.qualityUtility,
					completeLineageEligible: lineageByKey.get(candidate.key)?.eligible === true,
					recoveryV2OrderIndex: evaluation.evaluations.indexOf(candidate),
					supplementalComponentLocalProvenance: matchingDescriptors.length > 0,
					absentFromCanonicalBaseline: !baselineKeys.has(candidate.key),
				}
			}),
		})
		candidateDiagnostics = proposalEligibility.candidateEvaluations
		const diagnosticByKey = new Map(candidateDiagnostics.map((diagnostic) =>
			[diagnostic.key, diagnostic]))
		proposals = endpointEvaluations.flatMap((evaluationCandidate):
			AlbumArtworkPaletteV2Phase3ComponentLocalEndpointProposal[] => {
			const candidateDiagnostic = diagnosticByKey.get(evaluationCandidate.key)
			if (!candidateDiagnostic?.eligible) return []
			const mechanism = supplementalByKey.get(evaluationCandidate.key)
			const expandedDomain = evaluationMaterializedByCanonicalKey.get(evaluationCandidate.key)
			if (!mechanism || !expandedDomain) {
				throw new Error("Eligible component-local endpoint proposal omitted materialized custody")
			}
			const componentLocalFieldHypothesisIds = [...new Set(mechanism.descriptors
				.filter((descriptor) => descriptor.sourceType === "field-proposal-v2" &&
					componentLocalFieldIds.has(descriptor.fieldHypothesis.id))
				.map(({ fieldHypothesis }) => fieldHypothesis.id))].sort(compareAscii)
			return [{
				key: evaluationCandidate.key,
				treatment: evaluationCandidate.treatment,
				evaluation: evaluationCandidate,
				candidateDiagnostic,
				custody: {
					mechanism: proposalCustody(mechanism),
					expandedDomain: proposalCustody(expandedDomain),
				},
				provenance: {
					mechanismId: report.mechanismId,
					sourceType: "field-proposal-v2",
					componentLocalFieldHypothesisIds,
					recoveryV2OrderIndex: candidateDiagnostic.recoveryV2OrderIndex,
					supplementalOnlyMaterialized: true,
					canonicalBaselineKeyAbsent: true,
				},
			}]
		})
	}
	return {
		version: "album-artwork-palette-v2-phase-3-component-local-endpoint-proposals-v1",
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_CONFIGURATION_ID,
		policy: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_PROPOSAL_POLICY,
		report,
		baseline: {
			winner: details.result.winner,
			winnerKey: completeTreatmentKey(details.result.winner),
			winnerQualityUtility: selector.evaluations.find(({ key }) =>
				key === completeTreatmentKey(details.result.winner))?.qualityUtility ?? null,
		},
		augmentedFamilies: evidence.families,
		augmentedFields,
		domain: {
			componentLocalFieldHypothesisCount: additions.fields.length,
			componentLocalDescriptorCount: supplementalDescriptors.length,
			baselineMaterializedTreatmentCount: details.custodyMaterialized.length,
			supplementalOnlyMaterializedTreatmentCount:
				supplementalOnlyMaterializationDiagnostics?.materializedTreatmentCount ?? 0,
			evaluationMaterializedTreatmentCount,
		},
		materialization: {
			baseline: details.materialization.diagnostics,
			supplementalOnly: supplementalOnlyMaterializationDiagnostics,
		},
		selector,
		lineageEligibility,
		candidateDiagnostics,
		proposals,
	}
}
