import { completeTreatmentKey } from "./palette-core.ts";

import type { CompletePaletteTreatment } from "./palette-core.ts";

import { ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS } from "./policy.ts";

import { ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY, selectAlbumArtworkPaletteV2Phase3Treatments } from "./base-scoring.ts";

import type { AlbumArtworkPaletteV2Phase3IdentityInput, AlbumArtworkPaletteV2Phase3SelectorEvaluation } from "./base-scoring.ts";

import { albumArtworkPaletteV2Phase3SelectorV2Quality, earnedGradientClaim, gradientEvidenceStrength, roleSourceSupport } from "./palette-quality.ts";

import type { AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus } from "./palette-quality.ts";

import { GAMUT_COVERAGE_FIELD_GUARD, GAMUT_COVERAGE_SATURATION, normalizedGamutCoverage } from "./gamut-coverage.ts";

import type { ArtworkGamut, GamutCoverageScope } from "./gamut-coverage.ts";

export const WINNER_QUALITY_AXES = [
	"fieldFidelity",
	"surfaceFidelity",
	"artworkIdentity",
	"representativeness",
	"sourceSupport",
	"renderedFieldClaim",
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
	 * excludes identity and therefore reverses the preference). This makes the
	 * *authorized* part of the identity gain authoritative in both places: the
	 * coverage carried by distinct, genuinely chromatic identity directions,
	 * counted against the whole palette, as separated by `base-scoring.ts`.
	 *
	 * The looser variant that made **raw** coverage do this (`identityAuthority`,
	 * with `maximumIdentityGain` 0.10) was measured and rejected: raw coverage is
	 * equally available to a treatment that covers two near-neutral obligations or
	 * spends two roles on one hue, which produced a light-grey-on-near-white
	 * `johns` and broke `black`'s reviewed two-colour collapse. It was carried as
	 * a permanently-`false` companion flag that would have re-admitted exactly
	 * what this rule excludes if both were ever enabled; it is deleted rather
	 * than left as a trap.
	 */
	authorizedIdentity: true,
	/**
	 * A collapsed surface has no surface to be faithful about: its
	 * `surfaceFidelity` is `1 - surfaceOpportunity`, a statement about the
	 * distinct-surface alternatives available to its *background family*, not
	 * about the rendered treatment. Comparing it across treatments with
	 * different background families rewards choosing a background that had no
	 * good partner. Substitute a constant for the collapsed reading only.
	 */
	fieldOwnershipBeforeCollapseEconomy: true,
})

/**
 * Gradient-claim consistency is unconditional, and was previously a permanently-`true`
 * `gradientClaimConsistency` flag plus a `routeUnearnedFieldFidelity` sub-flag also permanently
 * `true`. It states three things, all now inlined at their single use in `evaluateTreatment`:
 * an unearned gradient claim loses its field fidelity at winner level too (the wave-1 score it
 * used to be read from has no such rule); a legitimately earned gradient must not be structurally
 * out-scored on the claim axis by any flat; and a foreground or accent whose APCA sign flips
 * across the gradient samples crosses zero contrast somewhere inside the rendered field.
 *
 * The `false` branches were only reachable by editing the flag, and one of them depended on the
 * wave-1 `renderedGradientSalience` value that is now deleted (see `renderedFieldClaimScore`).
 */

export const FIELD_OWNERSHIP = Object.freeze({
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
	 *
	 * Three companion knobs were deleted as measured-inert, all of which had been
	 * evaluated and rejected before integration and were left set to their
	 * no-op values: `applyToEconomy` / `decorrelateEconomy` (both `false`, which
	 * made the economy substitution the identity function) and `weightTransfer` /
	 * `fieldFidelityWeightBoost` (both `0`, which made the weight vector exactly
	 * `BASE_QUALITY_WEIGHTS`). Their rationale is preserved in
	 * `research/v2-3-experiments/track-a/EXPERIMENT.md`.
	 */
	collapsedSurfaceFidelity: 0.45 as number | null,
})

const GRADIENT_CLAIM = Object.freeze({
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
	claimAxis: "evidence-strength" as "endpoint-source-fidelity" | "evidence-strength" | "honest-claims-only" | "earned-only",
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
 *
 * Why the contradicted ordering still stands: the alternative was implemented and
 * measured, and it does not fix the case either — `quality-after-decisive` lands
 * on a *third* accent (`#e0cdc7`), not the preferred pink, because the pink was
 * not in the eligible set at all. Track A's conclusion is that "the fix is not a
 * simple reorder, and it is not in winner scoring"; it belongs to whoever owns
 * transition promotion. See `research/v2-3-experiments/track-a/EXPERIMENT.md:272-275`
 * and the rejected-options table at `:378-382`.
 *
 * So this is an open question, not a settled one. It is pinned in
 * `test/configuration.test.ts` for merge attribution only, and it is decisive on
 * the one image where it fires (`adversarial-logic/VERDICTS.md:345`).
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
const FIELD_CLAIM_AXES: readonly WinnerQualityAxis[] = ["fieldFidelity", "surfaceFidelity", "renderedFieldClaim"]

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
		? ["renderedFieldClaim"]
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
	renderedFieldClaim: 0.08,
	foregroundPath: 0.15,
	accentFidelity: 0.06,
	accentPath: 0.08,
	coherence: 0.06,
	economy: 0.05,
})

/**
 * How much of the artwork's own colour the published palette stands for.
 *
 * The eleven weighted axes and the identity machinery all read a treatment against the *families the
 * seed domain proposed*. None of them reads the **artwork's distribution of colour** and asks whether
 * four published colours span it, which is why a palette could be dull, near-mono-hue, or drop an
 * entire pink-and-purple splash and still rank first on every existing axis. Measured separation
 * against the reviewed complaints is AUC 0.872, and a review batch preferred the higher-coverage
 * alternative on four of five decidable pairs, with the fifth explained by a disclosed midpoint
 * confound and three further pairs graded equal while the reviewer hand-assembled palettes that all
 * covered more than the incumbent. See `research/v2-3-experiments/track-x/EXPERIMENT.md`.
 *
 * `integration` picks *where* the measurement acts, and the three settings are not interchangeable:
 *
 * - `"utility"` adds the normalised coverage to `qualityUtility` as a twelfth weighted term **without**
 *   joining `WINNER_QUALITY_AXES`. The axis list drives domination and the sorted-level tiebreak, so
 *   staying out of it means the Pareto frontier and every tiebreak keep exactly the shape they were
 *   calibrated with, and only the scalar objective moves. This is the smallest blast radius that can
 *   still change a winner.
 * - `"axis"` makes it a full twelfth member of `WINNER_QUALITY_AXES`, so it also guards domination.
 *   That enlarges the frontier on every image: a candidate poor on all eleven reviewed axes survives
 *   pruning merely by covering more hue. Measured, and reported, as the wider option.
 * - `"authority"` mirrors `authorizedIdentity` — a level guard in `dominates` plus a band tiebreak —
 *   giving coverage lexicographic force inside a utility band rather than a weight.
 *
 * `weight` is only read by `"utility"` and `"axis"`. It is deliberately **not** folded into
 * `BASE_QUALITY_WEIGHTS`: those eleven sum to 1 and are frozen, so coverage is an additive term on top
 * rather than a redistribution of weight away from axes that were reviewed at their current values.
 */
export const GAMUT_COVERAGE = Object.freeze({
	/**
	 * **Enabled `"utility"` by batch-26 review (2026-07-31)** — the adjudication the term shipped
	 * `"off"` to wait for. All eight movement pairs held or improved: the standing sailor-blue request
	 * is granted and preferred outright, one other pair prefers the coverage side, five are equal-good,
	 * and the previously adjudicated incumbent it trades away resolved as "both really work" with only
	 * a slight tiebreak lean to the incumbent. Zero pairs regressed. The term stays in `qualityUtility`
	 * only (`"utility"`), out of `WINNER_QUALITY_AXES`, so the Pareto frontier and every tiebreak keep
	 * their reviewed shape.
	 * See `research/v2-3-experiments/track-x/EXPERIMENT.md`.
	 */
	integration: "utility" as "off" | "utility" | "axis" | "authority",
	/**
	 * Set by the largest value at which no reviewed-strong artwork's field inverts. Above it the
	 * white-ground failure returns; below it the term stops reaching the cases it exists for. It is an
	 * acceptance bound, not a fit.
	 */
	weight: 0.05,
	scope: "field-and-accent" as GamutCoverageScope,
	/** See `GAMUT_COVERAGE_SATURATION`. `1` is the plain linear credit. */
	saturation: GAMUT_COVERAGE_SATURATION,
	/** See `GAMUT_COVERAGE_FIELD_GUARD`. `false` lets the field buy coverage unshaded. */
	fieldGuard: GAMUT_COVERAGE_FIELD_GUARD,
})

export type GamutScoringInput = Readonly<{
	gamut: ArtworkGamut
	/** Research override. Absent means the reviewed policy above, which is what the library ships. */
	integration?: typeof GAMUT_COVERAGE.integration
	weight?: number
	scope?: GamutCoverageScope
	saturation?: number
	fieldGuard?: boolean
}>

export const WINNER_SCORING_POLICY = Object.freeze({
	evidenceResolution: ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS.evidence,
	utilityResolution: ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS.utility,
	maximumIdentityGain: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.maximumIdentityGain,
	/**
	 * How far below the unrestricted winner a source-eligible or transition-promoted winner may
	 * fall. Read by `winner-selection.ts` for the source-eligibility envelope and, via
	 * `transition-promotion.ts`'s re-export, by both promotion gates.
	 */
	maximumQualityLoss: 0.12,
	qualityWeights: BASE_QUALITY_WEIGHTS,
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
	/**
	 * Share of what four colours could possibly have covered of this artwork's chromatic mass, in
	 * `[0, 1]`. `1` when no gamut was supplied or the artwork has no chromatic content — in both cases
	 * the term is constant across candidates and cannot reorder them.
	 */
	gamutCoverage: number
	paretoMember: boolean
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
	// `agreement` and `chromaticCarry` are both in [0, 1], so the result is too; the former
	// `Math.max(signAgreementFloor, …)` clamp with `signAgreementFloor = 0` could never bind.
	return agreement + (1 - agreement) * chromaticCarry
}

/**
 * Score of the rendered field claim.
 *
 * **This axis is not the wave-1 `renderedGradientSalience` it used to be named after.** That
 * function returned 1 for a not-applicable flat, while winner scoring has always overridden the
 * value to 0 for everything that is not an earned gradient — so at winner level the axis is a
 * *pro-gradient bonus*, not an anti-gradient handicap. Two different quantities under one name
 * cost Track A a full measured, reviewed and then retracted round (its revision note records
 * verifying the standalone function and not the override). The wave-1 function is deleted and the
 * winner axis is now named `renderedFieldClaim` after what it actually scores.
 *
 * The deleted `legacy-salience` option was the only consumer of that wave-1 value:
 * `sqrt(endpointSalience * evidenceStrength)`, whose defect is that `endpointSalience` is just the
 * OKLab distance between the endpoints, so a fitted endpoint pair beat exact dense family
 * representatives purely for being further apart. It is the behaviour the reviewed
 * `evidence-strength` axis was integrated to replace.
 *
 * `earned-only` gives every earned gradient 1, which removes that abstract salience advantage but
 * doubles the pro-gradient bonus.
 *
 * `honest-claims-only` additionally scores `missing` 1. Measured: it demotes three reviewed
 * gradients to flats, so `missing -> 0` is load-bearing and the axis is not a simple honesty
 * indicator. (This is why `gradientExpected` is still computed: it is what distinguishes `missing`
 * from `not-applicable`.)
 */
function renderedFieldClaimScore(
	treatment: CompletePaletteTreatment,
	status: AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus,
): number {
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
	gamutScoring: GamutScoringInput | null,
): WinnerEvaluation {
	const reusable = albumArtworkPaletteV2Phase3SelectorV2Quality(wave1.treatment, gradientExpected)
	const quality: WinnerQuality = {
		// Read from the gradient-aware quality, which zeroes the axis for an unearned gradient
		// claim. The wave-1 score has no such rule, so reading it here silently dropped the
		// penalty at the only stage that picks a winner.
		fieldFidelity: reusable.quality.fieldFidelity,
		surfaceFidelity: fieldOwnershipSurfaceFidelity(wave1.treatment, wave1.quality.surfaceFidelity),
		artworkIdentity: wave1.quality.artworkIdentity,
		representativeness: wave1.quality.representativeness,
		sourceSupport: reusable.quality.sourceSupport,
		renderedFieldClaim: renderedFieldClaimScore(wave1.treatment, reusable.gradientStatus),
		foregroundPath: reusable.quality.foregroundPath * gradientSignAgreement(wave1.treatment, "foreground"),
		accentFidelity: wave1.quality.accentFidelity,
		accentPath: reusable.quality.accentPath * gradientSignAgreement(wave1.treatment, "accent"),
		coherence: wave1.quality.coherence,
		economy: wave1.quality.economy,
	}
	for (const axis of WINNER_QUALITY_AXES) {
		if (!Number.isFinite(quality[axis])) throw new TypeError(`Non-finite winner quality axis ${axis}`)
	}
	// `1` when no gamut is supplied: a constant across candidates cannot reorder them, and it keeps the
	// `maximumQualityLoss` envelope comparing like with like, since that is a difference of utilities.
	const coverage = gamutScoring === null
		? 1
		: normalizedGamutCoverage(
			gamutScoring.gamut,
			wave1.treatment,
			gamutScoring.scope ?? GAMUT_COVERAGE.scope,
			gamutScoring.saturation ?? GAMUT_COVERAGE.saturation,
			// `fieldGuard` arrives already gated on the artwork's field being indistinguishable from grey
			// (see `isAchromaticField`). When it fires the field earns **nothing**: on an artwork whose
			// ground is genuinely neutral there is no colour there to represent, so any coverage the
			// background and surface could show would have to be imported from somewhere the field is not.
			// When it does not fire the axis pays in full, which is what lets it replace a dull field.
			(gamutScoring.fieldGuard ?? GAMUT_COVERAGE.fieldGuard) ? 0 : 1,
			// Read only by the `"mark-bearing"` scope. Computed once, in the identity objective that
			// owns the predicate, rather than recomputed here from a second copy of the rule.
			wave1.markBearingForeground,
		)
	if (!Number.isFinite(coverage)) throw new TypeError("Non-finite gamut coverage")
	const integration = gamutScoring?.integration ?? GAMUT_COVERAGE.integration
	const weight = gamutScoring?.weight ?? GAMUT_COVERAGE.weight
	const utility = qualityUtility(quality)
		+ (gamutScoring !== null && (integration === "utility" || integration === "axis") ? weight * coverage : 0)
	const identityGain = wave1.identityGain
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
		gamutCoverage: coverage,
		paretoMember: false,
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
	gamutMode: typeof GAMUT_COVERAGE.integration,
): boolean {
	let strictlyBetter = false
	if (BAND_TIE_BREAK === "same-family-band-extent" && first.treatment.gradient && second.treatment.gradient &&
		sameFamilyAssignment(first.treatment, second.treatment) &&
		comparableBandSpread(first, second) &&
		second.treatment.scores.endpointBandSpread! > first.treatment.scores.endpointBandSpread!) {
		// Covering more of the gradient's surface is evidence in its own right:
		// a pair that spans more of the endpoint bands is not dominated by a
		// narrower pair of the same families, however the other axes fall.
		return false
	}
	if (WINNER_RANKING_HYPOTHESES.authorizedIdentity) {
		const authorized = (evaluation: WinnerEvaluation): number =>
			utilityLevel(evaluation.identityAuthorizedGain)
		if (authorized(first) < authorized(second)) return false
		if (authorized(first) > authorized(second)) strictlyBetter = true
	}
	// Only the two wider integrations let coverage guard domination. Under `"utility"` the frontier
	// keeps exactly the shape the eleven reviewed axes give it, and coverage acts on the objective
	// alone — a candidate cannot survive pruning merely by covering more hue.
	if (gamutMode === "axis" || gamutMode === "authority") {
		const covered = (evaluation: WinnerEvaluation): number => evidenceLevel(evaluation.gamutCoverage)
		if (covered(first) < covered(second)) return false
		if (covered(first) > covered(second)) strictlyBetter = true
	}
	for (const axis of WINNER_QUALITY_AXES) {
		if (first.evidenceLevels[axis] < second.evidenceLevels[axis]) return false
		if (first.evidenceLevels[axis] > second.evidenceLevels[axis]) strictlyBetter = true
	}
	return strictlyBetter
}

/**
 * Whether the band-extent axis carries a measurement on *both* candidates.
 *
 * Not every gradient producer can measure a representative's spread inside its endpoint
 * band — a density-synthesized colour may land in a bin no band pixel occupies. Absence is
 * not a measured zero, and reading it as one is asymmetric: the candidate that published
 * nothing could never block domination by a same-family candidate that did, while the
 * reverse always blocked. When either side is unmeasured the axis is simply incomparable,
 * so neither candidate wins or loses on it and the remaining axes decide.
 */
function comparableBandSpread(first: WinnerEvaluation, second: WinnerEvaluation): boolean {
	return first.treatment.scores.endpointBandSpread !== null &&
		second.treatment.scores.endpointBandSpread !== null
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
	gamutMode: typeof GAMUT_COVERAGE.integration = "off",
): number {
	// Inside one utility band the order otherwise falls back to `qualityUtility`, which excludes
	// identity and therefore reverses the preference. `authorizedIdentity` makes the authorized
	// part decide the band, so a treatment cannot win it by covering obligations with neutrals or
	// with one hue twice.
	let comparison = compareDescending(utilityLevel(first.relationUtility), utilityLevel(second.relationUtility))
	if (comparison === 0 && WINNER_RANKING_HYPOTHESES.authorizedIdentity) {
		comparison = compareDescending(utilityLevel(first.identityAuthorizedGain),
			utilityLevel(second.identityAuthorizedGain))
	}
	// `"authority"` gives coverage lexicographic force inside a band instead of a weight — the shape
	// `authorizedIdentity` uses. `"utility"` and `"axis"` have already spent their influence in
	// `relationUtility`, so adding it again here would double-count it.
	if (comparison === 0 && gamutMode === "authority") {
		comparison = compareDescending(evidenceLevel(first.gamutCoverage), evidenceLevel(second.gamutCoverage))
	}
	if (comparison === 0) {
		comparison = compareDescending(utilityLevel(first.qualityUtility), utilityLevel(second.qualityUtility))
	}
	if (comparison === 0) {
		comparison = compareDescending(first.identityGain, second.identityGain)
	}
	if (comparison !== 0) return comparison
	if (BAND_TIE_BREAK === "raw-utility-first" ||
		(BAND_TIE_BREAK === "same-family-raw-utility" && sameFamilyAssignment(first.treatment, second.treatment))) {
		comparison = compareDescending(first.relationUtility, second.relationUtility)
		if (comparison !== 0) return comparison
	}
	if (BAND_TIE_BREAK === "same-family-band-extent" && first.treatment.gradient && second.treatment.gradient &&
		sameFamilyAssignment(first.treatment, second.treatment) && comparableBandSpread(first, second)) {
		comparison = compareDescending(
			first.treatment.scores.endpointBandSpread!,
			second.treatment.scores.endpointBandSpread!,
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

/**
 * `gamutScoring` is optional and omitting it reproduces the pre-coverage ranking exactly: every
 * candidate then carries `gamutCoverage: 1`, which adds the same constant to every utility and guards
 * no domination. That is what keeps the ~30 two-argument call sites across the eval harness and the
 * experiment tracks compiling and meaning what they meant.
 */
export function scorePaletteCandidates(
	treatments: readonly CompletePaletteTreatment[],
	identity?: AlbumArtworkPaletteV2Phase3IdentityInput,
	gamutScoring?: GamutScoringInput | null,
): WinnerScoring {
	if (treatments.length === 0) throw new RangeError("The palette candidate domain is empty")
	const scoring = gamutScoring ?? null
	const gamutMode = scoring === null ? "off" : scoring.integration ?? GAMUT_COVERAGE.integration
	const compare = (first: WinnerEvaluation, second: WinnerEvaluation) =>
		compareEvaluations(first, second, gamutMode)
	const orderedTreatments = [...treatments].sort((first, second) =>
		compareAscii(treatmentStructuralKey(first), treatmentStructuralKey(second)))
	const wave1 = selectAlbumArtworkPaletteV2Phase3Treatments(orderedTreatments, identity)
	const earnedGradientClaims = new Set(orderedTreatments.filter(earnedGradientClaim)
		.map(renderedFieldClaimKey))
	const rawEvaluations = wave1.evaluations.map((evaluation) => evaluateTreatment(
		evaluation,
		earnedGradientClaims.has(renderedFieldClaimKey(evaluation.treatment)),
		gamutMode === "off" ? null : scoring,
	)).sort(compare)
	// `some` short-circuits on the first dominator, where the previous `filter(...).sort(...)`
	// scanned every candidate and then sorted the whole dominator list to read `[0].key` — a value
	// nothing consumed. Only `paretoMember` is used, and it is unchanged.
	const evaluations = rawEvaluations.map((evaluation): WinnerEvaluation => ({
		...evaluation,
		paretoMember: !rawEvaluations.some((candidate) =>
			candidate !== evaluation && dominates(candidate, evaluation, gamutMode)),
	})).sort(compare)
	const frontier = evaluations.filter(({ paretoMember }) => paretoMember).sort(compare)
	if (frontier.length === 0) throw new Error("The palette quality frontier is empty")
	const winner = frontier[0]
	return {
		winner: winner.treatment,
		evaluations,
	}
}
