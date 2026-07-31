import { completeTreatmentKey } from "./palette-core.ts";

import type { EmergencyEligibility, IdentityObligation } from "./palette-core.ts";

import { filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain } from "./source-eligibility.ts";

import type { AlbumArtworkPaletteV2Phase3CompleteLineageMaterializedCandidate, AlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain } from "./source-eligibility.ts";

import { scorePaletteCandidates, WINNER_SCORING_POLICY } from "./winner-scoring.ts";

import type { GamutScoringInput } from "./winner-scoring.ts";

import type { WinnerScoring } from "./winner-scoring.ts";

import type { AlbumArtworkPaletteV2Phase3IdentityRoleRequirement } from "./base-scoring.ts";

export type SourceEligibleWinner<TCandidate extends AlbumArtworkPaletteV2Phase3CompleteLineageMaterializedCandidate> =
	Readonly<{
		winner: TCandidate
		eligibility: AlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain<TCandidate>
	}>

export function selectSourceEligibleWinner<
	TCandidate extends AlbumArtworkPaletteV2Phase3CompleteLineageMaterializedCandidate,
>(input: Readonly<{
	materialized: readonly TCandidate[]
	identityObligations?: readonly IdentityObligation[]
	identityRoleRequirements?: readonly AlbumArtworkPaletteV2Phase3IdentityRoleRequirement[]
	emergency?: EmergencyEligibility | null
	fullDomainSelection: WinnerScoring
	/** Must be the same input the full domain was ranked with; see the note at the call site. */
	gamutScoring?: GamutScoringInput | null
}>): SourceEligibleWinner<TCandidate> {
	const eligibility = filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain(
		input.materialized,
		{ emergency: input.emergency },
	)
	if (eligibility.eligibleCandidates.length === 0) throw new Error("No source-eligible palette candidate")
	const winnerSelection = scorePaletteCandidates(
		eligibility.eligibleCandidates.map(({ treatment }) => treatment),
		{
			obligations: input.identityObligations ?? [],
			roleRequirements: input.identityRoleRequirements ?? [],
		},
		input.gamutScoring ?? null,
	)
	const candidateByKey = new Map(eligibility.allCandidates.map((candidate) => [candidate.key, candidate]))
	const evaluationByKey = new Map(input.fullDomainSelection.evaluations.map((evaluation) =>
		[evaluation.key, evaluation]))
	const unrestrictedKey = completeTreatmentKey(input.fullDomainSelection.winner)
	const winnerKey = completeTreatmentKey(winnerSelection.winner)
	const winner = candidateByKey.get(winnerKey)
	const unrestrictedEvaluation = evaluationByKey.get(unrestrictedKey)
	const winnerEvaluation = evaluationByKey.get(winnerKey)
	if (!winner || !unrestrictedEvaluation || !winnerEvaluation) throw new Error("Winner evaluation is missing")
	if (unrestrictedEvaluation.qualityUtility - winnerEvaluation.qualityUtility >
		WINNER_SCORING_POLICY.maximumQualityLoss + 1e-12) {
		throw new Error("Source-eligible winner exceeds the quality envelope")
	}
	return { winner, eligibility }
}
