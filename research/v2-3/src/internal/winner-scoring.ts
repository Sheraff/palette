import { completeTreatmentKey } from "./palette-core.ts";

import type { CompletePaletteTreatment } from "./palette-core.ts";

import { ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY, selectAlbumArtworkPaletteV2Phase3Treatments } from "./base-scoring.ts";

import type { AlbumArtworkPaletteV2Phase3IdentityInput, AlbumArtworkPaletteV2Phase3SelectorEvaluation } from "./base-scoring.ts";

import { albumArtworkPaletteV2Phase3SelectorV2Quality } from "./palette-quality.ts";

import type { AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus } from "./palette-quality.ts";

export const WINNER_QUALITY_AXES = [
	"fieldFidelity",
	"surfaceFidelity",
	"artworkIdentity",
	"representativeness",
	"sourceSupport",
	"renderedGradientSalience",
	"foregroundPath",
	"accentFidelity",
	"accentPath",
	"coherence",
	"economy",
] as const

export type WinnerQualityAxis = typeof WINNER_QUALITY_AXES[number]

export const WINNER_SCORING_POLICY = Object.freeze({
	evidenceResolution: 0.04,
	utilityResolution: 0.005,
	maximumIdentityGain: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.maximumIdentityGain,
	maximumQualityLoss: 0.12,
	qualityWeights: Object.freeze({
		fieldFidelity: 0.15,
		surfaceFidelity: 0.06,
		artworkIdentity: 0.11,
		representativeness: 0.10,
		sourceSupport: 0.10,
		renderedGradientSalience: 0.08,
		foregroundPath: 0.15,
		accentFidelity: 0.06,
		accentPath: 0.08,
		coherence: 0.06,
		economy: 0.05,
	}),
} as const)

export type WinnerQuality = Readonly<
	Record<WinnerQualityAxis, number>
>

export type WinnerEvaluation = Readonly<{
	key: string
	structuralKey: string
	treatment: CompletePaletteTreatment
	gradientStatus: AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus
	quality: WinnerQuality
	evidenceLevels: Readonly<Record<WinnerQualityAxis, number>>
	qualityUtility: number
	identityCoverage: number
	identityGain: number
	identityRoles: AlbumArtworkPaletteV2Phase3SelectorEvaluation["identityRoles"]
	relationUtility: number
	paretoMember: boolean
	dominatedByKey: string | null
}>

export type WinnerScoring = Readonly<{
	winner: CompletePaletteTreatment
	evaluations: readonly WinnerEvaluation[]
}>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function compareDescending(first: number, second: number): number {
	return second - first
}

function evidenceLevel(value: number): number {
	return Math.floor((value + 1e-12) /
		WINNER_SCORING_POLICY.evidenceResolution)
}

function utilityLevel(value: number): number {
	return Math.floor((value + 1e-12) /
		WINNER_SCORING_POLICY.utilityResolution)
}

function gradientRenderingKey(treatment: CompletePaletteTreatment): string {
	return treatment.gradient
		? `${treatment.gradientEvidence?.topology ?? "unsupported"}:${treatment.gradientEvidence?.direction ?? "unsupported"}`
		: "flat"
}

function renderedFieldClaimKey(treatment: CompletePaletteTreatment): string {
	return [
		treatment.familyRoles.background,
		treatment.familyRoles.surface,
		treatment.background.hex.toLowerCase(),
		treatment.surface.hex.toLowerCase(),
	].join("\0")
}

function treatmentStructuralKey(treatment: CompletePaletteTreatment): string {
	return [
		completeTreatmentKey(treatment),
		treatment.fieldTreatment,
		treatment.familyRoles.background,
		treatment.familyRoles.surface,
		treatment.familyRoles.foreground,
		treatment.familyRoles.accent,
		treatment.collapse.surface ? "surface-collapsed" : "surface-distinct",
		treatment.collapse.accent ? "accent-collapsed" : "accent-distinct",
		`cardinality-${treatment.cardinality}`,
		gradientRenderingKey(treatment),
		treatment.sourceFieldHypothesisId,
	].join("\0")
}

function qualityUtility(quality: WinnerQuality): number {
	return WINNER_QUALITY_AXES.reduce((sum, axis) =>
		sum + WINNER_SCORING_POLICY.qualityWeights[axis] *
			quality[axis], 0)
}

function evaluateTreatment(
	wave1: AlbumArtworkPaletteV2Phase3SelectorEvaluation,
	gradientExpected: boolean,
): WinnerEvaluation {
	const reusable = albumArtworkPaletteV2Phase3SelectorV2Quality(wave1.treatment, gradientExpected)
	const quality: WinnerQuality = {
		fieldFidelity: wave1.quality.fieldFidelity,
		surfaceFidelity: wave1.quality.surfaceFidelity,
		artworkIdentity: wave1.quality.artworkIdentity,
		representativeness: wave1.quality.representativeness,
		sourceSupport: reusable.quality.sourceSupport,
		renderedGradientSalience: reusable.gradientStatus === "earned-rendered"
			? reusable.quality.renderedGradientSalience
			: 0,
		foregroundPath: reusable.quality.foregroundPath,
		accentFidelity: wave1.quality.accentFidelity,
		accentPath: reusable.quality.accentPath,
		coherence: wave1.quality.coherence,
		economy: wave1.quality.economy,
	}
	for (const axis of WINNER_QUALITY_AXES) {
		if (!Number.isFinite(quality[axis])) throw new TypeError(`Non-finite winner quality axis ${axis}`)
	}
	const utility = qualityUtility(quality)
	return {
		key: wave1.key,
		structuralKey: treatmentStructuralKey(wave1.treatment),
		treatment: wave1.treatment,
		gradientStatus: reusable.gradientStatus,
		quality,
		evidenceLevels: Object.fromEntries(
			WINNER_QUALITY_AXES.map((axis) =>
				[axis, evidenceLevel(quality[axis])]),
		) as Record<WinnerQualityAxis, number>,
		qualityUtility: utility,
		identityCoverage: wave1.identityCoverage,
		identityGain: wave1.identityGain,
		identityRoles: wave1.identityRoles,
		relationUtility: utility + wave1.identityGain,
		paretoMember: false,
		dominatedByKey: null,
	}
}

function dominates(
	first: WinnerEvaluation,
	second: WinnerEvaluation,
): boolean {
	let strictlyBetter = false
	for (const axis of WINNER_QUALITY_AXES) {
		if (first.evidenceLevels[axis] < second.evidenceLevels[axis]) return false
		if (first.evidenceLevels[axis] > second.evidenceLevels[axis]) strictlyBetter = true
	}
	return strictlyBetter
}

function compareEvaluations(
	first: WinnerEvaluation,
	second: WinnerEvaluation,
): number {
	let comparison = compareDescending(utilityLevel(first.relationUtility), utilityLevel(second.relationUtility)) ||
		compareDescending(utilityLevel(first.qualityUtility), utilityLevel(second.qualityUtility)) ||
		compareDescending(first.identityGain, second.identityGain)
	if (comparison !== 0) return comparison
	const firstLevels = WINNER_QUALITY_AXES
		.map((axis) => first.evidenceLevels[axis]).sort((left, right) => left - right)
	const secondLevels = WINNER_QUALITY_AXES
		.map((axis) => second.evidenceLevels[axis]).sort((left, right) => left - right)
	for (let index = 0; index < firstLevels.length; index++) {
		comparison = compareDescending(firstLevels[index], secondLevels[index])
		if (comparison !== 0) return comparison
	}
	for (const axis of WINNER_QUALITY_AXES) {
		comparison = compareDescending(first.evidenceLevels[axis], second.evidenceLevels[axis])
		if (comparison !== 0) return comparison
	}
	return compareAscii(first.key, second.key) || compareAscii(first.structuralKey, second.structuralKey)
}

export function scorePaletteCandidates(
	treatments: readonly CompletePaletteTreatment[],
	identity?: AlbumArtworkPaletteV2Phase3IdentityInput,
): WinnerScoring {
	if (treatments.length === 0) throw new RangeError("The palette candidate domain is empty")
	const orderedTreatments = [...treatments].sort((first, second) =>
		compareAscii(treatmentStructuralKey(first), treatmentStructuralKey(second)))
	const wave1 = selectAlbumArtworkPaletteV2Phase3Treatments(orderedTreatments, identity)
	const earnedGradientClaims = new Set(orderedTreatments.filter((treatment) =>
		albumArtworkPaletteV2Phase3SelectorV2Quality(treatment).gradientStatus === "earned-rendered")
		.map(renderedFieldClaimKey))
	const rawEvaluations = wave1.evaluations.map((evaluation) => evaluateTreatment(
		evaluation,
		earnedGradientClaims.has(renderedFieldClaimKey(evaluation.treatment)),
	)).sort(compareEvaluations)
	const evaluations = rawEvaluations.map((evaluation):
		WinnerEvaluation => {
		const dominators = rawEvaluations.filter((candidate) =>
			candidate !== evaluation && dominates(candidate, evaluation)).sort(compareEvaluations)
		return {
			...evaluation,
			paretoMember: dominators.length === 0,
			dominatedByKey: dominators[0]?.key ?? null,
		}
	}).sort(compareEvaluations)
	const frontier = evaluations.filter(({ paretoMember }) => paretoMember).sort(compareEvaluations)
	if (frontier.length === 0) throw new Error("The palette quality frontier is empty")
	const winner = frontier[0]
	return {
		winner: winner.treatment,
		evaluations,
	}
}
