// Track B diagnostic: what representatives each family exposes, which families carry an
// identity obligation, and what a family's own occupancy actually contains.
//
//   node --experimental-strip-types research/v2-3-experiments/track-b/diagnose-representatives.ts <caseId>

import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain } from "../../v2-3/src/internal/palette-core.ts"
import { analyzeBandPopulation } from "../../v2-3/src/internal/band-representative.ts"
import type { BandRepresentativeSample } from "../../v2-3/src/internal/band-representative.ts"
import { labAt, okDistance, rgbAt, rgbToHex } from "../../v2-3/src/internal/color.ts"
import type { OKLab } from "../../v2-3/src/internal/types.ts"

const IMAGE_ROOTS = [
	process.env.IMAGE_ROOT,
	resolve(import.meta.dirname, "../../../images"),
	"/Users/Flo/GitHub/palette/images",
].filter((value): value is string => typeof value === "string")
const REPO_ROOTS = [resolve(import.meta.dirname, "../../.."), "/Users/Flo/GitHub/palette"]

function locate(caseId: string): string {
	for (const root of caseId.includes("/") ? REPO_ROOTS : IMAGE_ROOTS) {
		const path = resolve(root, caseId)
		if (existsSync(path)) return path
	}
	throw new Error(`image not found for ${caseId}`)
}

const caseId = process.argv[2]
if (!caseId) throw new Error("usage: diagnose-representatives.ts <caseId>")

const image = await loadNativeImage(locate(caseId))
const seed = buildPaletteSeedDomain(image)
const evidence = seed.evidence
console.log(`# ${caseId}  binStep=${evidence.familyBinStep}  families=${evidence.families.length}`)

console.log(`\n## identity obligations (${seed.identityObligations.length})`)
for (const obligation of seed.identityObligations) {
	console.log(`  ${JSON.stringify(obligation).slice(0, 300)}`)
}

const obligationFamilyIds = new Set(
	seed.identityObligations.flatMap((obligation) => {
		const record = obligation as unknown as Record<string, unknown>
		const value = record.familyId ?? record.anchorFamilyId
		return typeof value === "string" ? [value] : []
	}),
)

// Whole-image occupancy per family, so a family's real internal spread is visible.
const familySamples = new Map<number, BandRepresentativeSample[]>()
for (let pixelIndex = 0; pixelIndex < evidence.pixelCount; pixelIndex++) {
	const familyIndex = evidence.familyAt[pixelIndex]
	const sample = { pixelIndex, lab: labAt(evidence.labs, pixelIndex) as OKLab }
	const bucket = familySamples.get(familyIndex)
	if (bucket) bucket.push(sample)
	else familySamples.set(familyIndex, [sample])
}

console.log(`\n## families by population (lanes: field/signature/foreground membership shown)`)
const laneOf = (familyId: string): string =>
	evidence.lanes.filter(({ familyIds }) => familyIds.includes(familyId)).map(({ name }) => name[0]).join("") || "-"

const ranked = [...familySamples.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 14)
for (const [familyIndex, samples] of ranked) {
	const family = evidence.families[familyIndex]
	const reps = family.representatives.map(({ hex, strategy }) => `${hex}(${strategy})`).join(" ")
	console.log(`\n  ${family.id}  pop=${(samples.length / evidence.pixelCount * 100).toFixed(2)}%  lanes=${laneOf(family.id)}  fieldScore=${family.fieldScore.toFixed(3)}${obligationFamilyIds.has(family.id) ? "  <== OBLIGATION" : ""}`)
	console.log(`    L=${family.prototype[0].toFixed(3)} representatives: ${reps}`)
	// What a lightness-stratified modal scan of this family's own occupancy would expose.
	const lightnesses = samples.map(({ lab }) => lab[0]).sort((a, b) => a - b)
	const low = lightnesses[Math.floor(lightnesses.length * 0.2)]
	const high = lightnesses[Math.floor(lightnesses.length * 0.8)]
	for (const [label, lowerBound, upperBound] of [
		["dark  ", lightnesses[0], low],
		["mid   ", low, high],
		["light ", high, lightnesses.at(-1)!],
	] as const) {
		const slice = samples.filter(({ lab }) => lab[0] >= lowerBound && lab[0] <= upperBound)
		if (slice.length === 0) continue
		const population = analyzeBandPopulation(slice, evidence)
		const representative = population.representative
		if (!representative) continue
		const rgb = rgbAt(evidence.rgbData, representative.pixelIndex)
		const distances = family.representatives.map((existing) =>
			okDistance(representative.lab, existing.oklab))
		console.log(`    ${label} stratum n=${String(slice.length).padStart(7)} modal=${rgbToHex(rgb)} L=${representative.lab[0].toFixed(3)} minDistToExistingReps=${Math.min(...distances).toFixed(4)} share=${(representative.neighborhoodShare * 100).toFixed(1)}%`)
	}
}
