import {
	completeTreatmentKey,
	extractAlbumArtworkPaletteV2074Details,
	fieldDirectionKey,
	roleDirectionKeys,
} from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Result,
	CompletePaletteTreatment,
	IdentityObligation,
	NativePaletteEvidence,
} from "./album-artwork-palette-v2.ts"
import {
	buildAlbumArtworkPaletteV2Phase3CommonBase,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"
import type {
	AlbumArtworkPaletteV2Phase3CommonBaseDiagnostics,
	AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType,
	AlbumArtworkPaletteV2Phase3LogicalDescriptor,
	AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"
import type { AlbumArtworkPaletteV2Phase3AttemptAdapter } from
	"./album-artwork-palette-v2-phase-3-contract.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_VERSION,
	materializeAlbumArtworkPaletteV2Phase3V2,
} from "./album-artwork-palette-v2-phase-3-materialization-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3MaterializationV2,
	AlbumArtworkPaletteV2Phase3MaterializationV2Diagnostics,
} from "./album-artwork-palette-v2-phase-3-materialization-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_ID,
	buildAlbumArtworkPaletteV2Phase3RecoveryV3RoleEvidence,
	selectAlbumArtworkPaletteV2Phase3RecoveryV3Custody,
} from "./album-artwork-palette-v2-phase-3-recovery-custody-v3.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoveryV3CustodyDiagnostics,
	AlbumArtworkPaletteV2Phase3RecoveryV3CustodySelection,
} from "./album-artwork-palette-v2-phase-3-recovery-custody-v3.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID,
	selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation,
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_VERSION,
	constructAlbumArtworkPaletteV2Phase3RoleDomainV2,
} from "./album-artwork-palette-v2-phase-3-role-domain-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3RoleDomainV2Diagnostics,
	AlbumArtworkPaletteV2Phase3RoleDomainV2LogicalDescriptor,
	AlbumArtworkPaletteV2Phase3RoleDomainV2Output,
} from "./album-artwork-palette-v2-phase-3-role-domain-v2.ts"
import type { RawImage } from "./types.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_ADDITIVE_ROLE_DOMAIN_ATTEMPT_ID =
	"phase-3-arm-additive-role-domain" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_ADDITIVE_ROLE_DOMAIN_CONFIGURATION_ID =
	"common-complete-domain-plus-role-domain-v2-materialization-v2-recovery-v2-custody-v3" as const

export type AlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainRejectionReason =
	"inconsistent-field-lineage" |
	"inconsistent-direction-lineage" |
	"inconsistent-family-lineage" |
	"unsupported-role-lineage" |
	"illegal-collapse" |
	"illegal-cardinality" |
	"illegal-role-collision" |
	"illegal-gradient"

export type AlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainSourceCustody = Readonly<{
	sourceType: AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType
	descriptorCount: number
	canonicalTreatmentCount: number
	materializedCanonicalTreatmentCount: number
	selectedCanonicalTreatmentCount: number
	truncatedCanonicalTreatmentCount: number
}>

export type AlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainCanonicalAdditionCustody = Readonly<{
	key: string
	descriptorCount: number
	sourceTypes: readonly AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType[]
	coveredRoleObligationIds: readonly string[]
	materialized: boolean
	selected: boolean
	selectedIndex: number | null
	selectionKind: "winner" | "custody-reserve" | "ordinary-quality-slate-fill" | null
}>

export type AlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainDiagnostics = Readonly<{
	version: "album-artwork-palette-v2-phase-3-arm-additive-role-domain-diagnostics-v1"
	configurationId: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_ADDITIVE_ROLE_DOMAIN_CONFIGURATION_ID
	modules: Readonly<{
		roleDomain: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_VERSION
		materialization: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_VERSION
		selection: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID
		custody: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_ID
	}>
	domain: Readonly<{
		baseDescriptorCount: number
		baseCanonicalTreatmentCount: number
		constructedAdditiveDescriptorCount: number
		additiveDescriptorCount: number
		rejectedAdditiveDescriptorCount: number
		additiveCanonicalTreatmentCount: number
		canonicalOverlapWithBaseCount: number
		canonicalAdditionCount: number
		logicalDescriptorCount: number
		canonicalTreatmentCount: number
	}>
	baseCustody: Readonly<{
		preservedBeforeMaterialization: true
		preservedAfterMaterialization: boolean
		preservationStatus: "complete" | "capacity-tradeoff"
		materializedDescriptorCount: number
		materializedCanonicalTreatmentCount: number
		truncatedDescriptorCount: number
		truncatedCanonicalTreatmentCount: number
		bySource: readonly AlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainSourceCustody[]
	}>
	additiveCustody: Readonly<{
		materializedDescriptorCount: number
		materializedCanonicalTreatmentCount: number
		selectedDescriptorCount: number
		selectedCanonicalTreatmentCount: number
		rejections: readonly Readonly<{
			reason: AlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainRejectionReason
			count: number
		}>[]
	}>
	obligationCustody: Readonly<{
		candidateCount: number
		feasibleCount: number
		foregroundCount: number
		accentCount: number
		ambiguousDirectionCount: number
		coveredByAdditiveDescriptorsCount: number
		coveredAfterMaterializationCount: number
		coveredBySelectedTreatmentsCount: number
		recoveryV3CustodyObligationCount: number
	}>
	canonicalAdditionCustody: Readonly<{
		availableCount: number
		materializedCount: number
		truncatedCount: number
		selectedCount: number
		additions: readonly AlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainCanonicalAdditionCustody[]
	}>
	truncation: Readonly<{
		capacity: number
		capacityReached: boolean
		capacityTradeoff: boolean
		totalCanonicalTreatmentCount: number
		materializedCanonicalTreatmentCount: number
		truncatedCanonicalTreatmentCount: number
		truncatedBaseCanonicalTreatmentCount: number
		truncatedCanonicalAdditionCount: number
	}>
}>

export type AlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainInput = Readonly<{
	evidence: NativePaletteEvidence
	fieldHypotheses: readonly AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[]
	baseLogicalDescriptors: readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[]
	identityObligations: readonly IdentityObligation[]
	materializationCapacity?: number
}>

export type AlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainConstruction = Readonly<{
	baseLogicalDescriptors: readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[]
	additiveLogicalDescriptors: readonly AlbumArtworkPaletteV2Phase3RoleDomainV2LogicalDescriptor[]
	logicalDescriptors: readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[]
	roleDomain: AlbumArtworkPaletteV2Phase3RoleDomainV2Output
	materialization: AlbumArtworkPaletteV2Phase3MaterializationV2
	recoveryV2: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection
	custody: AlbumArtworkPaletteV2Phase3RecoveryV3CustodySelection
	diagnostics: AlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainDiagnostics
}>

export type AlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainAttemptDiagnostics = Readonly<{
	commonBase: AlbumArtworkPaletteV2Phase3CommonBaseDiagnostics
	roleDomain: AlbumArtworkPaletteV2Phase3RoleDomainV2Diagnostics
	construction: AlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainDiagnostics
	materialization: AlbumArtworkPaletteV2Phase3MaterializationV2Diagnostics
	selector: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation
	custody: AlbumArtworkPaletteV2Phase3RecoveryV3CustodyDiagnostics
}>

export type AlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainResult =
	Omit<AlbumArtworkPaletteV2Result, "diagnostics"> & Readonly<{
		diagnostics: AlbumArtworkPaletteV2Result["diagnostics"] & Readonly<{
			phase3ArmAdditiveRoleDomain: AlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainAttemptDiagnostics
		}>
	}>

const ROLES = ["background", "surface", "foreground", "accent"] as const

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function sortedUnique(values: readonly string[]): string[] {
	return [...new Set(values)].sort(compareAscii)
}

function sameStrings(first: readonly string[], second: readonly string[]): boolean {
	return first.length === second.length && first.every((value, index) => value === second[index])
}

function descriptorOrder(
	first: AlbumArtworkPaletteV2Phase3LogicalDescriptor,
	second: AlbumArtworkPaletteV2Phase3LogicalDescriptor,
): number {
	return compareAscii(first.sourceType, second.sourceType) ||
		compareAscii(first.fieldHypothesis.id, second.fieldHypothesis.id) ||
		compareAscii(completeTreatmentKey(first.treatment), completeTreatmentKey(second.treatment)) ||
		compareAscii(first.treatment.id, second.treatment.id) ||
		compareAscii(first.lineage.fieldDirectionKey, second.lineage.fieldDirectionKey)
}

function additiveDescriptorRejectionReason(
	descriptor: AlbumArtworkPaletteV2Phase3RoleDomainV2LogicalDescriptor,
): AlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainRejectionReason | null {
	const { treatment, fieldHypothesis, lineage } = descriptor
	if (treatment.sourceFieldHypothesisId !== fieldHypothesis.id ||
		lineage.fieldHypothesisId !== fieldHypothesis.id) return "inconsistent-field-lineage"
	const expectedRoleDirections = [...roleDirectionKeys(treatment)].sort(compareAscii)
	const actualRoleDirections = [...lineage.roleDirectionKeys].sort(compareAscii)
	if (lineage.fieldDirectionKey !== fieldDirectionKey(treatment) ||
		!sameStrings(expectedRoleDirections, actualRoleDirections)) return "inconsistent-direction-lineage"
	const expectedFamilyIds = sortedUnique(Object.values(treatment.familyRoles)
		.filter((familyId): familyId is string => familyId !== "generated"))
	if (!sameStrings(expectedFamilyIds, sortedUnique(lineage.familyIds))) return "inconsistent-family-lineage"
	if (!lineage.sourceConnected || lineage.representatives.length !== ROLES.length) {
		return "unsupported-role-lineage"
	}
	for (const role of ROLES) {
		const familyId = treatment.familyRoles[role]
		const color = treatment[role]
		const representative = lineage.representatives.find((candidate) => candidate.role === role)
		if (familyId === "generated" || color.generated || "generated" in color.support ||
			color.support.anchorFamilyId !== familyId || color.support.regionIds.length === 0 ||
			!representative?.sourceConnected || representative.familyId !== familyId ||
			representative.hex.toLowerCase() !== color.hex.toLowerCase()) return "unsupported-role-lineage"
	}
	const roleHexes = ROLES.map((role) => treatment[role].hex.toLowerCase())
	const cardinality = new Set(roleHexes).size
	if (cardinality !== treatment.cardinality || cardinality < 2 || cardinality > 4) {
		return "illegal-cardinality"
	}
	const surfaceCollapsed = roleHexes[0] === roleHexes[1]
	const accentCollapsed = roleHexes[2] === roleHexes[3]
	if (treatment.collapse.surface !== surfaceCollapsed || treatment.collapse.accent !== accentCollapsed) {
		return "illegal-collapse"
	}
	if (roleHexes[0] === roleHexes[2] || roleHexes[0] === roleHexes[3] ||
		(!surfaceCollapsed && (roleHexes[1] === roleHexes[2] || roleHexes[1] === roleHexes[3])) ||
		(!accentCollapsed && roleHexes[3] === roleHexes[1])) return "illegal-role-collision"
	if (treatment.gradient && (treatment.fieldTreatment !== "gradient-field" ||
		treatment.collapse.surface || treatment.gradientEvidence === null)) return "illegal-gradient"
	return null
}

export function isAlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainDescriptor(
	descriptor: AlbumArtworkPaletteV2Phase3RoleDomainV2LogicalDescriptor,
): boolean {
	return additiveDescriptorRejectionReason(descriptor) === null
}

function descriptorCanonicalKeys(
	descriptors: readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[],
): Set<string> {
	return new Set(descriptors.map(({ treatment }) => completeTreatmentKey(treatment)))
}

function coveredObligationIds(
	descriptors: readonly AlbumArtworkPaletteV2Phase3RoleDomainV2LogicalDescriptor[],
): Set<string> {
	return new Set(descriptors.flatMap(({ roleCoverage }) => roleCoverage.coveredObligationIds))
}

export function constructAlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomain(
	input: AlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainInput,
): AlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainConstruction {
	if (input.baseLogicalDescriptors.length === 0) {
		throw new RangeError("The additive role-domain experiment requires a nonempty common base")
	}
	const baseLogicalDescriptors = [...input.baseLogicalDescriptors].sort(descriptorOrder)
	const roleDomain = constructAlbumArtworkPaletteV2Phase3RoleDomainV2({
		evidence: input.evidence,
		fieldHypotheses: input.fieldHypotheses,
	})
	const rejectionCounts = new Map<AlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainRejectionReason, number>()
	const additiveLogicalDescriptors = roleDomain.logicalDescriptors.filter((descriptor) => {
		const reason = additiveDescriptorRejectionReason(descriptor)
		if (reason === null) return true
		rejectionCounts.set(reason, (rejectionCounts.get(reason) ?? 0) + 1)
		return false
	}).sort(descriptorOrder)
	const logicalDescriptors: readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[] = [
		...baseLogicalDescriptors,
		...additiveLogicalDescriptors,
	]
	const materialize = materializeAlbumArtworkPaletteV2Phase3V2 as unknown as (
		value: Readonly<{
			logicalDescriptors: readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[]
			identityObligations: readonly IdentityObligation[]
		}>,
		capacity?: number,
	) => AlbumArtworkPaletteV2Phase3MaterializationV2
	const materialization = materialize({
		logicalDescriptors,
		identityObligations: input.identityObligations,
	}, input.materializationCapacity)
	const recoveryV2 = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(
		materialization.materialized.map(({ treatment }) => treatment),
		{ obligations: input.identityObligations },
	)
	const recoveryV3RoleEvidence = buildAlbumArtworkPaletteV2Phase3RecoveryV3RoleEvidence(
		input.evidence,
		input.fieldHypotheses.map(({ hypothesis }) => hypothesis),
	)
	const custody = selectAlbumArtworkPaletteV2Phase3RecoveryV3Custody(
		recoveryV2,
		materialization.materialized.map(({ key, treatment, logicalDescriptors: descriptors }) => ({
			key,
			treatment,
			descriptors,
		})),
		recoveryV3RoleEvidence.obligations,
	)
	if (completeTreatmentKey(custody.winner) !== completeTreatmentKey(recoveryV2.winner) ||
		completeTreatmentKey(custody.slate[0]) !== completeTreatmentKey(recoveryV2.winner)) {
		throw new Error("Recovery v3 custody changed the recovery-v2 winner")
	}

	const baseKeys = descriptorCanonicalKeys(baseLogicalDescriptors)
	const additiveKeys = descriptorCanonicalKeys(additiveLogicalDescriptors)
	const canonicalAdditionKeys = new Set([...additiveKeys].filter((key) => !baseKeys.has(key)))
	const allKeys = new Set([...baseKeys, ...additiveKeys])
	const materializedKeys = new Set(materialization.materialized.map(({ key }) => key))
	const selectedKeys = new Set(custody.slate.map(completeTreatmentKey))
	const selectedIndexByKey = new Map(custody.slate.map((treatment, index) =>
		[completeTreatmentKey(treatment), index]))
	const selectedDiagnosticByKey = new Map(custody.diagnostics.selected.map((item) =>
		[item.recoveryV2.key, item]))
	const materializedAdditiveDescriptors = additiveLogicalDescriptors.filter(({ treatment }) =>
		materializedKeys.has(completeTreatmentKey(treatment)))
	const selectedAdditiveDescriptors = additiveLogicalDescriptors.filter(({ treatment }) =>
		selectedKeys.has(completeTreatmentKey(treatment)))
	const coveredByAdditive = coveredObligationIds(additiveLogicalDescriptors)
	const coveredAfterMaterialization = coveredObligationIds(materializedAdditiveDescriptors)
	const coveredBySelected = coveredObligationIds(selectedAdditiveDescriptors)
	const truncatedBaseKeys = [...baseKeys].filter((key) => !materializedKeys.has(key))
	const truncatedAdditionKeys = [...canonicalAdditionKeys].filter((key) => !materializedKeys.has(key))
	const sourceTypes = [...new Set<AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType>([
		"closed-0.7.4-seed",
		"native-field-transition",
		"band-local-endpoint",
		...baseLogicalDescriptors.map(({ sourceType }) => sourceType),
	])].sort(compareAscii)
	const bySource = sourceTypes.map((sourceType):
		AlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainSourceCustody => {
		const descriptors = baseLogicalDescriptors.filter((descriptor) => descriptor.sourceType === sourceType)
		const keys = descriptorCanonicalKeys(descriptors)
		const materializedCount = [...keys].filter((key) => materializedKeys.has(key)).length
		return {
			sourceType,
			descriptorCount: descriptors.length,
			canonicalTreatmentCount: keys.size,
			materializedCanonicalTreatmentCount: materializedCount,
			selectedCanonicalTreatmentCount: [...keys].filter((key) => selectedKeys.has(key)).length,
			truncatedCanonicalTreatmentCount: keys.size - materializedCount,
		}
	})
	const additions = [...canonicalAdditionKeys].sort(compareAscii).map((key):
		AlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainCanonicalAdditionCustody => {
		const descriptors = additiveLogicalDescriptors.filter(({ treatment }) =>
			completeTreatmentKey(treatment) === key)
		const selectedDiagnostic = selectedDiagnosticByKey.get(key)
		return {
			key,
			descriptorCount: descriptors.length,
			sourceTypes: [...new Set(descriptors.map(({ sourceType }) => sourceType))].sort(compareAscii),
			coveredRoleObligationIds: [...coveredObligationIds(descriptors)].sort(compareAscii),
			materialized: materializedKeys.has(key),
			selected: selectedKeys.has(key),
			selectedIndex: selectedIndexByKey.get(key) ?? null,
			selectionKind: selectedDiagnostic?.selectionKind ?? null,
		}
	})
	const additiveMaterializedKeys = [...additiveKeys].filter((key) => materializedKeys.has(key))
	const additiveSelectedKeys = [...additiveKeys].filter((key) => selectedKeys.has(key))
	const baseMaterializedDescriptorCount = baseLogicalDescriptors.filter(({ treatment }) =>
		materializedKeys.has(completeTreatmentKey(treatment))).length
	const rejectedAdditiveDescriptorCount = roleDomain.logicalDescriptors.length - additiveLogicalDescriptors.length
	const canonicalOverlapWithBaseCount = [...additiveKeys].filter((key) => baseKeys.has(key)).length
	const capacityTradeoff = materialization.diagnostics.truncatedCanonicalTreatmentCount > 0
	const diagnostics: AlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainDiagnostics = {
		version: "album-artwork-palette-v2-phase-3-arm-additive-role-domain-diagnostics-v1",
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_ADDITIVE_ROLE_DOMAIN_CONFIGURATION_ID,
		modules: {
			roleDomain: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_VERSION,
			materialization: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_VERSION,
			selection: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID,
			custody: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_ID,
		},
		domain: {
			baseDescriptorCount: baseLogicalDescriptors.length,
			baseCanonicalTreatmentCount: baseKeys.size,
			constructedAdditiveDescriptorCount: roleDomain.logicalDescriptors.length,
			additiveDescriptorCount: additiveLogicalDescriptors.length,
			rejectedAdditiveDescriptorCount,
			additiveCanonicalTreatmentCount: additiveKeys.size,
			canonicalOverlapWithBaseCount,
			canonicalAdditionCount: canonicalAdditionKeys.size,
			logicalDescriptorCount: logicalDescriptors.length,
			canonicalTreatmentCount: allKeys.size,
		},
		baseCustody: {
			preservedBeforeMaterialization: true,
			preservedAfterMaterialization: truncatedBaseKeys.length === 0,
			preservationStatus: truncatedBaseKeys.length === 0 ? "complete" : "capacity-tradeoff",
			materializedDescriptorCount: baseMaterializedDescriptorCount,
			materializedCanonicalTreatmentCount: baseKeys.size - truncatedBaseKeys.length,
			truncatedDescriptorCount: baseLogicalDescriptors.length - baseMaterializedDescriptorCount,
			truncatedCanonicalTreatmentCount: truncatedBaseKeys.length,
			bySource,
		},
		additiveCustody: {
			materializedDescriptorCount: materializedAdditiveDescriptors.length,
			materializedCanonicalTreatmentCount: additiveMaterializedKeys.length,
			selectedDescriptorCount: selectedAdditiveDescriptors.length,
			selectedCanonicalTreatmentCount: additiveSelectedKeys.length,
			rejections: [...rejectionCounts].sort(([first], [second]) => compareAscii(first, second))
				.map(([reason, count]) => ({ reason, count })),
		},
		obligationCustody: {
			candidateCount: roleDomain.diagnostics.candidateRoleObligationCount,
			feasibleCount: roleDomain.roleObligations.length,
			foregroundCount: roleDomain.roleObligations
				.filter(({ requiredRole }) => requiredRole === "foreground").length,
			accentCount: roleDomain.roleObligations
				.filter(({ requiredRole }) => requiredRole === "accent").length,
			ambiguousDirectionCount: roleDomain.roleObligations
				.filter(({ ambiguousDirection }) => ambiguousDirection).length,
			coveredByAdditiveDescriptorsCount: coveredByAdditive.size,
			coveredAfterMaterializationCount: coveredAfterMaterialization.size,
			coveredBySelectedTreatmentsCount: coveredBySelected.size,
			recoveryV3CustodyObligationCount: recoveryV3RoleEvidence.obligations.length,
		},
		canonicalAdditionCustody: {
			availableCount: canonicalAdditionKeys.size,
			materializedCount: additions.filter(({ materialized }) => materialized).length,
			truncatedCount: truncatedAdditionKeys.length,
			selectedCount: additions.filter(({ selected }) => selected).length,
			additions,
		},
		truncation: {
			capacity: materialization.diagnostics.capacity,
			capacityReached: materialization.diagnostics.capacityReached,
			capacityTradeoff,
			totalCanonicalTreatmentCount: allKeys.size,
			materializedCanonicalTreatmentCount: materializedKeys.size,
			truncatedCanonicalTreatmentCount: materialization.diagnostics.truncatedCanonicalTreatmentCount,
			truncatedBaseCanonicalTreatmentCount: truncatedBaseKeys.length,
			truncatedCanonicalAdditionCount: truncatedAdditionKeys.length,
		},
	}
	if (diagnostics.truncation.truncatedCanonicalTreatmentCount !==
		diagnostics.truncation.truncatedBaseCanonicalTreatmentCount +
		diagnostics.truncation.truncatedCanonicalAdditionCount) {
		throw new Error("Materialization truncation was not attributable to base or additive custody")
	}
	return {
		baseLogicalDescriptors,
		additiveLogicalDescriptors,
		logicalDescriptors,
		roleDomain,
		materialization,
		recoveryV2,
		custody,
		diagnostics,
	}
}

export function extractAlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomain(
	image: RawImage,
): AlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomainResult {
	const closedDetails = extractAlbumArtworkPaletteV2074Details(image)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(image, { closed074Details: closedDetails })
	const construction = constructAlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomain({
		evidence: common.evidence.augmentedNative,
		fieldHypotheses: common.fieldHypotheses,
		baseLogicalDescriptors: common.logicalDescriptors,
		identityObligations: common.seedAvailability.identityObligations,
	})
	const selected = construction.custody.slate
	const baseDiagnostics = closedDetails.result.diagnostics
	const slateForegroundFamilyIds = sortedUnique(selected.map(({ familyRoles }) => familyRoles.foreground)
		.filter((familyId): familyId is string => familyId !== "generated"))
	const slateAccentFamilyIds = sortedUnique(selected.filter(({ collapse }) => !collapse.accent)
		.map(({ familyRoles }) => familyRoles.accent)
		.filter((familyId): familyId is string => familyId !== "generated"))
	return {
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_ADDITIVE_ROLE_DOMAIN_ATTEMPT_ID,
		protocol: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_ADDITIVE_ROLE_DOMAIN_CONFIGURATION_ID,
		width: image.width,
		height: image.height,
		winner: construction.recoveryV2.winner,
		alternatives: selected,
		diagnostics: {
			...baseDiagnostics,
			fieldHypotheses: common.fieldHypotheses.map(({ hypothesis }) => hypothesis),
			gradientFits: common.evidence.gradientFits,
			completeCandidateCount: construction.materialization.materialized.length,
			candidateAvailability: {
				...baseDiagnostics.candidateAvailability,
				slateForegroundFamilyIds,
				slateAccentFamilyIds,
			},
			phase3ArmAdditiveRoleDomain: {
				commonBase: common.diagnostics,
				roleDomain: construction.roleDomain.diagnostics,
				construction: construction.diagnostics,
				materialization: construction.materialization.diagnostics,
				selector: construction.recoveryV2.explanation,
				custody: construction.custody.diagnostics,
			},
		},
	}
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_ADDITIVE_ROLE_DOMAIN_ATTEMPT = Object.freeze({
	identity: Object.freeze({
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_ADDITIVE_ROLE_DOMAIN_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_ADDITIVE_ROLE_DOMAIN_CONFIGURATION_ID,
	}),
	extract: extractAlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomain,
}) satisfies AlbumArtworkPaletteV2Phase3AttemptAdapter
