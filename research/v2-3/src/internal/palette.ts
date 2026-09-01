import { completeTreatmentKey, constructAlbumArtworkPaletteV2Phase3SupplementalTreatments, buildPaletteSeedDomain, DEFAULT_PALETTE_EXTRACTION_OPTIONS, earnedRenderMidpoint } from "./palette-core.ts";

import type { PaletteExtractionOptions } from "./palette-core.ts";

import { mixOKLab, okDistance } from "./color.ts";

import type { CompletePaletteTreatment, EmergencyEligibility, IdentityObligation } from "./palette-core.ts";

import { evaluateAlbumArtworkPaletteV2Phase3CompleteLineageDescriptor } from "./source-eligibility.ts";

import type { AlbumArtworkPaletteV2Phase3CompleteLineageCandidateEligibility, AlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain } from "./source-eligibility.ts";

import { evaluateAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath } from "./gradient-support.ts";

import type { AlbumArtworkPaletteV2Phase3ArmSupportedGradientPathResult, AlbumArtworkPaletteV2Phase3SupportedGradientMidpointDescriptor } from "./gradient-support.ts";

import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "./candidate-domain.ts";

import type { AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType, AlbumArtworkPaletteV2Phase3LogicalDescriptor, AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis } from "./candidate-domain.ts";

import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "./candidate-materialization.ts";

import { GAMUT_COVERAGE, promotionEnvelopeUtility, resolveObjectiveRepairs, scorePaletteCandidates, TRANSITION_PROMOTION_ORDER } from "./winner-scoring.ts";

import type { GamutScoringInput, ObjectiveRepairOverrides, ObjectiveRepairPolicy } from "./winner-scoring.ts";

import { buildArtworkGamut, isAchromaticField } from "./gamut-coverage.ts";

import type { GamutCoverageScope } from "./gamut-coverage.ts";

import type { WinnerEvaluation, WinnerScoring } from "./winner-scoring.ts";

import type { RoleSpecificIdentityObligation } from "./role-obligations.ts";

import type { AlbumArtworkPaletteV2Phase3IdentityRoleRequirement as IdentityRoleRequirement } from "./base-scoring.ts";

import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "./transition-normalization.ts";

import { buildRoleEvidence } from "./role-evidence.ts";

import { evaluateTransitionCandidates, MAXIMUM_WINNER_QUALITY_LOSS } from "./transition-promotion.ts";

import type { MaterializedCandidate, TransitionCandidate } from "./transition-promotion.ts";

import { selectSourceEligibleWinner } from "./winner-selection.ts";

import { restrictTextRoleToStrongestClaim } from "./text-role-restriction.ts";

import { rampMidpointInsertion } from "./ramp-midpoint.ts";

import { repairZeroContrastPairs } from "./zero-contrast-repair.ts";

import type { PublishedPalette, RepairSlateEntry, ZeroContrastPair } from "./zero-contrast-repair.ts";

import type { NativePaletteEvidence } from "./palette-core.ts";

import type { RawImage } from "./types.ts";

const NO_MIDPOINT = Object.freeze({
	kind: "none" as const,
	position: null,
	color: null,
	provenance: null,
})

type WinnerSelection = Readonly<{
	winner: CompletePaletteTreatment
	transitionPromoted: boolean
	eligibility: AlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain<MaterializedCandidate>
}>

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function compareDescending(first: number, second: number): number {
	return second - first
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
		treatment.gradient
			? `${treatment.gradientEvidence?.topology ?? "unsupported"}:${treatment.gradientEvidence?.direction ?? "unsupported"}`
			: "flat",
		treatment.sourceFieldHypothesisId,
	].join("\0")
}

function compareTransitionCandidates(
	first: Readonly<{ evaluation: WinnerEvaluation; candidate: TransitionCandidate }>,
	second: Readonly<{ evaluation: WinnerEvaluation; candidate: TransitionCandidate }>,
): number {
	const decisive = compareDescending(first.candidate.decisiveCoverage, second.candidate.decisiveCoverage)
	if (decisive !== 0) return decisive
	const quality = compareDescending(first.candidate.baseQualityUtility, second.candidate.baseQualityUtility)
	if (TRANSITION_PROMOTION_ORDER === "quality-after-decisive" && quality !== 0) return quality
	return compareDescending(first.candidate.totalObligationCoverage, second.candidate.totalObligationCoverage) ||
		compareDescending(first.candidate.existingFamilyIdentity, second.candidate.existingFamilyIdentity) ||
		compareDescending(first.candidate.roleEvidence, second.candidate.roleEvidence) ||
		quality ||
		compareAscii(first.evaluation.key, second.evaluation.key)
}

function selectWinner(input: Readonly<{
	scored: WinnerScoring
	materialized: readonly MaterializedCandidate[]
	roleObligations: readonly RoleSpecificIdentityObligation[]
	acceptedTransitionHypothesisIds: readonly string[]
	identityObligations: readonly IdentityObligation[]
	identityRoleRequirements: readonly IdentityRoleRequirement[]
	emergency: EmergencyEligibility | null
	gamutScoring: GamutScoringInput | null
	repairOverrides: ObjectiveRepairOverrides | null
	repairs: ObjectiveRepairPolicy
}>): WinnerSelection {
	// The source-eligible sub-domain must be ranked under the SAME objective as the full domain.
	// `selectSourceEligibleWinner` compares the two winners against `maximumQualityLoss`, so ranking
	// the subset without the gamut term while the full domain has it would compare two different
	// utilities and could throw the envelope error on a perfectly legal winner.
	const sourceEligible = selectSourceEligibleWinner({
		materialized: input.materialized,
		identityObligations: input.identityObligations,
		identityRoleRequirements: input.identityRoleRequirements,
		emergency: input.emergency,
		fullDomainSelection: input.scored,
		gamutScoring: input.gamutScoring,
		repairOverrides: input.repairOverrides,
	})
	const unrestrictedKey = completeTreatmentKey(input.scored.winner)
	const sourceWinner = sourceEligible.winner.treatment
	const sourceWinnerKey = completeTreatmentKey(sourceWinner)
	const evaluations = new Map(input.scored.evaluations.map((evaluation) => [evaluation.key, evaluation]))
	const unrestrictedEvaluation = evaluations.get(unrestrictedKey)
	const sourceWinnerEvaluation = evaluations.get(sourceWinnerKey)
	if (!unrestrictedEvaluation || !sourceWinnerEvaluation) throw new Error("Winner evaluation is missing")

	const transitionInput = { ...input.scored, winner: sourceWinner }
	const candidates = evaluateTransitionCandidates(
		transitionInput,
		input.materialized,
		input.roleObligations,
		input.acceptedTransitionHypothesisIds,
		input.repairs,
	)
	const eligibilityByKey = new Map(sourceEligible.eligibility.candidates.map((candidate) =>
		[candidate.key, candidate]))
	const materializedByKey = new Map(input.materialized.map((candidate) => [candidate.key, candidate]))
	const acceptedTransitions = new Set(input.acceptedTransitionHypothesisIds)
	const transitionCandidates = candidates
		.filter(({ promotionEligible, earnedNativeTransition }) => promotionEligible && earnedNativeTransition)
		.filter(({ key }) => {
			const evaluation = evaluations.get(key)
			if (!evaluation) return false
			const selectedStructure = treatmentStructuralKey(evaluation.treatment)
			return materializedByKey.get(key)?.descriptors.some((descriptor) =>
				descriptor.sourceType === "native-field-transition" &&
				acceptedTransitions.has(descriptor.fieldHypothesis.id) &&
				descriptor.fieldHypothesis.gradientEvidence !== null &&
				treatmentStructuralKey(descriptor.treatment) === selectedStructure &&
				evaluateAlbumArtworkPaletteV2Phase3CompleteLineageDescriptor(key, descriptor).ordinaryEligible) === true
		})
		.map((candidate) => ({ candidate, evaluation: evaluations.get(candidate.key)! }))
		.filter(({ evaluation }) => promotionEnvelopeUtility(evaluation, input.repairs) + 1e-12 >=
			promotionEnvelopeUtility(unrestrictedEvaluation, input.repairs) - MAXIMUM_WINNER_QUALITY_LOSS)
		.sort(compareTransitionCandidates)
	const winnerEvaluation = transitionCandidates[0]?.evaluation ?? sourceWinnerEvaluation
	const winnerLineage = eligibilityByKey.get(winnerEvaluation.key)
	if (!winnerLineage?.eligible || winnerLineage.basis === "ineligible") {
		throw new Error("Selected winner is not source eligible")
	}
	return {
		winner: winnerEvaluation.treatment,
		transitionPromoted: winnerEvaluation.key !== sourceWinnerKey,
		eligibility: sourceEligible.eligibility,
	}
}

function exactFlatRoleSibling(
	materialized: readonly MaterializedCandidate[],
	winner: CompletePaletteTreatment,
): MaterializedCandidate | null {
	return materialized.find(({ treatment }) =>
		!treatment.gradient &&
		(["background", "surface", "foreground", "accent"] as const).every((role) =>
			treatment[role].hex === winner[role].hex && treatment[role].generated === winner[role].generated) &&
		treatment.collapse.surface === winner.collapse.surface &&
		treatment.collapse.accent === winner.collapse.accent) ?? null
}

function sourceConnectedTypes(
	candidate: MaterializedCandidate,
	lineage: AlbumArtworkPaletteV2Phase3CompleteLineageCandidateEligibility | null,
): AlbumArtworkPaletteV2Phase3FieldHypothesisSourceType[] {
	if (!lineage?.eligible || lineage.basis === "ineligible" || lineage.key !== candidate.key) return []
	const selectedStructure = treatmentStructuralKey(candidate.treatment)
	const eligibilityByIdentity = new Map(lineage.descriptors.map((descriptor) =>
		[descriptor.identity, descriptor]))
	return [...new Set(candidate.descriptors
		.filter((descriptor) => {
			if (treatmentStructuralKey(descriptor.treatment) !== selectedStructure) return false
			const evaluated = evaluateAlbumArtworkPaletteV2Phase3CompleteLineageDescriptor(candidate.key, descriptor)
			const known = eligibilityByIdentity.get(evaluated.identity)
			return lineage.basis === "ordinary-complete-source-lineage"
				? evaluated.ordinaryEligible && known?.ordinaryEligible === true
				: known?.normativeEmergencyEligible === true && evaluated.canonicalTreatmentMatches &&
					evaluated.fieldConnectionComplete && evaluated.lineageBindingsComplete
		})
		.map(({ sourceType }) => sourceType))].sort(compareAscii)
}

/**
 * Whether the field's measured midpoint colour is far enough off the straight line between
 * the rendered endpoints to earn a third stop.
 *
 * The existing three-stop route asks whether the endpoints differ in hue by at least 60
 * degrees. That is a proxy: a large hue difference means the straight OKLab interpolation
 * cuts a chord across the artwork's actual traversal, so the two-stop render invents colours
 * the artwork never contains. The proxy misses every field that traverses the same hue
 * non-linearly -- a deep orange rising through amber to cream stays within one hue the whole
 * way, yet the chord still misses the amber entirely.
 *
 * Measuring the deviation directly subsumes the proxy and generalises it, and it is
 * self-neutralising: a field that really does run straight between its endpoints measures
 * near zero and earns nothing, which is correct, because for such a field the two-stop
 * render is already exact.
 */
function earnedFieldMidpoint(
	winner: CompletePaletteTreatment,
): AlbumArtworkPaletteV2Phase3SupportedGradientMidpointDescriptor {
	if (!winner.gradient) return NO_MIDPOINT
	// Same call the contrast evidence makes, so the two can never disagree about what renders.
	//
	// A veto used to sit here in addition, refusing any midpoint within one bin step of an
	// endpoint on the stated grounds that it "would render as the same two-stop ramp". That
	// reason is false, and provably so: writing R3 and R2 for the three- and two-stop ramps,
	// R3(t) - R2(t) = 2t * (M - chordMid) for t <= 0.5 and 2(1 - t) * (M - chordMid) for
	// t >= 0.5, so max|R3 - R2| IS the chord deviation, for every triple, and where the midpoint
	// sits relative to an endpoint has no bearing on how far the render moves. The chord test
	// alone therefore already answers "does the third stop change the render".
	//
	// What that veto was *also* doing, by accident and in the wrong currency, was keeping the
	// ramp from stopping at a colour it already shows — a real requirement, since a midpoint
	// equal to an endpoint bends the render maximally while adding no colour. That requirement
	// now lives in `earnedRenderMidpoint` as an explicit perceptual-distinctness test, measured
	// in ΔE rather than in OKLab bin steps, because OKLab cannot express it: see
	// ALBUM_ARTWORK_PALETTE_V2_MINIMUM_MIDPOINT_ENDPOINT_DIFFERENCE.
	const evidence = earnedRenderMidpoint(winner.background, winner.surface, winner.gradientEvidence?.fieldMidpoint)
	if (!evidence) return NO_MIDPOINT
	const chordDeviation = okDistance(
		evidence.oklab, mixOKLab(winner.background.oklab, winner.surface.oklab, 0.5))
	return {
		kind: "source-supported-three-stop",
		position: 0.5,
		color: { rgb: evidence.rgb, oklab: evidence.oklab, hex: evidence.hex },
		provenance: {
			origin: "field-midpoint-band",
			exactSource: true,
			familyId: evidence.provenance.familyId,
			fieldDomainId: evidence.provenance.fieldDomainId,
			pixelIndex: evidence.provenance.pixelIndex,
			x: evidence.provenance.x,
			y: evidence.provenance.y,
			bandPopulationFraction: evidence.bandPopulationFraction,
			occupancyShare: evidence.occupancyShare,
			spatialSpreadRatio: evidence.spatialSpreadRatio,
			chordDeviation,
		},
	}
}

function applyGradientSupport(
	selection: WinnerSelection,
	materialized: readonly MaterializedCandidate[],
	paths: AlbumArtworkPaletteV2Phase3ArmSupportedGradientPathResult,
): Readonly<{
	winner: CompletePaletteTreatment
	midpoint: AlbumArtworkPaletteV2Phase3SupportedGradientMidpointDescriptor
}> {
	const baseline = selection.winner
	const baselineKey = completeTreatmentKey(baseline)
	const selectedGradient = selection.transitionPromoted && baseline.gradient
	const path = selectedGradient
		? paths.paths.find(({ hypothesisId }) => hypothesisId === baseline.sourceFieldHypothesisId) ?? null
		: null
	if (!selectedGradient || path?.eligible === true) {
		const transitionMidpoint = selectedGradient && path?.eligible === true ? path.midpoint : NO_MIDPOINT
		return {
			winner: baseline,
			midpoint: transitionMidpoint.kind === "source-supported-three-stop"
				? transitionMidpoint
				: earnedFieldMidpoint(baseline),
		}
	}

	const candidateByKey = new Map(materialized.map((candidate) => [candidate.key, candidate]))
	const lineageByKey = new Map(selection.eligibility.candidates.map((candidate) =>
		[candidate.key, candidate]))
	const sourceCandidate = candidateByKey.get(baselineKey)
	if (!sourceCandidate) throw new Error("Gradient winner source is missing")
	const exactFlat = exactFlatRoleSibling(materialized, baseline)
	const exactLineage = exactFlat ? lineageByKey.get(exactFlat.key) ?? null : null
	const exactSourceTypes = exactFlat ? sourceConnectedTypes(exactFlat, exactLineage) : []
	if (exactFlat && exactSourceTypes.length > 0) return { winner: exactFlat.treatment, midpoint: NO_MIDPOINT }

	const sourceLineage = lineageByKey.get(sourceCandidate.key) ?? null
	if (sourceConnectedTypes(sourceCandidate, sourceLineage).length === 0) {
		throw new Error("Flat gradient fallback is not source connected")
	}
	return {
		winner: {
			...baseline,
			id: `supported-gradient-path-flat:${baseline.id}`,
			gradient: false,
			fieldTreatment: "separate-flat-fields",
			gradientEvidence: null,
		},
		midpoint: NO_MIDPOINT,
	}
}

/**
 * The ramp-midpoint route, applied to the field the rest of the pipeline has already settled.
 *
 * Placed here, and only here, for gradient neutrality. Everything that decides *whether* a gradient
 * publishes — winner selection, transition promotion, the supported-path flat fallback — has already
 * run and returned; this reads the decision and can only add a third stop to a treatment whose
 * `gradient` is already `true` and which has none. A flat winner is returned untouched, so the set of
 * artworks that publish a gradient is provably the same with the flag on and off.
 *
 * With `RAMP_MIDPOINT_INSERTION` off, `rampMidpointInsertion` returns `null` before it reads a pixel
 * and this function is the identity.
 */
function applyRampMidpoint(
	evidence: NativePaletteEvidence,
	gradient: Readonly<{
		winner: CompletePaletteTreatment
		midpoint: AlbumArtworkPaletteV2Phase3SupportedGradientMidpointDescriptor
	}>,
): AlbumArtworkPaletteV2Phase3SupportedGradientMidpointDescriptor {
	if (!gradient.winner.gradient) return gradient.midpoint
	const decision = rampMidpointInsertion(
		evidence,
		gradient.winner.background,
		gradient.winner.surface,
		gradient.midpoint.kind === "source-supported-three-stop",
	)
	return decision?.descriptor ?? gradient.midpoint
}

/**
 * `gamutOverride` exists so a research harness can sweep the coverage integration and weight over the
 * *real* pipeline instead of a reimplementation of it. It is not part of the public `extractPalette`
 * surface and omitting it is the reviewed behaviour; `PaletteExtractionOptions` stays a user-facing
 * type carrying only parameters a library consumer is meant to set.
 */
export function extractPaletteDetails(
	image: RawImage,
	options: PaletteExtractionOptions = DEFAULT_PALETTE_EXTRACTION_OPTIONS,
	gamutOverride?: Readonly<{
		integration?: typeof GAMUT_COVERAGE.integration
		weight?: number
		scope?: GamutCoverageScope
		saturation?: number
		fieldGuard?: boolean
	}>,
	/**
	 * Research override for `OBJECTIVE_REPAIRS`, same posture and same reason as `gamutOverride`:
	 * it lets a harness measure each structural repair over the real pipeline. Omitting it is the
	 * shipped behaviour.
	 */
	repairOverrides?: ObjectiveRepairOverrides | null,
	/**
	 * Research override for `ZERO_CONTRAST_REPAIR_PAIRS`, same posture and same reason as the two
	 * above: the four role pairs have different costs, so a harness has to be able to measure each
	 * coverage set over the real pipeline rather than a reimplementation of it. Omitting it is the
	 * shipped behaviour, and the shipped set is empty.
	 */
	zeroContrastRepairPairs?: readonly ZeroContrastPair[] | null,
	/** Research override for `ZERO_CONTRAST_PROTECTED_PAIRS`; see that constant. */
	zeroContrastProtectedPairs?: readonly ZeroContrastPair[] | null,
	/**
	 * Research hook, same posture as the overrides above: it hands a harness the repair slate and the
	 * palette that would be published before any repair, so questions like "was this palette even
	 * reachable" can be answered against the real pipeline. It is read-only — nothing it receives is
	 * consulted again — and omitting it changes nothing.
	 */
	observeRepairSlate?: ((observation: Readonly<{
		slate: readonly RepairSlateEntry[]
		published: PublishedPalette
	}>) => void) | null,
): Readonly<{
	width: number
	height: number
	winner: CompletePaletteTreatment
	midpoint: AlbumArtworkPaletteV2Phase3SupportedGradientMidpointDescriptor
}> {
	const seed = buildPaletteSeedDomain(image, options)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
	const transitionEnvelope = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(
		common.evidence.nativeFieldTransitions,
	)
	const normalizedTransitionById = new Map(transitionEnvelope.hypotheses.map((hypothesis) =>
		[hypothesis.id, hypothesis]))
	const candidateFields: AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[] = common.fieldHypotheses.map((field) =>
		field.sourceType === "native-field-transition"
			? { ...field, hypothesis: normalizedTransitionById.get(field.hypothesis.id) ?? field.hypothesis }
			: field)
	const supplementalFields = candidateFields.filter(({ sourceType }) => sourceType !== "native-seed")
	const sourceByHypothesisId = new Map(supplementalFields.map(({ sourceType, hypothesis }) =>
		[hypothesis.id, sourceType]))
	const supplemental = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
		common.evidence.augmentedNative,
		supplementalFields.map(({ hypothesis }) => hypothesis),
		options,
	)
	const sourcedFields: AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[] = [
		...common.seedAvailability.fieldHypotheses,
		...supplemental.hypotheses.map((hypothesis) => ({
			sourceType: sourceByHypothesisId.get(hypothesis.id)!,
			hypothesis,
		})),
	]
	const supplementalDescriptors: AlbumArtworkPaletteV2Phase3LogicalDescriptor[] =
		supplemental.treatments.map((descriptor) => {
			const sourceType = sourceByHypothesisId.get(descriptor.fieldHypothesis.id)
			if (!sourceType) throw new Error("Supplemental candidate source is missing")
			return { sourceType, ...descriptor }
		})
	const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
		[...common.seedAvailability.logicalDescriptors, ...supplementalDescriptors],
		common.seedAvailability.identityObligations,
	)
	const roleEvidence = buildRoleEvidence(
		common.evidence.augmentedNative,
		sourcedFields.map(({ hypothesis }) => hypothesis),
		common.seedAvailability.identityObligations.map(({ familyId }) => familyId),
	)
	const repairs = resolveObjectiveRepairs(repairOverrides)
	const gamutIntegration = gamutOverride?.integration ?? GAMUT_COVERAGE.integration
	const candidateTreatments = materialization.materialized.map(({ treatment }) => treatment)
	const identityInput = {
		obligations: common.seedAvailability.identityObligations,
		roleRequirements: roleEvidence.requirements,
	}
	let gamutScoring: GamutScoringInput | null = null
	if (gamutIntegration !== "off") {
		// The guard is gated on the field the algorithm picks with NO coverage pressure at all — the
		// reviewed axes' own answer to "what is this artwork's field". Asking it any other way lets the
		// term bias the answer it is about to be judged against. It costs one extra ranking pass over an
		// already-built domain, which is cheap next to constructing that domain.
		const reference = scorePaletteCandidates(candidateTreatments, identityInput, null, repairOverrides).winner
		gamutScoring = {
			// Built once from the OKLab buffer the native evidence already holds; shared by both rankings.
			gamut: buildArtworkGamut(common.evidence.native),
			integration: gamutIntegration,
			weight: gamutOverride?.weight ?? GAMUT_COVERAGE.weight,
			scope: gamutOverride?.scope ?? GAMUT_COVERAGE.scope,
			saturation: gamutOverride?.saturation ?? GAMUT_COVERAGE.saturation,
			// Shade the field ONLY when the artwork's own field is one you could not tell from grey.
			// Otherwise the axis pays full, which is what keeps it able to replace a dull field.
			fieldGuard: (gamutOverride?.fieldGuard ?? GAMUT_COVERAGE.fieldGuard)
				&& isAchromaticField([reference.background.oklab, reference.surface.oklab]),
		}
	}
	const scored = scorePaletteCandidates(candidateTreatments, identityInput, gamutScoring, repairOverrides)
	const materialized: MaterializedCandidate[] = materialization.materialized.map((candidate) => ({
		key: candidate.key,
		treatment: candidate.treatment,
		descriptors: candidate.descriptors as readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[],
	}))
	const selection = selectWinner({
		scored,
		materialized,
		roleObligations: roleEvidence.obligations,
		acceptedTransitionHypothesisIds: transitionEnvelope.creditedHypothesisIds,
		identityObligations: common.seedAvailability.identityObligations,
		identityRoleRequirements: roleEvidence.requirements,
		emergency: seed.emergency,
		gamutScoring,
		repairOverrides: repairOverrides ?? null,
		repairs,
	})
	const gradientPaths = evaluateAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath(common.evidence.native)
	const gradient = applyGradientSupport(selection, materialized, gradientPaths)
	// See `TEXT_ROLE_RESTRICTION`. Deliberately the LAST thing that happens: the field is fully
	// decided by this point — including the flat fallback and the midpoint — and a swap of the two
	// mark roles cannot reach any of it. Placing it earlier would let the exchanged roles feed
	// `exactFlatRoleSibling`, which matches on all four role colours, and a role move would silently
	// become a field move. That is the failure batch-31 declined.
	const published = restrictTextRoleToStrongestClaim({
		winner: gradient.winner,
		identityObligations: common.seedAvailability.identityObligations,
		identityRoleRequirements: roleEvidence.requirements,
	})
	/**
	 * Run one candidate treatment through the same two downstream stages the winner just went
	 * through, so a proposed repair is judged on what would actually be published for it.
	 *
	 * This exists because the midpoint is one of the things being checked, and the midpoint is not a
	 * property of a treatment — it is derived from the field the treatment stands on. A repair that
	 * re-picks the field therefore earns a different third stop, and reading the candidate's bare
	 * role colours would miss it entirely.
	 *
	 * `transitionPromoted` is deliberately `false` for a replacement. Promotion is something the
	 * selection stage confers on one specific candidate after weighing the transition envelope, and
	 * it is not ours to hand out afterwards; the conservative reading gives a re-picked candidate the
	 * midpoint it earns on its own field rather than one borrowed from a promotion it never won.
	 */
	const publishTreatment = (treatment: CompletePaletteTreatment): PublishedPalette => {
		const field = treatment === selection.winner
			? gradient
			: applyGradientSupport(
				{ winner: treatment, transitionPromoted: false, eligibility: selection.eligibility },
				materialized,
				gradientPaths,
			)
		return {
			treatment: restrictTextRoleToStrongestClaim({
				winner: field.winner,
				identityObligations: common.seedAvailability.identityObligations,
				identityRoleRequirements: roleEvidence.requirements,
			}),
			// The ramp-midpoint route runs for a re-picked candidate exactly as it ran for the
			// original winner, so the repair judges the midpoint that would actually be published.
			midpoint: applyRampMidpoint(common.evidence.native, field),
		}
	}
	// See `ZERO_CONTRAST_REPAIR_PAIRS`. Everything above — generation, materialization, ranking,
	// selection, the flat fallback and the mark-role swap — has already run and is untouched, which is
	// the whole point of doing this here rather than in `createTreatment`. The repair reads the winner
	// it is handed, fires only if that winner's own role pairs are unreadable, and otherwise returns
	// it unchanged.
	//
	// The slate is the source-eligible candidates in ranking order, which is the same ordering and the
	// same eligibility the winner itself had to satisfy — a repair may only reach for something the
	// pipeline was already willing to publish.
	const rankByKey = new Map(scored.evaluations.map((evaluation, position) => [evaluation.key, position]))
	const repairSlate: readonly RepairSlateEntry[] = selection.eligibility.eligibleCandidates.map((candidate) => ({
		key: candidate.key,
		rank: rankByKey.get(candidate.key) ?? Number.MAX_SAFE_INTEGER,
		treatment: candidate.treatment,
	}))
	const publishedMidpoint = applyRampMidpoint(common.evidence.native, gradient)
	observeRepairSlate?.({ slate: repairSlate, published: { treatment: published, midpoint: publishedMidpoint } })
	const repaired = repairZeroContrastPairs({
		published: { treatment: published, midpoint: publishedMidpoint },
		slate: repairSlate,
		publish: publishTreatment,
		...(zeroContrastRepairPairs ? { enforced: zeroContrastRepairPairs } : {}),
		...(zeroContrastProtectedPairs ? { protect: zeroContrastProtectedPairs } : {}),
	})
	// The outcome is deliberately NOT added to the returned shape: a new field would change the
	// canonicalised extraction for every artwork and break byte-identity while the flag is off. It is
	// recorded in the winner's `id` prefix instead, which is where trunk already records every other
	// post-ranking rearrangement, and which a sweep can read.
	return {
		width: image.width,
		height: image.height,
		midpoint: repaired.published.midpoint,
		winner: repaired.published.treatment,
	}
}
