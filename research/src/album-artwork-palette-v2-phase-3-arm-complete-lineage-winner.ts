import {
	completeTreatmentKey,
	extractAlbumArtworkPaletteV2074Details,
} from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Result,
	EmergencyEligibility,
	IdentityObligation,
} from "./album-artwork-palette-v2.ts"
import {
	filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain,
} from "./album-artwork-palette-v2-phase-3-arm-complete-lineage-winner-eligibility.ts"
import type {
	AlbumArtworkPaletteV2Phase3CompleteLineageMaterializedCandidate,
	AlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain,
} from "./album-artwork-palette-v2-phase-3-arm-complete-lineage-winner-eligibility.ts"
import {
	buildAlbumArtworkPaletteV2Phase3CommonBase,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"
import type {
	AlbumArtworkPaletteV2Phase3CommonBaseDiagnostics,
} from "./album-artwork-palette-v2-phase-3-common-base.ts"
import {
	materializeAlbumArtworkPaletteV2Phase3Descriptors,
} from "./album-artwork-palette-v2-phase-3-materialization.ts"
import type {
	AlbumArtworkPaletteV2Phase3MaterializationDiagnostics,
} from "./album-artwork-palette-v2-phase-3-materialization.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY,
	selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation,
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type { RawImage } from "./types.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_ATTEMPT_ID =
	"phase-3-arm-complete-lineage-winner" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_CONFIGURATION_ID =
	"common-complete-domain-recovery-v2-complete-lineage-winner-v1" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_NO_ELIGIBLE_ERROR =
	"Complete-lineage winner domain contains no eligible treatment" as const
export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_ENVELOPE_ERROR =
	"Complete-lineage winner replacement exceeds the 0.12 quality envelope" as const

type MaterializedCandidate = AlbumArtworkPaletteV2Phase3CompleteLineageMaterializedCandidate

export type AlbumArtworkPaletteV2Phase3CompleteLineageCustodyEntry = Readonly<{
	key: string
	index: number
	winnerEligible: boolean
	qualityUtility: number
	qualityLossFromWinner: number
	reasons: readonly ("winner-first" | "full-domain-custody" | "eligible-domain-custody")[]
}>

export type AlbumArtworkPaletteV2Phase3CompleteLineageWinnerSelection<
	TCandidate extends MaterializedCandidate = MaterializedCandidate,
> = Readonly<{
	winner: TCandidate
	slate: readonly TCandidate[]
	eligibility: AlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain<TCandidate>
	winnerSelection: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection
	fullDomainCustodySelection: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection
	diagnostics: Readonly<{
		unrestrictedWinnerKey: string
		winnerKey: string
		replacementQualityLoss: number
		maximumQualityLoss: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.maximumSlateQualityLoss
		fullDomainCandidateCount: number
		winnerDomainCandidateCount: number
		custody: readonly AlbumArtworkPaletteV2Phase3CompleteLineageCustodyEntry[]
	}>
}>

export type AlbumArtworkPaletteV2Phase3CompleteLineageWinnerDiagnostics = Readonly<{
	version: "album-artwork-palette-v2-phase-3-arm-complete-lineage-winner-diagnostics-v1"
	configurationId: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_CONFIGURATION_ID
	winnerSelectionAuthority: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID
	commonBase: AlbumArtworkPaletteV2Phase3CommonBaseDiagnostics
	materialization: AlbumArtworkPaletteV2Phase3MaterializationDiagnostics
	eligibility: AlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain["diagnostics"]
	winnerSelector: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation
	fullDomainCustodySelector: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Explanation
	selection: AlbumArtworkPaletteV2Phase3CompleteLineageWinnerSelection["diagnostics"]
}>

export type AlbumArtworkPaletteV2Phase3CompleteLineageWinnerResult =
	Omit<AlbumArtworkPaletteV2Result, "diagnostics"> & Readonly<{
		diagnostics: AlbumArtworkPaletteV2Result["diagnostics"] & Readonly<{
			phase3ArmCompleteLineageWinner: AlbumArtworkPaletteV2Phase3CompleteLineageWinnerDiagnostics
		}>
	}>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

export function selectAlbumArtworkPaletteV2Phase3CompleteLineageWinner<
	TCandidate extends MaterializedCandidate,
>(input: Readonly<{
	materialized: readonly TCandidate[]
	identityObligations?: readonly IdentityObligation[]
	emergency?: EmergencyEligibility | null
}>): AlbumArtworkPaletteV2Phase3CompleteLineageWinnerSelection<TCandidate> {
	const eligibility = filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain(
		input.materialized,
		{ emergency: input.emergency },
	)
	if (eligibility.eligibleCandidates.length === 0) {
		throw new Error(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_NO_ELIGIBLE_ERROR)
	}
	const identity = { obligations: input.identityObligations ?? [] }
	const fullDomainCustodySelection = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(
		eligibility.allCandidates.map(({ treatment }) => treatment),
		identity,
	)
	const winnerSelection = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(
		eligibility.eligibleCandidates.map(({ treatment }) => treatment),
		identity,
	)
	const candidateByKey = new Map(eligibility.allCandidates.map((candidate) => [candidate.key, candidate]))
	const eligibilityByKey = new Map(eligibility.diagnostics.candidates.map((candidate) => [candidate.key, candidate]))
	const evaluationByKey = new Map(fullDomainCustodySelection.evaluations.map((evaluation) =>
		[evaluation.key, evaluation]))
	const unrestrictedWinnerKey = completeTreatmentKey(fullDomainCustodySelection.winner)
	const winnerKey = completeTreatmentKey(winnerSelection.winner)
	const winner = candidateByKey.get(winnerKey)
	const winnerEvaluation = evaluationByKey.get(winnerKey)
	const unrestrictedWinnerEvaluation = evaluationByKey.get(unrestrictedWinnerKey)
	if (!winner || !winnerEvaluation || !unrestrictedWinnerEvaluation) {
		throw new Error("Complete-lineage winner selection omitted a materialized evaluation")
	}
	const replacementQualityLoss = Math.max(0,
		unrestrictedWinnerEvaluation.qualityUtility - winnerEvaluation.qualityUtility)
	if (replacementQualityLoss >
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.maximumSlateQualityLoss + 1e-12) {
		throw new Error(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_ENVELOPE_ERROR)
	}

	const selectedKeys = new Set<string>([winnerKey])
	const reasonsByKey = new Map<string, Set<AlbumArtworkPaletteV2Phase3CompleteLineageCustodyEntry["reasons"][number]>>([
		[winnerKey, new Set(["winner-first"])],
	])
	const add = (
		treatment: typeof winnerSelection.winner,
		reason: "full-domain-custody" | "eligible-domain-custody",
	): void => {
		if (selectedKeys.size >= ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.maximumSlateTreatments) return
		const key = completeTreatmentKey(treatment)
		const evaluation = evaluationByKey.get(key)
		if (!evaluation || evaluation.qualityUtility + 1e-12 < winnerEvaluation.qualityUtility -
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.maximumSlateQualityLoss) return
		selectedKeys.add(key)
		const reasons = reasonsByKey.get(key) ?? new Set()
		reasons.add(reason)
		reasonsByKey.set(key, reasons)
	}
	for (const treatment of fullDomainCustodySelection.slate) add(treatment, "full-domain-custody")
	for (const treatment of winnerSelection.slate) add(treatment, "eligible-domain-custody")
	const selectedCandidates = [
		winner,
		...[...selectedKeys]
			.filter((key) => key !== winnerKey)
			.map((key) => candidateByKey.get(key)!)
			.sort((first, second) => {
				const firstEvaluation = evaluationByKey.get(first.key)!
				const secondEvaluation = evaluationByKey.get(second.key)!
				return secondEvaluation.qualityUtility - firstEvaluation.qualityUtility ||
					compareAscii(first.key, second.key)
			}),
	]
	if (selectedCandidates.length >
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.maximumSlateTreatments ||
		selectedCandidates[0].key !== winnerKey) {
		throw new Error("Complete-lineage public custody violated its winner-first bound")
	}
	const custody = selectedCandidates.map((candidate, index):
		AlbumArtworkPaletteV2Phase3CompleteLineageCustodyEntry => {
		const evaluation = evaluationByKey.get(candidate.key)!
		return {
			key: candidate.key,
			index,
			winnerEligible: eligibilityByKey.get(candidate.key)!.eligible,
			qualityUtility: evaluation.qualityUtility,
			qualityLossFromWinner: Math.max(0, winnerEvaluation.qualityUtility - evaluation.qualityUtility),
			reasons: [...(reasonsByKey.get(candidate.key) ?? [])].sort(compareAscii),
		}
	})
	return {
		winner,
		slate: selectedCandidates,
		eligibility,
		winnerSelection,
		fullDomainCustodySelection,
		diagnostics: {
			unrestrictedWinnerKey,
			winnerKey,
			replacementQualityLoss,
			maximumQualityLoss:
				ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.maximumSlateQualityLoss,
			fullDomainCandidateCount: eligibility.allCandidates.length,
			winnerDomainCandidateCount: eligibility.eligibleCandidates.length,
			custody,
		},
	}
}

export function extractAlbumArtworkPaletteV2Phase3CompleteLineageWinner(
	image: RawImage,
): AlbumArtworkPaletteV2Phase3CompleteLineageWinnerResult {
	const closedDetails = extractAlbumArtworkPaletteV2074Details(image)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(image, {
		closed074Details: closedDetails,
		materializeCurrentV1: (descriptors, obligations) =>
			materializeAlbumArtworkPaletteV2Phase3Descriptors(descriptors, obligations),
	})
	const materialization = common.currentV1MaterializedDomain
	if (!materialization) throw new Error("Complete-lineage arm omitted the materialized complete domain")
	const selection = selectAlbumArtworkPaletteV2Phase3CompleteLineageWinner({
		materialized: materialization.materialized,
		identityObligations: common.seedAvailability.identityObligations,
		emergency: closedDetails.result.diagnostics.emergency,
	})
	const selected = selection.slate.map(({ treatment }) => treatment)
	const baseDiagnostics = closedDetails.result.diagnostics
	const slateForegroundFamilyIds = [...new Set(selected.map(({ familyRoles }) => familyRoles.foreground)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii)
	const slateAccentFamilyIds = [...new Set(selected.filter(({ collapse }) => !collapse.accent)
		.map(({ familyRoles }) => familyRoles.accent)
		.filter((familyId): familyId is string => familyId !== "generated"))].sort(compareAscii)
	return {
		version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_ATTEMPT_ID,
		protocol: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_CONFIGURATION_ID,
		width: image.width,
		height: image.height,
		winner: selection.winner.treatment,
		alternatives: selected,
		diagnostics: {
			...baseDiagnostics,
			fieldHypotheses: common.fieldHypotheses.map(({ hypothesis }) => hypothesis),
			gradientFits: common.evidence.gradientFits,
			completeCandidateCount: materialization.materialized.length,
			candidateAvailability: {
				...baseDiagnostics.candidateAvailability,
				slateForegroundFamilyIds,
				slateAccentFamilyIds,
			},
			phase3ArmCompleteLineageWinner: {
				version: "album-artwork-palette-v2-phase-3-arm-complete-lineage-winner-diagnostics-v1",
				configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_CONFIGURATION_ID,
				winnerSelectionAuthority: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_ID,
				commonBase: common.diagnostics,
				materialization: materialization.diagnostics,
				eligibility: selection.eligibility.diagnostics,
				winnerSelector: selection.winnerSelection.explanation,
				fullDomainCustodySelector: selection.fullDomainCustodySelection.explanation,
				selection: selection.diagnostics,
			},
		},
	}
}

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_ATTEMPT = Object.freeze({
	identity: Object.freeze({
		attemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_ATTEMPT_ID,
		configurationId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_COMPLETE_LINEAGE_WINNER_CONFIGURATION_ID,
	}),
	extract: extractAlbumArtworkPaletteV2Phase3CompleteLineageWinner,
})
