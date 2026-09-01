import { assignFieldRoles, completeTreatmentKey, diagnoseGradientFits, fieldDirectionKey, roleDirectionKeys } from "./palette-core.ts";

import type { BackgroundFieldDomainEvidence, ColorFamilyEvidence, CompletePaletteTreatment, FieldHypothesis, GradientFitDiagnostic, IdentityObligation, NativePaletteEvidence, PaletteSeedDomain, SourceRegistry, TreatmentLineage } from "./palette-core.ts";

import { buildBandLocalEndpointRefinements } from "./endpoint-refinement.ts";

import type { BandLocalEndpointRefinement } from "./endpoint-refinement.ts";

import { discoverNativeFieldTransitions } from "./field-transition.ts";

import type { NativeFieldTransitionDiscovery } from "./field-transition.ts";

export type AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType =
	"native-seed" |
	"native-field-transition" |
	"band-local-endpoint"

export type AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis = Readonly<{
	sourceType: AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType
	hypothesis: FieldHypothesis
}>

export type AlbumArtworkPaletteV2Phase3LogicalDescriptor = Readonly<{
	sourceType: AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType
	treatment: CompletePaletteTreatment
	fieldHypothesis: FieldHypothesis
	lineage: TreatmentLineage
}>

export type AlbumArtworkPaletteV2Phase3CommonEvidence = Readonly<{
	native: NativePaletteEvidence
	augmentedNative: NativePaletteEvidence
	nativeFieldTransitions: NativeFieldTransitionDiscovery
}>

export type AlbumArtworkPaletteV2Phase3SeedAvailability = Readonly<{
	fieldHypotheses: readonly AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[]
	logicalDescriptors: readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[]
	identityObligations: readonly IdentityObligation[]
}>

export type AlbumArtworkPaletteV2Phase3CommonBase = Readonly<{
	evidence: AlbumArtworkPaletteV2Phase3CommonEvidence
	fieldHypotheses: readonly AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[]
	seedAvailability: AlbumArtworkPaletteV2Phase3SeedAvailability
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
	registry: SourceRegistry,
): TreatmentLineage {
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
	const fieldHypothesis = registry.fieldHypotheses.find(({ hypothesisId }) =>
		hypothesisId === treatment.sourceFieldHypothesisId)
	const fieldDirection = registry.fieldDirections.find(({ key, hypothesisIds }) =>
		key === treatmentFieldDirectionKey && hypothesisIds.includes(treatment.sourceFieldHypothesisId))
	return {
		fieldHypothesisId: treatment.sourceFieldHypothesisId,
		fieldDirectionKey: treatmentFieldDirectionKey,
		roleDirectionKeys: treatmentRoleDirectionKeys,
		familyIds,
		representatives,
		sourceConnected: fieldHypothesis?.sourceConnected === true && fieldDirection?.sourceConnected === true &&
			treatmentRoleDirectionKeys.every((key) => registry.roleDirections.some((direction) =>
				direction.key === key && direction.sourceConnected)) &&
			familyIds.every((familyId) => registry.families.some((family) =>
				family.familyId === familyId && family.sourceConnected)) &&
			representatives.every(({ sourceConnected }) => sourceConnected),
	}
}

function descriptorsFromSeed(
	seed: PaletteSeedDomain,
): AlbumArtworkPaletteV2Phase3LogicalDescriptor[] {
	const hypothesesById = new Map(seed.fieldHypotheses.map((hypothesis) =>
		[hypothesis.id, hypothesis]))
	const additionLineageByKey = new Map(seed.additions.map(({ key, lineage }) => [key, lineage]))
	return seed.completeTreatments.map((treatment) => {
		const fieldHypothesis = hypothesesById.get(treatment.sourceFieldHypothesisId)
		if (!fieldHypothesis) throw new Error(`Closed domain omitted field hypothesis ${treatment.sourceFieldHypothesisId}`)
		return {
			sourceType: "native-seed",
			treatment,
			fieldHypothesis,
			lineage: additionLineageByKey.get(completeTreatmentKey(treatment)) ??
				lineageFromClosedDomain(treatment, seed.registry),
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

export function buildAlbumArtworkPaletteV2Phase3CommonBase(
	seed: PaletteSeedDomain,
): AlbumArtworkPaletteV2Phase3CommonBase {
	const native = seed.evidence
	const nativeFieldTransitions = discoverNativeFieldTransitions(native)
	const transitionHypotheses = nativeFieldTransitions.hypotheses.filter(supportedGeometry)
	const gradientFits = diagnoseGradientFits(native)
	const bandLocalEndpoints = buildBandLocalEndpointRefinements(native, gradientFits)
	const fieldDomainById = new Map(seed.fieldDomains.map((domain) => [domain.id, domain]))
	const endpointHypotheses = bandLocalEndpoints.flatMap((refinement): FieldHypothesis[] => {
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
	const augmented = augmentEvidenceWithEndpointFamilies(native, bandLocalEndpoints)
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
	const seedLogicalDescriptors = descriptorsFromSeed(seed)
	const seedFieldHypotheses = uniqueSourcedHypotheses(seedLogicalDescriptors.map(({ fieldHypothesis }) => ({
		sourceType: "native-seed",
		hypothesis: fieldHypothesis,
	})))
	const fieldHypotheses = [...seedFieldHypotheses, ...sourcedSupplementalHypotheses]
	const identityObligations = seed.identityObligations
	return {
		evidence: {
			native,
			augmentedNative: augmented.evidence,
			nativeFieldTransitions,
		},
		fieldHypotheses,
		seedAvailability: {
			fieldHypotheses: seedFieldHypotheses,
			logicalDescriptors: seedLogicalDescriptors,
			identityObligations,
		},
	}
}
