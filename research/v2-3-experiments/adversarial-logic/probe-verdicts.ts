/**
 * Consolidated verdict probe. One seed + common build per image, answering all
 * four coordinator questions on whatever corpus IMAGES_DIR points at.
 *
 * Usage:
 *   IMAGES_DIR=<dir> OUT_SUFFIX=<tag> [LIMIT=<n>] [DEEP=0] node --experimental-strip-types probe-verdicts.ts
 *
 * DEEP=0 skips the scoring/selection stages (cheap sweep for off-panel corpora:
 * evidence -> domains -> fits -> refinements -> transitions only).
 */
import { readdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, completeTreatmentKey, diagnoseGradientFits, constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../v2-3/src/internal/transition-normalization.ts"
import { buildRoleEvidence } from "../../v2-3/src/internal/role-evidence.ts"
import { scorePaletteCandidates, WINNER_QUALITY_AXES, WINNER_SCORING_POLICY } from "../../v2-3/src/internal/winner-scoring.ts"
import { selectSourceEligibleWinner } from "../../v2-3/src/internal/winner-selection.ts"
import { buildBandLocalEndpointRefinements } from "../../v2-3/src/internal/endpoint-refinement.ts"
import { discoverSupportedNativeFieldTransitionPaths } from "../../v2-3/src/internal/field-transition.ts"
import { ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY } from "../../v2-3/src/internal/base-scoring.ts"
import { okDistance, mixOKLab } from "../../v2-3/src/internal/color.ts"

const IMAGES = process.env.IMAGES_DIR ?? join(process.cwd(), "images")
const OUT = join(process.cwd(), "research/v2-3-experiments/adversarial-logic")
const SUFFIX = process.env.OUT_SUFFIX ?? ""
const LIMIT = Number(process.env.LIMIT ?? "0")
const DEEP = process.env.DEEP !== "0"
const CHROMA_FLOOR = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.identityDirectionChroma
const utilityLevel = (v: number) => Math.floor((v + 1e-12) / WINNER_SCORING_POLICY.utilityResolution)

function sameFamilyAssignment(a: any, b: any) {
	return a.gradient === b.gradient && a.collapse.surface === b.collapse.surface &&
		a.collapse.accent === b.collapse.accent &&
		(["background", "surface", "foreground", "accent"] as const).every((r) => a.familyRoles[r] === b.familyRoles[r])
}
function dominatesWith(f: any, s: any, guard: boolean, authorized: boolean) {
	let better = false
	if (guard && f.treatment.gradient && s.treatment.gradient && sameFamilyAssignment(f.treatment, s.treatment) &&
		s.treatment.scores.endpointBandSpread > f.treatment.scores.endpointBandSpread) return false
	if (authorized) {
		const a = utilityLevel(f.identityAuthorizedGain)
		const b = utilityLevel(s.identityAuthorizedGain)
		if (a < b) return false
		if (a > b) better = true
	}
	for (const ax of WINNER_QUALITY_AXES) {
		if (f.evidenceLevels[ax] < s.evidenceLevels[ax]) return false
		if (f.evidenceLevels[ax] > s.evidenceLevels[ax]) better = true
	}
	return better
}
const frontierOf = (evals: any[], dom: (a: any, b: any) => boolean) =>
	evals.filter((e) => !evals.some((c) => c !== e && dom(c, e)))

async function probe(path: string, name: string) {
	const t0 = Date.now()
	const image = await loadNativeImage(path)
	const tSeed0 = Date.now()
	const seed = buildPaletteSeedDomain(image)
	const tSeed = Date.now()
	const fits = diagnoseGradientFits(seed.evidence)
	const tFits = Date.now()
	const refinements = buildBandLocalEndpointRefinements(seed.evidence, fits)
	const tRefine = Date.now()
	const paths = discoverSupportedNativeFieldTransitionPaths(seed.evidence)
	const tPaths = Date.now()

	// --- domain kinds, measured on the seed's own (<=48 retained) domain list
	const domainKinds: Record<string, { total: number; eligible: number }> = {}
	for (const d of seed.fieldDomains) {
		const e = domainKinds[d.kind] ?? { total: 0, eligible: 0 }
		e.total += 1
		if (d.eligible) e.eligible += 1
		domainKinds[d.kind] = e
	}
	// why do diffuse domains fail?
	const diffuseReasons: Record<string, number> = {}
	for (const d of seed.fieldDomains) {
		if (d.kind !== "diffuse-composite" || d.eligible) continue
		for (const r of d.rejectionReasons) diffuseReasons[r] = (diffuseReasons[r] ?? 0) + 1
	}

	// --- registry: is the all-ranked-lane proposal pass load-bearing?
	const controlIds = new Set(seed.registry.fieldHypotheses.filter((h) => h.controlProposed).map((h) => h.hypothesisId))
	const usedIds = new Set(seed.completeTreatments.map((t) => t.sourceFieldHypothesisId))
	const nonControl = seed.registry.fieldHypotheses.filter((h) => !h.controlProposed)
	const nonControlUsed = nonControl.filter((h) => usedIds.has(h.hypothesisId)).map((h) => h.hypothesisId)
	const directionsNeedingNonControl = seed.registry.fieldDirections.filter((d) =>
		d.hypothesisIds.some((id) => usedIds.has(id) && !controlIds.has(id))).length

	// --- obligation slot occupancy
	const familyById = new Map(seed.evidence.families.map((f) => [f.id, f]))
	const obligations = seed.identityObligations.map((o) => {
		const f = familyById.get(o.familyId)!
		return { familyId: o.familyId, chroma: +f.chroma.toFixed(4), nearNeutral: f.chroma < CHROMA_FLOOR }
	})

	const base = {
		image: name,
		size: `${image.width}x${image.height}`,
		timings: {
			seed: tSeed - tSeed0, diagnoseGradientFits: tFits - tSeed,
			endpointRefinements: tRefine - tFits, supportedPaths: tPaths - tRefine,
		},
		refinements: { attempted: refinements.length, accepted: refinements.filter((r) => r.accepted).length },
		supportedPaths: { total: paths.length, eligible: paths.filter((p) => p.eligible).length },
		domainKinds, diffuseReasons,
		registry: {
			total: seed.registry.fieldHypotheses.length,
			nonControl: nonControl.length,
			nonControlUsed: nonControlUsed.length,
			nonControlUsedIds: nonControlUsed.slice(0, 3),
			directionsNeedingNonControl,
		},
		obligations: {
			count: obligations.length,
			nearNeutral: obligations.filter((o) => o.nearNeutral).length,
			chroma: obligations.map((o) => o.chroma),
		},
		emergency: { eligible: seed.emergency.eligible, reason: seed.emergency.reason },
	}
	if (!DEEP) return { ...base, deep: null, elapsed: Date.now() - t0 }

	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
	const envelope = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(common.evidence.nativeFieldTransitions)
	const supplementalFields = common.fieldHypotheses.filter(({ sourceType }) => sourceType !== "native-seed")
	const bySource = new Map(supplementalFields.map(({ sourceType, hypothesis }) => [hypothesis.id, sourceType]))
	const supplemental = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
		common.evidence.augmentedNative, supplementalFields.map(({ hypothesis }) => hypothesis))
	const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
		[...common.seedAvailability.logicalDescriptors,
			...supplemental.treatments.map((d) => ({ sourceType: bySource.get(d.fieldHypothesis.id)!, ...d }))] as any,
		common.seedAvailability.identityObligations)
	const roleEvidence = buildRoleEvidence(common.evidence.augmentedNative,
		[...common.seedAvailability.fieldHypotheses.map((f) => f.hypothesis), ...supplemental.hypotheses],
		common.seedAvailability.identityObligations.map(({ familyId }) => familyId))
	const identity = { obligations: common.seedAvailability.identityObligations, roleRequirements: roleEvidence.requirements }
	const materialized = materialization.materialized.map((c) => ({ key: c.key, treatment: c.treatment, descriptors: c.descriptors as any }))
	const tScore0 = Date.now()
	const scored = scorePaletteCandidates(materialized.map(({ treatment }) => treatment), identity)
	const tScore = Date.now()
	const eligible = selectSourceEligibleWinner({
		materialized, identityObligations: identity.obligations, identityRoleRequirements: identity.roleRequirements,
		emergency: seed.emergency, fullDomainSelection: scored,
	})
	const tEligible = Date.now()
	const evalByKey = new Map(scored.evaluations.map((e) => [e.key, e]))
	const unrestricted = evalByKey.get(completeTreatmentKey(scored.winner))!
	const winnerEval = evalByKey.get(completeTreatmentKey(eligible.winner.treatment))!

	const rescored = scorePaletteCandidates(eligible.eligibility.eligibleCandidates.map(({ treatment }) => treatment), identity)
	const evals = [...rescored.evaluations]
	const withGuard = frontierOf(evals, (a, b) => dominatesWith(a, b, true, true))
	const noGuard = frontierOf(evals, (a, b) => dominatesWith(a, b, false, true))
	const noAuthorized = frontierOf(evals, (a, b) => dominatesWith(a, b, true, false))

	// midpoint guard accounting over every gradient candidate carrying evidence
	const binStep = seed.evidence.familyBinStep
	let chordPass = 0
	let bothPass = 0
	let withEvidence = 0
	for (const e of evals) {
		const t: any = e.treatment
		const ev = t.gradientEvidence?.fieldMidpoint
		if (!t.gradient || !ev) continue
		withEvidence += 1
		const chord = okDistance(ev.oklab, mixOKLab(t.background.oklab, t.surface.oklab, 0.5))
		const end = Math.min(okDistance(ev.oklab, t.background.oklab), okDistance(ev.oklab, t.surface.oklab))
		if (chord >= binStep) chordPass += 1
		if (chord >= binStep && end >= binStep) bothPass += 1
	}

	return {
		...base,
		deep: {
			creditedTransitions: envelope.creditedHypothesisIds.length,
			transitionHypotheses: common.evidence.nativeFieldTransitions.hypotheses.length,
			supplementalTreatments: supplemental.treatments.length,
			materialized: materialization.materialized.length,
			eligibleCandidates: eligible.eligibility.eligibleCandidates.length,
			eligibilityFilteredOut: materialization.materialized.length - eligible.eligibility.eligibleCandidates.length,
			eligibilityChangedWinner: completeTreatmentKey(scored.winner) !== completeTreatmentKey(eligible.winner.treatment),
			envelopeMargin: +(unrestricted.qualityUtility - winnerEval.qualityUtility).toFixed(5),
			scoreMs: tScore - tScore0,
			eligibleSelectMs: tEligible - tScore,
			frontierWithGuard: withGuard.length,
			frontierNoGuard: noGuard.length,
			frontierNoAuthorized: noAuthorized.length,
			guardWinnerChanged: withGuard[0]?.key !== noGuard[0]?.key,
			authorizedWinnerChanged: withGuard[0]?.key !== noAuthorized[0]?.key,
			midpoint: { withEvidence, chordPass, bothPass, killedByEndpointRule: chordPass - bothPass },
			winnerHypothesis: eligible.winner.treatment.sourceFieldHypothesisId,
		},
		elapsed: Date.now() - t0,
	}
}

function collect(dir: string): Array<{ path: string; name: string }> {
	const out: Array<{ path: string; name: string }> = []
	for (const entry of readdirSync(dir).sort()) {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) continue
		if (/-(scrambled|masked|saliency|original)\./u.test(entry)) continue
		if (!/\.(jpg|jpeg|png|avif|webp)$/iu.test(entry) && !/^ab67616d/u.test(entry)) continue
		out.push({ path: full, name: entry })
	}
	return out
}

let files = IMAGES.includes(",")
	? IMAGES.split(",").flatMap((d) => collect(d.trim()))
	: collect(IMAGES)
if (LIMIT > 0) files = files.slice(0, LIMIT)

const results: any[] = []
for (const { path, name } of files) {
	try {
		const r = await probe(path, name)
		results.push(r)
		const d = r.deep
		console.error(`${name}: ${r.elapsed}ms ref=${r.refinements.accepted}/${r.refinements.attempted} paths=${r.supportedPaths.eligible}/${r.supportedPaths.total} domains=${JSON.stringify(r.domainKinds)} nonCtrlUsed=${r.registry.nonControlUsed} oblig=${r.obligations.nearNeutral}/${r.obligations.count}` +
			(d ? ` credited=${d.creditedTransitions} margin=${d.envelopeMargin} eligWinChanged=${d.eligibilityChangedWinner} mid=${d.chordPass ?? d.midpoint.chordPass}/${d.midpoint.bothPass}` : ""))
	} catch (error) {
		results.push({ image: name, error: String(error) })
		console.error(`${name}: ERROR ${error}`)
	}
}
writeFileSync(join(OUT, `probe-verdicts${SUFFIX}.json`), JSON.stringify(results, null, "\t"))
console.error(`wrote ${results.length} rows`)
