// Track B diagnostic: which field hypothesis produced the winner, and what the
// band-local endpoint refinements looked like.
//
//   node --experimental-strip-types research/v2-3-experiments/track-b/diagnose-winner.ts <caseId>

import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, diagnoseGradientFits } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { buildBandLocalEndpointRefinements } from "../../v2-3/src/internal/endpoint-refinement.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"

const IMAGE_ROOTS = [
	process.env.IMAGE_ROOT,
	resolve(import.meta.dirname, "../../../images"),
	"/Users/Flo/github/palette/images",
].filter((value): value is string => typeof value === "string")

function locate(caseId: string): string {
	for (const root of IMAGE_ROOTS) {
		const path = resolve(root, caseId)
		if (existsSync(path)) return path
	}
	throw new Error(`image not found for ${caseId}`)
}

const caseId = process.argv[2]
if (!caseId) throw new Error("usage: diagnose-winner.ts <caseId>")

const image = await loadNativeImage(locate(caseId))
const details = extractPaletteDetails(image)
const winner = details.winner
console.log(`# ${caseId}`)
console.log(`winner id=${winner.id}`)
console.log(`  field hypothesis: ${winner.sourceFieldHypothesisId}`)
console.log(`  treatment=${winner.fieldTreatment} gradient=${winner.gradient} collapse=${JSON.stringify(winner.collapse)}`)
console.log(`  roles: bg=${winner.background.hex}(${winner.background.strategy}, ${winner.familyRoles.background}) surf=${winner.surface.hex}(${winner.surface.strategy}, ${winner.familyRoles.surface}) fg=${winner.foreground.hex} accent=${winner.accent.hex}`)
console.log(`  gradientEvidence=${winner.gradientEvidence ? `${winner.gradientEvidence.topology}/${winner.gradientEvidence.direction} span=${winner.gradientEvidence.span.toFixed(3)} endpointHexes=${winner.gradientEvidence.supportingEndpointHexes.join("/")}` : "null"}`)
console.log(`  midpoint=${details.midpoint.kind} ${details.midpoint.color?.hex ?? "-"}`)

const seed = buildPaletteSeedDomain(image)
const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
console.log(`\n## sourced field hypotheses (${common.fieldHypotheses.length})`)
for (const { sourceType, hypothesis } of common.fieldHypotheses) {
	const marker = hypothesis.id === winner.sourceFieldHypothesisId ? " <== WINNER" : ""
	console.log(`  [${sourceType}] ${hypothesis.kind} ${hypothesis.id} fidelity=${hypothesis.fieldFidelity.toFixed(3)}${marker}`)
	if (hypothesis.kind === "gradient-field" || marker) {
		console.log(`      bgReps=${hypothesis.backgroundRepresentatives.slice(0, 4).map(({ hex, strategy }) => `${hex}(${strategy})`).join(" ")}`)
		console.log(`      sfReps=${hypothesis.surfaceRepresentatives.slice(0, 4).map(({ hex, strategy }) => `${hex}(${strategy})`).join(" ")}`)
	}
}

const fits = diagnoseGradientFits(seed.evidence)
const refinements = buildBandLocalEndpointRefinements(seed.evidence, fits)
console.log(`\n## band-local endpoint refinements (${refinements.length}, accepted ${refinements.filter(({ accepted }) => accepted).length})`)
for (const refinement of refinements.slice(0, 10)) {
	console.log(`  ${refinement.id} accepted=${refinement.accepted} distance=${refinement.endpointDistance.toFixed(3)} occupiedModeDistance=${refinement.occupiedModeDistance.toFixed(3)}`)
	for (const side of ["low", "high"] as const) {
		const endpoint = refinement[side]
		if (!endpoint) {
			console.log(`    ${side}: null`)
			continue
		}
		console.log(`    ${side}: family=${endpoint.family.id} denseExact=${endpoint.representatives.denseExact.hex} popFrac=${endpoint.distribution.populationFraction.toFixed(4)} robustSpread=${endpoint.distribution.robustSpread.toFixed(4)}`)
	}
	if (refinement.rejectionReasons.length > 0) console.log(`    REJECT: ${refinement.rejectionReasons.join(" | ")}`)
}
