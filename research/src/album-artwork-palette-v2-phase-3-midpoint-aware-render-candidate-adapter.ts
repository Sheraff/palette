import { completeTreatmentKey } from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Result,
	CompletePaletteTreatment,
} from "./album-artwork-palette-v2.ts"
import {
	evaluateAlbumArtworkPaletteV2Phase3ArmMidpointAwareRenderCandidate,
} from "./album-artwork-palette-v2-phase-3-arm-midpoint-aware-render-candidate.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_ID,
} from "./album-artwork-palette-v2-phase-3-field-render-candidate.ts"
import type {
	AlbumArtworkPaletteV2Phase3FieldRenderCandidateEvaluation,
	AlbumArtworkPaletteV2Phase3FieldRenderKind,
} from "./album-artwork-palette-v2-phase-3-field-render-candidate.ts"
import {
	extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails,
} from "./album-artwork-palette-v2-phase-3-integrated-candidate.ts"
import type {
	AlbumArtworkPaletteV2Phase3IntegratedCandidateResult,
} from "./album-artwork-palette-v2-phase-3-integrated-candidate.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_CAPACITY,
	materializeAlbumArtworkPaletteV2Phase3Descriptors,
} from "./album-artwork-palette-v2-phase-3-materialization.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_PATH_BOUND_RENDER_MATERIALIZATION_POLICY,
	materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates,
} from "./album-artwork-palette-v2-phase-3-path-bound-render-materialization.ts"
import type {
	AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate,
	AlbumArtworkPaletteV2Phase3PathBoundRenderMaterialization,
} from "./album-artwork-palette-v2-phase-3-path-bound-render-materialization.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import {
	selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type { RawImage } from "./types.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_ATTEMPT_ID =
	"phase-3-midpoint-aware-render-candidate" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_CONFIGURATION_ID =
	"full-domain-path-bound-render-preselection-v3" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_PROJECTION_ID =
	"album-artwork-palette-v2-phase-3-path-bound-render-projection-v3" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_DIAGNOSTICS_ID =
	"album-artwork-palette-v2-phase-3-midpoint-aware-render-candidate-diagnostics-v3" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_BASELINE_ERROR =
	"Path-bound render attempt requires one authoritative unrestricted recovery evaluation" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CORE_ERROR =
	"Path-bound render attempt requires the complete v2 field-render evaluation" as const

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_POLICY = Object.freeze({
	maximumSlateTreatments: 8,
	baselineAuthority: "replayed-factorized-full-domain-recovery-v2-winner" as const,
	candidateAuthority: "path-bound-complete-render-materialization" as const,
	selectionAuthority: "materializer-selected-render-key" as const,
	publicStateDerivation: "after-complete-render-preselection" as const,
})

export type AlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidateNoOpReason =
	"no-core-field-render-bundles" |
	"no-path-bound-complete-render-candidates" |
	"no-quality-eligible-path-bound-render-candidate" |
	"path-bound-materializer-returned-no-selection"

type IntegratedDetails = ReturnType<typeof extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails>

export type AlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidateApplicationInput = Readonly<{
	integratedDetails: IntegratedDetails
	fieldRenderCandidates: AlbumArtworkPaletteV2Phase3FieldRenderCandidateEvaluation
}>

export type AlbumArtworkPaletteV2Phase3MidpointAwareRenderBaselineDomainVerification = Readonly<{
	expectedFullEvaluationCount: number
	actualFullEvaluationCount: number
	explanationEvaluationCount: number
	selectorMaterializedTreatmentCount: number
	selectorUniqueTreatmentCount: number
	materializationDiagnosticTreatmentCount: number
	materializedArrayCount: number
	custodyArrayCount: number
	factorizedPolicyCapacity: number
	uniqueCanonicalTreatmentCount: number
	truncatedCanonicalTreatmentCount: number
	allCountsFinite: boolean
	factorizedCapMetadataConsistent: boolean
	countMetadataConsistent: boolean
	evaluationCountMatchesExpected: boolean
	uniqueCanonicalEvaluationKeys: boolean
	uniqueMaterializationKeys: boolean
	uniqueCustodyKeys: boolean
	evaluationKeysMatchMaterialization: boolean
	custodyKeysMatchMaterialization: boolean
	evaluationTreatmentsMatchMaterialization: boolean
	custodyTreatmentsMatchMaterialization: boolean
	custodyDescriptorsMatchMaterialization: boolean
	explanationKeysMatchEvaluations: boolean
	explanationNumericsMatchEvaluations: boolean
	winnerMetadataMatches: boolean
	uniqueAuthoritativeWinner: boolean
	winnerTreatmentMatchesDomainCustody: boolean
	materializationReplayMatches: boolean
	recoveryReplayMatches: boolean
	verified: boolean
}>

export type AlbumArtworkPaletteV2Phase3MidpointAwareRenderProjectionDiagnostics = Readonly<{
	version: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_PROJECTION_ID
	renderKey: string
	sourcePublicTreatmentKey: string
	outputPublicTreatmentKey: string
	renderKind: AlbumArtworkPaletteV2Phase3FieldRenderKind
	exactEndpoints: AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate[
		"pathLineage"
	]["endpoints"]
	exactMidpoint: AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate[
		"pathLineage"
	]["midpoint"]
	pathLineage: AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate["pathLineage"]
	ordinaryCompleteLineage:
		AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate["ordinaryCompleteLineage"]
	numericsCustody: AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate["numericsCustody"]
	qualityCustody: Readonly<{
		source: "selected-path-bound-recovery-evaluation"
		evaluation: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation
		recomputedAfterRenderSelection: false
	}>
	contrastCustody: Readonly<{
		source: AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate[
			"numericsCustody"
		]["completeTreatmentSource"]
		contrast: CompletePaletteTreatment["contrast"]
		recomputedAfterRenderSelection: false
		threeStopAPCARecomputed: false
	}>
}>

export type AlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidateDiagnostics = Readonly<{
	version: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_DIAGNOSTICS_ID
	configurationId:
		typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_CONFIGURATION_ID
	policy: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_POLICY
	applicable: boolean
	noOpReason: AlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidateNoOpReason | null
	authoritativeBaseline: Readonly<{
		selectionDiagnosticKey: string
		recoveryWinnerKey: string
		matchingFullEvaluationCount: 1
		evaluation: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation
		domainVerification:
			AlbumArtworkPaletteV2Phase3MidpointAwareRenderBaselineDomainVerification
	}>
	coreEvaluation: AlbumArtworkPaletteV2Phase3FieldRenderCandidateEvaluation
	pathBoundMaterialization: AlbumArtworkPaletteV2Phase3PathBoundRenderMaterialization
	selectedRenderKey: string | null
	selectedPublicTreatmentKey: string | null
	outputPublicTreatmentKey: string
	selectedRenderKind: AlbumArtworkPaletteV2Phase3FieldRenderKind | null
	selectedRenderFidelity:
		AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate["render"]["fidelity"] | null
	selectedAuthority: Readonly<{
		renderKey: string
		publicTreatmentKey: string
		renderKind: AlbumArtworkPaletteV2Phase3FieldRenderKind
		renderId: string
		fidelity: AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate["render"]["fidelity"]
		pathLineage: AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate["pathLineage"]
		ordinaryCompleteLineage:
			AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate["ordinaryCompleteLineage"]
		numericsCustody: AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate["numericsCustody"]
		recoveryEvaluation: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation
		qualityLossFromBaseline: number
		qualityFloor: number
		withinQualityBound: boolean
		roleBindingKey: string
		roleCustody: AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate["roleCustody"]
	}> | null
	numericsModeMatchesSelectedBase: boolean
	selector: Readonly<{
		baselineDomainContext: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation
		selectedRecoveryEvaluation: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation | null
	}>
	qualityLossFromBaseline: number | null
	qualityFloor: number
	sourceToOutputCustody: Readonly<{
		renderKey: string
		sourcePublicTreatmentKey: string
		outputPublicTreatmentKey: string
		roleBindingKey: string
		roleCustody: AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate["roleCustody"]
		pathLineage: AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate["pathLineage"]
	}> | null
	renderProjection: AlbumArtworkPaletteV2Phase3MidpointAwareRenderProjectionDiagnostics | null
	currentIntegratedWinnerKey: string
	currentIntegratedSlateKeys: readonly string[]
	outputSlateKeys: readonly string[]
	removedStalePublicKeys: readonly string[]
	checks: Readonly<{
		materializationBounds:
			AlbumArtworkPaletteV2Phase3PathBoundRenderMaterialization["diagnostics"]["bounds"]
		winnerFirst: boolean
		slateWithinBound: boolean
		uniquePublicKeys: boolean
		stalePublicVariantsRemoved: boolean
		selectedRenderKeyRetained: boolean
		winnerMatchesSelectedPublicTreatment: boolean
		numericsModeMatchesSelectedBase: boolean
		threeStopAPCANotRecomputed: boolean
	}>
	controlIntegratedResult: AlbumArtworkPaletteV2Phase3IntegratedCandidateResult
}>

export type AlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidateResult =
	Omit<AlbumArtworkPaletteV2Result, "diagnostics"> & Readonly<{
		diagnostics: AlbumArtworkPaletteV2Result["diagnostics"] & Readonly<{
			phase3MidpointAwareRenderCandidate:
				AlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidateDiagnostics
		}>
	}>

function finiteCount(value: number): boolean {
	return Number.isSafeInteger(value) && value >= 0
}

function exactStructure(first: unknown, second: unknown): boolean {
	if (Object.is(first, second)) return true
	if (typeof first !== "object" || first === null ||
		typeof second !== "object" || second === null) return false
	if (Array.isArray(first) || Array.isArray(second)) {
		return Array.isArray(first) && Array.isArray(second) && first.length === second.length &&
			first.every((value, index) => exactStructure(value, second[index]))
	}
	const firstRecord = first as Record<string, unknown>
	const secondRecord = second as Record<string, unknown>
	const firstKeys = Object.keys(firstRecord).sort()
	const secondKeys = Object.keys(secondRecord).sort()
	return firstKeys.length === secondKeys.length &&
		firstKeys.every((key, index) => key === secondKeys[index] &&
			exactStructure(firstRecord[key], secondRecord[key]))
}

function numericLeaves(
	value: unknown,
	path: string,
	leaves: Map<string, number>,
): boolean {
	if (typeof value === "number") {
		if (!Number.isFinite(value)) return false
		leaves.set(path, value)
		return true
	}
	if (Array.isArray(value)) {
		return value.every((entry, index) => numericLeaves(entry, `${path}[${index}]`, leaves))
	}
	if (typeof value === "object" && value !== null) {
		return Object.entries(value).every(([key, entry]) =>
			numericLeaves(entry, path.length === 0 ? key : `${path}.${key}`, leaves))
	}
	return true
}

function exactFiniteNumericCorrespondence(
	evaluation: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
	explanationEvaluation: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation["evaluations"][number],
): boolean {
	const { treatment: _treatment, ...evaluationDiagnostic } = evaluation
	const evaluationLeaves = new Map<string, number>()
	const explanationLeaves = new Map<string, number>()
	if (!numericLeaves(evaluationDiagnostic, "", evaluationLeaves) ||
		!numericLeaves(explanationEvaluation, "", explanationLeaves) ||
		evaluationLeaves.size !== explanationLeaves.size) return false
	return [...evaluationLeaves].every(([path, value]) =>
		explanationLeaves.has(path) && Object.is(explanationLeaves.get(path), value))
}

function authoritativeBaselineEvaluation(
	details: IntegratedDetails,
): Readonly<{
	evaluation: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation
	domainVerification: AlbumArtworkPaletteV2Phase3MidpointAwareRenderBaselineDomainVerification
}> {
	const selectorDomain = details.recoveryV2.explanation.domain
	const materializationDiagnostics = details.materialization.diagnostics
	const expectedFullEvaluationCount = selectorDomain.uniqueTreatmentCount
	const actualFullEvaluationCount = details.recoveryV2.evaluations.length
	const explanationEvaluationCount = details.recoveryV2.explanation.evaluations.length
	const materializedArrayCount = details.materialization.materialized.length
	const custodyArrayCount = details.custodyMaterialized.length
	const paretoEvaluationKeys = details.recoveryV2.evaluations
		.filter(({ paretoMember }) => paretoMember).map(({ key }) => key)
	const explanationParetoKeySet = new Set(details.recoveryV2.explanation.paretoKeys)
	const allCounts = [
		selectorDomain.materializedTreatmentCount,
		selectorDomain.uniqueTreatmentCount,
		selectorDomain.duplicateTreatmentCount,
		selectorDomain.paretoTreatmentCount,
		selectorDomain.dominatedTreatmentCount,
		selectorDomain.earnedGradientClaimCount,
		materializationDiagnostics.inputDescriptorCount,
		materializationDiagnostics.uniqueDescriptorCount,
		materializationDiagnostics.duplicateDescriptorCount,
		materializationDiagnostics.uniqueCanonicalTreatmentCount,
		materializationDiagnostics.duplicateCanonicalTreatmentCount,
		materializationDiagnostics.capacity,
		materializationDiagnostics.materializedTreatmentCount,
		materializationDiagnostics.truncatedCanonicalTreatmentCount,
		...materializationDiagnostics.strata.flatMap((stratum) => [
			stratum.availableCanonicalTreatmentCount,
			stratum.materializedCanonicalTreatmentCount,
		]),
	]
	const allCountsFinite = allCounts.every(finiteCount)
	const factorizedCapMetadataConsistent = allCountsFinite &&
		materializationDiagnostics.capacity ===
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_CAPACITY &&
		materializationDiagnostics.uniqueCanonicalTreatmentCount ===
			materializationDiagnostics.materializedTreatmentCount +
			materializationDiagnostics.truncatedCanonicalTreatmentCount &&
		materializationDiagnostics.materializedTreatmentCount <= materializationDiagnostics.capacity &&
		materializationDiagnostics.capacityReached ===
			(materializationDiagnostics.materializedTreatmentCount >= materializationDiagnostics.capacity) &&
		(materializationDiagnostics.truncatedCanonicalTreatmentCount === 0 ||
			materializationDiagnostics.materializedTreatmentCount === materializationDiagnostics.capacity)
	const countMetadataConsistent = allCountsFinite &&
		selectorDomain.materializedTreatmentCount === selectorDomain.uniqueTreatmentCount +
			selectorDomain.duplicateTreatmentCount &&
		selectorDomain.uniqueTreatmentCount === selectorDomain.paretoTreatmentCount +
			selectorDomain.dominatedTreatmentCount &&
		selectorDomain.paretoTreatmentCount === details.recoveryV2.explanation.paretoKeys.length &&
		selectorDomain.paretoTreatmentCount === explanationParetoKeySet.size &&
		selectorDomain.paretoTreatmentCount === paretoEvaluationKeys.length &&
		paretoEvaluationKeys.every((key) => explanationParetoKeySet.has(key)) &&
		selectorDomain.dominatedTreatmentCount === details.recoveryV2.evaluations.length -
			paretoEvaluationKeys.length &&
		selectorDomain.earnedGradientClaimCount <= selectorDomain.uniqueTreatmentCount &&
		materializationDiagnostics.inputDescriptorCount ===
			materializationDiagnostics.uniqueDescriptorCount +
			materializationDiagnostics.duplicateDescriptorCount &&
		materializationDiagnostics.uniqueDescriptorCount ===
			materializationDiagnostics.uniqueCanonicalTreatmentCount +
			materializationDiagnostics.duplicateCanonicalTreatmentCount &&
		factorizedCapMetadataConsistent &&
		materializationDiagnostics.strata.every((stratum) =>
			stratum.materializedCanonicalTreatmentCount <= stratum.availableCanonicalTreatmentCount &&
			stratum.availableCanonicalTreatmentCount <=
				materializationDiagnostics.uniqueCanonicalTreatmentCount) &&
		selectorDomain.materializedTreatmentCount === expectedFullEvaluationCount &&
		expectedFullEvaluationCount === materializationDiagnostics.materializedTreatmentCount &&
		expectedFullEvaluationCount === materializedArrayCount &&
		expectedFullEvaluationCount === custodyArrayCount
	const evaluationCountMatchesExpected = actualFullEvaluationCount === expectedFullEvaluationCount &&
		explanationEvaluationCount === expectedFullEvaluationCount
	const evaluationKeys = details.recoveryV2.evaluations.map(({ key }) => key)
	const evaluationKeySet = new Set(evaluationKeys)
	const uniqueCanonicalEvaluationKeys = evaluationKeySet.size === actualFullEvaluationCount &&
		details.recoveryV2.evaluations.every(({ key, treatment }) =>
			key === completeTreatmentKey(treatment))
	const materializedKeys = details.materialization.materialized.map(({ key }) => key)
	const materializedKeySet = new Set(materializedKeys)
	const uniqueMaterializationKeys = materializedKeySet.size === materializedKeys.length &&
		details.materialization.materialized.every(({ key, treatment }) =>
			key === completeTreatmentKey(treatment))
	const custodyKeys = details.custodyMaterialized.map(({ key }) => key)
	const custodyKeySet = new Set(custodyKeys)
	const uniqueCustodyKeys = custodyKeySet.size === custodyKeys.length &&
		details.custodyMaterialized.every(({ key, treatment }) =>
			key === completeTreatmentKey(treatment))
	const evaluationKeysMatchMaterialization = uniqueMaterializationKeys &&
		materializedKeySet.size === evaluationKeySet.size &&
		[...materializedKeySet].every((key) => evaluationKeySet.has(key))
	const custodyKeysMatchMaterialization = uniqueCustodyKeys &&
		custodyKeySet.size === materializedKeySet.size &&
		[...custodyKeySet].every((key) => materializedKeySet.has(key))
	const materializedByKey = new Map(details.materialization.materialized.map((candidate) =>
		[candidate.key, candidate.treatment]))
	const materializedCandidateByKey = new Map(details.materialization.materialized.map((candidate) =>
		[candidate.key, candidate]))
	const custodyByKey = new Map(details.custodyMaterialized.map((candidate) =>
		[candidate.key, candidate.treatment]))
	const evaluationTreatmentsMatchMaterialization = evaluationKeysMatchMaterialization &&
		details.recoveryV2.evaluations.every(({ key, treatment }) =>
			exactStructure(treatment, materializedByKey.get(key)))
	const custodyTreatmentsMatchMaterialization = custodyKeysMatchMaterialization &&
		details.custodyMaterialized.every(({ key, treatment }) =>
			exactStructure(treatment, materializedByKey.get(key)))
	const custodyDescriptorsMatchMaterialization = custodyKeysMatchMaterialization &&
		details.custodyMaterialized.every(({ key, descriptors }) =>
			exactStructure(descriptors, materializedCandidateByKey.get(key)?.descriptors))
	const explanationByKey = new Map(details.recoveryV2.explanation.evaluations.map((evaluation) =>
		[evaluation.key, evaluation]))
	const explanationKeysMatchEvaluations = explanationByKey.size === explanationEvaluationCount &&
		explanationByKey.size === evaluationKeySet.size &&
		[...evaluationKeySet].every((key) => explanationByKey.has(key))
	const explanationNumericsMatchEvaluations = explanationKeysMatchEvaluations &&
		details.recoveryV2.evaluations.every((evaluation) =>
			exactFiniteNumericCorrespondence(evaluation, explanationByKey.get(evaluation.key)!))
	const selectionDiagnosticKey = details.selection.diagnostics.unrestrictedWinnerKey
	const recoveryWinnerKey = completeTreatmentKey(details.recoveryV2.winner)
	const matching = details.recoveryV2.evaluations.filter(({ key }) => key === selectionDiagnosticKey)
	const winnerEvaluation = matching[0]
	const explanationWinner = details.recoveryV2.explanation.winner
	const winnerMetadataMatches = selectionDiagnosticKey === recoveryWinnerKey &&
		explanationWinner.key === selectionDiagnosticKey &&
		winnerEvaluation !== undefined &&
		explanationWinner.gradientStatus === winnerEvaluation.gradientStatus &&
		Number.isFinite(explanationWinner.qualityUtility) &&
		explanationWinner.qualityUtility === winnerEvaluation.qualityUtility &&
		Number.isFinite(explanationWinner.identityCoverage) &&
		explanationWinner.identityCoverage === winnerEvaluation.identityCoverage &&
		Number.isFinite(explanationWinner.identityGain) &&
		explanationWinner.identityGain === winnerEvaluation.identityGain &&
		Number.isFinite(explanationWinner.relationUtility) &&
		explanationWinner.relationUtility === winnerEvaluation.relationUtility
	const uniqueAuthoritativeWinner = matching.length === 1 && winnerEvaluation !== undefined &&
		winnerEvaluation.key === recoveryWinnerKey &&
		completeTreatmentKey(winnerEvaluation.treatment) === recoveryWinnerKey
	const winnerTreatmentMatchesDomainCustody = uniqueAuthoritativeWinner &&
		exactStructure(details.recoveryV2.winner, winnerEvaluation.treatment) &&
		exactStructure(details.recoveryV2.winner, materializedByKey.get(recoveryWinnerKey)) &&
		exactStructure(details.recoveryV2.winner, custodyByKey.get(recoveryWinnerKey))
	const integratedDomainVerified = countMetadataConsistent && evaluationCountMatchesExpected &&
		uniqueCanonicalEvaluationKeys && uniqueMaterializationKeys && uniqueCustodyKeys &&
		evaluationKeysMatchMaterialization && custodyKeysMatchMaterialization &&
		evaluationTreatmentsMatchMaterialization && custodyTreatmentsMatchMaterialization &&
		custodyDescriptorsMatchMaterialization &&
		explanationKeysMatchEvaluations && explanationNumericsMatchEvaluations &&
		winnerMetadataMatches && uniqueAuthoritativeWinner && winnerTreatmentMatchesDomainCustody
	if (!integratedDomainVerified || winnerEvaluation === undefined) {
		throw new Error(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_BASELINE_ERROR)
	}
	let replayedMaterialization: ReturnType<typeof materializeAlbumArtworkPaletteV2Phase3Descriptors>
	let replayedRecovery: ReturnType<typeof selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2>
	try {
		replayedMaterialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
			details.logicalDescriptors,
			details.common.seedAvailability.identityObligations,
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MATERIALIZATION_CAPACITY,
		)
		replayedRecovery = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(
			replayedMaterialization.materialized.map(({ treatment }) => treatment),
			{ obligations: details.common.seedAvailability.identityObligations },
		)
	} catch {
		throw new Error(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_BASELINE_ERROR)
	}
	const materializationReplayMatches = exactStructure(replayedMaterialization, details.materialization)
	const replayedWinnerKey = completeTreatmentKey(replayedRecovery.winner)
	const replayedWinnerEvaluations = replayedRecovery.evaluations.filter(({ key }) =>
		key === selectionDiagnosticKey)
	const replayedWinnerEvaluation = replayedWinnerEvaluations[0]
	const recoveryReplayMatches = exactStructure(replayedRecovery, details.recoveryV2) &&
		replayedWinnerKey === selectionDiagnosticKey && replayedWinnerEvaluations.length === 1 &&
		replayedWinnerEvaluation !== undefined
	const verified = integratedDomainVerified && materializationReplayMatches && recoveryReplayMatches
	const domainVerification: AlbumArtworkPaletteV2Phase3MidpointAwareRenderBaselineDomainVerification = {
		expectedFullEvaluationCount,
		actualFullEvaluationCount,
		explanationEvaluationCount,
		selectorMaterializedTreatmentCount: selectorDomain.materializedTreatmentCount,
		selectorUniqueTreatmentCount: selectorDomain.uniqueTreatmentCount,
		materializationDiagnosticTreatmentCount: materializationDiagnostics.materializedTreatmentCount,
		materializedArrayCount,
		custodyArrayCount,
		factorizedPolicyCapacity: materializationDiagnostics.capacity,
		uniqueCanonicalTreatmentCount: materializationDiagnostics.uniqueCanonicalTreatmentCount,
		truncatedCanonicalTreatmentCount: materializationDiagnostics.truncatedCanonicalTreatmentCount,
		allCountsFinite,
		factorizedCapMetadataConsistent,
		countMetadataConsistent,
		evaluationCountMatchesExpected,
		uniqueCanonicalEvaluationKeys,
		uniqueMaterializationKeys,
		uniqueCustodyKeys,
		evaluationKeysMatchMaterialization,
		custodyKeysMatchMaterialization,
		evaluationTreatmentsMatchMaterialization,
		custodyTreatmentsMatchMaterialization,
		custodyDescriptorsMatchMaterialization,
		explanationKeysMatchEvaluations,
		explanationNumericsMatchEvaluations,
		winnerMetadataMatches,
		uniqueAuthoritativeWinner,
		winnerTreatmentMatchesDomainCustody,
		materializationReplayMatches,
		recoveryReplayMatches,
		verified,
	}
	if (!verified || replayedWinnerEvaluation === undefined) {
		throw new Error(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_BASELINE_ERROR)
	}
	return { evaluation: replayedWinnerEvaluation, domainVerification }
}

function assertCompleteV2CoreEvaluation(
	evaluation: AlbumArtworkPaletteV2Phase3FieldRenderCandidateEvaluation,
): void {
	const candidateCount = evaluation.bundles.reduce((sum, { candidates }) => sum + candidates.length, 0)
	const eligiblePathCount = evaluation.bundles.filter(({ eligible }) => eligible).length
	if (evaluation.identity.version !== 2 ||
		evaluation.identity.evaluatorId !== ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_ID ||
		evaluation.diagnostics.identity.version !== 2 ||
		evaluation.diagnostics.identity.evaluatorId !==
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FIELD_RENDER_CANDIDATE_ID ||
		evaluation.summary.inputPathCount !== evaluation.bundles.length ||
		evaluation.summary.eligiblePathCount !== eligiblePathCount ||
		evaluation.summary.candidateCount !== candidateCount) {
		throw new Error(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CORE_ERROR)
	}
}

function assertNumericsMode(
	selected: AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate,
): void {
	const treatment = selected.treatment
	const numerics = selected.numericsCustody
	const evaluationMatches = selected.recoveryEvaluation.treatment === treatment &&
		completeTreatmentKey(treatment) === selected.publicTreatmentKey
	const modeMatches = selected.render.kind === "flat"
		? !treatment.gradient && treatment.fieldTreatment === "separate-flat-fields" &&
			treatment.gradientEvidence === null &&
			numerics.completeTreatmentSource === "independently-generated-flat-endpoint-treatment" &&
			numerics.contrastAndQualityIndependentlyGeneratedForThisRender
		: treatment.gradient && treatment.fieldTreatment === "gradient-field" &&
			treatment.gradientEvidence !== null && (selected.render.kind === "supported-two-stop"
			? numerics.completeTreatmentSource === "independently-generated-endpoint-gradient-treatment" &&
				numerics.contrastAndQualityIndependentlyGeneratedForThisRender
			: numerics.completeTreatmentSource === "reused-endpoint-gradient-treatment-for-three-stop-render" &&
				!numerics.contrastAndQualityIndependentlyGeneratedForThisRender)
	if (!evaluationMatches || !modeMatches || numerics.threeStopAPCARecomputed !== false) {
		throw new Error("Path-bound selected treatment numerics do not match its render mode")
	}
}

function projectSelectedTreatment(
	selected: AlbumArtworkPaletteV2Phase3PathBoundCompleteRenderCandidate,
): CompletePaletteTreatment {
	assertNumericsMode(selected)
	const gradient = selected.render.kind !== "flat"
	const sourceGradient = selected.treatment.gradientEvidence
	const treatment: CompletePaletteTreatment = {
		...selected.treatment,
		gradient,
		fieldTreatment: gradient ? "gradient-field" : "separate-flat-fields",
		gradientEvidence: gradient && sourceGradient !== null ? {
			...sourceGradient,
			topology: selected.pathLineage.topology,
			direction: selected.pathLineage.direction,
			fieldDomainId: selected.pathLineage.fieldDomainId,
			supportingFamilyIds: [
				selected.render.endpoints[0].familyId,
				selected.render.endpoints[1].familyId,
			],
			supportingEndpointHexes: [
				selected.render.endpoints[0].exactColor.hex,
				selected.render.endpoints[1].exactColor.hex,
			],
		} : null,
	}
	if (treatment.contrast !== selected.treatment.contrast ||
		treatment.scores !== selected.treatment.scores ||
		completeTreatmentKey(treatment) !== selected.publicTreatmentKey) {
		throw new Error("Path-bound public projection changed selected complete-treatment numerics or identity")
	}
	return treatment
}

function roleHexKey(treatment: CompletePaletteTreatment): string {
	return [
		treatment.background.hex,
		treatment.surface.hex,
		treatment.foreground.hex,
		treatment.accent.hex,
	].map((hex) => hex.toLowerCase()).join(":")
}

function winnerFirstSlate(
	winner: CompletePaletteTreatment,
	currentWinner: CompletePaletteTreatment,
	current: readonly CompletePaletteTreatment[],
): Readonly<{ slate: CompletePaletteTreatment[]; removedStalePublicKeys: string[] }> {
	const winnerKey = completeTreatmentKey(winner)
	const winnerRoles = roleHexKey(winner)
	const currentWinnerKey = completeTreatmentKey(currentWinner)
	const selected = [winner]
	const selectedKeys = new Set([winnerKey])
	const removedStalePublicKeys = new Set<string>()
	for (const treatment of current) {
		const key = completeTreatmentKey(treatment)
		const stale = key === currentWinnerKey || key === winnerKey || roleHexKey(treatment) === winnerRoles
		if (stale) {
			removedStalePublicKeys.add(key)
			continue
		}
		if (selectedKeys.has(key)) continue
		if (selected.length >=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_POLICY
				.maximumSlateTreatments) break
		selected.push(treatment)
		selectedKeys.add(key)
	}
	return { slate: selected, removedStalePublicKeys: [...removedStalePublicKeys] }
}

function noOpReason(
	core: AlbumArtworkPaletteV2Phase3FieldRenderCandidateEvaluation,
	materialization: AlbumArtworkPaletteV2Phase3PathBoundRenderMaterialization,
): AlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidateNoOpReason {
	if (core.bundles.length === 0) return "no-core-field-render-bundles"
	if (materialization.candidates.length === 0) return "no-path-bound-complete-render-candidates"
	if (materialization.eligibleCandidates.length === 0) {
		return "no-quality-eligible-path-bound-render-candidate"
	}
	return "path-bound-materializer-returned-no-selection"
}

function slateRoleFamilyIds(
	slate: readonly CompletePaletteTreatment[],
): Readonly<{ foreground: readonly string[]; accent: readonly string[] }> {
	return {
		foreground: [...new Set(slate.map(({ familyRoles }) => familyRoles.foreground)
			.filter((familyId): familyId is string => familyId !== "generated"))].sort(),
		accent: [...new Set(slate.filter(({ collapse }) => !collapse.accent)
			.map(({ familyRoles }) => familyRoles.accent)
			.filter((familyId): familyId is string => familyId !== "generated"))].sort(),
	}
}

export function applyAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidate(
	input: AlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidateApplicationInput,
): AlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidateResult {
	const details = input.integratedDetails
	assertCompleteV2CoreEvaluation(input.fieldRenderCandidates)
	const baselineAuthority = authoritativeBaselineEvaluation(details)
	const baseline = baselineAuthority.evaluation
	const materialization = materializeAlbumArtworkPaletteV2Phase3PathBoundRenderCandidates({
		sourceEvidence: details.common.evidence.native,
		treatmentEvidence: details.common.evidence.augmentedNative,
		renderBundles: input.fieldRenderCandidates.bundles,
		identityObligations: details.common.seedAvailability.identityObligations,
		baselineUnrestrictedWinnerEvaluation: baseline,
	})
	const selected = materialization.selected
	const applicable = selected !== null
	const winner = selected === null ? details.result.winner : projectSelectedTreatment(selected)
	const slateWork = selected === null
		? { slate: details.result.alternatives, removedStalePublicKeys: [] }
		: winnerFirstSlate(winner, details.result.winner, details.result.alternatives)
	const slate = slateWork.slate
	const outputPublicTreatmentKey = completeTreatmentKey(winner)
	const currentIntegratedWinnerKey = completeTreatmentKey(details.result.winner)
	const currentIntegratedSlateKeys = details.result.alternatives.map(completeTreatmentKey)
	const outputSlateKeys = slate.map(completeTreatmentKey)
	const outputKeySet = new Set(outputSlateKeys)
	const staleRoleVariantsRemain = selected !== null && slate.slice(1).some((treatment) =>
		roleHexKey(treatment) === roleHexKey(winner))
	const renderProjection: AlbumArtworkPaletteV2Phase3MidpointAwareRenderProjectionDiagnostics | null =
		selected === null ? null : {
			version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_PROJECTION_ID,
			renderKey: selected.renderKey,
			sourcePublicTreatmentKey: selected.publicTreatmentKey,
			outputPublicTreatmentKey,
			renderKind: selected.render.kind,
			exactEndpoints: selected.pathLineage.endpoints,
			exactMidpoint: selected.pathLineage.midpoint,
			pathLineage: selected.pathLineage,
			ordinaryCompleteLineage: selected.ordinaryCompleteLineage,
			numericsCustody: selected.numericsCustody,
			qualityCustody: {
				source: "selected-path-bound-recovery-evaluation",
				evaluation: selected.recoveryEvaluation,
				recomputedAfterRenderSelection: false,
			},
			contrastCustody: {
				source: selected.numericsCustody.completeTreatmentSource,
				contrast: selected.treatment.contrast,
				recomputedAfterRenderSelection: false,
				threeStopAPCARecomputed: false,
			},
		}
	const selectedAuthority = selected === null ? null : {
		renderKey: selected.renderKey,
		publicTreatmentKey: selected.publicTreatmentKey,
		renderKind: selected.render.kind,
		renderId: selected.render.id,
		fidelity: selected.render.fidelity,
		pathLineage: selected.pathLineage,
		ordinaryCompleteLineage: selected.ordinaryCompleteLineage,
		numericsCustody: selected.numericsCustody,
		recoveryEvaluation: selected.recoveryEvaluation,
		qualityLossFromBaseline: selected.qualityLossFromBaseline,
		qualityFloor: selected.qualityFloor,
		withinQualityBound: selected.withinQualityBound,
		roleBindingKey: selected.roleBindingKey,
		roleCustody: selected.roleCustody,
	}
	const checks = {
		materializationBounds: materialization.diagnostics.bounds,
		winnerFirst: outputSlateKeys[0] === outputPublicTreatmentKey,
		slateWithinBound: slate.length <=
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_POLICY
				.maximumSlateTreatments,
		uniquePublicKeys: outputKeySet.size === outputSlateKeys.length,
		stalePublicVariantsRemoved: !staleRoleVariantsRemain,
		selectedRenderKeyRetained: selected === null ||
			materialization.diagnostics.selectedRenderKey === selected.renderKey,
		winnerMatchesSelectedPublicTreatment: selected === null ||
			outputPublicTreatmentKey === selected.publicTreatmentKey,
		numericsModeMatchesSelectedBase: selected === null ||
			(winner.contrast === selected.treatment.contrast && winner.scores === selected.treatment.scores),
		threeStopAPCANotRecomputed: selected === null ||
			selected.numericsCustody.threeStopAPCARecomputed === false,
	}
	if (Object.values(checks).some((value) => value === false) ||
		Object.values(checks.materializationBounds).some((value) => !value)) {
		throw new Error("Path-bound render attempt violated public authority or slate bounds")
	}
	const diagnostics: AlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidateDiagnostics = {
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_DIAGNOSTICS_ID,
		configurationId:
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_CONFIGURATION_ID,
		policy: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_POLICY,
		applicable,
		noOpReason: selected === null ? noOpReason(input.fieldRenderCandidates, materialization) : null,
		authoritativeBaseline: {
			selectionDiagnosticKey: details.selection.diagnostics.unrestrictedWinnerKey,
			recoveryWinnerKey: completeTreatmentKey(details.recoveryV2.winner),
			matchingFullEvaluationCount: 1,
			evaluation: baseline,
			domainVerification: baselineAuthority.domainVerification,
		},
		coreEvaluation: input.fieldRenderCandidates,
		pathBoundMaterialization: materialization,
		selectedRenderKey: selected?.renderKey ?? null,
		selectedPublicTreatmentKey: selected?.publicTreatmentKey ?? null,
		outputPublicTreatmentKey,
		selectedRenderKind: selected?.render.kind ?? null,
		selectedRenderFidelity: selected?.render.fidelity ?? null,
		selectedAuthority,
		numericsModeMatchesSelectedBase: checks.numericsModeMatchesSelectedBase,
		selector: {
			baselineDomainContext: details.recoveryV2.explanation,
			selectedRecoveryEvaluation: selected?.recoveryEvaluation ?? null,
		},
		qualityLossFromBaseline: selected?.qualityLossFromBaseline ?? null,
		qualityFloor: materialization.diagnostics.qualityFloor,
		sourceToOutputCustody: selected === null ? null : {
			renderKey: selected.renderKey,
			sourcePublicTreatmentKey: selected.publicTreatmentKey,
			outputPublicTreatmentKey,
			roleBindingKey: selected.roleBindingKey,
			roleCustody: selected.roleCustody,
			pathLineage: selected.pathLineage,
		},
		renderProjection,
		currentIntegratedWinnerKey,
		currentIntegratedSlateKeys,
		outputSlateKeys,
		removedStalePublicKeys: slateWork.removedStalePublicKeys,
		checks,
		controlIntegratedResult: details.result,
	}
	const roles = slateRoleFamilyIds(slate)
	const selectedFieldHypothesis = selected?.ordinaryCompleteLineage.descriptor.fieldHypothesis ?? null
	const fieldHypotheses = selectedFieldHypothesis === null || details.common.fieldHypotheses.some(({ hypothesis }) =>
		hypothesis.id === selectedFieldHypothesis.id)
		? details.common.fieldHypotheses.map(({ hypothesis }) => hypothesis)
		: [...details.common.fieldHypotheses.map(({ hypothesis }) => hypothesis), selectedFieldHypothesis]
	const baseDiagnostics = details.closedDetails.result.diagnostics
	return {
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_ATTEMPT_ID,
		protocol: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_CONFIGURATION_ID,
		width: details.result.width,
		height: details.result.height,
		winner,
		alternatives: slate,
		diagnostics: {
			...baseDiagnostics,
			families: details.common.evidence.augmentedNative.families,
			fieldHypotheses,
			gradientFits: details.common.evidence.gradientFits,
			completeCandidateCount: materialization.candidates.length,
			candidateAvailability: {
				...baseDiagnostics.candidateAvailability,
				slateForegroundFamilyIds: roles.foreground,
				slateAccentFamilyIds: roles.accent,
			},
			phase3MidpointAwareRenderCandidate: diagnostics,
		},
	}
}

export function extractAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidate(
	image: RawImage,
): AlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidateResult {
	const integratedDetails = extractAlbumArtworkPaletteV2Phase3IntegratedCandidateDetails(image)
	const fieldRender = evaluateAlbumArtworkPaletteV2Phase3ArmMidpointAwareRenderCandidate(
		integratedDetails.common.evidence.native,
	)
	return applyAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidate({
		integratedDetails,
		fieldRenderCandidates: fieldRender.candidates,
	})
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_ATTEMPT =
	Object.freeze({
		identity: Object.freeze({
			attemptId:
				ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_ATTEMPT_ID,
			configurationId:
				ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_CONFIGURATION_ID,
		}),
		extract: extractAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidate,
	})
