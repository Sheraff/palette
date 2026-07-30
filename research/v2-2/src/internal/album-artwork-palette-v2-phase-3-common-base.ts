import { assignFieldRoles, buildNativePaletteEvidence, completeTreatmentKey, constructAlbumArtworkPaletteV2Phase3SupplementalTreatments, diagnoseGradientFits, extractAlbumArtworkPaletteV2074Details, fieldDirectionKey, roleDirectionKeys } from "./album-artwork-palette-v2.ts";

import type { AlbumArtworkPaletteV2074CoreAudit, AlbumArtworkPaletteV2074Details, BackgroundFieldDomainEvidence, ColorFamilyEvidence, CompletePaletteTreatment, FieldHypothesis, GradientFitDiagnostic, IdentityObligation, NativePaletteEvidence, RecallAuditTreatmentLineage } from "./album-artwork-palette-v2.ts";

import { buildBandLocalEndpointRefinements } from "./album-artwork-palette-v2-phase-3-endpoint-refinement.ts";

import type { BandLocalEndpointRefinement, BandLocalEndpointRefinementReport } from "./album-artwork-palette-v2-phase-3-endpoint-refinement.ts";

import { discoverNativeFieldTransitions } from "./album-artwork-palette-v2-phase-3-field-transition.ts";

import type { NativeFieldTransitionDiscovery } from "./album-artwork-palette-v2-phase-3-field-transition.ts";

import type { RawImage } from "./types.ts";

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMMON_BASE_CONTRACT_ID =
	"album-artwork-palette-v2-phase-3-common-pre-cap-domain-v1" as const

export type AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType =
	"closed-0.7.4-seed" |
	"native-field-transition" |
	"band-local-endpoint" |
	"field-proposal-v2"

export type AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis = Readonly<{
	sourceType: AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType
	hypothesis: FieldHypothesis
}>

export type AlbumArtworkPaletteV2Phase3LogicalDescriptor = Readonly<{
	sourceType: AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType
	treatment: CompletePaletteTreatment
	fieldHypothesis: FieldHypothesis
	lineage: RecallAuditTreatmentLineage
}>

export type AlbumArtworkPaletteV2Phase3CommonEvidence = Readonly<{
	native: NativePaletteEvidence
	augmentedNative: NativePaletteEvidence
	gradientFits: readonly GradientFitDiagnostic[]
	nativeFieldTransitions: NativeFieldTransitionDiscovery
	bandLocalEndpoints: BandLocalEndpointRefinementReport
	bandLocalEndpointFamilies: readonly ColorFamilyEvidence[]
}>

export type AlbumArtworkPaletteV2Phase3SeedAvailability = Readonly<{
	domain: "closed-0.7.4-complete-domain"
	fieldHypotheses: readonly AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[]
	logicalDescriptors: readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[]
	identityObligations: readonly IdentityObligation[]
}>

export type AlbumArtworkPaletteV2Phase3SupplementalAvailability = Readonly<{
	fieldHypotheses: readonly AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[]
	logicalDescriptors: readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[]
	constructedTreatmentCountByHypothesis: Readonly<Record<string, number>>
}>

export type AlbumArtworkPaletteV2Phase3MaterializedDomainLike = Readonly<{
	materialized: readonly Readonly<{
		key: string
		treatment: CompletePaletteTreatment
	}>[]
	diagnostics: unknown
}>

export type AlbumArtworkPaletteV2Phase3CommonBaseDiagnostics = Readonly<{
	version: "album-artwork-palette-v2-phase-3-common-base-diagnostics-v1"
	seedDescriptorCount: number
	seedCanonicalTreatmentCount: number
	nativeFieldTransition: Readonly<{
		discoveredTraceCount: number
		eligibleTraceCount: number
		legalHypothesisCount: number
		availableHypothesisCount: number
	}>
	bandLocalEndpoint: Readonly<{
		evaluatedFitCount: number
		sameFamilyFitCount: number
		acceptedCount: number
		rejectedCount: number
		legalHypothesisCount: number
		availableHypothesisCount: number
		supplementalFamilyCount: number
	}>
	supplementalDescriptorCount: number
	logicalDescriptorCount: number
	canonicalTreatmentCountBeforeMaterialization: number
	duplicateCanonicalDescriptorCount: number
	hypothesisCustody: ReadonlyArray<Readonly<{
		hypothesisId: string
		sourceType: AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType
		logicalDescriptorCount: number
		canonicalTreatmentCount: number
		sourceConnectedDescriptorCount: number
	}>>
	currentV1Comparison: Readonly<{
		present: boolean
		materializedTreatmentCount: number | null
	}>
}>

export type AlbumArtworkPaletteV2Phase3CommonBase<
	TCurrentV1 extends AlbumArtworkPaletteV2Phase3MaterializedDomainLike =
		AlbumArtworkPaletteV2Phase3MaterializedDomainLike,
> = Readonly<{
	contractId: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMMON_BASE_CONTRACT_ID
	evidence: AlbumArtworkPaletteV2Phase3CommonEvidence
	fieldHypotheses: readonly AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[]
	seedAvailability: AlbumArtworkPaletteV2Phase3SeedAvailability
	supplementalAvailability: AlbumArtworkPaletteV2Phase3SupplementalAvailability
	logicalDescriptors: readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[]
	currentV1MaterializedDomain: TCurrentV1 | null
	diagnostics: AlbumArtworkPaletteV2Phase3CommonBaseDiagnostics
}>

export type AlbumArtworkPaletteV2Phase3CommonBaseOptions<
	TCurrentV1 extends AlbumArtworkPaletteV2Phase3MaterializedDomainLike,
> = Readonly<{
	closed074Details?: AlbumArtworkPaletteV2074Details
	materializeCurrentV1?: (
		logicalDescriptors: readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[],
		identityObligations: readonly IdentityObligation[],
	) => TCurrentV1
}>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function clamp(value: number): number {
	return Math.max(0, Math.min(1, value))
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

function endpointHypothesis(
	refinement: BandLocalEndpointRefinement,
	diagnostic: GradientFitDiagnostic,
	domain: BackgroundFieldDomainEvidence | undefined,
): FieldHypothesis | null {
	if (!refinement.accepted || !refinement.low || !refinement.high) return null
	const low = refinement.low
	const high = refinement.high
	const roleAssignment = assignFieldRoles(low.family, high.family)
	const backgroundIsLow = roleAssignment.backgroundFamilyId === low.family.id
	const background = backgroundIsLow ? low : high
	const surface = backgroundIsLow ? high : low
	const fitQuality = clamp(1 - refinement.fit.residual / Math.max(0.001, refinement.fit.span))
	const support = clamp(Math.min(
		low.distribution.populationFraction,
		high.distribution.populationFraction,
	) / 0.08)
	const fieldFidelity = clamp(
		0.28 * refinement.fit.progression +
		0.22 * refinement.fit.monotonicity +
		0.20 * fitQuality +
		0.16 * clamp(refinement.endpointDistance / 0.12) +
		0.14 * support,
	)
	const componentIds = [...new Set([
		...low.family.components.map(({ id }) => id),
		...high.family.components.map(({ id }) => id),
	])].sort(compareAscii)
	return {
		id: `endpoint-refinement:${refinement.id}`,
		kind: "gradient-field",
		backgroundFamilyId: background.family.id,
		surfaceFamilyId: surface.family.id,
		backgroundRepresentatives: background.family.representatives,
		surfaceRepresentatives: surface.family.representatives,
		fieldFidelity,
		surfaceContribution: clamp(
			0.35 * refinement.fit.progression +
			0.30 * clamp(refinement.endpointDistance / 0.12) +
			0.20 * fitQuality +
			0.15 * support,
		),
		spatialRelation: null,
		roleAssignment,
		gradientEvidence: {
			topology: refinement.fit.topology,
			direction: refinement.fit.direction,
			endpointBands: [0.2, 0.8],
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
			edgeContinuity: fitQuality,
			coverage: clamp(1 - diagnostic.residual / Math.max(0.001, diagnostic.span)),
			supportingFamilyIds: [low.family.id, high.family.id],
			supportingEndpointHexes: [
				low.representatives.denseExact.hex,
				high.representatives.denseExact.hex,
			],
			backgroundTopologyEndpoint: backgroundIsLow ? "low" : "high",
			roleAssignment,
			fieldDomainId: refinement.fit.fieldDomainId,
			fieldDomainPopulationFraction: diagnostic.fieldDomainPopulationFraction,
			fieldDomainBorderCoverage: domain?.borderCoverage ?? 0,
			fieldDomainOwnedCornerCount: domain?.ownedCornerCount ?? 0,
			supportingComponentIds: componentIds,
		},
		pruningNotes: [
			"retained from occupied band-local endpoint distributions with independently recomputed support",
		],
	}
}

function augmentEvidenceWithEndpointFamilies(
	evidence: NativePaletteEvidence,
	refinements: readonly BandLocalEndpointRefinement[],
): Readonly<{ evidence: NativePaletteEvidence; families: readonly ColorFamilyEvidence[] }> {
	const families = new Map(evidence.families.map((family) => [family.id, family]))
	const supplementalFamilies = new Map<string, ColorFamilyEvidence>()
	for (const refinement of refinements) {
		if (!refinement.accepted || !refinement.low || !refinement.high) continue
		for (const family of [refinement.low.family, refinement.high.family]) {
			families.set(family.id, family)
			supplementalFamilies.set(family.id, family)
		}
	}
	const endpointFamilyIds = [...supplementalFamilies.keys()]
	return {
		evidence: {
			...evidence,
			families: [...families.values()],
			retainedFamilyIds: [...evidence.retainedFamilyIds, ...endpointFamilyIds],
		},
		families: [...supplementalFamilies.values()],
	}
}

function sourceConnectedRole(
	treatment: CompletePaletteTreatment,
	role: "background" | "surface" | "foreground" | "accent",
): boolean {
	const color = treatment[role]
	return !color.generated && !("generated" in color.support) &&
		color.support.anchorFamilyId.length > 0 && color.support.regionIds.length > 0
}

function lineageFromClosedDomain(
	treatment: CompletePaletteTreatment,
	audit: AlbumArtworkPaletteV2074CoreAudit,
): RecallAuditTreatmentLineage {
	const familyIds = [...new Set(Object.values(treatment.familyRoles)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii)
	const representatives = (["background", "surface", "foreground", "accent"] as const).map((role) => ({
		role,
		familyId: treatment.familyRoles[role],
		hex: treatment[role].hex,
		strategy: treatment[role].strategy,
		sourceConnected: sourceConnectedRole(treatment, role),
	}))
	const treatmentFieldDirectionKey = fieldDirectionKey(treatment)
	const treatmentRoleDirectionKeys = roleDirectionKeys(treatment)
	const fieldHypothesis = audit.registry.fieldHypotheses.find(({ hypothesisId }) =>
		hypothesisId === treatment.sourceFieldHypothesisId)
	const fieldDirection = audit.registry.fieldDirections.find(({ key, hypothesisIds }) =>
		key === treatmentFieldDirectionKey && hypothesisIds.includes(treatment.sourceFieldHypothesisId))
	return {
		fieldHypothesisId: treatment.sourceFieldHypothesisId,
		fieldDirectionKey: treatmentFieldDirectionKey,
		roleDirectionKeys: treatmentRoleDirectionKeys,
		familyIds,
		representatives,
		sourceConnected: fieldHypothesis?.sourceConnected === true && fieldDirection?.sourceConnected === true &&
			treatmentRoleDirectionKeys.every((key) => audit.registry.roleDirections.some((direction) =>
				direction.key === key && direction.sourceConnected)) &&
			familyIds.every((familyId) => audit.registry.families.some((family) =>
				family.familyId === familyId && family.sourceConnected)) &&
			representatives.every(({ sourceConnected }) => sourceConnected),
	}
}

function descriptorsFromClosed074(
	details: AlbumArtworkPaletteV2074Details,
): AlbumArtworkPaletteV2Phase3LogicalDescriptor[] {
	const hypothesesById = new Map(details.result.diagnostics.fieldHypotheses.map((hypothesis) =>
		[hypothesis.id, hypothesis]))
	const additionLineageByKey = new Map(details.audit.additions.map(({ key, lineage }) => [key, lineage]))
	return details.audit.candidate.completeTreatments.map((treatment) => {
		const fieldHypothesis = hypothesesById.get(treatment.sourceFieldHypothesisId)
		if (!fieldHypothesis) throw new Error(`Closed domain omitted field hypothesis ${treatment.sourceFieldHypothesisId}`)
		return {
			sourceType: "closed-0.7.4-seed",
			treatment,
			fieldHypothesis,
			lineage: additionLineageByKey.get(completeTreatmentKey(treatment)) ??
				lineageFromClosedDomain(treatment, details.audit),
		}
	})
}

function uniqueSourcedHypotheses(
	values: readonly AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[],
): AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[] {
	const unique = new Map<string, AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis>()
	for (const value of values) unique.set(`${value.sourceType}\0${value.hypothesis.id}`, value)
	return [...unique.values()]
}

export function buildAlbumArtworkPaletteV2Phase3CommonBase<
	TCurrentV1 extends AlbumArtworkPaletteV2Phase3MaterializedDomainLike =
		AlbumArtworkPaletteV2Phase3MaterializedDomainLike,
>(
	image: RawImage,
	options: AlbumArtworkPaletteV2Phase3CommonBaseOptions<TCurrentV1> = {},
): AlbumArtworkPaletteV2Phase3CommonBase<TCurrentV1> {
	const closed = options.closed074Details ?? extractAlbumArtworkPaletteV2074Details(image)
	const native = buildNativePaletteEvidence(image)
	const nativeFieldTransitions = discoverNativeFieldTransitions(native)
	const transitionHypotheses = nativeFieldTransitions.hypotheses.filter(supportedGeometry)
	const gradientFits = diagnoseGradientFits(native)
	const bandLocalEndpoints = buildBandLocalEndpointRefinements(native, gradientFits)
	const fieldDomainById = new Map(closed.result.diagnostics.fieldDomains.map((domain) => [domain.id, domain]))
	const endpointHypotheses = bandLocalEndpoints.refinements.flatMap((refinement): FieldHypothesis[] => {
		const diagnostic = gradientFits.find((candidate) =>
			candidate.fieldDomainId === refinement.fit.fieldDomainId &&
			candidate.topology === refinement.fit.topology && candidate.direction === refinement.fit.direction)
		if (!diagnostic) return []
		const hypothesis = endpointHypothesis(
			refinement,
			diagnostic,
			fieldDomainById.get(refinement.fit.fieldDomainId),
		)
		return hypothesis && supportedGeometry(hypothesis) ? [hypothesis] : []
	})
	const augmented = augmentEvidenceWithEndpointFamilies(native, bandLocalEndpoints.refinements)
	const supplementalSourceByHypothesisId = new Map<string, AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType>([
		...transitionHypotheses.map(({ id }) => [id, "native-field-transition"] as const),
		...endpointHypotheses.map(({ id }) => [id, "band-local-endpoint"] as const),
	])
	const sourcedSupplementalHypotheses = [
		...transitionHypotheses.map((hypothesis) => ({
			sourceType: "native-field-transition" as const,
			hypothesis,
		})),
		...endpointHypotheses.map((hypothesis) => ({
			sourceType: "band-local-endpoint" as const,
			hypothesis,
		})),
	]
	const supplementalConstruction = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
		augmented.evidence,
		[...transitionHypotheses, ...endpointHypotheses],
	)
	const supplementalFieldHypotheses = supplementalConstruction.hypotheses.map((hypothesis) => ({
		sourceType: supplementalSourceByHypothesisId.get(hypothesis.id)!,
		hypothesis,
	}))
	const supplementalLogicalDescriptors = supplementalConstruction.treatments.map((descriptor) => ({
		sourceType: supplementalSourceByHypothesisId.get(descriptor.fieldHypothesis.id)!,
		...descriptor,
	}))
	const seedLogicalDescriptors = descriptorsFromClosed074(closed)
	const seedFieldHypotheses = uniqueSourcedHypotheses(seedLogicalDescriptors.map(({ fieldHypothesis }) => ({
		sourceType: "closed-0.7.4-seed",
		hypothesis: fieldHypothesis,
	})))
	const fieldHypotheses = [...seedFieldHypotheses, ...sourcedSupplementalHypotheses]
	const logicalDescriptors = [...seedLogicalDescriptors, ...supplementalLogicalDescriptors]
	const identityObligations = closed.result.diagnostics.identityObligationGraph.obligations
	const currentV1MaterializedDomain = options.materializeCurrentV1?.(
		logicalDescriptors,
		identityObligations,
	) ?? null
	const canonicalTreatmentCount = (descriptors: readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[]): number =>
		new Set(descriptors.map(({ treatment }) => completeTreatmentKey(treatment))).size
	const hypothesisCustody = fieldHypotheses.map(({ sourceType, hypothesis }) => {
		const descriptors = logicalDescriptors.filter((descriptor) =>
			descriptor.sourceType === sourceType && descriptor.fieldHypothesis.id === hypothesis.id)
		return {
			hypothesisId: hypothesis.id,
			sourceType,
			logicalDescriptorCount: descriptors.length,
			canonicalTreatmentCount: canonicalTreatmentCount(descriptors),
			sourceConnectedDescriptorCount: descriptors.filter(({ lineage }) => lineage.sourceConnected).length,
		}
	})
	const availableTransitionHypothesisCount = supplementalFieldHypotheses.filter(({ sourceType }) =>
		sourceType === "native-field-transition").length
	const availableEndpointHypothesisCount = supplementalFieldHypotheses.filter(({ sourceType }) =>
		sourceType === "band-local-endpoint").length
	const seedCanonicalTreatmentCount = canonicalTreatmentCount(seedLogicalDescriptors)
	const canonicalTreatmentCountBeforeMaterialization = canonicalTreatmentCount(logicalDescriptors)
	return {
		contractId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMMON_BASE_CONTRACT_ID,
		evidence: {
			native,
			augmentedNative: augmented.evidence,
			gradientFits,
			nativeFieldTransitions,
			bandLocalEndpoints,
			bandLocalEndpointFamilies: augmented.families,
		},
		fieldHypotheses,
		seedAvailability: {
			domain: "closed-0.7.4-complete-domain",
			fieldHypotheses: seedFieldHypotheses,
			logicalDescriptors: seedLogicalDescriptors,
			identityObligations,
		},
		supplementalAvailability: {
			fieldHypotheses: supplementalFieldHypotheses,
			logicalDescriptors: supplementalLogicalDescriptors,
			constructedTreatmentCountByHypothesis:
				supplementalConstruction.constructedTreatmentCountByHypothesis,
		},
		logicalDescriptors,
		currentV1MaterializedDomain,
		diagnostics: {
			version: "album-artwork-palette-v2-phase-3-common-base-diagnostics-v1",
			seedDescriptorCount: seedLogicalDescriptors.length,
			seedCanonicalTreatmentCount,
			nativeFieldTransition: {
				discoveredTraceCount: nativeFieldTransitions.traces.length,
				eligibleTraceCount: nativeFieldTransitions.traces.filter(({ eligible }) => eligible).length,
				legalHypothesisCount: transitionHypotheses.length,
				availableHypothesisCount: availableTransitionHypothesisCount,
			},
			bandLocalEndpoint: {
				evaluatedFitCount: bandLocalEndpoints.evaluatedFitCount,
				sameFamilyFitCount: bandLocalEndpoints.sameFamilyFitCount,
				acceptedCount: bandLocalEndpoints.acceptedCount,
				rejectedCount: bandLocalEndpoints.rejectedCount,
				legalHypothesisCount: endpointHypotheses.length,
				availableHypothesisCount: availableEndpointHypothesisCount,
				supplementalFamilyCount: augmented.families.length,
			},
			supplementalDescriptorCount: supplementalLogicalDescriptors.length,
			logicalDescriptorCount: logicalDescriptors.length,
			canonicalTreatmentCountBeforeMaterialization,
			duplicateCanonicalDescriptorCount: logicalDescriptors.length - canonicalTreatmentCountBeforeMaterialization,
			hypothesisCustody,
			currentV1Comparison: {
				present: currentV1MaterializedDomain !== null,
				materializedTreatmentCount: currentV1MaterializedDomain?.materialized.length ?? null,
			},
		},
	}
}
