/**
 * Decompose `signatureScore` / `signatureRoleScore` term by term for every family the algorithm
 * builds, on each salience-class target, and re-rank the families under relative-chroma
 * normalisation of the one term that carries chroma.
 *
 *   node --no-warnings --experimental-strip-types \
 *     research/v2-3-experiments/signature-role-score/analysis/decompose.ts [--out decompose.json]
 *
 * CORPUS: real artwork only, resolved through `probe.ts::resolveArtwork` against the shared
 * checkout; the worktree `images/` decoys are refused by that resolver. Read-only replay of
 * `buildNativePaletteEvidence`: it changes nothing and ships nothing.
 *
 * Arithmetic mirrors `measureFamilyRoleEvidence` (palette-core.ts) exactly:
 *   signatureScore = clamp(0.25*coherentSupport + 0.18*componentCoherence + 0.16*repeatedSupport
 *                          + 0.22*distinctive + 0.11*chromatic + 0.08*notBroad)
 *   signatureRoleScore = clamp(0.55*signatureScore + 0.45*signatureAccentObservation)
 * with chromatic = clamp(chroma / 0.18) on trunk, and clamp(chroma / artworkChromaCeiling) under
 * the repair. Everything else is read straight off the family, so no term is re-derived.
 */
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import sharp from "sharp"
import { buildNativePaletteEvidence } from "../../../v2-3/src/internal/palette-core.ts"
import { loadNativeImage } from "../../../v2-3/src/internal/native-resolution-image.ts"
import { okDistance, rgbToOKLab } from "../../../v2-3/src/internal/color.ts"
import { resolveArtwork, hexToRgb } from "./probe.ts"
import { SALIENCE } from "./salience-set.ts"

sharp.concurrency(1)

const outIndex = process.argv.indexOf("--out")
const outPath = resolve(import.meta.dirname, outIndex >= 0 ? process.argv[outIndex + 1] : "decompose.json")

const clamp = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0))

/** The signature lane's bound: top-16 families by `signatureRoleScore` (`bounds.signatureFamilies`). */
const SIGNATURE_LANE_BOUND = 16

type FamilyRow = {
	id: string
	prototypeChroma: number
	relativeChroma: number
	chromaticTrunk: number
	chromaticRelative: number
	coherentSupport: number
	componentCoherence: number
	repeatedSupport: number
	distinctive: number
	notBroad: number
	signatureScoreReported: number
	signatureScoreTrunk: number
	signatureScoreRelative: number
	signatureAccentObservation: number
	sigRoleTrunk: number
	sigRoleRelative: number
	laneRankTrunk: number
	laneRankRelative: number
	laneRankRepaired: number
	markSupport: number
	markComponentCount: number
	sigAccentRoleScore: number
	isWanted: boolean
	isPublished: boolean
}

const results: any[] = []

for (const kase of SALIENCE) {
	const path = resolveArtwork(kase.image)
	if (!path) { results.push({ idx: kase.idx, image: kase.image, error: "unresolved" }); continue }
	const image = await loadNativeImage(path)
	const evidence = buildNativePaletteEvidence(image)
	const families = evidence.families

	const ceiling = Math.max(...families.map((f: any) => f.chroma))

	// Which family owns each hex: exact representative match first, else nearest prototype.
	const own = (hex: string): string | null => {
		const lab = rgbToOKLab(hexToRgb(hex))
		for (const f of families as any[]) {
			if (f.representatives.some((r: any) => r.hex.toLowerCase() === hex.toLowerCase())) return f.id
		}
		let best = Infinity, bestId: string | null = null
		for (const f of families as any[]) {
			const d = okDistance(lab, f.prototype)
			if (d < best) { best = d; bestId = f.id }
		}
		return bestId
	}
	const wantedId = own(kase.prescribed)
	const publishedId = own(kase.published)

	const rows: FamilyRow[] = (families as any[]).map((f) => {
		const coherentSupport = clamp(f.largestComponentFraction / 0.002)
		const componentCoherence = clamp(f.familyConcentration)
		// `repeatedSupport` uses a component-population threshold the family does not expose;
		// `repeatedComponentCount` is the same count under the family's own bar, and it is the
		// only published proxy. Recorded as a proxy, and never used to *replace* a reported score.
		const repeatedSupport = clamp((f.repeatedComponentCount - 1) / 3)
		const distinctive = clamp(f.localContrast / 0.16)
		const notBroad = 1 - clamp((f.populationFraction - 0.18) / 0.35)
		const chromaticTrunk = clamp(f.chroma / 0.18)
		const chromaticRelative = ceiling > 0 ? clamp(f.chroma / ceiling) : 0
		const base = 0.25 * coherentSupport + 0.18 * componentCoherence + 0.16 * repeatedSupport +
			0.22 * distinctive + 0.08 * notBroad
		const signatureScoreTrunk = clamp(base + 0.11 * chromaticTrunk)
		const signatureScoreRelative = clamp(base + 0.11 * chromaticRelative)
		// The already-shipped repair: `signatureAccentRoleScore` substitutes markSupport for the
		// population ratio, but only when scoring an accent already on screen — never in candidacy.
		const repaired = clamp(f.signatureScore + 0.25 * (Math.max(coherentSupport, f.markSupport) - coherentSupport))
		return {
			id: f.id,
			markSupport: f.markSupport,
			markComponentCount: f.markComponentCount,
			sigAccentRoleScore: clamp(0.55 * repaired + 0.45 * f.signatureAccentObservation),
			prototypeChroma: f.chroma,
			relativeChroma: ceiling > 0 ? f.chroma / ceiling : 0,
			chromaticTrunk,
			chromaticRelative,
			coherentSupport,
			componentCoherence,
			repeatedSupport,
			distinctive,
			notBroad,
			signatureScoreReported: f.signatureScore,
			signatureScoreTrunk,
			signatureScoreRelative,
			signatureAccentObservation: f.signatureAccentObservation,
			sigRoleTrunk: clamp(0.55 * f.signatureScore + 0.45 * f.signatureAccentObservation),
			sigRoleRelative: clamp(0.55 * (f.signatureScore - 0.11 * chromaticTrunk + 0.11 * chromaticRelative) +
				0.45 * f.signatureAccentObservation),
			laneRankTrunk: 0,
			laneRankRelative: 0,
			laneRankRepaired: 0,
			isWanted: f.id === wantedId,
			isPublished: f.id === publishedId,
		}
	})

	const byTrunk = [...rows].sort((a, b) => b.sigRoleTrunk - a.sigRoleTrunk || (a.id < b.id ? -1 : 1))
	byTrunk.forEach((r, i) => { r.laneRankTrunk = i + 1 })
	const byRelative = [...rows].sort((a, b) => b.sigRoleRelative - a.sigRoleRelative || (a.id < b.id ? -1 : 1))
	byRelative.forEach((r, i) => { r.laneRankRelative = i + 1 })
	const byRepaired = [...rows].sort((a, b) => b.sigAccentRoleScore - a.sigAccentRoleScore || (a.id < b.id ? -1 : 1))
	byRepaired.forEach((r, i) => { r.laneRankRepaired = i + 1 })

	const wanted = rows.find((r) => r.isWanted) ?? null
	const publishedRow = rows.find((r) => r.isPublished) ?? null

	// Sanity: our reconstruction must reproduce the reported signatureScore.
	const maxReconstructionError = Math.max(...rows.map((r) =>
		Math.abs(r.signatureScoreTrunk - r.signatureScoreReported)))

	results.push({
		idx: kase.idx,
		image: kase.image,
		path,
		familyCount: families.length,
		chromaCeiling: ceiling,
		ceilingVsFixedScale: ceiling / 0.18,
		maxReconstructionError,
		wanted: wanted && {
			hex: kase.prescribed, ...wanted,
			inLaneTrunk: wanted.laneRankTrunk <= SIGNATURE_LANE_BOUND,
			inLaneRelative: wanted.laneRankRelative <= SIGNATURE_LANE_BOUND,
			inLaneRepaired: wanted.laneRankRepaired <= SIGNATURE_LANE_BOUND,
		},
		published: publishedRow && { hex: kase.published, ...publishedRow },
		families: rows.sort((a, b) => a.laneRankTrunk - b.laneRankTrunk),
	})
	process.stdout.write(`idx ${kase.idx} ${kase.image.slice(16, 24)} families ${families.length} ceiling ${ceiling.toFixed(4)} ` +
		`wanted lane trunk ${wanted?.laneRankTrunk} rel ${wanted?.laneRankRelative} repaired ${wanted?.laneRankRepaired} (mark ${wanted?.markSupport.toFixed(2)}) published ${publishedRow?.laneRankTrunk}->${publishedRow?.laneRankRepaired} ` +
		`reconErr ${maxReconstructionError.toExponential(1)}\n`)
}

writeFileSync(outPath, JSON.stringify(results, null, "\t") + "\n")
process.stdout.write(`\nwrote ${outPath}\n`)
