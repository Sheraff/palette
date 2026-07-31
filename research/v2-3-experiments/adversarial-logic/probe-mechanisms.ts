/**
 * Second adversarial probe: characterises *what* the near-tie ranking decisions
 * separate, whether the diffuse-composite domains / mark substitution / midpoint
 * guards ever bite, and where the runtime actually goes.
 */
import { readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildNativePaletteEvidence, buildPaletteSeedDomain, completeTreatmentKey, diagnoseGradientFits, constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../v2-3/src/internal/transition-normalization.ts"
import { buildRoleEvidence } from "../../v2-3/src/internal/role-evidence.ts"
import { scorePaletteCandidates } from "../../v2-3/src/internal/winner-scoring.ts"
import { selectSourceEligibleWinner } from "../../v2-3/src/internal/winner-selection.ts"
import { discoverNativeFieldTransitions, discoverSupportedNativeFieldTransitionPaths } from "../../v2-3/src/internal/field-transition.ts"
import { buildBandLocalEndpointRefinements } from "../../v2-3/src/internal/endpoint-refinement.ts"
import { okDistance, mixOKLab } from "../../v2-3/src/internal/color.ts"
import { ALBUM_ARTWORK_PALETTE_V2_POLICY } from "../../v2-3/src/internal/policy.ts"

const IMAGES = join(process.cwd(), "images")
const OUT = join(process.cwd(), "research/v2-3-experiments/adversarial-logic")
const clamp = (v: number) => Math.max(0, Math.min(1, v))

async function probe(file: string) {
	const image = await loadNativeImage(join(IMAGES, file))
	const tA = Date.now()
	const evidence = buildNativePaletteEvidence(image)
	const tEvidence = Date.now()
	const seed = buildPaletteSeedDomain(image)
	const tSeed = Date.now()
	const fits = diagnoseGradientFits(seed.evidence)
	const tFits = Date.now()
	const transitions = discoverNativeFieldTransitions(seed.evidence)
	const tTransitions = Date.now()
	const paths = discoverSupportedNativeFieldTransitionPaths(seed.evidence)
	const tPaths = Date.now()
	const refinements = buildBandLocalEndpointRefinements(seed.evidence, fits)
	const tRefine = Date.now()

	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
	const envelope = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(common.evidence.nativeFieldTransitions)
	const supplementalFields = common.fieldHypotheses.filter(({ sourceType }) => sourceType !== "native-seed")
	const supplemental = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
		common.evidence.augmentedNative, supplementalFields.map(({ hypothesis }) => hypothesis))
	const sourceByHypothesisId = new Map(supplementalFields.map(({ sourceType, hypothesis }) => [hypothesis.id, sourceType]))
	const supplementalDescriptors = supplemental.treatments.map((d) => ({ sourceType: sourceByHypothesisId.get(d.fieldHypothesis.id)!, ...d }))
	const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
		[...common.seedAvailability.logicalDescriptors, ...supplementalDescriptors] as any,
		common.seedAvailability.identityObligations)
	const roleEvidence = buildRoleEvidence(common.evidence.augmentedNative,
		[...common.seedAvailability.fieldHypotheses, ...supplemental.hypotheses.map((h) => ({ sourceType: "x", hypothesis: h }))].map(({ hypothesis }: any) => hypothesis),
		common.seedAvailability.identityObligations.map(({ familyId }) => familyId))
	const materialized = materialization.materialized.map((c) => ({ key: c.key, treatment: c.treatment, descriptors: c.descriptors as any }))
	const scored = scorePaletteCandidates(materialized.map(({ treatment }) => treatment),
		{ obligations: common.seedAvailability.identityObligations, roleRequirements: roleEvidence.requirements })
	const eligible = selectSourceEligibleWinner({
		materialized, identityObligations: common.seedAvailability.identityObligations,
		identityRoleRequirements: roleEvidence.requirements, emergency: seed.emergency, fullDomainSelection: scored,
	})
	const rescored = scorePaletteCandidates(eligible.eligibility.eligibleCandidates.map(({ treatment }) => treatment),
		{ obligations: common.seedAvailability.identityObligations, roleRequirements: roleEvidence.requirements })
	const frontier = rescored.evaluations.filter(({ paretoMember }) => paretoMember)

	// --- what does the winning tie-break separate?
	const [a, b] = frontier
	const roles = ["background", "surface", "foreground", "accent"] as const
	const tie = b ? {
		sameFamilies: roles.every((r) => a.treatment.familyRoles[r] === b.treatment.familyRoles[r]),
		sameCollapse: a.treatment.collapse.surface === b.treatment.collapse.surface &&
			a.treatment.collapse.accent === b.treatment.collapse.accent,
		sameGradient: a.treatment.gradient === b.treatment.gradient,
		maxRoleDistance: Math.max(...roles.map((r) => okDistance(a.treatment[r].oklab, b.treatment[r].oklab))),
		hexA: roles.map((r) => a.treatment[r].hex).join(","),
		hexB: roles.map((r) => b.treatment[r].hex).join(","),
		relationUtilityDelta: a.relationUtility - b.relationUtility,
	} : null

	// how many frontier members share the winner's *quantized* signature (full tie group)
	const sig = (e: any) => [Math.floor((e.relationUtility + 1e-12) / 0.005),
		Math.floor((e.identityAuthorizedGain + 1e-12) / 0.005),
		Math.floor((e.qualityUtility + 1e-12) / 0.005), e.identityGain.toFixed(12),
		...Object.values(e.evidenceLevels)].join("|")
	const winnerSig = sig(a)
	const tieGroup = frontier.filter((e) => sig(e) === winnerSig)
	const tieGroupDistinctFamilies = new Set(tieGroup.map((e) => roles.map((r) => e.treatment.familyRoles[r]).join(","))).size
	const tieGroupMaxSpread = tieGroup.length > 1
		? Math.max(...tieGroup.map((e) => Math.max(...roles.map((r) => okDistance(a.treatment[r].oklab, e.treatment[r].oklab)))))
		: 0

	// --- diffuse composite domains, measured before truncation
	const allDomainKinds: Record<string, { total: number; eligible: number }> = {}
	for (const d of seed.fieldDomains) {
		const e = allDomainKinds[d.kind] ?? { total: 0, eligible: 0 }
		e.total += 1
		if (d.eligible) e.eligible += 1
		allDomainKinds[d.kind] = e
	}
	// which domains actually produced the winning field?
	const winnerHypothesis = eligible.winner.treatment.sourceFieldHypothesisId

	// --- mark substitution: does it actually raise a support term for any family?
	const MARK = ALBUM_ARTWORK_PALETTE_V2_POLICY.mark
	let markBinds = 0
	let markBindsWinner = 0
	const markDetail: any[] = []
	for (const family of seed.evidence.families) {
		if (family.markSupport <= 0) continue
		for (const rep of family.representatives) {
			if ("generated" in rep.support) continue
			const total = clamp(rep.support.totalSupport / 0.08)
			const connected = clamp(rep.support.connectedSupport / 0.08)
			const sub = MARK.substitution * rep.support.markSupport
			if (sub > total || sub > connected) {
				markBinds += 1
				markDetail.push({ familyId: family.id, markSupport: +family.markSupport.toFixed(3), total: +total.toFixed(3), connected: +connected.toFixed(3) })
				break
			}
		}
	}
	for (const r of roles) {
		const s: any = eligible.winner.treatment[r].support
		if (!s || "generated" in s || s.markSupport <= 0) continue
		const total = clamp(s.totalSupport / 0.08)
		const connected = clamp(s.connectedSupport / 0.08)
		if (MARK.substitution * s.markSupport > total || MARK.substitution * s.markSupport > connected) markBindsWinner += 1
	}

	// --- midpoint guards on every gradient candidate in the eligible domain
	const binStep = seed.evidence.familyBinStep
	const gradientEvals = rescored.evaluations.filter((e) => e.treatment.gradient && e.treatment.gradientEvidence?.fieldMidpoint)
	const midpointStats = gradientEvals.map((e) => {
		const ev = e.treatment.gradientEvidence!.fieldMidpoint!
		const chord = mixOKLab(e.treatment.background.oklab, e.treatment.surface.oklab, 0.5)
		return {
			chordDeviation: okDistance(ev.oklab, chord),
			endpointDistance: Math.min(okDistance(ev.oklab, e.treatment.background.oklab), okDistance(ev.oklab, e.treatment.surface.oklab)),
		}
	})
	const chordPass = midpointStats.filter((m) => m.chordDeviation >= binStep).length
	const bothPass = midpointStats.filter((m) => m.chordDeviation >= binStep && m.endpointDistance >= binStep).length
	const killedByEndpointRule = midpointStats.filter((m) => m.chordDeviation >= binStep && m.endpointDistance < binStep)
	const winnerMid = (() => {
		const t = eligible.winner.treatment
		const ev = t.gradientEvidence?.fieldMidpoint
		if (!t.gradient || !ev) return null
		const chord = mixOKLab(t.background.oklab, t.surface.oklab, 0.5)
		return {
			chordDeviation: +okDistance(ev.oklab, chord).toFixed(4),
			endpointDistance: +Math.min(okDistance(ev.oklab, t.background.oklab), okDistance(ev.oklab, t.surface.oklab)).toFixed(4),
			binStep,
		}
	})()

	// --- supplemental sourceTypes
	const supplementalBySource: Record<string, number> = {}
	for (const f of supplementalFields) supplementalBySource[f.sourceType] = (supplementalBySource[f.sourceType] ?? 0) + 1

	return {
		image: file,
		timings: {
			evidence: tEvidence - tA, seedTotal: tSeed - tEvidence,
			diagnoseGradientFits: tFits - tSeed, discoverNativeFieldTransitions: tTransitions - tFits,
			discoverSupportedPaths: tPaths - tTransitions, endpointRefinements: tRefine - tPaths,
		},
		tie, tieGroupSize: tieGroup.length, tieGroupDistinctFamilies, tieGroupMaxSpread: +tieGroupMaxSpread.toFixed(4),
		frontierSize: frontier.length,
		domainKinds: allDomainKinds,
		winnerHypothesis,
		transitions: {
			traceCount: transitions.traces.length,
			eligibleTraces: transitions.traces.filter((t) => t.eligible).length,
			hypotheses: transitions.hypotheses.length,
			credited: envelope.creditedHypothesisIds.length,
			pathCount: paths.length,
			eligiblePaths: paths.filter((p) => p.eligible).length,
			rejectionHistogram: (() => {
				const h: Record<string, number> = {}
				for (const t of transitions.traces) for (const r of t.rejectionReasons) h[r] = (h[r] ?? 0) + 1
				return h
			})(),
		},
		refinements: {
			total: refinements.length,
			accepted: refinements.filter((r) => r.accepted).length,
		},
		supplementalBySource,
		supplementalTreatments: supplemental.treatments.length,
		mark: { markBinds, markBindsWinner, markDetail: markDetail.slice(0, 4) },
		midpoint: { gradientCandidatesWithEvidence: midpointStats.length, chordPass, bothPass, killedByEndpointRule: killedByEndpointRule.length, winnerMid },
	}
}

const files = readdirSync(IMAGES).filter((f) => /\.(jpg|jpeg|png|avif|webp)$/iu.test(f)).sort()
const only = process.argv[2] ? files.filter((f) => f.includes(process.argv[2])) : files
const results: any[] = []
for (const file of only) {
	try {
		const r = await probe(file)
		results.push(r)
		console.error(`${file}: tieGroup=${r.tieGroupSize} fams=${r.tieGroupDistinctFamilies} spread=${r.tieGroupMaxSpread} transHyp=${r.transitions.hypotheses} refAcc=${r.refinements.accepted}/${r.refinements.total} markBinds=${r.mark.markBinds}/${r.mark.markBindsWinner} mid=${r.midpoint.chordPass}/${r.midpoint.bothPass}/${r.midpoint.gradientCandidatesWithEvidence}`)
	} catch (error) {
		results.push({ image: file, error: String(error) })
		console.error(`${file}: ERROR ${error}`)
	}
}
writeFileSync(join(OUT, "probe-mechanisms.json"), JSON.stringify(results, null, "\t"))
