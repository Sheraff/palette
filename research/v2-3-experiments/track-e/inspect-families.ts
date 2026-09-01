import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain } from "../../v2-3/src/internal/palette-core.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"

const target = process.argv[2]
if (!target) throw new Error("usage: inspect-families.ts <image-path> [--focus hex]")
const focus = process.argv.includes("--focus") ? process.argv[process.argv.indexOf("--focus") + 1] : null

const image = await loadNativeImage(target)
const seed = buildPaletteSeedDomain(image)
const evidence = seed.evidence
const lanes = new Map(evidence.lanes.map((lane) => [lane.name, new Set(lane.familyIds)]))

const rows = evidence.families.map((family) => {
	const rep = family.representatives[0]
	const foregroundRole = 0.60 * family.foregroundScore + 0.40 * family.foregroundTypographyObservation
	const signatureRole = 0.55 * family.signatureScore + 0.45 * family.signatureAccentObservation
	const bestTypo = Math.max(0, ...family.components.map((c) => c.observation.foregroundTypography.score))
	const bestSig = Math.max(0, ...family.components.map((c) => c.observation.signatureAccent.score))
	return {
		id: family.id,
		hex: rep?.hex ?? "n/a",
		reps: family.representatives.map((r) => r.hex).join("|"),
		popPct: (family.populationFraction * 100),
		chroma: family.chroma,
		L: family.prototype[0],
		field: family.fieldScore,
		sigS: family.signatureScore,
		sigObs: family.signatureAccentObservation,
		sigRole: signatureRole,
		fgS: family.foregroundScore,
		fgObs: family.foregroundTypographyObservation,
		fgRole: foregroundRole,
		comps: family.componentCount,
		repeats: family.repeatedComponentCount,
		lcf: family.largestComponentFraction,
		conc: family.familyConcentration,
		lc: family.localContrast,
		bestTypo,
		bestSig,
		obsComps: family.observedComponentCount,
		mark: family.markSupport,
		markN: family.markComponentCount,
		inField: lanes.get("field")?.has(family.id) ?? false,
		inSig: lanes.get("signature")?.has(family.id) ?? false,
		inFg: lanes.get("foreground")?.has(family.id) ?? false,
	}
})

rows.sort((a, b) => b.sigRole - a.sigRole)
const fmt = (n: number, d = 3): string => n.toFixed(d).padStart(d + 3)
console.log(`\n=== ${target} (${image.width}x${image.height}, ${evidence.families.length} families) ===`)
console.log("id            hex     pop%    chroma  L     field sigS  sigOb sigRl fgS   fgOb  fgRl  comp rep  lcf    conc  lc     bTyp  bSig  mark  mkN lanes")
for (const r of rows.slice(0, 30)) {
	console.log(
		`${r.id.padEnd(13)} ${r.hex.padEnd(8)}${fmt(r.popPct, 4)} ${fmt(r.chroma)} ${fmt(r.L)} ${fmt(r.field)} ${fmt(r.sigS)} ${fmt(r.sigObs)} ${fmt(r.sigRole)} ${fmt(r.fgS)} ${fmt(r.fgObs)} ${fmt(r.fgRole)} ${String(r.comps).padStart(4)} ${String(r.repeats).padStart(3)} ${fmt(r.lcf, 4)} ${fmt(r.conc)} ${fmt(r.lc, 4)} ${fmt(r.bestTypo)} ${fmt(r.bestSig)} ${fmt(r.mark)} ${String(r.markN).padStart(3)} ${r.inField ? "F" : "-"}${r.inSig ? "S" : "-"}${r.inFg ? "G" : "-"}`,
	)
}

if (focus) {
	const want = [parseInt(focus.slice(1, 3), 16), parseInt(focus.slice(3, 5), 16), parseInt(focus.slice(5, 7), 16)]
	let best: { id: string; hex: string; d: number } | null = null
	for (const family of evidence.families) {
		for (const rep of family.representatives) {
			const got = rep.rgb
			const d = Math.hypot(got[0] - want[0], got[1] - want[1], got[2] - want[2])
			if (!best || d < best.d) best = { id: family.id, hex: rep.hex, d }
		}
	}
	console.log(`\nnearest representative to ${focus}: ${best?.id} ${best?.hex} (rgb distance ${best?.d.toFixed(1)})`)
	const fam = evidence.families.find((f) => f.id === best!.id)!
	console.log(`  markSupport=${fam.markSupport.toFixed(3)} markComponents=${fam.markComponentCount}`)
	console.log(`family ${fam.id}: pop%=${(fam.populationFraction * 100).toFixed(4)} comps=${fam.componentCount} repeats=${fam.repeatedComponentCount} obsComps=${fam.observedComponentCount}`)
	console.log(`  sigScore=${fam.signatureScore.toFixed(3)} sigObs=${fam.signatureAccentObservation.toFixed(3)} fgScore=${fam.foregroundScore.toFixed(3)} fgObs=${fam.foregroundTypographyObservation.toFixed(3)}`)
	const top = [...fam.components].sort((a, b) => b.observation.signatureAccent.score - a.observation.signatureAccent.score).slice(0, 6)
	for (const c of top) {
		const o = c.observation
		console.log(`  region pop=${c.population} popFrac=${(c.populationFraction * 100).toFixed(4)}% box=${c.maxX - c.minX + 1}x${c.maxY - c.minY + 1} fill=${o.fill.toFixed(2)} rep=${o.repetition.toFixed(3)} lc=${o.localContrast.toFixed(3)} bi=${(o.borderContact).toFixed(3)} sig=${o.signatureAccent.score.toFixed(3)} typo=${o.foregroundTypography.score.toFixed(3)} geo=${o.signatureAccent.geometry.toFixed(3)} srcSup=${o.signatureAccent.sourceSupport.toFixed(3)} retained=${c.retainedFor.join("/")}`)
	}
}

const result = extractPaletteDetails(image)
console.log(`\nWINNER bg=${result.winner.background.hex} surf=${result.winner.surface.hex} fg=${result.winner.foreground.hex} acc=${result.winner.accent.hex} gradient=${result.winner.gradient} midpoint=${result.midpoint.color ?? "none"}`)
console.log(`  families: bg=${result.winner.familyRoles.background} surf=${result.winner.familyRoles.surface} fg=${result.winner.familyRoles.foreground} acc=${result.winner.familyRoles.accent}`)
