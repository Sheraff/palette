import {
	completeTreatmentKey,
} from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Result,
	CompletePaletteTreatment,
} from "./album-artwork-palette-v2.ts"
import {
	areAlbumArtworkPaletteV2Phase3RawRelationRenderingsNear,
	proposeAlbumArtworkPaletteV2Phase3RawRelationSlateComplements,
} from "./album-artwork-palette-v2-phase-3-arm-raw-relation-slate-complement.ts"
import type {
	AlbumArtworkPaletteV2Phase3RawRelationSlateComplementProposal,
} from "./album-artwork-palette-v2-phase-3-arm-raw-relation-slate-complement.ts"
import {
	extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails,
} from "./album-artwork-palette-v2-phase-3-integrated-candidate.ts"
import type {
	AlbumArtworkPaletteV2Phase3IntegratedCandidateDiagnostics,
} from "./album-artwork-palette-v2-phase-3-integrated-candidate.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_CAPACITY,
} from "./album-artwork-palette-v2-phase-3-materialization.ts"
import {
	proposeAlbumArtworkPaletteV2Phase3ComponentLocalEndpoint,
} from "./album-artwork-palette-v2-phase-3-parallel-arms.ts"
import type {
	AlbumArtworkPaletteV2Phase3ComponentLocalEndpointProposal,
	AlbumArtworkPaletteV2Phase3ComponentLocalEndpointProposalResult,
} from "./album-artwork-palette-v2-phase-3-parallel-arms.ts"
import type { RawImage } from "./types.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT_ID =
	"phase-3-final-candidate" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION_ID =
	"integrated-strict-midpoint-component-endpoint-raw-relation-non-displacement-v1" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION = Object.freeze({
	version: "album-artwork-palette-v2-phase-3-final-candidate-configuration-v1" as const,
	configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION_ID,
	winnerAuthority: "integrated-after-strict-supported-gradient-midpoint-authority" as const,
	baselineAuthority: "immutable-integrated-winner-first-slate" as const,
	mechanismOrder: Object.freeze([
		"component-local-endpoint",
		"raw-relation-slate-complement",
	] as const),
	proposalAuthority: Object.freeze({
		componentLocalEndpoint: "component-local-endpoint-producer-order" as const,
		rawRelationSlateComplement: "raw-relation-slate-complement-producer-order" as const,
		validation: "canonical-key-match-and-mechanism-unique" as const,
	}),
	bounds: Object.freeze({
		inheritedTopLevelCompleteCandidates: Object.freeze({
			value: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_CAPACITY,
			scope: "baseline-algorithm-and-materializer-only" as const,
			combinedEvaluationOverride: false as const,
		}),
		maximumBaselineMaterializedTreatments:
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_CAPACITY,
		maximumEndpointSupplementalMaterializedTreatments:
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_CAPACITY,
		maximumCombinedEvaluationTreatments: 3_000 as const,
		combinedEvaluationScope: "canonical-union-of-two-independently-bounded-domains" as const,
	}),
	maximumSlateTreatments: 8 as const,
	maximumAdmissionPerMechanism: 1 as const,
	capacityPolicy: "append-or-displace-one-prospective-integrated-nonwinner" as const,
	reserveDisplacement: "forbidden" as const,
	rawAuthority: "supplemental-only-never-winner" as const,
	excludedWinnerAuthorities: Object.freeze([
		"rejected-source-light-foreground-reserve",
		"rejected-combined-v3-path-bound-winner",
	] as const),
})

export type AlbumArtworkPaletteV2Phase3FinalCandidateCombinedDomainBoundInput = Readonly<{
	endpointDescriptorCount: number
	baselineMaterializedTreatmentCount: number
	endpointSupplementalMaterializedTreatmentCount: number
	combinedEvaluationTreatmentCount: number
	reportedCanonicalUnionTreatmentCount: number
}>

export type AlbumArtworkPaletteV2Phase3FinalCandidateCombinedDomainBoundDiagnostics = Readonly<{
	bounds: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION.bounds
	actual: AlbumArtworkPaletteV2Phase3FinalCandidateCombinedDomainBoundInput
	checks: Readonly<{
		baselineWithinBound: boolean
		endpointSupplementalWithinBound: boolean
		configuredCombinedBoundEqualsIndependentBoundSum: boolean
		combinedWithinSumBound: boolean
		combinedMatchesReportedCanonicalUnion: boolean
		canonicalUnionWithinIndependentDomainSum: boolean
		combinedContainsBaselineDomain: boolean
		noEndpointDescriptorsUseZeroSupplemental: boolean
		noEndpointDescriptorsUseBaselineCombinedDomain: boolean
	}>
	verified: boolean
}>

export function evaluateAlbumArtworkPaletteV2Phase3FinalCandidateCombinedDomainBound(
	input: AlbumArtworkPaletteV2Phase3FinalCandidateCombinedDomainBoundInput,
): AlbumArtworkPaletteV2Phase3FinalCandidateCombinedDomainBoundDiagnostics {
	for (const [name, value] of Object.entries(input)) {
		if (!Number.isSafeInteger(value) || value < 0) {
			throw new RangeError(`Phase 3 final candidate combined-domain ${name} must be a non-negative safe integer`)
		}
	}
	const bounds = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION.bounds
	const checks = {
		baselineWithinBound:
			input.baselineMaterializedTreatmentCount <= bounds.maximumBaselineMaterializedTreatments,
		endpointSupplementalWithinBound: input.endpointSupplementalMaterializedTreatmentCount <=
			bounds.maximumEndpointSupplementalMaterializedTreatments,
		configuredCombinedBoundEqualsIndependentBoundSum: bounds.maximumCombinedEvaluationTreatments ===
			bounds.maximumBaselineMaterializedTreatments +
				bounds.maximumEndpointSupplementalMaterializedTreatments,
		combinedWithinSumBound:
			input.combinedEvaluationTreatmentCount <= bounds.maximumCombinedEvaluationTreatments,
		combinedMatchesReportedCanonicalUnion: input.combinedEvaluationTreatmentCount ===
			input.reportedCanonicalUnionTreatmentCount,
		canonicalUnionWithinIndependentDomainSum: input.reportedCanonicalUnionTreatmentCount <=
			input.baselineMaterializedTreatmentCount + input.endpointSupplementalMaterializedTreatmentCount,
		combinedContainsBaselineDomain: input.combinedEvaluationTreatmentCount >=
			input.baselineMaterializedTreatmentCount,
		noEndpointDescriptorsUseZeroSupplemental: input.endpointDescriptorCount > 0 ||
			input.endpointSupplementalMaterializedTreatmentCount === 0,
		noEndpointDescriptorsUseBaselineCombinedDomain: input.endpointDescriptorCount > 0 ||
			(input.combinedEvaluationTreatmentCount === input.baselineMaterializedTreatmentCount &&
				input.reportedCanonicalUnionTreatmentCount === input.baselineMaterializedTreatmentCount),
	}
	return {
		bounds,
		actual: input,
		checks,
		verified: Object.values(checks).every(Boolean),
	}
}

export type AlbumArtworkPaletteV2Phase3FinalCandidateProposal = Readonly<{
	key: string
	treatment: CompletePaletteTreatment
}>

export type AlbumArtworkPaletteV2Phase3FinalCandidateRejectionReason =
	"canonical-baseline-duplicate" |
	"accepted-reserve-collision" |
	"raw-rendering-near" |
	"no-integrated-nonwinner-capacity"

export type AlbumArtworkPaletteV2Phase3FinalCandidateProposalDiagnostic = Readonly<{
	proposalIndex: number
	suppliedKey: string
	key: string
	attempted: boolean
	outcome: "rejected" | "admitted" | "not-considered-after-admission"
	rejectionReasons: readonly AlbumArtworkPaletteV2Phase3FinalCandidateRejectionReason[]
	prospectiveDisplacedIntegratedKey: string | null
	mutationApplied: boolean
	outputIndex: number | null
}>

export type AlbumArtworkPaletteV2Phase3FinalCandidateMechanismDiagnostics = Readonly<{
	mechanism: "component-local-endpoint" | "raw-relation-slate-complement"
	mechanismIndex: 0 | 1
	proposalAuthority: "component-local-endpoint-producer-order" |
		"raw-relation-slate-complement-producer-order"
	producerOrderValidated: true
	proposalCount: number
	proposalKeysInOrder: readonly string[]
	proposals: readonly AlbumArtworkPaletteV2Phase3FinalCandidateProposalDiagnostic[]
	admittedKey: string | null
	displacedIntegratedKey: string | null
	noProposal: boolean
	noAdmission: boolean
	exactNoOp: boolean
	outputIndex: number | null
}>

export type AlbumArtworkPaletteV2Phase3FinalCandidateCompositionDiagnostics = Readonly<{
	version: "album-artwork-palette-v2-phase-3-final-candidate-composition-v1"
	configuration: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION
	baselineWinnerKey: string
	baselineKeys: readonly string[]
	finalWinnerKey: string
	finalKeys: readonly string[]
	retainedIntegratedKeys: readonly string[]
	displacedIntegratedKeys: readonly string[]
	mechanisms: readonly [
		AlbumArtworkPaletteV2Phase3FinalCandidateMechanismDiagnostics,
		AlbumArtworkPaletteV2Phase3FinalCandidateMechanismDiagnostics,
	]
	checks: Readonly<{
		exactWinnerObject: boolean
		exactWinnerKey: boolean
		winnerFirst: boolean
		uniqueKeys: boolean
		capacity: boolean
		integratedPrefix: boolean
		integratedOrder: boolean
		acceptedReservesRetained: boolean
		noReserveDisplacement: boolean
		maximumOnePerMechanism: boolean
		rawSupplementalOnly: boolean
		proposalAuthoritiesValidated: boolean
	}>
}>

export type AlbumArtworkPaletteV2Phase3FinalCandidateCompositionInput<
	TEndpoint extends AlbumArtworkPaletteV2Phase3FinalCandidateProposal =
		AlbumArtworkPaletteV2Phase3FinalCandidateProposal,
	TRaw extends AlbumArtworkPaletteV2Phase3FinalCandidateProposal =
		AlbumArtworkPaletteV2Phase3FinalCandidateProposal,
> = Readonly<{
	integrated: Readonly<{
		winner: CompletePaletteTreatment
		slate: readonly CompletePaletteTreatment[]
	}>
	endpointProposals: readonly TEndpoint[]
	rawProposals: readonly TRaw[]
}>

export type AlbumArtworkPaletteV2Phase3FinalCandidateComposition<
	TEndpoint extends AlbumArtworkPaletteV2Phase3FinalCandidateProposal =
		AlbumArtworkPaletteV2Phase3FinalCandidateProposal,
	TRaw extends AlbumArtworkPaletteV2Phase3FinalCandidateProposal =
		AlbumArtworkPaletteV2Phase3FinalCandidateProposal,
> = Readonly<{
	winner: CompletePaletteTreatment
	slate: readonly CompletePaletteTreatment[]
	retainedIntegrated: readonly CompletePaletteTreatment[]
	accepted: Readonly<{
		endpoint: TEndpoint | null
		raw: TRaw | null
	}>
	diagnostics: AlbumArtworkPaletteV2Phase3FinalCandidateCompositionDiagnostics
}>

export function composeAlbumArtworkPaletteV2Phase3FinalCandidate<
	TEndpoint extends AlbumArtworkPaletteV2Phase3FinalCandidateProposal,
	TRaw extends AlbumArtworkPaletteV2Phase3FinalCandidateProposal,
>(input: AlbumArtworkPaletteV2Phase3FinalCandidateCompositionInput<TEndpoint, TRaw>):
	AlbumArtworkPaletteV2Phase3FinalCandidateComposition<TEndpoint, TRaw> {
	const maximumSlateTreatments =
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION.maximumSlateTreatments
	const baseline = input.integrated.slate
	if (baseline.length < 1 || baseline.length > maximumSlateTreatments) {
		throw new RangeError("Phase 3 final candidate requires an integrated baseline containing 1 to 8 treatments")
	}
	if (baseline[0] !== input.integrated.winner) {
		throw new Error("Phase 3 final candidate requires the exact integrated winner at the slate head")
	}
	const baselineWinnerKey = completeTreatmentKey(input.integrated.winner)
	const baselineKeys = baseline.map(completeTreatmentKey)
	if (baselineKeys[0] !== baselineWinnerKey) {
		throw new Error("Phase 3 final candidate requires winner-first integrated custody")
	}
	if (new Set(baselineKeys).size !== baselineKeys.length) {
		throw new Error("Phase 3 final candidate requires canonically unique integrated custody")
	}
	const validateProposalAuthority = (
		mechanism: AlbumArtworkPaletteV2Phase3FinalCandidateMechanismDiagnostics["mechanism"],
		proposals: readonly AlbumArtworkPaletteV2Phase3FinalCandidateProposal[],
	) => {
		const keys = new Set<string>()
		for (const proposal of proposals) {
			const key = completeTreatmentKey(proposal.treatment)
			if (proposal.key !== key) {
				throw new Error(`Phase 3 final candidate ${mechanism} producer supplied a non-canonical proposal key`)
			}
			if (keys.has(key)) {
				throw new Error(`Phase 3 final candidate ${mechanism} producer supplied duplicate canonical keys`)
			}
			keys.add(key)
		}
	}
	validateProposalAuthority("component-local-endpoint", input.endpointProposals)
	validateProposalAuthority("raw-relation-slate-complement", input.rawProposals)

	const baselineKeySet = new Set(baselineKeys)
	const retainedIntegrated = [...baseline]
	const acceptedProposals: AlbumArtworkPaletteV2Phase3FinalCandidateProposal[] = []
	const displacedIntegratedKeys: string[] = []

	const considerMechanism = (
		mechanism: AlbumArtworkPaletteV2Phase3FinalCandidateMechanismDiagnostics["mechanism"],
		mechanismIndex: 0 | 1,
		proposals: readonly AlbumArtworkPaletteV2Phase3FinalCandidateProposal[],
	): Readonly<{
		accepted: AlbumArtworkPaletteV2Phase3FinalCandidateProposal | null
		diagnostics: AlbumArtworkPaletteV2Phase3FinalCandidateMechanismDiagnostics
	}> => {
		let accepted: AlbumArtworkPaletteV2Phase3FinalCandidateProposal | null = null
		let displacedIntegratedKey: string | null = null
		const proposalAuthority = mechanism === "component-local-endpoint"
			? ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION
				.proposalAuthority.componentLocalEndpoint
			: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION
				.proposalAuthority.rawRelationSlateComplement
		const proposalDiagnostics: AlbumArtworkPaletteV2Phase3FinalCandidateProposalDiagnostic[] =
			proposals.map((proposal, proposalIndex) => ({
				proposalIndex,
				suppliedKey: proposal.key,
				key: completeTreatmentKey(proposal.treatment),
				attempted: false,
				outcome: "not-considered-after-admission",
				rejectionReasons: [],
				prospectiveDisplacedIntegratedKey: null,
				mutationApplied: false,
				outputIndex: null,
			}))
		for (let proposalIndex = 0; proposalIndex < proposals.length; proposalIndex++) {
			const proposal = proposals[proposalIndex]
			const key = completeTreatmentKey(proposal.treatment)
			const rejectionReasons: AlbumArtworkPaletteV2Phase3FinalCandidateRejectionReason[] = []
			if (baselineKeySet.has(key)) rejectionReasons.push("canonical-baseline-duplicate")
			else if (acceptedProposals.some((candidate) =>
				completeTreatmentKey(candidate.treatment) === key)) {
				rejectionReasons.push("accepted-reserve-collision")
			}
			const capacityRequired = retainedIntegrated.length + acceptedProposals.length >=
				maximumSlateTreatments
			const soleNearIntegrated = mechanism === "raw-relation-slate-complement" && capacityRequired
				? retainedIntegrated.filter((treatment) =>
					areAlbumArtworkPaletteV2Phase3RawRelationRenderingsNear(treatment, proposal.treatment))
				: []
			const prospectiveDisplaced = capacityRequired
				? soleNearIntegrated.length === 1 && soleNearIntegrated[0] !== input.integrated.winner
					? soleNearIntegrated[0]
					: retainedIntegrated.at(-1) ?? null
				: null
			if (rejectionReasons.length === 0 && capacityRequired &&
				(retainedIntegrated.length <= 1 || prospectiveDisplaced === null)) {
				rejectionReasons.push("no-integrated-nonwinner-capacity")
			}
			const prospectiveRetainedIntegrated = capacityRequired && prospectiveDisplaced !== null
				? retainedIntegrated.filter((treatment) => treatment !== prospectiveDisplaced)
				: retainedIntegrated
			if (rejectionReasons.length === 0 && mechanism === "raw-relation-slate-complement" &&
				[
					...prospectiveRetainedIntegrated,
					...acceptedProposals.map(({ treatment }) => treatment),
				].some((treatment) =>
					areAlbumArtworkPaletteV2Phase3RawRelationRenderingsNear(
						treatment,
						proposal.treatment,
					))) {
				rejectionReasons.push("raw-rendering-near")
			}
			if (rejectionReasons.length > 0) {
				proposalDiagnostics[proposalIndex] = {
					proposalIndex,
					suppliedKey: proposal.key,
					key,
					attempted: true,
					outcome: "rejected",
					rejectionReasons,
					prospectiveDisplacedIntegratedKey: prospectiveDisplaced === null
						? null : completeTreatmentKey(prospectiveDisplaced),
					mutationApplied: false,
					outputIndex: null,
				}
				if (rejectionReasons.includes("no-integrated-nonwinner-capacity")) break
				continue
			}
			if (prospectiveDisplaced !== null) {
				if (prospectiveDisplaced === input.integrated.winner ||
					completeTreatmentKey(prospectiveDisplaced) === baselineWinnerKey) {
					throw new Error("Phase 3 final candidate attempted to displace integrated winner authority")
				}
				const displacedIndex = retainedIntegrated.indexOf(prospectiveDisplaced)
				const displaced = displacedIndex < 0 ? null : retainedIntegrated.splice(displacedIndex, 1)[0]
				if (displaced !== prospectiveDisplaced) {
					throw new Error("Phase 3 final candidate prospective integrated tail changed before admission")
				}
				displacedIntegratedKey = completeTreatmentKey(prospectiveDisplaced)
				displacedIntegratedKeys.push(displacedIntegratedKey)
			}
			accepted = proposal
			acceptedProposals.push(proposal)
			proposalDiagnostics[proposalIndex] = {
				proposalIndex,
				suppliedKey: proposal.key,
				key,
				attempted: true,
				outcome: "admitted",
				rejectionReasons: [],
				prospectiveDisplacedIntegratedKey: prospectiveDisplaced === null
					? null : completeTreatmentKey(prospectiveDisplaced),
				mutationApplied: prospectiveDisplaced !== null,
				outputIndex: null,
			}
			break
		}
		return {
			accepted,
			diagnostics: {
				mechanism,
				mechanismIndex,
				proposalAuthority,
				producerOrderValidated: true,
				proposalCount: proposals.length,
				proposalKeysInOrder: proposalDiagnostics.map(({ key }) => key),
				proposals: proposalDiagnostics,
				admittedKey: accepted === null ? null : completeTreatmentKey(accepted.treatment),
				displacedIntegratedKey,
				noProposal: proposals.length === 0,
				noAdmission: accepted === null,
				exactNoOp: accepted === null,
				outputIndex: null,
			},
		}
	}

	const endpointConsideration = considerMechanism(
		"component-local-endpoint",
		0,
		input.endpointProposals,
	)
	const rawConsideration = considerMechanism(
		"raw-relation-slate-complement",
		1,
		input.rawProposals,
	)
	const acceptedEndpoint = endpointConsideration.accepted as TEndpoint | null
	const acceptedRaw = rawConsideration.accepted as TRaw | null
	const slate = acceptedEndpoint === null && acceptedRaw === null
		? baseline
		: [
			...retainedIntegrated,
			...acceptedEndpoint === null ? [] : [acceptedEndpoint.treatment],
			...acceptedRaw === null ? [] : [acceptedRaw.treatment],
		]
	const finalKeys = slate.map(completeTreatmentKey)
	const withOutputIndex = (
		diagnostics: AlbumArtworkPaletteV2Phase3FinalCandidateMechanismDiagnostics,
		accepted: AlbumArtworkPaletteV2Phase3FinalCandidateProposal | null,
	): AlbumArtworkPaletteV2Phase3FinalCandidateMechanismDiagnostics => {
		const outputIndex = accepted === null ? null : slate.indexOf(accepted.treatment)
		return {
			...diagnostics,
			outputIndex,
			proposals: diagnostics.proposals.map((proposal) => proposal.outcome === "admitted"
				? { ...proposal, outputIndex }
				: proposal),
		}
	}
	const endpointDiagnostics = withOutputIndex(endpointConsideration.diagnostics, acceptedEndpoint)
	const rawDiagnostics = withOutputIndex(rawConsideration.diagnostics, acceptedRaw)
	const acceptedTreatments = [
		...acceptedEndpoint === null ? [] : [acceptedEndpoint.treatment],
		...acceptedRaw === null ? [] : [acceptedRaw.treatment],
	]
	const checks = {
		exactWinnerObject: input.integrated.winner === slate[0],
		exactWinnerKey: baselineWinnerKey === completeTreatmentKey(slate[0]),
		winnerFirst: slate[0] === input.integrated.winner,
		uniqueKeys: new Set(finalKeys).size === finalKeys.length,
		capacity: slate.length >= 1 && slate.length <= maximumSlateTreatments,
		integratedPrefix: retainedIntegrated.every((treatment, index) =>
			treatment === baseline.filter((candidate) =>
				!displacedIntegratedKeys.includes(completeTreatmentKey(candidate)))[index]),
		integratedOrder: retainedIntegrated.every((treatment, index, treatments) => index === 0 ||
			baseline.indexOf(treatments[index - 1]) < baseline.indexOf(treatment)),
		acceptedReservesRetained: acceptedTreatments.every((treatment) => slate.includes(treatment)),
		noReserveDisplacement: acceptedTreatments.length === acceptedProposals.length &&
			acceptedProposals.every((proposal) => slate.includes(proposal.treatment)),
		maximumOnePerMechanism: Number(acceptedEndpoint !== null) <= 1 && Number(acceptedRaw !== null) <= 1,
		rawSupplementalOnly: acceptedRaw === null ||
			(slate[0] !== acceptedRaw.treatment && completeTreatmentKey(acceptedRaw.treatment) !== baselineWinnerKey),
		proposalAuthoritiesValidated: true,
	}
	if (!Object.values(checks).every(Boolean)) {
		throw new Error("Phase 3 final candidate composition violated bounded immutable custody")
	}
	return {
		winner: input.integrated.winner,
		slate,
		retainedIntegrated,
		accepted: { endpoint: acceptedEndpoint, raw: acceptedRaw },
		diagnostics: {
			version: "album-artwork-palette-v2-phase-3-final-candidate-composition-v1",
			configuration: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION,
			baselineWinnerKey,
			baselineKeys,
			finalWinnerKey: completeTreatmentKey(input.integrated.winner),
			finalKeys,
			retainedIntegratedKeys: retainedIntegrated.map(completeTreatmentKey),
			displacedIntegratedKeys,
			mechanisms: [endpointDiagnostics, rawDiagnostics],
			checks,
		},
	}
}

type IntegratedDetails = ReturnType<typeof extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function slateRoleFamilyIds(slate: readonly CompletePaletteTreatment[]) {
	return {
		foreground: [...new Set(slate.map(({ familyRoles }) => familyRoles.foreground)
			.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii),
		accent: [...new Set(slate.filter(({ collapse }) => !collapse.accent)
			.map(({ familyRoles }) => familyRoles.accent)
			.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii),
	}
}

function selectorRoleFamilyIds(
	selector: IntegratedDetails["recoveryV2"]["explanation"],
	role: "foreground" | "accent",
): string[] {
	const familyIds = new Set<string>()
	for (const evaluation of selector.evaluations) {
		const structural = evaluation.structuralKey.split("\0")
		if (structural.length < 8) {
			throw new Error("Phase 3 final candidate selector omitted canonical family-role custody")
		}
		if (role === "accent" && structural[7] === "accent-collapsed") continue
		const familyId = structural[role === "foreground" ? 4 : 5]
		if (familyId !== "generated") familyIds.add(familyId)
	}
	return [...familyIds].sort(compareAscii)
}

export type AlbumArtworkPaletteV2Phase3FinalCandidateDiagnostics = Readonly<{
	version: "album-artwork-palette-v2-phase-3-final-candidate-diagnostics-v1"
	configurationId: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION_ID
	configuration: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION
	winnerAuthority: "immutable-integrated-after-strict-supported-gradient-midpoint-authority"
	excludedWinnerAuthorities: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION.excludedWinnerAuthorities
	integrated: AlbumArtworkPaletteV2Phase3IntegratedCandidateDiagnostics
	domain: Record<string, unknown>
	selector: IntegratedDetails["recoveryV2"]["explanation"]
	lineageEligibility: IntegratedDetails["selection"]["completeLineage"]["eligibility"]["diagnostics"]
	transitionRescue: IntegratedDetails["selection"]["transitionRescue"]
	custody: IntegratedDetails["selection"]["custody"]
	selection: IntegratedDetails["selection"]["diagnostics"]
	gradientAuthority: IntegratedDetails["gradientAuthority"]["diagnostics"]
	supportedGradientPath: IntegratedDetails["supportedGradientPath"]["diagnostics"]
	componentLocalEndpointProposal: AlbumArtworkPaletteV2Phase3ComponentLocalEndpointProposalResult
	combinedDomainBound: AlbumArtworkPaletteV2Phase3FinalCandidateCombinedDomainBoundDiagnostics
	rawRelationSlateComplementProposal: ReturnType<
		typeof proposeAlbumArtworkPaletteV2Phase3RawRelationSlateComplements
	>
	composition: AlbumArtworkPaletteV2Phase3FinalCandidateCompositionDiagnostics
	finalSlateCustody: readonly Readonly<{
		key: string
		selectorEvaluation: boolean
		lineageCandidate: boolean
		integratedGradientProjection: boolean
		endpointProposalCustody: boolean
		familyRolesPublished: boolean
		familySupport: boolean
		represented: boolean
	}>[]
	evidenceCustody: Readonly<{
		baseFamilyCount: number
		endpointAdditiveFamilyIds: readonly string[]
		retainedFamilyIds: readonly string[]
		publishedFamilyIds: readonly string[]
		fieldHypothesisIds: readonly string[]
		completeCandidateCount: number
		checks: Readonly<{
			familyCountReconciled: boolean
			retainedFamilyCountReconciled: boolean
			publishedFamiliesExactlyRetained: boolean
			laneFamiliesPublished: boolean
			fieldFamiliesPublished: boolean
			candidateAvailabilityFamiliesPublished: boolean
			endpointDomainReconciled: boolean
		}>
	}>
	checks: Readonly<{
		allFinalSlateKeysRepresented: boolean
		allFinalSlateFamilyRolesPublished: boolean
		allFinalSlateFamilySupport: boolean
		evidenceDomainReconciled: boolean
		combinedDomainBoundVerified: boolean
		endpointAdmissionBoundVerified: boolean
		inheritedTopLevelBoundPreserved: boolean
		exactIntegratedWinnerObject: boolean
		exactIntegratedWinnerKey: boolean
		strictGradientAuthorityPreserved: boolean
		supportedGradientPathPreserved: boolean
		rawNeverWinner: boolean
	}>
}>

export type AlbumArtworkPaletteV2Phase3FinalCandidateResult =
	Omit<AlbumArtworkPaletteV2Result, "diagnostics"> & Readonly<{
		diagnostics: AlbumArtworkPaletteV2Result["diagnostics"] & Readonly<{
			phase3FinalCandidate: AlbumArtworkPaletteV2Phase3FinalCandidateDiagnostics
		}>
	}>

function buildAlbumArtworkPaletteV2Phase3FinalCandidate(details: IntegratedDetails) {
	const endpointProposal = proposeAlbumArtworkPaletteV2Phase3ComponentLocalEndpoint(details)
	const combinedDomainBound = evaluateAlbumArtworkPaletteV2Phase3FinalCandidateCombinedDomainBound({
		endpointDescriptorCount: endpointProposal.domain.componentLocalDescriptorCount,
		baselineMaterializedTreatmentCount: endpointProposal.domain.baselineMaterializedTreatmentCount,
		endpointSupplementalMaterializedTreatmentCount:
			endpointProposal.domain.supplementalOnlyMaterializedTreatmentCount,
		combinedEvaluationTreatmentCount: endpointProposal.selector.domain.materializedTreatmentCount,
		reportedCanonicalUnionTreatmentCount:
			endpointProposal.domain.evaluationMaterializedTreatmentCount,
	})
	if (!combinedDomainBound.verified) {
		throw new Error("Phase 3 final candidate endpoint combined evaluation domain exceeded or contradicted its bounds")
	}
	const rawProposal = proposeAlbumArtworkPaletteV2Phase3RawRelationSlateComplements({
		current: {
			winner: details.result.winner,
			slate: details.result.alternatives,
		},
		recoveryV2: details.recoveryV2,
		completeLineageEligibility: details.selection.completeLineage.eligibility,
	})
	const composition = composeAlbumArtworkPaletteV2Phase3FinalCandidate<
		AlbumArtworkPaletteV2Phase3ComponentLocalEndpointProposal,
		AlbumArtworkPaletteV2Phase3RawRelationSlateComplementProposal
	>({
		integrated: {
			winner: details.result.winner,
			slate: details.result.alternatives,
		},
		endpointProposals: endpointProposal.proposals,
		rawProposals: rawProposal.proposals,
	})
	const endpointAdmitted = composition.accepted.endpoint !== null
	const integratedDiagnostics = details.result.diagnostics.phase3IntegratedCandidate
	const domain = endpointAdmitted
		? {
			...integratedDiagnostics.domain,
			...endpointProposal.domain,
			materializedTreatmentCount: endpointProposal.domain.evaluationMaterializedTreatmentCount,
		}
		: integratedDiagnostics.domain
	const selector = endpointAdmitted ? endpointProposal.selector : integratedDiagnostics.selector
	const lineageEligibility = endpointAdmitted
		? endpointProposal.lineageEligibility
		: integratedDiagnostics.lineageEligibility
	const baseEvidence = details.common.evidence.augmentedNative
	const baseFamilyIds = new Set(baseEvidence.families.map(({ id }) => id))
	const endpointAdditiveFamilies = endpointAdmitted
		? endpointProposal.augmentedFamilies.filter(({ id }) => !baseFamilyIds.has(id))
		: []
	const selectedFamilyById = new Map(baseEvidence.families.map((family) => [family.id, family]))
	for (const family of endpointAdditiveFamilies) selectedFamilyById.set(family.id, family)
	const selectedFamilies = [...selectedFamilyById.values()]
	const retainedFamilyIds = [...new Set([
		...baseEvidence.retainedFamilyIds,
		...endpointAdditiveFamilies.map(({ id }) => id),
	])]
	const retainedFamilyIdSet = new Set(retainedFamilyIds)
	const publishedFamilies = selectedFamilies.filter(({ id }) => retainedFamilyIdSet.has(id))
	const publishedFamilyIds = publishedFamilies.map(({ id }) => id)
	const publishedFamilyIdSet = new Set(publishedFamilyIds)
	const selectedFields = endpointAdmitted
		? endpointProposal.augmentedFields.map(({ hypothesis }) => hypothesis)
		: details.sourcedFields.map(({ hypothesis }) => hypothesis)
	const fieldHypothesisFamilyIds = [...new Set(selectedFields.flatMap((hypothesis) => [
		hypothesis.backgroundFamilyId,
		...hypothesis.surfaceFamilyId === null ? [] : [hypothesis.surfaceFamilyId],
	]))].sort(compareAscii)
	const completeCandidateForegroundFamilyIds = selectorRoleFamilyIds(selector, "foreground")
	const completeCandidateAccentFamilyIds = selectorRoleFamilyIds(selector, "accent")
	const roles = slateRoleFamilyIds(composition.slate)
	const foregroundLaneFamilyIds = baseEvidence.lanes.find(({ name }) => name === "foreground")?.familyIds ?? []
	const signatureLaneFamilyIds = baseEvidence.lanes.find(({ name }) => name === "signature")?.familyIds ?? []
	const completeCandidateCount = endpointAdmitted
		? endpointProposal.domain.evaluationMaterializedTreatmentCount
		: details.materialization.materialized.length
	const candidateAvailability = {
		...details.result.diagnostics.candidateAvailability,
		foregroundLaneFamilyIds,
		signatureLaneFamilyIds,
		fieldHypothesisFamilyIds,
		completeCandidateForegroundFamilyIds,
		completeCandidateAccentFamilyIds,
		slateForegroundFamilyIds: roles.foreground,
		slateAccentFamilyIds: roles.accent,
	}
	const selectorKeys = new Set(selector.evaluations.map(({ key }) => key))
	const lineageKeys = new Set(lineageEligibility.candidates.map(({ key }) => key))
	const finalSlateCustody = composition.slate.map((treatment) => {
		const key = completeTreatmentKey(treatment)
		const integratedGradientProjection = key === integratedDiagnostics.gradientAuthority.winnerKey &&
			integratedDiagnostics.gradientAuthority.flatCustody !== null
		const endpointProposalCustody = composition.accepted.endpoint?.key === key &&
			composition.accepted.endpoint.custody.mechanism.key === key &&
			composition.accepted.endpoint.custody.expandedDomain.key === key
		const selectorEvaluation = selectorKeys.has(key)
		const lineageCandidate = lineageKeys.has(key)
		const familyRolesPublished = (["background", "surface", "foreground", "accent"] as const)
			.every((role) => treatment.familyRoles[role] === "generated" ||
				publishedFamilyIdSet.has(treatment.familyRoles[role]))
		const familySupport = (["background", "surface", "foreground", "accent"] as const)
			.every((role) => {
				const familyId = treatment.familyRoles[role]
				const color = treatment[role]
				return familyId === "generated" || (!color.generated && !("generated" in color.support) &&
					color.support.anchorFamilyId === familyId && publishedFamilyIdSet.has(familyId))
			})
		return {
			key,
			selectorEvaluation,
			lineageCandidate,
			integratedGradientProjection,
			endpointProposalCustody,
			familyRolesPublished,
			familySupport,
			represented: selectorEvaluation &&
				(lineageCandidate || integratedGradientProjection || endpointProposalCustody) &&
				familyRolesPublished && familySupport,
		}
	})
	const allAvailabilityFamilyIds = [
		...foregroundLaneFamilyIds,
		...signatureLaneFamilyIds,
		...fieldHypothesisFamilyIds,
		...completeCandidateForegroundFamilyIds,
		...completeCandidateAccentFamilyIds,
		...roles.foreground,
		...roles.accent,
	]
	const baseRetainedFamilyIds = new Set(baseEvidence.retainedFamilyIds)
	const evidenceChecks = {
		familyCountReconciled: selectedFamilies.length ===
			baseEvidence.families.length + endpointAdditiveFamilies.length,
		retainedFamilyCountReconciled: retainedFamilyIds.length ===
			baseRetainedFamilyIds.size + endpointAdditiveFamilies.length,
		publishedFamiliesExactlyRetained: publishedFamilyIds.length === retainedFamilyIds.length &&
			retainedFamilyIds.every((id) => publishedFamilyIdSet.has(id)),
		laneFamiliesPublished: [...foregroundLaneFamilyIds, ...signatureLaneFamilyIds]
			.every((id) => publishedFamilyIdSet.has(id)),
		fieldFamiliesPublished: fieldHypothesisFamilyIds.every((id) => publishedFamilyIdSet.has(id)),
		candidateAvailabilityFamiliesPublished: allAvailabilityFamilyIds
			.every((id) => publishedFamilyIdSet.has(id)),
		endpointDomainReconciled: !endpointAdmitted || (
			selectedFamilies.length === endpointProposal.augmentedFamilies.length &&
			selectedFields.length === endpointProposal.augmentedFields.length &&
			completeCandidateCount === endpointProposal.domain.evaluationMaterializedTreatmentCount &&
			selector.evaluations.length === endpointProposal.domain.evaluationMaterializedTreatmentCount
		),
	}
	const evidenceCustody = {
		baseFamilyCount: baseEvidence.families.length,
		endpointAdditiveFamilyIds: endpointAdditiveFamilies.map(({ id }) => id),
		retainedFamilyIds,
		publishedFamilyIds,
		fieldHypothesisIds: selectedFields.map(({ id }) => id),
		completeCandidateCount,
		checks: evidenceChecks,
	}
	const checks = {
		allFinalSlateKeysRepresented: finalSlateCustody.every(({ represented }) => represented),
		allFinalSlateFamilyRolesPublished: finalSlateCustody.every(({ familyRolesPublished }) =>
			familyRolesPublished),
		allFinalSlateFamilySupport: finalSlateCustody.every(({ familySupport }) => familySupport),
		evidenceDomainReconciled: Object.values(evidenceChecks).every(Boolean),
		combinedDomainBoundVerified: combinedDomainBound.verified,
		endpointAdmissionBoundVerified: composition.accepted.endpoint === null || combinedDomainBound.verified,
		inheritedTopLevelBoundPreserved: details.result.diagnostics.bounds.completeCandidates ===
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION.bounds
				.inheritedTopLevelCompleteCandidates.value,
		exactIntegratedWinnerObject: composition.winner === details.result.winner &&
			composition.slate[0] === details.result.winner,
		exactIntegratedWinnerKey: completeTreatmentKey(composition.winner) ===
			completeTreatmentKey(details.result.winner),
		strictGradientAuthorityPreserved: integratedDiagnostics.gradientAuthority ===
			details.gradientAuthority.diagnostics,
		supportedGradientPathPreserved: integratedDiagnostics.supportedGradientPath ===
			details.supportedGradientPath.diagnostics,
		rawNeverWinner: composition.accepted.raw === null ||
			composition.slate[0] !== composition.accepted.raw.treatment,
	}
	if (!Object.values(checks).every(Boolean)) {
		throw new Error("Phase 3 final candidate output omitted selected selector or lineage custody")
	}
	const { phase3IntegratedCandidate: _integratedRoot, ...baseDiagnostics } = details.result.diagnostics
	const result: AlbumArtworkPaletteV2Phase3FinalCandidateResult = {
		...details.result,
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT_ID,
		protocol: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION_ID,
		winner: composition.winner,
		alternatives: composition.slate,
		diagnostics: {
			...baseDiagnostics,
			familyCount: selectedFamilies.length,
			retainedFamilyCount: retainedFamilyIds.length,
			lanes: baseEvidence.lanes,
			laneRetention: baseEvidence.laneRetention,
			families: publishedFamilies,
			fieldHypotheses: selectedFields,
			completeCandidateCount,
			candidateAvailability,
			phase3FinalCandidate: {
				version: "album-artwork-palette-v2-phase-3-final-candidate-diagnostics-v1",
				configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION_ID,
				configuration: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION,
				winnerAuthority: "immutable-integrated-after-strict-supported-gradient-midpoint-authority",
				excludedWinnerAuthorities:
					ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION.excludedWinnerAuthorities,
				integrated: integratedDiagnostics,
				domain,
				selector,
				lineageEligibility,
				transitionRescue: details.selection.transitionRescue,
				custody: details.selection.custody,
				selection: {
					...details.selection.diagnostics,
					slateKeys: composition.diagnostics.finalKeys,
				},
				gradientAuthority: integratedDiagnostics.gradientAuthority,
				supportedGradientPath: integratedDiagnostics.supportedGradientPath,
				componentLocalEndpointProposal: endpointProposal,
				combinedDomainBound,
				rawRelationSlateComplementProposal: rawProposal,
				composition: composition.diagnostics,
				finalSlateCustody,
				evidenceCustody,
				checks,
			},
		},
	}
	return { result, endpointProposal, rawProposal, composition }
}

export function applyAlbumArtworkPaletteV2Phase3FinalCandidate(
	details: IntegratedDetails,
): AlbumArtworkPaletteV2Phase3FinalCandidateResult {
	return buildAlbumArtworkPaletteV2Phase3FinalCandidate(details).result
}

export function extractAlbumArtworkPaletteV2Phase3FinalCandidateDetails(image: RawImage) {
	const integratedDetails = extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails(image)
	return { integratedDetails, ...buildAlbumArtworkPaletteV2Phase3FinalCandidate(integratedDetails) }
}

export function extractAlbumArtworkPaletteV2Phase3FinalCandidate(
	image: RawImage,
): AlbumArtworkPaletteV2Phase3FinalCandidateResult {
	return extractAlbumArtworkPaletteV2Phase3FinalCandidateDetails(image).result
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT = Object.freeze({
	identity: Object.freeze({
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_CONFIGURATION_ID,
	}),
	extract: extractAlbumArtworkPaletteV2Phase3FinalCandidate,
})
