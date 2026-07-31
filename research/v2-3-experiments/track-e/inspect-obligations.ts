import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain } from "../../v2-3/src/internal/palette-core.ts"

const clamp = (v: number): number => v < 0 ? 0 : v > 1 ? 1 : v
const RES = 0.04
const level = (v: number): number => Math.floor((v + 1e-12) / RES)

for (const target of process.argv.slice(2)) {
	const image = await loadNativeImage(target)
	const seed = buildPaletteSeedDomain(image)
	const evidence = seed.evidence
	const sig = evidence.lanes.find(({ name }) => name === "signature")!.familyIds
	console.log(`\n=== ${target} ===`)
	console.log("obligations:")
	for (const o of seed.identityObligations) {
		const f = evidence.families.find((x) => x.id === o.familyId)!
		console.log(`  p${o.priority} ${o.familyId} ${f.representatives[0]?.hex} regionLvl=${o.source.regionEvidenceLevel} sigLvl=${o.source.signatureEvidenceLevel} connPop=${(o.source.connectedPopulationFraction * 100).toFixed(4)}% matDist=${o.source.materialDistanceFromField.toFixed(3)}`)
	}
	console.log("signature-lane families (obligation shortlist inputs):")
	const rows = sig.map((id) => {
		const f = evidence.families.find((x) => x.id === id)!
		const sigRole = clamp(0.55 * f.signatureScore + 0.45 * f.signatureAccentObservation)
		const conn = f.components.filter((c) => c.population > 1 && c.retainedFor.includes("role-observation"))
			.sort((a, b) => b.observation.signatureAccent.score - a.observation.signatureAccent.score)
		const fieldOwned = level(f.fieldScore) >= level(sigRole)
		return { id, hex: f.representatives[0]?.hex ?? "?", fieldOwned, best: conn[0]?.observation.signatureAccent.score ?? 0, sigRole, chroma: f.chroma, pop: f.populationFraction }
	})
	rows.sort((a, b) => level(b.best) - level(a.best) || level(b.sigRole) - level(a.sigRole))
	for (const r of rows) {
		console.log(`  ${r.id.padEnd(13)} ${r.hex} bestRegionSig=${r.best.toFixed(3)} lvl=${level(r.best)} sigRole=${r.sigRole.toFixed(3)} lvl=${level(r.sigRole)} chroma=${r.chroma.toFixed(3)} pop=${(r.pop * 100).toFixed(4)}%${r.fieldOwned ? "  [field-owned]" : ""}`)
	}
}
