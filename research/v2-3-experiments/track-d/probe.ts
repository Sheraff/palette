// Track D discovery probe. Reports, per image: the field lane, the background field
// domains with their gate outcomes, and every gradient fit diagnostic.
// Evaluation-only.
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildNativePaletteEvidence, buildPaletteSeedDomain, diagnoseGradientFits } from "../../v2-3/src/internal/palette-core.ts"

const IMAGE_ROOT = process.env.PALETTE_IMAGE_ROOT ?? "/Users/Flo/github/palette/images"

for (const id of process.argv.slice(2)) {
	const image = await loadNativeImage(`${IMAGE_ROOT}/${id}`)
	const evidence = buildNativePaletteEvidence(image)
	console.log(`\n=== ${id} ${image.width}x${image.height} families=${evidence.families.length}`)
	const fieldLane = evidence.lanes.find(({ name }) => name === "field")!
	console.log(`field lane (${fieldLane.familyIds.length}):`)
	for (const familyId of fieldLane.familyIds) {
		const family = evidence.families.find(({ id: candidate }) => candidate === familyId)!
		console.log(`  ${familyId} pop=${(family.populationFraction * 100).toFixed(2)}% fieldScore=${family.fieldScore.toFixed(3)} border=${family.borderCoverage.toFixed(3)} concentration=${family.familyConcentration.toFixed(3)} edgeDensity=${family.edgeDensity.toFixed(3)} components=${family.componentCount}`)
	}
	const totalFieldPopulation = fieldLane.familyIds.reduce((sum, familyId) =>
		sum + evidence.families.find(({ id: candidate }) => candidate === familyId)!.populationFraction, 0)
	console.log(`  field-lane total population fraction = ${(totalFieldPopulation * 100).toFixed(2)}%`)

	const seed = buildPaletteSeedDomain(image)
	console.log(`domains (${seed.fieldDomains.length}), top 8 by population:`)
	for (const domain of seed.fieldDomains.slice(0, 8)) {
		console.log(`  ${domain.id} kind=${domain.kind} pop=${(domain.populationFraction * 100).toFixed(2)}% border=${domain.borderCoverage.toFixed(3)} quad=${domain.quadrantCoverage} corners=${domain.ownedCornerCount} wfs=${domain.weightedFieldScore.toFixed(3)} families=${domain.familyIds.length} eligible=${domain.eligible} ${domain.rejectionReasons.join("; ")}`)
	}
	const fits = diagnoseGradientFits(evidence)
	console.log(`gradient fits: ${fits.length}, accepted: ${fits.filter(({ rejectionReasons }) => rejectionReasons.length === 0).length}`)
	for (const fit of fits.slice(0, 10)) {
		console.log(`  ${fit.fieldDomainId} ${fit.topology}/${fit.direction} score=${fit.score.toFixed(3)} span=${fit.span.toFixed(3)} prog=${fit.progression.toFixed(3)} mono=${fit.monotonicity.toFixed(3)} resid=${fit.residual.toFixed(3)} tex=${fit.texture.toFixed(3)} ends=${fit.endpointHexes?.join("/") ?? "none"} :: ${fit.rejectionReasons.join("; ") || "ACCEPTED"}`)
	}
	console.log(`field hypotheses (${seed.fieldHypotheses.length}): ${seed.fieldHypotheses.filter(({ kind }) => kind === "gradient-field").length} gradient`)
	for (const hypothesis of seed.fieldHypotheses.filter(({ kind }) => kind === "gradient-field").slice(0, 6)) {
		console.log(`  ${hypothesis.id} fidelity=${hypothesis.fieldFidelity.toFixed(3)}`)
	}
}
