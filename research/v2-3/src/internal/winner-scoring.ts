import { completeTreatmentKey } from "./palette-core.ts";

import type { CompletePaletteTreatment } from "./palette-core.ts";

import { ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY, selectAlbumArtworkPaletteV2Phase3Treatments } from "./base-scoring.ts";

import type { AlbumArtworkPaletteV2Phase3IdentityInput, AlbumArtworkPaletteV2Phase3SelectorEvaluation } from "./base-scoring.ts";

import { albumArtworkPaletteV2Phase3SelectorV2Quality, gradientEvidenceStrength, roleSourceSupport } from "./palette-quality.ts";

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

/**
 * Winner-ranking hypotheses. Each flag isolates one reviewed top-one ranking
 * failure class so it can be evaluated, reverted, or integrated independently.
 * Setting all three to `false` restores the previous ranking exactly.
 */
export const WINNER_RANKING_HYPOTHESES = Object.freeze({
	/**
	 * Identity coverage is already part of the winner objective through
	 * `relationUtility`, but it neither guards domination (so an
	 * identity-superior treatment can be pruned off the frontier by a treatment
	 * that omits a major family) nor survives the utility quantum (inside one
	 * `utilityResolution` band the order falls back to `qualityUtility`, which
	 * excludes identity and therefore reverses the preference). Make coverage
	 * authoritative in both places and give it a usable amplitude.
	 */
	identityAuthority: false,
	/**
	 * The same two defects as `identityAuthority`, but the authority is earned
	 * rather than assumed. Raw coverage counts any obligation carried in any
	 * role, so it is equally available to a treatment that covers two
	 * near-neutral obligations, or spends two roles on one hue — measured to
	 * produce a light-grey-on-near-white `johns` and to break `black`'s reviewed
	 * two-colour collapse. `base-scoring.ts` therefore separates the *authorized*
	 * part of the identity gain: the coverage carried by distinct, genuinely
	 * chromatic identity directions, counted against the whole palette. Only
	 * that part guards domination and decides the utility band here.
	 *
	 * Alternative to `identityAuthority`, not a companion: with both enabled the
	 * looser rule would re-admit exactly what this one excludes.
	 */
	authorizedIdentity: true,
	/**
	 * A collapsed surface has no surface to be faithful about: its
	 * `surfaceFidelity` is `1 - surfaceOpportunity`, a statement about the
	 * distinct-surface alternatives available to its *background family*, not
	 * about the rendered treatment. Comparing it across treatments with
	 * different background families rewards choosing a background that had no
	 * good partner, and the same term is counted twice because `economy` is
	 * `(surfaceFidelity + accentEconomy) / 2`. Decorrelate `economy` and move
	 * weight from collapse economy to source-derived field ownership.
	 */
	fieldOwnershipBeforeCollapseEconomy: true,
	/**
	 * The rendered field claim must be honest: an unearned gradient claim must
	 * lose its field fidelity at winner level too (the wave-1 score it is read
	 * from has no such rule), a legitimately earned gradient must not be
	 * structurally out-scored on the claim axis by any flat, and a foreground or
	 * accent whose APCA sign flips across the gradient samples crosses zero
	 * contrast somewhere inside the rendered field.
	 */
	gradientClaimConsistency: true,
})

const IDENTITY_AUTHORITY = Object.freeze({
	/**
	 * Winner-level cap on the identity bonus added to `qualityUtility`. The
	 * wave-1 cap (0.05) is smaller than the utility spread that collapse economy
	 * and local role paths routinely produce, so full identity coverage cannot
	 * overturn an omission of a major family.
	 */
	maximumIdentityGain: 0.10,
})

const FIELD_OWNERSHIP = Object.freeze({
	/**
	 * Value of the `surfaceFidelity` axis for a collapsed surface.
	 *
	 * The axis otherwise measures how much a *distinct* surface contributes to
	 * the field (`variant.surfaceContribution`). For a collapsed surface
	 * `palette-core.ts` substitutes `1 - surfaceOpportunity`, where
	 * `surfaceOpportunity` is the best `surfaceContribution` any other variant of
	 * the same *background family* achieved. That is a statement about a
	 * different treatment, so comparing it across treatments with different
	 * background families rewards choosing a background family that had no good
	 * surface partner — the inverse of field quality, and the mechanism by which
	 * collapse economy beat field ownership in the reviewed failures.
	 *
	 * `null` keeps the previous behaviour. A number replaces only the *collapsed*
	 * reading with a constant, so collapsed treatments can no longer out-score
	 * each other on the availability of alternatives, while a distinct surface
	 * keeps its full, honestly-measured contribution.
	 */
	collapsedSurfaceFidelity: 0.45 as number | null,
	/**
	 * Apply the same substitution inside `economy`, which is
	 * `(surfaceFidelity + accentEconomy) / 2` and therefore imports the same
	 * contaminated term.
	 */
	applyToEconomy: false,
	/**
	 * `economy` restated without the `surfaceFidelity` term entirely:
	 * `2 * economy - surfaceFidelity` is exactly the accent economy component.
	 * Evaluated and rejected: it changed 6 of 34 base artworks and fixed none of
	 * the reviewed ranking failures.
	 */
	decorrelateEconomy: false,
	/**
	 * Weight moved from the collapse-economy axis to the field-ownership axis.
	 * Evaluated at 0.04: it fixes the reviewed cases but cuts the reward of a
	 * *distinct* surface as well, which demoted reviewed-strong four-colour flats
	 * to three-colour collapsed winners.
	 */
	weightTransfer: 0,
	/**
	 * Additional weight on `fieldFidelity`, funded proportionally from every
	 * other axis so the utility scale is preserved. Unlike `weightTransfer` this
	 * does not touch the reward a *distinct* surface earns.
	 *
	 * Rationale: postmortem item 5, "establish field ownership and polarity
	 * before symmetric utility ranking". Where a distinct surface *degrades* the
	 * field claim relative to collapsing the same background family, field
	 * ownership should be able to say so.
	 */
	fieldFidelityWeightBoost: 0 as number,
})

const GRADIENT_CLAIM = Object.freeze({
	/**
	 * Read `fieldFidelity` from the gradient-aware quality (which zeroes it for
	 * an unearned gradient claim) instead of the wave-1 score, which has no such
	 * rule and silently dropped the penalty at the only stage that picks a winner.
	 */
	routeUnearnedFieldFidelity: true,
	/**
	 * Score the claim axis as pure honesty of the rendered field claim: an
	 * unearned gradient claim scores 0, every honest claim scores 1.
	 *
	 * `honest-claims-only` counts `not-applicable`, `earned-rendered` **and**
	 * `missing` as honest. Declining to render a gradient the evidence would
	 * support is a legal flat rendering of the same field, not a dishonest
	 * claim; scoring it 0 was an anti-flat bias that offset the anti-gradient
	 * bias of scoring an earned gradient `sqrt(salience * strength)` (~0.5)
	 * against a not-applicable flat's 1. Repairing only one side of that pair
	 * (`earned-only`) leaves a net pro-gradient push, which is what promoted a
	 * reviewed-strong flat to a gradient.
	 */
	claimAxis: "evidence-strength" as "endpoint-source-fidelity" | "evidence-strength" | "honest-claims-only" | "earned-only" | "legacy-salience",
	/**
	 * Lower bound on |sum(sign)| / count of the signed APCA samples of one role
	 * across the rendered gradient. Below 1 the role crosses zero contrast
	 * somewhere inside the field; the role path is discounted by the observed
	 * agreement. Flat treatments have no gradient samples and are unaffected.
	 */
	signAgreementFloor: 0,
	/**
	 * Chromatic separation at which a sign flip stops being a defect.
	 *
	 * An APCA sign flip means lightness contrast passes through zero somewhere
	 * inside the rendered field. That only makes the role unreadable when
	 * lightness was the *only* separator. When the role is chromatically far
	 * from the field it crosses, chromatic contrast carries readability and the
	 * flip is acceptable — a saturated pink over a blue-to-green field stays
	 * legible even where its lightness matches.
	 *
	 * Separation is the distance from the role's OKLab (a, b) to the rendered
	 * field's (a, b) path. The field interpolates in OKLab, so that path is
	 * exactly the segment between the endpoints and the point-to-segment
	 * distance is the minimum chromatic separation anywhere along the gradient.
	 *
	 * Set from human review: the one flip judged readable measures 0.248, while
	 * every flip judged defective or near-hue measures at most 0.087.
	 */
	chromaticCarryFull: 0.15,
})

/**
 * Ordering of admitted transition-promotion candidates.
 *
 * `coverage-first` is the previous behaviour: `compareTransitionCandidates`
 * ranks decisive coverage and total obligation coverage above any quality term,
 * so a promoted transition with more obligation coverage wins even when its
 * roles are materially worse. Human review of a gradient whose promoted accent
 * had lower coverage but better readability contradicts that ordering.
 *
 * `quality-after-decisive` keeps decisive coverage first — that is about whether
 * the transition is decisive at all — then compares quality utility before the
 * remaining coverage terms.
 */
export const TRANSITION_PROMOTION_ORDER: "coverage-first" | "quality-after-decisive" = "coverage-first"

/**
 * How treatments that land in the same quantized utility band are ordered.
 *
 * `sorted-evidence-levels` is the previous behaviour: the band is resolved by
 * comparing the ascending vector of per-axis evidence levels, which is a
 * *structural* comparison. Two treatments that share every family role and
 * differ only in which representative of each family they picked can therefore
 * be separated by a level boundary on one axis while the treatment with the
 * higher raw utility loses — a sub-resolution difference deciding the winner.
 *
 * `raw-utility-first` compares raw `relationUtility` before falling back to the
 * structural vectors. It only ever acts inside one quantization band, where the
 * quantized comparison has already declared the two indistinguishable.
 */
export const BAND_TIE_BREAK:
	"sorted-evidence-levels" | "raw-utility-first" | "same-family-raw-utility" | "same-family-band-extent" =
		"same-family-band-extent"

/**
 * Which utility the transition-promotion quality envelope compares.
 *
 * Promotion decides the *field topology*: it replaces the incumbent's field
 * with an earned native transition. Gating that decision on
 * `renderedGradientSalience` — the axis whose entire job is to score the field
 * claim — is circular, because the incumbent is a different field and its claim
 * score is not a yardstick for the candidate's. It also makes the fixed 0.12
 * envelope sensitive to the claim axis's scale rather than to treatment quality:
 * the reviewed birdsofprey promotion clears the envelope by 0.0012 under one
 * claim formulation and falls out under another, with no change to the palette.
 *
 * `field-claim-neutral` removes the claim axis from both sides of the envelope
 * comparison. Every other axis still gates promotion exactly as before.
 */
export const PROMOTION_ENVELOPE: "quality-utility" | "field-claim-neutral" | "field-axis-neutral" =
	"field-axis-neutral"

/**
 * Axes that describe the *field claim itself*. Promotion exists to replace the
 * field, so these are the axes it is entitled to change; the envelope should
 * gate it on what it is not entitled to damage — the roles.
 */
const FIELD_CLAIM_AXES: readonly WinnerQualityAxis[] = ["fieldFidelity", "surfaceFidelity", "renderedGradientSalience"]

/**
 * Quality utility as the promotion envelope compares it. Subtracting weighted
 * axes from both sides is exact, because `qualityUtility` is a weighted sum.
 */
export function promotionEnvelopeUtility(evaluation: Readonly<{
	qualityUtility: number
	quality: WinnerQuality
}>): number {
	if (PROMOTION_ENVELOPE === "quality-utility") return evaluation.qualityUtility
	const excluded: readonly WinnerQualityAxis[] = PROMOTION_ENVELOPE === "field-claim-neutral"
		? ["renderedGradientSalience"]
		: FIELD_CLAIM_AXES
	return excluded.reduce((utility, axis) =>
		utility - WINNER_SCORING_POLICY.qualityWeights[axis] * evaluation.quality[axis], evaluation.qualityUtility)
}

const BASE_QUALITY_WEIGHTS = Object.freeze({
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
})

/**
 * Winner quality weights. `weightTransfer` moves weight from the
 * collapse-economy axis to the field-ownership axis; `fieldFidelityWeightBoost`
 * raises the field-ownership axis and funds it proportionally from every other
 * axis, so the total stays 1 and the utility scale (and therefore
 * `maximumQualityLoss`) is unchanged.
 */
function fieldOwnershipWeights(): Record<WinnerQualityAxis, number> {
	if (!WINNER_RANKING_HYPOTHESES.fieldOwnershipBeforeCollapseEconomy) return { ...BASE_QUALITY_WEIGHTS }
	const transferred: Record<WinnerQualityAxis, number> = {
		...BASE_QUALITY_WEIGHTS,
		fieldFidelity: BASE_QUALITY_WEIGHTS.fieldFidelity + FIELD_OWNERSHIP.weightTransfer,
		surfaceFidelity: BASE_QUALITY_WEIGHTS.surfaceFidelity - FIELD_OWNERSHIP.weightTransfer,
	}
	const boost = FIELD_OWNERSHIP.fieldFidelityWeightBoost
	if (boost === 0) return transferred
	const remainder = 1 - transferred.fieldFidelity
	if (remainder <= boost) throw new RangeError("The field-ownership weight boost exhausts the other axes")
	const scale = (remainder - boost) / remainder
	return Object.fromEntries(WINNER_QUALITY_AXES.map((axis) => [
		axis,
		axis === "fieldFidelity" ? transferred.fieldFidelity + boost : transferred[axis] * scale,
	])) as Record<WinnerQualityAxis, number>
}

export const WINNER_SCORING_POLICY = Object.freeze({
	evidenceResolution: 0.04,
	utilityResolution: 0.005,
	maximumIdentityGain: WINNER_RANKING_HYPOTHESES.identityAuthority
		? IDENTITY_AUTHORITY.maximumIdentityGain
		: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.maximumIdentityGain,
	maximumQualityLoss: 0.12,
	qualityWeights: Object.freeze(fieldOwnershipWeights()),
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
	identityAuthorizedGain: number
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

function clamp(value: number): number {
	return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

/**
 * `economy` restated without the collapse-economy term it shares with the
 * `surfaceFidelity` axis. `economy` is `(surfaceFidelity + accentEconomy) / 2`,
 * so the accent component is recoverable exactly.
 */
function decorrelatedEconomy(treatment: CompletePaletteTreatment): number {
	return clamp(2 * treatment.scores.economy - treatment.scores.surfaceFidelity -
		treatment.scores.generatedPenalty)
}

/**
 * `surfaceFidelity` with the collapsed reading replaced by a constant, so a
 * collapsed treatment no longer carries a statement about the distinct-surface
 * alternatives available to its background family.
 */
function fieldOwnershipSurfaceFidelity(
	treatment: CompletePaletteTreatment,
	waveOne: number,
): number {
	const collapsed = FIELD_OWNERSHIP.collapsedSurfaceFidelity
	if (!WINNER_RANKING_HYPOTHESES.fieldOwnershipBeforeCollapseEconomy ||
		collapsed === null || !treatment.collapse.surface) return waveOne
	return clamp(collapsed - treatment.scores.generatedPenalty)
}

/**
 * `economy` is `(surfaceFidelity + accentEconomy) / 2`, so it imports the same
 * contaminated collapsed reading. Substitute it consistently.
 */
function fieldOwnershipEconomy(
	treatment: CompletePaletteTreatment,
	waveOne: number,
): number {
	if (!WINNER_RANKING_HYPOTHESES.fieldOwnershipBeforeCollapseEconomy) return waveOne
	if (FIELD_OWNERSHIP.decorrelateEconomy) return decorrelatedEconomy(treatment)
	const collapsed = FIELD_OWNERSHIP.collapsedSurfaceFidelity
	if (!FIELD_OWNERSHIP.applyToEconomy || collapsed === null || !treatment.collapse.surface) return waveOne
	return clamp(treatment.scores.economy - 0.5 * treatment.scores.surfaceFidelity +
		0.5 * collapsed - treatment.scores.generatedPenalty)
}

/**
 * Minimum chromatic separation between a role colour and the rendered field.
 *
 * The field interpolates in OKLab, so in the (a, b) chromatic plane the rendered
 * path is exactly the segment between the two endpoints; the point-to-segment
 * distance is therefore the smallest chromatic separation anywhere along the
 * gradient. Lightness is deliberately excluded — this measures what remains to
 * carry readability at the point where lightness contrast passes through zero.
 */
function chromaticSeparationFromField(
	treatment: CompletePaletteTreatment,
	role: "foreground" | "accent",
): number {
	const [, roleA, roleB] = treatment[role].oklab
	const [, backgroundA, backgroundB] = treatment.background.oklab
	const [, surfaceA, surfaceB] = treatment.surface.oklab
	const spanA = surfaceA - backgroundA
	const spanB = surfaceB - backgroundB
	const lengthSquared = spanA * spanA + spanB * spanB
	const projection = lengthSquared <= 1e-12
		? 0
		: Math.max(0, Math.min(1, ((roleA - backgroundA) * spanA + (roleB - backgroundB) * spanB) / lengthSquared))
	return Math.hypot(roleA - (backgroundA + projection * spanA), roleB - (backgroundB + projection * spanB))
}

/**
 * Agreement of the signed APCA samples of one role across the rendered gradient,
 * relaxed by the chromatic contrast that survives the crossing.
 *
 * Mixed signs mean the role crosses APCA's zero-contrast point somewhere inside
 * the field. That is a readability defect only when lightness was the sole
 * separator; where the role is chromatically far from the field it crosses, the
 * flip is acceptable and no discount applies. Flat treatments have no gradient
 * samples and score 1.
 */
function gradientSignAgreement(
	treatment: CompletePaletteTreatment,
	role: "foreground" | "accent",
): number {
	const activeRole = role === "accent" && treatment.collapse.accent ? "foreground" : role
	const samples = treatment.contrast.pairs
		.filter((pair) => pair.role === activeRole && pair.fieldRole === "gradient-sample")
		.map(({ signedLc }) => signedLc)
		.filter((value) => Number.isFinite(value) && value !== 0)
	if (samples.length === 0) return 1
	const agreement = Math.abs(samples.reduce((sum, value) => sum + Math.sign(value), 0)) / samples.length
	if (agreement >= 1) return 1
	const chromaticCarry = GRADIENT_CLAIM.chromaticCarryFull <= 0
		? 1
		: clamp(chromaticSeparationFromField(treatment, activeRole) / GRADIENT_CLAIM.chromaticCarryFull)
	const relaxed = agreement + (1 - agreement) * chromaticCarry
	return Math.max(GRADIENT_CLAIM.signAgreementFloor, relaxed)
}

/**
 * Score of the rendered field claim.
 *
 * `legacy-salience` is the previous behaviour: `sqrt(endpointSalience *
 * evidenceStrength)` for an earned gradient and 0 for everything else,
 * including every flat. (Note that `palette-quality.ts` returns 1 for a
 * not-applicable flat, but winner scoring has always overridden that to 0, so
 * at winner level the axis is a *pro-gradient* bonus, not an anti-gradient
 * handicap.) Its defect is that `endpointSalience` is the OKLab distance
 * between the endpoints, so a fitted endpoint pair wins over exact dense
 * family representatives purely for being further apart.
 *
 * `earned-only` gives every earned gradient 1, which removes that abstract
 * salience advantage but doubles the pro-gradient bonus.
 *
 * `honest-claims-only` additionally scores `missing` 1. Measured: it demotes
 * three reviewed gradients to flats, so `missing -> 0` is load-bearing and the
 * axis is not a simple honesty indicator.
 */
function renderedFieldClaimScore(
	treatment: CompletePaletteTreatment,
	status: AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus,
	salience: number,
	claimConsistency: boolean,
): number {
	if (!claimConsistency || GRADIENT_CLAIM.claimAxis === "legacy-salience") {
		return status === "earned-rendered" ? salience : 0
	}
	if (GRADIENT_CLAIM.claimAxis === "evidence-strength") {
		return status === "earned-rendered" ? gradientEvidenceStrength(treatment) : 0
	}
	if (GRADIENT_CLAIM.claimAxis === "endpoint-source-fidelity") {
		if (status !== "earned-rendered") return 0
		const endpointFidelity = 0.5 * (
			roleSourceSupport(treatment.background, treatment.familyRoles.background) +
			roleSourceSupport(treatment.surface, treatment.familyRoles.surface))
		return Math.sqrt(endpointFidelity * gradientEvidenceStrength(treatment))
	}
	if (status === "unearned") return 0
	if (status === "missing") return GRADIENT_CLAIM.claimAxis === "honest-claims-only" ? 1 : 0
	return 1
}

function evaluateTreatment(
	wave1: AlbumArtworkPaletteV2Phase3SelectorEvaluation,
	gradientExpected: boolean,
): WinnerEvaluation {
	const reusable = albumArtworkPaletteV2Phase3SelectorV2Quality(wave1.treatment, gradientExpected)
	const claimConsistency = WINNER_RANKING_HYPOTHESES.gradientClaimConsistency
	const quality: WinnerQuality = {
		fieldFidelity: claimConsistency && GRADIENT_CLAIM.routeUnearnedFieldFidelity
			? reusable.quality.fieldFidelity
			: wave1.quality.fieldFidelity,
		surfaceFidelity: fieldOwnershipSurfaceFidelity(wave1.treatment, wave1.quality.surfaceFidelity),
		artworkIdentity: wave1.quality.artworkIdentity,
		representativeness: wave1.quality.representativeness,
		sourceSupport: reusable.quality.sourceSupport,
		renderedGradientSalience: renderedFieldClaimScore(wave1.treatment, reusable.gradientStatus,
			reusable.quality.renderedGradientSalience, claimConsistency),
		foregroundPath: claimConsistency
			? reusable.quality.foregroundPath * gradientSignAgreement(wave1.treatment, "foreground")
			: reusable.quality.foregroundPath,
		accentFidelity: wave1.quality.accentFidelity,
		accentPath: claimConsistency
			? reusable.quality.accentPath * gradientSignAgreement(wave1.treatment, "accent")
			: reusable.quality.accentPath,
		coherence: wave1.quality.coherence,
		economy: fieldOwnershipEconomy(wave1.treatment, wave1.quality.economy),
	}
	for (const axis of WINNER_QUALITY_AXES) {
		if (!Number.isFinite(quality[axis])) throw new TypeError(`Non-finite winner quality axis ${axis}`)
	}
	const utility = qualityUtility(quality)
	const identityGain = WINNER_RANKING_HYPOTHESES.identityAuthority
		? WINNER_SCORING_POLICY.maximumIdentityGain * clamp(wave1.identityCoverage)
		: wave1.identityGain
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
		identityGain,
		identityAuthorizedGain: wave1.identityAuthorizedGain,
		identityRoles: wave1.identityRoles,
		relationUtility: utility + identityGain,
		paretoMember: false,
		dominatedByKey: null,
	}
}

/**
 * Carried artwork identity is a dimension of the partial order, not a tiebreak inside it. Without
 * this a treatment that carries a major identity direction can be dominated on the quality axes
 * alone and never reach the frontier, so no amount of identity evidence can ever select it — the
 * measured reason the reviewed `vvbrown` yellow accent could not win. The dimension is the
 * authority-scaled identity gain, so only identity that is chromatic and hue-distinct protects a
 * candidate from domination; coverage by neutrals or by one hue twice does not.
 *
 * This composes with quality-axis work: it adds a dimension beside the axes and changes none of
 * them.
 */
function dominates(
	first: WinnerEvaluation,
	second: WinnerEvaluation,
): boolean {
	let strictlyBetter = false
	if (BAND_TIE_BREAK === "same-family-band-extent" && first.treatment.gradient && second.treatment.gradient &&
		sameFamilyAssignment(first.treatment, second.treatment) &&
		second.treatment.scores.endpointBandSpread > first.treatment.scores.endpointBandSpread) {
		// Covering more of the gradient's surface is evidence in its own right:
		// a pair that spans more of the endpoint bands is not dominated by a
		// narrower pair of the same families, however the other axes fall.
		return false
	}
	if (WINNER_RANKING_HYPOTHESES.identityAuthority) {
		if (first.identityCoverage < second.identityCoverage) return false
		if (first.identityCoverage > second.identityCoverage) strictlyBetter = true
	}
	if (WINNER_RANKING_HYPOTHESES.authorizedIdentity) {
		const authorized = (evaluation: WinnerEvaluation): number =>
			utilityLevel(evaluation.identityAuthorizedGain)
		if (authorized(first) < authorized(second)) return false
		if (authorized(first) > authorized(second)) strictlyBetter = true
	}
	for (const axis of WINNER_QUALITY_AXES) {
		if (first.evidenceLevels[axis] < second.evidenceLevels[axis]) return false
		if (first.evidenceLevels[axis] > second.evidenceLevels[axis]) strictlyBetter = true
	}
	return strictlyBetter
}

/**
 * Whether two treatments assign the same families to the same roles and render
 * the same field kind, so they differ only in which representative of each
 * family was picked.
 */
function sameFamilyAssignment(first: CompletePaletteTreatment, second: CompletePaletteTreatment): boolean {
	return first.gradient === second.gradient &&
		first.collapse.surface === second.collapse.surface &&
		first.collapse.accent === second.collapse.accent &&
		(["background", "surface", "foreground", "accent"] as const)
			.every((role) => first.familyRoles[role] === second.familyRoles[role])
}

function compareEvaluations(
	first: WinnerEvaluation,
	second: WinnerEvaluation,
): number {
	// Inside one utility band the order otherwise falls back to `qualityUtility`, which excludes
	// identity and therefore reverses the preference. `identityAuthority` makes raw coverage
	// decide that band; `authorizedIdentity` makes only the authorized part decide it, so a
	// treatment cannot win the band by covering obligations with neutrals or with one hue twice.
	let comparison = compareDescending(utilityLevel(first.relationUtility), utilityLevel(second.relationUtility))
	if (comparison === 0 && WINNER_RANKING_HYPOTHESES.identityAuthority) {
		comparison = compareDescending(first.identityCoverage, second.identityCoverage)
	}
	if (comparison === 0 && WINNER_RANKING_HYPOTHESES.authorizedIdentity) {
		comparison = compareDescending(utilityLevel(first.identityAuthorizedGain),
			utilityLevel(second.identityAuthorizedGain))
	}
	if (comparison === 0) {
		comparison = compareDescending(utilityLevel(first.qualityUtility), utilityLevel(second.qualityUtility))
	}
	if (comparison === 0 && !WINNER_RANKING_HYPOTHESES.identityAuthority) {
		comparison = compareDescending(first.identityGain, second.identityGain)
	}
	if (comparison !== 0) return comparison
	if (BAND_TIE_BREAK === "raw-utility-first" ||
		(BAND_TIE_BREAK === "same-family-raw-utility" && sameFamilyAssignment(first.treatment, second.treatment))) {
		comparison = compareDescending(first.relationUtility, second.relationUtility)
		if (comparison !== 0) return comparison
	}
	if (BAND_TIE_BREAK === "same-family-band-extent" && first.treatment.gradient && second.treatment.gradient &&
		sameFamilyAssignment(first.treatment, second.treatment)) {
		comparison = compareDescending(
			first.treatment.scores.endpointBandSpread,
			second.treatment.scores.endpointBandSpread,
		)
		if (comparison !== 0) return comparison
	}
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
