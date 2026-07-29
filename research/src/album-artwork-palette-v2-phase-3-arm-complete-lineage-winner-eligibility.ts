import {
	completeTreatmentKey,
	fieldDirectionKey,
	roleDirectionKeys,
} from "./album-artwork-palette-v2.ts"
import type {
	CompletePaletteTreatment,
	EmergencyEligibility,
	FieldHypothesis,
	RecallAuditTreatmentLineage,
	Role,
} from "./album-artwork-palette-v2.ts"
import { ALBUM_ARTWORK_PALETTE_V2_POLICY } from "./album-artwork-palette-v2-protocol.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPLETE_LINEAGE_WINNER_ELIGIBILITY_ID =
	"album-artwork-palette-v2-phase-3-complete-lineage-winner-eligibility-v1" as const

export type AlbumArtworkPaletteV2Phase3CompleteLineageDescriptor = Readonly<{
	treatment: CompletePaletteTreatment
	fieldHypothesis: FieldHypothesis
	lineage: RecallAuditTreatmentLineage
}>

export type AlbumArtworkPaletteV2Phase3CompleteLineageMaterializedCandidate<
	TDescriptor extends AlbumArtworkPaletteV2Phase3CompleteLineageDescriptor =
		AlbumArtworkPaletteV2Phase3CompleteLineageDescriptor,
> = Readonly<{
	key: string
	treatment: CompletePaletteTreatment
	descriptors: readonly TDescriptor[]
}>

export type AlbumArtworkPaletteV2Phase3CompleteLineageDescriptorEligibility = Readonly<{
	identity: string
	canonicalTreatmentMatches: boolean
	fieldConnectionComplete: boolean
	roleConnectionsComplete: boolean
	lineageBindingsComplete: boolean
	lineageSourceConnected: boolean
	ordinaryEligible: boolean
	normativeEmergencyEligible: boolean
}>

export type AlbumArtworkPaletteV2Phase3CompleteLineageCandidateEligibility = Readonly<{
	key: string
	descriptorCount: number
	ordinaryEligibleDescriptorCount: number
	normativeEmergencyEligibleDescriptorCount: number
	eligible: boolean
	basis: "ordinary-complete-source-lineage" | "normative-one-color-emergency" | "ineligible"
	descriptors: readonly AlbumArtworkPaletteV2Phase3CompleteLineageDescriptorEligibility[]
}>

export type AlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain<
	TCandidate extends AlbumArtworkPaletteV2Phase3CompleteLineageMaterializedCandidate =
		AlbumArtworkPaletteV2Phase3CompleteLineageMaterializedCandidate,
> = Readonly<{
	allCandidates: readonly TCandidate[]
	eligibleCandidates: readonly TCandidate[]
	diagnostics: Readonly<{
		version: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPLETE_LINEAGE_WINNER_ELIGIBILITY_ID
		materializedCandidateCount: number
		descriptorCount: number
		eligibleCandidateCount: number
		ineligibleCandidateCount: number
		ordinaryEligibleCandidateCount: number
		normativeEmergencyEligibleCandidateCount: number
		candidates: readonly AlbumArtworkPaletteV2Phase3CompleteLineageCandidateEligibility[]
	}>
}>

const ROLES = ["background", "surface", "foreground", "accent"] as const

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function sameStrings(first: readonly string[], second: readonly string[]): boolean {
	const left = [...first].sort(compareAscii)
	const right = [...second].sort(compareAscii)
	return left.length === right.length && left.every((value, index) => value === right[index])
}

function sourceRoleConnected(treatment: CompletePaletteTreatment, role: Role): boolean {
	const color = treatment[role]
	const familyId = treatment.familyRoles[role]
	return familyId !== "generated" && !color.generated && !("generated" in color.support) &&
		color.support.anchorFamilyId === familyId && color.support.regionIds.length > 0
}

function sourceRepresentativeConnected(
	representative: FieldHypothesis["backgroundRepresentatives"][number],
	familyId: string,
): boolean {
	return !("generated" in representative.support) &&
		representative.support.anchorFamilyId === familyId &&
		representative.support.regionIds.length > 0
}

function fieldHasSourceConnection(field: FieldHypothesis): boolean {
	if (!field.backgroundRepresentatives.some((representative) =>
		sourceRepresentativeConnected(representative, field.backgroundFamilyId))) return false
	const surfaceFamilyId = field.surfaceFamilyId ?? field.backgroundFamilyId
	return field.surfaceRepresentatives.some((representative) =>
		sourceRepresentativeConnected(representative, surfaceFamilyId))
}

function ordinaryFieldConnectionComplete(descriptor: AlbumArtworkPaletteV2Phase3CompleteLineageDescriptor): boolean {
	const { treatment, fieldHypothesis } = descriptor
	return treatment.sourceFieldHypothesisId === fieldHypothesis.id &&
		treatment.fieldTreatment === fieldHypothesis.kind &&
		treatment.familyRoles.background === fieldHypothesis.backgroundFamilyId &&
		treatment.familyRoles.surface === (fieldHypothesis.surfaceFamilyId ?? fieldHypothesis.backgroundFamilyId) &&
		fieldHasSourceConnection(fieldHypothesis)
}

function lineageBindingsComplete(descriptor: AlbumArtworkPaletteV2Phase3CompleteLineageDescriptor): boolean {
	const { treatment, fieldHypothesis, lineage } = descriptor
	if (treatment.sourceFieldHypothesisId !== fieldHypothesis.id ||
		lineage.fieldHypothesisId !== fieldHypothesis.id ||
		lineage.fieldDirectionKey !== fieldDirectionKey(treatment) ||
		!sameStrings(lineage.roleDirectionKeys, roleDirectionKeys(treatment))) return false
	const familyIds = [...new Set(Object.values(treatment.familyRoles)
		.filter((familyId): familyId is string => familyId !== "generated"))]
	if (!sameStrings(lineage.familyIds, familyIds) || lineage.representatives.length !== ROLES.length) return false
	const representatives = new Map(lineage.representatives.map((representative) =>
		[representative.role, representative]))
	if (representatives.size !== ROLES.length) return false
	return ROLES.every((role) => {
		const representative = representatives.get(role)
		return representative !== undefined &&
			representative.familyId === treatment.familyRoles[role] &&
			representative.hex.toLowerCase() === treatment[role].hex.toLowerCase() &&
			representative.strategy === treatment[role].strategy &&
			representative.sourceConnected === sourceRoleConnected(treatment, role)
	})
}

function exactEmergencyDiagnosis(emergency: EmergencyEligibility | null | undefined): emergency is EmergencyEligibility {
	if (!emergency?.eligible || emergency.reason === "not-eligible" ||
		emergency.thresholdExclusive !== ALBUM_ARTWORK_PALETTE_V2_POLICY.contrast.emergencyMaximumAbsoluteLc ||
		!Number.isSafeInteger(emergency.supportedPairCount) || emergency.supportedPairCount < 0 ||
		!Number.isFinite(emergency.maximumSupportedAbsoluteLc) || emergency.maximumSupportedAbsoluteLc < 0) return false
	if (emergency.reason === "degenerate-supported-domain") {
		return emergency.supportedPairCount === 0 && emergency.maximumSupportedAbsoluteLc === 0
	}
	return emergency.supportedPairCount > 0 &&
		emergency.maximumSupportedAbsoluteLc < emergency.thresholdExclusive
}

function generatedSupportMatches(
	treatment: CompletePaletteTreatment,
	role: Role,
	emergency: EmergencyEligibility,
): boolean {
	const color = treatment[role]
	if (!color.generated || color.strategy !== "generated-emergency" || !("generated" in color.support) ||
		treatment.familyRoles[role] !== "generated") return false
	const expectedRole = role === "background" || role === "surface" ? "background" : "foreground"
	return color.support.generated === true && color.support.role === expectedRole &&
		color.support.reason === emergency.reason &&
		color.support.supportedPairCount === emergency.supportedPairCount &&
		color.support.maximumSupportedAbsoluteLc === emergency.maximumSupportedAbsoluteLc &&
		color.support.thresholdExclusive === emergency.thresholdExclusive &&
		color.support.preferencePenalty === ALBUM_ARTWORK_PALETTE_V2_POLICY.contrast.emergencyGeneratedPenalty
}

function normativeEmergencyEligible(
	descriptor: AlbumArtworkPaletteV2Phase3CompleteLineageDescriptor,
	emergency: EmergencyEligibility | null | undefined,
	canonicalTreatmentMatches: boolean,
	bindingsComplete: boolean,
): boolean {
	if (!canonicalTreatmentMatches || !bindingsComplete || !exactEmergencyDiagnosis(emergency) ||
		descriptor.lineage.sourceConnected || !fieldHasSourceConnection(descriptor.fieldHypothesis) ||
		descriptor.treatment.sourceFieldHypothesisId !== descriptor.fieldHypothesis.id) return false
	const treatment = descriptor.treatment
	const generatedRoles = ROLES.filter((role) => treatment[role].generated ||
		treatment.familyRoles[role] === "generated" || "generated" in treatment[role].support)
	const generatedField = generatedRoles.length === 2 && generatedRoles.includes("background") &&
		generatedRoles.includes("surface") && treatment.collapse.surface && !treatment.gradient
	const generatedForeground = generatedRoles.length === 2 && generatedRoles.includes("foreground") &&
		generatedRoles.includes("accent") && treatment.collapse.accent
	if (!generatedField && !generatedForeground) return false
	const generatedHexes = new Set(generatedRoles.map((role) => treatment[role].hex.toLowerCase()))
	if (generatedHexes.size !== 1 ||
		!["#000000", "#ffffff"].includes([...generatedHexes][0]) ||
		treatment.scores.generatedPenalty !== ALBUM_ARTWORK_PALETTE_V2_POLICY.contrast.emergencyGeneratedPenalty) return false
	return ROLES.every((role) => generatedRoles.includes(role)
		? generatedSupportMatches(treatment, role, emergency)
		: sourceRoleConnected(treatment, role))
}

function descriptorIdentity(descriptor: AlbumArtworkPaletteV2Phase3CompleteLineageDescriptor): string {
	return [
		completeTreatmentKey(descriptor.treatment),
		descriptor.treatment.id,
		descriptor.fieldHypothesis.id,
		descriptor.lineage.fieldDirectionKey,
		[...descriptor.lineage.roleDirectionKeys].sort(compareAscii).join(","),
		[...descriptor.lineage.familyIds].sort(compareAscii).join(","),
		[...descriptor.lineage.representatives]
			.map(({ role, familyId, hex, strategy, sourceConnected }) =>
				`${role}:${familyId}:${hex.toLowerCase()}:${strategy}:${sourceConnected ? "source" : "disconnected"}`)
			.sort(compareAscii).join(","),
		descriptor.lineage.sourceConnected ? "source" : "disconnected",
	].join("\0")
}

export function evaluateAlbumArtworkPaletteV2Phase3CompleteLineageDescriptor(
	candidateKey: string,
	descriptor: AlbumArtworkPaletteV2Phase3CompleteLineageDescriptor,
	options: Readonly<{ emergency?: EmergencyEligibility | null }> = {},
): AlbumArtworkPaletteV2Phase3CompleteLineageDescriptorEligibility {
	const canonicalTreatmentMatches = completeTreatmentKey(descriptor.treatment) === candidateKey
	const fieldConnectionComplete = ordinaryFieldConnectionComplete(descriptor)
	const roleConnectionsComplete = ROLES.every((role) => sourceRoleConnected(descriptor.treatment, role))
	const bindingsComplete = lineageBindingsComplete(descriptor)
	const ordinaryEligible = canonicalTreatmentMatches && fieldConnectionComplete &&
		roleConnectionsComplete && bindingsComplete && descriptor.lineage.sourceConnected
	return {
		identity: descriptorIdentity(descriptor),
		canonicalTreatmentMatches,
		fieldConnectionComplete,
		roleConnectionsComplete,
		lineageBindingsComplete: bindingsComplete,
		lineageSourceConnected: descriptor.lineage.sourceConnected,
		ordinaryEligible,
		normativeEmergencyEligible: normativeEmergencyEligible(
			descriptor,
			options.emergency,
			canonicalTreatmentMatches,
			bindingsComplete,
		),
	}
}

export function filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain<
	TDescriptor extends AlbumArtworkPaletteV2Phase3CompleteLineageDescriptor,
	TCandidate extends AlbumArtworkPaletteV2Phase3CompleteLineageMaterializedCandidate<TDescriptor>,
>(
	candidates: readonly TCandidate[],
	options: Readonly<{ emergency?: EmergencyEligibility | null }> = {},
): AlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain<TCandidate> {
	const ordered = [...candidates].sort((first, second) => compareAscii(first.key, second.key))
	const duplicateKey = ordered.find((candidate, index) => index > 0 && candidate.key === ordered[index - 1].key)?.key
	if (duplicateKey !== undefined) {
		throw new Error(`Complete-lineage winner domain contains duplicate canonical key ${duplicateKey}`)
	}
	const eligibilityByKey = new Map<string, AlbumArtworkPaletteV2Phase3CompleteLineageCandidateEligibility>()
	for (const candidate of ordered) {
		const descriptors = candidate.descriptors
			.map((descriptor) =>
				evaluateAlbumArtworkPaletteV2Phase3CompleteLineageDescriptor(candidate.key, descriptor, options))
			.sort((first, second) => compareAscii(first.identity, second.identity))
		const ordinaryEligibleDescriptorCount = descriptors.filter(({ ordinaryEligible }) => ordinaryEligible).length
		const normativeEmergencyEligibleDescriptorCount = descriptors
			.filter(({ normativeEmergencyEligible: eligible }) => eligible).length
		const eligible = completeTreatmentKey(candidate.treatment) === candidate.key &&
			ordinaryEligibleDescriptorCount + normativeEmergencyEligibleDescriptorCount > 0
		eligibilityByKey.set(candidate.key, {
			key: candidate.key,
			descriptorCount: descriptors.length,
			ordinaryEligibleDescriptorCount,
			normativeEmergencyEligibleDescriptorCount,
			eligible,
			basis: ordinaryEligibleDescriptorCount > 0
				? "ordinary-complete-source-lineage"
				: normativeEmergencyEligibleDescriptorCount > 0
					? "normative-one-color-emergency"
					: "ineligible",
			descriptors,
		})
	}
	const candidateDiagnostics = ordered.map(({ key }) => eligibilityByKey.get(key)!)
	const eligibleCandidates = ordered.filter(({ key }) => eligibilityByKey.get(key)!.eligible)
	return {
		allCandidates: ordered,
		eligibleCandidates,
		diagnostics: {
			version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPLETE_LINEAGE_WINNER_ELIGIBILITY_ID,
			materializedCandidateCount: ordered.length,
			descriptorCount: candidateDiagnostics.reduce((sum, candidate) => sum + candidate.descriptorCount, 0),
			eligibleCandidateCount: eligibleCandidates.length,
			ineligibleCandidateCount: ordered.length - eligibleCandidates.length,
			ordinaryEligibleCandidateCount: candidateDiagnostics
				.filter(({ ordinaryEligibleDescriptorCount }) => ordinaryEligibleDescriptorCount > 0).length,
			normativeEmergencyEligibleCandidateCount: candidateDiagnostics
				.filter(({ ordinaryEligibleDescriptorCount, normativeEmergencyEligibleDescriptorCount }) =>
					ordinaryEligibleDescriptorCount === 0 && normativeEmergencyEligibleDescriptorCount > 0).length,
			candidates: candidateDiagnostics,
		},
	}
}
