/**
 * Artwork-side salience probe.
 *
 * CORPUS: real artwork only. Resolved against /Users/Flo/GitHub/palette (shared checkout);
 * the worktree `images/` holds only `-scrambled` decoys and is never read here.
 *
 * For an artwork and two hexes (published accent, prescribed accent), find the colour family the
 * algorithm actually built that owns each hex, and dump every artwork-side statistic that could
 * define "the salient secondary colour".
 */
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import sharp from "sharp"
import { buildNativePaletteEvidence } from "../../../v2-3/src/internal/palette-core.ts"
import { loadNativeImage } from "../../../v2-3/src/internal/native-resolution-image.ts"
import { okDistance, rgbToOKLab } from "../../../v2-3/src/internal/color.ts"

sharp.concurrency(1)

const ROOT = "/Users/Flo/GitHub/palette"

/** Resolve a warehouse image name to a real artwork file, never a scrambled decoy. */
export function resolveArtwork(name: string): string | null {
	const bare = name.replace(/\.(jpg|jpeg|png|webp|avif)$/i, "")
	const exts = ["", ".jpg", ".jpeg", ".png", ".webp", ".avif"]
	const dirs = [resolve(ROOT, "images")]
	// hex-bucket roots: the id is `<16-char prefix>00<2-hex bucket><rest>`
	if (bare.length > 20) dirs.push(resolve(ROOT, bare.slice(18, 20)))
	for (const d of dirs) for (const e of exts) {
		const p = resolve(d, bare + e)
		if (existsSync(p) && !p.includes("-scrambled.")) return p
	}
	return null
}

export function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace("#", "").trim()
	return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
const chromaOf = (lab: readonly number[]) => Math.hypot(lab[1], lab[2])

export type FamilyProbe = {
	hex: string
	familyId: string | null
	protoDist: number
	isRepresentative: boolean
	representativeCount: number
	nearestRepresentativeHex: string | null
	nearestRepresentativeDist: number
	// artwork-side statistics
	chroma: number
	familyChroma: number
	populationFraction: number
	largestComponentFraction: number
	familyConcentration: number
	componentCount: number
	repeatedComponentCount: number
	observedComponentCount: number
	markSupport: number
	markComponentCount: number
	localContrast: number
	edgeDensity: number
	borderCoverage: number
	centerCoverage: number
	spatialSpread: number
	// derived scores the algorithm reads
	signatureScore: number
	signatureAccentObservation: number
	signatureRoleScore: number
	foregroundScore: number
	fieldScore: number
	// distance to the field
	distToBg: number
	distToSurface: number
}

export async function probeArtwork(
	name: string,
	hexes: readonly string[],
	fieldHexes: { background: string; surface: string },
): Promise<{ path: string; pixelCount: number; probes: FamilyProbe[]; maxFamilyChroma: number; families: number }> {
	const path = resolveArtwork(name)
	if (!path) throw new Error(`unresolved artwork: ${name}`)
	const image = await loadNativeImage(path)
	const evidence = buildNativePaletteEvidence(image)
	const families = evidence.families
	const bgLab = rgbToOKLab(hexToRgb(fieldHexes.background))
	const suLab = rgbToOKLab(hexToRgb(fieldHexes.surface))
	const sigRole = (f: any) => Math.min(1, Math.max(0, 0.55 * f.signatureScore + 0.45 * f.signatureAccentObservation))

	const probes = hexes.map((hex): FamilyProbe => {
		const lab = rgbToOKLab(hexToRgb(hex))
		// owning family: the one with a representative equal to this hex; else nearest prototype
		let owner: any = null
		let isRep = false
		for (const f of families) {
			if (f.representatives.some((r: any) => r.hex.toLowerCase() === hex.toLowerCase())) { owner = f; isRep = true; break }
		}
		if (!owner) {
			let best = Infinity
			for (const f of families) {
				const d = okDistance(lab, f.prototype)
				if (d < best) { best = d; owner = f }
			}
		}
		let nearRep: any = null, nearRepD = Infinity
		for (const r of owner?.representatives ?? []) {
			const d = okDistance(lab, r.oklab)
			if (d < nearRepD) { nearRepD = d; nearRep = r }
		}
		return {
			hex,
			familyId: owner?.id ?? null,
			protoDist: owner ? okDistance(lab, owner.prototype) : NaN,
			isRepresentative: isRep,
			representativeCount: owner?.representatives.length ?? 0,
			nearestRepresentativeHex: nearRep?.hex ?? null,
			nearestRepresentativeDist: nearRepD,
			chroma: chromaOf(lab),
			familyChroma: owner?.chroma ?? NaN,
			populationFraction: owner?.populationFraction ?? NaN,
			largestComponentFraction: owner?.largestComponentFraction ?? NaN,
			familyConcentration: owner?.familyConcentration ?? NaN,
			componentCount: owner?.componentCount ?? NaN,
			repeatedComponentCount: owner?.repeatedComponentCount ?? NaN,
			observedComponentCount: owner?.observedComponentCount ?? NaN,
			markSupport: owner?.markSupport ?? NaN,
			markComponentCount: owner?.markComponentCount ?? NaN,
			localContrast: owner?.localContrast ?? NaN,
			edgeDensity: owner?.edgeDensity ?? NaN,
			borderCoverage: owner?.borderCoverage ?? NaN,
			centerCoverage: owner?.centerCoverage ?? NaN,
			spatialSpread: owner?.spatialSpread ?? NaN,
			signatureScore: owner?.signatureScore ?? NaN,
			signatureAccentObservation: owner?.signatureAccentObservation ?? NaN,
			signatureRoleScore: owner ? sigRole(owner) : NaN,
			foregroundScore: owner?.foregroundScore ?? NaN,
			fieldScore: owner?.fieldScore ?? NaN,
			distToBg: okDistance(lab, bgLab),
			distToSurface: okDistance(lab, suLab),
		}
	})
	return {
		path,
		pixelCount: image.width * image.height,
		probes,
		maxFamilyChroma: Math.max(...families.map((f: any) => f.chroma)),
		families: families.length,
	}
}
