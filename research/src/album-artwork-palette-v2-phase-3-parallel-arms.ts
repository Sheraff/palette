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
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY,
	selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
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
	"integrated-candidate-additive-component-local-endpoint-modes-v2" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_SLATE_POLICY = Object.freeze({
	maximumQualityLoss:
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.maximumSlateQualityLoss,
	maximumReservedTreatments: 1,
	baselineMutation: "replace-last-only",
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

function output<TKey extends string, TRoot>(
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
	return output(details, {
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

export function extractAlbumArtworkPaletteV2Phase3ContrastiveRoleAssignment(image: RawImage) {
	const details = extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails(image)
	const incumbent = details.custodyMaterialized.find(({ key }) =>
		key === completeTreatmentKey(details.result.winner))
	if (!incumbent) throw new Error("Contrastive role arm omitted the integrated incumbent")
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
	return output(details, {
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_CONFIGURATION_ID,
		diagnosticsKey: "phase3ContrastiveRoleAssignment",
	}, winner, slate, {
		version: "album-artwork-palette-v2-phase-3-contrastive-role-assignment-diagnostics-v1",
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_CONFIGURATION_ID,
		domain: details.result.diagnostics.phase3IntegratedCandidate.domain,
		selector: details.recoveryV2.explanation,
		lineageEligibility: details.selection.completeLineage.eligibility.diagnostics,
		transitionRescue: details.selection.transitionRescue,
		custody: details.selection.custody,
		selection: {
			...details.selection.diagnostics,
			winnerKey,
			winnerLineageBasis: lineageBasis(details, winnerKey),
		},
		contrastiveRoleAssignment: {
			...arm.diagnostics,
			qualityAndLineageBoundedCandidateKeys: [...boundedKeys].sort(compareAscii),
			appliedWinnerKey: selected?.key ?? null,
		},
	})
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

function componentEndpointDiagnosticRoot(
	details: IntegratedDetails,
	report: AlbumArtworkPaletteV2Phase3ComponentLocalEndpointReport,
	input: Readonly<{
		componentLocalFieldHypothesisCount: number
		componentLocalDescriptorCount: number
		supplementalOnlyMaterialization: ReturnType<
			typeof materializeAlbumArtworkPaletteV2Phase3Descriptors
		>["diagnostics"] | null
		selector: ReturnType<typeof selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2>["explanation"]
		lineageEligibility: ReturnType<
			typeof filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain
		>["diagnostics"]
		outputSlate: readonly CompletePaletteTreatment[]
		candidateKey: string | null
		candidateCompleteLineageEligible: boolean | null
		candidateQualityLossFromBaselineWinner: number | null
		reservedKey: string | null
		reservedQualityLossFromBaselineWinner: number | null
		replacedBaselineKey: string | null
		evaluationMaterializedTreatmentCount: number
	}>,
) {
	const baselineWinnerKey = completeTreatmentKey(details.result.winner)
	const baselineSlateKeys = details.result.alternatives.map(completeTreatmentKey)
	const outputSlateKeys = input.outputSlate.map(completeTreatmentKey)
	return {
		version: "album-artwork-palette-v2-phase-3-component-local-endpoint-diagnostics-v2",
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
		selection: {
			...details.selection.diagnostics,
			winnerKey: baselineWinnerKey,
			slateKeys: outputSlateKeys,
		},
		endpointSlateReservation: {
			policy: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_SLATE_POLICY,
			winnerAuthority: "integrated-baseline",
			selectorAuthority: "evaluation-only",
			baselineWinnerKey,
			outputWinnerKey: baselineWinnerKey,
			baselineWinnerUnchanged: true,
			baselineSlateKeys,
			outputSlateKeys,
			candidateKey: input.candidateKey,
			candidateCompleteLineageEligible: input.candidateCompleteLineageEligible,
			candidateQualityLossFromBaselineWinner: input.candidateQualityLossFromBaselineWinner,
			reservedKey: input.reservedKey,
			reservedCompleteLineageEligible: input.reservedKey === null ? null : true,
			reservedQualityLossFromBaselineWinner: input.reservedQualityLossFromBaselineWinner,
			replacedBaselineKey: input.replacedBaselineKey,
			baselinePrefixPreserved: outputSlateKeys.slice(0, -1).every((key, index) =>
				key === baselineSlateKeys[index]),
		},
		componentLocalEndpoint: report,
	}
}

export function extractAlbumArtworkPaletteV2Phase3ComponentLocalEndpoint(image: RawImage) {
	const details = extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails(image)
	const report = buildAlbumArtworkPaletteV2Phase3ComponentLocalEndpointArm(
		details.common.evidence.native,
		details.common.evidence.gradientFits,
	)
	const additions = componentEndpointFields(details, report)
	if (additions.fields.length === 0) {
		return output(details, {
			attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_ATTEMPT_ID,
			configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_CONFIGURATION_ID,
			diagnosticsKey: "phase3ComponentLocalEndpoint",
		}, details.result.winner, details.result.alternatives, componentEndpointDiagnosticRoot(
			details,
			report,
			{
				componentLocalFieldHypothesisCount: 0,
				componentLocalDescriptorCount: 0,
				supplementalOnlyMaterialization: null,
				selector: details.recoveryV2.explanation,
				lineageEligibility: details.selection.completeLineage.eligibility.diagnostics,
				outputSlate: details.result.alternatives,
				candidateKey: null,
				candidateCompleteLineageEligible: null,
				candidateQualityLossFromBaselineWinner: null,
				reservedKey: null,
				reservedQualityLossFromBaselineWinner: null,
				replacedBaselineKey: null,
				evaluationMaterializedTreatmentCount: details.custodyMaterialized.length,
			},
		))
	}
	const evidence = augmentedEvidence(details.common.evidence.augmentedNative, additions.families)
	const supplementalConstruction = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
		evidence,
		additions.fields.map(({ hypothesis }) => hypothesis),
	)
	const supplementalDescriptors: AlbumArtworkPaletteV2Phase3LogicalDescriptor[] =
		supplementalConstruction.treatments.map((descriptor) => ({
			sourceType: "field-proposal-v2",
			...descriptor,
		}))
	const sourcedFields = [...details.sourcedFields, ...additions.fields]
	if (supplementalDescriptors.length === 0) {
		return output(details, {
			attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_ATTEMPT_ID,
			configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_CONFIGURATION_ID,
			diagnosticsKey: "phase3ComponentLocalEndpoint",
		}, details.result.winner, details.result.alternatives, componentEndpointDiagnosticRoot(
			details,
			report,
			{
				componentLocalFieldHypothesisCount: additions.fields.length,
				componentLocalDescriptorCount: 0,
				supplementalOnlyMaterialization: null,
				selector: details.recoveryV2.explanation,
				lineageEligibility: details.selection.completeLineage.eligibility.diagnostics,
				outputSlate: details.result.alternatives,
				candidateKey: null,
				candidateCompleteLineageEligible: null,
				candidateQualityLossFromBaselineWinner: null,
				reservedKey: null,
				reservedQualityLossFromBaselineWinner: null,
				replacedBaselineKey: null,
				evaluationMaterializedTreatmentCount: details.custodyMaterialized.length,
			},
		), {
			families: evidence.families,
			fieldHypotheses: sourcedFields.map(({ hypothesis }) => hypothesis),
			completeCandidateCount: details.custodyMaterialized.length,
		})
	}
	const supplementalOnlyMaterialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
		supplementalDescriptors,
		details.common.seedAvailability.identityObligations,
	)
	const evaluationMaterializedByKey = new Map(details.custodyMaterialized.map((candidate) =>
		[candidate.key, candidate]))
	for (const candidate of supplementalOnlyMaterialization.materialized) {
		const supplementalCandidate = {
			key: candidate.key,
			treatment: candidate.treatment,
			descriptors: candidate.descriptors as readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[],
		}
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
	const evaluation = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(
		evaluationMaterialized.map(({ treatment }) => treatment),
		{ obligations: details.common.seedAvailability.identityObligations },
	)
	const lineageEligibility = filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain(
		evaluationMaterialized,
		{ emergency: details.closedDetails.result.diagnostics.emergency },
	)
	const lineageByKey = new Map(lineageEligibility.diagnostics.candidates.map((candidate) =>
		[candidate.key, candidate]))
	const supplementalOnlyKeys = new Set(supplementalOnlyMaterialization.materialized.map(({ key }) => key))
	const baselineKeys = new Set(details.custodyMaterialized.map(({ key }) => key))
	const endpointEvaluations = evaluation.evaluations.filter(({ key }) =>
		supplementalOnlyKeys.has(key) && !baselineKeys.has(key))
	const candidate = endpointEvaluations[0] ?? null
	const baselineWinnerKey = completeTreatmentKey(details.result.winner)
	const baselineWinnerEvaluation = evaluation.evaluations.find(({ key }) => key === baselineWinnerKey)
	if (!baselineWinnerEvaluation) throw new Error("Component-local endpoint evaluation omitted the baseline winner")
	const reserved = endpointEvaluations.find(({ key, qualityUtility }) =>
		lineageByKey.get(key)?.eligible === true &&
		baselineWinnerEvaluation.qualityUtility - qualityUtility <=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_SLATE_POLICY.maximumQualityLoss + 1e-12) ?? null
	const baselineSlate = details.result.alternatives
	const canReserve = reserved !== null && baselineSlate.length > 1 &&
		!baselineSlate.some((treatment) => completeTreatmentKey(treatment) === reserved.key)
	const slate = canReserve
		? [...baselineSlate.slice(0, -1), reserved.treatment]
		: baselineSlate
	const replacedBaselineKey = canReserve
		? completeTreatmentKey(baselineSlate[baselineSlate.length - 1])
		: null
	return output(details, {
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_CONFIGURATION_ID,
		diagnosticsKey: "phase3ComponentLocalEndpoint",
	}, details.result.winner, slate, componentEndpointDiagnosticRoot(details, report, {
		componentLocalFieldHypothesisCount: additions.fields.length,
		componentLocalDescriptorCount: supplementalDescriptors.length,
		supplementalOnlyMaterialization: supplementalOnlyMaterialization.diagnostics,
		selector: evaluation.explanation,
		lineageEligibility: lineageEligibility.diagnostics,
		outputSlate: slate,
		candidateKey: candidate?.key ?? null,
		candidateCompleteLineageEligible: candidate === null ? null : lineageByKey.get(candidate.key)?.eligible ?? false,
		candidateQualityLossFromBaselineWinner: candidate === null ? null : Math.max(0,
			baselineWinnerEvaluation.qualityUtility - candidate.qualityUtility),
		reservedKey: canReserve ? reserved.key : null,
		reservedQualityLossFromBaselineWinner: canReserve ? Math.max(0,
			baselineWinnerEvaluation.qualityUtility - reserved.qualityUtility) : null,
		replacedBaselineKey,
		evaluationMaterializedTreatmentCount: evaluationMaterialized.length,
	}), {
		families: evidence.families,
		fieldHypotheses: sourcedFields.map(({ hypothesis }) => hypothesis),
		completeCandidateCount: evaluationMaterialized.length,
	})
}

export function extractAlbumArtworkPaletteV2Phase3RawRelationSlateComplement(image: RawImage) {
	const details = extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails(image)
	const selection = reserveAlbumArtworkPaletteV2Phase3RawRelationSlateComplement({
		current: { winner: details.result.winner, slate: details.result.alternatives },
		recoveryV2: details.recoveryV2,
		completeLineageEligibility: details.selection.completeLineage.eligibility,
	})
	return output(details, {
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
