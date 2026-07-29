import {
	completeTreatmentKey,
} from "./album-artwork-palette-v2.ts"
import type {
	CompletePaletteTreatment,
	PaletteRoleColor,
} from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain,
} from "./album-artwork-palette-v2-phase-3-arm-complete-lineage-winner-eligibility.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_RAW_RELATION_SLATE_COMPLEMENT_ID =
	"album-artwork-palette-v2-phase-3-raw-relation-slate-complement-v1" as const

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_RAW_RELATION_SLATE_COMPLEMENT_POLICY = Object.freeze({
	maximumQualityLoss:
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.maximumSlateQualityLoss,
	maximumSlateTreatments:
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.maximumSlateTreatments,
	nearColorDistance:
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.nearColorDistance,
})

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_RAW_RELATION_SLATE_COMPLEMENT_FORMULAS = Object.freeze({
	eligibility:
		"omitted ordinary recovery-v2 slate member; Pareto member; within 0.12 quality utility of the recovery-v2 winner; ordinary complete source-connected lineage; raw relation utility strictly greater than the recovery-v2 winner; not the current winner",
	ordering:
		"descending raw relation utility, quality utility, and identity gain, then ascending canonical and structural keys",
	custody:
		"current winner, at most one complement, then existing custody order without canonical duplicates or visually-near treatments, capped at 8; no eligible complement is an exact slate no-op",
	winnerAuthority: "the supplied current winner is immutable",
})

export type AlbumArtworkPaletteV2Phase3RawRelationSlateComplementWinnerSlate = Readonly<{
	winner: CompletePaletteTreatment
	slate: readonly CompletePaletteTreatment[]
}>

export type AlbumArtworkPaletteV2Phase3RawRelationSlateComplementLineageEligibility = Readonly<{
	diagnostics: Pick<
		AlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain["diagnostics"],
		"candidates"
	>
}>

export type AlbumArtworkPaletteV2Phase3RawRelationSlateComplementInput = Readonly<{
	current: AlbumArtworkPaletteV2Phase3RawRelationSlateComplementWinnerSlate
	recoveryV2: Pick<
		AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection,
		"winner" | "slate" | "evaluations"
	>
	completeLineageEligibility: AlbumArtworkPaletteV2Phase3RawRelationSlateComplementLineageEligibility
}>

export type AlbumArtworkPaletteV2Phase3RawRelationSlateComplementRejectionReason =
	"present-in-current-custody" |
	"not-pareto-member" |
	"outside-quality-bound" |
	"lacks-ordinary-complete-source-lineage" |
	"raw-relation-not-strictly-superior" |
	"is-current-winner"

export type AlbumArtworkPaletteV2Phase3RawRelationSlateComplementCandidateDiagnostic = Readonly<{
	key: string
	qualityUtility: number
	qualityLossFromRecoveryV2Winner: number
	relationUtility: number
	rawRelationUtilityGain: number
	identityGain: number
	paretoMember: boolean
	ordinaryCompleteSourceLineage: boolean
	eligible: boolean
	rejectionReasons: readonly AlbumArtworkPaletteV2Phase3RawRelationSlateComplementRejectionReason[]
}>

export type AlbumArtworkPaletteV2Phase3RawRelationSlateComplementDiagnostics = Readonly<{
	version: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_RAW_RELATION_SLATE_COMPLEMENT_ID
	policy: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_RAW_RELATION_SLATE_COMPLEMENT_POLICY
	formulas: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_RAW_RELATION_SLATE_COMPLEMENT_FORMULAS
	domain: Readonly<{
		recoveryV2EvaluationCount: number
		ordinarySlateTreatmentCount: number
		currentCustodyTreatmentCount: number
		ordinaryLineageEligibleTreatmentCount: number
		eligibleComplementCount: number
	}>
	baseline: Readonly<{
		currentWinnerKey: string
		recoveryV2WinnerKey: string
		recoveryV2WinnerQualityUtility: number
		recoveryV2WinnerRelationUtility: number
		currentCustodyKeys: readonly string[]
	}>
	candidates: readonly AlbumArtworkPaletteV2Phase3RawRelationSlateComplementCandidateDiagnostic[]
	eligibleComplementKeysInOrder: readonly string[]
	outcome: Readonly<{
		exactNoOp: boolean
		reservedComplementKey: string | null
		winnerKey: string
		winnerAuthorityChanged: false
		slateKeys: readonly string[]
		displacedCurrentCustodyKeys: readonly string[]
	}>
}>

export type AlbumArtworkPaletteV2Phase3RawRelationSlateComplementSelection = Readonly<{
	winner: CompletePaletteTreatment
	slate: readonly CompletePaletteTreatment[]
	diagnostics: AlbumArtworkPaletteV2Phase3RawRelationSlateComplementDiagnostics
}>

type EvaluatedComplement = Readonly<{
	evaluation: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation
	diagnostic: AlbumArtworkPaletteV2Phase3RawRelationSlateComplementCandidateDiagnostic
}>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function compareDescending(first: number, second: number): number {
	return second - first
}

function compareComplements(first: EvaluatedComplement, second: EvaluatedComplement): number {
	return compareDescending(first.evaluation.relationUtility, second.evaluation.relationUtility) ||
		compareDescending(first.evaluation.qualityUtility, second.evaluation.qualityUtility) ||
		compareDescending(first.evaluation.identityGain, second.evaluation.identityGain) ||
		compareAscii(first.evaluation.key, second.evaluation.key) ||
		compareAscii(first.evaluation.structuralKey, second.evaluation.structuralKey)
}

function colorDistance(first: PaletteRoleColor, second: PaletteRoleColor): number {
	return Math.hypot(
		first.oklab[0] - second.oklab[0],
		first.oklab[1] - second.oklab[1],
		first.oklab[2] - second.oklab[2],
	)
}

function gradientRenderingKey(treatment: CompletePaletteTreatment): string {
	return treatment.gradient
		? `${treatment.gradientEvidence?.topology ?? "unsupported"}:${treatment.gradientEvidence?.direction ?? "unsupported"}`
		: "flat"
}

function visuallyNear(first: CompletePaletteTreatment, second: CompletePaletteTreatment): boolean {
	if (gradientRenderingKey(first) !== gradientRenderingKey(second)) return false
	return (["background", "surface", "foreground", "accent"] as const).every((role) =>
		colorDistance(first[role], second[role]) <
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_RAW_RELATION_SLATE_COMPLEMENT_POLICY.nearColorDistance)
}

function validateAndIndexEvaluations(
	recoveryV2: AlbumArtworkPaletteV2Phase3RawRelationSlateComplementInput["recoveryV2"],
): ReadonlyMap<string, AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation> {
	const evaluationsByKey = new Map<string, AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation>()
	for (const evaluation of recoveryV2.evaluations) {
		if (evaluation.key !== completeTreatmentKey(evaluation.treatment)) {
			throw new Error("Raw-relation slate complement received a non-canonical recovery-v2 evaluation key")
		}
		if (evaluationsByKey.has(evaluation.key)) {
			throw new Error("Raw-relation slate complement received duplicate recovery-v2 evaluation keys")
		}
		if (!Number.isFinite(evaluation.qualityUtility) || !Number.isFinite(evaluation.relationUtility) ||
			!Number.isFinite(evaluation.identityGain)) {
			throw new TypeError("Raw-relation slate complement received a non-finite recovery-v2 utility")
		}
		evaluationsByKey.set(evaluation.key, evaluation)
	}
	return evaluationsByKey
}

export function reserveAlbumArtworkPaletteV2Phase3RawRelationSlateComplement(
	input: AlbumArtworkPaletteV2Phase3RawRelationSlateComplementInput,
): AlbumArtworkPaletteV2Phase3RawRelationSlateComplementSelection {
	const maximumSlateTreatments =
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_RAW_RELATION_SLATE_COMPLEMENT_POLICY.maximumSlateTreatments
	if (input.current.slate.length === 0 || input.current.slate.length > maximumSlateTreatments) {
		throw new RangeError("Raw-relation slate complement requires current custody containing 1 to 8 treatments")
	}
	const currentWinnerKey = completeTreatmentKey(input.current.winner)
	if (completeTreatmentKey(input.current.slate[0]) !== currentWinnerKey) {
		throw new Error("Raw-relation slate complement requires winner-first current custody")
	}
	const evaluationsByKey = validateAndIndexEvaluations(input.recoveryV2)
	const recoveryV2WinnerKey = completeTreatmentKey(input.recoveryV2.winner)
	const recoveryV2Winner = evaluationsByKey.get(recoveryV2WinnerKey)
	if (!recoveryV2Winner) {
		throw new Error("Raw-relation slate complement omitted the recovery-v2 winner evaluation")
	}
	const ordinarySlateEvaluationsByKey = new Map<
		string,
		AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation
	>()
	for (const treatment of input.recoveryV2.slate) {
		const key = completeTreatmentKey(treatment)
		const evaluation = evaluationsByKey.get(key)
		if (!evaluation) {
			throw new Error("Raw-relation slate complement omitted an ordinary slate evaluation")
		}
		ordinarySlateEvaluationsByKey.set(key, evaluation)
	}
	const lineageByKey = new Map(input.completeLineageEligibility.diagnostics.candidates.map((candidate) =>
		[candidate.key, candidate]))
	if (lineageByKey.size !== input.completeLineageEligibility.diagnostics.candidates.length) {
		throw new Error("Raw-relation slate complement received duplicate complete-lineage eligibility keys")
	}
	const currentCustodyKeys = input.current.slate.map(completeTreatmentKey)
	const currentCustodyKeySet = new Set(currentCustodyKeys)
	const qualityFloor = recoveryV2Winner.qualityUtility -
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_RAW_RELATION_SLATE_COMPLEMENT_POLICY.maximumQualityLoss
	const evaluated = [...ordinarySlateEvaluationsByKey.values()].map((evaluation): EvaluatedComplement => {
		const lineage = lineageByKey.get(evaluation.key)
		const ordinaryCompleteSourceLineage = lineage?.eligible === true &&
			lineage.basis === "ordinary-complete-source-lineage" &&
			lineage.ordinaryEligibleDescriptorCount > 0
		const rejectionReasons: AlbumArtworkPaletteV2Phase3RawRelationSlateComplementRejectionReason[] = []
		if (currentCustodyKeySet.has(evaluation.key)) rejectionReasons.push("present-in-current-custody")
		if (!evaluation.paretoMember) rejectionReasons.push("not-pareto-member")
		if (evaluation.qualityUtility + 1e-12 < qualityFloor) rejectionReasons.push("outside-quality-bound")
		if (!ordinaryCompleteSourceLineage) rejectionReasons.push("lacks-ordinary-complete-source-lineage")
		if (!(evaluation.relationUtility > recoveryV2Winner.relationUtility)) {
			rejectionReasons.push("raw-relation-not-strictly-superior")
		}
		if (evaluation.key === currentWinnerKey) rejectionReasons.push("is-current-winner")
		return {
			evaluation,
			diagnostic: {
				key: evaluation.key,
				qualityUtility: evaluation.qualityUtility,
				qualityLossFromRecoveryV2Winner: Math.max(0,
					recoveryV2Winner.qualityUtility - evaluation.qualityUtility),
				relationUtility: evaluation.relationUtility,
				rawRelationUtilityGain: evaluation.relationUtility - recoveryV2Winner.relationUtility,
				identityGain: evaluation.identityGain,
				paretoMember: evaluation.paretoMember,
				ordinaryCompleteSourceLineage,
				eligible: rejectionReasons.length === 0,
				rejectionReasons,
			},
		}
	})
	const eligible = evaluated.filter(({ diagnostic }) => diagnostic.eligible).sort(compareComplements)
	const selected = eligible[0] ?? null
	const selectedKey = selected?.evaluation.key ?? null
	let slate: readonly CompletePaletteTreatment[] = input.current.slate
	if (selected !== null) {
		const composed: CompletePaletteTreatment[] = [input.current.winner, selected.evaluation.treatment]
		const selectedKeys = new Set(composed.map(completeTreatmentKey))
		for (const treatment of input.current.slate) {
			if (composed.length >= maximumSlateTreatments) break
			const key = completeTreatmentKey(treatment)
			if (selectedKeys.has(key) || composed.some((existing) => visuallyNear(existing, treatment))) continue
			composed.push(treatment)
			selectedKeys.add(key)
		}
		slate = composed
	}
	const slateKeys = slate.map(completeTreatmentKey)
	if (slateKeys[0] !== currentWinnerKey || slate.length > maximumSlateTreatments ||
		completeTreatmentKey(input.current.winner) !== currentWinnerKey) {
		throw new Error("Raw-relation slate complement violated immutable winner-first bounded custody")
	}
	const retainedCurrentKeys = new Set(slateKeys)
	const displacedCurrentCustodyKeys = selected === null
		? []
		: currentCustodyKeys.filter((key, index) =>
			index > 0 && !retainedCurrentKeys.has(key) && currentCustodyKeys.indexOf(key) === index)
	return {
		winner: input.current.winner,
		slate,
		diagnostics: {
			version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_RAW_RELATION_SLATE_COMPLEMENT_ID,
			policy: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_RAW_RELATION_SLATE_COMPLEMENT_POLICY,
			formulas: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_RAW_RELATION_SLATE_COMPLEMENT_FORMULAS,
			domain: {
				recoveryV2EvaluationCount: input.recoveryV2.evaluations.length,
				ordinarySlateTreatmentCount: ordinarySlateEvaluationsByKey.size,
				currentCustodyTreatmentCount: input.current.slate.length,
				ordinaryLineageEligibleTreatmentCount: [...ordinarySlateEvaluationsByKey.keys()]
					.filter((key) => lineageByKey.get(key)?.eligible === true &&
						lineageByKey.get(key)!.basis === "ordinary-complete-source-lineage" &&
						lineageByKey.get(key)!.ordinaryEligibleDescriptorCount > 0).length,
				eligibleComplementCount: eligible.length,
			},
			baseline: {
				currentWinnerKey,
				recoveryV2WinnerKey,
				recoveryV2WinnerQualityUtility: recoveryV2Winner.qualityUtility,
				recoveryV2WinnerRelationUtility: recoveryV2Winner.relationUtility,
				currentCustodyKeys,
			},
			candidates: evaluated.map(({ diagnostic }) => diagnostic)
				.sort((first, second) => compareAscii(first.key, second.key)),
			eligibleComplementKeysInOrder: eligible.map(({ evaluation }) => evaluation.key),
			outcome: {
				exactNoOp: selected === null,
				reservedComplementKey: selectedKey,
				winnerKey: currentWinnerKey,
				winnerAuthorityChanged: false,
				slateKeys,
				displacedCurrentCustodyKeys,
			},
		},
	}
}
