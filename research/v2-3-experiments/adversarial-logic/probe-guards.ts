/**
 * Fourth adversarial probe: the guards added by the recent campaign.
 *  - source-eligible quality-envelope margin (a throw, not a fallback)
 *  - band-extent domination guard: how much does it inflate the Pareto frontier
 *  - hue-aware APCA sign guard: how often does gradientSignAgreement bite
 */
import { readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, completeTreatmentKey, constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { buildRoleEvidence } from "../../v2-3/src/internal/role-evidence.ts"
import { scorePaletteCandidates, WINNER_QUALITY_AXES, WINNER_SCORING_POLICY } from "../../v2-3/src/internal/winner-scoring.ts"
import { selectSourceEligibleWinner } from "../../v2-3/src/internal/winner-selection.ts"

const IMAGES = join(process.cwd(), "images")
const OUT = join(process.cwd(), "research/v2-3-experiments/adversarial-logic")
const utilityLevel = (v: number) => Math.floor((v + 1e-12) / WINNER_SCORING_POLICY.utilityResolution)

function sameFamilyAssignment(a: any, b: any) {
	return a.gradient === b.gradient && a.collapse.surface === b.collapse.surface &&
		a.collapse.accent === b.collapse.accent &&
		(["background", "surface", "foreground", "accent"] as const).every((r) => a.familyRoles[r] === b.familyRoles[r])
}
function dominatesWithGuard(f: any, s: any, guard: boolean) {
	let better = false
	if (guard && f.treatment.gradient && s.treatment.gradient && sameFamilyAssignment(f.treatment, s.treatment) &&
		s.treatment.scores.endpointBandSpread > f.treatment.scores.endpointBandSpread) return false
	const a = utilityLevel(f.identityAuthorizedGain)
	const b = utilityLevel(s.identityAuthorizedGain)
	if (a < b) return false
	if (a > b) better = true
	for (const ax of WINNER_QUALITY_AXES) {
		if (f.evidenceLevels[ax] < s.evidenceLevels[ax]) return false
		if (f.evidenceLevels[ax] > s.evidenceLevels[ax]) better = true
	}
	return better
}
function dominatesNoAuthorized(f: any, s: any) {
	let better = false
	for (const ax of WINNER_QUALITY_AXES) {
		if (f.evidenceLevels[ax] < s.evidenceLevels[ax]) return false
		if (f.evidenceLevels[ax] > s.evidenceLevels[ax]) better = true
	}
	return better
}
function frontierOf(evals: any[], dom: (a: any, b: any) => boolean) {
	return evals.filter((e) => !evals.some((c) => c !== e && dom(c, e)))
}

const files = readdirSync(IMAGES).filter((f) => /\.(jpg|jpeg|png|avif|webp)$/iu.test(f)).sort()
const results: any[] = []
for (const file of files) {
	const image = await loadNativeImage(join(IMAGES, file))
	const seed = buildPaletteSeedDomain(image)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
	const supplementalFields = common.fieldHypotheses.filter(({ sourceType }) => sourceType !== "native-seed")
	const supplemental = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
		common.evidence.augmentedNative, supplementalFields.map(({ hypothesis }) => hypothesis))
	const bySource = new Map(supplementalFields.map(({ sourceType, hypothesis }) => [hypothesis.id, sourceType]))
	const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
		[...common.seedAvailability.logicalDescriptors,
			...supplemental.treatments.map((d) => ({ sourceType: bySource.get(d.fieldHypothesis.id)!, ...d }))] as any,
		common.seedAvailability.identityObligations)
	const roleEvidence = buildRoleEvidence(common.evidence.augmentedNative,
		[...common.seedAvailability.fieldHypotheses.map((f) => f.hypothesis), ...supplemental.hypotheses],
		common.seedAvailability.identityObligations.map(({ familyId }) => familyId))
	const identity = { obligations: common.seedAvailability.identityObligations, roleRequirements: roleEvidence.requirements }
	const materialized = materialization.materialized.map((c) => ({ key: c.key, treatment: c.treatment, descriptors: c.descriptors as any }))
	const scored = scorePaletteCandidates(materialized.map(({ treatment }) => treatment), identity)
	const eligible = selectSourceEligibleWinner({
		materialized, identityObligations: identity.obligations, identityRoleRequirements: identity.roleRequirements,
		emergency: seed.emergency, fullDomainSelection: scored,
	})
	const evaluationByKey = new Map(scored.evaluations.map((e) => [e.key, e]))
	const unrestricted = evaluationByKey.get(completeTreatmentKey(scored.winner))!
	const winnerEval = evaluationByKey.get(completeTreatmentKey(eligible.winner.treatment))!
	const envelopeMargin = unrestricted.qualityUtility - winnerEval.qualityUtility

	const rescored = scorePaletteCandidates(eligible.eligibility.eligibleCandidates.map(({ treatment }) => treatment), identity)
	const evals = [...rescored.evaluations]
	const withGuard = frontierOf(evals, (a, b) => dominatesWithGuard(a, b, true))
	const withoutGuard = frontierOf(evals, (a, b) => dominatesWithGuard(a, b, false))
	const withoutAuthorized = frontierOf(evals, dominatesNoAuthorized)

	// sign agreement: how many candidates have mixed APCA signs across gradient samples
	let mixedSign = 0
	let mixedSignGradient = 0
	let discounted = 0
	for (const e of evals) {
		const t: any = e.treatment
		if (!t.gradient) continue
		mixedSignGradient += 1
		for (const role of ["foreground", "accent"] as const) {
			const active = role === "accent" && t.collapse.accent ? "foreground" : role
			const samples = t.contrast.pairs.filter((p: any) => p.role === active && p.fieldRole === "gradient-sample")
				.map((p: any) => p.signedLc).filter((v: number) => Number.isFinite(v) && v !== 0)
			if (samples.length === 0) continue
			const agreement = Math.abs(samples.reduce((s: number, v: number) => s + Math.sign(v), 0)) / samples.length
			if (agreement < 1) { mixedSign += 1; break }
		}
	}
	const winnerT: any = eligible.winner.treatment
	let winnerMixed = false
	if (winnerT.gradient) {
		for (const role of ["foreground", "accent"] as const) {
			const active = role === "accent" && winnerT.collapse.accent ? "foreground" : role
			const samples = winnerT.contrast.pairs.filter((p: any) => p.role === active && p.fieldRole === "gradient-sample")
				.map((p: any) => p.signedLc).filter((v: number) => Number.isFinite(v) && v !== 0)
			if (samples.length === 0) continue
			const agreement = Math.abs(samples.reduce((s: number, v: number) => s + Math.sign(v), 0)) / samples.length
			if (agreement < 1) winnerMixed = true
		}
	}

	const row = {
		image: file,
		envelopeMargin: +envelopeMargin.toFixed(5),
		envelopeLimit: WINNER_SCORING_POLICY.maximumQualityLoss,
		eligibleCount: eligible.eligibility.eligibleCandidates.length,
		frontierWithGuard: withGuard.length,
		frontierWithoutGuard: withoutGuard.length,
		frontierWithoutAuthorized: withoutAuthorized.length,
		guardWinnerChanged: withGuard[0]?.key !== withoutGuard[0]?.key,
		authorizedWinnerChanged: withGuard[0]?.key !== withoutAuthorized[0]?.key,
		gradientCandidates: mixedSignGradient,
		mixedSignCandidates: mixedSign,
		winnerGradient: winnerT.gradient,
		winnerMixedSign: winnerMixed,
	}
	results.push(row)
	console.error(`${file}: margin=${row.envelopeMargin}/${row.envelopeLimit} frontier ${row.frontierWithoutGuard}->${row.frontierWithGuard} (noAuth ${row.frontierWithoutAuthorized}) guardChanged=${row.guardWinnerChanged} authChanged=${row.authorizedWinnerChanged} mixedSign=${row.mixedSignCandidates}/${row.gradientCandidates} winnerMixed=${row.winnerMixedSign}`)
}
writeFileSync(join(OUT, "probe-guards.json"), JSON.stringify(results, null, "\t"))
