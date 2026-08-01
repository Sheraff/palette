/**
 * Trace the accent ranking gap.
 *
 * Replays the full candidate pipeline for each salience case, finds the candidates whose ACCENT is
 * the reviewer's prescription (within MINIMUM_DISTINCT_DISTANCE) and whose other three roles match
 * the published winner, and diffs their per-axis quality against the published winner.
 *
 * CORPUS: real artwork only, shared checkout. No scrambled decoy is read.
 */
import { writeFileSync } from "node:fs"
import sharp from "sharp"
import {
	buildPaletteSeedDomain, constructAlbumArtworkPaletteV2Phase3SupplementalTreatments,
	completeTreatmentKey, DEFAULT_PALETTE_EXTRACTION_OPTIONS,
} from "../../../v2-3/src/internal/palette-core.ts"
import { extractPaletteDetails } from "../../../v2-3/src/internal/palette.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../../v2-3/src/internal/candidate-domain.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../../v2-3/src/internal/transition-normalization.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../../v2-3/src/internal/candidate-materialization.ts"
import { buildRoleEvidence } from "../../../v2-3/src/internal/role-evidence.ts"
import { scorePaletteCandidates, WINNER_QUALITY_AXES } from "../../../v2-3/src/internal/winner-scoring.ts"
import { filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain } from "../../../v2-3/src/internal/source-eligibility.ts"
import { loadNativeImage } from "../../../v2-3/src/internal/native-resolution-image.ts"
import { okDistance, rgbToOKLab } from "../../../v2-3/src/internal/color.ts"
import { resolveArtwork, hexToRgb } from "./probe.ts"
import { CASES } from "./salience-set.ts"

sharp.concurrency(1)
const MINIMUM_DISTINCT_DISTANCE = 0.018
const lab = (hex: string) => rgbToOKLab(hexToRgb(hex))

function replay(image: any) {
	const options = DEFAULT_PALETTE_EXTRACTION_OPTIONS
	const seed = buildPaletteSeedDomain(image, options)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
	const envelope = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(common.evidence.nativeFieldTransitions)
	const byId = new Map(envelope.hypotheses.map((h: any) => [h.id, h]))
	const candidateFields = common.fieldHypotheses.map((f: any) =>
		f.sourceType === "native-field-transition" ? { ...f, hypothesis: byId.get(f.hypothesis.id) ?? f.hypothesis } : f)
	const supplementalFields = candidateFields.filter(({ sourceType }: any) => sourceType !== "native-seed")
	const sourceByHypothesisId = new Map(supplementalFields.map(({ sourceType, hypothesis }: any) => [hypothesis.id, sourceType]))
	const supplemental = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
		common.evidence.augmentedNative, supplementalFields.map(({ hypothesis }: any) => hypothesis), options)
	const sourcedFields = [
		...common.seedAvailability.fieldHypotheses,
		...supplemental.hypotheses.map((h: any) => ({ sourceType: sourceByHypothesisId.get(h.id)!, hypothesis: h })),
	]
	const supplementalDescriptors = supplemental.treatments.map((d: any) => ({ sourceType: sourceByHypothesisId.get(d.fieldHypothesis.id), ...d }))
	const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
		[...common.seedAvailability.logicalDescriptors, ...supplementalDescriptors] as any,
		common.seedAvailability.identityObligations)
	const roleEvidence = buildRoleEvidence(common.evidence.augmentedNative,
		sourcedFields.map(({ hypothesis }: any) => hypothesis),
		common.seedAvailability.identityObligations.map(({ familyId }: any) => familyId))
	const identityInput = {
		obligations: common.seedAvailability.identityObligations,
		roleRequirements: roleEvidence.requirements,
	}
	const scored = scorePaletteCandidates(materialization.materialized.map(({ treatment }: any) => treatment), identityInput)
	// The published winner is only ever chosen from the SOURCE-ELIGIBLE sub-domain
	// (`selectSourceEligibleWinner` -> `filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain`),
	// which is charter rule 4's representativity gate. Ranking the full domain overstates reach.
	const domain = filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain(
		materialization.materialized as any, { emergency: null })
	const eligibleKeys = new Set(domain.eligibleCandidates.map((c: any) => c.key))
	const eligible = scorePaletteCandidates(
		domain.eligibleCandidates.map((c: any) => c.treatment), identityInput)
	return { scored, eligible, eligibleKeys }
}

const out: any[] = []
for (const c of CASES.filter((x) => x.klass === "salience")) {
	const path = resolveArtwork(c.image)
	if (!path) continue
	try {
		const image = await loadNativeImage(path)
		const { scored, eligible, eligibleKeys } = replay(image)
		const published = extractPaletteDetails(image, DEFAULT_PALETTE_EXTRACTION_OPTIONS)
		const pubKey = completeTreatmentKey(published.winner)
		const evals = eligible.evaluations
		const allEvals = scored.evaluations
		const pubIdx = evals.findIndex((e: any) => e.key === pubKey)
		const pubEval = pubIdx >= 0 ? evals[pubIdx] : null
		const preLab = lab(c.prescribed)

		// candidates whose accent IS the prescription
		const matches = evals.map((e: any, rank: number) => ({ e, rank: rank + 1 }))
			.filter(({ e }: any) => okDistance(e.treatment.accent.oklab, preLab) <= MINIMUM_DISTINCT_DISTANCE && !e.treatment.collapse.accent)
		// of those, the one closest to the published winner on the other three roles
		const scoreOther = (t: any) => pubEval
			? okDistance(t.background.oklab, pubEval.treatment.background.oklab)
			+ okDistance(t.surface.oklab, pubEval.treatment.surface.oklab)
			+ okDistance(t.foreground.oklab, pubEval.treatment.foreground.oklab) : 0
		const nearest = matches.slice().sort((a: any, b: any) => scoreOther(a.e.treatment) - scoreOther(b.e.treatment))[0]
		const bestRanked = matches[0]

		const axisDiff: Record<string, number> = {}
		if (pubEval && nearest) {
			for (const ax of WINNER_QUALITY_AXES) axisDiff[ax] = nearest.e.quality[ax] - pubEval.quality[ax]
		}
		out.push({
			idx: c.idx, image: c.image, published: c.published, prescribed: c.prescribed,
			candidateCount: evals.length, allCandidateCount: allEvals.length, eligibleCount: eligibleKeys.size,
			publishedWinnerKey: pubKey, publishedRank: pubIdx + 1,
			publishedQU: pubEval?.qualityUtility ?? null, publishedRU: pubEval?.relationUtility ?? null,
			matchCount: matches.length,
			bestRank: bestRanked?.rank ?? null,
			nearestRank: nearest?.rank ?? null,
			nearestKey: nearest?.e.key ?? null,
			nearestQU: nearest?.e.qualityUtility ?? null, nearestRU: nearest?.e.relationUtility ?? null,
			dQU: nearest && pubEval ? nearest.e.qualityUtility - pubEval.qualityUtility : null,
			dRU: nearest && pubEval ? nearest.e.relationUtility - pubEval.relationUtility : null,
			axisDiff,
			pubAccentFidelity: pubEval?.quality.accentFidelity ?? null,
			preAccentFidelity: nearest?.e.quality.accentFidelity ?? null,
			pubGamut: pubEval?.gamutCoverage ?? null, preGamut: nearest?.e.gamutCoverage ?? null,
		})
		console.error(`ok ${c.idx}  matches=${matches.length} pubRank=${pubIdx + 1} nearestRank=${nearest?.rank ?? "-"}`)
	} catch (e) {
		console.error(`ERR ${c.idx}: ${(e as Error).message}`)
		out.push({ idx: c.idx, error: (e as Error).message })
	}
}
writeFileSync(new URL(`./rank-trace-${process.argv[2] ?? "run"}.json`, import.meta.url), JSON.stringify(out, null, 1))

// ---- report ----
const ok = out.filter((r) => !r.error && r.nearestRank && Number.isFinite(r.dQU))
console.log("\n=== reachability + rank of the prescribed accent (real artwork, full pipeline) ===")
console.log(`${"idx".padStart(4)} ${"cands".padStart(6)} ${"pubRank".padStart(8)} ${"#match".padStart(7)} ${"bestRank".padStart(9)} ${"nearRank".padStart(9)} ${"ΔqualityU".padStart(10)} ${"ΔrelU".padStart(9)}`)
for (const r of ok) {
	console.log(`${String(r.idx).padStart(4)} ${String(r.candidateCount).padStart(6)} ${String(r.publishedRank).padStart(8)} ${String(r.matchCount).padStart(7)} ${String(r.bestRank).padStart(9)} ${String(r.nearestRank).padStart(9)} ${((r.dQU >= 0 ? "+" : "") + r.dQU.toFixed(5)).padStart(10)} ${((r.dRU >= 0 ? "+" : "") + r.dRU.toFixed(5)).padStart(9)}`)
}
const unreach = out.filter((r) => !r.error && !r.nearestRank)
console.log(`reachable: ${ok.length}/${out.filter((r) => !r.error).length}; unreachable idx: ${unreach.map((r) => r.idx).join(", ") || "none"}`)

console.log("\n=== which axis ranks the salient candidate below the published one? (median Δ, weighted by BASE weight) ===")
const W: Record<string, number> = { fieldFidelity: 0.16, surfaceFidelity: 0.06, artworkIdentity: 0.12, representativeness: 0.12, foregroundPath: 0.19, accentFidelity: 0.07, accentPath: 0.10, coherence: 0.09, economy: 0.09, sourceSupport: 0, renderedFieldClaim: 0 }
const med = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2 }
console.log(`${"axis".padEnd(22)} ${"weight".padStart(7)} ${"med Δ".padStart(9)} ${"med w·Δ".padStart(9)} ${"neg/pos".padStart(9)}`)
const rowsW = WINNER_QUALITY_AXES.map((ax) => {
	const d = ok.map((r) => r.axisDiff[ax]).filter(Number.isFinite)
	return { ax, w: W[ax] ?? 0, m: med(d), wm: (W[ax] ?? 0) * med(d), neg: d.filter((x) => x < -1e-9).length, pos: d.filter((x) => x > 1e-9).length }
}).sort((a, b) => a.wm - b.wm)
for (const r of rowsW) console.log(`${r.ax.padEnd(22)} ${r.w.toFixed(2).padStart(7)} ${((r.m >= 0 ? "+" : "") + r.m.toFixed(4)).padStart(9)} ${((r.wm >= 0 ? "+" : "") + r.wm.toFixed(5)).padStart(9)} ${`${r.neg}/${r.pos}`.padStart(9)}`)

// per-case axis breakdown for the mandate set
console.log("\n=== per-case axis deficit (w * delta), mandate + hold ===")
for (const r of ok) {
	const parts = WINNER_QUALITY_AXES.map((ax) => ({ ax, v: (W[ax] ?? 0) * (r.axisDiff[ax] ?? 0) }))
		.filter((x) => Math.abs(x.v) > 1e-6).sort((a, b) => a.v - b.v)
	console.log(`idx ${String(r.idx).padStart(3)} nearestRank ${String(r.nearestRank).padStart(5)} dQU ${r.dQU.toFixed(5)} :: ` +
		parts.map((x) => `${x.ax} ${x.v >= 0 ? "+" : ""}${x.v.toFixed(5)}`).join("  "))
}
