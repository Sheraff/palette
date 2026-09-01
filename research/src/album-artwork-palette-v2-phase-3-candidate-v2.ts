import {
	extractAlbumArtworkPaletteV2074Details,
} from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Result,
	ColorFamilyEvidence,
	ColorRepresentative,
	FieldHypothesis,
	NativePaletteEvidence,
} from "./album-artwork-palette-v2.ts"
import {
	buildAlbumArtworkPaletteV2Phase3CommonBase,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"
import type {
	AlbumArtworkPaletteV2Phase3CommonBaseDiagnostics,
	AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_ID,
	proposeAlbumArtworkPaletteV2Phase3Fields,
} from "./album-artwork-palette-v2-phase-3-field-proposal-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3FieldProposalV2Diagnostics,
} from "./album-artwork-palette-v2-phase-3-field-proposal-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_VERSION,
	materializeAlbumArtworkPaletteV2Phase3V2,
} from "./album-artwork-palette-v2-phase-3-materialization-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3MaterializationV2Diagnostics,
} from "./album-artwork-palette-v2-phase-3-materialization-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_VERSION,
	constructAlbumArtworkPaletteV2Phase3RoleDomainV2,
} from "./album-artwork-palette-v2-phase-3-role-domain-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3RoleDomainV2Diagnostics,
} from "./album-artwork-palette-v2-phase-3-role-domain-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_ID,
	selectAlbumArtworkPaletteV2Phase3SelectorV2,
} from "./album-artwork-palette-v2-phase-3-selector-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3SelectorV2Explanation,
} from "./album-artwork-palette-v2-phase-3-selector-v2.ts"
import type { RawImage } from "./types.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CANDIDATE_V2_ATTEMPT_ID =
	"phase-3-candidate-v2" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CANDIDATE_V2_CONFIGURATION_ID =
	"neutral-common-seed-wave-3-v2-unpinned" as const

type FieldCustody = Readonly<{
	fieldHypothesisId: string
	sourceType: AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis["sourceType"]
	kind: FieldHypothesis["kind"]
	roleDescriptorCount: number
	materializedTreatmentCount: number
	selectedTreatmentCount: number
	selectedTopTreatment: boolean
}>

export type AlbumArtworkPaletteV2Phase3CandidateV2Diagnostics = Readonly<{
	version: "album-artwork-palette-v2-phase-3-candidate-v2-diagnostics-v1"
	configurationId: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CANDIDATE_V2_CONFIGURATION_ID
	modules: Readonly<{
		fieldProposal: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_ID
		roleDomain: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_VERSION
		materialization: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_VERSION
		selector: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_ID
	}>
	commonBase: AlbumArtworkPaletteV2Phase3CommonBaseDiagnostics
	seedAvailability: Readonly<{
		completeDescriptorCount: number
		fieldHypothesisCount: number
		sourceSupportedFieldHypothesisCount: number
		strongSourceGradientHypothesisCount: number
		strongSourceGradientRoleDescriptorCount: number
		strongSourceGradientMaterializedCount: number
	}>
	fieldProposal: AlbumArtworkPaletteV2Phase3FieldProposalV2Diagnostics
	fieldCombination: Readonly<{
		seedInputCount: number
		proposalInputCount: number
		combinedFieldHypothesisCount: number
		genericDuplicateCount: number
	}>
	evidenceAugmentation: Readonly<{
		nativeFamilyCount: number
		fieldProposalSupplementalFamilyCount: number
		addedSupplementalFamilyCount: number
		augmentedFamilyCount: number
	}>
	roleDomain: AlbumArtworkPaletteV2Phase3RoleDomainV2Diagnostics
	materialization: AlbumArtworkPaletteV2Phase3MaterializationV2Diagnostics
	selector: AlbumArtworkPaletteV2Phase3SelectorV2Explanation
	custody: readonly FieldCustody[]
}>

export type AlbumArtworkPaletteV2Phase3CandidateV2Result =
	Omit<AlbumArtworkPaletteV2Result, "diagnostics"> & Readonly<{
		diagnostics: AlbumArtworkPaletteV2Result["diagnostics"] & Readonly<{
			phase3CandidateV2: AlbumArtworkPaletteV2Phase3CandidateV2Diagnostics
		}>
	}>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function representativeSupported(
	representative: ColorRepresentative,
	familyId: string,
): boolean {
	return !("generated" in representative.support) &&
		representative.support.anchorFamilyId === familyId &&
		representative.support.regionIds.length > 0
}

function sourceSupportedField(field: FieldHypothesis): boolean {
	const backgroundSupported = field.backgroundRepresentatives.some((representative) =>
		representativeSupported(representative, field.backgroundFamilyId))
	if (!backgroundSupported) return false
	if (field.surfaceFamilyId === null) return true
	return field.surfaceRepresentatives.some((representative) =>
		representativeSupported(representative, field.surfaceFamilyId!))
}

function representativeIdentity(representatives: readonly ColorRepresentative[]): string {
	return [...new Set(representatives.map(({ hex }) => hex.toLowerCase()))].sort(compareAscii).join(",")
}

function fieldIdentity(field: FieldHypothesis): string {
	const gradient = field.gradientEvidence
	return [
		field.kind,
		field.backgroundFamilyId,
		field.surfaceFamilyId ?? "=",
		representativeIdentity(field.backgroundRepresentatives),
		representativeIdentity(field.surfaceRepresentatives),
		gradient?.topology ?? "none",
		gradient?.direction ?? "none",
		[...(gradient?.supportingFamilyIds ?? [])].sort(compareAscii).join(","),
		[...(gradient?.supportingEndpointHexes ?? [])].map((hex) => hex.toLowerCase())
			.sort(compareAscii).join(","),
	].join("\0")
}

function compareFields(
	first: AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis,
	second: AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis,
): number {
	return compareAscii(fieldIdentity(first.hypothesis), fieldIdentity(second.hypothesis)) ||
		second.hypothesis.fieldFidelity - first.hypothesis.fieldFidelity ||
		second.hypothesis.surfaceContribution - first.hypothesis.surfaceContribution ||
		compareAscii(first.sourceType, second.sourceType) ||
		compareAscii(first.hypothesis.id, second.hypothesis.id)
}

function combineFields(
	seedFields: readonly AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[],
	proposalFields: readonly AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[],
): AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[] {
	const unique = new Map<string, AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis>()
	for (const field of [...seedFields, ...proposalFields].sort(compareFields)) {
		const identity = fieldIdentity(field.hypothesis)
		if (!unique.has(identity)) unique.set(identity, field)
	}
	return [...unique.values()].sort(compareFields)
}

function augmentEvidence(
	native: NativePaletteEvidence,
	supplementalFamilies: readonly ColorFamilyEvidence[],
): Readonly<{
	evidence: NativePaletteEvidence
	addedSupplementalFamilyCount: number
}> {
	const familyIds = new Set(native.families.map(({ id }) => id))
	const added = [...supplementalFamilies]
		.sort((first, second) => compareAscii(first.id, second.id))
		.filter(({ id }, index, values) => !familyIds.has(id) &&
			values.findIndex((family) => family.id === id) === index)
	const retainedFamilyIds = [...new Set([
		...native.retainedFamilyIds,
		...added.map(({ id }) => id),
	])]
	return {
		evidence: {
			...native,
			families: [...native.families, ...added],
			retainedFamilyIds,
		},
		addedSupplementalFamilyCount: added.length,
	}
}

export function extractAlbumArtworkPaletteV2Phase3CandidateV2(
	image: RawImage,
): AlbumArtworkPaletteV2Phase3CandidateV2Result {
	const closedDetails = extractAlbumArtworkPaletteV2074Details(image)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(image, {
		closed074Details: closedDetails,
	})
	const proposal = proposeAlbumArtworkPaletteV2Phase3Fields({
		evidence: common.evidence.native,
		gradientFits: common.evidence.gradientFits,
	})
	const seedFields = common.seedAvailability.fieldHypotheses.filter(({ hypothesis }) =>
		sourceSupportedField(hypothesis))
	const combinedFields = combineFields(seedFields, proposal.fieldHypotheses)
	const augmented = augmentEvidence(common.evidence.native, proposal.supplementalFamilies)
	const roleDomain = constructAlbumArtworkPaletteV2Phase3RoleDomainV2({
		evidence: augmented.evidence,
		fieldHypotheses: combinedFields,
	})
	const materialization = materializeAlbumArtworkPaletteV2Phase3V2({
		logicalDescriptors: roleDomain.logicalDescriptors,
		identityObligations: common.seedAvailability.identityObligations,
	})
	const selection = selectAlbumArtworkPaletteV2Phase3SelectorV2({
		evidence: augmented.evidence,
		identityObligations: common.seedAvailability.identityObligations,
		roleSpecificObligations: roleDomain.roleObligations,
		materializedDomain: materialization,
	})
	const selected = selection.slate.map(({ treatment }) => treatment)
	const selectedKeys = new Set(selection.slate.map(({ key }) => key))
	const topKey = selection.winner.key
	const strongGradientIds = new Set(common.seedAvailability.logicalDescriptors
		.filter(({ fieldHypothesis, lineage }) => fieldHypothesis.kind === "gradient-field" && lineage.sourceConnected)
		.map(({ fieldHypothesis }) => fieldHypothesis.id))
	const strongGradientRoleDescriptorCount = roleDomain.logicalDescriptors.filter(({ fieldHypothesis }) =>
		strongGradientIds.has(fieldHypothesis.id)).length
	const strongGradientMaterializedCount = materialization.materialized.filter(({ logicalDescriptors }) =>
		logicalDescriptors.some(({ fieldHypothesis }) => strongGradientIds.has(fieldHypothesis.id))).length
	const custody = combinedFields.map(({ sourceType, hypothesis }): FieldCustody => {
		const matches = (descriptor: typeof roleDomain.logicalDescriptors[number]): boolean =>
			descriptor.sourceType === sourceType && descriptor.fieldHypothesis.id === hypothesis.id
		const descriptors = roleDomain.logicalDescriptors.filter(matches)
		const materialized = materialization.materialized.filter(({ logicalDescriptors }) =>
			logicalDescriptors.some(matches))
		return {
			fieldHypothesisId: hypothesis.id,
			sourceType,
			kind: hypothesis.kind,
			roleDescriptorCount: descriptors.length,
			materializedTreatmentCount: materialized.length,
			selectedTreatmentCount: materialized.filter(({ key }) => selectedKeys.has(key)).length,
			selectedTopTreatment: materialized.some(({ key }) => key === topKey),
		}
	})
	const slateForegroundFamilyIds = [...new Set(selected.map(({ familyRoles }) => familyRoles.foreground)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii)
	const slateAccentFamilyIds = [...new Set(selected.filter(({ collapse }) => !collapse.accent)
		.map(({ familyRoles }) => familyRoles.accent)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii)
	const completeTreatments = materialization.materialized.map(({ treatment }) => treatment)
	const phase3CandidateV2: AlbumArtworkPaletteV2Phase3CandidateV2Diagnostics = {
		version: "album-artwork-palette-v2-phase-3-candidate-v2-diagnostics-v1",
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CANDIDATE_V2_CONFIGURATION_ID,
		modules: {
			fieldProposal: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_PROPOSAL_V2_ID,
			roleDomain: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_DOMAIN_V2_VERSION,
			materialization: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_V2_VERSION,
			selector: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_ID,
		},
		commonBase: common.diagnostics,
		seedAvailability: {
			completeDescriptorCount: common.seedAvailability.logicalDescriptors.length,
			fieldHypothesisCount: common.seedAvailability.fieldHypotheses.length,
			sourceSupportedFieldHypothesisCount: seedFields.length,
			strongSourceGradientHypothesisCount: strongGradientIds.size,
			strongSourceGradientRoleDescriptorCount: strongGradientRoleDescriptorCount,
			strongSourceGradientMaterializedCount: strongGradientMaterializedCount,
		},
		fieldProposal: proposal.diagnostics,
		fieldCombination: {
			seedInputCount: seedFields.length,
			proposalInputCount: proposal.fieldHypotheses.length,
			combinedFieldHypothesisCount: combinedFields.length,
			genericDuplicateCount: seedFields.length + proposal.fieldHypotheses.length - combinedFields.length,
		},
		evidenceAugmentation: {
			nativeFamilyCount: common.evidence.native.families.length,
			fieldProposalSupplementalFamilyCount: proposal.supplementalFamilies.length,
			addedSupplementalFamilyCount: augmented.addedSupplementalFamilyCount,
			augmentedFamilyCount: augmented.evidence.families.length,
		},
		roleDomain: roleDomain.diagnostics,
		materialization: materialization.diagnostics,
		selector: selection.explanation,
		custody,
	}
	const baseDiagnostics = closedDetails.result.diagnostics
	return {
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CANDIDATE_V2_ATTEMPT_ID,
		protocol: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CANDIDATE_V2_CONFIGURATION_ID,
		width: image.width,
		height: image.height,
		winner: selection.winner.treatment,
		alternatives: selected,
		diagnostics: {
			...baseDiagnostics,
			familyCount: augmented.evidence.families.length,
			retainedFamilyCount: augmented.evidence.retainedFamilyIds.length,
			lanes: augmented.evidence.lanes,
			laneRetention: augmented.evidence.laneRetention,
			families: augmented.evidence.families.filter(({ id }) =>
				augmented.evidence.retainedFamilyIds.includes(id)),
			fieldHypotheses: combinedFields.map(({ hypothesis }) => hypothesis),
			gradientFits: common.evidence.gradientFits,
			completeCandidateCount: materialization.materialized.length,
			candidateAvailability: {
				...baseDiagnostics.candidateAvailability,
				foregroundLaneFamilyIds: augmented.evidence.lanes.find(({ name }) => name === "foreground")?.familyIds ?? [],
				signatureLaneFamilyIds: augmented.evidence.lanes.find(({ name }) => name === "signature")?.familyIds ?? [],
				fieldHypothesisFamilyIds: [...new Set(combinedFields.flatMap(({ hypothesis }) => [
					hypothesis.backgroundFamilyId,
					...hypothesis.surfaceFamilyId === null ? [] : [hypothesis.surfaceFamilyId],
				]))].sort(compareAscii),
				completeCandidateForegroundFamilyIds: [...new Set(completeTreatments
					.map(({ familyRoles }) => familyRoles.foreground)
					.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii),
				completeCandidateAccentFamilyIds: [...new Set(completeTreatments
					.filter(({ collapse }) => !collapse.accent)
					.map(({ familyRoles }) => familyRoles.accent)
					.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii),
				slateForegroundFamilyIds,
				slateAccentFamilyIds,
			},
			phase3CandidateV2,
		},
	}
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CANDIDATE_V2_ATTEMPT = Object.freeze({
	identity: Object.freeze({
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CANDIDATE_V2_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CANDIDATE_V2_CONFIGURATION_ID,
	}),
	extract: extractAlbumArtworkPaletteV2Phase3CandidateV2,
})
