import {
	completeTreatmentKey,
	extractAlbumArtworkPaletteV2074Details,
	extractAlbumArtworkPaletteV2Phase3Closed074,
	extractAlbumArtworkPaletteV2Phase3Live072,
	fieldDirectionKey,
	roleDirectionKeys,
	visuallyNear,
} from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Result,
	CompletePaletteTreatment,
	GradientDirection,
	GradientTopology,
} from "./album-artwork-palette-v2.ts"
import {
	materializeAlbumArtworkPaletteV2Phase3Descriptors,
} from "./album-artwork-palette-v2-phase-3-materialization.ts"
import type {
	AlbumArtworkPaletteV2Phase3Materialization,
	AlbumArtworkPaletteV2Phase3MaterializationDiagnostics,
} from "./album-artwork-palette-v2-phase-3-materialization.ts"
import { selectAlbumArtworkPaletteV2Phase3Treatments } from
	"./album-artwork-palette-v2-phase-3-selector.ts"
import type {
	AlbumArtworkPaletteV2Phase3SelectorExplanation,
	AlbumArtworkPaletteV2Phase3SelectorSelection,
} from "./album-artwork-palette-v2-phase-3-selector.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from
	"./album-artwork-palette-v2-phase-3-common-base.ts"
export {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMMON_BASE_CONTRACT_ID,
	buildAlbumArtworkPaletteV2Phase3CommonBase,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"
export type {
	AlbumArtworkPaletteV2Phase3CommonBase,
	AlbumArtworkPaletteV2Phase3CommonBaseDiagnostics,
	AlbumArtworkPaletteV2Phase3CommonBaseOptions,
	AlbumArtworkPaletteV2Phase3CommonEvidence,
	AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType,
	AlbumArtworkPaletteV2Phase3FieldProposalV2Input,
	AlbumArtworkPaletteV2Phase3FieldProposalV2Module,
	AlbumArtworkPaletteV2Phase3FieldProposalV2Output,
	AlbumArtworkPaletteV2Phase3LogicalDescriptor,
	AlbumArtworkPaletteV2Phase3MaterializationV2Input,
	AlbumArtworkPaletteV2Phase3MaterializationV2Module,
	AlbumArtworkPaletteV2Phase3MaterializationV2Output,
	AlbumArtworkPaletteV2Phase3MaterializedDomainLike,
	AlbumArtworkPaletteV2Phase3ModuleDiagnostics,
	AlbumArtworkPaletteV2Phase3RoleDomainV2Input,
	AlbumArtworkPaletteV2Phase3RoleDomainV2Module,
	AlbumArtworkPaletteV2Phase3RoleDomainV2Output,
	AlbumArtworkPaletteV2Phase3SeedAvailability,
	AlbumArtworkPaletteV2Phase3SelectorV2Input,
	AlbumArtworkPaletteV2Phase3SelectorV2Module,
	AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis,
	AlbumArtworkPaletteV2Phase3SupplementalAvailability,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"
export {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CANDIDATE_V2_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CANDIDATE_V2_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CANDIDATE_V2_CONFIGURATION_ID,
	extractAlbumArtworkPaletteV2Phase3CandidateV2,
} from "./album-artwork-palette-v2-phase-3-candidate-v2.ts"
export type {
	AlbumArtworkPaletteV2Phase3CandidateV2Diagnostics,
	AlbumArtworkPaletteV2Phase3CandidateV2Result,
} from "./album-artwork-palette-v2-phase-3-candidate-v2.ts"
export {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CONFIGURATION_ID,
	extractAlbumArtworkPaletteV2Phase3Recovery,
} from "./album-artwork-palette-v2-phase-3-recovery.ts"
export type {
	AlbumArtworkPaletteV2Phase3RecoveryDiagnostics,
	AlbumArtworkPaletteV2Phase3RecoveryResult,
} from "./album-artwork-palette-v2-phase-3-recovery.ts"
export {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V2_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V2_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V2_CONFIGURATION_ID,
	extractAlbumArtworkPaletteV2Phase3RecoveryV2,
} from "./album-artwork-palette-v2-phase-3-recovery-v2.ts"
export type {
	AlbumArtworkPaletteV2Phase3RecoveryV2Diagnostics,
	AlbumArtworkPaletteV2Phase3RecoveryV2Result,
} from "./album-artwork-palette-v2-phase-3-recovery-v2.ts"
export {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V3_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V3_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V3_CONFIGURATION_ID,
	extractAlbumArtworkPaletteV2Phase3RecoveryV3,
} from "./album-artwork-palette-v2-phase-3-recovery-v3.ts"
export type {
	AlbumArtworkPaletteV2Phase3RecoveryV3Diagnostics,
	AlbumArtworkPaletteV2Phase3RecoveryV3Result,
} from "./album-artwork-palette-v2-phase-3-recovery-v3.ts"
export {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V4_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V4_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V4_CONFIGURATION_ID,
	extractAlbumArtworkPaletteV2Phase3RecoveryV4,
} from "./album-artwork-palette-v2-phase-3-recovery-v4.ts"
export {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_CONFIGURATION_ID,
	extractAlbumArtworkPaletteV2Phase3IntegratedCandidate,
} from "./album-artwork-palette-v2-phase-3-integrated-candidate.ts"
export {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_COMPONENT_LOCAL_ENDPOINT_CONFIGURATION_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRASTIVE_ROLE_ASSIGNMENT_CONFIGURATION_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RAW_RELATION_SLATE_COMPLEMENT_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RAW_RELATION_SLATE_COMPLEMENT_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RAW_RELATION_SLATE_COMPLEMENT_CONFIGURATION_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SOURCE_LIGHT_FOREGROUND_RESERVE_CONFIGURATION_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SUPPORTED_GRADIENT_PATH_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SUPPORTED_GRADIENT_PATH_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SUPPORTED_GRADIENT_PATH_CONFIGURATION_ID,
	extractAlbumArtworkPaletteV2Phase3ComponentLocalEndpoint,
	extractAlbumArtworkPaletteV2Phase3ContrastiveRoleAssignment,
	extractAlbumArtworkPaletteV2Phase3RawRelationSlateComplement,
	extractAlbumArtworkPaletteV2Phase3SourceLightForegroundReserve,
	extractAlbumArtworkPaletteV2Phase3SupportedGradientPath,
} from "./album-artwork-palette-v2-phase-3-parallel-arms.ts"
export {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_ADDITIVE_ROLE_DOMAIN_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_ADDITIVE_ROLE_DOMAIN_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_ADDITIVE_ROLE_DOMAIN_CONFIGURATION_ID,
	extractAlbumArtworkPaletteV2Phase3ArmAdditiveRoleDomain,
} from "./album-artwork-palette-v2-phase-3-arm-additive-role-domain.ts"
export {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_BALANCED_MATERIALIZATION_CONFIGURATION_ID,
	extractAlbumArtworkPaletteV2Phase3BalancedMaterialization,
} from "./album-artwork-palette-v2-phase-3-arm-balanced-materialization-adapter.ts"
export {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_CONFIGURATION_ID,
	extractAlbumArtworkPaletteV2Phase3ArmEarnedGradientChallenger,
} from "./album-artwork-palette-v2-phase-3-arm-earned-gradient-challenger-attempt.ts"
export {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_CONFIGURATION_ID,
	extractAlbumArtworkPaletteV2Phase3CompleteLineageWinner,
} from "./album-artwork-palette-v2-phase-3-arm-complete-lineage-winner.ts"
export {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CUSTODY_V3_POLICY,
	buildAlbumArtworkPaletteV2Phase3RecoveryV3RoleEvidence,
	selectAlbumArtworkPaletteV2Phase3RecoveryV3Custody,
} from "./album-artwork-palette-v2-phase-3-recovery-custody-v3.ts"
export type {
	AlbumArtworkPaletteV2Phase3RecoveryV3CustodyDiagnostics,
	AlbumArtworkPaletteV2Phase3RecoveryV3CustodySelection,
	AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate,
	AlbumArtworkPaletteV2Phase3RecoveryV3RenderedFieldClaim,
	AlbumArtworkPaletteV2Phase3RecoveryV3RoleEvidence,
	AlbumArtworkPaletteV2Phase3RecoveryV3SelectedItemDiagnostic,
	AlbumArtworkPaletteV2Phase3RecoveryV3SelectionKind,
} from "./album-artwork-palette-v2-phase-3-recovery-custody-v3.ts"
export {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_FORMULAS,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_QUALITY_AXES,
	selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
export type {
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation,
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Quality,
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2QualityAxis,
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection,
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2SlateDimension,
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2SlateEntry,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type { RawImage } from "./types.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CONTRACT_ID =
	"album-artwork-palette-v2-phase-3-attempt-contract-v1" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CLOSED_ANCHOR_ID = "closed-0.7.4" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_LIVE_072_ATTEMPT_ID = "live-0.7.2" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_WORKING_ATTEMPT_ID = "phase-3-working" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_WORKING_CONFIGURATION_ID =
	"closed-0.7.4-anchor-plus-source-fields-plus-relation-complement-v2" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_WORKING_SELECTION_POLICY_ID =
	"closed-anchor-prefix-source-strata-relation-complement-v2" as const

const WORKING_SLATE_CAPACITY = 8
const WORKING_ANCHOR_PREFIX_CAPACITY = 2
const WORKING_SUPPLEMENTAL_RESERVE_CAPACITY = 4

export type AlbumArtworkPaletteV2Phase3AttemptIdentity = Readonly<{
	attemptId: string
	configurationId: string
}>

export type AlbumArtworkPaletteV2Phase3AttemptAdapter = Readonly<{
	identity: AlbumArtworkPaletteV2Phase3AttemptIdentity
	extract: (image: RawImage) => AlbumArtworkPaletteV2Result
}>

export type AlbumArtworkPaletteV2Phase3NormalizedTreatment = Readonly<{
	key: string
	treatment: CompletePaletteTreatment
}>

export type AlbumArtworkPaletteV2Phase3NormalizedResult = Readonly<{
	version: string
	protocol: string
	dimensions: Readonly<{ width: number; height: number }>
	winner: AlbumArtworkPaletteV2Phase3NormalizedTreatment
	alternatives: readonly AlbumArtworkPaletteV2Phase3NormalizedTreatment[]
	diagnostics: AlbumArtworkPaletteV2Result["diagnostics"]
}>

export type AlbumArtworkPaletteV2Phase3MaterialDelta = Readonly<{
	identity: "canonical-role-hex-and-gradient-v1"
	materiallyChanged: boolean
	winner: Readonly<{
		anchorKey: string
		candidateKey: string
		changed: boolean
	}>
	addedAlternativeKeys: readonly string[]
	removedAlternativeKeys: readonly string[]
	alternativeOrderChanged: boolean
}>

export type AlbumArtworkPaletteV2Phase3WorkingHypothesisCustody = Readonly<{
	hypothesisId: string
	source: "field-transition" | "endpoint-refinement"
	fieldDomainId: string
	topology: GradientTopology
	direction: GradientDirection
	constructedTreatmentCount: number
	constructedCanonicalTreatmentCount: number
	materializedDomainTreatmentCount: number
	paretoTreatmentCount: number
	publicSlateTreatmentCount: number
	winner: boolean
}>

export type AlbumArtworkPaletteV2Phase3WorkingDiagnostics = Readonly<{
	version: "album-artwork-palette-v2-phase-3-working-diagnostics-v2"
	selectionAuthority: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_WORKING_SELECTION_POLICY_ID
	closedDomainTreatmentCount: number
	supplementalConstructedTreatmentCount: number
	logicalUnionDescriptorCount: number
	materializedDomainTreatmentCount: number
	fieldTransition: Readonly<{
		discoveredTraceCount: number
		eligibleTraceCount: number
		hypotheses: readonly AlbumArtworkPaletteV2Phase3WorkingHypothesisCustody[]
	}>
	endpointRefinement: Readonly<{
		evaluatedFitCount: number
		sameFamilyFitCount: number
		acceptedCount: number
		rejectedCount: number
		hypotheses: readonly AlbumArtworkPaletteV2Phase3WorkingHypothesisCustody[]
	}>
	materialization: AlbumArtworkPaletteV2Phase3MaterializationDiagnostics
	selector: AlbumArtworkPaletteV2Phase3SelectorExplanation
	slatePolicy: Readonly<{
		capacity: 8
		anchorPrefixCapacity: 2
		supplementalReserveCapacity: 4
		anchorPrefixKeys: readonly string[]
		reservedSupplemental: ReadonlyArray<Readonly<{
			key: string
			sources: readonly ("field-transition" | "endpoint-refinement")[]
			strata: readonly string[]
		}>>
		selectorComplementKeys: readonly string[]
		selectedKeys: readonly string[]
	}>
	roleAwareEvidence: Readonly<{
		integrated: false
		reason: "field-and-role-specific-obligations-cannot-be-losslessly-represented-by-family-only-selector-input"
	}>
}>

type WorkingSupplementalSource = AlbumArtworkPaletteV2Phase3WorkingHypothesisCustody["source"]

function selectAlbumArtworkPaletteV2Phase3WorkingSlate(
	closed: AlbumArtworkPaletteV2Result,
	materialization: AlbumArtworkPaletteV2Phase3Materialization,
	relationSelection: AlbumArtworkPaletteV2Phase3SelectorSelection,
	sourceByHypothesisId: ReadonlyMap<string, WorkingSupplementalSource>,
): Readonly<{
	selected: readonly CompletePaletteTreatment[]
	anchorPrefixKeys: readonly string[]
	reservedSupplemental: AlbumArtworkPaletteV2Phase3WorkingDiagnostics["slatePolicy"]["reservedSupplemental"]
	selectorComplementKeys: readonly string[]
}> {
	const relationRank = new Map(relationSelection.evaluations.map(({ key }, index) => [key, index]))
	const selected: CompletePaletteTreatment[] = []
	const selectedKeys = new Set<string>()
	const add = (treatment: CompletePaletteTreatment): boolean => {
		const key = completeTreatmentKey(treatment)
		if (selected.length >= WORKING_SLATE_CAPACITY || selectedKeys.has(key)) return false
		selected.push(treatment)
		selectedKeys.add(key)
		return true
	}

	const anchorCandidates = [closed.winner, ...closed.alternatives]
	for (const treatment of anchorCandidates) {
		if (selected.length >= WORKING_ANCHOR_PREFIX_CAPACITY) break
		add(treatment)
	}
	if (completeTreatmentKey(selected[0]) !== completeTreatmentKey(closed.winner)) {
		throw new Error("Phase 3 working slate did not preserve the closed winner at top-one")
	}
	const anchorPrefix = [...selected]
	const anchorPrefixKeys = anchorPrefix.map(completeTreatmentKey)

	const supplementalCandidates = materialization.materialized.map((candidate) => {
		const strata = new Map<string, WorkingSupplementalSource>()
		for (const descriptor of candidate.descriptors) {
			const source = sourceByHypothesisId.get(descriptor.fieldHypothesis.id)
			if (!source || !descriptor.treatment.gradient || descriptor.treatment.fieldTreatment !== "gradient-field") continue
			strata.set(`${source}:${descriptor.lineage.fieldDirectionKey}`, source)
		}
		return {
			candidate,
			strata: [...strata.keys()].sort(),
			sources: [...new Set(strata.values())].sort(),
		}
	}).filter(({ strata }) => strata.length > 0)
		.sort((first, second) =>
			(relationRank.get(first.candidate.key) ?? Infinity) - (relationRank.get(second.candidate.key) ?? Infinity) ||
			(first.candidate.key < second.candidate.key ? -1 : first.candidate.key > second.candidate.key ? 1 : 0))
	const materiallyDistinctFromAnchor = (treatment: CompletePaletteTreatment): boolean =>
		!anchorPrefix.some((anchor) => visuallyNear(anchor, treatment))
	const reservedSupplemental: Array<{
		key: string
		sources: WorkingSupplementalSource[]
		strata: string[]
	}> = []
	const coveredSupplementalStrata = new Set<string>()
	const reserve = (entry: typeof supplementalCandidates[number]): boolean => {
		if (reservedSupplemental.length >= WORKING_SUPPLEMENTAL_RESERVE_CAPACITY ||
			selectedKeys.has(entry.candidate.key) || !materiallyDistinctFromAnchor(entry.candidate.treatment)) return false
		if (!add(entry.candidate.treatment)) return false
		for (const stratum of entry.strata) coveredSupplementalStrata.add(stratum)
		reservedSupplemental.push({
			key: entry.candidate.key,
			sources: entry.sources,
			strata: entry.strata,
		})
		return true
	}
	for (const source of ["field-transition", "endpoint-refinement"] as const) {
		const entry = supplementalCandidates.find((candidate) =>
			candidate.sources.includes(source) && materiallyDistinctFromAnchor(candidate.candidate.treatment) &&
			!selectedKeys.has(candidate.candidate.key))
		if (entry) reserve(entry)
	}
	for (const entry of supplementalCandidates) {
		if (reservedSupplemental.length >= WORKING_SUPPLEMENTAL_RESERVE_CAPACITY) break
		if (entry.strata.some((stratum) => !coveredSupplementalStrata.has(stratum))) reserve(entry)
	}
	for (const source of ["field-transition", "endpoint-refinement"] as const) {
		const hasDistinctCandidate = supplementalCandidates.some((candidate) =>
			candidate.sources.includes(source) && materiallyDistinctFromAnchor(candidate.candidate.treatment))
		if (hasDistinctCandidate && !reservedSupplemental.some(({ sources }) => sources.includes(source))) {
			throw new Error(`Phase 3 working slate omitted a materially distinct ${source} treatment`)
		}
	}

	const selectorComplementKeys: string[] = []
	const selectedFieldDirections = new Set(selected.map(fieldDirectionKey))
	const selectedRoleDirections = new Set(selected.flatMap(roleDirectionKeys))
	const complementaryCandidates = [...new Map([
		...relationSelection.slate.map((treatment) => [completeTreatmentKey(treatment), treatment] as const),
		...relationSelection.evaluations.filter(({ paretoMember }) => paretoMember)
			.map(({ key, treatment }) => [key, treatment] as const),
	]).values()]
	const complement = (treatment: CompletePaletteTreatment): boolean => {
		const key = completeTreatmentKey(treatment)
		if (selectedKeys.has(key) || selected.some((existing) => visuallyNear(existing, treatment)) || !add(treatment)) return false
		selectedFieldDirections.add(fieldDirectionKey(treatment))
		for (const direction of roleDirectionKeys(treatment)) selectedRoleDirections.add(direction)
		selectorComplementKeys.push(key)
		return true
	}
	for (const treatment of complementaryCandidates) {
		if (selected.length >= WORKING_SLATE_CAPACITY) break
		if (roleDirectionKeys(treatment).some((direction) => !selectedRoleDirections.has(direction))) complement(treatment)
	}
	for (const treatment of complementaryCandidates) {
		if (selected.length >= WORKING_SLATE_CAPACITY) break
		if (!selectedFieldDirections.has(fieldDirectionKey(treatment))) complement(treatment)
	}
	for (const treatment of complementaryCandidates) {
		if (selected.length >= WORKING_SLATE_CAPACITY) break
		complement(treatment)
	}
	return { selected, anchorPrefixKeys, reservedSupplemental, selectorComplementKeys }
}

export type AlbumArtworkPaletteV2Phase3WorkingResult = Omit<AlbumArtworkPaletteV2Result, "diagnostics"> & Readonly<{
	diagnostics: AlbumArtworkPaletteV2Result["diagnostics"] & Readonly<{
		phase3Selector: AlbumArtworkPaletteV2Phase3SelectorExplanation
		phase3Working: AlbumArtworkPaletteV2Phase3WorkingDiagnostics
	}>
}>

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_LIVE_072_ATTEMPT:
	AlbumArtworkPaletteV2Phase3AttemptAdapter = Object.freeze({
		identity: Object.freeze({
			attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_LIVE_072_ATTEMPT_ID,
			configurationId: "default",
		}),
		extract: extractAlbumArtworkPaletteV2Phase3Live072,
	})

export function extractAlbumArtworkPaletteV2Phase3Working(
	image: RawImage,
): AlbumArtworkPaletteV2Phase3WorkingResult {
	const closed = extractAlbumArtworkPaletteV2074Details(image)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(image, {
		closed074Details: closed,
		materializeCurrentV1: (descriptors, obligations) =>
			materializeAlbumArtworkPaletteV2Phase3Descriptors(descriptors, obligations),
	})
	const transition = common.evidence.nativeFieldTransitions
	const endpointReport = common.evidence.bandLocalEndpoints
	const supplemental = common.supplementalAvailability
	const sourceByHypothesisId = new Map<string, WorkingSupplementalSource>([
		...supplemental.fieldHypotheses.map(({ sourceType, hypothesis }) => [
			hypothesis.id,
			sourceType === "native-field-transition" ? "field-transition" : "endpoint-refinement",
		] as const),
	])
	const closedDescriptors = common.seedAvailability.logicalDescriptors
	const logicalDescriptors = common.logicalDescriptors
	const materialization = common.currentV1MaterializedDomain
	if (!materialization) throw new Error("Phase 3 common base omitted the requested v1 comparison domain")
	const selection = selectAlbumArtworkPaletteV2Phase3Treatments(
		materialization.materialized.map(({ treatment }) => treatment),
		closed.result.diagnostics.identityObligationGraph,
	)
	const workingSlate = selectAlbumArtworkPaletteV2Phase3WorkingSlate(
		closed.result,
		materialization,
		selection,
		sourceByHypothesisId,
	)
	const evaluationByKey = new Map(selection.evaluations.map((evaluation) => [evaluation.key, evaluation]))
	const slateKeys = new Set(workingSlate.selected.map(completeTreatmentKey))
	const winnerKey = completeTreatmentKey(closed.result.winner)
	const custody = supplemental.fieldHypotheses.map(({ hypothesis }): AlbumArtworkPaletteV2Phase3WorkingHypothesisCustody => {
		const constructed = supplemental.logicalDescriptors.filter(({ fieldHypothesis }) => fieldHypothesis.id === hypothesis.id)
		const constructedKeys = new Set(constructed.map(({ treatment }) => completeTreatmentKey(treatment)))
		const materialized = materialization.materialized.filter(({ descriptors }) => descriptors.some(({ fieldHypothesis }) =>
			fieldHypothesis.id === hypothesis.id))
		if (constructed.length > 0 && materialized.length === 0) {
			throw new Error(`Phase 3 supplemental hypothesis ${hypothesis.id} was starved before the materialized domain`)
		}
		return {
			hypothesisId: hypothesis.id,
			source: sourceByHypothesisId.get(hypothesis.id)!,
			fieldDomainId: hypothesis.gradientEvidence!.fieldDomainId,
			topology: hypothesis.gradientEvidence!.topology,
			direction: hypothesis.gradientEvidence!.direction,
			constructedTreatmentCount: constructed.length,
			constructedCanonicalTreatmentCount: constructedKeys.size,
			materializedDomainTreatmentCount: materialized.length,
			paretoTreatmentCount: materialized.filter(({ key }) => evaluationByKey.get(key)?.paretoMember).length,
			publicSlateTreatmentCount: materialized.filter(({ key }) => slateKeys.has(key)).length,
			winner: materialized.some(({ key }) => key === winnerKey),
		}
	})
	const transitionCustody = custody.filter(({ source }) => source === "field-transition")
	const endpointCustody = custody.filter(({ source }) => source === "endpoint-refinement")
	const slateForegroundFamilyIds = [...new Set(workingSlate.selected.map(({ familyRoles }) => familyRoles.foreground)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort()
	const slateAccentFamilyIds = [...new Set(workingSlate.selected.filter(({ collapse }) => !collapse.accent)
		.map(({ familyRoles }) => familyRoles.accent)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort()
	const phase3Working: AlbumArtworkPaletteV2Phase3WorkingDiagnostics = {
		version: "album-artwork-palette-v2-phase-3-working-diagnostics-v2",
		selectionAuthority: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_WORKING_SELECTION_POLICY_ID,
		closedDomainTreatmentCount: closedDescriptors.length,
		supplementalConstructedTreatmentCount: supplemental.logicalDescriptors.length,
		logicalUnionDescriptorCount: logicalDescriptors.length,
		materializedDomainTreatmentCount: materialization.materialized.length,
		fieldTransition: {
			discoveredTraceCount: transition.traces.length,
			eligibleTraceCount: transition.traces.filter(({ eligible, topology, direction }) => eligible && (
				(topology === "linear" && ["horizontal", "vertical", "diagonal-down", "diagonal-up"].includes(direction)) ||
				((topology === "radial-center" || topology === "radial-upper-center") && direction === "center-out")
			)).length,
			hypotheses: transitionCustody,
		},
		endpointRefinement: {
			evaluatedFitCount: endpointReport.evaluatedFitCount,
			sameFamilyFitCount: endpointReport.sameFamilyFitCount,
			acceptedCount: endpointReport.acceptedCount,
			rejectedCount: endpointReport.rejectedCount,
			hypotheses: endpointCustody,
		},
		materialization: materialization.diagnostics,
		selector: selection.explanation,
		slatePolicy: {
			capacity: WORKING_SLATE_CAPACITY,
			anchorPrefixCapacity: WORKING_ANCHOR_PREFIX_CAPACITY,
			supplementalReserveCapacity: WORKING_SUPPLEMENTAL_RESERVE_CAPACITY,
			anchorPrefixKeys: workingSlate.anchorPrefixKeys,
			reservedSupplemental: workingSlate.reservedSupplemental,
			selectorComplementKeys: workingSlate.selectorComplementKeys,
			selectedKeys: workingSlate.selected.map(completeTreatmentKey),
		},
		roleAwareEvidence: {
			integrated: false,
			reason: "field-and-role-specific-obligations-cannot-be-losslessly-represented-by-family-only-selector-input",
		},
	}
	return {
		...closed.result,
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_WORKING_ATTEMPT_ID,
		protocol: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_WORKING_CONFIGURATION_ID,
		winner: closed.result.winner,
		alternatives: workingSlate.selected,
		diagnostics: {
			...closed.result.diagnostics,
			fieldHypotheses: [
				...closed.result.diagnostics.fieldHypotheses,
				...supplemental.fieldHypotheses.map(({ hypothesis }) => hypothesis),
			],
			completeCandidateCount: materialization.materialized.length,
			candidateAvailability: {
				...closed.result.diagnostics.candidateAvailability,
				slateForegroundFamilyIds,
				slateAccentFamilyIds,
			},
			phase3Selector: selection.explanation,
			phase3Working,
		},
	}
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_WORKING_ATTEMPT:
	AlbumArtworkPaletteV2Phase3AttemptAdapter = Object.freeze({
		identity: Object.freeze({
			attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_WORKING_ATTEMPT_ID,
			configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_WORKING_CONFIGURATION_ID,
		}),
		extract: extractAlbumArtworkPaletteV2Phase3Working,
	})

export function extractAlbumArtworkPaletteV2Phase3ClosedAnchor(
	image: RawImage,
): AlbumArtworkPaletteV2Result {
	return extractAlbumArtworkPaletteV2Phase3Closed074(image)
}

export function normalizeAlbumArtworkPaletteV2Phase3Result(
	result: AlbumArtworkPaletteV2Result,
): AlbumArtworkPaletteV2Phase3NormalizedResult {
	const normalizeTreatment = (treatment: CompletePaletteTreatment):
		AlbumArtworkPaletteV2Phase3NormalizedTreatment => ({
			key: completeTreatmentKey(treatment),
			treatment,
		})
	return {
		version: result.version,
		protocol: result.protocol,
		dimensions: { width: result.width, height: result.height },
		winner: normalizeTreatment(result.winner),
		alternatives: result.alternatives.map(normalizeTreatment),
		diagnostics: result.diagnostics,
	}
}

export function materialDeltaFromAlbumArtworkPaletteV2Phase3Anchor(
	candidate: AlbumArtworkPaletteV2Phase3NormalizedResult,
	anchor: AlbumArtworkPaletteV2Phase3NormalizedResult,
): AlbumArtworkPaletteV2Phase3MaterialDelta {
	const candidateKeys = candidate.alternatives.map(({ key }) => key)
	const anchorKeys = anchor.alternatives.map(({ key }) => key)
	const candidateKeySet = new Set(candidateKeys)
	const anchorKeySet = new Set(anchorKeys)
	const addedAlternativeKeys = candidateKeys.filter((key) => !anchorKeySet.has(key))
	const removedAlternativeKeys = anchorKeys.filter((key) => !candidateKeySet.has(key))
	const alternativeOrderChanged = candidateKeys.length !== anchorKeys.length ||
		candidateKeys.some((key, index) => key !== anchorKeys[index])
	const winnerChanged = candidate.winner.key !== anchor.winner.key
	return {
		identity: "canonical-role-hex-and-gradient-v1",
		materiallyChanged: winnerChanged || alternativeOrderChanged,
		winner: {
			anchorKey: anchor.winner.key,
			candidateKey: candidate.winner.key,
			changed: winnerChanged,
		},
		addedAlternativeKeys,
		removedAlternativeKeys,
		alternativeOrderChanged,
	}
}
