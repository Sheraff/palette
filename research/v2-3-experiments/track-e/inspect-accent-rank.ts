import { APCAcontrast, sRGBtoY } from "apca-w3"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain } from "../../v2-3/src/internal/palette-core.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"

const clamp = (v: number): number => v < 0 ? 0 : v > 1 ? 1 : v
const MINIMUM_DISTINCT_DISTANCE = 0.12

function hexToRgb(hex: string): [number, number, number] {
	return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}
function apca(a: [number, number, number], b: [number, number, number]): number {
	return Number(APCAcontrast(sRGBtoY([a[0], a[1], a[2]]), sRGBtoY([b[0], b[1], b[2]])))
}
function supportQuality(support: Record<string, number>): number {
	return clamp(
		0.28 * clamp(support.perceptualDensity / 0.5) +
		0.22 * Math.max(clamp(support.totalSupport / 0.08), support.markSupport) +
		0.22 * Math.max(clamp(support.connectedSupport / 0.08), support.markSupport) +
		0.16 * support.spatialCoverage +
		0.12 * (1 - clamp(support.prototypeDistance / 0.06)),
	)
}
function okDistance(a: readonly number[], b: readonly number[]): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

const target = process.argv[2]
const image = await loadNativeImage(target)
const seed = buildPaletteSeedDomain(image)
const evidence = seed.evidence
const result = extractPaletteDetails(image)
const bg = hexToRgb(result.winner.background.hex)
const surf = hexToRgb(result.winner.surface.hex)
const fg = result.winner.foreground

const signatureIds = evidence.lanes.find(({ name }) => name === "signature")!.familyIds
console.log(`winner bg=${result.winner.background.hex} surf=${result.winner.surface.hex} fg=${fg.hex} acc=${result.winner.accent.hex}`)
console.log("\naccent ranking against the winner's own field/foreground (approximate: 2 field samples)")
console.log("family        hex      sigRole  sep    fidelity  supQual  utility  SCORE")
const rows: { line: string; score: number }[] = []
for (const id of signatureIds) {
	const family = evidence.families.find((f) => f.id === id)!
	const coherent = clamp(family.largestComponentFraction / 0.002)
	const sigScore = clamp(family.signatureScore + 0.25 * (Math.max(coherent, family.markSupport) - coherent))
	const sigRole = clamp(0.55 * sigScore + 0.45 * family.signatureAccentObservation)
	for (const rep of family.representatives) {
		if ("generated" in rep.support) continue
		const separation = clamp((okDistance(rep.oklab, fg.oklab) - MINIMUM_DISTINCT_DISTANCE) / 0.18)
		const fidelity = sigRole * Math.sqrt(separation)
		const sq = supportQuality(rep.support as never)
		const utility = clamp((Math.abs(apca(rep.rgb as never, bg)) + Math.abs(apca(rep.rgb as never, surf))) / 2 / 75)
		const score = 0.50 * fidelity + 0.25 * sq + 0.25 * utility
		rows.push({
			score,
			line: `${id.padEnd(13)} ${rep.hex}  ${sigRole.toFixed(3)}   ${separation.toFixed(3)}  ${fidelity.toFixed(3)}    ${sq.toFixed(3)}   ${utility.toFixed(3)}   ${score.toFixed(4)}`,
		})
	}
}
rows.sort((a, b) => b.score - a.score)
for (const r of rows) console.log(r.line)
