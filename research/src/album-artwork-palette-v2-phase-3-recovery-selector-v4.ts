import { completeTreatmentKey } from "./album-artwork-palette-v2.ts"
import type { CompletePaletteTreatment } from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"
import {
	selectAlbumArtworkPaletteV2Phase3RecoveryV3Custody,
} from "./album-artwork-palette-v2-phase-3-recovery-custody-v3.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoveryV3CustodyDiagnostics,
	AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate,
} from "./album-artwork-palette-v2-phase-3-recovery-custody-v3.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import { roleSpecificObligationCoverage } from "./album-artwork-palette-v2-phase-3-role-aware.ts"
import type {
	RoleSpecificIdentityObligation,
	RoleSpecificObligationCoverage,
} from "./album-artwork-palette-v2-phase-3-role-aware.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_ID =
	"album-artwork-palette-v2-phase-3-decisive-role-winner-rescue-v4" as const

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_POLICY = Object.freeze({
	maximumBaseQualityLoss: 0.12,
	maximumSlateTreatments: 8,
})

export type AlbumArtworkPaletteV2Phase3RecoveryV4CandidateDiagnostic = Readonly<{
	key: string
	baseline: boolean
	legalCompleteDomainCandidate: boolean
	sourceConnected: boolean
	sourceTypes: readonly AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType[]
	earnedNativeTransition: boolean
	baseQualityUtility: number
	baseQualityLoss: number
	withinQualityBound: boolean
	decisiveForegroundCoverage: number
	decisiveAccentCoverage: number
	decisiveCoverage: number
	totalObligationCoverage: number
	existingFamilyIdentity: number
	roleEvidence: number
	promotionEligible: boolean
	rejectionReasons: readonly string[]
}>

export type AlbumArtworkPaletteV2Phase3RecoveryV4SelectorDiagnostics = Readonly<{
	version: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_ID
	policy: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_POLICY
	baselineWinnerKey: string
	winnerKey: string
	promoted: boolean
	qualityBoundedCandidateCount: number
	promotionEligibleCandidateCount: number
	acceptedTransitionHypothesisIds: readonly string[]
	slateKeys: readonly string[]
	candidates: readonly AlbumArtworkPaletteV2Phase3RecoveryV4CandidateDiagnostic[]
	custody: AlbumArtworkPaletteV2Phase3RecoveryV3CustodyDiagnostics
}>

export type AlbumArtworkPaletteV2Phase3RecoveryV4Selection = Readonly<{
	winner: CompletePaletteTreatment
	slate: readonly CompletePaletteTreatment[]
	diagnostics: AlbumArtworkPaletteV2Phase3RecoveryV4SelectorDiagnostics
}>

type RescueCandidate = Readonly<{
	evaluation: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation
	coverage: RoleSpecificObligationCoverage
	diagnostic: AlbumArtworkPaletteV2Phase3RecoveryV4CandidateDiagnostic
}>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function compareDescending(first: number, second: number): number {
	return second - first
}

function sourceConnectedTreatment(treatment: CompletePaletteTreatment): boolean {
	return (["background", "surface", "foreground", "accent"] as const).every((role) => {
		const familyId = treatment.familyRoles[role]
		const color = treatment[role]
		return familyId !== "generated" && !color.generated && !("generated" in color.support) &&
			color.support.anchorFamilyId === familyId && color.support.regionIds.length > 0
	})
}

function consistentDescriptor(
	candidate: AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate,
	descriptor: AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate["descriptors"][number],
): boolean {
	return completeTreatmentKey(descriptor.treatment) === candidate.key &&
		descriptor.treatment.sourceFieldHypothesisId === descriptor.fieldHypothesis.id &&
		descriptor.lineage.fieldHypothesisId === descriptor.fieldHypothesis.id
}

function compareCandidates(first: RescueCandidate, second: RescueCandidate): number {
	return compareDescending(first.diagnostic.decisiveCoverage, second.diagnostic.decisiveCoverage) ||
		compareDescending(Number(first.diagnostic.earnedNativeTransition), Number(second.diagnostic.earnedNativeTransition)) ||
		compareDescending(first.diagnostic.totalObligationCoverage, second.diagnostic.totalObligationCoverage) ||
		compareDescending(first.diagnostic.existingFamilyIdentity, second.diagnostic.existingFamilyIdentity) ||
		compareDescending(first.diagnostic.roleEvidence, second.diagnostic.roleEvidence) ||
		compareDescending(first.diagnostic.baseQualityUtility, second.diagnostic.baseQualityUtility) ||
		compareAscii(first.evaluation.key, second.evaluation.key)
}

export function selectAlbumArtworkPaletteV2Phase3RecoveryV4(
	recoveryV2: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection,
	materialized: readonly AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate[],
	roleObligations: readonly RoleSpecificIdentityObligation[],
	acceptedTransitionHypothesisIds: readonly string[],
): AlbumArtworkPaletteV2Phase3RecoveryV4Selection {
	const materializedByKey = new Map<string, AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate>()
	for (const candidate of materialized) {
		if (materializedByKey.has(candidate.key)) throw new Error("Recovery v4 received a duplicate materialized key")
		materializedByKey.set(candidate.key, candidate)
	}
	const baselineKey = completeTreatmentKey(recoveryV2.winner)
	const baselineEvaluation = recoveryV2.evaluations.find(({ key }) => key === baselineKey)
	if (!baselineEvaluation) throw new Error("Recovery v4 omitted the recovery-v2 winner evaluation")
	const acceptedTransitions = new Set(acceptedTransitionHypothesisIds)
	const baselineCoverage = roleSpecificObligationCoverage(recoveryV2.winner, roleObligations)
	const baselineDecisiveCoverage = baselineCoverage.foregroundCoveredCount + baselineCoverage.accentCoveredCount
	const candidates = recoveryV2.evaluations.map((evaluation): RescueCandidate => {
		const candidate = materializedByKey.get(evaluation.key)
		if (!candidate) throw new Error("Recovery v4 omitted a recovery-v2 materialized candidate")
		const consistent = candidate.key === completeTreatmentKey(candidate.treatment) &&
			candidate.key === completeTreatmentKey(evaluation.treatment) && candidate.descriptors.length > 0 &&
			candidate.descriptors.every((descriptor) => consistentDescriptor(candidate, descriptor))
		const connectedDescriptors = candidate.descriptors.filter((descriptor) =>
			consistentDescriptor(candidate, descriptor) && descriptor.lineage.sourceConnected &&
			descriptor.lineage.representatives.every(({ sourceConnected }) => sourceConnected))
		const sourceTypes = [...new Set(connectedDescriptors.map(({ sourceType }) => sourceType))].sort(compareAscii)
		const earnedNativeTransition = evaluation.gradientStatus === "earned-rendered" &&
			evaluation.treatment.gradient && connectedDescriptors.some((descriptor) =>
				descriptor.sourceType === "native-field-transition" &&
				acceptedTransitions.has(descriptor.fieldHypothesis.id) &&
				descriptor.fieldHypothesis.gradientEvidence !== null)
		const eligibleSource = connectedDescriptors.some(({ sourceType }) => sourceType !== "native-field-transition") ||
			earnedNativeTransition
		const sourceConnected = sourceConnectedTreatment(evaluation.treatment) && connectedDescriptors.length > 0
		const coverage = roleSpecificObligationCoverage(evaluation.treatment, roleObligations)
		const decisiveCoverage = coverage.foregroundCoveredCount + coverage.accentCoveredCount
		const baseQualityLoss = Math.max(0, baselineEvaluation.qualityUtility - evaluation.qualityUtility)
		const withinQualityBound = evaluation.qualityUtility + 1e-12 >= baselineEvaluation.qualityUtility -
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_POLICY.maximumBaseQualityLoss
		const baseline = evaluation.key === baselineKey
		const promotionEligible = !baseline && consistent && sourceConnected && eligibleSource && withinQualityBound &&
			decisiveCoverage > baselineDecisiveCoverage
		const rejectionReasons = [
			...consistent ? [] : ["not a consistent complete-domain candidate"],
			...sourceConnected ? [] : ["candidate lacks complete source-connected lineage"],
			...eligibleSource ? [] : ["native transition was not earned by an accepted hypothesis"],
			...withinQualityBound ? [] : ["base quality loss exceeds the unchanged bound"],
			...decisiveCoverage > baselineDecisiveCoverage
				? []
				: ["candidate does not add decisive foreground or accent coverage"],
		]
		return {
			evaluation,
			coverage,
			diagnostic: {
				key: evaluation.key,
				baseline,
				legalCompleteDomainCandidate: consistent,
				sourceConnected,
				sourceTypes,
				earnedNativeTransition,
				baseQualityUtility: evaluation.qualityUtility,
				baseQualityLoss,
				withinQualityBound,
				decisiveForegroundCoverage: coverage.foregroundCoveredCount,
				decisiveAccentCoverage: coverage.accentCoveredCount,
				decisiveCoverage,
				totalObligationCoverage: coverage.coveredCount,
				existingFamilyIdentity: evaluation.identityCoverage,
				roleEvidence: coverage.roleEvidence,
				promotionEligible,
				rejectionReasons: baseline ? [] : rejectionReasons,
			},
		}
	})
	const winnerCandidate = candidates.filter(({ diagnostic }) => diagnostic.promotionEligible)
		.sort(compareCandidates)[0]
	const winner = winnerCandidate?.evaluation.treatment ?? recoveryV2.winner
	const winnerKey = completeTreatmentKey(winner)
	const custody = selectAlbumArtworkPaletteV2Phase3RecoveryV3Custody(
		recoveryV2,
		materialized,
		roleObligations,
	)
	const slate = [
		winner,
		...custody.slate.filter((treatment) => completeTreatmentKey(treatment) !== winnerKey),
	].slice(0, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_POLICY.maximumSlateTreatments)
	if (completeTreatmentKey(slate[0]) !== winnerKey) {
		throw new Error("Recovery v4 did not return a winner-first slate")
	}
	return {
		winner,
		slate,
		diagnostics: {
			version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_ID,
			policy: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V4_POLICY,
			baselineWinnerKey: baselineKey,
			winnerKey,
			promoted: winnerKey !== baselineKey,
			qualityBoundedCandidateCount: candidates.filter(({ diagnostic }) => diagnostic.withinQualityBound).length,
			promotionEligibleCandidateCount: candidates.filter(({ diagnostic }) => diagnostic.promotionEligible).length,
			acceptedTransitionHypothesisIds: [...acceptedTransitions].sort(compareAscii),
			slateKeys: slate.map(completeTreatmentKey),
			candidates: candidates.map(({ diagnostic }) => diagnostic)
				.sort((first, second) => compareAscii(first.key, second.key)),
			custody: custody.diagnostics,
		},
	}
}
