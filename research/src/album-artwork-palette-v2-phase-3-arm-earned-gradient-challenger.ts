import {
	completeTreatmentKey,
} from "./album-artwork-palette-v2.ts"
import type {
	CompletePaletteTreatment,
	PaletteRoleColor,
} from "./album-artwork-palette-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoveryV3CustodySelection,
	AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate,
} from "./album-artwork-palette-v2-phase-3-recovery-custody-v3.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import type {
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2QualityAxis,
	AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection,
} from "./album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_ID =
	"album-artwork-palette-v2-phase-3-earned-gradient-post-selection-challenger-v1" as const

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_NON_FIELD_AXES = [
	"artworkIdentity",
	"representativeness",
	"sourceSupport",
	"foregroundPath",
	"accentFidelity",
	"accentPath",
	"coherence",
	"economy",
] as const satisfies readonly AlbumArtworkPaletteV2Phase3RecoverySelectorV2QualityAxis[]

export type AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerNonFieldAxis =
	typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_NON_FIELD_AXES[number]

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_POLICY = Object.freeze({
	maximumBaseQualityLoss: 0.06,
	maximumNonFieldEvidenceLevelLoss: 1,
	evidenceResolution:
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.evidenceResolution,
	materialRoleColorDistance:
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.materialColorDistance,
	maximumSlateTreatments: 8,
})

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_FORMULAS = Object.freeze({
	baseQuality:
		"recovery-v2 quality utility minus its rendered-gradient-salience contribution",
	eligibility:
		"flat baseline; existing earned-rendered candidate; source-connected complete descriptor lineage; matching foreground/accent family roles, collapse state, and materially rendered foreground/accent colors; base-quality loss at most 0.06; every non-field quality loss at most one existing 0.04 evidence level; positive rendered-gradient salience",
	ordering:
		"descending rendered-gradient salience, field fidelity, recovery-v2 quality utility, then ascending canonical complete-treatment key",
	custody:
		"selected existing challenger first, followed by baseline recovery-v3 custody in its existing order without duplicates, bounded to 8",
})

export type AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerRejectionReason =
	"baseline-winner-is-gradient" |
	"gradient-status-is-not-earned-rendered" |
	"no-source-connected-complete-descriptor-lineage" |
	"foreground-family-role-mismatch" |
	"accent-family-role-mismatch" |
	"collapse-state-mismatch" |
	"foreground-color-mismatch" |
	"accent-color-mismatch" |
	"base-quality-loss-exceeds-limit" |
	"non-field-quality-axis-loss-exceeds-one-level" |
	"rendered-gradient-salience-is-not-positive"

export type AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerCandidateDiagnostic = Readonly<{
	key: string
	gradientStatus: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation["gradientStatus"]
	completeDescriptorLineageCount: number
	sourceConnectedCompleteDescriptorLineageCount: number
	foregroundFamilyRoleMatches: boolean
	accentFamilyRoleMatches: boolean
	collapseStateMatches: boolean
	roleColorDistances: Readonly<{
		foreground: number
		accent: number
	}>
	baseQuality: number
	baseQualityLoss: number
	qualityUtility: number
	fieldFidelity: number
	renderedGradientSalience: number
	nonFieldEvidenceLevelLosses: Readonly<
		Record<AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerNonFieldAxis, number>
	>
	eligible: boolean
	rejectionReasons: readonly AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerRejectionReason[]
}>

export type AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerDiagnostics = Readonly<{
	version: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_ID
	policy: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_POLICY
	formulas: typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_FORMULAS
	domain: Readonly<{
		recoveryV2EvaluationCount: number
		materializedTreatmentCount: number
		evaluatedChallengerCount: number
		eligibleChallengerCount: number
	}>
	baseline: Readonly<{
		key: string
		gradientStatus: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation["gradientStatus"]
		flat: boolean
		baseQuality: number
		qualityUtility: number
		slateKeys: readonly string[]
	}>
	candidates: readonly AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerCandidateDiagnostic[]
	eligibleChallengerKeysInOrder: readonly string[]
	outcome: Readonly<{
		reason: "baseline-winner-gradient" | "no-eligible-challenger" | "eligible-challenger-selected"
		selectedChallengerKey: string | null
		replacedBaselineWinner: boolean
		winnerKey: string
		slateKeys: readonly string[]
		displacedBaselineSlateKey: string | null
	}>
}>

export type AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerInput = Readonly<{
	recoveryV2: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Selection
	recoveryV3: AlbumArtworkPaletteV2Phase3RecoveryV3CustodySelection
	materialized: readonly AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate[]
}>

export type AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerSelection = Readonly<{
	winner: CompletePaletteTreatment
	slate: readonly CompletePaletteTreatment[]
	diagnostics: AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerDiagnostics
}>

type EvaluatedCandidate = Readonly<{
	evaluation: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation
	diagnostic: AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerCandidateDiagnostic
}>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function compareDescending(first: number, second: number): number {
	return second - first
}

function colorDistance(first: PaletteRoleColor, second: PaletteRoleColor): number {
	return Math.hypot(
		first.oklab[0] - second.oklab[0],
		first.oklab[1] - second.oklab[1],
		first.oklab[2] - second.oklab[2],
	)
}

function baseQuality(evaluation: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation): number {
	return evaluation.qualityUtility -
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_SELECTOR_V2_POLICY.qualityWeights.renderedGradientSalience *
			evaluation.quality.renderedGradientSalience
}

function validateInput(
	input: AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerInput,
): Readonly<{
	baseline: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation
	materializedByKey: ReadonlyMap<string, AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate>
}> {
	if (input.recoveryV3.slate.length === 0 ||
		input.recoveryV3.slate.length >
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_POLICY.maximumSlateTreatments) {
		throw new RangeError("Earned-gradient challenger requires recovery-v3 custody containing 1 to 8 treatments")
	}
	const baselineKey = completeTreatmentKey(input.recoveryV3.winner)
	if (completeTreatmentKey(input.recoveryV3.slate[0]) !== baselineKey) {
		throw new Error("Earned-gradient challenger requires winner-first recovery-v3 custody")
	}
	if (completeTreatmentKey(input.recoveryV2.winner) !== baselineKey) {
		throw new Error("Earned-gradient challenger requires the recovery-v2 and recovery-v3 baseline winners to match")
	}
	const slateKeys = input.recoveryV3.slate.map(completeTreatmentKey)
	if (new Set(slateKeys).size !== slateKeys.length) {
		throw new Error("Earned-gradient challenger received duplicate recovery-v3 custody keys")
	}
	const evaluationsByKey = new Map<string, AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation>()
	for (const evaluation of input.recoveryV2.evaluations) {
		if (evaluation.key !== completeTreatmentKey(evaluation.treatment)) {
			throw new Error("Earned-gradient challenger received a non-canonical recovery-v2 evaluation key")
		}
		if (evaluationsByKey.has(evaluation.key)) {
			throw new Error("Earned-gradient challenger received duplicate recovery-v2 evaluation keys")
		}
		evaluationsByKey.set(evaluation.key, evaluation)
	}
	const materializedByKey = new Map<string, AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate>()
	for (const candidate of input.materialized) {
		if (candidate.key !== completeTreatmentKey(candidate.treatment)) {
			throw new Error("Earned-gradient challenger received a non-canonical materialized treatment key")
		}
		if (materializedByKey.has(candidate.key)) {
			throw new Error("Earned-gradient challenger received duplicate materialized treatment keys")
		}
		materializedByKey.set(candidate.key, candidate)
	}
	for (const key of evaluationsByKey.keys()) {
		if (!materializedByKey.has(key)) {
			throw new Error("Earned-gradient challenger omitted a recovery-v2 evaluation from the materialized domain")
		}
	}
	const baseline = evaluationsByKey.get(baselineKey)
	if (!baseline) throw new Error("Earned-gradient challenger omitted the baseline winner evaluation")
	return { baseline, materializedByKey }
}

function evaluateCandidate(
	baseline: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
	candidate: AlbumArtworkPaletteV2Phase3RecoverySelectorV2Evaluation,
	materialized: AlbumArtworkPaletteV2Phase3RecoveryV3MaterializedCandidate,
	baselineIsGradient: boolean,
): EvaluatedCandidate {
	const treatment = candidate.treatment
	const baselineTreatment = baseline.treatment
	const completeDescriptors = materialized.descriptors.filter(({ treatment: descriptorTreatment }) =>
		completeTreatmentKey(descriptorTreatment) === candidate.key)
	const sourceConnectedCompleteDescriptors = completeDescriptors.filter(({ lineage }) => lineage.sourceConnected)
	const foregroundFamilyRoleMatches = treatment.familyRoles.foreground ===
		baselineTreatment.familyRoles.foreground
	const accentFamilyRoleMatches = treatment.familyRoles.accent === baselineTreatment.familyRoles.accent
	const collapseStateMatches = treatment.collapse.surface === baselineTreatment.collapse.surface &&
		treatment.collapse.accent === baselineTreatment.collapse.accent
	const foregroundDistance = colorDistance(treatment.foreground, baselineTreatment.foreground)
	const accentDistance = colorDistance(treatment.accent, baselineTreatment.accent)
	const candidateBaseQuality = baseQuality(candidate)
	const candidateBaseQualityLoss = Math.max(0, baseQuality(baseline) - candidateBaseQuality)
	const nonFieldEvidenceLevelLosses = Object.fromEntries(
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_NON_FIELD_AXES.map((axis) =>
			[axis, Math.max(0, baseline.evidenceLevels[axis] - candidate.evidenceLevels[axis])]),
	) as Record<AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerNonFieldAxis, number>
	const rejectionReasons: AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerRejectionReason[] = []
	if (baselineIsGradient) rejectionReasons.push("baseline-winner-is-gradient")
	if (candidate.gradientStatus !== "earned-rendered") {
		rejectionReasons.push("gradient-status-is-not-earned-rendered")
	}
	if (sourceConnectedCompleteDescriptors.length === 0) {
		rejectionReasons.push("no-source-connected-complete-descriptor-lineage")
	}
	if (!foregroundFamilyRoleMatches) rejectionReasons.push("foreground-family-role-mismatch")
	if (!accentFamilyRoleMatches) rejectionReasons.push("accent-family-role-mismatch")
	if (!collapseStateMatches) rejectionReasons.push("collapse-state-mismatch")
	if (foregroundDistance >
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_POLICY.materialRoleColorDistance + 1e-12) {
		rejectionReasons.push("foreground-color-mismatch")
	}
	if (accentDistance >
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_POLICY.materialRoleColorDistance + 1e-12) {
		rejectionReasons.push("accent-color-mismatch")
	}
	if (candidateBaseQualityLoss >
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_POLICY.maximumBaseQualityLoss + 1e-12) {
		rejectionReasons.push("base-quality-loss-exceeds-limit")
	}
	if (Object.values(nonFieldEvidenceLevelLosses).some((loss) =>
		loss > ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_POLICY
			.maximumNonFieldEvidenceLevelLoss)) {
		rejectionReasons.push("non-field-quality-axis-loss-exceeds-one-level")
	}
	if (!(candidate.quality.renderedGradientSalience > 0)) {
		rejectionReasons.push("rendered-gradient-salience-is-not-positive")
	}
	return {
		evaluation: candidate,
		diagnostic: {
			key: candidate.key,
			gradientStatus: candidate.gradientStatus,
			completeDescriptorLineageCount: completeDescriptors.length,
			sourceConnectedCompleteDescriptorLineageCount: sourceConnectedCompleteDescriptors.length,
			foregroundFamilyRoleMatches,
			accentFamilyRoleMatches,
			collapseStateMatches,
			roleColorDistances: {
				foreground: foregroundDistance,
				accent: accentDistance,
			},
			baseQuality: candidateBaseQuality,
			baseQualityLoss: candidateBaseQualityLoss,
			qualityUtility: candidate.qualityUtility,
			fieldFidelity: candidate.quality.fieldFidelity,
			renderedGradientSalience: candidate.quality.renderedGradientSalience,
			nonFieldEvidenceLevelLosses,
			eligible: rejectionReasons.length === 0,
			rejectionReasons,
		},
	}
}

function compareEligibleCandidates(first: EvaluatedCandidate, second: EvaluatedCandidate): number {
	return compareDescending(
		first.diagnostic.renderedGradientSalience,
		second.diagnostic.renderedGradientSalience,
	) || compareDescending(first.diagnostic.fieldFidelity, second.diagnostic.fieldFidelity) ||
		compareDescending(first.diagnostic.qualityUtility, second.diagnostic.qualityUtility) ||
		compareAscii(first.diagnostic.key, second.diagnostic.key)
}

export function selectAlbumArtworkPaletteV2Phase3ArmEarnedGradientChallenger(
	input: AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerInput,
): AlbumArtworkPaletteV2Phase3ArmEarnedGradientChallengerSelection {
	const { baseline, materializedByKey } = validateInput(input)
	const baselineKey = baseline.key
	const baselineIsGradient = input.recoveryV3.winner.gradient
	const evaluated = input.recoveryV2.evaluations
		.filter(({ key }) => key !== baselineKey)
		.map((evaluation) => evaluateCandidate(
			baseline,
			evaluation,
			materializedByKey.get(evaluation.key)!,
			baselineIsGradient,
		))
	const eligible = evaluated.filter(({ diagnostic }) => diagnostic.eligible)
		.sort(compareEligibleCandidates)
	const selected = eligible[0] ?? null
	const selectedKey = selected?.evaluation.key ?? null
	const baselineSlateKeys = input.recoveryV3.slate.map(completeTreatmentKey)
	const selectedWasInBaselineSlate = selectedKey !== null && baselineSlateKeys.includes(selectedKey)
	const unboundedSlate = selected === null
		? [...input.recoveryV3.slate]
		: [
			selected.evaluation.treatment,
			...input.recoveryV3.slate.filter((treatment) => completeTreatmentKey(treatment) !== selectedKey),
		]
	const slate = unboundedSlate.slice(0,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_POLICY.maximumSlateTreatments)
	const winner = selected?.evaluation.treatment ?? input.recoveryV3.winner
	const slateKeys = slate.map(completeTreatmentKey)
	if (slateKeys[0] !== completeTreatmentKey(winner) || slate.length > 8) {
		throw new Error("Earned-gradient challenger failed to produce bounded winner-first custody")
	}
	const displacedBaselineSlateKey = selected !== null && !selectedWasInBaselineSlate &&
		baselineSlateKeys.length ===
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_POLICY.maximumSlateTreatments
		? baselineSlateKeys[baselineSlateKeys.length - 1]
		: null
	const reason = baselineIsGradient
		? "baseline-winner-gradient" as const
		: selected === null
			? "no-eligible-challenger" as const
			: "eligible-challenger-selected" as const
	return {
		winner,
		slate,
		diagnostics: {
			version: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_ID,
			policy: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_POLICY,
			formulas: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ARM_EARNED_GRADIENT_CHALLENGER_FORMULAS,
			domain: {
				recoveryV2EvaluationCount: input.recoveryV2.evaluations.length,
				materializedTreatmentCount: input.materialized.length,
				evaluatedChallengerCount: evaluated.length,
				eligibleChallengerCount: eligible.length,
			},
			baseline: {
				key: baselineKey,
				gradientStatus: baseline.gradientStatus,
				flat: !baselineIsGradient,
				baseQuality: baseQuality(baseline),
				qualityUtility: baseline.qualityUtility,
				slateKeys: baselineSlateKeys,
			},
			candidates: evaluated.map(({ diagnostic }) => diagnostic)
				.sort((first, second) => compareAscii(first.key, second.key)),
			eligibleChallengerKeysInOrder: eligible.map(({ diagnostic }) => diagnostic.key),
			outcome: {
				reason,
				selectedChallengerKey: selectedKey,
				replacedBaselineWinner: selected !== null,
				winnerKey: completeTreatmentKey(winner),
				slateKeys,
				displacedBaselineSlateKey,
			},
		},
	}
}
