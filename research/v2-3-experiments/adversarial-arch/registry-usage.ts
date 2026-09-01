/**
 * Re-verification of the adversarial-logic review's finding 15 claim, before deleting the
 * all-ranked-lane discovery pass (`palette-core.ts:evidenceWithAllRankedLanes`).
 *
 * The pass exists solely to widen `buildSourceRegistry`'s `allProposals` argument. This counts,
 * per image, how many registry rows exist that no control proposal produced, and whether any
 * treatment or any lineage lookup actually depends on one.
 *
 *   node --no-warnings --experimental-strip-types \
 *     research/v2-3-experiments/adversarial-arch/registry-usage.ts [image...]
 */
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, fieldDirectionKey } from "../../v2-3/src/internal/palette-core.ts"

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url))
const imagesRoot = process.env.PALETTE_IMAGES_ROOT
	? resolve(process.env.PALETTE_IMAGES_ROOT)
	: resolve(repositoryRoot, "images")

const names = process.argv.slice(2).length > 0
	? process.argv.slice(2)
	: readdirSync(imagesRoot).filter((name) => /\.(jpg|jpeg|png|avif|webp)$/iu.test(name)).sort()

let totalNonControl = 0
let totalNonControlUsed = 0
let totalDirectionsNeedingNonControl = 0
let totalDirectionRowsOnlyNonControl = 0
let lineageDiffering = 0

for (const name of names) {
	const image = await loadNativeImage(readFileSync(resolve(imagesRoot, name)))
	const { registry, completeTreatments } = buildPaletteSeedDomain(image)
	const controlIds = new Set(registry.fieldHypotheses.filter(({ controlProposed }) => controlProposed)
		.map(({ hypothesisId }) => hypothesisId))
	const nonControl = registry.fieldHypotheses.filter(({ controlProposed }) => !controlProposed)
	const usedHypothesisIds = new Set(completeTreatments.map(({ sourceFieldHypothesisId }) => sourceFieldHypothesisId))
	const nonControlUsed = nonControl.filter(({ hypothesisId }) => usedHypothesisIds.has(hypothesisId))

	// A treatment's lineage resolves a field-direction row by (key, includes(its hypothesis id)).
	// The row is load-bearing for the all-lane pass only if the row a used treatment resolves to
	// would not exist without a non-control proposal.
	const usedDirectionKeys = new Set(completeTreatments.map((treatment) => fieldDirectionKey(treatment)))
	const directionsNeedingNonControl = registry.fieldDirections.filter(({ hypothesisIds }) =>
		hypothesisIds.some((id) => usedHypothesisIds.has(id) && !controlIds.has(id)))
	const directionRowsOnlyNonControl = registry.fieldDirections.filter(({ key, hypothesisIds }) =>
		usedDirectionKeys.has(key) && hypothesisIds.every((id) => !controlIds.has(id)))

	// The decisive test. `lineageFromClosedDomain` resolves a treatment's direction row by
	// (key === fieldDirectionKey(treatment)) AND (hypothesisIds includes the treatment's *own*
	// hypothesis id). Simulate that lookup against the registry as it is, and against the registry
	// with every non-control-only row removed, and compare the outcomes.
	const resolvesNow = completeTreatments.filter((treatment) => registry.fieldDirections.some(
		({ key, hypothesisIds }) => key === fieldDirectionKey(treatment) &&
			hypothesisIds.includes(treatment.sourceFieldHypothesisId))).length
	const resolvesWithoutNonControl = completeTreatments.filter((treatment) => registry.fieldDirections.some(
		({ key, hypothesisIds }) => key === fieldDirectionKey(treatment) &&
			hypothesisIds.filter((id) => controlIds.has(id)).includes(treatment.sourceFieldHypothesisId))).length
	if (resolvesNow !== resolvesWithoutNonControl) {
		console.log(`  !! ${name}: lineage resolution differs ${resolvesNow} -> ${resolvesWithoutNonControl}`)
	}
	lineageDiffering += resolvesNow === resolvesWithoutNonControl ? 0 : 1

	totalNonControl += nonControl.length
	totalNonControlUsed += nonControlUsed.length
	totalDirectionsNeedingNonControl += directionsNeedingNonControl.length
	totalDirectionRowsOnlyNonControl += directionRowsOnlyNonControl.length
	console.log(`${name.padEnd(30)} nonControl=${String(nonControl.length).padStart(5)}`
		+ ` used=${nonControlUsed.length}`
		+ ` dirNeedNonControl=${directionsNeedingNonControl.length}`
		+ ` usedDirRowsOnlyNonControl=${directionRowsOnlyNonControl.length}`)
}

console.log(`\n${names.length} image(s): non-control registry rows ${totalNonControl},`
	+ ` used by a treatment ${totalNonControlUsed},`
	+ ` direction rows a used treatment needs from non-control ${totalDirectionsNeedingNonControl},`
	+ ` used direction rows sourced only from non-control ${totalDirectionRowsOnlyNonControl}`)
console.log(`images whose lineage resolution would change without the non-control rows: ${lineageDiffering}`)
console.log(`\nNote: "used direction rows sourced only from non-control" (${totalDirectionRowsOnlyNonControl}) is`
	+ ` informational, not a dependency. Field directions are one row per key, so a row holding only`
	+ ` non-control ids means no control variant produced that key — and the lineage lookup also requires`
	+ ` the treatment's *own* (control) hypothesis id to be in the row, which such a row can never satisfy.`
	+ ` Those lookups already fail today and fail identically once the rows are gone.`)
console.log(totalNonControlUsed === 0 && totalDirectionsNeedingNonControl === 0 && lineageDiffering === 0
	? "VERDICT: the all-ranked-lane pass contributes no row any treatment or lineage reads."
	: "VERDICT: the all-ranked-lane pass IS load-bearing — do not delete.")
