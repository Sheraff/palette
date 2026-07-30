import {
	completeTreatmentKey,
	constructAlbumArtworkPaletteV2Phase3SupplementalTreatments,
} from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Result,
	ColorFamilyEvidence,
	CompletePaletteTreatment,
	FieldHypothesis,
	NativePaletteEvidence,
} from "./album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ENDPOINT_REFINEMENT_POLICY,
} from "./album-artwork-palette-v2-phase-3-endpoint-refinement.ts"
import {
	buildAlbumArtworkPaletteV2Phase3ComponentLocalEndpointArm,
} from "./album-artwork-palette-v2-phase-3-arm-component-local-endpoint.ts"
import type {
	AlbumArtworkPaletteV2Phase3ComponentLocalEndpointFamily,
	AlbumArtworkPaletteV2Phase3ComponentLocalEndpointReport,
} from "./album-artwork-palette-v2-phase-3-arm-component-local-endpoint.ts"
import {
	runAlbumArtworkPaletteV2Phase3ContrastiveRoleAssignmentArm,
} from "./album-artwork-palette-v2-phase-3-arm-contrastive-role-assignment.ts"
import {
	reserveAlbumArtworkPaletteV2Phase3RawRelationSlateComplement,
} from "./album-artwork-palette-v2-phase-3-arm-raw-relation-slate-complement.ts"
import {
	evaluateAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath,
} from "./album-artwork-palette-v2-phase-3-arm-supported-gradient-path.ts"
import type {
	AlbumArtworkPaletteV2Phase3SupportedGradientMidpointDescriptor,
} from "./album-artwork-palette-v2-phase-3-arm-supported-gradient-path.ts"
import type {
	AlbumArtworkPaletteV2Phase3LogicalDescriptor,
	AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"
import {
	extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails,
} from "./album-artwork-palette-v2-phase-3-integrated-candidate.ts"
import {
	filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain,
} from "./album-artwork-palette-v2-phase-3-arm-complete-lineage-winner-eligibility.ts"
import {
	materializeAlbumArtworkPaletteV2Phase3Descriptors,
} from "./album-artwork-palette-v2-phase-3-materialization.ts"
import type {
	AlbumArtworkPaletteV2Phase3MaterializationDiagnostics,
} from "./album-artwork-palette-v2-phase-3-materialization.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY,
	selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus,
} from "./album-artwork-palette-v2-phase-3-selector-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_POLICY,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v4.ts"
import { okDistance } from "./color.ts"
import type { RawImage } from "./types.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SUPPORTED_GRADIENT_PATH_ATTEMPT_ID =
	"phase-3-supported-gradient-path" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SUPPORTED_GRADIENT_PATH_CONFIGURATION_ID =
	"integrated-candidate-strict-color-bridge-midpoint-review-render-v2" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_ATTEMPT_ID =
	"phase-3-contrastive-role-assignment" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_CONFIGURATION_ID =
	"integrated-candidate-glyph-run-joint-role-authority-v1" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_ATTEMPT_ID =
	"phase-3-component-local-endpoint" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_CONFIGURATION_ID =
	"integrated-candidate-flat-to-earned-component-local-endpoint-reserve-v3" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_SLATE_POLICY = Object.freeze({
	maximumQualityLoss:
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.maximumSlateQualityLoss,
	maximumReservedTreatments: 1,
	baselineMutation: "replace-last-only",
	incumbentRequirement: "flat",
	candidateGradientRequirement: "earned-rendered",
	candidateLineageRequirement: "complete-lineage-eligible",
} as const)
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
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RAW_RELATION_SLATE_COMPLEMENT_ATTEMPT_ID =
	"phase-3-raw-relation-slate-complement" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RAW_RELATION_SLATE_COMPLEMENT_CONFIGURATION_ID =
	"integrated-candidate-one-ordinary-raw-relation-complement-v1" as const

type IntegratedDetails = ReturnType<typeof extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function uniqueTreatments(values: readonly CompletePaletteTreatment[]): CompletePaletteTreatment[] {
	const byKey = new Map<string, CompletePaletteTreatment>()
	for (const treatment of values) {
		const key = completeTreatmentKey(treatment)
		if (!byKey.has(key)) byKey.set(key, treatment)
	}
	return [...byKey.values()]
}

function winnerFirstSlate(
	winner: CompletePaletteTreatment,
	baseline: readonly CompletePaletteTreatment[],
): CompletePaletteTreatment[] {
	return uniqueTreatments([winner, ...baseline]).slice(0, 8)
}

function slateRoleFamilyIds(
	slate: readonly CompletePaletteTreatment[],
): Readonly<{ foreground: readonly string[]; accent: readonly string[] }> {
	return {
		foreground: [...new Set(slate.map(({ familyRoles }) => familyRoles.foreground)
			.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii),
		accent: [...new Set(slate.filter(({ collapse }) => !collapse.accent)
			.map(({ familyRoles }) => familyRoles.accent)
			.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii),
	}
}

type ParallelArmOutput<TKey extends string, TRoot> = Omit<AlbumArtworkPaletteV2Result, "diagnostics"> & Readonly<{
	diagnostics: AlbumArtworkPaletteV2Result["diagnostics"] & Readonly<Record<TKey, TRoot>>
}>

export function buildAlbumArtworkPaletteV2Phase3ParallelArmOutput<TKey extends string, TRoot>(
	details: IntegratedDetails,
	identity: Readonly<{ attemptId: string; configurationId: string; diagnosticsKey: TKey }>,
	winner: CompletePaletteTreatment,
	slate: readonly CompletePaletteTreatment[],
	root: TRoot,
	overrides: Readonly<{
		families?: readonly ColorFamilyEvidence[]
		fieldHypotheses?: readonly FieldHypothesis[]
		completeCandidateCount?: number
	}> = {},
): ParallelArmOutput<TKey, TRoot> {
	const roles = slateRoleFamilyIds(slate)
	const { phase3IntegratedCandidate: _integratedBaseDiagnostics, ...baseDiagnostics } =
		details.result.diagnostics
	return {
		...details.result,
		version: identity.attemptId,
		protocol: identity.configurationId,
		winner,
		alternatives: slate,
		diagnostics: {
			...baseDiagnostics,
			...(overrides.families ? { families: overrides.families } : {}),
			...(overrides.fieldHypotheses ? { fieldHypotheses: overrides.fieldHypotheses } : {}),
			...(overrides.completeCandidateCount === undefined
				? {} : { completeCandidateCount: overrides.completeCandidateCount }),
			candidateAvailability: {
				...details.result.diagnostics.candidateAvailability,
				slateForegroundFamilyIds: roles.foreground,
				slateAccentFamilyIds: roles.accent,
			},
			[identity.diagnosticsKey]: root,
		},
	} as ParallelArmOutput<TKey, TRoot>
}

function lineageBasis(details: IntegratedDetails, key: string): string {
	return details.selection.completeLineage.eligibility.diagnostics.candidates
		.find((candidate) => candidate.key === key)?.basis ?? "ineligible"
}

function evaluationDiagnosticForProjectedTreatment(
	details: IntegratedDetails,
	fromKey: string,
	treatment: CompletePaletteTreatment,
): Record<string, unknown> {
	const source = details.recoveryV2.explanation.evaluations.find(({ key }) => key === fromKey)
	if (!source) throw new Error("Supported gradient-path projection omitted its source evaluation")
	return {
		...source,
		key: completeTreatmentKey(treatment),
		gradientStatus: treatment.gradient ? source.gradientStatus : "not-applicable",
		structuralKey: `${source.structuralKey}\0supported-gradient-path-projection`,
	}
}

function exactRoleSibling(
	details: IntegratedDetails,
	winner: CompletePaletteTreatment,
	gradient: boolean,
): CompletePaletteTreatment | null {
	return details.custodyMaterialized.find(({ treatment }) =>
		treatment.gradient === gradient &&
		(["background", "surface", "foreground", "accent"] as const).every((role) =>
			treatment[role].hex === winner[role].hex && treatment[role].generated === winner[role].generated) &&
		treatment.collapse.surface === winner.collapse.surface && treatment.collapse.accent === winner.collapse.accent,
	)?.treatment ?? null
}

function projectedFlatTreatment(winner: CompletePaletteTreatment): CompletePaletteTreatment {
	return {
		...winner,
		id: `supported-gradient-path-flat:${winner.id}`,
		gradient: false,
		fieldTreatment: "separate-flat-fields",
		gradientEvidence: null,
	}
}

export function extractAlbumArtworkPaletteV2Phase3SupportedGradientPath(image: RawImage) {
	const details = extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails(image)
	const arm = evaluateAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath(details.common.evidence.native)
	const baselineWinner = details.result.winner
	const baselineWinnerKey = completeTreatmentKey(baselineWinner)
	const transitionPromoted = details.selection.diagnostics.transitionPromoted
	const correspondingPath = arm.diagnostics.paths.find(({ hypothesisId }) =>
		hypothesisId === baselineWinner.sourceFieldHypothesisId) ?? null
	const strictVetoApplied = transitionPromoted && baselineWinner.gradient && correspondingPath !== null &&
		!correspondingPath.eligible
	const midpoint: AlbumArtworkPaletteV2Phase3SupportedGradientMidpointDescriptor =
		transitionPromoted && correspondingPath?.eligible === true
			? correspondingPath.midpointCustody
			: { kind: "none", position: null, color: null, provenance: null }
	const exactFlat = strictVetoApplied ? exactRoleSibling(details, baselineWinner, false) : null
	const winner = strictVetoApplied ? exactFlat ?? projectedFlatTreatment(baselineWinner) : baselineWinner
	const winnerKey = completeTreatmentKey(winner)
	const slate = winnerFirstSlate(winner, details.result.alternatives
		.filter((treatment) => completeTreatmentKey(treatment) !== baselineWinnerKey))
	const projected = strictVetoApplied && exactFlat === null
	const selectorEvaluations = projected
		? [...details.recoveryV2.explanation.evaluations,
			evaluationDiagnosticForProjectedTreatment(details, baselineWinnerKey, winner)]
		: details.recoveryV2.explanation.evaluations
	const basis = strictVetoApplied && exactFlat !== null
		? lineageBasis(details, winnerKey)
		: details.selection.diagnostics.winnerLineageBasis
	return buildAlbumArtworkPaletteV2Phase3ParallelArmOutput(details, {
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SUPPORTED_GRADIENT_PATH_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SUPPORTED_GRADIENT_PATH_CONFIGURATION_ID,
		diagnosticsKey: "phase3SupportedGradientPath",
	}, winner, slate, {
		version: "album-artwork-palette-v2-phase-3-supported-gradient-path-diagnostics-v2",
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SUPPORTED_GRADIENT_PATH_CONFIGURATION_ID,
		domain: details.result.diagnostics.phase3IntegratedCandidate.domain,
		selector: { ...details.recoveryV2.explanation, evaluations: selectorEvaluations },
		lineageEligibility: details.selection.completeLineage.eligibility.diagnostics,
		transitionRescue: details.selection.transitionRescue,
		custody: details.selection.custody,
		selection: {
			...details.selection.diagnostics,
			winnerKey,
			winnerLineageBasis: basis,
		},
		gradientAuthority: {
			strictVetoApplied,
			projectedFlatSibling: projected,
			baselineWinnerKey,
			winnerKey,
			correspondingPathIndex: correspondingPath?.pathIndex ?? null,
			midpoint,
		},
		supportedGradientPath: arm.diagnostics,
	})
}

function qualityBoundedRoleCandidates(details: IntegratedDetails, keys: readonly string[]): Set<string> {
	const evaluationByKey = new Map(details.recoveryV2.evaluations.map((evaluation) => [evaluation.key, evaluation]))
	const unrestricted = evaluationByKey.get(details.selection.diagnostics.unrestrictedWinnerKey)
	if (!unrestricted) throw new Error("Contrastive role arm omitted the unrestricted winner evaluation")
	const floor = unrestricted.qualityUtility -
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_POLICY.maximumBaseQualityLoss
	const lineageByKey = new Map(details.selection.completeLineage.eligibility.diagnostics.candidates.map((candidate) =>
		[candidate.key, candidate]))
	return new Set(keys.filter((key) => {
		const evaluation = evaluationByKey.get(key)
		const lineage = lineageByKey.get(key)
		return evaluation !== undefined && evaluation.qualityUtility + 1e-12 >= floor && lineage?.eligible === true
	}))
}

export function applyAlbumArtworkPaletteV2Phase3ContrastiveRoleAssignment(details: IntegratedDetails) {
	const incumbent = details.custodyMaterialized.find(({ key }) =>
		key === completeTreatmentKey(details.result.winner))
	if (!incumbent) {
		return buildAlbumArtworkPaletteV2Phase3ParallelArmOutput(details, {
			attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_ATTEMPT_ID,
			configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_CONFIGURATION_ID,
			diagnosticsKey: "phase3ContrastiveRoleAssignment",
		}, details.result.winner, details.result.alternatives, {
			version: "album-artwork-palette-v2-phase-3-contrastive-role-assignment-diagnostics-v1",
			configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_CONFIGURATION_ID,
			domain: details.result.diagnostics.phase3IntegratedCandidate.domain,
			selector: details.result.diagnostics.phase3IntegratedCandidate.selector,
			lineageEligibility: details.selection.completeLineage.eligibility.diagnostics,
			transitionRescue: details.selection.transitionRescue,
			custody: details.selection.custody,
			gradientAuthority: details.gradientAuthority.diagnostics,
			supportedGradientPath: details.supportedGradientPath.diagnostics,
			selection: details.selection.diagnostics,
			contrastiveRoleAssignment: {
				decision: {
					status: "discarded",
					reason: "integrated-incumbent-custody-unavailable",
					authoritativeAssignmentKey: null,
					foregroundFamilyId: null,
					accentFamilyId: null,
				},
				applicability: {
					status: "discarded",
					reason: "integrated-incumbent-custody-unavailable",
					incumbentKey: completeTreatmentKey(details.result.winner),
					projectedFlatIncumbent: details.gradientAuthority.diagnostics.projectedFlatSibling,
				},
				qualityAndLineageBoundedCandidateKeys: [],
				appliedWinnerKey: null,
			},
		})
	}
	const arm = runAlbumArtworkPaletteV2Phase3ContrastiveRoleAssignmentArm({
		evidence: details.common.evidence.augmentedNative,
		incumbent,
		materialized: details.custodyMaterialized,
	})
	const boundedKeys = qualityBoundedRoleCandidates(details,
		arm.authoritativeCandidates.map(({ key }) => key))
	const recoveryOrder = new Map(details.recoveryV2.slate.map((treatment, index) =>
		[completeTreatmentKey(treatment), index]))
	const selected = arm.decision.status === "authoritative"
		? arm.authoritativeCandidates.filter(({ key }) => boundedKeys.has(key)).sort((first, second) =>
			(recoveryOrder.get(first.key) ?? Number.MAX_SAFE_INTEGER) -
				(recoveryOrder.get(second.key) ?? Number.MAX_SAFE_INTEGER) || compareAscii(first.key, second.key))[0] ?? null
		: null
	const winner = selected?.treatment ?? details.result.winner
	const winnerKey = completeTreatmentKey(winner)
	const slate = winnerFirstSlate(winner, details.result.alternatives)
	return buildAlbumArtworkPaletteV2Phase3ParallelArmOutput(details, {
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_CONFIGURATION_ID,
		diagnosticsKey: "phase3ContrastiveRoleAssignment",
	}, winner, slate, {
		version: "album-artwork-palette-v2-phase-3-contrastive-role-assignment-diagnostics-v1",
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_CONFIGURATION_ID,
		domain: details.result.diagnostics.phase3IntegratedCandidate.domain,
		selector: details.result.diagnostics.phase3IntegratedCandidate.selector,
		lineageEligibility: details.selection.completeLineage.eligibility.diagnostics,
		transitionRescue: details.selection.transitionRescue,
		custody: details.selection.custody,
		gradientAuthority: details.gradientAuthority.diagnostics,
		supportedGradientPath: details.supportedGradientPath.diagnostics,
		selection: {
			...details.selection.diagnostics,
			winnerKey,
			winnerLineageBasis: lineageBasis(details, winnerKey),
		},
		contrastiveRoleAssignment: {
			...arm.diagnostics,
			applicability: {
				status: "evaluated",
				reason: null,
				incumbentKey: incumbent.key,
				projectedFlatIncumbent: false,
			},
			qualityAndLineageBoundedCandidateKeys: [...boundedKeys].sort(compareAscii),
			appliedWinnerKey: selected?.key ?? null,
		},
	})
}

export function extractAlbumArtworkPaletteV2Phase3ContrastiveRoleAssignment(image: RawImage) {
	return applyAlbumArtworkPaletteV2Phase3ContrastiveRoleAssignment(
		extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails(image),
	)
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

export type AlbumArtworkPaletteV2Phase3ComponentEndpointReservationRejectionReason =
	"integrated-incumbent-is-gradient" |
	"integrated-winner-is-not-slate-head" |
	"baseline-winner-quality-unavailable" |
	"no-supplemental-endpoint-candidate" |
	"endpoint-candidate-is-not-gradient" |
	"endpoint-candidate-gradient-is-not-earned" |
	"endpoint-candidate-is-not-complete-lineage-eligible" |
	"endpoint-candidate-exceeds-quality-loss-limit" |
	"baseline-slate-has-no-replaceable-tail" |
	"endpoint-candidate-is-already-in-baseline-slate"

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

export type AlbumArtworkPaletteV2Phase3ComponentEndpointReservationCandidateDiagnostic = Readonly<{
	key: string
	gradientStatus: AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus
	qualityLossFromBaselineWinner: number | null
	gates: Readonly<{
		integratedIncumbentFlat: boolean
		baselineWinnerQualityAvailable: boolean
		candidateIsGradient: boolean
		candidateGradientIsEarned: boolean
		candidateCompleteLineageEligible: boolean
		candidateWithinQualityLossLimit: boolean
		baselineSlateHasReplaceableTail: boolean
		candidateAbsentFromBaselineSlate: boolean
	}>
	eligible: boolean
	rejectionReasons: readonly AlbumArtworkPaletteV2Phase3ComponentEndpointReservationRejectionReason[]
}>

export function decideAlbumArtworkPaletteV2Phase3ComponentEndpointReservation(input: Readonly<{
	baselineWinnerKey: string
	baselineWinnerGradient: boolean
	baselineWinnerQualityUtility: number | null
	baselineSlateKeys: readonly string[]
	candidates: readonly AlbumArtworkPaletteV2Phase3ComponentEndpointReservationCandidate[]
}>) {
	const baselineWinnerQualityAvailable = input.baselineWinnerQualityUtility !== null &&
		Number.isFinite(input.baselineWinnerQualityUtility)
	const baselineSlateKeys = new Set(input.baselineSlateKeys)
	const proposalEligibility = decideAlbumArtworkPaletteV2Phase3ComponentEndpointProposalEligibility({
		baselineWinnerGradient: input.baselineWinnerGradient,
		baselineWinnerQualityUtility: input.baselineWinnerQualityUtility,
		candidates: input.candidates.map((candidate, recoveryV2OrderIndex) => ({
			...candidate,
			recoveryV2OrderIndex,
			supplementalComponentLocalProvenance: true,
			absentFromCanonicalBaseline: true,
		})),
	})
	const candidateEvaluations = proposalEligibility.candidateEvaluations.map((proposal):
		AlbumArtworkPaletteV2Phase3ComponentEndpointReservationCandidateDiagnostic => {
		const gates = {
			integratedIncumbentFlat: proposal.gates.integratedIncumbentFlat,
			baselineWinnerQualityAvailable: proposal.gates.baselineWinnerQualityAvailable,
			candidateIsGradient: proposal.gates.candidateIsGradient,
			candidateGradientIsEarned: proposal.gates.candidateGradientIsEarned,
			candidateCompleteLineageEligible: proposal.gates.candidateCompleteLineageEligible,
			candidateWithinQualityLossLimit: proposal.gates.candidateWithinQualityLossLimit,
			baselineSlateHasReplaceableTail: input.baselineSlateKeys.length > 1,
			candidateAbsentFromBaselineSlate: !baselineSlateKeys.has(proposal.key),
		}
		const rejectionReasons: AlbumArtworkPaletteV2Phase3ComponentEndpointReservationRejectionReason[] = []
		for (const reason of proposal.rejectionReasons) {
			if (reason === "endpoint-candidate-lacks-supplemental-component-local-provenance" ||
				reason === "endpoint-candidate-is-in-canonical-baseline") continue
			rejectionReasons.push(reason)
		}
		if (!gates.baselineSlateHasReplaceableTail) {
			rejectionReasons.push("baseline-slate-has-no-replaceable-tail")
		}
		if (!gates.candidateAbsentFromBaselineSlate) {
			rejectionReasons.push("endpoint-candidate-is-already-in-baseline-slate")
		}
		return {
			key: proposal.key,
			gradientStatus: proposal.gradientStatus,
			qualityLossFromBaselineWinner: proposal.qualityLossFromBaselineWinner,
			gates,
			eligible: rejectionReasons.length === 0,
			rejectionReasons,
		}
	})
	const reserved = candidateEvaluations.find(({ eligible }) => eligible) ?? null
	const gates = {
		integratedIncumbentFlat: !input.baselineWinnerGradient,
		integratedWinnerIsSlateHead: input.baselineSlateKeys[0] === input.baselineWinnerKey,
		baselineWinnerQualityAvailable,
		supplementalEndpointCandidateAvailable: candidateEvaluations.length > 0,
		baselineSlateHasReplaceableTail: input.baselineSlateKeys.length > 1,
	}
	const globalRejectionReasons: AlbumArtworkPaletteV2Phase3ComponentEndpointReservationRejectionReason[] = [
		...gates.integratedIncumbentFlat ? [] : ["integrated-incumbent-is-gradient" as const],
		...gates.integratedWinnerIsSlateHead ? [] : ["integrated-winner-is-not-slate-head" as const],
		...gates.baselineWinnerQualityAvailable ? [] : ["baseline-winner-quality-unavailable" as const],
		...gates.supplementalEndpointCandidateAvailable
			? [] : ["no-supplemental-endpoint-candidate" as const],
		...gates.baselineSlateHasReplaceableTail
			? [] : ["baseline-slate-has-no-replaceable-tail" as const],
	]
	const canReserve = reserved !== null && globalRejectionReasons.length === 0
	const reservedKey = canReserve ? reserved.key : null
	const outputSlateKeys = reservedKey === null
		? input.baselineSlateKeys
		: [...input.baselineSlateKeys.slice(0, -1), reservedKey]
	const candidate = candidateEvaluations[0] ?? null
	return {
		baselineWinnerKey: input.baselineWinnerKey,
		outputWinnerKey: input.baselineWinnerKey,
		baselineWinnerUnchanged: true,
		baselineSlateKeys: input.baselineSlateKeys,
		outputSlateKeys,
		gates,
		candidateEvaluations,
		rejectionReasons: reservedKey === null
			? [...new Set<AlbumArtworkPaletteV2Phase3ComponentEndpointReservationRejectionReason>([
				...globalRejectionReasons,
				...globalRejectionReasons.length === 0
					? candidateEvaluations.flatMap(({ rejectionReasons: reasons }) => reasons)
					: [],
			])]
			: [],
		candidateKey: candidate?.key ?? null,
		candidateGradientStatus: candidate?.gradientStatus ?? null,
		candidateCompleteLineageEligible: candidate?.gates.candidateCompleteLineageEligible ?? null,
		candidateQualityLossFromBaselineWinner: candidate?.qualityLossFromBaselineWinner ?? null,
		reservedKey,
		reservedTreatmentCount: reservedKey === null ? 0 : 1,
		reservedCompleteLineageEligible: reservedKey === null ? null : true,
		reservedQualityLossFromBaselineWinner: canReserve ? reserved.qualityLossFromBaselineWinner : null,
		replacedBaselineKey: reservedKey === null ? null : input.baselineSlateKeys.at(-1) ?? null,
		baselinePrefixPreserved: outputSlateKeys.slice(0, -1).every((key, index) =>
			key === input.baselineSlateKeys[index]),
	}
}

type ComponentEndpointReservationDecision = ReturnType<
	typeof decideAlbumArtworkPaletteV2Phase3ComponentEndpointReservation
>

function componentEndpointReservation(
	details: IntegratedDetails,
	candidates: readonly AlbumArtworkPaletteV2Phase3ComponentEndpointReservationCandidate[],
): ComponentEndpointReservationDecision {
	const baselineWinnerKey = completeTreatmentKey(details.result.winner)
	const baselineWinnerEvaluation = details.result.diagnostics.phase3IntegratedCandidate.selector.evaluations
		.find(({ key }) => key === baselineWinnerKey)
	return decideAlbumArtworkPaletteV2Phase3ComponentEndpointReservation({
		baselineWinnerKey,
		baselineWinnerGradient: details.result.winner.gradient,
		baselineWinnerQualityUtility: baselineWinnerEvaluation?.qualityUtility ?? null,
		baselineSlateKeys: details.result.alternatives.map(completeTreatmentKey),
		candidates,
	})
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

function componentEndpointDiagnosticRoot(
	details: IntegratedDetails,
	report: AlbumArtworkPaletteV2Phase3ComponentLocalEndpointReport,
	input: Readonly<{
		componentLocalFieldHypothesisCount: number
		componentLocalDescriptorCount: number
		supplementalOnlyMaterialization: ReturnType<
			typeof materializeAlbumArtworkPaletteV2Phase3Descriptors
		>["diagnostics"] | null
		selector: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation
		lineageEligibility: ReturnType<
			typeof filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain
		>["diagnostics"]
		outputSlate: readonly CompletePaletteTreatment[]
		reservation: ComponentEndpointReservationDecision
		evaluationMaterializedTreatmentCount: number
	}>,
) {
	const baselineWinnerKey = completeTreatmentKey(details.result.winner)
	const outputSlateKeys = input.outputSlate.map(completeTreatmentKey)
	return {
		version: "album-artwork-palette-v2-phase-3-component-local-endpoint-diagnostics-v3",
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_CONFIGURATION_ID,
		domain: {
			...details.result.diagnostics.phase3IntegratedCandidate.domain,
			componentLocalFieldHypothesisCount: input.componentLocalFieldHypothesisCount,
			componentLocalDescriptorCount: input.componentLocalDescriptorCount,
			baselineMaterializedTreatmentCount: details.custodyMaterialized.length,
			supplementalOnlyMaterializedTreatmentCount:
				input.supplementalOnlyMaterialization?.materializedTreatmentCount ?? 0,
			materializedTreatmentCount: input.evaluationMaterializedTreatmentCount,
		},
		materialization: {
			baselineCustody: details.materialization.diagnostics,
			supplementalOnly: input.supplementalOnlyMaterialization,
		},
		selector: input.selector,
		lineageEligibility: input.lineageEligibility,
		transitionRescue: details.selection.transitionRescue,
		custody: details.selection.custody,
		gradientAuthority: details.gradientAuthority.diagnostics,
		supportedGradientPath: details.supportedGradientPath.diagnostics,
		selection: {
			...details.selection.diagnostics,
			winnerKey: baselineWinnerKey,
			slateKeys: outputSlateKeys,
		},
		endpointSlateReservation: {
			policy: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_SLATE_POLICY,
			winnerAuthority: "integrated-baseline",
			selectorAuthority: "evaluation-only",
			...input.reservation,
			outputSlateKeys,
			baselinePrefixPreserved: outputSlateKeys.slice(0, -1).every((key, index) =>
				key === input.reservation.baselineSlateKeys[index]),
		},
		componentLocalEndpoint: report,
	}
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

export function applyAlbumArtworkPaletteV2Phase3ComponentLocalEndpoint(details: IntegratedDetails) {
	const proposal = proposeAlbumArtworkPaletteV2Phase3ComponentLocalEndpoint(details)
	const reservation = componentEndpointReservation(details, proposal.candidateDiagnostics
		.filter(({ gates }) => gates.candidateAbsentFromCanonicalBaseline)
		.map((candidate) => ({
			key: candidate.key,
			gradient: candidate.gradient,
			gradientStatus: candidate.gradientStatus,
			qualityUtility: candidate.qualityUtility,
			completeLineageEligible: candidate.completeLineageEligible,
		})))
	const reserved = reservation.reservedKey === null
		? null
		: proposal.proposals.find(({ key }) => key === reservation.reservedKey) ?? null
	const baselineSlate = details.result.alternatives
	const slate = reserved === null
		? baselineSlate
		: [...baselineSlate.slice(0, -1), reserved.treatment]
	const standaloneSelector = proposal.domain.componentLocalDescriptorCount === 0
		? details.result.diagnostics.phase3IntegratedCandidate.selector
		: proposal.selector
	return buildAlbumArtworkPaletteV2Phase3ParallelArmOutput(details, {
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_CONFIGURATION_ID,
		diagnosticsKey: "phase3ComponentLocalEndpoint",
	}, details.result.winner, slate, componentEndpointDiagnosticRoot(details, proposal.report, {
		componentLocalFieldHypothesisCount: proposal.domain.componentLocalFieldHypothesisCount,
		componentLocalDescriptorCount: proposal.domain.componentLocalDescriptorCount,
		supplementalOnlyMaterialization: proposal.materialization.supplementalOnly,
		selector: standaloneSelector,
		lineageEligibility: proposal.lineageEligibility,
		outputSlate: slate,
		reservation,
		evaluationMaterializedTreatmentCount: proposal.domain.evaluationMaterializedTreatmentCount,
	}), proposal.domain.componentLocalFieldHypothesisCount === 0 ? {} : {
		families: proposal.augmentedFamilies,
		fieldHypotheses: proposal.augmentedFields.map(({ hypothesis }) => hypothesis),
		completeCandidateCount: proposal.domain.evaluationMaterializedTreatmentCount,
	})
}

export function extractAlbumArtworkPaletteV2Phase3ComponentLocalEndpoint(image: RawImage) {
	return applyAlbumArtworkPaletteV2Phase3ComponentLocalEndpoint(
		extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails(image),
	)
}

export function extractAlbumArtworkPaletteV2Phase3RawRelationSlateComplement(image: RawImage) {
	const details = extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails(image)
	const selection = reserveAlbumArtworkPaletteV2Phase3RawRelationSlateComplement({
		current: { winner: details.result.winner, slate: details.result.alternatives },
		recoveryV2: details.recoveryV2,
		completeLineageEligibility: details.selection.completeLineage.eligibility,
	})
	return buildAlbumArtworkPaletteV2Phase3ParallelArmOutput(details, {
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RAW_RELATION_SLATE_COMPLEMENT_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RAW_RELATION_SLATE_COMPLEMENT_CONFIGURATION_ID,
		diagnosticsKey: "phase3RawRelationSlateComplement",
	}, selection.winner, selection.slate, {
		version: "album-artwork-palette-v2-phase-3-raw-relation-slate-complement-diagnostics-v1",
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RAW_RELATION_SLATE_COMPLEMENT_CONFIGURATION_ID,
		domain: details.result.diagnostics.phase3IntegratedCandidate.domain,
		selector: details.recoveryV2.explanation,
		lineageEligibility: details.selection.completeLineage.eligibility.diagnostics,
		transitionRescue: details.selection.transitionRescue,
		custody: details.selection.custody,
		selection: details.selection.diagnostics,
		rawRelationSlateComplement: selection.diagnostics,
	})
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SUPPORTED_GRADIENT_PATH_ATTEMPT = Object.freeze({
	identity: Object.freeze({
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SUPPORTED_GRADIENT_PATH_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SUPPORTED_GRADIENT_PATH_CONFIGURATION_ID,
	}),
	extract: extractAlbumArtworkPaletteV2Phase3SupportedGradientPath,
})

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_ATTEMPT = Object.freeze({
	identity: Object.freeze({
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_CONFIGURATION_ID,
	}),
	extract: extractAlbumArtworkPaletteV2Phase3ContrastiveRoleAssignment,
})

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_ATTEMPT = Object.freeze({
	identity: Object.freeze({
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_CONFIGURATION_ID,
	}),
	extract: extractAlbumArtworkPaletteV2Phase3ComponentLocalEndpoint,
})

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RAW_RELATION_SLATE_COMPLEMENT_ATTEMPT = Object.freeze({
	identity: Object.freeze({
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RAW_RELATION_SLATE_COMPLEMENT_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RAW_RELATION_SLATE_COMPLEMENT_CONFIGURATION_ID,
	}),
	extract: extractAlbumArtworkPaletteV2Phase3RawRelationSlateComplement,
})
