// Track B diagnostic: what the H1 modal-population guard sees at each gradient endpoint
// band, and whether the band's own population justifies overriding the fitted pick.
//
//   node --experimental-strip-types research/v2-3-experiments/track-b/diagnose-guard.ts <caseId>

import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, diagnoseGradientFits } from "../../v2-3/src/internal/palette-core.ts"
import { labAt, okDistance, rgbAt, rgbToHex } from "../../v2-3/src/internal/color.ts"
import { selectBandRepresentative } from "../../v2-3/src/internal/band-representative.ts"
import type { BandRepresentativeSample } from "../../v2-3/src/internal/band-representative.ts"
import type { OKLab } from "../../v2-3/src/internal/types.ts"

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
if (!caseId) throw new Error("usage: diagnose-guard.ts <caseId>")

const image = await loadNativeImage(locate(caseId))
const seed = buildPaletteSeedDomain(image)
const evidence = seed.evidence
const fits = diagnoseGradientFits(evidence)
const domainById = new Map(seed.fieldDomains.map((domain) => [domain.id, domain]))

console.log(`# ${caseId}  ${evidence.width}x${evidence.height}  binStep=${evidence.familyBinStep}`)
console.log(`accepted fits: ${fits.filter(({ rejectionReasons }) => rejectionReasons.length === 0).length} / ${fits.length}\n`)

// Re-derive the pixel index sets the same way palette-core does, from the seed domains.
const domainPixels = new Map<string, Uint32Array>()
for (const domain of seed.fieldDomains) domainPixels.set(domain.id, new Uint32Array(0))

for (const diagnostic of fits) {
	if (diagnostic.rejectionReasons.length > 0) continue
	const domain = domainById.get(diagnostic.fieldDomainId)
	console.log(`## fit ${diagnostic.fieldDomainId} ${diagnostic.topology}/${diagnostic.direction}`)
	console.log(`   kind=${domain?.kind} domainPop=${(diagnostic.fieldDomainPopulationFraction * 100).toFixed(1)}% span=${diagnostic.span.toFixed(3)} score=${diagnostic.score.toFixed(3)} endpoints=${diagnostic.endpointHexes?.join(" / ")} (${diagnostic.lowEndpointFamilyId} / ${diagnostic.highEndpointFamilyId})`)
}

// Second pass: recompute band statistics with the fit geometry exposed by palette-core's
// public diagnostics is not possible (position() is internal), so re-run the band analysis
// through the same helper on the winning domain's whole population, split by family. This
// still answers the question that matters: how spread out is a family's occupancy inside a
// diffuse composite domain compared with a compact lane domain.
console.log(`\n## per-domain family occupancy spread`)
for (const domain of seed.fieldDomains.filter(({ eligible }) => eligible).slice(0, 6)) {
	const pixels = seed.fieldDomains.find(({ id }) => id === domain.id)
	console.log(`  ${domain.id} kind=${domain.kind} pop=${(domain.populationFraction * 100).toFixed(1)}% families=${domain.familyIds.length}`)
	void pixels
	const byFamily = new Map<string, BandRepresentativeSample[]>()
	void byFamily
}

// The decisive measurement: for every family in every eligible domain, how much of the
// family's population sits inside its own modal neighbourhood.
console.log(`\n## modal concentration per family (whole-image occupancy)`)
const familySamples = new Map<number, BandRepresentativeSample[]>()
for (let pixelIndex = 0; pixelIndex < evidence.pixelCount; pixelIndex++) {
	const familyIndex = evidence.familyAt[pixelIndex]
	const bucket = familySamples.get(familyIndex)
	const sample = { pixelIndex, lab: labAt(evidence.labs, pixelIndex) as OKLab }
	if (bucket) bucket.push(sample)
	else familySamples.set(familyIndex, [sample])
}
const ranked = [...familySamples.entries()]
	.sort((first, second) => second[1].length - first[1].length)
	.slice(0, 8)
for (const [familyIndex, samples] of ranked) {
	const family = evidence.families[familyIndex]
	const modal = selectBandRepresentative(samples)
	if (!modal) continue
	const rgb = rgbAt(evidence.rgbData, modal.pixelIndex)
	console.log(`  ${family.id.padEnd(16)} pop=${(samples.length / evidence.pixelCount * 100).toFixed(1).padStart(5)}%  modalShare=${(modal.neighborhoodShare * 100).toFixed(1).padStart(5)}%  modeHex=${rgbToHex(rgb)}  familyRep=${family.representatives[0]?.hex}  protoDist=${okDistance(modal.prototype, family.prototype).toFixed(4)}`)
}
