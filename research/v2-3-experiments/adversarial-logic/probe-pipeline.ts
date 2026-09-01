/**
 * Adversarial-logic probe. Replays the v2-3 pipeline stage by stage using only
 * exported entry points, recording which mechanisms fire and which comparison
 * actually decides the winner. Read-only with respect to research/v2-3/.
 */
import { readdirSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import {
	buildPaletteSeedDomain,
	completeTreatmentKey,
} from "../../v2-3/src/internal/palette-core.ts"
import { constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../v2-3/src/internal/transition-normalization.ts"
import { buildRoleEvidence } from "../../v2-3/src/internal/role-evidence.ts"
import { scorePaletteCandidates, WINNER_SCORING_POLICY, WINNER_QUALITY_AXES, promotionEnvelopeUtility } from "../../v2-3/src/internal/winner-scoring.ts"
import type { WinnerEvaluation } from "../../v2-3/src/internal/winner-scoring.ts"
import { selectSourceEligibleWinner } from "../../v2-3/src/internal/winner-selection.ts"
import { evaluateTransitionCandidates, MAXIMUM_WINNER_QUALITY_LOSS } from "../../v2-3/src/internal/transition-promotion.ts"
import { evaluateAlbumArtworkPaletteV2Phase3CompleteLineageDescriptor } from "../../v2-3/src/internal/source-eligibility.ts"
import { evaluateAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath } from "../../v2-3/src/internal/gradient-support.ts"
import { roleSpecificObligationCoverage } from "../../v2-3/src/internal/role-obligations.ts"
import { mixOKLab, okDistance } from "../../v2-3/src/internal/color.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"

// The reviewed corpus is the *unscrambled* originals, which are gitignored and so
// absent from a fresh worktree; `images/` in git holds only the `-scrambled`
// decoys. Point IMAGES_DIR at the real corpus.
const IMAGES = process.env.IMAGES_DIR ?? join(process.cwd(), "images")
const OUT = join(process.cwd(), "research/v2-3-experiments/adversarial-logic")
const OUT_SUFFIX = process.env.OUT_SUFFIX ?? ""

const utilityLevel = (v: number) => Math.floor((v + 1e-12) / WINNER_SCORING_POLICY.utilityResolution)
const compareDescending = (a: number, b: number) => b - a
const compareAscii = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function sameFamilyAssignment(first: any, second: any): boolean {
	return first.gradient === second.gradient &&
		first.collapse.surface === second.collapse.surface &&
		first.collapse.accent === second.collapse.accent &&
		(["background", "surface", "foreground", "accent"] as const)
			.every((role) => first.familyRoles[role] === second.familyRoles[role])
}

/** Mirror of winner-scoring.compareEvaluations, reporting the deciding stage. */
function decidingStage(first: WinnerEvaluation, second: WinnerEvaluation): string {
	if (compareDescending(utilityLevel(first.relationUtility), utilityLevel(second.relationUtility)) !== 0) {
		return "relationUtility-band"
	}
	if (compareDescending(utilityLevel(first.identityAuthorizedGain), utilityLevel(second.identityAuthorizedGain)) !== 0) {
		return "authorizedIdentity-band"
	}
	if (compareDescending(utilityLevel(first.qualityUtility), utilityLevel(second.qualityUtility)) !== 0) {
		return "qualityUtility-band"
	}
	if (compareDescending(first.identityGain, second.identityGain) !== 0) return "raw-identityGain"
	if (first.treatment.gradient && second.treatment.gradient &&
		sameFamilyAssignment(first.treatment, second.treatment) &&
		compareDescending(first.treatment.scores.endpointBandSpread, second.treatment.scores.endpointBandSpread) !== 0) {
		return "band-extent-tiebreak"
	}
	const fl = WINNER_QUALITY_AXES.map((a) => first.evidenceLevels[a]).sort((x, y) => x - y)
	const sl = WINNER_QUALITY_AXES.map((a) => second.evidenceLevels[a]).sort((x, y) => x - y)
	for (let i = 0; i < fl.length; i++) if (fl[i] !== sl[i]) return "sorted-evidence-levels"
	for (const a of WINNER_QUALITY_AXES) if (first.evidenceLevels[a] !== second.evidenceLevels[a]) return "per-axis-evidence-levels"
	return "ascii-key"
}

function treatmentStructuralKey(t: any): string {
	return [
		completeTreatmentKey(t), t.fieldTreatment,
		t.familyRoles.background, t.familyRoles.surface, t.familyRoles.foreground, t.familyRoles.accent,
		t.collapse.surface ? "surface-collapsed" : "surface-distinct",
		t.collapse.accent ? "accent-collapsed" : "accent-distinct",
		`cardinality-${t.cardinality}`,
		t.gradient ? `${t.gradientEvidence?.topology ?? "unsupported"}:${t.gradientEvidence?.direction ?? "unsupported"}` : "flat",
		t.sourceFieldHypothesisId,
	].join("\0")
}

async function probe(file: string) {
	const t0 = Date.now()
	const image = await loadNativeImage(join(IMAGES, file))
	const tLoad = Date.now()
	const seed = buildPaletteSeedDomain(image)
	const tSeed = Date.now()
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
	const tCommon = Date.now()
	const transitionEnvelope = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(common.evidence.nativeFieldTransitions)
	const normalizedById = new Map(transitionEnvelope.hypotheses.map((h) => [h.id, h]))
	const candidateFields = common.fieldHypotheses.map((f) =>
		f.sourceType === "native-field-transition" ? { ...f, hypothesis: normalizedById.get(f.hypothesis.id) ?? f.hypothesis } : f)
	const supplementalFields = candidateFields.filter(({ sourceType }) => sourceType !== "native-seed")
	const sourceByHypothesisId = new Map(supplementalFields.map(({ sourceType, hypothesis }) => [hypothesis.id, sourceType]))
	const supplemental = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
		common.evidence.augmentedNative, supplementalFields.map(({ hypothesis }) => hypothesis))
	const sourcedFields = [
		...common.seedAvailability.fieldHypotheses,
		...supplemental.hypotheses.map((h) => ({ sourceType: sourceByHypothesisId.get(h.id)!, hypothesis: h })),
	]
	const supplementalDescriptors = supplemental.treatments.map((d) => ({ sourceType: sourceByHypothesisId.get(d.fieldHypothesis.id)!, ...d }))
	const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
		[...common.seedAvailability.logicalDescriptors, ...supplementalDescriptors] as any,
		common.seedAvailability.identityObligations)
	const tMaterial = Date.now()
	const roleEvidence = buildRoleEvidence(common.evidence.augmentedNative,
		sourcedFields.map(({ hypothesis }) => hypothesis),
		common.seedAvailability.identityObligations.map(({ familyId }) => familyId))
	const tRole = Date.now()
	const scored = scorePaletteCandidates(
		materialization.materialized.map(({ treatment }) => treatment),
		{ obligations: common.seedAvailability.identityObligations, roleRequirements: roleEvidence.requirements })
	const tScore = Date.now()
	const materialized = materialization.materialized.map((c) => ({ key: c.key, treatment: c.treatment, descriptors: c.descriptors as any }))
	const sourceEligible = selectSourceEligibleWinner({
		materialized,
		identityObligations: common.seedAvailability.identityObligations,
		identityRoleRequirements: roleEvidence.requirements,
		emergency: seed.emergency,
		fullDomainSelection: scored,
	})
	const tEligible = Date.now()

	// ---- ranking regime attribution on the *eligible* domain (the one that decides) ----
	const eligibleScored = scorePaletteCandidates(
		sourceEligible.eligibility.eligibleCandidates.map(({ treatment }) => treatment),
		{ obligations: common.seedAvailability.identityObligations, roleRequirements: roleEvidence.requirements })
	const evals = eligibleScored.evaluations
	const frontier = evals.filter(({ paretoMember }) => paretoMember)
	const paretoChangedWinner = frontier[0]?.key !== evals[0]?.key
	const stage = frontier.length > 1 ? decidingStage(frontier[0], frontier[1]) : "single-frontier-member"
	const stageOverall = evals.length > 1 ? decidingStage(evals[0], evals[1]) : "single-candidate"

	// how many candidates are on the frontier
	const frontierSize = frontier.length

	// ---- transition promotion ----
	const sourceWinner = sourceEligible.winner.treatment
	const sourceWinnerKey = completeTreatmentKey(sourceWinner)
	const evaluations = new Map(scored.evaluations.map((e) => [e.key, e]))
	const unrestrictedEvaluation = evaluations.get(completeTreatmentKey(scored.winner))!
	const transitionInput = { ...scored, winner: sourceWinner }
	const candidates = evaluateTransitionCandidates(transitionInput, materialized, roleEvidence.obligations, transitionEnvelope.creditedHypothesisIds)
	const acceptedTransitions = new Set(transitionEnvelope.creditedHypothesisIds)
	const materializedByKey = new Map(materialized.map((c) => [c.key, c]))
	const earnedCount = candidates.filter((c) => c.earnedNativeTransition).length
	const eligibleCount = candidates.filter((c) => c.promotionEligible && c.earnedNativeTransition).length
	const afterDescriptorFilter = candidates
		.filter(({ promotionEligible, earnedNativeTransition }) => promotionEligible && earnedNativeTransition)
		.filter(({ key }) => {
			const evaluation = evaluations.get(key)
			if (!evaluation) return false
			const selectedStructure = treatmentStructuralKey(evaluation.treatment)
			return materializedByKey.get(key)?.descriptors.some((d: any) =>
				d.sourceType === "native-field-transition" && acceptedTransitions.has(d.fieldHypothesis.id) &&
				d.fieldHypothesis.gradientEvidence !== null &&
				treatmentStructuralKey(d.treatment) === selectedStructure &&
				evaluateAlbumArtworkPaletteV2Phase3CompleteLineageDescriptor(key, d).ordinaryEligible) === true
		})
	const afterEnvelope = afterDescriptorFilter
		.map((c) => ({ c, e: evaluations.get(c.key)! }))
		.filter(({ e }) => promotionEnvelopeUtility(e) + 1e-12 >= promotionEnvelopeUtility(unrestrictedEvaluation) - MAXIMUM_WINNER_QUALITY_LOSS)

	// would quality-after-decisive ordering pick a different promotion?
	const orderCoverageFirst = [...afterEnvelope].sort((a, b) =>
		compareDescending(a.c.decisiveCoverage, b.c.decisiveCoverage) ||
		compareDescending(a.c.totalObligationCoverage, b.c.totalObligationCoverage) ||
		compareDescending(a.c.existingFamilyIdentity, b.c.existingFamilyIdentity) ||
		compareDescending(a.c.roleEvidence, b.c.roleEvidence) ||
		compareDescending(a.c.baseQualityUtility, b.c.baseQualityUtility) ||
		compareAscii(a.e.key, b.e.key))
	const orderQualityAfter = [...afterEnvelope].sort((a, b) => {
		const d = compareDescending(a.c.decisiveCoverage, b.c.decisiveCoverage)
		if (d !== 0) return d
		const q = compareDescending(a.c.baseQualityUtility, b.c.baseQualityUtility)
		if (q !== 0) return q
		return compareDescending(a.c.totalObligationCoverage, b.c.totalObligationCoverage) ||
			compareDescending(a.c.existingFamilyIdentity, b.c.existingFamilyIdentity) ||
			compareDescending(a.c.roleEvidence, b.c.roleEvidence) || compareAscii(a.e.key, b.e.key)
	})
	const promotionOrderMatters = (orderCoverageFirst[0]?.e.key ?? null) !== (orderQualityAfter[0]?.e.key ?? null)

	const winnerEvaluation = orderCoverageFirst[0]?.e ?? evaluations.get(sourceWinnerKey)!
	const winner = winnerEvaluation.treatment
	const transitionPromoted = winnerEvaluation.key !== sourceWinnerKey

	// promotion envelope: would "quality-utility" (unmodified) change admission?
	const envelopeQualityUtility = afterDescriptorFilter
		.map((c) => ({ c, e: evaluations.get(c.key)! }))
		.filter(({ e }) => e.qualityUtility + 1e-12 >= unrestrictedEvaluation.qualityUtility - MAXIMUM_WINNER_QUALITY_LOSS)
	const envelopeChoiceMatters = envelopeQualityUtility.length !== afterEnvelope.length

	// ---- gradient support / midpoint ----
	const paths = evaluateAlbumArtworkPaletteV2Phase3ArmSupportedGradientPath(common.evidence.native)
	const familyBinStep = common.evidence.native.familyBinStep
	const selectedGradient = transitionPromoted && winner.gradient
	const path = selectedGradient ? paths.paths.find((p) => p.hypothesisId === winner.sourceFieldHypothesisId) ?? null : null
	let midpointKind = "none"
	let chordDeviation: number | null = null
	if (selectedGradient && path?.eligible === true && path.midpoint.kind === "source-supported-three-stop") {
		midpointKind = "transition-path-stage"
	} else if (winner.gradient) {
		const ev = winner.gradientEvidence?.fieldMidpoint
		if (ev) {
			const chord = mixOKLab(winner.background.oklab, winner.surface.oklab, 0.5)
			chordDeviation = okDistance(ev.oklab, chord)
			const nearEndpoint = Math.min(okDistance(ev.oklab, winner.background.oklab), okDistance(ev.oklab, winner.surface.oklab))
			midpointKind = chordDeviation >= familyBinStep && nearEndpoint >= familyBinStep ? "field-midpoint-band" : "none(chord-fail)"
		} else {
			midpointKind = "none(no-field-midpoint-evidence)"
		}
	}
	const gradientGuardBypassed = winner.gradient && !transitionPromoted

	// ---- mechanism firing stats over the evidence ----
	const families = seed.evidence.families
	const markFamilies = families.filter((f) => f.markSupport > 0)
	const winnerRoles = ["background", "surface", "foreground", "accent"] as const
	const winnerUsesMark = winnerRoles.some((r) => {
		const s: any = (winner as any)[r].support
		return s && !("generated" in s) && s.markSupport > 0
	})

	// obligations
	const roleObligations = roleEvidence.obligations
	const decisiveObligations = roleObligations.filter((o) => o.requiredRole !== "ambiguous")
	const winnerCoverage = roleSpecificObligationCoverage(winner, roleObligations)

	// identity
	const identityObligations = common.seedAvailability.identityObligations
	const winnerEval = evaluations.get(completeTreatmentKey(winner))!
	const anyAuthorized = evals.filter((e) => e.identityAuthorizedGain > 0).length

	// band spread
	const gradientEvals = evals.filter((e) => e.treatment.gradient)
	const nonZeroBandSpread = gradientEvals.filter((e) => e.treatment.scores.endpointBandSpread > 0).length

	// field domains: diffuse-composite
	const diffuse = seed.fieldDomains.filter((d) => d.kind === "diffuse-composite")
	const paired = seed.fieldDomains.filter((d) => d.kind === "paired-corridor")

	// Authoritative shipped answer, straight through the real orchestration.
	const shipped = extractPaletteDetails(image)
	const shippedMidpoint = {
		kind: shipped.midpoint.kind,
		origin: shipped.midpoint.provenance?.origin ?? null,
		hex: shipped.midpoint.color?.hex ?? null,
		winnerGradient: shipped.winner.gradient,
		winnerHypothesis: shipped.winner.sourceFieldHypothesisId,
		replayAgrees: completeTreatmentKey(shipped.winner) === completeTreatmentKey(winner),
	}

	const t1 = Date.now()
	return {
		image: file,
		shippedMidpoint,
		width: image.width, height: image.height,
		timings: {
			load: tLoad - t0, seed: tSeed - tLoad, common: tCommon - tSeed,
			materialize: tMaterial - tCommon, roleEvidence: tRole - tMaterial,
			scoreFull: tScore - tRole, sourceEligible: tEligible - tScore, total: t1 - t0,
		},
		candidates: {
			seedTreatments: seed.completeTreatments.length,
			supplementalTreatments: supplemental.treatments.length,
			materialized: materialization.materialized.length,
			eligible: sourceEligible.eligibility.eligibleCandidates.length,
		},
		ranking: {
			frontierSize, paretoChangedWinner, decidingStageFrontier: stage, decidingStageOverall: stageOverall,
			anyAuthorizedIdentity: anyAuthorized,
			winnerAuthorizedGain: winnerEval.identityAuthorizedGain,
			winnerIdentityCoverage: winnerEval.identityCoverage,
		},
		promotion: {
			creditedTransitions: transitionEnvelope.creditedHypothesisIds.length,
			earnedNativeTransition: earnedCount,
			promotionEligible: eligibleCount,
			afterDescriptorFilter: afterDescriptorFilter.length,
			afterEnvelope: afterEnvelope.length,
			transitionPromoted, promotionOrderMatters, envelopeChoiceMatters,
		},
		gradient: {
			winnerGradient: winner.gradient,
			gradientGuardBypassed,
			midpointKind, chordDeviation, familyBinStep,
			gradientEvalCount: gradientEvals.length,
			nonZeroBandSpread,
			supportedPaths: paths.paths.length,
			eligiblePaths: paths.paths.filter((p) => p.eligible).length,
		},
		mark: {
			familyCount: families.length,
			markFamilyCount: markFamilies.length,
			maxMarkSupport: markFamilies.length ? Math.max(...markFamilies.map((f) => f.markSupport)) : 0,
			winnerUsesMark,
		},
		obligations: {
			identityObligations: identityObligations.length,
			roleObligations: roleObligations.length,
			decisiveRoleObligations: decisiveObligations.length,
			winnerCovered: winnerCoverage.coveredCount,
			winnerDecisiveCovered: winnerCoverage.foregroundCoveredCount + winnerCoverage.accentCoveredCount,
			winnerAmbiguousCovered: winnerCoverage.ambiguousCoveredCount,
		},
		domains: {
			total: seed.fieldDomains.length,
			diffuseComposite: diffuse.length,
			pairedCorridor: paired.length,
			diffuseEligible: diffuse.filter((d) => d.eligible).length,
		},
		winner: {
			key: completeTreatmentKey(winner),
			hypothesis: winner.sourceFieldHypothesisId,
			collapse: winner.collapse,
			cardinality: winner.cardinality,
			topology: winner.gradientEvidence?.topology ?? null,
			direction: winner.gradientEvidence?.direction ?? null,
		},
	}
}

const files = readdirSync(IMAGES)
	.filter((f) => /\.(jpg|jpeg|png|avif|webp)$/iu.test(f))
	.filter((f) => !/-(scrambled|masked|saliency|original)\./u.test(f))
	.sort()
const only = process.argv[2] ? files.filter((f) => f.includes(process.argv[2])) : files
const results: any[] = []
for (const file of only) {
	try {
		const r = await probe(file)
		results.push(r)
		console.error(`${file}: ${r.timings.total}ms frontier=${r.ranking.frontierSize} stage=${r.ranking.decidingStageFrontier} promoted=${r.promotion.transitionPromoted} grad=${r.gradient.winnerGradient} shipped=${r.shippedMidpoint.kind}/${r.shippedMidpoint.origin ?? "-"}/${r.shippedMidpoint.hex ?? "-"} credited=${r.promotion.creditedTransitions} marks=${r.mark.markFamilyCount}`)
	} catch (error) {
		results.push({ image: file, error: String(error) })
		console.error(`${file}: ERROR ${error}`)
	}
}
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, `probe-results${OUT_SUFFIX}.json`), JSON.stringify(results, null, "\t"))
console.error(`wrote ${results.length} results`)
